import { boardExtents } from './geometry';
import type { Board, Instance, Shape, SloydDocument, StoredBoard } from './types';
import { LINK_FIELDS } from './links';
import { isShaped, resolveBoard, shapeMap } from './shapes';
import { addTurns, cornerShift, inverseTurn, placeBoard, rotateVec } from './frames';
import type { Container } from './tree';
import { containerTurn, definitionAt, instancesOn, lastSegment, parentPath, partAt, worldParts } from './tree';

/** Replace one container's contents: the root's, or a definition's. */
export function updateContainer(doc: SloydDocument, path: string | null, fn: (c: Container) => Container): SloydDocument {
  if (path === null) {
    const c = fn({ boards: doc.boards, instances: doc.instances });
    return { ...doc, boards: c.boards, instances: c.instances };
  }
  const d = definitionAt(doc, path);
  if (!d) return doc;
  const c = fn({ boards: d.boards, instances: d.instances });
  return { ...doc, definitions: doc.definitions.map((x) => (x.id === d.id ? { ...x, boards: c.boards, instances: c.instances } : x)) };
}

export interface WorldEdit { before: Board; after: Board }

const samePosition = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const sub = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];

/**
 * One level down: the part's after-state in an instance's frame, from its
 * after-state in the parent's frame. A position goes down as a DELTA (spec
 * §5.2): the stored value gains the inverse-rotated world change, less the
 * change in the turned box's corner offset. An axis that did not move gains
 * exactly zero, so nothing is round-tripped.
 */
function lower(inst: Instance, upperBefore: Board, lowerBefore: Board, upperAfter: Board): Board {
  const rotation = addTurns(upperAfter.rotation, inverseTurn(inst.rotation));
  const draft: Board = { ...upperAfter, rotation, position: lowerBefore.position };
  const dW = sub(upperAfter.position, upperBefore.position);
  const dS = sub(cornerShift(inst.rotation, draft), cornerShift(inst.rotation, lowerBefore));
  const d = rotateVec(inverseTurn(inst.rotation), sub(dW, dS));
  return { ...draft, position: [lowerBefore.position[0] + d[0], lowerBefore.position[1] + d[1], lowerBefore.position[2] + d[2]] };
}

/** The storage id of the root container. A definition may never carry it:
 *  validateDefinitions drops one that does, or its edits would land here. */
export const ROOT_STORAGE_ID = 'ROOT';
const ROOT = ROOT_STORAGE_ID;

/** The id of the definition holding `container`'s parts, or ROOT. */
function definitionIdOf(doc: SloydDocument, container: string | null): string | null {
  if (container === null) return ROOT;
  return definitionAt(doc, container)?.id ?? null;
}

/** Where an occurrence is STORED: the same key for every placement of one
 *  stored part (components spec 4.1). Null when the occurrence does not resolve. */
export function storageKey(doc: SloydDocument, occ: string): string | null {
  const def = definitionIdOf(doc, parentPath(occ));
  if (def === null || !partAt(doc, occ)) return null;
  return `${def}:${lastSegment(occ)}`;
}

/** Replace one definition's (or the root's) parts by id. */
function updateDefinition(doc: SloydDocument, defId: string, fn: (boards: StoredBoard[]) => StoredBoard[]): SloydDocument {
  if (defId === ROOT) return { ...doc, boards: fn(doc.boards) };
  return { ...doc, definitions: doc.definitions.map((d) => (d.id === defId ? { ...d, boards: fn(d.boards) } : d)) };
}

/** Deep equality for written records (plain data). */
const sameRecord = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Write world-space edits back into the tree (spec §5.1, §5.2). Only changed
 * fields are written: `position` compared element by element, `cuts` by
 * reference, everything else by `!==`. `position` and `rotation` go down
 * level by level through `lower`; every other field is part-local and goes
 * back as it is. A key present before and absent after is deleted (an unlink).
 * A root part's write is plain assignment, exactly as before assemblies.
 * `keepWorld` (joinery only): a part whose extents or posture changed also
 * counts as moved, so the world box is kept; a Properties edit keeps the
 * stored local position instead (spec §5.2) and must not pass it.
 * Components (spec 4.1): edits are keyed by STORAGE target (definition id +
 * part id), so every placement of one stored part is one write; a shared
 * field of a shaped part is written into its Shape. Two edits reaching one
 * target with different results throw.
 */
export function applyWorldEdits(doc: SloydDocument, edits: readonly WorldEdit[], opts?: { keepWorld?: boolean }): SloydDocument {
  const shapes = shapeMap(doc);
  const parts = new Map<string, { defId: string; next: StoredBoard }>();   // by storage key
  const shapeWrites = new Map<string, Shape>();                               // by shape id
  for (const { before, after } of edits) {
    const occ = before.id;
    const cPath = parentPath(occ);
    const stored = partAt(doc, occ);
    const defId = definitionIdOf(doc, cPath);
    if (!stored || defId === null) continue;
    const resolved = resolveBoard(shapes, stored);
    if (!resolved) continue;
    const chain = cPath === null ? [] : instancesOn(doc, cPath) ?? [];
    const reps: Board[] = [];
    reps[chain.length] = resolved;
    for (let j = chain.length - 1; j >= 0; j -= 1) reps[j] = placeBoard(chain[j]!, reps[j + 1]!);
    let cur = after;
    for (let j = 0; j < chain.length; j += 1) cur = lower(chain[j]!, reps[j]!, reps[j + 1]!, cur);

    const resized = opts?.keepWorld === true
      && (before.posture !== after.posture || boardExtents(before).some((e, a) => e !== boardExtents(after)[a]));
    const moved = resized || !samePosition(before.position, after.position) || before.rotation !== after.rotation;
    const rec = (b: Board) => b as unknown as Record<string, unknown>;
    const changedKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => {
      if (k === 'id' || k === 'shape') return false;            // never written through here
      if (k === 'position' || k === 'rotation') return moved;
      return k === 'cuts' ? before.cuts !== after.cuts : rec(before)[k] !== rec(after)[k];
    });
    const valueOf = (k: string) => (k === 'position' ? [...cur.position] : k === 'rotation' ? cur.rotation : rec(after)[k]);

    const key = `${defId}:${stored.id}`;
    const base = parts.get(key)?.next ?? stored;
    const next: Record<string, unknown> = { ...base };
    let shapeNext: Record<string, unknown> | null = null;
    for (const k of changedKeys) {
      const shared = (LINK_FIELDS as Record<string, string>)[k] === 'shared';
      if (isShaped(stored) && shared) {
        shapeNext ??= { ...(shapeWrites.get(stored.shape) ?? shapes.get(stored.shape)!) };
        shapeNext[k] = valueOf(k);
      } else if (k in after || k === 'position' || k === 'rotation') {
        next[k] = valueOf(k);
      } else {
        delete next[k];
      }
    }
    const prior = parts.get(key);
    if (prior && !sameRecord(prior.next, next)) throw new Error(`applyWorldEdits: disagreeing edits to ${key}`);
    parts.set(key, { defId, next: next as unknown as StoredBoard });
    if (shapeNext && isShaped(stored)) {
      const priorShape = shapeWrites.get(stored.shape);
      if (priorShape && !sameRecord(priorShape, shapeNext)) throw new Error(`applyWorldEdits: disagreeing edits to shape ${stored.shape}`);
      shapeWrites.set(stored.shape, shapeNext as unknown as Shape);
    }
  }
  let out = doc;
  const byDef = new Map<string, Map<string, StoredBoard>>();
  for (const { defId, next } of parts.values()) {
    if (!byDef.has(defId)) byDef.set(defId, new Map());
    byDef.get(defId)!.set(next.id, next);
  }
  for (const [defId, m] of byDef) out = updateDefinition(out, defId, (bs) => bs.map((b) => m.get(b.id) ?? b));
  if (shapeWrites.size) out = { ...out, shapes: out.shapes.map((s) => shapeWrites.get(s.id) ?? s) };
  return out;
}

/**
 * Run a per-part function over the world parts and write what it changed back
 * (spec §5.1): the ONE way the store edits a part. `fn` may replace entries,
 * never add or remove them.
 */
export function mapWorld(doc: SloydDocument, fn: (world: Board[]) => Board[]): SloydDocument {
  const world = worldParts(doc);
  const next = fn(world);
  if (next === world) return doc;
  if (next.length !== world.length) throw new Error(`mapWorld: ${world.length} parts in, ${next.length} out`);
  const edits = world.flatMap((b, i) => (next[i] !== b ? [{ before: b, after: next[i]! }] : []));
  return edits.length === 0 ? doc : applyWorldEdits(doc, edits);
}

/**
 * Move items (parts or instances) by one WORLD delta (spec §4.2): rotated into
 * each item's container frame (exact, a quarter turn only swaps and negates)
 * and added to its stored position or origin. A root item gains the delta
 * exactly, as translateBoards did. Nothing rounds (invariant 25).
 */
export function translateItems(doc: SloydDocument, ids: readonly string[], worldDelta: readonly number[]): SloydDocument {
  const byContainer = new Map<string | null, Set<string>>();
  for (const id of ids) {
    const c = parentPath(id);
    if (!byContainer.has(c)) byContainer.set(c, new Set());
    byContainer.get(c)!.add(lastSegment(id));
  }
  let out = doc;
  for (const [cPath, members] of byContainer) {
    const d = rotateVec(inverseTurn(containerTurn(doc, cPath)), worldDelta);
    const shift = (p: readonly number[]): [number, number, number] => [p[0]! + d[0], p[1]! + d[1], p[2]! + d[2]];
    out = updateContainer(out, cPath, (c) => ({
      boards: c.boards.map((b) => (members.has(b.id) ? { ...b, position: shift(b.position) } : b)),
      instances: c.instances.map((i) => (members.has(i.id) ? { ...i, position: shift(i.position) } : i)),
    }));
  }
  return out;
}

/**
 * Joinery's way back (spec §6.1): `applyJoints` re-mints occurrence ids (they
 * contain '/'), so its parts are paired with the flattened "before" BY INDEX.
 * Every recipe keeps the count and order of parts; a mismatch is our bug, so
 * it throws. Compared against the same flattened before, the path names are
 * equal and never written back as renames. It passes `keepWorld`: joinery's
 * output is world geometry, so a grown part keeps its world box, whereas a
 * Properties edit keeps the stored position.
 */
export function writeBackFlat(doc: SloydDocument, flatBefore: readonly Board[], flatAfter: readonly Board[]): SloydDocument {
  if (flatBefore.length !== flatAfter.length) {
    throw new Error(`writeBackFlat: part count changed (${flatBefore.length} -> ${flatAfter.length})`);
  }
  const edits = flatBefore.map((before, i) => ({ before, after: { ...flatAfter[i]!, id: before.id } }));
  return applyWorldEdits(doc, edits, { keepWorld: true });
}
