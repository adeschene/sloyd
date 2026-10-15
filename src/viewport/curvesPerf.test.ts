import { createBoard, partGeometry, archCurve, cornerCurve, curvePlan } from '../document/document';
import type { Board, CurveCut } from '../document/document';
import { bodyMesh } from './grainTiling';

/**
 * Curve rebuild performance (curves spec §3.6). A resize drag rebuilds a curved part every frame — bodies, EDGES (the
 * spike's slow step: bodyEdges over an arch's slices measured 25 ms at 18 chords, 135 ms at 48) and every body's mesh.
 * Each case is a full rebuild through partGeometry with a fresh geometry key (the length moves by a micro-inch), the
 * MINIMUM of 9 runs (load only inflates a run). Bound 40 ms, the holes guard's.
 */
const arch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 }) };
const corners = (['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => ({ id: `${uf}${vf}`, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: vf, radius: 2 }) })));
// Curves through TWO dimensions: the arch, and its own (width min) side's thickness-max edge rounded through the length
// (a second through axis; Task 7's "ARCH + end corner" case).
const endCorner = { id: 'y', ...cornerCurve({ through: 'length', uFrom: 'min', vFrom: 'max', radius: 0.5 }) };
// A NON-CONVEX waste, ear-clipped into several convex pieces: an L-shaped notch from the width min side whose upper
// leg ends in one arc bowing into the wood.
const notchL: CurveCut = {
  id: 'L', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [10, 0],
  segments: [
    { type: 'line', to: [16, 0] }, { type: 'line', to: [16, 1] }, { type: 'line', to: [12, 1] }, { type: 'line', to: [12, 2.5] },
    { type: 'arc', to: [10, 2.5], side: 'right', rise: 0.5 }, { type: 'line', to: [10, 0] },
  ],
};

let tick = 0;
function rebuild(make: (len: number) => Board): number {
  tick += 1;
  const board = make(1 + tick * 1e-6);
  const start = performance.now();
  const g = partGeometry(board);
  void g.edges;
  for (const body of g.bodies) bodyMesh(board, body, g.holes, g.bodies);
  return performance.now() - start;
}
const minOf9 = (make: (k: number) => Board) => {
  for (let i = 0; i < 3; i += 1) rebuild(make);
  return Math.min(...Array.from({ length: 9 }, () => rebuild(make)));
};

describe('a curved part rebuilds inside a frame', () => {
  it('an arched apron (18 chords): at most 40 ms', () => {
    expect(minOf9((k) => createBoard({ length: 30 * k, width: 5, thickness: 0.75, curves: [arch] }))).toBeLessThanOrEqual(40);
  });
  it('a top with four 2" corners: at most 40 ms', () => {
    expect(minOf9((k) => createBoard({ length: 36 * k, width: 20, thickness: 0.75, curves: corners }))).toBeLessThanOrEqual(40);
  });
  it('an arched apron with its arched edge rounded through the length (two through axes): at most 40 ms', () => {
    expect(minOf9((k) => createBoard({ length: 30 * k, width: 5, thickness: 0.75, curves: [arch, endCorner] }))).toBeLessThanOrEqual(40);
  });
  // Bound 100 ms, not 40 (the holes guard's precedent for an unusual case): no preset authors a non-convex waste, only a
  // hand-edited file can. Measured on partGeometry's frozen bodies (83 bodies, 477 faces): bodies ~4 ms, edges ~35 ms,
  // mesh ~8 ms when the guard was written (~48–54 ms in all); since the watertight fix the mesh also welds and conforms
  // every face (conform.ts), and the case measures ~62–72 ms in all (min of 9, a loaded machine). The upstream causes,
  // fu 368: the ear-clip triangles are not merged into convex pieces (14 pieces, each sliced along its extended planes),
  // bodyEdges finds a polygon edge's line by a linear lookup and filters every face per line, and frozen bodies slow
  // bodyEdges about threefold.
  it('an L-shaped notch with one arc (a non-convex waste, ear-clipped): at most 100 ms', () => {
    const board = (k: number) => createBoard({ length: 30 * k, width: 5, thickness: 0.75, curves: [notchL] });
    // The fixture is what it claims: the SPLIT path, more than one convex piece.
    const plan = curvePlan(board(1), notchL);
    expect(plan && !plan.clip && plan.pieces.length).toBeGreaterThan(1);
    expect(minOf9(board)).toBeLessThanOrEqual(100);
  });
});
