import type { Board, Cut, Dimension, Region, Span } from './types';
import { DIMENSION_ORDER, positionAxisOf } from './geometry';

/** The board itself, uncut. */
export function wholeBoard(board: Board): Region {
  return {
    length: [0, board.length],
    width: [0, board.width],
    thickness: [0, board.thickness],
  };
}

/**
 * The box a cut removes, in the board's own coordinate space.
 *
 * A cut spans its `across` axis fully (that is what makes it a through-cut),
 * sits at [offset, offset + width] on the implied position axis, and reaches
 * `depth` into `face` from whichever end `from` names. This is the only place
 * `from` is consumed — everything downstream reads the region, not the cut.
 *
 * `face` and `across` naming the same dimension is unrepresentable — there is
 * no position axis left to measure `offset`/`width` along, and writing
 * `region[cut.across]` then `region[cut.face]` to the same key would leave the
 * third key unset, so `grid`'s `inside` check would throw destructuring it.
 * `document.ts`'s validator drops such a cut on load, but this function must
 * not lean on that: a `Board` built directly (a test, a future creation path)
 * can still reach here without going through the validator. Making it total
 * here means a future refactor of *where* validation runs cannot break this
 * function from a distance — the same reasoning as `ranks()` in
 * `viewport/grainTiling.ts`. A degenerate cut removes nothing: return a
 * zero-width region, which `inside`'s strict `>`/`<` interior test can never
 * contain, whatever cell centre it is compared against.
 */
export function cutRegion(board: Board, cut: Cut): Region {
  if (cut.face === cut.across) {
    return { length: [0, 0], width: [0, 0], thickness: [0, 0] };
  }
  const pos = positionAxisOf(cut.face, cut.across);
  const faceDim = board[cut.face];
  const region = {} as Region;
  region[cut.across] = [0, board[cut.across]];
  region[pos] = [cut.offset, cut.offset + cut.width];
  region[cut.face] = cut.from === 'min'
    ? [0, cut.depth]
    : [faceDim - cut.depth, faceDim];
  return region;
}

interface Grid {
  /** Sorted, deduplicated split planes per dimension, always including 0 and the dimension. */
  coords: Record<Dimension, number[]>;
  /** filled[i][j][k] for the cell between coords along length, width, thickness. */
  filled: boolean[][][];
}

/**
 * The board divided at every cut boundary, with the cells inside any cut
 * removed.
 *
 * Exact, because every cut and every board is axis-aligned. Splitting at every
 * boundary first is what makes the centre test in step two sound: no cell can
 * straddle a cut edge, so a cell is either wholly in or wholly out.
 *
 * Subtracting the UNION is the whole of overlap handling — stock covered by
 * two cuts is removed once, never twice, and there is no pairwise intersection
 * case to get wrong.
 *
 * Shared by boardSolids and boardEdges, which is why it is computed here once
 * rather than in each.
 */
function grid(board: Board): Grid {
  const regions = board.cuts.map((c) => cutRegion(board, c));

  const coords = {} as Record<Dimension, number[]>;
  for (const d of DIMENSION_ORDER) {
    const set = new Set<number>([0, board[d]]);
    for (const r of regions) {
      for (const v of r[d]) {
        if (v > 0 && v < board[d]) set.add(v);
      }
    }
    coords[d] = [...set].sort((a, b) => a - b);
  }

  const inside = (r: Region, p: Record<Dimension, number>) =>
    DIMENSION_ORDER.every((d) => p[d] > r[d][0] && p[d] < r[d][1]);

  const mid = (d: Dimension, i: number) => (coords[d][i] + coords[d][i + 1]) / 2;

  const filled: boolean[][][] = [];
  for (let i = 0; i < coords.length.length - 1; i += 1) {
    const plane: boolean[][] = [];
    for (let j = 0; j < coords.width.length - 1; j += 1) {
      const row: boolean[] = [];
      for (let k = 0; k < coords.thickness.length - 1; k += 1) {
        const centre = { length: mid('length', i), width: mid('width', j), thickness: mid('thickness', k) };
        row.push(!regions.some((r) => inside(r, centre)));
      }
      plane.push(row);
    }
    filled.push(plane);
  }
  return { coords, filled };
}

/** The cell at (i, j, k) as a Region. */
function cellRegion(coords: Grid['coords'], i: number, j: number, k: number): Region {
  return {
    length: [coords.length[i], coords.length[i + 1]] as Span,
    width: [coords.width[j], coords.width[j + 1]] as Span,
    thickness: [coords.thickness[k], coords.thickness[k + 1]] as Span,
  };
}

/**
 * Merge every pair of solids that touch along `axis` and match exactly on the
 * other two dimensions.
 *
 * Sorting by the other two spans first, then by the axis min, puts every
 * mergeable pair next to each other, so one sweep reaches the fixpoint. That
 * is also what makes the output deterministic, which matters because the
 * viewport builds one geometry per solid and React keys them by index.
 */
function mergeAlong(solids: Region[], axis: Dimension): Region[] {
  const others = DIMENSION_ORDER.filter((d) => d !== axis);
  const key = (r: Region) => others.map((d) => `${r[d][0]}:${r[d][1]}`).join('|');
  const sorted = [...solids].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a[axis][0] - b[axis][0];
  });

  const out: Region[] = [];
  for (const solid of sorted) {
    const last = out[out.length - 1];
    if (last && key(last) === key(solid) && last[axis][1] === solid[axis][0]) {
      out[out.length - 1] = { ...last, [axis]: [last[axis][0], solid[axis][1]] as Span };
    } else {
      out.push(solid);
    }
  }
  return out;
}

/**
 * A board as a small set of axis-aligned boxes with its cuts removed.
 *
 * A board with no cuts comes out as exactly one solid whose extents are the
 * board's own — that is what guarantees joinery costs nothing at all for the
 * boards that do not use it.
 *
 * Merging is a solid-count and draw-call reduction only. It does NOT make the
 * result seam-free: the remainder around a dado is L-shaped in section and an
 * L is not a box. Edge lines therefore come from boardEdges, not from these
 * solids.
 *
 * Can legitimately return `[]`. `document.ts`'s validator only refuses a
 * single cut that alone removes all the stock (`offset === 0 && width ===
 * posDim && depth === faceDim`); it has no view of other cuts, so two cuts
 * that each individually survive can still jointly remove everything (e.g.
 * two adjacent full-depth, full-width cuts on the same face). That is a
 * legal, reachable output — a board consumed entirely by its own joinery —
 * not a bug, and callers (the viewport, a future cut list) must handle an
 * empty solid set rather than assume at least one box.
 */
export function boardSolids(board: Board): Region[] {
  if (board.cuts.length === 0) return [wholeBoard(board)];

  const { coords, filled } = grid(board);
  let solids: Region[] = [];
  for (let i = 0; i < filled.length; i += 1) {
    for (let j = 0; j < filled[i].length; j += 1) {
      for (let k = 0; k < filled[i][j].length; k += 1) {
        if (filled[i][j][k]) solids.push(cellRegion(coords, i, j, k));
      }
    }
  }
  for (const axis of DIMENSION_ORDER) solids = mergeAlong(solids, axis);
  return solids;
}
