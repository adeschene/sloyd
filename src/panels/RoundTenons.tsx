import { useMemo, useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { flatDocument } from '../document/document';
import type { Board, RoundTenon } from '../document/document';
import { defaultTenon, tenonAt, tenonFaults } from '../document/roundTenons';
import { tenonJoints } from '../document/tenonJoints';
import { shoulderFromFarEnd, tenonFaultText } from '../document/tenonText';
import { holeLengthText } from '../document/holeText';
import { formatLength, isMetric } from '../units/length';
import { DimensionField } from './DimensionField';

type End = RoundTenon['end'];
const ENDS: readonly End[] = ['min', 'max'];

/**
 * The end words (round tenons spec §4): an upright part's length runs up the world Y, never reversed (`axisFrame`'s Y
 * entry), so its min end is the bottom and its max end the top; any other part's ends are named as the Holes panel names
 * them (`Length min end`). `title` heads the row; `phrase` follows "from the" in the readout.
 */
function endWords(b: Board, end: End): { title: string; phrase: string } {
  if (b.posture === 'upright') return end === 'min' ? { title: 'Bottom', phrase: 'bottom' } : { title: 'Top', phrase: 'top' };
  return { title: `Length ${end} end`, phrase: `length ${end} end` };
}
const other = (end: End): End => (end === 'min' ? 'max' : 'min');

/** One stored tenon's controls (every hook above every branch: AngleCuts' crash class). */
function TenonControls({ board, tenon, seatedIn }: { board: Board; tenon: RoundTenon; seatedIn: string | null }) {
  const units = useStore((s) => s.doc.units);
  const updateTenon = useStore((s) => s.updateTenon);
  const removeTenon = useStore((s) => s.removeTenon);
  // Every refusal is the store's (decided before edit(): refused only when the edit ADDS a fault), returned to the field
  // as ITS error, the typed text and focus kept (DimensionField's contract, holes ruling R7).
  const attempt = (patch: Partial<Omit<RoundTenon, 'id' | 'end'>>): string | undefined =>
    updateTenon(board.id, tenon.id, { end: tenon.end, diameter: tenon.diameter, length: tenon.length, ...patch }) ?? undefined;
  // A fault the stored tenon already has (a later resize, or a feature added in its zone, caused it): KEPT, noted, and the
  // tenon builds nothing until it is fixed (spec §7) — this note is what says so.
  const kept = useMemo(() => tenonFaults(board, tenon), [board, tenon]);
  return (
    <>
      <div className="field-grid field-grid-2">
        <DimensionField label="Diameter" value={tenon.diameter} units={units} format={(v) => holeLengthText(v, units, 'diameter')}
          onCommit={(diameter) => attempt({ diameter })} />
        <DimensionField label="Length" value={tenon.length} units={units} onCommit={(length) => attempt({ length })} />
      </div>
      <p className="field-note">{`Shoulder ${formatLength(shoulderFromFarEnd(board, tenon), units)} from the ${endWords(board, other(tenon.end)).phrase}`}</p>
      {seatedIn !== null && <p className="field-note">{`Seated in ${seatedIn}'s socket.`}</p>}
      {kept.length > 0 && (
        <p className="field-note" role="status">{tenonFaultText(kept[0]!)}{kept.length > 1 ? ` (and ${kept.length - 1} more)` : ''}</p>
      )}
      <div className="row">
        <button onClick={() => removeTenon(board.id, tenon.id)}>Remove</button>
      </div>
    </>
  );
}

/** One end's row: its tenon's controls, or Add round tenon with the spec §4 default. */
function TenonEnd({ board, end, seatedIn }: { board: Board; end: End; seatedIn: string | null }) {
  const units = useStore((s) => s.doc.units);
  const addTenon = useStore((s) => s.addTenon);
  const [error, setError] = useState<string | null>(null);
  // A refusal belongs to the part AS IT WAS when it was made: any change to the part object (another part, an edit, an
  // undo) retires it. A refused Add leaves the part object untouched, so its own alert stays.
  useEffect(() => setError(null), [board]);
  const tenon = tenonAt(board, end);
  const words = endWords(board, end);
  const metric = isMetric(units);
  // The default (spec §4); one the store would refuse on this part is withheld, not added and then refused (AngleCuts'
  // precedent), and the row says why with the ONE fault text. Memoised per part object and units: Properties re-renders
  // on every store change, and each step down is a full `tenonFaults`.
  const { proposal, withheld } = useMemo(() => {
    if (tenonAt(board, end)) return { proposal: null, withheld: null };
    const p = defaultTenon(board, end, metric);
    if (p === null) return { proposal: null, withheld: tenonFaultText({ kind: 'too-wide' }) };
    const f = tenonFaults(board, { id: '__default', ...p })[0];
    return { proposal: p, withheld: f ? tenonFaultText(f) : null };
  }, [board, end, metric]);
  return (
    <div className="cut" role="group" aria-label={`${words.title} tenon`}>
      <div className="cut-head"><span className="cut-label">{words.title}</span></div>
      {tenon
        ? <TenonControls board={board} tenon={tenon} seatedIn={seatedIn} />
        : withheld !== null
          ? <p className="field-note">{withheld}</p>
          : <button className="add-cut" onClick={() => setError(addTenon(board.id, end, proposal!.diameter, proposal!.length))}>Add round tenon</button>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/**
 * The Round tenons section (round tenons spec §4), after Holes: one row per end of the part's length. Every decision is
 * the store's (`addTenon`, `updateTenon`, `removeTenon`) over the ONE fault decider (`tenonFaults`); the words are
 * `tenonText.ts`'. Seated comes from `tenonJoints` over the flat document, in a memo over the document (never a selector
 * returning an array, inv 43's lesson).
 */
export function RoundTenons({ board }: { board: Board }) {
  const doc = useStore((s) => s.doc);
  const seated = useMemo(() => {
    const out = new Map<string, string>();
    if (!board.tenons) return out;
    const flat = flatDocument(doc);
    for (const j of tenonJoints(flat)) {
      if (flat.boards[j.a]?.id === board.id) out.set(j.tenon, flat.boards[j.b]!.name);
    }
    return out;
  }, [doc, board]);
  const count = board.tenons?.length ?? 0;
  return (
    <>
      <h3>Round tenons{count > 0 && <span className="h3-count"> · {count}</span>}</h3>
      {ENDS.map((end) => {
        const t = tenonAt(board, end);
        return <TenonEnd key={end} board={board} end={end} seatedIn={t ? seated.get(t.id) ?? null : null} />;
      })}
    </>
  );
}
