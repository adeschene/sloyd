import { createBoard, partGeometry, stockChecks } from '../document/document';
import type { Board } from '../document/document';
import { bodyMesh, holesMesh } from './grainTiling';

/**
 * Hole rebuild performance (Task 11b). A resize drag rebuilds a holed part's meshes every frame, so a full rebuild —
 * every body's mesh and every hole's wall — must stay well inside a frame. What each case guards:
 * - two shelf-pin rows, and the rows with a dado clear of them (bound 40 ms, 2.5x the 16 ms target): the per-vertex
 *   work, the seam faces a holed body skips (ruling R11; disabling the skip fails the clear-dado case) and the
 *   bounding-box reject (R10);
 * - the rows with a dado they CROSS (a faulted row, bound 100 ms, about 3x its measured 31-32 ms): the fallback split,
 *   where the memoised prism per Hole and the prism built once per hole (not per piece) carry the cost — reverting
 *   them takes this case to about 135-140 ms.
 * The clean-hole wall path (ruling R15) is pinned deterministically, not here: grainTiling.test.ts' "per hole: one
 * quad per facet (no seam split, nothing doubled)…" counts 96 wall triangles where the clipped path draws 192.
 *
 * Each case times the MINIMUM of 9 runs, not the median (ruling R19): machine load can only inflate a run, never
 * deflate it, so the minimum is load-robust while a real regression raises every run and so the minimum too.
 *
 * Each run reads the part through partGeometry with a fresh geometry key (the length moves by a micro-inch), exactly
 * as a drag frame does: new, frozen bodies and holes, so nothing is reused from the run before. bodyMesh gets the part's
 * bodies and holesMesh (every hole's holeMesh, merged) the board's stockChecks, as BoardMesh passes them.
 */
const pinRow = (id: string, acrossFrom: 'min' | 'max') => ({
  id, face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const,
  alongFrom: 'min' as const, station: 2, count: 21, pitch: 32 / 25.4, acrossFrom, inset: 1.5,
});
const rows = [pinRow('r1', 'min'), pinRow('r2', 'max')];
// Clear of the pins: the last pin's far edge is at 2 + 20 * 32mm + 1/8 ≈ 27.32in.
const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 28.25, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
// Across the rows: the 8th pin of each (station 2 + 7 * 32mm ≈ 10.82in) runs into the dado's wall — off-flat.
const crossingDado = { ...dado, offset: 10 };

const side = (length: number, cuts: Board['cuts']) => createBoard({ id: 'side', length, width: 11.25, thickness: 0.75, cuts, holes: rows });

let tick = 0;
function rebuild(cuts: Board['cuts']): number {
  tick += 1;
  const board = side(30 + tick * 1e-6, cuts);
  const start = performance.now();
  const { bodies, holes } = partGeometry(board);
  for (const body of bodies) bodyMesh(board, body, holes, bodies);
  const checks = stockChecks(board);
  holesMesh(board, holes, bodies, checks);   // every hole in one geometry, as BoardMesh draws them (final review 2)
  return performance.now() - start;
}

function minOf9(cuts: Board['cuts']): number {
  for (let i = 0; i < 3; i += 1) rebuild(cuts);
  return Math.min(...Array.from({ length: 9 }, () => rebuild(cuts)));
}

describe('a holed part rebuilds inside a frame (Task 11b)', () => {
  it('two shelf-pin rows (42 holes): minimum of 9 full rebuilds is at most 40 ms', () => {
    expect(minOf9([])).toBeLessThanOrEqual(40);
  });
  it('the same rows and a dado clear of the pins: minimum of 9 full rebuilds is at most 40 ms', () => {
    expect(minOf9([dado])).toBeLessThanOrEqual(40);
  });
  it('the same rows and a dado they cross (faulted): minimum of 9 full rebuilds is at most 100 ms', () => {
    expect(minOf9([crossingDado])).toBeLessThanOrEqual(100);
  });
});
