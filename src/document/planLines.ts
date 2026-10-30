import type { AnyLine } from './types';
import type { P2, View } from './drawing';
import { lineDir } from './snapPoints';

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/**
 * Each construction line as a segment in `view`'s drawing plane, clipped to `bounds` (construction-lines-2 spec §6): the
 * infinite 2-D line through the projected `at`, cut to the rectangle by Liang–Barsky. A line seen end-on (parallel to the
 * sight direction) is a point and is skipped, as is one that misses the rectangle. Numbers only; the sheet maps them to SVG.
 */
export function planLines(lines: readonly AnyLine[], view: View, bounds: { min: P2; max: P2 }): { a: P2; b: P2 }[] {
  const out: { a: P2; b: P2 }[] = [];
  for (const line of lines) {
    const u = lineDir(line);
    if (Math.abs(dot(u, view.toward)) > 1 - 1e-12) continue;
    const p: P2 = [dot(line.at, view.right), dot(line.at, view.up)];
    const d: P2 = [dot(u, view.right), dot(u, view.up)];
    let t0 = -Infinity;
    let t1 = Infinity;
    let miss = false;
    for (const k of [0, 1] as const) {
      if (d[k] === 0) {
        if (p[k] < bounds.min[k] || p[k] > bounds.max[k]) miss = true;
        continue;
      }
      const ta = (bounds.min[k] - p[k]) / d[k];
      const tb = (bounds.max[k] - p[k]) / d[k];
      t0 = Math.max(t0, Math.min(ta, tb));
      t1 = Math.min(t1, Math.max(ta, tb));
    }
    if (miss || t0 >= t1) continue;
    out.push({ a: [p[0] + t0 * d[0], p[1] + t0 * d[1]], b: [p[0] + t1 * d[0], p[1] + t1 * d[1]] });
  }
  return out;
}
