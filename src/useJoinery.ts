import { useCallback, useRef, useState } from 'react';
import { runJoinery } from './generate/run';
import type { JoineryOutcome, RunProgress } from './generate/run';
import type { SloydDocument } from './document/document';
import { LlmError } from './llm/types';
import type { LlmClient } from './llm/types';
import { storage } from './storage/browser';

export type JoineryStatus = 'choosing' | 'repairing' | 'retrying' | 'ready' | 'none' | 'failed' | 'cancelled';
export interface JoineryRun {
  status: JoineryStatus; round?: number; issues?: number;
  projectId?: string; projectName?: string; outcome?: JoineryOutcome;
  error?: string; costUsd: number | null;
}

const progressPatch = (p: RunProgress): Partial<JoineryRun> =>
  p.phase === 'designing' ? { status: 'choosing' }
    : p.phase === 'repairing' ? { status: 'repairing', round: p.round, issues: p.issues }
      : { status: 'retrying', round: p.round };

/**
 * One joinery run, owned by App so closing the dialog does not cancel it.
 * NEVER ADOPTS (invariant 36): the result is written with
 * createProject(doc, { activate: false }) and nothing else. Open goes
 * through App's openProject.
 */
export function useJoinery(opts: { onCreated: (id: string) => void; onStorageVerdict: () => void }) {
  const [run, setRun] = useState<JoineryRun | null>(null);
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const start = useCallback((client: LlmClient, doc: SloydDocument) => {
    if (liveRef.current) return;
    const ctl = new AbortController();
    controller.current = ctl;
    liveRef.current = true;
    setLive(true);
    setRun({ status: 'choosing', costUsd: null });
    void (async () => {
      try {
        const out = await runJoinery(client, doc, ctl.signal, (p) => setRun((r) => (r ? { ...r, ...progressPatch(p) } : r)));
        if ('noSites' in out) { setRun({ status: 'none', costUsd: null }); return; }
        const costUsd = client.estimateCostUsd(out.usage);
        if (ctl.signal.aborted) { setRun({ status: 'cancelled', costUsd }); return; }
        const name = `${doc.name} — joined`;
        const id = await storage.createProject({ ...out.result.doc, name }, { activate: false });
        optsRef.current.onStorageVerdict();
        if (!id) { setRun({ status: 'failed', error: 'Could not save the project — storage is unavailable.', costUsd }); return; }
        optsRef.current.onCreated(id);
        setRun({ status: 'ready', projectId: id, projectName: name, outcome: out, costUsd });
      } catch (e) {
        if (e instanceof LlmError && e.kind === 'cancelled') setRun({ status: 'cancelled', costUsd: null });
        else setRun({ status: 'failed', error: e instanceof Error ? e.message : 'Unexpected error.', costUsd: null });
      } finally {
        liveRef.current = false;
        setLive(false);
      }
    })();
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);
  return { run, live, start, cancel };
}
