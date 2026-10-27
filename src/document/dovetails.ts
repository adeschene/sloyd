import type { Board, Dimension, Dovetail } from './types';
import type { Units } from '../units/length';
import { byDovetailEnd, dovetailsOf, sameDovetail } from './dovetailModel';

/**
 * Through dovetails (dovetails spec §3.2, §3.5): the ONE home of the layout and of the faults (`dovetailFaults`, the ONE
 * decider). Numbers only: a TYPE-only `Units` import (the pin width and the Auto pitch depend on the project's units, but
 * no text is produced here; the copy is `dovetailText.ts`).
 */

/** The pin width at the narrow end (spec §3.2, the user: fixed, never typed): 1/4" imperial, 6 mm metric. */
export function pinWidth(units: Units): number {
  return units.display === 'metric-mm' ? 6 / 25.4 : 0.25;
}

/** The Auto pitch (spec §3.2): one tail per 1.5" (38 mm metric) of the joint's height. */
const autoPitch = (units: Units): number => (units.display === 'metric-mm' ? 38 / 25.4 : 1.5);

/** Auto's first count for a joint `H` high (spec §3.2), BEFORE the fault lowering (the planner lowers it while `narrow`
 *  holds on either part): `max(1, round(H / A))`. */
export function autoTailCount(H: number, units: Units): number {
  return Math.max(1, Math.round(H / autoPitch(units)));
}

/** The layout at the outside plane (spec §3.2): `Te` the tail width there; `bounds` the `2N + 2` boundaries along J from
 *  J's min — `0`, each tail's two edges in order, then `H`. */
export interface DovetailLayout { H: number; N: number; s: number; p: number; Te: number; bounds: number[] }

/**
 * The ONE layout (spec §3.2, the user's rule): a half pin `p`, `N` tails of `Te = (H − (N + 1)·p) / N` separated by `N − 1`
 * pins of `p`, a half pin `p`. Every boundary is computed DIRECTLY from J's min, never as a running sum: tail `k` (0-based)
 * spans `[p + k·(Te + p), p + k·(Te + p) + Te]`, except that the last tail's far edge IS the last half pin's near edge,
 * `H − p` (one boundary, computed one way), and the last bound is `H` itself.
 */
export function dovetailLayout(H: number, N: number, s: number, p: number): DovetailLayout {
  const Te = (H - (N + 1) * p) / N;
  const bounds: number[] = [0];
  for (let k = 0; k < N; k += 1) {
    const start = p + k * (Te + p);
    bounds.push(start, k === N - 1 ? H - p : start + Te);
  }
  bounds.push(H);
  return { H, N, s, p, Te, bounds };
}

/** A part's joint-line dimension J for a dovetail along `dim`: the non-thickness dimension other than `dim`. */
export const jointLineOf = (dim: Dovetail['dim']): 'length' | 'width' => (dim === 'length' ? 'width' : 'length');

/** What makes a stored dovetail build nothing (spec §3.2, §3.5), in this order. */
export type DovetailFault = 'count' | 'slope' | 'depth' | 'narrow';

/** Float noise: a tail exactly as wide as a pin passes (spec §3.2, judged at 1e-9). */
const EPS = 1e-9;

/**
 * The ONE fault decider (spec §3.2), on the part's OWN sizes: `H = b[J]`; the angled extent `X` is `d.depth` for tails
 * (the baseline) and `b.thickness` for pins (across the part's own thickness). Faults, in order: `count` (not an integer
 * >= 1), `slope` (outside [4, 12]), `depth` (reaching the part's own size along `dim`), `narrow` (a tail at its narrowest,
 * `Te − 2·X/s`, narrower than a pin at its widest, `p + 2·X/s`, by more than 1e-9).
 */
export function dovetailFaults(b: Board, d: Dovetail): DovetailFault[] {
  const out: DovetailFault[] = [];
  if (!(Number.isInteger(d.count) && d.count >= 1)) out.push('count');
  if (!(d.slope >= 4 && d.slope <= 12)) out.push('slope');
  if (d.depth >= b[d.dim]) out.push('depth');
  const X = d.role === 'tails' ? d.depth : b.thickness;
  const { Te } = dovetailLayout(b[jointLineOf(d.dim)], d.count, d.slope, d.pin);
  if (Te - (2 * X) / d.slope < d.pin + (2 * X) / d.slope - EPS) out.push('narrow');
  return out;
}

const NONE: readonly Dovetail[] = [];
const BUILT = new WeakMap<object, readonly Dovetail[]>();

/** The dovetails that BUILD (spec §3.5): fault-free, judged on the stored part. A faulted dovetail builds nothing (the
 *  part reads as plain stock at that end), as a faulted tenon (inv 58). Memoised per board OBJECT (a part is never
 *  mutated: an edit makes a new object); the list is frozen, so no caller can change what the next one reads. */
export function builtDovetails(b: Board): readonly Dovetail[] {
  if (!b.dovetails || b.dovetails.length === 0) return NONE;
  const hit = BUILT.get(b);
  if (hit) return hit;
  const out = Object.freeze(dovetailsOf(b).filter((d) => dovetailFaults(b, d).length === 0));
  BUILT.set(b, out);
  return out;
}

/** One dovetail reflected along `m` (inv 44: a FLAG FLIP, never arithmetic), or the SAME object when nothing moves:
 *  along its own `dim` its `end` swaps; along the thickness a pins entry's `outside` swaps; along J nothing (the layout is
 *  a palindrome). */
function mirrorOne(d: Dovetail, m: Dimension): Dovetail {
  if (m === d.dim) return { ...d, end: d.end === 'min' ? 'max' : 'min' };
  if (m === 'thickness' && d.outside) return { ...d, outside: d.outside === 'min' ? 'max' : 'min' };
  return d;
}

/** Dovetails reflected along dimension `m` (spec §3.4, inv 44), decided per entry, then re-sorted into canonical order.
 *  When no entry moves, the SAME array comes back. Its own inverse. */
export function mirrorDovetails(list: readonly Dovetail[], m: Dimension): Dovetail[] {
  const out = list.map((d) => mirrorOne(d, m));
  if (out.every((d, i) => d === list[i])) return list as Dovetail[];
  return out.sort(byDovetailEnd);
}

/**
 * A part's dovetails lowered back through ONE mirror along `m` (treeEdit's lowerTenons, inv 44, 46): `mirrorDovetails`,
 * its own inverse; a dovetail equal to the stored one with the same id maps back to THAT object, and when all are reused,
 * the stored array (an untouched list is never rewritten). A draft with no dovetails (none, or a removal) adds no key: its
 * own key, present or absent, is the after-state's.
 */
export function lowerDovetails(stored: Dovetail[] | undefined, draft: Pick<Board, 'dovetails'>, m: Dimension): { dovetails?: Dovetail[] } {
  if (!draft.dovetails || draft.dovetails.length === 0) return {};
  const byId = new Map((stored ?? []).map((d) => [d.id, d]));
  const out = mirrorDovetails(draft.dovetails, m).map((d) => {
    const s = byId.get(d.id);
    return s && sameDovetail(s, d) ? s : d;
  });
  return { dovetails: stored && out.length === stored.length && out.every((d, i) => d === stored[i]) ? stored : out };
}
