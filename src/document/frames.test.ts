import { addTurns, inverseTurn, mirrorFeatures, mirrorInPlace, mirrorPart, placeBoard, placeInstance, rotateVec } from './frames';
import { chiralAll } from './sweepFixtures';
import { boardExtents } from './geometry';
import { boardHoles } from './holes';
import { toWorld } from './snapPoints';
import { chiralPart, rotateQuarter, sameSet } from './turnFixtures';
import { worldSolids } from './designCheck';
import { createBoard } from './document';
import type { Board, Instance, Posture, Rotation } from './types';

const TURNS: Rotation[] = [0, 90, 180, 270];
const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];

describe('rotateVec', () => {
  it('a quarter turn is turnFixtures.rotateQuarter about the origin, the turn axisFrame uses', () => {
    const p: [number, number, number] = [1.3, 2.7, -0.9];
    expect(rotateVec(90, p)).toEqual(rotateQuarter(p, [0, 0, 0]));
  });
  it('composes by addition', () => {
    const p = [1.3, 2.7, -0.9];
    for (const a of TURNS) for (const b of TURNS) {
      expect(rotateVec(a, rotateVec(b, p))).toEqual(rotateVec(addTurns(a, b), p));
    }
  });
  it('inverseTurn undoes a turn', () => {
    for (const r of TURNS) expect(addTurns(r, inverseTurn(r))).toBe(0);
  });
});

describe('placeBoard (assemblies spec §2.1)', () => {
  it('the identity frame moves nothing, bit for bit, on decimal and millimetre values', () => {
    const b = createBoard({ position: [0.1, 0.2, 300 / 25.4], length: 7.3, rotation: 270, posture: 'on-edge' });
    const out = placeBoard({ position: [0, 0, 0], rotation: 0 }, b);
    expect(out.position).toEqual(b.position);
    expect(out.rotation).toBe(b.rotation);
  });

  it('is a true rotation for every posture, part turn and frame turn', () => {
    const origin = [3.3, 1.7, -2.9];
    for (const posture of POSTURES) for (const rb of TURNS) for (const rf of TURNS) {
      const b = { ...chiralPart(posture), rotation: rb, position: [0.4, 0.6, -1.2] as [number, number, number] };
      const placed = placeBoard({ position: origin, rotation: rf }, b);
      const expected = worldSolids(b).map((s) => {
        const a = rotateVec(rf, s.min), c = rotateVec(rf, s.max);
        return [0, 1, 2].flatMap((i) => [Math.min(a[i]!, c[i]!) + origin[i]!, Math.max(a[i]!, c[i]!) + origin[i]!]);
      });
      const got = worldSolids(placed).map((s) => [0, 1, 2].flatMap((i) => [s.min[i]!, s.max[i]!]));
      expect(sameSet(got, expected), `${posture} rb=${rb} rf=${rf}`).toBe(true);
    }
  });
});

describe('placeInstance', () => {
  it('placing through a composed frame agrees with placing twice, within rounding', () => {
    const outer: Instance = { id: 'o', name: 'O', definition: 'd', position: [10.1, 0.3, 3.3], rotation: 90 };
    const inner: Instance = { id: 'i', name: 'I', definition: 'e', position: [0.7, 1.1, 2.3], rotation: 270 };
    const b = { ...chiralPart('upright'), rotation: 180 as Rotation, position: [0.2, 0.1, 0.05] as [number, number, number] };
    const twice = placeBoard(outer, placeBoard(inner, b));
    const once = placeBoard(placeInstance(outer, inner), b);
    expect(once.rotation).toBe(twice.rotation);
    once.position.forEach((v, i) => expect(v).toBeCloseTo(twice.position[i]!, 9));
  });
});

describe('mirrorInPlace (mirrored links, fu 432, spec §3)', () => {
  const boxes = (b: Board) => worldSolids(b).map((s) => [...s.min, ...s.max]);
  const holeCentres = (b: Board) => boardHoles(b).map((h) => toWorld(b, { length: h.centre[0], width: h.centre[1], thickness: h.centre[2] }));
  /** Shift every x (box min/max at 0 and 3; a point at 0) by dx. */
  const shiftBox = (dx: number) => (s: number[]) => [s[0]! + dx, s[1]!, s[2]!, s[3]! + dx, s[4]!, s[5]!];
  /** Reflect a box about x = c by hand: x -> 2c - x, min and max swapped. */
  const reflectBox = (c: number) => (s: number[]) => [2 * c - s[3]!, s[1]!, s[2]!, 2 * c - s[0]!, s[4]!, s[5]!];

  it('keeps the box for every posture x turn (position unchanged)', () => {
    for (const posture of POSTURES) for (const r of TURNS) {
      const b = { ...chiralAll(posture), rotation: r, position: [0.4, 0.6, -1.2] as [number, number, number] };
      const m = mirrorInPlace(b);
      expect(boardExtents(m), `${posture} ${r}`).toEqual(boardExtents(b));
      expect(m.position).toEqual(b.position);
      expect(m.rotation).toBe(inverseTurn(r));
    }
  });

  it('is mirrorPart reflected back about the box centre: world solids and hole centres, every posture x turn', () => {
    for (const posture of POSTURES) for (const r of TURNS) {
      const b = { ...chiralAll(posture), rotation: r, position: [0.4, 0.6, -1.2] as [number, number, number] };
      const m = mirrorInPlace(b);
      const ex = boardExtents(b)[0];
      const dx = 2 * b.position[0] + ex; // mirrorPart reflects about x = 0; in place reflects about the box's centre
      expect(sameSet(boxes(m), boxes(mirrorPart(b)).map(shiftBox(dx))), `${posture} ${r} vs mirrorPart`).toBe(true);
      expect(sameSet(boxes(m), boxes(b).map(reflectBox(b.position[0] + ex / 2))), `${posture} ${r} by hand`).toBe(true);
      const hm = holeCentres(m), hp = holeCentres(mirrorPart(b)).map(([x, y, z]) => [x + dx, y, z]);
      expect(sameSet(hm, hp), `${posture} ${r} holes`).toBe(true);
      // Chiral: the reflection is not the part itself.
      expect(sameSet(hm, holeCentres(b)), `${posture} ${r} chiral`).toBe(false);
    }
  });

  it('mirrorFeatures changes only the six feature arrays', () => {
    const b = { ...chiralAll('upright'), rotation: 90 as Rotation };
    const f = mirrorFeatures(b);
    const { cuts: _c, angleCuts: _a, holes: _h, curves: _k, profiles: _p, bands: _b, ...rest } = f;
    const { cuts: _c2, angleCuts: _a2, holes: _h2, curves: _k2, profiles: _p2, bands: _b2, ...restB } = b;
    expect(rest).toEqual(restB);
    expect(f).toEqual({ ...mirrorPart(b), rotation: b.rotation, position: b.position });
  });
});
