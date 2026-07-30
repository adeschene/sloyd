import { create } from 'zustand';
import { createBoard, createDocument, reorientedPosition, uniqueName } from '../document/document';
import type { Board, SloydDocument } from '../document/document';

const HISTORY_LIMIT = 50;

interface StoreState {
  doc: SloydDocument;
  selectedId: string | null;
  past: SloydDocument[];
  future: SloydDocument[];
  /**
   * One-shot signal: the Length field should take focus the next time the
   * Properties panel mounts for the selected board. Set by addBoard() only —
   * selecting a board by clicking it in the list or the viewport must never
   * steal focus into a field. Consumed (and cleared) by the panel that acts
   * on it so it never fires twice.
   */
  pendingLengthFocus: boolean;
  consumeLengthFocus: () => boolean;

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
  beginGesture: () => void;
  endGesture: () => void;
}

export const useStore = create<StoreState>((set, get) => {
  // Coalesce every edit within a gesture (a gizmo drag, a focused text field)
  // into a single undo entry. The snapshot is taken lazily — on the first
  // edit() inside the gesture, not in beginGesture() itself — so that
  // focusing and blurring a field without changing anything leaves no
  // no-op entry on the undo stack.
  let gesturing = false;
  let gestureSnapshotTaken = false;

  /**
   * Apply an edit as a new document, pushing the previous one onto the undo
   * stack. Every mutating action funnels through here — that is what keeps
   * undo correct without any per-action bookkeeping.
   */
  const edit = (
    fn: (doc: SloydDocument) => SloydDocument,
    selection?: (doc: SloydDocument) => string | null,
  ) => {
    const { doc, past, future } = get();
    const next = fn(doc);

    let nextPast = past;
    let nextFuture = future;
    if (!gesturing || !gestureSnapshotTaken) {
      nextPast = [...past, doc].slice(-HISTORY_LIMIT);
      nextFuture = [];
      if (gesturing) gestureSnapshotTaken = true;
    }

    set({
      doc: next,
      past: nextPast,
      future: nextFuture,
      ...(selection ? { selectedId: selection(next) } : {}),
    });
  };

  return {
    doc: createDocument(),
    selectedId: null,
    past: [],
    future: [],
    pendingLengthFocus: false,
    consumeLengthFocus: () => {
      const pending = get().pendingLengthFocus;
      if (pending) set({ pendingLengthFocus: false });
      return pending;
    },

    addBoard: () => {
      const boards = get().doc.boards;
      const last = boards[boards.length - 1];
      const fresh = createBoard(
        last
          ? { length: last.length, width: last.width, thickness: last.thickness, material: last.material }
          : {},
      );
      // createBoard has no view of the document and cannot dedupe — that is
      // the caller's job. See the note on createBoard.
      const board = { ...fresh, name: uniqueName(fresh.name, boards) };
      edit(
        (doc) => ({ ...doc, boards: [...doc.boards, board] }),
        () => board.id,
      );
      set({ pendingLengthFocus: true });
    },

    updateBoard: (id, patch) => {
      const current = get().doc.boards.find((b) => b.id === id);
      if (!current) return;

      // Reorienting turns the board in place. `position` is the min-corner, so
      // changing rotation or standing swaps the extents underneath a pinned
      // corner — which is what made a 24 x 5-1/2 board jump sideways when it
      // turned. The arithmetic lives in document/geometry.ts; doing it here,
      // once, is what stops every future call site having to remember it. An
      // explicit position in the same patch wins.
      // Only include a key here when the patch actually carries it. An object
      // spread with an explicit `key: undefined` overwrites the target key
      // rather than falling through to it, so passing both keys unconditionally
      // would clobber whichever one the patch didn't touch (e.g. toggling
      // `standing` alone on an already-turned board would reset rotation to
      // undefined inside reorientedPosition's own spread).
      const changes: { rotation?: Board['rotation']; standing?: boolean } = {};
      if (patch.rotation !== undefined) changes.rotation = patch.rotation;
      if (patch.standing !== undefined) changes.standing = patch.standing;

      const reorienting =
        (patch.rotation !== undefined && patch.rotation !== current.rotation) ||
        (patch.standing !== undefined && patch.standing !== current.standing);
      const position =
        reorienting && !patch.position
          ? reorientedPosition(current, changes)
          : patch.position;

      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) =>
          b.id === id
            ? { ...b, ...patch, ...(position ? { position: [...position] } : {}) }
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
      const fresh = createBoard({
        ...rest,
        position: [...source.position],
      });
      const copy = { ...fresh, name: uniqueName(source.name, get().doc.boards) };
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

    beginGesture: () => { gesturing = true; gestureSnapshotTaken = false; },
    endGesture: () => { gesturing = false; gestureSnapshotTaken = false; },
  };
});
