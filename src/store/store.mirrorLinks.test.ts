import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { LINK_ACROSS_MIRROR, boardsBounds, createBoard, createDocument, isShaped, linkPlan, mirroredAt, partAt, plainOf, storageKey, worldParts } from '../document/document';
import { inverseTurn, mirrorDim, mirrorFeatures } from '../document/frames';
import { holeInstances, mirrorHoleRow } from '../document/holes';
import { sharedOf } from '../document/links';
import { axisDimensions, toWorldOffset } from '../document/geometry';
import { worldHoles } from '../document/holeWorld';
import { worldBands } from '../document/bandWorld';
import { BUILT_IN_BAND_ID, withBands } from '../document/bandModel';
import type { Dir } from '../document/taperWorld';
import { chiralAll } from '../document/sweepFixtures';
import type { Board, Dimension, HoleRow, Rotation, Shape, ShapedBoard, SloydDocument } from '../document/document';

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

// ---------------------------------------------------------------------------------------------------------------------
// Task 3 (spec §5.2): the Mirrored checkbox's action, Link, Unlink and copies.
// ---------------------------------------------------------------------------------------------------------------------

/** An upright case side (length vertical, width front to back at 90°): a shelf-pin row off-centre on one broad face, and
 *  edging on one width edge. Chiral: the row is measured from one end and inset from one edge. */
const caseSide = (): Board => ({
  ...createBoard({ length: 30, width: 12, thickness: 0.75, posture: 'upright' }),
  holes: [{ id: 'h1', face: 'thickness', from: 'min', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 6, count: 4, pitch: 1.25, acrossFrom: 'max', inset: 2 }],
  bands: withBands([], [{ across: 'width', from: 'max' }], BUILT_IN_BAND_ID),
});
const sideDoc = (rotation: Rotation): SloydDocument => ({
  ...createDocument('Case'),
  shapes: [{ id: 's1', ...sharedOf(caseSide()) }],
  boards: [
    { id: 'l', name: 'Left', position: [0, 0, 0], rotation, shape: 's1' } satisfies ShapedBoard,
    { id: 'r', name: 'Right', position: [30, 0, 0], rotation, shape: 's1' } satisfies ShapedBoard,
  ],
});
const flipX = (d: Dir): Dir => (d === '+x' ? '-x' : d === '-x' ? '+x' : d);
/** Every hole centre of a world part, in world coordinates (inv 44's local→world rule). */
const holeCentres = (b: Board): number[][] => b.holes.flatMap((row) => holeInstances(b, row).map((h) => {
  const local: Record<Dimension, number> = { length: h.centre[0], width: h.centre[1], thickness: h.centre[2] };
  return axisDimensions(b).map((dim, i) => b.position[i]! + toWorldOffset(b, i, local[dim]));
}));
const sortPts = (ps: number[][]) => ps.map((p) => p.map((v) => v.toFixed(9)).join(',')).sort();

describe('mirrorLinkedPart: the Mirrored checkbox (spec §5.2, Review Focus 1)', () => {
  for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    it(`at ${rotation}°: the right side becomes its mirror image left to right, box unchanged; undo restores exactly`, () => {
      s().replaceDocument(sideDoc(rotation));
      const before = s().doc;
      const r0 = occ('r');
      const [lo, hi] = [boardsBounds([r0])!.min[0], boardsBounds([r0])!.max[0]];
      s().mirrorLinkedPart('r', true);
      const r1 = occ('r');
      expect(partAt(s().doc, 'r')).toEqual({ id: 'r', name: 'Right', position: [30, 0, 0], rotation: inverseTurn(rotation), shape: 's1', mirrored: true });
      expect(s().doc.shapes).toBe(before.shapes);                                       // the Shape is untouched
      expect(boardsBounds([r1])).toEqual(boardsBounds([r0]));                           // the box is unchanged
      // Every world direction reflects in X: the pin face (on X at 90°/270°) moves to the opposite X face; the edging
      // (on Z at 90°/270°) stays on its world face.
      expect(worldHoles(r1).map((h) => h.face)).toEqual(worldHoles(r0).map((h) => flipX(h.face)));
      expect(worldBands(r1).map((x) => x.edge)).toEqual(worldBands(r0).map((x) => flipX(x.edge)));
      expect(sortPts(holeCentres(r1))).toEqual(sortPts(holeCentres(r0).map(([x, y, z]) => [lo + hi - x!, y!, z!])));
      if (rotation === 90) {
        expect(worldBands(r0).map((x) => x.edge)[0]![1]).toBe('z');
        expect(worldHoles(r0)[0]!.face[1]).toBe('x');
      }
      expect(occ('l')).toEqual(worldParts(before).find((b) => b.id === 'l'));            // the mate is untouched
      s().undo();
      expect(s().doc).toBe(before);
      s().redo();
      s().mirrorLinkedPart('r', false);                                                 // unticking is the same operation
      expect(partAt(s().doc, 'r')).toEqual(partAt(before, 'r'));
      expect(occ('r')).toEqual(r0);
    });
  }

  it('is one undo entry, a no-op when unchanged, refused while exploded and for a part with no Shape', () => {
    s().replaceDocument(sideDoc(90));
    const d0 = s().doc;
    s().mirrorLinkedPart('r', false);                                                   // already unmirrored
    expect(s().doc).toBe(d0);
    expect(s().canUndo()).toBe(false);
    s().setExplode(1);
    s().mirrorLinkedPart('r', true);
    expect(s().doc).toBe(d0);
    s().setExplode(0);
    s().replaceDocument({ ...createDocument('Plain'), boards: [{ ...caseSide(), id: 'p', name: 'Plain' }] });
    const d1 = s().doc;
    s().mirrorLinkedPart('p', true);
    expect(s().doc).toBe(d1);
    s().replaceDocument(sideDoc(90));
    s().mirrorLinkedPart('r', true);
    s().undo();
    expect(s().canUndo()).toBe(false);
  });
});

describe('Link with part-level mirror flags (spec §5.2)', () => {
  const plain = (id: string, x: number): Board => ({ ...chiralAll('flat'), id, name: id.toUpperCase(), position: [x, 0, 20] });
  const withPlain = (): SloydDocument => ({ ...doc(), boards: [...doc().boards, plain('c', 80)] });
  const stored = (id: string) => partAt(s().doc, id);

  it('a plain part linked to a MIRRORED source becomes a mirrored user: it looks like the source; the Shape is unchanged', () => {
    s().replaceDocument(withPlain());
    const before = shape();
    s().linkBoards(['b', 'c']);
    expect(stored('c')).toEqual({ id: 'c', name: 'C', position: [80, 0, 20], rotation: 0, shape: 's1', mirrored: true });
    expect(shape()).toEqual(before);                                     // the source's Shape, exactly — never its mirror
    for (const k of FEATURE_KEYS) expect(occ('c')[k], k).toEqual(occ('b')[k]);
    expect(stored('a')).not.toHaveProperty('mirrored');
    expect(stored('b')).toHaveProperty('mirrored', true);
  });

  it('a plain part linked to an UNMIRRORED source of a mirrored link joins unmirrored; the mirrored member keeps its flag', () => {
    s().replaceDocument(withPlain());
    s().linkBoards(['a', 'c']);
    expect(stored('c')).toEqual({ id: 'c', name: 'C', position: [80, 0, 20], rotation: 0, shape: 's1' });
    expect(stored('b')).toEqual(doc().boards[1]);
    for (const k of FEATURE_KEYS) expect(occ('c')[k], k).toEqual(occ('a')[k]);
  });

  it('selecting an already-linked mirrored pair changes nothing: no plan, no undo entry (inv 4)', () => {
    expect(linkPlan(worldParts(s().doc), ['a', 'b'])).toBeNull();
    const d0 = s().doc;
    s().linkBoards(['a', 'b']);
    s().linkBoards(['b', 'a']);
    expect(s().doc).toBe(d0);
    expect(s().canUndo()).toBe(false);
  });

  it('a user of ANOTHER Shape takes the source\'s flag, picked or not: each becomes a copy of what the source shows', () => {
    // s2's users: `d` (picked, mirrored relative to s2) and `e` (brought along, unmirrored). Source: the mirrored `b`.
    const other = { ...chiralAll('flat'), length: 18 };
    s().replaceDocument({
      ...doc(),
      shapes: [...doc().shapes, { id: 's2', ...sharedOf(other) }],
      boards: [...doc().boards,
        { id: 'd', name: 'D', position: [0, 0, 40], rotation: 0, shape: 's2', mirrored: true } satisfies ShapedBoard,
        { id: 'e', name: 'E', position: [40, 0, 40], rotation: 0, shape: 's2' } satisfies ShapedBoard],
    });
    s().linkBoards(['b', 'd']);
    expect(stored('d')).toEqual({ id: 'd', name: 'D', position: [0, 0, 40], rotation: 0, shape: 's1', mirrored: true });
    expect(stored('e')).toEqual({ id: 'e', name: 'E', position: [40, 0, 40], rotation: 0, shape: 's1', mirrored: true });
    expect(s().doc.shapes.map((x) => x.id)).toEqual(['s1']);
    for (const id of ['d', 'e']) for (const k of FEATURE_KEYS) expect(occ(id)[k], `${id} ${k}`).toEqual(occ('b')[k]);
  });

  it('a PLAIN source makes every member a copy of it, a mirrored member of the old Shape included (no flag)', () => {
    s().replaceDocument(withPlain());
    s().linkBoards(['c', 'a']);
    for (const id of ['a', 'b']) expect(stored(id), id).not.toHaveProperty('mirrored');
    for (const id of ['a', 'b']) for (const k of FEATURE_KEYS) expect(occ(id)[k], `${id} ${k}`).toEqual(occ('c')[k]);
  });

  it('across a mirrored ASSEMBLY the old refusal holds (assembly parity alone)', () => {
    s().replaceDocument({
      ...doc(),
      instances: [{ id: 'i1', name: 'Side', definition: 'd1', position: [60, 0, 0], rotation: 0, mirrored: true }],
      definitions: [{ id: 'd1', boards: [plain('c', 0)], instances: [], hardware: [] }],
    });
    const d0 = s().doc;
    expect(linkPlan(worldParts(d0), ['b', 'i1/c'], (p) => storageKey(d0, p), (p) => mirroredAt(d0, p))).toEqual({ refused: LINK_ACROSS_MIRROR });
    s().linkBoards(['b', 'i1/c']);
    expect(s().doc).toBe(d0);
  });
});

describe('Unlink, dissolve and copies keep what a person sees (spec §5.2, Review Focus 4)', () => {
  const three = (): SloydDocument => ({ ...doc(), boards: [...doc().boards, { id: 'c', name: 'C', position: [80, 0, 0], rotation: 0, shape: 's1' } satisfies ShapedBoard] });

  it('Unlink of a mirrored user stores its resolved board as a plain part: no `mirrored`, world unchanged', () => {
    s().replaceDocument(three());
    const w = occ('b');
    s().unlinkBoards(['b']);
    const p = partAt(s().doc, 'b')!;
    expect(isShaped(p)).toBe(false);
    expect(p).not.toHaveProperty('mirrored');
    expect(p).not.toHaveProperty('shape');
    expect(occ('b')).toEqual(plainOf(w));
  });

  it('a one-user Shape left by Unlink dissolves likewise: the remaining mirrored user becomes plain, world unchanged', () => {
    const w = occ('b');
    s().unlinkBoards(['a']);
    expect(s().doc.shapes).toEqual([]);
    const p = partAt(s().doc, 'b')!;
    expect(p).not.toHaveProperty('mirrored');
    expect(occ('b')).toEqual(plainOf(w));
  });

  it('Duplicate and Copy in a row keep the flag (own fields are copied)', () => {
    s().duplicateBoard('b');
    const dup = s().doc.boards[2]!;
    expect(dup).toMatchObject({ shape: 's1', mirrored: true });
    s().replaceDocument(doc());
    s().copyInRow(['b'], 3, 0, 1, 50);                                                  // the count includes the original
    expect(s().doc.boards.slice(2).map((x) => (x as ShapedBoard).mirrored)).toEqual([true, true]);
  });

  const nested = (mirroredInstance: boolean): SloydDocument => ({
    ...doc(),
    boards: [doc().boards[0]!],
    instances: [
      { id: 'i1', name: 'Side', definition: 'd1', position: [60, 0, 0], rotation: 90, ...(mirroredInstance ? { mirrored: true as const } : {}) },
      { id: 'i2', name: 'Side 2', definition: 'd1', position: [120, 0, 0], rotation: 0 },
    ],
    definitions: [{ id: 'd1', boards: [doc().boards[1]!], instances: [], hardware: [] }],
  });

  it('Make Unique keeps the flag on a still-shaped part', () => {
    s().replaceDocument(nested(false));
    s().makeUnique('i1');
    const def = s().doc.definitions.find((x) => x.id !== 'd1')!;
    expect(def.boards[0]).toMatchObject({ shape: 's1', mirrored: true });
  });

  it('Ungroup through an UNMIRRORED assembly keeps the flag on the still-shaped part; world unchanged', () => {
    s().replaceDocument(nested(false));
    const w = occ('i1/b');
    s().selectBoard('i1');
    s().ungroupSelected();
    const lifted = s().doc.boards.find((x) => x.name === 'Right')!;
    expect(lifted).toMatchObject({ shape: 's1', mirrored: true });
    expect({ ...occ(lifted.id), id: w.id }).toEqual(w);
  });

  it('Ungroup through a MIRRORED assembly leaves no plain part with the flag (or a stray `shape`); world unchanged', () => {
    s().replaceDocument(nested(true));
    const w = occ('i1/b');
    s().selectBoard('i1');
    s().ungroupSelected();
    const lifted = s().doc.boards.find((x) => x.name === 'Right')!;
    expect(isShaped(lifted)).toBe(false);
    expect(lifted).not.toHaveProperty('mirrored');
    expect(lifted).not.toHaveProperty('shape');
    expect({ ...occ(lifted.id), id: w.id }).toEqual(plainOf(w));
  });
});
