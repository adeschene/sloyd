import { useState } from 'react';
import { useStore } from '../store/store';
import { acrossOf, defaultHole, defaultShelfPinRow, holeFaults } from '../document/document';
import type { Board, CutFrom, Dimension, HoleFault, HoleRow } from '../document/document';
import { holeFaultText, holeLine } from '../document/holeText';
import { DimensionField } from './DimensionField';
import { CountField } from './CountField';
import { Popover } from './Popover';

const DIMS: Dimension[] = ['length', 'width', 'thickness'];
const cap = (d: string) => d[0]!.toUpperCase() + d.slice(1);
const end = (d: Dimension) => (d === 'length' ? 'end' : 'side');
const edgeName = (e: NonNullable<HoleFault['edge']>) => `the ${e.dim} ${e.side} ${end(e.dim)}`;

/** The refusal for an edit that ADDS a fault (spec §7, amended), worded per kind. */
function refusal(f: HoleFault, r: Omit<HoleRow, 'id'>, rowId: string): string {
  const n = f.index + 1;
  switch (f.kind) {
    case 'breaks-out': return `Puts hole ${n} past ${edgeName(f.edge!)} — move it in, or reduce the count or the spacing first.`;
    case 'off-flat': return `Puts hole ${n} where a cut has removed the wood — move it first.`;
    case 'meets-hole': return `Puts hole ${n} into ${f.other!.row === rowId ? `hole ${f.other!.index + 1}` : `hole ${f.other!.index + 1} of another row`} — move it or widen the spacing first.`;
    case 'too-deep': return `Deeper than the ${r.face} — use Through.`;
  }
}
/** The note for a fault the stored row already has (a later edit caused it), from THE fault words (holeText.ts). */
const note = (f: HoleFault, r: HoleRow) => { const t = holeFaultText(f, r); return `${t[0]!.toUpperCase()}${t.slice(1)} at this size.`; };
const key = (f: HoleFault) => `${f.index}:${f.kind}`;

function HoleRowView({ board, row, precision }: { board: Board; row: HoleRow; precision: number }) {
  const updateHoleRow = useStore((s) => s.updateHoleRow);
  const removeHoleRow = useStore((s) => s.removeHoleRow);
  const [error, setError] = useState<string | null>(null);
  const line = holeLine(board, row, precision);
  const stored = holeFaults(board, row);
  const across = acrossOf(row);
  const set = (patch: Partial<Omit<HoleRow, 'id'>>) => {
    let next: HoleRow = { ...row, ...patch };
    // A face change onto the row's direction swaps the two: the row keeps running along the old face dimension.
    if (next.along === next.face) next = { ...next, along: row.face };
    // Refused only when the edit ADDS a (hole, kind) fault the stored row lacks (spec §7, amended): a row a later
    // resize faulted can still be edited toward fitting.
    const had = new Set(stored.map(key));
    const added = holeFaults({ ...board, holes: board.holes.map((r) => (r.id === row.id ? next : r)) }, next).find((f) => !had.has(key(f)));
    if (added) { setError(refusal(added, next, row.id)); return; }
    setError(null);
    const { id: _id, ...rest } = next;
    updateHoleRow(board.id, row.id, rest);
  };
  return (
    <div className="cut">
      <div className="cut-head">
        <span className="cut-label">{row.count === 1 ? 'Hole' : `Row of ${row.count}`}</span>
        <button className="cut-remove" aria-label={`Remove hole row (${line})`} onClick={() => removeHoleRow(board.id, row.id)}>✕</button>
      </div>
      <p className="field-note">{line}</p>
      {stored.length > 0 && <p className="field-note" role="status">{note(stored[0]!, row)}{stored.length > 1 ? ` (${stored.length - 1} more)` : ''}</p>}
      <div className="field-grid field-grid-2">
        <div className="field field-wide">
          <label htmlFor={`hole-face-${row.id}`}>Face</label>
          <select id={`hole-face-${row.id}`} className="input" value={`${row.face}|${row.from}`} onChange={(e) => {
            const [face, from] = e.target.value.split('|') as [Dimension, CutFrom];
            set({ face, from });
          }}>
            {DIMS.flatMap((d) => (['min', 'max'] as const).map((s) => (
              <option key={`${d}|${s}`} value={`${d}|${s}`}>{d === 'length' ? `Length — ${s} end` : `${cap(d)} face — ${s} side`}</option>
            )))}
          </select>
        </div>
        <DimensionField label="Diameter" value={row.diameter} precision={precision} onCommit={(diameter) => set({ diameter })} />
        <div className="field">
          <label htmlFor={`hole-through-${row.id}`}>Through</label>
          <input id={`hole-through-${row.id}`} type="checkbox" checked={row.depth === 'through'}
            onChange={(e) => set({ depth: e.target.checked ? 'through' : board[row.face] / 2 })} />
        </div>
        {row.depth !== 'through' && (
          <DimensionField label="Depth" value={row.depth} precision={precision} onCommit={(depth) => set({ depth })} />
        )}
        <div className="field">
          <label htmlFor={`hole-along-${row.id}`}>Along</label>
          <select id={`hole-along-${row.id}`} className="input" value={row.along} onChange={(e) => set({ along: e.target.value as Dimension })}>
            {DIMS.filter((d) => d !== row.face).map((d) => <option key={d} value={d}>{cap(d)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`hole-from-${row.id}`}>From</label>
          <select id={`hole-from-${row.id}`} className="input" value={row.alongFrom} onChange={(e) => set({ alongFrom: e.target.value as CutFrom })}>
            <option value="min">{`${cap(row.along)} min ${end(row.along)}`}</option>
            <option value="max">{`${cap(row.along)} max ${end(row.along)}`}</option>
          </select>
        </div>
        <DimensionField label="First at" value={row.station} min={0} precision={precision} onCommit={(station) => set({ station })} />
        <CountField label="Count" value={row.count} onCommit={(count) => set({ count })} />
        {row.count > 1 && (
          <DimensionField label="Every" value={row.pitch} precision={Math.max(precision, 64)} onCommit={(pitch) => set({ pitch })} />
        )}
        <DimensionField label="In from" value={row.inset} min={0} precision={precision} onCommit={(inset) => set({ inset })} />
        <div className="field">
          <label htmlFor={`hole-side-${row.id}`}>Side</label>
          <select id={`hole-side-${row.id}`} className="input" value={row.acrossFrom} onChange={(e) => set({ acrossFrom: e.target.value as CutFrom })}>
            <option value="min">{`${cap(across)} min ${end(across)}`}</option>
            <option value="max">{`${cap(across)} max ${end(across)}`}</option>
          </select>
        </div>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/** The Holes section (holes spec §7, as amended): one row per stored HoleRow, and + Add hole ▾. */
export function Holes({ board, precision }: { board: Board; precision: number }) {
  const addHoleRows = useStore((s) => s.addHoleRows);
  // A preset whose default would fault on this part is withheld, not added and refused (AngleCuts' precedent).
  const fits = (r: Omit<HoleRow, 'id'> | null): r is Omit<HoleRow, 'id'> => {
    if (!r) return false;
    const probe = { ...r, id: '__preset' };
    return holeFaults({ ...board, holes: [...board.holes, probe] }, probe).length === 0;
  };
  const hole = defaultHole(board);
  const pins = defaultShelfPinRow(board);
  return (
    <>
      <h3>Holes{board.holes.length > 0 && <span className="h3-count"> · {board.holes.length}</span>}</h3>
      {board.holes.map((row) => <HoleRowView key={row.id} board={board} row={row} precision={precision} />)}
      <Popover className="add-hole" label={<>+ Add hole<span aria-hidden="true"> ▾</span></>} title="Add a hole"
        items={[
          ...(fits(hole) ? [{ label: 'Hole', detail: 'One bore, centred on the broad face', run: () => addHoleRows(board.id, [hole]) }] : []),
          ...(fits(pins) ? [{ label: 'Shelf-pin row', detail: '¼" pins every 32 mm along the length', run: () => addHoleRows(board.id, [pins]) }] : []),
        ]} />
    </>
  );
}
