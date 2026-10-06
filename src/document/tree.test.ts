import {
  childrenOf, containerTurn, displayNames, flatDocument, instanceAt, isCovered, itemPaths,
  parentPath, partAt, worldParts,
} from './tree';
import { placeBoard } from './frames';
import { assemblyDoc } from './treeFixtures';
import { createDocument, createBoard } from './document';

describe('paths', () => {
  it('isCovered matches an ancestor, never a prefix of an id', () => {
    const set = new Set(['i3']);
    expect(isCovered('i3', set)).toBe(true);
    expect(isCovered('i3/b1', set)).toBe(true);
    expect(isCovered('i3/i7/b1', set)).toBe(true);
    expect(isCovered('i30/b1', set)).toBe(false);
    expect(isCovered('b1', set)).toBe(false);
  });
  it('parentPath', () => {
    expect(parentPath('b1')).toBeNull();
    expect(parentPath('i1/i2/b3')).toBe('i1/i2');
  });
});

describe('worldParts (assemblies spec §2.1)', () => {
  it('orders root parts, then each instance depth first, parts before nested instances', () => {
    expect(worldParts(assemblyDoc()).map((b) => b.id)).toEqual(['r1', 'i1/b1', 'i1/b2', 'i1/i2/b3']);
  });
  it('places innermost first, one step per level', () => {
    const doc = assemblyDoc();
    const [i1] = doc.instances;
    const i2 = instanceAt(doc, 'i1/i2')!;
    const b3 = partAt(doc, 'i1/i2/b3')!;
    const world = worldParts(doc).find((b) => b.id === 'i1/i2/b3')!;
    const expected = placeBoard(i1!, placeBoard(i2, b3));
    expect(world.position).toEqual(expected.position);
    expect(world.rotation).toBe(expected.rotation);
  });
  it('carries own names, never paths', () => {
    expect(worldParts(assemblyDoc()).map((b) => b.name)).toEqual(['Top', 'Side', 'Front', 'Pin']);
  });
  it('returns the same array for the same document', () => {
    const doc = assemblyDoc();
    expect(worldParts(doc)).toBe(worldParts(doc));
  });
  it("returns the document's own boards when there are no instances", () => {
    const doc = { ...createDocument(), boards: [createBoard()] };
    expect(worldParts(doc)).toBe(doc.boards);
  });
  it('does not loop on a definition that contains itself', () => {
    const doc = assemblyDoc();
    const looped = { ...doc, definitions: doc.definitions.map((d) => d.id === 'd2'
      ? { ...d, instances: [{ id: 'ix', name: 'Loop', definition: 'd2', position: [0, 0, 0] as [number, number, number], rotation: 0 as const }] }
      : d) };
    expect(worldParts(looped).map((b) => b.id)).toEqual(['r1', 'i1/b1', 'i1/b2', 'i1/i2/b3']);
  });
});

describe('item sets', () => {
  it('childrenOf lists parts then instances of one container', () => {
    const doc = assemblyDoc();
    expect(childrenOf(doc, null)).toEqual(['r1', 'i1']);
    expect(childrenOf(doc, 'i1')).toEqual(['i1/b1', 'i1/b2', 'i1/i2']);
    expect(childrenOf(doc, 'nope')).toEqual([]);
  });
  it('itemPaths holds every instance path and every occurrence', () => {
    expect([...itemPaths(assemblyDoc())].sort()).toEqual(['i1', 'i1/b1', 'i1/b2', 'i1/i2', 'i1/i2/b3', 'r1']);
  });
  it('containerTurn sums the turns on the path', () => {
    const doc = assemblyDoc();
    expect(containerTurn(doc, null)).toBe(0);
    expect(containerTurn(doc, 'i1')).toBe(90);
    expect(containerTurn(doc, 'i1/i2')).toBe(0);
  });
});

describe('flatDocument', () => {
  it('names each part by its display path and has no tree', () => {
    const flat = flatDocument(assemblyDoc());
    expect(flat.boards.map((b) => b.name)).toEqual(['Top', 'Drawer › Side', 'Drawer › Front', 'Drawer › Peg › Pin']);
    expect(flat.instances).toEqual([]);
    expect(flat.definitions).toEqual([]);
    expect(displayNames(assemblyDoc()).get('i1/i2/b3')).toBe('Drawer › Peg › Pin');
  });
  it('places parts exactly as worldParts does', () => {
    const doc = assemblyDoc();
    expect(flatDocument(doc).boards.map((b) => b.position)).toEqual(worldParts(doc).map((b) => b.position));
  });
});
