import { useCallback, useRef, useState } from 'react';
import { FALLBACK_CONCEPTS, planConcepts } from './generate/concepts';
import { runGeneration, RunFailed } from './generate/run';
import type { RunProgress } from './generate/run';
import type { Concept, GenerateSettings } from './generate/prompt';
import { LlmError } from './llm/types';
import type { LlmClient } from './llm/types';
import { storage } from './storage/browser';

export type RunStatus = 'waiting' | 'designing' | 'repairing' | 'retrying' | 'ready' | 'failed' | 'cancelled';

export interface RunRow {
  key: number;
  letter: string | null;
  status: RunStatus;
  /** repairing, retrying: the round number. */
  round?: number;
  /** repairing: issues being fixed; ready: issues remaining. */
  issues?: number;
  projectId?: string;
  projectName?: string;
  error?: string;
  costUsd: number | null;
  /** The batch concept's title (fu 164); absent for a batch of 1. */
  concept?: string;
}

export type PlanStatus = 'planning' | 'ready' | 'fallback' | 'failed' | 'cancelled';

/** The batch planning call's line in the dialog; null for a batch of 1. */
export interface PlanLine {
  status: PlanStatus;
  costUsd: number | null;
  error?: string;
}

const LETTERS = ['A', 'B', 'C'];

function progressPatch(p: RunProgress): Partial<RunRow> {
  switch (p.phase) {
    case 'designing': return { status: 'designing' };
    case 'repairing': return { status: 'repairing', round: p.round, issues: p.issues };
    case 'retrying': return { status: 'retrying', round: p.round, issues: undefined };
  }
}

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
 * A batch of 2–3 first makes ONE planning call (generate/concepts.ts) so each
 * run designs a different concept (fu 164); a rejected key or a cancel during
 * planning ends the batch before any run starts, anything else falls back to
 * built-in roles.
 *
 * One batch at a time: `start` is a no-op while any run is live, which is
 * what makes a double-clicked Generate one batch.
 */
export function useGenerations(opts: { onCreated: (projectId: string) => void; onStorageVerdict: () => void }) {
  const [rows, setRows] = useState<RunRow[]>([]);
  const [live, setLive] = useState(0);
  const [plan, setPlan] = useState<PlanLine | null>(null);
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
    const planning = count > 1;
    const keys = Array.from({ length: count }, (_, i) => Date.now() * 10 + i);
    setRows(keys.map((key, i) => ({
      key, letter: planning ? LETTERS[i] : null, status: planning ? 'waiting' : 'designing', costUsd: null,
    })));
    setPlan(planning ? { status: 'planning', costUsd: null } : null);
    // Live from the click, through planning, to the last run — one batch at a time.
    liveRef.current = count;
    setLive(count);

    /** Ends every row at once — planning stopped the batch before any run began. */
    const endAll = (p: Partial<RunRow>) => {
      setRows((rs) => rs.map((r) => ({ ...r, ...p })));
      liveRef.current = 0;
      setLive(0);
    };

    const runOne = (key: number, letter: string | null, concept: Concept | undefined) => {
      void (async () => {
        try {
          const out = await runGeneration(client, settings, ctl.signal, (p) => patch(key, progressPatch(p)), concept);
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
    };

    void (async () => {
      let concepts: readonly (Concept | undefined)[] = keys.map(() => undefined);
      if (planning) {
        let out: Awaited<ReturnType<typeof planConcepts>> | null = null;
        try {
          out = await planConcepts(client, settings, count, ctl.signal);
        } catch (e) {
          if (e instanceof LlmError && e.kind === 'auth') {
            setPlan({ status: 'failed', costUsd: null, error: e.message });
            endAll({ status: 'failed', error: e.message });
            return;
          }
          if (e instanceof LlmError && e.kind === 'cancelled') {
            setPlan({ status: 'cancelled', costUsd: null });
            endAll({ status: 'cancelled' });
            return;
          }
          // Anything else: the fallback IS the retry (variety spec §4).
          concepts = FALLBACK_CONCEPTS.slice(0, count);
          setPlan({ status: 'fallback', costUsd: null });
        }
        if (out) {
          concepts = out.concepts ?? FALLBACK_CONCEPTS.slice(0, count);
          setPlan({ status: out.concepts ? 'ready' : 'fallback', costUsd: client.estimateCostUsd(out.usage) });
        }
        // A cancel that lands as planning resolves still means "start nothing".
        // Checked HERE, before any run — the post-run guard would hide started
        // runs from a nothing-was-written check, not stop them spending.
        if (ctl.signal.aborted) {
          setPlan((p) => (p ? { ...p, status: 'cancelled' } : p));
          endAll({ status: 'cancelled' });
          return;
        }
        setRows((rs) => rs.map((r, i) => ({ ...r, concept: concepts[i]?.title, status: 'designing' })));
      }
      keys.forEach((key, i) => runOne(key, planning ? LETTERS[i] : null, concepts[i]));
    })();
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);

  return { rows, live, plan, start, cancel };
}
