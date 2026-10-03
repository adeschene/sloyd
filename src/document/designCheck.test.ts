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
    const doc = migrateDocument(JSON.parse(workbenchRaw));
    const shelf = doc.boards.find((b) => b.name === 'Lower shelf')!;
    const fixed = { ...shelf, width: 24, position: [-26.5, 5.25, -12] as [number, number, number] };
    expect(hangs({ ...doc, boards: doc.boards.map((b) => (b === shelf ? fixed : b)) })).toEqual([]);
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
  const names = (d: SloydDocument) => hangs(d).map((x) => x.message.split(' ')[0] + ' ' + x.message.split(' ')[1]);
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

const tips = (doc: SloydDocument) => checkDesign(doc, NO_LIMITS).filter((v) => v.kind === 'tips');
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
