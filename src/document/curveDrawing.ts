// src/document/curveDrawing.ts
import type { Board } from './types';
import { DIMENSION_ORDER } from './geometry';
import { partGeometry } from './bodies';
import type { Segment } from './cuts';
import {
  arcChords, arcPoint, distToSegment, localSegments, uvDims, CURVE_SEGMENTS_MAX, CURVE_TOLERANCE, type LocalArc, type P2,
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
