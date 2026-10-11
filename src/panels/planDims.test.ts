import { fitChain, CHAIN_MAX } from './planDims';
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
