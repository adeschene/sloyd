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

import { lineCrossings, guideCandidates, sameSnapPoint, tapeLineFor, ownedByGuide } from './document';
import type { Guide } from './document';

const L = (id: string, at: [number, number, number], axis: 'x' | 'y' | 'z'): Guide => ({ id, at, axis });

describe('lineCrossings (construction-lines spec §4.2)', () => {
  it('gives one crossing for an X and a Z line sharing y', () => {
    expect(lineCrossings([L('a', [0, 5, 2], 'x'), L('b', [3, 5, 0], 'z')], 120)).toEqual([
      { kind: 'line-cross', at: [3, 5, 2], owner: { type: 'guide', id: 'a', cross: 'b' } },
    ]);
  });
  it('misses by an ulp-scale gap', () => {
    expect(lineCrossings([L('a', [0, 5, 2], 'x'), L('b', [3, 5 + Number.EPSILON * 8, 0], 'z')], 120)).toEqual([]);
  });
  it('never crosses parallel lines', () => {
    expect(lineCrossings([L('a', [0, 5, 2], 'x'), L('b', [0, 5, 2], 'x')], 120)).toEqual([]);
  });
  it('ignores points', () => {
    expect(lineCrossings([{ id: 'p', at: [3, 5, 2] }, L('b', [3, 5, 0], 'z')], 120)).toEqual([]);
  });
  it('does not offer a crossing beyond the extent', () => {
    expect(lineCrossings([L('a', [0, 5, 2], 'x'), L('b', [121, 5, 0], 'z')], 120)).toEqual([]);
  });
  it('gives each pair once for three mutually crossing lines', () => {
    const c = lineCrossings([L('x', [0, 1, 2], 'x'), L('y', [3, 0, 2], 'y'), L('z', [3, 1, 0], 'z')], 120);
    expect(c).toHaveLength(3);
    expect(c.every((p) => p.at.join() === '3,1,2')).toBe(true);
    expect(c.map((p) => p.owner)).toEqual([
      { type: 'guide', id: 'x', cross: 'y' },
      { type: 'guide', id: 'x', cross: 'z' },
      { type: 'guide', id: 'y', cross: 'z' },
    ]);
  });
  it('guideCandidates lists points then crossings', () => {
    const c = guideCandidates([{ id: 'p', at: [1, 1, 1] }, L('a', [0, 5, 2], 'x'), L('b', [3, 5, 0], 'z')], 120);
    expect(c.map((p) => p.kind)).toEqual(['guide', 'line-cross']);
  });
});

describe('sameSnapPoint with crossings', () => {
  it('distinguishes crossings differing only in cross', () => {
    const mk = (cross: string) => ({ kind: 'line-cross' as const, at: [1, 2, 3] as [number, number, number], owner: { type: 'guide' as const, id: 'a', cross } });
    expect(sameSnapPoint(mk('b'), mk('c'))).toBe(false);
    expect(sameSnapPoint(mk('b'), mk('b'))).toBe(true);
  });
});

describe('tapeLineFor', () => {
  it('is null without an anchor, an axis, or with a typed distance', () => {
    expect(tapeLineFor(null, 'y', '')).toBeNull();
    expect(tapeLineFor([1, 2, 3], null, '')).toBeNull();
    expect(tapeLineFor([1, 2, 3], 'y', '3')).toBeNull();
  });
  it('counts whitespace as empty and zeroes the axis without mutating the anchor', () => {
    const anchor: [number, number, number] = [4, 5, 6];
    expect(tapeLineFor(anchor, 'y', '')).toEqual({ at: [4, 0, 6], axis: 'y' });
    expect(tapeLineFor(anchor, 'y', '  ')).toEqual({ at: [4, 0, 6], axis: 'y' });
    expect(anchor).toEqual([4, 5, 6]);
  });
});

describe('ownedByGuide', () => {
  const cross = { kind: 'line-cross' as const, at: [0, 0, 0] as [number, number, number], owner: { type: 'guide' as const, id: 'a', cross: 'b' } };
  it('matches id and cross, not others', () => {
    expect(ownedByGuide(cross, 'a')).toBe(true);
    expect(ownedByGuide(cross, 'b')).toBe(true);
    expect(ownedByGuide(cross, 'c')).toBe(false);
  });
  it('is false for a board-owned point and null', () => {
    expect(ownedByGuide({ kind: 'corner', at: [0, 0, 0], owner: { type: 'board', id: 'a' } }, 'a')).toBe(false);
    expect(ownedByGuide(null, 'a')).toBe(false);
  });
});
