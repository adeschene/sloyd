import { describe, expect, it } from 'vitest';
import { boardBodies, bodyVolume, type Body } from './bodies';
import { faceOutline, profilePath, type PathEnd } from './profilePath';
import { geometryBoard, mirrorProfile, profileFaults } from './profiles';
import { profileSection, runoutPieces, stopAxis, stopRunoutPieces } from './runout';
import { inPolygonClosed, mirrorCurveCut, twiceArea, type P2, type ViewCurve } from './curves';
import { mirrorPart } from './frames';
import { oneSideCurve, sweptStops } from './sweep';
import {
  bowFront, chiralTwoSide, frontAndEnds, stopOnArch, stopOnCorner, stopOnNotch, stopped, topCorners, twoSideSharp, zoneStop,
} from './sweepFixtures';
import type { Board, ProfileCut, ProfileSide } from './types';

/*
 * Profile runs b2, Task 4: a stop's run-out on a curve (spec §4.2 (b2), Q12) and the bodies that subtract it.
 *
 * THE INDEPENDENT ORACLE (`stopOracle`, ported from the b2 probe's `oracle`, probe.ts.txt): wood is inside the face outline and
 * deeper than tau(d), d the plan distance to the TYPED path's chords (`profilePath`, no ε, no zone); beyond a stop (past the
 * plane across its chord) d is the distance to the bit's axis less the bit's bearing radius. The bit's axis is derived HERE,
 * by hand (the Task 1 review's carried item): the stop's model chord read off the face outline, its unit normal computed
 * from the chord, its outward sign chosen by a point-in-outline test, and the bearing radius a literal 1/4" (P9/R9) — never
 * `BEARING`, `leftNormal`, `PathEnd.normal`, `StopFrame` or `stopAxis`, so a sign or a BEARING error in the construction fails
 * it. Past a B1 station (the far tangent point) it is a2's axis, 1/4" outside the side. tau is read off the profile's own
 * (s, t) section (`profileSection`, a2's, as b1's oracle reads it). The oracle never reads `sweptStops` or any piece.
 */
type V3 = [number, number, number];
/** Inches: the bit's bearing radius (P9, R9), BY HAND — never runout.ts' BEARING. */
const BIT = 0.25;
const W_MIN: ProfileSide = { across: 'width', from: 'min' };

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const distSeg = (q: P2, a: P2, b: P2) => { const d = sub(b, a); const t = Math.max(0, Math.min(1, dot(sub(q, a), d) / dot(d, d))); return len(sub(q, [a[0] + t * d[0], a[1] + t * d[1]])); };
const sideOut = (s: ProfileSide): P2 => (s.across === 'length' ? [s.from === 'min' ? -1 : 1, 0] : [0, s.from === 'min' ? -1 : 1]);
const rng = (seed: number) => { let r = seed; return () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; }; };

/** A stop's frame BY HAND: the point, the direction beyond it (away from the run), the outward chord normal, the bit's axis. */
interface HandStop { at: P2; F: P2; out: P2; axis: P2; chord: number }
function handStops(board: Board, p: ProfileCut): { stops: HandStop[]; stations: HandStop[] } {
  const path = profilePath(board, p);
  if (!path || !path.ends) throw new Error('no open path');
  const o = faceOutline(board)!;
  const poly = o.chords.map((c) => c.a);
  // Plan order: the path's ends are in the face's frame (face min: reversed); cover is plan order.
  const [ps, pe]: [PathEnd, PathEnd] = p.face === 'max' ? [path.ends[0], path.ends[1]] : [path.ends[1], path.ends[0]];
  const stops: HandStop[] = [], stations: HandStop[] = [];
  const one = (e: PathEnd, start: boolean) => {
    if (e.kind === 'station') {
      const out = sideOut(e.side);
      stations.push({ at: e.at, F: e.tangent, out, axis: [e.at[0] + BIT * out[0], e.at[1] + BIT * out[1]], chord: -1 });
      return;
    }
    if (e.kind !== 'stop') return;
    const k = (start ? path.cover[0]! : path.cover[path.cover.length - 1]!).chord;
    const c = o.chords[k]!;
    const d = sub(c.b, c.a), l = len(d);
    let n: P2 = [-d[1] / l, d[0] / l];
    const mid: P2 = [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2];
    // Outward: the side of the chord the outline's interior is NOT on.
    if (inPolygonClosed(poly, [mid[0] + 1e-3 * n[0], mid[1] + 1e-3 * n[1]])) n = [-n[0], -n[1]];
    // The plan path runs CCW (wood on its left): travel along the chord is the outward normal turned a quarter clockwise.
    const u: P2 = [-n[1], n[0]];
    if (dot(u, d) <= 0) throw new Error('oracle: the outline is not CCW');
    const F: P2 = start ? [-u[0], -u[1]] : u;
    // The station point: on the chord (the path's own end point, the typed station).
    const at = e.at;
    if (distSeg(at, c.a, c.b) > 1e-12) throw new Error('oracle: the stop is not on its chord');
    stops.push({ at, F, out: n, axis: [at[0] + BIT * n[0], at[1] + BIT * n[1]], chord: k });
  };
  one(ps, true);
  one(pe, false);
  return { stops, stations };
}

interface StopOracle {
  T: number; reach: number; depth: number; outline: P2[]; stops: HandStop[];
  tauAt: (q: P2) => number; near: (q: P2, margin?: number) => boolean; inside: (q: P2) => boolean;
  /** `tauAt` for points within `half` of (cx, cy) (each axis): the same answer, the chords farther than the reach pruned. */
  cellTau: (cx: number, cy: number, half: number) => (q: P2) => number;
  /** tau with every run-out's ρ read as ρ / cos h (h its sectors' half-angle, from CURVE_TOLERANCE by hand): the LEAST waste
   *  a2's inscribed sectors (exact on each ray) can leave between rays. The build lies between this and `tauAt`. */
  tauInscribed: (q: P2) => number;
}
function stopOracle(board: Board, p: ProfileCut): StopOracle {
  const pts = profileSection(board, oneSideCurve(p)).pts;
  const reach = Math.max(...pts.map((q) => q[0]));
  const depth = Math.max(...pts.map((q) => q[1]));
  const tau = (s: number) => {
    if (!(s >= 0 && s <= reach)) return 0;
    let best = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!, lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
      if (s < lo - 1e-15 || s > hi + 1e-15) continue;
      const t = hi - lo < 1e-15 ? Math.max(a[1], b[1]) : a[1] + ((s - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
      if (t > best) best = t;
    }
    return best;
  };
  const path = profilePath(board, p)!;
  const segs = path.chords.map((c) => [c.a, c.b] as [P2, P2]);
  const outline = faceOutline(board)!.chords.map((c) => c.a);
  const { stops, stations } = handStops(board, p);
  const axes = [...stops, ...stations];
  const D = (q: P2, near: readonly [P2, P2][] = segs) => {
    let beyond = Infinity;
    for (const a of axes) if (dot(sub(q, a.at), a.F) > 0) beyond = Math.min(beyond, len(sub(q, a.axis)) - BIT);
    if (beyond !== Infinity) return beyond;
    let d = Infinity;
    for (const [a, b] of near) d = Math.min(d, distSeg(q, a, b));
    return d;
  };
  const tauAt = (q: P2) => { const d = D(q); return d >= 0 && d < reach ? tau(d) : 0; };
  // The sectors over a half turn of radius BIT + reach: the fewest whose chord sagitta is within CURVE_TOLERANCE (0.005"),
  // written here from the tolerance alone, not read from runout.ts (b1's oracle's rule).
  const nSec = Math.min(24, Math.max(2, Math.ceil(Math.PI / (2 * Math.acos(1 - 0.005 / (BIT + reach))) - 1e-9)));
  const stretch = 1 / Math.cos(Math.PI / (2 * nSec));
  const tauInscribed = (q: P2) => {
    let beyond = Infinity;
    for (const a of axes) if (dot(sub(q, a.at), a.F) > 0) beyond = Math.min(beyond, stretch * len(sub(q, a.axis)) - BIT);
    const d = beyond !== Infinity ? beyond : D(q);
    return d >= 0 && d < reach ? tau(d) : 0;
  };
  // A chord farther than reach + the cell's half-diagonal from its centre is farther than the reach from every point in it,
  // so dropping it changes no answer below the reach (tau is 0 at and past it).
  const cellTau = (cx: number, cy: number, half: number) => {
    const near = segs.filter(([a, b]) => distSeg([cx, cy], a, b) <= reach + half * Math.SQRT2 + 1e-9);
    return (q: P2) => { const d = D(q, near); return d >= 0 && d < reach ? tau(d) : 0; };
  };
  const near = (q: P2, margin = 0.05) => segs.some(([a, b]) => distSeg(q, a, b) <= reach + margin) || axes.some((a) => len(sub(q, a.axis)) <= BIT + reach + margin);
  // Point in outline (closed, as inPolygonClosed: within 1e-9 of an edge is inside), the edges bucketed by 1/4" rows.
  const ROW = 0.25, rows = new Map<number, number[]>();
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    for (let r = Math.floor((Math.min(a[1], b[1]) - 1e-6) / ROW); r <= Math.floor((Math.max(a[1], b[1]) + 1e-6) / ROW); r += 1) { const l = rows.get(r) ?? []; l.push(i); rows.set(r, l); }
  });
  const inside = (q: P2) => {
    let c = false;
    for (const i of rows.get(Math.floor(q[1] / ROW)) ?? []) {
      const a = outline[i]!, b = outline[(i + 1) % outline.length]!;
      if (distSeg(q, a, b) <= 1e-9) return true;
      if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < a[0] + ((q[1] - a[1]) / (b[1] - a[1])) * (b[0] - a[0])) c = !c;
    }
    return c;
  };
  return { T: board.thickness, reach, depth, outline, stops, tauAt, near, inside, cellTau, tauInscribed };
}

function inBodiesFn(bodies: readonly Body[]) {
  const bs = bodies.map((b) => ({
    planes: b.faces.map((f) => ({ n: f.n, d: f.n[0] * f.verts[0]![0] + f.n[1] * f.verts[0]![1] + f.n[2] * f.verts[0]![2] })),
    lo: [0, 1, 2].map((k) => Math.min(...b.faces.flatMap((f) => f.verts.map((v) => v[k]!)))),
    hi: [0, 1, 2].map((k) => Math.max(...b.faces.flatMap((f) => f.verts.map((v) => v[k]!)))),
  }));
  return (q: V3) => bs.some((b) => q.every((x, k) => x >= b.lo[k]! - 1e-12 && x <= b.hi[k]! + 1e-12)
    && b.planes.every((h) => h.n[0] * q[0] + h.n[1] * q[1] + h.n[2] * q[2] <= h.d + 1e-12));
}
const totalVolume = (bodies: readonly Body[]) => bodies.reduce((a, b) => a + bodyVolume(b), 0);
/** The oracle's kept volume (the probe's integrator): a jittered 0.004" grid in whole-number 0.256" cells near the path. */
function oracleVolume(board: Board, o: StopOracle, seed: number): number {
  const rand = rng(seed);
  const h = 0.004, C = 0.256, nx = Math.round(C / h);
  let waste = 0;
  for (let cx = 0; cx < board.length; cx += C) for (let cy = 0; cy < board.width; cy += C) {
    if (!o.near([cx + C / 2, cy + C / 2], 0.05 + C)) continue;
    const tauAt = o.cellTau(cx + C / 2, cy + C / 2, C / 2);
    for (let i = 0; i < nx; i += 1) for (let j = 0; j < nx; j += 1) {
      const q: P2 = [cx + (i + rand()) * h, cy + (j + rand()) * h];
      if (o.inside(q)) waste += tauAt(q) * h * h;
    }
  }
  return (twiceArea(o.outline) / 2) * o.T - waste;
}
/** 50,000 points near the path (inside the outline, t in [0, 1.2·depth] from the face): each one the oracle and the bodies
 *  disagree on, with its distance from the nearest typed stop point. */
function mismatches(board: Board, p: ProfileCut, bodies: readonly Body[], o: StopOracle, count = 50000): number[] {
  const inB = inBodiesFn(bodies);
  const rand = rng(7);
  const out: number[] = [];
  let tested = 0;
  while (tested < count) {
    const q: P2 = [rand() * board.length, rand() * board.width];
    if (!o.near(q) || !o.inside(q)) continue;
    const t = rand() * o.depth * 1.2;
    tested += 1;
    const z = p.face === 'max' ? o.T - t : t;
    if ((t > o.tauAt(q)) !== inB([q[0], q[1], z])) out.push(Math.min(...o.stops.map((s) => len(sub(q, s.at)))));
  }
  return out;
}
/** `count` points per stop in its RUN-OUT (beyond the plane across its chord, within BIT + reach + 0.05 of its hand axis):
 *  the region a frame, sign or BEARING error moves, sampled densely (the 50,000 above are mostly in the band, and read 0
 *  strictly, as the probe's). Dense sampling reaches a2's shipped sector-chord sliver, so a point there counts only when it
 *  is NOT in the sliver between the true cutter and the inscribed one (`tauInscribed`). */
function runoutMismatches(p: ProfileCut, bodies: readonly Body[], o: StopOracle, count = 10000): number {
  const inB = inBodiesFn(bodies);
  const rand = rng(11);
  let bad = 0;
  for (const st of o.stops) {
    const R = BIT + o.reach + 0.05;
    let tested = 0;
    while (tested < count) {
      const q: P2 = [st.axis[0] + (2 * rand() - 1) * R, st.axis[1] + (2 * rand() - 1) * R];
      if (dot(sub(q, st.at), st.F) <= 0 || len(sub(q, st.axis)) > R || !o.inside(q)) continue;
      const t = rand() * o.depth * 1.2;
      tested += 1;
      const wood = inB([q[0], q[1], p.face === 'max' ? o.T - t : t]);
      // Allowed: wood the true cutter removes but the inscribed sectors keep (t in (tauInscribed, tauAt]), and nothing else.
      if ((t > o.tauAt(q)) !== wood && !(wood && t > o.tauInscribed(q))) bad += 1;
    }
  }
  return bad;
}
const multiPiece = (p: ProfileCut) => p.kind !== 'roundover';

const CASES: [string, () => Board][] = [
  ['stopOnCorner() — roundover 1/4 stopped on a convex corner arc', () => stopOnCorner()],
  ['stopOnCorner(cove 3/8)', () => stopOnCorner('cove', 0.375)],
  ['stopOnArch — both stops on the concave arch', () => stopOnArch],
  ['stopOnNotch — a stop on the half-round notch', () => stopOnNotch],
  ['bowFront — both stops on a convex bow', () => bowFront],
  ['frontAndEnds() — two sides round the corner arcs', () => frontAndEnds()],
  ['frontAndEnds(cove 3/8)', () => frontAndEnds('cove', 0.375)],
  ['twoSideSharp — two sides round a sharp corner (R6\'s mitre; the distance to two chords meeting convexly IS the mitre)', () => twoSideSharp],
];

describe('the wood of a stop on a turned path matches the independent oracle (R-a)', () => {
  for (const [name, make] of CASES) {
    it(name, () => {
      const board = make();
      const p = board.profiles[0]!;
      expect(profileFaults(board, p)).toEqual([]);
      expect(geometryBoard(board).profiles.length).toBe(1);   // swept (Q9)
      const o = stopOracle(board, p);
      expect(o.stops.length).toBe(2);
      const bodies = boardBodies(board);
      const v = totalVolume(bodies);
      const ov = (oracleVolume(board, o, 1) + oracleVolume(board, o, 99)) / 2;
      const bound = 1e-3 + (multiPiece(p) ? 6e-4 * o.stops.length : 0);
      expect(Math.abs(v - ov), `volume ${v} oracle ${ov}`).toBeLessThanOrEqual(bound);
      const bad = mismatches(board, p, bodies, o);
      expect(bad.length, `misclassified, nearest stop distances ${bad.slice(0, 5).join(' ')}`).toBe(0);
      expect(runoutMismatches(p, bodies, o)).toBe(0);
    }, 120_000);
  }

  it('zoneStop() — a stop inside the end-chord zone (Q13): mismatches only within the typed stop\'s zone', () => {
    const board = zoneStop();
    const p = board.profiles[0]!;
    expect(profileFaults(board, p)).toEqual([]);
    const o = stopOracle(board, p);
    const bodies = boardBodies(board);
    // The built stop moved to the vertex inward: half the zone, 0.125·tan(π/48) along its chord.
    const moved = 0.5 * 0.25 * Math.tan(Math.PI / 48);
    const allow = moved + BIT + o.reach + 1e-9;
    const bad = mismatches(board, p, bodies, o);
    for (const d of bad) expect(d).toBeLessThanOrEqual(allow);
    const v = totalVolume(bodies);
    const ov = (oracleVolume(board, o, 1) + oracleVolume(board, o, 99)) / 2;
    // The run shortened by `moved` at most: the band's area there, A ≤ reach·depth, on top of R-a's bound.
    expect(Math.abs(v - ov)).toBeLessThanOrEqual(1e-3 + moved * o.reach * o.depth);
  }, 120_000);

  it('the oracle can fail: the part WITHOUT its profile is misclassified', () => {
    const board = stopOnCorner();
    const p = board.profiles[0]!;
    const o = stopOracle(board, p);
    const plain = boardBodies({ ...board, profiles: [] });
    expect(mismatches(board, p, plain, o, 5000).length).toBeGreaterThan(100);
  }, 60_000);
});

describe('the bit\'s axis, pinned by hand on a curve chord (the Task 1 review\'s carried item)', () => {
  /** The axis of the stop at run coordinate x on an arc of centre c and radius r divided into n equal chords from angle
   *  phi0 by dphi (signed): the chord holding x, its outward unit normal (convex: away from the centre; concave: toward it),
   *  the point on the chord at x, plus 1/4" outward. */
  const axisOnArc = (c: P2, r: number, phi0: number, dphi: number, n: number, x: number, concave: boolean): { at: P2; axis: P2 } => {
    for (let j = 0; j < n; j += 1) {
      const a: P2 = [c[0] + r * Math.cos(phi0 + j * dphi), c[1] + r * Math.sin(phi0 + j * dphi)];
      const b: P2 = [c[0] + r * Math.cos(phi0 + (j + 1) * dphi), c[1] + r * Math.sin(phi0 + (j + 1) * dphi)];
      if ((x - a[0]) * (x - b[0]) > 0) continue;
      const pm = phi0 + (j + 0.5) * dphi;
      const radial: P2 = [Math.cos(pm), Math.sin(pm)];
      const out: P2 = concave ? [-radial[0], -radial[1]] : radial;
      const t = (x - a[0]) / (b[0] - a[0]);
      const at: P2 = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      // The chord lies at r·cos(dphi/2) from the centre along the radial through its middle.
      expect(Math.abs(dot(sub(at, c), radial) - r * Math.cos(dphi / 2))).toBeLessThanOrEqual(1e-12);
      return { at, axis: [at[0] + BIT * out[0], at[1] + BIT * out[1]] };
    }
    throw new Error('x not on the arc');
  };
  const builtAxes = (board: Board) => sweptStops(geometryBoard(board), geometryBoard(board).profiles[0]!).map((fr) => ({ fr, axis: stopAxis(fr) }));
  const close = (a: P2, b: P2, tol = 1e-12) => len(sub(a, b)) <= tol;

  it('convex: stopOnCorner\'s start on the 2" corner arc (12 chords, centre (2, 2)), x = 1.1', () => {
    const board = stopOnCorner();
    const o = faceOutline(board)!;
    const arc = o.chords.filter((ch) => ch.curve === 'cminmin');
    expect(arc.length).toBe(12);
    for (const ch of arc) expect(Math.abs(len(sub(ch.a, [2, 2])) - 2)).toBeLessThanOrEqual(1e-12);
    // Travelled CCW from (0, 2) to (2, 0): angle π to 3π/2.
    const hand = axisOnArc([2, 2], 2, Math.PI, Math.PI / 24, 12, 1.1, false);
    expect(hand.axis[0]).toBeCloseTo(0.989427, 5);   // the literal: the chord at 17π/48, 1/4" out
    expect(hand.axis[1]).toBeCloseTo(-0.005584, 5);
    const orc = stopOracle(board, board.profiles[0]!);
    const s = orc.stops.find((x) => Math.abs(x.at[0] - 1.1) < 1e-12)!;
    expect(close(s.at, hand.at)).toBe(true);
    expect(close(s.axis, hand.axis)).toBe(true);
    const built = builtAxes(board).find((b) => Math.abs(b.fr.at[0] - 1.1) < 1e-12)!;
    expect(close(built.axis, hand.axis), `${built.axis} vs ${hand.axis}`).toBe(true);
  });

  it('concave: stopOnArch\'s start on the arch (centre (15, 1.25 − R), R = (12² + 1.25²)/2.5), x = 10', () => {
    const board = stopOnArch;
    const o = faceOutline(board)!;
    const arc = o.chords.filter((ch) => ch.curve === 'c1');
    const R = (144 + 1.25 * 1.25) / 2.5, c: P2 = [15, 1.25 - R];
    for (const ch of arc) expect(Math.abs(len(sub(ch.a, c)) - R)).toBeLessThanOrEqual(1e-9);
    const beta = Math.asin(12 / R);
    // Travelled left to right, from (3, 0) at π/2 + β to (27, 0) at π/2 − β.
    const hand = axisOnArc(c, R, Math.PI / 2 + beta, (-2 * beta) / arc.length, arc.length, 10, true);
    expect(hand.axis[1]).toBeLessThan(hand.at[1]);   // outward is toward the centre, below
    const orc = stopOracle(board, board.profiles[0]!);
    const s = orc.stops.find((x) => Math.abs(x.at[0] - 10) < 1e-12)!;
    expect(close(s.at, hand.at, 1e-9)).toBe(true);
    expect(close(s.axis, hand.axis, 1e-9)).toBe(true);
    const built = builtAxes(board).find((b) => Math.abs(b.fr.at[0] - 10) < 1e-12)!;
    expect(close(built.axis, hand.axis, 1e-9), `${built.axis} vs ${hand.axis}`).toBe(true);
  });
});

describe('the sharp corner (twoSideSharp, R6\'s mitre): a closed form', () => {
  /*
   * Ruling needed (the brief's expectation fixed, the code kept): the brief's run-out term 2·π·(BEARING + s̄)·A is Pappus over
   * the WHOLE half turn, θ in [−π/2, π/2]; but beyond a stop the revolved section lies in the wood only where
   * ρ·sin θ >= BEARING (the axis is BEARING outside the edge), so a run-out removes ∫ tau(s)·ρ·acos(BEARING/ρ) ds, ρ = BEARING + s
   * (an arc of ρ·acos(BEARING/ρ) per section strip). Pappus overstates the waste by ~0.021 in³ here; the integral agrees with
   * the bodies to the sector chords' shortfall. The band term A·(L1 + L2 − 2·s̄) (the mitred band's centroid path) is the brief's.
   */
  it('waste = A·(L1 + L2 − 2·s̄) + 2·∫ tau(s)·ρ·acos(1/4 / ρ) ds within 2e-3 in³', () => {
    const board = twoSideSharp;
    const p = board.profiles[0]!;
    expect(profileFaults(board, p)).toEqual([]);
    expect(geometryBoard(board).profiles.length).toBe(1);
    const pts = profileSection(board, oneSideCurve(p)).pts;
    // Area and s-centroid of the (s, t) section polygon.
    let a2 = 0, sx = 0;
    pts.forEach((q, i) => { const r = pts[(i + 1) % pts.length]!; const cr = q[0] * r[1] - r[0] * q[1]; a2 += cr; sx += (q[0] + r[0]) * cr; });
    const A = Math.abs(a2) / 2, sbar = sx / (3 * a2);
    // tau(s): the section's height at s (a roundover's waste is t in [0, tau(s)]), by the polygon's edges.
    const reach = Math.max(...pts.map((q) => q[0]));
    const tau = (s: number) => {
      let best = 0;
      pts.forEach((a, i) => {
        const b = pts[(i + 1) % pts.length]!;
        if (s < Math.min(a[0], b[0]) || s > Math.max(a[0], b[0]) || a[0] === b[0]) return;
        best = Math.max(best, a[1] + ((s - a[0]) / (b[0] - a[0])) * (b[1] - a[1]));
      });
      return best;
    };
    const K = 200000, h = reach / K;
    let runout = 0, area = 0;
    for (let k = 0; k < K; k += 1) { const s = (k + 0.5) * h, rho = BIT + s; runout += tau(s) * rho * Math.acos(BIT / rho) * h; area += tau(s) * h; }
    expect(Math.abs(area - A)).toBeLessThanOrEqual(1e-8);   // tau integrates to the polygon's own area
    const L1 = 30 - 20, L2 = 5;
    const waste = A * (L1 + L2 - 2 * sbar) + 2 * runout;
    const v = totalVolume(boardBodies(board));
    // The inscribed sectors keep a little more wood than the true cutter: the bodies may only exceed the closed form.
    expect(v - (30 * 10 * 0.75 - waste), `kept ${v} closed form ${30 * 10 * 0.75 - waste}`).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.abs(v - (30 * 10 * 0.75 - waste))).toBeLessThanOrEqual(2e-3);
  });
});

describe('the stop\'s frame', () => {
  it('no step at any stop: the waste width just behind and just beyond the stop plane agree (≤ 1e-6") at 60 depths', () => {
    for (const [name, make] of [...CASES, ['zoneStop()', zoneStop] as [string, () => Board]]) {
      const board = make();
      const view = geometryBoard(board);
      const p = view.profiles[0]!;
      const frames = sweptStops(view, p);
      expect(frames.length, name).toBe(2);
      const inB = inBodiesFn(boardBodies(board));
      const pts = profileSection(board, oneSideCurve(p)).pts;
      const reach = Math.max(...pts.map((q) => q[0])), depth = Math.max(...pts.map((q) => q[1]));
      const T = board.thickness;
      for (const fr of frames) {
        let step = 0, read = 0;
        for (let t = 0.002; t < depth; t += depth / 60) {
          const w = (sgn: number) => {
            const q = (s: number): V3 => [fr.at[0] + sgn * 1e-6 * fr.F[0] + s * fr.N[0], fr.at[1] + sgn * 1e-6 * fr.F[1] + s * fr.N[1], p.face === 'max' ? T - t : t];
            let lo = 0, hi = reach + 0.01;
            if (!inB(q(hi))) return NaN;
            for (let k = 0; k < 50; k += 1) { const mid = (lo + hi) / 2; if (inB(q(mid))) hi = mid; else lo = mid; }
            return hi;
          };
          const a = w(-1), b = w(1);
          if (Number.isNaN(a) || Number.isNaN(b)) continue;
          read += 1;
          step = Math.max(step, Math.abs(a - b));
        }
        expect(read, `${name} ${fr.end}`).toBeGreaterThanOrEqual(30);
        expect(step, `${name} ${fr.end}`).toBeLessThanOrEqual(1e-6);
      }
    }
  }, 120_000);

  it('R-d: on a straight side the frame run-out IS a2\'s (frontAndEnds\' stops: every plane to 1e-12, edges and arc flags equal)', () => {
    for (const board of [frontAndEnds(), frontAndEnds('cove', 0.375), twoSideSharp]) {
      const view = geometryBoard(board);
      const p = view.profiles[0]!;
      const frames = sweptStops(view, p);
      expect(frames.length).toBe(2);
      const ends = 'loop' in p.run ? [] : [p.run.start, p.run.end];
      frames.forEach((fr, i) => {
        // face max: the face-frame end 0 is Start.
        const side = ends[fr.end === 'lo' ? 0 : 1]!.side;
        const c = oneSideCurve(p, side);
        const k = c.through === 'length' ? 0 : 1;
        const x = fr.at[k]!;
        const span = fr.F[k]! > 0 ? { lo: 0, hi: x, stopLo: false, stopHi: true } : { lo: x, hi: board[c.through], stopLo: true, stopHi: false };
        const a2 = runoutPieces(board, { ...c, span } as ViewCurve);
        const mine = stopRunoutPieces(board, oneSideCurve(p), fr);
        expect(mine.length, `stop ${i}`).toBe(a2.length);
        let worst = 0;
        a2.forEach((pc, j) => {
          const g = mine[j]!;
          expect(g.planes.length).toBe(pc.planes.length);
          expect(g.onArc).toEqual(pc.onArc);
          expect(g.edge).toEqual(pc.edge);
          expect(g.runout).toBe(fr.end);
          pc.planes.forEach((h, q) => {
            const m = g.planes[q]!;
            worst = Math.max(worst, ...[0, 1, 2].map((d) => Math.abs(h.n[d]! - m.n[d]!)), Math.abs(h.d - m.d));
          });
        });
        expect(worst, `stop ${i}`).toBeLessThanOrEqual(1e-12);
      });
    }
  });

  it('sweptStops: one frame per stop from the BUILT path, memoised, frozen; none for End to end or a loop', () => {
    const view = geometryBoard(stopOnCorner());
    const p = view.profiles[0]!;
    const a = sweptStops(view, p);
    expect(sweptStops(view, p)).toBe(a);
    expect(Object.isFrozen(a) && Object.isFrozen(a[0]) && Object.isFrozen(a[0]!.F)).toBe(true);
    expect(a.map((f) => f.end)).toEqual(['lo', 'hi']);
    for (const f of a) {
      expect(Math.abs(len(f.F) - 1)).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(len(f.N) - 1)).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(dot(f.F, f.N))).toBeLessThanOrEqual(1e-12);
    }
    const t = geometryBoard(topCorners(2));
    expect(sweptStops(t, t.profiles[0]!)).toEqual([]);
  });

  it('every body convex', () => {
    for (const [name, make] of [...CASES, ['zoneStop()', zoneStop] as [string, () => Board]]) {
      for (const b of boardBodies(make())) {
        const ok = b.faces.every((f) => b.faces.every((g) => g.verts.every((q) => f.n[0] * q[0] + f.n[1] * q[1] + f.n[2] * q[2]
          <= f.n[0] * f.verts[0]![0] + f.n[1] * f.verts[0]![1] + f.n[2] * f.verts[0]![2] + 1e-7)));
        expect(ok, name).toBe(true);
      }
    }
  });

  it('a stop\'s run-out faces carry its runout end and its profile\'s section edge names', () => {
    const board = stopOnCorner();
    const faces = boardBodies(board).flatMap((b) => b.faces);
    const ro = faces.filter((f) => f.runout !== undefined);
    expect(new Set(ro.map((f) => f.runout))).toEqual(new Set(['lo', 'hi']));
    expect(ro.some((f) => f.profileEdge?.startsWith('p1:'))).toBe(true);
  });
});

describe('Review Focus 2: a two-side run mirrored is the mirror image of the original', () => {
  const through = (b: Board): Board => ({ ...b, curves: b.curves.map((c) => mirrorCurveCut(c, 'thickness')), profiles: b.profiles.map((q) => mirrorProfile(q, 'thickness')) });
  const board = chiralTwoSide('flat');
  const parts: [string, (b: Board) => Board, (p: V3) => V3][] = [
    ['mirrorPart (along its length)', mirrorPart, (p) => [board.length - p[0], p[1], p[2]]],
    ['through its thickness (mirrorProfile)', through, (p) => [p[0], p[1], board.thickness - p[2]]],
  ];
  for (const [name, mirror, reflect] of parts) {
    it(name, () => {
      const m = mirror(board);
      expect(profileFaults(board, board.profiles[0]!)).toEqual([]);
      expect(m.profiles.flatMap((q) => profileFaults(m, q))).toEqual([]);
      expect(geometryBoard(m).profiles.length).toBe(1);
      expect(sweptStops(geometryBoard(m), geometryBoard(m).profiles[0]!).length).toBe(2);
      const ob = boardBodies(board), mb = boardBodies(m);
      expect(Math.abs(totalVolume(mb) - totalVolume(ob))).toBeLessThanOrEqual(1e-9);
      const inO = inBodiesFn(ob), inM = inBodiesFn(mb);
      const segs = profilePath(board, board.profiles[0]!)!.chords;
      const rand = rng(3);
      let bad = 0, tested = 0;
      while (tested < 100000) {
        const q: V3 = [rand() * board.length, rand() * board.width, rand() < 0.5 ? rand() * board.thickness : board.thickness - rand() * 0.5];
        // Near the profiled run and its run-outs (within an inch of the path).
        if (!segs.some((c) => distSeg([q[0], q[1]], c.a, c.b) <= 1)) continue;
        tested += 1;
        if (inO(q) !== inM(reflect(q))) bad += 1;
      }
      expect(bad).toBe(0);
    }, 60_000);
  }
});

describe('Review Focus 3: a station moved across a tangent point changes builder with no jump in wood (Q9)', () => {
  it('topCorners(2): a start 1e-6 before the tangent point (swept) and at it (straight) differ by ≤ 1e-5 in³', () => {
    const r = 2;
    const swept = topCorners(r, stopped('q', W_MIN, r - 1e-6, 30));
    const straight = topCorners(r, stopped('q', W_MIN, r, 30));
    expect(profileFaults(swept, swept.profiles[0]!)).toEqual([]);
    expect(profileFaults(straight, straight.profiles[0]!)).toEqual([]);
    expect(geometryBoard(swept).profiles.length).toBe(1);
    expect(geometryBoard(straight).profiles.length).toBe(0);
    const d = Math.abs(totalVolume(boardBodies(swept)) - totalVolume(boardBodies(straight)));
    expect(d).toBeLessThanOrEqual(1e-5);
  });
});

