import type { Board, Cut, Dimension, Region, Span } from './types';
import { axisDimensions, boardExtents, DIMENSION_ORDER, positionAxisOf } from './geometry';

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

/**
 * Whether a point in the board's own space touches any remaining stock.
 *
 * The one rule behind every withheld snap point (design §5): a marker must sit
 * on a feature that is actually drawn, and a point with no filled cell around
 * it sits in a hole. Both cases fall out of it — a board its own cuts consumed
 * entirely (nothing is filled, so nothing is offered) and a cut's floor corner
 * that a deeper, overlapping cut has since removed.
 *
 * This is boardEdges' four-cell configuration test generalised from a segment
 * to a point: on each axis a coordinate either falls inside one cell or lands
 * exactly on a split plane between two, so up to eight cells touch it, and one
 * filled cell is enough. The span test is CLOSED (`>=`/`<=`) precisely so a
 * point on a boundary — which is where every interesting snap point sits —
 * sees the cells on both sides of it.
 *
 * Returns a closure because the grid is built once per board and probed many
 * times: a board with n cuts is asked about 15n points.
 */
export function stockProbe(board: Board): (p: Point) => boolean {
  const { coords, filled } = grid(board);

  /** Every cell index on `d` whose closed span contains `v`. Empty if outside. */
  const cells = (d: Dimension, v: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < coords[d].length - 1; i += 1) {
      if (v >= coords[d][i] && v <= coords[d][i + 1]) out.push(i);
    }
    return out;
  };

  return (p) => {
    for (const i of cells('length', p.length)) {
      for (const j of cells('width', p.width)) {
        for (const k of cells('thickness', p.thickness)) {
          if (filled[i][j][k]) return true;
        }
      }
    }
    return false;
  };
}

/** A point in a board's own coordinate space. */
export type Point = Record<Dimension, number>;
/** A straight edge between two such points. */
export type Segment = [Point, Point];

/**
 * The edges of a cut board, derived from the cell grid rather than from the
 * solids.
 *
 * Per-solid EdgesGeometry is wrong, not merely wasteful: the remainder around
 * a dado is L-shaped in section, an L is not a box, and so the board's uncut
 * bottom face ends up covered by three abutting solids with seams drawn across
 * it. BoardMesh's own comment calls edge lines "the single biggest readability
 * win", so those phantom lines are a legibility bug.
 *
 * For every candidate segment — one cell long, on a grid line — look at the up
 * to four cells around it and draw it unless the local configuration is flat:
 *
 *   all four filled      no  (interior stock)
 *   none filled          no  (empty)
 *   two, sharing a face  no  (a flat face continuing through)
 *   two, diagonal        yes
 *   one, or three        yes
 *
 * Cells outside the board count as empty, which is what makes the board's own
 * silhouette fall out of the same rule instead of needing its own pass. Three
 * filled is the concave shoulder of a dado; one filled is a convex corner.
 */
export function boardEdges(board: Board): Segment[] {
  const { coords, filled } = grid(board);
  const counts: Record<Dimension, number> = {
    length: coords.length.length - 1,
    width: coords.width.length - 1,
    thickness: coords.thickness.length - 1,
  };

  const at = (cell: Record<Dimension, number>): boolean => {
    for (const d of DIMENSION_ORDER) {
      if (cell[d] < 0 || cell[d] >= counts[d]) return false;
    }
    return filled[cell.length][cell.width][cell.thickness];
  };

  const out: Segment[] = [];
  for (const along of DIMENSION_ORDER) {
    const [p, q] = DIMENSION_ORDER.filter((d) => d !== along);
    for (let bp = 0; bp < coords[p].length; bp += 1) {
      for (let bq = 0; bq < coords[q].length; bq += 1) {
        // The four cells sharing this grid line, indexed by which side of
        // bp and bq they sit on.
        const quad = [[bp - 1, bq - 1], [bp - 1, bq], [bp, bq - 1], [bp, bq]];

        // Whether the unit segment at along-index i is drawn, per the
        // four-cell configuration rule. Computed for every i along this
        // line before emitting anything, so consecutive drawn cells can be
        // merged into one segment rather than one per grid split — a split
        // introduced by a cut elsewhere (e.g. the dado's length boundaries,
        // which also cut the grid's untouched bottom layer) must not
        // fragment a face that the cut never actually interrupts here.
        const drawn = (i: number): boolean => {
          const on = quad.filter(([cp, cq]) =>
            at({ [along]: i, [p]: cp, [q]: cq } as unknown as Record<Dimension, number>),
          );
          if (on.length === 0 || on.length === 4) return false;
          // Two cells that differ on only one axis share a face, so the
          // surface runs straight through and there is no edge here.
          if (on.length === 2 && (on[0][0] === on[1][0] || on[0][1] === on[1][1])) return false;
          return true;
        };

        const base = { [p]: coords[p][bp], [q]: coords[q][bq] } as unknown as Point;
        let runStart: number | null = null;
        for (let i = 0; i <= counts[along]; i += 1) {
          const on = i < counts[along] && drawn(i);
          if (on && runStart === null) {
            runStart = i;
          } else if (!on && runStart !== null) {
            out.push([
              { ...base, [along]: coords[along][runStart] } as Point,
              { ...base, [along]: coords[along][i] } as Point,
            ]);
            runStart = null;
          }
        }
      }
    }
  }
  return out;
}

/**
 * A solid as the viewport wants it: size along [X, Y, Z], and a centre
 * expressed RELATIVE TO THE BOARD'S OWN CENTRE, because BoardMesh puts a
 * <group> at boardCenter(board) and hangs every solid inside it.
 *
 * The board→world mapping is axisDimensions and nothing else. A board's own
 * coordinate space runs from 0 to its dimension on each axis, and `position`
 * is the min-corner, so a local coordinate maps to the world by adding the
 * corner — which relative to the centre is just "minus half the extent".
 */
export function solidWorldBox(
  board: Board,
  solid: Region,
): { center: [number, number, number]; size: [number, number, number] } {
  const dims = axisDimensions(board);
  const extents = boardExtents(board);
  const size = dims.map((d) => solid[d][1] - solid[d][0]) as [number, number, number];
  const center = dims.map(
    (d, axis) => (solid[d][0] + solid[d][1]) / 2 - extents[axis] / 2,
  ) as [number, number, number];
  return { center, size };
}

/** A point in the board's space, in the same board-centred frame. */
export function pointToLocalXYZ(board: Board, point: Point): [number, number, number] {
  const dims = axisDimensions(board);
  const extents = boardExtents(board);
  return dims.map((d, axis) => point[d] - extents[axis] / 2) as [number, number, number];
}

/**
 * Far below anything meaningful at the bench (1/16in display precision) and
 * well above float ULP drift.
 *
 * `validateCuts` in document.ts clamps a cut's width with
 * `posDim - offset` — its own docstring notes that a board shrunk below an
 * existing cut is a real, reachable case, not a corrupt file. That
 * subtraction means `offset + width` is a round-trip through floating point,
 * not the exact `posDim` it started from, so a genuine rabbet produced by
 * that clamp can miss an exact `===` comparison by a couple of ULP. Do not
 * simplify this back to `===`.
 */
const FLUSH_EPSILON = 1e-9;

/**
 * What a cut is called. Derived from the geometry rather than stored, so the
 * label can never disagree with the cut: a rabbet is the same removal as a
 * dado, taken flush with one end of the position axis.
 */
export function cutLabel(board: Board, cut: Cut): 'dado' | 'rabbet' {
  const pos = positionAxisOf(cut.face, cut.across);
  // A cut flush with both ends at once (spanning the whole position axis)
  // still satisfies this OR and reads as a rabbet — deliberate, not an
  // unconsidered case. The validator only rejects a full-span cut when it is
  // also full-depth, so a full-span, partial-depth cut is a legal input here.
  const flush = cut.offset === 0 ||
    Math.abs(cut.offset + cut.width - board[pos]) < FLUSH_EPSILON;
  return flush ? 'rabbet' : 'dado';
}
