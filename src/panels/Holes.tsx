import { useEffect, useState } from 'react';
import { useStore } from '../store/store';
import { isMetric } from '../units/length';
import { acrossOf, mm, defaultHole, defaultShelfPinRow, defaultHingeCup, holeFaults } from '../document/document';
import type { Board, CutFrom, Dimension, HoleFault, HoleRow } from '../document/document';
import { curveWord, distinctFaults, edgeName, endWord as end, faultKey as key, holeFaultText, holeLengthText, holeLine } from '../document/holeText';
import { leans } from '../document/lean';
import { DimensionField } from './DimensionField';
import { CountField } from './CountField';
import { Popover } from './Popover';

const DIMS: Dimension[] = ['length', 'width', 'thickness'];
const cap = (d: string) => d[0]!.toUpperCase() + d.slice(1);

/** The refusal for an edit that ADDS a fault (spec §7, amended), worded per kind. */
function refusal(f: HoleFault, r: Omit<HoleRow, 'id'>, rowId: string): string {
  const n = f.index + 1;
  switch (f.kind) {
    case 'breaks-out': return f.curve ? `Puts hole ${n} into ${curveWord(f.curve)} — move it first.` : `Puts hole ${n} past ${edgeName(f.edge!)} — move it in, or reduce the count or the spacing first.`;
    case 'off-flat': return `Puts hole ${n} where a cut has removed the wood — move it first.`;
    case 'meets-hole': return `Puts hole ${n} into ${f.other!.row === rowId ? `hole ${f.other!.index + 1}` : `hole ${f.other!.index + 1} of another row`} — move it or widen the spacing first.`;
    case 'too-deep': return `Deeper than the ${r.face} — use Through.`;
  }
}
/** The note for a fault the stored row already has (a later edit caused it), from THE fault words (holeText.ts). */
const note = (f: HoleFault, r: HoleRow) => { const t = holeFaultText(f, r); return `${t[0]!.toUpperCase()}${t.slice(1)} at this size.`; };
/** The pitch a single hole takes when its count first rises (ruling R5): 32 mm, or twice the diameter for a bore 32 mm
 *  or wider, so hole 2 is not stacked on hole 1. */
const seedPitch = (diameter: number) => (mm(32) > diameter ? mm(32) : 2 * diameter);

/** The depth a row takes when Through is unchecked: half the face dimension (3/8" in 3/4" stock), at most 1/2" — an
 *  end-grain row in a 30" rail would otherwise seed a 15" bore. */
const throughSeed = (faceDim: number) => Math.min(faceDim / 2, 0.5);

function HoleRowView({ board, row }: { board: Board; row: HoleRow }) {
  const units = useStore((s) => s.doc.units);
  // Diameter and Every read as a hole is specified (spec R7), through the bench line's own formatter (holeText.ts).
  const diameterText = (v: number) => holeLengthText(v, units, 'diameter');
  const pitchText = (v: number) => holeLengthText(v, units, 'pitch');
  const updateHoleRow = useStore((s) => s.updateHoleRow);
  const removeHoleRow = useStore((s) => s.removeHoleRow);
  const [error, setError] = useState<string | null>(null);
  const line = holeLine(board, row, units);
  const stored = distinctFaults(holeFaults(board, row));
  const across = acrossOf(row);
  /** Tries the edit: the refusal text when it is refused (nothing stored), else null. */
  const attempt = (patch: Partial<Omit<HoleRow, 'id'>>): string | null => {
    let next: HoleRow = { ...row, ...patch };
    // A face change onto the row's direction swaps the two: the row keeps running along the old face dimension.
    if (next.along === next.face) next = { ...next, along: row.face };
    // Ruling R5: a single hole becoming a row gets a real pitch in the SAME edit (Every is hidden at count 1, and a
    // stored pitch of 0 would stack hole 2 on hole 1); the fault check below judges the seeded row.
    if (row.count === 1 && next.count > 1 && next.pitch < next.diameter) next = { ...next, pitch: seedPitch(next.diameter) };
    // Refused only when the edit ADDS a (hole, kind) fault the stored row lacks (spec §7, amended): a row a later
    // resize faulted can still be edited toward fitting.
    const had = new Set(stored.map(key));
    const added = holeFaults({ ...board, holes: board.holes.map((r) => (r.id === row.id ? next : r)) }, next).find((f) => !had.has(key(f)));
    if (added) return refusal(added, next, row.id);
    setError(null);
    const { id: _id, ...rest } = next;
    updateHoleRow(board.id, row.id, rest);
    return null;
  };
  // Ruling R7: a typed field owns its refusal (DimensionField shows the returned text as ITS error, keeps the text and
  // focus, and no sibling's success clears it). A select or checkbox shows its refusal on the row (it stays on the
  // stored value, so the row-level alert can never sit beside a stale control).
  const field = (patch: Partial<Omit<HoleRow, 'id'>>): string | undefined => attempt(patch) ?? undefined;
  const set = (patch: Partial<Omit<HoleRow, 'id'>>) => { const r = attempt(patch); if (r) setError(r); };
  return (
    <div className="cut">
      <div className="cut-head">
        <span className="cut-label hole-label">{row.count === 1 ? 'Hole' : `Row of ${row.count}`}</span>
        <button className="cut-remove" aria-label={`Remove hole row (${line})`} onClick={() => removeHoleRow(board.id, row.id)}>✕</button>
      </div>
      <p className="field-note">{line}</p>
      {stored.length > 0 && <p className="field-note" role="status">{note(stored[0]!, row)}{stored.length > 1 ? ` (and ${stored.length - 1} more)` : ''}</p>}
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
        <DimensionField label="Diameter" value={row.diameter} units={units} format={diameterText} onCommit={(diameter) => field({ diameter })} />
        <div className="field">
          <label htmlFor={`hole-through-${row.id}`}>Through</label>
          <input id={`hole-through-${row.id}`} type="checkbox" checked={row.depth === 'through'}
            onChange={(e) => set({ depth: e.target.checked ? 'through' : throughSeed(board[row.face]) })} />
        </div>
        {row.depth !== 'through' && (
          <DimensionField label="Depth" value={row.depth} units={units} onCommit={(depth) => field({ depth })} />
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
        <DimensionField label="First at" value={row.station} min={0} units={units} onCommit={(station) => field({ station })} />
        <CountField label="Count" value={row.count} onCommit={(count) => field({ count })} />
        {row.count > 1 && (
          <DimensionField label="Every" value={row.pitch} units={units} format={pitchText} onCommit={(pitch) => field({ pitch })} />
        )}
        <DimensionField label="In from" value={row.inset} min={0} units={units} onCommit={(inset) => field({ inset })} />
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
export function Holes({ board }: { board: Board }) {
  const addHoleRows = useStore((s) => s.addHoleRows);
  // The store refuses a hole on a leaning part (splayed legs spec §8); its text shows here, as the panel's other refusals do.
  const [error, setError] = useState<string | null>(null);
  // A refusal belongs to the part and lean it was made for: Clear lean (or another part) retires it.
  const isLeaning = leans(board);
  useEffect(() => setError(null), [board.id, isLeaning]);
  const add = (rows: Omit<HoleRow, 'id'>[]) => setError(addHoleRows(board.id, rows));
  const units = useStore((s) => s.doc.units);
  // A preset whose default would fault on this part is withheld, not added and refused (AngleCuts' precedent).
  const fits = (r: Omit<HoleRow, 'id'> | null): r is Omit<HoleRow, 'id'> => {
    if (!r) return false;
    const probe = { ...r, id: '__preset' };
    return holeFaults({ ...board, holes: [...board.holes, probe] }, probe).length === 0;
  };
  const hole = defaultHole(board);
  const pins = defaultShelfPinRow(board);
  const cup = defaultHingeCup(board);
  // A metric project reads the presets' inch sizes in mm, at the holes' 0.1 mm (presets minors 3); imperial text stays as written.
  const metric = isMetric(units);
  const pinText = metric && pins ? holeLengthText(pins.diameter, units, 'diameter') : '¼"';
  const cupDeep = metric && cup && cup.depth !== 'through' ? holeLengthText(cup.depth, units, 'diameter') : '½"';
  const items = [
    ...(fits(hole) ? [{ label: 'Hole', detail: 'One bore, centred on the broad face', run: () => add([hole]) }] : []),
    ...(fits(pins) ? [{ label: 'Shelf-pin row', detail: `${pinText} pins every 32 mm along the ${pins.along}`, run: () => add([pins]) }] : []),
    ...(fits(cup) ? [{ label: 'Hinge cup', detail: `35 mm cup, ${cupDeep} deep, 22.5 mm in from the edge`, run: () => add([cup]) }] : []),
  ];
  return (
    <>
      <h3>Holes{board.holes.length > 0 && <span className="h3-count"> · {board.holes.length}</span>}</h3>
      {board.holes.map((row) => <HoleRowView key={row.id} board={board} row={row} />)}
      {items.length > 0
        ? <Popover className="add-hole" label={<>+ Add hole<span aria-hidden="true"> ▾</span></>} title="Add a hole" items={items} />
        : <p className="field-note">No hole preset fits this part.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </>
  );
}
