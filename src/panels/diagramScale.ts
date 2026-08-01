import type { Span } from '../document/document';

/**
 * The nominal content width of a diagram, in DRAWING UNITS.
 *
 * The SVG carries a viewBox and fills its grid cell, so these are not CSS
 * pixels — but the unit-to-px ratio is a constant per medium, because every
 * diagram on the sheet renders into the same cell width (and print has its own
 * constant). That is what makes MIN_FEATURE meaningful as a fixed number.
 */
export const DRAW_WIDTH = 1000;
/** A board is never drawn thinner than DRAW_WIDTH / this. */
export const MAX_ASPECT = 8;
/** A drawing never grows taller than this. */
export const MAX_HEIGHT = 420;
/** A cut band is never drawn narrower than this. */
export const MIN_FEATURE = 6;

export interface DiagramFit {
  /** Drawing units per inch, horizontally. */
  sx: number;
  /** Drawing units per inch, vertically. Equal to `sx` except under the sliver clamp. */
  sy: number;
  drawnH: number;
  drawnV: number;
  /** Left inset, non-zero only when a tall drawing was shrunk and centred. */
  offsetX: number;
}

/**
 * Uniform by default; distorted only at the extremes.
 *
 * MAX_ASPECT and MAX_HEIGHT are GUESSES. They live here as named constants
 * precisely so a browser-verification pass can change them without touching
 * anything else. Do not treat the current values as settled.
 */
export function fitView(h: number, v: number): DiagramFit {
  // Total, like `cutRegion`: a degenerate board must not produce Infinity or
  // NaN in an SVG attribute, where it would fail silently rather than loudly.
  if (!(h > 0) || !(v > 0)) {
    return { sx: 0, sy: 0, drawnH: 0, drawnV: 0, offsetX: 0 };
  }

  let drawnH = DRAW_WIDTH;
  let drawnV = v * (DRAW_WIDTH / h);
  let offsetX = 0;

  const floor = DRAW_WIDTH / MAX_ASPECT;
  if (drawnV < floor) {
    // The sliver clamp — the ONLY step that makes the scale non-uniform. A
    // 96" x 3-1/2" rail needs somewhere to put a dado.
    drawnV = floor;
  } else if (drawnV > MAX_HEIGHT) {
    // Shrink BOTH axes: a 24" x 24" panel comes out square and smaller, never
    // squashed. The two branches are mutually exclusive because
    // DRAW_WIDTH / MAX_ASPECT is 125 and MAX_HEIGHT is 420.
    drawnH = DRAW_WIDTH * (MAX_HEIGHT / drawnV);
    drawnV = MAX_HEIGHT;
    offsetX = (DRAW_WIDTH - drawnH) / 2;
  }

  return { sx: drawnH / h, sy: drawnV / v, drawnH, drawnV, offsetX };
}

/**
 * A cut's band along the horizontal axis.
 *
 * Widening is ABOUT THE CENTRE, not from the left edge. Position is the
 * property the drawing preserves — "near the far end" must still read as near
 * the far end — and centre-preserving widening keeps the error symmetric and
 * bounded at MIN_FEATURE / 2. The annotated numbers stay exact regardless; the
 * printed caption says the drawing is schematic.
 */
export function band(span: Span, fit: DiagramFit): { x: number; width: number } {
  const x0 = fit.offsetX + span[0] * fit.sx;
  const x1 = fit.offsetX + span[1] * fit.sx;
  const width = x1 - x0;
  if (width >= MIN_FEATURE) return { x: x0, width };
  return { x: (x0 + x1) / 2 - MIN_FEATURE / 2, width: MIN_FEATURE };
}
