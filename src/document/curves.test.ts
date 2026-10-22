import { describe, expect, it } from 'vitest';
import { arcOf, bowsInto, mirrorCurveCut, copyCurve, curveOutline, curveValues, localSegments, sameCurve, uvDims } from './curves';
import {
  archCurve, archFields, bowCurve, bowFields, cornerCurve, cornerFields, curveFaults, deriveCurveKind,
  boundaryDistance, circleMeetsWaste, isAir, rectMeetsWaste, wasteContains,
} from './curves';
import { convexPieces, twiceArea } from './curves';
import { defaultArch, defaultBow, defaultCorner, defaultCorners, defaultNotch } from './curves';
import { curveAs, curveKindChoice, curvePlacement } from './curves';
import type { P2 } from './curves';
import { createBoard } from './document';
import type { CurveCut } from './types';
import { ARCH, CORNER } from './curveFixtures';

describe('curve cuts (curves spec §2.1)', () => {
  it('uvDims: the other two dimensions in DIMENSION_ORDER', () => {
    expect(uvDims('thickness')).toEqual(['length', 'width']);
    expect(uvDims('width')).toEqual(['length', 'thickness']);
    expect(uvDims('length')).toEqual(['width', 'thickness']);
  });
  it('sameCurve ignores the id and sees every field, segments field by field', () => {
    const renamed: CurveCut = { ...ARCH, id: 'other' };
    expect(sameCurve(ARCH, renamed)).toBe(true);
    const variants: CurveCut[] = [
      { ...ARCH, through: 'width' }, { ...ARCH, uFrom: 'max' }, { ...ARCH, vFrom: 'max' }, { ...ARCH, start: [3.5, 0] },
      { ...ARCH, segments: [{ type: 'arc', to: [27, 0], side: 'right', rise: 1.5 }, { type: 'line', to: [3, 0] }] },
      { ...ARCH, segments: [{ type: 'arc', to: [27, 0], side: 'left', rise: 1.25 }, { type: 'line', to: [3, 0] }] },
      { ...ARCH, segments: [{ type: 'arc', to: [27, 0], side: 'left', radius: 1.5 }, { type: 'line', to: [3, 0] }] },
      { ...ARCH, segments: [{ type: 'arc', to: [26, 0], side: 'left', rise: 1.5 }, { type: 'line', to: [3, 0] }] },
    ];
    for (const v of variants) expect(sameCurve(ARCH, v), curveValues(v)).toBe(false);
  });
  it('curveValues tells -0 from 0', () => {
    expect(curveValues({ ...ARCH, start: [3, -0] })).not.toBe(curveValues(ARCH));
  });
  it('copyCurve is equal and shares no array', () => {
    const c = copyCurve(CORNER);
    expect(c).toEqual(CORNER);
    expect(c.start).not.toBe(CORNER.start);
    expect(c.segments).not.toBe(CORNER.segments);
    expect(c.segments[1]!.to).not.toBe(CORNER.segments[1]!.to);
  });
});

const apron = createBoard({ length: 30, width: 5, thickness: 0.75 });
const top = createBoard({ length: 36, width: 20, thickness: 0.75 });
const close = (a: readonly number[], b: readonly number[], eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]!) <= eps);

describe('arcOf (spec §2.2)', () => {
  it('rise → radius, crown and centre: a 24" chord with a 1-1/2" rise is radius 48-3/4', () => {
    const a = arcOf([3, 0], [27, 0], 'left', { rise: 1.5 }, 0);
    expect(a.radius).toBe(48.75);
    expect(close(a.crown, [15, 1.5])).toBe(true);
    expect(close(a.centre, [15, -47.25])).toBe(true);
    expect(a.sweep).toBeLessThan(0);                                    // bowing left of travel: clockwise about the centre
  });
  it('radius → rise: a quarter circle of radius 2', () => {
    const a = arcOf([2, 0], [0, 2], 'left', { radius: 2 }, 0);
    expect(close(a.centre, [2, 2])).toBe(true);
    expect(a.rise).toBeCloseTo(2 - Math.SQRT2, 12);
    expect(Math.abs(a.sweep)).toBeCloseTo(Math.PI / 2, 12);
  });
  it('a half circle: rise = half the chord', () => {
    const a = arcOf([0, 0], [2, 0], 'right', { rise: 1 }, 0);
    expect(a.radius).toBe(1);
    expect(close(a.crown, [1, -1])).toBe(true);
    expect(Math.abs(a.sweep)).toBeCloseTo(Math.PI, 12);
  });
});

describe('localSegments: stored → board-local (spec §2.2)', () => {
  it('measures from the named ends, and a reflection flips the side', () => {
    const [arc] = localSegments(top, CORNER);                           // uFrom max: u = 36 - stored u
    expect(arc!.kind).toBe('line');
    const segs = localSegments(top, CORNER);
    const a = segs[1] as Extract<ReturnType<typeof localSegments>[number], { kind: 'arc' }>;
    expect(close(a.a, [34, 0])).toBe(true);
    expect(close(a.b, [36, 2])).toBe(true);
    expect(close(a.centre, [34, 2])).toBe(true);                        // the arc still bows toward the corner (36, 0)
    expect(close(a.crown, [36 - (2 - Math.SQRT2), 2 - Math.SQRT2])).toBe(true);
  });
});

describe('curveOutline (spec §3.1)', () => {
  it('chords meet the tolerance and every vertex lies on the true arc', () => {
    const o = curveOutline(apron, ARCH);
    const arc = localSegments(apron, ARCH)[0] as Extract<ReturnType<typeof localSegments>[number], { kind: 'arc' }>;
    const onArc = o.pts.filter((_, i) => o.arcEdge[i] || o.arcEdge[(i - 1 + o.pts.length) % o.pts.length]);
    for (const p of onArc) expect(Math.abs(Math.hypot(p[0] - arc.centre[0], p[1] - arc.centre[1]) - arc.radius)).toBeLessThan(1e-9);
    const chords = o.arcEdge.filter(Boolean).length;
    const sag = arc.radius * (1 - Math.cos(Math.abs(arc.sweep) / chords / 2));
    expect(sag).toBeLessThanOrEqual(0.005 + 1e-12);
    expect(chords).toBe(18);                                            // the spike's count for this arch
    expect(close(o.pts[9]!, arc.crown, 1e-9)).toBe(true);               // t = 1/2 of 18 chords: the crown, so the chords run the minor way
    expect(o.pts[9]![1]).toBeGreaterThan(0);
  });
  it('caps the chord count', () => {
    expect(curveOutline(apron, ARCH, 1e-6, 24).arcEdge.filter(Boolean).length).toBe(24);
  });
  it('smooth: interior chord vertices and a corner\'s tangent ends; an arch\'s ends are sharp', () => {
    const a = curveOutline(apron, ARCH);
    expect(a.smooth[0]).toBe(false);                                    // (3, 0): the arch leaves the edge at an angle
    expect(a.smooth.filter(Boolean).length).toBe(17);                   // the 17 interior vertices
    const c = curveOutline(top, CORNER);
    const at = (p: P2) => c.pts.findIndex((q) => close(q, p));
    expect(c.smooth[at([34, 0])]).toBe(true);                           // the straight side runs into the arc tangentially
    expect(c.smooth[at([36, 2])]).toBe(true);
    expect(c.smooth[at([36, 0])]).toBe(false);
  });
});

describe('bowsInto', () => {
  it('an arch bows into the wood; a corner and a bow into the waste', () => {
    const segs = localSegments(apron, ARCH);
    expect(bowsInto(segs, segs[0] as never)).toBe('wood');
    const cs = localSegments(top, CORNER);
    expect(bowsInto(cs, cs[1] as never)).toBe('waste');
    const bow: CurveCut = { id: 'b', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0], segments: [{ type: 'line', to: [0, 0.5] }, { type: 'arc', to: [30, 0.5], side: 'right', rise: 0.5 }, { type: 'line', to: [30, 0] }, { type: 'line', to: [0, 0] }] };
    const bs = localSegments(apron, bow);
    expect(bowsInto(bs, bs[1] as never)).toBe('waste');
  });
});

describe('inside and distance, on the true arcs', () => {
  const segs = localSegments(apron, ARCH);
  it('the crown is on the boundary; just under it is waste; the chord line is the boundary', () => {
    expect(boundaryDistance(segs, [15, 1.5])).toBeLessThan(1e-9);
    expect(wasteContains(segs, [15, 1.4], 'open')).toBe(true);
    expect(wasteContains(segs, [15, 1.6], 'closed')).toBe(false);
    expect(wasteContains(segs, [15, 0], 'closed')).toBe(true);
    expect(wasteContains(segs, [15, 0], 'open')).toBe(false);
  });
  it('a corner: the region between the corner and the arc; the chord line is NOT waste', () => {
    const cs = localSegments(top, CORNER);
    expect(wasteContains(cs, [35.9, 0.1], 'open')).toBe(true);
    expect(wasteContains(cs, [35, 1], 'closed')).toBe(false);          // on the chord (34,0)–(36,2), inside the arc's lens
  });
  it('isAir (P3): the middle of the arched edge is air; an arc end is not; the rect corner of a rounded corner is air', () => {
    expect(isAir(apron, ARCH, [15, 0])).toBe(true);
    expect(isAir(apron, ARCH, [3, 0])).toBe(false);
    expect(isAir(apron, ARCH, [15, 1.5])).toBe(false);
    expect(isAir(top, CORNER, [36, 0])).toBe(true);
    expect(isAir(top, CORNER, [20, 10])).toBe(false);
  });
  it('a circle meets the waste when it touches it', () => {
    expect(circleMeetsWaste(segs, [15, 2], 0.5)).toBe(true);           // touches the crown
    expect(circleMeetsWaste(segs, [15, 2], 0.5 - 1e-6)).toBe(false);
    expect(circleMeetsWaste(segs, [15, 0.5], 0.1)).toBe(true);         // inside
  });
  it('a rectangle meets the waste when it touches it', () => {
    expect(rectMeetsWaste(segs, [14, 1.5], [16, 3])).toBe(true);       // its edge touches the crown
    expect(rectMeetsWaste(segs, [14, 1.5 + 1e-6], [16, 3])).toBe(false);
    expect(rectMeetsWaste(segs, [0, 0], [2, 5])).toBe(false);          // beside the arch
  });
});

describe('curveFaults (spec §2.5)', () => {
  it('none for the arch, the corner and a bow', () => {
    expect(curveFaults(apron, ARCH)).toEqual([]);
    expect(curveFaults(top, CORNER)).toEqual([]);
    expect(curveFaults(apron, bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }))).toEqual([]);
  });
  it('runs-off: an arch on a shortened part names the side it passes (Review Focus 1)', () => {
    expect(curveFaults({ ...apron, length: 26 }, ARCH)).toEqual([{ kind: 'runs-off', edge: { dim: 'length', side: 'max' } }]);
  });
  it('runs-off at the width max side when only the crown is outside the face (ends inside)', () => {
    expect(curveFaults({ ...apron, width: 1 }, ARCH)).toContainEqual({ kind: 'runs-off', edge: { dim: 'width', side: 'max' } });
  });
  it('cuts-through: a rise equal to the width touches the far side; just under it does not', () => {
    const deep = (rise: number) => archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise });
    expect(curveFaults({ ...apron, width: 1.5 }, deep(1.5))).toEqual([{ kind: 'cuts-through' }]);
    expect(curveFaults({ ...apron, width: 1.5 + 1e-6 }, deep(1.5))).toEqual([]);
  });
});

describe('writers and readers (spec §2.2 canonical forms)', () => {
  it('archCurve writes the spec\'s apron arch and archFields reads it back', () => {
    const f = { through: 'thickness' as const, along: 'length' as const, side: 'min' as const, from: 'min' as const, start: 3, span: 24, rise: 1.5 };
    const { id: _id, ...arch } = ARCH;
    expect(archCurve(f)).toEqual(arch);
    expect(archFields(archCurve(f))).toEqual(f);
  });
  it('an arch along v (on an end) round-trips', () => {
    const f = { through: 'thickness' as const, along: 'width' as const, side: 'max' as const, from: 'min' as const, start: 1, span: 3, rise: 0.5 };
    expect(archFields(archCurve(f))).toEqual(f);
    expect(archCurve(f).segments[0]).toMatchObject({ side: 'right' });
  });
  it('bow and corner round-trip; the spec\'s corner is cornerCurve', () => {
    const b = { through: 'width' as const, along: 'length' as const, side: 'max' as const, span: 18, rise: 0.5 };
    expect(bowFields(bowCurve(b))).toEqual(b);
    const c = { through: 'thickness' as const, uFrom: 'max' as const, vFrom: 'min' as const, radius: 2 };
    const { id: _id, ...corner } = CORNER;
    expect(cornerCurve(c)).toEqual(corner);
    expect(cornerFields(cornerCurve(c))).toEqual(c);
  });
  it('deriveCurveKind; a form no row represents is null', () => {
    expect(deriveCurveKind(ARCH)).toBe('arch');
    expect(deriveCurveKind(CORNER)).toBe('corner');
    expect(deriveCurveKind(bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }))).toBe('bow');
    expect(deriveCurveKind({ ...ARCH, segments: [{ type: 'arc', to: [27, 0], side: 'left', radius: 50 }, { type: 'line', to: [3, 0] }] })).toBeNull();
  });
});

describe('an arc bowing into the wood keeps its chord as waste', () => {
  const quarter: Omit<CurveCut, 'id'> = {
    through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0],
    segments: [{ type: 'line', to: [10, 0] }, { type: 'arc', to: [0, 10], side: 'right', radius: 10 }, { type: 'line', to: [0, 0] }],
  };
  const off: Omit<CurveCut, 'id'> = {
    through: 'thickness', uFrom: 'min', vFrom: 'min', start: [2, 0],
    segments: [{ type: 'arc', to: [8, 0], side: 'right', rise: 1 }, { type: 'line', to: [8, 3] }, { type: 'line', to: [2, 3] }, { type: 'line', to: [2, 0] }],
  };
  it('a quarter-disc waste: the chord point is waste and air', () => {
    const segs = localSegments(top, quarter);
    expect(curveFaults(top, quarter)).toEqual([]);
    expect(wasteContains(segs, [5, 5], 'closed')).toBe(true);
    expect(wasteContains(segs, [5, 5], 'open')).toBe(true);
    expect(isAir(top, quarter, [5, 5])).toBe(true);
  });
  it('an arc bowing off the part adds no spurious cuts-through', () => {
    expect(wasteContains(localSegments(apron, off), [5, 0], 'closed')).toBe(true);
    expect(curveFaults(apron, off).some((x) => x.kind === 'cuts-through')).toBe(false);
  });
});

describe('mirrorCurveCut (inv 44: a flag flip, no arithmetic)', () => {
  it('flips exactly the flag on the mirrored dimension; through changes nothing', () => {
    expect(mirrorCurveCut(ARCH, 'length')).toEqual({ ...ARCH, uFrom: 'max' });
    expect(mirrorCurveCut(ARCH, 'width')).toEqual({ ...ARCH, vFrom: 'max' });
    expect(mirrorCurveCut(ARCH, 'thickness')).toEqual(ARCH);
    expect(mirrorCurveCut(mirrorCurveCut(ARCH, 'width'), 'width')).toEqual(ARCH);
  });
  it('a reflected arch still bows into the wood (localSegments flips the side)', () => {
    const m = mirrorCurveCut(ARCH, 'width');
    const [arc] = localSegments(apron, m) as [Extract<ReturnType<typeof localSegments>[number], { kind: 'arc' }>];
    expect(close(arc.crown, [15, 5 - 1.5])).toBe(true);
  });
});

describe('convexPieces', () => {
  it('a convex outline is one piece; an L is split, every original arc edge kept flagged', () => {
    expect(convexPieces([[0, 0], [2, 0], [2, 2], [0, 2]], [false, true, false, false])).toEqual([{ pts: [[0, 0], [2, 0], [2, 2], [0, 2]], onArc: [false, true, false, false] }]);
    const l = convexPieces([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], [false, true, false, false, false, false]);
    expect(l.length).toBeGreaterThan(1);
    expect(l.reduce((s, p) => s + Math.abs(twiceArea(p.pts)) / 2, 0)).toBeCloseTo(3, 12);
    expect(l.flatMap((p) => p.onArc).filter(Boolean)).toHaveLength(1);
  });
  it('a vertex touching an edge (a Bow\'s crown on its own edge): the pieces partition the area and none is degenerate', () => {
    const poly: P2[] = [[0, 0], [0, 1], [2, 0], [4, 1], [4, 0]];           // clockwise, as a Bow's outline runs
    const pieces = convexPieces(poly, [false, true, true, false, false]);
    expect(pieces.reduce((s, p) => s + Math.abs(twiceArea(p.pts)) / 2, 0)).toBeCloseTo(Math.abs(twiceArea(poly)) / 2, 12);
    expect(pieces.every((p) => twiceArea(p.pts) > 1e-9)).toBe(true);      // CCW, real area
    // The flags sit on the ORIGINAL arc edges (0,1)–(2,0) and (2,0)–(4,1), whatever the reversal did to the order.
    const flagged = pieces.flatMap((p) => p.pts.flatMap((a, i) => (p.onArc[i] ? [[a, p.pts[(i + 1) % p.pts.length]!]] : [])))
      .map(([a, b]) => [a!, b!].map((q) => q.join(',')).sort().join(' ')).sort();
    expect(flagged).toEqual(['0,1 2,0', '2,0 4,1']);
  });  it('triangles are merged across diagonals while convex (fu 368): an L is two pieces, a comb fewer than its triangles', () => {
    const strictlyConvex = (q: P2[]) => q.every((p, i) => {
      const a = q[(i + 1) % q.length]!, b = q[(i + 2) % q.length]!;
      return (a[0] - p[0]) * (b[1] - p[1]) - (a[1] - p[1]) * (b[0] - p[0]) > 1e-9;
    });
    // An L: the fewest convex pieces is 2.
    const l = convexPieces([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], [false, true, false, false, false, false]);
    expect(l).toHaveLength(2);
    // A comb with three teeth: 12 vertices, 10 triangles; merged, every piece strictly convex and CCW, the area whole.
    const comb: P2[] = [[0, 0], [5, 0], [5, 2], [4, 2], [4, 1], [3, 1], [3, 2], [2, 2], [2, 1], [1, 1], [1, 2], [0, 2]];
    const pieces = convexPieces(comb, comb.map(() => false));
    expect(pieces.length).toBeLessThan(comb.length - 2);
    expect(pieces.every((p) => strictlyConvex(p.pts))).toBe(true);
    expect(pieces.reduce((s2, p) => s2 + twiceArea(p.pts) / 2, 0)).toBeCloseTo(twiceArea(comb) / 2, 12);
  });
});

describe('presets (spec §8)', () => {
  it('presets are byte-identical across the helper refactor (presets-batch spec §4)', () => {
    const pins = [apron, top, createBoard({ length: 3, width: 2, thickness: 0.75 }), createBoard({ length: 6, width: 5, thickness: 0.75 })]
      .map((b) => JSON.stringify([defaultArch(b), defaultNotch(b), defaultBow(b), defaultCorner(b), defaultCorners(b)]));
    expect(pins).toMatchInlineSnapshot(`
      [
        "[{"through":"thickness","uFrom":"min","vFrom":"min","start":[3,0],"segments":[{"type":"arc","to":[27,0],"side":"left","rise":1.25},{"type":"line","to":[3,0]}]},{"through":"thickness","uFrom":"min","vFrom":"min","start":[14,0],"segments":[{"type":"arc","to":[16,0],"side":"left","rise":1},{"type":"line","to":[14,0]}]},{"through":"thickness","uFrom":"min","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[0,0.5]},{"type":"arc","to":[30,0.5],"side":"right","rise":0.5},{"type":"line","to":[30,0]},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"min","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]},[{"through":"thickness","uFrom":"min","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"min","vFrom":"max","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"max","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"max","vFrom":"max","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]}]]",
        "[{"through":"thickness","uFrom":"min","vFrom":"min","start":[3,0],"segments":[{"type":"arc","to":[33,0],"side":"left","rise":1.5},{"type":"line","to":[3,0]}]},{"through":"thickness","uFrom":"min","vFrom":"min","start":[17,0],"segments":[{"type":"arc","to":[19,0],"side":"left","rise":1},{"type":"line","to":[17,0]}]},{"through":"thickness","uFrom":"min","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[0,0.5]},{"type":"arc","to":[36,0.5],"side":"right","rise":0.5},{"type":"line","to":[36,0]},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"min","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]},[{"through":"thickness","uFrom":"min","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"min","vFrom":"max","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"max","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"max","vFrom":"max","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]}]]",
        "[null,{"through":"thickness","uFrom":"min","vFrom":"min","start":[0.5,0],"segments":[{"type":"arc","to":[2.5,0],"side":"left","rise":1},{"type":"line","to":[0.5,0]}]},{"through":"thickness","uFrom":"min","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[0,0.5]},{"type":"arc","to":[3,0.5],"side":"right","rise":0.5},{"type":"line","to":[3,0]},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"min","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[0.5,0]},{"type":"arc","to":[0,0.5],"side":"left","radius":0.5},{"type":"line","to":[0,0]}]},[{"through":"thickness","uFrom":"min","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[0.5,0]},{"type":"arc","to":[0,0.5],"side":"left","radius":0.5},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"min","vFrom":"max","start":[0,0],"segments":[{"type":"line","to":[0.5,0]},{"type":"arc","to":[0,0.5],"side":"left","radius":0.5},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"max","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[0.5,0]},{"type":"arc","to":[0,0.5],"side":"left","radius":0.5},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"max","vFrom":"max","start":[0,0],"segments":[{"type":"line","to":[0.5,0]},{"type":"arc","to":[0,0.5],"side":"left","radius":0.5},{"type":"line","to":[0,0]}]}]]",
        "[null,{"through":"thickness","uFrom":"min","vFrom":"min","start":[2,0],"segments":[{"type":"arc","to":[4,0],"side":"left","rise":1},{"type":"line","to":[2,0]}]},{"through":"thickness","uFrom":"min","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[0,0.5]},{"type":"arc","to":[6,0.5],"side":"right","rise":0.5},{"type":"line","to":[6,0]},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"min","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]},[{"through":"thickness","uFrom":"min","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"min","vFrom":"max","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"max","vFrom":"min","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]},{"through":"thickness","uFrom":"max","vFrom":"max","start":[0,0],"segments":[{"type":"line","to":[1,0]},{"type":"arc","to":[0,1],"side":"left","radius":1},{"type":"line","to":[0,0]}]}]]",
      ]
    `);
  });
  it('arch: through the thickness on the width min side, 3" in from each length end, rise min(1-1/2, width/4)', () => {
    expect(defaultArch(apron)).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }));
    expect(defaultArch(createBoard({ length: 6, width: 5, thickness: 0.75 }))).toBeNull();     // no span left
  });
  it('notch: 2" wide, centred, rise 1', () => {
    expect(defaultNotch(apron)).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 }));
    expect(defaultNotch(createBoard({ length: 1.5, width: 5, thickness: 0.75 }))).toBeNull();
  });
  it('bow: the whole width min side, rise min(1/2, width/4)', () => {
    expect(defaultBow(apron)).toEqual(bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }));
  });
  it('corner and corners: radius min(1, smaller face dimension / 4)', () => {
    expect(defaultCorner(top)).toEqual(cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }));
    expect(defaultCorners(createBoard({ length: 3, width: 2, thickness: 0.75 }))).toHaveLength(4);
    expect(defaultCorners(createBoard({ length: 3, width: 2, thickness: 0.75 }))![0]).toMatchObject({ segments: [{ to: [0.5, 0] }, {}, {}] });
  });
});

describe('curveAs: a kind change keeps placement, takes preset sizes (fu 367)', () => {
  const arch = archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 });
  const notch = archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 });
  const bow = bowCurve({ through: 'thickness', along: 'length', side: 'max', span: 30, rise: 0.5 });
  const corner = cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'min', radius: 1 });
  it('reads the kind, a notch being an arch at rise = span / 2', () => {
    expect([arch, notch, bow, corner].map(curveKindChoice)).toEqual(['arch', 'notch', 'bow', 'corner']);
  });
  it('reads placement; a corner maps u to along, its v flag to side, its u flag to from', () => {
    expect(curvePlacement(bow)).toEqual({ through: 'thickness', along: 'length', side: 'max', from: 'min' });
    expect(curvePlacement(corner)).toEqual({ through: 'thickness', along: 'length', side: 'min', from: 'max' });
  });
  it('arch → bow / corner; arch → notch keeps start and span', () => {
    expect(curveAs('bow', arch, apron)).toEqual(bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }));
    expect(curveAs('corner', arch, apron)).toEqual(cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }));
    expect(curveAs('notch', arch, apron)).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 12 }));
  });
  it('notch → arch keeps start and span, rise = span / 4', () => {
    expect(curveAs('arch', notch, apron)).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 0.5 }));
  });
  it('bow → arch / notch on its own side, from the min end', () => {
    expect(curveAs('arch', bow, apron)).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'max', from: 'min', start: 3, span: 24, rise: 1.25 }));
    expect(curveAs('notch', bow, apron)).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'max', from: 'min', start: 14, span: 2, rise: 1 }));
  });
  it('corner → arch → corner round-trips its flags (stored, never re-derived)', () => {
    const a = curveAs('arch', corner, apron)!;
    expect(a).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'max', start: 3, span: 24, rise: 1.25 }));
    expect(curveAs('corner', a, apron)).toEqual(corner);
    expect(curveAs('bow', corner, apron)).toEqual(bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }));
  });
  it('keeps another through and an along on v', () => {
    const b = createBoard({ length: 30, width: 0.75, thickness: 5 });
    const v = archCurve({ through: 'width', along: 'thickness', side: 'min', from: 'min', start: 1, span: 3, rise: 1 });
    expect(curveAs('bow', v, b)).toEqual(bowCurve({ through: 'width', along: 'thickness', side: 'min', span: 5, rise: 0.5 }));
  });
  it('the same kind is the curve itself; null when the target cannot be built or the source is unrepresentable', () => {
    expect(curveAs('arch', arch, apron)).toEqual(arch);
    expect(curveAs('arch', bow, createBoard({ length: 6, width: 5, thickness: 0.75 }))).toBeNull();      // no span left
    expect(curveAs('notch', bow, createBoard({ length: 1.5, width: 5, thickness: 0.75 }))).toBeNull();
    const odd: Omit<CurveCut, 'id'> = { through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0],
      segments: [{ type: 'line', to: [2, 0] }, { type: 'line', to: [0, 1] }, { type: 'line', to: [0, 0] }] };
    expect(curveAs('bow', odd, apron)).toBeNull();
  });
});

// ── Joinery features chunk 2 (spec §3.3, P4, P6): the OPEN rectangle test and the waste's length on a segment.
import { rectOverlapsWaste, wasteOnSegment } from './curves';

describe('rectOverlapsWaste (OPEN: overlap above 1e-9; spec §3.3, P4)', () => {
  it('a rect touching a Bow\'s end edge across the height its arc starts at is not an overlap (fu 415)', () => {
    // segArcHits' tolerance reports the arc's circle crossing the rect's side just past the arc's end; only a stretch of
    // the side inside the waste counts.
    const b = createBoard({ length: 18, width: 3.5, thickness: 0.75 });
    const bow = localSegments(b, defaultBow(b));
    expect(rectOverlapsWaste(bow, [-1.5, 0], [0, 3.5])).toBe(false);
    expect(rectOverlapsWaste(bow, [-1.5, 0], [1e-6, 3.5])).toBe(true);
  });
  const B = { length: 30, width: 5, thickness: 0.75 };
  // A 1" rounded corner at (0, 0): its waste is [0, 1]² outside the circle about (1, 1).
  const corner = localSegments(B, cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }));
  // The 30 × 5 apron's arch: crown at (15, 1.5).
  const arch = localSegments(B, ARCH);
  it('a rect sharing an edge with a rounded corner\'s waste is not an overlap; pushed 1e-6 in, it is', () => {
    expect(rectMeetsWaste(corner, [1, 0], [3, 2])).toBe(true);          // the closed test: touching meets
    expect(rectOverlapsWaste(corner, [1, 0], [3, 2])).toBe(false);      // shares the leg u = 1 (only its end point)
    expect(rectOverlapsWaste(corner, [-2, 0], [0, 1])).toBe(false);     // shares the leg u = 0 along its whole length
    expect(rectOverlapsWaste(corner, [-2, 0], [1e-6, 1])).toBe(true);
    expect(rectOverlapsWaste(corner, [0, -1], [1, 0])).toBe(false);     // under the leg v = 0
    expect(rectOverlapsWaste(corner, [0, -1], [1, 1e-6])).toBe(true);
  });
  it('a rect tangent to an arch\'s crown is not an overlap; pushed 1e-6 in, it is', () => {
    expect(rectMeetsWaste(arch, [10, 1.5], [20, 3])).toBe(true);
    expect(rectOverlapsWaste(arch, [10, 1.5], [20, 3])).toBe(false);
    expect(rectOverlapsWaste(arch, [10, 1.5 - 1e-6], [20, 3])).toBe(true);
  });
  it('a rect inside the waste overlaps; an empty one never does', () => {
    expect(rectOverlapsWaste(arch, [14, 0.2], [16, 0.4])).toBe(true);
    expect(rectOverlapsWaste(arch, [15, 0.2], [15 + 1e-9, 0.4])).toBe(false);   // narrower than 4e-9: empty once shrunk
  });
});

describe('wasteOnSegment (the end line inside the closed waste; P6)', () => {
  const B = { length: 30, width: 5, thickness: 0.75 };
  const end: [P2, P2] = [[0, 0], [0, 5]];   // the length-min end, in (length, width)
  it('a rounded corner of radius r at the end gives r', () => {
    for (const r of [1, 0.375, 1.25]) {
      const segs = localSegments(B, cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: r }));
      expect(Math.abs(wasteOnSegment(segs, ...end) - r)).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(wasteOnSegment(segs, end[1], end[0]) - r)).toBeLessThanOrEqual(1e-12);   // either direction
    }
    // The corner at the other end of the length: nothing on this end.
    expect(wasteOnSegment(localSegments(B, cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'min', radius: 1 })), ...end)).toBe(0);
  });
  it('an arch running corner to corner (chord along the edge) gives 0: its waste meets the end at a point', () => {
    const segs = localSegments(B, archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 0, span: 30, rise: 0.5 }));
    expect(wasteOnSegment(segs, ...end)).toBe(0);
  });
  it('a bow running corner to corner gives its rise: its end horns lie along the end line (P6)', () => {
    // bowCurve keeps the edge's middle and brings its ENDS in by `rise`: the waste's side (0,0)→(0,rise) is on the end line.
    const segs = localSegments(B, defaultBow(B));
    expect(Math.abs(wasteOnSegment(segs, ...end) - 0.5)).toBeLessThanOrEqual(1e-12);
    expect(Math.abs(wasteOnSegment(segs, [30, 0], [30, 5]) - 0.5)).toBeLessThanOrEqual(1e-12);
  });
  it('an arch clear of the end gives 0', () => {
    expect(wasteOnSegment(localSegments(B, ARCH), ...end)).toBe(0);
  });
  it('a notch cut from the end edge gives its width', () => {
    // A half-round notch on the length-min end, centred across the width: 2" wide (rise 1).
    const segs = localSegments(B, archCurve({ through: 'thickness', along: 'width', side: 'min', from: 'min', start: 1.5, span: 2, rise: 1 }));
    expect(Math.abs(wasteOnSegment(segs, ...end) - 2)).toBeLessThanOrEqual(1e-12);
    // A segment wholly inside the waste is its own length; one wholly clear of it, 0.
    expect(Math.abs(wasteOnSegment(segs, [0.5, 2], [0.5, 3]) - 1)).toBeLessThanOrEqual(1e-12);
    expect(wasteOnSegment(segs, [5, 0], [5, 5])).toBe(0);
  });
});

describe('a Half-round notch is stored at the half-circle bound of its STORED chord (notch drop on metric parts)', () => {
  // archCurve stores `to` as start + span, which on a metric part need not leave a chord of exactly `span`: a rise of
  // span / 2 then passed the loader's `rise > chord / 2` check (the notch was dropped on reload) or fell short of it
  // (read back as an Arch). Every metric length from 300 to 1500 mm.
  const lengths = Array.from({ length: 1201 }, (_, i) => (300 + i) / 25.4);
  const chordOf = (c: Omit<CurveCut, 'id'>) => c.segments[0]!.to[0] - c.start[0];
  const rise = (c: Omit<CurveCut, 'id'>) => (c.segments[0] as { rise: number }).rise;

  it('the Half-round notch preset keeps rise === chord / 2 and reads as a notch', () => {
    const bad = lengths.filter((L) => {
      const c = defaultNotch(createBoard({ length: L, width: 4, thickness: 0.75 }))!;
      return rise(c) !== chordOf(c) / 2 || curveKindChoice(c) !== 'notch';
    });
    expect(bad).toEqual([]);
  });

  it('switching an Arch to a Half-round notch does the same', () => {
    const bad = lengths.filter((L) => {
      const b = createBoard({ length: L, width: 4, thickness: 0.75 });
      const arch = archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: L / 3, span: 2, rise: 0.5 });
      const c = curveAs('notch', arch, b)!;
      return rise(c) !== chordOf(c) / 2 || curveKindChoice(c) !== 'notch';
    });
    expect(bad).toEqual([]);
  });

  it('an Arch below the bound keeps its rise exactly', () => {
    const c = defaultArch(createBoard({ length: 370 / 25.4, width: 4, thickness: 0.75 }))!;
    expect(rise(c)).toBe(1);
  });
});
