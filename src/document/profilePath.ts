/**
 * THE place a profile's run becomes a path (profile runs spec §3.3 *(B)*; chunk b1): the face outline the through-thickness
 * curves leave, a side's stretch of it, and a run's path along it. As `curves.ts` is for outlines (inv 53), nothing else
 * derives a path. Board-local plan coordinates throughout: (u, v) = (length, width), the outline CCW looking at the max face.
 * Results are memoised per part object and deep-frozen: never mutate them.
 */
import {
  arcChords, bowsInto, curveOutline, inPolygonClosed, localSegments, segmentsCross, twiceArea,
  CURVE_SEGMENTS_MAX, CURVE_TOLERANCE, type P2,
} from './curves';
import type { Board, CutFrom, Dimension, ProfileCut, ProfileEnd, ProfileSide } from './types';
import { canonicalRun, endPos, endToEnd, isGeometryView, oneSide, reachDepth, stopFallsBack } from './profiles';

type PathBoard = Pick<Board, Dimension | 'curves'> & { profiles?: readonly ProfileCut[] };

/** One chord of the face outline, board-local (u = length, v = width), CCW looking at the max face. `curve`: the
 *  through-thickness curve whose chord chain it belongs to; `arc`: the TRUE arc it is a chord of — centre, radius, and
 *  whether it is concave (the arc bows into the wood: an arch, a notch) or convex (a rounded corner, a bow). */
export interface OutlineChord { a: P2; b: P2; curve?: string; arc?: { c: P2; r: number; concave: boolean } }
/** A closed loop, CCW: chord i ends where chord i + 1 starts. */
export interface FaceOutline { chords: OutlineChord[] }
/** A side's stretch: the chord index range [from, to] (inclusive, may wrap), and how each end ends — at a sharp corner
 *  (the run goes out through the end face) or round a corner arc (B1: it stops at the far tangent point). */
export interface Stretch { from: number; to: number; startEnd: 'sharp' | 'arc'; endEnd: 'sharp' | 'arc' }
/** A run's path, in the FACE's frame: CCW as seen from outside `face` (the plan outline reversed for face `min`). In PLAN
 *  coordinates a face-min path therefore runs CLOCKWISE: a chord's plan left normal points OUTWARD there (into the waste),
 *  and the wood lies on its plan right. Take the inward side from the face, never from the plan left normal alone.
 *  `cover` is what the path takes of the PLAN outline (face-independent): for each outline chord index, the parameter
 *  interval [t0, t1] of that chord (a mitred end splits one chord at the arc's midpoint's projection). It is THE source of
 *  a swept profile's overlap coverage (profileFaults), so the overlap judgement and the built path cannot disagree. */
export interface ProfilePath { chords: OutlineChord[]; loop: boolean; ends?: [PathEnd, PathEnd]; cover: readonly CoverSpan[] }
/** One outline chord's covered parameter interval (plan outline index). */
export interface CoverSpan { chord: number; t0: number; t1: number }
/**
 * How an open path ends. `through`: at a sharp corner, out through the end face; `ray` runs along that end face INTO the
 * part, scaled so the path's end vertex moves 1 per unit of offset into the wood (the skeleton's end-vertex velocity).
 * `station`: at the far tangent point `at` of a corner arc on the adjacent side `side` (B1); `tangent` is the unit
 * direction along that side AWAY from the run, where a2's run-out lies.
 * `mitre` (B1a): the adjacent side holds an End to end profile on the same face whose stretch takes this corner arc, so the
 * two meet at the arc's TRUE midpoint `at` in a mitre, as R6 mitres a sharp corner: `ray` runs along the radial line
 * through `at` INTO the wood, scaled by 1/(n·u) of the path's end chord (the chord the split ends at `at`), as a through
 * ray is. The builder (Task 3) ends the band on the radial plane through `at`; no run-out.
 */
export type PathEnd = { kind: 'through'; ray: P2 } | { kind: 'station'; at: P2; tangent: P2; side: ProfileSide }
  | { kind: 'mitre'; at: P2; ray: P2 }
  /** b2: a user's Start or Stop (B2). Plan vectors: `tangent` along the station's MODEL chord away from the run, `normal`
   *  that chord's plan inward normal (into the wood, the plan-CCW left normal). `at` the station's point ON that chord
   *  (Q11), or — on the BUILT path only — the vertex the end-chord zone moved it to (Q13). */
  | { kind: 'stop'; at: P2; tangent: P2; normal: P2; side: ProfileSide };
/** A station's point on its side's stretch (B2): outline chord `chord`, parameter `t` on it, the point `at` (exactly the
 *  chord's `a` at 0 and `b` at 1). */
export interface StationPoint { chord: number; t: number; at: P2 }

const EPS = 1e-9;
const PRESENCE: Opts = Object.freeze({ presence: true });

// The rectangle's edges in CCW order: 0 the width-min side (v = 0), 1 length max (u = L), 2 width max (v = W),
// 3 length min (u = 0). Every vector below is a literal, so no -0 reaches a caller.
const SIDES: readonly ProfileSide[] = [
  { across: 'width', from: 'min' }, { across: 'length', from: 'max' }, { across: 'width', from: 'max' }, { across: 'length', from: 'min' },
];
/** Edge E's inward normal: the direction along BOTH adjacent edges, from E's corners, into the part (the reverse of
 *  prev(E)'s CCW travel, and next(E)'s travel). */
const INWARD: readonly P2[] = [[0, 1], [-1, 0], [0, -1], [1, 0]];
const prevEdge = (e: number) => (e + 3) % 4;
const nextEdge = (e: number) => (e + 1) % 4;
const edgeOfSide = (s: ProfileSide): number => SIDES.findIndex((x) => x.across === s.across && x.from === s.from);
const sameSide = (a: ProfileSide, b: ProfileSide) => a.across === b.across && a.from === b.from;

/** The rectangle edges a point lies on (two at a corner, none off the boundary). */
function edgesOf(p: P2, L: number, W: number): Set<number> {
  const out = new Set<number>();
  const inU = p[0] >= -EPS && p[0] <= L + EPS;
  const inV = p[1] >= -EPS && p[1] <= W + EPS;
  if (inU && Math.abs(p[1]) <= EPS) out.add(0);
  if (inV && Math.abs(p[0] - L) <= EPS) out.add(1);
  if (inU && Math.abs(p[1] - W) <= EPS) out.add(2);
  if (inV && Math.abs(p[0]) <= EPS) out.add(3);
  return out;
}
const sharesEdge = (a: Set<number>, b: Set<number>) => [...a].some((e) => b.has(e));
const near = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= EPS;

function deepFreeze<T>(o: T): T {
  if (typeof o === 'object' && o !== null && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

const outlineMemo = new WeakMap<object, FaceOutline | null>();

/**
 * The outer outline the through-thickness curves leave on the broad faces (the same on both): the rectangle with each
 * curve's chord chain — the run of its outline edges off the rectangle's boundary, at `curveOutline`'s chords — spliced
 * into the perimeter in place of the waste's stretch of it. A curve wholly inside the face is an inner loop and is not
 * followed (R8). Null when the result is not one simple CCW loop: two curves' perimeter stretches overlap, a chain leaves
 * the face, a curve meets the boundary but not along an edge, or chords cross (a `cuts-through` or `runs-off` curve).
 */
export function faceOutline(board: Pick<Board, Dimension | 'curves'>): FaceOutline | null {
  const hit = outlineMemo.get(board);
  if (hit !== undefined) return hit;
  const built = buildOutline(board);
  const frozen = built && deepFreeze(built);
  outlineMemo.set(board, frozen);
  return frozen;
}

type Meta = { curve: string; arc?: { c: P2; r: number; concave: boolean } };

function buildOutline(board: Pick<Board, Dimension | 'curves'>): FaceOutline | null {
  const L = board.length, W = board.width, P = 2 * (L + W);
  const per = (p: P2): number => {
    if (Math.abs(p[1]) <= EPS) return p[0];
    if (Math.abs(p[0] - L) <= EPS) return L + p[1];
    if (Math.abs(p[1] - W) <= EPS) return L + W + (L - p[0]);
    return 2 * L + W + (W - p[1]);
  };
  const at = (q: number): P2 => {
    q = ((q % P) + P) % P;
    return q <= L ? [q, 0] : q <= L + W ? [L, q - L] : q <= 2 * L + W ? [L - (q - L - W), W] : [0, W - (q - 2 * L - W)];
  };
  const mod = (x: number) => ((x % P) + P) % P;
  const wastes: { s: number; span: number; pts: P2[]; meta: Meta[] }[] = [];
  for (const c of board.curves) {
    if (c.through !== 'thickness') continue;
    const o = curveOutline(board, c);
    const segs = localSegments(board, c);
    const segOf: number[] = [];
    segs.forEach((s, i) => {
      const n = s.kind === 'line' ? 1 : arcChords(s, CURVE_TOLERANCE, CURVE_SEGMENTS_MAX);
      for (let k = 0; k < n; k += 1) segOf.push(i);
    });
    if (segOf.length !== o.pts.length) throw new Error('faceOutline: chord count disagrees with curveOutline');
    const m = o.pts.length;
    const onB = o.pts.map((_, i) => segs[segOf[i]!]!.kind === 'line'
      && sharesEdge(edgesOf(o.pts[i]!, L, W), edgesOf(o.pts[(i + 1) % m]!, L, W)));
    if (!onB.some(Boolean)) {
      if (o.pts.some((p) => edgesOf(p, L, W).size > 0)) return null;
      continue;   // an inner loop (R8)
    }
    const starts = onB.map((b, i) => !b && onB[(i - 1 + m) % m]).map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
    if (starts.length === 0) continue;   // all on the boundary: no area off it
    if (starts.length > 1) return null;   // meets the boundary in two stretches
    const first = starts[0]!;
    const chain: P2[] = [];
    const meta: Meta[] = [];
    for (let i = first; !onB[i]; i = (i + 1) % m) {
      chain.push(o.pts[i]!);
      const s = segs[segOf[i]!]!;
      meta.push(s.kind === 'arc' ? { curve: c.id, arc: { c: s.centre, r: s.radius, concave: bowsInto(segs, s) === 'wood' } } : { curve: c.id });
      if (onB[(i + 1) % m]) chain.push(o.pts[(i + 1) % m]!);
    }
    if (chain.some((p) => p[0] < -EPS || p[0] > L + EPS || p[1] < -EPS || p[1] > W + EPS)) return null;
    const ends = [chain[0]!, chain[chain.length - 1]!];
    if (ends.some((p) => edgesOf(p, L, W).size === 0)) return null;
    const pa = per(ends[0]!), pb = per(ends[1]!);
    const forward = mod(pb - pa);
    if (forward <= EPS || forward >= P - EPS) return null;
    // Which way round the perimeter is waste: a point a third of the way along that stretch lies in the waste.
    if (inPolygonClosed(o.pts, at(pa + forward / 3))) wastes.push({ s: pa, span: forward, pts: chain, meta });
    else wastes.push({ s: pb, span: P - forward, pts: chain.slice().reverse(), meta: meta.slice().reverse() });
  }
  const inside = (q: number, w: { s: number; span: number }) => { const d = mod(q - w.s); return d > EPS && d < w.span - EPS; };
  for (let i = 0; i < wastes.length; i += 1) {
    for (let j = i + 1; j < wastes.length; j += 1) {
      const a = wastes[i]!, b = wastes[j]!;
      const same = Math.min(mod(a.s - b.s), mod(b.s - a.s)) <= EPS;
      if (same || inside(a.s, b) || inside(b.s, a)) return null;
    }
  }
  const events: { q: number; pts: P2[]; meta: (Meta | undefined)[] }[] = [];
  for (const q of [0, L, L + W, 2 * L + W]) if (!wastes.some((w) => inside(q, w))) events.push({ q, pts: [at(q)], meta: [undefined] });
  for (const w of wastes) events.push({ q: w.s, pts: w.pts, meta: [...w.meta, undefined] });
  events.sort((a, b) => a.q - b.q);
  const out: { p: P2; meta?: Meta }[] = [];
  for (const ev of events) {
    ev.pts.forEach((p, k) => {
      const last = out[out.length - 1];
      const mk = ev.meta[k];
      if (last && near(last.p, p)) { if (mk) last.meta = mk; return; }
      out.push(mk ? { p, meta: mk } : { p });
    });
  }
  if (out.length > 1 && near(out[0]!.p, out[out.length - 1]!.p)) {
    const last = out.pop()!;
    if (last.meta && !out[0]!.meta) out[0]!.meta = last.meta;
  }
  if (out.length < 3) return null;
  const n = out.length;
  const chords: OutlineChord[] = out.map((x, i) => ({ a: x.p, b: out[(i + 1) % n]!.p, ...(x.meta ?? {}) }));
  if (twiceArea(out.map((x) => x.p)) <= 0) return null;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(chords[i]!.a, chords[i]!.b, chords[j]!.a, chords[j]!.b)) return null;
    }
  }
  return { chords };
}

/** The chord indices of each through-thickness curve's chain (contiguous, possibly wrapping), by curve id. */
function chains(outline: FaceOutline): { start: number; end: number }[] {
  const ch = outline.chords;
  const n = ch.length;
  const out: { start: number; end: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = ch[i]!.curve;
    if (id === undefined || ch[(i - 1 + n) % n]!.curve === id) continue;
    let end = i;
    while (ch[(end + 1) % n]!.curve === id && (end + 1) % n !== i) end = (end + 1) % n;
    out.push({ start: i, end });
  }
  return out;
}

/**
 * A side's stretch of the outline (spec §3.3 *(B)*): the boundary chords on the side's rectangle edge and every curve
 * chain that belongs to it — both ends on that edge (an arch, a notch), or a chain from the previous edge to the next that
 * takes the whole edge (a bow) — between the side's two corners. A corner is sharp, or a CORNER ARC (a chain from this
 * edge to an adjacent one, not lying along that one): the stretch carries round it to its far tangent point (B1) and that
 * end is `'arc'`. Null when the side has no stretch (taken by a neighbour's waste) or it is not one run.
 */
export function sideStretch(board: Pick<Board, Dimension>, outline: FaceOutline, side: ProfileSide): Stretch | null {
  // Memoised per (outline, board dimensions, side) (Task 6: ~20% of a fresh trial part's profileFaults was this walk, asked
  // for each side many times per judgement); the outline is frozen and never mutated, the result frozen.
  let m = stretchMemo.get(outline);
  if (!m) { m = new Map(); stretchMemo.set(outline, m); }
  const key = `${board.length},${board.width},${side.across},${side.from}`;
  if (m.has(key)) return m.get(key)!;
  const s = computeStretch(board, outline, side);
  m.set(key, s ? Object.freeze(s) : null);
  return m.get(key)!;
}
const stretchMemo = new WeakMap<FaceOutline, Map<string, Stretch | null>>();
function computeStretch(board: Pick<Board, Dimension>, outline: FaceOutline, side: ProfileSide): Stretch | null {
  const L = board.length, W = board.width;
  const E = edgeOfSide(side);
  const ch = outline.chords;
  const n = ch.length;
  const groups = chains(outline).map((g) => ({ ...g, S: edgesOf(ch[g.start]!.a, L, W), T: edgesOf(ch[g.end]!.b, L, W) }));
  type G = (typeof groups)[number];
  const along = (g: G, e: number) => g.S.has(e) && g.T.has(e);
  const belongs = (g: G) => along(g, E) || (g.S.has(prevEdge(E)) && g.T.has(nextEdge(E)) && !g.S.has(E) && !g.T.has(E));
  // B1 speaks of corner ARCS: a corner chain of lines only (a clipped corner written as a curve) is a sharp end.
  const hasArc = (g: G) => { for (let i = g.start; ; i = (i + 1) % n) { if (ch[i]!.arc) return true; if (i === g.end) return false; } };
  const cornerIn = (g: G) => g.S.has(prevEdge(E)) && g.T.has(E) && !g.S.has(E) && !along(g, prevEdge(E)) && hasArc(g);
  const cornerOut = (g: G) => g.S.has(E) && g.T.has(nextEdge(E)) && !g.T.has(E) && !along(g, nextEdge(E)) && hasArc(g);
  const groupAt: (G | undefined)[] = new Array(n).fill(undefined);
  for (const g of groups) for (let i = g.start; ; i = (i + 1) % n) { groupAt[i] = g; if (i === g.end) break; }
  const core = ch.map((c, i) => {
    const g = groupAt[i];
    if (g) return belongs(g);
    return edgesOf(c.a, L, W).has(E) && edgesOf(c.b, L, W).has(E);
  });
  const runStarts = core.map((x, i) => x && !core[(i - 1 + n) % n]).map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  let from: number, to: number;
  if (runStarts.length === 1) {
    from = runStarts[0]!;
    to = from;
    while (core[(to + 1) % n]) to = (to + 1) % n;
  } else if (runStarts.length === 0 && !core.some(Boolean)) {
    // No chord of its own: two corner arcs meet on this edge at a tangent point.
    const meet = groups.find((g) => cornerIn(g) && groupAt[(g.end + 1) % n] && cornerOut(groupAt[(g.end + 1) % n]!));
    if (!meet) return null;
    return { from: meet.start, to: groupAt[(meet.end + 1) % n]!.end, startEnd: 'arc', endEnd: 'arc' };
  } else return null;
  let startEnd: Stretch['startEnd'] = 'sharp', endEnd: Stretch['endEnd'] = 'sharp';
  const before = groupAt[(from - 1 + n) % n];
  if (before && before !== groupAt[from] && cornerIn(before)) { from = before.start; startEnd = 'arc'; }
  const after = groupAt[(to + 1) % n];
  if (after && after !== groupAt[to] && cornerOut(after)) { to = after.end; endEnd = 'arc'; }
  return { from, to, startEnd, endEnd };
}

/** The indices of [from, to], inclusive, wrapping. */
function stretchIndices(n: number, s: Stretch): number[] {
  const out: number[] = [];
  for (let i = s.from; ; i = (i + 1) % n) { out.push(i); if (i === s.to) break; }
  return out;
}

/** The plan left normal of a chord (inward on the CCW plan outline), unit. */
function leftNormal(c: { a: P2; b: P2 }): P2 {
  const d: P2 = [c.b[0] - c.a[0], c.b[1] - c.a[1]];
  const l = Math.hypot(d[0], d[1]);
  return [-d[1] / l, d[0] / l];
}
/** `u` scaled by 1 / (n·u), n the plan left normal of `chord`; null when u does not run into the wood. */
function scaledRay(u: P2, chord: { a: P2; b: P2 }): P2 | null {
  const n = leftNormal(chord);
  const dot = n[0] * u[0] + n[1] * u[1];
  if (!(dot > EPS)) return null;
  const k = 1 / dot;
  return [u[0] * k + 0, u[1] * k + 0];
}
/**
 * A through end's ray (the probe's `endRays`): the unit direction of the END FACE — the outline chord adjacent to the path's
 * end vertex, pointing away from that vertex (`from` → `to`) — scaled by 1 / (n·u), n the plan left normal (inward on the
 * CCW plan outline) of the path's end chord `pathChord`, so the end vertex moves 1 per unit of offset into the wood. Null
 * when the end face does not run into the wood (a degenerate outline: no path).
 */
function throughRay(from: P2, to: P2, pathChord: OutlineChord): P2 | null {
  const e: P2 = [to[0] - from[0], to[1] - from[1]];
  const le = Math.hypot(e[0], e[1]);
  return scaledRay([e[0] / le, e[1] / le], pathChord);
}

/** One path piece: an outline chord (possibly split) and the plan parameter interval of it the piece covers. */
type Piece = { chord: OutlineChord; index: number; t0: number; t1: number };

/**
 * A STATION end's extension (B1, *Amended (implementation, b1 Task 6)*): the path carries on past the corner arc's far tangent
 * point along the adjacent side's outline chord for ε = 2 · reach · tan(φ / 2), φ the angle between the arc's end chord and
 * that side, and the station is there (reach · tan(φ / 2) is where the bisector from the tangent point reaches the reach: at
 * exactly that the straight band's offset vanishes at the reach and the skeleton reads its end chord as swallowed, so twice). The end chord's band then meets this straight band on their bisector — where both offsets
 * agree, so with one section — and the straight band meets a2's run-out on the station plane in the side's own frame, as a2
 * guarantees: no step (the end chord's band clipped on a plane across the SIDE was its section stretched by 1/cos(φ)).
 * `adj` is the adjacent side's chord, `index` its outline index, `end` the arc's end chord; `atStart`: the run's start.
 * The point is read off the chord at its parameter exactly as planChain reads a cover (a + t·(b − a)).
 */
function stationExtension(adj: OutlineChord, index: number, end: OutlineChord, atStart: boolean, reach: number): Piece | null {
  const da: P2 = [adj.b[0] - adj.a[0], adj.b[1] - adj.a[1]], de: P2 = [end.b[0] - end.a[0], end.b[1] - end.a[1]];
  const la = Math.hypot(da[0], da[1]), le = Math.hypot(de[0], de[1]);
  const phi = Math.acos(Math.max(-1, Math.min(1, (da[0] * de[0] + da[1] * de[1]) / (la * le))));
  const eps = 2 * reach * Math.tan(phi / 2);
  // Fix round 2 (I2): only along a STRAIGHT side longer than 2ε. A short side (the skeleton would read a clamped extension as a
  // swallowed end chord: too-tight on a profile that fits) or a curved one (a full-round end: the station would leave the side
  // its run-out is framed on) keeps the station at the tangent point, as before ε, and the small step there is accepted.
  if (adj.arc || adj.curve !== undefined || !(la > 2 * eps)) return null;
  const t = eps / la;
  if (atStart) {
    const t0 = 1 - t;
    const a: P2 = t0 === 0 ? adj.a : [adj.a[0] + t0 * da[0], adj.a[1] + t0 * da[1]];
    return { chord: { ...adj, a }, index, t0, t1: 1 };
  }
  const b: P2 = t === 1 ? adj.b : [adj.a[0] + t * da[0], adj.a[1] + t * da[1]];
  return { chord: { ...adj, b }, index, t0: 0, t1: t };
}

/**
 * B1a: the corner arc at one end of a stretch is MITRED when the adjacent side holds an End to end profile on the same face
 * whose own stretch takes that arc — decided on its STORED presence, never its faults, so faults and mitres never depend on
 * each other. The arc's TRUE midpoint `at` (centre + r · the bisector of its two tangent points); the pieces are trimmed so
 * the path ends exactly there, the chord holding it split (its covered interval split at `at`'s projection onto it, so the
 * two neighbours' covers TOUCH, zero shared length). Null for a corner the trim cannot place (no arc).
 */
function mitre(pieces: Piece[], corner: number[], atStart: boolean, outline: FaceOutline): { pieces: Piece[]; at: P2; ray: P2 } | null {
  const arcs = corner.filter((i) => outline.chords[i]!.arc);
  if (arcs.length === 0) return null;
  const A = outline.chords[arcs[0]!]!.a, B = outline.chords[arcs[arcs.length - 1]!]!.b;
  const { c, r, concave } = outline.chords[arcs[0]!]!.arc!;
  const m: P2 = [A[0] - c[0] + B[0] - c[0], A[1] - c[1] + B[1] - c[1]];
  const lm = Math.hypot(m[0], m[1]);
  if (!(lm > EPS)) return null;
  let at: P2 = [c[0] + (r * m[0]) / lm, c[1] + (r * m[1]) / lm];
  const cross = (o: P2, p: P2, q: P2) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  // The arc chord whose angular range holds `at` (inclusive at its ends).
  const k = arcs.find((i) => { const ch = outline.chords[i]!; const s = Math.sign(cross(c, ch.a, ch.b)); return s * cross(c, ch.a, at) >= -EPS && s * cross(c, at, ch.b) >= -EPS; });
  if (k === undefined) return null;
  const pos = pieces.findIndex((p) => p.index === k);
  if (pos < 0) return null;
  const ch = outline.chords[k]!;
  const d: P2 = [ch.b[0] - ch.a[0], ch.b[1] - ch.a[1]];
  const tat = ((at[0] - ch.a[0]) * d[0] + (at[1] - ch.a[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]);
  // `at` on a chord vertex (an even chord count): the vertex itself, so the path ends EXACTLY at `at` and both neighbours
  // agree bit for bit.
  if (near(at, ch.a)) at = ch.a;
  else if (near(at, ch.b)) at = ch.b;
  // The piece split keeps its OWN other end (b2: a stop's trimmed piece, I1 of the b2 Task 2 review); an End to end piece is
  // the whole outline chord, so this is b1's split exactly. A run that never reaches `at` (its stop lies before the mitre
  // point) takes no mitre: the end falls back to B1's station, and the two runs' overlap is judged as such (Q19).
  const own = pieces[pos]!;
  let out: Piece[];
  if (atStart) {
    if (near(at, ch.b)) out = pieces.slice(pos + 1);
    else if (near(at, ch.a)) out = pieces.slice(pos);
    else if (!(own.t1 > tat)) return null;
    else out = [{ chord: { ...own.chord, a: at }, index: k, t0: tat, t1: own.t1 }, ...pieces.slice(pos + 1)];
  } else {
    if (near(at, ch.a)) out = pieces.slice(0, pos);
    else if (near(at, ch.b)) out = pieces.slice(0, pos + 1);
    else if (!(own.t0 < tat)) return null;
    else out = [...pieces.slice(0, pos), { chord: { ...own.chord, b: at }, index: k, t0: own.t0, t1: tat }];
  }
  if (out.length === 0) return null;
  const end = atStart ? out[0]!.chord : out[out.length - 1]!.chord;
  const lr = Math.hypot(at[0] - c[0], at[1] - c[1]);
  // Into the wood along the radial line: toward the centre for a convex arc, away from it for a concave one.
  const u: P2 = concave ? [(at[0] - c[0]) / lr, (at[1] - c[1]) / lr] : [(c[0] - at[0]) / lr, (c[1] - at[1]) / lr];
  const ray = scaledRay(u, end);
  return ray ? { pieces: out, at, ray } : null;
}

/** `build`: B1's ε and Q13's zone; `snap`: the zone only; `presence` / `keep`: B1a's partners (`neighbourTakes`);
 *  `without`: profiles read as fallen back — no B1a partner (Q10's neighbour test, Task 3 fix round 1; by set identity). */
export type Opts = { build?: boolean; snap?: boolean; presence?: boolean; keep?: ProfileCut; without?: ReadonlySet<ProfileCut> };

/** The corner arc's chords at a stretch's start (`atStart`) or end: the run of chords carrying the end chord's curve id. */
function cornerChords(outline: FaceOutline, s: Stretch, atStart: boolean): number[] {
  const idx = stretchIndices(outline.chords.length, s);
  const out: number[] = [];
  if (atStart) {
    if (s.startEnd !== 'arc') return out;
    const id = outline.chords[idx[0]!]!.curve;
    for (const i of idx) { if (outline.chords[i]!.curve !== id) break; out.push(i); }
  } else {
    if (s.endEnd !== 'arc') return out;
    const id = outline.chords[idx[idx.length - 1]!]!.curve;
    for (const i of [...idx].reverse()) { if (outline.chords[i]!.curve !== id) break; out.push(i); }
    out.reverse();
  }
  return out;
}

/** A run's two ends in PLAN order (the plan walk is CCW looking at the max face; a face-min run's travel reverses it). A
 *  one-side run is read in its canonical order (P11), as its own path walks it (a mirrored-then-edited copy may sit reversed). */
function planEnds(board: Pick<Board, Dimension>, q: ProfileCut): [ProfileEnd, ProfileEnd] | null {
  if ('loop' in q.run) return null;
  const run = oneSide(q.run) ? canonicalRun(board, q.face, q.run) : q.run;
  return q.face === 'max' ? [run.start, run.end] : [run.end, run.start];
}

/**
 * B1a, widened (Q18): another profile on the same face, not a loop, whose plan-ordered END (`atEnd`) or START is a `through`
 * end on `adj` whose stretch holds `corner[0]` — decided on STORED presence, never faults. For two End to end profiles it is
 * b1's test exactly (both their ends are `through` on the one side).
 * b2 (Q10, the Task 2 reviews' M-g and m1): a one-side STATION run that falls back to a2 (`stopFallsBack`) takes no arc —
 * a2's prism follows none — so on a STORED part it is no partner: the neighbour carries round to B1's station, as it is
 * built (a view holds no fallen-back stop, so the builder never sees one), and no half-arc is left unprofiled. Except
 * `opts.presence` (Q10's phase 1, where every stop is read by its shape and the fallback is being decided) and `opts.keep`
 * (the profile being judged, read as present: its swept judgement asks what it would claim if it followed).
 */
function neighbourTakes(board: PathBoard, outline: FaceOutline, p: ProfileCut, adj: ProfileSide, corner: number[], atEnd: boolean, opts?: Opts): boolean {
  return (board.profiles ?? []).some((q) => {
    if (q === p || q.id === p.id || q.face !== p.face || opts?.without?.has(q)) return false;
    const ends = planEnds(board, q);
    const e = ends && ends[atEnd ? 1 : 0];
    if (!e || !('through' in e) || !sameSide(e.side, adj)) return false;
    const t = sideStretch(board, outline, adj);
    if (!t || !stretchIndices(outline.chords.length, t).includes(corner[0]!)) return false;
    return !(!opts?.presence && q !== opts?.keep && oneSide(q.run) && !endToEnd(q.run) && !isGeometryView(board)
      && stopFallsBack(board as Parameters<typeof stopFallsBack>[0], q));
  });
}

/**
 * The plan START of a stretch at its corner (B1/B1a/R6, the End to end branch's own code, moved): sharp → a through ray off
 * the adjacent outline chord; a corner arc → a B1a mitre when `neighbourTakes`, else B1's station at the far tangent point
 * (with ε when building). `first0` is the UNTRIMMED first chord. Null when the end face does not run into the wood.
 */
function openStart(board: PathBoard, outline: FaceOutline, p: ProfileCut, s: Stretch, E: number, pieces: Piece[], first0: OutlineChord, reach: number, opts?: Opts): { pieces: Piece[]; end: PathEnd } | null {
  const m = outline.chords.length;
  const prior = outline.chords[(s.from - 1 + m) % m]!;
  if (s.startEnd === 'sharp') {
    const ray = throughRay(prior.b, prior.a, first0);
    return ray ? { pieces, end: { kind: 'through', ray } } : null;
  }
  const corner = cornerChords(outline, s, true);
  const mt = neighbourTakes(board, outline, p, SIDES[prevEdge(E)]!, corner, true, opts) ? mitre(pieces, corner, true, outline) : null;
  if (mt) return { pieces: mt.pieces, end: { kind: 'mitre', at: mt.at, ray: mt.ray } };
  const ext = opts?.build ? stationExtension(prior, (s.from - 1 + m) % m, first0, true, reach) : null;
  return { pieces: ext ? [ext, ...pieces] : pieces, end: { kind: 'station', at: ext ? ext.chord.a : first0.a, tangent: INWARD[E]!, side: { ...SIDES[prevEdge(E)]! } } };
}

/** The plan END likewise; `pieces` already carry the start's mitre trim, `last0` is the UNTRIMMED last chord. */
function openEnd(board: PathBoard, outline: FaceOutline, p: ProfileCut, s: Stretch, E: number, pieces: Piece[], last0: OutlineChord, reach: number, opts?: Opts): { pieces: Piece[]; end: PathEnd } | null {
  const m = outline.chords.length;
  const next = outline.chords[(s.to + 1) % m]!;
  if (s.endEnd === 'sharp') {
    const ray = throughRay(next.a, next.b, last0);
    return ray ? { pieces, end: { kind: 'through', ray } } : null;
  }
  const corner = cornerChords(outline, s, false);
  const mt = neighbourTakes(board, outline, p, SIDES[nextEdge(E)]!, corner, false, opts) ? mitre(pieces, corner, false, outline) : null;
  if (mt) return { pieces: mt.pieces, end: { kind: 'mitre', at: mt.at, ray: mt.ray } };
  const ext = opts?.build ? stationExtension(next, (s.to + 1) % m, last0, false, reach) : null;
  return { pieces: ext ? [...pieces, ext] : pieces, end: { kind: 'station', at: ext ? ext.chord.b : last0.b, tangent: INWARD[E]!, side: { ...SIDES[nextEdge(E)]! } } };
}

/**
 * Where a station sits (B2, Q11): the point on its side's stretch of the MODEL chords at run-dimension coordinate `x` (a
 * tape laid along the part, squared to the edge). Every piece of a stretch moves one way along the run dimension (§3.3), so
 * it names one point; the first chord holding it in stretch order wins (a vertex: the chord ENDING there, except the
 * stretch's own first vertex). Null off the stretch (or no stretch). A station becomes a point only through this (inv 44).
 */
export function stationPoint(board: Pick<Board, Dimension>, outline: FaceOutline, side: ProfileSide, x: number): StationPoint | null {
  const s = sideStretch(board, outline, side);
  if (!s) return null;
  const k = side.across === 'width' ? 0 : 1;
  for (const i of stretchIndices(outline.chords.length, s)) {
    const c = outline.chords[i]!;
    const xa = c.a[k]!, xb = c.b[k]!;
    if (xa === xb || (x - xa) * (x - xb) > 0) continue;
    const t = (x - xa) / (xb - xa);
    return { chord: i, t, at: t === 0 ? c.a : t === 1 ? c.b : [c.a[0] + t * (c.b[0] - c.a[0]), c.a[1] + t * (c.b[1] - c.a[1])] };
  }
  return null;
}

/**
 * Q13's end-chord zone: how close a station may come to the next CONVEX path vertex inward — the end of its chord for the
 * run's first end (`first`), the start for its last — before the offset at `reach` swallows its end piece: reach·tan(φ/2), φ
 * the turn there (0 at a straight or concave vertex: nothing to swallow). Only the BUILT station and the skeleton's judgement
 * read it; no fault does.
 */
export function stopZone(outline: FaceOutline, sp: StationPoint, first: boolean, reach: number): number {
  const n = outline.chords.length;
  const dir = (i: number): P2 => { const c = outline.chords[i]!; const l = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]); return [(c.b[0] - c.a[0]) / l, (c.b[1] - c.a[1]) / l]; };
  const [a, b] = first ? [dir(sp.chord), dir((sp.chord + 1) % n)] : [dir((sp.chord - 1 + n) % n), dir(sp.chord)];
  const turn = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);   // > 0: convex (a left turn)
  return turn > 0 ? reach * Math.tan(turn / 2) : 0;
}

/** Plan-CCW enters each rectangle edge (SIDES order) at: the front and the length max end at min, the others at max. */
const ENTERS: readonly CutFrom[] = ['min', 'min', 'max', 'max'];
const other = (f: CutFrom): CutFrom => (f === 'min' ? 'max' : 'min');
/**
 * Q17: a run's `through` ends name where travel ENTERS Start's side (Start) or LEAVES Stop's side (Stop). A one-side run is
 * consistent by construction: its canonical order (P11, `canonicalRun`) puts a `through` end where travel enters or leaves,
 * and every reader walks it in that order (a mirrored-then-edited copy may sit reversed in memory, fu 392(5)), so it is
 * judged true here without the board. A two-side run is never re-ordered (Q16): judged in plan order.
 */
export function throughConsistent(p: ProfileCut): boolean {
  const run = p.run;
  if ('loop' in run || oneSide(run)) return true;   // End to end is one-side
  const { start, end } = run as { start: ProfileEnd; end: ProfileEnd };
  const [ps, pe] = p.face === 'max' ? [start, end] : [end, start];
  const ok = (e: ProfileEnd, first: boolean) => !('through' in e) || e.through === (first ? ENTERS[edgeOfSide(e.side)]! : other(ENTERS[edgeOfSide(e.side)]!));
  return ok(ps, true) && ok(pe, false);
}

/**
 * The b2 path (B2, B3, Q11–Q17): a run that is neither a loop nor End to end — a station run on one side, or a run whose ends
 * lie on two sides — in PLAN order (the caller reverses it for face min). Each station sits on the model chords (Q11; on a
 * vertex, the run-side chord); under `build` or `snap` one inside its end-chord zone moves to the next vertex inward when
 * that vertex lies strictly inside the walk (Q13: the run shortened, never lengthened). A `through` end at a corner treats it as End to end does (B1, B1a widened by Q18).
 * Null when an end cannot be placed (a station off its stretch, a stretch that cannot be traced, an inconsistent through end),
 * the two ends are one point (Q16), a two-side walk would come back onto a side it left (Q16 as ruled, m3: at most two whole
 * sides between Start's and Stop's, touching four), its two stations are CROSSED on the corner arc its two sides share
 * (the b2 final review's I1: the walk never leaves the arc at Start's head, a hop the sides' order reads as the long way), or —
 * built or judged only — the zone moves both ends onto one vertex (the fault path then exists: Task 3 maps that to
 * too-tight).
 */
function stopRun(board: PathBoard, outline: FaceOutline, p: ProfileCut, opts?: Opts): ProfilePath | null {
  if ('loop' in p.run) return null;
  // A one-side run is walked in its CANONICAL order (P11): a copy mirrored along the run dimension and then edited can sit
  // reversed in memory until the next load (fu 392(5)); walked as stored it would wrap round the whole outline. A two-side
  // run is never re-ordered (Q16).
  if (oneSide(p.run)) p = { ...p, run: canonicalRun(board, p.face, p.run) };
  if (!throughConsistent(p)) return null;
  const run = p.run as { start: ProfileEnd; end: ProfileEnd };
  const m = outline.chords.length, reach = reachDepth(p)[0];
  // The plan walk is CCW looking at the max face; a run travels CCW looking at ITS face, so for face min the plan walk
  // runs from the stored end to the stored start (profilePath's face-min tail reverses it back).
  const [ps, pe] = p.face === 'max' ? [run.start, run.end] : [run.end, run.start];
  const pt = (i: number, t: number): P2 => { const c = outline.chords[i]!; return t === 0 ? c.a : t === 1 ? c.b : [c.a[0] + t * (c.b[0] - c.a[0]), c.a[1] + t * (c.b[1] - c.a[1])]; };
  type Pos = { chord: number; t: number };
  // The typed station (Q11: on a vertex, the run-side chord).
  const station = (e: Extract<ProfileEnd, { at: number }>, first: boolean): Pos | null => {
    const sp = stationPoint(board, outline, e.side, endPos(board, e));
    if (!sp) return null;
    if (first && sp.t === 1) return { chord: (sp.chord + 1) % m, t: 0 };
    if (!first && sp.t === 0) return { chord: (sp.chord - 1 + m) % m, t: 1 };
    return { chord: sp.chord, t: sp.t };
  };
  const s0 = 'through' in ps ? sideStretch(board, outline, ps.side) : null;
  const s1 = 'through' in pe ? sideStretch(board, outline, pe.side) : null;
  if (('through' in ps && !s0) || ('through' in pe && !s1)) return null;
  let a = 'through' in ps ? { chord: s0!.from, t: 0 } : station(ps, true);
  let b = 'through' in pe ? { chord: s1!.to, t: 1 } : station(pe, false);
  if (!a || !b) return null;
  if (Math.hypot(pt(a.chord, a.t)[0] - pt(b.chord, b.t)[0], pt(a.chord, a.t)[1] - pt(b.chord, b.t)[1]) <= EPS) return null;   // Q16: the two ends one point
  // The chords the walk passes from a to b (a run within one chord forward: 0; one wrapping round to its own chord: m).
  const walk = (x: Pos, y: Pos) => (x.chord === y.chord ? (x.t < y.t ? 0 : m) : (y.chord - x.chord + m) % m);
  // Q16 made a rule (the b2 Task 2 review, M-d; m3): a two-side run passes at most two whole sides between Start's and Stop's
  // (touching four), so its walk never comes back onto the side it left — Start's side ahead of it, or (read backwards) Stop's
  // side behind it, so the rule is the same on either face. A Start after its Stop on a shared corner arc would otherwise wrap all four sides: stop-off.
  if (!oneSide(run)) {
    const walked: number[] = [];
    for (let i = a.chord, k = 0; k <= walk(a, b); i = (i + 1) % m, k += 1) walked.push(i);
    const reenters = (side: ProfileSide, order: number[]) => {
      const t = sideStretch(board, outline, side);
      if (!t) return false;
      const on = new Set(stretchIndices(m, t));
      let left = false;
      for (const i of order) { if (!on.has(i)) left = true; else if (left) return true; }
      return false;
    };
    if (reenters(ps.side, walked) || reenters(pe.side, walked.slice().reverse())) return null;
    // CROSSED stations (the b2 final review's I1, the controller's ruling): in plan order, the two sides' stretches share
    // the corner arc where travel ENTERS Start's side (Start's stretch's FIRST chord lies in Stop's stretch, so the arc is
    // Start's head and Stop's tail) and the walk from Start to Stop never leaves that shared arc. Q16's travel from Start's
    // side to Stop's then passes no whole side, yet the sides' order says it goes the long way round (stopWords names two
    // sides between): the path would be a hop on the arc. No path: stop-off. The uncrossed short run on an arc (Stop's side
    // NEXT after Start's, the arc Start's tail) and a run with only one end on the arc (review M1) are not this rule's.
    const sS = sideStretch(board, outline, ps.side), sT = sideStretch(board, outline, pe.side);
    if (sS && sT) {
      const onS = new Set(stretchIndices(m, sS)), onT = new Set(stretchIndices(m, sT));
      if (onT.has(sS.from) && walked.every((i) => onS.has(i) && onT.has(i))) return null;
    }
  }
  // Q13 (build and the skeleton's judgement only): a station inside its end-chord zone is built at the next vertex inward,
  // and only at a vertex strictly INSIDE the walk (the b2 Task 2 review, I2): a run within one chord passes no vertex, so it
  // keeps its typed ends (the band there has nothing to swallow). The two ends moved onto one vertex leave no path.
  if ((opts?.build || opts?.snap) && walk(a, b) >= 1) {
    const zoned = (x: Pos, first: boolean) => {
      const c = outline.chords[x.chord]!, l = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]);
      return (first ? 1 - x.t : x.t) * l < stopZone(outline, { ...x, at: pt(x.chord, x.t) }, first, reach);
    };
    const a1 = !('through' in ps) && zoned(a, true) ? { chord: (a.chord + 1) % m, t: 0 } : a;
    const b1 = !('through' in pe) && zoned(b, false) ? { chord: (b.chord - 1 + m) % m, t: 1 } : b;
    a = a1; b = b1;
    if (Math.hypot(pt(a.chord, a.t)[0] - pt(b.chord, b.t)[0], pt(a.chord, a.t)[1] - pt(b.chord, b.t)[1]) <= EPS) return null;
  }
  const piece = (i: number, t0: number, t1: number): Piece => ({ chord: { ...outline.chords[i]!, a: pt(i, t0), b: pt(i, t1) }, index: i, t0, t1 });
  let pieces: Piece[] = [];
  if (a.chord === b.chord && a.t < b.t) pieces = [piece(a.chord, a.t, b.t)];
  else {
    pieces.push(piece(a.chord, a.t, 1));
    for (let i = (a.chord + 1) % m; i !== b.chord; i = (i + 1) % m) pieces.push(piece(i, 0, 1));
    pieces.push(piece(b.chord, 0, b.t));
  }
  const first0 = pieces[0]!.chord, last0 = pieces[pieces.length - 1]!.chord;
  // Q12: a stop's frame is its MODEL chord (the outline chord the station lies on), never the true arc's tangent.
  const stopEnd = (index: number, at: P2, first: boolean, side: ProfileSide): PathEnd => {
    const c = outline.chords[index]!;
    const d: P2 = [c.b[0] - c.a[0], c.b[1] - c.a[1]], l = Math.hypot(d[0], d[1]);
    const u: P2 = [d[0] / l, d[1] / l];
    return { kind: 'stop', at, tangent: first ? [-u[0] + 0, -u[1] + 0] : [u[0] + 0, u[1] + 0], normal: [-u[1] + 0, u[0] + 0], side: { ...side } };
  };
  let e0: PathEnd, e1: PathEnd;
  if ('through' in ps) {
    const r = openStart(board, outline, p, s0!, edgeOfSide(ps.side), pieces, first0, reach, opts);
    if (!r) return null;
    pieces = r.pieces; e0 = r.end;
  } else e0 = stopEnd(a.chord, first0.a, true, ps.side);
  if ('through' in pe) {
    const r = openEnd(board, outline, p, s1!, edgeOfSide(pe.side), pieces, last0, reach, opts);
    if (!r) return null;
    pieces = r.pieces; e1 = r.end;
  } else e1 = stopEnd(b.chord, last0.b, false, pe.side);
  if (pieces.length === 0) return null;
  return { chords: pieces.map((x) => x.chord), loop: false, ends: [e0, e1], cover: pieces.map((x) => ({ chord: x.index, t0: x.t0, t1: x.t1 })) };
}

/** The path the swept construction BUILDS (fix round 2): `profilePath` with each B1 station's extension (stationExtension)
 *  and each b2 stop's end-chord zone (Q13). Faults, overlap and the hole reach read `profilePath` — neither decides anything. */
export function builtPath(board: PathBoard, p: ProfileCut, opts?: Opts): ProfilePath | null {
  return profilePath(board, p, { ...opts, build: true });
}
/** The path the skeleton's too-tight judgement reads (Q13): each b2 stop's end-chord zone, never B1's ε. */
export function judgedPath(board: PathBoard, p: ProfileCut, opts?: Opts): ProfilePath | null {
  return profilePath(board, p, { ...opts, snap: true });
}

/**
 * A run's path (spec §3.3 *(B)*) in the face's frame: CCW as seen from outside `p.face` — the plan outline as is for face
 * max, reversed (chords in reverse order, each with a and b swapped, the two ends swapped) for face min. A loop is every
 * chord. An End to end run (both ends `through`, one side) is its side's stretch with its two ends: `through` at a sharp
 * corner; at a corner arc, `mitre` at the arc's midpoint when the adjacent side holds a profile on the same face whose
 * through end takes that arc (B1a, Q18; `board.profiles`, stored presence), else `station` at the far tangent point (B1).
 * Any other run (b2: a station run, or ends on two sides) is `stopRun`'s. Null when the outline or the stretch cannot be
 * traced, or an end face does not run into the wood. `opts.build`: B1's ε and Q13's zone (`builtPath`); `opts.snap`: the
 * zone only (`judgedPath`).
 */
export function profilePath(board: PathBoard, p: ProfileCut, opts?: Opts): ProfilePath | null {
  // Memoised per (part object, profile object, opts) — b2 Task 3, Step 5b: Q9's isSwept and the faults' phase 1 and 2 ask
  // for the same paths many times per judgement. Parts and profiles are never mutated (inv 1); a trial part is a new object.
  const key = `${opts?.build ? 'b' : ''}${opts?.snap ? 's' : ''}${opts?.presence ? 'p' : ''}`;
  let byProfile = pathMemo.get(board);
  if (!byProfile) { byProfile = new WeakMap(); pathMemo.set(board, byProfile); }
  let byOpts = byProfile.get(p);
  if (!byOpts) { byOpts = new Map(); byProfile.set(p, byOpts); }
  let byKeep = byOpts.get(key);
  if (!byKeep) { byKeep = new Map(); byOpts.set(key, byKeep); }
  const keep = opts?.presence ? undefined : opts?.keep;
  let byWithout = byKeep.get(keep);
  if (!byWithout) { byWithout = new Map(); byKeep.set(keep, byWithout); }
  if (byWithout.has(opts?.without)) return byWithout.get(opts?.without)!;
  const path = computePath(board, p, opts);
  byWithout.set(opts?.without, path);
  return path;
}
const pathMemo = new WeakMap<object, WeakMap<ProfileCut, Map<string, Map<ProfileCut | undefined, Map<ReadonlySet<ProfileCut> | undefined, ProfilePath | null>>>>>();
function computePath(board: PathBoard, p: ProfileCut, opts?: Opts): ProfilePath | null {
  const outline = faceOutline(board);
  if (!outline) return null;
  const m = outline.chords.length;
  let path: ProfilePath;
  if ('loop' in p.run) path = { chords: outline.chords, loop: true, cover: outline.chords.map((_, i) => ({ chord: i, t0: 0, t1: 1 })) };
  else if (endToEnd(p.run)) {
    const s = sideStretch(board, outline, p.run.start.side);
    if (!s) return null;
    const E = edgeOfSide(p.run.start.side);
    let pieces: Piece[] = stretchIndices(m, s).map((i) => ({ chord: outline.chords[i]!, index: i, t0: 0, t1: 1 }));
    const first0 = pieces[0]!.chord, last0 = pieces[pieces.length - 1]!.chord;
    const reach = reachDepth(p)[0];
    // Each end decided on the UNTRIMMED stretch; the mitre trims are applied after, start then end.
    const r0 = openStart(board, outline, p, s, E, pieces, first0, reach, opts);
    if (!r0) return null;
    pieces = r0.pieces;
    const r1 = openEnd(board, outline, p, s, E, pieces, last0, reach, opts);
    if (!r1) return null;
    pieces = r1.pieces;
    path = { chords: pieces.map((x) => x.chord), loop: false, ends: [r0.end, r1.end], cover: pieces.map((x) => ({ chord: x.index, t0: x.t0, t1: x.t1 })) };
  } else {
    const built = stopRun(board, outline, p, opts);
    if (!built) return null;
    path = built;
  }
  if (p.face === 'min') {
    path = {
      chords: path.chords.slice().reverse().map((c) => ({ ...c, a: c.b, b: c.a })),
      loop: path.loop,
      ...(path.ends ? { ends: [path.ends[1], path.ends[0]] as [PathEnd, PathEnd] } : {}),
      cover: path.cover,
    };
  }
  return deepFreeze(path);
}

/**
 * Q2 + Q9: a profile is SWEPT (built by the kept-wood construction, §4.2) when it is a loop; an End to end run whose side's
 * stretch is not that side's single straight chord; a run with ends on two sides; or a one-side STATION run whose path (the
 * fault path: no ε, no zone) is not exactly one chord free of any curve. A one-side station run with no path (a station off
 * its stretch, an untraceable outline) and an End to end run whose outline or stretch cannot be traced stay straight (a1/a2's
 * builders, byte for byte); a loop or a two-side run is swept regardless (its faults then say why it builds nothing). Call it
 * on the STORED part (its curves included).
 */
export function isSwept(board: PathBoard, p: ProfileCut): boolean {
  if ('loop' in p.run) return true;
  if (!oneSide(p.run)) return true;
  const outline = faceOutline(board);
  if (!outline) return false;
  if (endToEnd(p.run)) {
    const s = sideStretch(board, outline, p.run.start.side);
    if (!s) return false;
    return !(s.from === s.to && outline.chords[s.from]!.curve === undefined);
  }
  // Read by stored presence (B1a's mitre only ever trims a corner arc, never decides swept-ness), so the shape predicate
  // never depends on a fallback (Q10 decides those from it).
  const path = profilePath(board, p, PRESENCE);
  if (!path) return false;
  return !(path.cover.length === 1 && outline.chords[path.cover[0]!.chord]!.curve === undefined);
}
