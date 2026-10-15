import { describe, expect, it } from 'vitest';
import { arcOf, bowsInto, copyCurve, curveOutline, curveValues, localSegments, sameCurve, uvDims } from './curves';
import {
  archCurve, archFields, bowCurve, bowFields, cornerCurve, cornerFields, curveFaults, deriveCurveKind,
  boundaryDistance, circleMeetsWaste, isAir, rectMeetsWaste, wasteContains,
} from './curves';
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
