import { describe, expect, it } from 'vitest';
import { HOLE_EPS, holeInstances, mm } from './holes';
import type { Hole } from './holes';
import { camPairRows, camPartners, camRole, camRowIds } from './camBolt';
import { BOLT, CAM, camPart } from './camBoltFixtures';
import type { HoleRow } from './types';

const holesOf = (rows: HoleRow[]): Hole[] => {
  const b = camPart();
  return rows.flatMap((r) => holeInstances(b, r));
};
const pairs = (cam: Partial<HoleRow> = {}, bolt: Partial<HoleRow> = {}) =>
  camPartners(holesOf([{ ...CAM, ...cam }, { ...BOLT, ...bolt }]));

describe('camPartners', () => {
  it('the fixture is two pairs', () => {
    const hs = holesOf([CAM, BOLT]);
    const m = camPartners(hs);
    expect(m.size).toBe(4);
    for (let k = 0; k < 2; k += 1) {
      expect(m.get(hs[k]!)).toBe(hs[2 + k]);
      expect(m.get(hs[2 + k]!)).toBe(hs[k]);
    }
  });
  it('camPairRows names the whole pair', () => {
    const b = camPart();
    expect(camPairRows(b)).toEqual([{ cam: CAM, bolt: BOLT }]);
    expect([...camRowIds(b)].sort()).toEqual(['bolt', 'cam']);
    expect(camRowIds(b)).toBe(camRowIds(b));
  });
  it('camRowIds keys on the board size, not only the holes array', () => {
    const a = camPart();
    const thin = camPart({ thickness: 0.5, holes: a.holes });
    expect(thin.holes).toBe(a.holes);
    expect([...camRowIds(a)].sort()).toEqual(['bolt', 'cam']);
    expect(camRowIds(thin).size).toBe(0);
  });
  it('camRole: the face bore is the cam', () => {
    const [c, e] = [holesOf([CAM])[0]!, holesOf([BOLT])[0]!];
    expect(camRole(c, e)).toBe('cam');
    expect(camRole(e, c)).toBe('bolt');
  });
  it('clause 1: tilted, headed, through do not pair', () => {
    expect(pairs({}, { tiltAlong: 0.01 }).size).toBe(0);
    expect(pairs({ head: 'counterbore', headDiameter: mm(20), headDepth: mm(3) }).size).toBe(0);
    expect(pairs({ depth: 'through' }).size).toBe(0);
    expect(pairs({}, { depth: 'through' }).size).toBe(0);
  });
  it('clause 2: parallel axes do not pair', () => {
    expect(pairs({}, { face: 'thickness', from: 'min', along: 'width', acrossFrom: 'min', inset: mm(24) }).size).toBe(0);
  });
  it('clause 3: the axes must meet', () => {
    expect(pairs({}, { station: BOLT.station + 1e-6 }).size).toBe(0);
    expect(pairs({}, { station: BOLT.station + 1e-10 }).size).toBe(4);
  });
  it('clause 4: the bolt must be strictly inside the cam depth', () => {
    expect(pairs({ depth: 0.375 + mm(4) }).size).toBe(0);
    expect(pairs({ depth: 0.375 + mm(4) + 1e-6 }).size).toBe(4);
    // mouth side: bolt reaching the mouth plane
    expect(pairs({}, { inset: 0.75 - mm(4) }).size).toBe(0);
  });
  it('clause 5: the bolt must be narrower', () => {
    expect(pairs({}, { diameter: CAM.diameter }).size).toBe(0);
  });
  it('clause 6, bottom: the bolt must end in the cam air', () => {
    const far = Math.sqrt(mm(7.5) ** 2 - mm(4) ** 2);
    expect(pairs({}, { depth: mm(24) + far }).size).toBe(0);
    expect(pairs({}, { depth: mm(24) - far }).size).toBe(0);
    expect(pairs({}, { depth: mm(24) + mm(3) }).size).toBe(4);
  });
  it('clause 6, mouth: the cam touching the end face does not pair', () => {
    expect(pairs({ inset: mm(7.5) }).size).toBe(0);
    // bottom in the air (s = 0) but the mouth exactly on the cam's wall
    expect(pairs({ inset: mm(7.5) }, { depth: mm(7.5) }).size).toBe(0);
    expect(pairs({ inset: mm(7.5) + 1e-6 }, { depth: mm(7.5) + 1e-6 }).size).toBe(4); // twin: clear of the end face
  });
  it('clause 7: a hole in two candidates pairs with neither', () => {
    const other: HoleRow = { ...BOLT, id: 'bolt2', from: 'max', depth: mm(24) };
    const m = camPartners(holesOf([CAM, BOLT, other]));
    // other enters from the far end, 30in away: not a candidate; the cam still pairs with BOLT
    expect(m.size).toBe(4);
    const near: HoleRow = { ...BOLT, id: 'bolt2', from: 'min' };
    expect(camPartners(holesOf([CAM, BOLT, near])).size).toBe(0);
    // far end, reaching each cam
    const reaching: HoleRow = { ...BOLT, id: 'bolt2', from: 'max', depth: 30 - mm(24) };
    expect(camPartners(holesOf([CAM, BOLT, reaching])).size).toBe(0);
  });
  it('a shorter bolt that stops in the wood does not pair', () => {
    expect(pairs({}, { depth: mm(15) }).size).toBe(0);
  });
  it('HOLE_EPS is the shared tolerance', () => { expect(HOLE_EPS).toBe(1e-9); });
});
