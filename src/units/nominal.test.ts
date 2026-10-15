import { describe, expect, it } from 'vitest';
import { NOMINAL_SECTIONS, nominalName, stockLengthText } from './nominal';
import { IMPERIAL, type Units } from './length';

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
    expect(nominalName(1.5, 3.5, IMPERIAL)).toBe('2×4');
    expect(nominalName(3.5, 1.5, IMPERIAL)).toBe('2×4');
    expect(nominalName(0.75, 3.5, IMPERIAL)).toBe('1×4');
    expect(nominalName(3.5, 3.5, IMPERIAL)).toBe('4×4');
    expect(nominalName(1.5, 3.5 + 1e-10, IMPERIAL)).toBe('2×4');
  });
  it('never rounds: 3/8 short or 1e-6 off is no name', () => {
    expect(nominalName(0.75, 3.375, IMPERIAL)).toBeNull();
    expect(nominalName(1.5, 3.5 + 1e-6, IMPERIAL)).toBeNull();
    expect(nominalName(1, 4, IMPERIAL)).toBeNull();
  });
  it('writes whole-foot lengths in feet and anything else as today', () => {
    expect(stockLengthText(96, 16)).toBe('8′');
    expect(stockLengthText(144, 16)).toBe('12′');
    expect(stockLengthText(100, 16)).toBe('100"');
    expect(stockLengthText(72.5, 16)).toBe('72-1/2"');
  });
});

describe('metric: a section matches when both sides read the same whole mm (fu 354)', () => {
  const MM: Units = { display: 'metric-mm', precision: 16 };
  const mm = (n: number) => n / 25.4;
  it.each([
    [19, 38, '1×2'], [19, 89, '1×4'], [19, 140, '1×6'], [19, 184, '1×8'], [19, 235, '1×10'], [19, 286, '1×12'],
    [38, 64, '2×3'], [38, 89, '2×4'], [89, 38, '2×4'], [89, 89, '4×4'],
  ])('%s × %s mm is %s', (t, w, name) => expect(nominalName(mm(t), mm(w), MM)).toBe(name));
  it('a mm off is no name', () => {
    expect(nominalName(mm(38), mm(90), MM)).toBeNull();
    expect(nominalName(mm(19), mm(287), MM)).toBeNull();
  });
  it('imperial stays exact: 89 mm (3.504") is not a 2×4', () => {
    expect(nominalName(1.5, mm(89), IMPERIAL)).toBeNull();
  });
});
