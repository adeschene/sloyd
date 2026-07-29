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
    expect(doc.boards[1].name).toBe('Shelf copy');
    expect(selectedId).toBe(doc.boards[1].id);
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
