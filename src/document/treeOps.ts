import type { Definition, Instance, Rotation, SloydDocument, StoredBoard } from './types';
import { dissolveShapes, isShaped, pruneShapes, resolveBoard, shapeMap } from './shapes';
import { nextId } from './ids';
import { uniqueName } from './names';
import type { Named } from './names';
import { boardsBounds } from './geometry';
import { placeBoard, placeInstance } from './frames';
import type { Container } from './tree';
import { containerAt, definitionAt, instanceAt, itemPaths, joinPath, lastSegment, parentPath, partsBelow } from './tree';
import { updateContainer } from './treeEdit';

export type Rekey = (path: string) => string;

export function siblingsOf(doc: SloydDocument, path: string | null): Named[] {
  const c = containerAt(doc, path);
  return c ? [...c.boards, ...c.instances] : [];
}

/** `Assembly N`, the first N from 1 free among the siblings (spec §2.3). */
export function nextAssemblyName(siblings: readonly Named[]): string {
  const taken = new Set(siblings.map((s) => s.name));
  let n = 1;
  while (taken.has(`Assembly ${n}`)) n += 1;
  return `Assembly ${n}`;
}

export function insertItems(
  doc: SloydDocument, path: string | null,
  add: { boards?: StoredBoard[]; instances?: Instance[]; definitions?: Definition[] },
): SloydDocument {
  const withDefs = add.definitions?.length ? { ...doc, definitions: [...doc.definitions, ...add.definitions] } : doc;
  return updateContainer(withDefs, path, (c) => ({
    boards: [...c.boards, ...(add.boards ?? [])],
    instances: [...c.instances, ...(add.instances ?? [])],
  }));
}

/** Keep only definitions reachable from the root, in their existing order. */
export function pruneDefinitions(doc: SloydDocument): SloydDocument {
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const reached = new Set<string>();
  const walk = (c: Container) => {
    for (const i of c.instances) {
      if (reached.has(i.definition)) continue;
      const d = defs.get(i.definition);
      if (!d) continue;
      reached.add(d.id);
      walk(d);
    }
  };
  walk(doc);
  if (reached.size === doc.definitions.length) return doc;
  return { ...doc, definitions: doc.definitions.filter((d) => reached.has(d.id)) };
}

export function removeItems(doc: SloydDocument, paths: readonly string[]): SloydDocument {
  const byContainer = new Map<string | null, Set<string>>();
  for (const p of paths) {
    const c = parentPath(p);
    if (!byContainer.has(c)) byContainer.set(c, new Set());
    byContainer.get(c)!.add(lastSegment(p));
  }
  let out = doc;
  for (const [c, ids] of byContainer) {
    out = updateContainer(out, c, (k) => ({
      boards: k.boards.filter((b) => !ids.has(b.id)),
      instances: k.instances.filter((i) => !ids.has(i.id)),
    }));
  }
  return dissolveShapes(pruneShapes(pruneDefinitions(dropEmptied(doc, out))));
}

const isEmpty = (c: Container) => c.boards.length === 0 && c.instances.length === 0;

/**
 * Drop every placement of a definition `after` has emptied, one that held
 * something `before` (fu 226): an assembly whose last part was deleted goes
 * with it, in every copy, and a level left holding only emptied assemblies
 * goes in turn. A definition that was ALREADY empty is not the delete's doing
 * and stays (a file may hold one; the row can still be deleted by hand).
 */
function dropEmptied(before: SloydDocument, after: SloydDocument): SloydDocument {
  const heldBefore = new Set(before.definitions.filter((d) => !isEmpty(d)).map((d) => d.id));
  let out = after;
  for (;;) {
    const emptied = new Set(out.definitions.filter((d) => isEmpty(d) && heldBefore.has(d.id)).map((d) => d.id));
    const keep = (i: Instance) => !emptied.has(i.definition);
    if (out.instances.every(keep) && out.definitions.every((d) => d.instances.every(keep))) return out;
    out = {
      ...out,
      instances: out.instances.filter(keep),
      definitions: out.definitions.map((d) => (d.instances.every(keep) ? d : { ...d, instances: d.instances.filter(keep) })),
    };
  }
}

const rekeyer = (pairs: ReadonlyArray<readonly [string, string]>): Rekey => (p) => {
  for (const [from, to] of pairs) {
    if (p === from) return to;
    if (p.startsWith(`${from}/`)) return to + p.slice(from.length);
  }
  return p;
};

/**
 * Every occurrence path of `container` (components spec §4.2): the root has
 * one, null; an assembly's container is its DEFINITION, so every instance path
 * naming that definition, anywhere in the document, places it. A definition
 * cannot contain itself, so no placement is a prefix of another.
 */
export function containerPlacements(doc: SloydDocument, container: string | null): Array<string | null> {
  if (container === null) return [null];
  const def = instanceAt(doc, container)?.definition;
  if (def === undefined) return [container];
  return [...itemPaths(doc)].filter((p) => instanceAt(doc, p)?.definition === def);
}

/**
 * A re-key for an edit inside `container`, from pairs RELATIVE to it, applied
 * under EVERY placement of the container: an edit inside a shared definition
 * changes the paths under every copy, not only the one the user opened.
 */
const rekeyEverywhere = (
  doc: SloydDocument, container: string | null,
  rel: ReadonlyArray<readonly [string, string]>,
): Rekey => rekeyer(containerPlacements(doc, container).flatMap((at) =>
  rel.map(([from, to]) => [joinPath(at, from), joinPath(at, to)] as const)));

/**
 * Group direct children of `container` into a new assembly (spec §4.1). The
 * new frame is the identity, so every stored value is untouched and nothing
 * moves, bit for bit. Null for nothing to group, or a path that is not a
 * direct child.
 */
export function groupItems(doc: SloydDocument, container: string | null, paths: readonly string[]):
  { doc: SloydDocument; path: string; rekey: Rekey } | null {
  const c = containerAt(doc, container);
  if (!c || paths.length === 0 || paths.some((p) => parentPath(p) !== container)) return null;
  const ids = new Set(paths.map(lastSegment));
  const boards = c.boards.filter((b) => ids.has(b.id));
  const instances = c.instances.filter((i) => ids.has(i.id));
  if (boards.length + instances.length !== ids.size) return null;
  const def: Definition = { id: nextId(), boards, instances };
  const keptBoards = c.boards.filter((b) => !ids.has(b.id));
  const keptInstances = c.instances.filter((i) => !ids.has(i.id));
  const inst: Instance = {
    id: nextId(), name: nextAssemblyName([...keptBoards, ...keptInstances]),
    definition: def.id, position: [0, 0, 0], rotation: 0,
  };
  const withDef = { ...doc, definitions: [...doc.definitions, def] };
  const out = updateContainer(withDef, container, () => ({ boards: keptBoards, instances: [...keptInstances, inst] }));
  const path = joinPath(container, inst.id);
  return {
    doc: out, path,
    rekey: rekeyEverywhere(doc, container, paths.map((p) => [lastSegment(p), joinPath(inst.id, lastSegment(p))] as const)),
  };
}

/**
 * Move an instance's children up into its parent (spec §4.1, §10). Parts go
 * through placeBoard, the same one step worldParts takes, so they come out
 * bit-identical; a nested instance's frame is folded with placeInstance. A
 * child id taken in the parent is re-minted, a taken name deduped; the
 * definition is pruned.
 */
export function ungroupItem(doc: SloydDocument, path: string):
  { doc: SloydDocument; children: string[]; rekey: Rekey } | null {
  const inst = instanceAt(doc, path);
  const def = definitionAt(doc, path);
  const container = parentPath(path);
  const c = containerAt(doc, container);
  if (!inst || !def || !c) return null;
  const keptInstances = c.instances.filter((i) => i.id !== inst.id);
  const taken: Named[] = [...c.boards, ...keptInstances];
  const seen = new Set(taken.map((t) => t.id));
  const pairs: Array<readonly [string, string]> = [];
  const fresh = (id: string) => {
    const out = seen.has(id) ? nextId() : id;
    seen.add(out);
    pairs.push([joinPath(inst.id, id), out]);
    return out;
  };
  const shapes = shapeMap(doc);
  const boards = def.boards.flatMap((b): StoredBoard[] => {
    const r = resolveBoard(shapes, b);
    if (!r) return [];
    const placed = { ...placeBoard(inst, r), id: fresh(b.id) };
    const name = uniqueName(b.name, taken);
    // A shaped part stays shaped: own fields from the placed result, the rest from storage.
    const named: StoredBoard = isShaped(b)
      ? { ...b, position: placed.position, rotation: placed.rotation, id: placed.id, name }
      // A plain part gets its own Cut objects: the definition's part, which
      // the other copies still use, keeps its own (makeUniqueItem's rule).
      : { ...placed, name, cuts: placed.cuts.map((c) => ({ ...c })) };
    taken.push(named);
    return [named];
  });
  const instances = def.instances.map((j) => {
    const placed = { ...placeInstance(inst, j), id: fresh(j.id) };
    const named = { ...placed, name: uniqueName(j.name, taken) };
    taken.push(named);
    return named;
  });
  const out = dissolveShapes(pruneShapes(pruneDefinitions(updateContainer(doc, container, (k) => ({
    boards: [...k.boards, ...boards],
    instances: [...keptInstances, ...instances],
  })))));
  return { doc: out, children: pairs.map(([, to]) => joinPath(container, to)), rekey: rekeyEverywhere(doc, container, pairs) };
}

/**
 * Turn an instance to `rotation` about its box centre in the parent's frame,
 * keeping the box's min height: reorientedPosition's rule for a part
 * (invariant 2), for an assembly.
 */
export function turnInstance(doc: SloydDocument, path: string, rotation: Rotation): SloydDocument {
  const inst = instanceAt(doc, path);
  const def = definitionAt(doc, path);
  if (!inst || !def || inst.rotation === rotation) return doc;
  const inner = partsBelow(doc, def);
  const box = (f: Instance) => boardsBounds(inner.map((b) => placeBoard(f, b)));
  const before = box(inst);
  const after = box({ ...inst, rotation });
  const position: [number, number, number] = before && after
    ? [
        inst.position[0] + ((before.min[0] + before.max[0]) - (after.min[0] + after.max[0])) / 2,
        inst.position[1],
        inst.position[2] + ((before.min[2] + before.max[2]) - (after.min[2] + after.max[2])) / 2,
      ]
    : [...inst.position];
  return updateContainer(doc, parentPath(path), (c) => ({
    ...c,
    instances: c.instances.map((i) => (i.id === inst.id ? { ...i, rotation, position } : i)),
  }));
}

export function shareInstance(inst: Instance): Instance {
  return { ...inst, id: nextId(), position: [...inst.position] as [number, number, number] };
}

/** Definition id -> how many instances name it, anywhere in the document. */
export function instanceRefs(doc: SloydDocument): Map<string, number> {
  const n = new Map<string, number>();
  for (const i of [...doc.instances, ...doc.definitions.flatMap((d) => d.instances)]) n.set(i.definition, (n.get(i.definition) ?? 0) + 1);
  return n;
}

/**
 * Make Unique (components spec §3.1): the instance at `path` gets its own copy
 * of its definition, ONE level deep. Plain parts are copied keeping their ids
 * (ids are per container), so occurrence paths, hidden ids and held points are
 * unchanged; shaped parts keep their shape; nested instances keep their
 * definitions. Null when the definition is named by fewer than two instances.
 */
export function makeUniqueItem(doc: SloydDocument, path: string): SloydDocument | null {
  const inst = instanceAt(doc, path);
  const def = definitionAt(doc, path);
  if (!inst || !def || (instanceRefs(doc).get(def.id) ?? 0) < 2) return null;
  const copy: Definition = {
    id: nextId(),
    boards: def.boards.map((b) => (isShaped(b)
      ? { ...b, position: [...b.position] as [number, number, number] }
      : { ...b, position: [...b.position] as [number, number, number], cuts: b.cuts.map((c) => ({ ...c })) })),
    instances: def.instances.map((j) => ({ ...j, position: [...j.position] as [number, number, number] })),
  };
  const withDef = { ...doc, definitions: [...doc.definitions, copy] };
  return updateContainer(withDef, parentPath(path), (c) => ({
    ...c, instances: c.instances.map((i) => (i.id === inst.id ? { ...i, definition: copy.id } : i)),
  }));
}
