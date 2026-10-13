import type { Board, Shape, SloydDocument, StoredBoard } from './types';
import { nextId } from './ids';
import { sameShared, sharedOf } from './links';
import { worldParts, partAt } from './tree';

/**
 * The ONE label→shape builder (invariant 45), with two callers: the v10 -> v11
 * step (components spec §2.4), whose labels are `link` values, and generation's
 * `linkByRole` (generate-assemblies spec §4), whose labels are role classes.
 * Each label becomes ONE Shape built
 * from its FIRST member in worldParts order; a member equal to it (exactly,
 * cuts in order by id and geometry, invariant 18) becomes a shaped part keeping
 * id, name, position and turn; a differing member stays plain, unlinked, which
 * is what repairLinks did. Nothing moves here: no position or turn is recomputed (its caller linkByRole may re-turn parts before calling it).
 *
 * `legacy` maps each STORED part object to its label (the v10 step passes the
 * map validateBoard filled from `link`; linkByRole builds its own from role
 * classes), so this must run before anything replaces those objects (repairTree's name
 * dedupe does). A v10 definition placed twice is visited once per placement
 * but converted once: `convert` is keyed by the stored object.
 */
export function linksToShapes(doc: SloydDocument, legacy: Map<StoredBoard, string>): SloydDocument {
  if (legacy.size === 0) return doc;
  const first = new Map<string, Board>();         // label -> reference member
  const shapes: Shape[] = [];
  const shapeOf = new Map<string, string>();      // label -> shape id
  const convert = new Map<StoredBoard, string>(); // stored part -> shape id
  const judged = new Set<StoredBoard>();
  for (const w of worldParts(doc)) {
    const stored = partAt(doc, w.id);
    const label = stored ? legacy.get(stored) : undefined;
    if (!stored || label === undefined || judged.has(stored)) continue;
    judged.add(stored);
    const ref = first.get(label);
    if (!ref) {
      first.set(label, w);
      const s: Shape = { id: nextId(), ...sharedOf(w) };
      shapes.push(s);
      shapeOf.set(label, s.id);
      convert.set(stored, s.id);
    } else if (sameShared(ref, w)) {
      convert.set(stored, shapeOf.get(label)!);
    }
  }
  const fix = (bs: StoredBoard[]) => bs.map((b): StoredBoard => {
    const id = convert.get(b);
    return id === undefined ? b : { id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: id };
  });
  return {
    ...doc,
    shapes: [...doc.shapes, ...shapes],
    boards: fix(doc.boards),
    definitions: doc.definitions.map((d) => ({ ...d, boards: fix(d.boards) })),
  };
}
