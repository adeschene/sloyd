import { describe, expect, it } from 'vitest';
import {
  BAND_SIDES, BUILT_IN_BAND, BUILT_IN_BAND_ID, bandOn, canonicalBands, copyBand, mirrorBands, newBandType, sameBands,
  sameBandType, withBands,
} from './bandModel';
import { createBoard, createDocument } from './document';
import { sameShared } from './links';
import type { Band, ProfileSide } from './types';

const W0: ProfileSide = { across: 'width', from: 'min' };
const W1: ProfileSide = { across: 'width', from: 'max' };
const L0: ProfileSide = { across: 'length', from: 'min' };
const L1: ProfileSide = { across: 'length', from: 'max' };

describe('the band model (edge banding spec §2)', () => {
  it('a new document carries exactly the built-in band type; a new part has no bands and the default corner rule', () => {
    expect(createDocument('T').bandTypes).toEqual([BUILT_IN_BAND]);
    expect(BUILT_IN_BAND).toEqual({ id: BUILT_IN_BAND_ID, name: 'Iron-on veneer', kind: 'tape', thickness: 0,
      lengthAllowance: 0.5, tapeWidth: 0.875, pricePerFoot: null });
    const b = createBoard({});
    expect(b.bands).toEqual([]);
    expect(b.cornerRule).toBe('long');
  });
  it('canonical order is width min, width max, length min, length max; one band per side, the first wins', () => {
    expect(BAND_SIDES).toEqual([W0, W1, L0, L1]);
    const out = canonicalBands([{ side: L1, type: 'a' }, { side: W0, type: 'b' }, { side: L1, type: 'c' }]);
    expect(out).toEqual([{ side: W0, type: 'b' }, { side: L1, type: 'a' }]);
  });
  it('withBands sets, replaces and clears sides, in canonical order', () => {
    const one = withBands([], [L1, W0], 'x');
    expect(one).toEqual([{ side: W0, type: 'x' }, { side: L1, type: 'x' }]);
    expect(withBands(one, [W0], 'y')).toEqual([{ side: W0, type: 'y' }, { side: L1, type: 'x' }]);
    expect(withBands(one, [L1], null)).toEqual([{ side: W0, type: 'x' }]);
    expect(bandOn(one, L1)).toEqual({ side: L1, type: 'x' });
    expect(bandOn(one, W1)).toBeUndefined();
  });
  it('a mirror flips from on the sides across the mirrored dimension only, and re-sorts', () => {
    const bands: Band[] = [{ side: W0, type: 'a' }, { side: L1, type: 'b' }];
    expect(mirrorBands(bands, 'width')).toEqual([{ side: W1, type: 'a' }, { side: L1, type: 'b' }]);
    expect(mirrorBands(bands, 'length')).toEqual([{ side: W0, type: 'a' }, { side: L0, type: 'b' }]);
    expect(mirrorBands(bands, 'thickness')).toEqual(bands);
    expect(mirrorBands(mirrorBands(bands, 'width'), 'width')).toEqual(bands);
  });
  it('copies share no side object', () => {
    const b: Band = { side: W0, type: 'a' };
    const c = copyBand(b);
    expect(c).toEqual(b);
    expect(c.side).not.toBe(b.side);
  });
  it('sameBands compares in order, every field exactly', () => {
    const a: Band[] = [{ side: W0, type: 'a' }];
    expect(sameBands(a, [{ side: { ...W0 }, type: 'a' }])).toBe(true);
    expect(sameBands(a, [{ side: W1, type: 'a' }])).toBe(false);
    expect(sameBands(a, [{ side: W0, type: 'b' }])).toBe(false);
    expect(sameBands(a, [])).toBe(false);
  });
  it('Link compares bands and the corner rule (both shared, inv 45)', () => {
    const a = { ...createBoard({ id: 'a' }), bands: [{ side: W0, type: 'x' }] };
    expect(sameShared(a, { ...a, bands: [{ side: { ...W0 }, type: 'x' }] })).toBe(true);
    expect(sameShared(a, { ...a, bands: [{ side: W1, type: 'x' }] })).toBe(false);
    expect(sameShared(a, { ...a, cornerRule: 'mitre' })).toBe(false);
  });
  it('newBandType: tape and solid defaults, a unique name', () => {
    const t = newBandType('tape', [BUILT_IN_BAND]);
    expect(t).toMatchObject({ kind: 'tape', name: 'Tape', thickness: 0, lengthAllowance: 0.5, tapeWidth: 0.875, pricePerFoot: null });
    const s = newBandType('solid', [BUILT_IN_BAND]);
    expect(s).toMatchObject({ kind: 'solid', name: 'Solid edging', thickness: 0.25, lengthAllowance: 0.5, widthAllowance: 0.0625, material: 'maple' });
    expect(newBandType('solid', [BUILT_IN_BAND, s]).name).toBe('Solid edging 2');
    expect(t.id).not.toBe(s.id);
    expect(sameBandType(s, { ...s })).toBe(true);
    expect(sameBandType(s, { ...s, thickness: 0.5 })).toBe(false);
  });
});
