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

/** Each definition once, in first-placement order (instance preorder = worldParts order). */
export function planAssemblies(doc: SloydDocument): PlanAssembly[] {
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const counts = placementsOf(doc);
  const out = new Map<string, PlanAssembly>();
  const walk = (c: { boards: StoredBoard[]; instances: Instance[] }, prefix: string, parity: boolean, onPath: Set<string>) => {
    for (const inst of c.instances) {
      const d = defs.get(inst.definition);
      if (!d || onPath.has(d.id)) continue;
      const title = prefix + inst.name;
      const mirrored = parity !== (inst.mirrored === true);
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
  return [...out.values()].filter((a) => a.parts.length > 0);
}
