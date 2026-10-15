import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import {
  HOLE_KEYS, HOLE_SEGMENTS, PRISM_EPS, acrossOf, boardHoles, clipPolygon, copyHoleRow, holeInstances, holePrism, holeRing,
  holeRims, insideHole, minusPrism, mirrorHoleRow, ringInside, sameHoleRow, holeRowValues, defaultHole, defaultShelfPinRow, defaultHingeCup, mm,
} from './holes';
import { parseLength, IMPERIAL } from '../units/length';
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
      station: 2.5, count: 20, pitch: 1.25, acrossFrom: 'max', inset: 1,
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
    expect(hs[0]).toEqual({ row: 'h1', index: 0, axis: 'thickness', dir: -1, centre: [2, 1.5, 0.75], radius: 0.125, depth: 0.375, through: false });
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
