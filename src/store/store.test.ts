import { useStore } from './store';
import { createBoard, createDocument, boardCenter, boardSnapPoints } from '../document/document';

const reset = () => useStore.getState().replaceDocument(createDocument('Test'));

beforeEach(reset);

describe('addBoard', () => {
  it('appends a board and selects it', () => {
    useStore.getState().addBoard();
    const { doc, selectedId } = useStore.getState();
    expect(doc.boards).toHaveLength(1);
    expect(selectedId).toBe(doc.boards[0].id);
  });

  it('reuses the dimensions of the most recently added board', () => {
    useStore.getState().addBoard();
    const first = useStore.getState().doc.boards[0];
    useStore.getState().updateBoard(first.id, { length: 48, width: 11.25, thickness: 1.5 });
    useStore.getState().addBoard();
    const second = useStore.getState().doc.boards[1];
    expect([second.length, second.width, second.thickness]).toEqual([48, 11.25, 1.5]);
  });

  it('gives each new board a unique name', () => {
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    expect(useStore.getState().doc.boards.map((b) => b.name))
      .toEqual(['Board', 'Board (1)', 'Board (2)']);
  });

  it('reuses a freed number rather than counting upward', () => {
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    const middle = useStore.getState().doc.boards[1].id;
    useStore.getState().deleteBoard(middle);
    useStore.getState().addBoard();
    expect(useStore.getState().doc.boards.map((b) => b.name))
      .toEqual(['Board', 'Board (2)', 'Board (1)']);
  });
});

describe('updateBoard', () => {
  it('patches only the named fields', () => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0].id;
    useStore.getState().updateBoard(id, { length: 30 });
    const b = useStore.getState().doc.boards[0];
    expect(b.length).toBe(30);
    expect(b.width).toBe(5.5);
  });

  it('ignores an unknown id without throwing', () => {
    expect(() => useStore.getState().updateBoard('nope', { length: 1 })).not.toThrow();
  });

  it('copies an incoming position array so later caller mutation cannot corrupt history', () => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0].id;
    const caller: [number, number, number] = [1, 2, 3];
    useStore.getState().updateBoard(id, { position: caller });
    caller[0] = 999;
    expect(useStore.getState().doc.boards[0].position).toEqual([1, 2, 3]);
  });
});

describe('updateBoard reorients a board in place', () => {
  const board = () => useStore.getState().doc.boards[0];

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
    const before = useStore.getState().doc.boards.find((b) => b.id === id)!;
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
  const board = () => useStore.getState().doc.boards[0];

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
    const id = useStore.getState().doc.boards[0].id;
    useStore.getState().deleteBoard(id);
    expect(useStore.getState().doc.boards).toHaveLength(0);
    expect(useStore.getState().selectedId).toBeNull();
  });
});

describe('duplicateBoard', () => {
  it('copies the board with a new id, offset name, and selects the copy', () => {
    useStore.getState().addBoard();
    const orig = useStore.getState().doc.boards[0];
    useStore.getState().updateBoard(orig.id, { name: 'Shelf' });
    useStore.getState().duplicateBoard(orig.id);
    const { doc, selectedId } = useStore.getState();
    expect(doc.boards).toHaveLength(2);
    expect(doc.boards[1].id).not.toBe(orig.id);
    expect(doc.boards[1].name).toBe('Shelf (1)');
    expect(selectedId).toBe(doc.boards[1].id);
  });

  it('names the copy with a numeric suffix, not "copy"', () => {
    useStore.getState().addBoard();
    const source = useStore.getState().doc.boards[0];
    useStore.getState().updateBoard(source.id, { name: 'Leg' });
    useStore.getState().duplicateBoard(source.id);
    expect(useStore.getState().doc.boards.map((b) => b.name)).toEqual(['Leg', 'Leg (1)']);
  });

  it('duplicating a duplicate does not nest suffixes', () => {
    useStore.getState().addBoard();
    const source = useStore.getState().doc.boards[0];
    useStore.getState().updateBoard(source.id, { name: 'Leg' });
    useStore.getState().duplicateBoard(source.id);
    const copy = useStore.getState().doc.boards[1];
    expect(copy.name).toBe('Leg (1)');
    useStore.getState().duplicateBoard(copy.id);
    expect(useStore.getState().doc.boards[2].name).toBe('Leg (2)');
  });

  it('copies cuts by value, not by reference, with fresh ids', () => {
    useStore.getState().addBoard();
    const source = useStore.getState().doc.boards[0];
    useStore.getState().addCut(source.id);
    useStore.getState().duplicateBoard(source.id);
    const { doc } = useStore.getState();
    const src = doc.boards[0];
    const copy = doc.boards[1];

    expect(src.cuts).not.toBe(copy.cuts);
    expect(src.cuts[0]).not.toBe(copy.cuts[0]);
    expect(copy.cuts[0].id).not.toBe(src.cuts[0].id);

    const sourceDepth = src.cuts[0].depth;
    useStore.getState().updateCut(copy.id, copy.cuts[0].id, { depth: 0.5 });
    const after = useStore.getState().doc.boards;
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
    expect(useStore.getState().doc.boards).toHaveLength(0);
    expect(useStore.getState().canRedo()).toBe(true);
  });

  it('redoes an undone add', () => {
    useStore.getState().addBoard();
    useStore.getState().undo();
    useStore.getState().redo();
    expect(useStore.getState().doc.boards).toHaveLength(1);
  });

  it('drops the redo stack once a new edit lands', () => {
    useStore.getState().addBoard();
    useStore.getState().undo();
    useStore.getState().addBoard();
    expect(useStore.getState().canRedo()).toBe(false);
  });

  it('undoes an update back to the previous value', () => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0].id;
    useStore.getState().updateBoard(id, { length: 30 });
    useStore.getState().undo();
    expect(useStore.getState().doc.boards[0].length).toBe(24);
  });

  it('is a no-op when there is nothing to undo', () => {
    expect(() => useStore.getState().undo()).not.toThrow();
    expect(useStore.getState().doc.boards).toHaveLength(0);
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
    expect(s.selectedId).toBeNull();
    expect(s.canUndo()).toBe(false);
  });
});

describe('gesture coalescing', () => {
  it('records one undo entry for a whole gesture', () => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0].id;
    const before = useStore.getState().past.length;

    useStore.getState().beginGesture();
    useStore.getState().updateBoard(id, { position: [1, 0, 0] });
    useStore.getState().updateBoard(id, { position: [2, 0, 0] });
    useStore.getState().updateBoard(id, { position: [3, 0, 0] });
    useStore.getState().endGesture();

    expect(useStore.getState().past.length).toBe(before + 1);
    useStore.getState().undo();
    expect(useStore.getState().doc.boards[0].position).toEqual([0, 0, 0]);
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
    const id = useStore.getState().doc.boards[0].id;
    const before = useStore.getState().past.length;

    useStore.getState().beginGesture();
    useStore.getState().updateBoard(id, { position: [1, 0, 0] });
    useStore.getState().endGesture();

    useStore.getState().beginGesture();
    useStore.getState().updateBoard(id, { position: [2, 0, 0] });
    useStore.getState().endGesture();

    expect(useStore.getState().past.length).toBe(before + 2);
    useStore.getState().undo();
    expect(useStore.getState().doc.boards[0].position).toEqual([1, 0, 0]);
  });
});

describe('cuts', () => {
  const boardId = () => useStore.getState().doc.boards[0].id;
  const cuts = () => useStore.getState().doc.boards[0].cuts;

  beforeEach(() => {
    useStore.setState({ doc: createDocument(), selectedId: null, past: [], future: [] });
    useStore.getState().addBoard();
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
    const before = useStore.getState().doc.boards[0].position;
    useStore.getState().addCut(boardId());
    useStore.getState().updateCut(boardId(), cuts()[0].id, { depth: 0.5 });
    expect(useStore.getState().doc.boards[0].position).toEqual(before);
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
   * a combination the UI cannot produce, since the Move tool only offers the
   * selected board's points. Selecting `a` is what makes the fixture model a
   * state a user can actually reach.
   */
  const twoBoards = () => {
    useStore.setState({
      doc: createDocument(),
      selectedId: null,
      past: [],
      future: [],
      tool: 'select',
      grabbed: null,
    });
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    const [a, b] = useStore.getState().doc.boards;
    useStore.getState().selectBoard(a!.id);
    return { a, b };
  };

  const cornerOf = (id: string) => {
    const board = useStore.getState().doc.boards.find((x) => x.id === id)!;
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

    const moved = useStore.getState().doc.boards.find((x) => x.id === a.id)!;
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
    const moved = useStore.getState().doc.boards.find((x) => x.id === a.id)!;
    expect(moved.position[0]).toBeCloseTo(0.01, 10);
  });

  it('clears the grab and selects the board it moved', () => {
    const { a, b } = twoBoards();
    // b must be moved off a first. Two fresh boards share a default position,
    // so without this the delta is exactly zero and the commit correctly takes
    // the no-op path below instead of the one under test.
    useStore.getState().updateBoard(b.id, { position: [40, 0, 0] });
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().commitSnapMove(cornerOf(b.id));
    expect(useStore.getState().grabbed).toBeNull();
    expect(useStore.getState().selectedId).toBe(a.id);
  });

  it('reverts a whole snap move with one undo', () => {
    const { a, b } = twoBoards();
    useStore.getState().updateBoard(b.id, { position: [40, 0, 0] });
    const before = [...useStore.getState().doc.boards.find((x) => x.id === a.id)!.position];
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().commitSnapMove(cornerOf(b.id));
    useStore.getState().undo();
    expect(useStore.getState().doc.boards.find((x) => x.id === a.id)!.position)
      .toEqual(before);
  });

  it('ignores a target on the grabbed board itself', () => {
    const { a } = twoBoards();
    const corners = boardSnapPoints(useStore.getState().doc.boards[0]!)
      .filter((p) => p.kind === 'corner');
    const before = [...useStore.getState().doc.boards.find((x) => x.id === a.id)!.position];
    useStore.getState().grabSnapPoint(corners[0]!);
    useStore.getState().commitSnapMove(corners[7]!);
    expect(useStore.getState().doc.boards.find((x) => x.id === a.id)!.position)
      .toEqual(before);
    expect(useStore.getState().grabbed).not.toBeNull();
  });

  it('is a no-op with nothing grabbed', () => {
    const { a, b } = twoBoards();
    const undoDepth = useStore.getState().past.length;
    useStore.getState().commitSnapMove(cornerOf(b.id));
    expect(useStore.getState().past.length).toBe(undoDepth);
    expect(useStore.getState().doc.boards.find((x) => x.id === a.id)).toBeDefined();
  });

  it('leaves no undo entry when the two points already coincide', () => {
    const { a, b } = twoBoards();
    const grab = cornerOf(a.id);
    // Move b so its grabbed-kind corner is already where a's is.
    const target = cornerOf(b.id);
    const board = useStore.getState().doc.boards.find((x) => x.id === b.id)!;
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
    const { a, b } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().deleteBoard(b.id);
    expect(useStore.getState().grabbed).not.toBeNull();
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

    useStore.getState().grabSnapPoint(cornerOf(useStore.getState().doc.boards[0]!.id));
    useStore.getState().redo();
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('drops a grab when the document is replaced', () => {
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().replaceDocument(createDocument());
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('cancelGrab clears the grab and moves nothing', () => {
    const { a } = twoBoards();
    const before = [...useStore.getState().doc.boards.find((x) => x.id === a.id)!.position];
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().cancelGrab();
    expect(useStore.getState().grabbed).toBeNull();
    expect(useStore.getState().doc.boards.find((x) => x.id === a.id)!.position)
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
    // not through selectBoard — a second writer of selectedId that nothing
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
});
