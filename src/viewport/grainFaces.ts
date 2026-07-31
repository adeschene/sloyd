import type { Board } from '../document/document';
import { axisDimensions } from '../document/document';
import type { Dimension } from '../document/document';

export { axisDimensions };
export type { Dimension };

/** Which cut of the wood a face shows. */
export type GrainKind = 'face' | 'edge' | 'end';

/** How a material is drawn. Species differ in colour, not in grain structure. */
export type GrainFamily = 'wood' | 'plywood' | 'mdf';

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
