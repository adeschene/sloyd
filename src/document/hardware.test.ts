import { describe, expect, it } from 'vitest';
import { createBoard, createDocument } from './document';
import { placementsOf, worldParts } from './tree';
import { hardwareTotals, hardwareUsedBy, hardwareUseText, holderHardware, holderPlacements } from './hardware';
import type { Board, Definition, HardwareType, HardwareUse, Instance, Shape, SloydDocument, StoredBoard } from './types';

const TYPES: HardwareType[] = [
  { id: 'h1', name: 'Hinge', packSize: 1, pricePerPack: null },
  { id: 'h2', name: 'Pull', packSize: 1, pricePerPack: null },
  { id: 'h3', name: 'Screw', packSize: 100, pricePerPack: null },
];
const hw = (...pairs: [string, number][]): HardwareUse[] => pairs.map(([type, count]) => ({ type, count }));
const part = (id: string, hardware: HardwareUse[] = [], x = 0, name = id): Board =>
  createBoard({ id, name, length: 10, width: 4, thickness: 0.75, position: [x, 0, 0], hardware });
const inst = (id: string, definition: string, x = 0, name = id): Instance => ({ id, name, definition, position: [x, 0, 0], rotation: 0 });
const def = (id: string, boards: StoredBoard[], instances: Instance[] = [], hardware: HardwareUse[] = []): Definition => ({ id, boards, instances, hardware });
const docWith = (over: Partial<SloydDocument>): SloydDocument => ({ ...createDocument('HW'), hardwareTypes: TYPES, ...over });
const byId = (doc: SloydDocument, id: string) => hardwareTotals(doc).find((t) => t.type.id === id);

/** Copied from hardwareTree.test.ts (never import a test module): an independent per-type oracle. */
function totalsByType(doc: SloydDocument): Record<string, number> {
  const out = new Map<string, number>();
  const add = (uses: readonly HardwareUse[], times: number) => { for (const u of uses) out.set(u.type, (out.get(u.type) ?? 0) + u.count * times); };
  for (const b of worldParts(doc)) add(b.hardware, 1);
  const placed = placementsOf(doc);
  for (const d of doc.definitions) add(d.hardware, placed.get(d.id) ?? 0);
  add(doc.hardware, 1);
  return Object.fromEntries([...out].sort());
}
const counted = (doc: SloydDocument) => Object.fromEntries(hardwareTotals(doc).map((t) => [t.type.id, t.total]).sort());

describe('hardwareTotals (hardware spec §3)', () => {
  it('a root part', () => {
    const t = byId(docWith({ boards: [part('d', hw(['h1', 2]), 0, 'Door')] }), 'h1')!;
    expect(t.total).toBe(2);
    expect(t.uses).toEqual([{ holder: 'Door', each: 2, times: 1 }]);
    expect(hardwareUseText(t)).toBe('Door: 2');
  });

  it('a part inside an assembly placed twice', () => {
    const doc = docWith({
      instances: [inst('i1', 'd1', 0, 'Base cabinet'), inst('i2', 'd1', 30, 'Base cabinet 2')],
      definitions: [def('d1', [part('p', hw(['h1', 2]), 0, 'Left door')])],
    });
    const t = byId(doc, 'h1')!;
    expect(t.total).toBe(4);
    expect(t.uses).toEqual([{ holder: 'Base cabinet › Left door', each: 2, times: 2 }]);
    expect(hardwareUseText(t)).toBe('Base cabinet › Left door: 2 × 2');
  });

  it('an assembly nested in an assembly, both placed twice', () => {
    const doc = docWith({
      instances: [inst('o1', 'd1', 0, 'Outer'), inst('o2', 'd1', 50, 'Outer 2')],
      definitions: [def('d1', [part('a')], [inst('in', 'd2', 20, 'Inner')]), def('d2', [part('p')], [], hw(['h2', 3]))],
    });
    const t = byId(doc, 'h2')!;
    expect(t.total).toBe(6);
    expect(t.uses).toEqual([{ holder: 'Outer › Inner', each: 3, times: 2 }]);
    const deep = docWith({
      instances: [inst('o1', 'd1', 0, 'Outer'), inst('o2', 'd1', 50, 'Outer 2')],
      definitions: [def('d1', [part('a')], [inst('n1', 'd2', 20, 'Inner'), inst('n2', 'd2', 30, 'Inner 2')]), def('d2', [part('p')], [], hw(['h2', 3]))],
    });
    expect(byId(deep, 'h2')!.total).toBe(12);
    expect(byId(deep, 'h2')!.uses[0]!.times).toBe(4);
  });

  it('project and assembly together', () => {
    const doc = docWith({
      hardware: hw(['h1', 40]),
      instances: [inst('i1', 'd1', 0, 'Base cabinet'), inst('i2', 'd1', 30, 'Base cabinet 2')],
      definitions: [def('d1', [part('p')], [], hw(['h1', 40]))],
    });
    const t = byId(doc, 'h1')!;
    expect(t.total).toBe(120);
    expect(hardwareUseText(t)).toBe('Base cabinet: 40 × 2; Project: 40');
  });

  it('two shelves sharing a Shape are two use lines', () => {
    const shape: Shape = { id: 's1', length: 20, width: 2, thickness: 2, material: 'oak', grain: 'length', posture: 'upright', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long', hardware: hw(['h3', 4]) };
    const doc = docWith({
      shapes: [shape],
      boards: [0, 1].map((k) => ({ id: `s${k}`, name: `Shelf ${k}`, position: [k * 10, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })),
    });
    const t = byId(doc, 'h3')!;
    expect(t.total).toBe(8);
    expect(t.uses).toEqual([{ holder: 'Shelf 0', each: 4, times: 1 }, { holder: 'Shelf 1', each: 4, times: 1 }]);
    expect(holderHardware(doc, { kind: 'part', id: 's1' })).toEqual(hw(['h3', 4]));
  });

  it('omits unused types and follows doc.hardwareTypes order', () => {
    const doc = docWith({ boards: [part('a', hw(['h3', 1])), part('b', hw(['h1', 1]), 20)] });
    expect(hardwareTotals(doc).map((t) => t.type.id)).toEqual(['h1', 'h3']);
  });

  it('an unplaced definition counts nothing', () => {
    const doc = docWith({ definitions: [def('d1', [part('p', hw(['h1', 2]))], [], hw(['h1', 3]))] });
    expect(hardwareTotals(doc)).toEqual([]);
  });

  it('memoised and deep-frozen', () => {
    const doc = docWith({ boards: [part('a', hw(['h1', 1]))] });
    expect(hardwareTotals(doc)).toBe(hardwareTotals(doc));
    const t = hardwareTotals(doc)[0]!;
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.uses)).toBe(true);
    expect(Object.isFrozen(t.uses[0])).toBe(true);
  });
});

describe('hardwareUsedBy, holderPlacements, holderHardware', () => {
  const doc = docWith({
    hardware: hw(['h1', 1]),
    boards: [part('top')],
    instances: [inst('i1', 'd1', 0, 'Cab'), inst('i2', 'd1', 30, 'Cab 2'), inst('j1', 'd2', 60, 'Drawer')],
    definitions: [def('d1', [part('p', hw(['h1', 2]))]), def('d2', [part('q')], [], hw(['h1', 1]))],
  });
  it('counts placed holders', () => expect(hardwareUsedBy(doc, 'h1')).toBe(4));
  it('an unused type is 0', () => expect(hardwareUsedBy(doc, 'h2')).toBe(0));
  it('placements of each target kind', () => {
    expect(holderPlacements(doc, { kind: 'project' })).toBe(1);
    expect(holderPlacements(doc, { kind: 'part', id: 'top' })).toBe(1);
    expect(holderPlacements(doc, { kind: 'part', id: 'i1/p' })).toBe(2);
    expect(holderPlacements(doc, { kind: 'assembly', path: 'i2' })).toBe(2);
    expect(holderPlacements(doc, { kind: 'assembly', path: 'j1' })).toBe(1);
  });
  it('the stored list of each target kind', () => {
    expect(holderHardware(doc, { kind: 'project' })).toEqual(hw(['h1', 1]));
    expect(holderHardware(doc, { kind: 'assembly', path: 'j1' })).toEqual(hw(['h1', 1]));
    expect(holderHardware(doc, { kind: 'part', id: 'i1/p' })).toEqual(hw(['h1', 2]));
    expect(holderHardware(doc, { kind: 'part', id: 'top' })).toEqual([]);
  });
});

describe('agreement with the independent oracle', () => {
  const shape: Shape = { id: 's1', length: 20, width: 2, thickness: 2, material: 'oak', grain: 'length', posture: 'upright', cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long', hardware: hw(['h1', 2]) };
  const fixtures: Record<string, SloydDocument> = {
    flat: docWith({ boards: [part('a', hw(['h1', 2])), part('b', hw(['h2', 1], ['h3', 9]), 20)], hardware: hw(['h2', 2]) }),
    shared: docWith({ instances: [inst('i1', 'd1'), inst('i2', 'd1', 30)], definitions: [def('d1', [part('p', hw(['h1', 2]))], [], hw(['h1', 3], ['h2', 1]))] }),
    nested: docWith({
      instances: [inst('o1', 'd1'), inst('o2', 'd1', 40)],
      definitions: [def('d1', [part('a', hw(['h3', 1]))], [inst('in', 'd2', 20)], hw(['h1', 1])), def('d2', [part('p', hw(['h1', 2]))], [], hw(['h1', 5]))],
    }),
    shaped: docWith({
      shapes: [shape], hardware: hw(['h1', 1]),
      boards: [0, 1, 2].map((k) => ({ id: `l${k}`, name: `Leg ${k}`, position: [k * 10, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })),
      instances: [inst('i1', 'd1')], definitions: [def('d1', [part('p')], [], hw(['h2', 4]))],
    }),
  };
  for (const [name, doc] of Object.entries(fixtures)) it(name, () => expect(counted(doc)).toEqual(totalsByType(doc)));
});
