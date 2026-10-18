import { describe, expect, it } from 'vitest';
import { FRONT, SIDE, TOP, drawView, type Drawing, type Seg2 } from '../document/drawing';
import { partFeatures, type PartFeature } from '../document/featureKeys';
import { topCorners } from '../document/sweepFixtures';
import { IMPERIAL } from '../units/length';
import { KEY_LEADER, chooseView, letterOf, planKeys, type KeyView } from './planKeys';

const seg = (a: [number, number], b: [number, number], part: string, feature?: string): Seg2 => (feature ? { a, b, part, feature } : { a, b, part });
const drawing = (visible: Seg2[], hidden: Seg2[] = []): Drawing => ({ visible, hidden, bounds: { min: [0, 0], max: [10, 10] } });
// A part's outline (untagged) 0..10 square, and a feature segment.
const box = (part: string) => [seg([0, 0], [10, 0], part), seg([10, 0], [10, 10], part), seg([10, 10], [0, 10], part), seg([0, 10], [0, 0], part)];
const views = (plan: Drawing, front: Drawing, side: Drawing): KeyView[] => [
  { view: TOP, d: plan, at: { x: 0, y: 0 } }, { view: FRONT, d: front, at: { x: 0, y: 200 } }, { view: SIDE, d: side, at: { x: 200, y: 200 } },
];
const hole = (key: string, text = 'Hole 1/4" dia × 3/8" deep', part = 'p'): PartFeature =>
  ({ key, tags: [key], part, text, trueAxis: [0, 1, 0], trueNormal: null });
const empty = drawing([]);

describe('letterOf', () => {
  it('A…Z then AA, AB', () => {
    expect([0, 25, 26, 27, 51, 52].map(letterOf)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });
});

describe('chooseView (spec §2.3, ruling P2)', () => {
  const f = hole('p:hole:r');                     // true in Plan (looks down Y)
  const tagged = (hidden: boolean) => (hidden ? drawing(box('p'), [seg([2, 2], [3, 3], 'p', 'p:hole:r')]) : drawing([...box('p'), seg([2, 2], [3, 3], 'p', 'p:hole:r')]));
  it('1: true and visible beats visible elsewhere', () => {
    expect(chooseView(f, views(tagged(false), tagged(false), empty))).toEqual({ i: 0, hidden: false });
  });
  it('2: visible elsewhere beats true but hidden', () => {
    expect(chooseView(f, views(tagged(true), tagged(false), empty))).toEqual({ i: 1, hidden: false });
  });
  it('3: true and hidden when no view shows it visible (R4: shelf pins inside a case)', () => {
    expect(chooseView(f, views(tagged(true), tagged(true), empty))).toEqual({ i: 0, hidden: true });
  });
  it('P2: no true view, hidden only: the first hidden view in tie order Front, Side, Plan', () => {
    const k = 1 / Math.sqrt(3);   // sloped in all three axes: no elevation looks along its plane
    const compound = { ...f, trueAxis: null, trueNormal: [k, k, k] as [number, number, number] };
    expect(chooseView(compound, views(tagged(true), empty, tagged(true)))).toEqual({ i: 2, hidden: true });
  });
  it('4: drawn nowhere is null', () => {
    expect(chooseView(f, views(empty, empty, empty))).toBeNull();
  });
  it('an angle cut is true where the view direction lies in its plane; ties go Front, Side, Plan', () => {
    const miter: PartFeature = { key: 'p:angle:m', tags: ['p:angle:m'], part: 'p', text: 'Miter 45.0°', trueAxis: null, trueNormal: [Math.SQRT1_2, Math.SQRT1_2, 0] };
    const vis = drawing([...box('p'), seg([2, 2], [3, 3], 'p', 'p:angle:m')]);
    // normal ⟂ Z (Front) only: Front is its true view even though Plan also draws it.
    expect(chooseView(miter, views(vis, vis, vis))).toEqual({ i: 1, hidden: false });
  });
});

describe('planKeys (spec §4.2–4.6)', () => {
  const size = { width: 400, height: 400 };
  it('letters by identical key line, in reading order Plan, Front, Side; counts every instance', () => {
    const plan = drawing([...box('p'), seg([9, 9], [10, 10], 'p', 'p:hole:r'), ...box('q'), seg([1, 1], [0, 0], 'q', 'q:hole:r')]);
    const front = drawing([...box('p'), seg([1, 1], [2, 2], 'p', 'p:angle:m')]);
    const fs: PartFeature[] = [
      { key: 'p:angle:m', tags: ['p:angle:m'], part: 'p', text: 'Miter 45.0°', trueAxis: null, trueNormal: [Math.SQRT1_2, Math.SQRT1_2, 0] },
      hole('p:hole:r'), hole('q:hole:r', undefined, 'q'),
    ];
    const k = planKeys(fs, views(plan, front, empty), 1, size);
    expect(k.lines.map((l) => [l.letter, l.text, l.count, l.shown])).toEqual([
      ['A', 'Hole 1/4" dia × 3/8" deep', 2, 'Hole 1/4" dia × 3/8" deep (2×)'],
      ['B', 'Miter 45.0°', 1, 'Miter 45.0°'],
    ]);
  });
  it('a faulted line never shares a letter with a clean one', () => {
    const plan = drawing([...box('p'), seg([9, 9], [10, 10], 'p', 'p:hole:a'), seg([1, 1], [0, 0], 'p', 'p:hole:b')]);
    const k = planKeys([hole('p:hole:a'), hole('p:hole:b', 'Hole 1/4" dia × 3/8" deep — check the cut list')], views(plan, empty, empty), 1, size);
    expect(k.lines.map((l) => l.letter)).toEqual(['A', 'B']);
  });
  it('the anchor is the feature point farthest from its part centre; the leader runs outward', () => {
    const plan = drawing([...box('p'), seg([6, 6], [9, 9], 'p', 'p:hole:r')]);
    // The plan view placed at (100, 100), clear of the figure's edges, so the clamp does not touch the leader.
    const vs = views(plan, empty, empty).map((v, i) => (i === 0 ? { ...v, at: { x: 100, y: 100 } } : v));
    const k = planKeys([hole('p:hole:r')], vs, 10, size);
    const t = k.tags[0]!;
    // drawing (9,9) → SVG (190, 110) at scale 10 (y flips about bounds.max = 10); the part centre (5,5) → (150, 150).
    expect(t.anchor).toEqual([190, 110]);
    expect(Math.hypot(t.centre[0] - 190, t.centre[1] - 110)).toBeCloseTo(KEY_LEADER + k.radius, 6);
    expect(t.centre[0]).toBeGreaterThan(190);
    expect(t.centre[1]).toBeLessThan(110);
  });
  it('same-letter tags closer than a diameter merge (lined-up pin rows)', () => {
    const front = drawing([...box('p'), seg([9, 5], [10, 5], 'p', 'p:hole:r'), ...box('q'), seg([9, 5], [10, 5.001], 'q', 'q:hole:r')]);
    const fs = [hole('p:hole:r'), hole('q:hole:r', undefined, 'q')].map((f) => ({ ...f, trueAxis: [0, 0, 1] as [number, number, number] }));
    const k = planKeys(fs, views(empty, front, empty), 10, size);
    expect(k.tags).toHaveLength(1);
    expect(k.lines[0]!.count).toBe(2);
  });
  it('different letters never overlap: pushed out along their leaders (mutate the push to see it fail)', () => {
    const plan = drawing([...box('p'), seg([10, 10], [10, 10.0001], 'p', 'p:hole:a'), seg([10, 10], [9.9999, 10], 'p', 'p:angle:b')]);
    const fs: PartFeature[] = [hole('p:hole:a'), { key: 'p:angle:b', tags: ['p:angle:b'], part: 'p', text: 'Miter 45.0°', trueAxis: null, trueNormal: [0, 1, 0] }];
    const k = planKeys(fs, views(plan, empty, empty), 10, size);
    for (const [i, a] of k.tags.entries()) for (const b of k.tags.slice(i + 1)) {
      expect(Math.hypot(a.centre[0] - b.centre[0], a.centre[1] - b.centre[1])).toBeGreaterThanOrEqual(2 * k.radius - 1e-9);
    }
    // There is room to push outward (a 400 × 400 figure), so both are placed, none dropped to the note.
    expect(k.tags).toHaveLength(2);
    expect(k.unkeyed).toEqual([]);
  });
  it('with no room to push clear, the later letter is not drawn and is listed as not keyed (§4.6)', () => {
    const plan = drawing([...box('p'), seg([10, 10], [10, 10.0001], 'p', 'p:hole:a'), seg([10, 10], [9.9999, 10], 'p', 'p:angle:b')]);
    const fs: PartFeature[] = [hole('p:hole:a'), { key: 'p:angle:b', tags: ['p:angle:b'], part: 'p', text: 'Miter 45.0°', trueAxis: null, trueNormal: [0, 1, 0] }];
    // A figure barely wider than one tag: the clamp pins both tags to the same spot.
    const k = planKeys(fs, views(plan, empty, empty), 1, { width: 30, height: 30 });
    expect(k.tags.map((t) => t.letter)).toEqual(['A']);
    expect(k.unkeyed).toEqual(['B']);
    expect(k.lines.map((l) => l.letter)).toEqual(['A', 'B']);
  });
  it('a tag never leaves the figure (Review Focus 4)', () => {
    const plan = drawing([...box('p'), seg([0, 10], [0, 10.0001], 'p', 'p:hole:r')]);   // the top-left corner
    const k = planKeys([hole('p:hole:r')], views(plan, empty, empty), 10, { width: 120, height: 120 });
    const t = k.tags[0]!;
    expect(t.centre[0]).toBeGreaterThanOrEqual(k.radius);
    expect(t.centre[1]).toBeGreaterThanOrEqual(k.radius);
  });
  it('a feature drawn nowhere is listed as not shown, once per key line', () => {
    const k = planKeys([hole('p:hole:a'), hole('q:hole:a', undefined, 'q')], views(empty, empty, empty), 1, size);
    expect(k.notShown).toEqual(['Hole 1/4" dia × 3/8" deep']);
    expect(k.tags).toEqual([]);
  });
  it('a densely drilled part (160k segments) does not overflow the stack (final review #1)', () => {
    // ~190 segments per hole looking down its axis: 444 shelf-pin holes on one side panel gave 85k segments, and spreading
    // every endpoint into Math.min/max threw RangeError, blanking the app.
    const many: Seg2[] = [...box('p')];
    for (let i = 0; i < 160_000; i += 1) many.push(seg([i % 10, 1], [i % 10, 2], 'p', 'p:hole:r'));
    const k = planKeys([hole('p:hole:r')], views(drawing(many), empty, empty), 1, size);
    expect(k.tags).toHaveLength(1);
  });
  it('no features: an empty plan', () => {
    expect(planKeys([], views(empty, empty, empty), 1, size)).toMatchObject({ tags: [], lines: [], notShown: [], unkeyed: [] });
  });
});

describe('a swept profile on real drawings (profile runs b1, Task 8)', () => {
  // A roundover loop draws no crease (its band meets the face tangent): only its silhouettes, which vary by view. chooseView
  // copes with views where it has nothing tagged; here the Plan view draws its contour round the top, so it is keyed there,
  // true (looking down the thickness) and visible.
  it('a roundover loop on the 2" corner top is lettered in the Plan view, true and visible', () => {
    const b = { ...topCorners(2), id: 't' };
    const kv: KeyView[] = [TOP, FRONT, SIDE].map((view, i) => ({ view, d: drawView([b], view), at: { x: 0, y: i * 300 } }));
    const fs = partFeatures(b, IMPERIAL);
    const w = fs.find((f) => f.text === 'Roundover 1/4", all round')!;
    expect(kv.map((v) => v.d.visible.some((s) => s.feature === w.key))).toEqual([true, true, true]);
    expect(chooseView(w, kv)).toEqual({ i: 0, hidden: false });
    const k = planKeys(fs, kv, 1, { width: 2000, height: 2000 });
    expect(k.notShown).toEqual([]);
    expect(k.lines.map((l) => l.text)).toContain('Roundover 1/4", all round');
  });
});
