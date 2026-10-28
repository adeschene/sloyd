import type { SloydDocument } from './types';
import { worldParts, isCovered, partAt, instanceAt } from './tree';
import { partsBounds } from './worldBounds';
import { noRoomText } from './alignText';

/**
 * Align and space evenly (align spec): the pure decisions. Each returns one WORLD delta per item, index for index; nothing
 * here moves anything, and nothing rounds (inv 25: these are exact moves). The store applies the deltas in one edit.
 */

/** An item of the selection: a part or an assembly at the open level, with its REAL world extent (spec §2). */
export interface AlignItem { id: string; name: string; min: readonly number[]; max: readonly number[] }
export type Axis = 0 | 1 | 2;
export type Edge = 'min' | 'centre' | 'max';
type V3 = [number, number, number];

const along = (axis: Axis, v: number): V3 => {
  const d: V3 = [0, 0, 0];
  d[axis] = v;
  return d;
};
const at = (it: AlignItem, axis: Axis, edge: Edge) =>
  edge === 'min' ? it.min[axis]! : edge === 'max' ? it.max[axis]! : (it.min[axis]! + it.max[axis]!) / 2;

/** Align to the ANCHOR, `items[0]` (the item selected first), which never moves (spec §3). */
export function alignDeltas(items: readonly AlignItem[], axis: Axis, edge: Edge): V3[] {
  const target = at(items[0]!, axis, edge);
  return items.map((it, i) => (i === 0 ? [0, 0, 0] : along(axis, target - at(it, axis, edge))));
}

/**
 * Equal gaps between neighbours along `axis`, the two OUTERMOST items fixed (spec §4). Ordered by min, then max, then
 * selection order. Each inner item is placed directly from the first item's max — never from a running position — so no
 * drift accumulates. Refused, with its sentence, when the inner items do not fit between the outer two.
 */
export function distributeDeltas(items: readonly AlignItem[], axis: Axis): V3[] | { refused: string } {
  const order = items.map((it, i) => ({ it, i }))
    .sort((p, q) => p.it.min[axis]! - q.it.min[axis]! || p.it.max[axis]! - q.it.max[axis]! || p.i - q.i);
  const first = order[0]!.it, last = order[order.length - 1]!.it;
  const inner = order.slice(1, -1);
  const size = (it: AlignItem) => it.max[axis]! - it.min[axis]!;
  const g = (last.min[axis]! - first.max[axis]! - inner.reduce((s, p) => s + size(p.it), 0)) / (order.length - 1);
  if (g < -1e-9) return { refused: noRoomText(first.name, last.name, axis) };
  const out: V3[] = items.map(() => [0, 0, 0]);
  let before = 0;
  inner.forEach((p, j) => {
    const newMin = first.max[axis]! + (j + 1) * g + before;
    out[p.i] = along(axis, newMin - p.it.min[axis]!);
    before += size(p.it);
  });
  return out;
}

/** Each selected item's extent: `partsBounds` over the world parts it covers (a leaning part leaned, an assembly whole). */
export function itemExtents(doc: SloydDocument, ids: readonly string[]): AlignItem[] {
  const world = worldParts(doc);
  return ids.flatMap((id) => {
    const b = partsBounds(world.filter((p) => isCovered(p.id, new Set([id]))));
    if (!b) return [];
    const name = partAt(doc, id)?.name ?? instanceAt(doc, id)?.name ?? id;
    return [{ id, name, min: b.min, max: b.max }];
  });
}
