import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import {
  HOLE_KEYS, HOLE_SEGMENTS, PRISM_EPS, acrossOf, boardHoles, clipPolygon, copyHoleRow, holeInstances, holePrism, holeRing,
  holeRegion, holeRims, insideHole, minusPrism, mirrorHoleRow, ringInside, sameHoleRow, holeRowValues, defaultHole, defaultShelfPinRow, defaultHingeCup, mm,
} from './holes';
import { parseLength, IMPERIAL } from '../units/length';
import { readFileSync } from 'node:fs';
import { bitVector } from './holeTilt';
import { SQUARE_CASES } from './holesSquareCases';
import { holeBottom, holeTouches, holeTouchesBox } from './holes';
import type { Hole } from './holes';
import type { V3 } from './angleCuts';
import type { HoleRow } from './types';

export const PIN: HoleRow = {
  id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min',
  station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5,
};

describe('hole rows (holes spec §2)', () => {
  it('sameHoleRow ignores the id and sees every other field', () => {
    const renamed: HoleRow = { ...PIN, id: 'other' };
    expect(sameHoleRow(PIN, renamed)).toBe(true);
    const changed: Record<string, unknown> = {
      face: 'width', from: 'min', diameter: 0.3, depth: 'through', along: 'width', alongFrom: 'max',
      station: 2.5, count: 20, pitch: 1.25, acrossFrom: 'max', inset: 1, tiltAlong: 0.25, tiltAcross: 0.25,
    };
    for (const k of HOLE_KEYS) expect(sameHoleRow(PIN, { ...PIN, [k]: changed[k] } as HoleRow), k).toBe(false);
  });
  it('a single bore (count 1) is the same row whatever pitch it stores — the pitch it ignores (fu 338)', () => {
    const one: HoleRow = { ...PIN, count: 1, pitch: 0 };
    expect(sameHoleRow(one, { ...one, pitch: 32 / 25.4 })).toBe(true);
    expect(holeRowValues({ ...one, pitch: 5 })).toEqual(holeRowValues(one));
    // From two holes up the pitch places them: compared exactly.
    expect(sameHoleRow({ ...one, count: 2 }, { ...one, count: 2, pitch: 32 / 25.4 })).toBe(false);
  });
  it('copyHoleRow is equal and not the same object', () => {
    const c = copyHoleRow(PIN);
    expect(c).toEqual(PIN);
    expect(c).not.toBe(PIN);
  });
  it('acrossOf names the third dimension', () => {
    expect(acrossOf(PIN)).toBe('width');
    expect(acrossOf({ face: 'length', along: 'thickness' })).toBe('width');
    expect(acrossOf({ face: 'width', along: 'length' })).toBe('thickness');
  });
});

const side = createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75, holes: [PIN] });
const area = (p: V3[], n: V3) => {
  let a: V3 = [0, 0, 0];
  for (let i = 1; i + 1 < p.length; i += 1) {
    const u = p[i]!.map((v, k) => v - p[0]![k]!); const w = p[i + 1]!.map((v, k) => v - p[0]![k]!);
    a = [a[0] + u[1]! * w[2]! - u[2]! * w[1]!, a[1] + u[2]! * w[0]! - u[0]! * w[2]!, a[2] + u[0]! * w[1]! - u[1]! * w[0]!];
  }
  return Math.abs(a[0] * n[0] + a[1] * n[1] + a[2] * n[2]) / 2;
};

describe('hole instances (spec §2.2)', () => {
  it('places a row from its named ends, exactly', () => {
    const hs = holeInstances(side, PIN);
    expect(hs).toHaveLength(21);
    // Angled holes (Task 2): a Hole also carries its bit and reach; a square row's are the face axis and its depth.
    expect(hs[0]).toEqual({ row: 'h1', index: 0, axis: 'thickness', dir: -1, centre: [2, 1.5, 0.75], radius: 0.125, depth: 0.375, through: false, bit: [0, 0, -1], reach: 0.375 });
    expect(hs[20]!.centre[0]).toBe(2 + 20 * (32 / 25.4));
  });
  it('measures from the max end and side, and enters from min', () => {
    const r = { ...PIN, from: 'min' as const, alongFrom: 'max' as const, acrossFrom: 'max' as const, count: 1 };
    expect(holeInstances(side, r)[0]).toMatchObject({ dir: 1, centre: [28, 9.75, 0] });
  });
  it('a through row runs the whole face dimension and follows it', () => {
    const r = { ...PIN, depth: 'through' as const, count: 1 };
    expect(holeInstances(side, r)[0]).toMatchObject({ depth: 0.75, through: true });
    expect(holeInstances({ ...side, thickness: 1 }, r)[0]).toMatchObject({ depth: 1, centre: [2, 1.5, 1] });
  });
  it('count 1 ignores the pitch', () => {
    expect(holeInstances(side, { ...PIN, count: 1, pitch: 99 })).toHaveLength(1);
  });
  it('boardHoles is every row in stored order', () => {
    const b = { ...side, holes: [PIN, { ...PIN, id: 'h2', inset: 9.75 }] };
    expect(boardHoles(b).map((h) => `${h.row}:${h.index}`).slice(20, 22)).toEqual(['h1:20', 'h2:0']);
  });
});

describe('holeRegion (joinery-holes spec §3.3)', () => {
  const bore: HoleRow = { ...PIN, diameter: 0.375, depth: 0.5, count: 1 };
  it('a 3/8 bore 1/2 deep from the thickness max face: mouth to bottom, centre ± radius across', () => {
    expect(holeRegion(holeInstances(side, bore)[0]!)).toEqual({ length: [1.8125, 2.1875], width: [1.3125, 1.6875], thickness: [0.25, 0.75] });
  });
  it('from the min face it runs up from 0', () => {
    expect(holeRegion(holeInstances(side, { ...bore, from: 'min' })[0]!).thickness).toEqual([0, 0.5]);
  });
  it('a through hole spans the whole dimension', () => {
    expect(holeRegion(holeInstances(side, { ...bore, depth: 'through' })[0]!).thickness).toEqual([0, 0.75]);
    const along: HoleRow = { ...bore, face: 'length', from: 'min', depth: 'through', along: 'width', station: 2, acrossFrom: 'min', inset: 0.375 };
    expect(holeRegion(holeInstances(side, along)[0]!)).toEqual({ length: [0, 30], width: [1.8125, 2.1875], thickness: [0.1875, 0.5625] });
  });
});

describe('rings, prisms and clipping (spec §3.2)', () => {
  const h = holeInstances(side, { ...PIN, count: 1 })[0]!;
  it('the ring is HOLE_SEGMENTS points on the true circle at depth t', () => {
    const r = holeRing(h, 0.375);
    expect(r).toHaveLength(HOLE_SEGMENTS);
    for (const p of r) {
      expect(Math.hypot(p[0] - 2, p[1] - 1.5)).toBeCloseTo(0.125, 12);
      expect(p[2]).toBe(0.375);
    }
  });
  it('the prism holds the ring, and the caps are pushed out by PRISM_EPS', () => {
    const prism = holePrism(h);
    expect(prism).toHaveLength(HOLE_SEGMENTS + 2);
    for (const p of holeRing(h, 0.2)) for (const q of prism) expect(q.n[0] * p[0] + q.n[1] * p[1] + q.n[2] * p[2] + q.d).toBeGreaterThanOrEqual(-1e-12);
    const top = prism[HOLE_SEGMENTS]!;
    expect(top.n[2] * 0.75 + top.d).toBeCloseTo(PRISM_EPS, 15);
  });
  it('clipPolygon keeps the n·x + d ≥ 0 side', () => {
    const sq: V3[] = [[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]];
    expect(area(clipPolygon(sq, { n: [-1, 0, 0], d: 1 }), [0, 0, 1])).toBeCloseTo(2, 12);
    expect(clipPolygon(sq, { n: [-1, 0, 0], d: -5 })).toEqual([]);
  });
  it('a face minus a hole is its area less the 48-gon, in disjoint pieces', () => {
    const face: V3[] = [[0, 0, 0.75], [30, 0, 0.75], [30, 11.25, 0.75], [0, 11.25, 0.75]];
    const pieces = minusPrism(face, holePrism(h));
    const ngon = (HOLE_SEGMENTS / 2) * 0.125 ** 2 * Math.sin((2 * Math.PI) / HOLE_SEGMENTS);
    expect(pieces.reduce((s, p) => s + area(p, [0, 0, 1]), 0)).toBeCloseTo(30 * 11.25 - ngon, 9);
  });
  it('a face the prism misses comes back whole, the same array', () => {
    const far: V3[] = [[20, 0, 0.75], [30, 0, 0.75], [30, 5, 0.75], [20, 5, 0.75]];
    const pieces = minusPrism(far, holePrism(h));
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toBe(far);
  });
  it('the face under a blind hole\'s bottom comes back whole, though it spans every side plane', () => {
    // Added in review (mutation): the in-plane miss above is decided by the first side plane, so it cannot tell the
    // early return from the loop; this face straddles every side plane and is missed only by the bottom cap.
    const back: V3[] = [[0, 0, 0], [30, 0, 0], [30, 11.25, 0], [0, 11.25, 0]];
    const pieces = minusPrism(back, holePrism(h));
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toBe(back);
  });
  it('ringInside: strictly inside only', () => {
    const face: V3[] = [[0, 0, 0.75], [30, 0, 0.75], [30, 11.25, 0.75], [0, 11.25, 0.75]];
    expect(ringInside(face, [0, 0, 1], holeRing(h, 0))).toBe(true);
    const tangent = holeInstances(side, { ...PIN, count: 1, inset: 0.125 })[0]!;
    expect(ringInside(face, [0, 0, 1], holeRing(tangent, 0))).toBe(false);
  });
  it('rims: the entry ring and the bottom ring, closed', () => {
    expect(holeRims(h)).toHaveLength(2 * HOLE_SEGMENTS);
  });
  it('the mouth is air: inside within the radius between the caps, the rim is stock', () => {
    expect(insideHole(h, [2, 1.5, 0.75])).toBe(true);         // the face-centre lattice point over a centred hole
    expect(insideHole(h, [2, 1.5, 0.375])).toBe(true);        // the bottom centre (closed)
    expect(insideHole(h, [2, 1.5, 0.3])).toBe(false);         // below the bottom
    expect(insideHole(h, [2.125, 1.5, 0.75])).toBe(false);    // on the rim
  });
});

describe('mirrorHoleRow (inv 44: a flag flip, no arithmetic)', () => {
  it('flips exactly the flag on the mirrored dimension', () => {
    expect(mirrorHoleRow(PIN, 'thickness')).toEqual({ ...PIN, from: 'min' });
    expect(mirrorHoleRow(PIN, 'length')).toEqual({ ...PIN, alongFrom: 'max' });
    expect(mirrorHoleRow(PIN, 'width')).toEqual({ ...PIN, acrossFrom: 'max' });
    expect(mirrorHoleRow(mirrorHoleRow(PIN, 'width'), 'width')).toEqual(PIN);
  });
});

describe('mm: millimetres DIVIDE, as parseLength stores them (final review 4)', () => {
  // A preset or seed in mm must store exactly what typing the same mm stores: n / 25.4. Multiplying by 1/25.4 differs
  // in the last bit for 5 and 22.5 (5 * (1/25.4) !== 5 / 25.4), so a typed 5mm and a preset 5mm would read as two rows.
  it.each([5, 22.5, 32, 35])('mm(%s) is parseLength of the same mm', (n) => {
    expect(mm(n)).toBe(parseLength(`${n}mm`, IMPERIAL));
  });
  it('the shelf-pin preset\'s pitch is a typed 32mm', () => {
    expect(defaultShelfPinRow(createBoard({ length: 30, width: 11.25, thickness: 0.75 }))!.pitch).toBe(parseLength('32mm', IMPERIAL));
  });
});

describe('presets (spec §7)', () => {
  const sideB = createBoard({ length: 30, width: 11.25, thickness: 0.75 });
  it('shelf-pin row: broad face, along the length, every 32 mm from 2", as many as leave 2" at the far end', () => {
    expect(defaultShelfPinRow(sideB)).toEqual({ face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5 });
  });
  it('shelf-pin row: null on a part too short for one hole', () => {
    expect(defaultShelfPinRow(createBoard({ length: 3, width: 3, thickness: 0.75 }))).toBeNull();
  });
  it('hole: centred on the broad face, through stock 1/2" or thinner', () => {
    expect(defaultHole(sideB)).toMatchObject({ face: 'thickness', diameter: 0.25, depth: 0.5, station: 15, inset: 5.625, count: 1 });
    expect(defaultHole(createBoard({ length: 12, width: 6, thickness: 0.5 })).depth).toBe('through');
  });
});

describe('the Hinge cup preset (spec §7)', () => {
  it('35 mm × 1/2" deep in the broad face, 3" from the length min end, 22.5 mm in from the width min side', () => {
    const door = createBoard({ length: 20, width: 15, thickness: 0.75 });
    expect(defaultHingeCup(door)).toEqual({
      face: 'thickness', from: 'max', diameter: mm(35), depth: 0.5, along: 'length', alongFrom: 'min',
      station: 3, count: 1, pitch: 0, acrossFrom: 'min', inset: mm(22.5),
    });
  });
  it('on a part wider than long it runs along the width (the longer non-face dimension), the shelf-pin convention', () => {
    const wide = createBoard({ length: 15, width: 20, thickness: 0.75 });
    expect(defaultHingeCup(wide)).toEqual({
      face: 'thickness', from: 'max', diameter: mm(35), depth: 0.5, along: 'width', alongFrom: 'min',
      station: 3, count: 1, pitch: 0, acrossFrom: 'min', inset: mm(22.5),
    });
    expect(defaultHingeCup(wide).along).toBe(defaultShelfPinRow(wide)!.along);
  });
});

describe('the stored tilt in a row\'s values (angled holes, schema 23)', () => {
  const { id: _id, ...sq } = PIN;
  it('holeRowValues of a square row is unchanged', () => {
    const b = createBoard({ length: 30, width: 11.25, thickness: 0.75 });
    const h = defaultHole(b)!;
    const v = holeRowValues(h);
    expect(v).toEqual([h.face, h.from, h.diameter, h.depth, h.along, h.alongFrom, h.station, h.count, 0, h.acrossFrom, h.inset]);
    expect(v).toHaveLength(11);
  });
  it('sameHoleRow tells tilts apart', () => {
    expect(sameHoleRow({ ...sq, tiltAcross: 0.1 }, { ...sq, tiltAcross: 0.2 })).toBe(false);
    expect(sameHoleRow({ ...sq, tiltAcross: 0.1 }, { ...sq, tiltAcross: 0.1 })).toBe(true);
  });
  it('a square row differs from a tilted one', () => {
    expect(sameHoleRow(sq, { ...sq, tiltAlong: 0.25 })).toBe(false);
    expect(sameHoleRow({ ...sq, tiltAlong: 0.25 }, sq)).toBe(false);
  });
  it('tiltAlong-only differs from tiltAcross-only at the same value', () => {
    expect(sameHoleRow({ ...sq, tiltAlong: 0.25 }, { ...sq, tiltAcross: 0.25 })).toBe(false);
  });
});

describe('square rows are as they were (angled holes, Task 2: snapshots of the code before the tilt)', () => {
  // Captured from holes.ts at 60ba752 (before the tilt), every number as it was (-0 kept as the string "-0").
  const snap = JSON.parse(readFileSync('src/document/holesSquare.snapshot.json', 'utf8'), (_k, v) => (v === '-0' ? -0 : v)) as {
    name: string; instances: Hole[]; ringMouth: V3[]; ringMid: V3[]; ringFar: V3[]; prism: unknown; rims: unknown; region: unknown;
  }[];
  it.each(SQUARE_CASES.map((c, i) => [c.name, c, snap[i]!] as const))('%s', (_n, c, s) => {
    const b = createBoard(c.board);
    const hs = holeInstances(b, c.row);
    expect(hs.map(({ bit: _b, reach: _r, ...old }) => old)).toEqual(s.instances);
    for (const h of hs) {
      expect(h.reach).toBe(h.depth);
      const bit: V3 = [0, 0, 0];
      bit[['length', 'width', 'thickness'].indexOf(h.axis)] = h.dir;
      expect(h.bit).toEqual(bit);
    }
    const h = hs[0]!;
    expect(holeRing(h, 0)).toEqual(s.ringMouth);
    expect(holeRing(h, h.depth / 2)).toEqual(s.ringMid);
    expect(holeRing(h, h.depth)).toEqual(s.ringFar);
    expect(holePrism(h)).toEqual(s.prism);
    expect(holeRims(h)).toEqual(s.rims);
    expect(holeRegion(h)).toEqual(s.region);
    if (!h.through) expect(holeBottom(h)).toEqual(s.ringFar);
    // Frozen, as partGeometry leaves them: the memoised answers are the same numbers.
    const f = Object.freeze({ ...h, centre: Object.freeze([...h.centre]) as V3, bit: Object.freeze([...h.bit]) as V3 });
    expect(holeRing(f, h.depth)).toEqual(s.ringFar);
    expect(holePrism(f)).toEqual(s.prism);
    if (!h.through) expect(holeBottom(f)).toBe(holeRing(f, h.depth));
  });
});

describe('the tilted bore (angled holes spec §6.1)', () => {
  const thick = createBoard({ id: 't', length: 20, width: 8, thickness: 1.5 });
  // Chiral: every flag and slope differs from its mirror, the slopes unequal and of opposite signs.
  const BLIND: HoleRow = {
    id: 'tb', face: 'thickness', from: 'max', diameter: 0.5, depth: 0.9, along: 'length', alongFrom: 'min',
    station: 6, count: 2, pitch: 3, acrossFrom: 'min', inset: 3, tiltAlong: 0.2, tiltAcross: -0.05,
  };
  const THROUGH: HoleRow = {
    ...BLIND, id: 'tt', from: 'min', depth: 'through', alongFrom: 'max', acrossFrom: 'max', tiltAlong: 0.35, tiltAcross: 0.6,
  };
  const ON_END: HoleRow = {
    id: 'te', face: 'length', from: 'min', diameter: 0.375, depth: 1.25, along: 'thickness', alongFrom: 'max',
    station: 0.75, count: 1, pitch: 0, acrossFrom: 'min', inset: 4, tiltAlong: -0.15, tiltAcross: 0.3,
  };
  const ROWS = [BLIND, THROUGH, ON_END];
  const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const dotv = (p: V3, q: V3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const len = (p: V3) => Math.hypot(p[0], p[1], p[2]);
  const axisIdx = (h: Hole) => ['length', 'width', 'thickness'].indexOf(h.axis);
  /** Distance from the bit's line through the mouth centre. */
  const offLine = (h: Hole, p: V3) => {
    const q = sub(p, h.centre);
    const s = dotv(q, h.bit) / dotv(h.bit, h.bit);
    return len(sub(q, [s * h.bit[0], s * h.bit[1], s * h.bit[2]]));
  };
  const ringsOf = (h: Hole): V3[][] => (h.through
    ? [holeRing(h, 0), holeRing(h, h.reach / 3), holeRing(h, h.reach)]
    : [holeRing(h, 0), holeRing(h, h.reach / 3), holeBottom(h)]);
  const holes = ROWS.flatMap((r) => holeInstances(thick, r));

  it('bit is bitVector(row); reach is axial — the face dimension through, depth / |bit| blind', () => {
    for (const r of ROWS) {
      for (const h of holeInstances(thick, r)) {
        expect(h.bit).toEqual(bitVector(r));
        expect(h.depth).toBe(r.depth === 'through' ? thick[r.face] : r.depth);
        expect(h.reach).toBe(r.depth === 'through' ? thick[r.face] : r.depth / len(h.bit));
      }
    }
  });
  it('every ring vertex lies on its face-parallel plane and r from the bit\'s line', () => {
    for (const h of holes) {
      const a = axisIdx(h);
      for (const t of [0, h.reach / 3, h.reach * 0.7]) {
        const ring = holeRing(h, t);
        expect(ring).toHaveLength(HOLE_SEGMENTS);
        for (const p of ring) {
          expect(Math.abs(h.dir * (p[a]! - h.centre[a]!) - t)).toBeLessThanOrEqual(1e-12);
          expect(Math.abs(offLine(h, p) - h.radius)).toBeLessThanOrEqual(1e-12);
        }
      }
    }
  });
  it('the ring keeps the square ring\'s winding: from +u toward +v, seen down the face axis', () => {
    for (const h of holes) {
      const a = axisIdx(h);
      const [u, v] = [0, 1, 2].filter((i) => i !== a) as [number, number];
      const ring = holeRing(h, 0);
      let w = 0;
      ring.forEach((p, i) => {
        const q = ring[(i + 1) % ring.length]!;
        w += (p[u]! - h.centre[u]!) * (q[v]! - h.centre[v]!) - (p[v]! - h.centre[v]!) * (q[u]! - h.centre[u]!);
      });
      expect(w).toBeGreaterThan(0);
      expect(ring[0]![u]! - h.centre[u]!).toBeGreaterThan(0);   // θ = 0 leans toward +u, as the square ring's first vertex
    }
  });
  it('a blind bottom is r from the line, on the plane square to the bit at the bottom centre, depth along the bit', () => {
    for (const h of holes.filter((x) => !x.through)) {
      const centre: V3 = [h.centre[0] + h.reach * h.bit[0], h.centre[1] + h.reach * h.bit[1], h.centre[2] + h.reach * h.bit[2]];
      expect(Math.abs(len(sub(centre, h.centre)) - h.depth)).toBeLessThanOrEqual(1e-12);
      const b = holeBottom(h);
      expect(b).toHaveLength(HOLE_SEGMENTS);
      for (const p of b) {
        expect(Math.abs(offLine(h, p) - h.radius)).toBeLessThanOrEqual(1e-12);
        expect(Math.abs(dotv(sub(p, centre), h.bit) / len(h.bit))).toBeLessThanOrEqual(1e-12);
      }
    }
  });
  it('every prism plane keeps every ring vertex inside', () => {
    for (const h of holes) {
      const prism = holePrism(h);
      expect(prism).toHaveLength(HOLE_SEGMENTS + 2);
      for (const ring of ringsOf(h)) for (const p of ring) for (const q of prism) expect(dotv(q.n, p) + q.d).toBeGreaterThanOrEqual(-1e-9);
    }
  });
  it('the facets are parallel to the bit; the caps are the face plane and the bottom disc or exit face, ε out', () => {
    for (const h of holes) {
      const prism = holePrism(h);
      for (const q of prism.slice(0, HOLE_SEGMENTS)) expect(Math.abs(dotv(q.n, h.bit))).toBeLessThanOrEqual(1e-12);
      const entry = prism[HOLE_SEGMENTS]!;
      const far = prism[HOLE_SEGMENTS + 1]!;
      expect(dotv(entry.n, h.centre) + entry.d).toBeCloseTo(PRISM_EPS, 12);
      const end: V3 = [h.centre[0] + h.reach * h.bit[0], h.centre[1] + h.reach * h.bit[1], h.centre[2] + h.reach * h.bit[2]];
      expect(dotv(far.n, end) + far.d).toBeCloseTo(PRISM_EPS, 12);
      if (!h.through) expect(Math.abs(Math.abs(dotv(far.n, h.bit)) - len(h.bit))).toBeLessThanOrEqual(1e-12);
      else expect(Math.abs(far.n[axisIdx(h)]!)).toBe(1);
    }
  });
  it('the prism\'s box holds every ring vertex: a speck just inside each is touched', () => {
    for (const h of holes) {
      for (const ring of ringsOf(h)) {
        const mid = ring.reduce<V3>((s, p) => [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length, s[2] + p[2] / ring.length], [0, 0, 0]);
        for (const p of ring) {
          const inward = sub(mid, p);
          const k = 1e-6 / len(inward);
          const q: V3 = [p[0] + k * inward[0], p[1] + k * inward[1], p[2] + k * inward[2]];
          const speck: V3[] = [q, [q[0] + 1e-9, q[1], q[2]], [q[0], q[1] + 1e-9, q[2]]];
          expect(holeTouches(h, speck)).toBe(true);
        }
      }
    }
  });
  it('holeRegion holds the true mouth, far ring and bottom, and is no looser than they are', () => {
    for (const h of holes) {
      const reg = holeRegion(h);
      const dims = ['length', 'width', 'thickness'] as const;
      const fine = 2000;
      const pts: V3[] = [];
      for (const ring of ringsOf(h)) pts.push(...ring);
      pts.push(...holeRing(h, 0, fine), ...(h.through ? holeRing(h, h.reach, fine) : bottomFine(h, fine)));
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (const p of pts) {
        dims.forEach((d, i) => {
          expect(p[i]!).toBeGreaterThanOrEqual(reg[d][0] - 1e-12);
          expect(p[i]!).toBeLessThanOrEqual(reg[d][1] + 1e-12);
          lo[i] = Math.min(lo[i]!, p[i]!); hi[i] = Math.max(hi[i]!, p[i]!);
        });
      }
      dims.forEach((d, i) => {
        expect(lo[i]! - reg[d][0]).toBeLessThanOrEqual(1e-5);
        expect(reg[d][1] - hi[i]!).toBeLessThanOrEqual(1e-5);
      });
      // holeTouchesBox reads the same box: a region just past it misses, one overlapping it by a hair touches.
      const past = { ...reg, length: [reg.length[1] + 1e-6, reg.length[1] + 1] as [number, number] };
      const hair = { ...reg, length: [reg.length[1] - 1e-6, reg.length[1] + 1] as [number, number] };
      expect(holeTouchesBox(h, past)).toBe(false);
      expect(holeTouchesBox(h, hair)).toBe(true);
    }
  });
  /** The bottom disc's true circle, `n` points, by its definition: square to the bit at the bottom centre. */
  function bottomFine(h: Hole, n: number): V3[] {
    const b = holeBottom(h);
    const centre: V3 = [h.centre[0] + h.reach * h.bit[0], h.centre[1] + h.reach * h.bit[1], h.centre[2] + h.reach * h.bit[2]];
    const e1 = sub(b[0]!, centre).map((x) => x / h.radius) as V3;
    const bh = h.bit.map((x) => x / len(h.bit)) as V3;
    const e2: V3 = [bh[1] * e1[2] - bh[2] * e1[1], bh[2] * e1[0] - bh[0] * e1[2], bh[0] * e1[1] - bh[1] * e1[0]];
    return Array.from({ length: n }, (_, k) => {
      const th = (2 * Math.PI * k) / n;
      return [0, 1, 2].map((i) => centre[i]! + h.radius * (Math.cos(th) * e1[i]! + Math.sin(th) * e2[i]!)) as V3;
    });
  }
  it('insideHole: air on the bore\'s axis, wood just past the wall, beyond the bottom or the face', () => {
    for (const h of holes) {
      const mid: V3 = [0, 1, 2].map((i) => h.centre[i]! + (h.reach / 2) * h.bit[i]!) as V3;
      expect(insideHole(h, mid)).toBe(true);
      expect(insideHole(h, h.centre)).toBe(true);
      // A direction square to the bit: from the mid-axis point to a mid-depth ring vertex.
      const ringP = holeRing(h, h.reach / 2)[5]!;
      const foot = (() => {
        const q = sub(ringP, h.centre);
        const s = dotv(q, h.bit) / dotv(h.bit, h.bit);
        return [0, 1, 2].map((i) => h.centre[i]! + s * h.bit[i]!) as V3;
      })();
      const w = sub(ringP, foot).map((x) => x / h.radius) as V3;
      const at = (k: number): V3 => [0, 1, 2].map((i) => foot[i]! + k * w[i]!) as V3;
      expect(insideHole(h, at(h.radius - 1e-6))).toBe(true);
      expect(insideHole(h, at(h.radius + 1e-6))).toBe(false);
      const before: V3 = [0, 1, 2].map((i) => h.centre[i]! - 0.01 * h.bit[i]!) as V3;
      expect(insideHole(h, before)).toBe(false);
      const after: V3 = [0, 1, 2].map((i) => h.centre[i]! + (h.reach + 0.01) * h.bit[i]!) as V3;
      expect(insideHole(h, after)).toBe(false);
    }
  });
  it('rims: the mouth ring, then the bottom (blind) or the exit ring (through)', () => {
    for (const h of holes) {
      const rims = holeRims(h);
      expect(rims).toHaveLength(2 * HOLE_SEGMENTS);
      expect(rims.slice(0, HOLE_SEGMENTS).map((s) => s[0])).toEqual(holeRing(h, 0));
      expect(rims.slice(HOLE_SEGMENTS).map((s) => s[0])).toEqual(h.through ? holeRing(h, h.reach) : holeBottom(h));
    }
  });
  it('a frozen tilted hole answers from the memo: rings by t, the bottom in its own slot', () => {
    const h = holes[0]!;
    const f = Object.freeze({ ...h, centre: Object.freeze([...h.centre]) as V3, bit: Object.freeze([...h.bit]) as V3 });
    expect(holeRing(f, 0.3)).toBe(holeRing(f, 0.3));
    expect(holeBottom(f)).toBe(holeBottom(f));
    expect(holeBottom(f)).not.toBe(holeRing(f, f.reach));
    expect(holeBottom(f)).toEqual(holeBottom(h));
    expect(holePrism(f)).toBe(holePrism(f));
    expect(holePrism(f)).toEqual(holePrism(h));
    // A hole whose bit could still change is never memoised.
    const loose = Object.freeze({ ...h, centre: Object.freeze([...h.centre]) as V3, bit: [...h.bit] as V3 });
    expect(holeRing(loose, 0.3)).not.toBe(holeRing(loose, 0.3));
  });
  it('mirror equivariance: a flag flip is its own inverse and negates exactly the mirrored component of the bit', () => {
    for (const r of ROWS) {
      for (const d of ['length', 'width', 'thickness'] as const) {
        expect(mirrorHoleRow(mirrorHoleRow(r, d), d)).toEqual(r);
        const want = bitVector(r).slice() as V3;
        const i = ['length', 'width', 'thickness'].indexOf(d);
        want[i] = -want[i]!;
        expect(bitVector(mirrorHoleRow(r, d))).toEqual(want);
      }
    }
  });
});
