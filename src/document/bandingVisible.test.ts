import { describe, expect, it } from 'vitest';
import { BUILT_IN_BAND, BUILT_IN_BAND_ID } from './bandModel';
import { glueLines, strips, tapeRuns, visibleRun } from './banding';
import { buildCutList } from './cutlist';
import { buildPurchase, defaultShop } from './purchase';
import { bowCurve } from './curves';
import { createBoard, createDocument } from './document';
import { faceOutline, sideStretch } from './profilePath';
import type { Band, BandType, Board, Cut, CutFrom, Dimension, FlatDocument, ProfileSide } from './types';

// Joinery features chunk 3 (spec §4.4, P12–P14): a band's strip, tape and glue lines count only the VISIBLE run — a
// stored rectangular cut that removes the side's face across the whole thickness at an end of the run shortens it.

const W0: ProfileSide = { across: 'width', from: 'min' };
const W1: ProfileSide = { across: 'width', from: 'max' };
const L0: ProfileSide = { across: 'length', from: 'min' };
const L1: ProfileSide = { across: 'length', from: 'max' };
const maple: BandType = { id: 'm', name: 'Maple edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const types: BandType[] = [BUILT_IN_BAND, maple];
const tapeAllowance = BUILT_IN_BAND.lengthAllowance;
/** The maple edging's thickness: `visibleRun`'s `t` for a solid band. */
const T = maple.thickness;

let n = 0;
const cut = (face: Dimension, from: CutFrom, across: Dimension, offset: number, width: number, depth: number, stops: [number, number] = [0, 0]): Cut =>
  ({ id: `k${++n}`, face, from, across, offset, width, depth, stopMin: stops[0], stopMax: stops[1] });

/** The 18 × 3-1/2 × 3/4 rail. */
const rail = (length: number, cuts: Cut[], bands: Band[], over: Partial<Board> = {}): Board =>
  ({ ...createBoard({ id: 'r', name: 'Rail', length, width: 3.5, thickness: 0.75, material: 'oak' }), cuts, bands, ...over });
/** A tenon's waste as `mortiseTenon` stores it (`pocketFor` of each box): two cheeks (1/4 of the 3/4 thickness, full width)
 *  and two shoulders (1/2 of the width, FULL thickness — one cut each), over the tenon's length [at, at + 1]. */
const tenonAt = (at: number): Cut[] => [
  cut('thickness', 'min', 'width', at, 1, 0.25), cut('thickness', 'max', 'width', at, 1, 0.25),
  cut('width', 'min', 'thickness', at, 1, 0.5), cut('width', 'max', 'thickness', at, 1, 0.5),
];
const tenoned = (bands: Band[]) => rail(20, [...tenonAt(0), ...tenonAt(19)], bands);
const shelf = (length: number, cuts: Cut[], bands: Band[], cornerRule: Board['cornerRule'] = 'long') =>
  ({ ...createBoard({ id: 'p', name: 'Shelf', length, width: 12, thickness: 0.75, material: 'plywood' }), cuts, bands, cornerRule });
const on = (type: string, ...sides: ProfileSide[]): Band[] => sides.map((side) => ({ side, type }));
const strip = (b: Board, side: ProfileSide) => strips(b, types).find((s) => s.side.across === side.across && s.side.from === side.from)!;

describe('the visible run (P12)', () => {
  it('a tenoned rail\'s long-edge strip stops at both shoulders', () => {
    const b = tenoned(on('m', W0));
    expect(strips(b, types)[0]!.finished).toBe(18);
    expect(strips(b, types)[0]!.length).toBe(18.5);
    expect(visibleRun(b, W0, T)).toEqual({ lo: 1, hi: 19, shortLo: true, shortHi: true });
  });
  it('tape on the same rail', () => {
    expect(tapeRuns(tenoned(on(BUILT_IN_BAND_ID, W0)), types)[0]!.length).toBe(18 + tapeAllowance);
  });
  it('a dadoed shelf\'s run goes into the housing: no cut, full length', () => {
    const b = shelf(30.75, [], on('m', W0));
    expect(strip(b, W0).finished).toBe(30.75);
    expect(visibleRun(b, W0, T)).toEqual({ lo: 0, hi: 30.75, shortLo: false, shortHi: false });
  });
  it('a stopped dado\'s notch shortens it, at that end only', () => {
    // dado's notch: the growth [30.375, 30.75] × the stop's strip [0, 3/4] at the front × the whole thickness, as pocketFor
    // stores it (face: the smallest reach, length).
    const b = shelf(30.75, [cut('length', 'max', 'thickness', 0, 0.75, 0.375)], on('m', W0));
    expect(visibleRun(b, W0, T)).toEqual({ lo: 0, hi: 30.375, shortLo: false, shortHi: true });
    expect(strip(b, W0).finished).toBe(30.375);
    expect(visibleRun(b, W1, T)).toEqual({ lo: 0, hi: 30.75, shortLo: false, shortHi: false });
  });

  describe('does not shorten', () => {
    const full = (cuts: Cut[]) => {
      const b = rail(20, cuts, on('m', W0));
      expect(visibleRun(b, W0, T)).toEqual({ lo: 0, hi: 20, shortLo: false, shortHi: false });
      expect(strip(b, W0).finished).toBe(20);
      // nor its tape (a non-qualifying cut clips no chord)
      expect(tapeRuns({ ...b, bands: on(BUILT_IN_BAND_ID, W0) }, types)[0]!.length).toBe(20 + tapeAllowance);
    };
    it('a cheek-only cut (part of the thickness)', () => full([cut('thickness', 'min', 'width', 0, 1, 0.25), cut('thickness', 'max', 'width', 19, 1, 0.25)]));
    it('a part-thickness rabbet along the banded edge', () => full([cut('width', 'min', 'length', 0, 0.375, 0.25)]));
    it('a full-thickness notch mid-run', () => full([cut('width', 'min', 'thickness', 8, 2, 0.5)]));
    it('a full-thickness cut at the end on the OPPOSITE side', () => full([cut('width', 'max', 'thickness', 0, 1, 0.5), cut('width', 'max', 'thickness', 19, 1, 0.5)]));
    it('a cut stopping 2e-9 short of the end (beyond EPS)', () => full([cut('width', 'min', 'thickness', 2e-9, 1, 0.5)]));
  });
  it('a cut within EPS (half of EPS, 0.5e-9) of the end, side and faces still shortens it', () => {
    // offset 0.5e-9: R.length[0] = 0.5e-9 ≤ EPS; depth 3.5 − 0.5e-9 over 3.5: touches width max at ≥ w − EPS, never at ≥ w.
    // (Inside EPS, not on it: a value exactly EPS away is at the mercy of the subtraction's rounding.)
    const b = rail(20, [cut('width', 'min', 'thickness', 0.5e-9, 1, 0.5)], on('m', W0));
    expect(visibleRun(b, W0, T)).toEqual({ lo: 1 + 0.5e-9, hi: 20, shortLo: true, shortHi: false });
    const far = rail(20, [cut('width', 'min', 'thickness', 19, 1 - 0.5e-9, 0.5)], on('m', W0));
    expect(visibleRun(far, W0, T)).toEqual({ lo: 0, hi: 19, shortLo: false, shortHi: true });
    const opp = rail(20, [cut('width', 'min', 'thickness', 0, 1, 3.5 - 0.5e-9)], on('m', W1));
    expect(visibleRun(opp, W1, T).shortLo).toBe(true);
    // the thickness within EPS: a pocket 3/4 − 0.5e-9 deep from the min face
    const th = rail(20, [cut('thickness', 'min', 'width', 0, 1, 0.75 - 0.5e-9, [0, 3])], on('m', W0));
    expect(visibleRun(th, W0, T).shortLo).toBe(true);
  });
  it('memoised per part and deep-frozen', () => {
    const b = tenoned(on('m', W0));
    expect(visibleRun(b, W0, T)).toBe(visibleRun(b, { ...W0 }, T));
    expect(Object.isFrozen(visibleRun(b, W0, T))).toBe(true);
    expect(visibleRun(b, W1, T)).not.toBe(visibleRun(b, W0, T));
    expect(visibleRun(b, W0, 0)).not.toBe(visibleRun(b, W0, T));   // keyed on t too
  });

  describe('a shortened end takes no give-way and no mitre', () => {
    // A full-thickness corner notch at (length max, width min), 1 × 1: it shortens W0 at its max end AND L1 at its min end
    // (the same cut touches both sides and reaches an end of each run).
    const notched = (rule: Board['cornerRule']) =>
      shelf(30, [cut('width', 'min', 'thickness', 29, 1, 1)], on('m', W0, W1, L0, L1), rule);
    it('the corner cut shortens both sides at that corner', () => {
      const b = notched('long');
      expect(visibleRun(b, W0, T)).toEqual({ lo: 0, hi: 29, shortLo: false, shortHi: true });
      expect(visibleRun(b, L1, T)).toEqual({ lo: 1, hi: 12, shortLo: true, shortHi: false });
      expect(visibleRun(b, W1, T)).toEqual({ lo: 0, hi: 30, shortLo: false, shortHi: false });
      expect(visibleRun(b, L0, T)).toEqual({ lo: 0, hi: 12, shortLo: false, shortHi: false });
    });
    it('ends: the long strip gives way only at its unshortened end', () => {
      const b = notched('ends');
      expect(strip(b, W0).finished).toBe(29 - 0.25);
      expect(strip(b, W1).finished).toBe(30 - 0.5);
      expect(strip(b, L1).finished).toBe(11);          // runs through: its visible run, 12 − 1
      expect(strip(b, L0).finished).toBe(12);
    });
    it('long: the end strip gives way only at its unshortened end', () => {
      const b = notched('long');
      expect(strip(b, L1).finished).toBe(11 - 0.25);
      expect(strip(b, L0).finished).toBe(12 - 0.5);
      expect(strip(b, W0).finished).toBe(29);
      expect(strip(b, W1).finished).toBe(30);
    });
    it('mitre: no mitre at a shortened end, and no mitre glue line there', () => {
      const b = notched('mitre');
      expect(strip(b, W0).finished).toBe(29);
      expect(strip(b, W0).ends[0]!.mitre).toBeCloseTo(Math.PI / 4, 12);
      expect(strip(b, W0).ends[1]).toEqual({ mitre: null });
      expect(strip(b, L1).finished).toBe(11);
      expect(strip(b, L1).ends[0]).toEqual({ mitre: null });
      expect(strip(b, L1).ends[1]!.mitre).toBeCloseTo(Math.PI / 4, 12);
      const w0 = glueLines(b, types).filter((g) => g.side.across === 'width' && g.side.from === 'min')
        .map((g) => [[g.a.length, g.a.width, g.a.thickness], [g.b.length, g.b.width, g.b.thickness]]);
      // the run (core corner to the visible end), then the mitre at end 0 only; none at the notched corner
      expect(w0).toEqual([
        [[0.25, 0.25, 0], [29, 0.25, 0]], [[0.25, 0.25, 0.75], [29, 0.25, 0.75]],
        [[0.25, 0.25, 0], [0, 0, 0]], [[0.25, 0.25, 0.75], [0, 0, 0.75]],
      ]);
      // the other long strip keeps both mitres (16 lines unnotched; 2 fewer)
      expect(glueLines(b, types)).toHaveLength(14);
      const l1 = glueLines(b, types).filter((g) => g.side.across === 'length' && g.side.from === 'max');
      expect(l1.map((g) => [g.a.width, g.b.width])).toEqual([[1, 11.75], [1, 11.75]]);
    });
  });

  describe('a qualifying cut reaches through the band (P12 amended)', () => {
    const edged = (cuts: Cut[], side: ProfileSide = W0) => rail(20, cuts, on('m', side));
    it('a 1/8 deep end cut under 1/4 edging does NOT shorten (the edging and the core reduction run on past it)', () => {
      const b = edged([cut('width', 'min', 'thickness', 0, 1, 0.125)]);
      expect(visibleRun(b, W0, T)).toEqual({ lo: 0, hi: 20, shortLo: false, shortHi: false });
      expect(strip(b, W0).finished).toBe(20);
      expect(glueLines(b, types).map((g) => [g.a.length, g.b.length])).toEqual([[0, 20], [0, 20]]);
      // tape (t = 0) is still shortened by any depth
      expect(visibleRun(b, W0, 0)).toEqual({ lo: 1, hi: 20, shortLo: true, shortHi: false });
      expect(tapeRuns({ ...b, bands: on(BUILT_IN_BAND_ID, W0) }, types)[0]!.length).toBe(19 + tapeAllowance);
    });
    it('a cut exactly t deep shortens; within EPS of t (0.5e-9 short) shortens; 2e-9 short of t does not', () => {
      expect(strip(edged([cut('width', 'min', 'thickness', 0, 1, 0.25)]), W0).finished).toBe(19);
      expect(visibleRun(edged([cut('width', 'min', 'thickness', 0, 1, 0.25 - 0.5e-9)]), W0, T).shortLo).toBe(true);
      expect(visibleRun(edged([cut('width', 'min', 'thickness', 0, 1, 0.25 - 2e-9)]), W0, T).shortLo).toBe(false);
      // the max side: R.width[0] against w − t
      expect(strip(edged([cut('width', 'max', 'thickness', 19, 1, 0.25)], W1), W1).finished).toBe(19);
      expect(visibleRun(edged([cut('width', 'max', 'thickness', 19, 1, 0.25 - 0.5e-9)], W1), W1, T).shortHi).toBe(true);
      expect(visibleRun(edged([cut('width', 'max', 'thickness', 19, 1, 0.25 - 2e-9)], W1), W1, T).shortHi).toBe(false);
    });
    it('a corner cut shorter along the run than the neighbour band, where the band gives way: it starts at the neighbour', () => {
      // ends: W0 gives way to L1 (1/4). The cut is 0.1 along the length, 1 deep: it reaches through W0's band (shortens
      // it) but not through L1's (0.1 < 1/4), so L1 runs on and W0 stops at L1's inner face — no overlap, no gap.
      const b = shelf(30, [cut('width', 'min', 'thickness', 29.9, 0.1, 1)], on('m', W0, W1, L0, L1), 'ends');
      expect(visibleRun(b, W0, T)).toEqual({ lo: 0, hi: 29.9, shortLo: false, shortHi: true });
      expect(visibleRun(b, L1, T)).toEqual({ lo: 0, hi: 12, shortLo: false, shortHi: false });
      expect(strip(b, W0).finished).toBe(29.5);
      expect(strip(b, L1).finished).toBe(12);
      const w0 = glueLines(b, types).filter((g) => g.side.across === 'width' && g.side.from === 'min');
      expect(w0.map((g) => [g.a.length, g.b.length])).toEqual([[0.25, 29.75], [0.25, 29.75]]);
      // the same at the min end, mirrored
      const m = shelf(30, [cut('width', 'min', 'thickness', 0, 0.1, 1)], on('m', W0, W1, L0, L1), 'ends');
      expect(strip(m, W0).finished).toBe(29.5);
      expect(glueLines(m, types).filter((g) => g.side.across === 'width' && g.side.from === 'min').map((g) => g.a.length)).toEqual([0.25, 0.25]);
    });
    it('fu 419(a): under Mitred, a corner cut shallower along the run than the neighbour makes that corner a butt (long runs through, the end gives way)', () => {
      const b = shelf(30, [cut('width', 'min', 'thickness', 29.9, 0.1, 1)], on('m', W0, W1, L0, L1), 'mitre');
      // W0 runs through to its square cut end; L1 gives way to W0 at that corner and keeps its mitre at W1's corner
      expect(strip(b, W0).finished).toBe(29.9);
      expect(strip(b, W0).ends[0]!.mitre).toBeCloseTo(Math.PI / 4, 12);
      expect(strip(b, W0).ends[1]).toEqual({ mitre: null });
      expect(strip(b, L1).finished).toBe(11.75);
      expect(strip(b, L1).ends[0]).toEqual({ mitre: null });
      expect(strip(b, L1).ends[1]!.mitre).toBeCloseTo(Math.PI / 4, 12);
      // the other corners are untouched mitres
      expect(strip(b, W1).finished).toBe(30);
      expect(strip(b, W1).ends.map((e) => e.mitre)).toEqual([Math.atan(1), Math.atan(1)]);
      expect(strip(b, L0).finished).toBe(12);
      const lines = (side: ProfileSide, k: Dimension) => glueLines(b, types).filter((g) => g.side.across === side.across && g.side.from === side.from)
        .map((g) => [g.a[k as 'length'], g.b[k as 'length']]);
      // W0: its run to the cut end (it runs through there), then the end-0 mitre only
      expect(lines(W0, 'length')).toEqual([[0.25, 29.9], [0.25, 29.9], [0.25, 0], [0.25, 0]]);
      // L1: from W0's inner face to W1's core corner; the long strips draw the mitre lines
      expect(lines(L1, 'width')).toEqual([[0.25, 11.75], [0.25, 11.75]]);
    });
    it('fu 419(a), the end band shortened instead: the long strip runs through the corner, the end band gives way', () => {
      // 0.1 along the WIDTH at the length-max end, 1 into the length: through L1 (shortens it at width min), not through
      // W0's 1/4 along the width (0.1 < 1/4), so W0 is not shortened and runs through square to the corner.
      const b = shelf(30, [cut('length', 'max', 'thickness', 0, 0.1, 1)], on('m', W0, W1, L0, L1), 'mitre');
      expect(visibleRun(b, L1, T)).toEqual({ lo: 0.1, hi: 12, shortLo: true, shortHi: false });
      expect(visibleRun(b, W0, T).shortHi).toBe(false);
      expect(strip(b, W0).finished).toBe(30);
      expect(strip(b, W0).ends[1]).toEqual({ mitre: null });
      expect(strip(b, L1).finished).toBe(11.75);   // starts at max(0.1, 1/4); mitred at W1's corner, so its outer edge runs to 12
      expect(strip(b, L1).ends[0]).toEqual({ mitre: null });
    });
    it('a tape WITH thickness (1/16) is shortened only by a cut through it', () => {
      const tape16: BandType = { id: 'tape16', name: 'Tape 1/16', kind: 'tape', thickness: 1 / 16, lengthAllowance: 0.5, tapeWidth: 0.875, pricePerFoot: null };
      // on the rail's length-max end; a full-thickness cut at its width-min corner, 1 along the end, `depth` into the length
      const ended = (depth: number) => rail(20, [cut('length', 'max', 'thickness', 0, 1, depth)], [{ side: L1, type: 'tape16' }]);
      expect(visibleRun(ended(1 / 32), L1, 1 / 16)).toEqual({ lo: 0, hi: 3.5, shortLo: false, shortHi: false });
      expect(tapeRuns(ended(1 / 32), [...types, tape16])[0]!.length).toBe(3.5 + 0.5);
      expect(visibleRun(ended(1 / 16), L1, 1 / 16)).toEqual({ lo: 1, hi: 3.5, shortLo: true, shortHi: false });
      expect(tapeRuns(ended(1 / 16), [...types, tape16])[0]!.length).toBe(2.5 + 0.5);
    });
    it('a stopped-dado-like notch, inset 1/4, on 3/8 front edging does not shorten it', () => {
      const thick: BandType = { ...maple, id: 'm38', thickness: 0.375 };
      const b = { ...shelf(30.75, [cut('length', 'max', 'thickness', 0, 0.25, 0.375)], [{ side: W0, type: 'm38' }]) };
      expect(visibleRun(b, W0, 0.375)).toEqual({ lo: 0, hi: 30.75, shortLo: false, shortHi: false });
      expect(strips(b, [...types, thick])[0]!.finished).toBe(30.75);
    });
  });

  it('tape and Buying on a HAND-NOTCHED banded end (Review Focus 2)', () => {
    // a 1 × 1 full-thickness hand notch at the front right corner of a taped 30" shelf: the tape is 29 + allowance
    const notched = (id: string) => ({ ...shelf(30, [cut('width', 'min', 'thickness', 29, 1, 1)], on(BUILT_IN_BAND_ID, W0)), id, name: id });
    expect(tapeRuns(notched('a'), types)[0]!.length).toBe(29 + tapeAllowance);
    // six shelves: 6 × 29.5 = 177" → 15′ (unnotched, 6 × 30.5 = 183" → 16′)
    const six = (make: (id: string) => Board) => ({ ...createDocument('T'), boards: [1, 2, 3, 4, 5, 6].map((i) => make(`s${i}`)), bandTypes: types } as FlatDocument);
    const buy = (d: FlatDocument) => buildPurchase(d, buildCutList(d), defaultShop()).banding!.lines;
    expect(buy(six(notched))).toEqual(['Iron-on veneer, 7/8" wide: buy 15′ · no price']);
    expect(buy(six((id) => ({ ...shelf(30, [], on(BUILT_IN_BAND_ID, W0)), id, name: id })))).toEqual(['Iron-on veneer, 7/8" wide: buy 16′ · no price']);
  });

  it('glue lines follow the visible run', () => {
    const g = glueLines(tenoned(on('m', W0)), types);
    expect(g.map((l) => [l.a.length, l.b.length, l.a.width, l.a.thickness])).toEqual([[1, 19, 0.25, 0], [1, 19, 0.25, 0.75]]);
  });
  it('a run with nothing visible makes no strip, tape or glue line', () => {
    const along = cut('width', 'min', 'length', 0, 0.75, 0.5);   // the whole edge, the whole thickness
    const solid = rail(20, [along], on('m', W0));
    expect(visibleRun(solid, W0, T)).toEqual({ lo: 20, hi: 0, shortLo: true, shortHi: true });
    expect(strips(solid, types)).toEqual([]);
    expect(glueLines(solid, types)).toEqual([]);
    expect(tapeRuns(rail(20, [along], on(BUILT_IN_BAND_ID, W0)), types)).toEqual([]);
  });

  describe('nothing visible is judged AFTER give-way (final review F1)', () => {
    // A 10 × 12 panel, 3/4 edging on width min and on both ends, one hand cut through the edging from the min end along
    // width min. The raw run [lo, 10] is positive, but under Ends width min gives way to the length-max end's 3/4.
    const e34: BandType = { ...maple, id: 'e34', thickness: 0.75 };
    const ts = [...types, e34];
    const probe = (rule: Board['cornerRule'], cuts: Cut[]) => shelf(10, cuts, on('e34', W0, L0, L1), rule);
    const to = (at: number) => cut('width', 'min', 'thickness', 0, at, 1);
    const from = (at: number) => cut('width', 'min', 'thickness', at, 10 - at, 1);
    const sideOf = (b: Board, side: ProfileSide) => strips(b, ts).filter((s) => s.side.across === side.across && s.side.from === side.from);
    const w0Lines = (b: Board) => glueLines(b, ts).filter((g) => g.side.across === 'width' && g.side.from === 'min')
      .map((g) => [g.a.length, g.a.width, g.b.length, g.b.width]);
    it('Ends, one shortened end: no strip (the probe: was −0.35), no glue line (was 9.6 back to 9.25)', () => {
      const b = probe('ends', [to(9.6)]);
      expect(visibleRun(b, W0, 0.75)).toEqual({ lo: 9.6, hi: 10, shortLo: true, shortHi: false });
      expect(sideOf(b, W0)).toEqual([]);
      expect(w0Lines(b)).toEqual([]);
      // every strip left is positive; the cut reaches through L0's band too (at width 0), so L0 starts at 1
      expect(strips(b, ts).map((s) => [s.side.across, s.side.from, s.finished])).toEqual([['length', 'min', 11], ['length', 'max', 12]]);
    });
    it('Ends, both ends shortened: a raw sliver [9.4, 9.5] inside the far give-way makes no strip and no line', () => {
      const b = probe('ends', [to(9.4), from(9.5)]);
      expect(visibleRun(b, W0, 0.75)).toEqual({ lo: 9.4, hi: 9.5, shortLo: true, shortHi: true });
      expect(sideOf(b, W0)).toEqual([]);
      expect(w0Lines(b)).toEqual([]);
    });
    it('fu 419(b), Mitre, one shortened end: 0.40 left is shorter than its 3/4 mitre, so that corner is a butt — a square 0.40 strip, never the impossible mitred piece', () => {
      const b = probe('mitre', [to(9.6)]);
      expect(sideOf(b, W0).map((s) => [s.finished, s.ends.map((e) => e.mitre)])).toEqual([[10 - 9.6, [null, null]]]);
      // its line runs over the leftover (it runs through at L1's corner), never backward
      expect(w0Lines(b)).toEqual([[9.6, 0.75, 10, 0.75], [9.6, 0.75, 10, 0.75]]);
      // L0 is shortened by the same cut (starts at max(1, 3/4)); L1 gives way to W0 at width 0 (W1 is unbanded: square)
      expect(strips(b, ts).map((s) => [s.side.across, s.side.from, s.finished, s.ends.map((e) => e.mitre)]))
        .toEqual([['width', 'min', 10 - 9.6, [null, null]], ['length', 'min', 11, [null, null]], ['length', 'max', 11.25, [null, null]]]);
    });
    it('Mitre, both ends shortened: a square 0.1 strip, its line over it', () => {
      const b = probe('mitre', [to(9.4), from(9.5)]);
      expect(sideOf(b, W0).map((s) => [s.finished, s.ends.map((e) => e.mitre)])).toEqual([[9.5 - 9.4, [null, null]]]);
      expect(w0Lines(b)).toEqual([[9.4, 0.75, 9.5, 0.75], [9.4, 0.75, 9.5, 0.75]]);
      expect(strips(b, ts).find((s) => s.side.across === 'length' && s.side.from === 'max')!.finished).toBe(11.25);
    });
    it('fu 419(b), the boundary: a mitre whose inner edge is exactly 0 is a butt; 2e-9 of inner edge keeps the mitre', () => {
      const at = probe('mitre', [to(9.25)]);
      expect(sideOf(at, W0).map((s) => [s.finished, s.ends[1]!.mitre])).toEqual([[0.75, null]]);
      expect(w0Lines(at)).toEqual([[9.25, 0.75, 10, 0.75], [9.25, 0.75, 10, 0.75]]);
      const kept = probe('mitre', [to(9.25 - 2e-9)]);
      expect(sideOf(kept, W0)[0]!.ends[1]!.mitre).toBeCloseTo(Math.PI / 4, 12);
      // the run (2e-9) and the mitre line from the core corner
      expect(w0Lines(kept)).toEqual([[9.25 - 2e-9, 0.75, 9.25, 0.75], [9.25 - 2e-9, 0.75, 9.25, 0.75], [9.25, 0.75, 10, 0], [9.25, 0.75, 10, 0]]);
    });
    it('the cut list for the probe under Ends has no strip row for width min', () => {
      const doc = { ...createDocument('T'), boards: [{ ...probe('ends', [to(9.6)]), id: 'p', name: 'Panel' }], bandTypes: ts } as FlatDocument;
      const rows = buildCutList(doc).groups.flatMap((g) => g.rows).filter((row) => row.key.includes('|strip|'));
      expect(rows.map((row) => row.length).sort((x, y) => x - y)).toEqual([11.5, 12.5]);
    });
  });

  describe('tape on a bow at a tenoned end (P13)', () => {
    // fu 415's default bow (rise 1/2, the shoulder) on width min over the rail's original 18; grown 1 at its max end and
    // shouldered there. The outline then runs: the arc, the step (18, 1/2) → (18, 0), the tenon's bottom (18, 0) → (19, 0).
    const bow = { id: 'b', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 18, rise: 0.5 }) };
    const r = 9 ** 2 / (2 * 0.5) + 0.5 / 2;
    const arc = 2 * r * Math.asin(9 / r);
    const bowed = (cuts: Cut[]) => rail(19, cuts, on(BUILT_IN_BAND_ID, W0), { curves: [bow] });
    it('the line chords inside the shoulder count 0', () => {
      const b = bowed(tenonAt(18));
      // Precondition: W0's stretch holds the step and the tenon's bottom as LINE chords.
      const outline = faceOutline(b)!;
      const st = sideStretch(b, outline, W0)!;
      const idx: number[] = [];
      for (let i = st.from; ; i = (i + 1) % outline.chords.length) { idx.push(i); if (i === st.to) break; }
      const lines = idx.map((i) => outline.chords[i]!).filter((c) => !c.arc).map((c) => [c.a, c.b]);
      expect(lines).toEqual([[[18, 0.5], [18, 0]], [[18, 0], [19, 0]]]);
      expect(tapeRuns(b, types)[0]!.length).toBeCloseTo(arc + tapeAllowance, 9);
      // without the shoulder the two line chords count: 1/2 + 1
      expect(tapeRuns(bowed([]), types)[0]!.length).toBeCloseTo(arc + 1.5 + tapeAllowance, 9);
    });
    it('a step within EPS of the shoulder\'s bound (float drift) is still inside it', () => {
      // the shoulders 1e-12 short of u = 18: the step at u = 18 lies just outside the true rectangle, inside the tolerance
      const drift = (at: number): Cut[] => [cut('width', 'min', 'thickness', at, 19 - at, 0.5), cut('width', 'max', 'thickness', at, 19 - at, 0.5)];
      const b = bowed(drift(18 + 1e-12));
      expect(visibleRun(b, W0, 0).shortHi).toBe(true);
      expect(tapeRuns(b, types)[0]!.length).toBeCloseTo(arc + tapeAllowance, 9);
    });
    it('an arc chord a hand cut reaches is counted whole', () => {
      // a full-thickness hand cut at the min end, 1 × 1/2 on width min: it qualifies (the run is shortened) but the arc
      // chords inside it are arcs, counted whole — an over-buy, never an under-buy
      const b = bowed([...tenonAt(18), cut('width', 'min', 'thickness', 0, 1, 0.5)]);
      expect(visibleRun(b, W0, 0)).toEqual({ lo: 1, hi: 18, shortLo: true, shortHi: true });
      expect(tapeRuns(b, types)[0]!.length).toBeCloseTo(arc + tapeAllowance, 9);
    });
  });

  it('two parts differing only in a hand notch give two strip rows (Review Focus 2)', () => {
    const plain = { ...shelf(30, [], on('m', W0)), id: 'a', name: 'A' };
    const notch = { ...shelf(30, [cut('width', 'min', 'thickness', 29.5, 0.5, 1)], on('m', W0)), id: 'b', name: 'B' };
    const doc = { ...createDocument('T'), boards: [plain, notch], bandTypes: types } as FlatDocument;
    const rows = buildCutList(doc).groups.flatMap((g) => g.rows).filter((row) => row.key.includes('|strip|'));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.length).sort((x, y) => x - y)).toEqual([30, 30.5]);
  });
  it('Buying counts the visible tape', () => {
    // Four tenoned rails taped on both long edges: 8 × 18.5 = 148" → 13′ (the full 20 would be 8 × 20.5 = 164" → 14′).
    const rails = [1, 2, 3, 4].map((i) => ({ ...tenoned(on(BUILT_IN_BAND_ID, W0, W1)), id: `r${i}`, name: `Rail ${i}` }));
    const doc = { ...createDocument('T'), boards: rails, bandTypes: types } as FlatDocument;
    expect(rails.flatMap((b) => tapeRuns(b, types)).map((t) => t.length)).toEqual(Array(8).fill(18.5));
    expect(buildPurchase(doc, buildCutList(doc), defaultShop()).banding!.lines).toEqual(['Iron-on veneer, 7/8" wide: buy 13′ · no price']);
  });
});
