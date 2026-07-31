import type { Board } from './types';

/**
 * World-space size of a board along [X, Y, Z], in inches.
 * Orientation resolves `standing` first, then `rotation`.
 */
export function boardExtents(board: Board): [number, number, number] {
  const { length, width, thickness, standing, rotation } = board;
  const turned = rotation === 90;

  if (standing) {
    return turned ? [thickness, width, length] : [length, width, thickness];
  }
  return turned ? [width, thickness, length] : [length, thickness, width];
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
