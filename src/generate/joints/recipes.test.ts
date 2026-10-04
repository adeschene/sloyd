import { beforeAll } from 'vitest';
import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { designToDocument } from '../../document/generated';
import { migrateDocument } from '../../document/document';
import { checkDesign } from '../../document/designCheck';
import { boardSolids, cutLabel } from '../../document/cuts';
import type { SloydDocument } from '../../document/document';
import { findSites } from './sites';
import { defaultChoice } from './choose';
import { applyJoints, tenonSection } from './recipes';

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...parts: P[]) => designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
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
