import { describe, expect, it } from 'vitest';
import type { AngleCut, Board, HoleRow, Shape, SloydDocument, StoredBoard } from './types';
import type { Vec3 } from './frames';
import { TOUCH } from './checkTolerances';
import type { V3 } from './angleCuts';
import type { Units } from '../units/length';
import { createBoard, createDocument, migrateDocument } from './document';
import { axisFrame, snapStep } from './geometry';
import { chooseFace, leanMap, resultantDeg, slopeOf, sightlineDeg, worldSlopes } from './lean';
import { LEVEL_CUTS_HOLE, LEVEL_TOP_CUT, levelPlan, sameLevelLine } from './levelEnds';
import { levelFaces } from './leanContacts';
import { holeInstances } from './holes';
import { tiltResultantDeg, tiltSightlineDeg } from './holeTilt';
import { toWorld } from './snapPoints';
import { mapWorld } from './treeEdit';
import { worldParts } from './tree';
import { squareStoolDocument, stoolDocument, stoolLegs, stoolSeat } from './stoolFixture';
import { boreAlongAxis, isSocketOf, legsUnder, legTenonPlan, partAxis, rungSocketRow, socketPlan, socketRow, socketsDisagree, socketTooSteep, staleSocketOf, socketStale, type WorldAxis } from './legSockets';
import { isLevelled } from './levelEnds';
import { builtTenons, shoulderAt, TENON_STEP, tenonAt } from './roundTenons';
import { seatedIn, staleTenonOf, tenonJoints } from './tenonJoints';
import { checkDesign, type DesignLimits } from './designCheck';
import { flatDocument } from './document';
import { displayNames } from './tree';

const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const len = (a: readonly number[]) => Math.hypot(a[0]!, a[1]!, a[2]!);
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const pt = (v: readonly number[]) => ({ length: v[0]!, width: v[1]!, thickness: v[2]! });

/** The leg's axis, computed here independently of legSockets.ts: through the pivot, along the leaned length. */
function axisOf(leg: Board): { p: V3; u: V3 } {
  const m = leanMap(leg)!;
  const e: V3 = [0, 0, 0];
  e[axisFrame(leg).findIndex((a) => a.dim === 'length')] = 1;
  const u = m.applyDir(e);
  const n = len(u);
  return { p: m.pivot, u: [u[0] / n, u[1] / n, u[2] / n] };
}
const offAxis = (q: readonly number[], ax: { p: V3; u: V3 }) => len(cross(sub(q, ax.p), ax.u));

/** A single bore's mouth and far centre in the world. */
function ends(seat: Board, row: HoleRow): [V3, V3] {
  const h = holeInstances(seat, row)[0]!;
  return [toWorld(seat, pt(h.centre)), toWorld(seat, pt(h.centre.map((c, i) => c + h.reach * h.bit[i]!)))];
}

const world = (doc: SloydDocument) => worldParts(doc);
const named = (doc: SloydDocument, name: string) => world(doc).filter((b) => b.name === name);
const seatOf = (doc: SloydDocument) => named(doc, 'Seat')[0]!;
const legsOf = (doc: SloydDocument) => world(doc).filter((b) => b.name !== 'Seat');

/** The plan, applied as the store would: one `mapWorld` write through the seat. */
function bore(doc: SloydDocument, seatId: string, d = 1): SloydDocument {
  const p = socketPlan(doc, seatId, d);
  if (typeof p === 'string') throw new Error(p);
  return mapWorld(doc, (w) => w.map((b) => (b.id === seatId ? { ...b, holes: p.holes } : b)));
}

/** Every leg has exactly one row of its seat whose mouth and far centre lie on its axis (1e-9), and the bore runs along
 *  the axis (a through bore's two centres are both on it). */
function expectSockets(seat: Board, legs: readonly Board[]): void {
  for (const leg of legs) {
    const ax = axisOf(leg);
    const on = seat.holes.filter((r) => { const [m, f] = ends(seat, r); return offAxis(m, ax) <= 1e-9 && offAxis(f, ax) <= 1e-9; });
    expect(on, leg.name).toHaveLength(1);
    const [m, f] = ends(seat, on[0]!);
    expect(Math.abs(m[1] - (seat.position[1] + seat.thickness)), `${leg.name} mouth on the top`).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(f[1] - seat.position[1]), `${leg.name} exit on the bottom`).toBeLessThanOrEqual(1e-9);
    expect(on[0]).toMatchObject({ count: 1, depth: 'through' });
  }
}

const IN = { display: 'imperial-fractional', precision: 16 } as const;
const relevel = (b: Board): Board => {
  const p = levelPlan(b, IN);
  if (typeof p === 'string') throw new Error(p);
  return { ...b, length: p.length, position: p.position, angleCuts: p.angleCuts };
};

describe('legsUnder', () => {
  it('finds the four legs under the seat, in world order', () => {
    const doc = stoolDocument();
    expect(legsUnder(world(doc), seatOf(doc), IN).map((b) => b.name)).toEqual(['Front right', 'Front left', 'Back left', 'Back right']);
  });
  it('finds none under a part beside them, nor under a seat lifted off the tops, nor under a leg', () => {
    const doc = migrateDocument({ ...createDocument('S'), boards: [...stoolLegs(),
      createBoard({ name: 'Shelf', length: 10, width: 10, thickness: 1.5, posture: 'flat', position: [20, 16, -5] }),
      stoolSeat(16.5)] });
    expect(legsUnder(world(doc), named(doc, 'Shelf')[0]!, IN)).toEqual([]);
    expect(legsUnder(world(doc), seatOf(doc), IN)).toEqual([]);
    expect(legsUnder(world(doc), named(doc, 'Front right')[0]!, IN)).toEqual([]);
  });
});

describe('isSocketOf and a head (counterbores §7)', () => {
  it('a counterbore on a socket row makes it no longer the leg\'s socket', () => {
    const doc0 = stoolDocument();
    const doc = bore(doc0, seatOf(doc0).id);
    const seat = seatOf(doc);
    const leg = legsOf(doc)[0]!;
    const row = seat.holes.find((r) => isSocketOf(seat, r, leg))!;
    const headed = { ...row, head: 'counterbore' as const, headDiameter: row.diameter * 1.5, headDepth: 0.25 };
    expect(isSocketOf(seat, headed, leg)).toBe(false);
    expect(isSocketOf(seat, { ...headed, head: undefined, headDiameter: undefined, headDepth: undefined }, leg)).toBe(true);
  });
});

describe('socketRow / socketPlan', () => {
  it("each socket's world axis is its leg's axis; the bore's resultant and sightline are the leg's", () => {
    const doc0 = stoolDocument();
    const doc = bore(doc0, seatOf(doc0).id);
    const seat = seatOf(doc);
    expect(seat.holes).toHaveLength(4);
    expectSockets(seat, legsOf(doc));
    for (const leg of legsOf(doc)) {
      const row = seat.holes.find((r) => isSocketOf(seat, r, leg))!;
      expect(row.diameter).toBe(1);
      expect(Math.abs(tiltResultantDeg(row) - resultantDeg(leg.lean!))).toBeLessThanOrEqual(1e-9);
      const [wx, wz] = worldSlopes(leg);
      // The seat is unturned: its `along` is the length, on world X, so the sightline from it is the leg's from X.
      expect(Math.abs(tiltSightlineDeg(row) - sightlineDeg(wx, wz))).toBeLessThanOrEqual(1e-9);
      expect(tiltResultantDeg(row)).toBeCloseTo(14.2957, 3);
      expect(tiltSightlineDeg(row)).toBeCloseTo(33.4724, 3);
      // Entering from the top, from the nearer end and side.
      expect(row).toMatchObject({ face: 'thickness', from: 'max', along: 'length' });
      expect(row.station).toBeLessThan(7);
      expect(row.inset).toBeLessThan(7);
    }
  });

  it('a turned and mirrored seat bores the same world sockets (Review Focus 1)', () => {
    const doc0 = stoolDocument();
    const { id: _id, ...seat0 } = seatOf(doc0);
    // The seat's box is centred on the origin, so a mirrored, quarter-turned placement lands on the same world box.
    const doc = migrateDocument({ ...doc0,
      boards: doc0.boards.filter((b) => b.name !== 'Seat'),
      definitions: [{ id: 'd', boards: [{ ...seat0, id: 'seat' } as StoredBoard], instances: [], hardware: [] }],
      instances: [{ id: 'i', name: 'Top', definition: 'd', position: [0, 0, 0], rotation: 90, mirrored: true }] });
    const s0 = seatOf(doc);
    expect(s0.rotation).not.toBe(0);
    expect(legsUnder(world(doc), s0, IN)).toHaveLength(4);
    const after = bore(doc, s0.id);
    const seat = seatOf(after);
    expectSockets(seat, legsOf(after));
    // The same world bores as the plain seat's.
    const plain = seatOf(bore(doc0, seatOf(doc0).id));
    for (const leg of legsOf(after)) {
      const a = ends(seat, seat.holes.find((r) => isSocketOf(seat, r, leg))!);
      const b = ends(plain, plain.holes.find((r) => isSocketOf(plain, r, leg))!);
      a.forEach((v, i) => expect(len(sub(v, b[i]!)), leg.name).toBeLessThanOrEqual(1e-9));
    }
    // Stored once, in the definition's own frame (lowered through the mirror and the turn).
    expect((after.definitions[0]!.boards[0] as Board).holes).toHaveLength(4);
  });

  it('copies over different legs refuse with the copy', () => {
    const doc0 = stoolDocument();
    const { id: _id, ...seat0 } = seatOf(doc0);
    const doc = migrateDocument({ ...doc0,
      boards: doc0.boards.filter((b) => b.name !== 'Seat'),
      definitions: [{ id: 'd', boards: [{ ...seat0, id: 'seat', position: [-7, 16, -7] } as StoredBoard], instances: [], hardware: [] }],
      instances: [
        { id: 'i1', name: 'Stool 1', definition: 'd', position: [0, 0, 0], rotation: 0 },
        { id: 'i2', name: 'Stool 2', definition: 'd', position: [40, 0, 0], rotation: 0 },
      ] });
    const id = seatOf(doc).id;
    expect(socketPlan(doc, id, 1)).toBe('Its copies stand over different legs (Stool 1 › Seat, Stool 2 › Seat) — make them match, or make this part unique first.');
  });

  it('two identical placements bore once (at a non-dyadic offset), from either copy', () => {
    const legs = stoolLegs();
    const parts = [...legs, stoolSeat()].map((b) => b as StoredBoard);
    const doc = migrateDocument({ ...createDocument('Two'),
      definitions: [{ id: 'd', boards: parts, instances: [], hardware: [] }],
      instances: [
        { id: 'i1', name: 'Stool 1', definition: 'd', position: [0, 0, 0], rotation: 0 },
        { id: 'i2', name: 'Stool 2', definition: 'd', position: [30.3, 0, 3.3], rotation: 90 },
      ] });
    const seats = named(doc, 'Seat');
    expect(seats).toHaveLength(2);
    for (const s of seats) {
      const after = bore(doc, s.id);
      expect((after.definitions[0]!.boards.find((b) => b.name === 'Seat') as Board).holes).toHaveLength(4);
      const w = world(after);
      for (const seat of w.filter((b) => b.name === 'Seat')) {
        const prefix = seat.id.split('/')[0];
        expectSockets(seat, w.filter((b) => b.name !== 'Seat' && b.id.startsWith(`${prefix}/`)));
      }
      // Bored once: a second plan from the other copy changes nothing.
      const again = socketPlan(after, seats.find((x) => x !== s)!.id, 1);
      expect(typeof again === 'object' && again.holes).toBe(seatOf(after).holes);
    }
  });

  it('a linked seat agrees: two Shape users, one mirrored and turned 180°, over two stools; a quarter turn refuses', () => {
    const legs = stoolLegs();
    const moved = legs.map((b) => ({ ...b, id: `${b.id}-2`, position: [b.position[0] + 30, b.position[1], b.position[2]] as [number, number, number] }));
    const { id: _i, name: _n, position: _p, rotation: _r, ...shared } = stoolSeat();
    const doc = migrateDocument({ ...createDocument('Linked'),
      shapes: [{ id: 'sh', ...shared } as Shape],
      boards: [...legs, ...moved,
        { id: 'sa', name: 'Seat', position: [-7, 16, -7], rotation: 0, shape: 'sh' },
        { id: 'sb', name: 'Seat', position: [23, 16, -7], rotation: 180, shape: 'sh', mirrored: true }] as Board[] });
    const after = bore(doc, 'sb');
    expect(after.shapes.find((s) => s.id === 'sh')!.holes).toHaveLength(4);
    const w = world(after);
    expectSockets(w.find((b) => b.id === 'sa')!, legs.map((l) => w.find((b) => b.id === l.id)!));
    expectSockets(w.find((b) => b.id === 'sb')!, moved.map((l) => w.find((b) => b.id === l.id)!));
    // Rake 8° and splay 12° are not symmetric under a quarter turn: a user turned 90° stands over different legs in the
    // Shape's frame.
    const quarter = { ...doc, boards: doc.boards.map((b) => (b.id === 'sb' ? { ...b, rotation: 90 as const } : b)) };
    expect(socketPlan(quarter, 'sa', 1)).toMatch(/^Its copies stand over different legs \(Seat, Seat \(1\)\)/);
  });

  it('a mirrored copy agrees: a definition placed twice, the second mirrored and turned', () => {
    const parts = [...stoolLegs(), stoolSeat()].map((b) => b as StoredBoard);
    const doc = migrateDocument({ ...createDocument('Mirror'),
      definitions: [{ id: 'd', boards: parts, instances: [], hardware: [] }],
      instances: [
        { id: 'i1', name: 'Left', definition: 'd', position: [0, 0, 0], rotation: 0 },
        { id: 'i2', name: 'Right', definition: 'd', position: [30, 0, 0], rotation: 270, mirrored: true },
      ] });
    const right = named(doc, 'Seat').find((b) => b.id.startsWith('i2/'))!;
    const after = bore(doc, right.id);
    const w = world(after);
    for (const seat of w.filter((b) => b.name === 'Seat')) {
      const prefix = seat.id.split('/')[0];
      expectSockets(seat, w.filter((b) => b.name !== 'Seat' && b.id.startsWith(`${prefix}/`)));
    }
  });

  it('an asymmetric stool (three legs) placed twice, once mirrored, agrees: the copies compare STORED rows', () => {
    // Without Back right the stool is not its own mirror image, so the mirrored copy's world rows are the stored rows
    // reflected: only lowered (mapWorld) rows compare equal.
    const parts = [...stoolLegs().filter((b) => b.name !== 'Back right'), stoolSeat()].map((b) => b as StoredBoard);
    const doc = migrateDocument({ ...createDocument('Three'),
      definitions: [{ id: 'd', boards: parts, instances: [], hardware: [] }],
      instances: [
        { id: 'i1', name: 'Left', definition: 'd', position: [0, 0, 0], rotation: 0 },
        { id: 'i2', name: 'Right', definition: 'd', position: [30, 0, 0], rotation: 90, mirrored: true },
      ] });
    // From either copy (the other one's rows are lowered too).
    expect(typeof socketPlan(doc, named(doc, 'Seat').find((b) => b.id.startsWith('i1/'))!.id, 1)).toBe('object');
    const after = bore(doc, named(doc, 'Seat').find((b) => b.id.startsWith('i2/'))!.id);
    expect((after.definitions[0]!.boards.find((b) => b.name === 'Seat') as Board).holes).toHaveLength(3);
    const w = world(after);
    for (const seat of w.filter((b) => b.name === 'Seat')) {
      const prefix = seat.id.split('/')[0];
      expectSockets(seat, w.filter((b) => b.name !== 'Seat' && b.id.startsWith(`${prefix}/`)));
    }
  });

  it("a bore from a socket's mouth at another angle is not the socket, and is stale; a square one is neither", () => {
    const doc0 = stoolDocument();
    const doc = bore(doc0, seatOf(doc0).id);
    const seat = seatOf(doc);
    const fr = named(doc, 'Front right')[0]!;
    const socket = seat.holes.find((r) => isSocketOf(seat, r, fr))!;
    const swap = (r: HoleRow) => ({ ...seat, holes: seat.holes.map((x) => (x.id === r.id ? r : x)) });
    // Mouth still on the axis, the bit leaning the other way across: not the socket, and stale.
    const other = { ...socket, tiltAcross: 0 - socket.tiltAcross! };
    expect(isSocketOf(swap(other), other, fr)).toBe(false);
    expect(staleSocketOf(swap(other), fr)).toBe(other);
    // A square through bore over the leg's top (a user's clearance hole) is never taken for a socket.
    const { tiltAlong: _a, tiltAcross: _c, ...square } = socket;
    expect(staleSocketOf(swap(square), fr)).toBeNull();
  });

  it("a socket that would break out is not bored, naming each such leg; the others are bored", () => {
    // The seat's right edge at x = 5.2: the right legs' 1" sockets run past the length max end.
    const doc = migrateDocument({ ...createDocument('Edge'), boards: [...stoolLegs(),
      createBoard({ name: 'Seat', length: 12.2, width: 14, thickness: 1.5, posture: 'flat', position: [-7, 16, -7] })] });
    expect(legsUnder(world(doc), seatOf(doc), IN)).toHaveLength(4);
    const p = socketPlan(doc, seatOf(doc).id, 1);
    expect(p).toMatchObject({ note: "Front right's socket would run past the length max end — move the leg, or choose a smaller diameter. Back right's socket would run past the length max end — move the leg, or choose a smaller diameter." });
    const after = bore(doc, seatOf(doc).id);
    const seat = seatOf(after);
    expect(seat.holes).toHaveLength(2);
    expectSockets(seat, legsOf(after).filter((b) => b.name.endsWith('left')));
  });

  it('when every socket would fault, the action refuses naming every leg, in world order', () => {
    const doc = migrateDocument({ ...createDocument('Edge'), boards: [...stoolLegs(),
      createBoard({ name: 'Seat', length: 10.4, width: 14, thickness: 1.5, posture: 'flat', position: [-5.2, 16, -7] })] });
    expect(legsUnder(world(doc), seatOf(doc), IN)).toHaveLength(4);
    expect(socketPlan(doc, seatOf(doc).id, 1)).toBe("Front right's socket would run past the length max end — move the leg, or choose a smaller diameter. Front left's socket would run past the length min end — move the leg, or choose a smaller diameter. Back left's socket would run past the length min end — move the leg, or choose a smaller diameter. Back right's socket would run past the length max end — move the leg, or choose a smaller diameter.");
  });

  it("a diameter at the leg's section refuses, naming the leg", () => {
    const doc = stoolDocument();
    expect(socketPlan(doc, seatOf(doc).id, 1.5)).toBe('The socket must be narrower than Front right.');
    expect(typeof socketPlan(doc, seatOf(doc).id, 1.49)).toBe('object');
  });

  it('boring again replaces a stale socket in place and skips a matching one', () => {
    const doc0 = migrateDocument({ ...createDocument('Stale'), boards: [...stoolLegs(), stoolSeat()] });
    const doc1 = bore(doc0, seatOf(doc0).id);
    const seat1 = seatOf(doc1);
    const fr0 = named(doc1, 'Front right')[0]!;
    const old = seat1.holes.find((r) => isSocketOf(seat1, r, fr0))!;
    // Every socket matches: nothing to do, the seat's own array back.
    const same = socketPlan(doc1, seat1.id, 1);
    expect(typeof same === 'object' && same.holes).toBe(seat1.holes);
    expect(staleSocketOf(seat1, fr0)).toBeNull();
    // A new rake on Front right, re-levelled. A re-level keeps the old top cut's reference, so the top lands a hair above
    // the seat's bottom; within TOUCH, the leg still stands under it (the design checks' resting rule).
    const doc2 = mapWorld(doc1, (w) => w.map((b) => (b.id === fr0.id ? relevel({ ...b, lean: { ...b.lean!, z: slopeOf(10) } }) : b)));
    const fr = named(doc2, 'Front right')[0]!;
    const gap = levelFaces(fr).find((f) => f.up)!.y - 16;
    expect(gap).toBeGreaterThan(1e-4);
    expect(legsUnder(world(doc2), seatOf(doc2), IN).map((b) => b.name)).toContain('Front right');
    const seat2 = seatOf(doc2);
    expect(isSocketOf(seat2, old, fr)).toBe(false);
    expect(staleSocketOf(seat2, fr)).toBe(seat2.holes.find((r) => r.id === old.id));
    for (const leg of legsOf(doc2).filter((b) => b.name !== 'Front right')) expect(staleSocketOf(seat2, leg)).toBeNull();
    const doc3 = bore(doc2, seat2.id);
    const seat3 = seatOf(doc3);
    expect(seat3.holes).toHaveLength(4);
    seat3.holes.forEach((r, i) => {
      if (r.id === old.id) {
        expect(i).toBe(seat2.holes.indexOf(seat2.holes.find((x) => x.id === old.id)!));
        expect(r.tiltAcross).not.toBe(old.tiltAcross);
        expect(isSocketOf(seat3, r, fr)).toBe(true);
      } else {
        expect(r).toBe(seat2.holes[i]);   // the others untouched: the same objects
      }
    });
    expect(staleSocketOf(seat3, fr)).toBeNull();
  });

  it('a leg moved DOWN 1/64" (still under, within TOUCH) is stale, and boring again replaces its socket in place', () => {
    const doc0 = migrateDocument({ ...createDocument('Down'), boards: [...stoolLegs(), stoolSeat()] });
    const doc1 = bore(doc0, seatOf(doc0).id);
    const fr0 = named(doc1, 'Front right')[0]!;
    const old = seatOf(doc1).holes.find((r) => isSocketOf(seatOf(doc1), r, fr0))!;
    for (const dy of [-1 / 64, 1 / 64]) {
      const doc2 = mapWorld(doc1, (w) => w.map((b) => (b.id === fr0.id ? { ...b, position: [b.position[0], b.position[1] + dy, b.position[2]] as [number, number, number] } : b)));
      const fr = named(doc2, 'Front right')[0]!;
      const seat2 = seatOf(doc2);
      expect(legsUnder(world(doc2), seat2, IN), `dy ${dy}`).toContainEqual(fr);
      expect(staleSocketOf(seat2, fr), `dy ${dy}`).toBe(seat2.holes.find((r) => r.id === old.id));
      const seat3 = seatOf(bore(doc2, seat2.id));
      expect(seat3.holes).toHaveLength(4);
      expect(seat3.holes.findIndex((r) => r.id === old.id)).toBe(seat2.holes.findIndex((r) => r.id === old.id));
      expect(isSocketOf(seat3, seat3.holes.find((r) => r.id === old.id)!, fr)).toBe(true);
    }
  });

  it('a leaning part far below the seat (outside the resting band) is never stale, though the old line crosses its top', () => {
    const doc0 = stoolDocument();
    const doc = bore(doc0, seatOf(doc0).id);
    const seat = seatOf(doc);
    const fr = named(doc, 'Front right')[0]!;
    const low = { ...fr, position: [fr.position[0], fr.position[1] - 3, fr.position[2]] as [number, number, number] };
    expect(legsUnder([...world(doc), low], seat, IN)).not.toContainEqual(low);
    expect(staleSocketOf(seat, low)).toBeNull();
  });

  it('a leg that has its socket is never stale, even with another tilted row through its top', () => {
    const doc0 = stoolDocument();
    const doc = bore(doc0, seatOf(doc0).id);
    const seat = seatOf(doc);
    const fr = named(doc, 'Front right')[0]!;
    const socket = seat.holes.find((r) => isSocketOf(seat, r, fr))!;
    const extra = { ...socket, id: 'extra', tiltAcross: 0 - socket.tiltAcross! };
    expect(staleSocketOf({ ...seat, holes: [...seat.holes, extra] }, fr)).toBeNull();
  });

  it('a blind bore along the axis, or one entering from the bottom, is not the socket', () => {
    const doc0 = stoolDocument();
    const doc = bore(doc0, seatOf(doc0).id);
    const seat = seatOf(doc);
    const fr = named(doc, 'Front right')[0]!;
    const socket = seat.holes.find((r) => isSocketOf(seat, r, fr))!;
    expect(isSocketOf(seat, { ...socket, depth: 1 }, fr)).toBe(false);
    // The same line entered from the bottom: mouth at the old exit, the bit reversed (the entry side and both slopes
    // flip). The unturned flat seat: length on X, width on Z.
    const [, exit] = ends(seat, socket);
    const local = { length: exit[0] - seat.position[0], width: exit[2] - seat.position[2] };
    const fromBottom: HoleRow = { ...socket, from: 'min', tiltAlong: 0 - socket.tiltAlong!, tiltAcross: 0 - socket.tiltAcross!,
      station: socket.alongFrom === 'min' ? local.length : seat.length - local.length,
      inset: socket.acrossFrom === 'min' ? local.width : seat.width - local.width };
    const [m, f] = ends(seat, fromBottom);
    const ax = axisOf(fr);
    expect(offAxis(m, ax)).toBeLessThanOrEqual(1e-9);
    expect(offAxis(f, ax)).toBeLessThanOrEqual(1e-9);
    expect(isSocketOf(seat, fromBottom, fr)).toBe(false);
    // Nor is either STALE (final review M4): only a row socketRow could have written — a through bore from the seat's top —
    // is ever replaced, so a user's blind or underside bore along the leg's line is left alone.
    const only = (r: HoleRow): Board => ({ ...seat, holes: seat.holes.map((x) => (x.id === socket.id ? r : x)) });
    expect(staleSocketOf(only(fromBottom), fr)).toBeNull();
    expect(staleSocketOf(only({ ...socket, depth: 1 }), fr)).toBeNull();
    // The control: the same row from the top at another angle is still stale.
    const other = { ...socket, tiltAcross: 0 - socket.tiltAcross! };
    expect(staleSocketOf(only(other), fr)).toBe(other);
  });

  it('the stale note copy', () => {
    expect(socketStale('Front right')).toBe("Front right's socket no longer follows its leg — Bore leg sockets again.");
  });

  it('socketRow stores no zero slope: a rake-only leg leaves no tiltAlong key', () => {
    const x = 0;
    const z = slopeOf(8);
    const leg = relevel(createBoard({ name: 'Leg', length: 16, width: 1.5, thickness: 1.5, posture: 'upright', position: [4.25, 0, 4.25],
      lean: { x, z, face: 'thickness' } }));
    const seat = { ...stoolSeat(leanMap(leg)!.pivot[1]), id: 'seat' };
    const row = socketRow(seat, leg, 1);
    expect('tiltAlong' in row).toBe(false);
    expect(row.tiltAcross).not.toBe(0);
  });
});

// Final review, Important 1 (ruling F1): a socket bored for a leg leaning 45° stores slopes a few ulps past 1 (leanMap and
// fromWorld); the tilt bound takes lean's 1e-9 allowance, so it survives a reload, and socketPlan refuses past it.
describe('a 45° leg (final review F1)', () => {
  const T45 = slopeOf(45);
  const legAt = (x: number, z: number): Board => relevel(createBoard({ name: 'Leg', length: 16, width: 1.5, thickness: 1.5,
    posture: 'upright', position: [-0.75, 0, -0.75], lean: { x, z, face: chooseFace(createBoard({ posture: 'upright' }), x, z) } }));
  const docOver = (leg: Board): SloydDocument => {
    const p = leanMap(leg)!.pivot;
    const top = levelFaces(leg).find((f) => f.up)!.y;
    return { ...createDocument('Splay'), boards: [leg,
      createBoard({ name: 'Seat', length: 40, width: 40, thickness: 1.5, posture: 'flat', position: [p[0] - 20, top, p[2] - 20] })] };
  };

  for (const [x, z] of [[T45, 0], [0, T45], [Math.SQRT1_2, Math.SQRT1_2]] as const) {
    it(`lean (${x}, ${z}): the socket is bored, written, and KEPT through JSON and migrateDocument`, () => {
      const doc = docOver(legAt(x, z));
      expect(legsUnder(world(doc), seatOf(doc), IN)).toHaveLength(1);
      const after = bore(doc, seatOf(doc).id);
      const row = seatOf(after).holes[0]!;
      expect(seatOf(after).holes).toHaveLength(1);
      const back = migrateDocument(JSON.parse(JSON.stringify(after)));
      expect(seatOf(back).holes).toEqual([row]);
      expectSockets(seatOf(back), legsOf(back));
    });
  }

  it("a socket past the tilt bound is not bored: the leg is named in one sentence and nothing is written", () => {
    // A lean past the bound never loads (withinBound), so the leg is built directly: 50° along X.
    const leg = legAt(slopeOf(50), 0);
    const doc = docOver(leg);
    expect(legsUnder(world(doc), seatOf(doc), IN)).toHaveLength(1);
    expect(socketPlan(doc, seatOf(doc).id, 1)).toBe("Leg's socket would tilt past 45° — reduce the leg's lean.");
    expect(socketTooSteep('Front right')).toBe("Front right's socket would tilt past 45° — reduce the leg's lean.");
  });

  it('a steep leg among others: the others are bored, the steep one noted', () => {
    const steep = { ...legAt(slopeOf(50), 0), name: 'Steep' };
    const ok = { ...legAt(slopeOf(10), 0), name: 'Fine' };
    const p = leanMap(steep)!.pivot;
    const top = levelFaces(steep).find((f) => f.up)!.y;
    const moved = { ...ok, position: [ok.position[0], ok.position[1], ok.position[2] + 10] as [number, number, number] };
    const doc: SloydDocument = { ...createDocument('Two'), boards: [steep, moved,
      createBoard({ name: 'Seat', length: 40, width: 40, thickness: 1.5, posture: 'flat', position: [p[0] - 20, top, p[2] - 20] })] };
    expect(legsUnder(world(doc), seatOf(doc), IN)).toHaveLength(2);
    const plan = socketPlan(doc, seatOf(doc).id, 1);
    expect(plan).toMatchObject({ note: "Steep's socket would tilt past 45° — reduce the leg's lean." });
    expect(typeof plan !== 'string' && plan.holes).toHaveLength(1);
  });
});

// Round tenons Task 7: `partAxis` for ANY part, `legAxis` its upward flip (Bore leg sockets' rows are unchanged: every
// test above still passes as written).
describe('partAxis', () => {
  it('a leaning leg: through its pivot, along its leaned length (the independent axisOf), min → max', () => {
    for (const leg of stoolLegs()) {
      const ax = partAxis(leg);
      const ref = axisOf(leg);
      expect(ax.p).toEqual(ref.p);
      expect(len(sub(ax.u, ref.u))).toBeLessThanOrEqual(1e-15);
      expect(ax.u[1]).toBeGreaterThan(0);
    }
  });
  it('an unleaned part: through its max end\'s section centre, signed by its turn', () => {
    const rung = createBoard({ posture: 'flat', length: 10, width: 1.5, thickness: 0.75, position: [2, 8, 0] });
    expect(partAxis(rung)).toEqual({ p: [12, 8.375, 0.75], u: [1, 0, 0] });
    // Turned 180°, the length runs max → min along −X: its max end is now the −X one.
    expect(partAxis({ ...rung, rotation: 180 })).toEqual({ p: [2, 8.375, 0.75], u: [-1, 0, 0] });
    const post = createBoard({ posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [0, 0, 0] });
    expect(partAxis(post)).toEqual({ p: [0.75, 30, 0.75], u: [0, 1, 0] });
  });
  it('isSocketOf stays narrower than boreAlongAxis: a blind bore along the axis is coaxial, not a socket', () => {
    const doc0 = stoolDocument();
    const doc = bore(doc0, seatOf(doc0).id);
    const seat = seatOf(doc);
    const fr = named(doc, 'Front right')[0]!;
    const socket = seat.holes.find((r) => isSocketOf(seat, r, fr))!;
    const blind = { ...socket, depth: 0.75 };
    const swapped = { ...seat, holes: seat.holes.map((x) => (x.id === socket.id ? blind : x)) };
    expect(boreAlongAxis(swapped, blind, partAxis(fr))).toBe(true);
    expect(isSocketOf(swapped, blind, fr)).toBe(false);
    // An unleaned leg has no socket at all (Bore leg sockets only bores for leaning legs).
    const { lean: _l, ...upright } = fr;
    expect(isSocketOf(seat, socket, upright as Board)).toBe(false);
  });
});

// ---- Round tenons spec §6 (Task 9): Bore leg sockets tenons the legs ------------------------------------------------

/** The plan applied as the store applies it: ONE `mapWorld` write of the seat's rows and every leg's patch. */
function fit(doc: SloydDocument, seatId: string, d = 1): SloydDocument {
  const p = socketPlan(doc, seatId, d, true);
  if (typeof p === 'string') throw new Error(p);
  const legs = new Map((p.legs ?? []).map((l) => [l.id, l.patch]));
  return mapWorld(doc, (w) => w.map((b) => (b.id === seatId ? { ...b, holes: p.holes } : legs.has(b.id) ? { ...b, ...legs.get(b.id)! } : b)));
}
const NO_LIMITS: DesignLimits = { width: null, depth: null, height: null, maxParts: 100 };
const onAxisAt = (b: Board, l: number) => toWorld(b, { length: l, width: b.width / 2, thickness: b.thickness / 2 });
/** The world heights of the section's four corners at local length `l`. */
const cornerYs = (b: Board, l: number) => [[0, 0], [b.width, 0], [0, b.thickness], [b.width, b.thickness]]
  .map(([w, t]) => toWorld(b, { length: l, width: w!, thickness: t! })[1]);
/** The tip's centre: where the axis meets the top end's face (square or mitered). */
const tipOf = (b: Board) => onAxisAt(b, shoulderAt(b, { end: 'max', length: 0 }));
const upY = (b: Board) => partAxis(b).u[1];
const onGrid = (v: number, step: number) => Math.abs(v / step - Math.round(v / step)) <= 1e-6;

/**
 * The fit is what §6.1 says, for every leg in `legs` under `seat`: one built top tenon of the socket's diameter, its tip's
 * centre in the seat's top face (height to 1e-9, inside the face's plan outline), its shoulder's highest corner at or below
 * the underside by less than one TENON_STEP × u_y, its length on the 1/64 grid; the leg levelled (so it is found again).
 */
function expectFitted(doc: SloydDocument, seat: Board, legs: readonly Board[], d = 1, units: Units = IN): void {
  const top = seat.position[1] + seat.thickness;
  const under = seat.position[1];
  const step = units.display === 'metric-mm' ? 0.1 / 25.4 : 1 / 64;
  for (const leg of legs) {
    const ts = builtTenons(leg);
    expect(ts.map((t) => t.end), leg.id).toEqual(['max']);
    const t = ts[0]!;
    expect(t.diameter, leg.id).toBe(d);
    expect(onGrid(t.length, step), `${leg.id} tenon length ${t.length}`).toBe(true);
    const tip = tipOf(leg);
    expect(Math.abs(tip[1] - top), `${leg.id} tip`).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(tip[0] - seat.position[0]) < seat.length && tip[0] > seat.position[0], `${leg.id} tip x`).toBe(true);
    expect(tip[2] > seat.position[2] && tip[2] < seat.position[2] + seat.width, `${leg.id} tip z`).toBe(true);
    const high = Math.max(...cornerYs(leg, shoulderAt(leg, t)));
    expect(high, `${leg.id} shoulder`).toBeLessThanOrEqual(under + 1e-9);
    expect(high, `${leg.id} shoulder`).toBeGreaterThan(under - upY(leg) * step - 1e-9);
    expect(isLevelled(leg, units), leg.id).toBe(true);
    expect(seat.holes.some((r) => isSocketOf(seat, r, leg)), `${leg.id} socket`).toBe(true);
  }
  expect(legsUnder(world(doc), seat, units).map((b) => b.id).sort()).toEqual(legs.map((b) => b.id).sort());
}
const MM: Units = { display: 'metric-mm', precision: 16 };
/** `doc` with the part named `name` moved `dy` in world Y (a plain part). */
const moveSeat = (doc: SloydDocument, dy: number, name = 'Seat') => mapWorld(doc, (w) => w.map((b) => (b.name === name
  ? { ...b, position: [b.position[0], b.position[1] + dy, b.position[2]] as Vec3 } : b)));
const kindsOf = (doc: SloydDocument) => checkDesign(flatDocument(doc), NO_LIMITS).map((v) => `${v.kind}:${v.parts.join(',')}`);

describe('Bore leg sockets tenons the legs (round tenons §6)', () => {
  it('the stool: one action gives four sockets and four top tenons, flush and clear; the growth and length rounded UP', () => {
    const doc0 = stoolDocument();
    const before = new Map(legsOf(doc0).map((b) => [b.id, b]));
    const doc = fit(doc0, seatOf(doc0).id);
    const seat = seatOf(doc);
    expect(seat.holes).toHaveLength(4);
    expectFitted(doc, seat, legsOf(doc));
    for (const leg of legsOf(doc)) {
      const old = before.get(leg.id)!;
      // Growth: exactly enough that the top end's lowest corner reaches the seat's top, rounded UP to 1/16. The fixture's
      // exact value is off the grid, so a round-down (or no rounding) fails here.
      const exactGrowth = (17.5 - Math.min(...cornerYs(old, old.length))) / upY(old);
      expect(onGrid(exactGrowth, 1 / 16)).toBe(false);
      const growth = leg.length - old.length;
      expect(onGrid(growth, 1 / 16), `${leg.name} growth ${growth}`).toBe(true);
      expect(growth).toBeGreaterThanOrEqual(exactGrowth - 1e-9);
      expect(growth).toBeLessThan(exactGrowth + 1 / 16);
      // The tenon: from the shoulder plane where the highest corner just clears the underside, to the tip's centre, UP.
      const t = tenonAt(leg, 'max')!;
      const ls = Math.min(...cornerYs(leg, 0).map((c) => (16 - c) / upY(leg)));
      const exactLen = shoulderAt(leg, { end: 'max', length: 0 }) - ls;
      expect(onGrid(exactLen, 1 / 64)).toBe(false);
      expect(t.length).toBeGreaterThanOrEqual(exactLen - 1e-9);
      expect(t.length).toBeLessThan(exactLen + 1 / 64);
    }
    expect(tenonJoints(flatDocument(doc))).toHaveLength(4);
    expect(kindsOf(doc)).toEqual([]);
  });

  it('the square-set stool (square-set legs §3.3): four sockets, four top tenons seated on compound tips, a clean check', () => {
    const doc0 = squareStoolDocument();
    // Linked by role as the turned stool is (two Shapes, each leg with its 180° twin), so the storage-group path runs.
    expect(doc0.shapes).toHaveLength(2);
    expect(stoolDocument().shapes).toHaveLength(2);
    expect(legsOf(doc0).every((b) => b.lean!.square === true && b.angleCuts.every((c) => c.across !== undefined))).toBe(true);
    const doc = fit(doc0, seatOf(doc0).id);
    const seat = seatOf(doc);
    expect(seat.holes).toHaveLength(4);
    expectFitted(doc, seat, legsOf(doc));
    // The fitted tops are still one compound miter each (the top re-levelled through the seat's top face).
    for (const leg of legsOf(doc)) {
      const top = leg.angleCuts.filter((c) => c.face === 'length' && c.from === 'max');
      expect(top, leg.name).toHaveLength(1);
      expect(top[0]!.across, leg.name).toBeDefined();
    }
    expect(tenonJoints(flatDocument(doc))).toHaveLength(4);
    expect(kindsOf(doc)).toEqual([]);
    // Again: nothing to do (sameCuts reads the compound tops through sameLevelLine).
    const p = socketPlan(doc, seatOf(doc).id, 1, true);
    expect(typeof p === 'object' && p.holes).toBe(seatOf(doc).holes);
    expect(typeof p === 'object' && (p.legs ?? [])).toEqual([]);
  });

  it('again, immediately: nothing to do (the seat\'s own rows, no leg patch)', () => {
    const doc0 = stoolDocument();
    const doc = fit(doc0, seatOf(doc0).id);
    expect(tenonJoints(flatDocument(doc))).toHaveLength(4);
    const p = socketPlan(doc, seatOf(doc).id, 1, true);
    expect(typeof p === 'object' && p.holes).toBe(seatOf(doc).holes);
    expect(typeof p === 'object' && (p.legs ?? [])).toEqual([]);
  });

  it('checkbox off: the sockets only, as today; no leg is touched', () => {
    const doc0 = stoolDocument();
    const p = socketPlan(doc0, seatOf(doc0).id, 1);
    expect(typeof p === 'object' && p.legs).toBeUndefined();
    const q = socketPlan(doc0, seatOf(doc0).id, 1, false);
    expect(typeof q === 'object' && q.legs).toBeUndefined();
  });

  it('after a rake edit and Level the ends: found again, its socket and tenon replaced in place (ids kept), clean', () => {
    // Plain parts, so each leg is its own edit.
    const doc0 = migrateDocument({ ...createDocument('Refit'), boards: [...stoolLegs(), stoolSeat()] });
    const doc1 = fit(doc0, seatOf(doc0).id);
    const fr1 = named(doc1, 'Front right')[0]!;
    const socket = seatOf(doc1).holes.find((r) => isSocketOf(seatOf(doc1), r, fr1))!;
    const tenon = tenonAt(fr1, 'max')!;
    const doc2 = mapWorld(doc1, (w) => w.map((b) => (b.id === fr1.id ? relevel({ ...b, lean: { ...b.lean!, z: slopeOf(10) } }) : b)));
    const fr2 = named(doc2, 'Front right')[0]!;
    // Level the ends kept the tenon (spec §6.3), and the leg is found again by the tenoned rule, its old socket stale.
    expect(tenonAt(fr2, 'max')).toEqual(tenon);
    expect(Math.abs(tipOf(fr2)[1] - 17.5)).toBeGreaterThan(1e-6);
    expect(legsUnder(world(doc2), seatOf(doc2), IN).map((b) => b.name)).toContain('Front right');
    expect(staleSocketOf(seatOf(doc2), fr2)).toBe(socket);
    expect(staleTenonOf(seatOf(doc2), fr2)).toBe(tenonAt(fr2, 'max'));
    const doc3 = fit(doc2, seatOf(doc2).id);
    const seat3 = seatOf(doc3);
    const fr3 = named(doc3, 'Front right')[0]!;
    expect(seat3.holes.map((r) => r.id)).toEqual(seatOf(doc2).holes.map((r) => r.id));
    expect(isSocketOf(seat3, seat3.holes.find((r) => r.id === socket.id)!, fr3)).toBe(true);
    expect(tenonAt(fr3, 'max')!.id).toBe(tenon.id);
    expect(staleTenonOf(seat3, fr3)).toBeNull();
    expectFitted(doc3, seat3, legsOf(doc3));
    expect(kindsOf(doc3)).toEqual([]);
  });

  it('a re-fit SHORTENS a leg when the seat comes down: the plan sets, not adds, rounded UP (toward zero)', () => {
    const doc0 = stoolDocument();
    const doc1 = fit(doc0, seatOf(doc0).id);
    const fr = named(doc1, 'Front right')[0]!;
    expect(builtTenons(fr)).toHaveLength(1);
    const low = { ...seatOf(doc1), position: [-7, 15.5, -7] as [number, number, number] };
    // Its tip stands 1/2" above the lowered top, past TOUCH, but its tenon's centre segment still meets the stock: found
    // (T9a; the action itself is the next test).
    expect(legsUnder([...world(doc1).filter((b) => b.name !== 'Seat'), low], low, IN)).toHaveLength(4);
    const p = legTenonPlan(low, fr, 1, IN);
    if (typeof p === 'string') throw new Error(p);
    const exact = (17 - Math.min(...cornerYs(fr, fr.length))) / upY(fr);
    expect(exact).toBeLessThan(0);
    expect(p.length - fr.length).toBeLessThan(0);
    expect(p.length - fr.length).toBeGreaterThanOrEqual(exact - 1e-9);
    expect(p.length - fr.length).toBeLessThan(exact + 1 / 16);
    const after = { ...fr, ...p };
    expect(Math.abs(tipOf(after)[1] - 17)).toBeLessThanOrEqual(1e-9);
    expect(p.tenons.find((t) => t.end === 'max')!.id).toBe(tenonAt(fr, 'max')!.id);
    expect(Math.max(...cornerYs(after, shoulderAt(after, tenonAt(after, 'max')!)))).toBeLessThanOrEqual(15.5 + 1e-9);
  });

  it('T9a: the seat LOWERED 1/2" under fitted legs: found by the tenon, socket and tenon ids kept, every leg shortened', () => {
    const doc0 = stoolDocument();
    const doc1 = fit(doc0, seatOf(doc0).id);
    const seat1 = seatOf(doc1);
    const socketOf = new Map(legsOf(doc1).map((l) => [l.id, seat1.holes.find((r) => isSocketOf(seat1, r, l))!.id]));
    const doc2 = moveSeat(doc1, -0.5);
    const seat2 = seatOf(doc2);
    expect(seat2.position[1]).toBe(15.5);
    for (const leg of legsOf(doc2)) {
      // The fixture: every tip stands past TOUCH above the lowered top (the tip-in-stock rule alone would lose it) …
      expect(tipOf(leg)[1] - 17, leg.name).toBeGreaterThan(TOUCH);
      // … and the stale socket the re-fit replaces is the leg's old one, by id (not a second socket beside it).
      expect(staleSocketOf(seat2, leg)?.id, leg.name).toBe(socketOf.get(leg.id));
    }
    expect(legsUnder(world(doc2), seat2, IN)).toHaveLength(4);
    const doc3 = fit(doc2, seat2.id);
    const seat3 = seatOf(doc3);
    expect(seat3.holes.map((r) => r.id)).toEqual(seat2.holes.map((r) => r.id));
    for (const leg of legsOf(doc3)) {
      const old = legsOf(doc2).find((b) => b.id === leg.id)!;
      expect(leg.length, leg.name).toBeLessThan(old.length);
      expect(tenonAt(leg, 'max')!.id, leg.name).toBe(tenonAt(old, 'max')!.id);
      expect(seat3.holes.find((r) => r.id === socketOf.get(leg.id) && isSocketOf(seat3, r, leg)), leg.name).toBeDefined();
    }
    expectFitted(doc3, seat3, legsOf(doc3));
    expect(tenonJoints(flatDocument(doc3))).toHaveLength(4);
    expect(kindsOf(doc3)).toEqual([]);
    const again = socketPlan(doc3, seat3.id, 1, true);
    expect(typeof again === 'object' && again.holes).toBe(seat3.holes);
    expect(typeof again === 'object' && (again.legs ?? [])).toEqual([]);
  });

  it('T9a\'s known limit: a seat RAISED clear of the tips (a gap above them) is not found, as an untenoned leg is not', () => {
    const doc0 = stoolDocument();
    const doc1 = fit(doc0, seatOf(doc0).id);
    const doc2 = moveSeat(doc1, 2);
    const seat2 = seatOf(doc2);
    for (const leg of legsOf(doc2)) expect(seat2.position[1] - tipOf(leg)[1], leg.name).toBeGreaterThan(TOUCH);
    expect(legsUnder(world(doc2), seat2, IN)).toEqual([]);
    const p = socketPlan(doc2, seat2.id, 1, true);
    expect(typeof p === 'object' && (p.legs ?? [])).toEqual([]);
    expect(typeof p === 'object' && p.holes).toBe(seat2.holes);
  });

  it('T9a: nor a seat lowered BELOW the shoulders (the tenon\'s segment wholly above its top)', () => {
    const doc0 = stoolDocument();
    const doc1 = fit(doc0, seatOf(doc0).id);
    const doc2 = moveSeat(doc1, -2);
    const seat2 = seatOf(doc2);
    const top = seat2.position[1] + seat2.thickness;
    for (const leg of legsOf(doc2)) {
      const t = tenonAt(leg, 'max')!;
      expect(onAxisAt(leg, shoulderAt(leg, t))[1] - top, leg.name).toBeGreaterThan(TOUCH);
    }
    expect(legsUnder(world(doc2), seat2, IN)).toEqual([]);
  });

  it('Level the ends refusing for ONE leg refuses the whole action, verbatim; checkbox off, the sockets are bored', () => {
    // Plain parts. Front right's levelled top also carries a small chamfer: an end cut Level the ends cannot replace.
    const legs = stoolLegs();
    const chamfer: AngleCut = { id: 'ch', kind: 'chamfer', face: 'length', from: 'max', along: 'width', alongFrom: 'max', points: [[0, 0.125], [0.125, 0]] };
    const doc = migrateDocument({ ...createDocument('Chamfer'), boards: [{ ...legs[0]!, angleCuts: [...legs[0]!.angleCuts, chamfer] }, ...legs.slice(1), stoolSeat()] });
    const fr = named(doc, 'Front right')[0]!;
    expect(fr.angleCuts.map((c) => c.id)).toContain('ch');
    expect(levelPlan(fr, IN)).toBe(LEVEL_TOP_CUT);
    expect(legsUnder(world(doc), seatOf(doc), IN)).toHaveLength(4);
    expect(socketPlan(doc, seatOf(doc).id, 1, true)).toBe(LEVEL_TOP_CUT);
    const off = socketPlan(doc, seatOf(doc).id, 1, false);
    expect(typeof off === 'object' && off.holes).toHaveLength(4);
  });

  it('Level the ends refusing for a Shape MATE under another seat refuses the whole action, verbatim', () => {
    // Two stools whose Front rights share one Shape, fitted together; then seat 2 comes down 1/2" and the Shape gains a
    // small hole 1/4" below its top: the mate's shortened fit (T9a finds it) would cut the hole away.
    const legs1 = migrateDocument({ ...createDocument('L'), boards: stoolLegs() }).boards as Board[];
    const legs2 = legs1.map((b) => ({ ...b, id: `${b.id}-2`, position: [b.position[0] + 30, b.position[1], b.position[2]] as Vec3 }));
    const { id: _i, name: _n, position: _p, rotation: _r, ...shared } = legs1[0]!;
    const user = (b: Board) => ({ id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: 'leg' });
    const doc0 = migrateDocument({ ...createDocument('Two stools'), shapes: [{ id: 'leg', ...shared } as Shape],
      boards: [user(legs1[0]!), ...legs1.slice(1), user(legs2[0]!), ...legs2.slice(1), stoolSeat(), { ...stoolSeat(), name: 'Seat 2', position: [23, 16, -7] }] as Board[] });
    const doc1 = fit(doc0, seatOf(doc0).id);
    expect(doc1.shapes[0]!.tenons).toHaveLength(1);
    const hole: HoleRow = { id: 'h', face: 'thickness', from: 'max', diameter: 0.125, depth: 0.25, along: 'length', alongFrom: 'max',
      station: 0.25, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.75 };
    const doc2 = moveSeat({ ...doc1, shapes: doc1.shapes.map((sh) => ({ ...sh, holes: [hole] })) }, -0.5, 'Seat 2');
    const mate = world(doc2).find((b) => b.id === legs2[0]!.id)!;
    expect(legsUnder(world(doc2), named(doc2, 'Seat 2')[0]!, IN).map((b) => b.id)).toContain(mate.id);
    expect(levelPlan(mate, IN, { topAt: 17 })).toBe(LEVEL_CUTS_HOLE);
    expect(socketPlan(doc2, seatOf(doc2).id, 1, true)).toBe(LEVEL_CUTS_HOLE);
  });

  it('a METRIC stool: the growth on the 1 mm grid, the tenon on 0.1 mm, the tip flush, the shoulder clear, clean', () => {
    const doc0 = { ...stoolDocument(), units: MM };
    const before = new Map(legsOf(doc0).map((b) => [b.id, b]));
    const doc = fit(doc0, seatOf(doc0).id);
    const seat = seatOf(doc);
    expect(seat.holes).toHaveLength(4);
    expectFitted(doc, seat, legsOf(doc), 1, MM);
    for (const leg of legsOf(doc)) {
      const change = leg.length - before.get(leg.id)!.length;
      expect(change, leg.name).toBeGreaterThan(1);
      // Both ends' changes round to the drag grid (Level the ends re-rounds an imperial-levelled foot too): 1 mm.
      expect(onGrid(change, snapStep(MM)), `${leg.name} change ${change}`).toBe(true);
      expect(onGrid(change, 1 / 16), `${leg.name} change ${change}`).toBe(false);
      expect(onGrid(tenonAt(leg, 'max')!.length, 1 / 64), leg.name).toBe(false);
    }
    expect(tenonJoints(flatDocument(doc))).toHaveLength(4);
    expect(kindsOf(doc)).toEqual([]);
    const again = socketPlan(doc, seat.id, 1, true);
    expect(typeof again === 'object' && (again.legs ?? [])).toEqual([]);
  });

  it('a leg\'s bottom tenon is untouched; its existing top tenon is replaced, keeping its id', () => {
    const fr = stoolLegs()[0]!;
    const seat = stoolSeat();
    const bottom = { id: 'b1', end: 'min' as const, diameter: 0.5, length: 0.5 };
    const typed = { id: 't1', end: 'max' as const, diameter: 0.75, length: 0.25 };
    const p = legTenonPlan(seat, { ...fr, tenons: [bottom, typed] }, 1, IN);
    if (typeof p === 'string') throw new Error(p);
    expect(p.tenons[0]).toBe(bottom);
    expect(p.tenons[1]).toMatchObject({ id: 't1', end: 'max', diameter: 1 });
  });

  it('a tenon that would fault is named in one sentence; its socket is still bored and the leg left alone', () => {
    const legs = stoolLegs();
    const fr = legs[0]!;
    // A small hole 1/4" below the top, clear of the top miter: it stays where it is in the wood, inside the fitted tenon's
    // zone (the shoulder lands below the old top).
    const hole: HoleRow = { id: 'h', face: 'thickness', from: 'max', diameter: 0.125, depth: 0.25, along: 'length', alongFrom: 'max',
      station: 0.25, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.2 };
    const doc = migrateDocument({ ...createDocument('Fault'), boards: [{ ...fr, holes: [hole] }, ...legs.slice(1), stoolSeat()] });
    const p = socketPlan(doc, seatOf(doc).id, 1, true);
    if (typeof p === 'string') throw new Error(p);
    expect(p.note).toBe("Front right's tenon: The tenon would run into a hole — move it or remove it first.");
    expect(p.holes).toHaveLength(4);
    expect((p.legs ?? []).map((l) => l.id)).not.toContain(named(doc, 'Front right')[0]!.id);
    expect(p.legs).toHaveLength(3);
  });

  it('Review Focus 4: two stools sharing one leg Shape, seats of different thickness: refused, naming both, nothing planned', () => {
    const legs1 = stoolLegs();
    const legs2 = stoolLegs().map((b) => ({ ...b, id: `${b.id}-2`, position: [b.position[0] + 30, b.position[1], b.position[2]] as [number, number, number] }));
    const fr1 = legs1[0]!;
    const fr2 = legs2[0]!;
    const { id: _i, name: _n, position: _p, rotation: _r, ...shared } = fr1;
    const doc = migrateDocument({ ...createDocument('Two stools'), shapes: [{ id: 'leg', ...shared } as Shape],
      boards: [{ id: fr1.id, name: fr1.name, position: fr1.position, rotation: fr1.rotation, shape: 'leg' }, ...legs1.slice(1),
        { id: fr2.id, name: fr2.name, position: fr2.position, rotation: fr2.rotation, shape: 'leg' }, ...legs2.slice(1),
        stoolSeat(), { ...stoolSeat(), name: 'Seat 2', thickness: 2.5, position: [23, 16, -7] }] as Board[] });
    const names = displayNames(doc);
    const s1 = seatOf(doc);
    expect(legsUnder(world(doc), s1, IN)).toHaveLength(4);
    expect(legsUnder(world(doc), named(doc, 'Seat 2')[0]!, IN)).toHaveLength(4);
    expect(socketPlan(doc, s1.id, 1, true)).toBe(socketsDisagree([names.get(fr1.id)!, names.get(fr2.id)!]));
    // Checkbox off, the sockets alone are bored as today (the legs are not written).
    expect(typeof socketPlan(doc, s1.id, 1, false)).toBe('object');
    // Equal seats agree: both stools' Front rights take one tenon and growth.
    const even = { ...doc, boards: doc.boards.map((b) => (b.name === 'Seat 2' ? { ...(b as Board), thickness: 1.5 } : b)) };
    const q = socketPlan(even, s1.id, 1, true);
    expect(typeof q).toBe('object');
  });

  it('a Shape user standing under NO seat is a copy that cannot be judged: refused, naming it', () => {
    const doc0 = stoolDocument();
    const fr = named(doc0, 'Front right')[0]!;
    const spare = { id: 'spare', name: 'Spare', position: [fr.position[0] + 40, fr.position[1], fr.position[2]], rotation: 0, shape: fr.shape } as Board;
    const doc = migrateDocument({ ...doc0, boards: [...doc0.boards, spare] });
    expect(socketPlan(doc, seatOf(doc).id, 1, true)).toBe(socketsDisagree(['Front right', 'Spare']));
    expect(typeof socketPlan(doc, seatOf(doc).id, 1)).toBe('object');
  });

  it("the tenon takes its SOCKET's diameter: sockets already bored at 1\" stay, a 3/4\" press fits 1\" tenons to them", () => {
    const doc0 = stoolDocument();
    const p0 = socketPlan(doc0, seatOf(doc0).id, 1);
    if (typeof p0 === 'string') throw new Error(p0);
    const bored = mapWorld(doc0, (w) => w.map((b) => (b.name === 'Seat' ? { ...b, holes: p0.holes } : b)));
    const doc = fit(bored, seatOf(bored).id, 0.75);
    expect(seatOf(doc).holes).toBe(seatOf(bored).holes);
    expectFitted(doc, seatOf(doc), legsOf(doc), 1);
    expect(kindsOf(doc)).toEqual([]);
  });

  it('linked legs over one seat are written ONCE on the Shape: one patch with the shared fields, the twin its position only', () => {
    const doc0 = stoolDocument();
    const p = socketPlan(doc0, seatOf(doc0).id, 1, true);
    if (typeof p === 'string') throw new Error(p);
    const w = world(doc0);
    const full = (p.legs ?? []).filter((l) => 'tenons' in l.patch);
    expect(full.map((l) => w.find((b) => b.id === l.id)!.shape).sort()).toEqual(doc0.shapes.map((s) => s.id).sort());
    expect((p.legs ?? []).filter((l) => !('tenons' in l.patch)).every((l) => Object.keys(l.patch).join() === 'position')).toBe(true);
    expect(p.legs).toHaveLength(4);
    const doc = fit(doc0, seatOf(doc0).id);
    for (const sh of doc.shapes) expect(sh.tenons).toHaveLength(1);
    expectFitted(doc, seatOf(doc), legsOf(doc));
    expect(kindsOf(doc)).toEqual([]);
  });

  it('⚠️ the four legs on ONE Shape, two of them MIRRORED users: one action fits all four, the Shape written once', () => {
    // Through the load gate first: stoolLegs' 180° twins share their originals' ids until `takeId` re-mints them.
    const [fr, fl, bl, br] = migrateDocument({ ...createDocument('L'), boards: stoolLegs() }).boards as [Board, Board, Board, Board];
    const { id: _i, name: _n, position: _p, rotation: _r, ...shared } = fr;
    const user = (b: Board, mirrored: boolean) => ({ id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: 'leg', ...(mirrored ? { mirrored: true } : {}) });
    const doc0 = migrateDocument({ ...createDocument('Mirrored'), shapes: [{ id: 'leg', ...shared } as Shape],
      boards: [user(fr, false), user(fl, true), user(bl, false), user(br, true), stoolSeat()] as Board[] });
    expect(doc0.shapes).toHaveLength(1);
    expect(doc0.boards.filter((b) => 'mirrored' in b && b.mirrored)).toHaveLength(2);
    // The users resolve to the plain stool's legs (the fixture is what it claims).
    for (const [b, plain] of [[fr, fr], [fl, fl], [bl, bl], [br, br]] as const) {
      const r = world(doc0).find((x) => x.id === b.id)!;
      expect(r.lean, b.name).toEqual(plain.lean);
      expect(r.position, b.name).toEqual(plain.position);
    }
    expect(legsUnder(world(doc0), seatOf(doc0), IN)).toHaveLength(4);
    const doc = fit(doc0, seatOf(doc0).id);
    expect(doc.shapes).toHaveLength(1);
    expect(doc.shapes[0]!.tenons).toHaveLength(1);
    for (const leg of legsOf(doc)) expect(leg.tenons!.map((t) => t.end), leg.name).toEqual(['max']);
    expectFitted(doc, seatOf(doc), legsOf(doc));
    expect(tenonJoints(flatDocument(doc))).toHaveLength(4);
    expect(kindsOf(doc)).toEqual([]);
  });

  it('Minor 2: two placements of ONE shaped user whose fits agree in the Shape but not in its stored position: refused', () => {
    // Reachable only in principle, on a first press through the resting rule: the level cuts pin the floor and the seat's
    // top in the part's own frame, so two placements store the same cuts and length only when the second stands exactly
    // k·u_y/16 higher (to 1e-9) under a seat at the SAME height. Here k = 1: placement 2 stands h = u_y/16 higher, and the
    // seats sit 0.03" above placement 1's top (both within TOUCH of their legs). Placement 2's foot grows 1/16 and its
    // top 1/16 less: the same length and cuts, its stored pivot 1/16 lower along the axis.
    const [fr, , bl] = migrateDocument({ ...createDocument('L'), boards: stoolLegs() }).boards as [Board, Board, Board];
    const h = upY(fr) / 16;
    const { id: _i, name: _n, position: _p, rotation: _r, ...shared } = fr;
    const doc = migrateDocument({ ...createDocument('Placements'), shapes: [{ id: 'leg', ...shared } as Shape],
      definitions: [{ id: 'd', boards: [{ id: 'u', name: 'Leg', position: fr.position, rotation: fr.rotation, shape: 'leg' } as StoredBoard], instances: [], hardware: [] }],
      instances: [
        { id: 'i1', name: 'One', definition: 'd', position: [0, 0, 0], rotation: 0 },
        { id: 'i2', name: 'Two', definition: 'd', position: [30, h, 0], rotation: 0 },
      ],
      boards: [{ id: bl.id, name: 'Twin', position: bl.position, rotation: bl.rotation, shape: 'leg' } as StoredBoard,
        stoolSeat(16.03), { ...stoolSeat(16.03), name: 'Seat 2', position: [23, 16.03, -7] }] as Board[] });
    const one = world(doc).find((b) => b.id === 'i1/u')!;
    const two = world(doc).find((b) => b.id === 'i2/u')!;
    const s1 = seatOf(doc);
    const s2 = named(doc, 'Seat 2')[0]!;
    expect(doc.shapes).toHaveLength(1);
    expect(legsUnder(world(doc), s1, IN).map((b) => b.id).sort()).toEqual([bl.id, one.id].sort());
    expect(legsUnder(world(doc), s2, IN).map((b) => b.id)).toEqual([two.id]);
    const p1 = legTenonPlan(s1, one, 1, IN);
    const p2 = legTenonPlan(s2, two, 1, IN);
    if (typeof p1 === 'string' || typeof p2 === 'string') throw new Error('fit');
    expect(p2.length).toBe(p1.length);
    expect(p2.length).toBeGreaterThan(one.length);
    expect(Math.abs((p2.position[1] - h) - p1.position[1])).toBeGreaterThan(1e-3);
    // The fixture: the two fits store the same Shape (so only the position comparison can tell them apart).
    const bWith = (b: Board, p: typeof p1) => ({ ...b, ...p });
    expect(p2.angleCuts.length).toBe(p1.angleCuts.length);
    expect(p2.angleCuts.every((c, i) => sameLevelLine(c, p1.angleCuts[i]!, bWith(one, p1)[c.along]))).toBe(true);
    // Named as every refusal here is: the group's representative (the first leg under the seat, in world order) and the
    // copy that disagrees.
    const names = displayNames(doc);
    expect(socketPlan(doc, s1.id, 1, true)).toBe(socketsDisagree([names.get(bl.id)!, names.get(two.id)!]));
  });

  it('a stool inside a mirrored instance: one action from either copy fits both copies\' legs, stored once', () => {
    const parts = [...stoolLegs(), stoolSeat()].map((b) => b as StoredBoard);
    const doc0 = migrateDocument({ ...createDocument('Mirror'),
      definitions: [{ id: 'd', boards: parts, instances: [], hardware: [] }],
      instances: [
        { id: 'i1', name: 'Left', definition: 'd', position: [0, 0, 0], rotation: 0 },
        { id: 'i2', name: 'Right', definition: 'd', position: [30, 0, 0], rotation: 270, mirrored: true },
      ] });
    const right = named(doc0, 'Seat').find((b) => b.id.startsWith('i2/'))!;
    const doc = fit(doc0, right.id);
    const w = world(doc);
    for (const seat of w.filter((b) => b.name === 'Seat')) {
      const prefix = seat.id.split('/')[0];
      expectFitted(doc, seat, w.filter((b) => b.name !== 'Seat' && b.id.startsWith(`${prefix}/`)));
    }
    expect(kindsOf(doc)).toEqual([]);
  });
});

/** Bore leg sockets' four stool rows, captured at 324ea54 BEFORE the bore core was factored out (stretchers Task 1): the
 *  refactor must return them bit for bit. */
const STOOL_SOCKETS: [string, Omit<HoleRow, 'id'>][] = [
  ['Front right', { face: 'thickness', from: 'max', diameter: 1, depth: 'through', along: 'length', alongFrom: 'max', station: 2.3188348425050336, count: 1, pitch: 0, acrossFrom: 'max', inset: 2.2108112520535883, tiltAlong: -0.2125565616700246, tiltAcross: -0.14054083470239292 }],
  ['Front left', { face: 'thickness', from: 'max', diameter: 1, depth: 'through', along: 'length', alongFrom: 'min', station: 2.3188348425050327, count: 1, pitch: 0, acrossFrom: 'max', inset: 2.2108112520535883, tiltAlong: -0.21255656167002274, tiltAcross: -0.14054083470239292 }],
  ['Back left', { face: 'thickness', from: 'max', diameter: 1, depth: 'through', along: 'length', alongFrom: 'min', station: 2.3188348425050327, count: 1, pitch: 0, acrossFrom: 'min', inset: 2.2108112520535874, tiltAlong: -0.21255656167002274, tiltAcross: -0.140540834702392 }],
  ['Back right', { face: 'thickness', from: 'max', diameter: 1, depth: 'through', along: 'length', alongFrom: 'max', station: 2.3188348425050336, count: 1, pitch: 0, acrossFrom: 'min', inset: 2.2108112520535874, tiltAlong: -0.2125565616700246, tiltAcross: -0.140540834702392 }],
];

describe('one bore core (stretchers spec §3.4)', () => {
  it('socketRow and Bore leg sockets return the rows they returned before the refactor, exactly', () => {
    const doc = stoolDocument();
    const seat = seatOf(doc);
    expect(legsOf(doc).map((l) => [l.name, socketRow(seat, l, 1)])).toEqual(STOOL_SOCKETS);
    const p = socketPlan(doc, seat.id, 1);
    if (typeof p === 'string') throw new Error(p);
    expect(p.holes.map(({ id: _id, ...r }) => r)).toEqual(STOOL_SOCKETS.map(([, r]) => r));
  });

  /** The front rung's line at height `h`, built by hand (Task 2 builds the real one): the two front legs' axes crossing
   *  y = h give the points; the line runs along exactly +X through them at their mean z. */
  function frontLine(legs: readonly Board[], h: number): { line: WorldAxis; right: V3; left: V3 } {
    const at = (name: string): V3 => {
      const { p, u } = partAxis(legs.find((b) => b.name === name)!);
      const t = (h - p[1]) / u[1];
      return [p[0] + t * u[0], h, p[2] + t * u[2]];
    };
    const right = at('Front right');
    const left = at('Front left');
    return { line: { p: [left[0], h, (left[2] + right[2]) / 2], u: [1, 0, 0] }, right, left };
  }

  it('a rung socket on Front right: along the rung\'s line, blind, seating a tenon whose tip is the given tip', () => {
    const doc = stoolDocument();
    const legs = legsOf(doc);
    const leg = legs.find((b) => b.name === 'Front right')!;
    const { line, right, left } = frontLine(legs, 6);
    expect(Math.abs(right[2] - left[2])).toBeLessThanOrEqual(1e-6);
    // A 1 x 1 flat rung along +X, centred between the axis points, its length on the 1/16 grid; its max end is Front right's.
    const D = right[0] - left[0];
    const L = Math.floor(D * 16) / 16;
    const x0 = (left[0] + right[0]) / 2 - L / 2;
    const tenon = { id: 't-max', end: 'max' as const, diameter: 5 / 8, length: 1.25 };
    const rung = createBoard({ name: 'Rung', posture: 'flat', length: L, width: 1, thickness: 1, position: [x0, 5.5, line.p[2] - 0.5],
      tenons: [{ id: 't-min', end: 'min', diameter: 5 / 8, length: 1.25 }, tenon] });
    expect(builtTenons(rung)).toHaveLength(2);
    expect(len(cross(sub(partAxis(rung).p, line.p), line.u))).toBeLessThanOrEqual(1e-9);
    const tip: V3 = [x0 + L, 6, line.p[2]];
    const r = rungSocketRow(leg, line, [-1, 0, 0], 5 / 8, tip, TENON_STEP.imperial);
    if (typeof r === 'string') throw new Error(r);
    const row: HoleRow = { ...r, id: 'h1' };
    expect(boreAlongAxis(leg, row, line)).toBe(true);
    expect(seatedIn(rung, tenon, leg, row)).toBe(true);
    // The depth runs along the bit from the mouth to the tip, rounded UP to the step.
    const [mouth] = ends(leg, row);
    const dist = len(sub(tip, mouth));
    const depth = row.depth as number;
    expect(depth).toBeGreaterThanOrEqual(dist);
    expect(depth).toBeLessThan(dist + TENON_STEP.imperial);
    expect(Math.abs(depth / TENON_STEP.imperial - Math.round(depth / TENON_STEP.imperial))).toBeLessThanOrEqual(1e-9);
    // The leg leans, so its socket is a tilted row.
    expect(row.tiltAlong !== undefined || row.tiltAcross !== undefined).toBe(true);
  });

  const post = () => createBoard({ name: 'Post', posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [0, 0, 0] });

  it('an unleaned upright leg: a square socket (no tilt key) entering the face toward the other leg', () => {
    const leg = post();
    const x = axisFrame(leg)[0]!;
    // The other leg on −X: the line enters the X-min face.
    const fromLeft = rungSocketRow(leg, { p: [-5, 10, 0.75], u: [1, 0, 0] }, [-1, 0, 0], 0.5, [0.6, 10, 0.75], TENON_STEP.imperial);
    if (typeof fromLeft === 'string') throw new Error(fromLeft);
    expect(Object.keys(fromLeft)).not.toContain('tiltAlong');
    expect(Object.keys(fromLeft)).not.toContain('tiltAcross');
    expect([fromLeft.face, fromLeft.from]).toEqual([x.dim, x.reversed ? 'max' : 'min']);
    expect(fromLeft.depth).toBe(39 / 64);
    // The other leg on +X: the X-max face, the line given either way.
    const fromRight = rungSocketRow(leg, { p: [5, 10, 0.75], u: [-1, 0, 0] }, [1, 0, 0], 0.5, [0.9, 10, 0.75], TENON_STEP.imperial);
    if (typeof fromRight === 'string') throw new Error(fromRight);
    expect([fromRight.face, fromRight.from]).toEqual([x.dim, x.reversed ? 'min' : 'max']);
    expect(Object.keys(fromRight)).not.toContain('tiltAlong');
    expect(Object.keys(fromRight)).not.toContain('tiltAcross');
    expect(fromRight.depth).toBe(39 / 64);
  });

  it('a line 50° off the entry face\'s normal: the steep sentence', () => {
    const c = Math.cos(50 * Math.PI / 180);
    const s = Math.sin(50 * Math.PI / 180);
    const tip: V3 = [0.5 * c, 10 + 0.5 * s, 0.75];
    expect(rungSocketRow(post(), { p: [0, 10, 0.75], u: [c, s, 0] }, [-1, 0, 0], 0.5, tip, TENON_STEP.imperial))
      .toBe(socketTooSteep('Post'));
  });
});
