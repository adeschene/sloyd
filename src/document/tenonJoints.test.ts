import { describe, expect, it } from 'vitest';
import type { Board, HoleRow, RoundTenon, Shape, SloydDocument, StoredBoard } from './types';
import type { V3 } from './angleCuts';
import { createBoard, createDocument, flatDocument, migrateDocument } from './document';
import { worldParts } from './tree';
import { checkDesign, TOUCH, type DesignLimits } from './designCheck';
import { boardExtents } from './geometry';
import { leanMap, leans } from './lean';
import { fromWorld, toWorld } from './snapPoints';
import { holeInstances } from './holes';
import { builtTenons, shoulderAt, tenonFaults } from './roundTenons';
import { boreAlongAxis, isSocketOf, partAxis, socketPlan } from './legSockets';
import { worldBodyFaces } from './leanContacts';
import { stoolLegs, stoolSeat } from './stoolFixture';
import { linkByRole } from './roleLinks';
import { sameLevelLine } from './levelEnds';
import { levelFaces } from './leanContacts';
import { seatedIn, tenonJoints, withoutTenon } from './tenonJoints';

/**
 * Round tenons spec §5 (Task 7): a tenon seated in a matching bore is a JOINT in the design checks. Every fixture asserts
 * it is what it claims (the legs lean, the sockets exist, the joints are found, the tips are where the seat is) before a
 * check result is read, so a fixture that is wrong cannot pass for the wrong reason.
 */

const NO_LIMITS: DesignLimits = { width: null, depth: null, height: null, maxParts: 100 };
const UNDER = 16; // the stool seat's underside (stoolSeat's y)
const HINT = ' — its round tenon doesn\'t match the socket there';

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
/** The world point on a part's axis at local length `l`. */
const onAxis = (b: Board, l: number) => toWorld(b, { length: l, width: b.width / 2, thickness: b.thickness / 2 });
const corners = (b: Board, l: number) => [[0, 0], [b.width, 0], [0, b.thickness], [b.width, b.thickness]]
  .map(([w, t]) => toWorld(b, { length: l, width: w!, thickness: t! }));
/** The highest world y of the section's four corners at local length `l` (a shoulder's uphill corner). */
const highest = (b: Board, l: number) => Math.max(...corners(b, l).map((p) => p[1]));
const tipCentre = (b: Board, t: RoundTenon) => (t.end === 'max' ? shoulderAt(b, t) + t.length : shoulderAt(b, t) - t.length);

/** `leg` lengthened along its own axis so its levelled top rises by `dy` (levelPlan's arithmetic): the pivot moves by
 *  `e·u`, the top miter's stored depths ride with the end (so its level plane slides up the axis), the foot stays put. */
function grown(leg: Board, dy: number): Board {
  const m = leanMap(leg)!;
  const u = m.applyDir([0, 1, 0]);
  const e = dy / u[1];
  const length = leg.length + e;
  const pivot = [m.pivot[0] + e * u[0], m.pivot[1] + e * u[1], m.pivot[2] + e * u[2]];
  const [e0, , e2] = boardExtents({ ...leg, length });
  return { ...leg, length, position: [pivot[0]! - e0 / 2, pivot[1]! - length, pivot[2]! - e2 / 2] };
}

/** A top tenon of diameter `d` whose shoulder's HIGHEST corner sits `gap` below the seat's underside (negative: above it,
 *  pushed into the seat). The shoulder is square to a leaning axis, so placing it by its centre would bury a corner. */
function topTenon(leg: Board, gap: number, d: number): Board {
  const uy = partAxis(leg).u[1];
  const L = leg.length;
  const s = L - (highest(leg, L) - (UNDER - gap)) / uy;
  const tip = shoulderAt(leg, { end: 'max', length: 0 });
  return { ...leg, tenons: [{ id: 'tn', end: 'max', diameter: d, length: tip - s }] };
}

interface StoolOpts { seat?: number; rise?: number; gap?: number; d?: number }
/**
 * The stool (stoolFixture's four levelled leaning legs under a seat at y = 16), its through sockets bored by `socketPlan`,
 * then each leg grown so its levelled top is `rise` above the underside (flush with a 1.5" seat's top) and given a top
 * tenon by hand (Task 9's fit does not exist yet). Unlinked: every part is a plain stored part.
 */
function tenonedStool({ seat = 1.5, rise = 1.5, gap = 0, d = 1 }: StoolOpts = {}): SloydDocument {
  const doc0 = migrateDocument({ ...createDocument('Stool'), boards: [...stoolLegs(), { ...stoolSeat(), thickness: seat }] });
  const s0 = doc0.boards.find((b) => b.name === 'Seat')!;
  const plan = socketPlan(doc0, s0.id, d);
  if (typeof plan === 'string') throw new Error(plan);
  return migrateDocument({ ...doc0, boards: doc0.boards.map((b) => (b === s0
    ? { ...(b as Board), holes: plan.holes }
    : topTenon(grown(b as Board, rise), gap, d))) });
}

const part = (doc: SloydDocument, name: string) => worldParts(doc).find((b) => b.name === name)!;
const legNames = ['Front right', 'Front left', 'Back left', 'Back right'];
const kinds = (doc: SloydDocument) => checkDesign(flatDocument(doc), NO_LIMITS).map((v) => `${v.kind}:${v.parts.join(',')}`);

/** The fixture is what it claims: four leaning legs, each with one fault-free top tenon whose tip centre is at `top` and
 *  whose shoulder's highest corner is `gap` below the underside; a seat with four sockets; four joints, leg → seat. */
function expectStool(doc: SloydDocument, { top = 17.5, gap = 0, joints = 4 } = {}): void {
  const w = worldParts(doc);
  const seat = part(doc, 'Seat');
  expect(seat.holes).toHaveLength(4);
  for (const name of legNames) {
    const leg = part(doc, name);
    expect(leans(leg), name).toBe(true);
    const ts = builtTenons(leg);
    expect(ts, name).toHaveLength(1);
    expect(Math.abs(onAxis(leg, tipCentre(leg, ts[0]!))[1] - top), `${name} tip`).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(highest(leg, shoulderAt(leg, ts[0]!)) - (UNDER - gap)), `${name} shoulder`).toBeLessThanOrEqual(1e-9);
  }
  const found = tenonJoints(flatDocument(doc));
  expect(found).toHaveLength(joints);
  for (const j of found) expect(w[j.b]!.name).toBe('Seat');
}

/** FR's socket in the seat: the row the joint names (asserted to exist). */
function socketOf(doc: SloydDocument, leg: string): HoleRow {
  const w = worldParts(doc);
  const j = tenonJoints(flatDocument(doc)).find((x) => w[x.a]!.name === leg)!;
  expect(j, `${leg}'s joint`).toBeDefined();
  return part(doc, 'Seat').holes.find((r) => r.id === j.row)!;
}
const withSeatHoles = (doc: SloydDocument, f: (rows: HoleRow[]) => HoleRow[]): SloydDocument =>
  migrateDocument({ ...doc, boards: doc.boards.map((b) => (b.name === 'Seat' ? { ...(b as Board), holes: f((b as Board).holes) } : b)) });

describe('a seated tenon is a joint (round tenons spec §5)', () => {
  it('a tenoned stool with seated tenons is clean', () => {
    const doc = tenonedStool();
    expectStool(doc);
    // The sockets are Bore leg sockets' own (through, from the top), each on its leg's axis.
    const seat = part(doc, 'Seat');
    for (const name of legNames) expect(seat.holes.some((r) => isSocketOf(seat, r, part(doc, name))), name).toBe(true);
    expect(kinds(doc)).toEqual([]);
  });

  it('the seat is held by its joints alone: shoulders 1/16" below the underside, so nothing rests', () => {
    const doc = tenonedStool({ gap: 1 / 16 });
    expectStool(doc, { gap: 1 / 16 });
    expect(kinds(doc)).toEqual([]);
  });

  it('remove one socket → that leg overlaps the seat, with no hint (there is no bore)', () => {
    const base = tenonedStool();
    const fr = socketOf(base, 'Front right');
    const doc = withSeatHoles(base, (rows) => rows.filter((r) => r.id !== fr.id));
    expect(tenonJoints(flatDocument(doc))).toHaveLength(3);
    const v = checkDesign(flatDocument(doc), NO_LIMITS);
    expect(v.map((x) => `${x.kind}:${x.parts.join(',')}`)).toEqual(['overlap:Seat,Front right']);
    // Three 1" sockets of the same diameter remain in the seat, elsewhere: the hint is local to the tenon.
    expect(v[0]!.message).toMatch(/^Seat passes [\d.]+in into Front right along [XYZ]\.$/);
  });

  it('a socket 1/64" larger → not seated: an overlap, with the hint (Review Focus 3)', () => {
    const base = tenonedStool();
    const fr = socketOf(base, 'Front right');
    const doc = withSeatHoles(base, (rows) => rows.map((r) => (r.id === fr.id ? { ...r, diameter: r.diameter + 1 / 64 } : r)));
    // Still on the axis: only the diameter differs.
    const seat = part(doc, 'Seat');
    const leg = part(doc, 'Front right');
    const row = seat.holes.find((r) => r.id === fr.id)!;
    expect(boreAlongAxis(seat, row, partAxis(leg))).toBe(true);
    expect(seatedIn(leg, builtTenons(leg)[0]!, seat, row)).toBe(false);
    const v = checkDesign(flatDocument(doc), NO_LIMITS);
    expect(v.map((x) => `${x.kind}:${x.parts.join(',')}`)).toEqual(['overlap:Front right,Seat']);
    expect(v[0]!.message).toMatch(/^Front right passes [\d.]+in into Seat along [XYZ] — its round tenon doesn't match the socket there\.$/);
  });

  it('a blind socket: a mitered tip whose centre stops short but whose edge passes the bottom is not seated (Review Focus 2)', () => {
    // A 2.5" seat, the tips 1.5" above its underside (inside it); FR's through socket replaced by a BLIND one from the
    // underside, along the axis, its bit pointing up the leg.
    const base = tenonedStool({ seat: 2.5, rise: 1.5 });
    expectStool(base);
    const fr = socketOf(base, 'Front right');
    const seat0 = part(base, 'Seat');
    const leg = part(base, 'Front right');
    const t = builtTenons(leg)[0]!;
    const ax = partAxis(leg);
    const h = holeInstances(seat0, fr)[0]!;
    const exit = toWorld(seat0, { length: h.centre[0] + h.reach * h.bit[0], width: h.centre[1] + h.reach * h.bit[1], thickness: h.centre[2] + h.reach * h.bit[2] });
    const local = fromWorld(seat0, exit);
    const across = (['length', 'width', 'thickness'] as const).find((x) => x !== fr.face && x !== fr.along)!;
    const tip = onAxis(leg, tipCentre(leg, t));
    const toCentre = dot(sub(tip, exit), ax.u); // mouth → tip centre, along the axis
    // The tip is level and the axis leans φ off vertical, so the tip's far edge is r·tan φ past its centre.
    const far = (t.diameter / 2) * Math.hypot(ax.u[0], ax.u[2]) / ax.u[1];
    expect(far * 0.75).toBeGreaterThan(TOUCH);
    const blind = (depth: number): HoleRow => ({
      ...fr, from: 'min', depth,
      station: fr.alongFrom === 'min' ? local[fr.along] : seat0[fr.along] - local[fr.along],
      inset: fr.acrossFrom === 'min' ? local[across] : seat0[across] - local[across],
      tiltAlong: 0 - fr.tiltAlong!, tiltAcross: 0 - fr.tiltAcross!,
    });
    const at = (depth: number) => withSeatHoles(base, (rows) => rows.map((r) => (r.id === fr.id ? blind(depth) : r)));
    // The bore is what it claims: on the axis, opening at the underside, its bottom `depth` up the axis.
    for (const depth of [toCentre + far / 4, toCentre + far]) {
      const doc = at(depth);
      const seat = part(doc, 'Seat');
      const row = seat.holes.find((r) => r.id === fr.id)!;
      expect(boreAlongAxis(seat, row, ax)).toBe(true);
      const b = holeInstances(seat, row)[0]!;
      const mouth = toWorld(seat, { length: b.centre[0], width: b.centre[1], thickness: b.centre[2] });
      expect(Math.abs(mouth[1] - UNDER)).toBeLessThanOrEqual(1e-9);
      const bottom = toWorld(seat, { length: b.centre[0] + b.reach * b.bit[0], width: b.centre[1] + b.reach * b.bit[1], thickness: b.centre[2] + b.reach * b.bit[2] });
      expect(Math.abs(dot(sub(bottom, mouth), ax.u) - depth)).toBeLessThanOrEqual(1e-9);
    }
    // Short: the centre stops far/4 short of the bottom, the far edge passes it by 3/4 far (> TOUCH).
    const short = at(toCentre + far / 4);
    expect(tenonJoints(flatDocument(short))).toHaveLength(3);
    const v = checkDesign(flatDocument(short), NO_LIMITS);
    expect(v.map((x) => `${x.kind}:${x.parts.join(',')}`)).toEqual(['overlap:Front right,Seat']);
    expect(v[0]!.message.endsWith(`${HINT}.`)).toBe(true);
    // Deep enough for the far edge: seated, clean.
    const deep = at(toCentre + far);
    expect(tenonJoints(flatDocument(deep))).toHaveLength(4);
    expect(kinds(deep)).toEqual([]);
  });

  it('a blind bore that opens away from the tenon is not its socket', () => {
    // The same line and diameter, entering from the seat's TOP and stopping above the tip: the tenon would have to enter
    // through its closed bottom.
    const base = tenonedStool({ seat: 2.5, rise: 1.5 });
    const fr = socketOf(base, 'Front right');
    const doc = withSeatHoles(base, (rows) => rows.map((r) => (r.id === fr.id ? { ...r, depth: 0.75 } : r)));
    const seat = part(doc, 'Seat');
    const leg = part(doc, 'Front right');
    const row = seat.holes.find((r) => r.id === fr.id)!;
    expect(boreAlongAxis(seat, row, partAxis(leg))).toBe(true);
    expect(seatedIn(leg, builtTenons(leg)[0]!, seat, row)).toBe(false);
    // The tip stops below the bore's bottom, so the tenon is not where the bore is: an overlap with no hint.
    const v = checkDesign(flatDocument(doc), NO_LIMITS);
    expect(v.map((x) => `${x.kind}:${x.parts.join(',')}`)).toEqual(['overlap:Seat,Front right']);
    expect(v[0]!.message).toMatch(/^Seat passes [\d.]+in into Front right along [XYZ]\.$/);
  });

  it('a shoulder pushed into the seat by 1/16" overlaps: the shoulder is still measured', () => {
    const doc = tenonedStool({ gap: -1 / 16 });
    expectStool(doc, { gap: -1 / 16 });
    const v = checkDesign(flatDocument(doc), NO_LIMITS);
    expect(v.map((x) => `${x.kind}:${x.parts.join(',')}`)).toEqual(legNames.map((n) => `overlap:Seat,${n}`));
    // Seated tenons: no mismatch hint.
    for (const x of v) expect(x.message).toMatch(/^Seat passes [\d.]+in into .+ along [XYZ]\.$/);
  });

  it('a leaning leg held off the floor by its seated tenon alone is held and grounded: (d) sits above the leaning rule', () => {
    // FR shortened 1" from the foot: the pivot (and so the lean, the axis, the socket and the tenon) stays put, the foot rises.
    const base = tenonedStool();
    const doc = migrateDocument({ ...base, boards: base.boards.map((b) => (b.name === 'Front right'
      ? { ...(b as Board), length: (b as Board).length - 1, position: [b.position[0], b.position[1] + 1, b.position[2]] as [number, number, number] }
      : b)) });
    const fr = part(doc, 'Front right');
    expect(leans(fr)).toBe(true);
    expect(leanMap(fr)!.pivot).toEqual(leanMap(part(base, 'Front right'))!.pivot);
    const feet = levelFaces(fr).filter((f) => !f.up);
    expect(feet.length).toBeGreaterThan(0);
    for (const f of feet) expect(f.y).toBeGreaterThan(TOUCH);
    expect(tenonJoints(flatDocument(doc))).toHaveLength(4);
    // Three legs stand: the stool tips toward the missing one (a separate fault); FR is neither hanging nor unsupported.
    expect(kinds(doc)).toEqual(['tips:']);
  });

  it('a faulted tenon builds nothing and is never seated', () => {
    const base = tenonedStool();
    const leg0 = part(base, 'Front right');
    // A hole in the tenon's zone: a `meets-feature` fault.
    const holed: Board = { ...leg0, holes: [{ id: 'h', face: 'width', from: 'min', diameter: 0.25, depth: 0.25, along: 'length',
      alongFrom: 'max', station: 0.75, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.75 }] };
    expect(tenonFaults(holed, holed.tenons![0]!).map((f) => f.kind)).toContain('meets-feature');
    const doc = migrateDocument({ ...base, boards: base.boards.map((b) => (b.id === leg0.id ? holed : b)) });
    const seat = part(doc, 'Seat');
    const leg = part(doc, 'Front right');
    expect(builtTenons(leg)).toHaveLength(0);
    expect(seat.holes.some((r) => seatedIn(leg, leg.tenons![0]!, seat, r))).toBe(false);
    expect(tenonJoints(flatDocument(doc))).toHaveLength(3);
  });
});

describe('mirrors (Review Focus 1)', () => {
  it('linked legs (stoolDocument\'s roles: each leg with its 180° twin) carry their tenons and are seated', () => {
    const plain = tenonedStool();
    const doc = linkByRole(plain, new Map(plain.boards.filter((b) => b.name !== 'Seat').map((b) => [b.id, 'leg'])));
    expect(doc.shapes).toHaveLength(2);
    expect(doc.shapes.every((sh) => sh.tenons?.length === 1)).toBe(true);
    for (const b of doc.boards) if (b.name !== 'Seat') expect('shape' in b && b.shape, b.name).toBeTruthy();
    expectStool(doc);
    for (const name of legNames) expect(part(doc, name).tenons!.map((t) => t.end)).toEqual(['max']);
    expect(kinds(doc)).toEqual([]);
  });

  it('a leaning leg as a MIRRORED Shape user resolves to its plain twin (lean flipped, tenon kept) and is seated', () => {
    // FL is FR mirrored (stoolLegs): stored as a mirrored user of FR's Shape, it must resolve to the plain FL exactly.
    const plain = tenonedStool();
    const fr = plain.boards.find((b) => b.name === 'Front right') as Board;
    const fl = plain.boards.find((b) => b.name === 'Front left') as Board;
    const { id: _i, name: _n, position: _p, rotation: _r, ...shared } = fr;
    const doc = migrateDocument({ ...plain,
      shapes: [{ id: 'leg', ...shared } as Shape],
      boards: plain.boards.map((b) => (b === fr ? { id: fr.id, name: fr.name, position: fr.position, rotation: fr.rotation, shape: 'leg' }
        : b === fl ? { id: fl.id, name: fl.name, position: fl.position, rotation: fl.rotation, shape: 'leg', mirrored: true } : b)) as Board[] });
    expect(doc.boards.find((b) => b.id === fl.id)).toMatchObject({ shape: 'leg', mirrored: true });
    const w = part(doc, 'Front left');
    expect(w.lean).toEqual(fl.lean);
    expect(w.tenons).toEqual(fl.tenons);
    expect(w.length).toBe(fl.length);
    // The same level lines, stored from the other side (a mirror flips `alongFrom`, never the line).
    expect(w.angleCuts).toHaveLength(fl.angleCuts.length);
    w.angleCuts.forEach((c, k) => expect(sameLevelLine(c, fl.angleCuts[k]!, w[c.along])).toBe(true));
    expectStool(doc);
    expect(kinds(doc)).toEqual([]);
  });

  it('the same stool inside a mirrored instance is clean; every world tenon is still at the top', () => {
    const parts = tenonedStool().boards.map((b) => b as StoredBoard);
    const doc = migrateDocument({ ...createDocument('Mirror'),
      definitions: [{ id: 'd', boards: parts, instances: [], hardware: [] }],
      instances: [
        { id: 'i1', name: 'Left', definition: 'd', position: [0, 0, 0], rotation: 0 },
        { id: 'i2', name: 'Right', definition: 'd', position: [30, 0, 0], rotation: 270, mirrored: true },
      ] });
    const w = worldParts(doc);
    // An upright leg's mirror runs across its width (`mirrorDim`), so `mirrorTenons` keeps every end: the tip at the top.
    for (const leg of w.filter((b) => b.name !== 'Seat')) {
      expect(leans(leg)).toBe(true);
      expect(leg.tenons!.map((t) => t.end), leg.id).toEqual(['max']);
      expect(Math.abs(onAxis(leg, tipCentre(leg, builtTenons(leg)[0]!))[1] - 17.5), leg.id).toBeLessThanOrEqual(1e-9);
    }
    const flat = flatDocument(doc);
    const joints = tenonJoints(flat);
    expect(joints).toHaveLength(8);
    for (const j of joints) expect(w[j.a]!.id.split('/')[0]).toBe(w[j.b]!.id.split('/')[0]);
    expect(checkDesign(flat, NO_LIMITS)).toEqual([]);
  });
});

// ---- Unleaned parts: posts and rungs ------------------------------------------------------------------------------

const RUNG_D = 0.5;
const SOCKET_DEPTH = 0.75;
const GAP = 1 / 16;
/** An upright 1.5 x 1.5 x 30 post at x0 (X = width, Y = length, Z = thickness at turn 0). */
const post = (name: string, x0: number, holes: HoleRow[] = []): Board =>
  ({ ...createBoard({ name, posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [x0, 0, 0] }), holes });
/** A single bore into a post's X face (`from` 'min' the −X face) at height y and depth z centre 0.75. */
const postSocket = (id: string, from: 'min' | 'max', y: number, depth: number | 'through' = SOCKET_DEPTH): HoleRow =>
  ({ id, face: 'width', from, diameter: RUNG_D, depth, along: 'length', alongFrom: 'min', station: y, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.75 });
/** A flat rung (X = length, Y = thickness 0.75, Z = width 1.5) from x0 to x1 at height y, with tenons whose shoulders
 *  stand GAP off the post faces they enter (so no contact holds it: only a joint can). */
function rung(name: string, x0: number, x1: number, y: number, tenons: RoundTenon[]): Board {
  return { ...createBoard({ name, posture: 'flat', length: x1 - x0, width: 1.5, thickness: 0.75, position: [x0, y, 0] }), tenons };
}
const tenonOf = (id: string, end: 'min' | 'max', length = 0.5 + GAP): RoundTenon => ({ id, end, diameter: RUNG_D, length });
const flatOf = (...boards: Board[]) => flatDocument(migrateDocument({ ...createDocument('Posts'), boards }));

describe('an unleaned rung', () => {
  // Posts A (x −1.5..0) and B (x 10..11.5); the rung's centre at y 8.375, z 0.75; tips 0.5" into 0.75" blind sockets.
  const posts = () => [post('Post A', -1.5, [postSocket('sa', 'max', 8.375)]), post('Post B', 10, [postSocket('sb', 'min', 8.375)])];

  it('tenons at both ends seated in two posts\' blind sockets: held (clause (d), unleaned)', () => {
    const r = rung('Rung', -0.5, 10.5, 8, [tenonOf('t0', 'min'), tenonOf('t1', 'max')]);
    const doc = flatOf(...posts(), r);
    const w = doc.boards[2]!;
    // What it claims: the axis along +X through the section centre; both tenons fault-free; shoulders GAP off the faces.
    const ax = partAxis(w);
    expect(ax.u).toEqual([1, 0, 0]);
    expect(ax.p).toEqual([10.5, 8.375, 0.75]);
    expect(builtTenons(w)).toHaveLength(2);
    expect(onAxis(w, shoulderAt(w, w.tenons![0]!))[0]).toBeCloseTo(GAP, 12);
    expect(onAxis(w, shoulderAt(w, w.tenons![1]!))[0]).toBeCloseTo(10 - GAP, 12);
    expect(tenonJoints(doc)).toEqual([{ a: 2, b: 0, tenon: 't0', row: 'sa' }, { a: 2, b: 1, tenon: 't1', row: 'sb' }]);
    expect(checkDesign(doc, NO_LIMITS)).toEqual([]);
  });

  it('without its sockets the same rung overlaps both posts (the tenons are real wood)', () => {
    const r = rung('Rung', -0.5, 10.5, 8, [tenonOf('t0', 'min'), tenonOf('t1', 'max')]);
    const doc = flatOf(post('Post A', -1.5), post('Post B', 10), r);
    expect(tenonJoints(doc)).toEqual([]);
    // And it is unsupported: its round wood is never a contact, and its shoulders stand GAP off the posts.
    expect(checkDesign(doc, NO_LIMITS).map((v) => `${v.kind}:${v.parts.join(',')}`)).toEqual(['overlap:Rung,Post A', 'overlap:Rung,Post B', 'unsupported:Rung']);
  });

  it('a blind socket entered through its closed bottom is not seated', () => {
    // Post B's socket from its +X face: the same line and diameter, opening away from the rung.
    const r = rung('Rung', -0.5, 10.5, 8, [tenonOf('t0', 'min'), tenonOf('t1', 'max')]);
    const doc = flatOf(post('Post A', -1.5, [postSocket('sa', 'max', 8.375)]), post('Post B', 10, [postSocket('sb', 'max', 8.375)]), r);
    expect(boreAlongAxis(doc.boards[1]!, doc.boards[1]!.holes[0]!, partAxis(doc.boards[2]!))).toBe(true);
    expect(tenonJoints(doc)).toEqual([{ a: 2, b: 0, tenon: 't0', row: 'sa' }]);
    expect(checkDesign(doc, NO_LIMITS).map((v) => `${v.kind}:${v.parts.join(',')}`)).toEqual(['overlap:Rung,Post B']);
  });

  it('a tenon is seated only in a bore it enters: a collinear socket further along is not its partner', () => {
    // Post C (x 20..21.5), FIRST in world order, has a through socket on the rung's line; the rung enters only B's.
    const c = post('Post C', 20, [postSocket('sc', 'min', 8.375, 'through')]);
    const b = post('Post B', 10, [postSocket('sb', 'min', 8.375, 'through')]);
    const r = rung('Rung', 1, 10.5, 8, [tenonOf('t1', 'max')]);
    const doc = flatOf(c, b, r);
    expect(boreAlongAxis(doc.boards[0]!, doc.boards[0]!.holes[0]!, partAxis(doc.boards[2]!))).toBe(true);
    expect(tenonJoints(doc)).toEqual([{ a: 2, b: 1, tenon: 't1', row: 'sb' }]);
    expect(checkDesign(doc, NO_LIMITS)).toEqual([]);
  });

  it('a row of two bores is no socket, even with its first bore on the axis', () => {
    const r = rung('Rung', -0.5, 10.5, 8, [tenonOf('t0', 'min'), tenonOf('t1', 'max')]);
    const doc = flatOf(post('Post A', -1.5, [postSocket('sa', 'max', 8.375)]), post('Post B', 10, [{ ...postSocket('sb', 'min', 8.375), count: 2, pitch: 2 }]), r);
    expect(boreAlongAxis(doc.boards[1]!, doc.boards[1]!.holes[0]!, partAxis(doc.boards[2]!))).toBe(true);
    expect(tenonJoints(doc)).toEqual([{ a: 2, b: 0, tenon: 't0', row: 'sa' }]);
    expect(checkDesign(doc, NO_LIMITS).map((v) => `${v.kind}:${v.parts.join(',')}`)).toEqual(['overlap:Rung,Post B']);
  });

  it('one joint per tenon: the first match in world order wins', () => {
    // A long tenon through post B's through socket and on into post C's blind one (C against B's far face): it is seated
    // in both, and the joint names B, first in world order.
    const b = post('Post B', 10, [postSocket('sb', 'min', 8.375, 'through')]);
    const c = post('Post C', 11.5, [postSocket('sc', 'min', 8.375)]);
    const r = rung('Rung', 1, 12, 8, [tenonOf('t1', 'max', 2 + GAP)]);
    const doc = flatOf(b, c, r);
    expect(seatedIn(doc.boards[2]!, doc.boards[2]!.tenons![0]!, doc.boards[0]!, doc.boards[0]!.holes[0]!)).toBe(true);
    expect(seatedIn(doc.boards[2]!, doc.boards[2]!.tenons![0]!, doc.boards[1]!, doc.boards[1]!.holes[0]!)).toBe(true);
    expect(tenonJoints(doc)).toEqual([{ a: 2, b: 0, tenon: 't1', row: 'sb' }]);
  });

  it('withoutTenon keeps exactly the wood on the shoulder\'s inner side', () => {
    const r = rung('Rung', -0.5, 10.5, 8, [tenonOf('t0', 'min'), tenonOf('t1', 'max')]);
    const faces = worldBodyFaces(r);
    const xs = (fs: typeof faces) => fs.flatMap((body) => body.flatMap((f) => f.verts.map((v) => v[0]!)));
    expect(Math.max(...xs(faces))).toBeCloseTo(10.5, 12);
    const kept = withoutTenon(faces, r, r.tenons![1]!);
    expect(Math.max(...xs(kept))).toBeCloseTo(10 - GAP, 12);
    expect(Math.min(...xs(kept))).toBeCloseTo(-0.5, 12);
    for (const body of kept) expect(body.length).toBeGreaterThanOrEqual(4);
  });
});

describe('a chiral rung through mirrors: the world tenon flips ends (Review Focus 1, the shape-mate ⚠️)', () => {
  // A flat rung's mirror runs along its LENGTH (`mirrorDim`), so `mirrorTenons` swaps a one-ended tenon's end. Post L
  // (x −1.5..0) and post R (x 10..11.5), a socket in each, at different heights.
  const { id: _i, name: _n, position: _p, rotation: _r, ...shared } = rung('Rung', 0, 10.4375, 0, [tenonOf('t', 'max')]);

  it('a Shape with a plain user and a MIRRORED user: each is seated in its own post, and the checks are clean', () => {
    const doc = migrateDocument({ ...createDocument('Chiral'),
      shapes: [{ id: 'sh', ...shared } as Shape],
      boards: [
        post('Post L', -1.5, [postSocket('sl', 'max', 12.375)]),
        post('Post R', 10, [postSocket('sr', 'min', 8.375)]),
        { id: 'r1', name: 'Rung', position: [GAP, 8, 0], rotation: 0, shape: 'sh' },
        { id: 'r2', name: 'Rung 2', position: [-0.5, 12, 0], rotation: 0, shape: 'sh', mirrored: true },
      ] as Board[] });
    expect(doc.shapes.find((s) => s.id === 'sh')!.tenons!.map((t) => t.end)).toEqual(['max']);
    const w = worldParts(doc);
    const r1 = w.find((b) => b.id === 'r1')!;
    const r2 = w.find((b) => b.id === 'r2')!;
    // The plain user's tenon at +X, in post R; the mirrored user's FLIPPED to its min end, at −X, in post L.
    expect(r1.tenons!.map((t) => t.end)).toEqual(['max']);
    expect(r2.tenons!.map((t) => t.end)).toEqual(['min']);
    expect(onAxis(r1, tipCentre(r1, r1.tenons![0]!))).toEqual([10.5, 8.375, 0.75]);
    expect(onAxis(r2, tipCentre(r2, r2.tenons![0]!))).toEqual([-0.5, 12.375, 0.75]);
    const flat = flatDocument(doc);
    expect(tenonJoints(flat)).toEqual([{ a: 2, b: 1, tenon: 't', row: 'sr' }, { a: 3, b: 0, tenon: 't', row: 'sl' }]);
    expect(checkDesign(flat, NO_LIMITS)).toEqual([]);
  });

  it('a post-and-rung definition placed plain and mirrored: the mirrored rung\'s tenon flips with it and is seated', () => {
    const doc = migrateDocument({ ...createDocument('Chiral'),
      definitions: [{ id: 'd', boards: [
        post('Post R', 10, [postSocket('sr', 'min', 8.375)]),
        { ...rung('Rung', GAP, 10.5, 8, [tenonOf('t', 'max')]), id: 'r' },
      ] as StoredBoard[], instances: [], hardware: [] }],
      instances: [
        { id: 'i1', name: 'A', definition: 'd', position: [0, 0, 0], rotation: 0 },
        { id: 'i2', name: 'B', definition: 'd', position: [-5, 0, 0], rotation: 0, mirrored: true },
      ] });
    const w = worldParts(doc);
    const r2 = w.find((b) => b.id === 'i2/r')!;
    const p2 = w.find((b) => b.id.startsWith('i2/') && b.name === 'Post R')!;
    expect(r2.tenons!.map((t) => t.end)).toEqual(['min']);
    // The tip lies inside the mirrored post, at x −15.5 (−5 − 10.5), the post spanning −16.5..−15.
    const tip = onAxis(r2, tipCentre(r2, r2.tenons![0]!));
    expect(tip[0]).toBeCloseTo(-15.5, 12);
    expect(tip[0]).toBeGreaterThan(p2.position[0]);
    expect(tip[0]).toBeLessThan(p2.position[0] + 1.5);
    const flat = flatDocument(doc);
    expect(tenonJoints(flat)).toHaveLength(2);
    expect(checkDesign(flat, NO_LIMITS)).toEqual([]);
  });
});

// ---- Fix round 1 (rulings T7f, T7g, T7h) ---------------------------------------------------------------------------

const checks = (doc: ReturnType<typeof flatOf>) => checkDesign(doc, NO_LIMITS).map((v) => `${v.kind}:${v.parts.join(',')}`);

describe('a tenon\'s wood is never a contact (T7f)', () => {
  it('a leaning stool with top tenons and NO sockets: the seat on the tips is unsupported, as on unleaned posts', () => {
    // Shoulders 1" below the underside, tips flush at y 16 (the stool's levelled tops): nothing but tip discs meets the seat.
    const legs = stoolLegs().map((l) => topTenon(l, 1, 1));
    for (const l of legs) {
      expect(leans(l)).toBe(true);
      expect(builtTenons(l)).toHaveLength(1);
      expect(Math.abs(onAxis(l, tipCentre(l, l.tenons![0]!))[1] - UNDER)).toBeLessThanOrEqual(1e-9);
    }
    const doc = flatOf(...legs, stoolSeat());
    expect(tenonJoints(doc)).toEqual([]);
    expect(checks(doc)).toEqual(['unsupported:Seat']);
    // The unleaned twin: four posts, 1" top tenons, the seat on their tips.
    const p = (n: string, x: number, z: number) => ({ ...createBoard({ name: n, posture: 'upright', length: 16, width: 1.5, thickness: 1.5, position: [x, 0, z] }), tenons: [tenonOf('t', 'max', 1)] });
    const twin = flatOf(p('A', 0, 0), p('B', 10.5, 0), p('C', 0, 10.5), p('D', 10.5, 10.5),
      createBoard({ name: 'Seat', posture: 'flat', length: 12, width: 12, thickness: 1.5, position: [0, 16, 0] }));
    expect(checks(twin)).toEqual(['unsupported:Seat']);
  });

  it('four posts standing on foot-tenon tips are not on the floor: nothing is grounded', () => {
    const p = (n: string, x: number, z: number) => ({ ...createBoard({ name: n, posture: 'upright', length: 16, width: 1.5, thickness: 1.5, position: [x, 0, z] }), tenons: [tenonOf('t', 'min', 1)] });
    const doc = flatOf(p('A', 0, 0), p('B', 10.5, 0), p('C', 0, 10.5), p('D', 10.5, 10.5),
      createBoard({ name: 'Seat', posture: 'flat', length: 12, width: 12, thickness: 1.5, position: [0, 16, 0] }));
    for (const b of doc.boards.slice(0, 4)) expect(builtTenons(b)).toHaveLength(1);
    expect(checks(doc)).toEqual(['unsupported:A', 'unsupported:B', 'unsupported:C', 'unsupported:D', 'unsupported:Seat']);
  });

  it('a leaning leg on a foot-tenon tip is not on the floor either', () => {
    // FR given a foot tenon (its levelled foot miter is the tip): it stands only on the tip disc.
    const base = tenonedStool();
    const doc = migrateDocument({ ...base, boards: base.boards.map((b) => (b.name === 'Front right'
      ? { ...(b as Board), tenons: [{ id: 'tf', end: 'min' as const, diameter: 1, length: 1 }, ...(b as Board).tenons!] } : b)) });
    const fr = part(doc, 'Front right');
    expect(builtTenons(fr)).toHaveLength(2);
    expect(levelFaces(fr).some((f) => !f.up && Math.abs(f.y) <= TOUCH)).toBe(true); // the tip IS a level face on the floor
    // Held by its seated top tenon, so grounded through the seat; not standing, so it is not part of the footprint.
    expect(kinds(doc)).toEqual(['tips:']);
  });
});

describe('a joint holds only toward the floor (T7g)', () => {
  it('a peg seated in a shelf that hangs off a post does not hold the shelf up', () => {
    const P = createBoard({ name: 'Post', posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [0, 0, 0] });
    const bore: HoleRow = { id: 'h', face: 'thickness', from: 'max', diameter: 0.5, depth: 0.5, along: 'length', alongFrom: 'min', station: 3.875, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.75 };
    const S = { ...createBoard({ name: 'Shelf', posture: 'flat', length: 10, width: 1.5, thickness: 0.75, position: [1.5, 10, 0] }), holes: [bore] };
    const T = { ...createBoard({ name: 'Peg', posture: 'upright', length: 2.5 + GAP, width: 0.75, thickness: 0.75, position: [5, 10.25, 0.375] }), tenons: [tenonOf('t', 'min', 0.5 + GAP)] };
    const doc = flatOf(P, S, T);
    expect(tenonJoints(doc)).toEqual([{ a: 2, b: 1, tenon: 't', row: 'h' }]);
    expect(checks(doc).filter((k) => k.startsWith('hangs'))).toEqual(['hangs:Shelf']);
    // Without the peg, the same.
    expect(checks(flatOf(P, { ...S, holes: [] })).filter((k) => k.startsWith('hangs'))).toEqual(['hangs:Shelf']);
  });
});

describe('a part whose tenons are all faulted checks as its tenon-free twin (T7h)', () => {
  it('a notched board with a too-wide tenon: the same results as without it', () => {
    // A's top is notched over x 0..5; B sits on A's BOX there, 0.5" above A's wood.
    const a = { ...createBoard({ name: 'A', posture: 'flat', length: 10, width: 10, thickness: 1, position: [0, 0, 0] }),
      cuts: [{ id: 'c', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 0, width: 5, depth: 0.5, stopMin: 0, stopMax: 0 }] };
    const b = createBoard({ name: 'B', posture: 'flat', length: 4, width: 4, thickness: 1, position: [0.5, 1, 3] });
    const faulted = { ...a, tenons: [tenonOf('t', 'max', 1)] as RoundTenon[] };
    faulted.tenons[0] = { ...faulted.tenons[0]!, diameter: 2 };
    expect(tenonFaults(faulted, faulted.tenons[0]!).map((f) => f.kind)).toContain('too-wide');
    expect(builtTenons(faulted)).toHaveLength(0);
    const twin = checkDesign(flatOf(a, b), NO_LIMITS);
    expect(twin.map((v) => v.kind)).toContain('hangs'); // what it claims: B is grounded by A's box, held by nothing
    expect(checkDesign(flatOf(faulted, b), NO_LIMITS)).toEqual(twin);
  });
});
