import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { createDocument, worldParts } from '../document/document';
import { mirrorDim, mirrorFeatures } from '../document/frames';
import { mirrorHoleRow } from '../document/holes';
import { sharedOf } from '../document/links';
import { chiralAll } from '../document/sweepFixtures';
import type { Board, HoleRow, Shape, ShapedBoard, SloydDocument } from '../document/document';

/**
 * Mirrored links, Task 2 (fu 432, spec §4), through the store's Properties path (`updateBoard` / `updateBoards`) and a
 * feature action. Before Task 2, any Properties edit on a mirrored user wrote its MIRRORED world cuts into the Shape.
 */
const doc = (): SloydDocument => ({
  ...createDocument('Mirrored links'),
  shapes: [{ id: 's1', ...sharedOf(chiralAll('flat')) }],
  boards: [
    { id: 'a', name: 'Left', position: [0, 0, 0], rotation: 0, shape: 's1' } satisfies ShapedBoard,
    { id: 'b', name: 'Right', position: [40, 0, 0], rotation: 0, shape: 's1', mirrored: true } satisfies ShapedBoard,
  ],
});
const s = () => useStore.getState();
const shape = (): Shape => s().doc.shapes.find((x) => x.id === 's1')!;
const occ = (id: string): Board => worldParts(s().doc).find((b) => b.id === id)!;
const FEATURE_KEYS = ['cuts', 'angleCuts', 'holes', 'curves', 'profiles', 'bands'] as const;
beforeEach(() => { s().replaceDocument(doc()); s().setTool('select'); });

describe('the store writes a mirrored user\'s edits in the Shape\'s hand (spec §4)', () => {
  it('a rename (updateBoard, Properties) on the mirrored user leaves every Shape feature array the SAME object', () => {
    const before = shape();
    s().updateBoard('b', { name: 'Right side' });
    expect(occ('b').name).toBe('Right side');
    for (const k of FEATURE_KEYS) expect(shape()[k], k).toBe(before[k]);
    expect(shape()).toBe(before);                                                // no shared field written at all
  });

  it('a resize (updateBoard) on the mirrored user writes the length and keeps the Shape\'s features', () => {
    const before = shape();
    s().updateBoard('b', { length: before.length + 2 });
    expect(shape().length).toBe(before.length + 2);
    // By value: a shared patch also reaches the unmirrored mate `a`, whose lowering re-writes EQUAL copies of the Shape's
    // arrays (pre-existing for every shaped part: worldParts and lowerEdit resolve separate copies). The values are the
    // Shape's own hand, never the mirrored world features (chiralAll: a mirrored write would differ).
    for (const k of FEATURE_KEYS) expect(shape()[k], k).toEqual(before[k]);
  });

  it('a resize on the UNMIRRORED user patches the mirrored one as a shape mate without throwing; it shows the Shape mirrored', () => {
    const before = shape();
    expect(() => s().updateBoards(['a'], { length: before.length + 2 })).not.toThrow();
    for (const k of FEATURE_KEYS) expect(shape()[k], k).toEqual(before[k]);            // by value, as above
    const b = occ('b');
    const m = mirrorFeatures(occ('a'));
    for (const k of FEATURE_KEYS) expect(b[k], k).toEqual(m[k]);
  });

  it('a hole row edited on the mirrored user (updateHoleRow) is stored reflected; both users show it in their own hand', () => {
    const h2 = shape().holes.find((r) => r.id === 'h2')!;
    const row = occ('b').holes.find((r) => r.id === 'h1')!;
    const next: Omit<HoleRow, 'id'> = { ...row, station: row.station + 1 };
    s().updateHoleRow('b', 'h1', next);
    const d = mirrorDim(occ('a'));
    expect(shape().holes.find((r) => r.id === 'h1')).toEqual(mirrorHoleRow({ ...next, id: 'h1' }, d));
    expect(occ('b').holes.find((r) => r.id === 'h1')).toEqual({ ...next, id: 'h1' });
    expect(shape().holes.find((r) => r.id === 'h2')).toBe(h2);                // the untouched row is the stored object
  });

  it('a d0-moving posture change on a Shape with users on both sides is refused: nothing written', () => {
    const d0 = s().doc;
    s().updateBoards(['a'], { posture: 'upright' });
    expect(s().doc).toBe(d0);
  });
});
