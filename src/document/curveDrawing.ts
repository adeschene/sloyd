// src/document/curveDrawing.ts
import type { Board } from './types';
import { DIMENSION_ORDER } from './geometry';
import { partGeometry } from './bodies';
import { toWorld } from './snapPoints';
import type { Segment } from './cuts';
import {
  arcChords, arcPoint, curveOutline, distToSegment, localSegments, twiceArea, uvDims, CURVE_SEGMENTS_MAX, CURVE_TOLERANCE, type LocalArc, type P2,
} from './curves';

type V3 = [number, number, number];

/** Inches: a printed arc's greatest gap to the true arc (curves spec §5.1). The model keeps CURVE_TOLERANCE (0.005). */
export const DRAWING_CURVE_TOLERANCE = 0.001;
/** Chords per arc on paper, at most (as hole rims are 96-gons on the sheet). */
export const DRAWING_CURVE_SEGMENTS_MAX = 96;
/** Inches: an edge end matched to a model chord (body vertices are plane intersections, not arcPoint's numbers). */
const ON_CHORD = 1e-7;

/**
 * One drawing edge, board-local. `path` is set when the edge lies on a model chord of an arc: the fine path from p to q,
 * p and q themselves first and last (a split end stays where the model put it, ruling Q4), the nodes between ON the
 * true arc; at[i] is pts[i]'s parameter along p→q (0 … 1, increasing); k the through axis — the plane's normal.
 */
export interface DrawEdge { p: V3; q: V3; path?: { pts: V3[]; at: number[]; k: number } }

const v3 = (p: Segment[0]): V3 => [p.length, p.width, p.thickness];
const memo = new WeakMap<readonly Segment[], readonly DrawEdge[]>();

/** Fine pieces per model chord: the drawing tolerance's count spread over the model's chords, never past 96 per arc. */
function perChord(arc: LocalArc, n: number): number {
  const N = arcChords(arc, DRAWING_CURVE_TOLERANCE, DRAWING_CURVE_SEGMENTS_MAX);
  return Math.max(1, Math.min(Math.ceil(N / n), Math.floor(DRAWING_CURVE_SEGMENTS_MAX / n)));
}

/** The arc fraction of x on model chord j (P→Q) by central projection; exact at the chord's ends. */
function fractionOn(arc: LocalArc, n: number, j: number, P: P2, Q: P2, x: P2): number {
  const dx = Q[0] - P[0];
  const dy = Q[1] - P[1];
  const t = Math.min(1, Math.max(0, ((x[0] - P[0]) * dx + (x[1] - P[1]) * dy) / (dx * dx + dy * dy)));
  const h = Math.abs(arc.sweep) / n / 2;
  const phi = t === 0 ? 0 : t === 1 ? 1 : 0.5 + Math.atan((2 * t - 1) * Math.tan(h)) / (2 * h);
  return (j + phi) / n;
}

/**
 * A curved part's model edges for the Plans sheet (curves spec §5.1): every edge lying on an arc's model chord carries the
 * fine path along the true arc between its ends. drawView decides visibility on the chord (ruling Q2). A part without
 * curves gets its edges back unchanged. Memoised on partGeometry's frozen edges (shared by one geometryKey only).
 */
export function curveDrawEdges(board: Board): readonly DrawEdge[] {
  const edges = partGeometry(board).edges;
  const hit = memo.get(edges);
  if (hit) return hit;
  const chords = board.curves.flatMap((c) => {
    const [u, v] = uvDims(c.through);
    const ui = DIMENSION_ORDER.indexOf(u);
    const vi = DIMENSION_ORDER.indexOf(v);
    const k = DIMENSION_ORDER.indexOf(c.through);
    return localSegments(board, c).flatMap((s) => {
      if (s.kind !== 'arc') return [];
      const n = arcChords(s, CURVE_TOLERANCE, CURVE_SEGMENTS_MAX);
      const m = perChord(s, n);
      return Array.from({ length: n }, (_, j) => ({ arc: s, n, m, j, P: arcPoint(s, j / n), Q: arcPoint(s, (j + 1) / n), ui, vi, k }));
    });
  });
  const out: DrawEdge[] = edges.map(([P0, Q0]) => {
    const p = v3(P0);
    const q = v3(Q0);
    for (const ch of chords) {
      if (Math.abs(p[ch.k]! - q[ch.k]!) > 1e-9) continue;
      const a: P2 = [p[ch.ui]!, p[ch.vi]!];
      const b: P2 = [q[ch.ui]!, q[ch.vi]!];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= 1e-9) continue;
      if (distToSegment(a, ch.P, ch.Q) > ON_CHORD || distToSegment(b, ch.P, ch.Q) > ON_CHORD) continue;
      const fa = fractionOn(ch.arc, ch.n, ch.j, ch.P, ch.Q, a);
      const fb = fractionOn(ch.arc, ch.n, ch.j, ch.P, ch.Q, b);
      const lo = Math.min(fa, fb);
      const hi = Math.max(fa, fb);
      const nodes: P2[] = [];
      for (let i = 1; i < ch.m; i += 1) {
        const f = (ch.j + i / ch.m) / ch.n;
        if (f > lo + 1e-12 && f < hi - 1e-12) nodes.push(arcPoint(ch.arc, f));
      }
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      const param = (x: P2) => ((x[0] - a[0]) * dx + (x[1] - a[1]) * dy) / l2;
      nodes.sort((x, y) => param(x) - param(y));
      const lift = (x: P2): V3 => { const r: V3 = [p[0], p[1], p[2]]; r[ch.ui] = x[0]; r[ch.vi] = x[1]; return r; };
      return { p, q, path: { pts: [p, ...nodes.map(lift), q], at: [0, ...nodes.map(param), 1], k: ch.k } };
    }
    return { p, q };
  });
  const frozen = Object.freeze(out.map((e) => Object.freeze(e)));
  memo.set(edges, frozen);
  return frozen;
}

/**
 * The silhouette lines of a part's curved surfaces for a view looking along `toward` (ruling Q1), world space, no explode
 * offset: a line along each curve's `through`, the whole way through, at every SMOOTH model outline vertex whose two
 * faces face opposite ways to the view (a face exactly edge-on counts). The MODEL vertex, not the true tangent point: it
 * lies on the body boundary, so drawView's occluders judge it as they judge every other edge. Sharp vertices are
 * curvedEdges' lines already. An outline edge lying on the face rectangle stands in for the part's own face there.
 * Built only through `toWorld` (invariant 44). drawView decides what is hidden.
 */
export function curveSilhouettes(board: Board, toward: readonly number[]): [V3, V3][] {
  return silhouetteLines(board, toward).map(({ A, E }) => [A, E]);
}

/** Inches: how far a silhouette's hidden-line probe is stepped toward the viewer (`toward` is a unit vector). */
const PROBE = 1e-4;

/**
 * curveSilhouettes with each line's `lift`: a world offset (toward the viewer) that drawView adds to the line ONLY when it
 * judges what hides it. The line lies exactly on the body boundary where a chord leaves the face at a shallow angle, so
 * the occluders' DRAW_EPS growth would otherwise count the part's own wood as hiding it (measured: a rounded top's near
 * end line read hidden). Stepping toward the viewer, not sideways, keeps a far line's seam against the wood it is behind. The drawn position is never moved.
 */
export function silhouetteLines(board: Board, toward: readonly number[]): { A: V3; E: V3; lift: V3 }[] {
  const out: { A: V3; E: V3; lift: V3 }[] = [];
  for (const c of board.curves) {
    const [u, v] = uvDims(c.through);
    const ui = DIMENSION_ORDER.indexOf(u);
    const vi = DIMENSION_ORDER.indexOf(v);
    const k = DIMENSION_ORDER.indexOf(c.through);
    const W = (x: P2, depth: number): V3 => {
      const p: V3 = [0, 0, 0];
      p[ui] = x[0]; p[vi] = x[1]; p[k] = depth;
      return toWorld(board, { length: p[0], width: p[1], thickness: p[2] });
    };
    const o = W([0, 0], 0);
    const axis = (x: P2) => W(x, 0).map((w, i) => w - o[i]!);
    const dot3 = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    const d: P2 = [dot3(axis([1, 0]), toward), dot3(axis([0, 1]), toward)];
    if (Math.hypot(d[0], d[1]) <= 1e-9) continue; // looking down `through`
    const { pts, smooth } = curveOutline(board, c);
    const ccw = twiceArea(pts) > 0;
    const U = board[u];
    const V = board[v];
    const at = (x: number, y: number) => Math.abs(x - y) <= 1e-9;
    const normal = (a: P2, b: P2): P2 => {
      if (at(a[0], 0) && at(b[0], 0)) return [-1, 0];
      if (at(a[0], U) && at(b[0], U)) return [1, 0];
      if (at(a[1], 0) && at(b[1], 0)) return [0, -1];
      if (at(a[1], V) && at(b[1], V)) return [0, 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const left: P2 = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
      return ccw ? left : [-left[0], -left[1]];
    };
    const m = pts.length;
    pts.forEach((q, i) => {
      if (!smooth[i]) return;
      const n1 = normal(pts[(i - 1 + m) % m]!, q);
      const n2 = normal(q, pts[(i + 1) % m]!);
      if ((n1[0] * d[0] + n1[1] * d[1]) * (n2[0] * d[0] + n2[1] * d[1]) > 0) return;
      const lift = toward.map((t) => PROBE * t) as V3;
      out.push({ A: W(q, 0), E: W(q, board[c.through]), lift });
    });
  }
  return out;
}
