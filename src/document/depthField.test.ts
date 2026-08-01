import { buildDepthField } from './depthField';
import { createBoard } from './document';
import type { Cut } from './types';

const cut = (over: Partial<Cut>): Cut => ({
  id: 'c', face: 'thickness', from: 'min', across: 'width',
  offset: 0, width: 1, depth: 0.25, ...over,
});

// A 24 x 12 x 3/4 board. Thickness face, min side: horizontal = length,
// vertical = width (DIMENSION_ORDER puts length first).
const field = (cuts: Cut[]) =>
  buildDepthField(createBoard({ length: 24, width: 12, cuts }), 'thickness', 'min', 'length', 'width');

describe('buildDepthField', () => {
  it('emits nothing for a face with no cuts', () => {
    expect(field([])).toEqual([]);
  });

  it('emits only cut cells, never the uncut remainder', () => {
    // A cut across the width at 6..6.75 covers the full width.
    const cells = field([cut({ id: 'a', across: 'width', offset: 6, width: 0.75 })]);
    expect(cells).toHaveLength(1);
    expect(cells[0].h).toEqual([6, 6.75]);
    expect(cells[0].v).toEqual([0, 12]);
    expect(cells[0].depth).toBe(0.25);
    expect(cells[0].crossing).toBe(false);
  });

  it('keeps two parallel disjoint cuts separate', () => {
    const cells = field([
      cut({ id: 'a', across: 'width', offset: 2, width: 0.75 }),
      cut({ id: 'b', across: 'width', offset: 8, width: 0.75 }),
    ]);
    expect(cells).toHaveLength(2);
    expect(cells.every((c) => !c.crossing)).toBe(true);
  });

  it('takes the deeper depth where two PARALLEL cuts overlap', () => {
    const cells = field([
      cut({ id: 'a', across: 'width', offset: 2, width: 2, depth: 0.125 }),
      cut({ id: 'b', across: 'width', offset: 3, width: 2, depth: 0.375 }),
    ]);
    // Split at 2, 3, 4, 5 -> three cells.
    expect(cells).toHaveLength(3);
    const overlap = cells.find((c) => c.h[0] === 3 && c.h[1] === 4)!;
    expect(overlap.depth).toBe(0.375);
    expect(overlap.crossing).toBe(true);
  });

  it('marks a PERPENDICULAR crossing of differing depths', () => {
    const cells = field([
      cut({ id: 'a', across: 'width',  offset: 6, width: 0.75, depth: 0.125 }),
      cut({ id: 'b', across: 'length', offset: 4, width: 0.75, depth: 0.375 }),
    ]);
    const cross = cells.find((c) => c.crossing)!;
    expect(cross.h).toEqual([6, 6.75]);
    expect(cross.v).toEqual([4, 4.75]);
    expect(cross.depth).toBe(0.375);
  });

  it('does NOT mark a perpendicular crossing of EQUAL depth', () => {
    // The case that is easy to get backwards. When both cuts are 3/8" deep
    // there is nothing about the intersection to report, and cross-hatching it
    // would invent a distinction the stock does not have.
    const cells = field([
      cut({ id: 'a', across: 'width',  offset: 6, width: 0.75, depth: 0.375 }),
      cut({ id: 'b', across: 'length', offset: 4, width: 0.75, depth: 0.375 }),
    ]);
    expect(cells.every((c) => c.depth === 0.375)).toBe(true);
    expect(cells.some((c) => c.crossing)).toBe(false);
  });

  it('handles a three-way overlap under the same rule', () => {
    const cells = field([
      cut({ id: 'a', across: 'width',  offset: 6, width: 2, depth: 0.125 }),
      cut({ id: 'b', across: 'length', offset: 4, width: 2, depth: 0.25 }),
      cut({ id: 'c', across: 'width',  offset: 7, width: 2, depth: 0.5 }),
    ]);
    const deepest = cells.filter((c) => c.depth === 0.5);
    expect(deepest.length).toBeGreaterThan(0);
    expect(deepest.every((c) => c.h[0] >= 7 && c.h[1] <= 9)).toBe(true);
  });

  it('ignores cuts belonging to the other side of the same face', () => {
    const cells = field([
      cut({ id: 'a', from: 'min', across: 'width', offset: 6, width: 0.75 }),
      cut({ id: 'b', from: 'max', across: 'width', offset: 2, width: 0.75 }),
    ]);
    expect(cells).toHaveLength(1);
    expect(cells[0].h).toEqual([6, 6.75]);
  });

  it('ignores cuts belonging to a different face', () => {
    const cells = field([
      cut({ id: 'a', face: 'thickness', across: 'width', offset: 6, width: 0.75 }),
      cut({ id: 'b', face: 'width', across: 'length', offset: 2, width: 0.75 }),
    ]);
    expect(cells).toHaveLength(1);
  });

  it('skips a degenerate cut naming one dimension twice', () => {
    expect(field([cut({ id: 'a', face: 'thickness', across: 'thickness' })])).toEqual([]);
  });

  it('covers the whole face when a cut spans it', () => {
    const cells = field([cut({ id: 'a', across: 'width', offset: 0, width: 24 })]);
    expect(cells).toHaveLength(1);
    expect(cells[0].h).toEqual([0, 24]);
    expect(cells[0].v).toEqual([0, 12]);
  });
});
