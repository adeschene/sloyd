import { copyInstanceTree, groupItems, nextAssemblyName, pruneDefinitions, removeItems, turnInstance, ungroupItem } from './treeOps';
import { childrenOf, instanceAt, partAt, worldParts } from './tree';
import { assemblyDoc } from './treeFixtures';
import { boardsBounds } from './geometry';
import { worldSolids } from './designCheck';
import { rotateQuarter, sameSet } from './turnFixtures';
import { createBoard } from './document';

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

describe('copies, removal, pruning', () => {
  it('copyInstanceTree copies every definition below with fresh ids', () => {
    const doc = assemblyDoc();
    const { instance, definitions } = copyInstanceTree(doc, doc.instances[0]!);
    expect(instance.id).not.toBe('i1');
    expect(definitions).toHaveLength(2);
    for (const d of definitions) expect(['d1', 'd2']).not.toContain(d.id);
  });
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
