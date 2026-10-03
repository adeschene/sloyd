import { describe, expect, it } from 'vitest';
import { designToDocument, orient, parseDesign, DESIGN_SCHEMA } from './generated';
import type { GeneratedDesign, GeneratedPart } from './generated';
import { boardExtents } from './geometry';
import { MATERIALS } from './types';
import type { Board } from './types';

const part = (name: string, at: [number, number, number], size: [number, number, number], material = 'pine'): GeneratedPart => ({
  name, material,
  at: { x: at[0], y: at[1], z: at[2] },
  size: { x: size[0], y: size[1], z: size[2] },
});
const design = (...parts: GeneratedPart[]): GeneratedDesign => ({ name: 'Test', parts });

// Bound from OUTSIDE the converter: the expected extents come from the
// existing boardExtents, never from orient's own arithmetic (invariant 23).
const asBoard = (o: ReturnType<typeof orient>): Board => ({
  id: 'x', name: 'x', position: [0, 0, 0], grain: 'length', material: 'pine', cuts: [], ...o,
});

describe('orient', () => {
  const PERMUTATIONS: [number, number, number][] = [
    [30, 0.75, 11], [30, 11, 0.75], [11, 30, 0.75],
    [0.75, 30, 11], [11, 0.75, 30], [0.75, 11, 30],
  ];
  it.each(PERMUTATIONS)('reproduces world size %s', (x, y, z) => {
    expect(boardExtents(asBoard(orient([x, y, z])))).toEqual([x, y, z]);
  });
  it('makes the longest side length and the shortest thickness', () => {
    const o = orient([11, 30, 0.75]);
    expect([o.length, o.width, o.thickness]).toEqual([30, 11, 0.75]);
  });
  it.each([[[24, 24, 0.75]], [[12, 12, 12]], [[0.75, 24, 24]]] as [[number, number, number]][])(
    'handles ties: %s', (size) => {
      expect(boardExtents(asBoard(orient(size)))).toEqual(size);
    });
});

describe('designToDocument', () => {
  it('rounds every at and size component to 1/16"', () => {
    const { doc } = designToDocument(design(part('A', [0, 0, 0], [10.03, 0.74, 3.97])));
    expect(boardExtents(doc.boards[0])).toEqual([10, 0.75, 4]);
  });

  it('puts the design on the floor and centres its footprint on the origin', () => {
    const { doc } = designToDocument(design(
      part('A', [10, 5, 20], [4, 1, 2]),
      part('B', [14, 5, 20], [4, 1, 2]),
    ));
    const [a, b] = doc.boards;
    expect(a.position).toEqual([-4, 0, -1]);
    expect(b.position).toEqual([0, 0, -1]);
  });

  it('keeps every translated position on the 1/16" grid', () => {
    // footprint 1/16 wide: centring by half of it would land on 1/32
    const { doc } = designToDocument(design(part('A', [0, 0, 0], [1 / 16, 1, 1])));
    const x = doc.boards[0].position[0];
    expect(Math.round(x * 16)).toBe(x * 16);
  });

  it('rejects a part with a non-finite number and keeps the rest', () => {
    const { doc, rejected } = designToDocument(design(
      part('Bad', [0, 0, 0], [Number.NaN, 1, 1]),
      part('Good', [0, 0, 0], [10, 1, 1]),
    ));
    expect(rejected).toEqual([{ name: 'Bad', reason: 'not-finite' }]);
    expect(doc.boards.map((b) => b.name)).toEqual(['Good']);
    expect(doc.boards.flatMap((b) => b.position).every(Number.isFinite)).toBe(true);
  });

  it.each([[0], [-2], [0.01]])('rejects a part whose size rounds to %s or below zero as too-small', (s) => {
    const { rejected } = designToDocument(design(part('Thin', [0, 0, 0], [10, s, 1])));
    expect(rejected).toEqual([{ name: 'Thin', reason: 'too-small' }]);
  });

  it('passes the result through migrateDocument — duplicate names are deduped', () => {
    const { doc } = designToDocument(design(
      part('Shelf', [0, 0, 0], [10, 1, 1]),
      part('Shelf', [0, 1, 0], [10, 1, 1]),
    ));
    const names = doc.boards.map((b) => b.name);
    expect(new Set(names).size).toBe(2);
    expect(names[0]).toBe('Shelf');
    expect(new Set(doc.boards.map((b) => b.id)).size).toBe(2);
  });

  it('falls back to a default name when the design name is blank', () => {
    expect(designToDocument({ name: '   ', parts: [] }).doc.name).toBe('Generated design');
  });

  it('generates no cuts and grain along length', () => {
    const { doc } = designToDocument(design(part('A', [0, 0, 0], [10, 1, 1])));
    expect(doc.boards[0].cuts).toEqual([]);
    expect(doc.boards[0].grain).toBe('length');
  });
});

describe('parseDesign', () => {
  it('accepts a well-formed design', () => {
    const d = design(part('A', [0, 0, 0], [1, 2, 3]));
    expect(parseDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it.each([
    null, 42, {}, { name: 'x' }, { name: 'x', parts: [] },
    { name: 'x', parts: [{ name: 'A', material: 'pine', at: { x: 0, y: 0 }, size: { x: 1, y: 1, z: 1 } }] },
    { name: 'x', parts: [{ name: 'A', material: 'constructor', at: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }] },
    { name: 'x', parts: [{ name: 'A', material: 'unobtanium', at: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }] },
  ])('rejects %j', (bad) => {
    expect(parseDesign(bad)).toBeNull();
  });
});

describe('DESIGN_SCHEMA', () => {
  it("offers exactly MATERIALS' keys", () => {
    const parts = (DESIGN_SCHEMA as any).properties.parts.items;
    expect(parts.properties.material.enum).toEqual(Object.keys(MATERIALS));
  });
  it('sets additionalProperties: false on every object', () => {
    const walk = (s: any): boolean =>
      s.type !== 'object' || (s.additionalProperties === false && Object.values(s.properties).every(walk));
    const root = DESIGN_SCHEMA as any;
    expect(walk(root) && walk(root.properties.parts.items)).toBe(true);
  });
});
