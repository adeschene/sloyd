import { boardExtents, DIMENSION_ORDER, isSheetGood, wholeBoard } from '../document/document';
import type { Board, Region, Span } from '../document/document';
import { axisDimensions, faceGrainKinds, grainFamily } from './grainFaces';
import type { Dimension, GrainFamily, GrainKind } from './grainFaces';

/** A world axis: 0 = X, 1 = Y, 2 = Z. */
type Axis = 0 | 1 | 2;

/**
 * Which world axis each face's default UVs run along, in BoxGeometry's
 * material-group order (+X, -X, +Y, -Y, +Z, -Z). Signs are irrelevant here —
 * grain is mirror-symmetric, so all that matters is which axis carries u and
 * which carries v.
 */
const FACE_AXES: Array<[Axis, Axis]> = [
  [2, 1], // +X
  [2, 1], // -X
  [0, 2], // +Y
  [0, 2], // -Y
  [0, 1], // +Z
  [0, 1], // -Z
];

/**
 * The grain dimension ranks first, then the rest in [length, width, thickness]
 * order. Whichever of a face's two in-plane dimensions ranks lower takes the
 * drawn texture's u.
 *
 * That covers all three kinds. Wherever the grain is in the face's plane, u
 * follows it — which is the direction the figure is drawn running. On an end
 * face, where it is not, the fallback order still puts thickness last, so v
 * crosses the thickness and plywood's plies stack the way a sheet's do.
 *
 * With grain along the length this is the old fixed rank, unchanged.
 *
 * That reasoning only holds unmodified for solid wood, where the grain figure
 * is drawn on the board itself. A sheet good's ply stack is a property of the
 * *sheet*, not of the figure on its face — it always spans the sheet
 * thickness, whatever the grain says. So thickness must rank last for sheet
 * goods no matter what. But the veneer figure on the broad face still has to
 * turn with the grain, the same as solid wood's does — that is the whole
 * point of the grain control existing on plywood at all. So a sheet good
 * promotes the grain dimension exactly like solid wood does, but only among
 * the other *two* dimensions, with thickness pinned last: [grain, the other
 * non-thickness dimension, 'thickness'].
 *
 * 'Through thickness' is not offered for sheet goods (see isSheetGood's
 * comment) and is normalised away by validateBoard, so board.grain should
 * never be 'thickness' here for a sheet good — but this function makes itself
 * total by normalizing grain locally instead of relying on that invariant.
 * That way a future refactor cannot break this function from a distance
 * by rearranging where validation happens.
 */
function ranks(board: Board): Record<Dimension, number> {
  // Normalize grain locally: sheet goods never use 'thickness' grain, so if
  // we encounter it on a sheet good, treat it as 'length'. This makes the
  // function total on its own rather than relying on guarantees enforced
  // elsewhere, so it cannot be broken by changes to the validator.
  const g = isSheetGood(board.material) && board.grain === 'thickness' ? 'length' : board.grain;
  const order = isSheetGood(board.material)
    ? [g, DIMENSION_ORDER.find((d) => d !== g && d !== 'thickness')!, 'thickness']
    : [g, ...DIMENSION_ORDER.filter((d) => d !== g)];
  return {
    length: order.indexOf('length'),
    width: order.indexOf('width'),
    thickness: order.indexOf('thickness'),
  };
}

/** One tile spans the whole extent, whatever that extent is. */
const FIT = 'fit';
type Tile = number | typeof FIT;

/**
 * Inches per tile, as [along u, along v].
 *
 * Ends use FIT on both axes so the ring pattern reads as one cross-section
 * rather than a repeating motif. Plywood edges and ends use FIT on v so the
 * drawn ply stack spans the sheet thickness exactly — a 1/2in sheet and a 3/4in
 * sheet each show five plies, which is what they look like.
 */
const TILES: Record<GrainFamily, Record<GrainKind, [Tile, Tile]>> = {
  // face v is 6in, not the more obvious 10-12: with BANDS=16 the cathedral
  // region (where bandOffset can close, see grainLog.bandOffset) only spans
  // roughly the innermost couple of bands either side of the pith line — about
  // an eighth of the tile's v extent. A typical board (5.5in wide) sampling a
  // 10in tile only sees 55% of it, so a random per-board UV offset has a real
  // chance (~33%, measured) of landing a window that misses that region
  // entirely, showing flowing lines with no arch at all. At 6in a 5.5in board
  // sees over 90% of the tile, which is provably enough that no offset can
  // miss the region (it's wider than what could be excluded) — every board
  // shows at least a hint of the figure regardless of its id.
  wood:    { face: [16, 6], edge: [16, 4],   end: [FIT, FIT] },
  plywood: { face: [24, 16], edge: [16, FIT], end: [16, FIT] },
  mdf:     { face: [8, 8],   edge: [8, 8],    end: [8, 8] },
};

export interface FacePlan {
  kind: GrainKind;
  /** True when the drawn texture must be turned a quarter turn to follow the grain. */
  swap: boolean;
  /** The world axes carrying the drawn texture's u and v, after any swap. */
  axes: [Axis, Axis];
  /**
   * Inches per tile along the drawn u and v.
   *
   * A FIT axis resolves to the BOARD's extent on that axis, which is what
   * makes "show the whole tile" and "tile every N inches" one formula:
   * u = coordinate / tileInches. It is also why a sub-box of a board shows
   * the fraction of the tile it actually occupies — fitting the tile to the
   * sub-box instead would squeeze plywood's whole ply stack into the stock
   * that survived a dado.
   */
  tileInches: [number, number];
  /** Whether each axis (u, v) is FIT — the per-board offset is zeroed there. */
  fit: [boolean, boolean];
}

export function facePlans(board: Board): FacePlan[] {
  const extents = boardExtents(board);
  const dims = axisDimensions(board);
  const kinds = faceGrainKinds(board);
  const tiles = TILES[grainFamily(board.material)];
  const rank = ranks(board);

  return FACE_AXES.map(([gu, gv], face) => {
    const kind = kinds[face];
    const swap = rank[dims[gv]] < rank[dims[gu]];
    const [du, dv] = swap ? [gv, gu] : [gu, gv];
    const [tu, tv] = tiles[kind];
    return {
      kind,
      swap,
      axes: [du, dv] as [Axis, Axis],
      tileInches: [
        tu === FIT ? extents[du] : tu,
        tv === FIT ? extents[dv] : tv,
      ],
      fit: [tu === FIT, tv === FIT],
    };
  });
}

/** BoxGeometry emits four vertices per face, with these default UVs. */
const CORNERS: Array<[number, number]> = [[0, 1], [1, 1], [0, 0], [1, 0]];

/**
 * The `uv` attribute for one solid of a board: 48 floats, four (u, v) pairs per
 * face in BoxGeometry's own vertex order.
 *
 * UVs are PARENT-RELATIVE. A solid's coordinates are looked up in the board's
 * tiling, not in its own, so the figure runs continuously across a dado instead
 * of restarting at it — which is what makes a cut read as stock removed from
 * one board rather than two boards pushed together. Passing no solid gives the
 * whole board, identical to what this returned before joinery existed.
 *
 * The per-board offset stays the BOARD's (invariant 12) for the same reason. A
 * per-solid offset would break exactly the continuity this exists to get.
 */
export function boardUVs(board: Board, solid: Region = wholeBoard(board)): Float32Array {
  const plans = facePlans(board);
  const dims = axisDimensions(board);
  const [ou, ov] = boardUVOffset(board.id);
  const uv = new Float32Array(48);
  let i = 0;
  for (const plan of plans) {
    const spans = plan.axes.map((axis) => solid[dims[axis]]) as [Span, Span];
    for (const [cu, cv] of CORNERS) {
      const [fu, fv] = plan.swap ? [cv, cu] : [cu, cv];
      const at = (f: number, s: Span, tile: number, off: number, isFit: boolean) =>
        (s[0] + f * (s[1] - s[0])) / tile + (isFit ? 0 : off);
      uv[i++] = at(fu, spans[0], plan.tileInches[0], ou, plan.fit[0]);
      uv[i++] = at(fv, spans[1], plan.tileInches[1], ov, plan.fit[1]);
    }
  }
  return uv;
}

/**
 * Everything boardUVs reads, as one string.
 *
 * BoardMesh memoises the geometry that carries the UV attribute, and a memo
 * keyed on a hand-written list of fields goes stale the moment boardUVs learns
 * to read a new one. That is not hypothetical: `grain` was added in v3 and the
 * list was not updated, so a board's grain silently stopped turning on screen
 * while the document was correct. Keying the memo on this instead means the
 * list lives next to the code that decides it.
 *
 * Walked from boardUVs itself: facePlans reads boardExtents (length, width,
 * thickness), axisDimensions (rotation, posture), faceGrainKinds (grain,
 * posture, rotation), grainFamily (material) and ranks (grain); boardUVs
 * itself also reads id via boardUVOffset, and board.cuts via the `solid`
 * argument BoardMesh derives from them. `position` and `name` are
 * deliberately absent — boardUVs never reads them, and a board being dragged
 * must not rebuild its geometry every frame.
 */
export function boardUVSignature(board: Board): string {
  return [
    board.id,
    board.rotation,
    board.posture,
    board.material,
    board.grain,
    board.length,
    board.width,
    board.thickness,
    // Cuts change which solids exist and therefore which sub-ranges are
    // asked for. v3 shipped a bug of exactly this shape — `grain` was added
    // to what boardUVs reads without updating BoardMesh's memo, so grain
    // silently stopped turning on screen while the document stayed correct.
    board.cuts
      .map((c) => [c.face, c.from, c.across, c.offset, c.width, c.depth].join(','))
      .join(';'),
  ].join('|');
}

/**
 * A per-board offset into the shared texture, so two pine parts sitting edge to
 * edge do not read as clones. Derived from the id rather than drawn at random:
 * the same board must offset the same way on every load. FNV-1a, which is
 * plenty for shuffling a texture.
 */
export function boardUVOffset(id: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return [
    (h >>> 0) / 4294967296,
    (Math.imul(h ^ 0x9e3779b9, 48271) >>> 0) / 4294967296,
  ];
}
