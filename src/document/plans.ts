import type { Board, Instance, SloydDocument, StoredBoard } from './types';
import { NAME_SEPARATOR, partsBelow, placementsOf } from './tree';

/** One assembly drawing on the plans sheet (spec §5.2 item 3). */
export interface PlanAssembly {
  definition: string;
  /** The first placement's flat display path, e.g. "Cabinet › Drawer". */
  title: string;
  /** Instance PATHS naming the definition (a nested one counts per placement of its parent). */
  copies: number;
  /** Placements reflected an odd number of times along their path. */
  mirroredCopies: number;
  /** The definition's parts in its OWN frame. */
  parts: Board[];
}

/**
 * Each definition once, in first-placement order (instance preorder = worldParts order). A definition
 * every one of whose placements is the ONLY child of its container is skipped (fu 264): its drawing
 * would repeat the one above it (the whole piece, for a root-level wrapper). Its own sub-assemblies
 * are still listed, titled through it.
 */
export function planAssemblies(doc: SloydDocument): PlanAssembly[] {
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const counts = placementsOf(doc);
  const out = new Map<string, PlanAssembly>();
  const repeatsParent = new Map<string, boolean>(); // definition id -> every placement so far is a sole child
  const walk = (c: { boards: StoredBoard[]; instances: Instance[] }, prefix: string, parity: boolean, onPath: Set<string>) => {
    for (const inst of c.instances) {
      const d = defs.get(inst.definition);
      if (!d || onPath.has(d.id)) continue;
      const title = prefix + inst.name;
      const mirrored = parity !== (inst.mirrored === true);
      const sole = c.boards.length + c.instances.length === 1;
      repeatsParent.set(d.id, (repeatsParent.get(d.id) ?? true) && sole);
      let entry = out.get(d.id);
      if (!entry) {
        entry = { definition: d.id, title, copies: counts.get(d.id) ?? 1, mirroredCopies: 0, parts: partsBelow(doc, d) };
        out.set(d.id, entry);
      }
      if (mirrored) entry.mirroredCopies += 1;
      walk(d, title + NAME_SEPARATOR, mirrored, new Set([...onPath, d.id]));
    }
  };
  walk(doc, '', false, new Set());
  return [...out.values()].filter((a) => a.parts.length > 0 && !repeatsParent.get(a.definition));
}
