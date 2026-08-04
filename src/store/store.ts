import { create } from 'zustand';
import { createBoard, createDocument, createGuide, reorientedPosition, uniqueName, isSheetGood, nextId, sameSnapPoint, snapPointsFor } from '../document/document';
import type { Board, BoardSnapPoint, Cut, SloydDocument, SnapPoint } from '../document/document';

const HISTORY_LIMIT = 50;

/**
 * Which viewport tool has the pointer. View state, not document state — it is
 * never saved and never undone, exactly like `selectedId`.
 */
export type ToolMode = 'select' | 'move' | 'tape';

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
   *
   * `grabbed` is a BoardSnapPoint, not a SnapPoint, and that is load-bearing
   * rather than tidy: the guide-points round widened SnapOwner, and eight
   * reads in this file assume `owner.id` names a board. Seven of them are
   * correct only because MoveTool never offers a guide as a grab source — an
   * invariant enforced two modules away. The narrower type moves that
   * enforcement here, where tsc can hold it. `tapeAnchor` below is
   * deliberately the WIDE type; the difference is what says which of the two
   * can hold a guide.
   */
  tool: ToolMode;
  grabbed: BoardSnapPoint | null;
  setTool: (tool: ToolMode) => void;
  grabSnapPoint: (point: BoardSnapPoint) => void;
  cancelGrab: () => void;
  commitSnapMove: (target: SnapPoint) => void;

  /**
   * The point the Tape tool is measuring from.
   *
   * A SECOND INSTANCE OF INVARIANT 24, not a copy of `grabbed`. Like a grab it
   * holds a world position captured at click time — the readout's distance and
   * the direction a typed offset runs along both derive from `tapeAnchor.at` —
   * so if the world moves under it, the readout measures from a position that
   * no longer describes anything and a guide placed from it lands somewhere
   * the user never pointed at.
   *
   * It lives here rather than in TapeTool for exactly that reason: it cannot
   * get its clearing anywhere else. A useState inside the component would have
   * to subscribe to seven actions and re-derive when to drop itself, which is
   * the bookkeeping invariant 24 exists to avoid.
   *
   * It needs two actions `grabbed` does not: removeGuide and clearGuides. A
   * grab is never guide-owned (MoveTool's filter); an anchor can be.
   */
  tapeAnchor: SnapPoint | null;
  setTapeAnchor: (point: SnapPoint) => void;
  clearTapeAnchor: () => void;

  /**
   * The candidate currently under the cursor in Tape mode.
   *
   * In the store ONLY because the readout is a DOM overlay outside the Canvas
   * and needs it — this is not view state with the standing to sit beside
   * `tool`.
   *
   * INVARIANT 24'S THIRD INSTANCE, and it earns that the hard way. A hover is
   * normally too transient to hold a stale position: the next pointermove
   * re-picks it. But while anchored it is LATCHED (TapeTool's onPointerLeave),
   * because the only route to typing a distance is off the canvas and into the
   * readout — so it can sit unreplaced across an arbitrary number of edits,
   * and it is a world position captured at hover time exactly like the other
   * two. A typed offset runs along anchor -> hover, so a stale hover puts the
   * guide somewhere the user never pointed at, and the readout prints a
   * distance to a point that no longer exists.
   *
   * The reachable path is the one invariant 24 already records for `grabbed`:
   * anchor on board A, hover a point on board B, leave the canvas, edit board
   * B's Length in Properties (nothing disables the panel while the tape is
   * anchored). `tapeAnchor` correctly survives — its own board did not move —
   * so the anchor being non-null says nothing about the target being current.
   *
   * Cleared POINT-PRECISELY, never blanket. A blanket `tapeHover: null` beside
   * every `tapeAnchor: null` would destroy the latch, which is the whole
   * reason this field is in the store at all — so the clear is conditioned on
   * the point being gone (dropHeldIfGone's snapPointsFor survival test) or on
   * its own owner being the board or guide that just changed, never on an edit
   * merely having happened.
   */
  tapeHover: SnapPoint | null;
  setTapeHover: (point: SnapPoint | null) => void;

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

  addGuide: (at: [number, number, number]) => void;
  removeGuide: (id: string) => void;
  clearGuides: () => void;
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
    //
    // `tapeAnchor` is DELIBERATELY NOT dropped here, and this is a prohibition
    // rather than an omission (design §4.2). Everything above is an argument
    // about the SELECTED board: the Move tool offers only the selected board's
    // points as grab candidates, so a selection that moves elsewhere means the
    // user retargeted the tool. The Tape tool has no such restriction — it
    // anchors on any board or guide, and measuring from one board to another
    // is most of what it exists for, so clearing the anchor when the selection
    // moves would break the tool invisibly. Note addBoard reaches here, so
    // "measure from this board to the one I am about to add" is a live path.
    // Pinned by two tests in store.test.ts; adding `tapeAnchor: null` beside
    // the `grabbed: null` below is exactly what they exist to catch.
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
   * Invariant 24, for cut edits — now for BOTH held points.
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
   * Call AFTER edit(), so `get().doc` is the post-edit document. Unlike
   * removeGuide's clear — which may sit on either side of its edit, because
   * the guide id is gone either way — this one MUST come after: the whole
   * question it asks is what the board offers once the edit has landed.
   *
   * The guide-points round added `tapeAnchor` as invariant 24's second
   * instance and `tapeHover` as its third — a latched hover holds a captured
   * world position for as long as the anchor lives, so it sits on a dado
   * shoulder for exactly the reason the other two do. One helper over all
   * three rather than a second copy: two
   * functions computing snapPointsFor(board) and comparing with sameSnapPoint
   * are two places for a future rule to disagree (follow-up 113). The
   * board-id guard makes a guide-owned anchor fall through untouched, which is
   * correct — a cut edit cannot affect a guide.
   *
   * KEEPS THE ORIGINAL'S GUARD-FIRST SHAPE. snapPointsFor builds the cell grid
   * for a cut board, and these three actions fire on every ordinary edit in
   * the Cuts panel — so the overwhelmingly common case (nothing held at all)
   * must return before any of that runs, exactly as dropGrabIfGone did.
   */
  const dropHeldIfGone = (boardId: string) => {
    // `type === 'board'` is redundant for `grabbed` (its type says so) and
    // load-bearing for `tapeAnchor` (its type does not) — design §3.0 showing
    // through in one predicate over two fields. Returns the point rather than
    // a boolean so the two call sites below need no non-null assertion.
    const heldOnBoard = (held: SnapPoint | null): SnapPoint | null =>
      held !== null && held.owner.type === 'board' && held.owner.id === boardId ? held : null;

    const grabbed = heldOnBoard(get().grabbed);
    const anchor = heldOnBoard(get().tapeAnchor);
    const hover = heldOnBoard(get().tapeHover);
    // The cheap path, now over three fields. It must still return before any
    // grid arithmetic when none of them is relevant — that is the whole reason
    // this shape exists, and adding a field is exactly how it would be lost.
    if (!grabbed && !anchor && !hover) return;

    const board = get().doc.boards.find((b) => b.id === boardId);
    const points = board ? snapPointsFor(board) : [];
    const survives = (held: SnapPoint) => points.some((p) => sameSnapPoint(p, held));

    const patch: { grabbed?: null; tapeAnchor?: null; tapeHover?: null } = {};
    if (grabbed && !survives(grabbed)) patch.grabbed = null;
    if (anchor && !survives(anchor)) patch.tapeAnchor = null;
    // The survival test is what keeps the latch: a hover on a box corner rides
    // through a mid-face cut edit untouched, exactly as an anchor on one does.
    if (hover && !survives(hover)) patch.tapeHover = null;
    if (
      patch.grabbed !== undefined ||
      patch.tapeAnchor !== undefined ||
      patch.tapeHover !== undefined
    ) {
      set(patch);
    }
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
    tapeAnchor: null,
    tapeHover: null,

    // Changing tools always drops every held point — the two that can be
    // committed from (`grabbed`, `tapeAnchor`) and the tape's hover, which is
    // published for the readout and would otherwise leave a stale distance on
    // screen. A snap point carried into a different tool has nothing that can
    // consume it.
    setTool: (tool) => set({ tool, grabbed: null, tapeAnchor: null, tapeHover: null }),

    grabSnapPoint: (point) => set({ grabbed: point }),

    cancelGrab: () => set({ grabbed: null }),

    setTapeAnchor: (point) => set({ tapeAnchor: point }),

    clearTapeAnchor: () => set({ tapeAnchor: null }),

    setTapeHover: (point) => set({ tapeHover: point }),

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
      //
      // Compares OWNERS, not bare ids, since the guide-points round: a guide is
      // a legal target, both union members carry `id: string`, and a guide
      // whose id collided with the grabbed board's would otherwise read as a
      // self-snap and silently refuse a move the user asked for. This is the
      // ONLY runtime ownership test left in the file — everything else is the
      // BoardSnapPoint type. See design §3.0.
      if (target.owner.type === 'board' && target.owner.id === grabbed.owner.id) return;
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

      // The tape anchor is invariant 24's second instance and needs the same
      // conditional clear for the same reason — see its declaration. The
      // `owner.type` test is what `grabbed`'s line above does not need: an
      // anchor may be guide-owned, and a guide id is not a board id.
      if (get().tapeAnchor?.owner.type === 'board' && get().tapeAnchor?.owner.id === id) {
        set({ tapeAnchor: null });
      }

      // And the LATCHED HOVER, invariant 24's third instance, which needs its
      // own clause because the anchor's says nothing about it: the reachable
      // path is anchoring on board A, hovering a point on board B, leaving the
      // canvas for the readout, and editing B's Length here. A's anchor
      // correctly survives — A did not move — so without this the readout
      // would print a distance to a point that no longer exists and Enter
      // would place a guide along a direction derived from it. Conditional on
      // the hovered board, the same shape as the two clauses above: an edit to
      // a third board must leave the latch alone.
      if (get().tapeHover?.owner.type === 'board' && get().tapeHover?.owner.id === id) {
        set({ tapeHover: null });
      }

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
      // A grab on the board being deleted has nothing left to move, an anchor
      // on it has nothing left to measure from, and a latched hover on it has
      // nothing left to measure TO — invariant 24, all three instances, the
      // same conditional shape as updateBoard's.
      if (get().grabbed?.owner.id === id) set({ grabbed: null });
      if (get().tapeAnchor?.owner.type === 'board' && get().tapeAnchor?.owner.id === id) {
        set({ tapeAnchor: null });
      }
      if (get().tapeHover?.owner.type === 'board' && get().tapeHover?.owner.id === id) {
        set({ tapeHover: null });
      }
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
    //
    // `tapeAnchor` is DELIBERATELY NOT dropped here, the same prohibition
    // edit() carries and for the same reason (design §4.2): the rule above is
    // about the Move tool's selected-board grab set, and the tape has no such
    // restriction. Picking a part out of the parts list mid-measurement must
    // not silently discard the anchor. Pinned by a test.
    selectBoard: (id) =>
      set((s) => ({
        selectedId: id,
        ...(s.grabbed && s.grabbed.owner.id !== id ? { grabbed: null } : {}),
      })),

    setDocumentName: (name) => edit((doc) => ({ ...doc, name })),

    replaceDocument: (doc) =>
      set({ doc, selectedId: null, past: [], future: [], grabbed: null, tapeAnchor: null }),

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
        // from under it, and committing would then apply a wrong delta. The
        // tape anchor captured one for the same reason and goes with it —
        // an undo can also take away the guide it is anchored on.
        grabbed: null,
        tapeAnchor: null,
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
        tapeAnchor: null,
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
      dropHeldIfGone(boardId);
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
      dropHeldIfGone(boardId);
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
      dropHeldIfGone(boardId);
    },

    /**
     * Place a guide point. Document data, so it lands on the undo stack like
     * any other edit — a guide the user placed is a fact about the project.
     *
     * Deliberately does NOT change `selectedId`: a guide is not a board, and
     * the properties panel is a panel for boards. Compare commitSnapMove,
     * which DOES select, because it moved a board the user is working on.
     */
    addGuide: (at) => {
      const guide = createGuide(at);
      edit((doc) => ({ ...doc, guides: [...doc.guides, guide] }));
    },

    removeGuide: (id) => {
      // Guarded before the edit, the same rule updateCut, removeCut and
      // commitSnapMove follow: edit() unconditionally pushes an undo snapshot
      // and clears redo, so a no-op would leave a no-op undo entry
      // (invariant 4) and silently wipe the redo stack.
      if (!get().doc.guides.some((g) => g.id === id)) return;
      // Invariant 24, the clause `grabbed` does not need: an anchor CAN be
      // guide-owned, and nothing disables the guides list while the tape is
      // anchored, so deleting the guide you are measuring from is one click
      // away. Unlike dropHeldIfGone this may sit on either side of the edit —
      // the guide id is equally gone before and after — but it is written
      // before it to match every other guard in this file.
      if (get().tapeAnchor?.owner.type === 'guide' && get().tapeAnchor?.owner.id === id) {
        set({ tapeAnchor: null });
      }
      // The same clause for the latched hover, and it is NOT symmetry: a guide
      // is a snap candidate like any other, so "anchor on a board, measure to
      // an existing guide, type an offset" is an ordinary gesture — and the
      // guides list stays live throughout it, so deleting the guide being
      // measured TO is as reachable as deleting the one being measured FROM.
      // Narrowed to this guide: removing a different one must not break the
      // latch.
      if (get().tapeHover?.owner.type === 'guide' && get().tapeHover?.owner.id === id) {
        set({ tapeHover: null });
      }
      edit((doc) => ({ ...doc, guides: doc.guides.filter((g) => g.id !== id) }));
    },

    clearGuides: () => {
      if (get().doc.guides.length === 0) return;
      // Unconditional rather than narrowed to guide-owned anchors on purpose:
      // every guide is going, so any guide-owned anchor is invalid, and a
      // board-owned one is cheap to drop. Narrowing would buy one edge case
      // and cost a reader the certainty that no stale anchor survives here.
      //
      // The hover goes with it, and unconditionally is right HERE for a reason
      // that does not generalise: the latch only exists while an anchor does —
      // TapeReadout renders nothing without one and every commit path returns
      // on it — so the anchor going means the latch is already over and there
      // is nothing left to preserve. (TapeTool's own anchor effect would clear
      // the local hover a render later regardless; this keeps the store from
      // holding a stale point in between.) This is the ONE place tapeHover is
      // cleared blanket, and it is only defensible because the field it
      // depends on is cleared blanket in the same statement.
      set({ tapeAnchor: null, tapeHover: null });
      edit((doc) => ({ ...doc, guides: [] }));
    },
  };
});
