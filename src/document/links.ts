import type { Board, Shape } from './types';
import { CUT_GEOMETRY_KEYS } from './cuts';
import { copyAngleCut, sameAngleCut } from './angleCuts';
import { copyHoleRow, sameHoleRow } from './holes';
import { copyCurve, sameCurve } from './curves';
import { copyProfile, sameProfile } from './profiles';
import { copyBand, sameBands } from './bandModel';
import { copyHardwareUse, sameHardware } from './hardwareModel';

/**
 * Which Board fields a link shares (linking spec §2): the shared ones live in
 * a Shape, the own ones on each part (components spec §2). The ONE table:
 * Shape, ShapedBoard, Link and the write-back all read it, and `satisfies` makes a new
 * Board field fail tsc until it is classified (invariant 40's argument).
 */
export const LINK_FIELDS = {
  id: 'own', name: 'own', position: 'own', rotation: 'own', shape: 'own',
  length: 'shared', width: 'shared', thickness: 'shared', material: 'shared',
  grain: 'shared', posture: 'shared', cuts: 'shared', angleCuts: 'shared', holes: 'shared', curves: 'shared', profiles: 'shared',
  bands: 'shared', cornerRule: 'shared', hardware: 'shared',
} as const satisfies Record<keyof Board, 'shared' | 'own'>;

export type SharedField = {
  [K in keyof typeof LINK_FIELDS]: (typeof LINK_FIELDS)[K] extends 'shared' ? K : never;
}[keyof typeof LINK_FIELDS];

export const SHARED_KEYS = (Object.keys(LINK_FIELDS) as (keyof typeof LINK_FIELDS)[])
  .filter((k): k is SharedField => LINK_FIELDS[k] === 'shared');

export type OwnField = Exclude<keyof typeof LINK_FIELDS, SharedField>;

/** Fails tsc when Shape's fields and LINK_FIELDS' shared set drift apart. */
const _shapeMatchesTable: [Exclude<keyof Shape, 'id'>] extends [SharedField] ? ([SharedField] extends [Exclude<keyof Shape, 'id'>] ? true : never) : never = true;
void _shapeMatchesTable;

/**
 * `sameShared` compares every shared field except `cuts`, `angleCuts`, `holes`, `curves`, `profiles`, `bands` and `hardware` with `!==`, which is
 * only right for primitives. This fails tsc if any other shared field is ever
 * not a string or number (invariant 40's argument, one table over): such a
 * field needs its own comparison in `sameShared` before it can be classified.
 */
const _sharedPrimitives: Board[Exclude<SharedField, 'cuts' | 'angleCuts' | 'holes' | 'curves' | 'profiles' | 'bands' | 'hardware'>] extends string | number ? true : never = true;
void _sharedPrimitives;

/** A board's shared fields, cuts copied (same ids, new objects) so no two
 *  members ever hold one Cut object. */
export function sharedOf(b: Board): Pick<Board, SharedField> {
  return {
    length: b.length, width: b.width, thickness: b.thickness,
    material: b.material, grain: b.grain, posture: b.posture,
    cuts: b.cuts.map((c) => ({ ...c })),
    angleCuts: b.angleCuts.map(copyAngleCut),
    holes: b.holes.map(copyHoleRow),
    curves: b.curves.map(copyCurve),
    profiles: b.profiles.map(copyProfile),
    bands: b.bands.map(copyBand), cornerRule: b.cornerRule,
    hardware: b.hardware.map(copyHardwareUse),
  };
}

/** The shared part of a patch: what propagates to the other members. */
export function sharedPatch(patch: Partial<Board>): Partial<Pick<Board, SharedField>> {
  const out: Partial<Pick<Board, SharedField>> = {};
  for (const k of SHARED_KEYS) if (patch[k] !== undefined) (out as Record<string, unknown>)[k] = patch[k];
  // Copy cuts, as sharedOf does, so no two members ever hold one Cut object.
  if (patch.cuts) out.cuts = patch.cuts.map((c) => ({ ...c }));
  if (patch.angleCuts) out.angleCuts = patch.angleCuts.map(copyAngleCut);
  if (patch.holes) out.holes = patch.holes.map(copyHoleRow);
  if (patch.curves) out.curves = patch.curves.map(copyCurve);
  if (patch.profiles) out.profiles = patch.profiles.map(copyProfile);
  if (patch.bands) out.bands = patch.bands.map(copyBand);
  if (patch.hardware) out.hardware = patch.hardware.map(copyHardwareUse);
  return out;
}

/** Every shared field equal, exactly (stored values, invariant 18). Cuts and angle cuts in
 *  order, by id and every geometry field (CUT_GEOMETRY / ANGLE_CUT_FIELDS). */
export function sameShared(a: Board, b: Board): boolean {
  for (const k of SHARED_KEYS) {
    if (k === 'cuts') {
      if (a.cuts.length !== b.cuts.length) return false;
      for (let i = 0; i < a.cuts.length; i += 1) {
        const ca = a.cuts[i]!;
        const cb = b.cuts[i]!;
        if (ca.id !== cb.id || CUT_GEOMETRY_KEYS.some((f) => ca[f] !== cb[f])) return false;
      }
    } else if (k === 'angleCuts') {
      if (a.angleCuts.length !== b.angleCuts.length) return false;
      for (let i = 0; i < a.angleCuts.length; i += 1) {
        const ca = a.angleCuts[i]!;
        const cb = b.angleCuts[i]!;
        if (ca.id !== cb.id || !sameAngleCut(ca, cb)) return false;
      }
    } else if (k === 'holes') {
      if (a.holes.length !== b.holes.length) return false;
      for (let i = 0; i < a.holes.length; i += 1) {
        const ra = a.holes[i]!;
        const rb = b.holes[i]!;
        if (ra.id !== rb.id || !sameHoleRow(ra, rb)) return false;
      }
    } else if (k === 'curves') {
      if (a.curves.length !== b.curves.length) return false;
      for (let i = 0; i < a.curves.length; i += 1) {
        const ca = a.curves[i]!;
        const cb = b.curves[i]!;
        if (ca.id !== cb.id || !sameCurve(ca, cb)) return false;
      }
    } else if (k === 'profiles') {
      if (a.profiles.length !== b.profiles.length) return false;
      for (let i = 0; i < a.profiles.length; i += 1) {
        const pa = a.profiles[i]!;
        const pb = b.profiles[i]!;
        if (pa.id !== pb.id || !sameProfile(pa, pb)) return false;
      }
    } else if (k === 'bands') {
      if (!sameBands(a.bands, b.bands)) return false;
    } else if (k === 'hardware') {
      if (!sameHardware(a.hardware, b.hardware)) return false;
    } else if (a[k] !== b[k]) {
      return false;
    }
  }
  return true;
}

/** `shape`: the shape Link will reuse (the source's, else a selected member's), or null to mint one. */
export interface LinkPlan { source: Board; members: string[]; changing: string[]; shape: string | null }

/** Link would do something wrong, so it does nothing and says why (the panel shows `refused`). */
export interface LinkRefusal { refused: string }

/** Mirrored-instances spec §4 (amended): one Shape cannot serve both hands. */
export const LINK_ACROSS_MIRROR = "Can't link parts on opposite sides of a mirror.";

/**
 * What Link will do (linking spec §3.1). The ONE decider, used by the store's
 * linkBoards AND the panel's "will match" line, so the two cannot disagree.
 * The source is the FIRST selected part; any selected part that is already
 * linked brings its whole link. Reads WORLD parts, whose `shape` names the
 * shape each uses (components spec §3.2). Null for fewer than two parts, or
 * when the members already use one shape and match (a no-op, invariant 4).
 *
 * `keyOf` maps a world part's id to where it is STORED (treeEdit's storageKey,
 * which this layer cannot import). When given, members that are all placements
 * of ONE stored part are refused too: linking them would mint a one-user shape
 * (fu 231). Without it, ids are taken to be distinct stored parts.
 *
 * `mirroredOf` says whether an occurrence sits under an odd number of mirrors
 * (tree's `mirroredAt`, which this layer cannot import). A Shape's cuts are
 * stored once, so a user under the other parity shows them mirror-imaged
 * (mirrored-instances spec §4, amended). A member whose STORED part also sits on
 * the source's side is fine: its other-side occurrences are a live mirrored copy
 * of it, the feature itself. Only a member whose stored part has NO occurrence
 * on the source's side would show the source's cuts mirror-imaged, so Link is
 * refused with LINK_ACROSS_MIRROR (every member counts, those a linked part
 * brings along included: each becomes a user). A PICKED part on the other side
 * is refused outright (reachable only through the store API: a selection is one
 * level). `changing` counts only the members on the source's side, the ones
 * that must match it as seen.
 */
export function linkPlan(
  boards: readonly Board[],
  ids: readonly string[],
  keyOf?: (path: string) => string | null,
  mirroredOf?: (path: string) => boolean,
): LinkPlan | LinkRefusal | null {
  const chosen = [...new Set(ids)].flatMap((id) => boards.filter((b) => b.id === id));
  if (chosen.length < 2) return null;
  const source = chosen[0]!;
  const shapes = new Set(chosen.flatMap((b) => (b.shape ? [b.shape] : [])));
  const picked = new Set(chosen.map((b) => b.id));
  const members = boards.filter((b) => picked.has(b.id) || (b.shape !== undefined && shapes.has(b.shape)));
  if (keyOf && new Set(members.map((b) => keyOf(b.id) ?? b.id)).size < 2) return null;
  const side = mirroredOf?.(source.id);
  const onSide = (b: Board) => mirroredOf === undefined || mirroredOf(b.id) === side;
  const changing = members.filter((b) => b.id !== source.id && onSide(b) && !sameShared(source, b)).map((b) => b.id);
  const shape = source.shape ?? [...shapes][0] ?? null;
  const oneShape = members.every((b) => b.shape !== undefined && b.shape === members[0]!.shape);
  if (oneShape && changing.length === 0) return null;
  if (mirroredOf) {
    const key = (id: string) => keyOf?.(id) ?? id;
    const stored = new Set(boards.filter(onSide).map((b) => key(b.id)));
    // A PICKED part is judged by its own occurrence, not its stored part's: the
    // user chose that occurrence, and it must keep showing what they chose.
    if (chosen.some((b) => !onSide(b)) || members.some((b) => !stored.has(key(b.id)))) return { refused: LINK_ACROSS_MIRROR };
  }
  return { source, members: members.map((b) => b.id), changing, shape };
}
