import type { Board, Dimension } from './types';
import { DIMENSION_ORDER } from './geometry';
import { convexPieces, curveOutline, CURVE_SEGMENTS_MAX, CURVE_TOLERANCE, inPolygonClosed, spanOf, uvDims, type P2, type ViewCurve } from './curves';

/**
 * A stopped profile's run-outs (profile runs spec P9): THE one home of the router's run-out geometry. The band between the
 * stations is chunk 1's straight profile at full depth; beyond a STOP end the bit, swung out of the cut, removes at depth t
 * every point within BEARING + w(t) of its axis on the far side of the station — the profile revolved about the axis, which
 * runs along the thickness BEARING outside the side face, at the station. Bodies stay convex (invariant 48): each run-out is
 * cut into angular sectors about the axis, and in each sector the profile's convex pieces become planes with ρ read as the
 * sector's mid direction (chords of the revolved circles at CURVE_TOLERANCE). Runtime imports: `curves` and `geometry` only.
 */
type V3 = [number, number, number];
type Half = { n: V3; d: number };

/** Inches: the bit's bearing radius — its axis lies this far outside the side face (P9). */
export const BEARING = 0.25;

/**
 * The local frame of a spanned profile: run axis index k (the curve's `through`), across axis iu (the side face's normal,
 * the curve's u) and depth axis iv (the broad face's normal, the curve's v — the thickness for every profile curve); the
 * side face's coordinate `uEdge` and its outward sign `uOut`; the broad face's coordinate `vFace` and its inward sign `vIn`.
 * A board-local point's (s, t) is (uOut·(uEdge − x_iu), vIn·(x_iv − vFace)): s in from the side face, t in from the broad face.
 */
export function sectionFrame(board: Pick<Board, Dimension>, c: ViewCurve): { k: number; iu: number; iv: number; uEdge: number; uOut: 1 | -1; vFace: number; vIn: 1 | -1 } {
  const [u, v] = uvDims(c.through);
  return {
    k: DIMENSION_ORDER.indexOf(c.through), iu: DIMENSION_ORDER.indexOf(u), iv: DIMENSION_ORDER.indexOf(v),
    uEdge: c.uFrom === 'min' ? 0 : board[u], uOut: c.uFrom === 'min' ? -1 : 1,
    vFace: c.vFrom === 'min' ? 0 : board[v], vIn: c.vFrom === 'min' ? 1 : -1,
  };
}

/** The profile's waste as an (s, t) polygon: s in from the side face, t in from the broad face; arc flags per edge. */
export function profileSection(board: Pick<Board, Dimension>, c: ViewCurve): { pts: P2[]; arc: boolean[] } {
  const f = sectionFrame(board, c);
  const o = curveOutline(board, c);
  return { pts: o.pts.map(([u, v]) => [f.uOut * (f.uEdge - u), f.vIn * (v - f.vFace)] as P2), arc: o.arcEdge };
}

/** The bit's axis at a stop: a point in the run–across plane (run along k, u along iu); it runs along iv. */
export function runoutAxis(board: Pick<Board, Dimension>, c: ViewCurve, end: 'lo' | 'hi'): { run: number; u: number } {
  const span = spanOf(c);
  if (!span) throw new Error('runoutAxis: a curve with no span has no run-out');
  const f = sectionFrame(board, c);
  return { run: end === 'lo' ? span.lo : span.hi, u: f.uEdge + f.uOut * BEARING };
}

/** Sectors over a half turn of radius r: the fewest whose chord sagitta is within CURVE_TOLERANCE, 2 at least (a single
 *  sector would be a half-plane, its two radial planes one line), CURVE_SEGMENTS_MAX at most. */
function sectors(r: number): number {
  const step = CURVE_TOLERANCE >= 2 * r ? Math.PI : 2 * Math.acos(1 - CURVE_TOLERANCE / r);
  return Math.min(CURVE_SEGMENTS_MAX, Math.max(2, Math.ceil(Math.PI / step - 1e-9)));
}

/**
 * Convex waste pieces of both run-outs, n INTO the waste (a piece's inside, n·x + d >= 0, is waste), as `subtractPieces`
 * takes them. For each stop: sectors at angle θ from −π/2 (straight out of the side face, into air) to π/2 (into the wood)
 * about the forward direction f (−1 along k at `lo`, +1 at `hi`); each sector is two radial planes through the axis and the
 * forward half-space f·(x_k − station) >= 0, and each convex piece of the section adds its edges as planes with
 * s = m·(x − axis) − BEARING (m the sector's mid direction) and t = vIn·(x_iv − vFace). The piece's arc edges are `onArc`;
 * its diagonals come last (`splitPieces`' order).
 */
export function runoutPieces(board: Pick<Board, Dimension>, c: ViewCurve): { planes: Half[]; onArc: boolean[]; runout: 'lo' | 'hi' }[] {
  const span = spanOf(c);
  if (!span || (!span.stopLo && !span.stopHi)) return [];
  const f = sectionFrame(board, c);
  const sec = profileSection(board, c);
  const m0 = sec.pts.length;
  const same = (a: P2, b: P2) => a[0] === b[0] && a[1] === b[1];
  const onOutline = (p: P2, q: P2) => sec.pts.some((x, j) => { const y = sec.pts[(j + 1) % m0]!; return (same(x, p) && same(y, q)) || (same(x, q) && same(y, p)); });
  // Each convex piece's edges in (s, t): unit inward normal (a CCW piece's inside is the left of each edge) and offset.
  const pieces = convexPieces(sec.pts, sec.arc).map(({ pts, onArc }) => {
    const edges: { ns: number; nt: number; c: number; arc: boolean; diagonal: boolean }[] = [];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length]!;
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (l < 1e-14) return;
      const ns = -(q[1] - p[1]) / l;
      const nt = (q[0] - p[0]) / l;
      edges.push({ ns, nt, c: -(ns * p[0] + nt * p[1]), arc: onArc[i]!, diagonal: !onOutline(p, q) });
    });
    return [...edges.filter((e) => !e.diagonal), ...edges.filter((e) => e.diagonal)];
  });
  const maxS = Math.max(...sec.pts.map((p) => p[0]));
  const n = sectors(BEARING + maxS);
  const out: { planes: Half[]; onArc: boolean[]; runout: 'lo' | 'hi' }[] = [];
  const ends: ('lo' | 'hi')[] = [...(span.stopLo ? ['lo' as const] : []), ...(span.stopHi ? ['hi' as const] : [])];
  for (const end of ends) {
    const fwd = end === 'lo' ? -1 : 1;
    const axis = runoutAxis(board, c, end);
    // A direction in the (k, iu) plane at angle θ from forward, toward the wood (−uOut) for θ > 0.
    const dir = (th: number): [number, number] => [fwd * Math.cos(th), -f.uOut * Math.sin(th)];
    const lift = (nk: number, nu: number, nv: number, d: number): Half => {
      const N: V3 = [0, 0, 0];
      N[f.k] = nk; N[f.iu] = nu; N[f.iv] = nv;
      return { n: N, d };
    };
    const forward = lift(fwd, 0, 0, -fwd * axis.run);
    for (let i = 0; i < n; i += 1) {
      const th0 = -Math.PI / 2 + (i / n) * Math.PI;
      const th1 = -Math.PI / 2 + ((i + 1) / n) * Math.PI;
      const m = dir((th0 + th1) / 2);
      // A radial plane through the axis containing direction `th`, its normal toward the sector's middle.
      const radial = (th: number): Half => {
        const d = dir(th);
        let nk = -d[1], nu = d[0];
        if (nk * m[0] + nu * m[1] < 0) { nk = -nk; nu = -nu; }
        return lift(nk, nu, 0, -(nk * axis.run + nu * axis.u));
      };
      const wedge = [radial(th0), radial(th1), forward];
      const mA = m[0] * axis.run + m[1] * axis.u;
      for (const edges of pieces) {
        // ns·s + nt·t + c >= 0 with s = m·(x − axis) − BEARING and t = vIn·(x_iv − vFace): a unit normal, since |m| = 1.
        const planes = edges.map((e) => lift(e.ns * m[0], e.ns * m[1], e.nt * f.vIn, e.c - e.ns * mA - e.ns * BEARING - e.nt * f.vIn * f.vFace));
        out.push({ planes: [...wedge, ...planes], onArc: [false, false, false, ...edges.map((e) => e.arc)], runout: end });
      }
    }
  }
  return out;
}

/**
 * True when a board-local point is waste of this profile, band or run-out: THE INDEPENDENT ORACLE, written from P9 and never
 * from the pieces. In the band (lo <= run <= hi), (s, t) lies in the section; beyond a stop, with ρ the distance from the
 * bit's axis in the run–across plane, (ρ − BEARING, t) does. Beyond an end that runs out through the part's end face the
 * band continues (outside the part). Closed (a point on the boundary is waste).
 */
export function profileWasteContains(board: Pick<Board, Dimension>, c: ViewCurve, p: V3): boolean {
  const f = sectionFrame(board, c);
  const { pts } = profileSection(board, c);
  const s = f.uOut * (f.uEdge - p[f.iu]);
  const t = f.vIn * (p[f.iv] - f.vFace);
  const run = p[f.k];
  const span = spanOf(c);
  const beyond = span && run < span.lo && span.stopLo ? 'lo' : span && run > span.hi && span.stopHi ? 'hi' : null;
  if (!beyond) return inPolygonClosed(pts, [s, t]);
  const axis = runoutAxis(board, c, beyond);
  const rho = Math.hypot(run - axis.run, p[f.iu] - axis.u);
  return inPolygonClosed(pts, [rho - BEARING, t]);
}
