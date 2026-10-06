import type { Definition, Instance, SloydDocument, StoredBoard } from './types';
import { nextId } from './ids';
import { dedupeNames } from './names';
import type { Container } from './tree';

/** One container's names deduped across its parts AND assemblies (invariant 8, restated). */
function dedupeContainer(c: Container): Container {
  const items = dedupeNames<StoredBoard | Instance>([...c.boards, ...c.instances]);
  return { boards: items.slice(0, c.boards.length) as StoredBoard[], instances: items.slice(c.boards.length) as Instance[] };
}

/**
 * Load steps 2–6 (spec §2.4), on validated definitions whose ids are already
 * unique (step 1 is validateDefinitions'). Walks from the root:
 * - an instance naming a missing definition is dropped (2);
 * - one whose definition is already on the current path is dropped (3);
 * - a second reference gets a copy under a fresh id, its nested definitions
 *   copied in turn (4);
 * - only reached definitions survive (5);
 * - names are deduped per container (6).
 * References point only at definition ids and a duplicate definition id is
 * dropped, never re-minted, so no reference is ever rewritten (invariant 33's
 * two-pass rewrite is not needed).
 */
export function repairTree(doc: SloydDocument): SloydDocument {
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const used = new Set<string>();
  const fixed = new Map<string, Definition>();
  const fix = (c: Container, onPath: ReadonlySet<string>): Container => {
    const instances: Instance[] = [];
    for (const inst of c.instances) {
      const d = defs.get(inst.definition);
      if (!d || onPath.has(d.id)) continue;
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
