import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut, Board } from './types';
import {
  ANGLE_CUT_KEYS, angleCutRemovesNothing, angleCutValues, copyAngleCut, deriveKind, depthAt,
  defaultTaper, keptHalfSpace, mirrorAngleCut, sameAngleCut, taperCut, taperFields, throughOf, zeroStation,
  defaultMiter, defaultMiterPair, miterCut, miterDegrees, miterFields, miterRatio,
} from './angleCuts';
import { boardBodies, bodyVerts } from './bodies';
import { shortPointLine } from './angleText';

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

describe('mirrorAngleCut (spec 5.2: a flag flip, no arithmetic)', () => {
  it('flips from when the face is mirrored', () => {
    expect(mirrorAngleCut(taper, 'width')).toEqual({ ...taper, from: 'max' });
  });
  it('flips alongFrom when along is mirrored', () => {
    expect(mirrorAngleCut(taper, 'length')).toEqual({ ...taper, alongFrom: 'max' });
  });
  it('changes nothing through the third dimension, and never shares points', () => {
    const m = mirrorAngleCut(taper, 'thickness');
    expect(m).toEqual(taper);
    expect(m.points).not.toBe(taper.points);
  });
  it('is an exact involution', () => {
    for (const d of ['length', 'width', 'thickness'] as const) expect(mirrorAngleCut(mirrorAngleCut(taper, d), d)).toEqual(taper);
  });
});

describe('taper fields (spec §7)', () => {
  it('round-trips exactly', () => {
    const f = { face: 'thickness' as const, from: 'max' as const, end: 'max' as const, start: 22.25, amount: 0.4375 };
    const c = { id: 'x', ...taperCut(f) };
    expect(c).toMatchObject({ kind: 'taper', face: 'thickness', from: 'max', along: 'length', alongFrom: 'max', points: [[0, 0.4375], [22.25, 0]] });
    expect(taperFields(c, leg({ length: 28 }))).toEqual(f);
  });
  it('defaults to a quarter of the width over three quarters of the length', () => {
    const b = createBoard({ length: 28, width: 2, thickness: 2 });
    expect(defaultTaper(b)).toEqual(taperCut({ face: 'width', from: 'min', end: 'min', start: 21, amount: 0.5 }));
  });
  it('describes a taper that deepens toward the far end from its deep end', () => {
    const c: AngleCut = { id: 'x', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[5, 0], [29, 0.625]] };
    expect(taperFields(c, leg())).toEqual({ face: 'width', from: 'min', end: 'max', start: 24, amount: 0.625 });
  });
});

describe('miter fields (spec §7)', () => {
  const rail = () => createBoard({ length: 24, width: 2.5, thickness: 0.75 });

  it('maps 45° to a ratio of exactly 1 and back to 45.0 for display', () => {
    expect(miterRatio(45)).toBe(1);
    expect(miterRatio(22.5)).toBeCloseTo(Math.tan(Math.PI / 8), 15);
    expect(miterDegrees(1).toFixed(1)).toBe('45.0');
  });

  it('builds a canonical miter: depth 0 at the long-point side, run × ratio at the other', () => {
    const c = miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, rail());
    expect(c).toEqual({ kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [2.5, 2.5]] });
  });

  it('round-trips exactly, and an edit of side or end keeps depth === run (Review Focus 1)', () => {
    const b = rail();
    const c = { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, b) };
    const f = miterFields(c, b);
    expect(f).toEqual({ end: 'max', across: 'width', longSide: 'min', ratio: 1 });
    const moved = miterCut({ ...f, longSide: 'max', end: 'min' }, b);
    expect(moved.points).toEqual([[0, 0], [2.5, 2.5]]);
    expect(moved.alongFrom).toBe('max');
    expect(moved.from).toBe('min');
  });

  it('reads the long-point side of a hand-edited miter stored the other way round (Review Focus 4)', () => {
    const b = rail();
    // Deep at station 0 from the width min side: the long point is on the width MAX side.
    const c = { id: 'h', kind: 'miter' as const, face: 'length' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 2.5], [2.5, 0]] as [[number, number], [number, number]] };
    expect(miterFields(c, b)).toEqual({ end: 'max', across: 'width', longSide: 'max', ratio: 1 });
  });

  it('defaults to a 45° miter across the width at the length max end, long point on the min side', () => {
    expect(defaultMiter(rail())).toEqual(miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, rail()));
  });

  it('a default pair is a picture-frame trapezoid: short point = length − 2 × width (Review Focus 3)', () => {
    const b = { ...rail(), angleCuts: defaultMiterPair(rail()).map((c, i) => ({ ...c, id: `p${i}` })) };
    expect(b.angleCuts.map((c) => c.from).sort()).toEqual(['max', 'min']);
    expect(shortPointLine(b, 16)).toBe('Short point 19"');
    // Cross-check against the geometry: the width-max long edge spans 2.5 → 21.5, the width-min edge 0 → 24.
    const xs = boardBodies(b).flatMap(bodyVerts).filter((p) => Math.abs(p[1] - 2.5) < 1e-9).map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(2.5, 12);
    expect(Math.max(...xs)).toBeCloseTo(21.5, 12);
  });

  it('a 22.5° miter across the thickness stores run × tan', () => {
    const c = miterCut({ end: 'min', across: 'thickness', longSide: 'max', ratio: miterRatio(22.5) }, rail());
    expect(c.along).toBe('thickness');
    expect(c.points[1]![1]).toBe(0.75 * Math.tan(Math.PI / 8));
  });
});
