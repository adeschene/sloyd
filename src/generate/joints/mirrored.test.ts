import { describe, expect, it } from 'vitest';
import { designToDocument } from '../../document/generated';
import { flatDocument, migrateDocument, writeBackFlat, worldParts } from '../../document/document';
import type { Board, SloydDocument } from '../../document/document';
import { worldSolids } from '../../document/designCheck';
import { sameSet } from '../../document/turnFixtures';
import { applyJoints } from './recipes';
import { findSites } from './sites';
import { defaultChoice } from './choose';
import { gateUnjoin } from './unjoin';
import { REFINE_MAX, plainForRefine, refineRefusal } from '../refine';
import { documentToDesign } from '../../document/refineDesign';

const SHELF = { x: 40.25, y: 10, z: 0 };
/**
 * A leg-and-rail side frame placed twice: left plain, right a mirrored copy far enough away not to touch.
 * With `extra`, a loose Shelf butts the RIGHT leg's inner face (x 58.25) end-on: right-half world x
 * [40.25, 58.25], clear of the left half (x <= 19.75).
 */
const pairDoc = (extra = false): SloydDocument => {
  const d = designToDocument({
    name: 'Pair',
    parts: extra ? [{ name: 'Shelf', role: '', material: 'pine', at: SHELF, size: { x: 18, y: 0.75, z: 1.75 } }] : [],
    assemblies: [{
      name: 'Side',
      parts: [
        { name: 'Leg', role: '', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 } },
        { name: 'Rail', role: '', material: 'pine', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3.5, z: 0.75 } },
      ],
      placements: [{ name: 'Left', at: { x: 0, y: 0, z: 0 } }, { name: 'Right', at: { x: 60, y: 0, z: 0 } }],
    }],
  }, { centre: false }).doc;
  return { ...d, instances: d.instances.map((i, k) => (k === 1 ? { ...i, mirrored: true } : i)) };
};
const join = (doc: SloydDocument) => {
  const flat = flatDocument(doc);
  const sites = findSites(flat);
  const joined = applyJoints(flat, sites, sites.map((s) => defaultChoice(s, flat, sites))).doc;
  return { flat, joined, out: writeBackFlat(doc, flat.boards, joined.boards) };
};
const solids = (bs: readonly Board[]) => bs.flatMap((b) => worldSolids(b).map((s) => [...s.min, ...s.max]));

describe('joinery on a mirrored pair (mirrored-instances spec §6)', () => {
  it('a mirror-symmetric pair joins as ONE shared definition, matching joinery\'s output, and passes the gate', () => {
    const { joined, out } = join(pairDoc());
    expect(joined.boards.some((b) => b.cuts.length > 0)).toBe(true);
    expect(out.definitions).toHaveLength(1);
    expect(sameSet(solids(worldParts(out)), solids(joined.boards))).toBe(true);
    expect('refused' in gateUnjoin(flatDocument(out))).toBe(false);
  });
  it('a part touching only the right half splits the definition; the world still matches', () => {
    const { joined, out } = join(pairDoc(true));
    expect(out.definitions.length).toBeGreaterThan(1);
    expect(sameSet(solids(worldParts(out)), solids(joined.boards))).toBe(true);
  });
  it('Refine refuses the JOINED pair for the mirror, through its real path (plainForRefine reads the joints back first)', () => {
    const joined = migrateDocument(join(pairDoc()).out);
    expect(flatDocument(joined).boards.some((b) => b.cuts.length > 0)).toBe(true);
    const base = plainForRefine(joined);
    if ('refused' in base) throw new Error(`the gate refused: ${base.refused.message}`);
    const r = documentToDesign(base.plain, REFINE_MAX);
    expect('refused' in r && r.refused.reason).toBe('mirrored');
    expect(refineRefusal(joined)).toBe("Refine can't describe a mirrored assembly yet — Ungroup the mirrored copy first.");
  });
});
