import { describe, expect, it } from 'vitest';
import { archCurve, bowCurve, chamferCut, createBoard, defaultBevel, defaultHingeCup, defaultHole, defaultShelfPinRow, miterCut, taperCut } from './document';
import { cornerCurve, defaultCorners } from './curves';
import { mirrorPart } from './frames';
import { IMPERIAL } from '../units/length';
import { canonicalRun, profileCurve, profileFromFields } from './profiles';
import { ARCH } from './curveFixtures';
import { apronArch, frontAndEnds, frontOnly, loop, plainLoop, stopOnArch, stopOnCorner, topCorners, twoSide, twoSideSharp } from './sweepFixtures';
import { FAULT_SUFFIX, featureTag, partFeatures } from './featureKeys';
import type { BandType, Board } from './types';
import { BUILT_IN_BAND, BUILT_IN_BAND_ID } from './banding';

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

it('a stopped profile keys `, stopped`; a full one on another edge keeps its words, so the two take two letters (profile runs a2, P15)', () => {
  const B = { length: 30, width: 10, thickness: 0.75 };
  const side = { across: 'width', from: 'max' } as const;
  const base = profileFromFields({ through: 'length', uFrom: 'max', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' });
  const full = profileFromFields({ through: 'length', uFrom: 'min', vFrom: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'v' });
  const run = canonicalRun(B, base.face, { start: { side, from: 'min', at: 3 }, end: { side, from: 'min', at: 27 } });
  const b = createBoard({ id: 'b', ...B, profiles: [{ id: 's', ...base, run }, { id: 'f', ...full }] });
  const curves = partFeatures(b, IMPERIAL).filter((f) => f.tags[0]!.includes('curve'));
  // planKeys letters by identical key line: two different lines are two letters.
  expect(curves.map((f) => f.text)).toEqual(['Roundover 1/4", stopped', 'Roundover 1/4"']);
  // A stored profile's fault keys with the suffix, as its bench line carries the check (P12).
  const stacked = createBoard({ id: 'b', ...B, profiles: [{ id: 'f', ...full }, { id: 'g', ...full }] });
  expect(partFeatures(stacked, IMPERIAL).map((f) => f.text)).toEqual([`Roundover 1/4"${FAULT_SUFFIX}`, `Roundover 1/4"${FAULT_SUFFIX}`]);
});

describe('swept profiles (profile runs b1, Q7)', () => {
  const sweptKeys = (b: Board) => partFeatures(b, IMPERIAL).filter((f) => f.tags.some((t) => t.endsWith(':curve:p1') || t.endsWith(':curve:w1')));
  it('a loop keys `, all round`; an End to end run round the corners keys `, round the corners`; one following an arch keys as a straight one', () => {
    expect(sweptKeys(topCorners(2)).map((f) => f.text)).toEqual(['Roundover 1/4", all round']);
    expect(sweptKeys(frontOnly).map((f) => f.text)).toEqual(['Roundover 1/4", round the corners']);
    expect(sweptKeys(apronArch).map((f) => f.text)).toEqual(['Roundover 1/4"']);
    // The fillet words sit before the clause (`<profileName><fillet>, all round`).
    expect(sweptKeys(topCorners(2, { ...loop('p1', 0.375, 'cove'), fillet: 0.0625 })).map((f) => f.text)).toEqual(['Cove 3/8", with a 1/16" fillet, all round']);
  });
  it('the corners keep their own key; the swept profile is tagged by its own id', () => {
    const fs = partFeatures({ ...topCorners(2), id: 't' }, IMPERIAL);
    expect(fs.map((f) => f.text)).toEqual(['Four rounded corners, 2" radius', 'Roundover 1/4", all round']);
    expect(fs[1]!.tags).toEqual([featureTag('t', 'curve', 'p1')]);
    expect(fs[1]!.key).toBe(featureTag('t', 'curve', 'p1'));
  });
  it('a faulted swept profile keys with the suffix', () => {
    expect(sweptKeys(topCorners(0.125)).map((f) => f.text)).toEqual([`Roundover 1/4", all round${FAULT_SUFFIX}`]);
  });
  it('a swept-only part does not throw, and its true axis is the thickness axis', () => {
    const fs = partFeatures(plainLoop, IMPERIAL);
    expect(fs.map((f) => f.text)).toEqual(['Roundover 1/4", all round']);
    expect(fs[0]!.trueAxis).toEqual([0, 1, 0]);   // a flat part: its thickness runs up world Y
    expect(fs[0]!.trueNormal).toBeNull();
  });
});

describe('swept profile keys, fix round 1', () => {
  it('keys carry no facing; one corner arc keys `, round the corner`', () => {
    for (const facing of ['face', 'edge'] as const) {
      const b = topCorners(2, { ...loop('p1', 0.5, 'ogee'), facing });
      expect(partFeatures(b, IMPERIAL).map((f) => f.text).at(-1)).toBe('Roman ogee 1/2", all round');
    }
    const one = createBoard({ length: 36, width: 20, thickness: 0.75,
      curves: [{ id: 'k', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'min', radius: 2 }) }],
      profiles: [{ id: 'p1', face: 'max', kind: 'roundover', size: 0.25, fillet: 0, facing: 'face', run: { start: { side: { across: 'width', from: 'min' }, through: 'min' }, end: { side: { across: 'width', from: 'min' }, through: 'max' } } }] });
    expect(partFeatures(one, IMPERIAL).map((f) => f.text)).toEqual(['Rounded corner, 2" radius', 'Roundover 1/4", round the corner']);
  });
});

it('a stopped run on a turned path or across two sides keys `, stopped` with no run words (profile runs b2, Q22)', () => {
  const curveKeys = (b: Board) => partFeatures(b, IMPERIAL).filter((f) => f.tags[0]!.includes('curve')).map((f) => f.text);
  const lastKey = (b: Board) => { const t = curveKeys(b); expect(t).toHaveLength((b.curves.length === 4 ? 1 : b.curves.length) + 1); return t.slice(-1); };
  expect(lastKey(stopOnCorner())).toEqual(['Roundover 1/4", stopped']);
  expect(lastKey(stopOnArch)).toEqual(['Roundover 1/4", stopped']);
  expect(lastKey(frontAndEnds())).toEqual(['Roundover 1/4", stopped']);
  expect(lastKey(twoSideSharp)).toEqual(['Roundover 1/4", stopped']);
  expect(lastKey(stopOnCorner('cove', 0.375))).toEqual(['Cove 3/8", stopped']);
  expect(lastKey({ ...twoSideSharp, profiles: [{ ...twoSide('t', { across: 'width', from: 'min' }, 20, { across: 'length', from: 'max' }, 5, 0.375, 'cove'), fillet: 1 / 16 }] })).toEqual(['Cove 3/8", with a 1/16" fillet, stopped']);
});

describe('partFeatures: band keys (edge banding chunk 2, Q6)', () => {
  const maple: BandType = { id: 'maple', name: 'Maple edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
  const types: BandType[] = [BUILT_IN_BAND, maple];
  const W0 = { across: 'width' as const, from: 'min' as const };
  const W1 = { across: 'width' as const, from: 'max' as const };
  const L0 = { across: 'length' as const, from: 'min' as const };
  const L1 = { across: 'length' as const, from: 'max' as const };
  const panel = (bands: Board['bands'], over: Partial<Board> = {}): Board =>
    ({ ...createBoard({ id: 'p', length: 36, width: 20, thickness: 0.75 }), bands, cornerRule: 'long', hardware: [], ...over });
  it('one key per band type: its name, its thickness, its sides in canonical order', () => {
    expect(partFeatures(panel([{ side: W0, type: 'maple' }, { side: W1, type: 'maple' }]), IMPERIAL, types).map((f) => f.text))
      .toEqual(['Maple edging 1/4": width min side, width max side']);
    const tape = partFeatures(panel([{ side: L0, type: BUILT_IN_BAND_ID }]), IMPERIAL, types);
    expect(tape.map((f) => f.text)).toEqual(['Iron-on veneer: length min end']);
    expect(tape[0]!.tags).toEqual([featureTag('p', 'band', BUILT_IN_BAND_ID)]);
    expect(tape[0]!.key).toBe('p:band:band-iron-on');
    expect(tape[0]!.trueAxis).toEqual([0, 1, 0]);   // flat: seen true looking down the thickness
    expect(tape[0]!.trueNormal).toBeNull();
  });
  it('two types on one part: two features, in canonical order of first use; metric thickness', () => {
    const b = panel([{ side: W1, type: 'maple' }, { side: L0, type: BUILT_IN_BAND_ID }, { side: L1, type: 'maple' }]);
    expect(partFeatures(b, IMPERIAL, types).map((f) => f.text)).toEqual(['Maple edging 1/4": width max side, length max end', 'Iron-on veneer: length min end']);
    expect(partFeatures(b, MM, types).map((f) => f.text)[0]).toBe('Maple edging 6 mm: width max side, length max end');
  });
  it('a name already carrying its thickness as a bounded token does not repeat it (final review 1)', () => {
    const key = (t: BandType, u = IMPERIAL) => partFeatures(panel([{ side: W0, type: t.id }]), u, [BUILT_IN_BAND, t]).map((f) => f.text);
    expect(key({ ...maple, name: 'Maple edging 1/4"' })).toEqual(['Maple edging 1/4": width min side']);
    expect(key({ ...maple, name: '1/4" maple' })).toEqual(['1/4" maple: width min side']);
    expect(key({ ...maple, name: 'Maple 1/4" edging' })).toEqual(['Maple 1/4" edging: width min side']);
    // Not a bounded token: `1/4"` inside `1-1/4"`, `6 mm` inside `16 mm`.
    expect(key({ ...maple, name: 'Edging 1-1/4"' })).toEqual(['Edging 1-1/4" 1/4": width min side']);
    expect(key({ ...maple, name: 'Maple 16 mm', thickness: 6 / 25.4 }, MM)).toEqual(['Maple 16 mm 6 mm: width min side']);
    expect(key({ ...maple, name: 'Maple 6 mm', thickness: 6 / 25.4 }, MM)).toEqual(['Maple 6 mm: width min side']);
    expect(key(maple)).toEqual(['Maple edging 1/4": width min side']);
  });
  it('tape on an arched side is keyed through the arch\'s chords too', () => {
    const arch = { id: 'c9', ...archCurve({ through: 'thickness', along: 'length', side: 'max', from: 'min', start: 6, span: 24, rise: 2 }) };
    const b = panel([{ side: W1, type: BUILT_IN_BAND_ID }], { curves: [arch] });
    const band = partFeatures(b, IMPERIAL, types).find((f) => f.key === 'p:band:band-iron-on')!;
    expect(band.text).toBe('Iron-on veneer: width max side');
    expect(band.tags).toEqual(['p:band:band-iron-on', 'p:curve:c9']);
    // A straight side lists only its band tag.
    expect(partFeatures(panel([{ side: W0, type: BUILT_IN_BAND_ID }], { curves: [arch] }), IMPERIAL, types)
      .find((f) => f.key === 'p:band:band-iron-on')!.tags).toEqual(['p:band:band-iron-on']);
  });
  it('a faulted band\'s key ends with the fault suffix', () => {
    const thick: BandType = { ...maple, id: 'thick', name: 'Thick', thickness: 18 };
    const b = panel([{ side: L0, type: 'thick' }, { side: L1, type: 'thick' }, { side: W0, type: BUILT_IN_BAND_ID }]);
    expect(partFeatures(b, IMPERIAL, [...types, thick]).map((f) => f.text))
      .toEqual(['Iron-on veneer: width min side', 'Thick 18": length min end, length max end — check the cut list']);
    expect(FAULT_SUFFIX).toBe(' — check the cut list');
  });
  it('without band types: what it returned before (no band feature)', () => {
    const holed = { ...side, holes: [{ id: 'h', ...defaultHole(side) }] };
    const b = { ...holed, bands: [{ side: W0, type: 'maple' }], cornerRule: 'long' as const, hardware: [] };
    expect(partFeatures(b, IMPERIAL)).toEqual(partFeatures(holed, IMPERIAL));
    expect(partFeatures(b, IMPERIAL, [])).toEqual(partFeatures(holed, IMPERIAL));
    expect(partFeatures(holed, IMPERIAL, types)).toEqual(partFeatures(holed, IMPERIAL));
  });
});
