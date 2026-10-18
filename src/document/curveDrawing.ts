// src/document/curveDrawing.ts
import type { Board } from './types';
import { DIMENSION_ORDER } from './geometry';
import { partGeometry, profileEdgeOf, smoothJoins, type BodyFace } from './bodies';
import { geometryBoard, shapedPart, sweptProfiles } from './profiles';
import { bodyPlanes } from './holes';
import { toWorld } from './snapPoints';
import type { Segment } from './cuts';
import {
  arcChords, arcPoint, curveOutline, distToSegment, localSegments, spanOf, twiceArea, uvDims, CURVE_SEGMENTS_MAX, CURVE_TOLERANCE, type LocalArc, type P2,
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
export interface DrawEdge { p: V3; q: V3; path?: { pts: V3[]; at: number[]; k: number }; curve?: string }

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
  board = geometryBoard(board);
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
      return Array.from({ length: n }, (_, j) => ({ arc: s, n, m, j, P: arcPoint(s, j / n), Q: arcPoint(s, (j + 1) / n), ui, vi, k, curve: c.id }));
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
      // Nodes are kept by central-projection fraction but `at` is orthogonal: next to a split end a fine node can project
      // to <= 0 or >= 1. Keep strictly inside, so `at` runs strictly 0 .. 1 and the path starts and ends exactly at p and q.
      nodes.splice(0, nodes.length, ...nodes.filter((x) => param(x) > 0 && param(x) < 1));
      nodes.sort((x, y) => param(x) - param(y));
      const lift = (x: P2): V3 => { const r: V3 = [p[0], p[1], p[2]]; r[ch.ui] = x[0]; r[ch.vi] = x[1]; return r; };
      return { p, q, path: { pts: [p, ...nodes.map(lift), q], at: [0, ...nodes.map(param), 1], k: ch.k }, curve: ch.curve };
    }
    return { p, q };
  });
  const frozen = Object.freeze(out.map((e) => {
    Object.freeze(e.p);
    Object.freeze(e.q);
    if (e.path) {
      for (const pt of e.path.pts) Object.freeze(pt);
      Object.freeze(e.path.pts);
      Object.freeze(e.path.at);
      Object.freeze(e.path);
    }
    return Object.freeze(e);
  }));
  memo.set(edges, frozen);
  return frozen;
}

/**
 * The silhouette lines of a part's curved surfaces for a view looking along `toward` (ruling Q1), world space, no explode
 * offset: a line along each curve's `through` at every SMOOTH model outline vertex whose two faces face opposite ways
 * to the view (a face exactly edge-on counts), drawn only where that vertex is on the wood (fu 375: clipped to the
 * part's bodies, so a dado or another cut that removes the wood there breaks the line; holes aside — a clean hole never
 * meets a curve's waste, and a faulted one is drawn approximately). The MODEL vertex, not the true tangent point: it
 * lies on the body boundary, so drawView's occluders judge it as they judge every other edge. Sharp vertices are
 * curvedEdges' lines already. An outline edge lying on the face rectangle stands in for the part's own face there.
 * Built only through `toWorld` (invariant 44). drawView decides what is hidden.
 */
export function curveSilhouettes(board: Board, toward: readonly number[]): [V3, V3][] {
  board = geometryBoard(board);
  return silhouetteLines(board, toward).map(({ A, E }) => [A, E]);
}

/**
 * The stretches of the board-local line at (u, v) = q, along dimension index `k` from `from` to `depth`, that lie in some
 * convex body (its closed planes; one parallel to the line is met within WOOD_EPS, since the line runs ON a body's
 * boundary), merged where they touch; a stretch shorter than WOOD_EPS is dropped.
 */
const WOOD_EPS = 1e-7;
function onWood(planes: readonly (readonly { n: readonly number[]; d: number }[])[], q: P2, ui: number, vi: number, k: number, depth: number, from = 0): [number, number][] {
  const spans: [number, number][] = [];
  for (const ps of planes) {
    let lo = from, hi = depth;
    for (const { n, d } of ps) {
      const f0 = n[ui]! * q[0] + n[vi]! * q[1] + d;   // n·p(t) + d ≥ 0, linear in t
      const fk = n[k]!;
      // A plane along the line (the line lies ON such a face): kept within WOOD_EPS. One crossing it clips exactly.
      if (Math.abs(fk) <= 1e-12) { if (f0 < -WOOD_EPS) { lo = 1; hi = 0; break; } continue; }
      const t = -f0 / fk;
      if (fk > 0) lo = Math.max(lo, t); else hi = Math.min(hi, t);
      if (lo > hi) break;
    }
    if (hi - lo > WOOD_EPS) spans.push([lo, hi]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const sp of spans) {
    const last = out[out.length - 1];
    if (last && sp[0] <= last[1] + WOOD_EPS) last[1] = Math.max(last[1], sp[1]); else out.push([sp[0], sp[1]]);
  }
  return out;
}

/** Inches: how far a silhouette's hidden-line probe is stepped out of each viewer-facing adjacent face. drawView's
 *  occluders grow every body by DRAW_EPS / 2 and sample the ray from DRAW_EPS on, so 4 x DRAW_EPS clears the growth
 *  by a wide margin. Along the face's own normal the clearance is this distance whatever the face's angle to the view
 *  (a toward-lift clears a shallow chord only by lift x n.toward, which vanishes with it). */
const PROBE = 4e-6; // 4 x drawing.ts' DRAW_EPS (1e-6), not imported: drawing.ts imports this file
/** A face whose outward normal meets the view within this (|n.d|) is EDGE-ON: neither facing nor away. One constant for
 *  both the silhouette test and the lift, so they classify a face alike (fu 386: an edge-on chord face read as +2.8e-16
 *  in the product test and as edge-on in the lift, so the silhouette took its far vertex with no lift and grazed hidden). */
const EDGE_ON = 1e-9;
const facing = (x: number) => (x > EDGE_ON ? 1 : x < -EDGE_ON ? -1 : 0);

/**
 * curveSilhouettes with each line's `lift`: a world offset that drawView adds to the line ONLY when it judges what hides
 * it; the drawn position is never moved. The line lies exactly on the body boundary, where a chord can leave the face at
 * a shallow angle, so the occluders' DRAW_EPS growth would otherwise count the part's own wood as hiding it (measured: a
 * rounded top's near end line read hidden). The lift is the sum of PROBE along the world outward normal of each adjacent
 * face with n.toward > 0 (strictly: it faces the viewer, so stepping out of it only moves the probe off that wood). A
 * face edge-on to the view, or facing away, contributes nothing, so a line hidden only by grazing, or one that lies
 * behind wood it seams against, stays hidden (spec 2.3).
 */
export function silhouetteLines(board: Board, toward: readonly number[]): { A: V3; E: V3; lift: V3; curve: string }[] {
  board = geometryBoard(board);
  const out: { A: V3; E: V3; lift: V3; curve: string }[] = [];
  const planes = shapedPart(board) ? partGeometry(board).bodies.map((b) => bodyPlanes(b.faces)) : [];
  for (const c of board.curves) {
    const o = outlineFaces(board, c);
    const { ui, vi, k, W, pts, smooth, normals } = o;
    const d: P2 = [dot3(o.wu, toward), dot3(o.wv, toward)];
    if (Math.hypot(d[0], d[1]) <= 1e-9) continue; // looking down `through`
    const m = pts.length;
    pts.forEach((q, i) => {
      if (!smooth[i]) return;
      const n1 = normals[(i - 1 + m) % m]!;
      const n2 = normals[i]!;
      // Fu 386: classify by EDGE_ON, never the raw product. A 3/8" roundover's middle chord sits at exactly 45 degrees,
      // edge-on to ISO; its n.d of +2.8e-16 skipped the NEAR vertex (facing | edge-on, lifted off the facing face) and kept
      // only the far one (edge-on | away: no lift, hidden by grazing), so the whole silhouette drew hidden. Edge-on counts
      // at both of the face's vertices, as it always did for an exactly-zero face (a rounded top's Front view).
      if (facing(n1[0] * d[0] + n1[1] * d[1]) * facing(n2[0] * d[0] + n2[1] * d[1]) > 0) return;
      const lift = liftOff([o.world(n1), o.world(n2)], toward);
      // Profile runs a2: a stopped profile's band holds its section over [lo, hi] only; past a stop the run-out's outline
      // is runoutSilhouettes' facet chain, and beyond it the corner is whole (no line of the profile's there).
      const span = spanOf(c);
      const [from, to] = span ? [span.lo, span.hi] : [0, board[c.through]];
      for (const [t0, t1] of onWood(planes, q, ui, vi, k, to, from)) out.push({ A: W(q, t0), E: W(q, t1), lift, curve: c.id });
    });
  }
  return out;
}

const dot3 = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** A board-local direction in world space (toWorld is affine: the difference of two points). */
function worldDir(board: Board, n: readonly number[]): V3 {
  const o = toWorld(board, { length: 0, width: 0, thickness: 0 });
  const w = toWorld(board, { length: n[0]!, width: n[1]!, thickness: n[2]! });
  return [w[0] - o[0], w[1] - o[1], w[2] - o[2]];
}

/**
 * Profile runs a2 (Task 7): the silhouettes of a stopped profile's run-outs (doubly curved, so no line along `through`
 * outlines them) for a view looking along `toward`, world space, no explode offset: every stretch where two of the
 * profile's faces meet without a crease (curvedEdges' `smoothPair` joins: a run-out's facets, and the band's arc faces at
 * a stop) and those two faces turn opposite ways to the view, judged on each face's own plane normal by `facing` (EDGE_ON
 * counts as neither, and as in silhouetteLines a face exactly edge-on counts at both its edges — fu 386: the facet that
 * IS the outline then draws on screen through both). The model's facet edges, so drawn as model chords (P19). The join is
 * an edge of the wood, so no clip. Each carries silhouetteLines' lift (PROBE along each viewer-facing face's world outward
 * normal, invariant 47). Empty for a part with no stop. Built only through `toWorld` (invariant 44).
 */
export function runoutSilhouettes(board: Board, toward: readonly number[]): { A: V3; E: V3; lift: V3; curve: string }[] {
  board = geometryBoard(board);
  const joins = smoothJoins(board);
  if (joins.length === 0) return [];
  const out: { A: V3; E: V3; lift: V3; curve: string }[] = [];
  const P = (p: readonly number[]): V3 => toWorld(board, { length: p[0]!, width: p[1]!, thickness: p[2]! }) as V3;
  const normal = new Map<BodyFace, V3>();
  const nOf = (f: BodyFace) => { let n = normal.get(f); if (!n) { n = worldDir(board, f.n); normal.set(f, n); } return n; };
  for (const j of joins) {
    const n1 = nOf(j.f1);
    const n2 = nOf(j.f2);
    if (facing(dot3(n1, toward)) * facing(dot3(n2, toward)) > 0) continue;
    const curve = (profileEdgeOf(j.f1) ?? profileEdgeOf(j.f2))!.curve;
    out.push({ A: P(j.a), E: P(j.b), lift: liftOff([n1, n2], toward), curve });
  }
  return out;
}

/** PROBE along each WORLD outward normal that faces the viewer (strictly, by EDGE_ON); edge-on and away add nothing. */
function liftOff(normals: readonly V3[], toward: readonly number[]): V3 {
  const lift: V3 = [0, 0, 0];
  for (const n of normals) {
    if (facing(dot3(n, toward)) <= 0) continue; // edge-on or facing away
    for (let j = 0; j < 3; j++) lift[j] += PROBE * n[j]!;
  }
  return lift;
}

/**
 * One curve's outline with the outward normal of the kept face along each outline edge (an edge lying on the face
 * rectangle stands in for the part's own face there), board-local in (u, v), and the world mappings. THE one home of
 * those normals: silhouetteLines and curveEdgeLifts read them alike.
 */
function outlineFaces(board: Board, c: Board['curves'][number]) {
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
  const axis = (x: P2) => W(x, 0).map((w, i) => w - o[i]!) as V3;
  const wu = axis([1, 0]);
  const wv = axis([0, 1]);
  const wk = W([0, 0], 1).map((w, i) => w - o[i]!) as V3;
  const { pts, smooth } = curveOutline(board, c);
  const ccw = twiceArea(pts) > 0;
  const U = board[u];
  const V = board[v];
  const at = (x: number, y: number) => Math.abs(x - y) <= 1e-9;
  const boundary: boolean[] = [];
  const normals = pts.map((a, i): P2 => {
    const b = pts[(i + 1) % pts.length]!;
    boundary.push(true);
    if (at(a[0], 0) && at(b[0], 0)) return [-1, 0];
    if (at(a[0], U) && at(b[0], U)) return [1, 0];
    if (at(a[1], 0) && at(b[1], 0)) return [0, -1];
    if (at(a[1], V) && at(b[1], V)) return [0, 1];
    boundary[i] = false;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const left: P2 = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
    return ccw ? left : [-left[0], -left[1]];
  });
  const world = (n: P2): V3 => [0, 1, 2].map((j) => n[0] * wu[j]! + n[1] * wv[j]!) as V3;
  return { ui, vi, k, W, wu, wv, wk, pts, smooth, normals, boundary, world };
}

/**
 * Final review F1: the hidden-line probe's lift for each of a curved part's model edges, parallel to
 * curveDrawEdges(board), or undefined. drawView's occluders grow by DRAW_EPS / 2 and sample from DRAW_EPS, so an edge
 * whose most viewer-facing face meets the view at n.toward below ~0.25 grazed hidden in its OWN wood (measured: a
 * thumbnail's crisp line in the isometric, n.toward 0.18; a roundover's end outline in the Plan; two profiles' meeting
 * line at a corner; a rounded corner's bottom outline in the isometric). The faces holding an edge are read off the
 * outline — each face of the board's box whose plane it lies on, and each off-boundary outline edge's face (chord x
 * through) of any curve whose line holds it. The lift runs ALONG THE VIEW, by PROBE / n.toward of the most viewer-facing
 * of them (at most LIFT_MAX): the probe starts PROBE clear of that face's plane, and still on the edge's own ray, so a
 * line hidden by grazing other wood (an arch's end line along a bottom face the Side view looks across) stays hidden — a
 * lift along the normals stepped off that plane and drew micro-inch slivers. Edge-on and away faces lift nothing. The
 * probe moves, never the drawn line. silhouetteLines keeps its own (normal) lift.
 */
/** Inches: the longest stretch of an edge's own ray curveEdgeLifts skips (a face within ~4e-3 of edge-on gets less
 *  than PROBE of clearance; below ~5e-4 it still grazes). Far below any feature (1/64"), so no other wood is skipped. */
const LIFT_MAX = 1e-3;
export function curveEdgeLifts(board: Board, toward: readonly number[]): (V3 | undefined)[] {
  board = geometryBoard(board);
  const edges = curveDrawEdges(board);
  const faces = board.curves.map((c) => outlineFaces(board, c));
  const o3 = toWorld(board, { length: 0, width: 0, thickness: 0 });
  const box = DIMENSION_ORDER.map((_, j) => {
    const p: V3 = [0, 0, 0];
    p[j] = 1;
    return toWorld(board, { length: p[0], width: p[1], thickness: p[2] }).map((w, i) => w - o3[i]!) as V3;
  });
  // Profile runs a2: a stopped profile's body faces, for the run-out's own edges (below); b1: a swept part's too.
  const bodyFaces = sweptProfiles(board).length > 0 || board.curves.some((c) => { const sp = spanOf(c); return !!sp && (sp.stopLo || sp.stopHi); })
    ? partGeometry(board).bodies.flatMap((b) => b.faces) : [];
  const runout = bodyFaces.filter((f) => f.runout !== undefined);
  const adjacent = (p: readonly number[], q: readonly number[]) => bodyFaces.filter((f) => holds(f, p, q));
  const distToLine = (x: P2, a: P2, b: P2) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return Math.abs((b[0] - a[0]) * (x[1] - a[1]) - (b[1] - a[1]) * (x[0] - a[0])) / l;
  };
  return edges.map((e) => {
    const normals: V3[] = [];
    const add = (n: V3) => { if (!normals.some((m) => dot3(m, n) > 1 - 1e-12)) normals.push(n); };
    DIMENSION_ORDER.forEach((dim, j) => {
      if (Math.abs(e.p[j]!) <= 1e-9 && Math.abs(e.q[j]!) <= 1e-9) add(box[j]!.map((w) => -w) as V3);
      else if (Math.abs(e.p[j]! - board[dim]) <= 1e-9 && Math.abs(e.q[j]! - board[dim]) <= 1e-9) add(box[j]!);
    });
    for (const o of faces) {
      const { ui, vi, pts, normals: ns, boundary } = o;
      const a: P2 = [e.p[ui]!, e.p[vi]!];
      const b: P2 = [e.q[ui]!, e.q[vi]!];
      const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      pts.forEach((x, i) => {
        const y = pts[(i + 1) % pts.length]!;
        if (boundary[i] || distToSegment(mid, x, y) > ON_CHORD || distToLine(a, x, y) > ON_CHORD || distToLine(b, x, y) > ON_CHORD) return;
        add(o.world(ns[i]!));
      });
    }
    let best = Math.max(0, ...normals.map((n) => dot3(n, toward)).filter((x) => facing(x) > 0));
    // Profile runs a2 (Task 7): an edge the outline does not bound but a stopped profile's run-out does (its crease on
    // the side face, its outline on the broad face, a sharp section vertex's chain) takes the same along-view lift, from
    // the most viewer-facing BODY face holding it (F1, extended): those faces meet the view at every angle around a stop.
    if (best === 0 && runout.length > 0) {
      const held = runout.some((f) => holds(f, e.p, e.q));
      if (held) best = Math.max(0, ...adjacent(e.p, e.q).map((f) => dot3(worldDir(board, f.n), toward)).filter((x) => facing(x) > 0));
    }
    if (best === 0) return undefined;
    const s = Math.min(LIFT_MAX, PROBE / best);
    return [toward[0]! * s, toward[1]! * s, toward[2]! * s] as V3;
  });
}

/** Inches: a board-local point on a body face's plane, and inside its polygon (closed), for curveEdgeLifts' run-out faces. */
const ON_FACE = 1e-7;
/** Does face f hold the edge p→q: both ends on its plane, the midpoint inside its polygon (closed within ON_FACE)? */
function holds(f: BodyFace, p: readonly number[], q: readonly number[]): boolean {
  const v0 = f.verts[0]!;
  const off = (x: readonly number[]) => f.n[0] * (x[0]! - v0[0]) + f.n[1] * (x[1]! - v0[1]) + f.n[2] * (x[2]! - v0[2]);
  if (Math.abs(off(p)) > ON_FACE || Math.abs(off(q)) > ON_FACE) return false;
  const m = [0, 1, 2].map((i) => (p[i]! + q[i]!) / 2);
  const c = [0, 1, 2].map((i) => f.verts.reduce((s, v) => s + v[i]!, 0) / f.verts.length);
  for (let i = 0; i < f.verts.length; i += 1) {
    const a = f.verts[i]!;
    const b = f.verts[(i + 1) % f.verts.length]!;
    const e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(e[0]!, e[1]!, e[2]!);
    if (l <= 1e-12) continue;
    // The in-plane normal of edge a→b, pointed at the centroid.
    let w = [f.n[1] * e[2]! - f.n[2] * e[1]!, f.n[2] * e[0]! - f.n[0] * e[2]!, f.n[0] * e[1]! - f.n[1] * e[0]!].map((x) => x / l);
    if (w[0]! * (c[0]! - a[0]) + w[1]! * (c[1]! - a[1]) + w[2]! * (c[2]! - a[2]) < 0) w = w.map((x) => -x);
    if (w[0]! * (m[0]! - a[0]) + w[1]! * (m[1]! - a[1]) + w[2]! * (m[2]! - a[2]) < -ON_FACE) return false;
  }
  return true;
}
