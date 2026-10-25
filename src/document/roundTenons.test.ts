import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { Board } from './types';
import { TENON_FIELDS, copyTenon, hasTenons, lowerTenons, mirrorTenons, sameTenon, tenonAt, tenonValues, tenonsOf, withTenons } from './roundTenons';
import type { AngleCut, Band, CurveCut, HoleRow, ProfileCut, RoundTenon } from './types';
import { addedTenonFaults, endCutOf, shoulderAt, tenonFaults, tenonZone } from './roundTenons';
import { curveOutline } from './curves';
import { tenonFaultText } from './tenonText';

const min: RoundTenon = { id: 't1', end: 'min', diameter: 1, length: 1.5 };
const max: RoundTenon = { id: 't2', end: 'max', diameter: 1, length: 1.5 };

describe('round tenons: the stored form (round tenons spec §3.1)', () => {
  it('TENON_FIELDS covers every key but id', () => {
    expect(Object.keys(TENON_FIELDS).sort()).toEqual(Object.keys(min).filter((k) => k !== 'id').sort());
  });

  it('sameTenon ignores the id and nothing else; -0 is told apart', () => {
    const renamed: RoundTenon = { ...min, id: 'other' };
    expect(sameTenon(min, renamed)).toBe(true);
    for (const patch of [{ end: 'max' as const }, { diameter: 1.0000001 }, { length: 1.5000001 }]) {
      expect(sameTenon(min, { ...min, ...patch })).toBe(false);
    }
    expect(tenonValues({ end: 'min', diameter: 1, length: 0 })).not.toBe(tenonValues({ end: 'min', diameter: 1, length: -0 }));
  });

  it('copyTenon is a fresh, equal object', () => {
    const c = copyTenon(min);
    expect(c).toEqual(min);
    expect(c).not.toBe(min);
  });

  it('a part with no key reads as no tenons', () => {
    const b = createBoard({ name: 'Leg' });
    expect('tenons' in b).toBe(false);
    expect(tenonsOf(b)).toEqual([]);
    expect(hasTenons(b)).toBe(false);
    expect(tenonAt(b, 'min')).toBeUndefined();
  });

  it('withTenons(b, []) has no tenons key (never [] or undefined)', () => {
    const b = withTenons(createBoard({ name: 'Leg' }), [min]);
    const bare = withTenons(b, []);
    expect('tenons' in bare).toBe(false);
    expect('tenons' in withTenons(createBoard({ name: 'Leg' }), [])).toBe(false);
  });

  it('order is canonical: min first', () => {
    const b = withTenons(createBoard({ name: 'Leg' }), [max, min]);
    expect(b.tenons!.map((t) => t.end)).toEqual(['min', 'max']);
    expect(tenonAt(b, 'max')).toBe(max);
    expect(hasTenons(b)).toBe(true);
  });
});

describe('round tenons: mirrors (round tenons spec §3.1, inv 44)', () => {
  // Chiral: a tenon on the max end only, so a reflection along the length is not the part itself.
  const chiral = [max];
  const two: RoundTenon[] = [min, { ...max, diameter: 0.75 }];

  it('mirrorTenons twice is the identity', () => {
    const once = mirrorTenons(chiral, 'length');
    expect(once.map((t) => t.end)).toEqual(['min']);
    expect(once[0]).toEqual({ ...max, end: 'min' });
    expect(mirrorTenons(once, 'length')).toEqual(chiral);
    // Two tenons: the ends swap and the list is re-sorted, min first; twice is the original.
    const swapped = mirrorTenons(two, 'length');
    expect(swapped.map((t) => [t.id, t.end])).toEqual([['t2', 'min'], ['t1', 'max']]);
    expect(mirrorTenons(swapped, 'length')).toEqual(two);
  });

  it('across the width or thickness it returns the SAME array', () => {
    expect(mirrorTenons(chiral, 'width')).toBe(chiral);
    expect(mirrorTenons(two, 'thickness')).toBe(two);
  });

  it('lowerTenons: an untouched list maps back to the stored array; a changed tenon is lowered by the flip; none adds no key', () => {
    const stored = [max];
    // Through a length mirror the draft carries the reflection; lowered, it is the stored array itself.
    expect(lowerTenons(stored, { tenons: mirrorTenons(stored, 'length') }, 'length').tenons).toBe(stored);
    // Across the width the draft is the stored list as it stands (a fresh copy): still the stored array.
    expect(lowerTenons(stored, { tenons: stored.map(copyTenon) }, 'width').tenons).toBe(stored);
    // An edited tenon is lowered back through the flip, a fresh object.
    const edited = lowerTenons(stored, { tenons: [{ ...max, end: 'min', length: 2 }] }, 'length').tenons!;
    expect(edited).toEqual([{ ...max, length: 2 }]);
    expect(edited).not.toBe(stored);
    // A draft with no tenons adds nothing: its own key, present or absent, is the after-state's.
    expect('tenons' in lowerTenons(stored, {}, 'length')).toBe(false);
    expect('tenons' in lowerTenons(undefined, {}, 'length')).toBe(false);
    expect('tenons' in lowerTenons(stored, { tenons: [] }, 'length')).toBe(false);
  });
});

// ---- The zone and the faults (round tenons spec §3.2, §3.3) ----

const leg = (patch: Partial<Board> = {}) => createBoard({ name: 'Leg', length: 20, width: 2, thickness: 2, ...patch });
const tn = (end: 'min' | 'max', length: number, diameter = 1): RoundTenon => ({ id: `t-${end}`, end, diameter, length });
const kinds = (b: Board, t: RoundTenon) => tenonFaults(b, t).map((f) => f.kind + (f.feature ? `:${f.feature}` : ''));
const topMiter = (d0: number, d1: number): AngleCut => ({ id: 'm', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, d0], [2, d1]] });
const hole = (station: number): HoleRow => ({ id: 'h', face: 'width', from: 'min', diameter: 0.5, depth: 'through', along: 'length', alongFrom: 'min', station, count: 1, pitch: 0, acrossFrom: 'min', inset: 1 });

describe('round tenons: zone and shoulder', () => {
  it('a square end: the shoulder is L - length (max) or length (min); the zone is the slab to the end', () => {
    const b = leg();
    expect(shoulderAt(b, tn('max', 3))).toBe(17);
    expect(shoulderAt(b, tn('min', 3))).toBe(3);
    expect(tenonZone(b, tn('max', 3))).toEqual({ length: [17, 20], width: [0, 2], thickness: [0, 2] });
    expect(tenonZone(b, tn('min', 3)).length).toEqual([0, 3]);
  });
  it('a mitered end: the shoulder is length inward from where the miter meets the axis', () => {
    const b = leg({ angleCuts: [topMiter(0.25, 0.75)] });
    expect(shoulderAt(b, tn('max', 3))).toBeCloseTo(20 - 0.5 - 3, 12);
    expect(endCutOf(b, 'max')).toBe(b.angleCuts[0]);
    expect(endCutOf(b, 'min')).toBeNull();
  });
  it("endCutOf: a second cut or a bevel on the end is 'other'", () => {
    const bevel: AngleCut = { ...topMiter(0.25, 0.75), id: 'v', kind: 'bevel' };
    expect(endCutOf(leg({ angleCuts: [bevel] }), 'max')).toBe('other');
    expect(endCutOf(leg({ angleCuts: [topMiter(0.25, 0.75), { ...topMiter(0.1, 0.2), id: 'm2' }] }), 'max')).toBe('other');
  });
});

describe('round tenons: tenonFaults', () => {
  it('a clean tenon has none', () => {
    expect(kinds(leg(), tn('max', 3))).toEqual([]);
  });
  it('too-wide: at the bound faults, 1e-6 inside does not', () => {
    expect(kinds(leg(), tn('max', 3, 2))).toEqual(['too-wide']);
    expect(kinds(leg(), tn('max', 3, 2 - 1e-6))).toEqual([]);
    expect(kinds(leg(), tn('max', 3, 2 - 5e-10))).toEqual(['too-wide']); // inside the 1e-9 tolerance
    expect(kinds(leg({ width: 3 }), tn('max', 3, 2))).toEqual(['too-wide']);
  });
  it('too-long: the shoulders meeting fault, 1e-6 short does not', () => {
    const b = leg({ length: 3, tenons: [tn('min', 1.5)] });
    expect(kinds(b, tn('max', 1.5))).toContain('too-long');
    expect(kinds(b, tn('max', 1.5 - 1e-6))).not.toContain('too-long');
    expect(kinds(b, tn('max', 1.5 - 5e-10))).toContain('too-long');
  });
  it('too-long alone: the shoulder at or past the far end', () => {
    expect(kinds(leg({ length: 3 }), tn('max', 3))).toContain('too-long');
    expect(kinds(leg({ length: 3 }), tn('max', 3 - 1e-6))).not.toContain('too-long');
    expect(kinds(leg({ length: 3 }), tn('min', 3))).toContain('too-long');
  });
  it('a levelled top: a tenon long enough clears, one too short reaches the shoulder; the boundary faults', () => {
    const b = leg({ angleCuts: [topMiter(0.25, 0.75)] }); // 14-degree-ish: centre 0.5, deepest 0.75
    expect(kinds(b, tn('max', 0.5))).toEqual([]);
    expect(kinds(b, tn('max', 0.25))).toEqual(['cut-reaches-shoulder']);
    expect(kinds(b, tn('max', 0.25 + 1e-6))).toEqual([]);
    expect(kinds(b, tn('max', 0.25 + 5e-10))).toEqual(['cut-reaches-shoulder']);
    expect(kinds(b, tn('max', 0.1))).toEqual(['cut-reaches-shoulder']);
  });
  it('a real 14 degree miter', () => {
    const r = Math.tan((14 * Math.PI) / 180);
    const b = leg({ angleCuts: [topMiter(0.2, 0.2 + 2 * r)] });
    expect(kinds(b, tn('max', 2))).toEqual([]);
    expect(kinds(b, tn('max', r))).toEqual(['cut-reaches-shoulder']);
  });
  it('a square end can never reach the shoulder', () => {
    expect(kinds(leg(), tn('max', 1e-6))).toEqual([]);
  });
  it('the miter on the OTHER end is not this tenon\'s tip', () => {
    const b = leg({ angleCuts: [{ ...topMiter(0.25, 0.75), from: 'min' }] });
    expect(kinds(b, tn('max', 0.1))).toEqual([]);
  });
  it('a rectangular cut in the zone is meets-feature:cut; one that just clears is not', () => {
    const cut = (offset: number) => ({ id: 'c', face: 'thickness' as const, from: 'min' as const, across: 'width' as const, offset, width: 1, depth: 0.5, stopMin: 0, stopMax: 0 });
    expect(kinds(leg({ cuts: [cut(18)] }), tn('max', 3))).toEqual(['meets-feature:cut']);
    expect(kinds(leg({ cuts: [cut(16)] }), tn('max', 3))).toEqual([]);
    expect(kinds(leg({ cuts: [cut(16 + 1e-6)] }), tn('max', 3))).toEqual(['meets-feature:cut']);
  });
  it('a hole in the shoulder region is clear; one in the zone is meets-feature:hole', () => {
    expect(kinds(leg({ holes: [hole(10)] }), tn('max', 3))).toEqual([]);
    expect(kinds(leg({ holes: [hole(18)] }), tn('max', 3))).toEqual(['meets-feature:hole']);
  });
  it('a taper on the far half is clear; one reaching the end is an angle-cut feature', () => {
    const taper = (points: AngleCut['points']): AngleCut => ({ id: 'tp', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points });
    expect(kinds(leg({ angleCuts: [taper([[10, 0], [20, 0.5]])] }), tn('min', 3))).toEqual([]);
    expect(kinds(leg({ angleCuts: [taper([[0, 0.5], [10, 0]])] }), tn('min', 3))).toEqual(['meets-feature:angle-cut']);
  });
  it("an 'other' end cut and a stray cut elsewhere both read as an angle cut", () => {
    const bevel: AngleCut = { ...topMiter(0.25, 0.75), kind: 'bevel' };
    expect(kinds(leg({ angleCuts: [bevel] }), tn('max', 3))).toEqual(['meets-feature:angle-cut']);
  });
  it('a curve, a profile and a band in the zone', () => {
    const curve: CurveCut = { id: 'cv', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [18, 0], segments: [{ type: 'line', to: [20, 0] }, { type: 'line', to: [20, 1] }, { type: 'line', to: [18, 0] }] };
    const profile: ProfileCut = { id: 'p', face: 'max', kind: 'roundover', size: 0.25, facing: 'face', run: { start: { side: { across: 'width', from: 'min' }, through: 'min' }, end: { side: { across: 'width', from: 'min' }, through: 'max' } } };
    const band: Band = { side: { across: 'width', from: 'min' }, type: 'x' };
    expect(kinds(leg({ curves: [curve] }), tn('max', 3))).toContain('meets-feature:curve');
    expect(kinds(leg({ profiles: [profile] }), tn('max', 3))).toEqual(['meets-feature:profile']);
    expect(kinds(leg({ bands: [band] }), tn('max', 3))).toEqual(['meets-feature:band']);
  });
  it('the fault copy is verbatim', () => {
    expect(tenonFaultText({ kind: 'too-wide' })).toBe("A round tenon must be narrower than the part's section.");
    expect(tenonFaultText({ kind: 'too-long' })).toBe('The tenons would meet — shorten one.');
    expect(tenonFaultText({ kind: 'cut-reaches-shoulder' })).toBe("The end's cut reaches the shoulder — lengthen the tenon.");
    expect(tenonFaultText({ kind: 'meets-feature', feature: 'cut' })).toBe('The tenon would run into a rectangular cut — move it or remove it first.');
    expect(tenonFaultText({ kind: 'meets-feature', feature: 'angle-cut' })).toContain('an angle cut');
    expect(tenonFaultText({ kind: 'meets-feature', feature: 'band' })).toContain('a band');
  });
});

describe('round tenons: addedTenonFaults (the edit rule)', () => {
  it('only faults the edit adds; a kept fault is not added; a removed tenon adds none', () => {
    const bad = leg({ tenons: [tn('max', 3, 2)] });
    expect(addedTenonFaults(bad, withTenons(bad, [tn('max', 4, 2)]), 'max')).toEqual([]);
    expect(addedTenonFaults(bad, withTenons(bad, [tn('max', 20, 2)]), 'max').map((f) => f.kind)).toEqual(['too-long']);
    expect(addedTenonFaults(leg(), withTenons(leg(), [tn('max', 3, 2)]), 'max').map((f) => f.kind)).toEqual(['too-wide']);
    expect(addedTenonFaults(bad, leg(), 'max')).toEqual([]);
  });
});

describe('round tenons: fix round 1 (review of Task 3)', () => {
  const side = { across: 'width' as const, from: 'min' as const };
  const stopped = (at: number): ProfileCut => ({ id: 'p', face: 'max', kind: 'roundover', size: 0.25, facing: 'face', run: { start: { side, through: 'min' }, end: { side, from: 'min', at } } });
  it('a profile stopped just short of the shoulder whose run-out enters the zone is meets-feature', () => {
    expect(kinds(leg({ profiles: [stopped(16.9)] }), tn('max', 3))).toEqual(['meets-feature:profile']);
    expect(kinds(leg({ profiles: [stopped(5)] }), tn('max', 3))).toEqual([]);
  });
  it("a curve whose ARC (not its chords) enters the zone is meets-feature", () => {
    // an arc bulging toward +length: its apex is at x0 + 0.3 = 17.004, just past the zone start at 17
    const arc = (x0: number): CurveCut => ({ id: 'cv', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [x0, 0.5],
      segments: [{ type: 'arc', to: [x0, 1.5], side: 'right', rise: 0.3 }, { type: 'line', to: [x0, 0.5] }] });
    const part = leg({ curves: [arc(16.704)] });
    const chordMax = Math.max(...curveOutline(part, part.curves[0]!).pts.map((p) => p[0]));
    expect(chordMax).toBeLessThan(17); // the chord vertices stop short of the zone ...
    expect(kinds(part, tn('max', 3))).toEqual(['meets-feature:curve']); // ... the arc does not
    expect(kinds(leg({ curves: [arc(16.6)] }), tn('max', 3))).toEqual([]);
  });
  it('an end miter that reaches depth 0 inside the section (a corner clip) keeps the zone inside the part', () => {
    const b = leg({ angleCuts: [topMiter(-1, 0.5)] }); // depth 0 at 1.33 of 2: the centre extrapolates to -0.25
    expect(shoulderAt(b, tn('max', 3))).toBe(17);
    const clip = leg({ angleCuts: [topMiter(-1, 0.5)], holes: [hole(16.9)] });
    expect(kinds(clip, tn('max', 3))).toContain('meets-feature:hole');
  });
  it('a mitered min end, and a miter stored with alongFrom max', () => {
    const lo: AngleCut = { id: 'm', kind: 'miter', face: 'length', from: 'min', along: 'width', alongFrom: 'min', points: [[0, 0.25], [2, 0.75]] };
    const b = leg({ angleCuts: [lo] });
    expect(shoulderAt(b, tn('min', 3))).toBeCloseTo(3.5, 12);
    expect(kinds(b, tn('min', 0.5))).toEqual([]);
    expect(kinds(b, tn('min', 0.25))).toEqual(['cut-reaches-shoulder']);
    const hi: AngleCut = { ...topMiter(0.75, 0.25), alongFrom: 'max' }; // the same plane as (0.25, 0.75) from min
    const c = leg({ angleCuts: [hi] });
    expect(shoulderAt(c, tn('max', 3))).toBeCloseTo(16.5, 12);
    expect(kinds(c, tn('max', 0.5))).toEqual([]);
    expect(kinds(c, tn('max', 0.25))).toEqual(['cut-reaches-shoulder']);
  });
});
