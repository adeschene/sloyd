import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { formatLength } from '../units/length';
import { useStore } from '../store/store';
import { MAX_REPAIRS } from '../generate/run';
import { shownText } from '../document/designCheck';
import type { JointKind } from '../generate/joints/sites';
import type { JoineryRun } from '../useJoinery';
import { formatCost, formatCostRange } from '../generate/estimate';
import type { CostRange } from '../generate/estimate';

interface Props {
  hasKey: boolean; libraryAvailable: boolean;
  projectName: string; sites: string[]; model: string | null;
  /** Before-you-run range (fu 236): one call low, every repair round high. */
  estimate: CostRange | null;
  /** Why Add joinery will not run (angle-cuts spec §6), or null. */
  refusal: string | null;
  run: JoineryRun | null; live: boolean;
  /** The repair note, shown above Run when the project's joints are damaged (repair-joints). */
  repairNotice?: ReactNode;
  onRun: () => void; onCancel: () => void; onOpenProject: (id: string) => void;
  onOpenSettings: () => void; onClose: () => void;
}

export const NO_SITES = 'No joints to add — no parts meet end-to-face, face-to-edge, or crossing.';

// [singular, plural]; mortise and tenon does not pluralise. Butt is not a joint.
const WORDS: [JointKind, string, string][] = [
  ['mortise-tenon', 'mortise and tenon', 'mortise and tenon'],
  ['dado', 'dado', 'dados'],
  ['stopped-dado', 'stopped dado', 'stopped dados'],
  ['rabbet', 'rabbet', 'rabbets'],
  ['half-lap', 'half-lap', 'half-laps'],
];

function summary(applied: { joint: JointKind }[]): string {
  const parts: string[] = [];
  let total = 0;
  for (const [kind, one, many] of WORDS) {
    const n = applied.filter((a) => a.joint === kind).length;
    if (n === 0) continue;
    total += n;
    parts.push(`${n} ${n === 1 ? one : many}`);
  }
  return total === 0 ? 'No joints were added' : `${total} joint${total === 1 ? '' : 's'}: ${parts.join(', ')}`;
}

// Matches checkDesign's limit labels.
const AXIS_NAME = ['width', 'height', 'depth'] as const;

function statusText(r: JoineryRun): string {
  switch (r.status) {
    case 'choosing': return 'Choosing joints…';
    case 'repairing': return `Fixing ${r.issues} issue${r.issues === 1 ? '' : 's'} (round ${r.round}/${MAX_REPAIRS})…`;
    case 'retrying': return `Retrying (round ${r.round}/${MAX_REPAIRS})…`;
    case 'ready': return 'Done';
    case 'none': return NO_SITES;
    case 'cancelled': return 'Cancelled';
    case 'failed': return `Failed: ${r.error}`;
  }
}

/** Joinery's form and result. The run belongs to App (useJoinery), so closing this does not cancel it. */
export function JoineryDialog(p: Props) {
  // The project's units (metric display): the open project's, which joinery was started on.
  const units = useStore((s) => s.doc.units);
  const sheet = useRef<HTMLDivElement>(null);
  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.onClose]);

  const noSites = p.sites.length === 0;
  const blocked = p.refusal !== null;
  const canRun = !blocked && !noSites && !p.live && p.libraryAvailable;
  const out = p.run?.status === 'ready' ? p.run.outcome : undefined;
  const sizeLines = out
    ? AXIS_NAME.flatMap((name, i) => {
      const before = out.result.sizeBefore[i];
      const after = out.result.sizeAfter[i];
      return Math.abs(before - after) > 1e-9
        ? [`Overall ${name} now ${formatLength(after, units)} (was ${formatLength(before, units)})`] : [];
    })
    : [];
  const fallbackReason = out?.fallback?.replace(/\.$/, '');

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Add joinery">
      <div className="modal-sheet" ref={sheet} tabIndex={-1}>
        <h2>Add joinery</h2>
        <p>{`Choose joints for ${p.projectName}. The result is saved as a new project; this one is not changed.`}</p>
        {blocked ? <p className="field-error" role="status">{p.refusal}</p> : noSites ? <p className="field-error" role="status">{NO_SITES}</p> : (
          <ul className="generate-runs">
            {p.sites.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        )}
        {p.repairNotice}
        {!p.libraryAvailable && <p className="field-error" role="status">Add joinery is unavailable — storage is unavailable, so the result would have nowhere to go.</p>}
        {p.hasKey && !noSites && !blocked && (
          <p className="generate-plan">
            {p.model && <span>{`Model: ${p.model}`}</span>}
            {p.estimate !== null && <span className="generate-run-cost">{formatCostRange(p.estimate)}</span>}
          </p>
        )}

        {p.run && (
          <div className={`generate-run generate-run-${p.run.status}`}>
            <span className="generate-run-status">{statusText(p.run)}</span>
            {p.run.costUsd !== null && <span className="generate-run-cost">{formatCost(p.run.costUsd)}</span>}
          </div>
        )}
        {out && p.run && (
          <div className="joinery-result">
            <p>{`Saved as '${p.run.projectName}'`}</p>
            <p>{summary(out.result.applied)}</p>
            {fallbackReason !== undefined && <p>{`Joints chosen by built-in rules — the model call failed: ${fallbackReason}.`}</p>}
            {sizeLines.map((l) => <p key={l}>{l}</p>)}
            {(out.result.moved.length > 0 || out.result.trimmed.length > 0) && (
              <p>{[
                out.result.moved.length > 0 && `Moved relative to the rest: ${out.result.moved.join(', ')}.`,
                out.result.trimmed.length > 0 && `Trimmed: ${out.result.trimmed.join(', ')}.`,
              ].filter(Boolean).join(' ')}</p>
            )}
            {out.result.lowered > 0 && <p>{`The whole piece was lowered ${formatLength(out.result.lowered, units)} to sit on the floor again.`}</p>}
            {out.notes.map((n, i) => <p key={`n${i}`}>{n}</p>)}
            {out.preexisting.map((v, i) => <p key={`p${i}`}>{`Already in the original: ${shownText(v)}`}</p>)}
            {out.violations.map((v, i) => <p key={`v${i}`} className="field-error">{shownText(v)}</p>)}
          </div>
        )}

        <div className="modal-actions">
          {p.live && <button onClick={p.onCancel}>Cancel</button>}
          <button onClick={p.onClose}>Close</button>
          {p.run?.status === 'ready' && p.run.projectId && (
            <button aria-label={`Open ${p.run.projectName}`} onClick={() => p.onOpenProject(p.run!.projectId!)}>Open</button>
          )}
          {p.hasKey
            ? <button className="btn-primary" disabled={!canRun} onClick={p.onRun}>Add joinery</button>
            : <button className="btn-primary" onClick={p.onOpenSettings}>Set up your API key</button>}
        </div>
      </div>
    </div>
  );
}
