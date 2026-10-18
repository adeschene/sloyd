import type { Board, Region } from './types';
import { CUT_GEOMETRY_KEYS, pocketCells, pocketEdges, type Point, type Segment } from './cuts';
import { boardHoles, holeRowValues, type Hole } from './holes';
import { angleCutValues, keptHalfSpace, type V3 } from './angleCuts';
import { curveOutline, curvePlan, curveValues, smoothLines, spanOf, splitPieces, uvDims, type ViewCurve } from './curves';
import { profileSection, runoutPieces } from './runout';
import { DIMENSION_ORDER } from './geometry';
import { unionOutline } from './outline';
import { profileEdgeOf, sectionEdgeNamer } from './sectionEdges';
import { geometryBoard, profileValues, shapedPart, sweptProfiles } from './profiles';
import { builtSwept, outlineCurves, sweptPieces, sweptRunouts, type SweptPiece } from './sweep';
import type { CurveCut, ProfileCut } from './types';
import { builtPath } from './profilePath';
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
export interface BodyFace { n: V3; verts: V3[]; cut?: string; curve?: string; runout?: 'lo' | 'hi'; profileEdge?: string; sweep?: number }

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
  const pts: V3[] = [];
  for (const p of points) if (!pts.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= BODY_EPS)) pts.push(p);
  if (pts.length < 3) return [];
  const c: V3 = [0, 1, 2].map((i) => pts.reduce((s, p) => s + p[i]!, 0) / pts.length) as V3;
  const helper: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(n, helper));
  const w = cross(n, u);
  return pts
    .map((p) => ({ p, a: Math.atan2(dot(sub(p, c), w), dot(sub(p, c), u)) }))
    .sort((x, y) => x.a - y.a)
    .map((x) => x.p);
}

/**
 * Keep the part of a convex body on the side n·x + d >= 0 (one saw pass).
 * Returns the SAME array when nothing is removed, so the caller can tell a
 * clipped body from an untouched one. A face lying on the plane is kept as is
 * and no cap is added (the plane is already a face).
 */
function clip(faces: BodyFace[], h: { n: V3; d: number }, tag: { cut?: string; curve?: string; runout?: 'lo' | 'hi'; profileEdge?: string; sweep?: number }): BodyFace[] {
  const g = (p: V3) => dot(h.n, p) + h.d;
  const side = (p: V3) => { const v = g(p); return v > BODY_EPS ? 1 : v < -BODY_EPS ? -1 : 0; };
  if (!faces.some((f) => f.verts.some((p) => side(p) < 0))) return faces;
  const out: BodyFace[] = [];
  const cap: V3[] = [];
  let onPlane = false;
  for (const f of faces) {
    // Final review F3: each vertex's g once per face (the same value every time it was recomputed).
    const n = f.verts.length;
    const gs = f.verts.map(g);
    const sides = gs.map((v) => (v > BODY_EPS ? 1 : v < -BODY_EPS ? -1 : 0));
    if (sides.every((x) => x === 0)) onPlane = true;
    const kept: V3[] = [];
    for (let i = 0; i < n; i += 1) {
      const a = f.verts[i]!;
      const b = f.verts[(i + 1) % n]!;
      const sa = sides[i]!;
      const sb = sides[(i + 1) % n]!;
      if (sa >= 0) kept.push(a);
      if (sa === 0) cap.push(a);
      if (sa * sb < 0) {
        const t = gs[i]! / (gs[i]! - gs[(i + 1) % n]!);
        const p: V3 = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
        kept.push(p);
        cap.push(p);
      }
    }
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
type Piece = { planes: { n: V3; d: number }[]; onArc: boolean[]; runout?: 'lo' | 'hi'; edge?: (string | null)[] };
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
          ? { ...(piece.onArc[i] ? { curve } : {}), ...(piece.runout ? { runout: piece.runout } : {}), profileEdge: edge }
          : piece.onArc[i] ? (piece.runout ? { curve, runout: piece.runout } : { curve }) : {};
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
  const edgesOf = (f: BodyFace): [V3, V3][] =>
    f.verts.map((a, i) => [a, f.verts[(i + 1) % f.verts.length]!] as [V3, V3]).filter(([a, b]) => len(sub(b, a)) > SLIVER);
  // A face with fewer than three non-sliver edges has no area worth the name, and with its sliver edges
  // left out of the inside test it would "contain" every point on the line: it is not a face here.
  const all = bodies.flatMap((b) => b.faces);
  const allEdges = all.map(edgesOf);
  const kept = all.map((_, i) => i).filter((i) => allEdges[i]!.length >= 3);
  const faces = kept.map((i) => all[i]!);
  const fEdges = kept.map((i) => allEdges[i]!);   // each face's edges once (fu 368: they were rebuilt per line and per test)
  const cents = faces.map((f) => scale(f.verts.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / f.verts.length));
  // Final review F3: each face edge's in-plane normal, computed ONCE (they were recomputed per line and per interval —
  // most of a four-edge ogee top's 120 ms). The same expressions as before, so every number is the same float.
  const fEdgeData = fEdges.map((es, fi) => es.map(([a, b]) => {
    const e = sub(b, a);
    const m = unit(cross(faces[fi]!.n, e));
    return { a, e, m, ee: dot(e, e), inward: dot(m, sub(cents[fi]!, a)) < 0 ? scale(m, -1) : m };
  }));

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
  const cellOf = (a: V3, u: V3) => { const k = dot(a, u); return [a[0] - k * u[0], a[1] - k * u[1], a[2] - k * u[2]].map((x) => Math.floor(x / LINE_CELL)); };
  const findLine = (a: V3, u: V3): Line | undefined => {
    const [x, y, z] = cellOf(a, u) as [number, number, number];
    let best = -1;
    for (let i = x - 1; i <= x + 1; i += 1) for (let j = y - 1; j <= y + 1; j += 1) for (let k = z - 1; k <= z + 1; k += 1) {
      for (const id of cells.get(cellKey(i, j, k)) ?? []) {
        if (best !== -1 && id >= best) continue;
        const l = lines[id]!;
        if (len(cross(l.u, u)) <= BODY_EPS && len(cross(sub(a, l.o), l.u)) <= BODY_EPS) best = id;
      }
    }
    return best === -1 ? undefined : lines[best];
  };
  for (let fi = 0; fi < faces.length; fi += 1) {
    const f = faces[fi]!;
    for (const [a, b] of fEdges[fi]!) {
      if (skip && skip(f, a)) continue;
      let u = unit(sub(b, a));
      const lead = Math.abs(u[0]) > BODY_EPS ? u[0] : Math.abs(u[1]) > BODY_EPS ? u[1] : u[2];
      if (lead < 0) u = scale(u, -1);
      if (keep && !keep(a, u, f.n)) continue;
      let line = findLine(a, u);
      if (!line) {
        line = { o: a, u, ts: [], spans: [] };
        const [ci, cj, ck] = cellOf(a, u) as [number, number, number];
        const key = cellKey(ci, cj, ck);
        const ids = cells.get(key);
        if (ids) ids.push(lines.length); else cells.set(key, [lines.length]);
        lines.push(line);
      }
      const ta = dot(sub(a, line.o), line.u);
      const tb = dot(sub(b, line.o), line.u);
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
  // the same joins, pinned on every swept fixture (sweepEdges.test.ts).
  const sweptHere = board.profiles.length > 0 ? builtSwept(board) : [];
  const fast = sweptHere.length > 0 && !opts?.reference;
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
  const a2Pair = stopped.size > 0
    ? (a: BodyFace, b: BodyFace) => {
      if (a.runout === undefined && b.runout === undefined) return false;
      const ea = edgeOf(a), eb = edgeOf(b);
      if (!ea || !eb || ea[0] !== eb[0]) return false;
      const smooth = stopped.get(ea[0]);
      if (!smooth) return false;
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
  const judged = bodyEdges(seams ? seams.bodies : bodies, keep, (o, u) => smoothOn(o, u).map((s) => s.n), smoothPair, joins,
    seams?.skip);
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
 * the tags alone — it lies on the other strip's plane — so bodyEdges makes no candidate of it (`skip`), and the stretch is
 * decided here by the same smoothPair: drawn, or pushed to `joins`. Anything else meeting such a line still makes its own
 * candidate in bodyEdges, which judges it with every face (a crease where anything else meets, invariant 16); its output is
 * taken off what is emitted here, so nothing is drawn twice. A section face ALL of whose edges are such is no wing of any
 * other line (bodies are convex pieces of one solid: nothing else lies on its plane inside it), so it is left out of
 * bodyEdges altogether. Never mutates `bodies`.
 */
function sectionSeams(bodies: readonly Body[], smoothPair: (a: BodyFace, b: BodyFace) => boolean, loopLen: (id: string) => number | null): {
  bodies: Body[]; skip: (f: BodyFace, a: V3) => boolean; drawn: [V3, V3][]; joins: SmoothJoin[];
} {
  interface Strip { i: number; id: string; sweep: number; a: number; b: number; n: V3; d: number; face: BodyFace; cands?: Strip[] }
  const strips: Strip[] = [];
  const byName = new Map<string, Strip>();   // profileEdge + '|' + sweep
  const bySweep = new Map<string, Strip[]>();   // profile id + '|' + sweep
  const faces: { f: BodyFace; st: Strip }[] = [];
  for (const body of bodies) for (const f of body.faces) {
    if (f.sweep === undefined || f.profileEdge === undefined) continue;
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
  const skipped = new Map<BodyFace, Set<V3>>();
  const found = new Map<number, { A: Strip; B: Strip; segs: [V3, V3][] }>();
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
      let set = skipped.get(f);
      if (!set) { set = new Set(); skipped.set(f, set); }
      set.add(a);
      const [P, Q] = A.i < B.i ? [A, B] : [B, A];
      const k = P.i * M + Q.i;
      let g = found.get(k);
      if (!g) { g = { A: P, B: Q, segs: [] }; found.set(k, g); }
      g.segs.push([a, b]);
    }
  }
  const drawn: [V3, V3][] = [];
  const joins: SmoothJoin[] = [];
  for (const { A, B, segs } of found.values()) {
    const smooth = smoothPair(A.face, B.face);
    for (const seg of mergeCollinear(segs)) {
      if (smooth) joins.push({ a: seg[0], b: seg[1], f1: A.face, f2: B.face });
      else drawn.push(seg);
    }
  }
  const whole = (f: BodyFace) => {
    const set = skipped.get(f);
    if (!set) return false;
    const vs = f.verts;
    return vs.every((a, i) => set.has(a) || len(sub(vs[(i + 1) % vs.length]!, a)) <= SLIVER);
  };
  const kept = bodies.map((b) => (b.faces.some(whole) ? { box: b.box, faces: b.faces.filter((f) => !whole(f)) } : b));
  return { bodies: kept, skip: (f, a) => skipped.get(f)?.has(a) ?? false, drawn, joins };
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
  // A face's key: its vertices rounded to 1e-6", combined in an order-free way (a sum and an xor of each one's hash).
  // Two faces of one polygon get one key; a collision only costs a `same` test.
  const keyOf = (f: BodyFace) => {
    let sum = 0, xor = 0;
    for (const p of f.verts) {
      const h = Math.imul(Math.round(p[0] * 1e6), 73856093) ^ Math.imul(Math.round(p[1] * 1e6), 19349663) ^ Math.imul(Math.round(p[2] * 1e6), 83492791);
      sum = (sum + h) | 0;
      xor ^= h;
    }
    return (Math.imul(sum, 31) ^ xor ^ f.verts.length) | 0;
  };
  const byKey = new Map<number, BodyFace[]>();
  const drop = new Set<BodyFace>();
  const same = (a: BodyFace, b: BodyFace) => a.verts.length === b.verts.length
    && dot(a.n, b.n) < -1 + BODY_EPS
    && a.verts.every((p) => b.verts.some((q) => Math.abs(p[0] - q[0]) <= BODY_EPS && Math.abs(p[1] - q[1]) <= BODY_EPS && Math.abs(p[2] - q[2]) <= BODY_EPS));
  for (const b of bodies) for (const f of b.faces) {
    const k = keyOf(f);
    const list = byKey.get(k);
    const twin = list?.find((g) => !drop.has(g) && same(f, g));
    if (twin) { drop.add(twin); drop.add(f); continue; }
    if (list) list.push(f); else byKey.set(k, [f]);
  }
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

function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
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
