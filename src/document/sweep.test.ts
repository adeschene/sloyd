import { describe, expect, it } from 'vitest';
import { boardBodies, boardBodiesForTest, bodyVolume, clipConvex, type Body } from './bodies';
import { builtPath, faceOutline, profilePath } from './profilePath';
import { geometryBoard, mirrorProfile, profileAsCurve, profileFaults, reachDepth } from './profiles';
import { profileSection, BEARING } from './runout';
import { mirrorCurveCut, twiceArea, CURVE_TOLERANCE, type P2 } from './curves';
import { mirrorPart } from './frames';
import { createBoard } from './document';
import { chamferCut } from './angleCuts';
import { keptSection, sweptInnerLine, sweptPieces, sweptPlan } from './sweep';
import { apronArch, cornerGap, endToEnd, frontOnly, loop, notchEdge, topCorners } from './sweepFixtures';
import { archCurve } from './curves';
import type { Board, Cut, ProfileCut, ProfileSide } from './types';

/*
 * The INDEPENDENT oracle (ported from the b1 probe, probe.ts.txt:355-416): wood is inside the face outline's chord polygon
 * and deeper than the profile's waste, tau(distance to the path's chords), measured in from the profile's broad face; past a
 * station end (B1) the waste is a2's cutter, tau(distance to the bit's axis − BEARING). tau is read off the profile's own
 * (s, t) section polygon (`profileSection`, a2's). The oracle never reads the construction's planes, skeleton or pieces.
 */
type V3 = [number, number, number];

function tauOf(pts: readonly P2[]): { tau: (s: number) => number; R: number; D: number } {
  const m = pts.length;
  const R = Math.max(...pts.map((p) => p[0]));
  const D = Math.max(...pts.map((p) => p[1]));
  const tau = (s: number): number => {
    if (!(s >= 0 && s <= R)) return 0;
    let best = 0;
    for (let i = 0; i < m; i += 1) {
      const a = pts[i]!, b = pts[(i + 1) % m]!;
      const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
      if (s < lo - 1e-15 || s > hi + 1e-15) continue;
      const t = hi - lo < 1e-15 ? Math.max(a[1], b[1]) : a[1] + ((s - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
      if (t > best) best = t;
    }
    return best;
  };
  return { tau, R, D };
}
const distSeg = (x: number, y: number, a: P2, b: P2): number => {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
};
const outward = (s: ProfileSide): P2 => (s.across === 'length' ? [s.from === 'min' ? -1 : 1, 0] : [0, s.from === 'min' ? -1 : 1]);

interface Waste { segs: [P2, P2][]; tau: (s: number) => number; R: number; D: number; face: 'min' | 'max'; stations: { at: P2; tangent: P2; axis: P2 }[] }
function wasteOf(board: Board, p: ProfileCut): Waste {
  // The BUILT path: the waste the construction cuts (B1 stations carried ε on, fix round 1; faults read profilePath).
  const path = builtPath(board, p);
  if (!path) throw new Error('no path');
  const side: ProfileSide = { across: 'width', from: 'min' };
  const c = profileAsCurve({ ...p, run: { start: { side, through: 'min' }, end: { side: { ...side }, through: 'max' } } });
  const { tau, R, D } = tauOf(profileSection(board, c).pts);
  const stations = (path.ends ?? []).flatMap((e) => (e.kind === 'station'
    ? [{ at: e.at, tangent: e.tangent, axis: [e.at[0] + BEARING * outward(e.side)[0], e.at[1] + BEARING * outward(e.side)[1]] as P2 }] : []));
  return { segs: path.chords.map((ch) => [ch.a, ch.b]), tau, R, D, face: p.face, stations };
}

/** Extra air the oracle knows (Review Focus 5): per column, a raised floor or lowered ceiling. */
type Extra = { column: (x: number, y: number, lo: number, hi: number) => [number, number]; covers: (x0: number, y0: number, x1: number, y1: number) => boolean };

interface Oracle {
  T: number; outline: P2[]; area: number; bb: [number, number, number, number]; column: (x: number, y: number) => [number, number] | null; cells: { x: number; y: number; fine: boolean }[];
  /** The column with every run-out's ρ read as ρ / cos h (h its sectors' half-angle): the most wood a2's INSCRIBED sectors
   *  keep past a station (exact on each ray, ρ_eff = m·(x − axis) / cos h between them). */
  inscribed: (x: number, y: number) => [number, number] | null;
}
const C = 0.5;
function oracleOf(board: Board, wastes: Waste[], extra?: Extra): Oracle {
  const outline = faceOutline(board)!.chords.map((c) => c.a);
  const T = board.thickness;
  const bb: [number, number, number, number] = [Math.min(...outline.map((p) => p[0])), Math.min(...outline.map((p) => p[1])), Math.max(...outline.map((p) => p[0])), Math.max(...outline.map((p) => p[1]))];
  // Point in polygon by crossings, the edges bucketed by rows (the same answer as a scan of every edge).
  const ROW = 0.25;
  const rows = new Map<number, number[]>();
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    for (let r = Math.floor(Math.min(a[1], b[1]) / ROW); r <= Math.floor(Math.max(a[1], b[1]) / ROW); r += 1) { const l = rows.get(r) ?? []; l.push(i); rows.set(r, l); }
  });
  const inside = (x: number, y: number): boolean => {
    let c = false;
    for (const i of rows.get(Math.floor(y / ROW)) ?? []) {
      const a = outline[i]!, b = outline[(i + 1) % outline.length]!;
      if ((a[1] > y) !== (b[1] > y) && x < a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0])) c = !c;
    }
    return c;
  };
  // Per 0.5" cell, the chords of each waste within its reach of the cell (half a diagonal, 0.354, and a margin).
  const nx = Math.ceil((bb[2] - bb[0]) / C) + 1, ny = Math.ceil((bb[3] - bb[1]) / C) + 1;
  const cand = wastes.map((w) => {
    const g: number[][] = [];
    for (let i = 0; i < nx; i += 1) for (let j = 0; j < ny; j += 1) {
      const cx = bb[0] + (i + 0.5) * C, cy = bb[1] + (j + 0.5) * C;
      g.push(w.segs.flatMap(([a, b], k) => (distSeg(cx, cy, a, b) <= w.R + 0.36 ? [k] : [])));
    }
    return g;
  });
  const cellOf = (x: number, y: number) => Math.min(nx - 1, Math.max(0, Math.floor((x - bb[0]) / C))) * ny + Math.min(ny - 1, Math.max(0, Math.floor((y - bb[1]) / C)));
  // The run-out's sectors, from CURVE_TOLERANCE alone: the fewest over a half turn of radius BEARING + reach whose chord
  // sagitta is within it (written here, not read from runout.ts).
  const halfAngle = (w: Waste) => { const r = BEARING + w.R; const n = Math.max(2, Math.ceil(Math.PI / (2 * Math.acos(1 - CURVE_TOLERANCE / r)) - 1e-9)); return Math.PI / (2 * n); };
  const depth = (w: Waste, k: number, x: number, y: number, inscribed = false): number => {
    let beyond = Infinity;
    const stretch = inscribed ? 1 / Math.cos(halfAngle(w)) : 1;
    for (const st of w.stations) {
      if ((x - st.at[0]) * st.tangent[0] + (y - st.at[1]) * st.tangent[1] > 0) beyond = Math.min(beyond, stretch * Math.hypot(x - st.axis[0], y - st.axis[1]) - BEARING);
    }
    if (beyond < Infinity) return w.tau(beyond);
    let d = Infinity;
    for (const s of cand[k]![cellOf(x, y)]!) { const v = distSeg(x, y, w.segs[s]![0], w.segs[s]![1]); if (v < d) d = v; }
    return w.tau(d);
  };
  const columnOf = (x: number, y: number, inscribed: boolean): [number, number] | null => {
    if (!inside(x, y)) return null;
    let lo = 0, hi = T;
    wastes.forEach((w, k) => { const t = depth(w, k, x, y, inscribed); if (w.face === 'max') hi = Math.min(hi, T - t); else lo = Math.max(lo, t); });
    return extra ? extra.column(x, y, lo, hi) : [lo, hi];
  };
  const column = (x: number, y: number) => columnOf(x, y, false);
  const inscribed = (x: number, y: number) => columnOf(x, y, true);
  const cells: Oracle['cells'] = [];
  for (let i = 0; i < nx; i += 1) for (let j = 0; j < ny; j += 1) {
    const x = bb[0] + i * C, y = bb[1] + j * C;
    const nearPath = wastes.some((w, k) => cand[k]![i * ny + j]!.length > 0
      || w.stations.some((st) => Math.hypot(x + C / 2 - st.axis[0], y + C / 2 - st.axis[1]) <= BEARING + w.R + 0.36));
    if (nearPath) cells.push({ x, y, fine: true });
    else if (extra?.covers(x, y, x + C, y + C)) cells.push({ x, y, fine: false });
  }
  return { T, outline, area: twiceArea(outline) / 2, bb, column, inscribed, cells };
}
/** Kept volume: the outline's prism minus the waste, integrated on a jittered grid (h near the paths, 1/40" elsewhere). */
function oracleVolume(o: Oracle, h: number, seed: number): number {
  return o.area * o.T - oracleWaste(o, h, seed);
}
/** The waste the oracle removes (within `region`, when given), integrated on the same jittered grid. */
function oracleWaste(o: Oracle, h: number, seed: number, region?: (x: number, y: number) => boolean): number {
  let rnd = seed;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
  let waste = 0;
  for (const cell of o.cells) {
    const hh = cell.fine ? h : 0.025;
    const n = Math.round(C / hh);
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) {
      const x = cell.x + (i + rand()) * hh, y = cell.y + (j + rand()) * hh;
      if (region && !region(x, y)) continue;
      const col = o.column(x, y);
      if (!col) continue;
      waste += (o.T - Math.max(0, col[1] - col[0])) * hh * hh;
    }
  }
  return waste;
}
function inBodiesFn(bodies: readonly Body[]) {
  const bs = bodies.map((b) => {
    const planes = b.faces.map((f) => ({ n: f.n, d: f.n[0] * f.verts[0]![0] + f.n[1] * f.verts[0]![1] + f.n[2] * f.verts[0]![2] }));
    const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (const f of b.faces) for (const p of f.verts) for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k]!, p[k]!); hi[k] = Math.max(hi[k]!, p[k]!); }
    return { planes, lo, hi };
  });
  return (p: V3) => bs.some((b) => p.every((x, k) => x >= b.lo[k]! - 1e-12 && x <= b.hi[k]! + 1e-12)
    && b.planes.every((h) => h.n[0] * p[0] + h.n[1] * p[1] + h.n[2] * p[2] <= h.d + 1e-12));
}
/** Random points near the paths (half of them in a waste's depth band): how many the bodies and the oracle disagree on. */
function misclassified(bodies: readonly Body[], o: Oracle, wastes: Waste[], N: number, seed = 7): { bad: number; worst: string[] } {
  const inB = inBodiesFn(bodies);
  let rnd = seed;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
  let bad = 0;
  const worst: string[] = [];
  for (let k = 0; k < N; k += 1) {
    const cell = o.cells[Math.floor(rand() * o.cells.length)]!;
    const x = cell.x + rand() * C, y = cell.y + rand() * C;
    let z: number;
    if (rand() < 0.5 || wastes.length === 0) z = rand() * o.T;
    else { const w = wastes[Math.floor(rand() * wastes.length)]!; const t = rand() * Math.min(o.T, 1.2 * w.D); z = w.face === 'max' ? o.T - t : t; }
    const col = o.column(x, y);
    const wood = !!col && z > col[0] && z < col[1];
    const body = inB([x, y, z]);
    // Past a station a2's inscribed sectors keep a little more wood than the true cutter: wood the bodies keep there is
    // right when the inscribed reading keeps it too (Task 6 fix round 1: the stations' move put samples in that band).
    const ins = !wood && body ? o.inscribed(x, y) : null;
    if (ins && z > ins[0] && z < ins[1]) continue;
    if (wood !== body) { bad += 1; if (worst.length < 4) worst.push(`(${x.toFixed(4)}, ${y.toFixed(4)}, ${z.toFixed(4)}) oracle ${wood ? 'wood' : 'air'} col ${col?.map((v) => v.toFixed(5)).join('..')}`); }
  }
  return { bad, worst };
}
const totalVolume = (bodies: readonly Body[]) => bodies.reduce((s, b) => s + bodyVolume(b), 0);

const side = (across: 'length' | 'width', from: 'min' | 'max'): ProfileSide => ({ across, from });
const cases: [string, Board][] = [
  ['roundover 1/4 along the arched apron (End to end)', apronArch],
  ['roundover 1/4 all round the 2" corners', topCorners(2)],
  ['roundover 1/4 all round the 1/2" corners', topCorners(0.5)],
  ['thumbnail 3/4 × 1/4 all round the 2" corners', topCorners(2, loop('p1', 0.75, 'thumbnail'))],
  ['bead 1/4 (quirk 1/16) all round the 2" corners', topCorners(2, loop('p1', 0.25, 'bead'))],
  ['cove 3/8 all round the 2" corners', topCorners(2, loop('p1', 0.375, 'cove'))],
  ['ogee 3/8 all round the 2" corners', topCorners(2, loop('p1', 0.375, 'ogee'))],
  ['ogee 3/8 all round the 2" corners, facing the edge', topCorners(2, { ...loop('p1', 0.375, 'ogee'), facing: 'edge' })],
  ['roundover 3/8 round the half-round notch', notchEdge],
  ['roundover 1/4 End to end on the front, round the 2" corners (B1 run-outs)', frontOnly],
  ['cove 3/8 End to end on the front, round the 2" corners (B1 run-outs)', topCorners(2, endToEnd('p1', side('width', 'min'), 0.375, 'cove'))],
];

describe('the oracle can fail', () => {
  it('with the profile removed, the plain part\'s bodies are misclassified (the probe: 8,848 of 200,000)', () => {
    const board = topCorners(2);
    const w = [wasteOf(board, board.profiles[0]!)];
    const o = oracleOf(board, w);
    const { bad } = misclassified(boardBodies({ ...board, profiles: [] }), o, w, 50000);
    expect(bad).toBeGreaterThan(1000);
  });
});

describe('swept kept wood against the independent oracle (Q3, §4.3)', () => {
  for (const [name, board] of cases) {
    it(name, () => {
      expect(board.profiles.flatMap((p) => profileFaults(board, p))).toEqual([]);
      expect(geometryBoard(board).profiles.length).toBe(board.profiles.length);   // every profile here is swept
      const wastes = board.profiles.map((p) => wasteOf(board, p));
      const o = oracleOf(board, wastes);
      const bodies = boardBodies(board);
      const v = totalVolume(bodies);
      const ov1 = oracleVolume(o, 0.004, 1), ov2 = oracleVolume(o, 0.004, 99);
      const ov = (ov1 + ov2) / 2;
      const waste = o.area * o.T - ov;
      const err = Math.abs(v - ov);
      expect(err / waste, `volume ${v} oracle ${ov} (seeds ${ov1}, ${ov2}), relative to the waste ${waste}`).toBeLessThanOrEqual(1e-3);
      const stations = wastes.flatMap((w) => w.stations);
      if (stations.length === 0) expect(err, `volume ${v} oracle ${ov} (seeds ${ov1}, ${ov2}) waste ${waste}`).toBeLessThanOrEqual(1e-3);
      else {
        // Amended (Task 3, for the controller's ruling): past a station the wood is a2's SHIPPED run-out, the cutter's
        // inscribed sectors at CURVE_TOLERANCE, which keep a little more wood than the true cutter the oracle revolves
        // (measured on the 3/8" cove: +6.0e-4 in³ per run-out, so 1.42e-3 in all against the brief's 1e-3; the probe's
        // own 6b: 1.40e-3). So the brief's 1e-3 bound is held where the SWEEP builds the wood (before the stations), and
        // past them the bodies keep more than the true cutter by no more than the sectors' sagitta over the cutter's
        // surface (π (BEARING + reach) · section length · CURVE_TOLERANCE per run-out).
        // Here every station's plane is one line (y = the corner radius), as on frontOnly.
        // (Fix round 1: the stations sit ε past the corners' tangent points, read off each end's own chord: equal to 1e-12.)
        expect(stations.every((st) => st.tangent[0] === 0 && st.tangent[1] === 1 && Math.abs(st.at[1] - stations[0]!.at[1]) <= 1e-12)).toBe(true);
        const yS = stations[0]!.at[1];
        const before = (_x: number, y: number) => y < yS;
        const past = (_x: number, y: number) => y >= yS;
        const plain = boardBodies(createBoard({ length: board.length, width: board.width, thickness: board.thickness, curves: board.curves }));
        const volIn = (bs: readonly Body[], keep: 'before' | 'past') => bs.reduce((s2, x) => {
          const f = clipConvex(x.faces, keep === 'before' ? { n: [0, -1, 0], d: yS } : { n: [0, 1, 0], d: -yS });
          return s2 + (f.length >= 4 ? bodyVolume({ box: null, faces: f }) : 0);
        }, 0);
        // A region's kept volume by the oracle: the outline's prism there (the curves-only part) minus the oracle's waste.
        const oracleIn = (keep: 'before' | 'past', r: (x: number, y: number) => boolean) =>
          volIn(plain, keep) - (oracleWaste(o, 0.004, 1, r) + oracleWaste(o, 0.004, 99, r)) / 2;
        expect(Math.abs(volIn(bodies, 'before') - oracleIn('before', before)), 'before the stations').toBeLessThanOrEqual(1e-3);
        const excess = volIn(bodies, 'past') - oracleIn('past', past);
        const w0 = wastes[0]!;
        const sec = profileSection(board, profileAsCurve({ ...board.profiles[0]!, run: { start: { side: side('width', 'min'), through: 'min' }, end: { side: side('width', 'min'), through: 'max' } } })).pts;
        const sectionLength = sec.reduce((s2, a, i) => { const b = sec[(i + 1) % sec.length]!; return a[0] === 0 && b[0] === 0 || a[1] === 0 && b[1] === 0 ? s2 : s2 + Math.hypot(b[0] - a[0], b[1] - a[1]); }, 0);
        const bound = stations.length * Math.PI * (BEARING + w0.R) * sectionLength * CURVE_TOLERANCE;
        expect(excess, 'past the stations: the inscribed cutter keeps more wood').toBeGreaterThan(-1e-4);
        expect(excess, `past the stations, bound ${bound}`).toBeLessThanOrEqual(bound);
      }
      const { bad, worst } = misclassified(bodies, o, wastes, 50000);
      expect(bad, worst.join(' ')).toBe(0);
    }, 120_000);
  }
});

describe('every swept body is convex', () => {
  for (const [name, board] of cases) {
    it(name, () => {
      for (const b of boardBodies(board)) {
        for (const f of b.faces) {
          const d = f.n[0] * f.verts[0]![0] + f.n[1] * f.verts[0]![1] + f.n[2] * f.verts[0]![2];
          for (const p of f.verts) expect(Math.abs(f.n[0] * p[0] + f.n[1] * p[1] + f.n[2] * p[2] - d)).toBeLessThanOrEqual(1e-9);
          for (const g of b.faces) for (const p of g.verts) expect(f.n[0] * p[0] + f.n[1] * p[1] + f.n[2] * p[2] - d).toBeLessThanOrEqual(1e-9);
        }
      }
    });
  }
});

describe('the notch regression (skeleton edge events, the probe: +2.9% without them)', () => {
  const p = notchEdge.profiles[0]!;
  const wastes = [wasteOf(notchEdge, p)];
  const o = oracleOf(notchEdge, wastes);
  const ov = (oracleVolume(o, 0.004, 1) + oracleVolume(o, 0.004, 99)) / 2;
  const waste = o.area * o.T - ov;
  it('with events off the volume is off by more than 1% of the waste', () => {
    const v = totalVolume(boardBodiesForTest(notchEdge, { events: false }));
    expect(Math.abs(v - ov) / waste).toBeGreaterThan(0.01);
  }, 60_000);
  it('with events on every skeleton face has area, and faces + rest tile the outline', () => {
    const view = geometryBoard(notchEdge);
    const plan = sweptPlan(view, view.profiles[0]!)!;
    expect(plan.skeleton.events).toBeGreaterThan(0);
    const area = (q: P2[]) => twiceArea(q) / 2;
    for (const f of plan.faces) expect(area(f)).toBeGreaterThan(1e-12);
    const outline = faceOutline(notchEdge)!.chords.map((c) => c.a);
    expect(Math.abs(plan.faces.reduce((s, f) => s + area(f), 0) + area(plan.rest) - area(outline))).toBeLessThanOrEqual(1e-9);
  });
});

describe('Review Focus 1: a swept part mirrored is the mirror image of the original', () => {
  const chiral: Board = createBoard({ length: 30, width: 5, thickness: 0.75,
    curves: [{ id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 2, span: 20, rise: 1.25 }) }],
    profiles: [{ ...endToEnd('p1', side('width', 'min'), 0.375, 'ogee') }] });
  const through = (b: Board): Board => ({ ...b, curves: b.curves.map((c) => mirrorCurveCut(c, 'thickness')), profiles: b.profiles.map((q) => mirrorProfile(q, 'thickness')) });
  const parts: [string, Board, (b: Board) => Board, (p: V3, b: Board) => V3][] = [
    ['apronArch along its length (mirrorPart)', apronArch, mirrorPart, (p, b) => [b.length - p[0], p[1], p[2]]],
    ['apronArch through its thickness', apronArch, through, (p, b) => [p[0], p[1], b.thickness - p[2]]],
    ['a chiral arched ogee along its length (mirrorPart)', chiral, mirrorPart, (p, b) => [b.length - p[0], p[1], p[2]]],
    ['a chiral arched ogee through its thickness', chiral, through, (p, b) => [p[0], p[1], b.thickness - p[2]]],
  ];
  for (const [name, board, mirror, reflect] of parts) {
    it(name, () => {
      const m = mirror(board);
      expect(m.profiles.flatMap((q) => profileFaults(m, q))).toEqual([]);
      const ob = boardBodies(board), mb = boardBodies(m);
      expect(geometryBoard(m).profiles.length).toBe(1);
      expect(Math.abs(totalVolume(mb) - totalVolume(ob))).toBeLessThanOrEqual(1e-9);
      const inO = inBodiesFn(ob), inM = inBodiesFn(mb);
      let rnd = 3;
      const rand = () => { rnd = (rnd * 1103515245 + 12345) % 2147483648; return rnd / 2147483648; };
      let bad = 0;
      for (let k = 0; k < 100000; k += 1) {
        // Near the profiled edge (y < 3, within the arch's reach), half in the top 1/2".
        const p: V3 = [rand() * board.length, rand() * 3, rand() < 0.5 ? rand() * board.thickness : board.thickness - rand() * 0.5];
        const q = reflect(p, board);
        if (inM(p) !== inO(q)) bad += 1;
      }
      expect(bad).toBe(0);
    });
  }
});

describe('B1a: four End to end profiles mitred at the corner arcs\' middles build exactly the loop\'s wood', () => {
  it('topCorners(2), roundover 1/4', () => {
    const four = topCorners(2, endToEnd('f', side('width', 'min')));
    const board: Board = { ...four, profiles: [four.profiles[0]!, endToEnd('r', side('length', 'max')), endToEnd('b', side('width', 'max')), endToEnd('l', side('length', 'min'))] };
    expect(board.profiles.flatMap((p) => profileFaults(board, p))).toEqual([]);
    for (const p of board.profiles) expect(profilePath(board, p)!.ends!.map((e) => e.kind)).toEqual(['mitre', 'mitre']);
    const ref = topCorners(2);
    const v = totalVolume(boardBodies(board)), vr = totalVolume(boardBodies(ref));
    expect(Math.abs(v - vr)).toBeLessThanOrEqual(1e-8);
    const wastes = [wasteOf(ref, ref.profiles[0]!)];
    const { bad, worst } = misclassified(boardBodies(board), oracleOf(ref, wastes), wastes, 50000);
    expect(bad, worst.join(' ')).toBe(0);
  }, 60_000);
});

describe('Review Focus 4: All round on both faces', () => {
  it('topCorners(2): a loop on the top and a loop on the bottom, against an oracle taking both wastes', () => {
    const top = topCorners(2);
    const board: Board = { ...top, profiles: [loop('t'), loop('m', 0.25, 'roundover', 'min')] };
    expect(board.profiles.flatMap((p) => profileFaults(board, p))).toEqual([]);
    const wastes = board.profiles.map((p) => wasteOf(board, p));
    const o = oracleOf(board, wastes);
    const bodies = boardBodies(board);
    const ov = (oracleVolume(o, 0.004, 1) + oracleVolume(o, 0.004, 99)) / 2;
    const waste = o.area * o.T - ov;
    const err = Math.abs(totalVolume(bodies) - ov);
    expect(err).toBeLessThanOrEqual(1e-3);
    expect(err / waste).toBeLessThanOrEqual(1e-3);
    const { bad, worst } = misclassified(bodies, o, wastes, 50000);
    expect(bad, worst.join(' ')).toBe(0);
  }, 120_000);
});

const dado = (id: string, across: 'length' | 'width', from: 'min' | 'max', offset: number, width: number, depth: number): Cut =>
  ({ id, face: 'thickness', from, across, offset, width, depth, stopMin: 0, stopMax: 0 });
describe('Review Focus 5: a swept profile on cells that cuts and angle cuts already shaped', () => {
  it('topCorners(2) loop + a 1/4"-deep dado across the width at 18" + a 45° chamfer on the bottom long edge', () => {
    const base = topCorners(2);
    const board: Board = { ...base,
      cuts: [dado('d', 'width', 'max', 17.625, 0.75, 0.25)],
      angleCuts: [{ id: 'ch', ...chamferCut({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'min', legFace: 0.25, legAlong: 0.25 }, base) }] };
    const wastes = [wasteOf(board, board.profiles[0]!)];
    const extra: Extra = {
      column: (x, y, lo, hi) => [Math.max(lo, 0.25 - y), x > 17.625 && x < 18.375 ? Math.min(hi, 0.5) : hi],
      covers: (x0, y0, x1) => (x1 > 17.625 && x0 < 18.375) || y0 < 0.25,
    };
    const o = oracleOf(board, wastes, extra);
    const bodies = boardBodies(board);
    const ov = (oracleVolume(o, 0.004, 1) + oracleVolume(o, 0.004, 99)) / 2;
    const waste = o.area * o.T - ov;
    const err = Math.abs(totalVolume(bodies) - ov);
    expect(err, `volume ${totalVolume(bodies)} oracle ${ov}`).toBeLessThanOrEqual(1e-3);
    expect(err / waste).toBeLessThanOrEqual(1e-3);
    const { bad, worst } = misclassified(bodies, o, wastes, 50000);
    expect(bad, worst.join(' ')).toBe(0);
  }, 120_000);
  it('a cell wholly in a corner\'s waste, out of every band\'s reach, is dropped (not kept whole)', () => {
    const base = topCorners(2);
    const board: Board = { ...base, cuts: [dado('a', 'width', 'min', 0.5, 0.5, 0.25), dado('b', 'length', 'min', 0.5, 0.5, 0.25)] };
    // Such a cell exists before the sweep: within [0, 0.5]² of the corner, well outside the 2" arc's band.
    const cells = boardBodies({ ...board, curves: [], profiles: [] });
    expect(cells.some((b) => b.faces.every((f) => f.verts.every((p) => p[0] <= 0.5 && p[1] <= 0.5)))).toBe(true);
    const wastes = [wasteOf(board, board.profiles[0]!)];
    const strip = (x: number, y: number) => (x > 0.5 && x < 1) || (y > 0.5 && y < 1);
    const extra: Extra = { column: (x, y, lo, hi) => [strip(x, y) ? Math.max(lo, 0.25) : lo, hi], covers: (x0, y0) => x0 < 1 || y0 < 1 };
    const o = oracleOf(board, wastes, extra);
    const bodies = boardBodies(board);
    expect(bodies.some((b) => b.faces.every((f) => f.verts.every((p) => p[0] <= 0.5 && p[1] <= 0.5)))).toBe(false);
    const ov = (oracleVolume(o, 0.004, 1) + oracleVolume(o, 0.004, 99)) / 2;
    expect(Math.abs(totalVolume(bodies) - ov)).toBeLessThanOrEqual(1e-3);
    const { bad, worst } = misclassified(bodies, o, wastes, 50000);
    expect(bad, worst.join(' ')).toBe(0);
  }, 120_000);
});

describe('a faulted swept profile builds nothing (Q6)', () => {
  it('a 3/4" roundover all round 1/2" corners (too-tight): the part\'s bodies are the profile-free part\'s', () => {
    const board = topCorners(0.5, loop('p1', 0.75));
    expect(profileFaults(board, board.profiles[0]!).map((f) => f.kind)).toContain('too-tight');
    expect(boardBodies(board)).toEqual(boardBodies({ ...board, profiles: [] }));
  });
});

describe('an END chord the offset swallows is too-tight, never a throw (pathSkeleton null)', () => {
  it('a half-round notch 0.2" from the end under a 3/8" roundover: too-tight, and it builds as a2 did (I1: it runs straight)', () => {
    const board = createBoard({ length: 30, width: 5, thickness: 0.75,
      curves: [{ id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 0.2, span: 2, rise: 1 }) }],
      profiles: [endToEnd('p1', side('width', 'min'), 0.375)] });
    // No outline arc is under the reach or the bearing: the skeleton alone decides it.
    expect(profilePath(board, board.profiles[0]!)!.chords.every((c) => !c.arc || c.arc.r >= 0.375)).toBe(true);
    expect(profileFaults(board, board.profiles[0]!)).toEqual([{ kind: 'too-tight' }]);
    // Final review I1 (the user's ruling, "Fall back to straight"): its straight form is clean, so it is built as a2 built
    // it — chunk 1's prism, the profile as its plain curve — rather than nothing.
    expect(boardBodies(board)).not.toEqual(boardBodies({ ...board, profiles: [] }));
    expect(boardBodies(board)).toEqual(boardBodies({ ...board, curves: [...board.curves, profileAsCurve(board.profiles[0]!)], profiles: [] }));
  });
});

// Task 6 fix round 1 (M2): `skeletonFits` memoises per PART on exactly what `pathSkeleton` reads. Two swept profiles of one
// part with the same reach and both open, one whose end chord the offset swallows and one that fits, must each keep their
// own verdict whichever is judged first (a key missing the chords, or truncated, would hand one the other's).
describe('the skeleton memo keeps two same-reach paths of one part apart (M2)', () => {
  const notchAt = (id: string, sd: 'min' | 'max', start: number) =>
    ({ id, ...archCurve({ through: 'thickness', along: 'length', side: sd, from: 'min', start, span: 2, rise: 1 }) });
  const board = createBoard({ length: 30, width: 5, thickness: 0.75,
    curves: [notchAt('c1', 'min', 0.2), notchAt('c2', 'max', 14)],
    profiles: [endToEnd('tight', side('width', 'min'), 0.375), endToEnd('fits', side('width', 'max'), 0.375)] });
  const [tight, fits] = board.profiles as [ProfileCut, ProfileCut];
  it('the fixture is what it claims: both swept, the same reach, both open', () => {
    expect(profilePath(board, tight)!.loop).toBe(false);
    expect(profilePath(board, fits)!.loop).toBe(false);
    expect(keptSection(board, tight).reach).toBe(keptSection(board, fits).reach);
  });
  it('judged in either order on one part object: the swallowed one too-tight, the other clean', () => {
    const a = { ...board };
    expect(profileFaults(a, tight)).toEqual([{ kind: 'too-tight' }]);
    expect(profileFaults(a, fits)).toEqual([]);
    const b = { ...board };
    expect(profileFaults(b, fits)).toEqual([]);
    expect(profileFaults(b, tight)).toEqual([{ kind: 'too-tight' }]);
  });
});

// Task 6 fix round 1 (I2): where a run's two ends' bands overlap (two stops 0.1" either side of one sharp corner) the inner
// line is the loop between its own crossing — no tail runs on into the other end's band.
describe('the inner line of a run whose two ends\' bands overlap (I2)', () => {
  it('cornerGap(0.1, 0.1): closed at the crossing (29.75, 0.25), and it never crosses itself', () => {
    const b = cornerGap(0.1, 0.1);
    const line = sweptInnerLine(geometryBoard(b), b.profiles[0]!)!;
    expect(line.closed).toBe(true);
    expect(line.pts[0]![0]).toBeCloseTo(29.75, 12);
    expect(line.pts[0]![1]).toBeCloseTo(0.25, 12);
    const n = line.pts.length;
    const cross = (p: P2, q: P2, r: P2, t: P2) => {
      const o = (a: P2, b2: P2, c: P2) => Math.sign((b2[0] - a[0]) * (c[1] - a[1]) - (b2[1] - a[1]) * (c[0] - a[0]));
      return o(p, q, r) * o(p, q, t) < 0 && o(r, t, p) * o(r, t, q) < 0;
    };
    for (let i = 0; i < n; i += 1) for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      expect(cross(line.pts[i]!, line.pts[(i + 1) % n]!, line.pts[j]!, line.pts[(j + 1) % n]!), `${i} ${j}`).toBe(false);
    }
  });
});

describe('the tag contract (Q5)', () => {
  for (const face of ['max', 'min'] as const) {
    it(`face ${face}: section faces carry profileEdge and their path chord's sweep index; chord faces their curve`, () => {
      const board = topCorners(2, loop('p1', 0.375, 'cove', face));
      const path = profilePath(board, board.profiles[0]!)!;
      const { reach } = keptSection(board, board.profiles[0]!);
      const bodies = boardBodies(board);
      const swept = bodies.flatMap((b) => b.faces).filter((f) => f.sweep !== undefined);
      expect(swept.length).toBeGreaterThan(0);
      for (const f of swept) {
        expect(f.profileEdge!.startsWith('p1:')).toBe(true);
        const ch = path.chords[f.sweep!]!;
        // Every vertex of a band face lies within the reach of its own chord's line (the band it is in).
        const d = [ch.b[0] - ch.a[0], ch.b[1] - ch.a[1]], l = Math.hypot(d[0]!, d[1]!);
        for (const p of f.verts) expect(Math.abs(d[0]! * (p[1] - ch.a[1]) - d[1]! * (p[0] - ch.a[0])) / l).toBeLessThanOrEqual(reach + 1e-6);
      }
      const corner = bodies.flatMap((b) => b.faces).filter((f) => f.curve !== undefined);
      expect(corner.length).toBeGreaterThan(0);
      for (const f of corner) expect(['cminmin', 'cminmax', 'cmaxmin', 'cmaxmax']).toContain(f.curve);
      expect(bodies.flatMap((b) => b.faces).every((f) => f.runout === undefined)).toBe(true);
    });
  }
  it('B1: the run-out faces carry the profile id, its end and profileEdge in the section\'s own index space', () => {
    const ro = boardBodies(frontOnly).flatMap((b) => b.faces).filter((f) => f.runout !== undefined);
    expect(ro.length).toBeGreaterThan(0);
    expect(ro.filter((f) => f.profileEdge !== undefined).every((f) => f.profileEdge!.startsWith('p1:'))).toBe(true);
  });
  it('the pieces are memoised per view and frozen', () => {
    const view = geometryBoard(topCorners(2));
    const a = sweptPieces(view, view.profiles[0]!);
    expect(sweptPieces(view, view.profiles[0]!)).toBe(a);
    expect(Object.isFrozen(a) && Object.isFrozen(a[0]!.planes)).toBe(true);
  });
});

describe('Q3: the first swept profile starts from the curve-free cells; the outline\'s curves are not applied again', () => {
  // The probe: starting after the arch's 16 slices multiplied them into 160 bodies (49 ms against 11); from the curve-free
  // cell, 34. The same counts here: one body per band piece the cell meets, one per rest piece.
  it('the arched apron builds the probe\'s 34 bodies, the notch 34, the 2" top 53', () => {
    expect(boardBodies(apronArch).length).toBe(34);
    expect(boardBodies(notchEdge).length).toBe(34);
    expect(boardBodies(topCorners(2)).length).toBe(53);
  });
  it('an inner loop (a through cut-out, R8) is not on the outline and is still applied', () => {
    const hole = { id: 'in', through: 'thickness' as const, uFrom: 'min' as const, vFrom: 'min' as const, start: [10, 5] as [number, number],
      segments: [{ type: 'line' as const, to: [14, 5] as [number, number] }, { type: 'line' as const, to: [14, 9] as [number, number] }, { type: 'line' as const, to: [10, 9] as [number, number] }, { type: 'line' as const, to: [10, 5] as [number, number] }] };
    const base = topCorners(2);
    const board: Board = { ...base, curves: [...base.curves, hole] };
    expect(profileFaults(board, board.profiles[0]!)).toEqual([]);
    const v = totalVolume(boardBodies(board));
    expect(Math.abs(totalVolume(boardBodies(base)) - v - 16 * board.thickness)).toBeLessThanOrEqual(1e-9);
  });
});

describe('B1 station ends and the rest polygon (the plan pieces)', () => {
  it('no band face reaches past its station plane (the band stops there; past it a2\'s run-out)', () => {
    const view = geometryBoard(frontOnly);
    const plan = sweptPlan(view, view.profiles[0]!)!;
    expect(plan.chain.stations.length).toBe(2);
    for (const st of plan.chain.stations) for (const f of plan.faces) for (const q of f) expect(st.n[0] * q[0] + st.n[1] * q[1] + st.d).toBeGreaterThanOrEqual(-1e-9);
    const bodies = boardBodies(frontOnly);
    // The station is ε past the corner's tangent point (Task 6 fix round 1): 2 · reach · tan(π/96), written from the 2" corner's
    // 12 chords.
    const yS = 2 + 2 * 0.25 * Math.tan(Math.PI / 96);
    for (const f of bodies.flatMap((b) => b.faces).filter((x) => x.sweep !== undefined)) for (const p of f.verts) expect(p[1]).toBeLessThanOrEqual(yS + 1e-9);
  });
  for (const [name, board] of [['the arched apron', apronArch], ['the notch', notchEdge], ['the front End to end', frontOnly]] as const) {
    it(`${name}: the rest is a simple polygon with no spike (a through ray along the end face doubles back)`, () => {
      const view = geometryBoard(board);
      const rest = sweptPlan(view, view.profiles[0]!)!.rest;
      rest.forEach((b, i) => {
        const a = rest[(i - 1 + rest.length) % rest.length]!, c = rest[(i + 1) % rest.length]!;
        const ab: P2 = [b[0] - a[0], b[1] - a[1]], bc: P2 = [c[0] - b[0], c[1] - b[1]];
        const turnsBack = Math.abs(ab[0] * bc[1] - ab[1] * bc[0]) <= 1e-9 * Math.hypot(...ab) * Math.hypot(...bc) && ab[0] * bc[0] + ab[1] * bc[1] < 0;
        expect(turnsBack, `vertex ${i}`).toBe(false);
      });
      expect(twiceArea(rest)).toBeGreaterThan(0);
    });
  }
  it('B1a with an ODD chord count (3/4" corners, 7 chords): the mitre splits the middle chord, and the wood is the loop\'s', () => {
    const one = topCorners(0.75, endToEnd('f', side('width', 'min')));
    const board: Board = { ...one, profiles: [one.profiles[0]!, endToEnd('r', side('length', 'max')), endToEnd('b', side('width', 'max')), endToEnd('l', side('length', 'min'))] };
    expect(board.profiles.flatMap((p) => profileFaults(board, p))).toEqual([]);
    const path = profilePath(board, board.profiles[0]!)!;
    expect(path.cover[0]!.t0).toBeGreaterThan(0);   // the split is mid-chord
    const ref = topCorners(0.75);
    expect(Math.abs(totalVolume(boardBodies(board)) - totalVolume(boardBodies(ref)))).toBeLessThanOrEqual(1e-8);
    const wastes = [wasteOf(ref, ref.profiles[0]!)];
    const { bad, worst } = misclassified(boardBodies(board), oracleOf(ref, wastes), wastes, 50000);
    expect(bad, worst.join(' ')).toBe(0);
  }, 60_000);
});

// Task 3 review minor 2 (carried to Task 5): reach has two homes — profileFaults judges the skeleton with `reachDepth`, the
// build with `keptSection`'s reach. If they drifted, a fault-free swept profile could get no plan and build nothing with no
// fault (`builtSwept`'s filter would hide it). Every fault-free swept profile here has pieces, and the two reaches agree.
describe('a fault-free swept profile always builds (one reach)', () => {
  // reachDepth is exported for this pin only (the fault decider's own reader).
  const kinds: [ProfileCut['kind'], number][] = [['roundover', 0.25], ['cove', 0.375], ['ogee', 0.375], ['bead', 0.25], ['thumbnail', 0.75]];
  const boards: Board[] = [...cases.map(([, b]) => b), ...kinds.flatMap(([k, s]) => (['face', 'edge'] as const).map((facing) =>
    topCorners(2, { ...loop('p1', s, k), facing })))];
  it.each(boards.map((b, i) => [i, b] as const))('board %i', (_i, board) => {
    const view = geometryBoard(board);
    for (const p of view.profiles) {
      if (profileFaults(board, board.profiles.find((x) => x.id === p.id)!).length > 0) continue;
      expect(sweptPieces(view, p).length).toBeGreaterThan(0);
      const { reach, depth } = keptSection(view, p);
      expect([reach, depth]).toEqual(reachDepth(p));
    }
  });
});

// ── Joinery features chunk 2 (spec §3.3, P4): sweptWasteMeets' footprint test for a box.
import { sweptWasteMeets, sweptWasteMeetsBox } from './sweep';

describe('sweptWasteMeetsBox (conservative, closed; P4)', () => {
  it('agrees with sweptWasteMeets for a thin box at a side-entry hole\'s footprint', () => {
    const view = geometryBoard(createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [loop('w1')] }));
    const p = view.profiles[0]!;
    let hits = 0;
    let misses = 0;
    for (const r of [1 / 16, 0.125]) {
      for (const depth of [0.25, 0.5, 1]) {
        for (const x of [0.2, 0.5, 0.75, 2, 15]) {
          for (const z of [0.1, 0.3, 0.5, 0.6, 0.7]) {
            // Into the width-min face (dir +1), and into the length-min end.
            const holes = [
              { axis: 'width' as const, centre: [x + 3, 0, z] as V3, radius: r, depth, dir: 1 as const },
              { axis: 'length' as const, centre: [0, x + 3, z] as V3, radius: r, depth, dir: 1 as const },
              { axis: 'width' as const, centre: [x + 3, 10, z] as V3, radius: r, depth, dir: -1 as const },
            ];
            for (const h of holes) {
              const ax = ['length', 'width', 'thickness'].indexOf(h.axis);
              const a0 = h.centre[ax]!, a1 = a0 + h.dir * h.depth;
              const span = (k: number): [number, number] => (k === ax ? [Math.min(a0, a1), Math.max(a0, a1)] : [h.centre[k]! - r, h.centre[k]! + r]);
              const want = sweptWasteMeets(view, p, h);
              expect(sweptWasteMeetsBox(view, p, { length: span(0), width: span(1), thickness: span(2) })).toBe(want);
              if (want) hits += 1; else misses += 1;
            }
          }
        }
      }
    }
    expect(hits).toBeGreaterThan(20);
    expect(misses).toBeGreaterThan(20);
  });
  it('a box clear of an ogee loop by its reach plus 1/16" is not judged into it', () => {
    const view = geometryBoard(createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [loop('o1', 0.5, 'ogee')] }));
    const p = view.profiles[0]!;
    const { reach } = keptSection(view, p);
    expect(reach).toBeGreaterThan(0.4);
    const box = (w0: number) => ({ length: [10, 20] as [number, number], width: [w0, 5] as [number, number], thickness: [0, 0.75] as [number, number] });
    expect(sweptWasteMeetsBox(view, p, box(reach + 1 / 16))).toBe(false);
    expect(sweptWasteMeetsBox(view, p, box(reach))).toBe(true);              // closed: at the reach it meets
    expect(sweptWasteMeetsBox(view, p, box(reach - 1 / 16))).toBe(true);
    // Below the profile's depth (in from its max face), nothing.
    expect(sweptWasteMeetsBox(view, p, { ...box(0), thickness: [0, 0.75 - keptSection(view, p).depth - 1 / 16] })).toBe(false);
  });
});
