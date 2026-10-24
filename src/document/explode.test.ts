import { createBoard, createDocument } from './document';
import type { SloydDocument } from './types';
import { explodeOffsets, EXPLODE_INNER } from './explode';
import { chooseFace, leanMap, slopeOf } from './lean';
import { boardsBounds } from './geometry';
import type { Board } from './types';

type V = [number, number, number];
const cube = (id: string, position: V) => createBoard({ id, name: id, length: 2, width: 2, thickness: 2, position });
const plus = (a: V, k: number, b: V): V => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];

/**
 * Root part r (x 10..12). Assembly i at the origin holding p (x 0..2), q (x 4..6) and assembly j at
 * y 4 holding s. World: r, i/p, i/q, i/j/s. Centres (hand): root bounds x 0..12, y 0..6, z 0..2 →
 * (6,3,1); i: x 0..6, y 0..6 → (3,3,1); j: (1,5,1); r (11,1,1); p (1,1,1); q (5,1,1); s (1,5,1).
 */
const doc = (): SloydDocument => ({
  ...createDocument('Explode'),
  boards: [cube('r', [10, 0, 0])],
  instances: [{ id: 'i', name: 'Box', definition: 'd', position: [0, 0, 0], rotation: 0 }],
  definitions: [
    { id: 'd', boards: [cube('p', [0, 0, 0]), cube('q', [4, 0, 0])],
      instances: [{ id: 'j', name: 'Peg', definition: 'd2', position: [0, 4, 0], rotation: 0 }], hardware: [] },
    { id: 'd2', boards: [cube('s', [0, 0, 0])], instances: [], hardware: [] },
  ],
});

const expectVec = (got: V | undefined, want: V) => want.forEach((w, k) => expect(got![k]).toBeCloseTo(w, 12));

describe('explodeOffsets', () => {
  it('moves the top level by full weight and deeper levels by EXPLODE_INNER', () => {
    const o = explodeOffsets(doc(), 1);
    // Floor lift: unlifted Y offsets are r −2, i/p and i/q −INNER·2, i/j/s +INNER·2. Parts start at
    // y 0 except s (y 4), so explodedMinY = min(0−2, 0−1, 0−1, 4+1) = −2 (r), assembledMinY = 0,
    // dy = 2: every Y offset below gets `+ 2`.
    expectVec(o.get('r'), [5, -2 + 2, 0]);                          // (11,1,1) − (6,3,1)
    expectVec(o.get('i/p'), plus([-3, 2, 0], EXPLODE_INNER, [-2, -2, 0])); // c(i)−c(root), then c(p)−c(i)
    expectVec(o.get('i/q'), plus([-3, 2, 0], EXPLODE_INNER, [2, -2, 0]));
    // i/j/s: c(i)−c(root), INNER·(c(j)−c(i)) = INNER·(−2,2,0), INNER·(c(s)−c(j)) = 0.
    expectVec(o.get('i/j/s'), plus([-3, 2, 0], EXPLODE_INNER, [-2, 2, 0]));
  });

  it('is not plain radial explode for a nested part', () => {
    // Radial would be c(p) − c(root) = (−5,−2,0); the hierarchy differs whenever INNER ≠ 1 (compare
    // X, which the floor lift does not touch).
    expect(EXPLODE_INNER).toBeLessThan(1);
    const p = explodeOffsets(doc(), 1).get('i/p')!;
    expect(Math.abs(p[0] - -5)).toBeGreaterThan(1e-6);
  });

  it('is zero at amount 0 and linear in the amount', () => {
    const d = doc();
    for (const v of explodeOffsets(d, 0).values()) v.forEach((c) => expect(c).toBeCloseTo(0, 12));
    const one = explodeOffsets(d, 1);
    const half = explodeOffsets(d, 0.5);
    for (const [id, v] of one) expectVec(half.get(id), [v[0] / 2, v[1] / 2, v[2] / 2]);
  });

  it('adds no lift when no part would go below the floor', () => {
    // Flat two-cube document: Y offsets are 0, explodedMinY = assembledMinY = 0, dy = 0.
    const flat = { ...createDocument('Flat'), boards: [cube('a', [0, 0, 0]), cube('b', [8, 0, 0])] };
    expect(explodeOffsets(flat, 1).get('a')![1]).toBe(0);
    expect(explodeOffsets(flat, 1).get('b')![1]).toBe(0);
  });

  it('reduces to radial explode for a document with no assemblies', () => {
    // a x 0..2, b x 8..10: centre (5,1,1); a → (1,1,1) − (5,1,1) = (−4,0,0).
    const flat = { ...createDocument('Flat'), boards: [cube('a', [0, 0, 0]), cube('b', [8, 0, 0])] };
    expectVec(explodeOffsets(flat, 1).get('a'), [-4, 0, 0]);
    expectVec(explodeOffsets(flat, 1).get('b'), [4, 0, 0]);
  });

  it('explodes a piece wrapped in one assembly as fully as the unwrapped piece (fu 264)', () => {
    // a x 0..2, b x 8..10 inside wrapper W, the root's only item; W in turn may hold only V.
    // A one-child level does not count: a's term is full weight, (1,1,1) − (5,1,1) = (−4,0,0),
    // exactly the flat document's. Before the fix it moved by EXPLODE_INNER·(−4,0,0).
    const inner = { id: 'dv', boards: [cube('a', [0, 0, 0]), cube('b', [8, 0, 0])], instances: [], hardware: [] };
    const wrapped: SloydDocument = { ...createDocument('Wrapped'),
      instances: [{ id: 'W', name: 'Wrapper', definition: 'dv', position: [0, 0, 0], rotation: 0 }],
      definitions: [inner] };
    expectVec(explodeOffsets(wrapped, 1).get('W/a'), [-4, 0, 0]);
    expectVec(explodeOffsets(wrapped, 1).get('W/b'), [4, 0, 0]);
    const doubly: SloydDocument = { ...createDocument('Doubly'),
      instances: [{ id: 'W', name: 'Wrapper', definition: 'dw', position: [0, 0, 0], rotation: 0 }],
      definitions: [{ id: 'dw', boards: [], instances: [{ id: 'V', name: 'Inner', definition: 'dv', position: [0, 0, 0], rotation: 0 }], hardware: [] }, inner], hardware: [] };
    expectVec(explodeOffsets(doubly, 1).get('W/V/a'), [-4, 0, 0]);
  });

  it('returns the same map for the same document and amount', () => {
    const d = doc();
    expect(explodeOffsets(d, 0.4)).toBe(explodeOffsets(d, 0.4));
  });

  it('explode floor lift uses real bounds: no exploded part goes below the floor (splayed legs spec §6.2, R2)', () => {
    // A 28in leg leaning rake 8°, splay 12° whose REAL foot is on the floor: its pre-lean box bottom is below y = 0.
    // The real minimum is taken here from the leaned box corners (a plain leg's one body is its box), independently of
    // partBounds. A small cube on the floor explodes far lower than the leg (its centre is well below the root's).
    const base = createBoard({ id: 'L', name: 'Leg', length: 28, width: 1.5, thickness: 1.5, posture: 'upright', position: [0, 0, 0] });
    const atOrigin: Board = { ...base, lean: { x: slopeOf(12), z: slopeOf(8), face: chooseFace(base, slopeOf(12), slopeOf(8)) } };
    const realMinY = (b: Board): number => {
      const m = leanMap(b);
      const box = boardsBounds([b])!;
      if (!m) return box.min[1];
      const ys = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => m.apply([
        i & 1 ? box.max[0] : box.min[0], i & 2 ? box.max[1] : box.min[1], i & 4 ? box.max[2] : box.min[2],
      ])[1]);
      return Math.min(...ys);
    };
    const leg: Board = { ...atOrigin, position: [0, -realMinY(atOrigin), 0] };
    expect(leg.position[1]).toBeLessThan(0);
    expect(Math.abs(realMinY(leg))).toBeLessThan(1e-12);
    const parts: Board[] = [leg, cube('C', [6, 0, 0])];
    const d: SloydDocument = { ...createDocument('Splayed'), boards: parts };
    for (const amount of [0.3, 1]) {
      const o = explodeOffsets(d, amount);
      for (const b of parts) expect(realMinY(b) + o.get(b.id)![1]).toBeGreaterThanOrEqual(-1e-9);
      // The lowest exploded part sits on the floor: lifted to the assembled piece's real minimum, 0.
      expect(Math.min(...parts.map((b) => realMinY(b) + o.get(b.id)![1]))).toBeCloseTo(0, 9);
    }
  });
});
