import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, flatDocument, migrateDocument } from '../../document/document';
import type { Board, SloydDocument } from '../../document/document';
import { applyBoxJoints, boxJointPlan, fingerSets } from '../../document/boxJoints';
import { changedBoxJointed, claimFingerSets, firstBrokenSet, restoreFingerSets } from './fingerClaim';

/** A drawer, butt corners jointed at 1/2" (as `boxJoints.test.ts` builds it), plus a plain shelf. */
const drawerDoc = (): SloydDocument => {
  const fb = (id: string, name: string, z: number) => createBoard({ id, name, posture: 'on-edge', rotation: 0, length: 12, width: 4, thickness: 0.5, position: [0.5, 0, z] });
  const side = (id: string, name: string, x: number) => createBoard({ id, name, posture: 'on-edge', rotation: 90, length: 17, width: 4, thickness: 0.5, position: [x, 0, 0] });
  const doc = { ...createDocument('Drawer'), boards: [fb('f', 'Front', 0), fb('b', 'Back', 16.5), side('l', 'Side left', 0), side('r', 'Side right', 12.5)] };
  const plan = boxJointPlan(doc, ['f', 'b', 'l', 'r'], { width: 0.5, swap: false });
  if (typeof plan === 'string') throw new Error(plan);
  const j = applyBoxJoints(doc, plan);
  return migrateDocument({ ...j, boards: [...j.boards, createBoard({ id: 's', name: 'Shelf', length: 20, width: 10, thickness: 0.75, posture: 'flat', position: [30, 0, 0] })] });
};
const NAMES = ['Front', 'Back', 'Side left', 'Side right'];
const edit = (doc: SloydDocument, name: string, f: (b: Board) => Board): SloydDocument =>
  ({ ...doc, boards: doc.boards.map((b) => (b.name === name ? f(b as Board) : b)) });

describe('claimFingerSets / restoreFingerSets (box-joints spec §7)', () => {
  it('takes every set\'s cuts off (the same objects), leaves a part with none as it is, and puts them back', () => {
    const flat = flatDocument(drawerDoc());
    const { flat: claimedFlat, claimed } = claimFingerSets(flat);
    expect([...claimed.keys()]).toEqual([0, 1, 2, 3]);
    expect(claimedFlat.boards.every((b) => b.cuts.length === 0)).toBe(true);
    expect(claimedFlat.boards[4]).toBe(flat.boards[4]);
    claimed.forEach((cuts, i) => cuts.forEach((c) => expect(flat.boards[i]!.cuts).toContain(c)));
    const back = restoreFingerSets(claimedFlat.boards, claimed);
    back.forEach((b, i) => expect(fingerSets(b)).toEqual(fingerSets(flat.boards[i]!)));
    expect(firstBrokenSet(flat.boards, back, claimed)).toBeNull();
    // A part resized along its fingers: the restored cuts are no longer its set.
    const shorter = back.map((b, i) => (i === 2 ? { ...b, width: 3.5 } : b));
    expect(firstBrokenSet(flat.boards, shorter, claimed)).toBe('Side left');
  });

  it('a flat with no set comes back as the same object', () => {
    const flat = flatDocument(migrateDocument({ ...createDocument('T'), boards: [createBoard({ name: 'A' })] }));
    expect(claimFingerSets(flat)).toEqual({ flat, claimed: new Map() });
    expect(claimFingerSets(flat).flat).toBe(flat);
  });
});

describe('changedBoxJointed: the joined Refine\'s guard (box-joints spec §7)', () => {
  const doc = drawerDoc();
  it('null when every kept part is exactly as it was', () => {
    expect(changedBoxJointed(doc, structuredClone(doc), NAMES)).toBeNull();
  });
  it.each([
    ['a finger set', (b: Board) => ({ ...b, cuts: b.cuts.slice(1) })],
    ['its size', (b: Board) => ({ ...b, width: b.width + 0.25 })],
    ['its position', (b: Board) => ({ ...b, position: [b.position[0], b.position[1] + 0.25, b.position[2]] as [number, number, number] })],
    ['a new pocket', (b: Board) => ({ ...b, cuts: [...b.cuts, { id: 'p', face: 'thickness' as const, from: 'min' as const, across: 'width' as const, offset: 8, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 }] })],
  ])('names the part when %s changed', (_, f) => {
    expect(changedBoxJointed(doc, edit(doc, 'Side left', f), NAMES)).toBe('Side left');
  });
  it('names a kept part that is gone; ignores a part not named', () => {
    expect(changedBoxJointed(doc, { ...doc, boards: doc.boards.filter((b) => b.name !== 'Back') }, NAMES)).toBe('Back');
    expect(changedBoxJointed(doc, edit(doc, 'Shelf', (b) => ({ ...b, width: 1 })), NAMES)).toBeNull();
  });
});
