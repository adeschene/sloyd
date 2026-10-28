import { isMetric, type Units } from './length';

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

/**
 * A price, printed: US dollars, two decimals, thousands separators — `$1,234.50`.
 * The one home of money formatting (lumber yield and cost spec §3.4); the cut
 * list's Buying section never formats a price itself. Sums are kept exact by the
 * caller and rounded only here, for display.
 */
export function formatMoney(dollars: number): string {
  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Pounds to the kilogram: the exact international pound (weight spec §6). */
const KG_PER_LB = 0.45359237;
/** kg/m³ in one lb/ft³. Stored density is lb/ft³, as stored lengths are inches (weight spec §3.1). */
export const KG_M3_PER_LB_FT3 = 16.018463;
const DENSITY_RE = /^(?:\d+\.?\d*|\.\d+)$/;

/** One decimal while the value, so rounded, is under 10; whole from 10 up — a ±15% material does not deserve `47.3`. */
const estimate = (v: number) => (Number(v.toFixed(1)) < 10 ? v.toFixed(1) : String(Math.round(v)));

/**
 * A weight, printed: `6.2 lb` / `47 lb`, or kg in a metric project. Takes POUNDS. One that would print `0.0` reads `under 0.1 lb`
 * instead (the user's ruling 2026-10-28): a weighed part never reads as weightless. The word `about` is `approxWeight`'s.
 */
export function formatWeight(pounds: number, units: Units): string {
  const unit = isMetric(units) ? 'kg' : 'lb';
  const text = estimate(isMetric(units) ? pounds * KG_PER_LB : pounds);
  return text === '0.0' ? `under 0.1 ${unit}` : `${text} ${unit}`;
}

/** A weight in a sentence: `about 6.2 lb`, or `under 0.1 lb` alone (never `about under 0.1 lb`). */
export function approxWeight(pounds: number, units: Units): string {
  const text = formatWeight(pounds, units);
  return text.startsWith('under ') ? text : `about ${text}`;
}

export const DENSITY_UNIT = (units: Units): 'lb/ft³' | 'kg/m³' => (isMetric(units) ? 'kg/m³' : 'lb/ft³');

/** A density's bare number in the project's unit (the Density field's text): whole kg/m³; whole lb/ft³, one decimal under 10. */
export function densityText(lbPerFt3: number, units: Units): string {
  return isMetric(units) ? String(Math.round(lbPerFt3 * KG_M3_PER_LB_FT3)) : estimate(lbPerFt3);
}

/** e.g. `44 lb/ft³`, `705 kg/m³`. */
export const formatDensity = (lbPerFt3: number, units: Units) => `${densityText(lbPerFt3, units)} ${DENSITY_UNIT(units)}`;

/** The most a typed density may be, said in the project's unit: rounded DOWN, so the stated limit is itself accepted. */
export function densityLimitText(lbPerFt3: number, units: Units): string {
  return isMetric(units) ? `${Math.floor(lbPerFt3 * KG_M3_PER_LB_FT3)} kg/m³` : `${Math.floor(lbPerFt3)} lb/ft³`;
}

/** A typed density, in the project's unit, as lb/ft³; null unless a plain decimal number above 0. Never throws. */
export function parseDensity(text: string, units: Units): number | null {
  const t = text.trim();
  if (!DENSITY_RE.test(t)) return null;
  const v = Number(t);
  if (!(v > 0)) return null;
  return isMetric(units) ? v / KG_M3_PER_LB_FT3 : v;
}
