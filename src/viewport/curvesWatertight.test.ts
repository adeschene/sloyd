import { createBoard, curvePlan, defaultArch, defaultBow, defaultNotch, partGeometry, sectionCaps } from '../document/document';
import type { Board, CurveCut, V3 } from '../document/document';
import { capFill } from './capFill';
import { bodyMesh, drawsAsBox } from './grainTiling';

/**
 * A curved part's mesh is WATERTIGHT (whole-branch review, finding 1): a SPLIT curve leaves its slices' faces meeting
 * at T-junctions (a slice's chord vertex on its neighbour's long edge), which cracked the arch's shadow and section cap.
 * The criterion is exact — no tolerance, which would hide a one-ulp crack: vertices are compared as the Float32 numbers
 * the GPU receives (the mesh's own Float32Array), and every DIRECTED edge of every triangle must be matched by as many
 * copies of its reverse. A box cell beside the slices is drawn through bodyMesh too (drawsAsBox is false for every body
 * of a curved part), so the merged bodyMesh output over all bodies is exactly what BoardMesh draws (holes aside).
 */
function unmatchedEdges(board: Board): { triangles: number; unmatched: number } {
  const { bodies, holes } = partGeometry(board);
  const count = new Map<string, number>();
  let triangles = 0;
  for (const body of bodies) {
    expect(drawsAsBox(board, body, holes)).toBe(false);
    const p = bodyMesh(board, body, holes, bodies).positions;
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

describe('a curved part\'s section cap has no interior cracks', () => {
  // A flat part: thickness is world Y, so a 'top' plane cuts parallel to the broad faces — across every slice.
  it.each(cases)('%s, cut parallel to its broad faces', (_name, board) => {
    expect(capCracks(board, 'top', 0.6)).toBe(0);
  });
});
