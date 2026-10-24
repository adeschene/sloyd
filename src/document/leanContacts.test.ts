import { describe, expect, it } from 'vitest';
import { createBoard, createDocument } from './document';
import type { Board, Lean } from './types';
import { checkDesign } from './designCheck';
import { levelFaces, overlapArea } from './leanContacts';
import { levelPlan } from './levelEnds';
import { chooseFace, slopeOf } from './lean';
import { partBounds } from './worldBounds';
import type { Units } from '../units/length';

const IN: Units = { display: 'imperial-fractional', precision: 16 };
const NO_LIMITS = { width: null, depth: null, height: null, maxParts: 100 };

/** A splay-only leg (foot toward +X), pivot at (0.75, 16, 0.75). */
const leg = (lean: Lean): Board =>
  createBoard({ id: 'L', name: 'Leg', length: 16, width: 1.5, thickness: 1.5, posture: 'upright', position: [0, 0, 0], lean });
const levelled = (b: Board): Board => {
  const p = levelPlan(b, IN);
  if (typeof p === 'string') throw new Error(p);
  return { ...b, length: p.length, position: p.position, angleCuts: p.angleCuts };
};
/** `b` moved down so its lowest real point sits on the floor. */
const dropped = (b: Board): Board => {
  const lo = partBounds(b).min[1];
  return { ...b, position: [b.position[0], b.position[1] - lo, b.position[2]] };
};

describe('overlapArea (Sutherland–Hodgman)', () => {
  const sq = (x: number, z: number, s: number): [number, number][] => [[x, z], [x + s, z], [x + s, z + s], [x, z + s]];
  it('two unit squares overlapping by a quarter, either winding', () => {
    expect(overlapArea(sq(0, 0, 1), sq(0.5, 0.5, 1))).toBeCloseTo(0.25, 12);
    expect(overlapArea([...sq(0, 0, 1)].reverse(), sq(0.5, 0.5, 1))).toBeCloseTo(0.25, 12);
    expect(overlapArea(sq(0, 0, 1), [...sq(0.5, 0.5, 1)].reverse())).toBeCloseTo(0.25, 12);
  });
  it('one inside the other is the smaller area', () => {
    expect(overlapArea(sq(0, 0, 4), sq(1, 1, 1))).toBeCloseTo(1, 12);
    expect(overlapArea(sq(1, 1, 1), sq(0, 0, 4))).toBeCloseTo(1, 12);
  });
  it('a shared edge or corner, or apart, is 0', () => {
    expect(overlapArea(sq(0, 0, 1), sq(1, 0, 1))).toBe(0);
    expect(overlapArea(sq(0, 0, 1), sq(1, 1, 1))).toBe(0);
    expect(overlapArea(sq(0, 0, 1), sq(3, 3, 1))).toBe(0);
  });
  it('a triangle against a square', () => {
    // The triangle (0,0) (2,0) (0,2) and a unit square: the square at the origin lies wholly under x + z <= 2; the one at
    // (0.5, 0.5) loses the half above the line from (0.5, 1.5) to (1.5, 0.5).
    expect(overlapArea([[0, 0], [2, 0], [0, 2]], sq(0, 0, 1))).toBeCloseTo(1, 12);
    expect(overlapArea([[0, 0], [2, 0], [0, 2]], sq(0.5, 0.5, 1))).toBeCloseTo(0.5, 12);
  });
});

describe('levelFaces (splayed legs §7.2)', () => {
  const SPLAY: Lean = { x: slopeOf(12), z: 0, face: 'width' };
  it('a levelled leg has a level foot on the floor, facing down, and a level top facing up', () => {
    const b = levelled(leg(SPLAY));
    const fs = levelFaces(b);
    const down = fs.filter((f) => !f.up);
    const up = fs.filter((f) => f.up);
    expect(down.length).toBeGreaterThan(0);
    for (const f of down) expect(Math.abs(f.y)).toBeLessThanOrEqual(1e-9);
    expect(up.length).toBeGreaterThan(0);
    for (const f of up) expect(Math.abs(f.y - 16)).toBeLessThanOrEqual(1e-9);
    // The foot's plan is the leg's section stretched by the slope: about 1.5 / cos 12° × 1.5.
    expect(down.reduce((s, f) => s + overlapArea(f.poly, f.poly), 0)).toBeCloseTo((1.5 / Math.cos(12 * Math.PI / 180)) * 1.5, 9);
  });
  it('an unlevelled leaning leg has no level face at all', () => {
    expect(levelFaces(leg(SPLAY))).toEqual([]);
  });
  it('0.5° is not level: a foot levelled for 12° on a 12.5° leg is not in levelFaces, so the leg is unsupported', () => {
    const l12 = levelled(leg(SPLAY));
    const tilted = dropped({ ...l12, lean: { x: slopeOf(12.5), z: 0, face: 'width' } });
    // The foot really is on the floor within TOUCH (1.5 tan 0.5° ≈ 0.013): only its slope keeps it from standing.
    expect(partBounds(tilted).min[1]).toBeCloseTo(0, 12);
    expect(levelFaces(tilted).filter((f) => !f.up)).toEqual([]);
    const v = checkDesign({ ...createDocument('T'), boards: [tilted] }, NO_LIMITS);
    expect(v.map((x) => `${x.kind}:${x.parts.join(',')}`)).toEqual(['unsupported:Leg']);
    // The same leg levelled for its own lean is grounded (alone it would tip: its centre of mass is off its foot).
    expect(checkDesign({ ...createDocument('T'), boards: [l12] }, NO_LIMITS).map((x) => x.kind)).toEqual(['tips']);
  });
});

describe('the tip footprint is the feet themselves (final review I1)', () => {
  /** A three-legged staked stool: 1.5in legs 16in long on a 4in circle at 15°, 135° and 255°, each leaning 14° straight
   *  outward, levelled; a 16 x 1.5 x 16 seat on their tops, pushed 5.25in toward 75° (the outward normal of the hull edge
   *  between the first two feet). A levelled foot is the section turned to its sightline, so its plan bounding box reaches
   *  past that slanted edge where no wood is: on the boxes' hull the centre of mass is about 1.16in inside (passes
   *  TIP_MARGIN), on the feet's own hull 0.96in (tips). */
  const stance = (): Board[] => {
    const legs = [15, 135, 255].map((deg, k) => {
      const a = deg * Math.PI / 180;
      const x = slopeOf(14) * Math.cos(a);
      const z = slopeOf(14) * Math.sin(a);
      return levelled(createBoard({ id: `L${k}`, name: `Leg ${k + 1}`, length: 16, width: 1.5, thickness: 1.5, posture: 'upright',
        position: [4 * Math.cos(a) - 0.75, 0, 4 * Math.sin(a) - 0.75], lean: { x, z, face: chooseFace(createBoard({ posture: 'upright' }), x, z) } }));
    });
    const n = 75 * Math.PI / 180;
    const seat = createBoard({ id: 'S', name: 'Seat', length: 16, width: 16, thickness: 1.5, posture: 'flat',
      position: [-8 + 5.25 * Math.cos(n), 16, -8 + 5.25 * Math.sin(n)] });
    return [...legs, seat];
  };
  it('tips: the centre of mass is under 1in inside the hull of the feet, though over 1in inside their bounding boxes', () => {
    const v = checkDesign({ ...createDocument('T'), boards: stance() }, NO_LIMITS);
    expect(v.map((x) => x.kind)).toEqual(['tips']);
    expect(v[0]!.message).toContain('0.96in inside');
  });
});
