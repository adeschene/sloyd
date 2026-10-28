import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { createBoard, createDocument, worldParts } from '../document/document';
import { sharedOf, sharedPatch, sameShared } from '../document/links';
import type { Board, Dovetail, ShapedBoard, SloydDocument } from '../document/document';
import { mirrorDim } from '../document/frames';
import { mapWorld } from '../document/treeEdit';
import { mirrorDovetails } from '../document/dovetails';

/** Dovetails Task 2 (schema 26): `dovetails` is SHARED (inv 45) and copied with fresh ids (inv 33), as `tenons`. */
const s = () => useStore.getState();
const tails: Dovetail = { id: 'd1', dim: 'length', end: 'max', role: 'tails', count: 4, slope: 8, pin: 0.25, depth: 0.75 };
const pins: Dovetail = { id: 'd2', dim: 'length', end: 'min', role: 'pins', count: 4, slope: 8, pin: 0.25, depth: 0.75, outside: 'min' };
const side = (over: Partial<Board> = {}) => createBoard({ id: 'a', name: 'Side', length: 20, width: 6, thickness: 0.75, ...over });
const setup = (doc: SloydDocument) => {
  useStore.setState({ doc, selectedIds: [], past: [], future: [], tool: 'select', grabbed: null, tapeAnchor: null, tapeHover: null, explode: 0, gesturing: false, gestureSnapshotTaken: false });
};

beforeEach(() => setup({ ...createDocument('T'), boards: [side({ dovetails: [pins, tails] })] }));

describe('dovetails through the store and links (dovetails spec §3.4, §6)', () => {
  it('Duplicate: the copy\'s dovetail ids are fresh, its values equal; a dovetail-free copy has no key', () => {
    s().duplicateBoards(['a']);
    const [src, copy] = s().doc.boards as Board[];
    expect(copy!.dovetails!.map(({ id: _id, ...rest }) => rest)).toEqual(src!.dovetails!.map(({ id: _id, ...rest }) => rest));
    const ids = copy!.dovetails!.map((d) => d.id);
    expect(ids.some((id) => id === 'd1' || id === 'd2')).toBe(false);
    expect(new Set(ids).size).toBe(2);
    expect(copy!.dovetails![0]).not.toBe(src!.dovetails![0]);
    setup({ ...createDocument('T'), boards: [side()] });
    s().duplicateBoards(['a']);
    expect(s().doc.boards.map((b) => 'dovetails' in b)).toEqual([false, false]);
  });

  it('linkBoards: two linked parts share dovetails, stored ONCE on the Shape, a copy per user', () => {
    setup({ ...createDocument('T'), boards: [side({ dovetails: [pins, tails] }), side({ id: 'b', name: 'Side 2', position: [0, 0, 10] })] });
    s().linkBoards(['a', 'b']);
    const doc = s().doc;
    expect(doc.shapes).toHaveLength(1);
    expect(doc.shapes[0]!.dovetails).toEqual([pins, tails]);
    expect(doc.boards.map((b) => 'dovetails' in b)).toEqual([false, false]);
    const users = worldParts(doc);
    expect(users.map((u) => u.dovetails)).toEqual([[pins, tails], [pins, tails]]);
    expect(users[0]!.dovetails![0]).not.toBe(users[1]!.dovetails![0]);
    expect(users[0]!.dovetails![0]).not.toBe(doc.shapes[0]!.dovetails![0]);
  });

  it('sharedOf copies; sharedPatch copies, and a present [] or undefined is a REMOVAL (no key stored)', () => {
    const sh = sharedOf(side({ dovetails: [tails] }));
    expect(sh.dovetails).toEqual([tails]);
    expect(sh.dovetails![0]).not.toBe(tails);
    expect('dovetails' in sharedOf(side())).toBe(false);
    expect('dovetails' in sharedOf(side({ dovetails: [] }))).toBe(false);
    const p = sharedPatch({ dovetails: [tails] });
    expect(p.dovetails).toEqual([tails]);
    expect(p.dovetails![0]).not.toBe(tails);
    for (const removal of [{ dovetails: [] }, { dovetails: undefined }]) {
      const q = sharedPatch(removal);
      expect('dovetails' in q).toBe(true);
      expect(q.dovetails).toBeUndefined();
    }
    expect('dovetails' in sharedPatch({ length: 20 })).toBe(false);
  });

  it('sameShared compares dovetails in order, ids included; absent equals absent only', () => {
    const a = side({ dovetails: [tails] });
    expect(sameShared(a, side({ dovetails: [{ ...tails }] }))).toBe(true);
    expect(sameShared(a, side({ dovetails: [{ ...tails, id: 'x' }] }))).toBe(false);
    expect(sameShared(a, side({ dovetails: [{ ...tails, count: 3 }] }))).toBe(false);
    expect(sameShared(a, side())).toBe(false);
    expect(sameShared(side(), side())).toBe(true);
  });

  it('a removal through the store writes no key on the Shape (sharedPatch then the write-back)', () => {
    setup({ ...createDocument('T'), boards: [side({ dovetails: [tails] }), side({ id: 'b', name: 'Side 2', position: [0, 0, 10] })] });
    s().linkBoards(['a', 'b']);
    s().updateBoard('a', { dovetails: [] });
    const doc = s().doc;
    expect(doc.shapes[0] && 'dovetails' in doc.shapes[0]).toBe(false);
    expect(worldParts(doc).every((p) => !('dovetails' in p))).toBe(true);
  });
});

describe('dovetails across a mirrored link (inv 44, 46): written back in the Shape\'s hand', () => {
  const width: Dovetail = { ...pins, id: 'd3', dim: 'width', end: 'max', outside: 'max' };
  const mirroredDoc = (): SloydDocument => ({
    ...createDocument('Mirrored'),
    shapes: [{ id: 's1', ...sharedOf(side({ dovetails: [pins, tails, width] })) }],
    boards: [
      { id: 'a', name: 'Left', position: [0, 0, 0], rotation: 0, shape: 's1' } satisfies ShapedBoard,
      { id: 'b', name: 'Right', position: [40, 0, 0], rotation: 0, shape: 's1', mirrored: true } satisfies ShapedBoard,
    ],
  });
  const shape = () => s().doc.shapes[0]!;
  const occ = (id: string) => worldParts(s().doc).find((b) => b.id === id)!;

  it('the mirrored user reads the Shape\'s dovetails mirrored; a rename leaves the Shape\'s list the SAME array', () => {
    s().replaceDocument(mirroredDoc());
    const d = mirrorDim(occ('b'));
    expect(occ('b').dovetails).toEqual(mirrorDovetails(shape().dovetails!, d));
    const before = shape().dovetails;
    s().updateBoard('b', { name: 'Right side' });
    expect(shape().dovetails).toBe(before);
  });

  // Through `mapWorld` with ONE target, as a feature action writes (round tenons' addTenon; the Properties path's mate
  // patch is not a feature path: it throws a disagreeing edit across a mirror for tenons too, before this round).
  it('an edit on the mirrored user is stored lowered (its own hand undone); untouched entries keep their objects', () => {
    const doc = mirroredDoc();
    const before = doc.shapes[0]!.dovetails!;
    const b = worldParts(doc).find((x) => x.id === 'b')!;
    const edited = b.dovetails!.map((x) => (x.id === 'd1' ? { ...x, count: 3 } : x));
    const out = mapWorld(doc, (w) => w.map((x) => (x.id === 'b' ? { ...x, dovetails: edited } : x)));
    const after = out.shapes[0]!.dovetails!;
    expect(after).toEqual([pins, { ...tails, count: 3 }, width]);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
    expect(out.boards.map((x) => 'dovetails' in x)).toEqual([false, false]);
    expect(worldParts(out).find((x) => x.id === 'a')!.dovetails).toEqual(after);
  });

  it('a removal on the mirrored user stores no key on the Shape', () => {
    const doc = mirroredDoc();
    const out = mapWorld(doc, (w) => w.map((x) => (x.id === 'b' ? { ...x, dovetails: undefined } : x)));
    expect('dovetails' in out.shapes[0]!).toBe(false);
  });

  it('half-blind (schema 27): linkBoards keeps lap on the Shape; Duplicate keeps lap with fresh ids', () => {
    const lapPins: Dovetail = { ...pins, lap: 0.25 };
    setup({ ...createDocument('T'), boards: [side({ dovetails: [lapPins, { ...tails, lap: 0.25 }] }), side({ id: 'b', name: 'Side 2', position: [0, 0, 10] })] });
    s().duplicateBoards(['a']);
    const copy = (s().doc.boards as Board[]).find((b) => b.id !== 'a' && b.id !== 'b')!;
    expect(copy.dovetails!.map((d) => d.lap)).toEqual([0.25, 0.25]);
    expect(copy.dovetails!.some((d) => d.id === 'd1' || d.id === 'd2')).toBe(false);
    s().linkBoards(['a', 'b']);
    const doc = s().doc;
    expect(doc.shapes[0]!.dovetails!.map((d) => d.lap)).toEqual([0.25, 0.25]);
    expect(worldParts(doc).filter((u) => u.name === 'Side' || u.name === 'Side 2').map((u) => u.dovetails!.map((d) => d.lap)).slice(0, 2)).toEqual([[0.25, 0.25], [0.25, 0.25]]);
  });
});
