import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut } from './types';
import { angleDegrees, angleLine, shortPointLine } from './angleText';

const taper: AngleCut = { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] };
const miter = (from: 'min' | 'max', run = 2.5): AngleCut => ({ id: `m${from}`, kind: 'miter', face: 'length', from, along: 'width', alongFrom: 'min', points: [[0, 0], [run, run]] });

describe('angle text (spec §4.2)', () => {
  it('prints a taper in the existing vocabulary', () => {
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [taper] });
    expect(angleLine(leg, taper, 16)).toBe('Taper 5/8" off the width face (min side), from 24" from the length min end to that end');
  });
  it('falls back to both end depths when the line does not reach zero inside the part', () => {
    const c: AngleCut = { ...taper, points: [[0, 0.5], [58, 0]] };
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [c] });
    expect(angleLine(leg, c, 16)).toBe('Taper off the width face (min side): 1/2" at the length min end, 1/4" at the length max end');
  });
  it('prints a miter to 0.1°', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [miter('max')] });
    expect(angleLine(rail, miter('max'), 16)).toBe('Miter 45.0° across the width at the length max end');
    expect(angleDegrees({ ...miter('max'), points: [[0, 0], [2.5, 2.5 * Math.tan(Math.PI / 8)]] })).toBeCloseTo(22.5, 9);
  });
  it('prints the short point once, both ends subtracted', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [miter('max'), miter('min')] });
    expect(shortPointLine(rail, 16)).toBe('Short point 19"');
    expect(shortPointLine(createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [taper] }), 16)).toBeNull();
  });
  it('prints bevels and chamfers', () => {
    const b = createBoard({ length: 20, width: 3, thickness: 0.75 });
    const bevel: AngleCut = { id: 'b', kind: 'bevel', face: 'width', from: 'max', along: 'thickness', alongFrom: 'min', points: [[0, 0], [0.75, 0.75 * Math.tan(15 * Math.PI / 180)]] };
    const chamfer: AngleCut = { id: 'c', kind: 'chamfer', face: 'thickness', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0.125], [0.125, 0]] };
    expect(angleLine(b, bevel, 16)).toBe('Bevel 15.0° off the width face (max side), across the thickness');
    expect(angleLine(b, chamfer, 16)).toBe('Chamfer 1/8" × 1/8" off the thickness face (max side), at the width min edge');
  });
});
