import { describe, expect, it } from 'vitest';
import { designToDocument } from '../../document/generated';
import { flatDocument, taperCut } from '../../document/document';
import type { AngleCut, Board, FlatDocument } from '../../document/document';
import { axisFrame, endFacing } from '../../document/geometry';
import { formatLength } from '../../units/length';
import { findSites } from './sites';
import { joineryRefusal, taperConflicts } from './tapers';
import { taperJointRefusal } from '../../document/angledRefusal';

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
