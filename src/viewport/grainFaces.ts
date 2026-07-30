import type { Board } from '../document/document';

/** Which cut of the wood a face shows. */
export type GrainKind = 'face' | 'edge' | 'end';

/** How a material is drawn. Species differ in colour, not in grain structure. */
export type GrainFamily = 'wood' | 'plywood' | 'mdf';

/** One of a board's three dimensions. */
export type Dimension = 'length' | 'width' | 'thickness';

/**
 * Which board dimension runs along each world axis, as [X, Y, Z].
 *
 * This mirrors boardExtents — standing resolves first, then rotation — and the
 * two must stay in step. A test asserts the agreement directly, because a
 * disagreement would paint end grain on a face without anything else noticing.
 */
export function axisDimensions(board: Board): [Dimension, Dimension, Dimension] {
  const turned = board.rotation === 90;
  if (board.standing) {
    return turned
      ? ['thickness', 'width', 'length']
      : ['length', 'width', 'thickness'];
  }
  return turned
    ? ['width', 'thickness', 'length']
    : ['length', 'thickness', 'width'];
}

/**
 * The grain kind on each of a box's six faces, in BoxGeometry's material-group
 * order: +X, -X, +Y, -Y, +Z, -Z.
 *
 * One fact drives all of it: the kind on a face is decided by which dimension
 * runs along its normal. Length along the normal means you are looking at the
 * cut ends of the fibres, so it is end grain; width means edge grain; thickness
 * means the broad face.
 */
const KIND: Record<Dimension, GrainKind> = {
  length: 'end',
  width: 'edge',
  thickness: 'face',
};

export function faceGrainKinds(board: Board): GrainKind[] {
  const [x, y, z] = axisDimensions(board);
  return [KIND[x], KIND[x], KIND[y], KIND[y], KIND[z], KIND[z]];
}

/**
 * Sheet goods are drawn differently from solid stock; every species is the same
 * structure in a different colour, which is why the tint stays in MATERIALS and
 * this returns only three families. An unknown material reads as wood, matching
 * validateBoard's habit of degrading rather than throwing.
 */
export function grainFamily(material: string): GrainFamily {
  if (material === 'plywood') return 'plywood';
  if (material === 'mdf') return 'mdf';
  return 'wood';
}
