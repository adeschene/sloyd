import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut } from './types';
import { boardBodies, bodyVerts } from './bodies';
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
  it('words a taper that deepens toward the far end from the deep end', () => {
    const c: AngleCut = { ...taper, points: [[5, 0], [29, 0.625]] };
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [c] });
    expect(angleLine(leg, c, 16)).toBe('Taper 5/8" off the width face (min side), from 24" from the length max end to that end');
  });
  it('uses the standard form when the line reaches zero exactly at the far end', () => {
    const c: AngleCut = { ...taper, points: [[0, 0.625], [29, 0]] };
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [c] });
    expect(angleLine(leg, c, 16)).toBe('Taper 5/8" off the width face (min side), from 29" from the length min end to that end');
  });
  it('words a taper that is zero at the anchored end and deep at the far end', () => {
    const c: AngleCut = { ...taper, points: [[0, 0], [29, 0.625]] };
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [c] });
    expect(angleLine(leg, c, 16)).toBe('Taper 5/8" off the width face (min side), from 29" from the length max end to that end');
  });
  it('prints 22.5° for a 22.5° miter', () => {
    const c: AngleCut = { ...miter('max'), points: [[0, 0], [2.5, 2.5 * Math.tan(Math.PI / 8)]] };
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [c] });
    expect(angleLine(rail, c, 16)).toBe('Miter 22.5° across the width at the length max end');
  });
  it('short point counts an end cut whatever its kind, and clamps at zero', () => {
    const asBevel: AngleCut = { ...miter('max'), kind: 'bevel' };
    expect(shortPointLine(createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [asBevel] }), 16)).toBe('Short point 21-1/2"');
    expect(shortPointLine(createBoard({ length: 2, width: 2.5, thickness: 0.75, angleCuts: [miter('max')] }), 16)).toBe('Short point 0"');
  });

  describe('short point is the shortest long edge (fu 281)', () => {
    /** Shortest length, along the board's length, of the four long edges, measured off the real solids. */
    const measured = (b: ReturnType<typeof createBoard>) => {
      const v = boardBodies(b).flatMap(bodyVerts);
      let least = Infinity;
      for (const w of [0, b.width]) for (const t of [0, b.thickness]) {
        // The edge's remaining stretch: extremes of x among vertices on that edge line.
        const on = v.filter((p) => Math.abs(p[1] - w) < 1e-9 && Math.abs(p[2] - t) < 1e-9);
        if (on.length === 0) continue;
        least = Math.min(least, Math.max(...on.map((p) => p[0])) - Math.min(...on.map((p) => p[0])));
      }
      return least;
    };
    const mk = (cuts: AngleCut[], d: [number, number, number] = [20, 3.5, 0.75]) => createBoard({ length: d[0], width: d[1], thickness: d[2], angleCuts: cuts });
    const end = (from: 'min' | 'max', along: 'width' | 'thickness', alongFrom: 'min' | 'max', run: number): AngleCut =>
      ({ id: `e${from}${along}`, kind: 'miter', face: 'length', from, along, alongFrom, points: [[0, 0], [run, run]] });

    it('parallel 45 degree ends: both long edges are 16-1/2, not 13', () => {
      const brace = mk([end('min', 'width', 'min', 3.5), end('max', 'width', 'max', 3.5)]);
      expect(measured(brace)).toBeCloseTo(16.5, 9);
      expect(shortPointLine(brace, 16)).toBe('Short point 16-1/2"');
    });
    it('trapezoid ends still subtract both', () => {
      const rail = mk([end('min', 'width', 'min', 2.5), end('max', 'width', 'min', 2.5)], [24, 2.5, 0.75]);
      expect(measured(rail)).toBeCloseTo(19, 9);
      expect(shortPointLine(rail, 16)).toBe('Short point 19"');
    });
    it('a one-ended miter', () => {
      const one = mk([end('max', 'width', 'max', 3.5)]);
      expect(measured(one)).toBeCloseTo(16.5, 9);
      expect(shortPointLine(one, 16)).toBe('Short point 16-1/2"');
    });
    it('a case miter across the thickness', () => {
      const cs = mk([end('min', 'thickness', 'min', 0.75), end('max', 'thickness', 'min', 0.75)]);
      expect(measured(cs)).toBeCloseTo(18.5, 9);
      expect(shortPointLine(cs, 16)).toBe('Short point 18-1/2"');
    });
    it('a min-end miter across the width with a max-end miter across the thickness: the corner minimum', () => {
      const mixed = mk([end('min', 'width', 'min', 3.5), end('max', 'thickness', 'min', 0.75)]);
      expect(measured(mixed)).toBeCloseTo(15.75, 9);
      expect(shortPointLine(mixed, 16)).toBe('Short point 15-3/4"');
    });
  });
});
