import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { Board, Dimension, Dovetail } from './types';
import { IMPERIAL, type Units } from '../units/length';
import { chiralPart } from './turnFixtures';
import {
  DOVETAIL_FIELDS, copyDovetail, dovetailAt, dovetailsOf, dovetailTailWidth, hasDovetails, sameDovetail, withDovetails,
} from './dovetailModel';
import {
  autoTailCount, builtDovetails, dovetailFaults, dovetailLayout, lowerDovetails, mirrorDovetails, pinWidth,
} from './dovetails';
import { dovetailFaultText, dovetailTooNarrow, dovetailedLines, slopeText } from './dovetailText';

const METRIC: Units = { display: 'metric-mm', precision: 1 };

const tails = (over: Partial<Dovetail> = {}): Dovetail =>
  ({ id: 'd1', dim: 'length', end: 'max', role: 'tails', count: 4, slope: 8, pin: 0.25, depth: 0.75, ...over });
const pins = (over: Partial<Dovetail> = {}): Dovetail =>
  ({ id: 'd2', dim: 'length', end: 'min', role: 'pins', count: 4, slope: 8, pin: 0.25, depth: 0.75, outside: 'min', ...over });
/** A drawer side 20 long, 6 wide (J for a `length` dovetail), 3/4 thick. */
const side = (over: Partial<Board> = {}): Board => createBoard({ name: 'Side', length: 20, width: 6, thickness: 0.75, ...over });

describe('dovetails: the layout (spec §3.2)', () => {
  it('6" wide, 4 tails, 1:8, pins 1/4": the outside plane, computed directly', () => {
    const L = dovetailLayout(6, 4, 8, 0.25);
    expect(L.Te).toBe(1.1875);
    expect(L.bounds).toEqual([0, 0.25, 1.4375, 1.6875, 2.875, 3.125, 4.3125, 4.5625, 5.75, 6]);
    expect(L.bounds).toHaveLength(2 * 4 + 2);
    expect(L).toMatchObject({ H: 6, N: 4, s: 8, p: 0.25 });
  });
  it('the mockup at depth 3/4: a tail 1" at the baseline, a pin 7/16" and a half pin 11/32" at the inside face', () => {
    const { Te, p, s } = dovetailLayout(6, 4, 8, 0.25);
    const x = 0.75;
    expect(Te - (2 * x) / s).toBe(1);
    expect(p + (2 * x) / s).toBe(0.4375);
    expect(p + x / s).toBe(0.34375);
  });
  it('one tail: two half pins and the tail between; the last bound is H itself', () => {
    const L = dovetailLayout(3, 1, 8, 0.25);
    expect(L.Te).toBe(2.5);
    expect(L.bounds).toEqual([0, 0.25, 2.75, 3]);
  });
  it('a non-dyadic height still ends at exactly H, the last tail at H − p', () => {
    const H = 152 / 25.4;
    const p = 6 / 25.4;
    const L = dovetailLayout(H, 4, 8, p);
    expect(L.bounds[L.bounds.length - 1]).toBe(H);
    expect(L.bounds[L.bounds.length - 2]).toBe(H - p);
    expect(L.bounds[1]).toBe(p);
    // Here the running form `p + (N − 1)·(Te + p) + Te` lands an ulp off `H − p`: the one boundary is computed one way.
    const H2 = 45 / 25.4;
    const L2 = dovetailLayout(H2, 2, 8, 0.25);
    expect(0.25 + (L2.Te + 0.25) + L2.Te).not.toBe(H2 - 0.25);
    expect(L2.bounds).toEqual([0, 0.25, 0.25 + L2.Te, 0.25 + (L2.Te + 0.25), H2 - 0.25, H2]);
  });
});

describe('dovetails: pin width and Auto (spec §3.2)', () => {
  it('pin width: 1/4" imperial, 6 mm metric', () => {
    expect(pinWidth(IMPERIAL)).toBe(0.25);
    expect(pinWidth(METRIC)).toBe(6 / 25.4);
  });
  it('Auto: one tail per 1.5" (38 mm), at least one', () => {
    expect(autoTailCount(6, IMPERIAL)).toBe(4);
    expect(autoTailCount(4, IMPERIAL)).toBe(3);
    expect(autoTailCount(3, IMPERIAL)).toBe(2);
    expect(autoTailCount(1, IMPERIAL)).toBe(1);
    expect(autoTailCount(0.1, IMPERIAL)).toBe(1);
    expect(autoTailCount(152 / 25.4, METRIC)).toBe(4);
  });
});

describe('dovetails: dovetailFaults (spec §3.2, the ONE decider)', () => {
  // Te = 1.1875 on a 6" J: Te − 2·X/8 === 1/4 + 2·X/8 at X = 1.875 exactly (dyadic).
  const EDGE = 1.875;
  it('a tail exactly as wide as a pin at the baseline passes; 1/64 deeper is narrow', () => {
    const { Te, p, s } = dovetailLayout(6, 4, 8, 0.25);
    expect(Te - (2 * EDGE) / s).toBe(p + (2 * EDGE) / s);
    expect(dovetailFaults(side(), tails({ depth: EDGE }))).toEqual([]);
    expect(dovetailFaults(side(), tails({ depth: EDGE + 1 / 64 }))).toEqual(['narrow']);
  });
  it('pins judge across their own thickness, not their depth', () => {
    expect(dovetailFaults(side({ thickness: EDGE }), pins({ depth: 0.75 }))).toEqual([]);
    expect(dovetailFaults(side({ thickness: EDGE + 1 / 64 }), pins({ depth: 0.75 }))).toEqual(['narrow']);
    // A pins entry's depth is not its angled extent: a deep socket in a thin part does not fault narrow.
    expect(dovetailFaults(side(), pins({ depth: EDGE + 1 / 64 }))).toEqual([]);
  });
  it('H is the part\'s J size: a width dovetail reads the length', () => {
    const b = side({ length: 6, width: 20 });
    expect(dovetailFaults(b, tails({ dim: 'width', depth: EDGE }))).toEqual([]);
    expect(dovetailFaults(b, tails({ dim: 'width', depth: EDGE + 1 / 64 }))).toEqual(['narrow']);
  });
  it('count: not a whole number 1 or more', () => {
    expect(dovetailFaults(side(), tails({ count: 0 }))).toEqual(['count']);
    expect(dovetailFaults(side(), tails({ count: 1.5 }))).toEqual(['count']);
    expect(dovetailFaults(side(), tails({ count: 1 }))).toEqual([]);
  });
  it('slope: outside [4, 12]; the bounds pass', () => {
    expect(dovetailFaults(side(), tails({ slope: 3.99 }))).toEqual(['slope']);
    expect(dovetailFaults(side(), tails({ slope: 12.01 }))).toEqual(['slope']);
    expect(dovetailFaults(side(), tails({ slope: 4 }))).toEqual([]);
    expect(dovetailFaults(side(), tails({ slope: 12 }))).toEqual([]);
  });
  it('depth: reaching the part\'s own size along dim', () => {
    const short = side({ length: 1 });
    expect(dovetailFaults(short, tails({ depth: 0.75 }))).toEqual([]);
    expect(dovetailFaults(short, tails({ depth: 1 }))).toEqual(['depth']);
  });
  it('several faults come back in order', () => {
    expect(dovetailFaults(side({ length: 1 }), tails({ slope: 2, depth: 1 }))).toEqual(['slope', 'depth', 'narrow']);
  });
  it('builtDovetails: only fault-free ones, memoised and frozen; none for a dovetail-free part', () => {
    const b = side({ dovetails: [tails({ end: 'min', depth: EDGE + 1 / 64 }), tails({ id: 'd3' })] });
    const built = builtDovetails(b);
    expect(built.map((d) => d.id)).toEqual(['d3']);
    expect(builtDovetails(b)).toBe(built);
    expect(Object.isFrozen(built)).toBe(true);
    expect(builtDovetails(side())).toEqual([]);
  });
});

describe('dovetails: the stored model (spec §3.4)', () => {
  it('DOVETAIL_FIELDS is every field but id', () => {
    expect(Object.keys(DOVETAIL_FIELDS).sort()).toEqual(['count', 'depth', 'dim', 'end', 'outside', 'pin', 'role', 'slope']);
  });
  it('sameDovetail is exact on every field, ids ignored; outside present vs absent differs', () => {
    expect(sameDovetail(tails(), tails({ id: 'x' }))).toBe(true);
    expect(sameDovetail(tails(), tails({ slope: 6 }))).toBe(false);
    expect(sameDovetail(pins(), pins({ outside: 'max' }))).toBe(false);
    const { outside: _o, ...bare } = pins();
    expect(sameDovetail(pins(), bare)).toBe(false);
  });
  it('copyDovetail is a new object; withDovetails sorts canonically and removes the key when empty', () => {
    const d = tails();
    expect(copyDovetail(d)).toEqual(d);
    expect(copyDovetail(d)).not.toBe(d);
    const list = [tails({ id: 'a', dim: 'width', end: 'max' }), tails({ id: 'b', dim: 'width', end: 'min' }), tails({ id: 'c', end: 'max' }), tails({ id: 'e', end: 'min' })];
    expect(withDovetails(side(), list).dovetails!.map((x) => x.id)).toEqual(['e', 'c', 'b', 'a']);
    expect('dovetails' in withDovetails(side({ dovetails: [tails()] }), [])).toBe(false);
  });
  it('dovetailsOf, hasDovetails, dovetailAt', () => {
    expect(dovetailsOf(side())).toEqual([]);
    expect(hasDovetails(side())).toBe(false);
    expect(hasDovetails(side({ dovetails: [] }))).toBe(false);
    const b = side({ dovetails: [pins(), tails()] });
    expect(hasDovetails(b)).toBe(true);
    expect(dovetailAt(b, 'length', 'max')!.id).toBe('d1');
    expect(dovetailAt(b, 'width', 'max')).toBeUndefined();
  });
});

describe('dovetails: mirrors (spec §3.4, inv 44)', () => {
  const x = withDovetails(chiralPart('flat'), [tails({ end: 'max' }), pins({ dim: 'width', end: 'min', outside: 'max' })]).dovetails!;
  const DIMS: Dimension[] = ['length', 'width', 'thickness'];
  it('lowerDovetails is mirrorDovetails\' exact inverse along every dimension', () => {
    for (const d of DIMS) {
      const m = mirrorDovetails(x, d);
      expect(lowerDovetails(x, { dovetails: m }, d).dovetails, d).toBe(x);
      expect(lowerDovetails(undefined, { dovetails: m }, d).dovetails, d).toEqual(x);
      expect(mirrorDovetails(m, d), d).toEqual(x);
    }
  });
  it('flags flip: along dim the end, along the thickness a pins entry\'s outside', () => {
    expect(mirrorDovetails(x, 'length')).toEqual([tails({ end: 'min' }), pins({ dim: 'width', end: 'min', outside: 'max' })]);
    expect(mirrorDovetails(x, 'width')).toEqual([tails({ end: 'max' }), pins({ dim: 'width', end: 'max', outside: 'max' })]);
    expect(mirrorDovetails(x, 'thickness')).toEqual([tails({ end: 'max' }), pins({ dim: 'width', end: 'min', outside: 'min' })]);
    expect('outside' in mirrorDovetails([tails()], 'thickness')[0]!).toBe(false);
  });
  it('a mirror along J leaves the list unchanged (the SAME array: a palindrome)', () => {
    const one = [tails()];
    expect(mirrorDovetails(one, 'width')).toBe(one);
  });
  it('a mirror re-sorts into canonical order', () => {
    const two = [tails({ id: 'a', end: 'min' }), tails({ id: 'b', end: 'max', count: 3 })];
    expect(mirrorDovetails(two, 'length').map((d) => [d.id, d.end])).toEqual([['b', 'min'], ['a', 'max']]);
  });
  it('a draft with none, or a removal, adds no key', () => {
    expect('dovetails' in lowerDovetails(x, {}, 'length')).toBe(false);
    expect('dovetails' in lowerDovetails(x, { dovetails: [] }, 'length')).toBe(false);
  });
});

describe('dovetails: copy (Global Constraints, verbatim)', () => {
  it('slope, too narrow, success and fault notes', () => {
    expect(slopeText(8)).toBe('1:8');
    expect(slopeText(6.5)).toBe('1:6.5');
    expect(dovetailTooNarrow('Front', 'Side', 3, 8)).toBe('Front and Side are too narrow for 3 tails at 1:8 — try fewer tails.');
    expect(dovetailedLines([{ count: 4, slope: 8 }], [['A', 'B']])).toEqual(['Dovetailed 1 corner: 4 tails, 1:8.']);
    expect(dovetailedLines([{ count: 4, slope: 8 }, { count: 3, slope: 8 }], [['A', 'B'], ['C', 'D']]))
      .toEqual(['Dovetailed 2 corners:', 'A and B: 4 tails, 1:8.', 'C and D: 3 tails, 1:8.']);
    expect(dovetailFaultText('narrow')).toBe('This dovetail no longer fits: a tail is narrower than a pin.');
    expect(dovetailFaultText('depth')).toBe('This dovetail no longer fits: it is deeper than the part.');
  });
});

describe('dovetails: overlapping depths on one part fault `depth` (Task 4 fix ruling)', () => {
  // A part 1.5 long with tails at both length ends: the two depths may not meet or cross.
  const both = (dMin: number, dMax: number, length = 1.5) =>
    side({ length, dovetails: [tails({ id: 'a', end: 'min', depth: dMin }), tails({ id: 'b', end: 'max', depth: dMax })] });
  it('depths summing to exactly the length fault `depth` on both', () => {
    const b = both(0.75, 0.75);
    expect(b.dovetails!.map((d) => dovetailFaults(b, d))).toEqual([['depth'], ['depth']]);
    expect(builtDovetails(b)).toEqual([]);
  });
  it('a sum 1/64" short of the length passes', () => {
    const b = both(0.75, 0.75 - 1 / 64);
    expect(b.dovetails!.map((d) => dovetailFaults(b, d))).toEqual([[], []]);
  });
  it('within 1e-9 of the length is the length', () => {
    const b = both(0.75, 0.75 - 1e-12);
    expect(b.dovetails!.map((d) => dovetailFaults(b, d))).toEqual([['depth'], ['depth']]);
  });
  it('a dovetail on the other dimension does not count', () => {
    const b = side({ length: 1.5, dovetails: [tails({ id: 'a', end: 'max', depth: 0.75 }), tails({ id: 'w', dim: 'width', end: 'min', count: 1, depth: 0.75 })] });
    expect(b.dovetails!.map((d) => dovetailFaults(b, d))).toEqual([[], []]);
  });
});

describe('dovetails: the tail count is bounded (final review, 2026-10-27)', () => {
  it('Te has one home, O(1): dovetailTailWidth is the layout\'s Te, byte for byte', () => {
    for (const [H, N, p] of [[6, 4, 0.25], [150 / 25.4, 3, 6 / 25.4], [5.3, 7, 0.25], [1.5, 1, 0.25]] as const) {
      expect(dovetailTailWidth(H, N, p)).toBe(dovetailLayout(H, N, 8, p).Te);
    }
  });
  it('dovetailFaults on a count of 1e9 answers at once (no layout array is built): narrow', () => {
    const t0 = performance.now();
    expect(dovetailFaults(side(), tails({ count: 1e9 }))).toEqual(['narrow']);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
