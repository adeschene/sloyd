import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, migrateDocument } from './document';
import type { Board } from './types';
import { applyBoxJoints, boxJointPlan, fingerSets } from './boxJoints';
import { keepsExactly, keptNote, keptParts } from './leanKeep';

/** A drawer, butt corners jointed at 1/2" (as `boxJoints.test.ts` builds it). */
const drawerBoards = (): Board[] => {
  const fb = (id: string, name: string, z: number) => createBoard({ id, name, posture: 'on-edge', rotation: 0, length: 12, width: 4, thickness: 0.5, position: [0.5, 0, z] });
  const side = (id: string, name: string, x: number) => createBoard({ id, name, posture: 'on-edge', rotation: 90, length: 17, width: 4, thickness: 0.5, position: [x, 0, 0] });
  const doc = { ...createDocument('Drawer'), boards: [fb('f', 'Front', 0), fb('b', 'Back', 16.5), side('l', 'Side left', 0), side('r', 'Side right', 12.5)] };
  const plan = boxJointPlan(doc, ['f', 'b', 'l', 'r'], { width: 0.5, swap: false });
  if (typeof plan === 'string') throw new Error(plan);
  return applyBoxJoints(doc, plan).boards as Board[];
};
const HEADER_TAIL = ', which the design format cannot describe, so they are not in the design above. Sloyd keeps each exactly where it is; the bounds are world inches:';

describe('Refine keeps box-jointed parts (box-joints spec §7)', () => {
  it('keepsExactly reads a recognised finger set; a broken one (a notch removed) keeps nothing', () => {
    const [front] = drawerBoards();
    expect(fingerSets(front!)).toHaveLength(2);
    expect(keepsExactly(front!)).toBe(true);
    const set = fingerSets(front!)[0]!;
    const broken = { ...front!, cuts: front!.cuts.filter((c) => c.id !== set.cutIds[1] && !fingerSets(front!)[1]!.cutIds.includes(c.id)) };
    expect(fingerSets(broken)).toEqual([]);
    expect(keepsExactly(broken)).toBe(false);
  });

  it('the note: `has box joints`, and box joints in the header only when a box-jointed part is kept', () => {
    const doc = migrateDocument({ ...createDocument('Drawer'), boards: drawerBoards() });
    expect(keptParts(doc).names).toEqual(['Front', 'Back', 'Side left', 'Side right']);
    const lines = keptNote(doc)!.split('\n');
    expect(lines[0]).toBe(`These parts lean, have angled holes or have box joints${HEADER_TAIL}`);
    expect(lines.slice(1, 5)).toEqual([
      '"Front" has box joints and is kept as is: x 0 to 13, y 0 to 4, z 0 to 0.5.',
      '"Back" has box joints and is kept as is: x 0 to 13, y 0 to 4, z 16.5 to 17.',
      '"Side left" has box joints and is kept as is: x 0 to 0.5, y 0 to 4, z 0 to 17.',
      '"Side right" has box joints and is kept as is: x 12.5 to 13, y 0 to 4, z 0 to 17.',
    ]);
  });

  it('with a round tenon kept too, the header names both, tenons first', () => {
    const rung = { ...createBoard({ id: 'g', name: 'Rung', length: 18, width: 1.5, thickness: 1.25, posture: 'flat', position: [30, 0, 0] }), tenons: [{ id: 't1', end: 'max' as const, diameter: 0.75, length: 1 }] };
    const doc = migrateDocument({ ...createDocument('Drawer'), boards: [...drawerBoards(), rung] });
    const note = keptNote(doc)!;
    expect(note.split('\n')[0]).toBe(`These parts lean, have angled holes, have round tenons or have box joints${HEADER_TAIL}`);
    expect(note).toContain('"Rung" has round tenons and is kept as is:');
  });
});
