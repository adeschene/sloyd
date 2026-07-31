import { boardExtents, DIMENSION_ORDER } from '../document/document';
import type { Board } from '../document/document';
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
 * That reasoning only holds for solid wood, where the grain figure is drawn
 * on the board itself. A sheet good's plies are a property of the *sheet*,
 * not of the figure on its face — they always stack across the sheet
 * thickness, whatever the grain says. Promoting the grain dimension for
 * plywood or MDF is wrong exactly when grain === 'thickness': that pushes
 * thickness to rank 0 instead of leaving it last, and the ply stack lands on
 * the board's width or length instead of its true thickness. So sheet goods
 * always use the unmodified [length, width, thickness] fallback order — a
 * sheet's construction does not rotate with its veneer.
 */
function ranks(board: Board): Record<Dimension, number> {
  const order = grainFamily(board.material) === 'wood'
    ? [board.grain, ...DIMENSION_ORDER.filter((d) => d !== board.grain)]
    : DIMENSION_ORDER;
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
  /** How many tiles cover this face, along the drawn texture's u and v. */
  repeat: [number, number];
  /**
   * Whether each axis (u, v) is FIT — the whole tile is shown regardless of
   * face size. The per-board offset must be zeroed on a FIT axis: the whole
   * tile is shown either way, so the offset buys no variation and only
   * shifts the pattern's seam into the middle of the face.
   */
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
      repeat: [tileCount(extents[du], tu), tileCount(extents[dv], tv)],
      fit: [tu === FIT, tv === FIT],
    };
  });
}

function tileCount(extent: number, tile: Tile): number {
  return tile === FIT ? 1 : extent / tile;
}

/** BoxGeometry emits four vertices per face, with these default UVs. */
const CORNERS: Array<[number, number]> = [[0, 1], [1, 1], [0, 0], [1, 0]];

/**
 * The `uv` attribute for a board's box: 48 floats, four (u, v) pairs per face in
 * BoxGeometry's own vertex order.
 *
 * Everything that varies per board lives here rather than on the texture. The
 * textures are shared by every board on screen and are never mutated; this
 * array is rebuilt and disposed with the geometry.
 */
export function boardUVs(board: Board): Float32Array {
  const plans = facePlans(board);
  const [ou, ov] = boardUVOffset(board.id);
  const uv = new Float32Array(48);
  let i = 0;
  for (const plan of plans) {
    for (const [cu, cv] of CORNERS) {
      const [u, v] = plan.swap ? [cv, cu] : [cu, cv];
      uv[i++] = u * plan.repeat[0] + (plan.fit[0] ? 0 : ou);
      uv[i++] = v * plan.repeat[1] + (plan.fit[1] ? 0 : ov);
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
 * itself also reads id via boardUVOffset. `position` and `name` are
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
