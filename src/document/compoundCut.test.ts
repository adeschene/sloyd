import { describe, expect, it } from 'vitest';
import type { AngleCut, Board, HoleRow, RoundTenon } from './types';
import { createBoard, flatDocument, migrateDocument, createDocument } from './document';
import {
  angleCutRemovesNothing, angleCutsThatRemoveStock, depthAt, depthAtCross, keptHalfSpace, touchedRegion,
} from './angleCuts';
import { overruns } from './featureKeys';
import { deepestDepth, shoulderAt, tenonFaults, builtTenons } from './roundTenons';
import { seatedIn, tipFarthest } from './tenonJoints';
import { boardBodies, bodyVolume } from './bodies';
import { holeInstances } from './holes';
import { toWorld } from './snapPoints';
import { TOUCH } from './checkTolerances';

/**
 * Square-set legs spec §3.1, §4 (Task 2): every geometry reader honours a compound end miter's FULL depth,
 * `depthAt(c, s) + rise · (t − T/2)`. Expected depths, volumes and tips are worked out by hand from the stored numbers
 * (never through `depthAtCross`), and a single-slope cut's results are pinned to values captured BEFORE the change.
 */

const part = (dims: [number, number, number], cut: AngleCut): Board =>
  ({ ...createBoard({ name: 'P', length: dims[0], width: dims[1], thickness: dims[2] }), angleCuts: [cut] });
const volume = (b: Board) => boardBodies(b).reduce((s, x) => s + bodyVolume(x), 0);
const LEG: [number, number, number] = [16, 1.5, 1.5];

/** At the length's min end, along thickness (from min), across width (from min): k = −0.2, rise 0.1. No corner clipped. */
const C1: AngleCut = { id: 'c1', kind: 'miter', face: 'length', from: 'min', along: 'thickness', alongFrom: 'min', points: [[0, 0.5], [1.5, 0.2]], across: { rise: 0.1, from: 'min' } };
/** k = −0.1, rise 0.3: exactly one corner, (s = 1.5, t = 0), reads −0.075. */
const CLIP_MIN: AngleCut = { id: 'c2', kind: 'miter', face: 'length', from: 'min', along: 'thickness', alongFrom: 'min', points: [[0, 0.3], [1.5, 0.15]], across: { rise: 0.3, from: 'min' } };
/** CLIP_MIN's depths with every flag at max: the length's max end, along width from max, across thickness from max. */
const CLIP_MAX: AngleCut = { id: 'c3', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'max', points: [[0, 0.3], [1.5, 0.15]], across: { rise: 0.3, from: 'max' } };
/** Review Focus 1: at or below 0 at both along ends on the centre line; only the corner (s = 0, t = T) bites, by 0.075. */
const CORNER: AngleCut = { id: 'c4', kind: 'miter', face: 'length', from: 'min', along: 'thickness', alongFrom: 'min', points: [[0, 0], [1.5, -0.1]], across: { rise: 0.1, from: 'min' } };

/** The board-local point of the cut's plane at station s (from alongFrom), cross position t (from across.from), depth q. */
function local(b: Board, c: AngleCut, s: number, t: number, q: number): [number, number, number] {
  const p = { length: 0, width: 0, thickness: 0 };
  const at = (dim: keyof typeof p, from: 'min' | 'max', v: number) => { p[dim] = from === 'min' ? v : b[dim] - v; };
  const through = (['length', 'width', 'thickness'] as const).find((d) => d !== c.face && d !== c.along)!;
  at(c.face, c.from, q);
  at(c.along, c.alongFrom, s);
  at(through, c.across!.from, t);
  return [p.length, p.width, p.thickness];
}
const CORNERS: [number, number][] = [[0, 0], [0, 1.5], [1.5, 0], [1.5, 1.5]];

describe('depthAtCross: the full depth (spec §3.1)', () => {
  it('reads the four corners of each compound cut, worked by hand', () => {
    const cases: [AngleCut, number[]][] = [
      [C1, [0.425, 0.575, 0.125, 0.275]],
      [CLIP_MIN, [0.075, 0.525, -0.075, 0.375]],
      [CLIP_MAX, [0.075, 0.525, -0.075, 0.375]],
      [CORNER, [-0.075, 0.075, -0.175, -0.025]],
    ];
    for (const [c, want] of cases) {
      const b = part(LEG, c);
      CORNERS.forEach(([s, t], i) => expect(depthAtCross(c, b, s, t), `${c.id} ${s},${t}`).toBeCloseTo(want[i]!, 12));
    }
  });

  it('is exactly depthAt on the centre line, and exactly depthAt for a single-slope cut anywhere', () => {
    const b = part(LEG, C1);
    for (const s of [0, 0.3, 0.75, 1.5]) expect(depthAtCross(C1, b, s, 0.75)).toBe(depthAt(C1, s));
    const { across: _, ...plain } = C1;
    for (const s of [0, 0.75, 1.5]) for (const t of [0, 0.4, 1.5]) expect(depthAtCross(plain, b, s, t)).toBe(depthAt(plain, s));
  });
});

describe('keptHalfSpace carries the across term (spec §4)', () => {
  it('its plane holds the four corners to 1e-9, its normal is unit, and the kept side is the part', () => {
    for (const c of [C1, CLIP_MIN, CLIP_MAX, CORNER]) {
      const b = part(LEG, c);
      const h = keptHalfSpace(b, c)!;
      expect(Math.hypot(...h.n)).toBeCloseTo(1, 14);
      const want = c === C1 ? [0.425, 0.575, 0.125, 0.275] : c === CORNER ? [-0.075, 0.075, -0.175, -0.025] : [0.075, 0.525, -0.075, 0.375];
      CORNERS.forEach(([s, t], i) => {
        const p = local(b, c, s, t, want[i]!);
        expect(Math.abs(h.n[0] * p[0] + h.n[1] * p[1] + h.n[2] * p[2] + h.d), `${c.id} ${s},${t}`).toBeLessThanOrEqual(1e-9);
        // 0.01 deeper is kept wood; 0.01 shallower is waste.
        const deeper = local(b, c, s, t, want[i]! + 0.01);
        const shallower = local(b, c, s, t, want[i]! - 0.01);
        expect(h.n[0] * deeper[0] + h.n[1] * deeper[1] + h.n[2] * deeper[2] + h.d).toBeGreaterThan(0);
        expect(h.n[0] * shallower[0] + h.n[1] * shallower[1] + h.n[2] * shallower[2] + h.d).toBeLessThan(0);
      });
    }
  });

  it('boardBodies: the analytic volume, to 1e-9', () => {
    // No corner clipped: removed = the mean corner depth × W × T = 0.35 · 2.25.
    expect(Math.abs(volume(part(LEG, C1)) - (36 - 0.7875))).toBeLessThanOrEqual(1e-9);
    // One corner at −0.075 whose zero line meets its edges 0.75 and 0.25 away: removed = 0.225 · 2.25 + 0.075 · 0.75 · 0.25 / 6.
    expect(Math.abs(volume(part(LEG, CLIP_MIN)) - (36 - 0.50859375))).toBeLessThanOrEqual(1e-9);
    expect(Math.abs(volume(part(LEG, CLIP_MAX)) - (36 - 0.50859375))).toBeLessThanOrEqual(1e-9);
    // Review Focus 1: the one biting corner, 0.075 deep, its zero line 1.125 and 0.75 away: 0.075 · 1.125 · 0.75 / 6.
    expect(Math.abs(volume(part(LEG, CORNER)) - (36 - 0.010546875))).toBeLessThanOrEqual(1e-9);
  });
});

describe('a cut biting at one across corner only (Review Focus 1)', () => {
  it('removes stock, and the cut list sees it', () => {
    const b = part(LEG, CORNER);
    // On the centre line it reads 0 and −0.1 at the along ends: the single-slope reading would say "nothing".
    expect(Math.max(depthAt(CORNER, 0), depthAt(CORNER, 1.5))).toBe(0);
    expect(angleCutRemovesNothing(b, CORNER)).toBe(false);
    expect(angleCutsThatRemoveStock(b)).toEqual([CORNER]);
  });

  it('a compound cut whose every corner reads ≤ 0 removes nothing', () => {
    const c: AngleCut = { ...CORNER, points: [[0, -0.1], [1.5, -0.2]] }; // deepest corner −0.025
    expect(angleCutRemovesNothing(part(LEG, c), c)).toBe(true);
    expect(touchedRegion(part(LEG, c), c)).toBeNull();
  });
});

describe('touchedRegion holds every point of the cut plane inside the part (spec §4)', () => {
  it('for each compound cut, on a 31 × 31 grid', () => {
    for (const c of [C1, CLIP_MIN, CLIP_MAX, CORNER]) {
      const b = part(LEG, c);
      const r = touchedRegion(b, c)!;
      const [[s1, q1], [s2, q2]] = c.points;
      let inside = 0;
      for (let i = 0; i <= 30; i += 1) {
        for (let j = 0; j <= 30; j += 1) {
          const s = (1.5 * i) / 30;
          const t = (1.5 * j) / 30;
          const q = q1 + ((q2 - q1) * (s - s1)) / (s2 - s1) + c.across!.rise * (t - 0.75);
          if (!(q > 0)) continue;
          inside += 1;
          const p = local(b, c, s, t, q);
          (['length', 'width', 'thickness'] as const).forEach((d, k) => {
            expect(p[k]!, `${c.id} ${d} at ${s},${t}`).toBeGreaterThanOrEqual(r[d][0] - 1e-12);
            expect(p[k]!, `${c.id} ${d} at ${s},${t}`).toBeLessThanOrEqual(r[d][1] + 1e-12);
          });
        }
      }
      expect(inside, c.id).toBeGreaterThan(0);
    }
  });

  it('is tight: CORNER reaches 0.075 into the length over stations 0 to 1.125', () => {
    const r = touchedRegion(part(LEG, CORNER), CORNER)!;
    expect(r.length[0]).toBe(0);
    expect(r.length[1]).toBeCloseTo(0.075, 12);
    expect(r.thickness[0]).toBe(0);
    expect(r.thickness[1]).toBeCloseTo(1.125, 12);
    expect(r.width).toEqual([0, 1.5]);
  });
});

describe('overruns and deepestDepth read the deepest corner', () => {
  it('a compound cut on a 0.5" part whose centre line stays inside but a corner passes it overruns', () => {
    const c: AngleCut = { ...C1, points: [[0, 0.4], [1.5, 0.4]], across: { rise: 0.2, from: 'max' } };
    const b = part([0.5, 1.5, 1.5], c);
    expect(Math.max(depthAt(c, 0), depthAt(c, 1.5))).toBe(0.4);
    expect(overruns(b, c)).toBe(true);
  });

  it('deepestDepth is the deepest corner, worked by hand', () => {
    expect(deepestDepth(part(LEG, C1), 'min')).toBeCloseTo(0.575, 12);
    expect(deepestDepth(part(LEG, CLIP_MAX), 'max')).toBeCloseTo(0.525, 12);
  });
});

describe('round tenons on a compound tip (spec §4, Review Focus 3)', () => {
  it('centreDepth is exact by construction: the shoulder is the single-slope twin\'s, bit for bit', () => {
    const { across: _, ...twin } = C1;
    const t = { end: 'min' as const, length: 1 };
    expect(shoulderAt(part(LEG, C1), t)).toBe(shoulderAt(part(LEG, twin), t));
    expect(shoulderAt(part(LEG, C1), t)).toBeCloseTo(1.35, 12);
  });

  it('tipFarthest is the true disc minimum, centre − r·hypot(k, rise)', () => {
    const tn: RoundTenon = { id: 't', end: 'min', diameter: 0.5, length: 1 };
    expect(tipFarthest(part(LEG, C1), tn)).toBeCloseTo(0.35 - 0.25 * Math.sqrt(0.05), 12);
  });

  // An upright 1.5 × 1.5 × 30 post (X = width, Y = length, Z = thickness), its top a compound miter with k = rise = 0.5,
  // centre depth 1, and a 1" top tenon 1.5" long; a flat seat (underside y 28.5) with a blind bore up the post's axis.
  const TOP: AngleCut = { id: 'm', kind: 'miter', face: 'length', from: 'max', along: 'thickness', alongFrom: 'min', points: [[0, 0.625], [1.5, 1.375]], across: { rise: 0.5, from: 'min' } };
  const tenon: RoundTenon = { id: 'tn', end: 'max', diameter: 1, length: 1.5 };
  const post = (): Board => ({ ...createBoard({ name: 'Post', posture: 'upright', length: 30, width: 1.5, thickness: 1.5, position: [0, 0, 0] }), angleCuts: [TOP], tenons: [tenon] });
  const bore = (depth: number): HoleRow => ({ id: 'h', face: 'thickness', from: 'min', diameter: 1, depth, along: 'length', alongFrom: 'min', station: 2.75, count: 1, pitch: 0, acrossFrom: 'min', inset: 2.75 });
  const seat = (depth: number): Board => ({ ...createBoard({ name: 'Seat', posture: 'flat', length: 6, width: 6, thickness: 1.5, position: [-2, 28.5, -2] }), holes: [bore(depth)] });
  const docOf = (depth: number) => flatDocument(migrateDocument({ ...createDocument('T'), boards: [post(), seat(depth)] }));
  const TRUE_TIP = 30 - (1 - 0.5 * Math.SQRT1_2); // 29.3535…: the disc's least depth, the farthest tip point
  const PROBE_TIP = 30 - (1 - 0.5 * 0.5); // 29.25: the least of ±r probes along `along` and across alone

  it('the fixture is what it claims', () => {
    const doc = docOf(0.86);
    const [p, s] = doc.boards as [Board, Board];
    expect(tenonFaults(p, tenon)).toEqual([]);
    expect(builtTenons(p)).toHaveLength(1);
    // The disc's centre depth is 1 and the tip square to it would be at 29; the four-probe tip and the true tip differ by
    // more than TOUCH, so a seat check between them can tell them apart.
    expect(depthAtCross(TOP, p, 0.75, 0.75)).toBe(1);
    expect(TRUE_TIP - PROBE_TIP).toBeGreaterThan(TOUCH * 3);
    expect(toWorld(p, { length: tipFarthest(p, tenon), width: 0.75, thickness: 0.75 })[1]).toBeCloseTo(TRUE_TIP, 12);
    const h = holeInstances(s, s.holes[0]!)[0]!;
    const mouth = toWorld(s, { length: h.centre[0], width: h.centre[1], thickness: h.centre[2] });
    expect(mouth).toEqual([0.75, 28.5, 0.75]);
  });

  it('seats when the true disc minimum is within the blind bottom', () => {
    const doc = docOf(TRUE_TIP - 28.5); // bottom exactly at the farthest tip point
    expect(seatedIn(doc.boards[0]!, tenon, doc.boards[1]!, doc.boards[1]!.holes[0]!)).toBe(true);
  });

  it('does NOT seat a tenon that ±r probes alone would seat', () => {
    // The bottom sits between the two: the four-probe tip is within it (by less than TOUCH past), the true tip passes it
    // by more than TOUCH.
    const bottom = 29.27;
    expect(PROBE_TIP).toBeLessThanOrEqual(bottom + TOUCH);
    expect(TRUE_TIP).toBeGreaterThan(bottom + TOUCH);
    const doc = docOf(bottom - 28.5);
    expect(seatedIn(doc.boards[0]!, tenon, doc.boards[1]!, doc.boards[1]!.holes[0]!)).toBe(false);
  });
});

/**
 * A single-slope cut's readers, byte for byte: values captured from `63fd0d5`'s readers (Task 1's HEAD, before the across term; only the `export`s added) on
 * every end-miter flag combination, each other kind, a cut that removes nothing and one that overruns its part.
 */
describe('a single-slope cut is unchanged (captured before schema 25\'s readers)', () => {
  const miter = (id: string, from: 'min' | 'max', along: 'width' | 'thickness', alongFrom: 'min' | 'max', points: AngleCut['points']): AngleCut =>
    ({ id, kind: 'miter', face: 'length', from, along, alongFrom, points });
  const CASES: [[number, number, number], AngleCut][] = [
    [LEG, miter('m1', 'min', 'thickness', 'min', [[0, 0.3], [1.5, 0.1]])],
    [LEG, miter('m2', 'min', 'thickness', 'max', [[0, 0.1], [1.5, 0.35]])],
    [LEG, miter('m3', 'max', 'width', 'min', [[0, 0.4], [1.5, 0.05]])],
    [LEG, miter('m4', 'max', 'width', 'max', [[0.25, 0], [1.5, 0.3]])],
    [LEG, miter('m5', 'min', 'width', 'min', [[0, 0.2], [0.5, 0]])],
    [LEG, miter('m6', 'max', 'thickness', 'max', [[0, 1.5], [1.5, 0]])],
    [LEG, miter('m7', 'min', 'thickness', 'min', [[0, 0], [1.5, -0.2]])],
    [[20, 3, 0.75], { id: 't1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.75], [15, 0]] }],
    [[20, 3, 0.75], { id: 't2', kind: 'taper', face: 'thickness', from: 'max', along: 'length', alongFrom: 'max', points: [[0, 0.25], [12, 0]] }],
    [[20, 3, 0.75], { id: 'b1', kind: 'bevel', face: 'width', from: 'max', along: 'thickness', alongFrom: 'min', points: [[0, 0], [0.75, 0.75]] }],
    [[20, 3, 0.75], { id: 'c1', kind: 'chamfer', face: 'thickness', from: 'max', along: 'width', alongFrom: 'max', points: [[0, 0.25], [0.25, 0]] }],
    [[20, 3, 0.75], { id: 'b2', kind: 'bevel', face: 'thickness', from: 'min', along: 'width', alongFrom: 'min', points: [[0, 1], [3, 0.2]] }],
  ];
  const CAPTURED = [
    { kept: { n: [0.9912279006826348, 0, 0.13216372009101796], d: -0.2973683702047904 }, nothing: false, touched: { length: [0, 0.3], width: [0, 1.5], thickness: [0, 1.5] }, overruns: false, volume: 35.550000000000004, deepest: 0.3, tip: 0.16666666666666666, shoulder: 1.2 },
    { kept: { n: [0.9863939238321439, 0, 0.1643989873053573], d: -0.34523787334125033 }, nothing: false, touched: { length: [0, 0.35], width: [0, 1.5], thickness: [0, 1.5] }, overruns: false, volume: 35.49375, deepest: 0.35, tip: 0.18333333333333335, shoulder: 1.225 },
    { kept: { n: [-0.9738412097417932, 0.22722961560641844, 0], d: 15.191922871971974 }, nothing: false, touched: { length: [15.6, 16], width: [0, 1.5], thickness: [0, 1.5] }, overruns: false, volume: 35.49375, deepest: 0.4, tip: 15.833333333333334, shoulder: 14.775 },
    { kept: { n: [-0.9723873019805175, 0.23337295247532416, 0], d: 15.266480641094123 }, nothing: false, touched: { length: [15.7, 16], width: [0, 1.25], thickness: [0, 1.5] }, overruns: false, volume: 35.71875, deepest: 0.3, tip: 15.94, shoulder: 14.88 },
    { kept: { n: [0.9284766908852592, 0.37139067635410367, 0], d: -0.18569533817705183 }, nothing: false, touched: { length: [0, 0.2], width: [0, 0.5], thickness: [0, 1.5] }, overruns: false, volume: 35.925000000000004, deepest: 0.2, tip: 0, shoulder: 1 },
    { kept: { n: [-0.7071067811865475, 0, -0.7071067811865475], d: 11.31370849898476 }, nothing: false, touched: { length: [14.5, 16], width: [0, 1.5], thickness: [0, 1.5] }, overruns: false, volume: 34.3125, deepest: 1.5, tip: 15.5, shoulder: 14.25 },
    { kept: { n: [0.9912279006826348, 0, 0.13216372009101796], d: 0 }, nothing: true, touched: null, overruns: false, volume: 36, deepest: 0, tip: 0, shoulder: 1 },
    { kept: { n: [0.04993761694389223, 0.9987523388778446, 0], d: -0.7490642541583835 }, nothing: false, touched: { length: [0, 15], width: [0, 0.75], thickness: [0, 0.75] }, overruns: false, volume: 40.78125 },
    { kept: { n: [-0.020828813681835666, 0, -0.9997830567281121], d: 0.9164678020007693 }, nothing: false, touched: { length: [8, 20], width: [0, 3], thickness: [0.5, 0.75] }, overruns: false, volume: 40.5 },
    { kept: { n: [0, -0.7071067811865475, -0.7071067811865475], d: 2.1213203435596424 }, nothing: false, touched: { length: [0, 20], width: [2.25, 3], thickness: [0, 0.75] }, overruns: false, volume: 39.375 },
    { kept: { n: [0, -0.7071067811865475, -0.7071067811865475], d: 2.4748737341529163 }, nothing: false, touched: { length: [0, 20], width: [2.75, 3], thickness: [0.5, 0.75] }, overruns: false, volume: 44.375 },
    { kept: { n: [0, 0.25766265056033233, 0.9662349396012463], d: -0.9662349396012463 }, nothing: false, touched: { length: [0, 20], width: [0, 3], thickness: [0, 0.75] }, overruns: true, volume: 11.34375 },
  ];

  it('keptHalfSpace, angleCutRemovesNothing, touchedRegion, overruns, bodies, deepestDepth, tipFarthest and the shoulder', () => {
    CASES.forEach(([dims, cut], i) => {
      const b = part(dims, cut);
      const t: RoundTenon = { id: 't', end: cut.from, diameter: 0.5, length: 1 };
      const endMiter = cut.face === 'length' && cut.kind === 'miter';
      const got = {
        kept: keptHalfSpace(b, cut),
        nothing: angleCutRemovesNothing(b, cut),
        touched: touchedRegion(b, cut),
        overruns: overruns(b, cut),
        volume: volume(b),
        ...(endMiter ? { deepest: deepestDepth(b, cut.from), tip: tipFarthest(b, t), shoulder: shoulderAt(b, t) } : {}),
      };
      expect(got, cut.id).toEqual(CAPTURED[i]);
    });
  });
});
