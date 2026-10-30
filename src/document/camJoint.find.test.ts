import { describe, expect, it } from 'vitest';
import type { Board, Cut, Definition, SloydDocument } from './types';
import type { Units } from '../units/length';
import { createBoard, createDocument, migrateDocument } from './document';
import { boardExtents } from './geometry';
import { mm } from './holes';
import { miterCut } from './angleCuts';
import { fingerSetAt } from './boxJoints';
import { withDovetails } from './dovetailModel';
import { defaultProfile, profileOf } from './profiles';
import { withTenons } from './roundTenons';
import { displayNames, worldParts } from './tree';
import { linkByRole } from './roleLinks';
import { carcass } from './camJointFixtures';
import { findCamJoint } from './camJoint';
import {
  CAM_JOINT_CONTAINERS, CAM_JOINT_END_FEATURE, CAM_JOINT_LEAN, CAM_JOINT_MIRRORED, CAM_JOINT_NONE, CAM_JOINT_SAME_PART,
} from './camJointText';

const MM: Units = { display: 'metric-mm', precision: 16 };
const part = (doc: SloydDocument, id: string) => worldParts(doc).find((b) => b.id === id)!;
const nameOf = (doc: SloydDocument, id: string) => displayNames(doc).get(id)!;
const box = (b: Board) => {
  const e = boardExtents(b);
  return { min: [...b.position], max: b.position.map((p, i) => p + e[i]!) };
};
/** `doc` with root part `id` patched (no re-migration: the planner reads what is stored). */
const patched = (doc: SloydDocument, id: string, f: (b: Board) => Board): SloydDocument =>
  ({ ...doc, boards: doc.boards.map((b) => (b.id === id ? f(b as Board) : b)) });

describe('carcass fixture', () => {
  it('imperial: sides 3/4 × 12 × 30, 24" apart outside to outside; the shelf 22.5 long between their inner faces at y = 10', () => {
    const { doc, left, right, shelf } = carcass();
    expect(boardExtents(part(doc, left))).toEqual([0.75, 30, 12]);
    expect(boardExtents(part(doc, right))).toEqual([0.75, 30, 12]);
    expect(boardExtents(part(doc, shelf))).toEqual([22.5, 0.75, 12]);
    expect(box(part(doc, left))).toEqual({ min: [0, 0, 0], max: [0.75, 30, 12] });
    expect(box(part(doc, right))).toEqual({ min: [23.25, 0, 0], max: [24, 30, 12] });
    expect(box(part(doc, shelf))).toEqual({ min: [0.75, 10, 0], max: [23.25, 10.75, 12] });
  });

  it('metric: 18 mm sides 300 deep, 600 apart; the shelf 18 × 300 × 564, its ends on the inner faces to 1e-9', () => {
    const { doc, left, right, shelf } = carcass(MM);
    expect(doc.units).toEqual(MM);
    const [l, r, s] = [box(part(doc, left)), box(part(doc, right)), box(part(doc, shelf))];
    expect(boardExtents(part(doc, shelf))[0]).toBeCloseTo(mm(564), 12);
    expect(boardExtents(part(doc, shelf))[1]).toBeCloseTo(mm(18), 12);
    expect(boardExtents(part(doc, shelf))[2]).toBeCloseTo(mm(300), 12);
    expect(boardExtents(part(doc, left))[0]).toBeCloseTo(mm(18), 12);
    expect(boardExtents(part(doc, left))[2]).toBeCloseTo(mm(300), 12);
    expect(r.max[0]! - l.min[0]!).toBeCloseTo(mm(600), 12);
    expect(Math.abs(s.min[0]! - l.max[0]!)).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(s.max[0]! - r.min[0]!)).toBeLessThanOrEqual(1e-9);
  });
});

describe('findCamJoint: finding the joint (spec §3.1)', () => {
  it('finds shelf into left side either order', () => {
    const { doc, left, shelf } = carcass();
    const want = { a: shelf, b: left, end: 'min', k: 0, side: -1 };
    expect(findCamJoint(doc, [shelf, left])).toEqual(want);
    expect(findCamJoint(doc, [left, shelf])).toEqual(want);
  });

  it('shelf into the right side: its max end, +X', () => {
    const { doc, right, shelf } = carcass();
    expect(findCamJoint(doc, [right, shelf])).toEqual({ a: shelf, b: right, end: 'max', k: 0, side: 1 });
  });

  it('a shelf turned 180: the end at the left side is its OWN max end (never the world min)', () => {
    const { doc: d0, left, shelf } = carcass();
    const doc = patched(d0, shelf, (b) => ({ ...b, rotation: 180 }));
    expect(box(part(doc, shelf))).toEqual(box(part(d0, shelf)));
    expect(findCamJoint(doc, [shelf, left])).toEqual({ a: shelf, b: left, end: 'max', k: 0, side: -1 });
  });

  it('metric carcass: found on the 1e-9-close faces', () => {
    const { doc, left, shelf } = carcass(MM);
    expect(findCamJoint(doc, [left, shelf])).toEqual({ a: shelf, b: left, end: 'min', k: 0, side: -1 });
  });

  it('refuses two ends: two flat shelves end to end', () => {
    const p = createBoard({ id: 'p', name: 'P', length: 10, width: 12, thickness: 0.75, position: [0, 0, 0] });
    const q = createBoard({ id: 'q', name: 'Q', length: 10, width: 12, thickness: 0.75, position: [10, 0, 0] });
    const doc = migrateDocument({ ...createDocument('Ends'), boards: [p, q] });
    expect(findCamJoint(doc, ['p', 'q'])).toBe(CAM_JOINT_NONE('P', 'Q'));
  });

  it('refuses a gap: the shelf 1/16" off the left side (over TOUCH)', () => {
    const { doc: d0, left, shelf } = carcass();
    const doc = patched(d0, shelf, (b) => ({ ...b, position: [0.75 + 1 / 16, 10, 0] }));
    expect(findCamJoint(doc, [shelf, left])).toBe(CAM_JOINT_NONE(nameOf(doc, shelf), nameOf(doc, left)));
    // Within TOUCH it is found (the gap test is the one deciding).
    const near = patched(d0, shelf, (b) => ({ ...b, position: [0.75 + 1 / 64, 10, 0] }));
    expect(typeof findCamJoint(near, [shelf, left])).toBe('object');
  });

  it('refuses an overhang: a 13" deep shelf against a 12" side', () => {
    const { doc: d0, left, shelf } = carcass();
    const doc = patched(d0, shelf, (b) => ({ ...b, width: 13 }));
    expect(findCamJoint(doc, [shelf, left])).toBe(CAM_JOINT_NONE(nameOf(doc, shelf), nameOf(doc, left)));
  });
});

describe('findCamJoint: refusals before the layout (spec §3.4 checks 2–6)', () => {
  const lean = { x: 0.1, z: 0, face: 'width' as const };

  it('refuses lean: a leaning side', () => {
    const { doc: d0, left, shelf } = carcass();
    const doc = patched(d0, left, (b) => ({ ...b, lean }));
    expect(findCamJoint(doc, [shelf, left])).toBe(CAM_JOINT_LEAN(nameOf(doc, left)));
  });

  it('refuses containers: the shelf in an assembly, the side at the root', () => {
    const { doc: d0, left, shelf } = carcass();
    const d: Definition = { id: 'd', boards: [d0.boards.find((b) => b.id === shelf)!], instances: [], hardware: [] };
    const doc = migrateDocument({ ...d0, boards: d0.boards.filter((b) => b.id !== shelf), definitions: [d],
      instances: [{ id: 'i', name: 'Shelf unit', definition: 'd', position: [0, 0, 0], rotation: 0 }] });
    expect(box(part(doc, 'i/shelf'))).toEqual(box(part(d0, shelf)));
    expect(findCamJoint(doc, ['i/shelf', left])).toBe(CAM_JOINT_CONTAINERS);
  });

  it('refuses mirrored instance: the whole carcass inside a mirrored copy', () => {
    const { doc: d0 } = carcass();
    const mk = (mirrored: boolean) => migrateDocument({ ...d0, boards: [],
      definitions: [{ id: 'd', boards: d0.boards, instances: [], hardware: [] }],
      instances: [{ id: 'i', name: 'Carcass', definition: 'd', position: [0, 0, 0], rotation: 0, ...(mirrored ? { mirrored: true } : {}) }] });
    expect(findCamJoint(mk(false), ['i/shelf', 'i/left'])).toEqual({ a: 'i/shelf', b: 'i/left', end: 'min', k: 0, side: -1 });
    const doc = mk(true);
    expect(findCamJoint(doc, ['i/shelf', 'i/left'])).toBe(CAM_JOINT_MIRRORED(nameOf(doc, 'i/shelf')));
  });

  it('refuses same storage target: two users of one Shape in a T (one end on the other\'s long edge)', () => {
    // P: flat, turn 0, x 0..10, z 0..4. Q: the same board turned 90 (width on X, length on Z), x 10..14, z -3..7: P's max end
    // lies on Q's x = 10 face, inside it.
    const p = createBoard({ id: 'p', name: 'Rail A', length: 10, width: 4, thickness: 0.75, position: [0, 0, 0] });
    const q = createBoard({ id: 'q', name: 'Rail B', rotation: 90, length: 10, width: 4, thickness: 0.75, position: [10, 0, -3] });
    const plain = migrateDocument({ ...createDocument('T'), boards: [p, q] });
    expect(findCamJoint(plain, ['p', 'q'])).toEqual({ a: 'p', b: 'q', end: 'max', k: 0, side: 1 });
    const doc = linkByRole(plain, new Map([['p', 'rail'], ['q', 'rail']]));
    expect(part(doc, 'p').shape).toBeDefined();
    expect(part(doc, 'p').shape).toBe(part(doc, 'q').shape);
    expect(box(part(doc, 'p'))).toEqual(box(part(plain, 'p')));
    expect(box(part(doc, 'q'))).toEqual(box(part(plain, 'q')));
    expect(findCamJoint(doc, ['p', 'q'])).toBe(CAM_JOINT_SAME_PART(nameOf(doc, 'p'), nameOf(doc, 'q')));
    // Decided before the contact (check 4 before check 5): linked users that do not touch get the same sentence.
    const apart = patched(doc, 'q', (b) => ({ ...b, position: [20, 0, -3] }));
    expect(findCamJoint(apart, ['p', 'q'])).toBe(CAM_JOINT_SAME_PART(nameOf(doc, 'p'), nameOf(doc, 'q')));
  });

  it('refuses an end feature: a round tenon, a dovetail, box joints, an angle cut, a profile at the joined end', () => {
    const { doc: d0, left, right, shelf } = carcass();
    const name = nameOf(d0, shelf);
    const at = (f: (b: Board) => Board) => findCamJoint(patched(d0, shelf, f), [shelf, left]);

    expect(at((b) => withTenons(b, [{ id: 't', end: 'min', diameter: 0.5, length: 0.5 }])))
      .toBe(CAM_JOINT_END_FEATURE(name, 'round tenon'));
    expect(at((b) => withDovetails(b, [{ id: 'dv', dim: 'length', end: 'min', role: 'tails', count: 3, slope: 6, pin: 0.25, depth: 0.75 }])))
      .toBe(CAM_JOINT_END_FEATURE(name, 'dovetails'));

    // Five segments of 12/5 across the width, two notches through the thickness, 0.75 deep, open at the min end.
    const w = 12 / 5;
    const notch = (id: string, offset: number): Cut => ({ id, face: 'length', from: 'min', across: 'thickness', offset, width: w, depth: 0.75, stopMin: 0, stopMax: 0 });
    const fingers = (b: Board): Board => ({ ...b, cuts: [notch('n1', w), notch('n2', 3 * w)] });
    expect(fingerSetAt(fingers(part(d0, shelf)), 'length', 'min')).not.toBeNull();
    expect(at(fingers)).toBe(CAM_JOINT_END_FEATURE(name, 'box joints'));

    const miter = (end: 'min' | 'max') => (b: Board): Board =>
      ({ ...b, angleCuts: [{ id: 'm', ...miterCut({ end, across: 'thickness', longSide: 'min', ratio: 1 }, b) }] });
    expect(at(miter('min'))).toBe(CAM_JOINT_END_FEATURE(name, 'angle cut'));

    // A full-length roundover on the front edge runs out through both end faces.
    const roundover = (b: Board): Board => ({ ...b, profiles: [{ id: 'pr', ...profileOf(defaultProfile(b, 'roundover'))! }] });
    expect(at(roundover)).toBe(CAM_JOINT_END_FEATURE(name, 'roundover profile'));

    // A feature at the OTHER end does not refuse this joint (and does refuse the joint at that end).
    const tenonAtMax = (b: Board) => withTenons(b, [{ id: 't', end: 'max', diameter: 0.5, length: 0.5 }]);
    expect(at(tenonAtMax)).toEqual({ a: shelf, b: left, end: 'min', k: 0, side: -1 });
    expect(findCamJoint(patched(d0, shelf, tenonAtMax), [shelf, right])).toBe(CAM_JOINT_END_FEATURE(name, 'round tenon'));
    expect(at(miter('max'))).toEqual({ a: shelf, b: left, end: 'min', k: 0, side: -1 });
  });

  it('order: a leaning side in a different container gets the lean sentence, not the containers one', () => {
    const { doc: d0, left, shelf } = carcass();
    const leaning = { ...(d0.boards.find((b) => b.id === left)! as Board), lean };
    const d: Definition = { id: 'd', boards: [leaning], instances: [], hardware: [] };
    const doc = migrateDocument({ ...d0, boards: d0.boards.filter((b) => b.id !== left), definitions: [d],
      instances: [{ id: 'i', name: 'Side unit', definition: 'd', position: [0, 0, 0], rotation: 0 }] });
    expect(part(doc, 'i/left').lean).toBeDefined();
    expect(findCamJoint(doc, [shelf, 'i/left'])).toBe(CAM_JOINT_LEAN(nameOf(doc, 'i/left')));
  });
});
