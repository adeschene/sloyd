import { describe, it, expect } from 'vitest';
import { CURRENT_VERSION, createDocument, migrateDocument, isGuideLine, isGuidePoint } from './document';

const load = (guides: unknown[]) => migrateDocument({ ...createDocument('T'), version: 30, guides }).guides;

describe('schema 31: construction lines (construction-lines spec §2)', () => {
  it('is version 31 and refuses 32', () => {
    expect(CURRENT_VERSION).toBe(31);
    expect(() => migrateDocument({ ...createDocument('T'), version: 32 })).toThrow(/newer version of Sloyd/);
  });
  it('loads a 30 file point unchanged, with no axis key', () => {
    const [g] = load([{ id: 'g1', at: [1, 2, 3] }]);
    expect(g).toEqual({ id: 'g1', at: [1, 2, 3] });
    expect(Object.keys(g)).toEqual(['id', 'at']);
  });
  it.each([['x', [0, 2, 3]], ['y', [7, 0, 3]], ['z', [7, 2, 0]]] as const)('zeroes the %s coordinate of a line', (axis, at) => {
    expect(load([{ id: 'l1', at: [7, 2, 3], axis }])).toEqual([{ id: 'l1', at, axis }]);
  });
  it.each([
    ['axis w', { id: 'a', at: [1, 2, 3], axis: 'w' }],
    ['axis 1', { id: 'a', at: [1, 2, 3], axis: 1 }],
    ['axis null', { id: 'a', at: [1, 2, 3], axis: null }],
    ['non-finite at', { id: 'a', at: [NaN, 2, 3], axis: 'x' }],
    ['no id', { at: [1, 2, 3], axis: 'x' }],
  ])('drops %s', (_n, g) => {
    expect(load([g])).toEqual([]);
  });
  it('re-mints a duplicate id across kinds, the first keeping it', () => {
    const [a, b] = load([{ id: 'g1', at: [1, 2, 3] }, { id: 'g1', at: [1, 2, 3], axis: 'y' }]);
    expect(a.id).toBe('g1');
    expect(b.id).not.toBe('g1');
  });
  it('keeps two equal lines', () => {
    const gs = load([{ id: 'a', at: [0, 1, 2], axis: 'x' }, { id: 'b', at: [0, 1, 2], axis: 'x' }]);
    expect(gs).toHaveLength(2);
  });
  it('discriminates the kinds', () => {
    const [p, l] = load([{ id: 'p', at: [1, 2, 3] }, { id: 'l', at: [1, 2, 3], axis: 'z' }]);
    expect([isGuidePoint(p), isGuideLine(p), isGuidePoint(l), isGuideLine(l)]).toEqual([true, false, false, true]);
  });
});
