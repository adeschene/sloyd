import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut, Board } from './types';
import {
  ANGLE_CUT_KEYS, angleCutRemovesNothing, angleCutValues, copyAngleCut, deriveKind, depthAt,
  keptHalfSpace, sameAngleCut, throughOf, zeroStation,
} from './angleCuts';

const leg = (over: Partial<Board> = {}): Board =>
  createBoard({ name: 'Leg', length: 29, width: 1.75, thickness: 1.75, ...over });

// The spec's worked taper: 5/8 off the width face (min side), starting 24 from the length min end.
const taper: AngleCut = {
  id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min',
  points: [[0, 0.625], [24, 0]],
};

/** g(x) = n·x + d at a board-local point [length, width, thickness]. */
const g = (b: Board, c: AngleCut, p: [number, number, number]) => {
  const h = keptHalfSpace(b, c)!;
  return h.n[0] * p[0] + h.n[1] * p[1] + h.n[2] * p[2] + h.d;
};

describe('the angle-cut model', () => {
  it('lists every field but id, kind included', () => {
    expect([...ANGLE_CUT_KEYS].sort()).toEqual(['along', 'alongFrom', 'face', 'from', 'kind', 'points']);
  });

  it('reads depth along the line and finds where it reaches zero', () => {
    expect(depthAt(taper, 0)).toBe(0.625);
    expect(depthAt(taper, 24)).toBe(0);
    expect(depthAt(taper, 12)).toBeCloseTo(0.3125, 12);
    expect(zeroStation(taper)).toBe(24);
    expect(zeroStation({ ...taper, points: [[0, 0.5], [10, 0.5]] })).toBeNaN();
  });

  it('names the through dimension', () => {
    expect(throughOf(taper)).toBe('thickness');
  });

  it('keeps the side away from the from face (min side, stations from the min end)', () => {
    const b = leg();
    expect(g(b, taper, [0, 0.625, 1])).toBeCloseTo(0, 12);    // on the line at the foot
    expect(g(b, taper, [0, 0.3, 1])).toBeLessThan(0);         // removed: inside the wedge at the foot
    expect(g(b, taper, [0, 1, 1])).toBeGreaterThan(0);        // kept
    expect(g(b, taper, [26, 0, 1])).toBeGreaterThan(0);       // above the taper's start: the face itself is kept
    const h = keptHalfSpace(b, taper)!;
    expect(Math.hypot(...h.n)).toBeCloseTo(1, 12);
    expect(h.n[2]).toBe(0);                                   // straight through thickness
  });

  it('measures from the max face and the max end when told to', () => {
    const b = leg();
    const c: AngleCut = { ...taper, from: 'max', alongFrom: 'max' };
    expect(g(b, c, [29, 1.75 - 0.625, 1])).toBeCloseTo(0, 12); // on the line at the max end
    expect(g(b, c, [29, 1.5, 1])).toBeLessThan(0);
    expect(g(b, c, [0, 1.75, 1])).toBeGreaterThan(0);
  });

  it('keeps from and alongFrom independent (mixed sides)', () => {
    const b = leg();
    const a: AngleCut = { ...taper, from: 'min', alongFrom: 'max' };   // stations from the max end (x = 29)
    expect(g(b, a, [29, 0.625, 1])).toBeCloseTo(0, 12);
    expect(g(b, a, [29, 0.3, 1])).toBeLessThan(0);
    expect(g(b, a, [29, 1, 1])).toBeGreaterThan(0);
    expect(g(b, a, [3, 0, 1])).toBeGreaterThan(0);                     // past the taper's start (station 26 > 24)
    const m: AngleCut = { ...taper, from: 'max', alongFrom: 'min' };   // depth from the max width face (1.75)
    expect(g(b, m, [0, 1.75 - 0.625, 1])).toBeCloseTo(0, 12);
    expect(g(b, m, [0, 1.5, 1])).toBeLessThan(0);
    expect(g(b, m, [0, 1, 1])).toBeGreaterThan(0);
    expect(g(b, m, [26, 1.75, 1])).toBeGreaterThan(0);
  });

  it('returns null for equal stations', () => {
    expect(keptHalfSpace(leg(), { ...taper, points: [[3, 0], [3, 1]] })).toBeNull();
  });

  it('removes nothing when the line is at or below zero across the whole part', () => {
    const b = leg();
    expect(angleCutRemovesNothing(b, taper)).toBe(false);
    expect(angleCutRemovesNothing(b, { ...taper, points: [[0, 0], [24, -1]] })).toBe(true);
    expect(angleCutRemovesNothing(b, { ...taper, points: [[30, 0], [40, 1]] })).toBe(true); // starts past the end
  });

  it('compares by every field but id, and copies the points', () => {
    expect(sameAngleCut(taper, { ...taper, id: 'other' })).toBe(true);
    expect(sameAngleCut(taper, { ...taper, kind: 'bevel' })).toBe(false);
    expect(sameAngleCut(taper, { ...taper, points: [[0, 0.625], [24, 1e-12]] })).toBe(false);
    const c = copyAngleCut(taper);
    expect(c).toEqual(taper);
    expect(c.points).not.toBe(taper.points);
    expect(c.points[0]).not.toBe(taper.points[0]);
    expect(angleCutValues(taper)).toEqual(['taper', 'width', 'min', 'length', 'min', 0, 0.625, 24, 0]);
  });

  it('derives a kind for a file without one (spec §2.4)', () => {
    const b = leg({ width: 2.5, thickness: 0.75 });
    const base = { id: 'x', kind: 'taper' as const, from: 'min' as const, alongFrom: 'min' as const };
    expect(deriveKind({ ...base, face: 'length', along: 'width', points: [[0, 0], [2.5, 2.5]] }, b)).toBe('miter');
    expect(deriveKind({ ...base, face: 'width', along: 'length', points: [[0, 0.5], [20, 0]] }, b)).toBe('taper');
    expect(deriveKind({ ...base, face: 'thickness', along: 'width', points: [[0, 0.125], [0.125, 0]] }, b)).toBe('chamfer');
    expect(deriveKind({ ...base, face: 'width', along: 'thickness', points: [[0, 0], [0.75, 0.2]] }, b)).toBe('bevel');
  });
});
