import type { Board, CutFrom, Dimension, HoleRow } from './types';
import { DIMENSION_ORDER } from './geometry';
import { clippedRegion } from './cuts';
import { keptHalfSpace } from './angleCuts';
import { HOLE_EPS, holeInstances, type Hole } from './holes';

export type HoleFaultKind = 'breaks-out' | 'off-flat' | 'meets-hole' | 'too-deep';
export interface HoleFault {
  index: number;
  kind: HoleFaultKind;
  /** breaks-out: the face edge it runs past. */
  edge?: { dim: Dimension; side: CutFrom };
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

/**
 * THE strict-rule decider (holes spec §2.4): every fault of every hole of `row` on `board`, hole by hole, each hole's
 * faults in the order breaks-out, off-flat, meets-hole, too-deep. `board.holes` may hold `row` (matched by id) or not;
 * the other rows are `board.holes` without it. Exact against the cylinder (closed forms within HOLE_EPS), never sampled:
 * tangent to an edge or a cut passes, touching another hole meets it.
 */
export function holeFaults(board: Board, row: HoleRow): HoleFault[] {
  const mine = holeInstances(board, row);
  const others = board.holes.filter((r) => r.id !== row.id).flatMap((r) => holeInstances(board, r));
  const regions = board.cuts.map((c) => clippedRegion(board, c))
    .filter((r) => DIMENSION_ORDER.every((d) => r[d][1] - r[d][0] > HOLE_EPS));
  const planes = board.angleCuts.flatMap((c) => { const h = keptHalfSpace(board, c); return h ? [h] : []; });
  const out: HoleFault[] = [];
  for (const h of mine) {
    const [u, v] = inPlane(h);
    const ax = idx(h.axis);
    const s = span(h);
    // breaks-out: the circle leaves the face rectangle (tangent allowed).
    for (const i of [u, v]) {
      const d = DIMENSION_ORDER[i]!;
      if (h.centre[i]! - h.radius < -HOLE_EPS) { out.push({ index: h.index, kind: 'breaks-out', edge: { dim: d, side: 'min' } }); break; }
      if (h.centre[i]! + h.radius > board[d] + HOLE_EPS) { out.push({ index: h.index, kind: 'breaks-out', edge: { dim: d, side: 'max' } }); break; }
    }
    // off-flat: a rectangular cut's region meets the cylinder — the axial spans touching (CONTACT counts: a bottom on a
    // cut's floor leaves zero skin and breaks through, as too-deep's ≥ judges the back face; ruling R3) and the disc
    // reaching strictly inside the region in-plane (in-plane tangency stays allowed),
    // or a point of the cylinder lies on an angle cut's removed side (the linear minimum over each end disc).
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
    if (inCut || onSlope) out.push({ index: h.index, kind: 'off-flat' });
    const hit = [...mine.filter((o) => o.index !== h.index), ...others].find((o) => meets(h, o));
    if (hit) out.push({ index: h.index, kind: 'meets-hole', other: { row: hit.row, index: hit.index } });
    if (row.depth !== 'through' && row.depth > board[row.face] - HOLE_EPS) out.push({ index: h.index, kind: 'too-deep' });
  }
  return out;
}
