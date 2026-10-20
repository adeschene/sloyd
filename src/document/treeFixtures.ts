import { createBoard, createDocument } from './document';
import type { Definition, Instance, SloydDocument } from './types';
import { chiralPart } from './turnFixtures';

/**
 * TEST-ONLY (assemblies plan). A root part, a drawer turned 90° and moved off
 * the grid, holding a chiral side, a millimetre front and a nested peg turned
 * 270°. Decimal and millimetre values everywhere, so a round trip through
 * world space shows up in a bit-exact assertion. Occurrences: r1, i1/b1,
 * i1/b2, i1/i2/b3. Instance paths: i1, i1/i2.
 */
export function assemblyDoc(): SloydDocument {
  const b3 = createBoard({ id: 'b3', name: 'Pin', length: 3.7, width: 1.3, thickness: 0.6, position: [0.35, 0.1, 0.2], rotation: 90 });
  const d2: Definition = { id: 'd2', boards: [b3], instances: [], hardware: [] };
  const b1 = { ...chiralPart('flat'), id: 'b1', name: 'Side', position: [0.1, 0.2, 0.3] as [number, number, number], rotation: 180 as const };
  const b2 = createBoard({ id: 'b2', name: 'Front', length: 300 / 25.4, width: 4.1, thickness: 0.7, position: [1.1, 0, 2.7], posture: 'on-edge' });
  const i2: Instance = { id: 'i2', name: 'Peg', definition: 'd2', position: [0.7, 1.1, 2.3], rotation: 270 };
  const d1: Definition = { id: 'd1', boards: [b1, b2], instances: [i2], hardware: [] };
  const r1 = createBoard({ id: 'r1', name: 'Top', position: [-5.3, 0, 0.1] });
  const i1: Instance = { id: 'i1', name: 'Drawer', definition: 'd1', position: [10.1, 0.3, 3.3], rotation: 90 };
  return { ...createDocument('Fixture'), boards: [r1], instances: [i1], definitions: [d1, d2] };
}

/**
 * TEST-ONLY (fu 231). Three placements of a cabinet definition, each holding a
 * drawer instance, plus the drawer's definition placed on its own at the root
 * and an unshared assembly. A nested instance counts once per placement of its
 * parent, so the drawer is shared four ways and the cabinet three. Occurrences:
 * r, c{1,2,3}/side, c{1,2,3}/dr/front, x/front, solo/only.
 */
export const cabinetsDoc = (): SloydDocument => ({
  ...createDocument('Cabinets'),
  boards: [createBoard({ id: 'r', name: 'Top' })],
  instances: [
    { id: 'c1', name: 'Cabinet', definition: 'dc', position: [0, 0, 0], rotation: 0 },
    { id: 'c2', name: 'Cabinet (1)', definition: 'dc', position: [30, 0, 0], rotation: 0 },
    { id: 'c3', name: 'Cabinet (2)', definition: 'dc', position: [60, 0, 0], rotation: 0 },
    { id: 'x', name: 'Loose drawer', definition: 'dd', position: [90, 0, 0], rotation: 0 },
    { id: 'solo', name: 'Solo', definition: 'ds', position: [120, 0, 0], rotation: 0 },
  ],
  definitions: [
    { id: 'dc', boards: [createBoard({ id: 'side', name: 'Side' })],
      instances: [{ id: 'dr', name: 'Drawer', definition: 'dd', position: [1, 0, 1], rotation: 0 }], hardware: [] },
    { id: 'dd', boards: [createBoard({ id: 'front', name: 'Front' })], instances: [], hardware: [] },
    { id: 'ds', boards: [createBoard({ id: 'only', name: 'Only' })], instances: [], hardware: [] },
  ],
});
