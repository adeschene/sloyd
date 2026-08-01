/**
 * How wide a diagram label is, and where a row of them can sit.
 *
 * WHY THIS IS ARITHMETIC AND NOT A MEASUREMENT. Every `<text>` in
 * `PartDiagram.tsx` used to be positioned by geometry alone, with nothing
 * measuring the string being placed — SVG text has extent and the code treated
 * it as a point (follow-up 59). The obvious fix, `getComputedTextLength()` in a
 * layout effect, is invisible to vitest: jsdom returns 0, which is the exact
 * hole the whole defect class came through.
 *
 * So the labels are set in `--font-num` instead — the monospace stack the rest
 * of the app already uses for every number it prints, and the one thing the
 * diagram labels inexplicably did not use. Measured in a real browser at
 * font-size 20, that face advances at a fixed rate per glyph for the whole
 * label alphabet (digits, `/`, `-`, `"`, space, and the word "deep") — two
 * independent probes on this host gave 12.042 and 12.029 units/glyph (≈12.03-
 * 12.04), not a single exact figure — so a label's width is its character
 * count times a constant. See the design spec's section 2 for the
 * measurements.
 */

/**
 * The label font size, in SVG USER UNITS.
 *
 * This is the single home for the number. It is applied to the `<svg>` element
 * as an attribute, NOT set in `styles.css` — the constant the arithmetic below
 * uses has to be the constant the browser renders, and a font size living in
 * both a .ts and a .css file is precisely the drift follow-up 64 records.
 *
 * User units rather than px means it scales with the drawing, so screen and
 * print agree without a second set of constants.
 */
export const LABEL_SIZE = 20;

/**
 * An UPPER BOUND on monospace advance, in em.
 *
 * Measured ≈0.602 on this host (two independent probes: 12.042 and 12.029
 * units/glyph at font-size 20, i.e. 0.6021em and 0.60145em); 0.62 leaves
 * headroom for a machine whose `--font-num` stack resolves to a wider face.
 * The bound must err HIGH: too wide only spaces labels further apart than
 * they needed, while too narrow
 * silently reintroduces the overlap this module exists to prevent, with every
 * unit test still passing.
 */
export const LABEL_EM = 0.62;

export const CHAR_W = LABEL_SIZE * LABEL_EM;

export const labelWidth = (s: string): number => s.length * CHAR_W;

export interface LabelBox {
  /** Where the label would sit if nothing else existed. */
  centre: number;
  width: number;
}

/**
 * Ideal centres in, non-overlapping centres out.
 *
 * Items MUST arrive in left-to-right order; the function preserves that order
 * rather than establishing it, because the caller's order is the board's
 * order (offset run, then band, then depth) and re-sorting by centre would
 * silently reassociate a label with the wrong feature on a crowded row.
 *
 * The leftmost label never moves unless the row overflows `max`. That is what
 * makes a crowded row read as a CASCADE — each label displaced right of the
 * one before it — rather than as a clump slid away from the geometry. See the
 * spec's section 9 for the worked case-6 numbers.
 */
export function packRow(items: LabelBox[], min: number, max: number, gap: number): number[] {
  if (items.length === 0) return [];

  const lefts: number[] = [];
  let cursor = min;
  for (const item of items) {
    const left = Math.max(item.centre - item.width / 2, cursor);
    lefts.push(left);
    cursor = left + item.width + gap;
  }

  // `cursor` sits one gap past the last item's right edge.
  const overflow = cursor - gap - max;
  if (overflow > 0) {
    // Shift uniformly, which preserves every gap, then re-clamp the head at
    // `min`. A row that genuinely cannot fit overflows to the RIGHT, into the
    // gutter, rather than to the left across the board it annotates.
    const shift = Math.min(overflow, lefts[0] - min);
    for (let i = 0; i < lefts.length; i += 1) lefts[i] -= shift;
  }

  return lefts.map((left, i) => left + items[i].width / 2);
}
