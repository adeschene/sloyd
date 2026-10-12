import { createBoard } from './document';
import { FRONT, TOP } from './drawing';
import { dimensionView } from './dimensions';

// Flat, turn 0: length X, thickness Y, width Z.
const slab = (y: number, thickness = 1) => createBoard({ length: 30, width: 12, thickness, position: [0, y, 0] });

describe('dimensionView', () => {
  it('chains the part boundaries and sums to the overall', () => {
    // Boards at y 0..1, 10..11, 20..21 → coordinates 0,1,10,11,20,21 → 1, 9, 1, 9, 1 (sum 21).
    const d = dimensionView([slab(0), slab(10), slab(20)], FRONT, 16);
    expect(d.vertical.overall).toEqual({ from: 0, to: 21, label: '21"' });
    expect(d.vertical.chain.map((c) => c.label)).toEqual(['1"', '9"', '1"', '9"', '1"']);
    const sum = d.vertical.chain.reduce((n, c) => n + (c.to - c.from), 0);
    expect(sum).toBeCloseTo(21, 12);
    expect(d.vertical.name).toBe('Height');
    // Every part spans x 0..30: one segment is the overall, so no chain.
    expect(d.horizontal.overall).toEqual({ from: 0, to: 30, label: '30"' });
    expect(d.horizontal.chain).toEqual([]);
  });

  it('collapses boundaries that format the same and keeps the maximum', () => {
    // Tops at 5, 10 and 10.01 (0.01in rounds to 0/16). Coordinates 0,5,10,10.01 → kept 0,5,10.01:
    // the skipped maximum replaces 10, so the chain still sums to the overall.
    const parts = [slab(0, 5), slab(0, 10), slab(0, 10.01)];
    const d = dimensionView(parts, FRONT, 16);
    expect(d.vertical.chain.map((c) => [c.from, c.to])).toEqual([[0, 5], [5, 10.01]]);
    expect(d.vertical.chain.map((c) => c.label)).toEqual(['5"', '5"']);
    expect(d.vertical.overall!.to).toBe(10.01);
  });

  it('reads a turned part by its world extent', () => {
    // Flat, turned 90: width (4) on X, length (10) on Z. Plan: right +X, up −Z.
    const d = dimensionView([createBoard({ length: 10, width: 4, thickness: 1, rotation: 90 })], TOP, 16);
    expect(d.horizontal.overall!.label).toBe('4"');
    expect(d.vertical.overall!.label).toBe('10"');
    expect(d.vertical.name).toBe('Depth');
  });

  it('has no dimensions for no parts', () => {
    expect(dimensionView([], FRONT, 16)).toEqual({
      horizontal: { name: 'Width', overall: null, chain: [] },
      vertical: { name: 'Height', overall: null, chain: [] },
    });
  });
});
