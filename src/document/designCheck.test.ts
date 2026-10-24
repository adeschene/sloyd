import { worldParts } from './tree';
import { describe, expect, it } from 'vitest';
import { checkDesign, faceContacts, partMass, rejectedViolations, TOUCH } from './designCheck';
import type { DesignLimits } from './designCheck';
import { createBoard, createDocument, flatDocument, migrateDocument } from './document';
import workbenchRaw from './fixtures/simple-workbench.sloyd?raw';
import type { FlatDocument } from './document';
import type { Board } from './types';
import { taperCut } from './angleCuts';
import { axisFrame, boardExtents, endFacing } from './geometry';
import { chooseFace, leanMap, slopeOf } from './lean';
import { levelCutOf, levelPlan } from './levelEnds';
import { levelFaces } from './leanContacts';
import { mirrorPart } from './frames';
import { partBounds } from './worldBounds';
import type { AngleCut } from './types';

const NO_LIMITS: DesignLimits = { width: null, depth: null, height: null, maxParts: 100 };

// A flat board: length on X, thickness on Y, width on Z.
const box = (name: string, at: [number, number, number], size: [number, number, number]): Board =>
  createBoard({ name, position: at, length: size[0], thickness: size[1], width: size[2], posture: 'flat', rotation: 0 });
const docOf = (...boards: Board[]): FlatDocument => ({ ...createDocument('T'), boards });
const kinds = (doc: FlatDocument, limits = NO_LIMITS) => checkDesign(doc, limits).map((v) => v.kind);

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
  it('says what the not-finite limit is', () => {
    expect(rejectedViolations([{ name: 'Bad', reason: 'not-finite' }])[0].message)
      .toBe('Bad has a position or size that is not a finite number or is beyond 10,000in.');
  });
  it('turns rejected parts into violations naming them', () => {
    expect(rejectedViolations([{ name: 'Bad', reason: 'not-finite' }, { name: 'Thin', reason: 'too-small' }]))
      .toEqual([
        { kind: 'too-small', message: expect.stringContaining('Bad'), parts: ['Bad'] },
        { kind: 'too-small', message: expect.stringContaining('Thin'), parts: ['Thin'] },
      ]);
  });
});

/** A box from its min and max corners, as a flat board (length X, thickness Y, width Z). */
const span = (name: string, min: [number, number, number], max: [number, number, number]): Board =>
  box(name, min, [max[0] - min[0], max[1] - min[1], max[2] - min[2]]);
const hangs = (doc: FlatDocument) => checkDesign(doc, NO_LIMITS).filter((v) => v.kind === 'hangs');

describe('hangs — the real workbench (fu 165)', () => {
  const workbench = () => flatDocument(migrateDocument(JSON.parse(workbenchRaw)));

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
    const shelf = worldParts(doc).find((b) => b.name === 'Lower shelf')!;
    // Between the legs on X, over the front and back low rails on Z, on top of them on Y.
    const fixed = { ...shelf, width: 24, position: [-26.5, 9.5, -12] as [number, number, number] };
    expect(checkDesign({ ...doc, boards: worldParts(doc).map((b) => (b === shelf ? fixed : b)) }, NO_LIMITS)).toEqual([]);
  });
});

describe('hangs — a load on top', () => {
  it('a crate set ON the hanging shelf does not hold it up', () => {
    const doc = flatDocument(migrateDocument(JSON.parse(workbenchRaw)));
    const v = hangs({ ...doc, boards: [...worldParts(doc), span('Crate', [-5, 6, -4], [5, 12, 4])] });
    expect(v.map((x) => x.message.split(' ')[0] + ' ' + x.message.split(' ')[1])).toEqual(['Lower shelf']);
  });
});

describe('hangs — a contact on the top face (user ruling)', () => {
  it('a cleat screwed up under a bench seat is held — the seat rests on legs without it', () => {
    expect(hangs(docOf(
      span('Leg 1', [0, 0, 0], [2, 17, 2]),
      span('Leg 2', [46, 0, 0], [48, 17, 2]),
      span('Leg 3', [0, 0, 12], [2, 17, 14]),
      span('Leg 4', [46, 0, 12], [48, 17, 14]),
      span('Seat', [0, 17, 0], [48, 18.5, 14]),
      span('Cleat', [10, 16.25, 2], [11.5, 17, 12]),
    ))).toEqual([]);
  });
  it('a shelf screwed up under rails that the legs hold is held', () => {
    const doc = flatDocument(migrateDocument(JSON.parse(workbenchRaw)));
    const shelf = worldParts(doc).find((b) => b.name === 'Lower shelf')!;
    const fixed = { ...shelf, width: 24, position: [-26.5, 5.25, -12] as [number, number, number] };
    expect(hangs({ ...doc, boards: worldParts(doc).map((b) => (b === shelf ? fixed : b)) })).toEqual([]);
  });
});

describe('hangs — the top-face exception recurses one level only', () => {
  it('a crate wedged under a held cap still does not hold the shelf under it', () => {
    const v = hangs(docOf(
      span('Post L', [18, 0, 0], [20, 40, 4]),
      span('Post R', [30, 0, 0], [32, 40, 4]),
      span('Cap', [20, 16, 0], [30, 17, 4]), // between the posts: held
      span('Crate', [22, 15, 0], [28, 16, 4]), // flat, under the cap, on the shelf
      span('Shelf', [22, 14, 0], [28, 15, 4]),
    ));
    expect(v.map((x) => x.message.split(' ')[0])).toEqual(['Shelf']);
  });
});

describe('hangs — parts standing on a hanging shelf', () => {
  const base = () => [
    span('Post A', [0, 0, 0], [2, 30, 2]),
    span('Post B', [22, 0, 0], [24, 30, 2]),
    span('Shelf', [2, 10, 0], [22, 10.75, 20]),
  ];
  const names = (d: FlatDocument) => hangs(d).map((x) => x.message.split(' ')[0] + ' ' + x.message.split(' ')[1]);
  it('the bare shelf hangs', () => {
    expect(names(docOf(...base()))).toEqual(['Shelf is']);
  });
  it('two uprights lapped to each other on a hanging shelf do not hold it', () => {
    expect(names(docOf(...base(),
      span('Up 1', [8, 10.75, 5], [8.75, 20, 15]),
      span('Up 2', [8.75, 10.75, 5], [9.5, 20, 15])))).toEqual(['Shelf is']);
  });
  it('a butt-jointed box on a hanging shelf does not hold it', () => {
    expect(names(docOf(...base(),
      span('Side A', [12, 10.75, 5], [12.75, 16, 15]),
      span('Front', [12.75, 10.75, 5], [18, 16, 5.75])))).toEqual(['Shelf is']);
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

const tips = (doc: FlatDocument) => checkDesign(doc, NO_LIMITS).filter((v) => v.kind === 'tips');
/** A 10x1x10 base on the floor with a 10in-deep, 1in-thick beam of length L resting on it from x = 0. */
const cantilever = (L: number) => docOf(span('Base', [0, 0, 0], [10, 1, 10]), span('Beam', [0, 1, 0], [L, 2, 10]));

describe('tips (fu 165)', () => {
  it('passes a centre of mass more than the margin inside (L = 21.6 puts it at x ≈ 8.965)', () => {
    expect(tips(cantilever(21.6))).toEqual([]);
  });
  it('flags one less than the margin inside (L = 21.8 puts it at x ≈ 9.045), naming the direction', () => {
    const v = tips(cantilever(21.8));
    expect(v).toHaveLength(1);
    expect(v[0].message.startsWith('The piece would tip toward +X: its centre of mass is 0.955in inside the edge')).toBe(true);
    expect(v[0].message).toContain('keep it at least 1in inside');
  });
  it('says "beyond" when the centre of mass is outside the footprint', () => {
    // Centre at x = (100·5 + 300·15) / 400 = 12.5; the footprint's +X edge is at 10.
    expect(tips(cantilever(30))[0].message).toContain('its centre of mass is 2.5in beyond the edge');
  });

  it('a 3in footprint uses a 0.75in margin, not an impossible 1in', () => {
    const doc = docOf(span('Foot', [0, 0, 0], [3, 1, 3]), span('Arm', [0, 1, 0], [4.9, 2, 3]));
    expect(tips(doc)).toEqual([]); // centre at x ≈ 2.089: 0.911 inside, under 1 but over 0.75
  });

  it('a centre of mass exactly the margin inside passes; a sixteenth further out fails', () => {
    const at = (x: number) => docOf(span('Base', [0, 0, 0], [10, 1, 10]), span('Beam', [x, 1, 0], [x + 10, 2, 10]));
    expect(tips(at(8))).toEqual([]); // centre at x = 9, d = 1 = margin
    const v = tips(at(8.0625));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain('0.969in inside');
  });
  it('reports a +Z tip for an overhang along Z', () => {
    const v = tips(docOf(span('Base', [0, 0, 0], [10, 1, 10]), span('Beam', [0, 1, 0], [10, 2, 30])));
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain('would tip toward +Z');
  });
  it("the shrunk margin uses the footprint's SMALLER side", () => {
    // centre at x ≈ 2.089: 0.911 inside; s = 3 -> m = 0.75 passes, but s = 20 -> m = 1 would fail
    expect(tips(docOf(span('Foot', [0, 0, 0], [3, 1, 20]), span('Arm', [0, 1, 0], [4.9, 2, 20])))).toEqual([]);
  });

  it('weighs by VOLUME: a light arm far out does not tip a heavy base', () => {
    expect(tips(docOf(span('Base', [0, 0, 0], [10, 1, 10]), span('Arm', [0, 1, 4.5], [30, 1.25, 5.5])))).toEqual([]);
  });

  it('side table C: a heavy top offset past the plinth tips; centred, it does not', () => {
    const table = (topMinX: number) => docOf(
      span('Plinth', [-8, 0, -6], [8, 1.5, 6]),
      span('Spine', [-0.375, 1.5, -6], [0.375, 24.5, 6]),
      span('Top', [topMinX, 24.5, -8], [topMinX + 30, 26, 8]),
    );
    expect(tips(table(-15))).toEqual([]);
    expect(tips(table(0))[0].message).toContain('would tip toward +X');
  });

  it('no part on the floor: no tips (everything is already unsupported)', () => {
    expect(kinds(docOf(box('A', [0, 5, 0], [10, 1, 10])))).toEqual(['unsupported']);
  });
  it('a floating part adds no weight (Deviation 1): unsupported only', () => {
    expect(kinds(docOf(box('Base', [0, 0, 0], [2, 1, 2]), box('Far', [40, 5, 0], [10, 1, 10])))).toEqual(['unsupported']);
  });
});

describe('phase 2: overlap is measured between SOLIDS (invariant 38)', () => {
  const limits = { width: null, depth: null, height: null, maxParts: 99 };
  // A leg and a rail whose tenon sits in a mortise, built by hand: the boxes
  // interpenetrate by 1in, the solids do not.
  const doc = (withJoint: boolean) => ({
    ...createDocument('T'),
    boards: [
      createBoard({ name: 'Leg', length: 28, width: 1.75, thickness: 1.75, posture: 'upright', position: [0, 0, 0],
        cuts: withJoint ? [{ id: 'm', face: 'width', from: 'max', across: 'length', offset: 0.5, width: 0.75, depth: 1,
          stopMin: 24, stopMax: 1.5, }] : [] }),
      createBoard({ name: 'Rail', length: 19, width: 3.5, thickness: 0.75, posture: 'on-edge', position: [0.75, 23.5, 0.5],
        cuts: withJoint ? [
          { id: 'a', face: 'width', from: 'min', across: 'thickness', offset: 0, width: 1, depth: 0.5, stopMin: 0, stopMax: 0 },
          { id: 'b', face: 'width', from: 'max', across: 'thickness', offset: 0, width: 1, depth: 0.5, stopMin: 0, stopMax: 0 },
        ] : [] }),
    ],
  });

  it('reports a tenon whose mortise is missing', () => {
    expect(checkDesign(doc(false), limits).filter((v) => v.kind === 'overlap')).toHaveLength(1);
  });

  it('does not report a tenon seated in its mortise', () => {
    expect(checkDesign(doc(true), limits).filter((v) => v.kind === 'overlap')).toEqual([]);
  });
});

describe('every violation names its parts', () => {
  const limits = { width: 10, depth: null, height: null, maxParts: 1 };
  it('too-small, overlap, unsupported, too-large, too-many-parts', () => {
    const d = { ...createDocument('T'), boards: [
      createBoard({ name: 'A', length: 20, width: 4, thickness: 0.75, position: [0, 0, 0] }),
      createBoard({ name: 'B', length: 20, width: 4, thickness: 0.75, position: [1, 0.25, 1] }),
      createBoard({ name: 'C', length: 2, width: 2, thickness: 0.0625, position: [0, 9, 0] }),
    ] };
    const v = checkDesign(d, limits);
    const of = (k: string) => v.filter((x) => x.kind === k).map((x) => [...x.parts].sort());
    expect(of('overlap')).toEqual([['A', 'B']]);
    expect(of('too-small')).toEqual([['C']]);
    expect(of('unsupported')).toContainEqual(['C']);
    expect(of('too-large')).toEqual([[]]);
    expect(of('too-many-parts')).toEqual([[]]);
  });
});

describe('faceContacts', () => {
  it('lists a face contact once, with a < b and a\'s touching face', () => {
    const d = { ...createDocument('T'), boards: [
      createBoard({ name: 'Lower', length: 10, width: 4, thickness: 1, position: [0, 0, 0] }),
      createBoard({ name: 'Upper', length: 10, width: 4, thickness: 1, position: [0, 1, 0] }),
    ] };
    expect(faceContacts(d)).toEqual([{ a: 0, b: 1, axis: 1, side: 1, area: 40 }]);
  });
});

describe('faceContacts: side -1', () => {
  it('names a\'s MIN face when it is the upper part, listed once', () => {
    const d = { ...createDocument('T'), boards: [
      createBoard({ name: 'Upper', length: 10, width: 4, thickness: 1, position: [0, 1, 0] }),
      createBoard({ name: 'Lower', length: 10, width: 4, thickness: 1, position: [0, 0, 0] }),
    ] };
    expect(faceContacts(d)).toEqual([{ a: 0, b: 1, axis: 1, side: -1, area: 40 }]);
  });
});

describe('overlap: the deepest solid pair is the one reported', () => {
  it('names the deeper of two overlapping solid pairs', () => {
    // A's dado leaves two end blocks (x 0-4, x 6-10, y .25-1). B overlaps the
    // first by 0.5in (X) and the second by 0.75in (Y, the smaller span).
    const d = { ...createDocument('T'), boards: [
      createBoard({ name: 'A', length: 10, width: 4, thickness: 1, position: [0, 0, 0],
        cuts: [{ id: 'd', face: 'thickness', from: 'max', across: 'width', offset: 4, width: 2, depth: 0.75, stopMin: 0, stopMax: 0 }] }),
      createBoard({ name: 'B', length: 6.5, width: 4, thickness: 1.75, position: [3.5, 0.25, 0] }),
    ] };
    const o = checkDesign(d, { width: null, depth: null, height: null, maxParts: 99 }).filter((v) => v.kind === 'overlap');
    expect(o).toHaveLength(1);
    expect(o[0].message).toBe('B passes 0.75in into A along Y.');
  });
});

describe('hangs reads SOLID contacts (spec §6.3)', () => {
  const tenon = (id: string, from: 'min' | 'max', offset: number) => ({
    id, face: 'width' as const, from, across: 'thickness' as const, offset, width: 1, depth: 0.5, stopMin: 0, stopMax: 0,
  });
  const mortise = (from: 'min' | 'max') => ({
    id: 'm', face: 'width' as const, from, across: 'length' as const, offset: 0.5, width: 0.75, depth: 1, stopMin: 24, stopMax: 1.5,
  });
  const rail = () => createBoard({ name: 'Rail', length: 19, width: 3.5, thickness: 0.75, posture: 'on-edge', position: [0.75, 23.5, 0.5],
    cuts: [tenon('a', 'min', 0), tenon('b', 'max', 0), tenon('c', 'min', 18), tenon('d', 'max', 18)] });
  const doc = () => ({ ...createDocument('T'), boards: [
    createBoard({ name: 'Leg1', length: 28, width: 1.75, thickness: 1.75, posture: 'upright', position: [0, 0, 0], cuts: [mortise('max')] }),
    createBoard({ name: 'Leg2', length: 28, width: 1.75, thickness: 1.75, posture: 'upright', position: [18.75, 0, 0], cuts: [mortise('min')] }),
    rail(),
  ] });

  it('a rail tenoned between two legs is held, and nothing overlaps', () => {
    const v = checkDesign(doc(), { width: null, depth: null, height: null, maxParts: 99 });
    expect(v.filter((x) => x.kind === 'overlap')).toEqual([]);
    expect(v.filter((x) => x.kind === 'hangs')).toEqual([]);
  });
});

describe('rejectedViolations — assemblies', () => {
  it('reports an unplaced and an empty assembly by name', () => {
    const out = rejectedViolations([{ name: 'Drawer', reason: 'unplaced' }, { name: 'Door', reason: 'empty' }]);
    expect(out.map((x) => x.parts)).toEqual([['Drawer'], ['Door']]);
    expect(out[0].message).toBe('Drawer is an assembly with no usable placement, so none of its parts were built.');
    expect(out[1].message).toBe('Door is an assembly with no usable parts.');
  });
});

describe('tapered parts: contacts read contactSolids (AI-tapers spec §3.3)', () => {
  const leg = (): Board => createBoard({ name: 'Leg', position: [0, 0, 0], length: 28, width: 1.5, thickness: 1.5, posture: 'upright', rotation: 0 });
  const plusX = (b: Board, start: number, amount = 0.5): AngleCut => ({
    id: 'tx', ...taperCut({ face: axisFrame(b)[0]!.dim as 'width' | 'thickness', from: endFacing(b, 0, 1), end: endFacing(b, 1, -1), start, amount }),
  });
  const tapered = (start: number) => { const b = leg(); return { ...b, angleCuts: [plusX(b, start)] }; };
  const about = (doc: FlatDocument, name: string) => checkDesign(doc, NO_LIMITS).filter((v) => v.parts.includes(name)).map((v) => v.kind);
  // A batten fastened by its broad (-X) face to the leg's +X face, 5in to 8in up.
  const batten = () => span('Batten', [1.5, 5, 0], [2.25, 8, 1.5]);

  it('a batten on square wood is held', () => {
    expect(about(docOf(leg(), batten()), 'Batten')).toEqual([]);
    expect(about(docOf(tapered(4), batten()), 'Batten')).toEqual([]);   // the taper ends below it
  });

  it('a batten against the tapered length touches air, so it connects to nothing', () => {
    expect(about(docOf(tapered(20), batten()), 'Batten')).toEqual(['unsupported']);
  });

  it('a full-length taper still carries a top on its far end', () => {
    expect(about(docOf(tapered(28), span('Top', [0, 28, 0], [3, 28.5, 1.5])), 'Top')).toEqual([]);
  });

  it('the footprint shrinks by the amount: a piece that stood now tips', () => {
    // A 6in top overhanging +X. Untapered: footprint x 0..1.5 (margin 0.375), centre 0.9 — stands. Tapered: footprint
    // x 0..1 (margin 0.25), and the leg weighs its REAL wood (fu 303): centre 0.846 > 0.75 — tips. (A 3in top stood
    // tapered once the leg stopped being weighed as its full box: centre 0.7035.)
    const top = span('Top', [0, 28, 0], [6, 28.5, 1.5]);
    const tips = (doc: FlatDocument) => checkDesign(doc, NO_LIMITS).some((v) => v.kind === 'tips');
    expect(tips(docOf(leg(), top))).toBe(false);
    expect(tips(docOf(tapered(20), top))).toBe(true);
  });

  it('an untapered notched part keeps its whole box for the tip footprint', () => {
    // A notch under the leg's floor end would drop its floor cell from a cells-based footprint.
    // Footprint only: untapered grounding is protected structurally (`connected` reads
    // contactSolids only when `tapered[i] || tapered[j]`), not by this test.
    const notched = createBoard({ name: 'Leg', position: [0, 0, 0], length: 28, width: 1.5, thickness: 1.5, posture: 'upright', rotation: 0,
      cuts: [{ id: 'n', face: 'width', from: 'max', across: 'thickness', offset: 0, width: 2, depth: 0.75, stopMin: 0, stopMax: 0 }] });   // offset/width run along the length (positionAxisOf)
    const top = span('Top', [0, 28, 0], [3, 28.5, 1.5]);
    expect(checkDesign(docOf(notched, top), NO_LIMITS)).toEqual(checkDesign(docOf(leg(), top), NO_LIMITS));
  });
});

describe('the displayed copy in a metric project (fu 355)', () => {
  const MM = { display: 'metric-mm', precision: 16 } as const;
  const metric = (...boards: Board[]): FlatDocument => ({ ...docOf(...boards), units: MM });
  const one = (doc: FlatDocument, kind: string, display?: typeof MM) =>
    (display ? checkDesign(doc, NO_LIMITS, display) : checkDesign(doc, NO_LIMITS)).find((v) => v.kind === kind)!;

  it('an overlap reads in mm for the person and in inches for the model', () => {
    const v = one(metric(box('A', [0, 0, 0], [10, 1, 10]), box('B', [0, 0.75, 0], [10, 1, 10])), 'overlap');
    expect(v.message).toBe('B passes 0.25in into A along Y.');
    expect(v.shown).toBe('B passes 6.4 mm into A along Y.');
  });
  it('too-small reads to 0.1 mm, so a part under the minimum never reads the same as it', () => {
    const v = one(metric(box('Strip', [0, 0, 0], [10, 1 / 16, 1])), 'too-small');
    expect(v.message).toBe('Strip is 0.063in along Y; the minimum is 0.125in.');
    expect(v.shown).toBe('Strip is 1.6 mm along Y; the minimum is 3.2 mm.');
  });
  it('the tip margin and the unsupported hint read in mm', () => {
    const tip = one({ ...cantilever(21.8), units: MM }, 'tips');
    expect(tip.message).toContain('0.955in inside the edge');
    expect(tip.shown).toContain('its centre of mass is 24.3 mm inside the edge of what touches the floor; keep it at least 25.4 mm inside.');
    const lost = one(metric(box('Base', [0, 0, 0], [10, 1, 10]), box('Float', [0, 3, 0], [10, 1, 10])), 'unsupported');
    expect(lost.message).toContain('the nearest supported part is Base, 2in away');
    expect(lost.shown).toContain('the nearest supported part is Base, 50.8 mm away');
  });
  it('too-large stays in inches: the limit was typed in inches (the user\'s ruling)', () => {
    const v = checkDesign(metric(box('Slab', [0, 0, 0], [36, 1, 10])), { ...NO_LIMITS, width: 30 }).find((x) => x.kind === 'too-large')!;
    expect(v.message).toBe('Overall width 36in exceeds the 30in limit.');
    expect('shown' in v).toBe(false);
  });
  it('a message with no length has no displayed copy', () => {
    const lost = one(metric(box('Float', [0, 3, 0], [10, 1, 10])), 'unsupported');
    expect('shown' in lost).toBe(false);
  });
  it('an imperial project gets exactly the violations it got before: no displayed copy', () => {
    const d = docOf(box('A', [0, 0, 0], [10, 1, 10]), box('B', [0, 0.75, 0], [10, 1 / 16, 10]), box('Float', [0, 5, 0], [10, 1, 10]));
    const v = checkDesign(d, NO_LIMITS);
    expect(v.length).toBeGreaterThan(2);
    expect(v.every((x) => !('shown' in x))).toBe(true);
  });
  it('the display units can be given apart from the document (Refine checks an imperial conversion)', () => {
    const v = one(docOf(box('A', [0, 0, 0], [10, 1, 10]), box('B', [0, 0.75, 0], [10, 1, 10])), 'overlap', MM);
    expect(v.shown).toBe('B passes 6.4 mm into A along Y.');
  });
});

describe('leaning parts (splayed legs §7): extended, never weakened', () => {
  const IN = { display: 'imperial-fractional', precision: 16 } as const;
  const T8 = slopeOf(8);
  const T12 = slopeOf(12);
  /**
   * The four legs by the §3.4 idiom, built as pure world parts (the store's Copy mirrored and Link are not needed to
   * judge world parts): the front-right leg leans its foot toward +X and +Z with its pivot (top centre) at (5, 16, 5);
   * `mirrorPart` gives its left twin across x = 0, and a 180° turn about the vertical through the origin gives the back
   * pair. Then each world leg is levelled by `levelPlan` (or not).
   */
  const turned180 = (b: Board): Board => {
    const e = boardExtents(b);
    return { ...b, rotation: ((b.rotation + 180) % 360) as Board['rotation'], position: [0 - (b.position[0] + e[0]), b.position[1], 0 - (b.position[2] + e[2])] };
  };
  const fourLegs = (x: number, z: number, side = 1.5): Board[] => {
    const fr = createBoard({ name: 'Front right', length: 16, width: side, thickness: side, posture: 'upright', position: [5 - side / 2, 0, 5 - side / 2],
      lean: { x, z, face: chooseFace(createBoard({ posture: 'upright' }), x, z) } });
    const fl = { ...mirrorPart(fr), name: 'Front left' };
    return [fr, fl, { ...turned180(fr), name: 'Back left' }, { ...turned180(fl), name: 'Back right' }];
  };
  const level = (b: Board): Board => {
    const p = levelPlan(b, IN);
    if (typeof p === 'string') throw new Error(p);
    return { ...b, length: p.length, position: p.position, angleCuts: p.angleCuts };
  };
  const seatAt = (y: number) => box('Seat', [-7, y, -7], [14, 1.5, 14]);
  const outward = () => fourLegs(T12, T8).map(level);
  const report = (doc: FlatDocument) => checkDesign(doc, NO_LIMITS).map((v) => `${v.kind}:${v.parts.join(',')}`);

  it('the idiom: four levelled legs share one length, each foot outboard of its pivot and on the floor', () => {
    const legs = outward();
    expect(new Set(legs.map((b) => b.length)).size).toBe(1);
    for (const b of legs) {
      const piv = leanMap(b)!.pivot;
      const foot = levelFaces(b).filter((f) => !f.up);
      expect(foot.length).toBeGreaterThan(0);
      for (const f of foot) {
        expect(Math.abs(f.y)).toBeLessThanOrEqual(1e-9);
        const cx = f.poly.reduce((s, p) => s + p[0], 0) / f.poly.length;
        const cz = f.poly.reduce((s, p) => s + p[1], 0) / f.poly.length;
        expect(Math.sign(cx)).toBe(Math.sign(piv[0]));
        expect(Math.abs(cx)).toBeGreaterThan(Math.abs(piv[0]) + 3);
        expect(Math.abs(cz)).toBeGreaterThan(Math.abs(piv[2]) + 2);
      }
    }
  });

  it('a levelled four-leg stool stands', () => {
    const v = report(docOf(...outward(), seatAt(16)));
    expect(v.filter((k) => /^(unsupported|hangs|tips)/.test(k))).toEqual([]);
    expect(v).toEqual([]);
  });

  it('an unlevelled leg is not grounded: the stool reports each leg, and says to level its ends', () => {
    // Each leg dropped until its lowest corner is on the floor, the seat set on the highest top corner: every contact is
    // an edge or a corner, never a face.
    const legs = fourLegs(T12, T8).map((b) => {
      const lo = partBounds(b).min[1];
      return { ...b, position: [b.position[0], b.position[1] - lo, b.position[2]] as Board['position'] };
    });
    expect(Math.min(...legs.map((b) => partBounds(b).min[1]))).toBeCloseTo(0, 12);
    const top = Math.max(...legs.map((b) => partBounds(b).max[1]));
    const v = checkDesign(docOf(...legs, seatAt(top)), NO_LIMITS);
    const unsupported = v.filter((x) => x.kind === 'unsupported');
    expect(unsupported.map((x) => x.parts[0])).toEqual(['Front right', 'Front left', 'Back left', 'Back right', 'Seat']);
    for (const x of unsupported.slice(0, 4)) {
      expect(x.message).toBe(`${x.parts[0]} is not connected to the floor through touching parts; it leans, and its foot is not level: Level the ends.`);
    }
    // The seat does not lean: no hint.
    expect(unsupported[4]!.message).toBe('Seat is not connected to the floor through touching parts.');
    expect(v.filter((x) => x.kind === 'overlap')).toEqual([]);
  });

  it('the hint rides in `shown` too, after the nearest supported part', () => {
    const legs = outward();
    const stray = fourLegs(T12, T8)[0]!;
    const far = { ...stray, name: 'Stray', position: [40, 0, 0] as Board['position'] };
    const v = checkDesign({ ...docOf(...legs, seatAt(16), far), units: { display: 'metric-mm', precision: 16 } }, NO_LIMITS);
    const x = v.find((k) => k.kind === 'unsupported')!;
    expect(x.parts).toEqual(['Stray']);
    expect(x.message).toMatch(/^Stray is not connected to the floor through touching parts; the nearest supported part is .+, [\d.]+in away; it leans, and its foot is not level: Level the ends\.$/);
    expect(x.shown).toMatch(/; the nearest supported part is .+, [\d.]+ mm away; it leans, and its foot is not level: Level the ends\.$/);
  });

  it('overlap on real bodies: a levelled top raised 0.25 into the seat reports; exactly touching reports none', () => {
    const legs = outward();
    expect(report(docOf(...legs, seatAt(16))).filter((k) => k.startsWith('overlap'))).toEqual([]);
    const raised = legs.map((b, i) => (i === 0 ? { ...b, position: [b.position[0], b.position[1] + 0.25, b.position[2]] as Board['position'] } : b));
    const v = checkDesign(docOf(...raised, seatAt(16)), NO_LIMITS).filter((x) => x.kind === 'overlap');
    expect(v.map((x) => x.message)).toEqual(['Seat passes 0.25in into Front right along Y.']);
  });

  it('overlap reads the leaned body, not the pre-lean box', () => {
    // A block inside the bottom of the leg's PRE-lean box, which is air: the foot has splayed ~3.4in toward +X.
    const legs = outward();
    const fr = legs[0]!;
    const e = boardExtents(fr);
    const block = box('Block', [fr.position[0], 0, fr.position[2]], [1, 1, e[2]]);
    expect(report(docOf(fr, block)).filter((k) => k.startsWith('overlap'))).toEqual([]);
  });

  it.each([
    ['splayed out', () => outward()],
    // Leaning in, the foot lies under the seat in plan: a rest must be judged on height too, never on plan alone.
    ['leaning in', () => fourLegs(-0.25, -0.25, 1).map(level)],
  ] as const)('a levelled leg whose foot stops short of the floor hangs from the seat (%s): a leaning part is held only by resting', (_n, make) => {
    const legs = make();
    // 1in off the foot end, the pivot kept (the box's top stays put): the foot cut rides with the end, still level, now
    // about 1in up. The seat still rests on it, so it is grounded through the seat, but nothing is under it.
    const short = { ...legs[0]!, length: legs[0]!.length - 1, position: [legs[0]!.position[0], legs[0]!.position[1] + 1, legs[0]!.position[2]] as Board['position'] };
    const foot = levelFaces(short).filter((f) => !f.up);
    expect(foot.length).toBeGreaterThan(0);
    for (const f of foot) expect(f.y).toBeGreaterThan(0.9);
    expect(report(docOf(short, ...legs.slice(1), seatAt(16)))).toEqual(['hangs:Front right']);
  });

  it('a leg whose foot cut is removed stands on a corner: the seat still rests on it, but it hangs', () => {
    const legs = outward();
    const rocking = { ...legs[0]!, angleCuts: legs[0]!.angleCuts.filter((c) => levelCutOf(c) !== 'foot') };
    // Its lowest corner pokes through the floor plane, so its real box reaches the floor; its foot is no face.
    expect(partBounds(rocking).min[1]).toBeLessThan(0);
    expect(levelFaces(rocking).filter((f) => !f.up)).toEqual([]);
    expect(report(docOf(rocking, ...legs.slice(1), seatAt(16)))).toEqual(['hangs:Front right']);
  });

  it('a short, wide leaning pad glued up under the seat is not held by its top: (c) never applies to a leaning part', () => {
    // Upright, 6 x 6 in plan, splayed 5°, levelled and then cut down to 1.5in long from its foot, pivot kept: thinnest in Y,
    // so an unleaned pad there would be held by its top face (the seat is held without it).
    const pad0 = level(createBoard({ name: 'Pad', length: 16, width: 6, thickness: 6, posture: 'upright', position: [-3, 0, -3],
      lean: { x: slopeOf(5), z: 0, face: 'width' } }));
    const cut = pad0.length - 1.5;
    const pad = { ...pad0, length: 1.5, position: [pad0.position[0], pad0.position[1] + cut, pad0.position[2]] as Board['position'] };
    const r = partBounds(pad);
    expect(r.max[1] - r.min[1]).toBeLessThan(Math.min(r.max[0] - r.min[0], r.max[2] - r.min[2]));
    expect(report(docOf(...outward(), seatAt(16), pad))).toEqual(['hangs:Pad']);
  });

  it("a part fastened to a leaning leg's PRE-lean box face is not held by it (the lean's touching is its level faces only)", () => {
    // Splay only, so the leg is not twisted; the cleat stands against the -X face of the levelled front-right leg's
    // pre-lean box, which is air: the leaned leg's -X face runs away from it below the top. Thin in X, its top under the
    // seat (grounded through it, but not a broad face): an unleaned leg there would hold it by (c).
    const legs = fourLegs(T12, 0).map(level);
    const fr = legs[0]!;
    const cleat = box('Cleat', [fr.position[0] - 0.75, 13, fr.position[2]], [0.75, 3, 1.5]);
    expect(report(docOf(...legs, seatAt(16), cleat))).toEqual(['hangs:Cleat']);
  });

  it('an unlevelled (uncut) leaning leg is measured on its leaned body, never its pre-lean box', () => {
    const fr = fourLegs(T12, T8)[0]!;
    expect(fr.angleCuts).toEqual([]);
    const e = boardExtents(fr);
    // Inside the bottom of the pre-lean box: air, the foot has splayed out.
    const inBox = box('Block', [fr.position[0], 0, fr.position[2]], [1, 1, e[2]]);
    expect(report(docOf(fr, inBox)).filter((k) => k.startsWith('overlap'))).toEqual([]);
    // Around the leaned foot, outside the pre-lean box: a real overlap.
    const f = partBounds(fr);
    const atFoot = box('Block', [f.max[0] - 1, f.min[1], f.max[2] - 1], [2, 1, 2]);
    expect(atFoot.position[0]).toBeGreaterThan(fr.position[0] + e[0]);
    expect(report(docOf(fr, atFoot)).filter((k) => k.startsWith('overlap'))).toEqual(['overlap:Block,Front right']);
  });

  it('partMass weighs an uncut leaning leg where its wood is: the leaned centre, the same volume', () => {
    const fr = fourLegs(T12, T8)[0]!;
    const e = boardExtents(fr);
    const m = partMass(fr);
    expect(m.v).toBeCloseTo(e[0] * e[1] * e[2], 9);
    const c = leanMap(fr)!.apply([fr.position[0] + e[0] / 2, fr.position[1] + e[1] / 2, fr.position[2] + e[2] / 2]);
    for (let k = 0; k < 3; k += 1) expect(m.c[k]).toBeCloseTo(c[k]!, 9);
    expect(m.c[0]).toBeGreaterThan(fr.position[0] + e[0] / 2 + 1);
  });

  it('the tip footprint includes leaning feet: splayed out, a load past the pivots stands', () => {
    // 12 x 6 x 12 resting on the seat from x = 3 to 15: its centre of mass (≈ 5.9) is past the pivots' square (±5.75)
    // but well inside the splayed feet (≈ ±9.2).
    const load = box('Load', [3, 17.5, -6], [12, 6, 12]);
    const v = report(docOf(...outward(), seatAt(16), load));
    expect(v).toEqual([]);
  });

  it('the tip footprint includes leaning feet: leaning in to a 2 × 2 square of feet, a load that would stand on the pivots tips', () => {
    // Slope 0.25 on each axis carries each foot centre from (±5, ±5) to (±1, ±1) over the 16in drop: feet on a 2 × 2
    // square. 1in legs, so the feet clear each other.
    const inward = fourLegs(-0.25, -0.25, 1).map(level);
    for (const b of inward) {
      for (const f of levelFaces(b).filter((g) => !g.up)) {
        const cx = f.poly.reduce((s, p) => s + p[0], 0) / f.poly.length;
        expect(Math.abs(Math.abs(cx) - 1)).toBeLessThan(0.1);
      }
    }
    // The bare stool stands.
    expect(report(docOf(...inward, seatAt(16)))).toEqual([]);
    // 8 x 6 x 8 from x = 2 to 10: centre of mass ≈ 2.9, past the feet (≈ ±1.75) yet more than 1in inside the pivots'
    // square (±5.5), so a footprint of the legs' pre-lean boxes would let it stand.
    const load = box('Load', [2, 17.5, -4], [8, 6, 8]);
    expect(report(docOf(...inward, seatAt(16), load))).toEqual(['tips:']);
  });
});
