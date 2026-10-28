// `./dovetailText` FIRST (Task 5): the copy home must load on its own without an import cycle through `dovetails.ts`'s
// copy table (`DOVETAIL_COPY`, built at module top level from these sentences). The planner refusal below reads that table.
import { dovetailLine, dovetailMoveClear, DOVETAIL_NO_CORNER, dovetailPlainStock } from './dovetailText';
import { describe, expect, it } from 'vitest';
import { createBoard, createDocument } from './document';
import { applyDovetails, dovetailCutRefusal, dovetailPlan, dovetailZoneRefusal } from './dovetails';
import { worldParts } from './tree';
import { IMPERIAL, type Units } from '../units/length';
import type { Board, Cut, Dovetail, Region, SloydDocument } from './types';

/**
 * Dovetails Task 5: the cut-list line (`dovetailLine`, Global Constraints' wording; Task 7's `setupLines` calls it) and
 * the zone a dovetailed end keeps clear (`dovetailZoneRefusal`, spec §3.6's builder check).
 */

/** Task 4's drawer (copied, never imported from a test module): Front/Back on edge along X, 3/4" thick, between the sides,
 *  1/2" thick, running the full depth; 6" tall, inside 12 x 16. */
function drawer(): SloydDocument {
  const h = 6, tS = 0.5, tFB = 0.75, iw = 12, id = 16;
  const fb = (i: string, name: string, z: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 0, length: iw, width: h, thickness: tFB, position: [tS, 0, z] });
  const side = (i: string, name: string, x: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 90, length: id + 2 * tFB, width: h, thickness: tS, position: [x, 0, 0] });
  return { ...createDocument('Drawer'), boards: [fb('f', 'Front', 0), fb('b', 'Back', id + tFB), side('l', 'Side left', 0), side('r', 'Side right', iw + tS)] };
}
const dovetailed = (): SloydDocument => {
  const doc = drawer();
  const plan = dovetailPlan(doc, ['f', 'b', 'l', 'r'], { slope: 8, count: null, swap: false });
  if (typeof plan === 'string') throw new Error(plan);
  return applyDovetails(doc, plan);
};
const part = (doc: SloydDocument, id: string) => worldParts(doc).find((b) => b.id === id)!;
const METRIC: Units = { display: 'metric-mm', precision: 1 };

describe('dovetailLine (the cut list wording, Global Constraints)', () => {
  // The brief's `1 3/16"` is the spec's draft spelling; every length is `formatLength`'s (inv 52), which writes `1-3/16"`.
  it('the drawer side has the tails: N = round(6 / 1.5) = 4, Te = (6 - 5 x 1/4) / 4 = 1-3/16" at the end', () => {
    const side = part(dovetailed(), 'l');
    const d = side.dovetails!.find((x) => x.end === 'min')!;
    expect(dovetailLine(side, d, IMPERIAL)).toBe(
      'Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 3/4" deep, at the length min end; this part has the tails, each 1-3/16" wide at the end.');
  });

  it('the drawer front has the pins, narrow on its outside face (on edge: the thickness max face is world front)', () => {
    const front = part(dovetailed(), 'f');
    const d = front.dovetails!.find((x) => x.end === 'max')!;
    expect(dovetailLine(front, d, IMPERIAL)).toBe(
      'Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 1/2" deep, at the length max end; this part has the pins, their narrow ends on its thickness max face.');
  });

  it('lengths through the document units; the slope printed by String(s)', () => {
    const b = createBoard({ length: 500 / 25.4, width: 150 / 25.4, thickness: 19 / 25.4 });
    const d: Dovetail = { id: 'd', dim: 'width', end: 'max', role: 'pins', count: 3, slope: 6.5, pin: 6 / 25.4, depth: 12 / 25.4, outside: 'min' };
    expect(dovetailLine(b, d, METRIC)).toBe(
      'Through dovetails — 3 tails, 1:6.5, pins 6 mm at the narrow end, 12 mm deep, at the width max end; this part has the pins, their narrow ends on its thickness min face.');
  });

  it('the copy table loads with the copy home first: a planner refusal still reads its sentence', () => {
    const doc = drawer();
    expect(dovetailPlan(doc, ['f', 'b'], { slope: 8, count: null, swap: false })).toBe(DOVETAIL_NO_CORNER);
    // A function of the copy table (`copy.heights`): undefined there would throw, not return the sentence.
    const short = { ...doc, boards: doc.boards.map((b) => (b.id === 'l' ? { ...b, width: 5 } : b)) };
    expect(dovetailPlan(short, ['f', 'l'], { slope: 8, count: null, swap: false })).toBe('Front and Side left must be the same height along the joint.');
    expect(dovetailPlainStock('X', 'curve')).toBe('X has a curve — dovetails work on plain stock for now.');
  });
});

describe('dovetailZoneRefusal (spec §3.6: the span `depth` back from a dovetailed end, the whole section)', () => {
  const tails: Dovetail = { id: 'd1', dim: 'length', end: 'max', role: 'tails', count: 2, slope: 8, pin: 0.25, depth: 0.75 };
  const b: Board = createBoard({ name: 'Side', length: 10, width: 4, thickness: 0.5, dovetails: [tails] });
  const region = (l: [number, number], w: [number, number] = [0, 4], t: [number, number] = [0, 0.5]): Region => ({ length: l, width: w, thickness: t });

  it('a region inside the zone refuses with the zone sentence naming the part', () => {
    expect(dovetailZoneRefusal(b, region([9.5, 9.6], [1, 2], [0.4, 0.5]))).toBe(dovetailMoveClear('Side'));
    expect(dovetailZoneRefusal(b, region([9.5, 9.6]), 'Drawer › Side')).toBe(dovetailMoveClear('Drawer › Side'));
  });

  it('a region ending at the zone face (to 1e-9) is clear; one reaching past it refuses', () => {
    expect(dovetailZoneRefusal(b, region([4, 9.25]))).toBeNull();
    expect(dovetailZoneRefusal(b, region([4, 9.25 + 5e-10]))).toBeNull();
    expect(dovetailZoneRefusal(b, region([4, 9.25 + 1e-6]))).toBe(dovetailMoveClear('Side'));
  });

  it('the min end mirrors it: [0, depth]', () => {
    const m = { ...b, dovetails: [{ ...tails, end: 'min' as const }] };
    expect(dovetailZoneRefusal(m, region([0.74, 1]))).toBe(dovetailMoveClear('Side'));
    expect(dovetailZoneRefusal(m, region([0.75, 1]))).toBeNull();
    expect(dovetailZoneRefusal(m, region([9.5, 10]))).toBeNull();
  });

  it('a width dovetail zones the width; a dovetail-free part refuses nothing', () => {
    const w = { ...b, dovetails: [{ ...tails, dim: 'width' as const, end: 'min' as const }] };
    expect(dovetailZoneRefusal(w, region([0, 10], [0.5, 0.6]))).toBe(dovetailMoveClear('Side'));
    expect(dovetailZoneRefusal(w, region([0, 10], [0.75, 4]))).toBeNull();
    expect(dovetailZoneRefusal(createBoard({ length: 10 }), region([0, 10]))).toBeNull();
  });

  it('a faulted (stored) dovetail still keeps its zone', () => {
    const f = { ...b, dovetails: [{ ...tails, slope: 20 }] };
    expect(dovetailZoneRefusal(f, region([9.9, 10]))).toBe(dovetailMoveClear('Side'));
  });
});

describe('dovetailCutRefusal (spec §3.6; fix round 1: the corner planner\'s ONE through predicate)', () => {
  const tails: Dovetail = { id: 'd1', dim: 'length', end: 'max', role: 'tails', count: 2, slope: 8, pin: 0.25, depth: 0.75 };
  const b: Board = createBoard({ name: 'Side', length: 10, width: 4, thickness: 0.5, dovetails: [tails] });
  const cut = (over: Partial<Cut>): Cut => ({ id: 'c', face: 'thickness', from: 'max', across: 'length', offset: 0.5, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0, ...over });

  it('a groove running straight through the dovetailed end along its run is exempt', () => {
    expect(dovetailCutRefusal(b, cut({}))).toBeNull();
    expect(dovetailCutRefusal(b, cut({ stopMin: 5 }))).toBeNull();   // stopped at the far (undovetailed) end
  });
  it('stopped short of the dovetailed end face, or ending inside the zone, it refuses', () => {
    expect(dovetailCutRefusal(b, cut({ stopMax: 0.25 }))).toBe(dovetailMoveClear('Side'));
    expect(dovetailCutRefusal(b, cut({ stopMin: 9.5 }))).toBe(dovetailMoveClear('Side'));
  });
  it('a cut across the run meeting the zone refuses; one that removes no stock is never judged', () => {
    expect(dovetailCutRefusal(b, cut({ across: 'width', offset: 9.5, width: 0.25, stopMin: 0 }))).toBe(dovetailMoveClear('Side'));
    expect(dovetailCutRefusal(b, cut({ across: 'width', offset: 9.5, width: 0.25, depth: 0 }))).toBeNull();
  });
});

describe('dovetailLine: final review fixes (2026-10-27)', () => {
  it('a count of 1e9 answers at once (no layout array is built)', () => {
    const b = createBoard({ length: 20, width: 6, thickness: 0.75 });
    const d: Dovetail = { id: 'd', dim: 'length', end: 'max', role: 'tails', count: 1e9, slope: 8, pin: 0.25, depth: 0.75 };
    const t0 = performance.now();
    expect(dovetailLine(b, d, IMPERIAL)).toMatch(/^Through dovetails — 1000000000 tails, 1:8,/);
    expect(performance.now() - t0).toBeLessThan(50);
  });
  it('one tail reads "1 tail"', () => {
    const b = createBoard({ length: 20, width: 6, thickness: 0.75 });
    const d: Dovetail = { id: 'd', dim: 'length', end: 'max', role: 'tails', count: 1, slope: 8, pin: 0.25, depth: 0.75 };
    expect(dovetailLine(b, d, IMPERIAL)).toBe(
      'Through dovetails — 1 tail, 1:8, pins 1/4" at the narrow end, 3/4" deep, at the length max end; this part has the tails, each 5-1/2" wide at the end.');
  });
});

describe('dovetailLine: half-blind (half-blind spec §5.1, Global Constraints, verbatim)', () => {
  /** The drawer above, half-blind at all four corners (Auto lap: a third of the 3/4" front, 1/4"). */
  const halfBlind = (doc: SloydDocument = drawer()): SloydDocument => {
    const plan = dovetailPlan(doc, ['f', 'b', 'l', 'r'], { slope: 8, count: null, swap: false, joint: 'half-blind' });
    if (typeof plan === 'string') throw new Error(plan);
    return applyDovetails(doc, plan);
  };

  // By hand (inv 23): N = round(6 / 1.5) = 4; Te = (6 − 5 × 1/4) / 4 = 1-3/16"; the side's tails reach the lap plane, so its
  // depth is tP − lap = 3/4 − 1/4 = 1/2"; the front's pins are the side's thickness deep, 1/2"; the lap 3/4 / 3 = 1/4".
  it('the side has the tails: the half-blind head, the tails tail', () => {
    const side = part(halfBlind(), 'l');
    const d = side.dovetails!.find((x) => x.end === 'max')!;
    expect(d.lap).toBe(0.25);
    expect(dovetailLine(side, d, IMPERIAL)).toBe(
      'Half-blind dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 1/2" deep, at the length max end; this part has the tails, each 1-3/16" wide at the end.');
  });

  it('the front has the pins: their narrow ends the lap in from its outside face', () => {
    const front = part(halfBlind(), 'f');
    const d = front.dovetails!.find((x) => x.end === 'max')!;
    expect(dovetailLine(front, d, IMPERIAL)).toBe(
      'Half-blind dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 1/2" deep, at the length max end; this part has the pins, their narrow ends 1/4" in from its thickness max face (the lap).');
  });

  it('a through entry beside it is unchanged: the same fields without `lap` read the through line, byte for byte', () => {
    const front = part(halfBlind(), 'f');
    const { lap: _lap, ...through } = front.dovetails!.find((x) => x.end === 'max')!;
    expect(dovetailLine(front, through, IMPERIAL)).toBe(
      'Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 1/2" deep, at the length max end; this part has the pins, their narrow ends on its thickness max face.');
  });

  it('metric (Review Focus 2): an 18 mm front prints a 6 mm lap', () => {
    // A metric drawer by hand: 150 mm tall, 12 mm sides, 18 mm front and back. Pins 6 mm (a fresh metric corner); the lap
    // 18 / 3 = 6 mm; the side's depth 18 − 6 = 12 mm; the front's pins its 12 mm deep. N = round(150 / pitch): read off
    // A = 38 mm: round(150 / 38) = 4 tails (no narrow fault: the tails' narrowest 30 − 2 × 12 / 8 = 27 mm against pins of
    // 6 + 2 × 12 / 8 = 9 mm); Te = (150 − 5 × 6) / 4 = 30 mm.
    const mm = (v: number) => v / 25.4;
    const h = mm(150), tS = mm(12), tFB = mm(18), iw = mm(300), id = mm(400);
    const fb = (i: string, name: string, z: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 0, length: iw, width: h, thickness: tFB, position: [tS, 0, z] });
    const side = (i: string, name: string, x: number) => createBoard({ id: i, name, posture: 'on-edge', rotation: 90, length: id + 2 * tFB, width: h, thickness: tS, position: [x, 0, 0] });
    const doc = halfBlind({ ...createDocument('Drawer'), units: METRIC, boards: [fb('f', 'Front', 0), fb('b', 'Back', id + tFB), side('l', 'Side left', 0), side('r', 'Side right', iw + tS)] });
    const front = part(doc, 'f');
    const d = front.dovetails!.find((x) => x.end === 'max')!;
    expect(d.lap).toBe(6 / 25.4);
    expect(d.count).toBe(4);
    expect(dovetailLine(front, d, METRIC)).toBe(
      'Half-blind dovetails — 4 tails, 1:8, pins 6 mm at the narrow end, 12 mm deep, at the length max end; this part has the pins, their narrow ends 6 mm in from its thickness max face (the lap).');
    const s = part(doc, 'l');
    expect(dovetailLine(s, s.dovetails!.find((x) => x.end === 'max')!, METRIC)).toBe(
      'Half-blind dovetails — 4 tails, 1:8, pins 6 mm at the narrow end, 12 mm deep, at the length max end; this part has the tails, each 30 mm wide at the end.');
  });
});
