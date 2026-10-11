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
  it('keeps the chain at exactly a third dropped, omits it above', () => {
    // 3 segments, 1 dropped: 1·3 > 3 is false → kept.
    expect(fitChain(axis([seg(0, 1), seg(1, 10), seg(10, 19)]), 4).chain).toHaveLength(2);
    // 5 segments, 3 dropped (the 1in ones): 9 > 5 → omitted.
    const r = fitChain(axis([seg(0, 1), seg(1, 10), seg(10, 11), seg(11, 20), seg(20, 21)]), 4);
    expect(r).toEqual({ chain: [], note: 'Height chain omitted — too dense' });
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
