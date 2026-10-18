import type { Board, CutFrom, Dimension, HoleRow } from './types';
import { DIMENSION_ORDER } from './geometry';
import { clippedRegion } from './cuts';
import { keptHalfSpace } from './angleCuts';
import { circleMeetsWaste, deriveCurveKind, localSegments, rectMeetsWaste, spanOf, uvDims, type CurveKind, type ViewCurve } from './curves';
import { runoutReach } from './runout';
import { HOLE_EPS, holeInstances, type Hole } from './holes';
import { geometryBoard, profileFields, type ProfileKind } from './profiles';
import { builtSwept, sweptWasteMeets } from './sweep';

export type HoleFaultKind = 'breaks-out' | 'off-flat' | 'meets-hole' | 'too-deep';
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

/** Two cylinders meet (touching is meeting, spec §2.4). Parallel: discs within r1 + r2 and the axial spans overlapping.
 *  Perpendicular (A along a, B along b, c the third): x_a and x_b are independent, so each is taken nearest the other
 *  hole's centre within the spans; the two half-chords on c then must reach. */
function meets(A: Hole, B: Hole): boolean {
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
  for (const i of inPlane(h)) {
    const d = DIMENSION_ORDER[i]!;
    if (h.centre[i]! - h.radius < -HOLE_EPS) return { dim: d, side: 'min' };
    if (h.centre[i]! + h.radius > board[d] + HOLE_EPS) return { dim: d, side: 'max' };
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
    if (h.axis === c.through) hit = circleMeetsWaste(segs, [h.centre[iu]!, h.centre[iv]!], h.radius);
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
      const reach = runoutReach(board, c as ViewCurve);
      const k = idx(c.through);
      const [a, z] = h.axis === c.through ? span(h) : [h.centre[k]! - h.radius, h.centre[k]! + h.radius];
      hit = z >= sp.lo - (sp.stopLo ? reach : 0) - HOLE_EPS && a <= sp.hi + (sp.stopHi ? reach : 0) + HOLE_EPS;
    }
    if (hit) { const p = profileFields(c); return { id: c.id, kind: deriveCurveKind(c), ...(p ? { profile: p.kind } : {}) }; }
  }
  // A swept profile (profile runs b1, §4.1, P14): only those boardBodies builds; keyed by its id through `curve` (P7).
  if (board.profiles.length > 0) {
    for (const p of builtSwept(board)) if (sweptWasteMeets(board, p, h)) return { id: p.id, kind: null, profile: p.kind };
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

/** too-deep: a blind hole reaching the back face or past it (zero skin breaks through). */
export function tooDeep(board: Board, h: Hole): boolean {
  return !h.through && h.depth > board[h.axis] - HOLE_EPS;
}

/**
 * A hole whose cylinder lies wholly in the stock (ruling R15): it neither breaks out, nor runs off the flat, nor (blind)
 * reaches the back face — the per-hole checks holeFaults reports (a curve's waste included), from the same functions. Its wall needs no clipping
 * to the part's bodies (grainTiling's holeMesh). meets-hole does not matter for the wall.
 */
export function holeInStock(board: Board, h: Hole, checks: StockChecks = stockChecks(board)): boolean {
  board = geometryBoard(board);
  return !breaksOut(board, h) && !offFlat(checks, h) && !tooDeep(board, h) && !intoCurve(board, h);
}

/**
 * THE strict-rule decider (holes spec §2.4): every fault of every hole of `row` on `board`, hole by hole, each hole's
 * faults in the order breaks-out, off-flat, meets-hole, too-deep. `board.holes` may hold `row` (matched by id) or not;
 * the other rows are `board.holes` without it. Exact against the cylinder (closed forms within HOLE_EPS), never sampled:
 * tangent to an edge or a cut passes, touching another hole meets it.
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
  }
  return out;
}
