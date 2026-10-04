import workbenchRaw from '../../document/fixtures/simple-workbench.sloyd?raw';
import { migrateDocument } from '../../document/document';
import { designToDocument } from '../../document/generated';
import { buildCutList } from '../../document/cutlist';
import { buildDiagrams } from '../../document/diagram';
import type { SloydDocument } from '../../document/types';
import { findSites } from './sites';
import { applyJoints, type JointChoice } from './recipes';
import { defaultChoice } from './choose';

const joined = (doc: SloydDocument) => {
  const sites = findSites(doc);
  return applyJoints(doc, sites, sites.map((s) => defaultChoice(s, doc, sites))).doc;
};
const setupOf = (doc: SloydDocument, name: string) =>
  buildCutList(doc).groups.flatMap((g) => g.rows).find((r) => r.names.includes(name))!.setup;

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...ps: P[]) => designToDocument({ name: 'B', parts: ps.map((p) => ({
  name: p.name, material: 'pine',
  at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] },
})) }).doc;
const bookcase = () => design(
  { name: 'Back', at: [0, 0, -0.25], size: [31.5, 72, 0.25] },
  { name: 'Left side', at: [0, 0, 0], size: [0.75, 72, 11.25] },
  { name: 'Right side', at: [30.75, 0, 0], size: [0.75, 72, 11.25] },
  { name: 'Bottom', at: [0.75, 0, 0], size: [30, 0.75, 11.25] },
  { name: 'Top', at: [0.75, 71.25, 0], size: [30, 0.75, 11.25] },
  { name: 'Shelf 1', at: [0.75, 24, 0], size: [30, 0.75, 11.25] },
  { name: 'Shelf 2', at: [0.75, 48, 0], size: [30, 0.75, 11.25] },
);

const SIDE_TOP = [
  '3/8" rabbet, 1/4" deep — into the width face (min side), 3/8" from the thickness min end, running across the length',
  '3/4" rabbet, 1/4" deep — into the thickness face (max side), 0" from the length min end, running across the width',
  '3/4" rabbet, 1/4" deep — into the thickness face (max side), 71-1/4" from the length min end, running across the width',
];

describe('the live designs (cut-lines spec §2.2)', () => {
  it('the joined workbench\'s leg prints exactly as before', () => {
    const doc = joined(migrateDocument(JSON.parse(workbenchRaw)));
    expect(setupOf(doc, 'Front left leg')).toEqual([
      '1/2" mortise, 1-1/4" deep — into the width face (max side), 1/2" from the thickness min end, running across the length, stopped 28-1/4" short of the min end and 1/2" short of the max end',
      '1/2" mortise, 1-1/4" deep — into the thickness face (max side), 1/2" from the width min end, running across the length, stopped 28-1/4" short of the min end and 1/2" short of the max end',
      '1/2" mortise, 1-1/4" deep — into the width face (max side), 1/2" from the thickness min end, running across the length, stopped 6-1/2" short of the min end and 24-1/4" short of the max end',
      '1/2" mortise, 1-1/4" deep — into the thickness face (max side), 1/2" from the width min end, running across the length, stopped 6-1/2" short of the min end and 24-1/4" short of the max end',
    ]);
  });

  it('the joined bookcase\'s side prints exactly as before', () => {
    expect(setupOf(joined(bookcase()), 'Left side')).toEqual([
      ...SIDE_TOP,
      '3/4" dado, 1/4" deep — into the thickness face (max side), 24" from the length min end, running across the width',
      '3/4" dado, 1/4" deep — into the thickness face (max side), 48" from the length min end, running across the width',
    ]);
  });

  // Each shelf housing stopped 3/4" short of the front, as in the live check.
  const stoppedShelves = () => {
    const doc = bookcase();
    const sites = findSites(doc);
    return applyJoints(doc, sites, sites.map((s): JointChoice => {
      const d = defaultChoice(s, doc, sites);
      if (!doc.boards[s.enter].name.startsWith('Shelf') || d.joint !== 'dado') return d;
      const at = s.stopEnds.find((e) => e.axis === 2 && e.end === 'max') ?? s.stopEnds[0];
      return { site: s.id, joint: 'stopped-dado', depth: d.depth, stopAt: at, inset: 0.75 };
    })).doc;
  };

  it('a stopped shelf housing prints its height as the position and its front stop as the only stop (fu 192)', () => {
    expect(setupOf(stoppedShelves(), 'Left side')).toEqual([
      ...SIDE_TOP,
      '3/4" stopped dado, 1/4" deep — into the thickness face (max side), 24" from the length min end, running across the width, stopped 3/4" short of the max end',
      '3/4" stopped dado, 1/4" deep — into the thickness face (max side), 48" from the length min end, running across the width, stopped 3/4" short of the max end',
    ]);
  });

  it('and its drawing carries the same numbers (spec §2.4)', () => {
    const side = stoppedShelves().boards.find((b) => b.name === 'Left side')!;
    const view = buildDiagrams(side, 16).find((v) => v.key === 'thickness|max')!;
    const housing = view.cuts.find((c) => c.offsetLabel === '24"')!;
    expect(housing).toMatchObject({
      axis: 'h', offsetLabel: '24"', widthLabel: '3/4"', kind: 'stopped dado',
      stopMaxLabel: '3/4"', lengthLabel: '10-1/4"',
    });
    expect(housing.stopMinLabel).toBeUndefined();
  });
});
