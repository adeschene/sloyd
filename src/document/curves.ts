import type { Board, CurveCut, CurveSegment, CutFrom, Dimension } from './types';
import { DIMENSION_ORDER } from './geometry';
import type { V3 } from './angleCuts';

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

/** A point's distance to one TRUE segment (spec §3.1: never the chords). An arc: |p − C| − R when the ray from the centre
 *  through p meets the arc (that point lies on the crown's side of the chord), else the nearer end. */
function segDistance(s: LocalSeg, p: P2): number {
  if (s.kind === 'line') return distToSegment(p, s.a, s.b);
  const d = Math.hypot(p[0] - s.centre[0], p[1] - s.centre[1]);
  if (d > 0) {
    const q: P2 = [s.centre[0] + ((p[0] - s.centre[0]) * s.radius) / d, s.centre[1] + ((p[1] - s.centre[1]) * s.radius) / d];
    if (crownSide(s, q) >= -CURVE_EPS) return Math.abs(d - s.radius);
  }
  return Math.min(Math.hypot(p[0] - s.a[0], p[1] - s.a[1]), Math.hypot(p[0] - s.b[0], p[1] - s.b[1]));
}

/** Signed distance of p from an arc's chord line, positive toward the crown. */
function crownSide(s: LocalArc, p: P2): number {
  const dx = s.b[0] - s.a[0];
  const dy = s.b[1] - s.a[1];
  const c = Math.hypot(dx, dy);
  const nl = (-dy * (p[0] - s.a[0]) + dx * (p[1] - s.a[1])) / c;      // left of a→b
  const crownLeft = -dy * (s.crown[0] - s.a[0]) + dx * (s.crown[1] - s.a[1]) > 0;
  return crownLeft ? nl : -nl;
}

export function boundaryDistance(segs: readonly LocalSeg[], p: P2): number {
  return Math.min(...segs.map((s) => segDistance(s, p)));
}

/**
 * The waste as a set (spec §2.2): the chord polygon (CLOSED) XOR each arc's lens — the disc on the crown's side of the
 * chord, chord line included. A crown outside the polygon adds its lens (an arch); one inside removes it (a corner), so
 * a point on a corner's chord is not waste. A point within CURVE_EPS of the TRUE outline is in the waste when `mode` is
 * 'closed', out of it when 'open'; elsewhere the XOR decides; the chord's own CURVE_EPS band is
 * settled per arc (an arc bowing into the wood leaves its chord band to the polygon, one bowing into the waste takes it).
 */
export function wasteContains(segs: readonly LocalSeg[], p: P2, mode: 'closed' | 'open'): boolean {
  if (boundaryDistance(segs, p) <= CURVE_EPS) return mode === 'closed';
  let inside = inPolygonClosed(chordPolygon(segs), p);
  for (const s of segs) {
    if (s.kind !== 'arc') continue;
    // The chord band belongs to the polygon (closed), so a lens that ADDS waste (bows into wood) excludes it: the band is
    // waste; a lens that REMOVES waste (bows into waste) includes it: the band is not.
    const band = bowsInto(segs, s) === 'wood' ? crownSide(s, p) > CURVE_EPS : crownSide(s, p) >= -CURVE_EPS;
    if (Math.hypot(p[0] - s.centre[0], p[1] - s.centre[1]) < s.radius && band) inside = !inside;
  }
  return inside;
}

/** Whether a straight side lies along the face rectangle's boundary (both ends on one side line). */
function onRectBoundary(board: Pick<Board, Dimension>, through: Dimension, s: LocalLine): boolean {
  const [u, v] = uvDims(through);
  const on = (k: 0 | 1, val: number) => Math.abs(s.a[k] - val) <= CURVE_EPS && Math.abs(s.b[k] - val) <= CURVE_EPS;
  return on(0, 0) || on(0, board[u]) || on(1, 0) || on(1, board[v]);
}

/**
 * Air for the stock probe (P3): inside the closed waste, except ON the kept surface — an arc, or a straight side that is
 * not along the face boundary. So the lattice point in the middle of an arched edge is air; an arc's end is stock.
 */
export function isAir(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>, p: P2): boolean {
  const segs = localSegments(board, c);
  if (!wasteContains(segs, p, 'closed')) return false;
  return !segs.some((s) => segDistance(s, p) <= CURVE_EPS && (s.kind === 'arc' || !onRectBoundary(board, c.through, s)));
}

/**
 * A simple polygon's convex pieces by ear clipping, each CCW, each edge flagged when it is an ORIGINAL arc chord
 * (diagonals never are). A convex input comes back whole (CCW). The pieces partition the polygon; a zero-area ear
 * (three collinear vertices — a straight side with a vertex on it, or a Bow's crown touching its edge) is dropped,
 * since it holds no waste.
 */
export function convexPieces(pts: P2[], arcEdge: boolean[]): { pts: P2[]; onArc: boolean[] }[] {
  const ccw = twiceArea(pts) > 0;
  const P = ccw ? pts : [...pts].reverse();
  // Edge i of the reversed polygon is edge (n - 2 - i) of the original: P[i] → P[i+1] = pts[n-1-i] → pts[n-2-i].
  const n = P.length;
  const flag = ccw ? arcEdge : P.map((_, i) => arcEdge[(n - 2 - i + n) % n]!);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  if (P.every((p, i) => cross(p, P[(i + 1) % n]!, P[(i + 2) % n]!) >= -CURVE_EPS)) return [{ pts: P, onArc: flag }];
  // Ear clipping on indices; an edge (i, i+1 mod n) of the original keeps its flag.
  const idx = P.map((_, i) => i);
  const tris: [number, number, number][] = [];
  const same = (a: P2, b: P2) => a[0] === b[0] && a[1] === b[1];
  while (idx.length > 3) {
    let clipped = false;
    // A strictly convex ear holding no other vertex (a vertex ON its boundary blocks it: the Bow's crown).
    for (let k = 0; k < idx.length && !clipped; k += 1) {
      const i0 = idx[(k - 1 + idx.length) % idx.length]!;
      const i1 = idx[k]!;
      const i2 = idx[(k + 1) % idx.length]!;
      if (cross(P[i0]!, P[i1]!, P[i2]!) <= CURVE_EPS) continue;
      const inside = idx.some((j) => j !== i0 && j !== i1 && j !== i2 && !same(P[j]!, P[i0]!) && !same(P[j]!, P[i1]!) && !same(P[j]!, P[i2]!)
        && cross(P[i0]!, P[i1]!, P[j]!) >= 0 && cross(P[i1]!, P[i2]!, P[j]!) >= 0 && cross(P[i2]!, P[i0]!, P[j]!) >= 0);
      if (inside) continue;
      tris.push([i0, i1, i2]);
      idx.splice(k, 1);
      clipped = true;
    }
    if (clipped) continue;
    // No convex ear: a vertex in a straight run (collinear neighbours) holds no area — drop it. Its edge flags are lost
    // only for a zero-area remainder, never for an edge of a piece that is kept.
    const k = idx.findIndex((i1, k2) => {
      const i0 = idx[(k2 - 1 + idx.length) % idx.length]!;
      const i2 = idx[(k2 + 1) % idx.length]!;
      return Math.abs(cross(P[i0]!, P[i1]!, P[i2]!)) <= CURVE_EPS;
    });
    if (k < 0) break; // not a simple polygon: what is left is not triangulated (never for a validated curve)
    idx.splice(k, 1);
  }
  if (idx.length === 3) tris.push([idx[0]!, idx[1]!, idx[2]!]);
  const edgeFlag = (a: number, b: number) => (b === (a + 1) % n ? flag[a]! : false);
  return tris
    .filter(([a, b, c]) => cross(P[a]!, P[b]!, P[c]!) > CURVE_EPS)
    .map(([a, b, c]) => ({ pts: [P[a]!, P[b]!, P[c]!], onArc: [edgeFlag(a, b), edgeFlag(b, c), edgeFlag(c, a)] }));
}

type Half = { n: V3; d: number };

/** A (u, v) half-plane lifted into board-local 3D: no component along `through`. */
function lifter(through: Dimension): (n: P2, d: number) => Half {
  const [u, v] = uvDims(through);
  const iu = DIMENSION_ORDER.indexOf(u);
  const iv = DIMENSION_ORDER.indexOf(v);
  return (n, d) => { const N: V3 = [0, 0, 0]; N[iu] = n[0]; N[iv] = n[1]; return { n: N, d }; };
}

/**
 * P6's premise, checked (with `curvePlan`'s one-arc-run rule): the wood is convex at every outline vertex OFF the face
 * boundary, and at every arc–arc join (`always`, outline indices) wherever it lies — the waste's corner there is reflex
 * or straight. Two arcs that each bow into the waste can still meet in a convex WASTE corner (a reflex wood corner, from a
 * hand-edited file); their chord planes, extended, would then remove wood past the other arc. Such a curve splits instead
 * (the same wood, by the agreement test). Every canonical form passes: chord vertices of an arc bowing into the waste are
 * reflex in it, and every other vertex lies on the boundary.
 */
function woodConvexOffBoundary(board: Pick<Board, Dimension>, through: Dimension, pts: readonly P2[], always: ReadonlySet<number>): boolean {
  const [u, v] = uvDims(through);
  const s = twiceArea(pts) > 0 ? 1 : -1;
  const onBoundary = (p: P2) => Math.abs(p[0]) <= CURVE_EPS || Math.abs(p[0] - board[u]) <= CURVE_EPS
    || Math.abs(p[1]) <= CURVE_EPS || Math.abs(p[1] - board[v]) <= CURVE_EPS;
  return pts.every((p, i) => {
    if (onBoundary(p) && !always.has(i)) return true;
    const a = pts[(i - 1 + pts.length) % pts.length]!;
    const b = pts[(i + 1) % pts.length]!;
    return s * ((p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0])) <= CURVE_EPS;
  });
}

/**
 * How `boardBodies` removes one curve's waste (spec §3.2, P6). CLIP — every arc bows into the waste, every straight
 * side lies along the face boundary, the arcs form ONE run (two runs part the wood: each run's planes keep its own side),
 * and the wood is convex at every off-boundary vertex and arc–arc join, so the wood left is convex near the curve: one kept half-plane per chord, the side
 * holding the arc's centre. SPLIT otherwise: the waste polygon's convex pieces (`splitPieces`). Planes are board-local
 * 3D with no component along `through`. Null when the outline has no area.
 */
export function curvePlan(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>):
  { clip: true; planes: Half[] } | { clip: false; pieces: { planes: Half[]; onArc: boolean[] }[] } | null {
  const lift = lifter(c.through);
  const segs = localSegments(board, c);
  const o = curveOutline(board, c);
  if (Math.abs(twiceArea(o.pts)) <= CURVE_EPS) return null;
  // Each chord's arc: the chords of segment k run from its start to its end, in outline order; and where each segment
  // starts in the outline.
  const arcOfEdge: LocalArc[] = [];
  const startAt: number[] = [];
  let at = 0;
  for (const s of segs) {
    startAt.push(at);
    if (s.kind === 'line') { at += 1; continue; }
    const n = arcChords(s, CURVE_TOLERANCE, CURVE_SEGMENTS_MAX);
    for (let k = 0; k < n; k += 1) arcOfEdge[at + k] = s;
    at += n;
  }
  const isArc = (i: number) => segs[(i + segs.length) % segs.length]!.kind === 'arc';
  // An arc–arc join is checked even on the boundary (two arcs meeting there in a convex waste corner part the wood).
  const joins = new Set(segs.flatMap((s, i) => (s.kind === 'arc' && isArc(i - 1) ? [startAt[i]!] : [])));
  const clips = segs.every((s) => (s.kind === 'arc' ? bowsInto(segs, s) === 'waste' : onRectBoundary(board, c.through, s)))
    && segs.filter((s, i) => s.kind === 'arc' && !isArc(i - 1)).length <= 1
    && woodConvexOffBoundary(board, c.through, o.pts, joins);
  if (!clips) return { clip: false, pieces: splitPieces(board, c) };
  const planes: Half[] = [];
  for (let i = 0; i < o.pts.length; i += 1) {
    if (!o.arcEdge[i]) continue;
    const p = o.pts[i]!;
    const q = o.pts[(i + 1) % o.pts.length]!;
    const arc = arcOfEdge[i]!;
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    let n: P2 = [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
    if (n[0] * (arc.centre[0] - p[0]) + n[1] * (arc.centre[1] - p[1]) < 0) n = [-n[0], -n[1]];
    planes.push(lift(n, -(n[0] * p[0] + n[1] * p[1])));
  }
  return { clip: true, planes };
}

/**
 * The SPLIT plan's pieces for one curve (spec §3.2): the waste polygon's convex pieces (`convexPieces`), each as inside
 * half-planes — n points INTO the waste, a CCW piece's inside being the left of each edge — with its arc-chord edges
 * flagged. `curvePlan` uses it for a curve that does not clip; the clip/split agreement test forces it for one that does.
 */
export function splitPieces(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>): { planes: Half[]; onArc: boolean[] }[] {
  const lift = lifter(c.through);
  const o = curveOutline(board, c);
  return convexPieces(o.pts, o.arcEdge).map(({ pts, onArc }) => ({
    onArc,
    planes: pts.map((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const n: P2 = [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
      return lift(n, -(n[0] * p[0] + n[1] * p[1]));
    }),
  }));
}

/** Where a closed segment p0→p1 meets an arc (closed: tangency counts), as points. */
function segArcHits(p0: P2, p1: P2, s: LocalArc): P2[] {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.abs(Math.hypot(p0[0] - s.centre[0], p0[1] - s.centre[1]) - s.radius) <= CURVE_EPS && crownSide(s, p0) >= -CURVE_EPS ? [p0] : [];
  const t0 = ((s.centre[0] - p0[0]) * dx + (s.centre[1] - p0[1]) * dy) / l2;
  const fx = p0[0] + t0 * dx - s.centre[0];
  const fy = p0[1] + t0 * dy - s.centre[1];
  const dist = Math.hypot(fx, fy);
  if (dist > s.radius + CURVE_EPS) return [];
  const half = Math.sqrt(Math.max(0, s.radius * s.radius - dist * dist)) / Math.sqrt(l2);
  const out: P2[] = [];
  for (const t of half === 0 ? [t0] : [t0 - half, t0 + half]) {
    if (t < -CURVE_EPS || t > 1 + CURVE_EPS) continue;
    const q: P2 = [p0[0] + t * dx, p0[1] + t * dy];
    if (crownSide(s, q) >= -CURVE_EPS) out.push(q);
  }
  return out;
}

/** Where a closed segment meets a line segment (closed): the crossing point, or both ends of a collinear overlap. */
function segSegHits(p0: P2, p1: P2, a: P2, b: P2): P2[] {
  const r: P2 = [p1[0] - p0[0], p1[1] - p0[1]];
  const s: P2 = [b[0] - a[0], b[1] - a[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  const qp: P2 = [a[0] - p0[0], a[1] - p0[1]];
  if (Math.abs(den) <= CURVE_EPS * Math.hypot(...r) * Math.hypot(...s)) {
    // Parallel: collinear overlap only.
    if (distToSegment(a, p0, p1) > CURVE_EPS && distToSegment(b, p0, p1) > CURVE_EPS && distToSegment(p0, a, b) > CURVE_EPS && distToSegment(p1, a, b) > CURVE_EPS) return [];
    return [a, b, p0, p1].filter((p) => distToSegment(p, p0, p1) <= CURVE_EPS && distToSegment(p, a, b) <= CURVE_EPS);
  }
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den;
  const w = (qp[0] * r[1] - qp[1] * r[0]) / den;
  const tol = 1e-12;
  return t >= -tol && t <= 1 + tol && w >= -tol && w <= 1 + tol ? [[p0[0] + t * r[0], p0[1] + t * r[1]]] : [];
}

/** Every point where a closed segment meets the true outline. */
function boundaryHits(segs: readonly LocalSeg[], p0: P2, p1: P2): P2[] {
  return segs.flatMap((s) => (s.kind === 'line' ? segSegHits(p0, p1, s.a, s.b) : segArcHits(p0, p1, s)));
}

/** A disc meets the waste (closed: touching meets) — a hole whose axis runs along `through` (spec §6.3). */
export function circleMeetsWaste(segs: readonly LocalSeg[], centre: P2, r: number): boolean {
  return wasteContains(segs, centre, 'closed') || boundaryDistance(segs, centre) <= r + CURVE_EPS;
}

/** An axis-aligned rectangle [lo, hi] meets the waste (closed) — a hole square to `through`, projected (spec §6.3). */
export function rectMeetsWaste(segs: readonly LocalSeg[], lo: P2, hi: P2): boolean {
  const corners: P2[] = [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]];
  if (corners.some((p) => wasteContains(segs, p, 'closed'))) return true;
  const inRect = (p: P2) => p[0] >= lo[0] - CURVE_EPS && p[0] <= hi[0] + CURVE_EPS && p[1] >= lo[1] - CURVE_EPS && p[1] <= hi[1] + CURVE_EPS;
  if (segs.some((s) => inRect(s.a) || (s.kind === 'arc' && inRect(s.crown)))) return true;
  return corners.some((p, i) => boundaryHits(segs, p, corners[(i + 1) % 4]!).length > 0);
}

export type CurveFaultKind = 'runs-off' | 'cuts-through';
export interface CurveFault { kind: CurveFaultKind; edge?: { dim: Dimension; side: CutFrom } }

/** The arc's points at 0°, 90°, 180°, 270° about its centre that lie on it: with its ends, its extremes in u and v. */
function arcExtremes(s: LocalArc): P2[] {
  const out: P2[] = [];
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    const q: P2 = [s.centre[0] + dx * s.radius, s.centre[1] + dy * s.radius];
    if (crownSide(s, q) >= -CURVE_EPS) out.push(q);
  }
  return out;
}

/**
 * THE fault decider (spec §2.5), exact against the true arcs:
 * - `runs-off`: a point of the outline outside the face rectangle (on it is allowed); the edge is the first side passed,
 *   in the order u min, u max, v min, v max (P4);
 * - `cuts-through`: the kept face is empty or in pieces — judged on the face's boundary loop: the parts of it inside the
 *   (closed) waste form two or more runs, or the whole loop. A touch counts (zero thickness is no wood).
 */
export function curveFaults(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>): CurveFault[] {
  const [u, v] = uvDims(c.through);
  const U = board[u];
  const V = board[v];
  const segs = localSegments(board, c);
  const out: CurveFault[] = [];
  const pts = segs.flatMap((s) => (s.kind === 'arc' ? [s.a, s.b, ...arcExtremes(s)] : [s.a, s.b]));
  const passes: [boolean, { dim: Dimension; side: CutFrom }][] = [
    [pts.some((p) => p[0] < -CURVE_EPS), { dim: u, side: 'min' }],
    [pts.some((p) => p[0] > U + CURVE_EPS), { dim: u, side: 'max' }],
    [pts.some((p) => p[1] < -CURVE_EPS), { dim: v, side: 'min' }],
    [pts.some((p) => p[1] > V + CURVE_EPS), { dim: v, side: 'max' }],
  ];
  const first = passes.find(([hit]) => hit);
  if (first) out.push({ kind: 'runs-off', edge: first[1] });
  // The boundary loop, parametrised from (0, 0) anticlockwise: the four sides as segments.
  const loop: [P2, P2][] = [[[0, 0], [U, 0]], [[U, 0], [U, V]], [[U, V], [0, V]], [[0, V], [0, 0]]];
  const samples: P2[] = [];
  for (const [p0, p1] of loop) {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const ts = [0, ...boundaryHits(segs, p0, p1).map((q) => Math.hypot(q[0] - p0[0], q[1] - p0[1]) / len)].sort((a, b) => a - b);
    const cuts: number[] = [];
    for (const t of ts) if (!cuts.length || t - cuts[cuts.length - 1]! > 1e-12) cuts.push(Math.max(0, Math.min(1, t)));
    if (cuts[cuts.length - 1]! < 1 - 1e-12) cuts.push(1);
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      const at = (t: number): P2 => [p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])];
      samples.push(at(cuts[k]!), at((cuts[k]! + cuts[k + 1]!) / 2));
    }
  }
  const inside = samples.map((p) => wasteContains(segs, p, 'closed'));
  if (inside.every(Boolean)) { out.push({ kind: 'cuts-through' }); return out; }
  // Runs of `true`, around the loop: count the starts (a true after a false).
  const runs = inside.filter((b, i) => b && !inside[(i - 1 + inside.length) % inside.length]).length;
  if (runs >= 2) out.push({ kind: 'cuts-through' });
  return out;
}

// ── Canonical forms (spec §2.2): one writer and one reader per row type. A reader returns null for a stored form its row
//    cannot represent exactly (the angle-cuts rule): the row then shows the bench line and Remove only.

export interface ArchFields { through: Dimension; along: Dimension; side: CutFrom; from: CutFrom; start: number; span: number; rise: number }

/** An Arch (or Half-round notch: rise = span / 2) on the `side` edge of the in-face dimension that is not `along`,
 *  from `start` to `start + span` measured from `from`'s end of `along`, bowing `rise` into the wood. */
export function archCurve(f: ArchFields): Omit<CurveCut, 'id'> {
  const [u] = uvDims(f.through);
  if (f.along === u) {
    return { through: f.through, uFrom: f.from, vFrom: f.side, start: [f.start, 0],
      segments: [{ type: 'arc', to: [f.start + f.span, 0], side: 'left', rise: f.rise }, { type: 'line', to: [f.start, 0] }] };
  }
  return { through: f.through, uFrom: f.side, vFrom: f.from, start: [0, f.start],
    segments: [{ type: 'arc', to: [0, f.start + f.span], side: 'right', rise: f.rise }, { type: 'line', to: [0, f.start] }] };
}

export function archFields(c: Omit<CurveCut, 'id'>): ArchFields | null {
  if (c.segments.length !== 2) return null;
  const [a, l] = c.segments as [CurveSegment, CurveSegment];
  if (a.type !== 'arc' || a.rise === undefined || l.type !== 'line') return null;
  if (l.to[0] !== c.start[0] || l.to[1] !== c.start[1]) return null;
  const [u, v] = uvDims(c.through);
  if (c.start[1] === 0 && a.to[1] === 0 && a.to[0] > c.start[0] && a.side === 'left') {
    return { through: c.through, along: u, side: c.vFrom, from: c.uFrom, start: c.start[0], span: a.to[0] - c.start[0], rise: a.rise };
  }
  if (c.start[0] === 0 && a.to[0] === 0 && a.to[1] > c.start[1] && a.side === 'right') {
    return { through: c.through, along: v, side: c.uFrom, from: c.vFrom, start: c.start[1], span: a.to[1] - c.start[1], rise: a.rise };
  }
  return null;
}

export interface BowFields { through: Dimension; along: Dimension; side: CutFrom; span: number; rise: number }

/** A Bow of the `side` edge along `along`, over `span` from that dimension's MIN end (P2: written at the edge length),
 *  bowing `rise` into the waste: the edge's middle stays, its ends come in by `rise`. */
export function bowCurve(f: BowFields): Omit<CurveCut, 'id'> {
  const [u] = uvDims(f.through);
  const { span: s, rise: h } = f;
  if (f.along === u) {
    return { through: f.through, uFrom: 'min', vFrom: f.side, start: [0, 0],
      segments: [{ type: 'line', to: [0, h] }, { type: 'arc', to: [s, h], side: 'right', rise: h }, { type: 'line', to: [s, 0] }, { type: 'line', to: [0, 0] }] };
  }
  return { through: f.through, uFrom: f.side, vFrom: 'min', start: [0, 0],
    segments: [{ type: 'line', to: [h, 0] }, { type: 'arc', to: [h, s], side: 'left', rise: h }, { type: 'line', to: [0, s] }, { type: 'line', to: [0, 0] }] };
}

export function bowFields(c: Omit<CurveCut, 'id'>): BowFields | null {
  if (c.segments.length !== 4 || c.start[0] !== 0 || c.start[1] !== 0) return null;
  const [l1, a, l2, l3] = c.segments as [CurveSegment, CurveSegment, CurveSegment, CurveSegment];
  if (l1.type !== 'line' || a.type !== 'arc' || a.rise === undefined || l2.type !== 'line' || l3.type !== 'line') return null;
  if (l3.to[0] !== 0 || l3.to[1] !== 0) return null;
  const [u, v] = uvDims(c.through);
  const h = a.rise;
  if (c.uFrom === 'min' && a.side === 'right' && l1.to[0] === 0 && l1.to[1] === h && a.to[1] === h && l2.to[0] === a.to[0] && l2.to[1] === 0 && a.to[0] > 0) {
    return { through: c.through, along: u, side: c.vFrom, span: a.to[0], rise: h };
  }
  if (c.vFrom === 'min' && a.side === 'left' && l1.to[1] === 0 && l1.to[0] === h && a.to[0] === h && l2.to[1] === a.to[1] && l2.to[0] === 0 && a.to[1] > 0) {
    return { through: c.through, along: v, side: c.uFrom, span: a.to[1], rise: h };
  }
  return null;
}

export interface CornerFields { through: Dimension; uFrom: CutFrom; vFrom: CutFrom; radius: number }

/** The corner at (`uFrom`, `vFrom`) rounded to `radius` — a quarter circle tangent to both sides. */
export function cornerCurve(f: CornerFields): Omit<CurveCut, 'id'> {
  const r = f.radius;
  return { through: f.through, uFrom: f.uFrom, vFrom: f.vFrom, start: [0, 0],
    segments: [{ type: 'line', to: [r, 0] }, { type: 'arc', to: [0, r], side: 'left', radius: r }, { type: 'line', to: [0, 0] }] };
}

export function cornerFields(c: Omit<CurveCut, 'id'>): CornerFields | null {
  if (c.segments.length !== 3 || c.start[0] !== 0 || c.start[1] !== 0) return null;
  const [l1, a, l2] = c.segments as [CurveSegment, CurveSegment, CurveSegment];
  if (l1.type !== 'line' || a.type !== 'arc' || a.radius === undefined || l2.type !== 'line' || a.side !== 'left') return null;
  const r = a.radius;
  if (l1.to[0] !== r || l1.to[1] !== 0 || a.to[0] !== 0 || a.to[1] !== r || l2.to[0] !== 0 || l2.to[1] !== 0) return null;
  return { through: c.through, uFrom: c.uFrom, vFrom: c.vFrom, radius: r };
}

export type CurveKind = 'arch' | 'bow' | 'corner';
export function deriveCurveKind(c: Omit<CurveCut, 'id'>): CurveKind | null {
  return archFields(c) ? 'arch' : bowFields(c) ? 'bow' : cornerFields(c) ? 'corner' : null;
}

const flipFrom = (f: CutFrom): CutFrom => (f === 'min' ? 'max' : 'min');

/** A curve reflected along dimension `d` (inv 44): a FLAG FLIP, never arithmetic on coordinates — `uFrom` when u is `d`,
 *  `vFrom` when v is, nothing when `d` is `through` (the cut runs right through it). `side` is defined on stored numbers,
 *  which do not change, so it is untouched; `localSegments` flips it where the mapping reflects. Its own inverse. */
export function mirrorCurveCut(c: CurveCut, d: Dimension): CurveCut {
  if (d === c.through) return c;
  const [u] = uvDims(c.through);
  return d === u ? { ...c, uFrom: flipFrom(c.uFrom) } : { ...c, vFrom: flipFrom(c.vFrom) };
}
