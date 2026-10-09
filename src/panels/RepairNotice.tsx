import type { RepairCheck } from '../generate/joints/repair';
import type { RepairRun } from '../useRepair';

export const REPAIR_NOTE = "This project's joints were doubled by a bug fixed on 2026-10-09: some parts carry duplicate cuts, or a mortise from another copy of their assembly.";
export const JOINERY_WARNING = 'Running joinery again on this project would add to the damage — repair it first.';

/** 'A', 'A and B', 'A, B and C'. */
export function nameList(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The repair note and its action, shown inside the Refine and Joinery dialogs (repair-joints spec §3). */
export function RepairNotice(p: {
  check: Exclude<RepairCheck, null>; context: 'refine' | 'joinery'; libraryAvailable: boolean;
  run: RepairRun | null; onRepair: () => void; onOpenProject: (id: string) => void;
}) {
  const { check, run } = p;
  if ('refused' in check) return <div className="repair-notice"><p className="field-error" role="status">{check.refused}</p></div>;
  return (
    <div className="repair-notice">
      <p role="status">{REPAIR_NOTE}</p>
      {p.context === 'joinery' && <p>{JOINERY_WARNING}</p>}
      {run?.status !== 'ready' && (
        <button disabled={!p.libraryAvailable || run?.status === 'saving'} onClick={p.onRepair}>Repair joints</button>
      )}
      {run?.status === 'failed' && <p className="field-error">{run.error}</p>}
      {run?.status === 'ready' && (
        <>
          <p>{`Saved as '${run.projectName}' — ${run.dropped} stray cut${run.dropped === 1 ? '' : 's'} removed.`}</p>
          {run.splits.map((names, i) => <p key={i}>{`${nameList(names)} no longer match, so they are no longer shared.`}</p>)}
          <button aria-label={`Open ${run.projectName}`} onClick={() => p.onOpenProject(run.projectId)}>Open</button>
        </>
      )}
    </div>
  );
}
