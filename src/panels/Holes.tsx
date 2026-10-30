import { useEffect, useMemo, useState } from 'react';
import { useStore, HOLE_TILT_PAST_BOUND, HEAD_ON_TILT, headRefusal } from '../store/store';
import { formatLength, isMetric } from '../units/length';
import { acrossOf, mm, defaultHole, defaultShelfPinRow, defaultHingeCup, defaultCountersunkScrew, defaultCounterboredScrew, defaultCamLock, defaultCamBoltBore, displayNames, headReach, holeFaults, isTilted, legsUnder, retilt, socketStale, staleSocketOf, tiltDegrees, withinTiltBound, worldParts } from '../document/document';
import type { Board, CutFrom, Dimension, HeadKind, HoleFault, HoleRow } from '../document/document';
import { curveWord, distinctFaults, edgeName, endWord as end, faultKey as key, holeFaultText, holeLengthText, holeLine, holeTiltReadout, camPairLine, CAM_PAIR_ALONG, CAM_PAIR_ALONG_DIFFERS, CAM_PAIR_PARTIAL } from '../document/holeText';
import { camPairRows, camRowIds } from '../document/camBolt';
import { leans, slopeOf } from '../document/lean';
import { staleTenonOf } from '../document/tenonJoints';
import { tenonStale } from '../document/tenonText';
import { DimensionField } from './DimensionField';
import { CountField } from './CountField';
import { Popover } from './Popover';
import { AngleField } from './AngleField';

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
    case 'too-shallow': return 'Too shallow for its angle — deepen it, or use Through.';
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

/** The along-encoding fields a cam-and-bolt pair shares (spec §4.3). */
const SHARED_ALONG = ['alongFrom', 'station', 'count', 'pitch'] as const;
const flipEnd = (f: CutFrom): CutFrom => (f === 'min' ? 'max' : 'min');
/** The fields whose change re-reads the tilt (controller ruling T2c): the bit keeps its board-local line through
 *  `retilt` (the other entry side of the same face negates both slopes, final review F2), or, for a new face, the row is
 *  square again. Every other edit keeps the stored slopes. */
const FRAME_KEYS = ['face', 'from', 'along', 'alongFrom', 'acrossFrom'] as const;
/** A tilt key is stored only when non-zero (Global Constraints): an absent, zero or −0 slope leaves no key. */
function cleanTilt(r: HoleRow): HoleRow {
  const { tiltAlong, tiltAcross, ...rest } = r;
  return { ...rest, ...(tiltAlong ? { tiltAlong } : {}), ...(tiltAcross ? { tiltAcross } : {}) };
}
/** A head key is stored only when present (counterbores spec §3.1): `None` patches all four to undefined. */
function cleanHead(r: HoleRow): HoleRow {
  const out = { ...r };
  for (const k of ['head', 'headDiameter', 'headDepth', 'headAngle'] as const) if (out[k] === undefined) delete out[k];
  return out;
}
const HEAD_NONE = { head: undefined, headDiameter: undefined, headDepth: undefined, headAngle: undefined } as const;
/** The end (or side) a stored slope leans toward: a positive slope leans to the far one from its flag. Null at 0. */
const toward = (slope: number | undefined, from: CutFrom): CutFrom | null => (!slope ? null : slope > 0 ? flipEnd(from) : from);

function HoleRowView({ board, row }: { board: Board; row: HoleRow }) {
  const units = useStore((s) => s.doc.units);
  // Diameter and Every read as a hole is specified (spec R7), through the bench line's own formatter (holeText.ts).
  const diameterText = (v: number) => holeLengthText(v, units, 'diameter');
  const pitchText = (v: number) => holeLengthText(v, units, 'pitch');
  const updateHoleRows = useStore((s) => s.updateHoleRows);
  const removeHoleRow = useStore((s) => s.removeHoleRow);
  const [error, setError] = useState<string | null>(null);
  // A row of a WHOLE cam-and-bolt pair reads as the pair's one line (spec §6.3), whichever row it is.
  const pair = camPairRows(board).find((p) => p.cam.id === row.id || p.bolt.id === row.id);
  const line = pair ? camPairLine(board, pair.cam, pair.bolt, units) : holeLine(board, row, units);
  const stored = distinctFaults(holeFaults(board, row));
  const across = acrossOf(row);
  // The end / side a square slope will lean toward once typed (a zero slope has no direction to store): the far one from
  // the row's flag until the select names another. A stored slope's own direction always wins.
  const [endPick, setEndPick] = useState<CutFrom | null>(null);
  const [sidePick, setSidePick] = useState<CutFrom | null>(null);
  // A pick names an end of `along` and a side of the third dimension: a new `along` (or face) makes both meaningless.
  useEffect(() => { setEndPick(null); setSidePick(null); }, [row.along, row.face]);
  const tiltEnd = toward(row.tiltAlong, row.alongFrom) ?? endPick ?? flipEnd(row.alongFrom);
  const tiltSide = toward(row.tiltAcross, row.acrossFrom) ?? sidePick ?? flipEnd(row.acrossFrom);
  const deg = tiltDegrees(row);
  const readout = holeTiltReadout(row);
  /** Tries the edit: the refusal text when it is refused (nothing stored), else null. */
  const attempt = (patch: Partial<Omit<HoleRow, 'id'>>): string | null => {
    let next: HoleRow = { ...row, ...patch };
    // A face change onto the row's direction swaps the two: the row keeps running along the old face dimension.
    if (next.along === next.face) next = { ...next, along: row.face };
    // Angled holes §3.1 (ruling T2c, final review F2): an edit of the row's frame keeps the bit's board-local line (or
    // squares it for a new face); a typed tilt is written by its own field, never re-derived.
    if (FRAME_KEYS.some((k) => next[k] !== row[k])) next = retilt(row, next);
    next = cleanHead(cleanTilt(next));
    // The store's ONE bound, judged first so a steep pair reads as the bound, not as whatever fault it would cause.
    if (!withinTiltBound(next.tiltAlong ?? 0, next.tiltAcross ?? 0)) return HOLE_TILT_PAST_BOUND;
    // The store's head rules (counterbores spec §3.2), before the fault check: a head the loader would drop is never
    // judged as a hole. A tilt typed on a headed row reads as TILT_ON_HEAD.
    const headRefused = headRefusal(next, row.head !== undefined);
    if (headRefused) return headRefused;
    // Ruling R5: a single hole becoming a row gets a real pitch in the SAME edit (Every is hidden at count 1, and a
    // stored pitch of 0 would stack hole 2 on hole 1); the fault check below judges the seeded row.
    if (row.count === 1 && next.count > 1 && next.pitch < next.diameter) next = { ...next, pitch: seedPitch(next.diameter) };
    // Cam-and-bolt spec §4.3: a pair member's direction cannot change; its shared along fields move BOTH rows (the
    // partner takes all four, so the holes still line up), or the edit is refused on a partly paired row.
    const edits: { row: HoleRow; next: HoleRow }[] = [{ row, next }];
    if (camRowIds(board).has(row.id)) {
      if (next.along !== row.along) return CAM_PAIR_ALONG;
      if (SHARED_ALONG.some((k) => next[k] !== row[k])) {
        const p = camPairRows(board).find((q) => q.cam.id === row.id || q.bolt.id === row.id);
        const partner = p && (p.cam.id === row.id ? p.bolt : p.cam);
        if (!partner) return CAM_PAIR_PARTIAL;
        if (partner.along !== row.along) return CAM_PAIR_ALONG_DIFFERS;
        const { alongFrom, station, count, pitch } = next;
        edits.push({ row: partner, next: { ...partner, alongFrom, station, count, pitch } });
      }
    }
    // Refused only when the edit ADDS a (hole, kind) fault the stored row lacks (spec §7, amended): a row a later
    // resize faulted can still be edited toward fitting. Judged per row with every edited row replaced.
    const edited = new Map(edits.map((e) => [e.row.id, e.next]));
    const judged = { ...board, holes: board.holes.map((r) => edited.get(r.id) ?? r) };
    for (const e of edits) {
      const had = new Set(distinctFaults(holeFaults(board, e.row)).map(key));
      const added = holeFaults(judged, e.next).find((f) => !had.has(key(f)));
      if (added) return refusal(added, e.next, e.row.id);
    }
    const refused = updateHoleRows(board.id, edits.map((e) => { const { id: _id, ...rest } = e.next; return { rowId: e.row.id, next: rest }; })) ?? null;
    if (!refused) setError(null);
    return refused;
  };
  // Ruling R7: a typed field owns its refusal (DimensionField shows the returned text as ITS error, keeps the text and
  // focus, and no sibling's success clears it). A select or checkbox shows its refusal on the row (it stays on the
  // stored value, so the row-level alert can never sit beside a stale control).
  const field = (patch: Partial<Omit<HoleRow, 'id'>>): string | undefined => attempt(patch) ?? undefined;
  const set = (patch: Partial<Omit<HoleRow, 'id'>>) => { const r = attempt(patch); if (r) setError(r); };
  /** A typed magnitude (degrees) in its ONE slope, toward the end or side the select names; the other slope is kept
   *  exactly (degrees only in typed input: `slopeOf`). 0 removes the key. */
  const typedTilt = (k: 'tiltAlong' | 'tiltAcross', from: CutFrom, to: CutFrom, remember: (f: CutFrom) => void) => (d: number): string | undefined => {
    const refused = field({ [k]: (to === from ? -1 : 1) * slopeOf(d) });
    // A slope typed back to 0 keeps showing the direction it had (Task 9 review), until another is chosen.
    if (!refused) remember(to);
    return refused;
  };
  /** The select: a stored slope leans the other way by an exact negation; a square one remembers the choice. A refused
   *  flip is not remembered (the select stays on the stored direction). */
  const pickTilt = (k: 'tiltAlong' | 'tiltAcross', from: CutFrom, remember: (f: CutFrom) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const to = e.target.value as CutFrom;
    const slope = row[k];
    if (slope && toward(slope, from) !== to) {
      const r = attempt({ [k]: 0 - slope });
      if (r) { setError(r); return; }
    }
    remember(to);
  };
  const tilted = isTilted(row);
  const metric = isMetric(units);
  /** The Head select: the first choice of a kind seeds its numbers (spec §4); switching kind keeps the head's width. */
  const pickHead = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const kind = e.target.value as HeadKind | '';
    if (kind === '') { set(HEAD_NONE); return; }
    const headDiameter = row.headDiameter ?? 2 * row.diameter;
    if (kind === 'counterbore') {
      const headDepth = Math.min(row.diameter, (row.depth === 'through' ? board[row.face] : row.depth) / 2);
      set({ head: kind, headDiameter, headDepth, headAngle: undefined });
    } else {
      set({ head: kind, headDiameter, headAngle: metric ? 90 : 82, headDepth: undefined });
    }
  };
  const reach = headReach(row);
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
        <div className="field">
          <label htmlFor={`hole-head-${row.id}`}>Head</label>
          <select id={`hole-head-${row.id}`} className="input" value={row.head ?? ''} disabled={tilted && row.head === undefined} onChange={pickHead}>
            <option value="">None</option>
            <option value="counterbore">Counterbore</option>
            <option value="countersink">Countersink</option>
          </select>
        </div>
        {row.head !== undefined && (
          <DimensionField label="Head dia" value={row.headDiameter ?? null} units={units} format={diameterText} onCommit={(headDiameter) => field({ headDiameter })} />
        )}
        {row.head === 'counterbore' && (
          <DimensionField label="Head depth" value={row.headDepth ?? null} units={units} onCommit={(headDepth) => field({ headDepth })} />
        )}
        {row.head === 'countersink' && (
          <div className="field">
            <label htmlFor={`hole-angle-${row.id}`}>Angle</label>
            <select id={`hole-angle-${row.id}`} className="input" value={row.headAngle ?? 82} onChange={(e) => set({ headAngle: Number(e.target.value) as 82 | 90 })}>
              <option value={82}>82°</option>
              <option value={90}>90°</option>
            </select>
          </div>
        )}
        <AngleField label="Tilt toward end" value={Math.abs(deg.along)} max={45} min0 onCommit={typedTilt('tiltAlong', row.alongFrom, tiltEnd, setEndPick)} />
        <div className="field">
          <label htmlFor={`hole-tilt-end-${row.id}`}>Tilt end</label>
          <select id={`hole-tilt-end-${row.id}`} className="input" value={tiltEnd} onChange={pickTilt('tiltAlong', row.alongFrom, setEndPick)}>
            <option value="min">{`${cap(row.along)} min ${end(row.along)}`}</option>
            <option value="max">{`${cap(row.along)} max ${end(row.along)}`}</option>
          </select>
        </div>
        <AngleField label="Tilt toward side" value={Math.abs(deg.across)} max={45} min0 onCommit={typedTilt('tiltAcross', row.acrossFrom, tiltSide, setSidePick)} />
        <div className="field">
          <label htmlFor={`hole-tilt-side-${row.id}`}>Tilt side</label>
          <select id={`hole-tilt-side-${row.id}`} className="input" value={tiltSide} onChange={pickTilt('tiltAcross', row.acrossFrom, setSidePick)}>
            <option value="min">{`${cap(across)} min ${end(across)}`}</option>
            <option value="max">{`${cap(across)} max ${end(across)}`}</option>
          </select>
        </div>
      </div>
      {tilted && row.head === undefined && <p className="field-note">{HEAD_ON_TILT}</p>}
      {row.head === 'countersink' && reach !== null && <p className="field-note">{`Depth ${formatLength(reach, units)}`}</p>}
      {readout && <p className="field-note">{readout}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/** The Holes section (holes spec §7, as amended): one row per stored HoleRow, and + Add hole ▾. */
export function Holes({ board }: { board: Board }) {
  const addHoleRows = useStore((s) => s.addHoleRows);
  // The store's refusal of an add (a tilt past the bound; angled holes §3.1) shows here, as the panel's other refusals do.
  // A leaning part takes holes like any other (angled holes §7).
  const [error, setError] = useState<string | null>(null);
  // A refusal belongs to the part and lean it was made for: another part (or a lean change) retires it.
  const isLeaning = leans(board);
  useEffect(() => setError(null), [board.id, isLeaning]);
  const add = (rows: Omit<HoleRow, 'id'>[]) => setError(addHoleRows(board.id, rows));
  const units = useStore((s) => s.doc.units);
  // Bore leg sockets (angled holes spec §5): on an unleaned part with a leaning part standing under it. Derived in memos
  // over the document, never a selector returning an array (inv 43's lesson).
  const doc = useStore((s) => s.doc);
  const boreLegSockets = useStore((s) => s.boreLegSockets);
  const [socketDiameter, setSocketDiameter] = useState(1);
  // Round tenons spec §6.1: Tenon the legs, on by default; the same action then fits each leg's top tenon.
  const [tenonLegs, setTenonLegs] = useState(true);
  // The field refuses 0 and below itself (DimensionField's default "> 0" rule); while it shows a refusal the button does
  // not act on the stored value behind it (copy in a row's precedent, fu 218).
  const [diameterRefused, setDiameterRefused] = useState(false);
  const legs = useMemo(() => (isLeaning ? [] : legsUnder(worldParts(doc), board, units)), [doc, board, isLeaning, units]);
  const stale = useMemo(() => {
    if (legs.length === 0) return [];
    const names = displayNames(doc);
    return legs.filter((l) => staleSocketOf(board, l) !== null).map((l) => ({ id: l.id, text: socketStale(names.get(l.id) ?? l.name) }));
  }, [doc, board, legs]);
  // The stale socket note's tenon twin (round tenons spec §6.4): a leg found under this seat whose top tenon is not seated
  // in it.
  const staleTenons = useMemo(() => {
    if (legs.length === 0) return [];
    const names = displayNames(doc);
    return legs.filter((l) => staleTenonOf(board, l) !== null).map((l) => ({ id: l.id, text: tenonStale(names.get(l.id) ?? l.name) }));
  }, [doc, board, legs]);
  // A preset whose default would fault on this part is withheld, not added and refused (AngleCuts' precedent).
  const fits = (r: Omit<HoleRow, 'id'> | null): r is Omit<HoleRow, 'id'> => {
    if (!r) return false;
    const probe = { ...r, id: '__preset' };
    return holeFaults({ ...board, holes: [...board.holes, probe] }, probe).length === 0;
  };
  // A pair is judged with both rows on the board: a fitting Cam lock probes fault-free (holeFaults exempts a recognised pair).
  const fitsAll = (pair: [Omit<HoleRow, 'id'>, Omit<HoleRow, 'id'>] | null): pair is [Omit<HoleRow, 'id'>, Omit<HoleRow, 'id'>] => {
    if (!pair) return false;
    const probes = [{ ...pair[0], id: '__cam' }, { ...pair[1], id: '__bolt' }];
    const probed = { ...board, holes: [...board.holes, ...probes] };
    return probes.every((p) => holeFaults(probed, p).length === 0);
  };
  const hole = defaultHole(board);
  const pins = defaultShelfPinRow(board);
  const cup = defaultHingeCup(board);
  // A metric project reads the presets' inch sizes in mm, at the holes' 0.1 mm (presets minors 3); imperial text stays as written.
  const metric = isMetric(units);
  const pinText = metric && pins ? holeLengthText(pins.diameter, units, 'diameter') : '¼"';
  const cupDeep = metric && cup && cup.depth !== 'through' ? holeLengthText(cup.depth, units, 'diameter') : '½"';
  const screwDetail = (kind: 'sink' | 'bore', r: Omit<HoleRow, 'id'>) => {
    const dia = holeLengthText(r.diameter, units, 'diameter');
    const head = holeLengthText(r.headDiameter!, units, 'diameter');
    if (kind === 'sink') return `${metric ? dia : '3/16"'} screw, ${metric ? head : '3/8"'} countersink at ${r.headAngle}°`;
    const deep = holeLengthText(r.headDepth!, units, 'diameter');
    return `${metric ? dia : '3/16"'} screw, ${metric ? head : '3/8"'} counterbore ${metric ? deep : '3/8"'} deep`;
  };
  const sunk = defaultCountersunkScrew(board, metric);
  const bored = defaultCounterboredScrew(board, metric);
  const camLocks = (['min', 'max'] as const).map((e) => ({ e, pair: defaultCamLock(board, e) }));
  const camBore = defaultCamBoltBore(board);
  const items = [
    ...(fits(hole) ? [{ label: 'Hole', detail: 'One bore, centred on the broad face', run: () => add([hole]) }] : []),
    ...(fits(pins) ? [{ label: 'Shelf-pin row', detail: `${pinText} pins every 32 mm along the ${pins.along}`, run: () => add([pins]) }] : []),
    ...(fits(cup) ? [{ label: 'Hinge cup', detail: `35 mm cup, ${cupDeep} deep, 22.5 mm in from the edge`, run: () => add([cup]) }] : []),
    ...(fits(sunk) ? [{ label: 'Countersunk screw', detail: screwDetail('sink', sunk), run: () => add([sunk]) }] : []),
    ...(fits(bored) ? [{ label: 'Counterbored screw', detail: screwDetail('bore', bored), run: () => add([bored]) }] : []),
    ...camLocks.flatMap(({ e, pair }) => (fitsAll(pair)
      ? [{ label: `Cam lock, ${e} ${end('length')}`, run: () => add(pair),
        detail: `${holeLengthText(pair[0].diameter, units, 'diameter')} cam and ${holeLengthText(pair[1].diameter, units, 'diameter')} bolt bore, ${holeLengthText(pair[0].inset, units, 'diameter')} in from the ${e} ${end('length')}` }]
      : [])),
    ...(fits(camBore) ? [{ label: 'Cam bolt bore', detail: `${holeLengthText(camBore.diameter, units, 'diameter')} bore, ${holeLengthText(camBore.depth as number, units, 'diameter')} deep, centred on the broad face`, run: () => add([camBore]) }] : []),
  ];
  return (
    <>
      <h3>Holes{board.holes.length > 0 && <span className="h3-count"> · {board.holes.length}</span>}</h3>
      {board.holes.map((row) => <HoleRowView key={row.id} board={board} row={row} />)}
      {items.length > 0
        ? <Popover className="add-hole" label={<>+ Add hole<span aria-hidden="true"> ▾</span></>} title="Add a hole" items={items} />
        : <p className="field-note">No hole preset fits this part.</p>}
      {stale.map((n) => <p key={n.id} className="field-note" role="status">{n.text}</p>)}
      {staleTenons.map((n) => <p key={`tenon-${n.id}`} className="field-note" role="status">{n.text}</p>)}
      {legs.length > 0 && (
        <div className="field-grid field-grid-2">
          <DimensionField label="Socket diameter" value={socketDiameter} units={units} format={(v) => holeLengthText(v, units, 'diameter')}
            onCommit={(d) => { setSocketDiameter(d); }} onErrorChange={setDiameterRefused} />
          <div className="field">
            <label htmlFor={`tenon-legs-${board.id}`}>Tenon the legs (replaces their top tenons)</label>
            <input id={`tenon-legs-${board.id}`} type="checkbox" checked={tenonLegs} onChange={(e) => setTenonLegs(e.target.checked)} />
          </div>
          <button className="add-cut" disabled={diameterRefused} onClick={() => setError(boreLegSockets(board.id, socketDiameter, tenonLegs))}>Bore leg sockets</button>
        </div>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}
    </>
  );
}
