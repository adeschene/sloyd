import { create } from 'zustand';
import {
  boardsBounds, cleanName, createBoard, createDocument, createGuide, reorientedPosition, uniqueName, isSheetGood, nextId, sameSnapPoint, snapPointsFor,
  linkPlan, sharedOf, sharedPatch, isShaped, plainOf, pruneShapes, dissolveShapes,
  childrenOf, instanceAt, isCovered, itemPaths, parentPath, worldParts, mapWorld,
  translateItems, insertItems, itemKey, sharesStorageWith, removeItems, shareInstance, makeUniqueItem, storageKey, siblingsOf, containerAt, containerLinear, partAt, resolvedPartAt, resolveBoard, shapeMap, joinPath,
  toLocal, groupItems, ungroupItem, turnInstance as turnInstanceOp, setMirrored, mirroredCopy, updateContainer, lastSegment,
} from '../document/document';
import type { Board, BoardSnapPoint, Cut, Instance, Lift, Named, Rekey, Rotation, SloydDocument, SnapPoint, StoredBoard, TapeAxis } from '../document/document';
import { SNAP_INCHES } from '../document/geometry';
import { MAX_ROW } from '../document/row';
import { clickTarget } from './assemblyPick';

const HISTORY_LIMIT = 50;

/**
 * Which viewport tool has the pointer. View state, not document state — it is
 * never saved and never undone, exactly like `selectedIds`.
 */
export type ToolMode = 'select' | 'move' | 'tape';

/**
 * One undo step: the document AND the hidden set as they were (hide/unhide
 * spec §2.1). Hidden-ness is view state, never saved, but it IS undone, so a
 * Ctrl+Z after H shows the parts again. A hide's entry holds the SAME document
 * object, so nothing is copied and autosave does not fire.
 */
export interface HistoryEntry { doc: SloydDocument; hiddenIds: string[] }

interface StoreState {
  doc: SloydDocument;
  /**
   * The selected parts, in the order they were selected, each at most once.
   * View state, not document state — never saved, never undone — exactly as
   * the single `selectedId` it replaced. There is no "primary" part: nothing
   * in scope needs one, and keeping one beside this list would be two
   * deciders for one fact (multi-select spec §2). Written ONLY through
   * `selectionPatch` below.
   */
  selectedIds: string[];
  past: HistoryEntry[];
  future: HistoryEntry[];
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
   * to subscribe to every action enumerated below and re-derive when to drop
   * itself, which is the bookkeeping invariant 24 exists to avoid.
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
   * Cleared POINT-PRECISELY wherever the latch could still be alive, never on
   * an edit merely having happened. A blanket `tapeHover: null` beside every
   * `tapeAnchor: null` would destroy the latch, which is the whole reason this
   * field is in the store at all. So:
   *
   *  - `updateBoard` routes through dropHeldIfGone's snapPointsFor survival
   *    test, NOT through the board-id test its own `grabbed` clause uses.
   *    That test is too loose here: `updateBoard` is also the only rename
   *    path, and a rename moves no point, so a board-precise clause would
   *    drop the latch while TapeTool went on drawing the marker.
   *  - `addCut`/`updateCut`/`removeCut` reach the same survival test.
   *  - `deleteBoard` and `removeGuide` are owner-conditional, which is exactly
   *    point-precise there: neither owner offers any point afterward.
   *  - `setTool`, `clearGuides` and `replaceDocument` clear it blanket.
   *    `undo` and `redo` do too, through `restore`, but only when the restored
   *    document is a different object (invariant 43). Each is defensible only
   *    because it nulls the ANCHOR in the same statement. No anchor, no latch:
   *    TapeReadout renders nothing without one and every commit path returns
   *    on it, so there is nothing left to preserve. That is a property of those
   *    statements, not a licence to add another.
   */
  tapeHover: SnapPoint | null;
  setTapeHover: (point: SnapPoint | null) => void;

  /**
   * The text currently in the tape's distance box.
   *
   * NOT A FOURTH INSTANCE OF INVARIANT 24, and the distinction is the whole
   * reason this comment is longer than the field. The three fields above hold
   * captured WORLD POSITIONS, which is what makes them go stale when the boards
   * move under them and what earns them their point-precise clearing rules.
   * This is a STRING the user typed. `"3 1/2"` means the same thing after an
   * undo, after a board is resized, after a cut is deleted — there is nothing
   * about it that any document edit can invalidate, so it must NOT be given
   * clearing rules by analogy with its neighbours. Adding `tapeTyped: ''` to
   * `updateBoard`, `undo` or `dropHeldIfGone` would silently wipe a
   * half-entered number every time an unrelated edit landed, which reads as the
   * box "randomly clearing itself" and has no defect behind it to justify it.
   * Pinned by two tests: it is cleared by `setTool`, and it SURVIVES an edit
   * that clears the anchor it was typed for.
   *
   * It is in the store for the same reason `tapeHover` is — the readout is a
   * DOM overlay outside the Canvas, and now two things on the other side of
   * that boundary need the text: App's keydown effect writes the first typed
   * character into it (the type-anywhere capture, so the user never has to
   * travel to the corner and click the box), and TapeTool parses it to derive
   * the live preview marker. Neither can reach a useState inside TapeReadout.
   *
   * `setTool` clears it, and that clear is about the ENTRY being over rather
   * than about staleness: changing tools drops the anchor, so there is no
   * measurement left for the number to be a distance along. TapeReadout's own
   * anchor effect covers the other end of the same idea — a fresh anchor starts
   * a fresh measurement, so it starts a fresh number too.
   */
  tapeTyped: string;
  setTapeTyped: (text: string) => void;

  /**
   * The world axis the typed distance runs along, or null for the ray path.
   *
   * NOT A FOURTH INSTANCE OF INVARIANT 24, for `tapeTyped`'s reason rather than
   * its own: the three fields above hold captured WORLD POSITIONS, which is what
   * makes them go stale when the boards move under them. This holds an enum.
   * `'x'` means the same thing after an undo, a resize or a deleted cut, so it
   * must NOT be given clearing rules by analogy with its neighbours — doing so
   * would silently unlock an axis mid-measurement on every unrelated edit.
   *
   * Its one rule is STRUCTURAL instead: an axis with no anchor names no ray — no
   * origin for the offset to run from, and TapeReadout renders nothing without
   * an anchor — so the axis lives exactly as long as `tapeAnchor`. Stated as a
   * rule over that set rather than as a list of writers, because a list here is
   * a count that goes stale (a comment in CLAUDE.md did exactly that once).
   * Concretely, in both directions:
   *
   *  - every site that nulls `tapeAnchor` nulls this too, at the SAME
   *    conditionality: blanket where the anchor's clear is blanket,
   *    owner-conditional in `deleteBoard`/`removeGuide`, point-precise inside
   *    `dropHeldIfGone`. So an edit the anchor SURVIVES leaves the lock alone.
   *  - `setTapeAnchor` PRESERVES it, which is the half a "clear it everywhere"
   *    implementation breaks while passing every other test. It is what lets a
   *    lock be RETARGETED before it is spent: click a corner, press the axis,
   *    click a different corner, type, Enter — the second click moves the
   *    anchor and places nothing (design §5.2's first bullet).
   *
   *    What it does NOT buy — and design §5.2's illustration and this comment's
   *    first version both claimed it did — is a lock that outlives a COMMIT.
   *    `commit()` ends with `clearTapeAnchor()`, which is the rule above doing
   *    exactly what it says, so `click, type, Enter, click, type, Enter` places
   *    ONE guide along the axis and then refuses the second (verified in a
   *    browser: the second Enter reports `degenerate`). Walking a row of corners
   *    costs one axis press per guide today. Whether it should is follow-up 147
   *    and is a §3.1 amendment rather than a defect.
   *
   * See design §3. `setTapeAxis(axis)` toggles (setting the axis already locked
   * clears it) and is a no-op with no anchor; `setTapeAxis(null)` always clears,
   * which is what Escape's ladder uses.
   */
  tapeAxis: TapeAxis | null;
  setTapeAxis: (axis: TapeAxis | null) => void;

  addBoard: () => void;
  updateBoard: (id: string, patch: Partial<Board>) => void;
  /**
   * One patch to every named part, as ONE undo entry. Each part goes through
   * the same per-board rules a single edit does — its own min corner, its own
   * reorient pivot, its own sheet-good grain reset — so a group edit is N
   * single edits sharing one snapshot. Unknown ids are ignored.
   */
  updateBoards: (ids: string[], patch: Partial<Board>) => void;
  /**
   * The group gizmo's path (multi-select spec §4.1). `minCorner` is the
   * ABSOLUTE place the group's min corner should go — not a delta, because
   * TransformControls fires onObjectChange every frame and a delta would
   * accumulate. It is rounded to SNAP_INCHES ONCE, and the one resulting delta
   * is added to every part, so parts keep their exact relative layout even
   * off the grid (invariant 25: round what a free drag produced, never an
   * exact position). Position only — a group move translates, never turns
   * (invariant 2). A zero delta writes nothing (invariant 4).
   */
  moveGroupTo: (ids: string[], minCorner: [number, number, number]) => void;
  deleteBoard: (id: string) => void;
  /** Delete every named part, as ONE undo entry. Unknown ids are ignored. */
  deleteBoards: (ids: string[]) => void;
  /**
   * The hidden parts, insertion order, no duplicates (hide/unhide spec §2). View
   * state: never in the document, never saved, but in the undo history. Written
   * by the four user actions below ONLY through `applyHidden`; `restore`,
   * `replaceDocument` and `deleteBoards` merely reconcile it (invariant 43). A hidden part is
   * never selected: selectionPatch filters it out.
   */
  hiddenIds: string[];
  hideSelected: () => void;
  hideUnselected: () => void;
  showAll: () => void;
  setHidden: (id: string, hidden: boolean) => void;
  duplicateBoard: (id: string) => void;
  /**
   * Copy every named part in place, as ONE undo entry, and select the copies.
   * Each copy's name goes through `uniqueName` against the document AS IT
   * GROWS, so copies cannot collide with each other (invariant 8).
   */
  duplicateBoards: (ids: string[]) => void;
  /**
   * N - 1 copies of the selection, each shifted k * step * sign along `axis`
   * from the ORIGINAL. ONE undo entry; selects the originals then the copies.
   * Refuses (writes nothing) a count outside 2..MAX_ROW, a non-positive or
   * non-finite step, a sign other than +1/-1, or no known ids.
   */
  copyInRow: (ids: string[], count: number, axis: 0 | 1 | 2, sign: 1 | -1, step: number) => void;
  selectBoard: (id: string | null) => void;
  toggleSelected: (id: string) => void;
  selectAll: () => void;
  /**
   * The instance path being edited inside, or null at the top level
   * (assemblies spec §3.1). View state: not saved and NOT undoable. Selection
   * is limited to its direct children (selectionPatch). restore and
   * replaceDocument reconcile it.
   */
  openPath: string | null;
  openAssembly: (path: string) => void;
  closeAssembly: () => void;
  selectItem: (path: string, toggle: boolean) => void;
  clickPart: (occ: string, toggle: boolean) => void;
  openPart: (occ: string) => void;
  /** Group the selection into a new assembly at the open level (spec §4.1). One undo entry. */
  groupSelected: () => void;
  /** Move each selected assembly's children up a level (spec §4.1). One undo entry. */
  ungroupSelected: () => void;
  /** Turn an assembly about its box centre (spec §4.2). */
  turnAssembly: (path: string, rotation: Rotation) => void;
  /** Flip an assembly's mirror in place, keeping its world box (mirrored-instances spec §5). */
  mirrorAssembly: (path: string, mirrored: boolean) => void;
  /** Place a shared, opposite-flag copy beside the assembly and select it (spec §5). */
  copyMirrored: (path: string) => void;
  /** Give the instance its own copy of its definition (components spec §3.1). */
  makeUnique: (path: string) => void;
  /** Select the instances at the open level naming the same definition. */
  selectCopies: (path: string) => void;
  /** Rename a part or an assembly, unique among its siblings; returns the stored name. */
  renameItem: (path: string, typed: string) => string;
  setDocumentName: (name: string) => void;
  replaceDocument: (doc: SloydDocument) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  beginGesture: () => void;
  endGesture: () => void;
  /**
   * Gesture bookkeeping, and the one pair of fields here NOTHING SHOULD
   * SUBSCRIBE TO. They are in the state for one reason: `replaceDocument`
   * already rewrites everything that must not outlive a document, and these
   * two were the exception — module-level closure variables it could not
   * reach, so a component unmounting mid-gesture left `gesturing` true for
   * the rest of the session and every later edit coalesced into a snapshot
   * nobody took (follow-up 148). A flag reset by convention at each call
   * site is the shape invariant 24 had to enumerate; being in the state is
   * what makes such a rule enumerable.
   *
   * The cost of the move is one `set()` per begin/end — focus, blur, gizmo
   * mousedown and mouseup, never per frame — and it is only that small
   * because every `useStore` call site passes a selector, so no consumer
   * re-renders on a field it does not name. Reading these from a component
   * would put a re-render on every gesture boundary and is the reason to
   * treat them as private in everything but the type.
   */
  gesturing: boolean;
  gestureSnapshotTaken: boolean;

  addCut: (boardId: string) => void;
  updateCut: (boardId: string, cutId: string, patch: Partial<Cut>) => void;
  removeCut: (boardId: string, cutId: string) => void;

  /** Link the named parts (linking spec §3.1): the first wins, each named part's whole link joins; every member then names ONE shape (components spec §3.2). One undo entry. */
  linkBoards: (ids: string[]) => void;
  /** Make the named shaped parts plain again, keeping their values and cut ids; a shape left with one user dissolves (components spec §3.2). */
  unlinkBoards: (ids: string[]) => void;
  /** Select every visible user of the part's shape (its link); a no-op for an unlinked part. */
  selectLinked: (id: string) => void;

  addGuide: (at: [number, number, number]) => void;
  removeGuide: (id: string) => void;
  clearGuides: () => void;
}

export const useStore = create<StoreState>((set, get) => {
  /**
   * The ONE place a new selection is written. `selectBoard`, `toggleSelected`,
   * `selectAll` and `edit()`'s selection callback all route through it.
   *
   * It carries invariant 24's retargeting rule, applied to a SET: the Move
   * tool's grab candidates are the selected parts' points, so a held grab
   * survives exactly when its owner is still selected. One helper rather than
   * the rule restated at four call sites — a rule written out four times is a
   * rule that holds in three places after the next edit.
   *
   * It does NOT touch `tapeAnchor` or `tapeHover`, and that is a PROHIBITION
   * (see edit()'s comment): the tape has no selected-board restriction.
   *
   * It also keeps only direct children of the open assembly (`open`, default the
   * store's `openPath`) and drops hidden ids: a hidden part is never selected. `hidden` is
   * passed explicitly only by callers about to write a NEW hidden set in the
   * same `set()`; otherwise the current set is read.
   */
  const selectionPatch = (
    ids: string[],
    hidden: readonly string[] = get().hiddenIds,
    open: string | null = get().openPath,
  ): { selectedIds: string[]; grabbed?: null } => {
    const held = get().grabbed;
    // Filtered HERE, in the one writer (invariants 42, 43): only direct
    // children of the open assembly (assemblies spec §3.2), never anything
    // hidden or under a hidden assembly. Same array when nothing is dropped.
    const hiddenSet = new Set(hidden);
    const kept = ids.filter((id) => parentPath(id) === open && !isCovered(id, hiddenSet));
    const selectedIds = kept.length === ids.length ? ids : kept;
    // A grab survives while its owner is selected OR under a selected assembly.
    return {
      selectedIds,
      ...(held && !isCovered(held.owner.id, new Set(selectedIds)) ? { grabbed: null } : {}),
    };
  };

  /**
   * Apply an edit as a new document, pushing the previous one onto the undo
   * stack. Every mutating action funnels through here — that is what keeps
   * undo correct without any per-action bookkeeping.
   */
  const edit = (
    fn: (doc: SloydDocument) => SloydDocument,
    selection?: (doc: SloydDocument) => string[],
  ) => {
    const { doc, past, future, gesturing, gestureSnapshotTaken } = get();
    const next = fn(doc);

    // The function changed nothing (the SAME document object): an undo entry
    // for it would undo to nothing (invariant 4), so push none and take no
    // gesture snapshot. A selection the caller asked for still applies. The top
    // of `past` is untouched, so a hide run in progress carries on (applyHidden).
    if (next === doc) {
      if (selection) set(selectionPatch(selection(next)));
      return;
    }

    let nextPast = past;
    let nextFuture = future;
    let takeSnapshot = false;
    if (!gesturing || !gestureSnapshotTaken) {
      nextPast = [...past, { doc, hiddenIds: get().hiddenIds }].slice(-HISTORY_LIMIT);
      nextFuture = [];
      takeSnapshot = gesturing;
    }

    // Invariant 24's retargeting rule, for edits that move the selection
    // (addBoard and duplicateBoards select what they create through this
    // callback). The rule itself lives in selectionPatch: a held grab
    // survives exactly when its owner is still among the resulting
    // selection. An edit that carries no `selection` moves the selection
    // nowhere, so it has nothing to invalidate — reaching further would also
    // silently repair a mismatch that `commitSnapMove`'s guard is meant to
    // expose rather than paper over.
    //
    // `tapeAnchor` is DELIBERATELY NOT dropped here, and this is a prohibition
    // rather than an omission (design §4.2). Everything above is an argument
    // about the SELECTED parts: the Move tool offers only their points as
    // grab candidates, so a selection that moves elsewhere means the user
    // retargeted the tool. The Tape tool has no such restriction — it anchors
    // on any board or guide, and measuring from one board to another is most
    // of what it exists for, so clearing the anchor when the selection moves
    // would break the tool invisibly. Note addBoard reaches here, so "measure
    // from this board to the one I am about to add" is a live path.
    // `tapeHover` is not dropped here either, for the identical reason.
    // Pinned by tests in store.test.ts; adding `tapeAnchor: null` to
    // selectionPatch is exactly what they exist to catch.
    set({
      doc: next,
      past: nextPast,
      future: nextFuture,
      ...(takeSnapshot ? { gestureSnapshotTaken: true } : {}),
      ...(selection ? selectionPatch(selection(next)) : {}),
    });
  };

  /** The undo entry the current run of eye toggles pushed, held by identity (see applyHidden). */
  let hideRunEntry: HistoryEntry | null = null;

  /**
   * The ONE writer of `hiddenIds` (hide/unhide spec §2.1). Never runs edit() and
   * never replaces `doc`: the entry it pushes holds the SAME document object.
   *
   * Refused while a gesture is open. A hide pushes its own entry, so inside a
   * gesture it would land between the gesture's lazy snapshot (invariant 4) and
   * its later frames, and the drag's tail would undo with the hide. Reading
   * `gesturing` inside an action is allowed; subscribing to it is not
   * (invariant 34).
   *
   * Pushes nothing when the set does not change (invariant 4: no entry that
   * undoes to nothing), and consecutive toggles share one entry (fu 214). Never touches tapeAnchor/tapeHover (invariant 24's
   * prohibition): hiding moves nothing.
   */
  const applyHidden = (next: string[]) => {
    const { doc, hiddenIds, past, selectedIds, gesturing } = get();
    if (gesturing) return;
    const exists = itemPaths(doc);
    const clean = [...new Set(next)].filter((id) => exists.has(id));
    if (clean.length === hiddenIds.length && clean.every((id) => hiddenIds.includes(id))) return;
    // Consecutive toggles share ONE entry (fu 214, ruled): while the top of
    // `past` is still the entry this run pushed, a further toggle only moves
    // `hiddenIds`; the entry keeps the set from before the run. An edit or a
    // gesture snapshot pushes, so the top changes; undo and redo clear
    // `hideRunEntry` outright (a later entry's undo would otherwise leave the
    // run's entry on top again and wrongly continue it). A run that
    // lands back on its starting set leaves nothing to undo, so its entry goes
    // (invariant 4).
    const top = past[past.length - 1];
    if (top !== undefined && top === hideRunEntry) {
      const restored = top.hiddenIds.length === clean.length && clean.every((id) => top.hiddenIds.includes(id));
      set({
        hiddenIds: clean,
        past: restored ? past.slice(0, -1) : past,
        future: [],
        ...selectionPatch(selectedIds, clean),
      });
      return;
    }
    const entry = { doc, hiddenIds };
    hideRunEntry = entry;
    set({
      hiddenIds: clean,
      past: [...past, entry].slice(-HISTORY_LIMIT),
      future: [],
      ...selectionPatch(selectedIds, clean),
    });
  };

  /**
   * What undo and redo both restore from an entry: its document, its hidden set
   * (filtered to that document's parts), and a selection reconciled with both
   * through selectionPatch, so a redo that re-hides a selected part deselects it
   * and drops a grab it owned.
   *
   * Held points: an entry whose document is a DIFFERENT object is a wholesale
   * rewrite, so grabbed / tapeAnchor / tapeHover / tapeAxis clear unconditionally
   * (invariant 24, the reasoning at replaceDocument). An entry holding the SAME
   * object, the undo of a hide or show, moved nothing, so they are kept.
   * Otherwise Ctrl+Z after a hide would drop a measurement the hide itself was
   * forbidden to drop.
   *
   * A grab captured a world position; an undo can move the board out from under
   * it, and committing would then apply a wrong delta. The tape anchor captured
   * one for the same reason and goes with it, and so does the latched hover,
   * whose owner an undo can equally remove. See replaceDocument for why blanket
   * is right for these and not elsewhere.
   *
   * INVARIANT 34: `gesturing`/`gestureSnapshotTaken` deliberately do NOT join
   * this list. A gesture belongs to the component that opened it and an undo
   * does not end it; clearing them here would split one focused field's gesture
   * in half after a Ctrl+Z. Their reset lives in replaceDocument only.
   */
  const restore = (entry: HistoryEntry, current: SloydDocument, selectedIds: string[]) => {
    const exists = itemPaths(entry.doc);
    const hidden = entry.hiddenIds.filter((id) => exists.has(id));
    const surviving = selectedIds.filter((id) => exists.has(id));
    // The deepest open level that still exists (assemblies spec §3.1).
    let open = get().openPath;
    while (open !== null && !instanceAt(entry.doc, open)) open = parentPath(open);
    return {
      doc: entry.doc,
      hiddenIds: hidden,
      openPath: open,
      ...selectionPatch(surviving.length === selectedIds.length ? selectedIds : surviving, hidden, open),
      ...(entry.doc === current ? {} : { grabbed: null, tapeAnchor: null, tapeHover: null, tapeAxis: null }),
    };
  };

  /**
   * Invariant 24 for all THREE held points — and no longer only for cut edits:
   * updateBoard calls this too, because a board patch that moves no point
   * (a rename) must not drop a latched hover.
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
  /**
   * Group and Ungroup change ids but move nothing, so the hidden set and the
   * tape's held points are RE-KEYED, never dropped (assemblies spec §5.4,
   * invariant 43's argument). `grabbed` is not re-keyed: the selection changes,
   * and selectionPatch drops it by the retargeting rule.
   */
  const rekeyHeld = (rekey: Rekey, lift: Lift = () => null) => {
    const { hiddenIds, tapeAnchor, tapeHover } = get();
    const move = (p: SnapPoint | null) =>
      p && p.owner.type === 'board' ? { ...p, owner: { ...p.owner, id: rekey(p.owner.id) } } : p;
    // A hidden assembly an edit dissolved passes its hidden-ness to what it held
    // (fu 229), once each: a child already hidden on its own is not listed twice.
    const hidden = [...new Set(hiddenIds.flatMap((id) => lift(id) ?? [rekey(id)]))];
    set({ hiddenIds: hidden, tapeAnchor: move(tapeAnchor), tapeHover: move(tapeHover) });
  };

  /** Run `edit` after a re-key, but leave the PRE-re-key hidden ids in the undo entry. */
  const editRekeyed = (
    rekey: Rekey,
    fn: (doc: SloydDocument) => SloydDocument,
    selection: (doc: SloydDocument) => string[],
    lift?: Lift,
  ) => {
    // Refused inside a gesture: edit() may push nothing there, and the patch
    // below would then rewrite the gesture's own snapshot (invariant 43's argument).
    if (get().gesturing) return;
    const hiddenBefore = get().hiddenIds;
    rekeyHeld(rekey, lift);
    const pastBefore = get().past;
    edit(fn, selection);
    const past = get().past;
    // A no-op edit pushes nothing (fu 231); rewriting the top then would clobber
    // an OLDER entry (perhaps a hide run's) or invent one on an empty history.
    if (past === pastBefore) { reconcileHidden(); judgeHeld(); return; }
    set({ past: [...past.slice(0, -1), { ...past[past.length - 1]!, hiddenIds: hiddenBefore }] });
    // The re-key covers every placement of the edited container (an ungrouped
    // assembly's own path LIFTS to its children there, fu 229); anything it could
    // not map names nothing now, and every held point is judged against the new
    // document (components spec §4.2).
    reconcileHidden();
    judgeHeld();
  };

  /** Drop hidden ids naming no item of the current document. The entry an
   *  edit pushed already recorded the set as it was (invariant 43). */
  const reconcileHidden = () => {
    const paths = itemPaths(get().doc);
    const kept = get().hiddenIds.filter((id) => paths.has(id));
    if (kept.length !== get().hiddenIds.length) set({ hiddenIds: kept });
  };

  /** The FIRST occurrence per storage target (components spec §4.1): two
   *  placements of one stored part must not both send an edit. */
  const oneEditPerTarget = (doc: SloydDocument, ids: Iterable<string>): Set<string> => {
    const seen = new Set<string>();
    const out = new Set<string>();
    for (const id of ids) {
      const k = storageKey(doc, id) ?? id;
      if (seen.has(k)) continue;
      seen.add(k);
      out.add(id);
    }
    return out;
  };

  /** Every board-owned held point, judged point-precisely (components spec §4.2):
   *  an edit inside a definition moves parts in EVERY copy, so judging only the
   *  edited occurrence would miss held points under the other copies. */
  const judgeHeld = () => {
    const owners = new Set<string>();
    for (const h of [get().grabbed, get().tapeAnchor, get().tapeHover]) if (h && h.owner.type === 'board') owners.add(h.owner.id);
    for (const id of owners) dropHeldIfGone(id);
  };

  const dropHeldIfGone = (boardId: string) => {
    // `type === 'board'` is redundant for `grabbed` (its type says so) and
    // load-bearing for `tapeAnchor` (its type does not) — design §3.0 showing
    // through in one predicate over three fields. Returns the point rather
    // than a boolean so the three call sites below need no non-null assertion.
    const heldOnBoard = (held: SnapPoint | null): SnapPoint | null =>
      held !== null && held.owner.type === 'board' && held.owner.id === boardId ? held : null;

    const grabbed = heldOnBoard(get().grabbed);
    const anchor = heldOnBoard(get().tapeAnchor);
    const hover = heldOnBoard(get().tapeHover);
    // The cheap path, now over three fields. It must still return before any
    // grid arithmetic when none of them is relevant — that is the whole reason
    // this shape exists, and adding a field is exactly how it would be lost.
    if (!grabbed && !anchor && !hover) return;

    const board = worldParts(get().doc).find((b) => b.id === boardId);
    const points = board ? snapPointsFor(board) : [];
    const survives = (held: SnapPoint) => points.some((p) => sameSnapPoint(p, held));

    const patch: { grabbed?: null; tapeAnchor?: null; tapeHover?: null; tapeAxis?: null } = {};
    if (grabbed && !survives(grabbed)) patch.grabbed = null;
    if (anchor && !survives(anchor)) {
      patch.tapeAnchor = null;
      // The lock goes with the anchor and only with it — point-precise, like
      // the clear it rides on. An edit this anchor survives leaves it alone.
      patch.tapeAxis = null;
    }
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

  /**
   * One board with one patch applied, by the rules every board edit follows.
   * Shared by updateBoard (via updateBoards) so a group edit is exactly N
   * single edits — never a second copy of the reorient or grain rule.
   */
  const patchBoard = (current: Board, patch: Partial<Board>): Board => {
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

    return {
      ...current,
      ...patch,
      ...(position ? { position: [...position] as [number, number, number] } : {}),
      ...(switchingToSheetGoodWithThicknessGrain ? { grain: 'length' as const } : {}),
    };
  };

  /**
   * Add one delta to every named board's position, as one edit, then run
   * invariant 24's point-precise survival test for each of them. The ONE
   * translate both group moves use (the Move tool's commit and the gizmo).
   * The delta is computed once by the caller; nothing here rounds.
   */
  const translateBoards = (ids: ReadonlySet<string>, delta: readonly [number, number, number]) => {
    // A world delta, rotated into each item's container frame and added
    // (assemblies spec §4.2). A root item gains it exactly, as before.
    edit((doc) => translateItems(doc, [...ids], delta));
    // Every held point, not only the moved occurrence's: a shared definition
    // moves the same part in every copy (components spec §4.2).
    judgeHeld();
  };

  /**
   * One copy of the STORED part `source` at `position`, exactly as Duplicate
   * makes it, named unique against `taken`, which the caller GROWS as it
   * copies (invariant 8). Shared by duplicateBoards and copyInRow so the two
   * cannot drift.
   *
   * A SHAPED source's copy is a ShapedBoard naming the same shape: copies of a
   * linked part join its link (components spec §3.2), and the shape holds the
   * cuts, so there is nothing to re-mint. A PLAIN source's copy is a plain
   * Board with NO `shape` key, a fresh id and fresh cut ids (nextId), its
   * arrays copied so no snapshot shares them.
   */
  const copyBoard = (source: StoredBoard, position: readonly [number, number, number], taken: Named[]): StoredBoard => {
    // Against the list AS IT GROWS: copies of "Leg" and "Leg (1)" would
    // otherwise both be named "Leg (2)" (invariant 8).
    const name = uniqueName(source.name, taken);
    if (isShaped(source)) {
      // Every own field by spread, so an optional one added to Board later is
      // copied rather than dropped silently (fu 231); the position array is fresh.
      const { id: _shapedId, ...own } = source;
      return { ...own, id: nextId(), name, position: [...position] };
    }
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
      position: [...position],
      cuts: source.cuts.map((cut) => ({ ...cut, id: nextId() })),
    });
    return { ...fresh, name };
  };

  /** Every OTHER world part using a shape one of the given parts uses. Read
   *  ONLY by updateBoards, so each other user is re-pivoted about its own
   *  centre when the shape's posture changes (components spec §4.1). */
  const shapeMates = (boards: Board[], ids: ReadonlySet<string>): Set<string> => {
    const shapes = new Set(boards.flatMap((b) => (ids.has(b.id) && b.shape ? [b.shape] : [])));
    return new Set(boards.filter((b) => !ids.has(b.id) && b.shape !== undefined && shapes.has(b.shape)).map((b) => b.id));
  };

  /** Replace the STORED part at an occurrence path (its container's copy, so
   *  every placement of a shared definition sees it). */
  const setStored = (doc: SloydDocument, occ: string, next: StoredBoard): SloydDocument =>
    updateContainer(doc, parentPath(occ), (c) => ({
      ...c, boards: c.boards.map((b) => (b.id === lastSegment(occ) ? next : b)),
    }));

  return {
    doc: createDocument(),
    selectedIds: [],
    past: [],
    future: [],
    hiddenIds: [],
    openPath: null,

    // Coalesce every edit within a gesture (a gizmo drag, a focused text
    // field) into a single undo entry. The snapshot is taken lazily — on the
    // first edit() inside the gesture, not in beginGesture() itself — so that
    // focusing and blurring a field without changing anything leaves no no-op
    // entry on the undo stack (invariant 4). See the declaration in
    // StoreState for why these two sit in the state and why nothing reads
    // them from a component.
    gesturing: false,
    gestureSnapshotTaken: false,
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
    tapeTyped: '',
    tapeAxis: null,

    // Changing tools always drops every held point — the two that can be
    // committed from (`grabbed`, `tapeAnchor`) and the tape's hover, which is
    // published for the readout and would otherwise leave a stale distance on
    // screen. A snap point carried into a different tool has nothing that can
    // consume it.
    //
    // `tapeTyped` goes with them, for a DIFFERENT reason than the other three
    // (see its declaration): a typed number is not stale, but with the anchor
    // gone there is no ray for it to be a distance along, so leaving it would
    // hand the next measurement a number the user typed for the previous one.
    setTool: (tool) =>
      set({ tool, grabbed: null, tapeAnchor: null, tapeHover: null, tapeTyped: '', tapeAxis: null }),

    grabSnapPoint: (point) => set({ grabbed: point }),

    cancelGrab: () => set({ grabbed: null }),

    setTapeAnchor: (point) => set({ tapeAnchor: point }),

    // Nulls the anchor AND the axis — the axis lives exactly as long as the
    // anchor it locks (see the `tapeAxis` declaration). It does NOT null the
    // hover: the hover follows, but not from here. It is TapeTool's anchor
    // effect (its `useEffect` keyed on `anchor`) that sees the anchor go null
    // and nulls the latched hover in turn.
    clearTapeAnchor: () => set({ tapeAnchor: null, tapeAxis: null }),

    setTapeHover: (point) => set({ tapeHover: point }),

    setTapeTyped: (text) => set({ tapeTyped: text }),

    setTapeAxis: (axis) => {
      // An explicit clear always lands — Escape's ladder calls it, and it must
      // work whether or not an anchor is still there.
      if (axis === null) {
        set({ tapeAxis: null });
        return;
      }
      // A lock with no anchor names no ray. Refused here rather than in each
      // of the two keyboard handlers, so neither needs a guard of its own.
      if (!get().tapeAnchor) return;
      set({ tapeAxis: get().tapeAxis === axis ? null : axis });
    },

    /**
     * Move the grabbed board so its grabbed point lands exactly on `target`.
     *
     * One subtraction, applied to every selected part through translateBoards — which is what earns undo,
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
     * Position only — a snap move translates, it never turns (invariant 2).
     */
    commitSnapMove: (target) => {
      const grabbed = get().grabbed;
      if (!grabbed) return;
      // MoveTool's candidate memo offers only the selected parts' points,
      // and every writer of the selection (selectionPatch) drops a grab that stops matching (see
      // edit() and selectBoard). This guard is deliberately redundant with
      // both: the filter makes the rule true of the UI, this makes it true of
      // the action, so a future writer of the selection that misses the rule
      // costs a grab that refuses to commit rather than a board that moves
      // without the user knowing which one it was. `grabbed` is deliberately
      // left in hand — this state is unreachable through the UI, and
      // discarding it quietly would hide that it had become reachable.
      const selected = new Set(get().selectedIds);
      // A part under a selected assembly counts as selected (assemblies spec §4.2).
      if (!isCovered(grabbed.owner.id, selected)) return;
      // No selected part can be a target. It is a legal subtraction — it
      // would translate the group by a member's own offset — but never what anyone
      // means. MoveTool also withholds these candidates so the case cannot be
      // clicked; this guard is what makes the rule true of the action itself.
      //
      // A selected part moves WITH the grab, so it can never be a target
      // (spec §4.2) — snapping a group onto one of its own members is a legal
      // subtraction and never what anyone means. The grabbed board itself is
      // one such part, so this is the self-snap rule widened, not a second
      // rule beside it. MoveTool withholds these candidates (moveCandidates),
      // so the case cannot be clicked; this makes the rule true of the action.
      // OWNERS are compared, not bare ids: a guide is a legal target, and a
      // guide whose id collided with a selected board's must not read as one.
      if (target.owner.type === 'board' && isCovered(target.owner.id, selected)) return;
      // Nor can ANOTHER PLACEMENT of a selected stored part: i1/b1 and i2/b1 are
      // one stored part, so the move carries the twin along and the target runs
      // away from the grab (fu 230). The same predicate moveCandidates filters by.
      const docNow = get().doc;
      if (target.owner.type === 'board' && sharesStorageWith([...selected], (p) => itemKey(docNow, p))(target.owner.id)) return;

      // The moving set is the selected items (parts or assemblies); the grab's
      // owner must be a world part under one of them (assemblies spec §4.2).
      const paths = itemPaths(get().doc);
      const moving = new Set([...selected].filter((id) => paths.has(id)));
      if (!worldParts(get().doc).some((b) => b.id === grabbed.owner.id) || !isCovered(grabbed.owner.id, moving)) {
        set({ grabbed: null });
        return;
      }

      const delta = [
        target.at[0] - grabbed.at[0],
        target.at[1] - grabbed.at[1],
        target.at[2] - grabbed.at[2],
      ] as const;

      // Guarded before the edit (invariant 4): a no-op move would leave a
      // no-op undo entry and silently wipe the redo stack.
      if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) {
        set({ grabbed: null });
        return;
      }

      // Every selected part by the SAME exact delta, unrounded (invariant 25),
      // as one edit. The selection is unchanged: the moved parts are exactly
      // the selected ones.
      translateBoards(moving, delta);
      set({ grabbed: null });
    },

    moveGroupTo: (ids, minCorner) => {
      const wanted = new Set(ids);
      // Bounds over the WORLD parts under the named items (assemblies spec §4.2).
      const paths = itemPaths(get().doc);
      const moving = worldParts(get().doc).filter((b) => isCovered(b.id, wanted));
      const bounds = boardsBounds(moving);
      if (!bounds) return;
      // Round the GROUP's min corner, once. Rounding each part's corner
      // instead would pull an off-grid part onto the grid and break the
      // layout by up to a sixteenth, invisibly (invariant 25).
      const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;
      const delta = [
        snap(minCorner[0]) - bounds.min[0],
        snap(minCorner[1]) - bounds.min[1],
        snap(minCorner[2]) - bounds.min[2],
      ] as const;
      if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) return;
      translateBoards(new Set([...wanted].filter((id) => paths.has(id))), delta);
    },

    addBoard: () => {
      // Into the open assembly when one is open, else the root (assemblies spec §3).
      const open = get().openPath;
      const c = containerAt(get().doc, open) ?? get().doc;
      // The template is the open level's last part, falling back to the root's last board when the open assembly has none.
      const lastStored = c.boards[c.boards.length - 1] ?? get().doc.boards[get().doc.boards.length - 1];
      const last = lastStored ? resolveBoard(shapeMap(get().doc), lastStored) : null;
      const fresh = createBoard(
        last
          ? { length: last.length, width: last.width, thickness: last.thickness, material: last.material }
          : {},
      );
      // createBoard has no view of the document and cannot dedupe — that is
      // the caller's job. See the note on createBoard. Names are unique among siblings.
      const board = { ...fresh, name: uniqueName(fresh.name, siblingsOf(get().doc, open)) };
      edit(
        (doc) => insertItems(doc, open, { boards: [board] }),
        () => [joinPath(open, board.id)],
      );
      set({ pendingLengthFocus: true });
    },

    updateBoard: (id, patch) => get().updateBoards([id], patch),

    updateBoards: (ids, patch) => {
      const world = worldParts(get().doc);
      const targets = new Set(ids.filter((id) => world.some((b) => b.id === id)));
      if (targets.size === 0) return;

      // Invariant 24: a grab holds a world position captured at grab time, not
      // a reference to the board. Properties stays fully live in Move mode
      // (App renders it unconditionally, and commitSnapMove leaves the moved
      // parts selected), so a Length or Posture edit reachable from the
      // panel can relocate the grabbed board out from under its own captured
      // point. Clearing here — conditionally, only when the grabbed board is
      // among the targets, the same shape as deleteBoards' guard just below — is what
      // keeps that invariant's enumeration true; committing afterward would
      // otherwise apply a delta derived from a position that no longer
      // describes anything.
      const grabbed = get().grabbed;
      if (grabbed && targets.has(grabbed.owner.id)) set({ grabbed: null });

      // BOTH TAPE FIELDS ARE DELIBERATELY ABSENT HERE, and their absence is the
      // rule rather than an omission: they are governed by the
      // dropHeldIfGone(id) call at the bottom of this action instead.
      //
      // A board-precise clause — the shape `grabbed` uses above — asks "did
      // this board change", and that is too loose for a captured point,
      // because `updateBoard` is also the ONLY rename path (there is no
      // renameBoard) and `{ name }`, `{ material }` and `{ grain }` move no
      // point at all. The anchor had such a clause and it destroyed a whole
      // measurement on a rename: nulling `tapeAnchor` nulls the hover through
      // TapeTool's anchor effect, which unmounts the readout. The hover had
      // one and it desynced the two halves — marker and measuring line still
      // drawn, readout showing no target. One argument, both fields, so one
      // survival test governs both.
      //
      // `grabbed` keeps its board-precise clause on purpose: it is Move-tool
      // state that predates this round by two, and narrowing it is a behaviour
      // change to a shipped tool rather than a fix to this one. Recorded in
      // the round's follow-ups rather than changed in passing.

      // A shaped target's shared fields are written ONCE, into its shape, so
      // every user sees them without propagation (components spec §4.1). The
      // other users are still patched, with only the shared part of the patch,
      // for ONE reason: a posture change must re-pivot each about its own
      // centre (invariant 2), since posture is shared and a min corner is not.
      // Their shape writes agree with the targets', so applyWorldEdits merges
      // them. Name, position and rotation never reach them. The board-precise
      // `grabbed` clause above is for the TARGETS only; the other users' held
      // points go through the point-precise test below.
      const shared = sharedPatch(patch);
      const others = Object.keys(shared).length === 0 ? new Set<string>() : shapeMates(world, targets);
      // Through mapWorld (assemblies spec §5.1): patchBoard runs on WORLD parts,
      // and only what it changed is written back, position as a delta.
      const t = oneEditPerTarget(get().doc, targets);
      const o = new Set([...oneEditPerTarget(get().doc, [...t, ...others])].filter((id) => !t.has(id)));
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        t.has(b.id) ? patchBoard(b, patch) : o.has(b.id) ? patchBoard(b, shared) : b)));

      // Point-precise, and AFTER the edit for the reason dropHeldIfGone's own
      // comment gives: the question is what the board offers once the edit has
      // landed. A rename leaves every point exactly where it was, so both the
      // anchor and the latched hover survive; a Length, Posture, Rotation or
      // Position change moves them, so they drop. A guide-owned anchor falls
      // through untouched — heldOnBoard requires `owner.type === 'board'` —
      // which is the same behaviour the deleted clause had. `grabbed` was
      // already nulled above if it named this board, so reaching it here is a
      // no-op rather than a second opinion. Every held point is judged: a
      // shape's Length moves every user's points, not only the targets'.
      judgeHeld();
    },

    deleteBoard: (id) => get().deleteBoards([id]),

    deleteBoards: (ids) => {
      // Ids are item paths: a part or an assembly, at any depth (assemblies spec §4.2).
      const paths = itemPaths(get().doc);
      const doomed = new Set(ids.filter((id) => paths.has(id)));
      // Guarded before edit(): a no-op would push an undo entry (invariant 4).
      if (doomed.size === 0) return;
      // A grab on a board being deleted has nothing left to move, an anchor
      // on one has nothing left to measure from, and a latched hover on one
      // has nothing left to measure TO — invariant 24, all three instances.
      //
      // Board-precise is exactly right HERE, unlike in updateBoard: a deleted
      // board offers no snap points at all, so "is this point still on offer"
      // and "is this a deleted board" are the same question with the same
      // answer for every point on it.
      const { grabbed, tapeAnchor, tapeHover } = get();
      if (grabbed && isCovered(grabbed.owner.id, doomed)) set({ grabbed: null });
      if (tapeAnchor?.owner.type === 'board' && isCovered(tapeAnchor.owner.id, doomed)) {
        set({ tapeAnchor: null, tapeAxis: null });
      }
      if (tapeHover?.owner.type === 'board' && isCovered(tapeHover.owner.id, doomed)) {
        set({ tapeHover: null });
      }
      edit(
        // Pruning unused definitions and shapes, and dissolving a shape left
        // with one user, ride in removeItems (assemblies spec §4.2, components §3.2).
        (doc) => removeItems(doc, [...doomed]),
        () => get().selectedIds.filter((id) => !isCovered(id, doomed)),
      );
      // A delete that empties an assembly removes it (fu 226), and the open
      // level may be that assembly: close to the deepest level left, as restore does.
      let open = get().openPath;
      while (open !== null && !instanceAt(get().doc, open)) open = parentPath(open);
      if (open !== get().openPath) set({ openPath: open, ...selectionPatch([], get().hiddenIds, open) });
      // A deleted part in a shared definition vanishes from every copy; a missing
      // part offers no points, so judgeHeld drops what was held on the others.
      judgeHeld();
      // The entry edit() pushed already recorded the set as it was. Filtered
      // against the NEW document, not only the doomed paths: a part deleted in
      // a shared definition is gone from every copy (fu 213, components §4.2).
      reconcileHidden();
    },

    duplicateBoard: (id) => get().duplicateBoards([id]),

    duplicateBoards: (ids) => {
      // Walk the ids in the order given — the selection's insertion order —
      // so the copies come out in that order within each kind: parts first, then
      // assemblies (the new selection lists the new parts, then the new assemblies).
      // Ids are item paths; every copy lands in its source's container, and
      // an assembly copies with its own definitions (assemblies spec §4.2).
      const doc = get().doc;
      const sources = [...new Set(ids)].filter((id) => itemPaths(doc).has(id));
      if (sources.length === 0) return;
      const container = parentPath(sources[0]!);
      const sameContainer = sources.filter((id) => parentPath(id) === container);
      const taken: Named[] = [...siblingsOf(doc, container)];
      const boards: StoredBoard[] = [];
      const instances: Instance[] = [];
      for (const id of sameContainer) {
        const part = partAt(doc, id);
        if (part) {
          const c = copyBoard(part, part.position, taken);
          taken.push(c);
          boards.push(c);
          continue;
        }
        const inst = instanceAt(doc, id);
        if (!inst) continue;
        const named = { ...shareInstance(inst), name: uniqueName(inst.name, taken) };
        taken.push(named);
        instances.push(named);
      }
      edit(
        (d) => insertItems(d, container, { boards, instances }),
        () => [...boards.map((b) => joinPath(container, b.id)), ...instances.map((i) => joinPath(container, i.id))],
      );
    },

    copyInRow: (ids, count, axis, sign, step) => {
      // Guarded before edit(): a refusal writes nothing (invariant 4). The
      // caller has run rowLayout; this re-checks only what would make a bad row.
      if (!Number.isInteger(count) || count < 2 || count > MAX_ROW) return;
      if (!Number.isFinite(step) || step <= 0) return;
      if (sign !== 1 && sign !== -1) return;
      const doc = get().doc;
      const all = [...new Set(ids)].filter((id) => itemPaths(doc).has(id));
      if (all.length === 0) return;
      // One container per row: the selection's (selectionPatch keeps it to one level).
      const container = parentPath(all[0]!);
      const sources = all.filter((id) => parentPath(id) === container);
      const taken: Named[] = [...siblingsOf(doc, container)];
      const boards: StoredBoard[] = [];
      const instances: Instance[] = [];
      const lin = containerLinear(doc, container);
      for (let k = 1; k < count; k += 1) {
        // From the ORIGINAL every time, never the previous copy: a running sum
        // drifts by an ulp per copy. Never rounded (invariant 25). The step is
        // a WORLD shift, turned into the container's frame, exactly (spec §4.2).
        const w: [number, number, number] = [0, 0, 0];
        w[axis] = k * step * sign;
        const local = toLocal(lin, w);
        const at = (p: readonly number[]) =>
          p.map((v, a) => (local[a] === 0 ? v : v + local[a]!)) as [number, number, number];
        for (const id of sources) {
          const part = partAt(doc, id);
          if (part) {
            const c = copyBoard(part, at(part.position), taken);
            taken.push(c);
            boards.push(c);
            continue;
          }
          const inst = instanceAt(doc, id);
          if (!inst) continue;
          const named = { ...shareInstance(inst), position: at(inst.position), name: uniqueName(inst.name, taken) };
          taken.push(named);
          instances.push(named);
        }
      }
      edit(
        (d) => insertItems(d, container, { boards, instances }),
        () => [...sources, ...boards.map((b) => joinPath(container, b.id)), ...instances.map((i) => joinPath(container, i.id))],
      );
    },

    // Selection is view state, not document state — deliberately not undoable.
    // Same rule as edit()'s: a held grab's owner must stay selected (selectionPatch). This
    // is the path the parts list takes, which is the only way to change which
    // board the Move tool will move (BoardMesh's `selectable` is false in
    // move mode, deliberately — design §4).
    //
    // `tapeAnchor` is DELIBERATELY NOT dropped by any of these three, the same prohibition
    // edit() carries and for the same reason (design §4.2): the rule above is
    // about the Move tool's selected-board grab set, and the tape has no such
    // restriction. Picking a part out of the parts list mid-measurement must
    // not silently discard the anchor. `tapeHover` is left alone here too,
    // for the same reason. A test pins the ANCHOR half of that here; the
    // hover's is pinned at edit()'s selection callback (two tests latch a
    // hover across addBoard()), not at this action.
    selectBoard: (id) => set(selectionPatch(id === null ? [] : [id])),

    toggleSelected: (id) => {
      const ids = get().selectedIds;
      set(selectionPatch(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    },

    // The open level's visible items: selectionPatch drops hidden ids and anything off that level.
    selectAll: () => set(selectionPatch(childrenOf(get().doc, get().openPath))),

    groupSelected: () => {
      const { doc, selectedIds, openPath } = get();
      const r = groupItems(doc, openPath, selectedIds);
      if (!r) return;
      editRekeyed(r.rekey, () => r.doc, () => [r.path]);
    },

    ungroupSelected: () => {
      let doc = get().doc;
      const children: string[] = [];
      const kept: string[] = [];
      const steps: Array<{ rekey: Rekey; lift: Lift }> = [];
      for (const id of get().selectedIds) {
        const r = ungroupItem(doc, id);
        // A selected plain part stays selected where it was; the ungrouped
        // children follow it.
        if (!r) { kept.push(id); continue; }
        doc = r.doc;
        children.push(...r.children);
        steps.push(r);
      }
      if (steps.length === 0) return;
      // Each step's paths are the previous step's output: compose in order.
      const through = (p: string) => steps.reduce<string[]>((ps, st) => ps.flatMap((q) => st.lift(q) ?? [st.rekey(q)]), [p]);
      editRekeyed((p) => steps.reduce((q, st) => st.rekey(q), p), () => doc, () => [...kept, ...children], through);
    },

    turnAssembly: (path, rotation) => {
      const inst = instanceAt(get().doc, path);
      if (!inst || inst.rotation === rotation) return;
      edit((doc) => turnInstanceOp(doc, path, rotation));
      // A turn inside a shared definition moves parts under the other copies too.
      judgeHeld();
    },

    mirrorAssembly: (path, mirrored) => {
      const next = setMirrored(get().doc, path, mirrored);
      if (next === get().doc) return; // invariant 4
      edit(() => next);
      // The assembly's parts moved (reflected), in every copy if it is nested in a shared definition.
      judgeHeld();
    },

    copyMirrored: (path) => {
      const r = mirroredCopy(get().doc, path);
      if (!r) return;
      edit(() => r.doc, () => [r.path]);
    },

    makeUnique: (path) => {
      const next = makeUniqueItem(get().doc, path);
      if (!next) return; // invariant 4
      edit(() => next);
    },

    selectCopies: (path) => {
      const doc = get().doc;
      const inst = instanceAt(doc, path);
      if (!inst) return;
      const container = parentPath(path);
      const c = containerAt(doc, container);
      if (!c) return;
      set(selectionPatch(c.instances.filter((i) => i.definition === inst.definition).map((i) => joinPath(container, i.id))));
    },

    renameItem: (path, typed) => {
      const doc = get().doc;
      const name = uniqueName(cleanName(typed), siblingsOf(doc, parentPath(path)), lastSegment(path));
      const inst = instanceAt(doc, path);
      if (inst) {
        if (name !== inst.name) {
          edit((d) => updateContainer(d, parentPath(path), (c) => ({
            ...c, instances: c.instances.map((i) => (i.id === inst.id ? { ...i, name } : i)),
          })));
        }
        return name;
      }
      const part = partAt(doc, path);
      if (part && name !== part.name) get().updateBoards([path], { name });
      return name;
    },

    openAssembly: (path) => {
      if (!instanceAt(get().doc, path)) return;
      set({ openPath: path, ...selectionPatch([], get().hiddenIds, path) });
    },

    closeAssembly: () => {
      const open = get().openPath;
      if (open === null) return;
      const up = parentPath(open);
      set({ openPath: up, ...selectionPatch([open], get().hiddenIds, up) });
    },

    selectItem: (path, toggle) => {
      const open = parentPath(path);
      if (open !== get().openPath) {
        set({ openPath: open, ...selectionPatch([path], get().hiddenIds, open) });
        return;
      }
      if (toggle) get().toggleSelected(path);
      else get().selectBoard(path);
    },

    clickPart: (occ, toggle) => {
      const { open, target } = clickTarget(occ, get().openPath);
      if (open !== get().openPath) {
        set({ openPath: open, ...selectionPatch([target], get().hiddenIds, open) });
        return;
      }
      if (toggle) get().toggleSelected(target);
      else get().selectBoard(target);
    },

    openPart: (occ) => {
      const { target } = clickTarget(occ, get().openPath);
      if (instanceAt(get().doc, target)) get().openAssembly(target);
    },

    hideSelected: () => {
      const { hiddenIds, selectedIds } = get();
      applyHidden([...hiddenIds, ...selectedIds]);
    },

    // Hides every item at the open level that is not selected. With nothing
    // selected this would hide them all, so it does nothing.
    hideUnselected: () => {
      const { hiddenIds, selectedIds, doc } = get();
      if (selectedIds.length === 0) return;
      applyHidden([...hiddenIds, ...childrenOf(doc, get().openPath).filter((id) => !selectedIds.includes(id))]);
    },

    showAll: () => applyHidden([]),

    setHidden: (id, hidden) => {
      const { hiddenIds } = get();
      applyHidden(hidden ? [...hiddenIds, id] : hiddenIds.filter((x) => x !== id));
    },

    setDocumentName: (name) => edit((doc) => ({ ...doc, name })),

    // `tapeHover` goes with the anchor in all three wholesale-rewrite actions
    // (here, undo and redo), for the reason invariant 24 states as its own
    // test: a wholesale rewrite of `doc.boards` can invalidate a held point by
    // moving it OR by removing its owner, and every board can move at once, so
    // no per-owner condition would be meaningful. Blanket is defensible for
    // one narrow reason, shared by every site that does it — the anchor is
    // nulled in the SAME statement, so the latch is already over and there is
    // nothing left to preserve. The full enumeration of which writers are
    // survival-tested, which are owner-conditional and which are blanket lives
    // at `tapeHover`'s declaration; do not restate a count here, which is how
    // this comment went stale once already.
    replaceDocument: (doc) =>
      set({
        doc,
        selectedIds: [],
        hiddenIds: [],
        openPath: null,
        past: [],
        future: [],
        grabbed: null,
        tapeAnchor: null,
        tapeHover: null,
        tapeAxis: null,
        // Follow-up 148. NOT the same reason as the held points above: those
        // clear because the world they name has been replaced, while these
        // clear because a gesture belongs to the component that opened it and
        // that component may be gone without ever having closed it. The reset
        // stops HERE — adding these two beside `grabbed: null` in undo/redo
        // would split one focused field's gesture in half after a Ctrl+Z,
        // which is a behaviour change with no defect behind it.
        gesturing: false,
        gestureSnapshotTaken: false,
      }),

    undo: () => {
      const { past, future, doc, hiddenIds, selectedIds } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1]!;
      // Undo ends a run of eye toggles: popping a LATER entry can leave the run's
      // entry on top again, and the identity check would wrongly continue it.
      hideRunEntry = null;
      set({
        past: past.slice(0, -1),
        future: [{ doc, hiddenIds }, ...future].slice(0, HISTORY_LIMIT),
        ...restore(previous, doc, selectedIds),
      });
    },

    redo: () => {
      const { past, future, doc, hiddenIds, selectedIds } = get();
      if (future.length === 0) return;
      const next = future[0]!;
      hideRunEntry = null; // a redo ends a run, like undo
      set({
        past: [...past, { doc, hiddenIds }].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        ...restore(next, doc, selectedIds),
      });
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,

    beginGesture: () => set({ gesturing: true, gestureSnapshotTaken: false }),
    endGesture: () => set({ gesturing: false, gestureSnapshotTaken: false }),

    /**
     * A quarter-thickness dado in the broad face, a quarter of the way along.
     * Chosen to be visible and legal on any board rather than to be a common
     * joint: it is a starting point to edit, and every number in it is a
     * fraction of the board's own dimensions, so it fits whatever it lands on.
     */
    addCut: (boardId) => {
      const world = worldParts(get().doc);
      const board = world.find((b) => b.id === boardId);
      if (!board) return;
      const cut: Cut = {
        id: nextId(),
        face: 'thickness',
        // fu 215: on-edge's thickness axis is reversed (schema 12), so its 'max' side is the face away from the
        // default camera; 'min' there is the world +Z face (the pre-v12 placement at every turn). Flat and
        // upright keep 'max' (world +Y / the facing side).
        from: board.posture === 'on-edge' ? 'min' : 'max',
        across: 'width',
        offset: board.length / 4,
        width: Math.min(0.75, board.length / 4),
        depth: board.thickness / 2,
        stopMin: 0,
        stopMax: 0,
      };
      // Through mapWorld (assemblies spec §5.1). On a shaped part the cuts are
      // the shape's, so ONE cut with ONE id reaches every user (components
      // spec §4.1); no other part is touched.
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (b.id === boardId ? { ...b, cuts: [...b.cuts, cut] } : b))));
      judgeHeld();
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
      const world = worldParts(get().doc);
      const board = world.find((b) => b.id === boardId);
      if (!board || !board.cuts.some((c) => c.id === cutId)) return;
      // Through mapWorld (assemblies spec §5.1); a shaped part's cuts are its
      // shape's, so every user sees the edit (components spec §4.1).
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId
          ? { ...b, cuts: b.cuts.map((c) => (c.id === cutId ? { ...c, ...patch } : c)) }
          : b)));
      judgeHeld();
    },

    removeCut: (boardId, cutId) => {
      const world = worldParts(get().doc);
      const board = world.find((b) => b.id === boardId);
      if (!board || !board.cuts.some((c) => c.id === cutId)) return;
      // Through mapWorld (assemblies spec §5.1); see updateCut.
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, cuts: b.cuts.filter((c) => c.id !== cutId) } : b)));
      judgeHeld();
    },

    linkBoards: (ids) => {
      const doc0 = get().doc;
      const plan = linkPlan(worldParts(doc0), ids, (p) => storageKey(doc0, p));
      if (!plan) return; // fewer than two, or nothing would change (invariant 4)
      // Every member but the source takes the source's shared fields through
      // patchBoard, so a posture change pivots it about its own centre
      // (invariant 2). One edit per storage target, the source's FIRST, so
      // another placement of the source's own stored part is never patched.
      const patched = oneEditPerTarget(doc0, [plan.source.id, ...plan.members]);
      patched.delete(plan.source.id);
      const shapeId = plan.shape ?? nextId();
      edit((doc) => {
        let out = mapWorld(doc, (w) => w.map((b) => (patched.has(b.id) ? patchBoard(b, sharedOf(plan.source)) : b)));
        // The shape takes the source's shared fields, cut ids kept: the
        // source's existing shape (or a selected member's), else a new one.
        const shape = { id: shapeId, ...sharedOf(plan.source) };
        out = { ...out, shapes: out.shapes.some((x) => x.id === shapeId)
          ? out.shapes.map((x) => (x.id === shapeId ? shape : x))
          : [...out.shapes, shape] };
        // Every member's STORED part becomes a shaped part: its own fields as
        // stored (never the world ones, which a turned assembly changes),
        // after the pivot above.
        for (const occ of plan.members) {
          const p = partAt(out, occ);
          if (p) out = setStored(out, occ, { id: p.id, name: p.name, position: p.position, rotation: p.rotation, shape: shapeId });
        }
        // A member's old shape, all of whose users are members, is now unused.
        return pruneShapes(out);
      });
      judgeHeld();
    },

    unlinkBoards: (ids) => {
      const doc0 = get().doc;
      const drop = [...new Set(ids)].filter((id) => { const p = partAt(doc0, id); return p !== null && isShaped(p); });
      if (drop.length === 0) return; // invariant 4
      edit((doc) => {
        // Each selected shaped part becomes a plain part carrying a copy of
        // its shape's fields, cut ids kept; a shape left with one user
        // dissolves the same way (components spec §3.2). Nothing moves.
        let out = doc;
        for (const occ of drop) {
          const p = resolvedPartAt(out, occ);
          if (p) out = setStored(out, occ, plainOf(p));
        }
        return dissolveShapes(out);
      });
    },

    // Through selectionPatch, which drops hidden ids and carries invariant
    // 24's retargeting rule.
    selectLinked: (id) => {
      const world = worldParts(get().doc);
      const b = world.find((x) => x.id === id);
      if (!b?.shape) return;
      set(selectionPatch(world.filter((x) => x.shape === b.shape).map((x) => x.id)));
    },

    /**
     * Place a guide point. Document data, so it lands on the undo stack like
     * any other edit — a guide the user placed is a fact about the project.
     *
     * Deliberately does NOT change `selectedIds`: a guide is not a board, and
     * the properties panel is a panel for boards. Compare commitSnapMove,
     * which keeps the moved parts selected.
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
        set({ tapeAnchor: null, tapeAxis: null });
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
      // holding a stale point in between.) It is one of the blanket sites
      // enumerated at `tapeHover`'s declaration, and defensible for the reason
      // they all share: the field it depends on is cleared blanket in the same
      // statement.
      set({ tapeAnchor: null, tapeHover: null, tapeAxis: null });
      edit((doc) => ({ ...doc, guides: [] }));
    },
  };
});
