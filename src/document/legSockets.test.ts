import { describe, expect, it } from 'vitest';
import type { Board, HoleRow, Shape, SloydDocument, StoredBoard } from './types';
import type { V3 } from './angleCuts';
import { createBoard, createDocument, migrateDocument } from './document';
import { axisFrame } from './geometry';
import { leanMap, resultantDeg, slopeOf, sightlineDeg, worldSlopes } from './lean';
import { levelPlan } from './levelEnds';
import { levelFaces } from './leanContacts';
import { holeInstances } from './holes';
import { tiltResultantDeg, tiltSightlineDeg } from './holeTilt';
import { toWorld } from './snapPoints';
import { mapWorld } from './treeEdit';
import { worldParts } from './tree';
import { stoolDocument, stoolLegs, stoolSeat } from './stoolFixture';
import { isSocketOf, legsUnder, socketPlan, socketRow, staleSocketOf, socketStale } from './legSockets';

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

/** The leg moved down so its level top is at y = 16 (under the stool seat). */
const seated = (b: Board): Board => {
  const top = levelFaces(b).find((f) => f.up)!.y;
  return { ...b, position: [b.position[0], b.position[1] - (top - 16), b.position[2]] };
};

describe('legsUnder', () => {
  it('finds the four legs under the seat, in world order', () => {
    const doc = stoolDocument();
    expect(legsUnder(world(doc), seatOf(doc)).map((b) => b.name)).toEqual(['Front right', 'Front left', 'Back left', 'Back right']);
  });
  it('finds none under a part beside them, nor under a seat lifted off the tops, nor under a leg', () => {
    const doc = migrateDocument({ ...createDocument('S'), boards: [...stoolLegs(),
      createBoard({ name: 'Shelf', length: 10, width: 10, thickness: 1.5, posture: 'flat', position: [20, 16, -5] }),
      stoolSeat(16.5)] });
    expect(legsUnder(world(doc), named(doc, 'Shelf')[0]!)).toEqual([]);
    expect(legsUnder(world(doc), seatOf(doc))).toEqual([]);
    expect(legsUnder(world(doc), named(doc, 'Front right')[0]!)).toEqual([]);
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
    expect(legsUnder(world(doc), s0)).toHaveLength(4);
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

  it("a bore from a socket's mouth at another angle is not the socket, and is stale", () => {
    const doc0 = stoolDocument();
    const doc = bore(doc0, seatOf(doc0).id);
    const seat = seatOf(doc);
    const fr = named(doc, 'Front right')[0]!;
    const { tiltAlong: _a, tiltAcross: _c, ...square } = seat.holes.find((r) => isSocketOf(seat, r, fr))!;
    const moved = { ...seat, holes: seat.holes.map((r) => (r.id === square.id ? square : r)) };
    expect(isSocketOf(moved, square, fr)).toBe(false);
    expect(staleSocketOf(moved, fr)).toBe(square);
  });

  it("a socket that would break out is not bored, naming the leg; the others are bored", () => {
    // The seat's right edge at x = 5.2: the right legs' 1" sockets run past the length max end.
    const doc = migrateDocument({ ...createDocument('Edge'), boards: [...stoolLegs(),
      createBoard({ name: 'Seat', length: 12.2, width: 14, thickness: 1.5, posture: 'flat', position: [-7, 16, -7] })] });
    expect(legsUnder(world(doc), seatOf(doc))).toHaveLength(4);
    const p = socketPlan(doc, seatOf(doc).id, 1);
    expect(p).toMatchObject({ note: "Front right's socket would run past the length max end — move the leg, or choose a smaller diameter." });
    const after = bore(doc, seatOf(doc).id);
    const seat = seatOf(after);
    expect(seat.holes).toHaveLength(2);
    expectSockets(seat, legsOf(after).filter((b) => b.name.endsWith('left')));
  });

  it('when every socket would fault, the action refuses with the first', () => {
    const doc = migrateDocument({ ...createDocument('Edge'), boards: [...stoolLegs(),
      createBoard({ name: 'Seat', length: 10.4, width: 14, thickness: 1.5, posture: 'flat', position: [-5.2, 16, -7] })] });
    expect(legsUnder(world(doc), seatOf(doc))).toHaveLength(4);
    expect(socketPlan(doc, seatOf(doc).id, 1)).toBe("Front right's socket would run past the length max end — move the leg, or choose a smaller diameter.");
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
    // A new rake on Front right, re-levelled (a re-level keeps the old top cut's reference, so the top rises a hair) and
    // set back down onto the seat: what the user does before boring again.
    const doc2 = mapWorld(doc1, (w) => w.map((b) => (b.id === fr0.id ? seated(relevel({ ...b, lean: { ...b.lean!, z: slopeOf(10) } })) : b)));
    const fr = named(doc2, 'Front right')[0]!;
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
