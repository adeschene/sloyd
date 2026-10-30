import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import {
  HOLE_KEYS, HOLE_SEGMENTS, PRISM_EPS, acrossOf, boardHoles, clipPolygon, copyHoleRow, holeInstances, holePrism, holeRing,
  holeRegion, holeRims, insideHole, minusPrism, holePieces, holeEnvelope, mirrorHoleRow, ringInside, sameHoleRow, holeRowValues, headReach, headProblem, defaultHole, defaultShelfPinRow, defaultHingeCup, defaultCamLock, defaultCamBoltBore, mm,
} from './holes';
import { parseLength, IMPERIAL } from '../units/length';
import snapshotRaw from './holesSquare.snapshot.json?raw';
import { bitVector } from './holeTilt';
import { SQUARE_CASES } from './holesSquareCases';
import { holeBottom, holeTouches, holeTouchesBox, defaultCountersunkScrew, defaultCounterboredScrew } from './holes';
import { holeFaults } from './holeFaults';
import type { Hole } from './holes';
import type { V3 } from './angleCuts';
import type { Board, HoleRow, Region } from './types';

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
      head: 'counterbore', headDiameter: 0.5, headDepth: 0.125, headAngle: 82,
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
  const snap = JSON.parse(snapshotRaw, (_k, v) => (v === '-0' ? -0 : v)) as {
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
  it('insideHole: a blind bore\'s far cap is the bottom disc, square to the bit — not the axial plane through its centre', () => {
    // Task 2 review: off-axis points by the bottom of BLIND (tilted (0.2, -0.05)). w is e_a's part square to the bit,
    // normalised: moving along it changes the axial t by sin θ per inch while staying in a plane square to the bit. `up`
    // is the way along w that makes the bore SHALLOWER (t decreasing). From the bottom centre:
    // - up 0.8r and 0.01 along the bit: past the bottom disc (along-bit depth + 0.01) yet axially SHORT of reach — wood;
    // - down 0.8r and 0.01 back along the bit: inside the disc's plane yet axially PAST reach — air.
    // Mutation: judging a blind bore's far cap by `t > reach` (the face-parallel plane) flips both.
    const h = holeInstances(thick, BLIND)[0]!;
    const a = axisIdx(h);
    const L = len(h.bit);
    const b = h.bit.map((x) => x / L) as V3;
    const ea: V3 = [0, 0, 0]; ea[a] = 1;
    const wRaw = sub(ea, b.map((x) => x * b[a]!) as V3);
    const w = wRaw.map((x) => x / len(wRaw)) as V3;
    const up = w.map((x) => -h.dir * x) as V3;
    const bottom: V3 = [0, 1, 2].map((i) => h.centre[i]! + h.reach * h.bit[i]!) as V3;
    const pt = (k: number, d: number): V3 => [0, 1, 2].map((i) => bottom[i]! + k * 0.8 * h.radius * up[i]! + d * b[i]!) as V3;
    const t = (p: V3) => h.dir * (p[a]! - h.centre[a]!);
    const uphill = pt(1, 0.01);
    const downhill = pt(-1, -0.01);
    // The set-up is what it claims: the axial t falls short of reach uphill and runs past it downhill.
    expect(t(uphill)).toBeLessThan(h.reach);
    expect(t(downhill)).toBeGreaterThan(h.reach);
    expect(dotv(sub(uphill, h.centre), b)).toBeGreaterThan(h.depth);
    expect(dotv(sub(downhill, h.centre), b)).toBeLessThan(h.depth);
    expect(insideHole(h, uphill)).toBe(false);
    expect(insideHole(h, downhill)).toBe(true);
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

describe('the stored head (counterbores, schema 30)', () => {
  const { id: _id, ...sq } = PIN;
  const through = { ...sq, depth: 'through' as const, diameter: 0.1875 };
  it('holeRowValues of a headless row is unchanged', () => {
    const b = createBoard({ length: 30, width: 11.25, thickness: 0.75 });
    const h = defaultHole(b)!;
    expect(holeRowValues(h)).toEqual([h.face, h.from, h.diameter, h.depth, h.along, h.alongFrom, h.station, h.count, 0, h.acrossFrom, h.inset]);
  });
  it('holeRowValues appends a head key name then its value', () => {
    const v = holeRowValues({ ...through, head: 'counterbore', headDiameter: 0.375, headDepth: 0.25 });
    expect(v.slice(-6)).toEqual(['head', 'counterbore', 'headDiameter', 0.375, 'headDepth', 0.25]);
  });
  it('sameHoleRow tells heads apart', () => {
    const cb = { ...through, head: 'counterbore' as const, headDiameter: 0.375, headDepth: 0.25 };
    const cs = { ...through, head: 'countersink' as const, headDiameter: 0.375, headAngle: 82 as const };
    expect(sameHoleRow(cb, cs)).toBe(false);
    expect(sameHoleRow(through, cb)).toBe(false);
    expect(sameHoleRow(cb, { ...cb })).toBe(true);
  });
  it('headReach', () => {
    const base = { diameter: 0.1875, headDiameter: 0.375 };
    expect(headReach({ ...base, head: 'counterbore', headDepth: 0.25 })).toBe(0.25);
    expect(headReach({ ...base, head: 'countersink', headAngle: 82 })).toBeCloseTo(0.09375 / Math.tan(41 * Math.PI / 180), 15);
    expect(headReach({ ...base, head: 'countersink', headAngle: 90 })).toBe(0.09375);
    expect(headReach({ diameter: 0.1875 })).toBeNull();
  });
  it('headProblem names each failure', () => {
    const cb = { ...through, head: 'counterbore' as const, headDiameter: 0.375, headDepth: 0.25 };
    expect(headProblem(through)).toBeNull();
    expect(headProblem(cb)).toBeNull();
    expect(headProblem({ ...cb, headAngle: 82 })).toBe('malformed');
    expect(headProblem({ ...cb, headDiameter: 20000 })).toBe('malformed');
    expect(headProblem({ ...cb, headDiameter: 0.1875 })).toBe('not-wider');
    expect(headProblem({ ...cb, depth: 0.25 })).toBe('too-deep');
    expect(headProblem({ ...cb, depth: 0.26 })).toBeNull();
    expect(headProblem({ ...cb, tiltAcross: 0.1 })).toBe('tilted');
  });
  it('mirrorHoleRow carries a head unchanged', () => {
    const row: HoleRow = { ...PIN, depth: 'through', diameter: 0.1875, head: 'countersink', headDiameter: 0.375, headAngle: 90 };
    for (const d of ['length', 'width', 'thickness'] as const) {
      const m = mirrorHoleRow(row, d);
      for (const k of ['head', 'headDiameter', 'headDepth', 'headAngle'] as const) expect(m[k]).toBe(row[k]);
      expect(mirrorHoleRow(m, d)).toEqual(row);
    }
  });
});

describe('the headed Hole and its pieces (counterbores spec §6.1)', () => {
  const board = createBoard({ id: 'b', length: 30, width: 11.25, thickness: 0.75 });
  const plain: HoleRow = {
    id: 'c1', face: 'thickness', from: 'max', diameter: 0.1875, depth: 'through', along: 'length', alongFrom: 'min',
    station: 2, count: 2, pitch: 1.25, acrossFrom: 'min', inset: 1.5,
  };
  const cbRow: HoleRow = { ...plain, head: 'counterbore', headDiameter: 0.375, headDepth: 0.375 };
  const csRow: HoleRow = { ...plain, head: 'countersink', headDiameter: 0.375, headAngle: 82 };
  // Both postures the square snapshot uses: entered from max (dir −1) and from min (dir +1).
  const postures = [['from max', 'max'], ['from min', 'min']] as const;
  const freezeHole = (h: Hole): Hole => {
    Object.freeze(h.centre); Object.freeze(h.bit); if (h.head) Object.freeze(h.head);
    return Object.freeze(h);
  };
  const radial = (h: Hole, p: V3) => {
    const a = ['length', 'width', 'thickness'].indexOf(h.axis);
    const [u, v] = [0, 1, 2].filter((i) => i !== a) as [number, number];
    return { t: h.dir * (p[a]! - h.centre[a]!), r: Math.hypot(p[u]! - h.centre[u]!, p[v]! - h.centre[v]!) };
  };
  const at = (h: Hole, t: number, r: number): V3 => {
    const a = ['length', 'width', 'thickness'].indexOf(h.axis);
    const [u] = [0, 1, 2].filter((i) => i !== a) as [number, number];
    const p: V3 = [h.centre[0], h.centre[1], h.centre[2]];
    p[a] += h.dir * t; p[u] += r;
    return p;
  };

  it('a headless Hole has no head key, and is its own single piece', () => {
    for (const h of holeInstances(board, plain)) {
      expect('head' in h).toBe(false);
      expect('tip' in h).toBe(false);
      expect(holePieces(h)).toHaveLength(1);
      expect(holePieces(h)[0]).toBe(h);
      expect(holeEnvelope(h)[0]).toBe(h);
    }
  });

  it.each(postures)('a counterbore splits into the head and the bore (%s)', (_n, from) => {
    const h = freezeHole(holeInstances(board, { ...cbRow, from })[0]!);
    expect(h.head).toEqual({ kind: 'counterbore', radius: 0.1875, reach: 0.375 });
    const ps = holePieces(h);
    expect(ps.map((p) => p.radius)).toEqual([0.1875, 0.09375]);
    for (const p of ps) { expect('head' in p).toBe(false); expect('tip' in p).toBe(false); }
    const [head, bore] = ps as [Hole, Hole];
    expect(head).toMatchObject({ depth: 0.375, reach: 0.375, through: false, centre: h.centre });
    expect(radial(h, bore.centre)).toEqual({ t: 0.375, r: 0 });
    expect(bore).toMatchObject({ depth: 0.375, reach: 0.375, through: true, axis: h.axis, dir: h.dir });
    expect(holeEnvelope(h)).toBe(ps);   // no frustum: the envelope is the pieces
  });

  it('pieces of a frozen hole are frozen and memoised by its identity; an unfrozen one computes fresh', () => {
    const h = freezeHole(holeInstances(board, cbRow)[0]!);
    const ps = holePieces(h);
    expect(holePieces(h)).toBe(ps);
    for (const p of ps) expect(Object.isFrozen(p) && Object.isFrozen(p.centre) && Object.isFrozen(p.bit)).toBe(true);
    // A frozen piece's own memos apply: the same prism and ring arrays twice.
    expect(holePrism(ps[1]!)).toBe(holePrism(ps[1]!));
    expect(holeRing(ps[0]!, 0)).toBe(holeRing(ps[0]!, 0));
    const loose = holeInstances(board, cbRow)[0]!;
    expect(holePieces(loose)).not.toBe(holePieces(loose));
    // A head left unfrozen is not memoised either.
    const half = Object.freeze({ ...loose, centre: Object.freeze([...loose.centre]) as V3, bit: Object.freeze([...loose.bit]) as V3 });
    expect(holePieces(half)).not.toBe(holePieces(half));
  });

  it.each(postures)('a countersink head is a frustum to the bore radius (%s)', (_n, from) => {
    const h = freezeHole(holeInstances(board, { ...csRow, from })[0]!);
    const reach = headReach(csRow)!;
    expect(h.head).toEqual({ kind: 'countersink', radius: 0.1875, reach });
    const [head, bore] = holePieces(h) as [Hole, Hole];
    expect(head.tip).toBe(0.09375);
    expect(head).toMatchObject({ radius: 0.1875, depth: reach, reach, through: false });
    expect(bore.tip).toBeUndefined();
    for (const t of [0, reach / 3, reach / 2, reach]) {
      const want = 0.1875 + ((0.09375 - 0.1875) * t) / reach;
      for (const p of holeRing(head, t)) {
        const q = radial(head, p);
        expect(Math.abs(q.t - t)).toBeLessThan(1e-12);
        expect(Math.abs(q.r - want)).toBeLessThan(1e-12);
      }
    }
    // The far ring and the bore's mouth ring are the same points, exactly.
    expect(holeRing(head, head.depth)).toEqual(holeRing(bore, 0));
    // Inscribed: every prism plane keeps every ring vertex of the piece inside (the facets) or on (the caps' ε).
    const prism = holePrism(head);
    expect(prism).toHaveLength(HOLE_SEGMENTS + 2);
    for (const q of prism) {
      expect(Math.hypot(...q.n)).toBeCloseTo(1, 14);
      for (const t of [0, reach / 2, reach]) for (const p of holeRing(head, t)) {
        expect(q.n[0] * p[0] + q.n[1] * p[1] + q.n[2] * p[2] + q.d).toBeGreaterThanOrEqual(-1e-9);
      }
    }
    // The facets are slanted: a point at radius R just past the mouth is outside, one at the tip radius there is inside.
    const facetsOk = (p: V3) => prism.slice(0, HOLE_SEGMENTS).every((q) => q.n[0] * p[0] + q.n[1] * p[1] + q.n[2] * p[2] + q.d >= 0);
    expect(facetsOk(at(head, reach, 0.18))).toBe(false);
    expect(facetsOk(at(head, reach, 0.09))).toBe(true);
    expect(facetsOk(at(head, 0, 0.18))).toBe(true);
    // The envelope judges the frustum as its mouth cylinder; the bore is the same object.
    const env = holeEnvelope(h);
    expect(env[0]).toMatchObject({ radius: 0.1875, depth: reach });
    expect('tip' in env[0]!).toBe(false);
    expect(env[1]).toBe(bore);
    expect(holeEnvelope(h)).toBe(env);
  });

  it('the cone ends EXACTLY on the bore radius, even where the linear interpolation would round', () => {
    // 5/32" under a 5/8" head at 82°: radius + (tip − radius)·t/t is 0.07812500000000003, not 0.078125.
    const row: HoleRow = { ...csRow, diameter: 0.15625, headDiameter: 0.625 };
    const [head, bore] = holePieces(holeInstances(board, row)[0]!) as [Hole, Hole];
    expect(head.radius + ((head.tip! - head.radius) * head.depth) / head.depth).not.toBe(head.tip);
    expect(holeRing(head, head.depth)).toEqual(holeRing(bore, 0));
  });

  it('the frustum prism\'s box holds the mouth ring: a face just inside the mouth, outside the tip radius, is touched', () => {
    const [head] = holePieces(holeInstances(board, csRow)[0]!) as [Hole];
    const p0 = at(head, 0.001, 0.17);
    const poly: V3[] = [p0, [p0[0] + 0.005, p0[1], p0[2]], [p0[0], p0[1] + 0.005, p0[2]]];
    expect(holeTouches(head, poly)).toBe(true);
  });

  it.each([['counterbore', cbRow], ['countersink', csRow]] as const)('holeRegion of a %s holds every ring of every piece', (_n, row) => {
    for (const [, from] of postures) {
      const h = holeInstances(board, { ...row, from })[0]!;
      const reg = holeRegion(h);
      const dims = ['length', 'width', 'thickness'] as const;
      for (const p of holePieces(h)) for (const t of [0, p.depth / 2, p.depth]) for (const v of holeRing(p, t)) {
        dims.forEach((d, i) => { expect(v[i]!).toBeGreaterThanOrEqual(reg[d][0] - 1e-12); expect(v[i]!).toBeLessThanOrEqual(reg[d][1] + 1e-12); });
      }
      // ±R across over the full depth.
      const a = dims.indexOf(h.axis);
      expect(reg[h.axis][1] - reg[h.axis][0]).toBe(0.75);
      dims.forEach((d, i) => { if (i !== a) expect(reg[d]).toEqual([h.centre[i]! - 0.1875, h.centre[i]! + 0.1875]); });
      expect(holeTouchesBox(h, { ...reg, [dims[(a + 1) % 3]!]: [reg[dims[(a + 1) % 3]!][1] + 0.01, 99] })).toBe(false);
      expect(holeTouchesBox(h, reg)).toBe(true);
    }
  });

  it('holeTouchesBox sees the head where the bore alone would miss', () => {
    const h = holeInstances(board, cbRow)[0]!;
    // A box beside the bore but inside the head's ring, over the head's span.
    const box: Region = { length: [h.centre[0] + 0.15, h.centre[0] + 0.17], width: [h.centre[1] - 0.01, h.centre[1] + 0.01], thickness: [0.6, 0.7] };
    expect(holeTouchesBox(holePieces(h)[1]!, box)).toBe(false);
    expect(holeTouchesBox(h, box)).toBe(true);
  });

  it('insideHole: inside any piece, a frustum by its interpolated radius', () => {
    const cb = holeInstances(board, cbRow)[0]!;
    const cs = holeInstances(board, csRow)[0]!;
    const mid = (r: number, h: Hole) => at(h, h.head!.reach / 2, r);
    const between = (0.09375 + 0.1875) / 2;
    expect(insideHole(cb, mid(between, cb))).toBe(true);
    expect(insideHole(cs, mid(between + 0.01, cs))).toBe(false);   // the cone's radius at mid-span is `between`
    expect(insideHole(cs, mid(between - 0.01, cs))).toBe(true);
    expect(insideHole(cb, mid(0.19, cb))).toBe(false);
    expect(insideHole(cs, mid(0.19, cs))).toBe(false);
    // Past the head only the bore is air.
    expect(insideHole(cb, at(cb, 0.5, between))).toBe(false);
    expect(insideHole(cb, at(cb, 0.5, 0.05))).toBe(true);
  });

  it('holeRims: a through counterbore deeper than the part draws no bore rings in air (inv 16)', () => {
    const deep = holeInstances(board, { ...cbRow, headDepth: 1 })[0]!;
    expect(deep.through).toBe(true);
    const rings = new Set(holeRims(deep).map(([p]) => radial(deep, p).r.toFixed(6)));
    expect([...rings]).toEqual([deep.head!.radius.toFixed(6)]);
  });

  it('holeRims: a counterbore draws four rings, a countersink three (the junction once)', () => {
    const loops = (h: Hole) => holeRims(h).length / HOLE_SEGMENTS;
    const cb = holeInstances(board, cbRow)[0]!;
    const cs = holeInstances(board, csRow)[0]!;
    expect(loops(cb)).toBe(4);
    expect(loops(cs)).toBe(3);
    const junction = holeRing(holePieces(cs)[1]!, 0);
    const key = (p: V3) => p.join(',');
    const starts = holeRims(cs).map(([p]) => key(p));
    for (const p of junction) expect(starts.filter((s) => s === key(p))).toHaveLength(1);
  });
});

describe('screw presets (counterbores §5)', () => {
  const stock = (thickness: number) => createBoard({ id: 'b', name: 'B', length: 12, width: 4, thickness });
  const faults = (b: Board, r: Omit<HoleRow, 'id'>) => { const p = { ...r, id: 'p' }; return holeFaults({ ...b, holes: [p] }, p); };
  it('on 3/4" stock both are through with the exact values, and fault-free', () => {
    const b = stock(0.75);
    const sink = defaultCountersunkScrew(b, false);
    const bore = defaultCounterboredScrew(b, false);
    expect(sink).toMatchObject({ ...defaultHole(b), diameter: 3 / 16, depth: 'through', head: 'countersink', headDiameter: 3 / 8, headAngle: 82 });
    expect(bore).toMatchObject({ ...defaultHole(b), diameter: 3 / 16, depth: 'through', head: 'counterbore', headDiameter: 3 / 8, headDepth: 3 / 8 });
    expect('headDepth' in sink).toBe(false);
    expect('headAngle' in bore).toBe(false);
    expect(faults(b, sink)).toEqual([]);
    expect(faults(b, bore)).toEqual([]);
    expect(headProblem(sink)).toBeNull();
    expect(headProblem(bore)).toBeNull();
  });
  it('on 2" stock the depth is 1.25 (above 1-1/2" is blind)', () => {
    const b = stock(2);
    expect(defaultCountersunkScrew(b, false).depth).toBe(1.25);
    expect(defaultCounterboredScrew(b, false).depth).toBe(1.25);
    expect(stock(1.5)).toBeDefined();
    expect(defaultCounterboredScrew(stock(1.5), false).depth).toBe('through');
  });
  it('metric: 4.5 mm bore, 9 mm at 90 degrees, 10 mm x 10 mm', () => {
    const b = stock(0.75);
    expect(defaultCountersunkScrew(b, true)).toMatchObject({ diameter: mm(4.5), headDiameter: mm(9), headAngle: 90 });
    expect(defaultCounterboredScrew(b, true)).toMatchObject({ diameter: mm(4.5), headDiameter: mm(10), headDepth: mm(10) });
  });
});

describe('cam-and-bolt presets (spec §4)', () => {
  const strip = (r: HoleRow): Omit<HoleRow, 'id'> => { const { id: _id, ...rest } = r; return rest; };
  it('defaultCamLock on the fixture-sized part is the fixture pair', async () => {
    const { CAM, BOLT, camPart } = await import('./camBoltFixtures');
    expect(defaultCamLock(camPart({ holes: [] }), 'min')).toEqual([strip(CAM), strip(BOLT)]);
  });
  it('the max end enters the cam and the bolt from max', () => {
    const [cam, bolt] = defaultCamLock(createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.75 }), 'max')!;
    expect(cam.acrossFrom).toBe('max');
    expect(bolt.from).toBe('max');
  });
  it('a narrow part takes one, centred', () => {
    const w = mm(140);
    const [cam, bolt] = defaultCamLock(createBoard({ id: 'p', length: 30, width: w, thickness: 0.75 }), 'min')!;
    expect(cam).toMatchObject({ count: 1, station: w / 2, pitch: 0 });
    expect(bolt).toMatchObject({ count: 1, station: w / 2 });
  });
  it('5/8" stock gives a 12.5 mm cam', () => {
    const [cam] = defaultCamLock(createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.625 }), 'min')!;
    expect(cam.depth).toBe(mm(12.5));
  });
  it('R12 (the user\'s ruling 2026-10-30): withheld on stock 1/2" or thinner, offered just above', () => {
    expect(defaultCamLock(createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.5 }), 'min')).toBeNull();
    expect(defaultCamLock(createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.25 }), 'min')).toBeNull();
    expect(defaultCamLock(createBoard({ id: 'p', length: 30, width: 11.25, thickness: mm(13) }), 'min')).not.toBeNull();
  });
  it('withholds when the broad face is the length', () => {
    expect(defaultCamLock(createBoard({ id: 'p', length: 0.5, width: 3, thickness: 2 }), 'min')).toBeNull();
  });
  it('the bore is 5 mm by 12 mm at the default hole\'s place', () => {
    const b = createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.75 });
    expect(defaultCamBoltBore(b)).toEqual({ ...defaultHole(b), diameter: mm(5), depth: mm(12) });
  });
});
