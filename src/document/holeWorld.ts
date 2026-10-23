import type { Board, CutFrom, Dimension, HoleRow } from './types';
import { axisDimensions, boardExtents, endFacing, fromWorldOffset, toWorldOffset } from './geometry';
import { HOLE_COUNT_MAX, HOLE_EPS, HOLE_KEYS, acrossOf, holeInstances } from './holes';
import { DIRS, dirToLocal, localToDir } from './taperWorld';
import type { Vec3, WorldHoleRow } from './generated';

/**
 * Hole rows in WORLD words (AI-holes spec §3): the design schema's form. The ONE place a design hole row crosses to a
 * stored `HoleRow` and back. Directions go through `dirToLocal`/`localToDir`, offsets through `toWorldOffset`/
 * `fromWorldOffset` (inv 44). Distances from a part's min or max face WITHIN its own frame (`station`, `inset`) are the
 * stored encoding (as `holeInstances` reads them), not a part↔world crossing. Model-facing text only (no `→ units`):
 * every number in a fault is decimal inches.
 */

type Row = Omit<HoleRow, 'id'>;
const AXES = 'xyz';
/** How far off its face plane a design offset may sit and still be put on it (spec §3.1). */
const PLANE_TOLERANCE = 1 / 32;
const vec = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];

/**
 * The hole grid (spec §3.1): the nearer of the 1/64in grid and a whole millimetre, ties imperial. A mm value is
 * DIVIDED by 25.4, as `parseLength` and the hole presets store one, so 32 mm here is the same number as a typed "32mm".
 */
export function holeSnap(v: number): number {
  const imperial = Math.round(v * 64) / 64;
  const metric = Math.round(v * 25.4) / 25.4;
  return Math.abs(metric - v) < Math.abs(imperial - v) ? metric : imperial;
}

/** HOLE_FIELDS order: strings lexicographically, numbers numerically, `'through'` after every number. */
export function sortHoleRows<T extends Row>(rows: T[]): T[] {
  const cmp = (x: T, y: T) => {
    for (const k of HOLE_KEYS) {
      const p = x[k];
      const q = y[k];
      if (p === q) continue;
      if (typeof p === 'number' && typeof q === 'number') return p - q;
      if (typeof p === 'number') return -1;
      if (typeof q === 'number') return 1;
      return String(p) < String(q) ? -1 : 1;
    }
    return 0;
  };
  return [...rows].sort(cmp);
}

/** The world axis (0..2) that carries `dim` on `b`. */
const axisOfDim = (b: Board, dim: Dimension) => axisDimensions(b).indexOf(dim);

/**
 * Design rows → stored rows on `b` (oriented), canonical (`alongFrom: 'min'` unless only the max end gives a legal
 * station; `acrossFrom` the nearer side, ties min, unless the centre is past it) and sorted by HOLE_FIELDS; or the first SHAPE fault, as a phrase the caller prefixes with the part's name: "has a hole
 * row on +x …". The shape faults are exactly the loader's drop rules (`validateHoleRows`), judged on the STORED values
 * (after the hole grid), plus the design rule that the first centre lies on its face plane (within 1/32in). Strict
 * faults (`holeFaults`) are not judged here. A value in `exact` is kept as it is; any other is put on the hole grid.
 */
export function holeRowsFor(b: Board, rows: readonly WorldHoleRow[], exact?: ReadonlySet<number>): { rows: Row[] } | { fault: string } {
  const snap = (v: number) => (exact?.has(v) === true ? v : holeSnap(v));
  const ext = boardExtents(b);
  const out: Row[] = [];
  for (const r of rows) {
    if (!DIRS.includes(r.face) || !DIRS.includes(r.toward)) return { fault: `has a hole row on ${String(r.face)} toward ${String(r.toward)}, which is not a direction` };
    const on = `has a hole row on ${r.face}`;
    const raw = [r.diameter, r.pitch, r.count, ...vec(r.offset), ...(r.through ? [] : [r.depth])];
    if (!raw.every((v) => typeof v === 'number' && Number.isFinite(v))) return { fault: `${on} with a number that is not finite` };
    const fa = AXES.indexOf(r.face[1]!);
    const ta = AXES.indexOf(r.toward[1]!);
    if (ta === fa) return { fault: `${on} running toward ${r.toward}, along the drill axis; a row runs across its face` };
    const plane = r.face[0] === '+' ? ext[fa]! : 0;
    if (Math.abs(vec(r.offset)[fa]! - plane) > PLANE_TOLERANCE) return { fault: `${on} whose first centre is not on that face` };
    const diameter = snap(r.diameter);
    if (!(diameter > 0)) return { fault: `${on} whose diameter (${r.diameter}) is not above 0` };
    const depth = r.through ? 'through' as const : snap(r.depth);
    if (depth !== 'through' && !(depth > 0)) return { fault: `${on} whose depth (${r.depth}) is not above 0; for a hole right through, set through` };
    if (!Number.isInteger(r.count) || r.count < 1 || r.count > HOLE_COUNT_MAX) {
      return { fault: `${on} whose count (${r.count}) is not a whole number from 1 to ${HOLE_COUNT_MAX}` };
    }
    const pitch = snap(r.pitch);
    if (pitch < 0) return { fault: `${on} whose pitch (${r.pitch}) is negative` };
    const face = dirToLocal(b, r.face);
    const along = dirToLocal(b, r.toward);
    const across = acrossOf({ face: face.dim, along: along.dim });
    const aa = axisOfDim(b, across);
    // Along: the part coordinates of the row's two end holes. Stored from the part's `along` MIN end (spec §3.1: a row
    // written toward the min end is reversed, its last hole first, so the same holes store one way) — unless that
    // would need a negative station (a row starting past the min end, which the loader drops), when it is stored from
    // the max end. A row past BOTH ends has no stored form. `L - uLast` is the stored encoding (as holeInstances reads
    // a max-end station), within the part's own frame.
    const u = fromWorldOffset(b, ta, snap(vec(r.offset)[ta]!));
    const run = (r.count - 1) * pitch;
    const [uFirst, uLast] = along.from === 'max' ? [u, u + run] : [u - run, u];
    // A reversal of a whole-mm row can land a few ulps below 0 where the model meant 0: float noise, not a hole off
    // the part.
    const fromMin = uFirst < 0 && uFirst > -HOLE_EPS ? 0 : uFirst;
    const fromMax = b[along.dim] - uLast;
    let alongFrom: CutFrom = 'min';
    let station = fromMin;
    if (fromMin < 0) {
      if (fromMax < 0) {
        return { fault: `${on} with holes outside the part at both ends of the row (toward ${localToDir(b, along.dim, 'min')} and ${localToDir(b, along.dim, 'max')})` };
      }
      alongFrom = 'max';
      station = fromMax;
    }
    // Across: the nearer world side (ties: the part's min), named through endFacing; a centre PAST one side is
    // measured from the other (an inset is never negative; breaking out is holeFaults' to judge).
    const w = snap(vec(r.offset)[aa]!);
    const fromWorldMax = ext[aa]! - w;
    const [acrossFrom, inset]: [CutFrom, number] = w < 0 ? [endFacing(b, aa, 1), fromWorldMax]
      : fromWorldMax < 0 ? [endFacing(b, aa, -1), w]
        : w === fromWorldMax ? ['min', w]
          : w < fromWorldMax ? [endFacing(b, aa, -1), w] : [endFacing(b, aa, 1), fromWorldMax];
    out.push({ face: face.dim, from: face.from, diameter, depth, along: along.dim, alongFrom, station, count: r.count, pitch, acrossFrom, inset });
  }
  return { rows: sortHoleRows(out) };
}

/** The design form's order: face (DIRS rank), first centre x, y, z, then the rest. */
const designKey = (r: WorldHoleRow): (number | string)[] => [
  DIRS.indexOf(r.face), r.offset.x, r.offset.y, r.offset.z, DIRS.indexOf(r.toward), r.diameter, r.through ? 1 : 0, r.depth, r.count, r.pitch,
];

/**
 * A part's hole rows in design form (spec §3.2), one per row, in CANONICAL direction (the first centre the one nearest
 * the part's `along` min end, `toward` its max end), sorted canonically. Never null: every stored row has a world
 * reading. `offset` is from the part's min corner, on the face plane (the face component exactly 0 or the world
 * extent). A through row's `depth` is the part's extent along the drill axis (ignored); a single bore's `pitch` is 0.
 */
export function worldHoles(b: Board): WorldHoleRow[] {
  const out = b.holes.map((r): WorldHoleRow => {
    const hs = holeInstances(b, r);
    const first = r.alongFrom === 'min' ? hs[0]! : hs[hs.length - 1]!;
    const local: Record<Dimension, number> = { length: first.centre[0], width: first.centre[1], thickness: first.centre[2] };
    const dims = axisDimensions(b);
    const w = dims.map((d, i) => toWorldOffset(b, i, local[d]));
    const offset = { x: w[0]!, y: w[1]!, z: w[2]! };
    return {
      face: localToDir(b, r.face, r.from), diameter: r.diameter,
      depth: r.depth === 'through' ? b[r.face] : r.depth, through: r.depth === 'through',
      offset, toward: localToDir(b, r.along, 'max'), count: r.count, pitch: r.count === 1 ? 0 : r.pitch,
    };
  });
  return out.sort((x, y) => {
    const a = designKey(x);
    const c = designKey(y);
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== c[i]) return (a[i] as number) - (c[i] as number);
    }
    return 0;
  });
}

/**
 * The same holes (Task 3's exact-row map): the same face and `from`, diameter, depth (or both through) and count, and
 * every hole centre equal within HOLE_EPS in board-local coordinates, as a SET — a row measured from its max end and
 * its canonical form list the same centres in reverse order.
 */
export function sameHoles(a: Row, c: Row, board: Board): boolean {
  if (a.face !== c.face || a.from !== c.from || a.diameter !== c.diameter || a.depth !== c.depth || a.count !== c.count) return false;
  const left = holeInstances(board, { id: 'a', ...a }).map((h) => h.centre);
  const right = holeInstances(board, { id: 'c', ...c }).map((h) => h.centre);
  for (const p of left) {
    const i = right.findIndex((q) => q.every((v, k) => Math.abs(v - p[k]!) <= HOLE_EPS));
    if (i < 0) return false;
    right.splice(i, 1);
  }
  return true;
}
