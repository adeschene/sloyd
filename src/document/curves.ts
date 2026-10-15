import type { Board, CurveCut, CurveSegment, Dimension } from './types';
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

export interface LocalLine { kind: 'line'; a: P2; b: P2; segment: number }
export interface LocalArc {
  kind: 'arc'; a: P2; b: P2; centre: P2; radius: number; rise: number; crown: P2;
  /** Signed radians from a to b about the centre: positive is anticlockwise in (u, v). */
  sweep: number;
  segment: number;
}
export type LocalSeg = LocalLine | LocalArc;

/**
 * The minor arc from a to b bowing toward `side` of its chord (spec §2.2): rise → radius (R = (c²/4 + h²) / 2h) or
 * radius → rise (h = R − √(R² − c²/4)); the crown is h from the chord's middle on `side`, the centre R − h on the other.
 * Bowing to the LEFT of travel runs CLOCKWISE about the centre (the centre is on the right).
 */
export function arcOf(a: P2, b: P2, side: 'left' | 'right', size: { rise: number } | { radius: number }, segment: number): LocalArc {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const c = Math.hypot(dx, dy);
  const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const nl: P2 = [-dy / c, dx / c];
  const s = side === 'left' ? 1 : -1;
  let radius: number;
  let rise: number;
  if ('rise' in size) { rise = size.rise; radius = (c * c / 4 + rise * rise) / (2 * rise); }
  else { radius = size.radius; rise = radius - Math.sqrt(Math.max(0, radius * radius - c * c / 4)); }
  const crown: P2 = [m[0] + s * rise * nl[0], m[1] + s * rise * nl[1]];
  const centre: P2 = [m[0] - s * (radius - rise) * nl[0], m[1] - s * (radius - rise) * nl[1]];
  const half = Math.asin(Math.min(1, c / (2 * radius)));
  return { kind: 'arc', a, b, centre, radius, rise, crown, sweep: -s * 2 * half, segment };
}

const flipSide = (s: 'left' | 'right') => (s === 'left' ? 'right' : 'left');

/**
 * A curve's segments in BOARD-LOCAL (u, v) (spec §2.2): a stored coordinate measured from `max` is `dim − c`. Exactly
 * one of the two measured from max is a reflection, which flips every arc's side; both is a half turn, which does not.
 */
export function localSegments(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>): LocalSeg[] {
  const [u, v] = uvDims(c.through);
  const map = (p: readonly number[]): P2 => [c.uFrom === 'min' ? p[0]! : board[u] - p[0]!, c.vFrom === 'min' ? p[1]! : board[v] - p[1]!];
  const reflected = (c.uFrom === 'max') !== (c.vFrom === 'max');
  const out: LocalSeg[] = [];
  let at = map(c.start);
  c.segments.forEach((s, i) => {
    const to = map(s.to);
    if (s.type === 'line') out.push({ kind: 'line', a: at, b: to, segment: i });
    else out.push(arcOf(at, to, reflected ? flipSide(s.side) : s.side, s.rise !== undefined ? { rise: s.rise } : { radius: s.radius! }, i));
    at = to;
  });
  return out;
}

/** Chords for one arc: the fewest whose sagitta is within `tolerance`, at least 1, at most `max`. */
export function arcChords(arc: LocalArc, tolerance: number, max: number): number {
  const step = tolerance >= 2 * arc.radius ? Math.PI : 2 * Math.acos(1 - tolerance / arc.radius);
  return Math.min(max, Math.max(1, Math.ceil(Math.abs(arc.sweep) / step - 1e-9)));
}

/** The arc's point at fraction t of its sweep (t = 0 is a, 1 is b — returned exactly). */
function arcPoint(arc: LocalArc, t: number): P2 {
  if (t === 0) return arc.a;
  if (t === 1) return arc.b;
  const t0 = Math.atan2(arc.a[1] - arc.centre[1], arc.a[0] - arc.centre[0]) + arc.sweep * t;
  return [arc.centre[0] + arc.radius * Math.cos(t0), arc.centre[1] + arc.radius * Math.sin(t0)];
}

/** A segment's unit direction of travel where it starts (`end` false) or ends (`end` true). */
function tangent(s: LocalSeg, end: boolean): P2 {
  if (s.kind === 'line') { const d = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]); return [(s.b[0] - s.a[0]) / d, (s.b[1] - s.a[1]) / d]; }
  const p = end ? s.b : s.a;
  const r: P2 = [(p[0] - s.centre[0]) / s.radius, (p[1] - s.centre[1]) / s.radius];
  return s.sweep > 0 ? [-r[1], r[0]] : [r[1], -r[0]];
}

export interface Outline {
  /** The waste's outline as a polygon, closed implicitly (the last point joins the first). */
  pts: P2[];
  /** arcEdge[i]: the edge pts[i] → pts[i + 1] is a chord of an arc. */
  arcEdge: boolean[];
  /** smooth[i]: the KEPT surface has no crease through pts[i] — an interior chord vertex, or a join where the two
   *  segments' true tangents are parallel either way (a rounded corner's straight sides run into the arc; the waste
   *  there is a cusp). An arch meeting its edge at an angle is not smooth (spec §3.3). */
  smooth: boolean[];
}

/** The waste outline at `tolerance` (spec §3.1): every arc as chords whose vertices lie ON the true arc. */
export function curveOutline(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>, tolerance = CURVE_TOLERANCE, max = CURVE_SEGMENTS_MAX): Outline {
  const segs = localSegments(board, c);
  const pts: P2[] = [];
  const arcEdge: boolean[] = [];
  const smooth: boolean[] = [];
  segs.forEach((s, i) => {
    const prev = segs[(i - 1 + segs.length) % segs.length]!;
    const tIn = tangent(prev, true);
    const tOut = tangent(s, false);
    pts.push(s.a);
    smooth.push(Math.abs(tIn[0] * tOut[1] - tIn[1] * tOut[0]) <= CURVE_EPS);
    if (s.kind === 'line') { arcEdge.push(false); return; }
    const n = arcChords(s, tolerance, max);
    arcEdge.push(true);
    for (let k = 1; k < n; k += 1) { pts.push(arcPoint(s, k / n)); arcEdge.push(true); smooth.push(true); }
  });
  return { pts, arcEdge, smooth };
}

/** Point in a closed polygon by ray parity; a point within CURVE_EPS of an edge counts as inside. */
export function inPolygonClosed(poly: readonly P2[], p: P2): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (distToSegment(p, a, b) <= CURVE_EPS) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function distToSegment(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** The outline's polygon with every arc replaced by its chord: the segments' start points. */
export function chordPolygon(segs: readonly LocalSeg[]): P2[] {
  return segs.map((s) => s.a);
}

/** Whether an arc bows into the WOOD (its crown outside the chord polygon: the waste grows — an arch) or into the
 *  WASTE (crown inside or on it: a rounded corner, a bow). Derived, for wording and the geometry path (spec §2.1). */
export function bowsInto(segs: readonly LocalSeg[], arc: LocalArc): 'wood' | 'waste' {
  return inPolygonClosed(chordPolygon(segs), arc.crown) ? 'waste' : 'wood';
}
