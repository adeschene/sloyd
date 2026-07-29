import { create } from 'zustand';
import { createBoard, createDocument } from '../document/document';
import type { Board, SloydDocument } from '../document/document';

const HISTORY_LIMIT = 50;

interface StoreState {
  doc: SloydDocument;
  selectedId: string | null;
  past: SloydDocument[];
  future: SloydDocument[];

  addBoard: () => void;
  updateBoard: (id: string, patch: Partial<Board>) => void;
  deleteBoard: (id: string) => void;
  duplicateBoard: (id: string) => void;
  selectBoard: (id: string | null) => void;
  setDocumentName: (name: string) => void;
  replaceDocument: (doc: SloydDocument) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useStore = create<StoreState>((set, get) => {
  /**
   * Apply an edit as a new document, pushing the previous one onto the undo
   * stack. Every mutating action funnels through here — that is what keeps
   * undo correct without any per-action bookkeeping.
   */
  const edit = (
    fn: (doc: SloydDocument) => SloydDocument,
    selection?: (doc: SloydDocument) => string | null,
  ) => {
    const { doc, past } = get();
    const next = fn(doc);
    set({
      doc: next,
      past: [...past, doc].slice(-HISTORY_LIMIT),
      future: [],
      ...(selection ? { selectedId: selection(next) } : {}),
    });
  };

  return {
    doc: createDocument(),
    selectedId: null,
    past: [],
    future: [],

    addBoard: () => {
      const boards = get().doc.boards;
      const last = boards[boards.length - 1];
      const board = createBoard(
        last
          ? { length: last.length, width: last.width, thickness: last.thickness, material: last.material }
          : {},
      );
      edit(
        (doc) => ({ ...doc, boards: [...doc.boards, board] }),
        () => board.id,
      );
    },

    updateBoard: (id, patch) => {
      if (!get().doc.boards.some((b) => b.id === id)) return;
      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) =>
          b.id === id
            ? { ...b, ...patch, ...(patch.position ? { position: [...patch.position] } : {}) }
            : b,
        ),
      }));
    },

    deleteBoard: (id) => {
      if (!get().doc.boards.some((b) => b.id === id)) return;
      const wasSelected = get().selectedId === id;
      edit(
        (doc) => ({ ...doc, boards: doc.boards.filter((b) => b.id !== id) }),
        () => (wasSelected ? null : get().selectedId),
      );
    },

    duplicateBoard: (id) => {
      const source = get().doc.boards.find((b) => b.id === id);
      if (!source) return;
      // Drop the id so createBoard generates a fresh one, and copy the position
      // array rather than sharing the reference with the source and with every
      // undo snapshot that holds it.
      const { id: _sourceId, ...rest } = source;
      const copy = createBoard({
        ...rest,
        position: [...source.position],
        name: `${source.name} copy`,
      });
      edit(
        (doc) => ({ ...doc, boards: [...doc.boards, copy] }),
        () => copy.id,
      );
    },

    // Selection is view state, not document state — deliberately not undoable.
    selectBoard: (id) => set({ selectedId: id }),

    setDocumentName: (name) => edit((doc) => ({ ...doc, name })),

    replaceDocument: (doc) => set({ doc, selectedId: null, past: [], future: [] }),

    undo: () => {
      const { past, future, doc, selectedId } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      const stillThere = previous.boards.some((b) => b.id === selectedId);
      set({
        doc: previous,
        past: past.slice(0, -1),
        future: [doc, ...future].slice(0, HISTORY_LIMIT),
        selectedId: stillThere ? selectedId : null,
      });
    },

    redo: () => {
      const { past, future, doc, selectedId } = get();
      if (future.length === 0) return;
      const next = future[0];
      const stillThere = next.boards.some((b) => b.id === selectedId);
      set({
        doc: next,
        past: [...past, doc].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        selectedId: stillThere ? selectedId : null,
      });
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
  };
});
