import { create } from 'zustand';
import { createBoard, createDocument, reorientedPosition, uniqueName, isSheetGood, nextId, sameSnapPoint, snapPointsFor } from '../document/document';
import type { Board, Cut, SloydDocument, SnapPoint } from '../document/document';

const HISTORY_LIMIT = 50;

/**
 * Which viewport tool has the pointer. View state, not document state — it is
 * never saved and never undone, exactly like `selectedId`.
 */
export type ToolMode = 'select' | 'move';

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

  /**
   * The active viewport tool, and the snap point the Move tool is carrying.
   *
   * Both live here rather than being prop-drilled from App the way
   * `shortcutsSuspended` is. That flag's reasoning — putting one flag into
   * shared state "to save one prop" buys nothing — does not reach these:
   * `tool` has consumers in Toolbar, Viewport, MoveTool and (via one prop)
   * BoardMesh, at three different depths. They are still view state, so they
   * are deliberately outside the document and outside the undo stack.
   */
  tool: ToolMode;
  grabbed: SnapPoint | null;
  setTool: (tool: ToolMode) => void;
  grabSnapPoint: (point: SnapPoint) => void;
  cancelGrab: () => void;
  commitSnapMove: (target: SnapPoint) => void;

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

    // Invariant 24's second list — the one that records what nulls `grabbed`
    // for reasons other than the world moving. `MoveTool`'s candidate memo
    // offers only the SELECTED board's points as grab candidates, so a
    // selection that moves to a different board means the user retargeted the
    // tool, and the point in hand is no longer one they could have picked up.
    // `edit()` rather than each caller: addBoard and duplicateBoard both
    // select what they create through this callback, and so will the next
    // action that does.
    //
    // The condition compares the RESULTING selection against the grabbed
    // board — not merely whether a `selection` callback ran. Dropping the
    // comparison would clear a grab on any edit that carries a callback at
    // all, including the ones whose callback resolves to the same board the
    // grab already belongs to (deleteBoard removing some OTHER board is the
    // reachable case). Pinned by a store test.
    //
    // Only the callback path is considered. An edit that carries no
    // `selection` moves selectedId nowhere, so it has nothing to invalidate;
    // reaching further would also silently repair a mismatch that
    // `commitSnapMove`'s guard is meant to expose rather than paper over.
    const nextSelectedId = selection ? selection(next) : null;
    const heldGrab = get().grabbed;
    const dropGrab = selection !== undefined && heldGrab !== null && heldGrab.owner.id !== nextSelectedId;

    set({
      doc: next,
      past: nextPast,
      future: nextFuture,
      ...(selection ? { selectedId: nextSelectedId } : {}),
      ...(dropGrab ? { grabbed: null } : {}),
    });
  };

  /**
   * Invariant 24, for cut edits.
   *
   * A grab holds a WORLD POSITION captured at grab time, so anything that can
   * move or destroy the feature under it must drop it. Cut edits reach that
   * bar as soon as a shoulder is grabbable: removeCut can delete the point
   * being carried and updateCut can move it, after which commitSnapMove would
   * apply a delta derived from a position that describes nothing.
   *
   * They do not go through updateBoard (invariant 2 — a cut changes no extent,
   * so reorienting on a cut change would be a no-op pivot), so they do not
   * inherit its conditional clear and need this instead.
   *
   * Precise rather than blanket: the grab survives iff the point it holds is
   * still among that board's snap points after the edit. A box-lattice point
   * usually survives a cut edit — a mid-face dado touches no box point — but
   * not always: `boardSnapPoints` filters through `stockProbe` too, so a cut
   * pulled flush with a board's end can consume a corner's own stock, and a
   * grab on that corner is correctly dropped right along with a grab on a
   * shoulder. "Only the joinery changed" does not imply the position is
   * untouched — it implies the position is untouched UNLESS the joinery
   * change removed the stock the held point sits on. Exact === on the
   * coordinates is correct here for invariant 18's reason — both sides come
   * from the same arithmetic over the same stored values, so an unmoved
   * point holds identical doubles, and nothing computes a difference on the
   * way in.
   *
   * Call AFTER edit(), so `get().doc` is the post-edit document.
   */
  const dropGrabIfGone = (boardId: string) => {
    const grabbed = get().grabbed;
    if (!grabbed || grabbed.owner.id !== boardId) return;
    const board = get().doc.boards.find((b) => b.id === boardId);
    if (board && snapPointsFor(board).some((p) => sameSnapPoint(p, grabbed))) return;
    set({ grabbed: null });
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

    tool: 'select',
    grabbed: null,

    // Changing tools always drops the grab. A snap point carried into a
    // different tool has nothing that can consume it.
    setTool: (tool) => set({ tool, grabbed: null }),

    grabSnapPoint: (point) => set({ grabbed: point }),

    cancelGrab: () => set({ grabbed: null }),

    /**
     * Move the grabbed board so its grabbed point lands exactly on `target`.
     *
     * One subtraction, applied through updateBoard — which is what earns undo,
     * autosave and gesture coalescing without a line of new bookkeeping.
     *
     * Deliberately NOT snapped to SNAP_INCHES. Gizmo.tsx snaps because a free
     * drag lands on arbitrary numbers and a board should come to rest where a
     * person can measure to. Here the whole point is that the two points
     * coincide exactly, and rounding could break that silently, by a
     * sixteenth. If both boards already sit on 1/16" boundaries the delta is
     * exact anyway and a snap would be a no-op — the only case where it does
     * anything is the case where it does damage.
     *
     * The patch carries `position` only, so updateBoard's reorient predicate
     * is never reached. Correct: a snap move translates, it never turns.
     */
    commitSnapMove: (target) => {
      const grabbed = get().grabbed;
      if (!grabbed) return;
      // A board cannot be snapped onto itself. It is a legal subtraction — it
      // would translate the board by its own length — but never what anyone
      // means. MoveTool also withholds these candidates so the case cannot be
      // clicked; this guard is what makes the rule true of the action itself.
      if (target.owner.id === grabbed.owner.id) return;
      // MoveTool's candidate memo offers only the selected board's points,
      // and every writer of selectedId drops a grab that stops matching (see
      // edit() and selectBoard). This guard is deliberately redundant with
      // both: the filter makes the rule true of the UI, this makes it true of
      // the action, so a future writer of selectedId that misses the rule
      // costs a grab that refuses to commit rather than a board that moves
      // without the user knowing which one it was. `grabbed` is deliberately
      // left in hand — this state is unreachable through the UI, and
      // discarding it quietly would hide that it had become reachable.
      if (grabbed.owner.id !== get().selectedId) return;

      const board = get().doc.boards.find((b) => b.id === grabbed.owner.id);
      if (!board) {
        set({ grabbed: null });
        return;
      }

      const delta = [
        target.at[0] - grabbed.at[0],
        target.at[1] - grabbed.at[1],
        target.at[2] - grabbed.at[2],
      ] as const;

      // Guarded before the edit, the same rule updateCut and removeCut follow:
      // edit() unconditionally pushes an undo snapshot and clears redo, so a
      // no-op move would leave a no-op undo entry (invariant 4) and silently
      // wipe the redo stack.
      if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) {
        set({ grabbed: null });
        return;
      }

      get().updateBoard(board.id, {
        position: [
          board.position[0] + delta[0],
          board.position[1] + delta[1],
          board.position[2] + delta[2],
        ],
      });
      set({ grabbed: null, selectedId: board.id });
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

      // Invariant 24: a grab holds a world position captured at grab time, not
      // a reference to the board. Properties stays fully live in Move mode
      // (App renders it unconditionally, and commitSnapMove even selects the
      // board it just moved), so a Length or Posture edit reachable from the
      // panel can relocate the grabbed board out from under its own captured
      // point. Clearing here — conditionally, only when this is the grabbed
      // board, the same shape as deleteBoard's guard just below — is what
      // keeps that invariant's enumeration true; committing afterward would
      // otherwise apply a delta derived from a position that no longer
      // describes anything. Safe for commitSnapMove's own call into
      // updateBoard: it computes `delta` from `grabbed.at` before calling
      // this, and unconditionally nulls `grabbed` right after — so clearing
      // it here a moment early is a no-op there, not a race.
      if (get().grabbed?.owner.id === id) set({ grabbed: null });

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
      // A grab on the board being deleted has nothing left to move.
      if (get().grabbed?.owner.id === id) set({ grabbed: null });
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
      // undo snapshot that holds it. `cuts` needs the same treatment: `rest`
      // still carries the source's `cuts` array (and its `Cut` objects) by
      // reference, and createBoard's `cuts: []` default is overwritten by
      // `...partial` rather than applied — copying the array and minting a
      // fresh id per cut (via the same nextId() addCut uses) means a future
      // in-place Cut mutation can't corrupt the source board and every undo
      // snapshot holding it simultaneously.
      const { id: _sourceId, ...rest } = source;
      const fresh = createBoard({
        ...rest,
        position: [...source.position],
        cuts: source.cuts.map((cut) => ({ ...cut, id: nextId() })),
      });
      const copy = { ...fresh, name: uniqueName(source.name, get().doc.boards) };
      edit(
        (doc) => ({ ...doc, boards: [...doc.boards, copy] }),
        () => copy.id,
      );
    },

    // Selection is view state, not document state — deliberately not undoable.
    // Same rule as edit()'s: the grabbed board must be the selected one. This
    // is the path the parts list takes, which is the only way to change which
    // board the Move tool will move (BoardMesh's `selectable` is false in
    // move mode, deliberately — design §4).
    selectBoard: (id) =>
      set((s) => ({
        selectedId: id,
        ...(s.grabbed && s.grabbed.owner.id !== id ? { grabbed: null } : {}),
      })),

    setDocumentName: (name) => edit((doc) => ({ ...doc, name })),

    replaceDocument: (doc) => set({ doc, selectedId: null, past: [], future: [], grabbed: null }),

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
        // A grab captured a world position; an undo can move the board out
        // from under it, and committing would then apply a wrong delta.
        grabbed: null,
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
        grabbed: null,
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
      dropGrabIfGone(boardId);
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
      dropGrabIfGone(boardId);
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
      dropGrabIfGone(boardId);
    },
  };
});
