// No `import ... from 'vitest'` — this repo runs with `globals: true`
// (vite.config.ts), so describe/it/expect are already in scope and every
// other test file in the repo omits the import.
import { createBoard } from './document';
import { boardExtents } from './geometry';
import { boardSolids } from './cuts';
import { boardSnapPoints, cutSnapPoints, snapPointsFor } from './snapPoints';
import type { Board, Cut, Posture, Rotation } from './types';

/** A 24 x 6 x 1 board at a non-zero, non-symmetric corner. */
const board = (patch: Partial<Board> = {}): Board =>
  createBoard({
    length: 24,
    width: 6,
    thickness: 1,
    position: [10, 2, -5],
    ...patch,
  });

const countOf = (kind: string, b: Board) =>
  boardSnapPoints(b).filter((p) => p.kind === kind).length;

describe('boardSnapPoints', () => {
  it('yields 26 points: 8 corners, 12 edge midpoints, 6 face centres', () => {
    const b = board();
    expect(boardSnapPoints(b)).toHaveLength(26);
    expect(countOf('corner', b)).toBe(8);
    expect(countOf('edge-mid', b)).toBe(12);
    expect(countOf('face-center', b)).toBe(6);
  });

  it('offers no point at the board\'s volume centre', () => {
    const b = board();
    const [ex, ey, ez] = boardExtents(b);
    const centre = [
      b.position[0] + ex / 2,
      b.position[1] + ey / 2,
      b.position[2] + ez / 2,
    ];
    // The 27th lattice point is deliberately excluded: it floats inside the
    // solid where nothing draws it (design §2.1).
    expect(
      boardSnapPoints(b).some((p) => p.at.every((v, i) => v === centre[i])),
    ).toBe(false);
  });

  it('yields 26 distinct positions', () => {
    const keys = new Set(boardSnapPoints(board()).map((p) => p.at.join(',')));
    expect(keys.size).toBe(26);
  });

  it('includes the min-corner and the max-corner', () => {
    const b = board();
    const [ex, ey, ez] = boardExtents(b);
    const keys = boardSnapPoints(b)
      .filter((p) => p.kind === 'corner')
      .map((p) => p.at.join(','));
    expect(keys).toContain([b.position[0], b.position[1], b.position[2]].join(','));
    expect(keys).toContain(
      [b.position[0] + ex, b.position[1] + ey, b.position[2] + ez].join(','),
    );
  });

  it('carries the owning board\'s id on every point', () => {
    const b = board();
    for (const p of boardSnapPoints(b)) {
      expect(p.owner).toEqual({ type: 'board', id: b.id });
    }
  });

  it('places the centre of the top face at the top face\'s centre', () => {
    const b = board();
    const [ex, ey, ez] = boardExtents(b);
    const top = [b.position[0] + ex / 2, b.position[1] + ey, b.position[2] + ez / 2];
    const hit = boardSnapPoints(b).find((p) => p.at.every((v, i) => v === top[i]));
    expect(hit?.kind).toBe('face-center');
  });

  it('places an edge midpoint at the middle of the bottom-front edge', () => {
    const b = board();
    const [ex, , ez] = boardExtents(b);
    const mid = [b.position[0] + ex / 2, b.position[1], b.position[2] + ez];
    const hit = boardSnapPoints(b).find((p) => p.at.every((v, i) => v === mid[i]));
    expect(hit?.kind).toBe('edge-mid');
  });

  // Every posture/rotation combination. The mapping from board dimensions to
  // world axes lives in axisDimensions (via boardExtents) and must not be
  // re-derived here — this asserts the points track it, not that it is right.
  const postures: Posture[] = ['flat', 'on-edge', 'upright'];
  const rotations: Rotation[] = [0, 90];
  for (const posture of postures) {
    for (const rotation of rotations) {
      it(`spans exactly boardExtents for posture=${posture} rotation=${rotation}`, () => {
        const b = board({ posture, rotation });
        const points = boardSnapPoints(b);
        const [ex, ey, ez] = boardExtents(b);
        for (const axis of [0, 1, 2] as const) {
          const values = points.map((p) => p.at[axis]);
          expect(Math.min(...values)).toBeCloseTo(b.position[axis], 10);
          expect(Math.max(...values)).toBeCloseTo(
            b.position[axis] + [ex, ey, ez][axis],
            10,
          );
        }
      });
    }
  }
});

/**
 * A POSED board: 24 x 6 x 1 at [10, 2, -5], standing on edge and turned 90.
 *
 * The posing is the test. axisDimensions for posture 'on-edge' puts `width`
 * up, leaving [length, thickness] horizontal, and rotation 90 swaps them — so
 * X = thickness, Y = width, Z = length. A flat, unrotated board at the origin
 * passes with a COMPLETELY WRONG local->world mapping, because every axis is
 * the identity there.
 */
const posed = (cuts: Cut[]): Board =>
  createBoard({
    length: 24,
    width: 6,
    thickness: 1,
    position: [10, 2, -5],
    posture: 'on-edge',
    rotation: 90,
    cuts,
  });

/** A 3/4in-wide, 1/4in-deep dado at 6in along, across the width, from `max`. */
const DADO: Cut = {
  id: 'c1', face: 'thickness', from: 'max', across: 'width',
  offset: 6, width: 0.75, depth: 0.25,
};

const key = (at: readonly number[]) => at.join(',');

describe('cutSnapPoints', () => {
  it('offers nothing for a board with no cuts', () => {
    expect(cutSnapPoints(posed([]))).toEqual([]);
  });

  it('offers 15 points for one dado: 8 corners, 6 edge midpoints, 1 face centre', () => {
    const points = cutSnapPoints(posed([DADO]));
    expect(points).toHaveLength(15);
    expect(points.filter((p) => p.kind === 'corner')).toHaveLength(8);
    expect(points.filter((p) => p.kind === 'edge-mid')).toHaveLength(6);
    expect(points.filter((p) => p.kind === 'face-center')).toHaveLength(1);
  });

  /**
   * Every world coordinate, by hand. Worked from the fixture:
   *
   *   dims       = [thickness, width, length]  (X, Y, Z)
   *   position   = [10, 2, -5]
   *   X = 10 + thickness, Y = 2 + width, Z = -5 + length
   *
   *   cutRegion  = { length: [6, 6.75], width: [0, 6], thickness: [0.75, 1] }
   *   mouth      = thickness 1    -> X = 11      (from: 'max')
   *   floor      = thickness 0.75 -> X = 10.75
   *   pos (length) {6, 6.375, 6.75}  -> Z {1, 1.375, 1.75}
   *   across (width) {0, 3, 6}       -> Y {2, 5, 8}
   *
   * Every value is a dyadic rational and therefore exact in IEEE 754. Compare
   * with === . If this fails on the last bits, the MAPPING is wrong.
   */
  it('places all 15 points at exactly the right world coordinates', () => {
    const points = cutSnapPoints(posed([DADO]));
    const got = new Map(points.map((p) => [key(p.at), p.kind]));

    const expected: [number[], string][] = [
      // Floor rectangle, X = 10.75.
      [[10.75, 2, 1], 'corner'],
      [[10.75, 2, 1.375], 'edge-mid'],
      [[10.75, 2, 1.75], 'corner'],
      [[10.75, 5, 1], 'edge-mid'],
      [[10.75, 5, 1.375], 'face-center'],
      [[10.75, 5, 1.75], 'edge-mid'],
      [[10.75, 8, 1], 'corner'],
      [[10.75, 8, 1.375], 'edge-mid'],
      [[10.75, 8, 1.75], 'corner'],
      // Mouth: the two shoulder lines only, X = 11.
      [[11, 2, 1], 'corner'],
      [[11, 5, 1], 'edge-mid'],
      [[11, 8, 1], 'corner'],
      [[11, 2, 1.75], 'corner'],
      [[11, 5, 1.75], 'edge-mid'],
      [[11, 8, 1.75], 'corner'],
    ];

    for (const [at, kind] of expected) {
      expect(got.get(key(at)), `missing ${key(at)}`).toBe(kind);
    }
    expect(got.size).toBe(15);
  });

  /**
   * Same board and same offset/width as DADO, but `from: 'min'` — closes the
   * gap where every coordinate-bearing test above used 'max'. A mutation that
   * swaps the min branch's mouth/floor assignment (`mouth = faceHi, floor =
   * faceLo` for 'min') must fail this test.
   *
   * cutRegion for from:'min' enters at the board's own thickness-0 surface, so
   * the entered surface (mouth) is the LOW end and the floor is the far
   * (deeper) end — the opposite pairing from DADO's from:'max':
   *
   *   region.thickness = [0, 0.25]   (from: 'min', depth 0.25)
   *   mouth = thickness 0    -> X = 10 + 0    = 10
   *   floor = thickness 0.25 -> X = 10 + 0.25 = 10.25
   *   pos (length) {6, 6.375, 6.75}  -> Z {1, 1.375, 1.75}   (unchanged)
   *   across (width) {0, 3, 6}       -> Y {2, 5, 8}          (unchanged)
   */
  it('places all 15 points correctly for from: "min" (mouth and floor swapped)', () => {
    const DADO_MIN: Cut = {
      id: 'c1min', face: 'thickness', from: 'min', across: 'width',
      offset: 6, width: 0.75, depth: 0.25,
    };
    const points = cutSnapPoints(posed([DADO_MIN]));
    const got = new Map(points.map((p) => [key(p.at), p.kind]));

    const expected: [number[], string][] = [
      // Floor rectangle, X = 10.25.
      [[10.25, 2, 1], 'corner'],
      [[10.25, 2, 1.375], 'edge-mid'],
      [[10.25, 2, 1.75], 'corner'],
      [[10.25, 5, 1], 'edge-mid'],
      [[10.25, 5, 1.375], 'face-center'],
      [[10.25, 5, 1.75], 'edge-mid'],
      [[10.25, 8, 1], 'corner'],
      [[10.25, 8, 1.375], 'edge-mid'],
      [[10.25, 8, 1.75], 'corner'],
      // Mouth: the two shoulder lines only, X = 10.
      [[10, 2, 1], 'corner'],
      [[10, 5, 1], 'edge-mid'],
      [[10, 8, 1], 'corner'],
      [[10, 2, 1.75], 'corner'],
      [[10, 5, 1.75], 'edge-mid'],
      [[10, 8, 1.75], 'corner'],
    ];

    for (const [at, kind] of expected) {
      expect(got.get(key(at)), `missing ${key(at)}`).toBe(kind);
    }
    expect(got.size).toBe(15);
  });

  /**
   * A SECOND pose — flat, unrotated, off-origin — proving toWorld is really
   * derived from axisDimensions rather than hard-coded to the `posed` fixture
   * above. For posture 'flat', rotation 0: dims = [length, thickness, width],
   * i.e. X = local.length, Y = local.thickness, Z = local.width — every axis
   * different from the posed fixture's [thickness, width, length].
   *
   * Board: 24 x 6 x 1 at [3, -1, 7], flat, rotation 0. Same DADO cut (face
   * thickness, from max, across width, offset 6, width 0.75, depth 0.25):
   *
   *   cutRegion  = { length: [6, 6.75], width: [0, 6], thickness: [0.75, 1] }
   *   mouth (thickness 1)    -> Y = -1 + 1    = 0
   *   floor (thickness 0.75) -> Y = -1 + 0.75 = -0.25
   *   pos (length) {6, 6.375, 6.75}  -> X = 3 + {6, 6.375, 6.75} = {9, 9.375, 9.75}
   *   across (width) {0, 3, 6}       -> Z = 7 + {0, 3, 6} = {7, 10, 13}
   *
   * A hard-coded toWorld (always +p.thickness on X, +p.width on Y, +p.length
   * on Z, as the posed fixture would demand) produces a completely different,
   * wrong set of numbers for this board — this is what makes the mutation
   * observable.
   */
  it('places points correctly for a second, different pose (flat/0)', () => {
    const flatBoard: Board = createBoard({
      length: 24,
      width: 6,
      thickness: 1,
      position: [3, -1, 7],
      posture: 'flat',
      rotation: 0,
      cuts: [DADO],
    });
    const points = cutSnapPoints(flatBoard);
    expect(points).toHaveLength(15);
    const got = new Map(points.map((p) => [key(p.at), p.kind]));

    const expected: [number[], string][] = [
      // Floor rectangle, Y = -0.25.
      [[9, -0.25, 7], 'corner'],
      [[9, -0.25, 10], 'edge-mid'],
      [[9, -0.25, 13], 'corner'],
      [[9.375, -0.25, 7], 'edge-mid'],
      [[9.375, -0.25, 10], 'face-center'],
      [[9.375, -0.25, 13], 'edge-mid'],
      [[9.75, -0.25, 7], 'corner'],
      [[9.75, -0.25, 10], 'edge-mid'],
      [[9.75, -0.25, 13], 'corner'],
      // Mouth: the two shoulder lines only, Y = 0.
      [[9, 0, 7], 'corner'],
      [[9, 0, 10], 'edge-mid'],
      [[9, 0, 13], 'corner'],
      [[9.75, 0, 7], 'corner'],
      [[9.75, 0, 10], 'edge-mid'],
      [[9.75, 0, 13], 'corner'],
    ];

    for (const [at, kind] of expected) {
      expect(got.get(key(at)), `missing ${key(at)}`).toBe(kind);
    }
    expect(got.size).toBe(15);
  });

  it('offers nothing at the mouth\'s middle row, which spans the opening', () => {
    const points = cutSnapPoints(posed([DADO]));
    // X = 11 (mouth plane), Z = 1.375 (pos mid). All three would hang in the
    // hole rather than sitting on wood — design §3.
    expect(points.some((p) => p.at[0] === 11 && p.at[2] === 1.375)).toBe(false);
  });

  it('carries the owning board\'s id on every point', () => {
    const b = posed([DADO]);
    for (const p of cutSnapPoints(b)) {
      expect(p.owner).toEqual({ type: 'board', id: b.id });
    }
  });

  it('offers 12 for a rabbet: a flush end has no shoulder', () => {
    // offset 0 makes it flush with the length-min end, so the three mouth
    // points of that row sit over the cut's own cell and stockProbe withholds
    // them. NO cutLabel branch is needed to know a rabbet has one shoulder —
    // "is there a shoulder here" and "does this point touch stock" are the
    // same question, and the filter already answers it (design §5).
    const rabbet: Cut = { ...DADO, offset: 0, width: 2 };
    const points = cutSnapPoints(posed([rabbet]));
    expect(points).toHaveLength(12);
    // Mouth plane is thickness 1 -> X = 11. The flush end is length 0 -> Z = -5.
    // Exactly that row is gone; the other shoulder (length 2 -> Z = -3) is not.
    expect(points.some((p) => p.at[0] === 11 && p.at[2] === -5)).toBe(false);
    expect(points.filter((p) => p.at[0] === 11 && p.at[2] === -3)).toHaveLength(3);
    // The 9 floor points all survive: the stock beneath the floor is intact.
    expect(points.filter((p) => p.at[0] === 10.75)).toHaveLength(9);
  });

  it('does not de-duplicate a cut point that lands on a board lattice point', () => {
    // depth = thickness/2 puts the rabbet's flush floor corner at thickness
    // 0.5 -> X = 10.5, which is also the board's own X midpoint. The board
    // lattice calls that position an edge-mid (thickness at mid); the cut
    // provider calls it a corner (no in-plane mids). Same position, same
    // owner, so the DELTA is identical either way and the move is unaffected
    // — which is the whole of the argument for not de-duplicating (design §9).
    const rabbet: Cut = { ...DADO, offset: 0, width: 2, depth: 0.5 };
    const b = posed([rabbet]);
    const shared = [10.5, 2, -5];
    const hits = snapPointsFor(b).filter((p) => key(p.at) === key(shared));
    expect(hits).toHaveLength(2);
    expect(new Set(hits.map((p) => p.kind))).toEqual(new Set(['corner', 'edge-mid']));
  });

  it('withholds the points a deeper overlapping cut has removed', () => {
    // B spans A entirely in both position (5..8 contains 6..6.75) and depth
    // (0.5..1 contains 0.75..1), so every one of A's 15 points sits in
    // removed stock. Only B's 15 survive.
    const deeper: Cut = {
      id: 'c2', face: 'thickness', from: 'max', across: 'width',
      offset: 5, width: 3, depth: 0.5,
    };
    const points = cutSnapPoints(posed([DADO, deeper]));
    expect(points).toHaveLength(15);
    // A's floor plane is thickness 0.75 -> X = 10.75. B's is 0.5 -> X = 10.5.
    expect(points.some((p) => p.at[0] === 10.75)).toBe(false);
    expect(points.some((p) => p.at[0] === 10.5)).toBe(true);
  });

  it('offers nothing on a board its own cuts consumed', () => {
    const board = posed([
      { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 0, width: 12, depth: 1 },
      { id: 'b', face: 'thickness', from: 'min', across: 'width', offset: 12, width: 12, depth: 1 },
    ]);
    expect(boardSolids(board)).toHaveLength(0);
    expect(cutSnapPoints(board)).toEqual([]);
  });

  it('offers nothing for a degenerate cut naming one dimension twice', () => {
    const degenerate: Cut = { ...DADO, face: 'width', across: 'width' };
    expect(cutSnapPoints(posed([degenerate]))).toEqual([]);
  });
});

describe('snapPointsFor', () => {
  it('is exactly boardSnapPoints for a board with no cuts', () => {
    const b = posed([]);
    expect(snapPointsFor(b)).toEqual(boardSnapPoints(b));
    expect(snapPointsFor(b)).toHaveLength(26);
  });

  it('is the box lattice plus the cut points for a dadoed board', () => {
    const b = posed([DADO]);
    expect(snapPointsFor(b)).toHaveLength(26 + 15);
  });

  it('keeps the 26 box points on a board its own cuts consumed', () => {
    // The ghost box IS drawn at the AABB (invariant 21), so the box points
    // still sit on a drawn feature; nothing draws the cut's shoulders.
    const board = posed([
      { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 0, width: 12, depth: 1 },
      { id: 'b', face: 'thickness', from: 'min', across: 'width', offset: 12, width: 12, depth: 1 },
    ]);
    expect(snapPointsFor(board)).toHaveLength(26);
  });
});
