import type { Board, CurveSegment, Dimension, Dovetail } from './types';
import type { CurveSpan, ViewCurve } from './curves';
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

// ---- Geometry: a dovetail's waste as view curves (dovetails spec §3.5; Spec difference 1: round tenons' route) -----

/**
 * A BUILT dovetail's waste as SQUARE-span view curves (`CurveSpan.square`, `squareSpan`), so `boardBodies` stays the ONE place
 * it becomes geometry and bodies stay convex (inv 48): `geometryBoard` appends them after the round tenons' for each
 * fault-free dovetail. VIEW-ONLY: never stored, never validated. Every boundary is `dovetailLayout(...).bounds` (the ruling:
 * never recomputed here); the slope moves each one by `x / s` at distance `x` from the outside plane.
 *
 * - TAILS: one curve per PIN socket (each half pin and pin), through the THICKNESS over its whole extent (a span with no
 *   stop), its outline in `uvDims('thickness')` = (length, width): at the end face the socket's outside-plane bounds, at
 *   `depth` back each side `depth / s` further out (the socket widens, the tails narrow); a half pin's outer side stays on
 *   the J face. Traced along the end face (and the J face for a half pin) where it lies on them.
 * - PINS: one curve per TAIL socket, through `dim` from the baseline to the end with ONE square stop at the baseline (a plain
 *   wall, as a tenon's shoulder), its outline in `uvDims(dim)` = (J, thickness): at the `outside` face the tail's
 *   outside-plane bounds, at the other face each side `thickness / s` further in (the socket narrows, the pins widen).
 *
 * Both describe the same prism: x runs from the outside plane (the tail part's end face = the pin part's outside face)
 * into the corner in both. Ids `dovetail/<dovetail id>/<k>` (the loader re-mints a stored id holding `/`, inv 33);
 * `uFrom`/`vFrom` 'min'.
 */
export function dovetailViewCurves(b: Pick<Board, Dimension>, d: Dovetail): ViewCurve[] {
  const J = jointLineOf(d.dim);
  const { bounds } = dovetailLayout(b[J], d.count, d.slope, d.pin);
  const N = d.count;
  const line = (to: [number, number]): CurveSegment => ({ type: 'line', to });
  const base = { uFrom: 'min' as const, vFrom: 'min' as const };
  const out: ViewCurve[] = [];
  if (d.role === 'tails') {
    // (dim, J) → (u, v) of `uvDims('thickness')` = (length, width).
    const at = (r: number, j: number): [number, number] => (d.dim === 'length' ? [r, j] : [j, r]);
    const e = d.end === 'max' ? b[d.dim] : 0;
    const r = d.end === 'max' ? e - d.depth : d.depth;
    const w = d.depth / d.slope;
    const span: CurveSpan = { lo: 0, hi: b.thickness, stopLo: false, stopHi: false, square: true };
    for (let k = 0; k <= N; k += 1) {
      const a = bounds[2 * k]!, c = bounds[2 * k + 1]!;
      const a1 = k === 0 ? a : a - w, c1 = k === N ? c : c + w;
      const pts: [number, number][] = [at(e, a), at(e, c), at(r, c1), at(r, a1)];
      out.push({ ...base, id: `dovetail/${d.id}/${k}`, through: 'thickness', span, start: pts[0]!, segments: [...pts.slice(1), pts[0]!].map(line) });
    }
    return out;
  }
  // (J, thickness) = `uvDims(dim)` for either run dimension.
  const T = b.thickness;
  const [vo, vi] = d.outside === 'max' ? [T, 0] : [0, T];
  const w = T / d.slope;
  const span: CurveSpan = d.end === 'max'
    ? { lo: b[d.dim] - d.depth, hi: b[d.dim], stopLo: true, stopHi: false, square: true }
    : { lo: 0, hi: d.depth, stopLo: false, stopHi: true, square: true };
  for (let k = 0; k < N; k += 1) {
    const a = bounds[2 * k + 1]!, c = bounds[2 * k + 2]!;
    const pts: [number, number][] = [[a, vo], [c, vo], [c - w, vi], [a + w, vi]];
    out.push({ ...base, id: `dovetail/${d.id}/${k}`, through: d.dim, span, start: pts[0]!, segments: [...pts.slice(1), pts[0]!].map(line) });
  }
  return out;
}

/**
 * A BUILT dovetail's corners at the OUTSIDE plane (dovetails spec §3.5, my call there: "tail and pin corners at the outside
 * plane are snap points, nothing in air"), board-local, from the ONE layout's bounds — every tail–pin boundary `bounds[1..2N]`:
 * - tails: on the END face (the outside plane), at both thickness faces — each tail's four end corners;
 * - pins: on the `outside` thickness face (the outside plane), at the end and at the baseline — each pin's narrow corners.
 * Each lies on wood (the edge of a tail's or a pin's outside-plane face), never in a socket.
 */
export function dovetailCorners(b: Pick<Board, Dimension>, d: Dovetail): Record<Dimension, number>[] {
  const J = jointLineOf(d.dim);
  const { bounds } = dovetailLayout(b[J], d.count, d.slope, d.pin);
  const edges = bounds.slice(1, -1);
  const e = d.end === 'max' ? b[d.dim] : 0;
  const r = d.end === 'max' ? e - d.depth : d.depth;
  const pt = (run: number, j: number, t: number) => ({ [d.dim]: run, [J]: j, thickness: t }) as Record<Dimension, number>;
  if (d.role === 'tails') return edges.flatMap((j) => [pt(e, j, 0), pt(e, j, b.thickness)]);
  const vo = d.outside === 'max' ? b.thickness : 0;
  return edges.flatMap((j) => [pt(e, j, vo), pt(r, j, vo)]);
}
