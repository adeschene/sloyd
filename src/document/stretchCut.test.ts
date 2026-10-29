import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { stretchCut } from './cuts';
import type { Cut } from './types';

// A 20 x 6 x 0.75 part; d = 'length'; grow by 4 at the line u = 10 (band [10, 10]).
const part = createBoard({ length: 20, width: 6, thickness: 0.75 });
const cut = (o: Partial<Cut>): Cut => ({
  id: 'c', face: 'thickness', from: 'max', across: 'width',
  offset: 0, width: 1, depth: 0.25, stopMin: 0, stopMax: 0, ...o,
});
const grow = (c: Cut, far: 'min' | 'max' = 'max') => stretchCut(part, c, 'length', [10, 10], far, 4);

describe('stretchCut: position axis is d', () => {
  it('near: same object', () => {
    const c = cut({ offset: 2, width: 1 });
    expect(grow(c)).toBe(c);
  });
  it('far: offset moves by delta', () => {
    expect(grow(cut({ offset: 15, width: 1 }))).toEqual(cut({ offset: 19, width: 1 }));
  });
  it('crossing: width grows', () => {
    expect(grow(cut({ offset: 9, width: 2 }))).toEqual(cut({ offset: 9, width: 6 }));
  });
});

describe('stretchCut: across === d', () => {
  const base = { face: 'thickness' as const, across: 'length' as const };
  it('full groove crosses, unchanged', () => {
    const c = cut({ ...base, stopMin: 0, stopMax: 0 });
    expect(grow(c)).toBe(c);
  });
  it('far stop shifts stopMin', () => {
    expect(grow(cut({ ...base, stopMin: 12, stopMax: 2 }))).toEqual(cut({ ...base, stopMin: 16, stopMax: 2 }));
  });
  it('near stop shifts stopMax', () => {
    expect(grow(cut({ ...base, stopMin: 1, stopMax: 13 }))).toEqual(cut({ ...base, stopMin: 1, stopMax: 17 }));
  });
});

describe('stretchCut: face === d', () => {
  const base = { face: 'length' as const, across: 'width' as const, offset: 0, width: 0.5 };
  // face length, across width: position axis is thickness.
  it('from max, shallow: far, same object', () => {
    const c = cut({ ...base, from: 'max', depth: 1.5 });
    expect(grow(c)).toBe(c);
  });
  it('from min, shallow: near, same object', () => {
    const c = cut({ ...base, from: 'min', depth: 1.5 });
    expect(grow(c)).toBe(c);
  });
  it('from max, deep: crosses, depth grows', () => {
    expect(grow(cut({ ...base, from: 'max', depth: 12 }))).toEqual(cut({ ...base, from: 'max', depth: 16 }));
  });
});

describe('stretchCut: far === min', () => {
  // far = min: the moving end is the part's local min, the fixed end is local max.
  // Offset 15 (span 15..16) lies toward the fixed max end, so it is NEAR: it keeps its
  // distance to max, i.e. the numbers measured from `far`(min) gain delta: offset 19.
  // Offset 2 (span 2..3) lies toward the moving min end, so it is FAR: it keeps its
  // distance to min, so offset is unchanged: the same object.
  it('near the fixed max end moves', () => {
    expect(grow(cut({ offset: 15, width: 1 }), 'min')).toEqual(cut({ offset: 19, width: 1 }));
  });
  it('by the moving min end stays', () => {
    const c = cut({ offset: 2, width: 1 });
    expect(grow(c, 'min')).toBe(c);
  });
});

describe('stretchCut: shrink', () => {
  const shrink = (c: Cut) => stretchCut(part, c, 'length', [10, 14], 'max', -4);
  it('far shifts back', () => {
    expect(shrink(cut({ offset: 15, width: 1 }))).toEqual(cut({ offset: 11, width: 1 }));
  });
  it('crossing that covers the band shrinks', () => {
    expect(shrink(cut({ offset: 9, width: 6 }))).toEqual(cut({ offset: 9, width: 2 }));
  });
  it('crossing that does not cover the band is refused', () => {
    expect(shrink(cut({ offset: 11, width: 1 }))).toBe('crosses');
  });
});
