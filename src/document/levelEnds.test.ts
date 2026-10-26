import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { isLevelled, levelCutOf, levelPlan, sameLevelLine, LEVEL_BELOW_FLOOR, LEVEL_CUTS_HOLE, LEVEL_FOOT_CUT, LEVEL_TOP_CUT, type LevelPlan } from './levelEnds';
import { levelEndHoles } from './holeRebase';
import { holeInstances } from './holes';
import { leanMap, slopeOf } from './lean';
import { depthAt, depthAtCross, miterFields, mirrorAngleCut, taperCut, throughOf } from './angleCuts';
import { squareStoolLegs } from './stoolFixture';
import { mirrorPart } from './frames';
import { partGeometry } from './bodies';
import { toWorld } from './snapPoints';
import type { AngleCut, Board, HoleRow, Lean } from './types';
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
const cutOn = (b: Board, end: 'foot' | 'top') => b.angleCuts.find((c) => levelCutOf(c) === end)!;

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
    const foot = apply(b, p).angleCuts.find((c) => levelCutOf(c) === 'foot')!;
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
    it('an unrecognised end cut on the foot or the top (an end chamfer: face length, not a miter)', () => {
      const across = (from: 'min' | 'max'): AngleCut =>
        ({ id: 'x', kind: 'chamfer', face: 'length', from, along: 'thickness', alongFrom: 'min', points: [[0, 0.25], [0.25, 0]] });
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

    // Task 6 review: a lean edit that flips the seam-free facing dimension leaves level cuts along the OLD one. They are
    // still level cuts: Level replaces them along the new face, the top through the old joint height.
    for (const [label, start, edit] of [
      ['width → thickness (splay to 0)', LEAN, (l: Lean): Lean => ({ x: 0, z: l.z, face: 'thickness' })],
      ['thickness → width (rake to 0)', { ...LEAN, face: 'thickness' as const }, (l: Lean): Lean => ({ x: l.x, z: 0, face: 'width' })],
    ] as const) {
      it(`a seam-free face flip (${label}) re-levels, never refuses`, () => {
        const once = levelled(leg({ lean: start }));
        const before = start.face;
        expect(once.angleCuts.every((c) => c.along === before)).toBe(true);
        const edited: Board = { ...once, lean: edit(start) };
        const top = cutOn(edited, 'top');
        const seat = leanMap(edited)!.pivot[1] - (top.points[0][1] + top.points[1][1]) / 2 * axisUp(edited)[1];
        const again = levelled(edited);
        expect(again.angleCuts).toHaveLength(2);
        expect(again.angleCuts.every((c) => c.along === edited.lean!.face && c.along !== before)).toBe(true);
        expect(again.angleCuts.map((c) => c.id)).toEqual(once.angleCuts.map((c) => c.id));
        for (const f of cutFaces(again, cutOn(again, 'foot'))) for (const v of f.verts) expect(Math.abs(v[1])).toBeLessThanOrEqual(1e-9);
        for (const f of cutFaces(again, cutOn(again, 'top'))) for (const v of f.verts) expect(Math.abs(v[1] - seat)).toBeLessThanOrEqual(1e-9);
        expect(isLevelled(again, IN)).toBe(true);
      });
    }

    it('isLevelled is false on a part that does not lean', () => {
      const { lean: _l, ...plain } = leg();
      expect(isLevelled(plain as Board, IN)).toBe(false);
    });
  });
});

// Angled holes spec §7 (Task 9): Level the ends keeps every hole row where it was in the wood. The foot grows by eF (the
// length MIN end), the top by eT (the MAX end); the old wood occupies length ∈ [eF, eF + L] of the new part.
describe('levelEndHoles: the rows after the ends grow (angled holes §7)', () => {
  const base = (over: Partial<HoleRow>): HoleRow => ({
    id: 'h', face: 'width', from: 'min', diameter: 0.25, depth: 0.5, along: 'length', alongFrom: 'min', station: 3, count: 1,
    pitch: 0, acrossFrom: 'min', inset: 0.4, ...over,
  });
  const eF = 0.3125;
  const eT = 0.4375;
  const run = (r: HoleRow) => levelEndHoles([r], eF, eT, leg())[0]!;

  it('a station measured from the foot moves by eF, from the top by eT (one addition)', () => {
    expect(run(base({ alongFrom: 'min' })).station).toBe(3 + eF);
    expect(run(base({ alongFrom: 'max' })).station).toBe(3 + eT);
  });

  it('an inset measured along the length moves by its end\'s amount', () => {
    const r = base({ face: 'width', along: 'thickness', station: 0.5, inset: 2 });
    expect(run({ ...r, acrossFrom: 'min' }).inset).toBe(2 + eF);
    expect(run({ ...r, acrossFrom: 'max' }).inset).toBe(2 + eT);
    expect(run({ ...r, acrossFrom: 'min' }).station).toBe(0.5);
  });

  it('a blind square row entering an end deepens by that end\'s amount; its station and inset stay', () => {
    const r = base({ face: 'length', along: 'width', station: 0.75, inset: 0.6, depth: 1 });
    const f = run({ ...r, from: 'min' });
    expect(f.depth).toBe(1 + eF);
    expect([f.station, f.inset]).toEqual([0.75, 0.6]);
    expect(run({ ...r, from: 'max' }).depth).toBe(1 + eT);
  });

  it('a through square row entering an end is the same object; a row nothing moves is the same object', () => {
    const t = base({ face: 'length', along: 'width', station: 0.75, inset: 0.6, depth: 'through' });
    expect(run(t)).toBe(t);
    const none = base({});
    expect(levelEndHoles([none], 0, 0, leg())[0]).toBe(none);
  });

  it('a blind tilted row entering an end: depth += e·|bit|, station −= e·tiltAlong, inset −= e·tiltAcross', () => {
    const a = slopeOf(10);
    const c = -slopeOf(6);
    const r = base({ face: 'length', along: 'width', station: 0.75, inset: 0.6, depth: 1, tiltAlong: a, tiltAcross: c });
    for (const [from, e] of [['min', eF], ['max', eT]] as const) {
      const g = run({ ...r, from });
      expect(g.depth).toBe(1 + e * Math.hypot(1, a, c));
      expect(g.station).toBe(0.75 - e * a);
      expect(g.inset).toBe(0.6 - e * c);
      expect([g.tiltAlong, g.tiltAcross]).toEqual([a, c]);
    }
  });

  it('a through tilted row entering an end keeps its line in the wood: station and inset shift, depth stays through', () => {
    const a = slopeOf(10);
    const r = base({ face: 'length', from: 'max', along: 'width', station: 0.75, inset: 0.6, depth: 'through', tiltAlong: a });
    const g = run(r);
    expect(g.depth).toBe('through');
    expect(g.station).toBe(0.75 - eT * a);
    expect(g.inset).toBe(0.6);
  });

  // Review Focus 3, in the pure plan, through the real leaned placement, for every flag combination: a row measured
  // along the length keeps its world mouth (and bottom); a row entering an end keeps its world LINE (the old mouth on
  // the new axis, the same direction) and a blind one its world bottom — its mouth moved out with the end face.
  const W = (b: Board, p: readonly number[]) => toWorld(b, P(p));
  const sub = (a: Vec3, c: Vec3): Vec3 => [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
  const near = (a: Vec3, c: Vec3, what: string) => a.forEach((x, i) => expect(Math.abs(x - c[i]!), `${what} axis ${i}`).toBeLessThanOrEqual(1e-9));
  const along = (b: Board, p: LevelPlan): void => {
    const nb: Board = { ...apply(b, p), holes: p.holes };
    b.holes.forEach((r, k) => {
      const h = holeInstances(b, r)[0]!;
      const g = holeInstances(nb, p.holes[k]!)[0]!;
      const far = (x: typeof h): Vec3 => [x.centre[0] + x.reach * x.bit[0], x.centre[1] + x.reach * x.bit[1], x.centre[2] + x.reach * x.bit[2]];
      const tip = (x: typeof h): Vec3 => [x.centre[0] + x.bit[0], x.centre[1] + x.bit[1], x.centre[2] + x.bit[2]];
      if (r.depth !== 'through') near(W(nb, far(g)), W(b, far(h)), `${r.id} bottom`);
      if (r.face !== 'length') { near(W(nb, g.centre), W(b, h.centre), `${r.id} mouth`); return; }
      const d = sub(W(nb, tip(g)), W(nb, g.centre));
      near(d, sub(W(b, tip(h)), W(b, h.centre)), `${r.id} direction`);
      const o = sub(W(b, h.centre), W(nb, g.centre));
      const t = (o[0] * d[0] + o[1] * d[1] + o[2] * d[2]) / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
      expect(Math.abs(t), `${r.id} the mouth moved`).toBeGreaterThan(0.01);
      near([o[0] - t * d[0], o[1] - t * d[1], o[2] - t * d[2]], [0, 0, 0], `${r.id} old mouth off the new axis`);
    });
  };
  for (const from of ['min', 'max'] as const) for (const af of ['min', 'max'] as const) for (const cf of ['min', 'max'] as const) {
    it(`world points kept: an end row from ${from} (along ${af}, across ${cf}) and a side socket`, () => {
      const holes: HoleRow[] = [
        base({ id: 'e', face: 'length', from, along: 'width', alongFrom: af, acrossFrom: cf, station: 0.7, inset: 0.55, depth: 1.25, tiltAlong: slopeOf(9), tiltAcross: -slopeOf(5) }),
        base({ id: 't', face: 'length', from, along: 'thickness', alongFrom: af, acrossFrom: cf, station: 0.6, inset: 0.7, depth: 'through', tiltAlong: slopeOf(2) }),
        base({ id: 's', face: 'thickness', from: 'max', along: 'length', alongFrom: af, acrossFrom: cf, station: 5, inset: 0.6, depth: 0.5, tiltAlong: slopeOf(20) }),
      ];
      const b = leg({ holes });
      const p = ok(levelPlan(b, IN));
      expect(p.length).not.toBe(b.length);
      along(b, p);
    });
  }

  it('the foot shortened past a hole near it refuses before any change (the loader would drop the row)', () => {
    const b = leg({ length: 30, position: [0.123, -14, 0.456], holes: [base({ station: 0.01 })] });
    expect(levelPlan(b, IN)).toBe(LEVEL_CUTS_HOLE);
    expect(LEVEL_CUTS_HOLE).toBe('Levelling the ends would cut away a hole — move it or remove it first.');
    expect(typeof levelPlan({ ...b, holes: [base({ station: 20 })] }, IN)).not.toBe('string');
  });

  it('a plan with no holes returns an empty list; a levelled leg plans the same rows', () => {
    expect(ok(levelPlan(leg(), IN)).holes).toEqual([]);
    const b = leg({ holes: [base({})] });
    const p = ok(levelPlan(b, IN));
    const done: Board = { ...apply(b, p), holes: p.holes };
    expect(ok(levelPlan(done, IN)).holes[0]).toBe(done.holes[0]);
  });
});

// Round tenons spec §6.1, §6.4 (Task 9): `topAt` moves the top's reference height; without it nothing changes.
describe('levelPlan with topAt (round tenons §6.1)', () => {
  /** The exact growth of the top so its lowest corner reaches `y`, before any rounding (independent of levelPlan). */
  const exactTopGrowth = (b: Board, y: number): number => {
    const u = axisUp(b);
    const lowest = Math.min(...[[0, 0], [b.width, 0], [0, b.thickness], [b.width, b.thickness]]
      .map(([w, t]) => toWorld(b, { length: b.length, width: w!, thickness: t! })[1]));
    return (y - lowest) / u[1];
  };

  it('a levelled leg re-levelled to a higher top: every vertex of the top cut at topAt, the growth rounded UP to 1/16', () => {
    const b = levelled(leg());
    const exact = exactTopGrowth(b, 17.5);
    // The fixture must make round-up and round-down differ, or a rounding mutation would pass.
    expect(Math.abs(exact * 16 - Math.round(exact * 16))).toBeGreaterThan(1e-6);
    const p = ok(levelPlan(b, IN, { topAt: 17.5 }));
    const growth = p.length - b.length;
    expect(Number.isInteger(Math.round(growth * 16 * 1e6) / 1e6)).toBe(true);
    expect(growth).toBeGreaterThanOrEqual(exact - 1e-9);
    expect(growth).toBeLessThan(exact + 1 / 16);
    const a: Board = { ...apply(b, p), holes: p.holes };
    const faces = cutFaces(a, cutOn(a, 'top'));
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) {
      for (const v of f.verts) expect(Math.abs(v[1] - 17.5)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(f.normal[1] - 1)).toBeLessThanOrEqual(1e-12);
    }
    // The foot is untouched by topAt: still on the floor, the same line.
    expect(sameLevelLine(cutOn(a, 'foot'), cutOn(b, 'foot'), a[cutOn(b, 'foot').along])).toBe(true);
    // The top cut keeps its id (replaced in place).
    expect(cutOn(a, 'top').id).toBe(cutOn(b, 'top').id);
  });

  it('a lower topAt SHORTENS the leg, the change rounded UP (toward zero), the plane still exact', () => {
    const b = ok(levelPlan(levelled(leg()), IN, { topAt: 17.5 }));
    const tall: Board = { ...levelled(leg()), length: b.length, position: b.position, angleCuts: b.angleCuts };
    const exact = exactTopGrowth(tall, 17);
    expect(exact).toBeLessThan(0);
    const p = ok(levelPlan(tall, IN, { topAt: 17 }));
    const change = p.length - tall.length;
    expect(change).toBeLessThan(0);
    expect(change).toBeGreaterThanOrEqual(exact - 1e-9);
    expect(change).toBeLessThan(exact + 1 / 16);
    const a = apply(tall, p);
    for (const f of cutFaces(a, cutOn(a, 'top'))) for (const v of f.verts) expect(Math.abs(v[1] - 17)).toBeLessThanOrEqual(1e-9);
  });

  it('without topAt (or with no opts) the plan is the same, value for value', () => {
    // A NEW cut is minted a fresh id on every call, so ids are read apart; a replaced cut keeps its own.
    const noIds = (p: LevelPlan | string) => (typeof p === 'string' ? p : { ...p, angleCuts: p.angleCuts.map(({ id: _id, ...c }) => c) });
    for (const b of [leg(), levelled(leg()), leg({ length: 30, position: [0.123, -14, 0.456] })]) {
      expect(noIds(levelPlan(b, IN, {}))).toEqual(noIds(levelPlan(b, IN)));
      expect(noIds(levelPlan(b, IN, { topAt: undefined }))).toEqual(noIds(levelPlan(b, IN)));
    }
    const lv = levelled(leg());
    expect(levelPlan(lv, IN, {})).toEqual(levelPlan(lv, IN));
  });

  it('topAt at or below the floor refuses as the top below the floor does', () => {
    expect(levelPlan(leg(), IN, { topAt: 0 })).toBe(LEVEL_BELOW_FLOOR);
  });
});

// Square-set legs spec §3.3 (Task 4): on a square-set leg the floor's normal leaves the length × face plane, so each end
// is ONE compound miter: `along` the dimension with the larger slope (ties: width), `points` its line through the end's
// centre, `across` the rest. Every check reads the real leaned bodies (`partGeometry` through `toWorld`).
describe('Level the ends on a square-set leg (square-set legs §3.3)', () => {
  const SQ: Lean = { ...LEAN, square: true };
  const sq = (over: Partial<Board> = {}) => leg({ lean: SQ, ...over });
  /** Every world vertex of the leaned bodies: the lowest at the floor, the highest at `top`, and every downward
   *  (upward) face's vertices exactly on its plane. */
  const standsLevel = (b: Board, top: number, what = b.name) => {
    const faces = allFaces(b);
    const ys = faces.flatMap((f) => f.verts.map((v) => v[1]));
    expect(Math.abs(Math.min(...ys)), `${what} lowest`).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(Math.max(...ys) - top), `${what} highest`).toBeLessThanOrEqual(1e-9);
    for (const end of ['foot', 'top'] as const) {
      const fs = cutFaces(b, cutOn(b, end));
      expect(fs.length, `${what} ${end} faces`).toBeGreaterThan(0);
      for (const f of fs) {
        for (const v of f.verts) expect(Math.abs(v[1] - (end === 'foot' ? 0 : top)), `${what} ${end}`).toBeLessThanOrEqual(1e-9);
        expect(Math.abs(Math.abs(f.normal[1]) - 1), `${what} ${end} normal`).toBeLessThanOrEqual(1e-12);
      }
    }
  };
  /** The four section corners of an end on its cut's own plane (depthAtCross), in the world. */
  const cornerYs = (b: Board, end: 'foot' | 'top') => {
    const c = cutOn(b, end);
    const through = throughOf(c);
    const A = b[c.along];
    const T = b[through];
    return [[0, 0], [A, 0], [0, T], [A, T]].map(([s, t]) => {
      const q = depthAtCross(c, b, s!, t!);
      const p = { length: end === 'foot' ? q : b.length - q, [c.along]: c.alongFrom === 'min' ? s! : A - s!,
        [through]: c.across?.from === 'max' ? T - t! : t! } as Record<'length' | 'width' | 'thickness', number>;
      return toWorld(b, p)[1];
    });
  };

  it('the square leg would not level as a turned one: its through dimension tilts (the turned guard stays turned-only)', () => {
    const lm = leanMap(sq())!;
    // Both cross dimensions carry a slope: no single-slope line holds the floor.
    expect(Math.abs(lm.applyDir([1, 0, 0])[1])).toBeGreaterThan(0.01);
    expect(Math.abs(lm.applyDir([0, 0, 1])[1])).toBeGreaterThan(0.01);
    expect(typeof levelPlan(sq(), IN)).toBe('object');
  });

  it('one compound miter per end, along the larger slope, from the centre line; feet on the floor, tops at R', () => {
    const b = levelled(sq());
    standsLevel(b, 16, 'leg');
    expect(b.angleCuts).toHaveLength(2);
    for (const end of ['foot', 'top'] as const) {
      const c = cutOn(b, end);
      expect(c).toMatchObject({ kind: 'miter', face: 'length', from: end === 'foot' ? 'min' : 'max', along: 'width', alongFrom: 'min' });
      expect(c.across!.rise).toBeGreaterThan(0.01);
      // The section corners on the cut's own plane: every one at the floor, or at R.
      for (const y of cornerYs(b, end)) expect(Math.abs(y - (end === 'foot' ? 0 : 16))).toBeLessThanOrEqual(1e-9);
    }
    // The foot and the top slope across the through dimension in opposite senses (the plane is the same one, seen
    // from opposite ends).
    expect(cutOn(b, 'foot').across!.from).not.toBe(cutOn(b, 'top').across!.from);
  });

  it('along is the cross dimension with the larger slope; a tie goes to width', () => {
    // Rake 12° (Z: thickness at turn 0), splay 8° (X: width): thickness slopes more.
    const t = levelled(sq({ lean: { x: T8, z: T12, face: 'thickness', square: true } }));
    expect(t.angleCuts.map((c) => c.along)).toEqual(['thickness', 'thickness']);
    standsLevel(t, 16, 'thickness');
    // A tie (rake = splay) goes to width, and it still stands level.
    const w = levelled(sq({ lean: { x: T8, z: T8, face: 'width', square: true } }));
    expect(w.angleCuts.map((c) => c.along)).toEqual(['width', 'width']);
    standsLevel(w, 16, 'tie');
    // Every quarter turn (the through direction read through axisFrame, a reversed axis included).
    for (const rotation of [90, 180, 270] as const) {
      const r = levelled(sq({ rotation }));
      standsLevel(r, 16, `turn ${rotation}`);
      expect(isLevelled(r, IN)).toBe(true);
    }
  });

  it('a rake-only square-set lean writes a plain miter: no across is stored for a zero slope', () => {
    const b = levelled(sq({ lean: { x: 0, z: T8, face: 'thickness', square: true } }));
    expect(b.angleCuts).toHaveLength(2);
    for (const c of b.angleCuts) {
      expect('across' in c).toBe(false);
      expect(c.along).toBe('thickness');
    }
    standsLevel(b, 16, 'rake-only');
  });

  it('lengths round UP to the grid (imperial 1/16, metric 1 mm)', () => {
    const p = ok(levelPlan(sq(), IN));
    expect(Number.isInteger(p.length * 16)).toBe(true);
    expect(p.length).toBeGreaterThan(16);
    const m = ok(levelPlan(sq({ length: 400 / 25.4 }), MM));
    expect(Math.abs(m.length * 25.4 - Math.round(m.length * 25.4))).toBeLessThanOrEqual(1e-9);
    // A long leg's foot is shortened (toward zero), still on the floor.
    const s = levelled(sq({ length: 30, position: [0.123, -14, 0.456] }));
    expect(s.length).toBeLessThan(30);
    expect(Number.isInteger(s.length * 16)).toBe(true);
    standsLevel(s, 16, 'long');
  });

  it('re-level is a no-op (isLevelled), and a rake edit makes it stale until re-levelled', () => {
    expect(isLevelled(sq(), IN)).toBe(false);
    const once = levelled(sq());
    expect(isLevelled(once, IN)).toBe(true);
    const twice = ok(levelPlan(once, IN));
    expect(twice.angleCuts.map((c) => c.id)).toEqual(once.angleCuts.map((c) => c.id));
    twice.angleCuts.forEach((c, i) => expect(sameLevelLine(c, once.angleCuts[i]!, once[c.along])).toBe(true));
    const edited: Board = { ...once, lean: { ...SQ, z: slopeOf(9) } };
    expect(isLevelled(edited, IN)).toBe(false);
    // The top through R: where the old (compound) top cut meets the axis, its centre-line depth (spec §3.1's anchor).
    const top = cutOn(edited, 'top');
    const seat = leanMap(edited)!.pivot[1] - depthAt(top, edited[top.along] / 2) * axisUp(edited)[1];
    expect(Math.abs(seat - 16)).toBeGreaterThan(1e-4);
    const again = levelled(edited);
    expect(again.angleCuts.map((c) => c.id)).toEqual(once.angleCuts.map((c) => c.id));
    expect(isLevelled(again, IN)).toBe(true);
    standsLevel(again, seat, 'again');
  });

  it('sameLevelLine compares across: rise within 1e-9, the same from, or both absent', () => {
    const c = cutOn(levelled(sq()), 'foot');
    const W = 1.5;
    expect(sameLevelLine(c, { ...c, across: { ...c.across!, rise: c.across!.rise + 5e-10 } }, W)).toBe(true);
    expect(sameLevelLine(c, { ...c, across: { ...c.across!, rise: c.across!.rise + 1e-8 } }, W)).toBe(false);
    expect(sameLevelLine(c, { ...c, across: { ...c.across!, from: c.across!.from === 'min' ? 'max' : 'min' } }, W)).toBe(false);
    const { across: _a, ...plain } = c;
    expect(sameLevelLine(c, plain, W)).toBe(false);
    expect(sameLevelLine(plain, c, W)).toBe(false);
    expect(sameLevelLine(plain, { ...plain }, W)).toBe(true);
  });

  it('the square stool (Review Focus 2): every foot corner at y = 0 and top corner at 16, Front left Front right\'s mirror', () => {
    const legs = squareStoolLegs();
    expect(legs.map((b) => b.name)).toEqual(['Front right', 'Front left', 'Back left', 'Back right']);
    for (const b of legs) {
      expect(b.lean!.square).toBe(true);
      standsLevel(b, 16);
      for (const y of cornerYs(b, 'foot')) expect(Math.abs(y), `${b.name} foot corner`).toBeLessThanOrEqual(1e-9);
      for (const y of cornerYs(b, 'top')) expect(Math.abs(y - 16), `${b.name} top corner`).toBeLessThanOrEqual(1e-9);
      expect(b.angleCuts.every((c) => c.across !== undefined)).toBe(true);
      expect(isLevelled(b, IN), b.name).toBe(true);
    }
    // The mirror's feet are Front right's flag-flipped (along the mirror's dimension), the same lines read from one side.
    const [fr, fl] = legs;
    expect(fl!.length).toBe(fr!.length);
    for (const end of ['foot', 'top'] as const) {
      const a = cutOn(fr!, end);
      expect(sameLevelLine(mirrorAngleCut(a, 'width'), cutOn(fl!, end), fl![a.along])).toBe(true);
    }
    // Mirrored AFTER levelling, never re-levelled (the flags flip, inv 44): still level and `isLevelled`. Front right's
    // mirror is along its `along` (alongFrom flips); a thickness-along leg's width mirror is along its THROUGH
    // dimension, so `across.from` flips (Task 2's flip on Task 4's cut).
    const thick = levelled(sq({ lean: { x: T8, z: T12, face: 'thickness', square: true } }));
    expect(thick.angleCuts.map((c) => c.along)).toEqual(['thickness', 'thickness']);
    for (const [label, b] of [['Front right', fr!], ['thickness-along', thick]] as const) {
      const m = mirrorPart(b);
      if (label === 'thickness-along') expect(m.angleCuts.map((c) => c.across!.from)).toEqual(b.angleCuts.map((c) => (c.across!.from === 'min' ? 'max' : 'min')));
      standsLevel(m, 16, `${label} mirrored`);
      for (const y of cornerYs(m, 'foot')) expect(Math.abs(y), `${label} mirrored foot corner`).toBeLessThanOrEqual(1e-9);
      expect(isLevelled(m, IN), `${label} mirrored`).toBe(true);
    }
    // A Front right rake edit makes it stale; re-levelled, it is level again and back on the floor.
    const raked: Board = { ...fr!, lean: { ...fr!.lean!, z: slopeOf(10) } };
    expect(isLevelled(raked, IN)).toBe(false);
    const again = levelled(raked);
    expect(isLevelled(again, IN)).toBe(true);
    for (const y of cornerYs(again, 'foot')) expect(Math.abs(y), 'raked foot corner').toBeLessThanOrEqual(1e-9);
  });

  it('holes stay in the wood (levelEndHoles) on a square-set leg: every bottom, and a side row\'s mouth, in place', () => {
    const r: HoleRow = { id: 'e', face: 'length', from: 'max', diameter: 0.25, depth: 1.25, along: 'width', alongFrom: 'min', station: 0.7,
      count: 1, pitch: 0, acrossFrom: 'min', inset: 0.55, tiltAlong: slopeOf(9), tiltAcross: -slopeOf(5) };
    const s: HoleRow = { ...r, id: 's', face: 'thickness', along: 'length', station: 5, inset: 0.6, depth: 0.5, tiltAlong: slopeOf(20), tiltAcross: undefined };
    const { tiltAcross: _t, ...side } = s;
    const b = sq({ holes: [r, side as HoleRow] });
    const p = ok(levelPlan(b, IN));
    const nb: Board = { ...apply(b, p), holes: p.holes };
    const far = (x: ReturnType<typeof holeInstances>[number]): Vec3 => [x.centre[0] + x.reach * x.bit[0], x.centre[1] + x.reach * x.bit[1], x.centre[2] + x.reach * x.bit[2]];
    b.holes.forEach((row, k) => {
      const h = holeInstances(b, row)[0]!;
      const g = holeInstances(nb, p.holes[k]!)[0]!;
      toWorld(nb, P(far(g))).forEach((v, i) => expect(Math.abs(v - toWorld(b, P(far(h)))[i]!), `${row.id} bottom`).toBeLessThanOrEqual(1e-9));
      if (row.face !== 'length') toWorld(nb, P(g.centre)).forEach((v, i) => expect(Math.abs(v - toWorld(b, P(h.centre))[i]!), `${row.id} mouth`).toBeLessThanOrEqual(1e-9));
    });
    expect(p.length).not.toBe(b.length);
  });
});
