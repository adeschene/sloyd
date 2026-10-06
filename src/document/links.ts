import type { Board, Shape } from './types';
import { CUT_GEOMETRY_KEYS } from './cuts';

/**
 * Which Board fields a link shares (linking spec §2). The ONE table: linking,
 * propagation and the load repair all read it, and `satisfies` makes a new
 * Board field fail tsc until it is classified (invariant 40's argument).
 */
export const LINK_FIELDS = {
  id: 'own', name: 'own', position: 'own', rotation: 'own', link: 'own', shape: 'own',
  length: 'shared', width: 'shared', thickness: 'shared', material: 'shared',
  grain: 'shared', posture: 'shared', cuts: 'shared',
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
 * `sameShared` compares every shared field except `cuts` with `!==`, which is
 * only right for primitives. This fails tsc if a non-cuts shared field is ever
 * not a string or number (invariant 40's argument, one table over): such a
 * field needs its own comparison in `sameShared` before it can be classified.
 */
const _sharedPrimitives: Board[Exclude<SharedField, 'cuts'>] extends string | number ? true : never = true;
void _sharedPrimitives;

/** A board's shared fields, cuts copied (same ids, new objects) so no two
 *  members ever hold one Cut object. */
export function sharedOf(b: Board): Pick<Board, SharedField> {
  return {
    length: b.length, width: b.width, thickness: b.thickness,
    material: b.material, grain: b.grain, posture: b.posture,
    cuts: b.cuts.map((c) => ({ ...c })),
  };
}

/** The shared part of a patch: what propagates to the other members. */
export function sharedPatch(patch: Partial<Board>): Partial<Pick<Board, SharedField>> {
  const out: Partial<Pick<Board, SharedField>> = {};
  for (const k of SHARED_KEYS) if (patch[k] !== undefined) (out as Record<string, unknown>)[k] = patch[k];
  // Copy cuts, as sharedOf does, so no two members ever hold one Cut object.
  if (patch.cuts) out.cuts = patch.cuts.map((c) => ({ ...c }));
  return out;
}

/** Every shared field equal, exactly (stored values, invariant 18). Cuts in
 *  order, by id and every CUT_GEOMETRY field. */
export function sameShared(a: Board, b: Board): boolean {
  for (const k of SHARED_KEYS) {
    if (k === 'cuts') {
      if (a.cuts.length !== b.cuts.length) return false;
      for (let i = 0; i < a.cuts.length; i += 1) {
        const ca = a.cuts[i]!;
        const cb = b.cuts[i]!;
        if (ca.id !== cb.id || CUT_GEOMETRY_KEYS.some((f) => ca[f] !== cb[f])) return false;
      }
    } else if (a[k] !== b[k]) {
      return false;
    }
  }
  return true;
}

export function withoutLink(b: Board): Board {
  const { link: _link, ...rest } = b;
  return rest;
}

/** A label held by one part is not a link: drop it. Same array when unchanged. */
export function dissolveSingletons(boards: Board[]): Board[] {
  const count = new Map<string, number>();
  for (const b of boards) if (b.link) count.set(b.link, (count.get(b.link) ?? 0) + 1);
  if (![...count.values()].some((n) => n < 2)) return boards;
  return boards.map((b) => (b.link && count.get(b.link)! < 2 ? withoutLink(b) : b));
}

/**
 * Make every link consistent WITHOUT moving any geometry (linking spec §3.5):
 * a member whose shared fields differ from its label's FIRST member, in
 * document order, is unlinked; then singletons are dropped. Never merges two
 * labels. Same array when unchanged.
 */
export function repairLinks(boards: Board[]): Board[] {
  const first = new Map<string, Board>();
  let changed = false;
  const out = boards.map((b) => {
    if (!b.link) return b;
    const ref = first.get(b.link);
    if (!ref) { first.set(b.link, b); return b; }
    if (sameShared(ref, b)) return b;
    changed = true;
    return withoutLink(b);
  });
  return dissolveSingletons(changed ? out : boards);
}

export interface LinkPlan { source: Board; members: string[]; changing: string[]; label: string | null }

/**
 * What Link will do (linking spec §3.1). The ONE decider, used by the store's
 * linkBoards AND the panel's "will match" line, so the two cannot disagree.
 * The source is the FIRST selected part; any selected part that is already
 * linked brings its whole link. Null for fewer than two parts, or when the
 * members already share one label and match (a no-op, invariant 4).
 */
export function linkPlan(boards: readonly Board[], ids: readonly string[]): LinkPlan | null {
  const chosen = [...new Set(ids)].flatMap((id) => boards.filter((b) => b.id === id));
  if (chosen.length < 2) return null;
  const source = chosen[0]!;
  const labels = new Set(chosen.flatMap((b) => (b.link ? [b.link] : [])));
  const picked = new Set(chosen.map((b) => b.id));
  const members = boards.filter((b) => picked.has(b.id) || (b.link !== undefined && labels.has(b.link)));
  const changing = members.filter((b) => b.id !== source.id && !sameShared(source, b)).map((b) => b.id);
  const label = source.link ?? [...labels][0] ?? null;
  const oneLabel = members.every((b) => b.link !== undefined && b.link === members[0]!.link);
  if (oneLabel && changing.length === 0) return null;
  return { source, members: members.map((b) => b.id), changing, label };
}
