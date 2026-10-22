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
    expect(visibleRun(b, W0)).toEqual({ lo: 1, hi: 19, shortLo: true, shortHi: true });
  });
  it('tape on the same rail', () => {
    expect(tapeRuns(tenoned(on(BUILT_IN_BAND_ID, W0)), types)[0]!.length).toBe(18 + tapeAllowance);
  });
  it('a dadoed shelf\'s run goes into the housing: no cut, full length', () => {
    const b = shelf(30.75, [], on('m', W0));
    expect(strip(b, W0).finished).toBe(30.75);
    expect(visibleRun(b, W0)).toEqual({ lo: 0, hi: 30.75, shortLo: false, shortHi: false });
  });
  it('a stopped dado\'s notch shortens it, at that end only', () => {
    // dado's notch: the growth [30.375, 30.75] × the stop's strip [0, 3/4] at the front × the whole thickness, as pocketFor
    // stores it (face: the smallest reach, length).
    const b = shelf(30.75, [cut('length', 'max', 'thickness', 0, 0.75, 0.375)], on('m', W0));
    expect(visibleRun(b, W0)).toEqual({ lo: 0, hi: 30.375, shortLo: false, shortHi: true });
    expect(strip(b, W0).finished).toBe(30.375);
    expect(visibleRun(b, W1)).toEqual({ lo: 0, hi: 30.75, shortLo: false, shortHi: false });
  });

  describe('does not shorten', () => {
    const full = (cuts: Cut[]) => {
      const b = rail(20, cuts, on('m', W0));
      expect(visibleRun(b, W0)).toEqual({ lo: 0, hi: 20, shortLo: false, shortHi: false });
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
  it('a cut within EPS (exactly 1e-9) of the end, side and faces still shortens it', () => {
    // offset 1e-9: R.length[0] = 1e-9 ≤ EPS; depth 3.5 − 1e-9 over 3.5: touches width max at ≥ w − EPS, never at ≥ w.
    const b = rail(20, [cut('width', 'min', 'thickness', 1e-9, 1, 0.5)], on('m', W0));
    expect(visibleRun(b, W0)).toEqual({ lo: 1 + 1e-9, hi: 20, shortLo: true, shortHi: false });
    const far = rail(20, [cut('width', 'min', 'thickness', 19, 1 - 1e-9, 0.5)], on('m', W0));
    expect(visibleRun(far, W0)).toEqual({ lo: 0, hi: 19, shortLo: false, shortHi: true });
    const opp = rail(20, [cut('width', 'min', 'thickness', 0, 1, 3.5 - 1e-9)], on('m', W1));
    expect(visibleRun(opp, W1).shortLo).toBe(true);
    // the thickness within EPS: a pocket 3/4 − 1e-9 deep from the min face
    const th = rail(20, [cut('thickness', 'min', 'width', 0, 1, 0.75 - 1e-9, [0, 3])], on('m', W0));
    expect(visibleRun(th, W0).shortLo).toBe(true);
  });
  it('memoised per part and deep-frozen', () => {
    const b = tenoned(on('m', W0));
    expect(visibleRun(b, W0)).toBe(visibleRun(b, { ...W0 }));
    expect(Object.isFrozen(visibleRun(b, W0))).toBe(true);
    expect(visibleRun(b, W1)).not.toBe(visibleRun(b, W0));
  });

  describe('a shortened end takes no give-way and no mitre', () => {
    // A full-thickness corner notch at (length max, width min), 1 × 1: it shortens W0 at its max end AND L1 at its min end
    // (the same cut touches both sides and reaches an end of each run).
    const notched = (rule: Board['cornerRule']) =>
      shelf(30, [cut('width', 'min', 'thickness', 29, 1, 1)], on('m', W0, W1, L0, L1), rule);
    it('the corner cut shortens both sides at that corner', () => {
      const b = notched('long');
      expect(visibleRun(b, W0)).toEqual({ lo: 0, hi: 29, shortLo: false, shortHi: true });
      expect(visibleRun(b, L1)).toEqual({ lo: 1, hi: 12, shortLo: true, shortHi: false });
      expect(visibleRun(b, W1)).toEqual({ lo: 0, hi: 30, shortLo: false, shortHi: false });
      expect(visibleRun(b, L0)).toEqual({ lo: 0, hi: 12, shortLo: false, shortHi: false });
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

  it('glue lines follow the visible run', () => {
    const g = glueLines(tenoned(on('m', W0)), types);
    expect(g.map((l) => [l.a.length, l.b.length, l.a.width, l.a.thickness])).toEqual([[1, 19, 0.25, 0], [1, 19, 0.25, 0.75]]);
  });
  it('a run with nothing visible makes no strip, tape or glue line', () => {
    const along = cut('width', 'min', 'length', 0, 0.75, 0.5);   // the whole edge, the whole thickness
    const solid = rail(20, [along], on('m', W0));
    expect(visibleRun(solid, W0)).toEqual({ lo: 20, hi: 0, shortLo: true, shortHi: true });
    expect(strips(solid, types)).toEqual([]);
    expect(glueLines(solid, types)).toEqual([]);
    expect(tapeRuns(rail(20, [along], on(BUILT_IN_BAND_ID, W0)), types)).toEqual([]);
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
      expect(visibleRun(b, W0).shortHi).toBe(true);
      expect(tapeRuns(b, types)[0]!.length).toBeCloseTo(arc + tapeAllowance, 9);
    });
    it('an arc chord a hand cut reaches is counted whole', () => {
      // a full-thickness hand cut at the min end, 1 × 1/2 on width min: it qualifies (the run is shortened) but the arc
      // chords inside it are arcs, counted whole — an over-buy, never an under-buy
      const b = bowed([...tenonAt(18), cut('width', 'min', 'thickness', 0, 1, 0.5)]);
      expect(visibleRun(b, W0)).toEqual({ lo: 1, hi: 18, shortLo: true, shortHi: true });
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
