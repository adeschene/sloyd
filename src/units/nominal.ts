import { formatLength, imperialAt } from './length';
// Imperial until metric chunk 2 (drawings/buying, spec §4).

/** US softwood dimensional lumber: nominal inches → actual (custom materials spec §5.1). */
export const NOMINAL_ACTUAL: Readonly<Record<number, number>> = { 1: 0.75, 2: 1.5, 3: 2.5, 4: 3.5, 6: 5.5, 8: 7.25, 10: 9.25, 12: 11.25 };

export interface NominalSection { name: string; thickness: number; width: number }

const NAMED: readonly (readonly [number, number])[] = [
  [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [1, 10], [1, 12],
  [2, 2], [2, 3], [2, 4], [2, 6], [2, 8], [2, 10], [2, 12], [4, 4], [4, 6], [6, 6],
];

/** The named sections, thinner side as thickness. */
export const NOMINAL_SECTIONS: readonly NominalSection[] = NAMED.map(([t, w]) => ({
  name: `${t}×${w}`, thickness: NOMINAL_ACTUAL[t]!, width: NOMINAL_ACTUAL[w]!,
}));

/** Far below 1/64", far above float drift: the cut list's flush tolerance. Never a rounding (invariant 18). */
const EPS = 1e-9;

/** The section's name when thickness × width (either order) IS one, else null (spec §5.2). */
export function nominalName(thickness: number, width: number): string | null {
  const [a, b] = thickness <= width ? [thickness, width] : [width, thickness];
  return NOMINAL_SECTIONS.find((s) => Math.abs(s.thickness - a) <= EPS && Math.abs(s.width - b) <= EPS)?.name ?? null;
}

/** A stock board's length as a yard writes it: whole feet as `8′`, anything else exactly as `formatLength`. */
export function stockLengthText(length: number, precision: number): string {
  const feet = length / 12;
  return Number.isInteger(feet) ? `${feet}′` : formatLength(length, imperialAt(precision));
}
