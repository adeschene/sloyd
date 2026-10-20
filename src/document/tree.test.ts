import {
  childrenOf, containerAt, containerLinear, definitionAt, displayNames, flatDocument, instanceAt, instancesOn, isCovered, itemPaths,
  joinPath, lastSegment, parentPath, resolvedPartAt, worldParts,
} from './tree';
import { placeBoard } from './frames';
import { assemblyDoc, cabinetsDoc } from './treeFixtures';
import { createDocument, createBoard } from './document';
import type { Shape, SloydDocument } from './document';

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
    const b3 = resolvedPartAt(doc, 'i1/i2/b3')!;
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

  it('worldParts resolves a shaped part inside a turned assembly', () => {
    const shape: Shape = { id: 's1', length: 10, width: 2, thickness: 1, material: 'pine', grain: 'length', posture: 'flat', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long' as const };
    const doc: SloydDocument = {
      ...createDocument(),
      instances: [{ id: 'i1', name: 'A', definition: 'd1', position: [0, 0, 0], rotation: 90 }],
      definitions: [{ id: 'd1', boards: [{ id: 'b1', name: 'P', position: [0, 0, 0], rotation: 0, shape: 's1' }], instances: [] }],
      shapes: [shape],
    };
    const [p] = worldParts(doc);
    expect(p).toMatchObject({ id: 'i1/b1', length: 10, rotation: 90, shape: 's1' });
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
  it('containerLinear sums the turns on the path and xors the mirrors', () => {
    const doc = assemblyDoc();
    expect(containerLinear(doc, null)).toEqual({ rotation: 0, mirrored: false });
    expect(containerLinear(doc, 'i1')).toEqual({ rotation: 90, mirrored: false });
    expect(containerLinear(doc, 'i1/i2')).toEqual({ rotation: 0, mirrored: false });
    const m = { ...doc, instances: doc.instances.map((i) => (i.id === 'i1' ? { ...i, mirrored: true } : i)) };
    expect(containerLinear(m, 'i1/i2')).toEqual({ rotation: 180, mirrored: true });
  });
});

// Fu 228: the null and miss paths of the readers, pinned with literals.
describe('path helpers and readers on paths that name nothing (fu 228)', () => {
  it('joinPath with a null parent is the id alone; lastSegment of a bare id is itself', () => {
    expect(joinPath(null, 'b1')).toBe('b1');
    expect(joinPath('i1', 'b1')).toBe('i1/b1');
    expect(joinPath('i1/i2', 'b3')).toBe('i1/i2/b3');
    expect(lastSegment('b1')).toBe('b1');
    expect(lastSegment('i1/i2/b3')).toBe('b3');
    expect(lastSegment('')).toBe('');
    expect(parentPath('b1')).toBeNull();
  });

  it('instancesOn is null for a path that misses at any depth, and for a part path', () => {
    const doc = assemblyDoc();
    expect(instancesOn(doc, 'nope')).toBeNull();
    expect(instancesOn(doc, 'i1/nope')).toBeNull();
    expect(instancesOn(doc, 'nope/i2')).toBeNull();
    expect(instancesOn(doc, 'r1')).toBeNull();           // a root PART is not an instance
    expect(instancesOn(doc, 'i1/b1')).toBeNull();        // nor is a part inside one
    expect(instancesOn(doc, '')).toBeNull();
    expect(instancesOn(doc, 'i1/i2')!.map((i) => i.id)).toEqual(['i1', 'i2']);
  });

  it('instancesOn is null when an instance on the path names a missing definition', () => {
    const doc = { ...assemblyDoc(), definitions: assemblyDoc().definitions.filter((d) => d.id !== 'd1') };
    expect(instancesOn(doc, 'i1')).toBeNull();
    expect(instanceAt(doc, 'i1')).toBeNull();
    expect(definitionAt(doc, 'i1')).toBeNull();
  });

  it('instanceAt, definitionAt and containerAt are null for a part path or a miss', () => {
    const doc = assemblyDoc();
    for (const p of ['nope', 'r1', 'i1/b1', 'i1/nope']) {
      expect(instanceAt(doc, p)).toBeNull();
      expect(definitionAt(doc, p)).toBeNull();
    }
    expect(containerAt(doc, 'nope')).toBeNull();
    expect(containerAt(doc, null)).toBe(doc);
    expect(definitionAt(doc, 'i1/i2')!.id).toBe('d2');
  });
});

describe('flatDocument', () => {
  // A fixture small enough to derive by hand. Frames: Frame at (10,0,20) turned 0
  // holds Rail at (0.5,0,0.25) and Foot at (3,0,4) holding Pad at (0.125,0,0.5);
  // Turned at (50,0,60) turned 90 holds an 8in-long flat Slat at (2,0,3).
  // A quarter turn maps (x,y,z) to (z,y,-x) and shifts the corner by -length in z,
  // so Slat lands at (50+3, 0, 60-2-8) = (53, 0, 50). Nothing here is read back
  // from worldParts, flatDocument's own source.
  const small = (): SloydDocument => ({
    ...createDocument('Small'),
    boards: [createBoard({ id: 'r', name: 'Top', length: 10, width: 4, thickness: 1, position: [1, 0, 2] })],
    instances: [
      { id: 'a', name: 'Frame', definition: 'da', position: [10, 0, 20], rotation: 0 },
      { id: 'b', name: 'Turned', definition: 'db', position: [50, 0, 60], rotation: 90 },
    ],
    definitions: [
      { id: 'da', boards: [createBoard({ id: 'p', name: 'Rail', position: [0.5, 0, 0.25] })],
        instances: [{ id: 'n', name: 'Foot', definition: 'dn', position: [3, 0, 4], rotation: 0 }] },
      { id: 'dn', boards: [createBoard({ id: 'q', name: 'Pad', position: [0.125, 0, 0.5] })], instances: [] },
      { id: 'db', boards: [createBoard({ id: 'u', name: 'Slat', length: 8, width: 2, thickness: 1, position: [2, 0, 3] })], instances: [] },
    ],
  });

  it('has literal names, ids, positions and turns for a small nested fixture', () => {
    const flat = flatDocument(small());
    expect(flat.boards.map((b) => [b.id, b.name, b.position, b.rotation])).toEqual([
      ['r', 'Top', [1, 0, 2], 0],
      ['a/p', 'Frame › Rail', [10.5, 0, 20.25], 0],
      ['a/n/q', 'Frame › Foot › Pad', [13.125, 0, 24.5], 0],
      ['b/u', 'Turned › Slat', [53, 0, 50], 90],
    ]);
    expect([flat.instances, flat.definitions, flat.shapes]).toEqual([[], [], []]);
  });

  it('leaves its source document untouched', () => {
    const doc = small();
    const copy = JSON.parse(JSON.stringify(doc));
    flatDocument(doc);
    expect(JSON.parse(JSON.stringify(doc))).toEqual(copy);
    expect(doc.boards[0]!.name).toBe('Top');
  });

  it('returns a document with no tree as itself', () => {
    const plain = createDocument('P');
    expect(flatDocument(plain)).toBe(plain);
  });

  it('names each part by its display path and has no tree', () => {
    const flat = flatDocument(assemblyDoc());
    expect(worldParts(flat).map((b) => b.name)).toEqual(['Top', 'Drawer › Side', 'Drawer › Front', 'Drawer › Peg › Pin']);
    expect(flat.instances).toEqual([]);
    expect(flat.definitions).toEqual([]);
    expect(displayNames(assemblyDoc()).get('i1/i2/b3')).toBe('Drawer › Peg › Pin');
  });
});

import { treeRows } from './tree';
it('treeRows lists the tree depth first', () => {
  expect(treeRows(assemblyDoc()).map((r) => [r.path, r.kind, r.depth])).toEqual([
    ['r1', 'part', 0], ['i1', 'assembly', 0], ['i1/b1', 'part', 1], ['i1/b2', 'part', 1],
    ['i1/i2', 'assembly', 1], ['i1/i2/b3', 'part', 2],
  ]);
});

// Fu 231: treeRows.copies, directly (cabinetsDoc: three cabinets each holding a
// drawer, plus one drawer on its own at the root).
describe('treeRows copies (fu 231)', () => {
  it('counts a nested instance once per placement of its parent; parts and unshared assemblies carry none', () => {
    const rows = treeRows(cabinetsDoc());
    const copies = (path: string) => rows.find((r) => r.path === path)!;
    expect(rows.map((r) => [r.path, r.copies])).toEqual([
      ['r', undefined],
      ['c1', 3], ['c1/side', undefined], ['c1/dr', 4], ['c1/dr/front', undefined],
      ['c2', 3], ['c2/side', undefined], ['c2/dr', 4], ['c2/dr/front', undefined],
      ['c3', 3], ['c3/side', undefined], ['c3/dr', 4], ['c3/dr/front', undefined],
      ['x', 4], ['x/front', undefined],
      ['solo', undefined], ['solo/only', undefined],
    ]);
    // Absent, not 0 or 1: the badge renders on truthiness.
    expect('copies' in copies('solo')).toBe(false);
    expect('copies' in copies('r')).toBe(false);
  });
});
