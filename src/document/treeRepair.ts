import type { Definition, Instance, SloydDocument, StoredBoard } from './types';
import { nextId } from './ids';
import { dedupeNames } from './names';
import { isShaped } from './shapes';
import type { Container } from './tree';

/** One container's names deduped across its parts AND assemblies (invariant 8, restated). */
function dedupeContainer(c: Container): Container {
  const items = dedupeNames<StoredBoard | Instance>([...c.boards, ...c.instances]);
  return { boards: items.slice(0, c.boards.length) as StoredBoard[], instances: items.slice(c.boards.length) as Instance[] };
}

/**
 * Load steps 2–4 and 6–8 (components spec §2.3), on validated definitions
 * whose ids are already unique (step 1 is validateDefinitions'). Walks from
 * the root:
 * - an instance naming a missing definition is dropped (2);
 * - one whose definition is already on the current path is dropped (3);
 * - a second reference: for a file below v11 (`copyShared`) it gets a copy
 *   under a fresh id, its nested definitions copied in turn, because such a
 *   file could not have meant to share; from v11 on it names the SAME
 *   definition, fixed once (4);
 * - only reached definitions survive (6);
 * - names are deduped per container (8).
 * References point only at definition ids and a duplicate definition id is
 * dropped, never re-minted, so no reference is ever rewritten (invariant 33's
 * two-pass rewrite is not needed). The numbers are the spec's, not the run
 * order: after this come `dropUnresolved` (5, a part naming a missing shape),
 * `pruneShapes` (6, for shapes) and `dissolveShapes` (7), in that order.
 */
export function repairTree(doc: SloydDocument, opts: { copyShared: boolean }): SloydDocument {
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const used = new Set<string>();
  const fixed = new Map<string, Definition>();
  const fix = (c: Container, onPath: ReadonlySet<string>): Container => {
    const instances: Instance[] = [];
    for (const inst of c.instances) {
      const d = defs.get(inst.definition);
      // The cycle test comes BEFORE the memo: a definition on the current path
      // is not fixed yet, and naming it would close a loop.
      if (!d || onPath.has(d.id)) continue;
      if (used.has(d.id) && !opts.copyShared) {
        // Sharing (v11): every definition reached is fixed when its first
        // reference finishes, and the cycle test above means one on the path
        // is never reached here, so the memo already holds it.
        instances.push(inst);
        continue;
      }
      const id = used.has(d.id) ? nextId() : d.id;
      used.add(id);
      const inner = dedupeContainer(fix(d, new Set([...onPath, d.id])));
      fixed.set(id, { id, boards: inner.boards, instances: inner.instances });
      instances.push(inst.definition === id ? inst : { ...inst, definition: id });
    }
    return { boards: c.boards, instances };
  };
  const root = dedupeContainer(fix(doc, new Set()));
  const kept = doc.definitions.filter((d) => fixed.has(d.id)).map((d) => fixed.get(d.id)!);
  const copies = [...fixed.values()].filter((d) => !defs.has(d.id));
  return { ...doc, boards: root.boards, instances: root.instances, definitions: [...kept, ...copies] };
}

/**
 * Step 5 (components spec §2.3): a shaped part naming a missing shape is
 * dropped. The shape is its only source of size, so it has no geometry to keep,
 * and a saved document must always open. Definitions are NOT removed for being
 * left empty. Names were deduped by repairTree; dropping cannot collide them.
 */
export function dropUnresolved(doc: SloydDocument): SloydDocument {
  const ids = new Set(doc.shapes.map((s) => s.id));
  const keep = (bs: StoredBoard[]) => bs.filter((b) => !isShaped(b) || ids.has(b.shape));
  return { ...doc, boards: keep(doc.boards), definitions: doc.definitions.map((d) => ({ ...d, boards: keep(d.boards) })) };
}
