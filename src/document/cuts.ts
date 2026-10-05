import { MATERIALS, type Board, type Cut, type Dimension, type Region, type Span } from './types';
import { axisDimensions, boardExtents, DIMENSION_ORDER, positionAxisOf } from './geometry';

/**
 * Every field of `Cut` that decides "same cut": all but `id`.
 *
 * A TABLE CHECKED AGAINST THE TYPE, not a list in a function body (invariant
 * 40). Two readers derive from it: `cutSignature` (cut-list row grouping) and
 * `boardUVSignature` (BoardMesh's memo key). Both used to be hand-written
 * field lists, and adding `stopMin`/`stopMax` to `Cut` without adding them
 * there would have grouped a mortised leg with a through-dadoed one, or left
 * the 3D view drawing a stale cut. `satisfies` makes a new `Cut` field fail
 * `tsc` here until it is listed — invariant 15's lesson, one layer over.
 */
export const CUT_GEOMETRY_FIELDS = {
  face: true, from: true, across: true, offset: true, width: true, depth: true,
  stopMin: true, stopMax: true,
} as const satisfies Record<Exclude<keyof Cut, 'id'>, true>;

export const CUT_GEOMETRY_KEYS =
  Object.keys(CUT_GEOMETRY_FIELDS) as (keyof typeof CUT_GEOMETRY_FIELDS)[];

/** The board itself, uncut. */
export function wholeBoard(board: Board): Region {
  return {
    length: [0, board.length],
    width: [0, board.width],
    thickness: [0, board.thickness],
  };
}

/** A region nothing is inside: `inside`'s strict interior test can never contain a cell centre. */
const NO_REGION = (): Region => ({ length: [0, 0], width: [0, 0], thickness: [0, 0] });

/**
 * The box a cut removes, in the board's own coordinate space.
 *
 * A cut spans its `across` axis from `stopMin` to `board[across] - stopMax` — fully, when
 * both are 0, sits at [offset, offset + width] on the implied position axis, and reaches
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
 * contain, whatever cell centre it is compared against. Stops that meet or
 * cross (a board shortened under its cut) remove nothing, by the same
 * zero-region return as the degenerate case.
 */
export function cutRegion(board: Board, cut: Cut): Region {
  if (cut.face === cut.across) return NO_REGION();
  const pos = positionAxisOf(cut.face, cut.across);
  const faceDim = board[cut.face];
  const acrossDim = board[cut.across];
  // Total, like the face === across guard: a Board built directly can carry a
  // non-finite or out-of-range stop, and a shortened board can leave legal
  // stops crossing. Neither may put NaN or a backwards span into the grid.
  const stop = (s: number) => (Number.isFinite(s) ? Math.min(Math.max(s, 0), acrossDim) : 0);
  const lo = stop(cut.stopMin);
  const hi = acrossDim - stop(cut.stopMax);
  if (lo >= hi) return NO_REGION();
  const region = {} as Region;
  region[cut.across] = [lo, hi];
  region[pos] = [cut.offset, cut.offset + cut.width];
  region[cut.face] = cut.from === 'min'
    ? [0, cut.depth]
    : [faceDim - cut.depth, faceDim];
  return region;
}

/**
 * True when a cut takes no stock out of its board (follow-up 178).
 *
 * The box `cutRegion` returns, clipped to the board, has no volume. That is a
 * cut a board edit has left behind: stops that now cross, an offset now past
 * the board's end, or a width or depth of zero. `cutRegion`'s all-zero region
 * covers only the first, so the test is the CLIPPED box, not that sentinel —
 * which is also exactly what `boardSolids` already does, so the 3D view and
 * this agree by construction.
 *
 * Such a cut is kept in the document (shrinking a board and growing it back
 * must not lose the joint), but the cut list does not print it and Properties
 * says so. The loader drops it on the next open, as it always has.
 */
export function cutRemovesNothing(board: Board, cut: Cut): boolean {
  const region = cutRegion(board, cut);
  // `!(x > 0)` rather than `x <= 0`, so a NaN span (a directly-built Board)
  // counts as empty — which is what boardSolids makes of it.
  return DIMENSION_ORDER.some(
    (d) => !(Math.min(region[d][1], board[d]) - Math.max(region[d][0], 0) > 0),
  );
}

/** The cuts that actually remove stock — what the cut list prints and groups by. */
export function cutsThatRemoveStock(board: Board): Cut[] {
  return board.cuts.filter((cut) => !cutRemovesNothing(board, cut));
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
export const FLUSH_EPSILON = 1e-9;

/**
 * Which sides of a cut's opening are OPEN (cut-words spec §2.4): no stock
 * remains between that side and the board's edge — in the strip as wide as
 * the opening and spanning the cut's depth. A side at the edge has an empty
 * strip; a side that runs out into another cut's removed space has a strip
 * with no stock. The `face` entry is always closed (it is the depth axis).
 */
export function openSides(board: Board, cut: Cut, solids: Region[] = boardSolids(board)): Record<Dimension, { min: boolean; max: boolean }> {
  const r = cutRegion(board, cut);
  const span = (d: Dimension): Span => [Math.max(0, r[d][0]), Math.min(board[d], r[d][1])];
  const noStock = (strip: Region) =>
    DIMENSION_ORDER.some((d) => strip[d][1] - strip[d][0] <= FLUSH_EPSILON) ||
    !solids.some((s) => DIMENSION_ORDER.every((d) => Math.min(s[d][1], strip[d][1]) - Math.max(s[d][0], strip[d][0]) > FLUSH_EPSILON));
  const box = { length: span('length'), width: span('width'), thickness: span('thickness') };
  const out = {} as Record<Dimension, { min: boolean; max: boolean }>;
  for (const d of DIMENSION_ORDER) {
    if (d === cut.face) { out[d] = { min: false, max: false }; continue; }
    out[d] = {
      min: noStock({ ...box, [d]: [0, box[d][0]] }),
      max: noStock({ ...box, [d]: [box[d][1], board[d]] }),
    };
  }
  return out;
}

/** Every name a cut can have. Derived from its shape by cutLabel, never stored. */
export type CutKind =
  | 'dado' | 'rabbet'
  | 'stopped dado' | 'stopped rabbet'
  | 'mortise' | 'through mortise'
  | 'notch' | 'blind dado'
  | 'groove' | 'stopped groove' | 'blind groove';

/**
 * The OLD table (stopped-cuts spec §4.1). Used only for a cut that removes
 * nothing — it has no opening to read. Derived from the
 * geometry rather than stored, so the label can never disagree with the cut: a
 * rabbet is the same removal as a dado, taken flush with one end of the
 * position axis.
 */
function fieldLabel(board: Board, cut: Cut): CutKind {
  const pos = positionAxisOf(cut.face, cut.across);
  // A cut flush with both ends at once (spanning the whole position axis)
  // still satisfies this OR and reads as a rabbet — deliberate, not an
  // unconsidered case. The validator only rejects a full-span cut when it is
  // also full-depth, so a full-span, partial-depth cut is a legal input here.
  const flush = cut.offset === 0 ||
    Math.abs(cut.offset + cut.width - board[pos]) < FLUSH_EPSILON;
  // Stopped is compared exactly: a stop is a stored value the user typed, with
  // no arithmetic on the way in (invariant 18), unlike `flush`'s far-end test.
  const stops = (cut.stopMin > 0 ? 1 : 0) + (cut.stopMax > 0 ? 1 : 0);
  if (stops === 0) return flush ? 'rabbet' : 'dado';
  if (stops === 1) return flush ? 'stopped rabbet' : 'stopped dado';
  if (flush) return 'notch';
  // `>=`, not `===`: a depth left past the face mid-session is still through.
  return cut.depth >= board[cut.face] ? 'through mortise' : 'mortise';
}

/**
 * A cut described by its OPENING (cut-lines spec §2.1): the one source for its
 * word, which way it runs, where it sits and its stops. The setup line and the
 * drawing both format from this, so neither can disagree with the other or with
 * the word, whichever way the cut happens to be stored.
 *
 * Numbers, never strings: this module takes no `→ units` edge.
 *
 * Meaningful only for a cut that removes stock. For one that removes nothing,
 * `word` is the old table and the other fields are not read by anything (the
 * cut list and the drawings skip such cuts; Properties reads only the word).
 */
export interface CutShape {
  word: CutKind;
  /** The dimension the cut runs along (spec §2.1). */
  run: Dimension;
  /** The other in-plane dimension: where the cut sits. */
  pos: Dimension;
  /** The opening along `pos`, clipped to the board. */
  at: Span;
  /** The opening along `run`, clipped to the board. */
  along: Span;
  /** Gap from the run's min end to the board's edge, or null where that end is open. */
  stopMin: number | null;
  /** Gap from the run's max end to the board's edge, or null where that end is open. */
  stopMax: number | null;
  /**
   * True only when the run came from the tie's final default (length, width,
   * thickness): the extents are equal within FLUSH_EPSILON and neither or both directions
   * have exactly one open end. Properties offers no 'Match the cut list' then
   * (follow-up 198).
   */
  runByDefault: boolean;
}

type Opening = ReturnType<typeof openSides>;

/**
 * Which way a cut runs (spec §2.1). The axis open at both ends when exactly one
 * is; otherwise the opening's longer extent; on a tie within FLUSH_EPSILON (a square
 * opening; its extents are computed, so equal ones can differ by an ulp, fu 200) the direction with exactly one open end, else the earlier in
 * DIMENSION_ORDER (cut-storage spec §2). Never the stored `across`.
 */
function runAxis(cut: Cut, ext: (d: Dimension) => number, open: Opening): { axis: Dimension; byDefault: boolean } {
  const [a, b] = DIMENSION_ORDER.filter((d) => d !== cut.face);
  const through = (d: Dimension) => open[d].min && open[d].max;
  if (through(a) !== through(b)) return { axis: through(a) ? a : b, byDefault: false };
  if (Math.abs(ext(a) - ext(b)) > FLUSH_EPSILON) return { axis: ext(a) > ext(b) ? a : b, byDefault: false };
  // Cut-storage spec §2: on a tie, the direction with exactly one open
  // end (the edge the cut enters from); otherwise the earlier dimension. Never
  // the stored `across`: joinery stores a cut WITH across = run, so reading
  // across here would let storage and direction decide each other.
  const oneOpen = (d: Dimension) => open[d].min !== open[d].max;
  if (oneOpen(a) !== oneOpen(b)) return { axis: oneOpen(a) ? a : b, byDefault: false };
  return { axis: a, byDefault: true };
}

/**
 * The cut-words table (cut-words spec §2.2–2.6), read off the opening. The
 * extents are COMPUTED (clipped span differences), so each comparison between
 * them carries FLUSH_EPSILON (invariant 22, fu 200); a comparison between
 * STORED values (`cut.depth >= board[cut.face]`) stays exact (invariant 18).
 */
function tableWord(board: Board, cut: Cut, span: (d: Dimension) => Span, ext: (d: Dimension) => number, open: Opening): CutKind {
  const [a, b] = DIMENSION_ORDER.filter((d) => d !== cut.face);
  const ends = (d: Dimension) =>
    (span(d)[0] <= FLUSH_EPSILON ? 1 : 0) + (span(d)[1] >= board[d] - FLUSH_EPSILON ? 1 : 0);
  // Spec §2.5: a full-thickness cut at a corner of the broad face.
  if (ends('thickness') === 2 && ends('length') === 1 && ends('width') === 1) return 'notch';
  const na = (open[a].min ? 1 : 0) + (open[a].max ? 1 : 0);
  const nb = (open[b].min ? 1 : 0) + (open[b].max ? 1 : 0);
  if (na + nb >= 3) return 'rabbet';
  if (na + nb === 2) return na === 2 || nb === 2 ? 'dado' : 'stopped rabbet';
  if (na + nb === 1) {
    const openAxis = na === 1 ? a : b;
    const other = na === 1 ? b : a;
    const reach = ext(openAxis);
    const run = ext(other);
    if (reach > run + FLUSH_EPSILON) return 'stopped dado';
    return run > 4 * reach + FLUSH_EPSILON ? 'stopped rabbet' : 'notch';
  }
  if (cut.depth >= board[cut.face]) return 'through mortise';
  // Spec §2.6: a mortise is deeper than it is wide and no longer than 8x its depth.
  const narrow = Math.min(ext(a), ext(b));
  const long = Math.max(ext(a), ext(b));
  return cut.depth > narrow + FLUSH_EPSILON && long <= 8 * cut.depth + FLUSH_EPSILON ? 'mortise' : 'blind dado';
}

/** Spec §3: the with-grain name of each channel word. Every other word has none. */
const GROOVE: Partial<Record<CutKind, CutKind>> = {
  dado: 'groove', 'stopped dado': 'stopped groove', 'blind dado': 'blind groove',
};

/**
 * Whether a material has a grain direction for `groove` to follow. Read off the
 * material table, not a list of names: a sheet whose stock rotates freely
 * (MDF) has none, so a new grainless sheet good follows by declaring that.
 */
function hasGrain(material: string): boolean {
  return MATERIALS[material]?.sheet?.rotate !== 'free';
}

/**
 * What a cut is called (cut-words spec §2): read from the OPENING its clipped
 * box makes on the face it enters — which of the opening's four sides reach
 * the board's edge, and its proportions. Derived only from the box, so one
 * pocket stored two ways (either in-plane dimension as `across`) gets one
 * word (fu 181). Open sides count stock-free strips, not only edges (§2.4);
 * a full-thickness corner cut is a notch (§2.5); mortise vs blind dado is
 * depth against length (§2.6). A channel running with the board's grain is a
 * groove, not a dado (cut-lines spec §3). Also gives the run axis, position
 * and stops that the cut-list line and drawing print (cut-lines spec §2.1).
 */
export function cutShape(board: Board, cut: Cut, solids: Region[] = boardSolids(board)): CutShape {
  const r = cutRegion(board, cut);
  const span = (d: Dimension): Span => [Math.max(0, r[d][0]), Math.min(board[d], r[d][1])];
  const ext = (d: Dimension) => span(d)[1] - span(d)[0];
  const open = openSides(board, cut, solids);
  const { axis: run, byDefault: runByDefault } = runAxis(cut, ext, open);
  const pos = DIMENSION_ORDER.find((d) => d !== cut.face && d !== run)!;
  const along = span(run);
  const table = cutRemovesNothing(board, cut) ? null : tableWord(board, cut, span, ext, open);
  const word = table === null
    ? fieldLabel(board, cut)
    : run === board.grain && hasGrain(board.material) ? GROOVE[table] ?? table : table;
  return {
    word,
    run,
    pos,
    at: span(pos),
    along,
    stopMin: open[run].min ? null : along[0],
    stopMax: open[run].max ? null : board[run] - along[1],
    runByDefault,
  };
}

/** A cut's word: `cutShape(...).word`. Kept as its own export for the readers that want only the word. */
export function cutLabel(board: Board, cut: Cut, solids: Region[] = boardSolids(board)): CutKind {
  return cutShape(board, cut, solids).word;
}

/**
 * The same cut, stored the way it runs (cut-storage spec §3.1): `across` is
 * its shape's run, the position and width are its clipped opening along the
 * other axis, and the stops are its clipped opening along the run. The promise:
 * the re-stored cut PRINTS THE SAME word, direction and stops; its boundaries
 * are exact where the format allows and otherwise within one ulp, on the side
 * that keeps the run (below). Clipping only drops stored overhang that removed
 * nothing.
 *
 * Where even that ulp would change what the sheet says, the cut comes back
 * unchanged (the user's ruling). The case was an exact-square corner opening
 * in millimetres: growing its run by an ulp broke a tie of extents that were
 * only equal to the last bits. Extents now compare within FLUSH_EPSILON (fu 200),
 * so that tie holds and a search of 163,028 millimetre cuts found no input still
 * refused; the guard stays as a net for whatever the comparison tolerance misses.
 * Properties offers the button only when this returns a different object.
 *
 * A cut ALREADY stored with `across === run` comes back as the very same
 * object: recomputing its fields is not exact for decimals ((0.1 + 0.2) - 0.1
 * is not 0.2), and float noise here would split cut-list rows (invariant 18).
 * A cut that removes nothing has no shape to follow and is also returned as is.
 */
export function storedAsShape(board: Board, cut: Cut, solids: Region[] = boardSolids(board)): Cut {
  if (cutRemovesNothing(board, cut)) return cut;
  const s = cutShape(board, cut, solids);
  if (s.run === cut.across) return cut;
  // `offset` and `stopMin` are COPIES of the clipped spans' near ends, and a
  // value already inside [0, dim] passes cutRegion's clamp unchanged, so both
  // are exact. The far ends are not copies: cutRegion recomputes them as
  // `offset + width` and `dim - stopMax`, and the schema cannot always express
  // the target that way (see `nearestFor`). Where it can, the plain difference
  // already lands on it. Where it cannot, the far end is put on the side that
  // KEEPS THE RUN: the run's extent never shrinks and the position's never
  // grows. Rounding to the nearer side instead flipped a square opening's run,
  // so the note came back and the next click flipped it back (final review).
  const candidate: Cut = {
    ...cut,
    across: s.run,
    offset: s.at[0],
    width: s.at[1] - s.at[0],
    stopMin: s.along[0],
    stopMax: board[s.run] - s.along[1],
  };
  candidate.width = nearestFor(
    (w) => cutRegion(board, { ...candidate, width: w })[s.pos][1], s.at[1], candidate.width, 'atMost',
  );
  candidate.stopMax = nearestFor(
    (m) => cutRegion(board, { ...candidate, stopMax: m })[s.run][1], s.along[1], candidate.stopMax, 'atLeast',
  );
  // The guard: the sheet must read the re-stored cut exactly as it read the
  // original. The numbers may differ by the ulp above, which never shows at
  // display precision; the word, the axes and which ends are stopped may not.
  const after = cutShape({ ...board, cuts: board.cuts.map((c) => (c.id === cut.id ? candidate : c)) }, candidate);
  const same = after.word === s.word && after.run === s.run && after.pos === s.pos &&
    (after.stopMin === null) === (s.stopMin === null) && (after.stopMax === null) === (s.stopMax === null);
  return same ? candidate : cut;
}

/**
 * The float `x` within EXACT_STEPS ulps of `guess` whose `f(x)` is nearest to
 * `target` without passing it (`atMost`: f(x) <= target; `atLeast`: >=), the
 * target itself whenever some `x` reaches it.
 *
 * Not every target is reachable, and searching further does not help. A far
 * stop is `dim - stopMax`: for a target under half of `dim`, every result is a
 * multiple of ulp(stopMax), which can be coarser than the target's own bits
 * (millimetre values do this). `offset + width` misses too, rarely, when
 * `offset`'s low bits sit exactly half a step off the result's grid and
 * round-half-even skips every other value. Then the far end lands within one
 * ulp of the board's dimension of the target, on the given side. Measured on a
 * seeded sweep of 8,114 millimetre re-stores (cut-storage spec §3.1).
 */
function nearestFor(f: (x: number) => number, target: number, guess: number, side: 'atMost' | 'atLeast'): number {
  const ok = (y: number) => (side === 'atMost' ? y <= target : y >= target);
  let best = NaN;
  let bestErr = Infinity;
  const consider = (x: number) => {
    const y = f(x);
    if (ok(y) && Math.abs(y - target) < bestErr) { best = x; bestErr = Math.abs(y - target); }
  };
  consider(guess);
  for (const dir of [1, -1] as const) {
    let x = guess;
    for (let i = 0; i < EXACT_STEPS && bestErr > 0; i++) {
      x = nextFloat(x, dir);
      consider(x);
    }
  }
  return Number.isNaN(best) ? guess : best;
}

const EXACT_STEPS = 8;

/** The adjacent double above (`dir` 1) or below (`dir` -1) a finite `x`. */
function nextFloat(x: number, dir: 1 | -1): number {
  if (x === 0) return dir * Number.MIN_VALUE;
  const f = new Float64Array([x]);
  const bits = new BigInt64Array(f.buffer);
  bits[0] += (x > 0) === (dir > 0) ? 1n : -1n;
  return f[0];
}
