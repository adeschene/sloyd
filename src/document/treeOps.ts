import type { Definition, Instance, Rotation, SloydDocument, StoredBoard } from './types';
import { dissolveShapes, isShaped, pruneShapes, resolveBoard, shapeMap } from './shapes';
import { nextId } from './ids';
import { copyCurve } from './curves';
import { copyProfile } from './profiles';
import { copyBand } from './bandModel';
import { copyHoleRow } from './holes';
import { copyAngleCut } from './angleCuts';
import { uniqueName } from './names';
import type { Named } from './names';
import { boardsBounds } from './geometry';
import { placeBoard, placeInstance, rotateVec, withMirror } from './frames';
import type { Container } from './tree';
import { containerAt, definitionAt, instanceAt, itemPaths, joinPath, lastSegment, parentPath, partsBelow } from './tree';
import { updateContainer } from './treeEdit';

export type Rekey = (path: string) => string;
/**
 * The paths an item's path now stands for, or null when it is not one of the
 * items an edit dissolved: Ungroup's assembly, under every placement, lifts to
 * its children there (fu 229).
 */
export type Lift = (path: string) => string[] | null;

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
  { doc: SloydDocument; children: string[]; rekey: Rekey; lift: Lift } | null {
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
    // A shaped part stays shaped: own fields from the placed result, the rest from storage
    // — except through a mirror, whose reflected cuts the Shape does not hold (mirrored-instances spec §5).
    const named: StoredBoard = isShaped(b) && inst.mirrored !== true
      ? { ...b, position: placed.position, rotation: placed.rotation, id: placed.id, name }
      // A plain part gets its own Cut objects: the definition's part, which
      // the other copies still use, keeps its own (makeUniqueItem's rule).
      : { ...placed, name, cuts: placed.cuts.map((c) => ({ ...c })), angleCuts: placed.angleCuts.map(copyAngleCut), holes: placed.holes.map(copyHoleRow), curves: placed.curves.map(copyCurve), profiles: placed.profiles.map(copyProfile), bands: placed.bands.map(copyBand) };
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
  // The ungrouped assembly under EVERY placement of its container (a shared
  // definition is ungrouped in every copy) stands for its lifted children there.
  const lifted = new Map(containerPlacements(doc, container).map((at) =>
    [joinPath(at, inst.id), pairs.map(([, to]) => joinPath(at, to))] as const));
  return {
    doc: out, children: pairs.map(([, to]) => joinPath(container, to)), rekey: rekeyEverywhere(doc, container, pairs),
    lift: (p) => lifted.get(p) ?? null,
  };
}

/** The world box (in the parent's frame) of an assembly's parts placed through `f`. */
function placedBox(doc: SloydDocument, def: Definition, f: Instance) {
  const inner = partsBelow(doc, def);
  return boardsBounds(inner.map((b) => placeBoard(f, b)));
}

/**
 * Replace the instance at `path` by `next` (a turned or mirrored version of
 * it), keeping the placed parts' box centre in X and Z and its min height:
 * reorientedPosition's rule for a part (invariant 2), for an assembly. `next`'s
 * own position is replaced. An assembly with no parts keeps its position.
 */
function replaceKeepingBox(doc: SloydDocument, path: string, next: Instance): SloydDocument {
  const inst = instanceAt(doc, path)!;
  const def = definitionAt(doc, path)!;
  const before = placedBox(doc, def, inst);
  const after = placedBox(doc, def, next);
  const position: [number, number, number] = before && after
    ? [
        inst.position[0] + ((before.min[0] + before.max[0]) - (after.min[0] + after.max[0])) / 2,
        inst.position[1],
        inst.position[2] + ((before.min[2] + before.max[2]) - (after.min[2] + after.max[2])) / 2,
      ]
    : [...inst.position];
  return updateContainer(doc, parentPath(path), (c) => ({
    ...c,
    instances: c.instances.map((i) => (i.id === inst.id ? { ...next, position } : i)),
  }));
}

/** Turn an instance to `rotation` about its box centre, keeping the box's min height (replaceKeepingBox). */
export function turnInstance(doc: SloydDocument, path: string, rotation: Rotation): SloydDocument {
  const inst = instanceAt(doc, path);
  if (!inst || !definitionAt(doc, path) || inst.rotation === rotation) return doc;
  return replaceKeepingBox(doc, path, { ...inst, rotation });
}

/**
 * Flip an assembly placement's mirror (mirrored-instances spec §5), keeping its
 * world box (replaceKeepingBox), exact because the mirror-aware placeBoard
 * reflects the box onto a box of the same extents. Same doc for a no-op.
 */
export function setMirrored(doc: SloydDocument, path: string, mirrored: boolean): SloydDocument {
  const inst = instanceAt(doc, path);
  if (!inst || !definitionAt(doc, path) || (inst.mirrored === true) === mirrored) return doc;
  return replaceKeepingBox(doc, path, withMirror(inst, mirrored));
}

/**
 * Copy mirrored (spec §5): a shared copy with the OPPOSITE flag whose world box
 * abuts the original's on the original's local +X side (turned with it), the
 * other two axes matching. Named among its siblings. Null when nothing resolves.
 */
export function mirroredCopy(doc: SloydDocument, path: string): { doc: SloydDocument; path: string } | null {
  const inst = instanceAt(doc, path);
  const def = definitionAt(doc, path);
  const container = parentPath(path);
  const c = containerAt(doc, container);
  if (!inst || !def || !c) return null;
  const draft = withMirror(shareInstance(inst), inst.mirrored !== true);
  const a = placedBox(doc, def, inst);
  const b = placedBox(doc, def, draft);
  const position: [number, number, number] = [...inst.position];
  if (a && b) {
    const dir = rotateVec(inst.rotation, [1, 0, 0]);
    const axis = dir[0] !== 0 ? 0 : 2;
    for (const k of [0, 1, 2]) {
      const shift = k !== axis ? a.min[k]! - b.min[k]!
        : dir[axis]! > 0 ? a.max[k]! - b.min[k]! : a.min[k]! - b.max[k]!;
      position[k] = inst.position[k]! + shift;
    }
  }
  const copy: Instance = { ...draft, position, name: uniqueName(inst.name, [...c.boards, ...c.instances]) };
  return { doc: insertItems(doc, container, { instances: [copy] }), path: joinPath(container, copy.id) };
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
      : { ...b, position: [...b.position] as [number, number, number], cuts: b.cuts.map((c) => ({ ...c })), angleCuts: b.angleCuts.map(copyAngleCut), holes: b.holes.map(copyHoleRow), curves: b.curves.map(copyCurve), profiles: b.profiles.map(copyProfile), bands: b.bands.map(copyBand) })),
    instances: def.instances.map((j) => ({ ...j, position: [...j.position] as [number, number, number] })),
  };
  const withDef = { ...doc, definitions: [...doc.definitions, copy] };
  return updateContainer(withDef, parentPath(path), (c) => ({
    ...c, instances: c.instances.map((i) => (i.id === inst.id ? { ...i, definition: copy.id } : i)),
  }));
}
