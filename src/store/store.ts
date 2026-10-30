import { create } from 'zustand';
import { alignDeltas, distributeDeltas, itemExtents, type AlignItem } from '../document/align';
import { stretchPlan } from '../document/stretch';
import {
  partsBounds, cleanName, createBoard, createDocument, createGuide, canonicalLine, lineThrough, newLineOf, sameNewLine, ownedByGuide, heldBoard, heldRoot, isAnyLine, isGuideLine, reorientedPosition, uniqueName, isSheetGood, nextId, sameSnapPoint, snapPointsFor,
  linkPlan, sharedOf, sharedPatch, isShaped, plainOf, pruneShapes, dissolveShapes,
  childrenOf, instanceAt, isCovered, itemPaths, parentPath, worldParts, mapWorld,
  translateItems, insertItems, itemKey, sharesStorageWith, removeItems, shareInstance, makeUniqueItem, storageKey, siblingsOf, containerAt, containerLinear, definitionAt, mirroredAt, sideAt, postureRefusal, sameSideFirst, partAt, resolvedPartAt, resolveBoard, shapeMap, joinPath,
  toLocal, inverseTurn, addTurns, withoutFlag, groupItems, ungroupItem, turnInstance as turnInstanceOp, setMirrored, mirroredCopy, updateContainer, lastSegment,
} from '../document/document';
import type { CutFrom, SavedView, SavedViewCamera, BandType, HardwareType, ProfileSide, RoundTenon, AngleCut, Board, Lean, HoleRow, CurveCut, ProfileCut, CustomMaterial, BoardSnapPoint, Cut, Instance, Lift, Named, Rekey, Rotation, Section, Guide, NewLine, SloydDocument, SnapPoint, StoredBoard, TapeAxis } from '../document/document';
import type { LengthDisplay } from '../units/length';
import { snapToGrid } from '../document/geometry';
import { rotateVec } from '../document/frames';
import { chooseFace, leanMap, leans, leanTwist, pivotKeptPosition, seamFree, slopeOf, withinBound, worldSlopes } from '../document/lean';
import { isLevelled, levelPlan, levelUsersDisagree, type LevelPlan } from '../document/levelEnds';
import { socketPlan } from '../document/legSockets';
import { lineFaceHits } from '../document/lineFaces';
import { camJointPlan } from '../document/camJoint';
import { refitPlan, stretcherOf, stretcherPlan } from '../document/stretchers';
import { STRETCHER_NOT_A_STRETCHER } from '../document/stretcherText';
import { applyBoxJoints, boxJointPlan } from '../document/boxJoints';
import { applyDovetails, dovetailCutRefusal, dovetailPlan, dovetailZones } from '../document/dovetails';
import { dovetailsOf, hasDovetails, withDovetails } from '../document/dovetailModel';
import { dovetailMoveClear, dovetailRemoveFirst } from '../document/dovetailText';
import { displayNames } from '../document/tree';
import { copyAngleCut, sameAngleCut } from '../document/angleCuts';
import { copyCurve, sameCurve } from '../document/curves';
import { copyProfile, sameProfile } from '../document/profiles';
import { copyBand, sameBands, withBands, withBandTypes } from '../document/bandModel';
import { copyHardwareUse, HARDWARE_COUNT_MAX, sameHardware, withHardwareTypes, withHardwareUse } from '../document/hardwareModel';
import { addedTenonFaults, copyTenon, sameTenon, tenonAt, tenonFaults, tenonsOf, withTenons } from '../document/roundTenons';
import { copyDovetail } from '../document/dovetailModel';
import { TENON_END_FIXED, TENON_END_TAKEN, TENON_SIZE_POSITIVE, tenonFaultText } from '../document/tenonText';
import type { HardwareTarget } from '../document/hardware';
import { boardHoles, copyHoleRow, headProblem, holeTouchesBox, sameHoleRow } from '../document/holes';
import { withinTiltBound } from '../document/holeTilt';
import { pruneMaterials, upsertMaterials, materialUses } from '../document/materials';
import { MAX_ROW } from '../document/row';
import { clickTarget } from './assemblyPick';
import { rekeyViews } from '../document/views';

const HISTORY_LIMIT = 50;

/** A row's tilt is within the loader's ONE bound (`withinTiltBound`); a square row always is. */
const tiltWithin = (r: Pick<HoleRow, 'tiltAlong' | 'tiltAcross'>): boolean => withinTiltBound(r.tiltAlong ?? 0, r.tiltAcross ?? 0);
/** The stored form of a row's tilt (Global Constraints): a slope is stored only when non-zero, so a zero (or −0) key goes. */
function storedTilt(r: HoleRow): HoleRow {
  // An explicit `undefined` key is a key too (`in` reads it): a row with no tilt has no tilt KEYS (Task 9 review).
  const keeps = (k: 'tiltAlong' | 'tiltAcross') => !(k in r) || (r[k] !== undefined && r[k] !== 0);
  if (keeps('tiltAlong') && keeps('tiltAcross')) return r;
  const { tiltAlong, tiltAcross, ...rest } = r;
  return { ...rest, ...(tiltAlong ? { tiltAlong } : {}), ...(tiltAcross ? { tiltAcross } : {}) };
}

/** The stored form of a row's head (counterbores spec §3.1): the four keys are present together or not at all, so an
 *  explicit `undefined` key is removed (`storedTilt`'s twin). */
function storedHead(r: HoleRow): HoleRow {
  const keys = ['head', 'headDiameter', 'headDepth', 'headAngle'] as const;
  if (!keys.some((k) => k in r && r[k] === undefined)) return r;
  const out = { ...r };
  for (const k of keys) if (k in out && out[k] === undefined) delete out[k];
  return out;
}
/** addHoleRows' and updateHoleRow's head refusals (counterbores spec §3.2), verbatim; the loader drops the same rows. */
export const HEAD_NOT_WIDER = 'The counterbore or countersink must be wider than the hole.';
export const HEAD_TOO_DEEP = 'The counterbore or countersink must be shallower than the hole.';
export const HEAD_ON_TILT = "A tilted hole can't take a counterbore or countersink yet.";
export const TILT_ON_HEAD = 'Remove the counterbore or countersink before tilting the hole.';
export const HEAD_MALFORMED = "That counterbore or countersink isn't valid.";
/** The sentence for a row's head problem (`headProblem`, the loader's own decider), or null. `hadHead`: the STORED row
 *  already had a head, so a tilt is what was added (TILT_ON_HEAD) rather than the head (HEAD_ON_TILT). */
export function headRefusal(r: Omit<HoleRow, 'id'>, hadHead: boolean): string | null {
  switch (headProblem(r)) {
    case null: return null;
    case 'malformed': return HEAD_MALFORMED;
    case 'not-wider': return HEAD_NOT_WIDER;
    case 'too-deep': return HEAD_TOO_DEEP;
    case 'tilted': return hadHead ? TILT_ON_HEAD : HEAD_ON_TILT;
  }
}

/** A tenon size the loader keeps (`validateTenons`: finite and > 0); anything else would vanish on reload. */
const tenonSize = (v: number): boolean => Number.isFinite(v) && v > 0;

/** `setLean`'s world argument: signed degrees, and/or a direction (±1) that keeps the part's own magnitude, and/or the
 *  Set (square-set legs spec §3.2): `square` true is square to the sides, false turned to the lean; absent keeps a
 *  leaning part's own setting, and a part that does not lean yet becomes square-set. */
export interface LeanWorld { rake?: number; splay?: number; rakeSign?: 1 | -1; splaySign?: 1 | -1; square?: boolean }

/** setLean's refusals (splayed legs spec §3.2, §4; angled holes §7), verbatim. */
export const LEAN_NOT_UPRIGHT = 'Only an upright part can lean.';
export const LEAN_PAST_BOUND = "The lean can't pass 45° in all — reduce the rake or splay.";
/** Angled holes §7: a lean edit whose seam-free face differs from the stored one turns the part's features a quarter
 *  turn about its length; on a holed part that would turn its sockets the wrong way. */
export const LEAN_TURNS_HOLES = 'This lean would turn the part a quarter turn about its length, and its holes with it — keep both angles above 0, or remove the holes first.';
/** Square-set legs spec §3.2: a Set change turns the part about its length by the seam-free twist τ (`leanTwist`),
 *  carrying its holes; refused on a holed part when τ ≠ 0 (a rake-only or splay-only lean has τ = 0: the same map). */
export const LEAN_SET_TURNS_HOLES = 'Changing how this leg is set would turn it about its length and move its holes — remove the holes first.';
/** addHoleRows' and updateHoleRow's refusal (angled holes §3.1): `withinTiltBound`, the loader's own bound. */
export const HOLE_TILT_PAST_BOUND = "The bore can't tilt past 45° in all — reduce an angle.";

/**
 * Which viewport tool has the pointer. View state, not document state — it is
 * never saved and never undone, exactly like `selectedIds`.
 */
export type ToolMode = 'select' | 'move' | 'tape';

/** One undo step: a document and BOTH hidden sets as they were (inv 43; the guide set, selectable-guides spec §3.4). A
 *  hide or show pushes an entry holding the SAME document object, so no copy is made and autosave does not fire. */
export interface HistoryEntry { doc: SloydDocument; hiddenIds: string[]; hiddenGuideIds: string[] }

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
  /**
   * The selected guides (selectable-guides spec §3.1, fu 591), insertion order, no duplicates. View state like
   * `selectedIds` — never saved, never undone — and kept APART from it because ids are unique only per kind (inv 33) and
   * everything that reads `selectedIds` reads parts. A selection is parts OR guides, never both (spec §3.2). Written ONLY
   * through `guideSelectionPatch`, beside `selectionPatch`: the pair is inv 42's ONE writer.
   */
  selectedGuideIds: string[];
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
   * It needs two actions `grabbed` does not: removeGuides (with removeGuide, which delegates to it) and clearGuides. A
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
   *  - `deleteBoard` and `removeGuides` (`removeGuide` delegates to it) are owner-conditional, which is exactly
   *    point-precise there: neither owner offers any point afterward. A guide-owned point may be a
   *    crossing (`owner.cross`), so removal tests both ids through `ownedByGuide`.
   *  - `setTool`, `clearGuides` and `replaceDocument` clear it blanket.
   *    `undo` and `redo` do too, through `restore`, but only when the restored
   *    document is a different object (invariant 43). Each is defensible only
   *    because it nulls the ANCHOR in the same statement. No anchor, no latch:
   *    TapeReadout renders nothing without one and every commit path returns
   *    on it, so there is nothing left to preserve. That is a property of those
   *    statements, not a licence to add another.
   *  - `setExplode` leaving 0 reaches the blanket clear THROUGH `setTool('select')` — the drawn
   *    world no longer matches world positions (plans-sheet spec §4.1). It is not a new writer.
   *  - A face hit (`owner.board`, construction-lines-2 §3.2) depends on its line AND its part: removal drops it through
   *    `ownedByGuide`, and every part judgement above judges it as `heldBoard` names, surviving while that line's
   *    `lineFaceHits` on the post-edit part still include it.
   *  - A stepped anchor (`base`, §4.2) survives exactly as long as its base would: every judgement above reads `heldRoot`.
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
   *    owner-conditional in `deleteBoard`/`removeGuides`, point-precise inside
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
  /**
   * Returns a refusal sentence (`postureRefusal`: a posture change on a leaning part, or across a mirror), else
   * undefined — not null, so a `DimensionField`'s `onCommit` (void | string) can return it straight through.
   */
  updateBoard: (id: string, patch: Partial<Board>) => string | undefined;
  /**
   * One patch to every named part, as ONE undo entry. Each part goes through
   * the same per-board rules a single edit does — its own min corner, its own
   * reorient pivot, its own sheet-good grain reset — so a group edit is N
   * single edits sharing one snapshot. Unknown ids are ignored.
   */
  /** `adopt`: custom materials copied into the document in the SAME edit (a library pick, spec §4.2). */
  updateBoards: (ids: string[], patch: Partial<Board>, adopt?: CustomMaterial[], bandTypes?: BandType[], hardwareTypes?: HardwareType[]) => string | undefined;
  /**
   * The Materials & prices dialog's project write (spec §4.1): its edited copies, and with `assign` the
   * selection's new material — ONE edit, one undo entry. Unused copies are pruned by edit(). Refused while exploded.
   */
  applyMaterials: (upserts: CustomMaterial[], assign?: { ids: string[]; material: string }, bandTypes?: BandType[], hardwareTypes?: HardwareType[]) => void;
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
  /**
   * The hidden guides (selectable-guides spec §3.4), insertion order, no duplicates. View state beside `hiddenIds`, kept
   * apart for the reasons at `selectedGuideIds`, and under the SAME rules (invariant 43): written by the three guide
   * actions below and `showAll` ONLY through `applyHidden`, in the undo history, never in the document or a saved view
   * (views are board-only); `restore`, `edit()` (removeGuides, clearGuides) and `replaceDocument` merely reconcile it.
   * A hidden guide is never selected (`guideSelectionPatch` filters it out), and is neither drawn nor snapped to
   * (`visibleGuides`, the ONE filter).
   */
  hiddenGuideIds: string[];
  hideSelected: () => void;
  hideUnselected: () => void;
  /** Shows every part AND every guide, as one entry (selectable-guides spec §3.3). */
  showAll: () => void;
  setHidden: (id: string, hidden: boolean) => void;
  /** Hides the selected guides; they leave the selection, as hidden parts do. */
  hideSelectedGuides: () => void;
  /** Hides every guide not selected, parts untouched. With no guide selected it would hide them all, so it does nothing. */
  hideOtherGuides: () => void;
  /** The Guides list's eye: hides or shows one guide. */
  setGuideHidden: (id: string, hidden: boolean) => void;
  /**
   * How far the viewport's exploded view is spread, 0..1 (plans-sheet spec §4). View state: not in
   * the document, not in undo, not saved; `replaceDocument` resets it. While it is above 0 the model
   * is READ-ONLY: `edit()`, `undo` and `redo` are the gate; any action with side effects outside
   * `edit()` also refuses at entry (`readOnly()`); `setTool` refuses all but Select; `renameItem`
   * returns the stored name. UI disabling is a courtesy on top.
   * `setExplode` is its ONE writer: refused inside a gesture, refuses a non-finite value, clamps.
   * Leaving 0 goes through `setTool('select')`, the existing blanket clear — no new clearing writer.
   */
  explode: number;
  setExplode: (amount: number) => void;
  /**
   * The viewport's section cut (section-cut spec §2.1; invariant 51): ONE axis plane, or null. View state, like
   * `hiddenIds` and `explode`: never in the document, never autosaved, no undo entry. `setSection` is its ONE writer
   * and refuses a non-finite position; nothing clamps `at` (an edit that leaves it outside the parts keeps it).
   * Reset only where `explode` is (the initial state and `replaceDocument`); undo, redo, `setTool` and Escape leave it.
   */
  section: Section | null;
  setSection: (next: Section | null) => void;
  /**
   * X-ray (x-ray spec §2): the selection draws solid and every other part faded (`viewport/xray.ts` `fadedFor`). View state,
   * like `section`: never in the document, never autosaved, no undo entry. `setXray` is its ONE writer and refuses nothing —
   * it moves and edits nothing, so it works exploded and mid-gesture. Reset only where `explode` is (the initial state and
   * `replaceDocument`).
   */
  xray: boolean;
  setXray: (on: boolean) => void;
  /**
   * The stretch line's guide plane (parametric-resize spec §8): `at` is a WORLD coordinate on `axis`. View state like `section`:
   * never in the document, undo or autosave. `setStretchGuide` is its ONE writer. Cleared by a successful stretch, by
   * `selectionPatch` when the selection actually changes (an undo/redo that keeps it leaves the guide), by `setExplode` above 0,
   * and by `replaceDocument`.
   */
  stretchGuide: { axis: 0 | 1 | 2; at: number } | null;
  setStretchGuide: (g: { axis: 0 | 1 | 2; at: number } | null) => void;
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
  /**
   * Align the selection along a world axis to the item selected FIRST, which never moves (align spec §3, §5): exact, one
   * undo entry, held points re-judged. Returns null (applied, a no-op, or refused at entry: exploded, gesturing, under 2).
   */
  alignItems: (axis: 0 | 1 | 2, edge: 'min' | 'centre' | 'max') => string | null;
  /** Equal gaps along a world axis, the two outermost items fixed (align spec §4, §5): its refusal sentence, else null. */
  distributeItems: (axis: 0 | 1 | 2) => string | null;
  /**
   * Stretch the selection to `size` on a world axis at the world line `line` (parametric-resize spec §7): its refusal
   * sentence, else null (applied, a no-op, or refused at entry: exploded, gesturing, nothing selected). One undo entry.
   */
  stretchItems: (axis: 0 | 1 | 2, size: number, line: number) => string | null;
  /** Select one part; `null` is the user's "select nothing" (the viewport's miss) and clears BOTH kinds (spec §3.3). */
  selectBoard: (id: string | null) => void;
  /** Without toggle the guide selection becomes `[id]`; with it, `id` is added or removed. Clears any part selection. */
  selectGuide: (id: string, toggle: boolean) => void;
  /** Replace the guide selection; `[]` clears the guide selection only (Escape, spec §5). */
  selectGuides: (ids: string[]) => void;
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
  /**
   * The Mirrored checkbox of a LINKED part (mirrored links, fu 432, spec §5.2): the part becomes its mirror image in
   * place, left to right across WORLD X — the own `mirrored` flag flipped AND its stored turn r set to -(2a + r), where a
   * is the rotation of the occurrence's container chain (in the container, world X is M_x R(2a); M_x R(2a + r) =
   * R(-(2a + r)) M_d0; the same for a mirrored chain, 2a ≡ -2a mod 360). Position kept, so its box is unchanged.
   * A stored part shared by placements at different chain turns gets world X for the SELECTED occurrence only; its other
   * copies reflect across another world axis — a consequence of sharing, not a bug.
   * Refused while exploded (inv 47) and for a part that uses no Shape; a no-op when unchanged (inv 4).
   */
  mirrorLinkedPart: (path: string, mirrored: boolean) => void;
  /** Place a shared, opposite-flag copy beside the assembly and select it (spec §5). */
  copyMirrored: (path: string) => void;
  /** Give the instance its own copy of its definition (components spec §3.1). */
  makeUnique: (path: string) => void;
  /** Select the instances at the open level naming the same definition. */
  selectCopies: (path: string) => void;
  /** Rename a part or an assembly, unique among its siblings; returns the stored name. */
  renameItem: (path: string, typed: string) => string;
  setDocumentName: (name: string) => void;
  /** The project's length display (metric-display spec §2, R1): one document edit, moves no number. A no-op when unchanged. */
  setUnitsDisplay: (display: LengthDisplay) => void;
  /** The project's saw kerf (fu 98): one edit; refused outside [0, 1), the range the loader keeps. */
  setKerf: (kerf: number) => void;
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

  /** Refused (dovetails spec §3.6), before `edit()`, with `dovetailMoveClear` when the cut's `clippedRegion` meets a
   *  dovetailed end's zone and does not run straight through it (`dovetailCutRefusal`); null otherwise (also for a stale
   *  id and while exploded). */
  addCut: (boardId: string) => string | null;
  /** As addCut: refused when the edited cut meets a dovetailed end's zone, except one running straight through that end
   *  along the dovetail's run (a drawer bottom's groove: `cutRunsThrough`, the corner planner's ONE predicate). */
  updateCut: (boardId: string, cutId: string, patch: Partial<Cut>) => string | null;
  removeCut: (boardId: string, cutId: string) => void;
  /** Angle cuts (angle-cuts spec §7): several in one call are one undo entry. */
  /** Refused on a dovetailed part (dovetails spec §3.6: `dovetailRemoveFirst`), before `edit()`; null otherwise. */
  addAngleCuts: (boardId: string, cuts: Omit<AngleCut, 'id'>[]) => string | null;
  updateAngleCut: (boardId: string, cutId: string, next: Omit<AngleCut, 'id'>) => void;
  removeAngleCut: (boardId: string, cutId: string) => void;
  /** Hole rows (holes spec §7): several in one call are one undo entry. */
  /** Refused, with `HOLE_TILT_PAST_BOUND`, when a row's tilt is past the bound (angled holes §3.1); null otherwise. A
   *  leaning part takes holes like any other (angled holes §7). A zero tilt key is not stored. Refused with
   *  `dovetailMoveClear` when a hole of the new rows touches a dovetailed end's zone (dovetails spec §3.6). */
  addHoleRows: (boardId: string, rows: Omit<HoleRow, 'id'>[]) => string | null;
  /** As addHoleRows: `HOLE_TILT_PAST_BOUND` past the bound, `dovetailMoveClear` for an edited row touching a dovetailed
   *  end's zone, decided before any mutation; null otherwise. */
  updateHoleRow: (boardId: string, rowId: string, next: Omit<HoleRow, 'id'>) => string | null;
  /** The same per-row steps and refusals as updateHoleRow for each edit (cam-and-bolt spec §4.3); any refusal refuses
   *  all, before any mutation. A no-op row is skipped; if every row is a no-op nothing is pushed (inv 4), else ONE edit()
   *  replaces all the edited rows (one undo entry). */
  updateHoleRows: (boardId: string, edits: { rowId: string; next: Omit<HoleRow, 'id'> }[]) => string | null;
  removeHoleRow: (boardId: string, rowId: string) => void;
  /**
   * Round tenons (round tenons spec §4) on the WORLD part `boardId`, `end` in its world frame (a mirrored Shape user's
   * end is lowered through its mirror by `mapWorld`, inv 46). Refused, with the first fault's `tenonFaultText`, on ANY
   * `tenonFaults` of the new tenon, decided before `edit()`; with `TENON_END_TAKEN` for an end that already has one (at
   * most one per end) and `TENON_SIZE_POSITIVE` for a size the loader would drop (not finite and > 0; ruling T8b). Null
   * and nothing done while exploded (inv 47) or gesturing, and for a stale part id (the hole actions' convention). The
   * part's `length` is never changed (spec §4: the shoulder moves inward). One undo entry.
   */
  addTenon: (boardId: string, end: RoundTenon['end'], diameter: number, length: number) => string | null;
  /** As addTenon, but refused only when the edit ADDS a fault (`addedTenonFaults`): a tenon a later resize faulted can
   *  still be edited toward fitting. `next.end` must be the tenon's own end (`TENON_END_FIXED` otherwise: the edit rule
   *  pairs a tenon with its before-state by end); `TENON_SIZE_POSITIVE` as addTenon. A stale part or tenon id is null
   *  and nothing done (as updateHoleRow). An unchanged tenon pushes no undo entry (inv 4). */
  updateTenon: (boardId: string, tenonId: string, next: Omit<RoundTenon, 'id'>) => string | null;
  /** Removes the tenon; the last one leaves no `tenons` key (never `[]`). Never refused but while exploded or gesturing. */
  removeTenon: (boardId: string, tenonId: string) => void;
  /** Removes that end's dovetail only (dovetails spec §4: the partner keeps its own; no stored partner link); the last one
   *  leaves no `dovetails` key (never `[]`). As removeTenon: nothing done while exploded or gesturing, or for a stale id. */
  removeDovetail: (boardId: string, dovetailId: string) => void;
  /** Curve cuts (curves spec §8): several in one call are one undo entry. */
  addCurves: (boardId: string, curves: Omit<CurveCut, 'id'>[]) => string | null;
  updateCurve: (boardId: string, curveId: string, next: Omit<CurveCut, 'id'>) => void;
  removeCurve: (boardId: string, curveId: string) => void;
  /** Edge profiles (profile runs a1): as curves. */
  addProfiles: (boardId: string, profiles: Omit<ProfileCut, 'id'>[]) => string | null;
  updateProfile: (boardId: string, profileId: string, next: Omit<ProfileCut, 'id'>) => void;
  removeProfile: (boardId: string, profileId: string) => void;
  /** Sets `sides` to band type `type` (null clears) on every named part, one edit, one undo entry; refused while exploded.
   *  Adding a band (`type` not null) to a dovetailed part refuses with `dovetailRemoveFirst` (dovetails spec §3.6); a
   *  clear never refuses. */
  setBands: (ids: string[], sides: readonly ProfileSide[], type: string | null) => string | null;
  /**
   * The Lean section's write (splayed legs spec §3.1, §3.4, §4): signed WORLD degrees — rake + is the foot toward the
   * front (+Z), splay + toward the right (+X) — for the selected placement; an absent one leaves that slope exactly as
   * stored; `null` clears the lean. Each becomes a world slope (`slopeOf`), then the part's turn-0 slopes (the inverse
   * turn, exact), then the stored ones through `mapWorld`'s lowering (a flip per mirror). Users of one Shape collapse
   * to the FIRST selected (the rest follow through the Shape, each in its own hand). ONE undo entry. Returns a refusal
   * sentence, decided for every target before `edit()` — not upright, holes, past the bound — or null; refused
   * silently (null) while gesturing or exploded. Clear is never refused. Square-set legs §3.2: a first lean is
   * square-set; `world.square` is the Set change (alone, it keeps the slopes bit for bit), refused on a holed part when
   * it would turn the part (`LEAN_SET_TURNS_HOLES`, τ ≠ 0); the face re-choice refusal applies only to a turned lean.
   *
   * Sets the lean in SIGNED world degrees (rake + = foot toward the front, splay + = toward the right); null clears.
   * `keepSign` reads `rake`/`splay` as MAGNITUDES and gives each part its OWN current world sign (a part at 0 takes +),
   * so a symmetric selection keeps its sides. `rakeSign`/`splaySign` (±1) set only the DIRECTION, keeping each part's own
   * magnitude exactly (no trig round trip). Still ONE write per Shape (the first selected user) and ONE undo entry.
   */
  setLean: (ids: string[], world: LeanWorld | null, opts?: { keepSign?: boolean }) => string | null;
  /**
   * Level the ends (splayed legs spec §5): the foot cut to the floor and the top level, the length set at each end
   * (`levelPlan`), for EVERY user of the part's Shape and every placement of its stored part, in ONE undo entry.
   * Returns a refusal sentence — an end already cut, the top at or below the floor, users' tops at different heights —
   * decided before `edit()`, or null. Null and nothing done for a part that does not lean, while gesturing or exploded,
   * and when every user is already levelled (inv 4: a second press pushes no entry).
   */
  levelEnds: (id: string) => string | null;
  /**
   * Bore leg sockets (angled holes spec §5) on the world part `seatId`: `socketPlan` decides every refusal for every copy
   * of the seat before `edit()`, then ONE write of the seat's rows through `mapWorld` (lowered through its turn, posture
   * and mirrors, and into its Shape once), one undo entry. Returns the plan's refusal, or its note when a faulted socket
   * was left out and the others bored, or null. Null and nothing done while gesturing or exploded (inv 47), for a part
   * that leans, and when every leg already has its socket (inv 4: no entry).
   *
   * `tenonLegs` (round tenons spec §6, the checkbox `Tenon the legs`): the same entry also fits each socketed leg's top
   * tenon — the seat's rows and every leg's patch (`socketPlan`'s `legs`: a linked leg's shared fields once, on its Shape,
   * each other user its own position) in ONE `edit` through `mapWorld`. Off (the default), no leg is touched.
   */
  boreLegSockets: (seatId: string, diameter: number, tenonLegs?: boolean) => string | null;
  /**
   * Add stretcher (stretchers spec §6.1) between world legs `legIds` at world height `height`, a `size` square rung with
   * `diameter` round tenons: `stretcherPlan` decides every refusal before `edit()` (its sentence returned), then ONE
   * `edit`: the rung inserted into the legs' container and written to its world placement through the write-back (inv 46:
   * lowered through the container's turns), each leg's holes through `mapWorld` (a linked leg's once, on its Shape, inv 45).
   * The rung is selected (through `selectionPatch`); held points are re-judged (inv 24). Null on success. Null and nothing
   * done while exploded (inv 47) or gesturing (the store's convention: there is no sentence for either), and for a stale
   * leg id (the hole actions').
   */
  addStretcher: (legIds: [string, string], height: number, size: number, diameter: number) => string | null;
  /** Add the cam-and-bolt joint between a side and a shelf end (`camJointPlan`): the refusal sentence; null when nothing was
   *  done silently (exploded, gesturing, a stale id, a planner bug); else the notes (linked parts that gained a row). */
  addCamJoint: (ids: [string, string], count: number | null, camFrom: CutFrom | null) => { notes: string[] } | string | null;
  /**
   * Fit the stretcher again (stretchers spec §6.3, §6.4) on world rung `rungId`: `refitPlan` (its closure: every rung
   * sharing a moved row) written in ONE `edit` through `mapWorld`, held points re-judged. Returns `refitPlan`'s refusal,
   * `STRETCHER_NOT_A_STRETCHER` for a part `stretcherOf` does not find (internal: the button shows only for one), or null.
   * A fitted rung is a no-op that pushes no undo entry (inv 4). Null and nothing done while exploded or gesturing, and for
   * a stale id.
   */
  fitStretcher: (rungId: string) => string | null;
  /**
   * Box joint the corners (box-joints spec §4, §6) among world parts `ids`: `boxJointPlan` decides every refusal before
   * `edit()` (its sentence returned), then ONE `edit` writes the plan (`applyBoxJoints`, through the write-back, inv 46),
   * then held points are re-judged on the WRITTEN document (inv 24: other placements of a definition move too, and they
   * are not keys of the plan). Null on success. Null and nothing done while exploded (inv 47) or gesturing, and for a
   * stale id.
   */
  boxJointCorners: (ids: string[], width: number, swap: boolean) => string | null;
  /**
   * Dovetail the corners (dovetails spec §4, §6) among world parts `ids`, at slope `1:slope`, `count` tails (null: Auto per
   * corner, or the kept count on a re-plan, G3), `swap` inverting which part takes the tails: as `boxJointCorners` —
   * `dovetailPlan` decides every refusal before `edit()` (its sentence returned), ONE `edit` writes the plan
   * (`applyDovetails`), then held points are re-judged on the written document (inv 24). Null on success; null and nothing
   * done while exploded (inv 47) or gesturing, and for a stale id.
   */
  dovetailCorners: (
    ids: string[], slope: number, count: number | null, swap: boolean, joint?: 'keep' | 'through' | 'half-blind', lap?: number | null,
  ) => string | null;
  /** Hardware spec §4: set (or, `null`, remove) `count` of hardware `type` on a part, an assembly's definition or the project. Refused while exploded, for an unknown type, or a count not whole in 1..HARDWARE_COUNT_MAX. */
  setHardware: (target: HardwareTarget, type: string, count: number | null) => void;

  /** Link the named parts (linking spec §3.1): the first wins, each named part's whole link joins; every member then names ONE shape (components spec §3.2). One undo entry. */
  linkBoards: (ids: string[]) => void;
  /** Make the named shaped parts plain again, keeping their values and cut ids; a shape left with one user dissolves (components spec §3.2). */
  unlinkBoards: (ids: string[]) => void;
  /** Select every visible user of the part's shape (its link); a no-op for an unlinked part. */
  selectLinked: (id: string) => void;

  addGuide: (at: [number, number, number]) => void;
  /** Add an infinite construction line through `at` along `axis` (construction-lines spec §3.3); false when refused (exploded) or already there. */
  addGuideLine: (line: NewLine) => boolean;
  /** Saved views (spec §3): each is one undo entry, allowed while exploded (inv 47 carve-out), refused mid-gesture. */
  saveView: (camera: SavedViewCamera) => string | null;
  updateView: (id: string, camera: SavedViewCamera) => void;
  /** Returns the stored name: the old name when emptied, `''` for an unknown id. */
  renameView: (id: string, typed: string) => string;
  deleteView: (id: string) => void;
  /** Restores a view's explode, section and hidden set (its own undo entry when the hidden set changes); returns the view whose camera the caller applies, or null when refused (mid-gesture) or unknown. */
  goToView: (id: string) => SavedView | null;
  /** `removeGuides([id])` (the Guides list's ×). */
  removeGuide: (id: string) => void;
  /**
   * Remove every named guide as ONE undo entry (spec §3.3). Refused while exploded (inv 47); unknown ids are ignored, and
   * none known pushes nothing (inv 4); held points owned by each go first (inv 24, `dropHeldOwnedBy`).
   */
  removeGuides: (ids: string[]) => void;
  /** Retype an axis line's two fixed coordinates; false = refused or nothing to do (spec §5.2). */
  moveGuideLine: (id: string, at: [number, number, number]) => boolean;
  clearGuides: () => void;
}

// ---- Dovetails spec §3.6: what a dovetailed part refuses, decided before edit() -------------------------------------------

/** A world part's name as the planners write it (`displayNames`: unique among siblings, a path where needed). */
const nameOf = (doc: SloydDocument, b: Board): string => displayNames(doc).get(b.id) ?? b.name;

/** A cut (after the edit) reaching a dovetailed end's zone, a groove running straight through exempt
 *  (`dovetailCutRefusal`): the zone sentence; else null. */
function cutZoneRefusal(doc: SloydDocument, b: Board, cut: Cut): string | null {
  return hasDovetails(b) ? dovetailCutRefusal(b, cut, nameOf(doc, b)) : null;
}

/** A hole of `rows` (new or edited, on world part `b`) touching a dovetailed end's zone (`holeTouchesBox`): the zone
 *  sentence; else null. */
function holesZoneRefusal(doc: SloydDocument, b: Board, rows: readonly HoleRow[]): string | null {
  if (!hasDovetails(b) || rows.length === 0) return null;
  const zones = dovetailZones(b);
  const touches = boardHoles({ ...b, holes: [...rows] }).some((h) => zones.some((z) => holeTouchesBox(h, z)));
  return touches ? dovetailMoveClear(nameOf(doc, b)) : null;
}

/** The rows of `after` that are not in `before` as they were (by id, values exact): a planner's new or moved rows. */
const newRows = (before: readonly HoleRow[], after: readonly HoleRow[]): HoleRow[] =>
  after.filter((r) => !before.some((o) => o.id === r.id && sameHoleRow(o, r)));

export const useStore = create<StoreState>((set, get) => {
  /**
   * The ONE place a new selection is written. `selectBoard`, `toggleSelected`,
   * `selectAll` and `edit()`'s selection callback all route through it. It and
   * `guideSelectionPatch` below are a PAIR, and the pair is invariant 42's ONE
   * writer: a selection is parts OR guides (selectable-guides spec §3.2), so a
   * NON-EMPTY part selection clears the guides here. An EMPTY one leaves them
   * alone: the store re-asserts an empty part selection internally (applyHidden,
   * restore, deleteBoards, openAssembly, edit()'s callbacks), and that must not
   * wipe a guide selection. The user's "select nothing" is `selectBoard(null)`,
   * which clears both explicitly.
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
  ): { selectedIds: string[]; selectedGuideIds?: string[]; grabbed?: null; stretchGuide?: null } => {
    const held = get().grabbed;
    // Filtered HERE, in the one writer (invariants 42, 43): only direct
    // children of the open assembly (assemblies spec §3.2), never anything
    // hidden or under a hidden assembly. Same array when nothing is dropped.
    const hiddenSet = new Set(hidden);
    const kept = ids.filter((id) => parentPath(id) === open && !isCovered(id, hiddenSet));
    const selectedIds = kept.length === ids.length ? ids : kept;
    // A grab survives while its owner is selected OR under a selected assembly.
    const before = get().selectedIds;
    const changed = before.length !== selectedIds.length || before.some((id, i) => id !== selectedIds[i]);
    return {
      selectedIds,
      // The kinds never mix (spec §3.2). Written only when there is something to clear, so a re-assertion is not a fresh array.
      ...(selectedIds.length > 0 && get().selectedGuideIds.length > 0 ? { selectedGuideIds: [] } : {}),
      ...(held && !isCovered(held.owner.id, new Set(selectedIds)) ? { grabbed: null } : {}),
      // The stretch guide belongs to a selection (spec §8): drop it when the selection changes, not when it is re-asserted.
      ...(changed && get().stretchGuide ? { stretchGuide: null } : {}),
    };
  };

  /**
   * The guide half of the ONE selection writer (with `selectionPatch`, invariant 42; selectable-guides spec §3.2). Keeps
   * ids that name a guide of `guides` and are not hidden (inv 43's rule, applied HERE and not by callers), once each, in
   * order. A guide has no assembly level, so `openPath` filters nothing and is left alone. A NON-EMPTY result clears the
   * part selection with everything a part-selection change carries (`selectionPatch([])`: the `grabbed` drop, the
   * `stretchGuide` drop); an empty one touches only the guides. Never touches `tapeAnchor`/`tapeHover` (inv 24's
   * prohibition, inherited from selectionPatch).
   */
  const guideSelectionPatch = (
    ids: readonly string[],
    hiddenGuides: readonly string[] = get().hiddenGuideIds,
    guides: readonly Guide[] = get().doc.guides,
  ): { selectedGuideIds: string[]; selectedIds?: string[]; grabbed?: null; stretchGuide?: null } => {
    const known = new Set(guides.map((g) => g.id));
    const hidden = new Set(hiddenGuides);
    const selectedGuideIds = [...new Set(ids)].filter((id) => known.has(id) && !hidden.has(id));
    return selectedGuideIds.length > 0 ? { ...selectionPatch([]), selectedGuideIds } : { selectedGuideIds };
  };

  /** The guide selection kept to the guides of `doc` (an edit, undo or redo may remove one): the SAME array when nothing
   *  goes, so an edit that removes no selected guide writes nothing new. */
  const survivingGuides = (doc: SloydDocument): string[] => {
    const before = get().selectedGuideIds;
    if (before.length === 0) return before;
    const known = new Set(doc.guides.map((g) => g.id));
    const kept = before.filter((id) => known.has(id));
    return kept.length === before.length ? before : kept;
  };

  /** `ids` kept to the guides of `doc`: the SAME array when nothing goes. */
  const keptGuides = (ids: string[], doc: SloydDocument): string[] => {
    if (ids.length === 0) return ids;
    const known = new Set(doc.guides.map((g) => g.id));
    const kept = ids.filter((id) => known.has(id));
    return kept.length === ids.length ? ids : kept;
  };

  /** Exploded view = read-only (plans-sheet spec §4.2). Every action that touches state around edit() refuses at entry. */
  const readOnly = () => get().explode > 0;
  /** Invariant 24 for a guide that is going or moving: the two clauses removeGuides and moveGuideLine share, so they
   *  cannot drift apart. Call before the edit. */
  const dropHeldOwnedBy = (id: string) => {
    // Invariant 24, the clause `grabbed` does not need: an anchor CAN be
    // guide-owned, and nothing disables the guides list while the tape is
    // anchored, so deleting the guide you are measuring from is one click
    // away. Unlike dropHeldIfGone this may sit on either side of the edit —
    // the guide id is equally gone before and after — but it is written
    // before it to match every other guard in this file.
    if (ownedByGuide(get().tapeAnchor, id)) {
      set({ tapeAnchor: null, tapeAxis: null });
    }
    // The same clause for the latched hover, and it is NOT symmetry: a guide
    // is a snap candidate like any other, so "anchor on a board, measure to
    // an existing guide, type an offset" is an ordinary gesture — and the
    // guides list stays live throughout it, so deleting the guide being
    // measured TO is as reachable as deleting the one being measured FROM.
    // Narrowed to this guide: removing a different one must not break the
    // latch.
    if (ownedByGuide(get().tapeHover, id)) {
      set({ tapeHover: null });
    }
  };

  /** Two hole lists with the same rows in the same order, ids included (a stretcher plan's no-op test, inv 4). */
  const sameRows = (a: readonly HoleRow[], b: readonly HoleRow[]) =>
    a.length === b.length && a.every((r, i) => r.id === b[i]!.id && sameHoleRow(r, b[i]!));

  /**
   * Apply an edit as a new document, pushing the previous one onto the undo
   * stack. Every mutating action funnels through here — that is what keeps
   * undo correct without any per-action bookkeeping.
   */

  const edit = (
    fn: (doc: SloydDocument) => SloydDocument,
    selection?: (doc: SloydDocument) => string[],
    opts?: { viewsOnly?: true },
  ) => {
    // Read-only while exploded (plans-sheet spec §4.2). The inv 47 carve-out (saved-views spec §3): ONLY `editViews`
    // passes `viewsOnly`, and it writes only `views` — no part moves, so the exploded gate has nothing to protect.
    if (get().explode > 0 && !opts?.viewsOnly) return;
    const { doc, past, future, gesturing, gestureSnapshotTaken } = get();
    // Custom materials (spec §2.3): a document carries exactly what it uses. The SAME object when nothing
    // was unused, so the no-op test below still sees an unchanged document.
    const next = pruneMaterials(fn(doc));

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
      nextPast = [...past, { doc, hiddenIds: get().hiddenIds, hiddenGuideIds: get().hiddenGuideIds }].slice(-HISTORY_LIMIT);
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
      // A selected guide the edit removed is no longer selected (selectable-guides spec §3.4). Before the part patch, which
      // clears the guides outright when the edit selects parts.
      selectedGuideIds: survivingGuides(next),
      // A hidden guide the edit removed (removeGuides, clearGuides) is no longer hidden; the entry above keeps the set
      // from before, so its undo hides it again (inv 43's reconcile, spec §3.4).
      hiddenGuideIds: keptGuides(get().hiddenGuideIds, next),
      ...(selection ? selectionPatch(selection(next)) : {}),
    });
  };

  /** The ONE writer of `doc.views` (saved-views spec §3): refused mid-gesture, allowed while exploded; `fn` returns the SAME array for a no-op. */
  const editViews = (fn: (views: SavedView[]) => SavedView[]): boolean => {
    if (get().gesturing) return false;
    edit((d) => { const v = fn(d.views); return v === d.views ? d : { ...d, views: v }; }, undefined, { viewsOnly: true });
    return true;
  };

  /** The undo entry the current run of eye toggles pushed, held by identity (see applyHidden). */
  let hideRunEntry: HistoryEntry | null = null;

  /**
   * The ONE writer of `hiddenIds` (hide/unhide spec §2.1) AND of `hiddenGuideIds`
   * (selectable-guides spec §3.4): `next` the parts, `nextGuides` the guides
   * (default: unchanged). Never runs edit() and never replaces `doc`: the entry
   * it pushes holds the SAME document object. Part and guide toggles share ONE
   * run; the run is back at its start only when BOTH sets are.
   *
   * Refused while a gesture is open. A hide pushes its own entry, so inside a
   * gesture it would land between the gesture's lazy snapshot (invariant 4) and
   * its later frames, and the drag's tail would undo with the hide. Reading
   * `gesturing` inside an action is allowed; subscribing to it is not
   * (invariant 34).
   *
   * Pushes nothing when the set does not change (invariant 4: no entry that
   * undoes to nothing), and consecutive toggles share one entry (fu 214). Never touches tapeAnchor/tapeHover (invariant 24's
   * prohibition): hiding moves nothing — a guide hide included (do NOT reach for `dropHeldOwnedBy` here).
   *
   * Both selections lose what is newly hidden, each through its half of the ONE writer (inv 42), handed the NEW set.
   */
  const applyHidden = (next: string[], nextGuides: string[] = get().hiddenGuideIds) => {
    const { doc, hiddenIds, hiddenGuideIds, past, selectedIds, selectedGuideIds, gesturing } = get();
    if (gesturing) return;
    const exists = itemPaths(doc);
    const clean = [...new Set(next)].filter((id) => exists.has(id));
    const guides = new Set(doc.guides.map((g) => g.id));
    const cleanGuides = [...new Set(nextGuides)].filter((id) => guides.has(id));
    const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id) => b.includes(id));
    if (same(clean, hiddenIds) && same(cleanGuides, hiddenGuideIds)) return;
    // Only when a guide is selected: an empty guide selection stays the SAME array.
    const guidePatch = selectedGuideIds.length > 0 ? guideSelectionPatch(selectedGuideIds, cleanGuides) : {};
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
      const restored = same(top.hiddenIds, clean) && same(top.hiddenGuideIds, cleanGuides);
      set({
        hiddenIds: clean,
        hiddenGuideIds: cleanGuides,
        past: restored ? past.slice(0, -1) : past,
        future: [],
        ...guidePatch,
        ...selectionPatch(selectedIds, clean),
      });
      return;
    }
    const entry: HistoryEntry = { doc, hiddenIds, hiddenGuideIds };
    hideRunEntry = entry;
    set({
      hiddenIds: clean,
      hiddenGuideIds: cleanGuides,
      past: [...past, entry].slice(-HISTORY_LIMIT),
      future: [],
      ...guidePatch,
      ...selectionPatch(selectedIds, clean),
    });
  };

  /**
   * What undo and redo both restore from an entry: its document, its hidden sets
   * (parts filtered to that document's parts, guides to its guides), and a
   * selection reconciled with both through the ONE writer's two halves, so a redo
   * that re-hides a selected part or guide deselects it (and drops a grab it owned).
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
    const hiddenGuides = keptGuides(entry.hiddenGuideIds, entry.doc);
    const surviving = selectedIds.filter((id) => exists.has(id));
    // The deepest open level that still exists (assemblies spec §3.1).
    let open = get().openPath;
    while (open !== null && !instanceAt(entry.doc, open)) open = parentPath(open);
    return {
      doc: entry.doc,
      hiddenIds: hidden,
      hiddenGuideIds: hiddenGuides,
      openPath: open,
      // Selection is never undone; a guide the entry's document lacks, or that it hides, just drops (selectable-guides
      // spec §3.4). Before the part patch, which wins on `selectedIds` (the kinds never mix, so the two agree).
      ...(get().selectedGuideIds.length > 0
        ? guideSelectionPatch(get().selectedGuideIds, hiddenGuides, entry.doc.guides)
        : {}),
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
   * removeGuides' clear — which may sit on either side of its edit, because
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
   * board-id guard (`heldBoard`) makes a guide-owned anchor on no part fall
   * through untouched, which is correct — a cut edit cannot affect a guide.
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
    // A board owner's id, a face hit's `board`; a stepped anchor's base the same way (spec §4.2).
    const rekeyOwner = (p: SnapPoint): SnapPoint =>
      p.owner.type === 'board' ? { ...p, owner: { ...p.owner, id: rekey(p.owner.id) } }
        : p.owner.board !== undefined ? { ...p, owner: { ...p.owner, board: rekey(p.owner.board) } } : p;
    const move = (p: SnapPoint | null): SnapPoint | null => {
      if (!p) return p;
      const q = rekeyOwner(p);
      return q.base ? { ...q, base: rekeyOwner(q.base) } : q;
    };
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
    if (get().gesturing || readOnly()) return;
    const hiddenBefore = get().hiddenIds;
    rekeyHeld(rekey, lift);
    const pastBefore = get().past;
    edit((d) => rekeyViews(fn(d), rekey, lift), selection); // views follow in the SAME entry (saved views spec §2)
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

  /** Every held point on a part (`heldBoard`), judged point-precisely (components spec §4.2):
   *  an edit inside a definition moves parts in EVERY copy, so judging only the
   *  edited occurrence would miss held points under the other copies. */
  const judgeHeld = () => {
    const owners = new Set<string>();
    for (const h of [get().grabbed, get().tapeAnchor, get().tapeHover]) {
      const b = h && heldBoard(h);
      if (b) owners.add(b);
    }
    for (const id of owners) dropHeldIfGone(id);
  };

  const dropHeldIfGone = (boardId: string) => {
    // `heldBoard` is redundant for `grabbed` (its type says board-owned) and
    // load-bearing for the tape's two (a face hit or a stepped anchor names its
    // part elsewhere) — design §3.0 showing through in one predicate over three
    // fields. Returns the point rather than a boolean so the three call sites
    // below need no non-null assertion.
    const heldOnBoard = (held: SnapPoint | null): SnapPoint | null =>
      held !== null && heldBoard(held) === boardId ? held : null;

    const grabbed = heldOnBoard(get().grabbed);
    const anchor = heldOnBoard(get().tapeAnchor);
    const hover = heldOnBoard(get().tapeHover);
    // The cheap path, now over three fields. It must still return before any
    // grid arithmetic when none of them is relevant — that is the whole reason
    // this shape exists, and adding a field is exactly how it would be lost.
    if (!grabbed && !anchor && !hover) return;

    const board = worldParts(get().doc).find((b) => b.id === boardId);
    // Built on first need: a held face hit alone never pays for the lattice.
    let points: SnapPoint[] | null = null;
    const survives = (held: SnapPoint) => {
      const r = heldRoot(held);
      if (!board) return false;
      if (r.owner.type === 'board') return (points ??= snapPointsFor(board)).some((p) => sameSnapPoint(p, r));
      // A face hit (spec §3.2): the same line's hits on the post-edit part still include it.
      const line = get().doc.guides.find((g) => g.id === r.owner.id);
      return line !== undefined && isAnyLine(line) && lineFaceHits(line, board).some((p) => sameSnapPoint(p, r));
    };

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
    // A LEANING part keeps its pivot, the centre of its pre-lean top face, through a resize (splayed legs spec §3.2:
    // the joint with the seat stays put; a length change moves the foot end). A turn in the same patch lands where
    // reorientedPosition would put it (pivotKeptPosition shares its X/Z arithmetic). A part that does not lean takes
    // the path above, byte for byte. A posture change never reaches here on a leaning part (postureRefusal).
    const resizing = (['length', 'width', 'thickness'] as const).some((k) => patch[k] !== undefined && patch[k] !== current[k]);
    const position =
      patch.position
        ? patch.position
        : leans(current) && (reorienting || resizing)
          ? pivotKeptPosition(current, patch)
          : reorienting
            ? reorientedPosition(current, patch)
            : undefined;

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
   * Align and space evenly's write (align spec §5): every item's own exact world delta, folded through `translateItems` in
   * ONE edit (one undo entry), never rounded (inv 25) and never through `moveGroupTo` (inv 42); then held points are re-judged
   * (inv 24). Every delta zero writes nothing.
   */
  const applyDeltas = (items: readonly AlignItem[], deltas: readonly (readonly number[])[]): null => {
    const moving = items.map((it, i) => ({ id: it.id, d: deltas[i]! })).filter(({ d }) => d.some((v) => v !== 0));
    if (moving.length === 0) return null;
    edit((doc) => moving.reduce((acc, { id, d }) => translateItems(acc, [id], d), doc));
    judgeHeld();
    return null;
  };

  /**
   * Add one delta to every named board's position, as one edit, then run
   * invariant 24's point-precise survival test for each of them. The ONE
   * translate both group moves use (the Move tool's commit and the gizmo).
   * The delta is computed once by the caller; nothing here rounds.
   */
  const translateBoards = (ids: ReadonlySet<string>, delta: readonly [number, number, number]) => {
    if (readOnly()) return;
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
    // snapshot holding it simultaneously. `angleCuts` need the same treatment:
    // fresh ids, and copyAngleCut for an independent `points` array. `holes` and `curves` likewise: fresh ids.
    const { id: _sourceId, name: _sourceName, ...rest } = source;
    return createBoard({
      ...rest,
      name,
      position: [...position],
      cuts: source.cuts.map((cut) => ({ ...cut, id: nextId() })),
      angleCuts: source.angleCuts.map((c) => ({ ...copyAngleCut(c), id: nextId() })),
      holes: source.holes.map((r) => ({ ...copyHoleRow(r), id: nextId() })),
      curves: source.curves.map((c) => ({ ...copyCurve(c), id: nextId() })),
      profiles: source.profiles.map((p) => ({ ...copyProfile(p), id: nextId() })),
      bands: source.bands.map(copyBand),
      hardware: source.hardware.map(copyHardwareUse),
      // Optional (round tenons spec §3.1, inv 33): fresh ids when present, no key when absent.
      ...(source.tenons ? { tenons: source.tenons.map((t) => ({ ...copyTenon(t), id: nextId() })) } : {}),
      // Optional (dovetails spec §3.4, inv 33), as tenons.
      ...(source.dovetails ? { dovetails: source.dovetails.map((d) => ({ ...copyDovetail(d), id: nextId() })) } : {}),
    });
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
    selectedGuideIds: [],
    past: [],
    future: [],
    hiddenIds: [],
    hiddenGuideIds: [],
    explode: 0,
    section: null,
    xray: false,
    setXray: (on) => set({ xray: on }),
    stretchGuide: null,
    setStretchGuide: (g) => {
      if (g !== null && !Number.isFinite(g.at)) return;
      set({ stretchGuide: g });
    },
    setSection: (next) => {
      if (next !== null && !Number.isFinite(next.at)) return;
      set({ section: next });
    },
    setExplode: (amount) => {
      if (!Number.isFinite(amount) || get().gesturing) return;
      const next = Math.min(1, Math.max(0, amount));
      if (next > 0 && get().explode === 0) get().setTool('select');
      // Guides are not drawn while exploded and the Guides list is locked, so a guide selection would be one the user
      // cannot see (selectable-guides spec §7).
      set({ explode: next, ...(next > 0 ? { stretchGuide: null, selectedGuideIds: [] } : {}) });
    },
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
    setTool: (tool) => {
      if (tool !== 'select' && get().explode > 0) return; // no Move/Tape over an exploded view
      set({ tool, grabbed: null, tapeAnchor: null, tapeHover: null, tapeTyped: '', tapeAxis: null });
    },

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
      if (readOnly()) return; // exploded: refuse at entry, before any side effect (spec §4.2)
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
      if (readOnly()) return; // exploded: refuse at entry, before any side effect (spec §4.2)
      const wanted = new Set(ids);
      // Bounds over the WORLD parts under the named items (assemblies spec §4.2).
      const paths = itemPaths(get().doc);
      const moving = worldParts(get().doc).filter((b) => isCovered(b.id, wanted));
      const bounds = partsBounds(moving);
      if (!bounds) return;
      // Round the GROUP's min corner, once. Rounding each part's corner
      // instead would pull an off-grid part onto the grid and break the
      // layout by up to a sixteenth, invisibly (invariant 25).
      const units = get().doc.units;
      const snap = (v: number) => snapToGrid(v, units);
      // A group holding a LEANING part rounds the DELTA instead (splayed legs spec §6.2): its real-bounds corner moves
      // with the lean and its pre-lean corner is off-grid, so rounding either would lift a levelled foot off the floor
      // or move the seat joint; a grid-multiple delta keeps both exact. A lean-free group is unchanged, byte for byte.
      const delta = moving.some(leans)
        ? [0, 1, 2].map((i) => snap(minCorner[i]! - bounds.min[i]!)) as [number, number, number]
        : [
          snap(minCorner[0]) - bounds.min[0],
          snap(minCorner[1]) - bounds.min[1],
          snap(minCorner[2]) - bounds.min[2],
        ] as const;
      if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) return;
      translateBoards(new Set([...wanted].filter((id) => paths.has(id))), delta);
    },

    alignItems: (axis, edge) => {
      if (readOnly() || get().gesturing) return null; // exploded (inv 47) or mid-gesture: refused at entry
      const items = itemExtents(get().doc, get().selectedIds);
      if (items.length < 2) return null;
      return applyDeltas(items, alignDeltas(items, axis, edge));
    },

    distributeItems: (axis) => {
      if (readOnly() || get().gesturing) return null;
      const items = itemExtents(get().doc, get().selectedIds);
      if (items.length < 3) return null;
      const deltas = distributeDeltas(items, axis);
      if ('refused' in deltas) return deltas.refused;
      return applyDeltas(items, deltas);
    },

    stretchItems: (axis, size, line) => {
      if (readOnly() || get().gesturing) return null; // exploded (inv 47) or mid-gesture: refused at entry
      if (get().selectedIds.length === 0) return null;
      const plan = stretchPlan(get().doc, get().selectedIds, axis, size, line);
      if (plan === null) return null;
      if ('refused' in plan) return plan.refused;
      edit(() => plan.doc);
      judgeHeld();
      set({ stretchGuide: null });
      return null;
    },

    addBoard: () => {
      if (readOnly()) return; // exploded: refuse at entry, before any side effect (spec §4.2)
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

    updateBoards: (ids, patch, adopt, bandTypes, hardwareTypes) => {
      if (readOnly()) return undefined; // exploded: refuse at entry, before any side effect (spec §4.2)
      const world = worldParts(get().doc);
      const targets = new Set(ids.filter((id) => world.some((b) => b.id === id)));
      if (targets.size === 0) return undefined;
      // Refused before ANY mutation, the grab clear below included (invariant
      // 4): a d0-moving posture change on a Shape used on both sides of a
      // mirror would write two different cut sets to it; and any posture
      // change on a leaning part (splayed legs spec §3.2), returned so a
      // caller can show it (the Posture field reads the same decider).
      const refused = postureRefusal(get().doc, [...targets], patch.posture);
      if (refused !== null) return refused;

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
      // them. Name, position and rotation never reach them — but patchBoard may
      // move a leaning mate's corner so a shared resize keeps ITS pivot
      // (splayed legs spec §3.2, per user). The board-precise
      // `grabbed` clause above is for the TARGETS only; the other users' held
      // points go through the point-precise test below.
      // A lean never reaches them (splayed legs spec §3.4): it is in each part's OWN hand, so a mate across a mirror
      // would lower the target's world lean through its flip and write a different one to the same Shape (a
      // disagreeing edit); and a lean moves no min corner, so a mate has nothing to re-pivot. The target's own write
      // into the Shape reaches every user, a removal (`lean: undefined`, sharedPatch) included.
      const { lean: _lean, ...shared } = sharedPatch(patch);
      const others = Object.keys(shared).length === 0 ? new Set<string>() : shapeMates(world, targets);
      // Through mapWorld (assemblies spec §5.1): patchBoard runs on WORLD parts,
      // and only what it changed is written back, position as a delta.
      const t = oneEditPerTarget(get().doc, targets);
      // Each mate through an occurrence on its target's side of any mirror
      // (postureRefusal guarantees one exists for a d0-moving posture change),
      // so every lowering writes the same cuts to the Shape (spec §4, amended).
      const sideOfShape = new Map(world.filter((b) => targets.has(b.id) && b.shape).map((b) => [b.shape!, sideAt(get().doc, b.id)]));
      const shapeOf = new Map(world.map((b) => [b.id, b.shape]));
      const mates = sameSideFirst(get().doc, others, (id) => { const sh = shapeOf.get(id); return sh === undefined ? undefined : sideOfShape.get(sh); });
      const o = new Set([...oneEditPerTarget(get().doc, [...t, ...mates])].filter((id) => !t.has(id)));
      edit((doc) => mapWorld(withHardwareTypes(withBandTypes(adopt ? upsertMaterials(doc, adopt) : doc, bandTypes), hardwareTypes), (w) => w.map((b) =>
        t.has(b.id) ? patchBoard(b, patch) : o.has(b.id) ? patchBoard(b, shared) : b)));

      // Point-precise, and AFTER the edit for the reason dropHeldIfGone's own
      // comment gives: the question is what the board offers once the edit has
      // landed. A rename leaves every point exactly where it was, so both the
      // anchor and the latched hover survive; a Length, Posture, Rotation or
      // Position change moves them, so they drop. A guide-owned anchor on no
      // part falls through untouched — heldOnBoard requires `heldBoard` to name
      // this part — which is the same behaviour the deleted clause had. `grabbed` was
      // already nulled above if it named this board, so reaching it here is a
      // no-op rather than a second opinion. Every held point is judged: a
      // shape's Length moves every user's points, not only the targets'.
      judgeHeld();
      return undefined;
    },

    applyMaterials: (upserts, assign, bandTypes, hardwareTypes) => {
      if (readOnly()) return; // exploded: refuse at entry (invariant 47)
      if (assign) {
        const before = get().doc;
        get().updateBoards(assign.ids, { material: assign.material }, upserts, bandTypes, hardwareTypes);
        // updateBoards edits nothing when no id names a part or a posture refusal bails: the upserts must not be
        // lost with it (App reports the Save as done), so fall through to the plain path below.
        if (get().doc !== before) return;
      }
      // Only copies something uses: an unused upsert would be pruned straight back out, but as a NEW object,
      // so edit()'s same-object test would miss it and push an empty undo entry (invariant 4).
      const used = materialUses(get().doc);
      const kept = upserts.filter((m) => used.has(m.id));
      if (kept.length > 0 || bandTypes !== undefined || hardwareTypes !== undefined) edit((doc) => withHardwareTypes(withBandTypes(kept.length > 0 ? upsertMaterials(doc, kept) : doc, bandTypes), hardwareTypes));
    },

    deleteBoard: (id) => get().deleteBoards([id]),

    deleteBoards: (ids) => {
      if (readOnly()) return; // exploded: refuse at entry, before any side effect (spec §4.2)
      // Refused mid-gesture (fu 209): the drag's lazy snapshot is taken, so the delete would merge into its undo entry.
      if (get().gesturing) return;
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
      const onDoomed = (p: SnapPoint | null) => { const b = p && heldBoard(p); return !!b && isCovered(b, doomed); };
      if (grabbed && isCovered(grabbed.owner.id, doomed)) set({ grabbed: null });
      if (onDoomed(tapeAnchor)) {
        set({ tapeAnchor: null, tapeAxis: null });
      }
      if (onDoomed(tapeHover)) {
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
    // `null` is the user's "select nothing" (the viewport miss): it clears BOTH kinds, explicitly, rather than through
    // the empty-parts rule, which deliberately keeps the guides (selectable-guides spec §3.3).
    selectBoard: (id) => set(id === null ? { ...selectionPatch([]), selectedGuideIds: [] } : selectionPatch([id])),

    // Toggling while PARTS are selected starts a new guide selection: the current guide selection is empty then, since
    // the kinds never mix.
    selectGuide: (id, toggle) => {
      const ids = get().selectedGuideIds;
      set(guideSelectionPatch(!toggle ? [id] : ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    },

    selectGuides: (ids) => set(guideSelectionPatch(ids)),

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
      if (readOnly()) return; // exploded: refuse at entry, before any side effect (spec §4.2)
      const inst = instanceAt(get().doc, path);
      if (!inst || inst.rotation === rotation) return;
      edit((doc) => turnInstanceOp(doc, path, rotation));
      // A turn inside a shared definition moves parts under the other copies too.
      judgeHeld();
    },

    mirrorAssembly: (path, mirrored) => {
      if (readOnly()) return; // exploded: refuse at entry, before any side effect (spec §4.2)
      const next = setMirrored(get().doc, path, mirrored);
      if (next === get().doc) return; // invariant 4
      edit(() => next);
      // The assembly's parts moved (reflected), in every copy if it is nested in a shared definition.
      judgeHeld();
    },

    mirrorLinkedPart: (path, mirrored) => {
      if (readOnly()) return; // exploded: refuse at entry (invariant 47)
      const p = partAt(get().doc, path);
      if (!p || !isShaped(p) || (p.mirrored === true) === mirrored) return; // invariant 4
      // Written to the STORED part's own fields, never through updateBoard: the flag is an own field, and a world edit
      // would lower through it as a shared change. Stored only as true (spec §3): unticking removes the key.
      const a = containerLinear(get().doc, parentPath(path)).rotation;
      const next = { ...withoutFlag(p), rotation: inverseTurn(addTurns(addTurns(a, a), p.rotation)), ...(mirrored ? { mirrored: true as const } : {}) };
      edit((doc) => setStored(doc, path, next));
      // Its features moved (reflected), in every copy if the part sits in a shared definition.
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
      // Exploded: nothing is written, so report what IS stored (invariant 9).
      if (get().explode > 0) return instanceAt(doc, path)?.name ?? partAt(doc, path)?.name ?? typed;
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

    showAll: () => applyHidden([], []),

    setHidden: (id, hidden) => {
      const { hiddenIds } = get();
      applyHidden(hidden ? [...hiddenIds, id] : hiddenIds.filter((x) => x !== id));
    },

    // Guide hides (selectable-guides spec §3.4): the same gate, the part set passed through unchanged.
    hideSelectedGuides: () => {
      const { hiddenIds, hiddenGuideIds, selectedGuideIds } = get();
      applyHidden(hiddenIds, [...hiddenGuideIds, ...selectedGuideIds]);
    },

    hideOtherGuides: () => {
      const { hiddenIds, hiddenGuideIds, selectedGuideIds, doc } = get();
      if (selectedGuideIds.length === 0) return;
      applyHidden(hiddenIds, [...hiddenGuideIds, ...doc.guides.map((g) => g.id).filter((id) => !selectedGuideIds.includes(id))]);
    },

    setGuideHidden: (id, hidden) => {
      const { hiddenIds, hiddenGuideIds } = get();
      applyHidden(hiddenIds, hidden ? [...hiddenGuideIds, id] : hiddenGuideIds.filter((x) => x !== id));
    },

    setDocumentName: (name) => edit((doc) => ({ ...doc, name })),
    setUnitsDisplay: (display) => {
      if (get().doc.units.display === display) return;
      edit((doc) => ({ ...doc, units: { ...doc.units, display } }));
    },
    setKerf: (kerf) => {
      // The loader DEFAULTS a kerf outside [0, 1) (v4→v5), so one stored there would be silently replaced on the next
      // open: refused here, never clamped.
      if (!Number.isFinite(kerf) || kerf < 0 || kerf >= 1 || get().doc.stock.kerf === kerf) return;
      edit((doc) => ({ ...doc, stock: { ...doc.stock, kerf } }));
    },

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
        selectedGuideIds: [],
        hiddenIds: [],
        hiddenGuideIds: [],
        openPath: null,
        past: [],
        future: [],
        grabbed: null,
        tapeAnchor: null,
        tapeHover: null,
        tapeAxis: null,
        explode: 0,
        section: null,
        xray: false,
        stretchGuide: null,
        // Fu 3: a focus request for the replaced document's new part.
        pendingLengthFocus: false,
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
      const { past, future, doc, hiddenIds, hiddenGuideIds, selectedIds } = get();
      // Refused mid-gesture (fu 208), as a hide is (invariant 43): popping the drag's own entry left its later edits with
      // none (the snapshot flag still set), and an undone resize slid under the gizmo's proxy.
      if (past.length === 0 || get().explode > 0 || get().gesturing) return;
      const previous = past[past.length - 1]!;
      // Undo ends a run of eye toggles: popping a LATER entry can leave the run's
      // entry on top again, and the identity check would wrongly continue it.
      hideRunEntry = null;
      set({
        past: past.slice(0, -1),
        future: [{ doc, hiddenIds, hiddenGuideIds }, ...future].slice(0, HISTORY_LIMIT),
        ...restore(previous, doc, selectedIds),
      });
    },

    redo: () => {
      const { past, future, doc, hiddenIds, hiddenGuideIds, selectedIds } = get();
      if (future.length === 0 || get().explode > 0 || get().gesturing) return;   // refused mid-gesture, as undo (fu 208)
      const next = future[0]!;
      hideRunEntry = null; // a redo ends a run, like undo
      set({
        past: [...past, { doc, hiddenIds, hiddenGuideIds }].slice(-HISTORY_LIMIT),
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
      if (readOnly()) return null; // exploded: refuse at entry, before any side effect (spec §4.2)
      const world = worldParts(get().doc);
      const board = world.find((b) => b.id === boardId);
      if (!board) return null;
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
      // Dovetails spec §3.6: a cut reaching a dovetailed end's zone refuses, before edit().
      const zone = cutZoneRefusal(get().doc, board, cut);
      if (zone) return zone;
      // Through mapWorld (assemblies spec §5.1). On a shaped part the cuts are
      // the shape's, so ONE cut with ONE id reaches every user (components
      // spec §4.1); no other part is touched.
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (b.id === boardId ? { ...b, cuts: [...b.cuts, cut] } : b))));
      judgeHeld();
      return null;
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
      if (readOnly()) return null; // exploded: refuse at entry, before any side effect (spec §4.2)
      const world = worldParts(get().doc);
      const board = world.find((b) => b.id === boardId);
      const cur = board?.cuts.find((c) => c.id === cutId);
      if (!board || !cur) return null;
      // Dovetails spec §3.6: the edited cut reaching a dovetailed end's zone refuses, before edit().
      const zone = cutZoneRefusal(get().doc, board, { ...cur, ...patch });
      if (zone) return zone;
      // Through mapWorld (assemblies spec §5.1); a shaped part's cuts are its
      // shape's, so every user sees the edit (components spec §4.1).
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId
          ? { ...b, cuts: b.cuts.map((c) => (c.id === cutId ? { ...c, ...patch } : c)) }
          : b)));
      judgeHeld();
      return null;
    },

    removeCut: (boardId, cutId) => {
      if (readOnly()) return; // exploded: refuse at entry, before any side effect (spec §4.2)
      const world = worldParts(get().doc);
      const board = world.find((b) => b.id === boardId);
      if (!board || !board.cuts.some((c) => c.id === cutId)) return;
      // Through mapWorld (assemblies spec §5.1); see updateCut.
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, cuts: b.cuts.filter((c) => c.id !== cutId) } : b)));
      judgeHeld();
    },

    // Angle cuts (angle-cuts spec §7): through mapWorld like cuts, so a shaped part's angle cuts are its
    // shape's and every user sees the edit (invariant 45); several in one call are one undo entry
    // (Miter's "both ends", chunk 2). Held points are re-judged after, as for cuts (invariant 24).
    addAngleCuts: (boardId, cuts) => {
      if (readOnly()) return null;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || cuts.length === 0) return null;
      if (hasDovetails(board)) return dovetailRemoveFirst(nameOf(get().doc, board)); // dovetails spec §3.6
      const added = cuts.map((c) => ({ ...copyAngleCut(c as AngleCut), id: nextId() }));
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (b.id === boardId ? { ...b, angleCuts: [...b.angleCuts, ...added] } : b))));
      judgeHeld();
      return null;
    },
    updateAngleCut: (boardId, cutId, next) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      const cur = board?.angleCuts.find((c) => c.id === cutId);
      if (!board || !cur) return;
      const after: AngleCut = { ...copyAngleCut(next as AngleCut), id: cutId };
      if (sameAngleCut(cur, after)) return; // a no-op edit pushes no undo entry (invariant 4)
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, angleCuts: b.angleCuts.map((c) => (c.id === cutId ? after : c)) } : b)));
      judgeHeld();
    },
    removeAngleCut: (boardId, cutId) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || !board.angleCuts.some((c) => c.id === cutId)) return;
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, angleCuts: b.angleCuts.filter((c) => c.id !== cutId) } : b)));
      judgeHeld();
    },

    // Hole rows (holes spec §7): through mapWorld like angle cuts, so a shaped part's rows are its shape's and every
    // user sees the edit (invariant 45). Held points are re-judged after (invariant 24): a hole can swallow a grabbed
    // lattice point (the mouth is air).
    addHoleRows: (boardId, rows) => {
      if (readOnly()) return null;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || rows.length === 0) return null;
      // Angled holes §3.1: the loader's ONE bound, decided before edit(). A leaning part takes holes (§7).
      if (!rows.every(tiltWithin)) return HOLE_TILT_PAST_BOUND;
      for (const r of rows) {
        const refused = headRefusal(r, false);
        if (refused) return refused;
      }
      const added = rows.map((r) => ({ ...storedHead(storedTilt(copyHoleRow(r as HoleRow))), id: nextId() }));
      const zone = holesZoneRefusal(get().doc, board, added); // dovetails spec §3.6
      if (zone) return zone;
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (b.id === boardId ? { ...b, holes: [...b.holes, ...added] } : b))));
      judgeHeld();
      return null;
    },
    updateHoleRow: (boardId, rowId, next) => get().updateHoleRows(boardId, [{ rowId, next }]),
    updateHoleRows: (boardId, edits) => {
      if (readOnly()) return null;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board) return null;
      const changed = new Map<string, HoleRow>();
      for (const { rowId, next } of edits) {
        const cur = board.holes.find((r) => r.id === rowId);
        if (!cur) return null; // a stale id: as the hole actions (updateHoleRow)
        if (!tiltWithin(next)) return HOLE_TILT_PAST_BOUND;
        const headRefused = headRefusal(next, cur.head !== undefined);
        if (headRefused) return headRefused;
        const after: HoleRow = { ...storedHead(storedTilt(copyHoleRow(next as HoleRow))), id: rowId };
        if (!sameHoleRow(cur, after)) changed.set(rowId, after); // a no-op edit pushes no undo entry (invariant 4)
      }
      if (changed.size === 0) return null;
      const zone = holesZoneRefusal(get().doc, board, [...changed.values()]); // dovetails spec §3.6
      if (zone) return zone;
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, holes: b.holes.map((r) => changed.get(r.id) ?? r) } : b)));
      judgeHeld();
      return null;
    },
    removeHoleRow: (boardId, rowId) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || !board.holes.some((r) => r.id === rowId)) return;
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, holes: b.holes.filter((r) => r.id !== rowId) } : b)));
      judgeHeld();
    },

    // Round tenons (round tenons spec §4): as hole rows, through mapWorld, so a shaped part's tenons are its Shape's
    // (written once, inv 45) and a mirrored user's world end is lowered through its mirror (inv 46). Every refusal is
    // judged on the WORLD part after the edit, before edit(). `withTenons` keeps canonical order and drops the key when
    // the list empties. Held points are re-judged after (invariant 24): a tenon cuts away its end's corners.
    addTenon: (boardId, end, diameter, length) => {
      if (readOnly() || get().gesturing) return null;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board) return null; // a stale id: as the hole actions (addHoleRows)
      if (hasDovetails(board)) return dovetailRemoveFirst(nameOf(get().doc, board)); // dovetails spec §3.6
      if (tenonAt(board, end)) return TENON_END_TAKEN;
      if (!tenonSize(diameter) || !tenonSize(length)) return TENON_SIZE_POSITIVE;
      const added: RoundTenon = { id: nextId(), end, diameter, length };
      const fault = tenonFaults(withTenons(board, [...tenonsOf(board), added]), added)[0];
      if (fault) return tenonFaultText(fault);
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (b.id === boardId ? withTenons(b, [...tenonsOf(b), added]) : b))));
      judgeHeld();
      return null;
    },
    updateTenon: (boardId, tenonId, next) => {
      if (readOnly() || get().gesturing) return null;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      const cur = board?.tenons?.find((t) => t.id === tenonId);
      if (!board || !cur) return null; // a stale id: as the hole actions (updateHoleRow)
      if (next.end !== cur.end) return TENON_END_FIXED;
      if (!tenonSize(next.diameter) || !tenonSize(next.length)) return TENON_SIZE_POSITIVE;
      const after: RoundTenon = { id: tenonId, end: cur.end, diameter: next.diameter, length: next.length };
      if (sameTenon(cur, after)) return null; // a no-op edit pushes no undo entry (invariant 4)
      const replaced = (b: Board) => withTenons(b, tenonsOf(b).map((t) => (t.id === tenonId ? after : t)));
      const fault = addedTenonFaults(board, replaced(board), cur.end)[0];
      if (fault) return tenonFaultText(fault);
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (b.id === boardId ? replaced(b) : b))));
      judgeHeld();
      return null;
    },
    removeTenon: (boardId, tenonId) => {
      if (readOnly() || get().gesturing) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || !tenonsOf(board).some((t) => t.id === tenonId)) return;
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? withTenons(b, tenonsOf(b).filter((t) => t.id !== tenonId)) : b)));
      judgeHeld();
    },
    // Dovetails (spec §4): as removeTenon, through mapWorld (a Shape's dovetails are SHARED, written once, inv 45);
    // `withDovetails` keeps canonical order and drops the key when the list empties. Held points re-judged (inv 24).
    removeDovetail: (boardId, dovetailId) => {
      if (readOnly() || get().gesturing) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || !dovetailsOf(board).some((d) => d.id === dovetailId)) return;
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? withDovetails(b, dovetailsOf(b).filter((d) => d.id !== dovetailId)) : b)));
      judgeHeld();
    },

    // Curve cuts (curves spec §8): as hole rows, through mapWorld; held points re-judged after (invariant 24): the
    // waste is air, so a curve can swallow a grabbed lattice point.
    addCurves: (boardId, curves) => {
      if (readOnly()) return null;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || curves.length === 0) return null;
      if (hasDovetails(board)) return dovetailRemoveFirst(nameOf(get().doc, board)); // dovetails spec §3.6
      const added = curves.map((c) => ({ ...copyCurve(c as CurveCut), id: nextId() }));
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (b.id === boardId ? { ...b, curves: [...b.curves, ...added] } : b))));
      judgeHeld();
      return null;
    },
    updateCurve: (boardId, curveId, next) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      const cur = board?.curves.find((c) => c.id === curveId);
      if (!board || !cur) return;
      const after: CurveCut = { ...copyCurve(next as CurveCut), id: curveId };
      if (sameCurve(cur, after)) return; // a no-op edit pushes no undo entry (invariant 4)
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, curves: b.curves.map((c) => (c.id === curveId ? after : c)) } : b)));
      judgeHeld();
    },
    removeCurve: (boardId, curveId) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || !board.curves.some((c) => c.id === curveId)) return;
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, curves: b.curves.filter((c) => c.id !== curveId) } : b)));
      judgeHeld();
    },
    // Edge profiles (profile runs a1): exactly as curves.
    addProfiles: (boardId, profiles) => {
      if (readOnly()) return null;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || profiles.length === 0) return null;
      if (hasDovetails(board)) return dovetailRemoveFirst(nameOf(get().doc, board)); // dovetails spec §3.6
      const added = profiles.map((p) => ({ ...copyProfile(p as ProfileCut), id: nextId() }));
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (b.id === boardId ? { ...b, profiles: [...b.profiles, ...added] } : b))));
      judgeHeld();
      return null;
    },
    updateProfile: (boardId, profileId, next) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      const cur = board?.profiles.find((p) => p.id === profileId);
      if (!board || !cur) return;
      const after: ProfileCut = { ...copyProfile(next as ProfileCut), id: profileId };
      if (sameProfile(cur, after)) return; // a no-op edit pushes no undo entry (invariant 4)
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, profiles: b.profiles.map((p) => (p.id === profileId ? after : p)) } : b)));
      judgeHeld();
    },
    removeProfile: (boardId, profileId) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || !board.profiles.some((p) => p.id === profileId)) return;
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, profiles: b.profiles.filter((p) => p.id !== profileId) } : b)));
      judgeHeld();
    },
    setBands: (ids, sides, type) => {
      if (readOnly()) return null;
      const world = worldParts(get().doc);
      // Dovetails spec §3.6: adding a band to a dovetailed part refuses (a clear never does), before edit().
      if (type !== null) {
        const dovetailed = ids.flatMap((id) => world.find((b) => b.id === id) ?? []).find(hasDovetails);
        if (dovetailed && sides.length > 0) return dovetailRemoveFirst(nameOf(get().doc, dovetailed));
      }
      const t = oneEditPerTarget(get().doc, ids.filter((id) => world.some((b) => b.id === id)));
      if (t.size === 0) return null;
      edit((doc) => mapWorld(doc, (w) => w.map((b) => {
        if (!t.has(b.id)) return b;
        const next = withBands(b.bands, sides, type);
        return sameBands(next, b.bands) ? b : { ...b, bands: next };
      })));
      judgeHeld();
      return null;
    },

    setLean: (ids, world, opts) => {
      // Refused at entry while exploded (invariant 47) or mid-gesture (a drag's lazy snapshot would swallow it). No
      // sentence: the copy has none, and the Lean section is inside EditLock.
      if (readOnly() || get().gesturing) return null;
      const doc0 = get().doc;
      const byId = new Map(worldParts(doc0).map((b) => [b.id, b]));
      // Dovetails spec §3.6: a lean on a dovetailed part refuses (Clear never does), before every other refusal.
      if (world !== null) {
        const dovetailed = ids.flatMap((id) => byId.get(id) ?? []).find(hasDovetails);
        if (dovetailed) return dovetailRemoveFirst(nameOf(doc0, dovetailed));
      }
      // ONE write per Shape, through the first selected user (controller ruling 1): a Shape cannot hold "the same
      // world lean" on both sides of a mirror, and the other users follow through it, each in its own hand.
      const shapes = new Set<string>();
      const firsts = ids.filter((id) => {
        const b = byId.get(id);
        if (!b) return false;
        if (b.shape === undefined) return true;
        if (shapes.has(b.shape)) return false;
        shapes.add(b.shape);
        return true;
      });
      // A −0 from the turn becomes +0, so a stored zero slope is a plain zero (`seamFree` and `Object.is` agree).
      const plus0 = (v: number) => (v === 0 ? 0 : v);
      const next = new Map<string, Lean | undefined>();
      for (const id of oneEditPerTarget(doc0, firsts)) {
        const b = byId.get(id)!;
        if (world === null) {
          if (b.lean) next.set(id, undefined); // Clear is never refused: a loaded holed, leaning part can be cleared
          continue;
        }
        if (b.posture !== 'upright') return LEAN_NOT_UPRIGHT;
        // World slopes, the typed one replaced and the other copied as is (§3.1: no trig round trip), then turned back
        // into the part's turn-0 frame: quarter turns are swaps and negations, so the untouched slope keeps its bits.
        const [wx, wz] = worldSlopes(b);
        const pick = (typed: number | undefined, sign: 1 | -1 | undefined, own: number): number => {
          if (typed !== undefined) return (opts?.keepSign ? (own < 0 ? -1 : 1) : 1) * slopeOf(typed);
          return sign === undefined ? own : sign * Math.abs(own);
        };
        const w = [pick(world.splay, world.splaySign, wx), 0, pick(world.rake, world.rakeSign, wz)];
        const t = rotateVec(inverseTurn(b.rotation), w);
        const x = plus0(t[0]);
        const z = plus0(t[2]);
        if (!withinBound(x, z)) return LEAN_PAST_BOUND;
        if (x === 0 && z === 0) {
          if (b.lean) next.set(id, undefined); // a zero lean is no lean: never stored (Global Constraints)
          continue;
        }
        // The facing dimension is chosen once, when the part had no lean, and kept by later edits (§3.1); the stored
        // form is always seam-free. Square-set legs §3.2: a first lean is square-set unless the Set says otherwise; a
        // leaning part keeps its own setting. `square` is stored only as `true`.
        const wasSquare = b.lean?.square === true;
        const square = world.square ?? (b.lean ? wasSquare : true);
        const lean: Lean = { ...seamFree({ x, z, face: b.lean ? b.lean.face : chooseFace(b, x, z) }), ...(square ? { square: true as const } : {}) };
        if (b.holes.length > 0 && b.lean) {
          if (square !== wasSquare) {
            // A Set change turns the part about its length by the TURNED end's twist τ (the old lean leaving turned, the
            // new one entering it); τ = 0 is the same map either way, so it is allowed.
            if (leanTwist(b, wasSquare ? lean : b.lean) !== 0) return LEAN_SET_TURNS_HOLES;
          } else if (!square && lean.face !== b.lean.face) {
            // Angled holes §7: a RE-choice of the face (seamFree flipping a stored lean) turns a TURNED part's features a
            // quarter turn about its length; refused on a holed part (a first lean, or Clear, is not a re-choice). A
            // square-set lean's face never reaches the map, so its re-choice turns nothing.
            return LEAN_TURNS_HOLES;
          }
        }
        if (b.lean && b.lean.x === lean.x && b.lean.z === lean.z && b.lean.face === lean.face && wasSquare === square) continue; // inv 4
        next.set(id, lean);
      }
      if (next.size === 0) return null;
      // A world-part edit: `mapWorld` lowers the lean through every turn and mirror on the path, and a shaped part's
      // into its Shape once; `lean: undefined` removes it everywhere (treeEdit's ABSENT).
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (next.has(b.id) ? { ...b, lean: next.get(b.id) } : b))));
      // Inv 24: a lean moves the part's snap points (they compose the lean), so held points are re-judged.
      judgeHeld();
      return null;
    },

    levelEnds: (id) => {
      if (readOnly() || get().gesturing) return null;
      const doc0 = get().doc;
      const world = worldParts(doc0);
      const b = world.find((w) => w.id === id);
      if (!b || !leans(b)) return null; // controller ruling 3: no lean, nothing to level (the button is not shown)
      // Every user (a Shape's) and every placement (one stored part's): length and angle cuts are shared between them.
      const key = storageKey(doc0, id);
      const users = world.filter((w) => (b.shape !== undefined ? w.shape === b.shape : storageKey(doc0, w.id) === key));
      const own = levelPlan(b, doc0.units);
      if (typeof own === 'string') return own;
      // One shared length levels them all only when their pivots stand at one world height (§5).
      const ys = users.map((w) => leanMap(w)!.pivot[1]);
      if (Math.max(...ys) - Math.min(...ys) > 1e-9) {
        const names = displayNames(doc0);
        return levelUsersDisagree([...new Set(users.map((w) => names.get(w.id) ?? w.name))]);
      }
      const plans = new Map<string, LevelPlan>([[b.id, own]]);
      for (const w of users) {
        if (w === b) continue;
        const p = levelPlan(w, doc0.units);
        if (typeof p === 'string') return p; // shared cuts and one pivot height: unreachable, but never half-written
        // The single shared write (ruling 1) relies on every user's own plan agreeing on the length; one that did not
        // would silently leave its foot off the floor. An internal invariant, not user copy: throw.
        if (Math.abs(p.length - own.length) > 1e-9) throw new Error(`levelEnds: user ${w.id} plans length ${p.length}, ${b.id} ${own.length}`);
        plans.set(w.id, p);
      }
      if (users.every((w) => isLevelled(w, doc0.units))) return null; // inv 4: nothing would change
      // Controller ruling 1: the SHARED fields (length, angle cuts, and the holes re-anchored with them: angled holes §7)
      // are written ONCE, through `b` — the Shape carries
      // them to every other user in its own hand (each user's own world cuts would be disagreeing edits across a
      // mirror) — and each storage target's OWN position from its own plan (one per target: placements share it).
      const writes = oneEditPerTarget(doc0, [b.id, ...users.map((w) => w.id)]);
      edit((doc) => mapWorld(doc, (w) => w.map((x) => {
        if (!writes.has(x.id)) return x;
        const p = plans.get(x.id)!;
        return x.id === b.id ? { ...x, length: p.length, position: p.position, angleCuts: p.angleCuts, holes: p.holes } : { ...x, position: p.position };
      })));
      // Inv 24: the ends and length moved every user's snap points.
      judgeHeld();
      return null;
    },

    boreLegSockets: (seatId, diameter, tenonLegs = false) => {
      if (readOnly() || get().gesturing) return null;
      if (!(Number.isFinite(diameter) && diameter > 0)) return null;
      const doc0 = get().doc;
      // Every refusal (sockets, copies, Level the ends' for a leg, tenons that disagree) is decided here, before edit().
      const plan = socketPlan(doc0, seatId, diameter, tenonLegs);
      if (typeof plan === 'string') return plan;
      const world0 = worldParts(doc0);
      const seat = world0.find((b) => b.id === seatId);
      const legs = new Map((plan.legs ?? []).map((l) => [l.id, l.patch]));
      // Dovetails spec §3.6, before edit(): a new socket in a dovetailed seat's zone, and a tenon fitted to a dovetailed leg.
      if (seat) {
        const zone = holesZoneRefusal(doc0, seat, newRows(seat.holes, plan.holes));
        if (zone) return zone;
      }
      for (const [id, patch] of legs) {
        const leg = world0.find((b) => b.id === id);
        if (leg && 'tenons' in patch && hasDovetails(leg)) return dovetailRemoveFirst(nameOf(doc0, leg));
      }
      // inv 4: every leg already has its socket (and, tenoning, its fitted tenon)
      if (!seat || (plan.holes === seat.holes && legs.size === 0)) return plan.note ?? null;
      // ONE write through this copy (levelEnds' ruling 1): the rows are shared by every copy, and socketPlan has judged
      // that every copy would store the same ones; each leg patch is one per storage target, a Shape's shared fields once.
      const holes = plan.holes;
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (b.id === seatId ? (holes === b.holes ? b : { ...b, holes })
        : legs.has(b.id) ? { ...b, ...legs.get(b.id)! } : b))));
      // Inv 24: a bore swallows the lattice points in its mouth, and a fitted leg's length and ends move its points.
      judgeHeld();
      return plan.note ?? null;
    },

    addStretcher: (legIds, height, size, diameter) => {
      if (readOnly() || get().gesturing) return null;
      const doc0 = get().doc;
      const world0 = worldParts(doc0);
      if (!legIds.every((id) => world0.some((b) => b.id === id))) return null; // a stale id: as the hole actions
      // Every refusal (the legs, the axis, the fit, the tenons, each socket) is decided here, before edit().
      const plan = stretcherPlan(doc0, legIds, { height, size, diameter });
      if (typeof plan === 'string') return plan;
      const { rung, container, legs } = plan;
      // Dovetails spec §3.6, before edit(): a socket in a dovetailed leg's zone.
      for (const l of legs) {
        const leg = world0.find((b) => b.id === l.id)!;
        const zone = holesZoneRefusal(doc0, leg, newRows(leg.holes, l.holes));
        if (zone) return zone;
      }
      const at = joinPath(container, rung.id);
      // A reused row leaves its leg's list as it is: that leg is not written (a mirrored user's world rows are a fresh
      // lowering each time, so an identical list would otherwise be written back to its Shape).
      const holes = new Map(legs.filter((l) => !sameRows(l.holes, world0.find((b) => b.id === l.id)!.holes)).map((l) => [l.id, l.holes]));
      // The rung is a WORLD part: inserted into the legs' container (a fresh stored id, a sibling-unique name, inv 8), then
      // written to its world placement by the ONE write-back, which lowers it through the container's turns and offsets
      // (inv 46); in the same pass each leg's rows (one entry per storage target: a Shape once, inv 45).
      edit(
        (doc) => mapWorld(insertItems(doc, container, { boards: [rung] }), (w) => w.map((b) => (b.id === at ? { ...rung, id: at }
          : holes.has(b.id) ? { ...b, holes: holes.get(b.id)! } : b))),
        () => [at],
      );
      // Inv 24: a socket swallows the lattice points in its mouth.
      judgeHeld();
      return null;
    },

    addCamJoint: (ids, count, camFrom) => {
      if (readOnly() || get().gesturing) return null;
      const doc0 = get().doc;
      const world0 = worldParts(doc0);
      if (!ids.every((id) => world0.some((b) => b.id === id))) return null; // a stale id: as the hole actions
      // Every refusal is decided by the planner, re-run at click time on the live document, before edit(). It throws only
      // on a caller bug (R14): logged, nothing written.
      let plan: ReturnType<typeof camJointPlan>;
      try {
        plan = camJointPlan(doc0, ids, count, camFrom);
      } catch (e) {
        console.error('addCamJoint: camJointPlan threw', e);
        return null;
      }
      if (typeof plan === 'string') return plan;
      // Dovetails spec §3.6, before edit(): a bore in a dovetailed part's zone.
      for (const w of plan.writes) {
        const part = world0.find((b) => b.id === w.id)!;
        const zone = holesZoneRefusal(doc0, part, newRows(part.holes, w.holes));
        if (zone) return zone;
      }
      // An unchanged list (a reused pair's A) is not written: a mirrored user's world rows are a fresh lowering each time.
      const holes = new Map(plan.writes.filter((w) => !sameRows(w.holes, world0.find((b) => b.id === w.id)!.holes)).map((w) => [w.id, w.holes]));
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (holes.has(b.id) ? { ...b, holes: holes.get(b.id)! } : b))));
      // Inv 24: a bore swallows the lattice points in its mouth.
      judgeHeld();
      return { notes: plan.notes };
    },

    fitStretcher: (rungId) => {
      if (readOnly() || get().gesturing) return null;
      const doc0 = get().doc;
      const world0 = worldParts(doc0);
      const rung = world0.find((b) => b.id === rungId);
      if (!rung) return null; // a stale id
      // refitPlan throws for a part that is not a stretcher: the button shows only for one.
      if (!stretcherOf(world0, rung)) return STRETCHER_NOT_A_STRETCHER;
      const plan = refitPlan(doc0, rungId);
      if (typeof plan === 'string') return plan;
      const patches = new Map(plan.rungs.map((r) => [r.id, r.patch]));
      const holes = new Map(plan.legs.map((l) => [l.id, l.holes]));
      // Inv 4: refitPlan returns a full plan for a fitted rung (every value the stored one, new arrays), so a part whose
      // planned values are its own is left as the SAME object; when none changes, mapWorld returns the same document and
      // edit() pushes no entry.
      // A re-fit patches only `length`, `position` and `tenons` (refitPlan's contract); any other key is an internal error,
      // never silently compared by reference (a fresh array would make every no-op Fit an undo entry).
      const samePatched = (b: Board, k: string, v: unknown): boolean => {
        if (k === 'length') return v === b.length;
        if (k === 'position') return (v as number[]).every((x, i) => x === b.position[i]);
        if (k === 'tenons') {
          const next = (v as RoundTenon[] | undefined) ?? [];
          const own = tenonsOf(b);
          return next.length === own.length && next.every((t, i) => t.id === own[i]!.id && sameTenon(t, own[i]!));
        }
        throw new Error(`fitStretcher: refitPlan patched ${k}`);
      };
      const unchanged = (b: Board, patch: Partial<Board> | undefined, rows: HoleRow[] | undefined) =>
        (rows === undefined || sameRows(rows, b.holes))
        && (patch === undefined || Object.entries(patch).every(([k, v]) => samePatched(b, k, v)));
      edit((doc) => mapWorld(doc, (w) => w.map((b) => {
        const patch = patches.get(b.id);
        const rows = holes.get(b.id);
        if ((!patch && !rows) || unchanged(b, patch, rows)) return b;
        return { ...b, ...(patch ?? {}), ...(rows ? { holes: rows } : {}) };
      })));
      // Inv 24: the rungs' length and ends moved, and so did the sockets.
      judgeHeld();
      return null;
    },

    boxJointCorners: (ids, width, swap) => {
      if (readOnly() || get().gesturing) return null;
      const doc0 = get().doc;
      const world0 = worldParts(doc0);
      if (!ids.every((id) => world0.some((b) => b.id === id))) return null; // a stale id: as the hole actions
      const plan = boxJointPlan(doc0, ids, { width, swap });
      if (typeof plan === 'string') return plan;
      edit((doc) => applyBoxJoints(doc, plan));
      // Inv 24: ends moved and notches were cut; judged on the written document, not on the plan's keys.
      judgeHeld();
      return null;
    },

    dovetailCorners: (ids, slope, count, swap, joint = 'keep', lap = null) => {
      if (readOnly() || get().gesturing) return null;
      const doc0 = get().doc;
      const world0 = worldParts(doc0);
      if (!ids.every((id) => world0.some((b) => b.id === id))) return null; // a stale id: as the hole actions
      const plan = dovetailPlan(doc0, ids, { slope, count, swap, joint, lap });
      if (typeof plan === 'string') return plan;
      edit((doc) => applyDovetails(doc, plan));
      // Inv 24: ends moved and the joint's waste is air; judged on the written document, not on the plan's keys.
      judgeHeld();
      return null;
    },

    setHardware: (target, type, count) => {
      if (readOnly()) return;
      const doc0 = get().doc;
      if (count !== null && !doc0.hardwareTypes.some((t) => t.id === type)) return; // a stranded entry (type gone) can still be removed
      if (count !== null && !(Number.isInteger(count) && count >= 1 && count <= HARDWARE_COUNT_MAX)) return;
      if (target.kind === 'part') {
        const world = worldParts(doc0);
        if (!world.some((b) => b.id === target.id)) return;
        const t = oneEditPerTarget(doc0, [target.id]);
        edit((doc) => mapWorld(doc, (w) => w.map((b) => {
          if (!t.has(b.id)) return b;
          const next = withHardwareUse(b.hardware, type, count);
          return sameHardware(next, b.hardware) ? b : { ...b, hardware: next };
        })));
        judgeHeld();
        return;
      }
      const apply = (uses: readonly { type: string; count: number }[]) => { const next = withHardwareUse(uses, type, count); return sameHardware(next, uses) ? null : next; };
      if (target.kind === 'project') {
        const next = apply(doc0.hardware);
        if (next) edit((doc) => ({ ...doc, hardware: next }));
        return;
      }
      const d = definitionAt(doc0, target.path);
      const next = d ? apply(d.hardware) : null;
      if (next) edit((doc) => updateContainer(doc, target.path, (c) => ({ ...c, hardware: next })));
    },

    linkBoards: (ids) => {
      if (readOnly()) return; // exploded: refuse at entry, before any side effect (spec §4.2)
      const doc0 = get().doc;
      const plan = linkPlan(worldParts(doc0), ids, (p) => storageKey(doc0, p), (p) => mirroredAt(doc0, p));
      // Fewer than two, nothing would change, or refused (opposite sides of a
      // mirror): nothing is written, no undo entry (invariant 4).
      if (!plan || 'refused' in plan) return;
      // Every member but the source takes the source's shared fields through
      // patchBoard, so a posture change pivots it about its own centre
      // (invariant 2). One per storage target, the source's FIRST, so another
      // placement of the source's own stored part is never patched; each
      // through an occurrence on the SOURCE's side of any mirror (linkPlan
      // guarantees one), the side whose pivot the user sees.
      // The source's SIDE (fu 432, spec §5.2): its assembly parity XOR its own mirror flag, as sameSideFirst compares.
      const side = sideAt(doc0, plan.source.id);
      // Part-level mirror flags (spec §5.2), all read from doc0: a user of the SOURCE's own Shape keeps its flag (that
      // Shape is written unchanged, so it looks as it did); every other member — a plain part, or a user of another
      // Shape — takes the SOURCE's flag, so it becomes a copy of what the person sees on the source.
      const sourceStored = partAt(doc0, plan.source.id);
      const sourceShape = sourceStored && isShaped(sourceStored) ? sourceStored.shape : undefined;
      const sourceFlag = sourceStored?.mirrored === true && sourceShape !== undefined;
      const flagOf = new Map(plan.members.map((occ) => {
        const p = partAt(doc0, occ);
        const keeps = p !== null && isShaped(p) && p.shape === sourceShape;
        return [occ, keeps ? p.mirrored === true : sourceFlag] as const;
      }));
      const patched = oneEditPerTarget(doc0, [plan.source.id, ...sameSideFirst(doc0, plan.members, () => side)]);
      patched.delete(plan.source.id);
      const shapeId = plan.shape ?? nextId();
      edit((doc) => {
        // Only each member's OWN fields come from its patch: its patched world
        // part is written back ALONE (never merged with another member's) and
        // only position and rotation are read off the result. Shared fields are
        // never written through an occurrence: the Shape is written once, below.
        // Two members of one old Shape lowered through different numbers of
        // mirrors would otherwise write cuts to it that differ in the last bits
        // (a double reflection is not bit-exact) and the write-back would throw.
        let out = doc;
        for (const occ of patched) {
          const one = mapWorld(doc, (w) => w.map((b) => (b.id === occ ? patchBoard(b, sharedOf(plan.source)) : b)));
          const p = partAt(one, occ);
          const q = partAt(out, occ);
          if (p && q) out = setStored(out, occ, { ...q, position: p.position, rotation: p.rotation });
        }
        // The shape takes the source's shared fields, cut ids kept: the
        // source's existing shape (or a selected member's), else a new one.
        // Its STORED fields, never the world part's: under a mirror the world
        // cuts are the stored ones reflected, and storing those would flip the
        // source (and every member, all on its side of the mirror) when placed.
        // A shaped source's fields are its Shape's own, exactly — never its
        // resolved part, which its own mirror flag reflects (fu 432, spec §5.2).
        // (The source read in doc0, and nothing above touches it.)
        const unflagged = sourceStored && isShaped(sourceStored) ? withoutFlag(sourceStored) : null;
        const fields = unflagged ? resolveBoard(shapeMap(doc0), unflagged) : resolvedPartAt(out, plan.source.id);
        const shape = { id: shapeId, ...sharedOf(fields!) };
        out = { ...out, shapes: out.shapes.some((x) => x.id === shapeId)
          ? out.shapes.map((x) => (x.id === shapeId ? shape : x))
          : [...out.shapes, shape] };
        // Every member's STORED part becomes a shaped part: its own fields as
        // stored (never the world ones, which a turned assembly changes),
        // after the pivot above.
        for (const occ of plan.members) {
          const p = partAt(out, occ);
          if (p) out = setStored(out, occ, { id: p.id, name: p.name, position: p.position, rotation: p.rotation, shape: shapeId, ...(flagOf.get(occ) ? { mirrored: true as const } : {}) });
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

    // Construction-lines spec §3.3: canonical (at[axis] = 0), so a duplicate is decided on the line itself. The
    // duplicate check sits BEFORE edit(): edit() pushes an undo snapshot and clears redo, so a no-op add
    // would leave a no-op entry (inv 4) and wipe the redo stack. Like addGuide, selection is untouched.
    addGuideLine: (line) => {
      if (readOnly()) return false;
      // The ONE decider: an oblique pair on an axis line is stored as that axis line, equal points are no line.
      const stored: NewLine | null = 'axis' in line ? canonicalLine(line.at, line.axis) : lineThrough(line.at, line.to);
      if (!stored) return false;
      if (get().doc.guides.some((g) => isAnyLine(g) && sameNewLine(newLineOf(g), stored))) return false;
      const guide = { id: nextId(), ...stored } as Guide;
      edit((doc) => ({ ...doc, guides: [...doc.guides, guide] }));
      return true;
    },

    saveView: (camera) => {
      const { section, explode, hiddenIds } = get();
      const id = nextId();
      let saved = false;
      const ok = editViews((views) => {
        saved = true;
        const name = uniqueName(`View ${views.length + 1}`, views);
        return [...views, { id, name, camera, section: section ? { ...section } : null, explode, hidden: [...hiddenIds] }];
      });
      return ok && saved ? id : null;
    },

    // Inv 43 amendment: going to a view is a fifth user action through applyHidden. It ends any hide run
    // (hideRunEntry = null), so its hide is never merged into a preceding toggle's entry. Saved views are board-only
    // (selectable-guides spec §3.4): `applyHidden`'s guide set defaults to the current one, so the guides are left alone.
    goToView: (id) => {
      if (get().gesturing) return null;
      const view = get().doc.views.find((v) => v.id === id);
      if (!view) return null;
      get().setExplode(view.explode);
      get().setSection(view.section ? { ...view.section } : null);
      hideRunEntry = null;
      applyHidden(view.hidden);
      return view;
    },

    updateView: (id, camera) => {
      const { section, explode, hiddenIds } = get();
      editViews((views) => {
        const i = views.findIndex((v) => v.id === id);
        if (i < 0) return views;
        const v = views[i]!;
        const next = { ...v, camera, section: section ? { ...section } : null, explode, hidden: [...hiddenIds] };
        if (JSON.stringify(next) === JSON.stringify(v)) return views;
        return views.map((x, j) => (j === i ? next : x));
      });
    },

    renameView: (id, typed) => {
      const current = get().doc.views.find((v) => v.id === id);
      if (!current) return '';
      const cleaned = cleanName(typed.trim());
      if (!cleaned) return current.name;
      let stored = current.name;
      editViews((views) => {
        const name = uniqueName(cleaned, views, id);
        stored = name;
        if (name === current.name) return views;
        return views.map((v) => (v.id === id ? { ...v, name } : v));
      });
      return stored;
    },

    deleteView: (id) => {
      editViews((views) => (views.some((v) => v.id === id) ? views.filter((v) => v.id !== id) : views));
    },

    removeGuide: (id) => get().removeGuides([id]),

    removeGuides: (ids) => {
      if (readOnly()) return; // exploded: refuse at entry, before any side effect (spec §4.2; inv 47)
      // Guarded before the edit, the same rule updateCut, removeCut and
      // commitSnapMove follow: edit() unconditionally pushes an undo snapshot
      // and clears redo, so a no-op would leave a no-op undo entry
      // (invariant 4) and silently wipe the redo stack.
      const doomed = new Set(ids.filter((id) => get().doc.guides.some((g) => g.id === id)));
      if (doomed.size === 0) return;
      for (const id of doomed) dropHeldOwnedBy(id);
      // ONE edit, so ONE undo entry; edit() drops the removed ids from the guide selection.
      edit((doc) => ({ ...doc, guides: doc.guides.filter((g) => !doomed.has(g.id)) }));
    },

    // Construction-lines-2 spec §5.2. Both refusals sit BEFORE edit() (inv 4): a no-op or a duplicate must leave neither
    // an undo entry nor a wiped redo stack. The typed value is stored exactly (inv 25).
    moveGuideLine: (id, at) => {
      if (readOnly()) return false;
      const g = get().doc.guides.find((x) => x.id === id);
      if (!g || !isGuideLine(g)) return false;
      const next = canonicalLine(at, g.axis);
      if (sameNewLine(newLineOf(g), next)) return false;
      if (get().doc.guides.some((o) => o.id !== id && isAnyLine(o) && sameNewLine(newLineOf(o), next))) return false;
      dropHeldOwnedBy(id);
      edit((doc) => ({ ...doc, guides: doc.guides.map((x) => (x.id === id ? { ...x, at: [...next.at] as [number, number, number] } : x)) }));
      return true;
    },

    clearGuides: () => {
      if (readOnly()) return; // exploded: refuse at entry, before any side effect (spec §4.2)
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
