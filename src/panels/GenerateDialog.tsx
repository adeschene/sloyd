import { useEffect, useRef, useState } from 'react';
import { parseLength } from '../units/length';
import { MATERIALS } from '../document/types';
import { DETAIL_CAPS, STYLES } from '../generate/prompt';
import type { Detail, GenerateSettings, Style } from '../generate/prompt';
import { MAX_REPAIRS } from '../generate/run';
import type { PlanLine, RunRow } from '../useGenerations';

interface Props {
  hasKey: boolean;
  libraryAvailable: boolean;
  rows: RunRow[];
  live: number;
  plan: PlanLine | null;
  onGenerate: (s: GenerateSettings, count: 1 | 2 | 3) => void;
  onCancel: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

/** '' → null (no limit); a positive length → inches; anything else → 'bad'. */
function parseLimit(text: string): number | null | 'bad' {
  if (!text.trim()) return null;
  const v = parseLength(text);
  return v !== null && v > 0 ? v : 'bad';
}

function planText(plan: PlanLine, n: number): string {
  switch (plan.status) {
    case 'planning': return `Planning ${n} contrasting designs…`;
    case 'ready': return 'Concepts';
    case 'fallback': return 'Concepts unavailable — using built-in variations';
    case 'failed': return `Failed: ${plan.error}`;
    case 'cancelled': return 'Cancelled';
  }
}

function statusText(r: RunRow): string {
  switch (r.status) {
    case 'waiting': return 'Waiting for its concept…';
    case 'designing': return 'Designing…';
    case 'repairing': return `Fixing ${r.issues} issue${r.issues === 1 ? '' : 's'} (round ${r.round}/${MAX_REPAIRS})…`;
    case 'retrying': return `Retrying (round ${r.round}/${MAX_REPAIRS})…`;
    case 'ready': return r.issues ? `Ready · ${r.issues} issue${r.issues === 1 ? '' : 's'}` : 'Ready';
    case 'cancelled': return 'Cancelled';
    case 'failed': return `Failed: ${r.error}`;
  }
}

/**
 * The Generate form and its progress rows. The runs belong to App
 * (useGenerations), so closing this does not cancel them and reopening it
 * shows the same rows (spec §3.4). Form state is local and resets on reopen.
 */
export function GenerateDialog(p: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const [description, setDescription] = useState('');
  const [count, setCount] = useState<1 | 2 | 3>(1);
  const [width, setWidth] = useState('');
  const [depth, setDepth] = useState('');
  const [height, setHeight] = useState('');
  const [material, setMaterial] = useState('any');
  const [style, setStyle] = useState<Style>('any');
  const [detail, setDetail] = useState<Detail>('moderate');

  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p.onClose]);

  const limits = { width: parseLimit(width), depth: parseLimit(depth), height: parseLimit(height) };
  const badLimit = Object.values(limits).some((v) => v === 'bad');
  const canGenerate = description.trim() !== '' && !badLimit && p.live === 0 && p.libraryAvailable;

  const generate = () => {
    if (!canGenerate) return;
    p.onGenerate({
      description: description.trim(),
      width: limits.width as number | null,
      depth: limits.depth as number | null,
      height: limits.height as number | null,
      material, style, detail,
    }, count);
  };

  const limitField = (label: string, value: string, set: (v: string) => void) => (
    <div className="field generate-limit">
      <label htmlFor={`gen-${label}`}>{`Max ${label}`}</label>
      <input id={`gen-${label}`} className={`input${parseLimit(value) === 'bad' ? ' invalid' : ''}`}
        placeholder="no limit" value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Generate">
      <div className="modal-sheet" ref={sheet} tabIndex={-1}>
        <h2>Generate a prototype</h2>
        <div className="field">
          <label htmlFor="gen-description">Description</label>
          <textarea id="gen-description" className="input" rows={3} value={description}
            placeholder="A 36in-wide bookcase with five adjustable-looking shelves"
            onChange={(e) => setDescription(e.target.value)} />
        </div>
        <fieldset className="field generate-count">
          <legend>Generations</legend>
          {([1, 2, 3] as const).map((n) => (
            <label key={n}><input type="radio" name="gen-count" checked={count === n} onChange={() => setCount(n)} aria-label={String(n)} />{n}</label>
          ))}
        </fieldset>
        <div className="generate-limits">
          {limitField('width', width, setWidth)}
          {limitField('depth', depth, setDepth)}
          {limitField('height', height, setHeight)}
        </div>
        {badLimit && <p className="field-error" role="status">A max size is not a length — try 36, 3', or 914mm.</p>}
        <div className="field">
          <label htmlFor="gen-material">Primary material</label>
          <select id="gen-material" className="input" value={material} onChange={(e) => setMaterial(e.target.value)}>
            <option value="any">Any</option>
            {Object.entries(MATERIALS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="gen-style">Style</label>
          <select id="gen-style" className="input" value={style} onChange={(e) => setStyle(e.target.value as Style)}>
            {STYLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="gen-detail">Detail</label>
          <select id="gen-detail" className="input" value={detail} onChange={(e) => setDetail(e.target.value as Detail)}>
            {(Object.keys(DETAIL_CAPS) as Detail[]).map((d) => (
              <option key={d} value={d}>{`${d[0].toUpperCase()}${d.slice(1)} (up to ${DETAIL_CAPS[d]} parts)`}</option>
            ))}
          </select>
        </div>
        {!p.libraryAvailable && <p className="field-error" role="status">Generate is unavailable — storage is unavailable, so a design would have nowhere to go.</p>}

        {p.rows.length > 0 && (
          <>
            {p.plan && (
              <p className={`generate-plan generate-plan-${p.plan.status}`}>
                <span className="generate-run-status">{planText(p.plan, p.rows.length)}</span>
                {p.plan.costUsd !== null && <span className="generate-run-cost">{`≈ $${p.plan.costUsd.toFixed(2)}`}</span>}
              </p>
            )}
            <ul className="generate-runs">
              {p.rows.map((r) => (
                <li key={r.key} className={`generate-run generate-run-${r.status}`}>
                  {r.letter && <span className="generate-run-letter">{r.letter}</span>}
                  {r.concept && <span className="generate-run-concept">{r.concept}</span>}
                  <span className="generate-run-status">{statusText(r)}</span>
                  {r.costUsd !== null && <span className="generate-run-cost">{`≈ $${r.costUsd.toFixed(2)}`}</span>}
                  {r.status === 'ready' && r.projectId && (
                    <button aria-label={`Open ${r.projectName}`} onClick={() => p.onOpenProject(r.projectId!)}>Open</button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="modal-actions">
          {p.live > 0 && <button onClick={p.onCancel}>Cancel</button>}
          <button onClick={p.onClose}>Close</button>
          {p.hasKey
            ? <button className="btn-primary" disabled={!canGenerate} onClick={generate}>Generate</button>
            : <button className="btn-primary" onClick={p.onOpenSettings}>Set up your API key</button>}
        </div>
      </div>
    </div>
  );
}
