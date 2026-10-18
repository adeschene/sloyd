/**
 * A swept profile's PLAN chain and its truncated straight skeleton (profile runs spec §4.2, Q3; chunk b1). A leaf below
 * `profiles.ts` and `sweep.ts` (imports `curves` and `profilePath` only), so the fault decider can ask whether the
 * skeleton exists (an end segment the offset swallows is `too-tight`, never a throw) without an import cycle.
 *
 * Everything here is in PLAN coordinates, (u, v) = (length, width), the chain CCW looking at the max face, wood on its LEFT,
 * whichever face the profile is on: `profilePath` reverses a face-min path into the face's own frame, and `planChain`
 * undoes that (its rays were computed on the plan-CCW chords, so they carry over unchanged). Only the section's depth
 * depends on the face (sweep.ts).
 */
import { type P2 } from './curves';
import { faceOutline, type OutlineChord, type PathEnd, type ProfilePath } from './profilePath';
import type { Board, CutFrom, Dimension, ProfileSide } from './types';

const EPS = 1e-9;
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: P2, b: P2): P2 => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P2, k: number): P2 => [a[0] * k, a[1] * k];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const cr = (a: P2, b: P2) => a[0] * b[1] - a[1] * b[0];
const len = (a: P2) => Math.hypot(a[0], a[1]);
/** The plan left normal of direction a → b (inward on the CCW plan outline), unit. */
export function leftNormal(a: P2, b: P2): P2 {
  const d = sub(b, a);
  const l = len(d);
  return [-d[1] / l, d[0] / l];
}

/** A station end's half-plane (B1): the band ends on the plane across the path at `at`; kept where n·x + d >= 0.
 *  `stop` (b2, Q12): a user's Start or Stop — the plane is across the station's own MODEL chord (`tangent` along it away from
 *  the run), `N` that chord's plan inward normal, `end` the path's face-frame end it is (0 → 'lo', 1 → 'hi'). */
export interface StationClip { n: P2; d: number; at: P2; tangent: P2; side: ProfileSide; stop?: { N: P2; end: 'lo' | 'hi' } }

/**
 * A swept profile's path in plan-CCW order (wood on the left), with the vertex velocities the skeleton starts from at an
 * open path's two ends and the half-planes of its station ends.
 * - `chords[i]`: plan chord i; its ends are read off the face outline at the path's cover (`ProfilePath.cover`: chord index,
 *   [t0, t1]), so every vertex lies ON the outline polygon — a mitre end splitting a chord ends at the split's point on the
 *   chord, which is `at` itself whenever `at` is a chord vertex (B1a).
 * - `index[i]`: the index of plan chord i in `profilePath`'s own (face-frame) order — i for face max, n − 1 − i for face min.
 *   THE `sweep` tag a swept face carries.
 * - `rays` (open only): the start and end vertex velocities. A through end's is the path's `ray`. A mitre end's runs along
 *   the radial line through the end vertex into the wood (toward the arc's centre when convex, away when concave) scaled by
 *   1/(n·u), n the end chord's inward normal — `PathEnd.ray` exactly when the end vertex is `at`. A station end's is the
 *   bisector of the end chord and the path's tangent continued past the tangent point (the adjacent side, along `tangent`):
 *   the probe's front-stations chain, without the extension's own face (it is clipped away at the station).
 *   A stop's (b2) is its model chord's inward normal: the band ends square to that chord (Q12).
 * - `stations`: one half-plane per station or stop end, n = −tangent through `at` (the band stops on the plane across the
 *   path); a stop's carries `stop`.
 */
export interface PlanChain {
  chords: OutlineChord[];
  loop: boolean;
  index: number[];
  rays?: [P2, P2];
  stations: StationClip[];
  ends?: [PathEnd, PathEnd];
}

/** The outline point at parameter t of chord k: exactly a at 0 and b at 1. */
function at(c: OutlineChord, t: number): P2 {
  if (t === 0) return c.a;
  if (t === 1) return c.b;
  return [c.a[0] + t * (c.b[0] - c.a[0]), c.a[1] + t * (c.b[1] - c.a[1])];
}

/** `u` scaled by 1 / (n·u), n the chord's inward normal; null when u does not run into the wood. */
function scaled(u: P2, a: P2, b: P2): P2 | null {
  const n = leftNormal(a, b);
  const k = dot(n, u);
  if (!(k > EPS)) return null;
  return [u[0] / k + 0, u[1] / k + 0];
}
/** The skeleton's vertex velocity between two consecutive directions (the probe's `bis`): offsets both lines by 1. */
function bisector(na: P2, nb: P2): P2 {
  return mul(add(na, nb), 1 / (1 + dot(na, nb)));
}

/**
 * The plan chain of a swept profile's path (above). Null when the path does not lie on the board's face outline (never for
 * a path `profilePath` built) or an end's ray does not run into the wood.
 */
export function planChain(board: Pick<Board, Dimension | 'curves'>, path: ProfilePath, face: CutFrom): PlanChain | null {
  const outline = faceOutline(board);
  if (!outline) return null;
  const n = path.cover.length;
  if (n === 0) return null;
  const chords: OutlineChord[] = path.cover.map((c) => {
    const o = outline.chords[c.chord]!;
    return { ...o, a: at(o, c.t0), b: at(o, c.t1) };
  });
  const index = chords.map((_, i) => (face === 'max' ? i : n - 1 - i));
  if (path.loop) return { chords, loop: true, index, stations: [] };
  const ends = path.ends!;
  const [e0, e1] = face === 'max' ? ends : [ends[1], ends[0]];
  const stations: StationClip[] = [];
  const first = chords[0]!, last = chords[n - 1]!;
  const ray = (e: PathEnd, start: boolean): P2 | null => {
    const P = start ? first.a : last.b;
    const ch = start ? first : last;
    if (e.kind === 'through') return e.ray;
    if (e.kind === 'mitre') {
      const arc = (start ? path.cover[0] : path.cover[n - 1])!;
      const src = outline.chords[arc.chord]!;
      if (!src.arc) return e.ray;
      const { c, concave } = src.arc;
      const r = len(sub(P, c));
      const u: P2 = concave ? [(P[0] - c[0]) / r, (P[1] - c[1]) / r] : [(c[0] - P[0]) / r, (c[1] - P[1]) / r];
      return scaled(u, ch.a, ch.b);
    }
    if (e.kind === 'stop') {
      // b2: the band ends square to the stop's own chord (Q12): the ray is that chord's inward normal, the clip the plane
      // across it. Recomputed from the MODEL chord the cover names (the trimmed plan chord's direction, without its
      // rounding; the same vector as PathEnd's), so face min (ends swapped above) needs nothing more.
      const src = outline.chords[(start ? path.cover[0] : path.cover[n - 1])!.chord]!;
      const u = sub(src.b, src.a), l = len(u);
      const t: P2 = start ? [-u[0] / l + 0, -u[1] / l + 0] : [u[0] / l + 0, u[1] / l + 0];
      const N0 = leftNormal(src.a, src.b), N: P2 = [N0[0] + 0, N0[1] + 0];
      const end: 'lo' | 'hi' = (face === 'max') === start ? 'lo' : 'hi';   // the path's face-frame end 0 / end 1
      stations.push({ n: [-t[0] + 0, -t[1] + 0], d: dot(t, P), at: P, tangent: t, side: e.side, stop: { N, end } });
      return N;
    }
    // A station: the adjacent side continues along `tangent` away from the run.
    stations.push({ n: [-e.tangent[0] + 0, -e.tangent[1] + 0], d: dot(e.tangent, e.at), at: e.at, tangent: e.tangent, side: e.side });
    const nc = leftNormal(ch.a, ch.b);
    // The extension's direction of travel: into `at` at the start, out of it at the end; its inward normal.
    const d: P2 = start ? [-e.tangent[0], -e.tangent[1]] : e.tangent;
    const ne: P2 = [-d[1], d[0]];
    return start ? bisector(ne, nc) : bisector(nc, ne);
  };
  const r0 = ray(e0, true), r1 = ray(e1, false);
  if (!r0 || !r1) return null;
  return { chords, loop: false, index, rays: [r0, r1], stations, ends: [e0, e1] };
}

/** Drop duplicates, collinear vertices and spikes (a 180° turn) until none is left (the probe's `tidy`). */
export function tidy(poly: readonly P2[]): P2[] {
  const p = poly.slice();
  let changed = true;
  while (changed && p.length > 3) {
    changed = false;
    for (let i = 0; i < p.length; i += 1) {
      const a = p[(i - 1 + p.length) % p.length]!, b = p[i]!, c = p[(i + 1) % p.length]!;
      const ab = sub(b, a), bc = sub(c, b);
      if (len(ab) < 1e-12 || Math.abs(cr(ab, bc)) <= 1e-12 * Math.max(1, len(ab) * len(bc))) { p.splice(i, 1); changed = true; break; }
    }
  }
  return p;
}

interface Vx { O: P2; t0: number; v: P2 }
const pos = (x: Vx, t: number): P2 => add(x.O, mul(x.v, t - x.t0));

/** The skeleton of a chain: per chord its face (plan, CCW), the wavefront at `reach`, and how many edge events it took. */
export interface Skeleton { faces: P2[][]; wave: P2[]; events: number }

/**
 * The truncated straight skeleton of a plan-CCW chain (wood on the left) to offset `reach` (the probe's `skeleton`, edge
 * events only): every vertex moves along its bisector (an open chain's two ends along `rays`); a chord whose two vertices
 * meet before `reach` collapses — its face closes there and its neighbours rejoin on their own bisector (the notch's
 * mouth: without it the neighbours' faces overlap, +2.9% of the waste). Each face is chord i's: [a_i, b_i, its right chain
 * up, its left chain down], tidied. The wave is the offset front (an open chain: its start and end vertices included).
 * Null — a fault, never a throw — when an open chain's END chord collapses, or a loop collapses below three chords.
 * `opts.events: false` (TEST ONLY) skips every event: the regression the notch pins.
 */
export function pathSkeleton(chords: readonly { a: P2; b: P2 }[], loop: boolean, reach: number, rays?: [P2, P2], opts?: { events?: boolean }): Skeleton | null {
  const n = chords.length;
  if (n === 0 || (!loop && !rays) || (loop && n < 3)) return null;
  const pts: P2[] = loop ? chords.map((c) => c.a) : [...chords.map((c) => c.a), chords[n - 1]!.b];
  const segA = (i: number) => pts[i]!, segB = (i: number) => pts[(i + 1) % pts.length]!;
  const u = Array.from({ length: n }, (_, i) => { const d = sub(segB(i), segA(i)); const l = len(d); return [d[0] / l, d[1] / l] as P2; });
  const nrm = u.map((d) => [-d[1], d[0]] as P2);
  const bis = (a: number, b: number): P2 => bisector(nrm[a]!, nrm[b]!);
  const active = Array.from({ length: n }, (_, i) => i);
  // Vertex k sits at the START of active[k] (loop: before active[k]; open: k = active.length is the end vertex).
  const vx: Vx[] = [];
  if (loop) for (let i = 0; i < n; i += 1) vx.push({ O: pts[i]!, t0: 0, v: bis((i - 1 + n) % n, i) });
  else {
    vx.push({ O: pts[0]!, t0: 0, v: rays![0] });
    for (let i = 1; i < n; i += 1) vx.push({ O: pts[i]!, t0: 0, v: bis(i - 1, i) });
    vx.push({ O: pts[n]!, t0: 0, v: rays![1] });
  }
  const left: P2[][] = Array.from({ length: n }, (_, i) => [pts[i]!]);
  const right: P2[][] = Array.from({ length: n }, (_, i) => [segB(i)]);
  const done: (P2[] | null)[] = Array(n).fill(null);
  let events = 0;
  const L = (k: number) => vx[k]!;
  const Rv = (k: number) => vx[loop ? (k + 1) % active.length : k + 1]!;
  for (;;) {
    let best = Infinity, bk = -1;
    for (let k = 0; k < active.length; k += 1) {
      const i = active[k]!, a = L(k), b = Rv(k);
      const A = dot(sub(sub(b.O, mul(b.v, b.t0)), sub(a.O, mul(a.v, a.t0))), u[i]!);
      const B = dot(sub(b.v, a.v), u[i]!);
      if (B < -1e-15) { const t = -A / B; if (t < best) { best = t; bk = k; } }
    }
    if (best >= reach || bk === -1 || opts?.events === false) break;
    if (!loop && (bk === 0 || bk === active.length - 1)) return null;   // an end chord swallowed: too tight
    if (loop && active.length <= 3) return null;
    events += 1;
    const i = active[bk]!;
    const E = pos(L(bk), best);
    left[i]!.push(E); right[i]!.push(E);
    done[i] = [...right[i]!, ...left[i]!.slice().reverse()];
    const kp = loop ? (bk - 1 + active.length) % active.length : bk - 1;
    const a = active[kp]!, b = active[(bk + 1) % active.length]!;
    right[a]!.push(E); left[b]!.push(E);
    // Vertices bk and bk+1 (the start of i and the start of b) become one new vertex at the start of b.
    const nv: Vx = { O: E, t0: best, v: bis(a, b) };
    const kb = loop ? (bk + 1) % active.length : bk + 1;
    vx[kb] = nv;
    vx.splice(bk, 1);
    active.splice(bk, 1);
  }
  const wave: P2[] = [];
  for (let k = 0; k < active.length; k += 1) {
    const i = active[k]!;
    const p = pos(L(k), reach), q = pos(Rv(k), reach);
    left[i]!.push(p); right[i]!.push(q);
    done[i] = [...right[i]!, ...left[i]!.slice().reverse()];
    wave.push(p);
    if (!loop && k === active.length - 1) wave.push(q);
  }
  // Each face: [a_i, ...right chain up from b_i..., ...left chain down to a_i...], tidied.
  const faces = done.map((f, i) => tidy([pts[i]!, ...f!]));
  return { faces, wave, events };
}
