import type { Board, SloydDocument } from './types';
import { childrenOf, instanceAt, isCovered, itemPaths, parentPath, partAt, placementsOf, worldParts } from './tree';
import { itemExtents } from './align';
import { partsBounds } from './worldBounds';
import { itemKey, storageKey, translateItems, writeBackParts } from './treeEdit';
import { stretchPart } from './stretchPart';
import { STRETCH_LINE_INSIDE, STRETCH_SIZE_POSITIVE, copiesDiffer, inRemovedBand, linkDiffers } from './stretchText';

/**
 * A stretch's full result (parametric-resize spec §4): the after-document, and the node paths it grows, moves whole and
 * leaves. `from` and `to` are the items' old and new overall size on `axis`; `delta` is `to − from`, computed ONCE.
 */
export interface StretchPlan {
  axis: 0 | 1 | 2;
  line: number;
  delta: number;
  from: number;
  to: number;
  /** The after-document: the grown parts written back (`writeBackParts`, keepWorld, inv 46), then the moved nodes
   *  translated (`translateItems`). */
  doc: SloydDocument;
  /** World-part occurrence ids grown, in tree order. */
  grows: string[];
  /** Node paths moved whole by `delta`, in tree order (every placement listed, before the storage dedupe). */
  moves: string[];
  /** Node paths left as they are, in tree order. */
  stays: string[];
}

const EPS = 1e-9;

/**
 * Deep equality over plain values for the copies post-condition (parametric-resize spec §6): numbers within `eps`,
 * everything else `===`, arrays by index, objects by key set. The top-level `shape` and `mirrored` keys are ignored
 * (the links post-condition judges them).
 */
export function nearlyEqual(a: unknown, b: unknown, eps: number, top = true): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b || Math.abs(a - b) <= eps;
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bs = b as unknown[];
    return a.length === bs.length && a.every((x, i) => nearlyEqual(x, bs[i], eps, false));
  }
  const skip = (k: string) => top && (k === 'shape' || k === 'mirrored');
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra).filter((k) => !skip(k)).sort();
  const kb = Object.keys(rb).filter((k) => !skip(k)).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && nearlyEqual(ra[k], rb[k], eps, false));
}

/**
 * The stretch planner (parametric-resize spec §3, §4, §6): the ONE decision of what a stretch does to `ids` (one level
 * of the selection, as Align's items) on world axis `axis`, to an overall `size`, at the world line `line`. Pure: `doc`
 * is never mutated, and a refusal leaves it as it was. The panel's preview and the store action both call it.
 *
 * Refusal order (Global Constraints): the size; the line (strictly inside the items' extent, 1e-9); the no-op
 * (`|δ| ≤ 1e-9` returns null); the walk in tree order — a shrink's moving node starting inside the removed band (Ruling
 * 7), each spanning part's refusals being `stretchPart`'s own; the copies post-condition; the links post-condition.
 *
 * The walk is top-down (spec §4): a node whose extent (`partsBounds` over the world parts it covers, leaned boxes, inv
 * 57 R2) ends at the line STAYS, one starting at it MOVES whole, and anything else SPANS. A spanning assembly is
 * descended into (`childrenOf`); a spanning part is stretched by `stretchPart` on its WORLD part, every occurrence
 * separately, so the copies post-condition can compare each placement's own result.
 *
 * The after-document is `writeBackParts` over the grown parts (keepWorld, inv 46; one edit per storage key), then ONE
 * `translateItems` over the moved paths, deduped by STORAGE target (`itemKey`) first: two placements of one definition
 * both moving the same inner node would otherwise shift the definition's record twice. Within one placement a moved node is
 * never inside a grown part, but across placements the grow and move writes can reach the SAME stored record (one
 * definition, grown through one placement and moved through another): the copies post-condition below catches that, and
 * refuses. Exact (inv 25): `δ` is computed once and added; nothing rounds.
 *
 * Copies and links refuse, never split (spec §6): every occurrence of `worldParts(after)` must equal its expected world
 * part (a grown one its `stretchPart` result, one under a moved node its `before` with `position[k] + δ`, any other its
 * `before`), within 1e-9. A mismatch names the nearest ancestor placement whose definition has two or more placements.
 * Then cornerPlan's link post-condition: every Shape with users in two or more storage keys still holds them all.
 */
export function stretchPlan(
  doc: SloydDocument, ids: readonly string[], axis: 0 | 1 | 2, size: number, line: number,
): StretchPlan | { refused: string } | null {
  const k = axis;
  if (!(size > 0)) return { refused: STRETCH_SIZE_POSITIVE };
  const extents = itemExtents(doc, ids);
  if (extents.length === 0) return null;
  const min = Math.min(...extents.map((e) => e.min[k]!));
  const max = Math.max(...extents.map((e) => e.max[k]!));
  if (!(line > min + EPS && line < max - EPS)) return { refused: STRETCH_LINE_INSIDE };
  const from = max - min;
  const delta = size - from;
  if (Math.abs(delta) <= EPS) return null;

  // The walk, in tree order (`itemPaths`: a container's parts, then its assemblies, depth first).
  const world = worldParts(doc);
  const byId = new Map(world.map((b) => [b.id, b]));
  const order = [...itemPaths(doc)];
  const rank = new Map(order.map((p, i) => [p, i]));
  const items = [...new Set(ids)].filter((p) => rank.has(p)).sort((a, b) => rank.get(a)! - rank.get(b)!);
  const grown = new Map<string, Board>();
  const grows: string[] = [];
  const moves: string[] = [];
  const stays: string[] = [];
  const extentOf = (path: string) => partsBounds(world.filter((p) => isCovered(p.id, new Set([path]))));
  const walk = (paths: readonly string[]): string | null => {
    for (const path of paths) {
      const box = extentOf(path);
      if (!box || box.max[k]! <= line + EPS) { stays.push(path); continue; }
      if (box.min[k]! >= line - EPS) {
        // Ruling 7, amended by Ruling 9: on a shrink, a node starting in the removed band `[s, s + |δ|)` (the line itself
        // included) would land back on the fixed side of the line (its min below `s`), so the result would not be the typed
        // size. Refused, naming the node. Only the upper boundary is open: a node whose min is exactly `s + |δ|` (within
        // 1e-9) lands exactly on the line and passes. (`moves` already means min >= s - 1e-9.)
        if (delta < 0 && box.min[k]! < line - delta - EPS) {
          return inRemovedBand((partAt(doc, path) ?? instanceAt(doc, path))!.name);
        }
        moves.push(path);
        continue;
      }
      const part = byId.get(path);
      if (!part) {
        const refused = walk(childrenOf(doc, path));
        if (refused !== null) return refused;
        continue;
      }
      const r = stretchPart(part, k, line, delta, doc.units);
      if ('refused' in r) return r.refused;
      grown.set(path, r);
      grows.push(path);
    }
    return null;
  };
  const refusedInWalk = walk(items);
  if (refusedInWalk !== null) return { refused: refusedInWalk };

  // The after-document. The grown parts first (keepWorld), then the moved nodes, ONE path per storage target.
  let after = grown.size === 0 ? doc : writeBackParts(doc, [...grown].map(([id, a]) => ({ before: byId.get(id)!, after: a })));
  const seen = new Set<string>();
  const moved = moves.filter((p) => {
    const key = itemKey(doc, p) ?? p;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (moved.length > 0) {
    const along: [number, number, number] = [0, 0, 0];
    along[k] = delta;
    after = translateItems(after, moved, along);
  }

  // The copies post-condition: every occurrence as expected.
  const movedSet = new Set(moves);
  const counts = placementsOf(doc);
  const now = worldParts(after);
  if (now.length !== world.length) throw new Error(`stretchPlan: ${world.length} parts in, ${now.length} out`);
  let linkSuspect = false;
  for (const b of now) {
    const before = byId.get(b.id);
    if (!before) throw new Error(`stretchPlan: occurrence ${b.id} appeared`);
    const expected = grown.get(b.id) ?? (isCovered(b.id, movedSet) ? shifted(before, k, delta) : before);
    if (nearlyEqual(b, expected, EPS)) continue;
    for (let p = parentPath(b.id); p !== null; p = parentPath(p)) {
      const inst = instanceAt(doc, p);
      if (inst && (counts.get(inst.definition) ?? 0) >= 2) return { refused: copiesDiffer(inst.name) };
    }
    if (typeof before.shape !== 'string') throw new Error(`stretchPlan: ${b.id} lowered unexpectedly`);
    linkSuspect = true;
  }

  // The links post-condition (cornerPlan's own): every Shape with two or more storage keys keeps all its users.
  for (const s of doc.shapes) {
    const users = world.filter((w) => w.shape === s.id);
    if (new Set(users.map((u) => storageKey(doc, u.id))).size < 2) continue;
    const shapeOf = (id: string) => {
      const p = partAt(after, id);
      return p && 'shape' in p && !('length' in p) ? p.shape : `plain:${storageKey(doc, id)}`;
    };
    const first = users[0]!;
    const other = users.find((u) => shapeOf(u.id) !== shapeOf(first.id));
    if (other) return { refused: linkDiffers(partAt(doc, first.id)!.name, partAt(doc, other.id)!.name) };
  }
  if (linkSuspect) throw new Error('stretchPlan: a shaped part lowered unexpectedly, its links intact');

  return { axis, line, delta, from, to: size, doc: after, grows, moves, stays };
}

/** `b` moved whole by `delta` on world axis `k`. */
function shifted(b: Board, k: 0 | 1 | 2, delta: number): Board {
  const position: [number, number, number] = [b.position[0], b.position[1], b.position[2]];
  position[k] += delta;
  return { ...b, position };
}
