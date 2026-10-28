import type { Board, Dovetail } from './types';

/**
 * The stored dovetail's model (dovetails spec §3.4, schema 26): reading, ordering, copying and comparing `Board.dovetails`,
 * and the ONE layout (`dovetailLayout`, `jointLineOf`; re-exported from `dovetails.ts`). A LEAF module (it imports types
 * only): `dovetails.ts`, `boxJoints.ts` and the copy home `dovetailText.ts` all read it, so none of them imports another
 * through it (the copy home importing `dovetails.ts` would be a cycle: its copy table is built from the copy at load).
 */

/**
 * Every field of `Dovetail` that decides "same dovetail": all but `id` (spec §3.4). A TABLE CHECKED AGAINST THE TYPE
 * (invariant 40's pattern): a new `Dovetail` field fails `tsc` here until it is listed.
 */
export const DOVETAIL_FIELDS = {
  dim: true, end: true, role: true, count: true, slope: true, pin: true, depth: true, outside: true, lap: true,
} as const satisfies Record<Exclude<keyof Dovetail, 'id'>, true>;

/** Every field but `lap`, which `dovetailValues` writes only when present (half-blind spec §3.3, the builder check). */
const DOVETAIL_KEYS = (Object.keys(DOVETAIL_FIELDS) as (keyof typeof DOVETAIL_FIELDS)[]).filter((k) => k !== 'lap');

const valueText = (v: unknown): string => (typeof v === 'number' && Object.is(v, -0) ? '-0' : String(v));

/** One dovetail's comparable values as a string, exact: `String()` round-trips a double, `-0` is told apart from 0, and
 *  an absent `outside` (tails) reads `undefined`, never equal to a present one. An absent `lap` (a through dovetail) writes
 *  NOTHING, so a through entry's string (and every cut-list row key built from it) is byte for byte what it was before
 *  half-blind; a present one appends `|lap=<value>`. */
export function dovetailValues(d: Omit<Dovetail, 'id'>): string {
  const base = DOVETAIL_KEYS.map((k) => valueText(d[k])).join('|');
  return d.lap === undefined ? base : `${base}|lap=${valueText(d.lap)}`;
}

/** Exact equality on every DOVETAIL_FIELDS field (stored values, invariant 18). */
export function sameDovetail(a: Omit<Dovetail, 'id'>, b: Omit<Dovetail, 'id'>): boolean {
  return dovetailValues(a) === dovetailValues(b);
}

/** A copy that is not the same object, so no two parts ever hold one dovetail. */
export function copyDovetail(d: Dovetail): Dovetail {
  return { ...d };
}

const NONE: readonly Dovetail[] = [];

/** Canonical order (spec §3.4): length min, length max, width min, width max. */
const rank = (d: Pick<Dovetail, 'dim' | 'end'>) => (d.dim === 'length' ? 0 : 2) + (d.end === 'min' ? 0 : 1);
export const byDovetailEnd = (p: Dovetail, q: Dovetail): number => rank(p) - rank(q);

/** The part's dovetails, canonical order; an absent key reads as none. */
export function dovetailsOf(b: Pick<Board, 'dovetails'>): readonly Dovetail[] {
  return b.dovetails ?? NONE;
}

export function hasDovetails(b: Pick<Board, 'dovetails'>): boolean {
  return (b.dovetails?.length ?? 0) > 0;
}

/** The dovetail on an end of `dim`, if any. */
export function dovetailAt(b: Pick<Board, 'dovetails'>, dim: Dovetail['dim'], end: Dovetail['end']): Dovetail | undefined {
  return b.dovetails?.find((d) => d.dim === dim && d.end === end);
}

/** The part with these dovetails, in canonical order. An empty list REMOVES the key (a dovetail-free part has none: never
 *  `[]`, never `undefined`). */
export function withDovetails<T extends Pick<Board, 'dovetails'>>(b: T, list: readonly Dovetail[]): T {
  const { dovetails: _drop, ...rest } = b;
  if (list.length === 0) return rest as T;
  return { ...rest, dovetails: [...list].sort(byDovetailEnd) } as T;
}

/** The most tails a stored dovetail may have (final review, 2026-10-27; as `HOLE_COUNT_MAX`): load DROPS an entry with
 *  more, the planner refuses a typed count over it and starts Auto at most at it, and the Tails field reads more as a parse
 *  error. Bounds every per-tail loop (the layout's `bounds`, the view curves, the bench chain). */
export const DOVETAIL_COUNT_MAX = 100;

/** The tail width at the outside plane (spec §3.2), `Te = (H − (N + 1)·p) / N`: its ONE home, O(1) for any count (the
 *  fault decider and the cut-list line read it without building a layout); `dovetailLayout` reads it too. */
export function dovetailTailWidth(H: number, N: number, p: number): number {
  return (H - (N + 1) * p) / N;
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
  const Te = dovetailTailWidth(H, N, p);
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
