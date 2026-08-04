export const MM_PER_INCH = 25.4;

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
 */
export function parseLength(input: string): number | null {
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

  if (DECIMAL_RE.test(rest)) return sign * (total + Number(rest));

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
export function formatLength(inches: number, precision = 16): string {
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
