import { boardExtents } from './geometry';
import type { Board, Cut, Definition, Instance, Posture, Shape, SloydDocument, StoredBoard } from './types';
import { CUT_GEOMETRY_KEYS } from './cuts';
import { nextId } from './ids';
import { LINK_FIELDS, SHARED_KEYS, sharedOf } from './links';
import { isShaped, resolveBoard, shapeMap } from './shapes';
import { addTurns, cornerShift, inverseTurn, mirrorDim, mirrorPart, placeBoard, rotateVec, toLocal } from './frames';
import type { Frame } from './frames';
import { mirrorCut } from './mirrorCut';
import type { Container } from './tree';
import { PATH_SEPARATOR, containerLinear, definitionAt, instanceAt, instancesOn, isCovered, itemPaths, lastSegment, mirroredAt, parentPath, partAt, worldParts } from './tree';

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

/** One level down, as a DELTA (spec §5.2): the lowered turn, a draft carrying
 *  the after-state's fields at the before position, and the local position change. */
function lowerDelta(inst: Frame, upperBefore: Board, lowerBefore: Board, upperAfter: Board): { draft: Board; d: number[] } {
  const rotation = addTurns(upperAfter.rotation, inverseTurn(inst.rotation));
  const draft: Board = { ...upperAfter, rotation, position: lowerBefore.position };
  const dW = sub(upperAfter.position, upperBefore.position);
  const dS = sub(cornerShift(inst.rotation, draft), cornerShift(inst.rotation, lowerBefore));
  return { draft, d: rotateVec(inverseTurn(inst.rotation), sub(dW, dS)) };
}

/**
 * The cuts of a part lowered back through ONE mirror (mirrored-instances spec §4).
 * A world cut that equals the stored cut with the same id, placed, maps back to
 * THAT object (mirrorCut twice is not bit-exact; repeated edits must not drift,
 * and an untouched cut is never rewritten). "Placed" means at the BEFORE frame
 * (the stored part's size on d0) for a Properties edit, which keeps the stored
 * cuts when only a size field changed, as through a plain frame; and at the AFTER
 * frame under keepWorld (joinery keeps the world box, so an end cut's rebase must
 * shift the stored cuts). A posture change that moves d0 re-reflects every cut
 * (the approved coupling: the world cuts are kept as seen), because none matches. Any other cut is reflected
 * back along d0 of the lowered (after) posture. All reused, in order: the stored
 * array itself.
 */
function lowerCuts(storedBefore: Board, draft: Board, keepWorld: boolean): Cut[] {
  const d0 = mirrorDim(draft);
  const size = draft[d0];
  // A posture change that moves d0 (flat/on-edge <-> upright) is the approved
  // coupling (spec §4): no world cut equals the stored cut placed along the NEW
  // d0 (the world cuts were placed along the old one), so each is re-reflected
  // and the world cuts stay as seen. No separate test of d0 is needed.
  const atBefore = !keepWorld;
  const refSize = atBefore ? storedBefore[d0] : size;
  const byId = new Map(storedBefore.cuts.map((c) => [c.id, c]));
  const out = draft.cuts.map((c) => {
    const s = byId.get(c.id);
    if (s) {
      const placed = mirrorCut(s, d0, refSize);
      if (CUT_GEOMETRY_KEYS.every((k) => placed[k] === c[k])) return s;
    }
    return mirrorCut(c, d0, size);
  });
  return out.length === storedBefore.cuts.length && out.every((c, i) => c === storedBefore.cuts[i]) ? storedBefore.cuts : out;
}

/**
 * One level down: the part's after-state in an instance's frame, from its
 * after-state in the parent's frame. A position goes down as a DELTA (spec
 * §5.2): the stored value gains the inverse-rotated world change, less the
 * change in the turned box's corner offset. An axis that did not move gains
 * exactly zero, so nothing is round-tripped. Through a MIRRORED frame
 * (mirrored-instances spec §4) it lowers into the reflected coordinates the
 * placement used (mirrorPart of the stored before), then reflects back: the turn
 * negated, x by -dx' less the change in x extent, the cuts by lowerCuts.
 */
function lower(inst: Instance, upperBefore: Board, lowerBefore: Board, upperAfter: Board, keepWorld: boolean): Board {
  if (!inst.mirrored) {
    const { draft, d } = lowerDelta(inst, upperBefore, lowerBefore, upperAfter);
    return { ...draft, position: [lowerBefore.position[0] + d[0]!, lowerBefore.position[1] + d[1]!, lowerBefore.position[2] + d[2]!] };
  }
  const mBefore = mirrorPart(lowerBefore);
  const { draft, d } = lowerDelta(inst, upperBefore, mBefore, upperAfter);
  const dx = (0 - d[0]!) - (boardExtents(draft)[0] - boardExtents(mBefore)[0]);
  return {
    ...draft,
    rotation: inverseTurn(draft.rotation),
    position: [lowerBefore.position[0] + dx, lowerBefore.position[1] + d[1]!, lowerBefore.position[2] + d[2]!],
    cuts: lowerCuts(lowerBefore, draft, keepWorld),
  };
}

export const POSTURE_ACROSS_MIRROR = "Linked parts on both sides of a mirror can't change between flat and upright. Unlink first.";

/**
 * Why a posture patch on `ids` must be refused, or null (mirrored-instances spec
 * §4, amended). Under an odd number of mirrors a part's stored cuts depend on
 * its posture's d0 (`mirrorDim`), so a posture change that moves d0 (flat or
 * on-edge <-> upright) rewrites them, re-reflected (the approved coupling). A
 * shaped part's cuts are stored ONCE: when the Shape's users sit on both sides
 * of a mirror, the two sides would write different cuts to it, so the change is
 * refused before any mutation. A posture that keeps d0 (flat <-> on-edge), and
 * any change on a Shape whose users are all on one side, is allowed. Every
 * placement of every user counts (a user in a definition placed both ways is on
 * both sides). The ONE decider: the store's updateBoards and the Posture field.
 */
export function postureRefusal(doc: SloydDocument, ids: readonly string[], posture: Posture | undefined): string | null {
  if (posture === undefined) return null;
  const world = worldParts(doc);
  for (const id of ids) {
    const b = world.find((x) => x.id === id);
    if (!b?.shape || mirrorDim({ ...b, posture }) === mirrorDim(b)) continue;
    const sides = new Set(world.filter((x) => x.shape === b.shape).map((x) => mirroredAt(doc, x.id)));
    if (sides.size > 1) return POSTURE_ACROSS_MIRROR;
  }
  return null;
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

/** Where an ITEM (a part or an assembly) is stored: storageKey's rule, for
 *  instances too. Every placement of one stored item shares the key, so an
 *  edit to one occurrence reaches them all. Null when the path does not resolve. */
export function itemKey(doc: SloydDocument, path: string): string | null {
  const def = definitionIdOf(doc, parentPath(path));
  if (def === null || (!partAt(doc, path) && !instanceAt(doc, path))) return null;
  return `${def}:${lastSegment(path)}`;
}

/** The predicate for "this path lies under ANOTHER placement of a selected stored
 *  item": it, or an ancestor, shares an `itemKey` with one of `selectedIds`, so an
 *  edit to the selected item moves it too. The ONE statement of the twin rule:
 *  `moveCandidates` withholds such points and `commitSnapMove` refuses them. */
export function sharesStorageWith(
  selectedIds: readonly string[],
  keyOf: (path: string) => string | null,
): (path: string) => boolean {
  const keys = new Set(selectedIds.map(keyOf).filter((k): k is string => k !== null));
  return (path) => {
    if (keys.size === 0) return false;
    for (let p: string | null = path; p !== null; p = parentPath(p)) {
      const k = keyOf(p);
      if (k !== null && keys.has(k)) return true;
    }
    return false;
  };
}

/** Replace one definition's (or the root's) parts by id. */
function updateDefinition(doc: SloydDocument, defId: string, fn: (boards: StoredBoard[]) => StoredBoard[]): SloydDocument {
  if (defId === ROOT) return { ...doc, boards: fn(doc.boards) };
  return { ...doc, definitions: doc.definitions.map((d) => (d.id === defId ? { ...d, boards: fn(d.boards) } : d)) };
}

/** Deep equality for written records (plain data). */
const sameRecord = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** One world edit lowered into its storage target: where it is stored, which
 *  fields it changes, and each changed field's value in the container frame. */
interface Lowered {
  stored: StoredBoard;
  defId: string;
  key: string;
  changedKeys: string[];
  valueOf: (k: string) => unknown;
  after: Board;
}

const rec = (b: unknown) => b as Record<string, unknown>;

/**
 * THE lowering of a world edit (spec §5.1, §5.2), shared by applyWorldEdits
 * and writeBackFlat so there is one copy: the after-state goes down level by
 * level through `lower`, and the changed fields are decided against the
 * world before. Null when the occurrence does not resolve.
 */
function lowerEdit(doc: SloydDocument, shapes: ReadonlyMap<string, Shape>, before: Board, after: Board, keepWorld: boolean): Lowered | null {
  const occ = before.id;
  const cPath = parentPath(occ);
  const stored = partAt(doc, occ);
  const defId = definitionIdOf(doc, cPath);
  if (!stored || defId === null) return null;
  const resolved = resolveBoard(shapes, stored);
  if (!resolved) return null;
  const chain = cPath === null ? [] : instancesOn(doc, cPath) ?? [];
  const reps: Board[] = [];
  reps[chain.length] = resolved;
  for (let j = chain.length - 1; j >= 0; j -= 1) reps[j] = placeBoard(chain[j]!, reps[j + 1]!);
  let cur = after;
  for (let j = 0; j < chain.length; j += 1) cur = lower(chain[j]!, reps[j]!, reps[j + 1]!, cur, keepWorld);

  const resized = keepWorld
    && (before.posture !== after.posture || boardExtents(before).some((e, a) => e !== boardExtents(after)[a]));
  const moved = resized || !samePosition(before.position, after.position) || before.rotation !== after.rotation;
  const changedKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => {
    if (k === 'id' || k === 'shape') return false;            // never written through here
    if (k === 'position' || k === 'rotation') return moved;
    return k === 'cuts' ? cur.cuts !== resolved.cuts : rec(before)[k] !== rec(after)[k];
  });
  const valueOf = (k: string) => (k === 'position' ? [...cur.position] : k === 'rotation' ? cur.rotation : k === 'cuts' ? cur.cuts : rec(after)[k]);
  return { stored, defId, key: `${defId}:${stored.id}`, changedKeys, valueOf, after };
}

/** A lowered field's written value; ABSENT marks a key to delete. */
const ABSENT = Symbol('absent');

/** One lowered field's value for a stored record: its value, or ABSENT for a
 *  key the after-state no longer has. Every Board key but `shape` (excluded
 *  from changedKeys) is required since Board.link retired, so a typed caller
 *  never reaches ABSENT today; it stays so a future OPTIONAL field can be
 *  cleared rather than left stale. */
function storedValue(l: Lowered, k: string): unknown {
  return k in l.after || k === 'position' || k === 'rotation' ? l.valueOf(k) : ABSENT;
}

/** Field-by-field merge of every edit into one record: a field written twice
 *  must agree, a field written once is kept, so the result does not depend on
 *  the order of the edits. */
function mergeField(rec0: Record<string, unknown>, wrote: Map<string, unknown>, k: string, v: unknown, what: string): void {
  if (wrote.has(k)) {
    const prior = wrote.get(k);
    const same = prior === ABSENT || v === ABSENT ? prior === v : sameRecord(prior, v);
    if (!same) throw new Error(`applyWorldEdits: disagreeing edits to ${what}`);
    return;
  }
  wrote.set(k, v);
  if (v === ABSENT) delete rec0[k];
  else rec0[k] = v;
}

/**
 * Write world-space edits back into the tree (spec §5.1, §5.2). Only changed
 * fields are written: `position` compared element by element, `cuts` by
 * reference, everything else by `!==`. `position`, `rotation` and `cuts`
 * go down level by level through `lower` (through a mirror the cuts are
 * reflected back by `lowerCuts`; untouched ones stay the stored objects); every
 * other field is part-local and goes back as it is. A key present before and absent after is deleted (storedValue).
 * A root part's write is plain assignment, exactly as before assemblies.
 * `keepWorld` (joinery only): a part whose extents or posture changed also
 * counts as moved, so the world box is kept; a Properties edit keeps the
 * stored local position instead (spec §5.2) and must not pass it.
 * Components (spec 4.1): edits are keyed by STORAGE target (definition id +
 * part id), so every placement of one stored part is one write; a shared
 * field of a shaped part is written into its Shape. Edits are merged FIELD BY
 * FIELD (mergeField): two edits writing one field of one target must agree or
 * this throws; fields each writes alone are both kept, in any order. The
 * store's callers still send at most one edit per storage key
 * (oneEditPerTarget), and writeBackFlat does too.
 */
export function applyWorldEdits(doc: SloydDocument, edits: readonly WorldEdit[], opts?: { keepWorld?: boolean }): SloydDocument {
  const shapes = shapeMap(doc);
  // By storage key / shape id: the merged record and the fields written into it.
  const parts = new Map<string, { defId: string; next: Record<string, unknown>; wrote: Map<string, unknown> }>();
  const shapeWrites = new Map<string, { next: Record<string, unknown>; wrote: Map<string, unknown> }>();
  for (const { before, after } of edits) {
    const l = lowerEdit(doc, shapes, before, after, opts?.keepWorld === true);
    if (!l) continue;
    const { stored, defId, key } = l;
    let part = parts.get(key);
    if (!part) parts.set(key, part = { defId, next: { ...stored }, wrote: new Map() });
    for (const k of l.changedKeys) {
      const shared = (LINK_FIELDS as Record<string, string>)[k] === 'shared';
      if (isShaped(stored) && shared) {
        let sh = shapeWrites.get(stored.shape);
        if (!sh) shapeWrites.set(stored.shape, sh = { next: { ...shapes.get(stored.shape)! }, wrote: new Map() });
        mergeField(sh.next, sh.wrote, k, l.valueOf(k), `shape ${stored.shape}`);
      } else {
        mergeField(part.next, part.wrote, k, storedValue(l, k), key);
      }
    }
  }
  let out = doc;
  const byDef = new Map<string, Map<string, StoredBoard>>();
  for (const { defId, next, wrote } of parts.values()) {
    if (wrote.size === 0) continue;   // nothing changed: the stored object stays
    if (!byDef.has(defId)) byDef.set(defId, new Map());
    byDef.get(defId)!.set(next.id as string, next as unknown as StoredBoard);
  }
  for (const [defId, m] of byDef) out = updateDefinition(out, defId, (bs) => bs.map((b) => m.get(b.id) ?? b));
  if (shapeWrites.size) out = { ...out, shapes: out.shapes.map((s) => (shapeWrites.get(s.id)?.next as Shape | undefined) ?? s) };
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
 * Move items (parts or instances) by one WORLD delta (spec §4.2): turned and,
 * through a mirror, reflected into each item's container frame (exact, a
 * quarter turn only swaps and negates)
 * and added to its stored position or origin. A root item gains the delta
 * exactly, as translateBoards did. Nothing rounds (invariant 25). An item
 * listed together with one of its ancestors is not moved separately.
 */
export function translateItems(doc: SloydDocument, ids: readonly string[], worldDelta: readonly number[]): SloydDocument {
  // An item whose ancestor is also listed moves with that ancestor; moving it
  // too would shift it twice (spec §4.2: a selection is one level, so the UI
  // never sends both, but the function must not rely on that).
  const listed = new Set(ids);
  const byContainer = new Map<string | null, Set<string>>();
  for (const id of ids) {
    const above = parentPath(id);
    if (above !== null && isCovered(above, listed)) continue;
    const c = parentPath(id);
    if (!byContainer.has(c)) byContainer.set(c, new Set());
    byContainer.get(c)!.add(lastSegment(id));
  }
  let out = doc;
  for (const [cPath, members] of byContainer) {
    const d = toLocal(containerLinear(doc, cPath), worldDelta);
    const shift = (p: readonly number[]): [number, number, number] => [p[0]! + d[0], p[1]! + d[1], p[2]! + d[2]];
    out = updateContainer(out, cPath, (c) => ({
      boards: c.boards.map((b) => (members.has(b.id) ? { ...b, position: shift(b.position) } : b)),
      instances: c.instances.map((i) => (members.has(i.id) ? { ...i, position: shift(i.position) } : i)),
    }));
  }
  return out;
}

/** Every stored part, in document order (the root's, then each definition's):
 *  the order `shapeUsers` counts in, so "a shape's first user" means one thing. */
const storedInOrder = (doc: SloydDocument): StoredBoard[] => [...doc.boards, ...doc.definitions.flatMap((d) => d.boards)];

/** Every stored part made plain, a shaped one keeping its `shape` key as a
 *  MARKER of the shape it came from (it has `length`, so isShaped is false).
 *  writeBackFlat writes shared fields onto each part, then regroups by marker. */
function plainWithMarkers(doc: SloydDocument): SloydDocument {
  if (doc.shapes.length === 0) return doc;
  const shapes = shapeMap(doc);
  const fix = (bs: StoredBoard[]) => bs.map((b) => (isShaped(b) ? resolveBoard(shapes, b) ?? b : b));
  return { ...doc, boards: fix(doc.boards), definitions: doc.definitions.map((d) => ({ ...d, boards: fix(d.boards) })) };
}

/** A part's shared fields as a comparable string, each cut by GEOMETRY
 *  (CUT_GEOMETRY_KEYS, in order) and NOT by id: pocketFor mints fresh cut ids
 *  per board, so identical mortises differ only by id (spec §5). */
function sharedSignature(b: Board): unknown[] {
  return SHARED_KEYS.map((k) => (k === 'cuts' ? b.cuts.map((c) => CUT_GEOMETRY_KEYS.map((f) => c[f])) : b[k]));
}

/** A lowered result as compared across placements: own position and rotation
 *  plus the shared fields. Never `id`, `name` or `shape`: an occurrence is
 *  matched by its relative id already, and names are never written here. */
function resultSignature(b: Board): unknown[] {
  return [b.position, b.rotation, sharedSignature(b)];
}

/** The results of every occurrence under the instance path `path`, keyed by id
 *  relative to it, sorted: what two placements of one definition compare. */
function subtreeSignature(results: ReadonlyMap<string, Board>, path: string): string {
  const prefix = path + PATH_SEPARATOR;
  const rows: [string, unknown[]][] = [];
  for (const [occ, b] of results) if (occ.startsWith(prefix)) rows.push([occ.slice(prefix.length), resultSignature(b)]);
  rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(rows);
}

const depthOf = (path: string) => path.split(PATH_SEPARATOR).length;

/** Instance paths per definition id, in item order (root first, depth first). */
function placementsByDefinition(doc: SloydDocument): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const p of itemPaths(doc)) {
    const inst = instanceAt(doc, p);
    if (!inst) continue;
    if (!out.has(inst.definition)) out.set(inst.definition, []);
    out.get(inst.definition)!.push(p);
  }
  return out;
}

/** A one-level copy of a definition, ids kept (makeUniqueItem's copy). */
function copyDefinition(d: Definition): Definition {
  return {
    id: nextId(),
    boards: d.boards.map((b) => (isShaped(b)
      ? { ...b, position: [...b.position] as [number, number, number] }
      : { ...b, position: [...b.position] as [number, number, number], cuts: b.cuts.map((c) => ({ ...c })) })),
    instances: d.instances.map((j) => ({ ...j, position: [...j.position] as [number, number, number] })),
  };
}

/**
 * Step 1 of writeBackFlat: split every definition whose placements' results
 * disagree, TOP-DOWN. A definition is taken in order of the DEEPEST of its
 * placements, shallowest first. That is a topological order (a definition
 * holding another has every placement of it at least one level deeper), so
 * every definition above this one already agrees, and two placements reaching
 * ONE stored instance (the same instance id in the same container definition)
 * have equal subtrees and land in one group. Repointing that stored instance is
 * then right for all of them. Processed bottom-up, it would repoint a shared
 * cabinet's drawer for both cabinets at once. The check that this held throws
 * rather than loops; so does an iteration cap.
 */
function splitAssemblies(doc: SloydDocument, results: ReadonlyMap<string, Board>): SloydDocument {
  let out = doc;
  const cap = itemPaths(doc).size + 1;
  for (let round = 0; ; round += 1) {
    if (round > cap) throw new Error('writeBackFlat: assembly split did not settle');
    const byDef = placementsByDefinition(out);
    const order = [...byDef.entries()]
      .map(([id, ps], i) => ({ id, ps, depth: Math.max(...ps.map(depthOf)), i }))
      .sort((a, b) => a.depth - b.depth || a.i - b.i);
    let target: { id: string; groups: string[][] } | null = null;
    for (const { id, ps } of order) {
      const groups = new Map<string, string[]>();
      for (const p of ps) {
        const sig = subtreeSignature(results, p);
        if (!groups.has(sig)) groups.set(sig, []);
        groups.get(sig)!.push(p);
      }
      if (groups.size > 1) { target = { id, groups: [...groups.values()] }; break; }
    }
    if (!target) return out;
    // Every stored instance must fall wholly in one group (the top-down argument above).
    const groupOf = new Map<string, number>();
    target.groups.forEach((g, gi) => g.forEach((p) => {
      const ref = `${definitionIdOf(out, parentPath(p))}:${lastSegment(p)}`;
      if ((groupOf.get(ref) ?? gi) !== gi) throw new Error(`writeBackFlat: placements of one stored instance ${ref} disagree`);
      groupOf.set(ref, gi);
    }));
    const def = out.definitions.find((d) => d.id === target.id)!;
    for (const g of target.groups.slice(1)) {
      const copy = copyDefinition(def);
      out = { ...out, definitions: [...out.definitions, copy] };
      for (const p of g) {
        out = updateContainer(out, parentPath(p), (c) => ({
          ...c, instances: c.instances.map((i) => (i.id === lastSegment(p) ? { ...i, definition: copy.id } : i)),
        }));
      }
    }
  }
}

/**
 * Step 3 of writeBackFlat: regroup each shape's users (marked plain parts) by
 * their new shared fields, cuts by geometry. The group holding the shape's
 * first user (document order) keeps the shape; every other group gets a new
 * one. A shape takes its group's FIRST member's shared fields, cut ids
 * included, so every user carries those ids. A group of one stays a shape here;
 * migrateDocument dissolves it.
 */
function regroupShapes(doc: SloydDocument): SloydDocument {
  const marked = (b: StoredBoard): b is Board & { shape: string } => !isShaped(b) && typeof b.shape === 'string';
  const groups = new Map<string, Map<string, Board[]>>();     // shape id -> signature -> members
  for (const b of storedInOrder(doc)) {
    if (!marked(b)) continue;
    if (!groups.has(b.shape)) groups.set(b.shape, new Map());
    const g = groups.get(b.shape)!;
    const sig = JSON.stringify(sharedSignature(b));
    if (!g.has(sig)) g.set(sig, []);
    g.get(sig)!.push(b);
  }
  if (groups.size === 0) return doc;
  const kept = new Map<string, Shape>();
  const added: Shape[] = [];
  const shapeOf = new Map<Board, string>();
  for (const [sid, bySig] of groups) {
    [...bySig.values()].forEach((members, gi) => {
      const s: Shape = { id: gi === 0 ? sid : nextId(), ...sharedOf(members[0]!) };
      if (gi === 0) kept.set(sid, s); else added.push(s);
      for (const m of members) shapeOf.set(m, s.id);
    });
  }
  const fix = (bs: StoredBoard[]) => bs.map((b): StoredBoard => {
    const sid = shapeOf.get(b as Board);
    return sid === undefined ? b : { id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: sid };
  });
  return {
    ...doc,
    boards: fix(doc.boards),
    definitions: doc.definitions.map((d) => ({ ...d, boards: fix(d.boards) })),
    shapes: [...doc.shapes.map((s) => kept.get(s.id) ?? s), ...added],
  };
}

/**
 * Joinery's way back (components spec §5). Parts pair BY INDEX with the
 * flattened before (count mismatch throws): `applyJoints` re-mints occurrence
 * ids, and every recipe keeps the count and order of parts. Each occurrence's
 * result is lowered into its own container's frame (`lowerEdit`, keepWorld:
 * joinery's output is world geometry, so a grown part keeps its world box).
 * Path names are compared against the same flattened before, so they are never
 * written back as renames. Then:
 * 1. assemblies, top-down (`splitAssemblies`): a definition whose placements'
 *    subtree results differ splits; the group holding the first placement keeps
 *    it, every other group gets a one-level copy (ids kept, so paths and
 *    results stay keyed by occurrence id). Repeat until every definition's
 *    placements agree.
 * 2. results are written per storage target, now unambiguous. Shaped parts are
 *    made plain first (marked with their shape), so a shared field lands on the
 *    part, never in a Shape another part's edit could also reach. Exactly ONE
 *    edit per storage key goes to applyWorldEdits, from that key's first
 *    occurrence: its other occurrences have the same subtree signature (step 1
 *    split on it), so they lowered to the same record, and with one edit per
 *    key applyWorldEdits has nothing to merge.
 * 3. shapes (`regroupShapes`): users grouped by shared fields with cuts
 *    compared by GEOMETRY; the first user's group keeps the shape, others get
 *    new shapes; a group takes its first member's cut ids. migrateDocument
 *    dissolves one-user shapes.
 * Comparisons are exact (stored values, invariant 18).
 */
export function writeBackFlat(doc: SloydDocument, flatBefore: readonly Board[], flatAfter: readonly Board[]): SloydDocument {
  if (flatBefore.length !== flatAfter.length) {
    throw new Error(`writeBackFlat: part count changed (${flatBefore.length} -> ${flatAfter.length})`);
  }
  const plain = plainWithMarkers(doc);
  const shapes = shapeMap(plain);
  const edits = flatBefore.map((before, i) => ({ before, after: { ...flatAfter[i]!, id: before.id } }));
  const results = new Map<string, Board>();
  for (const { before, after } of edits) {
    const l = lowerEdit(plain, shapes, before, after, true);
    if (!l) continue;
    const next: Record<string, unknown> = { ...l.stored };
    for (const k of l.changedKeys) {
      const v = storedValue(l, k);
      if (v === ABSENT) delete next[k];
      else next[k] = v;
    }
    results.set(before.id, next as unknown as Board);
  }
  const split = splitAssemblies(plain, results);
  const seen = new Set<string>();
  const once = edits.filter(({ before }) => {
    const key = storageKey(split, before.id);
    if (key === null || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return regroupShapes(applyWorldEdits(split, once, { keepWorld: true }));
}
