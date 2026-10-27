import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { createBoard, createDocument, migrateDocument, snapPointsFor, worldParts } from '../document/document';
import type { Board, Cut, Dovetail, HoleRow, SloydDocument } from '../document/document';
import { applyDovetails, dovetailPlan } from '../document/dovetails';
import { dovetailMoveClear, dovetailRemoveFirst, DOVETAIL_NO_CORNER, DOVETAIL_SLOPE_RANGE } from '../document/dovetailText';
import { boxPlainStock } from '../document/boxJointText';
import { defaultMiter } from '../document/angleCuts';
import { archCurve } from '../document/curves';
import { defaultProfile, profileOf } from '../document/profiles';
import { BUILT_IN_BAND_ID } from '../document/bandModel';
import { squareStoolDocument, stoolDocument } from '../document/stoolFixture';

/**
 * Dovetails Task 5: the store actions (`dovetailCorners`, `removeDovetail`) and the other features' refusals on a
 * dovetailed part (spec §3.6): each decided before `edit()`, the sentence returned, the document untouched, no entry.
 */
const s = () => useStore.getState();
const setup = (doc: SloydDocument) => {
  useStore.setState({ doc, selectedIds: [], openPath: null, hiddenIds: [], past: [], future: [], tool: 'select', grabbed: null, tapeAnchor: null, tapeHover: null, tapeAxis: null, explode: 0, gesturing: false, gestureSnapshotTaken: false });
};

/** Task 4's drawer (copied): Front/Back 3/4" on edge between the sides, 1/2", running the full depth; 6" tall. */
function drawer(): SloydDocument {
  const h = 6, tS = 0.5, tFB = 0.75, iw = 12, id = 16;
  const fb = (i: string, name: string, z: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 0, length: iw, width: h, thickness: tFB, position: [tS, 0, z] });
  const side = (i: string, name: string, x: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 90, length: id + 2 * tFB, width: h, thickness: tS, position: [x, 0, 0] });
  return { ...createDocument('Drawer'), boards: [fb('f', 'Front', 0), fb('b', 'Back', id + tFB), side('l', 'Side left', 0), side('r', 'Side right', iw + tS)] };
}
const IDS = ['f', 'b', 'l', 'r'];
/** The drawer dovetailed by the planner (not by the store under test). Side left: 17.5" long, tails 3/4" deep at both
 *  ends, so its zones are length [0, 3/4] and [16 3/4, 17 1/2]. */
function dovetailed(): SloydDocument {
  const doc = drawer();
  const plan = dovetailPlan(doc, IDS, { slope: 8, count: null, swap: false });
  if (typeof plan === 'string') throw new Error(plan);
  return applyDovetails(doc, plan);
}
const part = (id: string) => worldParts(s().doc).find((b) => b.id === id)!;
/** A refusal: the sentence, the document the SAME object, no undo entry. */
function expectRefused(run: () => string | null, sentence: string) {
  const before = s().doc;
  const json = JSON.stringify(before);
  expect(run()).toBe(sentence);
  expect(s().doc).toBe(before);
  expect(JSON.stringify(s().doc)).toBe(json);
  expect(s().past.length).toBe(0);
}
/** As expectRefused, after earlier accepted edits in the same test (the undo stack is not empty). */
function expectRefusedAfter(run: () => string | null, sentence: string) {
  const before = s().doc;
  const n = s().past.length;
  expect(run()).toBe(sentence);
  expect(s().doc).toBe(before);
  expect(s().past.length).toBe(n);
}
const dado = (offset: number, over: Partial<Cut> = {}): Cut => ({
  id: 'c1', face: 'thickness', from: 'max', across: 'width', offset, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0, ...over,
});
const row = (station: number, over: Partial<HoleRow> = {}): Omit<HoleRow, 'id'> => ({
  face: 'thickness', from: 'max', diameter: 0.25, depth: 0.25, along: 'length', alongFrom: 'min', station, count: 1, pitch: 1,
  acrossFrom: 'min', inset: 3, ...over,
});

describe('dovetailCorners (dovetails spec §4, §6)', () => {
  beforeEach(() => setup(drawer()));

  it('the drawer: ONE undo entry; undo restores the before exactly', () => {
    const before = s().doc;
    expect(s().dovetailCorners(IDS, 8, null, false)).toBeNull();
    expect(s().past.length).toBe(1);
    expect(worldParts(s().doc).every((b) => (b.dovetails ?? []).length === 2)).toBe(true);
    s().undo();
    expect(s().doc).toEqual(before);
    expect(s().past.length).toBe(0);
  });

  it('a refusal returns the planner sentence and pushes nothing', () => {
    expectRefused(() => s().dovetailCorners(['f', 'b'], 8, null, false), DOVETAIL_NO_CORNER);
    expectRefused(() => s().dovetailCorners(IDS, 3, null, false), DOVETAIL_SLOPE_RANGE);
  });

  it('exploded or gesturing: null and nothing done; a stale id: null and nothing done', () => {
    const before = s().doc;
    useStore.setState({ explode: 0.5 });
    expect(s().dovetailCorners(IDS, 8, null, false)).toBeNull();
    useStore.setState({ explode: 0, gesturing: true });
    expect(s().dovetailCorners(IDS, 8, null, false)).toBeNull();
    useStore.setState({ gesturing: false });
    expect(s().dovetailCorners([...IDS, 'gone'], 8, null, false)).toBeNull();
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
  });

  it('a held tape point the joint swallows is dropped (inv 24: judgeHeld runs after the edit)', () => {
    const front = part('f');
    // A point of the Front that the finished joint no longer offers, found on a trial copy (box joints' store test).
    const plan = dovetailPlan(s().doc, IDS, { slope: 8, count: null, swap: false });
    if (typeof plan === 'string') throw new Error(plan);
    const after = worldParts(applyDovetails(s().doc, plan)).find((b) => b.id === 'f')!;
    const afterPoints = snapPointsFor(after);
    const gone = snapPointsFor(front).find((q) => !afterPoints.some((r) => r.kind === q.kind && r.at.every((v, i) => Math.abs(v - q.at[i]!) <= 1e-9)));
    expect(gone).toBeDefined();
    useStore.setState({ tapeAnchor: gone! });
    expect(s().dovetailCorners(IDS, 8, null, false)).toBeNull();
    expect(s().tapeAnchor).toBeNull();
  });
});

describe('removeDovetail (as removeTenon)', () => {
  beforeEach(() => setup(dovetailed()));

  it('removes that end only, one entry; the last one leaves no dovetails key (never [])', () => {
    const [a, b] = part('l').dovetails!;
    s().removeDovetail('l', a!.id);
    expect(part('l').dovetails).toEqual([b]);
    expect(s().past.length).toBe(1);
    expect(part('f').dovetails).toHaveLength(2);   // the partner keeps its own (spec §4)
    s().removeDovetail('l', b!.id);
    expect('dovetails' in part('l')).toBe(false);
    expect('dovetails' in (s().doc.boards.find((x) => x.id === 'l') as Board)).toBe(false);
    expect(s().past.length).toBe(2);
  });

  it('a stale id, exploded or gesturing: nothing done', () => {
    const before = s().doc;
    s().removeDovetail('l', 'nope');
    s().removeDovetail('gone', 'nope');
    useStore.setState({ explode: 0.5 });
    s().removeDovetail('l', part('l').dovetails![0]!.id);
    useStore.setState({ explode: 0, gesturing: true });
    s().removeDovetail('l', part('l').dovetails![0]!.id);
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
  });
});

describe('a dovetailed part refuses another feature\'s ADD (spec §3.6): `<part> has dovetails — remove them first.`', () => {
  beforeEach(() => setup(dovetailed()));
  const NO = dovetailRemoveFirst('Side left');

  it('addAngleCuts', () => expectRefused(() => s().addAngleCuts('l', [defaultMiter(part('l'))]), NO));
  it('addCurves', () => expectRefused(() => s().addCurves('l', [archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 4, span: 6, rise: 1 })]), NO));
  it('addProfiles', () => expectRefused(() => s().addProfiles('l', [profileOf(defaultProfile(part('l'), 'roundover'))!]), NO));
  it('setBands (adding a band); clearing is never refused', () => {
    expectRefused(() => s().setBands(['l'], [{ across: 'width', from: 'max' }], BUILT_IN_BAND_ID), NO);
    expect(s().setBands(['l'], [{ across: 'width', from: 'max' }], null)).toBeNull();
  });
  it('setLean (a lean); Clear is never refused', () => {
    expectRefused(() => s().setLean(['l'], { rake: 5 }), NO);
    expect(s().setLean(['l'], null)).toBeNull();
  });
  it('addTenon', () => expectRefused(() => s().addTenon('l', 'max', 0.25, 0.5), NO));
  it('boxJointCorners: box joints\' plain-stock sentence with `dovetails`', () =>
    expectRefused(() => s().boxJointCorners(IDS, 0.5, false), boxPlainStock('Front', 'dovetails')));
});

describe('a cut or hole reaching a dovetailed end refuses (spec §3.6): `<part> has dovetails there — move it clear of the joint.`', () => {
  const CLEAR = dovetailMoveClear('Side left');

  it('addCut: the default dado (a quarter of the way along) lands in a short part\'s zone', () => {
    const tails: Dovetail = { id: 'd1', dim: 'length', end: 'min', role: 'tails', count: 1, slope: 8, pin: 0.25, depth: 0.75 };
    setup({ ...createDocument('T'), boards: [createBoard({ id: 's', name: 'Short', length: 2, width: 4, thickness: 0.5, dovetails: [tails] })] });
    expectRefused(() => s().addCut('s'), dovetailMoveClear('Short'));
    // The same default on a long dovetailed part is clear of its zones, and added.
    setup(dovetailed());
    expect(s().addCut('l')).toBeNull();
    expect(part('l').cuts).toHaveLength(1);
  });

  it('updateCut: an edit moving a dado into the zone refuses; one staying clear is taken', () => {
    const doc = dovetailed();
    setup({ ...doc, boards: doc.boards.map((b) => (b.id === 'l' ? { ...b, cuts: [dado(8)] } : b)) });
    expectRefused(() => s().updateCut('l', 'c1', { offset: 0.5 }), CLEAR);
    expectRefused(() => s().updateCut('l', 'c1', { offset: 16.5 }), CLEAR);
    expect(s().updateCut('l', 'c1', { offset: 16.25 })).toBeNull();   // [16.25, 16.75]: ends at the zone face
    expect(part('l').cuts[0]!.offset).toBe(16.25);
  });

  /** The drawer with Side left's bottom groove (along its length, end to end) carried through by the planner. */
  const grooved = () => {
    const groove = dado(0.5, { across: 'length', width: 0.25, depth: 0.25 });
    const doc0 = drawer();
    const doc1 = { ...doc0, boards: doc0.boards.map((b) => (b.id === 'l' ? { ...b, cuts: [groove] } : b)) };
    const plan = dovetailPlan(doc1, IDS, { slope: 8, count: null, swap: false });
    if (typeof plan === 'string') throw new Error(plan);
    setup(applyDovetails(doc1, plan));
    expect(part('l').cuts).toHaveLength(1);
  };

  // Fix round 1 (controller ruling): flipped from "any edit of it refuses" — a groove running straight THROUGH the end is
  // exempt (spec §3.6; the corner planner's ONE predicate, `cutRunsThrough`).
  it('updateCut: a depth edit of the carried groove is taken', () => {
    grooved();
    expect(s().updateCut('l', 'c1', { depth: 0.3 })).toBeNull();
    expect(part('l').cuts[0]!.depth).toBe(0.3);
    expect(s().past.length).toBe(1);
  });

  it('updateCut: an edit that stops the groove short inside the zone refuses', () => {
    grooved();
    expectRefused(() => s().updateCut('l', 'c1', { stopMin: 0.5 }), CLEAR);
    expectRefused(() => s().updateCut('l', 'c1', { stopMax: 0.25 }), CLEAR);
  });

  it('updateCut: a new through groove is accepted; a cut across the dovetail\'s run is not exempt', () => {
    const doc = dovetailed();
    setup({ ...doc, boards: doc.boards.map((b) => (b.id === 'l' ? { ...b, cuts: [dado(8)] } : b)) });
    expect(s().updateCut('l', 'c1', { across: 'length', offset: 0.5, width: 0.25 })).toBeNull();
    expect(part('l').cuts[0]!.across).toBe('length');
    // A dado across the width at the very end (a rabbet) meets the zone and does not run along the length: refused.
    expectRefusedAfter(() => s().updateCut('l', 'c1', { across: 'width', offset: 0, width: 0.5 }), CLEAR);
  });

  it('addHoleRows: a row whose hole touches the zone refuses; one clear of it is added', () => {
    setup(dovetailed());
    expectRefused(() => s().addHoleRows('l', [row(8), row(0.8)]), CLEAR);   // 0.8 - 0.125 = 0.675 < 3/4
    expect(s().addHoleRows('l', [row(8), row(1)])).toBeNull();
    expect(part('l').holes).toHaveLength(2);
  });

  it('updateHoleRow: an edit moving a row into the zone refuses', () => {
    setup(dovetailed());
    expect(s().addHoleRows('l', [row(8)])).toBeNull();
    const id = part('l').holes[0]!.id;
    useStore.setState({ past: [] });
    expectRefused(() => s().updateHoleRow('l', id, row(17)), CLEAR);
    expect(s().updateHoleRow('l', id, row(9))).toBeNull();
  });

  it('addStretcher: a socket in a dovetailed leg\'s zone refuses', () => {
    const doc0 = squareStoolDocument();
    // Every leg (one Shape) dovetailed at its bottom, 10" deep: the rung's sockets at 6" sit in the zone.
    const tall: Dovetail = { id: 'dl', dim: 'length', end: 'min', role: 'tails', count: 1, slope: 8, pin: 0.25, depth: 10 };
    setup(migrateDocument({ ...doc0, shapes: doc0.shapes.map((sh) => ({ ...sh, dovetails: [tall] })) }));
    const leg = (n: string) => worldParts(s().doc).find((b) => b.name === n)!;
    expect(leg('Front right').dovetails).toHaveLength(1);
    const before = s().doc;
    const r = s().addStretcher([leg('Front right').id, leg('Front left').id], 6, 1, 5 / 8);
    expect([dovetailMoveClear('Front right'), dovetailMoveClear('Front left')]).toContain(r);
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
  });

  it('boreLegSockets: a socket in the dovetailed seat\'s zone refuses', () => {
    const doc0 = stoolDocument();
    const tails: Dovetail = { id: 'ds', dim: 'length', end: 'min', role: 'tails', count: 1, slope: 8, pin: 0.25, depth: 7.5 };
    setup({ ...doc0, boards: doc0.boards.map((b) => (b.name === 'Seat' ? { ...b, dovetails: [tails] } : b)) });
    const seat = worldParts(s().doc).find((b) => b.name === 'Seat')!;
    expectRefused(() => s().boreLegSockets(seat.id, 1), dovetailMoveClear('Seat'));
  });

  it('boreLegSockets with Tenon the legs: fitting a round tenon to a dovetailed leg refuses with the add sentence', () => {
    const doc0 = stoolDocument();
    const tails: Dovetail = { id: 'dl', dim: 'length', end: 'min', role: 'tails', count: 1, slope: 8, pin: 0.25, depth: 1 };
    setup(migrateDocument({ ...doc0, shapes: doc0.shapes.map((sh) => ({ ...sh, dovetails: [tails] })) }));
    const seat = worldParts(s().doc).find((b) => b.name === 'Seat')!;
    const legNames = worldParts(s().doc).filter((b) => b.name !== 'Seat').map((b) => b.name);
    const before = s().doc;
    const r = s().boreLegSockets(seat.id, 1, true);
    expect(legNames.map(dovetailRemoveFirst)).toContain(r);
    expect(s().doc).toBe(before);
    expect(s().past.length).toBe(0);
    // Off (no leg touched), the seat's sockets are bored as ever: the legs' dovetails are not in the way.
    expect(s().boreLegSockets(seat.id, 1)).toBeNull();
    expect(s().past.length).toBe(1);
  });
});
