import { designToDocument } from '../../document/generated';
import { findTenons } from '../../document/tenons';
import { findSites } from './sites';
import { applyJoints } from './recipes';

it('recognises the tenon joinery actually builds', () => {
  const doc = designToDocument({ name: 'T', parts: [
    { name: 'Leg', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 } },
    { name: 'Rail', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3.5, z: 0.75 } },
  ] }).doc;
  const out = applyJoints(doc, findSites(doc), [{ site: 1, joint: 'mortise-tenon', tenonLength: 1 }]);
  const rail = out.doc.boards.find((b) => b.name === 'Rail')!;
  const t = findTenons(rail);
  expect(t).toHaveLength(1);
  expect(t[0]).toMatchObject({ end: 'min', length: 1, thickness: 0.25, width: 2.5 });
  expect([...t[0].cutIds].sort()).toEqual(rail.cuts.map((c) => c.id).sort());
});
