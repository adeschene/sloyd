import { describe, expect, it } from 'vitest';
import type { Board, HoleRow, Posture, Rotation } from './document';
import { axisDimensions, axisFrame, boardExtents } from './geometry';
import { HOLE_COUNT_MAX, holeInstances } from './holes';
import { holeFaults } from './holeFaults';
import { toWorld } from './snapPoints';
import { chiralPart } from './turnFixtures';
import { DIRS, localToDir } from './taperWorld';
import type { Dir } from './taperWorld';
import type { WorldHoleRow } from './generated';
import { holeRowsFor, holeSnap, sameHoles, worldHoles } from './holeWorld';

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
type Row = Omit<HoleRow, 'id'>;

/** chiralPart (cuts stripped) at a non-zero position, with a row on each of three faces: one measured from its max end
 *  (count > 1), one from its FARTHER across side, a through bore into an end. 20 x 6 x 1.5. */
const ROWS: Row[] = [
  { face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'max', station: 3, count: 4, pitch: 1.25, acrossFrom: 'min', inset: 2 },
  { face: 'width', from: 'min', diameter: 5 / 25.4, depth: 0.5, along: 'length', alongFrom: 'min', station: 32 / 25.4, count: 3, pitch: 32 / 25.4, acrossFrom: 'max', inset: 1 },
  { face: 'length', from: 'min', diameter: 0.375, depth: 'through', along: 'width', alongFrom: 'max', station: 1.5, count: 2, pitch: 2, acrossFrom: 'min', inset: 0.5 },
];
const holed = (posture: Posture, rotation: Rotation, rows: Row[] = ROWS): Board => ({
  ...chiralPart(posture), cuts: [], rotation, position: [3, 5, 7],
  holes: rows.map((r, i) => ({ id: `h${i}`, ...r })),
});
const poses = () => POSTURES.flatMap((p) => TURNS.map((t) => holed(p, t)));

const exactOf = (rows: WorldHoleRow[]) => new Set(rows.flatMap((r) => [r.offset.x, r.offset.y, r.offset.z, r.diameter, r.depth, r.pitch]));
const store = (b: Board, rows: readonly WorldHoleRow[], exact?: ReadonlySet<number>): Row[] => {
  const r = holeRowsFor(b, rows, exact);
  if ('fault' in r) throw new Error(r.fault);
  return r.rows;
};
const faultOf = (b: Board, rows: readonly WorldHoleRow[]): string => {
  const r = holeRowsFor(b, rows);
  if (!('fault' in r)) throw new Error('no fault');
  return r.fault;
};

const UNIT: Record<Dir, [number, number, number]> = {
  '+x': [1, 0, 0], '-x': [-1, 0, 0], '+y': [0, 1, 0], '-y': [0, -1, 0], '+z': [0, 0, 1], '-z': [0, 0, -1],
};
/** World centres of a design row, computed in WORLD terms only (no part frame). */
const designCentres = (b: Board, r: WorldHoleRow) => Array.from({ length: r.count }, (_, k) => {
  const u = UNIT[r.toward];
  return [r.offset.x, r.offset.y, r.offset.z].map((v, i) => b.position[i]! + v + k * r.pitch * u[i]!);
});
/** World centres of a stored row, through the independent oracle `toWorld` (snapPoints.ts). */
const storedCentres = (b: Board, r: Row) =>
  holeInstances(b, { id: 'x', ...r }).map((h) => toWorld(b, { length: h.centre[0], width: h.centre[1], thickness: h.centre[2] }));
const sameSet = (a: number[][], c: number[][]) => {
  const key = (p: number[]) => p.map((v) => Math.round(v * 1e9)).join(',');
  return a.length === c.length && JSON.stringify(a.map(key).sort()) === JSON.stringify(c.map(key).sort());
};
/** Each of `got` is sameHoles as one of `want`, one to one. */
const matchAll = (b: Board, got: Row[], want: Row[]) => {
  expect(got).toHaveLength(want.length);
  const left = [...want];
  for (const g of got) {
    const i = left.findIndex((w) => sameHoles(g, w, b));
    expect(i, `no original matches ${JSON.stringify(g)}`).toBeGreaterThanOrEqual(0);
    left.splice(i, 1);
  }
};

describe('holeSnap (AI-holes spec §3.1, the hole grid)', () => {
  it('snaps to the nearer of 1/64in and a whole mm, ties imperial', () => {
    expect(holeSnap(1.26)).toBe(32 / 25.4);
    expect(holeSnap(0.197)).toBe(5 / 25.4);
    expect(holeSnap(0.25)).toBe(0.25);
    expect(holeSnap(0.3125)).toBe(0.3125);
    expect(holeSnap(0)).toBe(0);
    // An exact float tie between 2/64 and 1 mm goes imperial.
    const tie = (2 / 64 + 1 / 25.4) / 2;
    expect(Math.abs(tie - 2 / 64)).toBe(Math.abs(tie - 1 / 25.4));
    expect(holeSnap(tie)).toBe(2 / 64);
  });
});

describe('worldHoles / holeRowsFor (AI-holes spec §3.1, §3.2)', () => {
  for (const b of poses()) {
    it(`${b.posture} ${b.rotation}: design → stored → design, every hole where the oracle puts it`, () => {
      const design = worldHoles(b);
      expect(design).toHaveLength(3);
      // Every design row's holes are, in WORLD terms, the stored row's (toWorld, an independent local → world map).
      const all = design.flatMap((r) => designCentres(b, r));
      expect(sameSet(all, b.holes.flatMap((r) => storedCentres(b, r)))).toBe(true);
      const ext = boardExtents(b);
      for (const r of design) {
        const a = 'xyz'.indexOf(r.face[1]!);
        expect([r.offset.x, r.offset.y, r.offset.z][a]).toBe(r.face[0] === '+' ? ext[a] : 0);
        // A through row's depth is the part's extent along the drill axis (ignored on the way back).
        if (r.through) expect(r.depth).toBe(ext[a]);
      }
      const back = store(b, design, exactOf(design));
      matchAll(b, back, ROWS);
      for (const r of back) expect(r.alongFrom).toBe('min');
      // The second pass is a fixed point.
      const again = { ...b, holes: back.map((r, i) => ({ id: `g${i}`, ...r })) };
      expect(worldHoles(again)).toEqual(design);
      expect(store(again, worldHoles(again), exactOf(design))).toEqual(back);
    });
  }

  it('canonical: the same holes written toward +y and toward -y store identically', () => {
    const b = holed('upright', 90, []);
    const ext = boardExtents(b);
    const face: Dir = '+x';
    const plus: WorldHoleRow = { face, diameter: 0.25, depth: 0.375, through: false, offset: { x: ext[0], y: 2, z: 1.015625 }, toward: '+y', count: 5, pitch: 1.25 };
    const minus: WorldHoleRow = { ...plus, offset: { ...plus.offset, y: 2 + 4 * 1.25 }, toward: '-y' };
    const p = store(b, [plus]);
    expect(store(b, [minus])).toEqual(p);
    expect(p[0]!.alongFrom).toBe('min');
  });

  it('a reversed whole-mm row whose first station is float noise below 0 is stored from the min end at 0', () => {
    const b = holed('flat', 0, []);
    const la = axisDimensions(b).indexOf('length');
    expect(axisFrame(b)[la]!.reversed).toBe(false);
    const key = 'xyz'[la] as 'x' | 'y' | 'z';
    const [base] = worldHoles(holed('flat', 0, [ROWS[0]!]));
    // 81 mm − 3 × 27 mm is −4.4e-16 in floats.
    const r: WorldHoleRow = { ...base!, offset: { ...base!.offset, [key]: 81 / 25.4 }, toward: localToDir(b, 'length', 'min'), count: 4, pitch: 27 / 25.4 };
    const [row] = store(b, [r]);
    expect([row!.alongFrom, row!.station]).toEqual(['min', 0]);
  });

  it('canonical order: two input orders give one stored part', () => {
    const b = poses()[5]!;
    const design = worldHoles(b);
    expect(store(b, [...design].reverse(), exactOf(design))).toEqual(store(b, design, exactOf(design)));
  });

  it('the across side is the nearer one (ties min)', () => {
    for (const b of poses()) {
      const via = (inset: number, acrossFrom: 'min' | 'max') =>
        store(b, worldHoles({ ...b, holes: [{ id: 'a', ...ROWS[0]!, acrossFrom, inset }] }))[0]!;
      // Width 6: 1 from max stays from max; 5 from max is 1 from min; the middle (3) is min.
      expect([via(1, 'max').acrossFrom, via(1, 'max').inset]).toEqual(['max', 1]);
      expect([via(5, 'max').acrossFrom, via(5, 'max').inset]).toEqual(['min', 1]);
      expect([via(3, 'max').acrossFrom, via(3, 'max').inset]).toEqual(['min', 3]);
      expect([via(2, 'min').acrossFrom, via(2, 'min').inset]).toEqual(['min', 2]);
    }
  });

  it('an offset 1/64 off the face plane is accepted and put on the plane', () => {
    const b = holed('on-edge', 270, []);
    const [r] = worldHoles(holed('on-edge', 270, [ROWS[0]!]));
    const a = 'xyz'.indexOf(r!.face[1]!) as 0 | 1 | 2;
    const key = 'xyz'[a] as 'x' | 'y' | 'z';
    const off = { ...r!, offset: { ...r!.offset, [key]: r!.offset[key] + (r!.face[0] === '+' ? 1 : -1) / 64 } };
    const back = store(b, [off]);
    matchAll(b, back, [ROWS[0]!]);
  });
});

describe('holeRowsFor shape faults (the loader rules, spec §3.1)', () => {
  const b = holed('flat', 90, []);
  const ok = (): WorldHoleRow => worldHoles(holed('flat', 90, [ROWS[0]!]))[0]!;
  const face = () => ok().face;
  it('the base row is fine', () => { expect('rows' in holeRowsFor(b, [ok()])).toBe(true); });
  it('a non-finite number', () => {
    expect(faultOf(b, [{ ...ok(), pitch: Number.NaN }])).toBe(`has a hole row on ${face()} with a number that is not finite`);
  });
  it('diameter 0', () => {
    expect(faultOf(b, [{ ...ok(), diameter: 0 }])).toBe(`has a hole row on ${face()} whose diameter (0) is not above 0`);
  });
  it('a diameter that snaps to 0', () => {
    expect(faultOf(b, [{ ...ok(), diameter: 0.001 }])).toBe(`has a hole row on ${face()} whose diameter (0.001) is not above 0`);
  });
  it('depth 0 when not through', () => {
    expect(faultOf(b, [{ ...ok(), depth: 0 }])).toBe(`has a hole row on ${face()} whose depth (0) is not above 0; for a hole right through, set through`);
  });
  it('depth 0 when through is fine', () => { expect('rows' in holeRowsFor(b, [{ ...ok(), depth: 0, through: true }])).toBe(true); });
  it('count 0', () => {
    expect(faultOf(b, [{ ...ok(), count: 0 }])).toBe(`has a hole row on ${face()} whose count (0) is not a whole number from 1 to ${HOLE_COUNT_MAX}`);
  });
  it('count 501', () => {
    expect(faultOf(b, [{ ...ok(), count: 501 }])).toBe(`has a hole row on ${face()} whose count (501) is not a whole number from 1 to ${HOLE_COUNT_MAX}`);
  });
  it('count 500 is fine', () => { expect('rows' in holeRowsFor(b, [{ ...ok(), count: 500, pitch: 0.01 }])).toBe(true); });
  it('count 2.5', () => {
    expect(faultOf(b, [{ ...ok(), count: 2.5 }])).toBe(`has a hole row on ${face()} whose count (2.5) is not a whole number from 1 to ${HOLE_COUNT_MAX}`);
  });
  it('a negative pitch', () => {
    expect(faultOf(b, [{ ...ok(), pitch: -1 }])).toBe(`has a hole row on ${face()} whose pitch (-1) is negative`);
  });
  it('toward on the face axis', () => {
    const f = face();
    const t = DIRS.find((d) => d !== f && d[1] === f[1])!;
    expect(faultOf(b, [{ ...ok(), toward: t }])).toBe(`has a hole row on ${f} running toward ${t}, along the drill axis; a row runs across its face`);
    expect(faultOf(b, [{ ...ok(), toward: f }])).toBe(`has a hole row on ${f} running toward ${f}, along the drill axis; a row runs across its face`);
  });
  it('an offset 1/16 off the face plane', () => {
    const r = ok();
    const key = r.face[1] as 'x' | 'y' | 'z';
    const off = { ...r, offset: { ...r.offset, [key]: r.offset[key] - (r.face[0] === '+' ? 1 : -1) / 16 } };
    expect(faultOf(b, [off])).toBe(`has a hole row on ${r.face} whose first centre is not on that face`);
  });
  it('holes past BOTH ends of the row (no stored form)', () => {
    const r = ok();
    const ta = 'xyz'.indexOf(r.toward[1]!);
    const key = 'xyz'[ta] as 'x' | 'y' | 'z';
    const start = r.toward[0] === '+' ? -1 : boardExtents(b)[ta]! + 1;
    expect(faultOf(b, [{ ...r, offset: { ...r.offset, [key]: start }, count: 25, pitch: 1 }]))
      .toMatch(new RegExp(`^has a hole row on \\${r.face} with holes outside the part at both ends of the row \\(toward [+-][xyz] and [+-][xyz]\\)$`));
  });
  it('a row starting past the min end only is stored from the max end (loader-legal; breaks-out is holeFaults\')', () => {
    const r = ok();
    const ta = 'xyz'.indexOf(r.toward[1]!);
    const key = 'xyz'[ta] as 'x' | 'y' | 'z';
    const start = r.toward[0] === '+' ? -1 : boardExtents(b)[ta]! + 1;
    const rows = store(b, [{ ...r, offset: { ...r.offset, [key]: start }, count: 3, pitch: 1 }]);
    expect(rows[0]!.alongFrom).toBe('max');
    expect(rows[0]!.station).toBe(20 + 1 - 2);
  });
  it('a centre past one side across the row is measured from the other', () => {
    const r = ok();
    const across = 'xyz'.split('').find((k) => k !== r.face[1] && k !== r.toward[1]) as 'x' | 'y' | 'z';
    const a = 'xyz'.indexOf(across);
    const rows = store(b, [{ ...r, offset: { ...r.offset, [across]: -0.5 } }]);
    expect(rows[0]!.inset).toBe(boardExtents(b)[a]! + 0.5);
  });
});

describe('Review Focus 4: pitch 0 with count 3', () => {
  it('is not a shape fault, and holeFaults reports meets-hole on the stored row', () => {
    const b = holed('upright', 180, []);
    const r = { ...worldHoles(holed('upright', 180, [ROWS[0]!]))[0]!, pitch: 0, count: 3 };
    const rows = store(b, [r]);
    const s = { ...b, holes: rows.map((x, i) => ({ id: `h${i}`, ...x })) };
    expect(holeFaults(s, s.holes[0]!).map((f) => f.kind)).toContain('meets-hole');
  });
});

describe('every loader-legal stored row round-trips (a small grid)', () => {
  const grid: Row[] = [];
  for (const [face, along] of [['thickness', 'length'], ['width', 'thickness'], ['length', 'width']] as const) {
    for (const from of ['min', 'max'] as const) {
      for (const alongFrom of ['min', 'max'] as const) {
        for (const acrossFrom of ['min', 'max'] as const) {
          for (const [count, pitch, depth] of [[1, 0.7, 0.3], [3, 0, 'through'], [2, 32 / 25.4, 0.25]] as const) {
            grid.push({ face, from, diameter: 0.25, depth, along, alongFrom, station: 0.5, count, pitch, acrossFrom, inset: 0.375 });
          }
        }
      }
    }
  }
  for (const posture of POSTURES) {
    for (const rotation of TURNS) {
      it(`${posture} ${rotation}: ${grid.length} rows`, () => {
        const b = holed(posture, rotation, grid);
        const design = worldHoles(b);
        matchAll(b, store(b, design, exactOf(design)), grid);
      });
    }
  }
});

describe('sameHoles', () => {
  const b = holed('flat', 0, []);
  it('is order-free over centres: a row from its max end equals its canonical form', () => {
    const r = ROWS[0]!;
    // 20 long: stations 3, 4.25, 5.5, 6.75 from max are 13.25 … 17 from min.
    expect(sameHoles(r, { ...r, alongFrom: 'min', station: 13.25 }, b)).toBe(true);
    expect(sameHoles(r, { ...r, alongFrom: 'min', station: 13.25 + 1e-6 }, b)).toBe(false);
    expect(sameHoles(r, { ...r, diameter: 0.3 }, b)).toBe(false);
    expect(sameHoles(r, { ...r, depth: 'through' }, b)).toBe(false);
    expect(sameHoles(r, { ...r, from: 'min' }, b)).toBe(false);
  });
});
