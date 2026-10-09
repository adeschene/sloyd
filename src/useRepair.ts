import { useCallback, useRef, useState } from 'react';
import type { SloydDocument } from './document/document';
import { repairDocument } from './generate/joints/repair';
import { storage } from './storage/browser';

export type RepairRun =
  | { status: 'saving' }
  | { status: 'ready'; projectId: string; projectName: string; dropped: number; splits: string[][] }
  | { status: 'failed'; error: string };

/**
 * The repair action's state (repair-joints spec §3). Writes only via createProject(…, { activate:
 * false }) (invariant 36); opening the result is App's openProject. No model call, so no key.
 */
export function useRepair(opts: { onCreated: (id: string) => void; onStorageVerdict: () => void }) {
  const [run, setRun] = useState<RepairRun | null>(null);
  const busy = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const repair = useCallback(async (doc: SloydDocument) => {
    if (busy.current) return;
    busy.current = true;
    setRun({ status: 'saving' });
    try {
      const r = repairDocument(doc);
      if (r === null || 'refused' in r) { setRun({ status: 'failed', error: r === null ? 'Nothing to repair.' : r.refused }); return; }
      const name = `${doc.name} — repaired`;
      const id = await storage.createProject({ ...r.doc, name }, { activate: false });
      optsRef.current.onStorageVerdict();
      if (!id) { setRun({ status: 'failed', error: 'Could not save the project — storage is unavailable.' }); return; }
      optsRef.current.onCreated(id);
      setRun({ status: 'ready', projectId: id, projectName: name, dropped: r.dropped, splits: r.splits });
    } catch (e) {
      // repairDocument's write-back or the storage write threw: say so, as useRefine does, rather than
      // leave the run on 'saving' (its button disabled) for the session.
      setRun({ status: 'failed', error: e instanceof Error ? e.message : 'Unexpected error.' });
    } finally {
      busy.current = false;
    }
  }, []);
  const reset = useCallback(() => setRun(null), []);
  return { run, repair, reset };
}
