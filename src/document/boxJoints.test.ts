import { createBoard, createDocument, flatDocument } from './document';
import {
  applyBoxJoints, boxJointPlan, defaultFingerWidth, fingerLayout, fingerSetAt, fingerSets, notchCuts, segment,
  type BoxJointOptions, type BoxJointPlan, type FingerLayout,
} from './boxJoints';
import { BOX_NO_CORNER, BOX_WIDTH_POSITIVE } from './boxJointText';
import { checkDesign, type DesignLimits } from './designCheck';
import { TOUCH } from './checkTolerances';
import { axisDimensions, boardExtents, endFacing, spanToWorldOffset } from './geometry';
import { clippedRegion } from './cuts';
import { worldParts } from './tree';
import { sharedOf } from './links';
import { mirrorDim } from './frames';
import { buildCutList } from './cutlist';
import { taperCut } from './angleCuts';
import { archCurve } from './curves';
import { BUILT_IN_BAND_ID, withBands } from './bandModel';
import { leans } from './lean';
import { refaceFromEnd } from './resizeEnd';
import { findTenons } from './tenons';
import { IMPERIAL, type Units } from '../units/length';
import type { AngleCut, Board, Cut, CurveCut, CutFrom, Dimension, HoleRow, Lean, ProfileCut, Rotation, Shape, ShapedBoard, SloydDocument } from './types';

const METRIC: Units = { display: 'metric-mm', precision: 1 };
const other = (dim: Dimension): Dimension => (dim === 'length' ? 'width' : 'length');

describe('fingerLayout (spec §3.3)', () => {
  it('an odd multiple of w: every finger equal', () => {
    expect(fingerLayout(4.5, 0.5)).toEqual({ count: 9, width: 0.5, outer: 0.5, length: 4.5 });
  });

  it('the nearest odd count, the slack shared by the outer two', () => {
    expect(fingerLayout(5.25, 0.5)).toEqual({ count: 11, width: 0.5, outer: 0.375, length: 5.25 });
  });

  it('a tie goes DOWN, to the wider outer pair', () => {
    expect(fingerLayout(5, 0.5)).toEqual({ count: 9, width: 0.5, outer: 0.75, length: 5 });
    expect(fingerLayout(4, 0.5)).toEqual({ count: 7, width: 0.5, outer: 0.75, length: 4 });
  });

  it('at least five fingers; shorter than 4w refuses', () => {
    expect(fingerLayout(1.9, 0.5)).toBeNull();
    expect(fingerLayout(2, 0.5)).toEqual({ count: 5, width: 0.5, outer: 0.25, length: 2 });
  });

  it('a width of zero or less refuses', () => {
    expect(fingerLayout(4, 0)).toBeNull();
    expect(fingerLayout(4, -0.5)).toBeNull();
  });

  it('segments are computed directly, cover [0, H] and alternate in width', () => {
    const l = fingerLayout(5.25, 0.5)!;
    expect(segment(l, 1)).toEqual([0, 0.375]);
    expect(segment(l, 2)).toEqual([0.375, 0.875]);
    expect(segment(l, 10)).toEqual([0.375 + 8 * 0.5, 0.375 + 9 * 0.5]);
    expect(segment(l, 11)).toEqual([0.375 + 9 * 0.5, 5.25]);
  });
});

/** A plain board whose `dim` end `end` carries the planned notches: `dim` is `D` long, the other face dimension `H`. */
function planned(l: FingerLayout, outerFingers: boolean, dim: Dimension, end: CutFrom, depth: number, D: number) {
  const n = outerFingers ? (l.count - 1) / 2 : (l.count + 1) / 2;
  const ids = Array.from({ length: n }, (_, i) => `n${i}`);
  const cuts = notchCuts(l, outerFingers, dim, end, other(dim), depth, ids);
  const board = createBoard({ [dim]: D, [other(dim)]: l.length, thickness: 0.5, cuts } as Partial<Board>);
  return { board, cuts, ids };
}

const CASES: [number, number][] = [[3, 0.5], [4.75, 0.5], [6, 0.75], [100 / 25.4, 6 / 25.4]];
const EVERY = CASES.flatMap(([H, w]) => [true, false].flatMap((outerFingers) =>
  (['length', 'width'] as const).flatMap((dim) => (['min', 'max'] as const).map((end) => ({ H, w, outerFingers, dim, end })))));

describe('notchCuts (spec §3.4)', () => {
  it('one cut per notch in segment order: the outer-fingers part at EVEN k, the other at ODD k', () => {
    const l = fingerLayout(4.5, 0.5)!;
    const a = notchCuts(l, true, 'length', 'min', 'width', 0.5, ['a', 'b', 'c', 'd']);
    expect(a.map((c) => [c.offset, c.width])).toEqual([[0.5, 0.5], [1.5, 0.5], [2.5, 0.5], [3.5, 0.5]]);
    const b = notchCuts(l, false, 'width', 'max', 'length', 0.75, ['a', 'b', 'c', 'd', 'e']);
    expect(b.map((c) => c.offset)).toEqual([0, 1, 2, 3, 4]);
    expect(b[0]).toEqual({ id: 'a', face: 'width', from: 'max', across: 'thickness', offset: 0, width: 0.5, depth: 0.75, stopMin: 0, stopMax: 0 });
  });
});

describe('fingerSets (spec §5.1): the round trip', () => {
  it.each(EVERY)('$H at $w, outer fingers $outerFingers, $dim $end', ({ H, w, outerFingers, dim, end }) => {
    const l = fingerLayout(H, w)!;
    const { board, ids } = planned(l, outerFingers, dim, end, 0.5, 20);
    const sets = fingerSets(board);
    expect(sets).toEqual([{ dim, end, layout: l, depth: 0.5, outerFingers, cutIds: ids }]);
    expect(fingerSetAt(board, dim, end)).toEqual(sets[0]);
    expect(fingerSetAt(board, dim, end === 'min' ? 'max' : 'min')).toBeNull();
    expect(fingerSetAt(board, other(dim), end)).toBeNull();
  });

  it('a metric depth at a MAX end reads back to 1e-9, not exactly (D − (D − depth) is not depth)', () => {
    const l = fingerLayout(100 / 25.4, 6 / 25.4)!;
    const { board } = planned(l, true, 'length', 'max', 12 / 25.4, 300 / 25.4);
    const [set] = fingerSets(board);
    expect(set.layout).toEqual(l);
    expect(Math.abs(set.depth - 12 / 25.4)).toBeLessThanOrEqual(1e-9);
  });

  it('sets on both length ends are reported min then max', () => {
    const l = fingerLayout(4.5, 0.5)!;
    const lo = notchCuts(l, true, 'length', 'min', 'width', 0.5, ['a', 'b', 'c', 'd']);
    const hi = notchCuts(l, false, 'length', 'max', 'width', 0.5, ['e', 'f', 'g', 'h', 'i']);
    const board = createBoard({ length: 20, width: 4.5, thickness: 0.5, cuts: [...hi, ...lo] });
    expect(fingerSets(board).map((s) => [s.end, s.outerFingers, s.cutIds])).toEqual([
      ['min', true, ['a', 'b', 'c', 'd']], ['max', false, ['e', 'f', 'g', 'h', 'i']],
    ]);
  });

  describe('mutations recognise nothing', () => {
    const l = fingerLayout(4.75, 0.5)!;
    const mutate = (outerFingers: boolean, f: (cuts: Cut[]) => Cut[]) => {
      const { board } = planned(l, outerFingers, 'length', 'min', 0.5, 20);
      return fingerSets({ ...board, cuts: f(board.cuts.map((c) => ({ ...c }))) });
    };
    it.each([true, false])('drop one notch (outer fingers %s)', (o) => {
      expect(mutate(o, (cs) => cs.filter((_, i) => i !== 1))).toEqual([]);
    });
    it.each([true, false])('shift one notch by 1e-6 (outer fingers %s)', (o) => {
      expect(mutate(o, (cs) => { cs[1].offset += 1e-6; return cs; })).toEqual([]);
    });
    it.each([true, false])('deepen one notch by 1e-6 (outer fingers %s)', (o) => {
      expect(mutate(o, (cs) => { cs[1].depth += 1e-6; return cs; })).toEqual([]);
    });
    it.each([true, false])('stop one short of the thickness (outer fingers %s)', (o) => {
      expect(mutate(o, (cs) => { cs[1].stopMin = 0.01; return cs; })).toEqual([]);
    });
    it('an even count (a notch at one edge, a finger at the other) is not a set', () => {
      // notch, finger, notch, finger, notch, finger, all 1/2: every inner equal, the outer two equal, N = 6.
      const cut = (id: string, offset: number): Cut => ({
        id, face: 'length', from: 'min', across: 'thickness', offset, width: 0.5, depth: 0.5, stopMin: 0, stopMax: 0,
      });
      const cuts = [cut('a', 0), cut('b', 1), cut('c', 2)];
      expect(fingerSets(createBoard({ length: 20, width: 3, thickness: 0.5, cuts }))).toEqual([]);
    });
    it('three segments (two edge notches: the tenon shape) are not a set', () => {
      const three: FingerLayout = { count: 3, width: 0.5, outer: 0.55, length: 1.6 };
      const cuts = notchCuts(three, false, 'length', 'min', 'width', 0.5, ['a', 'b']);
      expect(fingerSets(createBoard({ length: 20, width: 1.6, thickness: 0.5, cuts }))).toEqual([]);
    });
    it('an edge notch shifted off the edge', () => {
      expect(mutate(false, (cs) => { cs[0].offset += 1e-6; cs[0].width -= 1e-6; return cs; })).toEqual([]);
    });
  });

  it.each(EVERY)('re-stored by refaceFromEnd (as a resize stores them): $H at $w, outer fingers $outerFingers, $dim $end',
    ({ H, w, outerFingers, dim, end }) => {
      const l = fingerLayout(H, w)!;
      const { board, ids } = planned(l, outerFingers, dim, end, 0.5, 20);
      const restored = { ...board, cuts: board.cuts.map((c) => refaceFromEnd(board, c, dim)!) };
      // The re-store really changed the stored fields: no notch is stored INTO `dim` any more.
      expect(restored.cuts.every((c) => c && c.face !== dim)).toBe(true);
      const [set, ...rest] = fingerSets(restored);
      expect(rest).toEqual([]);
      expect({ ...set, layout: undefined }).toEqual({ dim, end, layout: undefined, depth: 0.5, outerFingers, cutIds: ids });
      expect(set.layout.count).toBe(l.count);
      expect(set.layout.length).toBe(l.length);
      expect(Math.abs(set.layout.width - l.width)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(set.layout.outer - l.outer)).toBeLessThanOrEqual(1e-9);
    });
});

describe('findTenons never claims a finger set (spec §3.3, why five)', () => {
  it.each(EVERY)('$H at $w, outer fingers $outerFingers, $dim $end', ({ H, w, outerFingers, dim, end }) => {
    const { board } = planned(fingerLayout(H, w)!, outerFingers, dim, end, 0.5, 20);
    expect(findTenons(board)).toEqual([]);
  });

  it('a hand-built three-segment set IS claimed by findTenons: why the minimum is five', () => {
    const three: FingerLayout = { count: 3, width: 0.5, outer: 0.55, length: 1.6 };
    const cuts = notchCuts(three, false, 'length', 'min', 'width', 0.5, ['a', 'b']);
    const board = createBoard({ length: 20, width: 1.6, thickness: 0.5, cuts });
    expect(findTenons(board)).not.toEqual([]);
  });

  it('the layout refuses three fingers at 1.6 by 1/2', () => {
    expect(fingerLayout(1.6, 0.5)).toBeNull();
  });

  it('three fingers would read as a tenon, which is why the layout refuses them', () => {
    // Asserts only when the layout's minimum is mutated down to three (N = 3); the task-2 report records that run
    // failing HERE, on the findTenons line.
    const l = fingerLayout(1.6, 0.5);
    if (l) expect(findTenons(planned(l, false, 'length', 'min', 0.5, 20).board)).toEqual([]);
  });
});

describe('defaultFingerWidth (spec §3.3)', () => {
  it('the thinner thickness rounded DOWN to the drag grid, never below 1/4" (6 mm)', () => {
    expect(defaultFingerWidth(0.75, IMPERIAL)).toBe(0.75);
    expect(defaultFingerWidth(0.2, IMPERIAL)).toBe(0.25);
    expect(defaultFingerWidth(0.5, METRIC)).toBe(12 / 25.4);
    expect(defaultFingerWidth(0.2, METRIC)).toBe(6 / 25.4);
  });

  it('a thickness already on the grid stays (no float floor one step down)', () => {
    expect(defaultFingerWidth(12 / 25.4, METRIC)).toBe(12 / 25.4);
    expect(defaultFingerWidth(19 / 25.4, METRIC)).toBe(19 / 25.4);
    expect(defaultFingerWidth(11 / 16 + 1 / 64, IMPERIAL)).toBe(11 / 16);
  });
});

describe('notchCuts guards its axes', () => {
  it('throws when `along` is not the cut\'s position axis', () => {
    const l = fingerLayout(4.5, 0.5)!;
    expect(() => notchCuts(l, true, 'length', 'min', 'length', 0.5, ['a', 'b', 'c', 'd'])).toThrow();
    expect(() => notchCuts(l, true, 'length', 'min', 'thickness', 0.5, ['a', 'b', 'c', 'd'])).toThrow();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// The planner (Task 3; spec §3, §6; plan Spec difference 3 revised)
// ---------------------------------------------------------------------------------------------------------------------

const EPS = 1e-9;
const NO_LIMITS: DesignLimits = { width: null, depth: null, height: null, maxParts: 100 };
const T = 0.5;

/** A drawer (task brief): Front, Back, Side left, Side right, 1/2" thick, `h` tall, inside 12 × 16. Front/Back are on
 *  edge along X (thickness on Z), the sides on edge turned 90 along Z (thickness on X). `butt`: the sides run the full
 *  depth and Front/Back sit between them; `overlap`: every part runs to the outside; `empty`: every part stops at the
 *  inside faces. */
type Corners = 'butt' | 'overlap' | 'empty';
function drawerParts(kind: Corners, o: { h?: number; t?: number; inside?: [number, number] } = {}): Board[] {
  const h = o.h ?? 4;
  const t = o.t ?? T;
  const [iw, id] = o.inside ?? [12, 16];
  const fbX = kind === 'empty' || kind === 'butt' ? t : 0;
  const fbL = kind === 'overlap' ? iw + 2 * t : iw;
  const sZ = kind === 'empty' ? t : 0;
  const sL = kind === 'empty' ? id : id + 2 * t;
  const fb = (id_: string, name: string, z: number) => createBoard({
    id: id_, name, posture: 'on-edge', rotation: 0, length: fbL, width: h, thickness: t, position: [fbX, 0, z],
  });
  const side = (id_: string, name: string, x: number) => createBoard({
    id: id_, name, posture: 'on-edge', rotation: 90, length: sL, width: h, thickness: t, position: [x, 0, sZ],
  });
  return [fb('f', 'Front', 0), fb('b', 'Back', id + t), side('l', 'Side left', 0), side('r', 'Side right', iw + t)];
}
const docOf = (boards: Board[], extra: Partial<SloydDocument> = {}): SloydDocument => ({ ...createDocument('Drawer'), boards, ...extra });
const DRAWER_IDS = ['f', 'b', 'l', 'r'];
const ok = (p: BoxJointPlan | string): BoxJointPlan => {
  if (typeof p === 'string') throw new Error(`refused: ${p}`);
  return p;
};
/** A refusal: the sentence, and the document untouched (the same `boards` object, the same JSON). */
const expectRefusal = (doc: SloydDocument, ids: string[], sentence: string, opts: Partial<BoxJointOptions> = {}) => {
  const before = JSON.stringify(doc);
  const boards = doc.boards;
  expect(boxJointPlan(doc, ids, { width: 0.5, swap: false, ...opts })).toBe(sentence);
  expect(doc.boards).toBe(boards);
  expect(JSON.stringify(doc)).toBe(before);
};
const span = (b: Board, k: number): [number, number] => [b.position[k]!, b.position[k]! + boardExtents(b)[k]!];
const part = (doc: SloydDocument, id: string) => worldParts(doc).find((b) => b.id === id)!;

/** The world J-intervals of `b`'s notches at its end facing world `side` along axis `k`, sorted. */
function notchIntervals(b: Board, k: number, side: -1 | 1, J: number): [number, number][] {
  const d = axisDimensions(b)[k]!;
  const set = fingerSetAt(b, d, endFacing(b, k, side));
  if (!set) throw new Error(`${b.name}: no finger set`);
  const jd = axisDimensions(b)[J]!;
  return set.cutIds.map((cid) => {
    const r = clippedRegion(b, b.cuts.find((c) => c.id === cid)!);
    const [lo, hi] = spanToWorldOffset(b, J, r[jd]);
    return [b.position[J]! + lo, b.position[J]! + hi] as [number, number];
  }).sort((x, y) => x[0] - y[0]);
}
/** The complement of `iv` within [lo, hi]. */
const complement = (iv: [number, number][], lo: number, hi: number): [number, number][] => {
  const out: [number, number][] = [];
  let at = lo;
  for (const [a, b] of iv) { if (a > at + EPS) out.push([at, a]); at = b; }
  if (at < hi - EPS) out.push([at, hi]);
  return out;
};
const closeIv = (x: [number, number][], y: [number, number][]) =>
  x.length === y.length && x.every((v, i) => Math.abs(v[0] - y[i]![0]) <= EPS && Math.abs(v[1] - y[i]![1]) <= EPS);

/**
 * The corner of `a` (thickness on world `ta`) and `b` (thickness on `tb`) in `doc` is exactly filled: `a`'s end along
 * `tb` sits at `b`'s outside face and vice versa, each notch is the other's thickness deep, and `a`'s notches along J
 * are exactly `b`'s fingers (the corner square's union, no overlap, to 1e-9).
 */
function expectComplementary(doc: SloydDocument, aId: string, bId: string) {
  const a = part(doc, aId);
  const b = part(doc, bId);
  const ta = axisDimensions(a).indexOf('thickness');
  const tb = axisDimensions(b).indexOf('thickness');
  const J = 3 - ta - tb;
  const sideOf = (p: Board, q: Board, k: number): -1 | 1 => ((span(p, k)[0] + span(p, k)[1]) / 2 < (span(q, k)[0] + span(q, k)[1]) / 2 ? 1 : -1);
  const sa = sideOf(a, b, tb);
  const sb = sideOf(b, a, ta);
  // Each end at the other's outside face.
  expect(Math.abs(span(a, tb)[sa === 1 ? 1 : 0] - span(b, tb)[sa === 1 ? 1 : 0])).toBeLessThanOrEqual(EPS);
  expect(Math.abs(span(b, ta)[sb === 1 ? 1 : 0] - span(a, ta)[sb === 1 ? 1 : 0])).toBeLessThanOrEqual(EPS);
  const setA = fingerSetAt(a, axisDimensions(a)[tb]!, endFacing(a, tb, sa))!;
  const setB = fingerSetAt(b, axisDimensions(b)[ta]!, endFacing(b, ta, sb))!;
  // RECOGNISED depths: an ulp off the planned ones on a non-dyadic size (Task 2), so at 1e-9.
  expect(Math.abs(setA.depth - b.thickness)).toBeLessThanOrEqual(EPS);
  expect(Math.abs(setB.depth - a.thickness)).toBeLessThanOrEqual(EPS);
  expect(setA.outerFingers).toBe(!setB.outerFingers);
  const [lo, hi] = span(a, J);
  expect(closeIv(notchIntervals(a, tb, sa, J), complement(notchIntervals(b, ta, sb, J), lo, hi))).toBe(true);
}

describe('boxJointPlan (spec §3): the drawer', () => {
  it('the fixture: Front/Back thickness on Z, the sides thickness on X', () => {
    const [f, , l] = drawerParts('butt');
    expect(boardExtents(f!)).toEqual([12, 4, 0.5]);
    expect(boardExtents(l!)).toEqual([0.5, 4, 17]);
  });

  it('butt corners, all four: 4 corners, Front and Back 1" longer, the sides unchanged; complementary; checks clean', () => {
    const doc = docOf(drawerParts('butt'));
    const plan = ok(boxJointPlan(doc, DRAWER_IDS, { width: 0.5, swap: false }));
    expect(plan.corners).toHaveLength(4);
    expect(plan.corners.every((c) => c.layout.count === 7 && c.layout.width === 0.5 && c.layout.outer === 0.75)).toBe(true);
    const out = applyBoxJoints(doc, plan);
    expect(['f', 'b', 'l', 'r'].map((id) => part(out, id).length)).toEqual([13, 13, 17, 17]);
    for (const [x, y] of [['f', 'l'], ['f', 'r'], ['b', 'l'], ['b', 'r']]) expectComplementary(out, x!, y!);
    expect(checkDesign(flatDocument(out), NO_LIMITS)).toEqual([]);
    expect(plan.notes).toEqual([
      'Jointed 4 corners: 7 fingers, 1/2" wide (the outer two 3/4").',
      'Front is now 1" longer.',
      'Back is now 1" longer.',
    ]);
  });

  it('overlapping corners: the same joints, no length changes', () => {
    const doc = docOf(drawerParts('overlap'));
    const plan = ok(boxJointPlan(doc, DRAWER_IDS, { width: 0.5, swap: false }));
    const out = applyBoxJoints(doc, plan);
    expect(['f', 'b', 'l', 'r'].map((id) => part(out, id).length)).toEqual([13, 13, 17, 17]);
    for (const [x, y] of [['f', 'l'], ['f', 'r'], ['b', 'l'], ['b', 'r']]) expectComplementary(out, x!, y!);
    expect(checkDesign(flatDocument(out), NO_LIMITS)).toEqual([]);
    expect(plan.notes).toEqual(['Jointed 4 corners: 7 fingers, 1/2" wide (the outer two 3/4").']);
  });

  it('empty corners: every part grows by one thickness at each end (1" in all)', () => {
    const doc = docOf(drawerParts('empty'));
    const plan = ok(boxJointPlan(doc, DRAWER_IDS, { width: 0.5, swap: false }));
    const out = applyBoxJoints(doc, plan);
    expect(['f', 'b', 'l', 'r'].map((id) => part(out, id).length)).toEqual([13, 13, 17, 17]);
    for (const [x, y] of [['f', 'l'], ['f', 'r'], ['b', 'l'], ['b', 'r']]) expectComplementary(out, x!, y!);
    expect(checkDesign(flatDocument(out), NO_LIMITS)).toEqual([]);
    expect(plan.notes.slice(1)).toEqual(['Front is now 1" longer.', 'Back is now 1" longer.', 'Side left is now 1" longer.', 'Side right is now 1" longer.']);
  });

  it('the outer fingers land on the sides (run axis Z first); Swap fingers puts them on Front/Back', () => {
    const doc = docOf(drawerParts('butt'));
    const outerOn = (swap: boolean) => {
      const out = applyBoxJoints(doc, ok(boxJointPlan(doc, DRAWER_IDS, { width: 0.5, swap })));
      return ['f', 'b', 'l', 'r'].map((id) => fingerSets(part(out, id)).map((s) => s.outerFingers));
    };
    expect(outerOn(false)).toEqual([[false, false], [false, false], [true, true], [true, true]]);
    expect(outerOn(true)).toEqual([[true, true], [true, true], [false, false], [false, false]]);
  });

  it('the run-out is EXACT, never grid-rounded (inv 25): an odd inside width lands on the outside faces', () => {
    const doc = docOf(drawerParts('empty', { inside: [12.3, 16.1] }));
    const out = applyBoxJoints(doc, ok(boxJointPlan(doc, DRAWER_IDS, { width: 0.5, swap: false })));
    expect(span(part(out, 'f'), 0)).toEqual([0, 12.3 + 1]);
    expect(span(part(out, 'l'), 2)[0]).toBe(0);
    expect(Math.abs(span(part(out, 'l'), 2)[1] - 17.1)).toBeLessThanOrEqual(EPS);
  });

  it('a corner just within TOUCH of meeting is a corner; just beyond is not', () => {
    const near = drawerParts('butt');
    near[0] = { ...near[0]!, position: [T + TOUCH * 0.99, 0, 0], length: 12 - 2 * TOUCH * 0.99 };
    expect(typeof boxJointPlan(docOf(near.slice(0, 1).concat(near.slice(2, 3))), ['f', 'l'], { width: 0.5, swap: false })).toBe('object');
    const far = drawerParts('butt');
    far[0] = { ...far[0]!, position: [T + TOUCH * 1.01, 0, 0], length: 12 - 2 * TOUCH * 1.01 };
    expect(boxJointPlan(docOf(far.slice(0, 1).concat(far.slice(2, 3))), ['f', 'l'], { width: 0.5, swap: false })).toBe(BOX_NO_CORNER);
  });
});

describe('boxJointPlan: what is a corner', () => {
  it('a drawer stacked above another is not at a corner with it (the spans along J must overlap)', () => {
    const lower = drawerParts('butt');
    const upper = drawerParts('butt').map((b) => ({ ...b, id: `${b.id}2`, name: `${b.name} 2`, position: [b.position[0], 5, b.position[2]] as [number, number, number] }));
    const doc = docOf([...lower, ...upper]);
    const plan = ok(boxJointPlan(doc, [...DRAWER_IDS, ...DRAWER_IDS.map((id) => `${id}2`)], { width: 0.5, swap: false }));
    expect(plan.corners).toHaveLength(8);
  });
});

describe('boxJointPlan: a carcass (spec §5.3)', () => {
  it('two upright sides and a top between them: the checks stay clean', () => {
    const side = (id: string, name: string, x: number) => createBoard({
      id, name, posture: 'upright', rotation: 90, length: 30, width: 11, thickness: 0.75, position: [x, 0, 0],
    });
    const top = createBoard({ id: 't', name: 'Top', posture: 'flat', rotation: 90, length: 24, width: 11, thickness: 0.75, position: [0.75, 29.25, 0] });
    const sides = [side('l', 'Side left', 0), side('r', 'Side right', 24.75)];
    expect(boardExtents(sides[0]!)).toEqual([0.75, 30, 11]);
    const flatTop = { ...top, rotation: 0 as const };
    expect(boardExtents(flatTop)).toEqual([24, 0.75, 11]);
    const doc = docOf([...sides, flatTop]);
    const plan = ok(boxJointPlan(doc, ['l', 'r', 't'], { width: 0.75, swap: false }));
    expect(plan.corners).toHaveLength(2);
    const out = applyBoxJoints(doc, plan);
    expect(part(out, 't').length).toBe(25.5);
    expectComplementary(out, 't', 'l');
    expectComplementary(out, 't', 'r');
    expect(checkDesign(flatDocument(out), NO_LIMITS)).toEqual([]);
  });
});

describe('boxJointPlan: linked carcass sides (a mirrored user whose run dimension is NOT mirrorDim)', () => {
  it.each([[false, true], [true, true]])('upright sides (mirrorDim width, run along length), mirrored %s/%s: one Shape, complementary, checks clean', (lm, rm) => {
    const side = (id: string, name: string, x: number) => createBoard({
      id, name, posture: 'upright', rotation: 90, length: 30, width: 11, thickness: 0.75, position: [x, 0, 0],
    });
    const l = side('l', 'Side left', 0);
    const r = side('r', 'Side right', 24.75);
    expect(mirrorDim(l)).toBe('width');
    const top = createBoard({ id: 't', name: 'Top', posture: 'flat', rotation: 0, length: 24, width: 11, thickness: 0.75, position: [0.75, 29.25, 0] });
    const shape: Shape = { id: 's1', ...sharedOf(l) };
    const user = (b: Board, mirrored: boolean): ShapedBoard =>
      ({ id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: 's1', ...(mirrored ? { mirrored: true as const } : {}) });
    // Both mirrored: the Shape's own board is planned in a MIRRORED user's frame, its sides flipped only along mirrorDim.
    const doc = docOf([user(l, lm), user(r, rm), top] as Board[], { shapes: [shape] });
    const out = applyBoxJoints(doc, ok(boxJointPlan(doc, ['l', 'r', 't'], { width: 0.75, swap: false })));
    const shapeIds = ['l', 'r'].map((id) => (out.boards.find((b) => b.id === id) as ShapedBoard).shape);
    expect(shapeIds[0]).toBeDefined();
    expect(shapeIds[1]).toBe(shapeIds[0]);
    expectComplementary(out, 't', 'l');
    expectComplementary(out, 't', 'r');
    expect(checkDesign(flatDocument(out), NO_LIMITS)).toEqual([]);
  });

  it.each([[false, true], [true, true]])('sides that GROW (stopping under the top), mirrored %s/%s: a shelf dado stays put in the world', (lm, rm) => {
    // The run-out moves each side's top end up 3/4"; the dado across each side's inside face must not move (spec §3.2).
    const dado: Cut = { id: 'd', face: 'thickness', from: 'max', across: 'width', offset: 15, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const side = (id: string, name: string, x: number) => createBoard({
      id, name, posture: 'upright', rotation: 90, length: 29.25, width: 11, thickness: 0.75, position: [x, 0, 0], cuts: [{ ...dado }],
    });
    const l = side('l', 'Side left', 0);
    const r = side('r', 'Side right', 24.75);
    const top = createBoard({ id: 't', name: 'Top', posture: 'flat', rotation: 0, length: 24, width: 11, thickness: 0.75, position: [0.75, 29.25, 0] });
    const shape: Shape = { id: 's1', ...sharedOf(l) };
    const user = (b: Board, mirrored: boolean): ShapedBoard =>
      ({ id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: 's1', ...(mirrored ? { mirrored: true as const } : {}) });
    const doc = docOf([user(l, lm), user(r, rm), top] as Board[], { shapes: [shape] });
    const dadoY = (d: SloydDocument, id: string) => {
      const b = part(d, id);
      const c = b.cuts.find((x) => x.id === 'd')!;
      const [lo, hi] = spanToWorldOffset(b, 1, clippedRegion(b, c).length);
      return [b.position[1] + lo, b.position[1] + hi];
    };
    const before = ['l', 'r'].map((id) => dadoY(doc, id));
    const out = applyBoxJoints(doc, ok(boxJointPlan(doc, ['l', 'r', 't'], { width: 0.75, swap: false })));
    expect(['l', 'r'].map((id) => part(out, id).length)).toEqual([30, 30]);
    expect(['l', 'r'].map((id) => dadoY(out, id))).toEqual(before);
    expectComplementary(out, 't', 'l');
    expectComplementary(out, 't', 'r');
  });
});

describe('boxJointPlan: what a part may already carry (spec §3.5)', () => {
  /** A bottom groove on each side: into the broad face, running along the length. */
  const groove = (id: string): Cut => ({ id, face: 'thickness', from: 'max', across: 'length', offset: 0.25, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 });
  const grooved = (kind: Corners) => drawerParts(kind).map((b) => (b.id === 'l' || b.id === 'r' ? { ...b, cuts: [groove(`g${b.id}`)] } : b));

  it.each(['butt', 'empty'] as Corners[])('a grooved drawer (%s): not refused, the grooves still run out at both ends', (kind) => {
    const doc = docOf(grooved(kind));
    const plan = ok(boxJointPlan(doc, DRAWER_IDS, { width: 0.5, swap: false }));
    for (const id of ['l', 'r']) {
      const g = plan.parts.get(id)!.cuts.find((c) => c.id === `g${id}`)!;
      expect([g.across, g.stopMin, g.stopMax]).toEqual(['length', 0, 0]);
    }
    expect(checkDesign(flatDocument(applyBoxJoints(doc, plan)), NO_LIMITS)).toEqual([]);
  });

  it('re-run with a new width: lengths unchanged, every finger set re-laid, no stray cut', () => {
    const doc0 = docOf(grooved('butt'));
    const doc = applyBoxJoints(doc0, ok(boxJointPlan(doc0, DRAWER_IDS, { width: 0.5, swap: false })));
    const plan = ok(boxJointPlan(doc, DRAWER_IDS, { width: 0.375, swap: false }));
    const out = applyBoxJoints(doc, plan);
    expect(['f', 'b', 'l', 'r'].map((id) => part(out, id).length)).toEqual([13, 13, 17, 17]);
    for (const id of ['f', 'b', 'l', 'r']) {
      const b = part(out, id);
      const sets = fingerSets(b);
      expect(sets).toHaveLength(2);
      for (const s of sets) {
        expect(s.layout.count).toBe(11);
        expect(Math.abs(s.layout.width - 0.375)).toBeLessThanOrEqual(EPS);
        expect(Math.abs(s.layout.outer - 0.3125)).toBeLessThanOrEqual(EPS);
      }
      const inSets = new Set(sets.flatMap((s) => s.cutIds));
      expect(b.cuts.filter((c) => !inSets.has(c.id)).map((c) => c.id)).toEqual(id === 'l' || id === 'r' ? [`g${id}`] : []);
    }
    for (const [x, y] of [['f', 'l'], ['f', 'r'], ['b', 'l'], ['b', 'r']]) expectComplementary(out, x!, y!);
    expect(plan.notes).toEqual(['Jointed 4 corners: 11 fingers, 3/8" wide (the outer two 5/16").']);
  });
});

describe('boxJointPlan: linked parts (spec §6; Spec difference 3 revised)', () => {
  const linkSides = (parts: Board[], opts: { rightMirrored?: boolean; leftMirrored?: boolean } = {}): SloydDocument => {
    const l = parts.find((b) => b.id === 'l')!;
    const r = parts.find((b) => b.id === 'r')!;
    const shape: Shape = { id: 's1', ...sharedOf(l) };
    const user = (b: Board, mirrored?: boolean): ShapedBoard =>
      ({ id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: 's1', ...(mirrored ? { mirrored: true as const } : {}) });
    return docOf(parts.map((b) => (b === l ? user(l, opts.leftMirrored) : b === r ? user(r, opts.rightMirrored ?? true) : b)) as Board[], { shapes: [shape] });
  };
  const linkFrontBack = (parts: Board[], backRotation: Rotation): SloydDocument => {
    const f = parts.find((b) => b.id === 'f')!;
    const shape: Shape = { id: 's2', ...sharedOf(f) };
    const user = (b: Board, rotation: Rotation): ShapedBoard => ({ id: b.id, name: b.name, position: b.position, rotation, shape: 's2' });
    return docOf(parts.map((b) => (b.id === 'f' ? user(b, 0) : b.id === 'b' ? user(b, backRotation) : b)) as Board[], { shapes: [shape] });
  };
  const oneShapeFor = (doc: SloydDocument, ids: string[]) => {
    const shapeIds = ids.map((id) => (doc.boards.find((b) => b.id === id) as ShapedBoard).shape);
    expect(new Set(shapeIds).size).toBe(1);
    expect(shapeIds[0]).toBeDefined();
  };
  const reachesOutside = (doc: SloydDocument) => {
    for (const id of ['f', 'b']) expect(closeIv([span(part(doc, id), 0)], [[0, 13]])).toBe(true);
    for (const id of ['l', 'r']) expect(closeIv([span(part(doc, id), 2)], [[0, 17]])).toBe(true);
  };

  it('linked, mirrored sides: one Shape both sides resolve, one cut-list row', () => {
    const doc = linkSides(drawerParts('butt'));
    const out = applyBoxJoints(doc, ok(boxJointPlan(doc, DRAWER_IDS, { width: 0.5, swap: false })));
    oneShapeFor(out, ['l', 'r']);
    for (const [x, y] of [['f', 'l'], ['f', 'r'], ['b', 'l'], ['b', 'r']]) expectComplementary(out, x!, y!);
    const rows = buildCutList(flatDocument(out)).groups.flatMap((g) => g.rows);
    expect(rows.find((r) => r.names.includes('Side left'))!.names).toEqual(['Side left', 'Side right']);
    expect(checkDesign(flatDocument(out), NO_LIMITS)).toEqual([]);
  });

  it('(a) linked Front/Back on the butt drawer, Back turned 180°: both grow, both reach the outside, checks clean', () => {
    const doc = linkFrontBack(drawerParts('butt'), 180);
    const out = applyBoxJoints(doc, ok(boxJointPlan(doc, DRAWER_IDS, { width: 0.5, swap: false })));
    oneShapeFor(out, ['f', 'b']);
    reachesOutside(out);
    for (const [x, y] of [['f', 'l'], ['f', 'r'], ['b', 'l'], ['b', 'r']]) expectComplementary(out, x!, y!);
    expect(checkDesign(flatDocument(out), NO_LIMITS)).toEqual([]);
  });

  it('(b) linked mirrored sides on the EMPTY drawer: both grow, both reach the outside, checks clean', () => {
    const doc = linkSides(drawerParts('empty'));
    const out = applyBoxJoints(doc, ok(boxJointPlan(doc, DRAWER_IDS, { width: 0.5, swap: false })));
    oneShapeFor(out, ['l', 'r']);
    reachesOutside(out);
    for (const [x, y] of [['f', 'l'], ['f', 'r'], ['b', 'l'], ['b', 'r']]) expectComplementary(out, x!, y!);
    expect(checkDesign(flatDocument(out), NO_LIMITS)).toEqual([]);
  });

  it('linked sides in a drawer assembly turned 90°: lands exactly (keepWorld)', () => {
    const inner = linkSides(drawerParts('empty'));
    const doc: SloydDocument = {
      ...createDocument('Turned'), shapes: inner.shapes, boards: [],
      instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [40, 0, 40], rotation: 90 }],
      definitions: [{ id: 'd1', boards: inner.boards, instances: [], hardware: [] }],
    };
    const ids = DRAWER_IDS.map((id) => `i1/${id}`);
    const out = applyBoxJoints(doc, ok(boxJointPlan(doc, ids, { width: 0.5, swap: false })));
    for (const [x, y] of [['f', 'l'], ['f', 'r'], ['b', 'l'], ['b', 'r']]) expectComplementary(out, `i1/${x}`, `i1/${y}`);
    expect(checkDesign(flatDocument(out), NO_LIMITS)).toEqual([]);
  });

  it('Front and Side left only, with the sides linked: the linked-mate sentence naming Side right', () => {
    const doc = linkSides(drawerParts('butt'));
    expectRefusal(doc, ['f', 'l'], "Side left is linked to Side right — select Side right's corner too, or Unlink first.");
  });

  it('linked fronts of two drawers that need different joints: the disagreement sentence', () => {
    const a = drawerParts('butt');
    const b = drawerParts('butt', { t: 0.75 }).map((p) => ({
      ...p, id: `${p.id}2`, name: `${p.name} 2`, position: [p.position[0] + 40, p.position[1], p.position[2]] as [number, number, number],
    }));
    // Front 2 is a 1/2" part between 3/4" sides: the same Shape as Front.
    const f2 = b.find((p) => p.id === 'f2')!;
    const f = a.find((p) => p.id === 'f')!;
    const shape: Shape = { id: 's3', ...sharedOf(f) };
    const user = (p: Board, x: number): ShapedBoard => ({ id: p.id, name: p.name, position: [x, 0, 0], rotation: 0, shape: 's3' });
    const parts = [...a.filter((p) => p !== f), ...b.filter((p) => p !== f2)];
    const doc = docOf([...parts, user(f, 0.5), user(f2, 40.75)] as Board[], { shapes: [shape] });
    expectRefusal(doc, doc.boards.map((x) => x.id), 'These linked parts would need different box joints: Front, Front 2.');
  });

  it('linked fronts of two identical drawers at non-dyadic X offsets: every offset succeeds, one Shape (the size at 1e-9)', () => {
    // Measured in the final review: the run-out size is a world subtraction (`e.far - p0`), so the same drawer at another
    // X offset can plan a size an ulp off; compared exactly, 14 of 40 offsets on the 7 mm grid refused as disagreeing.
    const mm = (v: number) => v / 25.4;
    const dims = { t: mm(12), h: mm(100), inside: [mm(300), mm(400)] as [number, number] };
    const offsets = [...Array.from({ length: 40 }, (_, i) => mm(7 * (i + 1) + 400)), 13.37, 20.01];
    const refused: string[] = [];
    for (const dx of offsets) {
      const a = drawerParts('butt', dims);
      const b = drawerParts('butt', dims).map((p) => ({
        ...p, id: `${p.id}2`, name: `${p.name} 2`, position: [p.position[0] + dx, p.position[1], p.position[2]] as [number, number, number],
      }));
      const f = a.find((p) => p.id === 'f')!;
      const f2 = b.find((p) => p.id === 'f2')!;
      const shape: Shape = { id: 's4', ...sharedOf(f) };
      const user = (p: Board): ShapedBoard => ({ id: p.id, name: p.name, position: p.position, rotation: 0, shape: 's4' });
      const parts = [...a.filter((p) => p !== f), ...b.filter((p) => p !== f2)];
      const doc = docOf([...parts, user(f), user(f2)] as Board[], { shapes: [shape], units: METRIC });
      const plan = boxJointPlan(doc, doc.boards.map((x) => x.id), { width: mm(12), swap: false });
      if (typeof plan === 'string') { refused.push(`${dx}: ${plan}`); continue; }
      const out = applyBoxJoints(doc, plan);
      oneShapeFor(out, ['f', 'f2']);
      for (const [x, y] of [['f', 'l'], ['f', 'r'], ['f2', 'l2'], ['f2', 'r2']]) expectComplementary(out, x!, y!);
    }
    expect(refused).toEqual([]);
  });

  it('every user mirrored on a non-dyadic size: the write would split the Shape, so the plan refuses (post-condition)', () => {
    // Found by search: lowering the mirrored founder's new cuts back through mirrorCut is not bit-exact here (a dado
    // across the side at 64 mm), so regroupShapes would leave the two sides on two Shapes.
    const mm = (v: number) => v / 25.4;
    const parts = drawerParts('empty', { t: mm(12), h: mm(100), inside: [mm(300), mm(400)] });
    const dado: Cut = { id: 'd', face: 'thickness', from: 'max', across: 'width', offset: mm(64), width: mm(12), depth: mm(6), stopMin: 0, stopMax: 0 };
    const withDado = parts.map((b) => (b.id === 'l' ? { ...b, cuts: [dado] } : b));
    const doc = { ...linkSides(withDado, { leftMirrored: true, rightMirrored: true }), units: METRIC };
    const before = JSON.stringify(doc);
    expect(boxJointPlan(doc, DRAWER_IDS, { width: mm(12), swap: false }))
      .toBe("Box joints can't keep these linked parts linked: Side left, Side right. Unlink them first.");
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('boxJointPlan: refusals (each leaves the document unchanged)', () => {
  const refuses = expectRefusal;

  it('a width of zero', () => refuses(docOf(drawerParts('butt')), DRAWER_IDS, BOX_WIDTH_POSITIVE, { width: 0 }));

  it('no corner at all', () => {
    const [f, b] = drawerParts('butt');
    refuses(docOf([f!, b!]), ['f', 'b'], BOX_NO_CORNER);
  });

  it('a part inside a mirrored copy', () => {
    const doc: SloydDocument = {
      ...createDocument('M'), boards: [],
      instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0, mirrored: true }],
      definitions: [{ id: 'd1', boards: drawerParts('butt'), instances: [], hardware: [] }],
    };
    refuses(doc, DRAWER_IDS.map((id) => `i1/${id}`), "Box joints can't reach a part inside a mirrored copy yet: Drawer › Front.");
  });

  it('the parts of a corner in different containers', () => {
    const [f, , l] = drawerParts('butt');
    const doc: SloydDocument = {
      ...createDocument('C'), boards: [f!],
      instances: [{ id: 'i1', name: 'Box', definition: 'd1', position: [0, 0, 0], rotation: 0 }],
      definitions: [{ id: 'd1', boards: [l!], instances: [], hardware: [] }],
    };
    refuses(doc, ['f', 'i1/l'], 'Front and Box › Side left must be in the same assembly.');
  });

  it('different heights along the joint', () => {
    const parts = drawerParts('butt').map((b) => (b.id === 'l' ? { ...b, width: 5 } : b));
    refuses(docOf(parts), DRAWER_IDS, 'Front and Side left must be the same height along the joint.');
  });

  it('one end meeting two parts', () => {
    const parts = drawerParts('butt');
    const l2 = { ...parts[2]!, id: 'l2', name: 'Side left 2' };
    refuses(docOf([...parts, l2]), [...DRAWER_IDS, 'l2'], 'Front meets two parts at one end.');
  });

  it('a three-way corner (a tray: four sides and a bottom jointed along its edges)', () => {
    const bottom = createBoard({ id: 'bt', name: 'Bottom', posture: 'flat', rotation: 0, length: 13, width: 17, thickness: T, position: [0, 0, 0] });
    expect(boardExtents(bottom)).toEqual([13, 0.5, 17]);
    refuses(docOf([...drawerParts('overlap'), bottom]), [...DRAWER_IDS, 'bt'],
      'Front would be box-jointed on two different edges — that isn\'t supported yet.');
  });

  it('too short for five fingers (H = 1.9, w = 1/2)', () => {
    refuses(docOf(drawerParts('butt', { h: 1.9 })), DRAWER_IDS, 'Front and Side left are too short for five fingers that wide — try narrower fingers.');
  });

  describe('plain stock only (spec §3.5)', () => {
    const tenon = { id: 'rt', end: 'max' as const, diameter: 0.25, length: 0.5 };
    const angle = { id: 'ac', ...taperCut({ face: 'thickness', from: 'max', end: 'min', amount: 0.125, start: 6 }) } as AngleCut;
    const curve = { id: 'cv', ...archCurve({ through: 'thickness', along: 'length', side: 'max', from: 'min', start: 4, span: 4, rise: 0.5 }) } as CurveCut;
    const profile: ProfileCut = { id: 'pf', face: 'max', kind: 'roundover', size: 0.125, facing: 'face',
      run: { start: { side: { across: 'width', from: 'max' }, from: 'min', at: 2 }, end: { side: { across: 'width', from: 'max' }, from: 'min', at: 8 } } };
    const bands = withBands([], [{ across: 'width', from: 'max' }], BUILT_IN_BAND_ID);
    const onBack = (patch: Partial<Board>) => drawerParts('butt').map((b) => (b.id === 'b' ? { ...b, ...patch } : b));
    it.each([
      ['an angle cut', { angleCuts: [angle] }],
      ['a curve', { curves: [curve] }],
      ['an edge profile', { profiles: [profile] }],
      ['edge banding', { bands }],
      ['a round tenon', { tenons: [tenon] }],
    ] as [string, Partial<Board>][])('%s', (word, patch) => {
      refuses(docOf(onBack(patch)), DRAWER_IDS, `Back has ${word} — box joints work on plain stock for now.`);
    });
    it('the copy order: a part with two features gets the earlier word', () => {
      refuses(docOf(onBack({ tenons: [tenon], angleCuts: [angle] })), DRAWER_IDS, 'Back has an angle cut — box joints work on plain stock for now.');
      refuses(docOf(onBack({ bands, curves: [curve] })), DRAWER_IDS, 'Back has a curve — box joints work on plain stock for now.');
    });
    it('a LEANING candidate (judged on its pre-lean box): the lean sentence, before the heights test', () => {
      // Side left leans and is also a different height from the top along the joint: the lean is decided first.
      const side = (id: string, name: string, x: number, width: number, lean?: Lean) => createBoard({
        id, name, posture: 'upright', rotation: 90, length: 30, width, thickness: 0.75, position: [x, 0, 0], ...(lean ? { lean } : {}),
      });
      const top = createBoard({ id: 't', name: 'Top', posture: 'flat', rotation: 0, length: 24, width: 11, thickness: 0.75, position: [0.75, 29.25, 0] });
      const l = side('l', 'Side left', 0, 10, { x: 0.05, z: 0, face: 'thickness' });
      expect(leans(l)).toBe(true);
      const doc = docOf([l, side('r', 'Side right', 24.75, 11), top]);
      refuses(doc, ['l', 'r', 't'], 'Side left has a lean — box joints work on plain stock for now.');
      // Unleaned, the same selection takes the heights sentence: the order is what the test above pins.
      const plain = docOf([side('l', 'Side left', 0, 10), side('r', 'Side right', 24.75, 11), top]);
      refuses(plain, ['l', 'r', 't'], 'Side left and Top must be the same height along the joint.');
    });
  });

  /** Side left (turn 90: length along +Z from min... read through endFacing) with one cut at its end facing Front. */
  const sideWith = (cut: Omit<Cut, 'id'>) => drawerParts('butt').map((b) => (b.id === 'l' ? { ...b, cuts: [{ id: 'x', ...cut }] } : b));
  const frontEnd = (): CutFrom => endFacing(drawerParts('butt')[2]!, 2, -1);

  it('a cut in the corner region that does not run through it', () => {
    const e = frontEnd();
    const L = 17;
    const offset = e === 'min' ? 0.1 : L - 0.3;
    refuses(docOf(sideWith({ face: 'thickness', from: 'max', across: 'width', offset, width: 0.2, depth: 0.25, stopMin: 0, stopMax: 0 })),
      DRAWER_IDS, 'Side left has a cut where the fingers go — remove it first.');
  });

  it('a PARTIAL-thickness rabbet across the end, over the fingers (the recogniser ignores it; the planner must not)', () => {
    const e = frontEnd();
    const offset = e === 'min' ? 0 : 17 - T;
    refuses(docOf(sideWith({ face: 'thickness', from: 'max', across: 'width', offset, width: T, depth: 0.25, stopMin: 0, stopMax: 0 })),
      DRAWER_IDS, 'Side left has a cut where the fingers go — remove it first.');
  });

  it('an end-grain mortise in the jointed end (resizeEnd cannot re-face it): the cut sentence, not a throw', () => {
    refuses(docOf(sideWith({ face: 'length', from: frontEnd(), across: 'width', offset: 0.15, width: 0.2, depth: 0.3, stopMin: 1, stopMax: 1 })),
      DRAWER_IDS, 'Side left has a cut where the fingers go — remove it first.');
  });

  it('an end rabbet WIDER than the other part\'s thickness (it runs past the region, but across J, not along the run)', () => {
    const offset = frontEnd() === 'min' ? 0 : 17 - 0.75;
    refuses(docOf(sideWith({ face: 'thickness', from: 'max', across: 'width', offset, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 })),
      DRAWER_IDS, 'Side left has a cut where the fingers go — remove it first.');
  });

  it('a rectangular tenon\'s cheeks, longer than the other part\'s thickness, on an end that does not move', () => {
    // The butt drawer's sides do not move; two cheeks 3/4" long (the front is 1/2" thick) leave a centred tenon.
    const e = frontEnd();
    const offset = e === 'min' ? 0 : 17 - 0.75;
    const cheek = (id: string, from: CutFrom): Cut => ({ id, face: 'thickness', from, across: 'width', offset, width: 0.75, depth: 0.125, stopMin: 0, stopMax: 0 });
    const parts = drawerParts('butt').map((b) => (b.id === 'l' ? { ...b, cuts: [cheek('c1', 'min'), cheek('c2', 'max')] } : b));
    refuses(docOf(parts), DRAWER_IDS, 'Side left has a cut where the fingers go — remove it first.');
  });

  it('a hole touching the corner region', () => {
    const e = frontEnd();
    const row: HoleRow = { id: 'h', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.25, along: 'length', alongFrom: e, station: 0.25, count: 1, pitch: 1, acrossFrom: 'min', inset: 2 };
    const parts = drawerParts('butt').map((b) => (b.id === 'l' ? { ...b, holes: [row] } : b));
    refuses(docOf(parts), DRAWER_IDS, 'Side left has a hole where the fingers go.');
  });
});

describe('boxJointPlan: notes', () => {
  it('a shelf touching nothing at a corner: success, the ignored line last', () => {
    // Mid-depth and clear of the drawer: no end of it lies in any drawer part's slab, so it is no candidate under spec
    // §3.1's two tests alone (independent of the J-overlap rule, which the stacked-drawer test pins).
    const shelf = createBoard({ id: 's', name: 'Shelf', length: 10, width: 4, thickness: T, position: [30, 0, 6] });
    const doc = docOf([...drawerParts('butt'), shelf]);
    const plan = ok(boxJointPlan(doc, [...DRAWER_IDS, 's'], { width: 0.5, swap: false }));
    expect(plan.notes.at(-1)).toBe("Shelf isn't at a corner with another selected part.");
    expect(plan.parts.has('s')).toBe(false);
  });

  it('the jointed line: singular, every finger w (no parenthesis), and per corner when the layouts differ', () => {
    const [f, , l] = drawerParts('butt');
    expect(ok(boxJointPlan(docOf([f!, l!]), ['f', 'l'], { width: 0.5, swap: false })).notes)
      .toEqual(['Jointed 1 corner: 7 fingers, 1/2" wide (the outer two 3/4").', 'Front is now 1/2" longer.']);
    const [f45, , l45] = drawerParts('butt', { h: 4.5 });
    expect(ok(boxJointPlan(docOf([f45!, l45!]), ['f', 'l'], { width: 0.5, swap: false })).notes[0])
      .toBe('Jointed 1 corner: 9 fingers, 1/2" wide.');
    const [f6, , l6] = drawerParts('butt', { h: 6 }).map((b) => ({
      ...b, id: `${b.id}2`, name: `${b.name} 2`, position: [b.position[0] + 40, b.position[1], b.position[2]] as [number, number, number],
    }));
    const two = ok(boxJointPlan(docOf([f!, l!, f6!, l6!]), ['f', 'l', 'f2', 'l2'], { width: 0.5, swap: false }));
    expect(two.notes.slice(0, 3)).toEqual([
      'Jointed 2 corners:',
      'Front and Side left: 7 fingers, 1/2" wide (the outer two 3/4").',
      'Front 2 and Side left 2: 11 fingers, 1/2" wide (the outer two 3/4").',
    ]);
  });

  it('a metric drawer (12 mm stock): the default width is 12 mm and the notes print mm', () => {
    const mm = (v: number) => v / 25.4;
    const parts = drawerParts('butt', { t: mm(12), h: mm(100), inside: [mm(300), mm(400)] });
    const doc = docOf(parts, { units: METRIC });
    const w = defaultFingerWidth(mm(12), METRIC);
    expect(w).toBe(12 / 25.4);
    const plan = ok(boxJointPlan(doc, DRAWER_IDS, { width: w, swap: false }));
    expect(plan.notes[0]).toBe('Jointed 4 corners: 9 fingers, 12 mm wide (the outer two 8 mm).');
    expect(plan.notes.slice(1)).toEqual(['Front is now 24 mm longer.', 'Back is now 24 mm longer.']);
    const out = applyBoxJoints(doc, plan);
    for (const [x, y] of [['f', 'l'], ['f', 'r'], ['b', 'l'], ['b', 'r']]) expectComplementary(out, x!, y!);
    expect(checkDesign(flatDocument(out), NO_LIMITS)).toEqual([]);
  });
});
