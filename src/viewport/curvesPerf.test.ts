import { appendFileSync } from 'node:fs';
import { createBoard, defaultProfile, PROFILE_EDGES, partGeometry, archCurve, cornerCurve, curvePlan, defaultHingeCup, defaultShelfPinRow, holeInStock, stockChecks } from '../document/document';
import type { Board, CurveCut, HoleRow } from '../document/document';
import type { ProfileCut, ProfileEnd } from '../document/types';
import { canonicalRun, geometryBoard } from '../document/profiles';
import { spanOf } from '../document/curves';
import { bodyMesh } from './grainTiling';
import { builtSwept, sweptStops } from '../document/sweep';
import { apronArch, bowFront, frontAndEnds, frontOnly, loop, notchEdge, stopOnArch, stopOnCorner, stopOnNotch, topCorners, wrapFour } from '../document/sweepFixtures';

/**
 * Curve rebuild performance (curves spec §3.6). A resize drag rebuilds a curved part every frame — bodies, EDGES (the
 * spike's slow step: bodyEdges over an arch's slices measured 25 ms at 18 chords, 135 ms at 48) and every body's mesh.
 * Each case is a full rebuild through partGeometry with a fresh geometry key (the length moves by a micro-inch), the
 * MINIMUM of 9 runs (load only inflates a run). Bound 40 ms, the holes guard's.
 *
 * Chunk c1 (2026-10-19, byte-identical speed fixes): every guard over 40 ms was re-set to ⌈the worst minimum of 9 across
 * all runs taken (two of this file alone, two full `npm test` runs) × 1.25⌉ — lowered only, never below the 40 ms default.
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

/** wrapFour's guard (Task 6): a NEW row with no probe guard, over the 40 ms default — its product's minimum of 9 measured
 *  38.0–42.5 alone (load ~1.4) and 41.3–45.5 in three full runs, so the highest, 45.5, + 25% (b1's Q4 amendment), for chunk c.
 *  Chunk c1 (2026-10-19): 26.6–27.6 alone, 29.5–29.6 in two full runs → ⌈29.6 × 1.25⌉ = 37, so the 40 ms default. */
const WRAP_FOUR = 40;
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
  const min = Math.min(...Array.from({ length: 9 }, () => rebuild(make)));
  // SLOYD_PERF_LOG=<file>: each case's minimum appended, so a full-suite run's numbers can be read back (a2 final fix F1).
  if (process.env.SLOYD_PERF_LOG) appendFileSync(process.env.SLOYD_PERF_LOG, `${expect.getState().currentTestName}\t${min.toFixed(1)}\n`);
  return min;
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
  // A hand-edited file only (no preset authors a non-convex waste). Measured before fu 368: 83 bodies, 477 faces, ~52 ms
  // (bounded at 100). fu 368: bodyEdges' line and coplanar-face lookups indexed (~36 ms, output byte-identical), then the
  // ear-clip triangles merged into convex pieces (Hertel–Mehlhorn: 14 pieces -> 2, 83 bodies -> 16): ~6 ms. Bound 40, as
  // every other case; the frozen-bodies slowdown the entry suspected did not reproduce in fresh processes.
  it('an L-shaped notch with one arc (a non-convex waste, ear-clipped and merged): at most 40 ms', () => {
    const board = (k: number) => createBoard({ length: 30 * k, width: 5, thickness: 0.75, curves: [notchL] });
    // The fixture is what it claims: the SPLIT path, more than one convex piece.
    const plan = curvePlan(board(1), notchL);
    expect(plan && !plan.clip && plan.pieces.length).toBeGreaterThan(1);
    expect(minOf9(board)).toBeLessThanOrEqual(40);
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
  // Edge profiles (edge profiles spec §4): the same rebuild, a profile's curves through the length or the width.
  it('a top with the four-edge Roundover set: at most 40 ms', () => {
    const dims = { width: 20, thickness: 0.75 };
    const curves = PROFILE_EDGES.filter((e) => e.vFrom === 'max').map((e, i) => ({ id: `r${i}`, ...defaultProfile({ length: 36, ...dims }, 'roundover', e) }));
    expect(curves).toHaveLength(4);
    expect(minOf9((k) => createBoard({ length: 36 * k, ...dims, curves }))).toBeLessThanOrEqual(40);
  });
  // Final review F3: the four-edge sets that SPLIT (a cove's, a bead's, an ogee's wood is not convex), two through axes
  // meeting at four corners. Before (3dd0eb2; min of 9, load ~5): cove ~42 ms (61 bodies), bead ~56 (57), ogee ~155 (131;
  // bodyEdges ~120 of it). Now a fragment a piece never reaches stays whole and a split waste's diagonals are peeled last
  // (ogee 51 bodies, bead 4, cove 61: no diagonals), and bodyEdges and clip compute each number once (edges byte-identical
  // for the same bodies). The table is in the round's final-fix report.
  // 2026-10-19: the ogee's worst full-run minimum 36.3 ms → ⌈36.3 × 1.25⌉ = 46, over a frame (cove, bead stay at 40).
  // Chunk c1 (2026-10-19): the ogee 16.2–16.6 alone, 18.8–18.9 in two full runs → back to the 40 ms default.
  const fourEdgeBound = { cove: 40, bead: 40, ogee: 40 } as const;
  for (const kind of ['cove', 'bead', 'ogee'] as const) {
    const bound = fourEdgeBound[kind];
    it(`a top with the four-edge ${kind} set: at most ${bound} ms`, () => {
      const dims = { width: 20, thickness: 0.75 };
      const curves = PROFILE_EDGES.filter((e) => e.vFrom === 'max').map((e, i) => ({ id: `p${i}`, ...defaultProfile({ length: 36, ...dims }, kind, e) }));
      expect(curvePlan({ length: 36, ...dims }, curves[0]!)).toMatchObject({ clip: false });
      expect(minOf9((k) => createBoard({ length: 36 * k, ...dims, curves }))).toBeLessThanOrEqual(bound);
    });
  }
  it('a shelf with an ogee on a long edge and a bead on an end (mixed axes): at most 40 ms', () => {
    const dims = { width: 10, thickness: 0.75 };
    const curves = [
      { id: 'o', ...defaultProfile({ length: 36, ...dims }, 'ogee') },
      { id: 'b', ...defaultProfile({ length: 36, ...dims }, 'bead', { through: 'width', uFrom: 'max', vFrom: 'max' }) },
    ];
    expect(minOf9((k) => createBoard({ length: 36 * k, ...dims, curves }))).toBeLessThanOrEqual(40);
  });
  // Profile runs a2 (Task 5): a stopped profile on the shelf's width-max side of the top, stops 3" in from each end — the
  // band, both run-outs (sectors about the bit's axis) and every body's mesh, as above.
  const stoppedSizes = { roundover: { size: 0.25, fillet: 0 }, cove: { size: 0.375, fillet: 0 }, ogee: { size: 0.5, fillet: 0 } } as const;
  for (const kind of ['roundover', 'cove', 'ogee'] as const) {
    it(`a shelf with a stopped ${kind}, 3" in from each end: at most 40 ms`, () => {
      const board = (k: number) => {
        const dims = { length: 30 * k, width: 10, thickness: 0.75 };
        const side = { across: 'width' as const, from: 'max' as const };
        const start: ProfileEnd = { side, from: 'min', at: 3 };
        const end: ProfileEnd = { side: { ...side }, from: 'max', at: 3 };
        const p: ProfileCut = { id: 'p', face: 'max', kind, ...stoppedSizes[kind], facing: 'face', run: canonicalRun(dims, 'max', { start, end }) };
        return createBoard({ ...dims, profiles: [p] });
      };
      // The fixture is what it claims: a stopped profile, both ends.
      expect(spanOf(geometryBoard(board(1)).curves[0]!)).toMatchObject({ stopLo: true, stopHi: true });
      expect(minOf9(board)).toBeLessThanOrEqual(40);
    });
  }
});

// Profile runs b1 (Task 5; spec Q4, the Global Constraints' table): a profile that FOLLOWS the outline — the swept band built
// from the outline's skeleton, every body's mesh with its swept normals — rebuilt as above, on the b1 fixtures
// (sweepFixtures.ts). The length moves by a micro-inch: the corners and the arch are written from the min end, so they keep.
describe('a swept profile\'s part rebuilds inside a frame (profile runs b1)', () => {
  const at = (b: Board) => (k: number) => createBoard({ ...b, length: b.length * k });
  // Measured 2026-10-18 (min of 9, ms; this file alone at load ~1.5 / the full suite, load 1.5 -> 4.2), after Task 6's
  // built swept edges (curvedEdges' fast path: seams dropped, section-to-section lines decided by their tags, not searched
  // for by bodyEdges) — the controller's Task 5 ruling moved the four binding 40 ms rows here with that path. Three now pass
  // in both runs: the 2" roundover loop (27.1 / 33.1), the thumbnail loop (27.2 / 28.8), the front End to end with B1
  // run-outs (32.0 / 37.2). The BEAD loop misses 40: once its quirk wall became its own tagged section face (inv 16: no
  // facet lines, smooth shading; a third section piece per segment) it measured 53–58 ms — the controller's Task 6 ruling
  // made it a chunk-c speed row beside cove and ogee (spec Q4), guarded at 58 + 25%. Cove, ogee and both faces
  // fell (cove 64.3 / 63.1, ogee 80.2 / 90.1, both 59.9 / 61.9; were 95–113, 125–141, 77–83): each is guarded at its higher
  // minimum + 25% (Task 5 showed 25% over a single run's minimum flakes), and cove and ogee now measure inside Q4's 80 and 105.
  const swept: [string, Board, number][] = [
    ['a roundover 1/4" along the arched apron', apronArch, 40],
    ['a roundover 1/4" all round the 1/2" corner top', topCorners(0.5), 40],
    ['a roundover 3/8" round the notch', notchEdge, 40],
    // 2026-10-19: worst full-run minimum 35.4 ms → 45, over a frame. Chunk c1: 20.5–20.9 alone, 21.9–22.7 full → 40.
    ['a roundover 1/4" all round the 2" corner top', topCorners(2), 40],
    // 2026-10-19: worst full-run minimum 32.9 ms → 42, over a frame. Chunk c1: 20.5–22.4 alone, 21.4–24.4 full → 40.
    ['a thumbnail all round the 2" top', topCorners(2, loop('p1', 0.75, 'thumbnail')), 40],
    // 2026-10-19: worst full-run minimum 37.2 ms → 47, over a frame. Chunk c1: 21.7–22.3 alone, 23.0–23.6 full → 40.
    ['a roundover End to end on the front of the 2" top (B1 run-outs)', frontOnly, 40],
    // 2026-10-19: worst full-run minimum 70.8 ms → 89. Chunk c1: 45.8 alone, 55.6–56.6 full → ⌈56.6 × 1.25⌉ = 71.
    ['a bead all round the 2" top', topCorners(2, loop('p1', 0.25, 'bead')), 71],
    // 2026-10-19: worst full-run minimum 68.1 ms → 86. Chunk c1: 45.5–49.4 alone, 46.0–47.1 full → ⌈49.4 × 1.25⌉ = 62.
    ['a cove all round the 2" top', topCorners(2, loop('p1', 0.375, 'cove')), 62],
    // Chunk c1: 60.9–62.6 alone, 64.3–64.7 full → ⌈64.7 × 1.25⌉ = 81 (was 113).
    ['an ogee all round the 2" top', topCorners(2, loop('p1', 0.375, 'ogee')), 81],
  ];
  for (const [name, board, bound] of swept) {
    it(`${name}: at most ${bound} ms`, () => {
      // The fixture is what it claims: a built swept profile.
      expect(builtSwept(geometryBoard(board))).toHaveLength(1);
      expect(minOf9(at(board))).toBeLessThanOrEqual(bound);
    });
  }
  // Review Focus 4: All round the top AND the bottom (one outline, two swept profiles). Measured 59.9 / 61.9 (alone / full
  // suite, Task 6; was 76.8 / 83.0): guarded at 61.9 + 25%.
  // 2026-10-19: worst full-run minimum 65.6 ms → 82. Chunk c1: 36.5–37.2 alone, 38.1–40.3 full → ⌈40.3 × 1.25⌉ = 51.
  it('a roundover all round the top and the bottom of the 2" top: at most 51 ms', () => {
    const board: Board = { ...topCorners(2), profiles: [loop('t'), loop('m', 0.25, 'roundover', 'min')] };
    expect(builtSwept(geometryBoard(board))).toHaveLength(2);
    expect(minOf9(at(board))).toBeLessThanOrEqual(51);
  });
});

// Profile runs b2 (Task 6; the Global Constraints' table): a stop on a turned path — the swept band, the stop's run-out
// revolved about the bit's axis outside its model chord (`stopRunoutPieces`), every body's mesh with its stop normals — and
// runs across two sides, rebuilt as above. Guards are Task 1's (the probe's TOTAL × 1.8 ≤ 40 → 40, else ⌈TOTAL × 1.8 × 1.25⌉),
// each checked against the PRODUCT's minimum of 9 alone and in a full run (Task 6's report has the table). The worst of Task
// 5's repros (wrapThree, wrapFour, shortEnds and the three station runs), wrapFour, has no probe guard: measured + 25%.
describe('a b2 profile\'s part rebuilds inside a frame (profile runs b2)', () => {
  const at = (b: Board) => (k: number) => createBoard({ ...b, length: b.length * k });
  const b2: [string, Board, number, number][] = [
    ['a roundover 1/4" stopped on a 2" corner arc to 30"', stopOnCorner(), 2, 40],
    // 2026-10-19: worst full-run minimum 32.5 ms → 41, over a frame. Chunk c1: 22.9–25.8 alone, 24.5–24.7 full → 40.
    ['a cove 3/8" stopped on a 2" corner arc to 30"', stopOnCorner('cove', 0.375), 2, 40],
    ['a roundover 1/4" stopped on the arch (10", 20")', stopOnArch, 2, 40],
    // Chunk c1: 22.5 alone, 23.6–24.8 full → 40 (was 60).
    ['a roundover 3/8" stopped on the notch (14.5") to 25"', stopOnNotch, 2, 40],
    ['a roundover 1/4" stopped on a bow (5", 25")', bowFront, 2, 40],
    // Chunk c1: 21.3–21.4 alone, 23.3–23.5 full → 40 (was 51).
    ['a roundover 1/4" on two sides, the front and both ends', frontAndEnds(), 2, 40],
    // The final review's M4 (the controller's ruling): Task 1's 102 was ~1.85× the product's time; tightened to the measured
    // full-suite minimum + 25% (2026-10-19: 55.3 ms alone, 55.0 in a full run → ⌈55.0 × 1.25⌉ = 69).
    // 2026-10-19 (re-baseline after the merge): worst full-run minimum 57.8 ms → 73.
    // Chunk c1: 42.9–46.3 alone, 47.4–48.9 full → ⌈48.9 × 1.25⌉ = 62.
    ['a cove 3/8" on two sides, the front and both ends', frontAndEnds('cove', 0.375), 2, 62],
    ['a roundover 1/4" round four sides and three arcs (wrapFour)', wrapFour(), 2, WRAP_FOUR],
  ];
  for (const [name, board, stops, bound] of b2) {
    it(`${name}: at most ${bound} ms`, () => {
      // The fixture is what it claims: one built swept profile with its stops.
      const v = geometryBoard(board);
      expect(builtSwept(v)).toHaveLength(1);
      expect(sweptStops(v, v.profiles[0]!)).toHaveLength(stops);
      expect(minOf9(at(board))).toBeLessThanOrEqual(bound);
    });
  }
});
