import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, migrateDocument } from './document';
import type { Board, SloydDocument, StoredBoard } from './types';
import { applyBoxJoints, boxJointPlan } from './boxJoints';
import { applyDovetails, dovetailPlan } from './dovetails';
import { assemblyKind, definitionKind, keptAssemblyLinkRefusal, keptNote } from './leanKeep';
import { linksToShapes } from './linksToShapes';

/** A butt drawer (box joints' fixture), `dx` along X, its parts' names prefixed by `p`. */
const drawer = (p: string, dx: number) => {
  const fb = (id: string, name: string, z: number) => createBoard({ id, name, posture: 'on-edge', rotation: 0, length: 12, width: 4, thickness: 0.5, position: [dx + 0.5, 0, z] });
  const side = (id: string, name: string, x: number) => createBoard({ id, name, posture: 'on-edge', rotation: 90, length: 17, width: 4, thickness: 0.5, position: [dx + x, 0, 0] });
  return { ...createDocument('Drawer'), boards: [fb(`${p}f`, `${p}Front`, 0), fb(`${p}b`, `${p}Back`, 16.5), side(`${p}l`, `${p}Side left`, 0), side(`${p}r`, `${p}Side right`, 12.5)] };
};
const ids = (p: string) => ['f', 'b', 'l', 'r'].map((x) => `${p}${x}`);
const boxJointed = (p: string, dx: number): Board[] => {
  const doc = drawer(p, dx);
  const plan = boxJointPlan(doc, ids(p), { width: 0.5, swap: false });
  if (typeof plan === 'string') throw new Error(plan);
  return applyBoxJoints(doc, plan).boards as Board[];
};
const dovetailed = (p: string, dx: number): Board[] => {
  const doc = drawer(p, dx);
  const plan = dovetailPlan(doc, ids(p), { slope: 8, count: null, swap: false });
  if (typeof plan === 'string') throw new Error(plan);
  return applyDovetails(doc, plan).boards as Board[];
};
const bottom = () => createBoard({ id: 'bt', name: 'Bottom', length: 12, width: 16, thickness: 0.25, posture: 'flat', position: [0.5, 0.5, 0.5] });
const shelf = () => createBoard({ id: 'sh', name: 'Shelf', length: 12, width: 16, thickness: 0.25, posture: 'flat', position: [80, 0, 0] });
/** One definition holding `parts` and a plain bottom, placed twice; with `link`, the bottom linked to a root shelf. */
const chest = (parts: Board[], link = false): SloydDocument => {
  const bt = bottom();
  const sh = shelf();
  const raw: SloydDocument = { ...createDocument('Chest'), boards: link ? [sh] : [],
    definitions: [{ id: 'dd', boards: [...parts, bt], instances: [], hardware: [] }],
    instances: [{ id: 'i1', name: 'Drawer 1', definition: 'dd', position: [0, 0, 30], rotation: 0 }, { id: 'i2', name: 'Drawer 2', definition: 'dd', position: [60, 0, 30], rotation: 0 }] };
  return migrateDocument(link ? linksToShapes(raw, new Map<StoredBoard, string>([[bt, 'L'], [sh, 'L']])) : raw);
};
const HEADER_TAIL = ', which the design format cannot describe, so they are not in the design above. Sloyd keeps each exactly where it is; the bounds are world inches:';

describe('a kept assembly\'s corner-joint words (dovetails spec §7, both when both)', () => {
  it('definitionKind / assemblyKind: box joints, dovetails, or both', () => {
    for (const [parts, kind] of [[boxJointed('', 0), 'box joints'], [dovetailed('', 0), 'dovetails'],
      [[...boxJointed('', 0), ...dovetailed('D', 20)], 'box joints and dovetails']] as const) {
      const doc = chest([...parts]);
      expect(definitionKind(doc, doc.definitions[0]!)).toBe(kind);
      expect(assemblyKind(doc, doc.instances[0]!)).toBe(kind);
    }
  });

  it('keptNote: a dovetailed assembly says dovetails; a mixed one names both, in its line and the header', () => {
    const dv = keptNote(chest(dovetailed('', 0)))!.split('\n');
    expect(dv[0]).toBe(`These parts lean, have angled holes or have dovetails${HEADER_TAIL}`);
    expect(dv[1]).toMatch(/^"Drawer 1" is an assembly with dovetails and is kept as is: /);
    const mixed = keptNote(chest([...boxJointed('', 0), ...dovetailed('D', 20)]))!.split('\n');
    expect(mixed[0]).toBe(`These parts lean, have angled holes, have box joints or have dovetails${HEADER_TAIL}`);
    expect(mixed[1]).toMatch(/^"Drawer 1" is an assembly with box joints and dovetails and is kept as is: /);
    expect(mixed[2]).toMatch(/^"Drawer 2" is an assembly with box joints and dovetails and is kept as is: /);
  });
});

describe('keptAssemblyLinkRefusal names the linked assembly\'s kind (dovetails spec §7)', () => {
  it('box joints only: the sentence as before', () => {
    expect(keptAssemblyLinkRefusal(chest(boxJointed('', 0), true)))
      .toBe("Refine can't keep a box-jointed assembly whose parts are linked to parts outside it — Unlink first: Shelf.");
  });
  it('dovetails only', () => {
    expect(keptAssemblyLinkRefusal(chest(dovetailed('', 0), true)))
      .toBe("Refine can't keep an assembly with dovetails whose parts are linked to parts outside it — Unlink first: Shelf.");
  });
  it('both', () => {
    expect(keptAssemblyLinkRefusal(chest([...boxJointed('', 0), ...dovetailed('D', 20)], true)))
      .toBe("Refine can't keep an assembly with box joints and dovetails whose parts are linked to parts outside it — Unlink first: Shelf.");
  });
  it('unlinked: no refusal', () => {
    expect(keptAssemblyLinkRefusal(chest(dovetailed('', 0)))).toBeNull();
  });
});
