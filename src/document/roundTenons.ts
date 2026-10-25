import type { Board, Dimension, RoundTenon } from './types';

/**
 * Every field of `RoundTenon` that decides "same tenon": all but `id` (round tenons spec §3.1). A TABLE CHECKED AGAINST THE
 * TYPE (invariant 40's pattern): a new `RoundTenon` field fails `tsc` here until it is listed.
 */
export const TENON_FIELDS = {
  end: true, diameter: true, length: true,
} as const satisfies Record<Exclude<keyof RoundTenon, 'id'>, true>;

const TENON_KEYS = Object.keys(TENON_FIELDS) as (keyof typeof TENON_FIELDS)[];

/** One tenon's comparable values as a string, exact: `String()` round-trips a double, and `-0` is told apart from 0. */
export function tenonValues(t: Omit<RoundTenon, 'id'>): string {
  return TENON_KEYS.map((k) => {
    const v = t[k];
    return typeof v === 'number' && Object.is(v, -0) ? '-0' : String(v);
  }).join('|');
}

/** Exact equality on every TENON_FIELDS field (stored values, invariant 18). */
export function sameTenon(a: Omit<RoundTenon, 'id'>, b: Omit<RoundTenon, 'id'>): boolean {
  return tenonValues(a) === tenonValues(b);
}

/** A copy that is not the same object, so no two parts ever hold one tenon. */
export function copyTenon(t: RoundTenon): RoundTenon {
  return { ...t };
}

const NONE: readonly RoundTenon[] = [];

/** Canonical order: `min` first. */
const byEnd = (p: RoundTenon, q: RoundTenon) => (p.end === q.end ? 0 : p.end === 'min' ? -1 : 1);

/** The part's tenons, canonical order; an absent key reads as none. */
export function tenonsOf(b: Pick<Board, 'tenons'>): readonly RoundTenon[] {
  return b.tenons ?? NONE;
}

export function hasTenons(b: Pick<Board, 'tenons'>): boolean {
  return (b.tenons?.length ?? 0) > 0;
}

/** The tenon on an end of the part's length, if any. */
export function tenonAt(b: Pick<Board, 'tenons'>, end: RoundTenon['end']): RoundTenon | undefined {
  return b.tenons?.find((t) => t.end === end);
}

/** The part with these tenons, `min` first. An empty list REMOVES the key (a tenon-free part has none: never `[]`, never
 *  `undefined`). */
export function withTenons<B extends Pick<Board, 'tenons'>>(b: B, ts: readonly RoundTenon[]): B {
  const { tenons: _drop, ...rest } = b;
  if (ts.length === 0) return rest as B;
  return { ...rest, tenons: [...ts].sort(byEnd) } as B;
}

/** Tenons reflected along dimension `d` (round tenons spec §3.1, inv 44): a FLAG FLIP, never arithmetic. Along the length
 *  each `end` swaps and the list is re-sorted, `min` first; across the width or thickness nothing moves, so the SAME array
 *  comes back. Its own inverse. */
export function mirrorTenons(ts: RoundTenon[], d: Dimension): RoundTenon[] {
  if (d !== 'length') return ts;
  return ts.map((t): RoundTenon => ({ ...t, end: t.end === 'min' ? 'max' : 'min' })).sort(byEnd);
}

/**
 * A part's tenons lowered back through ONE mirror along `d` (round tenons spec §3.1; treeEdit's lowerHoles, inv 44, 46):
 * `mirrorTenons`, its own inverse; a tenon equal to the stored one with the same id maps back to THAT object, and when all
 * are reused, the stored array (an untouched list is never rewritten). A draft with no tenons (none, or a removal) adds no
 * key: its own key, present or absent, is the after-state's, as `lowerLean`'s.
 */
export function lowerTenons(stored: RoundTenon[] | undefined, draft: Pick<Board, 'tenons'>, d: Dimension): { tenons?: RoundTenon[] } {
  if (!draft.tenons || draft.tenons.length === 0) return {};
  const byId = new Map((stored ?? []).map((t) => [t.id, t]));
  const out = mirrorTenons(draft.tenons, d).map((t) => {
    const s = byId.get(t.id);
    return s && sameTenon(s, t) ? s : t;
  });
  return { tenons: stored && out.length === stored.length && out.every((t, i) => t === stored[i]) ? stored : out };
}
