import { fitChain, packPlaced, CHAIN_MAX, DIM_LABEL_PAD, EXT_GAP } from './planDims';
import { labelWidth } from './diagramLabels';
import type { PlacedLine } from '../document/placedDims';
import type { DimAxis } from '../document/dimensions';

// labelWidth('1"') = 2 × 12.4 = 24.8; + pad 8 = 32.8 needed. At scale 4: 1in = 4 (drop), 9in = 36 (keep).
const seg = (from: number, to: number) => ({ from, to, label: `${to - from}"` });
const axis = (chain: ReturnType<typeof seg>[]): DimAxis => ({ name: 'Height', overall: seg(0, 1), chain });

describe('fitChain', () => {
  it('drops a label that does not fit and says so', () => {
    const r = fitChain(axis([seg(0, 1), seg(1, 10), seg(10, 19), seg(19, 28)]), 4);
    expect(r.chain.map((c) => c.from)).toEqual([1, 10, 19]);
    expect(r.note).toBe('1 small height spacing not labelled');
  });
  it('drops only the narrow segments, however many, and keeps the ones that fit', () => {
    // Scale 4: a 1in segment is 4 wide, a 9in one 36 (label needs 12.4·chars+8 ≥ 20.4, so 36 fits).
    // 5 segments, 3 dropped (the 1in ones): the two 9in ones stay; no one-third rule omits the chain.
    const r = fitChain(axis([seg(0, 1), seg(1, 10), seg(10, 11), seg(11, 20), seg(20, 21)]), 4);
    expect(r.chain.map((c) => c.from)).toEqual([1, 11]);
    expect(r.note).toBe('3 small height spacings not labelled');
  });
  it('caps at CHAIN_MAX segments', () => {
    const many = (n: number) => axis(Array.from({ length: n }, (_, k) => seg(k, k + 1)));
    expect(CHAIN_MAX).toBe(12);
    expect(fitChain(many(12), 40).chain).toHaveLength(12);       // 1in = 40 ≥ 32.8: all fit
    expect(fitChain(many(13), 40)).toEqual({ chain: [], note: 'Height chain omitted — too dense' });
  });
  it('has no note for an empty chain', () => {
    expect(fitChain(axis([]), 4)).toEqual({ chain: [], note: null });
  });
});

describe('packPlaced (placed-dimensions spec §6.2, as amended)', () => {
  const SCALE = 10;
  const line = (id: string, from: number, to: number, label = 'a'): PlacedLine => ({ id, from, to, a: [from, 0], b: [to, 0], label });
  const rows = (lines: PlacedLine[]) => Object.fromEntries(packPlaced(lines, SCALE).map((p) => [p.line.id, p.row]));

  it('two disjoint spans share row 0', () => {
    // 'a' and its pad fit every span below (the shortest is 30 units): none is past. A ends at 50; B starts at 60 ≥ 50 + 8.
    expect(labelWidth('a') + DIM_LABEL_PAD).toBeLessThanOrEqual(3 * SCALE);
    expect(rows([line('A', 0, 5), line('B', 6, 10)])).toEqual({ A: 0, B: 0 });
  });

  it('two overlapping spans take rows 0 and 1', () => {
    expect(rows([line('A', 0, 5), line('B', 4, 10)])).toEqual({ A: 0, B: 1 });
  });

  it('two spans closer than DIM_LABEL_PAD take rows 0 and 1', () => {
    // A ends at 50; B starts at 55, clear of A's span but inside the pad (50 + 8 > 55).
    expect(5 * SCALE + DIM_LABEL_PAD).toBeGreaterThan(5.5 * SCALE);
    expect(rows([line('A', 0, 5), line('B', 5.5, 10)])).toEqual({ A: 0, B: 1 });
  });

  it('a 1/4" span with a long label is past, and a span starting inside its label\'s room takes the next row (Review Focus 5)', () => {
    const label = '1/4"';
    const W = labelWidth(label);
    // Past: the label and its pad need more than the 2.5-unit span.
    expect(W + DIM_LABEL_PAD).toBeGreaterThan(0.25 * SCALE);
    // B starts at 30: clear of the span's own end (2.5 + 8) but inside the label's room (2.5 + 4 + W + 8).
    const start = 3 * SCALE;
    expect(start).toBeGreaterThanOrEqual(0.25 * SCALE + DIM_LABEL_PAD);
    expect(start).toBeLessThan(0.25 * SCALE + EXT_GAP + W + DIM_LABEL_PAD);
    const out = packPlaced([line('A', 0, 0.25, label), line('B', 3, 10)], SCALE);
    expect(out.find((p) => p.line.id === 'A')).toMatchObject({ row: 0, past: true });
    expect(out.find((p) => p.line.id === 'B')).toMatchObject({ row: 1, past: false });
  });

  it('a span starting past the label\'s room shares the row', () => {
    const label = '1/4"';
    const start = 0.25 * SCALE + EXT_GAP + labelWidth(label) + DIM_LABEL_PAD + 1;
    expect(rows([line('A', 0, 0.25, label), line('B', start / SCALE, 20)])).toEqual({ A: 0, B: 0 });
  });

  it('packs in order of from, whatever the input order', () => {
    // Sorted: A [0,5], B [6,12], C [20,30] all fit row 0. Taken in input order C would claim row 0 first and push A, B down.
    expect(rows([line('C', 20, 30), line('A', 0, 5), line('B', 6, 12)])).toEqual({ A: 0, B: 0, C: 0 });
  });

  it('breaks a tie on from by to', () => {
    // Sorted: S [0,3] row 0, L [0,5] row 1, N [4,9] row 0 (30 + 8 ≤ 40). Taking L first would put N in row 1.
    expect(rows([line('L', 0, 5), line('S', 0, 3), line('N', 4, 9)])).toEqual({ S: 0, L: 1, N: 0 });
  });
});
