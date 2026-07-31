import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { boardEdges, boardSolids, cutRegion, wholeBoard } from './cuts';
import type { Board, Cut, Dimension, Region } from './types';

/** A 24 x 5-1/2 x 3/4 flat board with whatever cuts are given. */
const withCuts = (cuts: Cut[]): Board => createBoard({ cuts });

/** The canonical case: a 3/4in dado, 1/4in deep, 6in along, across the width. */
const DADO: Cut = {
  id: 'c1', face: 'thickness', from: 'max', across: 'width',
  offset: 6, width: 0.75, depth: 0.25,
};

const volume = (r: Region) =>
  (r.length[1] - r.length[0]) * (r.width[1] - r.width[0]) * (r.thickness[1] - r.thickness[0]);

const totalVolume = (solids: Region[]) => solids.reduce((sum, r) => sum + volume(r), 0);

/** Whether two regions share any interior volume. */
const overlaps = (a: Region, b: Region): boolean =>
  (['length', 'width', 'thickness'] as const).every(
    (d) => a[d][0] < b[d][1] && b[d][0] < a[d][1],
  );

describe('cutRegion', () => {
  it('spans the across axis fully and sits where offset/width say', () => {
    const board = withCuts([DADO]);
    expect(cutRegion(board, DADO)).toEqual({
      length: [6, 6.75],
      width: [0, 5.5],
      thickness: [0.5, 0.75],
    });
  });

  it('enters from the min end when from is min', () => {
    const cut = { ...DADO, from: 'min' as const };
    expect(cutRegion(withCuts([cut]), cut).thickness).toEqual([0, 0.25]);
  });

  // face === across is unrepresentable through the panel (the validator
  // drops it on load) but reachable from a Board built directly, e.g. in a
  // test or a future creation path. cutRegion must not throw — it must
  // remove nothing.
  it('is total: a degenerate cut naming the same dimension twice removes nothing', () => {
    const degenerate: Cut = { ...DADO, face: 'length', across: 'length' };
    const board = withCuts([degenerate]);
    expect(() => cutRegion(board, degenerate)).not.toThrow();
    expect(cutRegion(board, degenerate)).toEqual({
      length: [0, 0], width: [0, 0], thickness: [0, 0],
    });
  });
});

describe('boardSolids', () => {
  // The guarantee that joinery costs nothing for boards that do not use it.
  it('returns exactly one solid, the whole board, when there are no cuts', () => {
    const board = createBoard();
    expect(boardSolids(board)).toEqual([wholeBoard(board)]);
  });

  it('comes back whole rather than throwing for a degenerate face-equals-across cut', () => {
    const degenerate: Cut = { ...DADO, face: 'length', across: 'length' };
    const board = withCuts([degenerate]);
    expect(() => boardSolids(board)).not.toThrow();
    expect(boardSolids(board)).toEqual([wholeBoard(board)]);
  });

  it('leaves three solids for a dado in the middle of a face', () => {
    const solids = boardSolids(withCuts([DADO]));
    expect(solids).toHaveLength(3);
    expect(totalVolume(solids)).toBeCloseTo(24 * 5.5 * 0.75 - 0.75 * 5.5 * 0.25, 10);
  });

  it('leaves two solids for a rabbet at the end', () => {
    const rabbet: Cut = { ...DADO, offset: 0, width: 0.75 };
    expect(boardSolids(withCuts([rabbet]))).toHaveLength(2);
  });

  // The test that would catch double-removal: the union is subtracted, so
  // overlapped stock goes once. Sum-of-volumes would remove 2 x 0.75 x 5.5 x
  // 0.25 here; the union removes 1.25 x 5.5 x 0.25.
  it('subtracts overlapping cuts as a union, not as a sum', () => {
    const a: Cut = { ...DADO, id: 'a', offset: 6, width: 0.75 };
    const b: Cut = { ...DADO, id: 'b', offset: 6.5, width: 0.75 };
    const solids = boardSolids(withCuts([a, b]));
    expect(totalVolume(solids)).toBeCloseTo(24 * 5.5 * 0.75 - 1.25 * 5.5 * 0.25, 10);
  });

  it('leaves two disconnected solids for a cut at full depth', () => {
    const rip: Cut = { ...DADO, depth: 0.75 };
    const solids = boardSolids(withCuts([rip]));
    expect(solids).toHaveLength(2);
    expect(totalVolume(solids)).toBeCloseTo(24 * 5.5 * 0.75 - 0.75 * 5.5 * 0.75, 10);
  });

  it('is deterministic — the same board yields the same solids in the same order', () => {
    const board = withCuts([DADO, { ...DADO, id: 'c2', offset: 18 }]);
    expect(boardSolids(board)).toEqual(boardSolids(board));
  });

  it('handles cuts on different faces at once', () => {
    const across: Cut = {
      id: 'c2', face: 'width', from: 'min', across: 'thickness',
      offset: 2, width: 0.5, depth: 1,
    };
    const solids = boardSolids(withCuts([DADO, across]));
    expect(solids.length).toBeGreaterThan(3);

    // No two solids may overlap each other, and none may overlap either cut.
    const dadoRegion = cutRegion(withCuts([DADO, across]), DADO);
    const acrossRegion = cutRegion(withCuts([DADO, across]), across);
    for (let i = 0; i < solids.length; i += 1) {
      expect(overlaps(solids[i], dadoRegion)).toBe(false);
      expect(overlaps(solids[i], acrossRegion)).toBe(false);
      for (let j = i + 1; j < solids.length; j += 1) {
        expect(overlaps(solids[i], solids[j])).toBe(false);
      }
    }

    // Pin the extents for the canonical single-dado case, which this test
    // otherwise only checks by count and non-overlap. The slab below the
    // dado (thickness [0, 0.5]) is never interrupted and merges across the
    // whole board length; the slab above it (thickness [0.5, 0.75]) is cut
    // in two by the dado and cannot merge across that gap.
    const dadoOnly = boardSolids(withCuts([DADO]));
    expect(dadoOnly).toEqual([
      { length: [0, 24], width: [0, 5.5], thickness: [0, 0.5] },
      { length: [0, 6], width: [0, 5.5], thickness: [0.5, 0.75] },
      { length: [6.75, 24], width: [0, 5.5], thickness: [0.5, 0.75] },
    ]);
  });

  // Two cuts can each individually survive document.ts's single-cut
  // full-removal guard yet jointly remove everything the guard cannot see
  // (it has no view of other cuts). That is a legal, reachable output, not a
  // bug — see boardSolids's doc comment.
  it('returns no solids when cuts jointly remove the entire board', () => {
    const left: Cut = {
      id: 'a', face: 'thickness', from: 'max', across: 'width',
      offset: 0, width: 12, depth: 0.75,
    };
    const right: Cut = { ...left, id: 'b', offset: 12, width: 12 };
    expect(boardSolids(withCuts([left, right]))).toEqual([]);
  });
});

describe('boardEdges', () => {
  it('gives an uncut board exactly the twelve edges of its box', () => {
    expect(boardEdges(createBoard())).toHaveLength(12);
  });

  /** Segments that lie in the plane `d === value`, ignoring direction. */
  const inPlane = (segs: ReturnType<typeof boardEdges>, d: Dimension, value: number) =>
    segs.filter(([a, b]) => a[d] === value && b[d] === value);

  // The whole reason this function exists. The bottom face (thickness 0) is
  // continuous stock under the dado, but it is covered by three abutting
  // solids — per-solid edges would draw lines across it at length 6 and 6.75.
  it('draws no line across the uncut face beneath a dado', () => {
    const segs = inPlane(boardEdges(withCuts([DADO])), 'thickness', 0);
    // Only the four edges of the bottom face itself.
    expect(segs).toHaveLength(4);
    expect(segs.some(([a, b]) => a.length === 6 && b.length === 6)).toBe(false);
    expect(segs.some(([a, b]) => a.length === 6.75 && b.length === 6.75)).toBe(false);
  });

  it('draws the shoulders and floor of a dado', () => {
    const segs = boardEdges(withCuts([DADO]));
    // Both shoulders: a concave edge at the dado floor, running across width.
    const shoulders = segs.filter(
      ([a, b]) => a.thickness === 0.5 && b.thickness === 0.5 &&
                  a.length === b.length && (a.length === 6 || a.length === 6.75),
    );
    expect(shoulders).toHaveLength(2);
    // And the top face is now interrupted: it has more than its own four edges.
    expect(inPlane(segs, 'thickness', 0.75).length).toBeGreaterThan(4);
  });

  it('is deterministic', () => {
    const board = withCuts([DADO]);
    expect(boardEdges(board)).toEqual(boardEdges(board));
  });
});
