import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, flatDocument } from './document';
import { applyDovetails, autoLap, autoTailCount, dovetailFaults, dovetailPlan, type DovetailOptions, type DovetailPlan } from './dovetails';
import {
  DOVETAIL_COUNT_WHOLE, DOVETAIL_LAP_PARSE, DOVETAIL_NO_CORNER, DOVETAIL_SLOPE_RANGE,
} from './dovetailText';
import { DOVETAIL_COUNT_MAX, dovetailsOf } from './dovetailModel';
import { builtDovetails } from './dovetails';
import { applyBoxJoints, boxJointPlan, fingerSets } from './boxJoints';
import { expectLapSlab, expectPartition, type WorldBox } from './dovetailFixtures';
import { boardExtents, endFacing } from './geometry';
import { toWorld } from './snapPoints';
import { worldParts } from './tree';
import { sharedOf } from './links';
import { inverseTurn, mirrorDim } from './frames';
import { buildCutList } from './cutlist';
import { taperCut } from './angleCuts';
import { archCurve } from './curves';
import { BUILT_IN_BAND_ID, withBands } from './bandModel';
import { IMPERIAL, formatLength, type Units } from '../units/length';
import type {
  AngleCut, Board, Cut, CurveCut, Dovetail, HoleRow, Lean, Posture, ProfileCut, Rotation, Shape, ShapedBoard,
  SloydDocument,
} from './types';

/**
 * The dovetail planner (dovetails Task 4; spec §3.1–§3.3, §3.6, §6, G3): box joints' corner planner (`cornerPlan.ts`) with
 * the dovetail kind. Every corner square is read off the INPUT fixture's outside faces (inv 23), never off a planned part.
 */

const METRIC: Units = { display: 'metric-mm', precision: 1 };
const DEFAULTS: DovetailOptions = { slope: 8, count: null, swap: false };
type Vec = [number, number, number];

/** A butt drawer (box joints' planner fixture with two thicknesses): Front/Back on edge along X (thickness `tFB` on Z)
 *  between the sides, which run the full depth, on edge turned 90 along Z (thickness `tS` on X); `h` tall, inside
 *  `iw` × `id`. Its outside: X [0, iw + 2·tS], Z [0, id + 2·tFB]. */
interface DrawerOpts { h?: number; tS?: number; tFB?: number; iw?: number; id?: number }
function drawerParts(o: DrawerOpts = {}): Board[] {
  const { h = 6, tS = 0.5, tFB = 0.75, iw = 12, id = 16 } = o;
  const fb = (id_: string, name: string, z: number) => createBoard({
    id: id_, name, posture: 'on-edge', rotation: 0, length: iw, width: h, thickness: tFB, position: [tS, 0, z],
  });
  const side = (id_: string, name: string, x: number) => createBoard({
    id: id_, name, posture: 'on-edge', rotation: 90, length: id + 2 * tFB, width: h, thickness: tS, position: [x, 0, 0],
  });
  return [fb('f', 'Front', 0), fb('b', 'Back', id + tFB), side('l', 'Side left', 0), side('r', 'Side right', iw + tS)];
}
/** The drawer's four corner squares, from its outside faces: [front-or-back id, side id, box]. */
function drawerCorners(o: DrawerOpts = {}): [string, string, WorldBox][] {
  const { h = 6, tS = 0.5, tFB = 0.75, iw = 12, id = 16 } = o;
  const X = { l: [0, tS], r: [iw + tS, iw + 2 * tS] } as const;
  const Z = { f: [0, tFB], b: [id + tFB, id + 2 * tFB] } as const;
  return (['f', 'b'] as const).flatMap((fb) => (['l', 'r'] as const).map((s) => [fb, s, {
    min: [X[s][0], 0, Z[fb][0]] as Vec, max: [X[s][1], h, Z[fb][1]] as Vec,
  }] as [string, string, WorldBox]));
}
const docOf = (boards: Board[], extra: Partial<SloydDocument> = {}): SloydDocument => ({ ...createDocument('Drawer'), boards, ...extra });
const DRAWER_IDS = ['f', 'b', 'l', 'r'];
const ok = (p: DovetailPlan | string): DovetailPlan => {
  if (typeof p === 'string') throw new Error(`refused: ${p}`);
  return p;
};
const part = (doc: SloydDocument, id: string) => worldParts(doc).find((b) => b.id === id)!;
/** A refusal: the sentence, and the document untouched (the same `boards` object, the same JSON). */
const expectRefusal = (doc: SloydDocument, ids: string[], sentence: string, opts: Partial<DovetailOptions> = {}) => {
  const before = JSON.stringify(doc);
  const boards = doc.boards;
  expect(dovetailPlan(doc, ids, { ...DEFAULTS, ...opts })).toBe(sentence);
  expect(doc.boards).toBe(boards);
  expect(JSON.stringify(doc)).toBe(before);
};
/** Every planned dovetail BUILDS (authoring never stores a fault) and the part's dovetails, stripped of ids. */
const noIds = (b: Board) => dovetailsOf(b).map(({ id: _id, ...rest }) => rest);
const allBuild = (doc: SloydDocument) => {
  for (const b of worldParts(doc)) expect(builtDovetails(b).length).toBe(dovetailsOf(b).length);
};
/** The world coordinate, on `axis`, of `b`'s thickness face `face` (read through `toWorld`, never `endFacing`). */
const thicknessFaceAt = (b: Board, face: 'min' | 'max', axis: number) =>
  toWorld(b, { length: b.length / 2, width: b.width / 2, thickness: face === 'min' ? 0 : b.thickness })[axis]!;
const tailsOf = (plan: DovetailPlan) => [...new Set(plan.corners.map((c) => c.tails))].sort();

describe('dovetailPlan (spec §3): the drawer, defaults', () => {
  it('4 corners, tails on the sides; the stored dovetails; pins narrow on the outside; notes; the partition', () => {
    const doc = docOf(drawerParts());
    const plan = ok(dovetailPlan(doc, DRAWER_IDS, DEFAULTS));
    expect(plan.corners).toHaveLength(4);
    expect(plan.corners.every((c) => c.N === 4 && c.s === 8)).toBe(true);
    expect(tailsOf(plan)).toEqual(['l', 'r']);
    expect(plan.notes).toEqual([
      'Dovetailed 4 corners: 4 tails, 1:8.',
      'Tails on Side left, Side right.',
      'Front is now 1" longer.',
      'Back is now 1" longer.',
    ]);
    const out = applyDovetails(doc, plan);
    for (const id of ['l', 'r']) {
      expect(noIds(part(out, id))).toEqual([
        { dim: 'length', end: 'min', role: 'tails', count: 4, slope: 8, pin: 0.25, depth: 0.75 },
        { dim: 'length', end: 'max', role: 'tails', count: 4, slope: 8, pin: 0.25, depth: 0.75 },
      ]);
      // Tails carry no `outside` key at all.
      expect(dovetailsOf(part(out, id)).every((d) => !('outside' in d))).toBe(true);
    }
    // Front/Back: pins, the tail part's thickness deep, narrow on the face AWAY from the drawer's inside (Front: world
    // Z = 0; Back: world Z = id + 2·tFB = 17.5), read through toWorld.
    for (const [id, outsideZ] of [['f', 0], ['b', 17.5]] as const) {
      const b = part(out, id);
      const ds = dovetailsOf(b);
      expect(ds.map((d) => [d.dim, d.end, d.role, d.count, d.slope, d.pin, d.depth])).toEqual([
        ['length', 'min', 'pins', 4, 8, 0.25, 0.5], ['length', 'max', 'pins', 4, 8, 0.25, 0.5],
      ]);
      for (const d of ds) expect(thicknessFaceAt(b, d.outside!, 2)).toBe(outsideZ);
    }
    allBuild(out);
    for (const [fb, s, box] of drawerCorners()) expectPartition(part(out, s), part(out, fb), box);
  });

  it('swap: tails on Front and Back, the sides take the pins narrow on their outside faces', () => {
    const doc = docOf(drawerParts());
    const plan = ok(dovetailPlan(doc, DRAWER_IDS, { ...DEFAULTS, swap: true }));
    expect(tailsOf(plan)).toEqual(['b', 'f']);
    expect(plan.notes[1]).toBe('Tails on Front, Back.');
    const out = applyDovetails(doc, plan);
    for (const [id, outsideX] of [['l', 0], ['r', 13]] as const) {
      const b = part(out, id);
      for (const d of dovetailsOf(b)) {
        expect([d.role, d.depth]).toEqual(['pins', 0.75]);
        expect(thicknessFaceAt(b, d.outside!, 0)).toBe(outsideX);
      }
    }
    for (const id of ['f', 'b']) expect(dovetailsOf(part(out, id)).map((d) => [d.role, d.depth])).toEqual([['tails', 0.5], ['tails', 0.5]]);
    allBuild(out);
    for (const [fb, s, box] of drawerCorners()) expectPartition(part(out, fb), part(out, s), box);
  });

  it('a metric drawer: the pin is 6 mm, Auto at 38 mm', () => {
    const mm = (v: number) => v / 25.4;
    const o = { h: mm(152), tS: mm(12), tFB: mm(18), iw: mm(300), id: mm(400) };
    const doc = docOf(drawerParts(o), { units: METRIC });
    const plan = ok(dovetailPlan(doc, DRAWER_IDS, DEFAULTS));
    expect(plan.corners.every((c) => c.N === 4)).toBe(true);
    const out = applyDovetails(doc, plan);
    expect(dovetailsOf(part(out, 'l'))[0]!.pin).toBe(6 / 25.4);
    expect(plan.notes.slice(2)).toEqual(['Front is now 24 mm longer.', 'Back is now 24 mm longer.']);
    allBuild(out);
    for (const [fb, s, box] of drawerCorners(o)) expectPartition(part(out, s), part(out, fb), box);
  });

  it('empty corners (every part between the others): every part runs out to the outside faces exactly', () => {
    const parts = drawerParts().map((b) => (b.id === 'l' || b.id === 'r' ? { ...b, length: 16, position: [b.position[0], 0, 0.75] as Vec } : b));
    const doc = docOf(parts);
    const out = applyDovetails(doc, ok(dovetailPlan(doc, DRAWER_IDS, DEFAULTS)));
    expect(['f', 'b', 'l', 'r'].map((id) => part(out, id).length)).toEqual([13, 13, 17.5, 17.5]);
    allBuild(out);
    for (const [fb, s, box] of drawerCorners()) expectPartition(part(out, s), part(out, fb), box);
  });
});

describe('dovetailPlan: a run along the WIDTH', () => {
  it('a flat top jointed across its width into an upright side: dim width, the partition', () => {
    // Top: flat turned 90 (width along X, thickness Y [10, 10.75], length 6 along Z = J). Side: upright turned 90
    // (thickness X [0, 3/4], length up Y to 10.75, width 6 along Z). Corner square X [0, 3/4], Y [10, 10.75], Z [0, 6].
    const top = createBoard({ id: 't', name: 'Top', posture: 'flat', rotation: 90, length: 6, width: 10, thickness: 0.75, position: [0, 10, 0] });
    const side = createBoard({ id: 's', name: 'Side', posture: 'upright', rotation: 90, length: 10.75, width: 6, thickness: 0.75, position: [0, 0, 0] });
    expect(boardExtents(top)).toEqual([10, 0.75, 6]);
    expect(boardExtents(side)).toEqual([0.75, 10.75, 6]);
    const doc = docOf([top, side]);
    const plan = ok(dovetailPlan(doc, ['t', 's'], DEFAULTS));
    expect(plan.corners.map((c) => [c.tails, c.N])).toEqual([['t', 4]]);
    const out = applyDovetails(doc, plan);
    expect(dovetailsOf(part(out, 't')).map((d) => [d.dim, d.role])).toEqual([['width', 'tails']]);
    expect(dovetailsOf(part(out, 's')).map((d) => [d.dim, d.role])).toEqual([['length', 'pins']]);
    allBuild(out);
    expectPartition(part(out, 't'), part(out, 's'), { min: [0, 10, 0], max: [0.75, 10.75, 6] });
  });
});

describe('dovetailPlan: the count (spec §3.2)', () => {
  it('Auto lowering: a 6" corner of two 1-1/2" parts at 1:4 starts at 4 and lowers to 2 (4 and 3 fault narrow)', () => {
    const [f, , l] = drawerParts({ tS: 1.5, tFB: 1.5 });
    const doc = docOf([f!, l!]);
    expect(autoTailCount(6, IMPERIAL)).toBe(4);
    // The planned board's narrow fault, decided by the ONE decider, at 4 and 3 and not at 2.
    const probe = (count: number): Dovetail => ({ id: 'x', dim: 'length', end: 'min', role: 'tails', count, slope: 4, pin: 0.25, depth: 1.5 });
    expect([4, 3, 2].map((n) => dovetailFaults(l!, probe(n)))).toEqual([['narrow'], ['narrow'], []]);
    const plan = ok(dovetailPlan(doc, ['f', 'l'], { ...DEFAULTS, slope: 4 }));
    expect(plan.corners.map((c) => c.N)).toEqual([2]);
    expect(plan.notes[0]).toBe('Dovetailed 1 corner: 2 tails, 1:4.');
    allBuild(applyDovetails(doc, plan));
  });

  it('a 1-1/2" corner of the same stock at 1:4: even one tail faults, so it refuses (the count that failed)', () => {
    const [f, , l] = drawerParts({ h: 1.5, tS: 1.5, tFB: 1.5 });
    expectRefusal(docOf([f!, l!]), ['f', 'l'], 'Front and Side left are too narrow for even one tail at 1:4 — try a shallower slope or a wider part.', { slope: 4 });
  });

  it('a typed count applies to every corner, and refuses a corner it faults', () => {
    const doc = docOf(drawerParts());
    expect(ok(dovetailPlan(doc, DRAWER_IDS, { ...DEFAULTS, count: 2 })).corners.map((c) => c.N)).toEqual([2, 2, 2, 2]);
    expectRefusal(doc, DRAWER_IDS, 'Front and Side left are too narrow for 9 tails at 1:8 — try fewer tails.', { count: 9 });
  });

  it('per-corner layouts: the per-corner lines', () => {
    const a = drawerParts();
    const b = drawerParts({ h: 3 }).map((p) => ({ ...p, id: `${p.id}2`, name: `${p.name} 2`, position: [p.position[0] + 40, p.position[1], p.position[2]] as Vec }));
    const doc = docOf([a[0]!, a[2]!, b[0]!, b[2]!]);
    const plan = ok(dovetailPlan(doc, ['f', 'l', 'f2', 'l2'], DEFAULTS));
    expect(plan.notes.slice(0, 4)).toEqual([
      'Dovetailed 2 corners:', 'Front and Side left: 4 tails, 1:8.', 'Front 2 and Side left 2: 2 tails, 1:8.', 'Tails on Side left, Side left 2.',
    ]);
  });
});

describe('dovetailPlan: re-plan (spec G3: change only what is asked)', () => {
  it('a null count KEEPS the stored count (not Auto) and the current tails part keeps tails', () => {
    const doc0 = docOf(drawerParts());
    const doc = applyDovetails(doc0, ok(dovetailPlan(doc0, DRAWER_IDS, { ...DEFAULTS, count: 3 })));
    // Auto would be 4 at either slope (the mutation's witness).
    expect(ok(dovetailPlan(doc0, DRAWER_IDS, { ...DEFAULTS, slope: 6 })).corners.map((c) => c.N)).toEqual([4, 4, 4, 4]);
    const plan = ok(dovetailPlan(doc, DRAWER_IDS, { slope: 6, count: null, swap: false }));
    expect(plan.corners.map((c) => [c.N, c.s])).toEqual([[3, 6], [3, 6], [3, 6], [3, 6]]);
    expect(tailsOf(plan)).toEqual(['l', 'r']);
    const out = applyDovetails(doc, plan);
    // Re-laid in place: lengths unchanged, one dovetail per end, the new slope.
    expect(['f', 'b', 'l', 'r'].map((id) => part(out, id).length)).toEqual([13, 13, 17.5, 17.5]);
    for (const id of DRAWER_IDS) expect(dovetailsOf(part(out, id)).map((d) => [d.count, d.slope])).toEqual([[3, 6], [3, 6]]);
    expect(plan.notes).toEqual(['Dovetailed 4 corners: 3 tails, 1:6.', 'Tails on Side left, Side right.']);
    allBuild(out);
    for (const [fb, s, box] of drawerCorners()) expectPartition(part(out, s), part(out, fb), box);
  });

  it('a kept count the new slope faults is lowered as Auto from the KEPT count (7 at 1:8 → 6 at 1:4; Auto would be 4)', () => {
    // 3/8" Front/Back: at 1:4 a tail at the baseline is Te − 3/16, a pin p + 3/16: 7 tails (Te 4/7) fault, 6 (Te 17/24) do not.
    const o = { tFB: 0.375 };
    const doc0 = docOf(drawerParts(o));
    const doc = applyDovetails(doc0, ok(dovetailPlan(doc0, DRAWER_IDS, { ...DEFAULTS, count: 7 })));
    expect(ok(dovetailPlan(doc0, DRAWER_IDS, { ...DEFAULTS, slope: 4 })).corners.map((c) => c.N)).toEqual([4, 4, 4, 4]);
    const plan = ok(dovetailPlan(doc, DRAWER_IDS, { slope: 4, count: null, swap: false }));
    expect(plan.corners.map((c) => c.N)).toEqual([6, 6, 6, 6]);
    allBuild(applyDovetails(doc, plan));
  });

  it('a typed count on a re-plan replaces the stored one', () => {
    const doc0 = docOf(drawerParts());
    const doc = applyDovetails(doc0, ok(dovetailPlan(doc0, DRAWER_IDS, { ...DEFAULTS, count: 3 })));
    expect(ok(dovetailPlan(doc, DRAWER_IDS, { ...DEFAULTS, count: 5 })).corners.map((c) => c.N)).toEqual([5, 5, 5, 5]);
  });

  it('Swap flips relative to the CURRENT side: after a swap, swap again returns tails to the sides; no swap keeps them', () => {
    const doc0 = docOf(drawerParts());
    const swapped = applyDovetails(doc0, ok(dovetailPlan(doc0, DRAWER_IDS, { ...DEFAULTS, swap: true })));
    expect(tailsOf(ok(dovetailPlan(swapped, DRAWER_IDS, { ...DEFAULTS, swap: false })))).toEqual(['b', 'f']);
    const back = ok(dovetailPlan(swapped, DRAWER_IDS, { ...DEFAULTS, swap: true }));
    expect(tailsOf(back)).toEqual(['l', 'r']);
    const out = applyDovetails(swapped, back);
    for (const id of ['l', 'r']) expect(dovetailsOf(part(out, id)).map((d) => d.role)).toEqual(['tails', 'tails']);
    for (const id of ['f', 'b']) expect(dovetailsOf(part(out, id)).every((d) => d.role === 'pins' && d.outside !== undefined)).toBe(true);
    allBuild(out);
    for (const [fb, s, box] of drawerCorners()) expectPartition(part(out, s), part(out, fb), box);
  });

  it('the re-plan rule reads the ORIGINAL parts: one corner dovetailed by hand with tails on Front stays that way', () => {
    // Only the Front–Side left corner: tails on Front (against the default) already, stored by a first swapped run.
    const [f, , l] = drawerParts();
    const doc0 = docOf([f!, l!]);
    const doc = applyDovetails(doc0, ok(dovetailPlan(doc0, ['f', 'l'], { ...DEFAULTS, swap: true })));
    const plan = ok(dovetailPlan(doc, ['f', 'l'], { ...DEFAULTS, slope: 6 }));
    expect(plan.corners.map((c) => c.tails)).toEqual(['f']);
  });
});

describe('dovetailPlan: linked parts (spec §6)', () => {
  /** The drawer with the sides linked to one Shape, Side right `mirrored` (its mirrorDim is its length, the run). */
  const linkSides = (parts: Board[]): SloydDocument => {
    const l = parts.find((b) => b.id === 'l')!;
    const shape: Shape = { id: 's1', ...sharedOf(l) };
    const user = (b: Board, mirrored: boolean): ShapedBoard =>
      ({ id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: 's1', ...(mirrored ? { mirrored: true as const } : {}) });
    return docOf(parts.map((b) => (b.id === 'l' ? user(b, false) : b.id === 'r' ? user(b, true) : b)) as Board[], { shapes: [shape] });
  };
  const oneShapeFor = (doc: SloydDocument, ids: string[]) => {
    const shapeIds = ids.map((id) => (doc.boards.find((b) => b.id === id) as ShapedBoard).shape);
    expect(shapeIds[0]).toBeDefined();
    expect(new Set(shapeIds).size).toBe(1);
  };
  const oneRow = (doc: SloydDocument, a: string, b: string) => {
    const rows = buildCutList(flatDocument(doc)).groups.flatMap((g) => g.rows);
    expect(rows.find((r) => r.names.includes(a))!.names).toEqual([a, b]);
  };

  it('linked mirrored drawer sides (tails): one Shape, one cut-list row, the partition', () => {
    const doc = linkSides(drawerParts());
    const out = applyDovetails(doc, ok(dovetailPlan(doc, DRAWER_IDS, DEFAULTS)));
    oneShapeFor(out, ['l', 'r']);
    oneRow(out, 'Side left', 'Side right');
    allBuild(out);
    for (const [fb, s, box] of drawerCorners()) expectPartition(part(out, s), part(out, fb), box);
  });

  /** Two upright sides (thickness on X, length up Y, width along Z = J; mirrorDim width) and a flat top between them,
   *  the sides linked to one Shape; `rm` Side right mirrored, `rRot` its turn. Outside: X [0, 25.5], Y [0, 30], Z [0, 11]. */
  const H = 11;
  const carcass = (rm: boolean, rRot: Rotation): SloydDocument => {
    const side = (id: string, name: string, x: number, rotation: Rotation) => createBoard({
      id, name, posture: 'upright', rotation, length: 30, width: H, thickness: 0.75, position: [x, 0, 0],
    });
    const l = side('l', 'Side left', 0, 90);
    const r = side('r', 'Side right', 24.75, rRot);
    expect(mirrorDim(l)).toBe('width');
    expect(boardExtents(r)).toEqual([0.75, 30, H]);
    const top = createBoard({ id: 't', name: 'Top', posture: 'flat', rotation: 0, length: 24, width: H, thickness: 0.75, position: [0.75, 29.25, 0] });
    const shape: Shape = { id: 's1', ...sharedOf(l) };
    const user = (b: Board, mirrored: boolean): ShapedBoard =>
      ({ id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: 's1', ...(mirrored ? { mirrored: true as const } : {}) });
    return docOf([user(l, false), user(r, rm), top] as Board[], { shapes: [shape] });
  };
  const CARCASS_CORNERS: [string, WorldBox][] = [
    ['l', { min: [0, 29.25, 0], max: [0.75, 30, H] }], ['r', { min: [24.75, 29.25, 0], max: [25.5, 30, H] }],
  ];
  const carcassOk = (doc: SloydDocument, swap: boolean) => {
    const plan = ok(dovetailPlan(doc, ['l', 'r', 't'], { ...DEFAULTS, swap }));
    expect(tailsOf(plan)).toEqual(swap ? ['l', 'r'] : ['t']);
    const out = applyDovetails(doc, plan);
    oneShapeFor(out, ['l', 'r']);
    oneRow(out, 'Side left', 'Side right');
    allBuild(out);
    for (const [s, box] of CARCASS_CORNERS) {
      if (swap) expectPartition(part(out, s), part(out, 't'), box);
      else expectPartition(part(out, 't'), part(out, s), box);
    }
  };

  it('linked carcass sides taking the TAILS, Side right mirrored along J at the same turn: succeeds (the palindrome)', () => {
    carcassOk(carcass(true, 90), true);
  });

  it('UNMIRRORED linked carcass sides at 90° and 270°, taking the pins: succeeds (spec §6)', () => {
    carcassOk(carcass(false, 270), false);
  });

  it("Mirror's own pair (a mirrored user at the inverse turn, as mirrorLinkedPart makes it), taking the pins: succeeds", () => {
    expect(inverseTurn(90)).toBe(270);
    carcassOk(carcass(true, inverseTurn(90)), false);
  });

  it('a mirrored side at the SAME turn taking the pins would be narrow on its INSIDE face: different dovetails, refused', () => {
    // A Z-reflection of Side left keeps its narrow face at world −X, which on the right side is the inside.
    expectRefusal(carcass(true, 90), ['l', 'r', 't'], 'These linked parts would need different dovetails: Side left, Side right.');
  });

  it('every posture and turn: mirrorDim is never the thickness (why EndFlips.thickness is false on every user)', () => {
    for (const posture of ['flat', 'on-edge', 'upright'] as Posture[]) {
      for (const rotation of [0, 90, 180, 270] as Rotation[]) {
        expect(mirrorDim(createBoard({ posture, rotation }))).not.toBe('thickness');
      }
    }
  });

  it('Front and Side left only, with the sides linked: the linked-mate sentence naming Side right', () => {
    expectRefusal(linkSides(drawerParts()), ['f', 'l'], "Side left is linked to Side right — select Side right's corner too, or Unlink first.");
  });

  it('every user mirrored on a non-dyadic size: the write would split the Shape, so the plan refuses (post-condition)', () => {
    // Box joints' fixture (found by search there): the empty metric drawer, the linked sides both mirrored, a dado across
    // Side left; lowering the run-out's re-faced dado back through the mirror is not bit-exact, so the Shape would split.
    const mm = (v: number) => v / 25.4;
    const t = mm(12);
    const parts = drawerParts({ h: mm(100), tS: t, tFB: t, iw: mm(300), id: mm(400) })
      .map((b) => (b.id === 'l' || b.id === 'r' ? { ...b, length: mm(400), position: [b.position[0], 0, t] as Vec } : b));
    const dado: Cut = { id: 'd', face: 'thickness', from: 'max', across: 'width', offset: mm(64), width: mm(12), depth: mm(6), stopMin: 0, stopMax: 0 };
    const l = { ...parts.find((b) => b.id === 'l')!, cuts: [dado] };
    const shape: Shape = { id: 's1', ...sharedOf(l) };
    const user = (b: Board): ShapedBoard => ({ id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: 's1', mirrored: true });
    const doc = docOf(parts.map((b) => (b.id === 'l' || b.id === 'r' ? user(b) : b)) as Board[], { shapes: [shape], units: METRIC });
    expectRefusal(doc, DRAWER_IDS, "Dovetails can't keep these linked parts linked: Side left, Side right. Unlink them first.");
  });

  it('linked fronts of two drawers that need different dovetails: the disagreement sentence', () => {
    const a = drawerParts();
    const b = drawerParts({ tS: 0.75 }).map((p) => ({
      ...p, id: `${p.id}2`, name: `${p.name} 2`, position: [p.position[0] + 40, p.position[1], p.position[2]] as Vec,
    }));
    const f = a.find((p) => p.id === 'f')!;
    const f2 = b.find((p) => p.id === 'f2')!;
    const shape: Shape = { id: 's3', ...sharedOf(f) };
    const user = (p: Board): ShapedBoard => ({ id: p.id, name: p.name, position: p.position, rotation: 0, shape: 's3' });
    const parts = [...a.filter((p) => p !== f), ...b.filter((p) => p !== f2)];
    const doc = docOf([...parts, user(f), user(f2)] as Board[], { shapes: [shape] });
    expectRefusal(doc, doc.boards.map((x) => x.id), 'These linked parts would need different dovetails: Front, Front 2.');
  });
});

describe('dovetailPlan: refusals (each leaves the document unchanged)', () => {
  const refuses = expectRefusal;
  const drawer = () => docOf(drawerParts());

  it('a slope outside 1:4 to 1:12 (before anything else)', () => {
    for (const slope of [3.9, 12.1, Number.NaN]) refuses(drawer(), DRAWER_IDS, DOVETAIL_SLOPE_RANGE, { slope });
    refuses(drawer(), DRAWER_IDS, DOVETAIL_SLOPE_RANGE, { slope: 2, count: 0 });
    refuses(docOf([]), [], DOVETAIL_SLOPE_RANGE, { slope: 2 });
  });

  it('a typed count not a whole number, 1 or more (before any corner work)', () => {
    for (const count of [0, -1, 2.5, Number.NaN]) refuses(drawer(), DRAWER_IDS, DOVETAIL_COUNT_WHOLE, { count });
    refuses(docOf([]), [], DOVETAIL_COUNT_WHOLE, { count: 0 });
  });

  it('the extremes of the slope range plan', () => {
    for (const slope of [4, 12]) expect(typeof dovetailPlan(drawer(), DRAWER_IDS, { ...DEFAULTS, slope })).toBe('object');
  });

  it('no corner at all', () => {
    const [f, b] = drawerParts();
    refuses(docOf([f!, b!]), ['f', 'b'], DOVETAIL_NO_CORNER);
  });

  it('a part inside a mirrored copy', () => {
    const doc: SloydDocument = {
      ...createDocument('M'), boards: [],
      instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0, mirrored: true }],
      definitions: [{ id: 'd1', boards: drawerParts(), instances: [], hardware: [] }],
    };
    refuses(doc, DRAWER_IDS.map((id) => `i1/${id}`), "Dovetails can't reach a part inside a mirrored copy yet: Drawer › Front.");
  });

  it('the parts of a corner in different containers', () => {
    const [f, , l] = drawerParts();
    const doc: SloydDocument = {
      ...createDocument('C'), boards: [f!],
      instances: [{ id: 'i1', name: 'Box', definition: 'd1', position: [0, 0, 0], rotation: 0 }],
      definitions: [{ id: 'd1', boards: [l!], instances: [], hardware: [] }],
    };
    refuses(doc, ['f', 'i1/l'], 'Front and Box › Side left must be in the same assembly.');
  });

  it('different heights along the joint', () => {
    refuses(docOf(drawerParts().map((b) => (b.id === 'l' ? { ...b, width: 5 } : b))), DRAWER_IDS, 'Front and Side left must be the same height along the joint.');
  });

  it('one end meeting two parts', () => {
    const parts = drawerParts();
    refuses(docOf([...parts, { ...parts[2]!, id: 'l2', name: 'Side left 2' }]), [...DRAWER_IDS, 'l2'], 'Front meets two parts at one end.');
  });

  it('a three-way corner', () => {
    // Every part run to the outside, and a bottom under them jointed along its edges.
    const parts = drawerParts().map((b) => (b.id === 'f' || b.id === 'b' ? { ...b, length: 13, position: [0, 0, b.position[2]] as Vec } : b));
    const bottom = createBoard({ id: 'bt', name: 'Bottom', posture: 'flat', rotation: 0, length: 13, width: 17.5, thickness: 0.5, position: [0, 0, 0] });
    refuses(docOf([...parts, bottom]), [...DRAWER_IDS, 'bt'], "Front would be dovetailed on two different edges — that isn't supported yet.");
  });

  describe('plain stock only (spec §3.6)', () => {
    const tenon = { id: 'rt', end: 'max' as const, diameter: 0.25, length: 0.5 };
    const angle = { id: 'ac', ...taperCut({ face: 'thickness', from: 'max', end: 'min', amount: 0.125, start: 6 }) } as AngleCut;
    const curve = { id: 'cv', ...archCurve({ through: 'thickness', along: 'length', side: 'max', from: 'min', start: 4, span: 4, rise: 0.5 }) } as CurveCut;
    const profile: ProfileCut = { id: 'pf', face: 'max', kind: 'roundover', size: 0.125, facing: 'face',
      run: { start: { side: { across: 'width', from: 'max' }, from: 'min', at: 2 }, end: { side: { across: 'width', from: 'max' }, from: 'min', at: 8 } } };
    const bands = withBands([], [{ across: 'width', from: 'max' }], BUILT_IN_BAND_ID);
    const onBack = (patch: Partial<Board>) => drawerParts().map((b) => (b.id === 'b' ? { ...b, ...patch } : b));
    it.each([
      ['an angle cut', { angleCuts: [angle] }],
      ['a curve', { curves: [curve] }],
      ['an edge profile', { profiles: [profile] }],
      ['edge banding', { bands }],
      ['a round tenon', { tenons: [tenon] }],
    ] as [string, Partial<Board>][])('%s', (word, patch) => {
      refuses(docOf(onBack(patch)), DRAWER_IDS, `Back has ${word} — dovetails work on plain stock for now.`);
    });

    it('box joints (the part box-jointed first)', () => {
      const doc0 = drawer();
      const doc = applyBoxJoints(doc0, (() => {
        const p = boxJointPlan(doc0, DRAWER_IDS, { width: 0.5, swap: false });
        if (typeof p === 'string') throw new Error(p);
        return p;
      })());
      expect(fingerSets(part(doc, 'f')).length).toBeGreaterThan(0);
      refuses(doc, DRAWER_IDS, 'Front has box joints — dovetails work on plain stock for now.');
    });

    it('the copy order: a part with two features gets the earlier word', () => {
      refuses(docOf(onBack({ tenons: [tenon], angleCuts: [angle] })), DRAWER_IDS, 'Back has an angle cut — dovetails work on plain stock for now.');
    });

    it('a LEANING candidate: the lean sentence', () => {
      const side = (id: string, name: string, x: number, lean?: Lean) => createBoard({
        id, name, posture: 'upright', rotation: 90, length: 30, width: 11, thickness: 0.75, position: [x, 0, 0], ...(lean ? { lean } : {}),
      });
      const top = createBoard({ id: 't', name: 'Top', posture: 'flat', rotation: 0, length: 24, width: 11, thickness: 0.75, position: [0.75, 29.25, 0] });
      const doc = docOf([side('l', 'Side left', 0, { x: 0.05, z: 0, face: 'thickness' }), side('r', 'Side right', 24.75), top]);
      refuses(doc, ['l', 'r', 't'], 'Side left has a lean — dovetails work on plain stock for now.');
    });
  });

  /** Side left with one cut or hole at its end facing Front. */
  const sideWith = (patch: Partial<Board>) => drawerParts().map((b) => (b.id === 'l' ? { ...b, ...patch } : b));
  const frontEnd = () => endFacing(drawerParts()[2]!, 2, -1);

  it('a cut in the corner region that does not run through it', () => {
    const offset = frontEnd() === 'min' ? 0.1 : 17.5 - 0.3;
    const cut: Cut = { id: 'x', face: 'thickness', from: 'max', across: 'width', offset, width: 0.2, depth: 0.25, stopMin: 0, stopMax: 0 };
    refuses(docOf(sideWith({ cuts: [cut] })), DRAWER_IDS, 'Side left has a cut where the dovetails go — remove it first.');
  });

  it('an end-grain mortise in the jointed end (resizeEnd cannot re-face it): the cut sentence, not a throw', () => {
    // On the empty drawer the sides move, so the mortise's end must be re-faced.
    const parts = drawerParts().map((b) => (b.id === 'l' || b.id === 'r' ? { ...b, length: 16, position: [b.position[0], 0, 0.75] as Vec } : b));
    const cut: Cut = { id: 'x', face: 'length', from: endFacing(parts[2]!, 2, -1), across: 'width', offset: 0.15, width: 0.2, depth: 0.3, stopMin: 1, stopMax: 1 };
    refuses(docOf(parts.map((b) => (b.id === 'l' ? { ...b, cuts: [cut] } : b))), DRAWER_IDS, 'Side left has a cut where the dovetails go — remove it first.');
  });

  it('a hole touching the corner region', () => {
    const row: HoleRow = { id: 'h', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.25, along: 'length', alongFrom: frontEnd(), station: 0.25, count: 1, pitch: 1, acrossFrom: 'min', inset: 2 };
    refuses(docOf(sideWith({ holes: [row] })), DRAWER_IDS, 'Side left has a hole where the dovetails go — move or remove it first.');
  });

  it('a part shorter than its tails are deep (a degenerate corner): too short', () => {
    // P (0.3 long, its end in Q's 3/4" slab) runs out to 0.65 and would take tails 0.75 deep.
    const q = createBoard({ id: 'q', name: 'Q', posture: 'on-edge', rotation: 0, length: 7.8, width: 3, thickness: 0.75, position: [2.2, 0, 0] });
    const p = createBoard({ id: 'p', name: 'P', posture: 'on-edge', rotation: 90, length: 0.3, width: 3, thickness: 0.5, position: [2, 0, 0.1] });
    refuses(docOf([q, p]), ['q', 'p'], 'P is too short for its dovetails.');
  });

  it('a short part between two corners whose two tails would meet: too short', () => {
    // P runs along Z between A (slab Z [0, 3/4]) and B (slab Z [3/4, 1-1/2]): it runs out to 1-1/2, exactly its two tails'
    // depths together.
    const P = createBoard({ id: 'p', name: 'P', posture: 'on-edge', rotation: 90, length: 0.9, width: 3, thickness: 0.5, position: [0, 0, 0.3] });
    const ab = (id: string, name: string, z: number) => createBoard({ id, name, posture: 'on-edge', rotation: 0, length: 9.5, width: 3, thickness: 0.75, position: [0.5, 0, z] });
    refuses(docOf([P, ab('a', 'A', 0), ab('b', 'B', 0.75)]), ['p', 'a', 'b'], 'P is too short for its dovetails.');
    // 1/64" more room between A and B: it plans.
    const doc = docOf([P, ab('a', 'A', 0), ab('b', 'B', 0.75 + 1 / 64)]);
    allBuild(applyDovetails(doc, ok(dovetailPlan(doc, ['p', 'a', 'b'], DEFAULTS))));
  });

  it('a bottom groove running through the corner is carried (not refused)', () => {
    const groove = (id: string): Cut => ({ id, face: 'thickness', from: 'max', across: 'length', offset: 0.25, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 });
    const doc = docOf(drawerParts().map((b) => (b.id === 'l' || b.id === 'r' ? { ...b, cuts: [groove(`g${b.id}`)] } : b)));
    const out = applyDovetails(doc, ok(dovetailPlan(doc, DRAWER_IDS, DEFAULTS)));
    expect(part(out, 'l').cuts.map((c) => c.id)).toEqual(['gl']);
  });
});

describe('box joints on a dovetailed part (spec §3.6)', () => {
  it('boxJointPlan refuses with the dovetails word', () => {
    const doc0 = docOf(drawerParts());
    const doc = applyDovetails(doc0, ok(dovetailPlan(doc0, DRAWER_IDS, DEFAULTS)));
    const before = JSON.stringify(doc);
    const boards = doc.boards;
    expect(boxJointPlan(doc, DRAWER_IDS, { width: 0.5, swap: false })).toBe('Front has dovetails — box joints work on plain stock for now.');
    expect(doc.boards).toBe(boards);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('a part dovetailed at an end outside the selection keeps that dovetail through a re-plan of the other end', () => {
    const doc0 = docOf(drawerParts());
    const doc = applyDovetails(doc0, ok(dovetailPlan(doc0, DRAWER_IDS, DEFAULTS)));
    const out = applyDovetails(doc, ok(dovetailPlan(doc, ['f', 'l'], { ...DEFAULTS, slope: 6 })));
    expect(dovetailsOf(part(out, 'l')).map((d) => d.slope).sort()).toEqual([6, 8]);
    expect(dovetailsOf(part(out, 'r')).map((d) => d.slope)).toEqual([8, 8]);
  });
});


describe('final review fixes (2026-10-27): the count bound, one tail, the kept pin', () => {
  it('a typed count over DOVETAIL_COUNT_MAX refuses with the count sentence (load would drop it); the max itself plans', () => {
    expect(DOVETAIL_COUNT_MAX).toBe(100);
    // A part wide enough that 100 and 101 tails both build: the refusal is the bound's, not a fault's.
    const doc = docOf(drawerParts({ h: 160 }));
    expectRefusal(doc, DRAWER_IDS, DOVETAIL_COUNT_WHOLE, { count: DOVETAIL_COUNT_MAX + 1 });
    expect(ok(dovetailPlan(doc, DRAWER_IDS, { ...DEFAULTS, count: DOVETAIL_COUNT_MAX })).corners.map((c) => c.N))
      .toEqual([100, 100, 100, 100]);
  });

  it('Auto starts at most at DOVETAIL_COUNT_MAX (a 160" joint: round(160 / 1.5) = 107 → 100)', () => {
    expect(autoTailCount(160, IMPERIAL)).toBe(107);
    const plan = ok(dovetailPlan(docOf(drawerParts({ h: 160 })), DRAWER_IDS, DEFAULTS));
    expect(plan.corners.map((c) => c.N)).toEqual([100, 100, 100, 100]);
  });

  it('Auto bottoming out at one tail: the even-one-tail sentence', () => {
    const [f, , l] = drawerParts({ h: 1.5, tS: 1.5, tFB: 1.5 });
    expectRefusal(docOf([f!, l!]), ['f', 'l'],
      'Front and Side left are too narrow for even one tail at 1:4 — try a shallower slope or a wider part.', { slope: 4 });
  });

  it('a typed count of one that faults reads the same; a typed 2 or more keeps "try fewer tails"', () => {
    const [f, , l] = drawerParts({ h: 1.5, tS: 1.5, tFB: 1.5 });
    expectRefusal(docOf([f!, l!]), ['f', 'l'],
      'Front and Side left are too narrow for even one tail at 1:4 — try a shallower slope or a wider part.', { slope: 4, count: 1 });
    expectRefusal(docOf([f!, l!]), ['f', 'l'], 'Front and Side left are too narrow for 2 tails at 1:4 — try fewer tails.', { slope: 4, count: 2 });
  });

  it('one tail: the success note reads "1 tail"', () => {
    const doc = docOf(drawerParts());
    expect(ok(dovetailPlan(doc, DRAWER_IDS, { ...DEFAULTS, count: 1 })).notes[0]).toBe('Dovetailed 4 corners: 1 tail, 1:8.');
  });

  it('a re-plan keeps the stored pin width (G3): imperial dovetails, units switched to metric, Swap only → pin stays 1/4"', () => {
    const doc0 = docOf(drawerParts());
    const doc = applyDovetails(doc0, ok(dovetailPlan(doc0, DRAWER_IDS, DEFAULTS)));
    const metric = { ...doc, units: METRIC };
    const out = applyDovetails(metric, ok(dovetailPlan(metric, DRAWER_IDS, { ...DEFAULTS, swap: true })));
    for (const id of DRAWER_IDS) expect(dovetailsOf(part(out, id)).map((d) => d.pin)).toEqual([0.25, 0.25]);
    // The swap happened (the re-plan ran), and a NEW corner in the metric project takes 6 mm.
    expect(dovetailsOf(part(out, 'f')).map((d) => d.role)).toEqual(['tails', 'tails']);
    const fresh = applyDovetails({ ...doc0, units: METRIC }, ok(dovetailPlan({ ...doc0, units: METRIC }, DRAWER_IDS, DEFAULTS)));
    for (const id of DRAWER_IDS) expect(dovetailsOf(part(fresh, id)).map((d) => d.pin)).toEqual([6 / 25.4, 6 / 25.4]);
  });
});

// ---- Half-blind (half-blind dovetails spec §3.1, §3.2, §4, §6, §8; Task 3) ------------------------------------------

/** The half-blind corner squares of the drawer (the tail part's world box within the pin part, read off the INPUT fixture's
 *  outside faces, inv 23): the sides' Z span stops `lap` inside the Front's or Back's outside face. The lap slabs: the pin
 *  part's wood from its outside face to the lap plane, over the side's X span. */
function halfBlindCorners(lap: number, o: DrawerOpts = {}): [string, string, WorldBox, WorldBox][] {
  return drawerCorners(o).map(([fb, s, box]) => {
    const [z0, z1] = [box.min[2], box.max[2]];
    const inner: WorldBox = fb === 'f'
      ? { min: [box.min[0], box.min[1], z0 + lap], max: [...box.max] as Vec }
      : { min: [...box.min] as Vec, max: [box.max[0], box.max[1], z1 - lap] };
    const slab: WorldBox = fb === 'f'
      ? { min: [...box.min] as Vec, max: [box.max[0], box.max[1], z0 + lap] }
      : { min: [box.min[0], box.min[1], z1 - lap], max: [...box.max] as Vec };
    return [fb, s, inner, slab];
  });
}
const HB: DovetailOptions = { ...DEFAULTS, joint: 'half-blind' };
/** The world span of `b` on `axis`. */
const spanW = (b: Board, axis: number): [number, number] => [b.position[axis]!, b.position[axis]! + boardExtents(b)[axis]!];
const halfBlindDrawer = (o: DrawerOpts = {}, opts: Partial<DovetailOptions> = {}) => {
  const doc0 = docOf(drawerParts(o));
  return applyDovetails(doc0, ok(dovetailPlan(doc0, DRAWER_IDS, { ...HB, ...opts })));
};

describe('half-blind: the run-out (spec §3.1)', () => {
  for (const rotation of [90, 270] as Rotation[]) {
    it(`sides turned ${rotation}°: each side's front end lands on the lap plane (min side AND max side); depths; laps; the partition`, () => {
      const parts = drawerParts().map((b) => (b.id === 'l' || b.id === 'r' ? { ...b, rotation } : b));
      const doc = docOf(parts);
      // The lap planes, off the INPUT fixture: Front's outside face (world Z min) + 1/4", Back's outside face (world Z max) − 1/4".
      const front = parts.find((b) => b.id === 'f')!;
      const back = parts.find((b) => b.id === 'b')!;
      const zMin = spanW(front, 2)[0] + 0.25;
      const zMax = spanW(back, 2)[1] - 0.25;
      const out = applyDovetails(doc, ok(dovetailPlan(doc, DRAWER_IDS, HB)));
      for (const id of ['l', 'r']) {
        const s = part(out, id);
        const [a, b] = spanW(s, 2);
        expect(a).toBe(zMin);   // the min side: the moving MIN face lands exactly on the lap plane
        expect(b).toBe(zMax);   // the max side
        expect(s.length).toBe(17);
        for (const d of dovetailsOf(s)) expect([d.role, d.depth, d.lap]).toEqual(['tails', 0.5, 0.25]);
      }
      for (const id of ['f', 'b']) {
        const p = part(out, id);
        expect(p.length).toBe(13);
        for (const d of dovetailsOf(p)) expect([d.role, d.depth, d.lap]).toEqual(['pins', 0.5, 0.25]);
      }
      allBuild(out);
      for (const [fb, s, box, slab] of halfBlindCorners(0.25)) {
        expectPartition(part(out, s), part(out, fb), box);
        expectLapSlab(part(out, s), part(out, fb), slab);
      }
    });
  }

  it('a Shape-less re-plan back to through moves the end out to the outside face again', () => {
    const doc = halfBlindDrawer();
    const out = applyDovetails(doc, ok(dovetailPlan(doc, DRAWER_IDS, { ...DEFAULTS, joint: 'through' })));
    for (const id of ['l', 'r']) expect(spanW(part(out, id), 2)).toEqual([0, 17.5]);
  });
});

describe('half-blind: the lap (spec §3.2, Global Constraints)', () => {
  it('autoLap: a third, to 1/16" (at least 1/8") or a whole mm (at least 3 mm)', () => {
    expect([0.75, 0.625, 0.875, 0.5, 0.25].map((t) => autoLap(t, IMPERIAL))).toEqual([0.25, 0.1875, 0.3125, 0.1875, 0.125]);
    expect(autoLap(18 / 25.4, METRIC)).toBe(6 / 25.4);
    expect(autoLap(6 / 25.4, METRIC)).toBe(3 / 25.4);
  });

  it('Auto on the planner: 3/4" → 1/4", 5/8" → 3/16", 7/8" → 5/16", metric 18 mm → 6 mm; a typed lap is stored exactly', () => {
    const lapOf = (doc: SloydDocument) => [...new Set(DRAWER_IDS.flatMap((id) => dovetailsOf(part(doc, id)).map((d) => d.lap)))];
    expect(lapOf(halfBlindDrawer())).toEqual([0.25]);
    expect(lapOf(halfBlindDrawer({ tFB: 0.625 }))).toEqual([0.1875]);
    expect(lapOf(halfBlindDrawer({ tFB: 0.875 }))).toEqual([0.3125]);
    const mm = (v: number) => v / 25.4;
    const o = { h: mm(152), tS: mm(12), tFB: mm(18), iw: mm(300), id: mm(400) };
    const doc0 = docOf(drawerParts(o), { units: METRIC });
    expect(lapOf(applyDovetails(doc0, ok(dovetailPlan(doc0, DRAWER_IDS, HB))))).toEqual([6 / 25.4]);
    const typed = halfBlindDrawer({}, { lap: 0.3 });
    expect(lapOf(typed)).toEqual([0.3]);
    expect(dovetailsOf(part(typed, 'l')).map((d) => d.depth)).toEqual([0.75 - 0.3, 0.75 - 0.3]);
  });

  it("the narrow probe judges the pins on the TRUE extent (tP − lap): a 1-1/2\" front at 1:4 takes 3 tails half-blind, 2 through", () => {
    // Side left's tails: X = 1.5 − 0.5 = 1; a tail at the baseline Te − 1/2 against a pin 1/4 + 1/2 (Te < 1-1/4 faults):
    // 4 tails (Te 1-3/16) fault, 3 (Te 1-2/3) do not. Through, X = 1-1/2 (Te < 1-3/4 faults): 3 fault, 2 (Te 2-5/8) do not.
    const [f, , l] = drawerParts({ tFB: 1.5 });
    const doc = docOf([f!, l!]);
    expect(autoLap(1.5, IMPERIAL)).toBe(0.5);
    expect(ok(dovetailPlan(doc, ['f', 'l'], { ...DEFAULTS, slope: 4 })).corners.map((c) => c.N)).toEqual([2]);
    const plan = ok(dovetailPlan(doc, ['f', 'l'], { ...HB, slope: 4 }));
    expect(plan.corners.map((c) => c.N)).toEqual([3]);
    allBuild(applyDovetails(doc, plan));
  });

  it('a typed lap that is not more than 0 (0, negative, NaN) refuses with the Lap field\'s parse sentence', () => {
    for (const lap of [0, -0.1, Number.NaN]) {
      expectRefusal(docOf(drawerParts()), DRAWER_IDS, DOVETAIL_LAP_PARSE, { joint: 'half-blind', lap });
    }
  });

  it('a typed lap at or past the pin part\'s thickness refuses with the lap sentence, naming it', () => {
    for (const lap of [0.75, 1]) {
      expectRefusal(docOf(drawerParts()), DRAWER_IDS, `Front is too thin for a ${formatLength(lap, IMPERIAL)} lap.`, { joint: 'half-blind', lap });
    }
  });

  it('a typed lap on an all-through action is ignored: no lap key anywhere, the same plan as without it', () => {
    const doc = docOf(drawerParts());
    for (const joint of ['through', 'keep'] as const) {
      const a = ok(dovetailPlan(doc, DRAWER_IDS, { ...DEFAULTS, joint, lap: 0.3 }));
      const b = ok(dovetailPlan(doc, DRAWER_IDS, DEFAULTS));
      const out = applyDovetails(doc, a);
      for (const id of DRAWER_IDS) expect(dovetailsOf(part(out, id)).every((d) => !('lap' in d))).toBe(true);
      expect(a.notes).toEqual(b.notes);
      expect(DRAWER_IDS.map((id) => noIds(part(out, id)))).toEqual(DRAWER_IDS.map((id) => noIds(part(applyDovetails(doc, b), id))));
    }
  });
});

describe('half-blind: the Joint option on a re-plan (spec §4, H3)', () => {
  const sizes = (doc: SloydDocument) => DRAWER_IDS.map((id) => [part(doc, id).length, ...part(doc, id).position]);

  it('keep with only a new slope: still half-blind, the same lap, the sides unchanged (Review Focus 1)', () => {
    const doc = halfBlindDrawer();
    const plan = ok(dovetailPlan(doc, DRAWER_IDS, { ...DEFAULTS, slope: 6 }));
    const out = applyDovetails(doc, plan);
    expect(sizes(out)).toEqual(sizes(doc));
    for (const id of DRAWER_IDS) expect(dovetailsOf(part(out, id)).map((d) => [d.slope, d.lap])).toEqual([[6, 0.25], [6, 0.25]]);
    expect(plan.notes).toEqual(['Dovetailed 4 corners, half-blind: 4 tails, 1:6, 1/4" lap.', 'Tails on Side left, Side right.']);
    allBuild(out);
  });

  it('keep on new corners: through, byte for byte the plan with no joint given', () => {
    const doc = docOf(drawerParts());
    const a = ok(dovetailPlan(doc, DRAWER_IDS, { ...DEFAULTS, joint: 'keep' }));
    const b = ok(dovetailPlan(doc, DRAWER_IDS, DEFAULTS));
    expect(a.notes).toEqual(b.notes);
    const strip = (p: DovetailPlan) => JSON.stringify([...p.parts].map(([id, x]) => [id, { ...x, dovetails: noIds(x) }]));
    expect(strip(a)).toBe(strip(b));
  });

  it('through on a half-blind drawer: the sides lengthen by exactly the lap, and no lap key is left', () => {
    const doc = halfBlindDrawer();
    const plan = ok(dovetailPlan(doc, DRAWER_IDS, { ...DEFAULTS, joint: 'through' }));
    const out = applyDovetails(doc, plan);
    // Each side end moves out by exactly the lap (two ends: the side is 2 × 1/4" longer).
    for (const id of ['l', 'r']) {
      const [a0, a1] = spanW(part(doc, id), 2);
      expect(spanW(part(out, id), 2)).toEqual([a0 - 0.25, a1 + 0.25]);
      expect(part(out, id).length).toBe(part(doc, id).length + 0.5);
    }
    for (const id of DRAWER_IDS) expect(dovetailsOf(part(out, id)).every((d) => !('lap' in d))).toBe(true);
    expect(plan.notes.slice(0, 1)).toEqual(['Dovetailed 4 corners: 4 tails, 1:8.']);
    allBuild(out);
    for (const [fb, s, box] of drawerCorners()) expectPartition(part(out, s), part(out, fb), box);
  });

  it('half-blind on a through drawer: Auto lap (no stored lap to keep); the sides shorten by it', () => {
    const doc0 = docOf(drawerParts());
    const doc = applyDovetails(doc0, ok(dovetailPlan(doc0, DRAWER_IDS, DEFAULTS)));
    const out = applyDovetails(doc, ok(dovetailPlan(doc, DRAWER_IDS, HB)));
    for (const id of ['l', 'r']) expect(part(out, id).length).toBe(17);
    for (const id of DRAWER_IDS) expect(dovetailsOf(part(out, id)).map((d) => d.lap)).toEqual([0.25, 0.25]);
  });

  it('a re-plan with the pins part unchanged keeps a typed (non-Auto) stored lap', () => {
    const doc = halfBlindDrawer({}, { lap: 0.3 });
    for (const joint of ['keep', 'half-blind'] as const) {
      const out = applyDovetails(doc, ok(dovetailPlan(doc, DRAWER_IDS, { ...DEFAULTS, joint, slope: 6 })));
      for (const id of DRAWER_IDS) expect(dovetailsOf(part(out, id)).map((d) => d.lap)).toEqual([0.3, 0.3]);
    }
  });

  it('Swap on a half-blind corner: the lap is re-chosen by Auto from the NEW pin part (a 1/2" side: 3/16")', () => {
    const doc = halfBlindDrawer();
    for (const joint of ['keep', 'half-blind'] as const) {
      const plan = ok(dovetailPlan(doc, DRAWER_IDS, { ...DEFAULTS, joint, swap: true }));
      expect(tailsOf(plan)).toEqual(['b', 'f']);
      const out = applyDovetails(doc, plan);
      for (const id of ['l', 'r']) {
        expect(dovetailsOf(part(out, id)).map((d) => [d.role, d.depth, d.lap])).toEqual([['pins', 0.75, 0.1875], ['pins', 0.75, 0.1875]]);
        expect(spanW(part(out, id), 2)).toEqual([0, 17.5]);
      }
      for (const id of ['f', 'b']) {
        expect(dovetailsOf(part(out, id)).map((d) => [d.role, d.depth, d.lap])).toEqual([['tails', 0.5 - 0.1875, 0.1875], ['tails', 0.5 - 0.1875, 0.1875]]);
        // Front and Back stop 3/16" inside the sides' outside faces (X 0 and 13, off the input fixture).
        expect(spanW(part(out, id), 0)).toEqual([0.1875, 13 - 0.1875]);
      }
      allBuild(out);
    }
  });

  it('Swap with a typed lap thicker than the new pin part refuses with the lap sentence, never too-short (Review Focus 4)', () => {
    const sentence = `Side left is too thin for a ${formatLength(0.6, IMPERIAL)} lap.`;
    expectRefusal(halfBlindDrawer(), DRAWER_IDS, sentence, { joint: 'keep', swap: true, lap: 0.6 });
    expectRefusal(docOf(drawerParts()), DRAWER_IDS, sentence, { joint: 'half-blind', swap: true, lap: 0.6 });
    // The lap is decided before any end moves (planCorners 3a), so before step 4's plain-stock test on another part.
    const featured = docOf(drawerParts().map((b) => (b.id === 'b' ? { ...b, tenons: [{ id: 'rt', end: 'max' as const, diameter: 0.25, length: 0.5 }] } : b)));
    expectRefusal(featured, DRAWER_IDS, sentence, { joint: 'half-blind', swap: true, lap: 0.6 });
    // Without Swap the 3/4" front takes it.
    expect(typeof dovetailPlan(halfBlindDrawer(), DRAWER_IDS, { ...DEFAULTS, lap: 0.6 })).toBe('object');
  });

  it("disagreeing ends under keep (spec §8): the PINS entry's lap decides", () => {
    // Front + Side left dovetailed through, then a lap written by hand on one entry only.
    const [f, , l] = drawerParts();
    const doc0 = docOf([f!, l!]);
    const through = applyDovetails(doc0, ok(dovetailPlan(doc0, ['f', 'l'], DEFAULTS)));
    // Every part here is a plain board (no Shape), so the stored part is the world part.
    const withLap = (doc: SloydDocument, id: string): SloydDocument => ({
      ...doc, boards: (doc.boards as Board[]).map((b) => (b.id === id ? { ...b, dovetails: dovetailsOf(b).map((d) => ({ ...d, lap: 0.25 })) } : b)),
    });
    const onPins = withLap(through, 'f');
    const a = applyDovetails(onPins, ok(dovetailPlan(onPins, ['f', 'l'], DEFAULTS)));
    for (const id of ['f', 'l']) expect(dovetailsOf(part(a, id)).map((d) => d.lap)).toEqual([0.25]);
    expect(part(a, 'l').length).toBe(part(through, 'l').length - 0.25);
    const onTails = withLap(through, 'l');
    const b = applyDovetails(onTails, ok(dovetailPlan(onTails, ['f', 'l'], DEFAULTS)));
    for (const id of ['f', 'l']) expect(dovetailsOf(part(b, id)).every((d) => !('lap' in d))).toBe(true);
    expect(part(b, 'l').length).toBe(part(through, 'l').length);
  });
});

describe('half-blind: linked parts (spec §6)', () => {
  it('linked mirror-twin sides: succeed, the Shape carries the lap, one cut-list row, the partition', () => {
    const parts = drawerParts();
    const l = parts.find((b) => b.id === 'l')!;
    const shape: Shape = { id: 's1', ...sharedOf(l) };
    const user = (b: Board, mirrored: boolean): ShapedBoard =>
      ({ id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: 's1', ...(mirrored ? { mirrored: true as const } : {}) });
    const doc = docOf(parts.map((b) => (b.id === 'l' ? user(b, false) : b.id === 'r' ? user(b, true) : b)) as Board[], { shapes: [shape] });
    const out = applyDovetails(doc, ok(dovetailPlan(doc, DRAWER_IDS, HB)));
    const shapes = out.shapes.filter((s) => out.boards.some((b) => (b as ShapedBoard).shape === s.id && (b.id === 'l' || b.id === 'r')));
    expect(shapes).toHaveLength(1);
    expect((shapes[0]!.dovetails ?? []).map((d) => [d.role, d.depth, d.lap])).toEqual([['tails', 0.5, 0.25], ['tails', 0.5, 0.25]]);
    const rows = buildCutList(flatDocument(out)).groups.flatMap((g) => g.rows);
    expect(rows.find((r) => r.names.includes('Side left'))!.names).toEqual(['Side left', 'Side right']);
    allBuild(out);
    for (const [fb, s, box, slab] of halfBlindCorners(0.25)) {
      expectPartition(part(out, s), part(out, fb), box);
      expectLapSlab(part(out, s), part(out, fb), slab);
    }
  });
});

describe('half-blind: the success notes (spec §4)', () => {
  it('one shared layout; a mix of kinds takes the per-corner form', () => {
    const doc0 = docOf(drawerParts());
    const plan = ok(dovetailPlan(doc0, ['f', 'l', 'r'], HB));
    expect(plan.notes[0]).toBe('Dovetailed 2 corners, half-blind: 4 tails, 1:8, 1/4" lap.');
    // The front corners half-blind already, the back ones new (through under keep).
    const doc = applyDovetails(doc0, plan);
    const mixed = ok(dovetailPlan(doc, DRAWER_IDS, DEFAULTS));
    expect(mixed.notes.slice(0, 5)).toEqual([
      'Dovetailed 4 corners:',
      'Front and Side left: 4 tails, 1:8, half-blind, 1/4" lap.',
      'Front and Side right: 4 tails, 1:8, half-blind, 1/4" lap.',
      'Back and Side left: 4 tails, 1:8.',
      'Back and Side right: 4 tails, 1:8.',
    ]);
    expect(mixed.corners.map((c) => c.lap)).toEqual([0.25, 0.25, null, null]);
  });
});
