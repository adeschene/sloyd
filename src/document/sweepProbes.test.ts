import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { stockProbe, type Point } from './cuts';
import { holeFaults } from './holeFaults';
import { faultKey, holeFaultText } from './holeText';
import { boardSnapPoints } from './snapPoints';
import { fromWorldOffset, axisFrame } from './geometry';
import { geometryBoard, profileFaults } from './profiles';
import { BEARING, profileSection, sectionFrame, stopAxis } from './runout';
import { keptSection, oneSideCurve, sweptStops, sweptWasteStations } from './sweep';
import { bodyVolume, partGeometry, type Body } from './bodies';
import { builtPath, profilePath } from './profilePath';
import { apronArch, frontOnly, loop, plainLoop, stopOnArch, stopOnCorner, topCorners, wrapFour, wrapThree, zoneStop,
  stationFrontToBack, stationFrontToRight, stationRightToBack, cornerGap } from './sweepFixtures';
import type { P2 } from './curves';
import type { Board, HoleRow } from './types';

/*
 * Profile runs b1, Task 4: a swept profile's waste is air to the stock probe (P3's open form: a point ON the profile surface
 * is stock), a hole into it breaks out keyed `:curve:<profile id>` (P7, Q6), and snap points stay on wood (invariant 16).
 */
const T = 0.75;
const at = (length: number, width: number, thickness: number): Point => ({ length, width, thickness });

/** The roundover's section waste top, tau(s), read off the section (the oracle's rule): the margin a point's verdict rests on. */
function tauAt(b: Board, s: number): number {
  const v = geometryBoard(b);
  const pts = profileSection(v, oneSideCurve(v.profiles![0]!)).pts;
  let best = 0;
  pts.forEach((a, i) => {
    const q = pts[(i + 1) % pts.length]!;
    const lo = Math.min(a[0], q[0]), hi = Math.max(a[0], q[0]);
    if (s < lo || s > hi || hi - lo < 1e-15) return;
    best = Math.max(best, a[1] + ((s - a[0]) / (q[0] - a[0])) * (q[1] - a[1]));
  });
  return best;
}
/** A section vertex on the arc (not on the part's faces): ON the profile surface. */
function surfaceVertex(b: Board): [number, number] {
  const v = geometryBoard(b);
  const pts = profileSection(v, oneSideCurve(v.profiles![0]!)).pts;
  return pts.find((q) => q[0] > 1e-6 && q[1] > 1e-6 && q[0] < 0.2 && q[1] < 0.2 && Math.abs(q[0] - q[1]) < 1e-9)! as [number, number];
}

describe('the stock probe: a swept profile\'s waste is air, its surface is stock (P3)', () => {
  it('the fixtures hold what the cases assume: a 1/4" roundover, reach and depth 1/4"', () => {
    for (const b of [apronArch, topCorners(2), frontOnly, plainLoop]) {
      const v = geometryBoard(b);
      expect(v.profiles!.length).toBe(1);
      const ks = keptSection(v, v.profiles![0]!);
      expect(ks.reach).toBe(0.25);
      expect(ks.depth).toBe(0.25);
    }
    // The brief's waste point (0.05 in, 0.1 down) is air by a margin of the section chords, recorded here.
    expect(tauAt(topCorners(2), 0.05) - 0.1).toBeGreaterThan(0.005);
  });

  it('topCorners(2) with a loop: along the front edge, in the waste is air; 0.3" in is stock; ON the surface is stock', () => {
    const probe = stockProbe(topCorners(2));
    expect(probe(at(18, 0.05, T - 0.1))).toBe(false);
    expect(probe(at(18, 0.3, T - 0.1))).toBe(true);
    // Just inside the reach, just under the face: still air (the band's far edge).
    expect(probe(at(18, 0.249, T - 1e-4))).toBe(false);
    expect(probe(at(18, 0.251, T - 1e-4))).toBe(true);
    // Below the profile's depth: stock, however close to the edge.
    expect(probe(at(18, 0.01, T - 0.26))).toBe(true);
    const [s, t] = surfaceVertex(topCorners(2));
    expect(probe(at(18, s, T - t))).toBe(true);
    // A hair off the surface, into the waste: air.
    expect(probe(at(18, s - 1e-6, T - t + 1e-6))).toBe(false);
    // The bottom face is untouched by a top loop.
    expect(probe(at(18, 0.05, 0.1))).toBe(true);
  });

  it('topCorners(2): round a corner arc, the waste is air and wood 0.3" in is stock', () => {
    const probe = stockProbe(topCorners(2));
    // On the arc's 45° radius from its centre (2, 2): the outline at r = 2, so 0.05 in is r = 1.95.
    const pt = (rr: number) => [2 - rr / Math.SQRT2, 2 - rr / Math.SQRT2] as const;
    const [a, b] = pt(1.95);
    expect(probe(at(a, b, T - 0.1))).toBe(false);
    const [c, d] = pt(1.7);
    expect(probe(at(c, d, T - 0.1))).toBe(true);
  });

  it('apronArch along the arch: at the crown, in the waste is air; 0.3" in is stock; ON the surface is stock', () => {
    const probe = stockProbe(apronArch);
    const crown = 1.25; // an even chord count: the crown is a model vertex
    expect(probe(at(15, crown + 0.05, T - 0.1))).toBe(false);
    expect(probe(at(15, crown + 0.3, T - 0.1))).toBe(true);
    const [s, t] = surfaceVertex(apronArch);
    expect(probe(at(15, crown + s, T - t))).toBe(true);
    // Under the arch: the arch's own waste, air as before.
    expect(probe(at(15, crown - 0.1, 0.1))).toBe(false);
  });

  it('frontOnly: past a station the waste is a2\'s cutter about the bit\'s axis, not the path\'s rounded end', () => {
    const probe = stockProbe(frontOnly);
    // (0.05, 2.1), 0.06 down: 0.066 from the cutter (tau 0.084: air); the path's end (0, 2) is 0.112 away (tau 0.047).
    expect(probe(at(0.05, 2.1, T - 0.06))).toBe(false);
    expect(probe(at(0.05, 2.1, T - 0.1))).toBe(true);
    // Well past the station on the end side: no profile there.
    expect(probe(at(0.05, 6, T - 0.01))).toBe(true);
    // Before the stations, along the front: the band.
    expect(probe(at(18, 0.05, T - 0.1))).toBe(false);
  });

  it('a faulted swept profile builds nothing, and its waste is not air', () => {
    const b = topCorners(0.5, loop('p1', 0.625));
    expect(profileFaults(b, b.profiles[0]!).length).toBeGreaterThan(0);
    expect(stockProbe(b)(at(18, 0.05, T - 0.1))).toBe(true);
  });
});

const hole = (inset: number, opts: Partial<HoleRow> = {}): HoleRow => ({
  id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 15,
  count: 1, pitch: 0, acrossFrom: 'min', inset, ...opts,
});
const withHole = (b: Board, r: HoleRow): Board => ({ ...b, holes: [r] });
const faults = (b: Board, r: HoleRow) => holeFaults(withHole(b, r), r);

describe('holes into a swept profile\'s waste break out, keyed :curve:<id> (§4.1, P7, P14)', () => {
  // The crown is a model vertex at 1.25: a hole's centre δ above it is δ from the path. Reach 1/4" + radius 1/8" = 3/8".
  it('a 1/4" hole, 3/8" deep from the top, 0.3" from the arch\'s crown breaks out into the roundover', () => {
    const r = hole(1.25 + 0.3);
    const fs = faults(apronArch, r);
    expect(fs).toEqual([{ index: 0, kind: 'breaks-out', curve: { id: 'p1', kind: null, profile: 'roundover' } }]);
    expect(faultKey(fs[0]!)).toBe('0:breaks-out:curve:p1');
    expect(holeFaultText(fs[0]!, r)).toBe('hole 1 runs into the roundover');
  });

  it('the boundary on both sides of reach + radius (3/8"): 0.37 breaks out, 0.38 is clean', () => {
    expect(faults(apronArch, hole(1.25 + 0.37)).map((f) => f.kind)).toEqual(['breaks-out']);
    expect(faults(apronArch, hole(1.25 + 0.38))).toEqual([]);
  });

  it('the brief\'s 0.4" (outside reach + radius, 0.375") and 0.6" are clean', () => {
    expect(faults(apronArch, hole(1.25 + 0.4))).toEqual([]);
    expect(faults(apronArch, hole(1.25 + 0.6))).toEqual([]);
  });

  it('depth: from the bottom, a hole short of the profile\'s depth band is clean; one reaching it breaks out', () => {
    // From the bottom: [0, 3/8] from the bottom face stops 3/8" short of the top; the band is the top 1/4".
    expect(faults(apronArch, hole(1.25 + 0.3, { from: 'min' }))).toEqual([]);
    // 5/8" deep from the bottom reaches 1/8" into the top's band... as does 1/2" exactly (touching meets).
    expect(faults(apronArch, hole(1.25 + 0.3, { from: 'min', depth: 0.625 })).map((f) => f.kind)).toEqual(['breaks-out']);
    expect(faults(apronArch, hole(1.25 + 0.3, { from: 'min', depth: 0.5 })).map((f) => f.kind)).toEqual(['breaks-out']);
    expect(faults(apronArch, hole(1.25 + 0.3, { from: 'min', depth: 0.49 }))).toEqual([]);
  });

  it('a side-entry hole (along the width, from the front) into the band breaks out; one below the depth is clean', () => {
    // Along width from min at length 6 (on the straight run before the arch), across from the top face.
    const side = (inset: number): HoleRow => hole(inset, { face: 'width', from: 'min', depth: 0.5, along: 'length', station: 1.5, acrossFrom: 'max' });
    expect(faults(apronArch, side(0.2)).map((f) => f.kind)).toEqual(['breaks-out']);
    // Centre 0.375 + 0.01 below the top: its top at 0.26, clear of the 1/4" band.
    expect(faults(apronArch, side(0.385))).toEqual([]);
  });

  it('frontOnly: past a station the band runs on by the run-out\'s reach, BEARING + reach = 1/2" (P14, conservative)', () => {
    // Along the length min end side, x = 0.15: 0.4" past the station at (0, 2) and 0.427" from the path's end. The hole
    // reach reads the station at the tangent point (fix round 2: ε, a build detail, never decides a fault).
    const r = (y: number): HoleRow => hole(y, { station: 0.15 });
    expect(faults(frontOnly, r(2.4))).toEqual([{ index: 0, kind: 'breaks-out', curve: { id: 'p1', kind: null, profile: 'roundover' } }]);
    // The extension ends at (0, 2.5); within reach + radius of that point: 2.5 + sqrt(0.375² − 0.15²) = 2.8437.
    expect(faults(frontOnly, r(2.83)).map((f) => f.kind)).toEqual(['breaks-out']);
    expect(faults(frontOnly, r(2.86))).toEqual([]);
  });

  it('a faulted swept profile builds nothing: a hole into where its waste would be is clean', () => {
    const b = topCorners(0.5, loop('p1', 0.625));
    expect(faults(b, hole(0.3, { station: 18 }))).toEqual([]);
  });
});

describe('snap points stay on wood (invariant 16)', () => {
  const local = (b: Board, w: readonly number[]): Point => {
    const frame = axisFrame(b);
    const p = {} as Point;
    for (let i = 0; i < 3; i += 1) p[frame[i]!.dim] = fromWorldOffset(b, i, w[i]! - b.position[i]!);
    return p;
  };

  it('plainLoop: the top face\'s 4 corners and 4 edge-mids go (in the waste); 18 of the 26 lattice points stay', () => {
    const pts = boardSnapPoints(plainLoop);
    expect(pts.length).toBe(18);
    const tops = pts.map((q) => local(plainLoop, q.at)).filter((p) => Math.abs(p.thickness - T) < 1e-9);
    expect(tops).toEqual([at(15, 5, T)]);
  });

  it('topCorners(2) with a loop: no arc end or crown on the profiled face (in the waste); the bottom face keeps them', () => {
    const b = topCorners(2);
    const probe = stockProbe(b);
    const pts = boardSnapPoints(b).filter((q) => q.kind !== 'face-center').map((q) => local(b, q.at));
    expect(pts.every((p) => probe(p))).toBe(true);
    // Each corner arc's two ends and crown, on the bottom face: 12 marks.
    const onArc = (p: Point) => [[2, 2], [34, 2], [2, 18], [34, 18]].some(([u, v]) => Math.abs(Math.hypot(p.length - u!, p.width - v!) - 2) < 1e-9);
    expect(pts.filter((p) => p.thickness === 0 && onArc(p)).length).toBe(12);
    expect(pts.filter((p) => p.thickness === T && onArc(p))).toEqual([]);
  });
});

/*
 * Profile runs b2, Task 5: beyond a user's stop on a turned path (Q12) the waste is the run-out about the bit's axis, BEARING
 * outside the stop's model chord (`stopAxis`): air to the probe (P3's open form), the hole reach's band run on along the
 * stop's tangent by BEARING + reach (P14), and the section's two junction points on the stop plane snap as corners (P17, Q25).
 */
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
type StopEnd = { kind: 'stop'; at: P2; tangent: P2; normal: P2 };
const stopEnds = (b: Board, built: boolean): StopEnd[] => {
  const v = geometryBoard(b);
  const p = v.profiles![0]!;
  const path = (built ? builtPath : profilePath)(v, p)!;
  return path.ends!.filter((e): e is typeof e & StopEnd => e.kind === 'stop') as StopEnd[];
};
const plus = (a: P2, ...terms: [P2, number][]): P2 => terms.reduce<P2>((q, [d, k]) => [q[0] + k * d[0], q[1] + k * d[1]], [a[0], a[1]]);

describe('b2: the stock probe beyond a stop on a turned path is the run-out (P3)', () => {
  it('the path\'s stop ends are where Task 4 builds the run-out: its axis is stopAxis (BEARING OUTSIDE the outline)', () => {
    for (const b of [stopOnCorner(), stopOnArch]) {
      const v = geometryBoard(b);
      const frames = sweptStops(v, v.profiles![0]!);
      const ends = stopEnds(b, true);
      expect(ends.length).toBe(2);
      expect(frames.length).toBe(2);
      for (const e of ends) {
        const fr = frames.find((f) => Math.hypot(f.at[0] - e.at[0], f.at[1] - e.at[1]) < 1e-12)!;
        expect(fr).toBeDefined();
        expect(Math.hypot(fr.F[0] - e.tangent[0], fr.F[1] - e.tangent[1])).toBeLessThan(1e-12);
        expect(Math.hypot(fr.N[0] - e.normal[0], fr.N[1] - e.normal[1])).toBeLessThan(1e-12);
        const ax = plus(e.at, [e.normal, -BEARING]);
        const sa = stopAxis(fr);
        // The axis the probe's waste STORES (fix round 1, M2) is Task 4's stopAxis, the one the run-out pieces revolve about.
        const stored = sweptWasteStations(v, v.profiles![0]!, true).find((st) => Math.hypot(st.at[0] - e.at[0], st.at[1] - e.at[1]) < 1e-12)!;
        expect(stored).toBeDefined();
        expect(Math.hypot(stored.axis[0] - sa[0], stored.axis[1] - sa[1])).toBeLessThan(1e-12);
        expect(Math.hypot(ax[0] - sa[0], ax[1] - sa[1])).toBeLessThan(1e-12);
        // The axis is OUTSIDE the wood: the stop's normal points in (a point 0.05 along it is stock under the face).
        expect(stockProbe(b)(at(...plus(e.at, [e.normal, 0.05]), 0.1))).toBe(true);
        expect(stockProbe(b)(at(...ax, 0.1))).toBe(false);
      }
      // The typed (fault) path's stops sit where the built path's do on these fixtures (no end-chord zone).
      expect(stopEnds(b, false)).toEqual(ends);
    }
  });

  // Roundover 1/4": tau(s) = 1/4 − sqrt(1/16 − (1/4 − s)²). 0.1" beyond and 0.05" in: rho − BEARING = sqrt(0.1² + 0.3²) − 1/4
  // = 0.0662, tau 0.0805 (the cutter's); the path's rounded cap would read the distance to `at`, 0.1118, tau 0.0417.
  for (const [name, b, circle] of [
    ['stopOnCorner', stopOnCorner(), [2, 2, 2]],
    ['stopOnArch', stopOnArch, null],
  ] as const) {
    it(`${name}: beyond each stop, inside the cutter is air, outside its reach is stock, ON its surface is stock`, () => {
      const probe = stockProbe(b);
      const [s, t] = surfaceVertex(b);
      expect(tauAt(b, s)).toBeCloseTo(t, 12);
      for (const e of stopEnds(b, true)) {
        const ax = plus(e.at, [e.normal, -BEARING]);
        // A stop on the corner arc (start, x = 1.1): the points must stay inside that arc (the part's own outline).
        const onCircle = circle !== null && Math.abs(Math.hypot(e.at[0] - circle[0], e.at[1] - circle[1]) - circle[2]) < 1e-2;
        const near = plus(e.at, [e.tangent, 0.1], [e.normal, 0.05]);
        // In the cutter's waste (t 0.06 < tau 0.0805) but outside the rounded cap's (t 0.06 > 0.0417): the stop decides.
        expect(probe(at(...near, T - 0.06))).toBe(false);
        // Below the cutter's waste at that s.
        expect(probe(at(...near, T - 0.1))).toBe(true);
        // 0.6" beyond, 0.15" in (inside the part's own outline): rho − BEARING = 0.4711 > reach, stock.
        const far = plus(e.at, [e.tangent, 0.6], [e.normal, 0.15]);
        if (onCircle) expect(Math.hypot(far[0] - circle[0], far[1] - circle[1])).toBeLessThan(circle[2]);
        expect(Math.hypot(far[0] - ax[0], far[1] - ax[1]) - BEARING).toBeGreaterThan(0.25);
        expect(probe(at(...far, T - 0.01))).toBe(true);
        // ON the run-out's surface (rho − BEARING = s, t = tau(s)), 60° round from F: stock; a hair into the waste: air.
        const th = Math.PI / 3;
        const dir: P2 = [Math.cos(th) * e.tangent[0] + Math.sin(th) * e.normal[0], Math.cos(th) * e.tangent[1] + Math.sin(th) * e.normal[1]];
        const on = plus(ax, [dir, BEARING + s]);
        if (onCircle) expect(Math.hypot(on[0] - circle[0], on[1] - circle[1])).toBeLessThan(circle[2]);
        expect(probe(at(...on, T - t))).toBe(true);
        expect(probe(at(...plus(ax, [dir, BEARING + s - 1e-6]), T - t + 1e-6))).toBe(false);
      }
      if (circle) expect(stopEnds(b, true).filter((e) => Math.abs(Math.hypot(e.at[0] - circle[0], e.at[1] - circle[1]) - circle[2]) < 1e-2).length).toBe(1);
    });
  }
});

describe('b2: a hole beyond a stop on the arch breaks out into the run-out\'s reach (P14, Review Focus 4)', () => {
  // stopOnArch's START stop (x = 10, on the arch, r ~ 58"): a 1/4" hole (r 1/8) from the top, 3/8" deep, centred at
  // at + tangent·(BEARING + reach + δ) + normal·0.3 — 0.3" into the wood, 0.175" clear of the arch's waste. The band runs on
  // along the tangent by BEARING + reach to E = at + tangent/2, so the hole meets the reach exactly at
  // δ* = sqrt((reach + r)² − 0.3²) = sqrt(0.375² − 0.09) = 0.225.
  const e = stopEnds(stopOnArch, false)[0]!;
  const reach = 0.25, r = 0.125;
  const dStar = Math.sqrt((reach + r) ** 2 - 0.3 ** 2);
  const holeAt = (d: number): HoleRow => {
    const c = plus(e.at, [e.tangent, BEARING + reach + d], [e.normal, 0.3]);
    return hole(c[1], { station: c[0] });
  };
  it('δ* is 0.225 and the start stop is on the arch, its tangent running away from the run (−x)', () => {
    expect(dStar).toBeCloseTo(0.225, 12);
    expect(e.at[0]).toBeCloseTo(10, 9);
    expect(e.at[1]).toBeGreaterThan(0.01);
    expect(e.tangent[0]).toBeLessThan(-0.99);
    expect(e.normal[1]).toBeGreaterThan(0.99);
  });
  it('δ = δ* − 0.01 breaks out keyed :curve:p1; δ = δ* + 0.01 is clean', () => {
    const near = faults(stopOnArch, holeAt(dStar - 0.01));
    expect(near).toEqual([{ index: 0, kind: 'breaks-out', curve: { id: 'p1', kind: null, profile: 'roundover' } }]);
    expect(faultKey(near[0]!)).toBe('0:breaks-out:curve:p1');
    expect(faults(stopOnArch, holeAt(dStar + 0.01))).toEqual([]);
  });
});

describe('b2: a stop\'s junction points snap as corners (P17, Q25); b1\'s stations offer none', () => {
  const local = (b: Board, w: readonly number[]): Point => {
    const frame = axisFrame(b);
    const p = {} as Point;
    for (let i = 0; i < 3; i += 1) p[frame[i]!.dim] = fromWorldOffset(b, i, w[i]! - b.position[i]!);
    return p;
  };
  it('stopOnCorner: at each stop, (reach, 0) and (0, depth) on the stop plane, as corners, every point on stock', () => {
    const b = stopOnCorner();
    const v = geometryBoard(b);
    const p = v.profiles![0]!;
    const { reach, depth } = keptSection(v, p);
    const f = sectionFrame(v, oneSideCurve(p));
    const probe = stockProbe(b);
    const pts = boardSnapPoints(b);
    for (const q of pts) if (q.kind !== 'face-center') expect(probe(local(b, q.at))).toBe(true);
    const corners = pts.filter((q) => q.kind === 'corner').map((q) => local(b, q.at));
    for (const fr of sweptStops(v, p)) {
      for (const [s, t] of [[reach, 0], [0, depth]] as const) {
        const xy = plus(fr.at, [fr.N, s]);
        const want = at(xy[0], xy[1], f.vFace + f.vIn * t);
        expect(corners.some((c) => Math.abs(c.length - want.length) < 1e-9 && Math.abs(c.width - want.width) < 1e-9
          && Math.abs(c.thickness - want.thickness) < 1e-9)).toBe(true);
      }
    }
  });
  it('frontOnly (B1 stations): no stop frames, and its snap points are b1\'s bytes', () => {
    const v = geometryBoard(frontOnly);
    expect(sweptStops(v, v.profiles![0]!)).toEqual([]);
    // The owner id is minted per run (createBoard): hashed without it.
    expect(sha(boardSnapPoints(frontOnly).map((q) => ({ kind: q.kind, at: q.at })))).toBe('65567c56647670e9dc35724ba8d44b1a184f6abeb57f554e762af5da3c2a540b');
  });
});

/*
 * Fix round 1 (the Task 5 review's I1): a run with a stop may pass up to two whole sides, so its own band comes back into the
 * half-plane past a stop. There the air is the UNION of the cutter's and the band's; the half-plane takes away only the band's
 * rounded end cap. Pinned against the BODIES (the built wood), never against the rule restated.
 */
const threeSides = wrapThree;
const fourSides = wrapFour;
function inBodies(bodies: readonly Body[], eps: number) {
  const bs = bodies.map((b) => ({
    planes: b.faces.map((f) => ({ n: f.n, d: f.n[0] * f.verts[0]![0] + f.n[1] * f.verts[0]![1] + f.n[2] * f.verts[0]![2] })),
    lo: [0, 1, 2].map((k) => Math.min(...b.faces.flatMap((f) => f.verts.map((q) => q[k]!)))),
    hi: [0, 1, 2].map((k) => Math.max(...b.faces.flatMap((f) => f.verts.map((q) => q[k]!)))),
  }));
  return (q: readonly number[]) => bs.some((b) => q.every((x, k) => x >= b.lo[k]! - eps && x <= b.hi[k]! + eps)
    && b.planes.every((h) => h.n[0] * q[0]! + h.n[1] * q[1]! + h.n[2] * q[2]! <= h.d + eps));
}
const rng = (seed: number) => { let r = seed; return () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; }; };
const segDist = (q: P2, a: P2, b: P2) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const u = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / l2));
  return Math.hypot(q[0] - a[0] - u * dx, q[1] - a[1] - u * dy);
};
/** Random points within reach + 0.05 of the built path's chords and t in [0, 1.2·depth]; those the probe and the bodies
 *  disagree on, leaving out each stop's run-out (within BEARING + reach + 0.02 of its axis: a2's inscribed-sector sliver,
 *  pinned exactly by Task 4's oracle) and a 1e-6 skin round every body face (the probe's surface is closed stock). */
function probeVsBodies(b: Board, count: number): P2[] {
  const v = geometryBoard(b);
  const p = v.profiles![0]!;
  const path = builtPath(v, p)!;
  // Every run-out's axis: each stop's (stopAxis) and each B1 station's (a2's, BEARING outside its side).
  const out = (sd: { across: string; from: string }): P2 => (sd.across === 'length' ? [sd.from === 'min' ? -1 : 1, 0] : [0, sd.from === 'min' ? -1 : 1]);
  const axes = [...sweptStops(v, p).map((fr) => stopAxis(fr)),
    ...path.ends!.flatMap((e) => (e.kind === 'station' ? [plus(e.at, [out(e.side), BEARING])] : []))];
  const probe = stockProbe(b);
  const geo = partGeometry(b);
  const inner = inBodies(geo.bodies, -1e-6), outer = inBodies(geo.bodies, 1e-6);
  const rand = rng(5);
  const bad: P2[] = [];
  let tested = 0;
  while (tested < count) {
    const q: P2 = [rand() * b.length, rand() * b.width];
    if (!path.chords.some((c) => segDist(q, c.a, c.b) < 0.3)) continue;
    if (axes.some((a) => Math.hypot(q[0] - a[0], q[1] - a[1]) < BEARING + 0.25 + 0.02)) continue;
    const z = T - rand() * 0.3;
    const pt = [q[0], q[1], z] as const;
    const wood = inner(pt), notAir = outer(pt);
    if (wood !== notAir) continue; // on a face
    tested += 1;
    if (probe(at(q[0], q[1], z)) !== wood) bad.push(q);
  }
  return bad;
}

describe('b2 fix round 1: a wrapping run\'s band past a stop\'s plane is still air (I1)', () => {
  it('the repros hold what they claim: both build, unfaulted, with two stops', () => {
    for (const b of [threeSides(), fourSides()]) {
      const v = geometryBoard(b);
      expect(profileFaults(b, b.profiles[0]!)).toEqual([]);
      expect(v.profiles!.length).toBe(1);
      expect(sweptStops(v, v.profiles![0]!).length).toBe(2);
    }
  });

  it('(a) three sides: on the back band (in the start stop\'s half-plane x < 20) the probe reads air, as the bodies do', () => {
    const b = threeSides();
    const probe = stockProbe(b);
    const wood = inBodies(partGeometry(b).bodies, 1e-12);
    expect(wood([15, 3.95, T - 0.06])).toBe(false);
    expect(probe(at(15, 3.95, T - 0.06))).toBe(false);
    // The back band 0.3" in is stock either way.
    expect(probe(at(15, 3.7, T - 0.06))).toBe(true);
    // Near the start stop: 0.1" past it along the front, 0.05" in, 0.06" down — the cutter's air (tau 0.0805), still air.
    expect(wood([19.9, 0.05, T - 0.06])).toBe(false);
    expect(probe(at(19.9, 0.05, T - 0.06))).toBe(false);
    // ...and the rounded cap's region below the cutter's waste (0.1" down) stays stock.
    expect(probe(at(19.9, 0.05, T - 0.1))).toBe(true);
    expect(probeVsBodies(b, 4000)).toEqual([]);
  });

  it('(b) four sides: the back and front bands and both profiled arcs read air, as the bodies do', () => {
    const b = fourSides();
    const probe = stockProbe(b);
    const wood = inBodies(partGeometry(b).bodies, 1e-12);
    const r = 1.95 / Math.SQRT2; // 0.05" in on an arc's 45° radius
    for (const q of [[15, 19.95], [25, 0.05], [34 + r, 18 + r], [34 + r, 2 - r], [2 - r, 18 + r]] as const) {
      expect(wood([q[0], q[1], T - 0.06])).toBe(false);
      expect(probe(at(q[0], q[1], T - 0.06))).toBe(false);
    }
    // The front-left arc is not profiled (the run starts at x = 20 on the front, ends at y = 10 on the left end).
    expect(probe(at(2 - r, 2 - r, T - 0.06))).toBe(true);
    expect(probeVsBodies(b, 4000)).toEqual([]);
  });

  it('(b) four sides: no snap mark sits in the routed-away wood (invariant 16)', () => {
    const b = fourSides();
    const wood = inBodies(partGeometry(b).bodies, 1e-9);
    const frame = axisFrame(b);
    const bad = boardSnapPoints(b).filter((q) => q.kind !== 'face-center').filter((q) => {
      const l = [0, 1, 2].map((i) => fromWorldOffset(b, i, q.at[i]! - b.position[i]!));
      const pt = { [frame[0]!.dim]: l[0], [frame[1]!.dim]: l[1], [frame[2]!.dim]: l[2] } as Point;
      return !wood([pt.length, pt.width, pt.thickness]);
    });
    expect(bad).toEqual([]);
  });
});

describe('b2 fix round 1: the probe reads the BUILT stop, the holes the TYPED one (M1, zoneStop)', () => {
  const b = zoneStop();
  const v = geometryBoard(b);
  const p = v.profiles![0]!;
  const typed = (profilePath(v, p)!.ends![0] as unknown as StopEnd);
  const built = (builtPath(v, p)!.ends![0] as unknown as StopEnd);
  it('the two stops differ: typed (0.5804, 0.5919), built at the chord vertex (0.5858, 0.5858), tangents apart', () => {
    expect(typed.kind).toBe('stop');
    expect(built.kind).toBe('stop');
    expect(typed.at[0]).toBeCloseTo(0.5804, 4); expect(typed.at[1]).toBeCloseTo(0.5919, 4);
    expect(built.at[0]).toBeCloseTo(0.5858, 4); expect(built.at[1]).toBeCloseTo(0.5858, 4);
    expect(Math.hypot(typed.tangent[0] - built.tangent[0], typed.tangent[1] - built.tangent[1])).toBeGreaterThan(0.1);
  });
  it('the probe: a point whose verdict the two stops split reads the built stop\'s cutter', () => {
    // 0.2" past the built stop along its F, 0.05" in: the built cutter's s is rho_b − BEARING; the typed one's differs.
    const q = plus(built.at, [built.tangent, 0.2], [built.normal, 0.05]);
    const ax = (e: StopEnd) => plus(e.at, [e.normal, -BEARING]);
    const beyond = (e: StopEnd) => (q[0] - e.at[0]) * e.tangent[0] + (q[1] - e.at[1]) * e.tangent[1] > 0;
    expect(beyond(built) && beyond(typed)).toBe(true);
    const sb = Math.hypot(q[0] - ax(built)[0], q[1] - ax(built)[1]) - BEARING;
    const st = Math.hypot(q[0] - ax(typed)[0], q[1] - ax(typed)[1]) - BEARING;
    const tb = tauAt(b, sb), tt = tauAt(b, st);
    expect(Math.abs(tb - tt)).toBeGreaterThan(1e-3);
    const tMid = (tb + tt) / 2;
    expect(stockProbe(b)(at(q[0], q[1], T - tMid))).toBe(!(tMid < tb));
  });
  // Task 6 (carried, Task 5's concern): the snap source `sweptStops` reads the BUILT path. The expectation comes from
  // `builtPath`'s own end, never from `sweptStops` (which the stopOnCorner snap test reads, so it moves with the flag).
  it('the snaps: both junction corners sit on the BUILT stop (at + s·normal), none on the typed one', () => {
    const { reach, depth } = keptSection(v, p);
    const f = sectionFrame(v, oneSideCurve(p));
    const frame = axisFrame(b);
    const corners = boardSnapPoints(b).filter((q) => q.kind === 'corner').map((q) => [0, 1, 2].map((i) => fromWorldOffset(b, i, q.at[i]! - b.position[i]!)))
      .map((l) => { const pt = {} as Point; for (let i = 0; i < 3; i += 1) pt[frame[i]!.dim] = l[i]!; return pt; });
    const has = (e: StopEnd, s: number, t: number) => {
      const xy = plus(e.at, [e.normal, s]);
      return corners.some((c) => Math.abs(c.length - xy[0]) < 1e-9 && Math.abs(c.width - xy[1]) < 1e-9 && Math.abs(c.thickness - (f.vFace + f.vIn * t)) < 1e-9);
    };
    for (const [s, t] of [[reach, 0], [0, depth]] as const) {
      expect(has(built, s, t)).toBe(true);
      expect(has(typed, s, t)).toBe(false);
    }
  });
  it('the holes: a hole the typed stop\'s extension reaches breaks out; the built one\'s would not', () => {
    const reach = 0.25, r = 0.125;
    const dStar = Math.sqrt((reach + r) ** 2 - 0.3 ** 2);
    const c = plus(typed.at, [typed.tangent, BEARING + reach + dStar - 0.01], [typed.normal, 0.3]);
    const eB = plus(built.at, [built.tangent, BEARING + reach]);
    expect(Math.hypot(c[0] - eB[0], c[1] - eB[1]) - r).toBeGreaterThan(reach + 0.01);
    expect(faults(b, hole(c[1], { station: c[0] }))).toEqual([{ index: 0, kind: 'breaks-out', curve: { id: 'p1', kind: null, profile: 'roundover' } }]);
  });
});


describe('b2 fix round 2: a B1 station in a two-side run clips only its own end of the band (N1)', () => {
  // The waste each run removes beyond the four 2" corners (4·(4 − π)·T), from Task 4's INDEPENDENT oracle's integration
  // (sweepStops.test.ts R-a, recorded here; the reviewer's hand estimates 0.69, ~1, ~0.5 agree): never read off the bodies.
  const CORNERS = 4 * (4 - Math.PI) * T;
  for (const [name, make, waste] of [
    ['stationRightToBack', stationRightToBack, 0.7079],
    ['stationFrontToBack', stationFrontToBack, 1.0752],
    ['stationFrontToRight', stationFrontToRight, 0.5615],
  ] as const) {
    it(`${name}: unfaulted, swept, one stop and one station; the wood removed is the profile's; probe and bodies agree`, () => {
      const b = make();
      expect(profileFaults(b, b.profiles[0]!)).toEqual([]);
      const v = geometryBoard(b);
      expect(v.profiles!.length).toBe(1);
      expect(builtPath(v, v.profiles![0]!)!.ends!.map((e) => e.kind).sort()).toEqual(['station', 'stop']);
      const vol = partGeometry(b).bodies.reduce((a, x) => a + bodyVolume(x), 0);
      expect(Math.abs(36 * 20 * T - CORNERS - vol - waste)).toBeLessThan(2e-3);
      expect(probeVsBodies(b, 6000)).toEqual([]);
    }, 60_000);
  }
});

/*
 * Task 6 fix round 1 (I2): a run whose two stops sit 0.1" either side of one SHARP corner — the right end from 0.1 round to
 * the front at 29.9. Where the two ends' bands overlap (x in [29.75, 29.9], y in [0.1, 0.25]) both passes cut, so the wood
 * is what NEITHER pass removes: written from the 1/4" roundover's own circle (centre R in and R down), never from the code.
 */
describe('b2 fix round 1: where a run\'s two ends\' bands overlap, the wood is what neither pass removes (I2)', () => {
  const R = 0.25;
  const roundoverWaste = (s: number, t: number) => s >= 0 && s < R && t >= 0 && t < R && Math.hypot(s - R, t - R) > R;
  const nearArc = (s: number, t: number) => s < R + 0.006 && t < R + 0.006 && Math.abs(Math.hypot(s - R, t - R) - R) <= 0.006;
  for (const [a, g] of [[0.1, 0.1], [0.2, 0.05]] as const) {
    it(`cornerGap(${a}, ${g}): every sampled point of the overlap reads the union of both passes' waste`, () => {
      const b = cornerGap(a, g);
      expect(profileFaults(b, b.profiles[0]!)).toEqual([]);
      const bodies = partGeometry(b).bodies;
      const inner = inBodies(bodies, -1e-6), outer = inBodies(bodies, 1e-6);
      const rand = rng(11);
      let tested = 0, bad = 0, both = 0;
      const x0 = b.length - R, x1 = b.length - g, y0 = a, y1 = R;
      while (tested < 4000) {
        const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0), z = T - rand() * R;
        const wood = inner([x, y, z]);
        if (wood !== outer([x, y, z])) continue;   // on a face
        // Off each pass's arc by more than its chords' sagitta (the bodies' section is the arc's chords, CURVE_TOLERANCE).
        if (nearArc(b.length - x, T - z) || nearArc(y, T - z)) continue;
        tested += 1;
        const wA = roundoverWaste(b.length - x, T - z), wB = roundoverWaste(y, T - z);
        if (wA !== wB) both += 1;
        if (wood !== !(wA || wB)) bad += 1;
      }
      expect(both).toBeGreaterThan(100);   // the two passes disagree there: the sample can tell union from either alone
      expect(bad).toBe(0);
    });
  }
});
