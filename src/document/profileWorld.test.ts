import { describe, expect, it } from 'vitest';
import type { Board, Posture, ProfileCut, ProfileEnd, ProfileSide, Rotation } from './document';
import { createBoard, createDocument, migrateDocument } from './document';
import { axisFrame, boardExtents } from './geometry';
import { canonicalRun, endPos, profileValues, runDim, sameProfile } from './profiles';
import { toWorld } from './snapPoints';
import { chiralPart } from './turnFixtures';
import { DIRS } from './taperWorld';
import type { Dir } from './taperWorld';
import type { WorldProfile } from './generated';
import { profilesFor, sameWorldProfile, worldProfiles } from './profileWorld';

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
type Profile = Omit<ProfileCut, 'id'>;

const W_MAX: ProfileSide = { across: 'width', from: 'max' };
const W_MIN: ProfileSide = { across: 'width', from: 'min' };
const L_MIN: ProfileSide = { across: 'length', from: 'min' };
const thr = (side: ProfileSide, through: 'min' | 'max'): ProfileEnd => ({ side: { ...side }, through });
const st = (side: ProfileSide, from: 'min' | 'max', at: number): ProfileEnd => ({ side: { ...side }, from, at });
/** chiralPart is 20 (length) x 6 (width) x 1.5. */
const DIMS = { length: 20, width: 6, thickness: 1.5 };
const run = (face: 'min' | 'max', start: ProfileEnd, end: ProfileEnd) => canonicalRun(DIMS, face, { start, end });

/** Every kind, both facings, through/through, station/through measured from min AND from max (each from its NEARER end),
 *  a station/station run, a whole-mm station, and a loop. Overlaps are allowed: strict faults are not this module's. */
const PROFILES: Profile[] = [
  { face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face', run: run('max', thr(W_MAX, 'min'), thr(W_MAX, 'max')) },
  { face: 'min', kind: 'cove', size: 0.375, fillet: 0, facing: 'face', run: run('min', st(L_MIN, 'min', 1), st(L_MIN, 'max', 1.5)) },
  { face: 'max', kind: 'ogee', size: 0.5, fillet: 0.0625, facing: 'edge', run: run('max', thr(W_MIN, 'min'), st(W_MIN, 'max', 3)) },
  { face: 'min', kind: 'thumbnail', size: 0.5, depth: 0.25, facing: 'edge', run: run('min', st(W_MAX, 'min', 2), thr(W_MAX, 'max')) },
  { face: 'min', kind: 'roundover', size: 0.25, fillet: 1 / 16, facing: 'edge', run: run('min', thr(W_MIN, 'min'), st(W_MIN, 'max', 32 / 25.4)) },
  { face: 'max', kind: 'thumbnail', size: 0.75, depth: 0.375, facing: 'face', run: run('max', thr(L_MIN, 'min'), thr(L_MIN, 'max')) },
  { face: 'max', kind: 'bead', size: 0.125, fillet: 1 / 32, facing: 'face', run: { loop: true } },
];
const profiled = (posture: Posture, rotation: Rotation, ps: Profile[] = PROFILES): Board => ({
  ...chiralPart(posture), cuts: [], rotation, position: [3, 5, 7],
  profiles: ps.map((p, i) => ({ id: `p${i}`, ...p })),
});
const poses = () => POSTURES.flatMap((p) => TURNS.map((t) => profiled(p, t)));

const exactOf = (ws: WorldProfile[]) => new Set(ws.flatMap((w) => [w.size, w.fillet, w.depth, w.start, w.end]));
const store = (b: Board, ws: readonly WorldProfile[], exact?: ReadonlySet<number>): Profile[] => {
  const r = profilesFor(b, ws, exact);
  if ('fault' in r) throw new Error(r.fault);
  return r.profiles;
};
const faultOf = (b: Board, ws: readonly WorldProfile[], exact?: ReadonlySet<number>): string => {
  const r = profilesFor(b, ws, exact);
  if (!('fault' in r)) throw new Error(`no fault: ${JSON.stringify(r.profiles)}`);
  return r.fault;
};
const byValue = (ps: readonly Profile[]) => ps.map(profileValues).sort();

/** Flat, turn 0: length on +x, thickness on +y (broad faces ±y), width on +z. 24 x 5.5 x 0.75 by default. */
const flat = (over: Partial<Board> = {}) => createBoard({ position: [1, 2, 3], ...over });
const W = (over: Partial<WorldProfile> = {}): WorldProfile => ({
  edge: ['+y', '+z'], kind: 'roundover', size: 0.25, fillet: 0, depth: 0, facing: 'face', allRound: false, start: 0, end: 24, ...over,
});

describe('worldProfiles / profilesFor round trip (AI-profiles spec §3.2–3.3), every posture × turn', () => {
  it('flat turn 0 is the frame the fixed-word tests below assume', () => {
    expect(axisFrame(flat()).map((a) => `${a.dim}${a.reversed ? '-' : '+'}`)).toEqual(['length+', 'thickness+', 'width+']);
  });

  it('every profile comes back exactly (stored fields, nearer-end stations) and sameWorldProfile', () => {
    for (const b of poses()) {
      const ws = worldProfiles(b)!;
      expect(ws).toHaveLength(PROFILES.length);
      const back = store(b, ws, exactOf(ws));
      expect(byValue(back), `${b.posture} ${b.rotation}`).toEqual(byValue(PROFILES));
      for (const p of PROFILES) expect(back.some((q) => sameWorldProfile(p, q, b))).toBe(true);
    }
  });

  it('comes back exactly WITHOUT the exact set too (every fixture number is on the hole grid)', () => {
    for (const b of poses()) expect(byValue(store(b, worldProfiles(b)!))).toEqual(byValue(PROFILES));
  });

  it('places the broad face, the side and every station where the stored profile is (oracle: toWorld)', () => {
    for (const b of poses()) {
      const ext = boardExtents(b);
      const mid = { length: b.length / 2, width: b.width / 2, thickness: b.thickness / 2 };
      /** World offset from the part's corner of a local point at `dim`'s `from` face. */
      const faceAt = (dim: 'length' | 'width' | 'thickness', from: 'min' | 'max', axis: number) =>
        toWorld(b, { ...mid, [dim]: from === 'min' ? 0 : b[dim] })[axis]! - b.position[axis]!;
      const planeOf = (d: Dir) => (d[0] === '+' ? ext['xyz'.indexOf(d[1]!)]! : 0);
      for (const p of PROFILES) {
        const w = worldProfiles({ ...b, profiles: [{ id: 'x', ...p }] })![0]!;
        const [face, side] = w.edge as [Dir, Dir];
        expect(faceAt('thickness', p.face, 'xyz'.indexOf(face[1]!))).toBeCloseTo(planeOf(face), 9);
        if ('loop' in p.run) { expect(w.allRound).toBe(true); continue; }
        const s = p.run.start.side;
        expect(faceAt(s.across, s.from, 'xyz'.indexOf(side[1]!))).toBeCloseTo(planeOf(side), 9);
        const rd = runDim(s);
        const axis = axisFrame(b).findIndex((a) => a.dim === rd);
        const ends = [p.run.start, p.run.end].map((e) => toWorld(b, { ...mid, [rd]: endPos(b, e) })[axis]! - b.position[axis]!).sort((x, y) => x - y);
        expect(w.start).toBeCloseTo(ends[0]!, 9);
        expect(w.end).toBeCloseTo(ends[1]!, 9);
      }
    }
  });

  it('a station stored from its FARTHER end is the same world profile, not the same stored profile (B1)', () => {
    for (const b of poses()) {
      const far: Profile = { face: 'max', kind: 'cove', size: 0.25, fillet: 0, facing: 'face', run: run('max', thr(W_MAX, 'min'), st(W_MAX, 'min', 17)) };
      const near: Profile = { ...far, run: run('max', thr(W_MAX, 'min'), st(W_MAX, 'max', 3)) };
      expect(sameProfile(far, near)).toBe(false);
      expect(sameWorldProfile(far, near, b)).toBe(true);
      const back = store(b, worldProfiles({ ...b, profiles: [{ id: 'f', ...far }] })!);
      expect(back).toHaveLength(1);
      expect(sameProfile(back[0]!, near)).toBe(true);
      // A different station is not the same world profile.
      expect(sameWorldProfile(far, { ...near, run: run('max', thr(W_MAX, 'min'), st(W_MAX, 'max', 3.5)) }, b)).toBe(false);
    }
  });

  it('sameWorldProfile ignores a loop\'s side and ends but not its face, and tells kinds and facings apart', () => {
    const b = profiled('upright', 90);
    const loop = PROFILES[6]!;
    expect(sameWorldProfile(loop, { ...loop }, b)).toBe(true);
    expect(sameWorldProfile(loop, { ...loop, face: 'min' }, b)).toBe(false);
    expect(sameWorldProfile(PROFILES[2]!, { ...PROFILES[2]!, facing: 'face' }, b)).toBe(false);
    expect(sameWorldProfile(PROFILES[0]!, { ...PROFILES[0]!, kind: 'cove' }, b)).toBe(false);
  });

  it('worldProfiles is null for a part with a run whose ends are on two sides; sameWorldProfile is false for one', () => {
    const twoSide: Profile = { face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face', run: { start: thr(W_MAX, 'min'), end: thr(L_MIN, 'max') } };
    const b = profiled('flat', 0, [PROFILES[0]!, twoSide]);
    expect(worldProfiles(b)).toBeNull();
    expect(worldProfiles(profiled('flat', 0, [PROFILES[0]!]))).toHaveLength(1);
    expect(sameWorldProfile(twoSide, twoSide, b)).toBe(false);
  });

  it('worldProfiles writes the ignored fields as 0, edge as [broad face, side], start <= end, and sorts canonically', () => {
    const b = flat();
    const ws = worldProfiles({ ...b, profiles: [
      { id: 'a', face: 'max', kind: 'thumbnail', size: 0.5, depth: 0.25, facing: 'edge', run: canonicalRun(b, 'max', { start: st(W_MAX, 'max', 3), end: thr(W_MAX, 'min') }) },
      { id: 'b', face: 'min', kind: 'cove', size: 0.25, fillet: 0, facing: 'face', run: { loop: true } },
    ] })!;
    expect(ws).toEqual([
      { edge: ['+y', '+z'], kind: 'thumbnail', size: 0.5, fillet: 0, depth: 0.25, facing: 'edge', allRound: false, start: 0, end: 21 },
      { edge: ['-y', '+x'], kind: 'cove', size: 0.25, fillet: 0, depth: 0, facing: 'face', allRound: true, start: 0, end: 0 },
    ]);
  });
});

describe('profilesFor: ends (Global Constraints; spec §2.1, R6.2)', () => {
  const ends = (w: Partial<WorldProfile>, exact?: ReadonlySet<number>, b = flat()) => {
    const p = store(b, [W(w)], exact)[0]!;
    if ('loop' in p.run) throw new Error('loop');
    // In the order they sit along the run (the stored order is canonicalRun's travel order, pinned elsewhere).
    return [p.run.start, p.run.end].sort((x, y) => endPos(b, x) - endPos(b, y));
  };
  const T = (through: 'min' | 'max'): ProfileEnd => ({ side: { across: 'width', from: 'max' }, through });
  const S = (from: 'min' | 'max', at: number): ProfileEnd => ({ side: { across: 'width', from: 'max' }, from, at });

  it('start 0, end <extent> with both values in the exact set are THROUGH ends (Review Focus 2, R6.2)', () => {
    expect(ends({ start: 0, end: 24 }, new Set([0, 24, 0.25]))).toEqual([T('min'), T('max')]);
    expect(ends({ start: 0, end: 24 })).toEqual([T('min'), T('max')]);
  });

  it('within 1/32in of an end is THROUGH for a new value, a station for an exact one', () => {
    expect(ends({ start: 0, end: 24 - 1 / 64 })).toEqual([T('min'), T('max')]);
    expect(ends({ start: 0, end: 24 - 1 / 64 }, new Set([24 - 1 / 64]))).toEqual([T('min'), S('max', 1 / 64)]);
    expect(ends({ start: 1 / 32, end: 24 })).toEqual([T('min'), T('max')]);
    expect(ends({ start: 1 / 32, end: 24 }, new Set([1 / 32]))).toEqual([S('min', 1 / 32), T('max')]);
    // Just past the tolerance is a station.
    expect(ends({ start: 3 / 64, end: 24 })).toEqual([S('min', 3 / 64), T('max')]);
  });

  it('a stop 3in from the max end of a 24in edge stores from max, at 3; from the nearer end on a reversed axis too', () => {
    expect(ends({ start: 0, end: 21 })).toEqual([T('min'), S('max', 3)]);
    expect(ends({ start: 3, end: 24 })).toEqual([S('min', 3), T('max')]);
    // Turned 180: length runs toward -x, so world 21 is 3 from the part's MIN end; the world-min THROUGH end is the part's max.
    const turned = flat({ rotation: 180 });
    expect(axisFrame(turned)[0]).toEqual({ dim: 'length', reversed: true });
    const p = store(turned, [W({ edge: ['+y', '-z'], start: 0, end: 21 })])[0]!;
    expect(p.run).toEqual(canonicalRun(turned, 'max', { start: { side: { across: 'width', from: 'max' }, through: 'max' }, end: { side: { across: 'width', from: 'max' }, from: 'min', at: 3 } }));
  });

  it('the middle ties to min', () => {
    expect(ends({ start: 0, end: 12 })).toEqual([T('min'), S('min', 12)]);
  });

  it('a station snaps to the hole grid from its own end (a whole mm from the far end stays a whole mm)', () => {
    expect(ends({ start: 0, end: 24 - 37 / 25.4 })).toEqual([T('min'), S('max', 37 / 25.4)]);
    expect(ends({ start: 2.003, end: 24 })).toEqual([S('min', 2), T('max')]);
    expect(ends({ start: 2.01, end: 24 })).toEqual([S('min', 51 / 25.4), T('max')]);
    // An exact value keeps its number (computed distance off the grid by more than float noise).
    expect(ends({ start: 2.01, end: 24 }, new Set([2.01]))).toEqual([S('min', 2.01), T('max')]);
  });

  it('a reversed or zero-length station run stores (not a shape fault): canonicalRun orders it', () => {
    expect(store(flat(), [W({ start: 10, end: 5 })])).toEqual(store(flat(), [W({ start: 5, end: 10 })]));
    expect(store(flat(), [W({ start: 24, end: 0 })])).toEqual(store(flat(), [W({ start: 0, end: 24 })]));
    expect(ends({ start: 5, end: 5 })).toEqual([S('min', 5), S('min', 5)]);
  });

  it('a loop ignores start and end (even non-finite) and the side', () => {
    const a = store(flat(), [W({ allRound: true, start: Number.NaN, end: -40 })]);
    expect(a).toEqual([{ face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face', run: { loop: true } }]);
    expect(store(flat(), [W({ allRound: true, edge: ['-x', '+y'] })])).toEqual(a);
  });
});

describe('profilesFor: fields and order', () => {
  it('maps edge in either order to face and side, the side\'s run in canonical order', () => {
    const a = store(flat(), [W({ edge: ['-y', '-x'], start: 1, end: 4 })]);
    expect(a).toEqual(store(flat(), [W({ edge: ['-x', '-y'], start: 1, end: 4 })]));
    expect(a[0]).toEqual({
      face: 'min', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face',
      run: canonicalRun(flat(), 'min', { start: { side: { across: 'length', from: 'min' }, from: 'min', at: 1 }, end: { side: { across: 'length', from: 'min' }, from: 'max', at: 1.5 } }),
    });
  });

  it('snaps size, fillet and depth to the hole grid unless exact', () => {
    const [p] = store(flat(), [W({ kind: 'thumbnail', size: 0.26, depth: 0.126, facing: 'edge' })]);
    expect(p).toMatchObject({ size: 17 / 64, depth: 0.125 });
    const [q] = store(flat(), [W({ kind: 'thumbnail', size: 0.26, depth: 0.126, facing: 'edge' })], new Set([0.26, 0.126]));
    expect(q).toMatchObject({ size: 0.26, depth: 0.126 });
    expect(store(flat(), [W({ size: 0.197, fillet: 0.03 })])[0]).toMatchObject({ size: 5 / 25.4, fillet: 2 / 64 });
  });

  it('drops the fields a kind ignores, as the loader stores them, without judging them', () => {
    const [t] = store(flat(), [W({ kind: 'thumbnail', size: 0.5, depth: 0.25, fillet: -1, facing: 'edge' })]);
    expect('fillet' in t!).toBe(false);
    expect(t!.depth).toBe(0.25);
    const [r] = store(flat(), [W({ depth: -5 })]);
    expect('depth' in r!).toBe(false);
    expect(r!.fillet).toBe(0);
    // A symmetric kind's facing is 'face'; a fillet makes a roundover asymmetric, so its facing is kept.
    expect(store(flat(), [W({ facing: 'edge' })])[0]!.facing).toBe('face');
    expect(store(flat(), [W({ facing: 'edge', fillet: 1 / 16 })])[0]!.facing).toBe('edge');
    expect(store(flat(), [W({ kind: 'ogee', facing: 'edge' })])[0]!.facing).toBe('edge');
  });

  it('sorts in PROFILE_FIELDS order, whatever order the model wrote', () => {
    const entries = [
      W({ kind: 'cove', start: 1, end: 3 }), W({ edge: ['-y', '+z'], kind: 'cove' }), W({ size: 0.5 }), W({ start: 5, end: 9 }),
      W({ allRound: true }), W({ kind: 'bead', fillet: 1 / 32 }), W(),
    ];
    const a = store(flat(), entries);
    const keys = a.map(profileValues);
    expect(store(flat(), [...entries].reverse()).map(profileValues)).toEqual(keys);
    expect(a.map((p) => `${p.face} ${p.kind} ${p.size}`)).toEqual([
      'max bead 0.25', 'max cove 0.25', 'max roundover 0.25', 'max roundover 0.25', 'max roundover 0.25', 'max roundover 0.5', 'min cove 0.25',
    ]);
    // Among the three 0.25 roundovers: the loop first, then by their first end (a station run's start is its canonical,
    // travel-order start: on face max, side width max, the run travels toward length min, so 5..9 starts at 9).
    const rounds = a.filter((p) => p.kind === 'roundover' && p.size === 0.25);
    expect(rounds.map((p) => ('loop' in p.run ? 'loop' : JSON.stringify(p.run.start)))).toEqual([
      'loop', JSON.stringify({ side: { across: 'width', from: 'max' }, from: 'min', at: 9 }), JSON.stringify({ side: { across: 'width', from: 'max' }, through: 'min' }),
    ]);
  });

  it('every stored profile survives the loader unchanged, in order (B3)', () => {
    for (const b of poses()) {
      const stored = store(b, worldProfiles(b)!);
      const raw = JSON.parse(JSON.stringify({ ...createDocument('T'), boards: [{ ...b, profiles: stored.map((p, i) => ({ id: `q${i}`, ...p })) }] }));
      const loaded = (migrateDocument(raw).boards[0] as Board).profiles;
      expect(loaded.map(profileValues)).toEqual(stored.map(profileValues));
    }
  });
});

describe('profilesFor: shape faults (the loader\'s drop rules, R6.5 and the edge rules)', () => {
  const b = flat();
  it('an edge with no broad face names the broad faces (R6.5)', () => {
    expect(faultOf(b, [W({ edge: ['+x', '+z'] })])).toBe('has a profile on +x/+z, but its broad faces are +y and -y');
    // Upright: width on x, length on y, thickness on z.
    expect(faultOf(flat({ posture: 'upright' }), [W({ edge: ['+y', '+x'] })])).toBe('has a profile on +y/+x, but its broad faces are +z and -z');
  });
  it('two broad faces (opposite faces, or one named twice) meet at no edge — the side-not-perpendicular case', () => {
    expect(faultOf(b, [W({ edge: ['+y', '-y'] })])).toBe('has a profile on +y/-y, two broad faces that meet at no edge; an edge is one broad face (+y or -y) and one side');
    expect(faultOf(b, [W({ edge: ['+y', '+y'] })])).toMatch(/^has a profile on \+y\/\+y, two broad faces/);
  });
  it('an edge of other than two faces', () => {
    expect(faultOf(b, [W({ edge: ['+y'] })])).toBe('has a profile on +y, but an edge is two faces: one broad face (+y or -y) and one side');
    expect(faultOf(b, [W({ edge: ['+y', '+z', '+x'] })])).toMatch(/^has a profile on \+y\/\+z\/\+x, but an edge is two faces/);
    expect(faultOf(b, [W({ allRound: true, edge: ['+y'] })])).toMatch(/but an edge is two faces/);
  });
  it('a direction that is not one', () => {
    expect(faultOf(b, [W({ edge: ['+y', 'up' as Dir] })])).toBe('has a profile on +y/up, which is not a pair of directions');
  });
  it('an unknown kind or facing (direct callers; the schema enums stop the model)', () => {
    expect(faultOf(b, [W({ kind: 'chamfer' as WorldProfile['kind'] })])).toMatch(/of kind chamfer, which is not a profile kind$/);
    expect(faultOf(b, [W({ facing: 'side' as WorldProfile['facing'] })])).toMatch(/facing side, which is neither face nor edge$/);
  });
  it('a size not above 0, after the grid', () => {
    expect(faultOf(b, [W({ size: 0 })])).toBe('has a profile on +y/+z whose size (0) is not above 0');
    expect(faultOf(b, [W({ size: -0.25 })])).toMatch(/whose size \(-0.25\) is not above 0$/);
    expect(faultOf(b, [W({ size: 0.001 })])).toMatch(/whose size \(0\) is not above 0$/); // the value judged: 0.001 snaps to 0
    expect(store(b, [W({ size: 0.001 })], new Set([0.001]))[0]!.size).toBe(0.001);
  });
  it('a number that is not finite, or snaps to one', () => {
    expect(faultOf(b, [W({ size: Number.NaN })])).toBe('has a profile on +y/+z with a number that is not finite');
    expect(faultOf(b, [W({ fillet: Number.POSITIVE_INFINITY })])).toMatch(/not finite$/);
    expect(faultOf(b, [W({ end: Number.NaN })])).toMatch(/not finite$/);
    expect(faultOf(b, [W({ size: 1e308 })])).toBe('has a profile on +y/+z with a number too large to store');
    expect(faultOf(b, [W({ start: 1e308 })])).toBe('has a profile on +y/+z with a number too large to store');
  });
  it('a thumbnail depth not inside (0, size)', () => {
    const t = (depth: number, size = 0.5) => W({ kind: 'thumbnail', size, depth, facing: 'edge' });
    expect(faultOf(b, [t(0.5)])).toBe('has a profile on +y/+z whose depth (0.5) is not above 0 and below its size (0.5)');
    expect(faultOf(b, [t(0.75)])).toMatch(/depth \(0.75\)/);
    expect(faultOf(b, [t(0)])).toMatch(/depth \(0\)/);
    expect(faultOf(b, [t(-0.25)])).toMatch(/depth \(-0.25\)/);
    expect(faultOf(b, [t(0.001)])).toMatch(/depth \(0\) is not above 0 and below its size \(0.5\)$/);
    // 0.4999 is below the size, but snaps to it: judged on the stored value.
    expect(faultOf(b, [t(0.4999)])).toBe('has a profile on +y/+z whose depth (0.5) is not above 0 and below its size (0.5)');
    expect(store(b, [t(0.4999)], new Set([0.4999]))[0]!.depth).toBe(0.4999);
  });
  it('a negative fillet; a bead with no quirk', () => {
    expect(faultOf(b, [W({ fillet: -0.0625 })])).toBe('has a profile on +y/+z whose fillet (-0.0625) is negative');
    expect(faultOf(b, [W({ kind: 'bead', fillet: 0 })])).toBe('has a profile on +y/+z whose fillet (0) is not above 0; a bead\'s quirk must be');
    expect(faultOf(b, [W({ kind: 'bead', fillet: 0.001 })])).toMatch(/whose fillet \(0\) is not above 0; a bead's quirk must be$/);
    expect(store(b, [W({ kind: 'bead', fillet: 1 / 64 })])[0]!.fillet).toBe(1 / 64);
  });
  it('both ends through the same end face', () => {
    expect(faultOf(b, [W({ start: 0, end: 0 })])).toBe('has a profile on +y/+z whose start (0) and end (0) are both at the same end of the edge');
    expect(faultOf(b, [W({ start: 0, end: 0.01 })])).toMatch(/both at the same end/);
    expect(faultOf(b, [W({ start: 24, end: 23.99 })])).toMatch(/both at the same end/);
  });
  it('a station past either end is not a fault: it is measured from the OTHER end (the loader keeps it; strict faults judge it)', () => {
    const S = (from: 'min' | 'max', at: number): ProfileEnd => ({ side: { across: 'width', from: 'max' }, from, at });
    const T = (through: 'min' | 'max'): ProfileEnd => ({ side: { across: 'width', from: 'max' }, through });
    const runOf = (w: Partial<WorldProfile>, bb = b) => store(bb, [W(w)])[0]!.run;
    expect(runOf({ start: -2, end: 24 })).toEqual(canonicalRun(b, 'max', { start: S('max', 26), end: T('max') }));
    expect(runOf({ start: 0, end: 25 })).toEqual(canonicalRun(b, 'max', { start: T('min'), end: S('min', 25) }));
    // Turned 180 (length reversed): world 25 is past the part's MIN end, world -1 past its max end.
    const turned = flat({ rotation: 180 });
    const Z = (from: 'min' | 'max', at: number): ProfileEnd => ({ side: { across: 'width', from: 'max' }, from, at });
    expect(runOf({ edge: ['+y', '-z'], start: 0, end: 25 }, turned)).toEqual(canonicalRun(turned, 'max', { start: { side: { across: 'width', from: 'max' }, through: 'max' }, end: Z('max', 25) }));
    expect(runOf({ edge: ['+y', '-z'], start: -1, end: 24 }, turned)).toEqual(canonicalRun(turned, 'max', { start: Z('min', 25), end: { side: { across: 'width', from: 'max' }, through: 'min' } }));
  });
  it('a stored over-length station (a resize leaves one) loads unchanged and echoes exactly, past either end, every pose (B3)', () => {
    // chiralPart's length is 20: one run ends 2in past the max end (from min at 22), one starts 1in past the min end
    // (from max at 21). A 2in part's run from min 0.5 to min 3 is the review's case.
    const over: Profile[] = [
      { face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face', run: run('max', st(W_MAX, 'min', 5), st(W_MAX, 'min', 22)) },
      { face: 'min', kind: 'cove', size: 0.25, fillet: 0, facing: 'face', run: run('min', st(W_MIN, 'max', 21), thr(W_MIN, 'max')) },
    ];
    const short: Board = { ...flat({ length: 2 }), profiles: [{ id: 's', face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face',
      run: canonicalRun({ length: 2, width: 5.5, thickness: 0.75 }, 'max', { start: st(W_MAX, 'min', 0.5), end: st(W_MAX, 'min', 3) }) }] };
    for (const bb of [...POSTURES.flatMap((p) => TURNS.map((t) => profiled(p, t, over))), short]) {
      const raw = JSON.parse(JSON.stringify({ ...createDocument('T'), boards: [bb] }));
      const loaded = (migrateDocument(raw).boards[0] as Board).profiles;
      expect(loaded.map(profileValues)).toEqual(bb.profiles.map(profileValues));
      const ws = worldProfiles(bb)!;
      expect(byValue(store(bb, ws, exactOf(ws))), `${bb.posture} ${bb.rotation}`).toEqual(byValue(bb.profiles));
    }
    expect(worldProfiles(short)![0]).toMatchObject({ start: 0.5, end: 3 });
  });
  it('the first fault wins, and a fault rejects the whole list', () => {
    expect(faultOf(b, [W(), W({ size: 0 }), W({ edge: ['+x', '+z'] })])).toMatch(/size \(0\)/);
  });
});

describe('DIRS sanity', () => {
  it('every direction is accepted as a side of a flat part', () => {
    for (const d of DIRS.filter((x) => x[1] !== 'y')) expect(store(flat(), [W({ edge: ['+y', d], start: 1, end: 2 })])).toHaveLength(1);
  });
});
