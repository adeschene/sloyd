import { createBoard, createDocument } from './document';
import type { SloydDocument } from './types';
import { explodeOffsets, EXPLODE_INNER } from './explode';

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
      instances: [{ id: 'j', name: 'Peg', definition: 'd2', position: [0, 4, 0], rotation: 0 }] },
    { id: 'd2', boards: [cube('s', [0, 0, 0])], instances: [] },
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

  it('returns the same map for the same document and amount', () => {
    const d = doc();
    expect(explodeOffsets(d, 0.4)).toBe(explodeOffsets(d, 0.4));
  });
});
