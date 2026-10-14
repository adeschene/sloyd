import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { Board, Posture, Rotation } from './document';
import { bevelCut, chamferCut, miterCut, miterRatio } from './angleCuts';
import { axisDimensions } from './geometry';
import { DIRS } from './taperWorld';
import type { Dir } from './taperWorld';
import { angleCutsFor, angleRatiosOf, noAngles, ratioFor, sortAngleCuts, worldAngles } from './angleWorld';
import type { WorldAngles } from './angleWorld';

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
const poses = () => POSTURES.flatMap((posture) => TURNS.map((rotation) => createBoard({ name: `P ${posture} ${rotation}`, length: 20, width: 3, thickness: 1.5, posture, rotation })));
const axisOf = (b: Board, dim: 'length' | 'width' | 'thickness') => 'xyz'[axisDimensions(b).indexOf(dim)]!;
const dir = (b: Board, dim: 'length' | 'width' | 'thickness', sign: '-' | '+') => `${sign}${axisOf(b, dim)}` as Dir;
const stored = (b: Board, a: WorldAngles, exact?: ReadonlyMap<number, number>) => {
  const r = angleCutsFor(b, a, exact);
  if ('fault' in r) throw new Error(r.fault);
  return { ...b, angleCuts: r.cuts.map((c, i) => ({ id: `a${i}`, ...c })) };
};
/** A CHIRAL set: a miter, a bevel and an unequal-legged chamfer, each on a different world side. */
const hand = (b: Board): WorldAngles => ({
  miters: [{ end: dir(b, 'length', '+'), longPoint: dir(b, 'width', '-'), angle: 37.5 }],
  bevels: [{ face: dir(b, 'thickness', '+'), longPoint: dir(b, 'width', '+'), angle: 15 }],
  chamfers: [{ edge: [dir(b, 'width', '-'), dir(b, 'thickness', '-')], legs: [0.25, 0.125] }],
});

describe('angleCutsFor / worldAngles (AI-angles spec §5.2, §5.3)', () => {
  for (const b of poses()) {
    it(`${b.name}: design → stored → design round-trips, and every cut lands on the world side it names`, () => {
      const a = hand(b);
      const s = stored(b, a);
      expect(s.angleCuts.map((c) => c.kind)).toEqual(['miter', 'bevel', 'chamfer']);
      const back = worldAngles(s)!;
      expect(back.miters).toEqual([{ ...a.miters[0], angle: back.miters[0]!.angle }]);
      expect(back.miters[0]!.angle).toBeCloseTo(37.5, 9);
      expect(back.bevels[0]!.face).toBe(a.bevels[0]!.face);
      expect(back.bevels[0]!.longPoint).toBe(a.bevels[0]!.longPoint);
      expect(back.chamfers).toHaveLength(1);
      // The chamfer's legs follow its faces whatever order the edge is written in (DIRS-rank normalised).
      const ch = back.chamfers[0]!;
      // Read back in ONE order, DIRS rank, whatever the stored face/along order (the change list and Refine key on it).
      expect(DIRS.indexOf(ch.edge[0])).toBeLessThan(DIRS.indexOf(ch.edge[1]));
      const legOf = (d: Dir) => ch.legs[ch.edge.indexOf(d)];
      expect(legOf(dir(b, 'width', '-'))).toBe(0.25);
      expect(legOf(dir(b, 'thickness', '-'))).toBe(0.125);
      // Re-storing what was read gives the same cuts exactly (exact-angle map from the stored part).
      const again = stored(b, back, angleRatiosOf([s]));
      expect(again.angleCuts.map(({ id: _i, ...c }) => c)).toEqual(s.angleCuts.map(({ id: _i, ...c }) => c));
    });
  }
  it('a chamfer edge written in either order gives one stored part', () => {
    const b = poses()[0]!;
    const e: [Dir, Dir] = [dir(b, 'width', '+'), dir(b, 'thickness', '+')];
    const x = stored(b, { ...noAngles(), chamfers: [{ edge: e, legs: [0.25, 0.125] }] });
    const y = stored(b, { ...noAngles(), chamfers: [{ edge: [e[1], e[0]], legs: [0.125, 0.25] }] });
    expect(y.angleCuts).toEqual(x.angleCuts);
  });
  it('the canonical order: miters, bevels, chamfers, each by stored fields, whatever the input order', () => {
    const b = poses()[0]!;
    const a = hand(b);
    const two: WorldAngles = { ...a, chamfers: [...a.chamfers, { edge: [dir(b, 'width', '+'), dir(b, 'thickness', '+')], legs: [0.125, 0.125] }] };
    const rev: WorldAngles = { miters: a.miters, bevels: a.bevels, chamfers: [...two.chamfers].reverse() };
    expect(stored(b, rev).angleCuts).toEqual(stored(b, two).angleCuts);
    expect(sortAngleCuts([...stored(b, two).angleCuts].reverse())).toEqual(stored(b, two).angleCuts);
  });
  it('45° is stored as ratio 1 exactly; any other angle is rounded to 0.1° unless the exact map has it', () => {
    expect(ratioFor(45)).toBe(1);
    expect(ratioFor(37.46)).toBe(miterRatio(37.5));
    expect(ratioFor(37.46, new Map([[37.46, 0.7]]))).toBe(0.7);
  });
  it('angleRatiosOf maps the degree text worldAngles writes to the stored slope', () => {
    const b = poses()[0]!;
    const s = stored(b, hand(b));
    const m = angleRatiosOf([s]);
    const deg = worldAngles(s)!.miters[0]!.angle;
    expect(m.get(deg)).toBe(s.angleCuts[0]!.points[1][1] / s.angleCuts[0]!.points[1][0]);
  });
  it('worldAngles is null for a cut no row can describe (an offset miter; a kind whose shape does not match)', () => {
    const b = poses()[0]!;
    const m = { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, b) };
    expect(worldAngles({ ...b, angleCuts: [m] })).not.toBeNull();
    expect(worldAngles({ ...b, angleCuts: [{ ...m, points: [[0, 0.5], [3, 3.5]] }] })).toBeNull();
    const ch = { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.25, legAlong: 0.25 }, b) };
    expect(worldAngles({ ...b, angleCuts: [{ ...ch, kind: 'bevel' }] })).toBeNull();
    expect(worldAngles({ ...b, angleCuts: [] })).toEqual(noAngles());
  });
});

describe('angleCutsFor — faults (Review Focus 4)', () => {
  const b = poses()[0]!;
  const L = (s: '-' | '+') => dir(b, 'length', s);
  const W = (s: '-' | '+') => dir(b, 'width', s);
  const T = (s: '-' | '+') => dir(b, 'thickness', s);
  const fault = (a: Partial<WorldAngles>) => {
    const r = angleCutsFor(b, { ...noAngles(), ...a });
    return 'fault' in r ? r.code : null;
  };
  it.each([
    ['a miter on a side, not an end', { miters: [{ end: W('+'), longPoint: T('-'), angle: 45 }] }, 'direction'],
    ['two miters at one end', { miters: [{ end: L('+'), longPoint: W('-'), angle: 45 }, { end: L('+'), longPoint: T('-'), angle: 30 }] }, 'direction'],
    ['a miter long point on an end', { miters: [{ end: L('+'), longPoint: L('-'), angle: 45 }] }, 'direction'],
    ['a bevel on an end', { bevels: [{ face: L('+'), longPoint: W('-'), angle: 15 }] }, 'direction'],
    ['a bevel long point not across its face', { bevels: [{ face: T('+'), longPoint: T('-'), angle: 15 }] }, 'direction'],
    ['a chamfer edge on one axis', { chamfers: [{ edge: [W('+'), W('-')], legs: [0.125, 0.125] }] as WorldAngles['chamfers'] }, 'direction'],
    ['the same chamfer edge twice', { chamfers: [{ edge: [W('+'), T('+')], legs: [0.125, 0.125] }, { edge: [T('+'), W('+')], legs: [0.25, 0.25] }] as WorldAngles['chamfers'] }, 'direction'],
    ['an angle of 0', { miters: [{ end: L('+'), longPoint: W('-'), angle: 0.04 }] }, 'angle'],
    ['an angle of 90', { bevels: [{ face: T('+'), longPoint: W('-'), angle: 89.96 }] }, 'angle'],
    ['a zero leg', { chamfers: [{ edge: [W('+'), T('+')], legs: [0, 0.125] }] as WorldAngles['chamfers'] }, 'legs'],
    ['a miter deeper than the length', { miters: [{ end: L('+'), longPoint: W('-'), angle: 89 }] }, 'no-wood'],
    ['a bevel deeper than its face', { bevels: [{ face: T('+'), longPoint: W('-'), angle: 60 }] }, 'no-wood'],
    ['a chamfer leg longer than the part', { chamfers: [{ edge: [W('+'), T('+')], legs: [0.125, 2] }] as WorldAngles['chamfers'] }, 'no-wood'],
  ])('%s → %s', (_n, a, code) => {
    expect(fault(a as Partial<WorldAngles>)).toBe(code);
  });
  it('the boundary angles and depths that ARE allowed', () => {
    expect(fault({ miters: [{ end: L('+'), longPoint: W('-'), angle: 0.05 }] })).toBeNull();
    expect(fault({ chamfers: [{ edge: [W('+'), T('+')], legs: [3, 1.5] }] })).toBeNull();   // legs equal to the dims
  });
});

describe('worldAngles after a resize (final review I1)', () => {
  it('reads a miter or bevel stored at an older run as the same plane, not as undescribable', () => {
    const rail = createBoard({ name: 'Rail', length: 20, width: 3, thickness: 0.75 });
    const m = { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, rail) };
    const wider = { ...rail, width: 3.5, angleCuts: [m] };          // resized in Properties: the cut keeps [[0,0],[3,3]]
    expect(worldAngles(wider)!.miters).toEqual([{ end: dir(wider, 'length', '+'), longPoint: dir(wider, 'width', '-'), angle: 45 }]);
    // Re-stored at the new run: the same plane (depth = station), exactly.
    const again = stored(wider, worldAngles(wider)!, angleRatiosOf([wider]));
    expect(again.angleCuts[0]!.points).toEqual([[0, 0], [3.5, 3.5]]);
    const panel = createBoard({ name: 'Panel', length: 20, width: 10, thickness: 0.75 });
    const v = { id: 'v', ...bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: miterRatio(15) }, panel) };
    expect(worldAngles({ ...panel, thickness: 1, angleCuts: [v] })!.bevels).toHaveLength(1);
  });
});

describe('two miters that leave wood (final review M1)', () => {
  const part = (length: number, width: number) => createBoard({ name: 'P', length, width, thickness: 0.75 });
  const miters = (b: Board, longs: ['-' | '+', '-' | '+']) => ({ ...noAngles(), miters: [
    { end: dir(b, 'length', '-'), longPoint: dir(b, 'width', longs[0]), angle: 45 },
    { end: dir(b, 'length', '+'), longPoint: dir(b, 'width', longs[1]), angle: 45 },
  ] });
  it('a parallelogram (long points on opposite sides) leaves wood and is accepted', () => {
    const b = part(4, 3);
    expect('cuts' in angleCutsFor(b, miters(b, ['-', '+']))).toBe(true);
  });
  it("Properties' 'Miter both ends' on a short part (long points on one side) leaves wood and is accepted", () => {
    const b = part(5, 3);
    expect('cuts' in angleCutsFor(b, miters(b, ['-', '-']))).toBe(true);
  });
});
