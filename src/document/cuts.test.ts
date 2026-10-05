import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { boardEdges, boardSolids, cutLabel, cutShape, storedAsShape, openSides, cutRegion, cutRemovesNothing, solidWorldBox, stockProbe, wholeBoard } from './cuts';
import type { Board, Cut, Dimension, Region } from './types';

/** A 24 x 5-1/2 x 3/4 flat board with whatever cuts are given. */
const withCuts = (cuts: Cut[]): Board => createBoard({ cuts });

/** The canonical case: a 3/4in dado, 1/4in deep, 6in along, across the width. */
const DADO: Cut = {
  id: 'c1', face: 'thickness', from: 'max', across: 'width',
  offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0,
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
    const rip: Cut = { ...DADO, depth: 0.75, stopMin: 0, stopMax: 0 };
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
      offset: 2, width: 0.5, depth: 1, stopMin: 0, stopMax: 0,
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
      offset: 0, width: 12, depth: 0.75, stopMin: 0, stopMax: 0,
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

  // A full-depth sever splits the board into two disconnected pieces, so the
  // result is exactly two complete box outlines (12 edges each) and nothing
  // else: no phantom line where the pieces parted, and no fragment left over
  // from the cut's own boundary planes. If the four-cell rule wrongly treated
  // the empty slot as stock, the two exposed end faces would go missing and
  // the count would fall under 24.
  //
  // This case does NOT exercise the run-merging, despite splitting the length
  // axis: each surviving piece is one cell on every axis (the sever adds no
  // interior thickness plane, and `across: width` spans fully), so no run of
  // two or more cells ever exists to merge. Verified by mutation — emitting
  // one segment per cell instead of per run leaves this test green. The merge
  // is covered by the next test down, and by 'draws no line across the uncut
  // face beneath a dado'; both go red under that mutation. Do not cite this
  // one as merge coverage.
  it('gives a full-depth sever exactly two box outlines, 24 segments total', () => {
    const rip: Cut = { ...DADO, depth: 0.75, stopMin: 0, stopMax: 0 };
    const segs = boardEdges(withCuts([rip]));
    expect(segs).toHaveLength(24);
  });

  // Regression for the merge across an UNRELATED cut's grid splits. Two
  // dados at the same depth but different length ranges each introduce their
  // own length-axis grid lines; the bottom face (thickness 0, never touched
  // by either cut) must merge across both of them into its own four edges,
  // not fragment at every split the dados happen to introduce elsewhere. If
  // the merge were absent, the bottom face would show extra segments at each
  // dado's length boundaries; if it were over-eager (bridging the gap between
  // the two dados' floors), the 36 total below would come out under instead.
  it('merges the uncut face across two unrelated dados: 4 + 8 = 12 at those planes, 36 total', () => {
    const a: Cut = { ...DADO, id: 'a', offset: 2, width: 0.75, depth: 0.5, stopMin: 0, stopMax: 0 };
    const b: Cut = { ...DADO, id: 'b', offset: 18, width: 0.75, depth: 0.5, stopMin: 0, stopMax: 0 };
    const segs = boardEdges(withCuts([a, b]));

    const bottom = inPlane(segs, 'thickness', 0);
    expect(bottom).toHaveLength(4);

    const floors = inPlane(segs, 'thickness', 0.25);
    expect(floors).toHaveLength(8);

    expect(segs).toHaveLength(36);
  });
});

describe('solidWorldBox', () => {
  it('places an uncut board at its own centre', () => {
    const board = createBoard();
    const box = solidWorldBox(board, wholeBoard(board));
    expect(box.center).toEqual([0, 0, 0]);
    // Flat, 0 degrees: X = length, Y = thickness, Z = width.
    expect(box.size).toEqual([24, 0.75, 5.5]);
  });

  it('offsets a sub-box from the board centre', () => {
    const board = withCuts([DADO]);
    const half = solidWorldBox(board, {
      length: [0, 12], width: [0, 5.5], thickness: [0, 0.75],
    });
    expect(half.size).toEqual([12, 0.75, 5.5]);
    expect(half.center).toEqual([-6, 0, 0]);
  });

  it('follows posture — an upright board puts length on Y', () => {
    const board = createBoard({ posture: 'upright' });
    expect(solidWorldBox(board, wholeBoard(board)).size).toEqual([5.5, 24, 0.75]);
  });
});

describe('cutLabel', () => {
  it('calls a cut in the middle of a face a dado', () => {
    expect(cutLabel(withCuts([DADO]), DADO)).toBe('dado');
  });

  it('calls a cut flush with either end a rabbet', () => {
    const atStart = { ...DADO, offset: 0 };
    const atEnd = { ...DADO, offset: 24 - 0.75 };
    expect(cutLabel(withCuts([atStart]), atStart)).toBe('rabbet');
    expect(cutLabel(withCuts([atEnd]), atEnd)).toBe('rabbet');
  });

  // validateCuts clamps a shrunk board's cut width with `posDim - offset`,
  // which is exactly how this offset/width pair is built. offset + width
  // does not round-trip to posDim exactly here — it lands a couple of ULP
  // above it — so an exact `===` comparison would misclassify this genuine
  // rabbet as a dado.
  it('still calls it a rabbet when offset + width drifts off posDim by a couple of ULP', () => {
    const posDim = 63.36207767762102;
    const offset = 29.0388509792035;
    const width = posDim - offset; // the validator's clamp: posDim - offset
    expect(offset + width).not.toBe(posDim); // sanity: this pair actually drifts

    const board = createBoard({ length: posDim });
    const cut: Cut = { ...DADO, offset, width };
    expect(cutLabel(board, cut)).toBe('rabbet');
  });
});

describe('stockProbe', () => {
  // Canonical dado on the default 24 x 5-1/2 x 3/4 board: a 3/4in-wide,
  // 1/4in-deep cut at 6in along, running across the width, entering the
  // thickness face from `max`. So cutRegion is
  // { length: [6, 6.75], width: [0, 5.5], thickness: [0.5, 0.75] }.

  it('accepts a point in solid stock well away from any cut', () => {
    const touches = stockProbe(withCuts([DADO]));
    expect(touches({ length: 3, width: 2, thickness: 0.25 })).toBe(true);
  });

  it('rejects a point in the middle of the removed stock', () => {
    const touches = stockProbe(withCuts([DADO]));
    // Dead centre of the dado's own volume: no cell touching it is filled.
    expect(touches({ length: 6.375, width: 2.75, thickness: 0.625 })).toBe(false);
  });

  it('accepts a point on the dado floor, where filled and empty cells meet', () => {
    const touches = stockProbe(withCuts([DADO]));
    // thickness 0.5 is a split plane: the cell below it is stock, the cell
    // above it was removed. Touching one filled cell is enough — this is the
    // whole reason the test is on the CLOSED span, not the open one.
    expect(touches({ length: 6.375, width: 2.75, thickness: 0.5 })).toBe(true);
  });

  it('accepts a point on a shoulder wall', () => {
    const touches = stockProbe(withCuts([DADO]));
    // length 6 is the shoulder plane; the stock on the low side of it is filled.
    expect(touches({ length: 6, width: 2.75, thickness: 0.625 })).toBe(true);
  });

  it('rejects every point on a board its own cuts consumed', () => {
    // Two adjacent full-depth cuts, each individually legal (neither is
    // full-width, so validateCuts refuses neither), jointly removing all the
    // stock. boardSolids returns [] here — see its doc comment.
    const board = withCuts([
      { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 0, width: 12, depth: 0.75, stopMin: 0, stopMax: 0 },
      { id: 'b', face: 'thickness', from: 'min', across: 'width', offset: 12, width: 12, depth: 0.75, stopMin: 0, stopMax: 0 },
    ]);
    expect(boardSolids(board)).toHaveLength(0);
    const touches = stockProbe(board);
    expect(touches({ length: 0, width: 0, thickness: 0 })).toBe(false);
    expect(touches({ length: 12, width: 2.75, thickness: 0.75 })).toBe(false);
    expect(touches({ length: 24, width: 5.5, thickness: 0.375 })).toBe(false);
  });

  it('rejects a point outside the board entirely', () => {
    const touches = stockProbe(withCuts([DADO]));
    expect(touches({ length: 30, width: 2, thickness: 0.25 })).toBe(false);
    expect(touches({ length: 3, width: 2, thickness: -1 })).toBe(false);
  });

  it('accepts the board corner of an uncut board', () => {
    const touches = stockProbe(withCuts([]));
    expect(touches({ length: 0, width: 0, thickness: 0 })).toBe(true);
    expect(touches({ length: 24, width: 5.5, thickness: 0.75 })).toBe(true);
  });
});

describe('cutRegion with stops', () => {
  const b = createBoard({ length: 24, width: 6, thickness: 1 });
  const base: Cut = {
    id: 'c', face: 'thickness', from: 'min', across: 'width',
    offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0,
  };
  const EMPTY = { length: [0, 0], width: [0, 0], thickness: [0, 0] };

  it('runs fully across when neither end is stopped', () => {
    expect(cutRegion(b, base).width).toEqual([0, 6]);
  });

  it('stops short of the min end', () => {
    expect(cutRegion(b, { ...base, stopMin: 1 }).width).toEqual([1, 6]);
  });

  it('stops short of the max end', () => {
    expect(cutRegion(b, { ...base, stopMax: 2 }).width).toEqual([0, 4]);
  });

  it('stops short of both ends — a mortise — and leaves the other two spans alone', () => {
    expect(cutRegion(b, { ...base, stopMin: 1, stopMax: 2 })).toEqual({
      length: [6, 6.75], width: [1, 4], thickness: [0, 0.25],
    });
  });

  it('clamps a negative stop to 0', () => {
    expect(cutRegion(b, { ...base, stopMin: -1 }).width).toEqual([0, 6]);
  });

  it('treats a non-finite stop as no stop, so no NaN can reach the grid', () => {
    expect(cutRegion(b, { ...base, stopMin: NaN, stopMax: Infinity }).width).toEqual([0, 6]);
  });

  it('removes nothing when the stops cross (a board shortened under its cut)', () => {
    const crossed: Cut = { ...base, stopMin: 4, stopMax: 3 };
    expect(cutRegion(b, crossed)).toEqual(EMPTY);
    const cutBoard = createBoard({ length: 24, width: 6, thickness: 1, cuts: [crossed] });
    expect(boardSolids(cutBoard)).toEqual(boardSolids(b));
    expect(stockProbe(cutBoard)({ length: 6.375, width: 3, thickness: 0.1 })).toBe(true);
  });

  it('removes nothing when the stops exactly meet', () => {
    expect(cutRegion(b, { ...base, stopMin: 3, stopMax: 3 })).toEqual(EMPTY);
  });

  it('leaves stock past a stopped end', () => {
    const stopped = createBoard({
      length: 24, width: 6, thickness: 1, cuts: [{ ...base, stopMax: 2 }],
    });
    const probe = stockProbe(stopped);
    // Inside the cut's footprint, just under the surface: removed.
    expect(probe({ length: 6.375, width: 2, thickness: 0.1 })).toBe(false);
    // Past the stop, same depth: still wood.
    expect(probe({ length: 6.375, width: 5, thickness: 0.1 })).toBe(true);
  });
});

describe('cutLabel with stops', () => {
  // 24 x 6 x 1. The position axis is length, so offset 0 or 23.25 (width 0.75) is flush.
  const b = createBoard({ length: 24, width: 6, thickness: 1 });
  const c = (over: Partial<Cut>): Cut => ({
    id: 'c', face: 'thickness', from: 'min', across: 'width',
    offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0, ...over,
  });

  it.each<[string, Partial<Cut>]>([
    ['dado', {}],
    ['rabbet', { offset: 0 }],
    ['stopped dado', { stopMax: 1 }],
    ['stopped dado', { stopMin: 1 }],
    ['stopped rabbet', { offset: 0, stopMax: 1 }],
    // Cut-words spec §2.2: closed pocket 3/4 x 4, depth 1/4 -> 'blind dado' (formerly 'mortise').
    ['blind dado', { stopMin: 1, stopMax: 1 }],
    ['through mortise', { stopMin: 1, stopMax: 1, depth: 1 }],
    // Spec §2.2: one edge open, reach 3/4, run 4 > 4 x 3/4 = 3 -> 'stopped rabbet' (formerly 'notch').
    ['stopped rabbet', { offset: 0, stopMin: 1, stopMax: 1 }],
    ['stopped rabbet', { offset: 23.25, stopMin: 1, stopMax: 1 }],
    ['stopped rabbet', { offset: 0, stopMin: 1, stopMax: 1, depth: 1 }],
  ])('names %s', (want, over) => {
    expect(cutLabel(b, c(over))).toBe(want);
  });

  it('calls a mortise a sixteenth short of full depth a mortise, not through', () => {
    expect(cutLabel(b, c({ stopMin: 1, stopMax: 1, depth: 0.9375 }))).toBe('mortise');
  });

  it('calls a depth past the face (out of range mid-session) through', () => {
    expect(cutLabel(b, c({ stopMin: 1, stopMax: 1, depth: 1.5 }))).toBe('through mortise');
  });
});

describe('cutRemovesNothing (follow-up 178)', () => {
  // A 10 x 2 x 1 board: what a 24" part with a dado looks like after a shrink.
  const b = createBoard({ length: 10, width: 2, thickness: 1 });
  const c = (over: Partial<Cut>): Cut => ({
    id: 'c', face: 'thickness', from: 'min', across: 'width',
    offset: 4, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0, ...over,
  });

  const CASES: [string, Partial<Cut>, boolean][] = [
    ['an ordinary dado', {}, false],
    ['a cut running partly past the end', { offset: 9.5, width: 1 }, false],
    ['a far-side cut deeper than the face', { from: 'max', depth: 3 }, false],
    ['a mortise', { stopMin: 0.5, stopMax: 0.5 }, false],
    ['stops that cross', { stopMin: 1.5, stopMax: 1 }, true],
    ['stops that exactly meet', { stopMin: 1, stopMax: 1 }, true],
    ['an offset past the end', { offset: 20 }, true],
    ['an offset exactly at the end', { offset: 10 }, true],
    ['an offset wholly before the start', { offset: -3, width: 1 }, true],
    ['zero width', { width: 0 }, true],
    ['zero depth', { depth: 0 }, true],
    ['a cut naming one dimension twice', { across: 'thickness' }, true],
    // Unreachable in the app (the loader and DimensionField refuse it), but
    // cutRegion is total over a directly-built Board, so this must be too.
    ['a NaN offset', { offset: NaN }, true],
  ];

  it.each(CASES)('%s', (_, over, want) => {
    expect(cutRemovesNothing(b, c(over))).toBe(want);
  });

  // The doc comment claims agreement with boardSolids BY CONSTRUCTION, so the
  // test asserts the agreement itself, in both directions, for every row —
  // not merely that the solids of a few hand-picked empties are whole.
  it.each(CASES)('agrees with boardSolids: %s', (_, over) => {
    const cutBoard = createBoard({ length: 10, width: 2, thickness: 1, cuts: [c(over)] });
    const whole = JSON.stringify(boardSolids(cutBoard)) === JSON.stringify(boardSolids(b));
    expect(cutRemovesNothing(b, c(over))).toBe(whole);
  });
});

describe('cutLabel names the opening (cut-words spec §2)', () => {
  // 24 long × 6 wide × 1 thick. Every cut enters the thickness face from min.
  const b = createBoard({ length: 24, width: 6, thickness: 1 });
  const c = (over: Partial<Cut>): Cut => ({
    id: 'c', face: 'thickness', from: 'min', across: 'width',
    offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0, ...over,
  });

  it.each<[string, Partial<Cut>, string]>([
    ['a mid-face dado', {}, 'dado'],
    ['an end rabbet', { offset: 0 }, 'rabbet'],
    ['the whole face lowered', { offset: 0, width: 24 }, 'rabbet'],
    ['a rabbet stopped at one end (a corner)', { offset: 0, stopMax: 2 }, 'stopped rabbet'],
    ['a dado stopped at one end', { stopMax: 2 }, 'stopped dado'],
    ['a hinge pocket on an edge (3in along, 3/4in in)',
      { across: 'length', offset: 0, width: 0.75, stopMin: 10, stopMax: 11 }, 'notch'],
    ['a long edge rabbet stopped at both ends (20in along, 3/4in in)',
      { across: 'length', offset: 0, width: 0.75, stopMin: 2, stopMax: 2 }, 'stopped rabbet'],
    ['a tenon mortise (1/2in × 2in, 3/4in deep)',
      { across: 'length', offset: 2, width: 0.5, depth: 0.75, stopMin: 10, stopMax: 12 }, 'mortise'],
    ['a shelf housing closed at both ends (3/4in × 4in, 1/4in deep)',
      { stopMin: 1, stopMax: 1 }, 'blind dado'],
    ['a through mortise', { across: 'length', offset: 2, width: 0.5, depth: 1, stopMin: 10, stopMax: 12 }, 'through mortise'],
  ])('%s → %s', (_, over, want) => {
    expect(cutLabel(b, c(over))).toBe(want);
  });

  it('gives one box stored two ways one word (fu 181)', () => {
    // Box: thickness [0, 0.25], width [0, 0.75] (at the edge), length [2, 22].
    const acrossLength = c({ across: 'length', offset: 0, width: 0.75, stopMin: 2, stopMax: 2 });
    const acrossWidth = c({ across: 'width', offset: 2, width: 20, stopMin: 0, stopMax: 5.25 });
    expect(cutLabel(b, acrossLength)).toBe('stopped rabbet');
    expect(cutLabel(b, acrossWidth)).toBe('stopped rabbet');
  });

  it('ties: a square pocket on an edge is a notch; a pocket as deep as wide, running with the grain, is a blind groove', () => {
    expect(cutLabel(b, c({ across: 'length', offset: 0, width: 0.75, stopMin: 10, stopMax: 13.25 }))).toBe('notch');
    expect(cutLabel(b, c({ across: 'length', offset: 2, width: 0.5, depth: 0.5, stopMin: 10, stopMax: 12 }))).toBe('blind groove');
  });

  it('a cut that removes nothing keeps its old-table word', () => {
    expect(cutLabel(b, c({ offset: 30 }))).toBe('dado');
  });
});

describe('open means no stock (cut-words spec §2.4)', () => {
  // A bookcase side: 72 long × 11-1/4 wide (back to front) × 3/4 thick.
  // The back rabbet removes width [0, 1/4] × thickness [3/8, 3/4] along the whole length.
  const backRabbet = (over: Partial<Cut> = {}): Cut => ({
    id: 'r', face: 'width', from: 'min', across: 'length', offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0, ...over,
  });
  // A shelf housing 24in up: width [stopMin, 11.25 − stopMax] × thickness [1/2, 3/4].
  const housing = (over: Partial<Cut> = {}): Cut => ({
    id: 'h', face: 'thickness', from: 'max', across: 'width', offset: 24, width: 0.75, depth: 0.25, stopMin: 0.25, stopMax: 0, ...over,
  });
  const side = (...cuts: Cut[]) => createBoard({ length: 72, width: 11.25, thickness: 0.75, cuts });

  it('a housing that runs out into the back rabbet is a dado', () => {
    const b = side(backRabbet(), housing());
    expect(openSides(b, b.cuts[1]).width).toEqual({ min: true, max: true });
    expect(cutLabel(b, b.cuts[1])).toBe('dado');
  });

  it('the same housing with no rabbet is still stopped', () => {
    const b = side(housing());
    expect(cutLabel(b, b.cuts[0])).toBe('stopped dado');
  });

  it('a rabbet too narrow to reach the housing leaves stock: stopped', () => {
    // width [0, 1/8] removed; [1/8, 1/4] still stands between the housing and the back edge.
    const b = side(backRabbet({ depth: 0.125 }), housing());
    expect(cutLabel(b, b.cuts[1])).toBe('stopped dado');
  });

  it('a rabbet too shallow to cover the housing\'s depth leaves stock: stopped', () => {
    // thickness [5/8, 3/4] removed; the housing is [1/2, 3/4], so [1/2, 5/8] still stands.
    const b = side(backRabbet({ offset: 0.625, width: 0.125 }), housing());
    expect(cutLabel(b, b.cuts[1])).toBe('stopped dado');
  });

  // The mirror: a rabbet at width-max, removing width [11, 11.25] x thickness [3/8, 3/4].
  const frontRabbet = (): Cut => backRabbet({ from: 'max' });
  it('a housing running out into a rabbet at the MAX side is a dado', () => {
    const b = side(frontRabbet(), housing({ stopMin: 0, stopMax: 0.25 }));
    expect(openSides(b, b.cuts[1]).width).toEqual({ min: true, max: true });
    expect(cutLabel(b, b.cuts[1])).toBe('dado');
  });
  it('the same pair with the min end stopped 3/4 is a stopped dado', () => {
    const b = side(frontRabbet(), housing({ stopMin: 0.75, stopMax: 0.25 }));
    expect(openSides(b, b.cuts[1]).width).toEqual({ min: false, max: true });
    expect(cutLabel(b, b.cuts[1])).toBe('stopped dado');
  });

  it('a housing stopped at the front and open into the rabbet is a stopped dado; with no rabbet a blind dado', () => {
    expect(cutLabel(side(backRabbet(), housing({ stopMax: 0.75 })), housing({ stopMax: 0.75 }))).toBe('stopped dado');
    expect(cutLabel(side(housing({ stopMax: 0.75 })), housing({ stopMax: 0.75 }))).toBe('blind dado');
  });
});

describe('a full-thickness corner cut is a notch (cut-words spec §2.5)', () => {
  // A shelf 30-1/2 long × 11 wide × 3/4 thick, notched at the length-min/width-max corner: length [0, 1/4] × width [10-1/4, 11].
  const shelf = (cut: Cut) => createBoard({ length: 30.5, width: 11, thickness: 0.75, cuts: [cut] });
  it('stored entering the end', () => {
    const cut: Cut = { id: 'n', face: 'length', from: 'min', across: 'thickness', offset: 10.25, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    expect(cutLabel(shelf(cut), cut)).toBe('notch');
  });
  it('the same box stored entering the broad face, through', () => {
    const cut: Cut = { id: 'n', face: 'thickness', from: 'min', across: 'width', offset: 0, width: 0.25, depth: 0.75, stopMin: 10.25, stopMax: 0 };
    expect(cutLabel(shelf(cut), cut)).toBe('notch');
  });
  it('a full-thickness strip along a whole edge is not a notch', () => {
    const cut: Cut = { id: 'n', face: 'width', from: 'max', across: 'length', offset: 0, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    expect(cutLabel(shelf(cut), cut)).toBe('rabbet');
  });
});

describe('a mortise is a deep hole, not a long channel (cut-words spec §2.6)', () => {
  const pocket = (b: { length: number; width: number; thickness: number }, cut: Cut) => cutLabel(createBoard({ ...b, cuts: [cut] }), cut);
  it('the workbench mortise: 1/2 × 4-1/2, 1-1/4 deep', () => {
    // A 34in leg, 1-3/4 square. Opening: thickness [1/2, 1] × length [28, 32.5].
    expect(pocket({ length: 34, width: 1.75, thickness: 1.75 },
      { id: 'm', face: 'width', from: 'max', across: 'length', offset: 0.5, width: 0.5, depth: 1.25, stopMin: 28, stopMax: 1.5 })).toBe('mortise');
  });
  it('a 30in back groove 1/4 wide and 3/8 deep (with the grain) is a blind groove', () => {
    expect(pocket({ length: 72, width: 11.25, thickness: 0.75 },
      { id: 'g', face: 'thickness', from: 'min', across: 'length', offset: 1, width: 0.25, depth: 0.375, stopMin: 2, stopMax: 40 })).toBe('blind groove');
  });
  it('exactly 8× its depth is still a mortise', () => {
    // Opening 1/4 × 4, depth 1/2: 4 = 8 × 1/2.
    expect(pocket({ length: 34, width: 1.75, thickness: 1.75 },
      { id: 'm', face: 'width', from: 'max', across: 'length', offset: 0.5, width: 0.25, depth: 0.5, stopMin: 10, stopMax: 20 })).toBe('mortise');
  });
});

describe('cutShape: one description, whichever way the cut is stored (cut-lines spec §2.1)', () => {
  // The default board is 24 (length) x 5-1/2 (width) x 3/4 (thickness), grain along the length.
  const b = (cuts: Cut[] = []) => withCuts(cuts);
  const cut = (c: Partial<Cut>): Cut => ({ ...DADO, ...c });
  const same = (c1: Cut, c2: Cut) => expect(cutShape(b([c1]), c1)).toEqual(cutShape(b([c2]), c2));

  it('a dado: runs along the axis it passes through, either storage', () => {
    const s = cutShape(b([DADO]), DADO);
    expect(s).toEqual({ word: 'dado', run: 'width', pos: 'length', at: [6, 6.75], along: [0, 5.5], stopMin: null, stopMax: null, runByDefault: false });
    same(DADO, cut({ across: 'length', offset: 0, width: 5.5, stopMin: 6, stopMax: 17.25 }));
  });

  it('a rabbet: either storage', () => {
    const r = cut({ offset: 0 });
    expect(cutShape(b([r]), r)).toMatchObject({ word: 'rabbet', run: 'width', pos: 'length', at: [0, 0.75] });
    same(r, cut({ across: 'length', offset: 0, width: 5.5, stopMin: 0, stopMax: 23.25 }));
  });

  it('a stopped dado runs toward its open edge and stops at the closed one', () => {
    const s = cut({ stopMax: 1 });
    expect(cutShape(b([s]), s)).toEqual({ word: 'stopped dado', run: 'width', pos: 'length', at: [6, 6.75], along: [0, 4.5], stopMin: null, stopMax: 1, runByDefault: false });
    same(s, cut({ across: 'length', offset: 0, width: 4.5, stopMin: 6, stopMax: 17.25 }));
  });

  it('a mortise runs along its long side, with both stops', () => {
    const m = cut({ across: 'length', offset: 2, width: 0.5, depth: 0.625, stopMin: 6, stopMax: 15 });
    expect(cutShape(b([m]), m)).toEqual({ word: 'mortise', run: 'length', pos: 'width', at: [2, 2.5], along: [6, 9], stopMin: 6, stopMax: 15, runByDefault: false });
    same(m, cut({ across: 'width', offset: 6, width: 3, depth: 0.625, stopMin: 2, stopMax: 3 }));
  });

  it('a square closed opening runs along the length, whichever way it is stored (cut-storage §2)', () => {
    const sq = cut({ offset: 6, width: 1, stopMin: 2, stopMax: 2.5 });
    const sq2 = cut({ across: 'length', offset: 2, width: 1, stopMin: 6, stopMax: 17 });
    expect(cutShape(b([sq]), sq).run).toBe('length');
    same(sq, sq2);
  });

  it('a square edge notch runs from its open edge, whichever way it is stored (cut-storage §2)', () => {
    // Opening length [6, 6.75] x width [4.75, 5.5]: open at the width's max edge only.
    const n1 = cut({ stopMin: 4.75 });
    const n2 = cut({ across: 'length', offset: 4.75, width: 0.75, stopMin: 6, stopMax: 17.25 });
    expect(cutShape(b([n1]), n1)).toMatchObject({ word: 'notch', run: 'width', pos: 'length', stopMin: 4.75, stopMax: null });
    same(n1, n2);
  });

  it('a square corner opening (one open end on each axis) runs along the length', () => {
    const c1 = cut({ offset: 0, width: 1, stopMin: 0, stopMax: 4.5 });
    const c2 = cut({ across: 'length', offset: 0, width: 1, stopMin: 0, stopMax: 23 });
    expect(cutShape(b([c1]), c1).run).toBe('length');
    same(c1, c2);
  });

  it('the axis open at both ends wins even when the other extent is longer (rule 1)', () => {
    const wide = cut({ offset: 2, width: 20 });
    expect(cutShape(b([wide]), wide)).toMatchObject({ run: 'width', pos: 'length', at: [2, 22], along: [0, 5.5], stopMin: null, stopMax: null });
  });

  it('runByDefault: true only when the tie\'s final default decided the run (fu 198)', () => {
    const square = cut({ offset: 6, width: 1, stopMin: 2, stopMax: 2.5 });          // closed square
    const corner = cut({ offset: 0, width: 1, stopMin: 0, stopMax: 4.5 });          // one open end on each axis
    const edgeNotch = cut({ stopMin: 4.75 });                                        // square, one open end on width only
    const stopped = cut({ stopMax: 1 });
    expect(cutShape(b([square]), square).runByDefault).toBe(true);
    expect(cutShape(b([corner]), corner).runByDefault).toBe(true);
    expect(cutShape(b([edgeNotch]), edgeNotch).runByDefault).toBe(false);
    expect(cutShape(b([DADO]), DADO).runByDefault).toBe(false);
    expect(cutShape(b([stopped]), stopped).runByDefault).toBe(false);
  });

  it('an end opened by another cut is open: no stop there', () => {
    const backRabbet: Cut = { id: 'r', face: 'width', from: 'min', across: 'length', offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0 };
    const housing: Cut = { id: 'h', face: 'thickness', from: 'max', across: 'length', offset: 0.25, width: 10.25, depth: 0.25, stopMin: 24, stopMax: 47.25 };
    const side = createBoard({ length: 72, width: 11.25, thickness: 0.75, cuts: [backRabbet, housing] });
    expect(cutShape(side, housing)).toEqual({
      word: 'stopped dado', run: 'width', pos: 'length', at: [24, 24.75], along: [0.25, 10.5], stopMin: null, stopMax: 0.75, runByDefault: false,
    });
  });

  it('a cut that removes nothing keeps its old word and does not throw', () => {
    const gone = cut({ offset: 30 });
    expect(() => cutShape(b([gone]), gone)).not.toThrow();
    expect(cutLabel(b([gone]), gone)).toBe(cutShape(b([gone]), gone).word);
  });
});

describe('groove: a channel running with the grain (cut-lines spec §3)', () => {
  // The default board's grain runs along its length. A channel on the broad
  // face running along the length: face thickness, across length.
  const along = (c: Partial<Cut> = {}): Cut => ({ ...DADO, across: 'length', offset: 2, width: 0.75, ...c });
  const word = (board: Partial<Board>, c: Cut) => cutLabel(createBoard({ ...board, cuts: [c] }), c);

  it('with the grain on pine is a groove; across it is a dado', () => {
    expect(word({}, along())).toBe('groove');
    expect(word({}, DADO)).toBe('dado');
  });

  it('turning the board\'s grain turns the word', () => {
    expect(word({ grain: 'width' }, along())).toBe('dado');
    expect(word({ grain: 'width' }, DADO)).toBe('groove');
  });

  it('plywood has grain; MDF does not', () => {
    expect(word({ material: 'plywood' }, along())).toBe('groove');
    expect(word({ material: 'mdf' }, along())).toBe('dado');
  });

  it('stopped and blind versions', () => {
    expect(word({}, along({ stopMax: 1 }))).toBe('stopped groove');
    expect(word({}, along({ stopMin: 1, stopMax: 1 }))).toBe('blind groove');
  });

  it('a panel groove in a rail\'s EDGE is a groove', () => {
    const edge: Cut = { id: 'g', face: 'width', from: 'max', across: 'length', offset: 0.25, width: 0.25, depth: 0.375, stopMin: 0, stopMax: 0 };
    expect(word({}, edge)).toBe('groove');
  });

  it('a rabbet and a mortise with the grain keep their words', () => {
    expect(word({}, along({ offset: 0 }))).toBe('rabbet');
    expect(word({}, along({ width: 0.5, depth: 0.625, stopMin: 6, stopMax: 15 }))).toBe('mortise');
  });

  it('a cut that removes nothing stays on the old table', () => {
    expect(word({}, along({ offset: 30 }))).not.toMatch(/groove/);
  });
});

describe('storedAsShape: the same cut, stored the way it runs (cut-storage spec §3.1)', () => {
  const clipped = (b: Board, c: Cut) => {
    const r = cutRegion(b, c);
    return (['length', 'width', 'thickness'] as const).map((d) => [Math.max(0, r[d][0]), Math.min(b[d], r[d][1])]);
  };
  const check = (b: Board, c: Cut, run: Dimension) => {
    const s = storedAsShape(b, c);
    expect(s.across).toBe(run);
    expect(s.id).toBe(c.id);
    expect(clipped(b, s)).toEqual(clipped(b, c));
    expect(cutShape({ ...b, cuts: b.cuts.map((x) => (x.id === c.id ? s : x)) }, s)).toEqual(cutShape(b, c));
    return s;
  };

  it('re-stores 192\'s housing across the width, beside the back rabbet', () => {
    const backRabbet: Cut = { id: 'r', face: 'width', from: 'min', across: 'length', offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0 };
    const housing: Cut = { id: 'h', face: 'thickness', from: 'max', across: 'length', offset: 0.25, width: 10.25, depth: 0.25, stopMin: 24, stopMax: 47.25 };
    const side = createBoard({ length: 72, width: 11.25, thickness: 0.75, cuts: [backRabbet, housing] });
    expect(check(side, housing, 'width')).toEqual({ ...housing, across: 'width', offset: 24, width: 0.75, stopMin: 0.25, stopMax: 0.75 });
  });

  it('re-stores a sideways dado, stopped dado, mortise and edge notch', () => {
    const one = (c: Cut) => withCuts([c]);
    const dado = { ...DADO, across: 'length' as const, offset: 0, width: 5.5, stopMin: 6, stopMax: 17.25 };
    check(one(dado), dado, 'width');
    const stopped = { ...DADO, across: 'length' as const, offset: 0, width: 4.5, stopMin: 6, stopMax: 17.25 };
    check(one(stopped), stopped, 'width');
    const mortise = { ...DADO, across: 'width' as const, offset: 6, width: 3, depth: 0.625, stopMin: 2, stopMax: 3 };
    check(one(mortise), mortise, 'length');
    const notch = { ...DADO, across: 'length' as const, offset: 4.75, width: 0.75, stopMin: 6, stopMax: 17.25 };
    check(one(notch), notch, 'width');
  });

  it('returns the very same object for a cut already stored the way it runs, decimals included', () => {
    const c = { ...DADO, across: 'length' as const, offset: 0.1, width: 0.2, stopMin: 0, stopMax: 0 };
    const b = withCuts([c]);
    expect(cutShape(b, c).run).toBe('length');
    expect(storedAsShape(b, c)).toBe(c);
    expect(storedAsShape(withCuts([DADO]), DADO)).toBe(DADO);
  });

  it('drops overhang when it re-stores', () => {
    // The dado stored across the length, its width span hanging 1/2" past the near edge.
    const c = { ...DADO, across: 'length' as const, offset: -0.5, width: 6, stopMin: 6, stopMax: 17.25 };
    expect(check(withCuts([c]), c, 'width')).toMatchObject({ offset: 6, width: 0.75, stopMin: 0, stopMax: 0 });
  });

  it('leaves a cut that removes nothing alone', () => {
    const gone = { ...DADO, across: 'length' as const, offset: 30 };
    expect(storedAsShape(withCuts([gone]), gone)).toBe(gone);
  });

  // Final review. In millimetres, `dim - stopMax` cannot always land on the
  // opening's far end (a target under half the board has finer bits than any
  // `dim - x` can carry), so the re-store is exact where the schema can say it
  // and otherwise lands within one ulp of the board's dimension, on the side
  // that keeps the run. The bounds below come from the board, not the code.
  const ulpOf = (x: number) => {
    const f = new Float64Array([x]);
    new BigInt64Array(f.buffer)[0] += 1n;
    return f[0] - x;
  };
  /** Each far end exact, or on the side that keeps the run within one ulp of the board's dimension. */
  const farEnds = (b: Board, c: Cut, s: Cut) => {
    const before = cutShape(b, c);
    const r = cutRegion({ ...b, cuts: b.cuts.map((x) => (x.id === c.id ? s : x)) }, s);
    const runEnd = r[before.run][1] - before.along[1];
    const posEnd = before.at[1] - r[before.pos][1];
    expect(runEnd).toBeGreaterThanOrEqual(0);
    expect(runEnd).toBeLessThanOrEqual(ulpOf(b[before.run]));
    expect(posEnd).toBeGreaterThanOrEqual(0);
    expect(posEnd).toBeLessThanOrEqual(ulpOf(b[before.pos]));
    // Near ends are copies, so always exact.
    expect(r[before.run][0]).toBe(before.along[0]);
    expect(r[before.pos][0]).toBe(before.at[0]);
    return { runEnd, posEnd };
  };

  it('a square millimetre pocket keeps its run, and a second click changes nothing', () => {
    // 600 x 140 x 19 mm; a 10 mm square pocket 6 mm deep, 10 mm from the end and
    // 20 mm in from the near edge, stored across the width. The plain
    // differences stored a far stop that cut the run one ulp short, so the run
    // flipped to the width and the next click flipped it back.
    const mm = (x: number) => x / 25.4;
    const c: Cut = { id: 'p', face: 'thickness', from: 'max', across: 'width', offset: mm(10), width: mm(10), depth: mm(6), stopMin: mm(20), stopMax: mm(110) };
    const b = createBoard({ length: mm(600), width: mm(140), thickness: mm(19), cuts: [c] });
    const before = cutShape(b, c);
    expect(before.run).toBe('length');
    const s = storedAsShape(b, c);
    const b2 = { ...b, cuts: [s] };
    const after = cutShape(b2, s);
    expect(after.run).toBe('length');
    expect(after.word).toBe(before.word);
    expect(storedAsShape(b2, s)).toBe(s);
    farEnds(b, c, s);
  });

  it('refuses a re-store the sheet would read differently: an exact-square mm corner opening', () => {
    // From the sweep: an end cut on the default board whose opening is an exact
    // square at the corner, so it reads as a notch. Its far stop cannot be
    // stored exactly, and the run-keeping ulp breaks the tie into a stopped
    // dado — so the cut is left as it is (user ruling).
    const c: Cut = { id: 'n', face: 'length', from: 'min', across: 'thickness', offset: 0, width: 0.6712598425196851, depth: 9.370078740157481, stopMin: 0.03937007874015748, stopMax: 0.03937007874015741 };
    const b = withCuts([c]);
    expect(cutShape(b, c).word).toBe('notch');
    expect(cutShape(b, c).run).not.toBe(c.across);
    expect(storedAsShape(b, c)).toBe(c);
  });

  it('millimetre re-stores keep the run and settle in one click (seeded sweep)', () => {
    let seed = 195; // mulberry32, deterministic
    const rnd = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const DIMS = ['length', 'width', 'thickness'] as const;
    const size = { length: 24, width: 5.5, thickness: 0.75 };
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
    const mm = (max: number) => Math.max(1, Math.round(rnd() * max * 25.4)) / 25.4;
    let restored = 0;
    let exactWhereRepresentable = 0;
    for (let i = 0; i < 600; i++) {
      const face = pick(DIMS);
      const across = pick(DIMS.filter((d) => d !== face));
      const pos = DIMS.find((d) => d !== face && d !== across)!;
      let width = mm(size[pos]);
      let stopMin = rnd() < 0.3 ? 0 : mm(size[across]) - 1 / 25.4;
      let stopMax = rnd() < 0.3 ? 0 : mm(size[across]) - 1 / 25.4;
      if (rnd() < 0.5) {
        // A near-square opening: its run extent computed to equal its width.
        width = Math.min(width, size[across] - 2 / 25.4);
        stopMin = Math.floor(rnd() * Math.round((size[across] - width) * 25.4)) / 25.4;
        stopMax = size[across] - stopMin - width;
      }
      const c: Cut = { id: 'c', face, from: pick(['min', 'max'] as const), across, offset: mm(size[pos]) - 1 / 25.4, width, depth: mm(size[face]), stopMin, stopMax };
      const b = createBoard({ cuts: [c] });
      if (width <= 0 || stopMax < 0 || cutRemovesNothing(b, c)) continue;
      const s = storedAsShape(b, c);
      if (s === c) continue;
      restored++;
      const before = cutShape(b, c);
      const b2 = { ...b, cuts: [s] };
      const after = cutShape(b2, s);
      expect(after.run).toBe(before.run);
      expect(storedAsShape(b2, s)).toBe(s);
      // The sheet reads it the same (user ruling): word, axes, stopped ends.
      expect(after.word).toBe(before.word);
      expect(after.pos).toBe(before.pos);
      expect(after.stopMin === null).toBe(before.stopMin === null);
      expect(after.stopMax === null).toBe(before.stopMax === null);
      const { runEnd, posEnd } = farEnds(b, c, s);
      // Exact wherever the schema can say it: a far stop of 0, or a target at
      // least half the dimension (Sterbenz: `dim - x` is then exact).
      if (before.along[1] === b[before.run] || before.along[1] >= b[before.run] / 2) {
        expect(runEnd).toBe(0);
        if (posEnd === 0) exactWhereRepresentable++;
      }
    }
    expect(restored).toBeGreaterThan(200);
    expect(exactWhereRepresentable).toBeGreaterThan(50);
  });
});
