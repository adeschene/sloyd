import { describe, expect, it } from 'vitest';
import type { Board, HoleRow, ShapedBoard, SloydDocument } from './types';
import type { Units } from '../units/length';
import type { V3 } from './angleCuts';
import { createBoard, createDocument, migrateDocument } from './document';
import { boardExtents } from './geometry';
import { defaultCamLock, holeInstances, mm } from './holes';
import { camPairRows, camRowIds } from './camBolt';
import { holeFaults } from './holeFaults';
import { boreAlongAxis, boreEnds, boreRow, type WorldAxis } from './legSockets';
import { toWorld } from './snapPoints';
import { turnedAbout } from './turnFixtures';
import { displayNames, worldParts } from './tree';
import { mapWorld } from './treeEdit';
import { linkByRole } from './roleLinks';
import { SHARED_KEYS } from './links';
import { carcass } from './camJointFixtures';
import { camFaceOptions, camJointPlan, defaultCamFrom, defaultCamJointCount, type CamJointPlan } from './camJoint';
import {
  CAM_JOINT_ALREADY, CAM_JOINT_BARE_FACE, CAM_JOINT_COUNT, CAM_JOINT_NARROW, CAM_JOINT_ON_EDGE, CAM_JOINT_PARTIAL, CAM_JOINT_THIN,
  CAM_JOINT_TWO_LOCKS, camJointFaulted, camJointLinkNote,
} from './camJointText';

const MM: Units = { display: 'metric-mm', precision: 16 };
const part = (doc: SloydDocument, id: string) => worldParts(doc).find((b) => b.id === id)!;
const nameOf = (doc: SloydDocument, id: string) => displayNames(doc).get(id)!;
/** `doc` with root part `id` patched (no re-migration: the planner reads what is stored). */
const patched = (doc: SloydDocument, id: string, f: (b: Board) => Board): SloydDocument =>
  ({ ...doc, boards: doc.boards.map((b) => (b.id === id ? f(b as Board) : b)) });

function planOf(doc: SloydDocument, ids: [string, string], count: number | null = null, camFrom: 'min' | 'max' | null = null): CamJointPlan {
  const p = camJointPlan(doc, ids, count, camFrom);
  if (typeof p === 'string') throw new Error(p);
  return p;
}
/**
 * The store's write (Task 4): each entry through `mapWorld`; an unchanged list is not written. Every applied plan is also
 * reloaded (ruling R17): through `migrateDocument` after a JSON round trip, every part keeps every hole row (the loader
 * drops a malformed row, e.g. a negative pitch, so a plan the loader would not keep fails here).
 */
const apply = (doc: SloydDocument, p: Pick<CamJointPlan, 'writes'>): SloydDocument => {
  const next = mapWorld(doc, (w) => w.map((b) => {
    const e = p.writes.find((x) => x.id === b.id);
    return e && JSON.stringify(e.holes) !== JSON.stringify(b.holes) ? { ...b, holes: e.holes } : b;
  }));
  const reloaded = new Map(worldParts(migrateDocument(JSON.parse(JSON.stringify(next)))).map((b) => [b.id, b.holes]));
  for (const b of worldParts(next)) expect(reloaded.get(b.id), `${b.id}'s holes after a reload`).toEqual(b.holes);
  return next;
};
const writeOf = (p: CamJointPlan, id: string) => p.writes.find((w) => w.id === id)!;
const added = (before: readonly HoleRow[], after: readonly HoleRow[]) => after.filter((r) => !before.some((o) => o.id === r.id));

const pt = (v: readonly number[]) => ({ length: v[0]!, width: v[1]!, thickness: v[2]! });
/** Each bolt hole's world axis: its mouth centre and its bit (`boreEnds`' form, per hole). */
function boltAxes(a: Board, bolt: HoleRow): WorldAxis[] {
  return holeInstances(a, bolt).map((h) => {
    const p = toWorld(a, pt(h.centre));
    const f = toWorld(a, pt(h.centre.map((c, i) => c + h.reach * h.bit[i]!)));
    const d = [f[0] - p[0], f[1] - p[1], f[2] - p[2]];
    const n = Math.hypot(d[0]!, d[1]!, d[2]!);
    return { p, u: [d[0]! / n, d[1]! / n, d[2]! / n] as V3 };
  });
}
function strictlyInside(b: Board, q: readonly number[]): boolean {
  const e = boardExtents(b);
  return [0, 1, 2].every((i) => q[i]! > b.position[i]! && q[i]! < b.position[i]! + e[i]!);
}
const plainRow = (r: HoleRow) => !('tiltAlong' in r) && !('tiltAcross' in r) && !('head' in r);

/**
 * The joint `p` as applied: A carries one whole pair at the joined end, and every one of its bolt holes has exactly one
 * single bore in B along its axis (`boreAlongAxis`), its far centre strictly inside B. Returns the applied document.
 */
function expectJoined(doc: SloydDocument, p: CamJointPlan): SloydDocument {
  const next = apply(doc, p);
  const a = part(next, p.joint.a);
  const b = part(next, p.joint.b);
  const pairs = camPairRows(a).filter((x) => x.bolt.face === 'length' && x.bolt.from === p.joint.end);
  expect(pairs).toHaveLength(1);
  const axes = boltAxes(a, pairs[0]!.bolt);
  expect(axes).toHaveLength(p.fittings);
  // B's face toward A: its plane on world axis k (B's max side when A is on its min side, and so on).
  const { k, side } = p.joint;
  const facing = side === 1 ? b.position[k] : b.position[k] + boardExtents(b)[k];
  for (const axis of axes) {
    const on = b.holes.filter((r) => r.count === 1 && boreAlongAxis(b, r, axis));
    expect(on).toHaveLength(1);
    const [mouth, far] = boreEnds(b, on[0]!);
    expect(Math.abs(mouth[k] - facing)).toBeLessThanOrEqual(1e-9);
    expect(strictlyInside(b, far)).toBe(true);
  }
  for (const r of [...added(part(doc, p.joint.a).holes, a.holes)]) expect(holeFaults(a, r)).toEqual([]);
  for (const r of [...added(part(doc, p.joint.b).holes, b.holes)]) expect(holeFaults(b, r)).toEqual([]);
  return next;
}

describe('camJointPlan: the layout (spec §3.2)', () => {
  it('shelf into left side, imperial: two fittings, the cam from the underside, two coaxial bores in the side', () => {
    const { doc, left, shelf } = carcass();
    const p = planOf(doc, [shelf, left]);
    expect(p.joint).toMatchObject({ a: shelf, b: left, end: 'min', k: 0, side: -1 });
    expect(p.fittings).toBe(2);
    expect(p.camFrom).toBe('min');
    expect(p.reused).toEqual({ a: false, b: 0 });
    expect(p.notes).toEqual([]);
    expect(p.writes.map((w) => w.id)).toEqual([shelf, left]);
    // The shelf: one whole pair, the cam entering the face that points DOWN (its mouths at the shelf's bottom, y = 10).
    const s = { ...part(doc, shelf), holes: writeOf(p, shelf).holes };
    expect(s.holes).toHaveLength(2);
    const pairs = camPairRows(s);
    expect(pairs).toHaveLength(1);
    const { cam, bolt } = pairs[0]!;
    expect(holeInstances(s, cam).map((h) => toWorld(s, pt(h.centre))[1])).toEqual([10, 10]);
    expect(bolt.face).toBe('length');
    expect(bolt.from).toBe('min');
    for (const r of s.holes) expect(holeFaults(s, r)).toEqual([]);
    // The side: two single bores, 5 mm × 12 mm, along each bolt's axis, ending inside the side.
    const l = { ...part(doc, left), holes: writeOf(p, left).holes };
    expect(l.holes).toHaveLength(2);
    expect(l.holes.every((r) => r.count === 1 && r.diameter === mm(5) && r.depth === mm(12))).toBe(true);
    const axes = boltAxes(s, bolt);
    l.holes.forEach((r, i) => {
      expect(boreAlongAxis(l, r, axes[i]!)).toBe(true);
      expect(strictlyInside(l, boreEnds(l, r)[1])).toBe(true);
      expect(holeFaults(l, r)).toEqual([]);
    });
    // Every new row is square and headless: the tilt bound and the head checks are vacuous (Global Constraints).
    for (const r of [...s.holes, ...l.holes]) expect(plainRow(r)).toBe(true);
    // Fresh ids, all distinct.
    expect(new Set([...s.holes, ...l.holes].map((r) => r.id)).size).toBe(4);
    expectJoined(doc, p);
  });

  it('into the right side: the shelf\'s max end, the bores in the right side', () => {
    const { doc, right, shelf } = carcass();
    const p = planOf(doc, [right, shelf]);
    expect(p.joint).toMatchObject({ a: shelf, b: right, end: 'max', side: 1 });
    expectJoined(doc, p);
  });

  it('count 3 and the cam face overridden: three fittings, the cam from the top', () => {
    const { doc, left, shelf } = carcass();
    const p = planOf(doc, [shelf, left], 3, 'max');
    expect(p.fittings).toBe(3);
    expect(p.camFrom).toBe('max');
    const s = { ...part(doc, shelf), holes: writeOf(p, shelf).holes };
    const { cam } = camPairRows(s)[0]!;
    expect(cam.count).toBe(3);
    expect(cam.pitch).toBe((12 - 2 * mm(37)) / 2);
    expect(holeInstances(s, cam).map((h) => toWorld(s, pt(h.centre))[1])).toEqual([10.75, 10.75, 10.75]);
    expect(writeOf(p, left).holes).toHaveLength(3);
    expectJoined(doc, p);
  });

  it('coaxial on every turn of B: the side at 90 and 270, a square post at 0, 90, 180 and 270, and a side on edge', () => {
    const { doc, left, shelf } = carcass();
    const side = part(doc, left);
    // The side's inner face stays at x = 0.75: a 3/4" side turned 90 or 270 (0 and 180 put its 12" width on X, so the
    // shelf's 12" end no longer fits its 3/4" face: a 12" × 12" post stands in for those turns).
    const post = createBoard({ id: left, name: 'Left side', posture: 'upright', length: 30, width: 12, thickness: 12, position: [0, 0, 0] });
    const variants: Board[] = [
      turnedAbout(side, 90, [0.375, 0, 6]),
      turnedAbout(side, 270, [0.375, 0, 6]),
      ...([0, 90, 180, 270] as const).map((r) => turnedAbout(post, r, [0.75 - 6, 0, 6])),
      createBoard({ id: left, name: 'Left side', posture: 'on-edge', rotation: 90, length: 12, width: 30, thickness: 0.75, position: [0, 0, 0] }),
    ];
    for (const b of variants) {
      const e = boardExtents(b);
      expect(b.position[0] + e[0]).toBe(0.75);
      const d = patched(doc, left, () => b);
      const p = planOf(d, [shelf, left]);
      expect(p.fittings).toBe(2);
      expect(writeOf(p, left).holes).toHaveLength(2);
      expectJoined(d, p);
    }
  });

  it('metric carcass: the cam 13.5 mm deep (9 + 4.5, up to the half mm), the bores 5 mm × 12 mm', () => {
    const { doc, left, shelf } = carcass(MM);
    const p = planOf(doc, [shelf, left]);
    expect(p.fittings).toBe(2);
    const s = { ...part(doc, shelf), holes: writeOf(p, shelf).holes };
    expect(camPairRows(s)[0]!.cam.depth).toBe(mm(13.5));
    for (const r of writeOf(p, left).holes) {
      expect(r.diameter).toBe(mm(5));
      expect(r.depth).toBe(mm(12));
    }
    expectJoined(doc, p);
  });
});

describe('camJointPlan: reuse (spec §3.3)', () => {
  it("reuses the shelf's pair: the typed count ignored, no new shelf rows, the side's bores only where missing", () => {
    const { doc, left, shelf } = carcass();
    const first = planOf(doc, [shelf, left]);
    const withPair = apply(doc, { writes: [writeOf(first, shelf)] });
    const p = planOf(withPair, [shelf, left], 5);
    expect(p.reused).toEqual({ a: true, b: 0 });
    expect(p.fittings).toBe(2);
    expect(p.camFrom).toBe('min');
    expect(writeOf(p, shelf).holes).toEqual(part(withPair, shelf).holes);
    expect(writeOf(p, left).holes).toHaveLength(2);
    expectJoined(withPair, p);
    // One of the side's two bores already there: only the other is added.
    const one = apply(withPair, { writes: [{ id: left, holes: [writeOf(first, left).holes[0]!] }] });
    const q = planOf(one, [shelf, left]);
    expect(q.reused).toEqual({ a: true, b: 1 });
    expect(writeOf(q, left).holes).toHaveLength(2);
    expect(writeOf(q, left).holes[0]).toEqual(writeOf(first, left).holes[0]);
    expectJoined(one, q);
  });

  it('a typed count out of range is ignored too when the pair is reused (the count is never read)', () => {
    const { doc, left, shelf } = carcass();
    const withPair = apply(doc, { writes: [writeOf(planOf(doc, [shelf, left]), shelf)] });
    expect(planOf(withPair, [shelf, left], 13).fittings).toBe(2);
    expect(planOf(withPair, [shelf, left], 0).reused.a).toBe(true);
  });

  it('a side bore already there but the shelf bare: the shelf gets its pair, the side nothing', () => {
    const { doc, left, shelf } = carcass();
    const first = planOf(doc, [shelf, left]);
    const sided = apply(doc, { writes: [writeOf(first, left)] });
    const p = planOf(sided, [shelf, left]);
    expect(p.reused).toEqual({ a: false, b: 2 });
    expect(writeOf(p, left).holes).toEqual(part(sided, left).holes);
    expect(writeOf(p, shelf).holes).toHaveLength(2);
  });

  it('a bore at the same place but of another size is not reused: the planned one meets it', () => {
    const { doc, left, shelf } = carcass();
    const first = planOf(doc, [shelf, left]);
    const other: HoleRow = { ...writeOf(first, left).holes[0]!, id: 'other', diameter: mm(4) };
    const sided = patched(doc, left, (b) => ({ ...b, holes: [other] }));
    expect(camJointPlan(sided, [shelf, left], null, null)).toBe(camJointFaulted('Left side', 'meet another hole'));
    const deeper = patched(doc, left, (b) => ({ ...b, holes: [{ ...other, diameter: mm(5), depth: mm(14) }] }));
    expect(camJointPlan(deeper, [shelf, left], null, null)).toBe(camJointFaulted('Left side', 'meet another hole'));
  });

  it('already joined: CAM_JOINT_ALREADY, either order', () => {
    const { doc, left, shelf } = carcass();
    const next = apply(doc, planOf(doc, [shelf, left]));
    expect(camJointPlan(next, [shelf, left], null, null)).toBe(CAM_JOINT_ALREADY(nameOf(next, shelf), nameOf(next, left)));
    expect(camJointPlan(next, [left, shelf], 4, 'max')).toBe(CAM_JOINT_ALREADY(nameOf(next, shelf), nameOf(next, left)));
  });

  describe('mirrored linked sides, one centred fitting (ruling R3)', () => {
    // A 3" deep carcass: one fitting, centred, at the sides' exact width-middle, where `boreRow` picks `min` and a mirrored
    // user reads the same bore flipped. The sides are one Shape: the right a MIRRORED user (turn 270 + mirrored nets a
    // reflection across X), chiral by a hole near the front of the left's inner face.
    function mirroredCarcass(): SloydDocument {
      const left = createBoard({
        id: 'left', name: 'Left side', posture: 'upright', rotation: 90, length: 30, width: 3, thickness: 0.75, position: [0, 0, 0],
      });
      const probe = createBoard({ ...left, holes: [] });
      const inner = (['min', 'max'] as const).find((from) => {
        const h = holeInstances(probe, { id: 'x', face: 'thickness', from, diameter: 0.25, depth: 0.25, along: 'length', alongFrom: 'min', station: 25, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.5 })[0]!;
        return toWorld(probe, pt(h.centre))[0] === 0.75;
      })!;
      const chiral: HoleRow = {
        id: 'chiral', face: 'thickness', from: inner, diameter: 0.25, depth: 0.25, along: 'length', alongFrom: 'min', station: 25,
        count: 1, pitch: 0, acrossFrom: 'min', inset: 0.5,
      };
      const src = { ...left, holes: [chiral] };
      const shape: Record<string, unknown> = { id: 's1' };
      for (const k of SHARED_KEYS) if (k in src) shape[k] = (src as unknown as Record<string, unknown>)[k];
      const user = (id: string, name: string, x: number, rotation: 90 | 270, mirrored: boolean): ShapedBoard => ({
        id, name, position: [x, 0, 0], rotation, shape: 's1', ...(mirrored ? { mirrored: true as const } : {}),
      } as ShapedBoard);
      const shelf = createBoard({
        id: 'shelf', name: 'Shelf', posture: 'flat', rotation: 0, length: 22.5, width: 3, thickness: 0.75, position: [0.75, 10, 0],
      });
      return migrateDocument({
        ...createDocument('Mirrored'), shapes: [shape as never],
        boards: [user('left', 'Left side', 0, 90, false), user('right', 'Right side', 23.25, 270, true), shelf],
      });
    }

    it('the fixture: the right side is the left reflected across X (its chiral hole mirrored, z kept)', () => {
      const doc = mirroredCarcass();
      const [l, r] = [part(doc, 'left'), part(doc, 'right')];
      expect(r.shape).toBe(l.shape);
      expect(r.mirrored).toBe(true);
      expect(boardExtents(r)).toEqual([0.75, 30, 3]);
      const [ml] = boreEnds(l, l.holes[0]!);
      const [mr] = boreEnds(r, r.holes[0]!);
      expect(mr[0]).toBeCloseTo(24 - ml[0], 12);
      expect(mr[1]).toBeCloseTo(ml[1], 12);
      expect(mr[2]).toBeCloseTo(ml[2], 12);
    });

    it("after the left joint, the right: the shelf's other end has no pair, the side's bore arrived through the link", () => {
      const doc0 = mirroredCarcass();
      const lp = planOf(doc0, ['shelf', 'left']);
      expect(lp.fittings).toBe(1);
      expect(lp.notes).toEqual([camJointLinkNote('Right side')]);
      const doc = expectJoined(doc0, lp);
      const right = part(doc, 'right');
      expect(right.holes).toHaveLength(2);
      // The bore the right side got is the one it needs IN THE WORLD, stored with a flag `boreRow` would not pick: so a
      // `sameHoleRow` reuse could not see it (the advisor's catch, spec §3.3).
      const got = right.holes.find((r) => r.id !== 'chiral')!;
      const [m, f] = boreEnds(right, got);
      const u = [f[0] - m[0], f[1] - m[1], f[2] - m[2]];
      const n = Math.hypot(u[0]!, u[1]!, u[2]!);
      const fresh = boreRow(right, got.face, got.from, m, [u[0]! / n, u[1]! / n, u[2]! / n], mm(5), mm(12));
      expect(fresh.alongFrom !== got.alongFrom || fresh.acrossFrom !== got.acrossFrom).toBe(true);
      const p = planOf(doc, ['shelf', 'right']);
      expect(p.joint.end).toBe('max');
      expect(p.reused).toEqual({ a: false, b: 1 });
      expect(writeOf(p, 'right').holes).toEqual(right.holes);
      expect(added(part(doc, 'shelf').holes, writeOf(p, 'shelf').holes)).toHaveLength(2);
      expect(p.notes).toEqual([]);
      expectJoined(doc, p);
    });

    it('both joints applied, then the right again: CAM_JOINT_ALREADY (and the left)', () => {
      const doc0 = mirroredCarcass();
      const one = apply(doc0, planOf(doc0, ['shelf', 'left']));
      const both = apply(one, planOf(one, ['shelf', 'right']));
      expect(camJointPlan(both, ['shelf', 'right'], null, null)).toBe(CAM_JOINT_ALREADY('Shelf', 'Right side'));
      expect(camJointPlan(both, ['shelf', 'left'], null, null)).toBe(CAM_JOINT_ALREADY('Shelf', 'Left side'));
    });
  });

  it('plain-linked sides (ruling R18): the right side\'s bores would open onto its outside face, so the left joint refuses', () => {
    const { doc: d0, left, right, shelf } = carcass();
    const doc = linkByRole(d0, new Map([[left, 'side'], [right, 'side']]));
    expect(part(doc, left).shape).toBe(part(doc, right).shape);
    expect(part(doc, right).mirrored).toBeUndefined();
    expect(camJointPlan(doc, [shelf, left], null, null)).toBe(CAM_JOINT_BARE_FACE(nameOf(doc, right)));
    expect(camJointPlan(doc, [right, shelf], null, null)).toBe(CAM_JOINT_BARE_FACE(nameOf(doc, left)));
  });

  it('link notes: a shelf linked to a second shelf names the second, once', () => {
    const { doc: d0, left, right, shelf } = carcass();
    const second = createBoard({ ...part(d0, shelf), id: 'shelf2', name: 'Shelf 2', position: [0.75, 20, 0] });
    const d1 = migrateDocument({ ...d0, boards: [...d0.boards, second] });
    const doc = linkByRole(d1, new Map([[left, 'left'], [right, 'right'], [shelf, 'shelf'], ['shelf2', 'shelf']]));
    expect(part(doc, shelf).shape).toBe(part(doc, 'shelf2').shape);
    const p = planOf(doc, [shelf, left]);
    expect(p.notes).toEqual([camJointLinkNote(nameOf(doc, 'shelf2'))]);
    const next = expectJoined(doc, p);
    expect(camPairRows(part(next, 'shelf2'))).toHaveLength(1);
  });
});

describe('camJointPlan: refusals (spec §3.4 checks 7–8)', () => {
  it('a count that is not a whole number from 1 to 12', () => {
    const { doc, left, shelf } = carcass();
    for (const n of [0, 13, 2.5, NaN, -1, Infinity]) expect(camJointPlan(doc, [shelf, left], n, null)).toBe(CAM_JOINT_COUNT);
    for (const n of [1, 12]) expect(planOf(doc, [shelf, left], n).fittings).toBe(n);
  });

  it('a shelf 1/2" thick: CAM_JOINT_THIN', () => {
    const { doc: d, left, shelf } = carcass();
    const doc = patched(d, shelf, (b) => ({ ...b, thickness: 0.5 }));
    expect(camJointPlan(doc, [shelf, left], null, null)).toBe(CAM_JOINT_THIN('Shelf'));
  });

  it('a 2" shelf with two or more fittings: CAM_JOINT_NARROW (ruling R17), before any layout; one fitting is laid out', () => {
    const { doc: d, left, shelf } = carcass();
    const doc = patched(d, shelf, (b) => ({ ...b, width: 2 }));
    // Two or more fittings start 37 mm in from each side: 2" (50.8 mm) leaves a negative pitch, which the loader drops.
    for (const n of [2, 3]) expect(camJointPlan(doc, [shelf, left], n, null)).toBe(CAM_JOINT_NARROW('Shelf', n));
    // Exactly 2 × 37 mm across: a zero pitch, two fittings in one place — refused too.
    const exact = patched(d, shelf, (b) => ({ ...b, width: 2 * mm(37) }));
    expect(camJointPlan(exact, [shelf, left], 2, null)).toBe(CAM_JOINT_NARROW('Shelf', 2));
    expect(planOf(doc, [shelf, left], 1).fittings).toBe(1);
    expect(planOf(doc, [shelf, left]).fittings).toBe(1);
    expectJoined(doc, planOf(doc, [shelf, left], 1));
  });

  it('a block whose broad face is its length: CAM_JOINT_ON_EDGE', () => {
    const { doc: d, left } = carcass();
    const block = createBoard({ id: 'block', name: 'Block', posture: 'flat', length: 0.6, width: 12, thickness: 2, position: [0.75, 10, 0] });
    const doc = migrateDocument({ ...d, boards: [...d.boards, block] });
    expect(camJointPlan(doc, ['block', left], null, null)).toBe(CAM_JOINT_ON_EDGE('Block'));
  });

  it('two whole cam locks at that end: CAM_JOINT_TWO_LOCKS; two at the OTHER end do not count', () => {
    const { doc: d, left, right, shelf } = carcass();
    const s = part(d, shelf);
    const lock = (end: 'min' | 'max', station: number, n: number): HoleRow[] => {
      const [cam, bolt] = defaultCamLock(s, end, 1)!;
      return [{ ...cam, station, id: `c${end}${n}` }, { ...bolt, station, id: `b${end}${n}` }];
    };
    const two = patched(d, shelf, (b) => ({ ...b, holes: [...lock('min', 2, 1), ...lock('min', 6, 2)] }));
    expect(camPairRows(part(two, shelf))).toHaveLength(2);
    expect(camJointPlan(two, [shelf, left], null, null)).toBe(CAM_JOINT_TWO_LOCKS('Shelf'));
    const p = planOf(two, [shelf, right]);
    expect(p.reused.a).toBe(false);
  });

  it("a cam lock at that end that isn't whole: CAM_JOINT_PARTIAL", () => {
    const { doc: d, left, shelf } = carcass();
    const [cam, bolt] = defaultCamLock(part(d, shelf), 'min', 1)!;
    // One cam; a bolt row of two whose first hole pairs with it, the second unpaired.
    const rows: HoleRow[] = [{ ...cam, station: 2, id: 'c' }, { ...bolt, station: 2, count: 2, pitch: 4, id: 'b' }];
    const doc = patched(d, shelf, (b) => ({ ...b, holes: rows }));
    expect(camRowIds(part(doc, shelf)).size).toBe(2);
    expect(camPairRows(part(doc, shelf))).toEqual([]);
    expect(camJointPlan(doc, [shelf, left], null, null)).toBe(CAM_JOINT_PARTIAL('Shelf'));
    // The same partial lock plus a whole one: still partial (the whole one is not the only lock there).
    const [c2, b2] = defaultCamLock(part(d, shelf), 'min', 1)!;
    const both = patched(d, shelf, (b) => ({ ...b, holes: [...rows, { ...c2, station: 10, id: 'c2' }, { ...b2, station: 10, id: 'b2' }] }));
    expect(camPairRows(part(both, shelf))).toHaveLength(1);
    expect(camJointPlan(both, [shelf, left], null, null)).toBe(CAM_JOINT_PARTIAL('Shelf'));
  });

  it('two locks is decided before partial', () => {
    const { doc: d, left, shelf } = carcass();
    const s = part(d, shelf);
    const [cam, bolt] = defaultCamLock(s, 'min', 1)!;
    const holes: HoleRow[] = [
      { ...cam, station: 1.5, id: 'c1' }, { ...bolt, station: 1.5, id: 'b1' },
      { ...cam, station: 5, id: 'c2' }, { ...bolt, station: 5, id: 'b2' },
      { ...cam, station: 9, id: 'c3' }, { ...bolt, station: 9, count: 2, pitch: 1.5, id: 'b3' },
    ];
    const doc = patched(d, shelf, (b) => ({ ...b, holes }));
    expect(camPairRows(part(doc, shelf))).toHaveLength(2);
    expect(camJointPlan(doc, [shelf, left], null, null)).toBe(CAM_JOINT_TWO_LOCKS('Shelf'));
  });

  it("a shelf-pin row on the side that the bore meets: camJointFaulted naming the side", () => {
    const { doc: d, left, shelf } = carcass();
    const p = planOf(d, [shelf, left]);
    const bore = writeOf(p, left).holes[0]!;
    // A 1/4" pin hole centred on the first bore's mouth.
    const pin: HoleRow = { ...bore, id: 'pin', diameter: 0.25, depth: 0.375 };
    const doc = patched(d, left, (b) => ({ ...b, holes: [pin] }));
    expect(camJointPlan(doc, [shelf, left], null, null)).toBe(camJointFaulted('Left side', 'meet another hole'));
  });

  it("the shelf's own fault: a hole where the cam goes, named on the shelf, before the side's", () => {
    const { doc: d, left, shelf } = carcass();
    const p = planOf(d, [shelf, left]);
    const cam = camPairRows({ ...part(d, shelf), holes: writeOf(p, shelf).holes })[0]!.cam;
    const pinS: HoleRow = { ...cam, id: 'pinS', count: 1, pitch: 0, diameter: 0.25, depth: 0.25 };
    const pinL: HoleRow = { ...writeOf(p, left).holes[0]!, id: 'pinL', diameter: 0.25, depth: 0.375 };
    const doc = patched(patched(d, shelf, (b) => ({ ...b, holes: [pinS] })), left, (b) => ({ ...b, holes: [pinL] }));
    expect(camJointPlan(doc, [shelf, left], null, null)).toBe(camJointFaulted('Shelf', 'meet another hole'));
  });

  it('byte for byte: the plan does not mutate the document', () => {
    const { doc, left, shelf } = carcass();
    const before = structuredClone(doc);
    planOf(doc, [shelf, left], 3, 'max');
    camJointPlan(doc, [shelf, left], 0, null);
    expect(doc).toEqual(before);
    const next = apply(doc, planOf(doc, [shelf, left]));
    const again = structuredClone(next);
    camJointPlan(next, [shelf, left], null, null);
    expect(next).toEqual(again);
  });
});

describe('the panel helpers: defaultCamJointCount, camFaceOptions, defaultCamFrom', () => {
  it('a flat shelf: two fittings (12" ≥ 150 mm); Underside (the default) and Top', () => {
    const { doc, left, shelf } = carcass();
    expect(defaultCamJointCount(doc, [shelf, left])).toBe(2);
    expect(defaultCamFrom(doc, [shelf, left])).toBe('min');
    expect(camFaceOptions(doc, [left, shelf])).toEqual([{ from: 'min', label: 'Underside' }, { from: 'max', label: 'Top' }]);
    const narrow = patched(doc, shelf, (b) => ({ ...b, width: 3 }));
    expect(defaultCamJointCount(narrow, [shelf, left])).toBe(1);
    // A reused pair: its own count.
    const three = apply(doc, { writes: [writeOf(planOf(doc, [shelf, left], 3), shelf)] });
    expect(defaultCamJointCount(three, [shelf, left])).toBe(3);
  });

  it('a shelf turned 180: still the face pointing down', () => {
    const { doc: d, left, shelf } = carcass();
    const doc = patched(d, shelf, (b) => ({ ...b, rotation: 180 }));
    const from = defaultCamFrom(doc, [shelf, left])!;
    const p = planOf(doc, [shelf, left]);
    expect(p.camFrom).toBe(from);
    const s = { ...part(doc, shelf), holes: writeOf(p, shelf).holes };
    const { cam } = camPairRows(s)[0]!;
    expect(holeInstances(s, cam).map((h) => toWorld(s, pt(h.centre))[1])).toEqual([10, 10]);
    expect(camFaceOptions(doc, [shelf, left])![0]).toEqual({ from, label: 'Underside' });
  });

  it("a rail on edge (broad face on Z): 'max' by default, named Front and Back", () => {
    const { doc: d, left } = carcass();
    const rail = createBoard({ id: 'rail', name: 'Rail', posture: 'on-edge', length: 22.5, width: 3, thickness: 0.75, position: [0.75, 10, 0] });
    const doc = migrateDocument({ ...d, boards: [...d.boards, rail] });
    expect(boardExtents(part(doc, 'rail'))).toEqual([22.5, 3, 0.75]);
    expect(defaultCamFrom(doc, ['rail', left])).toBe('max');
    const opts = camFaceOptions(doc, ['rail', left])!;
    expect(opts.map((o) => o.from).sort()).toEqual(['max', 'min']);
    const r = part(doc, 'rail');
    // Each label is the world direction its cam bore enters from: Front (+Z) for the face whose cam mouth is at z = 0.75.
    for (const o of opts) {
      const cam: HoleRow = { ...defaultCamLock(r, 'min', 1, o.from)![0], id: 'c' };
      const z = toWorld(r, pt(holeInstances(r, cam)[0]!.centre))[2];
      expect(o.label).toBe(z === 0.75 ? 'Front' : 'Back');
    }
    expectJoined(doc, planOf(doc, ['rail', left]));
  });

  it("a divider standing on a bottom (broad face on X): named Left and Right", () => {
    const bottom = createBoard({ id: 'bottom', name: 'Bottom', posture: 'flat', length: 24, width: 12, thickness: 0.75, position: [0, 0, 0] });
    const divider = createBoard({
      id: 'div', name: 'Divider', posture: 'upright', rotation: 90, length: 20, width: 12, thickness: 0.75, position: [10, 0.75, 0],
    });
    const doc = migrateDocument({ ...createDocument('Divider'), boards: [bottom, divider] });
    expect(defaultCamFrom(doc, ['div', 'bottom'])).toBe('max');
    expect(camFaceOptions(doc, ['div', 'bottom'])!.map((o) => o.label).sort()).toEqual(['Left', 'Right']);
    expectJoined(doc, planOf(doc, ['div', 'bottom']));
  });

  it('no joint: null from each', () => {
    const { doc, left, right } = carcass();
    expect(defaultCamJointCount(doc, [left, right])).toBeNull();
    expect(camFaceOptions(doc, [left, right])).toBeNull();
    expect(defaultCamFrom(doc, [left, right])).toBeNull();
  });
});
