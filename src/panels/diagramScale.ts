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
/**
 * A board is never drawn narrower than this — the mirror of the sliver clamp,
 * for a board that is tall rather than short. Symmetric with MAX_ASPECT on
 * purpose: neither dimension is drawn thinner than DRAW_WIDTH / MAX_ASPECT,
 * whichever way round the board is.
 */
export const MIN_WIDTH = DRAW_WIDTH / MAX_ASPECT;

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
    // The sliver clamp — the FIRST of two steps that make the scale
    // non-uniform (see the MIN_WIDTH floor below for the second). A
    // 96" x 3-1/2" rail needs somewhere to put a dado.
    drawnV = floor;
  } else if (drawnV > MAX_HEIGHT) {
    // Shrink BOTH axes: a 24" x 24" panel comes out square and smaller, never
    // squashed. The two branches are mutually exclusive because
    // DRAW_WIDTH / MAX_ASPECT is 125 and MAX_HEIGHT is 420.
    drawnH = DRAW_WIDTH * (MAX_HEIGHT / drawnV);
    drawnV = MAX_HEIGHT;
    if (drawnH < MIN_WIDTH) {
      // The mirror of the sliver clamp, on the axis this branch shrinks. A
      // tall, narrow board — e.g. a full-length groove in a board's edge,
      // where `h` is the thickness and `v` is the length — would otherwise
      // shrink to a hairline once `v` is capped at MAX_HEIGHT. Floor it
      // before centring, like the sliver clamp does at the other extreme:
      // this is the SECOND step that makes the scale non-uniform.
      drawnH = MIN_WIDTH;
    }
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
 *
 * Two guards sit around that, and neither is decoration:
 *
 * ORDERING. A `[max, min]` span yields a negative width, which fails the
 * MIN_FEATURE test and falls into the widening branch — drawing a plausible
 * narrow band in the wrong place with no error anywhere (follow-up 62).
 * `cutRegion` is the only current producer and always emits min-then-max, but
 * this is a small exported pure function and a hand-built Span is one import
 * away.
 *
 * CLAMPING. Widening about the centre puts the band outside the board whenever
 * the cut is within MIN_FEATURE / 2 of an edge — a cut at `offset: 0` came out
 * at `x = centre - 3`, left of the outline, and `overflow: visible` drew it
 * there. Clamping gives up exact centring in precisely the case where exact
 * centring is wrong, and nowhere else.
 */
export function band(span: Span, fit: DiagramFit): { x: number; width: number } {
  const lo = Math.min(span[0], span[1]);
  const hi = Math.max(span[0], span[1]);
  const x0 = fit.offsetX + lo * fit.sx;
  const x1 = fit.offsetX + hi * fit.sx;
  const width = x1 - x0;
  if (width >= MIN_FEATURE) return { x: x0, width };

  // Widen about the centre, then slide back inside the outline if that pushed
  // an edge cut out of it. `Math.max` last so a board drawn narrower than
  // MIN_FEATURE pins to the left edge rather than inverting the clamp.
  const left = fit.offsetX;
  const right = fit.offsetX + fit.drawnH;
  const x = (x0 + x1) / 2 - MIN_FEATURE / 2;
  return { x: Math.max(left, Math.min(x, right - MIN_FEATURE)), width: MIN_FEATURE };
}
