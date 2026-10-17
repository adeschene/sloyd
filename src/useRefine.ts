import { useCallback, useRef, useState } from 'react';
import { runRefine, spentOnFailure } from './generate/run';
import type { RefineOutcome, RefineProgress } from './generate/run';
import type { RefineSettings } from './generate/refine';
import type { SloydDocument } from './document/document';
import { derivedName } from './document/names';
import { LlmError } from './llm/types';
import type { LlmClient } from './llm/types';
import { storage } from './storage';

export type RefineStatus = 'designing' | 'joining' | 'repairing' | 'retrying' | 'ready' | 'failed' | 'cancelled';
export interface RefineRun {
  status: RefineStatus; round?: number; issues?: number;
  /** The round belongs to the joinery call, not the design call (fu 242). */
  join?: boolean;
  projectId?: string; projectName?: string; outcome?: RefineOutcome;
  error?: string; costUsd: number | null;
}

/** `join` is set on EVERY patch, false included: patches merge into the run, so an omitted field would carry over. */
export const progressPatch = (p: RefineProgress): Partial<RefineRun> => {
  const join = p.stage === 'join';
  return p.phase === 'designing' ? { status: join ? 'joining' : 'designing', join }
    : p.phase === 'repairing' ? { status: 'repairing', round: p.round, issues: p.issues, join }
      : { status: 'retrying', round: p.round, join };
};

/**
 * One refine run, owned by App so closing the dialog does not cancel it.
 * NEVER ADOPTS (invariant 36): the result is written with
 * createProject(doc, { activate: false }) and nothing else. Open goes
 * through App's openProject.
 */
export function useRefine(opts: { onCreated: (id: string) => void; onStorageVerdict: () => void }) {
  const [run, setRun] = useState<RefineRun | null>(null);
  const [live, setLive] = useState(false);
  const liveRef = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const start = useCallback((client: LlmClient, doc: SloydDocument, settings: RefineSettings) => {
    if (liveRef.current) return;
    const ctl = new AbortController();
    controller.current = ctl;
    liveRef.current = true;
    setLive(true);
    setRun({ status: 'designing', costUsd: null });
    void (async () => {
      try {
        const out = await runRefine(client, doc, settings, ctl.signal, (p) => setRun((r) => (r ? { ...r, ...progressPatch(p) } : r)));
        if ('refused' in out) { setRun({ status: 'failed', error: out.refused.message, costUsd: null }); return; }
        const costUsd = client.estimateCostUsd(out.usage);
        // A cancel that lands after the model answered still means "write nothing".
        if (ctl.signal.aborted) { setRun({ status: 'cancelled', costUsd }); return; }
        const name = derivedName(doc.name, ' — refined');
        const id = await storage.createProject({ ...out.doc, name }, { activate: false });
        optsRef.current.onStorageVerdict();
        if (!id) { setRun({ status: 'failed', error: 'Could not save the project — storage is unavailable.', costUsd }); return; }
        optsRef.current.onCreated(id);
        setRun({ status: 'ready', projectId: id, projectName: name, outcome: out, costUsd });
      } catch (e) {
        const spentUsage = spentOnFailure(e);
        const costUsd = spentUsage ? client.estimateCostUsd(spentUsage) : null;
        if (e instanceof LlmError && e.kind === 'cancelled') setRun({ status: 'cancelled', costUsd });
        else setRun({ status: 'failed', error: e instanceof Error ? e.message : 'Unexpected error.', costUsd });
      } finally {
        liveRef.current = false;
        setLive(false);
      }
    })();
  }, []);

  const cancel = useCallback(() => controller.current?.abort(), []);
  const reset = useCallback(() => { if (!liveRef.current) setRun(null); }, []);
  return { run, live, start, cancel, reset };
}
