import { designToDocument } from '../../document/generated';
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
    expect(defaultChoice(rail, doc)).toEqual({ site: rail.id, joint: 'mortise-tenon', tenonLength: 1.1875 });
  });
  it('a wide shelf gets a dado a third of the side deep', () => {
    expect(defaultChoice(shelf, doc)).toEqual({ site: shelf.id, joint: 'dado', depth: 0.25 });
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
    expect(defaultChoice(s, d).joint).toBe('dado');
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
    expect(out.choices).toEqual([defaultChoice(rail, doc), defaultChoice(shelf, doc)]);
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
    expect(out.choices).toEqual(sites.map((s) => defaultChoice(s, doc)));
    expect(out.notes).toEqual([]);
  });

  it('an empty list, or entries with no numeric site, give no notes', () => {
    for (const j of [{ joints: [] }, { joints: [{ joint: 'dado' }, { site: '1', joint: 'dado' }] }]) {
      const out = parseChoices(j, sites, doc);
      expect(out.notes).toEqual([]);
      expect(out.choices).toEqual(sites.map((s) => defaultChoice(s, doc)));
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
