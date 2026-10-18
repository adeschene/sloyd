import { describe, expect, it } from 'vitest';
import { stockProbe, type Point } from './cuts';
import { holeFaults } from './holeFaults';
import { faultKey, holeFaultText } from './holeText';
import { boardSnapPoints } from './snapPoints';
import { fromWorldOffset, axisFrame } from './geometry';
import { geometryBoard, profileFaults } from './profiles';
import { profileSection } from './runout';
import { keptSection, oneSideCurve } from './sweep';
import { apronArch, frontOnly, loop, plainLoop, topCorners } from './sweepFixtures';
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
    // Along the length min end side, x = 0.15: 0.4" past the corner's tangent point at (0, 2). The station is ε past it
    // (Task 6 fix round 1: ε = 2 · reach · tan(π/96) = 0.0164).
    const y0 = 2 + 2 * 0.25 * Math.tan(Math.PI / 96);
    const r = (y: number): HoleRow => hole(y, { station: 0.15 });
    expect(faults(frontOnly, r(2.4))).toEqual([{ index: 0, kind: 'breaks-out', curve: { id: 'p1', kind: null, profile: 'roundover' } }]);
    // The extension ends at (0, y0 + 0.5); within reach + radius of that point: + sqrt(0.375² − 0.15²) = y0 + 0.8437 = 2.8601.
    const edge = y0 + 0.5 + Math.sqrt(0.375 ** 2 - 0.15 ** 2);
    expect(faults(frontOnly, r(edge - 0.01)).map((f) => f.kind)).toEqual(['breaks-out']);
    expect(faults(frontOnly, r(edge + 0.01))).toEqual([]);
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
