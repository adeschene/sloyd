import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { defaultCamLock, mm } from './holes';
import { holeFaults } from './holeFaults';
import { camPairRows } from './camBolt';
import type { CutFrom, HoleRow } from './types';

const flat = (width: number) => createBoard({ id: 'p', length: 24, width, thickness: 0.75 });

// Captured from the implementation BEFORE the count/camFrom parameters existed.
const cam = (w: number, end: CutFrom) => ({
  face: 'thickness', from: 'max', diameter: 0.5905511811023623, depth: 0.5708661417322834, along: 'width', alongFrom: 'min',
  station: w === 12 ? 1.4566929133858268 : 1.5, count: w === 12 ? 2 : 1, pitch: w === 12 ? 9.086614173228346 : 0,
  acrossFrom: end, inset: 0.9448818897637796,
});
const bolt = (w: number, end: CutFrom) => ({
  face: 'length', from: end, diameter: 0.31496062992125984, depth: 0.9448818897637796, along: 'width', alongFrom: 'min',
  station: w === 12 ? 1.4566929133858268 : 1.5, count: w === 12 ? 2 : 1, pitch: w === 12 ? 9.086614173228346 : 0,
  acrossFrom: 'min', inset: 0.375,
});

describe('defaultCamLock count and cam face', () => {
  it('is unchanged without a count', () => {
    for (const w of [12, 3]) for (const e of ['min', 'max'] as const) {
      const b = flat(w);
      expect(defaultCamLock(b, e)).toEqual(defaultCamLock(b, e, undefined, undefined));
      expect(defaultCamLock(b, e)).toEqual([cam(w, e), bolt(w, e)]);
    }
  });

  it('count 1 centres', () => {
    const b = flat(12);
    for (const row of defaultCamLock(b, 'min', 1)!) {
      expect(row.station).toBe(b.width / 2);
      expect(row.count).toBe(1);
      expect(row.pitch).toBe(0);
    }
  });

  it('count 5 is exact', () => {
    const b = flat(12);
    const rows = defaultCamLock(b, 'min', 5)!;
    for (const row of rows) {
      expect(row.station).toBe(mm(37));
      expect(row.count).toBe(5);
      expect(row.pitch).toBe((b.width - 2 * mm(37)) / 4);
    }
  });

  it('camFrom min flips the cam face and still pairs', () => {
    const b = flat(12);
    const rows = defaultCamLock(b, 'min', 3, 'min')!;
    expect(rows[0].from).toBe('min');
    expect(rows[1].inset).toBe(b.thickness / 2);
    const withIds: HoleRow[] = rows.map((r, i) => ({ ...r, id: `r${i}` }));
    const part = { ...b, holes: withIds };
    expect(camPairRows(part)).toHaveLength(1);
    for (const r of withIds) expect(holeFaults(part, r)).toEqual([]);
  });
});
