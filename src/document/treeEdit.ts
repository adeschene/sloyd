import { boardExtents } from './geometry';
import type { AngleCut, Band, Board, Lean, Cut, CurveCut, ProfileCut, Definition, HoleRow, Instance, Posture, Shape, SloydDocument, StoredBoard } from './types';
import { CUT_GEOMETRY_KEYS } from './cuts';
import { angleCutValues, copyAngleCut, mirrorAngleCut, sameAngleCut } from './angleCuts';
import { copyCurve, curveValues, mirrorCurveCut, sameCurve } from './curves';
import { copyProfile, mirrorProfile, profileValues, sameProfile } from './profiles';
import { bandValues, copyBand, mirrorBands, sameBands } from './bandModel';
import { copyHardwareUse } from './hardwareModel';
import { copyHoleRow, holeRowValues, mirrorHoleRow, sameHoleRow } from './holes';
import { nextId } from './ids';
import { LINK_FIELDS, SHARED_KEYS, sharedOf } from './links';
import type { SharedField } from './links';
import { isShaped, resolveBoard, shapeMap } from './shapes';
import { addTurns, cornerShift, inverseTurn, mirrorDim, mirrorPart, placeBoard, rotateVec, toLocal } from './frames';
import type { Frame } from './frames';
import { mirrorCut } from './mirrorCut';
import { leanFlip, leans } from './lean';
import { copyTenon, hasTenons, lowerTenons, tenonValues } from './roundTenons';
import type { Container } from './tree';
import { PATH_SEPARATOR, containerLinear, definitionAt, instanceAt, instancesOn, isCovered, itemPaths, lastSegment, parentPath, partAt, sideAt, worldParts } from './tree';

/** Replace one container's contents: the root's, or a definition's. */
export function updateContainer(doc: SloydDocument, path: string | null, fn: (c: Container) => Container): SloydDocument {
  if (path === null) {
    const c = fn({ boards: doc.boards, instances: doc.instances, hardware: doc.hardware });
    return { ...doc, boards: c.boards, instances: c.instances, hardware: c.hardware };
  }
  const d = definitionAt(doc, path);
  if (!d) return doc;
  const c = fn({ boards: d.boards, instances: d.instances, hardware: d.hardware });
  return { ...doc, definitions: doc.definitions.map((x) => (x.id === d.id ? { ...x, boards: c.boards, instances: c.instances, hardware: c.hardware } : x)) };
}

export interface WorldEdit { before: Board; after: Board }

const samePosition = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const sub = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];

/** One level down, as a DELTA (spec §5.2): the lowered turn, a draft carrying
 *  the after-state's fields at the before position, and the local position change. */
function lowerDelta(inst: Frame, upperBefore: Board, lowerBefore: Board, upperAfter: Board): { draft: Board; d: number[] } {
  const rotation = addTurns(upperAfter.rotation, inverseTurn(inst.rotation));
  const draft: Board = { ...upperAfter, rotation, position: lowerBefore.position };
  const dW = sub(upperAfter.position, upperBefore.position);
  const dS = sub(cornerShift(inst.rotation, draft), cornerShift(inst.rotation, lowerBefore));
  return { draft, d: rotateVec(inverseTurn(inst.rotation), sub(dW, dS)) };
}

/**
 * The cuts of a part lowered back through ONE mirror (mirrored-instances spec §4).
 * A world cut that equals the stored cut with the same id, placed, maps back to
 * THAT object (mirrorCut twice is not bit-exact; repeated edits must not drift,
 * and an untouched cut is never rewritten). "Placed" means at the BEFORE frame
 * (the stored part's size on d0) for a Properties edit, which keeps the stored
 * cuts when only a size field changed, as through a plain frame; and at the AFTER
 * frame under keepWorld (joinery keeps the world box, so an end cut's rebase must
 * shift the stored cuts). Any other cut is reflected back along d0 of the
 * lowered (after) posture. All reused, in order: the stored array itself.
 *
 * A posture change that moves d0 (the approved coupling, spec §4) keeps the
 * world cuts as seen, so each stored cut is re-reflected along the NEW d0. A
 * stored cut can still match there (a cut symmetric about the centre of both
 * d0s, say): a match means the stored cut placed along the new d0 IS the world
 * cut, i.e. it already is the reflection, so reusing the stored object is
 * correct either way.
 */
function lowerCuts(storedBefore: Board, draft: Board, keepWorld: boolean): Cut[] {
  const d0 = mirrorDim(draft);
  const size = draft[d0];
  // A posture change that moves d0 (flat/on-edge <-> upright) is the approved
  // coupling (spec §4) and needs no separate test of d0: a stored cut matches
  // exactly when placing it along the new d0 gives the world cut, which is the
  // reflection this would otherwise compute, so reuse is right either way.
  const atBefore = !keepWorld;
  const refSize = atBefore ? storedBefore[d0] : size;
  const byId = new Map(storedBefore.cuts.map((c) => [c.id, c]));
  const out = draft.cuts.map((c) => {
    const s = byId.get(c.id);
    if (s) {
      const placed = mirrorCut(s, d0, refSize);
      if (CUT_GEOMETRY_KEYS.every((k) => placed[k] === c[k])) return s;
    }
    return mirrorCut(c, d0, size);
  });
  return out.length === storedBefore.cuts.length && out.every((c, i) => c === storedBefore.cuts[i]) ? storedBefore.cuts : out;
}

/**
 * The angle cuts of a part lowered back through ONE mirror (angle-cuts spec
 * 5.2). The reflection is a flag flip, exact and size-free, so unlike
 * `lowerCuts` there is no before/after frame to choose: each world cut is
 * reflected along the lowered (after) posture's d0, and one equal to the stored
 * cut with the same id maps back to THAT object. All reused: the stored array.
 */
function lowerAngleCuts(storedBefore: Board, draft: Board): AngleCut[] {
  const d0 = mirrorDim(draft);
  const byId = new Map(storedBefore.angleCuts.map((c) => [c.id, c]));
  const out = draft.angleCuts.map((c) => {
    const back = mirrorAngleCut(c, d0);
    const s = byId.get(c.id);
    return s && sameAngleCut(s, back) ? s : back;
  });
  return out.length === storedBefore.angleCuts.length && out.every((c, i) => c === storedBefore.angleCuts[i])
    ? storedBefore.angleCuts : out;
}

/**
 * The hole rows of a part lowered back through ONE mirror (holes spec §5.2): like lowerAngleCuts, a flag flip, exact and
 * size-free; a row equal to the stored one with the same id maps back to THAT object; all reused: the stored array.
 */
function lowerHoles(storedBefore: Board, draft: Board): HoleRow[] {
  const d0 = mirrorDim(draft);
  const byId = new Map(storedBefore.holes.map((r) => [r.id, r]));
  const out = draft.holes.map((r) => {
    const back = mirrorHoleRow(r, d0);
    const s = byId.get(r.id);
    return s && sameHoleRow(s, back) ? s : back;
  });
  return out.length === storedBefore.holes.length && out.every((r, i) => r === storedBefore.holes[i]) ? storedBefore.holes : out;
}

/**
 * A part's profiles lowered back through ONE mirror (profile runs spec §3.1): a flag flip (mirrorProfile is its own inverse);
 * a profile equal to the stored one with the same id maps back to THAT object; all reused: the stored array.
 */
function lowerProfiles(storedBefore: Board, draft: Board): ProfileCut[] {
  const d0 = mirrorDim(draft);
  const byId = new Map(storedBefore.profiles.map((p) => [p.id, p]));
  const out = draft.profiles.map((p) => {
    const back = mirrorProfile(p, d0);
    const s = byId.get(p.id);
    return s && sameProfile(s, back) ? s : back;
  });
  return out.length === storedBefore.profiles.length && out.every((p, i) => p === storedBefore.profiles[i]) ? storedBefore.profiles : out;
}

/** A part's bands lowered back through ONE mirror (edge banding spec §2.2): a flag flip, its own inverse; equal to the
 *  stored bands: the stored array. */
function lowerBands(storedBefore: Board, draft: Board): Band[] {
  const back = mirrorBands(draft.bands, mirrorDim(draft));
  return sameBands(back, storedBefore.bands) ? storedBefore.bands : back;
}

/**
 * A part's lean lowered back through ONE mirror (splayed legs spec §3.4): `leanFlip`, exact and its own inverse, so one
 * flip per mirror on the path; equal by value to the stored lean: the stored object (an untouched lean is never
 * rewritten). The flip keeps a zero slope zero, so a seam-free lean (`seamFree`) stays seam-free. A draft with no lean
 * (none, or one being removed) adds nothing: its own key, present or absent, is the after-state's.
 */
function lowerLean(storedBefore: Board, draft: Board): { lean?: Lean } {
  if (!draft.lean) return {};
  const back = leanFlip(draft.lean);
  const s = storedBefore.lean;
  return { lean: s && s.x === back.x && s.z === back.z && s.face === back.face ? s : back };
}

/**
 * A part's curves lowered back through ONE mirror (curves spec §6.2): like lowerHoles, a flag flip, exact and size-free;
 * a curve equal to the stored one with the same id maps back to THAT object; all reused: the stored array.
 */
function lowerCurves(storedBefore: Board, draft: Board): CurveCut[] {
  const d0 = mirrorDim(draft);
  const byId = new Map(storedBefore.curves.map((c) => [c.id, c]));
  const out = draft.curves.map((c) => {
    const back = mirrorCurveCut(c, d0);
    const s = byId.get(c.id);
    return s && sameCurve(s, back) ? s : back;
  });
  return out.length === storedBefore.curves.length && out.every((c, i) => c === storedBefore.curves[i]) ? storedBefore.curves : out;
}

/**
 * One level down: the part's after-state in an instance's frame, from its
 * after-state in the parent's frame. A position goes down as a DELTA (spec
 * §5.2): the stored value gains the inverse-rotated world change, less the
 * change in the turned box's corner offset. An axis that did not move gains
 * exactly zero, so nothing is round-tripped. Through a MIRRORED frame
 * (mirrored-instances spec §4) it lowers into the reflected coordinates the
 * placement used (mirrorPart of the stored before), then reflects back: the turn
 * negated, x by -dx' less the change in x extent, the cuts by lowerCuts.
 */
function lower(inst: Instance, upperBefore: Board, lowerBefore: Board, upperAfter: Board, keepWorld: boolean): Board {
  if (!inst.mirrored) {
    const { draft, d } = lowerDelta(inst, upperBefore, lowerBefore, upperAfter);
    return { ...draft, position: [lowerBefore.position[0] + d[0]!, lowerBefore.position[1] + d[1]!, lowerBefore.position[2] + d[2]!] };
  }
  const mBefore = mirrorPart(lowerBefore);
  const { draft, d } = lowerDelta(inst, upperBefore, mBefore, upperAfter);
  const dx = (0 - d[0]!) - (boardExtents(draft)[0] - boardExtents(mBefore)[0]);
  return {
    ...draft,
    rotation: inverseTurn(draft.rotation),
    position: [lowerBefore.position[0] + dx, lowerBefore.position[1] + d[1]!, lowerBefore.position[2] + d[2]!],
    cuts: lowerCuts(lowerBefore, draft, keepWorld),
    angleCuts: lowerAngleCuts(lowerBefore, draft),
    holes: lowerHoles(lowerBefore, draft),
    curves: lowerCurves(lowerBefore, draft),
    profiles: lowerProfiles(lowerBefore, draft),
    bands: lowerBands(lowerBefore, draft),
    ...lowerLean(lowerBefore, draft),
    ...lowerTenons(lowerBefore.tenons, draft, mirrorDim(draft)),
  };
}

export const POSTURE_ACROSS_MIRROR = "Linked parts on both sides of a mirror can't change between flat and upright. Unlink first.";
/** A posture change on a leaning part (splayed legs spec §3.2: only an upright part can lean). */
export const POSTURE_WHILE_LEANING = 'Clear the lean first — only an upright part can lean.';

/**
 * Why a posture patch on `ids` must be refused, or null (mirrored-instances spec
 * §4, amended). Under an odd number of mirrors a part's stored cuts depend on
 * its posture's d0 (`mirrorDim`), so a posture change that moves d0 (flat or
 * on-edge <-> upright) rewrites them, re-reflected (the approved coupling). A
 * shaped part's cuts are stored ONCE, and the store writes the change to every
 * user through an occurrence on the EDITED part's side (`sameSideFirst`). So
 * the change is refused only when some user of the Shape (by `storageKey`) has
 * no world occurrence on that side: it would have to be lowered through the
 * other side and would write different cuts to the Shape. That is a Shape split
 * by Ungroup or Make Unique; a shared definition placed both ways (a cabinet and
 * its mirrored copy) is allowed from either side. Also refused (defensive; a
 * selection is one level): two targets sharing a Shape on different sides. A
 * posture that keeps d0 (flat <-> on-edge) is never refused. The ONE decider:
 * the store's updateBoards and the Posture field. A side is `sideAt`: the chain's
 * parity XOR the part's own mirror flag (mirrored links, fu 432, spec §4), so a Shape
 * with a mirrored and an unmirrored user is refused like one split by an assembly.
 * First of all, a posture change on a LEANING part is refused (`POSTURE_WHILE_LEANING`, splayed legs spec §3.2): only an
 * upright part can lean, and the loader would drop the lean the change strands.
 */
export function postureRefusal(doc: SloydDocument, ids: readonly string[], posture: Posture | undefined): string | null {
  if (posture === undefined) return null;
  const world = worldParts(doc);
  if (ids.some((id) => { const b = world.find((x) => x.id === id); return b !== undefined && b.posture !== posture && leans(b); })) {
    return POSTURE_WHILE_LEANING;
  }
  const sideOf = new Map<string, boolean>();
  for (const id of ids) {
    const b = world.find((x) => x.id === id);
    if (!b?.shape || mirrorDim({ ...b, posture }) === mirrorDim(b)) continue;
    const side = sideAt(doc, b.id);
    if (sideOf.has(b.shape) && sideOf.get(b.shape) !== side) return POSTURE_ACROSS_MIRROR;
    sideOf.set(b.shape, side);
    const users = world.filter((x) => x.shape === b.shape);
    const key = (x: Board) => storageKey(doc, x.id) ?? x.id;
    const onSide = new Set(users.filter((x) => sideAt(doc, x.id) === side).map(key));
    if (users.some((x) => !onSide.has(key(x)))) return POSTURE_ACROSS_MIRROR;
  }
  return null;
}

/**
 * `ids` reordered so each occurrence on the side `sideOf` names comes before
 * any on the other side (stable otherwise). `oneEditPerTarget` keeps the FIRST
 * occurrence of each stored part, so this makes it lower every stored part
 * through the side the edit was made on: two lowerings through different
 * parities would write different cuts to one Shape (spec §4, amended). A side
 * is `sideAt` (the part's own mirror flag counts; mirrored links, fu 432).
 */
export function sameSideFirst(doc: SloydDocument, ids: Iterable<string>, sideOf: (id: string) => boolean | undefined): string[] {
  const off = (id: string) => { const want = sideOf(id); return want !== undefined && sideAt(doc, id) !== want ? 1 : 0; };
  return [...ids].map((id, i) => ({ id, i, o: off(id) })).sort((a, b) => a.o - b.o || a.i - b.i).map((x) => x.id);
}

/** The storage id of the root container. A definition may never carry it:
 *  validateDefinitions drops one that does, or its edits would land here. */
export const ROOT_STORAGE_ID = 'ROOT';
const ROOT = ROOT_STORAGE_ID;

/** The id of the definition holding `container`'s parts, or ROOT. */
function definitionIdOf(doc: SloydDocument, container: string | null): string | null {
  if (container === null) return ROOT;
  return definitionAt(doc, container)?.id ?? null;
}

/** Where an occurrence is STORED: the same key for every placement of one
 *  stored part (components spec 4.1). Null when the occurrence does not resolve. */
export function storageKey(doc: SloydDocument, occ: string): string | null {
  const def = definitionIdOf(doc, parentPath(occ));
  if (def === null || !partAt(doc, occ)) return null;
  return `${def}:${lastSegment(occ)}`;
}

/** Where an ITEM (a part or an assembly) is stored: storageKey's rule, for
 *  instances too. Every placement of one stored item shares the key, so an
 *  edit to one occurrence reaches them all. Null when the path does not resolve. */
export function itemKey(doc: SloydDocument, path: string): string | null {
  const def = definitionIdOf(doc, parentPath(path));
  if (def === null || (!partAt(doc, path) && !instanceAt(doc, path))) return null;
  return `${def}:${lastSegment(path)}`;
}

/** The predicate for "this path lies under ANOTHER placement of a selected stored
 *  item": it, or an ancestor, shares an `itemKey` with one of `selectedIds`, so an
 *  edit to the selected item moves it too. The ONE statement of the twin rule:
 *  `moveCandidates` withholds such points and `commitSnapMove` refuses them. */
export function sharesStorageWith(
  selectedIds: readonly string[],
  keyOf: (path: string) => string | null,
): (path: string) => boolean {
  const keys = new Set(selectedIds.map(keyOf).filter((k): k is string => k !== null));
  return (path) => {
    if (keys.size === 0) return false;
    for (let p: string | null = path; p !== null; p = parentPath(p)) {
      const k = keyOf(p);
      if (k !== null && keys.has(k)) return true;
    }
    return false;
  };
}

/** Replace one definition's (or the root's) parts by id. */
function updateDefinition(doc: SloydDocument, defId: string, fn: (boards: StoredBoard[]) => StoredBoard[]): SloydDocument {
  if (defId === ROOT) return { ...doc, boards: fn(doc.boards) };
  return { ...doc, definitions: doc.definitions.map((d) => (d.id === defId ? { ...d, boards: fn(d.boards) } : d)) };
}

/** Deep equality for written records (plain data). */
const sameRecord = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** One world edit lowered into its storage target: where it is stored, which
 *  fields it changes, and each changed field's value in the container frame. */
interface Lowered {
  stored: StoredBoard;
  defId: string;
  key: string;
  changedKeys: string[];
  valueOf: (k: string) => unknown;
  after: Board;
}

const rec = (b: unknown) => b as Record<string, unknown>;

/**
 * THE lowering of a world edit (spec §5.1, §5.2), shared by applyWorldEdits
 * and writeBackFlat so there is one copy: the after-state goes down level by
 * level through `lower`, and the changed fields are decided against the
 * world before. Null when the occurrence does not resolve.
 */
function lowerEdit(doc: SloydDocument, shapes: ReadonlyMap<string, Shape>, before: Board, after: Board, keepWorld: boolean): Lowered | null {
  const occ = before.id;
  const cPath = parentPath(occ);
  const stored = partAt(doc, occ);
  const defId = definitionIdOf(doc, cPath);
  if (!stored || defId === null) return null;
  const resolved = resolveBoard(shapes, stored);
  if (!resolved) return null;
  const chain = cPath === null ? [] : instancesOn(doc, cPath) ?? [];
  const reps: Board[] = [];
  reps[chain.length] = resolved;
  for (let j = chain.length - 1; j >= 0; j -= 1) reps[j] = placeBoard(chain[j]!, reps[j + 1]!);
  let cur = after;
  for (let j = 0; j < chain.length; j += 1) cur = lower(chain[j]!, reps[j]!, reps[j + 1]!, cur, keepWorld);
  // A mirrored user (mirrored links, fu 432, spec §4): `cur` is now in the part's own (mirrored) hand; lower its features
  // once more through the part's own flag into the Shape's hand. No turn or position: the flag mirrors features only.
  // `ref` is the Shape's OWN arrays at the before sizes, so an untouched feature maps back to the Shape's object (no
  // drift, inv 44) and the change tests below compare against what is stored, never `resolved`'s mirrored copies.
  const shape = isShaped(stored) && stored.mirrored === true ? shapes.get(stored.shape) : undefined;
  const ref: Board = shape ? withShapeFeatures(resolved, shape) : resolved;
  if (shape) cur = lowerOwnMirror(ref, cur, keepWorld);

  const resized = keepWorld
    && (before.posture !== after.posture || boardExtents(before).some((e, a) => e !== boardExtents(after)[a]));
  const moved = resized || !samePosition(before.position, after.position) || before.rotation !== after.rotation;
  const changedKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => {
    if (k === 'id' || k === 'shape') return false;            // never written through here
    if (k === 'position' || k === 'rotation') return moved;
    if (k === 'angleCuts') {
      // Written when edited, or when a mirror lowering produced a fresh array that is not the stored one
      // (a d0-moving posture change keeps the world angle cuts as seen). An unmirrored chain and an unflagged part
      // leave cur === after. A flagged user's cur is lowered through its own flag, so cur !== after even when nothing
      // changed: what prevents a write then is `cur.X !== ref.X` — lowerOwnMirror maps an untouched feature back to the
      // Shape's own array (`ref`), so a shared world array is never written.
      return rec(before)[k] !== rec(after)[k] || (cur.angleCuts !== after.angleCuts && cur.angleCuts !== ref.angleCuts);
    }
    if (k === 'holes') {
      // As angleCuts: written when edited, or when a mirror lowering produced a fresh array that is not the stored one.
      return rec(before)[k] !== rec(after)[k] || (cur.holes !== after.holes && cur.holes !== ref.holes);
    }
    if (k === 'curves') {
      // As holes: written when edited, or when a mirror lowering produced a fresh array that is not the stored one.
      return rec(before)[k] !== rec(after)[k] || (cur.curves !== after.curves && cur.curves !== ref.curves);
    }
    if (k === 'profiles') {
      // As curves.
      return rec(before)[k] !== rec(after)[k] || (cur.profiles !== after.profiles && cur.profiles !== ref.profiles);
    }
    if (k === 'bands') {
      // As profiles.
      return rec(before)[k] !== rec(after)[k] || (cur.bands !== after.bands && cur.bands !== ref.bands);
    }
    if (k === 'hardware') {
      // As bands.
      return rec(before)[k] !== rec(after)[k] || (cur.hardware !== after.hardware && cur.hardware !== ref.hardware);
    }
    if (k === 'lean') {
      // As angleCuts (splayed legs spec §3.4): written when edited, or when a mirror lowering produced a fresh object
      // that is not the stored one. `lowerLean` maps an untouched lean back to the stored (or Shape's) object.
      return rec(before)[k] !== rec(after)[k] || (cur.lean !== after.lean && cur.lean !== ref.lean);
    }
    if (k === 'tenons') {
      // As holes (round tenons spec §3.1): written when edited, or when a mirror lowering produced a fresh array that is
      // not the stored one. `lowerTenons` maps an untouched list back to the stored (or Shape's) array.
      return rec(before)[k] !== rec(after)[k] || (cur.tenons !== after.tenons && cur.tenons !== ref.tenons);
    }
    return k === 'cuts' ? cur.cuts !== ref.cuts : rec(before)[k] !== rec(after)[k];
  });
  const valueOf = (k: string) => (k === 'position' ? [...cur.position] : k === 'rotation' ? cur.rotation : k === 'cuts' ? cur.cuts : k === 'angleCuts' ? cur.angleCuts : k === 'holes' ? cur.holes : k === 'curves' ? cur.curves : k === 'profiles' ? cur.profiles : k === 'bands' ? cur.bands : k === 'hardware' ? cur.hardware : k === 'lean' ? cur.lean : k === 'tenons' ? cur.tenons : rec(after)[k]);
  return { stored, defId, key: `${defId}:${stored.id}`, changedKeys, valueOf, after };
}

/** `b` carrying the Shape's OWN feature arrays (the Shape's hand): the reference a mirrored user's features are lowered
 *  against, so an untouched feature maps back to the Shape's object (no drift, inv 44). */
function withShapeFeatures(b: Board, shape: Shape): Board {
  return { ...b, cuts: shape.cuts, angleCuts: shape.angleCuts, holes: shape.holes, curves: shape.curves, profiles: shape.profiles, bands: shape.bands, ...(shape.lean ? { lean: shape.lean } : {}), ...(shape.tenons ? { tenons: shape.tenons } : {}) };
}

/**
 * A mirrored user's features lowered through its OWN flag (mirrored links, fu 432, spec §4): from the part's hand into
 * its Shape's, against `ref` (`withShapeFeatures`). The one copy shared by lowerEdit and joinery's regroup. Exact where
 * it matters: an untouched feature comes back as the Shape's own object; a new rectangular cut is reflected by
 * `mirrorCut` (not bit-exact twice on a non-dyadic size), every other feature by its flag flips.
 */
function lowerOwnMirror(ref: Board, cur: Board, keepWorld: boolean): Board {
  return {
    ...cur,
    cuts: lowerCuts(ref, cur, keepWorld),
    angleCuts: lowerAngleCuts(ref, cur),
    holes: lowerHoles(ref, cur),
    curves: lowerCurves(ref, cur),
    profiles: lowerProfiles(ref, cur),
    bands: lowerBands(ref, cur),
    ...lowerLean(ref, cur),
    ...lowerTenons(ref.tenons, cur, mirrorDim(cur)),
  };
}

/** A lowered field's written value; ABSENT marks a key to delete. */
const ABSENT = Symbol('absent');

/** One lowered field's value for a stored record or a Shape: its value, or ABSENT for a key the after-state no longer
 *  has. `lean` (splayed legs spec §3.1) is optional and is removed by an edit whose key is present and `undefined`
 *  (controller ruling 1; `sharedPatch` carries that removal), so an undefined lean is ABSENT too: no `lean: undefined`
 *  is ever stored (an absent key and an undefined one read differently through `in`, as `resolveBoard` does). Any other
 *  key set to undefined stays a write, not a delete (the merge test pins that a delete and an undefined disagree).
 *  `tenons` is the same, an empty list read as a removal too. */
function storedValue(l: Lowered, k: string): unknown {
  if (k === 'position' || k === 'rotation') return l.valueOf(k);
  if (!(k in l.after)) return ABSENT;
  const v = l.valueOf(k);
  if (k === 'lean' && v === undefined) return ABSENT;
  // `tenons` (round tenons spec §3.1): a removal is `undefined` or `[]` (`sharedPatch`), and neither is ever stored.
  return k === 'tenons' && !hasTenons({ tenons: v as Board['tenons'] }) ? ABSENT : v;
}

/** Field-by-field merge of every edit into one record: a field written twice
 *  must agree, a field written once is kept, so the result does not depend on
 *  the order of the edits. */
function mergeField(rec0: Record<string, unknown>, wrote: Map<string, unknown>, k: string, v: unknown, what: string): void {
  if (wrote.has(k)) {
    const prior = wrote.get(k);
    const same = prior === ABSENT || v === ABSENT ? prior === v : sameRecord(prior, v);
    if (!same) throw new Error(`applyWorldEdits: disagreeing edits to ${what}`);
    return;
  }
  wrote.set(k, v);
  if (v === ABSENT) delete rec0[k];
  else rec0[k] = v;
}

/**
 * Write world-space edits back into the tree (spec §5.1, §5.2). Only changed
 * fields are written: `position` compared element by element, `cuts` by reference, `angleCuts`, `holes` and `curves` when edited
 * or when a mirror lowering re-reflected them (a posture change that moves d0 keeps the world angle cuts and hole rows as
 * seen, as `lowerCuts` does for cuts; an unmirrored chain never writes a shared world array), everything else by `!==`.
 * `position`, `rotation`, `cuts`, `angleCuts`, `holes` and `curves` go down level by level through `lower` (through a mirror the cuts are
 * reflected back by `lowerCuts`; untouched ones stay the stored objects); every
 * other field is part-local and goes back as it is. A key present before and absent after is deleted (storedValue).
 * A root part's write is plain assignment, exactly as before assemblies.
 * `keepWorld` (joinery only): a part whose extents or posture changed also
 * counts as moved, so the world box is kept; a Properties edit keeps the
 * stored local position instead (spec §5.2) and must not pass it.
 * Components (spec 4.1): edits are keyed by STORAGE target (definition id +
 * part id), so every placement of one stored part is one write; a shared
 * field of a shaped part is written into its Shape. Edits are merged FIELD BY
 * FIELD (mergeField): two edits writing one field of one target must agree or
 * this throws; fields each writes alone are both kept, in any order. The
 * store's callers still send at most one edit per storage key
 * (oneEditPerTarget), and writeBackFlat does too.
 */
export function applyWorldEdits(doc: SloydDocument, edits: readonly WorldEdit[], opts?: { keepWorld?: boolean }): SloydDocument {
  const shapes = shapeMap(doc);
  // By storage key / shape id: the merged record and the fields written into it.
  const parts = new Map<string, { defId: string; next: Record<string, unknown>; wrote: Map<string, unknown> }>();
  const shapeWrites = new Map<string, { next: Record<string, unknown>; wrote: Map<string, unknown> }>();
  for (const { before, after } of edits) {
    const l = lowerEdit(doc, shapes, before, after, opts?.keepWorld === true);
    if (!l) continue;
    const { stored, defId, key } = l;
    let part = parts.get(key);
    if (!part) parts.set(key, part = { defId, next: { ...stored }, wrote: new Map() });
    for (const k of l.changedKeys) {
      const shared = (LINK_FIELDS as Record<string, string>)[k] === 'shared';
      if (isShaped(stored) && shared) {
        let sh = shapeWrites.get(stored.shape);
        if (!sh) shapeWrites.set(stored.shape, sh = { next: { ...shapes.get(stored.shape)! }, wrote: new Map() });
        mergeField(sh.next, sh.wrote, k, storedValue(l, k), `shape ${stored.shape}`);
      } else {
        mergeField(part.next, part.wrote, k, storedValue(l, k), key);
      }
    }
  }
  let out = doc;
  const byDef = new Map<string, Map<string, StoredBoard>>();
  for (const { defId, next, wrote } of parts.values()) {
    if (wrote.size === 0) continue;   // nothing changed: the stored object stays
    if (!byDef.has(defId)) byDef.set(defId, new Map());
    byDef.get(defId)!.set(next.id as string, next as unknown as StoredBoard);
  }
  for (const [defId, m] of byDef) out = updateDefinition(out, defId, (bs) => bs.map((b) => m.get(b.id) ?? b));
  if (shapeWrites.size) out = { ...out, shapes: out.shapes.map((s) => (shapeWrites.get(s.id)?.next as Shape | undefined) ?? s) };
  return out;
}

/**
 * Run a per-part function over the world parts and write what it changed back
 * (spec §5.1): the ONE way the store edits a part. `fn` may replace entries,
 * never add or remove them.
 */
export function mapWorld(doc: SloydDocument, fn: (world: Board[]) => Board[]): SloydDocument {
  const world = worldParts(doc);
  const next = fn(world);
  if (next === world) return doc;
  if (next.length !== world.length) throw new Error(`mapWorld: ${world.length} parts in, ${next.length} out`);
  const edits = world.flatMap((b, i) => (next[i] !== b ? [{ before: b, after: next[i]! }] : []));
  return edits.length === 0 ? doc : applyWorldEdits(doc, edits);
}

/**
 * Move items (parts or instances) by one WORLD delta (spec §4.2): turned and,
 * through a mirror, reflected into each item's container frame (exact, a
 * quarter turn only swaps and negates)
 * and added to its stored position or origin. A root item gains the delta
 * exactly, as translateBoards did. Nothing rounds (invariant 25). An item
 * listed together with one of its ancestors is not moved separately.
 */
export function translateItems(doc: SloydDocument, ids: readonly string[], worldDelta: readonly number[]): SloydDocument {
  // An item whose ancestor is also listed moves with that ancestor; moving it
  // too would shift it twice (spec §4.2: a selection is one level, so the UI
  // never sends both, but the function must not rely on that).
  const listed = new Set(ids);
  const byContainer = new Map<string | null, Set<string>>();
  for (const id of ids) {
    const above = parentPath(id);
    if (above !== null && isCovered(above, listed)) continue;
    const c = parentPath(id);
    if (!byContainer.has(c)) byContainer.set(c, new Set());
    byContainer.get(c)!.add(lastSegment(id));
  }
  let out = doc;
  for (const [cPath, members] of byContainer) {
    const d = toLocal(containerLinear(doc, cPath), worldDelta);
    const shift = (p: readonly number[]): [number, number, number] => [p[0]! + d[0], p[1]! + d[1], p[2]! + d[2]];
    out = updateContainer(out, cPath, (c) => ({
      ...c,
      boards: c.boards.map((b) => (members.has(b.id) ? { ...b, position: shift(b.position) } : b)),
      instances: c.instances.map((i) => (members.has(i.id) ? { ...i, position: shift(i.position) } : i)),
    }));
  }
  return out;
}

/** Every stored part made plain, a shaped one keeping its `shape` key as a
 *  MARKER of the shape it came from (it has `length`, so isShaped is false).
 *  writeBackFlat writes shared fields onto each part, then regroups by marker. */
function plainWithMarkers(doc: SloydDocument): SloydDocument {
  if (doc.shapes.length === 0) return doc;
  const shapes = shapeMap(doc);
  const fix = (bs: StoredBoard[]) => bs.map((b) => (isShaped(b) ? resolveBoard(shapes, b) ?? b : b));
  return { ...doc, boards: fix(doc.boards), definitions: doc.definitions.map((d) => ({ ...d, boards: fix(d.boards) })) };
}

/** A part's shared fields as comparable values, each cut by GEOMETRY (CUT_GEOMETRY_KEYS, in order) and NOT by id:
 *  pocketFor mints fresh cut ids per board, so identical mortises differ only by id (spec §5); angle cuts likewise by
 *  ANGLE_CUT_FIELDS, holes, curves and tenons by their tables. Each list SORTED: the order cuts were stored in is not geometry
 *  (joinery appends mortises in site order, a turned user's list differs from its mate's). Used to group a shape's users
 *  (regroupShapes) and to compare placements of one definition (resultSignature, fu 316). */
function groupSignature(b: Board): unknown[] {
  const sorted = (xs: unknown[]) => xs.map((x) => JSON.stringify(x)).sort();
  return SHARED_KEYS.map((k) => (k === 'cuts' ? sorted(b.cuts.map((c) => CUT_GEOMETRY_KEYS.map((f) => c[f]))) : k === 'angleCuts' ? sorted(b.angleCuts.map(angleCutValues)) : k === 'holes' ? sorted(b.holes.map(holeRowValues)) : k === 'curves' ? sorted(b.curves.map(curveValues)) : k === 'profiles' ? sorted(b.profiles.map(profileValues)) : k === 'bands' ? b.bands.map(bandValues).join(';') : k === 'hardware' ? b.hardware.map((u) => `${u.type}:${u.count}`).join(';') : k === 'lean' ? (b.lean ? `${b.lean.x},${b.lean.z},${b.lean.face}` : '') : k === 'tenons' ? sorted((b.tenons ?? []).map(tenonValues)) : b[k]));
}

/** A lowered result as compared across placements: own position and rotation
 *  plus the shared fields, lists in any order (fu 316: placements whose cuts differ only in order share; step 2 writes
 *  the first one's record). Never `id`, `name` or `shape`: an occurrence is
 *  matched by its relative id already, and names are never written here. */
function resultSignature(b: Board): unknown[] {
  return [b.position, b.rotation, groupSignature(b)];
}

/** The results of every occurrence under the instance path `path`, keyed by id
 *  relative to it, sorted: what two placements of one definition compare. */
function subtreeSignature(results: ReadonlyMap<string, Board>, path: string): string {
  const prefix = path + PATH_SEPARATOR;
  const rows: [string, unknown[]][] = [];
  for (const [occ, b] of results) if (occ.startsWith(prefix)) rows.push([occ.slice(prefix.length), resultSignature(b)]);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(rows);
}

const depthOf = (path: string) => path.split(PATH_SEPARATOR).length;

/** Instance paths per definition id, in item order (root first, depth first). */
function placementsByDefinition(doc: SloydDocument): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of itemPaths(doc)) {
    const inst = instanceAt(doc, p);
    if (!inst) continue;
    if (!out.has(inst.definition)) out.set(inst.definition, []);
    out.get(inst.definition)!.push(p);
  }
  return out;
}

/** A one-level copy of a definition, ids kept (makeUniqueItem's copy). */
function copyDefinition(d: Definition): Definition {
  return {
    id: nextId(),
    boards: d.boards.map((b) => (isShaped(b)
      ? { ...b, position: [...b.position] as [number, number, number] }
      : { ...b, position: [...b.position] as [number, number, number], cuts: b.cuts.map((c) => ({ ...c })), angleCuts: b.angleCuts.map(copyAngleCut), holes: b.holes.map(copyHoleRow), curves: b.curves.map(copyCurve), profiles: b.profiles.map(copyProfile), bands: b.bands.map(copyBand), hardware: b.hardware.map(copyHardwareUse), ...(b.tenons ? { tenons: b.tenons.map(copyTenon) } : {}) })),
    instances: d.instances.map((j) => ({ ...j, position: [...j.position] as [number, number, number] })),
    hardware: d.hardware.map(copyHardwareUse),
  };
}

/**
 * Step 1 of writeBackFlat: split every definition whose placements' results
 * disagree, TOP-DOWN. A definition is taken in order of the DEEPEST of its
 * placements, shallowest first. That is a topological order (a definition
 * holding another has every placement of it at least one level deeper), so
 * every definition above this one already agrees, and two placements reaching
 * ONE stored instance (the same instance id in the same container definition)
 * have equal subtrees and land in one group. Repointing that stored instance is
 * then right for all of them. Processed bottom-up, it would repoint a shared
 * cabinet's drawer for both cabinets at once. The check that this held throws
 * rather than loops; so does an iteration cap.
 */
function splitAssemblies(doc: SloydDocument, results: ReadonlyMap<string, Board>): SloydDocument {
  let out = doc;
  const cap = itemPaths(doc).size + 1;
  for (let round = 0; ; round += 1) {
    if (round > cap) throw new Error('writeBackFlat: assembly split did not settle');
    const byDef = placementsByDefinition(out);
    const order = [...byDef.entries()]
      .map(([id, ps], i) => ({ id, ps, depth: Math.max(...ps.map(depthOf)), i }))
      .sort((a, b) => a.depth - b.depth || a.i - b.i);
    let target: { id: string; groups: string[][] } | null = null;
    for (const { id, ps } of order) {
      const groups = new Map<string, string[]>();
      for (const p of ps) {
        const sig = subtreeSignature(results, p);
        if (!groups.has(sig)) groups.set(sig, []);
        groups.get(sig)!.push(p);
      }
      if (groups.size > 1) { target = { id, groups: [...groups.values()] }; break; }
    }
    if (!target) return out;
    // Every stored instance must fall wholly in one group (the top-down argument above).
    const groupOf = new Map<string, number>();
    target.groups.forEach((g, gi) => g.forEach((p) => {
      const ref = `${definitionIdOf(out, parentPath(p))}:${lastSegment(p)}`;
      if ((groupOf.get(ref) ?? gi) !== gi) throw new Error(`writeBackFlat: placements of one stored instance ${ref} disagree`);
      groupOf.set(ref, gi);
    }));
    const def = out.definitions.find((d) => d.id === target.id)!;
    for (const g of target.groups.slice(1)) {
      const copy = copyDefinition(def);
      out = { ...out, definitions: [...out.definitions, copy] };
      for (const p of g) {
        out = updateContainer(out, parentPath(p), (c) => ({
          ...c, instances: c.instances.map((i) => (i.id === lastSegment(p) ? { ...i, definition: copy.id } : i)),
        }));
      }
    }
  }
}

/** Every stored part with its storage key (`<definition id or ROOT>:<part id>`, storageKey's form), in document order
 *  (the root's, then each definition's): the order `shapeUsers` counts in, so "a shape's first user" means one thing. */
const keyedInOrder = (doc: SloydDocument): [string, StoredBoard][] => [
  ...doc.boards.map((b): [string, StoredBoard] => [`${ROOT}:${b.id}`, b]),
  ...doc.definitions.flatMap((d) => d.boards.map((b): [string, StoredBoard] => [`${d.id}:${b.id}`, b])),
];

/** The storage keys of the stored parts carrying `mirrored` (writeBackFlat reads them off its markers BEFORE joinery's
 *  results are written, so a recipe that rebuilds a part without the key cannot drop a flag). */
const flaggedKeys = (doc: SloydDocument): Set<string> =>
  new Set(keyedInOrder(doc).filter(([, b]) => b.mirrored === true).map(([k]) => k));

/**
 * Step 3 of writeBackFlat: regroup each shape's users (marked plain parts) by their new shared fields, cuts by geometry
 * (ORDER ignored: groupSignature sorts them). The group holding the shape's first user (document order) keeps the shape;
 * every other group gets a new one. A shape takes its group's founding member's shared fields, cut ids included, so
 * every user carries those ids. A group of one stays a shape here, its own fields and NO flag; migrateDocument dissolves
 * it into exactly that part.
 *
 * Mirrored links (fu 432, spec §6.2): a user keeps its own flag (`flagged`, by storage key), and a user joins a group
 * only when its group's Shape, resolved through the user's OWN flag, gives exactly the user's shared fields
 * (groupSignature) — so two users whose features are mirror images stay one Shape, and every world is joinery's output by
 * construction. The membership test is that resolution, never a hash of lowered fields: `mirrorCut` is not bit-exact
 * twice on a non-dyadic size, so lowering a mirrored user's untouched cuts and reflecting them back could split a pair
 * joinery never touched. A group's Shape is its founder's fields when the founder is unflagged; a flagged founder takes
 * the fields of the first later UNflagged user it resolves against, else its own fields lowered through its flag
 * (`lowerOwnMirror` against the ORIGINAL Shape, so untouched features are the Shape's own objects). A flagged founder that
 * resolves against neither is alone. Among unflagged users this is today's exact comparison, unchanged.
 */
function regroupShapes(doc: SloydDocument, flagged: ReadonlySet<string>): SloydDocument {
  const marked = (b: StoredBoard): b is Board & { shape: string } => !isShaped(b) && typeof b.shape === 'string';
  interface User { key: string; b: Board & { shape: string }; flag: boolean; sig: string }
  const users = new Map<string, User[]>();     // shape id -> users, in document order
  for (const [key, b] of keyedInOrder(doc)) {
    if (!marked(b)) continue;
    if (!users.has(b.shape)) users.set(b.shape, []);
    users.get(b.shape)!.push({ key, b, flag: flagged.has(key), sig: JSON.stringify(groupSignature(b)) });
  }
  if (users.size === 0) return doc;
  const original = shapeMap(doc);
  const PROBE = 'regroup-probe';
  /** Whether `fields` as a Shape, read through `u`'s own flag, is exactly `u`'s shared fields. */
  const resolvesTo = (fields: Pick<Board, SharedField>, u: User): boolean => {
    const record: StoredBoard = { id: u.b.id, name: u.b.name, position: u.b.position, rotation: u.b.rotation, shape: PROBE, ...(u.flag ? { mirrored: true as const } : {}) };
    const r = resolveBoard(new Map([[PROBE, { id: PROBE, ...fields }]]), record);
    return r !== null && JSON.stringify(groupSignature(r)) === u.sig;
  };
  const kept = new Map<string, Shape>();
  const added: Shape[] = [];
  const recordOf = new Map<string, StoredBoard>();   // storage key -> rewritten record
  for (const [sid, list] of users) {
    const sh = original.get(sid);
    let left = list;
    for (let gi = 0; left.length > 0; gi += 1) {
      const founder = left[0]!;
      // The Shape's fields: an unflagged founder's own (they resolve to it by construction, see `member`); a flagged
      // founder's from the first later unflagged user it resolves against, and only when none does, its own fields
      // lowered through its flag (built lazily: the common case never needs it).
      let fields: Pick<Board, SharedField> | undefined;
      if (!founder.flag) fields = sharedOf(founder.b);
      else {
        for (const u of left) {
          if (u.flag) continue;
          const f = sharedOf(u.b);
          if (resolvesTo(f, founder)) { fields = f; break; }
        }
        if (!fields) {
          const f = sharedOf(lowerOwnMirror(sh ? withShapeFeatures(founder.b, sh) : founder.b, founder.b, true));
          if (resolvesTo(f, founder)) fields = f;
        }
      }
      // Exact short-circuit: with neither flagged and the founder's own fields, resolving reproduces them verbatim
      // (resolveBoard copies SHARED_KEYS unchanged for an unflagged record, and groupSignature reads only SHARED_KEYS),
      // so membership is signature equality. A shape with no flagged user therefore resolves nothing.
      const member = (f: Pick<Board, SharedField>, u: User): boolean =>
        (!founder.flag && !u.flag ? u.sig === founder.sig : resolvesTo(f, u));
      const group = fields ? left.filter((u) => member(fields!, u)) : [founder];
      const alone = group.length === 1;
      const s: Shape = { id: gi === 0 ? sid : nextId(), ...(alone ? sharedOf(founder.b) : fields!) };
      if (gi === 0) kept.set(sid, s); else added.push(s);
      for (const u of group) {
        recordOf.set(u.key, { id: u.b.id, name: u.b.name, position: u.b.position, rotation: u.b.rotation, shape: s.id, ...(u.flag && !alone ? { mirrored: true as const } : {}) });
      }
      left = left.filter((u) => !group.includes(u));
    }
  }
  const fix = (defId: string, bs: StoredBoard[]) => bs.map((b): StoredBoard => recordOf.get(`${defId}:${b.id}`) ?? b);
  return {
    ...doc,
    boards: fix(ROOT, doc.boards),
    definitions: doc.definitions.map((d) => ({ ...d, boards: fix(d.id, d.boards) })),
    shapes: [...doc.shapes.map((s) => kept.get(s.id) ?? s), ...added],
  };
}

/**
 * Joinery's way back (components spec §5). Parts pair BY INDEX with the
 * flattened before (count mismatch throws): `applyJoints` re-mints occurrence
 * ids, and every recipe keeps the count and order of parts. Each occurrence's
 * result is lowered into its own container's frame (`lowerEdit`, keepWorld:
 * joinery's output is world geometry, so a grown part keeps its world box).
 * Path names are compared against the same flattened before, so they are never
 * written back as renames. Then:
 * 1. assemblies, top-down (`splitAssemblies`): a definition whose placements'
 *    subtree results differ (cut lists compared in any order, fu 316) splits; the group holding the first placement keeps
 *    it, every other group gets a one-level copy (ids kept, so paths and
 *    results stay keyed by occurrence id). Repeat until every definition's
 *    placements agree.
 * 2. results are written per storage target, now unambiguous. Shaped parts are
 *    made plain first (marked with their shape), so a shared field lands on the
 *    part, never in a Shape another part's edit could also reach. Exactly ONE
 *    edit per storage key goes to applyWorldEdits, from that key's first
 *    occurrence: its other occurrences have the same subtree signature (step 1
 *    split on it), so they lowered to the same record, and with one edit per
 *    key applyWorldEdits has nothing to merge.
 * 3. shapes (`regroupShapes`): users grouped by shared fields with cuts
 *    compared by GEOMETRY, their ORDER ignored (groupSignature); the first user's group keeps the shape, others get
 *    new shapes; a group takes its first member's cut ids, except that a flagged founder's group takes those of the
 *    first later UNflagged user it resolves against (Ruling 11; else its own, lowered through its flag). migrateDocument
 *    dissolves one-user shapes. A mirrored user (fu 432) keeps its flag, read off
 *    the markers BEFORE the results are written (joinery's parts need not carry
 *    it), and groups with users its group's Shape resolves to exactly through
 *    that flag (spec §6.2).
 * Comparisons are exact (stored values, invariant 18).
 */
export function writeBackFlat(doc: SloydDocument, flatBefore: readonly Board[], flatAfter: readonly Board[]): SloydDocument {
  if (flatBefore.length !== flatAfter.length) {
    throw new Error(`writeBackFlat: part count changed (${flatBefore.length} -> ${flatAfter.length})`);
  }
  const plain = plainWithMarkers(doc);
  const shapes = shapeMap(plain);
  const edits = flatBefore.map((before, i) => ({ before, after: { ...flatAfter[i]!, id: before.id } }));
  const results = new Map<string, Board>();
  for (const { before, after } of edits) {
    const l = lowerEdit(plain, shapes, before, after, true);
    if (!l) continue;
    const next: Record<string, unknown> = { ...l.stored };
    for (const k of l.changedKeys) {
      const v = storedValue(l, k);
      if (v === ABSENT) delete next[k];
      else next[k] = v;
    }
    results.set(before.id, next as unknown as Board);
  }
  const split = splitAssemblies(plain, results);
  const seen = new Set<string>();
  const once = edits.filter(({ before }) => {
    const key = storageKey(split, before.id);
    if (key === null || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return regroupShapes(applyWorldEdits(split, once, { keepWorld: true }), flaggedKeys(split));
}
