import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { TENON_FIELDS, copyTenon, hasTenons, lowerTenons, mirrorTenons, sameTenon, tenonAt, tenonValues, tenonsOf, withTenons } from './roundTenons';
import type { RoundTenon } from './types';

const min: RoundTenon = { id: 't1', end: 'min', diameter: 1, length: 1.5 };
const max: RoundTenon = { id: 't2', end: 'max', diameter: 1, length: 1.5 };

describe('round tenons: the stored form (round tenons spec §3.1)', () => {
  it('TENON_FIELDS covers every key but id', () => {
    expect(Object.keys(TENON_FIELDS).sort()).toEqual(Object.keys(min).filter((k) => k !== 'id').sort());
  });

  it('sameTenon ignores the id and nothing else; -0 is told apart', () => {
    const renamed: RoundTenon = { ...min, id: 'other' };
    expect(sameTenon(min, renamed)).toBe(true);
    for (const patch of [{ end: 'max' as const }, { diameter: 1.0000001 }, { length: 1.5000001 }]) {
      expect(sameTenon(min, { ...min, ...patch })).toBe(false);
    }
    expect(tenonValues({ end: 'min', diameter: 1, length: 0 })).not.toBe(tenonValues({ end: 'min', diameter: 1, length: -0 }));
  });

  it('copyTenon is a fresh, equal object', () => {
    const c = copyTenon(min);
    expect(c).toEqual(min);
    expect(c).not.toBe(min);
  });

  it('a part with no key reads as no tenons', () => {
    const b = createBoard({ name: 'Leg' });
    expect('tenons' in b).toBe(false);
    expect(tenonsOf(b)).toEqual([]);
    expect(hasTenons(b)).toBe(false);
    expect(tenonAt(b, 'min')).toBeUndefined();
  });

  it('withTenons(b, []) has no tenons key (never [] or undefined)', () => {
    const b = withTenons(createBoard({ name: 'Leg' }), [min]);
    const bare = withTenons(b, []);
    expect('tenons' in bare).toBe(false);
    expect('tenons' in withTenons(createBoard({ name: 'Leg' }), [])).toBe(false);
  });

  it('order is canonical: min first', () => {
    const b = withTenons(createBoard({ name: 'Leg' }), [max, min]);
    expect(b.tenons!.map((t) => t.end)).toEqual(['min', 'max']);
    expect(tenonAt(b, 'max')).toBe(max);
    expect(hasTenons(b)).toBe(true);
  });
});

describe('round tenons: mirrors (round tenons spec §3.1, inv 44)', () => {
  // Chiral: a tenon on the max end only, so a reflection along the length is not the part itself.
  const chiral = [max];
  const two: RoundTenon[] = [min, { ...max, diameter: 0.75 }];

  it('mirrorTenons twice is the identity', () => {
    const once = mirrorTenons(chiral, 'length');
    expect(once.map((t) => t.end)).toEqual(['min']);
    expect(once[0]).toEqual({ ...max, end: 'min' });
    expect(mirrorTenons(once, 'length')).toEqual(chiral);
    // Two tenons: the ends swap and the list is re-sorted, min first; twice is the original.
    const swapped = mirrorTenons(two, 'length');
    expect(swapped.map((t) => [t.id, t.end])).toEqual([['t2', 'min'], ['t1', 'max']]);
    expect(mirrorTenons(swapped, 'length')).toEqual(two);
  });

  it('across the width or thickness it returns the SAME array', () => {
    expect(mirrorTenons(chiral, 'width')).toBe(chiral);
    expect(mirrorTenons(two, 'thickness')).toBe(two);
  });

  it('lowerTenons: an untouched list maps back to the stored array; a changed tenon is lowered by the flip; none adds no key', () => {
    const stored = [max];
    // Through a length mirror the draft carries the reflection; lowered, it is the stored array itself.
    expect(lowerTenons(stored, { tenons: mirrorTenons(stored, 'length') }, 'length').tenons).toBe(stored);
    // Across the width the draft is the stored list as it stands (a fresh copy): still the stored array.
    expect(lowerTenons(stored, { tenons: stored.map(copyTenon) }, 'width').tenons).toBe(stored);
    // An edited tenon is lowered back through the flip, a fresh object.
    const edited = lowerTenons(stored, { tenons: [{ ...max, end: 'min', length: 2 }] }, 'length').tenons!;
    expect(edited).toEqual([{ ...max, length: 2 }]);
    expect(edited).not.toBe(stored);
    // A draft with no tenons adds nothing: its own key, present or absent, is the after-state's.
    expect('tenons' in lowerTenons(stored, {}, 'length')).toBe(false);
    expect('tenons' in lowerTenons(undefined, {}, 'length')).toBe(false);
    expect('tenons' in lowerTenons(stored, { tenons: [] }, 'length')).toBe(false);
  });
});
