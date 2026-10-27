// The copy home FIRST (Task 5): it must load without an import cycle through `dovetails.ts`' copy table.
import { dovetailLine, BENCH_BOTH_ENDS, BENCH_INSIDE_FACE, BENCH_OUTSIDE_FACE } from './dovetailText';
import { describe, expect, it } from 'vitest';
import { createBoard, createDocument } from './document';
import { applyDovetails, dovetailPlan } from './dovetails';
import { dovetailBenches } from './dovetailBench';
import { worldParts } from './tree';
import { IMPERIAL, type Units } from '../units/length';
import type { Board, Dovetail, SloydDocument } from './types';

/**
 * Dovetails Task 7 (spec §5.2): the bench drawings' data. Every string is assembled here (inv 19); the component only
 * measures and places them.
 */

/** Task 4's drawer (copied, never imported from a test module). */
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

const tails = (over: Partial<Dovetail> = {}): Dovetail =>
  ({ id: 'd1', dim: 'length', end: 'max', role: 'tails', count: 4, slope: 8, pin: 0.25, depth: 0.75, ...over });
const side = (dovetails: Dovetail[], over: Partial<Board> = {}): Board =>
  createBoard({ name: 'Side', length: 18, width: 6, thickness: 0.5, dovetails, ...over });

// The 6"/4/1:8 corner, by hand (inv 23: never from the code under test): Te = (6 - 5 x 1/4) / 4 = 1.1875 = 1-3/16".
const CHAIN = ['1/4"', '1-3/16"', '1/4"', '1-3/16"', '1/4"', '1-3/16"', '1/4"', '1-3/16"', '1/4"'];

describe('dovetailBenches (spec §5.2)', () => {
  it('the drawer side: ONE bench for its two equal ends, `both ends`; the chain on both figures', () => {
    const s = part(dovetailed(), 'l');
    const benches = dovetailBenches(s, IMPERIAL);
    expect(benches).toHaveLength(1);
    const [b] = benches;
    expect(b!.ends).toBe('both');
    expect(b!.tail.chain.map((c) => c.text)).toEqual(CHAIN);
    expect(b!.pin.chain.map((c) => c.text)).toEqual(CHAIN);
    expect(b!.tail.labels.map((l) => l.text)).toContain(BENCH_BOTH_ENDS);
  });

  it("the chain's tail width is the cut-list line's, character for character", () => {
    const s = part(dovetailed(), 'l');
    const [b] = dovetailBenches(s, IMPERIAL);
    const line = dovetailLine(s, s.dovetails![0]!, IMPERIAL);
    expect(line.endsWith(`this part has the tails, ${b!.tail.chain[1]!.text} at the end.`)).toBe(true);
    expect(line).toContain(`pins ${b!.tail.chain[0]!.text} at the narrow end`);
  });

  it('figure A: the face, H by depth + a margin of depth; the pin sockets as waste, flaring to the baseline', () => {
    const [b] = dovetailBenches(side([tails()]), IMPERIAL);
    const A = b!.tail;
    expect([A.width, A.height]).toEqual([6, 1.5]);
    expect(A.outline).toEqual([[0, 0], [6, 0], [6, 1.5], [0, 1.5]]);
    expect(A.baseline).toBe(0.75);
    expect(A.waste).toHaveLength(5);
    const run = 0.75 / 8;
    // The first half pin's socket: square to the board's edge, flaring by depth / slope toward its tail.
    expect(A.waste[0]).toEqual([[0, 0], [0.25, 0], [0.25 + run, 0.75], [0, 0.75]]);
    // The second socket: a whole pin between tails 1 and 2 (1/4 + 1-3/16 = 1.4375 from J's min), flaring both ways.
    const w1 = A.waste[1]!;
    expect(w1[0]![0]).toBeCloseTo(1.4375, 12);
    expect(w1[1]![0]).toBeCloseTo(1.6875, 12);
    expect(w1[2]![0]).toBeCloseTo(1.6875 + run, 12);
    expect(w1[3]![0]).toBeCloseTo(1.4375 - run, 12);
    // The last half pin: square to the far edge.
    expect(A.waste[4]![1]).toEqual([6, 0]);
    expect(A.waste[4]![2]).toEqual([6, 0.75]);
    expect(A.labels.map((l) => l.text)).toEqual(['baseline 3/4"', '6"', '1:8', 'length max end']);
  });

  it('figure B: the pin board end grain, H by its thickness (the depth); the tail sockets narrowing to the inside face', () => {
    const [b] = dovetailBenches(side([tails()]), IMPERIAL);
    const B = b!.pin;
    expect([B.width, B.height]).toEqual([6, 0.75]);
    expect(B.baseline).toBeUndefined();
    expect(B.waste).toHaveLength(4);
    const run = 0.75 / 8;
    const w0 = B.waste[0]!;
    expect(w0[0]).toEqual([0.25, 0]);
    expect(w0[1]![0]).toBeCloseTo(1.4375, 12);
    expect(w0[2]![0]).toBeCloseTo(1.4375 - run, 12);
    expect(w0[3]![0]).toBeCloseTo(0.25 + run, 12);
    expect(B.chain.every((c) => c.at[1] === 0)).toBe(true);   // along the outside face
    expect(B.labels.map((l) => l.text)).toEqual([BENCH_OUTSIDE_FACE, BENCH_INSIDE_FACE, '6"']);
  });

  it('a chain mark sits at the middle of its span, from J\'s min', () => {
    const [b] = dovetailBenches(side([tails()]), IMPERIAL);
    expect(b!.tail.chain[0]!.at).toEqual([0.125, 0]);
    expect(b!.tail.chain[1]!.at[0]).toBeCloseTo(0.25 + 1.1875 / 2, 12);
    expect(b!.tail.chain[8]!.at[0]).toBeCloseTo(6 - 0.125, 12);
    expect(b!.tail.bounds).toHaveLength(10);
  });

  it('two different layouts on one part are two benches; the pins part and a dovetail-free part have none', () => {
    const two = side([tails({ id: 'a', end: 'min' }), tails({ id: 'b', slope: 6 })]);
    const benches = dovetailBenches(two, IMPERIAL);
    expect(benches.map((b) => b.ends)).toEqual(['one', 'one']);
    expect(new Set(benches.map((b) => b.key)).size).toBe(2);
    expect(benches[1]!.tail.labels.map((l) => l.text)).toContain('1:6');
    expect(dovetailBenches(part(dovetailed(), 'f'), IMPERIAL)).toEqual([]);
    expect(dovetailBenches(createBoard({}), IMPERIAL)).toEqual([]);
  });

  it('two equal ends differing only in id are one bench (`both ends`)', () => {
    const b = dovetailBenches(side([tails({ id: 'a', end: 'min' }), tails({ id: 'z' })]), IMPERIAL);
    expect(b.map((x) => x.ends)).toEqual(['both']);
  });

  it('a faulted tails dovetail draws no bench (it builds nothing)', () => {
    expect(dovetailBenches(side([tails({ slope: 20 })]), IMPERIAL)).toEqual([]);
  });

  it('metric: the chain in whole mm, bare (the sheet carries `Dimensions in mm`, inv 52)', () => {
    // 150 mm wide, 4 tails, pins 6 mm: Te = (150 - 30) / 4 = 30 mm.
    const b = side([tails({ pin: 6 / 25.4, depth: 19 / 25.4 })], { width: 150 / 25.4 });
    const [bench] = dovetailBenches(b, METRIC);
    expect(bench!.tail.chain.map((c) => c.text)).toEqual(['6', '30', '6', '30', '6', '30', '6', '30', '6']);
    expect(bench!.tail.labels.map((l) => l.text)).toEqual(['baseline 19', '150', '1:8', 'length max end']);
    expect(dovetailLine(b, b.dovetails![0]!, METRIC)).toContain('this part has the tails, 30 mm at the end.');
  });
});
