import { IMPERIAL, formatLength } from '../units/length';
import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut } from './types';
import { boardBodies, bodyVerts } from './bodies';
import { bevelCut, chamferCut, defaultChamfer, defaultRaisedPanel, miterRatio } from './angleCuts';
import { angleDegrees, angleLine, faceName, shortPointLine } from './angleText';
import { squareStoolDocument, squareStoolLegs } from './stoolFixture';
import { worldParts } from './tree';
import { slopeOf } from './lean';

const taper: AngleCut = { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] };
const miter = (from: 'min' | 'max', run = 2.5): AngleCut => ({ id: `m${from}`, kind: 'miter', face: 'length', from, along: 'width', alongFrom: 'min', points: [[0, 0], [run, run]] });

describe('angle text (spec §4.2)', () => {
  it('prints a taper in the existing vocabulary', () => {
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [taper] });
    expect(angleLine(leg, taper, IMPERIAL)).toBe('Taper 5/8" off the width face (min side), from 24" from the length min end to that end');
  });
  it('falls back to both end depths when the line does not reach zero inside the part', () => {
    const c: AngleCut = { ...taper, points: [[0, 0.5], [58, 0]] };
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [c] });
    expect(angleLine(leg, c, IMPERIAL)).toBe('Taper off the width face (min side): 1/2" at the length min end, 1/4" at the length max end');
  });
  it('prints a miter to 0.1°', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [miter('max')] });
    expect(angleLine(rail, miter('max'), IMPERIAL)).toBe('Miter 45.0° across the width at the length max end, long point on the width min side');
    expect(angleDegrees({ ...miter('max'), points: [[0, 0], [2.5, 2.5 * Math.tan(Math.PI / 8)]] })).toBeCloseTo(22.5, 9);
  });
  it('prints the short point once, both ends subtracted', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [miter('max'), miter('min')] });
    expect(shortPointLine(rail, IMPERIAL)).toBe('Short point 19"');
    expect(shortPointLine(createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [taper] }), IMPERIAL)).toBeNull();
  });
  it('prints bevels and chamfers', () => {
    const b = createBoard({ length: 20, width: 3, thickness: 0.75 });
    const bevel: AngleCut = { id: 'b', kind: 'bevel', face: 'width', from: 'max', along: 'thickness', alongFrom: 'min', points: [[0, 0], [0.75, 0.75 * Math.tan(15 * Math.PI / 180)]] };
    const chamfer: AngleCut = { id: 'c', kind: 'chamfer', face: 'thickness', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0.125], [0.125, 0]] };
    expect(angleLine(b, bevel, IMPERIAL)).toBe('Bevel 15.0° off the width face (max side), across the thickness, long point on the thickness min side');
    expect(angleLine(b, chamfer, IMPERIAL)).toBe('Chamfer 1/8" on the edge between the width face (min side) and the thickness face (max side), along the length');
  });
  it('words a taper that deepens toward the far end from the deep end', () => {
    const c: AngleCut = { ...taper, points: [[5, 0], [29, 0.625]] };
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [c] });
    expect(angleLine(leg, c, IMPERIAL)).toBe('Taper 5/8" off the width face (min side), from 24" from the length max end to that end');
  });
  it('uses the standard form when the line reaches zero exactly at the far end', () => {
    const c: AngleCut = { ...taper, points: [[0, 0.625], [29, 0]] };
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [c] });
    expect(angleLine(leg, c, IMPERIAL)).toBe('Taper 5/8" off the width face (min side), from 29" from the length min end to that end');
  });
  it('words a taper that is zero at the anchored end and deep at the far end', () => {
    const c: AngleCut = { ...taper, points: [[0, 0], [29, 0.625]] };
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [c] });
    expect(angleLine(leg, c, IMPERIAL)).toBe('Taper 5/8" off the width face (min side), from 29" from the length max end to that end');
  });
  it('prints 22.5° for a 22.5° miter', () => {
    const c: AngleCut = { ...miter('max'), points: [[0, 0], [2.5, 2.5 * Math.tan(Math.PI / 8)]] };
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [c] });
    expect(angleLine(rail, c, IMPERIAL)).toBe('Miter 22.5° across the width at the length max end, long point on the width min side');
  });
  it('short point counts an end cut whatever its kind, and clamps at zero', () => {
    const asBevel: AngleCut = { ...miter('max'), kind: 'bevel' };
    expect(shortPointLine(createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [asBevel] }), IMPERIAL)).toBe('Short point 21-1/2"');
    expect(shortPointLine(createBoard({ length: 2, width: 2.5, thickness: 0.75, angleCuts: [miter('max')] }), IMPERIAL)).toBe('Short point 0"');
  });

  describe('short point is the shortest long edge (fu 281)', () => {
    /** Shortest length, along the board's length, of the four long edges, measured off the real solids. */
    const measured = (b: ReturnType<typeof createBoard>) => {
      const v = boardBodies(b).flatMap(bodyVerts);
      let least = Infinity;
      for (const w of [0, b.width]) for (const t of [0, b.thickness]) {
        // The edge's remaining stretch: extremes of x among vertices on that edge line.
        const on = v.filter((p) => Math.abs(p[1] - w) < 1e-9 && Math.abs(p[2] - t) < 1e-9);
        if (on.length === 0) { least = 0; continue; } // a cut removed the whole edge
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
      expect(shortPointLine(brace, IMPERIAL)).toBe('Short point 16-1/2"');
    });
    it('trapezoid ends still subtract both', () => {
      const rail = mk([end('min', 'width', 'min', 2.5), end('max', 'width', 'min', 2.5)], [24, 2.5, 0.75]);
      expect(measured(rail)).toBeCloseTo(19, 9);
      expect(shortPointLine(rail, IMPERIAL)).toBe('Short point 19"');
    });
    it('a one-ended miter', () => {
      const one = mk([end('max', 'width', 'max', 3.5)]);
      expect(measured(one)).toBeCloseTo(16.5, 9);
      expect(shortPointLine(one, IMPERIAL)).toBe('Short point 16-1/2"');
    });
    it('a case miter across the thickness', () => {
      const cs = mk([end('min', 'thickness', 'min', 0.75), end('max', 'thickness', 'min', 0.75)]);
      expect(measured(cs)).toBeCloseTo(18.5, 9);
      expect(shortPointLine(cs, IMPERIAL)).toBe('Short point 18-1/2"');
    });
    it('ends whose planes cross inside the part leave no long edge: 0', () => {
      const crossed = mk([end('min', 'width', 'min', 2.5), end('max', 'width', 'max', 2.5)], [2, 2.5, 0.75]);
      expect(measured(crossed)).toBe(0);
      expect(shortPointLine(crossed, IMPERIAL)).toBe('Short point 0"');
    });
    it('two cuts on one end (width and a steeper thickness): the deepest at each corner', () => {
      const steep: AngleCut = { id: 'steep', kind: 'bevel', face: 'length', from: 'min', along: 'thickness', alongFrom: 'min', points: [[0, 0], [0.75, 3]] };
      const two = mk([end('min', 'width', 'min', 3.5), steep, end('max', 'width', 'max', 3.5)]);
      expect(measured(two)).toBeCloseTo(13.5, 9);
      expect(shortPointLine(two, IMPERIAL)).toBe('Short point 13-1/2"');
    });
    // Square-set legs §4: a compound end's depth at a corner is its FULL depth (`depthAtCross`), t read from `across.from`.
    // alongFrom (max) differs from across.from (min), and the min end slopes across the thickness, so a t read from the
    // wrong side moves the deepest corner and the answer (15-7/16" instead of 15-1/16").
    const compound: AngleCut = { id: 'cx', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'max', points: [[0, 0], [1.5, 0.375]], across: { rise: 0.25, from: 'min' } };
    it('a compound end: the corner minimum of the full depths (square-set legs §4)', () => {
      const leg = mk([{ ...end('min', 'thickness', 'min', 0), points: [[0, 0], [1.5, 0.375]] }, compound], [16, 1.5, 1.5]);
      expect(measured(leg)).toBeCloseTo(15.0625, 9);
      expect(shortPointLine(leg, IMPERIAL)).toBe('Short point 15-1/16"');
    });
    it('a compound end that bites only at one across corner shortens the part (Review Focus 1)', () => {
      const corner: AngleCut = { ...compound, points: [[0, -0.25], [1.5, -0.125]] };
      const leg = mk([corner], [16, 1.5, 1.5]);
      expect(measured(leg)).toBeCloseTo(15.9375, 9);
      expect(shortPointLine(leg, IMPERIAL)).toBe('Short point 15-15/16"');
      expect(angleLine(leg, corner, IMPERIAL)).toBe('Compound miter at the length max end: 4.8° across the width, 14.0° across the thickness, long corner at the width max side and the thickness min side');
    });
    it('the square stool\'s legs: the short point is the shortest of the four long edges', () => {
      for (const b of squareStoolLegs()) {
        const at = measured(b);
        expect(at).toBeGreaterThan(0);
        expect(shortPointLine(b, IMPERIAL), b.name).toBe(`Short point ${formatLength(at, IMPERIAL)}`);
      }
    });
    it('a min-end miter across the width with a max-end miter across the thickness: the corner minimum', () => {
      const mixed = mk([end('min', 'width', 'min', 3.5), end('max', 'thickness', 'min', 0.75)]);
      expect(measured(mixed)).toBeCloseTo(15.75, 9);
      expect(shortPointLine(mixed, IMPERIAL)).toBe('Short point 15-3/4"');
    });
  });
});

describe('bevel and chamfer lines (chunk 3 wording)', () => {
  const b = createBoard({ length: 20, width: 3, thickness: 0.75 });
  it('a bevel names its long point', () => {
    const c = { id: 'b', ...bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: miterRatio(15) }, b) };
    expect(angleLine(b, c, IMPERIAL)).toBe('Bevel 15.0° off the width face (max side), across the thickness, long point on the thickness min side');
  });
  it('mirror-image bevels read differently', () => {
    const one = { id: 'b', ...bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: 1 }, b) };
    const two = { id: 'b', ...bevelCut({ face: 'width', from: 'max', longSide: 'max', ratio: 1 }, b) };
    expect(angleLine(b, one, IMPERIAL)).not.toBe(angleLine(b, two, IMPERIAL));
  });
  it('an equal-legged chamfer names its edge', () => {
    const c = { id: 'c', ...defaultChamfer(b) };
    expect(angleLine(b, c, IMPERIAL)).toBe('Chamfer 1/8" on the edge between the width face (max side) and the thickness face (max side), along the length');
  });
  it('a chamfer resized below its legs still prints its edge (RULING: stays editable)', () => {
    const thin = createBoard({ length: 20, width: 3, thickness: 0.1 });
    const c = { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.125, legAlong: 0.125 }, thin) };
    expect(angleLine(thin, c, IMPERIAL)).toBe('Chamfer 1/8" on the edge between the width face (max side) and the thickness face (max side), along the length');
  });
  it('an unequal-legged chamfer names both legs', () => {
    const c = { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.125, legAlong: 0.1875 }, b) };
    expect(angleLine(b, c, IMPERIAL)).toBe('Chamfer 1/8" into the width × 3/16" into the thickness, on the edge between the width face (max side) and the thickness face (max side), along the length');
  });
  it('reads a hand-edited chamfer canonically', () => {
    const c = { id: 'h', kind: 'chamfer' as const, face: 'thickness' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const,
      points: [[2.75, 0], [3, 0.25]] as [[number, number], [number, number]] };
    expect(angleLine(b, c, IMPERIAL)).toBe('Chamfer 1/4" on the edge between the width face (max side) and the thickness face (max side), along the length');
  });
  it('falls back to a generic line for a shape neither row can describe', () => {
    const c = { id: 'n', kind: 'chamfer' as const, face: 'width' as const, from: 'max' as const, along: 'thickness' as const, alongFrom: 'min' as const, points: [[0, 0.5], [0.75, 0.7]] as [[number, number], [number, number]] };
    expect(angleLine(b, c, IMPERIAL)).toMatch(/^Chamfer .*off the width face \(max side\)/);
  });
});

describe('face names (fu 300)', () => {
  it('names a length face as an end, any other face by its side', () => {
    expect(faceName('length', 'max')).toBe('the length max end');
    expect(faceName('width', 'min')).toBe('the width face (min side)');
    expect(faceName('thickness', 'max')).toBe('the thickness face (max side)');
  });
  it('an end-edge chamfer names the end the way miters and tapers do', () => {
    const b = createBoard({ length: 20, width: 3, thickness: 0.75 });
    const c: AngleCut = { id: 'e', ...chamferCut({ face: 'length', from: 'max', along: 'width', alongFrom: 'min', legFace: 0.25, legAlong: 0.25 }, b) };
    expect(angleLine(b, c, IMPERIAL)).toBe('Chamfer 1/4" on the edge between the length max end and the width face (min side), along the thickness');
  });
});

describe('angleLine in metric', () => {
  it('a taper: lengths in mm, angle in degrees unchanged', () => {
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [taper] });
    expect(angleLine(leg, taper, { display: 'metric-mm', precision: 16 })).toBe('Taper 16 mm off the width face (min side), from 610 mm from the length min end to that end');
  });
});

describe('the short point leaves out an end chamfer that keeps part of the end face (fu 385, the user\'s ruling)', () => {
  const panel = createBoard({ length: 20, width: 12, thickness: 0.75 });
  const endChamfer = (from: 'min' | 'max', legAlong: number): AngleCut =>
    ({ id: `c${from}`, ...chamferCut({ face: 'length', from, along: 'thickness', alongFrom: 'max', legFace: 1.5, legAlong }, panel) });
  it('a raised panel has no short point (its stock is cut to 20" before the bevels)', () => {
    const raised = { ...panel, angleCuts: defaultRaisedPanel(panel)!.map((c, i) => ({ id: `r${i}`, ...c })) };
    expect(shortPointLine(raised, IMPERIAL)).toBeNull();
  });
  it('a chamfer reaching the far face is a miter by geometry: still counted', () => {
    expect(shortPointLine({ ...panel, angleCuts: [endChamfer('min', 0.75), endChamfer('max', 0.75)] }, IMPERIAL)).toBe('Short point 17"');
  });
  it('a miter beside a tongue-leaving chamfer: the miter alone sets the short point', () => {
    const miter: AngleCut = { id: 'm', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [12, 12]] };
    expect(shortPointLine({ ...panel, length: 30, angleCuts: [endChamfer('min', 0.5), miter] }, IMPERIAL)).toBe('Short point 18"');
  });
});

describe('the compound miter\'s bench line (square-set legs §4)', () => {
  it('the square stool\'s feet and tops, verbatim; both degrees are the lean\'s (12° splay across the width, 8° rake across the thickness)', () => {
    for (const b of squareStoolLegs()) {
      const [foot, top] = (['min', 'max'] as const).map((e) => b.angleCuts.find((c) => c.from === e)!);
      expect(angleLine(b, foot!, IMPERIAL), b.name).toMatch(/^Compound miter at the length min end: 12\.0° across the width, 8\.0° across the thickness, long corner at the width (min|max) side and the thickness (min|max) side$/);
      expect(angleLine(b, top!, IMPERIAL), b.name).toMatch(/^Compound miter at the length max end: 12\.0° across the width, 8\.0° across the thickness, long corner at the width (min|max) side and the thickness (min|max) side$/);
    }
    // The oracle is the lean, not the cut's own slopes: the stool's lean is slopeOf(12) across x and slopeOf(8) across z.
    const fr = squareStoolLegs()[0]!;
    expect(Math.abs(fr.lean!.x)).toBeCloseTo(slopeOf(12), 12);
    expect(Math.abs(fr.lean!.z)).toBeCloseTo(slopeOf(8), 12);
  });
  it('a compound miter\'s degrees each read their own slope (a steeper rise than along slope)', () => {
    const c: AngleCut = { id: 'c', kind: 'miter', face: 'length', from: 'max', along: 'thickness', alongFrom: 'min', points: [[0, 0], [1.5, miterRatio(10) * 1.5]], across: { rise: miterRatio(30), from: 'max' } };
    const b = createBoard({ length: 16, width: 1.5, thickness: 1.5, angleCuts: [c] });
    expect(angleLine(b, c, IMPERIAL)).toBe('Compound miter at the length max end: 10.0° across the thickness, 30.0° across the width, long corner at the thickness min side and the width max side');
  });
  // Ruling TFa (final review M1): the line names its LONG CORNER — the corner of the end face where the full depth is least,
  // the corner a woodworker marks first — so mirror-twin legs print different rows.
  it('mirror-twin legs print different foot lines: Front right and Front left of the square stool, verbatim (TFa)', () => {
    const parts = worldParts(squareStoolDocument());
    const foot = (name: string) => {
      const b = parts.find((p) => p.name === name)!;
      return angleLine(b, b.angleCuts.find((c) => c.from === 'min')!, IMPERIAL);
    };
    expect(foot('Front right')).toBe('Compound miter at the length min end: 12.0° across the width, 8.0° across the thickness, long corner at the width max side and the thickness max side');
    expect(foot('Front left')).toBe('Compound miter at the length min end: 12.0° across the width, 8.0° across the thickness, long corner at the width min side and the thickness max side');
    expect(foot('Front right')).not.toBe(foot('Front left'));
  });
  it('a hand-built compound cut names the corner whose full depth is least, pinned against its four corner depths (TFa)', () => {
    // 16 × 2 × 1 leg; along the width from max, across the thickness from min. Depth at station s (from width max) and t
    // (from thickness min): 0.5 − 0.2·s + 0.3·(t − 0.5), worked by hand, not by depthAtCross.
    const c: AngleCut = { id: 'h', kind: 'miter', face: 'length', from: 'min', along: 'width', alongFrom: 'max', points: [[0, 0.5], [2, 0.1]], across: { rise: 0.3, from: 'min' } };
    const b = createBoard({ length: 16, width: 2, thickness: 1, angleCuts: [c] });
    // Corners by side: width max = s 0, width min = s 2; thickness min = t 0, thickness max = t 1.
    const corners = { 'width max, thickness min': 0.35, 'width max, thickness max': 0.65, 'width min, thickness min': -0.05, 'width min, thickness max': 0.25 };
    const least = Object.entries(corners).reduce((a, x) => (x[1] < a[1] ? x : a))[0];
    expect(least).toBe('width min, thickness min');
    expect(angleLine(b, c, IMPERIAL)).toBe('Compound miter at the length min end: 11.3° across the width, 16.7° across the thickness, long corner at the width min side and the thickness min side');
    // A negative rise (code-built; the loader keeps rise > 0) moves the corner to the far side of `across.from`.
    const neg: AngleCut = { ...c, across: { rise: -0.3, from: 'min' } };
    expect(angleLine(b, neg, IMPERIAL)).toBe('Compound miter at the length min end: 11.3° across the width, 16.7° across the thickness, long corner at the width min side and the thickness max side');
  });
  it('a plain miter reads exactly as before', () => {
    const b = createBoard({ length: 20, width: 2.5, thickness: 0.75, angleCuts: [miter('max')] });
    expect(angleLine(b, miter('max'), IMPERIAL)).toBe('Miter 45.0° across the width at the length max end, long point on the width min side');
  });
});
