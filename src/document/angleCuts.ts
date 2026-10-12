import type { AngleCut, AngleKind, Board, CutFrom, Dimension } from './types';
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
export function angleCutValues(c: AngleCut): (string | number)[] {
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
