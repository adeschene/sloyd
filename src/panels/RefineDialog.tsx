import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DETAIL_CAPS } from '../generate/prompt';
import type { Detail } from '../generate/prompt';
import { MAX_REPAIRS } from '../generate/run';
import type { RefineSettings } from '../generate/refine';
import type { RefineRun } from '../useRefine';
import { parseLimit } from './GenerateDialog';

interface Props {
  hasKey: boolean; libraryAvailable: boolean; projectName: string;
  /** Why the open design cannot be refined, or null (decided before any call). */
  refusal: string | null;
  /** Replaces the refusal text when the refusal is repairable (repair-joints). */
  repairNotice?: ReactNode;
  /** The open design has joinery cuts, so a joinery call may follow the model call. */
  joined: boolean;
  initialDetail: Detail; model: string | null;
  estimate: (s: RefineSettings) => number | null;
  run: RefineRun | null; live: boolean;
  onRun: (s: RefineSettings) => void; onCancel: () => void; onOpenProject: (id: string) => void;
  onOpenSettings: () => void; onClose: () => void;
}

export const CHANGES_SHOWN = 12;

function statusText(r: RefineRun): string {
  switch (r.status) {
    case 'designing': return 'Refining…';
    case 'joining': return 'Choosing joints…';
    case 'repairing': return `Fixing ${r.issues} issue${r.issues === 1 ? '' : 's'} (round ${r.round}/${MAX_REPAIRS})…`;
    case 'retrying': return `Retrying (round ${r.round}/${MAX_REPAIRS})…`;
    case 'ready': return 'Done';
    case 'cancelled': return 'Cancelled';
    case 'failed': return `Failed: ${r.error}`;
  }
}

/** Refine's form and result. The run belongs to App (useRefine), so closing this does not cancel it. */
export function RefineDialog(p: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const [instruction, setInstruction] = useState('');
  const [width, setWidth] = useState('');
  const [depth, setDepth] = useState('');
  const [height, setHeight] = useState('');
  const [detail, setDetail] = useState<Detail>(p.initialDetail);
  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.onClose]);

  const limits = { width: parseLimit(width), depth: parseLimit(depth), height: parseLimit(height) };
  const badLimit = Object.values(limits).some((v) => v === 'bad');
  const settings: RefineSettings | null = badLimit ? null : {
    instruction: instruction.trim(), width: limits.width as number | null, depth: limits.depth as number | null,
    height: limits.height as number | null, detail,
  };
  const canRun = p.refusal === null && settings !== null && settings.instruction !== '' && !p.live && p.libraryAvailable;
  const estimate = p.hasKey && settings ? p.estimate(settings) : null;
  const out = p.run?.status === 'ready' ? p.run.outcome : undefined;
  const field = (label: string, value: string, set: (v: string) => void) => (
    <div className="field generate-limit">
      <label htmlFor={`refine-${label}`}>{`Max ${label}`}</label>
      <input id={`refine-${label}`} className={`input${parseLimit(value) === 'bad' ? ' invalid' : ''}`}
        placeholder="no limit" value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Refine">
      <div className="modal-sheet" ref={sheet} tabIndex={-1}>
        <h2>Refine</h2>
        <p>{`Describe a change to ${p.projectName}. The result is saved as a new project; this one is not changed.`}</p>
        {p.refusal !== null ? (p.repairNotice ?? <p className="field-error" role="status">{p.refusal}</p>) : (
          <>
            <div className="field">
              <label htmlFor="refine-instruction">Instruction</label>
              <textarea id="refine-instruction" className="input" rows={3} value={instruction}
                placeholder="Make the legs 2in longer and add a lower shelf" onChange={(e) => setInstruction(e.target.value)} />
            </div>
            <div className="generate-limits">
              {field('width', width, setWidth)}
              {field('depth', depth, setDepth)}
              {field('height', height, setHeight)}
            </div>
            {badLimit && <p className="field-error" role="status">A max size is not a length — try 36, 3', or 914mm.</p>}
            <div className="field">
              <label htmlFor="refine-detail">Detail</label>
              <select id="refine-detail" className="input" value={detail} onChange={(e) => setDetail(e.target.value as Detail)}>
                {(Object.keys(DETAIL_CAPS) as Detail[]).map((d) => (
                  <option key={d} value={d}>{`${d[0]!.toUpperCase()}${d.slice(1)} (up to ${DETAIL_CAPS[d]} different parts)`}</option>
                ))}
              </select>
            </div>
          </>
        )}
        {!p.libraryAvailable && <p className="field-error" role="status">Refine is unavailable — storage is unavailable, so the result would have nowhere to go.</p>}
        {p.hasKey && p.refusal === null && (
          <p className="generate-plan">
            {p.model && <span>{`Model: ${p.model}`}</span>}
            {estimate !== null && <span className="generate-run-cost">{`≈ $${estimate.toFixed(2)}`}</span>}
            {p.joined && <span>plus a joinery call if new meetings appear</span>}
          </p>
        )}

        {p.run && (
          <div className={`generate-run generate-run-${p.run.status}`}>
            <span className="generate-run-status">{statusText(p.run)}</span>
            {p.run.costUsd !== null && <span className="generate-run-cost">{`≈ $${p.run.costUsd.toFixed(2)}`}</span>}
          </div>
        )}
        {out && p.run && (
          <div className="joinery-result">
            <p>{`Saved as '${p.run.projectName}'`}</p>
            <p>{`${out.violations.length} new issue${out.violations.length === 1 ? '' : 's'} · ${out.present.length} already present`}</p>
            {out.joints && <p>{`${out.joints.kept} joints kept · ${out.joints.chosen} chosen · ${out.joints.dropped} dropped`}</p>}
            {out.joints?.skipped.map((s, i) => <p key={`s${i}`}>{s}</p>)}
            {out.violations.map((v, i) => <p key={`v${i}`} className="field-error">{v.message}</p>)}
            {out.changes.length === 0 ? <p>No changes.</p> : (
              <ul className="generate-runs">
                {out.changes.slice(0, CHANGES_SHOWN).map((c, i) => <li key={i}>{c.text}</li>)}
              </ul>
            )}
            {out.changes.length > CHANGES_SHOWN && <p>{`and ${out.changes.length - CHANGES_SHOWN} more`}</p>}
          </div>
        )}

        <div className="modal-actions">
          {p.live && <button onClick={p.onCancel}>Cancel</button>}
          <button onClick={p.onClose}>Close</button>
          {p.run?.status === 'ready' && p.run.projectId && (
            <button aria-label={`Open ${p.run.projectName}`} onClick={() => p.onOpenProject(p.run!.projectId!)}>Open</button>
          )}
          {p.hasKey
            ? <button className="btn-primary" disabled={!canRun} onClick={() => settings && p.onRun(settings)}>Refine</button>
            : <button className="btn-primary" onClick={p.onOpenSettings}>Set up your API key</button>}
        </div>
      </div>
    </div>
  );
}
