import { describe, expect, it } from 'vitest';
import { archCurve, bowCurve, cornerCurve, createBoard } from './document';
import { curveLine, curveLines } from './curveText';
import { PROFILE_EDGES, canonicalRun, profileCurve, profileFromFields, type ProfileFields } from './profiles';
import { curveFaults } from './curves';
import type { CurveCut, ProfileCut, ProfileEnd } from './types';
import { IMPERIAL } from '../units/length';
import { ARCH, CORNER } from './curveFixtures';
import { apronArch, endToEnd, frontAndEnds, frontOnly, loop, notchEdge, stopOnArch, stopOnCorner, topCorners, twoSide, twoSideSharp } from './sweepFixtures';
import { formatLength } from '../units/length';
import { buildDiagrams } from './diagram';

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

describe('swept profile words (profile runs b1, Q7)', () => {
  it('a loop reads `all round` the face, in the collapse\'s own face words', () => {
    expect(curveLines(topCorners(2), IMPERIAL)).toEqual([
      'Round all four corners to a 2" radius',
      'Roundover 1/4" all round the thickness face (max side)',
    ]);
  });
  it('a filleted cove loop names its fillet after the face', () => {
    const b = topCorners(2, { ...loop('p1', 0.375, 'cove'), fillet: 0.0625 });
    expect(curveLines(b, IMPERIAL).at(-1)).toBe('Cove 3/8" all round the thickness face (max side), with a 1/16" fillet');
  });
  it('an End to end run round two corner arcs reads chunk 1\'s line plus `, round the corners`', () => {
    expect(curveLines(frontOnly, IMPERIAL).at(-1)).toBe(
      'Roundover 1/4" on the edge between the width face (min side) and the thickness face (max side), along the length, round the corners');
    // The clause lands after the whole of chunk 1's line: a filleted roundover is asymmetric, so it names its top, then
    // its fillet — read off a straight twin carrying the same stored profile.
    const p = { ...endToEnd('p1', { across: 'width', from: 'min' }), fillet: 0.0625 };
    const twin = curveLines(createBoard({ length: 36, width: 20, thickness: 0.75, profiles: [p] }), IMPERIAL);
    expect(twin).toEqual(['Roundover 1/4" on the edge between the width face (min side) and the thickness face (max side), along the length, top on the thickness face (max side), with a 1/16" fillet']);
    expect(curveLines(topCorners(2, p), IMPERIAL).at(-1)).toBe(`${twin[0]}, round the corners`);
  });
  it('an End to end run following an arch reads chunk 1\'s line exactly (no corner arc, so no clause)', () => {
    const line = 'Roundover 1/4" on the edge between the width face (min side) and the thickness face (max side), along the length';
    // Chunk 1's line for that profile: a straight twin of the apron carrying the same stored profile.
    const twin = createBoard({ length: 30, width: 5, thickness: 0.75, profiles: apronArch.profiles });
    expect(curveLines(twin, IMPERIAL)).toEqual([line]);
    expect(curveLines(apronArch, IMPERIAL)).toEqual([curveLines(createBoard({ ...apronArch, profiles: [] }), IMPERIAL)[0], line]);
    expect(curveLines(notchEdge, IMPERIAL).at(-1)).toBe(line.replace('1/4"', '3/8"'));
  });
  it('a faulted loop ends with its fault', () => {
    const b = topCorners(0.125);
    expect(curveLines(b, IMPERIAL).at(-1)).toBe('Roundover 1/4" all round the thickness face (max side) — check: it is too tight for the curve');
  });
  it('order: curves, then straight profiles, then swept, each in stored order', () => {
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 6, span: 24, rise: 1.25 }) };
    const s = endToEnd('s', { across: 'width', from: 'max' });
    const t = endToEnd('t', { across: 'length', from: 'min' });
    const w = loop('w', 0.25, 'roundover', 'min');
    const b = createBoard({ length: 36, width: 20, thickness: 0.75, curves: [arch], profiles: [s, w, t] });
    const lines = curveLines(b, IMPERIAL);
    expect(lines.some((l) => l.includes('check'))).toBe(false);
    expect(lines).toEqual([
      'Arch on the width min side, 6" in from each length end: 24" span, 1-1/4" rise (radius 58-1/4")',
      'Roundover 1/4" on the edge between the width face (max side) and the thickness face (max side), along the length',
      'Roundover 1/4" on the edge between the length min end and the thickness face (max side), along the width',
      'Roundover 1/4" all round the thickness face (min side)',
    ]);
  });
});

describe('swept profile words, fix round 1 (Q7 amended, implementation b1)', () => {
  const ogee = (facing: 'face' | 'edge') => topCorners(2, { ...loop('p1', 0.5, 'ogee'), facing });
  it('an asymmetric loop facing the edge names its top `on the edge`; facing the face it adds nothing; the two read differently', () => {
    const face = curveLines(ogee('face'), IMPERIAL).at(-1)!;
    const edge = curveLines(ogee('edge'), IMPERIAL).at(-1)!;
    expect(face).toBe('Roman ogee 1/2" all round the thickness face (max side)');
    expect(edge).toBe('Roman ogee 1/2" all round the thickness face (max side), top on the edge');
    expect(face).not.toBe(edge);
  });
  it('the top words sit before the fillet words, as chunk 1 puts them; a symmetric loop has none', () => {
    const b = topCorners(2, { ...loop('p1', 0.25), fillet: 0.0625, facing: 'edge' });
    expect(curveLines(b, IMPERIAL).at(-1)).toBe('Roundover 1/4" all round the thickness face (max side), top on the edge, with a 1/16" fillet');
    expect(curveLines(topCorners(2), IMPERIAL).at(-1)).toBe('Roundover 1/4" all round the thickness face (max side)');
    // A bead loop follows the same rule: facing the edge names it, facing the face adds nothing.
    const bead = (facing: 'face' | 'edge') => curveLines(topCorners(2, { ...loop('p1', 0.25, 'bead'), facing }), IMPERIAL).at(-1);
    expect(bead('face')).toBe('Bead 1/4" with a 1/16" quirk all round the thickness face (max side)');
    expect(bead('edge')).toBe('Bead 1/4" with a 1/16" quirk all round the thickness face (max side), top on the edge');
  });
  it('a run taking ONE corner arc reads `, round the corner`', () => {
    // 36 × 20 top, one 2" corner at (length max, width min): the front's stretch carries round it at one end only.
    const one = createBoard({ length: 36, width: 20, thickness: 0.75,
      curves: [{ id: 'k', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'min', radius: 2 }) }],
      profiles: [endToEnd('p1', { across: 'width', from: 'min' })] });
    expect(curveLines(one, IMPERIAL).at(-1)).toBe(
      'Roundover 1/4" on the edge between the width face (min side) and the thickness face (max side), along the length, round the corner');
    expect(curveLines(frontOnly, IMPERIAL).at(-1)).toMatch(/, round the corners$/);
  });
});

describe('stopped runs on a turned path and two-side runs (profile runs b2, Q21)', () => {
  // Exactly the curves' lines (four corners collapse to one) then the profile's: the profile is the last of them.
  const lastLine = (b: Parameters<typeof curveLines>[0], u: typeof IMPERIAL) => {
    const lines = curveLines(b, u);
    expect(lines).toHaveLength((b.curves.length === 4 ? 1 : b.curves.length) + 1);
    return [lines.at(-1)!];
  };
  const sd = (across: 'length' | 'width', from: 'min' | 'max') => ({ across, from });
  const FRONT = 'Roundover 1/4" on the edge between the width face (min side) and the thickness face (max side), along the length';
  const withRun = (b: ReturnType<typeof topCorners>, p: ProfileCut) => ({ ...b, profiles: [p] });
  it('a stop on a corner arc: stations through formatLength', () => {
    expect(lastLine(stopOnCorner(), IMPERIAL)).toEqual([`${FRONT}, from ${formatLength(1.1, IMPERIAL)} to 30" (stopped)`]);
  });
  it('a stop on an arch adds the stations to chunk 1\'s line', () => {
    expect(lastLine(stopOnArch, IMPERIAL)).toEqual([`${FRONT}, from 10" to 20" (stopped)`]);
  });
  it('a half-stopped run through the corner arc: round the corner, then its stops', () => {
    const half: ProfileCut = { ...endToEnd('p1', sd('width', 'min')), run: { start: { side: sd('width', 'min'), through: 'min' }, end: { side: sd('width', 'min'), from: 'min', at: 20 } } };
    expect(lastLine(withRun(topCorners(2), half), IMPERIAL)).toEqual([`${FRONT}, round the corner, from the length min end to 20" (stopped)`]);
  });
  it('a stop whose far end is the max end reads that end, not a corner clause', () => {
    const half: ProfileCut = { ...endToEnd('p1', sd('width', 'min')), run: { start: { side: sd('width', 'min'), from: 'min', at: 20 }, end: { side: sd('width', 'min'), through: 'max' } } };
    expect(lastLine(withRun(topCorners(2), half), IMPERIAL)).toEqual([`${FRONT}, round the corner, from 20" to the length max end (stopped)`]);
  });
  const HEAD = 'Roundover 1/4" on the thickness face (max side)';
  it('two sides, front and ends: the side between in the face\'s travel', () => {
    expect(lastLine(frontAndEnds(), IMPERIAL)).toEqual([`${HEAD}, from the length min end at 4" round the width min side to the length max end at 4" (stopped)`]);
  });
  it('two sides round a sharp corner', () => {
    expect(lastLine(twoSideSharp, IMPERIAL)).toEqual([`${HEAD}, from the width min side at 20" round the corner to the length max end at 5" (stopped)`]);
  });
  it('the long way round names the other side', () => {
    const b = withRun(topCorners(2), twoSide('t', sd('length', 'max'), 4, sd('length', 'min'), 4));
    expect(lastLine(b, IMPERIAL)).toEqual([`${HEAD}, from the length max end at 4" round the width max side to the length min end at 4" (stopped)`]);
  });
  it('two sides covering two sides between: both, in order', () => {
    const b = withRun(topCorners(2), twoSide('t', sd('width', 'min'), 20, sd('length', 'max'), 5));
    const back = withRun(topCorners(2), twoSide('t', sd('length', 'max'), 5, sd('width', 'min'), 20));
    expect(lastLine(back, IMPERIAL)[0]).toContain('round the width max side and the length min end to');
    expect(lastLine(b, IMPERIAL)[0]).toContain('round the corner to');
  });
  it('a face-min run travels the other way', () => {
    const p: ProfileCut = { ...twoSide('t', sd('width', 'min'), 20, sd('length', 'max'), 5), face: 'min' };
    expect(lastLine(withRun(topCorners(2), p), IMPERIAL)[0]).toBe('Roundover 1/4" on the thickness face (min side), from the width min side at 20" round the length min end and the width max side to the length max end at 5" (stopped)');
  });
  it('a bead facing the edge names its top', () => {
    const p: ProfileCut = { ...twoSide('t', sd('width', 'min'), 20, sd('length', 'max'), 5, 0.25, 'bead'), fillet: 1 / 16, facing: 'edge' };
    expect(lastLine(withRun(twoSideSharp, p), IMPERIAL)[0]).toMatch(/^Bead 1\/4" with a 1\/16" quirk on the thickness face \(max side\), top on the edge, from /);
  });
  it('a fillet reads before the stops', () => {
    const p: ProfileCut = { ...twoSide('t', sd('width', 'min'), 20, sd('length', 'max'), 5, 0.375, 'cove'), fillet: 1 / 16 };
    expect(lastLine(withRun(twoSideSharp, p), IMPERIAL)[0]).toMatch(/^Cove 3\/8" on the thickness face \(max side\), with a 1\/16" fillet, from /);
  });
  it('a faulted two-side run appends its check', () => {
    const p = twoSide('t', sd('width', 'min'), 40, sd('length', 'max'), 5);
    expect(lastLine(withRun(twoSideSharp, p), IMPERIAL)[0]).toMatch(/ \(stopped\) — check: a stop runs off the part$/);
  });
  it('metric: stations read in mm', () => {
    expect(lastLine(twoSideSharp, MM)[0]).toBe('Roundover 6 mm on the thickness face (max side), from the width min side at 508 mm round the corner to the length max end at 127 mm (stopped)');
  });
  it('the part diagram notes carry the stop words, not b1\'s run words', () => {
    const notes = buildDiagrams(stopOnCorner(), IMPERIAL).flatMap((v) => v.curveNotes.map((n) => n.text));
    expect(notes).toHaveLength(2);
    expect(notes.at(-1)).toBe(`${FRONT}, from ${formatLength(1.1, IMPERIAL)} to 30" (stopped)`);
  });
  const oneCorner = (u: 'min' | 'max', v: 'min' | 'max', p: ProfileCut) => createBoard({ length: 36, width: 20, thickness: 0.75,
    curves: [{ id: 'k', ...cornerCurve({ through: 'thickness', uFrom: u, vFrom: v, radius: 2 }) }], profiles: [p] });
  const through = (s: ReturnType<typeof sd>, which: 'min' | 'max') => ({ side: s, through: which }) as const;
  const at = (s: ReturnType<typeof sd>, n: number) => ({ side: s, from: 'min' as const, at: n });
  it('a through end reads round the corner only at the end that carries a corner arc (ascending side)', () => {
    const f = sd('width', 'min');
    const toArc: ProfileCut = { ...endToEnd('p', f), run: { start: at(f, 20), end: through(f, 'max') } };
    const toSharp: ProfileCut = { ...endToEnd('p', f), run: { start: through(f, 'min'), end: at(f, 20) } };
    expect(curveLines(oneCorner('max', 'min', toArc), IMPERIAL)[1]).toBe(`${FRONT}, round the corner, from 20" to the length max end (stopped)`);
    expect(curveLines(oneCorner('max', 'min', toSharp), IMPERIAL)[1]).toBe(`${FRONT}, from the length min end to 20" (stopped)`);
  });
  const FRONT_MAX = 'Roundover 1/4" on the edge between the width face (max side) and the thickness face (max side), along the length';
  it('the same on a descending side (width max)', () => {
    const b = sd('width', 'max');
    const toArc: ProfileCut = { ...endToEnd('p', b), run: { start: through(b, 'max'), end: at(b, 16) } };
    const toSharp: ProfileCut = { ...endToEnd('p', b), run: { start: at(b, 16), end: through(b, 'min') } };
    expect(curveLines(oneCorner('max', 'max', toArc), IMPERIAL)[1]).toBe(`${FRONT_MAX}, round the corner, from 16" to the length max end (stopped)`);
    expect(curveLines(oneCorner('max', 'max', toSharp), IMPERIAL)[1]).toBe(`${FRONT_MAX}, from the length min end to 16" (stopped)`);
  });
  it('a bottom-face stop stored highest first reads low to high', () => {
    const f = sd('width', 'min');
    const p: ProfileCut = { ...stopOnCorner().profiles[0]!, face: 'min', run: { start: at(f, 30), end: at(f, 1.1) } };
    expect(lastLine(withRun(topCorners(2), p), IMPERIAL)[0]).toBe(
      `Roundover 1/4" on the edge between the width face (min side) and the thickness face (min side), along the length, from ${formatLength(1.1, IMPERIAL)} to 30" (stopped)`);
  });
  it('a two-side run ending through at a rounded corner pins its current words (Q21 as set; no corner clause)', () => {
    const p: ProfileCut = { ...twoSide('t', sd('width', 'min'), 20, sd('length', 'max'), 5), run: { start: at(sd('width', 'min'), 10), end: through(sd('length', 'max'), 'max') } };
    expect(lastLine(withRun(topCorners(2), p), IMPERIAL)[0]).toBe('Roundover 1/4" on the thickness face (max side), from the width min side at 10" round the corner to the length max end at its width max side (stopped)');
  });
});

describe('a round tenon prints no curve line (round tenons spec §8: the tenon\'s own line replaces its view curves)', () => {
  const tenon = { id: 't', end: 'max' as const, diameter: 1, length: 3 };
  const leg = createBoard({ id: 'L', name: 'Leg', length: 20, width: 2, thickness: 2, tenons: [tenon] });
  it('a tenoned part has no curve lines', () => {
    expect(curveLines(leg, IMPERIAL)).toEqual([]);
  });
  it('its real curves keep theirs', () => {
    const k = { id: 'k', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'max', radius: 0.5 }) };
    const b = { ...leg, tenons: [{ ...tenon, end: 'min' as const }], curves: [k] };
    expect(curveLines(b, IMPERIAL)).toEqual([curveLine(b, k, IMPERIAL)]);
  });
});
