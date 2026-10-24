import type { Board } from './types';
import type { View } from './drawing';
import { boardExtents } from './geometry';
import { leanMap } from './lean';
import { partBounds } from './worldBounds';
import { formatLengthBare, type Units } from '../units/length';

/** One dimension, in screen inches along its axis; `label` is THE string drawn and measured (invariant 19). */
export interface DimLine { from: number; to: number; label: string }
export interface DimAxis { name: string; overall: DimLine | null; chain: DimLine[] }
export interface DimensionSet { horizontal: DimAxis; vertical: DimAxis }

const dot = (p: readonly number[], v: readonly number[]) => p[0]! * v[0]! + p[1]! * v[1]! + p[2]! * v[2]!;

/** A part's BOARD box (not its solids) along an axis direction: exact for ± a world axis. A leaning part's is its real
 *  bounds (`partBounds`, splayed legs spec §6.1 R2): its leaned bodies, never the pre-lean box. */
function extentAlong(b: Board, dir: readonly number[]): [number, number] {
  if (leanMap(b)) {
    const r = partBounds(b);
    const a = dot(r.min, dir);
    const c = dot(r.max, dir);
    return a <= c ? [a, c] : [c, a];
  }
  const ext = boardExtents(b);
  const a = dot(b.position, dir);
  const c = dot([b.position[0] + ext[0], b.position[1] + ext[1], b.position[2] + ext[2]], dir);
  return a <= c ? [a, c] : [c, a];
}

function axis(parts: readonly Board[], dir: readonly number[], name: string, units: Units): DimAxis {
  if (parts.length === 0) return { name, overall: null, chain: [] };
  const line = (from: number, to: number): DimLine => ({ from, to, label: formatLengthBare(to - from, units) });
  const coords = [...new Set(parts.flatMap((b) => extentAlong(b, dir)))].sort((x, y) => x - y);
  const lo = coords[0]!;
  const hi = coords[coords.length - 1]!;
  // Skip a coordinate whose distance from the last kept one READS as zero in these units (metric: '0').
  const zero = formatLengthBare(0, units);
  const kept = [lo];
  for (const c of coords.slice(1)) {
    if (formatLengthBare(c - kept[kept.length - 1]!, units) !== zero) kept.push(c);
  }
  // The maximum always survives, so the chain sums to the overall (spec §5.3, amended).
  if (kept[kept.length - 1] !== hi) {
    if (kept.length > 1) kept[kept.length - 1] = hi;
    else kept.push(hi);
  }
  const chain = kept.length > 2 ? kept.slice(1).map((c, i) => line(kept[i]!, c)) : [];
  return { name, overall: line(lo, hi), chain };
}

/** Overall and chain dimensions for an axis view (spec §5.3). Fitting is `panels/planDims.ts`. */
export function dimensionView(parts: readonly Board[], view: View, units: Units): DimensionSet {
  return {
    horizontal: axis(parts, view.right, view.rightName, units),
    vertical: axis(parts, view.up, view.upName, units),
  };
}
