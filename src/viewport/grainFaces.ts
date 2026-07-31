import type { Board } from '../document/document';
import { axisDimensions, isSheetGood } from '../document/document';
import type { Dimension } from '../document/document';

export { axisDimensions };
export type { Dimension };

/** Which cut of the wood a face shows. */
export type GrainKind = 'face' | 'edge' | 'end';

/** How a material is drawn. Species differ in colour, not in grain structure. */
export type GrainFamily = 'wood' | 'plywood' | 'mdf';

/**
 * Which face carries the broad flatsawn figure, in preference order. Whichever
 * of these is not the grain dimension gets face grain; the remaining dimension
 * gets edge grain.
 */
const FACE_PRECEDENCE: Dimension[] = ['thickness', 'width', 'length'];

/**
 * The grain kind on each of a box's six faces, in BoxGeometry's material-group
 * order: +X, -X, +Y, -Y, +Z, -Z.
 *
 * The face whose normal runs along the grain shows the cut ends of the fibres,
 * so it is end grain. Of the other two, the broad one shows flatsawn face grain
 * and the last shows quartersawn edge grain.
 *
 * With grain along the length — every board before v3 — this reduces to the old
 * fixed map: end on length, face on thickness, edge on width.
 */
export function faceGrainKinds(board: Board): GrainKind[] {
  const faceDim = FACE_PRECEDENCE.find((d) => d !== board.grain)!;
  const kindOf = (d: Dimension): GrainKind =>
    d === board.grain ? 'end' : d === faceDim ? 'face' : 'edge';
  const [x, y, z] = axisDimensions(board);
  return [kindOf(x), kindOf(x), kindOf(y), kindOf(y), kindOf(z), kindOf(z)];
}

/**
 * Sheet goods are drawn differently from solid stock; every species is the same
 * structure in a different colour, which is why the tint stays in MATERIALS and
 * this returns only three families. An unknown material reads as wood, matching
 * validateBoard's habit of degrading rather than throwing.
 *
 * `isSheetGood` (document/types.ts) is the single source of truth for which
 * materials are sheet goods — this only adds the plywood/MDF split on top of
 * it, rather than restating the material names as a second list that could
 * drift from MATERIALS' `sheet` flags.
 */
export function grainFamily(material: string): GrainFamily {
  if (!isSheetGood(material)) return 'wood';
  return material === 'plywood' ? 'plywood' : 'mdf';
}
