import { IMPERIAL } from '../units/length';
import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut, Board, Dimension, Region } from './types';
import {
  ANGLE_CUT_KEYS, angleCutRemovesNothing, angleCutValues, copyAngleCut, deriveKind, depthAt,
  defaultTaper, keptHalfSpace, mirrorAngleCut, sameAngleCut, taperCut, taperFields, throughOf, zeroStation,
  defaultMiter, defaultMiterPair, miterCut, miterDegrees, miterFields, miterRatio,
  bevelCut, bevelFields, bevelAcross, defaultBevel,
  CHAMFER_EDGES, chamferCut, chamferFields, defaultChamfer, splitRegion, touchedRegion,
} from './angleCuts';
import { boardBodies, bodyVerts, bodyVolume } from './bodies';
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
    const f = miterFields(c, b)!;
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

  it('an OFFSET miter (its line reaching depth 0 on neither side; hand-edited) reads as null, never rewritten (fu 297)', () => {
    const b = rail();
    const mk = (points: [[number, number], [number, number]]) => ({ id: 'o', kind: 'miter' as const, face: 'length' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const, points });
    expect(miterFields(mk([[0, 0.5], [2.5, 3]]), b)).toBeNull();
    expect(miterFields(mk([[0.5, 0], [2.5, 2]]), b)).toBeNull();       // zero inside the part, not at a side
    expect(miterFields(mk([[0, 0], [2.5, 2.5]]), b)).not.toBeNull();
  });

  it('defaults to a 45° miter across the width at the length max end, long point on the min side', () => {
    expect(defaultMiter(rail())).toEqual(miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, rail()));
  });

  it('a default pair is a picture-frame trapezoid: short point = length − 2 × width (Review Focus 3)', () => {
    const b = { ...rail(), angleCuts: defaultMiterPair(rail()).map((c, i) => ({ ...c, id: `p${i}` })) };
    expect(b.angleCuts.map((c) => c.from).sort()).toEqual(['max', 'min']);
    expect(shortPointLine(b, IMPERIAL)).toBe('Short point 19"');
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

const stock = () => createBoard({ length: 20, width: 3, thickness: 0.75 });
const volume = (b: Board) => boardBodies(b).reduce((v, x) => v + bodyVolume(x), 0);

describe('bevel fields (spec §7)', () => {
  it('slopes across the other cross dimension', () => {
    expect(bevelAcross('width')).toBe('thickness');
    expect(bevelAcross('thickness')).toBe('width');
  });
  it('a 45° bevel keeps depth === run through a face/side edit (Review Focus 1)', () => {
    const b = stock();
    const c = { id: 'b', ...bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: 1 }, b) };
    expect(c.points).toEqual([[0, 0], [0.75, 0.75]]);
    const f = bevelFields(c, b)!;
    expect(f).toEqual({ face: 'width', from: 'max', longSide: 'min', ratio: 1 });
    const moved = bevelCut({ ...f, from: 'min', longSide: 'max' }, b);
    expect(moved.points).toEqual([[0, 0], [0.75, 0.75]]);
  });
  it('removes ½ · run · depth · length', () => {
    const b = { ...stock(), angleCuts: [{ id: 'b', ...bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: miterRatio(15) }, stock()) }] };
    const d = 0.75 * Math.tan((15 * Math.PI) / 180);
    expect(Math.abs(volume(b) - (20 * 3 * 0.75 - 0.5 * 0.75 * d * 20))).toBeLessThan(1e-9);
  });
  it('is null for a cut the bevel row cannot show', () => {
    const b = stock();
    expect(bevelFields({ id: 't', kind: 'bevel', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.5], [10, 0]] }, b)).toBeNull();
    expect(bevelFields({ id: 'm', kind: 'bevel', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [3, 3]] }, b)).toBeNull();
  });
  it('reads only lines that start at depth 0 on a side of along', () => {
    const b = stock();
    const mk = (points: [[number, number], [number, number]]): AngleCut => ({ id: 'x', kind: 'bevel', face: 'width', from: 'max', along: 'thickness', alongFrom: 'min', points });
    expect(bevelFields(mk([[0, 0.2], [0.75, 0.4]]), b)).toBeNull();
    expect(bevelFields(mk([[0.25, 0], [0.75, 0.3]]), b)).toBeNull();
    expect(bevelFields(mk([[0, 0], [0.75, 0.3]]), b)).not.toBeNull();
    expect(bevelFields(mk([[0, 0.2], [0.75, 0]]), b)).toMatchObject({ longSide: 'max' });
  });
  it('defaults to 15° off the width face (max side), long point on the thickness min side', () => {
    expect(defaultBevel(stock())).toEqual(bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: miterRatio(15) }, stock()));
  });
});

describe('chamfer fields (spec §7)', () => {
  it('lists twelve distinct canonical edges', () => {
    expect(CHAMFER_EDGES).toHaveLength(12);
    expect(new Set(CHAMFER_EDGES.map((e) => `${e.face}${e.from}${e.along}${e.alongFrom}`)).size).toBe(12);
    for (const e of CHAMFER_EDGES) expect(['length', 'width', 'thickness'].indexOf(e.face)).toBeLessThan(['length', 'width', 'thickness'].indexOf(e.along));
  });
  it('each edge removes the corner it names, checked against the geometry (Review Focus 5)', () => {
    const b0 = stock();
    for (const e of CHAMFER_EDGES) {
      const b = { ...b0, angleCuts: [{ id: 'c', ...chamferCut({ ...e, legFace: 0.125, legAlong: 0.125 }, b0) }] };
      // The named edge's corner is gone at BOTH ends of the through line, and the part's other three corners
      // on that end remain (so a cut on the wrong edge cannot pass).
      const through = (['length', 'width', 'thickness'] as const).find((d) => d !== e.face && d !== e.along)!;
      const verts = boardBodies(b).flatMap(bodyVerts);
      const at = (p: number[], face: number, along: number, end: number) => {
        const want = { length: 0, width: 0, thickness: 0 } as Record<Dimension, number>;
        want[e.face] = face; want[e.along] = along; want[through] = end;
        return Math.abs(p[0]! - want.length) < 1e-9 && Math.abs(p[1]! - want.width) < 1e-9 && Math.abs(p[2]! - want.thickness) < 1e-9;
      };
      const fc = e.from === 'min' ? 0 : b0[e.face];
      const ac = e.alongFrom === 'min' ? 0 : b0[e.along];
      for (const end of [0, b0[through]]) {
        expect(verts.some((p) => at(p, fc, ac, end)), `${JSON.stringify(e)} corner removed at ${end}`).toBe(false);
        for (const [f2, a2] of [[b0[e.face] - fc, ac], [fc, b0[e.along] - ac], [b0[e.face] - fc, b0[e.along] - ac]] as [number, number][]) {
          expect(verts.some((p) => at(p, f2, a2, end)), `${JSON.stringify(e)} other corner kept at ${end}`).toBe(true);
        }
      }
      expect(Math.abs(volume(b) - (20 * 3 * 0.75 - 0.5 * 0.125 * 0.125 * b0[through]))).toBeLessThan(1e-9);
    }
  });
  it('round-trips exactly', () => {
    const b = stock();
    const e = CHAMFER_EDGES[0]!;
    const c = { id: 'c', ...chamferCut({ ...e, legFace: 0.125, legAlong: 0.1875 }, b) };
    expect(chamferFields(c, b)).toEqual({ ...e, legFace: 0.125, legAlong: 0.1875 });
  });
  it('canonicalises a hand-edited chamfer stored the other way round (Review Focus 2)', () => {
    const b = stock();
    // face thickness / along width (non-canonical order), deepening toward the far side of `along`. Unequal legs
    // (0.5 along the width, 0.25 into the thickness) so a dropped face/along swap shows.
    const c = { id: 'h', kind: 'chamfer' as const, face: 'thickness' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const,
      points: [[2.5, 0], [3, 0.25]] as [[number, number], [number, number]] };
    // Hand-checked: depth into the thickness from its max face is 0 at width 2.5 and 0.25 at width 3, so it knocks off
    // the thickness-max / width-max corner: 0.5 into the width, 0.25 into the thickness.
    const f = chamferFields(c, b);
    expect(f).toEqual({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.5, legAlong: 0.25 });
    // And the canonical rewrite removes the same stock as the original.
    const same = (x: AngleCut) => volume({ ...b, angleCuts: [x] });
    expect(Math.abs(same(c) - same({ id: 'r', ...chamferCut(f!, b) }))).toBeLessThan(1e-9);
    expect(Math.abs(same(c) - (20 * 3 * 0.75 - 0.5 * 0.5 * 0.25 * 20))).toBeLessThan(1e-9);
  });
  it('round-trips decimal legs exactly (0.1 x 0.7), including the deep-end form', () => {
    const b = stock();
    const e = CHAMFER_EDGES[0]!;
    const c = { id: 'c', ...chamferCut({ ...e, legFace: 0.1, legAlong: 0.7 }, b) };
    expect(chamferFields(c, b)).toEqual({ ...e, legFace: 0.1, legAlong: 0.7 });
    const A = b[e.along];
    const deep = { id: 'd', kind: 'chamfer' as const, face: e.face, from: e.from, along: e.along, alongFrom: e.alongFrom, points: [[A - 0.7, 0], [A, 0.1]] as [[number, number], [number, number]] };
    expect(chamferFields(deep, b)).toEqual({ ...e, alongFrom: e.alongFrom === 'min' ? 'max' : 'min', legFace: 0.1, legAlong: 0.7 });
  });
  it('carries the sides through the face/along swap, checked against geometry', () => {
    const b = stock();
    const c = { id: 's', kind: 'chamfer' as const, face: 'thickness' as const, from: 'min' as const, along: 'width' as const, alongFrom: 'max' as const,
      points: [[0, 0.25], [0.5, 0]] as [[number, number], [number, number]] };
    const f = chamferFields(c, b);
    expect(f).toEqual({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'min', legFace: 0.5, legAlong: 0.25 });
    // Geometry: thickness-min / width-max corner is gone at both ends of the length; the other three remain.
    const verts = boardBodies({ ...b, angleCuts: [c] }).flatMap(bodyVerts);
    const has = (l: number, w: number, t: number) => verts.some((p) => Math.abs(p[0]! - l) < 1e-9 && Math.abs(p[1]! - w) < 1e-9 && Math.abs(p[2]! - t) < 1e-9);
    for (const l of [0, 20]) {
      expect(has(l, 3, 0)).toBe(false);
      expect(has(l, 0, 0)).toBe(true); expect(has(l, 3, 0.75)).toBe(true); expect(has(l, 0, 0.75)).toBe(true);
    }
  });
  it('is null for a line that is not a corner chamfer', () => {
    const b = stock();
    expect(chamferFields({ id: 'n', kind: 'chamfer', face: 'width', from: 'max', along: 'thickness', alongFrom: 'min', points: [[0, 0.5], [0.75, 0.7]] }, b)).toBeNull(); // deep at both sides: never reaches 0 inside the part
  });
  it('still reads a chamfer whose legs exceed a resized dimension, so its row stays editable', () => {
    const e = CHAMFER_EDGES.find((x) => x.face === 'width' && x.along === 'thickness' && x.from === 'max' && x.alongFrom === 'max')!;
    const c = { id: 'c', ...chamferCut({ ...e, legFace: 0.125, legAlong: 0.125 }, stock()) };
    const thin = { length: 20, width: 3, thickness: 0.1 };
    expect(chamferFields(c, thin)).toEqual({ ...e, legFace: 0.125, legAlong: 0.125 });
    expect(chamferCut(chamferFields(c, thin)!, thin).points).toEqual(c.points);
  });
  it('defaults to 1/8 on the width-max / thickness-max edge, smaller on a tiny part', () => {
    const d = defaultChamfer(stock());
    expect(d).toMatchObject({ kind: 'chamfer', face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', points: [[0, 0.125], [0.125, 0]] });
    const tiny = defaultChamfer(createBoard({ length: 4, width: 0.25, thickness: 0.25 }));
    expect(tiny.points).toEqual([[0, 0.0625], [0.0625, 0]]);
  });
});

describe('touchedRegion / splitRegion (AI-angles spec §2.1, §2.2)', () => {
  const rail = () => createBoard({ name: 'Rail', length: 18, width: 3, thickness: 0.75 });
  const chamfer = (legFace: number, legAlong: number): AngleCut =>
    ({ id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace, legAlong }, rail()) });
  const miter = (b: Board, across: 'width' | 'thickness'): AngleCut =>
    ({ id: 'm', ...miterCut({ end: 'max', across, longSide: 'min', ratio: 1 }, b) });
  const whole = (b: Pick<Board, Dimension>): Region =>
    ({ length: [0, b.length], width: [0, b.width], thickness: [0, b.thickness] });
  const vol = (r: Region) => (r.length[1] - r.length[0]) * (r.width[1] - r.width[0]) * (r.thickness[1] - r.thickness[0]);
  const DIMS = ['length', 'width', 'thickness'] as const;
  const disjoint = (rs: Region[]) => rs.every((p, i) => rs.every((q, j) =>
    i === j || DIMS.some((d) => Math.min(p[d][1], q[d][1]) - Math.max(p[d][0], q[d][0]) <= 0)));
  // Every sampled point of every piece is on the KEPT side of the cut (never trusts removed wood).
  const kept = (b: Board, c: AngleCut, rs: Region[]) => {
    const h = keptHalfSpace(b, c)!;
    const f = [0, 0.5, 1];
    return rs.every((r) => f.every((u) => f.every((v) => f.every((w) => {
      const p = [r.length[0] + u * (r.length[1] - r.length[0]), r.width[0] + v * (r.width[1] - r.width[0]), r.thickness[0] + w * (r.thickness[1] - r.thickness[0])];
      return h.n[0] * p[0]! + h.n[1] * p[1]! + h.n[2] * p[2]! + h.d >= -1e-9;
    }))));
  };

  it('a chamfer: its two legs from its edge, all of the length', () => {
    expect(touchedRegion(rail(), chamfer(0.125, 0.25))).toEqual({ length: [0, 18], width: [2.875, 3], thickness: [0.5, 0.75] });
  });
  it('a miter: all of its across dimension, its run × ratio into the end', () => {
    expect(touchedRegion(rail(), miter(rail(), 'width'))).toEqual({ length: [15, 18], width: [0, 3], thickness: [0, 0.75] });
  });
  it('a taper read from its thin end: stations up to its start', () => {
    const c: AngleCut = { id: 't', ...taperCut({ face: 'width', from: 'min', end: 'max', start: 6, amount: 0.5 }) };
    expect(touchedRegion(rail(), c)).toEqual({ length: [12, 18], width: [0, 0.5], thickness: [0, 0.75] });
  });
  it('null for a cut that removes nothing (Review Focus 3)', () => {
    expect(touchedRegion(rail(), { ...chamfer(0.125, 0.25), points: [[0, -1], [1, -2]] })).toBeNull();
  });
  it('clamps a leg longer than its dimension (Review Focus 4)', () => {
    expect(touchedRegion(rail(), chamfer(5, 0.25))).toEqual({ length: [0, 18], width: [0, 3], thickness: [0.5, 0.75] });
  });
  it('splits a cell into disjoint pieces that never hold removed wood, and keep everything else', () => {
    const b = rail();
    const fromMin: AngleCut = { id: 'n', ...chamferCut({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'min', legFace: 0.25, legAlong: 0.125 }, b) };
    for (const c of [chamfer(0.125, 0.25), fromMin, miter(b, 'width')]) {
      const t = touchedRegion(b, c)!;
      const pieces = splitRegion(whole(b), t, c);
      expect(disjoint(pieces)).toBe(true);
      expect(kept(b, c, pieces)).toBe(true);
      expect(pieces.reduce((s, r) => s + vol(r), 0)).toBeCloseTo(vol(whole(b)) - vol(t), 12);
    }
  });
  it('the mitered end trusts nothing past its short point', () => {
    const b = rail();
    const c = miter(b, 'width');
    expect(splitRegion(whole(b), touchedRegion(b, c)!, c)).toEqual([{ length: [0, 15], width: [0, 3], thickness: [0, 0.75] }]);
  });
  it('a cell the touched box only touches on a face comes back alone, unchanged', () => {
    // The chamfer's strip starts at width 2.875: this cell ends exactly there (shares a face, no volume).
    const cell: Region = { length: [0, 18], width: [0, 2.875], thickness: [0, 0.75] };
    const c = chamfer(0.125, 0.25);
    expect(splitRegion(cell, touchedRegion(rail(), c)!, c)).toEqual([cell]);
  });
  it("a zero-length end slab (a taper's) on a mitered end is not trusted; one away from it is untouched", () => {
    const b = rail();
    const c = miter(b, 'thickness');
    const slab: Region = { length: [18, 18], width: [0, 3], thickness: [0, 0.75] };
    expect(splitRegion(slab, touchedRegion(b, c)!, c)).toEqual([]);
    const far: Region = { length: [0, 0], width: [0, 3], thickness: [0, 0.75] };
    expect(splitRegion(far, touchedRegion(b, c)!, c)).toEqual([far]);
  });
});
