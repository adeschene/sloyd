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
import { chiralCurved } from '../../document/turnFixtures';
import { chiralTwoSide } from '../../document/sweepFixtures';
import { localSegments, uvDims } from '../../document/curves';
import type { P2 } from '../../document/curves';
import { worldBox } from '../../document/designCheck';
import { GATE_TOLERANCE } from './unjoin';
import { endPos } from '../../document/profiles';
import { axisDimensions, boardExtents } from '../../document/geometry';
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

// Joinery-curves spec §7: a mirrored copy's curves and profile stations are lowered and re-anchored with the same
// numbers, so the waste stays where it was in world space through joinery.
const shape = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === 'number' ? 0 : v));
const numbers = (x: unknown, out: number[] = []): number[] => {
  if (typeof x === 'number') out.push(x);
  else if (x && typeof x === 'object') Object.values(x).forEach((v) => numbers(v, out));
  return out;
};

describe.each([['curved', chiralCurved], ['two-side', chiralTwoSide]] as const)('a mirrored copy keeps its %s waste through joinery', (_name, fixture) => {
  const rail = fixture('flat');
  const tenonDoc = (): SloydDocument => {
    // The Rail becomes the chiral fixture (20 x 6 x 1.5 flat: x 20, y 1.5, z 6) butting the Leg's inner face at its min end.
    const sized = designToDocument({
      name: 'Pair',
      parts: [],
      assemblies: [{
        name: 'Side',
        parts: [
          { name: 'Leg', role: '', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 7 } },
          { name: 'Rail', role: '', material: 'pine', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 20, y: 1.5, z: 6 } },
        ],
        placements: [{ name: 'Left', at: { x: 0, y: 0, z: 0 } }, { name: 'Right', at: { x: 60, y: 0, z: 0 } }],
      }],
    }, { centre: false }).doc;
    const dress = (b: Board): Board => (b.name === 'Rail' ? { ...b, curves: rail.curves, profiles: rail.profiles } : b);
    return {
      ...sized,
      definitions: sized.definitions.map((df) => ({ ...df, boards: (df.boards as Board[]).map(dress) })),
      instances: sized.instances.map((i, k) => (k === 1 ? { ...i, mirrored: true } : i)),
    };
  };
  const curvePoints = (b: Board): number[][] => b.curves.flatMap((c) => {
    const [u, v] = uvDims(c.through);
    const at = (p: P2) => worldBox(b, { length: [0, 0], width: [0, 0], thickness: [0, 0], [u]: [p[0], p[0]], [v]: [p[1], p[1]] }).min;
    return localSegments(b, c).flatMap((s) => [at(s.a), at(s.b)]);
  });
  /** Each station's world coordinate along the world axis its run dimension shows, in station order. */
  const stations = (b: Board): number[] => b.profiles.flatMap((p) => ('loop' in p.run ? [] : [p.run.start, p.run.end]).filter((e) => !('through' in e)).map((e) => {
    const dim = e.side.across === 'width' ? 'length' as const : 'width' as const;
    return worldBox(b, { length: [0, 0], width: [0, 0], thickness: [0, 0], [dim]: [endPos(b, e), endPos(b, e)] }).min[axisDimensions(b).indexOf(dim)];
  })).sort((x, y) => x - y);
  const rails = (doc: SloydDocument) => worldParts(doc).filter((b) => b.name.endsWith('Rail'));

  it('both copies keep their waste in world space', () => {
    const doc = tenonDoc();
    const flat = flatDocument(doc);
    const sites = findSites(flat);
    const choices = sites.filter((s) => flat.boards[s.enter].name.endsWith('Rail')).map((s) => ({ site: s.id, joint: 'mortise-tenon' as const, tenonLength: 1 }));
    expect(choices).toHaveLength(2);
    const joined = applyJoints(flat, sites, choices).doc;
    const out = migrateDocument(writeBackFlat(doc, flat.boards, joined.boards));
    const before = rails(doc); const after = rails(out);
    expect(before).toHaveLength(2);
    expect(after).toHaveLength(2);
    before.forEach((b, i) => {
      expect(after[i].length).toBe(b.length + 1);
      expect(after[i].curves.map((c) => c.id)).toEqual(b.curves.map((c) => c.id));
      expect(after[i].profiles.map((p) => p.id)).toEqual(b.profiles.map((p) => p.id));
      expect(stations(b)).toHaveLength(fixture === chiralTwoSide ? 2 : 0);
      stations(b).forEach((v, j) => expect(Math.abs(stations(after[i])[j] - v)).toBeLessThanOrEqual(GATE_TOLERANCE));
      const p = curvePoints(b); const q = curvePoints(after[i]);
      expect(q).toHaveLength(p.length);
      p.forEach((pt, j) => pt.forEach((v, a) => expect(Math.abs(q[j][a] - v), `rail ${i} point ${j}`).toBeLessThanOrEqual(GATE_TOLERANCE)));
    });
    // The lowered stored forms: the arch measured from the moving end moved by the tenon, everything else is the input's.
    const stored = out.definitions.flatMap((df) => df.boards as Board[]).filter((b) => b.name === 'Rail');
    for (const b of stored) {
      const arch = b.curves.find((c) => c.id === 'k1')!;
      const want = rail.curves.find((c) => c.id === 'k1')!;
      expect(Math.abs(arch.start[0] - (want.start[0] + 1))).toBeLessThanOrEqual(GATE_TOLERANCE);
      expect(b.curves.find((c) => c.id === 'k2')).toEqual(rail.curves.find((c) => c.id === 'k2'));
      // The profile's stored form too: only the station on the side that runs along the grown dimension (length) moved.
      expect(b.profiles.map((p) => p.id)).toEqual(rail.profiles.map((p) => p.id));
      rail.profiles.forEach((want, i) => {
        const got = b.profiles[i];
        const grown = (p: typeof want) => {
          if ('loop' in p.run) return p;
          const bump = (e: typeof p.run.start) => ('through' in e || e.side.across !== 'width' || e.from !== 'min' ? e : { ...e, at: e.at + 1 });
          return { ...p, run: { start: bump(p.run.start), end: bump(p.run.end) } };
        };
        expect(shape(got)).toBe(shape(grown(want)));
        const g = numbers(got); const w = numbers(grown(want));
        w.forEach((n, j) => expect(Math.abs(g[j] - n), `profile ${want.id}[${j}]`).toBeLessThanOrEqual(GATE_TOLERANCE));
      });
    }
  });
});

// Mirrored links (fu 432, spec §6.2): Generate links mirrored case sides as ONE Shape with the right side its MIRRORED
// user (pins on the inside faces, edging on the front edges: chiral, no turn links them). Joinery's write-back makes
// every shaped part plain and regroups; the regroup must keep the mirrored link when joinery cuts both sides alike, and
// split it (no plain part left flagged) when it cuts only one.
describe('joinery on a mirrored LINK (mirrored links, fu 432, spec §6.2)', () => {
  const pins = (face: '+x' | '-x', z: number) =>
    ({ face, diameter: 0.25, depth: 0.375, through: false, offset: { x: face === '+x' ? 0.75 : 0, y: 10, z }, toward: '+y' as const, count: 9, pitch: 1.25 });
  const side = (name: string, x: number, inside: '+x' | '-x') =>
    ({ name, role: 'side', material: 'oak', at: { x, y: 0, z: 0 }, size: { x: 0.75, y: 30, z: 12 },
      holes: [pins(inside, 2), pins(inside, 10)], bands: [{ edge: '-z' as const, edging: 'veneer' as const }] });
  /** Sides at x 0 and 20; a shelf between them (full width: both sides housed) or reaching only the left side. */
  const caseDoc = (shelf: 'both' | 'left'): SloydDocument => designToDocument({
    name: 'Case',
    parts: [
      side('Side L', 0, '+x'), side('Side R', 20, '-x'),
      { name: 'Shelf', role: '', material: 'oak', at: { x: 0.75, y: 5, z: 1 }, size: { x: shelf === 'both' ? 19.25 : 12, y: 0.75, z: 9 } },
    ],
    assemblies: [],
  }, { centre: false }).doc;
  const stored = (doc: SloydDocument) => [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)];
  const sides = (bs: readonly Board[]) => bs.filter((b) => b.name.startsWith('Side'));
  /** A part's features as compared: everything but ids (joinery mints cut ids; the regroup takes its founder's). */
  const features = (b: Board) => JSON.stringify({
    box: boardExtents(b), at: b.position, rotation: b.rotation,
    cuts: b.cuts.map(({ id: _id, ...c }) => c), angleCuts: b.angleCuts, holes: b.holes.map(({ id: _id, ...r }) => r), bands: b.bands,
  });

  it('a shelf housed in BOTH sides keeps ONE Shape, the right side still its mirrored user; worlds are joinery\'s output', () => {
    const doc = caseDoc('both');
    expect(stored(doc).filter((b) => 'shape' in b).map((b) => [b.name, b.mirrored === true])).toEqual([['Side L', false], ['Side R', true]]);
    const { joined, out } = join(doc);
    expect(sides(joined.boards).every((b) => b.cuts.length === 1)).toBe(true);   // joinery cut both sides
    const after = migrateDocument(out);
    expect(after.shapes).toHaveLength(1);
    expect(stored(after).filter((b) => 'shape' in b).map((b) => [b.name, b.mirrored === true])).toEqual([['Side L', false], ['Side R', true]]);
    expect(sides(worldParts(after)).map(features)).toEqual(sides(joined.boards).map(features));
    expect(sameSet(solids(worldParts(after)), solids(joined.boards))).toBe(true);
    expect('refused' in gateUnjoin(flatDocument(after))).toBe(false);
  });

  it('a shelf housed in ONE side splits the link: worlds are joinery\'s output, no plain part keeps the flag', () => {
    const { joined, out } = join(caseDoc('left'));
    expect(sides(joined.boards).map((b) => b.cuts.length)).toEqual([1, 0]);
    const after = migrateDocument(out);
    expect(after.shapes).toHaveLength(0);
    expect(stored(after).some((b) => 'mirrored' in b || 'shape' in b)).toBe(false);
    expect(sides(worldParts(after)).map(features)).toEqual(sides(joined.boards).map(features));
  });
});
