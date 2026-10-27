import { describe, expect, it } from 'vitest';
import { writeBackParts } from './treeEdit';
import { createBoard, createDocument } from './document';
import { worldParts } from './tree';
import { SHARED_KEYS, sharedOf } from './links';
import { resolveBoard } from './shapes';
import type { Board, Cut, Rotation, Shape, ShapedBoard, SloydDocument } from './types';

/**
 * `writeBackParts` (box-joints plan, Spec difference 3 revised): each world part's FULL after-state written back with
 * `keepWorld`, one edit per storage key, Shape users regrouped. The three cases measured as failures of `mapWorld` in
 * Task 3's STOP must now land exactly.
 */
const NOTCH: Cut = { id: 'n1', face: 'length', from: 'min', across: 'thickness', offset: 0, width: 1, depth: 0.5, stopMin: 0, stopMax: 0 };
const base = createBoard({ name: 'x', length: 12, width: 4, thickness: 0.5, position: [0, 0, 0] });
const shape: Shape = { id: 's1', ...sharedOf(base) };
const grown: Shape = { ...shape, length: 13, cuts: [NOTCH] };
const user = (id: string, x: number, rotation: Rotation = 0, mirrored = false): ShapedBoard =>
  ({ id, name: id, position: [x, 0, 0], rotation, shape: 's1', ...(mirrored ? { mirrored: true as const } : {}) });

/** A world part's after-state: its own world record (`position` replaced), every shared field read from `next`
 *  through the user's own flag — what the planner builds. */
const afterOf = (doc: SloydDocument, w: Board, next: Shape, position: [number, number, number]): Board => {
  const stored = [...doc.boards, ...doc.definitions.flatMap((d) => d.boards)].find((b) => b.id === w.id.split('/').pop())!;
  const r = resolveBoard(new Map([[next.id, next]]), stored)!;
  const out: Record<string, unknown> = { ...w, position };
  for (const k of SHARED_KEYS) out[k] = (r as unknown as Record<string, unknown>)[k];
  return out as unknown as Board;
};
const minus1 = (p: readonly number[], axis: number): [number, number, number] =>
  p.map((v, i) => (i === axis ? v - 1 : v)) as [number, number, number];

describe('writeBackParts (box-joints Spec difference 3, revised)', () => {
  it('two UNMIRRORED users of one Shape, both grown: no disagreeing edits, one Shape, each where planned', () => {
    const doc: SloydDocument = { ...createDocument('p'), shapes: [shape], boards: [user('a', 0), user('b', 20, 180)] };
    const w = worldParts(doc);
    const edits = w.map((b) => ({ before: b, after: afterOf(doc, b, grown, minus1(b.position, 0)) }));
    const out = writeBackParts(doc, edits);
    const after = worldParts(out);
    expect(after.map((b) => b.position)).toEqual(edits.map((e) => e.after.position));
    expect(after.every((b) => b.length === 13)).toBe(true);
    expect(out.shapes).toHaveLength(1);
    expect(out.boards.every((b) => 'shape' in b && b.shape === out.shapes[0]!.id && !('length' in b))).toBe(true);
    expect(out.shapes[0]!.cuts).toEqual([NOTCH]);
  });

  it.each([0, 90, 180, 270] as Rotation[])('a MIRRORED mate in an assembly turned %i lands at its planned min corner', (rot) => {
    const doc: SloydDocument = {
      ...createDocument('p'), shapes: [shape], boards: [],
      instances: [{ id: 'i1', name: 'D', definition: 'd1', position: [100, 0, 100], rotation: rot }],
      definitions: [{ id: 'd1', boards: [user('a', 0), user('b', 0, 0, true)], instances: [], hardware: [] }],
    };
    const axis = rot === 90 || rot === 270 ? 2 : 0;
    const w = worldParts(doc);
    const edits = w.map((b) => ({ before: b, after: afterOf(doc, b, grown, minus1(b.position, axis)) }));
    const out = writeBackParts(doc, edits);
    const after = worldParts(out);
    expect(after.map((b) => b.position)).toEqual(edits.map((e) => e.after.position));
    expect(after.map((b) => b.cuts)).toEqual(edits.map((e) => e.after.cuts));
    expect(out.shapes).toHaveLength(1);
    expect(out.definitions[0]!.boards.map((b) => (b as ShapedBoard).shape)).toEqual([out.shapes[0]!.id, out.shapes[0]!.id]);
    expect((out.definitions[0]!.boards[1] as ShapedBoard).mirrored).toBe(true);
  });

  it.each([0, 90, 180, 270] as Rotation[])('a plain part grown at its world-MAX end in an assembly turned %i keeps its min corner', (rot) => {
    const doc: SloydDocument = {
      ...createDocument('p'), boards: [],
      instances: [{ id: 'i1', name: 'D', definition: 'd1', position: [100, 0, 100], rotation: rot }],
      definitions: [{ id: 'd1', boards: [{ ...base, id: 'a' }], instances: [], hardware: [] }],
    };
    const w = worldParts(doc)[0]!;
    const out = writeBackParts(doc, [{ before: w, after: { ...w, length: 13 } }]);
    expect(worldParts(out)[0]!.position).toEqual(w.position);
    expect(worldParts(out)[0]!.length).toBe(13);
  });

  it('users given DIFFERENT shared fields are split into two Shapes, never a disagreeing-edits throw', () => {
    const doc: SloydDocument = { ...createDocument('p'), shapes: [shape], boards: [user('a', 0), user('b', 20)] };
    const [a, b] = worldParts(doc);
    const out = writeBackParts(doc, [
      { before: a!, after: afterOf(doc, a!, grown, minus1(a!.position, 0)) },
      { before: b!, after: { ...b!, position: minus1(b!.position, 0) } },   // a mate left with its old shared fields
    ]);
    expect(out.shapes).toHaveLength(2);
    expect(worldParts(out).map((p) => p.length)).toEqual([13, 12]);
  });

  it('one edit per storage key: a second placement of the definition follows the first', () => {
    const doc: SloydDocument = {
      ...createDocument('p'), boards: [],
      instances: [
        { id: 'i1', name: 'D', definition: 'd1', position: [0, 0, 0], rotation: 0 },
        { id: 'i2', name: 'E', definition: 'd1', position: [50, 0, 0], rotation: 0 },
      ],
      definitions: [{ id: 'd1', boards: [{ ...base, id: 'a' }], instances: [], hardware: [] }],
    };
    const [w1, w2] = worldParts(doc);
    // The second edit (a different, disagreeing after for the same stored part) is ignored: the first given wins.
    const out = writeBackParts(doc, [
      { before: w1!, after: { ...w1!, length: 13 } },
      { before: w2!, after: { ...w2!, length: 14 } },
    ]);
    expect(worldParts(out).map((b) => b.length)).toEqual([13, 13]);
    expect(out.definitions).toHaveLength(1);
  });
});
