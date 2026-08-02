// No `import ... from 'vitest'` — this repo runs with `globals: true`
// (vite.config.ts), so describe/it/expect are already in scope and every
// other test file in the repo omits the import.
import { createBoard } from './document';
import { boardExtents } from './geometry';
import { boardSnapPoints } from './snapPoints';
import type { Board, Posture, Rotation } from './types';

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
