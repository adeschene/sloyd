import type { Board } from './types';
import type { Vec3 } from './frames';
import { partGeometry } from './bodies';
import { worldBox } from './designCheck';
import { axisFrame, boardExtents } from './geometry';
import { toWorld } from './snapPoints';
import { holeDrawingSegments } from './holeDrawing';
import { curveDrawEdges, silhouetteLines } from './curveDrawing';

/**
 * An orthographic view (plans-sheet spec §2.2). `toward` points from the model TO the viewer;
 * `right` and `up` are the screen axes. World Y is up. The names label dimension axes.
 */
export interface View {
  toward: Vec3; right: Vec3; up: Vec3;
  title: string; rightName: string; upName: string;
}

const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const R6 = Math.sqrt(6);
export const FRONT: View = { toward: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], title: 'Front', rightName: 'Width', upName: 'Height' };
export const SIDE: View = { toward: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0], title: 'Side', rightName: 'Depth', upName: 'Height' };
/** `up = -Z` puts the piece's front edge at the bottom of the plan, next to the front view (third-angle). */
export const TOP: View = { toward: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1], title: 'Plan', rightName: 'Width', upName: 'Depth' };
/** From front-right-above; `up = toward × right`. */
export const ISO: View = {
  toward: [1 / R3, 1 / R3, 1 / R3], right: [1 / R2, 0, -1 / R2], up: [-1 / R6, 2 / R6, -1 / R6],
  title: 'Exploded', rightName: '', upName: '',
};

export type P2 = [number, number];
export interface Seg2 { a: P2; b: P2; part: string }
export interface Drawing { visible: Seg2[]; hidden: Seg2[]; bounds: { min: P2; max: P2 } }

/**
 * Inches. Well above the float drift of `position + toWorldOffset` sums at furniture scale, far
 * below anything visible at print scale. Not TOUCH, not FLUSH_EPSILON — do not unify them.
 */
export const DRAW_EPS = 1e-6;

const dot = (p: readonly number[], v: readonly number[]) => p[0]! * v[0]! + p[1]! * v[1]! + p[2]! * v[2]!;
const plus = (p: readonly number[], o: readonly number[] | undefined): Vec3 =>
  [p[0]! + (o?.[0] ?? 0), p[1]! + (o?.[1] ?? 0), p[2]! + (o?.[2] ?? 0)];

/** Keep the part of a convex (t, s) polygon where a·t + b·s + c ≥ 0 (Sutherland–Hodgman, one edge). */
function clip(poly: P2[], a: number, b: number, c: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const fp = a * p[0] + b * p[1] + c;
    const fq = a * q[0] + b * q[1] + c;
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) {
      const r = fp / (fp - fq);
      out.push([p[0] + r * (q[0] - p[0]), p[1] + r * (q[1] - p[1])]);
    }
  }
  return out;
}

/**
 * The t-range of the edge a→e hidden by one CLOSED box (spec §2.3): some s ≥ DRAW_EPS with both
 * P(t) + s·toward and P(t) + (s + DRAW_EPS)·toward inside the box grown by DRAW_EPS/2. Closed, so a
 * ray along the seam between two abutting solids of one part counts as inside (the union is solid).
 * The second sample requires the ray to spend at least DRAW_EPS inside the box; an edge drifted
 * ~1.5·DRAW_EPS inside a face the ray leaves through still counts as visible. An edge exactly on
 * such a face is already rejected by the s ≥ DRAW_EPS floor plus the DRAW_EPS/2 growth.
 */
export function hiddenSpan(
  a: Vec3, e: Vec3, box: { min: readonly number[]; max: readonly number[] }, toward: Vec3, sMax: number,
): [number, number] | null {
  const d = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
  const grow = DRAW_EPS / 2;
  let poly: P2[] = [[0, DRAW_EPS], [1, DRAW_EPS], [1, sMax], [0, sMax]];
  for (let i = 0; i < 3; i++) {
    const v = toward[i]!;
    for (const sigma of [0, DRAW_EPS]) {
      poly = clip(poly, d[i]!, v, a[i]! + sigma * v - box.min[i]! + grow);
      poly = clip(poly, -d[i]!, -v, box.max[i]! + grow - a[i]! - sigma * v);
      if (poly.length === 0) return null;
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const [t] of poly) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
  return hi > lo ? [lo, hi] : null;
}

const DIM_INDEX = { length: 0, width: 1, thickness: 2 } as const;

/** A body in world space for the drawings (spec §3.5): its box when no angle cut clipped it (today's exact
 *  path), else its world vertices and its faces as inside-half-spaces m·x + c >= 0 (derived from the faces:
 *  m is the negated world outward normal, c = n·v0). */
export interface WorldBody { box: { min: Vec3; max: Vec3 } | null; verts: Vec3[]; planes: { m: Vec3; c: number }[] }

export function worldBodies(b: Board): WorldBody[] {
  const frame = axisFrame(b);
  return partGeometry(b).bodies.map((body) => {
    if (body.box) {
      const w = worldBox(b, body.box);
      return { box: { min: w.min as unknown as Vec3, max: w.max as unknown as Vec3 }, verts: [], planes: [] };
    }
    const toW = ([l, w, t]: readonly number[]) => toWorld(b, { length: l!, width: w!, thickness: t! });
    const verts = body.faces.flatMap((f) => f.verts.map(toW));
    const planes = body.faces.map((f) => {
      const n = [0, 1, 2].map((i) => f.n[DIM_INDEX[frame[i]!.dim]]! * (frame[i]!.reversed ? -1 : 1)) as Vec3;
      const v0 = toW(f.verts[0]!);
      return { m: [-n[0], -n[1], -n[2]] as Vec3, c: dot(n, v0) };
    });
    return { box: null, verts, planes };
  });
}

/** hiddenSpan against any convex solid given as inside half-spaces m·x + c >= 0, |m| = 1. Same clip, same grow. */
export function hiddenSpanPlanes(
  a: Vec3, e: Vec3, planes: readonly { m: readonly number[]; c: number }[], toward: Vec3, sMax: number,
): [number, number] | null {
  const d = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
  const grow = DRAW_EPS / 2;
  let poly: P2[] = [[0, DRAW_EPS], [1, DRAW_EPS], [1, sMax], [0, sMax]];
  for (const { m, c } of planes) {
    const md = dot(m, d);
    const mv = dot(m, toward);
    const ma = dot(m, a);
    for (const sigma of [0, DRAW_EPS]) {
      poly = clip(poly, md, mv, ma + sigma * mv + c + grow);
      if (poly.length === 0) return null;
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const [t] of poly) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
  return hi > lo ? [lo, hi] : null;
}

/** A part's BOARD box in world space, offset. Bounds read this, not the solids (Review Focus 1). */
function boardBox(b: Board, off: readonly number[] | undefined): { min: Vec3; max: Vec3 } {
  const ext = boardExtents(b);
  const min = plus(b.position, off);
  return { min, max: [min[0] + ext[0], min[1] + ext[1], min[2] + ext[2]] };
}

const corners = (bx: { min: readonly number[]; max: readonly number[] }): Vec3[] =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [
    (k & 1 ? bx.max : bx.min)[0]!, (k & 2 ? bx.max : bx.min)[1]!, (k & 4 ? bx.max : bx.min)[2]!,
  ]);

/** One line to draw, world space, no explode offset: a chord and, on a curved part, the fine path along it (curves spec
 *  §5.1, ruling Q2: visibility is decided on the chord A→E; the path only changes what is drawn). */
interface Seg3 { A: Vec3; E: Vec3; path?: { pts: Vec3[]; at: number[] }; lift?: Vec3 }

function partSegments(b: Board, toward: readonly number[]): Seg3[] {
  if (b.curves.length === 0) return partGeometry(b).edges.map(([p, q]) => ({ A: toWorld(b, p), E: toWorld(b, q) }));
  const W = (p: readonly number[]) => toWorld(b, { length: p[0]!, width: p[1]!, thickness: p[2]! });
  return curveDrawEdges(b).map((e) => {
    const A = W(e.p);
    const E = W(e.q);
    if (!e.path) return { A, E };
    const step = [e.p[0], e.p[1], e.p[2]];
    step[e.path.k] = step[e.path.k]! + 1;
    // Edge-on (ruling Q3): the outline's plane holds the view direction, so a fine path would fold over itself on
    // screen (holes chunk 2 R2) — the model chord stands.
    const n = W(step).map((x, i) => x - A[i]!);
    if (Math.abs(dot(n, toward)) <= 1e-9) return { A, E };
    return { A, E, path: { pts: e.path.pts.map(W), at: e.path.at } };
  });
}

/**
 * Visible and hidden 2D segments for `parts` seen through `view` (spec §2). Edges from
 * `boardEdges` (invariant 16) — on a curved part through `curveDrawEdges`, the fine path drawn with its chord's
 * visibility (curves spec §5.1, Q2, Q3) — and hole lines from `holeDrawingSegments` (holes spec §3.4), through `toWorld`, and the curved surfaces' silhouettes from `curveSilhouettes` (ruling Q1; probed `lift`ed toward the viewer, see `silhouetteLines`); occluders from `worldBodies` (invariant 38 as amended by angle-cuts spec §10).
 * No drawing order is involved, so cyclic overlaps are exact.
 */
export function drawView(parts: readonly Board[], view: View, offsets?: ReadonlyMap<string, Vec3>): Drawing {
  const proj = (p: readonly number[]): P2 => [dot(p, view.right), dot(p, view.up)];
  const visible: Seg2[] = [];
  const hidden: Seg2[] = [];
  if (parts.length === 0) return { visible, hidden, bounds: { min: [0, 0], max: [0, 0] } };

  const boxes = parts.map((b) => boardBox(b, offsets?.get(b.id)));
  const screen = boxes.flatMap((bx) => corners(bx).map(proj));
  const bounds = {
    min: [Math.min(...screen.map((p) => p[0])), Math.min(...screen.map((p) => p[1]))] as P2,
    max: [Math.max(...screen.map((p) => p[0])), Math.max(...screen.map((p) => p[1]))] as P2,
  };
  const lo = [0, 1, 2].map((i) => Math.min(...boxes.map((bx) => bx.min[i]!)));
  const hi = [0, 1, 2].map((i) => Math.max(...boxes.map((bx) => bx.max[i]!)));
  const sMax = Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) + 1;

  const solids = parts.flatMap((b) => {
    const off = offsets?.get(b.id);
    return worldBodies(b).map((w) => {
      const pts = w.box ? corners({ min: plus(w.box.min, off), max: plus(w.box.max, off) }) : w.verts.map((p) => plus(p, off));
      const sp = pts.map(proj);
      return {
        bx: w.box ? { min: plus(w.box.min, off), max: plus(w.box.max, off) } : null,
        planes: w.box ? null : w.planes.map(({ m, c }) => ({ m, c: c - dot(m, off ?? [0, 0, 0]) })),
        rmin: [Math.min(...sp.map((p) => p[0])), Math.min(...sp.map((p) => p[1]))],
        rmax: [Math.max(...sp.map((p) => p[0])), Math.max(...sp.map((p) => p[1]))],
        depthMax: Math.max(...pts.map((p) => dot(p, view.toward))),
      };
    });
  });

  for (const b of parts) {
    const off = offsets?.get(b.id);
    // Board edges (invariant 16) and hole lines (holes spec §3.4): one list, one hidden-line pass, the same occluders —
    // the hole-free bodies, so a through-bore's far rim seen down its axis is hidden (spec §3.4, pinned by test).
    const segments: Seg3[] = [
      ...partSegments(b, view.toward),
      ...holeDrawingSegments(b, view.toward).map(([A, E]) => ({ A, E })),
      ...silhouetteLines(b, view.toward),
    ];
    for (const seg of segments) {
      const A = plus(seg.A, off);
      const E = plus(seg.E, off);
      const pa = proj(A);
      const pe = proj(E);
      const length = Math.hypot(pe[0] - pa[0], pe[1] - pa[1]);
      if (length < DRAW_EPS) continue; // runs along the view direction: a point on screen
      const depthMin = Math.min(dot(A, view.toward), dot(E, view.toward));
      const segMin = [Math.min(pa[0], pe[0]), Math.min(pa[1], pe[1])];
      const segMax = [Math.max(pa[0], pe[0]), Math.max(pa[1], pe[1])];

      const pA = seg.lift ? plus(A, seg.lift) : A; // the hidden test's probe (silhouettes only)
      const pE = seg.lift ? plus(E, seg.lift) : E;
      const spans: [number, number][] = [];
      for (const s of solids) {
        // Pure prefilter: a solid entirely behind the edge, or off to the side on screen, hides none of it.
        if (s.depthMax < depthMin) continue;
        if (s.rmax[0]! < segMin[0]! - DRAW_EPS || s.rmin[0]! > segMax[0]! + DRAW_EPS) continue;
        if (s.rmax[1]! < segMin[1]! - DRAW_EPS || s.rmin[1]! > segMax[1]! + DRAW_EPS) continue;
        const span = s.bx ? hiddenSpan(pA, pE, s.bx, view.toward, sMax) : hiddenSpanPlanes(pA, pE, s.planes!, view.toward, sMax);
        if (span) spans.push(span);
      }
      spans.sort((x, y) => x[0] - y[0]);
      const merged: [number, number][] = [];
      for (const s of spans) {
        const last = merged[merged.length - 1];
        if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
        else merged.push([s[0], s[1]]);
      }

      const at = (t: number): P2 => [pa[0] + t * (pe[0] - pa[0]), pa[1] + t * (pe[1] - pa[1])];
      const pp = seg.path?.pts.map((x) => proj(plus(x, off)));
      // The path's point at chord parameter t: between the two nodes bracketing it.
      const along = (t: number): P2 => {
        const ts = seg.path!.at;
        let i = 0;
        while (i < ts.length - 2 && ts[i + 1]! < t) i += 1;
        const f = (t - ts[i]!) / (ts[i + 1]! - ts[i]!);
        return [pp![i]![0] + f * (pp![i + 1]![0] - pp![i]![0]), pp![i]![1] + f * (pp![i + 1]![1] - pp![i]![1])];
      };
      const push = (out: Seg2[], t0: number, t1: number) => {
        if ((t1 - t0) * length < DRAW_EPS) return;
        if (!seg.path) { out.push({ a: at(t0), b: at(t1), part: b.id }); return; }
        const pts = [along(t0), ...pp!.filter((_, i) => seg.path!.at[i]! > t0 && seg.path!.at[i]! < t1), along(t1)];
        for (let i = 0; i + 1 < pts.length; i += 1) {
          const [p, q] = [pts[i]!, pts[i + 1]!];
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= 1e-12) out.push({ a: p, b: q, part: b.id });
        }
      };
      let cur = 0;
      for (const [s0, s1] of merged) {
        push(visible, cur, Math.max(cur, s0));
        push(hidden, Math.max(0, s0), Math.min(1, s1));
        cur = Math.max(cur, s1);
      }
      push(visible, cur, 1);
    }
  }
  return { visible, hidden, bounds };
}
