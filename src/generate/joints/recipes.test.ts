import { worldParts } from '../../document/tree';
import { beforeAll } from 'vitest';
import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { designToDocument } from '../../document/generated';
import { flatDocument, groupItems, migrateDocument, writeBackFlat } from '../../document/document';
import { checkDesign, worldSolids } from '../../document/designCheck';
import { rotateQuarter, sameSet } from '../../document/turnFixtures';
import { boardSolids, clippedRegion, cutLabel, cutRegion, cutsThatRemoveStock } from '../../document/cuts';
import { buildCutList } from '../../document/cutlist';
import { axisDimensions, boardExtents, spanToWorldOffset } from '../../document/geometry';
import type { Board, Cut, FlatDocument, SloydDocument } from '../../document/document';
import { findSites } from './sites';
import { defaultChoice } from './choose';
import { applyJoints, refaceFromEnd, tenonSection } from './recipes';
import { boxOf, pocketFor } from './pocket';
import type { Site } from './sites';

type P = { name: string; at: [number, number, number]; size: [number, number, number]; material?: string };
const design = (...parts: P[]) => flatDocument(designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: p.material ?? 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc);
const limits = (doc: FlatDocument) => ({ width: null, depth: null, height: null, maxParts: doc.boards.length });
const board = (doc: FlatDocument, name: string) => worldParts(doc).find((b) => b.name === name)!;
const volume = (doc: FlatDocument, name: string) => boardSolids(board(doc, name)).reduce(
  (v, s) => v + (s.length[1] - s.length[0]) * (s.width[1] - s.width[0]) * (s.thickness[1] - s.thickness[0]), 0);
const boxVolume = (doc: FlatDocument, name: string) => { const b = board(doc, name); return b.length * b.width * b.thickness; };

const LEG_RAIL = () => design(
  { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
);

describe('tenonSection', () => {
  it('a third of the thickness, at least 1/4in; shoulders 1/2in or a quarter of the width', () => {
    expect(tenonSection(0.75, 3.5)).toEqual({ tenon: 0.25, cheek: 0.25, shoulder: 0.5 });
    expect(tenonSection(1.75, 1.5)).toEqual({ tenon: 0.5625, cheek: 0.59375, shoulder: 0.375 });
  });
});

describe('mortise and tenon', () => {
  const doc = LEG_RAIL();
  const sites = findSites(doc);
  let out: ReturnType<typeof applyJoints>;
  beforeAll(() => { out = applyJoints(doc, sites, [{ site: 1, joint: 'mortise-tenon', tenonLength: 1 }]); });

  it('grows the rail by the tenon and keeps names and part count', () => {
    expect(worldParts(out.doc).map((b) => b.name)).toEqual(['Leg', 'Rail']);
    expect(board(out.doc, 'Rail').length).toBe(19);
  });

  it('leaves no overlap between solids', () => {
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
  });

  it('conserves stock: the leg loses exactly the tenon the rail gains', () => {
    const tenon = 1 * 0.25 * (3.5 - 2 * 0.5);
    expect(boxVolume(out.doc, 'Leg') - volume(out.doc, 'Leg')).toBeCloseTo(tenon, 9);
    expect(volume(out.doc, 'Rail') - 18 * 3.5 * 0.75).toBeCloseTo(tenon, 9);
  });

  it('labels the leg\'s cut a mortise and the rail\'s four cuts: two face rabbets, two shoulder notches', () => {
    const leg = board(out.doc, 'Leg');
    expect(leg.cuts.map((c) => cutLabel(leg, c))).toEqual(['mortise']);
    const rail = board(out.doc, 'Rail');
    // Cut-words spec §2.5: the two width-side shoulders are full-thickness corner cuts
    // (length [0,1] x width [0,1/2] or [3,3.5] x thickness [0,3/4]) — notches, no longer rabbets.
    expect(rail.cuts.map((c) => cutLabel(rail, c)).sort()).toEqual(['notch', 'notch', 'rabbet', 'rabbet']);
  });

  it('reports the joint applied', () => {
    expect(out.applied).toEqual([{ site: 1, joint: 'mortise-tenon' }]);
  });
});

describe('dado and stopped dado', () => {
  const doc = design(
    { name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
  );
  const sites = findSites(doc);

  it('a dado: the shelf grows by d and the side is housed, no overlap', () => {
    const out = applyJoints(doc, sites, [{ site: 1, joint: 'dado', depth: 0.25 }]);
    expect(board(out.doc, 'Shelf').length).toBe(20.25);
    const side = board(out.doc, 'Side');
    expect(side.cuts.map((c) => cutLabel(side, c))).toEqual(['dado']);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
  });

  it('a stopped dado: the side\'s dado stops, the shelf is notched to match, no overlap', () => {
    const out = applyJoints(doc, sites, [{ site: 1, joint: 'stopped-dado', depth: 0.25, stopAt: sites[0].stopEnds[1], inset: 0.75 }]);
    const side = board(out.doc, 'Side');
    expect(side.cuts.map((c) => cutLabel(side, c))).toEqual(['stopped dado']);
    expect(board(out.doc, 'Shelf').cuts).toHaveLength(1);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
    expect(boxVolume(out.doc, 'Side') - volume(out.doc, 'Side')).toBeCloseTo(0.25 * 0.75 * (11.25 - 0.75), 9);
  });

  it('a full-length groove on the growing shelf keeps running through, whichever way it is stored (fu 199)', () => {
    // The shelf's length runs along world X (size 20 x 0.75 x 11.25 at x 0.75) and the dado grows it at the
    // length's MIN end (the Side is at x < 0.75).
    const withGroove = (groove: Cut) => {
      const d = structuredClone(doc);
      board(d, 'Shelf').cuts = [groove];
      return applyJoints(d, findSites(d), [{ site: 1, joint: 'dado', depth: 0.25 }]).doc;
    };
    const base = { id: 'g', face: 'thickness' as const, from: 'max' as const, depth: 0.25 };
    // A groove along the whole length, 1/2" wide, 5" in from the width's min edge.
    const along: Cut = { ...base, across: 'length', offset: 5, width: 0.5, stopMin: 0, stopMax: 0 };
    const sideways: Cut = { ...base, across: 'width', offset: 0, width: 20, stopMin: 5, stopMax: 5.75 };
    const regionOf = (out: FlatDocument) => { const s = board(out, 'Shelf'); return cutRegion(s, s.cuts[0]); };
    const a = regionOf(withGroove(along));
    const b2 = regionOf(withGroove(sideways));
    expect(b2).toEqual(a);
    expect(a.length).toEqual([0, 20.25]);
  });

  it('a rabbet positioned at the growing end stays there, whichever way it is stored (fu 199)', () => {
    // Same shelf; the rabbet is the length's first 3/4in, full width, 1/4in deep from the top face. It is
    // POSITIONED at the end the dado grows, so it keeps its place relative to the old end: [0.25, 1.0].
    const withRabbet = (rabbet: Cut) => {
      const d = structuredClone(doc);
      board(d, 'Shelf').cuts = [rabbet];
      return applyJoints(d, findSites(d), [{ site: 1, joint: 'dado', depth: 0.25 }]).doc;
    };
    const base = { id: 'r', face: 'thickness' as const, from: 'max' as const, depth: 0.25 };
    const positioned: Cut = { ...base, across: 'width', offset: 0, width: 0.75, stopMin: 0, stopMax: 0 };
    const alongD: Cut = { ...base, across: 'length', offset: 0, width: 11.25, stopMin: 0, stopMax: 19.25 };
    const regionOf = (out: FlatDocument) => { const s = board(out, 'Shelf'); return cutRegion(s, s.cuts[0]); };
    const a = regionOf(withRabbet(positioned));
    const b2 = regionOf(withRabbet(alongD));
    expect(b2).toEqual(a);
    expect(a.length).toEqual([0.25, 1.0]);
  });

  it('butt leaves the site alone', () => {
    const out = applyJoints(doc, sites, [{ site: 1, joint: 'butt' }]);
    expect(worldParts(out.doc).every((b) => b.cuts.length === 0)).toBe(true);
    expect(out.applied).toEqual([{ site: 1, joint: 'butt' }]);
  });
});

describe('two tenons into one corner leg collide, and shorter ones do not', () => {
  const doc = design(
    { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
    { name: 'Rail X', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
    { name: 'Rail Z', at: [0.5, 23.5, 1.75], size: [0.75, 3.5, 18] },
  );
  const sites = findSites(doc);
  const both = (L: number) => applyJoints(doc, sites, sites.map((s) => ({ site: s.id, joint: 'mortise-tenon' as const, tenonLength: L })));
  const overlaps = (L: number) => checkDesign(both(L).doc, limits(doc)).filter((v) => v.kind === 'overlap');

  it('at 1-3/16in the tenons meet inside the leg', () => {
    expect(overlaps(1.1875).map((v) => [...v.parts].sort())).toEqual([['Rail X', 'Rail Z']]);
  });

  it('at 1/2in they clear', () => {
    expect(overlaps(0.5)).toEqual([]);
  });
});

describe('a site whose parts no longer meet', () => {
  it('lands in skipped, and nothing is cut', () => {
    const doc = LEG_RAIL();
    const sites = findSites(doc);
    const moved = structuredClone(doc);
    board(moved, 'Rail').position[0] += 10;
    const out = applyJoints(moved, sites, [{ site: 1, joint: 'mortise-tenon', tenonLength: 1 }]);
    expect(out.applied).toEqual([]);
    expect(out.skipped.map((s) => s.site)).toEqual([1]);
    expect(worldParts(out.doc).every((b) => b.cuts.length === 0)).toBe(true);
  });
});

describe('entering from the MAX face', () => {
  it('mortise and tenon: rail left of the leg, no overlap, stock conserved', () => {
    const doc = design(
      { name: 'Rail', at: [0, 23.5, 0.5], size: [18, 3.5, 0.75] },
      { name: 'Leg', at: [18, 0, 0], size: [1.75, 28, 1.75] },
    );
    const sites = findSites(doc);
    const site = sites.find((x) => worldParts(doc)[x.enter].name === 'Rail')!;
    expect(site.side).toBe(1);
    const out = applyJoints(doc, sites, [{ site: site.id, joint: 'mortise-tenon', tenonLength: 1 }]);
    expect(board(out.doc, 'Rail').length).toBe(19);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
    const tenon = 1 * 0.25 * (3.5 - 2 * 0.5);
    expect(boxVolume(out.doc, 'Leg') - volume(out.doc, 'Leg')).toBeCloseTo(tenon, 9);
    expect(volume(out.doc, 'Rail') - 18 * 3.5 * 0.75).toBeCloseTo(tenon, 9);
  });

  it('stopped dado: shelf left of the side, no overlap, side loses the stopped groove', () => {
    const doc = design(
      { name: 'Shelf', at: [0, 12, 0], size: [20, 0.75, 11.25] },
      { name: 'Side', at: [20, 0, 0], size: [0.75, 30, 11.25] },
    );
    const sites = findSites(doc);
    const site = sites.find((x) => worldParts(doc)[x.enter].name === 'Shelf')!;
    expect(site.side).toBe(1);
    const out = applyJoints(doc, sites, [{ site: site.id, joint: 'stopped-dado', depth: 0.25, stopAt: site.stopEnds[1], inset: 0.75 }]);
    expect(board(out.doc, 'Shelf').length).toBe(20.25);
    expect(board(out.doc, 'Shelf').cuts).toHaveLength(1);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
    expect(boxVolume(out.doc, 'Side') - volume(out.doc, 'Side')).toBeCloseTo(0.25 * 0.75 * (11.25 - 0.75), 9);
  });
});

describe('purity', () => {
  it('never mutates its input', () => {
    const doc = LEG_RAIL();
    const before = JSON.stringify(doc);
    applyJoints(doc, findSites(doc), [{ site: 1, joint: 'mortise-tenon', tenonLength: 1 }]);
    expect(JSON.stringify(doc)).toBe(before);
  });
});

const rabbetPick = (depth: number) => (s: { id: number; kind: string }) => s.kind === 'face-against-edge'
  ? { site: s.id, joint: 'rabbet' as const, depth }
  : { site: s.id, joint: 'butt' as const };

describe('rabbet: the back panel moves into rabbets, and is trimmed back to the rabbet line', () => {
  const doc = design(
    { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
    { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
  );
  let sites: ReturnType<typeof findSites>;
  let out: ReturnType<typeof applyJoints>;
  beforeAll(() => {
    sites = findSites(doc);
    out = applyJoints(doc, sites, sites.map(rabbetPick(0.375)));
  });
  const z = (name: string) => { const b = board(out.doc, name); const o = board(doc, name); return [b.position[2] - o.position[2]]; };

  it('finds two rabbet sites, one per side', () => {
    expect(sites.filter((s) => s.kind === 'face-against-edge')).toHaveLength(2);
  });

  it('moves the back ONCE, by its own thickness, toward the sides', () => {
    expect(z('Back')).toEqual([-0.25]);
    expect(out.moved).toEqual(['Back']);
  });

  it('trims the back to the rabbet lines: inner width plus two rabbet depths', () => {
    // Between the sides is 20in; each rabbet reaches 3/8in into a side.
    expect(board(out.doc, 'Back').width).toBe(20.75);
  });

  it('trims the shelf that butted the back by the back\'s thickness', () => {
    expect(board(out.doc, 'Shelf').width).toBe(11);
    expect([...out.trimmed].sort()).toEqual(['Back', 'Shelf']);
  });

  it('rabbets each side, no overlap anywhere, and reports the piece 1/4in shallower', () => {
    for (const name of ['Left', 'Right']) {
      const b = board(out.doc, name);
      expect(b.cuts.map((c) => cutLabel(b, c))).toEqual(['rabbet']);
    }
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
    expect(out.sizeBefore[2] - out.sizeAfter[2]).toBe(0.25);
  });

  it('puts each rabbet 3/8in in from its side\'s INNER face, 1/4in from the back edge', () => {
    // Left's inner face is its max-X face; Right's is its min-X face. Both
    // sides sit at turn 90, which reverses Z (their width), so the back edge
    // at world Z max is the width MIN end: the rabbet enters from 'min'.
    const l = board(out.doc, 'Left').cuts[0];
    expect([l.from, l.offset, l.width, l.depth]).toEqual(['min', 0.375, 0.375, 0.25]);
    const r = board(out.doc, 'Right').cuts[0];
    expect([r.from, r.offset, r.width, r.depth]).toEqual(['min', 0, 0.375, 0.25]);
  });
});

describe('rabbet: a centre partition is not a rabbet site', () => {
  const doc = design(
    { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Partition', at: [10.375, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
  );
  let sites: ReturnType<typeof findSites>;
  let out: ReturnType<typeof applyJoints>;
  beforeAll(() => {
    sites = findSites(doc);
    out = applyJoints(doc, sites, sites.map(rabbetPick(0.375)));
  });

  it('gives exactly Left and Right', () => {
    const fae = sites.filter((s) => s.kind === 'face-against-edge');
    expect(fae.map((s) => worldParts(doc)[s.receive].name).sort()).toEqual(['Left', 'Right']);
  });

  it('keeps the back full width, trims the partition, no overlap', () => {
    expect(board(out.doc, 'Back').width).toBe(20.75);
    expect(board(out.doc, 'Partition').width).toBe(11);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
  });
});

describe('rabbet: the piece stays on the floor', () => {
  // A drawer: the bottom panel sits in the frame's rabbets and rises 1/4in.
  const doc = design(
    { name: 'SideL', at: [0, 0.25, 0], size: [0.5, 4, 12] },
    { name: 'SideR', at: [9.5, 0.25, 0], size: [0.5, 4, 12] },
    { name: 'Front', at: [0.5, 0.25, 0], size: [9, 4, 0.5] },
    { name: 'BackP', at: [0.5, 0.25, 11.5], size: [9, 4, 0.5] },
    { name: 'Bottom', at: [0, 0, 0], size: [10, 0.25, 12] },
  );
  let out: ReturnType<typeof applyJoints>;
  beforeAll(() => {
    const sites = findSites(doc);
    out = applyJoints(doc, sites, sites.map((s) => s.kind === 'face-against-edge'
      ? { site: s.id, joint: 'rabbet' as const, depth: 0.25 } : { site: s.id, joint: 'butt' as const }));
  });

  it('lowers everything back to y = 0 and reports nothing unsupported', () => {
    expect(Math.min(...worldParts(out.doc).map((b) => b.position[1]))).toBeCloseTo(0, 9);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'unsupported')).toEqual([]);
  });

  it('reports the drop: the Bottom rose by 1/4in and everything came down by it', () => {
    expect(out.lowered).toBe(0.25);
    expect(board(out.doc, 'SideL').position[1]).toBeCloseTo(0, 9);
  });

  it('every pocket is completely filled, in either listing order (fu 182)', () => {
    for (const d of [doc, flatDocument(migrateDocument({ ...doc, boards: [...doc.boards].reverse() }))]) {
      const sites = findSites(d);
      const o = applyJoints(d, sites, sites.map((s) => s.kind === 'face-against-edge'
        ? { site: s.id, joint: 'rabbet' as const, depth: 0.25 } : { site: s.id, joint: 'butt' as const }));
      expect(o.skipped).toEqual([]);
      expect(voids(o.doc)).toEqual([]);
    }
  });

  it('reports 0 when nothing was re-grounded', () => {
    const none = applyJoints(doc, findSites(doc), findSites(doc).map((s) => ({ site: s.id, joint: 'butt' as const })));
    expect(none.lowered).toBe(0);
  });
});

describe('half-lap', () => {
  const doc = design(
    { name: 'Lower', at: [0, 5, 9], size: [20, 0.75, 2] },
    { name: 'Upper', at: [9, 5.75, 0], size: [2, 0.75, 20] },
  );
  let out: ReturnType<typeof applyJoints>;
  beforeAll(() => { out = applyJoints(doc, findSites(doc), [{ site: 1, joint: 'half-lap' }]); });

  it('drops the upper part into the lower one\'s plane, notches both by half, no overlap', () => {
    expect(board(out.doc, 'Upper').position[1]).toBe(board(out.doc, 'Lower').position[1]);
    expect(board(out.doc, 'Upper').cuts).toHaveLength(1);
    expect(board(out.doc, 'Lower').cuts).toHaveLength(1);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
    const notch = 2 * 2 * 0.375;
    expect(boxVolume(out.doc, 'Lower') - volume(out.doc, 'Lower')).toBeCloseTo(notch, 9);
    expect(boxVolume(out.doc, 'Upper') - volume(out.doc, 'Upper')).toBeCloseTo(notch, 9);
    expect(out.moved).toEqual(['Upper']);
  });
});

describe('half-lap: a stretcher grid', () => {
  const doc = design(
    { name: 'LowA', at: [0, 5, 0], size: [20, 0.75, 2] },
    { name: 'LowB', at: [0, 5, 10], size: [20, 0.75, 2] },
    { name: 'UpA', at: [2, 5.75, -4], size: [2, 0.75, 20] },
    { name: 'UpB', at: [12, 5.75, -4], size: [2, 0.75, 20] },
  );
  let sites: ReturnType<typeof findSites>;
  let out: ReturnType<typeof applyJoints>;
  beforeAll(() => {
    sites = findSites(doc);
    out = applyJoints(doc, sites, sites.map((s) => ({ site: s.id, joint: 'half-lap' as const })));
  });

  it('notches all four crossings, moves each upper part once, no overlap', () => {
    expect(sites.filter((s) => s.kind === 'crossing')).toHaveLength(4);
    expect(out.skipped).toEqual([]);
    expect(out.applied).toHaveLength(4);
    for (const n of ['LowA', 'LowB', 'UpA', 'UpB']) expect(board(out.doc, n).cuts).toHaveLength(2);
    for (const n of ['UpA', 'UpB']) expect(board(out.doc, n).position[1] - board(doc, n).position[1]).toBeCloseTo(-0.75, 9);
    expect([...out.moved].sort()).toEqual(['UpA', 'UpB']);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
  });
});

describe('half-lap: a drop that would hit something else is skipped', () => {
  const doc = design(
    { name: 'Lower', at: [0, 5, 9], size: [20, 0.75, 2] },
    { name: 'Upper', at: [9, 5.75, 0], size: [2, 0.75, 20] },
    { name: 'Block', at: [9, 5, 0], size: [2, 0.75, 2] },
  );
  let out: ReturnType<typeof applyJoints>;
  beforeAll(() => {
    const sites = findSites(doc);
    out = applyJoints(doc, sites, sites.filter((s) => s.kind === 'crossing').map((s) => ({ site: s.id, joint: 'half-lap' as const })));
  });

  it('skips the site with the reason, and nothing moves or overlaps', () => {
    expect(out.skipped.map((s) => s.reason)).toEqual(['moving Upper would drive it into Block']);
    expect(out.moved).toEqual([]);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
  });
});

describe('half-lap: partners in different planes skip every site', () => {
  // Lower B is 0.03in thinner (equal-thickness tolerance) and stands 0.03in
  // proud, so it touches Upper but does not share Upper's plane once dropped.
  const doc = design(
    { name: 'LowA', at: [0, 5, 0], size: [20, 0.75, 2] },
    { name: 'LowB', at: [0, 5, 10], size: [20, 0.75, 2] },
    { name: 'Upper', at: [2, 5.75, -4], size: [2, 0.75, 20] },
  );
  worldParts(doc).find((b) => b.name === 'LowB')!.thickness = 0.72;
  worldParts(doc).find((b) => b.name === 'LowB')!.position[1] = board(doc, 'LowA').position[1] + 0.06;
  let sites: ReturnType<typeof findSites>;
  let out: ReturnType<typeof applyJoints>;
  beforeAll(() => {
    sites = findSites(doc);
    out = applyJoints(doc, sites, sites.map((s) => ({ site: s.id, joint: 'half-lap' as const })));
  });

  it('skips both sites with the reason, moves and notches nothing, no overlap', () => {
    expect(sites.filter((s) => s.kind === 'crossing')).toHaveLength(2);
    expect(out.applied).toHaveLength(0);
    expect(out.skipped.map((s) => s.reason)).toEqual(Array(2).fill("Upper's half-lap partners do not lie in one plane"));
    expect(out.moved).toEqual([]);
    expect(board(out.doc, 'Upper').position[1]).toBe(board(doc, 'Upper').position[1]);
    for (const n of ['LowA', 'LowB', 'Upper']) expect(board(out.doc, n).cuts).toHaveLength(0);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
  });
});

describe('half-lap: off-grid thickness and gap align E onto R', () => {
  // Rule 4 allows a thickness difference, and contact a gap, of up to TOUCH.
  const cases: [string, number, number][] = [['thinner, 0.02 gap', 0.73, 0.02], ['thicker, 0.02 overlap', 0.77, -0.02]];
  for (const [label, thickness, gap] of cases) {
    it(`laps Upper (${label}) into Lower's plane, no overlap, nothing skipped`, () => {
      const doc = design(
        { name: 'Lower', at: [0, 5, 9], size: [20, 0.75, 2] },
        { name: 'Upper', at: [9, 5.75, 0], size: [2, 0.75, 20] },
      );
      const lo = board(doc, 'Lower');
      const up = board(doc, 'Upper');
      up.thickness = thickness;
      up.position[1] = lo.position[1] + lo.thickness + gap;
      const out = applyJoints(doc, findSites(doc), [{ site: 1, joint: 'half-lap' }]);
      expect(out.skipped).toEqual([]);
      expect(out.applied).toHaveLength(1);
      expect(board(out.doc, 'Upper').position[1]).toBeCloseTo(board(out.doc, 'Lower').position[1], 9);
      expect(board(out.doc, 'Upper').cuts).toHaveLength(1);
      expect(board(out.doc, 'Lower').cuts).toHaveLength(1);
      expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'overlap')).toEqual([]);
    });
  }
});

// Final review C1 (spec §4.7): a part's existing cuts move with it, and the
// recipes that MOVE parts run first. Every case here was red before the fix.
const overlapsOf = (d: FlatDocument) => checkDesign(d, limits(d)).filter((v) => v.kind === 'overlap').map((v) => v.message);
const withDefaults = (d: FlatDocument) => {
  const sites = findSites(d);
  return applyJoints(d, sites, sites.map((s) => defaultChoice(s, d, sites)));
};

// Follow-up 185: a stack of laps runs bottom-up, so every part is in its
// final plane before anything drops onto it and each part moves once.
const orders = <T,>(xs: T[]): T[][] => xs.length <= 1 ? [xs] : xs.flatMap((x, i) => orders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));
const allLaps = (d: FlatDocument) => {
  const sites = findSites(d);
  return { sites, out: applyJoints(d, sites, sites.map((s) => ({ site: s.id, joint: 'half-lap' as const }))) };
};
const shapeOf = (d: FlatDocument) => Object.fromEntries(worldParts(d).map((b) => [b.name, {
  box: boxOf(b), cuts: b.cuts.map((c) => ({ ...c, id: undefined })),
}]));

describe('half-lap: a three-layer stack, any listing order (fu 185)', () => {
  // B is long and reaches back past A so the piece stands on A without
  // tipping; C crosses B clear of A's footprint.
  const parts: Record<string, P> = {
    A: { name: 'A', at: [0, 0, 9], size: [20, 0.75, 3] },
    B: { name: 'B', at: [9, 0.75, -10], size: [3, 0.75, 30] },
    C: { name: 'C', at: [0, 1.5, 16], size: [20, 0.75, 3] },
  };
  const runs = orders(['A', 'B', 'C']).map((o) => {
    const doc = design(...o.map((n) => parts[n]));
    return { o: o.join(''), doc, ...allLaps(doc) };
  });

  it('every order: the input is sound, both laps applied, nothing skipped, all three in one plane', () => {
    for (const { o, doc, sites, out } of runs) {
      expect(checkDesign(doc, limits(doc)), o).toEqual([]);
      expect(sites.filter((s) => s.kind === 'crossing'), o).toHaveLength(2);
      expect(out.skipped, o).toEqual([]);
      expect(out.applied, o).toHaveLength(2);
      const ys = ['A', 'B', 'C'].map((n) => boxOf(board(out.doc, n)));
      for (const y of ys) { expect(y.min[1], o).toBe(ys[0].min[1]); expect(y.max[1], o).toBe(ys[0].max[1]); }
      expect(overlapsOf(out.doc), o).toEqual([]);
    }
  });

  it('every order ends with the same boxes and the same cuts, part by part', () => {
    for (const { o, out } of runs) expect(shapeOf(out.doc), o).toEqual(shapeOf(runs[0].out.doc));
  });
});

describe('half-lap: a stack whose top part shares the bottom part\'s footprint (fu 185)', () => {
  const parts: Record<string, P> = {
    A: { name: 'A', at: [0, 0, 9], size: [20, 0.75, 3] },
    B: { name: 'B', at: [9, 0.75, 0], size: [3, 0.75, 20] },
    C: { name: 'C', at: [0, 1.5, 9], size: [20, 0.75, 3] },
  };

  it('every order: C\'s drop is refused for A before C moves, and leaves no empty notch', () => {
    for (const o of orders(['A', 'B', 'C'])) {
      const label = o.join('');
      const doc = design(...o.map((n) => parts[n]));
      expect(checkDesign(doc, limits(doc)), label).toEqual([]);
      const { out } = allLaps(doc);
      expect(out.skipped.map((s) => s.reason), label).toEqual(['moving C would drive it into A']);
      expect(out.applied, label).toHaveLength(1);
      expect(board(out.doc, 'C').cuts, label).toHaveLength(0);
      expect(boxOf(board(out.doc, 'C')), label).toEqual(boxOf(board(doc, 'C')));
      expect(board(out.doc, 'B').cuts, label).toHaveLength(1);
      expect(board(out.doc, 'A').cuts, label).toHaveLength(1);
      expect(boxOf(board(out.doc, 'B')).min[1], label).toBe(boxOf(board(out.doc, 'A')).min[1]);
    }
  });
});

describe('half-lap: a part partway down a deep drop blocks it (fu 185)', () => {
  // D hangs off its stand at a height between C's start and C's lap plane:
  // it neither butts C's moving face nor reaches the plane C lands in, so
  // only the volume C sweeps on the way down meets it.
  const doc = design(
    { name: 'A', at: [0, 0, 9], size: [20, 0.75, 3] },
    { name: 'B', at: [9, 0.75, -10], size: [3, 0.75, 30] },
    { name: 'C', at: [0, 1.5, 16], size: [20, 0.75, 3] },
    { name: 'Stand', at: [-3, 0, 16], size: [2.5, 0.75, 3] },
    { name: 'D', at: [-3, 0.75, 16], size: [5, 0.65, 3] },
  );

  it('the input is sound; C\'s lap is refused for D before C moves, B\'s lap still lands', () => {
    expect(checkDesign(doc, limits(doc))).toEqual([]);
    const { out } = allLaps(doc);
    expect(out.skipped.map((s) => s.reason)).toEqual(['moving C would drive it into D']);
    expect(out.applied).toHaveLength(1);
    expect(boxOf(board(out.doc, 'C'))).toEqual(boxOf(board(doc, 'C')));
    expect(board(out.doc, 'C').cuts).toHaveLength(0);
    expect(board(out.doc, 'B').cuts).toHaveLength(1);
  });
});

describe('half-lap: a five-part grid, the top part lapping two partners (fu 185)', () => {
  const doc = design(
    { name: 'A1', at: [0, 0, 2], size: [20, 0.75, 3] },
    { name: 'A2', at: [0, 0, 15], size: [20, 0.75, 3] },
    { name: 'B1', at: [3, 0.75, 0], size: [3, 0.75, 20] },
    { name: 'B2', at: [14, 0.75, 0], size: [3, 0.75, 20] },
    { name: 'C', at: [0, 1.5, 8.5], size: [20, 0.75, 3] },
  );
  let out: ReturnType<typeof applyJoints>;
  beforeAll(() => { out = allLaps(doc).out; });

  it('the input is sound; all six laps applied, every part on the floor plane, C moved once', () => {
    expect(checkDesign(doc, limits(doc))).toEqual([]);
    expect(out.skipped).toEqual([]);
    expect(out.applied).toHaveLength(6);
    // All five in ONE plane AT the floor: a part dropped twice would sit
    // below it, and the final re-lowering would then lift the rest off it.
    for (const n of ['A1', 'A2', 'B1', 'B2', 'C']) expect(board(out.doc, n).position[1]).toBe(0);
    expect(board(out.doc, 'C').cuts).toHaveLength(2);
    for (const n of ['B1', 'B2']) expect(board(out.doc, n).cuts).toHaveLength(3);
    expect(overlapsOf(out.doc)).toEqual([]);
  });
});

describe('cuts move with their part: a rail tenoned at its far end first', () => {
  // The max-end leg is listed first, so its site comes first and the rail's
  // min-end tenon then moves the rail's position back by L.
  const doc = design(
    { name: 'Right leg', at: [20, 0, 0], size: [1.75, 28, 1.75] },
    { name: 'Left leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
    { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18.25, 3.5, 0.75] },
  );
  let out: ReturnType<typeof applyJoints>;
  beforeAll(() => {
    const sites = findSites(doc);
    expect(worldParts(doc)[sites[0].receive].name).toBe('Right leg');
    out = applyJoints(doc, sites, sites.map((s) => ({ site: s.id, joint: 'mortise-tenon' as const, tenonLength: 1 })));
  });

  it('tenons both ends and mortises both legs, with no overlap', () => {
    expect(out.skipped).toEqual([]);
    expect(board(out.doc, 'Rail').length).toBe(20.25);
    for (const n of ['Left leg', 'Right leg']) {
      const b = board(out.doc, n);
      expect(b.cuts.map((c) => cutLabel(b, c))).toEqual(['mortise']);
    }
    expect(overlapsOf(out.doc)).toEqual([]);
  });

  it('conserves stock: each leg loses one tenon, the rail gains two', () => {
    const tenon = 1 * 0.25 * (3.5 - 2 * 0.5);
    for (const n of ['Left leg', 'Right leg']) expect(boxVolume(out.doc, n) - volume(out.doc, n)).toBeCloseTo(tenon, 9);
    expect(volume(out.doc, 'Rail') - 18.25 * 3.5 * 0.75).toBeCloseTo(2 * tenon, 9);
  });
});

describe('cuts move with their part: the workbench with its legs listed right before left', () => {
  it('joined with the defaults, it has no new overlap', () => {
    const raw = JSON.parse(workbenchRaw);
    raw.boards = [raw.boards[1], raw.boards[0], raw.boards[3], raw.boards[2], ...raw.boards.slice(4)];
    const doc = flatDocument(migrateDocument(raw));
    expect(overlapsOf(doc)).toEqual([]);
    expect(overlapsOf(withDefaults(doc).doc)).toEqual([]);
  });
});

describe('moving recipes first: a tenoned shelf behind a back rabbet', () => {
  // The shelf is listed first, so in plain site order it is tenoned BEFORE
  // the back's rabbet trims (and, on -Z, moves) it.
  it('tenons the shelf after it is trimmed, with no overlap', () => {
    const doc = design(
      { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
      { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Back', at: [0, 0, -0.25], size: [21.5, 30, 0.25] },
    );
    const sites = findSites(doc);
    const out = applyJoints(doc, sites, sites.map((s) => s.kind === 'end-into-face'
      ? { site: s.id, joint: 'mortise-tenon' as const, tenonLength: 0.5 }
      : { site: s.id, joint: 'rabbet' as const, depth: 0.375 }));
    expect(out.skipped).toEqual([]);
    expect(board(out.doc, 'Shelf').width).toBe(11);
    expect(overlapsOf(out.doc)).toEqual([]);
  });
});

describe('moving recipes first: tenons and a half-lap on the same part', () => {
  // Rail A runs between two legs on X, Rail B between two on Z and laps
  // down into Rail A. Rail B is tenoned AND moved by its lap.
  const legs: P[] = [
    { name: 'Leg XL', at: [0, 0, 13.5], size: [3, 30, 3] },
    { name: 'Leg XR', at: [33, 0, 13.5], size: [3, 30, 3] },
    { name: 'Leg ZF', at: [16.5, 0, -3], size: [3, 30, 3] },
    { name: 'Leg ZB', at: [16.5, 0, 30], size: [3, 30, 3] },
  ];
  const rails: P[] = [
    { name: 'Rail A', at: [3, 20, 13.5], size: [30, 1, 3] },
    { name: 'Rail B', at: [16.5, 21, 0], size: [3, 1, 30] },
  ];
  for (const [label, parts] of [['legs listed first', [...legs, ...rails]], ['rails listed first', [...rails, ...legs]]] as const) {
    it(`${label}: the lap and all four tenons, no overlap`, () => {
      const doc = design(...parts);
      const out = withDefaults(doc);
      expect(out.applied.map((a) => a.joint).sort()).toEqual(['half-lap', 'mortise-tenon', 'mortise-tenon', 'mortise-tenon', 'mortise-tenon']);
      expect(out.skipped).toEqual([]);
      expect(overlapsOf(out.doc)).toEqual([]);
    });
  }
});

describe('a cut that runs out keeps running out when its part grows', () => {
  // Rabbets run before dados (above), so a bottom is rabbeted for the back
  // BEFORE it grows into the sides' dados. Its rabbet ran its full length and
  // must still: shifted by the rule alone it stops 1/4in short of each end,
  // prints as a notch, and the back drives into the grown ends.
  const bookcase = (backFirst: boolean) => {
    const back: P = { name: 'Back', at: [0, 0, -0.25], size: [31.5, 72, 0.25] };
    const rest: P[] = [
      { name: 'Left side', at: [0, 0, 0], size: [0.75, 72, 11.25] },
      { name: 'Right side', at: [30.75, 0, 0], size: [0.75, 72, 11.25] },
      { name: 'Bottom', at: [0.75, 0, 0], size: [30, 0.75, 11.25] },
      { name: 'Top', at: [0.75, 71.25, 0], size: [30, 0.75, 11.25] },
      { name: 'Shelf 1', at: [0.75, 24, 0], size: [30, 0.75, 11.25] },
    ];
    return design(...(backFirst ? [back, ...rest] : [...rest, back]));
  };
  for (const backFirst of [false, true]) {
    it(`a bookcase, back listed ${backFirst ? 'first' : 'last'}: the bottom and top keep full-length rabbets, no overlap`, () => {
      const doc = bookcase(backFirst);
      const out = withDefaults(doc);
      expect(out.skipped).toEqual([]);
      for (const n of ['Bottom', 'Top']) {
        const b = board(out.doc, n);
        expect(b.length).toBe(30.5);
        expect(b.cuts.map((c) => cutLabel(b, c))).toEqual(['rabbet']);
      }
      expect(overlapsOf(out.doc)).toEqual([]);
      expect(voids(out.doc)).toEqual([]);
    });
  }

  it('a side growing up into a top it rests under keeps its back rabbet to the top', () => {
    const doc = design(
      { name: 'Back', at: [0, 0, -0.25], size: [31.5, 72, 0.25] },
      { name: 'Left side', at: [0, 0, 0], size: [0.75, 71.25, 11.25] },
      { name: 'Right side', at: [30.75, 0, 0], size: [0.75, 71.25, 11.25] },
      { name: 'Top', at: [0, 71.25, 0], size: [31.5, 0.75, 11.25] },
      { name: 'Bottom', at: [0.75, 0, 0], size: [30, 0.75, 11.25] },
    );
    const out = withDefaults(doc);
    expect(out.skipped).toEqual([]);
    expect(overlapsOf(out.doc)).toEqual([]);
  });
});

describe('run-out rule (joinery residual fix)', () => {
  const foot = (name: string, x: number): P => ({ name, at: [x, 0, 0], size: [2, 2, 11.25] });
  const footed: Record<string, P> = {
    footL: foot('Foot L', -1.25),
    footR: foot('Foot R', 30.75),
    sideL: { name: 'Left side', at: [0, 2, 0], size: [0.75, 40, 11.25] },
    sideR: { name: 'Right side', at: [30, 2, 0], size: [0.75, 40, 11.25] },
    bottom: { name: 'Bottom', at: [0.75, 2, 0], size: [29.25, 0.75, 11.25] },
    top: { name: 'Top', at: [0.75, 41.25, 0], size: [29.25, 0.75, 11.25] },
  };
  const run = (doc: FlatDocument) => {
    const sites = findSites(doc);
    return applyJoints(doc, sites, sites.map((s) => defaultChoice(s, doc, sites)));
  };
  const cutsOf = (doc: FlatDocument, name: string) => board(doc, name).cuts.map((c) => ({ ...c, id: undefined }));

  it('a housing flush with a growing end stays a 3/4in dado above the end, in either listing order', () => {
    const outs = [['bottom', 'top', 'sideL', 'sideR', 'footL', 'footR'], ['footL', 'footR', 'sideL', 'sideR', 'bottom', 'top']]
      .map((order) => run(design(...order.map((k) => footed[k]))));
    for (const out of outs) {
      const side = board(out.doc, 'Left side');
      const housings = side.cuts.filter((c) => cutLabel(side, c) === 'dado' && Math.abs(c.width - 0.75) < 1e-9 && c.offset > 1e-9);
      expect(housings.length).toBeGreaterThan(0);
      expect(side.cuts.some((c) => cutLabel(side, c) === 'rabbet' && c.width > 0.75 + 1e-9)).toBe(false);
    }
    expect(cutsOf(outs[0].doc, 'Left side')).toEqual(cutsOf(outs[1].doc, 'Left side'));
    expect(cutsOf(outs[0].doc, 'Right side')).toEqual(cutsOf(outs[1].doc, 'Right side'));
  });

  it('a back grooved into an overhanging top and rabbeted into the sides does not overlap, Top listed first', () => {
    const doc = design(
      { name: 'Top', at: [0, 71.25, -0.25], size: [31.5, 0.75, 11.5] },
      { name: 'Back', at: [0, 0, -0.25], size: [31.5, 71.25, 0.25] },
      { name: 'Left side', at: [0, 0, 0], size: [0.75, 71.25, 11.25] },
      { name: 'Right side', at: [30.75, 0, 0], size: [0.75, 71.25, 11.25] },
    );
    expect(overlapsOf(run(doc).doc)).toEqual([]);
  });
});

describe('rabbet: parts on the panel\'s OUTER face are carried with it (fu 183)', () => {
  // A 1/4in back behind two sides, entering on +Z. Whatever is fastened to its
  // outer (-Z) face rides along by the same 1/4in, or it is left in the air.
  const CASE: P[] = [
    { name: 'LeftSide', at: [0, 0, 0], size: [0.75, 30, 12] },
    { name: 'RightSide', at: [20.75, 0, 0], size: [0.75, 30, 12] },
    { name: 'Back', at: [0, 0, -0.25], size: [21.5, 30, 0.25] },
  ];
  const run = (doc: FlatDocument) => { const sites = findSites(doc); return { sites, out: applyJoints(doc, sites, sites.map(rabbetPick(0.375))) }; };
  const dz = (out: ReturnType<typeof applyJoints>, doc: FlatDocument, name: string) => board(out.doc, name).position[2] - board(doc, name).position[2];
  const problemsFor = (d: FlatDocument, name: string) => checkDesign(d, limits(d)).filter((v) => v.parts?.includes(name)).map((v) => v.kind);

  it('carries a cleat on the back exactly once, by t, still touching it', () => {
    const doc = design(...CASE, { name: 'Cleat', at: [0.75, 26, -1], size: [20, 3, 0.75] });
    expect(checkDesign(doc, limits(doc))).toEqual([]);
    const { sites, out } = run(doc);
    expect(sites.filter((s) => s.kind === 'face-against-edge')).toHaveLength(2);
    expect(out.skipped).toEqual([]);
    expect(dz(out, doc, 'Back')).toBe(0.25);
    expect(dz(out, doc, 'Cleat')).toBe(0.25);
    expect(boxOf(board(out.doc, 'Cleat')).max[2]).toBe(boxOf(board(out.doc, 'Back')).min[2]);
    expect([...out.moved].sort()).toEqual(['Back', 'Cleat']);
    expect(problemsFor(out.doc, 'Cleat')).toEqual([]);
    expect(checkDesign(out.doc, limits(out.doc))).toEqual([]);
  });

  it('carries a two-deep chain: a spacer on the back, a rail on the spacer', () => {
    const doc = design(...CASE,
      { name: 'Spacer', at: [0.75, 26, -1], size: [20, 3, 0.75] },
      { name: 'Rail', at: [0.75, 26, -1.75], size: [20, 3, 0.75] });
    expect(checkDesign(doc, limits(doc))).toEqual([]);
    const { out } = run(doc);
    expect(out.skipped).toEqual([]);
    expect(['Back', 'Spacer', 'Rail'].map((n) => dz(out, doc, n))).toEqual([0.25, 0.25, 0.25]);
    expect([...out.moved].sort()).toEqual(['Back', 'Rail', 'Spacer']);
    expect(checkDesign(out.doc, limits(out.doc))).toEqual([]);
  });

  // The cleat overhangs the back's top edge; a top flush with the back's outer
  // face sits in the 1/4in the cleat would move through.
  const SHELF: P = { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 12] };
  const TOP: P = { name: 'Top', at: [0, 30, -0.25], size: [21.5, 0.75, 12.25] };
  const HIGH_CLEAT: P = { name: 'Cleat', at: [0.75, 28, -1], size: [20, 3, 0.75] };

  it('control: without the top in the way, the high cleat is carried and the shelf trimmed', () => {
    const doc = design(...CASE, SHELF, HIGH_CLEAT);
    expect(checkDesign(doc, limits(doc))).toEqual([]);
    const { out } = run(doc);
    expect(out.skipped).toEqual([]);
    expect(dz(out, doc, 'Cleat')).toBe(0.25);
    expect(board(out.doc, 'Shelf').width).toBe(11.75);
  });

  it('refuses a carry that would drive the cleat into the top, changing NOTHING', () => {
    const doc = design(...CASE, SHELF, TOP, HIGH_CLEAT);
    expect(checkDesign(doc, limits(doc))).toEqual([]);
    const { sites, out } = run(doc);
    const backSites = sites.filter((s) => s.kind === 'face-against-edge' && worldParts(doc)[s.enter].name === 'Back');
    expect(backSites.length).toBeGreaterThanOrEqual(2);
    expect(out.skipped).toEqual(backSites.map((s) => ({ site: s.id, reason: 'moving Back would drive Cleat into Top' })));
    expect(out.doc.boards).toEqual(doc.boards);
    expect(out.trimmed).toEqual([]);
    expect(out.moved).toEqual([]);
  });

  it('never carries the panel\'s OWN receivers on its other face', () => {
    // A panel rabbeted into sides on BOTH faces: the +Z pair runs first and
    // moves it away from the -Z pair, which butt its outer face but are its
    // receivers, not parts fastened to it.
    const doc = design(
      { name: 'Panel', at: [0, 0, 0], size: [21.5, 30, 0.25] },
      { name: 'LF', at: [0, 0, 0.25], size: [0.75, 30, 11.75] },
      { name: 'RF', at: [20.75, 0, 0.25], size: [0.75, 30, 11.75] },
      { name: 'LB', at: [0, 0, -12], size: [0.75, 30, 12] },
      { name: 'RB', at: [20.75, 0, -12], size: [0.75, 30, 12] },
    );
    expect(checkDesign(doc, limits(doc))).toEqual([]);
    const { sites, out } = run(doc);
    expect(sites.filter((s) => s.kind === 'face-against-edge').map((s) => s.side).sort()).toEqual([-1, -1, 1, 1]);
    expect(['Panel', 'LB', 'RB'].map((n) => dz(out, doc, n))).toEqual([0.25, 0, 0]);
    expect(out.moved).toEqual(['Panel']);
  });
});

// The void metric (follow-ups 182, 201). For every stock-removing cut, the
// pocket it clips out of its board, in world space (invariant 2's min-corner
// mapping, never solidWorldBox), less what every OTHER board's solids fill of
// it. Every pocket is reported, including one that nothing fills at all, and a
// negative remainder (two parts filling the same stock) is reported too.
type WB = { min: number[]; max: number[] };
type Span3 = Record<'length' | 'width' | 'thickness', [number, number]>;
const worldOf = (b: Board, r: Span3): WB => {
  // spanToWorldOffset: a turn may reverse an axis (quarter-turns spec §2).
  const d = axisDimensions(b);
  const s = [0, 1, 2].map((k) => spanToWorldOffset(b, k, r[d[k]]));
  return { min: [0, 1, 2].map((k) => b.position[k] + s[k][0]), max: [0, 1, 2].map((k) => b.position[k] + s[k][1]) };
};
const vol = (a: WB) => [0, 1, 2].reduce((v, k) => v * Math.max(0, a.max[k] - a.min[k]), 1);
const meet = (a: WB, b: WB): WB => ({ min: [0, 1, 2].map((k) => Math.max(a.min[k], b.min[k])), max: [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k])) });
const pocketsOf = (doc: FlatDocument) => worldParts(doc).flatMap((b, i) => cutsThatRemoveStock(b).map((c) => ({ i, b, c, at: worldOf(b, clippedRegion(b, c)) })));
const voids = (doc: FlatDocument) => {
  const solids = worldParts(doc).map((b) => boardSolids(b).map((s) => worldOf(b, s)));
  return pocketsOf(doc).flatMap(({ i, b, c, at }) => {
    let filled = 0;
    solids.forEach((ss, j) => { if (j !== i) for (const s of ss) filled += vol(meet(at, s)); });
    const empty = vol(at) - filled;
    return Math.abs(empty) > 1e-9 ? [`${b.name} ${cutLabel(b, c)}: ${empty.toFixed(4)} in3 empty`] : [];
  });
};

describe('the void metric', () => {
  it('reports a pocket that nothing fills at all', () => {
    const doc = design({ name: 'Side', at: [0, 0, 0], size: [0.75, 30, 11.25] });
    const side = worldParts(doc)[0];
    side.cuts.push({ id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 });
    expect(pocketsOf(doc)).toHaveLength(1);
    expect(voids(doc)).toEqual([`Side dado: ${(0.75 * 0.25 * 11.25).toFixed(4)} in3 empty`]);
  });
});

describe('a rabbeted panel is resolved as one unit, its final box first (fu 182)', () => {
  // A cabinet: sides, a top and a bottom between them, a 1/4in back behind.
  // Every back site is a rabbet. Cut per site against the back as it stood at
  // that site, each side's rabbet ran the full height and the later top and
  // bottom rabbets trimmed the back off its ends, leaving a 1/8in x 1/4in x
  // 3/8in notch nothing filled at each corner, in some listing orders.
  const CAB: P[] = [
    { name: 'Left side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Right side', at: [23.25, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Top', at: [0.75, 29.25, 0], size: [22.5, 0.75, 11.25] },
    { name: 'Bottom', at: [0.75, 0, 0], size: [22.5, 0.75, 11.25] },
    { name: 'Back', at: [0, 0, -0.25], size: [24, 30, 0.25], material: 'plywood' },
  ];
  const listings = orders(CAB);
  let runs: { doc: FlatDocument; sites: ReturnType<typeof findSites>; out: ReturnType<typeof applyJoints> }[];
  beforeAll(() => {
    runs = listings.map((parts) => { const doc = design(...parts); const sites = findSites(doc); return { doc, sites, out: withDefaults(doc) }; });
  });

  it('the input is sound, and the back is rabbeted into all four in every listing order', () => {
    expect(listings).toHaveLength(120);
    for (const { doc, sites } of runs) {
      expect(checkDesign(doc, limits(doc))).toEqual([]);
      const back = sites.filter((s) => worldParts(doc)[s.enter].name === 'Back');
      expect(back.map((s) => defaultChoice(s, doc, sites).joint)).toEqual(['rabbet', 'rabbet', 'rabbet', 'rabbet']);
    }
    // Both relative orders of Back->Top and Back->Left occur among the 120.
    const topFirst = runs.map(({ doc, sites }) => {
      const at = (n: string) => sites.findIndex((s) => worldParts(doc)[s.enter].name === 'Back' && worldParts(doc)[s.receive].name === n);
      return at('Top') < at('Left side');
    });
    expect(new Set(topFirst)).toEqual(new Set([true, false]));
  });

  it('every order: nothing skipped, no overlap, and every pocket is completely filled', () => {
    for (const { out } of runs) {
      expect(out.skipped).toEqual([]);
      expect(overlapsOf(out.doc)).toEqual([]);
      expect(pocketsOf(out.doc).length).toBeGreaterThan(0);
      expect(voids(out.doc)).toEqual([]);
    }
  });

  it('every order ends with the same boxes and the same cuts, part by part', () => {
    // A part's cuts land in site order, which follows the listing, so they are
    // compared as a set; every number must still match exactly.
    const settled = (d: FlatDocument) => Object.fromEntries(Object.entries(shapeOf(d))
      .map(([n, { box, cuts }]) => [n, { box, cuts: cuts.map((c) => JSON.stringify(c)).sort() }]));
    const first = settled(runs[0].out.doc);
    for (const { out } of runs) expect(settled(out.doc)).toEqual(first);
  });

  it('the back moves 1/4in and is trimmed to all four rabbet lines at once', () => {
    // Measured from the left side's min corner: designToDocument centres the piece.
    const o = boxOf(board(runs[0].doc, 'Left side')).min;
    const b = boxOf(board(runs[0].out.doc, 'Back'));
    expect([b.min.map((v, k) => v - o[k]), b.max.map((v, k) => v - o[k])]).toEqual([[0.375, 0.375, 0], [23.625, 29.625, 0.25]]);
  });

  it('each side\'s back rabbet stops where the back ends, and prints as a stopped rabbet', () => {
    const { doc, out } = runs[0];
    const o = boxOf(board(doc, 'Left side')).min;
    for (const name of ['Left side', 'Right side']) {
      const side = board(out.doc, name);
      const rabbets = side.cuts.filter((c) => cutLabel(side, c) === 'stopped rabbet');
      expect(rabbets).toHaveLength(1);
      const at = worldOf(side, clippedRegion(side, rabbets[0]));
      expect([at.min[1] - o[1], at.max[1] - o[1], at.min[2] - o[2], at.max[2] - o[2]]).toEqual([0.375, 29.625, 0, 0.25]);
    }
    expect(buildCutList(out.doc).groups.flatMap((g) => g.rows).length).toBeGreaterThan(0);
  });
});

describe('a bookcase with a raised bottom and a shelf leaves no voids (fu 182)', () => {
  const BOOK: P[] = [
    { name: 'Left side', at: [0, 0, 0], size: [0.75, 36, 11.25] },
    { name: 'Right side', at: [23.25, 0, 0], size: [0.75, 36, 11.25] },
    { name: 'Top', at: [0.75, 35.25, 0], size: [22.5, 0.75, 11.25] },
    { name: 'Bottom', at: [0.75, 2, 0], size: [22.5, 0.75, 11.25] },
    { name: 'Shelf', at: [0.75, 18, 0], size: [22.5, 0.75, 11.25] },
    { name: 'Back', at: [0, 0, -0.25], size: [24, 36, 0.25], material: 'plywood' },
  ];
  const stoppedAt = (end: 'min' | 'max') => (d: FlatDocument) => {
    const sites = findSites(d);
    return applyJoints(d, sites, sites.map((s) => {
      const at = s.kind === 'end-into-face' ? s.stopEnds.find((e) => e.axis === 2 && e.end === end) : undefined;
      return at ? { site: s.id, joint: 'stopped-dado' as const, depth: 0.25, stopAt: at, inset: 0.75 } : defaultChoice(s, d, sites);
    }));
  };
  const variants: [string, (d: FlatDocument) => ReturnType<typeof applyJoints>, number][] = [
    ['the defaults', withDefaults, 0],
    ['every housing a dado stopped at the back (-Z)', stoppedAt('min'), 6],
    ['every housing a dado stopped at the front (+Z)', stoppedAt('max'), 6],
  ];
  for (const [label, join, stopped] of variants) {
    it(`${label}: no skip, no overlap, every pocket completely filled`, () => {
      const doc = design(...BOOK);
      expect(checkDesign(doc, limits(doc))).toEqual([]);
      const out = join(doc);
      expect(out.applied.filter((a) => a.joint === 'stopped-dado')).toHaveLength(stopped);
      expect(out.skipped).toEqual([]);
      expect(overlapsOf(out.doc)).toEqual([]);
      expect(voids(out.doc)).toEqual([]);
    });
  }
});

describe('a part in the rabbeted panel\'s path is trimmed by its intrusion (fu 201)', () => {
  const CASE: P[] = [
    { name: 'Left side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Right side', at: [23.25, 0, 0], size: [0.75, 30, 11.25] },
    { name: 'Top', at: [0.75, 29.25, 0], size: [22.5, 0.75, 11.25] },
    { name: 'Bottom', at: [0.75, 0, 0], size: [22.5, 0.75, 11.25] },
    { name: 'Back', at: [0, 0, -0.25], size: [24, 30, 0.25], material: 'plywood' },
  ];

  it('a shelf 1/8in short of the back loses exactly 1/8in, and nothing overlaps', () => {
    const doc = design(...CASE, { name: 'Shelf', at: [0.75, 15, 0.125], size: [22.5, 0.75, 11.125] });
    expect(checkDesign(doc, limits(doc))).toEqual([]);
    const out = withDefaults(doc);
    expect(out.skipped).toEqual([]);
    expect(board(out.doc, 'Shelf').width).toBe(11);
    expect(boxOf(board(out.doc, 'Shelf')).min[2] - boxOf(board(doc, 'Left side')).min[2]).toBe(0.25);
    expect(out.trimmed).toContain('Shelf');
    expect(overlapsOf(out.doc)).toEqual([]);
    expect(voids(out.doc)).toEqual([]);
  });

  // A shelf already grooved into its back edge cannot be trimmed there: the
  // trim would throw inside rebaseCuts and fail the whole run. It refuses.
  for (const [label, at, depthZ] of [['butting the back', 0, 11.25], ['1/8in short of the back', 0.125, 11.125]] as const) {
    it(`refuses a shelf ${label} that is already cut into its back edge, changing NOTHING`, () => {
      const doc = design(...CASE, { name: 'Shelf', at: [0.75, 15, at], size: [22.5, 0.75, depthZ] });
      board(doc, 'Shelf').cuts.push({ id: 'g1', face: 'width', from: 'min', across: 'length', offset: 0.25, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 });
      expect(checkDesign(doc, limits(doc))).toEqual([]);
      const sites = findSites(doc);
      const out = applyJoints(doc, sites, sites.map(rabbetPick(0.375)));
      const backSites = sites.filter((s) => s.kind === 'face-against-edge' && worldParts(doc)[s.enter].name === 'Back');
      expect(backSites).toHaveLength(4);
      expect(out.skipped).toEqual(backSites.map((s) => ({ site: s.id, reason: 'moving Back would trim Shelf at an end it is already cut into' })));
      expect(out.doc.boards).toEqual(doc.boards);
      expect(out.trimmed).toEqual([]);
      expect(out.moved).toEqual([]);
    });
  }

  it('refuses a part the back would pass through: every back site skipped, NOTHING changed', () => {
    // A 1/8in strip lying on the back's inner face: the back's 1/4in move would
    // swallow it whole, so there is nothing left to trim it to.
    // The shelf butting the back would be trimmed; it proves the refusal comes
    // before ANY trim, not only before the strip's own.
    const doc = design(...CASE, { name: 'Shelf', at: [0.75, 15, 0], size: [22.5, 0.75, 11.25] },
      { name: 'Strip', at: [6, 10, 0], size: [4, 3, 0.125] });
    expect(checkDesign(doc, limits(doc))).toEqual([]);
    const sites = findSites(doc);
    const out = applyJoints(doc, sites, sites.map(rabbetPick(0.375)));
    const backSites = sites.filter((s) => s.kind === 'face-against-edge' && worldParts(doc)[s.enter].name === 'Back');
    expect(backSites).toHaveLength(4);
    expect(out.skipped).toEqual(backSites.map((s) => ({ site: s.id, reason: 'moving Back would pass through Strip' })));
    expect(out.doc.boards).toEqual(doc.boards);
    expect(out.trimmed).toEqual([]);
    expect(out.moved).toEqual([]);
  });
});

// Follow-up 203: every blocker judges SOLIDS (invariant 38), on both sides of
// each comparison, so a design that arrives already cut is not refused for
// stock a cut has removed. Each case is paired with a control the solids
// really block, so the switch is not a licence to pass anything.
describe('blockers judge solids, not boxes (fu 203)', () => {
  // A pocket given relative to the board's min corner (designToDocument centres the design).
  const cutAt = (d: FlatDocument, name: string, min: [number, number, number], max: [number, number, number]) => {
    const b = board(d, name);
    const at = (v: number[]) => v.map((x, k) => b.position[k] + x) as [number, number, number];
    b.cuts.push(pocketFor(b, { min: at(min), max: at(max) }));
  };
  const problems = (d: FlatDocument) => checkDesign(d, limits(d));
  const overlaps = (d: FlatDocument) => problems(d).filter((v) => v.kind === 'overlap');

  describe('a half-lap whose drop passes a seated tenon\'s box', () => {
    // Stage 1 tenons two legs up into R. Stage 2 is Add joinery run again on
    // the joined project: E drops into R's plane over the near leg's SHOULDER
    // waste (inside R's stock, E's partner), clear of its tongue.
    const stage1 = (eWidth: number) => {
      const doc = design(
        { name: 'R', at: [0, 27.25, 0], size: [20, 0.75, 3] },
        { name: 'Leg1', at: [1, 0, 0.625], size: [1.75, 27.25, 1.75] },
        { name: 'Leg2', at: [17.25, 0, 0.625], size: [1.75, 27.25, 1.75] },
        { name: 'E', at: [0.25, 28, -3], size: [eWidth, 0.75, 9] },
      );
      expect(problems(doc)).toEqual([]);
      const sites = findSites(doc);
      const tenons = sites.filter((s) => s.kind === 'end-into-face' && worldParts(doc)[s.enter].name.startsWith('Leg') && worldParts(doc)[s.receive].name === 'R');
      expect(tenons).toHaveLength(2);
      const out = applyJoints(doc, sites, sites.map((s) => tenons.includes(s)
        ? { site: s.id, joint: 'mortise-tenon' as const, tenonLength: 0.5 }
        : { site: s.id, joint: 'butt' as const }));
      expect(out.skipped).toEqual([]);
      expect(problems(out.doc)).toEqual([]);
      return out.doc;
    };
    const lap = (d: FlatDocument) => {
      const sites = findSites(d);
      const crossing = sites.filter((s) => s.kind === 'crossing' && worldParts(d)[s.enter].name === 'E' && worldParts(d)[s.receive].name === 'R');
      expect(crossing).toHaveLength(1);
      return applyJoints(d, sites, sites.map((s) => ({ site: s.id, joint: s === crossing[0] ? 'half-lap' as const : 'butt' as const })));
    };

    it('E passes the tenoned leg\'s box but not its solids: applied, no overlap', () => {
      const d = stage1(1);
      // The premise: E's lap plane meets the leg's BOX beyond TOUCH.
      const e = boxOf(board(d, 'E'));
      const leg = boxOf(board(d, 'Leg1'));
      expect(Math.min(e.max[0], leg.max[0]) - Math.max(e.min[0], leg.min[0])).toBe(0.25);
      expect(leg.max[1]).toBe(27.75);
      const out = lap(d);
      expect(out.skipped).toEqual([]);
      expect(out.moved).toEqual(['E']);
      expect(boxOf(board(out.doc, 'E')).min[1]).toBe(27.25);
      expect(overlaps(out.doc)).toEqual([]);
    });

    it('control: E wide enough to reach the tongue is refused, changing nothing', () => {
      const d = stage1(1.5);
      const out = lap(d);
      expect(out.skipped.map((s) => s.reason)).toEqual(['moving E would drive it into Leg1']);
      expect(out.doc.boards).toEqual(d.boards);
      expect(out.moved).toEqual([]);
    });
  });

  it('a half-lap whose OWN notch clears a block its box would hit: applied, no overlap', () => {
    const doc = design(
      { name: 'R', at: [0, 0, 9], size: [20, 0.75, 3] },
      { name: 'E', at: [9, 0.75, 0], size: [2, 0.75, 20] },
      { name: 'Block', at: [9.25, 0, 0.25], size: [0.5, 0.75, 1.5] },
    );
    // A full-thickness notch in E's corner, right over the block.
    cutAt(doc, 'E', [0, 0, 0], [1, 0.75, 2]);
    expect(problems(doc)).toEqual([]);
    const sites = findSites(doc);
    const crossing = sites.filter((s) => s.kind === 'crossing');
    expect(crossing).toHaveLength(1);
    const out = applyJoints(doc, sites, sites.map((s) => ({ site: s.id, joint: s === crossing[0] ? 'half-lap' as const : 'butt' as const })));
    expect(out.skipped).toEqual([]);
    expect(out.moved).toEqual(['E']);
    expect(overlaps(out.doc)).toEqual([]);
  });

  describe('a rabbet carry', () => {
    const CASE: P[] = [
      { name: 'LeftSide', at: [0, 0, 0], size: [0.75, 30, 12] },
      { name: 'RightSide', at: [20.75, 0, 0], size: [0.75, 30, 12] },
      { name: 'Back', at: [0, 0, -0.25], size: [21.5, 30, 0.25] },
      { name: 'Top', at: [0, 30, -0.25], size: [21.5, 0.75, 12.25] },
    ];
    const run = (doc: FlatDocument) => { const sites = findSites(doc); return applyJoints(doc, sites, sites.map(rabbetPick(0.375))); };

    it('a cleat carried into the top\'s box, but into a rabbet already cut there: applied, no overlap', () => {
      const doc = design(...CASE, { name: 'Cleat', at: [0.75, 28, -1], size: [20, 2.5, 0.75] });
      cutAt(doc, 'Top', [0, 0, 0], [21.5, 0.5, 0.25]);
      expect(problems(doc)).toEqual([]);
      const out = run(doc);
      expect(out.skipped).toEqual([]);
      expect([...out.moved].sort()).toEqual(['Back', 'Cleat']);
      expect(overlaps(out.doc)).toEqual([]);
    });

    it('control: the same cleat with no rabbet in the top is refused, changing nothing', () => {
      const doc = design(...CASE, { name: 'Cleat', at: [0.75, 28, -1], size: [20, 2.5, 0.75] });
      expect(problems(doc)).toEqual([]);
      const out = run(doc);
      expect(new Set(out.skipped.map((s) => s.reason))).toEqual(new Set(['moving Back would drive Cleat into Top']));
      expect(out.doc.boards).toEqual(doc.boards);
    });

    it('a cleat whose OWN rabbet clears the top it would be carried into: applied, no overlap', () => {
      const doc = design(...CASE, { name: 'Cleat', at: [0.75, 28, -1], size: [20, 3, 0.75] });
      cutAt(doc, 'Cleat', [0, 2, 0.5], [20, 3, 0.75]);
      expect(problems(doc)).toEqual([]);
      const out = run(doc);
      expect(out.skipped).toEqual([]);
      expect([...out.moved].sort()).toEqual(['Back', 'Cleat']);
      expect(overlaps(out.doc)).toEqual([]);
    });
  });

  describe('the panel\'s final box against a receiver that no longer meets it', () => {
    // Hand-built sites: RightSide is listed as a receiver but stands 1/8in off
    // the back, so it drops out of the unit and is neither trimmed nor
    // excluded. The back's final box then reaches 1/8in into it, which only
    // the final-box check sees.
    const build = () => {
      const doc = design(
        { name: 'LeftSide', at: [0, 0, 0], size: [0.75, 30, 12] },
        { name: 'RightSide', at: [20.75, 0, 0.125], size: [0.75, 30, 12] },
        { name: 'Back', at: [0, 0, -0.25], size: [21, 30, 0.25] },
      );
      const sites: Site[] = [1, 0].map((receive, n) => ({
        id: n + 1, kind: 'face-against-edge', enter: 2, receive, axis: 2, side: 1, allowed: ['rabbet'], stopEnds: [],
      }));
      return { doc, sites, choices: sites.map((s) => ({ site: s.id, joint: 'rabbet' as const, depth: 0.375 })) };
    };

    it('control: with nothing cut, the back would drive into RightSide and is refused', () => {
      const { doc, sites, choices } = build();
      expect(problems(doc)).toEqual([]);
      const out = applyJoints(doc, sites, choices);
      expect(out.skipped).toEqual([
        { site: 1, reason: 'Back no longer meets RightSide after an earlier joint' },
        { site: 2, reason: 'moving Back would drive it into RightSide' },
      ]);
      expect(out.doc.boards).toEqual(doc.boards);
    });

    it('RightSide already rabbeted where the back lands: applied, no overlap', () => {
      const { doc, sites, choices } = build();
      cutAt(doc, 'RightSide', [0, 0, 0], [0.25, 30, 0.125]);
      expect(problems(doc)).toEqual([]);
      const out = applyJoints(doc, sites, choices);
      expect(out.applied).toEqual([{ site: 2, joint: 'rabbet' }]);
      expect(overlaps(out.doc)).toEqual([]);
    });

    it('the back already rabbeted where it would meet RightSide: applied, no overlap', () => {
      const { doc, sites, choices } = build();
      cutAt(doc, 'Back', [20.75, 0, 0.125], [21, 30, 0.25]);
      expect(problems(doc)).toEqual([]);
      const out = applyJoints(doc, sites, choices);
      expect(out.applied).toEqual([{ site: 2, joint: 'rabbet' }]);
      expect(overlaps(out.doc)).toEqual([]);
    });
  });

  it('the panel is judged CLIPPED to its rabbet lines: an overhang trimmed off cannot reach a part beyond the receiver', () => {
    // The back overhangs LeftSide's OUTER face; X stands in that overhang.
    // The final box is trimmed back to LeftSide's rabbet line, clear of X.
    const doc = design(
      { name: 'LeftSide', at: [0.5, 0, 0], size: [0.75, 30, 12] },
      { name: 'Back', at: [0, 0, -0.25], size: [21.5, 30, 0.25] },
      { name: 'X', at: [0, 0, 0], size: [0.5, 30, 0.25] },
    );
    expect(problems(doc)).toEqual([]);
    const site: Site = { id: 1, kind: 'face-against-edge', enter: 1, receive: 0, axis: 2, side: 1, allowed: ['rabbet'], stopEnds: [] };
    const out = applyJoints(doc, [site], [{ site: 1, joint: 'rabbet', depth: 0.375 }]);
    expect(out.applied).toEqual([{ site: 1, joint: 'rabbet' }]);
    expect(out.trimmed).not.toContain('X');
    expect(overlaps(out.doc)).toEqual([]);
  });

  describe('the trims judge solids', () => {
    // RightSide is not a rabbet receiver here, so the back's final box meets
    // it as a part to trim; its existing rabbet is exactly where the back lands.
    const build = () => design(
      { name: 'LeftSide', at: [0, 0, 0], size: [0.75, 30, 12] },
      { name: 'RightSide', at: [20.75, 0, 0.125], size: [0.75, 30, 12] },
      { name: 'Back', at: [0, 0, -0.25], size: [21, 30, 0.25] },
    );
    const site: Site = { id: 1, kind: 'face-against-edge', enter: 2, receive: 0, axis: 2, side: 1, allowed: ['rabbet'], stopEnds: [] };
    const join = (d: FlatDocument) => applyJoints(d, [site], [{ site: 1, joint: 'rabbet', depth: 0.375 }]);

    it('a part whose existing cut already makes room is not trimmed, and nothing overlaps', () => {
      const doc = build();
      cutAt(doc, 'RightSide', [0, 0, 0], [0.25, 30, 0.125]);
      expect(problems(doc)).toEqual([]);
      const out = join(doc);
      expect(out.skipped).toEqual([]);
      expect(out.trimmed).not.toContain('RightSide');
      expect(board(out.doc, 'RightSide')).toEqual(board(doc, 'RightSide'));
      expect(overlaps(out.doc)).toEqual([]);
    });

    it('a cut making only PART of the room: its solids still meet the back, so the cut-into-end refusal stands, changing NOTHING', () => {
      const doc = build();
      // Room for 1/16in of the back's 1/8in intrusion; trimming the rest would
      // cut into the end that rabbet already runs from.
      cutAt(doc, 'RightSide', [0, 0, 0], [0.25, 30, 0.0625]);
      expect(problems(doc)).toEqual([]);
      const out = join(doc);
      expect(out.skipped).toEqual([{ site: 1, reason: 'moving Back would trim RightSide at an end it is already cut into' }]);
      expect(out.doc.boards).toEqual(doc.boards);
    });

    it('the back\'s OWN rabbet already makes room: RightSide is not trimmed, and nothing overlaps', () => {
      const doc = build();
      cutAt(doc, 'Back', [20.75, 0, 0.125], [21, 30, 0.25]);
      expect(problems(doc)).toEqual([]);
      const out = join(doc);
      expect(out.skipped).toEqual([]);
      expect(out.trimmed).not.toContain('RightSide');
      expect(board(out.doc, 'RightSide')).toEqual(board(doc, 'RightSide'));
      expect(overlaps(out.doc)).toEqual([]);
    });

    it('with no room cut, the 1/8in intrusion is trimmed as before', () => {
      const doc = build();
      const out = join(doc);
      expect(out.skipped).toEqual([]);
      expect(board(out.doc, 'RightSide').width).toBeCloseTo(11.875, 9);
      expect(overlaps(out.doc)).toEqual([]);
    });
  });

  for (const [label, min, max] of [['left', [0, 10, 0], [0.125, 12, 0.25]], ['right', [21.375, 10, 0], [21.5, 12, 0.25]]] as const) {
  it(`a panel already cut into its ${label} end, which its rabbet line trims, refuses the unit, changing NOTHING`, () => {
    const doc = design(
      { name: 'LeftSide', at: [0, 0, 0], size: [0.75, 30, 12] },
      { name: 'RightSide', at: [20.75, 0, 0], size: [0.75, 30, 12] },
      { name: 'Back', at: [0, 0, -0.25], size: [21.5, 30, 0.25] },
    );
    // A notch into the back's end, inside the strip its rabbet line trims off.
    cutAt(doc, 'Back', [...min], [...max]);
    expect(problems(doc)).toEqual([]);
    const sites = findSites(doc);
    const backSites = sites.filter((s) => s.kind === 'face-against-edge' && worldParts(doc)[s.enter].name === 'Back');
    expect(backSites).toHaveLength(2);
    const out = applyJoints(doc, sites, sites.map(rabbetPick(0.375)));
    expect(out.skipped).toEqual(backSites.map((s) => ({ site: s.id, reason: 'moving Back would trim it at an end it is already cut into' })));
    expect(out.doc.boards).toEqual(doc.boards);
    expect(out.moved).toEqual([]);
  });
  }

  it('a half-lap that would leave E out of R\'s plane is refused BEFORE E moves', () => {
    // Hand-built: rule 4 forbids a thickness difference beyond TOUCH, so only
    // a site findSites would never offer reaches the guard.
    const doc = design(
      { name: 'R', at: [0, 0, 9], size: [20, 0.5, 3] },
      { name: 'E', at: [9, 0.5, 0], size: [2, 1, 20] },
    );
    const site: Site = { id: 1, kind: 'crossing', enter: 1, receive: 0, axis: 1, side: -1, allowed: ['half-lap'], stopEnds: [] };
    const out = applyJoints(doc, [site], [{ site: 1, joint: 'half-lap' }]);
    expect(out.skipped).toEqual([{ site: 1, reason: 'E no longer lies in R\'s plane after an earlier half-lap' }]);
    expect(out.moved).toEqual([]);
    expect(out.doc.boards).toEqual(doc.boards);
  });
});

// Final review: tenons and dados GROW the entering part at its touching end,
// and rebaseCuts throws on a cut already INTO that end. A sound hand-made
// design reached it (on master too) and failed the whole run. It is skipped
// with a reason now, before anything changes.
describe('a part already cut into the end a tenon or dado would grow is skipped (final review)', () => {
  const notch = (d: FlatDocument, name: string, min: [number, number, number], max: [number, number, number]) => {
    const b = board(d, name);
    const at = (v: number[]) => v.map((x, k) => b.position[k] + x) as [number, number, number];
    b.cuts.push(pocketFor(b, { min: at(min), max: at(max) }));
    return b.cuts[b.cuts.length - 1];
  };

  it('a shelf notched 1/2 x 1/2in at its far end: the default dado into that side is skipped, nothing changes', () => {
    const doc = design(
      { name: 'Left side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Right side', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
    );
    const cut = notch(doc, 'Shelf', [19.5, 0, 0], [20, 0.75, 0.5]);
    expect(cut).toMatchObject({ face: 'length', from: 'max' });
    expect(checkDesign(doc, limits(doc))).toEqual([]);
    const sites = findSites(doc);
    const choices = sites.map((s) => defaultChoice(s, doc, sites));
    const far = sites.find((s) => worldParts(doc)[s.receive].name === 'Right side')!;
    expect(choices.find((c) => c.site === far.id)!.joint).toBe('dado');
    const out = applyJoints(doc, sites, choices);
    expect(out.skipped).toEqual([{ site: far.id, reason: 'Shelf is already cut at the end that would grow into Right side' }]);
    // The near site still joins; only the far site's growth is refused.
    expect(out.applied.map((a) => a.joint)).toEqual(['dado']);
    expect(board(out.doc, 'Right side')).toEqual(board(doc, 'Right side'));
    expect(board(out.doc, 'Shelf').length).toBe(20 + choices.find((c) => c.site !== far.id)!.depth!);
    // A stopped dado grows the shelf the same way, and is skipped the same way.
    const stopped = applyJoints(doc, sites, [{ site: far.id, joint: 'stopped-dado', depth: 0.25, stopAt: far.stopEnds[0], inset: 0.75 }]);
    expect(stopped.skipped).toEqual([{ site: far.id, reason: 'Shelf is already cut at the end that would grow into Right side' }]);
    expect(stopped.doc.boards).toEqual(doc.boards);
  });

  it('a rail notched at the end entering its leg: the tenon is skipped, NOTHING changes', () => {
    const doc = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
      { name: 'Far leg', at: [19.75, 0, 0], size: [1.75, 28, 1.75] },
    );
    const cut = notch(doc, 'Rail', [0, 0, 0], [0.5, 0.5, 0.75]);
    expect(cut).toMatchObject({ face: 'length', from: 'min' });
    expect(checkDesign(doc, limits(doc))).toEqual([]);
    const sites = findSites(doc);
    const near = sites.find((s) => worldParts(doc)[s.receive].name === 'Leg')!;
    const out = applyJoints(doc, sites, [{ site: near.id, joint: 'mortise-tenon', tenonLength: 1 }]);
    expect(out.skipped).toEqual([{ site: near.id, reason: 'Rail is already cut at the end that would grow into Leg' }]);
    expect(out.applied.every((a) => a.joint === 'butt')).toBe(true);
    expect(out.doc.boards).toEqual(doc.boards);
  });
});

// Quarter-turns round, Task 3: joinery follows the part's turn. A 180 turn
// keeps every part's world box, so the same design turned 180 must join to the
// same world solids, with the same moved, trimmed and skipped. The cuts of a
// fixture are built AFTER the turn, from world boxes, so both copies carry the
// same world cut.
describe('joinery is equivariant under a 180 turn of every part', () => {
  type Notch = [string, [number, number, number], [number, number, number]];
  const turnedDesign = (parts: P[], notches: Notch[], extra: number) => {
    const doc = design(...parts);
    for (const b of doc.boards) b.rotation = (((b.rotation + extra) % 360) as Board['rotation']);
    for (const [name, min, max] of notches) {
      const b = board(doc, name);
      const at = (v: number[]) => v.map((x, k) => b.position[k] + x) as [number, number, number];
      b.cuts.push(pocketFor(b, { min: at(min), max: at(max) }));
    }
    return doc;
  };
  const FIXTURES: { label: string; parts: P[]; notches: Notch[]; want: 'applied' | 'skipped'; kinds: string[] }[] = [
    { label: 'a mortise-and-tenon rail between legs', want: 'applied', kinds: ['mortise-tenon', 'mortise-tenon'], notches: [], parts: [
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
      { name: 'Far leg', at: [19.75, 0, 0], size: [1.75, 28, 1.75] },
    ] },
    { label: 'a dado\'d shelf between sides', want: 'applied', kinds: ['dado', 'dado'], notches: [], parts: [
      { name: 'Left side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Right side', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
    ] },
    { label: 'the rabbeted cabinet back', want: 'applied', kinds: ['dado', 'dado', 'rabbet', 'rabbet'], notches: [], parts: [
      { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
      { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
    ] },
    { label: 'a shelf already cut at the end a dado would grow (skip)', want: 'skipped', kinds: ['dado'], notches: [['Shelf', [19.5, 0, 0], [20, 0.75, 0.5]]], parts: [
      { name: 'Left side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Right side', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
    ] },
    { label: 'a rail already cut at the end entering its leg (skip)', want: 'skipped', kinds: ['mortise-tenon'], notches: [['Rail', [0, 0, 0], [0.5, 0.5, 0.75]]], parts: [
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
      { name: 'Far leg', at: [19.75, 0, 0], size: [1.75, 28, 1.75] },
    ] },
  ];

  it.each(FIXTURES)('$label', ({ parts, notches, want, kinds }) => {
    const run = (extra: number) => {
      const doc = turnedDesign(parts, notches, extra);
      const sites = findSites(doc);
      return { doc, out: applyJoints(doc, sites, sites.map((s) => defaultChoice(s, doc, sites))) };
    };
    const a = run(0);
    const b = run(180);
    // Not vacuous: the 180 copy really is turned, and the fixture really joins or skips.
    expect(worldParts(b.doc).every((x, i) => x.rotation === (worldParts(a.doc)[i].rotation + 180) % 360)).toBe(true);
    if (want === 'applied') expect(a.out.applied.some((x) => x.joint !== 'butt')).toBe(true);
    else expect(a.out.skipped.length).toBeGreaterThan(0);
    // Pin the kind too (fu 217): "some joint is not butt" would pass a fixture
    // that quietly stopped getting the joint it exists to exercise.
    expect(a.out.applied.map((x) => x.joint).sort()).toEqual(kinds);
    if (want === 'skipped') expect(a.out.skipped.map((x) => x.reason)).toEqual([expect.stringMatching(/is already cut at the end that would grow into/)]);
    expect(b.out.applied.map((x) => x.joint)).toEqual(a.out.applied.map((x) => x.joint));
    expect(b.out.skipped.map((x) => x.reason)).toEqual(a.out.skipped.map((x) => x.reason));
    expect([...b.out.moved].sort()).toEqual([...a.out.moved].sort());
    expect([...b.out.trimmed].sort()).toEqual([...a.out.trimmed].sort());
    expect(b.out.lowered).toBe(a.out.lowered);
    expect(worldParts(b.out.doc).map((x) => x.name)).toEqual(worldParts(a.out.doc).map((x) => x.name));
    for (const x of a.out.doc.boards) {
      const y = board(b.out.doc, x.name);
      const corners = (bd: Board) => worldSolids(bd).flatMap((w) => [w.min, w.max]);
      expect(sameSet(corners(y), corners(x)), `${x.name} world solids`).toBe(true);
    }
  });
});

// fu 217: the test above turns each part about its own centre, which only a
// 180 turn leaves a design unchanged under. A quarter turn of the WHOLE design
// (every part pivoted about one point, rotation + 90k) is the equivariance a
// 90 or 270 turn owes: the joined world solids are the unturned result carried
// by rotateQuarter k times. The notches are built from the carried world box.
describe('joinery is equivariant under a rigid quarter turn of the whole design (fu 217)', () => {
  type Notch = [string, [number, number, number], [number, number, number]];
  const PIVOT: [number, number, number] = [7, 0, 3];
  const carry = (p: [number, number, number], k: number) => {
    let q = p;
    for (let i = 0; i < k; i += 1) q = rotateQuarter(q, PIVOT);
    return q;
  };
  const carryBox = (min: [number, number, number], max: [number, number, number], k: number) => {
    const a = carry(min, k);
    const b = carry(max, k);
    return { min: a.map((v, i) => Math.min(v, b[i]!)) as [number, number, number], max: a.map((v, i) => Math.max(v, b[i]!)) as [number, number, number] };
  };
  const build = (parts: P[], notches: Notch[], k: number) => {
    const doc = design(...parts);
    const world = new Map(doc.boards.map((b) => {
      const e = boardExtents(b);
      return [b.name, { min: [...b.position] as [number, number, number], e }] as const;
    }));
    for (const b of doc.boards) {
      const { min, e } = world.get(b.name)!;
      const box = carryBox(min, [min[0] + e[0], min[1] + e[1], min[2] + e[2]], k);
      b.rotation = ((b.rotation + 90 * k) % 360) as Board['rotation'];
      b.position = box.min;
    }
    for (const [name, nmin, nmax] of notches) {
      const b = board(doc, name);
      const { min } = world.get(name)!;
      const at = (v: number[]) => v.map((x, i) => min[i]! + x) as [number, number, number];
      b.cuts.push(pocketFor(b, carryBox(at(nmin), at(nmax), k)));
    }
    return doc;
  };
  const FIXTURES: { label: string; parts: P[]; notches: Notch[]; kinds: string[]; skips: boolean }[] = [
    { label: 'a mortise-and-tenon rail between legs', kinds: ['mortise-tenon', 'mortise-tenon'], skips: false, notches: [], parts: [
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
      { name: 'Far leg', at: [19.75, 0, 0], size: [1.75, 28, 1.75] },
    ] },
    { label: 'the rabbeted cabinet back', kinds: ['dado', 'dado', 'rabbet', 'rabbet'], skips: false, notches: [], parts: [
      { name: 'Left', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Right', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
      { name: 'Back', at: [0, 0, 11.25], size: [21.5, 30, 0.25] },
    ] },
    { label: 'a shelf already cut at the end a dado would grow (skip)', kinds: ['dado'], skips: true, notches: [['Shelf', [19.5, 0, 0], [20, 0.75, 0.5]]], parts: [
      { name: 'Left side', at: [0, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Right side', at: [20.75, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Shelf', at: [0.75, 12, 0], size: [20, 0.75, 11.25] },
    ] },
  ];
  const run = (parts: P[], notches: Notch[], k: number) => {
    const doc = build(parts, notches, k);
    const sites = findSites(doc);
    return { doc, out: applyJoints(doc, sites, sites.map((s) => defaultChoice(s, doc, sites))) };
  };

  for (const k of [1, 2, 3]) {
    it.each(FIXTURES)(`$label, turned ${90 * k}`, ({ parts, notches, kinds, skips }) => {
      const a = run(parts, notches, 0);
      const b = run(parts, notches, k);
      expect(worldParts(b.doc).every((x, i) => x.rotation === (worldParts(a.doc)[i].rotation + 90 * k) % 360)).toBe(true);
      // The joint kinds are what the unturned design gets; a turn must not change them.
      expect(a.out.applied.map((x) => x.joint).sort()).toEqual(kinds);
      expect(b.out.applied.map((x) => x.joint).sort()).toEqual(kinds);
      // A skip fixture must really skip, or two empty lists would pass.
      expect(a.out.skipped.length > 0).toBe(skips);
      expect(b.out.skipped.map((x) => x.reason)).toEqual(a.out.skipped.map((x) => x.reason));
      expect([...b.out.moved].sort()).toEqual([...a.out.moved].sort());
      expect([...b.out.trimmed].sort()).toEqual([...a.out.trimmed].sort());
      for (const x of a.out.doc.boards) {
        const y = board(b.out.doc, x.name);
        const carried = worldSolids(x).flatMap((w) => { const c = carryBox(w.min as [number, number, number], w.max as [number, number, number], k); return [c.min, c.max]; });
        expect(sameSet(worldSolids(y).flatMap((w) => [w.min, w.max]), carried), `${x.name} world solids`).toBe(true);
      }
    });
  }
});

describe('joinery on assemblies (assemblies spec §6.1)', () => {
  it('joins a grouped design exactly as its flat twin, and returns the tree', () => {
    const flat = LEG_RAIL();
    const ids = worldParts(flat).map((b) => b.id);
    const grouped = groupItems(flat, null, ids)!.doc;
    const plainSites = findSites(flat);
    const plainJoin = applyJoints(flat, plainSites, plainSites.map((s) => defaultChoice(s, flat, plainSites)));
    const f = flatDocument(grouped);
    const sites = findSites(f);
    const joined = applyJoints(f, sites, sites.map((s) => defaultChoice(s, f, sites)));
    const tree = writeBackFlat(grouped, f.boards, joined.doc.boards);
    expect(tree.instances).toHaveLength(1);
    const cuts = (d: SloydDocument) => flatDocument(d).boards.map((b) => b.cuts.map(({ id: _i, ...c }) => c));
    expect(cuts(tree)).toEqual(cuts(plainJoin.doc));
  });

  for (const rot of [0, 90, 180, 270] as const) {
    it(`keeps the joined world geometry inside an assembly translated and turned ${rot}`, () => {
      const flat = LEG_RAIL();
      const g = groupItems(flat, null, worldParts(flat).map((b) => b.id))!.doc;
      const grouped: SloydDocument = { ...g, instances: g.instances.map((i) => ({ ...i, rotation: rot, position: [5.3, 0, 2.1] as [number, number, number] })) };
      const f = flatDocument(grouped);
      const sites = findSites(f);
      const joined = applyJoints(f, sites, sites.map((s) => defaultChoice(s, f, sites)));
      const back = flatDocument(migrateDocument(writeBackFlat(grouped, f.boards, joined.doc.boards)));
      expect(back.boards).toHaveLength(joined.doc.boards.length);
      const corners = (b: Board) => worldSolids(b).flatMap((w) => [[...w.min], [...w.max]] as number[][]);
      worldParts(joined.doc).forEach((j, k) => {
        expect(sameSet(corners(worldParts(back)[k]!), corners(j)), j.name).toBe(true);
        expect(worldParts(back)[k]!.cuts.map(({ id: _i, ...c }) => c), j.name).toEqual(j.cuts.map(({ id: _i, ...c }) => c));
      });
    });
  }
});

describe('refaceFromEnd (fu 205)', () => {
  // A 20 x 11.25 x 0.75 shelf (length x width x thickness), unturned.
  const shelf = (): Board => ({ ...design({ name: 'S', at: [0, 0, 0], size: [20, 0.75, 11.25] }).boards[0]!, cuts: [] });
  it('fixture dimension mapping', () => {
    const b = shelf();
    expect([b.length, b.width, b.thickness]).toEqual([20, 11.25, 0.75]);
  });
  it('a corner notch stored into the far end re-stores to enter from the width face it reaches, positioned along length', () => {
    const b = shelf();
    // Hand: box length [19.5, 20], width [0, 0.5], thickness [0, 0.75]. Faces reached besides length:
    // width (from min, span 0.5) and thickness (full, span 0.75) -> the shallower, width.
    const c: Cut = { id: 'n', face: 'length', from: 'max', across: 'thickness', offset: 0, width: 0.5, depth: 0.5, stopMin: 0, stopMax: 0 };
    expect(cutRegion(b, c)).toEqual({ length: [19.5, 20], width: [0, 0.5], thickness: [0, 0.75] });
    expect(refaceFromEnd(b, c, 'length')).toEqual({ id: 'n', face: 'width', from: 'min', across: 'thickness', offset: 19.5, width: 0.5, depth: 0.5, stopMin: 0, stopMax: 0 });
  });
  it('a corner notch at the near end and far width edge re-faces from max', () => {
    const b = shelf();
    // Hand: box length [0, 0.5], width [10.75, 11.25], thickness [0, 0.75]. Reached besides length: width
    // (from max, span 0.5) and thickness (full -> min, span 0.75). Shallower: width, entering from max.
    const c: Cut = { id: 'n', face: 'length', from: 'min', across: 'thickness', offset: 10.75, width: 0.5, depth: 0.5, stopMin: 0, stopMax: 0 };
    expect(cutRegion(b, c)).toEqual({ length: [0, 0.5], width: [10.75, 11.25], thickness: [0, 0.75] });
    expect(refaceFromEnd(b, c, 'length')).toEqual({ id: 'n', face: 'width', from: 'max', across: 'thickness', offset: 0, width: 0.5, depth: 0.5, stopMin: 0, stopMax: 0 });
  });
  it('an end-grain mortise (interior on both other axes) cannot be re-faced', () => {
    const b = shelf();
    const c: Cut = { id: 'm', face: 'length', from: 'max', across: 'thickness', offset: 3, width: 1, depth: 1, stopMin: 0.25, stopMax: 0.25 };
    expect(refaceFromEnd(b, c, 'length')).toBeNull();
  });
  it('a groove along the back edge, stored into the width end, re-faces to enter from the length end (the only face it reaches)', () => {
    const b = shelf();
    // Hand: face width from min, across length, offset/width on thickness [0.25, 0.5], depth 0.25:
    // box width [0, 0.25], length [0, 20] (full), thickness [0.25, 0.5] (interior). Only length is reached
    // (full span -> from min, depth 20); across = thickness with stops 0.25 / 0.25; position = width.
    const c: Cut = { id: 'g', face: 'width', from: 'min', across: 'length', offset: 0.25, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 };
    expect(refaceFromEnd(b, c, 'width')).toEqual({ id: 'g', face: 'length', from: 'min', across: 'thickness', offset: 0, width: 0.25, depth: 20, stopMin: 0.25, stopMax: 0.25 });
  });
  it('the re-faced cut removes exactly the same box', () => {
    const b = shelf();
    const c: Cut = { id: 'n', face: 'length', from: 'max', across: 'thickness', offset: 0, width: 0.5, depth: 0.5, stopMin: 0, stopMax: 0 };
    expect(cutRegion(b, refaceFromEnd(b, c, 'length')!)).toEqual(cutRegion(b, c));
  });
  it('a metric (non-dyadic) corner notch still re-faces exactly', () => {
    const b = { ...shelf(), length: 508 / 25.4 };
    const c: Cut = { id: 'n', face: 'length', from: 'max', across: 'thickness', offset: 0, width: 12 / 25.4, depth: 12 / 25.4, stopMin: 0, stopMax: 0 };
    const r = refaceFromEnd(b, c, 'length');
    expect(r).not.toBeNull();
    const a = cutRegion(b, r!); const e = cutRegion(b, c);
    for (const k of ['length', 'width', 'thickness'] as const) for (const i of [0, 1]) expect(Math.abs(a[k][i] - e[k][i])).toBeLessThanOrEqual(1e-9);
  });
});
