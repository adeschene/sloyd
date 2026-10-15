import type { V3 } from '../document/document';

/**
 * T-junction repair for a curved part's faces and section cap (whole-branch review, finding 1). A SPLIT curve leaves
 * its slices' coplanar faces meeting at T-junctions: a slice's chord vertex lies inside its neighbour's edge. Drawn as
 * they are, the two triangulations do not share that vertex, and the rasteriser leaves pinholes along the edge (seen in
 * the arch's shadow and on its cap). The repair is the standard one: every vertex lying strictly inside a polygon's edge
 * is inserted into that edge, so neighbouring faces share every vertex they touch, and the polygon is then fanned from
 * its centroid — never from vertex 0, whose zero-area triangles `facing` drops (an inserted vertex on an edge at the fan's
 * root would reopen the crack).
 *
 * Inserted vertices are the CANDIDATES' own objects, never a projection onto the edge: a projected point is a different
 * number, and an exact Float32 match is the whole point.
 */

/** How far a candidate may sit from an edge's line, or from a vertex, and still count as on it / the same point (inches
 *  in a part's own frame, or world inches for a cap): far above the clip arithmetic's rounding (~1e-14 on 30"), far below
 *  anything drawn. */
export const CONFORM_EPS = 1e-7;

/**
 * A part's (or a cap's) vertices WELDED: every point within CONFORM_EPS of an earlier one is represented by that earlier
 * object. Two bodies compute "the same" corner by different arithmetic (a crown at mid-length: 15 − 15 = 0 in one slice,
 * 1.8e-15 in the next), and near zero Float32 keeps those apart — a crack as real as a T-junction. `points` are the
 * distinct representatives, in first-seen order; `canon` maps any point to its representative (itself when new to the
 * welder, which then adds it). A grid of cells wider than the tolerance, the 27 around a point searched, so no pair is
 * missed at a cell boundary.
 */
export function welder(input: Iterable<V3> = []): { points: V3[]; canon: (p: V3) => V3 } {
  const CELL = 1e-6;
  const cells = new Map<string, V3[]>();
  const points: V3[] = [];
  // A coordinate's cell, and the neighbouring cell when it lies within the tolerance of a boundary (else the same):
  // almost every point searches ONE cell.
  const span = (x: number): [number, number] => [Math.floor((x - CONFORM_EPS) / CELL), Math.floor((x + CONFORM_EPS) / CELL)];
  const canon = (p: V3): V3 => {
    const [i0, i1] = span(p[0]), [j0, j1] = span(p[1]), [k0, k1] = span(p[2]);
    for (let a = i0; a <= i1; a += 1) for (let b = j0; b <= j1; b += 1) for (let c = k0; c <= k1; c += 1) {
      for (const q of cells.get(`${a},${b},${c}`) ?? []) {
        if (q === p || (Math.abs(q[0] - p[0]) <= CONFORM_EPS && Math.abs(q[1] - p[1]) <= CONFORM_EPS && Math.abs(q[2] - p[2]) <= CONFORM_EPS)) return q;
      }
    }
    const key = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)},${Math.floor(p[2] / CELL)}`;
    const list = cells.get(key);
    if (list) list.push(p); else cells.set(key, [p]);
    points.push(p);
    return p;
  };
  for (const p of input) canon(p);
  return { points, canon };
}

/** Candidate vertices sorted by x, for insertOnEdges' range search (a face's bounding box picks the few it can take). */
export interface Candidates { pts: V3[]; xs: Float64Array }
export function candidates(points: readonly V3[]): Candidates {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  return { pts, xs: Float64Array.from(pts, (p) => p[0]) };
}

/**
 * `poly` (planar, normal `n`) with every candidate that lies strictly inside one of its edges inserted there, in order
 * along the edge; the same array when none does. Only candidates inside the polygon's bounding box (a range of the
 * x-sorted list) and on its plane are tried against the edges.
 */
export function insertOnEdges(poly: readonly V3[], n: readonly number[], cands: Candidates): readonly V3[] {
  const q = poly[0]!;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of poly) for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k]!, p[k]!); hi[k] = Math.max(hi[k]!, p[k]!); }
  const { pts, xs } = cands;
  let j = 0, top = xs.length;
  while (j < top) { const mid = (j + top) >> 1; if (xs[mid]! < lo[0]! - CONFORM_EPS) j = mid + 1; else top = mid; }
  const near: V3[] = [];
  for (; j < xs.length && xs[j]! <= hi[0]! + CONFORM_EPS; j += 1) {
    const p = pts[j]!;
    if (p[1] < lo[1]! - CONFORM_EPS || p[1] > hi[1]! + CONFORM_EPS || p[2] < lo[2]! - CONFORM_EPS || p[2] > hi[2]! + CONFORM_EPS) continue;
    if (Math.abs(n[0]! * (p[0] - q[0]) + n[1]! * (p[1] - q[1]) + n[2]! * (p[2] - q[2])) <= CONFORM_EPS) near.push(p);
  }
  if (near.length === 0) return poly;
  let out: V3[] | null = null;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const d0 = b[0] - a[0], d1 = b[1] - a[1], d2 = b[2] - a[2];
    const len = Math.hypot(d0, d1, d2);
    const on: { t: number; p: V3 }[] = [];
    if (len > 2 * CONFORM_EPS) {
      for (const p of near) {
        const t = ((p[0] - a[0]) * d0 + (p[1] - a[1]) * d1 + (p[2] - a[2]) * d2) / len;   // distance along the edge
        if (t <= CONFORM_EPS || t >= len - CONFORM_EPS) continue;
        const s = t / len;
        if (Math.hypot(p[0] - a[0] - s * d0, p[1] - a[1] - s * d1, p[2] - a[2] - s * d2) > CONFORM_EPS) continue;
        on.push({ t, p });
      }
    }
    // Copied lazily: up to and including this edge's start, the first time an edge takes a vertex.
    if (on.length > 0 && !out) out = poly.slice(0, i + 1);
    if (out) {
      on.sort((x, y) => x.t - y.t);
      let last = -Infinity;
      for (const { t, p } of on) { if (t - last > CONFORM_EPS) { out.push(p); last = t; } }
      if (i + 1 < poly.length) out.push(poly[i + 1]!);
    }
  }
  return out ?? poly;
}

/** A convex polygon as a fan about its vertex centroid (one new vertex): no triangle has zero area unless two
 *  consecutive vertices coincide. */
export function centroidFan(poly: readonly V3[]): V3[][] {
  const c: V3 = [0, 0, 0];
  for (const p of poly) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  c[0] /= poly.length; c[1] /= poly.length; c[2] /= poly.length;
  return poly.map((p, i) => [c, p, poly[(i + 1) % poly.length]!]);
}
