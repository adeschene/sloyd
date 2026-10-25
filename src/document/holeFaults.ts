import type { Board, CutFrom, Dimension, HoleRow } from './types';
import { DIMENSION_ORDER } from './geometry';
import { clippedRegion } from './cuts';
import { keptHalfSpace, type V3 } from './angleCuts';
import { circleMeetsWaste, deriveCurveKind, localSegments, rectMeetsWaste, spanOf, uvDims, type CurveKind, type ViewCurve } from './curves';
import { runoutReach } from './runout';
import { HOLE_EPS, holeInstances, holeRegion, holeTouchesBox, tiltedHole, type Hole } from './holes';
import { geometryBoard, profileFields, type ProfileKind } from './profiles';
import { builtSwept, sweptWasteMeets, sweptWasteMeetsBox } from './sweep';

export type HoleFaultKind = 'breaks-out' | 'off-flat' | 'meets-hole' | 'too-deep' | 'too-shallow';
export interface FaultCurve { id: string; kind: CurveKind | null; profile?: ProfileKind }
export interface HoleFault {
  index: number;
  kind: HoleFaultKind;
  /** breaks-out: the face edge it runs past. */
  edge?: { dim: Dimension; side: CutFrom };
  /** breaks-out into a curve's waste: the curve (instead of an edge). `profile` only for an edge profile (R3: a
   *  through-length corner is a Roundover there, not a rounded corner), so a non-profile's fault is unchanged. */
  curve?: FaultCurve;
  /** meets-hole: the hole it meets. */
  other?: { row: string; index: number };
}

const idx = (d: Dimension) => DIMENSION_ORDER.indexOf(d);
const inPlane = (h: Hole) => [0, 1, 2].filter((i) => i !== idx(h.axis)) as [number, number];
const span = (h: Hole): [number, number] => {
  const a = h.centre[idx(h.axis)];
  const b = a + h.dir * h.depth;
  return [Math.min(a, b), Math.max(a, b)];
};

/*
 * A TILTED bore's closed forms (angled holes spec §6.3; holes.ts' `Hole`). `m = h.bit`, unnormalised, its face-axis
 * component exactly `dir`, so `L = |m| = 1/cos θ`, `tan θ = hypot(m_u, m_v)` (exact: no division) and `sin θ = tan θ / L`.
 * The bore is the convex hull of its two END CURVES — the mouth, and the exit (through) or the bottom disc (blind) — so a
 * linear function's extreme over the bore is its extreme over those two curves:
 * - a FACE-PARALLEL ring (the mouth; a through exit) is the circle square to the bit slid along it onto the plane: points
 *   `c_t + w − dir·w_a·m`, `w ⊥ b̂`, `|w| ≤ r`. Over it `n·x` spans `n·c_t ± r·|g|` with `g = n − dir·(n·m)·e_a` — `g` is
 *   already square to `b̂` (g·m = dir·g_a + ñ·m̃ = −ñ·m̃ + ñ·m̃ = 0), so `|g|² = |ñ|² + (ñ·m̃)²`, ñ/m̃ the in-plane parts.
 *   For `n = e_i` in the plane: the half-extent `r·√(1 + m_i²)` (r / cos θ along the tilt, r square to it).
 * - the BOTTOM DISC (blind; square to the bit at `c + reach·m`): `n·x` spans `n·c_far ± r·√(|n|² − (n·b̂)²)`; for `e_i`,
 *   the half-extent `r·√(1 − m_i²/L²)` — on the face axis `r·sin θ`.
 * A square bore takes none of this: every function below branches on `tiltedHole` and keeps its square code unchanged.
 */
const tanOf = (h: Hole) => { const [u, v] = inPlane(h); return Math.hypot(h.bit[u]!, h.bit[v]!); };
const lenOf = (h: Hole) => Math.hypot(h.bit[0], h.bit[1], h.bit[2]);
/** The far end curve's centre: `reach` along the bit (the exit ring's, or the bottom disc's). */
const farOf = (h: Hole): V3 => [h.centre[0] + h.reach * h.bit[0], h.centre[1] + h.reach * h.bit[1], h.centre[2] + h.reach * h.bit[2]];
/** min over a face-parallel ring centred `c` of n·x + d (above: `n·c + d − r·|g|`). */
function ringMin(h: Hole, n: V3, d: number, c: V3): number {
  const a = idx(h.axis);
  const nm = n[0] * h.bit[0] + n[1] * h.bit[1] + n[2] * h.bit[2];
  const g: V3 = [n[0], n[1], n[2]];
  g[a] -= h.dir * nm;
  return n[0] * c[0] + n[1] * c[1] + n[2] * c[2] + d - h.radius * Math.hypot(g[0], g[1], g[2]);
}
/** min over the bottom disc of n·x + d (above: `n·c_far + d − r·√(|n|² − (n·b̂)²)`). */
function discMin(h: Hole, n: V3, d: number): number {
  const c = farOf(h);
  const L = lenOf(h);
  const nb = (n[0] * h.bit[0] + n[1] * h.bit[1] + n[2] * h.bit[2]) / L;
  return n[0] * c[0] + n[1] * c[1] + n[2] * c[2] + d - h.radius * Math.sqrt(Math.max(0, n[0] ** 2 + n[1] ** 2 + n[2] ** 2 - nb * nb));
}

/**
 * The segment a tilted pair's capsule test runs on (spec §6.3, conservative): the bore lies within `r` of its bit's
 * line, and its points' feet on that line run from `−r·tan θ` (the mouth ellipse's uphill tip: its foot is BEHIND the
 * mouth centre, since a face-parallel ring's feet are `−dir·w_a·L`, `|w_a| ≤ r·sin θ`) to the far centre, plus `r·tan θ`
 * again past a through exit (another face-parallel ring) and nothing past a blind bottom (a disc square to the bit). So
 * the bore lies inside the capsule of radius r about that segment. In parameters on `m`: run back by `r·tan θ / L`.
 * A square bore's segment is exactly its axis, mouth to bottom.
 */
function capsuleOf(h: Hole): [V3, V3] {
  const k = tiltedHole(h) ? (h.radius * tanOf(h)) / lenOf(h) : 0;
  const s0 = -k;
  const s1 = h.reach + (h.through ? k : 0);
  const at = (s: number): V3 => [h.centre[0] + s * h.bit[0], h.centre[1] + s * h.bit[1], h.centre[2] + s * h.bit[2]];
  return [at(s0), at(s1)];
}

/** The distance between segments [p0, p1] and [q0, q1], closed form (the clamped closest points; parallel and
 *  degenerate segments handled — a row of bores tilted alike is parallel). */
function segmentDistance(p0: V3, p1: V3, q0: V3, q1: V3): number {
  const sub = (x: V3, y: V3): V3 => [x[0] - y[0], x[1] - y[1], x[2] - y[2]];
  const dt = (x: V3, y: V3) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const d1 = sub(p1, p0); const d2 = sub(q1, q0); const r = sub(p0, q0);
  const a = dt(d1, d1); const e = dt(d2, d2); const f = dt(d2, r);
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  let s: number; let t: number;
  if (a <= 1e-24 && e <= 1e-24) { s = 0; t = 0; }
  else if (a <= 1e-24) { s = 0; t = clamp(f / e); }
  else {
    const c = dt(d1, r);
    if (e <= 1e-24) { t = 0; s = clamp(-c / a); }
    else {
      const b = dt(d1, d2);
      const den = a * e - b * b;
      s = den > 1e-24 * a * e ? clamp((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a); } else if (t > 1) { t = 1; s = clamp((b - c) / a); }
    }
  }
  const cp = [p0[0] + s * d1[0], p0[1] + s * d1[1], p0[2] + s * d1[2]] as V3;
  const cq = [q0[0] + t * d2[0], q0[1] + t * d2[1], q0[2] + t * d2[2]] as V3;
  return Math.hypot(cp[0] - cq[0], cp[1] - cq[1], cp[2] - cq[2]);
}

/** Two cylinders meet (touching is meeting, spec §2.4). Parallel: discs within r1 + r2 and the axial spans overlapping.
 *  Perpendicular (A along a, B along b, c the third): x_a and x_b are independent, so each is taken nearest the other
 *  hole's centre within the spans; the two half-chords on c then must reach. */
function meets(A: Hole, B: Hole): boolean {
  // Either bore tilted: the capsule test (spec §6.3, conservative — a pair just clear near an end may be judged meeting).
  if (tiltedHole(A) || tiltedHole(B)) {
    const [p0, p1] = capsuleOf(A);
    const [q0, q1] = capsuleOf(B);
    return segmentDistance(p0, p1, q0, q1) <= A.radius + B.radius + HOLE_EPS;
  }
  const ia = span(A);
  const ib = span(B);
  if (A.axis === B.axis) {
    const [u, v] = inPlane(A);
    return Math.min(ia[1], ib[1]) - Math.max(ia[0], ib[0]) >= -HOLE_EPS
      && Math.hypot(A.centre[u] - B.centre[u], A.centre[v] - B.centre[v]) <= A.radius + B.radius + HOLE_EPS;
  }
  const a = idx(A.axis);
  const b = idx(B.axis);
  const c = 3 - a - b;
  const ja = [Math.max(ia[0], B.centre[a] - B.radius), Math.min(ia[1], B.centre[a] + B.radius)] as const;
  const jb = [Math.max(ib[0], A.centre[b] - A.radius), Math.min(ib[1], A.centre[b] + A.radius)] as const;
  if (ja[0] > ja[1] + HOLE_EPS || jb[0] > jb[1] + HOLE_EPS) return false;
  const da = Math.max(0, ja[0] - B.centre[a], B.centre[a] - ja[1]);
  const db = Math.max(0, jb[0] - A.centre[b], A.centre[b] - jb[1]);
  const hA = Math.sqrt(Math.max(0, A.radius ** 2 - db ** 2));
  const hB = Math.sqrt(Math.max(0, B.radius ** 2 - da ** 2));
  return Math.abs(A.centre[c] - B.centre[c]) <= hA + hB + HOLE_EPS;
}

/** What the per-hole stock checks read off the board, computed once per board: every rectangular cut's region (a
 *  degenerate one dropped) and every angle cut's kept half-space. */
export interface StockChecks { regions: ReturnType<typeof clippedRegion>[]; planes: NonNullable<ReturnType<typeof keptHalfSpace>>[] }
export function stockChecks(board: Board): StockChecks {
  board = geometryBoard(board);
  return {
    regions: board.cuts.map((c) => clippedRegion(board, c)).filter((r) => DIMENSION_ORDER.every((d) => r[d][1] - r[d][0] > HOLE_EPS)),
    planes: board.angleCuts.flatMap((c) => { const h = keptHalfSpace(board, c); return h ? [h] : []; }),
  };
}

/** breaks-out: the face edge the circle runs past (tangent allowed), or null. A curve's waste is `intoCurve`, the same fault kind. */
export function breaksOut(board: Board, h: Hole): { dim: Dimension; side: CutFrom } | null {
  if (tiltedHole(h)) return tiltedBreaksOut(board, h);
  for (const i of inPlane(h)) {
    const d = DIMENSION_ORDER[i]!;
    if (h.centre[i]! - h.radius < -HOLE_EPS) return { dim: d, side: 'min' };
    if (h.centre[i]! + h.radius > board[d] + HOLE_EPS) return { dim: d, side: 'max' };
  }
  return null;
}

/** A tilted bore (exact, spec §6.3): per in-plane dimension i, the bore's extent is its two end curves' — the mouth
 *  ellipse `c_i ± r·√(1 + m_i²)` and the exit ellipse (the same half-extent) or the bottom disc (`r·√(1 − m_i²/L²)`)
 *  about `c_i + reach·m_i` — tangent allowed. A bore leaving by a side below the mouth (its exit or bottom past it) is
 *  breaks-out on that side; the mouth ellipse contains the square twin's disc, so a tilt never reports less there. */
function tiltedBreaksOut(board: Board, h: Hole): { dim: Dimension; side: CutFrom } | null {
  const L = lenOf(h);
  const far = farOf(h);
  for (const i of inPlane(h)) {
    const d = DIMENSION_ORDER[i]!;
    const m = h.bit[i]!;
    const mouth = h.radius * Math.sqrt(1 + m * m);
    const end = h.through ? mouth : h.radius * Math.sqrt(Math.max(0, 1 - (m * m) / (L * L)));
    if (Math.min(h.centre[i]! - mouth, far[i]! - end) < -HOLE_EPS) return { dim: d, side: 'min' };
    if (Math.max(h.centre[i]! + mouth, far[i]! + end) > board[d] + HOLE_EPS) return { dim: d, side: 'max' };
  }
  return null;
}

/** A hole meeting a curve's waste (curves spec §6.3; touching is meeting): along `through` its disc, square to it the
 *  rectangle it projects to on (u, v). The first such curve, or null. */
export function intoCurve(board: Board, h: Hole): FaultCurve | null {
  board = geometryBoard(board);
  for (const c of board.curves) {
    const [u, v] = uvDims(c.through);
    const iu = idx(u);
    const iv = idx(v);
    const segs = localSegments(board, c);
    let hit: boolean;
    // A tilted bore (spec §6.3, conservative): its true box (holeRegion) projected on (u, v), whichever way it runs.
    const box = tiltedHole(h) ? holeRegion(h) : null;
    if (box) hit = rectMeetsWaste(segs, [box[u][0], box[v][0]], [box[u][1], box[v][1]]);
    else if (h.axis === c.through) hit = circleMeetsWaste(segs, [h.centre[iu]!, h.centre[iv]!], h.radius);
    else {
      const [lo, hi] = span(h);
      const ax = idx(h.axis);
      const other = ax === iu ? iv : iu;
      const box = (k: number) => (k === ax ? [lo, hi] : [h.centre[other]! - h.radius, h.centre[other]! + h.radius]);
      const bu = box(iu);
      const bv = box(iv);
      hit = rectMeetsWaste(segs, [bu[0]!, bv[0]!], [bu[1]!, bv[1]!]);
    }
    // A stopped profile (P14): the hole's extent along `through` must also meet the band extended by BEARING + reach at each stop.
    const sp = spanOf(c);
    if (hit && sp) {
      // A square span (a round tenon's waste, round tenons spec §7) has no run-out: its walls are where it stops.
      const reach = sp.square ? 0 : runoutReach(board, c as ViewCurve);
      const k = idx(c.through);
      const [a, z] = box ? box[c.through] : h.axis === c.through ? span(h) : [h.centre[k]! - h.radius, h.centre[k]! + h.radius];
      hit = z >= sp.lo - (sp.stopLo ? reach : 0) - HOLE_EPS && a <= sp.hi + (sp.stopHi ? reach : 0) + HOLE_EPS;
    }
    if (hit) { const p = profileFields(c); return { id: c.id, kind: deriveCurveKind(c), ...(p ? { profile: p.kind } : {}) }; }
  }
  // A swept profile (profile runs b1, §4.1, P14): only those boardBodies builds; keyed by its id through `curve` (P7). A
  // tilted bore takes the box footprint test on its true box (spec §6.3, conservative; sweptWasteMeetsBox is closed).
  if (board.profiles.length > 0) {
    const box = tiltedHole(h) ? holeRegion(h) : null;
    for (const p of builtSwept(board)) if (box ? sweptWasteMeetsBox(board, p, box) : sweptWasteMeets(board, p, h)) return { id: p.id, kind: null, profile: p.kind };
  }
  return null;
}

/**
 * off-flat: a rectangular cut's region meets the cylinder — the axial spans touching (CONTACT counts: a bottom on a
 * cut's floor leaves zero skin and breaks through, as too-deep's ≥ judges the back face; ruling R3) and the disc
 * reaching strictly inside the region in-plane (in-plane tangency stays allowed),
 * or a point of the cylinder lies on an angle cut's removed side (the linear minimum over each end disc).
 */
export function offFlat({ regions, planes }: StockChecks, h: Hole): boolean {
  if (tiltedHole(h)) return tiltedOffFlat({ regions, planes }, h);
  const [u, v] = inPlane(h);
  const ax = idx(h.axis);
  const s = span(h);
  const inCut = regions.some((r) => {
    const R = [r.length, r.width, r.thickness];
    if (Math.min(s[1], R[ax]![1]) - Math.max(s[0], R[ax]![0]) < -HOLE_EPS) return false;
    const dx = Math.max(R[u]![0] - h.centre[u]!, 0, h.centre[u]! - R[u]![1]);
    const dy = Math.max(R[v]![0] - h.centre[v]!, 0, h.centre[v]! - R[v]![1]);
    return Math.hypot(dx, dy) < h.radius - HOLE_EPS;
  });
  const onSlope = planes.some((p) => {
    const perp = Math.hypot(p.n[u]!, p.n[v]!);
    return s.some((x) => {
      const c = [...h.centre];
      c[ax] = x;
      return p.n[0] * c[0]! + p.n[1] * c[1]! + p.n[2] * c[2]! + p.d - h.radius * perp < -HOLE_EPS;
    });
  });
  return inCut || onSlope;
}

/**
 * A tilted bore's off-flat (spec §6.3). Against a rectangular cut CONSERVATIVE: the bore's true box (holeRegion, which
 * contains it) meeting the region, closed (`holeTouchesBox`) — contact anywhere counts, so a bore whose box only grazes a
 * cut is judged off the flat. Against an angle cut EXACT: the minimum of `n·x + d` over the bore is over its end curves
 * (the closed forms above: `ringMin` at the mouth and a through exit, `discMin` at a blind bottom).
 */
function tiltedOffFlat({ regions, planes }: StockChecks, h: Hole): boolean {
  if (regions.some((r) => holeTouchesBox(h, r))) return true;
  return planes.some((p) => Math.min(ringMin(h, p.n, p.d, h.centre), h.through ? ringMin(h, p.n, p.d, farOf(h)) : discMin(h, p.n, p.d)) < -HOLE_EPS);
}

/** too-deep: a blind hole reaching the back face or past it (zero skin breaks through). A tilted bore (exact, spec §6.3):
 *  the bottom disc's deepest point, its centre's axial `reach` plus `r·sin θ` (the disc's half-extent on the face axis). */
export function tooDeep(board: Board, h: Hole): boolean {
  if (h.through) return false;
  if (tiltedHole(h)) return h.reach + (h.radius * tanOf(h)) / lenOf(h) > board[h.axis] - HOLE_EPS;
  return h.depth > board[h.axis] - HOLE_EPS;
}

/** too-shallow (ruling T2d): a blind TILTED bore whose bottom disc reaches back to the entry face — its uphill rim,
 *  `reach − r·sin θ` in, at or above the mouth plane: `depth·cos θ ≤ r·sin θ` ⇔ `depth ≤ r·tan θ` (depth along the bit).
 *  Touching is the fault, as too-deep's ≥ (zero skin). Never a square or through bore. */
export function tooShallow(h: Hole): boolean {
  return !h.through && tiltedHole(h) && h.depth <= h.radius * tanOf(h) + HOLE_EPS;
}

/**
 * A hole whose cylinder lies wholly in the stock (ruling R15): it neither breaks out, nor runs off the flat, nor (blind)
 * reaches the back face (or, tilted, back to the entry face: too-shallow) — the per-hole checks holeFaults reports (a curve's waste included), from the same functions. Its wall needs no clipping
 * to the part's bodies (grainTiling's holeMesh). meets-hole does not matter for the wall.
 */
export function holeInStock(board: Board, h: Hole, checks: StockChecks = stockChecks(board)): boolean {
  board = geometryBoard(board);
  return !breaksOut(board, h) && !offFlat(checks, h) && !tooDeep(board, h) && !tooShallow(h) && !intoCurve(board, h);
}

/**
 * THE strict-rule decider (holes spec §2.4): every fault of every hole of `row` on `board`, hole by hole, each hole's
 * faults in the order breaks-out, off-flat, meets-hole, too-deep, too-shallow. `board.holes` may hold `row` (matched by id) or not;
 * the other rows are `board.holes` without it. Exact against the cylinder (closed forms within HOLE_EPS), never sampled:
 * tangent to an edge or a cut passes, touching another hole meets it. A TILTED bore (angled holes spec §6.3): exact or
 * CONSERVATIVE (may over-report, never under-report), never sampled — see each rule.
 */
export function holeFaults(board: Board, row: HoleRow): HoleFault[] {
  board = geometryBoard(board);
  const mine = holeInstances(board, row);
  const others = board.holes.filter((r) => r.id !== row.id).flatMap((r) => holeInstances(board, r));
  const checks = stockChecks(board);
  const out: HoleFault[] = [];
  for (const h of mine) {
    const edge = breaksOut(board, h);
    if (edge) out.push({ index: h.index, kind: 'breaks-out', edge });
    const curve = intoCurve(board, h);
    if (curve) out.push({ index: h.index, kind: 'breaks-out', curve });
    if (offFlat(checks, h)) out.push({ index: h.index, kind: 'off-flat' });
    const hit = [...mine.filter((o) => o.index !== h.index), ...others].find((o) => meets(h, o));
    if (hit) out.push({ index: h.index, kind: 'meets-hole', other: { row: hit.row, index: hit.index } });
    if (tooDeep(board, h)) out.push({ index: h.index, kind: 'too-deep' });
    if (tooShallow(h)) out.push({ index: h.index, kind: 'too-shallow' });
  }
  return out;
}
