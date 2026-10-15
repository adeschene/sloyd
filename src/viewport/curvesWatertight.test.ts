import { clipPolygon, createBoard, curvePlan, holePrism, holeRing, defaultArch, defaultBow, defaultHingeCup, defaultNotch, defaultShelfPinRow, holeInStock, holeTouches, partGeometry, sectionCaps, stockChecks } from '../document/document';
import type { Board, CurveCut, Hole, HoleRow, V3 } from '../document/document';
import { capFill } from './capFill';
import { bodyMesh, drawsAsBox, holesMesh } from './grainTiling';

/**
 * A curved part's mesh is WATERTIGHT (whole-branch review, finding 1): a SPLIT curve leaves its slices' faces meeting
 * at T-junctions (a slice's chord vertex on its neighbour's long edge), which cracked the arch's shadow and section cap.
 * The criterion is exact — no tolerance, which would hide a one-ulp crack: vertices are compared as the Float32 numbers
 * the GPU receives (the mesh's own Float32Array), and every DIRECTED edge of every triangle must be matched by as many
 * copies of its reverse. A box cell beside the slices is drawn through bodyMesh too (drawsAsBox is false for every body
 * of a curved part), so the merged bodyMesh output over all bodies is exactly what BoardMesh draws, and with a holed
 * part the holes' mesh (holesMesh, one geometry) joins it: a bore's wall must meet the face around its mouth (fu 369).
 */
function unmatchedEdges(board: Board): { triangles: number; unmatched: number } {
  const { bodies, holes } = partGeometry(board);
  const count = new Map<string, number>();
  let triangles = 0;
  const meshes = bodies.map((body) => {
    expect(drawsAsBox(board, body, holes)).toBe(false);
    return bodyMesh(board, body, holes, bodies).positions;
  });
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

/** The cap's fill: every triangle edge is matched by its reverse or lies ON the cap's outline (the union boundary). */
function capCracks(board: Board, axis: 'top' | 'front', at: number): number {
  const c = sectionCaps(board, { axis, at, flip: false })!;
  expect(c).not.toBeNull();
  const capN: V3 = [0, 0, 0];
  capN[axis === 'top' ? 1 : 2] = 1;
  const fill = Float32Array.from(capFill(c.pieces, capN, board.curves.length > 0));
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
