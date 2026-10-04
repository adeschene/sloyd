import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { boardEdges, boardSolids, cutLabel, cutRegion, cutRemovesNothing, solidWorldBox, stockProbe, wholeBoard } from './cuts';
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

  it('ties: a square pocket on an edge is a notch; a pocket as deep as wide is a blind dado', () => {
    expect(cutLabel(b, c({ across: 'length', offset: 0, width: 0.75, stopMin: 10, stopMax: 13.25 }))).toBe('notch');
    expect(cutLabel(b, c({ across: 'length', offset: 2, width: 0.5, depth: 0.5, stopMin: 10, stopMax: 12 }))).toBe('blind dado');
  });

  it('a cut that removes nothing keeps its old-table word', () => {
    expect(cutLabel(b, c({ offset: 30 }))).toBe('dado');
  });
});
