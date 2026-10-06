import type { Board, Shape, ShapedBoard, SloydDocument, StoredBoard } from './types';

/** A stored part that uses a Shape. A plain part always has `length`; a shaped one never does. */
export function isShaped(b: StoredBoard): b is ShapedBoard {
  return !('length' in b);
}

export function shapeMap(doc: Pick<SloydDocument, 'shapes'>): Map<string, Shape> {
  return new Map(doc.shapes.map((s) => [s.id, s]));
}

/**
 * THE place a shape is read into a part (components spec §2.1). A plain part
 * comes back as the same object; a shaped part as a full Board carrying
 * `shape`, its cuts copied so no two parts hold one Cut object. Null when the
 * shape is missing (the load repair drops such a part).
 */
export function resolveBoard(shapes: ReadonlyMap<string, Shape>, b: StoredBoard): Board | null {
  if (!isShaped(b)) return b;
  const s = shapes.get(b.shape);
  if (!s) return null;
  return {
    id: b.id, name: b.name, position: b.position, rotation: b.rotation,
    length: s.length, width: s.width, thickness: s.thickness,
    material: s.material, grain: s.grain, posture: s.posture,
    cuts: s.cuts.map((c) => ({ ...c })),
    shape: b.shape,
  };
}
