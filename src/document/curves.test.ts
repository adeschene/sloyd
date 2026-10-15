import { describe, expect, it } from 'vitest';
import { copyCurve, curveValues, sameCurve, uvDims } from './curves';
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
