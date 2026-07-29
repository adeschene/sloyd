import type { Board } from './types';

/**
 * World-space size of a board along [X, Y, Z], in inches.
 * Orientation resolves `standing` first, then `rotation`.
 */
export function boardExtents(board: Board): [number, number, number] {
  const { length, width, thickness, standing, rotation } = board;
  const turned = rotation === 90 || rotation === 270;

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
