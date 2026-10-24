import { cabinetsDoc } from './treeFixtures';
import { createBoard, createDocument } from './document';
import { pieceKeyed, planAssemblies } from './plans';
import { worldParts } from './tree';
import type { Board, SloydDocument } from './types';
import { chooseFace, slopeOf, worldSlopes } from './lean';
import { leanNote, leanNotes } from './featureKeys';

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
      definitions: [{ id: 'de', boards: [], instances: [], hardware: [] }] };
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
                    { id: 'c2', name: 'Cabinet (1)', definition: 'dc', position: [30, 0, 0], rotation: 0 }], hardware: [] }];
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
      definitions: [{ id: 'dx', boards: [], instances: [{ id: 'D', name: 'Drawer', definition: 'dd', position: [0, 0, 0], rotation: 0 }], hardware: [] },
                    { id: 'dd', boards: [createBoard({ id: 'front', name: 'Front' })], instances: [], hardware: [] }] };
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
  // Fu 381(4), the user's ruling 2026-10-16 ("no we don't need to label duplicate assemblies (too busy on the plans
  // sheet)"): a never-listed definition sitting under two listed assemblies is keyed once, by the first trio on the sheet.
  it('a stored part drawn in two trios is keyed only in the first', () => {
    const at = (x: number): [number, number, number] => [x, 0, 0];
    const doc: SloydDocument = {
      ...createDocument('Shared'),
      boards: [createBoard({ id: 'r', name: 'Rail' })],
      instances: [
        { id: 'a', name: 'Left', definition: 'dA', position: at(0), rotation: 0 },
        { id: 'b', name: 'Right', definition: 'dB', position: at(40), rotation: 0 },
      ],
      definitions: [
        { id: 'dA', boards: [], instances: [{ id: 'u', name: 'Hinge', definition: 'dU', position: at(0), rotation: 0 }], hardware: [] },
        { id: 'dB', boards: [], instances: [{ id: 'u', name: 'Hinge', definition: 'dU', position: at(5), rotation: 0 }], hardware: [] },
        { id: 'dU', boards: [createBoard({ id: 'cup', name: 'Cup' })], instances: [], hardware: [] },
      ],
    };
    const as = planAssemblies(doc);
    expect(as.map((a) => a.definition)).toEqual(['dA', 'dB']);
    expect(as.map((a) => [...a.keyed])).toEqual([['u/cup'], []]);
    expect([...pieceKeyed(doc, as)]).toEqual(['r']);
  });

  it('a sole-child wrapper is not listed, so its parts are keyed by the trio above', () => {
    const doc: SloydDocument = {
      ...createDocument('W'),
      instances: [{ id: 'w', name: 'Wrap', definition: 'dw', position: [0, 0, 0], rotation: 0 }],
      definitions: [{ id: 'dw', boards: [createBoard({ id: 'b', name: 'B' })], instances: [], hardware: [] }],
    };
    const as = planAssemblies(doc);
    expect(as).toEqual([]);
    expect([...pieceKeyed(doc, as)]).toEqual(['w/b']);
  });
});

describe('the plans lean note (splayed legs spec §6.2)', () => {
  const T8 = slopeOf(8);
  const T12 = slopeOf(12);
  const leg = (id: string, name: string, x: number, z: number, over: Partial<Board> = {}) => {
    const b = createBoard({ id, name, length: 16, width: 1.5, thickness: 1.25, posture: 'upright', ...over });
    return { ...b, lean: { x, z, face: chooseFace(b, x, z) } };
  };

  it('reads verbatim: rake 8 toward the front, splay 12 toward the right', () => {
    expect(leanNote(leg('L', 'Leg', T12, T8))).toBe('Leg: rake 8.0° toward the front, splay 12.0° toward the right — resultant 14.3° on a 33.5° sightline');
  });

  it('names the back and the left, and a 0 component carries no direction words', () => {
    expect(leanNote(leg('L', 'Leg', -T12, -T8))).toBe('Leg: rake 8.0° toward the back, splay 12.0° toward the left — resultant 14.3° on a 33.5° sightline');
    expect(leanNote(leg('L', 'Leg', T12, 0))).toBe('Leg: rake 0.0°, splay 12.0° toward the right — resultant 12.0° on a 0.0° sightline');
    expect(leanNote(leg('L', 'Leg', 0, -T8))).toBe('Leg: rake 8.0° toward the back, splay 0.0° — resultant 8.0° on a 90.0° sightline');
  });

  it('reads the slopes as drawn: a part turned a quarter reports its WORLD rake and splay', () => {
    // Stored turn-0 slopes (x 12°, z 8°) turned 90° as `worldSlopes` turns them (inv 44): (x, z) → (z, −x).
    const b = leg('L', 'Leg', T12, T8, { rotation: 90 });
    expect(worldSlopes(b)).toEqual([T8, -T12]);
    expect(leanNote(b)).toBe('Leg: rake 12.0° toward the back, splay 8.0° toward the right — resultant 14.3° on a 56.5° sightline');
  });

  it('a part that does not lean has no note', () => {
    expect(leanNote(createBoard({ id: 'S', name: 'Seat' }))).toBeNull();
  });

  it('appears once per part per sheet, keyed like the feature callouts (an assembly placed 3 times notes its leg once)', () => {
    const def = { id: 'ds', boards: [leg('leg', 'Leg', T12, T8), createBoard({ id: 'seat', name: 'Seat', position: [0, 16, 0] })], instances: [], hardware: [] };
    const doc: SloydDocument = {
      ...createDocument('Stools'),
      boards: [leg('L0', 'Prop', -T12, T8, { position: [40, 0, 0] })],
      instances: [0, 1, 2].map((k) => ({ id: `s${k}`, name: `Stool${k ? ` (${k})` : ''}`, definition: 'ds', position: [k * 20, 0, 0] as [number, number, number], rotation: 0 as const })),
      definitions: [def],
    };
    const assemblies = planAssemblies(doc);
    const sheet = [
      ...leanNotes(worldParts(doc), pieceKeyed(doc, assemblies)),
      ...assemblies.flatMap((a) => leanNotes(a.parts, a.keyed)),
    ];
    expect(sheet).toEqual([
      'Prop: rake 8.0° toward the front, splay 12.0° toward the left — resultant 14.3° on a 33.5° sightline',
      'Leg: rake 8.0° toward the front, splay 12.0° toward the right — resultant 14.3° on a 33.5° sightline',
    ]);
    // Unkeyed, every placement would be noted: the piece trio draws all three stools' legs.
    expect(leanNotes(worldParts(doc), new Set(worldParts(doc).map((b) => b.id)))).toHaveLength(4);
  });
});
