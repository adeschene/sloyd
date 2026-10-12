import { cabinetsDoc } from './treeFixtures';
import { createDocument } from './document';
import { planAssemblies } from './plans';

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
});
