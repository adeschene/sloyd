import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { cornerShift, mirrorPart, rotateVec, type Vec3 } from './frames';
import {
  chooseFace, degreesOf, leanFlip, leanMap, resultantDeg, sightlineDeg, slopeOf, withinBound, worldSlopes,
  type LeanMap, type Mat3,
} from './lean';
import type { Board, Lean } from './types';

const T12 = slopeOf(12);
const T8 = slopeOf(8);
const T10 = slopeOf(10);

/** An upright 1.5 × 1.5 × 16 leg at the origin (splayed legs spec §9), leaning by (x, z). */
function leg(x: number, z: number, face?: Lean['face'], extra: Partial<Board> = {}): Board {
  const b = createBoard({ length: 16, width: 1.5, thickness: 1.5, posture: 'upright', position: [0, 0, 0], ...extra });
  return { ...b, lean: { x, z, face: face ?? chooseFace(b, x, z) } };
}

function mapOf(b: Board): LeanMap {
  const m = leanMap(b);
  if (!m) throw new Error('expected a lean map');
  return m;
}

const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): Vec3 =>
  [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const mul = (a: Mat3, b: Mat3): Mat3 =>
  a.map((row) => [0, 1, 2].map((j) => row[0]! * b[0]![j]! + row[1]! * b[1]![j]! + row[2]! * b[2]![j]!)) as unknown as Mat3;
const transpose = (a: Mat3): Mat3 => [0, 1, 2].map((i) => [a[0]![i]!, a[1]![i]!, a[2]![i]!]) as unknown as Mat3;

function expectVecClose(a: readonly number[], b: readonly number[], tol = 1e-12) {
  for (let i = 0; i < 3; i += 1) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(tol);
}
function expectMatClose(a: Mat3, b: Mat3, tol = 1e-12) {
  for (let i = 0; i < 3; i += 1) expectVecClose(a[i]!, b[i]!, tol);
}

/** The facing dimension's world direction before the lean (an axis line; its sign does not matter). */
function facingDir(b: Board): Vec3 {
  // Upright at turn 0: width on X, thickness on Z (axisFrame's v12 table).
  const onX = b.rotation === 0 || b.rotation === 180 ? 'width' : 'thickness';
  return b.lean!.face === onX ? [1, 0, 0] : [0, 0, 1];
}

describe('lean.ts (splayed legs spec §3.1–§3.4)', () => {
  it('resultant and sightline, hand-worked', () => {
    expect(Math.abs(resultantDeg({ x: T12, z: T8 }) - 14.2957)).toBeLessThan(1e-4);
    expect(Math.abs(sightlineDeg(T12, T8) - 33.4724)).toBeLessThan(1e-4);
    expect(Math.abs(degreesOf(T12) - 12)).toBeLessThan(1e-12);
  });

  it('the pivot is the top-face centre and is fixed', () => {
    const m = mapOf(leg(T12, T8));
    expectVecClose(m.pivot, [0.75, 16, 0.75]);
    expectVecClose(m.apply(m.pivot), m.pivot);
  });

  it('the foot travels along the slopes', () => {
    const b = leg(T12, T8);
    const m = mapOf(b);
    const d = sub(m.apply([0.75, 0, 0.75]), m.pivot);
    const [wx, wz] = worldSlopes(b);
    expectVecClose(cross(d, [wx, -1, wz]), [0, 0, 0], 1e-12);
    expect(dot(d, [wx, -1, wz])).toBeGreaterThan(0);
    expect(Math.abs(Math.hypot(...d) - 16)).toBeLessThan(1e-12);
  });

  it('the facing dimension lies in the sightline\'s vertical plane', () => {
    for (const [x, z] of [[T12, T8], [-T12, T8], [T12, -T8], [T8, T12], [T10, T10]] as const) {
      for (const face of ['width', 'thickness'] as const) {
        const b = leg(x, z, face);
        const [wx, wz] = worldSlopes(b);
        const perp: Vec3 = [-wz, 0, wx];
        expect(Math.abs(dot(mapOf(b).applyDir(facingDir(b)), perp))).toBeLessThan(1e-12);
      }
    }
  });

  it('twist is smallest: a splay-only or rake-only lean keeps each horizontal axis in its own vertical plane', () => {
    for (const [x, z] of [[T12, 0], [-T12, 0], [0, T8], [0, -T8]] as const) {
      const m = mapOf(leg(x, z));
      expect(Math.abs(m.applyDir([1, 0, 0])[2])).toBeLessThan(1e-12);
      expect(Math.abs(m.applyDir([0, 0, 1])[0])).toBeLessThan(1e-12);
    }
  });

  it('the seam: a rake-only lean kept on width twists +90°, the closed end of (−90°, 90°]', () => {
    // σ = 90° and the facing line at 0 give τ = 90° exactly: X turns toward +Z, never −Z (spec §3.3).
    const m = mapOf(leg(0, T8, 'width'));
    expect(m.applyDir([1, 0, 0])[2]).toBeGreaterThan(0.99);
  });

  it('round trip', () => {
    const m = mapOf(leg(T12, -T8));
    for (let i = 0; i < 20; i += 1) {
      const p: Vec3 = [Math.sin(i * 1.7) * 9 - 2, Math.cos(i * 0.9) * 13 + 3, (i - 10) * 0.73];
      expectVecClose(m.inverse(m.apply(p)), p);
      expectVecClose(m.apply(m.inverse(p)), p);
      expectVecClose(m.inverseDir(m.applyDir(p)), p);
      expectVecClose(m.applyDir(m.inverseDir(p)), p);
    }
  });

  it('the matrix is orthonormal with det +1', () => {
    const { m } = mapOf(leg(T12, T8));
    expectMatClose(mul(m, transpose(m)), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    expect(Math.abs(dot(m[0], cross(m[1], m[2])) - 1)).toBeLessThan(1e-12);
  });

  it('mirror conjugation: the flipped lean on the reflected part is S · m · S', () => {
    const S: Mat3 = [[-1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (const [x, z] of [[T12, T8], [T10, T10]] as const) {
      for (const face of ['width', 'thickness'] as const) {
        const b = leg(x, z, face);
        const mirrored: Board = { ...mirrorPart(b), lean: leanFlip(b.lean!) };
        const m = mapOf(b);
        const mm = mapOf(mirrored);
        expectMatClose(mm.m, mul(S, mul(m.m, S)));
        expectVecClose(mm.pivot, [-m.pivot[0], m.pivot[1], m.pivot[2]]);
      }
    }
  });

  it('turn equivariance: the part at turn 90 gives Ry · m · Ryᵀ, pivot turned', () => {
    // Ry is rotateVec(90)'s own matrix (rows are where each output axis reads from), so the test's turn is the turn the
    // composition makes (inv 44).
    const cols = [rotateVec(90, [1, 0, 0]), rotateVec(90, [0, 1, 0]), rotateVec(90, [0, 0, 1])];
    const Ry: Mat3 = [0, 1, 2].map((i) => [cols[0]![i]!, cols[1]![i]!, cols[2]![i]!]) as unknown as Mat3;
    for (const face of ['width', 'thickness'] as const) {
      const b0 = leg(T12, T8, face);
      const p90 = rotateVec(90, b0.position);
      const shift = cornerShift(90, b0);
      const b90: Board = { ...b0, rotation: 90, position: [p90[0] + shift[0], p90[1] + shift[1], p90[2] + shift[2]] };
      const m0 = mapOf(b0);
      const m90 = mapOf(b90);
      expectMatClose(m90.m, mul(Ry, mul(m0.m, transpose(Ry))));
      expectVecClose(m90.pivot, rotateVec(90, m0.pivot));
    }
  });

  it('bound', () => {
    expect(withinBound(1, 0)).toBe(true);
    expect(withinBound(0, -1)).toBe(true);
    expect(withinBound(0.8, 0.8)).toBe(false);
    expect(withinBound(1 + 1e-6, 0)).toBe(false);
    expect(withinBound(Number.NaN, 0)).toBe(false);
  });

  it('chooseFace tie goes to width', () => {
    const b = leg(0, 0, 'width');
    expect(chooseFace(b, T10, T10)).toBe('width');
    expect(chooseFace(b, T12, T8)).toBe('width');
    expect(chooseFace(b, T8, T12)).toBe('thickness');
    expect(chooseFace(b, 0, T8)).toBe('thickness');
  });

  it('leanFlip negates the turn-0 X slope only, keeping a zero +0', () => {
    expect(leanFlip({ x: T12, z: T8, face: 'thickness' })).toEqual({ x: -T12, z: T8, face: 'thickness' });
    expect(Object.is(leanFlip({ x: -0, z: T8, face: 'width' }).x, 0)).toBe(true);
  });

  it('no lean, no map', () => {
    const b = createBoard({ posture: 'upright' });
    expect(leanMap(b)).toBeNull();
  });
});
