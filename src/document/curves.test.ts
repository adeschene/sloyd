import { describe, expect, it } from 'vitest';
import { arcOf, bowsInto, copyCurve, curveOutline, curveValues, localSegments, sameCurve, uvDims } from './curves';
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
