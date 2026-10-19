import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { stockProbe, type Point } from './cuts';
import { holeFaults } from './holeFaults';
import { faultKey, holeFaultText } from './holeText';
import { boardSnapPoints } from './snapPoints';
import { fromWorldOffset, axisFrame } from './geometry';
import { geometryBoard, profileFaults } from './profiles';
import { BEARING, profileSection, sectionFrame, stopAxis } from './runout';
import { keptSection, oneSideCurve, sweptStops } from './sweep';
import { builtPath, profilePath } from './profilePath';
import { apronArch, frontOnly, loop, plainLoop, stopOnArch, stopOnCorner, topCorners } from './sweepFixtures';
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
