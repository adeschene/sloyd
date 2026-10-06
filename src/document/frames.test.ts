import { addTurns, inverseTurn, placeBoard, placeInstance, rotateVec } from './frames';
import { chiralPart, rotateQuarter, sameSet } from './turnFixtures';
import { worldSolids } from './designCheck';
import { createBoard } from './document';
import type { Instance, Posture, Rotation } from './types';

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
