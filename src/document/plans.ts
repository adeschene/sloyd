import type { Board, Instance, SloydDocument, StoredBoard } from './types';
import { NAME_SEPARATOR, PATH_SEPARATOR, partsBelow, placementsOf } from './tree';
import { ROOT_STORAGE_ID } from './treeEdit';

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
  /** The ids among `parts` whose features THIS trio keys (feature callouts spec §2.1): a part is keyed by the innermost
   *  listed assembly on its path, so a deeper listed definition's parts are left to its own trio. */
  keyed: ReadonlySet<string>;
}

type Container = { boards: StoredBoard[]; instances: Instance[] };

/** The ids among `parts` (paths relative to `c`, whose id is `cId`) that the trio drawing `c` keys (spec §2.1): walking
 *  each part's path, a LISTED definition below `c` takes the part. A part STORED where an earlier trio already keyed it
 *  (`claimed`: its container's id and its own) is left to that trio, so a never-listed definition under two listed ones is
 *  keyed once, by the first on the sheet (fu 381(4), the user's ruling: "too busy on the plans sheet"). Only assembly trios
 *  can share a stored part: below a container with two or more children every definition is listed, so a part reached
 *  through unlisted ones has ONE path from its trio (no repeat within a trio), and the piece's unlisted chain cannot also
 *  sit under a listed assembly without a cycle. */
function keyedHere(
  doc: SloydDocument, c: Container, cId: string, parts: readonly Board[], listed: ReadonlySet<string>, claimed: Set<string>,
): Set<string> {
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const out = new Set<string>();
  for (const b of parts) {
    let cur: Container = c;
    let at = cId;
    let mine = true;
    const segs = b.id.split(PATH_SEPARATOR);
    for (const seg of segs.slice(0, -1)) {
      const d = defs.get(cur.instances.find((i) => i.id === seg)?.definition ?? '');
      if (!d) break;
      if (listed.has(d.id)) { mine = false; break; }
      cur = d;
      at = d.id;
    }
    const key = `${at}${PATH_SEPARATOR}${segs.at(-1)}`;
    if (mine && !claimed.has(key)) { out.add(b.id); claimed.add(key); }
  }
  return out;
}

/** The ids of the whole piece's parts (`worldParts`) whose features the piece trio keys: those in no listed assembly. */
export function pieceKeyed(doc: SloydDocument, assemblies: readonly PlanAssembly[]): ReadonlySet<string> {
  return keyedHere(doc, doc, ROOT_STORAGE_ID, partsBelow(doc, doc), new Set(assemblies.map((a) => a.definition)), new Set());
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
        entry = { definition: d.id, title, copies: counts.get(d.id) ?? 1, mirroredCopies: 0, parts: partsBelow(doc, d), keyed: new Set() };
        out.set(d.id, entry);
      }
      if (mirrored) entry.mirroredCopies += 1;
      walk(d, title + NAME_SEPARATOR, mirrored, new Set([...onPath, d.id]));
    }
  };
  walk(doc, '', false, new Set());
  const list = [...out.values()].filter((a) => a.parts.length > 0 && !repeatsParent.get(a.definition));
  const listed = new Set(list.map((a) => a.definition));
  const claimed = new Set<string>();
  return list.map((a) => ({ ...a, keyed: keyedHere(doc, defs.get(a.definition)!, a.definition, a.parts, listed, claimed) }));
}
