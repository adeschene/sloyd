// `./dovetailText` FIRST (Task 5): the copy home must load on its own without an import cycle through `dovetails.ts`'s
// copy table (`DOVETAIL_COPY`, built at module top level from these sentences). The planner refusal below reads that table.
import { dovetailLine, dovetailMoveClear, DOVETAIL_NO_CORNER, dovetailPlainStock } from './dovetailText';
import { describe, expect, it } from 'vitest';
import { createBoard, createDocument } from './document';
import { applyDovetails, dovetailPlan, dovetailZoneRefusal } from './dovetails';
import { worldParts } from './tree';
import { IMPERIAL, type Units } from '../units/length';
import type { Board, Dovetail, Region, SloydDocument } from './types';

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
      'Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 3/4" deep, at the length min end; this part has the tails, 1-3/16" at the end.');
  });

  it('the drawer front has the pins, narrow on its outside face (on edge: the thickness max face is world front)', () => {
    const front = part(dovetailed(), 'f');
    const d = front.dovetails!.find((x) => x.end === 'max')!;
    expect(dovetailLine(front, d, IMPERIAL)).toBe(
      'Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 1/2" deep, at the length max end; this part has the pins, narrow on its thickness max face.');
  });

  it('lengths through the document units; the slope printed by String(s)', () => {
    const b = createBoard({ length: 500 / 25.4, width: 150 / 25.4, thickness: 19 / 25.4 });
    const d: Dovetail = { id: 'd', dim: 'width', end: 'max', role: 'pins', count: 3, slope: 6.5, pin: 6 / 25.4, depth: 12 / 25.4, outside: 'min' };
    expect(dovetailLine(b, d, METRIC)).toBe(
      'Through dovetails — 3 tails, 1:6.5, pins 6 mm at the narrow end, 12 mm deep, at the width max end; this part has the pins, narrow on its thickness min face.');
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
