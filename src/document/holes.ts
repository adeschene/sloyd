import type { Dimension, HoleRow } from './types';
import { DIMENSION_ORDER } from './geometry';

/**
 * Every field of `HoleRow` that decides "same hole row": all but `id` (holes spec §4.2). A TABLE CHECKED AGAINST THE
 * TYPE (invariant 40's pattern): a new `HoleRow` field fails `tsc` here until it is listed.
 */
export const HOLE_FIELDS = {
  face: true, from: true, diameter: true, depth: true, along: true, alongFrom: true,
  station: true, count: true, pitch: true, acrossFrom: true, inset: true,
} as const satisfies Record<Exclude<keyof HoleRow, 'id'>, true>;

export const HOLE_KEYS = Object.keys(HOLE_FIELDS) as (keyof typeof HOLE_FIELDS)[];

/** Holes per row, at most. A hand-edited count above it is dropped on load (expanding it would freeze the view). */
export const HOLE_COUNT_MAX = 500;

/** One row's comparable values, in HOLE_KEYS order. */
export function holeRowValues(r: Omit<HoleRow, 'id'>): (string | number)[] {
  return HOLE_KEYS.map((k) => r[k]);
}

/** Exact equality on every HOLE_FIELDS field (stored values, invariant 18). */
export function sameHoleRow(a: Omit<HoleRow, 'id'>, b: Omit<HoleRow, 'id'>): boolean {
  const x = holeRowValues(a);
  const y = holeRowValues(b);
  return x.every((v, i) => v === y[i]);
}

/** A copy that is not the same object, so no two parts ever hold one row. */
export function copyHoleRow(r: HoleRow): HoleRow {
  return { ...r };
}

/** The third dimension: neither the drill axis nor the row's direction. */
export function acrossOf(r: Pick<HoleRow, 'face' | 'along'>): Dimension {
  return DIMENSION_ORDER.find((d) => d !== r.face && d !== r.along)!;
}
