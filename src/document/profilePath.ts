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
import type { Board, Dimension, ProfileCut, ProfileSide } from './types';

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
 *  and the wood lies on its plan right. Take the inward side from the face, never from the plan left normal alone. */
export interface ProfilePath { chords: OutlineChord[]; loop: boolean; ends?: [PathEnd, PathEnd] }
/**
 * How an open path ends. `through`: at a sharp corner, out through the end face; `ray` runs along that end face INTO the
 * part, scaled so the path's end vertex moves 1 per unit of offset into the wood (the skeleton's end-vertex velocity).
 * `station`: at the far tangent point `at` of a corner arc on the adjacent side `side` (B1); `tangent` is the unit
 * direction along that side AWAY from the run, where a2's run-out lies.
 */
export type PathEnd = { kind: 'through'; ray: P2 } | { kind: 'station'; at: P2; tangent: P2; side: ProfileSide };

const EPS = 1e-9;

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

/** The chords of [from, to], inclusive, wrapping. */
function stretchChords(outline: FaceOutline, s: Stretch): OutlineChord[] {
  const n = outline.chords.length;
  const out: OutlineChord[] = [];
  for (let i = s.from; ; i = (i + 1) % n) { out.push(outline.chords[i]!); if (i === s.to) break; }
  return out;
}

/**
 * A through end's ray (the probe's `endRays`): the unit direction of the END FACE — the outline chord adjacent to the path's
 * end vertex, pointing away from that vertex (`from` → `to`) — scaled by 1 / (n·u), n the plan left normal (inward on the
 * CCW plan outline) of the path's end chord `pathChord`, so the end vertex moves 1 per unit of offset into the wood.
 */
function throughRay(from: P2, to: P2, pathChord: OutlineChord): P2 {
  const e: P2 = [to[0] - from[0], to[1] - from[1]];
  const le = Math.hypot(e[0], e[1]);
  const u: P2 = [e[0] / le, e[1] / le];
  const d: P2 = [pathChord.b[0] - pathChord.a[0], pathChord.b[1] - pathChord.a[1]];
  const l = Math.hypot(d[0], d[1]);
  const dot = (-d[1] / l) * u[0] + (d[0] / l) * u[1];
  if (!(dot > EPS)) throw new Error('profilePath: the end face does not run into the wood');
  const k = 1 / dot;
  return [u[0] * k + 0, u[1] * k + 0];
}

/**
 * A run's path (spec §3.3 *(B)*) in the face's frame: CCW as seen from outside `p.face` — the plan outline as is for face
 * max, reversed (chords in reverse order, each with a and b swapped, the two ends swapped) for face min. A loop is every
 * chord. An End to end run (both ends `through`, one side) is its side's stretch with its two ends. Null when the outline
 * or the stretch cannot be traced, and for a run b1 builds no path for: a STATION run (a2's construction, Q2) or ends on
 * two sides (b2).
 */
export function profilePath(board: Pick<Board, Dimension | 'curves'>, p: ProfileCut): ProfilePath | null {
  const outline = faceOutline(board);
  if (!outline) return null;
  let path: ProfilePath;
  if ('loop' in p.run) path = { chords: outline.chords, loop: true };
  else {
    const { start, end } = p.run;
    if (!('through' in start) || !('through' in end) || !sameSide(start.side, end.side)) return null;
    const s = sideStretch(board, outline, start.side);
    if (!s) return null;
    const E = edgeOfSide(start.side);
    const chords = stretchChords(outline, s);
    const first = chords[0]!, last = chords[chords.length - 1]!;
    const m = outline.chords.length;
    const prior = outline.chords[(s.from - 1 + m) % m]!, next = outline.chords[(s.to + 1) % m]!;
    const e0: PathEnd = s.startEnd === 'sharp'
      ? { kind: 'through', ray: throughRay(prior.b, prior.a, first) }
      : { kind: 'station', at: first.a, tangent: INWARD[E]!, side: { ...SIDES[prevEdge(E)]! } };
    const e1: PathEnd = s.endEnd === 'sharp'
      ? { kind: 'through', ray: throughRay(next.a, next.b, last) }
      : { kind: 'station', at: last.b, tangent: INWARD[E]!, side: { ...SIDES[nextEdge(E)]! } };
    path = { chords, loop: false, ends: [e0, e1] };
  }
  if (p.face === 'min') {
    path = {
      chords: path.chords.slice().reverse().map((c) => ({ ...c, a: c.b, b: c.a })),
      loop: path.loop,
      ...(path.ends ? { ends: [path.ends[1], path.ends[0]] as [PathEnd, PathEnd] } : {}),
    };
  }
  return deepFreeze(path);
}

/**
 * Q2: a profile is SWEPT (built by the kept-wood construction, §4.2) when it is a loop, or an End to end run whose side's
 * stretch is not that side's single straight chord. A station run is a2's construction on any side in b1. An End to end
 * run whose outline or stretch cannot be traced stays straight (a1's builder, byte for byte); a loop is swept regardless
 * (its faults then say why it builds nothing). Call it on the STORED part (its curves included).
 */
export function isSwept(board: Pick<Board, Dimension | 'curves'>, p: ProfileCut): boolean {
  if ('loop' in p.run) return true;
  const { start, end } = p.run;
  if (!('through' in start) || !('through' in end) || !sameSide(start.side, end.side)) return false;
  const outline = faceOutline(board);
  if (!outline) return false;
  const s = sideStretch(board, outline, start.side);
  if (!s) return false;
  return !(s.from === s.to && outline.chords[s.from]!.curve === undefined);
}
