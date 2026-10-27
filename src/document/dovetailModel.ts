import type { Board, Dovetail } from './types';

/**
 * The stored dovetail's model (dovetails spec §3.4, schema 26): reading, ordering, copying and comparing `Board.dovetails`.
 * A LEAF module (it imports types only): `dovetails.ts` and `boxJoints.ts` both read it, so neither planner module imports
 * the other.
 */

/**
 * Every field of `Dovetail` that decides "same dovetail": all but `id` (spec §3.4). A TABLE CHECKED AGAINST THE TYPE
 * (invariant 40's pattern): a new `Dovetail` field fails `tsc` here until it is listed.
 */
export const DOVETAIL_FIELDS = {
  dim: true, end: true, role: true, count: true, slope: true, pin: true, depth: true, outside: true,
} as const satisfies Record<Exclude<keyof Dovetail, 'id'>, true>;

const DOVETAIL_KEYS = Object.keys(DOVETAIL_FIELDS) as (keyof typeof DOVETAIL_FIELDS)[];

/** One dovetail's comparable values as a string, exact: `String()` round-trips a double, `-0` is told apart from 0, and
 *  an absent `outside` (tails) reads `undefined`, never equal to a present one. */
export function dovetailValues(d: Omit<Dovetail, 'id'>): string {
  return DOVETAIL_KEYS.map((k) => {
    const v = d[k];
    return typeof v === 'number' && Object.is(v, -0) ? '-0' : String(v);
  }).join('|');
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
