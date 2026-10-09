import { worldParts } from '../../document/tree';
import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { designToDocument } from '../../document/generated';
import { flatDocument, migrateDocument } from '../../document/document';
import { checkDesign } from '../../document/designCheck';
import { applyJoints } from './recipes';
import { DEFAULT_MIN_TENON, defaultChoice, parseChoices, siteMessage, validChoice, JOINT_SCHEMA } from './choose';
import { findSites, rangesOf } from './sites';

const limits = (d: { boards: unknown[] }) => ({ width: null, depth: null, height: null, maxParts: d.boards.length });

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...parts: P[]) => flatDocument(designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc);
const doc = design(
  { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
  { name: 'Side', at: [40, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Shelf', at: [40.75, 12, 0], size: [20, 0.75, 11.25] },
);
const sites = findSites(doc);
const rail = sites.find((s) => worldParts(doc)[s.enter].name === 'Rail')!;
const shelf = sites.find((s) => worldParts(doc)[s.enter].name === 'Shelf')!;

describe('defaultChoice', () => {
  it('a narrow rail gets a mortise and tenon of min(1-1/4, 2/3 of the leg)', () => {
    expect(defaultChoice(rail, doc, sites)).toEqual({ site: rail.id, joint: 'mortise-tenon', tenonLength: 1.1875 });
  });
  it('a wide shelf gets a dado a third of the side deep', () => {
    expect(defaultChoice(shelf, doc, sites)).toEqual({ site: shelf.id, joint: 'dado', depth: 0.25 });
  });
});

describe('defaultChoice (receiver shape)', () => {
  it('a narrow part into a wide panel still gets a dado: the receiver is not post-like', () => {
    const d = design(
      { name: 'Side', at: [40, 0, 0], size: [0.75, 30, 11.25] },
      { name: 'Rail', at: [40.75, 10, 3], size: [10, 3.5, 0.75] },
    );
    const s = findSites(d)[0];
    expect(worldParts(d)[s.receive].name).toBe('Side');
    expect(defaultChoice(s, d, findSites(d)).joint).toBe('dado');
  });
});

describe('defaultChoice: a leg under a top is fastened, not housed (final review I2)', () => {
  it('the workbench\'s legs into its benchtop default to butt', () => {
    const wb = flatDocument(migrateDocument(JSON.parse(workbenchRaw)));
    const ws = findSites(wb);
    const legToTop = ws.filter((s) => worldParts(wb)[s.receive].name === 'Benchtop' && worldParts(wb)[s.enter].name.endsWith('leg'));
    expect(legToTop).toHaveLength(4);
    for (const s of legToTop) expect(defaultChoice(s, wb, ws).joint).toBe('butt');
  });

  it('a bookcase side into the top resting on it still defaults to dado: a side is not post-like', () => {
    const d = design(
      { name: 'Left side', at: [0, 0, 0], size: [0.75, 71.25, 11.25] },
      { name: 'Top', at: [0, 71.25, 0], size: [31.5, 0.75, 11.25] },
    );
    const ds = findSites(d);
    const s = ds.find((x) => worldParts(d)[x.enter].name === 'Left side' && worldParts(d)[x.receive].name === 'Top')!;
    expect(s.kind).toBe('end-into-face');
    expect(defaultChoice(s, d, ds).joint).toBe('dado');
  });
});

describe('defaultChoice: two default tenons sharing a leg are capped (final review I1)', () => {
  // The reviewer's table: 1-3/4in legs, aprons set back 1/4in from the legs'
  // outer faces, so two aprons' tenons meet inside each leg at full length.
  const L = 1.75, H = 28.5, W = 36, D = 24;
  const table = design(
    { name: 'Leg FL', at: [0, 0, 0], size: [L, H, L] },
    { name: 'Leg FR', at: [W - L, 0, 0], size: [L, H, L] },
    { name: 'Leg BL', at: [0, 0, D - L], size: [L, H, L] },
    { name: 'Leg BR', at: [W - L, 0, D - L], size: [L, H, L] },
    { name: 'Apron F', at: [L, H - 3.5, 0.25], size: [W - 2 * L, 3.5, 0.75] },
    { name: 'Apron B', at: [L, H - 3.5, D - 1], size: [W - 2 * L, 3.5, 0.75] },
    { name: 'Apron L', at: [0.25, H - 3.5, L], size: [0.75, 3.5, D - 2 * L] },
    { name: 'Apron R', at: [W - 1, H - 3.5, L], size: [0.75, 3.5, D - 2 * L] },
    { name: 'Top', at: [-1, H, -1], size: [W + 2, 1, D + 2] },
  );
  const ts = findSites(table);
  const choices = ts.map((s) => defaultChoice(s, table, ts));

  it('every apron tenon stops 1/16in short of its neighbour\'s: 15/16in', () => {
    const tenons = choices.filter((c) => c.joint === 'mortise-tenon');
    expect(tenons).toHaveLength(8);
    for (const c of tenons) expect(c.tenonLength).toBe(0.9375);
  });

  it('joined with the defaults, the table has no overlap', () => {
    const out = applyJoints(table, ts, choices);
    expect(out.skipped).toEqual([]);
    expect(checkDesign(out.doc, { width: null, depth: null, height: null, maxParts: table.boards.length })
      .filter((v) => v.kind === 'overlap').map((v) => v.message)).toEqual([]);
  });
});

describe('parseChoices', () => {
  it('snaps an off-grid size to 1/16 before clamping', () => {
    const out = parseChoices({ joints: [{ site: rail.id, joint: 'mortise-tenon', tenonLength: 1.04 }] }, sites, doc);
    expect(out.choices[0].tenonLength).toBe(1.0625);
  });

  it('keeps a valid answer', () => {
    const out = parseChoices({ joints: [
      { site: rail.id, joint: 'mortise-tenon', tenonLength: 1 },
      { site: shelf.id, joint: 'stopped-dado', depth: 0.25, stopAt: '+Z', inset: 0.75 },
    ] }, sites, doc);
    expect(out.notes).toEqual([]);
    expect(out.choices).toEqual([
      { site: rail.id, joint: 'mortise-tenon', tenonLength: 1 },
      { site: shelf.id, joint: 'stopped-dado', depth: 0.25, stopAt: { axis: 2, end: 'max' }, inset: 0.75 },
    ]);
  });

  it('falls back per site, with a note, for a disallowed joint, a missing site, a bad stopAt', () => {
    const out = parseChoices({ joints: [
      { site: rail.id, joint: 'rabbet' },
      { site: 99, joint: 'dado' },
    ] }, sites, doc);
    expect(out.choices).toEqual([defaultChoice(rail, doc, sites), defaultChoice(shelf, doc, sites)]);
    expect(out.notes).toHaveLength(2);
    const bad = parseChoices({ joints: [
      { site: rail.id, joint: 'butt' },
      { site: shelf.id, joint: 'stopped-dado', depth: 0.25, stopAt: '+Q', inset: 0.75 },
    ] }, sites, doc);
    expect(bad.choices[1]).toMatchObject({ stopAt: shelf.stopEnds[0] });
    expect(bad.notes).toHaveLength(1);
  });

  it('snaps then clamps an out-of-range size, with a note', () => {
    const out = parseChoices({ joints: [
      { site: rail.id, joint: 'mortise-tenon', tenonLength: 9 },
      { site: shelf.id, joint: 'dado', depth: 0.01 },
    ] }, sites, doc);
    expect(out.choices[0].tenonLength).toBe(1.5);
    expect(out.choices[1].depth).toBe(0.125);
    expect(out.notes).toHaveLength(2);
  });

  it('treats an answer that is not the schema\'s shape as all-defaults', () => {
    const out = parseChoices('nonsense', sites, doc);
    expect(out.choices).toEqual(sites.map((s) => defaultChoice(s, doc, sites)));
    expect(out.notes).toEqual([]);
  });

  it('an empty list, or entries with no numeric site, give no notes', () => {
    for (const j of [{ joints: [] }, { joints: [{ joint: 'dado' }, { site: '1', joint: 'dado' }] }]) {
      const out = parseChoices(j, sites, doc);
      expect(out.notes).toEqual([]);
      expect(out.choices).toEqual(sites.map((s) => defaultChoice(s, doc, sites)));
    }
  });

  it('words a non-string joint and a missing stopAt plainly', () => {
    const a = parseChoices({ joints: [{ site: rail.id }, { site: shelf.id, joint: 'stopped-dado', depth: 0.25, inset: 0.75 }] }, sites, doc);
    expect(a.notes[0]).toContain('no joint given');
    expect(a.notes[1]).toContain('no stopAt given; used');
    expect(a.notes.join()).not.toContain('undefined');
  });
});

describe('siteMessage', () => {
  it('names every part and every site with its allowed joints and ranges', () => {
    const m = siteMessage(doc, sites);
    for (const b of doc.boards) expect(m).toContain(b.name);
    expect(m).toContain(`${rail.id}. Rail → Leg — end into face`);
    expect(m).toContain('mortise-tenon (tenonLength 0.5–1.5)');
    expect(m).toContain('stopped-dado');
  });
});

it('JOINT_SCHEMA enumerates the six joints', () => {
  expect(JSON.stringify(JOINT_SCHEMA)).toContain('"half-lap"');
});

describe('defaultTenon: opposite-face tenons share the post (fu 190)', () => {
  const centrePost = (rightY: number) => design(
    { name: 'LegA', at: [0, 0, 0], size: [1.75, 28, 1.75] },
    { name: 'LeftRail', at: [1.75, 23.5, 0.5], size: [8.25, 3.5, 0.75] },
    { name: 'Post', at: [10, 0, 0], size: [1.75, 28, 1.75] },
    { name: 'RightRail', at: [11.75, rightY, 0.5], size: [8.25, 3.5, 0.75] },
    { name: 'LegB', at: [20, 0, 0], size: [1.75, 28, 1.75] },
  );
  const intoPost = (d: ReturnType<typeof design>) => {
    const ss = findSites(d);
    const pick = (n: string) => ss.find((s) => worldParts(d)[s.enter].name === n && worldParts(d)[s.receive].name === 'Post')!;
    return { ss, l: pick('LeftRail'), r: pick('RightRail') };
  };

  it('two rails entering one post from opposite faces at the same height stop short of its centre', () => {
    const d = centrePost(23.5);
    expect(checkDesign(d, limits(d))).toEqual([]);
    const { ss, l, r } = intoPost(d);
    expect(defaultChoice(l, d, ss)).toEqual({ site: l.id, joint: 'mortise-tenon', tenonLength: 0.8125 });
    expect(defaultChoice(r, d, ss)).toEqual({ site: r.id, joint: 'mortise-tenon', tenonLength: 0.8125 });
    const joined = applyJoints(d, ss, ss.map((s) => defaultChoice(s, d, ss))).doc;
    expect(checkDesign(joined, limits(joined)).filter((v) => v.kind === 'overlap')).toEqual([]);
  });

  it('rails at different heights do not share the mortise zone and keep the uncapped default', () => {
    const d = centrePost(10);
    expect(checkDesign(d, limits(d))).toEqual([]);
    const { ss, l, r } = intoPost(d);
    expect(defaultChoice(l, d, ss)).toMatchObject({ tenonLength: 1.1875 });
    expect(defaultChoice(r, d, ss)).toMatchObject({ tenonLength: 1.1875 });
  });

  it('a same-side site is not a collision: only the OPPOSITE face caps', () => {
    const d = centrePost(23.5);
    const { ss, l, r } = intoPost(d);
    // A synthetic twin entering from the SAME face at the same cross-section.
    const twin = { ...l, id: 999 };
    expect(defaultChoice(l, d, [...ss, twin])).toMatchObject({ tenonLength: 0.8125 }); // the real opposite site still caps
    const alone = ss.filter((s) => s.id !== r.id);
    expect(defaultChoice(l, d, [...alone, twin])).toMatchObject({ tenonLength: 1.1875 });
  });
});

describe('defaultTenon: a thin receiver shortens the default below 1/2in (fu 188)', () => {
  const opp = (d: number) => design(
    { name: 'Post', at: [18, 0, 0], size: [d, 28, 1.5] },
    { name: 'LeftRail', at: [0, 20, 0.375], size: [18, 3.5, 0.75] },
    { name: 'RightRail', at: [18 + d, 20, 0.375], size: [18, 3.5, 0.75] },
    { name: 'LeftLeg', at: [-1.75, 0, 0], size: [1.75, 28, 1.75] },
    { name: 'RightLeg', at: [36 + d, 0, 0], size: [1.75, 28, 1.75] },
  );
  const adj = (d: number) => design(
    { name: 'Leg', at: [0, 0, 0], size: [d, 28, d] },
    { name: 'RailX', at: [d, 20, (d - 0.75) / 2], size: [18, 3.5, 0.75] },
    { name: 'RailZ', at: [(d - 0.75) / 2, 20, d], size: [0.75, 3.5, 18] },
    { name: 'LegX', at: [d + 18, 0, 0], size: [d, 28, d] },
    { name: 'LegZ', at: [0, 0, d + 18], size: [d, 28, d] },
  );
  const defaults = (d: ReturnType<typeof design>, receiver: string) => {
    const ss = findSites(d);
    const choices = ss.map((s) => defaultChoice(s, d, ss));
    const into = ss.filter((s) => worldParts(d)[s.receive].name === receiver);
    const lens = into.map((s) => choices[ss.indexOf(s)]);
    const joined = applyJoints(d, ss, choices);
    return { lens, overlaps: checkDesign(joined.doc, limits(joined.doc)).filter((v) => v.kind === 'overlap').map((v) => v.message) };
  };

  it.each([[0.75, 0.3125], [0.875, 0.375]])('opposite rails into a %sin post get %sin tenons, no overlap', (depth, len) => {
    const d = opp(depth);
    expect(checkDesign(d, limits(d))).toEqual([]);
    const { lens, overlaps } = defaults(d, 'Post');
    expect(lens.map((c) => c.tenonLength)).toEqual([len, len]);
    expect(depth - 2 * len).toBeGreaterThanOrEqual(1 / 16 - 1e-9);
    expect(overlaps).toEqual([]);
  });

  it.each([0.875, 1, 1.125])('adjacent corner-leg rails into a %sin leg: no overlap', (depth) => {
    const d = adj(depth);
    expect(checkDesign(d, limits(d))).toEqual([]);
    expect(defaults(d, 'Leg').overlaps).toEqual([]);
  });

  // Each stops 1/16in short of the other's tenon, which starts at the rail's
  // inset (d - 3/4) / 2 plus its 1/4in cheek: 1/4in at 7/8, 5/16 at 1, 3/8 at 1-1/8.
  it.each([[0.875, 0.25], [1, 0.3125], [1.125, 0.375]])('adjacent rails into a %sin leg: exact lengths, %sin', (depth, len) => {
    const { lens } = defaults(adj(depth), 'Leg');
    expect(lens.map((c) => [c.joint, c.tenonLength])).toEqual([['mortise-tenon', len], ['mortise-tenon', len]]);
  });

  it('when even 1/4in will not fit the default is a butt', () => {
    const d = adj(0.75);
    expect(checkDesign(d, limits(d))).toEqual([]);
    const { lens, overlaps } = defaults(d, 'Leg');
    expect(lens.map((c) => c.joint)).toEqual(['butt', 'butt']);
    expect(overlaps).toEqual([]);
  });

  it('an uncapped default is unchanged', () => {
    const d = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
    );
    const ss = findSites(d);
    expect(defaultChoice(ss[0], d, ss)).toMatchObject({ joint: 'mortise-tenon', tenonLength: 1.1875 });
  });

  it('the model range is unchanged: an answer under 1/2in still clamps up', () => {
    const d = opp(0.75);
    const ss = findSites(d);
    const s = ss.find((x) => worldParts(d)[x.receive].name === 'Post')!;
    const { choices } = parseChoices({ joints: [{ site: s.id, joint: 'mortise-tenon', tenonLength: 0.3125 }] }, ss, d);
    expect(choices.find((c) => c.site === s.id)).toMatchObject({ tenonLength: 0.5 });
  });

  it('a model tenon with no length at a site whose default is butt falls back to the default choice, a butt, with a note', () => {
    const d = adj(0.75);
    const ss = findSites(d);
    const s = ss.find((x) => worldParts(d)[x.receive].name === 'Leg')!;
    const { choices, notes } = parseChoices({ joints: [{ site: s.id, joint: 'mortise-tenon' }] }, ss, d);
    expect(choices.find((c) => c.site === s.id)).toEqual({ site: s.id, joint: 'butt' });
    expect(notes).toContainEqual(expect.stringMatching(new RegExp(`^Site ${s.id} .*: no tenonLength, and no default tenon fits; used butt\\.$`)));
  });

  it('a model tenon WITH a length at that site is kept, as before', () => {
    const d = adj(0.75);
    const ss = findSites(d);
    const s = ss.find((x) => worldParts(d)[x.receive].name === 'Leg')!;
    const { choices } = parseChoices({ joints: [{ site: s.id, joint: 'mortise-tenon', tenonLength: 0.5 }] }, ss, d);
    expect(choices.find((c) => c.site === s.id)).toEqual({ site: s.id, joint: 'mortise-tenon', tenonLength: 0.5 });
  });

  it('a model tenon with no length where a default fits still takes the default length', () => {
    const d = adj(0.875);
    const ss = findSites(d);
    const s = ss.find((x) => worldParts(d)[x.receive].name === 'Leg')!;
    const { choices, notes } = parseChoices({ joints: [{ site: s.id, joint: 'mortise-tenon' }] }, ss, d);
    expect(choices.find((c) => c.site === s.id)).toEqual({ site: s.id, joint: 'mortise-tenon', tenonLength: 0.25 });
    expect(notes).toContainEqual(expect.stringMatching(/^Site \d+ \(RailX → Leg: end into face\): no tenonLength; used 0\.25\.$/));
  });
});

const flatOf = (parts: [string, [number, number, number], [number, number, number]][]) => flatDocument(designToDocument({
  name: 'V', assemblies: [],
  parts: parts.map(([name, at, size]) => ({ name, role: '', material: 'oak', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] } })),
}).doc);
const LEG_RAIL = flatOf([['Leg', [0, 0, 0], [1.75, 28, 1.75]], ['Rail', [1.75, 23.5, 0.5], [18, 3.5, 0.75]]]);
const SIDE_SHELF = flatOf([['Side', [0, 0, 0], [0.75, 30, 11.25]], ['Shelf', [0.75, 12, 0], [20, 0.75, 11.25]]]);

describe('validChoice (strict — review focus 3)', () => {
  it('accepts a tenon inside its range, at both ends, and rejects one outside without clamping', () => {
    const [s] = findSites(LEG_RAIL);
    const r = rangesOf(s, LEG_RAIL);
    expect(validChoice({ site: s.id, joint: 'mortise-tenon', tenonLength: r.tenonLength[0] }, s, LEG_RAIL)).toBe(true);
    expect(validChoice({ site: s.id, joint: 'mortise-tenon', tenonLength: r.tenonLength[1] }, s, LEG_RAIL)).toBe(true);
    expect(validChoice({ site: s.id, joint: 'mortise-tenon', tenonLength: r.tenonLength[1] + 1 / 16 }, s, LEG_RAIL)).toBe(false);
    expect(validChoice({ site: s.id, joint: 'mortise-tenon' }, s, LEG_RAIL)).toBe(false);
  });
  it('rejects a kind the site does not allow, and accepts butt', () => {
    const [s] = findSites(LEG_RAIL);
    expect(s.allowed.includes('half-lap')).toBe(false);
    expect(validChoice({ site: s.id, joint: 'half-lap' }, s, LEG_RAIL)).toBe(false);
    expect(validChoice({ site: s.id, joint: 'butt' }, s, LEG_RAIL)).toBe(true);
  });
  it('checks a stopped dado’s stop end and inset', () => {
    const [s] = findSites(SIDE_SHELF);
    expect(s.stopEnds.length).toBeGreaterThan(0);
    const at = s.stopEnds[0];
    const r = rangesOf(s, SIDE_SHELF);
    const ok = { site: s.id, joint: 'stopped-dado' as const, depth: r.dadoDepth[0], stopAt: at, inset: r.inset(at)[0] };
    expect(validChoice(ok, s, SIDE_SHELF)).toBe(true);
    expect(validChoice({ ...ok, stopAt: { axis: s.axis, end: 'min' as const } }, s, SIDE_SHELF)).toBe(false);
    expect(validChoice({ ...ok, inset: r.inset(at)[1] + 1 / 16 }, s, SIDE_SHELF)).toBe(false);
  });
  it('accepts joinery’s own default tenon floor below the model’s range floor (fu 188), and nothing below it', () => {
    const [s] = findSites(LEG_RAIL);
    const r = rangesOf(s, LEG_RAIL);
    expect(r.tenonLength[0]).toBe(0.5);
    expect(DEFAULT_MIN_TENON).toBe(0.25);
    expect(validChoice({ site: s.id, joint: 'mortise-tenon', tenonLength: 0.25 }, s, LEG_RAIL)).toBe(true);
    expect(validChoice({ site: s.id, joint: 'mortise-tenon', tenonLength: 0.3125 }, s, LEG_RAIL)).toBe(true);
    expect(validChoice({ site: s.id, joint: 'mortise-tenon', tenonLength: 0.25 - 1 / 16 }, s, LEG_RAIL)).toBe(false);
  });
  it('checks a dado’s depth against its range', () => {
    const [s] = findSites(SIDE_SHELF);
    const r = rangesOf(s, SIDE_SHELF);
    expect(r.dadoDepth).toEqual([0.125, 0.375]);
    expect(validChoice({ site: s.id, joint: 'dado', depth: 0.125 }, s, SIDE_SHELF)).toBe(true);
    expect(validChoice({ site: s.id, joint: 'dado', depth: 0.375 }, s, SIDE_SHELF)).toBe(true);
    expect(validChoice({ site: s.id, joint: 'dado', depth: 0.375 + 1 / 16 }, s, SIDE_SHELF)).toBe(false);
    expect(validChoice({ site: s.id, joint: 'dado', depth: 0.125 - 1 / 16 }, s, SIDE_SHELF)).toBe(false);
    expect(validChoice({ site: s.id, joint: 'dado' }, s, SIDE_SHELF)).toBe(false);
  });
  it('checks a rabbet’s depth against its range', () => {
    const CASE_BACK = flatOf([['Side', [0, 0, 0], [0.75, 30, 12]], ['Back', [0, 0, -0.25], [12, 30, 0.25]]]);
    const s = findSites(CASE_BACK).find((x) => x.allowed.includes('rabbet'))!;
    expect(s).toBeDefined();
    const r = rangesOf(s, CASE_BACK);
    expect(r.rabbetDepth).toEqual([0.125, 0.375]);
    expect(validChoice({ site: s.id, joint: 'rabbet', depth: 0.125 }, s, CASE_BACK)).toBe(true);
    expect(validChoice({ site: s.id, joint: 'rabbet', depth: 0.375 }, s, CASE_BACK)).toBe(true);
    expect(validChoice({ site: s.id, joint: 'rabbet', depth: 0.375 + 1 / 16 }, s, CASE_BACK)).toBe(false);
    expect(validChoice({ site: s.id, joint: 'rabbet', depth: 0.125 - 1 / 16 }, s, CASE_BACK)).toBe(false);
  });
});
