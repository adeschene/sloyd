import { vi } from 'vitest';
import { axisFrame, partGeometry } from '../document/document';
import type { Board, BodyFace, V3 } from '../document/document';
import type { P2 } from '../document/curves';
import { geometryBoard, profileFaults } from '../document/profiles';
import { BEARING, runoutNormals, stopAxis, stopRunoutNormals, type StopFrame } from '../document/runout';
import { oneSideCurve, sweptNormals, sweptStops } from '../document/sweep';
import { builtPath } from '../document/profilePath';
import { frontAndEnds, stationFrontToBack, stopOnArch, stopOnCorner } from '../document/sweepFixtures';
import { bodyMesh } from './grainTiling';

// Counts stopRunoutNormals' builds (the real function runs): a2 fix F1's lesson, a per-call rebuild failed the perf guard.
const calls = vi.hoisted(() => ({ n: 0 }));
vi.mock('../document/runout', async (orig) => {
  const actual = await orig<typeof import('../document/runout')>();
  return { ...actual, stopRunoutNormals: (...a: Parameters<typeof actual.stopRunoutNormals>) => { calls.n += 1; return actual.stopRunoutNormals(...a); } };
});

/*
 * Profile runs b2, Task 6: a stop's run-out (§4.2 (b2), Q12) is the section revolved about the bit's axis BEARING outside the
 * stop's MODEL chord (`stopAxis`), so its surface normal at a point with ρ⃗ its plan offset from that axis is the section arc's
 * own (s, t) normal — s = |ρ⃗| − BEARING, t in from the broad face — lifted as n_s·ρ̂ + n_t·t̂. Every expectation below is
 * written from the fixture's own numbers (a 1/4" roundover: its arc's centre 1/4" in from the edge and 1/4" down from the
 * face) and the axis, never from the pieces or the normals' own code.
 */
const R = 0.25;
const T = 0.75;
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const dot2 = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]!;
/** The roundover's outward normal (face max: t grows downward) revolved about a plan axis: ρ̂ is the plan direction of s. */
function revolved(q: readonly number[], axis: P2): V3 {
  const rx = q[0]! - axis[0], ry = q[1]! - axis[1];
  const rho = Math.hypot(rx, ry);
  const s = rho - BEARING, t = T - q[2]!;
  const ds = s - R, dt = t - R;
  const l = Math.hypot(ds, dt);
  return [(ds / l) * (rx / rho), (ds / l) * (ry / rho), -(dt / l)];
}
/** The roundover's outward normal on a plan band whose inward direction is `inward`, at (s, t). */
function banded(s: number, t: number, inward: P2): V3 {
  const ds = s - R, dt = t - R;
  const l = Math.hypot(ds, dt);
  return [(ds / l) * inward[0], (ds / l) * inward[1], -(dt / l)];
}
const faces = (b: Board) => partGeometry(b).bodies.flatMap((x) => x.faces);
const runoutFaces = (b: Board) => faces(b).filter((f) => f.runout !== undefined && f.profileEdge?.startsWith('p1:'));
const nearAxis = (f: BodyFace, axis: P2) => f.verts.every((v) => Math.hypot(v[0]! - axis[0], v[1]! - axis[1]) <= BEARING + R + 1e-6);

/** Mesh normals by Float32 position, for a flat part with no turn (world X, Y, Z = length, thickness, width, about the centre). */
function meshNormals(board: Board): { at: (v: readonly number[]) => V3[]; all: { p: V3; n: V3 }[] } {
  expect(axisFrame(board).map((a) => [a.dim, a.reversed])).toEqual([['length', false], ['thickness', false], ['width', false]]);
  const g = partGeometry(board);
  const by = new Map<string, V3[]>();
  const all: { p: V3; n: V3 }[] = [];
  for (const body of g.bodies) {
    const m = bodyMesh(board, body, g.holes, g.bodies);
    for (let i = 0; i < m.positions.length / 3; i += 1) {
      const P = [m.positions[3 * i]!, m.positions[3 * i + 1]!, m.positions[3 * i + 2]!];
      const n: V3 = [m.normals![3 * i]!, m.normals![3 * i + 2]!, m.normals![3 * i + 1]!];
      const key = P.join(',');
      by.set(key, [...(by.get(key) ?? []), n]);
      all.push({ p: [P[0]! + board.length / 2, P[2]! + board.width / 2, P[1]! + board.thickness / 2], n });
    }
  }
  const keyOf = (v: readonly number[]) => [Math.fround(v[0]! - board.length / 2), Math.fround(v[2]! - board.thickness / 2), Math.fround(v[1]! - board.width / 2)].join(',');
  return { at: (v) => by.get(keyOf(v)) ?? [], all };
}

describe('stopRunoutNormals: a stop\'s run-out normal is the section revolved about its own axis (profile runs b2)', () => {
  for (const [name, board] of [['stopOnCorner() (a stop on a corner arc, one on the straight front)', stopOnCorner()], ['stopOnArch (both stops on the concave arch)', stopOnArch]] as const) {
    it(`${name}: every run-out vertex inside the section has the revolved roundover's normal (1e-9)`, () => {
      const v = geometryBoard(board);
      const p = v.profiles[0]!;
      const frames = sweptStops(v, p);
      expect(frames).toHaveLength(2);
      let n = 0;
      for (const fr of frames) {
        const axis = stopAxis(fr);
        const normals = stopRunoutNormals(v, oneSideCurve(p), fr);
        let mine = 0;
        for (const f of runoutFaces(board)) {
          if (f.runout !== fr.end || !nearAxis(f, axis)) continue;
          const arc = normals.arcOf(fr.end, f.verts);
          if (arc === null) continue;
          for (const q of f.verts) {
            const s = Math.hypot(q[0]! - axis[0], q[1]! - axis[1]) - BEARING, t = T - q[2]!;
            if (!(s > 1e-4 && s < R - 1e-4 && t > 1e-4 && t < R - 1e-4)) continue;
            const got = normals.normal(fr.end, q, arc);
            const sign = got[0] * f.n[0] + got[1] * f.n[1] + got[2] * f.n[2] < 0 ? -1 : 1;
            expect(dist(got.map((x) => sign * x), revolved(q, axis))).toBeLessThanOrEqual(1e-9);
            mine += 1;
          }
        }
        expect(mine).toBeGreaterThan(10);
        n += mine;
      }
      expect(n).toBeGreaterThan(20);
    });
  }

  it('frontAndEnds() (straight stops): agrees with a2\'s runoutNormals of the spanned one-side curve (1e-12, 100 vertices)', () => {
    const board = frontAndEnds();
    const v = geometryBoard(board);
    const p = v.profiles[0]!;
    const frames = sweptStops(v, p);
    expect(frames).toHaveLength(2);
    let n = 0;
    for (const fr of frames) {
      const axis = stopAxis(fr);
      const mine = stopRunoutNormals(v, oneSideCurve(p), fr);
      // The a2 curve on the stop's own side, spanned to stop at the station: written from the frame (F away from the run).
      const side = { across: 'length' as const, from: fr.N[0] > 0 ? 'min' as const : 'max' as const };
      const c = oneSideCurve(p, side);
      expect(c.through).toBe('width');
      const a2End = fr.F[1] > 0 ? 'hi' : 'lo';
      const span = a2End === 'hi' ? { lo: 0, hi: fr.at[1], stopLo: false, stopHi: true } : { lo: fr.at[1], hi: board.width, stopLo: true, stopHi: false };
      const theirs = runoutNormals(v, { ...c, span });
      for (const f of runoutFaces(board)) {
        if (f.runout !== fr.end || !nearAxis(f, axis) || n >= 100) continue;
        const arc = mine.arcOf(fr.end, f.verts);
        expect(theirs.arcOf(a2End, f.verts)).toEqual(arc);
        if (arc === null) continue;
        for (const q of f.verts) {
          if (n >= 100) break;
          expect(dist(mine.normal(fr.end, q, arc), theirs.normal(a2End, q, arc))).toBeLessThanOrEqual(1e-12);
          n += 1;
        }
      }
    }
    expect(n).toBe(100);
  });
});

describe('bodyMesh shades a stop\'s run-out smooth in its own frame (profile runs b2)', () => {
  /*
   * Ruling (Task 6): on the stop plane the run-out's ρ̂ is the stop's MODEL chord normal N (Q12), while the swept band's plan
   * direction there is the path's own (radial from the corner's centre on an arc). They agree exactly on a straight side; a
   * stop part-way along an arc's chord meets its band in a crease: the plan directions differ (stopOnCorner's 1.1":
   * |r̂ − N| = 0.0097 at `at`), and the band's normal reads s off the TRUE arc where the stop's `at` sits on the MODEL chord
   * (up to the chord's sagitta, 0.0043" at 2"), so the step reaches 0.016 at the junction's deepest vertex — about 0.9°, as
   * b1's tangent points step by a few thousandths. Not smoothed: a radial frame would contradict Q12 and the bodies' axis.
   */
  it('stopOnCorner(): on each stop plane the band\'s normal (sweptNormals) and the run-out\'s (the mesh) meet as derived', () => {
    const board = stopOnCorner();
    const v = geometryBoard(board);
    const p = v.profiles[0]!;
    const band = sweptNormals(v, p);
    const mesh = meshNormals(board);
    const ros = runoutFaces(board);
    const frames = sweptStops(v, p);
    const steps: number[] = [];
    for (const fr of frames) {
      const axis = stopAxis(fr);
      // The band's plan direction at the stop: radial from the 2" corner's centre (2, 2) on the arc, N on the straight front.
      const onArc = fr.at[0] < 2;
      let k = 0, step = 0;
      for (const f of faces(board).filter((x) => x.sweep !== undefined && x.profileEdge?.startsWith('p1:'))) {
        for (const q of f.verts) {
          if (Math.abs(dot2([q[0]! - fr.at[0], q[1]! - fr.at[1]], fr.F)) > 1e-9) continue;
          const s = dot2([q[0]! - fr.at[0], q[1]! - fr.at[1]], fr.N), t = T - q[2]!;
          if (!(s > 1e-4 && s < R - 1e-4 && t > 1e-4 && t < R - 1e-4)) continue;
          // A run-out face meets the band here (watertight: the same vertex).
          if (!ros.some((g) => g.runout === fr.end && g.verts.some((w) => dist(w, q) <= 1e-9))) continue;
          const bn = band(f, q)!;
          const d = Math.hypot(q[0]! - 2, q[1]! - 2);
          const inward: P2 = onArc ? [(2 - q[0]!) / d, (2 - q[1]!) / d] : [fr.N[0], fr.N[1]];
          expect(dist(bn, banded(onArc ? 2 - d : s, t, inward))).toBeLessThanOrEqual(1e-9);
          const rn = revolved(q, axis);
          const there = mesh.at(q);
          expect(there.length).toBeGreaterThanOrEqual(2);
          // Every mesh normal at the vertex is the band's or the run-out's (Float32: 1e-6); the run-out's is among them.
          for (const m of there) expect(Math.min(dist(m, bn), dist(m, rn)), `${q} ${m}`).toBeLessThanOrEqual(1e-6);
          expect(there.some((m) => dist(m, rn) <= 1e-6)).toBe(true);
          // The step's two causes (the Ruling above): the plan directions (r̂ against N), and the band reading s off the TRUE
          // arc while the stop's `at` lies on the MODEL chord (s_band − s_N is at most the corner chords' sagitta,
          // 2·(1 − cos(π/48)) = 0.0043" at 2"; zero on a straight side). rn is exactly banded(s_N, t, N).
          expect(dist(rn, banded(s, t, [fr.N[0], fr.N[1]]))).toBeLessThanOrEqual(1e-12);
          if (onArc) expect(Math.abs((2 - d) - s)).toBeLessThanOrEqual(2 * 2 * Math.sin(Math.PI / 96) ** 2 + 1e-9);
          // The DERIVED bound (triangle inequality): turning the plan direction from r̂ to N moves the normal by at most
          // |n_s|·|r̂ − N| ≤ |r̂ − N|, and shifting s by Δs = s_band − s_N turns the arc's normal by at most |Δs| / (R − |Δs|).
          const ds = onArc ? Math.abs((2 - d) - s) : 0;
          expect(dist(bn, rn)).toBeLessThanOrEqual(Math.hypot(inward[0] - fr.N[0], inward[1] - fr.N[1]) + ds / (R - ds) + 1e-9);
          step = Math.max(step, dist(bn, rn));
          k += 1;
        }
      }
      expect(k).toBeGreaterThan(2);
      steps.push(step);
      if (!onArc) expect(step).toBeLessThanOrEqual(1e-6);
      // Measured 0.0160 (the deepest junction vertex, t → 0; within the derived per-vertex bound above): about 0.9°, for the
      // user's eye on real hardware. A real crease, not zero.
      else expect(step).toBeGreaterThan(1e-6);
    }
    expect(frames.map((fr) => fr.at[0] < 2)).toEqual([true, false]);
  });

  it('stationFrontToBack(): a stop and a B1 station on one part, both tagged \'lo\' — each run-out shades from its OWN axis', () => {
    const board = stationFrontToBack();
    const v = geometryBoard(board);
    const p = v.profiles[0]!;
    const [fr] = sweptStops(v, p) as [StopFrame];
    const st = builtPath(v, p)!.ends!.find((e) => e.kind === 'station') as { at: P2; tangent: P2; side: { across: string; from: string } };
    expect(fr).toBeDefined();
    expect(st).toBeDefined();
    // Both run-outs carry `runout: 'lo'` (the stop's face-frame end 0; a2's run-dimension min for the station): only the
    // nearest axis tells them apart.
    expect(new Set(runoutFaces(board).map((f) => f.runout))).toEqual(new Set(['lo']));
    const out: P2 = st.side.across === 'length' ? [st.side.from === 'min' ? -1 : 1, 0] : [0, st.side.from === 'min' ? -1 : 1];
    const runouts: { axis: P2; at: P2; away: P2 }[] = [
      { axis: stopAxis(fr), at: fr.at, away: fr.F },
      { axis: [st.at[0] + BEARING * out[0], st.at[1] + BEARING * out[1]], at: st.at, away: st.tangent },
    ];
    const { all } = meshNormals(board);
    for (const ro of runouts) {
      let n = 0;
      for (const { p: q, n: N } of all) {
        if (dot2([q[0] - ro.at[0], q[1] - ro.at[1]], ro.away) <= 1e-3) continue;
        const s = Math.hypot(q[0] - ro.axis[0], q[1] - ro.axis[1]) - BEARING, t = T - q[2];
        if (!(s > 1e-3 && s < R - 1e-3 && t > 1e-3 && t < R - 1e-3)) continue;
        // Off the part's own faces (a sector chord's vertex where the cutter exits the side or end face carries that face's
        // flat normal too).
        if (!(q[0] > 1e-4 && q[0] < board.length - 1e-4 && q[1] > 1e-4 && q[1] < board.width - 1e-4)) continue;
        expect(dist(N, revolved(q, ro.axis)), `${q} ${N}`).toBeLessThanOrEqual(1e-5);
        n += 1;
      }
      expect(n).toBeGreaterThan(4);
    }
  });
});

describe('a stop\'s run-out of a STRAIGHT section edge (a bead\'s quirk wall) shades as the revolved line (lineNormals)', () => {
  it('stopOnCorner() as a bead 1/4" + 1/16" quirk: past the stop at 30" the wall takes the cylinder\'s normal (1e-5: Float32)', () => {
    // The quirk's wall stands 5/16" in from the edge, the top 1/16" deep; past the straight stop the cutter revolves it about
    // the bit's axis 1/4" outside the front (stopAxis: (30, −1/4)) — a cylinder of radius 1/4 + 5/16 = 9/16, its normal
    // horizontal, toward the axis. Plain cylinder geometry, from the fixture's numbers.
    const base = stopOnCorner();
    const board: Board = { ...base, profiles: [{ ...base.profiles[0]!, kind: 'bead', fillet: 1 / 16 }] };
    expect(board.profiles.flatMap((q) => profileFaults(board, q))).toEqual([]);
    const v = geometryBoard(board);
    expect(v.profiles).toHaveLength(1);
    const fr = sweptStops(v, v.profiles[0]!).find((x) => x.at[0] === 30)!;
    expect(fr).toMatchObject({ at: [30, 0], F: [1, 0], N: [0, 1] });
    const ax = stopAxis(fr);
    let n = 0;
    for (const { p: q, n: N } of meshNormals(board).all) {
      if (!(q[0] > 30 + 1e-3 && q[2] > T - 1 / 16 - 1e-6 && q[2] < T + 1e-6 && Math.abs(N[2]) < 0.5)) continue;
      const rho = Math.hypot(q[0] - ax[0], q[1] - ax[1]);
      if (Math.abs(rho - 9 / 16) > 1e-5) continue;
      expect(dist(N, [(ax[0] - q[0]) / rho, (ax[1] - q[1]) / rho, 0]), `${q} ${N}`).toBeLessThanOrEqual(1e-5);
      n += 1;
    }
    expect(n).toBeGreaterThan(4);
  });
});

let tick = 0;
describe('a stop\'s run-out normals are built once per stop per part (a2 fix F1\'s rule)', () => {
  it.each([['stopOnCorner()', stopOnCorner(), 2], ['stationFrontToBack() (one stop, one B1 station)', stationFrontToBack(), 1]] as [string, Board, number][])(
    '%s: one build per stop over every body, none on a second pass', (_name, made, stops) => {
      tick += 1;
      const board = { ...made, length: made.length + tick * 1e-6 };
      const g = partGeometry(board);
      calls.n = 0;
      for (const body of g.bodies) bodyMesh(board, body, g.holes, g.bodies);
      expect(calls.n).toBe(stops);
      for (const body of g.bodies) bodyMesh(board, body, g.holes, g.bodies);
      expect(calls.n).toBe(stops);
    });
});
