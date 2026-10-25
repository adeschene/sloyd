import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { TENON_FIELDS, copyTenon, hasTenons, sameTenon, tenonAt, tenonValues, tenonsOf, withTenons } from './roundTenons';
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
