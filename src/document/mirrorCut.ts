import type { Cut, Dimension } from './types';
import { DIMENSION_ORDER } from './geometry';

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** One cut mirrored along dimension d (u -> size - u). face, across and the
 *  position axis are three different dimensions, so exactly one case applies.
 *
 *  The position-axis case CLIPS BEFORE IT REFLECTS. validateCuts clamps offset
 *  into [0, size] and then width into [0, size - offset], so what a v7 build
 *  removed is the raw interval clipped to the board; reflecting the RAW
 *  interval and letting validateCuts clamp afterwards is a different cut
 *  whenever it runs past an end (an overhang migrates wider, a cut the loader
 *  dropped comes back as a real one). So the clip here is validateCuts' clamp,
 *  in its order, and a cut it would drop is returned raw for it to drop.
 *
 *  The far end is reflected as ONE sum, `size - (lo + width)`: the clipped far
 *  end `lo + width` is exactly what validateCuts' cut reached, so a decimal cut
 *  flush with the far end lands at exactly 0 instead of a float residue away
 *  from it (`size - lo - width` leaves ~7e-16, a sliver solid). Nothing is
 *  snapped: a cut that stopped 1e-10 short of an end in v7 left a real sliver
 *  there, and the migration keeps it (spec §4, identical world solids).
 *
 *  The mirror case, a cut flush with the NEAR end, needs the width instead:
 *  on a non-dyadic board `(size - w) + w` can fall an ulp short of `size`,
 *  leaving a ~1e-15 sliver at the far end. So that cut stores
 *  `width = size - offset`, which is exact (Sterbenz: offset >= size/2, or
 *  offset is already exactly size - w), and offset + width === size. Exact
 *  arithmetic, not a tolerance, so the no-snap rule above still holds. */
export function mirrorCutAlong(raw: unknown, d: Dimension, size: number): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const c = raw as Record<string, unknown>;
  if (c.face === d) {
    return c.from === 'min' ? { ...c, from: 'max' } : c.from === 'max' ? { ...c, from: 'min' } : raw;
  }
  if (c.across === d) return { ...c, stopMin: c.stopMax, stopMax: c.stopMin };
  const dims = DIMENSION_ORDER as string[];
  if (!dims.includes(c.face as string) || !dims.includes(c.across as string)) return raw;
  if (typeof c.offset !== 'number' || !Number.isFinite(c.offset)) return raw;
  if (typeof c.width !== 'number' || !Number.isFinite(c.width)) return raw;
  const lo = clamp(c.offset, 0, size);
  const width = clamp(c.width, 0, size - lo);
  if (width <= 0) return raw;
  const offset = size - (lo + width);
  // Flush with the near end: store the width that reaches the far end
  // EXACTLY. offset is then >= size/2 (Sterbenz) or already size - width
  // exactly, so size - offset is exact and offset + width === size.
  return { ...c, offset, width: lo === 0 ? size - offset : width };
}

/**
 * A validated cut mirrored along part dimension `d` (u -> size - u): the
 * composition's use of the migrations' one hand reflection (mirrored-instances
 * spec §3; invariant 44). A validated cut always has a numeric offset and
 * width inside the board, so the raw paths of mirrorCutAlong are not reached.
 */
export function mirrorCut(c: Cut, d: Dimension, size: number): Cut {
  return mirrorCutAlong(c, d, size) as Cut;
}
