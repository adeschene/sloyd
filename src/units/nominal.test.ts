import { describe, expect, it } from 'vitest';
import { NOMINAL_SECTIONS, nominalName, stockLengthText } from './nominal';

describe('nominal names (custom materials spec §5)', () => {
  it('lists the seventeen sections, thinner side first', () => {
    expect(NOMINAL_SECTIONS.map((s) => s.name)).toEqual([
      '1×2', '1×3', '1×4', '1×6', '1×8', '1×10', '1×12',
      '2×2', '2×3', '2×4', '2×6', '2×8', '2×10', '2×12', '4×4', '4×6', '6×6',
    ]);
    expect(NOMINAL_SECTIONS.find((s) => s.name === '2×4')).toEqual({ name: '2×4', thickness: 1.5, width: 3.5 });
    expect(NOMINAL_SECTIONS.find((s) => s.name === '1×12')).toEqual({ name: '1×12', thickness: 0.75, width: 11.25 });
  });
  it('matches exactly, in either order', () => {
    expect(nominalName(1.5, 3.5)).toBe('2×4');
    expect(nominalName(3.5, 1.5)).toBe('2×4');
    expect(nominalName(0.75, 3.5)).toBe('1×4');
    expect(nominalName(3.5, 3.5)).toBe('4×4');
    expect(nominalName(1.5, 3.5 + 1e-10)).toBe('2×4');
  });
  it('never rounds: 3/8 short or 1e-6 off is no name', () => {
    expect(nominalName(0.75, 3.375)).toBeNull();
    expect(nominalName(1.5, 3.5 + 1e-6)).toBeNull();
    expect(nominalName(1, 4)).toBeNull();
  });
  it('writes whole-foot lengths in feet and anything else as today', () => {
    expect(stockLengthText(96, 16)).toBe('8′');
    expect(stockLengthText(144, 16)).toBe('12′');
    expect(stockLengthText(100, 16)).toBe('100"');
    expect(stockLengthText(72.5, 16)).toBe('72-1/2"');
  });
});
