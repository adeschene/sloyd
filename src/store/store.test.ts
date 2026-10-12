import { worldParts } from '../document/tree';
import { worldSolids } from '../document/designCheck';
import { useStore } from './store';
import type { Board } from '../document/document';
import { createBoard, createDocument, boardCenter, boardExtents, boardSnapPoints, cutSnapPoints, sameSnapPoint } from '../document/document';

const reset = () => useStore.getState().replaceDocument(createDocument('Test'));

beforeEach(reset);

describe('addBoard', () => {
  it('appends a board and selects it', () => {
    useStore.getState().addBoard();
    const { doc, selectedIds } = useStore.getState();
    expect(doc.boards).toHaveLength(1);
    expect(selectedIds).toEqual([worldParts(doc)[0].id]);
  });

  it('reuses the dimensions of the most recently added board', () => {
    useStore.getState().addBoard();
    const first = worldParts(useStore.getState().doc)[0];
    useStore.getState().updateBoard(first.id, { length: 48, width: 11.25, thickness: 1.5 });
    useStore.getState().addBoard();
    const second = worldParts(useStore.getState().doc)[1];
    expect([second.length, second.width, second.thickness]).toEqual([48, 11.25, 1.5]);
  });

  it('gives each new board a unique name', () => {
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    expect(worldParts(useStore.getState().doc).map((b) => b.name))
      .toEqual(['Board', 'Board (1)', 'Board (2)']);
  });

  it('reuses a freed number rather than counting upward', () => {
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    const middle = worldParts(useStore.getState().doc)[1].id;
    useStore.getState().deleteBoard(middle);
    useStore.getState().addBoard();
    expect(worldParts(useStore.getState().doc).map((b) => b.name))
      .toEqual(['Board', 'Board (2)', 'Board (1)']);
  });
});

describe('updateBoard', () => {
  it('patches only the named fields', () => {
    useStore.getState().addBoard();
    const id = worldParts(useStore.getState().doc)[0].id;
    useStore.getState().updateBoard(id, { length: 30 });
    const b = worldParts(useStore.getState().doc)[0];
    expect(b.length).toBe(30);
    expect(b.width).toBe(5.5);
  });

  it('ignores an unknown id without throwing', () => {
    expect(() => useStore.getState().updateBoard('nope', { length: 1 })).not.toThrow();
  });

  it('copies an incoming position array so later caller mutation cannot corrupt history', () => {
    useStore.getState().addBoard();
    const id = worldParts(useStore.getState().doc)[0].id;
    const caller: [number, number, number] = [1, 2, 3];
    useStore.getState().updateBoard(id, { position: caller });
    caller[0] = 999;
    expect(worldParts(useStore.getState().doc)[0].position).toEqual([1, 2, 3]);
  });
});

describe('updateBoard reorients a board in place', () => {
  const board = () => worldParts(useStore.getState().doc)[0];

  const aBoard = () => {
    useStore.getState().addBoard();
    const id = board().id;
    useStore.getState().updateBoard(id, {
      length: 24, width: 5.5, thickness: 0.75, position: [10, 0, 4],
    });
    return id;
  };

  it('moves the corner so a turning board keeps its footprint centre', () => {
    const id = aBoard();
    useStore.getState().updateBoard(id, { rotation: 90 });
    expect(board().position).toEqual([19.25, 0, -5.25]);
  });

  it('moves the corner so a board stood on edge keeps its footprint centre', () => {
    const id = aBoard();
    useStore.getState().updateBoard(id, { posture: 'on-edge' });
    expect(board().position).toEqual([10, 0, 6.375]);
  });

  it('leaves the position alone when the orientation does not change', () => {
    const id = aBoard();
    useStore.getState().updateBoard(id, { rotation: 0 });
    expect(board().position).toEqual([10, 0, 4]);
  });

  it('lets an explicit position in the same patch win', () => {
    const id = aBoard();
    useStore.getState().updateBoard(id, { rotation: 90, position: [0, 0, 0] });
    expect(board().position).toEqual([0, 0, 0]);
  });

  it('records one undo entry, and undo restores orientation and position together', () => {
    const id = aBoard();
    const before = useStore.getState().past.length;
    useStore.getState().updateBoard(id, { rotation: 90 });
    expect(useStore.getState().past.length).toBe(before + 1);

    useStore.getState().undo();
    expect(board().rotation).toBe(0);
    expect(board().position).toEqual([10, 0, 4]);
  });

  it('does not move a board when an unrelated field changes', () => {
    const id = aBoard();
    useStore.getState().updateBoard(id, { material: 'oak' });
    expect(board().position).toEqual([10, 0, 4]);
  });

  it('keeps the footprint centred when posture is changed on a board already turned', () => {
    const id = aBoard();
    useStore.getState().updateBoard(id, { rotation: 90 });
    useStore.getState().updateBoard(id, { posture: 'on-edge' });
    expect(board().rotation).toBe(90);
    expect(board().posture).toBe('on-edge');
    expect(board().position).toEqual([21.625, 0, -5.25]);
  });

  it('keeps the footprint centred when rotation is changed on a board already on edge', () => {
    const id = aBoard();
    useStore.getState().updateBoard(id, { posture: 'on-edge' });
    useStore.getState().updateBoard(id, { rotation: 90 });
    expect(board().rotation).toBe(90);
    expect(board().posture).toBe('on-edge');
    expect(board().position).toEqual([21.625, 0, -5.25]);
  });

  it('stands a board upright in place — the largest pivot the app can make', () => {
    const id = aBoard();   // 24 x 5-1/2 x 3/4 at [10, 0, 4]
    useStore.getState().updateBoard(id, { posture: 'upright' });
    // Extents go 24 x 3/4 x 5-1/2 -> 5-1/2 x 24 x 3/4: X takes +9-1/4,
    // Z takes +2-3/8, and the board still sits on the floor.
    expect(board().position).toEqual([19.25, 0, 6.375]);
  });

  it('leaves an upright board on the floor rather than centring it vertically', () => {
    const id = aBoard();
    useStore.getState().updateBoard(id, { posture: 'upright' });
    expect(board().position[1]).toBe(0);
  });

  it('keeps the footprint centred when a dimension and the rotation change in one patch', () => {
    // reorientedPosition must compute the pivot from the post-patch dimensions,
    // not the board's stale ones — otherwise a length change bundled with a
    // rotation change lands the board off its true footprint centre.
    const id = aBoard();
    const before = worldParts(useStore.getState().doc).find((b) => b.id === id)!;
    const preCentre = boardCenter(before);
    useStore.getState().updateBoard(id, { rotation: 90, length: 48 });
    const after = board();
    expect(after.rotation).toBe(90);
    expect(after.length).toBe(48);
    const postCentre = boardCenter(after);
    expect([postCentre[0], postCentre[2]]).toEqual([preCentre[0], preCentre[2]]);
  });
});

describe('updateBoard resets grain when switching to a sheet good', () => {
  // 'Through thickness' is meaningless for plywood/MDF — see grainFamily's
  // comment. Doing the reset here, in the same edit as the material change,
  // keeps it to one undo entry rather than two (change material, then a
  // second edit to fix grain) — the same pattern the reorient logic above
  // follows for rotation/posture.
  const board = () => worldParts(useStore.getState().doc)[0];

  it('resets grain to length when switching to plywood while grain is thickness', () => {
    useStore.getState().addBoard();
    const id = board().id;
    useStore.getState().updateBoard(id, { grain: 'thickness' });
    const before = useStore.getState().past.length;
    useStore.getState().updateBoard(id, { material: 'plywood' });
    expect(board().material).toBe('plywood');
    expect(board().grain).toBe('length');
    expect(useStore.getState().past.length).toBe(before + 1);
  });

  it('leaves grain alone when switching to a solid wood', () => {
    useStore.getState().addBoard();
    const id = board().id;
    useStore.getState().updateBoard(id, { grain: 'thickness' });
    useStore.getState().updateBoard(id, { material: 'oak' });
    expect(board().material).toBe('oak');
    expect(board().grain).toBe('thickness');
  });

  it('leaves grain alone when switching to plywood while grain is not thickness', () => {
    useStore.getState().addBoard();
    const id = board().id;
    useStore.getState().updateBoard(id, { grain: 'width' });
    useStore.getState().updateBoard(id, { material: 'plywood' });
    expect(board().material).toBe('plywood');
    expect(board().grain).toBe('width');
  });
});

describe('deleteBoard', () => {
  it('removes the board and clears the selection if it was selected', () => {
    useStore.getState().addBoard();
    const id = worldParts(useStore.getState().doc)[0].id;
    useStore.getState().deleteBoard(id);
    expect(worldParts(useStore.getState().doc)).toHaveLength(0);
    expect(useStore.getState().selectedIds).toEqual([]);
  });
});

describe('duplicateBoard', () => {
  it('copies the board with a new id, offset name, and selects the copy', () => {
    useStore.getState().addBoard();
    const orig = worldParts(useStore.getState().doc)[0];
    useStore.getState().updateBoard(orig.id, { name: 'Shelf' });
    useStore.getState().duplicateBoard(orig.id);
    const { doc, selectedIds } = useStore.getState();
    expect(doc.boards).toHaveLength(2);
    expect(worldParts(doc)[1].id).not.toBe(orig.id);
    expect(worldParts(doc)[1].name).toBe('Shelf (1)');
    expect(selectedIds).toEqual([worldParts(doc)[1].id]);
  });

  it('names the copy with a numeric suffix, not "copy"', () => {
    useStore.getState().addBoard();
    const source = worldParts(useStore.getState().doc)[0];
    useStore.getState().updateBoard(source.id, { name: 'Leg' });
    useStore.getState().duplicateBoard(source.id);
    expect(worldParts(useStore.getState().doc).map((b) => b.name)).toEqual(['Leg', 'Leg (1)']);
  });

  it('duplicating a duplicate does not nest suffixes', () => {
    useStore.getState().addBoard();
    const source = worldParts(useStore.getState().doc)[0];
    useStore.getState().updateBoard(source.id, { name: 'Leg' });
    useStore.getState().duplicateBoard(source.id);
    const copy = worldParts(useStore.getState().doc)[1];
    expect(copy.name).toBe('Leg (1)');
    useStore.getState().duplicateBoard(copy.id);
    expect(worldParts(useStore.getState().doc)[2].name).toBe('Leg (2)');
  });

  it('mints fresh angle-cut ids and shares no points array (angle-cuts spec §5.2)', () => {
    useStore.getState().replaceDocument({ ...createDocument('T'), boards: [createBoard({ id: 'leg', name: 'Leg', angleCuts: [
      { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.5], [18, 0]] },
    ] })] });
    useStore.getState().duplicateBoard('leg');
    const boards = useStore.getState().doc.boards as Board[];
    expect(boards).toHaveLength(2);
    const [src, dup] = boards;
    expect(dup!.angleCuts).toHaveLength(1);
    expect(dup!.angleCuts[0]!.id).not.toBe(src!.angleCuts[0]!.id);
    expect(dup!.angleCuts[0]!.points).toEqual(src!.angleCuts[0]!.points);
    expect(dup!.angleCuts[0]!.points).not.toBe(src!.angleCuts[0]!.points);
  });

  it('copies cuts by value, not by reference, with fresh ids', () => {
    useStore.getState().addBoard();
    const source = worldParts(useStore.getState().doc)[0];
    useStore.getState().addCut(source.id);
    useStore.getState().duplicateBoard(source.id);
    const { doc } = useStore.getState();
    const src = worldParts(doc)[0];
    const copy = worldParts(doc)[1];

    expect(src.cuts).not.toBe(copy.cuts);
    expect(src.cuts[0]).not.toBe(copy.cuts[0]);
    expect(copy.cuts[0].id).not.toBe(src.cuts[0].id);

    const sourceDepth = src.cuts[0].depth;
    useStore.getState().updateCut(copy.id, copy.cuts[0].id, { depth: 0.5 });
    const after = worldParts(useStore.getState().doc);
    expect(sourceDepth).not.toBe(0.5);
    expect(after[1].cuts[0].depth).toBe(0.5);
    expect(after[0].cuts[0].depth).toBe(sourceDepth);
  });
});

describe('undo / redo', () => {
  it('starts with nothing to undo or redo', () => {
    expect(useStore.getState().canUndo()).toBe(false);
    expect(useStore.getState().canRedo()).toBe(false);
  });

  it('undoes an add', () => {
    useStore.getState().addBoard();
    useStore.getState().undo();
    expect(worldParts(useStore.getState().doc)).toHaveLength(0);
    expect(useStore.getState().canRedo()).toBe(true);
  });

  it('redoes an undone add', () => {
    useStore.getState().addBoard();
    useStore.getState().undo();
    useStore.getState().redo();
    expect(worldParts(useStore.getState().doc)).toHaveLength(1);
  });

  it('drops the redo stack once a new edit lands', () => {
    useStore.getState().addBoard();
    useStore.getState().undo();
    useStore.getState().addBoard();
    expect(useStore.getState().canRedo()).toBe(false);
  });

  it('undoes an update back to the previous value', () => {
    useStore.getState().addBoard();
    const id = worldParts(useStore.getState().doc)[0].id;
    useStore.getState().updateBoard(id, { length: 30 });
    useStore.getState().undo();
    expect(worldParts(useStore.getState().doc)[0].length).toBe(24);
  });

  it('is a no-op when there is nothing to undo', () => {
    expect(() => useStore.getState().undo()).not.toThrow();
    expect(worldParts(useStore.getState().doc)).toHaveLength(0);
  });

  it('caps history at 50 entries', () => {
    for (let i = 0; i < 60; i += 1) useStore.getState().addBoard();
    expect(useStore.getState().past.length).toBeLessThanOrEqual(50);
  });

  it('does not treat selection as an undoable edit', () => {
    useStore.getState().addBoard();
    const before = useStore.getState().past.length;
    useStore.getState().selectBoard(null);
    expect(useStore.getState().past.length).toBe(before);
  });
});

describe('replaceDocument', () => {
  it('installs the document and clears history and selection', () => {
    useStore.getState().addBoard();
    const incoming = createDocument('Imported');
    incoming.boards.push(createBoard({ name: 'Leg' }));
    useStore.getState().replaceDocument(incoming);
    const s = useStore.getState();
    expect(s.doc.name).toBe('Imported');
    expect(s.selectedIds).toEqual([]);
    expect(s.canUndo()).toBe(false);
  });
});

describe('gesture coalescing', () => {
  it('records one undo entry for a whole gesture', () => {
    useStore.getState().addBoard();
    const id = worldParts(useStore.getState().doc)[0].id;
    const before = useStore.getState().past.length;

    useStore.getState().beginGesture();
    useStore.getState().updateBoard(id, { position: [1, 0, 0] });
    useStore.getState().updateBoard(id, { position: [2, 0, 0] });
    useStore.getState().updateBoard(id, { position: [3, 0, 0] });
    useStore.getState().endGesture();

    expect(useStore.getState().past.length).toBe(before + 1);
    useStore.getState().undo();
    expect(worldParts(useStore.getState().doc)[0].position).toEqual([0, 0, 0]);
  });

  it('records nothing for a gesture that made no edit', () => {
    useStore.getState().addBoard();
    const before = useStore.getState().past.length;
    useStore.getState().beginGesture();
    useStore.getState().endGesture();
    expect(useStore.getState().past.length).toBe(before);
  });

  it('records separately for two consecutive gestures', () => {
    useStore.getState().addBoard();
    const id = worldParts(useStore.getState().doc)[0].id;
    const before = useStore.getState().past.length;

    useStore.getState().beginGesture();
    useStore.getState().updateBoard(id, { position: [1, 0, 0] });
    useStore.getState().endGesture();

    useStore.getState().beginGesture();
    useStore.getState().updateBoard(id, { position: [2, 0, 0] });
    useStore.getState().endGesture();

    expect(useStore.getState().past.length).toBe(before + 2);
    useStore.getState().undo();
    expect(worldParts(useStore.getState().doc)[0].position).toEqual([1, 0, 0]);
  });

  /**
   * Follow-up 148. A component can unmount mid-gesture — ordinary in RTL,
   * where cleanup() tears the tree down between tests, and reachable in the
   * browser wherever a focused field is removed rather than blurred — so
   * `endGesture` may simply never run. While the two flags lived in the
   * store's closure, nothing reset them: `replaceDocument` rewrote the
   * document, the history and every held point and left a gesture nobody
   * opened standing for the rest of the session.
   *
   * The assertion is an UNDO ENTRY, not a flag value. Asserting
   * `gesturing === false` after `replaceDocument` cannot fail — the field
   * initialises false, so it passes with the reset deleted (follow-up 155's
   * shape). Here the leak has a consequence: with the flags left standing,
   * the edit below coalesces into a snapshot that was never taken, `past`
   * stays empty and Ctrl+Z does nothing.
   */
  it('a gesture left open does not survive replaceDocument', () => {
    useStore.getState().addBoard();
    const id = worldParts(useStore.getState().doc)[0].id;
    useStore.getState().beginGesture();
    useStore.getState().updateBoard(id, { position: [1, 0, 0] });
    // No endGesture() — the component went away mid-gesture.

    useStore.getState().replaceDocument(createDocument('Next'));
    expect(useStore.getState().past).toHaveLength(0);

    useStore.getState().addBoard();
    const next = worldParts(useStore.getState().doc)[0].id;
    useStore.getState().updateBoard(next, { position: [2, 0, 0] });

    expect(useStore.getState().past).toHaveLength(2);
    useStore.getState().undo();
    expect(worldParts(useStore.getState().doc)[0].position).toEqual([0, 0, 0]);
  });
});

describe('cuts', () => {
  const boardId = () => worldParts(useStore.getState().doc)[0].id;
  const cuts = () => worldParts(useStore.getState().doc)[0].cuts;

  beforeEach(() => {
    useStore.setState({ doc: createDocument(), selectedIds: [], past: [], future: [] });
    useStore.getState().addBoard();
  });

  it('adds a cut that is not stopped', () => {
    useStore.getState().addCut(boardId());
    expect(cuts()[0]).toMatchObject({ stopMin: 0, stopMax: 0 });
  });

  // fu 215. Hand derivation: board L=24 W=4 T=2, turn 0. addCut: offset L/4=6, width min(.75,6)=.75,
  // depth T/2=1, across width (whole width), face thickness.
  // Flat: Y carries thickness, not reversed, from 'max' -> the world +Y face: solid-removed box
  //   y in [pos.y+1, pos.y+2] (the cut), x in [6,6.75] of length.
  // On-edge turn 0 (v12): Z carries thickness REVERSED (part 0 at world +Z). The default camera sits at +Z,
  //   so the starter dado must open on world +Z: from 'min' -> part thickness [0,1] -> world z [T-1,T] = [1,2].
  //   (from 'max' would be part [1,2] -> world z [0,1], the face away from the camera.)
  const cutBox = (b: ReturnType<typeof worldParts>[number]) => {
    const full = worldSolids({ ...b, cuts: [] })[0]!;
    const sol = worldSolids(b);
    return { full, sol };
  };

  it('starts a flat part dado on the world +Y face', () => {
    const id = boardId();
    useStore.getState().updateBoard(id, { length: 24, width: 4, thickness: 2 });
    useStore.getState().addCut(id);
    const b = worldParts(useStore.getState().doc)[0];
    expect(b.cuts[0]).toMatchObject({ face: 'thickness', from: 'max' });
    // some remaining solid reaches y = top (2) but none covers the dado cell x in [6,6.75] above y = 1
    const { sol } = cutBox(b);
    const inDado = sol.filter((s) => s.min[0]! < 6.75 && s.max[0]! > 6 && s.max[1]! > 1 + 1e-9);
    expect(inDado).toEqual([]);
  });

  it('starts an on-edge part dado on the world +Z face (the camera side)', () => {
    const id = boardId();
    useStore.getState().updateBoard(id, { length: 24, width: 4, thickness: 2, posture: 'on-edge' });
    useStore.getState().addCut(id);
    const b = worldParts(useStore.getState().doc)[0];
    expect(b.cuts[0]).toMatchObject({ face: 'thickness', from: 'min' });
    const { full, sol } = cutBox(b);
    expect(full.max[2]! - full.min[2]!).toBeCloseTo(2);
    // Z is thickness: in the dado's x range nothing remains above z = min + 1 (the +Z half is cut away).
    const z0 = full.min[2]!;
    const inDado = sol.filter((s) => s.min[0]! < 6.75 && s.max[0]! > 6 && s.max[2]! > z0 + 1 + 1e-9);
    expect(inDado).toEqual([]);
    // and the -Z half is still solid there
    expect(sol.some((s) => s.min[0]! <= 6 + 1e-9 && s.max[0]! >= 6.75 - 1e-9 && s.min[2]! <= z0 + 1e-9)).toBe(true);
  });

  it('keeps the stops when the board is duplicated', () => {
    useStore.getState().addCut(boardId());
    useStore.getState().updateCut(boardId(), cuts()[0].id, { stopMin: 1, stopMax: 0.5 });
    useStore.getState().duplicateBoard(boardId());
    const copy = worldParts(useStore.getState().doc)[1];
    expect(copy.cuts[0]).toMatchObject({ stopMin: 1, stopMax: 0.5 });
  });

  it('adds a cut with a default that fits the board', () => {
    useStore.getState().addCut(boardId());
    expect(cuts()).toHaveLength(1);
    const c = cuts()[0];
    expect(c.depth).toBeGreaterThan(0);
    expect(c.face).not.toBe(c.across);
  });

  it('gives each cut a distinct id', () => {
    useStore.getState().addCut(boardId());
    useStore.getState().addCut(boardId());
    expect(cuts()[0].id).not.toBe(cuts()[1].id);
  });

  it('patches one cut and leaves the others alone', () => {
    useStore.getState().addCut(boardId());
    useStore.getState().addCut(boardId());
    const [first, second] = cuts();
    useStore.getState().updateCut(boardId(), second.id, { offset: 9 });
    expect(cuts()[1].offset).toBe(9);
    expect(cuts()[0]).toEqual(first);
  });

  it('removes a cut', () => {
    useStore.getState().addCut(boardId());
    useStore.getState().removeCut(boardId(), cuts()[0].id);
    expect(cuts()).toEqual([]);
  });

  it('is undoable', () => {
    useStore.getState().addCut(boardId());
    useStore.getState().undo();
    expect(cuts()).toEqual([]);
  });

  // A cut removes stock from inside the board's AABB: it never changes the
  // extents and never moves the board, so reorienting on a cut change would
  // be a no-op pivot. Same reasoning that keeps `grain` out of the predicate.
  it('never moves the board', () => {
    const before = worldParts(useStore.getState().doc)[0].position;
    useStore.getState().addCut(boardId());
    useStore.getState().updateCut(boardId(), cuts()[0].id, { depth: 0.5 });
    expect(worldParts(useStore.getState().doc)[0].position).toEqual(before);
  });

  it('ignores an unknown board or cut', () => {
    expect(() => useStore.getState().addCut('nope')).not.toThrow();
    expect(() => useStore.getState().removeCut(boardId(), 'nope')).not.toThrow();
    expect(cuts()).toEqual([]);
  });

  // Matching updateBoard/deleteBoard/duplicateBoard: an unmatched id must be a
  // true no-op, not merely non-throwing — otherwise edit() still pushes a
  // no-op undo snapshot (invariant 4) and clears the redo stack.
  it('leaves the undo stack alone for an unknown board or cut', () => {
    useStore.getState().addCut(boardId());
    const pastLength = useStore.getState().past.length;

    useStore.getState().updateCut(boardId(), 'nope', { offset: 9 });
    expect(useStore.getState().past.length).toBe(pastLength);

    useStore.getState().updateCut('nope', cuts()[0].id, { offset: 9 });
    expect(useStore.getState().past.length).toBe(pastLength);

    useStore.getState().removeCut('nope', cuts()[0].id);
    expect(useStore.getState().past.length).toBe(pastLength);
  });

  // The brief's suggested id scheme (`c_${Date.now()}_${cuts.length}`) can
  // collide: add a cut, remove it (length back to 0), add another within the
  // same millisecond — both mint the same id. A monotonic counter (the same
  // scheme `nextId()` already uses for board ids, and that validateCuts
  // already re-mints onto any cut missing/duplicating an id) does not have
  // that failure mode.
  it('still gives a distinct id after an add/remove/add within the same tick', () => {
    useStore.getState().addCut(boardId());
    const firstId = cuts()[0].id;
    useStore.getState().removeCut(boardId(), firstId);
    useStore.getState().addCut(boardId());
    expect(cuts()[0].id).not.toBe(firstId);
  });
});

describe('the Move tool', () => {
  /**
   * Two boards, returned with the store reset around them and the FIRST one
   * selected.
   *
   * addBoard selects what it creates, so without this the fixture leaves the
   * second board selected while every test below grabs a point on the first —
   * a combination the Move tool will not produce once its candidates are
   * restricted to the selected board's points. Selecting `a` is what makes
   * the fixture model a state a user can actually reach.
   */
  const twoBoards = () => {
    useStore.setState({
      doc: createDocument(),
      selectedIds: [],
      past: [],
      future: [],
      tool: 'select',
      grabbed: null,
    });
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    const [a, b] = worldParts(useStore.getState().doc);
    useStore.getState().selectBoard(a!.id);
    return { a, b };
  };

  const cornerOf = (id: string) => {
    const board = worldParts(useStore.getState().doc).find((x) => x.id === id)!;
    return boardSnapPoints(board).find((p) => p.kind === 'corner')!;
  };

  it('starts in the select tool with nothing grabbed', () => {
    twoBoards();
    expect(useStore.getState().tool).toBe('select');
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('drops any grab when the tool changes', () => {
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    expect(useStore.getState().grabbed).not.toBeNull();
    useStore.getState().setTool('select');
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('moves the grabbed board so the two points coincide exactly', () => {
    const { a, b } = twoBoards();
    // Put b somewhere unrelated so the delta is non-trivial.
    useStore.getState().updateBoard(b.id, { position: [37.5, 11.25, -4.125] });
    const grab = cornerOf(a.id);
    const target = cornerOf(b.id);
    useStore.getState().grabSnapPoint(grab);
    useStore.getState().commitSnapMove(target);

    const moved = worldParts(useStore.getState().doc).find((x) => x.id === a.id)!;
    const landed = boardSnapPoints(moved).find(
      (p) => p.kind === grab.kind && p.at.every((v, i) => v === target.at[i]),
    );
    expect(landed).toBeDefined();
  });

  it('does not round the result to 1/16 inch', () => {
    const { a, b } = twoBoards();
    // 0.01 is far off any sixteenth; a snap would visibly change it.
    useStore.getState().updateBoard(b.id, { position: [0.01, 0, 0] });
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().commitSnapMove(cornerOf(b.id));
    const moved = worldParts(useStore.getState().doc).find((x) => x.id === a.id)!;
    expect(moved.position[0]).toBeCloseTo(0.01, 10);
  });

  it('clears the grab and selects the board it moved', () => {
    const { a, b } = twoBoards();
    // b must be moved off a first. Two fresh boards share a default position,
    // so without this the delta is exactly zero and the commit correctly takes
    // the no-op path instead of the one under test.
    useStore.getState().updateBoard(b.id, { position: [40, 0, 0] });
    // Grab from b, not a: the fixture selects a, so asserting selectedIds equals [a]
    // after moving a would pass without commitSnapMove writing anything.
    useStore.getState().selectBoard(b.id);
    useStore.getState().grabSnapPoint(cornerOf(b.id));
    useStore.getState().commitSnapMove(cornerOf(a.id));
    expect(useStore.getState().grabbed).toBeNull();
    expect(useStore.getState().selectedIds).toEqual([b.id]);
  });

  it('reverts a whole snap move with one undo', () => {
    const { a, b } = twoBoards();
    useStore.getState().updateBoard(b.id, { position: [40, 0, 0] });
    const before = [...worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.position];
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().commitSnapMove(cornerOf(b.id));
    useStore.getState().undo();
    expect(worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.position)
      .toEqual(before);
  });

  it('ignores a target on the grabbed board itself', () => {
    const { a } = twoBoards();
    const corners = boardSnapPoints(worldParts(useStore.getState().doc)[0]!)
      .filter((p) => p.kind === 'corner');
    const before = [...worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.position];
    useStore.getState().grabSnapPoint(corners[0]!);
    useStore.getState().commitSnapMove(corners[7]!);
    expect(worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.position)
      .toEqual(before);
    expect(useStore.getState().grabbed).not.toBeNull();
  });

  it('is a no-op with nothing grabbed', () => {
    const { a, b } = twoBoards();
    const undoDepth = useStore.getState().past.length;
    useStore.getState().commitSnapMove(cornerOf(b.id));
    expect(useStore.getState().past.length).toBe(undoDepth);
    expect(worldParts(useStore.getState().doc).find((x) => x.id === a.id)).toBeDefined();
  });

  it('leaves no undo entry when the two points already coincide', () => {
    const { a, b } = twoBoards();
    const grab = cornerOf(a.id);
    // Move b so its grabbed-kind corner is already where a's is.
    const target = cornerOf(b.id);
    const board = worldParts(useStore.getState().doc).find((x) => x.id === b.id)!;
    useStore.getState().updateBoard(b.id, {
      position: [
        board.position[0] + (grab.at[0] - target.at[0]),
        board.position[1] + (grab.at[1] - target.at[1]),
        board.position[2] + (grab.at[2] - target.at[2]),
      ],
    });
    const undoDepth = useStore.getState().past.length;
    useStore.getState().grabSnapPoint(grab);
    useStore.getState().commitSnapMove(cornerOf(b.id));
    // Invariant 4's shape: a no-op edit would still push a snapshot and wipe
    // redo, so Ctrl+Z would appear to do nothing.
    expect(useStore.getState().past.length).toBe(undoDepth);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('drops a grab when the grabbed board is deleted', () => {
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().deleteBoard(a.id);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('keeps a grab when some other board is deleted', () => {
    // This pins the SHAPE of edit()'s condition, not merely that it fires:
    // the resulting selection is compared against the grabbed board's id,
    // rather than the grab being cleared whenever a `selection` callback ran
    // at all. deleteBoard always passes a callback, and here it resolves to
    // the still-selected `a` — the board the grab belongs to — so nothing has
    // moved out from under the captured point and the user has not
    // retargeted the tool. Dropping `heldGrab.owner.id !== nextSelectedId`
    // fails exactly here, which is what makes this test load-bearing rather
    // than a restatement of the one above. (Its sibling below, "keeps a grab
    // when some other board is edited", is what fails if the
    // `selection !== undefined` half is dropped instead.)
    const { a, b } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().deleteBoard(b.id);
    expect(useStore.getState().selectedIds).toEqual([a.id]);
    expect(useStore.getState().grabbed?.owner.id).toBe(a.id);
  });

  it('drops a grab when the grabbed board is edited', () => {
    // Properties stays fully live in Move mode (nothing disables it), so a
    // Length edit reachable right after a grab can relocate the grabbed board
    // out from under its own captured point (invariant 24). updateBoard must
    // drop the grab the same way deleteBoard does.
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().updateBoard(a.id, { length: 30 });
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('keeps a grab when some other board is edited', () => {
    const { a, b } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().updateBoard(b.id, { length: 30 });
    expect(useStore.getState().grabbed).not.toBeNull();
  });

  it('drops a grab on undo and on redo', () => {
    const { a } = twoBoards();
    // grabbed.at is a world position captured at grab time; an undo can move
    // the board out from under it, and committing would then apply a delta
    // derived from a position that no longer describes anything.
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().undo();
    expect(useStore.getState().grabbed).toBeNull();

    useStore.getState().grabSnapPoint(cornerOf(worldParts(useStore.getState().doc)[0]!.id));
    useStore.getState().redo();
    expect(useStore.getState().grabbed).toBeNull();
  });

  const shoulderOf = (id: string) => {
    const board = worldParts(useStore.getState().doc).find((x) => x.id === id)!;
    const point = cutSnapPoints(board)[0];
    expect(point, 'fixture must have a cut with offerable points').toBeDefined();
    return point;
  };

  it('drops a grab on a shoulder when the cut is removed', () => {
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    useStore.getState().addCut(a.id);
    useStore.getState().grabSnapPoint(shoulderOf(a.id));
    expect(useStore.getState().grabbed).not.toBeNull();

    const cutId = worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.cuts[0].id;
    useStore.getState().removeCut(a.id, cutId);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('drops a grab on a shoulder when the cut moves under it', () => {
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    useStore.getState().addCut(a.id);
    useStore.getState().grabSnapPoint(shoulderOf(a.id));

    const cutId = worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.cuts[0].id;
    useStore.getState().updateCut(a.id, cutId, { offset: 9 });
    expect(useStore.getState().grabbed).toBeNull();
  });

  /** Points of a's cut that a stopMin edit to 1 removes, and ones it keeps. */
  const stopEditSplit = (id: string) => {
    const board = worldParts(useStore.getState().doc).find((x) => x.id === id)!;
    const before = cutSnapPoints(board);
    const after = cutSnapPoints({ ...board, cuts: [{ ...board.cuts[0], stopMin: 1 }] });
    const gone = before.find((p) => !after.some((q) => sameSnapPoint(p, q)));
    const kept = before.find((p) => after.some((q) => sameSnapPoint(p, q)));
    expect(gone, 'fixture: a stop edit must remove some point').toBeDefined();
    expect(kept, 'fixture: a stop edit must keep some point').toBeDefined();
    return { gone: gone!, kept: kept! };
  };

  it('drops a grab on a point a stop edit removes', () => {
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    useStore.getState().addCut(a.id);
    const { gone } = stopEditSplit(a.id);
    useStore.getState().grabSnapPoint(gone);
    const cutId = worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.cuts[0].id;
    useStore.getState().updateCut(a.id, cutId, { stopMin: 1 });
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('KEEPS a grab on a point a stop edit leaves in place', () => {
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    useStore.getState().addCut(a.id);
    const { kept } = stopEditSplit(a.id);
    useStore.getState().grabSnapPoint(kept);
    const cutId = worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.cuts[0].id;
    useStore.getState().updateCut(a.id, cutId, { stopMin: 1 });
    expect(useStore.getState().grabbed).not.toBeNull();
  });

  it('KEEPS a grab on a box corner when a cut is added to the same board', () => {
    // This passes for a NARROWER reason than the title alone suggests:
    // addCut's default cut is a mid-face dado at offset === length / 4, which
    // touches no box point at all, so nothing here exercises stockProbe's
    // filter on boardSnapPoints. The corner did not move, so the captured
    // position still describes it, and a blanket clear would be safe but
    // would drop a grab needlessly. See the DROPS test below for the other
    // half of the rule: a cut edited to actually reach the corner's own
    // stock removes the point from boardSnapPoints' output, and the grab is
    // correctly dropped rather than kept.
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    const corner = cornerOf(a.id);
    useStore.getState().grabSnapPoint(corner);
    useStore.getState().addCut(a.id);
    expect(useStore.getState().grabbed).toEqual(corner);
  });

  const flushCornerOf = (id: string) => {
    // The corner at length === 0, thickness === board.thickness (the `max`
    // face a default cut enters) — as opposed to cornerOf's all-mins corner,
    // which no cut on this board's `thickness`/`max` face can ever reach.
    const board = worldParts(useStore.getState().doc).find((x) => x.id === id)!;
    const corner = boardSnapPoints(board).find(
      (p) =>
        p.kind === 'corner' &&
        p.at[0] === board.position[0] &&
        p.at[1] === board.position[1] + board.thickness,
    );
    expect(corner, 'fixture must have a flush-face corner').toBeDefined();
    return corner!;
  };

  it('DROPS a grab on a box corner when a cut moves to consume its stock', () => {
    // The other half of the KEEPS test above, pinning follow-up 129: since
    // Task 6b, boardSnapPoints filters its 26 box-lattice points through
    // stockProbe (closing follow-up 122), so a box corner is not immune to
    // dropHeldIfGone the way the KEEPS test's title alone suggests — it
    // survives only as long as its own stock survives. This is the SAME
    // rule dropHeldIfGone always applied to a shoulder, reached here through
    // boardSnapPoints' output rather than through cutSnapPoints'.
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    const corner = flushCornerOf(a.id);
    useStore.getState().grabSnapPoint(corner);

    useStore.getState().addCut(a.id);
    // Confirms the fixture: the default cut (offset === length / 4) is a
    // mid-face dado and does not yet touch this corner, so the grab is
    // still held before the edit under test.
    expect(useStore.getState().grabbed).toEqual(corner);

    const cutId = worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.cuts[0].id;
    // Pull the cut flush with the board's own end. cutRegion spans the
    // FULL `across` dimension (width) regardless of offset, so with
    // offset === 0 and the default width (0.75) the removed region is
    // length [0, 0.75] x width [0, board.width] x thickness [0.375, 0.75]
    // (from: 'max', depth: thickness / 2 = 0.375) — which contains the
    // grabbed corner (length 0, thickness board.thickness) on all three
    // axes, so its stock is gone and boardSnapPoints no longer offers it.
    useStore.getState().updateCut(a.id, cutId, { offset: 0 });
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('keeps a grab when a cut is edited on a DIFFERENT board', () => {
    const { a, b } = twoBoards();
    useStore.getState().setTool('move');
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().addCut(b.id);
    expect(useStore.getState().grabbed).not.toBeNull();
  });

  it('drops a grab when the document is replaced', () => {
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().replaceDocument(createDocument());
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('cancelGrab clears the grab and moves nothing', () => {
    const { a } = twoBoards();
    const before = [...worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.position];
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().cancelGrab();
    expect(useStore.getState().grabbed).toBeNull();
    expect(worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.position)
      .toEqual(before);
  });

  it('drops a grab when a different board is selected', () => {
    // A grab is only offered on the selected board's points, so the selection
    // moving elsewhere means the user retargeted the tool. Keeping the grab
    // would leave the tool carrying a point belonging to a board the
    // properties panel is no longer showing, with nothing explaining it.
    const { a, b } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().selectBoard(b.id);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('keeps a grab when the same board is re-selected', () => {
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().selectBoard(a.id);
    expect(useStore.getState().grabbed).not.toBeNull();
  });

  it('drops a grab when the selection is cleared', () => {
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().selectBoard(null);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('drops a grab when Add board selects the new board', () => {
    // addBoard selects its new board through edit()'s `selection` callback,
    // not through selectBoard — a second writer of the selection that nothing
    // gates in Move mode. Without the clear inside edit(), the toolbar button
    // reaches exactly the mismatched state the tests above rule out.
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().addBoard();
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('drops a grab when Duplicate selects the copy', () => {
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().duplicateBoard(a.id);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('refuses to commit when the grabbed board is not the selected one', () => {
    // Task 1's clearing removes every ordinary route to this mismatch, so it
    // is built directly here rather than driven through the store's own
    // writers. This is the action-level half of the rule MoveTool's candidate
    // memo enforces at the UI: the filter makes it true of the UI, the guard
    // makes it true of the action, the same pairing the self-snap case
    // already uses.
    const { a, b } = twoBoards();
    useStore.getState().updateBoard(b.id, { position: [40, 0, 0] });
    const before = [...worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.position];
    const undoDepth = useStore.getState().past.length;

    useStore.getState().grabSnapPoint(cornerOf(a.id));
    // Reach past the store's own clearing to build the state under test.
    useStore.setState({ selectedIds: [b.id] });
    useStore.getState().commitSnapMove(cornerOf(b.id));

    expect(worldParts(useStore.getState().doc).find((x) => x.id === a.id)!.position)
      .toEqual(before);
    // No edit() ran, so no undo snapshot was pushed and redo was not wiped.
    expect(useStore.getState().past.length).toBe(undoDepth);
    // The grab is left in hand rather than discarded: the state should be
    // unreachable, and silently dropping it would make it undiagnosable.
    expect(useStore.getState().grabbed).not.toBeNull();
  });
});

describe('SnapOwner widening — a guide is a legal target', () => {
  const guidePoint = (id: string, at: [number, number, number]) =>
    ({ kind: 'guide' as const, at, owner: { type: 'guide' as const, id } });

  it('a board can be snapped onto a guide point', () => {
    useStore.getState().addBoard();
    const board = worldParts(useStore.getState().doc)[0];
    const corner = boardSnapPoints(board)[0];
    useStore.getState().grabSnapPoint(corner);
    useStore.getState().commitSnapMove(guidePoint('g1', [
      corner.at[0] + 5, corner.at[1] + 6, corner.at[2] + 7,
    ]));
    const moved = worldParts(useStore.getState().doc)[0];
    expect(moved.position).toEqual([
      board.position[0] + 5, board.position[1] + 6, board.position[2] + 7,
    ]);
    expect(useStore.getState().grabbed).toBeNull();
  });

  // The self-snap guard compares OWNERS, not bare ids — the ONE runtime
  // narrowing the BoardSnapPoint type does not subsume, because the TARGET can
  // legitimately be a guide. Without the `type` test, a guide whose id
  // collided with the grabbed board's would read as a self-snap and the move
  // would be silently refused. See the design's §3.0.
  it('does not mistake a guide for the grabbed board when their ids collide', () => {
    useStore.getState().addBoard();
    const board = worldParts(useStore.getState().doc)[0];
    const corner = boardSnapPoints(board)[0];
    useStore.getState().grabSnapPoint(corner);
    useStore.getState().commitSnapMove(guidePoint(board.id, [
      corner.at[0] + 3, corner.at[1], corner.at[2],
    ]));
    expect(worldParts(useStore.getState().doc)[0].position[0]).toBe(board.position[0] + 3);
  });
});

describe('guide actions', () => {
  it('appends a guide at the given position', () => {
    useStore.getState().addGuide([1, 2, 3]);
    expect(useStore.getState().doc.guides).toHaveLength(1);
    expect(useStore.getState().doc.guides[0].at).toEqual([1, 2, 3]);
  });

  it('removes one guide by id and leaves the rest', () => {
    useStore.getState().addGuide([1, 0, 0]);
    useStore.getState().addGuide([2, 0, 0]);
    const [first, second] = useStore.getState().doc.guides;
    useStore.getState().removeGuide(first.id);
    expect(useStore.getState().doc.guides.map((g) => g.id)).toEqual([second.id]);
  });

  it('clears every guide', () => {
    useStore.getState().addGuide([1, 0, 0]);
    useStore.getState().addGuide([2, 0, 0]);
    useStore.getState().clearGuides();
    expect(useStore.getState().doc.guides).toEqual([]);
  });

  it('places guides on the undo stack', () => {
    useStore.getState().addGuide([1, 2, 3]);
    useStore.getState().undo();
    expect(useStore.getState().doc.guides).toEqual([]);
    useStore.getState().redo();
    expect(useStore.getState().doc.guides).toHaveLength(1);
  });

  // Invariant 4's rule: edit() unconditionally pushes an undo snapshot and
  // clears redo, so a no-op must not reach it. Same guard shape as
  // commitSnapMove's zero-delta and removeCut's.
  it('leaves no undo entry when removing a guide that does not exist', () => {
    useStore.getState().addGuide([1, 2, 3]);
    const before = useStore.getState().doc;
    useStore.getState().removeGuide('nope');
    expect(useStore.getState().doc).toBe(before);
  });

  it('leaves no undo entry when clearing an already-empty guide list', () => {
    const before = useStore.getState().doc;
    useStore.getState().clearGuides();
    expect(useStore.getState().doc).toBe(before);
  });

  it('does not touch the board selection', () => {
    useStore.getState().addBoard();
    const selected = useStore.getState().selectedIds;
    useStore.getState().addGuide([1, 2, 3]);
    expect(useStore.getState().selectedIds).toEqual(selected);
  });
});

describe('a turn and the tape anchor (quarter-turns Review Focus 2)', () => {
  const cutBoard = () => {
    useStore.getState().addBoard();
    const id = worldParts(useStore.getState().doc)[0]!.id;
    useStore.getState().addCut(id);
    return id;
  };

  it('a 180 keeps an anchor on a box corner', () => {
    const id = cutBoard();
    const board = worldParts(useStore.getState().doc)[0]!;
    const corner = boardSnapPoints(board).find((p) => p.kind === 'corner')!;
    useStore.getState().setTapeAnchor(corner);
    useStore.getState().setTapeAxis('y');
    useStore.getState().updateBoard(id, { rotation: 180 });
    // The SAME point, not merely some anchor (fu 217), and its axis lock rides with it.
    expect(useStore.getState().tapeAnchor).toEqual(corner);
    expect(useStore.getState().tapeAxis).toBe('y');
    expect(worldParts(useStore.getState().doc)[0]!.rotation).toBe(180);
  });

  it('a 180 drops an anchor on a cut snap point', () => {
    const id = cutBoard();
    const board = worldParts(useStore.getState().doc)[0]!;
    useStore.getState().setTapeAnchor(cutSnapPoints(board)[0]!);
    useStore.getState().setTapeAxis('y');
    useStore.getState().updateBoard(id, { rotation: 180 });
    expect(worldParts(useStore.getState().doc)[0]!.rotation).toBe(180);
    expect(useStore.getState().tapeAnchor).toBeNull();
    expect(useStore.getState().tapeAxis).toBeNull();
  });
});

describe('tapeAnchor — invariant 24, second instance', () => {
  const anchorOn = () => {
    useStore.getState().addBoard();
    const board = worldParts(useStore.getState().doc)[0];
    const point = boardSnapPoints(board)[0];
    useStore.getState().setTapeAnchor(point);
    return board;
  };

  it('holds and clears an anchor', () => {
    const point = { kind: 'guide' as const, at: [1, 2, 3] as [number, number, number], owner: { type: 'guide' as const, id: 'g1' } };
    useStore.getState().setTapeAnchor(point);
    expect(useStore.getState().tapeAnchor).toEqual(point);
    useStore.getState().clearTapeAnchor();
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('drops the anchor when the tool changes', () => {
    anchorOn();
    useStore.getState().setTool('select');
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('drops the anchor on undo and on redo', () => {
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    const first = worldParts(useStore.getState().doc)[0];
    useStore.getState().setTapeAnchor(boardSnapPoints(first)[0]);
    useStore.getState().undo();
    expect(useStore.getState().tapeAnchor).toBeNull();

    // Re-armed with a bare setTapeAnchor, NOT anchorOn(): anchorOn calls
    // addBoard, whose edit() wipes `future`, so redo() would early-return
    // without running its body and the assertion below would say nothing
    // about redo at all. Exactly why the grab test above re-arms with
    // grabSnapPoint rather than with an edit.
    useStore.getState().setTapeAnchor(boardSnapPoints(worldParts(useStore.getState().doc)[0])[0]);
    useStore.getState().redo();
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('drops the anchor when the document is replaced', () => {
    anchorOn();
    useStore.getState().replaceDocument(createDocument('Other'));
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('drops the anchor when its own board is deleted', () => {
    const board = anchorOn();
    useStore.getState().deleteBoard(board.id);
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  // The anchored point here is deliberately NOT anchorOn()'s min corner, which
  // IS `board.position` — growing the length leaves it exactly where it was,
  // so a point-precise clear correctly keeps it. This test passed on that
  // fixture only while updateBoard's clause was board-precise; when that clause
  // was deleted in favour of dropHeldIfGone's survival test, the accident
  // surfaced. Fixture repaired, assertion untouched — the same repair the
  // hover block's own fixture needed one round earlier, and the third instance
  // of this shape in this round.
  it('drops the anchor when its own board moves', () => {
    useStore.getState().addBoard();
    const board = worldParts(useStore.getState().doc)[0];
    const far = boardSnapPoints(board).find((p) => p.at[0] > 0);
    if (!far) throw new Error('fixture: expected a snap point off the min corner');
    useStore.getState().setTapeAnchor(far);
    useStore.getState().updateBoard(board.id, { length: 48 });
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  // The mirror, and the guard for the behaviour the deleted clause got wrong:
  // updateBoard is the only rename path, a rename moves no point, and nulling
  // the anchor takes the hover and the whole readout down with it (TapeTool's
  // anchor effect, then TapeReadout's own early return). So a rename must
  // leave the measurement standing.
  it('keeps the anchor when its own board is only RENAMED', () => {
    const board = anchorOn();
    useStore.getState().updateBoard(board.id, { name: 'Renamed' });
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  it('keeps the anchor when a DIFFERENT board changes', () => {
    const board = anchorOn();
    useStore.getState().addBoard();
    const other = worldParts(useStore.getState().doc).find((b) => b.id !== board.id)!;
    useStore.getState().updateBoard(other.id, { length: 48 });
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  // The two `grabbed` does not need — a grab is never guide-owned, but an
  // anchor can be, and the guides list is not disabled while the tape is
  // anchored, so deleting the guide you anchored on is one click away.
  it('drops a guide-owned anchor when that guide is removed', () => {
    useStore.getState().addGuide([1, 2, 3]);
    const guide = useStore.getState().doc.guides[0];
    useStore.getState().setTapeAnchor({
      kind: 'guide', at: guide.at, owner: { type: 'guide', id: guide.id },
    });
    useStore.getState().removeGuide(guide.id);
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  it('keeps a guide-owned anchor when a DIFFERENT guide is removed', () => {
    useStore.getState().addGuide([1, 2, 3]);
    useStore.getState().addGuide([4, 5, 6]);
    const [first, second] = useStore.getState().doc.guides;
    useStore.getState().setTapeAnchor({
      kind: 'guide', at: first.at, owner: { type: 'guide', id: first.id },
    });
    useStore.getState().removeGuide(second.id);
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  it('drops any anchor when every guide is cleared', () => {
    const board = anchorOn();
    useStore.getState().addGuide([1, 2, 3]);
    useStore.getState().clearGuides();
    expect(useStore.getState().tapeAnchor).toBeNull();
    expect(board).toBeTruthy();
  });

  // Invariant 24's third clause, which this plan predates: a cut edit does not
  // move the board, it can destroy the FEATURE under the held point. An anchor
  // on a shoulder needs the same point-precise clear a grab on one gets.
  it('drops an anchor on a cut shoulder when that cut is removed', () => {
    useStore.getState().addBoard();
    const board = worldParts(useStore.getState().doc)[0];
    useStore.getState().addCut(board.id);
    const cut = worldParts(useStore.getState().doc)[0].cuts[0];
    const shoulder = cutSnapPoints(worldParts(useStore.getState().doc)[0])[0];
    useStore.getState().setTapeAnchor(shoulder);
    useStore.getState().removeCut(board.id, cut.id);
    expect(useStore.getState().tapeAnchor).toBeNull();
  });

  // Point-precise, not blanket: a box corner usually survives a cut edit on
  // the same board, because a mid-face dado touches no box point. This is the
  // same asymmetry dropHeldIfGone already has for grabs — see invariant 24.
  it('keeps an anchor on a box corner when a mid-face cut is added', () => {
    useStore.getState().addBoard();
    const board = worldParts(useStore.getState().doc)[0];
    useStore.getState().setTapeAnchor(boardSnapPoints(board)[0]);
    useStore.getState().addCut(board.id);
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  // No performance claim in the title on purpose (follow-up 126): this pins
  // the BEHAVIOUR — a cut edit with nothing held leaves both fields alone —
  // and says nothing about whether the cell grid was built. The guard-first
  // shape of dropHeldIfGone is verified by reading it, not by this test.
  it('leaves both held points alone when a cut is edited with nothing held', () => {
    useStore.getState().addBoard();
    const board = worldParts(useStore.getState().doc)[0];
    useStore.getState().addCut(board.id);
    expect(useStore.getState().grabbed).toBeNull();
    expect(useStore.getState().tapeAnchor).toBeNull();
  });
});

// Invariant 24's THIRD instance. A hover is normally too transient to hold a
// stale position — the next pointermove re-picks it — but TapeTool LATCHES it
// while anchored, because the only route to typing a distance is off the canvas
// and into the readout. So it can sit unreplaced across any number of edits,
// and a stale one puts a typed guide somewhere the user never pointed at.
//
// Every test here is point-precise on purpose. The two "keeps" are the ones
// that matter most: a blanket `tapeHover: null` beside every `tapeAnchor: null`
// would pass every "drops" case below and destroy the latch, which is the whole
// reason the field is in the store.
describe('tapeHover — invariant 24, third instance', () => {
  /**
   * Anchor on one board and latch a hover onto a second. Returns both.
   *
   * The hovered point is deliberately a corner AWAY from the origin, not
   * `boardSnapPoints(to)[0]`. That first point is the min corner, which IS the
   * board's `position` — so growing the board's length leaves it exactly where
   * it was, and a point-precise clear correctly keeps it. A fixture built on
   * it made the "drops when the hovered board is edited" test pass only while
   * the clear was board-precise, and it went on passing for the wrong reason
   * once it wasn't. Same shape as the anchor's redo-fixture lesson: fix the
   * fixture, leave the assertion. The surviving-corner case is worth pinning
   * too and now has its own test below.
   */
  const anchorAndHover = () => {
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    const [from, to] = worldParts(useStore.getState().doc);
    const far = boardSnapPoints(to).find((p) => p.at[0] > 0);
    if (!far) throw new Error('fixture: expected a snap point off the min corner');
    useStore.getState().setTapeAnchor(boardSnapPoints(from)[0]);
    useStore.getState().setTapeHover(far);
    return { from, to };
  };

  it('holds and clears a hover', () => {
    useStore.getState().addBoard();
    const point = boardSnapPoints(worldParts(useStore.getState().doc)[0])[0];
    useStore.getState().setTapeHover(point);
    expect(useStore.getState().tapeHover).toEqual(point);
    useStore.getState().setTapeHover(null);
    expect(useStore.getState().tapeHover).toBeNull();
  });

  it('drops the hover when the tool changes', () => {
    anchorAndHover();
    useStore.getState().setTool('select');
    expect(useStore.getState().tapeHover).toBeNull();
  });

  // The traced path this whole block exists for: the ANCHOR's board did not
  // move, so the anchor correctly survives — which is exactly why its survival
  // says nothing about the target being current. Both assertions matter.
  it('drops a latched hover when the HOVERED board is edited', () => {
    const { to } = anchorAndHover();
    useStore.getState().updateBoard(to.id, { length: 48 });
    expect(useStore.getState().tapeHover).toBeNull();
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  // The latch. Editing some third board must leave the measurement intact, or
  // typing a distance becomes a race against every unrelated edit.
  it('keeps a latched hover when a THIRD board is edited', () => {
    anchorAndHover();
    useStore.getState().addBoard();
    const third = worldParts(useStore.getState().doc)[2];
    useStore.getState().updateBoard(third.id, { length: 48 });
    expect(useStore.getState().tapeHover).not.toBeNull();
  });

  // `updateBoard` is also the ONLY rename path — there is no renameBoard — and
  // a rename moves no point. A board-precise clause (the shape `grabbed` uses
  // there) drops the latch here, and TapeTool would go on
  // drawing a marker the readout had already dropped. Hence the survival test.
  it('keeps a latched hover when the hovered board is only RENAMED', () => {
    const { to } = anchorAndHover();
    useStore.getState().updateBoard(to.id, { name: 'Renamed' });
    expect(useStore.getState().tapeHover).not.toBeNull();
  });

  // Point-precision is sharper than "did this board change": the min corner IS
  // the board's position, so growing the length moves every corner except that
  // one. The hover survives because the point survives — which is the rule
  // stated, not a special case.
  it('keeps a latched hover on a corner the edit does not move', () => {
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    const [from, to] = worldParts(useStore.getState().doc);
    useStore.getState().setTapeAnchor(boardSnapPoints(from)[0]);
    const min = boardSnapPoints(to).find((p) => p.at[0] === 0 && p.at[1] === 0 && p.at[2] === 0);
    if (!min) throw new Error('fixture: expected a min-corner snap point');
    useStore.getState().setTapeHover(min);
    useStore.getState().updateBoard(to.id, { length: 48 });
    expect(useStore.getState().tapeHover).not.toBeNull();
  });

  it('drops a latched hover when the hovered board is deleted', () => {
    const { to } = anchorAndHover();
    useStore.getState().deleteBoard(to.id);
    expect(useStore.getState().tapeHover).toBeNull();
  });

  // deleteBoard's mirror of the updateBoard keeps-test. Without it an
  // unconditional `set({ tapeHover: null })` there passes every other case in
  // this block — board-precision is correct at deleteBoard (a deleted board
  // offers no points at all), but only a test says so.
  it('keeps a latched hover when a THIRD board is deleted', () => {
    anchorAndHover();
    useStore.getState().addBoard();
    const third = worldParts(useStore.getState().doc)[2];
    useStore.getState().deleteBoard(third.id);
    expect(useStore.getState().tapeHover).not.toBeNull();
  });

  // dropHeldIfGone's survival test, not a board-id test: a cut edit does not
  // move the board, it destroys the FEATURE under the point.
  it('drops a hover on a cut shoulder when that cut is removed', () => {
    useStore.getState().addBoard();
    const board = worldParts(useStore.getState().doc)[0];
    useStore.getState().addCut(board.id);
    const cut = worldParts(useStore.getState().doc)[0].cuts[0];
    useStore.getState().setTapeHover(cutSnapPoints(worldParts(useStore.getState().doc)[0])[0]);
    useStore.getState().removeCut(board.id, cut.id);
    expect(useStore.getState().tapeHover).toBeNull();
  });

  // The second latch test, and the one that pins point-precision inside
  // dropHeldIfGone itself: a mid-face dado touches no box point, so a hover on
  // a box corner of the very board being cut survives.
  it('keeps a hover on a box corner when a mid-face cut is added to that board', () => {
    useStore.getState().addBoard();
    const board = worldParts(useStore.getState().doc)[0];
    useStore.getState().setTapeHover(boardSnapPoints(board)[0]);
    useStore.getState().addCut(board.id);
    expect(useStore.getState().tapeHover).not.toBeNull();
  });

  // A guide is a snap candidate like any other, so measuring TO one is
  // ordinary — and the guides list stays live while the tape is anchored.
  it('drops a guide-owned hover when that guide is removed', () => {
    useStore.getState().addGuide([1, 2, 3]);
    const guide = useStore.getState().doc.guides[0];
    useStore.getState().setTapeHover({
      kind: 'guide', at: guide.at, owner: { type: 'guide', id: guide.id },
    });
    useStore.getState().removeGuide(guide.id);
    expect(useStore.getState().tapeHover).toBeNull();
  });

  it('keeps a guide-owned hover when a DIFFERENT guide is removed', () => {
    useStore.getState().addGuide([1, 2, 3]);
    useStore.getState().addGuide([4, 5, 6]);
    const [first, second] = useStore.getState().doc.guides;
    useStore.getState().setTapeHover({
      kind: 'guide', at: first.at, owner: { type: 'guide', id: first.id },
    });
    useStore.getState().removeGuide(second.id);
    expect(useStore.getState().tapeHover).not.toBeNull();
  });

  // The three wholesale-rewrite actions. Invariant 24's own test for joining
  // its list is "does this rewrite doc.boards", not "does it touch positions" —
  // every board can move at once, so no per-owner condition would mean
  // anything, and all three null the anchor in the same statement, so the
  // latch is already over.
  it('drops the hover on undo', () => {
    anchorAndHover();
    useStore.getState().undo();
    expect(useStore.getState().tapeHover).toBeNull();
  });

  it('drops the hover on redo', () => {
    anchorAndHover();
    useStore.getState().undo();
    // Re-latched with a bare setTapeHover, NOT via an edit: any edit wipes
    // `future`, so redo() would early-return without running its body and the
    // assertion would say nothing about redo at all. Same trap the anchor's
    // own undo/redo test records.
    useStore.getState().setTapeHover(boardSnapPoints(worldParts(useStore.getState().doc)[0])[0]);
    useStore.getState().redo();
    expect(useStore.getState().tapeHover).toBeNull();
  });

  it('drops the hover when the document is replaced', () => {
    anchorAndHover();
    useStore.getState().replaceDocument(createDocument('Other'));
    expect(useStore.getState().tapeHover).toBeNull();
  });

  // Blanket here, and only defensible because the anchor is cleared blanket in
  // the same statement — no anchor, no latch.
  it('drops any hover when every guide is cleared', () => {
    anchorAndHover();
    useStore.getState().addGuide([1, 2, 3]);
    useStore.getState().clearGuides();
    expect(useStore.getState().tapeHover).toBeNull();
  });

  // No performance claim in the title (follow-up 126): this pins the BEHAVIOUR
  // — a cut edit with nothing held leaves all three fields alone. The
  // guard-first shape of dropHeldIfGone is verified by reading it.
  it('leaves all three held points alone when a cut is edited with nothing held', () => {
    useStore.getState().addBoard();
    const board = worldParts(useStore.getState().doc)[0];
    useStore.getState().addCut(board.id);
    expect(useStore.getState().grabbed).toBeNull();
    expect(useStore.getState().tapeAnchor).toBeNull();
    expect(useStore.getState().tapeHover).toBeNull();
  });
});

// Design §4.2. These are PROHIBITIONS, and they exist because adding
// `tapeAnchor: null` beside every `grabbed: null` is what a tidying pass would
// do. The tape anchors on any board; the Move tool grabs only the selected
// one. Only the second rule has anything to do with selection.
describe('tapeAnchor is NOT cleared by selection changes', () => {
  it('survives selecting a different board', () => {
    useStore.getState().addBoard();
    const first = worldParts(useStore.getState().doc)[0];
    useStore.getState().setTapeAnchor(boardSnapPoints(first)[0]);
    useStore.getState().addBoard();
    const second = worldParts(useStore.getState().doc)[1];
    // addBoard already selected `second`, so select the anchored board first —
    // otherwise the selection never actually moves and the test's title claims
    // more than its fixture does (follow-up 126's shape).
    useStore.getState().selectBoard(first.id);
    useStore.getState().selectBoard(second.id);
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  // addBoard selects what it creates through edit()'s selection callback,
  // which is the path that drops a grab. Measuring from an existing board to a
  // brand-new one is an ordinary thing to want.
  it('survives an edit whose selection callback moves the selection', () => {
    useStore.getState().addBoard();
    const first = worldParts(useStore.getState().doc)[0];
    useStore.getState().setTapeAnchor(boardSnapPoints(first)[0]);
    useStore.getState().addBoard();
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });
});

// `tapeTyped` sits beside three fields invariant 24 governs and is deliberately
// NOT a fourth instance of it: it holds a STRING the user typed, not a world
// position captured at a moment. "3 1/2" means the same thing after any edit,
// so it must survive everything that clears its neighbours. These tests pin
// both halves — the one clear it does have, and the survival that is the whole
// reason its doc comment exists.
describe('tapeTyped — a string, deliberately NOT invariant 24', () => {
  const anchored = () => {
    useStore.getState().addBoard();
    const board = worldParts(useStore.getState().doc)[0];
    useStore.getState().setTool('tape');
    // A corner AWAY from the origin, not `boardSnapPoints(board)[0]` — that
    // first point IS the board's position (the min corner), so growing the
    // length leaves it exactly where it was and the anchor correctly survives.
    // Built on it, the survival test below would pass while asserting nothing,
    // which is the fixture lesson the tapeHover block above already records.
    const far = boardSnapPoints(board).find((p) => p.at[0] > 0);
    if (!far) throw new Error('fixture: expected a snap point off the min corner');
    useStore.getState().setTapeAnchor(far);
    useStore.getState().setTapeTyped('3 1/2');
    return board;
  };

  it('holds what was typed', () => {
    useStore.getState().setTapeTyped('3/4');
    expect(useStore.getState().tapeTyped).toBe('3/4');
  });

  // The one clear it has, and it is about the ENTRY being over rather than
  // about staleness: leaving the tool drops the anchor, so there is no ray left
  // for the number to be a distance along.
  it('is cleared by setTool', () => {
    anchored();
    useStore.getState().setTool('select');
    expect(useStore.getState().tapeTyped).toBe('');
  });

  // The survival half. Editing the anchored board is exactly what clears
  // `tapeAnchor`/`tapeHover` point-precisely — and it must NOT touch the text,
  // or a half-typed number disappears every time an unrelated edit lands.
  it('survives an edit that clears the anchor it was typed for', () => {
    const board = anchored();
    useStore.getState().updateBoard(board.id, { length: 48 });
    expect(useStore.getState().tapeAnchor).toBeNull();
    expect(useStore.getState().tapeTyped).toBe('3 1/2');
  });

  // Undo is on invariant 24's list for all three held positions, for the same
  // captured-position reason. A typed string is not a position.
  it('survives undo', () => {
    anchored();
    useStore.getState().undo();
    expect(useStore.getState().tapeTyped).toBe('3 1/2');
  });
});

// `tapeAxis` sits beside three fields invariant 24 governs and is deliberately
// NOT a fourth instance of it — it holds no world position, so no document edit
// can invalidate it (the same argument `tapeTyped`'s block above makes). What it
// DOES have is a structural rule: an axis with no anchor names no ray, so it
// lives exactly as long as the anchor. Design §3.1.
describe('tapeAxis — a lock, deliberately NOT invariant 24', () => {
  const anchorOn = () => {
    useStore.getState().addBoard();
    const board = worldParts(useStore.getState().doc)[0];
    useStore.getState().setTapeAnchor(boardSnapPoints(board)[0]);
    return board;
  };

  it('locks an axis while anchored', () => {
    anchorOn();
    useStore.getState().setTapeAxis('y');
    expect(useStore.getState().tapeAxis).toBe('y');
  });

  it('toggles off when the same axis is pressed again', () => {
    anchorOn();
    useStore.getState().setTapeAxis('y');
    useStore.getState().setTapeAxis('y');
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('switches directly between axes', () => {
    anchorOn();
    useStore.getState().setTapeAxis('y');
    useStore.getState().setTapeAxis('x');
    expect(useStore.getState().tapeAxis).toBe('x');
  });

  it('refuses to lock with no anchor — an axis with no anchor names no ray', () => {
    useStore.getState().setTapeAxis('x');
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('can always be cleared explicitly, anchor or not', () => {
    anchorOn();
    useStore.getState().setTapeAxis('z');
    useStore.getState().setTapeAxis(null);
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  // THE HALF THAT IS EASY TO GET BACKWARDS, and the one a "clear it everywhere"
  // implementation passes every other test while breaking. Re-anchoring under a
  // lock is design §5.2's first bullet: click a corner, press the axis, click a
  // DIFFERENT corner, type, Enter — the second click retargets the anchor and
  // places nothing. Note what this does not say: the lock does not outlive a
  // commit, because commit() ends with clearTapeAnchor(). See `tapeAxis`'s
  // declaration in store.ts and follow-up 147.
  it('SURVIVES a re-anchor', () => {
    const board = anchorOn();
    useStore.getState().setTapeAxis('y');
    useStore.getState().setTapeAnchor(boardSnapPoints(board)[3]);
    expect(useStore.getState().tapeAxis).toBe('y');
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  it('drops with the anchor when the tool changes', () => {
    anchorOn();
    useStore.getState().setTapeAxis('y');
    useStore.getState().setTool('select');
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('drops with the anchor on an explicit clear', () => {
    anchorOn();
    useStore.getState().setTapeAxis('y');
    useStore.getState().clearTapeAnchor();
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('drops with the anchor on undo and on redo', () => {
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    useStore.getState().setTapeAnchor(boardSnapPoints(worldParts(useStore.getState().doc)[0])[0]);
    useStore.getState().setTapeAxis('x');
    useStore.getState().undo();
    expect(useStore.getState().tapeAxis).toBeNull();

    // Re-armed with a bare setTapeAnchor rather than through an edit: addBoard's
    // edit() wipes `future`, so redo() would early-return without running its
    // body and the assertion below would say nothing about redo. Same reason the
    // tapeAnchor block above re-arms this way.
    useStore.getState().setTapeAnchor(boardSnapPoints(worldParts(useStore.getState().doc)[0])[0]);
    useStore.getState().setTapeAxis('x');
    useStore.getState().redo();
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('drops with the anchor when the document is replaced', () => {
    anchorOn();
    useStore.getState().setTapeAxis('z');
    useStore.getState().replaceDocument(createDocument('Other'));
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('drops with the anchor when the anchored board is deleted', () => {
    const board = anchorOn();
    useStore.getState().setTapeAxis('z');
    useStore.getState().deleteBoard(board.id);
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('drops with the anchor when the anchored guide is removed', () => {
    useStore.getState().addGuide([1, 2, 3]);
    const guide = useStore.getState().doc.guides[0];
    useStore.getState().setTapeAnchor({
      kind: 'guide',
      at: [1, 2, 3],
      owner: { type: 'guide', id: guide.id },
    });
    useStore.getState().setTapeAxis('x');
    useStore.getState().removeGuide(guide.id);
    expect(useStore.getState().tapeAnchor).toBeNull();
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('drops with the anchor when every guide is cleared', () => {
    useStore.getState().addGuide([1, 2, 3]);
    anchorOn();
    useStore.getState().setTapeAxis('x');
    useStore.getState().clearGuides();
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  // dropHeldIfGone is POINT-PRECISE and runs after every updateBoard, addCut,
  // updateCut and removeCut. Both halves matter and only one of them is obvious.
  it('drops with the anchor when an edit takes the anchored point away', () => {
    const board = anchorOn();
    // Chosen BY THE PROPERTY THAT MAKES THE TEST MEAN SOMETHING, not by index.
    // boardSnapPoints(board)[0] is the min corner, which IS board.position, so
    // growing the length leaves it exactly where it was and the point-precise
    // clear correctly KEEPS it — the test would pass while pinning nothing.
    // That is follow-up 141's root cause verbatim: the most obvious point to
    // grab in a fixture is the one point that survives the edit you are testing.
    // A default board is `flat` at rotation 0, so axisDimensions puts `length`
    // on X; any point above the min X therefore moves when the length grows.
    const moves = boardSnapPoints(board).find((p) => p.at[0] > board.position[0])!;
    useStore.getState().setTapeAnchor(moves);
    useStore.getState().setTapeAxis('y');
    useStore.getState().updateBoard(board.id, { length: board.length + 12 });
    expect(useStore.getState().tapeAnchor).toBeNull();
    expect(useStore.getState().tapeAxis).toBeNull();
  });

  it('KEEPS the lock through an edit the anchor survives', () => {
    const board = anchorOn();
    useStore.getState().setTapeAxis('y');
    // The min corner is board.position, which a rename cannot move — and this
    // is the case §3.1 exists to state: the axis drops when the anchor actually
    // drops, not merely when a conditional writer runs.
    useStore.getState().updateBoard(board.id, { name: 'Renamed' });
    expect(useStore.getState().tapeAnchor).not.toBeNull();
    expect(useStore.getState().tapeAxis).toBe('y');
  });

  it('KEEPS the lock when an unrelated board is deleted', () => {
    const board = anchorOn();
    useStore.getState().setTapeAxis('y');
    useStore.getState().addBoard();
    const other = worldParts(useStore.getState().doc).find((b) => b.id !== board.id)!;
    useStore.getState().deleteBoard(other.id);
    expect(useStore.getState().tapeAxis).toBe('y');
  });
});

describe('multi-select — the selection set', () => {
  /** Three boards, nothing selected. */
  const threeBoards = () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    useStore.getState().selectBoard(null);
    const [a, b, c] = worldParts(useStore.getState().doc);
    return { a: a!, b: b!, c: c! };
  };
  const ids = () => useStore.getState().selectedIds;
  const cornerOf = (id: string) =>
    boardSnapPoints(worldParts(useStore.getState().doc).find((x) => x.id === id)!)
      .find((p) => p.kind === 'corner')!;

  it('selectBoard replaces the selection with one part, or clears it', () => {
    const { a, b } = threeBoards();
    useStore.getState().toggleSelected(a.id);
    useStore.getState().selectBoard(b.id);
    expect(ids()).toEqual([b.id]);
    useStore.getState().selectBoard(null);
    expect(ids()).toEqual([]);
  });

  it('toggleSelected adds a part in the order selected, and removes it again', () => {
    const { a, c } = threeBoards();
    useStore.getState().toggleSelected(c.id);
    useStore.getState().toggleSelected(a.id);
    // Insertion order, not document order (spec §2).
    expect(ids()).toEqual([c.id, a.id]);
    useStore.getState().toggleSelected(c.id);
    expect(ids()).toEqual([a.id]);
  });

  it('never holds an id twice', () => {
    const { a, b } = threeBoards();
    useStore.getState().toggleSelected(a.id);
    useStore.getState().toggleSelected(b.id);
    useStore.getState().toggleSelected(a.id);
    useStore.getState().toggleSelected(a.id);
    expect(ids()).toEqual([b.id, a.id]);
  });

  it('selectAll selects every part, in document order', () => {
    const { a, b, c } = threeBoards();
    useStore.getState().toggleSelected(c.id);
    useStore.getState().selectAll();
    expect(ids()).toEqual([a.id, b.id, c.id]);
  });

  it('is view state: no selection change leaves an undo entry', () => {
    const { a, b } = threeBoards();
    const before = useStore.getState().past.length;
    useStore.getState().toggleSelected(a.id);
    useStore.getState().selectAll();
    useStore.getState().selectBoard(b.id);
    expect(useStore.getState().past.length).toBe(before);
  });

  it('undo keeps only the selected parts that still exist', () => {
    const { a, b } = threeBoards();
    useStore.getState().selectAll();
    useStore.getState().undo(); // un-adds c
    expect(ids()).toEqual([a.id, b.id]);
  });

  it('undo keeps the whole selection when every selected part survives', () => {
    const { a, b } = threeBoards();
    useStore.getState().updateBoard(a.id, { length: 30 });
    useStore.getState().toggleSelected(a.id);
    useStore.getState().toggleSelected(b.id);
    useStore.getState().undo(); // un-does the length edit; nothing is removed
    expect(ids()).toEqual([a.id, b.id]);
  });

  it('redo keeps only the selected parts that still exist', () => {
    const { a, b } = threeBoards();
    useStore.getState().deleteBoards([b.id]);
    useStore.getState().undo(); // b is back
    useStore.getState().toggleSelected(a.id);
    useStore.getState().toggleSelected(b.id);
    useStore.getState().redo(); // b is gone again
    expect(ids()).toEqual([a.id]);
  });

  it('deleteBoards removes every named part as ONE undo entry', () => {
    const { a, b, c } = threeBoards();
    useStore.getState().selectAll();
    const before = useStore.getState().past.length;
    useStore.getState().deleteBoards([a.id, c.id]);
    expect(worldParts(useStore.getState().doc).map((x) => x.id)).toEqual([b.id]);
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(ids()).toEqual([b.id]);
    useStore.getState().undo();
    expect(worldParts(useStore.getState().doc).map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  it('deleteBoards with no existing id leaves no undo entry', () => {
    threeBoards();
    const before = useStore.getState().past.length;
    useStore.getState().deleteBoards(['nope']);
    useStore.getState().deleteBoards([]);
    expect(useStore.getState().past.length).toBe(before);
  });

  it('duplicateBoards copies every named part in place as ONE undo entry, names unique, copies selected', () => {
    const { a, b } = threeBoards();
    useStore.getState().updateBoard(a.id, { name: 'Leg', position: [1, 0, 2] });
    useStore.getState().updateBoard(b.id, { name: 'Leg (1)', position: [10, 0, 2] });
    useStore.getState().addCut(a.id);
    const before = useStore.getState().past.length;
    useStore.getState().duplicateBoards([a.id, b.id]);
    const boards = worldParts(useStore.getState().doc);
    const copies = boards.slice(3);
    expect(useStore.getState().past.length).toBe(before + 1);
    // Named against the document AS IT GROWS (invariant 8): naming both
    // against the original boards would give two "Leg (2)".
    expect(copies.map((x) => x.name)).toEqual(['Leg (2)', 'Leg (3)']);
    expect(copies.map((x) => x.position)).toEqual([[1, 0, 2], [10, 0, 2]]);
    expect(ids()).toEqual(copies.map((x) => x.id));
    const sourceCut = boards.find((x) => x.id === a.id)!.cuts[0]!;
    expect(copies[0]!.cuts[0]!.id).not.toBe(sourceCut.id);
    expect({ ...copies[0]!.cuts[0]!, id: '' }).toEqual({ ...sourceCut, id: '' });
  });

  // Review Focus 5, store half.
  it('keeps a held grab when a DIFFERENT selected part is toggled out', () => {
    const { a, b } = threeBoards();
    useStore.getState().toggleSelected(a.id);
    useStore.getState().toggleSelected(b.id);
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().toggleSelected(b.id);
    expect(useStore.getState().grabbed?.owner.id).toBe(a.id);
  });

  it('drops a held grab when its OWNER is toggled out', () => {
    const { a, b } = threeBoards();
    useStore.getState().toggleSelected(a.id);
    useStore.getState().toggleSelected(b.id);
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().toggleSelected(a.id);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('keeps a held grab when another part is toggled IN, or everything is selected', () => {
    const { a, c } = threeBoards();
    useStore.getState().toggleSelected(a.id);
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().toggleSelected(c.id);
    expect(useStore.getState().grabbed?.owner.id).toBe(a.id);
    useStore.getState().selectAll();
    expect(useStore.getState().grabbed?.owner.id).toBe(a.id);
  });

  it('deleteBoards keeps a grab whose owner survives, and drops one whose owner is deleted', () => {
    const { a, b, c } = threeBoards();
    useStore.getState().selectAll();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().deleteBoards([b.id, c.id]);
    expect(useStore.getState().grabbed?.owner.id).toBe(a.id);
    expect(ids()).toEqual([a.id]);
    useStore.getState().deleteBoards([a.id]);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('refuses a snap move when the grabbed board is not among the selected', () => {
    const { a, b, c } = threeBoards();
    useStore.getState().updateBoard(c.id, { position: [40, 0, 0] });
    useStore.getState().toggleSelected(a.id);
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    // Reach past the store's own clearing to build the state under test.
    useStore.setState({ selectedIds: [b.id] });
    const before = useStore.getState().past.length;
    useStore.getState().commitSnapMove(cornerOf(c.id));
    expect(useStore.getState().past.length).toBe(before);
    expect(useStore.getState().grabbed).not.toBeNull();
  });
});

// Invariant 24's prohibition, extended to the two new actions (spec §3). The
// fixture makes the selection really MOVE in each case: a test whose selection
// never changes claims more than its fixture does (follow-up 126's shape).
describe('tape held points are NOT cleared by the new selection actions', () => {
  const anchoredAndLatched = () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    useStore.getState().selectBoard(null);
    const [a, b, c] = worldParts(useStore.getState().doc);
    const far = boardSnapPoints(b!).find((p) => p.at[0] > 0);
    if (!far) throw new Error('fixture: expected a snap point off the min corner');
    useStore.getState().setTapeAnchor(boardSnapPoints(a!)[0]!);
    useStore.getState().setTapeHover(far);
    return { a: a!, b: b!, c: c! };
  };

  it('toggleSelected, in and out, leaves the anchor and the latched hover alone', () => {
    const { a, c } = anchoredAndLatched();
    useStore.getState().toggleSelected(c.id); // [] -> [c]
    useStore.getState().toggleSelected(a.id); // [c] -> [c, a]
    useStore.getState().toggleSelected(a.id); // [c, a] -> [c]
    expect(useStore.getState().tapeAnchor).not.toBeNull();
    expect(useStore.getState().tapeHover).not.toBeNull();
  });

  it('selectAll leaves the anchor and the latched hover alone', () => {
    anchoredAndLatched();
    useStore.getState().selectAll(); // [] -> [a, b, c]
    expect(useStore.getState().tapeAnchor).not.toBeNull();
    expect(useStore.getState().tapeHover).not.toBeNull();
  });
});

describe('multi-select — group edits', () => {
  const board = (id: string) => worldParts(useStore.getState().doc).find((x) => x.id === id)!;

  /** a at the origin, b at [0, 0, 10], c at [40, 0, 0]; a and b selected. */
  const threeForMove = () => {
    useStore.setState({ tool: 'select', grabbed: null });
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    const [a, b, c] = worldParts(useStore.getState().doc);
    useStore.getState().updateBoard(b!.id, { position: [0, 0, 10] });
    useStore.getState().updateBoard(c!.id, { position: [40, 0, 0] });
    useStore.getState().selectBoard(a!.id);
    useStore.getState().toggleSelected(b!.id);
    return { a: a!.id, b: b!.id, c: c!.id };
  };
  /** The min corner — boardSnapPoints' first point IS `position`. */
  const minCornerOf = (id: string) => boardSnapPoints(board(id))[0]!;

  it('updateBoards applies one patch to every named part as ONE undo entry', () => {
    const { a, b } = threeForMove();
    const before = useStore.getState().past.length;
    useStore.getState().updateBoards([a, b], { thickness: 1.5 });
    expect([board(a).thickness, board(b).thickness]).toEqual([1.5, 1.5]);
    expect(useStore.getState().past.length).toBe(before + 1);
    useStore.getState().undo();
    expect([board(a).thickness, board(b).thickness]).toEqual([0.75, 0.75]);
  });

  it('updateBoards leaves each part on its own min corner', () => {
    const { a, b } = threeForMove();
    useStore.getState().updateBoards([a, b], { length: 36 });
    expect(board(a).position).toEqual([0, 0, 0]);
    expect(board(b).position).toEqual([0, 0, 10]);
  });

  it('updateBoards resets grain PER PART when a group switches to a sheet good', () => {
    const { a, b } = threeForMove();
    useStore.getState().updateBoard(a, { grain: 'thickness' });
    useStore.getState().updateBoard(b, { grain: 'width' });
    useStore.getState().updateBoards([a, b], { material: 'plywood' });
    expect(board(a).grain).toBe('length');
    expect(board(b).grain).toBe('width');
  });

  it('updateBoards ignores unknown ids, and leaves no undo entry when none exist', () => {
    const { a } = threeForMove();
    const before = useStore.getState().past.length;
    useStore.getState().updateBoards(['nope'], { length: 30 });
    expect(useStore.getState().past.length).toBe(before);
    useStore.getState().updateBoards([a, 'nope'], { length: 30 });
    expect(board(a).length).toBe(30);
  });

  it('updateBoards drops a grab owned by a NON-FIRST member (board-precise clause)', () => {
    const { a, b } = threeForMove();
    useStore.getState().setTool('move');
    useStore.getState().grabSnapPoint(minCornerOf(b));
    expect(useStore.getState().grabbed).not.toBeNull();
    useStore.getState().updateBoards([a, b], { material: 'plywood' });
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('updateBoards drops a latched hover on ANY edited member whose point moved', () => {
    const { a, b, c } = threeForMove();
    const far = boardSnapPoints(board(b)).find((p) => p.at[0] > 0)!;
    useStore.getState().setTapeAnchor(minCornerOf(c));
    useStore.getState().setTapeHover(far);
    useStore.getState().updateBoards([a, b], { length: 36 });
    expect(useStore.getState().tapeHover).toBeNull();
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  it('a group snap move translates every selected part by the exact delta, as ONE undo entry', () => {
    const { a, b, c } = threeForMove();
    const before = useStore.getState().past.length;
    useStore.getState().grabSnapPoint(minCornerOf(a)); // [0, 0, 0]
    useStore.getState().commitSnapMove(minCornerOf(c)); // [40, 0, 0]
    expect(board(a).position).toEqual([40, 0, 0]);
    expect(board(b).position).toEqual([40, 0, 10]);
    expect(board(c).position).toEqual([40, 0, 0]);
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(useStore.getState().selectedIds).toEqual([a, b]);
    expect(useStore.getState().grabbed).toBeNull();
    useStore.getState().undo();
    expect(board(a).position).toEqual([0, 0, 0]);
    expect(board(b).position).toEqual([0, 0, 10]);
  });

  it('does not round a group snap move (invariant 25)', () => {
    const { a, b, c } = threeForMove();
    useStore.getState().updateBoard(c, { position: [40.01, 0, 0] });
    useStore.getState().grabSnapPoint(minCornerOf(a));
    useStore.getState().commitSnapMove(minCornerOf(c));
    expect(board(a).position[0]).toBe(40.01);
    expect(board(b).position[0]).toBe(40.01);
  });

  it('refuses a target on ANY selected part, keeping the grab and leaving no undo entry', () => {
    const { a, b } = threeForMove();
    const before = useStore.getState().past.length;
    useStore.getState().grabSnapPoint(minCornerOf(a));
    useStore.getState().commitSnapMove(minCornerOf(b)); // b moves with the grab: never a target
    expect(board(a).position).toEqual([0, 0, 0]);
    expect(board(b).position).toEqual([0, 0, 10]);
    expect(useStore.getState().past.length).toBe(before);
    expect(useStore.getState().grabbed).not.toBeNull();
  });

  it('moveGroupTo lands the group min corner on the 1/16in grid', () => {
    const { a, b } = threeForMove(); // group min [0, 0, 0]
    useStore.getState().moveGroupTo([a, b], [3.03, 0, 0]); // rounds to 3
    expect(board(a).position).toEqual([3, 0, 0]);
    expect(board(b).position).toEqual([3, 0, 10]);
  });

  it('moveGroupTo measures from the GROUP min corner, not from the first part', () => {
    const { a, b } = threeForMove();
    useStore.getState().updateBoard(a, { position: [5, 0, 0] }); // b (x = 0) is now the min on x
    useStore.getState().moveGroupTo([a, b], [2, 0, 0]);
    expect(board(b).position[0]).toBe(2);
    expect(board(a).position[0]).toBe(7);
  });

  // Review Focus 4.
  it('moveGroupTo moves an off-grid part by exactly the group delta, leaving it off-grid', () => {
    const { a, b } = threeForMove();
    useStore.getState().updateBoard(b, { position: [5.01, 0, 10] }); // off-grid, NOT the min
    useStore.getState().moveGroupTo([a, b], [2.5, 0, 0]); // group min 0 -> 2.5, so the delta is 2.5
    expect(board(a).position[0]).toBe(2.5);
    expect(board(b).position[0]).toBe(5.01 + 2.5);
    expect(Number.isInteger(board(b).position[0] / (1 / 16))).toBe(false);
  });

  it('one gizmo drag is one undo entry; the target is absolute; a zero move leaves none', () => {
    const { a, b } = threeForMove();
    const before = useStore.getState().past.length;
    useStore.getState().moveGroupTo([a, b], [0, 0, 0]); // already there
    expect(useStore.getState().past.length).toBe(before);
    useStore.getState().beginGesture();
    useStore.getState().moveGroupTo([a, b], [1, 0, 0]);
    useStore.getState().moveGroupTo([a, b], [2, 0, 0]);
    useStore.getState().moveGroupTo([a, b], [2, 0, 0]); // same target again: no further move
    useStore.getState().endGesture();
    expect(board(a).position).toEqual([2, 0, 0]);
    expect(board(b).position).toEqual([2, 0, 10]);
    expect(useStore.getState().past.length).toBe(before + 1);
  });
});

describe('hide and unhide', () => {
  const three = () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    const [a, b, c] = worldParts(useStore.getState().doc).map((x) => x.id);
    useStore.getState().selectBoard(a!);
    useStore.getState().toggleSelected(b!);
    return { a: a!, b: b!, c: c! };
  };
  const st = () => useStore.getState();
  const corner = (id: string) =>
    boardSnapPoints(worldParts(st().doc).find((x) => x.id === id)!).find((p) => p.kind === 'corner')!;

  it('hideSelected hides the selection and deselects it', () => {
    const { a, b } = three();
    st().hideSelected();
    expect(st().hiddenIds).toEqual([a, b]);
    expect(st().selectedIds).toEqual([]);
  });

  it('hideUnselected hides every part not selected, and keeps the selection', () => {
    const { a, b, c } = three();
    st().hideUnselected();
    expect(st().hiddenIds).toEqual([c]);
    expect(st().selectedIds).toEqual([a, b]);
  });

  it('hideUnselected with nothing selected does nothing (it would hide everything)', () => {
    three();
    st().selectBoard(null);
    const before = st().past.length;
    st().hideUnselected();
    expect(st().hiddenIds).toEqual([]);
    expect(st().past.length).toBe(before);
  });

  it('redo keeps the hidden set in the entry it pushes to past', () => {
    const { a, b } = three();
    // An edit between the toggles keeps them two entries (a run is one, fu 214).
    st().setHidden(a, true);
    st().updateBoard(b, { length: 30 });
    st().setHidden(b, true);
    st().undo();
    st().undo();
    st().undo();
    st().redo();
    st().redo();
    st().redo();
    st().undo();
    expect(st().hiddenIds).toEqual([a]);
  });

  it('showAll empties the set; setHidden toggles one part; no duplicates', () => {
    const { a, c } = three();
    st().setHidden(c, true);
    st().setHidden(c, true);
    expect(st().hiddenIds).toEqual([c]);
    st().setHidden(c, false);
    expect(st().hiddenIds).toEqual([]);
    st().hideSelected();
    st().showAll();
    expect(st().hiddenIds).toEqual([]);
    expect(worldParts(st().doc).some((x) => x.id === a)).toBe(true);
  });

  it('a hidden part can never be selected', () => {
    const { a, b, c } = three();
    st().setHidden(c, true);
    st().selectBoard(c);
    expect(st().selectedIds).toEqual([]);
    st().toggleSelected(c);
    expect(st().selectedIds).toEqual([]);
    st().selectAll();
    expect(st().selectedIds).toEqual([a, b]);
  });

  it('hiding the owner of a held Move grab drops it; hiding another part keeps it', () => {
    const { a, b } = three();
    st().setTool('move');
    st().grabSnapPoint(corner(a));
    st().setHidden(b, true);
    expect(st().grabbed).not.toBeNull();
    st().setHidden(a, true);
    expect(st().grabbed).toBeNull();
  });

  it('never clears the tape anchor or hover (invariant 24 prohibition), for every hide and show', () => {
    const { a, b, c } = three();
    st().setTapeAnchor(corner(a));
    st().setTapeHover(corner(a));
    const held = () => {
      expect(st().tapeAnchor).not.toBeNull();
      expect(st().tapeHover).not.toBeNull();
    };
    st().hideSelected();
    expect(st().hiddenIds).toEqual([a, b]);
    held();
    st().showAll();
    expect(st().hiddenIds).toEqual([]);
    held();
    st().selectBoard(b);
    st().hideUnselected();
    expect(st().hiddenIds).toEqual([a, c]);
    held();
    st().setHidden(a, false);
    expect(st().hiddenIds).toEqual([c]);
    held();
    st().setHidden(a, true);
    expect(st().hiddenIds).toEqual([c, a]);
    held();
  });

  it('never changes the document: same object, one undo entry, redo cleared', () => {
    const { b } = three();
    st().updateBoard(b, { length: 30 });
    st().undo();
    expect(st().future.length).toBe(1);
    const doc = st().doc;
    const before = st().past.length;
    st().hideSelected();
    expect(st().doc).toBe(doc);
    expect(st().past.length).toBe(before + 1);
    expect(st().past.at(-1)!.doc).toBe(doc);
    expect(st().future).toEqual([]);
  });

  it('a hide or show that changes nothing pushes nothing', () => {
    three();
    const before = st().past.length;
    st().showAll();
    st().selectBoard(null);
    st().hideSelected();
    expect(st().past.length).toBe(before);
  });

  it('an eye that already matches pushes nothing', () => {
    const { c } = three();
    const before = st().past.length;
    st().setHidden(c, true);
    st().setHidden(c, true);
    expect(st().past.length).toBe(before + 1);
    st().setHidden(c, false);
    const mid = st().past.length;
    st().setHidden(c, false);
    expect(st().past.length).toBe(mid);
  });

  it('undo shows the parts again, redo hides them again', () => {
    const { a, b } = three();
    st().hideSelected();
    st().undo();
    expect(st().hiddenIds).toEqual([]);
    expect(st().selectedIds).toEqual([]); // the selection is not undone
    st().redo();
    expect(st().hiddenIds).toEqual([a, b]);
  });

  it('a redo that re-hides a selected part deselects it and drops its grab', () => {
    const { a } = three();
    st().setHidden(a, true);
    st().undo();
    st().selectBoard(a);
    st().setTool('move');
    st().grabSnapPoint(corner(a));
    st().redo();
    expect(st().hiddenIds).toEqual([a]);
    expect(st().selectedIds).toEqual([]);
    expect(st().grabbed).toBeNull();
  });

  it('undoing a hide keeps held points; undoing an edit still clears them', () => {
    const { a, c } = three();
    st().setTapeAnchor(corner(a));
    st().setTapeHover(corner(a));
    st().setHidden(c, true);
    st().undo();
    expect(st().tapeAnchor).not.toBeNull();
    expect(st().tapeHover).not.toBeNull();
    st().updateBoard(c, { length: 30 });
    st().undo();
    expect(st().tapeAnchor).toBeNull();
  });

  it('undoing an edit restores the set recorded with it', () => {
    const { b, c } = three();
    st().setHidden(c, true);
    st().updateBoard(b, { length: 30 });
    st().showAll();
    st().undo(); // the show
    expect(st().hiddenIds).toEqual([c]);
    st().undo(); // the edit: hidden as it was when the edit was made
    expect(st().hiddenIds).toEqual([c]);
    st().undo(); // the hide
    expect(st().hiddenIds).toEqual([]);
  });

  it('is refused while a gesture is open: nothing changes and no entry is pushed', () => {
    const { a, b } = three();
    const before = st().past.length;
    st().beginGesture();
    st().hideSelected();
    st().hideUnselected();
    st().setHidden(a, true);
    st().endGesture();
    expect(st().hiddenIds).toEqual([]);
    expect(st().selectedIds).toEqual([a, b]);
    expect(st().past.length).toBe(before);
  });

  it('deleting a hidden part removes its id; an undo brings it back visible', () => {
    const { c } = three();
    st().setHidden(c, true);
    st().deleteBoards([c]);
    expect(st().hiddenIds).toEqual([]);
    st().undo();
    expect(worldParts(st().doc).some((x) => x.id === c)).toBe(true);
    expect(st().hiddenIds).toEqual([c]); // the entry recorded it hidden at deletion time
  });

  it('replaceDocument clears the set', () => {
    const { c } = three();
    st().setHidden(c, true);
    st().replaceDocument(createDocument('Other'));
    expect(st().hiddenIds).toEqual([]);
  });

  it('a new part and a copy are visible', () => {
    const { a, b } = three();
    st().setHidden(b, true);
    st().selectBoard(a);
    st().duplicateBoards([a]);
    st().addBoard();
    expect(st().hiddenIds).toEqual([b]);
  });

  it('a part deleted while visible comes back visible on undo', () => {
    const { a } = three();
    st().deleteBoards([a]);
    st().undo();
    expect(st().hiddenIds).toEqual([]);
  });

  it('an entry naming a part its document lacks does not leak that id into the set', () => {
    const { a } = three();
    st().updateBoard(a, { length: 30 });
    const entry = st().past.at(-1)!;
    useStore.setState({ past: [...st().past.slice(0, -1), { ...entry, hiddenIds: ['ghost'] }] });
    st().undo();
    expect(st().hiddenIds).toEqual([]);
  });
});

describe('copyInRow', () => {
  const st = () => useStore.getState();
  const part = (patch: Partial<Board>) => {
    st().addBoard();
    const id = worldParts(st().doc).at(-1)!.id;
    st().updateBoard(id, patch);
    return id;
  };

  it('places copy k at original + k·step·sign on the axis, per copy, never cumulative', () => {
    const a = part({ length: 24, width: 0.1, thickness: 0.75, position: [0, 0, 0] });
    st().copyInRow([a], 11, 2, 1, 0.1);
    const zs = worldParts(st().doc).map((b) => b.position[2]);
    // A cumulative sum of 0.1 ten times is 0.9999999999999999; k·0.1 is 1.
    expect(zs).toEqual([0, ...Array.from({ length: 10 }, (_, i) => 0 + (i + 1) * 0.1 * 1)]);
    expect(worldParts(st().doc).every((b) => b.position[0] === 0 && b.position[1] === 0)).toBe(true);
  });

  it('copies a group as a unit, keeping its exact relative layout', () => {
    const leg = part({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright', position: [0, 0, 0] });
    const rail = part({ length: 16.5, width: 4, thickness: 0.75, posture: 'on-edge', position: [1.75, 22, 0.5] });
    st().copyInRow([leg, rail], 3, 2, -1, 20);
    const byName = (n: string) => worldParts(st().doc).filter((b) => b.name.startsWith(n));
    expect(worldParts(st().doc)).toHaveLength(6);
    const [l0, l1, l2] = worldParts(st().doc).filter((b) => b.posture === 'upright');
    const [r0, r1, r2] = worldParts(st().doc).filter((b) => b.posture === 'on-edge');
    for (const [l, r, k] of [[l0, r0, 0], [l1, r1, 1], [l2, r2, 2]] as const) {
      expect(l!.position).toEqual([0, 0, 0 - k * 20]);
      expect(r!.position).toEqual([1.75, 22, 0.5 - k * 20]);
    }
    expect(byName('Board').length).toBe(6);
    // Originals, then the copies k-major (fu 220): copy 1 of each part, then copy 2.
    expect(st().selectedIds).toEqual([leg, rail, l1!.id, r1!.id, l2!.id, r2!.id]);
    expect(new Set(worldParts(st().doc).map((b) => b.name)).size).toBe(6);
  });

  it('runs along -X', () => {
    const a = part({ length: 24, width: 3.5, thickness: 0.75, position: [10, 2, 3] });
    st().copyInRow([a], 3, 0, -1, 30);
    expect(worldParts(st().doc).map((b) => b.position)).toEqual([[10, 2, 3], [-20, 2, 3], [-50, 2, 3]]);
  });

  it('runs along Y, keeps turn, posture, material and cuts, and gives fresh ids', () => {
    const a = part({ length: 20, width: 6, thickness: 0.75, rotation: 180, material: 'walnut', position: [0, 5, 0] });
    st().addCut(a);
    st().copyInRow([a], 3, 1, 1, 10);
    const [o, c1, c2] = worldParts(st().doc);
    expect([o!.position[1], c1!.position[1], c2!.position[1]]).toEqual([5, 15, 25]);
    for (const c of [c1!, c2!]) {
      expect(c.rotation).toBe(180);
      expect(c.material).toBe('walnut');
      expect(c.cuts).toHaveLength(1);
      expect(c.cuts[0]!.id).not.toBe(o!.cuts[0]!.id);
      expect(c.id).not.toBe(o!.id);
    }
    expect(new Set(worldParts(st().doc).map((b) => b.name)).size).toBe(3);
  });

  it('is one undo entry and selects the originals then the copies', () => {
    const a = part({ position: [0, 0, 0] });
    const before = st().past.length;
    st().copyInRow([a], 4, 0, 1, 30);
    expect(st().past.length).toBe(before + 1);
    const ids = worldParts(st().doc).map((b) => b.id);
    expect(st().selectedIds).toEqual(ids);
    st().undo();
    expect(worldParts(st().doc).map((b) => b.id)).toEqual([a]);
  });

  it('refuses a bad count, a bad step or no parts, writing nothing', () => {
    const a = part({ position: [0, 0, 0] });
    const doc = st().doc;
    const past = st().past.length;
    st().copyInRow([a], 1, 0, 1, 5);
    st().copyInRow([a], 101, 0, 1, 5);
    st().copyInRow([a], 3, 0, 1, 0);
    st().copyInRow([a], 3, 0, 1, Number.NaN);
    st().copyInRow(['nope'], 3, 0, 1, 5);
    expect(st().doc).toBe(doc);
    expect(st().past.length).toBe(past);
  });

  it('never clears the tape anchor (invariant 24)', () => {
    const a = part({ position: [0, 0, 0] });
    st().setTapeAnchor(boardSnapPoints(worldParts(st().doc)[0]!)[0]!);
    st().copyInRow([a], 3, 0, 1, 30);
    expect(st().tapeAnchor).not.toBeNull();
  });
});

describe('linked parts', () => {
  const st = () => useStore.getState();
  const board = (id: string) => worldParts(st().doc).find((b) => b.id === id)!;
  const leg = (patch: Partial<Board> = {}) => {
    st().addBoard();
    const id = worldParts(st().doc).at(-1)!.id;
    st().updateBoard(id, { length: 28, width: 1.75, thickness: 1.75, posture: 'upright', ...patch });
    return id;
  };

  it('Link: the first selected part wins; position and turn stay each part\'s own; one undo entry', () => {
    const a = leg({ length: 30, position: [0, 0, 0] });
    const b = leg({ position: [10, 0, 0], rotation: 90 });
    st().addCut(a);
    const past = st().past.length;
    st().linkBoards([a, b]);
    expect(st().past.length).toBe(past + 1);
    expect(board(b).length).toBe(30);
    expect(board(b).cuts.map((c) => c.id)).toEqual(board(a).cuts.map((c) => c.id));
    expect(board(b).cuts[0]).not.toBe(board(a).cuts[0]);
    expect(board(b).position).toEqual([10, 0, 0]);
    expect(board(b).rotation).toBe(90);
    expect(board(a).shape).toBeDefined();
    expect(board(b).shape).toBe(board(a).shape);
  });

  it('Link brings a selected part\'s WHOLE link, unselected members included (Review Focus 1)', () => {
    const a = leg({ length: 30 });
    const b = leg();
    const c = leg();
    st().linkBoards([b, c]);
    st().linkBoards([a, b]);
    expect([a, b, c].map((id) => board(id).length)).toEqual([30, 30, 30]);
    expect(new Set([a, b, c].map((id) => board(id).shape)).size).toBe(1);
    expect(board(a).shape).toBeDefined();
  });

  it('a propagated posture change pivots each member about its OWN centre (Review Focus 2)', () => {
    const a = leg({ position: [0, 0, 0] });
    const b = leg({ position: [20, 0, 5], rotation: 90 });
    st().linkBoards([a, b]);
    const centre = (id: string) => { const x = board(id); const e = boardExtents(x); return [x.position[0] + e[0] / 2, x.position[2] + e[2] / 2]; };
    const before = [centre(a), centre(b)];
    st().updateBoard(a, { posture: 'flat' });
    expect(board(b).posture).toBe('flat');
    expect([centre(a), centre(b)]).toEqual(before);
  });

  // Added beyond the brief: the test above links two parts that already share a
  // posture, so it never sees linkBoards itself change one. This one does, so
  // linkBoards taking the source's values by plain spread (no pivot) goes red.
  it('Link pivots a member whose posture it changes about that member\'s OWN centre', () => {
    const a = leg({ position: [0, 0, 0], posture: 'flat' });
    const b = leg({ position: [20, 0, 5], rotation: 90 });
    const centre = (id: string) => { const x = board(id); const e = boardExtents(x); return [x.position[0] + e[0] / 2, x.position[2] + e[2] / 2]; };
    const before = centre(b);
    st().linkBoards([a, b]);
    expect(board(b).posture).toBe('flat');
    expect(centre(b)).toEqual(before);
  });

  it('propagates shared edits to every member — hidden too — as one undo entry; own fields do not', () => {
    const a = leg();
    const b = leg();
    const c = leg();
    st().linkBoards([a, b, c]);
    st().setHidden(c, true);
    const past = st().past.length;
    st().updateBoard(a, { length: 33, material: 'walnut' });
    expect(st().past.length).toBe(past + 1);
    expect([a, b, c].map((id) => board(id).length)).toEqual([33, 33, 33]);
    expect(board(c).material).toBe('walnut');
    // A shared field rides along so propagation actually fires: with own fields
    // alone the mates are never touched, and the full-patch mutation survives.
    st().updateBoard(a, { name: 'Only A', position: [99, 0, 0], rotation: 180, length: 34 });
    expect(board(b).length).toBe(34);
    expect(board(b).name).not.toBe('Only A');
    expect(board(b).position[0]).not.toBe(99);
    expect(board(b).rotation).not.toBe(180);
  });

  it('cut add / edit / remove reach every member with the same cut id', () => {
    const a = leg();
    const b = leg();
    st().linkBoards([a, b]);
    st().addCut(b);
    const id = board(b).cuts[0]!.id;
    expect(board(a).cuts.map((c) => c.id)).toEqual([id]);
    st().updateCut(a, id, { depth: 0.5 });
    expect(board(b).cuts[0]!.depth).toBe(0.5);
    st().removeCut(b, id);
    expect(board(a).cuts).toEqual([]);
  });

  it('a group edit reaches unselected members of the selected parts\' links', () => {
    const a = leg();
    const b = leg();
    const x = leg();
    const y = leg();
    st().linkBoards([a, b]);
    st().updateBoards([a, x], { thickness: 2 });
    expect(board(b).thickness).toBe(2);
    expect(board(y).thickness).toBe(1.75);
  });

  it('Unlink keeps values; unlinking or deleting one of two dissolves the other', () => {
    const a = leg({ length: 30 });
    const b = leg();
    st().linkBoards([a, b]);
    st().unlinkBoards([b]);
    expect('shape' in board(b)).toBe(false);
    expect('shape' in board(a)).toBe(false);
    expect(board(b).length).toBe(30);
    const c = leg();
    st().linkBoards([a, c]);
    st().deleteBoards([c]);
    expect('shape' in board(a)).toBe(false);
    expect(st().doc.shapes).toEqual([]);
  });

  it('Duplicate and Copy in a row copies join the link', () => {
    const a = leg();
    const b = leg();
    st().linkBoards([a, b]);
    st().duplicateBoards([a]);
    st().copyInRow([a], 3, 0, 1, 5);
    const label = board(a).shape;
    expect(label).toBeDefined();
    expect(worldParts(st().doc).filter((x) => x.shape === label)).toHaveLength(5);
  });

  // Added beyond the brief (Task 1 review): copyBoard must never introduce a
  // `shape` (or legacy `link`) key on a copy of an unlinked part.
  it('a Duplicate or Copy in a row copy of an UNLINKED part has no shape key', () => {
    const a = leg();
    st().duplicateBoards([a]);
    st().copyInRow([a], 2, 0, 1, 5);
    const copies = worldParts(st().doc).filter((x) => x.id !== a);
    expect(copies).toHaveLength(2);
    for (const copy of copies) expect('shape' in copy || 'link' in copy).toBe(false);
    for (const stored of st().doc.boards) expect('shape' in stored || 'link' in stored).toBe(false);
  });

  // Review fix: a copy of a linked part joins the link, so it must keep the
  // source's cut ids, or cut edits skip it. Since links are shapes, a copy
  // names the shape and the cuts live there once.
  it('copies of a linked part WITH CUTS keep its cut ids, so cut edits reach them and nothing needs repair', () => {
    const a = leg();
    const b = leg();
    st().linkBoards([a, b]);
    st().addCut(a);
    const id = board(a).cuts[0]!.id;
    st().duplicateBoards([a]);
    st().copyInRow([b], 3, 0, 1, 5);
    const label = board(a).shape;
    expect(label).toBeDefined();
    const members = () => worldParts(st().doc).filter((x) => x.shape === label);
    expect(members()).toHaveLength(5);
    for (const m of members()) expect(m.cuts.map((c) => c.id)).toEqual([id]);
    // Every member is one storage of the cut: one shape holding it, every stored part naming it.
    expect(st().doc.shapes.map((x) => [x.id, x.cuts.map((c) => c.id)])).toEqual([[label, [id]]]);
    expect(st().doc.boards.every((x) => 'shape' in x && x.shape === label)).toBe(true);
    st().updateCut(a, id, { depth: 0.5 });
    for (const m of members()) expect(m.cuts[0]!.depth).toBe(0.5);
    const copy = members().at(-1)!.id;
    st().removeCut(copy, id);
    for (const m of members()) expect(m.cuts).toEqual([]);
  });

  it('copies of an UNLINKED part with cuts still get fresh cut ids', () => {
    const a = leg();
    st().addCut(a);
    const id = board(a).cuts[0]!.id;
    st().duplicateBoards([a]);
    st().copyInRow([a], 2, 0, 1, 5);
    const copies = worldParts(st().doc).filter((x) => x.id !== a);
    expect(copies).toHaveLength(2);
    for (const c of copies) expect(c.cuts[0]!.id).not.toBe(id);
  });

  it('selectLinked selects every visible member', () => {
    const a = leg();
    const b = leg();
    const c = leg();
    st().linkBoards([a, b, c]);
    st().setHidden(c, true);
    st().selectLinked(a);
    expect(st().selectedIds).toEqual([a, b]);
  });

  it('undo after Link restores values AND the absent shapes (Review Focus 3)', () => {
    const a = leg({ length: 30 });
    const b = leg();
    st().linkBoards([a, b]);
    st().undo();
    expect(board(b).length).toBe(28);
    expect('shape' in board(b)).toBe(false);
    expect(st().doc.shapes).toEqual([]);
  });

  it('invariant 24: a tape anchor on another member\'s cut drops when a propagated cut edit moves it', () => {
    const a = leg();
    const b = leg();
    st().linkBoards([a, b]);
    st().addCut(a);
    const cutPt = cutSnapPoints(board(b))[0]!;
    st().setTapeAnchor(cutPt);
    st().updateCut(a, board(a).cuts[0]!.id, { offset: 3 });
    expect(st().tapeAnchor).toBeNull();
    const corner = boardSnapPoints(board(b)).find((p) => p.kind === 'corner')!;
    st().setTapeAnchor(corner);
    st().updateCut(a, board(a).cuts[0]!.id, { offset: 4 });
    expect(st().tapeAnchor).not.toBeNull();
  });

  // Added beyond the brief: the cut test above never reaches updateBoards' own
  // dropHeldIfGone loop over the mates. An upright leg's length is vertical, so
  // a TOP corner of the other member moves when a propagated Length lands.
  it('invariant 24: a tape anchor on another member\'s top corner drops when a propagated Length moves it', () => {
    const a = leg();
    const b = leg({ position: [10, 0, 0] });
    st().linkBoards([a, b]);
    const top = Math.max(...boardSnapPoints(board(b)).map((p) => p.at[1]));
    const corner = boardSnapPoints(board(b)).find((p) => p.kind === 'corner' && p.at[1] === top)!;
    st().setTapeAnchor(corner);
    st().updateBoard(a, { length: 40 });
    expect(board(b).length).toBe(40);
    expect(st().tapeAnchor).toBeNull();
  });
});

describe('duplicateBoards edges (fu 211)', () => {
  const st = () => useStore.getState();
  const two = () => {
    st().addBoard(); st().addBoard();
    return worldParts(st().doc).map((b) => b.id) as [string, string];
  };

  it('a repeated id is copied once', () => {
    const [a] = two();
    const before = worldParts(st().doc).length;
    st().duplicateBoards([a, a, a]);
    expect(worldParts(st().doc)).toHaveLength(before + 1);
    expect(st().selectedIds).toHaveLength(1);
  });

  it('drops a grab owned by an original: the selection moves to the copies', () => {
    const [a] = two();
    st().selectBoard(a);
    st().setTool('move');
    st().grabSnapPoint(boardSnapPoints(worldParts(st().doc).find((b) => b.id === a)!)[0]!);
    expect(st().grabbed).not.toBeNull();
    st().duplicateBoards([a]);
    expect(st().selectedIds).not.toContain(a);
    expect(st().grabbed).toBeNull();
  });
});

describe('copyInRow sign (fu 220)', () => {
  const st = () => useStore.getState();
  it.each([0, 2, -2, 0.5, Number.NaN])('refuses sign %s: no copies, no undo entry', (sign) => {
    st().addBoard();
    const a = worldParts(st().doc)[0]!.id;
    const doc = st().doc;
    const entries = st().past.length;
    st().copyInRow([a], 3, 0, sign as never, 5);
    expect(st().doc).toBe(doc);
    expect(st().past.length).toBe(entries);
  });
  it('still accepts -1', () => {
    st().addBoard();
    const a = worldParts(st().doc)[0]!;
    st().copyInRow([a.id], 2, 0, -1, 5);
    expect(worldParts(st().doc)[1]!.position[0]).toBe(a.position[0] - 5);
  });
});

describe('a run of eye toggles is one undo entry (fu 214)', () => {
  const st = () => useStore.getState();
  const ids = () => {
    st().addBoard(); st().addBoard(); st().addBoard();
    return worldParts(st().doc).map((b) => b.id) as [string, string, string];
  };

  it('consecutive hides and shows share one entry; one undo restores the set before the run', () => {
    const [a, b, c] = ids();
    const base = st().past.length;
    st().setHidden(a, true);
    st().setHidden(b, true);
    st().setHidden(c, true);
    st().setHidden(b, false);
    expect(st().hiddenIds).toEqual([a, c]);
    expect(st().past.length).toBe(base + 1);
    st().undo();
    expect(st().hiddenIds).toEqual([]);
    expect(st().past.length).toBe(base);
    st().redo();
    expect(st().hiddenIds).toEqual([a, c]);
  });

  it('an edit between two toggles ends the run', () => {
    const [a, b] = ids();
    st().setHidden(a, true);
    st().updateBoard(b, { length: 30 });
    st().setHidden(b, true);
    st().undo();
    expect(st().hiddenIds).toEqual([a]);
    st().undo(); // the edit
    st().undo(); // the first hide
    expect(st().hiddenIds).toEqual([]);
  });

  it('an undo and a redo each end the run', () => {
    const [a, b] = ids();
    st().setHidden(a, true);
    st().undo();
    st().setHidden(b, true);
    st().setHidden(a, true);
    st().undo();
    expect(st().hiddenIds).toEqual([]);
    st().redo();
    expect(st().hiddenIds).toEqual([b, a]);
    st().setHidden(b, false);
    st().undo();
    expect(st().hiddenIds).toEqual([b, a]); // the post-redo toggle is its own entry
  });

  it('an undo of a LATER entry ends the run: hide A, edit B, undo, hide B, undo leaves A hidden', () => {
    const [a, b] = ids();
    st().setHidden(a, true);
    st().updateBoard(b, { length: 30 });
    st().undo(); // the edit: the hide's entry is on top of `past` again
    st().setHidden(b, true);
    st().undo();
    expect(st().hiddenIds).toEqual([a]);
    st().undo();
    expect(st().hiddenIds).toEqual([]);
  });

  it('an undo of a Group ends the run too (the editRekeyed path)', () => {
    const [a, b, c] = ids();
    st().setHidden(a, true);
    st().toggleSelected(b);
    st().toggleSelected(c);
    st().groupSelected();
    st().undo(); // the group
    st().setHidden(b, true);
    st().undo();
    expect(st().hiddenIds).toEqual([a]);
  });

  it('a redo of a later entry ends the run: the toggle after it is its own entry', () => {
    const [a, b] = ids();
    st().setHidden(a, true);
    st().updateBoard(b, { length: 30 });
    st().undo();
    st().redo(); // the edit again; its entry is on top, the run entry beneath
    st().undo(); // back under the hide's entry
    st().redo();
    st().setHidden(b, true);
    st().undo();
    expect(st().hiddenIds).toEqual([a]);
  });

  it('a run that ends where it began leaves no entry', () => {
    const [a] = ids();
    const base = st().past.length;
    st().setHidden(a, true);
    st().setHidden(a, false);
    expect(st().past.length).toBe(base);
  });

  it('a toggle during a gesture is still refused and does not end or join the run', () => {
    const [a, b, c] = ids();
    st().setHidden(a, true);
    st().beginGesture();
    st().setHidden(b, true);
    st().endGesture();
    st().setHidden(c, true);
    expect(st().hiddenIds).toEqual([a, c]);
    st().undo();
    expect(st().hiddenIds).toEqual([]);
  });

  it('does not push real edits out of history: 59 toggles cost one entry', () => {
    const [a] = ids();
    st().updateBoard(a, { length: 30 });
    const base = st().past.length;
    for (let i = 0; i < 59; i += 1) st().setHidden(a, i % 2 === 0);
    expect(st().hiddenIds).toEqual([a]);
    expect(st().past.length).toBe(base + 1);
  });
});

describe('edit() with nothing changed (fu 231)', () => {
  const st = () => useStore.getState();

  it('an edit that returns the same document pushes no undo entry and clears no redo', () => {
    st().addBoard();
    const b = worldParts(st().doc)[0]!;
    st().updateBoard(b.id, { length: b.length + 1 });
    st().undo();
    expect(st().future).toHaveLength(1);
    const past = st().past.length;
    const doc = st().doc;
    st().updateBoard(b.id, { length: b.length }); // same value: mapWorld returns the document
    expect(st().doc).toBe(doc);
    expect(st().past).toHaveLength(past);
    expect(st().future).toHaveLength(1);
  });

  it('does not end a run of eye toggles (fu 214): the run still shares one entry afterwards', () => {
    st().addBoard();
    st().addBoard();
    const [a, c] = st().doc.boards.map((x) => x.id);
    const past = st().past.length;
    st().setHidden(a!, true);
    expect(st().past).toHaveLength(past + 1);
    const b = worldParts(st().doc)[0]!;
    st().updateBoard(b.id, { length: b.length }); // a no-op between the toggles
    st().setHidden(c!, true);
    expect(st().past).toHaveLength(past + 1);
    st().undo();
    expect(st().hiddenIds).toEqual([]);
  });
});
