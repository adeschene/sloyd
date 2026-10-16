import type { Drawing, Seg2 } from '../document/drawing';
import { labelHeight, labelWidth } from './diagramLabels';
import { ISO_MARGIN, ISO_MAX_HEIGHT, PLAN_WIDTH, TRIO_MAX_HEIGHT, layoutSingle } from './planLayout';
import { BALLOON_GAP, BALLOON_PAD, anchorsFor, balloonRadius, layoutBalloons, numberList } from './planBalloons';

const seg = (part: string, a: [number, number], b: [number, number]): Seg2 => ({ part, a, b });
const drawing = (visible: Seg2[]): Drawing => {
  const xs = visible.flatMap((s) => [s.a[0], s.b[0]]);
  const ys = visible.flatMap((s) => [s.a[1], s.b[1]]);
  return { visible, hidden: [], bounds: { min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)] } };
};
// A 40 x 20 drawing: part L on the left, part R on the right, part M in the middle-left.
const D = drawing([
  seg('L', [0, 0], [0, 20]), seg('L', [0, 20], [4, 20]),
  seg('R', [40, 0], [40, 10]), seg('R', [36, 10], [40, 10]),
  seg('M', [10, 5], [18, 5]),
]);

describe('anchorsFor', () => {
  it('anchors on the midpoint of the most visible part\'s longest segment, and sides by the drawing\'s centre', () => {
    const { anchors, hidden } = anchorsFor(D, [{ number: 1, boardIds: ['R', 'L'] }, { number: 2, boardIds: ['M'] }]);
    expect(hidden).toEqual([]);
    // L has 24" of visible line against R's 14": L wins although R is listed first; its longest segment is x = 0.
    expect(anchors[0]).toEqual({ number: 1, side: 'left', at: [0, 10] });
    expect(anchors[1]).toEqual({ number: 2, side: 'left', at: [14, 5] });
  });
  it('breaks a visible-length tie toward the first part listed', () => {
    const t = drawing([seg('A', [0, 0], [10, 0]), seg('B', [30, 0], [40, 0])]);
    expect(anchorsFor(t, [{ number: 1, boardIds: ['B', 'A'] }]).anchors[0].at).toEqual([35, 0]);
  });
  it('sends a row with no visible segment to `hidden`', () => {
    expect(anchorsFor(D, [{ number: 4, boardIds: ['gone'] }])).toEqual({ anchors: [], hidden: [4] });
  });
  it('never anchors on, or counts, a zero-length segment (Review Focus 4)', () => {
    const z = drawing([seg('A', [5, 5], [5, 5]), seg('A', [0, 0], [2, 0]), seg('B', [30, 0], [30, 1])]);
    const { anchors } = anchorsFor(z, [{ number: 1, boardIds: ['A'] }]);
    expect(anchors[0].at).toEqual([1, 0]);
    expect(anchorsFor(drawing([seg('A', [5, 5], [5, 5]), seg('B', [0, 0], [1, 0])]), [{ number: 2, boardIds: ['A'] }]).hidden).toEqual([2]);
  });
});

describe('layoutBalloons', () => {
  it('with no balloons is exactly layoutSingle', () => {
    const lay = layoutBalloons(D, { anchors: [], hidden: [] });
    const single = layoutSingle(D.bounds);
    expect({ scale: lay.scale, width: lay.width, height: lay.height, at: lay.at }).toEqual(single);
    expect(lay.placed).toEqual([]);
  });
  it('reserves a column only on a side that has balloons (Review Focus 1)', () => {
    const one = layoutBalloons(D, anchorsFor(D, [{ number: 1, boardIds: ['R'] }]));
    const r = one.radius;
    expect(one.placed).toHaveLength(1);
    expect(one.placed[0].side).toBe('right');
    expect(one.at.x).toBe(ISO_MARGIN);                                   // no left column
    expect(one.placed[0].centre[0]).toBeCloseTo(one.width - ISO_MARGIN - r, 9);
    expect(one.width).toBeLessThanOrEqual(PLAN_WIDTH + 1e-9);
  });
  it('sizes every balloon from the widest number, measured (inv 19; Review Focus 3)', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ number: i + 1, boardIds: [i % 2 ? 'L' : 'R'] }));
    const plan = anchorsFor(D, rows);
    expect(balloonRadius(plan.anchors)).toBe(Math.max(labelWidth('12'), labelHeight()) / 2 + BALLOON_PAD);
    expect(layoutBalloons(D, plan).radius).toBe(balloonRadius(plan.anchors));
  });
  it('packs a column without overlap, each leader ending on its own anchor (fu 71; Review Focus 2)', () => {
    // Five rows on two left parts, three anchored on the SAME point: the column must cascade them, and the two anchors
    // differ, so a leader sent to another balloon's anchor shows.
    const rows = Array.from({ length: 5 }, (_, i) => ({ number: i + 1, boardIds: [i % 2 ? 'M' : 'L'] }));
    const plan = anchorsFor(D, rows);
    const lay = layoutBalloons(D, plan);
    const ys = lay.placed.map((p) => p.centre[1]);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(2 * lay.radius + BALLOON_GAP - 1e-9);
    const toSvg = (p: [number, number]) => [lay.at.x + (p[0] - D.bounds.min[0]) * lay.scale, lay.at.y + (D.bounds.max[1] - p[1]) * lay.scale];
    for (const p of lay.placed) expect(p.anchor).toEqual(toSvg(plan.anchors.find((a) => a.number === p.number)!.at));
  });
  it('orders a column by anchor height, top first', () => {
    const t = drawing([seg('Hi', [0, 18], [2, 18]), seg('Lo', [0, 2], [2, 2]), seg('X', [40, 0], [40, 20])]);
    const lay = layoutBalloons(t, anchorsFor(t, [{ number: 1, boardIds: ['Lo'] }, { number: 2, boardIds: ['Hi'] }]));
    const left = lay.placed.filter((p) => p.side === 'left');
    expect(left.map((p) => p.number)).toEqual([2, 1]);
    expect(left[0].centre[1]).toBeLessThan(left[1].centre[1]);
  });
  it('grows the figure for a tall column, up to TRIO_MAX_HEIGHT, and notes the rows past it', () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ number: i + 1, boardIds: ['L'] }));
    const lay = layoutBalloons(D, anchorsFor(D, rows));
    expect(lay.height).toBeLessThanOrEqual(TRIO_MAX_HEIGHT + 1e-9);
    expect(lay.height).toBeGreaterThan(ISO_MAX_HEIGHT);
    expect(lay.placed.length + lay.unplaced.length).toBe(80);
    expect(lay.unplaced.length).toBeGreaterThan(0);
    const maxY = Math.max(...lay.placed.map((p) => p.centre[1] + lay.radius));
    expect(maxY).toBeLessThanOrEqual(lay.height - ISO_MARGIN + 1e-9);
  });
});

describe('numberList', () => {
  it('collapses runs of three or more with an en dash', () => {
    expect(numberList([9, 7])).toBe('7, 9');
    expect(numberList([33, 34, 35, 36, 40, 41])).toBe('33–36, 40, 41');
  });
});
