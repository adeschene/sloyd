import { describe, expect, it } from 'vitest';
import { designToDocument, parseDesign } from '../../document/generated';
import { flatDocument, taperCut } from '../../document/document';
import type { AngleCut, Board, FlatDocument } from '../../document/document';
import { axisFrame, boardCenter, endFacing } from '../../document/geometry';
import { worldTapers } from '../../document/taperWorld';
import { formatLength } from '../../units/length';
import { findSites } from './sites';
import { joineryRefusal, taperConflicts, taperFaults } from './tapers';
import { taperJointRefusal } from '../../document/angledRefusal';
import { checkDesign } from '../../document/designCheck';
import { applyJoints } from './recipes';
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
  it('the decider: angled kinds first, then tapers, else null', () => {
    expect(joineryRefusal(CORNER)).toBeNull();
    expect(joineryRefusal(withLeg(CORNER, inside(22)))).toBeNull();
    expect(joineryRefusal(withLeg(CORNER, inside(24)))).toContain('taper runs into its joint');
    const mitered = withLeg(CORNER, (b) => [{ ...face(b, 0, 1, 24), kind: 'miter' }]);
    expect(joineryRefusal(mitered)).toContain('mitered, beveled or chamfered');
    // Both at once: the angled refusal wins.
    const both = withLeg(CORNER, (b) => [...inside(24)(b), { ...face(b, 2, -1, 24), kind: 'miter' }]);
    expect(joineryRefusal(both)).toContain('mitered, beveled or chamfered');
  });
});

describe('taperFaults \u2014 the fault on designs (spec 5.3)', () => {
  const part = (name: string, at: number[], size: number[], tapers: unknown[] = []) =>
    ({ name, role: '', material: 'oak', at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] }, tapers });
  const build = (parts: unknown[], opts?: { exact: Set<number> }) =>
    flatDocument(designToDocument(parseDesign({ name: 'T', assemblies: [], parts })!, opts).doc);
  const corner = (start: number, railY = 23.5) => build([
    part('Leg', [0, 0, 0], [1.75, 28, 1.75], [{ faces: ['+x', '+z'], toward: '-y', start, amount: 0.375 }]),
    part('Rail X', [1.75, railY, 0.5], [18, 3, 0.75]),
  ]);

  it('reports one taper-joint fault naming both parts, in world words', () => {
    const v = taperFaults(corner(24));
    expect(v).toHaveLength(1);
    expect(v[0]!.kind).toBe('taper-joint');
    expect([...v[0]!.parts].sort()).toEqual(['Leg', 'Rail X']);
    expect(v[0]!.message).toBe("Leg's taper toward -y runs into where it meets Rail X (a joint goes there) \u2014 start it 23.5in or less from its -y end, or remove it.");
  });
  it('allows start exactly at the meeting', () => {
    expect(taperFaults(corner(23.5))).toEqual([]);
  });
  it('floors the advice to 1/16, and following it passes (snapped start)', () => {
    // The rail sits at 22.47: exact in the design (no snap) so the meeting is off-grid.
    const at = 22.47;
    const opts = { exact: new Set([at]) };
    const flat = build([
      part('Leg', [0, 0, 0], [1.75, 28, 1.75], [{ faces: ['+x'], toward: '-y', start: 24, amount: 0.375 }]),
      part('Rail X', [1.75, at, 0.5], [18, 3, 0.75]),
    ], opts);
    const [v] = taperFaults(flat);
    expect(v!.message).toContain('start it 22.4375in or less');
    const fixed = build([
      part('Leg', [0, 0, 0], [1.75, 28, 1.75], [{ faces: ['+x'], toward: '-y', start: 22.4375, amount: 0.375 }]),
      part('Rail X', [1.75, at, 0.5], [18, 3, 0.75]),
    ], opts);
    expect(taperFaults(fixed)).toEqual([]);
  });
  it('a meeting at the thin end advises tapering the other end', () => {
    const flat = build([
      part('Leg', [0, 1, 0], [1.75, 28, 1.75], [{ faces: ['+x'], toward: '-y', start: 10, amount: 0.375 }]),
      part('Foot', [-1, 0, -1], [4, 1, 4]),
    ]);
    expect(taperFaults(flat)[0]!.message).toBe("Leg's taper toward -y runs to its -y end, where it meets Foot (a joint goes there) \u2014 taper the other end, or remove the taper.");
  });
});

describe('the headline flow: a Shaker table with tapered legs, generated and joined (AI-tapers chunk 2)', () => {
  // Built the way the prompt teaches: four legs 1.75 x 28.25 x 1.75 tapering their INSIDE faces toward the floor by the
  // corner rule, start 22.5 (below the aprons, which begin at 23.25), amount 0.5; four 5in aprons inset 0.25 from the
  // legs' outside faces at the top of the legs; a top overhanging 1in all round. 30 x 20 x 29 overall.
  const leg = (name: string, x: number, z: number, faces: string[]) => ({ name, role: '', material: 'oak',
    at: { x, y: 0, z }, size: { x: 1.75, y: 28.25, z: 1.75 }, tapers: [{ faces, toward: '-y', start: 22.5, amount: 0.5 }] });
  const plain = (name: string, at: [number, number, number], size: [number, number, number]) => ({ name, role: '', material: 'oak',
    at: { x: at[0], y: at[1], z: at[2] }, size: { x: size[0], y: size[1], z: size[2] }, tapers: [] });
  const json = { name: 'Shaker table', assemblies: [], parts: [
    leg('Leg FL', 0, 0, ['+x', '+z']), leg('Leg FR', 28.25, 0, ['-x', '+z']),
    leg('Leg BL', 0, 18.25, ['+x', '-z']), leg('Leg BR', 28.25, 18.25, ['-x', '-z']),
    plain('Apron F', [1.75, 23.25, 0.25], [26.5, 5, 0.75]), plain('Apron B', [1.75, 23.25, 19], [26.5, 5, 0.75]),
    plain('Apron L', [0.25, 23.25, 1.75], [0.75, 5, 16.5]), plain('Apron R', [29, 23.25, 1.75], [0.75, 5, 16.5]),
    plain('Top', [-1, 28.25, -1], [32, 0.75, 22]),
  ] };
  const limits = { width: null, depth: null, height: null, maxParts: 10 };
  const legs = (d: FlatDocument) => d.boards.filter((b) => b.name.startsWith('Leg'));

  it('converts, checks clean, and joins with mortise-and-tenons that leave every taper alone', () => {
    const design = parseDesign(json);
    if (!design) throw new Error('the design does not parse');
    const made = designToDocument(design, { centre: false });
    expect(made.rejected).toEqual([]);
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
    expect(taperFaults(flat)).toEqual([]);
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
  });
});
