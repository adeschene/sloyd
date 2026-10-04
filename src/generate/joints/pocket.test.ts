import { createBoard, createDocument, migrateDocument } from '../../document/document';
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

  it('snaps a stop within EPS of a board end to exactly 0', () => {
    const b = createBoard({ length: 6, width: 3, thickness: 1, position: [0.3, 0.1, 0.7] });
    const e = boxOf(b);
    // length spans the whole X; thickness-Y pocket from the top; max-X 1e-12 short of the end
    const cut = pocketFor(b, { min: [e.min[0] + 2, e.max[1] - 0.5, e.min[2] + 0.25], max: [e.max[0] - 1e-12, e.max[1] + 1, e.min[2] + 0.75] });
    expect(cut.stopMax).toBe(0);
    expect(cut.stopMin).toBeGreaterThan(0);
  });

  it('throws on a box that removes the whole board', () => {
    const b = createBoard({ length: 6, width: 3, thickness: 1, position: [0, 0, 0] });
    expect(() => pocketFor(b, { min: [-1, -1, -1], max: [9, 9, 9] })).toThrow(/removes the whole of/);
  });

  it('a stopped dado on a posed board: across is the dimension reaching one end, and the cut survives migration', () => {
    const b = createBoard({ length: 6, width: 3, thickness: 1, posture: 'upright', rotation: 90, position: [1, 2, 3] });
    const dims = axisDimensions(b);
    // local box: thickness [0.5,1] (face), width [0,1] (one end), length [2,3] (interior)
    const range = { thickness: [0.5, 1], width: [0, 1], length: [2, 3] } as const;
    const box: WorldBox = {
      min: [0, 1, 2].map((i) => b.position[i] + range[dims[i]][0]) as WorldBox['min'],
      max: [0, 1, 2].map((i) => b.position[i] + range[dims[i]][1]) as WorldBox['max'],
    };
    const cut = pocketFor(b, box);
    expect(cut.across).toBe('width');
    expect(Math.min(cut.stopMin, cut.stopMax)).toBe(0);
    expect(Math.max(cut.stopMin, cut.stopMax)).toBeGreaterThan(0);
    const doc = { ...createDocument(), boards: [{ ...b, cuts: [cut] }] };
    const back = migrateDocument(JSON.parse(JSON.stringify(doc))).boards[0].cuts[0];
    for (const k of ['offset', 'width', 'depth', 'stopMin', 'stopMax'] as const) expect(back[k]).toBe(cut[k]);
    expect(back.across).toBe(cut.across);
    expect(back.face).toBe(cut.face);
    expect(back.from).toBe(cut.from);
  });
});
