import type { Board, Cut, CutFrom, Dimension, Span } from './types';

/**
 * One cell of a face's depth field, in BOARD INCHES.
 *
 * No pixels, no drawing units — those belong to `panels/`. Keeping them out is
 * what lets this be tested against measurements rather than a rendering.
 */
export interface FaceCell {
  /** [min, max] along the view's HORIZONTAL in-plane dimension. */
  h: Span;
  /** [min, max] along the view's VERTICAL in-plane dimension. */
  v: Span;
  /** The depth that governs here. Always > 0 — uncut cells are not emitted. */
  depth: number;
  /** True only when more than one cut covers this cell AND their depths differ. */
  crossing: boolean;
}

/** Sorted, deduplicated boundaries, always including 0 and `extent`. */
function boundaries(extent: number, spans: Span[]): number[] {
  const set = new Set<number>([0, extent]);
  for (const [lo, hi] of spans) {
    if (lo > 0 && lo < extent) set.add(lo);
    if (hi > 0 && hi < extent) set.add(hi);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * The depth of stock removed at every point of one face.
 *
 * THE SAME SKELETON AS `cuts.ts`, ONE DIMENSION DOWN — split at every cut
 * boundary, then classify each cell by its centre. Splitting first is what
 * makes the centre test sound: no cell can straddle a cut edge, so a cell is
 * either wholly inside a cut or wholly outside it.
 *
 * BUT IT IS NOT `cuts.ts` REUSED, and reaching for `boardSolids` here will not
 * work. `boardSolids` DROPS a cell whose centre is inside any cut — a boolean.
 * This assigns the MAXIMUM depth among the covering cuts. Same skeleton,
 * different operation. Call it a depth field, not a solid decomposition.
 *
 * What the shared skeleton does buy is agreement by construction: a cell has
 * depth > 0 exactly when the corresponding 3D column has stock removed at this
 * face, which `depthField.agreement.test.ts` asserts directly rather than
 * leaving as an argument.
 *
 * `crossing` is deliberately NOT "covered by more than one cut". Two crossing
 * cuts of equal depth leave nothing to report about their intersection, and
 * marking it would invent a distinction the stock does not have.
 */
export function buildDepthField(
  board: Board,
  face: Dimension,
  from: CutFrom,
  horizontal: Dimension,
  vertical: Dimension,
): FaceCell[] {
  // A cut naming one dimension twice has no position axis to lay out against —
  // the same totality reasoning `cutRegion` gives. Skip it rather than let it
  // invent a boundary.
  const cuts = board.cuts.filter(
    (c) => c.face === face && c.from === from && c.face !== c.across,
  );
  if (cuts.length === 0) return [];

  // Both `across` and the position axis are in-plane, which is exactly why
  // every cut on a face is a full-span rectangle.
  const rect = (cut: Cut): { h: Span; v: Span } => {
    const spanOf = (d: Dimension): Span =>
      d === cut.across ? [0, board[d]] : [cut.offset, cut.offset + cut.width];
    return { h: spanOf(horizontal), v: spanOf(vertical) };
  };

  const rects = cuts.map((c) => ({ cut: c, ...rect(c) }));
  const hs = boundaries(board[horizontal], rects.map((r) => r.h));
  const vs = boundaries(board[vertical], rects.map((r) => r.v));

  const out: FaceCell[] = [];
  for (let i = 0; i < hs.length - 1; i += 1) {
    for (let j = 0; j < vs.length - 1; j += 1) {
      const hMid = (hs[i] + hs[i + 1]) / 2;
      const vMid = (vs[j] + vs[j + 1]) / 2;
      const covering = rects.filter(
        (r) => hMid > r.h[0] && hMid < r.h[1] && vMid > r.v[0] && vMid < r.v[1],
      );
      if (covering.length === 0) continue;
      const depths = covering.map((r) => r.cut.depth);
      const depth = Math.max(...depths);
      out.push({
        h: [hs[i], hs[i + 1]],
        v: [vs[j], vs[j + 1]],
        depth,
        crossing: covering.length > 1 && !depths.every((d) => d === depths[0]),
      });
    }
  }
  return out;
}
