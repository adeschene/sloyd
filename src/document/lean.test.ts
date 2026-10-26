import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { cornerShift, mirrorPart, rotateVec, type Vec3 } from './frames';
import {
  chooseFace, degreesOf, leanFlip, leanMap, leans, leanTwist, resultantDeg, seamFree, sightlineDeg, slopeOf, withinBound, worldSlopes,
  type LeanMap, type Mat3,
} from './lean';
import { axisFrame } from './geometry';
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

  it('no seam: a rake-only lean kept on width, or splay-only kept on thickness, twists 0 via the other face', () => {
    for (const [x, z, face] of [[0, T8, 'width'], [0, -T8, 'width'], [T12, 0, 'thickness'], [-T12, 0, 'thickness']] as const) {
      const m = mapOf(leg(x, z, face));
      expect(Math.abs(m.applyDir([1, 0, 0])[2])).toBeLessThan(1e-12);
      expect(Math.abs(m.applyDir([0, 0, 1])[0])).toBeLessThan(1e-12);
    }
  });

  it('seamFree flips exactly the two seam cases, in the stored turn-0 frame, and returns any other lean itself', () => {
    // The turn-0 frame seamFree assumes: an upright part's width on X, thickness on Z.
    const frame = axisFrame({ ...leg(0, 0, 'width'), rotation: 0 });
    expect([frame[0].dim, frame[2].dim]).toEqual(['width', 'thickness']);
    expect(seamFree({ x: 0, z: T8, face: 'width' })).toEqual({ x: 0, z: T8, face: 'thickness' });
    expect(seamFree({ x: -0, z: -T8, face: 'width' }).face).toBe('thickness');
    expect(seamFree({ x: T12, z: 0, face: 'thickness' })).toEqual({ x: T12, z: 0, face: 'width' });
    for (const l of [
      { x: 0, z: T8, face: 'thickness' }, { x: T12, z: 0, face: 'width' }, { x: T12, z: T8, face: 'width' },
      { x: T12, z: T8, face: 'thickness' }, { x: T10, z: T10, face: 'width' },
    ] as Lean[]) expect(seamFree(l)).toBe(l);
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
    const leans: [number, number, Lean['face']][] = [];
    for (const [x, z] of [[T12, T8], [T10, T10]] as const) for (const face of ['width', 'thickness'] as const) leans.push([x, z, face]);
    // The seam leans (a sightline perpendicular to the stored facing dimension, spec §3.4).
    leans.push([0, T8, 'width'], [0, -T8, 'width'], [T12, 0, 'thickness']);
    for (const [x, z, face] of leans) {
      const b = leg(x, z, face);
      const mirrored: Board = { ...mirrorPart(b), lean: leanFlip(b.lean!) };
      const m = mapOf(b);
      const mm = mapOf(mirrored);
      expectMatClose(mm.m, mul(S, mul(m.m, S)));
      expectVecClose(mm.pivot, [-m.pivot[0], m.pivot[1], m.pivot[2]]);
    }
  });

  it('turn equivariance: the part at turn r gives Ry · m · Ryᵀ, pivot turned, for r = 90, 180, 270', () => {
    // Ry is rotateVec(r)'s own matrix (rows are where each output axis reads from), so the test's turn is the turn the
    // composition makes (inv 44).
    for (const r of [90, 180, 270] as const) {
      const cols = [rotateVec(r, [1, 0, 0]), rotateVec(r, [0, 1, 0]), rotateVec(r, [0, 0, 1])];
      const Ry: Mat3 = [0, 1, 2].map((i) => [cols[0]![i]!, cols[1]![i]!, cols[2]![i]!]) as unknown as Mat3;
      for (const [x, z, face] of [[T12, T8, 'width'], [T12, T8, 'thickness'], [0, T8, 'width'], [T12, 0, 'thickness']] as const) {
        const b0 = leg(x, z, face);
        const pr = rotateVec(r, b0.position);
        const shift = cornerShift(r, b0);
        const br: Board = { ...b0, rotation: r, position: [pr[0] + shift[0], pr[1] + shift[1], pr[2] + shift[2]] };
        const m0 = mapOf(b0);
        const mr = mapOf(br);
        expectMatClose(mr.m, mul(Ry, mul(m0.m, transpose(Ry))));
        expectVecClose(mr.pivot, rotateVec(r, m0.pivot));
      }
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

  it('chooseFace throws on a part that is not upright', () => {
    expect(() => chooseFace(createBoard({ posture: 'flat' }), T12, T8)).toThrow();
  });

  it('zero lean is no lean', () => {
    expect(leanMap(leg(0, 0, 'width'))).toBeNull();
    expect(leanMap(leg(0, 0, 'thickness'))).toBeNull();
    expect(leanMap(leg(-0, 0, 'width'))).toBeNull();
    const zero: Lean = { x: 0, z: 0, face: 'width' };
    expect(seamFree(zero)).toBe(zero);
  });

  it('no lean, no map', () => {
    const b = createBoard({ posture: 'upright' });
    expect(leanMap(b)).toBeNull();
  });
});

describe('leanMap and leans agree: one predicate (final review I3)', () => {
  // A part that is not upright cannot lean (§3.2; the loader strips such a lean). Built past the loader, a flat or on-edge
  // board carrying one used to get a map (its 'width' face is horizontal) while `leans` said no, so modules gated on
  // one drew it upright while others bounded, snapped or noted it as leaning.
  for (const posture of ['flat', 'on-edge'] as const) {
    for (const face of ['width', 'thickness'] as const) {
      it(`${posture}, a ${face}-facing lean: no map, and it does not lean`, () => {
        const b: Board = { ...createBoard({ posture, length: 16, width: 1.5, thickness: 1.5 }), lean: { x: 0.2, z: 0.1, face } };
        expect(leanMap(b)).toBeNull();
        expect(leans(b)).toBe(false);
      });
    }
  }
  it('an upright board with the same lean has a map and leans', () => {
    const b: Board = { ...createBoard({ posture: 'upright', length: 16, width: 1.5, thickness: 1.5 }), lean: { x: 0.2, z: 0.1, face: 'width' } };
    expect(leanMap(b)).not.toBeNull();
    expect(leans(b)).toBe(true);
  });
});

describe('a square-set lean is m = T: tilted, never twisted (square-set legs spec §3.2, §1)', () => {
  const square = (x: number, z: number, face?: Lean['face'], extra: Partial<Board> = {}): Board => {
    const b = leg(x, z, face, extra);
    return { ...b, lean: { ...b.lean!, square: true } };
  };
  /** T alone, built independently of leanMap: the Rodrigues rotation taking straight down onto normalize(wx, −1, wz). */
  const tiltOf = (wx: number, wz: number): Mat3 => {
    const len = Math.hypot(wx, 1, wz);
    const n = [wx / len, -1 / len, wz / len];
    const k = [-n[2]!, 0, n[0]!];
    const K: Mat3 = [[0, -k[2]!, k[1]!], [k[2]!, 0, -k[0]!], [-k[1]!, k[0]!, 0]];
    const K2 = mul(K, K);
    const f = 1 / (1 + 1 / len);
    return [0, 1, 2].map((i) => [0, 1, 2].map((j) => (i === j ? 1 : 0) + K[i]![j]! + K2[i]![j]! * f)) as unknown as Mat3;
  };

  it('equals T: orthonormal, det +1, takes straight down onto the slopes, for either stored face', () => {
    for (const face of ['width', 'thickness'] as const) {
      const b = square(T12, T8, face);
      const { m } = mapOf(b);
      expectMatClose(m, tiltOf(T12, T8), 1e-15);
      expectMatClose(mul(m, transpose(m)), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
      expect(Math.abs(dot(m[0], cross(m[1], m[2])) - 1)).toBeLessThan(1e-12);
      const down = mapOf(b).applyDir([0, -1, 0]);
      const len = Math.hypot(T12, 1, T8);
      expectVecClose(down, [T12 / len, -1 / len, T8 / len]);
    }
    // The stored face never reaches the map.
    expect(mapOf(square(T12, T8, 'width')).m).toEqual(mapOf(square(T12, T8, 'thickness')).m);
  });

  it('the faces\' plan twist at rake 8°, splay 12° is −0.83° (width) / +0.82° (thickness), to 0.01°', () => {
    const m = mapOf(square(T12, T8));
    const w = m.applyDir([1, 0, 0]);
    const t = m.applyDir([0, 0, 1]);
    const D = 180 / Math.PI;
    expect(Math.abs(Math.atan2(w[2], w[0]) * D - -0.83)).toBeLessThan(0.01);
    expect(Math.abs((Math.atan2(t[2], t[0]) - Math.PI / 2) * D - 0.82)).toBeLessThan(0.01);
    // The turned map of the same slopes twists its facing face onto the sightline (about 33.5°): not a near-identity.
    const turned = mapOf(leg(T12, T8, 'width')).applyDir([1, 0, 0]);
    expect(Math.abs(Math.atan2(turned[2], turned[0]) * D)).toBeGreaterThan(30);
  });

  it('mirror conjugation: the flipped square-set lean on the reflected part is S · m · S', () => {
    const S: Mat3 = [[-1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (const [x, z, face] of [[T12, T8, 'width'], [T12, -T8, 'thickness'], [T10, T10, 'width'], [0, T8, 'thickness'], [T12, 0, 'width']] as const) {
      const b = square(x, z, face);
      const flipped = leanFlip(b.lean!);
      expect(flipped.square).toBe(true);
      const mirrored: Board = { ...mirrorPart(b), lean: flipped };
      const m = mapOf(b);
      const mm = mapOf(mirrored);
      expectMatClose(mm.m, mul(S, mul(m.m, S)));
      expectVecClose(mm.pivot, [-m.pivot[0], m.pivot[1], m.pivot[2]]);
    }
  });

  it('a turned lean is unchanged byte for byte (captured before square-set existed)', () => {
    expect(mapOf(leg(T12, T8, 'width')).m).toEqual([
      [0.8083214867244805, -0.2059745553251538, -0.5515350003926592],
      [0.24692695919021473, 0.9690340947691541, 2.7755575615628914e-17],
      [0.5344562198390057, -0.13618886053393325, 0.8341517507875107],
    ]);
    expect(mapOf(leg(T12, T8, 'thickness')).m).toEqual([
      [0.5515350003926593, -0.2059745553251538, 0.8083214867244805],
      [0, 0.9690340947691541, 0.24692695919021473],
      [-0.8341517507875107, -0.13618886053393325, 0.5344562198390058],
    ]);
  });

  it('leanTwist is exactly 0 for a rake-only or splay-only lean, either sign, either face, every turn; non-zero at 8°/12°', () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const [x, z] of [[T12, 0], [-T12, 0], [0, T8], [0, -T8]] as const) {
        for (const face of ['width', 'thickness'] as const) {
          expect(leanTwist(leg(x, z, face, { rotation }), { x, z, face })).toBe(0);
        }
      }
    }
    const b = leg(T12, T8, 'width');
    expect(Math.abs(leanTwist(b, b.lean!)! * 180 / Math.PI)).toBeGreaterThan(30);
  });

  it('when τ = 0 (rake only, splay only) the square-set and turned maps are the same, entry for entry', () => {
    for (const rotation of [0, 90] as const) {
      for (const [x, z, face] of [[0, T8, 'thickness'], [T12, 0, 'width'], [0, -T8, 'thickness']] as const) {
        const a = mapOf(leg(x, z, face, { rotation })).m;
        const q = mapOf(square(x, z, face, { rotation })).m;
        for (let i = 0; i < 3; i += 1) for (let j = 0; j < 3; j += 1) expect(Math.abs(a[i]![j]! - q[i]![j]!)).toBeLessThan(1e-15);
      }
    }
  });
});
