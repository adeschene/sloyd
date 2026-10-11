import type { Board, Definition, Instance, SloydDocument, StoredBoard, FlatDocument } from './types';
import { isShaped, resolveBoard, shapeMap } from './shapes';
import { IDENTITY_LINEAR, composeLinear, placeBoard } from './frames';
import type { Linear } from './frames';

/** A container's contents: the root (the document itself) or a definition. */
export interface Container { boards: StoredBoard[]; instances: Instance[] }

export const PATH_SEPARATOR = '/';
export const NAME_SEPARATOR = ' › ';

export function joinPath(parent: string | null, id: string): string {
  return parent === null ? id : `${parent}${PATH_SEPARATOR}${id}`;
}
export function parentPath(path: string): string | null {
  const i = path.lastIndexOf(PATH_SEPARATOR);
  return i < 0 ? null : path.slice(0, i);
}
export function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf(PATH_SEPARATOR) + 1);
}

/**
 * True when `path` or one of its ancestor paths is in `ids`: THE membership
 * test for "selected", "hidden" and "grabbed under the selection" since
 * assemblies (spec §3). Walks whole segments, so `i3` covers `i3/b1` and never
 * `i30/b1`. A bare startsWith is the plausible wrong version.
 */
export function isCovered(path: string, ids: ReadonlySet<string>): boolean {
  for (let p: string | null = path; p !== null; p = parentPath(p)) if (ids.has(p)) return true;
  return false;
}

const defsOf = (doc: SloydDocument) => new Map(doc.definitions.map((d) => [d.id, d]));

/** The instances from the root down to the one `path` names, or null. */
export function instancesOn(doc: SloydDocument, path: string): Instance[] | null {
  const defs = defsOf(doc);
  const out: Instance[] = [];
  let c: Container = doc;
  for (const seg of path.split(PATH_SEPARATOR)) {
    const inst = c.instances.find((i) => i.id === seg);
    if (!inst) return null;
    out.push(inst);
    const d = defs.get(inst.definition);
    if (!d) return null;
    c = d;
  }
  return out;
}

export function instanceAt(doc: SloydDocument, path: string): Instance | null {
  return instancesOn(doc, path)?.at(-1) ?? null;
}
export function definitionAt(doc: SloydDocument, path: string): Definition | null {
  const inst = instanceAt(doc, path);
  return inst ? doc.definitions.find((d) => d.id === inst.definition) ?? null : null;
}
export function containerAt(doc: SloydDocument, path: string | null): Container | null {
  return path === null ? doc : definitionAt(doc, path);
}
export function partAt(doc: SloydDocument, occ: string): StoredBoard | null {
  const parent = parentPath(occ);
  return containerAt(doc, parent)?.boards.find((b) => b.id === lastSegment(occ)) ?? null;
}
/** The stored part at `occ`, resolved (its shape read in), in its container's frame. */
export function resolvedPartAt(doc: SloydDocument, occ: string): Board | null {
  const p = partAt(doc, occ);
  return p ? resolveBoard(shapeMap(doc), p) : null;
}
/** The linear part of a container's frame chain from the root (spec §4): turns and mirrors, outermost first. */
export function containerLinear(doc: SloydDocument, path: string | null): Linear {
  if (path === null) return IDENTITY_LINEAR;
  return (instancesOn(doc, path) ?? []).reduce<Linear>((l, i) => composeLinear(l, i), IDENTITY_LINEAR);
}

/**
 * Every part below `c`, in `c`'s frame, ids relative to `c`: c's parts in
 * order, then each instance depth first, placed innermost first, one
 * placeBoard per level (spec §2.1). A definition already on the current path is
 * skipped, so a cycle the load repair missed cannot hang the app.
 */
export function partsBelow(doc: SloydDocument, c: Container, defs = defsOf(doc), onPath = new Set<string>(), shapes = shapeMap(doc)): Board[] {
  const out: Board[] = c.boards.flatMap((b) => resolveBoard(shapes, b) ?? []);
  for (const inst of c.instances) {
    const d = defs.get(inst.definition);
    if (!d || onPath.has(d.id)) continue;
    const inner = partsBelow(doc, d, defs, new Set([...onPath, d.id]), shapes);
    for (const b of inner) out.push(placeBoard(inst, { ...b, id: joinPath(inst.id, b.id) }));
  }
  return out;
}

const worldCache = new WeakMap<SloydDocument, Board[]>();

/**
 * The placed parts, each a self-contained world Board with its occurrence id
 * and its OWN name (spec §2.1, §10). THE flattening: every reader of placed
 * parts reads this or flatDocument, never the tree. Cached per document
 * object, so a useStore selector over it is stable (invariant 43's selector
 * rule), and the document's own `boards` when it has no instances.
 */
export function worldParts(doc: SloydDocument): Board[] {
  if (doc.instances.length === 0 && doc.shapes.length === 0) return doc.boards as Board[];
  const hit = worldCache.get(doc);
  if (hit) return hit;
  const out = partsBelow(doc, doc);
  worldCache.set(doc, out);
  return out;
}

/** The item paths directly in a container: its parts, then its instances. */
export function childrenOf(doc: SloydDocument, path: string | null): string[] {
  const c = containerAt(doc, path);
  if (!c) return [];
  return [...c.boards.map((b) => joinPath(path, b.id)), ...c.instances.map((i) => joinPath(path, i.id))];
}

/** Definition id -> how many instance PATHS name it (a nested instance counts once per placement of its parent). */
export function placementsOf(doc: SloydDocument): Map<string, number> {
  const out = new Map<string, number>();
  const defs = defsOf(doc);
  const walk = (c: Container, onPath: Set<string>) => {
    for (const inst of c.instances) {
      out.set(inst.definition, (out.get(inst.definition) ?? 0) + 1);
      const d = defs.get(inst.definition);
      if (d && !onPath.has(d.id)) walk(d, new Set([...onPath, d.id]));
    }
  };
  walk(doc, new Set());
  return out;
}

/** Every instance path and every part occurrence id. */
export function itemPaths(doc: SloydDocument): Set<string> {
  const out = new Set<string>();
  const defs = defsOf(doc);
  const walk = (c: Container, path: string | null, onPath: Set<string>) => {
    for (const b of c.boards) out.add(joinPath(path, b.id));
    for (const inst of c.instances) {
      const p = joinPath(path, inst.id);
      out.add(p);
      const d = defs.get(inst.definition);
      if (d && !onPath.has(d.id)) walk(d, p, new Set([...onPath, d.id]));
    }
  };
  walk(doc, null, new Set());
  return out;
}

/** Occurrence id -> display path (`Drawer 2 › Side`). */
export function displayNames(doc: SloydDocument): Map<string, string> {
  const out = new Map<string, string>();
  const defs = defsOf(doc);
  const walk = (c: Container, path: string | null, prefix: string, onPath: Set<string>) => {
    for (const b of c.boards) out.set(joinPath(path, b.id), prefix + b.name);
    for (const inst of c.instances) {
      const d = defs.get(inst.definition);
      if (d && !onPath.has(d.id)) walk(d, joinPath(path, inst.id), `${prefix}${inst.name}${NAME_SEPARATOR}`, new Set([...onPath, d.id]));
    }
  };
  walk(doc, null, '', new Set());
  return out;
}

/**
 * The document as flat parts named by their display paths, with no tree
 * (spec §2.1). What the cut list and joinery read. The names are built HERE so
 * the string the cut list measures is the string it draws (invariant 19).
 */
export function flatDocument(doc: SloydDocument): FlatDocument {
  if (doc.instances.length === 0 && doc.shapes.length === 0) return doc as FlatDocument;
  const names = displayNames(doc);
  return {
    ...doc,
    boards: worldParts(doc).map((b) => ({ ...b, name: names.get(b.id) ?? b.name })),
    instances: [],
    definitions: [],
    shapes: [],
  };
}

export interface TreeRow { path: string; name: string; kind: 'part' | 'assembly'; depth: number; shape?: string; copies?: number; mirrored?: true }

/** The parts list's rows: depth first, a container's parts before its assemblies. */
export function treeRows(doc: SloydDocument): TreeRow[] {
  const out: TreeRow[] = [];
  const defs = defsOf(doc);
  const placed = placementsOf(doc);
  const walk = (c: Container, path: string | null, depth: number, onPath: Set<string>) => {
    for (const b of c.boards) out.push({ path: joinPath(path, b.id), name: b.name, kind: 'part', depth, ...(isShaped(b) ? { shape: b.shape } : {}) });
    for (const inst of c.instances) {
      const p = joinPath(path, inst.id);
      const n = placed.get(inst.definition) ?? 0;
      out.push({ path: p, name: inst.name, kind: 'assembly', depth, ...(n >= 2 ? { copies: n } : {}), ...(inst.mirrored ? { mirrored: true as const } : {}) });
      const d = defs.get(inst.definition);
      if (d && !onPath.has(d.id)) walk(d, p, depth + 1, new Set([...onPath, d.id]));
    }
  };
  walk(doc, null, 0, new Set());
  return out;
}
