import { createBoard, sectionCaps } from '../document/document';
import type { Board, Section } from '../document/document';

/**
 * Section cap rebuild performance. The Section slider recomputes `sectionCaps` for every crossed part on every frame, so
 * a cap must stay well inside a 16 ms frame. Each case times the MINIMUM of 9 runs (machine load only inflates a run),
 * each on a fresh geometry key (the length moves by a micro-inch, as holesPerf does). Only `sectionCaps` is timed (the
 * BoardMesh's fan/normal building sits on top). Bounds are about 3x the measured minimum, rounded up to 5 ms.
 *
 * Measured minima on this machine (ms), before the perf round -> after it:
 * - top plane through the pins' depth, ACROSS 42 bores (about 2000 cap pieces): 36-38 -> 13.5-14.2 (bound 45). The rewrite:
 *   unionOutline's line grouping bucketed on its tolerances (was a linear scan, about 18-21 ms) and its weights swept
 *   (about 8-9 ms after the bucketing, 5 ms after the sweep), the world map done as one affine map per axis (about
 *   2 ms), a box prefilter before minusPrism (about 3 ms). What is left is minusPrism's wedge splitting, about 8 ms.
 * - front plane at the rows' inset, ALONG a row of 21 bores: 3.7-4.8 -> 2.1-2.5 (bound 10).
 * - side plane through a dado the pins cross: 1.0-1.8 -> 0.3 (bound 5).
 * Mutation (holePrism(hole, 47) in localCapPieces, forcing a fresh unmemoised prism per hole per run): it did NOT slow the across-bores case (13.5 -> 7.7 ms: a 47-gon has fewer facets, and every run's
 * holes are fresh, so the memo is never hit within one cap). The guard therefore guards the absolute budget only.
 */
const pinRow = (id: string, acrossFrom: 'min' | 'max') => ({
  id, face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const,
  alongFrom: 'min' as const, station: 2, count: 21, pitch: 32 / 25.4, acrossFrom, inset: 1.5,
});
const rows = [pinRow('r1', 'min'), pinRow('r2', 'max')];
const crossingDado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };

const side = (length: number, cuts: Board['cuts']) => createBoard({ id: 'side', length, width: 11.25, thickness: 0.75, cuts, holes: rows });

let tick = 0;
function rebuild(cuts: Board['cuts'], s: Section): number {
  tick += 1;
  const board = side(30 + tick * 1e-6, cuts);
  const start = performance.now();
  sectionCaps(board, s);
  return performance.now() - start;
}

function minOf9(cuts: Board['cuts'], s: Section): number {
  for (let i = 0; i < 3; i += 1) rebuild(cuts, s);
  return Math.min(...Array.from({ length: 9 }, () => rebuild(cuts, s)));
}

describe('a section cap rebuilds inside a frame', () => {
  it('across 42 shelf-pin bores (top plane at the pins\' depth): minimum of 9 is at most 45 ms', () => {
    expect(minOf9([], { axis: 'top', at: 0.6, flip: false })).toBeLessThanOrEqual(45);
  });
  it('along a row of 21 bores (front plane at the inset): minimum of 9 is at most 10 ms', () => {
    expect(minOf9([], { axis: 'front', at: 1.5, flip: false })).toBeLessThanOrEqual(10);
  });
  it('through a dado the pins cross (side plane): minimum of 9 is at most 5 ms', () => {
    expect(minOf9([crossingDado], { axis: 'side', at: 10.4, flip: false })).toBeLessThanOrEqual(5);
  });
});
