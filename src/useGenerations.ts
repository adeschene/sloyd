import { useCallback, useRef, useState } from 'react';
import { runGeneration, RunFailed } from './generate/run';
import type { GenerateSettings } from './generate/prompt';
import { LlmError } from './llm/types';
import type { LlmClient } from './llm/types';
import { storage } from './storage/browser';

export type RunStatus = 'designing' | 'repairing' | 'ready' | 'failed' | 'cancelled';

export interface RunRow {
  key: number;
  letter: string | null;
  status: RunStatus;
  /** repairing: the round number. */
  round?: number;
  /** repairing: issues being fixed; ready: issues remaining. */
  issues?: number;
  projectId?: string;
  projectName?: string;
  error?: string;
  costUsd: number | null;
}

const LETTERS = ['A', 'B', 'C'];

/**
 * The batch of generation runs, owned by App so closing the dialog does not
 * cancel anything (spec §3.4).
 *
 * GENERATION NEVER ADOPTS A PROJECT (spec §3.3). Each finished design is
 * written with `createProject(doc, { activate: false })` and nothing else:
 * no switchToken bump, no replaceDocument, no store action. That is what
 * keeps it out of invariant 32 entirely — it cannot move the persisted
 * activeId — and what lets the user keep editing while runs are out.
 *
 * One batch at a time: `start` is a no-op while any run is live, which is
 * what makes a double-clicked Generate one batch.
 */
export function useGenerations(opts: { onCreated: (projectId: string) => void; onStorageVerdict: () => void }) {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [live, setLive] = useState(0);
  const liveRef = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const patch = (key: number, p: Partial<RunRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const start = useCallback((client: LlmClient, settings: GenerateSettings, count: 1 | 2 | 3) => {
    if (liveRef.current > 0) return;
    const ctl = new AbortController();
    controller.current = ctl;
    let authError: string | null = null;
    const keys = Array.from({ length: count }, (_, i) => Date.now() * 10 + i);
    setRows(keys.map((key, i) => ({ key, letter: count > 1 ? LETTERS[i] : null, status: 'designing', costUsd: null })));
    liveRef.current = count;
    setLive(count);

    keys.forEach((key, i) => {
      const letter = count > 1 ? LETTERS[i] : null;
      void (async () => {
        try {
          const out = await runGeneration(client, settings, ctl.signal, (p) =>
            patch(key, p.phase === 'designing' ? { status: 'designing' } : { status: 'repairing', round: p.round, issues: p.issues }));
          const costUsd = client.estimateCostUsd(out.usage);
          // A cancel that lands after the model answered but before the write
          // still means "write nothing" (spec §3.4).
          if (ctl.signal.aborted) {
            patch(key, authError ? { status: 'failed', error: authError, costUsd } : { status: 'cancelled', costUsd });
            return;
          }
          const name = letter ? `${out.doc.name} — ${letter}` : out.doc.name;
          const id = await storage.createProject({ ...out.doc, name }, { activate: false });
          optsRef.current.onStorageVerdict();
          if (!id) {
            patch(key, { status: 'failed', error: 'Could not save the project — storage is unavailable.', costUsd });
            return;
          }
          optsRef.current.onCreated(id);
          patch(key, { status: 'ready', projectId: id, projectName: name, issues: out.violations.length, costUsd });
        } catch (e) {
          if (e instanceof LlmError && e.kind === 'auth') {
            // Every sibling would fail identically — stop them, and say why on each.
            authError = e.message;
            ctl.abort();
          }
          const costUsd = e instanceof RunFailed ? client.estimateCostUsd(e.usage) : null;
          if (authError) patch(key, { status: 'failed', error: authError, costUsd });
          else if (e instanceof LlmError && e.kind === 'cancelled') patch(key, { status: 'cancelled', costUsd });
          else patch(key, { status: 'failed', error: e instanceof Error ? e.message : 'Unexpected error.', costUsd });
        } finally {
          liveRef.current -= 1;
          setLive(liveRef.current);
        }
      })();
    });
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);

  return { rows, live, start, cancel };
}
