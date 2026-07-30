/**
 * Grid line spacing chosen for how dense the grid would be on screen.
 *
 * A 1-inch grid drawn to the horizon is unreadable and, worse, unstable: once
 * a cell spans less than a pixel the lines alias, and any camera motion turns
 * that aliasing into visible crawl. Fading the distant grid hides the symptom
 * at the cost of a grid that dissolves into nothing; dropping the lines that
 * are too fine to read fixes the cause and lets the grid stay solid to the
 * horizon.
 *
 * This is the same thing CAD tools do — the grid coarsens as you pull back
 * rather than shimmering or fading out.
 */

/**
 * Inch, foot, and twelve-foot. Each tier is 12x the one below, so the coarser
 * grid's lines always fall exactly on lines the finer grid also drew — the
 * spacing changes without the lines appearing to shift.
 */
const LADDER = [1, 12, 144] as const;

/**
 * Smallest on-screen spacing, in CSS pixels, that a grid line may have before
 * its tier is considered too fine to draw. Below roughly this, adjacent lines
 * start sharing pixels, which is where aliasing begins.
 */
export const MIN_LINE_SPACING_PX = 4;

export interface GridTier {
  /** Spacing of the fine (cell) lines, in inches. */
  cellSize: number;
  /** Spacing of the heavy (section) lines, in inches. Always 12x cellSize. */
  sectionSize: number;
}

/**
 * Pick the finest tier whose cell lines are still far enough apart to read.
 *
 * `pixelsPerInch` is how many screen pixels one world inch covers at the
 * point of interest — see `screenPixelsPerInch` in Viewport, which derives it
 * from the active camera.
 */
export function gridDensity(pixelsPerInch: number): GridTier {
  // NaN or a non-positive density means the camera is in a degenerate state
  // (zero zoom, or a zero-size canvas). Fall back to the coarsest tier rather
  // than comparing against nonsense: too coarse is merely sparse, whereas too
  // fine is the shimmer this function exists to prevent. Note that +Infinity
  // is NOT degenerate — it means infinitely zoomed in, and the comparison
  // below correctly resolves it to the finest tier.
  if (Number.isNaN(pixelsPerInch) || pixelsPerInch <= 0) {
    const coarsest = LADDER[LADDER.length - 1];
    return { cellSize: coarsest, sectionSize: coarsest * 12 };
  }

  const cellSize =
    LADDER.find((spacing) => spacing * pixelsPerInch >= MIN_LINE_SPACING_PX) ??
    LADDER[LADDER.length - 1];

  return { cellSize, sectionSize: cellSize * 12 };
}
