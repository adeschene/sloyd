import { describe, expect, it } from 'vitest';
import { centreOf, endWord, faceWord, facesText } from './shopWords';

// A bookcase's frame: two sides at x 0 and x 35.25 (3/4" thick), 72" tall, 12" deep.
const LEFT = { min: [0, 0, 0], max: [0.75, 72, 12] };
const RIGHT = { min: [35.25, 0, 0], max: [36, 72, 12] };
const CASE = centreOf([LEFT, RIGHT]);

describe('centreOf', () => {
  it('is the middle of the boxes\' union', () => {
    expect(CASE).toEqual([18, 36, 6]);
  });
});

describe('faceWord', () => {
  it('names a side\'s face toward the middle "inside" and the other "outside"', () => {
    expect(faceWord('+x', LEFT, CASE)).toBe('inside');
    expect(faceWord('-x', LEFT, CASE)).toBe('outside');
    expect(faceWord('-x', RIGHT, CASE)).toBe('inside');
    expect(faceWord('+x', RIGHT, CASE)).toBe('outside');
  });
  it('names up and down top and bottom, wherever the part is', () => {
    expect(faceWord('+y', LEFT, CASE)).toBe('top');
    expect(faceWord('-y', LEFT, CASE)).toBe('bottom');
    expect(faceWord('+y', { min: [0, 70, 0], max: [36, 72, 12] }, CASE)).toBe('top');
  });
  it('a part centred on that axis falls back to left/right/front/back (+z is the front)', () => {
    // The sides are centred in depth: their front and back edges are not inside or outside.
    expect(faceWord('+z', LEFT, CASE)).toBe('front');
    expect(faceWord('-z', LEFT, CASE)).toBe('back');
    const divider = { min: [17.625, 0, 0], max: [18.375, 72, 12] };
    expect(faceWord('+x', divider, CASE)).toBe('right');
    expect(faceWord('-x', divider, CASE)).toBe('left');
  });
  it('a back panel\'s faces read inside/outside along z', () => {
    const back = { min: [0, 0, 0], max: [36, 72, 0.25] };
    const c = centreOf([LEFT, RIGHT, back]);
    expect(faceWord('+z', back, c)).toBe('inside');
    expect(faceWord('-z', back, c)).toBe('outside');
  });
});

describe('endWord', () => {
  it('is absolute: +y top, -y bottom, -x left, +x right, +z front, -z back', () => {
    expect(['+y', '-y', '-x', '+x', '+z', '-z'].map((d) => endWord(d as never))).toEqual(['top', 'bottom', 'left', 'right', 'front', 'back']);
  });
});

describe('facesText', () => {
  it('counts repeated words and pluralises', () => {
    expect(facesText(['inside'])).toBe('inside face');
    expect(facesText(['inside', 'inside'])).toBe('2 inside faces');
    expect(facesText(['inside', 'outside'])).toBe('inside and outside faces');
    expect(facesText(['inside', 'inside', 'outside'])).toBe('2 inside and 1 outside faces');
    expect(facesText(['right', 'front'])).toBe('right and front faces');
  });
});
