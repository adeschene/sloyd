import { createBoard, partGeometry } from '../document/document';
import type { Board } from '../document/document';
import { bodyMesh, holeMesh } from './grainTiling';

/**
 * Hole rebuild performance (Task 11b). A resize drag rebuilds a holed part's meshes every frame, so a full rebuild —
 * every body's mesh and every hole's wall — must stay well inside a frame. Measured target 16 ms; the bound here is 2.5x
 * that, so a loaded machine does not flake it, while a return of the per-face prism rebuilds and per-vertex allocation
 * (107 and 131 ms in the live check) still fails it.
 *
 * Each run reads the part through partGeometry with a fresh geometry key (the length moves by a micro-inch), exactly
 * as a drag frame does: new, frozen bodies and holes, so nothing is reused from the run before. bodyMesh gets the part's
 * bodies, as BoardMesh passes them, so seams inside a holed body are skipped (ruling R11).
 */
const pinRow = (id: string, acrossFrom: 'min' | 'max') => ({
  id, face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const,
  alongFrom: 'min' as const, station: 2, count: 21, pitch: 32 / 25.4, acrossFrom, inset: 1.5,
});
const rows = [pinRow('r1', 'min'), pinRow('r2', 'max')];
// Clear of the pins: the last pin's far edge is at 2 + 20 * 32mm + 1/8 ≈ 27.32in.
const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 28.25, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };

const side = (length: number, cuts: Board['cuts']) => createBoard({ id: 'side', length, width: 11.25, thickness: 0.75, cuts, holes: rows });

let tick = 0;
function rebuild(cuts: Board['cuts']): number {
  tick += 1;
  const board = side(30 + tick * 1e-6, cuts);
  const start = performance.now();
  const { bodies, holes } = partGeometry(board);
  for (const body of bodies) bodyMesh(board, body, holes, bodies);
  for (const h of holes) holeMesh(board, h, bodies);
  return performance.now() - start;
}

function medianOf7(cuts: Board['cuts']): number {
  for (let i = 0; i < 3; i += 1) rebuild(cuts);
  const ts = Array.from({ length: 7 }, () => rebuild(cuts)).sort((a, b) => a - b);
  return ts[3]!;
}

describe('a holed part rebuilds inside a frame (Task 11b)', () => {
  it('two shelf-pin rows (42 holes): median of 7 full rebuilds is at most 40 ms', () => {
    expect(medianOf7([])).toBeLessThanOrEqual(40);
  });
  it('the same rows and a dado clear of the pins: median of 7 full rebuilds is at most 40 ms', () => {
    expect(medianOf7([dado])).toBeLessThanOrEqual(40);
  });
});
