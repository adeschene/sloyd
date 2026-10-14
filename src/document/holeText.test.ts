import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { edgeName, endWord, holeFaultText, holeLine } from './holeText';
import type { HoleRow } from './types';

const side = createBoard({ length: 30, width: 11.25, thickness: 0.75 });
const pins: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5 };
const cup: HoleRow = { id: 'h2', face: 'thickness', from: 'max', diameter: 35 / 25.4, depth: 0.5, along: 'length', alongFrom: 'min', station: 3, count: 1, pitch: 0, acrossFrom: 'min', inset: 22.5 / 25.4 };

describe('holeLine (spec §4.1, as amended)', () => {
  it('a row: pitch at 1/64 with its mm, last centre exact at the document precision', () => {
    expect(holeLine(side, pins, 16)).toBe('Row of 21 holes 1/4" dia × 3/8" deep in the thickness face (max side), along the length: first 2" from the min end, every 1-17/64" (32 mm), last at 27-3/16"; 1-1/2" in from the width min side');
  });
  it('a single hole: a whole-mm diameter prints its mm', () => {
    expect(holeLine(side, cup, 16)).toBe('Hole 1-3/8" (35 mm) dia × 1/2" deep in the thickness face (max side), 3" from the length min end, 7/8" in from the width min side');
  });
  it('through, and an end face reads as an end', () => {
    const dowel: HoleRow = { ...cup, face: 'length', from: 'max', diameter: 0.375, depth: 'through', along: 'width', station: 2, inset: 0.375, acrossFrom: 'min' };
    expect(holeLine(side, dowel, 16)).toBe('Hole 3/8" dia × through in the length max end, 2" from the width min side, 3/8" in from the thickness min side');
  });
  it('a faulted row carries its first fault and a count (the user\'s ruling, Review Focus 2)', () => {
    const short = { ...side, length: 26, holes: [pins] };
    expect(holeLine(short, pins, 16)).toMatch(/ — check: hole 20 runs past the length max end \(and 1 more\)$/);
    expect(holeLine({ ...side, holes: [pins] }, pins, 16)).not.toContain('check:');
  });
  it('holeFaultText words each kind', () => {
    expect(holeFaultText({ index: 0, kind: 'off-flat' }, pins)).toBe('hole 1 sits where a cut has removed the wood');
    expect(holeFaultText({ index: 2, kind: 'meets-hole', other: { row: 'h1', index: 1 } }, pins)).toBe('hole 3 meets hole 2');
    expect(holeFaultText({ index: 0, kind: 'meets-hole', other: { row: 'zz', index: 0 } }, pins)).toBe('hole 1 meets a hole of another row');
    expect(holeFaultText({ index: 0, kind: 'too-deep' }, pins)).toBe('the holes are deeper than the thickness');
  });
  it('an exact-1/64 whole-mm value does not print its mm (5" is 127 mm)', () => {
    expect(holeLine(side, { ...pins, pitch: 5, count: 2 }, 16)).toContain('every 5", last at 7"');
  });
  it('edgeName and endWord are the one home of the edge words', () => {
    expect(edgeName({ dim: 'length', side: 'max' })).toBe('the length max end');
    expect(edgeName({ dim: 'width', side: 'min' })).toBe('the width min side');
    expect(endWord('thickness')).toBe('side');
  });
});
