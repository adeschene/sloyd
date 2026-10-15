import type { CurveCut, CurveSegment, Dimension } from './types';
import { DIMENSION_ORDER } from './geometry';

/** A point in a face's (u, v). */
export type P2 = [number, number];

/** Inches: closed tests on the true arcs (faults, inside, distance). Far below any bench precision. */
export const CURVE_EPS = 1e-9;
/** Inches: a chord's greatest gap to its arc in the model — viewport, bodies, caps, snap probe (spec §3.1). */
export const CURVE_TOLERANCE = 0.005;
/** Chords per arc in the model, at most (spec §3.1; the timing spike, §3.6). */
export const CURVE_SEGMENTS_MAX = 24;
/** Segments per stored curve, at most: a hand-edited file with more is dropped on load, not expanded (Review Focus 3). */
export const CURVE_SEGMENTS_STORED_MAX = 64;

/**
 * Every field of `CurveCut` that decides "same curve": all but `id` (spec §6.1). A TABLE CHECKED AGAINST THE TYPE
 * (invariant 40's pattern): a new `CurveCut` field fails `tsc` here, and in FIELD_TEXT below, until it is listed.
 */
export const CURVE_FIELDS = {
  through: true, uFrom: true, vFrom: true, start: true, segments: true,
} as const satisfies Record<Exclude<keyof CurveCut, 'id'>, true>;
export const CURVE_KEYS = Object.keys(CURVE_FIELDS) as (keyof typeof CURVE_FIELDS)[];

/** Exact: String() round-trips a finite number; -0 is told from 0. */
const num = (n: number) => (Object.is(n, -0) ? '-0' : String(n));
const segText = (s: CurveSegment) => (s.type === 'line'
  ? `L${num(s.to[0])},${num(s.to[1])}`
  : `A${num(s.to[0])},${num(s.to[1])},${s.side},${s.rise !== undefined ? `r${num(s.rise)}` : `R${num(s.radius!)}`}`);
const FIELD_TEXT: { [K in keyof typeof CURVE_FIELDS]: (v: CurveCut[K]) => string } = {
  through: (v) => v, uFrom: (v) => v, vFrom: (v) => v,
  start: (v) => `${num(v[0])},${num(v[1])}`,
  segments: (v) => v.map(segText).join(' '),
};

/** One curve's comparable value, exact, in CURVE_KEYS order (the cut list's grouping and geometryKey read it). */
export function curveValues(c: Omit<CurveCut, 'id'>): string {
  return CURVE_KEYS.map((k) => (FIELD_TEXT[k] as (v: unknown) => string)(c[k])).join('|');
}

/** Exact equality on every CURVE_FIELDS field (stored values, invariant 18). */
export function sameCurve(a: Omit<CurveCut, 'id'>, b: Omit<CurveCut, 'id'>): boolean {
  return curveValues(a) === curveValues(b);
}

/** A deep copy: no two parts ever hold one array. */
export function copyCurve(c: CurveCut): CurveCut {
  return { ...c, start: [c.start[0], c.start[1]], segments: c.segments.map((s) => ({ ...s, to: [s.to[0], s.to[1]] }) as CurveSegment) };
}

/** u and v of a cut through `through`: the other two dimensions, in DIMENSION_ORDER. */
export function uvDims(through: Dimension): [Dimension, Dimension] {
  return DIMENSION_ORDER.filter((d) => d !== through) as [Dimension, Dimension];
}

/** Twice the signed area of a closed polygon. */
export function twiceArea(pts: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
}

/** Two closed segments CROSS: they meet at a point interior to both, transversally. Touching at an end, or a
 *  collinear overlap, is not crossing (the Bow touches its edge at its crown). */
export function segmentsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  const s = (x: number) => (x > CURVE_EPS ? 1 : x < -CURVE_EPS ? -1 : 0);
  return s(d1) * s(d2) < 0 && s(d3) * s(d4) < 0;
}
