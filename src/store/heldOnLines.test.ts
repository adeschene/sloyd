import { useStore } from './store';
import { createBoard, createDocument, heldBoard, ownedByGuide, sameSnapPoint, snapPointsFor } from '../document/document';
import type { AnyLine, SloydDocument, SnapPoint } from '../document/document';
import { worldParts } from '../document/tree';
import { lineFaceHits } from '../document/lineFaces';

/**
 * Held points for line-face hits and stepped anchors (construction-lines-2 spec §3.2, §4.2; inv 24). A face hit depends on
 * its line AND its part; a stepped anchor survives exactly as long as its base would.
 */

const s = () => useStore.getState();

/** B is 24 × 0.75 × 5.5 at the origin, flat; C sits well clear of it on Z. */
const load = () => {
  const doc: SloydDocument = {
    ...createDocument('Held'),
    boards: [createBoard({ id: 'B', name: 'B' }), createBoard({ id: 'C', name: 'C', position: [0, 0, 20] })],
  };
  s().replaceDocument(doc);
};
beforeEach(load);

/** A line along X through B's middle: it meets B at x = 0 and x = 24. */
const lineThroughB = (): string => {
  expect(s().addGuideLine({ at: [0, 0.375, 2], axis: 'x' })).toBe(true);
  return s().doc.guides.at(-1)!.id;
};
const part = (id: string) => worldParts(s().doc).find((b) => b.id === id)!;
const line = (id: string) => s().doc.guides.find((g) => g.id === id) as AnyLine;
/** A REAL face hit of `lineId` on `boardId`, at world x = `x`, so the survival test can keep it. */
const faceHit = (lineId: string, boardId: string, x: number): SnapPoint => {
  const hit = lineFaceHits(line(lineId), part(boardId)).find((p) => p.at[0] === x);
  expect(hit).toBeDefined();
  return hit!;
};
/** A REAL corner of B (a board-owned point), found by position. */
const corner = (boardId: string, at: [number, number, number]): SnapPoint => {
  const p = snapPointsFor(part(boardId)).find((q) => q.kind === 'corner' && q.at.every((v, i) => v === at[i]));
  expect(p).toBeDefined();
  return p!;
};
const stepped = (base: SnapPoint): SnapPoint => ({ kind: 'offset', at: [9, 9, 9], owner: { ...base.owner }, base });

describe('a held face hit (spec §3.2)', () => {
  it('as the anchor: a resize of its part drops it, and the axis lock with it', () => {
    const L = lineThroughB();
    s().setTapeAnchor(faceHit(L, 'B', 24));
    s().setTapeAxis('z');
    s().updateBoard('B', { length: 30 });
    expect(s().tapeAnchor).toBeNull();
    expect(s().tapeAxis).toBeNull();
  });

  it('as the anchor: a rename keeps it (point-precise, never board-precise)', () => {
    const L = lineThroughB();
    const hit = faceHit(L, 'B', 24);
    s().setTapeAnchor(hit);
    s().setTapeAxis('z');
    s().renameItem('B', 'Renamed');
    expect(part('B').name).toBe('Renamed');
    expect(s().tapeAnchor).toBe(hit);
    expect(s().tapeAxis).toBe('z');
  });

  it('as the anchor: a resize that leaves the hit where it was keeps it', () => {
    const L = lineThroughB();
    const hit = faceHit(L, 'B', 0);
    s().setTapeAnchor(hit);
    s().updateBoard('B', { length: 30 });
    expect(s().tapeAnchor).toBe(hit);
  });

  it('as the anchor: removing its line drops it', () => {
    const L = lineThroughB();
    s().setTapeAnchor(faceHit(L, 'B', 24));
    s().removeGuide(L);
    expect(s().tapeAnchor).toBeNull();
  });

  it('as the anchor: deleting its part drops it', () => {
    const L = lineThroughB();
    s().setTapeAnchor(faceHit(L, 'B', 24));
    s().deleteBoard('B');
    expect(s().tapeAnchor).toBeNull();
  });

  it('as the anchor: an edit to a different part keeps it', () => {
    const L = lineThroughB();
    const hit = faceHit(L, 'B', 24);
    s().setTapeAnchor(hit);
    s().updateBoard('C', { length: 30 });
    expect(s().tapeAnchor).toBe(hit);
  });

  it('as the hover: a resize of its part drops the hover and keeps an anchor on another part', () => {
    const L = lineThroughB();
    const anchor = corner('C', [0, 0, 20]);
    s().setTapeAnchor(anchor);
    s().setTapeHover(faceHit(L, 'B', 24));
    s().updateBoard('B', { length: 30 });
    expect(s().tapeHover).toBeNull();
    expect(s().tapeAnchor).toBe(anchor);
  });

  it('as the hover: deleting its part drops it', () => {
    const L = lineThroughB();
    s().setTapeHover(faceHit(L, 'B', 24));
    s().deleteBoard('B');
    expect(s().tapeHover).toBeNull();
  });
});

describe('a held face hit and a bore (spec §3.2)', () => {
  it('adding a bore that swallows the hit\u2019s mouth drops it, and one elsewhere keeps it', () => {
    const L = lineThroughB();
    s().setTapeAnchor(faceHit(L, 'B', 24));
    const hit = s().tapeAnchor;
    expect(s().addHoleRows('B', [{ face: 'length', from: 'max', diameter: 0.25, depth: 0.5, along: 'width', alongFrom: 'min', station: 5, count: 1, pitch: 1, acrossFrom: 'min', inset: 0.375 }])).toBeNull();
    expect(s().tapeAnchor).toBe(hit);
    expect(s().addHoleRows('B', [{ face: 'length', from: 'max', diameter: 0.25, depth: 0.5, along: 'width', alongFrom: 'min', station: 2, count: 1, pitch: 1, acrossFrom: 'min', inset: 0.375 }])).toBeNull();
    expect(part('B').holes).toHaveLength(2);
    expect(s().tapeAnchor).toBeNull();
  });
});

describe('Group and Ungroup re-key a held face hit (spec §3.2)', () => {
  it('Group re-keys owner.board to the part’s new path, and the hit still survives a rename there', () => {
    const L = lineThroughB();
    s().setTapeAnchor(faceHit(L, 'B', 24));
    s().selectBoard('B');
    s().toggleSelected('C');
    s().groupSelected();
    const [path] = s().selectedIds;
    const held = s().tapeAnchor;
    expect(held).not.toBeNull();
    expect(held!.owner).toEqual({ type: 'guide', id: L, board: `${path}/B` });
    s().renameItem(`${path}/B`, 'Renamed');
    expect(s().tapeAnchor).toBe(held);
    // And it is still judged on its part: a resize there drops it.
    s().updateBoard(`${path}/B`, { length: 30 });
    expect(s().tapeAnchor).toBeNull();
  });

  it('Ungroup re-keys it back onto the part where it now sits', () => {
    const L = lineThroughB();
    s().selectBoard('B');
    s().toggleSelected('C');
    s().groupSelected();
    const [path] = s().selectedIds;
    s().setTapeAnchor(faceHit(L, `${path}/B`, 24));
    s().ungroupSelected();
    const held = s().tapeAnchor;
    expect(held).not.toBeNull();
    const board = heldBoard(held!);
    expect(part(board!).name).toBe('B');
    expect(board).not.toBe(`${path}/B`);
  });
});

describe('a stepped anchor (spec §4.2)', () => {
  it('on a corner: a rename keeps it', () => {
    const a = stepped(corner('B', [0, 0, 0]));
    s().setTapeAnchor(a);
    s().renameItem('B', 'Renamed');
    expect(s().tapeAnchor).toBe(a);
  });

  it('on a corner: a resize that moves that corner drops it', () => {
    s().setTapeAnchor(stepped(corner('B', [24, 0, 0])));
    s().setTapeAxis('x');
    s().updateBoard('B', { length: 30 });
    expect(s().tapeAnchor).toBeNull();
    expect(s().tapeAxis).toBeNull();
  });

  it('on a corner: a resize that keeps that corner keeps it', () => {
    const a = stepped(corner('B', [0, 0, 0]));
    s().setTapeAnchor(a);
    s().updateBoard('B', { length: 30 });
    expect(s().tapeAnchor).toBe(a);
  });

  it('on a corner: deleting its part drops it', () => {
    s().setTapeAnchor(stepped(corner('B', [0, 0, 0])));
    s().deleteBoard('B');
    expect(s().tapeAnchor).toBeNull();
  });

  it('on a face hit: a resize that moves the hit drops it; one that keeps it keeps it', () => {
    const L = lineThroughB();
    const keep = stepped(faceHit(L, 'B', 0));
    s().setTapeAnchor(keep);
    s().updateBoard('B', { length: 30 });
    expect(s().tapeAnchor).toBe(keep);
    s().setTapeAnchor(stepped(faceHit(L, 'B', 30)));
    s().updateBoard('B', { length: 26 });
    expect(s().tapeAnchor).toBeNull();
  });

  it('on a face hit: removing its line drops it', () => {
    const L = lineThroughB();
    s().setTapeAnchor(stepped(faceHit(L, 'B', 24)));
    s().removeGuide(L);
    expect(s().tapeAnchor).toBeNull();
  });

  it('on a guide point: removing that guide drops it, removing another keeps it', () => {
    s().addGuide([1, 2, 3]);
    s().addGuide([4, 5, 6]);
    const [G, H] = s().doc.guides.map((g) => g.id) as [string, string];
    const a = stepped({ kind: 'guide', at: [1, 2, 3], owner: { type: 'guide', id: G } });
    s().setTapeAnchor(a);
    s().removeGuide(H);
    expect(s().tapeAnchor).toBe(a);
    s().removeGuide(G);
    expect(s().tapeAnchor).toBeNull();
  });

  it.each([0, 1])('on a crossing: removing line %i of it drops it', (which) => {
    s().addGuideLine({ at: [0, 1, 1], axis: 'x' });
    s().addGuideLine({ at: [1, 0, 1], axis: 'y' });
    s().addGuideLine({ at: [0, 7, 7], axis: 'x' });
    const [A, B, D] = s().doc.guides.map((g) => g.id) as [string, string, string];
    const a = stepped({ kind: 'line-cross', at: [1, 1, 1], owner: { type: 'guide', id: A, cross: B } });
    s().setTapeAnchor(a);
    s().removeGuide(D);
    expect(s().tapeAnchor).toBe(a);
    s().removeGuide([A, B][which]!);
    expect(s().tapeAnchor).toBeNull();
  });

  it('Group re-keys the point AND its base, so it survives the re-key', () => {
    s().setTapeAnchor(stepped(corner('B', [0, 0, 0])));
    s().selectBoard('B');
    s().toggleSelected('C');
    s().groupSelected();
    const [path] = s().selectedIds;
    const held = s().tapeAnchor;
    expect(held).not.toBeNull();
    expect(held!.owner).toEqual({ type: 'board', id: `${path}/B` });
    expect(held!.base!.owner).toEqual({ type: 'board', id: `${path}/B` });
  });

  it('Group re-keys a face-hit base’s board', () => {
    const L = lineThroughB();
    s().setTapeAnchor(stepped(faceHit(L, 'B', 24)));
    s().selectBoard('B');
    s().toggleSelected('C');
    s().groupSelected();
    const [path] = s().selectedIds;
    const held = s().tapeAnchor;
    expect(held).not.toBeNull();
    expect(held!.base!.owner).toEqual({ type: 'guide', id: L, board: `${path}/B` });
  });
});

describe('the held-point helpers (spec §4.2)', () => {
  const g: SnapPoint = { kind: 'guide', at: [1, 2, 3], owner: { type: 'guide', id: 'g1' } };
  const k: SnapPoint = { kind: 'corner', at: [1, 2, 3], owner: { type: 'board', id: 'b1' } };

  it('sameSnapPoint: two offsets at one `at` with different bases are not the same', () => {
    const a: SnapPoint = { kind: 'offset', at: [9, 9, 9], owner: { type: 'board', id: 'b1' }, base: k };
    const b: SnapPoint = { ...a, base: { ...k, at: [1, 2, 4] } };
    expect(sameSnapPoint(a, b)).toBe(false);
    expect(sameSnapPoint(a, { ...a, base: { ...k } })).toBe(true);
    expect(sameSnapPoint(a, { ...a, base: undefined })).toBe(false);
  });

  it('ownedByGuide judges the base, not the stepped point', () => {
    // The owner is always a copy of the base's in practice; a mismatch pins WHICH one is read.
    const p: SnapPoint = { kind: 'offset', at: [9, 9, 9], owner: { type: 'board', id: 'b1' }, base: g };
    expect(ownedByGuide(p, 'g1')).toBe(true);
    expect(ownedByGuide({ ...k, base: k, kind: 'offset', owner: { type: 'guide', id: 'g1' } }, 'g1')).toBe(false);
  });

  it('heldBoard: a board owner, a face hit, a guide point, and each through a base', () => {
    const hit: SnapPoint = { kind: 'line-face', at: [0, 0, 0], owner: { type: 'guide', id: 'L', board: 'b2' } };
    expect(heldBoard(k)).toBe('b1');
    expect(heldBoard(hit)).toBe('b2');
    expect(heldBoard(g)).toBeNull();
    expect(heldBoard({ kind: 'offset', at: [9, 9, 9], owner: { ...hit.owner }, base: hit })).toBe('b2');
    expect(heldBoard({ kind: 'offset', at: [9, 9, 9], owner: { type: 'board', id: 'x' }, base: g })).toBeNull();
  });
});
