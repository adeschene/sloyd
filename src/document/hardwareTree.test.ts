import { describe, expect, it, beforeEach } from 'vitest';
import { createBoard, createDocument, migrateDocument } from './document';
import { placementsOf, resolvedPartAt, worldParts, flatDocument } from './tree';
import { groupItems, makeUniqueItem, mirroredCopy, ungroupItem } from './treeOps';
import { applyWorldEdits, writeBackFlat } from './treeEdit';
import { repairTree } from './treeRepair';
import { placeBoard } from './frames';
import { chiralPart } from './turnFixtures';
import { useStore } from '../store/store';
import type { Board, Definition, HardwareUse, Instance, Shape, SloydDocument, StoredBoard } from './types';

/** Hardware totals per type, an independent oracle (kept beside Task 4's `hardwareTotals`): every placed part's
 *  entries, every definition's entries once per placement, and the document's own. */
function totalsByType(doc: SloydDocument): Map<string, number> {
  const out = new Map<string, number>();
  const add = (uses: readonly HardwareUse[], times: number) => {
    for (const u of uses) out.set(u.type, (out.get(u.type) ?? 0) + u.count * times);
  };
  for (const b of worldParts(doc)) add(b.hardware, 1);
  const placed = placementsOf(doc);
  for (const d of doc.definitions) add(d.hardware, placed.get(d.id) ?? 0);
  add(doc.hardware, 1);
  return out;
}
const totals = (doc: SloydDocument) => Object.fromEntries([...totalsByType(doc)].sort());

const TYPES = [{ id: 'h1', name: 'Hinge', packSize: 1, pricePerPack: null }, { id: 'h2', name: 'Pull', packSize: 1, pricePerPack: null }];
const hw = (...pairs: [string, number][]): HardwareUse[] => pairs.map(([type, count]) => ({ type, count }));
const part = (id: string, hardware: HardwareUse[] = [], x = 0): Board =>
  createBoard({ id, name: id, length: 10, width: 4, thickness: 0.75, position: [x, 0, 0], hardware });
const inst = (id: string, definition: string, x = 0, over: Partial<Instance> = {}): Instance =>
  ({ id, name: id, definition, position: [x, 0, 0], rotation: 0, ...over });
const def = (id: string, boards: StoredBoard[], instances: Instance[] = [], hardware: HardwareUse[] = []): Definition =>
  ({ id, boards, instances, hardware });
const docWith = (over: Partial<SloydDocument>): SloydDocument => ({ ...createDocument('HW'), hardwareTypes: TYPES, ...over });

describe('Ungroup moves an assembly\'s hardware to its parent (hardware spec §6, Amended P1)', () => {
  it('ungroup moves hardware to the root', () => {
    const doc = docWith({ hardware: [], instances: [inst('i1', 'd1')], definitions: [def('d1', [part('p', hw(['h1', 2]))], [], hw(['h1', 3]))] });
    const before = totals(doc);
    const r = ungroupItem(doc, 'i1')!;
    expect(r).not.toBeNull();
    expect(r.doc.hardware).toEqual(hw(['h1', 3]));
    expect(totals(r.doc)).toEqual(before);
    expect(before).toEqual({ h1: 5 });
  });

  it('ungroup merges into the root\'s existing entries, one per type, canonical', () => {
    const doc = docWith({ hardware: hw(['h2', 1], ['h1', 4]), instances: [inst('i1', 'd1')], definitions: [def('d1', [part('p')], [], hw(['h1', 3], ['h2', 2]))] });
    const before = totals(doc);
    const r = ungroupItem(doc, 'i1')!;
    expect(r.doc.hardware).toEqual(hw(['h1', 7], ['h2', 3]));
    expect(totals(r.doc)).toEqual(before);
  });

  it('ungroup into a definition merges', () => {
    // Root -> outer (d1, [h1 1]) -> inner (d2, [h1 5]) -> part [h1 2]; the outer placed twice.
    const doc = docWith({
      instances: [inst('o1', 'd1'), inst('o2', 'd1', 40)],
      definitions: [def('d1', [part('a')], [inst('in', 'd2', 20)], hw(['h1', 1])), def('d2', [part('p', hw(['h1', 2]))], [], hw(['h1', 5]))],
    });
    const before = totals(doc);
    const r = ungroupItem(doc, 'o1/in')!;
    expect(r).not.toBeNull();
    const outer = r.doc.definitions.find((d) => d.id === 'd1')!;
    expect(outer.hardware).toEqual(hw(['h1', 6]));
    expect(r.doc.hardware).toEqual([]);
    expect(totals(r.doc)).toEqual(before);
    expect(before).toEqual({ h1: 2 * (1 + 5 + 2) });
  });

  it('ungroup keeps totals for a shared definition', () => {
    const doc = docWith({ instances: [inst('i1', 'd1'), inst('i2', 'd1', 30)], definitions: [def('d1', [part('p', hw(['h1', 2]))], [], hw(['h1', 3], ['h2', 1]))] });
    const before = totals(doc);
    const r = ungroupItem(doc, 'i1')!;
    expect(r.doc.instances.map((i) => i.definition)).toEqual(['d1']);
    expect(r.doc.definitions.find((d) => d.id === 'd1')!.hardware).toEqual(hw(['h1', 3], ['h2', 1]));
    expect(r.doc.hardware).toEqual(hw(['h1', 3], ['h2', 1]));
    expect(totals(r.doc)).toEqual(before);
  });

  it('ungroup refuses an overflowing merge', () => {
    const doc = docWith({ hardware: hw(['h1', 600]), instances: [inst('i1', 'd1')], definitions: [def('d1', [part('p')], [], hw(['h1', 600]))] });
    expect(ungroupItem(doc, 'i1')).toBeNull();
  });

  it('ungroup to exactly 999 is allowed', () => {
    const doc = docWith({ hardware: hw(['h1', 600]), instances: [inst('i1', 'd1')], definitions: [def('d1', [part('p')], [], hw(['h1', 399]))] });
    expect(ungroupItem(doc, 'i1')!.doc.hardware).toEqual(hw(['h1', 999]));
  });

  it('a lifted plain part owns its hardware array (no array shared with the definition it left)', () => {
    const doc = docWith({ instances: [inst('i1', 'd1'), inst('i2', 'd1', 30)], definitions: [def('d1', [part('p', hw(['h1', 2]))])] });
    const r = ungroupItem(doc, 'i1')!;
    const lifted = r.doc.boards.find((b) => b.name === 'p') as Board;
    const orig = r.doc.definitions[0]!.boards[0] as Board;
    expect(lifted.hardware).toEqual(hw(['h1', 2]));
    expect(lifted.hardware).not.toBe(orig.hardware);
    expect(lifted.hardware[0]).not.toBe(orig.hardware[0]);
  });
});

describe('copies keep hardware (hardware spec §6)', () => {
  it('mirrored copy and make unique keep hardware', () => {
    const doc = docWith({ instances: [inst('i1', 'd1')], definitions: [def('d1', [part('p', hw(['h1', 2]))], [], hw(['h2', 1]))] });
    const once = totals(doc);
    const m = mirroredCopy(doc, 'i1')!;
    expect(totals(m.doc)).toEqual({ h1: once.h1! * 2, h2: once.h2! * 2 });
    const u = makeUniqueItem(m.doc, m.path)!;
    const old = u.definitions.find((d) => d.id === 'd1')!;
    const fresh = u.definitions.find((d) => d.id !== 'd1')!;
    expect(fresh.hardware).toEqual(old.hardware);
    expect(fresh.hardware).not.toBe(old.hardware);
    const [oldPart, newPart] = [old.boards[0] as Board, fresh.boards[0] as Board];
    expect(newPart.hardware).toEqual(oldPart.hardware);
    expect(newPart.hardware).not.toBe(oldPart.hardware);
    expect(totals(u)).toEqual(totals(m.doc));
  });

  it('split copy keeps hardware', () => {
    // writeBackFlat → splitAssemblies → copyDefinition: three placements of d1, the third's part gets a different cut.
    const cut = { face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 1, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 };
    const doc = docWith({
      instances: [0, 1, 2].map((k) => inst(`i${k}`, 'd1', k * 20)),
      definitions: [def('d1', [part('b1', hw(['h1', 2]))], [], hw(['h2', 3]))],
    });
    const before = totals(doc);
    const flatBefore = flatDocument(doc).boards;
    const after = flatBefore.map((b, k) => ({ ...b, cuts: [{ id: `x${k}`, ...cut, offset: k === 2 ? 3 : 1 }] }));
    const out = writeBackFlat(doc, flatBefore, after);
    expect(out.instances[2]!.definition).not.toBe('d1');
    expect(out.definitions).toHaveLength(2);
    for (const d of out.definitions) {
      expect(d.hardware).toEqual(hw(['h2', 3]));
      expect((d.boards[0] as Board).hardware).toEqual(hw(['h1', 2]));
    }
    const [a, b] = out.definitions;
    expect(a!.hardware).not.toBe(b!.hardware);
    expect((a!.boards[0] as Board).hardware).not.toBe((b!.boards[0] as Board).hardware);
    expect(totals(out)).toEqual(before);
  });

  it('group starts empty', () => {
    const doc = docWith({ boards: [part('a', hw(['h1', 2])), part('b', [], 20)], hardware: hw(['h2', 1]) });
    const before = totals(doc);
    const r = groupItems(doc, null, ['a', 'b'])!;
    const made = r.doc.definitions[0]!;
    expect(made.hardware).toEqual([]);
    expect((made.boards.find((b) => b.id === 'a') as Board).hardware).toEqual(hw(['h1', 2]));
    expect(r.doc.hardware).toEqual(hw(['h2', 1]));
    expect(totals(r.doc)).toEqual(before);
  });
});

describe('repairTree keeps definition hardware (hardware spec §6, R1)', () => {
  const doc = () => docWith({ instances: [inst('i1', 'd1'), inst('i2', 'd1', 20)], definitions: [def('d1', [part('p')], [], hw(['h1', 3]))] });
  it('kept as is (copyShared false)', () =>
    expect(repairTree(doc(), { copyShared: false }).definitions[0]!.hardware).toEqual(hw(['h1', 3])));
  it('a shared definition copied below v11 carries it, in its own array', () => {
    const out = repairTree(doc(), { copyShared: true });
    expect(out.definitions).toHaveLength(2);
    for (const d of out.definitions) expect(d.hardware).toEqual(hw(['h1', 3]));
    expect(out.definitions[0]!.hardware).not.toBe(out.definitions[1]!.hardware);
  });
  it('through migrateDocument on raw JSON', () => {
    const raw = JSON.parse(JSON.stringify({ ...doc(), version: 20 }));
    expect(migrateDocument(raw).definitions[0]!.hardware).toEqual(hw(['h1', 3]));
  });
});

describe('a mirror leaves hardware untouched (hardware spec §2.2, inv 44)', () => {
  const POSTURES = ['flat', 'on-edge', 'upright'] as const;
  const CHAINS: Partial<Instance>[] = [{ rotation: 90 }, { rotation: 90, mirrored: true }, { rotation: 270, mirrored: true }, { rotation: 0, mirrored: true }];
  it('placed hardware deep-equals the stored; lower∘place = identity', () => {
    for (const posture of POSTURES) for (const A of CHAINS) {
      const b = { ...chiralPart(posture), id: 'b1', hardware: hw(['h1', 2], ['h2', 1]) };
      const d = docWith({ instances: [inst('i1', 'd1', 6, A)], definitions: [def('d1', [b])] });
      const placed = placeBoard(d.instances[0]!, b);
      expect(placed.hardware, `${posture} ${JSON.stringify(A)}`).toEqual(b.hardware);
      const world = worldParts(d).find((x) => x.id === 'i1/b1')!;
      expect(world.hardware).toEqual(b.hardware);
      // An edit elsewhere lowers back: the stored hardware is the SAME array.
      const out = applyWorldEdits(d, [{ before: world, after: { ...world, name: 'Renamed' } }]);
      expect((out.definitions[0]!.boards[0] as Board).hardware).toBe(b.hardware);
      // A hardware edit through the mirror is stored as seen.
      const edited = applyWorldEdits(d, [{ before: world, after: { ...world, hardware: hw(['h1', 5]) } }]);
      expect((edited.definitions[0]!.boards[0] as Board).hardware).toEqual(hw(['h1', 5]));
      expect(worldParts(edited).find((x) => x.id === 'i1/b1')!.hardware).toEqual(hw(['h1', 5]));
    }
  });
});

describe('shared Shapes and hardware (inv 45)', () => {
  const shape: Shape = { id: 's1', length: 20, width: 2, thickness: 2, material: 'oak', grain: 'length', posture: 'upright', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long', hardware: hw(['h1', 2]) };
  const doc = () => docWith({ shapes: [shape], boards: [0, 1, 2].map((k) => ({ id: `l${k}`, name: `Leg ${k}`, position: [k * 10, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })) });

  it('a hardware edit on a shaped part reaches the Shape; every user reads it', () => {
    const d = doc();
    const world = resolvedPartAt(d, 'l1')!;
    const out = applyWorldEdits(d, [{ before: world, after: { ...world, hardware: hw(['h1', 4], ['h2', 1]) } }]);
    expect(out.shapes).toHaveLength(1);
    expect(out.shapes[0]!.hardware).toEqual(hw(['h1', 4], ['h2', 1]));
    expect(out.boards.every((b) => 'shape' in b && b.shape === 's1')).toBe(true);
    expect(worldParts(out).map((b) => b.hardware)).toEqual([0, 1, 2].map(() => hw(['h1', 4], ['h2', 1])));
  });

  it('users whose hardware differs split the Shape (groupSignature)', () => {
    const d = doc();
    const before = flatDocument(d).boards;
    const sets = [hw(['h1', 2]), hw(['h1', 2]), hw(['h1', 3])];
    const out = writeBackFlat(d, before, before.map((b, k) => ({ ...b, hardware: sets[k]! })));
    expect(out.shapes).toHaveLength(2);
    const shapeOf = (id: string) => (out.boards.find((b) => b.id === id) as { shape: string }).shape;
    expect(shapeOf('l0')).toBe(shapeOf('l1'));
    expect(shapeOf('l2')).not.toBe(shapeOf('l0'));
    expect(worldParts(out).map((b) => b.hardware)).toEqual(sets);
  });

  it('placements of one definition whose parts differ only in hardware split it (resultSignature)', () => {
    const d = docWith({ instances: [inst('i0', 'd1'), inst('i1', 'd1', 20)], definitions: [def('d1', [part('b1', hw(['h1', 2]))])] });
    const before = flatDocument(d).boards;
    const out = writeBackFlat(d, before, before.map((b, k) => ({ ...b, hardware: k === 0 ? hw(['h1', 2]) : hw(['h1', 7]) })));
    expect(out.instances[0]!.definition).not.toBe(out.instances[1]!.definition);
    expect(worldParts(out).map((b) => b.hardware)).toEqual([hw(['h1', 2]), hw(['h1', 7])]);
  });
});

describe('store copies (hardware spec §6)', () => {
  const s = () => useStore.getState();
  beforeEach(() => s().replaceDocument(docWith({ boards: [part('a', hw(['h1', 2])), part('b', [], 20)] })));

  it('duplicate and copy in a row copy part hardware', () => {
    s().duplicateBoards(['a']);
    expect(totals(s().doc)).toEqual({ h1: 4 });
    const copy = s().doc.boards.find((b) => b.id !== 'a' && b.id !== 'b') as Board;
    const orig = s().doc.boards.find((b) => b.id === 'a') as Board;
    expect(copy.hardware).toEqual(orig.hardware);
    expect(copy.hardware).not.toBe(orig.hardware);
    expect(copy.hardware[0]).not.toBe(orig.hardware[0]);
    s().replaceDocument(docWith({ boards: [part('a', hw(['h1', 2]))] }));
    s().copyInRow(['a'], 4, 0, 1, 12);
    expect(totals(s().doc)).toEqual({ h1: 8 });
  });

  it('duplicating an assembly copies its hardware once per copy', () => {
    s().replaceDocument(docWith({ instances: [inst('i1', 'd1')], definitions: [def('d1', [part('p', hw(['h1', 1]))], [], hw(['h2', 2]))] }));
    s().duplicateBoards(['i1']);
    expect(totals(s().doc)).toEqual({ h1: 2, h2: 4 });
  });

  it('link gives the first part\'s hardware', () => {
    s().replaceDocument(docWith({ boards: [part('a', hw(['h1', 4])), part('b', [], 20)] }));
    s().linkBoards(['a', 'b']);
    expect(s().doc.shapes).toHaveLength(1);
    expect(worldParts(s().doc).map((b) => b.hardware)).toEqual([hw(['h1', 4]), hw(['h1', 4])]);
  });
});
