import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { designToDocument } from '../../document/generated';
import { migrateDocument } from '../../document/document';
import { checkDesign } from '../../document/designCheck';
import { applyJoints } from './recipes';
import { defaultChoice, parseChoices, siteMessage, JOINT_SCHEMA } from './choose';
import { findSites } from './sites';

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...parts: P[]) => designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc;
const doc = design(
  { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Rail', at: [1.75, 23.5, 0.5], size: [18, 3.5, 0.75] },
  { name: 'Side', at: [40, 0, 0], size: [0.75, 30, 11.25] },
  { name: 'Shelf', at: [40.75, 12, 0], size: [20, 0.75, 11.25] },
);
const sites = findSites(doc);
const rail = sites.find((s) => doc.boards[s.enter].name === 'Rail')!;
const shelf = sites.find((s) => doc.boards[s.enter].name === 'Shelf')!;

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
    expect(d.boards[s.receive].name).toBe('Side');
    expect(defaultChoice(s, d, findSites(d)).joint).toBe('dado');
  });
});

describe('defaultChoice: a leg under a top is fastened, not housed (final review I2)', () => {
  it('the workbench\'s legs into its benchtop default to butt', () => {
    const wb = migrateDocument(JSON.parse(workbenchRaw));
    const ws = findSites(wb);
    const legToTop = ws.filter((s) => wb.boards[s.receive].name === 'Benchtop' && wb.boards[s.enter].name.endsWith('leg'));
    expect(legToTop).toHaveLength(4);
    for (const s of legToTop) expect(defaultChoice(s, wb, ws).joint).toBe('butt');
  });

  it('a bookcase side into the top resting on it still defaults to dado: a side is not post-like', () => {
    const d = design(
      { name: 'Left side', at: [0, 0, 0], size: [0.75, 71.25, 11.25] },
      { name: 'Top', at: [0, 71.25, 0], size: [31.5, 0.75, 11.25] },
    );
    const ds = findSites(d);
    const s = ds.find((x) => d.boards[x.enter].name === 'Left side' && d.boards[x.receive].name === 'Top')!;
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
