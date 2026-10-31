import { describe, it, expect } from 'vitest';
import { CURRENT_VERSION, createDocument, migrateDocument, validateGuides, isGuideRay, isAnyLine, isGuideLine, isGuidePoint } from './document';
import { lineThrough, sameNewLine, tapeLineFor } from './snapPoints';
import type { NewLine } from './snapPoints';

const load = (guides: unknown[]) => migrateDocument({ ...createDocument('T'), version: 31, guides }).guides;

describe('schema 32: oblique lines (construction-lines-2 spec §2.3)', () => {
  it('is version 32 and refuses 33', () => {
    expect(CURRENT_VERSION).toBe(33);
    expect(() => migrateDocument({ ...createDocument('T'), version: 34 })).toThrow(/newer version of Sloyd/);
  });

  it('keeps an oblique line exactly', () => {
    const g = [{ id: 'r', at: [1, 2, 3], to: [4, 5.5, 6] }];
    expect(validateGuides(g)).toEqual(g);
  });
  it('round-trips a 31 file with a point and an axis line', () => {
    const guides = [{ id: 'p', at: [1, 2, 3] }, { id: 'l', at: [0, 2, 3], axis: 'x' }];
    expect(load(guides)).toEqual(guides);
  });
  it.each([
    ['a short to', { id: 'a', at: [1, 2, 3], to: [1, 2] }],
    ['a NaN in to', { id: 'a', at: [1, 2, 3], to: [1, NaN, 3] }],
    ['axis and to together', { id: 'a', at: [1, 2, 3], axis: 'x', to: [4, 5, 6] }],
    ['to equal to at', { id: 'a', at: [1, 2, 3], to: [1, 2, 3] }],
  ])('drops %s', (_n, g) => {
    expect(validateGuides([g])).toEqual([]);
  });
  it('loads an axis-parallel to as a canonical axis line with no to key', () => {
    const [g] = validateGuides([{ id: 'a', at: [1, 2, 3], to: [9, 2, 3] }]);
    expect(g).toEqual({ id: 'a', at: [0, 2, 3], axis: 'x' });
    expect('to' in g).toBe(false);
  });
  it('re-mints a duplicate id between an oblique line and a point', () => {
    const [a, b] = validateGuides([{ id: 'g', at: [1, 2, 3], to: [4, 5, 6] }, { id: 'g', at: [1, 2, 3] }]);
    expect(a.id).toBe('g');
    expect(b.id).not.toBe('g');
  });
  it('discriminates the three kinds', () => {
    const [p, l, r] = validateGuides([
      { id: 'p', at: [1, 2, 3] }, { id: 'l', at: [1, 2, 3], axis: 'z' }, { id: 'r', at: [1, 2, 3], to: [4, 5, 6] },
    ]);
    expect([p, l, r].map((g) => [isGuidePoint(g), isGuideLine(g), isGuideRay(g), isAnyLine(g)])).toEqual([
      [true, false, false, false], [false, true, false, true], [false, false, true, true],
    ]);
  });
});

describe('lineThrough', () => {
  it('is null for equal points', () => expect(lineThrough([1, 2, 3], [1, 2, 3])).toBeNull());
  it('is a canonical axis line when two coordinates agree', () => {
    expect(lineThrough([1, 2, 3], [1, 2, 9])).toEqual({ at: [1, 2, 0], axis: 'z' });
  });
  it('is an oblique line otherwise, copying its inputs', () => {
    const a: [number, number, number] = [1, 2, 3];
    const b: [number, number, number] = [4, 5, 6];
    const l = lineThrough(a, b);
    a[0] = 99;
    b[2] = 99;
    expect(l).toEqual({ at: [1, 2, 3], to: [4, 5, 6] });
  });
});

describe('sameNewLine', () => {
  const a: [number, number, number] = [1, 2, 3];
  const b: [number, number, number] = [4, 5, 6];
  it('ignores the order of the pair', () => expect(sameNewLine({ at: a, to: b }, { at: b, to: a })).toBe(true));
  it('is exact: one ulp off is a different line', () => {
    const b2: [number, number, number] = [b[0] + Number.EPSILON * b[0], b[1], b[2]];
    expect(sameNewLine({ at: a, to: b }, { at: a, to: b2 })).toBe(false);
  });
  it('never equates an axis line with an oblique one', () => {
    expect(sameNewLine({ at: [0, 2, 3], axis: 'x' }, { at: a, to: b })).toBe(false);
    expect(sameNewLine({ at: a, to: b }, { at: [0, 2, 3], axis: 'x' })).toBe(false);
  });
  it('compares axis lines as sameLine does', () => {
    expect(sameNewLine({ at: [0, 2, 3], axis: 'x' }, { at: [0, 2, 3], axis: 'x' })).toBe(true);
    expect(sameNewLine({ at: [0, 2, 3], axis: 'x' }, { at: [0, 2, 3], axis: 'y' })).toBe(false);
  });
});

describe('tapeLineFor (spec §2.1)', () => {
  const anchor: [number, number, number] = [1, 2, 3];
  const hover: [number, number, number] = [4, 5, 6];
  it('an axis lock with nothing typed is the canonical axis line, whatever the hover', () => {
    const want: NewLine = { at: [0, 2, 3], axis: 'x' };
    expect(tapeLineFor(anchor, 'x', '', hover)).toEqual(want);
    expect(tapeLineFor(anchor, 'x', '', null)).toEqual(want);
  });
  it('no axis, nothing typed, a hover is the oblique line', () => {
    expect(tapeLineFor(anchor, null, '', hover)).toEqual({ at: anchor, to: hover });
  });
  it('blank typed text counts as nothing typed, but no hover gives nothing', () => {
    expect(tapeLineFor(anchor, null, ' ', null)).toBeNull();
  });
  it('typed text means a distance, not a line', () => {
    expect(tapeLineFor(anchor, null, '3', hover)).toBeNull();
  });
  it('a hover equal to the anchor gives nothing', () => {
    expect(tapeLineFor(anchor, null, '', [1, 2, 3])).toBeNull();
  });
  it('an axis-parallel hover gives an axis line', () => {
    expect(tapeLineFor(anchor, null, '', [1, 2, 8])).toEqual({ at: [1, 2, 0], axis: 'z' });
  });
  it('no anchor gives nothing', () => expect(tapeLineFor(null, null, '', hover)).toBeNull());
});

import { CROSS_TOLERANCE, lineCrossings, lineDir, lineSpan } from './snapPoints';
import type { Guide } from './document';

describe('lineSpan / lineDir (construction-lines-2 spec §2.5)', () => {
  it('gives an axis line the whole box', () => {
    expect(lineSpan({ id: 'a', at: [0, 2, 3], axis: 'x' }, 120)).toEqual([-120, 120]);
    expect(lineDir({ id: 'a', at: [0, 2, 3], axis: 'y' })).toEqual([0, 1, 0]);
  });
  it('clips a diagonal at the box corners', () => {
    const [lo, hi] = lineSpan({ id: 'r', at: [0, 0, 0], to: [1, 1, 0] }, 120)!;
    expect(lo).toBeCloseTo(-120 * Math.SQRT2, 9);
    expect(hi).toBeCloseTo(120 * Math.SQRT2, 9);
  });
  it('measures from at, not from the middle', () => {
    const [lo, hi] = lineSpan({ id: 'r', at: [60, 0, 0], to: [61, 1, 0] }, 120)!;
    expect(lo).toBeCloseTo(-120 * Math.SQRT2, 9); // y reaches -120 before x does
    expect(hi).toBeCloseTo(60 * Math.SQRT2, 9);
  });
  it('gives null for a line wholly outside the box', () => {
    expect(lineSpan({ id: 'r', at: [200, 0, 0], to: [200, 1, 0] }, 120)).toBeNull();
  });
  it('gives null for a skew line that misses the corner', () => {
    expect(lineSpan({ id: 'r', at: [100, 100, 130], to: [101, 99, 130] }, 120)).toBeNull();
  });
});

describe('lineCrossings with an oblique line (spec §2.4)', () => {
  const R = (id: string, at: [number, number, number], to: [number, number, number]): Guide => ({ id, at, to });
  const A = (id: string, at: [number, number, number], axis: 'x' | 'y' | 'z'): Guide => ({ id, at, axis });
  it('names the tolerance', () => {
    expect(CROSS_TOLERANCE).toBe(1e-6);
  });
  it('crosses an oblique and an axis line that truly meet', () => {
    const c = lineCrossings([R('r', [0, 0, 0], [1, 1, 0]), A('z', [3, 3, 0], 'z')], 120);
    expect(c).toHaveLength(1);
    expect(c[0].kind).toBe('line-cross');
    expect(c[0].owner).toEqual({ type: 'guide', id: 'r', cross: 'z' });
    c[0].at.forEach((v, i) => expect(v).toBeCloseTo([3, 3, 0][i], 9));
  });
  it('keeps array order for the owner', () => {
    const c = lineCrossings([A('z', [3, 3, 0], 'z'), R('r', [0, 0, 0], [1, 1, 0])], 120);
    expect(c[0].owner).toEqual({ type: 'guide', id: 'z', cross: 'r' });
  });
  it('misses a pair 2e-6 apart', () => {
    expect(lineCrossings([R('r', [0, 0, 0], [1, 1, 0]), A('x', [0, 0, 2e-6], 'x')], 120)).toEqual([]);
  });
  it('crosses a pair 5e-7 apart, at the midpoint', () => {
    const c = lineCrossings([R('r', [0, 0, 0], [1, 1, 0]), A('x', [0, 0, 5e-7], 'x')], 120);
    expect(c).toHaveLength(1);
    expect(c[0].at[2]).toBeCloseTo(2.5e-7, 12);
  });
  it('misses a pair at exactly the tolerance (strict)', () => {
    expect(lineCrossings([R('r', [0, 0, 0], [1, 1, 0]), A('x', [0, 0, CROSS_TOLERANCE], 'x')], 120)).toEqual([]);
  });
  it('never crosses two parallel oblique lines', () => {
    expect(lineCrossings([R('a', [0, 0, 0], [1, 1, 1]), R('b', [0, 0, 0], [2, 2, 2])], 120)).toEqual([]);
    expect(lineCrossings([R('a', [0, 0, 0], [1, 1, 1]), R('b', [1, 0, 0], [2, 1, 1])], 120)).toEqual([]);
  });
  it('crosses two oblique lines that meet', () => {
    const c = lineCrossings([R('a', [0, 0, 0], [1, 1, 0]), R('b', [4, 0, 0], [3, 1, 0])], 120);
    expect(c).toHaveLength(1);
    c[0].at.forEach((v, i) => expect(v).toBeCloseTo([2, 2, 0][i], 9));
  });
  it('drops a crossing beyond the extent', () => {
    expect(lineCrossings([R('a', [0, 0, 0], [1, 1, 0]), A('z', [121, 121, 0], 'z')], 120)).toEqual([]);
  });
  it('leaves axis x axis exact', () => {
    expect(lineCrossings([A('a', [0, 5, 2], 'x'), A('b', [3, 5, 0], 'z')], 120)).toEqual([
      { kind: 'line-cross', at: [3, 5, 2], owner: { type: 'guide', id: 'a', cross: 'b' } },
    ]);
  });
});
