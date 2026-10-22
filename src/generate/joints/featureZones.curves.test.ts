import { describe, expect, it } from 'vitest';
import { designToDocument } from '../../document/generated';
import { clippedRegion, flatDocument } from '../../document/document';
import type { Board, CurveCut, CutFrom, Dimension, FlatDocument, HoleRow, ProfileCut, ProfileSide, Region } from '../../document/document';
import { archCurve, bowCurve, cornerCurve } from '../../document/curves';
import { axisDimensions, axisFrame, endFacing, fromWorldOffset } from '../../document/geometry';
import { crossSectionOverlaps, featureMeetsBox, featureTouchesEnd, runsOutThrough, shapedFeatures } from '../../document/featureRegions';
import { findSites, rangesOf } from './sites';
import type { Site } from './sites';
import { applyJoints, tenonSection } from './recipes';
import { featureAllowed } from './featureZones';

// Joinery features chunk 2 (spec §3.3–§3.5; P4–P7): per site, only the joint kinds that would cut, grow or trim into a
// curve or an edge profile are ruled out. Holes keep chunk 1's rule (featureZones.test.ts, unmodified).

type V3 = [number, number, number];
type P = { name: string; at: V3; size: V3 };
const design = (...parts: P[]) => flatDocument(designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}, { centre: false }).doc);
const named = (doc: FlatDocument, name: string) => doc.boards.find((b) => b.name === name)!;
const indexOf = (doc: FlatDocument, name: string) => doc.boards.findIndex((b) => b.name === name);
type Shaped = { curves?: CurveCut[]; profiles?: ProfileCut[]; holes?: HoleRow[] };
/** `doc` with each named part's curves, profiles (and holes), built from that part as it stands. */
const shaped = (doc: FlatDocument, parts: Record<string, (b: Board) => Shaped>): FlatDocument =>
  ({ ...doc, boards: doc.boards.map((b) => (parts[b.name] ? { ...b, ...parts[b.name](b) } : b)) });
const summary = (doc: FlatDocument, sites: readonly Site[]) => sites.map((s) => [doc.boards[s.enter].name, doc.boards[s.receive].name, s.allowed]);

/** The board-local end of `d` facing WORLD side `side` on its world axis (inv 44). */
const localEnd = (b: Board, d: Dimension, side: -1 | 1): CutFrom => endFacing(b, axisDimensions(b).indexOf(d), side);
/** A straight profile running the part's whole length on the long arris at the two WORLD faces given ([axis, side]): the
 *  width's face is the profile's side, the thickness's its face. */
const arris = (b: Board, f: [number, -1 | 1], g: [number, -1 | 1], size = 0.25, kind: ProfileCut['kind'] = 'roundover', id = 'p'): ProfileCut => {
  const dims = axisDimensions(b);
  const [w, t] = dims[f[0]] === 'width' ? [f, g] : [g, f];
  expect([dims[w[0]], dims[t[0]]]).toEqual(['width', 'thickness']);
  const s: ProfileSide = { across: 'width', from: endFacing(b, w[0], w[1]) };
  return { id, face: endFacing(b, t[0], t[1]), kind, size, fillet: 0, facing: 'face', run: { start: { side: s, through: 'min' }, end: { side: { ...s }, through: 'max' } } };
};
/** `p` stopped at `at` from its run's `from` end at the run's far end, running through `through` at its start. */
const stoppedFar = (p: ProfileCut, through: CutFrom, from: CutFrom, at: number): ProfileCut => {
  const run = p.run as { start: { side: ProfileSide } };
  const s = run.start.side;
  const [start, end] = [{ side: { ...s }, through }, { side: { ...s }, from, at }];
  return { ...p, run: through === 'min' ? { start, end } : { start: end, end: start } } as ProfileCut;
};
/** A one-hole row (featureZones.test.ts' helper): drilled along WORLD axis `k` from its `fromSide` face at world `at`. */
const holeAt = (b: Board, k: number, fromSide: -1 | 1, at: V3, diameter: number, depth: number | 'through'): HoleRow => {
  const dims = axisDimensions(b);
  const [p, q] = [0, 1, 2].filter((a) => a !== k);
  const local = (a: number) => fromWorldOffset(b, a, at[a] - b.position[a]);
  return { id: 'h', face: dims[k], from: endFacing(b, k, fromSide), diameter, depth, along: dims[p], alongFrom: 'min', station: local(p), count: 1, pitch: 0, acrossFrom: 'min', inset: local(q) };
};
/** P7's condition 3 for a through-length feature: its waste overlaps the tenon's section (width × thickness). */
const overlapsTenon = (b: Board, i: number) => {
  const { view, features } = shapedFeatures(b);
  const { cheek, shoulder } = tenonSection(b.thickness, b.width);
  return crossSectionOverlaps(view, features[i]!, [shoulder, cheek], [b.width - shoulder, b.thickness - cheek]);
};

/** A rail between two legs, its faces inset 1/2 from the legs' faces: tenoned at both ends. */
const TWO_LEGS = () => design(
  { name: 'Leg A', at: [0, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
  { name: 'Leg B', at: [19.75, 0, 0], size: [1.75, 28, 1.75] },
);
/** One rail entering a leg at the rail's world -X end (its board-local min end), inset 1/2: tenon and dado. */
const LEG_RAIL = () => design({ name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] }, { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] });
/** The same rail flush with the leg's -Z face: a stopped dado too. */
const FLUSH = () => design({ name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] }, { name: 'Rail', at: [1.75, 23.5, 0], size: [18, 3.5, 0.75] });
const GROWING = ['mortise-tenon', 'dado', 'stopped-dado'] as const;
const BOOKCASE = () => design(
  { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
  { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
);
/** The rail's bottom edge (world -Y): the width end its arches and bows sit on. */
const bottom = (b: Board) => localEnd(b, 'width', -1);

describe('spec §3.5 examples', () => {
  it('a rail with a 1/4 roundover along its top edges, tenoned at both ends: allowed unchanged', () => {
    const doc = shaped(TWO_LEGS(), { Rail: (b) => ({ profiles: [arris(b, [1, 1], [2, 1], 0.25, 'roundover', 'p1'), arris(b, [1, 1], [2, -1], 0.25, 'roundover', 'p2')] }) });
    const rail = named(doc, 'Rail');
    // Preconditions: both roundovers reach both tenoned ends (the exception is exercised) and clear the tenon's section.
    const { view, features } = shapedFeatures(rail);
    expect(features.map((f) => f.word)).toEqual(['roundover profile', 'roundover profile']);
    for (const [i, f] of features.entries()) {
      for (const end of ['min', 'max'] as const) expect(featureTouchesEnd(view, f, 'length', end)).toBe(true);
      expect(overlapsTenon(rail, i)).toBe(false);
    }
    const sites = findSites(doc);
    expect(summary(doc, sites)).toEqual([
      ['Rail', 'Leg A', ['mortise-tenon', 'dado', 'butt']], ['Rail', 'Leg B', ['mortise-tenon', 'dado', 'butt']],
    ]);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual([]);
    expect(out.sites).toBe(sites);
  });

  it('a leg rounded over on its outer corner, apron flush: dado ruled out, tenon kept', () => {
    // The leg's arris where its inner face (+X, the apron's end) meets the face the apron is flush with (-Z).
    const doc = shaped(FLUSH(), { Leg: (b) => ({ profiles: [arris(b, [0, 1], [2, -1])] }) });
    const sites = findSites(doc);
    expect(summary(doc, sites)).toEqual([['Rail', 'Leg', ['mortise-tenon', 'dado', 'stopped-dado', 'butt']]]);
    const out = featureAllowed(doc, sites);
    const leg = indexOf(doc, 'Leg');
    // The dado's groove runs out through the flush face, over the roundover; the stopped dado's only stop end is that
    // face, its groove stopped 1/4 short of it: it only touches the roundover's tangent line, so it is kept.
    expect(out.sites[0]!.allowed).toEqual(['mortise-tenon', 'stopped-dado', 'butt']);
    expect(out.ruledOut).toEqual([{ site: 1, kind: 'dado', part: leg, feature: 'roundover profile' }]);
  });

  it('an apron arched between the legs, clear of the ends: allowed unchanged', () => {
    const doc = shaped(TWO_LEGS(), { Rail: (b) => ({ curves: [{ id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: bottom(b), from: 'min', start: 3, span: 12, rise: 1.25 }) }] }) });
    const sites = findSites(doc);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual([]);
    expect(out.sites).toBe(sites);
  });
});

describe('the growing end (P6, P7)', () => {
  it('a rounded corner at the rail\'s tenoned end rules out the growing kinds', () => {
    const doc = shaped(FLUSH(), { Rail: (b) => ({ curves: [{ id: 'k', ...cornerCurve({ through: 'thickness', uFrom: localEnd(b, 'length', -1), vFrom: bottom(b), radius: 1 }) }] }) });
    const out = featureAllowed(doc, findSites(doc));
    expect(out.sites[0]!.allowed).toEqual(['butt']);
    expect(out.ruledOut).toEqual(GROWING.map((kind) => ({ site: 1, kind, part: indexOf(doc, 'Rail'), feature: 'curve' })));
  });

  it('a bow at a tenoned end rules out the growing kinds', () => {
    // bowCurve narrows the part by its rise at each end: its waste lies along the end line for the rise (the controller's
    // ruling; P6 itself unchanged).
    const doc = shaped(FLUSH(), { Rail: (b) => ({ curves: [{ id: 'b', ...bowCurve({ through: 'thickness', along: 'length', side: bottom(b), span: 18, rise: 0.5 }) }] }) });
    const rail = named(doc, 'Rail');
    const { view, features } = shapedFeatures(rail);
    expect(featureTouchesEnd(view, features[0]!, 'length', localEnd(rail, 'length', -1))).toBe(true);
    const out = featureAllowed(doc, findSites(doc));
    expect(out.sites[0]!.allowed).toEqual(['butt']);
    expect(out.ruledOut).toEqual(GROWING.map((kind) => ({ site: 1, kind, part: indexOf(doc, 'Rail'), feature: 'curve' })));
  });

  it('a full-length arch meets the tenoned end at a point only: the growing kinds are kept (P6)', () => {
    const doc = shaped(FLUSH(), { Rail: (b) => ({ curves: [{ id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: bottom(b), from: 'min', start: 0, span: 18, rise: 1 }) }] }) });
    const rail = named(doc, 'Rail');
    const { view, features } = shapedFeatures(rail);
    // Precondition: its waste reaches the end's corner, not along the end line.
    expect(featureMeetsBox(view, features[0]!, { length: [0, 1e-3], width: [0, 1e-3], thickness: [0, 0.75] })).toBe(true);
    expect(featureTouchesEnd(view, features[0]!, 'length', 'min')).toBe(false);
    const sites = findSites(doc);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual([]);
    expect(out.sites).toBe(sites);
  });

  // A roundover's waste is the corner sliver: no roundover that fits 3/4 stock reaches the tenon's section on this rail
  // (its corner is 0.56 in from the arris; the sliver reaches 0.41 r). A 5/8 cove, a quarter circle out of the corner,
  // does: it stands in for "a roundover deeper than the shoulder" (reported).
  it('a run-through cove deeper than the shoulder rules out the growing kinds (P7, condition 3)', () => {
    const doc = shaped(FLUSH(), { Rail: (b) => ({ profiles: [arris(b, [1, 1], [2, 1], 0.625, 'cove')] }) });
    const rail = named(doc, 'Rail');
    expect(shapedFeatures(rail).features.map((f) => f.word)).toEqual(['cove profile']);
    expect(overlapsTenon(rail, 0)).toBe(true);
    const out = featureAllowed(doc, findSites(doc));
    expect(out.sites[0]!.allowed).toEqual(['butt']);
    expect(out.ruledOut).toEqual(GROWING.map((kind) => ({ site: 1, kind, part: indexOf(doc, 'Rail'), feature: 'cove profile' })));
  });

  it('run-through at a width-grown end takes no exception (P7, condition 1)', () => {
    // findSites grows an end-into-face part only along its length, so this site is built by hand: the panel's width
    // (world X) enters the leg at its width-min end. A roundover on the panel's bottom-end arris runs the whole width.
    const doc = shaped(design({ name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] }, { name: 'Panel', at: [1.75, 5, 0.5], size: [3.5, 18, 0.75] }), {
      Panel: (b) => {
        const s: ProfileSide = { across: 'length', from: localEnd(b, 'length', -1) };
        return { profiles: [{ id: 'p', face: localEnd(b, 'thickness', 1), kind: 'roundover', size: 0.25, fillet: 0, facing: 'face', run: { start: { side: s, through: 'min' }, end: { side: { ...s }, through: 'max' } } }] };
      },
    });
    const [leg, panel] = [indexOf(doc, 'Leg'), indexOf(doc, 'Panel')];
    const P = doc.boards[panel]!;
    expect(axisDimensions(P)[0]).toBe('width');
    expect(findSites(doc)).toEqual([]);
    // A dado only: mortiseTenon's recipe sets the tenon's width span on the grown axis itself, so it cannot grow a width.
    const site: Site = { id: 1, kind: 'end-into-face', enter: panel, receive: leg, axis: 0, side: -1, allowed: ['dado', 'butt'], stopEnds: [] };
    const end = endFacing(P, 0, -1);
    // Conditions 2 and 3 hold: it runs out through the grown (width) end and clears the would-be tenon section; only
    // condition 1 refuses the exception. The joint is real: the trial grows the panel's width.
    const { view, features } = shapedFeatures(P);
    expect(featureTouchesEnd(view, features[0]!, 'width', end)).toBe(true);
    expect(runsOutThrough(view, features[0]!, 'width', end)).toBe(true);
    const { cheek, shoulder } = tenonSection(P.thickness, P.width);
    expect(crossSectionOverlaps(view, features[0]!, [shoulder, cheek], [P.width - shoulder, P.thickness - cheek])).toBe(false);
    const grown = applyJoints(doc, [site], [{ site: 1, joint: 'dado', depth: rangesOf(site, doc).dadoDepth[1] }]);
    expect(grown.skipped).toEqual([]);
    expect(grown.doc.boards[panel]!.width).toBeGreaterThan(P.width);
    const out = featureAllowed(doc, [site]);
    expect(out.sites[0]!.allowed).toEqual(['butt']);
    expect(out.ruledOut).toEqual([{ site: 1, kind: 'dado', part: panel, feature: 'roundover profile' }]);
  });

  describe('a stopped profile running out through the tenoned end, stopped at the far end (Review Focus 4)', () => {
    // The rail grows at its board-local min end; the far stop is measured from either end.
    it.each([['from the growing end', 'min', 10], ['from the far end', 'max', 8]] as const)('a roundover that clears the tenon takes the exception (stop %s)', (_n, from, at) => {
      const doc = shaped(FLUSH(), { Rail: (b) => ({ profiles: [stoppedFar(arris(b, [1, 1], [2, 1]), localEnd(b, 'length', -1), from, at)] }) });
      const rail = named(doc, 'Rail');
      const { view, features } = shapedFeatures(rail);
      expect(localEnd(rail, 'length', -1)).toBe('min');
      expect(featureTouchesEnd(view, features[0]!, 'length', 'min')).toBe(true);
      expect(featureTouchesEnd(view, features[0]!, 'length', 'max')).toBe(false);
      expect(runsOutThrough(view, features[0]!, 'length', 'min')).toBe(true);
      expect(overlapsTenon(rail, 0)).toBe(false);
      const sites = findSites(doc);
      const out = featureAllowed(doc, sites);
      expect(out.ruledOut).toEqual([]);
      expect(out.sites).toBe(sites);
    });
    it('a cove that does not clear it loses the growing kinds', () => {
      const doc = shaped(FLUSH(), { Rail: (b) => ({ profiles: [stoppedFar(arris(b, [1, 1], [2, 1], 0.625, 'cove'), localEnd(b, 'length', -1), 'min', 10)] }) });
      const rail = named(doc, 'Rail');
      expect(runsOutThrough(shapedFeatures(rail).view, shapedFeatures(rail).features[0]!, 'length', 'min')).toBe(true);
      expect(overlapsTenon(rail, 0)).toBe(true);
      const out = featureAllowed(doc, findSites(doc));
      expect(out.sites[0]!.allowed).toEqual(['butt']);
      expect(out.ruledOut).toEqual(GROWING.map((kind) => ({ site: 1, kind, part: indexOf(doc, 'Rail'), feature: 'cove profile' })));
    });
  });
});

describe('trims (spec §3.4, §3.5)', () => {
  // The shelf butts the back mid-panel and is trimmed 1/4 off its back edge (world z [11, 11.25], its width max end)
  // when the back moves into its rabbets.
  const slab = (b: Board): Region => {
    const r: Region = { length: [0, b.length], width: [0, b.width], thickness: [0, b.thickness] };
    r.width = localEnd(b, 'width', 1) === 'max' ? [b.width - 0.25, b.width] : [0, 0.25];
    return r;
  };
  it('a curve in the slab a rabbet would trim rules rabbet out at the trimming site, for its whole unit', () => {
    // A shallow arch on the back edge, measured from that edge: Task 1's rebase would store it at a negative coordinate.
    const doc = shaped(BOOKCASE(), { Shelf: (b) => ({ curves: [{ id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: localEnd(b, 'width', 1), from: 'min', start: 8, span: 4, rise: 0.125 }) }] }) });
    const shelf = indexOf(doc, 'Shelf');
    const S = doc.boards[shelf]!;
    expect(axisDimensions(S)[2]).toBe('width');
    const { view, features } = shapedFeatures(S);
    expect(featureMeetsBox(view, features[0]!, slab(S))).toBe(true);
    const sites = findSites(doc);
    const rabbets = sites.filter((s) => s.kind === 'face-against-edge');
    expect(rabbets.map((s) => doc.boards[s.receive].name)).toEqual(['Left', 'Right']);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual(rabbets.map((s) => ({ site: s.id, kind: 'rabbet', part: shelf, feature: 'curve' })));
    for (const s of rabbets) expect(out.sites[sites.indexOf(s)]!.allowed).toEqual(['butt']);
    // The shelf's own sites keep every kind.
    for (const s of sites.filter((m) => m.enter === shelf)) expect(out.sites[sites.indexOf(s)]).toBe(s);
  });

  it('a run-through feature at a trimmed end does not', () => {
    // A shallow scoop across the shelf's top, through its whole width: the trim shortens it with the part.
    const doc = shaped(BOOKCASE(), { Shelf: (b) => ({ curves: [{ id: 'a', ...archCurve({ through: 'width', along: 'length', side: localEnd(b, 'thickness', 1), from: 'min', start: 8, span: 4, rise: 0.125 }) }] }) });
    const S = named(doc, 'Shelf');
    const { view, features } = shapedFeatures(S);
    expect(featureMeetsBox(view, features[0]!, slab(S))).toBe(true);
    expect(runsOutThrough(view, features[0]!, 'width', localEnd(S, 'width', 1))).toBe(true);
    const sites = findSites(doc);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual([]);
    expect(out.sites).toBe(sites);
  });
});

describe('Review Focus', () => {
  it('an arch near the min end of a rail tenoned there keeps the tenon (Review Focus 1)', () => {
    // 1" from the growing end, along the bottom edge the shoulder cut runs on; the tenon (1.5) is longer than 1", so a
    // shoulder cut judged in the grown part's current frame would land on the arch.
    const doc = shaped(LEG_RAIL(), { Rail: (b) => ({ curves: [{ id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: bottom(b), from: localEnd(b, 'length', -1), start: 1, span: 10, rise: 1 }) }] }) });
    const rail = named(doc, 'Rail');
    expect(localEnd(rail, 'length', -1)).toBe('min');
    expect(axisFrame(rail)[0].reversed).toBe(false);
    const sites = findSites(doc);
    expect(sites[0]!.allowed).toEqual(['mortise-tenon', 'dado', 'butt']);
    expect(rangesOf(sites[0]!, doc).tenonLength[1]).toBe(1.5);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual([]);
    expect(out.sites).toBe(sites);
  });

  describe('a swept loop on a top rules out what its footprint touches (P4)', () => {
    // A 1/2 roundover round the whole top (swept: its conservative footprint, closed, within the reach of the path). Two
    // legs near its -X edge: Touching's mortise ends exactly at the reach (x 1/2), Clear's 1/16 further in; their dados
    // house the whole leg, inside the reach. One leg well inside the top.
    const { shoulder } = tenonSection(1.75, 1.75);
    const TOP = () => shaped(design(
      { name: 'Top', at: [0, 28, 0], size: [20, 0.75, 12] },
      { name: 'Touching', at: [0.5 - shoulder, 0, 3], size: [1.75, 28, 1.75] },
      { name: 'Clear', at: [0.5 - shoulder + 1 / 16, 0, 7], size: [1.75, 28, 1.75] },
      { name: 'Inside', at: [9, 0, 5], size: [1.75, 28, 1.75] },
    ), { Top: (b) => ({ profiles: [{ id: 'o', face: localEnd(b, 'thickness', 1), kind: 'roundover', size: 0.5, fillet: 0, facing: 'face', run: { loop: true } }] }) });
    it('the preconditions: a swept profile; each mortise where it is meant to be', () => {
      const doc = TOP();
      expect(shapedFeatures(named(doc, 'Top')).features.map((x) => [x.word, x.swept !== undefined])).toEqual([['roundover profile', true]]);
      const sites = findSites(doc);
      expect(summary(doc, sites)).toEqual(['Touching', 'Clear', 'Inside'].map((n) => [n, 'Top', ['mortise-tenon', 'dado', 'butt']]));
      const mortiseX = (s: Site) => {
        const out = applyJoints(doc, sites, [{ site: s.id, joint: 'mortise-tenon', tenonLength: rangesOf(s, doc).tenonLength[1] }]).doc;
        const top = named(out, 'Top');
        return top.cuts[top.cuts.length - 1]!;
      };
      // The top's length runs along world X from 0: the mortise's offset along it is its world X.
      expect(axisDimensions(named(doc, 'Top'))[0]).toBe('length');
      expect([mortiseX(sites[0]!), mortiseX(sites[1]!)].map((c) => clippedRegion(named(doc, 'Top'), c).length[0])).toEqual([0.5, 0.5625]);
    });
    it('touching the footprint rules the mortise out; the dados, inside it, go everywhere near the edge', () => {
      const doc = TOP();
      const sites = findSites(doc);
      const out = featureAllowed(doc, sites);
      const top = indexOf(doc, 'Top');
      expect(out.ruledOut).toEqual([
        { site: 1, kind: 'mortise-tenon', part: top, feature: 'roundover profile' },
        { site: 1, kind: 'dado', part: top, feature: 'roundover profile' },
        { site: 2, kind: 'dado', part: top, feature: 'roundover profile' },
      ]);
      expect(out.sites.map((s) => s.allowed)).toEqual([['butt'], ['mortise-tenon', 'butt'], ['mortise-tenon', 'dado', 'butt']]);
      expect(out.sites[2]).toBe(sites[2]);
    });
  });
});

describe('holes and a curve on one part (chunk 1 regression)', () => {
  const corner = (b: Board): CurveCut => ({ id: 'k', ...cornerCurve({ through: 'thickness', uFrom: localEnd(b, 'length', -1), vFrom: bottom(b), radius: 1 }) });
  it('both met at one event: holes are judged first', () => {
    // A bore 'through' the rail's length and a rounded corner at its tenoned end: both meet the growth.
    const doc = shaped(LEG_RAIL(), { Rail: (b) => ({ holes: [holeAt(b, 0, -1, [0, 25.75, 0.875], 0.25, 'through')], curves: [corner(b)] }) });
    const out = featureAllowed(doc, findSites(doc));
    expect(out.ruledOut).toEqual([
      { site: 1, kind: 'mortise-tenon', part: indexOf(doc, 'Rail'), feature: 'holes' },
      { site: 1, kind: 'dado', part: indexOf(doc, 'Rail'), feature: 'holes' },
    ]);
  });
  it('the first hit names its word: the curve met at the growth, before the mortise reaches the leg\'s holes', () => {
    // From the leg's outer face, inside the mortise's section and past its depth (featureZones.test.ts' 1e-6 case).
    const doc = shaped(LEG_RAIL(), { Rail: (b) => ({ curves: [corner(b)] }), Leg: (b) => ({ holes: [holeAt(b, 0, -1, [0, 25.25, 0.875], 0.25, 0.5)] }) });
    const out = featureAllowed(doc, findSites(doc));
    expect(out.ruledOut).toEqual([
      { site: 1, kind: 'mortise-tenon', part: indexOf(doc, 'Rail'), feature: 'curve' },
      { site: 1, kind: 'dado', part: indexOf(doc, 'Rail'), feature: 'curve' },
    ]);
    // Without the curve, the leg's holes rule the mortise out.
    const holesOnly = shaped(LEG_RAIL(), { Leg: (b) => ({ holes: [holeAt(b, 0, -1, [0, 25.25, 0.875], 0.25, 0.5)] }) });
    expect(featureAllowed(holesOnly, findSites(holesOnly)).ruledOut).toEqual([{ site: 1, kind: 'mortise-tenon', part: indexOf(doc, 'Leg'), feature: 'holes' }]);
  });
});

describe('byte for byte', () => {
  it.each([['two legs and a rail', TWO_LEGS], ['flush rail', FLUSH], ['bookcase', BOOKCASE]] as const)('with no feature, the same array comes back: %s', (_n, make) => {
    const doc = make();
    const sites = findSites(doc);
    const out = featureAllowed(doc, sites);
    expect(out.sites).toBe(sites);
    expect(out.ruledOut).toEqual([]);
  });
});
