import { describe, expect, it } from 'vitest';
import { HOLE_KEYS, acrossOf, copyHoleRow, sameHoleRow } from './holes';
import type { HoleRow } from './types';

export const PIN: HoleRow = {
  id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min',
  station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5,
};

describe('hole rows (holes spec §2)', () => {
  it('sameHoleRow ignores the id and sees every other field', () => {
    const renamed: HoleRow = { ...PIN, id: 'other' };
    expect(sameHoleRow(PIN, renamed)).toBe(true);
    const changed: Record<string, unknown> = {
      face: 'width', from: 'min', diameter: 0.3, depth: 'through', along: 'width', alongFrom: 'max',
      station: 2.5, count: 20, pitch: 1.25, acrossFrom: 'max', inset: 1,
    };
    for (const k of HOLE_KEYS) expect(sameHoleRow(PIN, { ...PIN, [k]: changed[k] } as HoleRow), k).toBe(false);
  });
  it('copyHoleRow is equal and not the same object', () => {
    const c = copyHoleRow(PIN);
    expect(c).toEqual(PIN);
    expect(c).not.toBe(PIN);
  });
  it('acrossOf names the third dimension', () => {
    expect(acrossOf(PIN)).toBe('width');
    expect(acrossOf({ face: 'length', along: 'thickness' })).toBe('width');
    expect(acrossOf({ face: 'width', along: 'length' })).toBe('thickness');
  });
});
