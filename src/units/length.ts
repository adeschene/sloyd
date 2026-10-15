export const MM_PER_INCH = 25.4;

export type LengthDisplay = 'imperial-fractional' | 'metric-mm';
/** A document's length units (metric-display spec §2). `precision` is the imperial fraction denominator; a metric
 *  project keeps it (ignored for display) so switching back restores it. */
export interface Units { display: LengthDisplay; precision: number }
export const IMPERIAL: Units = Object.freeze({ display: 'imperial-fractional', precision: 16 }) as Units;
export const imperialAt = (precision: number): Units => ({ display: 'imperial-fractional', precision });
export const isMetric = (u: Units) => u.display === 'metric-mm';

const MM_RE = /^(-?(?:\d+\.?\d*|\.\d+))\s*mm$/;
const FEET_RE = /^((?:\d+\.?\d*|\.\d+))\s*(?:'|ft)\s*/;
const MIXED_RE = /^(\d+)[\s-](\d+)\/(\d+)$/;
const FRACTION_RE = /^(\d+)\/(\d+)$/;
const DECIMAL_RE = /^(?:\d+\.?\d*|\.\d+)$/;

/**
 * Parse a shop-style length into decimal inches.
 * Accepts: 3/4 · 0.75 · 1-1/2 · 1 1/2 · 1 1/2" · 2'6" · 18mm
 * Negatives are allowed — positions may be negative. Callers that need a
 * positive dimension must check the sign themselves.
 * Returns null for anything it cannot parse. Never throws, never guesses.
 * The grammar is the same in both modes except a bare number's unit: inches
 * when `units` is imperial, millimetres in a metric project.
 */
export function parseLength(input: string, units: Units): number | null {
  if (typeof input !== 'string') return null;
  let rest = input.trim().toLowerCase();
  if (!rest) return null;

  const mm = rest.match(MM_RE);
  if (mm) return Number(mm[1]) / MM_PER_INCH;

  let sign = 1;
  if (rest.startsWith('-')) {
    sign = -1;
    rest = rest.slice(1).trim();
  }

  let total = 0;
  const feet = rest.match(FEET_RE);
  if (feet) {
    total += Number(feet[1]) * 12;
    rest = rest.slice(feet[0].length).trim();
    if (!rest) return sign * total;
  }

  const unmarked = !feet && !/(?:"|″|in|inch|inches)$/.test(rest);
  rest = rest.replace(/(?:"|″|in|inch|inches)$/, '').trim();
  if (!rest) return feet ? sign * total : null;

  const mixed = rest.match(MIXED_RE);
  if (mixed) {
    const den = Number(mixed[3]);
    if (den === 0) return null;
    return sign * (total + Number(mixed[1]) + Number(mixed[2]) / den);
  }

  const frac = rest.match(FRACTION_RE);
  if (frac) {
    const den = Number(frac[2]);
    if (den === 0) return null;
    return sign * (total + Number(frac[1]) / den);
  }

  if (DECIMAL_RE.test(rest)) {
    // A bare number (no feet, no inch mark) in a metric project is millimetres (spec R4), after the sign strip so
    // '- 19' and '-19' agree.
    if (unmarked && isMetric(units)) return (sign * Number(rest)) / MM_PER_INCH;
    return sign * (total + Number(rest));
  }

  return null;
}

/**
 * Could this single character begin a length `parseLength` would accept?
 *
 * The Tape tool's type-anywhere capture (App.tsx's keydown effect) uses this to
 * decide whether a keystroke arriving with nothing focused is the start of a
 * distance — in which case it is routed into the readout — or a shortcut. It is
 * a fact about the grammar above, so it lives beside the grammar rather than
 * inline in an event handler where nothing would ever compare it to the
 * patterns it is derived from.
 *
 * Derived from all five patterns, not guessed:
 *  - `DECIMAL_RE` accepts `\d+\.?\d*` or `\.\d+`, so a digit or `.` can lead.
 *  - the sign strip at the top of `parseLength` accepts a leading `-`.
 *  - `MM_RE`, `FEET_RE`, `MIXED_RE` and `FRACTION_RE` every one require a digit
 *    first. Nothing this module parses begins with `/`, `'` or `"` — a bare
 *    `/4` is not a length, so capturing `/` would swallow a keystroke and seed
 *    the box with a value that can never parse.
 *
 * Whitespace is the one exclusion NOT justified by the patterns: `parseLength`
 * trims, so `' 4'` does parse. Space scrolls, and a character contributing
 * nothing to the number should not be the one that opens the box.
 *
 * Letters are excluded outright even though `mm`, `ft` and `in` are legal
 * SUFFIXES: `t` and `m` are the app's tool shortcuts, and a length that begins
 * with a letter does not exist. If any pattern above ever gains a new leading
 * form, this set has to be revisited with it — that coupling is the reason the
 * two sit in one file.
 */
export function canBeginLength(key: string): boolean {
  // Length 1 filters out every named key in one test — 'Enter', 'Escape',
  // 'Backspace', 'ArrowLeft' — none of which is a character at all, and none of
  // which would have to be enumerated as this list grows.
  if (key.length !== 1) return false;
  return (key >= '0' && key <= '9') || key === '.' || key === '-';
}

/**
 * Render decimal inches as a shop-readable fraction, reduced to lowest terms.
 * `precision` is the denominator to round to (16 => nearest 1/16").
 */
function formatFraction(inches: number, precision: number): string {
  if (!Number.isFinite(inches)) return '—';

  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);

  // Nudge by a relative epsilon so 0.7499999999 reads as 3/4 rather than 11/16.
  const ticks = Math.round(abs * precision * (1 + Number.EPSILON) + Number.EPSILON);

  const whole = Math.floor(ticks / precision);
  let num = ticks % precision;
  let den = precision;
  while (num > 0 && num % 2 === 0 && den % 2 === 0) {
    num /= 2;
    den /= 2;
  }

  if (num === 0) return `${sign}${whole}"`;
  if (whole === 0) return `${sign}${num}/${den}"`;
  return `${sign}${whole}-${num}/${den}"`;
}

/** Decimal millimetres for `inches`, rounded half away from zero at `decimals` places after the same relative-epsilon
 *  nudge the fraction path uses; a zero result has no sign. */
function mmNumber(inches: number, decimals: 0 | 1): string {
  const mm = inches * MM_PER_INCH;
  const f = decimals === 1 ? 10 : 1;
  const ticks = Math.round(Math.abs(mm) * f * (1 + Number.EPSILON) + Number.EPSILON);
  if (ticks === 0) return '0';
  const sign = mm < 0 ? '-' : '';
  return decimals === 1 && ticks % 10 !== 0 ? `${sign}${(ticks / 10).toFixed(1)}` : `${sign}${decimals === 1 ? ticks / 10 : ticks}`;
}

/** Hole diameters and pitches in a metric project (spec R7): one decimal unless a whole mm. */
export function formatMm(inches: number, decimals: 0 | 1): string {
  return Number.isFinite(inches) ? `${mmNumber(inches, decimals)} mm` : '—';
}

/**
 * THE length formatter (inv 52). Imperial: shop fractions reduced at `units.precision` — byte-for-byte today's output.
 * Metric: whole millimetres.
 */
export function formatLength(inches: number, units: Units): string {
  return isMetric(units) ? formatMm(inches, 0) : formatFraction(inches, units.precision);
}

/** A drawing's dimension (spec R8): metric drops the unit (the sheet carries one note); imperial keeps its mark. */
export function formatLengthBare(inches: number, units: Units): string {
  if (!isMetric(units)) return formatFraction(inches, units.precision);
  return Number.isFinite(inches) ? mmNumber(inches, 0) : '—';
}

/** A size (`L × W [× T]`): imperial each with its mark, as the cut list wrote it; metric the unit once. */
export function formatSize(values: readonly number[], units: Units): string {
  if (!isMetric(units)) return values.map((v) => formatFraction(v, units.precision)).join(' × ');
  return `${values.map((v) => formatLengthBare(v, units)).join(' × ')} mm`;
}

/** Floor to the display grid — a LIMIT is floored, never rounded (fu 309's advice): 1/precision inch, or 1 mm. The 1e-9
 *  is float noise (inv 22). */
export function floorToTick(inches: number, units: Units): number {
  return isMetric(units)
    ? Math.floor(inches * MM_PER_INCH + 1e-9) / MM_PER_INCH
    : Math.floor(inches * units.precision + 1e-9) / units.precision;
}
