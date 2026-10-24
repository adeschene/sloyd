import { describe, expect, it } from 'vitest';
import {
  bitVector, isTilted, retilt, tiltDegrees, tiltResultantDeg, tiltSightlineDeg, withinTiltBound,
} from './holeTilt';
import { resultantDeg, sightlineDeg, slopeOf } from './lean';
import type { Dimension, HoleRow } from './types';

const ROW: HoleRow = {
  id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.5, along: 'length', alongFrom: 'min',
  station: 2, count: 1, pitch: 0, acrossFrom: 'min', inset: 1.5,
};
const DIMS: Dimension[] = ['length', 'width', 'thickness'];
const at = (d: Dimension) => DIMS.indexOf(d);

describe('bitVector (angled holes spec §6.1)', () => {
  it('a square row is exactly ±1 on its face axis and +0 on the other two, every face, both entries, every flag', () => {
    for (const face of DIMS) {
      const along = DIMS.find((d) => d !== face)!;
      for (const from of ['min', 'max'] as const) {
        for (const alongFrom of ['min', 'max'] as const) {
          for (const acrossFrom of ['min', 'max'] as const) {
            const m = bitVector({ ...ROW, face, along, from, alongFrom, acrossFrom });
            DIMS.forEach((d, i) => {
              // Object.is: a -0 here would differ from the square arithmetic it stands in for.
              expect(Object.is(m[i], d === face ? (from === 'min' ? 1 : -1) : 0), `${face} ${from} ${alongFrom} ${acrossFrom} ${d}`).toBe(true);
            });
          }
        }
      }
    }
  });
  it('a typed 10° along, measured from the max end, points toward the min end', () => {
    const m = bitVector({ ...ROW, alongFrom: 'max', tiltAlong: slopeOf(10) });
    expect(m[at('length')]).toBe(-slopeOf(10));
    expect(m[at('thickness')]).toBe(-1);
    expect(Object.is(m[at('width')], 0)).toBe(true);
  });
  it('across follows acrossFrom: from max, a positive slope runs toward the min side', () => {
    expect(bitVector({ ...ROW, tiltAcross: 0.2 })[at('width')]).toBe(0.2);
    expect(bitVector({ ...ROW, acrossFrom: 'max', tiltAcross: 0.2 })[at('width')]).toBe(-0.2);
  });
  it('isTilted only with a non-zero slope', () => {
    expect(isTilted(ROW)).toBe(false);
    expect(isTilted({ tiltAlong: 0.1 })).toBe(true);
    expect(isTilted({ tiltAcross: -0.1 })).toBe(true);
    expect(isTilted({ tiltAlong: 0, tiltAcross: 0 })).toBe(false);
  });
});

describe('retilt: an edit keeps the bore pointing the same way (spec §3.1)', () => {
  const chiral: HoleRow = { ...ROW, tiltAlong: 0.2, tiltAcross: -0.05 };
  const same = (a: number[], b: number[]) => a.every((v, i) => Object.is(v, b[i]));
  it('across an alongFrom flip the slope negates, the bit is unchanged', () => {
    const next = retilt(chiral, { ...chiral, alongFrom: 'max' });
    expect(next.tiltAlong).toBe(-0.2);
    expect(next.tiltAcross).toBe(-0.05);
    expect(same(bitVector(next), bitVector(chiral))).toBe(true);
  });
  it('across an acrossFrom flip likewise', () => {
    const next = retilt(chiral, { ...chiral, acrossFrom: 'max' });
    expect(next.tiltAcross).toBe(0.05);
    expect(same(bitVector(next), bitVector(chiral))).toBe(true);
  });
  it('across an along swap the two slopes trade places, the bit is unchanged', () => {
    const next = retilt(chiral, { ...chiral, along: 'width', alongFrom: 'max' });
    expect(next.tiltAlong).toBe(0.05);   // the old across (width) component, -0.05 board-local, re-read from max
    expect(next.tiltAcross).toBe(0.2);   // the old along (length) component, from min
    expect(same(bitVector(next), bitVector(chiral))).toBe(true);
  });
  it('a zero component is omitted, never stored as 0 or -0', () => {
    const next = retilt({ ...ROW, tiltAlong: 0.3 }, { ...ROW, tiltAlong: 0.3, along: 'width' });
    expect('tiltAlong' in next).toBe(false);
    expect(next.tiltAcross).toBe(0.3);
    expect('tiltAlong' in retilt(ROW, { ...ROW, alongFrom: 'max' })).toBe(false);
    expect('tiltAcross' in retilt(ROW, { ...ROW, alongFrom: 'max' })).toBe(false);
  });
  it('a face or entry change clears the tilt', () => {
    for (const next of [{ ...chiral, face: 'width' as const, along: 'length' as const }, { ...chiral, from: 'min' as const }]) {
      const r = retilt(chiral, next);
      expect('tiltAlong' in r).toBe(false);
      expect('tiltAcross' in r).toBe(false);
      expect(isTilted(r)).toBe(false);
    }
  });
  it('fields other than the flags are next\'s', () => {
    expect(retilt(chiral, { ...chiral, station: 5, diameter: 0.5 })).toEqual({ ...chiral, station: 5, diameter: 0.5 });
  });
});

describe('degrees, for display only', () => {
  it('tiltResultantDeg of (tan 8°, tan 12°) is 14.29…°, lean.ts\' resultant of the same pair', () => {
    const r = { ...ROW, tiltAlong: slopeOf(8), tiltAcross: slopeOf(12) };
    expect(tiltResultantDeg(r)).toBeGreaterThanOrEqual(14.29);
    expect(tiltResultantDeg(r)).toBeLessThan(14.3);
    expect(Math.abs(tiltResultantDeg(r) - resultantDeg({ x: slopeOf(8), z: slopeOf(12) }))).toBeLessThanOrEqual(1e-12);
  });
  it('tiltSightlineDeg is from the along dimension, 0–90, as lean\'s sightline', () => {
    const r = { ...ROW, tiltAlong: -slopeOf(8), tiltAcross: slopeOf(12) };
    expect(tiltSightlineDeg(r)).toBeCloseTo(sightlineDeg(slopeOf(8), slopeOf(12)), 12);
    expect(tiltSightlineDeg({ ...ROW, tiltAlong: 0.3 })).toBe(0);
    expect(tiltSightlineDeg({ ...ROW, tiltAcross: 0.3 })).toBe(90);
  });
  it('tiltDegrees is signed, toward the far end / side positive', () => {
    const d = tiltDegrees({ ...ROW, tiltAlong: slopeOf(10), tiltAcross: -slopeOf(5) });
    expect(d.along).toBeCloseTo(10, 12);
    expect(d.across).toBeCloseTo(-5, 12);
    expect(tiltDegrees(ROW)).toEqual({ along: 0, across: 0 });
  });
});

describe('withinTiltBound: the ONE bound (each ≤ 45°, the resultant ≤ 45°)', () => {
  it('the boundary is in', () => {
    expect(withinTiltBound(1, 0)).toBe(true);
    expect(withinTiltBound(0, -1)).toBe(true);
    expect(withinTiltBound(0.6, 0.8)).toBe(true);
    expect(withinTiltBound(slopeOf(45), 0)).toBe(true);
    expect(withinTiltBound(0, 0)).toBe(true);
  });
  it('past it is out, and so is a non-finite slope', () => {
    expect(withinTiltBound(1 + 2 ** -52, 0)).toBe(false);
    expect(withinTiltBound(0, -1 - 2 ** -52)).toBe(false);
    expect(withinTiltBound(0.6, 0.81)).toBe(false);
    expect(withinTiltBound(0.8, 0.8)).toBe(false);
    expect(withinTiltBound(NaN, 0)).toBe(false);
    expect(withinTiltBound(0, Infinity)).toBe(false);
  });
});
