import { createBoard } from './document';
import { findTenons } from './tenons';
import type { Cut } from './types';

// An 18in rail, 3-1/2 wide, 3/4 thick.
const rail = (cuts: Cut[]) => createBoard({ length: 18, width: 3.5, thickness: 0.75, cuts });
// An end pocket: thickness face from `from`, `depth` deep, across width with stops, at the length min (or max) end, ℓ long.
const cheek = (id: string, from: 'min' | 'max', depth: number, ell: number, end: 'min' | 'max' = 'min'): Cut => ({
  id, face: 'thickness', from, across: 'width', offset: end === 'min' ? 0 : 18 - ell, width: ell, depth, stopMin: 0, stopMax: 0,
});
const shoulder = (id: string, from: 'min' | 'max', depth: number, ell: number, end: 'min' | 'max' = 'min'): Cut => ({
  id, face: 'width', from, across: 'thickness', offset: end === 'min' ? 0 : 18 - ell, width: ell, depth, stopMin: 0, stopMax: 0,
});
const four = (end: 'min' | 'max', p: string) => [
  cheek(`${p}1`, 'min', 0.25, 1, end), cheek(`${p}2`, 'max', 0.25, 1, end),
  shoulder(`${p}3`, 'min', 0.5, 1, end), shoulder(`${p}4`, 'max', 0.5, 1, end),
];

describe('findTenons', () => {
  it('a four-shoulder tenon', () => {
    expect(findTenons(rail(four('min', 'a')))).toEqual([
      { end: 'min', length: 1, thickness: 0.25, width: 2.5, cutIds: ['a1', 'a2', 'a3', 'a4'] },
    ]);
  });

  it('a two-cheek tenon', () => {
    expect(findTenons(rail([cheek('a', 'min', 0.25, 1), cheek('b', 'max', 0.25, 1)]))).toEqual([
      { end: 'min', length: 1, thickness: 0.25, width: 3.5, cutIds: ['a', 'b'] },
    ]);
  });

  it('a barefaced tenon (one cheek and both shoulders)', () => {
    expect(findTenons(rail([cheek('a', 'min', 0.25, 1), shoulder('b', 'min', 0.5, 1), shoulder('c', 'max', 0.5, 1)]))).toEqual([
      { end: 'min', length: 1, thickness: 0.5, width: 2.5, cutIds: ['a', 'b', 'c'] },
    ]);
  });

  it('tenons at both ends, the max end grouped despite its ℓ being a subtraction', () => {
    const t = findTenons(rail([...four('min', 'a'), ...four('max', 'b')]));
    expect(t.map((x) => [x.end, x.length, x.cutIds.length])).toEqual([['min', 1, 4], ['max', 1, 4]]);
  });

  it('a single end rabbet is a lap, not a tenon', () => {
    expect(findTenons(rail([cheek('a', 'min', 0.25, 1)]))).toEqual([]);
  });

  it('two end cuts that leave TWO tongues are not a tenon', () => {
    // A slot through the middle of the thickness, split into two cuts across the width.
    const slot = (id: string, stopMin: number, stopMax: number): Cut => ({
      id, face: 'length', from: 'min', across: 'width', offset: 0.25, width: 0.25, depth: 1, stopMin, stopMax,
    });
    expect(findTenons(rail([slot('a', 0, 2), slot('b', 1.5, 0)]))).toEqual([]);
  });

  it('two end cuts of different ℓ are not a tenon', () => {
    expect(findTenons(rail([cheek('a', 'min', 0.25, 1), cheek('b', 'max', 0.25, 1.5)]))).toEqual([]);
  });

  it('a full-length edge rabbet pair is not a tenon (ℓ ≤ L/2)', () => {
    expect(findTenons(rail([cheek('a', 'min', 0.25, 18), cheek('b', 'max', 0.25, 18)]))).toEqual([]);
  });
});
