import type { AngleCut, AngleKind, Board, CutFrom, Dimension, Region, Span } from './types';
import { DIMENSION_ORDER } from './geometry';

/**
 * A board-local vector or point with components in DIMENSION_ORDER
 * (length, width, thickness). Never world axes.
 */
export type V3 = [number, number, number];

export const ANGLE_KINDS: AngleKind[] = ['taper', 'miter', 'bevel', 'chamfer'];

/**
 * Every field of `AngleCut` that decides "same angle cut": all but `id`, `kind`
 * INCLUDED (angle-cuts spec §2.4, §4.2) — two cuts that would print different
 * words cannot share a cut-list line or a Shape. A TABLE CHECKED AGAINST THE
 * TYPE (invariant 40's pattern, one type over): a new `AngleCut` field fails
 * `tsc` here until it is listed.
 */
export const ANGLE_CUT_FIELDS = {
  kind: true, face: true, from: true, along: true, alongFrom: true, points: true,
} as const satisfies Record<Exclude<keyof AngleCut, 'id'>, true>;

export const ANGLE_CUT_KEYS = Object.keys(ANGLE_CUT_FIELDS) as (keyof typeof ANGLE_CUT_FIELDS)[];

/** One angle cut's comparable values, in ANGLE_CUT_KEYS order, `points` flattened. */
export function angleCutValues(c: Omit<AngleCut, 'id'>): (string | number)[] {
  return ANGLE_CUT_KEYS.flatMap((k): (string | number)[] => {
    if (k === 'points') return [c.points[0][0], c.points[0][1], c.points[1][0], c.points[1][1]];
    return [c[k]];
  });
}

/** Exact equality on every ANGLE_CUT_FIELDS field (stored values, invariant 18). */
export function sameAngleCut(a: AngleCut, b: AngleCut): boolean {
  const x = angleCutValues(a);
  const y = angleCutValues(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** A copy sharing no array with the original, so no two parts ever hold one cut's points. */
export function copyAngleCut(c: AngleCut): AngleCut {
  return { ...c, points: [[c.points[0][0], c.points[0][1]], [c.points[1][0], c.points[1][1]]] };
}

/** The dimension the cut runs straight through. */
export function throughOf(c: Pick<AngleCut, 'face' | 'along'>): Dimension {
  return DIMENSION_ORDER.find((d) => d !== c.face && d !== c.along)!;
}

/** Depth into `face` of the line at station `s` (measured from `alongFrom`'s end). */
export function depthAt(c: Pick<AngleCut, 'points'>, s: number): number {
  const [[s1, q1], [s2, q2]] = c.points;
  return q1 + ((q2 - q1) * (s - s1)) / (s2 - s1);
}

/** The station where the line reaches depth 0; NaN when the depths are equal (the line never does). */
export function zeroStation(c: Pick<AngleCut, 'points'>): number {
  const [[s1, q1], [s2, q2]] = c.points;
  if (q1 === q2) return NaN;
  return s1 - (q1 * (s2 - s1)) / (q2 - q1);
}

const sign = (f: CutFrom) => (f === 'min' ? 1 : -1);

/**
 * The cut's KEPT side as a half-space n·x + d >= 0 in board-local inches,
 * |n| = 1 (angle-cuts spec §2.2). With q(x) the depth from the `from` face and
 * s(x) the station from `alongFrom`'s end, the kept side is
 * q(x) − depthAt(s(x)) >= 0. Null for equal stations (validation drops such a
 * cut; a Board built in code is answered, not thrown at).
 */
export function keptHalfSpace(board: Pick<Board, Dimension>, c: AngleCut): { n: V3; d: number } | null {
  const [[s1, q1], [s2, q2]] = c.points;
  if (s1 === s2) return null;
  const k = (q2 - q1) / (s2 - s1);
  const sf = sign(c.from);
  const cf = c.from === 'min' ? 0 : board[c.face];
  const sa = sign(c.alongFrom);
  const ca = c.alongFrom === 'min' ? 0 : board[c.along];
  const n: V3 = [0, 0, 0];
  n[DIMENSION_ORDER.indexOf(c.face)] = sf;
  n[DIMENSION_ORDER.indexOf(c.along)] = -k * sa;
  const d = cf - q1 - k * (ca - s1);
  const len = Math.hypot(1, k);
  return { n: [n[0] / len, n[1] / len, n[2] / len], d: d / len };
}

/**
 * True when the cut takes no stock out of this part: its line is at or below
 * depth 0 at both ends of `along` (linear, so nowhere in between is deeper).
 * Kept in the document and noted in Properties (spec §2.3); never dropped on load.
 * `!(x > 0)` so a NaN counts as nothing removed.
 */
export function angleCutRemovesNothing(board: Pick<Board, Dimension>, c: AngleCut): boolean {
  return !(Math.max(depthAt(c, 0), depthAt(c, board[c.along])) > 0);
}

/** The angle cuts that actually remove stock — what the cut list prints and groups by. */
export function angleCutsThatRemoveStock(board: Board): AngleCut[] {
  return board.angleCuts.filter((c) => !angleCutRemovesNothing(board, c));
}

/**
 * The smallest board-local box holding every point the cut can remove (AI-angles spec §2.1): along `along`, the
 * stations where the line is deeper than 0; into `face`, from the `from` face to the line's greatest depth there
 * (clamped to the dimension); all of `throughOf(c)`. Depth is linear in station, so the greatest depth is at an end.
 * Null for a cut that removes nothing. Board-local: a caller crosses it to world space through `worldBox` (invariant 44).
 */
export function touchedRegion(board: Pick<Board, Dimension>, c: AngleCut): Region | null {
  if (angleCutRemovesNothing(board, c)) return null;
  const A = board[c.along];
  const F = board[c.face];
  const d0 = depthAt(c, 0);
  const d1 = depthAt(c, A);
  const z = Math.min(A, Math.max(0, zeroStation(c)));
  // Stations from `alongFrom` where the line is deeper than 0: up to (or from) its zero, or all of `along`.
  const lo = d0 > 0 ? 0 : z;
  const hi = d1 > 0 ? A : z;
  const deep = Math.min(F, Math.max(d0, d1));
  const r: Region = { length: [0, board.length], width: [0, board.width], thickness: [0, board.thickness] };
  r[c.along] = c.alongFrom === 'min' ? [lo, hi] : [A - hi, A - lo];
  r[c.face] = c.from === 'min' ? [0, deep] : [F - deep, F];
  return r;
}

/**
 * `cell` minus a cut's touched box `t` (AI-angles spec §2.2), as boxes that do not overlap: the stations along
 * `c.along` outside `t`, at full size, and the stations inside `t`, kept only past `t`'s greatest depth into `c.face`.
 * A cell `t` does not reach comes back alone, unchanged. A cell already of zero size along `along` (a taper's end slab)
 * inside `t`'s stations is split by depth only, so it is never duplicated. Pieces the split leaves empty are dropped.
 */
export function splitRegion(cell: Region, t: Region, c: Pick<AngleCut, 'face' | 'from' | 'along'>): Region[] {
  const meets = DIMENSION_ORDER.every((d) => {
    const [a, b] = cell[d];
    const [p, q] = t[d];
    return a === b ? a >= p && a <= q : Math.min(b, q) - Math.max(a, p) > 0;
  });
  if (!meets) return [cell];
  const out: Region[] = [];
  const [a, b] = cell[c.along];
  const [p, q] = t[c.along];
  const zero = a === b;
  if (!zero && Math.min(b, p) > a) out.push({ ...cell, [c.along]: [a, Math.min(b, p)] });
  if (!zero && b > Math.max(a, q)) out.push({ ...cell, [c.along]: [Math.max(a, q), b] });
  const s: Span = zero ? [a, b] : [Math.max(a, p), Math.min(b, q)];
  const [f0, f1] = cell[c.face];
  const f: Span = c.from === 'min' ? [Math.max(f0, t[c.face][1]), f1] : [f0, Math.min(f1, t[c.face][0])];
  if (f[1] > f[0] || (f0 === f1 && f[0] === f[1])) out.push({ ...cell, [c.along]: s, [c.face]: f });
  return out;
}

/**
 * The fallback word for a file without a valid `kind` (spec §2.4): an end cut
 * is a miter; a slope along the length is a taper; a slope whose line meets
 * depth 0 inside the part and never reaches the far face is a chamfer;
 * anything else is a bevel.
 */
export function deriveKind(c: Omit<AngleCut, 'id' | 'kind'> & { id?: string; kind?: AngleKind }, board: Pick<Board, Dimension>): AngleKind {
  if (c.face === 'length') return 'miter';
  if (c.along === 'length') return 'taper';
  const z = zeroStation(c);
  const deepest = Math.max(depthAt(c, 0), depthAt(c, board[c.along]));
  return z > 0 && z < board[c.along] && deepest < board[c.face] ? 'chamfer' : 'bevel';
}

const flip = (f: CutFrom): CutFrom => (f === 'min' ? 'max' : 'min');

/**
 * One angle cut reflected along part dimension `d` (u -> size - u): stations
 * are measured from `alongFrom` and depths from `from`, so a reflection is a
 * flag flip and NO arithmetic (angle-cuts spec 5.2; invariant 44's one hand
 * reflection stays `mirrorCutAlong`, for rectangular cuts). Exact, and an
 * involution. Always a fresh object with fresh points.
 */
export function mirrorAngleCut(c: AngleCut, d: Dimension): AngleCut {
  const out = copyAngleCut(c);
  if (c.face === d) out.from = flip(c.from);
  else if (c.along === d) out.alongFrom = flip(c.alongFrom);
  return out;
}

/** A taper as the shop reads it (spec §7): which face, from which end, where it starts, how much it removes there. */
export interface TaperFields { face: 'width' | 'thickness'; from: CutFrom; end: CutFrom; start: number; amount: number }

/** Exact: the stored points are the typed numbers (invariant 25). */
export function taperCut(f: TaperFields): Omit<AngleCut, 'id'> {
  return { kind: 'taper', face: f.face, from: f.from, along: 'length', alongFrom: f.end, points: [[0, f.amount], [f.start, 0]] };
}

/**
 * The shop numbers of a stored taper, described from its DEEP end (the wording's
 * rule, Task 9): a line that is already at or past zero at `alongFrom`'s end and
 * deepens toward the far end reads from that far end, so `amount` is never negative.
 * Editing any field then rewrites the cut in canonical form through `taperCut`.
 * A hand-edited line that never reaches zero gives a non-finite start (passed through).
 */
export function taperFields(c: AngleCut, board: Pick<Board, Dimension>): TaperFields {
  const face = c.face === 'thickness' ? 'thickness' : 'width';
  const a = board[c.along];
  if (depthAt(c, 0) <= 0 && depthAt(c, a) > 0) {
    return { face, from: c.from, end: flip(c.alongFrom), start: a - zeroStation(c), amount: depthAt(c, a) };
  }
  return { face, from: c.from, end: c.alongFrom, start: zeroStation(c), amount: depthAt(c, 0) };
}

/** A visible, legal starting point on any part: ¼ of the width off over ¾ of the length, from the min end. */
export function defaultTaper(board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  return taperCut({ face: 'width', from: 'min', end: 'min', start: board.length * 0.75, amount: board.width / 4 });
}

/** A miter as the shop reads it (spec §7). `ratio` is the stored slope (|Δdepth| / |Δstation|), NOT degrees, so an
 *  untouched angle never round-trips through atan/tan (45° is ratio 1, exactly — spec §2.3). */
export interface MiterFields { end: CutFrom; across: 'width' | 'thickness'; longSide: CutFrom; ratio: number }

/** Degrees → stored slope. 45 is exactly 1 (`Math.tan(π/4)` is 0.9999999999999999). */
export function miterRatio(degrees: number): number {
  return degrees === 45 ? 1 : Math.tan((degrees * Math.PI) / 180);
}

/** Stored slope → degrees, for display and the angle field. */
export function miterDegrees(ratio: number): number {
  return (Math.atan(ratio) * 180) / Math.PI;
}

/** Canonical: depth 0 at the long-point side, run × ratio across the part (exact when ratio is 1). */
export function miterCut(f: MiterFields, board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  const run = board[f.across];
  return { kind: 'miter', face: 'length', from: f.end, along: f.across, alongFrom: f.longSide, points: [[0, 0], [run, run * f.ratio]] };
}

/** The side of `along` holding a miter's long point: where the stored line is shallower. ONE reader for the row and the bench line. */
export function miterLongSide(c: AngleCut, board: Pick<Board, Dimension>): CutFrom {
  return depthAt(c, 0) <= depthAt(c, board[c.along]) ? c.alongFrom : flip(c.alongFrom);
}

/**
 * The shop numbers of a stored miter. The long point is the side where the line is shallower; the ratio is read
 * straight off the stored points (no trigonometry), so editing only the end or side keeps it exactly. A miter whose
 * `along` is somehow `length` (hand-edited) reads as across the width. Editing rewrites it canonically via `miterCut`.
 * Null for an OFFSET line (fu 297; hand-edited: depth 0 at neither side of `along`), as `bevelFields` is: the row then
 * shows the line and Remove, never a control whose first edit would rewrite it into a different cut.
 */
export function miterFields(c: AngleCut, board: Pick<Board, Dimension>): MiterFields | null {
  const eps = 1e-9;   // local, as bevelFields' (bodies.ts imports this module)
  if (!(Math.abs(depthAt(c, 0)) <= eps || Math.abs(depthAt(c, board[c.along])) <= eps)) return null;
  const across = c.along === 'thickness' ? 'thickness' : 'width';
  const [[s1, q1], [s2, q2]] = c.points;
  const ratio = Math.abs(q2 - q1) / Math.abs(s2 - s1);
  const longSide = miterLongSide(c, board);
  return { end: c.from, across, longSide, ratio };
}

/** 45° across the width at the length max end, long point on the width min side. */
export function defaultMiter(board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  return miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, board);
}

/** The picture-frame pair: the default miter and its match at the min end, long points on the SAME side (a trapezoid). */
export function defaultMiterPair(board: Pick<Board, Dimension>): Omit<AngleCut, 'id'>[] {
  return [defaultMiter(board), miterCut({ end: 'min', across: 'width', longSide: 'min', ratio: 1 }, board)];
}

/** A bevel as the shop reads it (spec §7): an edge face cut at a blade tilt, along the length. `ratio` is the stored
 *  slope, like MiterFields — never re-derived through trigonometry. */
export interface BevelFields { face: 'width' | 'thickness'; from: CutFrom; longSide: CutFrom; ratio: number }

/** A bevel slopes across the part's OTHER cross dimension (it runs along the length). */
export function bevelAcross(face: 'width' | 'thickness'): 'thickness' | 'width' {
  return face === 'width' ? 'thickness' : 'width';
}

export function bevelCut(f: BevelFields, board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  const along = bevelAcross(f.face);
  const run = board[along];
  return { kind: 'bevel', face: f.face, from: f.from, along, alongFrom: f.longSide, points: [[0, 0], [run, run * f.ratio]] };
}

/** Null for a cut the bevel row cannot show (an end cut, or a slope along the length — that is a taper). */
export function bevelFields(c: AngleCut, board: Pick<Board, Dimension>): BevelFields | null {
  if (c.face === 'length' || c.along === 'length') return null;
  // A bevel's line starts at depth 0 on one side of `along`; an offset or zero-inside line would be silently rewritten
  // into a different cut by an unrelated edit. (Local epsilon: bodies.ts imports this module.)
  const eps = 1e-9;
  if (!(Math.abs(depthAt(c, 0)) <= eps || Math.abs(depthAt(c, board[c.along])) <= eps)) return null;
  const [[s1, q1], [s2, q2]] = c.points;
  return { face: c.face, from: c.from, longSide: miterLongSide(c, board), ratio: Math.abs(q2 - q1) / Math.abs(s2 - s1) };
}

/** 15 degrees off the width face (max side), long point on the thickness min side. */
export function defaultBevel(board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  return bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: miterRatio(15) }, board);
}

/** One of a part's twelve edges, canonical: `face` before `along` in DIMENSION_ORDER. */
export interface ChamferEdge { face: Dimension; from: CutFrom; along: Dimension; alongFrom: CutFrom }

export const CHAMFER_EDGES: ChamferEdge[] = DIMENSION_ORDER.flatMap((through) => {
  const [face, along] = DIMENSION_ORDER.filter((d) => d !== through) as [Dimension, Dimension];
  return (['min', 'max'] as CutFrom[]).flatMap((from) => (['min', 'max'] as CutFrom[]).map((alongFrom) => ({ face, from, along, alongFrom })));
});

/** A chamfer's edge and its two legs: `legFace` into `face`, `legAlong` into `along` (stored values, exact). */
export interface ChamferFields extends ChamferEdge { legFace: number; legAlong: number }

export function chamferCut(f: ChamferFields, _board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  return { kind: 'chamfer', face: f.face, from: f.from, along: f.along, alongFrom: f.alongFrom, points: [[0, f.legFace], [f.legAlong, 0]] };
}

/**
 * The edge and legs of a stored chamfer, canonical (`face` before `along`). A line that deepens toward the far side of
 * `along` is read from that side (as taperFields does); null when the line is not a corner chamfer — it never reaches
 * depth 0 inside the part. A leg longer than its dimension (the part was resized below it) still reads: the row stays
 * editable, and `chamferCut` with the same legs rewrites the identical line. Editing rewrites it canonically via `chamferCut`.
 */
export function chamferFields(c: AngleCut, board: Pick<Board, Dimension>): ChamferFields | null {
  const A = board[c.along];
  let alongFrom = c.alongFrom;
  const [[s1, q1], [s2, q2]] = c.points;
  let legFace = depthAt(c, 0);
  let legAlong = zeroStation(c);
  // Read the legs straight off the stored points when they sit on the faces (exact for decimal legs).
  if (s1 === 0 && q2 === 0) { legFace = q1; legAlong = s2; }
  if (legFace <= 0 && depthAt(c, A) > 0) {
    alongFrom = flip(c.alongFrom);
    if (s2 === A && q1 === 0) { legFace = q2; legAlong = A - s1; } else { legFace = depthAt(c, A); legAlong = A - legAlong; }
  }
  if (!(Number.isFinite(legFace) && legFace > 0 && Number.isFinite(legAlong) && legAlong > 0)) return null;
  const swap = DIMENSION_ORDER.indexOf(c.face) > DIMENSION_ORDER.indexOf(c.along);
  return swap
    ? { face: c.along, from: alongFrom, along: c.face, alongFrom: c.from, legFace: legAlong, legAlong: legFace }
    : { face: c.face, from: c.from, along: c.along, alongFrom, legFace, legAlong };
}

/** The width-max / thickness-max edge, both legs 1/8 (smaller on a tiny part). */
export function defaultChamfer(board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  const leg = Math.min(0.125, board.width / 4, board.thickness / 4);
  return chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: leg, legAlong: leg }, board);
}
