import { describe, expect, it } from 'vitest';
import { designToDocument, parseDesign } from '../../document/generated';
import { chamferCut, depthAt, flatDocument, migrateDocument, miterCut, taperCut, worldParts, writeBackFlat, zeroStation } from '../../document/document';
import { SHAKER_TABLE_JSON } from '../../document/shakerTableFixture';
import type { AngleCut, Board, FlatDocument, SloydDocument } from '../../document/document';
import { axisDimensions, axisFrame, boardCenter, endFacing, toWorldOffset } from '../../document/geometry';
import { worldTapers } from '../../document/taperWorld';
import { formatLength } from '../../units/length';
import { findSites } from './sites';
import { angleConflicts, joineryRefusal, taperConflicts, jointFaults } from './tapers';
import { taperJointRefusal } from '../../document/angledRefusal';
import { checkDesign } from '../../document/designCheck';
import { applyJoints, rebaseAngleCuts } from './recipes';
import { gateUnjoin } from './unjoin';
import { defaultChoice } from './choose';

type P = { name: string; at: [number, number, number]; size: [number, number, number] };
const design = (...parts: P[]) => flatDocument(designToDocument({
  name: 'T',
  parts: parts.map((p) => ({ name: p.name, material: 'oak', at: { x: p.at[0], y: p.at[1], z: p.at[2] }, size: { x: p.size[0], y: p.size[1], z: p.size[2] } })),
}).doc);
// The runJoinery suite's corner: a leg with rails into its +X and +Z faces, 23.5in to 26.5in up.
const CORNER = design(
  { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
  { name: 'Rail X', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] },
  { name: 'Rail Z', at: [0.5, 23.5, 1.75], size: [0.75, 3, 18] },
);
const face = (b: Board, axis: 0 | 2, side: -1 | 1, start: number, toward: -1 | 1 = -1): AngleCut => ({
  id: `t${axis}${side}${toward}`,
  ...taperCut({ face: axisFrame(b)[axis]!.dim as 'width' | 'thickness', from: endFacing(b, axis, side), end: endFacing(b, 1, toward), start, amount: 0.375 }),
});
const withLeg = (doc: FlatDocument, cuts: (b: Board) => AngleCut[], patch: Partial<Board> = {}): FlatDocument =>
  ({ ...doc, boards: doc.boards.map((b) => (b.name === 'Leg' ? { ...b, ...patch, angleCuts: cuts({ ...b, ...patch }) } : b)) });
const conflicts = (doc: FlatDocument) => taperConflicts(doc, findSites(doc));
const atY = (doc: FlatDocument, y: (b: Board) => number): FlatDocument =>
  ({ ...doc, boards: doc.boards.map((b) => ({ ...b, position: [b.position[0], y(b), b.position[2]] as Board['position'] })) });
const inside = (start: number) => (b: Board) => [face(b, 0, 1, start), face(b, 2, 1, start)];
/** `name` moved by `dz` on Z (the fixture is centred by designToDocument, so moves are relative). */
const shiftZ = (doc: FlatDocument, name: string, dz: number): FlatDocument =>
  ({ ...doc, boards: doc.boards.map((b) => (b.name === name ? { ...b, position: [b.position[0], b.position[1], b.position[2] + dz] as Board['position'] } : b)) });

describe('taperConflicts (AI-tapers spec §4.1)', () => {
  it('none for an untapered piece', () => {
    expect(conflicts(CORNER)).toEqual([]);
  });
  it('none when the taper starts below the joint — the start itself is allowed', () => {
    expect(conflicts(withLeg(CORNER, inside(22)))).toEqual([]);
    expect(conflicts(withLeg(CORNER, inside(23.5)))).toEqual([]);
  });
  it('a start exactly at a computed, non-dyadic patch station is allowed (float noise only)', () => {
    // Leg at y 0.1, rails at y 2.3: the patch station is 2.3 - 0.1, which is NOT exactly 2.2 in floating point.
    expect(2.3 - 0.1).not.toBe(2.2);
    const lifted: FlatDocument = {
      ...CORNER,
      boards: CORNER.boards.map((b) => ({ ...b, position: [b.position[0], b.name === 'Leg' ? 0.1 : 2.3, b.position[2]] as Board['position'] })),
    };
    expect(conflicts(withLeg(lifted, inside(2.2)))).toEqual([]);
    expect(conflicts(withLeg(lifted, inside(2.21)))).toHaveLength(1);
  });
  it('one conflict per tapered part, at the patch nearest the thin end', () => {
    const leg = CORNER.boards.findIndex((b) => b.name === 'Leg');
    const out = conflicts(withLeg(CORNER, inside(24)));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ part: leg, end: endFacing(CORNER.boards[leg]!, 1, -1), nearest: 23.5 });
  });
  it('of several joints on one tapered part, the one nearest the thin end is reported', () => {
    const doc = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Rail X', at: [1.75, 23.5, 0.5], size: [18, 3, 0.75] },
      { name: 'Stretcher', at: [1.75, 10, 0.5], size: [18, 3, 0.75] },
    );
    const out = conflicts(withLeg(doc, inside(24)));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ other: doc.boards.findIndex((b) => b.name === 'Stretcher'), nearest: 10 });
  });
  it('a taper on a face no rail touches still conflicts: the mortise runs toward it', () => {
    expect(conflicts(withLeg(CORNER, (b) => [face(b, 0, -1, 24)]))).toHaveLength(1);
  });
  it('a taper toward the top conflicts from the top end', () => {
    const out = conflicts(withLeg(CORNER, (b) => [face(b, 0, 1, 2, 1)]));   // square below 26
    expect(out).toHaveLength(1);
    expect(out[0]!.nearest).toBeCloseTo(28 - 26.5, 12);
  });
  it('a turned leg: each face() names its local face through the turn, and the same world rails meet the same stations', () => {
    const turned = withLeg(CORNER, inside(24), { rotation: 180 });
    expect(conflicts(turned)).toHaveLength(1);
    expect(conflicts(withLeg(CORNER, inside(22), { rotation: 180 }))).toEqual([]);
  });
  it('a joint ON the thin end conflicts with nearest 0', () => {
    // A leg standing in a base: its floor end enters the base's top face.
    const doc = design(
      { name: 'Base', at: [-4, 0, -4], size: [10, 1, 10] },
      { name: 'Leg', at: [0, 1, 0], size: [1.75, 28, 1.75] },
    );
    const out = conflicts(withLeg(doc, (b) => [face(b, 0, 1, 20)]));
    expect(out).toHaveLength(1);
    expect(out[0]!.nearest).toBe(0);
    // The far end: a taper toward the top, the joint on the floor end — square wood there, no conflict.
    expect(conflicts(withLeg(doc, (b) => [face(b, 0, 1, 20, 1)]))).toEqual([]);
  });
  it('a joint ON the top end is judged from that end', () => {
    // A leg under a top: its top end enters the top's underside. Pins which end faces the joint
    // (a station of 0 for every end-joint would miss both of these).
    const doc = design(
      { name: 'Leg', at: [0, 0, 0], size: [1.75, 28, 1.75] },
      { name: 'Top', at: [-4, 28, -4], size: [10, 1, 10] },
    );
    const tapered = withLeg(doc, (b) => [face(b, 0, 1, 20, 1)]);
    const up = conflicts(tapered);
    expect(up).toHaveLength(1);
    expect(up[0]!.nearest).toBe(0);
    expect(taperJointRefusal(tapered, up)).toBe("Leg's taper runs to the length max end, where it joins Top — taper the other end, or remove it.");
    expect(conflicts(withLeg(doc, (b) => [face(b, 0, 1, 20)]))).toEqual([]);
  });
  it('a part turned end for end maps the patch through the turn table (a reversed length axis)', () => {
    // A stretcher along X receiving a rail 2in from its world -X end; tapered toward that end, starting at 5.
    const doc = design(
      { name: 'Stretcher', at: [0, 0, 0], size: [30, 3, 0.75] },
      { name: 'Rail', at: [2, 0, 0.75], size: [0.75, 3, 10] },
    );
    const i = doc.boards.findIndex((b) => b.name === 'Stretcher');
    const tapered = (rotation: Board['rotation']): FlatDocument => ({
      ...doc,
      boards: doc.boards.map((b, k) => {
        if (k !== i) return b;
        const t = { ...b, rotation };
        const L = axisFrame(t).findIndex((a) => a.dim === 'length');
        const across = axisFrame(t).findIndex((a, j) => j !== L && a.dim !== 'length');
        return { ...t, angleCuts: [{ id: 't', ...taperCut({ face: axisFrame(t)[across]!.dim as 'width' | 'thickness', from: endFacing(t, across, 1), end: endFacing(t, L, -1), start: 5, amount: 0.375 }) }] };
      }),
    });
    for (const rotation of [0, 180] as const) {
      expect(axisFrame(tapered(rotation).boards[i]!)[0]).toEqual({ dim: 'length', reversed: rotation === 180 });
      const out = conflicts(tapered(rotation));
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ part: i, nearest: 2 });
    }
  });
});

describe('taperJointRefusal / joineryRefusal', () => {
  it('names the part, the joint and where to start', () => {
    const doc = withLeg(CORNER, inside(24));
    const msg = taperJointRefusal(doc, conflicts(doc))!;
    expect(msg).toContain('Leg');
    expect(msg).toContain(`start it at ${formatLength(23.5, doc.units.precision)} or less from the length`);
  });
  it('an off-grid patch is floored to the display grid, and the advice it prints is accepted', () => {
    // Rails at y 23.47: rounding to the nearest 1/16 would print 23-1/2", above the real limit.
    // (designToDocument snaps to the grid, so the rails are moved off it by hand.)
    const off = atY(CORNER, (b) => (b.name === 'Leg' ? 0 : 23.47));
    expect(off.boards.find((b) => b.name === 'Rail X')!.position[1]).toBe(23.47);
    expect(off.units.precision).toBe(16);
    const doc = withLeg(off, inside(24));
    expect(taperJointRefusal(doc, conflicts(doc))).toContain('start it at 23-7/16" or less from the length');
    // Following the advice: a start of exactly 23-7/16 refuses nothing.
    expect(conflicts(withLeg(off, inside(23 + 7 / 16)))).toEqual([]);
    expect(joineryRefusal(withLeg(off, inside(23 + 7 / 16)))).toBeNull();
  });
  it('a patch within one tick of the thin end reads as joining at that end, never "start it at 0"', () => {
    const near = atY(CORNER, (b) => (b.name === 'Leg' ? 0 : 0.05));
    const doc = withLeg(near, inside(24));
    const out = conflicts(doc);
    expect(out).toHaveLength(1);
    expect(out[0]!.nearest).toBeCloseTo(0.05, 12);
    expect(taperJointRefusal(doc, out)).toBe("Leg's taper runs to the length min end, where it joins Rail X — taper the other end, or remove it.");
  });
  it('the decider: one sentence per part, a taper conflict wins on its part, else null (AI-angles spec §3)', () => {
    expect(joineryRefusal(CORNER)).toBeNull();
    expect(joineryRefusal(withLeg(CORNER, inside(22)))).toBeNull();
    expect(joineryRefusal(withLeg(CORNER, inside(24)))).toContain('taper runs into its joint');
    const mitered: FlatDocument = { ...CORNER, boards: CORNER.boards.map((b) => (b.name === 'Rail X'
      ? { ...b, angleCuts: [{ id: 'm', ...miterCut({ end: endFacing(b, 0, -1), across: 'thickness', longSide: endFacing(b, 2, -1), ratio: 1 }, b) }] } : b)) };
    expect(joineryRefusal(mitered)).toBe("Rail X's miter runs into its joint with Leg — add joinery before cutting it, or remove it.");
    // A miter-kind cut that removes nothing is fine.
    expect(joineryRefusal(withLeg(CORNER, (b) => [{ ...face(b, 2, -1, 24), kind: 'miter', points: [[0, -1], [1, -2]] }]))).toBeNull();
    // A taper (on the leg) and a miter (on the rail): two sentences, in part order.
    const both: FlatDocument = { ...mitered, boards: mitered.boards.map((b) => (b.name === 'Leg' ? { ...b, angleCuts: inside(24)(b) } : b)) };
    const text = joineryRefusal(both)!;
    expect(text.indexOf("Leg's taper")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Rail X's miter")).toBeGreaterThan(text.indexOf("Leg's taper"));
    // A taper conflict and a chamfer conflict on the SAME part: the taper's sentence only.
    const legChamfer = (b: Board): AngleCut => {
      const p = { dim: axisFrame(b)[0]!.dim, from: endFacing(b, 0, 1) };
      const q = { dim: axisFrame(b)[2]!.dim, from: endFacing(b, 2, -1) };
      const order = ['length', 'width', 'thickness'];
      const [f, g] = order.indexOf(p.dim) < order.indexOf(q.dim) ? [p, q] : [q, p];
      return { id: 'k', ...chamferCut({ face: f.dim, from: f.from, along: g.dim, alongFrom: g.from, legFace: 0.75, legAlong: 0.75 }, b) };
    };
    const legBoth = withLeg(CORNER, (b) => [...inside(24)(b), legChamfer(b)]);
    expect(angleConflicts(legBoth, findSites(legBoth))).toHaveLength(1);
    expect(joineryRefusal(legBoth)).toBe(joineryRefusal(withLeg(CORNER, inside(24))));
  });
});

describe('jointFaults \u2014 the fault on designs (spec 5.3)', () => {
  const part = (name: string, at: number[], size: number[], tapers: unknown[] = []) =>
    ({ name, role: '', material: 'oak', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] }, tapers, miters: [], bevels: [], chamfers: [] });
  const build = (parts: unknown[], opts?: { exact: Set<number> }) =>
    flatDocument(designToDocument(parseDesign({ name: 'T', assemblies: [], parts })!, opts).doc);
  const corner = (start: number, railY = 23.5) => build([
    part('Leg', [0, 0, 0], [1.75, 28, 1.75], [{ faces: ['+x', '+z'], toward: '-y', start, amount: 0.375 }]),
    part('Rail X', [1.75, railY, 0.5], [18, 3, 0.75]),
  ]);

  it('reports one angle-joint fault naming both parts, in world words', () => {
    const v = jointFaults(corner(24));
    expect(v).toHaveLength(1);
    expect(v[0]!.kind).toBe('angle-joint');
    expect([...v[0]!.parts].sort()).toEqual(['Leg', 'Rail X']);
    expect(v[0]!.message).toBe("Leg's taper toward -y runs into where it meets Rail X (a joint goes there) \u2014 start it 23.5in or less from its -y end, or remove it.");
  });
  it('allows start exactly at the meeting', () => {
    expect(jointFaults(corner(23.5))).toEqual([]);
  });
  it('floors the advice to 1/16, and following it passes (snapped start)', () => {
    // The rail sits at 22.47: exact in the design (no snap) so the meeting is off-grid.
    const at = 22.47;
    const opts = { exact: new Set([at]) };
    const flat = build([
      part('Leg', [0, 0, 0], [1.75, 28, 1.75], [{ faces: ['+x'], toward: '-y', start: 24, amount: 0.375 }]),
      part('Rail X', [1.75, at, 0.5], [18, 3, 0.75]),
    ], opts);
    const [v] = jointFaults(flat);
    expect(v!.message).toContain('start it 22.4375in or less');
    const fixed = build([
      part('Leg', [0, 0, 0], [1.75, 28, 1.75], [{ faces: ['+x'], toward: '-y', start: 22.4375, amount: 0.375 }]),
      part('Rail X', [1.75, at, 0.5], [18, 3, 0.75]),
    ], opts);
    expect(jointFaults(fixed)).toEqual([]);
  });
  it('a meeting at the thin end advises tapering the other end', () => {
    const flat = build([
      part('Leg', [0, 1, 0], [1.75, 28, 1.75], [{ faces: ['+x'], toward: '-y', start: 10, amount: 0.375 }]),
      part('Foot', [-1, 0, -1], [4, 1, 4]),
    ]);
    expect(jointFaults(flat)[0]!.message).toBe("Leg's taper toward -y runs to its -y end, where it meets Foot (a joint goes there) \u2014 taper the other end, or remove the taper.");
  });
});

describe('the headline flow: a Shaker table with tapered legs, generated and joined (AI-tapers chunk 2)', () => {
  // The design json is shared with Refine's round trip: ../../document/shakerTableFixture.ts.
  const json = SHAKER_TABLE_JSON;
  const limits = { width: null, depth: null, height: null, maxParts: 10 };
  const legs = (d: FlatDocument) => d.boards.filter((b) => b.name.startsWith('Leg'));

  it('converts, checks clean, and joins with mortise-and-tenons that leave every taper alone', () => {
    const design = parseDesign(json);
    if (!design) throw new Error('the design does not parse');
    const made = designToDocument(design, { centre: false });
    expect(made.rejected).toEqual([]);
    // fu 301: the four inside-tapered legs are one component (turned links).
    const legShapes = new Set(made.doc.boards.filter((b) => b.name.startsWith('Leg')).map((b) => ('shape' in b ? b.shape : undefined)));
    expect(legShapes.size).toBe(1);
    expect([...legShapes][0]).toBeDefined();
    const flat = flatDocument(made.doc);
    expect(legs(flat).map((b) => b.angleCuts.length)).toEqual([2, 2, 2, 2]);
    // The corner rule survives conversion: each stored leg's tapered faces, read back in world terms, face the middle.
    const middle = [15, 10];
    for (const b of legs(flat)) {
      const c = boardCenter(b);
      const inward = (d: string) => (d === '+x' ? c[0] < middle[0]! : d === '-x' ? c[0] > middle[0]! : d === '+z' ? c[2] < middle[1]! : c[2] > middle[1]!);
      const t = worldTapers(b);
      expect(t?.length).toBe(1);
      expect(t![0]!.faces.every(inward)).toBe(true);
    }
    expect(checkDesign(flat, limits)).toEqual([]);
    expect(jointFaults(flat)).toEqual([]);
    expect(joineryRefusal(made.doc, flat)).toBeNull();

    const sites = findSites(flat);
    // Every apron end meets a leg: eight sites, each joined by an explicit mortise-and-tenon (3/4in: the two tenons in a
    // leg come in on different axes and pass clear of each other). A 5in x 3/4in apron counts as "wide" for the default
    // (width > 6 x thickness), which would pick a dado; the flow under test is the mortise-and-tenon one. Every other
    // site (the top on the legs and aprons) takes its default.
    const named = (i: number, prefix: string) => flat.boards[i]!.name.startsWith(prefix);
    const apronLeg = new Set(sites.filter((s) => named(s.enter, 'Apron') && named(s.receive, 'Leg')).map((s) => s.id));
    expect(apronLeg.size).toBe(8);
    const choices = sites.map((s) => (apronLeg.has(s.id) ? { site: s.id, joint: 'mortise-tenon' as const, tenonLength: 0.75 } : defaultChoice(s, flat, sites)));
    const joined = applyJoints(flat, sites, choices);
    expect(joined.skipped).toEqual([]);
    expect(joined.applied.filter((a) => apronLeg.has(a.site)).map((a) => a.joint)).toEqual(Array(8).fill('mortise-tenon'));
    expect(checkDesign(joined.doc, limits)).toEqual([]);
    // Each leg keeps exactly its two tapers, unchanged.
    expect(legs(joined.doc).map((b) => b.angleCuts)).toEqual(legs(flat).map((b) => b.angleCuts));
    expect(legs(joined.doc).every((b) => b.cuts.length > 0)).toBe(true);
    // Joinery writes back to the tree as runJoinery does, and the legs are still one component.
    const tree = migrateDocument(writeBackFlat(made.doc, flat.boards, worldParts(joined.doc)));
    const joinedLegShapes = new Set(tree.boards.filter((b) => b.name.startsWith('Leg')).map((b) => ('shape' in b ? b.shape : undefined)));
    expect(joinedLegShapes.size).toBe(1);
    expect([...joinedLegShapes][0]).toBeDefined();
  });
});

describe('angleConflicts — a miter, bevel or chamfer reaching into a joint (AI-angles spec §3)', () => {
  const at = (doc: FlatDocument, name: string) => doc.boards.findIndex((b) => b.name === name);
  const withPart = (doc: FlatDocument, name: string, cuts: (b: Board) => AngleCut[], patch: Partial<Board> = {}): FlatDocument =>
    ({ ...doc, boards: doc.boards.map((b) => (b.name === name ? { ...b, ...patch, angleCuts: cuts({ ...b, ...patch }) } : b)) });
  /** A chamfer on the edge where world faces (a) and (c) meet; legs into each, in that order. */
  const chamfer = (b: Board, a: [0 | 1 | 2, -1 | 1], c: [0 | 1 | 2, -1 | 1], legA: number, legC = legA): AngleCut => {
    const p = { dim: axisFrame(b)[a[0]]!.dim, from: endFacing(b, a[0], a[1]), leg: legA };
    const q = { dim: axisFrame(b)[c[0]]!.dim, from: endFacing(b, c[0], c[1]), leg: legC };
    const order = ['length', 'width', 'thickness'];
    const [f, g] = order.indexOf(p.dim) < order.indexOf(q.dim) ? [p, q] : [q, p];
    return { id: `c${a}${c}`, ...chamferCut({ face: f.dim, from: f.from, along: g.dim, alongFrom: g.from, legFace: f.leg, legAlong: g.leg }, b) };
  };
  const ends = (doc: FlatDocument) => angleConflicts(doc, findSites(doc));
  const railMiter = (side: -1 | 1) => (b: Board): AngleCut[] =>
    [{ id: 'm', ...miterCut({ end: endFacing(b, 0, side), across: 'thickness', longSide: endFacing(b, 2, -1), ratio: 1 }, b) }];

  it('none for the plain corner', () => {
    expect(ends(CORNER)).toEqual([]);
  });
  it('a rail mitered at the end that meets the leg conflicts; mitered at its free end does not', () => {
    expect(ends(withPart(CORNER, 'Rail X', railMiter(-1)))).toEqual([{ part: at(CORNER, 'Rail X'), other: at(CORNER, 'Leg'), kind: 'miter' }]);
    expect(ends(withPart(CORNER, 'Rail X', railMiter(1)))).toEqual([]);
  });
  it('a leg chamfered on its outside corner: fine with the apron set back, refused with it flush', () => {
    const corner = (b: Board) => [chamfer(b, [0, 1], [2, 1], 0.125)];
    expect(ends(withPart(CORNER, 'Leg', corner))).toEqual([]);   // Rail X is set back 1/2in from the leg's +Z face
    const flush = shiftZ(CORNER, 'Rail X', 0.5);                   // now flush with it
    const leg = flush.boards[at(flush, 'Leg')]!;
    expect(flush.boards[at(flush, 'Rail X')]!.position[2] + 0.75).toBe(leg.position[2] + 1.75);
    expect(ends(withPart(flush, 'Leg', corner))).toEqual([{ part: at(flush, 'Leg'), other: at(flush, 'Rail X'), kind: 'chamfer' }]);
  });
  it('touching the patch edge does not conflict; past it by more than TOUCH does', () => {
    // The leg's +X/-Z edge: its strip spans z 0..leg. Rail X's patch starts at z 0.5.
    expect(ends(withPart(CORNER, 'Leg', (b) => [chamfer(b, [0, 1], [2, -1], 0.5)]))).toEqual([]);
    expect(ends(withPart(CORNER, 'Leg', (b) => [chamfer(b, [0, 1], [2, -1], 0.5 + 1 / 16)]))).toHaveLength(1);
    // Past it by less than TOUCH (the box contacts' own tolerance): still no conflict.
    expect(ends(withPart(CORNER, 'Leg', (b) => [chamfer(b, [0, 1], [2, -1], 0.5 + 1 / 64)]))).toEqual([]);
  });
  it('the tenon-clearance exception: a 1/8in chamfer along a tenoned rail passes, 5/8in does not, the 1/2in shoulder exactly passes', () => {
    const rail = CORNER.boards[at(CORNER, 'Rail X')]!;
    expect(axisDimensions(rail)[0]).toBe('length');
    expect([rail.width, rail.thickness]).toEqual([3, 0.75]);
    // Rail X: 3 wide on Y, 3/4 thick on Z — tenon cheek 1/4, shoulder 1/2. Its bottom (-Y) / back (-Z) edge.
    const bottom = (w: number, t: number) => (b: Board) => [chamfer(b, [1, -1], [2, -1], w, t)];
    expect(ends(withPart(CORNER, 'Rail X', bottom(0.125, 0.125)))).toEqual([]);
    expect(ends(withPart(CORNER, 'Rail X', bottom(0.625, 0.625)))).toHaveLength(1);
    expect(ends(withPart(CORNER, 'Rail X', bottom(0.5, 0.625)))).toEqual([]);   // width leg = shoulder: touching
  });
  it('a hairline cut on the growing part\'s joined end refuses, however small (final review I2, the user\'s ruling)', () => {
    // A 1/64in chamfer on the vertical edge of Rail X's joined end (end face × its -Z face): under TOUCH of patch overlap,
    // but joinery lengthens the rail through the cut's line, which would then bite the tenon.
    const hairline = (leg: number) => (b: Board) => [chamfer(b, [0, -1], [2, -1], leg)];
    expect(ends(withPart(CORNER, 'Rail X', hairline(1 / 64)))).toEqual([{ part: at(CORNER, 'Rail X'), other: at(CORNER, 'Leg'), kind: 'chamfer' }]);
    // The same chamfer at the FREE end is fine; so is the through-length chamfer of the tenon-clearance case (above).
    expect(ends(withPart(CORNER, 'Rail X', (b) => [chamfer(b, [0, 1], [2, -1], 1 / 64)]))).toEqual([]);
  });
  it('the design fault: a miter at a joint goes back to the model as angle-joint, in world words (spec §5.4)', () => {
    const doc = withPart(CORNER, 'Rail X', railMiter(-1));
    const f = jointFaults(doc);
    expect(f).toEqual([{ kind: 'angle-joint', parts: ['Rail X', 'Leg'],
      message: "Rail X's miter runs into where it meets Leg (a joint goes there) — move it off that end or face, or remove it." }]);
    // A taper conflict on the same part wins, worded as before.
    const both = withPart(withLeg(CORNER, inside(24)), 'Leg', (b) => [...inside(24)(b), chamfer(b, [0, 1], [2, -1], 0.75)]);
    expect(jointFaults(both).filter((v) => v.parts[0] === 'Leg')).toHaveLength(1);
    expect(jointFaults(both)[0]!.message).toContain("Leg's taper toward");
  });
  it('a mitered box on a thin bottom: the rabbet runs out through each mitered end (final review I2, the user\'s ruling)', () => {
    // A 1/2in bottom 12 x 8; four 4in sides on it, each its full outside length, mitered 45deg at the vertical corners.
    const box = design(
      { name: 'Bottom', at: [0, 0, 0], size: [12, 0.5, 8] },
      { name: 'Front', at: [0, 0.5, 0], size: [12, 4, 0.75] },
      { name: 'Back', at: [0, 0.5, 7.25], size: [12, 4, 0.75] },
      { name: 'Left', at: [0, 0.5, 0], size: [0.75, 4, 8] },
      { name: 'Right', at: [11.25, 0.5, 0], size: [0.75, 4, 8] },
    );
    const m = (len: 0 | 2, across: 0 | 2, out: -1 | 1) => (b: Board): AngleCut[] => ([-1, 1] as const).map((e, i) =>
      ({ id: `m${i}`, ...miterCut({ end: endFacing(b, len, e), across: axisFrame(b)[across]!.dim as 'width' | 'thickness', longSide: endFacing(b, across, out), ratio: 1 }, b) }));
    const mitered = withPart(withPart(withPart(withPart(box, 'Front', m(0, 2, -1)), 'Back', m(0, 2, 1)), 'Left', m(2, 0, -1)), 'Right', m(2, 0, 1));
    const sites = findSites(mitered);
    expect(sites.filter((x) => x.kind === 'face-against-edge')).toHaveLength(4);
    expect(angleConflicts(mitered, sites)).toEqual([]);
    expect(jointFaults(mitered)).toEqual([]);
    // A chamfer on that edge still conflicts: it would eat the rabbet.
    const chamfered = withPart(mitered, 'Front', (b) => [...m(0, 2, -1)(b), chamfer(b, [1, -1], [2, 1], 0.25)]);
    expect(angleConflicts(chamfered, findSites(chamfered)).map((c) => c.kind)).toEqual(['chamfer']);
  });
  it('a cut that removes nothing never conflicts (Review Focus 3)', () => {
    expect(ends(withPart(CORNER, 'Rail X', (b) => [{ ...railMiter(-1)(b)[0]!, points: [[0, -1], [1, -2]] }]))).toEqual([]);
  });
  it('a turned rail conflicts exactly where the same world rail does (Review Focus 2)', () => {
    const turned = withPart(CORNER, 'Rail X', railMiter(-1), { rotation: 180 });
    expect(axisFrame(turned.boards[at(turned, 'Rail X')]!)[0]!.reversed).toBe(true);
    expect(ends(turned)).toHaveLength(1);
    expect(ends(withPart(CORNER, 'Rail X', railMiter(1), { rotation: 180 }))).toEqual([]);
  });
  it('a mitered corner pair is no site and no overlap (spec §3)', () => {
    const pair = design(
      { name: 'A', at: [0, 0, 0], size: [18, 1.5, 0.75] },
      { name: 'B', at: [0, 0, 0], size: [0.75, 1.5, 18] },
    );
    const m = (axisLen: 0 | 2, axisAcross: 0 | 2) => (b: Board): AngleCut[] =>
      [{ id: 'm', ...miterCut({ end: endFacing(b, axisLen, -1), across: axisFrame(b)[axisAcross]!.dim as 'width' | 'thickness', longSide: endFacing(b, axisAcross, -1), ratio: 1 }, b) }];
    const mitered = withPart(withPart(pair, 'A', m(0, 2)), 'B', m(2, 0));
    expect(findSites(mitered)).toEqual([]);
    expect(checkDesign(mitered, { width: null, depth: null, height: null, maxParts: 10 }).filter((v) => v.kind === 'overlap')).toEqual([]);
    // Unmitered, the same pair overlaps: the miters are what make it clean.
    expect(checkDesign(pair, { width: null, depth: null, height: null, maxParts: 10 }).filter((v) => v.kind === 'overlap')).toHaveLength(1);
  });
});

describe('joinery keeps angle cuts where they are on the wood (AI-angles spec §4, fu 307)', () => {
  /** World coordinate, along the cut's `along` axis, of station `s` measured from `alongFrom`. */
  const worldAt = (b: Board, c: AngleCut, s: number) => {
    const ax = axisDimensions(b).indexOf(c.along);
    const u = c.alongFrom === 'min' ? s : b[c.along] - s;   // cut-local station → part-local coordinate (not a world crossing)
    return b.position[ax]! + toWorldOffset(b, ax, u);
  };
  const tenonAll = (doc: FlatDocument) => {
    const sites = findSites(doc);
    return applyJoints(doc, sites, sites.map((s) => (doc.boards[s.enter]!.name.startsWith('Rail')
      ? { site: s.id, joint: 'mortise-tenon' as const, tenonLength: 0.75 } : defaultChoice(s, doc, sites))));
  };
  const railName = 'Rail X';
  const withRail = (doc: FlatDocument, cuts: (b: Board) => AngleCut[]): FlatDocument =>
    ({ ...doc, boards: doc.boards.map((b) => (b.name === railName ? { ...b, angleCuts: cuts(b) } : b)) });
  // A taper thin at Rail X's FREE end (+X), square from 10in in, stored deep-end-last: measured from the JOINT end.
  const deepEndLast = (b: Board): AngleCut => ({ id: 'd', kind: 'taper', face: axisFrame(b)[2]!.dim, from: endFacing(b, 2, 1),
    along: 'length', alongFrom: endFacing(b, 0, -1), points: [[b.length - 10, 0], [b.length, 0.25]] });

  it('a deep-end-last taper on a tenoned rail stays put in world space (fu 307)', () => {
    const doc = withRail(CORNER, (b) => [deepEndLast(b)]);
    const before = doc.boards.find((b) => b.name === railName)!;
    const after = tenonAll(doc).doc.boards.find((b) => b.name === railName)!;
    expect(after.length).toBe(before.length + 0.75);                       // the tenon grew it at the joint end
    const c0 = before.angleCuts[0]!;
    const c1 = after.angleCuts[0]!;
    expect(worldAt(after, c1, zeroStation(c1))).toBeCloseTo(worldAt(before, c0, zeroStation(c0)), 12);
    expect(depthAt(c1, after.length)).toBeCloseTo(depthAt(c0, before.length), 12);
  });
  it('the unjoin gate reads a rebased cut back: the plain part gets the original cut, and re-joining matches (final review I1)', () => {
    const doc = withRail(CORNER, (b) => [deepEndLast(b)]);
    const joined = tenonAll(doc).doc;
    const u = gateUnjoin(joined);
    if ('refused' in u) throw new Error(u.refused);
    const plain = u.plain.find((b) => b.name === railName)!;
    expect(plain.angleCuts).toEqual(doc.boards.find((b) => b.name === railName)!.angleCuts);
  });
  it('a canonical taper anchored at the free end is byte for byte unchanged', () => {
    const doc = withRail(CORNER, (b) => [{ id: 't', ...taperCut({ face: axisFrame(b)[2]!.dim as 'thickness', from: endFacing(b, 2, 1), end: endFacing(b, 0, 1), start: 10, amount: 0.25 }) }]);
    const before = doc.boards.find((b) => b.name === railName)!.angleCuts;
    expect(tenonAll(doc).doc.boards.find((b) => b.name === railName)!.angleCuts).toEqual(before);
  });
  it('a trim (negative amount) shifts stations and depths measured from the moving end back by the same amount', () => {
    const b = { ...CORNER.boards.find((x) => x.name === railName)! };
    b.angleCuts = [
      { id: 's', kind: 'chamfer', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[16, 0], [18, 0.25]] },
      { id: 'q', kind: 'miter', face: 'length', from: 'min', along: 'width', alongFrom: 'min', points: [[0, 0], [3, 3]] },
      { id: 'n', kind: 'chamfer', face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', points: [[0, 0.125], [0.125, 0]] },
    ];
    const untouched = b.angleCuts[2];
    rebaseAngleCuts(b, 'length', 'min', -0.5);
    expect(b.angleCuts.map((c) => c.points)).toEqual([[[15.5, 0], [17.5, 0.25]], [[0, -0.5], [3, 2.5]], [[0, 0.125], [0.125, 0]]]);
    expect(b.angleCuts[2]).toBe(untouched);                                  // a cut not measured from the end is the same object
  });
  it('two linked rails rebased by joinery are still one component, chamfer in place (Review Focus 5)', () => {
    const made = designToDocument({ name: 'F', parts: [
      { name: 'Leg A', role: 'leg', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 }, miters: [], bevels: [], chamfers: [], tapers: [] },
      { name: 'Rail 1', role: 'rail', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 }, miters: [], bevels: [], chamfers: [], tapers: [] },
      { name: 'Rail 2', role: 'rail', material: 'oak', at: { x: 1.75, y: 10, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 }, miters: [], bevels: [], chamfers: [], tapers: [] },
    ], assemblies: [] } as never, { centre: false }).doc;
    const railShape = (d: SloydDocument) => new Set(d.boards.filter((b) => b.name.startsWith('Rail')).map((b) => ('shape' in b ? b.shape : undefined)));
    expect(railShape(made).size).toBe(1);
    const shapeId = [...railShape(made)][0]!;
    expect(shapeId).toBeDefined();
    // A chamfer at the rails' free +X end, stored deep-end-last (measured from the tenoned -X end), written on the Shape.
    // An angle cut's line runs on past the part, so such a cut always reaches the far end: the rails are joined only at
    // -X (Leg A), or the far joint would rightly refuse it.
    const r0 = flatDocument(made).boards.find((b) => b.name === 'Rail 1')!;
    const cut: AngleCut = { id: 'k', kind: 'chamfer', face: axisFrame(r0)[1]!.dim, from: endFacing(r0, 1, -1), along: 'length', alongFrom: endFacing(r0, 0, -1),
      points: [[r0.length - 2, 0], [r0.length, 0.25]] };
    const doc: SloydDocument = { ...made, shapes: made.shapes.map((s) => (s.id === shapeId ? { ...s, angleCuts: [cut] } : s)) };
    const flat = flatDocument(doc);
    expect(flat.boards.filter((b) => b.name.startsWith('Rail')).every((b) => b.angleCuts.length === 1)).toBe(true);
    const joined = tenonAll(flat);
    expect(joined.applied.length).toBeGreaterThanOrEqual(2);
    const tree = migrateDocument(writeBackFlat(doc, flat.boards, worldParts(joined.doc)));
    expect(railShape(tree).size).toBe(1);
    expect([...railShape(tree)][0]).toBeDefined();
    for (const name of ['Rail 1', 'Rail 2']) {
      const b0 = flat.boards.find((b) => b.name === name)!;
      const b1 = flatDocument(tree).boards.find((b) => b.name === name)!;
      expect(b1.length).toBe(b0.length + 0.75);
      expect(worldAt(b1, b1.angleCuts[0]!, zeroStation(b1.angleCuts[0]!))).toBeCloseTo(worldAt(b0, b0.angleCuts[0]!, zeroStation(b0.angleCuts[0]!)), 12);
    }
  });
});
