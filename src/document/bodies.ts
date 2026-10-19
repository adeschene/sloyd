import type { Board, Region } from './types';
import { CUT_GEOMETRY_KEYS, pocketCells, pocketEdges, type Point, type Segment } from './cuts';
import { boardHoles, holeRowValues, type Hole } from './holes';
import { angleCutValues, keptHalfSpace, type V3 } from './angleCuts';
import { curveOutline, curvePlan, curveValues, smoothLines, spanOf, splitPieces, uvDims, type ViewCurve } from './curves';
import { profileSection, runoutPieces, stopRunoutPieces } from './runout';
import { DIMENSION_ORDER } from './geometry';
import { unionOutline } from './outline';
import { profileEdgeOf, sectionEdgeNamer } from './sectionEdges';
import { geometryBoard, profileValues, shapedPart, sweptProfiles } from './profiles';
import { builtSwept, oneSideCurve, outlineCurves, sweptPieces, sweptRunouts, sweptStops, type SweptPiece } from './sweep';
import type { CurveCut, ProfileCut } from './types';
import { builtPath } from './profilePath';
import { faceCover, twinFaces } from './seams';
import { sweptSmoothPair } from './sweptEdges';

/** Inches. Below any bench precision, above float drift on part-sized numbers. */
export const BODY_EPS = 1e-9;
/** Inches: how near a candidate line must pass a smooth outline point to be one of an arc's facet lines (curves spec
 *  §3.3). The chord vertices are the same numbers in both (curveOutline), so this only absorbs clip's arithmetic. */
export const SMOOTH_EPS = 1e-7;
/** How near parallel (|n × m|) a face's normal must be to an outline edge's for the face to be that edge's (a smooth
 *  join's two faces, bodyEdges' `smooth`). Both come from the same outline points, so this only absorbs arithmetic;
 *  a chord turns far more than this (24 chords at most per arc). */
const SMOOTH_NORMAL_EPS = 1e-7;

/** One face of a body: outward unit normal and a convex polygon, board-local. Winding is NOT meaningful —
 *  a consumer that needs it orients against `n` (BoardMesh does). `cut` names the angle cut whose plane
 *  the face lies on. `curve` names the curve whose chord plane the face lies on (curves spec §3.2): `bodyMesh`
 *  reads it for smooth normals. `runout` marks a face on a stopped profile's run-out (profile runs P9): its curve is
 *  revolved there, not extruded. `profileEdge` (a stopped profile only, T6 fix 1) names the section-outline edges a cap
 *  lies on — `${curve}:${a}:${b}`, the first and last index of a collinear run of the profile section's outline edges,
 *  written only for an edge off the part's faces; built by `profileEdgeName` and read only through `profileEdgeOf`. A SWEPT
 *  profile's section face (profile runs b1, Q5) carries `profileEdge` (its profile id) and `sweep`, the index of the path
 *  chord whose band it lies in (`profilePath`'s own order); sweep.ts's header is the tag contract. */
export interface BodyFace {
  n: V3; verts: V3[]; cut?: string; curve?: string; runout?: 'lo' | 'hi'; profileEdge?: string; sweep?: number;
  /** A face cut by a swept profile's OVERLAP piece (profile runs b2, Task 6 fix rounds 1–2, I2/N1): where a run's two ends'
   *  bands overlap, so its planes hold both passes' sections; absent everywhere else. */
  overlap?: true;
  /** A run-out face of a swept profile's b2 STOP (profile runs b2, Task 7 fix round 2, N1): its `runout` is then the path's
   *  face-frame end (0 'lo', 1 'hi'), where a B1 station's run-out carries a2's tag by its span — the two may coincide on one
   *  run. Absent on every other face (a2's and b1's run-outs keep their bytes). */
  stop?: true;
}

/**
 * A convex piece of a part's remaining stock (angle-cuts spec §3.1): one pocket
 * cell clipped by every angle cut's kept half-space. `box` is the cell itself
 * exactly when no angle cut clipped it — the signal every consumer uses to keep
 * today's box path byte-for-byte.
 */
export interface Body { box: Region | null; faces: BodyFace[] }

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

function boxFaces(r: Region): BodyFace[] {
  const [l0, l1] = r.length;
  const [w0, w1] = r.width;
  const [t0, t1] = r.thickness;
  return [
    { n: [-1, 0, 0], verts: [[l0, w0, t0], [l0, w0, t1], [l0, w1, t1], [l0, w1, t0]] },
    { n: [1, 0, 0], verts: [[l1, w0, t0], [l1, w1, t0], [l1, w1, t1], [l1, w0, t1]] },
    { n: [0, -1, 0], verts: [[l0, w0, t0], [l1, w0, t0], [l1, w0, t1], [l0, w0, t1]] },
    { n: [0, 1, 0], verts: [[l0, w1, t0], [l0, w1, t1], [l1, w1, t1], [l1, w1, t0]] },
    { n: [0, 0, -1], verts: [[l0, w0, t0], [l0, w1, t0], [l1, w1, t0], [l1, w0, t0]] },
    { n: [0, 0, 1], verts: [[l0, w0, t1], [l1, w0, t1], [l1, w1, t1], [l0, w1, t1]] },
  ];
}

/** Points on one plane, de-duplicated and ordered around their centroid: a convex ring. */
function ring(points: V3[], n: V3): V3[] {
  // Chunk c1: the same arithmetic with fewer temporaries — the de-duplication's Math.hypot test in the same order, the
  // centroid as sums from 0 then a division, u and w from the same cross/unit calls (their zero products and signs kept),
  // each angle atan2((p − c)·w, (p − c)·u) with dot's left-to-right sum, and the points ordered by a stable sort of their
  // indices under the same comparator (the same comparisons give the same permutation as sorting {p, a} records).
  const pts: V3[] = [];
  for (const p of points) {
    let dup = false;
    for (let j = 0; j < pts.length; j += 1) {
      const q = pts[j]!;
      if (Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= BODY_EPS) { dup = true; break; }
    }
    if (!dup) pts.push(p);
  }
  const k = pts.length;
  if (k < 3) return [];
  let c0 = 0, c1 = 0, c2 = 0;
  for (let j = 0; j < k; j += 1) c0 += pts[j]![0];
  for (let j = 0; j < k; j += 1) c1 += pts[j]![1];
  for (let j = 0; j < k; j += 1) c2 += pts[j]![2];
  c0 /= k; c1 /= k; c2 /= k;
  const helper: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(n, helper));
  const w = cross(n, u);
  const angle = new Float64Array(k);
  const order: number[] = new Array<number>(k);
  for (let j = 0; j < k; j += 1) {
    const p = pts[j]!;
    const d0 = p[0] - c0, d1 = p[1] - c1, d2 = p[2] - c2;
    angle[j] = Math.atan2(d0 * w[0] + d1 * w[1] + d2 * w[2], d0 * u[0] + d1 * u[1] + d2 * u[2]);
    order[j] = j;
  }
  order.sort((x, y) => angle[x]! - angle[y]!);
  const out: V3[] = new Array<V3>(k);
  for (let j = 0; j < k; j += 1) out[j] = pts[order[j]!]!;
  return out;
}

/**
 * Keep the part of a convex body on the side n·x + d >= 0 (one saw pass).
 * Returns the SAME array when nothing is removed, so the caller can tell a
 * clipped body from an untouched one. A face lying on the plane is kept as is
 * and no cap is added (the plane is already a face).
 */
function clip(faces: BodyFace[], h: { n: V3; d: number }, tag: { cut?: string; curve?: string; runout?: 'lo' | 'hi'; profileEdge?: string; sweep?: number; overlap?: true; stop?: true }): BodyFace[] {
  // Chunk c1: every vertex's g is `n0 * p[0] + n1 * p[1] + n2 * p[2] + d` — dot(h.n, p) + h.d, the same float — evaluated
  // as each edge is walked rather than kept in per-face arrays (re-evaluating gives the same number); sides, kept points,
  // crossings and cap points in the same order as before.
  const [n0, n1, n2] = h.n;
  const d = h.d;
  let cut = false;
  for (let i = 0; i < faces.length && !cut; i += 1) {
    const vs = faces[i]!.verts;
    for (let j = 0; j < vs.length; j += 1) {
      const p = vs[j]!;
      if (n0 * p[0] + n1 * p[1] + n2 * p[2] + d < -BODY_EPS) { cut = true; break; }
    }
  }
  if (!cut) return faces;
  const out: BodyFace[] = [];
  const cap: V3[] = [];
  let onPlane = false;
  for (const f of faces) {
    const vs = f.verts;
    const n = vs.length;
    if (n === 0) { onPlane = true; continue; }   // as before: no sides, so "every side 0"; nothing kept
    const kept: V3[] = [];
    let all0 = true;
    const p0 = vs[0]!;
    const g0 = n0 * p0[0] + n1 * p0[1] + n2 * p0[2] + d;
    const s0 = g0 > BODY_EPS ? 1 : g0 < -BODY_EPS ? -1 : 0;
    let a = p0, ga = g0, sa = s0;
    for (let i = 0; i < n; i += 1) {
      let b: V3, gb: number, sb: number;
      if (i + 1 < n) {
        b = vs[i + 1]!;
        gb = n0 * b[0] + n1 * b[1] + n2 * b[2] + d;
        sb = gb > BODY_EPS ? 1 : gb < -BODY_EPS ? -1 : 0;
      } else { b = p0; gb = g0; sb = s0; }
      if (sa !== 0) all0 = false;
      if (sa >= 0) kept.push(a);
      if (sa === 0) cap.push(a);
      if (sa * sb < 0) {
        const t = ga / (ga - gb);
        const p: V3 = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
        kept.push(p);
        cap.push(p);
      }
      a = b; ga = gb; sa = sb;
    }
    if (all0) onPlane = true;
    if (kept.length >= 3) out.push({ ...f, verts: kept });
  }
  if (!onPlane) {
    const r = ring(cap, h.n);
    if (r.length >= 3) {
      const capFace: BodyFace = { n: [-h.n[0], -h.n[1], -h.n[2]], verts: r };
      if (tag.cut !== undefined) capFace.cut = tag.cut;
      if (tag.curve !== undefined) capFace.curve = tag.curve;
      if (tag.runout !== undefined) capFace.runout = tag.runout;
      if (tag.profileEdge !== undefined) capFace.profileEdge = tag.profileEdge;
      if (tag.sweep !== undefined) capFace.sweep = tag.sweep;
      if (tag.overlap) capFace.overlap = true;
      if (tag.stop) capFace.stop = true;
      out.push(capFace);
    }
  }
  return out;
}

/** `clipConvex`'s tag: a cap named by no cut (section caps find it by `cut === ''`). */
const UNNAMED = { cut: '' } as const;

/**
 * One convex body (faces in any one frame) kept on the side n·x + d >= 0: `clip`, for a caller with no cut to name.
 * The checks intersect two world bodies with it (fu 302): a body clipped by each of the other's inside half-spaces.
 */
export function clipConvex(faces: BodyFace[], h: { n: V3; d: number }): BodyFace[] {
  return clip(faces, h, UNNAMED);
}

/**
 * THE place angle cuts become geometry (angle-cuts spec §3.1): each pocket cell
 * clipped by every angle cut's kept half-space. With no angle cuts this is the
 * pocket cells as boxes, so a part without angle cuts costs nothing. Can return
 * `[]` (a part its cuts consumed) — BoardMesh draws invariant 21's ghost then.
 */
export function boardBodies(board: Board): Body[] {
  return buildBodies(geometryBoard(board));
}

/** TEST ONLY: `boardBodies` with the swept construction's test options (`events: false`: the notch regression). */
export function boardBodiesForTest(board: Board, opts: { events?: boolean }): Body[] {
  return buildBodies(geometryBoard(board), opts);
}

function buildBodies(board: Board, opts?: { events?: boolean }): Body[] {
  const cells = pocketCells(board);
  const planes = board.angleCuts.flatMap((c) => {
    const h = keptHalfSpace(board, c);
    return h ? [{ h, tag: { cut: c.id } }] : [];
  });
  const out: Body[] = [];
  for (const r of cells) {
    const start = boxFaces(r);
    let faces = start;
    for (const { h, tag } of planes) {
      faces = clip(faces, h, tag);
      if (faces.length === 0) break;
    }
    if (faces.length >= 4) out.push({ box: faces === start ? r : null, faces });
  }
  let bodies = out;
  // Swept profiles (profile runs b1, Q3; sweep.ts): the curve-free cells (cuts and angle cuts applied) intersected with each
  // built swept profile's pieces in stored order; the through-thickness curves the face outline carries are not applied
  // again. A faulted swept profile builds nothing (Q6). A part with no built swept profile takes the path below unchanged.
  const swept = board.profiles.length > 0 ? builtSwept(board) : [];
  const skip = swept.length > 0 ? outlineCurves(board) : null;
  for (const p of swept) bodies = sweepBodies(bodies, sweptPieces(board, p, opts));
  // Curves (curves spec §3.2): each curve's waste leaves every body convex — clipped by the chords' kept half-planes when
  // the wood left is convex (P6), else split along the waste's convex pieces. A body no curve reaches keeps its object,
  // so its `box` survives (invariant 48's box path). Caps on an arc chord carry the curve's id.
  for (const c of board.curves) {
    if (skip && c.through === 'thickness' && skip.has(c.id)) continue;
    if (spanOf(c)) {
      const pieces = stoppedPieces(board, c);
      bodies = bodies.flatMap((body) => subtractPieces(body.faces, pieces, c.id)
        .flatMap((f) => (f === body.faces ? [body] : f.length >= 4 ? [{ box: null, faces: f }] : [])));
      continue;
    }
    const plan = curvePlan(board, c);
    if (!plan) continue;
    bodies = bodies.flatMap((body) => {
      const faces = plan.clip ? clipAll(body.faces, plan.planes, c.id) : subtractPieces(body.faces, plan.pieces, c.id);
      return faces.flatMap((f) => (f === body.faces ? [body] : f.length >= 4 ? [{ box: null, faces: f }] : []));
    });
  }
  // A swept profile's station ends (B1): a2's run-out, revolved about the bit's axis beyond each station, subtracted.
  for (const p of swept) {
    for (const c of sweptRunouts(board, p)) {
      const name = sectionEdgeNamer(profileSection(board, c).pts, p.id);
      const pieces = runoutPieces(board, c).map((x) => ({ ...x, edge: x.edge.map(name) }));
      bodies = bodies.flatMap((body) => subtractPieces(body.faces, pieces, p.id)
        .flatMap((f) => (f === body.faces ? [body] : f.length >= 4 ? [{ box: null, faces: f }] : [])));
    }
  }
  // A swept profile's STOPS (profile runs b2, §4.2 (b2)): the cutter revolved about the bit's axis BEARING outside the
  // stop's chord, beyond the plane across it, subtracted as a2's are.
  for (const p of swept) {
    const stops = sweptStops(board, p);
    if (stops.length === 0) continue;
    const c = oneSideCurve(p);
    const name = sectionEdgeNamer(profileSection(board, c).pts, p.id);
    for (const fr of stops) {
      const pieces = stopRunoutPieces(board, c, fr).map((x) => ({ ...x, edge: x.edge.map(name), stop: true as const }));
      bodies = bodies.flatMap((body) => subtractPieces(body.faces, pieces, p.id)
        .flatMap((f) => (f === body.faces ? [body] : f.length >= 4 ? [{ box: null, faces: f }] : [])));
    }
  }
  return bodies;
}

/**
 * Every body intersected with one swept profile's pieces (sweep.ts; Q3): a body INSIDE one piece (every plane leaves it the
 * same array) keeps its object; otherwise its fragments with volume, one per piece it meets (band pieces first). The pieces
 * tile the outline × the thickness, so a body no piece reaches is outside the outline — in a through-thickness curve's
 * waste, never applied again — and is dropped. A piece whose plan box misses the body's is skipped.
 */
function sweepBodies(bodies: readonly Body[], pieces: readonly SweptPiece[]): Body[] {
  const out: Body[] = [];
  for (const body of bodies) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of body.faces) for (const p of f.verts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const frags: BodyFace[][] = [];
    let whole = false;
    // Lever 1 (Task 5): a skeleton face's prism planes clip the body once, shared by its section pieces (the same planes in
    // the same order, so the same faces).
    let group = -1;
    let prism: BodyFace[] = body.faces;
    for (const pc of pieces) {
      if (pc.bb[0] > x1 + BODY_EPS || pc.bb[2] < x0 - BODY_EPS || pc.bb[1] > y1 + BODY_EPS || pc.bb[3] < y0 - BODY_EPS) continue;
      let f = body.faces;
      let k = 0;
      if (pc.group !== undefined) {
        if (pc.group !== group) {
          group = pc.group;
          prism = body.faces;
          for (let j = 0; j < pc.prefix! && prism.length; j += 1) prism = clip(prism, pc.planes[j]!, pc.tags[j]!);
        }
        f = prism;
        k = pc.prefix!;
      }
      for (; k < pc.planes.length && f.length; k += 1) f = clip(f, pc.planes[k]!, pc.tags[k]!);
      if (f === body.faces) { whole = true; break; }
      if (f.length >= 4 && bodyVolume({ box: null, faces: f }) > DISJOINT_VOLUME) frags.push(f);
    }
    if (whole) out.push(body);
    else for (const f of frags) out.push({ box: null, faces: f });
  }
  return out;
}

export { profileEdgeName, profileEdgeOf } from './sectionEdges';

/** `edge` (stopped profiles only): per plane, the `profileEdge` its caps carry (`profileEdgeName`: the section-outline edge
 *  run it lies on, written only for an edge off the part's faces), or null. */
type Piece = { planes: { n: V3; d: number }[]; onArc: boolean[]; runout?: 'lo' | 'hi'; edge?: (string | null)[]; stop?: true };
/**
 * A stopped profile's waste (profile runs P9), always down the SPLIT path (never `clipAll`): the band — each of
 * `splitPieces`' pieces bounded by the slab at each stop (x_k >= lo, x_k <= hi; n into the waste, first, as the planning
 * probe ordered them) — then both run-outs (`runoutPieces`). All one curve's pieces, applied together.
 */
function stoppedPieces(board: Board, c: ViewCurve): Piece[] {
  const span = spanOf(c)!;
  const k = DIMENSION_ORDER.indexOf(c.through);
  const axis = (s: number): V3 => { const n: V3 = [0, 0, 0]; n[k] = s; return n; };
  const slabs = [...(span.stopLo ? [{ n: axis(1), d: -span.lo }] : []), ...(span.stopHi ? [{ n: axis(-1), d: span.hi }] : [])];
  // T6 fix 1: every plane on a section-outline edge OFF the part's faces names that edge (on a face — s = 0 or t = 0 at
  // both ends — it caps nothing drawn apart from the face itself). The band's planes are matched to their edge by the
  // edge's two outline points lying on them; the run-out's come with their index.
  const sec = profileSection(board, c);
  const m = sec.pts.length;
  // Collinear neighbouring edges lie on ONE plane, so one cap may cover parts of several (the ogee's inflection chords, cut
  // by two pieces): an edge's name is its whole collinear run (sectionEdgeNamer, shared with swept profiles).
  const name = sectionEdgeNamer(sec.pts, c.id);
  const [u, v] = uvDims(c.through).map((d) => DIMENSION_ORDER.indexOf(d)) as [number, number];
  const o = curveOutline(board, c).pts;
  const bandEdge = (h: { n: V3; d: number }): string | null => {
    if (Math.abs(h.n[k]!) > BODY_EPS) return null;
    const on = (q: readonly number[]) => Math.abs(h.n[u]! * q[0]! + h.n[v]! * q[1]! + h.d) <= 1e-9;
    // Every outline edge lying on the plane; their contiguous run (a piece edge merging collinear ones covers several).
    const hit = o.map((q, i) => on(q) && on(o[(i + 1) % m]!));
    const a = hit.findIndex((x, i) => x && !hit[(i - 1 + m) % m]);
    if (a === -1) return null;
    let b = a;
    while (hit[(b + 1) % m] && (b + 1) % m !== a) b = (b + 1) % m;
    return name([a, b]);
  };
  const band = splitPieces(board, c).map((p) => {
    const planes = [...slabs, ...p.planes];
    return { planes, onArc: [...slabs.map(() => false), ...p.onArc], edge: planes.map(bandEdge) };
  });
  const runouts = runoutPieces(board, c).map((p) => ({ ...p, edge: p.edge.map(name) }));
  return [...band, ...runouts];
}

/** A body clipped by every kept half-plane of a CLIP plan: one body or none. */
function clipAll(faces: BodyFace[], planes: readonly { n: V3; d: number }[], curve: string): BodyFace[][] {
  let f = faces;
  const tag = { curve };
  for (const h of planes) { f = clip(f, h, tag); if (f.length === 0) return []; }
  return [f];
}

/** Cubic inches: a part sharing no more than this with a convex piece of waste holds none of it (subtractPieces). */
const DISJOINT_VOLUME = 1e-12;

/** True when every vertex lies on or outside (within BODY_EPS) some one of the planes: subtractPieces' first reject, the
 *  same expression as `dot(h.n, p) + h.d <= BODY_EPS` over each face's vertices, in the same order of operations. */
function outsideSome(planes: readonly { n: V3; d: number }[], v: Float64Array): boolean {
  for (const h of planes) {
    const [n0, n1, n2] = h.n;
    let all = true;
    for (let j = 0; j < v.length; j += 3) if (n0 * v[j]! + n1 * v[j + 1]! + n2 * v[j + 2]! + h.d > BODY_EPS) { all = false; break; }
    if (all) return true;
  }
  return false;
}

/**
 * A body minus the waste of a SPLIT plan (spec §3.2): for each convex piece in turn, every current part splits at the
 * piece's planes — the part OUTSIDE each plane (inside the ones before) is kept, the part inside them all (waste) dropped.
 * Caps on an arc chord carry the curve's id (and a run-out piece's end). A body the waste does not reach comes back as its
 * own array (one element).
 */
function subtractPieces(faces: BodyFace[], pieces: readonly Piece[], curve: string): BodyFace[][] {
  // Each part's vertices as one flat array, built once per part (a part meets ~145 pieces of a stopped ogee; the reject
  // test below scanned its faces' vertex arrays for every one): the same numbers, the same test.
  const flat = new Map<BodyFace[], Float64Array>();
  const flatVerts = (part: BodyFace[]): Float64Array => {
    let a = flat.get(part);
    if (!a) {
      let n = 0;
      for (const f of part) n += f.verts.length;
      a = new Float64Array(3 * n);
      let j = 0;
      for (const f of part) for (const p of f.verts) { a[j] = p[0]; a[j + 1] = p[1]; a[j + 2] = p[2]; j += 3; }
      flat.set(part, a);
    }
    return a;
  };
  let parts: BodyFace[][] = [faces];
  for (const piece of pieces) {
    const next: BodyFace[][] = [];
    for (const part of parts) {
      // A part wholly outside one of the piece's planes does not meet it: it stays whole, its own array. Without this
      // the piece's planes, extended past its edges, would slice a cell the waste never reaches (and lose its box).
      if (outsideSome(piece.planes, flatVerts(part))) { next.push(part); continue; }
      let rest = part;
      const frags: BodyFace[][] = [];
      piece.planes.forEach((h, i) => {
        if (rest.length === 0) return;
        const edge = piece.edge?.[i] ?? null;
        const tag = edge !== null
          // A stopped profile's outline face (T6 fix 1): `curve` on arc chords only (bodyMesh reads it as a chord face).
          ? { ...(piece.onArc[i] ? { curve } : {}), ...(piece.runout ? { runout: piece.runout } : {}), profileEdge: edge, ...(piece.stop ? { stop: true as const } : {}) }
          : piece.onArc[i] ? (piece.runout ? { curve, runout: piece.runout, ...(piece.stop ? { stop: true as const } : {}) } : { curve }) : {};
        const outside = clip(rest, { n: [-h.n[0], -h.n[1], -h.n[2]], d: -h.d }, tag);
        if (outside.length >= 4) frags.push(outside);
        rest = outside === rest ? [] : clip(rest, h, tag);
      });
      // Final review F3: what is left inside every plane is the waste this part holds. None (or a touch: no volume) means
      // the part never met the piece, though no single piece plane separates them (its own face, or an edge-to-edge
      // plane, does): it stays whole, so the piece's extended planes do not slice wood it never reaches (a four-edge
      // ogee top: 131 bodies -> 100 by this alone, 51 with splitPieces' diagonals last; the same wood, pinned).
      if (rest.length < 4 || bodyVolume({ box: null, faces: rest }) <= DISJOINT_VOLUME) next.push(part);
      else next.push(...frags);
    }
    parts = next;
  }
  return parts;
}

/**
 * TEST-ONLY: `board`'s bodies with `c` (its only curve) removed down the SPLIT path even where `curvePlan` would clip —
 * the clip/split agreement test (spec §3.2: both paths give the same wood).
 */
export function splitBodiesForTest(board: Board, c: CurveCut): Body[] {
  const before = boardBodies({ ...board, curves: [] });
  const pieces = splitPieces(board, c);
  return before.flatMap((body) => subtractPieces(body.faces, pieces, c.id).flatMap((f) => (f.length >= 4 ? [{ box: null, faces: f }] : [])));
}

/** Distinct vertices of a body. */
export function bodyVerts(body: Body): V3[] {
  const out: V3[] = [];
  for (const f of body.faces) for (const p of f.verts) if (!out.some((q) => Math.hypot(...sub(p, q)) <= BODY_EPS)) out.push(p);
  return out;
}

/** Volume by the divergence theorem: ⅓ Σ (n·v₀)·area. */
export function bodyVolume(body: Body): number {
  let v = 0;
  for (const f of body.faces) {
    const p0 = f.verts[0]!;
    let area: V3 = [0, 0, 0];
    for (let i = 1; i + 1 < f.verts.length; i += 1) {
      const c = cross(sub(f.verts[i]!, p0), sub(f.verts[i + 1]!, p0));
      area = [area[0] + c[0], area[1] + c[1], area[2] + c[2]];
    }
    v += (dot(f.n, p0) * Math.abs(dot(area, f.n))) / 2;
  }
  return v / 3;
}

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/**
 * Inches. A polygon edge this short is a sliver, not a feature: `clip` keeps
 * a vertex sitting just over BODY_EPS off a plane next to the crossing point it
 * computes on that plane, so a kept polygon can carry an edge ~1e-9 long whose
 * direction is noise, and a cell corner just above a plane survives as a
 * sub-micro wedge of its own. A sliver edge makes no line and is no wall in
 * the inside test, and a face without three real edges is not a face — so a
 * sliver can neither draw a speck nor claim every point on a line. Far below
 * bench precision (1/64in). The price: a feature between BODY_EPS and this —
 * reachable only from a hand-edited file, since every entry is fractional
 * inches — is drawn approximately (a 1e-7 riser is dropped and its neighbour's
 * edge stands in, a few micro-inches off), never as specks.
 */
const SLIVER = 1e-6;

/** Inches: bodyEdges' in-plane reach from a line to the faces it consults (final review F3). Far above BODY_EPS (a face this
 *  far off misses the inside test unless its sharpest angle is under ~2e-6 rad), far below any feature. */
const NEAR_LINE = 1e-3;

/** An in-plane direction from a line into a face that holds it, with that face's normal. */
interface Wing { n: V3; w: V3; f: BodyFace }
/** A stretch a→b of a line where two faces of one stopped profile meet without a crease (bodyEdges' `smoothPair`). */
export interface SmoothJoin { a: V3; b: V3; f1: BodyFace; f2: BodyFace }

/**
 * The edges of a union of convex bodies (angle-cuts spec §3.4, invariant 16
 * generalised): a segment is drawn where faces of the remaining stock meet and
 * are NOT coplanar, and nowhere else.
 *
 * Candidate lines are every face polygon's edges, grouped by the line they lie
 * on and split at every endpoint and every crossing with a coplanar face's
 * boundary, so a face either contains a whole interval or none of it. At each
 * interval's midpoint, every face containing it contributes WINGS — the
 * in-plane direction from the line into the face (two for a face the line
 * crosses the interior of, one for a face it bounds). A wing pair with the
 * same direction and opposite normals is an internal wall between two bodies
 * and cancels. What is left is no edge when it is empty or one flat surface
 * continuing through (two wings, same normal, opposite directions); anything
 * else is an edge. That is pocketEdges' four-cell rule restated without a grid:
 * four filled cells cancel to nothing, two sharing a face leave a flat pair,
 * and one, three or a diagonal two leave a crease.
 *
 * Every comparison is within BODY_EPS (or SLIVER, for lengths): a crossing two
 * neighbouring faces share is computed twice and the two values differ in the
 * last bits, so nothing here assumes exact equality.
 *
 * `keep` (curves spec §3.3) skips candidate lines: a polygon edge on a line it refuses (given the edge's start, its
 * direction and its face's normal) makes no candidate, but its face still contributes wings to the lines that remain.
 * `smooth` (curves spec §3.3) names, for a line, the normal pairs of faces that meet along it WITHOUT a crease (an
 * arc's facets at a chord vertex, a chord and the straight face at a tangent join): a stretch where the only wings left
 * are one face of each normal of such a pair is no edge. Judged per stretch, so a wall that meets the same line
 * elsewhere (a dado reaching a tangent join) still draws its crease there.
 * `smoothPair` (profile runs a2) is asked of a stretch whose ONLY two wings are two different faces a and b: true means
 * they meet without a crease (a stopped profile's run-out facets, and the band's arc faces at the stop). Absent, nothing
 * is asked, so every other part's edges are what they were.
 * `joins` (profile runs a2, Task 7): when given, every stretch smoothPair suppressed is pushed to it with its two faces
 * (the Plans sheet's facet-chain silhouettes read them). A side output only: the edges returned are the same.
 * `skip` (profile runs b1, Task 6; curvedEdges' fast path for a swept profile, absent everywhere else) makes no candidate
 * of a face's edge starting at vertex `a`: the caller decides that line itself (two section faces meeting, sectionSeams).
 * The face still gives its wings to every other line.
 */
export function bodyEdges(
  bodies: readonly Body[],
  keep?: (o: V3, u: V3, n: V3) => boolean,
  smooth?: (o: V3, u: V3) => readonly (readonly [V3, V3])[],
  smoothPair?: (a: BodyFace, b: BodyFace) => boolean,
  joins?: SmoothJoin[],
  skip?: (f: BodyFace, a: V3) => boolean,
): [V3, V3][] {
  // Chunk c1: the setup below computes the same numbers as before — len(sub(b, a)) as Math.hypot of the differences, the
  // centroid as add() sums from [0, 0, 0] then scale(·, 1/n), unit(cross(n, e)), dot's left-to-right sums, scale(·, −1) as
  // products by −1 — as scalars, without the per-edge pair arrays, their filter, or the sub/cross/unit temporaries, and in
  // the same order (faces in body order, then face order; edges in vertex order).
  //
  // A face with fewer than three non-sliver edges has no area worth the name, and with its sliver edges
  // left out of the inside test it would "contain" every point on the line: it is not a face here.
  const faces: BodyFace[] = [];
  const fEdges: [V3, V3][][] = [];   // each face's edges once (fu 368: they were rebuilt per line and per test)
  for (const body of bodies) for (const f of body.faces) {
    const vs = f.verts;
    const k = vs.length;
    const es: [V3, V3][] = [];
    for (let i = 0; i < k; i += 1) {
      const a = vs[i]!, b = vs[(i + 1) % k]!;
      if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > SLIVER) es.push([a, b]);
    }
    if (es.length >= 3) { faces.push(f); fEdges.push(es); }
  }
  const cents: V3[] = faces.map((f) => {
    let c0 = 0, c1 = 0, c2 = 0;
    for (const p of f.verts) { c0 = c0 + p[0]; c1 = c1 + p[1]; c2 = c2 + p[2]; }
    const r = 1 / f.verts.length;
    return [c0 * r, c1 * r, c2 * r];
  });
  // Final review F3: each face edge's in-plane normal, computed ONCE (they were recomputed per line and per interval —
  // most of a four-edge ogee top's 120 ms). The same expressions as before, so every number is the same float.
  const fEdgeData = fEdges.map((es, fi) => {
    const fn = faces[fi]!.n;
    const c = cents[fi]!;
    return es.map(([a, b]) => {
      const e: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const x = fn[1] * e[2] - fn[2] * e[1], y = fn[2] * e[0] - fn[0] * e[2], z = fn[0] * e[1] - fn[1] * e[0];
      const l = Math.hypot(x, y, z);
      const m: V3 = [x / l, y / l, z / l];
      const inward: V3 = m[0] * (c[0] - a[0]) + m[1] * (c[1] - a[1]) + m[2] * (c[2] - a[2]) < 0 ? [m[0] * -1, m[1] * -1, m[2] * -1] : m;
      return { a, e, m, ee: e[0] * e[0] + e[1] * e[1] + e[2] * e[2], inward };
    });
  });

  // 1. Lines: every polygon edge, grouped by the line it lies on (direction signed so grouping ignores winding).
  // fu 368: the line an edge joins is the EARLIEST-created line passing the same test as ever (directions within
  // BODY_EPS, the edge's start within BODY_EPS of it), but only lines whose point nearest the origin lies in the 27 cells
  // around the edge's are tried. Two lines passing the test have nearest points at most 2|a|·BODY_EPS + 2·BODY_EPS apart
  // (2e-6 at 1000"), well inside one LINE_CELL; a linear scan of every line per edge was most of a split curve's edges.
  interface Line { o: V3; u: V3; ts: number[]; spans: [number, number][] }
  const lines: Line[] = [];
  const cells = new Map<number, number[]>();
  // Final review F3: a numeric cell key (a string per probed cell was a fifth of a four-edge ogee top's edges). Two cells
  // may share a key; that only adds candidates, each judged by the same exact test under the same lowest-id rule.
  const cellKey = (i: number, j: number, k: number) => ((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) | 0;
  const LINE_CELL = 1e-5;
  for (let fi = 0; fi < faces.length; fi += 1) {
    const f = faces[fi]!;
    for (const [a, b] of fEdges[fi]!) {
      if (skip && skip(f, a)) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const dl = Math.hypot(dx, dy, dz);
      let u: V3 = [dx / dl, dy / dl, dz / dl];
      const lead = Math.abs(u[0]) > BODY_EPS ? u[0] : Math.abs(u[1]) > BODY_EPS ? u[1] : u[2];
      if (lead < 0) u = [u[0] * -1, u[1] * -1, u[2] * -1];
      if (keep && !keep(a, u, f.n)) continue;
      const [u0, u1, u2] = u;
      const [a0, a1, a2] = a;
      // The edge's cell: a's point nearest the origin along u, a − (a·u)u, over LINE_CELL, floored.
      const ka = a0 * u0 + a1 * u1 + a2 * u2;
      const cx = Math.floor((a0 - ka * u0) / LINE_CELL), cy = Math.floor((a1 - ka * u1) / LINE_CELL), cz = Math.floor((a2 - ka * u2) / LINE_CELL);
      // The earliest line passing |l.u × u| <= BODY_EPS and |(a − l.o) × l.u| <= BODY_EPS among the 27 cells' lines.
      let best = -1;
      for (let i = cx - 1; i <= cx + 1; i += 1) for (let j = cy - 1; j <= cy + 1; j += 1) for (let k = cz - 1; k <= cz + 1; k += 1) {
        const ids = cells.get(cellKey(i, j, k));
        if (!ids) continue;
        for (const id of ids) {
          if (best !== -1 && id >= best) continue;
          const l = lines[id]!;
          const [v0, v1, v2] = l.u;
          if (!(Math.hypot(v1 * u2 - v2 * u1, v2 * u0 - v0 * u2, v0 * u1 - v1 * u0) <= BODY_EPS)) continue;
          const s0 = a0 - l.o[0], s1 = a1 - l.o[1], s2 = a2 - l.o[2];
          if (Math.hypot(s1 * v2 - s2 * v1, s2 * v0 - s0 * v2, s0 * v1 - s1 * v0) <= BODY_EPS) best = id;
        }
      }
      let line: Line;
      if (best === -1) {
        line = { o: a, u, ts: [], spans: [] };
        const key = cellKey(cx, cy, cz);
        const ids = cells.get(key);
        if (ids) ids.push(lines.length); else cells.set(key, [lines.length]);
        lines.push(line);
      } else line = lines[best]!;
      const [o0, o1, o2] = line.o;
      const [w0, w1, w2] = line.u;
      const ta = (a0 - o0) * w0 + (a1 - o1) * w1 + (a2 - o2) * w2;
      const tb = (b[0] - o0) * w0 + (b[1] - o1) * w1 + (b[2] - o2) * w2;
      line.ts.push(ta, tb);
      line.spans.push([Math.min(ta, tb), Math.max(ta, tb)]);
    }
  }

  // fu 368: faces grouped by normal (rounded to 1e-6, so a group's normals agree within ~2e-6), each group sorted by its
  // plane offset along the group's first normal. A line asks only the groups square to it (within 1e-5) and, in each,
  // the faces whose offset is within 1e-3 of its own (2e-6 × the part's size, with room), then the same exact test as
  // ever, in face order — a filter of all 477 faces per line was the rest of a split curve's edges.
  const groups = new Map<string, { n: V3; at: { d: number; i: number }[] }>();
  faces.forEach((f, i) => {
    const key = f.n.map((x) => Math.round(x * 1e6)).join(',');
    let g = groups.get(key);
    if (!g) { g = { n: f.n, at: [] }; groups.set(key, g); }
    g.at.push({ d: dot(g.n, f.verts[0]!), i });
  });
  for (const g of groups.values()) g.at.sort((x, y) => x.d - y.d);
  // Final review F3: each face's box, and a line's (its spans' hull, grown by NEAR_LINE): a face whose box misses it lies
  // more than NEAR_LINE off the line, or past every span — where it can neither hold a judged midpoint nor cut a drawn
  // stretch (a cut outside every span only splits stretches that are not drawn). The plane's other faces are skipped.
  const fBox = faces.map((f) => {
    const lo: V3 = [Infinity, Infinity, Infinity];
    const hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (const p of f.verts) for (let k = 0; k < 3; k += 1) { if (p[k]! < lo[k]!) lo[k] = p[k]!; if (p[k]! > hi[k]!) hi[k] = p[k]!; }
    return { lo, hi };
  });
  // Final fix F1: the groups as flat arrays (normal, sorted offsets, face indices) and each face's box and first vertex as
  // numbers, read without a Map iterator, closures or temporaries. The same expressions in the same order (dot and sub
  // inlined), so every comparison sees the same floats and the hits are the same set.
  const G = [...groups.values()].map((g) => ({ n0: g.n[0], n1: g.n[1], n2: g.n[2], d: Float64Array.from(g.at, (x) => x.d), i: Int32Array.from(g.at, (x) => x.i) }));
  const fB = new Float64Array(6 * faces.length);
  const fN = new Float64Array(6 * faces.length);
  faces.forEach((f, i) => {
    const b = fBox[i]!;
    fB.set([b.lo[0], b.lo[1], b.lo[2], b.hi[0], b.hi[1], b.hi[2]], 6 * i);
    const p = f.verts[0]!;
    fN.set([f.n[0], f.n[1], f.n[2], p[0], p[1], p[2]], 6 * i);
  });
  const coplanarTo = (o: V3, u: V3, near?: { lo: V3; hi: V3 }): number[] => {
    const hit: number[] = [];
    const [o0, o1, o2] = o;
    const [u0, u1, u2] = u;
    for (const g of G) {
      if (Math.abs(g.n0 * u0 + g.n1 * u1 + g.n2 * u2) > 1e-5) continue;
      const d = g.n0 * o0 + g.n1 * o1 + g.n2 * o2;
      const gd = g.d;
      let lo = 0, hi = gd.length;
      while (lo < hi) { const m = (lo + hi) >> 1; if (gd[m]! < d - 1e-3) lo = m + 1; else hi = m; }
      for (let k = lo; k < gd.length && gd[k]! <= d + 1e-3; k += 1) {
        const fi = g.i[k]!;
        if (near) {
          const b = 6 * fi;
          if (fB[b]! > near.hi[0] || fB[b + 3]! < near.lo[0] || fB[b + 1]! > near.hi[1] || fB[b + 4]! < near.lo[1] || fB[b + 2]! > near.hi[2] || fB[b + 5]! < near.lo[2]) continue;
        }
        const q = 6 * fi;
        const n0 = fN[q]!, n1 = fN[q + 1]!, n2 = fN[q + 2]!;
        if (Math.abs(n0 * u0 + n1 * u1 + n2 * u2) <= BODY_EPS
          && Math.abs(n0 * (o0 - fN[q + 3]!) + n1 * (o1 - fN[q + 4]!) + n2 * (o2 - fN[q + 5]!)) <= BODY_EPS) hit.push(fi);
      }
    }
    return hit.sort((x, y) => x - y);
  };

  const out: [V3, V3][] = [];
  for (const line of lines) {
    // 2. Faces whose plane holds the line, and where the line crosses their boundaries.
    // Final review F3: a face of the plane lying wholly to one side of the line, more than NEAR_LINE off it in the plane,
    // can neither cross the line nor hold an interval's midpoint (its edges' inward distances at the line are all below
    // -NEAR_LINE·sin(half its sharpest angle), far past -BODY_EPS), so it is left out: a four-edge ogee top's planes hold
    // ~40 faces per line, most of them inches away.
    let tlo = Infinity, thi = -Infinity;
    for (const t of line.ts) { if (t < tlo) tlo = t; if (t > thi) thi = t; }
    const near = { lo: [0, 1, 2].map((k) => Math.min(line.o[k]! + line.u[k]! * tlo, line.o[k]! + line.u[k]! * thi) - NEAR_LINE) as V3,
      hi: [0, 1, 2].map((k) => Math.max(line.o[k]! + line.u[k]! * tlo, line.o[k]! + line.u[k]! * thi) + NEAR_LINE) as V3 };
    const coplanar = coplanarTo(line.o, line.u, near).flatMap((i) => {
      const f = faces[i]!;
      const w = unit(cross(f.n, line.u));
      let lo = Infinity, hi = -Infinity;
      const [o0, o1, o2] = line.o;
      for (const p of f.verts) { const x = w[0] * (p[0] - o0) + w[1] * (p[1] - o1) + w[2] * (p[2] - o2); if (x < lo) lo = x; if (x > hi) hi = x; }
      return lo > NEAR_LINE || hi < -NEAR_LINE ? [] : [{ f, i, w, wn: scale(w, -1) }];
    });
    const ts = [...line.ts];
    // Scalar forms of the same expressions, in the same order (dot, sub, add, scale inlined): the same floats.
    const [o0, o1, o2] = line.o;
    const [u0, u1, u2] = line.u;
    for (const { i } of coplanar) {
      for (const { a, e, m, ee } of fEdgeData[i]!) {
        // In the face's plane, o + t·u meets a + s·e where (o + t·u − a)·(n × e) = 0.
        const den = u0 * m[0] + u1 * m[1] + u2 * m[2];
        if (Math.abs(den) <= BODY_EPS) continue; // parallel (a collinear edge already gave its endpoints)
        const t = ((a[0] - o0) * m[0] + (a[1] - o1) * m[1] + (a[2] - o2) * m[2]) / den;
        const s = (((o0 + u0 * t) - a[0]) * e[0] + ((o1 + u1 * t) - a[1]) * e[1] + ((o2 + u2 * t) - a[2]) * e[2]) / ee;
        if (s >= -BODY_EPS && s <= 1 + BODY_EPS) ts.push(t);
      }
    }
    ts.sort((x, y) => x - y);
    const cuts: number[] = [];
    for (const t of ts) if (!cuts.length || t - cuts[cuts.length - 1]! > BODY_EPS) cuts.push(t);

    // 3. Judge each interval at its midpoint; merge consecutive drawn intervals into one segment.
    const pairs = smooth?.(line.o, line.u) ?? [];
    const par = (a: V3, b: V3) => len(cross(a, b)) <= SMOOTH_NORMAL_EPS;
    const judge = (tm: number): boolean => {
      if (!line.spans.some(([lo, hi]) => lo - BODY_EPS <= tm && tm <= hi + BODY_EPS)) return false;
      const mid = add(line.o, scale(line.u, tm));
      const [m0, m1, m2] = mid;
      const wings: Wing[] = [];
      for (const { f, i, w, wn } of coplanar) {
        const c = cents[i]!;
        let inside = true;
        let onEdge = false;
        for (const { a, inward } of fEdgeData[i]!) {
          const dist = inward[0] * (m0 - a[0]) + inward[1] * (m1 - a[1]) + inward[2] * (m2 - a[2]);
          if (dist < -BODY_EPS) { inside = false; break; }
          if (dist <= BODY_EPS) onEdge = true;
        }
        if (!inside) continue;
        if (!onEdge) { wings.push({ n: f.n, w, f }, { n: f.n, w: wn, f }); continue; }
        wings.push({ n: f.n, w: w[0] * (c[0] - m0) + w[1] * (c[1] - m1) + w[2] * (c[2] - m2) >= 0 ? w : wn, f });
      }
      // Cancel internal walls: same direction, opposite normals.
      for (let a = 0; a < wings.length; a += 1) {
        for (let b = a + 1; b < wings.length; b += 1) {
          if (dot(wings[a]!.w, wings[b]!.w) > 1 - BODY_EPS && dot(wings[a]!.n, wings[b]!.n) < -1 + BODY_EPS) {
            wings.splice(b, 1);
            wings.splice(a, 1);
            a -= 1;
            break;
          }
        }
      }
      const flat = wings.length === 2
        && dot(wings[0]!.n, wings[1]!.n) > 1 - BODY_EPS && dot(wings[0]!.w, wings[1]!.w) < -1 + BODY_EPS;
      if (wings.length === 2 && pairs.some(([p, q]) => (par(wings[0]!.n, p) && par(wings[1]!.n, q))
        || (par(wings[0]!.n, q) && par(wings[1]!.n, p)))) return false;   // a smooth join: the two faces turn by a facet
      if (smoothPair && wings.length === 2 && wings[0]!.f !== wings[1]!.f && smoothPair(wings[0]!.f, wings[1]!.f)) {
        joined.f = [wings[0]!.f, wings[1]!.f];
        return false;
      }
      return wings.length > 0 && !flat;
    };
    const joined: { f: [BodyFace, BodyFace] | null } = { f: null };   // the faces of the stretch judge last suppressed

    let run: number | null = null;
    const flush = (end: number) => {
      if (run !== null) out.push([add(line.o, scale(line.u, run)), add(line.o, scale(line.u, end))]);
      run = null;
    };
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      joined.f = null;
      const drawn = judge((cuts[k]! + cuts[k + 1]!) / 2);
      if (drawn && run === null) run = cuts[k]!;
      if (!drawn) flush(cuts[k]!);
      if (joins && joined.f) joins.push({ a: add(line.o, scale(line.u, cuts[k]!)), b: add(line.o, scale(line.u, cuts[k + 1]!)), f1: joined.f[0], f2: joined.f[1] });
    }
    flush(cuts[cuts.length - 1] ?? 0);
  }
  return out;
}

const toPoint = (p: V3): Point => ({ length: p[0], width: p[1], thickness: p[2] });

/** Signed area of a face polygon in the plane square to axis k (the other two axes in order). */
function areaIn(verts: readonly V3[], k: number): number {
  const [i, j] = [0, 1, 2].filter((d) => d !== k) as [number, number];
  let a = 0;
  for (let n = 0; n < verts.length; n += 1) {
    const p = verts[n]!;
    const q = verts[(n + 1) % verts.length]!;
    a += p[i]! * q[j]! - q[i]! * p[j]!;
  }
  return a;
}

/**
 * A curved part's edges, BUILT (curves spec §3.3; the timing spike: bodyEdges over an arch's slices is quadratic in
 * them). (1) On every plane square to a curve's `through`: the boundary of the faces lying on it, by `unionOutline`,
 * a face facing +k wound anticlockwise and one facing −k clockwise — so two bodies' faces against each other (a seam)
 * cancel, and slices' faces merge into one outline. A segment already drawn on a plane of an earlier axis is skipped,
 * and so is one on another curve's smooth line (below).
 * (2) Everything else: `bodyEdges` with the lines on those planes skipped. The lines along `through` at smooth outline
 * points (a chord vertex, a tangent join) are judged per stretch: no edge where only the join's two faces meet — an arc
 * draws no facet lines (invariant 16) — but a crease where anything else meets the line (a dado wall reaching a tangent
 * join). So the outline leaves such a line to bodyEdges, and `keep` never skips it.
 * A line on one of those planes is skipped only as an edge of a face lying on it or square to it — square to THAT
 * plane's axis; a face of a curve through another axis is no exception: a SLANTED face (an
 * angle cut's) can crease against a wall at a plane's height off that plane's faces (a 1/4" chamfer's lower crease at a
 * 1/4"-deep dado's floor height), which the outline does not draw. Such a face's edges stay candidates, and whatever
 * the outline already drew on their lines is taken off what bodyEdges returns, so nothing is drawn twice.
 * Never mutates `bodies` (partGeometry's are frozen and shared).
 */
export function curvedEdges(board: Board, bodies: readonly Body[], joins?: SmoothJoin[], opts?: { reference?: boolean }): [V3, V3][] {
  board = geometryBoard(board);
  // Profile runs b1 (Task 6): a part with a built swept profile reads its edges the FAST way unless `reference` (TEST ONLY:
  // the plain judgement every swept edge pin compares against). Fast: every seam between two bodies (two faces of one
  // polygon, facing each other: they cancel wherever they are judged, and every edge of one is also an edge of its body's
  // neighbouring face) is dropped first (`withoutSeams`), and the lines where two section faces of one profile meet are
  // found by their tags and planes and decided by the swept rule without bodyEdges (`sectionSeams`). The same line set and
  // the same joins, pinned on every swept fixture (sweepEdges.test.ts). Chunk c2: a face the part's other bodies cover
  // completely makes no candidate (it stays a wing).
  const sweptHere = board.profiles.length > 0 ? builtSwept(board) : [];
  const fast = sweptHere.length > 0 && !opts?.reference;
  // Chunk c2 (stage 3, amendment A2): what other bodies cover, read off the bodies AS GIVEN (partGeometry's frozen array, so
  // the mesh's faceCover is reused) before the seams are dropped. A face with no visible remainder makes no candidate below.
  const hidden = fast ? faceCover(bodies).remains : null;
  if (fast) bodies = withoutSeams(bodies);
  const axes = [...new Set(board.curves.map((c) => DIMENSION_ORDER.indexOf(c.through)))];
  const faces = bodies.flatMap((b) => b.faces);
  const smooth = smoothLines(board);
  // Per through axis, so a line not along one is refused at once (the same lines, in smoothLines' order: a filter of every
  // smooth line per candidate edge was a millisecond of a swept corner top's edges).
  const smoothBy = [0, 1, 2].map((k) => smooth.filter((s) => s.k === k));
  const NONE: typeof smooth = [];
  const smoothOn = (o: V3, u: V3) => {
    let hit: typeof smooth | null = null;
    for (let k = 0; k < 3; k += 1) {
      if (smoothBy[k]!.length === 0 || Math.abs(Math.abs(u[k]!) - 1) > BODY_EPS) continue;
      for (const s of smoothBy[k]!) {
        if ([0, 1, 2].every((i) => i === k || Math.abs(o[i]! - s.p[i]!) <= SMOOTH_EPS)) (hit ??= []).push(s);
      }
    }
    if (!hit) return NONE;
    // smoothLines' own order (only one axis can pass for a unit u, so the per-axis order is it).
    return hit;
  };
  const onSmooth = (o: V3, u: V3) => smoothOn(o, u).length > 0;
  const out: [V3, V3][] = [];
  const planes: { k: number; c: number }[] = [];
  // Profile runs b1 (Task 6): a built swept profile's section faces, and every face on its BROAD face's plane, are left to
  // bodyEdges (stage 2), which judges them with the swept rule (sweptEdges.ts): the outline of the broad face there is
  // the offset line at the reach, a tangent line for a roundover (no edge, invariant 16) and a crease for a cove. Asked
  // only of a part with a built swept profile, so every other part's edges are byte for byte what they were.
  const swept = sweptHere;
  // A plane a horizontal section face lies on (a fillet, a quirk's floor) is the profile's surface there too: its other faces
  // (a run-out's floor past a B1 station) meet the section face flat, which stage 1, blind to section faces, would outline.
  const broad = swept.length === 0 ? [] : [...swept.map((p) => (p.face === 'max' ? board.thickness : 0)),
    ...faces.filter((f) => f.sweep !== undefined && Math.abs(Math.abs(f.n[2]) - 1) <= BODY_EPS).map((f) => f.verts[0]![2])];
  const skipPlane = (k: number, c: number) => k === 2 && broad.some((z) => Math.abs(z - c) <= BODY_EPS);
  for (const k of axes) {
    const groups: { c: number; pieces: V3[][] }[] = [];
    for (const f of faces) {
      if (Math.abs(Math.abs(f.n[k]!) - 1) > BODY_EPS) continue;
      if (f.sweep !== undefined) continue;
      const c = f.verts[0]![k]!;
      if (skipPlane(k, c)) continue;
      let g = groups.find((x) => Math.abs(x.c - c) <= BODY_EPS);
      if (!g) { g = { c, pieces: [] }; groups.push(g); }
      const wantPositive = f.n[k]! > 0;
      g.pieces.push(areaIn(f.verts, k) > 0 === wantPositive ? f.verts : [...f.verts].reverse());
    }
    for (const g of groups) {
      for (const [a, b] of unionOutline(g.pieces, k)) {
        if (planes.some((p) => Math.abs(a[p.k]! - p.c) <= BODY_EPS && Math.abs(b[p.k]! - p.c) <= BODY_EPS)) continue;
        // A plane of one axis can hold another curve's smooth line (a rounded edge's tangent line on the face an arch
        // runs through): bodyEdges judges that line per stretch (below), so the outline leaves it.
        if (onSmooth(a, unit(sub(b, a)))) continue;
        out.push([a, b]);
      }
    }
    for (const g of groups) planes.push({ k, c: g.c });
  }
  const onPlane = (o: V3, u: V3) => planes.some(({ k, c }) => Math.abs(u[k]!) <= BODY_EPS && Math.abs(o[k]! - c) <= BODY_EPS);
  const keep = (o: V3, u: V3, n: V3) => onSmooth(o, u) || !skipsInPlane(planes, o, u, n);
  const outline = out.slice();
  // A stopped profile's run-out (profile runs a2): its facets join each other, and the band's arc faces at the stop,
  // without a crease; a crease against an untagged face (the broad face, the side face, a straight section side) stays.
  // Asked only of a part with a stop, so every other part's edges are byte for byte what they were.
  // T6 fix 1: judged per SECTION EDGE — two faces of one stopped curve, at least one on a run-out, meet smoothly when they
  // come from the same outline edge (a revolved edge's sectors; the band's face and the first sector at the stop) or from
  // adjacent edges at a SMOOTH outline vertex (curveOutline's flags, judged on the true arcs). A sharp vertex (a bead's
  // quirk) stays a crease, and so does anything against an untagged face.
  const stopped = new Map<string, boolean[]>();
  for (const c of board.curves) { const sp = spanOf(c); if (sp && (sp.stopLo || sp.stopHi)) stopped.set(c.id, curveOutline(board, c).smooth); }
  const edgeOf = (f: BodyFace): [string, number, number] | null => {
    const e = profileEdgeOf(f);
    return e ? [e.curve, e.a, e.b] : null;
  };
  // A swept profile's station ends (B1) are a2's run-outs: their faces join the band's by a2's rule, keyed by the profile's
  // id (its one-side curve's), the same section-edge index space as the band's (sweep.ts).
  for (const p of swept) for (const c of sweptRunouts(board, p)) if (!stopped.has(c.id)) stopped.set(c.id, curveOutline(board, c).smooth);
  // Profile runs b2 (Task 7): a swept profile's STOPS (Q12) are run-outs too, tagged by the profile's id in its section's index
  // space (sweep.ts): registered beside its B1 run-outs, so a2's rule joins their faces. The section's smooth flags are the
  // same for every one-side curve of the profile (one section), so any one serves.
  for (const p of swept) if (!stopped.has(p.id) && sweptStops(board, p).length > 0) stopped.set(p.id, curveOutline(board, oneSideCurve(p)).smooth);
  // Task 7 fix round 1 (I1): a2's rule joins only faces of ONE run-out, which in a2 was all a profile's run-out could meet. A
  // b2 run may bring both its ends to one corner (stops within reach of a sharp corner are no fault), and there the two
  // router passes INTERSECT — one end's run-out against the other's, or against the other end's band, off its own stop plane —
  // at a real crease, sharing the profile id and a section-edge index. So for a profile with a stop, a run-out face joins only
  // faces of its OWN path end: another face of that end's run-out (fix round 2, N1: by its end, never by the bare `runout` tag,
  // which a stop and a B1 station on one run may share), or the band of that end's path chord (the
  // band meets its run-out at its stop plane). Every b1 profile (no stop) keeps a2's rule unguarded, byte for byte.
  const ownEnd = new Map<string, (a: BodyFace, b: BodyFace) => boolean>();
  for (const p of swept) {
    if (sweptStops(board, p).length === 0) continue;
    const path = builtPath(board, p);
    if (!path || path.loop) continue;
    // A run-out face's path END (face frame): a stop's face (`stop`) carries its end as its tag (0 'lo', 1 'hi'); a B1
    // station's carries a2's tag (by its span), which may equal the stop's on one run (fix round 2, N1: a stop at end 0 and
    // a station at end 1 both 'lo'), so a station's tag is read only among the stations — one per end, so never ambiguous.
    const station = new Map<'lo' | 'hi', number>();
    (path.ends ?? []).forEach((e, i) => {
      if (e.kind !== 'station') return;
      const k = oneSideCurve(p, e.side).through === 'length' ? 0 : 1;
      station.set(e.tangent[k]! > 0 ? 'hi' : 'lo', i);
    });
    const endOf = (f: BodyFace): number | undefined => (f.stop ? (f.runout === 'lo' ? 0 : 1) : station.get(f.runout!));
    const last = path.chords.length - 1;
    ownEnd.set(p.id, (a, b) => {
      if (a.runout !== undefined && b.runout !== undefined) return endOf(a) === endOf(b);
      const [r, o] = a.runout !== undefined ? [a, b] : [b, a];
      if (o.sweep === undefined) return true;
      const end = endOf(r);
      return end !== undefined && o.sweep === (end === 0 ? 0 : last);
    });
  }
  const a2Pair = stopped.size > 0
    ? (a: BodyFace, b: BodyFace) => {
      if (a.runout === undefined && b.runout === undefined) return false;
      const ea = edgeOf(a), eb = edgeOf(b);
      if (!ea || !eb || ea[0] !== eb[0]) return false;
      const smooth = stopped.get(ea[0]);
      if (!smooth) return false;
      if (ownEnd.get(ea[0])?.(a, b) === false) return false;
      const m = smooth.length;
      const span = ([, a, b]: [string, number, number]) => { const out = [a]; for (let j = a; j !== b; ) { j = (j + 1) % m; out.push(j); } return out; };
      const sa = span(ea), sb = span(eb);
      if (sa.some((j) => sb.includes(j))) return true;   // one outline edge (a revolved edge's sectors; the band at the stop)
      if ((ea[2] + 1) % m === eb[1]) return smooth[eb[1]]!;   // a's last edge ends where b's first starts: the vertex pts[b0]
      if ((eb[2] + 1) % m === ea[1]) return smooth[ea[1]]!;
      return false;
    }
    : undefined;
  const sweptPair = sweptSmoothPair(board, swept);
  const smoothPair = a2Pair && sweptPair ? (a: BodyFace, b: BodyFace) => a2Pair(a, b) || sweptPair(a, b) : a2Pair ?? sweptPair;
  // The fast path's section seams (above), decided by the swept rule alone: two section faces of one profile.
  const loops = new Map(swept.map((p) => [p.id, loopLength(board, swept, p.id)]));
  const seams = fast && sweptPair ? sectionSeams(bodies, sweptPair, (id) => loops.get(id) ?? null) : null;
  // Chunk c2 (stage 3): a face other bodies cover completely (faceCover's remainder empty) is inside the part: an edge of its
  // own is never the only edge on a stretch you can see — a crease is bounded by a face that is seen, whose own edge makes the
  // candidate — so it makes none, and those lines are not judged (a planning measurement on master, 2026-10-19: of the ogee loop's 416 judged
  // lines, 208 were judged to no wings and 104 judged nothing, so only 52 drew anything).
  // It still gives its wings to every line that is judged (inv 16: a face taken away as a wing drew phantom lines).
  const covered = hidden ? (f: BodyFace) => hidden.get(f)!.length === 0 : null;
  const skip = covered ? (f: BodyFace, a: V3) => covered(f) || (seams?.skip(f, a) ?? false) : seams?.skip;
  const judged = bodyEdges(bodies, keep, (o, u) => smoothOn(o, u).map((s) => s.n), smoothPair, joins, skip);
  const place = (seg: [V3, V3]) => {
    const u = unit(sub(seg[1], seg[0]));
    if (onPlane(seg[0], u)) out.push(...minusCovered(seg, u, outline));
    else out.push(seg);
  };
  if (!seams) { for (const seg of judged) place(seg); return out; }
  for (const seg of judged) for (const piece of minusCovered(seg, unit(sub(seg[1], seg[0])), seams.drawn)) place(piece);
  for (const seg of seams.drawn) place(seg);
  if (joins) joins.push(...seams.joins);
  return out;
}

/**
 * The lines where two SECTION faces of one swept profile meet (curvedEdges' fast path, profile runs b1 Task 6; the curves
 * precedent: lines the construction knows are built, not searched for): along the path where two adjacent section runs of
 * one band meet, and across it where one run's faces on two adjacent path segments meet. Each such face edge is found by
 * the tags — it lies on the other strip's plane — and the line is decided here by the same smoothPair: drawn, or pushed to
 * `joins`; bodyEdges makes no candidate of its edges (`skip`). Anything else meeting such a line still makes its own
 * candidate in bodyEdges, which judges it with every face (a crease where anything else meets, invariant 16); its output is
 * taken off what is emitted here, so nothing is drawn twice.
 *
 * Profile runs b2 (Task 7): the fast path takes CANDIDATES away, never wings, and decides only what it knows:
 * - A line is decided here only where the two strips' face edges on it COVER EACH OTHER (the merged stretches of strip A's
 *   edges on the line equal strip B's, within SLIVER). Lying on B's plane does not make an edge of A an edge between A and B:
 *   past a stop's run-out B's face ends while A's runs on (N5: a bead's quirk floor ran on past the wall the other end's
 *   run-out removed, and its whole edge was drawn as the floor-to-wall crease). Where they differ, every edge of both on that
 *   line is left to bodyEdges, which judges it with every face, as the reference does.
 * - Every face stays in bodyEdges as a wing (b1 dropped a section face all of whose edges were skipped). A seam pair
 *   `withoutSeams` keeps — two bodies split differently along one plane, a T-junction (N4: the overlapped end's band split
 *   lengthwise by its overlap, against the next segment's whole band) — has edges on the section faces' lines, and their
 *   candidates need those faces as wings: without them a smooth junction drew a line. So `withoutSeams`' "a missed pair is
 *   only slower" holds again.
 * Never mutates `bodies`.
 */
function sectionSeams(bodies: readonly Body[], smoothPair: (a: BodyFace, b: BodyFace) => boolean, loopLen: (id: string) => number | null): {
  skip: (f: BodyFace, a: V3) => boolean; drawn: [V3, V3][]; joins: SmoothJoin[];
} {
  interface Strip { i: number; id: string; sweep: number; a: number; b: number; n: V3; d: number; face: BodyFace; cands?: Strip[] }
  const strips: Strip[] = [];
  const byName = new Map<string, Strip>();   // profileEdge + '|' + sweep
  const bySweep = new Map<string, Strip[]>();   // profile id + '|' + sweep
  const faces: { f: BodyFace; st: Strip }[] = [];
  for (const body of bodies) for (const f of body.faces) {
    if (f.sweep === undefined || f.profileEdge === undefined) continue;
    // Fix round 2 (N1): a face of a run's two ends' OVERLAP is never a strip. There the other pass's section can lie on its
    // plane (a bead's quirk floor at both passes' depth), so "a section face's edge on its neighbouring strip's plane is a
    // line between them" no longer holds: bodyEdges judges every line there with every face, as the reference does.
    if (f.overlap) continue;
    const key = f.profileEdge + '|' + f.sweep;
    let st = byName.get(key);
    if (!st) {
      const e = profileEdgeOf(f)!;
      st = { i: strips.length, id: e.curve, sweep: f.sweep, a: e.a, b: e.b, n: f.n, d: -dot(f.n, f.verts[0]!), face: f };
      strips.push(st);
      byName.set(key, st);
      const k2 = e.curve + '|' + f.sweep;
      const list = bySweep.get(k2);
      if (list) list.push(st); else bySweep.set(k2, [st]);
    }
    faces.push({ f, st });
  }
  // Each strip's candidates, once: the other runs on its own path segment, and its own run on the adjacent segments —
  // never one on its own plane (a horizontal fillet or quirk floor on two segments: every edge of A lies on that plane, and
  // the flat line between them is bodyEdges' to judge).
  const candsOf = (A: Strip): Strip[] => {
    if (A.cands) return A.cands;
    const n = loopLen(A.id);
    const sweeps = [A.sweep - 1, A.sweep, A.sweep + 1];
    if (n !== null && n > 2) { if (A.sweep === 0) sweeps.push(n - 1); if (A.sweep === n - 1) sweeps.push(0); }
    const out: Strip[] = [];
    for (const sw of sweeps) for (const B of bySweep.get(A.id + '|' + sw) ?? []) {
      if (B === A) continue;
      const sameRun = B.a === A.a && B.b === A.b;
      if (sw === A.sweep ? sameRun : !sameRun) continue;
      const c0 = A.n[1] * B.n[2] - A.n[2] * B.n[1], c1 = A.n[2] * B.n[0] - A.n[0] * B.n[2], c2 = A.n[0] * B.n[1] - A.n[1] * B.n[0];
      if (Math.hypot(c0, c1, c2) <= BODY_EPS && Math.abs(A.d - B.d) <= BODY_EPS) continue;
      out.push(B);
    }
    A.cands = out;
    return out;
  };
  // Each match, in face order: its face, start vertex, edge and the side (P's or Q's) it is on.
  interface Match { f: BodyFace; a: V3; seg: [V3, V3]; side: 0 | 1 }
  const found = new Map<number, { A: Strip; B: Strip; matches: Match[] }>();
  const M = strips.length + 1;
  for (const { f, st: A } of faces) {
    const cands = candsOf(A);
    if (cands.length === 0) continue;
    const vs = f.verts;
    for (let i = 0; i < vs.length; i += 1) {
      const a = vs[i]!, b = vs[(i + 1) % vs.length]!;
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      if (Math.hypot(dx, dy, dz) <= SLIVER) continue;
      let B: Strip | undefined;
      for (const x of cands) {
        if (Math.abs(x.n[0] * a[0] + x.n[1] * a[1] + x.n[2] * a[2] + x.d) <= BODY_EPS
          && Math.abs(x.n[0] * b[0] + x.n[1] * b[1] + x.n[2] * b[2] + x.d) <= BODY_EPS) { B = x; break; }
      }
      if (!B) continue;
      const [P, Q] = A.i < B.i ? [A, B] : [B, A];
      const k = P.i * M + Q.i;
      let g = found.get(k);
      if (!g) { g = { A: P, B: Q, matches: [] }; found.set(k, g); }
      g.matches.push({ f, a, seg: [a, b], side: A === P ? 0 : 1 });
    }
  }
  const skipped = new Map<BodyFace, Set<V3>>();
  const drawn: [V3, V3][] = [];
  const joins: SmoothJoin[] = [];
  for (const { A, B, matches } of found.values()) {
    const segs = coveredBothSides(matches).map((m) => {
      let set = skipped.get(m.f);
      if (!set) { set = new Set(); skipped.set(m.f, set); }
      set.add(m.a);
      return m.seg;
    });
    if (segs.length === 0) continue;
    const smooth = smoothPair(A.face, B.face);
    for (const seg of mergeCollinear(segs)) {
      if (smooth) joins.push({ a: seg[0], b: seg[1], f1: A.face, f2: B.face });
      else drawn.push(seg);
    }
  }
  return { skip: (f, a) => skipped.get(f)?.has(a) ?? false, drawn, joins };
}

/**
 * sectionSeams' coverage rule (profile runs b2, Task 7): the matches (in their order) on the lines where both sides' edges
 * cover the same stretches — each side's edges on the line merged, the two equal within SLIVER. A line where they differ
 * (one strip's face ends where the other's runs on) keeps none of its matches.
 */
function coveredBothSides<M extends { seg: [V3, V3]; side: 0 | 1 }>(matches: readonly M[]): M[] {
  const lines: { o: V3; u: V3; spans: [[number, number][], [number, number][]] }[] = [];
  const lineOf = matches.map(({ seg: [a, b], side }) => {
    let u = unit(sub(b, a));
    const lead = Math.abs(u[0]) > BODY_EPS ? u[0] : Math.abs(u[1]) > BODY_EPS ? u[1] : u[2];
    if (lead < 0) u = scale(u, -1);
    let line = lines.find((l) => len(cross(l.u, u)) <= BODY_EPS && len(cross(sub(a, l.o), l.u)) <= BODY_EPS);
    if (!line) { line = { o: a, u, spans: [[], []] }; lines.push(line); }
    const ta = dot(sub(a, line.o), line.u), tb = dot(sub(b, line.o), line.u);
    line.spans[side].push([Math.min(ta, tb), Math.max(ta, tb)]);
    return line;
  });
  const union = (spans: [number, number][]) => {
    const out: [number, number][] = [];
    for (const s of spans.slice().sort((x, y) => x[0] - y[0])) {
      const last = out[out.length - 1];
      if (last && s[0] <= last[1] + SLIVER) last[1] = Math.max(last[1], s[1]);
      else out.push([s[0], s[1]]);
    }
    return out;
  };
  const covered = new Set(lines.filter((l) => {
    const p = union(l.spans[0]), q = union(l.spans[1]);
    return p.length === q.length && p.every((s, i) => Math.abs(s[0] - q[i]![0]) <= SLIVER && Math.abs(s[1] - q[i]![1]) <= SLIVER);
  }));
  return matches.filter((_, i) => covered.has(lineOf[i]!));
}

/** Segments merged where collinear and overlapping or touching (within BODY_EPS): one segment per maximal stretch. */
function mergeCollinear(segs: readonly [V3, V3][]): [V3, V3][] {
  const lines: { o: V3; u: V3; spans: [number, number][] }[] = [];
  for (const [a, b] of segs) {
    let u = unit(sub(b, a));
    const lead = Math.abs(u[0]) > BODY_EPS ? u[0] : Math.abs(u[1]) > BODY_EPS ? u[1] : u[2];
    if (lead < 0) u = scale(u, -1);
    let line = lines.find((l) => len(cross(l.u, u)) <= BODY_EPS && len(cross(sub(a, l.o), l.u)) <= BODY_EPS);
    if (!line) { line = { o: a, u, spans: [] }; lines.push(line); }
    const ta = dot(sub(a, line.o), line.u), tb = dot(sub(b, line.o), line.u);
    line.spans.push([Math.min(ta, tb), Math.max(ta, tb)]);
  }
  const out: [V3, V3][] = [];
  for (const l of lines) {
    l.spans.sort((x, y) => x[0] - y[0]);
    let cur: [number, number] | null = null;
    const flush = () => { if (cur) out.push([add(l.o, scale(l.u, cur[0])), add(l.o, scale(l.u, cur[1]))]); };
    for (const s of l.spans) {
      if (cur && s[0] <= cur[1] + BODY_EPS) cur[1] = Math.max(cur[1], s[1]);
      else { flush(); cur = [s[0], s[1]]; }
    }
    flush();
  }
  return out;
}

/** The number of path chords of a swept LOOP (its last and first segments are adjacent), null for an open path. */
function loopLength(view: Board, swept: readonly ProfileCut[], id: string): number | null {
  const p = swept.find((x) => x.id === id);
  const path = p ? builtPath(view, p) : null;
  return path && path.loop ? path.chords.length : null;
}

/**
 * The bodies with every SEAM dropped: a pair of faces of two bodies lying on one plane, facing each other, with the same
 * vertices (within BODY_EPS, any order). Such a pair adds two wings that cancel at every point bodyEdges judges, and each of
 * their edges is also an edge of the neighbouring face of its own body, so no line loses a candidate or a span. A pair the
 * rounded key misses (a vertex on a rounding boundary) is kept: only slower. Faces keep their objects (joins name them).
 */
function withoutSeams(bodies: readonly Body[]): Body[] {
  // The twin test has one home (seams.ts' twinFaces: the mesh and the edges drop the same pairs).
  const drop = twinFaces(bodies);
  if (drop.size === 0) return bodies as Body[];
  return bodies.map((b) => (b.faces.some((f) => drop.has(f)) ? { box: b.box, faces: b.faces.filter((f) => !drop.has(f)) } : b));
}

/**
 * curvedEdges' plane skip: a candidate line (point `o`, direction `u`, from a face of normal `n`) is left to the outline
 * when some through plane {k, c} holds it AND the face is not slanted relative to THAT plane's axis k (it lies on the
 * plane or is square to it). Slant is judged per plane: a chord face of a curve through another axis is slanted to this
 * one's planes only if its normal is (testing it against every axis would make every chord edge a candidate).
 */
export function skipsInPlane(planes: readonly { k: number; c: number }[], o: V3, u: V3, n: V3): boolean {
  return planes.some(({ k, c }) => Math.abs(u[k]!) <= BODY_EPS && Math.abs(o[k]! - c) <= BODY_EPS
    && !(Math.abs(n[k]!) > BODY_EPS && Math.abs(Math.abs(n[k]!) - 1) > BODY_EPS));
}

/** `seg` (direction `u`) minus every stretch of `cover` lying on its line; pieces of SLIVER or less are dropped. */
function minusCovered(seg: [V3, V3], u: V3, cover: readonly [V3, V3][]): [V3, V3][] {
  const o = seg[0];
  const t1 = dot(sub(seg[1], o), u);
  const gaps: [number, number][] = [];
  for (const [a, b] of cover) {
    if (len(cross(sub(a, o), u)) > BODY_EPS || len(cross(sub(b, o), u)) > BODY_EPS) continue;
    const ta = dot(sub(a, o), u);
    const tb = dot(sub(b, o), u);
    gaps.push([Math.min(ta, tb), Math.max(ta, tb)]);
  }
  if (gaps.length === 0) return [seg];
  gaps.sort((x, y) => x[0] - y[0]);
  const out: [V3, V3][] = [];
  let at = 0;
  for (const [lo, hi] of gaps) {
    if (lo - at > SLIVER) out.push([add(o, scale(u, at)), add(o, scale(u, Math.min(lo, t1)))]);
    at = Math.max(at, hi);
    if (at >= t1) break;
  }
  if (t1 - at > SLIVER) out.push([add(o, scale(u, at)), seg[1]]);
  return out;
}

/** The three-way choice over a part's bodies: pocketEdges' grid for a plain part, curvedEdges for a curved one,
 *  bodyEdges for an angled one. */
function edgesOf(board: Board, bodies: () => readonly Body[]): Segment[] {
  if (board.angleCuts.length === 0 && !shapedPart(board)) return pocketEdges(board);
  const b = bodies();
  if (!shapedPart(board)) return bodyEdges(b).map(([p, q]) => [toPoint(p), toPoint(q)] as Segment);
  const joins: SmoothJoin[] = [];
  const edges = curvedEdges(board, b, joins).map(([p, q]) => [toPoint(p), toPoint(q)] as Segment);
  if (joins.length > 0) joinsOf.set(b, deepFreeze(joins));
  return edges;
}

/** The smooth joins curvedEdges found while building a part's edges, keyed by the bodies they were built from. */
const joinsOf = new WeakMap<readonly Body[], readonly SmoothJoin[]>();
const NO_JOINS: readonly SmoothJoin[] = Object.freeze([]);
/**
 * Profile runs a2 (Task 7): the stretches where a stopped profile's faces meet without a crease — a run-out's facets, and
 * the band's arc faces at a stop (`smoothPair`) — with their two faces, board-local, through partGeometry (built with its
 * edges, once). Empty for every part with no stop. Shared and frozen: never mutate.
 */
export function smoothJoins(board: Board): readonly SmoothJoin[] {
  const g = partGeometry(board);
  void g.edges;
  return joinsOf.get(g.bodies) ?? NO_JOINS;
}

/**
 * A part's edge lines (invariant 16): `pocketEdges`' exact grid rule for a part
 * without angle cuts or curves, `curvedEdges` for a curved part, `bodyEdges`
 * otherwise. The ONE name every edge drawer (BoardMesh, the drawings) reads.
 */
export function boardEdges(board: Board): Segment[] {
  board = geometryBoard(board);
  return edgesOf(board, () => boardBodies(board));
}

/** A part's board-local geometry, shared by every part with the same geometry key. NEVER mutate it (frozen). */
export interface PartGeometry {
  readonly bodies: readonly Body[];
  readonly edges: readonly Segment[];
  /** Every row's instances (holes spec §3.1); bodies stay hole-free. */
  readonly holes: readonly Hole[];
}

/** Exact, and distinct for -0, NaN and ±Infinity (JSON would write all of the last three as `null`). */
const num = (n: number): string => (Object.is(n, -0) ? '-0' : String(n));

/**
 * Everything `boardBodies` and `boardEdges` read, as one string: the three dimensions, every cut's
 * CUT_GEOMETRY_KEYS values, and every angle cut's id and ANGLE_CUT_KEYS values, in stored order.
 *
 * Position, rotation, posture, grain, material and the part's id are NOT in it: the pocket grid
 * (`cutRegion`, `pocketCells`, `pocketEdges`) reads only the dimensions and cuts, and `keptHalfSpace`
 * only the dimensions and the angle cut — the geometry is board-local, and every pose is applied
 * after (toWorld, worldBodies, bodyMesh). Every hole row's id and HOLE_KEYS values are in it too (a hole carries
 * its row id, Hole.row), and every curve's id and CURVE_FIELDS values (a chord face carries its curve id,
 * BodyFace.curve). The angle cut's ID is in it because a clipped face carries
 * it (`BodyFace.cut`) and `bodyMesh` looks the cut up by it; a pocket cut's id is not (no output
 * carries one). Ids are JSON-quoted so an id holding a separator cannot collide.
 */
export function geometryKey(board: Board): string {
  board = geometryBoard(board);
  const val = (v: string | number) => (typeof v === 'number' ? num(v) : v);
  const cuts = board.cuts.map((c) => CUT_GEOMETRY_KEYS.map((k) => val(c[k])).join(',')).join(';');
  const angles = board.angleCuts.map((c) => `${JSON.stringify(c.id)}:${angleCutValues(c).map(val).join(',')}`).join(';');
  const holes = board.holes.map((r) => `${JSON.stringify(r.id)}:${holeRowValues(r).map(val).join(',')}`).join(';');
  const curves = board.curves.map((c) => `${JSON.stringify(c.id)}:${curveValues(c)}`).join(';');
  const key = `${num(board.length)},${num(board.width)},${num(board.thickness)}|${cuts}|${angles}|${holes}|${curves}`;
  // Profile runs b1: a swept profile's id and values (its faces will carry its id), appended ONLY when the view holds one,
  // so every other part's key is byte for byte what it was. Its path reads the through-thickness curves, already above.
  const swept = sweptProfiles(board);
  if (swept.length === 0) return key;
  return `${key}|${swept.map((p) => `${JSON.stringify(p.id)}:${profileValues(p)}`).join(';')}`;
}

/**
 * Freeze `o` and everything reachable from it through objects not already frozen (an already-frozen object is not entered:
 * a memoised, shared structure stays as it is). Chunk c1: the same objects frozen as the `Object.values` recursion it
 * replaces — an array's elements by index (every array frozen here is built by literals, map, filter, flatMap or push:
 * indices only, so `Object.values` yields exactly these, holes skipped either way), any other object's own enumerable
 * properties by `for…in` (the same keys in the same order; no prototype here carries an enumerable property), and a
 * primitive never entered (it was returned at once) — without the `Object.values` arrays or a call per number. Which
 * objects get frozen does not depend on the order they are reached in.
 */
function deepFreeze<T>(o: T): T {
  if (typeof o !== 'object' || o === null || Object.isFrozen(o)) return o;
  Object.freeze(o);
  if (Array.isArray(o)) {
    for (let i = 0; i < o.length; i += 1) { const v: unknown = o[i]; if (typeof v === 'object' && v !== null) deepFreeze(v); }
    return o;
  }
  for (const k in o) { const v: unknown = (o as Record<string, unknown>)[k]; if (typeof v === 'object' && v !== null) deepFreeze(v); }
  return o;
}

/** Entries kept. A furniture piece has far fewer distinct part geometries; a drag mints at most one more per frame. */
export const PART_GEOMETRY_LIMIT = 256;
const cache = new Map<string, PartGeometry>();

/**
 * THE cached reader of a part's bodies and edges (angle-cuts final review): `boardBodies` and
 * `boardEdges`, computed once per distinct `geometryKey` and shared, so a drag frame — which
 * rebuilds every world part as a new object — recomputes only the part whose geometry changed.
 * Edges are computed on first read (a caller needing only bodies never pays for them). Least
 * recently used entries are evicted past PART_GEOMETRY_LIMIT. The result is deep-frozen: shared
 * between parts, it must never be mutated.
 */
export function partGeometry(board: Board): PartGeometry {
  board = geometryBoard(board);
  const key = geometryKey(board);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const bodies = deepFreeze(boardBodies(board));
  const holes = deepFreeze(boardHoles(board));
  let edges: readonly Segment[] | undefined;
  const entry: PartGeometry = {
    bodies,
    holes,
    get edges() {
      if (!edges) {
        edges = deepFreeze(edgesOf(board, () => bodies));
      }
      return edges;
    },
  };
  cache.set(key, entry);
  if (cache.size > PART_GEOMETRY_LIMIT) cache.delete(cache.keys().next().value!);
  return entry;
}
