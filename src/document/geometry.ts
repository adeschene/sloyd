import type { Board, Dimension, Posture } from './types';

/** The order two dimensions are considered in when they share the floor. */
export const DIMENSION_ORDER: Dimension[] = ['length', 'width', 'thickness'];

/** Which dimension each posture puts on the vertical axis. */
const UP: Record<Posture, Dimension> = {
  flat: 'thickness',
  'on-edge': 'width',
  upright: 'length',
};

/**
 * Which board dimension runs along each world axis, as [X, Y, Z].
 *
 * Posture names the dimension that points up; the other two take X and Z, and
 * rotation picks which is which — at 0 the earlier of [length, width, thickness]
 * goes on X, at 90 they swap.
 *
 * That single rule reproduces all four orientations v2 could reach and adds the
 * two it could not. The four v2 rows are asserted explicitly in the tests,
 * because agreeing with the old table is what makes this a generalisation
 * rather than a rewrite of every document ever saved.
 *
 * This is the ONE place the mapping lives. boardExtents derives from it, and so
 * does the viewport's grain code — before v3 the mapping was implicit in a
 * boolean and had to be restated in two files that could drift apart.
 */
export function axisDimensions(board: Board): [Dimension, Dimension, Dimension] {
  const up = UP[board.posture];
  const horizontal = DIMENSION_ORDER.filter((d) => d !== up);
  const [x, z] = board.rotation === 90
    ? [horizontal[1], horizontal[0]]
    : horizontal;
  return [x, up, z];
}

/** World-space size of a board along [X, Y, Z], in inches. */
export function boardExtents(board: Board): [number, number, number] {
  const [x, y, z] = axisDimensions(board);
  return [board[x], board[y], board[z]];
}

/**
 * World-space center of a board. `position` is the min-corner, so the center
 * is the corner plus half the extents. Three.js meshes are center-origin, so
 * this is what the viewport positions a box at.
 */
export function boardCenter(board: Board): [number, number, number] {
  const [x, y, z] = boardExtents(board);
  return [
    board.position[0] + x / 2,
    board.position[1] + y / 2,
    board.position[2] + z / 2,
  ];
}

/**
 * Where a board's min-corner has to move so that changing its orientation turns
 * it in place instead of shoving it sideways.
 *
 * The rule: reorienting preserves the footprint's X and Z centre and preserves
 * Y-min. `position` is the min-corner, so swapping the extents with the corner
 * pinned is what made a 24 x 5-1/2 board appear to jump nearly 9-1/4in when it
 * turned; half the difference in extents on each horizontal axis cancels
 * exactly that. Y is passed through rather than centred, because a board
 * resting on the floor should still be resting on the floor after it is stood
 * on edge.
 *
 * Pure, and it lives here rather than in the store so that every call site
 * shares one piece of orientation arithmetic.
 */
export function reorientedPosition(
  board: Board,
  changes: Partial<Board>,
): [number, number, number] {
  const before = boardExtents(board);
  const after = boardExtents({ ...board, ...changes });
  return [
    board.position[0] + (before[0] - after[0]) / 2,
    board.position[1],
    board.position[2] + (before[2] - after[2]) / 2,
  ];
}
