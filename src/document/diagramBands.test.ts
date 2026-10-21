import { describe, expect, it } from 'vitest';
import { buildDiagrams, stripDiagrams } from './diagram';
import { bandLine } from './bandText';
import { createBoard } from './document';
import { BAND_SIDES, BUILT_IN_BAND, stripBoard, strips } from './banding';
import type { Band, BandType } from './types';
import { IMPERIAL } from '../units/length';

const maple: BandType = { id: 'm', name: 'Maple edging 1/4"', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const types: BandType[] = [BUILT_IN_BAND, maple];
const [W0, W1, L0, L1] = BAND_SIDES;
const all = (type: string): Band[] => BAND_SIDES.map((side) => ({ side, type }));
const top = (bands: Band[], over: object = {}) =>
  ({ ...createBoard({ id: 'top', name: 'Top', length: 36, width: 20, thickness: 0.75, material: 'maple' }), bands, cornerRule: 'mitre' as const, ...over });
const thick = (board: ReturnType<typeof top>, bt = types) => buildDiagrams(board, IMPERIAL, bt).filter((v) => v.face === 'thickness');

describe('part diagrams of banded parts (edge banding 2, Q1)', () => {
  it('a banded part opens a thickness view with marks, at the finished size', () => {
    const v = buildDiagrams(top(all('m')), IMPERIAL, types).find((x) => x.key === 'thickness|min')!;
    expect(v.hLabel).toBe('36"');
    expect(v.vLabel).toBe('20"');
    expect(v.bands).toHaveLength(4);
    const by = (i: number) => v.bands!.find((b) => b.side.across === BAND_SIDES[i]!.across && b.side.from === BAND_SIDES[i]!.from)!;
    expect(by(0).points).toEqual([[0, 0], [36, 0]]);
    expect(by(3).points).toEqual([[36, 0], [36, 20]]);
    expect(by(1).points).toEqual([[36, 20], [0, 20]]);
    expect(by(2).points).toEqual([[0, 20], [0, 0]]);
  });

  it('notes: the band line, then the core note; tape alone is the band line only', () => {
    const p = top(all('m'));
    const v = buildDiagrams(p, IMPERIAL, types).find((x) => x.key === 'thickness|min')!;
    expect(v.bandNotes).toEqual([bandLine(p, types, IMPERIAL), 'Drawn at the finished size; cut 35-1/2" × 19-1/2" before banding.']);
    const tape = top([{ side: W0!, type: BUILT_IN_BAND.id }]);
    const tv = buildDiagrams(tape, IMPERIAL, types).find((x) => x.key === 'thickness|min')!;
    expect(tv.bandNotes).toEqual([bandLine(tape, types, IMPERIAL)]);
    expect(tv.bands).toHaveLength(1);
  });

  it('notes ride on the first thickness view only; every thickness view gets the marks', () => {
    const p = top([{ side: W0!, type: 'm' }], { cuts: [{ id: 'c', face: 'thickness', from: 'max', across: 'width', offset: 5, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 },
      { id: 'd', face: 'thickness', from: 'min', across: 'width', offset: 10, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 }] });
    const t = thick(p);
    expect(t.map((v) => v.key)).toEqual(['thickness|min', 'thickness|max']);
    expect(t.every((v) => v.bands!.length === 1)).toBe(true);
    expect(t[0]!.bandNotes).toBeDefined();
    expect(t[1]!.bandNotes).toBeUndefined();
  });

  it('a part with a hole elsewhere still gets a thickness view', () => {
    const p = top([{ side: W0!, type: 'm' }], { holes: [{ id: 'h', face: 'width', from: 'min', diameter: 0.25, depth: 0.25, count: 1, pitch: 0, along: 'length', alongFrom: 'min', alongOffset: 5, acrossFrom: 'min', acrossOffset: 0.375 }] });
    const views = buildDiagrams(p, IMPERIAL, types);
    expect(views.some((v) => v.face === 'width')).toBe(true);
    const t = views.find((v) => v.key === 'thickness|min')!;
    expect(t.bands).toHaveLength(1);
    expect(t.bandNotes).toBeDefined();
    expect(views.filter((v) => v.face !== 'thickness').every((v) => v.bands === undefined && v.bandNotes === undefined)).toBe(true);
  });

  it('a faulted band is not marked and its band line ends in the check', () => {
    // the two opposite long edges leave no core: both fault too-thick
    const thin = { ...maple, id: 't', thickness: 10 };
    const p = top([{ side: W0!, type: 't' }, { side: W1!, type: 't' }, { side: L1!, type: 'm' }]);
    const v = buildDiagrams(p, IMPERIAL, [BUILT_IN_BAND, maple, thin]).find((x) => x.key === 'thickness|min')!;
    expect(v.bands).toHaveLength(1);
    expect(v.bands![0]!.side).toEqual(L1);
    expect(v.bandNotes![0]).toContain('— check: leaves no core');
  });

  it('no band types given: today\'s output, no band keys', () => {
    const p = top(all('m'));
    const bare = buildDiagrams(p, IMPERIAL);
    expect(bare).toEqual(buildDiagrams({ ...p, bands: [] }, IMPERIAL));
    for (const v of bare) { expect('bands' in v).toBe(false); expect('bandNotes' in v).toBe(false); expect('mitres' in v).toBe(false); }
  });

  it('a part with no bands, types given: no band keys', () => {
    for (const v of buildDiagrams(top([]), IMPERIAL, types)) { expect('bands' in v).toBe(false); expect('bandNotes' in v).toBe(false); }
  });
});

describe('a strip\'s diagram (Q7)', () => {
  const tabletop = top(all('m'));
  const strip = strips(tabletop, types).find((s) => s.side.across === 'width' && s.side.from === 'min')!;

  it('draws each mitred end\'s waste: long point on v = 0 half the allowance in, short point on v = width', () => {
    const views = stripDiagrams(strip, IMPERIAL);
    expect(views).toHaveLength(1);
    const [m0, m1] = views[0]!.mitres!;
    const want0 = [[0, 0], [0.25, 0], [0.5, 0.25], [0, 0.25]];
    const want1 = [[36.5, 0], [36.25, 0], [36, 0.25], [36.5, 0.25]];
    for (const [got, want] of [[m0!.poly, want0], [m1!.poly, want1]] as const) {
      expect(got).toHaveLength(4);
      got.forEach((p, i) => { expect(p[0]).toBeCloseTo(want[i]![0]!, 9); expect(p[1]).toBeCloseTo(want[i]![1]!, 9); });
    }
    expect(views[0]!.h).toBe(36.5);
  });

  it('one mitred end draws one polygon, at THAT end (final review 5)', () => {
    const same = (got: readonly (readonly number[])[], want: number[][]) => {
      expect(got).toHaveLength(want.length);
      got.forEach((p, i) => { expect(p[0]).toBeCloseTo(want[i]![0]!, 9); expect(p[1]).toBeCloseTo(want[i]![1]!, 9); });
    };
    // The far end (h = the cut length, 36.5) mitred, the near square: one polygon, at h = 36.5.
    const far = stripDiagrams({ ...strip, ends: [{ mitre: null }, strip.ends[1]] } as typeof strip, IMPERIAL)[0]!.mitres!;
    expect(far).toHaveLength(1);
    same(far[0]!.poly, [[36.5, 0], [36.25, 0], [36, 0.25], [36.5, 0.25]]);
    // The near end (h = 0) mitred, the far square: one polygon, at h = 0.
    const near = stripDiagrams({ ...strip, ends: [strip.ends[0], { mitre: null }] } as typeof strip, IMPERIAL)[0]!.mitres!;
    expect(near).toHaveLength(1);
    same(near[0]!.poly, [[0, 0], [0.25, 0], [0.5, 0.25], [0, 0.25]]);
  });

  it('a square-ended strip equals chunk 1\'s diagram exactly', () => {
    const sq = strips(top([{ side: W0!, type: 'm' }, { side: W1!, type: 'm' }], { cornerRule: 'long', hardware: [] }), types)[0]!;
    expect(sq.ends).toEqual([{ mitre: null }, { mitre: null }]);
    expect(stripDiagrams(sq, IMPERIAL)).toEqual(buildDiagrams(stripBoard(sq), IMPERIAL));
    expect(L0).toBeDefined();
  });
});
