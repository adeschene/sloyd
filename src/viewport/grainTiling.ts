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
 */
function ranks(board: Board): Record<Dimension, number> {
  const order = [board.grain, ...DIMENSION_ORDER.filter((d) => d !== board.grain)];
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
  wood:    { face: [16, 10], edge: [16, 4],   end: [FIT, FIT] },
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
