import { beforeAll } from 'vitest';
import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { designToDocument } from '../../document/generated';
import { migrateDocument } from '../../document/document';
import { checkDesign } from '../../document/designCheck';
import { boardSolids, clippedRegion, cutLabel, cutRegion, cutsThatRemoveStock } from '../../document/cuts';
import { buildCutList } from '../../document/cutlist';
import { axisDimensions } from '../../document/geometry';
import type { Board, Cut, SloydDocument } from '../../document/document';
import { findSites } from './sites';
import { defaultChoice } from './choose';
import { applyJoints, tenonSection } from './recipes';
import { boxOf } from './pocket';

type P = { name: string; at: [number, number, number]; size: [number, number, number]; material?: string };
const design = (...parts: P[]) => designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: p.material ?? 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc;
const limits = (doc: SloydDocument) => ({ width: null, depth: null, height: null, maxParts: doc.boards.length });
const board = (doc: SloydDocument, name: string) => doc.boards.find((b) => b.name === name)!;
const volume = (doc: SloydDocument, name: string) => boardSolids(board(doc, name)).reduce(
  (v, s) => v + (s.length[1] - s.length[0]) * (s.width[1] - s.width[0]) * (s.thickness[1] - s.thickness[0]), 0);
const boxVolume = (doc: SloydDocument, name: string) => { const b = board(doc, name); return b.length * b.width * b.thickness; };

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
    expect(out.doc.boards.map((b) => b.name)).toEqual(['Leg', 'Rail']);
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
    const regionOf = (out: SloydDocument) => { const s = board(out, 'Shelf'); return cutRegion(s, s.cuts[0]); };
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
    const regionOf = (out: SloydDocument) => { const s = board(out, 'Shelf'); return cutRegion(s, s.cuts[0]); };
    const a = regionOf(withRabbet(positioned));
    const b2 = regionOf(withRabbet(alongD));
    expect(b2).toEqual(a);
    expect(a.length).toEqual([0.25, 1.0]);
  });

  it('butt leaves the site alone', () => {
    const out = applyJoints(doc, sites, [{ site: 1, joint: 'butt' }]);
    expect(out.doc.boards.every((b) => b.cuts.length === 0)).toBe(true);
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
    expect(out.doc.boards.every((b) => b.cuts.length === 0)).toBe(true);
  });
});

describe('entering from the MAX face', () => {
  it('mortise and tenon: rail left of the leg, no overlap, stock conserved', () => {
    const doc = design(
      { name: 'Rail', at: [0, 23.5, 0.5], size: [18, 3.5, 0.75] },
      { name: 'Leg', at: [18, 0, 0], size: [1.75, 28, 1.75] },
    );
    const sites = findSites(doc);
    const site = sites.find((x) => doc.boards[x.enter].name === 'Rail')!;
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
    const site = sites.find((x) => doc.boards[x.enter].name === 'Shelf')!;
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
    // Left's inner face is its max-X face; Right's is its min-X face.
    const l = board(out.doc, 'Left').cuts[0];
    expect([l.from, l.offset, l.width, l.depth]).toEqual(['max', 0.375, 0.375, 0.25]);
    const r = board(out.doc, 'Right').cuts[0];
    expect([r.from, r.offset, r.width, r.depth]).toEqual(['max', 0, 0.375, 0.25]);
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
    expect(fae.map((s) => doc.boards[s.receive].name).sort()).toEqual(['Left', 'Right']);
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
    expect(Math.min(...out.doc.boards.map((b) => b.position[1]))).toBeCloseTo(0, 9);
    expect(checkDesign(out.doc, limits(out.doc)).filter((v) => v.kind === 'unsupported')).toEqual([]);
  });

  it('reports the drop: the Bottom rose by 1/4in and everything came down by it', () => {
    expect(out.lowered).toBe(0.25);
    expect(board(out.doc, 'SideL').position[1]).toBeCloseTo(0, 9);
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
  doc.boards.find((b) => b.name === 'LowB')!.thickness = 0.72;
  doc.boards.find((b) => b.name === 'LowB')!.position[1] = board(doc, 'LowA').position[1] + 0.06;
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
const overlapsOf = (d: SloydDocument) => checkDesign(d, limits(d)).filter((v) => v.kind === 'overlap').map((v) => v.message);
const withDefaults = (d: SloydDocument) => {
  const sites = findSites(d);
  return applyJoints(d, sites, sites.map((s) => defaultChoice(s, d, sites)));
};

// Follow-up 185: a stack of laps runs bottom-up, so every part is in its
// final plane before anything drops onto it and each part moves once.
const orders = <T,>(xs: T[]): T[][] => xs.length <= 1 ? [xs] : xs.flatMap((x, i) => orders([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [x, ...r]));
const allLaps = (d: SloydDocument) => {
  const sites = findSites(d);
  return { sites, out: applyJoints(d, sites, sites.map((s) => ({ site: s.id, joint: 'half-lap' as const }))) };
};
const shapeOf = (d: SloydDocument) => Object.fromEntries(d.boards.map((b) => [b.name, {
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
    expect(doc.boards[sites[0].receive].name).toBe('Right leg');
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
    const doc = migrateDocument(raw);
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
  const run = (doc: SloydDocument) => {
    const sites = findSites(doc);
    return applyJoints(doc, sites, sites.map((s) => defaultChoice(s, doc, sites)));
  };
  const cutsOf = (doc: SloydDocument, name: string) => board(doc, name).cuts.map((c) => ({ ...c, id: undefined }));

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
  const run = (doc: SloydDocument) => { const sites = findSites(doc); return { sites, out: applyJoints(doc, sites, sites.map(rabbetPick(0.375))) }; };
  const dz = (out: ReturnType<typeof applyJoints>, doc: SloydDocument, name: string) => board(out.doc, name).position[2] - board(doc, name).position[2];
  const problemsFor = (d: SloydDocument, name: string) => checkDesign(d, limits(d)).filter((v) => v.parts?.includes(name)).map((v) => v.kind);

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
    const backSites = sites.filter((s) => s.kind === 'face-against-edge' && doc.boards[s.enter].name === 'Back');
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
  const d = axisDimensions(b);
  return { min: [0, 1, 2].map((k) => b.position[k] + r[d[k]][0]), max: [0, 1, 2].map((k) => b.position[k] + r[d[k]][1]) };
};
const vol = (a: WB) => [0, 1, 2].reduce((v, k) => v * Math.max(0, a.max[k] - a.min[k]), 1);
const meet = (a: WB, b: WB): WB => ({ min: [0, 1, 2].map((k) => Math.max(a.min[k], b.min[k])), max: [0, 1, 2].map((k) => Math.min(a.max[k], b.max[k])) });
const pocketsOf = (doc: SloydDocument) => doc.boards.flatMap((b, i) => cutsThatRemoveStock(b).map((c) => ({ i, b, c, at: worldOf(b, clippedRegion(b, c)) })));
const voids = (doc: SloydDocument) => {
  const solids = doc.boards.map((b) => boardSolids(b).map((s) => worldOf(b, s)));
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
    const side = doc.boards[0];
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
  let runs: { doc: SloydDocument; sites: ReturnType<typeof findSites>; out: ReturnType<typeof applyJoints> }[];
  beforeAll(() => {
    runs = listings.map((parts) => { const doc = design(...parts); const sites = findSites(doc); return { doc, sites, out: withDefaults(doc) }; });
  });

  it('the input is sound, and the back is rabbeted into all four in every listing order', () => {
    expect(listings).toHaveLength(120);
    for (const { doc, sites } of runs) {
      expect(checkDesign(doc, limits(doc))).toEqual([]);
      const back = sites.filter((s) => doc.boards[s.enter].name === 'Back');
      expect(back.map((s) => defaultChoice(s, doc, sites).joint)).toEqual(['rabbet', 'rabbet', 'rabbet', 'rabbet']);
    }
    // Both relative orders of Back->Top and Back->Left occur among the 120.
    const topFirst = runs.map(({ doc, sites }) => {
      const at = (n: string) => sites.findIndex((s) => doc.boards[s.enter].name === 'Back' && doc.boards[s.receive].name === n);
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
    const settled = (d: SloydDocument) => Object.fromEntries(Object.entries(shapeOf(d))
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
  const stoppedAt = (end: 'min' | 'max') => (d: SloydDocument) => {
    const sites = findSites(d);
    return applyJoints(d, sites, sites.map((s) => {
      const at = s.kind === 'end-into-face' ? s.stopEnds.find((e) => e.axis === 2 && e.end === end) : undefined;
      return at ? { site: s.id, joint: 'stopped-dado' as const, depth: 0.25, stopAt: at, inset: 0.75 } : defaultChoice(s, d, sites);
    }));
  };
  const variants: [string, (d: SloydDocument) => ReturnType<typeof applyJoints>, number][] = [
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
    const backSites = sites.filter((s) => s.kind === 'face-against-edge' && doc.boards[s.enter].name === 'Back');
    expect(backSites).toHaveLength(4);
    expect(out.skipped).toEqual(backSites.map((s) => ({ site: s.id, reason: 'moving Back would pass through Strip' })));
    expect(out.doc.boards).toEqual(doc.boards);
    expect(out.trimmed).toEqual([]);
    expect(out.moved).toEqual([]);
  });
});
