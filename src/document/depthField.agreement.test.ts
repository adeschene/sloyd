import { buildDepthField } from './depthField';
import { boardSolids } from './cuts';
import { createBoard } from './document';
import type { Board, Cut } from './types';

const cut = (over: Partial<Cut>): Cut => ({
  id: 'c', face: 'thickness', from: 'min', across: 'width',
  offset: 0, width: 1, depth: 0.25, ...over,
});

/**
 * Is the stock at (x along length, y along width) still present at the very top
 * of the board — i.e. at the min-side thickness face?
 *
 * Probes just INSIDE the face rather than exactly on it, because a solid's
 * bounds are closed and a point exactly on a boundary belongs to both sides.
 */
const stockAtMinFace = (board: Board, x: number, y: number): boolean => {
  const z = 1e-6;
  return boardSolids(board).some(
    (s) =>
      x > s.length[0] && x < s.length[1] &&
      y > s.width[0] && y < s.width[1] &&
      z > s.thickness[0] && z < s.thickness[1],
  );
};

/**
 * How deep stock is removed at (x, y), read out of the 3D model.
 *
 * At the min-side face, a solid starting at thickness[0] = d means everything
 * above d was cut away — so the removed depth is the SHALLOWEST start among the
 * solids over that point. No solid at all means the cut went clean through.
 *
 * The `Math.min` above is sound only because every geometry in GEOMETRIES uses
 * `from: 'min'` — this helper reads solids' MIN-side thickness bound, which is
 * only the removed depth at the min face. Adding a `from: 'max'` or mixed-face
 * geometry to GEOMETRIES would not make this helper silently wrong: it would
 * make the agreement assertion FAIL LOUDLY (a wrong number pinned against the
 * real depth field), never pass with the wrong answer — the safe direction for
 * a helper's blind spot to fail in.
 */
const removedDepthAtMinFace = (board: Board, x: number, y: number): number => {
  const over = boardSolids(board).filter(
    (s) => x > s.length[0] && x < s.length[1] && y > s.width[0] && y < s.width[1],
  );
  if (over.length === 0) return board.thickness;
  return Math.min(...over.map((s) => s.thickness[0]));
};

const GEOMETRIES: { name: string; cuts: Cut[] }[] = [
  { name: 'one dado across the width', cuts: [cut({ id: 'a', across: 'width', offset: 6, width: 0.75 })] },
  { name: 'two parallel disjoint', cuts: [
    cut({ id: 'a', across: 'width', offset: 2, width: 0.75 }),
    cut({ id: 'b', across: 'width', offset: 8, width: 0.75 })] },
  { name: 'two parallel overlapping, different depths', cuts: [
    cut({ id: 'a', across: 'width', offset: 2, width: 2, depth: 0.125 }),
    cut({ id: 'b', across: 'width', offset: 3, width: 2, depth: 0.375 })] },
  { name: 'perpendicular crossing, different depths', cuts: [
    cut({ id: 'a', across: 'width',  offset: 6, width: 0.75, depth: 0.125 }),
    cut({ id: 'b', across: 'length', offset: 4, width: 0.75, depth: 0.375 })] },
  { name: 'perpendicular crossing, equal depths', cuts: [
    cut({ id: 'a', across: 'width',  offset: 6, width: 0.75, depth: 0.375 }),
    cut({ id: 'b', across: 'length', offset: 4, width: 0.75, depth: 0.375 })] },
  { name: 'rabbets on all four edges plus crossing dados', cuts: [
    cut({ id: 'a', across: 'width',  offset: 0,    width: 0.5,  depth: 0.25 }),
    cut({ id: 'b', across: 'width',  offset: 23.5, width: 0.5,  depth: 0.25 }),
    cut({ id: 'c', across: 'length', offset: 0,    width: 0.5,  depth: 0.25 }),
    cut({ id: 'd', across: 'length', offset: 11.5, width: 0.5,  depth: 0.25 }),
    cut({ id: 'e', across: 'width',  offset: 12,   width: 0.75, depth: 0.125 }),
    cut({ id: 'f', across: 'length', offset: 6,    width: 0.75, depth: 0.125 })] },
];

describe('the depth field agrees with boardSolids, by construction', () => {
  it.each(GEOMETRIES)('$name', ({ cuts }) => {
    const board = createBoard({ length: 24, width: 12, cuts });
    const cells = buildDepthField(board, 'thickness', 'min', 'length', 'width');

    // Every cell the field reports as cut must be cut in the 3D model.
    for (const c of cells) {
      const x = (c.h[0] + c.h[1]) / 2;
      const y = (c.v[0] + c.v[1]) / 2;
      expect(c.depth, `cell at ${x},${y} must have positive depth`).toBeGreaterThan(0);
      expect(
        stockAtMinFace(board, x, y),
        `field says cut at ${x},${y}; boardSolids still has stock there`,
      ).toBe(false);
      expect(
        removedDepthAtMinFace(board, x, y),
        `field says ${c.depth}" deep at ${x},${y}; boardSolids removed a different amount`,
      ).toBeCloseTo(c.depth, 10);
    }

    // And the converse: anywhere the 3D model removed stock at this face, the
    // field must have a cell. Sampled on a grid fine enough to land inside
    // every cut in GEOMETRIES.
    const covered = (x: number, y: number) =>
      cells.some((c) => x > c.h[0] && x < c.h[1] && y > c.v[0] && y < c.v[1]);
    for (let x = 0.125; x < 24; x += 0.25) {
      for (let y = 0.125; y < 12; y += 0.25) {
        if (!stockAtMinFace(board, x, y)) {
          expect(covered(x, y), `boardSolids removed stock at ${x},${y}; field has no cell`).toBe(true);
        }
      }
    }
  });
});
