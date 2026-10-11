import { describe, expect, it } from 'vitest';
import { placeBoard, placeInstance, mirrorPart } from './frames';
import type { Frame } from './frames';
import { worldSolids } from './designCheck';
import { chiralPart, sameSet } from './turnFixtures';
import type { Board, Instance, Rotation } from './types';

const POSTURES = ['flat', 'on-edge', 'upright'] as const;
const TURNS: Rotation[] = [0, 90, 180, 270];

/** A point turned by r about the vertical, counter-clockwise from above, written out by hand: 90 -> (z, y, -x). */
const turnPoint = (r: Rotation, [x, y, z]: number[]): number[] =>
  r === 90 ? [z!, y!, -x!] : r === 180 ? [-x!, y!, -z!] : r === 270 ? [-z!, y!, x!] : [x!, y!, z!];
/** A box through one frame, by hand: reflect local X if mirrored, turn, translate, then re-box the corners. */
const boxThrough = (f: Frame, b: { min: number[]; max: number[] }) => {
  const corners: number[][] = [];
  for (const x of [b.min[0]!, b.max[0]!]) for (const y of [b.min[1]!, b.max[1]!]) for (const z of [b.min[2]!, b.max[2]!]) {
    const m = f.mirrored ? [-x, y, z] : [x, y, z];
    const t = turnPoint(f.rotation, m);
    corners.push([t[0]! + f.position[0]!, t[1]! + f.position[1]!, t[2]! + f.position[2]!]);
  }
  return { min: [0, 1, 2].map((i) => Math.min(...corners.map((c) => c[i]!))), max: [0, 1, 2].map((i) => Math.max(...corners.map((c) => c[i]!))) };
};
/** Expected world solids: the bare part's solids through the frames, INNERMOST FIRST. */
const expected = (b: Board, frames: Frame[]) =>
  worldSolids(b).map((s) => frames.reduceRight((acc, f) => boxThrough(f, acc), { min: s.min, max: s.max }));
const flat = (bs: { min: number[]; max: number[] }[]) => bs.map((s) => [...s.min, ...s.max]);
const part = (posture: (typeof POSTURES)[number], s: Rotation): Board =>
  ({ ...chiralPart(posture), rotation: s, position: [0.5, 0.25, 1.25] });

describe('placing a part through a mirrored frame (mirrored-instances spec §3)', () => {
  it('equals the hand reflection, for every posture x part turn x frame turn x mirror', () => {
    for (const posture of POSTURES) for (const s of TURNS) for (const r of TURNS) for (const mirrored of [false, true]) {
      const b = part(posture, s);
      const f: Frame = { position: [3, 0, -2], rotation: r, mirrored };
      const got = worldSolids(placeBoard(f, b));
      expect(got.length).toBe(worldSolids(b).length);
      expect(sameSet(flat(got), flat(expected(b, [f]))), `${posture} s${s} r${r} m${mirrored}`).toBe(true);
    }
  });

  it('negates the part turn, keeps posture and sizes, and mirrors along length (flat, on-edge) or width (upright)', () => {
    expect(mirrorPart(part('flat', 90)).rotation).toBe(270);
    expect(mirrorPart(part('upright', 0)).rotation).toBe(0);
    const m = mirrorPart(part('upright', 0));
    expect([m.posture, m.length, m.width, m.thickness]).toEqual(['upright', 20, 6, 1.5]);
    // chiralPart's c2 (face width, across length, offset 0.375 w 0.5) has its position on thickness: a mirror
    // along length leaves it, and so does one along width (face width flips from instead).
    const c2f = mirrorPart(part('flat', 0)).cuts.find((c) => c.id === 'c2')!;
    expect(c2f).toMatchObject({ face: 'width', from: 'min', stopMin: 12, stopMax: 2 }); // across length: stops swap
    const c2u = mirrorPart(part('upright', 0)).cuts.find((c) => c.id === 'c2')!;
    expect(c2u).toMatchObject({ face: 'width', from: 'max', stopMin: 2, stopMax: 12 }); // face width: from flips
  });

  it('writes +0, never -0, for a reflected zero', () => {
    const b = { ...part('flat', 0), position: [-20, 0, 0] as [number, number, number] }; // x + ex = 0
    expect(Object.is(mirrorPart(b).position[0], 0)).toBe(true);
    const j: Instance = { id: 'j', name: 'J', definition: 'd', position: [0, 1, 2], rotation: 0 };
    expect(Object.is(placeInstance({ position: [0, 0, 0], rotation: 0, mirrored: true }, j).position[0], 0)).toBe(true);
  });

  it('two mirrors cancel and three equal one, at every depth (nested frames, innermost first)', () => {
    const A: Frame = { position: [10, 0, 4], rotation: 90, mirrored: true };
    const B: Frame = { position: [2, 1, -3], rotation: 270, mirrored: true };
    const C: Frame = { position: [-1, 0, 5], rotation: 180, mirrored: true };
    for (const posture of POSTURES) for (const s of TURNS) {
      const b = part(posture, s);
      const two = worldSolids(placeBoard(A, placeBoard(B, b)));
      expect(sameSet(flat(two), flat(expected(b, [A, B]))), `two ${posture} ${s}`).toBe(true);
      const three = worldSolids(placeBoard(A, placeBoard(B, placeBoard(C, b))));
      expect(sameSet(flat(three), flat(expected(b, [A, B, C]))), `three ${posture} ${s}`).toBe(true);
    }
  });

  it('placeInstance reflects a nested origin, negates its turn and flips its flag, so Ungroup matches the walk', () => {
    const A: Frame = { position: [10, 0, 4], rotation: 90, mirrored: true };
    const j: Instance = { id: 'j', name: 'J', definition: 'd', position: [2, 1, -3], rotation: 270, mirrored: true };
    const lifted = placeInstance(A, j);
    expect(lifted.mirrored).toBeUndefined();
    expect('mirrored' in lifted).toBe(false);
    const plainJ: Instance = { ...j, mirrored: undefined };
    delete (plainJ as Partial<Instance>).mirrored;
    expect(placeInstance(A, plainJ).mirrored).toBe(true);
    for (const posture of POSTURES) {
      const b = part(posture, 90);
      expect(sameSet(flat(worldSolids(placeBoard(lifted, b))), flat(worldSolids(placeBoard(A, placeBoard(j, b)))))).toBe(true);
    }
  });

  it('an unmirrored frame is bit-identical to before (identity frame included)', () => {
    const b = part('on-edge', 90);
    expect(placeBoard({ position: [0, 0, 0], rotation: 0 }, b)).toEqual(b);
    expect(placeBoard({ position: [0, 0, 0], rotation: 0, mirrored: false }, b)).toEqual(b);
  });
});
