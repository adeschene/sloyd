import { cabinetsDoc } from './treeFixtures';
import { createBoard, createDocument } from './document';
import { pieceKeyed, planAssemblies } from './plans';
import { worldParts } from './tree';
import type { SloydDocument } from './types';

describe('planAssemblies', () => {
  it('lists each definition once, in first-placement order, with nested placements counted', () => {
    // cabinetsDoc: dc placed c1..c3; dd placed under each cabinet (3) and as x (1) = 4; ds once.
    const got = planAssemblies(cabinetsDoc()).map((a) => [a.definition, a.title, a.copies, a.mirroredCopies]);
    expect(got).toEqual([
      ['dc', 'Cabinet', 3, 0],
      ['dd', 'Cabinet › Drawer', 4, 0],
      ['ds', 'Solo', 1, 0],
    ]);
  });

  it('draws a definition in its own frame', () => {
    // dd's only part `front` sits at the definition's origin, not at its placement (1,0,1).
    const dd = planAssemblies(cabinetsDoc()).find((a) => a.definition === 'dd')!;
    expect(dd.parts.map((b) => [b.id, b.position])).toEqual([['front', [0, 0, 0]]]);
  });

  it('counts mirrored placements by parity along the path', () => {
    // c2 mirrored, and the drawer inside every cabinet mirrored: c1/dr odd, c2/dr even, c3/dr odd,
    // x even → dd has 2 mirrored placements; dc has 1 (c2).
    const doc = cabinetsDoc();
    doc.instances = doc.instances.map((i) => (i.id === 'c2' ? { ...i, mirrored: true } : i));
    doc.definitions = doc.definitions.map((d) =>
      d.id === 'dc' ? { ...d, instances: d.instances.map((i) => ({ ...i, mirrored: true })) } : d);
    const byDef = new Map(planAssemblies(doc).map((a) => [a.definition, a.mirroredCopies]));
    expect(byDef.get('dc')).toBe(1);
    expect(byDef.get('dd')).toBe(2);
  });

  it('skips a definition with no parts and returns nothing for a flat document', () => {
    const doc = { ...createDocument('Empty'), instances: [{ id: 'e', name: 'Empty', definition: 'de', position: [0, 0, 0] as [number, number, number], rotation: 0 as const }],
      definitions: [{ id: 'de', boards: [], instances: [] }] };
    expect(planAssemblies(doc)).toEqual([]);
    expect(planAssemblies(createDocument('Flat'))).toEqual([]);
  });

  it('skips an assembly that only repeats the drawing above it (fu 264)', () => {
    // The whole piece wrapped in W (the root's only item): W's drawing would be the piece's again.
    const wrapped = { ...cabinetsDoc(), boards: [],
      instances: [{ id: 'W', name: 'Wrapper', definition: 'dwrap', position: [0, 0, 0] as [number, number, number], rotation: 0 as const }] };
    wrapped.definitions = [...wrapped.definitions,
      { id: 'dwrap', boards: [createBoard({ id: 'top', name: 'Top' })],
        instances: [{ id: 'c1', name: 'Cabinet', definition: 'dc', position: [0, 0, 0], rotation: 0 },
                    { id: 'c2', name: 'Cabinet (1)', definition: 'dc', position: [30, 0, 0], rotation: 0 }] }];
    // dwrap is the root's sole child → skipped. dc is placed twice beside dwrap's `top` → kept. dd is not a
    // sole child either (dc also holds `side`) → kept. Titles keep the wrapper's name.
    expect(planAssemblies(wrapped).map((a) => [a.definition, a.title, a.copies])).toEqual([
      ['dc', 'Wrapper › Cabinet', 2],
      ['dd', 'Wrapper › Cabinet › Drawer', 2],
    ]);
  });

  it('skips a nested one-child chain but keeps a definition that is a sole child only somewhere', () => {
    // dx holds only an instance of dd; dd is ALSO placed at the root beside other items.
    const doc: SloydDocument = { ...createDocument('Chain'), boards: [createBoard({ id: 'r', name: 'Top' })],
      instances: [{ id: 'X', name: 'Box', definition: 'dx', position: [0, 0, 0], rotation: 0 },
                  { id: 'L', name: 'Loose', definition: 'dd', position: [9, 0, 0], rotation: 0 }],
      definitions: [{ id: 'dx', boards: [], instances: [{ id: 'D', name: 'Drawer', definition: 'dd', position: [0, 0, 0], rotation: 0 }] },
                    { id: 'dd', boards: [createBoard({ id: 'front', name: 'Front' })], instances: [] }] };
    // dx: one placement, not a sole child (root has r, X, L) → kept. dd: X/D is a sole child, L is not → kept.
    expect(planAssemblies(doc).map((a) => a.definition)).toEqual(['dx', 'dd']);
    // Now drop the loose copy: dd's only placement is dx's sole child → skipped; dx still kept.
    const only = { ...doc, instances: doc.instances.filter((i) => i.id !== 'L') };
    expect(planAssemblies(only).map((a) => a.definition)).toEqual(['dx']);
  });
});

describe('keyed parts (feature callouts spec §2.1)', () => {
  it('each part is keyed by its innermost LISTED assembly; the piece trio keys only loose parts', () => {
    const doc = cabinetsDoc();
    const as = planAssemblies(doc);
    expect([...pieceKeyed(doc, as)]).toEqual(['r']);
    const by = new Map(as.map((a) => [a.definition, [...a.keyed]]));
    expect(by.get('dc')).toEqual(['side']);    // dr/front belongs to dd, listed and deeper
    expect(by.get('dd')).toEqual(['front']);
    expect(by.get('ds')).toEqual(['only']);
  });
  it('every world part is keyed exactly once across the sheet (an assembly placed 3 times keys once)', () => {
    const doc = cabinetsDoc();
    const as = planAssemblies(doc);
    const owners = worldParts(doc).map((p) => p.id.split('/').at(-1)!);
    const keyedIds = [...pieceKeyed(doc, as), ...as.flatMap((a) => [...a.keyed])];
    expect(new Set(keyedIds)).toEqual(new Set(owners));
    expect(keyedIds).toHaveLength(new Set(keyedIds).size);
  });
  it('a sole-child wrapper is not listed, so its parts are keyed by the trio above', () => {
    const doc: SloydDocument = {
      ...createDocument('W'),
      instances: [{ id: 'w', name: 'Wrap', definition: 'dw', position: [0, 0, 0], rotation: 0 }],
      definitions: [{ id: 'dw', boards: [createBoard({ id: 'b', name: 'B' })], instances: [] }],
    };
    const as = planAssemblies(doc);
    expect(as).toEqual([]);
    expect([...pieceKeyed(doc, as)]).toEqual(['w/b']);
  });
});
