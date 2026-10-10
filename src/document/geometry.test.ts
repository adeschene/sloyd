import { createBoard } from './document';
import type { Board, Dimension, Posture, Rotation } from './document';
import {
  axisDimensions, axisFrame, boardExtents, endFacing, fromWorldOffset, horizontalOf,
  spanFromWorldOffset, spanToWorldOffset, toWorldOffset,
} from './geometry';

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
const part = (posture: Posture, rotation: Rotation): Board =>
  createBoard({ length: 20, width: 6, thickness: 1.5, posture, rotation });

/** A part coordinate → world point relative to the part's CENTRE. */
const rel = (b: Board, p: Record<Dimension, number>): [number, number, number] => {
  const f = axisFrame(b);
  const e = boardExtents(b);
  return [0, 1, 2].map((i) => toWorldOffset(b, i, p[f[i]!.dim]) - e[i]! / 2) as [number, number, number];
};

describe('axisFrame', () => {
  it('turn 0: flat and upright unchanged and unreversed; on-edge reverses only thickness', () => {
    for (const posture of ['flat', 'upright'] as const) expect(axisFrame(createBoard({ posture, rotation: 0 })).every((a) => !a.reversed)).toBe(true);
    expect(axisFrame(createBoard({ posture: 'on-edge', rotation: 0 }))).toEqual([
      { dim: 'length', reversed: false }, { dim: 'width', reversed: false }, { dim: 'thickness', reversed: true },
    ]);
  });

  it('every posture has ONE hand at every turn: (length, width, thickness) maps with determinant -1 (fu 215)', () => {
    const dirOf = (b: Board, d: Dimension): [number, number, number] => {
      const v: [number, number, number] = [0, 0, 0];
      axisFrame(b).forEach((a, i) => { if (a.dim === d) v[i] = a.reversed ? -1 : 1; });
      return v;
    };
    const det3 = (a: number[], b: number[], c: number[]) =>
      a[0]! * (b[1]! * c[2]! - b[2]! * c[1]!) - a[1]! * (b[0]! * c[2]! - b[2]! * c[0]!) + a[2]! * (b[0]! * c[1]! - b[1]! * c[0]!);
    for (const posture of POSTURES) for (const rotation of TURNS) {
      const b = createBoard({ posture, rotation });
      expect(det3(dirOf(b, 'length'), dirOf(b, 'width'), dirOf(b, 'thickness'))).toBe(-1);
    }
  });

  it('turn 0 puts the same dimensions on the same axes in every posture (only direction changed)', () => {
    for (const posture of POSTURES) {
      const [h0, h1] = horizontalOf(posture);
      const f = axisFrame(part(posture, 0));
      expect(f.map((a) => a.dim)).toEqual([h0, f[1]!.dim, h1]);
    }
  });

  it('matches the spec §2 table', () => {
    const [h0, h1] = horizontalOf('flat'); // length, width
    const f = (r: Rotation) => axisFrame(part('flat', r)).map((a) => [a.dim, a.reversed]);
    expect(f(90)).toEqual([[h1, false], ['thickness', false], [h0, true]]);
    expect(f(180)).toEqual([[h0, true], ['thickness', false], [h1, true]]);
    expect(f(270)).toEqual([[h1, true], ['thickness', false], [h0, false]]);
  });

  it('axisDimensions is axisFrame without the directions', () => {
    for (const posture of POSTURES) for (const r of TURNS) {
      const b = part(posture, r);
      expect(axisDimensions(b)).toEqual(axisFrame(b).map((a) => a.dim));
    }
  });

  // The core property: each turn is the previous one rotated a quarter turn
  // counter-clockwise from above, about the centre: (x, y, z) -> (z, y, -x).
  it('each turn is the previous one rotated 90° about the vertical', () => {
    const probes: Record<Dimension, number>[] = [
      { length: 0, width: 0, thickness: 0 },
      { length: 3, width: 1, thickness: 0.25 },
      { length: 20, width: 2, thickness: 1.5 },
    ];
    for (const posture of POSTURES) for (const r of TURNS) {
      const a = part(posture, r);
      const b = part(posture, ((r + 90) % 360) as Rotation);
      for (const p of probes) {
        const [x, y, z] = rel(a, p);
        const got = rel(b, p);
        expect(got[0]).toBeCloseTo(z, 12);
        expect(got[1]).toBeCloseTo(y, 12);
        expect(got[2]).toBeCloseTo(-x, 12);
      }
    }
  });

  it('no turn changes handedness relative to turn 0', () => {
    const det = (b: Board) => {
      const f = axisFrame(b);
      // Column for each part dimension: which world axis, with which sign.
      const col = (d: Dimension) => [0, 1, 2].map((i) => (f[i]!.dim === d ? (f[i]!.reversed ? -1 : 1) : 0));
      const [l, w, t] = [col('length'), col('width'), col('thickness')];
      return l[0]! * (w[1]! * t[2]! - w[2]! * t[1]!) - l[1]! * (w[0]! * t[2]! - w[2]! * t[0]!) + l[2]! * (w[0]! * t[1]! - w[1]! * t[0]!);
    };
    for (const posture of POSTURES) {
      const d0 = det(part(posture, 0));
      for (const r of TURNS) expect(det(part(posture, r))).toBe(d0);
    }
  });
});

describe('the offset helpers', () => {
  it('toWorldOffset and fromWorldOffset invert each other; spans keep min <= max', () => {
    for (const posture of POSTURES) for (const r of TURNS) {
      const b = part(posture, r);
      for (const axis of [0, 1, 2]) {
        expect(fromWorldOffset(b, axis, toWorldOffset(b, axis, 1.25))).toBeCloseTo(1.25, 12);
        const s = spanToWorldOffset(b, axis, [1, 2.5]);
        expect(s[0]).toBeLessThanOrEqual(s[1]);
        expect(spanFromWorldOffset(b, axis, s)).toEqual([1, 2.5]);
      }
    }
  });

  it('a reversed axis puts part coordinate 0 at the world max side', () => {
    const b = part('flat', 180); // X carries length, reversed
    expect(toWorldOffset(b, 0, 0)).toBe(20);
    expect(toWorldOffset(b, 0, 20)).toBe(0);
    expect(endFacing(b, 0, -1)).toBe('max');
    expect(endFacing(b, 0, 1)).toBe('min');
    expect(endFacing(part('flat', 0), 0, -1)).toBe('min');
  });
});
