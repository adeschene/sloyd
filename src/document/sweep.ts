/**
 * THE place a SWEPT profile becomes geometry (profile runs spec §4.2, Q3; chunk b1): the kept-wood construction the b1 probe
 * proved. Nothing else derives a swept profile's wood; `boardBodies` intersects the part's curve-free cells with the pieces
 * built here (bodies stay CONVEX, invariant 48), then applies a2's run-out at each station end (B1).
 *
 * The construction, in PLAN coordinates (skeleton.ts: plan-CCW, wood on the left, for either face):
 * - the path's truncated straight skeleton to the profile's reach (edge events: a swallowed chord collapses and its
 *   neighbours rejoin), each face clipped at a station end's plane across the path (B1);
 * - BAND pieces: each skeleton face (its convex pieces) × each convex piece of the profile's KEPT (s, t) section, s measured
 *   in from the face's own chord line, t in from the profile's broad face;
 * - REST pieces: the convex pieces of the outline minus the band (a loop: the wavefront; an open path: the outline from the
 *   path's end round to its start, then the wavefront back, spikes removed where a through end's ray runs along the end
 *   face), full thickness.
 * Band and rest pieces tile the outline × the thickness, so a body inside one keeps its object and a body outside the
 * outline (in a through-thickness curve's waste, which is never applied again: Q3) meets none and is dropped.
 *
 * TAG CONTRACT (Q5; Tasks 5–7 read these, `BodyFace`):
 * - a VERTICAL piece plane lying on an outline chord of a through-thickness curve carries `{ curve: <that curve's id> }` —
 *   a band face's own chord edge, an end-ray edge along an end face, the section's s = 0 edge, a rest piece's outline edge —
 *   so chunk 1's radial normals and smooth lines below the profile are unchanged;
 * - a SECTION plane on a section-outline edge off the part's faces carries `{ profileEdge: profileEdgeName(<profile id>, a,
 *   b), sweep: <path segment> }`: [a, b] the collinear run of `profileSection(...).pts` edges (the same index space as the
 *   profile's run-out faces), `sweep` the index of the path chord whose band it is in `profilePath`'s own order (the face's
 *   frame: for face min, plan chord i is path chord n − 1 − i; `PlanChain.index`);
 * - every other plane (a bisector, the wavefront, a station plane, a diagonal between pieces, the section's broad-face and
 *   far edges) carries nothing: it is a seam between pieces, or a face the body already has.
 * `keptSection`'s `onArc` flags say which section edges are arc chords (bodyMesh's normals, Task 5); no face carries it.
 *
 * Memoised per (view object, profile id) and deep-frozen: never mutate a result.
 */
import { convexPieces, distToSegment, twiceArea, type P2, type ViewCurve } from './curves';
import { faceOutline, profilePath, type OutlineChord } from './profilePath';
import { profileAsCurve, viewProfileFaults } from './profiles';
import { BEARING, outlineRun, profileSection, sectionArcs, sectionFrame } from './runout';
import type { Hole } from './holes';
import { profileEdgeOf, sectionEdgeNamer } from './sectionEdges';
import { leftNormal, pathSkeleton, planChain, tidy, type PlanChain, type Skeleton } from './skeleton';
import type { Board, Dimension, ProfileCut, ProfileSide } from './types';
import { DIMENSION_ORDER } from './geometry';

export { pathSkeleton } from './skeleton';

type V3 = [number, number, number];
/** A piece plane's cap tag (a subset of `BodyFace`'s; bodies.ts copies it onto the cap). */
export type BodyFaceTag = { curve?: string; profileEdge?: string; sweep?: number };
type SweepBoard = Pick<Board, Dimension | 'curves'> & { profiles?: readonly ProfileCut[] };

/** One convex piece: board-local half-spaces (kept where n·x + d >= 0), each plane's cap tag, the plan bounding box
 *  [u0, v0, u1, v1], and whether it is a band piece (they are applied first). */
export interface SweptPiece {
  planes: { n: V3; d: number }[]; tags: BodyFaceTag[]; bb: [number, number, number, number]; band: boolean;
  /** Band pieces of one skeleton face share their first `prefix` planes (its prism): `group` numbers that face, so a body
   *  is clipped by the prism ONCE before each section piece (Task 5, lever 1; the same planes in the same order). */
  group?: number; prefix?: number;
}

const EPS = 1e-9;

/** The profile on one straight side (width min, End to end): the curve whose section is the profile's (s, t) section. */
export function oneSideCurve(p: ProfileCut, side: ProfileSide = { across: 'width', from: 'min' }): ViewCurve {
  return profileAsCurve({ ...p, run: { start: { side, through: 'min' }, end: { side: { ...side }, through: 'max' } } });
}

/**
 * The profile's KEPT (s, t) section (the probe's `section`): s in from the edge, t in from the profile's broad face, from
 * `profileSection` of its straight one-side curve. The waste runs from the corner out along t = 0 to the reach, round the
 * profile, and back up s = 0 from its depth (normalised to that order: an asymmetric kind with facing 'edge' is stored the
 * other way round); the kept outline is `[big, 0], …waste[1..], [0, T], [big, T]` (big = reach + 1/2), cut into convex
 * pieces. Per piece edge: `onArc` (an arc chord of the profile) and `edge`, its `profileEdgeName` run in `profileSection`'s
 * own `pts` index space (null on the part's faces, the far edge, or a diagonal).
 */
export function keptSection(view: Pick<Board, Dimension>, p: ProfileCut): { pieces: { pts: P2[]; onArc: boolean[]; edge: (string | null)[] }[]; reach: number; depth: number } {
  const c = oneSideCurve(p);
  const sec = profileSection(view, c);
  const T = view.thickness;
  const m = sec.pts.length;
  if (sec.pts[0]![0] !== 0 || sec.pts[0]![1] !== 0) throw new Error('keptSection: the section does not start at the corner');
  // The waste as [corner, (reach, 0), …, (0, depth)] with per-edge arc flags (edge i: w[i] → w[i + 1]).
  let w: P2[] = sec.pts.slice();
  let arc: boolean[] = sec.arc.slice();
  if (!(sec.pts[1]![1] === 0 && sec.pts[1]![0] > 0)) {
    w = [sec.pts[0]!, ...sec.pts.slice(1).reverse()];
    // Reversed edge i (w[i] → w[i+1]) is original edge (m − 1 − i) for i >= 1, and edge 0 is the old closing edge m − 1.
    arc = w.map((_, i) => sec.arc[(m - 1 - i + m) % m]!);
  }
  const reach = Math.max(...w.map((q) => q[0]));
  const depth = Math.max(...w.map((q) => q[1]));
  const big = reach + 0.5;
  const kept: P2[] = [[big, 0], ...w.slice(1), [0, T], [big, T]];
  const flags: boolean[] = [false, ...arc.slice(1, m - 1), false, false, false];
  const name = sectionEdgeNamer(sec.pts, p.id);
  const pieces = convexPieces(kept, flags).map((pc) => ({
    pts: pc.pts,
    onArc: pc.onArc,
    edge: pc.pts.map((a, i) => name(outlineRun(sec.pts, a, pc.pts[(i + 1) % pc.pts.length]!))),
  }));
  return { pieces, reach, depth };
}

/**
 * Inches past the reach the BAND runs when the section has a WALL there (a bead's quirk: the waste's first edge runs from
 * (reach, 0) straight down): the wall is then a section face inside the band, tagged as every other (its facets join, its
 * shading is the swept surface's — Task 6 fix round 1), never a face of the rest's wavefront, which is part wall and part seam.
 * Past the reach the section is whole stock, so the wood is the same; the fault rule keeps the true reach.
 */
export const WALL_MARGIN = 1 / 64;
/** The offset the band's skeleton is truncated at: the section's reach, plus WALL_MARGIN when a wall stands at the reach. */
export function bandReach(sec: ReturnType<typeof keptSection>): number {
  const wall = sec.pieces.some((kp) => kp.pts.some((a, j) => {
    const b = kp.pts[(j + 1) % kp.pts.length]!;
    return kp.edge[j] !== null && a[0] === sec.reach && b[0] === sec.reach && Math.min(a[1], b[1]) === 0;
  }));
  return wall ? sec.reach + WALL_MARGIN : sec.reach;
}

/** The plan pieces of a swept profile before they become half-spaces: the chain, its skeleton, each face (station-clipped),
 *  and the rest of the outline. */
export interface SweptPlan { chain: PlanChain; skeleton: Skeleton; faces: P2[][]; rest: P2[]; reach: number }

/** A convex polygon clipped to n·x + d >= 0. */
function clip2(poly: readonly P2[], n: P2, d: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    const ga = n[0] * a[0] + n[1] * a[1] + d, gb = n[0] * b[0] + n[1] * b[1] + d;
    if (ga >= 0) out.push(a);
    if (ga * gb < 0) { const t = ga / (ga - gb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
  }
  return out;
}
/** An open polyline clipped to n·x + d >= 0 (the wavefront at a station). */
function clipLine(line: readonly P2[], n: P2, d: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < line.length; i += 1) {
    const a = line[i]!, g = n[0] * a[0] + n[1] * a[1] + d;
    if (g >= 0) out.push(a);
    if (i + 1 < line.length) {
      const b = line[i + 1]!, gb = n[0] * b[0] + n[1] * b[1] + d;
      if (g * gb < 0) { const t = g / (g - gb); out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]); }
    }
  }
  return out;
}
const near = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-12;
const area = (p: readonly P2[]) => twiceArea(p as P2[]) / 2;

/**
 * The plan of a swept profile (above), or null when it has no path, its chain cannot be built, or its skeleton does not exist
 * (an end chord swallowed: `too-tight`). `opts.events: false` is TEST ONLY (the notch regression).
 */
export function sweptPlan(view: SweepBoard, p: ProfileCut, opts?: { events?: boolean }): SweptPlan | null {
  const path = profilePath(view, p);
  const outline = faceOutline(view);
  if (!path || !outline) return null;
  const chain = planChain(view, path, p.face);
  if (!chain) return null;
  const sec = keptSection(view as Pick<Board, Dimension>, p);
  const reach = bandReach(sec);
  const sk = pathSkeleton(chain.chords, chain.loop, reach, chain.rays, opts);
  if (!sk) return null;
  let faces = sk.faces;
  let wave = sk.wave;
  for (const st of chain.stations) {
    faces = faces.map((f) => (f.length >= 3 ? tidy(clip2(f, st.n, st.d)) : f));
    wave = clipLine(wave, st.n, st.d);
  }
  let rest: P2[];
  if (chain.loop) rest = tidy(wave);
  else {
    // The outline from the path's end round to its start (an uncovered part of a split chord included), then the wave.
    const m = outline.chords.length;
    const c0 = path.cover[0]!, c1 = path.cover[path.cover.length - 1]!;
    const pts: P2[] = [];
    const push = (q: P2) => { if (!pts.length || !near(pts[pts.length - 1]!, q)) pts.push(q); };
    push(chain.chords[chain.chords.length - 1]!.b);
    push(outline.chords[c1.chord]!.b);
    for (let k = (c1.chord + 1) % m; k !== c0.chord; k = (k + 1) % m) push(outline.chords[k]!.b);
    push(chain.chords[0]!.a);
    for (const q of wave) push(q);
    if (pts.length > 1 && near(pts[0]!, pts[pts.length - 1]!)) pts.pop();
    rest = tidy(pts);
  }
  return { chain, skeleton: sk, faces, rest, reach };
}

/** Does segment p–q lie along chord c (both ends on its line, its midpoint within its extent)? */
function along(p: P2, q: P2, c: { a: P2; b: P2 }): boolean {
  const d: P2 = [c.b[0] - c.a[0], c.b[1] - c.a[1]];
  const l = Math.hypot(d[0], d[1]);
  const off = (x: P2) => Math.abs(d[0] * (x[1] - c.a[1]) - d[1] * (x[0] - c.a[0])) / l;
  if (off(p) > EPS || off(q) > EPS) return false;
  const mid: P2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const t = (d[0] * (mid[0] - c.a[0]) + d[1] * (mid[1] - c.a[1])) / (l * l);
  return t >= -EPS && t <= 1 + EPS;
}
const bbOf = (p: readonly P2[]): [number, number, number, number] => {
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const q of p) { if (q[0] < u0) u0 = q[0]; if (q[0] > u1) u1 = q[0]; if (q[1] < v0) v0 = q[1]; if (q[1] > v1) v1 = q[1]; }
  return [u0, v0, u1, v1];
};
const isConvex = (p: readonly P2[]) => p.every((_, i) => {
  const a = p[i]!, b = p[(i + 1) % p.length]!, c = p[(i + 2) % p.length]!;
  return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) >= -1e-12;
});

function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

function buildPieces(view: SweepBoard, p: ProfileCut, opts?: { events?: boolean }): SweptPiece[] {
  const plan = sweptPlan(view, p, opts);
  if (!plan) return [];
  const outline = faceOutline(view)!;
  const curved = outline.chords.filter((c) => c.curve !== undefined);
  /** The tag of a vertical plane along p–q: the curve of the outline chord it lies along, if any. */
  const chordTag = (a: P2, b: P2): BodyFaceTag => {
    const c = curved.find((x) => along(a, b, x));
    return c ? { curve: c.curve! } : {};
  };
  const sec = keptSection(view as Pick<Board, Dimension>, p);
  const f = sectionFrame(view as Pick<Board, Dimension>, oneSideCurve(p));
  // t = vIn·(x_thickness − vFace): in from the profile's broad face.
  const vIn = f.vIn, vFace = f.vFace;
  const out: SweptPiece[] = [];
  const prism = (poly: readonly P2[], tagOf: (a: P2, b: P2) => BodyFaceTag) => {
    const planes: { n: V3; d: number }[] = [];
    const tags: BodyFaceTag[] = [];
    for (let i = 0; i < poly.length; i += 1) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      const d = [b[0] - a[0], b[1] - a[1]];
      const l = Math.hypot(d[0]!, d[1]!);
      if (l < 1e-14) continue;
      const n: V3 = [-d[1]! / l, d[0]! / l, 0];
      planes.push({ n, d: -(n[0] * a[0] + n[1] * a[1]) });
      tags.push(tagOf(a, b));
    }
    return { planes, tags };
  };
  const { chain } = plan;
  let groups = 0;
  plan.faces.forEach((face, i) => {
    if (face.length < 3 || area(face) < 1e-14) return;
    const parts = isConvex(face) ? [face] : convexPieces(face, face.map(() => false)).map((x) => x.pts);
    const ch: OutlineChord = chain.chords[i]!;
    const P = ch.a;
    const nIn = leftNormal(ch.a, ch.b);
    const nP = nIn[0] * P[0] + nIn[1] * P[1];
    const seg = chain.index[i]!;
    const sTag: BodyFaceTag = ch.curve !== undefined ? { curve: ch.curve } : {};
    for (const fp of parts) {
      const base = prism(fp, chordTag);
      const group = groups;
      groups += 1;
      for (const kp of sec.pieces) {
        const planes = base.planes.slice();
        const tags = base.tags.slice();
        kp.pts.forEach((a, j) => {
          const b = kp.pts[(j + 1) % kp.pts.length]!;
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (l < 1e-14) return;
          const ns = -(b[1] - a[1]) / l, nt = (b[0] - a[0]) / l, c = -(ns * a[0] + nt * a[1]);
          // ns·s + nt·t + c >= 0 with s = nIn·x − nIn·P and t = vIn·(z − vFace).
          planes.push({ n: [ns * nIn[0], ns * nIn[1], nt * vIn], d: c - ns * nP - nt * vIn * vFace });
          const name = kp.edge[j]!;
          tags.push(name !== null ? { profileEdge: name, sweep: seg } : a[0] === 0 && b[0] === 0 ? sTag : {});
        });
        out.push({ planes, tags, bb: bbOf(fp), band: true, group, prefix: base.planes.length });
      }
    }
  });
  if (plan.rest.length >= 3 && area(plan.rest) > 1e-14) {
    for (const rp of convexPieces(plan.rest, plan.rest.map(() => false))) {
      const { planes, tags } = prism(rp.pts, chordTag);
      out.push({ planes, tags, bb: bbOf(rp.pts), band: false });
    }
  }
  return out;
}

const memo = new WeakMap<object, Map<string, readonly SweptPiece[]>>();

/** A swept profile's convex pieces (above): band pieces first, then rest pieces. Memoised per (view, profile id), frozen.
 *  Empty when the profile has no path or skeleton (it builds nothing). `opts` (TEST ONLY) bypasses the memo. */
export function sweptPieces(view: SweepBoard, p: ProfileCut, opts?: { events?: boolean }): readonly SweptPiece[] {
  if (opts) return deepFreeze(buildPieces(view, p, opts));
  let m = memo.get(view);
  if (!m) { m = new Map(); memo.set(view, m); }
  const hit = m.get(p.id);
  if (hit) return hit;
  const built = deepFreeze(buildPieces(view, p));
  m.set(p.id, built);
  return built;
}

/**
 * The swept profiles `boardBodies` builds (Q3, per profile): those with no fault (a faulted swept profile builds nothing,
 * Q6 — judged on the STORED profile through the view, `viewProfileFaults`) and with a plan.
 */
export function builtSwept(view: SweepBoard & { profiles: readonly ProfileCut[] }): ProfileCut[] {
  return view.profiles.filter((p) => viewProfileFaults(p).length === 0 && sweptPieces(view, p).length > 0);
}

/** The through-thickness curves the face outline carries (Q3: never applied again under a swept profile), by id. */
export function outlineCurves(view: Pick<Board, Dimension | 'curves'>): Set<string> {
  const o = faceOutline(view);
  return new Set(o ? o.chords.flatMap((c) => (c.curve !== undefined ? [c.curve] : [])) : []);
}

/**
 * A swept profile's run-outs (B1): for each STATION end, the profile's one-side view curve on that end's adjacent side with
 * a span stopping at the station — `stopHi` when the side's tangent away from the run points to its run dimension's max,
 * else `stopLo` — so a2's `runoutPieces` revolves the profile about the bit's axis 1/4" outside that side, beyond the
 * station. A mitre or through end has none.
 */
export function sweptRunouts(view: SweepBoard, p: ProfileCut): ViewCurve[] {
  const path = profilePath(view, p);
  if (!path || !path.ends) return [];
  const out: ViewCurve[] = [];
  for (const e of path.ends) {
    if (e.kind !== 'station') continue;
    const c = oneSideCurve(p, e.side);
    const k = c.through === 'length' ? 0 : 1;
    const x = e.at[k]!;
    const span = e.tangent[k]! > 0
      ? { lo: 0, hi: x, stopLo: false, stopHi: true }
      : { lo: x, hi: (view as Pick<Board, Dimension>)[c.through], stopLo: true, stopHi: false };
    out.push({ ...c, span });
  }
  return out;
}

/*
 * The swept waste as PROBES read it (profile runs b1, Task 4; invariant 16, P3, P14): the b1 oracle's rule on the model chords.
 * A point is waste when, d its plan distance to the path's chords and t its depth in from the profile's broad face,
 * 0 <= d < reach and t < tau(d) (strictly, by CURVE_EPS: a point ON the profile surface is stock, P3's open form); past a
 * STATION end (B1) d is instead the distance to a2's bit axis, BEARING outside the side, less BEARING. tau(s) is the top of
 * the profile's own (s, t) section (`profileSection`, a2's) at s. Read only for the profiles `builtSwept` builds: a faulted
 * swept profile builds nothing, so its waste is neither air nor a hole's fault.
 */
interface SweptWaste {
  segs: [P2, P2][];
  tau: (s: number) => number;
  reach: number;
  depth: number;
  /** t from (x_thickness): face max t = T − z, face min t = z. */
  depthOf: (z: number) => number;
  stations: { at: P2; tangent: P2; axis: P2 }[];
}
const SURFACE_EPS = 1e-9; // CURVE_EPS: ON the surface (profileAirTester's tolerance)
const outward = (s: ProfileSide): P2 => (s.across === 'length' ? [s.from === 'min' ? -1 : 1, 0] : [0, s.from === 'min' ? -1 : 1]);
const distSeg = (x: number, y: number, a: P2, b: P2): number => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
};

const wasteMemo = new WeakMap<object, Map<string, SweptWaste | null>>();
function sweptWaste(view: SweepBoard, p: ProfileCut): SweptWaste | null {
  let m = wasteMemo.get(view);
  if (!m) { m = new Map(); wasteMemo.set(view, m); }
  if (m.has(p.id)) return m.get(p.id)!;
  const path = profilePath(view, p);
  let out: SweptWaste | null = null;
  if (path) {
    const dims = view as Pick<Board, Dimension>;
    const pts = profileSection(dims, oneSideCurve(p)).pts;
    const { reach, depth } = keptSection(dims, p);
    const tau = (s: number): number => {
      if (!(s >= 0 && s <= reach)) return 0;
      let best = 0;
      for (let i = 0; i < pts.length; i += 1) {
        const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
        const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
        if (s < lo - 1e-15 || s > hi + 1e-15) continue;
        const t = hi - lo < 1e-15 ? Math.max(a[1], b[1]) : a[1] + ((s - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
        if (t > best) best = t;
      }
      return best;
    };
    const T = dims.thickness;
    out = {
      segs: path.chords.map((c) => [c.a, c.b]),
      tau, reach, depth,
      depthOf: p.face === 'max' ? (z) => T - z : (z) => z,
      stations: (path.ends ?? []).flatMap((e) => (e.kind === 'station'
        ? [{ at: e.at, tangent: e.tangent, axis: [e.at[0] + BEARING * outward(e.side)[0], e.at[1] + BEARING * outward(e.side)[1]] as P2 }]
        : [])),
    };
  }
  m.set(p.id, out);
  return out;
}

/** THE stock probe's air for one swept profile (above), as a hoisted closure on board-local (length, width, thickness). */
export function sweptAirTester(view: SweepBoard, p: ProfileCut): (pt: V3) => boolean {
  const w = sweptWaste(view, p);
  if (!w) return () => false;
  return ([x, y, z]) => {
    const t = w.depthOf(z);
    if (!(t < w.depth)) return false;
    let beyond = Infinity;
    for (const st of w.stations) {
      if ((x - st.at[0]) * st.tangent[0] + (y - st.at[1]) * st.tangent[1] > 0) beyond = Math.min(beyond, Math.hypot(x - st.axis[0], y - st.axis[1]) - BEARING);
    }
    let d = beyond;
    if (beyond === Infinity) for (const [a, b] of w.segs) { const v = distSeg(x, y, a, b); if (v < d) d = v; }
    return d >= 0 && d < w.reach && t < w.tau(d) - SURFACE_EPS;
  };
}

/** The distance between segment a–b and the axis-aligned rectangle [lo, hi] (0 when they meet). */
function segRectDist(a: P2, b: P2, lo: P2, hi: P2): number {
  const inR = (q: P2) => q[0] >= lo[0] && q[0] <= hi[0] && q[1] >= lo[1] && q[1] <= hi[1];
  if (inR(a) || inR(b)) return 0;
  const corners: P2[] = [lo, [hi[0], lo[1]], hi, [lo[0], hi[1]]];
  const cross = (p: P2, q: P2, r: P2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  for (let i = 0; i < 4; i += 1) {
    const c = corners[i]!, e = corners[(i + 1) % 4]!;
    if (cross(a, b, c) * cross(a, b, e) <= 0 && cross(c, e, a) * cross(c, e, b) <= 0) return 0;
  }
  let d = Math.min(...corners.map((c) => distSeg(c[0], c[1], a, b)));
  for (const q of [a, b]) {
    const dx = Math.max(lo[0] - q[0], 0, q[0] - hi[0]);
    const dy = Math.max(lo[1] - q[1], 0, q[1] - hi[1]);
    d = Math.min(d, Math.hypot(dx, dy));
  }
  return d;
}

/**
 * Does a hole meet one swept profile's waste (§4.1; P14, CONSERVATIVE; touching is meeting)? Its plan footprint — the disc
 * along the thickness, else the rectangle its side entry projects to — comes within the reach of the path's chords, each
 * station end's band run on straight along its tangent by the run-out's reach (BEARING + reach, P14), AND its depth interval
 * in from the profile's face meets [0, depth]. A hole just clear of the true waste may be judged into it.
 */
export function sweptWasteMeets(view: SweepBoard, p: ProfileCut, hole: Pick<Hole, 'axis' | 'centre' | 'radius' | 'depth' | 'dir'>): boolean {
  const w = sweptWaste(view, p);
  if (!w) return false;
  const EPS_M = 1e-9; // HOLE_EPS
  const ax = DIMENSION_ORDER.indexOf(hole.axis);
  const a0 = hole.centre[ax]!, a1 = a0 + hole.dir * hole.depth;
  const span = (k: number): [number, number] => (k === ax ? [Math.min(a0, a1), Math.max(a0, a1)] : [hole.centre[k]! - hole.radius, hole.centre[k]! + hole.radius]);
  // Depth: the thickness extent, in from the face.
  const [z0, z1] = span(2);
  const t0 = Math.min(w.depthOf(z0), w.depthOf(z1)), t1 = Math.max(w.depthOf(z0), w.depthOf(z1));
  if (t1 < -EPS_M || t0 > w.depth + EPS_M) return false;
  const run = w.reach + BEARING;
  const segs: [P2, P2][] = [...w.segs, ...w.stations.map((st) => [st.at, [st.at[0] + run * st.tangent[0], st.at[1] + run * st.tangent[1]]] as [P2, P2])];
  if (ax === 2) {
    const c: P2 = [hole.centre[0]!, hole.centre[1]!];
    return segs.some(([a, b]) => distSeg(c[0], c[1], a, b) - hole.radius <= w.reach + EPS_M);
  }
  const [u0, u1] = span(0), [v0, v1] = span(1);
  return segs.some(([a, b]) => segRectDist(a, b, [u0, v0], [u1, v1]) <= w.reach + EPS_M);
}

/*
 * A swept face's shading (profile runs b1, Task 5; spec §5): the TRUE swept surface's normal at each vertex. The face's `sweep`
 * names its path chord (`profilePath`'s own order) and so the true geometry it was swept along: an arc chord's TRUE arc (its
 * centre and radius), or the straight chord itself. At a vertex v the plan's inward direction is toward the arc's centre
 * (convex) or away from it (concave, the arc bowing into the wood), or the straight chord's inward normal; s is v's distance in
 * from the true arc or line and t its depth in from the profile's face. The section's normal at (s, t) — radial about the
 * section arc's centre (a2's `runoutNormals` rule: `sectionArcs`, the arc the face's `profileEdge` run names, the nearest per
 * vertex when the run spans two arcs, the ogee's collinear inflection) or a straight section edge's own — is lifted as
 * n_s·inward + n_t·t̂ and oriented to agree with the face's outward normal. A straight band's normals are chunk 1's. Per
 * face the chord is chosen once, so at a tangent point the straight band keeps chunk 1's normal while the arc's first band
 * turns radially: their shared bisector vertex steps by a few thousandths (pinned in sweptNormals.test.ts).
 */
type NormalFace = { verts: readonly (readonly number[])[]; n: readonly number[]; sweep?: number; profileEdge?: string };
type FaceNormals = ((v: readonly number[]) => V3) | null;
const normalsMemo = new WeakMap<object, Map<string, (face: NormalFace, v: readonly number[]) => V3 | null>>();

/**
 * THE swept-surface normal (above) of one swept profile's faces: board-local, unit, outward; null for a face that is not one
 * of this profile's swept section faces (no `sweep`, another profile's `profileEdge`, or a run on the part's faces).
 * Memoised per (view, profile id); each face's chord and arc resolved once (by the face object).
 */
export function sweptNormals(view: SweepBoard, p: ProfileCut): (face: NormalFace, v: readonly number[]) => V3 | null {
  let m = normalsMemo.get(view);
  if (!m) { m = new Map(); normalsMemo.set(view, m); }
  const hit = m.get(p.id);
  if (hit) return hit;
  const dims = view as Pick<Board, Dimension>;
  const path = profilePath(view, p);
  const c = oneSideCurve(p);
  const { pts } = profileSection(dims, c);
  const { arcs, edgeArc } = sectionArcs(dims, c, pts);
  const f = sectionFrame(dims, c);
  const vIn = f.vIn, vFace = f.vFace;
  const mpts = pts.length;
  // The path's plan inward side: a face-max path is plan-CCW (wood on its left), a face-min one plan-CW (wood on its right).
  const side = p.face === 'max' ? 1 : -1;
  const perFace = new WeakMap<object, FaceNormals>();
  const resolve = (face: NormalFace): FaceNormals => {
    if (face.sweep === undefined || !path) return null;
    const e = profileEdgeOf(face);
    if (!e || e.curve !== p.id) return null;
    const ch = path.chords[face.sweep];
    if (!ch) return null;
    // The section side: the arcs the run [a, b] covers, or the run's straight line.
    const own: number[] = [];
    for (let j = e.a; ; j = (j + 1) % mpts) {
      const k = edgeArc[j];
      if (k !== null && k !== undefined && !own.includes(k)) own.push(k);
      if (j === e.b) break;
    }
    let line: [number, number] | null = null;
    if (own.length === 0) {
      const p0 = pts[e.a]!, p1 = pts[(e.b + 1) % mpts]!;
      const l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      line = [-(p1[1] - p0[1]) / l, (p1[0] - p0[0]) / l];
    }
    const near = (q: P2, k: number) => Math.min(...arcs[k]!.chords.map(([a, b]) => distToSegment(q, a, b)));
    // The plan side: inward direction and s at a point.
    let plan: (x: number, y: number) => [number, number, number];
    if (ch.arc) {
      const { c: o, r, concave } = ch.arc;
      plan = concave
        ? (x, y) => { const dx = x - o[0], dy = y - o[1], d = Math.hypot(dx, dy); return [dx / d, dy / d, d - r]; }
        : (x, y) => { const dx = o[0] - x, dy = o[1] - y, d = Math.hypot(dx, dy); return [dx / d, dy / d, r - d]; };
    } else {
      const ln = Math.hypot(ch.b[0] - ch.a[0], ch.b[1] - ch.a[1]);
      const nx = (side * -(ch.b[1] - ch.a[1])) / ln, ny = (side * (ch.b[0] - ch.a[0])) / ln;
      plan = (x, y) => [nx, ny, nx * (x - ch.a[0]) + ny * (y - ch.a[1])];
    }
    const fn = face.n;
    return (v) => {
      const [ix, iy, s] = plan(v[0]!, v[1]!);
      const t = vIn * (v[2]! - vFace);
      let ns: number, nt: number;
      if (line) [ns, nt] = line;
      else {
        let k = own[0]!;
        if (own.length > 1) { let best = Infinity; for (const j of own) { const d = near([s, t], j); if (d < best) { best = d; k = j; } } }
        const arc = arcs[k]!;
        const ds = s - arc.centre[0], dt = t - arc.centre[1];
        const l = Math.hypot(ds, dt);
        ns = (arc.sign * ds) / l; nt = (arc.sign * dt) / l;
      }
      const N: V3 = [ns * ix, ns * iy, nt * vIn];
      if (N[0] * fn[0]! + N[1] * fn[1]! + N[2] * fn[2]! < 0) { N[0] = -N[0]; N[1] = -N[1]; N[2] = -N[2]; }
      return N;
    };
  };
  const out = (face: NormalFace, v: readonly number[]): V3 | null => {
    let r = perFace.get(face);
    if (r === undefined) { r = resolve(face); perFace.set(face, r); }
    return r ? r(v) : null;
  };
  m.set(p.id, out);
  return out;
}
