import { describe, expect, it } from 'vitest';
import { archCurve, bowCurve, cornerCurve, createBoard } from './document';
import { curveLine, curveLines } from './curveText';
import { IMPERIAL } from '../units/length';
import { ARCH, CORNER } from './curveFixtures';

const MM = { display: 'metric-mm' as const, precision: 16 };
const apron = createBoard({ length: 30, width: 5, thickness: 0.75 });
const top = createBoard({ length: 36, width: 20, thickness: 0.75 });

describe('curveLine (spec §4.1)', () => {
  it('an arch, centred', () => {
    expect(curveLine(apron, ARCH, IMPERIAL)).toBe('Arch on the width min side, 3" in from each length end: 24" span, 1-1/2" rise (radius 48-3/4")');
  });
  it('an arch, off-centre', () => {
    const c = { id: 'x', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 18, rise: 1.5 }) };
    expect(curveLine(apron, c, IMPERIAL)).toMatch(/^Arch on the width min side, from 3" to 21" from the length min end: 1-1\/2" rise \(radius /);
  });
  it('a half-round notch', () => {
    const c = { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 }) };
    expect(curveLine(apron, c, IMPERIAL)).toBe('Half-round notch on the width min side, 2" wide, centred 15" from the length min end (radius 1")');
  });
  it('a deep arch (rise past half the span) is not a notch', () => {
    const c = { id: 'd', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 5, span: 2, rise: 1.5 }) };
    expect(curveLine(apron, c, IMPERIAL)).toMatch(/^Arch on the width min side, from 5" to 7" from the length min end: 1-1\/2" rise/);
  });
  it('a bow of an 18" rail, through the width (P7)', () => {
    const rail = createBoard({ length: 18, width: 3, thickness: 0.75 });
    const c = { id: 'b', ...bowCurve({ through: 'width', along: 'length', side: 'min', span: 18, rise: 0.5 }) };
    expect(curveLine(rail, c, IMPERIAL)).toBe('Bow the thickness min side 1/2" (radius 81-1/4"), cut through the width');
  });
  it('a bow shorter than its edge says so (P2)', () => {
    const c = { id: 'b', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 18, rise: 0.5 }) };
    expect(curveLine(apron, c, IMPERIAL)).toBe('Bow the width min side 1/2" over 18" from the length min end (radius 81-1/4")');
  });
  it('a rounded corner', () => {
    expect(curveLine(top, CORNER, IMPERIAL)).toBe('Round the corner of the length max end and the width min side to a 2" radius');
  });
  it('metric', () => {
    expect(curveLine(apron, ARCH, MM)).toBe('Arch on the width min side, 76 mm in from each length end: 610 mm span, 38 mm rise (radius 1238 mm)');
  });
  it('a faulted curve ends with its fault (Review Focus 1)', () => {
    expect(curveLine({ ...apron, length: 26 }, ARCH, IMPERIAL)).toMatch(/ — check: runs past the length max end$/);
  });
  it('no canonical form', () => {
    const odd = { ...ARCH, segments: [{ type: 'arc' as const, to: [27, 0] as [number, number], side: 'left' as const, radius: 50 }, { type: 'line' as const, to: [3, 0] as [number, number] }] };
    expect(curveLine(apron, odd, IMPERIAL)).toBe('Curve cut through the thickness: 1 arc and 1 line');
  });
});

describe('curveLines', () => {
  it('four equal corners on one face are one line, at the first one\'s place', () => {
    const four = (['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => ({ id: `${uf}${vf}`, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: vf, radius: 2 }) })));
    expect(curveLines({ ...top, curves: [ARCH, ...four] }, IMPERIAL)).toEqual([curveLine(top, ARCH, IMPERIAL), 'Round all four corners to a 2" radius']);
  });
  it('two corners print two lines', () => {
    const two = (['min', 'max'] as const).map((uf) => ({ id: uf, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: 'min', radius: 2 }) }));
    expect(curveLines({ ...top, curves: two }, IMPERIAL)).toHaveLength(2);
  });
  it('a duplicate corner keeps its own line; the four distinct corners still collapse', () => {
    const four = (['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => ({ id: `${uf}${vf}`, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: vf, radius: 2 }) })));
    const dup = { ...four[0]!, id: 'dup' };
    const lines = curveLines({ ...top, curves: [four[0]!, dup, ...four.slice(1)] }, IMPERIAL);
    expect(lines).toEqual(['Round all four corners to a 2" radius', curveLine(top, dup, IMPERIAL)]);
  });
});

import { defaultCorners } from './curves';
import { curveLineEntries } from './curveText';
it('curveLineEntries: four equal corners are one entry carrying all four ids; curveLines is its texts', () => {
  const b = createBoard({ length: 36, width: 20, thickness: 0.75, curves: defaultCorners({ length: 36, width: 20, thickness: 0.75 }).map((c, i) => ({ id: `c${i}`, ...c })) });
  const e = curveLineEntries(b, IMPERIAL);
  expect(e).toEqual([{ ids: ['c0', 'c1', 'c2', 'c3'], text: 'Round all four corners to a 1" radius' }]);
  expect(curveLines(b, IMPERIAL)).toEqual(e.map((x) => x.text));
});
