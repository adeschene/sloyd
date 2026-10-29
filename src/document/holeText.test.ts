import { IMPERIAL } from '../units/length';
import { describe, expect, it } from 'vitest';
import { createBoard, defaultProfile } from './document';
import type { ProfileKind } from './document';
import { curveWord, distinctFaults, edgeName, endWord, holeFaultText, holeHeadText, holeLengthText, holeLine } from './holeText';
import { holeFaults } from './holeFaults';
import type { HoleRow } from './types';
import { ARCH } from './curveFixtures';

const side = createBoard({ length: 30, width: 11.25, thickness: 0.75 });
const pins: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5 };
const cup: HoleRow = { id: 'h2', face: 'thickness', from: 'max', diameter: 35 / 25.4, depth: 0.5, along: 'length', alongFrom: 'min', station: 3, count: 1, pitch: 0, acrossFrom: 'min', inset: 22.5 / 25.4 };

describe('holeLine (spec §4.1, as amended)', () => {
  it('a row: pitch at 1/64 with its mm, last centre exact at the document precision', () => {
    expect(holeLine(side, pins, IMPERIAL)).toBe('Row of 21 holes 1/4" dia × 3/8" deep in the thickness face (max side), along the length: first 2" from the min end, every 1-17/64" (32 mm), last at 27-3/16"; 1-1/2" in from the width min side');
  });
  it('a single hole: a whole-mm diameter prints its mm', () => {
    expect(holeLine(side, cup, IMPERIAL)).toBe('Hole 1-3/8" (35 mm) dia × 1/2" deep in the thickness face (max side), 3" from the length min end, 7/8" in from the width min side');
  });
  it('through, and an end face reads as an end', () => {
    const dowel: HoleRow = { ...cup, face: 'length', from: 'max', diameter: 0.375, depth: 'through', along: 'width', station: 2, inset: 0.375, acrossFrom: 'min' };
    expect(holeLine(side, dowel, IMPERIAL)).toBe('Hole 3/8" dia × through in the length max end, 2" from the width min side, 3/8" in from the thickness min side');
  });
  it('a faulted row carries its first fault and a count (the user\'s ruling, Review Focus 2)', () => {
    const short = { ...side, length: 26, holes: [pins] };
    expect(holeLine(short, pins, IMPERIAL)).toMatch(/ — check: hole 20 runs past the length max end \(and 1 more\)$/);
    expect(holeLine({ ...side, holes: [pins] }, pins, IMPERIAL)).not.toContain('check:');
  });
  it('too-deep is a ROW fault: a row thinned under its depth is counted once on the bench line (final review 1)', () => {
    // 3/8" stock under 3/8"-deep pins: every one of the 21 holes reaches the back face (too-deep's >=), so holeFaults
    // reports 21 too-deep entries, one per hole; the row's depth is one value, so the line names it once, no count.
    const thin = { ...side, thickness: 0.375, holes: [pins] };
    expect(holeFaults(thin, pins).filter((f) => f.kind === 'too-deep')).toHaveLength(21);
    expect(distinctFaults(holeFaults(thin, pins))).toEqual([{ index: 0, kind: 'too-deep' }]);
    expect(holeLine(thin, pins, IMPERIAL)).toMatch(/ — check: the holes are deeper than the thickness$/);
  });
  it('a hole past an edge AND into a curve reads two faults: two things to fix (finding 2, faultKey names the curve)', () => {
    const apron = createBoard({ length: 30, width: 5, thickness: 0.75, curves: [ARCH] });
    const bore: HoleRow = { ...cup, id: 'h3', diameter: 0.5, depth: 'through', station: 15, inset: 0.1 };
    const faults = distinctFaults(holeFaults({ ...apron, holes: [bore] }, bore));
    expect(faults.map((f) => f.curve?.id ?? 'edge')).toEqual(['edge', 'c1']);
    expect(holeLine({ ...apron, holes: [bore] }, bore, IMPERIAL)).toMatch(/ — check: hole 1 runs past the width min side \(and 1 more\)$/);
  });
  it('holeFaultText words each kind', () => {
    expect(holeFaultText({ index: 0, kind: 'off-flat' }, pins)).toBe('hole 1 sits where a cut has removed the wood');
    expect(holeFaultText({ index: 2, kind: 'meets-hole', other: { row: 'h1', index: 1 } }, pins)).toBe('hole 3 meets hole 2');
    expect(holeFaultText({ index: 0, kind: 'meets-hole', other: { row: 'zz', index: 0 } }, pins)).toBe('hole 1 meets a hole of another row');
    expect(holeFaultText({ index: 0, kind: 'too-deep' }, pins)).toBe('the holes are deeper than the thickness');
  });
  it('too-deep on a through headed row reads the head\'s words; a blind one keeps the old words', () => {
    const through: HoleRow = { ...pins, depth: 'through', head: 'counterbore', headDiameter: 0.5, headDepth: 0.75 };
    expect(holeFaultText({ index: 0, kind: 'too-deep' }, through)).toBe('the counterbore runs through the thickness');
    expect(holeFaultText({ index: 0, kind: 'too-deep' }, { ...through, head: 'countersink', headAngle: 90 })).toBe('the countersink runs through the thickness');
    expect(holeFaultText({ index: 0, kind: 'too-deep' }, { ...pins, head: 'counterbore', headDiameter: 0.5, headDepth: 0.1 })).toBe('the holes are deeper than the thickness');
  });
  it('an exact-1/64 whole-mm value does not print its mm (5" is 127 mm)', () => {
    expect(holeLine(side, { ...pins, pitch: 5, count: 2 }, IMPERIAL)).toContain('every 5", last at 7"');
  });
  it('edgeName and endWord are the one home of the edge words', () => {
    expect(edgeName({ dim: 'length', side: 'max' })).toBe('the length max end');
    expect(edgeName({ dim: 'width', side: 'min' })).toBe('the width min side');
    expect(endWord('thickness')).toBe('side');
  });
});

describe('holeLine in metric', () => {
  const MM = { display: 'metric-mm' as const, precision: 16 };
  it('diameter and pitch to 0.1 mm, positions whole mm, no aside', () => {
    const line = holeLine(side, pins, MM);
    expect(line).toContain('6.4 mm dia × 10 mm deep');
    expect(line).toContain('every 32 mm');
    expect(line).toContain('first 51 mm');
    expect(line).not.toContain('(32 mm)');
  });
});

describe('holeLengthText: the one diameter/pitch formatter (bench line and Holes fields)', () => {
  const MM = { display: 'metric-mm' as const, precision: 16 };
  it('metric: mm to one decimal, either kind', () => {
    expect(holeLengthText(0.25, MM, 'diameter')).toBe('6.4 mm');
    expect(holeLengthText(32 / 25.4, MM, 'pitch')).toBe('32 mm');
  });
  it('imperial: the diameter at the document precision, the pitch at 1/64 at least, no mm annotation', () => {
    expect(holeLengthText(35 / 25.4, IMPERIAL, 'diameter')).toBe('1-3/8"');
    expect(holeLengthText(32 / 25.4, IMPERIAL, 'pitch')).toBe('1-17/64"');
    expect(holeLengthText(32 / 25.4, IMPERIAL, 'diameter')).toBe('1-1/4"');
  });
  it('is the text the bench line prints (imperial adds only its mm annotation)', () => {
    expect(holeLine(side, pins, IMPERIAL)).toContain(`every ${holeLengthText(pins.pitch, IMPERIAL, 'pitch')} (32 mm)`);
    expect(holeLine(side, pins, MM)).toContain(`${holeLengthText(pins.diameter, MM, 'diameter')} dia`);
    expect(holeLine(side, pins, MM)).toContain(`every ${holeLengthText(pins.pitch, MM, 'pitch')},`);
  });
  it('a hole into a curve reads by the curve\'s kind (P4)', () => {
    expect(holeFaultText({ index: 2, kind: 'breaks-out', curve: { id: 'c1', kind: 'arch' } }, pins)).toBe('hole 3 runs into the arch');
    expect(holeFaultText({ index: 0, kind: 'breaks-out', curve: { id: 'c1', kind: null } }, pins)).toBe('hole 1 runs into a curve cut');
  });
});

describe('a hole into an edge profile reads by the profile\'s name (Task 7 fix round 1; R3)', () => {
  const top = (inset: number, kind: 'roundover' | 'cove') => {
    const b = createBoard({ id: 'top', name: 'Top', length: 36, width: 20, thickness: 0.75 });
    const bore: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.0625, depth: 0.0625, along: 'length', alongFrom: 'min', station: 18, count: 1, pitch: 0, acrossFrom: 'max', inset };
    return { board: { ...b, holes: [bore], curves: [{ id: 'p1', ...defaultProfile(b, kind) }] }, bore };
  };
  it('a roundover reads as the roundover, never the rounded corner', () => {
    const { board, bore } = top(0.1, 'roundover');
    const f = holeFaults(board, bore).find((x) => x.curve)!;
    expect(holeFaultText(f, bore)).toBe('hole 1 runs into the roundover');
  });
  it('a cove reads as the cove, not a curve cut', () => {
    const { board, bore } = top(0.3, 'cove');
    const f = holeFaults(board, bore).find((x) => x.curve)!;
    expect(holeFaultText(f, bore)).toBe('hole 1 runs into the cove');
  });
  it('every profile kind has its word; a non-profile keeps curveKindWord', () => {
    expect(['roundover', 'cove', 'ogee', 'bead', 'thumbnail'].map((profile) => curveWord({ kind: null, profile: profile as ProfileKind })))
      .toEqual(['the roundover', 'the cove', 'the Roman ogee', 'the bead', 'the thumbnail']);
    expect(curveWord({ kind: 'corner' })).toBe('the rounded corner');
    expect(curveWord({ kind: null })).toBe('a curve cut');
  });
});

describe('a tilted row\'s bench line (angled holes, Task 8)', () => {
  const D = Math.PI / 180;
  const sq = { ...cup, depth: 'through' as const };
  it('a two-plane tilt names the angle off square and the sightline from the along dimension', () => {
    const r = Math.tan(14.3 * D), t = Math.tan(33.5 * D);
    const row: HoleRow = { ...sq, tiltAlong: r / Math.hypot(1, t), tiltAcross: (r * t) / Math.hypot(1, t) };
    expect(holeLine(side, row, IMPERIAL)).toBe(`${holeLine(side, sq, IMPERIAL)}, bored 14.3° off square on a 33.5° sightline from the length`);
  });
  it('a blind two-plane tilt says the depth is along the bit', () => {
    const row: HoleRow = { ...cup, tiltAlong: 0.2, tiltAcross: 0.1 };
    expect(holeLine(side, row, IMPERIAL)).toMatch(/, bored 12\.6° off square on a 26\.6° sightline from the length, depth measured along the bit$/);
  });
  it('a single-plane along tilt names the end the bit leans toward', () => {
    const a = Math.tan(10 * D);
    expect(holeLine(side, { ...sq, tiltAlong: a }, IMPERIAL)).toMatch(/, bored 10\.0° off square toward the length max end$/);
    expect(holeLine(side, { ...sq, tiltAlong: -a }, IMPERIAL)).toMatch(/, bored 10\.0° off square toward the length min end$/);
    expect(holeLine(side, { ...sq, alongFrom: 'max', tiltAlong: a }, IMPERIAL)).toMatch(/toward the length min end$/);
  });
  it('a single-plane across tilt names the side the bit leans toward; blind adds the depth note', () => {
    const a = Math.tan(10 * D);
    expect(holeLine(side, { ...sq, tiltAcross: a }, IMPERIAL)).toMatch(/, bored 10\.0° off square toward the width max side$/);
    expect(holeLine(side, { ...sq, acrossFrom: 'max', tiltAcross: a }, IMPERIAL)).toMatch(/toward the width min side$/);
    expect(holeLine(side, { ...cup, tiltAcross: -a }, IMPERIAL)).toMatch(/toward the width min side, depth measured along the bit$/);
  });
  it('a zero or absent tilt leaves the line untouched', () => {
    expect(holeLine(side, { ...cup, tiltAlong: 0 }, IMPERIAL)).toBe(holeLine(side, cup, IMPERIAL));
  });
});

describe('the head on the bench line (counterbores, Task 7)', () => {
  const MM = { display: 'metric-mm' as const, precision: 16 };
  const bore: HoleRow = { ...cup, diameter: 3 / 16, depth: 'through' };
  const cb: HoleRow = { ...bore, head: 'counterbore', headDiameter: 0.375, headDepth: 0.375 };
  const cs: HoleRow = { ...bore, head: 'countersink', headDiameter: 0.375, headAngle: 82 };
  const tail = 'in the thickness face (max side), 3" from the length min end, 7/8" in from the width min side';
  it('a counterbore', () => {
    expect(holeLine(side, cb, IMPERIAL)).toBe(`Hole 3/16" dia × through, 3/8" counterbore × 3/8" deep ${tail}`);
  });
  it('a countersink', () => {
    expect(holeLine(side, cs, IMPERIAL)).toBe(`Hole 3/16" dia × through, 3/8" countersink at 82° ${tail}`);
  });
  it('a whole-mm head diameter prints its mm aside in imperial', () => {
    expect(holeHeadText({ ...cs, headDiameter: 35 / 25.4 }, IMPERIAL)).toBe('1-3/8" (35 mm) countersink at 82°');
  });
  it('metric', () => {
    const m: HoleRow = { ...cs, diameter: 4.5 / 25.4, headDiameter: 9 / 25.4, headAngle: 90 };
    expect(holeLine(side, m, MM)).toContain('Hole 4.5 mm dia × through, 9 mm countersink at 90° in ');
  });
  it('a headless row is unchanged and has no head text', () => {
    expect(holeHeadText(bore, IMPERIAL)).toBeNull();
    expect(holeLine(side, bore, IMPERIAL)).toBe(`Hole 3/16" dia × through ${tail}`);
  });
});
