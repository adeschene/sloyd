import { createBoard } from '../../document/document';
import { stockProbe } from '../../document/cuts';
import { axisDimensions } from '../../document/geometry';
import type { Board, Posture, Rotation } from '../../document/types';
import { boxOf, pocketFor } from './pocket';
import type { WorldBox } from './pocket';

/**
 * The bound comes from OUTSIDE the code under test (invariant 23): a sample
 * point is stock exactly when it is NOT inside the world box. No expected cut
 * is written by hand. Samples sit at odd sixteenths; every box edge is on an
 * eighth, so no sample lies on a boundary.
 */
function assertCarves(board: Board, box: WorldBox) {
  const cut = pocketFor(board, box);
  const cutBoard = { ...board, cuts: [cut] };
  const probe = stockProbe(cutBoard);
  const dims = axisDimensions(board);
  let removed = 0;
  for (let l = 1 / 16; l < board.length; l += 1 / 8) {
    for (let w = 1 / 16; w < board.width; w += 1 / 8) {
      for (let t = 1 / 16; t < board.thickness; t += 1 / 8) {
        const local = { length: l, width: w, thickness: t };
        const world = [0, 1, 2].map((i) => board.position[i] + local[dims[i]]);
        const inside = world.every((v, i) => v > box.min[i] && v < box.max[i]);
        if (inside) removed++;
        expect(probe(local), `${JSON.stringify(local)} inside=${inside}`).toBe(!inside);
      }
    }
  }
  expect(removed, 'the box must actually remove something').toBeGreaterThan(0);
}

const POSES: [Posture, Rotation][] = [
  ['flat', 0], ['flat', 90], ['on-edge', 0], ['on-edge', 90], ['upright', 0], ['upright', 90],
];

describe('pocketFor', () => {
  const board = (posture: Posture, rotation: Rotation) =>
    createBoard({ length: 6, width: 3, thickness: 1, posture, rotation, position: [1, 2, 3] });

  it.each(POSES)('a pocket open on the +Y face, posture %s, turn %s', (posture, rotation) => {
    const b = board(posture, rotation);
    const e = boxOf(b);
    assertCarves(b, { min: [e.min[0] + 0.25, e.max[1] - 0.5, e.min[2] + 0.25], max: [e.min[0] + 0.75, e.max[1] + 1, e.min[2] + 0.75] });
  });

  it.each(POSES)('a corner rabbet open on two faces, posture %s, turn %s', (posture, rotation) => {
    const b = board(posture, rotation);
    const e = boxOf(b);
    assertCarves(b, { min: [e.min[0] - 1, e.min[1] - 1, e.min[2] - 1], max: [e.min[0] + 0.5, e.max[1] + 1, e.min[2] + 0.5] });
  });

  it.each(POSES)('a through slot spanning one axis fully, posture %s, turn %s', (posture, rotation) => {
    const b = board(posture, rotation);
    const e = boxOf(b);
    assertCarves(b, { min: [e.min[0] + 0.25, e.min[1] - 1, e.min[2] - 1], max: [e.min[0] + 0.5, e.max[1] + 1, e.max[2] + 1] });
  });

  it('throws on a box enclosed by the board — it cannot be cut from any face', () => {
    const b = createBoard({ length: 6, width: 3, thickness: 3, position: [0, 0, 0] });
    expect(() => pocketFor(b, { min: [1, 1, 1], max: [2, 2, 2] })).toThrow(/enclosed/);
  });

  it('throws on a box that misses the board', () => {
    const b = createBoard({ length: 6, width: 3, thickness: 1, position: [0, 0, 0] });
    expect(() => pocketFor(b, { min: [20, 20, 20], max: [21, 21, 21] })).toThrow(/misses/);
  });
});
