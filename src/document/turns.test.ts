import { boardCenter, boardEdges, boardSnapPoints, cutSnapPoints, solidWorldBox, pocketCells, pointToLocalXYZ } from './document';
import type { Posture, Rotation } from './document';
import { worldSolids } from './designCheck';
import { chiralPart, rotateQuarter, sameSet, turnedAbout } from './turnFixtures';

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
const C: [number, number, number] = [10, 0, -5];
const next = (r: Rotation) => ((r + 90) % 360) as Rotation;

/** World points of everything a site derives, for one part. */
const corners = (min: number[], max: number[]) => {
  const out: number[][] = [];
  for (const x of [min[0]!, max[0]!]) for (const y of [min[1]!, max[1]!]) for (const z of [min[2]!, max[2]!]) out.push([x, y, z]);
  return out;
};
const sites = {
  worldSolids: (b: ReturnType<typeof chiralPart>) => worldSolids(b).flatMap((s) => corners(s.min, s.max)),
  boardSnapPoints: (b: ReturnType<typeof chiralPart>) => boardSnapPoints(b).map((p) => [...p.at]),
  cutSnapPoints: (b: ReturnType<typeof chiralPart>) => cutSnapPoints(b).map((p) => [...p.at]),
  solidWorldBox: (b: ReturnType<typeof chiralPart>) => {
    const c = boardCenter(b);
    return pocketCells(b).flatMap((s) => {
      const { center, size } = solidWorldBox(b, s);
      const mid = [0, 1, 2].map((i) => c[i]! + center[i]!);
      return corners(mid.map((m, i) => m - size[i]! / 2), mid.map((m, i) => m + size[i]! / 2));
    });
  },
  edges: (b: ReturnType<typeof chiralPart>) => {
    const c = boardCenter(b);
    return boardEdges(b).flatMap(([p, q]) => [p, q].map((pt) => pointToLocalXYZ(b, pt).map((v, i) => c[i]! + v)));
  },
};

describe('quarter turns: every site rotates with the part (spec §7.1)', () => {
  for (const [name, derive] of Object.entries(sites)) {
    it(`${name}: turn r+90 is turn r rotated a quarter turn about the centre, in every posture`, () => {
      for (const posture of POSTURES) for (const r of TURNS) {
        const a = turnedAbout(chiralPart(posture), r, C);
        const b = turnedAbout(chiralPart(posture), next(r), C);
        const rotated = derive(a).map((p) => rotateQuarter(p as [number, number, number], C));
        expect(sameSet(rotated, derive(b))).toBe(true);
      }
    });
  }

  it('the fixture really is one-handed: its mirror is a different shape', () => {
    // Guards the fixture: the tests above can only see a reflection if the
    // part's mirror image differs from the part. With three cuts that is not
    // automatic (a symmetric set would reflect onto itself), so it is checked
    // here, on the whole part, rather than claimed of any one cut.
    const a = turnedAbout(chiralPart('flat'), 0, C);
    const mirrored = sites.worldSolids(a).map(([x, y, z]) => [2 * C[0] - x!, y!, z!]);
    expect(sameSet(mirrored, sites.worldSolids(a))).toBe(false);
  });
});
