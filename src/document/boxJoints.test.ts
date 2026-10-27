import { createBoard } from './document';
import { defaultFingerWidth, fingerLayout, fingerSetAt, fingerSets, notchCuts, segment, type FingerLayout } from './boxJoints';
import { refaceFromEnd } from './resizeEnd';
import { findTenons } from './tenons';
import { IMPERIAL, type Units } from '../units/length';
import type { Board, Cut, CutFrom, Dimension } from './types';

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
