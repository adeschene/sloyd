import { clipPolygon, createBoard, defaultProfile, PROFILE_EDGES, profileCurve, curvePlan, holePrism, holeRing, defaultArch, defaultBow, defaultHingeCup, defaultNotch, defaultShelfPinRow, holeFaults, holeInStock, holePieces, holeTouches, partGeometry, sectionCaps, stockChecks } from '../document/document';
import type { Board, CurveCut, Hole, HoleRow, V3 } from '../document/document';
import type { ProfileCut, ProfileEnd, ProfileKind } from '../document/types';
import { canonicalRun, geometryBoard, profileFaults, shapedPart } from '../document/profiles';
import { spanOf } from '../document/curves';
import { runoutReach } from '../document/runout';
import { capFill } from './capFill';
import { bodyMesh, drawsAsBox, holesMesh, partMesh } from './grainTiling';
import { chamferCut } from '../document/angleCuts';
import { builtSwept, sweptStops } from '../document/sweep';
import { mirrorPart } from '../document/frames';
import { defaultHole } from '../document/holes';
import { tenonFaults } from '../document/roundTenons';
import { stoolLegs } from '../document/stoolFixture';
import { HEADED_CASES } from '../document/meshCases';
import { apronArch, endToEnd, frontOnly, loop, notchEdge, topCorners, bowFront, chiralTwoSide, frontAndEnds, shortEnds, stationFrontToBack,
  stationFrontToRight, stationRightToBack, cornerGap, overlapCases, stopOnArch, stopOnCorner, stopOnNotch, twoSideSharp, wrapFour, wrapThree, zoneStop } from '../document/sweepFixtures';

/**
 * A curved part's mesh is WATERTIGHT (whole-branch review, finding 1): a SPLIT curve leaves its slices' faces meeting
 * at T-junctions (a slice's chord vertex on its neighbour's long edge), which cracked the arch's shadow and section cap.
 * The criterion is exact — no tolerance, which would hide a one-ulp crack: vertices are compared as the Float32 numbers
 * the GPU receives (the mesh's own Float32Array), and every DIRECTED edge of every triangle must be matched by as many
 * copies of its reverse. A box cell beside the slices is drawn through bodyMesh too (drawsAsBox is false for every body
 * of a curved part), so partMesh (every body's bodyMesh, one geometry) is exactly what BoardMesh draws, and with a holed
 * part the holes' mesh (holesMesh, one geometry) joins it: a bore's wall must meet the face around its mouth (fu 369).
 */
function unmatchedEdges(board: Board): { triangles: number; unmatched: number } {
  const { bodies, holes } = partGeometry(board);
  const count = new Map<string, number>();
  let triangles = 0;
  for (const body of bodies) expect(drawsAsBox(board, body, holes)).toBe(false);
  // Chunk c2 (stage 1): the one geometry BoardMesh draws. A flat holed part (angled holes Task 4) is not shaped: BoardMesh
  // draws each holed body through bodyMesh, so its bodies' meshes are what it draws.
  const meshes = shapedPart(geometryBoard(board)) ? [partMesh(board, bodies, holes).positions] : bodies.map((body) => bodyMesh(board, body, holes, bodies).positions);
  const h = holesMesh(board, holes, bodies, stockChecks(board));
  if (h) meshes.push(h.positions);
  for (const p of meshes) {
    const key = (i: number) => `${p[3 * i]},${p[3 * i + 1]},${p[3 * i + 2]}`;
    for (let t = 0; t < p.length / 9; t += 1) {
      triangles += 1;
      const k = [key(3 * t), key(3 * t + 1), key(3 * t + 2)];
      for (let e = 0; e < 3; e += 1) {
        const edge = `${k[e]}|${k[(e + 1) % 3]}`;
        count.set(edge, (count.get(edge) ?? 0) + 1);
      }
    }
  }
  let unmatched = 0;
  for (const [edge, n] of count) {
    const [a, b] = edge.split('|');
    if ((count.get(`${b}|${a}`) ?? 0) !== n) unmatched += 1;
  }
  return { triangles, unmatched };
}

const apron = { length: 30, width: 5, thickness: 0.75 };
const arch: CurveCut = { id: 'a', ...defaultArch(apron)! };
const notch: CurveCut = { id: 'n', ...defaultNotch(apron)! };
// The default Bow written at a 30" edge, on a part then lengthened to 36": span < edge, so the SPLIT path.
const bow: CurveCut = { id: 'b', ...defaultBow(apron) };
// curvesPerf's L-shaped notch: a non-convex waste, ear-clipped.
const notchL: CurveCut = {
  id: 'L', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [10, 0],
  segments: [
    { type: 'line', to: [16, 0] }, { type: 'line', to: [16, 1] }, { type: 'line', to: [12, 1] }, { type: 'line', to: [12, 2.5] },
    { type: 'arc', to: [10, 2.5], side: 'right', rise: 0.5 }, { type: 'line', to: [10, 0] },
  ],
};
// A dado clear of the arch (which ends at 27"): its cells beyond stay boxes, beside the arch's slices.
const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 28, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };

const cases: [string, Board][] = [
  ['the default Arch', createBoard({ ...apron, curves: [arch] })],
  ['the default Half-round notch', createBoard({ ...apron, curves: [notch] })],
  ['a Bow on a part lengthened past its span', createBoard({ ...apron, length: 36, curves: [bow] })],
  ['an L-shaped notch with one arc', createBoard({ ...apron, curves: [notchL] })],
  ['the Arch beside a dado (box cells next to the slices)', createBoard({ ...apron, curves: [arch], cuts: [dado] })],
];

describe('a curved part\'s mesh is watertight (every directed edge matched, exact at Float32)', () => {
  it('the fixtures are what they claim: split curves, and box cells beside the slices', () => {
    for (const [, b] of cases) for (const c of b.curves) expect(curvePlan(b, c)?.clip).toBe(false);
    const withDado = cases[4]![1];
    expect(partGeometry(withDado).bodies.some((body) => body.box !== null)).toBe(true);
    expect(partGeometry(withDado).bodies.some((body) => body.box === null)).toBe(true);
  });
  it.each(cases)('%s', (_name, board) => {
    const { triangles, unmatched } = unmatchedEdges(board);
    expect(triangles).toBeGreaterThan(0);
    expect(unmatched).toBe(0);
  });
  it('a part without curves still draws its plain cells as boxes', () => {
    const plain = createBoard({ ...apron, cuts: [dado] });
    const { bodies, holes } = partGeometry(plain);
    expect(bodies.every((body) => drawsAsBox(plain, body, holes))).toBe(true);
  });
});

// Edge profiles (edge profiles spec §4): a profile is a curve, so its part's mesh must close too.
const top = { length: 36, width: 20, thickness: 0.75 };
const shelf = { length: 36, width: 10, thickness: 0.75 };
const fourEdges = PROFILE_EDGES.filter((e) => e.vFrom === 'max').map((e, i): CurveCut => ({ id: `r${i}`, ...defaultProfile(top, 'roundover', e) }));
const profiled: [string, Board][] = [
  ['a top with the four-edge Roundover set', createBoard({ ...top, curves: fourEdges })],
  ['a shelf with an ogee on a long edge and a bead on an end', createBoard({ ...shelf, curves: [
    { id: 'o', ...defaultProfile(shelf, 'ogee') }, { id: 'b', ...defaultProfile(shelf, 'bead', { through: 'width', uFrom: 'max', vFrom: 'max' }) }] })],
  ['a cove', createBoard({ ...top, curves: [{ id: 'c', ...defaultProfile(top, 'cove') }] })],
  ['a thumbnail', createBoard({ ...top, curves: [{ id: 't', ...defaultProfile(top, 'thumbnail') }] })],
  ['a filleted ogee', createBoard({ ...top, curves: [{ id: 'f', ...profileCurve({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'ogee', facing: 'v', size: 0.5, fillet: 0.0625 }) }] })],
  // Final review F3: the four-edge sets that split, two through axes meeting at four corners.
  ...(['cove', 'bead', 'ogee'] as const).map((kind): [string, Board] => [`a top with the four-edge ${kind} set`,
    createBoard({ ...top, curves: PROFILE_EDGES.filter((e) => e.vFrom === 'max').map((e, i): CurveCut => ({ id: `${kind}${i}`, ...defaultProfile(top, kind, e) })) })]),
  ['a top with the four-edge filleted Roundover set', createBoard({ ...top, curves: PROFILE_EDGES.filter((e) => e.vFrom === 'max')
    .map((e, i): CurveCut => ({ id: `f${i}`, ...profileCurve({ ...e, kind: 'roundover', facing: 'v', size: 0.25, fillet: 0.0625 }) })) })],
];
describe('an edge-profiled part\'s mesh is watertight', () => {
  it.each(profiled)('%s', (_name, board) => {
    const { triangles, unmatched } = unmatchedEdges(board);
    expect(triangles).toBeGreaterThan(0);
    expect(unmatched).toBe(0);
  });
});

// Profile runs a2 (Task 5): a STOPPED profile's run-outs — sectors about the bit's axis, each a convex body, plus the accepted
// chord scraps (1e-7–2e-6 in³ bodies 0.2–0.5" past a stop) — must close against the band and the rest of the part too.
const stoppedShelf = { length: 30, width: 10, thickness: 0.75 };
const stoppedSizes: Record<'roundover' | 'cove' | 'ogee' | 'bead' | 'thumbnail', { size: number; fillet?: number; depth?: number }> = {
  roundover: { size: 0.25, fillet: 0 }, cove: { size: 0.375, fillet: 0 }, ogee: { size: 0.5, fillet: 0 },
  // Final fix F7: the kinds with straight revolved walls (a bead's quirk, a thumbnail's flat: lineNormals).
  bead: { size: 0.25, fillet: 0.0625 }, thumbnail: { size: 0.75, depth: 0.25 },
};
/** A shelf with one profile on the width-max side of the top face; `lo`/`hi` a station's distance from the length's min/max
 *  end, or null: out through that end. */
function stoppedBoard(kind: keyof typeof stoppedSizes, lo: number | null, hi: number | null, facing: 'face' | 'edge' = 'face', holes: HoleRow[] = []): Board {
  const side = { across: 'width' as const, from: 'max' as const };
  const start: ProfileEnd = lo === null ? { side, through: 'min' } : { side, from: 'min', at: lo };
  const end: ProfileEnd = hi === null ? { side: { ...side }, through: 'max' } : { side: { ...side }, from: 'max', at: hi };
  const p: ProfileCut = { id: 'p', face: 'max', kind: kind as ProfileKind, ...stoppedSizes[kind], facing, run: canonicalRun(stoppedShelf, 'max', { start, end }) };
  return createBoard({ ...stoppedShelf, profiles: [p], holes });
}
/** A small bore down into the top, in line with the band's waste (0.1" in from the width max side) and 0.3" past the
 *  roundover's run-out at the 27" stop (BEARING plus the section's widest s; P14). */
function clearBore(): HoleRow {
  const c = geometryBoard(stoppedBoard('roundover', 3, 3)).curves[0]!;
  const station = 27 + runoutReach(stoppedShelf, c) + 0.3;
  return { id: 'h', face: 'thickness', from: 'max', diameter: 0.0625, depth: 0.0625, along: 'length', alongFrom: 'min', station,
    count: 1, pitch: 0, acrossFrom: 'max', inset: 0.1 };
}
const stoppedCases: [string, Board, { stopLo: boolean; stopHi: boolean }][] = [
  ['a stopped roundover, 3..27', stoppedBoard('roundover', 3, 3), { stopLo: true, stopHi: true }],
  ['a stopped cove, 3..27', stoppedBoard('cove', 3, 3), { stopLo: true, stopHi: true }],
  ['a stopped ogee, 3..27', stoppedBoard('ogee', 3, 3), { stopLo: true, stopHi: true }],
  ['a half-stopped roundover, through the min end..20', stoppedBoard('roundover', null, 10), { stopLo: false, stopHi: true }],
  ['a roundover stopped 0.1" in from each end (the run-outs leave the part)', stoppedBoard('roundover', 0.1, 0.1), { stopLo: true, stopHi: true }],
  // Final fix F7.
  ['a stopped bead, facing the face, 3..27', stoppedBoard('bead', 3, 3, 'face'), { stopLo: true, stopHi: true }],
  ['a stopped bead, facing the edge, 3..27', stoppedBoard('bead', 3, 3, 'edge'), { stopLo: true, stopHi: true }],
  ['a stopped thumbnail, facing the face, 3..27', stoppedBoard('thumbnail', 3, 3, 'face'), { stopLo: true, stopHi: true }],
  ['a stopped thumbnail, facing the edge, 3..27', stoppedBoard('thumbnail', 3, 3, 'edge'), { stopLo: true, stopHi: true }],
  ['a stopped roundover with a bore 0.3" clear of its run-out', stoppedBoard('roundover', 3, 3, 'face', [clearBore()]), { stopLo: true, stopHi: true }],
];
describe('a stopped profile\'s mesh is watertight, run-outs and chord scraps included (profile runs a2)', () => {
  it.each(stoppedCases)('%s', (_name, board, stops) => {
    const c = geometryBoard(board).curves[0]!;
    expect(spanOf(c)).toMatchObject(stops);
    expect(partGeometry(board).bodies.some((body) => body.faces.some((f) => f.runout !== undefined))).toBe(true);
    // A holed row is what it claims: its bore is clean (no fault), in the stock beside the run-out.
    for (const h of partGeometry(board).holes) expect(holeInStock(board, h, stockChecks(board))).toBe(true);
    if (board.holes.length > 0) expect(holeFaults(board, board.holes[0]!)).toEqual([]);
    const { triangles, unmatched } = unmatchedEdges(board);
    expect(triangles).toBeGreaterThan(0);
    expect(unmatched).toBe(0);
  });
});

// Round tenons (spec §7): a tenon's waste is two square-stopped view curves round the end; the mesh must close on the
// shoulder, round the tenon and across the tip — a square end, a mitered tip, and a levelled leaning leg (its end miters).
const tenonLeg = { length: 28, width: 1.75, thickness: 1.75 };
const tenon = (end: 'min' | 'max' = 'max') => ({ id: `t-${end}`, end, diameter: 1, length: 1.5 });
const tipMiter = { id: 'm', kind: 'miter' as const, face: 'length' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 0.1], [1.75, 0.4]] as [[number, number], [number, number]] };
const tenonCases: [string, Board][] = [
  ['a round tenon on a square end', createBoard({ ...tenonLeg, tenons: [tenon()] })],
  ['round tenons on both ends', createBoard({ ...tenonLeg, tenons: [tenon('min'), tenon('max')] })],
  ['a round tenon with a mitered tip', createBoard({ ...tenonLeg, angleCuts: [tipMiter], tenons: [tenon()] })],
  ['a round tenon on a levelled leaning leg', { ...stoolLegs()[0]!, tenons: [tenon()] }],
];
describe('a round-tenoned part\'s mesh is watertight (round tenons spec §7)', () => {
  it.each(tenonCases)('%s', (_name, board) => {
    // The fixture is what it claims: every tenon fault-free, so it builds.
    for (const t of board.tenons!) expect(tenonFaults(board, t)).toEqual([]);
    expect(geometryBoard(board).curves.filter((c) => spanOf(c)?.square)).toHaveLength(2 * board.tenons!.length);
    const { triangles, unmatched } = unmatchedEdges(board);
    expect(triangles).toBeGreaterThan(0);
    expect(unmatched).toBe(0);
  });
  it('the leaning fixture leans', () => {
    expect(tenonCases[3]![1].lean).toBeDefined();
  });
});

/** The cap's fill: every triangle edge is matched by its reverse or lies ON the cap's outline (the union boundary). */
function capCracks(board: Board, axis: 'top' | 'front', at: number): number {
  const c = sectionCaps(board, { axis, at, flip: false })!;
  expect(c).not.toBeNull();
  const capN: V3 = [0, 0, 0];
  capN[axis === 'top' ? 1 : 2] = 1;
  // BoardMesh's own conform flag (a swept part with no curves — wrapThree, twoSideSharp — conforms too).
  const fill = Float32Array.from(capFill(c.pieces, capN, shapedPart(geometryBoard(board))));
  const key = (i: number) => `${fill[3 * i]},${fill[3 * i + 1]},${fill[3 * i + 2]}`;
  const pt = (i: number): V3 => [fill[3 * i]!, fill[3 * i + 1]!, fill[3 * i + 2]!];
  const count = new Map<string, number>();
  const ends = new Map<string, [V3, V3]>();
  for (let t = 0; t < fill.length / 9; t += 1) {
    for (let e = 0; e < 3; e += 1) {
      const i = 3 * t + e, j = 3 * t + (e + 1) % 3;
      const edge = `${key(i)}|${key(j)}`;
      count.set(edge, (count.get(edge) ?? 0) + 1);
      ends.set(edge, [pt(i), pt(j)]);
    }
  }
  const onOutline = (m: V3) => c.outline.some(([a, b]) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l2 = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2;
    const t = Math.max(0, Math.min(1, ((m[0] - a[0]) * d[0]! + (m[1] - a[1]) * d[1]! + (m[2] - a[2]) * d[2]!) / l2));
    return Math.hypot(m[0] - a[0] - t * d[0]!, m[1] - a[1] - t * d[1]!, m[2] - a[2] - t * d[2]!) <= 1e-5;
  });
  let cracks = 0;
  for (const [edge, n] of count) {
    const [a, b] = edge.split('|');
    if ((count.get(`${b}|${a}`) ?? 0) === n) continue;
    const [p, q] = ends.get(edge)!;
    if (!onOutline([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2])) cracks += 1;
  }
  return cracks;
}

// fu 369: holes in a split arch's strips. The default arch on the apron (crown 1 1/4" up from the width min side) and a
// shelf-pin row 1 1/2" in from that side: every mouth on the broad face the arch's slices cut into strips.
const pins: HoleRow = { id: 'p', ...defaultShelfPinRow(createBoard(apron))! };
const one: HoleRow = { ...pins, id: 'o', count: 1, station: 15 };
// Beside the arch, past the dado: a single bore in a BOX cell's face, coplanar with the slices' faces.
const inBox: HoleRow = { ...pins, id: 'x', count: 1, station: 29.5, inset: 2.5 };
const stile = { length: 30, width: 5, thickness: 0.75 };
const stileArch: CurveCut = { id: 'a', ...defaultArch(stile)!, vFrom: 'max' };
const holedCases: [string, Board][] = [
  ['a blind shelf-pin row', createBoard({ ...apron, curves: [arch], holes: [pins] })],
  ['a through shelf-pin row', createBoard({ ...apron, curves: [arch], holes: [{ ...pins, depth: 'through' }] })],
  ['one bore straddling the strips', createBoard({ ...apron, curves: [arch], holes: [one] })],
  ['a bore in a box cell beside the slices', createBoard({ ...apron, curves: [arch], cuts: [dado], holes: [inBox] })],
  ['a 35 mm hinge cup on an arched stile', createBoard({ ...stile, curves: [stileArch], holes: [{ id: 'c', ...defaultHingeCup(createBoard(stile)), station: 10 }] })],
];

describe('a holed curved part\'s mesh is watertight, walls included (fu 369)', () => {
  it('the fixtures are what they claim: clean holes on a split arch\'s strips', () => {
    for (const [, b] of holedCases) {
      for (const c of b.curves) expect(curvePlan(b, c)?.clip).toBe(false);
      const { holes } = partGeometry(b);
      expect(holes.length).toBeGreaterThan(0);
      for (const h of holes) expect(holeInStock(b, h, stockChecks(b))).toBe(true);
    }
    // The single bore's mouth crosses faces of more than one body (it straddles a seam between strips).
    const straddle = holedCases[2]![1];
    const g = partGeometry(straddle);
    const touched = g.bodies.filter((body) => body.faces.some((f) => f.n[2] === 1 && holeTouches(g.holes[0]!, f.verts)));
    expect(touched.length).toBeGreaterThan(1);
    // The box-cell bore's mouth is on a box cell.
    const boxed = holedCases[3]![1];
    const gb = partGeometry(boxed);
    expect(gb.bodies.some((body) => body.box !== null && body.faces.some((f) => holeTouches(gb.holes[0]!, f.verts)))).toBe(true);
  });
  it.each(holedCases)('%s', (_name, board) => {
    const { triangles, unmatched } = unmatchedEdges(board);
    expect(triangles).toBeGreaterThan(0);
    expect(unmatched).toBe(0);
  });
});

/** The area the part's mesh draws on its thickness-max face (world +Y for a flat part), and a polygon's area in (x, y)
 *  board-local terms (length, width). */
function topArea(board: Board): number {
  const { bodies, holes } = partGeometry(board);
  let sum = 0;
  for (const body of bodies) {
    const p = bodyMesh(board, body, holes, bodies).positions;
    for (let t = 0; t < p.length / 9; t += 1) {
      const o = 9 * t;
      if (Math.abs(p[o + 1]! - board.thickness / 2) > 1e-6 || Math.abs(p[o + 4]! - board.thickness / 2) > 1e-6 || Math.abs(p[o + 7]! - board.thickness / 2) > 1e-6) continue;
      sum += Math.abs((p[o + 3]! - p[o]!) * (p[o + 8]! - p[o + 2]!) - (p[o + 6]! - p[o]!) * (p[o + 5]! - p[o + 2]!)) / 2;
    }
  }
  return sum;
}
const polyArea = (poly: readonly V3[]) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]!; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;

describe('a holed plane the merge cannot trust keeps the per-face path (fu 369)', () => {
  // Two OVERLAPPING bores on the strips (both clean by holeInStock, which does not judge meets-hole): earcut given two
  // overlapping rings as holes covers the wrong area, so the plane is left to faceTriangles' disjoint split.
  it('overlapping bores: the face loses exactly the union of the two mouths', () => {
    const plain = createBoard({ ...apron, curves: [arch] });
    const board = createBoard({ ...apron, curves: [arch], holes: [one, { ...one, id: 'q', station: 15.1 }] });
    const a = partGeometry(board).holes[0]!, b = partGeometry(board).holes[1]!;
    for (const h of partGeometry(board).holes) expect(holeInStock(board, h, stockChecks(board))).toBe(true);
    const ra = holeRing(a, 0), rb = holeRing(b, 0);
    let both: V3[] = [...rb];
    for (const q of holePrism(a).slice(0, ra.length)) both = clipPolygon(both, q);
    const mouths = polyArea(ra) + polyArea(rb) - polyArea(both);
    expect(polyArea(both)).toBeGreaterThan(0);
    expect(topArea(board)).toBeCloseTo(topArea(plain) - mouths, 6);
  });
  // Angled holes Task 4: two TILTED bores (45° along the row) whose mouth ELLIPSES overlap where circles of their radius
  // would not (0.3" apart; 2r = 0.25", 2r·√2 ≈ 0.354"). Both clean by holeInStock (it does not judge meets-hole): judged by
  // their radius alone, the merge and the per-face path would both hand earcut two overlapping rings.
  it('overlapping tilted mouths (ellipses overlap, circles of their radius do not): the face loses exactly their union', () => {
    const plain = createBoard({ ...apron, curves: [arch] });
    const t = { ...one, tiltAlong: 1 };
    const board = createBoard({ ...apron, curves: [arch], holes: [t, { ...t, id: 'q', station: 15.3 }] });
    const [a, b] = partGeometry(board).holes as [Hole, Hole];
    for (const h of [a, b]) expect(holeInStock(board, h, stockChecks(board))).toBe(true);
    expect(Math.abs(a.centre[0] - b.centre[0])).toBeGreaterThan(2 * a.radius);
    const ra = holeRing(a, 0), rb = holeRing(b, 0);
    let both: V3[] = [...rb];
    for (const q of holePrism(a).slice(0, ra.length)) both = clipPolygon(both, q);
    expect(polyArea(both)).toBeGreaterThan(0);
    expect(topArea(board)).toBeCloseTo(topArea(plain) - (polyArea(ra) + polyArea(rb) - polyArea(both)), 6);
  });
  // A FAULTED bore (breaking out of the length-min end) on the same face as a clean one: the merge would triangulate
  // around the clean ring only and cover the faulted mouth with face.
  it('a faulted bore on the plane: its mouth is still open', () => {
    const plain = createBoard({ ...apron, curves: [arch] });
    const board = createBoard({ ...apron, curves: [arch], holes: [one, { ...one, id: 'e', station: 0.05 }] });
    const [clean, faulted] = partGeometry(board).holes as [Hole, Hole];
    expect(holeInStock(board, clean, stockChecks(board))).toBe(true);
    expect(holeInStock(board, faulted, stockChecks(board))).toBe(false);
    const inPart = clipPolygon(holeRing(faulted, 0), { n: [1, 0, 0], d: 0 });
    expect(topArea(board)).toBeCloseTo(topArea(plain) - polyArea(holeRing(clean, 0)) - polyArea(inPart), 6);
  });
});

describe('a curved part\'s section cap has no interior cracks', () => {
  it.each(holedCases)('%s, cut across its bores', (_name, board) => {
    expect(capCracks(board, 'top', 0.6)).toBe(0);
  });
  // A flat part: thickness is world Y, so a 'top' plane cuts parallel to the broad faces — across every slice.
  it.each(cases)('%s, cut parallel to its broad faces', (_name, board) => {
    expect(capCracks(board, 'top', 0.6)).toBe(0);
  });
});

// Profile runs b1 (Task 5): a profile that FOLLOWS the outline — the skeleton's band pieces, the rest of the outline, B1's
// run-outs, every body through bodyMesh — must close too, holes included, and its section cap must have no interior crack.
const side = (across: 'length' | 'width', from: 'min' | 'max') => ({ across, from });
const sweptTop = topCorners(2);
/** A 35 mm hinge cup on the 2" corner top, 10" along and 2" in from the front: clear of the 1/4" band (and its reach). */
const cupClear: HoleRow = { id: 'cup', ...defaultHingeCup(createBoard({ length: 36, width: 20, thickness: 0.75 })), station: 10, inset: 2 };
const sweptCases: [string, Board][] = [
  ['roundover 1/4 along the arched apron (End to end)', apronArch],
  ['roundover 1/4 all round the 2" corners', sweptTop],
  ['roundover 1/4 all round the 1/2" corners', topCorners(0.5)],
  ['thumbnail 3/4 × 1/4 all round the 2" corners', topCorners(2, loop('p1', 0.75, 'thumbnail'))],
  ['bead 1/4 (quirk 1/16) all round the 2" corners', topCorners(2, loop('p1', 0.25, 'bead'))],
  ['cove 3/8 all round the 2" corners', topCorners(2, loop('p1', 0.375, 'cove'))],
  ['ogee 3/8 all round the 2" corners', topCorners(2, loop('p1', 0.375, 'ogee'))],
  ['ogee 3/8 all round the 2" corners, facing the edge', topCorners(2, { ...loop('p1', 0.375, 'ogee'), facing: 'edge' })],
  ['roundover 3/8 round the half-round notch', notchEdge],
  ['roundover 1/4 End to end on the front, round the 2" corners (B1 run-outs)', frontOnly],
  ['cove 3/8 End to end on the front, round the 2" corners (B1 run-outs)', topCorners(2, endToEnd('p1', side('width', 'min'), 0.375, 'cove'))],
  ['the 2" corner loop with a 35 mm hinge cup clear of the band', { ...sweptTop, holes: [cupClear] }],
  // Review Focus 4: All round the top AND the bottom.
  ['loops on the top and the bottom (Review Focus 4)', { ...sweptTop, profiles: [loop('t'), loop('m', 0.25, 'roundover', 'min')] }],
  // Review Focus 5: a dado across the width at 18" and a 45° chamfer on the bottom long edge, under the loop.
  ['the loop over a dado and a chamfer (Review Focus 5)', { ...sweptTop,
    cuts: [{ id: 'd', face: 'thickness', from: 'max', across: 'width', offset: 17.625, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 }],
    angleCuts: [{ id: 'ch', ...chamferCut({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'min', legFace: 0.25, legAlong: 0.25 }, sweptTop) }] }],
];
describe('a swept profile\'s mesh is watertight, and its cap has no interior crack (profile runs b1)', () => {
  it('the fixtures are what they claim: every profile built, the cup clean', () => {
    for (const [name, b] of sweptCases) expect(builtSwept(geometryBoard(b)), name).toHaveLength(b.profiles.length);
    const cupped = sweptCases[11]![1];
    expect(holeFaults(cupped, cupped.holes[0]!)).toEqual([]);
    for (const h of partGeometry(cupped).holes) expect(holeInStock(cupped, h, stockChecks(cupped))).toBe(true);
  });
  it.each(sweptCases)('%s', (_name, board) => {
    const { triangles, unmatched } = unmatchedEdges(board);
    expect(triangles).toBeGreaterThan(0);
    expect(unmatched).toBe(0);
  });
  // Through the band (a face-max profile's waste is the top quarter inch) and, for Review Focus 4, the bottom's.
  it.each(sweptCases)('%s: the cap across the band', (_name, board) => {
    expect(capCracks(board, 'top', 0.6)).toBe(0);
    if (board.profiles.some((p) => p.face === 'min')) expect(capCracks(board, 'top', 0.15)).toBe(0);
  });
});

// Profile runs b2 (Task 6): a stop on a turned path (its run-out revolved about the bit's axis outside the stop's model chord,
// `stopRunoutPieces`) and runs across two sides must close too — every Task 4 wood case, Task 5's wrapping and station repros,
// the chiral two-side run and its mirror, and the arch's stops with a 1/4" bore beside the run-out.
const archHole: HoleRow = { id: 'h', ...defaultHole(stopOnArch), station: 21, inset: 1.75 };
const b2Cases: [string, Board, number][] = [
  ['stopOnCorner() — roundover 1/4 stopped on a convex corner arc', stopOnCorner(), 2],
  ['stopOnCorner(cove 3/8)', stopOnCorner('cove', 0.375), 2],
  ['stopOnArch — both stops on the concave arch', stopOnArch, 2],
  ['stopOnNotch — a stop on the half-round notch', stopOnNotch, 2],
  ['bowFront — both stops on a convex bow', bowFront, 2],
  ['frontAndEnds() — two sides round the corner arcs', frontAndEnds(), 2],
  ['frontAndEnds(cove 3/8)', frontAndEnds('cove', 0.375), 2],
  ['twoSideSharp — two sides round a sharp corner (R6\'s mitre)', twoSideSharp, 2],
  ['zoneStop() — a stop inside the end-chord zone (Q13)', zoneStop(), 2],
  ['wrapThree — three sides, back through the start stop\'s half-plane', wrapThree(), 2],
  ['wrapFour — four sides round three arcs', wrapFour(), 2],
  ['stationRightToBack — a B1 station and a stop', stationRightToBack(), 1],
  ['stationFrontToBack — a stop and a B1 station', stationFrontToBack(), 1],
  ['stationFrontToRight — a stop and a B1 station', stationFrontToRight(), 1],
  ['shortEnds — b1: B1 stations with no ε', shortEnds(), 0],
  ['chiralTwoSide(flat)', chiralTwoSide('flat'), 2],
  ['chiralTwoSide(flat) mirrored (mirrorPart)', mirrorPart(chiralTwoSide('flat')), 2],
  ['stopOnArch with a 1/4" bore beside the run-out', { ...stopOnArch, holes: [archHole] }, 2],
];
describe('a b2 profile\'s mesh is watertight, and its cap has no interior crack (profile runs b2)', () => {
  it('the fixtures are what they claim: every profile swept, built and unfaulted, its stops counted, the bore clean', () => {
    for (const [name, b, stops] of b2Cases) {
      const v = geometryBoard(b);
      expect(b.profiles.flatMap((q) => profileFaults(b, q)), name).toEqual([]);
      expect(builtSwept(v), name).toHaveLength(1);
      expect(sweptStops(v, v.profiles[0]!), name).toHaveLength(stops);
    }
    const holed = b2Cases[b2Cases.length - 1]![1];
    expect(holeFaults(holed, holed.holes[0]!)).toEqual([]);
    for (const h of partGeometry(holed).holes) expect(holeInStock(holed, h, stockChecks(holed))).toBe(true);
  });
  it.each(b2Cases)('%s', (_name, board) => {
    const { triangles, unmatched } = unmatchedEdges(board);
    expect(triangles).toBeGreaterThan(0);
    expect(unmatched).toBe(0);
  });
  it.each(b2Cases)('%s: the cap across the band', (_name, board) => {
    expect(capCracks(board, 'top', 0.6)).toBe(0);
  });
});

// Task 6 fix round 1 (the review's I2): a four-side run whose two stops sit near ONE sharp corner — within the reach of it on
// both sides the two ends' bands overlap. Stops 0.05–0.3" from the corner on each side (the review's cases among them).
const GAPS = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
const gapCases: [string, Board][] = GAPS.flatMap((a) => GAPS.map((g) => [`right end at ${a}, front at 30 − ${g}`, cornerGap(a, g)] as [string, Board]));
describe('a run whose two stops meet near one sharp corner is watertight (Task 6 fix round 1, I2)', () => {
  it('the fixtures are what they claim: unfaulted, built swept, two stops', () => {
    for (const [name, b] of gapCases) {
      const v = geometryBoard(b);
      expect(profileFaults(b, b.profiles[0]!), name).toEqual([]);
      expect(builtSwept(v), name).toHaveLength(1);
      expect(sweptStops(v, v.profiles[0]!), name).toHaveLength(2);
    }
  });
  it.each(gapCases)('%s', (_name, board) => {
    const { triangles, unmatched } = unmatchedEdges(board);
    expect(triangles).toBeGreaterThan(0);
    expect(unmatched).toBe(0);
  });
  it.each(gapCases)('%s: the cap across the band', (_name, board) => {
    expect(capCracks(board, 'top', 0.6)).toBe(0);
  });
});

// Task 6 fix round 2 (N2): the two ends' overlap for every section kind (cove with a fillet, ogee both facings, bead, thumbnail),
// a mirrored part and a face-min part — watertight, with an uncracked cap.
const kindGapCases: [string, Board][] = overlapCases().map((c) => [c.name, c.board]);
describe('a run whose two ends\' bands overlap is watertight for every section kind (Task 6 fix round 2, N2)', () => {
  it.each(kindGapCases)('%s', (_name, board) => {
    expect(profileFaults(board, board.profiles[0]!)).toEqual([]);
    expect(builtSwept(geometryBoard(board))).toHaveLength(1);
    const { triangles, unmatched } = unmatchedEdges(board);
    expect(triangles).toBeGreaterThan(0);
    expect(unmatched).toBe(0);
  });
  it.each(kindGapCases)('%s: the cap across the band', (_name, board) => {
    const p = board.profiles[0]!;
    expect(capCracks(board, 'top', p.face === 'max' ? 0.7 : 0.05)).toBe(0);
  });
});

// Angled holes Task 4 (spec §6.1): a TILTED bore's mesh is watertight — its mouth (and a through exit) an ellipse cut from
// the face, its wall ruled along the bit, a blind bottom square to the bit. Kept apart from holedCases: those also run
// capCracks, and a tilted bore's section caps are not this task's.
const seat = { length: 20, width: 10, thickness: 1.5 };
const tiltedBore = (over: Partial<HoleRow>): HoleRow => ({ id: 't', face: 'thickness', from: 'min', diameter: 0.75, depth: 'through', along: 'length',
  alongFrom: 'min', station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 3, tiltAlong: 0.25, tiltAcross: 0.1, ...over });
const tiltedCases: [string, Board][] = [
  ['a through tilted bore in a flat board', createBoard({ ...seat, holes: [tiltedBore({})] })],
  ['a blind tilted bore in a flat board', createBoard({ ...seat, holes: [tiltedBore({ from: 'max', depth: 1, tiltAlong: -0.3, tiltAcross: 0.2 })] })],
  ['a blind tilted bore on a split arch\'s strips', createBoard({ ...apron, curves: [arch], holes: [{ ...one, tiltAlong: 0.3 }] })],
  ['a through tilted bore on a split arch\'s strips (the exit ring off the mouth\'s centre)',
    createBoard({ ...apron, curves: [arch], holes: [{ ...one, depth: 'through', tiltAlong: 0.3, tiltAcross: 0.1 }] })],
  ['a tilted bore beside a stopped roundover\'s run-out', stoppedBoard('roundover', 3, 3, 'face', [{ ...clearBore(), tiltAlong: 0.3 }])],
];
describe('a tilted bore\'s mesh is watertight (angled holes Task 4)', () => {
  it('the fixtures are what they claim: every bore tilted and clean', () => {
    for (const [name, b] of tiltedCases) {
      const { holes } = partGeometry(b);
      expect(holes.length, name).toBeGreaterThan(0);
      for (const h of holes) {
        const lateral = [0, 1, 2].filter((i) => i !== ['length', 'width', 'thickness'].indexOf(h.axis)).map((i) => h.bit[i]!);
        expect(lateral.some((x) => x !== 0), name).toBe(true);
        expect(holeInStock(b, h, stockChecks(b)), name).toBe(true);
      }
      for (const r of b.holes) expect(holeFaults(b, r), name).toEqual([]);
    }
    for (const [, b] of tiltedCases.slice(2, 4)) for (const c of b.curves) expect(curvePlan(b, c)?.clip).toBe(false);
  });
  it.each(tiltedCases)('%s', (_name, board) => {
    const { triangles, unmatched } = unmatchedEdges(board);
    expect(triangles).toBeGreaterThan(0);
    expect(unmatched).toBe(0);
  });
});

// Counterbores Task 4 (spec §6.1): a headed bore is the union of its two convex pieces — the head (a cylinder, or a
// countersink's frustum) and the bore past it. The entry face's hole is the HEAD's ring; a counterbore steps down on a
// flat annulus at its depth, a countersink's cone ends on the bore's own mouth ring; every ring shared, so watertight.
const facesOf = (m: { positions: Float32Array; normals: Float32Array }) => {
  const out: { ys: number[]; ny: number }[] = [];
  for (let t = 0; t < m.positions.length / 9; t += 1) {
    out.push({ ys: [m.positions[9 * t + 1]!, m.positions[9 * t + 4]!, m.positions[9 * t + 7]!], ny: m.normals[9 * t + 1]! });
  }
  return out;
};
describe('a headed bore\'s mesh is watertight and stepped (counterbores Task 4)', () => {
  it('the fixtures are what they claim: every row headed, legal and clean; the apron\'s arch split', () => {
    for (const [name, b] of HEADED_CASES) {
      const { holes } = partGeometry(b);
      expect(holes.length, name).toBeGreaterThan(0);
      for (const h of holes) {
        expect(h.head, name).toBeDefined();
        expect(holeInStock(b, h, stockChecks(b)), name).toBe(true);
      }
      for (const r of b.holes) expect(holeFaults(b, r), name).toEqual([]);
      for (const c of b.curves) expect(curvePlan(b, c)?.clip, name).toBe(false);
    }
    expect(HEADED_CASES.filter(([, b]) => b.curves.length > 0).length).toBe(4);
    expect(partGeometry(HEADED_CASES[8]![1]).holes.length).toBe(20);
    // An apron head's mouth straddles the arch's strips: its HEAD piece reaches faces of more than one body.
    const g = partGeometry(HEADED_CASES[4]![1]);
    const head = holePieces(g.holes[0]!)[0]!;
    expect(g.bodies.filter((body) => body.faces.some((f) => f.n[2] === 1 && holeTouches(head, f.verts))).length).toBeGreaterThan(1);
  });
  it.each(HEADED_CASES)('%s', (_name, board) => {
    const { triangles, unmatched } = unmatchedEdges(board);
    expect(triangles).toBeGreaterThan(0);
    expect(unmatched).toBe(0);
  });
  // A clean hole's mesh is unclipped, so its triangles count exactly: HOLE_SEGMENTS quads (96 triangles) per wall, the
  // annulus, or the cone; a blind bottom's 46. Axial normals (±Y on a flat part) are the annulus and the bottom; a
  // countersink's cone alone has normals partly axial (inward with an axial component back toward the mouth).
  it.each(HEADED_CASES.slice(0, 8))('%s: the head\'s wall, the step, then the bore', (_name, board) => {
    const { bodies, holes } = partGeometry(board);
    const h = holes[0]!;
    const cone = h.head!.kind === 'countersink';
    const tris = facesOf(holesMesh(board, holes, bodies, stockChecks(board))!);
    const bottom = h.through ? 0 : 46;
    expect(tris.length).toBe((cone ? 192 : 288) + bottom);
    expect(tris.filter((t) => Math.abs(t.ny) === 1).length).toBe((cone ? 0 : 96) + bottom);
    const slanted = tris.filter((t) => Math.abs(t.ny) > 1e-6 && Math.abs(t.ny) < 1 - 1e-6);
    expect(slanted.length).toBe(cone ? 96 : 0);
    // Every axial face (the annulus, a bottom) and every cone normal faces back toward the mouth: +Y entering from the
    // thickness max face (dir −1), −Y from the min face.
    for (const t of [...slanted, ...tris.filter((x) => Math.abs(x.ny) === 1)]) expect(Math.sign(t.ny)).toBe(-h.dir);
    // The step: the annulus lies at headDepth from the face; a cone's normals tilt by its half-angle.
    const y = (t: number) => h.centre[2] + h.dir * t - board.thickness / 2;
    if (!cone) for (const t of tris.filter((x) => Math.abs(x.ny) === 1).slice(0, 96)) for (const v of t.ys) expect(v).toBeCloseTo(y(h.head!.reach), 6);
    if (cone) {
      const half = (board.holes[0]!.headAngle! / 2) * Math.PI / 180;
      for (const t of slanted) expect(Math.abs(t.ny)).toBeCloseTo(Math.sin(half), 6);
    }
  });
  it('the entry face loses exactly the head\'s mouth (the HEAD\'s ring, radius R, cut from the face)', () => {
    const [, board] = HEADED_CASES[4]!;
    const plain = { ...board, holes: [] };
    const head = holePieces(partGeometry(board).holes[0]!)[0]!;
    expect(head.radius).toBe(0.25);
    expect(topArea(board)).toBeCloseTo(topArea(plain) - polyArea(holeRing(head, 0)), 6);
  });
  // A FAULTED headed bore on a curved part (its head breaking out of the length-min end; its bore clear of it), beside a
  // clean one on the same plane: the face the faulted head alone reaches is cut by the head's prism (the per-face path:
  // the merge must see the head reach the plane), so both mouths are open to radius R, not to the bore's.
  it('a faulted counterbore beside a clean one on the arch\'s strips: the face loses both heads\' mouths', () => {
    const [, one] = HEADED_CASES[4]!;
    const board = { ...one, holes: [one.holes[0]!, { ...one.holes[0]!, id: 'e', station: 0.2 }] };
    const plain = { ...one, holes: [] };
    const [ok, bad] = partGeometry(board).holes as [Hole, Hole];
    expect(holeInStock(board, ok, stockChecks(board))).toBe(true);
    expect(holeInStock(board, bad, stockChecks(board))).toBe(false);
    expect(bad.centre[0] - bad.radius).toBeGreaterThan(0);
    const mouth = clipPolygon(holeRing(holePieces(bad)[0]!, 0), { n: [1, 0, 0], d: 0 });
    expect(topArea(board)).toBeCloseTo(topArea(plain) - polyArea(holeRing(holePieces(ok)[0]!, 0)) - polyArea(mouth), 5);   // Float32 positions over a split face
  });
  // Task 3's review: a THROUGH counterbore whose head reaches the far face is legal but faulted (too-deep, kept and
  // noted). Its bore piece has no length: the mesh draws the head, clipped to the stock as a faulted hole's, and nothing
  // of the bore.
  it.each([1.5, 1.75])('a through counterbore whose head is %s" deep in a 1 1/2" part builds, clipped, finite', (depth) => {
    const board = createBoard({ length: 20, width: 10, thickness: 1.5, holes: [{ id: 'cb', face: 'thickness', from: 'max', diameter: 0.25,
      depth: 'through', along: 'length', alongFrom: 'min', station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 3,
      head: 'counterbore', headDiameter: 0.5, headDepth: depth }] });
    expect(holeFaults(board, board.holes[0]!).map((f) => f.kind)).toEqual(['too-deep']);
    const { bodies, holes } = partGeometry(board);
    expect(holePieces(holes[0]!)[1]!.depth).toBeLessThanOrEqual(0);
    const m = holesMesh(board, holes, bodies, stockChecks(board))!;
    expect(m.positions.length).toBeGreaterThan(0);
    const half = [10, 0.75, 5];
    for (let i = 0; i < m.positions.length; i += 1) {
      expect(Number.isFinite(m.positions[i]!)).toBe(true);
      expect(Math.abs(m.positions[i]!)).toBeLessThanOrEqual(half[i % 3]! + 1e-6);
    }
    // The head's wall only: 96 triangles, every one radial (no annulus, no bore wall, no bottom).
    const tris = facesOf(m);
    expect(tris.length).toBe(96);
    expect(tris.every((t) => Math.abs(t.ny) < 1e-9)).toBe(true);
    // ...and it is the HEAD's (radius R = 1/4"), not the bore's: every vertex 1/4" from the axis (world x −5, z −2).
    for (let i = 0; i < m.positions.length; i += 3) expect(Math.hypot(m.positions[i]! + 5, m.positions[i + 2]! + 2)).toBeCloseTo(0.25, 6);
    for (const body of bodies) for (const x of bodyMesh(board, body, holes, bodies).positions) expect(Number.isFinite(x)).toBe(true);
  });
});
