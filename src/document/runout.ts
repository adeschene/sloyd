import type { Board, Dimension } from './types';
import { DIMENSION_ORDER } from './geometry';
import { arcChords, convexPieces, CURVE_EPS, distToSegment, curveOutline, CURVE_SEGMENTS_MAX, CURVE_TOLERANCE, inPolygonClosed, localSegments, spanOf, twiceArea, uvDims, type P2, type ViewCurve } from './curves';

/**
 * A stopped profile's run-outs (profile runs spec P9): THE one home of the router's run-out geometry. The band between the
 * stations is chunk 1's straight profile at full depth; beyond a STOP end the bit, swung out of the cut, removes at depth t
 * every point within BEARING + w(t) of its axis on the far side of the station — the profile revolved about the axis, which
 * runs along the thickness BEARING outside the side face, at the station. Bodies stay convex (invariant 48): each run-out is
 * cut into angular sectors about the axis, and in each sector the profile's convex pieces become planes with ρ read as
 * m·(x − axis) / cos h (m the sector's mid direction, h its half-angle): the INSCRIBED polygon, exact on both of the sector's
 * rays — chords of the revolved circles at CURVE_TOLERANCE, removing a little less than the true cutter between the rays, as
 * chords do on every arc. On the ray at θ = π/2, the station plane, the run-out's section IS the band's, so the two meet
 * with no step (T3 fix 1: the circumscribed form, ρ = m·(x − axis), left a ~0.004" step, a ~0.002" tooth and a sliver body
 * at every stop). Runtime imports: `curves` and `geometry` only.
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
 * about the forward direction f (−1 along k at `lo`, +1 at `hi`); each sector is two radial planes through the axis (a wedge
 * of at most π/2 between rays in [−π/2, π/2], so it lies in the forward half f·(x_k − station) >= 0 by itself: no plane for
 * that, T3 fix 1, bodies byte-identical without it), and each convex piece of the section adds its edges as planes with
 * s = m·(x − axis) / cos h − BEARING (m the sector's mid direction, h its half-angle: exact on both rays) and
 * t = vIn·(x_iv − vFace), each renormalised to a unit normal. The piece's arc edges are `onArc`; its diagonals come last
 * (`splitPieces`' order).
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
      const wedge = [radial(th0), radial(th1)];
      const ch = Math.cos((th1 - th0) / 2);
      const mA = m[0] * axis.run + m[1] * axis.u;
      for (const edges of pieces) {
        // ns·s + nt·t + c >= 0 with s = m·(x − axis) / cos h − BEARING and t = vIn·(x_iv − vFace), renormalised (the body code
        // reads n·x + d as a distance: an unnormalised plane gave a negative bodyVolume).
        const planes = edges.map((e) => {
          const nk = (e.ns * m[0]) / ch, nu = (e.ns * m[1]) / ch, nv = e.nt * f.vIn;
          const l = Math.hypot(nk, nu, nv);
          return lift(nk / l, nu / l, nv / l, (e.c - (e.ns * mA) / ch - e.ns * BEARING - e.nt * f.vIn * f.vFace) / l);
        });
        out.push({ planes: [...wedge, ...planes], onArc: [false, false, ...edges.map((e) => e.arc)], runout: end });
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
  return profileWasteTester(board, c)(p);
}

/** `profileWasteContains` with the frame, the section and the span hoisted: for a per-sample hot path (the stock probe). */
export function profileWasteTester(board: Pick<Board, Dimension>, c: ViewCurve): (p: V3) => boolean {
  const f = sectionFrame(board, c);
  const { pts } = profileSection(board, c);
  const span = spanOf(c);
  const axes = { lo: span && span.stopLo ? runoutAxis(board, c, 'lo') : null, hi: span && span.stopHi ? runoutAxis(board, c, 'hi') : null };
  return (p) => {
    const s = f.uOut * (f.uEdge - p[f.iu]);
    const t = f.vIn * (p[f.iv] - f.vFace);
    const run = p[f.k];
    const beyond = span && run < span.lo && axes.lo ? axes.lo : span && run > span.hi && axes.hi ? axes.hi : null;
    if (!beyond) return inPolygonClosed(pts, [s, t]);
    const rho = Math.hypot(run - beyond.run, p[f.iu] - beyond.u);
    return inPolygonClosed(pts, [rho - BEARING, t]);
  };
}

/** The reach of a stop's run-out along the run: BEARING plus the section's widest s (P14). */
export function runoutReach(board: Pick<Board, Dimension>, c: ViewCurve): number {
  return BEARING + Math.max(...profileSection(board, c).pts.map((q) => q[0]));
}

/**
 * The stock probe's air (P3, invariant 16): waste, except ON the kept surface — a point within CURVE_EPS of an ARC edge of the
 * section (in the band, or at (ρ − BEARING, t) beyond a stop) is stock. Straight sides, on the part's faces, stay air.
 */
export function profileAirTester(board: Pick<Board, Dimension>, c: ViewCurve): (p: V3) => boolean {
  const f = sectionFrame(board, c);
  const { pts, arc } = profileSection(board, c);
  const span = spanOf(c);
  const axes = { lo: span && span.stopLo ? runoutAxis(board, c, 'lo') : null, hi: span && span.stopHi ? runoutAxis(board, c, 'hi') : null };
  return (p) => {
    const s = f.uOut * (f.uEdge - p[f.iu]);
    const t = f.vIn * (p[f.iv] - f.vFace);
    const run = p[f.k];
    const beyond = span && run < span.lo && axes.lo ? axes.lo : span && run > span.hi && axes.hi ? axes.hi : null;
    const q: P2 = beyond ? [Math.hypot(run - beyond.run, p[f.iu] - beyond.u) - BEARING, t] : [s, t];
    if (!inPolygonClosed(pts, q)) return false;
    return !pts.some((a, i) => arc[i] && distToSegment(q, a, pts[(i + 1) % pts.length]!) <= CURVE_EPS);
  };
}

/**
 * THE cutter-surface normal of a run-out (profile runs a2, Task 5): the bit's surface beyond a stop is the section revolved
 * about the axis, so at a point with ρ⃗ its (run, across) offset from the axis, s = |ρ⃗| − BEARING and t its depth, the normal
 * is the section arc's own 2D normal (s − sc, t − tc) / R — radial about the arc's centre — lifted as n_s·ρ̂ + n_t·t̂, and
 * oriented OUT OF THE WOOD (into the waste): per arc, the side of its chords the section polygon's interior lies on.
 * `runoutNormal` picks the arc by the point alone; bodyMesh picks it once per face from all its vertices (`arcOf`) — a
 * vertex between two sector rays sits up to a sagitta off the true circle, so no tight chord match would hold.
 */
export function runoutNormal(board: Pick<Board, Dimension>, c: ViewCurve, end: 'lo' | 'hi', p: readonly number[]): V3 | null {
  const r = runoutNormals(board, c);
  const arc = r.arcOf(end, [p]);
  return arc === null ? null : r.normal(end, p, arc);
}

/** `runoutNormal` with the frame, the section's arcs and the axes hoisted: bodyMesh's per-part form. */
export function runoutNormals(board: Pick<Board, Dimension>, c: ViewCurve): {
  /** The section arc whose chord the face (its vertices) lies on, or null: a face on no arc (a chord plane's extension). */
  arcOf(end: 'lo' | 'hi', verts: readonly (readonly number[])[]): number | null;
  normal(end: 'lo' | 'hi', p: readonly number[], arc: number): V3;
} {
  const f = sectionFrame(board, c);
  const { pts } = profileSection(board, c);
  const span = spanOf(c);
  const axes = { lo: span && span.stopLo ? runoutAxis(board, c, 'lo') : null, hi: span && span.stopHi ? runoutAxis(board, c, 'hi') : null };
  const toST = (q: readonly number[]): P2 => [f.uOut * (f.uEdge - q[0]!), f.vIn * (q[1]! - f.vFace)];
  // The section's arcs in (s, t): each one's centre, its chords (the outline's own points, curveOutline's walk) and the sign
  // that turns (q − centre) toward the waste.
  const wind = twiceArea(pts) > 0 ? 1 : -1;
  const arcs: { centre: P2; chords: [P2, P2][]; sign: 1 | -1 }[] = [];
  let at = 0;
  for (const seg of localSegments(board, c)) {
    if (seg.kind === 'line') { at += 1; continue; }
    const n = arcChords(seg, CURVE_TOLERANCE, CURVE_SEGMENTS_MAX);
    const chords: [P2, P2][] = [];
    for (let k = 0; k < n; k += 1) chords.push([pts[at + k]!, pts[(at + k + 1) % pts.length]!]);
    at += n;
    const centre = toST(seg.centre);
    const [a, b] = chords[0]!;
    // The waste lies to the LEFT of a counter-clockwise polygon's edges (runoutPieces' rule).
    const inS = -wind * (b[1] - a[1]), inT = wind * (b[0] - a[0]);
    const sign = ((a[0] + b[0]) / 2 - centre[0]) * inS + ((a[1] + b[1]) / 2 - centre[1]) * inT >= 0 ? 1 : -1;
    arcs.push({ centre, chords, sign });
  }
  const axisOf = (end: 'lo' | 'hi') => {
    const a = axes[end];
    if (!a) throw new Error(`runoutNormal: the curve has no run-out at ${end}`);
    return a;
  };
  const stOf = (end: 'lo' | 'hi', p: readonly number[]): { st: P2; rk: number; ru: number; rho: number } => {
    const a = axisOf(end);
    const rk = p[f.k]! - a.run, ru = p[f.iu]! - a.u;
    const rho = Math.hypot(rk, ru);
    return { st: [rho - BEARING, f.vIn * (p[f.iv]! - f.vFace)], rk, ru, rho };
  };
  return {
    arcOf(end, verts) {
      if (arcs.length === 0) return null;
      const sts = verts.map((p) => stOf(end, p).st);
      let best = 0, bestD = Infinity;
      arcs.forEach((arc, i) => {
        let d = 0;
        for (const q of sts) d = Math.max(d, Math.min(...arc.chords.map(([a, b]) => distToSegment(q, a, b))));
        if (d < bestD) { bestD = d; best = i; }
      });
      // A cap's vertex lies on its chord in the SECTOR's (s, t); read with the true ρ it moves by at most the sector chords'
      // sagitta, (BEARING + max s)(1 − cos h) <= CURVE_TOLERANCE (`sectors`). A face farther off — wood beside a waste piece,
      // on a chord plane's extension (measured >= 9e-3 on the cove and ogee; caps <= 2.3e-3) — is on no arc: its flat normal.
      return bestD <= CURVE_TOLERANCE + CURVE_EPS ? best : null;
    },
    normal(end, p, i) {
      const arc = arcs[i]!;
      const { st, rk, ru, rho } = stOf(end, p);
      const ds = st[0] - arc.centre[0], dt = st[1] - arc.centre[1];
      const l = Math.hypot(ds, dt);
      const ns = (arc.sign * ds) / l, nt = (arc.sign * dt) / l;
      const N: V3 = [0, 0, 0];
      N[f.k] = (ns * rk) / rho;
      N[f.iu] = (ns * ru) / rho;
      N[f.iv] = nt * f.vIn;
      return N;
    },
  };
}
