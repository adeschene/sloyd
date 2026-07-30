import { useStore } from './store';
import { createBoard, createDocument } from '../document/document';

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
    useStore.getState().updateBoard(id, { standing: true });
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

  it('keeps the footprint centred when standing is toggled on a board already turned', () => {
    const id = aBoard();
    useStore.getState().updateBoard(id, { rotation: 90 });
    useStore.getState().updateBoard(id, { standing: true });
    expect(board().rotation).toBe(90);
    expect(board().standing).toBe(true);
    expect(board().position).toEqual([21.625, 0, -5.25]);
  });

  it('keeps the footprint centred when rotation is changed on a board already standing', () => {
    const id = aBoard();
    useStore.getState().updateBoard(id, { standing: true });
    useStore.getState().updateBoard(id, { rotation: 90 });
    expect(board().rotation).toBe(90);
    expect(board().standing).toBe(true);
    expect(board().position).toEqual([21.625, 0, -5.25]);
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
