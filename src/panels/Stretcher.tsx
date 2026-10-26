import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { displayNames, worldParts } from '../document/document';
import type { Board } from '../document/document';
import { defaultHeight, rungSize, rungTenon, stretcherOf, stretcherPlan } from '../document/stretchers';
import { ADD_STRETCHER, FIT_STRETCHER, STRETCHER_FIELDS, STRETCHER_HEADING, stretcherReadout, stretcherStale } from '../document/stretcherText';
import { holeLengthText } from '../document/holeText';
import { DimensionField } from './DimensionField';

/** The link notes of the last successful Add (spec §4): shown in the rung's own panel while that rung is selected and the
 *  document is the one the Add made. Held by `Properties`, which outlives the switch from the multi-selection panel (the
 *  Add selects the rung) to the single-part one. */
export interface AddedStretcher { rung: string; doc: unknown; notes: string[] }

/**
 * The Stretcher section (stretchers spec §4), in the multi-selection panel when exactly two upright parts are selected
 * (the caller decides; inside its `EditLock`, inv 47). Height defaults through `defaultHeight` for this pair and diameter
 * until a Height is typed; Rung size and Tenon diameter to `rungSize` / `rungTenon`. Every refusal is the store's
 * (`addStretcher`, over the ONE planner), shown verbatim as the section's alert, cleared by any field change; the caller
 * remounts the section on a selection change (GroupProperties' key), which clears it too.
 *
 * The link notes come from the planner's own `notes`: `stretcherPlan` over the SAME document object the store then reads,
 * called in the same tick, so they cannot disagree with what the store wrote (the store's return stays `string | null`).
 */
export function StretcherSection({ legIds, onAdded }: { legIds: [string, string]; onAdded: (added: AddedStretcher) => void }) {
  const doc = useStore((s) => s.doc);
  const units = doc.units;
  const addStretcher = useStore((s) => s.addStretcher);
  const [typedHeight, setTypedHeight] = useState<number | null>(null);
  const [typedSize, setTypedSize] = useState<number | null>(null);
  const [typedDiameter, setTypedDiameter] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One flag per field: while any field shows a refusal, Add does not act on the value behind it (fu 218's precedent).
  const [refused, setRefused] = useState({ height: false, size: false, diameter: false });
  const size = typedSize ?? rungSize(units);
  const diameter = typedDiameter ?? rungTenon(units);
  const [a, b] = legIds;
  // Up to 20 trial plans: a memo over the document, the pair and the diameter, never a selector.
  const fallback = useMemo(() => defaultHeight(doc, [a, b], diameter), [doc, a, b, diameter]);
  const height = typedHeight ?? fallback;
  const commit = (set: (v: number) => void) => (v: number) => { set(v); setError(null); };
  const flag = (k: keyof typeof refused) => (r: boolean) => setRefused((f) => (f[k] === r ? f : { ...f, [k]: r }));
  const add = () => {
    const before = useStore.getState().doc;
    const plan = stretcherPlan(before, [a, b], { height, size, diameter });
    const r = addStretcher([a, b], height, size, diameter);
    setError(r);
    const after = useStore.getState();
    if (r === null && typeof plan !== 'string' && after.doc !== before) {
      onAdded({ rung: after.selectedIds[0]!, doc: after.doc, notes: plan.notes });
    }
  };
  return (
    <>
      <h3>{STRETCHER_HEADING}</h3>
      <div className="field-grid field-grid-3">
        <DimensionField label={STRETCHER_FIELDS.height} value={height} units={units} commitUnchanged
          onCommit={commit(setTypedHeight)} onErrorChange={flag('height')} />
        <DimensionField label={STRETCHER_FIELDS.size} value={size} units={units}
          onCommit={commit(setTypedSize)} onErrorChange={flag('size')} />
        <DimensionField label={STRETCHER_FIELDS.diameter} value={diameter} units={units} format={(v) => holeLengthText(v, units, 'diameter')}
          onCommit={commit(setTypedDiameter)} onErrorChange={flag('diameter')} />
      </div>
      <button className="add-cut" disabled={refused.height || refused.size || refused.diameter} onClick={add}>{ADD_STRETCHER}</button>
      {error && <p className="field-error" role="alert">{error}</p>}
    </>
  );
}

/**
 * The rung's readout (stretchers spec §4), under Round tenons in the single-part panel: shown only when `stretcherOf`
 * finds the part a stretcher (structurally, every time; nothing stored says so). `Between …` when both tenons are seated,
 * else the stale sentence and Fit the stretcher again, whose refusal is the store's (`fitStretcher`), shown as an alert
 * until the part object changes. Lengths through `units/length.ts` with the document's units (inv 52); names as the
 * planner names them (`displayNames`). Derived in a memo over the document, never a selector returning an object (inv 43).
 */
export function StretcherReadout({ board, notes }: { board: Board; notes: readonly string[] }) {
  const doc = useStore((s) => s.doc);
  const fitStretcher = useStore((s) => s.fitStretcher);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setError(null), [board]);
  const found = useMemo(() => {
    const f = stretcherOf(worldParts(doc), board);
    if (!f) return null;
    const names = displayNames(doc);
    const [a, b] = f.legs.map((l) => names.get(l.id) ?? l.name) as [string, string];
    return { seated: f.seated, text: f.seated ? stretcherReadout(a, b, f.height, f.gap, doc.units) : stretcherStale(a, b) };
  }, [doc, board]);
  if (!found) return null;
  return (
    <>
      <h3>{STRETCHER_HEADING}</h3>
      <p className="field-note" role={found.seated ? undefined : 'status'}>{found.text}</p>
      {notes.map((n) => <p key={n} className="link-note">{n}</p>)}
      {!found.seated && <button className="add-cut" onClick={() => setError(fitStretcher(board.id))}>{FIT_STRETCHER}</button>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </>
  );
}
