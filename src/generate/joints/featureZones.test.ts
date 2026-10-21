import { describe, expect, it } from 'vitest';
import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { designToDocument } from '../../document/generated';
import { clippedRegion, createBoard, flatDocument, migrateDocument } from '../../document/document';
import type { Board, CutFrom, FlatDocument, HoleRow, SloydDocument } from '../../document/document';
import { worldBox } from '../../document/designCheck';
import { SHAKER_TABLE_JSON } from '../../document/shakerTableFixture';
import { axisDimensions, axisFrame, boardExtents, endFacing, fromWorldOffset } from '../../document/geometry';
import { applyJoints } from './recipes';
import type { JointChoice } from './recipes';
import { findSites, rangesOf } from './sites';
import type { Site } from './sites';
import { featureAllowed } from './featureZones';

// Joinery-holes spec §3: per site, only the joint kinds that would cut, grow or trim into a hole are ruled out.

type V3 = [number, number, number];
type P = { name: string; at: V3; size: V3 };
const design = (...parts: P[]) => flatDocument(designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}, { centre: false }).doc);

/**
 * A one-hole row on `b` drilled along WORLD axis `k` from its `fromSide` face, centred at world `at` on the other two
 * axes. Board-local numbers come through the one turn table (inv 44); `alongFrom: 'max'` stores the same hole measured
 * from the row direction's other end.
 */
const holeAt = (b: Board, k: number, fromSide: -1 | 1, at: V3, diameter: number, depth: number | 'through', id = 'h', alongFrom: CutFrom = 'min'): HoleRow => {
  const dims = axisDimensions(b);
  const [p, q] = [0, 1, 2].filter((a) => a !== k);
  const local = (a: number) => fromWorldOffset(b, a, at[a] - b.position[a]);
  return {
    id, face: dims[k], from: endFacing(b, k, fromSide), diameter, depth,
    along: dims[p], alongFrom, station: alongFrom === 'min' ? local(p) : b[dims[p]] - local(p), count: 1, pitch: 0,
    acrossFrom: 'min', inset: local(q),
  };
};
const named = (doc: FlatDocument, name: string) => doc.boards.find((b) => b.name === name)!;
const indexOf = (doc: FlatDocument, name: string) => doc.boards.findIndex((b) => b.name === name);
/** `doc` with each named part's hole rows, built by `rows` from that part as it stands. */
const withHoles = (doc: FlatDocument, rows: Record<string, (b: Board) => HoleRow[]>): FlatDocument =>
  ({ ...doc, boards: doc.boards.map((b) => (rows[b.name] ? { ...b, holes: rows[b.name](b) } : b)) });
const siteOf = (doc: FlatDocument, sites: readonly Site[], enter: string, receive: string) =>
  sites.find((s) => doc.boards[s.enter].name === enter && doc.boards[s.receive].name === receive)!;
/** The world box a single chosen joint cuts into `part`, its last pocket. */
const pocketWorld = (doc: FlatDocument, choice: JointChoice, part: string) => {
  const out = applyJoints(doc, findSites(doc), [choice]).doc;
  const b = named(out, part);
  return worldBox(b, clippedRegion(b, b.cuts[b.cuts.length - 1]!));
};

const LEG_RAIL = () => design({ name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] }, { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] });
const SIDE_SHELF = (shelfThickness = 0.75) =>
  design({ name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] }, { name: 'Shelf', at: [0.75, 12, 0], size: [20, shelfThickness, 11.25] });
const BOOKCASE = () => design(
  { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
  { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
);
const LAP = () => design({ name: 'Lower', at: [0, 5, 9], size: [20, 0.75, 2] }, { name: 'Upper', at: [9, 5.75, 0], size: [2, 0.75, 20] });

describe('spec §3.5 examples', () => {
  it('holes under a shelf\'s dado and mortise zone: left as a butt', () => {
    // Shelf pins from the side's inner face, 3/8 deep, centred on the shelf's mid-thickness.
    const doc = withHoles(SIDE_SHELF(), { Side: (b) => [2, 9].map((z, i) => holeAt(b, 0, 1, [0, 12.375, z], 0.25, 0.375, `p${i}`)) });
    const sites = findSites(doc);
    expect(sites[0].allowed).toEqual(['mortise-tenon', 'dado', 'stopped-dado', 'butt']);
    const out = featureAllowed(doc, sites);
    expect(out.sites[0].allowed).toEqual(['butt']);
    const side = indexOf(doc, 'Side');
    expect(out.ruledOut).toEqual([
      { site: 1, kind: 'mortise-tenon', part: side, feature: 'holes' },
      { site: 1, kind: 'dado', part: side, feature: 'holes' },
      { site: 1, kind: 'stopped-dado', part: side, feature: 'holes' },
    ]);
  });

  it('dowel holes at a butt joint: left as a butt', () => {
    // The rail sits flush with the leg's -Z face, so the site offers a stopped dado too: all three growing kinds.
    const plain = design({ name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] }, { name: 'Rail', at: [1.75, 23.5, 0], size: [18, 3.5, 0.75] });
    const doc = withHoles(plain, { Rail: (b) => [24.5, 26].map((y, i) => holeAt(b, 0, -1, [0, y, 0.375], 0.375, 1, `d${i}`)) });
    const sites = findSites(doc);
    expect(sites[0].allowed).toEqual(['mortise-tenon', 'dado', 'stopped-dado', 'butt']);
    const out = featureAllowed(doc, sites);
    expect(out.sites[0].allowed).toEqual(['butt']);
    const rail = indexOf(doc, 'Rail');
    expect(out.ruledOut.map((r) => [r.kind, r.part])).toEqual([['mortise-tenon', rail], ['dado', rail], ['stopped-dado', rail]]);
  });

  it('leg holes clear of the apron: allowed unchanged', () => {
    const doc = withHoles(LEG_RAIL(), {
      Leg: (b) => [holeAt(b, 0, -1, [0, 10, 0.875], 0.25, 0.5)],
      Rail: (b) => [holeAt(b, 1, 1, [10, 0, 0.875], 0.25, 0.5)],
    });
    const sites = findSites(doc);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual([]);
    out.sites.forEach((s, i) => expect(s).toBe(sites[i]));
  });

  it('3/8 deep from the outer face of 3/4 stock under a 1/2-thick shelf: tenon ruled out, dado kept', () => {
    const plain = SIDE_SHELF(0.5);
    const site = findSites(plain)[0];
    const r = rangesOf(site, plain);
    // Preconditions: the mortise reaches 1/2 in from the inner face (x 0.75), the dado 3/8 — exactly.
    expect(pocketWorld(plain, { site: site.id, joint: 'mortise-tenon', tenonLength: r.tenonLength[1] }, 'Side').min[0]).toBe(0.25);
    expect(pocketWorld(plain, { site: site.id, joint: 'dado', depth: r.dadoDepth[1] }, 'Side').min[0]).toBe(0.375);
    // From the outer face (x 0), inside the tenon's section (y [12.125, 12.375], z [0.5, 10.75]).
    const doc = withHoles(plain, { Side: (b) => [holeAt(b, 0, -1, [0, 12.25, 5], 0.25, 0.375)] });
    const out = featureAllowed(doc, findSites(doc));
    expect(out.sites[0].allowed).toEqual(['dado', 'stopped-dado', 'butt']);
    expect(out.ruledOut).toEqual([{ site: 1, kind: 'mortise-tenon', part: indexOf(doc, 'Side'), feature: 'holes' }]);
  });

  it('a hole touching the mortise zone passes; a 1e-6 overlap is ruled out', () => {
    const plain = LEG_RAIL();
    const site = findSites(plain)[0];
    expect(site.allowed).toEqual(['mortise-tenon', 'dado', 'butt']);
    // The mortise reaches x 0.25 (1.5 into the 1.75 leg); the dado only x 0.875.
    expect(pocketWorld(plain, { site: site.id, joint: 'mortise-tenon', tenonLength: rangesOf(site, plain).tenonLength[1] }, 'Leg').min[0]).toBe(0.25);
    // From the leg's outer face, inside the tenon's section (y [24, 26.5], z [0.75, 1]).
    const holed = (depth: number) => withHoles(plain, { Leg: (b) => [holeAt(b, 0, -1, [0, 25.25, 0.875], 0.25, depth)] });
    const touching = holed(0.25);
    const kept = featureAllowed(touching, findSites(touching));
    expect(kept.sites[0].allowed).toEqual(['mortise-tenon', 'dado', 'butt']);
    expect(kept.ruledOut).toEqual([]);
    const over = holed(0.25 + 1e-6);
    const out = featureAllowed(over, findSites(over));
    expect(out.sites[0].allowed).toEqual(['dado', 'butt']);
    expect(out.ruledOut).toEqual([{ site: 1, kind: 'mortise-tenon', part: indexOf(over, 'Leg'), feature: 'holes' }]);
  });

  it('a trial the recipe skips rules nothing out (the caller\'s ruling)', () => {
    // An end-grain mortise already in the rail's joined end, reaching no other face: every growing kind is skipped
    // (cutIntoEnd), so the dowel hole beside it is never grown into.
    const doc = withHoles(LEG_RAIL(), { Rail: (b) => [holeAt(b, 0, -1, [0, 26.5, 0.875], 0.25, 1)] });
    const rail = named(doc, 'Rail');
    rail.cuts = [{ id: 'm', face: 'length', from: endFacing(rail, 0, -1), across: 'width', offset: 0.25, width: 0.25, depth: 0.5, stopMin: 1, stopMax: 1 }];
    const sites = findSites(doc);
    const joined = applyJoints(doc, sites, [{ site: 1, joint: 'dado', depth: 0.5 }]);
    expect(joined.skipped.map((s) => s.site)).toEqual([1]);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual([]);
    expect(out.sites).toBe(sites);
  });

  it('a hole \'through\' along a rail\'s length rules out its growing kinds', () => {
    // In the shoulder, clear of the tenon's section: 'through' takes no exception (spec §3.4).
    const doc = withHoles(LEG_RAIL(), { Rail: (b) => [holeAt(b, 0, -1, [0, 23.75, 0.875], 0.25, 'through')] });
    const out = featureAllowed(doc, findSites(doc));
    expect(out.sites[0].allowed).toEqual(['butt']);
    expect(out.ruledOut.map((r) => [r.kind, r.part])).toEqual([['mortise-tenon', 1], ['dado', 1]]);
  });
});

describe('the growing end under a turn that reverses the axis (Review Focus #2)', () => {
  /** A rail turned so its board-local MIN end faces +X, entering a leg at that end. */
  const turned = (rows: (b: Board) => HoleRow[]) => {
    const rail = createBoard({ name: 'Rail', length: 18, width: 3.5, thickness: 0.75, posture: 'flat', rotation: 180 });
    const leg = createBoard({ name: 'Leg', length: 28, width: 1.75, thickness: 5, posture: 'upright' });
    rail.position = [0, 23.5, 0.5];
    leg.position = [boardExtents(rail)[0], 0, 0];
    // Flat: the rail lies 3/4 high (y [23.5, 24.25]) and 3.5 deep (z [0.5, 4]), inside the leg's 5in face.
    expect(boardExtents(rail)).toEqual([18, 0.75, 3.5]);
    expect(boardExtents(leg)).toEqual([1.75, 28, 5]);
    rail.holes = rows(rail);
    const base = flatDocument(designToDocument({ name: 'T', parts: [{ name: 'P', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }] }).doc);
    return { ...base, boards: [leg, rail] } as FlatDocument;
  };
  it('the precondition: the rail grows at its board-local min end', () => {
    const doc = turned(() => []);
    const rail = named(doc, 'Rail');
    expect(axisFrame(rail)[0].dim).toBe('length');
    expect(axisFrame(rail)[0].reversed).toBe(true);
    const site = findSites(doc)[0];
    expect([doc.boards[site.enter].name, site.side]).toEqual(['Rail', 1]);
    expect(endFacing(rail, 0, site.side)).toBe('min');
  });
  it('holes drilled into the growing end rule out every growing kind', () => {
    const doc = turned((b) => [holeAt(b, 0, 1, [0, 23.875, 2.25], 0.25, 1)]);
    const out = featureAllowed(doc, findSites(doc));
    expect(out.sites[0].allowed).toEqual(['butt']);
    expect(out.ruledOut.map((r) => [r.kind, r.part])).toEqual([['mortise-tenon', 1], ['dado', 1]]);
  });
  it('holes drilled into the far end rule nothing out', () => {
    const doc = turned((b) => [holeAt(b, 0, -1, [0, 23.875, 2.25], 0.25, 1)]);
    const sites = findSites(doc);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual([]);
    expect(out.sites[0]).toBe(sites[0]);
  });
});

describe('Review Focus', () => {
  it('a rabbeted back with a hole clear of every rabbet keeps rabbet', () => {
    // The back moves into its frame and is trimmed back to each rabbet line: at the smallest rabbet (1/8) it loses
    // 5/8 at each side end. Holes centred 3/4 in from each end touch that slab, stored from either end so that a hole
    // judged against the back as it stood before its first trim would read as inside the second. The Left's hole
    // touches its rabbet's z span (z 11) from below.
    const doc = withHoles(BOOKCASE(), {
      Back: (b) => [0.75, 20.75].flatMap((x, i) => (['min', 'max'] as const).map((from) => holeAt(b, 2, 1, [x, 20, 0], 0.25, 'through', `b${i}${from}`, from))),
      Left: (b) => [holeAt(b, 0, 1, [0, 15, 10.875], 0.25, 0.5)],
    });
    const sites = findSites(doc);
    const rabbets = sites.filter((s) => s.kind === 'face-against-edge');
    expect(rabbets.map((s) => doc.boards[s.receive].name)).toEqual(['Left', 'Right']);
    const out = featureAllowed(doc, sites);
    expect(out.ruledOut).toEqual([]);
    for (const s of rabbets) expect(out.sites[sites.indexOf(s)].allowed).toContain('rabbet');
  });

  it('rabbet goes as a unit', () => {
    const plain = design(
      { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Top', at: [0, 30, 0], size: [21.5, 0.75, 11.25] },
      { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30.75, 0.25] },
    );
    // In the top's rabbet at the largest depth (y [30, 30.375], z [11, 11.25]), from its back edge; nothing else holed.
    const doc = withHoles(plain, { Top: (b) => [holeAt(b, 2, 1, [10, 30.25, 0], 0.125, 0.125)] });
    const sites = findSites(doc);
    const rabbets = sites.filter((s) => s.kind === 'face-against-edge');
    expect(rabbets.map((s) => doc.boards[s.receive].name).sort()).toEqual(['Left', 'Right', 'Top']);
    const out = featureAllowed(doc, sites);
    const top = indexOf(doc, 'Top');
    for (const s of rabbets) expect(out.sites[sites.indexOf(s)].allowed).toEqual(['butt']);
    expect(out.ruledOut).toEqual(rabbets.map((s) => ({ site: s.id, kind: 'rabbet', part: top, feature: 'holes' })));
    // The top's own end-into-face sites are untouched.
    sites.filter((s) => s.kind !== 'face-against-edge').forEach((s) => expect(out.sites[sites.indexOf(s)]).toBe(s));
  });

  it('a hole in a part the rabbet would trim rules rabbet out at the trimming site', () => {
    // The shelf butts the back mid-panel and is trimmed 1/4 off its back edge (z [11, 11.25]) when the back moves in.
    const doc = withHoles(BOOKCASE(), { Shelf: (b) => [holeAt(b, 1, 1, [10, 0, 11.125], 0.125, 0.25)] });
    const sites = findSites(doc);
    const out = featureAllowed(doc, sites);
    const shelf = indexOf(doc, 'Shelf');
    const rabbets = sites.filter((s) => s.kind === 'face-against-edge');
    expect(rabbets).toHaveLength(2);
    expect(out.ruledOut).toEqual(rabbets.map((s) => ({ site: s.id, kind: 'rabbet', part: shelf, feature: 'holes' })));
    // The shelf's own sites keep every kind.
    const own = sites.filter((s) => s.enter === shelf);
    expect(own).toHaveLength(2);
    for (const s of own) expect(out.sites[sites.indexOf(s)]).toBe(s);
  });

  describe('half-lap: a hole in the notch rules half-lap out', () => {
    // Upper drops into Lower's plane (y [5, 5.75]); Upper's notch is its lower half, Lower's its upper half.
    const ruled = (rows: Record<string, (b: Board) => HoleRow[]>) => {
      const doc = withHoles(LAP(), rows);
      const sites = findSites(doc);
      expect(sites.map((s) => s.allowed)).toEqual([['half-lap', 'butt']]);
      return featureAllowed(doc, sites).ruledOut.map((r) => [r.kind, doc.boards[r.part].name]);
    };
    it('in the receiver\'s notch, from its top face', () => {
      expect(ruled({ Lower: (b) => [holeAt(b, 1, 1, [10, 0, 10], 0.25, 0.25)] })).toEqual([['half-lap', 'Lower']]);
    });
    it('in the moving part\'s notch, from its bottom face: judged in its own frame', () => {
      expect(ruled({ Upper: (b) => [holeAt(b, 1, -1, [10, 0, 10], 0.25, 0.25)] })).toEqual([['half-lap', 'Upper']]);
    });
    it('the moving part\'s top half is kept wood: a hole from its top face rules nothing out', () => {
      expect(ruled({ Upper: (b) => [holeAt(b, 1, 1, [10, 0, 10], 0.25, 0.25)] })).toEqual([]);
    });
  });

  describe('half-laps go as a unit: a part lapping several partners', () => {
    // UpA and UpB each drop into LowA and LowB (y [5, 5.75]); alone, either lap's drop would meet the other partner and
    // skip, so a part's laps on one axis are trialled together, as the real run joins them.
    const GRID = () => design(
      { name: 'LowA', at: [0, 5, 0], size: [20, 0.75, 2] },
      { name: 'LowB', at: [0, 5, 10], size: [20, 0.75, 2] },
      { name: 'UpA', at: [2, 5.75, -4], size: [2, 0.75, 20] },
      { name: 'UpB', at: [12, 5.75, -4], size: [2, 0.75, 20] },
    );
    const laps = (doc: FlatDocument, sites: readonly Site[]) => sites.map((s) => `${doc.boards[s.enter].name}>${doc.boards[s.receive].name}`);

    it('the precondition: four crossings, and a lone lap\'s trial skips', () => {
      const doc = GRID();
      const sites = findSites(doc);
      expect(laps(doc, sites).sort()).toEqual(['UpA>LowA', 'UpA>LowB', 'UpB>LowA', 'UpB>LowB']);
      expect(sites.map((s) => s.allowed)).toEqual(sites.map(() => ['half-lap', 'butt']));
      const lone = siteOf(doc, sites, 'UpA', 'LowA');
      expect(applyJoints(doc, sites, [{ site: lone.id, joint: 'half-lap' }]).skipped.map((k) => k.site)).toEqual([lone.id]);
    });

    it('a hole in one crossing\'s notch rules half-lap out at every member of that part\'s unit', () => {
      // From LowA's top face, inside the notch UpA cuts into LowA (x [2, 4], z [0, 2], LowA's upper half).
      const doc = withHoles(GRID(), { LowA: (b) => [holeAt(b, 1, 1, [3, 0, 1], 0.25, 0.25)] });
      const sites = findSites(doc);
      const out = featureAllowed(doc, sites);
      const lowA = indexOf(doc, 'LowA');
      const unit = [siteOf(doc, sites, 'UpA', 'LowA'), siteOf(doc, sites, 'UpA', 'LowB')].sort((a, b) => a.id - b.id);
      expect(out.ruledOut).toEqual(unit.map((s) => ({ site: s.id, kind: 'half-lap', part: lowA, feature: 'holes' })));
      for (const s of unit) expect(out.sites[sites.indexOf(s)].allowed).toEqual(['butt']);
      // UpB's crossings are clear of the hole: kept, same objects.
      for (const s of [siteOf(doc, sites, 'UpB', 'LowA'), siteOf(doc, sites, 'UpB', 'LowB')]) expect(out.sites[sites.indexOf(s)]).toBe(s);
    });

    it('holes clear of every notch keep half-lap everywhere', () => {
      const doc = withHoles(GRID(), {
        LowA: (b) => [holeAt(b, 1, 1, [8, 0, 1], 0.25, 0.25)],
        UpA: (b) => [holeAt(b, 1, -1, [3, 0, 6], 0.25, 0.25)],
      });
      const sites = findSites(doc);
      // The unit trial is not vacuous: all four laps apply together.
      expect(applyJoints(doc, sites, sites.map((s) => ({ site: s.id, joint: 'half-lap' as const }))).skipped).toEqual([]);
      const out = featureAllowed(doc, sites);
      expect(out.sites).toBe(sites);
      expect(out.ruledOut).toEqual([]);
    });
  });

  it('twin placements are judged per placement', () => {
    // One side panel placed twice; a shelf enters the left copy at y 12 and another the right copy at y 20. A through
    // hole on the definition's side at y 12.375 lies under the left copy's site only.
    const tree = designToDocument({
      name: 'Twins',
      parts: [
        { name: 'Low', role: '', material: 'oak', at: { x: 0.75, y: 12, z: 0 }, size: { x: 15, y: 0.75, z: 11.25 } },
        { name: 'High', role: '', material: 'oak', at: { x: 25, y: 20, z: 0 }, size: { x: 15, y: 0.75, z: 11.25 } },
      ],
      assemblies: [{
        name: 'Case',
        parts: [{ name: 'Side', role: '', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 0.75, y: 30, z: 11.25 } }],
        placements: [{ name: 'L', at: { x: 0, y: 0, z: 0 }, }, { name: 'R', at: { x: 40, y: 0, z: 0 } }],
      }],
    } as never, { centre: false }).doc;
    const plainFlat = flatDocument(tree);
    const sideL = plainFlat.boards.find((b) => b.name.endsWith('Side'))!;
    const row = holeAt(sideL, 0, 1, [0, 12.375, 5], 0.25, 'through');
    const holed: SloydDocument = migrateDocument({
      ...tree, definitions: tree.definitions.map((d) => ({ ...d, boards: d.boards.map((b) => ({ ...b, holes: [row] })) })),
    });
    const doc = flatDocument(holed);
    const sides = doc.boards.map((b, i) => [b, i] as const).filter(([b]) => b.name.endsWith('Side'));
    expect(sides).toHaveLength(2);
    for (const [b] of sides) expect(b.holes).toHaveLength(1);
    const sites = findSites(doc);
    const low = siteOf(doc, sites, 'Low', sides[0][0].name);
    const high = siteOf(doc, sites, 'High', sides[1][0].name);
    expect(low.allowed).toEqual(high.allowed);
    expect(low.allowed).toContain('mortise-tenon');
    const out = featureAllowed(doc, sites);
    expect(out.sites[sites.indexOf(high)]).toBe(high);
    expect(out.sites[sites.indexOf(low)].allowed).toEqual(['butt']);
    expect(out.ruledOut.every((r) => r.site === low.id && r.part === sides[0][1])).toBe(true);
    expect(out.ruledOut.map((r) => r.kind)).toEqual(low.allowed.filter((k) => k !== 'butt'));
  });
});

describe('with no holes, the same sites array comes back', () => {
  const shaker = () => flatDocument(designToDocument(SHAKER_TABLE_JSON as never, { centre: false }).doc);
  const workbench = () => flatDocument(migrateDocument(JSON.parse(workbenchRaw)));
  it.each([
    ['leg and rail', LEG_RAIL], ['side and shelf', () => SIDE_SHELF()], ['bookcase with a rabbeted back', BOOKCASE],
    ['half-lap', LAP], ['shaker table', shaker], ['simple workbench', workbench],
  ] as const)('%s', (_n, make) => {
    const doc = make();
    expect(doc.boards.every((b) => b.holes.length === 0)).toBe(true);
    const sites = findSites(doc);
    expect(sites.length).toBeGreaterThan(0);
    const out = featureAllowed(doc, sites);
    expect(out.sites).toBe(sites);
    expect(out.ruledOut).toEqual([]);
  });
});
