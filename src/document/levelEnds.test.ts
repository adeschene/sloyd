import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { isLevelled, levelCutOf, levelPlan, sameLevelLine, LEVEL_BELOW_FLOOR, LEVEL_FOOT_CUT, LEVEL_TOP_CUT, type LevelPlan } from './levelEnds';
import { leanMap, slopeOf } from './lean';
import { miterFields, taperCut } from './angleCuts';
import { partGeometry } from './bodies';
import { toWorld } from './snapPoints';
import type { AngleCut, Board, Lean } from './types';
import type { Units } from '../units/length';
import type { Vec3 } from './frames';

const IN: Units = { display: 'imperial-fractional', precision: 16 };
const MM: Units = { display: 'metric-mm', precision: 16 };
const T8 = slopeOf(8);
const T12 = slopeOf(12);
/** Rake 8° (world Z), splay 12° (world X) at turn 0: the sightline is nearer X, so width faces it. */
const LEAN: Lean = { x: T12, z: T8, face: 'width' };
/** The hand-worked leg (brief): length 16, pivot at y = 16. */
const leg = (over: Partial<Board> = {}): Board =>
  createBoard({ id: 'L', name: 'Leg', length: 16, width: 1.5, thickness: 1.25, posture: 'upright', position: [0.123, 0, 0.456], lean: LEAN, ...over });

const ok = (p: LevelPlan | string): LevelPlan => {
  if (typeof p === 'string') throw new Error(`refused: ${p}`);
  return p;
};
const apply = (b: Board, p: LevelPlan): Board => ({ ...b, length: p.length, position: p.position, angleCuts: p.angleCuts });
const levelled = (b: Board, units = IN) => apply(b, ok(levelPlan(b, units)));
const cutOn = (b: Board, end: 'foot' | 'top') => b.angleCuts.find((c) => levelCutOf(c, b.lean!) === end)!;

const P = (v: readonly number[]) => ({ length: v[0]!, width: v[1]!, thickness: v[2]! });
/** World vertices and outward world normals of the faces the cut made, off the real leaned bodies. */
function cutFaces(b: Board, c: AngleCut): { verts: Vec3[]; normal: Vec3 }[] {
  return worldFaces(b, (f) => f.cut === c.id);
}
const allFaces = (b: Board) => worldFaces(b, () => true);
function worldFaces(b: Board, keep: (f: { cut?: string }) => boolean): { verts: Vec3[]; normal: Vec3 }[] {
  return partGeometry(b).bodies.flatMap((body) => body.faces).filter(keep).map((f) => {
    const v0 = f.verts[0]!;
    const a = toWorld(b, P(v0));
    const tip = toWorld(b, P([v0[0] + f.n[0], v0[1] + f.n[1], v0[2] + f.n[2]]));
    const n: Vec3 = [tip[0] - a[0], tip[1] - a[1], tip[2] - a[2]];
    const len = Math.hypot(...n);
    return { verts: f.verts.map((v) => toWorld(b, P(v))), normal: [n[0] / len, n[1] / len, n[2] / len] };
  });
}
const axisUp = (b: Board): Vec3 => leanMap(b)!.applyDir([0, 1, 0]);
const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const cross = (a: readonly number[], b: readonly number[]): Vec3 =>
  [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

describe('levelPlan (splayed legs spec §5)', () => {
  it('foot face on the floor: every vertex of the foot cut\'s faces is at y = 0 and the face looks straight down', () => {
    const b = levelled(leg());
    const faces = cutFaces(b, cutOn(b, 'foot'));
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) {
      for (const v of f.verts) expect(Math.abs(v[1])).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(f.normal[0])).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(f.normal[1] + 1)).toBeLessThanOrEqual(1e-12);
      expect(Math.abs(f.normal[2])).toBeLessThanOrEqual(1e-12);
    }
    // And nothing of the old end face survives beside it: every downward face of the leaned bodies is on the floor.
    const down = allFaces(b).filter((f) => f.normal[1] < -0.5);
    expect(down.length).toBeGreaterThan(0);
    for (const f of down) for (const v of f.verts) expect(Math.abs(v[1])).toBeLessThanOrEqual(1e-9);
  });

  it('top face level through the old pivot: every vertex of the top cut\'s faces is at y = 16, facing up', () => {
    const b = levelled(leg());
    const faces = cutFaces(b, cutOn(b, 'top'));
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) {
      for (const v of f.verts) expect(Math.abs(v[1] - 16)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(f.normal[1] - 1)).toBeLessThanOrEqual(1e-12);
    }
  });

  it('every corner of each end just reaches its plane: both depths of both cuts are ≥ 0 (no end face survives)', () => {
    for (const b of [levelled(leg()), levelled(leg({ length: 30 })), levelled(leg({ length: 400 / 25.4 }), MM)]) {
      for (const end of ['foot', 'top'] as const) {
        const c = cutOn(b, end);
        for (const [, d] of c.points) expect(d).toBeGreaterThanOrEqual(-1e-9);
      }
    }
  });

  it('the leaned axis is one line: the old pivot lies on the new axis, the axis is parallel, and the pivot moved up it by e_t > 0', () => {
    const before = leg();
    const lm0 = leanMap(before)!;
    const after = levelled(before);
    const lm1 = leanMap(after)!;
    const u0 = axisUp(before);
    const u1 = axisUp(after);
    expect(Math.hypot(...cross(u0, u1))).toBeLessThanOrEqual(1e-12);
    // The new pivot is P + e_t·u with e_t > 0 (the top is always extended from an uncut top).
    const d = sub(lm1.pivot, lm0.pivot);
    const eT = d[0] * u0[0] + d[1] * u0[1] + d[2] * u0[2];
    expect(eT).toBeGreaterThan(0);
    for (let k = 0; k < 3; k += 1) expect(Math.abs(lm1.pivot[k]! - (lm0.pivot[k]! + eT * u0[k]!))).toBeLessThanOrEqual(1e-9);
    // And the old pivot's distance from the new axis (through P' along u1) is 0.
    expect(Math.hypot(...cross(sub(lm0.pivot, lm1.pivot), u1))).toBeLessThanOrEqual(1e-9);
  });

  it('the length is a grid blank: each end\'s change rounds up to 1/16 (imperial) or 1 mm (metric)', () => {
    const p = ok(levelPlan(leg(), IN));
    expect(Number.isInteger(p.length * 16)).toBe(true);
    expect(p.length).toBeGreaterThan(16);
    const m = ok(levelPlan(leg({ length: 400 / 25.4 }), MM));
    const mm = m.length * 25.4;
    expect(Math.abs(mm - Math.round(mm))).toBeLessThanOrEqual(1e-9);
    expect(m.length).toBeGreaterThan(400 / 25.4);
  });

  it('the foot is shortened when it runs past the floor: a 30-long leg with its pivot at 16 gets the small wedge', () => {
    const b = leg({ length: 30, position: [0.123, -14, 0.456] });
    expect(leanMap(b)!.pivot[1]).toBe(16);
    const p = ok(levelPlan(b, IN));
    expect(p.length).toBeLessThan(30);
    const foot = apply(b, p).angleCuts.find((c) => levelCutOf(c, b.lean!) === 'foot')!;
    const R = Math.atan(Math.hypot(T12, T8));
    const W = b.width;
    for (const [, d] of foot.points) expect(d).toBeLessThanOrEqual(W * Math.tan(R) + 1 / 16 + 1e-9);
    const faces = cutFaces(apply(b, p), foot);
    for (const f of faces) for (const v of f.verts) expect(Math.abs(v[1])).toBeLessThanOrEqual(1e-9);
  });

  it('cuts are read-only rows: miterFields returns null for both (offset lines after the round-up)', () => {
    const b = levelled(leg());
    expect(miterFields(cutOn(b, 'foot'), b)).toBeNull();
    expect(miterFields(cutOn(b, 'top'), b)).toBeNull();
  });

  it('cuts are end miters along the seam-free facing dimension, stations from min', () => {
    const b = levelled(leg());
    expect(cutOn(b, 'foot')).toMatchObject({ kind: 'miter', face: 'length', from: 'min', along: 'width', alongFrom: 'min' });
    expect(cutOn(b, 'top')).toMatchObject({ kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min' });
    // A rake-only lean stored on width (a loaded file) twists onto thickness: the cut follows the twisted face.
    const r = levelled(leg({ lean: { x: 0, z: T8, face: 'width' } }));
    expect(r.angleCuts.every((c) => c.along === 'thickness')).toBe(true);
    for (const f of cutFaces(r, r.angleCuts[0]!)) for (const v of f.verts) expect(Math.abs(v[1])).toBeLessThanOrEqual(1e-9);
  });

  it('a turned part levels too (the facing dimension found through axisFrame)', () => {
    for (const rotation of [90, 180, 270] as const) {
      const b = levelled(leg({ rotation }));
      for (const f of cutFaces(b, cutOn(b, 'foot'))) for (const v of f.verts) expect(Math.abs(v[1])).toBeLessThanOrEqual(1e-9);
      for (const f of cutFaces(b, cutOn(b, 'top'))) for (const v of f.verts) expect(Math.abs(v[1] - 16)).toBeLessThanOrEqual(1e-9);
    }
  });

  describe('the refusals, verbatim', () => {
    it('an unrecognised end cut on the foot (a miter along the through dimension) or the top', () => {
      const across = (from: 'min' | 'max'): AngleCut =>
        ({ id: 'x', kind: 'miter', face: 'length', from, along: 'thickness', alongFrom: 'min', points: [[0, 0], [1.25, 0.5]] });
      expect(levelPlan(leg({ angleCuts: [across('min')] }), IN)).toBe(LEVEL_FOOT_CUT);
      expect(LEVEL_FOOT_CUT).toBe('Remove the angle cut on the foot first.');
      expect(levelPlan(leg({ angleCuts: [across('max')] }), IN)).toBe(LEVEL_TOP_CUT);
      expect(LEVEL_TOP_CUT).toBe('Remove the angle cut on the top first.');
    });

    it('a pivot at the floor', () => {
      expect(levelPlan(leg({ position: [0, -16, 0] }), IN)).toBe(LEVEL_BELOW_FLOOR);
      expect(LEVEL_BELOW_FLOOR).toBe('The top of this part is at or below the floor.');
    });

    it('a taper on the foot does not block and is kept, untouched (controller ruling Q2)', () => {
      const taper = { id: 't1', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 12, amount: 0.375 }) };
      const p = ok(levelPlan(leg({ angleCuts: [taper] }), IN));
      expect(p.angleCuts[0]).toBe(taper);
      expect(p.angleCuts).toHaveLength(3);
    });
  });

  describe('idempotent, and isLevelled', () => {
    it('isLevelled(apply(levelPlan(leg))) is true, and a second plan changes nothing (ids, order, numbers)', () => {
      for (const [b, units] of [[leg(), IN], [leg({ length: 30, position: [0, -14, 0] }), IN], [leg({ length: 400 / 25.4 }), MM]] as const) {
        expect(isLevelled(b, units)).toBe(false);
        const once = levelled(b, units);
        expect(isLevelled(once, units)).toBe(true);
        const twice = ok(levelPlan(once, units));
        expect(Math.abs(twice.length - once.length)).toBeLessThanOrEqual(1e-9);
        twice.position.forEach((v, i) => expect(Math.abs(v - once.position[i]!)).toBeLessThanOrEqual(1e-9));
        expect(twice.angleCuts.map((c) => c.id)).toEqual(once.angleCuts.map((c) => c.id));
        twice.angleCuts.forEach((c, i) => expect(sameLevelLine(c, once.angleCuts[i]!, once.width)).toBe(true));
      }
    });

    it('isLevelled goes false after a lean edit or a resize; re-levelling replaces the two cuts in place and keeps the seat height', () => {
      const once = levelled(leg());
      expect(isLevelled({ ...once, lean: { ...LEAN, z: slopeOf(9) } }, IN)).toBe(false);
      expect(isLevelled({ ...once, length: once.length + 1, position: [once.position[0], once.position[1] - 1, once.position[2]] }, IN)).toBe(false);
      expect(isLevelled({ ...once, width: 1.75, position: [once.position[0] - 0.125, once.position[1], once.position[2]] }, IN)).toBe(false);
      // A re-level after a lean edit: the same ids, the top plane through where the old top cut met the axis.
      const edited: Board = { ...once, lean: { ...LEAN, z: slopeOf(9) } };
      const top = cutOn(edited, 'top');
      const lm = leanMap(edited)!;
      const seat = lm.pivot[1] - (top.points[0][1] + top.points[1][1]) / 2 * axisUp(edited)[1];
      const again = levelled(edited);
      expect(again.angleCuts.map((c) => c.id)).toEqual(once.angleCuts.map((c) => c.id));
      for (const f of cutFaces(again, cutOn(again, 'top'))) for (const v of f.verts) expect(Math.abs(v[1] - seat)).toBeLessThanOrEqual(1e-9);
      for (const f of cutFaces(again, cutOn(again, 'foot'))) for (const v of f.verts) expect(Math.abs(v[1])).toBeLessThanOrEqual(1e-9);
      expect(isLevelled(again, IN)).toBe(true);
    });

    it('isLevelled is false on a part that does not lean', () => {
      const { lean: _l, ...plain } = leg();
      expect(isLevelled(plain as Board, IN)).toBe(false);
    });
  });
});
