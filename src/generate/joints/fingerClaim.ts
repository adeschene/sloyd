import { fingerSets } from '../../document/boxJoints';
import { flatDocument } from '../../document/document';
import type { Board, Cut, FlatDocument, SloydDocument } from '../../document/document';
import { sameCutSet } from './unjoin';

/**
 * Box joints and the joint read-back (box-joints spec §7). A finger set is no joint `readJoints` explains, so Refine's
 * gate and Repair both CLAIM every recognised set before reading joints back, and put the claimed cuts (the same
 * objects) back afterwards; the reader judges only the cuts that are left. Pure.
 */

/** Every recognised finger set's cuts taken off its part, per flat index. A part with no set keeps its object; one with
 *  a set gets a copy with a new `cuts` array (flat twins of a definition share one). With no set anywhere, the input
 *  flat comes back as it is. */
export function claimFingerSets(flat: FlatDocument): { flat: FlatDocument; claimed: Map<number, Cut[]> } {
  const claimed = new Map<number, Cut[]>();
  const boards = flat.boards.map((b, i) => {
    const ids = new Set(fingerSets(b).flatMap((f) => f.cutIds));
    if (ids.size === 0) return b;
    claimed.set(i, b.cuts.filter((c) => ids.has(c.id)));
    return { ...b, cuts: b.cuts.filter((c) => !ids.has(c.id)) };
  });
  return { flat: claimed.size === 0 ? flat : { ...flat, boards }, claimed };
}

/** Claim, then decide (box-joints spec §7): the ONE step both Refine's gate (`plainForRefine`) and Repair
 *  (`repairDocument`) take first. `joined` is decided on the CLAIMED flat, so a project cut only by box joints is not
 *  joined and reaches none of the leaning, tenon or compound refusals. */
export function claimThenDecide(flat: FlatDocument): { unclaimed: FlatDocument; claimed: Map<number, Cut[]>; joined: boolean } {
  const { flat: unclaimed, claimed } = claimFingerSets(flat);
  return { unclaimed, claimed, joined: unclaimed.boards.some((b) => b.cuts.length > 0) };
}

/** `boards` (index-aligned with the claimed flat) with each part's claimed cuts appended again. */
export const restoreFingerSets = (boards: readonly Board[], claimed: ReadonlyMap<number, Cut[]>): Board[] =>
  boards.map((b, i) => (claimed.has(i) ? { ...b, cuts: [...b.cuts, ...claimed.get(i)!] } : b));

const setsKey = (b: Board) => JSON.stringify(fingerSets(b));

/** The name of the first claimed part whose recognised finger sets are not what they were (`before`, index-aligned),
 *  or null: the read-back resized a part along its fingers, and putting the claimed cuts back cannot keep them. */
export function firstBrokenSet(before: readonly Board[], after: readonly Board[], claimed: ReadonlyMap<number, Cut[]>): string | null {
  for (const i of claimed.keys()) if (setsKey(before[i]!) !== setsKey(after[i]!)) return before[i]!.name;
  return null;
}

/**
 * The first of `names` (flat names of kept box-jointed parts) that `joined` no longer has exactly as `original` had it:
 * its recognised finger sets, its size, its world position or its cuts (as a set, ids ignored) differ, or it is gone.
 * Null when every one is kept. A joined Refine checks its re-join with this (box-joints spec §7, inv 41: a conflicting
 * result comes back UNJOINED).
 */
export function changedBoxJointed(original: SloydDocument, joined: SloydDocument, names: readonly string[]): string | null {
  const a = new Map(flatDocument(original).boards.map((b) => [b.name, b]));
  const b = new Map(flatDocument(joined).boards.map((x) => [x.name, x]));
  for (const n of names) {
    const p = a.get(n);
    const q = b.get(n);
    if (!p) continue;
    if (!q || setsKey(p) !== setsKey(q) || p.length !== q.length || p.width !== q.width || p.thickness !== q.thickness ||
      p.position.some((v, k) => v !== q.position[k]) || !sameCutSet(p.cuts, q.cuts)) return n;
  }
  return null;
}
