import { describe, expect, it } from 'vitest';
import { designToDocument } from '../../document/generated';
import { createBoard, flatDocument } from '../../document/document';
import type { Board, CutFrom, FlatDocument, HoleRow, Posture, Rotation } from '../../document/document';
import { worldBox } from '../../document/designCheck';
import { acrossOf, holeInstances } from '../../document/holes';
import { axisDimensions, boardExtents, endFacing } from '../../document/geometry';
import { findSites } from './sites';
import { applyJoints, rebaseHoles } from './recipes';
import type { JointChoice } from './recipes';
import { GATE_TOLERANCE, gateUnjoin, readJoints } from './unjoin';

// Joinery-holes spec §4.1 and §4.5: a hole row's numbers measured from a grown or trimmed end shift with it, and
// readJoints' resizeAt is the exact inverse.

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
const flip = (e: CutFrom): CutFrom => (e === 'min' ? 'max' : 'min');

const row = (r: Partial<HoleRow> & Pick<HoleRow, 'id' | 'face' | 'along' | 'alongFrom' | 'acrossFrom'>): HoleRow =>
  ({ from: 'min', diameter: 0.25, depth: 0.25, station: 2, count: 1, pitch: 0, inset: 0.5, ...r });

/** Every hole's world centre, through the one hole mapping and the one local-to-world mapping. */
const centres = (b: Board, rows: HoleRow[] = b.holes): Map<string, number[]> => {
  const out = new Map<string, number[]>();
  for (const r of rows) for (const h of holeInstances(b, r)) {
    const [l, w, t] = h.centre;
    out.set(`${r.id}/${h.index}`, worldBox(b, { length: [l, l], width: [w, w], thickness: [t, t] }).min);
  }
  return out;
};
const expectSame = (a: Map<string, number[]>, b: Map<string, number[]>) => {
  expect([...b.keys()]).toEqual([...a.keys()]);
  for (const [key, p] of a) p.forEach((v, i) => expect(Math.abs(b.get(key)![i] - v), key).toBeLessThan(1e-12));
};

/**
 * A rail in the given pose whose +k end butts a big leg, so the rail is the entering part of a mortise and tenon at its
 * `side` = 1 end. The leg is a flat, unturned block larger than the rail's cross-section.
 */
function railAndLeg(posture: Posture, rotation: Rotation, holes: HoleRow[]): { doc: FlatDocument; k: number; end: CutFrom } {
  const rail = createBoard({ name: 'Rail', length: 18, width: 3.5, thickness: 0.75, posture, rotation, holes });
  const k = axisDimensions(rail).indexOf('length');
  const re = boardExtents(rail);
  // A leg whose own length does not run along k, or the pair is two ends meeting and not a site.
  const leg = createBoard({ name: 'Leg', length: 1, width: 1, thickness: 1, posture: k === 1 ? 'flat' : 'upright' });
  const dims = axisDimensions(leg);
  const sizes = [0, 1, 2].map((a) => (a === k ? 1.75 : re[a] + 4));
  dims.forEach((d, a) => { leg[d] = sizes[a]; });
  // The leg sits on the floor and the rail inside its cross-section, so the re-ground lowers nothing.
  rail.position = [0, 0, 0];
  leg.position = [0, 0, 0];
  leg.position[k] = re[k];
  for (let a = 0; a < 3; a++) if (a !== k) rail.position[a] = 2;
  const base = flatDocument(designToDocument({ name: 'T', parts: [{ name: 'P', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } }] }).doc);
  return { doc: { ...base, boards: [leg, rail] }, k, end: endFacing(rail, k, 1) };
}
const tenon = (doc: FlatDocument, L = 1) => {
  const sites = findSites(doc);
  const site = sites.find((s) => doc.boards[s.enter].name === 'Rail');
  if (!site) throw new Error('no site');
  const choices: JointChoice[] = [{ site: site.id, joint: 'mortise-tenon', tenonLength: L }];
  return applyJoints(doc, sites, choices);
};
const railOf = (doc: FlatDocument) => doc.boards.find((b) => b.name === 'Rail')!;

describe.each(POSTURES.flatMap((p) => TURNS.map((r) => [p, r] as const)))('growth, %s turn %s', (posture, rotation) => {
  const make = (end: CutFrom) => [
    row({ id: 'st', face: 'thickness', along: 'length', alongFrom: end, acrossFrom: 'min', station: 2, count: 3, pitch: 1.5 }),
    row({ id: 'in', face: 'thickness', along: 'width', alongFrom: 'min', acrossFrom: end, inset: 3 }),
    row({ id: 'far', face: 'thickness', along: 'length', alongFrom: flip(end), acrossFrom: 'min', station: 2.5 }),
  ];
  const { end } = railAndLeg(posture, rotation, []);
  const holed = railAndLeg(posture, rotation, make(end)).doc;
  const out = tenon(holed, 1);
  const before = railOf(holed);
  const after = railOf(out.doc);

  it('a hole measured from the growing end stays put in world space', () => {
    expect(after.length).toBe(19);
    expectSame(centres(before), centres(after));
    expect(after.holes.find((r) => r.id === 'st')!.station).toBe(3);
    expect(after.holes.find((r) => r.id === 'in')!.inset).toBe(4);
  });

  it('a hole measured from the far end is untouched', () => {
    expect(after.holes[2]).toEqual(before.holes[2]);
    // Identity (applyJoints clones its input, so it is rebaseHoles itself that must keep the object).
    const b = structuredClone(before);
    const kept = [...b.holes];
    rebaseHoles(b, 'length', end, 1);
    expect(b.holes[2]).toBe(kept[2]);
    expect(b.holes[0]).not.toBe(kept[0]);
    expect(acrossOf(b.holes[1])).toBe('length');
  });

  it('a joined part keeps every hole row', () => {
    expect(after.holes.map((r) => r.id)).toEqual(['st', 'in', 'far']);
  });

  it('resize then resizeAt restores every number within GATE_TOLERANCE', () => {
    const back = readJoints(out.doc);
    if ('refused' in back) throw new Error(back.refused);
    const plain = back.plain.find((b) => b.name === 'Rail')!;
    expect(plain.length).toBe(18);
    expect(plain.holes.map((r) => r.id)).toEqual(before.holes.map((r) => r.id));
    plain.holes.forEach((r, i) => {
      for (const f of ['station', 'inset', 'pitch'] as const) expect(Math.abs(r[f] - before.holes[i][f]), `${r.id}.${f}`).toBeLessThanOrEqual(GATE_TOLERANCE);
    });
  });
});

describe('a metric station', () => {
  it('round-trips within tolerance', () => {
    const x = 127 / 25.4; // 5 in, stored unrounded
    const { end } = railAndLeg('flat', 0, []);
    const holed = railAndLeg('flat', 0, [row({ id: 'm', face: 'thickness', along: 'length', alongFrom: 'min', acrossFrom: 'min', station: x })]);
    holed.doc.boards[1].holes = [{ ...holed.doc.boards[1].holes[0], alongFrom: holed.end }];
    expect(end).toBe(holed.end);
    const out = tenon(holed.doc, 1.25);
    const back = readJoints(out.doc);
    if ('refused' in back) throw new Error(back.refused);
    const got = back.plain.find((b) => b.name === 'Rail')!.holes[0].station;
    // Recorded: the read-back was bitwise equal to 127 / 25.4 for this tenon (L = 1.25). The tolerance is what is pinned.
    expect(Math.abs(got - x)).toBeLessThanOrEqual(GATE_TOLERANCE);
    expect('refused' in gateUnjoin(out.doc)).toBe(false);
  });
});

describe('a trim (rabbet)', () => {
  /** The bookcase of recipes.test.ts, its Shelf turned and given hole rows built from the end the Back trims. */
  const bookcase = (rotation: Rotation) => {
    const doc = flatDocument(designToDocument({
      name: 'T',
      parts: [
        { name: 'Left', at: { x: 0, y: 0, z: 0 }, size: { x: 0.75, y: 30, z: 11.25 } },
        { name: 'Right', at: { x: 20.75, y: 0, z: 0 }, size: { x: 0.75, y: 30, z: 11.25 } },
        { name: 'Shelf', at: { x: 0.75, y: 12, z: 0 }, size: { x: 20, y: 0.75, z: 11.25 } },
        { name: 'Back', at: { x: 0, y: 0, z: 11.25 }, size: { x: 21.5, y: 30, z: 0.25 } },
      ].map((p) => ({ ...p, material: 'oak' })),
    }).doc);
    const shelf = doc.boards.find((b) => b.name === 'Shelf')!;
    shelf.rotation = rotation;
    const d = axisDimensions(shelf)[2]; // the dimension the Back's trim shortens
    const e = endFacing(shelf, 2, 1); // the shelf's end toward the Back
    const other = d === 'length' ? 'width' : 'length';
    shelf.holes = [
      row({ id: 'st', face: 'thickness', along: d, alongFrom: e, acrossFrom: 'min', station: 2, count: 2, pitch: 1.5 }),
      row({ id: 'in', face: 'thickness', along: other, alongFrom: 'min', acrossFrom: e, inset: 2 }),
      row({ id: 'far', face: 'thickness', along: d, alongFrom: flip(e), acrossFrom: 'min', station: 2 }),
    ];
    return { doc, shelf };
  };
  const rabbet = (doc: FlatDocument) => {
    const sites = findSites(doc);
    return applyJoints(doc, sites, sites.filter((s) => s.kind === 'face-against-edge').map((s): JointChoice => ({ site: s.id, joint: 'rabbet', depth: 0.375 })));
  };

  it.each([0, 180] as Rotation[])('a hole measured from the trimmed end stays put, a far one is untouched (turn %s)', (rotation) => {
    const { doc, shelf } = bookcase(rotation);
    const out = rabbet(doc);
    expect(out.trimmed).toContain('Shelf');
    const after = out.doc.boards.find((b) => b.name === 'Shelf')!;
    expect(after.holes.map((r) => r.id)).toEqual(['st', 'in', 'far']);
    expect(after.holes.find((r) => r.id === 'st')!.station).toBe(1.75);
    expect(after.holes.find((r) => r.id === 'in')!.inset).toBe(1.75);
    expectSame(centres(shelf), centres(after));
    expect(after.holes[2]).toEqual(shelf.holes[2]);
    const back = readJoints(out.doc);
    if ('refused' in back) throw new Error(back.refused);
    const plain = back.plain.find((b) => b.name === 'Shelf')!;
    expect(plain.holes.map((r) => r.id)).toEqual(['st', 'in', 'far']);
    plain.holes.forEach((r, i) => {
      for (const f of ['station', 'inset'] as const) expect(Math.abs(r[f] - shelf.holes[i][f]), `${r.id}.${f}`).toBeLessThanOrEqual(GATE_TOLERANCE);
    });
  });
});
