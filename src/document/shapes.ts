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

/** Stored users per shape id (a part placed by several copies counts once). */
export function shapeUsers(doc: Pick<SloydDocument, 'boards' | 'definitions'>): Map<string, number> {
  const n = new Map<string, number>();
  for (const b of [...doc.boards, ...doc.definitions.flatMap((d) => d.boards)]) {
    if (isShaped(b)) n.set(b.shape, (n.get(b.shape) ?? 0) + 1);
  }
  return n;
}

export function pruneShapes(doc: SloydDocument): SloydDocument {
  const used = shapeUsers(doc);
  const kept = doc.shapes.filter((s) => used.has(s.id));
  return kept.length === doc.shapes.length ? doc : { ...doc, shapes: kept };
}

/** A resolved part as a stored plain part: no `shape` key. */
export function plainOf(b: Board): Board {
  const { shape: _shape, ...rest } = b;
  return rest;
}

/** A shape with ONE stored user is not shared: the user becomes plain (cut ids kept). */
export function dissolveShapes(doc: SloydDocument): SloydDocument {
  const used = shapeUsers(doc);
  const lone = new Set([...used].filter(([, n]) => n === 1).map(([id]) => id));
  if (lone.size === 0) return doc;
  const shapes = shapeMap(doc);
  const fix = (bs: StoredBoard[]) => bs.map((b) => (isShaped(b) && lone.has(b.shape) ? plainOf(resolveBoard(shapes, b)!) : b));
  return pruneShapes({ ...doc, boards: fix(doc.boards), definitions: doc.definitions.map((d) => ({ ...d, boards: fix(d.boards) })) });
}
