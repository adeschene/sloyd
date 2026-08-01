/**
 * How much stock a part consumes, printed.
 *
 * A sibling of `length.ts` rather than an addition to it: `units` owns how
 * measured quantities print for this app, and a volume is not a length.
 * Widening `length.ts` to print cubic inches would make its filename a lie.
 *
 * Both units are 144 of something per foot — 144 cubic inches to the board
 * foot, 144 square inches to the square foot — which is a coincidence of
 * arithmetic, not one idea. They are named separately so that a future unit
 * that is not 144 does not have to fight a shared constant.
 */

/** 144 cubic inches of solid lumber. The unit lumber is sold in. */
export const INCHES_PER_BOARD_FOOT = 144;

/** 144 square inches of sheet. The unit sheet goods are measured in. */
export const INCHES_PER_SQUARE_FOOT = 144;

/**
 * Two decimal places, always — including trailing zeros, so a column of these
 * aligns on the point under `font-variant-numeric: tabular-nums`.
 *
 * Fixed rather than taking the document's `units.precision`: that value is a
 * fractional-inch DENOMINATOR (16 meaning sixteenths). Applied to a decimal it
 * is a category error that happens to typecheck.
 *
 * `toFixed` rounds rather than truncating, which is what we want — but it
 * never rounds UP to the next whole unit either. A yard that sells in whole
 * board feet is applying a purchasing policy; reporting the true number and
 * letting the user round is honest, and the reverse is not recoverable.
 *
 * Its rounding is binary, not decimal: 144.72 cubic inches is 1.00499...9 as a
 * double, so it prints 1.00 where decimal-exact rounding would give 1.01. At a
 * hundredth of a board foot that is about a tenth of a cubic inch of lumber —
 * nothing at the yard — and it is pinned by a test so it reads as known rather
 * than as a bug waiting to be found.
 */
const DECIMALS = 2;

/** e.g. `1.38 bd ft`. Takes CUBIC inches — length x width x thickness. */
export function formatBoardFeet(cubicInches: number): string {
  return `${(cubicInches / INCHES_PER_BOARD_FOOT).toFixed(DECIMALS)} bd ft`;
}

/** e.g. `15.00 sq ft`. Takes SQUARE inches — length x width, no thickness. */
export function formatSquareFeet(squareInches: number): string {
  return `${(squareInches / INCHES_PER_SQUARE_FOOT).toFixed(DECIMALS)} sq ft`;
}
