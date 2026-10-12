/** SVG user units across a plans figure (cf. DRAW_WIDTH for the part diagrams). */
export const PLAN_WIDTH = 1000;
/** Room on each side of a view for one dimension level (line, ticks, label). */
export const DIM_BAND = 56;
export const VIEW_GAP = 24;
/** User units per inch, at most: a small piece is not blown up to fill the page. */
export const MAX_PLAN_SCALE = 24;
export const ISO_MAX_HEIGHT = 640;
export const ISO_MARGIN = 16;

export interface Rect2 { min: [number, number]; max: [number, number] }
/** SVG position of a view's (min right, max up) corner. */
export interface Placement { x: number; y: number }
export interface TrioLayout { scale: number; width: number; height: number; front: Placement; side: Placement; top: Placement }

const w = (r: Rect2) => r.max[0] - r.min[0];
const h = (r: Rect2) => r.max[1] - r.min[1];

/**
 * Third-angle: plan above front, side right of front, ONE scale so the views align (spec §5.2).
 * Each view has a DIM_BAND on all four sides (chain above/left, overall below/right).
 */
export function layoutTrio(front: Rect2, side: Rect2, top: Rect2): TrioLayout {
  const across = w(front) + w(side);
  const room = PLAN_WIDTH - 4 * DIM_BAND - VIEW_GAP;
  const scale = across > 0 ? Math.min(room / across, MAX_PLAN_SCALE) : MAX_PLAN_SCALE;
  const topAt = { x: DIM_BAND, y: DIM_BAND };
  const frontAt = { x: DIM_BAND, y: DIM_BAND + h(top) * scale + DIM_BAND + VIEW_GAP + DIM_BAND };
  const sideAt = { x: DIM_BAND + w(front) * scale + DIM_BAND + VIEW_GAP + DIM_BAND, y: frontAt.y };
  return {
    scale,
    width: sideAt.x + w(side) * scale + DIM_BAND,
    height: frontAt.y + h(front) * scale + DIM_BAND,
    front: frontAt, side: sideAt, top: topAt,
  };
}

/** One undimensioned figure (the exploded view): fit the width or ISO_MAX_HEIGHT, whichever binds. */
export function layoutSingle(r: Rect2): { scale: number; width: number; height: number; at: Placement } {
  const byW = w(r) > 0 ? (PLAN_WIDTH - 2 * ISO_MARGIN) / w(r) : Infinity;
  const byH = h(r) > 0 ? ISO_MAX_HEIGHT / h(r) : Infinity;
  const scale = Math.min(byW, byH, MAX_PLAN_SCALE);
  return { scale, width: 2 * ISO_MARGIN + w(r) * scale, height: 2 * ISO_MARGIN + h(r) * scale, at: { x: ISO_MARGIN, y: ISO_MARGIN } };
}
