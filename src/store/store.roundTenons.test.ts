import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { boardSnapPoints, createBoard, createDocument, worldParts } from '../document/document';
import { sharedOf } from '../document/links';
import { toWorld } from '../document/snapPoints';
import { builtTenons, tenonFaults } from '../document/roundTenons';
import { holeFaults } from '../document/holeFaults';
import { TENON_END_FIXED, TENON_END_TAKEN, TENON_SIZE_POSITIVE, tenonFaultText } from '../document/tenonText';
import type { Board, RoundTenon, Shape, SloydDocument, StoredBoard } from '../document/document';

/**
 * Round tenons Task 8: the store actions (spec §4). Each decides before `edit()`, writes through `mapWorld` (inv 46),
 * re-judges held points (inv 24), and never changes the part's length.
 */
const s = () => useStore.getState();
const rung = (over: Partial<Board> = {}) => createBoard({ id: 'r', name: 'Rung', length: 20, width: 1.5, thickness: 1.5, ...over });
const setup = (doc: SloydDocument = { ...createDocument('T'), boards: [rung()] }) => {
  useStore.setState({ doc, selectedIds: [], past: [], future: [], tool: 'select', grabbed: null, tapeAnchor: null, tapeHover: null, explode: 0, gesturing: false, gestureSnapshotTaken: false });
};
const stored = (i = 0) => s().doc.boards[i] as Board;
const bare = (t: RoundTenon): Omit<RoundTenon, 'id'> => { const { id: _id, ...rest } = t; return rest; };

beforeEach(() => setup());

describe('addTenon / updateTenon / removeTenon (round tenons spec §4)', () => {
  it('adds, updates and removes, one undo entry each; the part keeps its length; removal leaves NO key', () => {
    expect(s().addTenon('r', 'max', 0.75, 1)).toBeNull();
    expect(stored().tenons).toEqual([{ id: expect.any(String), end: 'max', diameter: 0.75, length: 1 }]);
    expect(stored().length).toBe(20);
    const id = stored().tenons![0]!.id;
    expect(s().updateTenon('r', id, { end: 'max', diameter: 0.75, length: 1.5 })).toBeNull();
    expect(stored().tenons![0]!.length).toBe(1.5);
    expect(stored().length).toBe(20);
    s().removeTenon('r', id);
    expect('tenons' in stored()).toBe(false);
    expect(stored().length).toBe(20);
    expect(s().past.length).toBe(3);
    s().undo(); s().undo(); s().undo();
    expect('tenons' in stored()).toBe(false);
    expect(s().past.length).toBe(0);
  });
  it('a second tenon goes in canonical order, min first', () => {
    s().addTenon('r', 'max', 0.75, 1);
    s().addTenon('r', 'min', 0.5, 1);
    expect(stored().tenons!.map((t) => t.end)).toEqual(['min', 'max']);
  });
  it('an end that already has a tenon takes no second one', () => {
    s().addTenon('r', 'max', 0.75, 1);
    expect(s().addTenon('r', 'max', 0.5, 2)).toBe(TENON_END_TAKEN);
    expect(TENON_END_TAKEN).toBe('This end already has a round tenon.');
    expect(stored().tenons).toHaveLength(1);
    expect(stored().tenons![0]!.diameter).toBe(0.75);
    expect(s().past.length).toBe(1);
  });
  it('a stale part or tenon id does nothing and returns null (the hole actions\' convention)', () => {
    expect(s().addTenon('gone', 'max', 0.75, 1)).toBeNull();
    s().addTenon('r', 'max', 0.75, 1);
    expect(s().updateTenon('r', 'gone', { end: 'max', diameter: 0.5, length: 1 })).toBeNull();
    expect(s().updateTenon('gone', stored().tenons![0]!.id, { end: 'max', diameter: 0.5, length: 1 })).toBeNull();
    s().removeTenon('r', 'gone');
    expect(stored().tenons).toHaveLength(1);
    expect(s().past.length).toBe(1);
  });
  it('an unchanged update pushes no undo entry (inv 4)', () => {
    s().addTenon('r', 'max', 0.75, 1);
    const t = stored().tenons![0]!;
    expect(s().updateTenon('r', t.id, bare(t))).toBeNull();
    expect(s().past.length).toBe(1);
  });
  it('an update never moves a tenon to the other end (one per end; the edit rule pairs tenons by end)', () => {
    s().addTenon('r', 'max', 0.75, 1);
    s().addTenon('r', 'min', 0.5, 1);
    const max = stored().tenons![1]!;
    expect(s().updateTenon('r', max.id, { ...bare(max), end: 'min', diameter: 0.6 })).toBe(TENON_END_FIXED);
    expect(TENON_END_FIXED).toBe("A round tenon can't change ends — remove it and add one at the other end.");
    expect(stored().tenons!.map((t) => [t.end, t.diameter])).toEqual([['min', 0.5], ['max', 0.75]]);
    expect(s().past.length).toBe(2);
  });
  it('a non-positive or non-finite size is never stored (the loader would drop it)', () => {
    expect(TENON_SIZE_POSITIVE).toBe("A round tenon's diameter and length must be more than zero.");
    expect(s().addTenon('r', 'max', 0, 1)).toBe(TENON_SIZE_POSITIVE);
    expect(s().addTenon('r', 'max', 0.75, -1)).toBe(TENON_SIZE_POSITIVE);
    expect(s().addTenon('r', 'max', Number.NaN, 1)).toBe(TENON_SIZE_POSITIVE);
    expect('tenons' in stored()).toBe(false);
    s().addTenon('r', 'max', 0.75, 1);
    const t = stored().tenons![0]!;
    expect(s().updateTenon('r', t.id, { ...bare(t), length: Number.POSITIVE_INFINITY })).toBe(TENON_SIZE_POSITIVE);
    expect(s().updateTenon('r', t.id, { ...bare(t), diameter: 0 })).toBe(TENON_SIZE_POSITIVE);
    expect(s().past.length).toBe(1);
    expect(stored().tenons![0]!.length).toBe(1);
  });
  it('is refused while exploded (inv 47)', () => {
    s().setExplode(0.5);
    expect(s().addTenon('r', 'max', 0.75, 1)).toBeNull();
    expect('tenons' in stored()).toBe(false);
    s().setExplode(0);
    s().addTenon('r', 'max', 0.75, 1);
    const id = stored().tenons![0]!.id;
    const before = s().past.length;
    s().setExplode(0.5);
    // Refused at entry, before any decision: not even a fault sentence comes back.
    expect(s().updateTenon('r', id, { end: 'max', diameter: 1.5, length: 2 })).toBeNull();
    s().updateTenon('r', id, { end: 'max', diameter: 0.75, length: 2 });
    s().removeTenon('r', id);
    expect(stored().tenons).toEqual([{ id, end: 'max', diameter: 0.75, length: 1 }]);
    expect(s().past.length).toBe(before);
  });
  it('is refused while gesturing (Global Constraints)', () => {
    s().addTenon('r', 'max', 0.75, 1);
    const id = stored().tenons![0]!.id;
    s().beginGesture();
    expect(s().addTenon('r', 'min', 0.75, 1)).toBeNull();
    expect(s().updateTenon('r', id, { end: 'max', diameter: 1.5, length: 2 })).toBeNull();
    s().updateTenon('r', id, { end: 'max', diameter: 0.75, length: 2 });
    s().removeTenon('r', id);
    s().endGesture();
    expect(stored().tenons).toEqual([{ id, end: 'max', diameter: 0.75, length: 1 }]);
    expect(s().past.length).toBe(1);
  });
  it('an add is refused on any fault: too-wide, with its fault text, before any mutation', () => {
    expect(s().addTenon('r', 'max', 1.5, 1)).toBe(tenonFaultText({ kind: 'too-wide' }));
    expect(s().addTenon('r', 'max', 1.5, 1)).toBe("A round tenon must be narrower than the part's section.");
    expect('tenons' in stored()).toBe(false);
    expect(s().past.length).toBe(0);
  });
  it('an add is refused when it would meet a feature (a hole in the zone)', () => {
    setup({ ...createDocument('T'), boards: [rung({ holes: [{ id: 'h', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.5, along: 'length', alongFrom: 'max', station: 0.5, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.75 }] })] });
    expect(s().addTenon('r', 'max', 0.75, 1)).toBe('The tenon would run into a hole — move it or remove it first.');
    expect('tenons' in stored()).toBe(false);
    // The other end is clear.
    expect(s().addTenon('r', 'min', 0.75, 1)).toBeNull();
  });
  it('an edit that ADDS too-long is refused, the stored tenon unchanged', () => {
    s().addTenon('r', 'min', 0.75, 1);
    s().addTenon('r', 'max', 0.75, 1);
    const max = stored().tenons![1]!;
    expect(s().updateTenon('r', max.id, { ...bare(max), length: 19 })).toBe('The tenons would meet — shorten one.');
    expect(stored().tenons![1]!.length).toBe(1);
    expect(s().past.length).toBe(2);
    // 18 leaves 1" between the shoulders: accepted.
    expect(s().updateTenon('r', max.id, { ...bare(max), length: 18 })).toBeNull();
  });
  it('an add that would meet the other end\'s tenon is refused (too-long, judged against the stored other end)', () => {
    s().addTenon('r', 'min', 0.75, 12);
    expect(s().addTenon('r', 'max', 0.75, 8)).toBe('The tenons would meet — shorten one.');
    expect(stored().tenons).toHaveLength(1);
  });
  it('a resize that causes a fault KEEPS the tenon; an edit that adds no fault is still taken, one that adds one is not', () => {
    s().addTenon('r', 'min', 0.75, 1);
    s().addTenon('r', 'max', 0.75, 1);
    s().updateBoard('r', { width: 0.5 });
    expect(stored().tenons).toHaveLength(2); // kept, too-wide now
    const max = stored().tenons![1]!;
    // Lengthening keeps its (kept) too-wide fault and adds none: taken.
    expect(s().updateTenon('r', max.id, { ...bare(max), length: 2 })).toBeNull();
    expect(stored().tenons![1]!.length).toBe(2);
    // A diameter that is still too wide adds nothing either: taken.
    expect(s().updateTenon('r', max.id, { ...bare(stored().tenons![1]!), diameter: 0.6 })).toBeNull();
    expect(stored().tenons![1]!.diameter).toBe(0.6);
    // But an edit that ADDS too-long is refused.
    expect(s().updateTenon('r', max.id, { ...bare(stored().tenons![1]!), length: 19 })).toBe('The tenons would meet — shorten one.');
    expect(stored().tenons![1]!.length).toBe(2);
  });
  it('re-judges held points (inv 24): a grabbed end-face corner the tenon cuts away is dropped', () => {
    // Flat rung, length on X: the max end's corner at (20, 0, 0).
    const corner = boardSnapPoints(stored()).find((p) => p.at.every((v, i) => Math.abs(v - [20, 0, 0][i]!) < 1e-9))!;
    expect(corner).toBeDefined();
    s().grabSnapPoint(corner);
    expect(s().grabbed).not.toBeNull();
    s().addTenon('r', 'max', 0.75, 1);
    expect(s().grabbed).toBeNull();
  });
  it('a tenon added to a part inside an assembly is written to the definition', () => {
    setup({
      ...createDocument('T'), boards: [],
      instances: [{ id: 'i', name: 'Frame', definition: 'd', position: [0, 0, 0], rotation: 0 }],
      definitions: [{ id: 'd', boards: [rung({ id: 'a', name: 'A' }) as StoredBoard], instances: [], hardware: [] }],
    });
    expect(s().addTenon('i/a', 'max', 0.75, 1)).toBeNull();
    expect((s().doc.definitions[0]!.boards[0] as Board).tenons).toEqual([{ id: expect.any(String), end: 'max', diameter: 0.75, length: 1 }]);
    expect(worldParts(s().doc).find((b) => b.id === 'i/a')!.tenons).toHaveLength(1);
    s().removeTenon('i/a', (s().doc.definitions[0]!.boards[0] as Board).tenons![0]!.id);
    expect('tenons' in s().doc.definitions[0]!.boards[0]!).toBe(false);
  });
});

describe('a linked leg: the tenon is written once, on the Shape (inv 45)', () => {
  const leg = createBoard({ id: 'x', name: 'Leg', length: 17, width: 1.5, thickness: 1.5, posture: 'upright' });
  const doc = (): SloydDocument => ({
    ...createDocument('T'),
    shapes: [{ id: 's1', ...sharedOf(leg) } as Shape],
    boards: [
      { id: 'a', name: 'Leg 1', position: [0, 0, 0], rotation: 0, shape: 's1' },
      { id: 'b', name: 'Leg 2', position: [10, 0, 0], rotation: 0, shape: 's1' },
    ],
  });
  it('adds through one user; the Shape holds it, no user record carries a key, every user resolves with it', () => {
    setup(doc());
    expect(s().addTenon('a', 'max', 0.75, 1)).toBeNull();
    expect(s().doc.shapes[0]!.tenons).toEqual([{ id: expect.any(String), end: 'max', diameter: 0.75, length: 1 }]);
    for (const b of s().doc.boards) expect('tenons' in b).toBe(false);
    expect(worldParts(s().doc).find((p) => p.id === 'b')!.tenons).toEqual(s().doc.shapes[0]!.tenons);
    expect(s().doc.shapes[0]!.length).toBe(17);
    expect(s().past.length).toBe(1);
    s().removeTenon('b', s().doc.shapes[0]!.tenons![0]!.id);
    expect('tenons' in s().doc.shapes[0]!).toBe(false);
    expect(worldParts(s().doc).every((p) => !('tenons' in p))).toBe(true);
  });
});

describe('a MIRRORED Shape mate: the tenon\'s end flips in the world (ledger ⚠️)', () => {
  // A flat chiral rung along X (mirrorDim 'length'): a tenon on one end only. r1 plain at x 0..10, r2 mirrored at x 20..30.
  const base = createBoard({ id: 'x', name: 'Rung', length: 10, width: 1.5, thickness: 1.5 });
  const doc = (): SloydDocument => ({
    ...createDocument('T'),
    shapes: [{ id: 's1', ...sharedOf(base) } as Shape],
    boards: [
      { id: 'r1', name: 'Rung', position: [0, 0, 0], rotation: 0, shape: 's1' },
      { id: 'r2', name: 'Rung 2', position: [20, 0, 0], rotation: 0, shape: 's1', mirrored: true },
    ],
  });
  const occ = (id: string) => worldParts(s().doc).find((b) => b.id === id)!;
  const shape = () => s().doc.shapes[0]!;
  /** The world X of the end a part's (only) tenon sits on: where the axis meets that end. */
  const tenonX = (id: string) => {
    const b = occ(id);
    expect(b.tenons).toHaveLength(1);
    const t = b.tenons![0]!;
    return toWorld(b, { length: t.end === 'max' ? b.length : 0, width: b.width / 2, thickness: b.thickness / 2 })[0];
  };

  it('addTenon on the plain user writes the Shape once; the mirrored user resolves with the end flipped', () => {
    setup(doc());
    expect(s().addTenon('r1', 'max', 0.75, 1)).toBeNull();
    expect(shape().tenons!.map((t) => t.end)).toEqual(['max']);
    expect(s().past.length).toBe(1);
    expect(occ('r1').tenons![0]!.end).toBe('max');
    expect(occ('r2').tenons![0]!.end).toBe('min');
    expect(tenonX('r1')).toBe(10);
    expect(tenonX('r2')).toBe(20);
  });
  it('addTenon on the MIRRORED user stores the opposite end on the Shape', () => {
    setup(doc());
    expect(s().addTenon('r2', 'max', 0.75, 1)).toBeNull();
    expect(shape().tenons!.map((t) => t.end)).toEqual(['min']);
    expect(tenonX('r2')).toBe(30);
    expect(tenonX('r1')).toBe(0);
    // A second, at the mirrored user's world min: the Shape's max; canonical order kept.
    expect(s().addTenon('r2', 'min', 0.5, 1)).toBeNull();
    expect(shape().tenons!.map((t) => [t.end, t.diameter])).toEqual([['min', 0.75], ['max', 0.5]]);
  });
  it('updateTenon and removeTenon from the mirrored user\'s side reach the Shape\'s tenon, at the right world end', () => {
    setup(doc());
    s().addTenon('r1', 'max', 0.75, 1);
    const w = occ('r2').tenons![0]!;
    expect(w.end).toBe('min');
    expect(s().updateTenon('r2', w.id, { end: 'min', diameter: 0.75, length: 2 })).toBeNull();
    expect(shape().tenons).toEqual([{ id: w.id, end: 'max', diameter: 0.75, length: 2 }]);
    expect(occ('r1').tenons![0]).toMatchObject({ end: 'max', length: 2 });
    expect(tenonX('r1')).toBe(10);
    expect(tenonX('r2')).toBe(20);
    s().removeTenon('r2', w.id);
    expect('tenons' in shape()).toBe(false);
    expect('tenons' in occ('r1')).toBe(false);
    expect('tenons' in occ('r2')).toBe(false);
    expect(s().past.length).toBe(3);
  });
});

describe('a hole added after the tenon (final review M2, ruling TFa; inv 58: a later feature\'s fault is KEPT and noted)', () => {
  // The reviewer's leg: 28" × 1 3/4", a top tenon 1 1/2" long (shoulder at 26.5), a 5/8" through bore across the width.
  const legWith = () => setup({ ...createDocument('T'), boards: [createBoard({ id: 'L', name: 'Leg', length: 28, width: 1.75, thickness: 1.75, tenons: [{ id: 't', end: 'max', diameter: 1, length: 1.5 }] })] });
  const bore = (station: number) => ({ face: 'width' as const, from: 'min' as const, diameter: 0.625, depth: 'through' as const, along: 'length' as const, alongFrom: 'min' as const, station, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 0.875 });
  it('a bore whose edge lies on the shoulder is taken with no fault of its own, and the tenon still builds', () => {
    legWith();
    expect(s().addHoleRows('L', [bore(26.1875)])).toBeNull();
    const b = stored();
    expect(b.holes).toHaveLength(1);
    expect(holeFaults(b, b.holes[0]!)).toEqual([]); // no "runs into a curve cut" (the Holes panel offers the add)
    expect(tenonFaults(b, b.tenons![0]!)).toEqual([]);
    expect(builtTenons(b)).toHaveLength(1);
  });
  it('a bore inside the zone is taken; the tenon is KEPT with its meets-feature fault and builds nothing', () => {
    legWith();
    expect(s().addHoleRows('L', [bore(27.25)])).toBeNull();
    const b = stored();
    expect(holeFaults(b, b.holes[0]!)).toEqual([]);
    expect(b.tenons).toHaveLength(1); // kept, never removed or clamped
    expect(tenonFaults(b, b.tenons![0]!)).toEqual([{ kind: 'meets-feature', feature: 'hole' }]);
    expect(builtTenons(b)).toEqual([]);
    expect(s().past.length).toBe(1);
  });
});
