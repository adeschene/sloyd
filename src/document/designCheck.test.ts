import { describe, expect, it } from 'vitest';
import { checkDesign, rejectedViolations, TOUCH } from './designCheck';
import type { DesignLimits } from './designCheck';
import { createBoard, createDocument } from './document';
import type { SloydDocument } from './document';
import type { Board } from './types';

const NO_LIMITS: DesignLimits = { width: null, depth: null, height: null, maxParts: 100 };

// A flat board: length on X, thickness on Y, width on Z.
const box = (name: string, at: [number, number, number], size: [number, number, number]): Board =>
  createBoard({ name, position: at, length: size[0], thickness: size[1], width: size[2], posture: 'flat', rotation: 0 });
const docOf = (...boards: Board[]): SloydDocument => ({ ...createDocument('T'), boards });
const kinds = (doc: SloydDocument, limits = NO_LIMITS) => checkDesign(doc, limits).map((v) => v.kind);

describe('overlap', () => {
  it('passes two boxes whose faces touch', () => {
    expect(kinds(docOf(box('A', [0, 0, 0], [10, 1, 10]), box('B', [0, 1, 0], [10, 1, 10])))).toEqual([]);
  });
  it('passes interpenetration of exactly TOUCH', () => {
    expect(kinds(docOf(box('A', [0, 0, 0], [10, 1, 10]), box('B', [0, 1 - TOUCH, 0], [10, 1, 10])))).toEqual([]);
  });
  it('flags interpenetration just past TOUCH, naming both parts and the axis', () => {
    const v = checkDesign(docOf(box('A', [0, 0, 0], [10, 1, 10]), box('B', [0, 1 - TOUCH - 1 / 64, 0], [10, 1, 10])), NO_LIMITS);
    expect(v).toHaveLength(1);
    expect(v[0].kind).toBe('overlap');
    expect(v[0].message).toContain('B');
    expect(v[0].message).toContain('A');
    expect(v[0].message).toContain('along Y');
  });
});

describe('unsupported', () => {
  it('passes a stack reaching the floor', () => {
    expect(kinds(docOf(
      box('Base', [0, 0, 0], [10, 1, 10]),
      box('Mid', [0, 1, 0], [10, 1, 10]),
      box('Top', [0, 2, 0], [10, 1, 10]),
    ))).toEqual([]);
  });
  it('flags a part hovering above the rest', () => {
    const v = checkDesign(docOf(box('Base', [0, 0, 0], [10, 1, 10]), box('Top', [0, 1.5, 0], [10, 1, 10])), NO_LIMITS);
    expect(v.map((x) => x.kind)).toEqual(['unsupported']);
    expect(v[0].message).toContain('Top');
    expect(v[0].message).toContain('Base');
  });
  it('flags a FLOATING ISLAND — two parts touching each other but not the floor', () => {
    // The case a naive "touches something" rule passes.
    const v = checkDesign(docOf(
      box('Base', [0, 0, 0], [10, 1, 10]),
      box('IslandA', [20, 5, 0], [10, 1, 10]),
      box('IslandB', [20, 6, 0], [10, 1, 10]),
    ), NO_LIMITS);
    expect(v.filter((x) => x.kind === 'unsupported').map((x) => x.message.split(' ')[0])).toEqual(['IslandA', 'IslandB']);
  });
  it('does not count EDGE contact as support', () => {
    // Top sits exactly on Base's edge line: spans overlap on one axis only.
    expect(kinds(docOf(box('Base', [0, 0, 0], [10, 1, 10]), box('Top', [10, 1, 0], [10, 1, 10])))).toEqual(['unsupported']);
  });
});

describe('limits', () => {
  const two = docOf(box('A', [0, 0, 0], [30, 1, 12]), box('B', [0, 1, 0], [30, 40, 1]));
  it('passes when every set limit holds', () => {
    expect(kinds(two, { width: 30, depth: 12, height: 41, maxParts: 2 })).toEqual([]);
  });
  it('flags each exceeded dimension: width X, depth Z, height Y', () => {
    const v = checkDesign(two, { width: 29, depth: 11, height: 40, maxParts: 2 });
    expect(v.map((x) => x.kind)).toEqual(['too-large', 'too-large', 'too-large']);
    expect(v.map((x) => x.message.split(' ')[1])).toEqual(['width', 'depth', 'height']);
  });
  it('ignores unset limits', () => {
    expect(kinds(two, { width: null, depth: null, height: null, maxParts: 2 })).toEqual([]);
  });
  it('flags a part count over the cap', () => {
    expect(kinds(two, { ...NO_LIMITS, maxParts: 1 })).toEqual(['too-many-parts']);
  });
});

describe('too-small', () => {
  it('flags a side under 1/8"', () => {
    expect(kinds(docOf(box('Strip', [0, 0, 0], [10, 1 / 16, 1])))).toEqual(['too-small']);
  });
  it('passes a side of exactly 1/8"', () => {
    expect(kinds(docOf(box('Strip', [0, 0, 0], [10, 1 / 8, 1])))).toEqual([]);
  });
});

describe('ordering and rejected parts', () => {
  it('orders by kind, then by part order, stably', () => {
    const d = docOf(box('Thin', [0, 0, 0], [10, 1 / 16, 1]), box('Float', [0, 5, 0], [10, 1, 10]));
    expect(kinds(d, { ...NO_LIMITS, maxParts: 1 })).toEqual(['too-small', 'unsupported', 'too-many-parts']);
    expect(checkDesign(d, NO_LIMITS)).toEqual(checkDesign(d, NO_LIMITS));
  });
  it('turns rejected parts into violations naming them', () => {
    expect(rejectedViolations([{ name: 'Bad', reason: 'not-finite' }, { name: 'Thin', reason: 'too-small' }]))
      .toEqual([
        { kind: 'too-small', message: expect.stringContaining('Bad') },
        { kind: 'too-small', message: expect.stringContaining('Thin') },
      ]);
  });
});
