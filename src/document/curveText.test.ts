import { describe, expect, it } from 'vitest';
import { archCurve, bowCurve, cornerCurve, createBoard } from './document';
import { curveLine, curveLines } from './curveText';
import { PROFILE_EDGES, canonicalRun, profileCurve, profileFromFields, type ProfileFields } from './profiles';
import { curveFaults } from './curves';
import type { CurveCut, ProfileCut, ProfileEnd } from './types';
import { IMPERIAL } from '../units/length';
import { ARCH, CORNER } from './curveFixtures';

const MM = { display: 'metric-mm' as const, precision: 16 };
const apron = createBoard({ length: 30, width: 5, thickness: 0.75 });
const top = createBoard({ length: 36, width: 20, thickness: 0.75 });

describe('curveLine (spec §4.1)', () => {
  it('an arch, centred', () => {
    expect(curveLine(apron, ARCH, IMPERIAL)).toBe('Arch on the width min side, 3" in from each length end: 24" span, 1-1/2" rise (radius 48-3/4")');
  });
  it('an arch, off-centre', () => {
    const c = { id: 'x', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 18, rise: 1.5 }) };
    expect(curveLine(apron, c, IMPERIAL)).toMatch(/^Arch on the width min side, from 3" to 21" from the length min end: 1-1\/2" rise \(radius /);
  });
  it('a half-round notch', () => {
    const c = { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 }) };
    expect(curveLine(apron, c, IMPERIAL)).toBe('Half-round notch on the width min side, 2" wide, centred 15" from the length min end (radius 1")');
  });
  it('a deep arch (rise past half the span) is not a notch', () => {
    const c = { id: 'd', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 5, span: 2, rise: 1.5 }) };
    expect(curveLine(apron, c, IMPERIAL)).toMatch(/^Arch on the width min side, from 5" to 7" from the length min end: 1-1\/2" rise/);
  });
  it('a bow of an 18" rail, through the width (P7)', () => {
    const rail = createBoard({ length: 18, width: 3, thickness: 0.75 });
    const c = { id: 'b', ...bowCurve({ through: 'width', along: 'length', side: 'min', span: 18, rise: 0.5 }) };
    expect(curveLine(rail, c, IMPERIAL)).toBe('Bow the thickness min side 1/2" (radius 81-1/4"), cut through the width');
  });
  it('a bow shorter than its edge says so (P2)', () => {
    const c = { id: 'b', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 18, rise: 0.5 }) };
    expect(curveLine(apron, c, IMPERIAL)).toBe('Bow the width min side 1/2" over 18" from the length min end (radius 81-1/4")');
  });
  it('a rounded corner', () => {
    expect(curveLine(top, CORNER, IMPERIAL)).toBe('Round the corner of the length max end and the width min side to a 2" radius');
  });
  it('metric', () => {
    expect(curveLine(apron, ARCH, MM)).toBe('Arch on the width min side, 76 mm in from each length end: 610 mm span, 38 mm rise (radius 1238 mm)');
  });
  it('a faulted curve ends with its fault (Review Focus 1)', () => {
    expect(curveLine({ ...apron, length: 26 }, ARCH, IMPERIAL)).toMatch(/ — check: runs past the length max end$/);
  });
  it('no canonical form', () => {
    const odd = { ...ARCH, segments: [{ type: 'arc' as const, to: [27, 0] as [number, number], side: 'left' as const, radius: 50 }, { type: 'line' as const, to: [3, 0] as [number, number] }] };
    expect(curveLine(apron, odd, IMPERIAL)).toBe('Curve cut through the thickness: 1 arc and 1 line');
  });
});

describe('curveLines', () => {
  it('four equal corners on one face are one line, at the first one\'s place', () => {
    const four = (['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => ({ id: `${uf}${vf}`, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: vf, radius: 2 }) })));
    expect(curveLines({ ...top, curves: [ARCH, ...four] }, IMPERIAL)).toEqual([curveLine(top, ARCH, IMPERIAL), 'Round all four corners to a 2" radius']);
  });
  it('two corners print two lines', () => {
    const two = (['min', 'max'] as const).map((uf) => ({ id: uf, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: 'min', radius: 2 }) }));
    expect(curveLines({ ...top, curves: two }, IMPERIAL)).toHaveLength(2);
  });
  it('a duplicate corner keeps its own line; the four distinct corners still collapse', () => {
    const four = (['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => ({ id: `${uf}${vf}`, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: vf, radius: 2 }) })));
    const dup = { ...four[0]!, id: 'dup' };
    const lines = curveLines({ ...top, curves: [four[0]!, dup, ...four.slice(1)] }, IMPERIAL);
    expect(lines).toEqual(['Round all four corners to a 2" radius', curveLine(top, dup, IMPERIAL)]);
  });
});

import { defaultCorners } from './curves';
import { curveLineEntries } from './curveText';
it('curveLineEntries: four equal corners are one entry carrying all four ids; curveLines is its texts', () => {
  const b = createBoard({ length: 36, width: 20, thickness: 0.75, curves: defaultCorners({ length: 36, width: 20, thickness: 0.75 }).map((c, i) => ({ id: `c${i}`, ...c })) });
  const e = curveLineEntries(b, IMPERIAL);
  expect(e).toEqual([{ ids: ['c0', 'c1', 'c2', 'c3'], text: 'Round all four corners to a 1" radius' }]);
  expect(curveLines(b, IMPERIAL)).toEqual(e.map((x) => x.text));
});

describe('profile bench lines (edge profiles spec §4)', () => {
  const top = createBoard({ length: 36, width: 20, thickness: 0.75 });
  const on = (curves: CurveCut[]) => ({ ...top, curves });
  const p = (id: string, f: Partial<ProfileFields> & Pick<ProfileFields, 'kind' | 'size'>): CurveCut =>
    ({ id, ...profileCurve({ through: 'length', uFrom: 'max', vFrom: 'max', facing: 'v', ...f }) });
  it('roundover, cove: size and edge', () => {
    expect(curveLines(on([p('a', { kind: 'roundover', size: 0.25 })]), IMPERIAL))
      .toEqual(['Roundover 1/4" on the edge between the width face (max side) and the thickness face (max side), along the length']);
    expect(curveLines(on([p('a', { kind: 'cove', size: 0.375 })]), IMPERIAL)[0]).toMatch(/^Cove 3\/8" on the edge between/);
  });
  it('asymmetric profiles name the top face; a fillet is named', () => {
    expect(curveLines(on([p('a', { kind: 'ogee', size: 0.5 })]), IMPERIAL)[0])
      .toBe('Roman ogee 1/2" on the edge between the width face (max side) and the thickness face (max side), along the length, top on the thickness face (max side)');
    expect(curveLines(on([p('a', { kind: 'bead', size: 0.25, fillet: 0.0625 })]), IMPERIAL)[0]).toMatch(/^Bead 1\/4" with a 1\/16" quirk on the edge/);
    expect(curveLines(on([p('a', { kind: 'thumbnail', size: 0.75, depth: 0.25 })]), IMPERIAL)[0]).toMatch(/^Thumbnail 3\/4" × 1\/4" on the edge/);
    expect(curveLines(on([p('a', { kind: 'roundover', size: 0.25, fillet: 0.0625 })]), IMPERIAL)[0]).toMatch(/, top on the thickness face \(max side\), with a 1\/16" fillet$/);
  });
  it('metric (Review Focus 5)', () => {
    expect(curveLines(on([p('a', { kind: 'roundover', size: 0.25 })]), MM)[0]).toMatch(/^Roundover 6 mm on the edge/);
  });
  const four = (f: Partial<ProfileFields> & Pick<ProfileFields, 'kind' | 'size'>, over: Partial<Record<string, Partial<ProfileFields>>> = {}) => [
    p('a', { ...f, ...over.a, through: 'length', uFrom: 'min' }), p('b', { ...f, ...over.b, through: 'length', uFrom: 'max' }),
    p('c', { ...f, ...over.c, through: 'width', uFrom: 'min' }), p('d', { ...f, ...over.d, through: 'width', uFrom: 'max' }),
  ];
  it('four equal profiles on one face collapse to one line', () => {
    expect(curveLineEntries(on(four({ kind: 'roundover', size: 0.25 })), IMPERIAL))
      .toEqual([{ ids: ['a', 'b', 'c', 'd'], text: 'Roundover 1/4" on all four edges of the thickness face (max side)' }]);
  });
  it('no collapse when one differs in size, fillet or facing, or is faulted (Review Focus 3)', () => {
    expect(curveLineEntries(on(four({ kind: 'roundover', size: 0.25 }, { d: { size: 0.375 } })), IMPERIAL)).toHaveLength(4);
    expect(curveLineEntries(on(four({ kind: 'roundover', size: 0.25 }, { d: { fillet: 0.0625 } })), IMPERIAL)).toHaveLength(4);
    expect(curveLineEntries(on(four({ kind: 'ogee', size: 0.5 }, { d: { facing: 'u' } })), IMPERIAL)).toHaveLength(4);
    const faulted = four({ kind: 'roundover', size: 0.25 }, { d: { size: 1 } });   // a 1" radius on a 3/4" thickness runs off
    expect(curveFaults(on(faulted), faulted[3]!).length).toBeGreaterThan(0);
    expect(curveLineEntries(on(faulted), IMPERIAL)).toHaveLength(4);
    // Four EQUAL profiles that all run off a thin part (a 1/2" radius on 0.3") still do not collapse.
    const thin = { ...createBoard({ length: 36, width: 20, thickness: 0.3 }), curves: four({ kind: 'roundover', size: 0.5 }) };
    expect(thin.curves.every((c) => curveFaults(thin, c).length > 0)).toBe(true);
    expect(curveLineEntries(thin, IMPERIAL)).toHaveLength(4);
  });
  it('the corner collapse no longer claims through-length corners', () => {
    expect(curveLineEntries(on(four({ kind: 'roundover', size: 0.25 })), IMPERIAL)[0]!.text).not.toMatch(/^Round all four corners/);
    // Four through-length roundovers on four DIFFERENT corners are not four corners: no face holds all four edges.
    const corners = (['min', 'max'] as const).flatMap((uFrom) => (['min', 'max'] as const).map((vFrom) => p(`${uFrom}${vFrom}`, { kind: 'roundover', size: 0.25, uFrom, vFrom })));
    const es = curveLineEntries(on(corners), IMPERIAL);
    expect(es).toHaveLength(4);
    expect(es.every((e) => /^Roundover 1\/4" on the edge between/.test(e.text))).toBe(true);
  });
  it('a stored through-length Rounded corner now reads as a Roundover', () => {
    expect(curveLines(on([p('a', { kind: 'roundover', size: 0.25 })]), IMPERIAL)[0]).not.toMatch(/^Round the corner/);
  });
});

describe('stopped profile words (profile runs a2, P15)', () => {
  const UNITS = IMPERIAL;
  const B = { length: 30, width: 10, thickness: 0.75 };
  const side = { across: 'width', from: 'max' } as const;
  const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' });
  const board = (run: ProfileCut['run'], extra: ProfileCut[] = []) => createBoard({ id: 'b', ...B, profiles: [{ id: 'p', ...base, run }, ...extra] });
  it('a stopped bench line adds its stations from the min end', () => {
    const b = board(canonicalRun(B, base.face, { start: { side, from: 'min', at: 3 }, end: { side, from: 'min', at: 27 } }));
    expect(curveLines(b, UNITS)).toEqual(['Roundover 1/4" on the edge between the width face (max side) and the thickness face (max side), along the length, from 3" to 27" (stopped)']);
  });
  it('a through end reads as its end', () => {
    const b = board(canonicalRun(B, base.face, { start: { side, through: 'min' }, end: { side, from: 'min', at: 20 } }));
    expect(curveLines(b, UNITS)[0]).toMatch(/, from the length min end to 20" \(stopped\)$/);
  });
  it('a station stored from max reads from the min end (a mirrored copy)', () => {
    const b = board(canonicalRun(B, base.face, { start: { side, from: 'max', at: 3 }, end: { side, from: 'max', at: 27 } }));
    expect(curveLines(b, UNITS)[0]).toMatch(/, from 3" to 27" \(stopped\)$/);
  });
  it('a stopped profile never joins the four-edge collapse', () => {
    const four = PROFILE_EDGES.filter((e) => e.vFrom === 'max').map((e, i) => ({ id: `q${i}`, ...profileFromFields({ ...e, kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' }) }));
    const stoppedOne = { ...four[0]!, run: canonicalRun(B, 'max', { start: { side: (four[0]!.run as { start: ProfileEnd }).start.side, from: 'min', at: 3 }, end: { side: (four[0]!.run as { start: ProfileEnd }).start.side, from: 'min', at: 6 } }) };
    const lines = curveLines(createBoard({ id: 'b', ...B, profiles: [stoppedOne, ...four.slice(1)] }), UNITS);
    expect(lines.some((l) => l.includes('all four edges'))).toBe(false);
    expect(lines).toHaveLength(4);
  });
  it('a stopped profile with a stop past the end is noted', () => {
    const b = board(canonicalRun(B, base.face, { start: { side, from: 'min', at: 3 }, end: { side, from: 'min', at: 31 } }));
    expect(curveLines(b, UNITS)[0]).toMatch(/ — check: a stop runs off the part$/);
  });
  it('two identical End to end profiles stacked on one edge overlap (P12, was allowed in a1 by P6): both noted, no collapse', () => {
    const four = PROFILE_EDGES.filter((e) => e.vFrom === 'max').map((e, i) => ({ id: `q${i}`, ...profileFromFields({ ...e, kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' }) }));
    const lines = curveLines(createBoard({ id: 'b', ...B, profiles: [...four, { ...four[0]!, id: 'dup' }] }), UNITS);
    expect(lines).toHaveLength(5);
    expect(lines.filter((l) => l.endsWith(' — check: it overlaps another profile on this edge'))).toHaveLength(2);
  });
});
