import { describe, expect, it } from 'vitest';
import { createBoard, partGeometry, sameSnapPoint } from './document';
import { worldBodies } from './drawing';
import type { Board, GuideLine, GuideRay, HoleRow, SnapPoint } from './document';
import { FACE_PROBE, keepsCandidate, lineFaceCandidates, lineFaceHits } from './lineFaces';
import { boardHoles } from './holes';
import { miterCut } from './angleCuts';
import { toWorld } from './snapPoints';
import { chooseFace } from './lean';
import type { Section } from './section';

/** The plain board of the brief: 24 × 5-1/2 × 3/4, flat — length on X, thickness on Y, width on Z. */
const plain = (extra: Partial<Board> = {}) => createBoard({ length: 24, width: 5.5, thickness: 0.75, posture: 'flat', position: [0, 0, 0], ...extra });
const axisLine = (axis: 'x' | 'y' | 'z', at: [number, number, number]): GuideLine => ({ id: `L${axis}`, at, axis });
const ray = (at: [number, number, number], to: [number, number, number]): GuideRay => ({ id: 'R', at, to });
const ats = (ps: SnapPoint[]) => ps.map((p) => p.at);

describe('lineFaceHits', () => {
  it('an axis line through the board: two hits, the face constants assigned exactly, x and y the line’s own', () => {
    const b = plain();
    const hits = lineFaceHits(axisLine('z', [3, 0.375, 0]), b);
    expect(ats(hits)).toEqual([[3, 0.375, 0], [3, 0.375, 5.5]]);
    expect(hits.every((h) => h.kind === 'line-face' && h.owner.type === 'guide' && h.owner.id === 'Lz' && h.owner.board === b.id)).toBe(true);
    const box = worldBodies(b)[0]!.box!;
    expect(hits[0]!.at[2]).toBe(box.min[2]);
    expect(hits[1]!.at[2]).toBe(box.max[2]);
  });

  // Exactness (inv 25). The face's constant is assigned, never computed back through t. On a board at [0.1, 0.2, 0.3] the
  // far face is z = 0.3 + 5.5, and a value computed from an anchor a = 1.1 along the axis would be `a + (c − a)` —
  // 5.799999999999999, NOT c (asserted below, so the drift is real for these numbers). For a STORED axis line, though, `at` on the axis is 0
  // (canonical, `validateGuides`), so the slab's t is `(c − 0)/1 === c` and `at + t·u` is `0 + c·1 === c`: the naive form
  // agrees too (asserted), and a mutation to it cannot fail here. The assignment stays as the spec's rule (task-4 report).
  it('a board off the origin: the far face is the box’s own max, exactly', () => {
    const b = plain({ position: [0.1, 0.2, 0.3] });
    const hits = lineFaceHits(axisLine('z', [3, 0.575, 0]), b);
    const box = worldBodies(b)[0]!.box!;
    expect(hits.map((h) => h.at[2])).toEqual([box.min[2], box.max[2]]);
    expect(hits.every((h) => h.at[0] === 3 && h.at[1] === 0.575)).toBe(true);
    const a = 1.1;
    const c = box.max[2];
    expect(a + (c - a)).not.toBe(c); // the non-canonical route WOULD drift…
    expect(0 + ((c - 0) / 1) * 1).toBe(c); // …but a canonical line's t cannot.
  });

  // The same faces from a NON-canonical axis line (its anchor 1.1 along the axis — the loader never stores one, but
  // `lineFaceHits` takes any `AnyLine`): here `t` is measured from z = 1.1, so `at + t·u` is `1.1 + (c − 1.1)`, which
  // drifts for c = 0.3 + 5.5 (asserted above). Only the assignment gives the face constants; this is the mutation's pin.
  it('a non-canonical axis line: the face constants still, never `at + t·u`', () => {
    const b = plain({ position: [0.1, 0.2, 0.3] });
    const box = worldBodies(b)[0]!.box!;
    const hits = lineFaceHits(axisLine('z', [3, 0.575, 1.1]), b);
    expect(hits.map((h) => h.at[2])).toEqual([box.min[2], box.max[2]]);
    expect(hits.every((h) => h.at[0] === 3 && h.at[1] === 0.575)).toBe(true);
  });

  it('a grazing line along a top edge: exactly the two ends', () => {
    expect(ats(lineFaceHits(axisLine('x', [0, 0.75, 0]), plain()))).toEqual([[0, 0.75, 0], [24, 0.75, 0]]);
  });

  it('a line that misses: nothing', () => {
    expect(lineFaceHits(axisLine('x', [0, 2, 1]), plain())).toEqual([]);
    expect(lineFaceHits(ray([-5, 3, -5], [30, 4, -1]), plain())).toEqual([]);
  });

  describe('a pocketed part (a 1" dado from the top, 1/4" deep, at 11-1/2")', () => {
    const dado = { id: 'd', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 11.5, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 };
    const b = plain({ cuts: [dado] });
    // The cells, as pocketCells lays them: one slab under the floor (y 0..1/2, the whole length) and two blocks beside the
    // dado (y 1/2..3/4). Their seam is the plane y = 1/2 outside the dado, so it is a line across the THICKNESS that
    // crosses it — an X line under the floor stays inside one cell and meets no seam (the brief's case; kept as an ends check).
    it('the fixture is cells, not one box: the seam y = 1/2 exists for the probe to reject', () => {
      expect(worldBodies(b).map((w) => w.box)).toEqual([
        { min: [0, 0.5, 0], max: [11.5, 0.75, 5.5] }, { min: [0, 0, 0], max: [24, 0.5, 5.5] }, { min: [12.5, 0.5, 0], max: [24, 0.75, 5.5] },
      ]);
    });
    it('a line across the thickness beside the dado: the two faces, never the cell seam at y = 1/2', () => {
      expect(ats(lineFaceHits(axisLine('y', [5, 0, 2]), b))).toEqual([[5, 0, 2], [5, 0.75, 2]]);
    });
    it('a line across the thickness in the dado: the bottom face and the dado floor (a true surface)', () => {
      expect(ats(lineFaceHits(axisLine('y', [12, 0, 2]), b))).toEqual([[12, 0, 2], [12, 0.5, 2]]);
    });
    it('under the dado floor: the true ends only', () => {
      expect(ats(lineFaceHits(axisLine('x', [0, 0.25, 2]), b))).toEqual([[0, 0.25, 2], [24, 0.25, 2]]);
    });
    it('through the dado’s height: the ends and both walls', () => {
      expect(ats(lineFaceHits(axisLine('x', [0, 0.625, 2]), b))).toEqual([[0, 0.625, 2], [11.5, 0.625, 2], [12.5, 0.625, 2], [24, 0.625, 2]]);
    });
  });

  describe('a bored part', () => {
    const through: HoleRow = { id: 'h', face: 'thickness', from: 'max', diameter: 0.5, depth: 'through', along: 'length', alongFrom: 'min', station: 6, count: 1, pitch: 0, acrossFrom: 'min', inset: 2 };
    it('a square hole’s bit is a unit vector; a tilted one’s is NOT (its face component is exactly ±1)', () => {
      const [sq] = boardHoles(plain({ holes: [through] }));
      expect(Math.hypot(...sq!.bit)).toBe(1);
      const [tl] = boardHoles(plain({ holes: [{ ...through, tiltAlong: 0.3 }] }));
      expect(Math.hypot(...tl!.bit)).toBeGreaterThan(1);
    });
    it('a line down a through hole’s axis meets neither face; one beside it meets both', () => {
      const b = plain({ holes: [through] });
      expect(lineFaceHits(axisLine('y', [6, 0, 2]), b)).toEqual([]);
      expect(ats(lineFaceHits(axisLine('y', [7, 0, 2]), b))).toEqual([[7, 0, 2], [7, 0.75, 2]]);
    });
    // A TILTED through bore: its caps are the two face planes (axial), not discs square to the bit. A line down the bit's
    // axis meets the entry mouth at s = 0 and the exit mouth at s = reach·|bit| > depth along the unit bit — the brief's
    // `s ≤ depth` form would keep the exit hit, a marker in air. `insideHole` (the holes module's own test) drops both.
    it('a line down a TILTED through bore’s axis meets neither mouth', () => {
      const b = plain({ holes: [{ ...through, station: 10, tiltAlong: 0.3 }] });
      const [h] = partGeometry(b).holes;
      const local = (v: readonly number[]) => ({ length: v[0]!, width: v[1]!, thickness: v[2]! });
      const far = [0, 1, 2].map((i) => h!.centre[i]! + h!.reach * h!.bit[i]!);
      expect(h!.reach * Math.hypot(...h!.bit)).toBeGreaterThan(h!.depth + 1e-6);
      const line = ray(toWorld(b, local(h!.centre)), toWorld(b, local(far)));
      expect(lineFaceHits(line, b)).toEqual([]);
    });
  });

  it('an oblique line through a mitred end: the hit lies on the sloped plane (x + z = 24)', () => {
    const b0 = plain();
    const b = { ...b0, angleCuts: [{ id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, b0) }] };
    const hits = lineFaceHits(ray([10, 0.375, 2], [30, 0.375, 3]), b);
    expect(hits).toHaveLength(2);
    expect(hits[0]!.at[0]).toBe(0);
    const [x, , z] = hits[1]!.at;
    expect(Math.abs(x + z - 24)).toBeLessThanOrEqual(1e-9);
    expect(x).toBeLessThan(24);
  });

  it('a leaning leg: two hits, each on the leg’s top or bottom plane', () => {
    const b0 = createBoard({ length: 16, width: 1.5, thickness: 1.5, posture: 'upright', position: [0, 0, 0] });
    const b: Board = { ...b0, lean: { x: 0.05, z: 0, face: chooseFace(b0, 0.05, 0) } };
    // The leg's axis runs from its top's centre (the pivot) to its bottom's; a Y line halfway across meets both ends.
    const top = toWorld(b, { length: 16, width: 0.75, thickness: 0.75 });
    const bottom = toWorld(b, { length: 0, width: 0.75, thickness: 0.75 });
    const hits = lineFaceHits(axisLine('y', [(top[0] + bottom[0]) / 2, 0, (top[2] + bottom[2]) / 2]), b);
    expect(hits).toHaveLength(2);
    const planes = worldBodies(b).flatMap((w) => w.planes).filter((p) => Math.abs(p.m[1]) > 0.9);
    expect(planes).toHaveLength(2);
    for (const h of hits) {
      expect(planes.some((p) => Math.abs(p.m[0] * h.at[0] + p.m[1] * h.at[1] + p.m[2] * h.at[2] + p.c) <= 1e-9)).toBe(true);
    }
  });

  it('FACE_PROBE sits far below any 1/64" feature', () => {
    expect(FACE_PROBE).toBe(1e-4);
  });
});

describe('lineFaceCandidates', () => {
  it('every line against every part, inside ±extent only', () => {
    const a = plain();
    const b = plain({ position: [0, 0, 10] });
    const lines = [axisLine('z', [3, 0.375, 0]), axisLine('x', [0, 0.25, 2])];
    const all = lineFaceCandidates(lines, [a, b], 120);
    expect(all).toHaveLength(6); // the Z line meets both parts twice, the X line meets a twice
    expect(lineFaceCandidates(lines, [a, b], 12).every((p) => p.at.every((c) => Math.abs(c) <= 12))).toBe(true);
    expect(lineFaceCandidates(lines, [a, b], 12)).toHaveLength(4); // b's far face (z 15.5) and a's x = 24 end fall outside
    expect(lineFaceCandidates([{ id: 'p', at: [1, 1, 1] }], [a], 120)).toEqual([]);
  });
});

describe('keepsCandidate (Review Focus 3)', () => {
  const section: Section = { axis: 'side', at: 5, flip: false }; // keeps x ≤ 5
  const at: [number, number, number] = [10, 0, 0];
  const cross: SnapPoint = { kind: 'line-cross', at, owner: { type: 'guide', id: 'a', cross: 'b' } };
  const face: SnapPoint = { kind: 'line-face', at, owner: { type: 'guide', id: 'a', board: 'b1' } };
  const corner: SnapPoint = { kind: 'corner', at, owner: { type: 'board', id: 'b1' } };
  it('a section keeps a crossing but drops a face hit and a board point on its far side', () => {
    expect(keepsCandidate(section, cross)).toBe(true);
    expect(keepsCandidate(section, face)).toBe(false);
    expect(keepsCandidate(section, corner)).toBe(false);
  });
  it('no section keeps all three', () => {
    expect([cross, face, corner].every((p) => keepsCandidate(null, p))).toBe(true);
  });
});

describe('sameSnapPoint and face hits', () => {
  it('two face hits differing only in the part are not the same point', () => {
    const p: SnapPoint = { kind: 'line-face', at: [1, 2, 3], owner: { type: 'guide', id: 'L', board: 'a' } };
    const q: SnapPoint = { ...p, owner: { type: 'guide', id: 'L', board: 'b' } };
    expect(sameSnapPoint(p, q)).toBe(false);
    expect(sameSnapPoint(p, { ...p, owner: { ...p.owner } })).toBe(true);
  });
});
