import { describe, expect, it } from 'vitest';
import { writeBackFlat } from './treeEdit';
import { createBoard, createDocument, flatDocument } from './document';
import { sharedOf } from './links';
import { linkByRole } from './roleLinks';
import type { Dovetail, SloydDocument } from './types';

/** Dovetails Task 2: the joinery write-back regroups a Shape's users by `groupSignature`, dovetails by DOVETAIL_FIELDS,
 *  ids and order ignored (as tenons, treeEdit.test.ts). */
describe('writeBackFlat regroups by dovetails (groupSignature)', () => {
  const T: Dovetail = { id: 'x', dim: 'length', end: 'max', role: 'tails', count: 4, slope: 8, pin: 0.25, depth: 0.75 };
  const P: Dovetail = { id: 'y', dim: 'length', end: 'min', role: 'pins', count: 4, slope: 8, pin: 0.25, depth: 0.75, outside: 'min' };
  const fields = sharedOf(createBoard({ name: 'Side', length: 20, width: 6, thickness: 0.75 }));

  it('users whose dovetails differ only in ids stay one Shape (the founder\'s ids); a differing dovetail splits; no key when none', () => {
    const doc: SloydDocument = { ...createDocument(), shapes: [{ id: 's1', ...fields }],
      boards: [0, 1, 2, 3].map((k) => ({ id: `l${k}`, name: `Side ${k}`, position: [k * 30, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })) };
    const before = flatDocument(doc).boards;
    const sets: Dovetail[][] = [[{ ...P, id: 'a' }, { ...T, id: 'b' }], [{ ...P, id: 'c' }, { ...T, id: 'd' }], [{ ...P, id: 'e' }, { ...T, id: 'f', count: 3 }], []];
    const out = writeBackFlat(doc, before, before.map((b, k) => ({ ...b, dovetails: sets[k]! })));
    expect(out.shapes).toHaveLength(3);
    const shapeOf = (id: string) => (out.boards.find((b) => b.id === id) as { shape: string }).shape;
    expect(shapeOf('l0')).toBe(shapeOf('l1'));
    expect(shapeOf('l2')).not.toBe(shapeOf('l0'));
    expect(out.shapes.find((s) => s.id === shapeOf('l0'))!.dovetails).toEqual([{ ...P, id: 'a' }, { ...T, id: 'b' }]);
    expect('dovetails' in out.shapes.find((s) => s.id === shapeOf('l3'))!).toBe(false);
  });
});

describe('linkByRole: dovetails (alignedTo adopts the founder\'s ids)', () => {
  const T: Dovetail = { id: 'x', dim: 'length', end: 'max', role: 'tails', count: 4, slope: 8, pin: 0.25, depth: 0.75 };
  const side = (id: string, dovetails: Dovetail[], z: number) =>
    ({ ...createBoard({ name: `Side ${id}`, length: 20, width: 6, thickness: 0.75, position: [0, 0, z], dovetails }), id });
  it('equal dovetails under different ids link, stored ONCE with the first\'s ids; a differing one does not link', () => {
    const doc: SloydDocument = { ...createDocument('T'), boards: [side('a', [T], 0), side('b', [{ ...T, id: 'y' }], 10)] };
    const out = linkByRole(doc, new Map([['a', 'side'], ['b', 'side']]));
    expect(out.shapes).toHaveLength(1);
    expect(out.shapes[0]!.dovetails).toEqual([T]);
    expect(out.boards.map((x) => 'dovetails' in x)).toEqual([false, false]);
    const apart: SloydDocument = { ...createDocument('T'), boards: [side('a', [T], 0), side('b', [{ ...T, id: 'y', count: 3 }], 10)] };
    expect(linkByRole(apart, new Map([['a', 'side'], ['b', 'side']])).shapes).toHaveLength(0);
  });
});
