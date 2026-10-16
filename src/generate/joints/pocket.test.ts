import { buildCutList, createBoard, createDocument, migrateDocument, worldParts } from '../../document/document';
import { flatDocument } from '../../document/tree';
import { stockProbe } from '../../document/cuts';
import { axisDimensions, toWorldOffset } from '../../document/geometry';
import type { Board, Cut, Posture, Rotation } from '../../document/types';
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
        // toWorldOffset: a turn may reverse an axis (quarter-turns spec §2).
        const world = [0, 1, 2].map((i) => board.position[i] + toWorldOffset(board, i, local[dims[i]]));
        const inside = world.every((v, i) => v > box.min[i] && v < box.max[i]);
        if (inside) removed++;
        expect(probe(local), `${JSON.stringify(local)} inside=${inside}`).toBe(!inside);
      }
    }
  }
  expect(removed, 'the box must actually remove something').toBeGreaterThan(0);
}

const POSES: [Posture, Rotation][] = (['flat', 'on-edge', 'upright'] as const).flatMap(
  (posture) => ([0, 90, 180, 270] as const).map((r): [Posture, Rotation] => [posture, r]),
);

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
    const back = worldParts(migrateDocument(JSON.parse(JSON.stringify(doc))))[0].cuts[0];
    for (const k of ['offset', 'width', 'depth', 'stopMin', 'stopMax'] as const) expect(back[k]).toBe(cut[k]);
    expect(back.across).toBe(cut.across);
    expect(back.face).toBe(cut.face);
    expect(back.from).toBe(cut.from);
  });

  it('stores the cut by the shape it has beside the board\'s EXISTING cuts (cut-storage §3.2)', () => {
    // A square 3/4" housing whose width-min end is opened by a back rabbet:
    // only with the rabbet in view is the run the width.
    const rabbet = { id: 'r', face: 'width' as const, from: 'min' as const, across: 'length' as const, offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0 };
    const b = createBoard({ length: 72, width: 11.25, thickness: 0.75, cuts: [rabbet] });
    const dims = axisDimensions(b);
    const local = { length: [24, 24.75], width: [0.25, 1], thickness: [0.5, 0.75] } as const;
    const box: WorldBox = {
      min: [0, 1, 2].map((i) => b.position[i] + local[dims[i]][0]) as WorldBox['min'],
      max: [0, 1, 2].map((i) => b.position[i] + local[dims[i]][1]) as WorldBox['max'],
    };
    expect(pocketFor(b, box).across).toBe('width');
  });

  // Fu 216: a millimetre box reached a turned part through a reflection (`board[d] - u`), so the same physical cut stored
  // an ulp-different offset or width at 180° than at 0° — and the cut list's EXACT row key split identical parts.
  describe('a millimetre cut stores the same numbers in any turn and at any position (fu 216)', () => {
    const mm = (k: number) => k / 25.4;
    const fields = (c: Cut) => [c.face, c.from, c.across, c.offset, c.width, c.depth, c.stopMin, c.stopMax];
    // The same dado: k mm from the part's own min end, w mm wide, 6 mm deep from the top.
    const dado = (rotation: Rotation, P: number, k: number, w: number) => {
      const b = createBoard({ length: mm(610), width: mm(90), thickness: mm(19), rotation, position: [mm(P), 0, 0] });
      const e = boxOf(b);
      const [x0, x1] = rotation === 0 ? [e.min[0] + mm(k), e.min[0] + mm(k + w)] : [e.max[0] - mm(k + w), e.max[0] - mm(k)];
      return pocketFor(b, { min: [x0, e.max[1] - mm(6), e.min[2] - 1], max: [x1, e.max[1] + 1, e.max[2] + 1] });
    };

    it('turn 0 and turn 180 agree exactly, and every number is the typed millimetre value', () => {
      for (const P of [0, 7, 33]) for (let k = 1; k < 500; k += 7) for (const w of [6, 12.5, 19]) {
        const a = dado(0, P, k, w);
        expect(fields(dado(180, P, k, w)), `P ${P} k ${k} w ${w}`).toEqual(fields(a));
        expect(a.offset, `P ${P} k ${k} w ${w}`).toBe(k / 25.4);
        expect(a.width, `P ${P} k ${k} w ${w}`).toBe(w / 25.4);
        expect(a.depth).toBe(6 / 25.4);
      }
    });

    it('a stopped cut of any depth: the stops and the depth are the typed millimetre values in both turns', () => {
      // A stopped groove along the length, s mm short of each end, d mm deep from the top, on a part at P mm.
      const groove = (rotation: Rotation, P: number, s0: number, d: number) => {
        const b = createBoard({ length: mm(610), width: mm(90), thickness: mm(19), rotation, position: [mm(P), mm(P), mm(P)] });
        const e = boxOf(b);
        return pocketFor(b, {
          min: [e.min[0] + mm(s0), e.max[1] - mm(d), e.min[2] + mm(30)],
          max: [e.max[0] - mm(s0 + 3), e.max[1] + 1, e.min[2] + mm(36)],
        });
      };
      let checked = 0;
      for (const P of [0, 11, 47]) for (let s0 = 2; s0 < 200; s0 += 9) for (let d = 1; d < 19; d += 2) {
        const a = groove(0, P, s0, d);
        const b = groove(180, P, s0, d);
        const at = `P ${P} s ${s0} d ${d}`;
        expect(a.depth, at).toBe(d / 25.4);
        expect(b.depth, at).toBe(d / 25.4);
        // Turned 180°, the min-end stop is the max-end stop.
        expect([a.stopMin, a.stopMax], at).toEqual([s0 / 25.4, (s0 + 3) / 25.4]);
        expect([b.stopMin, b.stopMax], at).toEqual([(s0 + 3) / 25.4, s0 / 25.4]);
        checked++;
      }
      expect(checked).toBeGreaterThan(500);
    });

    it('two parts cut alike, one turned 180°, are one cut-list row', () => {
      const parts = ([0, 180] as const).map((rotation, i) => {
        const b = createBoard({ name: `Rail ${i}`, length: mm(610), width: mm(90), thickness: mm(19), rotation, position: [0, 0, mm(100 * i)] });
        const e = boxOf(b);
        const [x0, x1] = rotation === 0 ? [e.min[0] + mm(1), e.min[0] + mm(7)] : [e.max[0] - mm(7), e.max[0] - mm(1)];
        return { ...b, cuts: [pocketFor(b, { min: [x0, e.max[1] - mm(6), e.min[2] - 1], max: [x1, e.max[1] + 1, e.max[2] + 1] })] };
      });
      const doc = { ...createDocument('Rails'), units: { display: 'metric-mm' as const, precision: 16 }, boards: parts };
      const rows = buildCutList(flatDocument(doc)).groups.flatMap((g) => g.rows);
      expect(rows.map((r) => r.qty)).toEqual([2]);
    });

    it('a number off both grids is stored as computed', () => {
      const b = createBoard({ length: 6, width: 3, thickness: 1, position: [0, 0, 0] });
      const c = pocketFor(b, { min: [1 / 3, 2 / 3, -1], max: [1 / 3 + 1 / 7, 4, 4] });
      expect(c.offset).toBe(1 / 3);
      expect(c.width).toBe(1 / 3 + 1 / 7 - 1 / 3);
      expect(c.depth).toBe(1 - 2 / 3);
    });
  });
});
