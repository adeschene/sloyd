import { create } from 'zustand';
import { createBoard, createDocument, reorientedPosition, uniqueName, isSheetGood, nextId } from '../document/document';
import type { Board, Cut, SloydDocument } from '../document/document';

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

  addCut: (boardId: string) => void;
  updateCut: (boardId: string, cutId: string, patch: Partial<Cut>) => void;
  removeCut: (boardId: string, cutId: string) => void;
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
      // changing rotation or posture swaps the extents underneath a pinned
      // corner — which is what made a 24 x 5-1/2 board jump sideways when it
      // turned. The arithmetic lives in document/geometry.ts; doing it here,
      // once, is what stops every future call site having to remember it. An
      // explicit position in the same patch wins.
      // `patch` is passed straight through as reorientedPosition's `changes`,
      // not reconstructed into a narrower object. `changes` used to be limited
      // to `{ rotation, posture }` because an earlier version built it with
      // both keys always present, and an explicit `key: undefined` overwrites
      // in a spread rather than falling through — but reconstructing it that
      // way also silently dropped any dimension change (length/width/thickness)
      // bundled into the same patch, so the pivot got computed from the
      // board's stale extents. `patch` itself is just as safe from the
      // undefined-overwrite trap: it only ever carries keys its caller
      // actually set, same as the old reconstruction did, but it also carries
      // the dimension keys reorientedPosition now needs.
      // Grain is deliberately absent: it changes which faces show which cut,
      // not the board's extents, so it needs no pivot.
      const reorienting =
        (patch.rotation !== undefined && patch.rotation !== current.rotation) ||
        (patch.posture !== undefined && patch.posture !== current.posture);
      const position =
        reorienting && !patch.position
          ? reorientedPosition(current, patch)
          : patch.position;

      // Sheet goods have no 'thickness' grain — see isSheetGood's comment.
      // Switching a board's material to plywood/MDF while its grain is
      // 'thickness' resets grain in this same edit, following the reorient
      // pattern above: doing the derivation once, here, keeps it to one undo
      // entry instead of two (change material, then a second edit to fix
      // grain up) and means no other call site has to remember the rule.
      // Equally important: applying both changes in the same edit means the
      // panel never renders a frame with material: 'plywood' and grain: 'thickness'
      // — it never tries to display a controlled <select value="thickness"> with
      // no matching <option>. A future refactor that decouples the material and
      // grain changes would need to handle this display state explicitly.
      const switchingToSheetGoodWithThicknessGrain =
        patch.material !== undefined &&
        patch.material !== current.material &&
        isSheetGood(patch.material) &&
        (patch.grain ?? current.grain) === 'thickness';

      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) =>
          b.id === id
            ? {
                ...b,
                ...patch,
                ...(position ? { position: [...position] } : {}),
                ...(switchingToSheetGoodWithThicknessGrain ? { grain: 'length' as const } : {}),
              }
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

    /**
     * A quarter-thickness dado in the broad face, a quarter of the way along.
     * Chosen to be visible and legal on any board rather than to be a common
     * joint: it is a starting point to edit, and every number in it is a
     * fraction of the board's own dimensions, so it fits whatever it lands on.
     */
    addCut: (boardId) => {
      const board = get().doc.boards.find((b) => b.id === boardId);
      if (!board) return;
      const cut: Cut = {
        id: nextId(),
        face: 'thickness',
        from: 'max',
        across: 'width',
        offset: board.length / 4,
        width: Math.min(0.75, board.length / 4),
        depth: board.thickness / 2,
      };
      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) =>
          b.id === boardId ? { ...b, cuts: [...b.cuts, cut] } : b,
        ),
      }));
    },

    // Cuts are patched here rather than through updateBoard on purpose:
    // updateBoard reorients when a patch changes rotation or posture, and
    // `cuts` is deliberately absent from that predicate (invariant 2). A cut
    // removes stock from inside the board's AABB — it changes no extent and
    // moves nothing — so a reorient on a cut change would be a no-op pivot.
    //
    // Guarded before edit(), same as updateBoard/deleteBoard/duplicateBoard:
    // an unmatched board or cut id must be a true no-op, not just non-throwing
    // — edit() unconditionally pushes an undo snapshot and clears the redo
    // stack, so calling it on a no-op patch would leave a no-op undo entry
    // (invariant 4) and silently wipe redo.
    updateCut: (boardId, cutId, patch) => {
      const board = get().doc.boards.find((b) => b.id === boardId);
      if (!board || !board.cuts.some((c) => c.id === cutId)) return;
      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) =>
          b.id === boardId
            ? { ...b, cuts: b.cuts.map((c) => (c.id === cutId ? { ...c, ...patch } : c)) }
            : b,
        ),
      }));
    },

    removeCut: (boardId, cutId) => {
      const board = get().doc.boards.find((b) => b.id === boardId);
      if (!board || !board.cuts.some((c) => c.id === cutId)) return;
      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) =>
          b.id === boardId ? { ...b, cuts: b.cuts.filter((c) => c.id !== cutId) } : b,
        ),
      }));
    },
  };
});
