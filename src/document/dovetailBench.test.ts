// The copy home FIRST (Task 5): it must load without an import cycle through `dovetails.ts`' copy table.
import { dovetailLine, BENCH_BOTH_ENDS, BENCH_INSIDE_FACE, BENCH_OUTSIDE_FACE } from './dovetailText';
import { describe, expect, it } from 'vitest';
import { createBoard, createDocument } from './document';
import { applyDovetails, dovetailPlan } from './dovetails';
import { dovetailBenches } from './dovetailBench';
import { worldParts } from './tree';
import { IMPERIAL, formatLengthBare, type Units } from '../units/length';
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
    expect(line.endsWith(`this part has the tails, each ${b!.tail.chain[1]!.text} wide at the end.`)).toBe(true);
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
    expect(dovetailLine(b, b.dovetails![0]!, METRIC)).toContain('this part has the tails, each 30 mm wide at the end.');
  });
});

describe('dovetailBenches: half-blind (half-blind spec §5.2)', () => {
  // A side with a half-blind front end (min: the 3/4" front, lap 1/4", so depth 3/4 − 1/4 = 1/2") and a through back end
  // (max: a 1/2" back, depth 1/2"): the SAME depth at both ends, so only the lap tells them apart (the builder check).
  const hb = tails({ id: 'h', end: 'min', depth: 0.5, lap: 0.25 });
  const th = tails({ id: 't', end: 'max', depth: 0.5 });

  it('a half-blind end and a through end of the same depth are TWO benches (`layoutKey` reads the lap)', () => {
    const benches = dovetailBenches(side([hb, th]), IMPERIAL);
    expect(benches.map((b) => b.ends)).toEqual(['one', 'one']);
    expect(new Set(benches.map((b) => b.key)).size).toBe(2);
    // Figure B is the pin board's end grain, its thickness tall: depth + lap = 3/4" half-blind; the depth, 1/2", through.
    expect(benches.map((b) => b.pin.height)).toEqual([0.75, 0.5]);
    expect(benches.map((b) => b.tail.labels.find((l) => l.kind === 'ends')!.text)).toEqual(['length min end', 'length max end']);
  });

  it('figure B, half-blind: H by tP, the lap band [0, lap], the sockets from the lap plane narrowing to the inside face', () => {
    const [b] = dovetailBenches(side([hb]), IMPERIAL);
    const B = b!.pin;
    expect([B.width, B.height, B.lap]).toEqual([6, 0.75, 0.25]);
    expect(B.outline).toEqual([[0, 0], [6, 0], [6, 0.75], [0, 0.75]]);
    expect(B.waste).toHaveLength(4);
    const run = (0.75 - 0.25) / 8;   // (tP − lap) / s
    const w0 = B.waste[0]!;
    expect(w0[0]).toEqual([0.25, 0.25]);
    expect(w0[1]![0]).toBeCloseTo(1.4375, 12);
    expect(w0[1]![1]).toBe(0.25);
    expect(w0[2]![0]).toBeCloseTo(1.4375 - run, 12);
    expect(w0[2]![1]).toBe(0.75);
    expect(w0[3]![0]).toBeCloseTo(0.25 + run, 12);
    expect(w0[3]![1]).toBe(0.75);
    // The chain runs along the lap plane, where the pins' narrow ends are; its words are the through chain's.
    expect(B.chain.every((c) => c.at[1] === 0.25)).toBe(true);
    expect(B.chain.map((c) => c.text)).toEqual(CHAIN);
    expect(B.labels.map((l) => [l.kind, l.text])).toEqual([
      ['outside', BENCH_OUTSIDE_FACE], ['inside', BENCH_INSIDE_FACE], ['overall', '6"'], ['lap', 'lap 1/4"']]);
    expect(B.labels.find((l) => l.kind === 'inside')!.at).toEqual([0, 0.75]);
  });

  it('figure A is unchanged in form (the baseline at its depth); only figure B carries `lap`; a through B has no `lap` key', () => {
    const [h, t] = dovetailBenches(side([hb, th]), IMPERIAL);
    expect([h!.tail.width, h!.tail.height, h!.tail.baseline]).toEqual([6, 1, 0.5]);
    expect('lap' in h!.tail).toBe(false);
    // The two figure A's differ only in their end note (min, max): the same depth draws the same face.
    const { labels: hl, ...hA } = h!.tail;
    const { labels: tl, ...tA } = t!.tail;
    expect(hA).toEqual(tA);
    expect(hl.map((l) => l.text)).toEqual(['baseline 1/2"', '6"', '1:8', 'length min end']);
    expect(tl.map((l) => l.text)).toEqual(['baseline 1/2"', '6"', '1:8', 'length max end']);
    expect('lap' in t!.pin).toBe(false);
    expect(t!.pin.labels.map((l) => l.kind)).toEqual(['outside', 'inside', 'overall']);
  });

  it("the lap label is formatLengthBare's; the chain at the lap plane is the cut-list lines' numbers (the planned drawer)", () => {
    const doc = drawer();
    const plan = dovetailPlan(doc, ['f', 'b', 'l', 'r'], { slope: 8, count: null, swap: false, joint: 'half-blind' });
    if (typeof plan === 'string') throw new Error(plan);
    const out = applyDovetails(doc, plan);
    const s = part(out, 'l');
    const f = part(out, 'f');
    const [b] = dovetailBenches(s, IMPERIAL);
    const lap = s.dovetails![0]!.lap!;
    expect(b!.pin.labels.find((l) => l.kind === 'lap')!.text).toBe(`lap ${formatLengthBare(lap, IMPERIAL)}`);
    const tailsLine = dovetailLine(s, s.dovetails![0]!, IMPERIAL);
    expect(tailsLine).toContain(`pins ${b!.pin.chain[0]!.text} at the narrow end`);
    expect(tailsLine.endsWith(`this part has the tails, each ${b!.pin.chain[1]!.text} wide at the end.`)).toBe(true);
    const pinsLine = dovetailLine(f, f.dovetails![0]!, IMPERIAL);
    expect(pinsLine).toContain(`their narrow ends ${formatLengthBare(lap, IMPERIAL)} in from`);
  });

  it('metric: the lap label in bare whole mm', () => {
    const b = side([tails({ pin: 6 / 25.4, depth: 12 / 25.4, lap: 6 / 25.4 })], { width: 150 / 25.4 });
    const [bench] = dovetailBenches(b, METRIC);
    expect(bench!.pin.labels.find((l) => l.kind === 'lap')!.text).toBe('lap 6');
    expect(bench!.pin.chain.map((c) => c.text)).toEqual(['6', '30', '6', '30', '6', '30', '6', '30', '6']);
  });
});
