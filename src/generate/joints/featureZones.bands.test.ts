import { describe, expect, it } from 'vitest';
import { designToDocument } from '../../document/generated';
import { flatDocument } from '../../document/document';
import type { Band, BandType, Board, CurveCut, CutFrom, Dimension, FlatDocument, HoleRow, ProfileSide } from '../../document/document';
import { BUILT_IN_BAND_ID, bandFaults, visibleRun, withBands } from '../../document/banding';
import { bandRegions } from '../../document/featureRegions';
import { ruledOutLine } from '../../document/ruledOutText';
import { bowCurve, cornerCurve } from '../../document/curves';
import { axisDimensions, endFacing, fromWorldOffset } from '../../document/geometry';
import { findSites, rangesOf } from './sites';
import type { Site } from './sites';
import { applyJoints, tenonSection } from './recipes';
import { siteMessage, validChoice } from './choose';
import { clippedRegion } from '../../document/cuts';
import { featureAllowed } from './featureZones';
import type { RuledOut } from './featureZones';

// Joinery features chunk 3 (spec §3.3–§3.5; P9–P11): per site, only the joint kinds a band is in the way of are ruled
// out. Fixture builders as featureZones.curves.test.ts'.

type V3 = [number, number, number];
type P = { name: string; at: V3; size: V3 };
const design = (...parts: P[]) => flatDocument(designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}, { centre: false }).doc);
const named = (doc: FlatDocument, name: string) => doc.boards.find((b) => b.name === name)!;
const indexOf = (doc: FlatDocument, name: string) => doc.boards.findIndex((b) => b.name === name);
const summary = (doc: FlatDocument, sites: readonly Site[]) => sites.map((s) => [doc.boards[s.enter].name, doc.boards[s.receive].name, s.allowed]);
/** The board-local end of `d` facing WORLD side `side` on its world axis (inv 44). */
const localEnd = (b: Board, d: Dimension, side: -1 | 1): CutFrom => endFacing(b, axisDimensions(b).indexOf(d), side);
/** The broad face's side at the board-local end of `d` facing WORLD side `side`. */
const sideAt = (b: Board, across: 'length' | 'width', side: -1 | 1): ProfileSide => ({ across, from: localEnd(b, across, side) });

const solid = (t: number, id = `solid-${t}`): BandType => ({ id, name: `Edging ${t}`, kind: 'solid', thickness: t, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 });
const tape = (t: number, id = `tape-${t}`): BandType => ({ id, name: `Tape ${t}`, kind: 'tape', thickness: t, lengthAllowance: 0.5, tapeWidth: 1, pricePerFoot: null });
type Extra = { bands: (b: Board) => [ProfileSide, string][]; curves?: (b: Board) => CurveCut[]; holes?: (b: Board) => HoleRow[] };
/** `doc` with `types` added to its band types and each named part's bands (and curves, holes), built from the part as it stands. */
const banded = (doc: FlatDocument, types: BandType[], parts: Record<string, Extra>): FlatDocument => ({
  ...doc,
  bandTypes: [...doc.bandTypes, ...types],
  boards: doc.boards.map((b) => {
    const x = parts[b.name];
    if (!x) return b;
    const bands = x.bands(b).reduce<Band[]>((acc, [side, type]) => withBands(acc, [side], type), b.bands);
    return { ...b, bands, ...(x.curves ? { curves: x.curves(b) } : {}), ...(x.holes ? { holes: x.holes(b) } : {}) };
  }),
});
/** The summary line for site `id` as `run.ts`' `ruledOutLines` builds it. */
const lineFor = (doc: FlatDocument, sites: readonly Site[], ruledOut: readonly RuledOut[], id: number) => {
  const s = sites.find((x) => x.id === id)!;
  const mine = ruledOut.filter((r) => r.site === id);
  return ruledOutLine({
    enter: doc.boards[s.enter]!.name, receive: doc.boards[s.receive]!.name, kinds: mine.map((r) => r.kind),
    butt: s.allowed.length === 1 && s.allowed[0] === 'butt', part: doc.boards[mine[0]!.part]!.name, feature: mine[0]!.feature,
  });
};
/** A one-hole row (featureZones.test.ts' helper): drilled along WORLD axis `k` from its `fromSide` face at world `at`. */
const holeAt = (b: Board, k: number, fromSide: -1 | 1, at: V3, diameter: number, depth: number | 'through'): HoleRow => {
  const dims = axisDimensions(b);
  const [p, q] = [0, 1, 2].filter((a) => a !== k);
  const local = (a: number) => fromWorldOffset(b, a, at[a] - b.position[a]);
  return { id: 'h', face: dims[k], from: endFacing(b, k, fromSide), diameter, depth, along: dims[p], alongFrom: 'min', station: local(p), count: 1, pitch: 0, acrossFrom: 'min', inset: local(q) };
};

/** A shelf housed between two sides, all flush at the front (world -Z). */
const SHELF = () => design(
  { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
);
/** One side and a shelf entering it at the shelf's world -X end, flush at the front; the side is 3/4 deeper at the back,
 *  so the front (world -Z) is the stopped dado's only stop end. */
const SIDE = () => design({ name: 'Side', at: [0, 0, 0], size: [0.75, 30, 12] }, { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] });
/** One rail entering a leg at the rail's world -X end (its board-local min end), inset 1/2: tenon and dado. */
const LEG_RAIL = () => design({ name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] }, { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] });
const BOOKCASE = () => design(
  { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
  { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
);
const front = (b: Board) => sideAt(b, 'width', -1);

describe('bandRegions (P9, P10)', () => {
  it('stored order; the type\'s thickness in from the side; tape of thickness 0 has none; a missing type is skipped', () => {
    const doc = banded(LEG_RAIL(), [solid(0.25), tape(0.0625)], {
      Rail: { bands: (b) => [[sideAt(b, 'width', -1), 'solid-0.25'], [sideAt(b, 'width', 1), BUILT_IN_BAND_ID], [sideAt(b, 'length', -1), 'nope'], [sideAt(b, 'length', 1), 'tape-0.0625']] },
    });
    const rail = named(doc, 'Rail');
    const out = bandRegions(rail, doc.bandTypes);
    expect(out.map((x) => x.band.type)).toEqual(['solid-0.25', BUILT_IN_BAND_ID, 'tape-0.0625']);
    const [lo, hi] = [localEnd(rail, 'width', -1), localEnd(rail, 'length', 1)];
    expect(out[0]!.region).toEqual({ length: [0, 18], width: lo === 'min' ? [0, 0.25] : [3.25, 3.5], thickness: [0, 0.75] });
    expect(out[1]!.region).toBeNull();
    expect(out[2]!.region).toEqual({ length: hi === 'min' ? [0, 0.0625] : [18 - 0.0625, 18], width: [0, 3.5], thickness: [0, 0.75] });
  });
});

describe('spec §3.5 examples', () => {
  it('a banded shelf with tape on its front edge, dadoed at both ends: allowed unchanged', () => {
    const doc = banded(SHELF(), [], { Shelf: { bands: (b) => [[front(b), BUILT_IN_BAND_ID]] } });
    const sites = findSites(doc);
    expect(summary(doc, sites)).toEqual([
      ['Shelf', 'Left', ['mortise-tenon', 'dado', 'stopped-dado', 'butt']], ['Shelf', 'Right', ['mortise-tenon', 'dado', 'stopped-dado', 'butt']],
    ]);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual([]);
    expect(out.sites).toBe(sites);
  });

  it('a band on a shelf\'s end that enters a dado: left as a butt', () => {
    const doc = banded(SIDE(), [], { Shelf: { bands: (b) => [[sideAt(b, 'length', -1), BUILT_IN_BAND_ID]] } });
    const sites = findSites(doc);
    expect(summary(doc, sites)).toEqual([['Shelf', 'Side', ['mortise-tenon', 'dado', 'stopped-dado', 'butt']]]);
    const out = featureAllowed(doc, sites);
    const shelf = indexOf(doc, 'Shelf');
    expect(out.sites[0]!.allowed).toEqual(['butt']);
    expect(out.ruledOut).toEqual(['mortise-tenon', 'dado', 'stopped-dado'].map((kind) => ({ site: 1, kind, part: shelf, feature: 'edge band' })));
    expect(lineFor(doc, out.sites, out.ruledOut, 1)).toBe("Shelf → Side: left as a butt — Shelf's edge band is in the way of every joint.");
  });
});

describe('the growing end (P9, P11)', () => {
  const edged = (type: BandType) => banded(LEG_RAIL(), [type], { Rail: { bands: (b) => [[sideAt(b, 'width', -1), type.id]] } });
  it('the preconditions: the rail is tenoned at its min end; shoulder 1/2', () => {
    const doc = LEG_RAIL();
    const rail = named(doc, 'Rail');
    expect(localEnd(rail, 'length', -1)).toBe('min');
    expect(tenonSection(rail.thickness, rail.width).shoulder).toBe(0.5);
    expect(summary(doc, findSites(doc))).toEqual([['Rail', 'Leg', ['mortise-tenon', 'dado', 'butt']]]);
  });
  // P9: the 1/4 case IS "a tenon's new-wood waste never meets a long-edge band": the shoulder waste on that edge (width
  // [0, 1/2], in the new wood) would meet the strip if judged on the mid-trial board.
  it.each([['1/4 (a tenon\'s new-wood waste never meets a long-edge band, P9)', 0.25], ['1/2 (= the shoulder, touching)', 0.5]])('solid edging along the long edge at %s keeps the tenon', (_n, t) => {
    const doc = edged(solid(t));
    const sites = findSites(doc);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual([]);
    expect(out.sites).toBe(sites);
  });
  it('solid edging at 5/8 (deeper than the shoulder) rules the tenon out; the dado is kept (Review Focus 1)', () => {
    const doc = edged(solid(0.625));
    const out = featureAllowed(doc, findSites(doc));
    expect(out.sites[0]!.allowed).toEqual(['dado', 'butt']);
    expect(out.ruledOut).toEqual([{ site: 1, kind: 'mortise-tenon', part: indexOf(doc, 'Rail'), feature: 'edge band' }]);
  });
  it('tape along the edge keeps every kind; a thick tape takes the tenon-section rule as solid edging does', () => {
    const thin = edged(tape(0));
    const sites = findSites(thin);
    expect(featureAllowed(thin, sites).sites).toBe(sites);
    const thick = edged(tape(0.625));
    const out = featureAllowed(thick, findSites(thick));
    expect(out.ruledOut).toEqual([{ site: 1, kind: 'mortise-tenon', part: indexOf(thick, 'Rail'), feature: 'edge band' }]);
    const thickOk = edged(tape(0.5));
    expect(featureAllowed(thickOk, findSites(thickOk)).ruledOut).toEqual([]);
  });
  it.each([['tape of thickness 0', tape(0)], ['a thick tape', tape(0.0625)], ['solid edging', solid(0.25)]])('%s on the tenoned end rules the growing kinds out', (_n, type) => {
    const doc = banded(LEG_RAIL(), [type], { Rail: { bands: (b) => [[sideAt(b, 'length', -1), type.id]] } });
    const out = featureAllowed(doc, findSites(doc));
    expect(out.sites[0]!.allowed).toEqual(['butt']);
    expect(out.ruledOut).toEqual(['mortise-tenon', 'dado'].map((kind) => ({ site: 1, kind, part: indexOf(doc, 'Rail'), feature: 'edge band' })));
  });
  it('a band on the far end leaves the growing end alone', () => {
    const doc = banded(LEG_RAIL(), [solid(0.25)], { Rail: { bands: (b) => [[sideAt(b, 'length', 1), 'solid-0.25']] } });
    const sites = findSites(doc);
    expect(featureAllowed(doc, sites).sites).toBe(sites);
  });

  it('run-through at a width-grown end takes no exception (P11, d === \'length\')', () => {
    // featureZones.curves.test.ts' hand-built site: the panel's width (world X) enters the leg at its width-min end. A
    // solid band on the panel's bottom end runs the whole width (along the grown dimension).
    const doc = banded(design({ name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] }, { name: 'Panel', at: [1.75, 5, 0.5], size: [3.5, 18, 0.75] }), [solid(0.25)], {
      Panel: { bands: (b) => [[sideAt(b, 'length', -1), 'solid-0.25']] },
    });
    const [leg, panel] = [indexOf(doc, 'Leg'), indexOf(doc, 'Panel')];
    const P = doc.boards[panel]!;
    expect(axisDimensions(P)[0]).toBe('width');
    expect(findSites(doc)).toEqual([]);
    const site: Site = { id: 1, kind: 'end-into-face', enter: panel, receive: leg, axis: 0, side: -1, allowed: ['dado', 'butt'], stopEnds: [] };
    // The band runs along the grown dimension (not on its end), and the joint is real: the trial grows the panel's width.
    expect(P.bands[0]!.side.across).not.toBe('width');
    const grown = applyJoints(doc, [site], [{ site: 1, joint: 'dado', depth: rangesOf(site, doc).dadoDepth[1] }]);
    expect(grown.skipped).toEqual([]);
    expect(grown.doc.boards[panel]!.width).toBeGreaterThan(P.width);
    const out = featureAllowed(doc, [site]);
    expect(out.sites[0]!.allowed).toEqual(['butt']);
    expect(out.ruledOut).toEqual([{ site: 1, kind: 'dado', part: panel, feature: 'edge band' }]);
    // tape of thickness 0 along the width-grown end too: the `d !== 'length'` gate comes before tape's no-region exemption
    const taped: FlatDocument = { ...doc, bandTypes: [...doc.bandTypes, tape(0)], boards: doc.boards.map((b, i) => (i === panel ? { ...b, bands: b.bands.map((x) => ({ ...x, type: 'tape-0' })) } : b)) };
    expect(featureAllowed(taped, [site]).ruledOut).toEqual([{ site: 1, kind: 'dado', part: panel, feature: 'edge band' }]);
  });
});

describe('the user\'s dado ruling (P11): an edged shelf is housed whole', () => {
  const doc = () => banded(SIDE(), [solid(0.75)], { Shelf: { bands: (b) => [[front(b), 'solid-0.75']] } });
  it('a shelf with 3/4" solid edging on its front, entering a dado: dado and stopped-dado kept, the tenon ruled out', () => {
    const d = doc();
    const sites = findSites(d);
    expect(summary(d, sites)).toEqual([['Shelf', 'Side', ['mortise-tenon', 'dado', 'stopped-dado', 'butt']]]);
    const out = featureAllowed(d, sites);
    expect(out.sites[0]!.allowed).toEqual(['dado', 'stopped-dado', 'butt']);
    expect(out.ruledOut).toEqual([{ site: 1, kind: 'mortise-tenon', part: indexOf(d, 'Shelf'), feature: 'edge band' }]);
    expect(lineFor(d, out.sites, out.ruledOut, 1)).toBe("Shelf → Side: mortise and tenon ruled out — Shelf's edge band is in the way.");
  });
  it('joined at a stop on the front, the notch shortens the edging\'s visible run by the housed length (inset >= 3/4)', () => {
    const d = doc();
    const sites = findSites(d);
    const shelf = indexOf(d, 'Shelf');
    const S = d.boards[shelf]!;
    expect(localEnd(S, 'length', -1)).toBe('min');
    expect(sites[0]!.stopEnds).toEqual([{ axis: 2, end: 'min' }]);
    const depth = rangesOf(sites[0]!, d).dadoDepth[1];
    const joined = (inset: number) => {
      const r = applyJoints(d, sites, [{ site: 1, joint: 'stopped-dado', depth, stopAt: { axis: 2, end: 'min' }, inset }]);
      expect(r.skipped).toEqual([]);
      return r.doc.boards[shelf]!;
    };
    const at = joined(0.75);
    expect(at.length).toBe(S.length + depth);
    expect(visibleRun(at, front(at), 0.75)).toEqual({ lo: depth, hi: at.length, shortLo: true, shortHi: false });
    // A stop inset shallower than the edging leaves edging standing in the notch: the run is not shortened.
    const shallow = joined(0.5);
    expect(visibleRun(shallow, front(shallow), 0.75)).toEqual({ lo: 0, hi: shallow.length, shortLo: false, shortHi: false });
  });
});

describe('pockets (P9)', () => {
  // The side's front edge (world -Z) edged; the shelf's mortise spans world z [1/2, 10.75], the stopped dado's groove
  // [inset, 11.25] (the smallest inset: rangesOf's 1/4, raised to clear the side's front edging, F2), the dado's [0, 11.25].
  const edgedSide = (type: BandType) => banded(SIDE(), [type], { Side: { bands: (b) => [[front(b), type.id]] } });
  it('the preconditions: the front is the stopped dado\'s only stop end; its smallest inset is 1/4', () => {
    const doc = SIDE();
    const sites = findSites(doc);
    expect(sites[0]!.stopEnds).toEqual([{ axis: 2, end: 'min' }]);
    expect(rangesOf(sites[0]!, doc).inset({ axis: 2, end: 'min' })[0]).toBe(0.25);
  });
  it('edging at 1/4 (touching the stopped groove): dado ruled out; stopped-dado and the tenon kept', () => {
    const doc = edgedSide(solid(0.25));
    const out = featureAllowed(doc, findSites(doc));
    expect(out.sites[0]!.allowed).toEqual(['mortise-tenon', 'stopped-dado', 'butt']);
    expect(out.ruledOut).toEqual([{ site: 1, kind: 'dado', part: indexOf(doc, 'Side'), feature: 'edge band' }]);
  });
  it('edging a sliver deeper than 1/4 (1/4 + 1e-6): the stop\'s smallest inset rises to the next 1/16 (5/16), stopped-dado kept (F2)', () => {
    const doc = edgedSide(solid(0.25 + 1e-6));
    const sites = findSites(doc);
    expect(rangesOf(sites[0]!, doc).inset({ axis: 2, end: 'min' })).toEqual([0.3125, 5.625]);
    const out = featureAllowed(doc, sites);
    expect(out.sites[0]!.allowed).toEqual(['mortise-tenon', 'stopped-dado', 'butt']);
    expect(out.ruledOut.map((r) => [r.kind, r.feature])).toEqual([['dado', 'edge band']]);
  });
  it('a mortise landing inside a receiver\'s 3/4 edging strip: mortise-tenon ruled out (Review Focus 3); the stopped dado clears it (F2)', () => {
    const doc = edgedSide(solid(0.75));
    const out = featureAllowed(doc, findSites(doc));
    const side = indexOf(doc, 'Side');
    expect(out.sites[0]!.allowed).toEqual(['stopped-dado', 'butt']);
    expect(out.ruledOut).toEqual(['mortise-tenon', 'dado'].map((kind) => ({ site: 1, kind, part: side, feature: 'edge band' })));
  });
  it('tape on the receiver\'s front edge has no region: a through dado across it is accepted (§3.3)', () => {
    const doc = edgedSide(tape(0));
    const sites = findSites(doc);
    expect(featureAllowed(doc, sites).sites).toBe(sites);
  });
});

describe('the receiver\'s edging raises a stopped dado\'s smallest inset (final review F2, the user\'s ruling)', () => {
  const edgedSide = (type: BandType, side: (b: Board) => ProfileSide = front, make = SIDE) => banded(make(), [type], { Side: { bands: (b) => [[side(b), type.id]] } });
  const FRONT = { axis: 2, end: 'min' } as const;
  it('a plywood side with 3/4" solid front edging, the shelf flush at the front: inset[0] === 0.75, stopped-dado KEPT', () => {
    const doc = edgedSide(solid(0.75));
    const sites = findSites(doc);
    expect(sites[0]!.stopEnds).toEqual([FRONT]);
    expect(rangesOf(sites[0]!, doc).inset(FRONT)).toEqual([0.75, 5.625]);
    const out = featureAllowed(doc, sites);
    expect(out.sites[0]!.allowed).toContain('stopped-dado');
    // joined at the smallest inset, the side's groove only touches the edging strip (judged here, not through the watch)
    const depth = rangesOf(sites[0]!, doc).dadoDepth[1];
    const r = applyJoints(doc, sites, [{ site: 1, joint: 'stopped-dado', depth, stopAt: FRONT, inset: 0.75 }]);
    expect(r.skipped).toEqual([]);
    const S = r.doc.boards[indexOf(doc, 'Side')]!;
    const strip = bandRegions(S, doc.bandTypes)[0]!.region!;
    expect(S.cuts).toHaveLength(1);
    const groove = clippedRegion(S, S.cuts[0]!);
    expect(Math.min(groove.width[1], strip.width[1]) - Math.max(groove.width[0], strip.width[0])).toBeLessThanOrEqual(0);
  });
  it('the site message (the USER turn) lists the raised minimum', () => {
    const doc = edgedSide(solid(0.75));
    const sites = featureAllowed(doc, findSites(doc)).sites;
    expect(siteMessage(doc, sites)).toContain('stopped-dado (depth 0.125–0.375; stopAt -Z with inset 0.75–5.625)');
  });
  it('validChoice rejects an inset of 1/4 there (it would cut the edging), and accepts 3/4', () => {
    const doc = edgedSide(solid(0.75));
    const s = featureAllowed(doc, findSites(doc)).sites[0]!;
    const c = (inset: number) => ({ site: 1, joint: 'stopped-dado' as const, depth: 0.375, stopAt: FRONT, inset });
    expect(validChoice(c(0.25), s, doc)).toBe(false);
    expect(validChoice(c(0.75), s, doc)).toBe(true);
  });
  it('derived from the geometry: an off-grid 49/64 band gives 13/16 flush, 3/4 with the shelf set back 1/64', () => {
    const t = 49 / 64;
    const flush = edgedSide(solid(t));
    expect(rangesOf(findSites(flush)[0]!, flush).inset(FRONT)[0]).toBe(0.8125);
    // set back after `design`, which snaps positions to the 1/16 grid
    const setBack = () => { const d = SIDE(); named(d, 'Shelf').position[2] = 1 / 64; return d; };
    const back = edgedSide(solid(t), front, setBack);
    const sites = findSites(back);
    expect(sites[0]!.stopEnds).toEqual([FRONT]);
    expect(rangesOf(sites[0]!, back).inset(FRONT)[0]).toBe(0.75);   // up(49/64 − 1/64) = 3/4
    expect(featureAllowed(back, sites).sites[0]!.allowed).toContain('stopped-dado');
  });
  it('at the max end: a side 3/4 deeper at the FRONT, edged 3/4 on its back, the shelf flush at the back (+Z)', () => {
    const atBack = () => design({ name: 'Side', at: [0, 0, -0.75], size: [0.75, 30, 12] }, { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] });
    const BACK = { axis: 2, end: 'max' } as const;
    const doc = edgedSide(solid(0.75), (b) => sideAt(b, 'width', 1), atBack);
    const sites = findSites(doc);
    expect(sites[0]!.stopEnds).toEqual([BACK]);
    expect(rangesOf(sites[0]!, doc).inset(BACK)).toEqual([0.75, 5.625]);
    expect(featureAllowed(doc, sites).sites[0]!.allowed).toContain('stopped-dado');
    // only the band facing the stop end counts: the same edging on the side's FRONT leaves the back stop at 1/4
    const other = edgedSide(solid(0.75), front, atBack);
    expect(rangesOf(findSites(other)[0]!, other).inset(BACK)).toEqual([0.25, 5.625]);
    // and with both edges banded, the front strip (not facing the front stop's far side) decides the front stop alone
    const both = banded(SIDE(), [solid(0.75)], { Side: { bands: (b) => [[front(b), 'solid-0.75'], [sideAt(b, 'width', 1), 'solid-0.75']] } });
    expect(rangesOf(findSites(both)[0]!, both).inset(FRONT)).toEqual([0.75, 5.625]);
  });
  it('tape of thickness 0 has no strip: the range is today\'s; a thick tape (1/16) under today\'s 1/4 leaves it too', () => {
    for (const ty of [tape(0), tape(1 / 16)]) {
      const doc = edgedSide(ty);
      expect(rangesOf(findSites(doc)[0]!, doc).inset(FRONT)).toEqual([0.25, 5.625]);
    }
  });
  it('the boundary by edging thickness: 5.625 raises the minimum to the maximum (kept); a hair more leaves today\'s range and the trial rules it out', () => {
    const at = edgedSide(solid(5.625));
    const sites = findSites(at);
    expect(rangesOf(sites[0]!, at).inset(FRONT)).toEqual([5.625, 5.625]);
    expect(featureAllowed(at, sites).sites[0]!.allowed).toContain('stopped-dado');
    const over = edgedSide(solid(5.625 + 1e-6));
    const s2 = findSites(over);
    expect(rangesOf(s2[0]!, over).inset(FRONT)).toEqual([0.25, 5.625]);
    expect(featureAllowed(over, s2).ruledOut.map((r) => r.kind)).toContain('stopped-dado');
  });
  it('a band-free project\'s ranges and site message are byte for byte as before', () => {
    const side = SIDE();
    expect(siteMessage(side, findSites(side))).toBe("Parts:\n- Side (oak): 0.75 x 30 x 12 in, x 0–0.75, y 0–30, z 0–12\n- Shelf (oak): 20 x 0.75 x 11.25 in, x 0.75–20.75, y 12–12.75, z 0–11.25\n\nSites:\n1. Shelf → Side — end into face, meeting on X (Shelf's -X face). Allowed: mortise-tenon (tenonLength 0.5–0.5), dado (depth 0.125–0.375), stopped-dado (depth 0.125–0.375; stopAt -Z with inset 0.25–5.625), butt.");
    const book = BOOKCASE();
    expect(siteMessage(book, findSites(book))).toBe("Parts:\n- Left (oak): 0.75 x 30 x 11.25 in, x 0–0.75, y 0–30, z 0–11.25\n- Right (oak): 0.75 x 30 x 11.25 in, x 20.75–21.5, y 0–30, z 0–11.25\n- Shelf (oak): 20 x 0.75 x 11.25 in, x 0.75–20.75, y 12–12.75, z 0–11.25\n- Back (oak): 21.5 x 30 x 0.25 in, x 0–21.5, y 0–30, z 11.25–11.5\n\nSites:\n1. Shelf → Left — end into face, meeting on X (Shelf's -X face). Allowed: mortise-tenon (tenonLength 0.5–0.5), dado (depth 0.125–0.375), stopped-dado (depth 0.125–0.375; stopAt -Z with inset 0.25–5.625 or +Z with inset 0.25–5.625), butt.\n2. Shelf → Right — end into face, meeting on X (Shelf's +X face). Allowed: mortise-tenon (tenonLength 0.5–0.5), dado (depth 0.125–0.375), stopped-dado (depth 0.125–0.375; stopAt -Z with inset 0.25–5.625 or +Z with inset 0.25–5.625), butt.\n3. Back → Left — face against edge, meeting on Z (Back's -Z face). Allowed: rabbet (depth 0.125–0.375), butt.\n4. Back → Right — face against edge, meeting on Z (Back's -Z face). Allowed: rabbet (depth 0.125–0.375), butt.");
  });
});

describe('"Offer clear ends" (the user\'s ruling, 2026-10-22): an end whose trial conflicts is dropped from stopEnds', () => {
  const FRONT = { axis: 2, end: 'min' } as const;
  const BACK = { axis: 2, end: 'max' } as const;
  /** SHELF (a shelf flush front AND back between two sides) with both sides edged 3/4 on the given edges. */
  const bookcase = (...edges: ((b: Board) => ProfileSide)[]) => banded(SHELF(), [solid(0.75)], {
    Left: { bands: (b) => edges.map((e) => [e(b), 'solid-0.75']) }, Right: { bands: (b) => edges.map((e) => [e(b), 'solid-0.75']) },
  });
  const backEdge = (b: Board) => sideAt(b, 'width', 1);
  it('the bookcase: front-edged sides, the shelf flush front and back — stopped-dado KEPT at the front end only', () => {
    const doc = bookcase(front);
    const found = findSites(doc);
    expect(found.map((s) => s.stopEnds)).toEqual([[FRONT, BACK], [FRONT, BACK]]);
    const out = featureAllowed(doc, found);
    for (const s of out.sites) {
      expect(s.allowed).toEqual(['stopped-dado', 'butt']);
      expect(s.stopEnds).toEqual([FRONT]);
    }
    // ruled out: the tenon and the dado only; the dropped end writes no summary entry
    expect(out.ruledOut.map((r) => [r.site, r.kind])).toEqual([[1, 'mortise-tenon'], [1, 'dado'], [2, 'mortise-tenon'], [2, 'dado']]);
    const m = siteMessage(doc, out.sites);
    expect(m).toContain('stopped-dado (depth 0.125–0.375; stopAt -Z with inset 0.75–5.625), butt.');
    expect(m).not.toContain('+Z with inset');
    // joined at the front end, both grooves clear the edging
    const choices = out.sites.map((s) => ({ site: s.id, joint: 'stopped-dado' as const, depth: 0.375, stopAt: FRONT, inset: 0.75 }));
    const r = applyJoints(doc, out.sites, choices);
    expect(r.skipped).toEqual([]);
    for (const name of ['Left', 'Right']) {
      const S = r.doc.boards[indexOf(doc, name)]!;
      const strip = bandRegions(S, doc.bandTypes)[0]!.region!;
      expect(S.cuts).toHaveLength(1);
      const g = clippedRegion(S, S.cuts[0]!);
      expect(Math.min(g.width[1], strip.width[1]) - Math.max(g.width[0], strip.width[0])).toBeLessThanOrEqual(0);
    }
  });
  it('validChoice rejects the dropped back end (at any inset) and accepts the front', () => {
    const doc = bookcase(front);
    const s = featureAllowed(doc, findSites(doc)).sites[0]!;
    const c = (stopAt: typeof FRONT | typeof BACK, inset: number) => ({ site: 1, joint: 'stopped-dado' as const, depth: 0.375, stopAt, inset });
    expect(validChoice(c(BACK, 0.25), s, doc)).toBe(false);
    expect(validChoice(c(BACK, 0.75), s, doc)).toBe(false);
    expect(validChoice(c(FRONT, 0.75), s, doc)).toBe(true);
  });
  it('a hole case: a bore in the side\'s front strip clears the front stop\'s groove but not the back stop\'s — kept, narrowed', () => {
    // drilled into the left side's inner (+X) face 1/4 deep at y 12.375, z 0.1 (1/8 bore: z [0.0375, 0.1625]); the front
    // stop's groove starts at 1/4, the back stop's runs from 0.
    const doc = banded(SHELF(), [], { Left: { bands: () => [], holes: (b) => [holeAt(b, 0, 1, [0.75, 12.375, 0.1], 0.125, 0.25)] } });
    const found = findSites(doc);
    const left = found.find((s) => s.receive === indexOf(doc, 'Left'))!;
    expect(left.stopEnds).toEqual([FRONT, BACK]);
    const out = featureAllowed(doc, found);
    const s = out.sites.find((x) => x.id === left.id)!;
    expect(s.allowed).toEqual(['mortise-tenon', 'stopped-dado', 'butt']);
    expect(s.stopEnds).toEqual([FRONT]);
    expect(out.ruledOut).toEqual([{ site: left.id, kind: 'dado', part: indexOf(doc, 'Left'), feature: 'holes' }]);
    // the other site is untouched: the same object
    const other = found.find((x) => x.id !== left.id)!;
    expect(out.sites.find((x) => x.id === other.id)).toBe(other);
  });
  it('both ends conflicting: ruled out as before, naming the first end\'s hit; stopEnds left as found', () => {
    const doc = bookcase(front, backEdge);
    const found = findSites(doc);
    const out = featureAllowed(doc, found);
    for (const [i, s] of out.sites.entries()) {
      expect(s.allowed).toEqual(['butt']);
      expect(s.stopEnds).toEqual(found[i]!.stopEnds);
    }
    expect(out.ruledOut.filter((r) => r.kind === 'stopped-dado')).toEqual([
      { site: 1, kind: 'stopped-dado', part: indexOf(doc, 'Left'), feature: 'edge band' },
      { site: 2, kind: 'stopped-dado', part: indexOf(doc, 'Right'), feature: 'edge band' },
    ]);
  });
});

describe('trims (P11)', () => {
  // The shelf butts the back mid-panel and is trimmed 1/4 off its back edge (its width max end) when the back moves into
  // its rabbets.
  it('a band on the end a rabbet trims rules rabbet out for the whole unit, tape included', () => {
    const doc = banded(BOOKCASE(), [], { Shelf: { bands: (b) => [[sideAt(b, 'width', 1), BUILT_IN_BAND_ID]] } });
    const shelf = indexOf(doc, 'Shelf');
    expect(axisDimensions(doc.boards[shelf]!)[2]).toBe('width');
    const sites = findSites(doc);
    const rabbets = sites.filter((s) => s.kind === 'face-against-edge');
    expect(rabbets.map((s) => doc.boards[s.receive].name)).toEqual(['Left', 'Right']);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual(rabbets.map((s) => ({ site: s.id, kind: 'rabbet', part: shelf, feature: 'edge band' })));
    for (const s of rabbets) expect(out.sites[sites.indexOf(s)]!.allowed).toEqual(['butt']);
    // The tape runs along the shelf's length: its own sites keep every kind.
    for (const s of sites.filter((m) => m.enter === shelf)) expect(out.sites[sites.indexOf(s)]).toBe(s);
  });
  it('a solid band running along the trimmed dimension is shortened with the part: rabbet kept', () => {
    // On the shelf's -X end, running its whole width: its strip meets the trimmed slab.
    const doc = banded(BOOKCASE(), [solid(0.25)], { Shelf: { bands: (b) => [[sideAt(b, 'length', -1), 'solid-0.25']] } });
    const sites = findSites(doc);
    const rabbets = sites.filter((s) => s.kind === 'face-against-edge');
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut.filter((r) => r.kind === 'rabbet')).toEqual([]);
    for (const s of rabbets) expect(out.sites[sites.indexOf(s)]).toBe(s);
    // It is on the shelf's end into Left: that site's growing kinds go.
    const intoLeft = sites.find((s) => s.enter === indexOf(doc, 'Shelf') && doc.boards[s.receive]!.name === 'Left')!;
    expect(out.sites[sites.indexOf(intoLeft)]!.allowed).toEqual(['butt']);
  });
});

describe('Review Focus 4', () => {
  it('a needs-straight solid band on a bowed edge is judged at its thickness (rules a pocket out)', () => {
    // A 1/16 bow along the side's front edge and 5/8 edging on it: the edging is faulted, but judged as stored (P10). The
    // mortise (from 1/2 in) clears the bow's waste and enters the strip; the dado meets the curve first. (Was 3/8 edging
    // ruling the stopped dado out; since F2 the stop's smallest inset clears the strip, judged at the type's 5/8 too.)
    const doc = banded(SIDE(), [solid(0.625)], {
      Side: { bands: (b) => [[front(b), 'solid-0.625']], curves: (b) => [{ id: 'b', ...bowCurve({ through: 'thickness', along: 'length', side: front(b).from, span: 30, rise: 0.0625 }) }] },
    });
    const S = named(doc, 'Side');
    expect(bandFaults(S, doc.bandTypes)).toEqual([{ side: front(S), kind: 'needs-straight' }]);
    const sites = findSites(doc);
    expect(rangesOf(sites[0]!, doc).inset({ axis: 2, end: 'min' })[0]).toBe(0.625);
    const out = featureAllowed(doc, sites);
    const side = indexOf(doc, 'Side');
    expect(out.sites[0]!.allowed).toEqual(['stopped-dado', 'butt']);
    expect(out.ruledOut).toEqual([
      { site: 1, kind: 'mortise-tenon', part: side, feature: 'edge band' },
      { site: 1, kind: 'dado', part: side, feature: 'curve' },
    ]);
  });
  it('a band whose type id is unknown is ignored, with no throw', () => {
    const doc = banded(SIDE(), [], { Side: { bands: (b) => [[front(b), 'nope']] }, Shelf: { bands: (b) => [[sideAt(b, 'length', -1), 'nope']] } });
    const sites = findSites(doc);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual([]);
    expect(out.sites).toBe(sites);
  });
});

describe('order: holes, then curves and profiles, then bands', () => {
  it('a hole and a band met at one event: holes', () => {
    // A bore through the rail's length and a band on its tenoned end: both meet the growth.
    const doc = banded(LEG_RAIL(), [], { Rail: { bands: (b) => [[sideAt(b, 'length', -1), BUILT_IN_BAND_ID]], holes: (b) => [holeAt(b, 0, -1, [0, 25.75, 0.875], 0.25, 'through')] } });
    const rail = indexOf(doc, 'Rail');
    expect(featureAllowed(doc, findSites(doc)).ruledOut).toEqual(['mortise-tenon', 'dado'].map((kind) => ({ site: 1, kind, part: rail, feature: 'holes' })));
  });
  it('a curve and a band met at one event: the curve', () => {
    const doc = banded(LEG_RAIL(), [], {
      Rail: { bands: (b) => [[sideAt(b, 'length', -1), BUILT_IN_BAND_ID]], curves: (b) => [{ id: 'k', ...cornerCurve({ through: 'thickness', uFrom: localEnd(b, 'length', -1), vFrom: localEnd(b, 'width', -1), radius: 1 }) }] },
    });
    const rail = indexOf(doc, 'Rail');
    expect(featureAllowed(doc, findSites(doc)).ruledOut).toEqual(['mortise-tenon', 'dado'].map((kind) => ({ site: 1, kind, part: rail, feature: 'curve' })));
  });
});

describe('byte for byte', () => {
  it.each([['shelf', SHELF], ['side', SIDE], ['leg and rail', LEG_RAIL], ['bookcase', BOOKCASE]] as const)('with no band, the same array comes back: %s', (_n, make) => {
    const doc = make();
    const sites = findSites(doc);
    const out = featureAllowed(doc, sites);
    expect(out.sites).toBe(sites);
    expect(out.ruledOut).toEqual([]);
  });
});
