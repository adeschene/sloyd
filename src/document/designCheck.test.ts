import { describe, expect, it } from 'vitest';
import { checkDesign, rejectedViolations, TOUCH } from './designCheck';
import type { DesignLimits } from './designCheck';
import { createBoard, createDocument, migrateDocument } from './document';
import workbenchRaw from './fixtures/simple-workbench.sloyd?raw';
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

/** A box from its min and max corners, as a flat board (length X, thickness Y, width Z). */
const span = (name: string, min: [number, number, number], max: [number, number, number]): Board =>
  box(name, min, [max[0] - min[0], max[1] - min[1], max[2] - min[2]]);
const hangs = (doc: SloydDocument) => checkDesign(doc, NO_LIMITS).filter((v) => v.kind === 'hangs');

describe('hangs — the real workbench (fu 165)', () => {
  const workbench = () => migrateDocument(JSON.parse(workbenchRaw));

  it('flags ONLY the lower shelf, which hangs by its corners below the low rails', () => {
    const v = checkDesign(workbench(), NO_LIMITS);
    expect(v.map((x) => x.kind)).toEqual(['hangs']);
    expect(v[0].message.startsWith('Lower shelf is not held: nothing is under it')).toBe(true);
    expect(v[0].message).toContain('X sides are covered 19% and 19%');
    expect(v[0].message).toContain('(by Front left leg, Front right leg, Back left leg, Back right leg)');
    expect(v[0].message).toContain('each needs 50%');
  });

  it('passes once the shelf rests ON the low rails — the fix the message suggests', () => {
    const doc = workbench();
    const shelf = doc.boards.find((b) => b.name === 'Lower shelf')!;
    // Between the legs on X, over the front and back low rails on Z, on top of them on Y.
    const fixed = { ...shelf, width: 24, position: [-26.5, 9.5, -12] as [number, number, number] };
    expect(checkDesign({ ...doc, boards: doc.boards.map((b) => (b === shelf ? fixed : b)) }, NO_LIMITS)).toEqual([]);
  });
});

describe('hangs — a load on top', () => {
  it('a crate set ON the hanging shelf does not hold it up', () => {
    const doc = migrateDocument(JSON.parse(workbenchRaw));
    const withCrate = { ...doc, boards: [...doc.boards, span('Crate', [-5, 6, -4], [5, 12, 4])] };
    const v = hangs(withCrate);
    expect(v.map((x) => x.message.split(' ')[0] + ' ' + x.message.split(' ')[1])).toEqual(['Lower shelf']);
  });
});

describe('hangs — the three ways to be held', () => {
  it('(a) resting: a square post standing on a plinth, held by nothing else', () => {
    expect(hangs(docOf(
      span('Plinth', [0, 0, 0], [10, 1, 10]),
      span('Post', [3.5, 1, 3.5], [6.5, 21, 6.5]),
    ))).toEqual([]);
  });

  const between = (sideDepth: number) => docOf(
    span('Left side', [0, 0, 0], [0.75, 20, sideDepth]),
    span('Right side', [20.75, 0, 0], [21.5, 20, sideDepth]),
    span('Shelf', [0.75, 10, 0], [20.75, 10.75, 24]),
  );
  it('(b) between: a shelf whose ends are covered exactly 50% passes', () => {
    expect(hangs(between(12))).toEqual([]);
  });
  it('(b) between: 0.4974 coverage prints as 49%, never 50%', () => {
    const v = hangs(between(11.9375));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain('covered 49% and 49%');
  });
  it('(b) between: 49% fails, and says so', () => {
    const v = hangs(between(11.76));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain('X sides are covered 49% and 49% (by Left side, Right side)');
  });

  it('(c) lapped: a backrest screwed to the faces of two posts, nothing under it', () => {
    expect(hangs(docOf(
      span('Post A', [0, 0, 0], [2, 30, 3]),
      span('Post B', [20, 0, 0], [22, 30, 3]),
      span('Backrest', [0, 20, 3], [22, 26, 3.75]),
    ))).toEqual([]);
  });

  it('side table C: a shelf edge-on to one face of a spine hangs — one side is not "between"', () => {
    const v = hangs(docOf(
      span('Plinth', [-8, 0, -6], [8, 1.5, 6]),
      span('Spine', [-0.375, 1.5, -6], [0.375, 24.5, 6]),
      span('Top', [-15, 24.5, -8], [15, 26, 8]),
      span('Shelf', [0.375, 10, -6], [12, 10.75, 6]),
    ));
    expect(v.map((x) => x.message.split(' ')[0])).toEqual(['Shelf']);
    expect(v[0].message).toContain('X sides are covered 100% and 0% (by Spine)');
  });
});

describe('hangs — one fault, one report', () => {
  it('a floating part is unsupported, never also hangs', () => {
    expect(kinds(docOf(box('Base', [0, 0, 0], [10, 1, 10]), box('Float', [0, 5, 0], [10, 1, 10])))).toEqual(['unsupported']);
  });
  it('a part sunk into another is an overlap, never also hangs', () => {
    expect(kinds(docOf(
      span('Post', [0, 0, 0], [2, 30, 2]),
      span('Peg', [1, 10, 0.5], [6, 11, 1.5]),
    ))).toEqual(['overlap']);
  });
});
