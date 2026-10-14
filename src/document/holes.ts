import type { Board, Dimension, HoleRow, Region } from './types';
import type { V3 } from './angleCuts';
import { DIMENSION_ORDER } from './geometry';

/**
 * Every field of `HoleRow` that decides "same hole row": all but `id` (holes spec §4.2). A TABLE CHECKED AGAINST THE
 * TYPE (invariant 40's pattern): a new `HoleRow` field fails `tsc` here until it is listed.
 */
export const HOLE_FIELDS = {
  face: true, from: true, diameter: true, depth: true, along: true, alongFrom: true,
  station: true, count: true, pitch: true, acrossFrom: true, inset: true,
} as const satisfies Record<Exclude<keyof HoleRow, 'id'>, true>;

export const HOLE_KEYS = Object.keys(HOLE_FIELDS) as (keyof typeof HOLE_FIELDS)[];

/** Holes per row, at most. A hand-edited count above it is dropped on load (expanding it would freeze the view). */
export const HOLE_COUNT_MAX = 500;

/** One row's comparable values, in HOLE_KEYS order. */
export function holeRowValues(r: Omit<HoleRow, 'id'>): (string | number)[] {
  return HOLE_KEYS.map((k) => r[k]);
}

/** Exact equality on every HOLE_FIELDS field (stored values, invariant 18). */
export function sameHoleRow(a: Omit<HoleRow, 'id'>, b: Omit<HoleRow, 'id'>): boolean {
  const x = holeRowValues(a);
  const y = holeRowValues(b);
  return x.every((v, i) => v === y[i]);
}

/** A copy that is not the same object, so no two parts ever hold one row. */
export function copyHoleRow(r: HoleRow): HoleRow {
  return { ...r };
}

/** The third dimension: neither the drill axis nor the row's direction. */
export function acrossOf(r: Pick<HoleRow, 'face' | 'along'>): Dimension {
  return DIMENSION_ORDER.find((d) => d !== r.face && d !== r.along)!;
}

/** Board-local half-space; the kept side is n·x + d ≥ 0. */
export interface Plane { n: V3; d: number }

/** One flat-bottomed cylinder, board-local `[length, width, thickness]` inches. `centre` lies on the entry plane;
 *  `dir` is +1 when the hole runs toward +axis (entered from the min face). */
export interface Hole {
  row: string; index: number; axis: Dimension; dir: 1 | -1;
  centre: V3; radius: number; depth: number; through: boolean;
}

/** The polygon a hole is rendered as, vertices on the true circle (spec §3.2). */
export const HOLE_SEGMENTS = 48;
/** Inches: comparisons, as BODY_EPS (holes.ts cannot import bodies.ts — bodies → cuts → holes). */
export const HOLE_EPS = 1e-9;
/** Inches the prism's caps are pushed out, so a face ON the entry plane (or a seam inside the depth) is strictly inside
 *  and is punched. Well above HOLE_EPS (clipPolygon's on-plane band), far below anything visible. */
export const PRISM_EPS = 1e-7;

const idx = (d: Dimension) => DIMENSION_ORDER.indexOf(d);
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The axis index and the two in-plane indices, in DIMENSION_ORDER. */
function frameOf(h: Pick<Hole, 'axis'>): { a: number; u: number; v: number } {
  const a = idx(h.axis);
  const [u, v] = [0, 1, 2].filter((i) => i !== a) as [number, number];
  return { a, u, v };
}

export function holeInstances(board: Pick<Board, Dimension>, row: HoleRow): Hole[] {
  const across = acrossOf(row);
  const through = row.depth === 'through';
  const depth = row.depth === 'through' ? board[row.face] : row.depth;
  const out: Hole[] = [];
  for (let k = 0; k < row.count; k += 1) {
    const s = row.station + k * row.pitch;
    const c: V3 = [0, 0, 0];
    c[idx(row.face)] = row.from === 'min' ? 0 : board[row.face];
    c[idx(row.along)] = row.alongFrom === 'min' ? s : board[row.along] - s;
    c[idx(across)] = row.acrossFrom === 'min' ? row.inset : board[across] - row.inset;
    out.push({ row: row.id, index: k, axis: row.face, dir: row.from === 'min' ? 1 : -1, centre: c, radius: row.diameter / 2, depth, through });
  }
  return out;
}

/** Every row's holes, rows in stored order. */
export function boardHoles(board: Pick<Board, Dimension | 'holes'>): Hole[] {
  return board.holes.flatMap((r) => holeInstances(board, r));
}

/** The ring at axial distance `t` from the entry plane: `n` points on the true circle, θ_k = 2πk/n from +u toward +v. */
export function holeRing(h: Hole, t: number, n = HOLE_SEGMENTS): V3[] {
  const { a, u, v } = frameOf(h);
  return Array.from({ length: n }, (_, k) => {
    const th = (2 * Math.PI * k) / n;
    const p: V3 = [h.centre[0], h.centre[1], h.centre[2]];
    p[a] += h.dir * t;
    p[u] += h.radius * Math.cos(th);
    p[v] += h.radius * Math.sin(th);
    return p;
  });
}

/**
 * The rendered cylinder as half-spaces whose kept sides are its inside: one per side facet (facet k between ring vertices
 * k and k+1, at distance r·cos(π/n) from the axis), then the entry cap, then the bottom cap — each cap pushed OUT by
 * PRISM_EPS (see there).
 */
export function holePrism(h: Hole, n = HOLE_SEGMENTS): Plane[] {
  const { a, u, v } = frameOf(h);
  const out: Plane[] = [];
  const inner = h.radius * Math.cos(Math.PI / n);
  for (let k = 0; k < n; k += 1) {
    const phi = (2 * Math.PI * (k + 0.5)) / n;
    const radial: V3 = [0, 0, 0];
    radial[u] = Math.cos(phi);
    radial[v] = Math.sin(phi);
    out.push({ n: [-radial[0], -radial[1], -radial[2]], d: inner + dot(radial, h.centre) });
  }
  const ax: V3 = [0, 0, 0];
  ax[a] = h.dir;
  out.push({ n: ax, d: -h.dir * h.centre[a] + PRISM_EPS });                                         // t ≥ -ε
  out.push({ n: [-ax[0], -ax[1], -ax[2]], d: h.dir * h.centre[a] + h.depth + PRISM_EPS });          // t ≤ depth + ε
  return out;
}

/** Keep the part of a convex planar polygon where n·x + d ≥ 0 (Sutherland–Hodgman). A vertex within HOLE_EPS of the
 *  plane is ON it and kept. Fewer than three points: []. Returns the SAME array when nothing is cut away. */
export function clipPolygon(verts: V3[], h: Plane): V3[] {
  const g = (p: V3) => dot(h.n, p) + h.d;
  if (verts.every((p) => g(p) >= -HOLE_EPS)) return verts;
  const out: V3[] = [];
  for (let i = 0; i < verts.length; i += 1) {
    const a = verts[i]!;
    const b = verts[(i + 1) % verts.length]!;
    const ga = g(a);
    const gb = g(b);
    if (ga >= -HOLE_EPS) out.push(a);
    if ((ga > HOLE_EPS && gb < -HOLE_EPS) || (ga < -HOLE_EPS && gb > HOLE_EPS)) {
      const t = ga / (ga - gb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]);
    }
  }
  return out.length >= 3 ? out : [];
}

const flipPlane = (h: Plane): Plane => ({ n: [-h.n[0], -h.n[1], -h.n[2]], d: -h.d });

/** Twice-area > this: a piece thinner than a sliver is no piece (bodies.ts' SLIVER, squared). */
const MIN_AREA = 1e-12;
function twiceArea(p: V3[]): number {
  let x = 0; let y = 0; let z = 0;
  for (let i = 1; i + 1 < p.length; i += 1) {
    const e: V3 = [p[i]![0] - p[0]![0], p[i]![1] - p[0]![1], p[i]![2] - p[0]![2]];
    const f: V3 = [p[i + 1]![0] - p[0]![0], p[i + 1]![1] - p[0]![1], p[i + 1]![2] - p[0]![2]];
    x += e[1] * f[2] - e[2] * f[1]; y += e[2] * f[0] - e[0] * f[2]; z += e[0] * f[1] - e[1] * f[0];
  }
  return Math.hypot(x, y, z);
}

/** True when the polygon is not wholly on or outside some plane of the prism: the hole reaches into it. */
export function holeTouches(h: Hole, poly: V3[]): boolean {
  return touchesPrism(holePrism(h), poly);
}
function touchesPrism(prism: Plane[], poly: V3[]): boolean {
  return !prism.some((q) => poly.every((p) => dot(q.n, p) + q.d <= HOLE_EPS));
}

/**
 * A convex planar polygon minus a convex prism, as DISJOINT convex pieces: piece i is the polygon outside plane i and
 * inside planes 0…i-1. A polygon the prism misses comes back whole (the same array). The fallback split (spec §3.2,
 * amended): it leaves T-junctions where a piece's edge passes ring vertices, so a face whose rings sit strictly inside
 * it is triangulated with them as holes instead (grainTiling's faceTriangles).
 */
export function minusPrism(poly: V3[], prism: Plane[]): V3[][] {
  if (!touchesPrism(prism, poly)) return [poly];
  const out: V3[][] = [];
  let rest = poly;
  for (const q of prism) {
    const outside = clipPolygon(rest, flipPlane(q));
    if (outside.length && twiceArea(outside) > MIN_AREA) out.push(outside);
    rest = clipPolygon(rest, q);
    if (!rest.length) break;
  }
  return out;
}

/** The face's axial distance from the hole's entry plane when the face is perpendicular to the axis, else null. */
export function axialOffset(h: Hole, face: { n: V3; verts: V3[] }): number | null {
  const { a } = frameOf(h);
  if (Math.abs(Math.abs(face.n[a]) - 1) > HOLE_EPS) return null;
  return h.dir * (face.verts[0]![a] - h.centre[a]);
}

/** Every ring vertex strictly inside the convex polygon (by more than HOLE_EPS from each edge). */
export function ringInside(poly: V3[], n: V3, ring: V3[]): boolean {
  const c: V3 = [0, 1, 2].map((k) => poly.reduce((s, p) => s + p[k]!, 0) / poly.length) as V3;
  return poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const e: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let m: V3 = [n[1] * e[2] - n[2] * e[1], n[2] * e[0] - n[0] * e[2], n[0] * e[1] - n[1] * e[0]];
    const l = Math.hypot(...m);
    m = [m[0] / l, m[1] / l, m[2] / l];
    if (dot(m, [c[0] - a[0], c[1] - a[1], c[2] - a[2]]) < 0) m = [-m[0], -m[1], -m[2]];
    return ring.every((p) => dot(m, [p[0] - a[0], p[1] - a[1], p[2] - a[2]]) > HOLE_EPS);
  });
}

/** A convex body's faces as inside half-spaces (closed): the wall and bottom are clipped to the stock with these. */
export function bodyPlanes(faces: readonly { n: V3; verts: V3[] }[]): Plane[] {
  return faces.map((f) => ({ n: [-f.n[0], -f.n[1], -f.n[2]], d: dot(f.n, f.verts[0]!) }));
}

/** Rim segments (spec §3.3, amended): the entry ring, and the ring at the far end — the exit rim of a through hole, the
 *  bottom crease of a blind one. Closed loops. */
export function holeRims(h: Hole): [V3, V3][] {
  return [holeRing(h, 0), holeRing(h, h.depth)].flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]!] as [V3, V3]));
}

/** The hole's bounding box overlaps the region (closed). Conservative: it decides only whether a body leaves the box path. */
export function holeTouchesBox(h: Hole, r: Region): boolean {
  const { a } = frameOf(h);
  return DIMENSION_ORDER.every((d, i) => {
    const [lo, hi] = i === a
      ? [Math.min(h.centre[a], h.centre[a] + h.dir * h.depth), Math.max(h.centre[a], h.centre[a] + h.dir * h.depth)]
      : [h.centre[i]! - h.radius, h.centre[i]! + h.radius];
    return lo <= r[d][1] + HOLE_EPS && hi >= r[d][0] - HOLE_EPS;
  });
}

/** The mouth is air (spec §3.5, amended): within the radius (open: the rim is stock) and between the caps (closed). */
export function insideHole(h: Hole, p: V3): boolean {
  const { a, u, v } = frameOf(h);
  const t = h.dir * (p[a] - h.centre[a]);
  return t >= -HOLE_EPS && t <= h.depth + HOLE_EPS && Math.hypot(p[u] - h.centre[u], p[v] - h.centre[v]) < h.radius - HOLE_EPS;
}
