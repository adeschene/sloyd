import { describe, expect, it } from 'vitest';
import {
  BAND_SIDES, BUILT_IN_BAND, BUILT_IN_BAND_ID, bandOn, canonicalBands, copyBand, mirrorBands, newBandType, sameBands,
  sameBandType, withBands,
} from './bandModel';
import { createBoard, createDocument } from './document';
import { sameShared } from './links';
import type { Band, BandType, ProfileSide } from './types';
import { bandFaults, bandFaultText, bandSignature, coreSize, cutStock, glueLines, sameSide, stripBoard, strips, tapeRuns } from './banding';
import { archCurve, cornerCurve } from './curves';

const W0: ProfileSide = { across: 'width', from: 'min' };
const W1: ProfileSide = { across: 'width', from: 'max' };
const L0: ProfileSide = { across: 'length', from: 'min' };
const L1: ProfileSide = { across: 'length', from: 'max' };

describe('the band model (edge banding spec §2)', () => {
  it('a new document carries exactly the built-in band type; a new part has no bands and the default corner rule', () => {
    expect(createDocument('T').bandTypes).toEqual([BUILT_IN_BAND]);
    expect(BUILT_IN_BAND).toEqual({ id: BUILT_IN_BAND_ID, name: 'Iron-on veneer', kind: 'tape', thickness: 0,
      lengthAllowance: 0.5, tapeWidth: 0.875, pricePerFoot: null });
    const b = createBoard({});
    expect(b.bands).toEqual([]);
    expect(b.cornerRule).toBe('long');
  });
  it('canonical order is width min, width max, length min, length max; one band per side, the first wins', () => {
    expect(BAND_SIDES).toEqual([W0, W1, L0, L1]);
    const out = canonicalBands([{ side: L1, type: 'a' }, { side: W0, type: 'b' }, { side: L1, type: 'c' }]);
    expect(out).toEqual([{ side: W0, type: 'b' }, { side: L1, type: 'a' }]);
  });
  it('withBands sets, replaces and clears sides, in canonical order', () => {
    const one = withBands([], [L1, W0], 'x');
    expect(one).toEqual([{ side: W0, type: 'x' }, { side: L1, type: 'x' }]);
    expect(withBands(one, [W0], 'y')).toEqual([{ side: W0, type: 'y' }, { side: L1, type: 'x' }]);
    expect(withBands(one, [L1], null)).toEqual([{ side: W0, type: 'x' }]);
    expect(bandOn(one, L1)).toEqual({ side: L1, type: 'x' });
    expect(bandOn(one, W1)).toBeUndefined();
  });
  it('a mirror flips from on the sides across the mirrored dimension only, and re-sorts', () => {
    const bands: Band[] = [{ side: W0, type: 'a' }, { side: L1, type: 'b' }];
    expect(mirrorBands(bands, 'width')).toEqual([{ side: W1, type: 'a' }, { side: L1, type: 'b' }]);
    expect(mirrorBands(bands, 'length')).toEqual([{ side: W0, type: 'a' }, { side: L0, type: 'b' }]);
    expect(mirrorBands(bands, 'thickness')).toEqual(bands);
    expect(mirrorBands(mirrorBands(bands, 'width'), 'width')).toEqual(bands);
  });
  it('copies share no side object', () => {
    const b: Band = { side: W0, type: 'a' };
    const c = copyBand(b);
    expect(c).toEqual(b);
    expect(c.side).not.toBe(b.side);
  });
  it('sameBands compares in order, every field exactly', () => {
    const a: Band[] = [{ side: W0, type: 'a' }];
    expect(sameBands(a, [{ side: { ...W0 }, type: 'a' }])).toBe(true);
    expect(sameBands(a, [{ side: W1, type: 'a' }])).toBe(false);
    expect(sameBands(a, [{ side: W0, type: 'b' }])).toBe(false);
    expect(sameBands(a, [])).toBe(false);
  });
  it('Link compares bands and the corner rule (both shared, inv 45)', () => {
    const a = { ...createBoard({ id: 'a' }), bands: [{ side: W0, type: 'x' }] };
    expect(sameShared(a, { ...a, bands: [{ side: { ...W0 }, type: 'x' }] })).toBe(true);
    expect(sameShared(a, { ...a, bands: [{ side: W1, type: 'x' }] })).toBe(false);
    expect(sameShared(a, { ...a, cornerRule: 'mitre' })).toBe(false);
  });
  it('newBandType: tape and solid defaults, a unique name', () => {
    const t = newBandType('tape', [BUILT_IN_BAND]);
    expect(t).toMatchObject({ kind: 'tape', name: 'Tape', thickness: 0, lengthAllowance: 0.5, tapeWidth: 0.875, pricePerFoot: null });
    const s = newBandType('solid', [BUILT_IN_BAND]);
    expect(s).toMatchObject({ kind: 'solid', name: 'Solid edging', thickness: 0.25, lengthAllowance: 0.5, widthAllowance: 0.0625, material: 'maple' });
    expect(newBandType('solid', [BUILT_IN_BAND, s]).name).toBe('Solid edging 2');
    expect(t.id).not.toBe(s.id);
    expect(sameBandType(s, { ...s })).toBe(true);
    expect(sameBandType(s, { ...s, thickness: 0.5 })).toBe(false);
  });
});

describe('the arithmetic (edge banding spec §3)', () => {
  const maple = (t = 0.25): BandType => ({ id: 'm', name: 'Maple edging', kind: 'solid', thickness: t, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 });
  const walnut = (t = 0.5): BandType => ({ id: 'w', name: 'Walnut edging', kind: 'solid', thickness: t, lengthAllowance: 0.5, material: 'walnut', widthAllowance: 0.0625 });
  const types = (...extra: BandType[]): BandType[] => [BUILT_IN_BAND, ...extra];
  const shelf = (bands: Band[], cornerRule: 'long' | 'ends' | 'mitre' = 'long', over: object = {}) =>
    ({ ...createBoard({ id: 'p', name: 'Shelf', length: 30, width: 12, thickness: 0.75, material: 'plywood' }), bands, cornerRule, ...over });
  const all = (type: string) => BAND_SIDES.map((side) => ({ side, type }));

  it('a part with no bands: core is its own size, no strips, no tape, no signature', () => {
    const p = shelf([]);
    expect(coreSize(p, types())).toEqual({ length: 30, width: 12, thickness: 0.75 });
    expect(strips(p, types())).toEqual([]);
    expect(tapeRuns(p, types())).toEqual([]);
    expect(bandSignature(p, types())).toBe('');
  });
  it('core subtracts each banded side\'s thickness, whatever the corner rule', () => {
    for (const rule of ['long', 'ends', 'mitre'] as const) {
      expect(coreSize(shelf(all('m'), rule), types(maple())), rule).toEqual({ length: 29.5, width: 11.5, thickness: 0.75 });
    }
    expect(coreSize(shelf([{ side: W0, type: 'm' }, { side: L1, type: 'w' }]), types(maple(), walnut()))).toEqual({ length: 29.5, width: 11.75, thickness: 0.75 });
    expect(coreSize(shelf(all(BUILT_IN_BAND_ID)), types())).toEqual({ length: 30, width: 12, thickness: 0.75 });
  });
  it('long edges run through: long strips are the full length, ends lose the long bands\' thickness', () => {
    const s = strips(shelf(all('m'), 'long'), types(maple()));
    const by = (side: ProfileSide) => s.find((x) => x.side.across === side.across && x.side.from === side.from)!;
    expect(by(W0).finished).toBe(30);
    expect(by(L0).finished).toBe(11.5);
    expect(by(W0).length).toBe(30.5);
    expect(by(W0).width).toBe(0.25);
    expect(by(W0).thickness).toBe(0.8125);
    expect(by(W0).ends).toEqual([{ mitre: null }, { mitre: null }]);
  });
  it('ends run through: the mirror image', () => {
    const s = strips(shelf(all('m'), 'ends'), types(maple()));
    expect(s.find((x) => x.side.across === 'width')!.finished).toBe(29.5);
    expect(s.find((x) => x.side.across === 'length')!.finished).toBe(12);
  });
  it('mitred: full side lengths, a mitre only where the neighbour has thickness, atan(n / t) from square', () => {
    const s = strips(shelf([{ side: W0, type: 'm' }, { side: L1, type: 'w' }], 'mitre'), types(maple(0.25), walnut(0.5)));
    const long = s.find((x) => sameSide(x.side, W0))!;
    const end = s.find((x) => sameSide(x.side, L1))!;
    expect(long.finished).toBe(30);
    expect(long.ends[0]).toEqual({ mitre: null });                    // the length-min end has no band
    expect(long.ends[1]!.mitre).toBeCloseTo(Math.atan(0.5 / 0.25), 12);
    expect(end.finished).toBe(12);
    expect(end.ends[0]!.mitre).toBeCloseTo(Math.atan(0.25 / 0.5), 12);   // width-min neighbour
    expect(end.ends[1]).toEqual({ mitre: null });
  });
  it('a zero-thickness neighbour never shortens a strip or makes a mitre', () => {
    const s = strips(shelf([{ side: W0, type: 'm' }, { side: L0, type: BUILT_IN_BAND_ID }], 'ends'), types(maple()));
    expect(s).toHaveLength(1);
    expect(s[0]!.finished).toBe(30);
  });
  it('tape: a straight side is its dimension plus the allowance; no strips', () => {
    const p = shelf([{ side: W0, type: BUILT_IN_BAND_ID }, { side: L1, type: BUILT_IN_BAND_ID }]);
    expect(tapeRuns(p, types()).map((r) => r.length)).toEqual([30.5, 12.5]);
    expect(strips(p, types())).toEqual([]);
  });
  it('tape round an arch: the side\'s TRUE outline length (Review Focus 3)', () => {
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 2 }) };
    const p = shelf([{ side: W0, type: BUILT_IN_BAND_ID }], 'long', { curves: [arch] });
    const r = 12 ** 2 / (2 * 2) + 2 / 2;               // chord 24, rise 2: r = (c/2)²/(2h) + h/2
    const half = Math.asin(12 / r);
    const expected = 3 + 2 * r * half + 3;              // the straight ends and the true arc
    expect(tapeRuns(p, types())[0]!.length).toBeCloseTo(expected + 0.5, 9);
  });
  it('a rounded corner between two taped sides is bought once: half each (Review Focus 3)', () => {
    const corner = { id: 'c1', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'max', radius: 2 }) };
    const both = shelf([{ side: W1, type: BUILT_IN_BAND_ID }, { side: L1, type: BUILT_IN_BAND_ID }], 'long', { curves: [corner] });
    const runs = tapeRuns(both, types());
    const total = runs.reduce((n, r) => n + r.length, 0);
    expect(total).toBeCloseTo((30 - 2) + (12 - 2) + (Math.PI * 2) / 2 + 2 * 0.5, 9);
    const one = tapeRuns(shelf([{ side: W1, type: BUILT_IN_BAND_ID }], 'long', { curves: [corner] }), types());
    expect(one[0]!.length).toBeCloseTo((30 - 2) + (Math.PI * 2) / 2 + 0.5, 9);
  });
  it('a corner shared with a FAULTED tape side is bought in full by the unfaulted one', () => {
    const corner = { id: 'c1', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'max', radius: 2 }) };
    const wide: BandType = { id: 'wide', name: 'Wide tape', kind: 'tape', thickness: 0, lengthAllowance: 0.5, tapeWidth: 2, pricePerFoot: null };
    const p = shelf([{ side: W1, type: 'wide' }, { side: L1, type: BUILT_IN_BAND_ID }], 'long', { curves: [corner], thickness: 1 });
    expect(bandFaults(p, types(wide))).toEqual([{ side: L1, kind: 'tape-narrow' }]);
    const runs = tapeRuns(p, types(wide));
    expect(runs).toHaveLength(1);
    expect(runs[0]!.length).toBeCloseTo((30 - 2) + (Math.PI * 2) / 2 + 0.5, 9);
  });
  it('faults: needs-straight, too-thick, tape-narrow; a faulted band adds nothing', () => {
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 2 }) };
    const onArch = shelf([{ side: W0, type: 'm' }], 'long', { curves: [arch] });
    expect(bandFaults(onArch, types(maple()))).toEqual([{ side: W0, kind: 'needs-straight' }]);
    expect(coreSize(onArch, types(maple())).width).toBe(12);
    expect(strips(onArch, types(maple()))).toEqual([]);
    const thick = shelf([{ side: W0, type: 'm' }, { side: W1, type: 'm' }], 'long', { width: 0.5 });
    expect(bandFaults(thick, types(maple()))).toEqual([{ side: W0, kind: 'too-thick' }, { side: W1, kind: 'too-thick' }]);
    const narrow = shelf([{ side: W0, type: BUILT_IN_BAND_ID }], 'long', { thickness: 1 });
    expect(bandFaults(narrow, types()).map((f) => f.kind)).toEqual(['tape-narrow']);
    expect(tapeRuns(narrow, types())).toEqual([]);
    expect(bandFaultText('needs-straight')).toBe('needs a straight edge');
  });
  it('too-thick is carried only by a band WITH thickness: a tape band opposite is spared and keeps its run', () => {
    const p = shelf([{ side: W0, type: 'm' }, { side: W1, type: BUILT_IN_BAND_ID }], 'long', { width: 0.25 });
    expect(bandFaults(p, types(maple()))).toEqual([{ side: W0, kind: 'too-thick' }]);
    expect(tapeRuns(p, types(maple())).map((r) => [r.side, r.length])).toEqual([[W1, 30.5]]);
  });
  it('the memo is keyed on the band types too (Review Focus 2): a thickness edit re-sizes the core', () => {
    const p = shelf(all('m'));
    expect(coreSize(p, types(maple(0.25))).width).toBe(11.5);
    expect(coreSize(p, types(maple(0.5))).width).toBe(11);
  });
  it('cutStock: parts at core size, then each strip as a plain solid part', () => {
    const p = shelf(all('m'));
    const out = cutStock({ boards: [p], bandTypes: types(maple()) });
    expect(out[0]).toMatchObject({ id: 'p', length: 29.5, width: 11.5 });
    expect(out[0]!.bands).toEqual([]);                                // a core copy is never re-banded
    expect(out.slice(1).map((b) => [b.material, b.length, b.width, b.thickness, b.grain])).toEqual([
      ['maple', 30.5, 0.25, 0.8125, 'length'], ['maple', 30.5, 0.25, 0.8125, 'length'],
      ['maple', 12, 0.25, 0.8125, 'length'], ['maple', 12, 0.25, 0.8125, 'length'],
    ]);
    expect(stripBoard(strips(p, types(maple()))[0]!).name).toBe('Shelf edging (width min side)');
  });
  it('bandSignature: sides and type ids, exact; the corner rule only where a corner qualifies (final review 1)', () => {
    const ty = types(maple());
    const corner = [{ side: W0, type: 'm' }, { side: L0, type: 'm' }];
    expect(bandSignature(shelf(corner), ty)).not.toBe(bandSignature(shelf(corner, 'mitre'), ty));
    expect(bandSignature(shelf([{ side: W0, type: 'm' }]), ty)).toBe(bandSignature(shelf([{ side: W0, type: 'm' }], 'mitre'), ty));
    expect(bandSignature(shelf([{ side: W0, type: 'm' }]), ty)).not.toBe(bandSignature(shelf([{ side: W1, type: 'm' }]), ty));
  });
});

describe('glueLines (edge banding chunk 2, Q4/Q5)', () => {
  const maple: BandType = { id: 'maple', name: 'Maple edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
  const tape16: BandType = { id: 'tape16', name: 'Tape 1/16', kind: 'tape', thickness: 1 / 16, lengthAllowance: 0.5, tapeWidth: 0.875, pricePerFoot: null };
  const types: BandType[] = [BUILT_IN_BAND, maple, tape16];
  const part = (bands: Band[], cornerRule: 'long' | 'ends' | 'mitre' = 'long', over: object = {}) =>
    ({ ...createBoard({ id: 'p', name: 'Panel', length: 36, width: 20, thickness: 0.75, material: 'plywood' }), bands, cornerRule, ...over });
  const solid = (...sides: ProfileSide[]): Band[] => sides.map((side) => ({ side, type: 'maple' }));
  const four = solid(...BAND_SIDES);
  // [length, width, thickness]
  const at = (g: { side: ProfileSide; a: { length: number; width: number; thickness: number }; b: { length: number; width: number; thickness: number } }) => ({
    side: `${g.side.across}-${g.side.from}`,
    a: [g.a.length, g.a.width, g.a.thickness], b: [g.b.length, g.b.width, g.b.thickness],
  });
  const line = (side: string, a: number[], b: number[]) => ({ side, a, b });
  const both = (side: string, a: [number, number], b: [number, number]) =>
    [0, 0.75].map((th) => line(side, [a[0], a[1], th], [b[0], b[1], th]));

  it('long rule, four solid sides: long strips run through, end strips give way (8 lines, run at 0 then at thickness)', () => {
    const g = glueLines(part(four, 'long'), types);
    expect(g).toHaveLength(8);
    expect(g.map(at)).toEqual([
      ...both('width-min', [0, 0.25], [36, 0.25]),
      ...both('width-max', [0, 19.75], [36, 19.75]),
      ...both('length-min', [0.25, 0.25], [0.25, 19.75]),
      ...both('length-max', [35.75, 0.25], [35.75, 19.75]),
    ]);
    expect(g.every((l) => l.type === 'maple')).toBe(true);
  });
  it('ends rule: the mirror image', () => {
    const g = glueLines(part(four, 'ends'), types).map(at);
    expect(g).toHaveLength(8);
    expect(g.slice(0, 2)).toEqual(both('width-min', [0.25, 0.25], [35.75, 0.25]));
    expect(g.slice(4, 6)).toEqual(both('length-min', [0.25, 0], [0.25, 20]));
  });
  it('mitre rule: core corner to core corner, plus a mitre line on each long strip end only', () => {
    const g = glueLines(part(four, 'mitre'), types);
    expect(g).toHaveLength(16);
    const m = g.map(at);
    // width-min: run, then end 0 and end 1 mitre lines
    expect(m.slice(0, 2)).toEqual(both('width-min', [0.25, 0.25], [35.75, 0.25]));
    expect(m.slice(2, 4)).toEqual(both('width-min', [0.25, 0.25], [0, 0]));
    expect(m.slice(4, 6)).toEqual(both('width-min', [35.75, 0.25], [36, 0]));
    expect(m.slice(6, 8)).toEqual(both('width-max', [0.25, 19.75], [35.75, 19.75]));
    expect(m.slice(8, 10)).toEqual(both('width-max', [0.25, 19.75], [0, 20]));
    expect(m.slice(10, 12)).toEqual(both('width-max', [35.75, 19.75], [36, 20]));
    // end strips: a run line each, no mitre lines
    expect(m.slice(12, 14)).toEqual(both('length-min', [0.25, 0.25], [0.25, 19.75]));
    expect(m.slice(14, 16)).toEqual(both('length-max', [35.75, 0.25], [35.75, 19.75]));
    expect(m.filter((l) => l.side.startsWith('length'))).toHaveLength(4);
  });
  it('mitre, solid long side, built-in tape end: a zero-thickness neighbour makes no mitre and shortens nothing', () => {
    const p = part([...solid(BAND_SIDES[0]!), { side: BAND_SIDES[2]!, type: BUILT_IN_BAND_ID }], 'mitre');
    expect(glueLines(p, types).map(at)).toEqual(both('width-min', [0, 0.25], [36, 0.25]));
  });
  it('mitre, solid ends, tape16 on width-min: the end strip draws the mitre; tape draws no line itself', () => {
    const p = part([{ side: BAND_SIDES[0]!, type: 'tape16' }, ...solid(BAND_SIDES[2]!, BAND_SIDES[3]!)], 'mitre');
    const m = glueLines(p, types).map(at);
    expect(m).toEqual([
      ...both('length-min', [0.25, 0.0625], [0.25, 20]),
      ...both('length-min', [0.25, 0.0625], [0, 0]),
      ...both('length-max', [35.75, 0.0625], [35.75, 20]),
      ...both('length-max', [35.75, 0.0625], [36, 0]),
    ]);
  });
  it('faulted draws nothing: solid 12 bands on both long edges of a 20 wide part leave no core', () => {
    const thick: BandType = { ...maple, id: 'thick', thickness: 12 };
    const p = part([{ side: BAND_SIDES[0]!, type: 'thick' }, { side: BAND_SIDES[1]!, type: 'thick' }]);
    expect(bandFaults(p, [...types, thick]).length).toBe(2);
    expect(glueLines(p, [...types, thick])).toEqual([]);
  });
  it('tape only draws nothing; no bands draws nothing; memoised per (part, types)', () => {
    expect(glueLines(part([{ side: BAND_SIDES[0]!, type: 'tape16' }, { side: BAND_SIDES[2]!, type: BUILT_IN_BAND_ID }]), types)).toEqual([]);
    const none = part([]);
    expect(glueLines(none, types)).toEqual([]);
    expect(glueLines(none, types)).toBe(glueLines(none, types));
    const banded = part(four);
    expect(glueLines(banded, types)).toBe(glueLines(banded, types));
    expect(Object.isFrozen(glueLines(banded, types))).toBe(true);
    expect(Object.isFrozen(glueLines(banded, types)[0]!.a)).toBe(true);
  });
});
