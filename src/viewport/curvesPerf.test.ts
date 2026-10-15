import { createBoard, partGeometry, archCurve, cornerCurve, curvePlan, defaultHingeCup, defaultShelfPinRow, holeInStock, stockChecks } from '../document/document';
import type { Board, CurveCut, HoleRow } from '../document/document';
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

// fu 369: an arched bookcase side drilled for shelf pins (two rows, front and back, 1 1/2" in) and a door's arched stile
// with a 35 mm hinge cup — holes on the broad face of a SPLIT arch, whose slices cut that face into strips.
const side = { length: 36, width: 11.25, thickness: 0.75 };
const sideArch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 4, span: 28, rise: 1 }) };
const pinRows = (b: Board): HoleRow[] => {
  const row = defaultShelfPinRow(b)!;
  return [{ id: 'f', ...row, inset: 2 }, { id: 'b', ...row, acrossFrom: 'max', inset: 2 }];
};
const stile = { length: 30, width: 5, thickness: 0.75 };
const stileArch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'max', from: 'min', start: 6, span: 18, rise: 1 }) };
const cup = (b: Board): HoleRow[] => [{ id: 'c', ...defaultHingeCup(b), station: 10 }];

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
  // fu 369: holes on a split arch's strips. Before the fix each strip a mouth crossed was wedge-split by every hole (the
  // side's bodies, edges and mesh measured ~55 ms, 51 of them mesh); each holed plane is now merged and triangulated once:
  // ~16 ms, the stile ~6. The holes' own mesh (holesMesh, ~13 ms for the side's 52 bores) is not timed here: it costs the
  // same on a part without curves (13.8 ms against 13.4, measured) and holesPerf.test.ts guards it.
  it('an arched bookcase side with two shelf-pin rows: at most 40 ms', () => {
    const board = (k: number) => { const b = createBoard({ ...side, length: 36 * k, curves: [sideArch] }); return createBoard({ ...side, length: 36 * k, curves: [sideArch], holes: pinRows(b) }); };
    const b1 = board(1);
    expect(curvePlan(b1, sideArch)?.clip).toBe(false);
    expect(partGeometry(b1).holes.length).toBeGreaterThan(30);
    expect(partGeometry(b1).holes.every((h) => holeInStock(b1, h, stockChecks(b1)))).toBe(true);
    expect(minOf9(board)).toBeLessThanOrEqual(40);
  });
  it('an arched stile with a 35 mm hinge cup: at most 40 ms', () => {
    const board = (k: number) => { const b = createBoard({ ...stile, length: 30 * k, curves: [stileArch] }); return createBoard({ ...stile, length: 30 * k, curves: [stileArch], holes: cup(b) }); };
    const b1 = board(1);
    expect(curvePlan(b1, stileArch)?.clip).toBe(false);
    expect(partGeometry(b1).holes.every((h) => holeInStock(b1, h, stockChecks(b1)))).toBe(true);
    expect(minOf9(board)).toBeLessThanOrEqual(40);
  });
});
