import { describe, expect, it } from 'vitest';
import { archCurve, bowCurve, chamferCut, createBoard, defaultBevel, defaultHingeCup, defaultHole, defaultShelfPinRow, miterCut, taperCut } from './document';
import { defaultCorners } from './curves';
import { mirrorPart } from './frames';
import { IMPERIAL } from '../units/length';
import { profileCurve } from './profiles';
import { ARCH } from './curveFixtures';
import { FAULT_SUFFIX, featureTag, partFeatures } from './featureKeys';
import type { Board } from './types';

const MM = { display: 'metric-mm' as const, precision: 16 };
const side = createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75 });
const texts = (b: Board, u = IMPERIAL) => partFeatures(b, u).map((f) => f.text);

describe('partFeatures: key lines (spec §3)', () => {
  it('a hole row, imperial and metric (ruling P1)', () => {
    const b = { ...side, holes: [{ id: 'r', ...defaultShelfPinRow(side)! }] };
    expect(texts(b)).toEqual(['Row of 21 holes, 1/4" dia × 3/8" deep, every 1-17/64" (32 mm)']);
    expect(texts(b, MM)).toEqual(['Row of 21 holes, 6.4 mm dia × 10 mm deep, every 32 mm']);
  });
  it('a single hole and a hinge cup keep the mm aside; a through hole', () => {
    expect(texts({ ...side, holes: [{ id: 'h', ...defaultHingeCup(side) }] })).toEqual(['Hole 1-3/8" (35 mm) dia × 1/2" deep']);
    expect(texts({ ...side, holes: [{ id: 'o', ...defaultHole(side), depth: 'through' }] })).toEqual(['Hole 1/4" dia × through']);
  });
  it('miter, bevel, chamfer (equal and unequal legs), taper (runs out, and does not)', () => {
    const rail = createBoard({ id: 'r', length: 20, width: 3, thickness: 0.75 });
    const cuts = [
      { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, rail) },
      { id: 'v', ...defaultBevel(rail) },
      { id: 't', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 18, amount: 0.5 }) },
      { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.25, legAlong: 0.25 }, rail) },
      { id: 'u', ...chamferCut({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'max', legFace: 0.25, legAlong: 0.5 }, rail) },
    ];
    expect(texts({ ...rail, angleCuts: cuts })).toEqual(['Miter 45.0°', 'Bevel 15.0°', 'Taper 1/2" over 18"', 'Chamfer 1/4"', 'Chamfer 1/4" × 1/2"']);
    const both = { id: 'b', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.25], [20, 0.5]] as [[number, number], [number, number]] };
    expect(texts({ ...rail, angleCuts: [both] })).toEqual(['Taper 1/4" to 1/2"']);
  });
  it('arch, half-round notch, bow, one corner, four corners collapsed (one feature, four tags)', () => {
    const apron = createBoard({ id: 'a', length: 30, width: 5, thickness: 0.75 });
    expect(texts({ ...apron, curves: [ARCH] })).toEqual(['Arch, 24" span, 1-1/2" rise (radius 48-3/4")']);
    const notch = { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 }) };
    expect(texts({ ...apron, curves: [notch] })).toEqual(['Half-round notch, 2" wide']);
    const rail = createBoard({ id: 'r', length: 18, width: 3, thickness: 0.75 });
    const bow = { id: 'w', ...bowCurve({ through: 'width', along: 'length', side: 'min', span: 18, rise: 0.5 }) };
    expect(texts({ ...rail, curves: [bow] })).toEqual(['Bow 1/2" over 18" (radius 81-1/4")']);
    const top = createBoard({ id: 'p', length: 36, width: 20, thickness: 0.75 });
    const four = defaultCorners(top).map((c, i) => ({ id: `k${i}`, ...c }));
    const fs = partFeatures({ ...top, curves: four }, IMPERIAL);
    expect(fs).toHaveLength(1);
    expect(fs[0]!.text).toMatch(/^Four rounded corners, \S+ radius$/);
    expect(fs[0]!.tags).toEqual(four.map((c) => featureTag('p', 'curve', c.id)));
    expect(texts({ ...top, curves: [four[0]!] })[0]).toMatch(/^Rounded corner, \S+ radius$/);
  });
  it('no position words, no through words (R1)', () => {
    const b = { ...side, holes: [{ id: 'r', ...defaultShelfPinRow(side)! }], curves: [] };
    for (const t of texts(b)) expect(t).not.toMatch(/ from | in from | side|face|cut through/);
  });
  it('a faulted hole and an overrunning angle cut end with the suffix', () => {
    const off = { ...side, holes: [{ id: 'o', ...defaultHole(side), inset: 50 }] };
    expect(texts(off)[0]!.endsWith(FAULT_SUFFIX)).toBe(true);
    const short = createBoard({ id: 'q', length: 2, width: 3, thickness: 0.75 });
    const deep = { id: 'm', kind: 'miter' as const, face: 'length' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 0], [3, 3]] as [[number, number], [number, number]] };
    expect(texts({ ...short, angleCuts: [deep] })[0]!.endsWith(FAULT_SUFFIX)).toBe(true);
  });
});

describe('partFeatures: identity and true views', () => {
  it('keys and tags are featureTag of the drawn part', () => {
    const b = { ...side, holes: [{ id: 'r', ...defaultShelfPinRow(side)! }] };
    const [f] = partFeatures(b, IMPERIAL);
    expect(f!.key).toBe('s:hole:r');
    expect(f!.tags).toEqual(['s:hole:r']);
    expect(f!.part).toBe('s');
  });
  it('a hole in the thickness face of a flat part shows true looking down world Y', () => {
    const [f] = partFeatures({ ...side, holes: [{ id: 'r', ...defaultShelfPinRow(side)! }] }, IMPERIAL);
    expect(f!.trueAxis!.map((x) => Math.abs(Math.round(x)))).toEqual([0, 1, 0]);
    expect(f!.trueNormal).toBeNull();
  });
  it('a mirrored copy has the same true directions up to sign (Review Focus 1)', () => {
    const b = { ...side, holes: [{ id: 'r', ...defaultShelfPinRow(side)! }], angleCuts: [{ id: 't', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 18, amount: 0.5 }) }] };
    const a = partFeatures(b, IMPERIAL);
    const m = partFeatures(mirrorPart(b), IMPERIAL);
    const abs = (v: number[] | null) => v && v.map((x) => Math.abs(x).toFixed(9));
    expect(m.map((f) => [abs(f.trueAxis), abs(f.trueNormal), f.text])).toEqual(a.map((f) => [abs(f.trueAxis), abs(f.trueNormal), f.text]));
  });
  it('an angle cut that removes nothing is not a feature (final review #2: the cut list ignores it too)', () => {
    const rail = createBoard({ id: 'r', length: 20, width: 3, thickness: 0.75 });
    const none = { id: 'z', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0], [20, 0]] as [[number, number], [number, number]] };
    expect(partFeatures({ ...rail, angleCuts: [none] }, IMPERIAL)).toEqual([]);
  });
  it('a featureless part has no features', () => {
    expect(partFeatures(side, IMPERIAL)).toEqual([]);
  });
});

it('profile key lines are short words (edge profiles spec §4)', () => {
  const top = createBoard({ id: 't', length: 36, width: 20, thickness: 0.75 });
  const p = (id: string, through: 'length' | 'width', uFrom: 'min' | 'max') =>
    ({ id, ...profileCurve({ through, uFrom, vFrom: 'max', facing: 'v', kind: 'ogee', size: 0.5 }) });
  const one = partFeatures({ ...top, curves: [p('a', 'length', 'max')] }, IMPERIAL).find((f) => f.tags[0]!.includes('curve'))!;
  expect(one.text).toBe('Roman ogee 1/2"');
  const four = partFeatures({ ...top, curves: [p('a', 'length', 'min'), p('b', 'length', 'max'), p('c', 'width', 'min'), p('d', 'width', 'max')] }, IMPERIAL);
  expect(four.filter((f) => f.tags[0]!.includes('curve')).map((f) => f.text)).toEqual(['Roman ogee 1/2" (4×)']);
});

it('a filleted profile keys apart from a plain one (final review F2): the fillet words are in the key line', () => {
  const top = createBoard({ id: 't', length: 36, width: 20, thickness: 0.75 });
  const p = (id: string, through: 'length' | 'width', uFrom: 'min' | 'max', fillet: number) =>
    ({ id, ...profileCurve({ through, uFrom, vFrom: 'max', facing: 'v', kind: 'roundover', size: 0.25, fillet }) });
  const curveTexts = (b: Board) => partFeatures(b, IMPERIAL).filter((f) => f.tags[0]!.includes('curve')).map((f) => f.text);
  const plain = curveTexts({ ...top, curves: [p('a', 'length', 'max', 0)] });
  const filleted = curveTexts({ ...top, curves: [p('a', 'length', 'max', 0.0625)] });
  expect(plain).toEqual(['Roundover 1/4"']);
  // The bench line's own words (`filletWords`, curveText.ts): planKeys letters by identical key line, so these two differ.
  expect(filleted).toEqual(['Roundover 1/4", with a 1/16" fillet']);
  // Both on one part: two lines, two letters.
  expect(curveTexts({ ...top, curves: [p('a', 'length', 'max', 0), p('b', 'length', 'min', 0.0625)] }))
    .toEqual(['Roundover 1/4"', 'Roundover 1/4", with a 1/16" fillet']);
  // The four-edge collapse still reads (4×), after the fillet words.
  const four = (['length', 'width'] as const).flatMap((t) => (['min', 'max'] as const).map((u) => p(`${t}${u}`, t, u, 0.0625)));
  expect(curveTexts({ ...top, curves: four })).toEqual(['Roundover 1/4", with a 1/16" fillet (4×)']);
});
