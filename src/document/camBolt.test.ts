import { describe, expect, it } from 'vitest';
import { HOLE_EPS, HOLE_SEGMENTS, boardHoles, camLoop, holeInstances, holeRims, mateHole, mm } from './holes';
import type { Hole } from './holes';
import { partGeometry } from './bodies';
import { DIMENSION_ORDER } from './geometry';
import { mirrorDim, mirrorPart } from './frames';
import { camPairRows, camPartners, camRole, camRowIds, separatesPair } from './camBolt';
import { BOLT, CAM, camPart } from './camBoltFixtures';
import type { Board, HoleRow, ShapedBoard } from './types';
import { IMPERIAL } from '../units/length';
import { levelEndHoles, rebaseHoles } from './holeRebase';
import { stretchPart } from './stretchPart';
import { holeRowsFor, sameHoles, worldHoles } from './holeWorld';
import { resolveBoard } from './shapes';
import { SHARED_KEYS } from './links';

const holesOf = (rows: HoleRow[]): Hole[] => {
  const b = camPart();
  return rows.flatMap((r) => holeInstances(b, r));
};
const pairs = (cam: Partial<HoleRow> = {}, bolt: Partial<HoleRow> = {}) =>
  camPartners(holesOf([{ ...CAM, ...cam }, { ...BOLT, ...bolt }]));

describe('camPartners', () => {
  it('the fixture is two pairs', () => {
    const hs = holesOf([CAM, BOLT]);
    const m = camPartners(hs);
    expect(m.size).toBe(4);
    for (let k = 0; k < 2; k += 1) {
      expect(m.get(hs[k]!)).toBe(hs[2 + k]);
      expect(m.get(hs[2 + k]!)).toBe(hs[k]);
    }
  });
  it('camPairRows names the whole pair', () => {
    const b = camPart();
    expect(camPairRows(b)).toEqual([{ cam: CAM, bolt: BOLT }]);
    expect([...camRowIds(b)].sort()).toEqual(['bolt', 'cam']);
    expect(camRowIds(b)).toBe(camRowIds(b));
  });
  it('camRowIds keys on the board size, not only the holes array', () => {
    const a = camPart();
    const thin = camPart({ thickness: 0.5, holes: a.holes });
    expect(thin.holes).toBe(a.holes);
    expect([...camRowIds(a)].sort()).toEqual(['bolt', 'cam']);
    expect(camRowIds(thin).size).toBe(0);
  });
  it('camRole: the face bore is the cam', () => {
    const [c, e] = [holesOf([CAM])[0]!, holesOf([BOLT])[0]!];
    expect(camRole(c, e)).toBe('cam');
    expect(camRole(e, c)).toBe('bolt');
  });
  it('clause 1: tilted, headed, through do not pair', () => {
    expect(pairs({}, { tiltAlong: 0.01 }).size).toBe(0);
    expect(pairs({ head: 'counterbore', headDiameter: mm(20), headDepth: mm(3) }).size).toBe(0);
    expect(pairs({ depth: 'through' }).size).toBe(0);
    expect(pairs({}, { depth: 'through' }).size).toBe(0);
  });
  it('clause 2: parallel axes do not pair', () => {
    expect(pairs({}, { face: 'thickness', from: 'min', along: 'width', acrossFrom: 'min', inset: mm(24) }).size).toBe(0);
  });
  it('clause 3: the axes must meet', () => {
    expect(pairs({}, { station: BOLT.station + 1e-6 }).size).toBe(0);
    expect(pairs({}, { station: BOLT.station + 1e-10 }).size).toBe(4);
  });
  it('clause 4: the bolt must be strictly inside the cam depth', () => {
    expect(pairs({ depth: 0.375 + mm(4) }).size).toBe(0);
    expect(pairs({ depth: 0.375 + mm(4) + 1e-6 }).size).toBe(4);
    // mouth side: bolt reaching the mouth plane
    expect(pairs({}, { inset: 0.75 - mm(4) }).size).toBe(0);
  });
  it('clause 5: the bolt must be narrower', () => {
    expect(pairs({}, { diameter: CAM.diameter }).size).toBe(0);
  });
  it('clause 6, bottom: the bolt must end in the cam air', () => {
    const far = Math.sqrt(mm(7.5) ** 2 - mm(4) ** 2);
    expect(pairs({}, { depth: mm(24) + far }).size).toBe(0);
    expect(pairs({}, { depth: mm(24) - far }).size).toBe(0);
    expect(pairs({}, { depth: mm(24) + mm(3) }).size).toBe(4);
  });
  it('clause 6, mouth: the cam touching the end face does not pair', () => {
    expect(pairs({ inset: mm(7.5) }).size).toBe(0);
    // bottom in the air (s = 0) but the mouth exactly on the cam's wall
    expect(pairs({ inset: mm(7.5) }, { depth: mm(7.5) }).size).toBe(0);
    expect(pairs({ inset: mm(7.5) + 1e-6 }, { depth: mm(7.5) + 1e-6 }).size).toBe(4); // twin: clear of the end face
  });
  it('clause 7: a hole in two candidates pairs with neither', () => {
    const other: HoleRow = { ...BOLT, id: 'bolt2', from: 'max', depth: mm(24) };
    const m = camPartners(holesOf([CAM, BOLT, other]));
    // other enters from the far end, 30in away: not a candidate; the cam still pairs with BOLT
    expect(m.size).toBe(4);
    const near: HoleRow = { ...BOLT, id: 'bolt2', from: 'min' };
    expect(camPartners(holesOf([CAM, BOLT, near])).size).toBe(0);
    // far end, reaching each cam
    const reaching: HoleRow = { ...BOLT, id: 'bolt2', from: 'max', depth: 30 - mm(24) };
    expect(camPartners(holesOf([CAM, BOLT, reaching])).size).toBe(0);
  });
  it('a shorter bolt that stops in the wood does not pair', () => {
    expect(pairs({}, { depth: mm(15) }).size).toBe(0);
  });
  it('HOLE_EPS is the shared tolerance', () => { expect(HOLE_EPS).toBe(1e-9); });
});

describe('the mate, the loop and the rims (cam-and-bolt Task 3)', () => {
  const geo = (b = camPart()) => partGeometry(b).holes;
  it('partGeometry marks both bores', () => {
    const hs = geo();
    expect(hs.filter((h) => h.mate !== undefined)).toHaveLength(4);
    for (const h of hs) expect(h.mate!.role).toBe(h.row === 'cam' ? 'bolt' : 'cam');
  });
  it('an unpaired part\'s holes carry no mate key', () => {
    for (const h of geo(camPart({ holes: [{ ...CAM }] }))) expect(Object.keys(h)).not.toContain('mate');
  });
  it('camLoop lies on both cylinders', () => {
    const hs = geo();
    for (const bolt of hs.filter((h) => h.row === 'bolt')) {
      const cam = hs.find((h) => h.row === 'cam' && h.index === bolt.index)!;
      const a = DIMENSION_ORDER.indexOf(cam.axis);
      const b = DIMENSION_ORDER.indexOf(bolt.axis);
      const c = 3 - a - b;
      const loop = camLoop(bolt);
      expect(loop).toHaveLength(HOLE_SEGMENTS);
      for (const p of loop) {
        expect(Math.abs(Math.hypot(p[b]! - cam.centre[b]!, p[c]! - cam.centre[c]!) - cam.radius)).toBeLessThan(1e-12);
        expect(Math.abs(Math.hypot(p[a]! - bolt.centre[a]!, p[c]! - bolt.centre[c]!) - bolt.radius)).toBeLessThan(1e-12);
        const t = bolt.dir * (p[b]! - bolt.centre[b]!);
        expect(t).toBeGreaterThan(0);
        expect(t).toBeLessThan(bolt.depth);
      }
    }
  });
  it('bolt rims end on the loop', () => {
    const hs = geo();
    const bolt = hs.find((h) => h.row === 'bolt')!;
    const rims = holeRims(bolt);
    expect(rims).toHaveLength(2 * HOLE_SEGMENTS);
    const loop = camLoop(bolt);
    rims.slice(HOLE_SEGMENTS).forEach(([p], i) => expect(p).toBe(loop[i]));
    expect(holeRims(hs.find((h) => h.row === 'cam')!)).toHaveLength(2 * HOLE_SEGMENTS);
  });
  it('camLoop is memoised on a frozen hole', () => {
    const bolt = geo().find((h) => h.row === 'bolt')!;
    expect(camLoop(bolt)).toBe(camLoop(bolt));
  });
  it('mirrored and turned parts keep the pair', () => {
    expect(geo(mirrorPart(camPart())).filter((h) => h.mate)).toHaveLength(4);
  });
  it('camLoop(mateHole(cam)) equals camLoop(bolt), bit for bit', () => {
    const hs = geo();
    for (const bolt of hs.filter((h) => h.row === 'bolt')) {
      const cam = hs.find((h) => h.row === 'cam' && h.index === bolt.index)!;
      const m = mateHole(cam);
      expect(m.through).toBe(false);
      expect(m.reach).toBe(m.depth);
      const x = camLoop(m);
      const y = camLoop(bolt);
      expect(x).toHaveLength(y.length);
      x.forEach((p, i) => p.forEach((v, k) => expect(Object.is(v, y[i]![k])).toBe(true)));
    }
  });
});

const partners = (b: Board) => camPartners(boardHoles(b)).size;
const DIM_INDEX = { length: 0, width: 1, thickness: 2 } as const;
/** Per pair, cam centre minus the bolt's BOTTOM (its mouth centre plus dir along its axis by its depth), cam row id then
 *  index order. The bottom is fixed in the wood by Level the ends; the mouth is not. */
function jointVectors(b: Board): number[][] {
  const hs = boardHoles(b);
  const m = camPartners(hs);
  return hs
    .filter((h) => m.has(h) && camRole(h, m.get(h)!) === 'cam')
    .sort((x, y) => (x.row < y.row ? -1 : x.row > y.row ? 1 : x.index - y.index))
    .map((cam) => {
      const bolt = m.get(cam)!;
      const bottom = [...bolt.centre];
      bottom[DIM_INDEX[bolt.axis]]! += bolt.dir * bolt.depth;
      return cam.centre.map((v, k) => v - bottom[k]!);
    });
}
const expectVectors = (got: number[][], want: number[][]) => {
  expect(got).toHaveLength(want.length);
  got.forEach((v, i) => v.forEach((c, k) => expect(Math.abs(c - want[i]![k]!)).toBeLessThanOrEqual(1e-9)));
};

describe('the pair survives every move (spec 6.5, 7)', () => {
  it('Level the ends keeps the pair on the board whose length grows at min', () => {
    const b = camPart();
    const e = 0.1;
    const after: Board = { ...b, length: b.length + e, holes: levelEndHoles(b.holes, e, 0, b) };
    expect(partners(after)).toBe(4);
    expect(after.holes[0]!.inset).toBeCloseTo(b.holes[0]!.inset + e, 12);
    expectVectors(jointVectors(after), jointVectors(b));
  });
  it('stretch past the cam keeps the pair; through the bolt refuses', () => {
    const b = camPart();
    const out = stretchPart(b, 0, 20, 2, IMPERIAL);
    if ('refused' in out) throw new Error(out.refused);
    expect(out.length).toBe(b.length + 2);
    expect(partners(out)).toBe(4);
    expectVectors(jointVectors(out), jointVectors(b));
    expect(stretchPart(b, 0, mm(10), 2, IMPERIAL)).toHaveProperty('refused');
  });
  it('rebaseHoles at the far end keeps the pair', () => {
    const b = camPart();
    const before = jointVectors(b);
    const rows = b.holes;
    rebaseHoles(b, 'length', 'max', 3); // mutates b.holes in place (void)
    // Nothing is measured from the length MAX end, so no row shifts: every row is the SAME object, as documented.
    expect(b.holes).toHaveLength(rows.length);
    b.holes.forEach((r, i) => expect(r).toBe(rows[i]));
    expect(partners(b)).toBe(4);
    expectVectors(jointVectors(b), before);
    // A row measured from the max end does shift, so the rebase is not a no-op on this fixture's shape.
    const far = camPart({ holes: [{ ...CAM, acrossFrom: 'max' }, { ...BOLT, from: 'max' }] });
    const moved = { ...far, holes: far.holes.map((r) => ({ ...r })) };
    rebaseHoles(moved, 'length', 'max', 3);
    expect(moved.holes[0]!.inset).toBe(far.holes[0]!.inset + 3);
  });
  it("Refine's world round trip keeps the pair", () => {
    const b = camPart();
    const world = worldHoles(b);
    // Refine's exact-number map (roleLinks.ts, generated.ts): the original's own numbers are kept as they are.
    const exact = new Set(world.flatMap((r) => [r.diameter, r.depth, r.pitch, r.offset.x, r.offset.y, r.offset.z]));
    const back = holeRowsFor(b, world, exact);
    if ('fault' in back) throw new Error(back.fault);
    expect(back.rows).toHaveLength(2);
    for (const r of b.holes) expect(back.rows.some((x) => sameHoles(x, r, b))).toBe(true);
    expect(partners({ ...b, holes: back.rows.map((r, i) => ({ id: `r${i}`, ...r })) })).toBe(4);
  });
  it("a linked Shape's mirrored user has the pair", () => {
    const src = camPart();
    const shape: Record<string, unknown> = { id: 's1' };
    for (const k of SHARED_KEYS) if (k in src) shape[k] = (src as unknown as Record<string, unknown>)[k];
    const shapes = new Map([['s1', shape as never]]);
    const user = (mirrored: boolean) => resolveBoard(shapes, {
      id: 'u', name: 'U', position: [0, 0, 0], rotation: 0, shape: 's1', ...(mirrored ? { mirrored: true as const } : {}),
    } as ShapedBoard)!;
    expect(partners(user(false))).toBe(4);
    const m = user(true);
    expect(m.mirrored).toBe(true);
    expect(partners(m)).toBe(4);
    // The mirror flips the part's own mirrorDim (length at turn 0): that component of every joint vector is negated.
    const flipped = jointVectors(user(false)).map((v) => v.map((c, k) => (k === DIM_INDEX[mirrorDim(src)] ? -c : c)));
    const key = (v: number[]) => v.map((c) => c.toFixed(9)).join(',');
    expect(jointVectors(m).map(key).sort()).toEqual(flipped.map(key).sort());
  });
});

describe('separatesPair (spec Amended R11, the user\'s ruling 2026-10-30: refused)', () => {
  const b = camPart();
  const withRows = (holes: HoleRow[]) => ({ ...b, holes });
  it('an unchanged board separates nothing', () => {
    expect(separatesPair(b, b)).toBe(false);
  });
  it('the cam moved away from its bolt separates the pair', () => {
    expect(separatesPair(b, withRows([{ ...CAM, inset: mm(60) }, BOLT]))).toBe(true);
  });
  it('the bolt shortened short of the cam separates the pair', () => {
    expect(separatesPair(b, withRows([CAM, { ...BOLT, depth: mm(10) }]))).toBe(true);
  });
  it('a hole that goes away is not separated (fewer fittings, a deleted row)', () => {
    expect(separatesPair(b, withRows([{ ...CAM, count: 1 }, { ...BOLT, count: 1 }]))).toBe(false);
    expect(separatesPair(b, withRows([]))).toBe(false);
  });
  it('only ONE hole of a row moved apart separates it (count 2, the second station moved)', () => {
    expect(separatesPair(b, withRows([{ ...CAM, pitch: CAM.pitch - mm(30) }, BOLT]))).toBe(true);
  });
  it('a pair that stays a pair after an edit is not separated', () => {
    expect(separatesPair(b, withRows([{ ...CAM, depth: mm(15) }, BOLT]))).toBe(false);
  });
});
