import { describe, expect, it } from 'vitest';
import type { Board, HoleRow, SloydDocument } from './types';
import type { Units } from '../units/length';
import type { V3 } from './angleCuts';
import { createBoard, migrateDocument } from './document';
import { defaultCamLock, holeInstances, mm } from './holes';
import { camPairRows } from './camBolt';
import { boreAlongAxis, boreEnds, boreRow, type WorldAxis } from './legSockets';
import { toWorld } from './snapPoints';
import { displayNames, worldParts } from './tree';
import { mapWorld } from './treeEdit';
import { carcass } from './camJointFixtures';
import { camJointPlan, type CamJointPlan } from './camJoint';
import { CAM_JOINT_ALREADY, CAM_JOINT_TWO_FITS } from './camJointText';

// Fit the cam-and-bolt joint again (fu 602; fit-again spec §3): B's loose bores, the nearest shifted set, moved in place.
// Local helpers copied from `camJoint.plan.test.ts` (never import a test module).

const MM: Units = { display: 'metric-mm', precision: 16 };
const part = (doc: SloydDocument, id: string) => worldParts(doc).find((b) => b.id === id)!;
const nameOf = (doc: SloydDocument, id: string) => displayNames(doc).get(id)!;
/** `doc` with root part `id` patched (no re-migration: the planner reads what is stored). */
const patched = (doc: SloydDocument, id: string, f: (b: Board) => Board): SloydDocument =>
  ({ ...doc, boards: doc.boards.map((b) => (b.id === id ? f(b as Board) : b)) });
/** `doc` with root part `id` moved by `dy` in y (position only). */
const movedY = (doc: SloydDocument, id: string, dy: number) =>
  patched(doc, id, (b) => ({ ...b, position: [b.position[0], b.position[1] + dy, b.position[2]] }));

function planOf(doc: SloydDocument, ids: [string, string], count: number | null = null, camFrom: 'min' | 'max' | null = null): CamJointPlan {
  const p = camJointPlan(doc, ids, count, camFrom);
  if (typeof p === 'string') throw new Error(p);
  return p;
}
/** The store's write, each entry through `mapWorld`, and the reload guard (ruling R17): every row survives `migrateDocument`. */
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

/** The carcass with the shelf joined to the left side; `ids` the side's two joint bores, in its list order. */
function joined(units?: Units) {
  const { doc, left, shelf } = carcass(units);
  const first = planOf(doc, [shelf, left]);
  const next = apply(doc, first);
  return { doc: next, left, shelf, ids: added(part(doc, left).holes, part(next, left).holes).map((r) => r.id) };
}

/** A plan that moved B's rows in place: B's write has the same ids at the same indices, every moved row is coaxial with a
 *  bolt of A's pair, A's write is unchanged; applied, the joint re-plans as `CAM_JOINT_ALREADY`. */
function expectFitted(doc: SloydDocument, p: CamJointPlan, ids: string[]) {
  const { a, b } = p.joint;
  expect(p.reused.a).toBe(true);
  expect(p.moved).toEqual(ids);
  const before = part(doc, b).holes;
  const after = writeOf(p, b).holes;
  expect(after.map((r) => r.id)).toEqual(before.map((r) => r.id));
  expect(writeOf(p, a).holes).toEqual(part(doc, a).holes);
  const A = part(doc, a);
  const B = { ...part(doc, b), holes: after };
  const axes = boltAxes(A, camPairRows(A).find((x) => x.bolt.face === 'length' && x.bolt.from === p.joint.end)!.bolt);
  for (const id of ids) {
    const r = after.find((x) => x.id === id)!;
    expect(axes.some((axis) => boreAlongAxis(B, r, axis)), `${id} on a bolt's axis`).toBe(true);
  }
  // Rows not moved stay byte for byte.
  before.forEach((r, i) => { if (!ids.includes(r.id)) expect(after[i]).toEqual(r); });
  const next = apply(doc, p);
  expect(camJointPlan(next, [a, b], null, null)).toBe(CAM_JOINT_ALREADY(nameOf(next, a), nameOf(next, b)));
  return next;
}

describe('Fit again: the basic fit (spec §3.2, §6)', () => {
  it('shelf moved up 2": moves both of the side\'s bores in place, ids and indices kept, coaxial; then CAM_JOINT_ALREADY', () => {
    const { doc, left, shelf, ids } = joined();
    expect(ids).toHaveLength(2);
    const moved = movedY(doc, shelf, 2);
    const p = planOf(moved, [shelf, left]);
    expect(p.reused).toEqual({ a: true, b: 0 });
    expect(writeOf(p, left).holes).toHaveLength(2);
    expectFitted(moved, p, ids);
  });

  it('the side moved down 1" instead: the same fit', () => {
    const { doc, left, shelf, ids } = joined();
    const moved = movedY(doc, left, -1);
    expect(part(moved, left).position[0]).toBe(part(doc, left).position[0]);
    expectFitted(moved, planOf(moved, [shelf, left]), ids);
  });

  it('metric: shelf moved up 50 mm fits', () => {
    const { doc, left, shelf, ids } = joined(MM);
    const moved = movedY(doc, shelf, mm(50));
    expectFitted(moved, planOf(moved, [shelf, left]), ids);
  });

  it('a 2 mm move fits (the trial list replaces the row, never appends a copy that meets its old self)', () => {
    const { doc, left, shelf, ids } = joined();
    const moved = movedY(doc, shelf, mm(2));
    const p = camJointPlan(moved, [shelf, left], null, null);
    if (typeof p === 'string') throw new Error(p);
    expect(p.moved).toHaveLength(2);
    expectFitted(moved, p, ids);
  });
});

describe('Fit again: the nearest set', () => {
  it('three shelves on one side, the side moved 1": each shelf fits its own bores', () => {
    const { doc: d0, left, shelf } = carcass();
    const base = part(d0, shelf);
    const extra = (id: string, name: string, y: number) => createBoard({ ...base, holes: [], id, name, position: [base.position[0], y, base.position[2]] });
    let doc = migrateDocument({ ...d0, boards: [...d0.boards, extra('shelf2', 'Shelf 2', 15), extra('shelf3', 'Shelf 3', 20)] });
    const shelves = [shelf, 'shelf2', 'shelf3'];
    const own = new Map<string, string[]>();
    for (const s of shelves) {
      const next = apply(doc, planOf(doc, [s, left]));
      own.set(s, added(part(doc, left).holes, part(next, left).holes).map((r) => r.id));
      doc = next;
    }
    const moved = movedY(doc, left, 1);
    // Every plan read off the SAME moved document: the shelf's own set is the nearest, never the first in the side's list.
    for (const s of shelves) expect(planOf(moved, [s, left]).moved, s).toEqual(own.get(s));
    // Applied in turn, every plan succeeds and takes its own.
    let cur = moved;
    for (const s of shelves) {
      const p = planOf(cur, [s, left]);
      expect(p.moved, s).toEqual(own.get(s));
      cur = expectFitted(cur, p, own.get(s)!);
    }
  });

  it('a tie refuses: CAM_JOINT_TWO_FITS', () => {
    const { doc: d, left, shelf, ids } = joined();
    const l = part(d, left);
    const copies = ids.map((id, i) => {
      const r = l.holes.find((x) => x.id === id)!;
      const [m, f] = boreEnds(l, r);
      const mouth: V3 = [m[0], m[1] + 2, m[2]];
      const u: V3 = [f[0] - m[0], f[1] - m[1], f[2] - m[2]];
      return { ...boreRow(l, r.face, r.from, mouth, u, mm(5), mm(12)), id: `copy${i}` };
    });
    const doc = movedY(patched(d, left, (b) => ({ ...b, holes: [...b.holes, ...copies] })), shelf, 1);
    expect(camJointPlan(doc, [shelf, left], null, null)).toBe(CAM_JOINT_TWO_FITS('Left side'));
  });

  it('a bore that lines up with ANOTHER shelf\'s bolt is never loose, even when nearer', () => {
    const { doc: d0, left, shelf } = carcass();
    const base = part(d0, shelf);
    let doc = migrateDocument({ ...d0, boards: [...d0.boards,
      createBoard({ ...base, holes: [], id: 'shelf2', name: 'Shelf 2', position: [base.position[0], 13, base.position[2]] })] });
    const own = new Map<string, string[]>();
    for (const s of [shelf, 'shelf2']) {
      const next = apply(doc, planOf(doc, [s, left]));
      own.set(s, added(part(doc, left).holes, part(next, left).holes).map((r) => r.id));
      doc = next;
    }
    const moved = movedY(doc, shelf, 2); // y 12: shelf 2's bores 1" off the new axes, its own 2"
    const p = planOf(moved, [shelf, left]);
    expect(p.moved).toEqual(own.get(shelf));
    const before = part(moved, left).holes;
    for (const id of own.get('shelf2')!) {
      expect(writeOf(p, left).holes.find((r) => r.id === id)).toEqual(before.find((r) => r.id === id));
    }
    expectFitted(moved, p, own.get(shelf)!);
  });
});

describe('Fit again: what is adopted and what never is (spec §3.1)', () => {
  it('a hand-placed Cam bolt bore off its axis is adopted', () => {
    const { doc: d0, left, shelf } = carcass();
    const s = part(d0, shelf);
    const pair = defaultCamLock(s, 'min')!.map((r, i) => ({ ...r, id: `lock${i}` }));
    const withLock = patched(d0, shelf, (b) => ({ ...b, holes: pair }));
    // The rows the planner would add, each moved 3 mm up its face: hand bores off the bolt axes.
    const planned = writeOf(planOf(withLock, [shelf, left]), left).holes;
    const l = part(withLock, left);
    const hand = planned.map((r, i) => {
      const [m, f] = boreEnds(l, r);
      return { ...boreRow(l, r.face, r.from, [m[0], m[1] + mm(3), m[2]], [f[0] - m[0], f[1] - m[1], f[2] - m[2]], mm(5), mm(12)), id: `hand${i}` };
    });
    const doc = patched(withLock, left, (b) => ({ ...b, holes: hand }));
    expect(planOf(doc, [shelf, left]).moved).toEqual(['hand0', 'hand1']);
    expectFitted(doc, planOf(doc, [shelf, left]), ['hand0', 'hand1']);
  });

  describe('never a candidate: no fit, the bores added as today', () => {
    /** The joined carcass with both of the side's joint bores rewritten by `f`, then the shelf moved up 2". */
    function variant(f: (r: HoleRow, b: Board) => HoleRow) {
      const { doc, left, shelf, ids } = joined();
      const rewritten = patched(doc, left, (b) => ({ ...b, holes: b.holes.map((r) => (ids.includes(r.id) ? f(r, b) : r)) }));
      const moved = movedY(rewritten, shelf, 2);
      const p = planOf(moved, [shelf, left]);
      expect(p.moved).toEqual([]);
      expect(added(part(moved, left).holes, writeOf(p, left).holes)).toHaveLength(2);
      expect(writeOf(p, left).holes.slice(0, 2)).toEqual(part(moved, left).holes);
    }
    it('a bore 6 mm across', () => variant((r) => ({ ...r, diameter: mm(6) })));
    it('a bore 10 mm deep', () => variant((r) => ({ ...r, depth: mm(10) })));
    it('a headed bore', () => variant((r) => ({ ...r, head: 'counterbore', headDiameter: mm(10), headDepth: mm(3) })));
    it('a tilted bore', () => variant((r) => ({ ...r, tiltAlong: 5 })));
    it('a two-count row (its first hole where the old bore was)', () => variant((r) => ({ ...r, count: 2, pitch: 1 })));
    it("a bore on the side's OUTER face", () => variant((r, b) => {
      const [m, f] = boreEnds(b, r);
      const out: V3 = [m[0] - b.thickness, m[1], m[2]]; // the side's thickness runs along world X
      expect(out[0]).toBeCloseTo(0, 12);
      return { ...boreRow(b, r.face, r.from === 'min' ? 'max' : 'min', out, [m[0] - f[0], m[1] - f[1], m[2] - f[2]], mm(5), mm(12)), id: r.id };
    }));
  });

  it('one of two old bores deleted: no fit, Add as today', () => {
    const { doc: d, left, shelf, ids } = joined();
    const doc = movedY(patched(d, left, (b) => ({ ...b, holes: b.holes.filter((r) => r.id !== ids[1]) })), shelf, 2);
    const p = planOf(doc, [shelf, left]);
    expect(p.moved).toEqual([]);
    expect(writeOf(p, left).holes).toHaveLength(3);
    expect(writeOf(p, left).holes[0]).toEqual(part(doc, left).holes[0]);
  });

  it("the shelf's pair count changed to 3 in its rows: no fit", () => {
    const { doc: d, left, shelf } = joined();
    const s = part(d, shelf);
    const three = defaultCamLock(s, 'min', 3, 'min')!;
    const { cam, bolt } = camPairRows(s)[0]!;
    const relaid = patched(d, shelf, (b) => ({ ...b, holes: b.holes.map((r) => {
      const t = r.id === cam.id ? three[0] : r.id === bolt.id ? three[1] : null;
      return t ? { ...r, count: t.count, pitch: t.pitch } : r;
    }) }));
    expect(camPairRows(part(relaid, shelf))).toHaveLength(1);
    expect(camPairRows(part(relaid, shelf))[0]!.bolt.count).toBe(3);
    const doc = movedY(relaid, shelf, 2);
    const p = planOf(doc, [shelf, left]);
    expect(p.fittings).toBe(3);
    expect(p.moved).toEqual([]);
    expect(added(part(doc, left).holes, writeOf(p, left).holes)).toHaveLength(3);
  });

  it('byte for byte: with nothing loose the plan is today\'s plus moved: []', () => {
    const { doc, left, shelf } = carcass();
    const before = JSON.stringify(doc);
    const p = planOf(doc, [shelf, left]);
    expect(p).toEqual({ joint: p.joint, fittings: p.fittings, camFrom: p.camFrom, reused: p.reused, writes: p.writes, notes: p.notes, moved: [] });
    expect(Object.keys(p).sort()).toEqual(['camFrom', 'fittings', 'joint', 'moved', 'notes', 'reused', 'writes']);
    expect(JSON.stringify(doc)).toBe(before);
    // A reused pair with a bare side: nothing loose, the bores added.
    const withPair = apply(doc, { writes: [writeOf(p, shelf)] });
    const q = planOf(withPair, [shelf, left]);
    expect(q.reused).toEqual({ a: true, b: 0 });
    expect(q.moved).toEqual([]);
    expect(writeOf(q, left).holes).toHaveLength(2);
    // A fit does not mutate its input either.
    const moved = movedY(apply(doc, p), shelf, 2);
    const m0 = JSON.stringify(moved);
    planOf(moved, [shelf, left]);
    expect(JSON.stringify(moved)).toBe(m0);
  });
});
