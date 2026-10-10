import { groupItems, makeUniqueItem, nextAssemblyName, pruneDefinitions, removeItems, shareInstance, turnInstance, ungroupItem } from './treeOps';
import { dissolveShapes, isShaped } from './shapes';
import type { Board, SloydDocument } from './types';
import { childrenOf, instanceAt, partAt, worldParts } from './tree';
import { assemblyDoc, cabinetsDoc } from './treeFixtures';
import { boardsBounds } from './geometry';
import { worldSolids } from './designCheck';
import { rotateQuarter, sameSet } from './turnFixtures';
import { createBoard, createDocument } from './document';

const strip = (b: { id: string }) => ({ ...b, id: '' });

describe('groupItems (assemblies spec §4.1)', () => {
  it('moves nothing, bit for bit, at the root', () => {
    const doc = assemblyDoc();
    const before = worldParts(doc);
    const r = groupItems(doc, null, ['r1', 'i1'])!;
    const after = new Map(worldParts(r.doc).map((b) => [b.id, b]));
    for (const b of before) expect(strip(after.get(r.rekey(b.id))!)).toEqual(strip(b));
    expect(r.path).toBe(childrenOf(r.doc, null)[0]);
  });

  it('moves nothing, bit for bit, inside a turned assembly', () => {
    const doc = assemblyDoc();
    const before = worldParts(doc);
    const r = groupItems(doc, 'i1', ['i1/b1', 'i1/i2'])!;
    const after = new Map(worldParts(r.doc).map((b) => [b.id, b]));
    for (const b of before) expect(strip(after.get(r.rekey(b.id))!)).toEqual(strip(b));
    expect(r.rekey('i1/i2/b3')).toBe(`${r.path}/i2/b3`);
    expect(r.rekey('i1/b2')).toBe('i1/b2');
  });

  it('names the new assembly Assembly N among its siblings', () => {
    const doc = assemblyDoc();
    const a = groupItems(doc, null, ['r1'])!;
    expect(instanceAt(a.doc, a.path)!.name).toBe('Assembly 1');
    const b = groupItems(a.doc, null, ['i1'])!;
    expect(instanceAt(b.doc, b.path)!.name).toBe('Assembly 2');
    expect(nextAssemblyName([{ id: 'x', name: 'Assembly 1' }])).toBe('Assembly 2');
  });

  it('refuses nothing to group and ids that are not direct children', () => {
    const doc = assemblyDoc();
    expect(groupItems(doc, null, [])).toBeNull();
    expect(groupItems(doc, null, ['i1/b1'])).toBeNull();
  });

  // Fu 228: an id that names nothing refuses the WHOLE group, even beside a real one.
  it('refuses an id that names nothing, alone or beside real ones, and a container that does not exist', () => {
    const doc = assemblyDoc();
    expect(groupItems(doc, null, ['nope'])).toBeNull();
    expect(groupItems(doc, null, ['r1', 'nope'])).toBeNull();
    expect(groupItems(doc, 'i1', ['i1/b1', 'i1/nope'])).toBeNull();
    expect(groupItems(doc, 'nope', ['nope/b1'])).toBeNull();
    // The bare id of a part that lives inside an assembly is not a root child either.
    expect(groupItems(doc, null, ['b1'])).toBeNull();
    // The document was not touched by the refusals.
    expect(doc).toEqual(assemblyDoc());
  });

  // Ids are unique per CONTAINER, so a deep path whose last segment matches a
  // root part's id must not group that root part (the count check alone passes it).
  it('refuses a path that is not a direct child even when its last segment matches a direct child\'s id', () => {
    const doc = { ...assemblyDoc(), boards: [...assemblyDoc().boards, createBoard({ id: 'b1', name: 'Shelf' })] };
    expect(groupItems(doc, null, ['i1/b1'])).toBeNull();
    expect(groupItems(doc, null, ['b1'])).not.toBeNull();
  });

  it('a duplicate path in the list is one item, not a refusal', () => {
    const r = groupItems(assemblyDoc(), null, ['r1', 'r1'])!;
    expect(r.doc.boards).toEqual([]);
    expect(instanceAt(r.doc, r.path)!.name).toBe('Assembly 1');
    expect(childrenOf(r.doc, r.path)).toEqual([`${r.path}/r1`]);
  });
});

describe('ungroupItem (assemblies spec §4.1, §10)', () => {
  it('leaves direct child parts bit-identical and deeper parts within rounding', () => {
    const doc = assemblyDoc();
    const before = worldParts(doc);
    const r = ungroupItem(doc, 'i1')!;
    const after = new Map(worldParts(r.doc).map((b) => [b.id, b]));
    for (const id of ['i1/b1', 'i1/b2']) {
      expect(strip(after.get(r.rekey(id))!)).toEqual(strip(before.find((b) => b.id === id)!));
    }
    const deep = after.get(r.rekey('i1/i2/b3'))!;
    const was = before.find((b) => b.id === 'i1/i2/b3')!;
    deep.position.forEach((v, i) => expect(v).toBeCloseTo(was.position[i]!, 9));
    expect(deep.rotation).toBe(was.rotation);
  });

  it('re-mints a colliding id and dedupes a colliding name, then prunes the definition', () => {
    const doc = assemblyDoc();
    const clash = { ...doc, boards: [...doc.boards, createBoard({ id: 'b1', name: 'Side' })] };
    const r = ungroupItem(clash, 'i1')!;
    const ids = childrenOf(r.doc, null);
    expect(new Set(ids).size).toBe(ids.length);
    const names = r.children.map((p) => partAt(r.doc, p)?.name ?? instanceAt(r.doc, p)!.name);
    expect(names).toContain('Side (1)');
    expect(r.doc.definitions.map((d) => d.id)).toEqual(['d2']);
  });
});

describe('ungroupItem refusals (fu 228)', () => {
  it('is null for a part, a part inside an assembly, a path that names nothing, and an instance with a missing definition', () => {
    const doc = assemblyDoc();
    expect(ungroupItem(doc, 'r1')).toBeNull();
    expect(ungroupItem(doc, 'i1/b1')).toBeNull();
    expect(ungroupItem(doc, 'nope')).toBeNull();
    expect(ungroupItem(doc, 'i1/nope')).toBeNull();
    const orphan = { ...doc, definitions: doc.definitions.filter((d) => d.id !== 'd1') };
    expect(ungroupItem(orphan, 'i1')).toBeNull();
    expect(doc).toEqual(assemblyDoc());
  });
});

describe('copies, removal, pruning', () => {
  it('removeItems prunes everything below', () => {
    const out = removeItems(assemblyDoc(), ['i1']);
    expect(out.instances).toEqual([]);
    expect(out.definitions).toEqual([]);
  });
  it('pruneDefinitions drops an unreferenced definition', () => {
    const doc = assemblyDoc();
    const out = pruneDefinitions({ ...doc, definitions: [...doc.definitions, { id: 'dz', boards: [], instances: [] }] });
    expect(out.definitions.map((d) => d.id)).toEqual(['d1', 'd2']);
  });
});

describe('turnInstance (assemblies spec §4.2)', () => {
  it('turns about the world box centre: every solid is the old solid turned a quarter', () => {
    const doc = assemblyDoc();
    const parts = (d: typeof doc) => worldParts(d).filter((b) => b.id.startsWith('i1/'));
    const box = boardsBounds(parts(doc))!;
    const c: [number, number, number] = [(box.min[0] + box.max[0]) / 2, box.min[1], (box.min[2] + box.max[2]) / 2];
    const out = turnInstance(doc, 'i1', 180);
    const corners = (bs: ReturnType<typeof parts>) => bs.flatMap(worldSolids).flatMap((s) => [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [k & 1 ? s.max[0] : s.min[0], k & 2 ? s.max[1] : s.min[1], k & 4 ? s.max[2] : s.min[2]]));
    const want = corners(parts(doc)).map((p) => rotateQuarter(p as [number, number, number], c));
    // all 8 corners of each solid: a turned box's min/max diagonal is not the old diagonal turned
    expect(sameSet(corners(parts(out)) as number[][], want)).toBe(true);
  });
});

describe('shared definitions', () => {
  const base = (): SloydDocument => ({
    ...createDocument(),
    instances: [
      { id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 },
      { id: 'i2', name: 'Drawer (1)', definition: 'd1', position: [20, 0, 0], rotation: 0 },
    ],
    definitions: [
      { id: 'd1', boards: [createBoard({ id: 'b1', name: 'Side' }), { id: 'b2', name: 'Leg', position: [1, 0, 1], rotation: 0, shape: 's1' }],
        instances: [{ id: 'k1', name: 'Knob', definition: 'd2', position: [0, 0, 0], rotation: 0 }] },
      { id: 'd2', boards: [createBoard({ id: 'n1', name: 'Knob' })], instances: [] },
    ],
    shapes: [{ id: 's1', length: 6, width: 1, thickness: 1, material: 'oak', grain: 'length', posture: 'upright', cuts: [] }],
  });

  it('shareInstance names the same definition with a fresh id', () => {
    const inst = base().instances[0]!;
    const c = shareInstance(inst);
    expect(c.definition).toBe('d1');
    expect(c.id).not.toBe(inst.id);
    expect(c.position).not.toBe(inst.position);
  });

  it('makeUniqueItem copies ONE level: plain parts copied with their ids, shaped parts and nested instances still shared', () => {
    const doc = base();
    const out = makeUniqueItem(doc, 'i2')!;
    const i2 = out.instances.find((i) => i.id === 'i2')!;
    expect(i2.definition).not.toBe('d1');
    const copy = out.definitions.find((d) => d.id === i2.definition)!;
    expect(copy.boards.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(copy.boards[0]).not.toBe(doc.definitions[0]!.boards[0]);
    expect(copy.boards[1]).toMatchObject({ shape: 's1' });
    expect(copy.instances[0]!.definition).toBe('d2');
    expect(out.instances.find((i) => i.id === 'i1')!.definition).toBe('d1');
    // occurrence paths are unchanged
    expect(worldParts(out).map((b) => b.id)).toEqual(worldParts(doc).map((b) => b.id));
  });

  // Fu 231. An instance INSIDE a shared container is one stored record whatever
  // the number of placements: the copy is made on that record, so every
  // placement of the container follows it, and the count that matters is how
  // many stored instances name the drawer's definition.
  describe('inside a shared container (cabinetsDoc: dc placed 3 times, its drawer dd also loose at the root)', () => {
    it('re-points the one stored drawer, so every cabinet follows; the loose drawer keeps dd', () => {
      const doc = cabinetsDoc();
      const out = makeUniqueItem(doc, 'c1/dr')!;
      const dc = out.definitions.find((d) => d.id === 'dc')!;
      const copyId = dc.instances[0]!.definition;
      expect(copyId).not.toBe('dd');
      expect(out.definitions.map((d) => d.id)).toEqual(['dc', 'dd', 'ds', copyId]);
      expect(out.instances.find((i) => i.id === 'x')!.definition).toBe('dd');
      for (const p of ['c1/dr', 'c2/dr', 'c3/dr']) expect(instanceAt(out, p)!.definition).toBe(copyId);
      // plain parts copied keeping ids: every occurrence path, and every world position, is unchanged
      expect(worldParts(out).map((b) => [b.id, b.position])).toEqual(worldParts(doc).map((b) => [b.id, b.position]));
      expect(out.definitions.find((d) => d.id === copyId)!.boards[0]).not.toBe(doc.definitions[1]!.boards[0]);
      expect(out.definitions.find((d) => d.id === 'dd')).toBe(doc.definitions[1]);
    });

    it('refuses when the shared container holds the only stored instance of the drawer (the Make Unique button is gated the same way)', () => {
      const doc = cabinetsDoc();
      const noLoose = { ...doc, instances: doc.instances.filter((i) => i.id !== 'x') };
      expect(makeUniqueItem(noLoose, 'c1/dr')).toBeNull();
      // while the cabinet itself, named by three instances, can be split off
      expect(makeUniqueItem(noLoose, 'c2')).not.toBeNull();
    });
  });

  it('makeUniqueItem refuses an instance that is not shared', () => {
    const doc = base();
    const single = { ...doc, instances: [doc.instances[0]!] };
    expect(makeUniqueItem(single, 'i1')).toBeNull();
  });

  it('ungroupItem on a shared copy leaves the other copy and the definition alone', () => {
    const doc = base();
    const out = ungroupItem(doc, 'i2')!.doc;
    expect(out.instances.map((i) => i.id)).toEqual(['i1', 'k1']);
    expect(out.instances.find((i) => i.id === 'k1')!.definition).toBe('d2');
    expect(out.definitions.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(worldParts(out).filter((b) => b.id.startsWith('i1/')).map((b) => b.id)).toEqual(['i1/b1', 'i1/b2', 'i1/k1/n1']);
    // the ungrouped leg keeps its shape; with i1's leg that is two stored users, so it is not dissolved
    expect(out.shapes).toHaveLength(1);
  });

  it('ungroupItem gives a lifted plain part its own Cut objects; the other copy keeps the definition\'s', () => {
    const doc = base();
    const cut = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 2, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 };
    doc.definitions[0]!.boards[0] = { ...(doc.definitions[0]!.boards[0] as Board), cuts: [cut] };
    const out = ungroupItem(doc, 'i2')!.doc;
    const lifted = out.boards.find((b) => b.name === 'Side') as Board;
    const kept = out.definitions.find((d) => d.id === 'd1')!.boards[0] as Board;
    expect(lifted.cuts).toEqual([cut]);
    expect(lifted.cuts).not.toBe(kept.cuts);
    expect(lifted.cuts[0]).not.toBe(kept.cuts[0]);
  });

  it('removeItems keeps a definition another copy still names, and prunes the last', () => {
    const one = removeItems(base(), ['i2']);
    expect(one.definitions.map((d) => d.id)).toEqual(['d1', 'd2']);
    const none = removeItems(one, ['i1']);
    expect(none.definitions).toEqual([]);
    expect(none.shapes).toEqual([]);
  });

  it('dissolveShapes turns a one-user shape back into a plain part', () => {
    const doc = base();
    const out = dissolveShapes(doc);
    const b2 = out.definitions[0]!.boards[1]!;
    expect(isShaped(b2)).toBe(false);
    expect(b2).toMatchObject({ id: 'b2', name: 'Leg', position: [1, 0, 1], length: 6, posture: 'upright' });
    expect(out.shapes).toEqual([]);
    const two = { ...doc, boards: [{ id: 'r1', name: 'Leg R', position: [9, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' }] };
    expect(dissolveShapes(two)).toBe(two);
  });
});
