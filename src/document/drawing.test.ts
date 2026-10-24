import { createBoard, defaultShelfPinRow, holeInStock, partGeometry, stockChecks, taperCut } from './document';
import { ARCH } from './curveFixtures';
import type { Board, HoleRow, Lean } from './types';
import { chiralAngled, chiralCurved } from './turnFixtures';
import { archCurve, bowCurve, cornerCurve, defaultCorners } from './curves';
import { mirrorPart, type Vec3 } from './frames';
import type { BodyFace } from './bodies';
import { slopeOf } from './lean';
import { levelPlan } from './levelEnds';
import { toWorld } from './snapPoints';
import { partBounds } from './worldBounds';
import { dimensionView } from './dimensions';
import { IMPERIAL } from '../units/length';
import { curveSilhouettes } from './curveDrawing';
import { drawView, hiddenSpan, hiddenSpanPlanes, worldBodies, FRONT, SIDE, ISO, TOP, type P2, type Seg2, type View } from './drawing';

const len = (s: Seg2) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
const total = (segs: Seg2[], part?: string) =>
  segs.filter((s) => part === undefined || s.part === part).reduce((n, s) => n + len(s), 0);
const horizontalAt = (segs: Seg2[], y: number) =>
  segs.filter((s) => Math.abs(s.a[1] - y) < 1e-9 && Math.abs(s.b[1] - y) < 1e-9);
const verticalAt = (segs: Seg2[], x: number) =>
  segs.filter((s) => Math.abs(s.a[0] - x) < 1e-9 && Math.abs(s.b[0] - x) < 1e-9);

// Flat at turn 0: length on X, thickness on Y (up), width on Z (CLAUDE.md, axisFrame).
const box = (id: string, length: number, width: number, thickness: number, position: [number, number, number] = [0, 0, 0], extra: Partial<Board> = {}) =>
  createBoard({ id, name: id, length, width, thickness, position, ...extra });

describe('drawView', () => {
  it('draws a lone box in front view: front edges visible, back edges hidden beneath them', () => {
    // X 0..10, Y 0..2, Z 0..4. Four X-edges (10 each) and four Y-edges (2 each) project;
    // the four Z-edges project to points and are skipped. Front (z=4): 10+10+2+2 = 24 visible.
    // Back (z=0): their rays graze the box along +Z (spec §2.3), so hidden: 24.
    const d = drawView([box('b', 10, 4, 2)], FRONT);
    expect(total(d.visible)).toBeCloseTo(24, 9);
    expect(total(d.hidden)).toBeCloseTo(24, 9);
    expect(d.bounds).toEqual({ min: [0, 0], max: [10, 2] });
  });

  it('hides the part of a rear box that a front box covers', () => {
    // R: X 0..10, Y 0..2, Z 0..4. F: X 3..7, Y 0..2, Z 10..11 (in front).
    // R's own back edges: 10+10+2+2 = 24 hidden. R's front X-edges (y=0, y=2) are covered for
    // x in [3,7]: 4+4 = 8 more. R hidden = 32; R visible = 20 - 8 + 2 + 2 = 16.
    const R = box('R', 10, 4, 2);
    const F = box('F', 4, 1, 2, [3, 0, 10]);
    const d = drawView([R, F], FRONT);
    expect(total(d.hidden, 'R')).toBeCloseTo(32, 5);
    expect(total(d.visible, 'R')).toBeCloseTo(16, 5);
    // Moved clear (x 20..24), F covers nothing of R: R hidden falls by 8 to 24.
    const clear = drawView([R, { ...F, position: [20, 0, 10] }], FRONT);
    expect(total(clear.hidden, 'R')).toBeCloseTo(24, 5);
  });

  it('keeps a flush joint line visible and hides what the board above covers (isometric)', () => {
    // A: X 0..10, Y 0..1, Z 0..4; B the same on top (Y 1..2). Viewed from +X+Y+Z, an axis-aligned
    // unit length projects to sqrt(2/3). A's visible edges: X-edges at (y,z)=(0,4),(1,4): 20;
    // Y-edges at (x,z)=(10,0),(0,4),(10,4): 3; Z-edges at (x,y)=(10,0),(10,1): 8. Total 31.
    // (A lone box would also show its far top edges, (y,z)=(1,0) and (x,y)=(0,1); B hides them.)
    const A = box('A', 10, 4, 1);
    const B = box('B', 10, 4, 1, [0, 1, 0]);
    const d = drawView([A, B], ISO);
    expect(total(d.visible, 'A')).toBeCloseTo(31 * Math.sqrt(2 / 3), 6);
  });

  it('draws a hidden mortise as dashed lines in the front view, through the seam between solids', () => {
    // 20 (X) x 4 (Z) x 2 (Y). Mortise into the top: x 8..9, y 1..2, z 1..3 (stops 1 each end).
    // Its walls at x=8 and x=9, y 1..2, are behind the front material (z 3..4) — hidden. The ray
    // from a wall runs exactly along a seam between abutting solids; the union is solid (spec §2.3).
    const leg = box('M', 20, 4, 2, [0, 0, 0], {
      cuts: [{ id: 'c', face: 'thickness', from: 'max', across: 'width', offset: 8, width: 1, depth: 1, stopMin: 1, stopMax: 1 }],
    });
    const d = drawView([leg], FRONT);
    for (const x of [8, 9]) {
      expect(total(verticalAt(d.hidden, x))).toBeCloseTo(2, 9); // two walls (z=1, z=3), 1 each
      expect(verticalAt(d.visible, x)).toHaveLength(0);
    }
    // Front outline 20+20+2+2 = 44 visible. Hidden: back outline 44 (graze), mortise walls 4,
    // mortise floor edges 1+1, rim edges at z=1 and z=3 on y=2: 1+1. 44 + 8 = 52.
    expect(total(d.visible)).toBeCloseTo(44, 9);
    expect(total(d.hidden)).toBeCloseTo(52, 9);
  });

  it('hides part of every stick in a three-stick cycle, which no draw order can produce', () => {
    // Centre lines A (x,0,1), B (1,y,0), C (0,1,z). Seen along (1,1,1), A crosses in front of B
    // (zA > zB), B in front of C (xB > xC), C in front of A (yC > yA). Sticks are 0.5 square.
    const SA = box('SA', 7, 0.5, 0.5, [-3, -0.25, 0.75]);                                   // along X
    const SB = box('SB', 7, 0.5, 0.5, [0.75, -3, -0.25], { posture: 'upright' });            // along Y
    const SC = box('SC', 0.5, 7, 0.5, [-0.25, 0.75, -3]);                                     // along Z
    const all = drawView([SA, SB, SC], ISO);
    for (const s of [SA, SB, SC]) {
      const alone = total(drawView([s], ISO).hidden);
      // Each stick loses more than a whole inch of projected line to the one in front of it.
      expect(total(all.hidden, s.id)).toBeGreaterThan(alone + 1);
    }
  });

  it('maps an on-edge part through its reversed thickness (fu 215)', () => {
    // On-edge at turn 0: L on X, W on Y, T on Z with thickness REVERSED (thickness 0 at z = 2).
    // A rabbet from thickness MIN, width 0..1, depth 0.5, therefore sits at z 1.5..2 — the FRONT.
    // Its shoulder line at y = 1 is visible for the full length 10. Mapped without the reversal
    // the rabbet would be at the back and that line hidden.
    const part = box('E', 10, 4, 2, [0, 0, 0], {
      posture: 'on-edge',
      cuts: [{ id: 'r', face: 'thickness', from: 'min', across: 'length', offset: 0, width: 1, depth: 0.5, stopMin: 0, stopMax: 0 }],
    });
    const d = drawView([part], FRONT);
    expect(total(horizontalAt(d.visible, 1))).toBeCloseTo(10, 9);
  });

  it('draws a turned part with its world extents', () => {
    // Flat, turned 90: width on X, length on Z. Top view: right = +X, up = -Z.
    const d = drawView([box('T', 10, 4, 1, [0, 0, 0], { rotation: 90 })], TOP);
    expect(d.bounds).toEqual({ min: [0, -10], max: [4, 0] });
  });

  it('adds an offset to the bounds', () => {
    const d = drawView([box('b', 10, 4, 2)], FRONT, new Map([['b', [5, 1, 0] as [number, number, number]]]));
    expect(d.bounds).toEqual({ min: [5, 1], max: [15, 3] });
  });

  it('draws the edges at their offset positions', () => {
    // 10 (X) x 4 (Z) x 2 (Y) at the origin, offset [5, 1, 0], front view (right = +X, up = +Y).
    // Front-top edge: y = 2 + 1 = 3, x = 0 + 5 .. 10 + 5. Front-bottom edge: y = 0 + 1 = 1, same x.
    const d = drawView([box('b', 10, 4, 2)], FRONT, new Map([['b', [5, 1, 0] as [number, number, number]]]));
    for (const y of [3, 1]) {
      const h = horizontalAt(d.visible, y);
      expect(total(h)).toBeCloseTo(10, 9);
      expect(Math.min(...h.flatMap((g) => [g.a[0], g.b[0]]))).toBeCloseTo(5, 9);
      expect(Math.max(...h.flatMap((g) => [g.a[0], g.b[0]]))).toBeCloseTo(15, 9);
    }
    // Nothing is left at the unoffset height.
    expect(horizontalAt(d.visible, 2)).toHaveLength(0);
  });

  it('moves the occluders with their offsets', () => {
    // R: 10 x 4 x 2 at the origin. F: 4 (X) x 1 (Z) x 2 (Y) at [3, 0, 10], in front of R.
    // Unoffset, F covers R's front X-edges for x in [3,7]: R hidden = 24 + 8 = 32.
    // Offset F by [20, 0, 0]: it sits at x 23..27, clear of R, so R hidden = 24 (its own back edges).
    // If the occluder ignored the offset, F would stay at x 3..7 and R would still read 32.
    const R = box('R', 10, 4, 2);
    const F = box('F', 4, 1, 2, [3, 0, 10]);
    const moved = drawView([R, F], FRONT, new Map([['F', [20, 0, 0] as [number, number, number]]]));
    expect(total(moved.hidden, 'R')).toBeCloseTo(24, 5);
    expect(total(drawView([R, F], FRONT).hidden, 'R')).toBeCloseTo(32, 5);
  });

  it('returns an empty drawing for no parts', () => {
    expect(drawView([], FRONT)).toEqual({ visible: [], hidden: [], bounds: { min: [0, 0], max: [0, 0] } });
  });
});

describe('hiddenSpan', () => {
  const t: [number, number, number] = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
  it('hides a point whose ray enters the box', () => {
    // (1,-1,0) + s(1,1,1) at s = 1 is (2,0,1), the centre line of A (x -3..4, y ±0.25, z 0.75..1.25).
    const span = hiddenSpan([1, -1.01, 0], [1, -0.99, 0], { min: [-3, -0.25, 0.75], max: [4, 0.25, 1.25] }, t, 100);
    expect(span).toEqual([0, 1]);
  });
  it('does not hide an edge on a face the ray leaves through', () => {
    // Front-top edge of X 0..10, Y 0..2, Z 0..4, viewed from +Z: the ray leaves at once.
    expect(hiddenSpan([0, 2, 4], [10, 2, 4], { min: [0, 0, 0], max: [10, 2, 4] }, [0, 0, 1], 100)).toBeNull();
  });
  it('keeps an edge visible when float drift pushes it inside a flush face', () => {
    // An edge drifted ~1.2e-6 inside the z=4 face. With the second sample, s ≤ 0.7ε is infeasible
    // against s ≥ ε, so the ray doesn't spend DRAW_EPS inside the box; returns null. Without it,
    // the edge would wrongly report hidden in [0, 1].
    expect(hiddenSpan([0, 2, 4 - 1.2e-6], [10, 2, 4 - 1.2e-6], { min: [0, 0, 0], max: [10, 2, 4] }, [0, 0, 1], 100)).toBeNull();
  });
});

describe('drawings with angle cuts (spec §3.5)', () => {
  it('hiddenSpanPlanes over a box\'s six planes equals hiddenSpan', () => {
    const bx = { min: [0, 0, 0], max: [2, 3, 4] };
    const planes = [0, 1, 2].flatMap((i) => [
      { m: [0, 1, 2].map((j) => (j === i ? 1 : 0)) as [number, number, number], c: -bx.min[i]! },
      { m: [0, 1, 2].map((j) => (j === i ? -1 : 0)) as [number, number, number], c: bx.max[i]! },
    ]);
    // An axis-aligned ray (the second sample moves only s) and an oblique one (it moves the t-range too).
    for (const toward of [[0, 0, 1], [0.6, 0, 0.8]] as [number, number, number][]) {
      const a: [number, number, number] = [-3, 1, -2];
      const e: [number, number, number] = [5, 2, -2];
      const x = hiddenSpan(a, e, bx, toward, 50)!;
      const y = hiddenSpanPlanes(a, e, planes, toward, 50)!;
      expect(x).not.toBeNull();
      expect(Math.abs(x[0] - y[0])).toBeLessThan(1e-12);
      expect(Math.abs(x[1] - y[1])).toBeLessThan(1e-12);
    }
  });

  it('a part with no angle cuts draws exactly as before (box bodies keep the box path)', () => {
    const b = createBoard({ position: [1, 0, 2] });
    expect(worldBodies(b).every((w) => w.box !== null)).toBe(true);
  });

  it('a mitered rail seen from above shows the miter line, not the square end', () => {
    // Flat turn-0: length on X, thickness on Y, width on Z; TOP looks down Y.
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [
      { id: 'm', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [2.5, 2.5]] },
    ] });
    const d = drawView([rail], TOP);
    const diag = d.visible.filter((s) => Math.abs(s.a[0] - s.b[0]) > 1e-6 && Math.abs(s.a[1] - s.b[1]) > 1e-6);
    expect(diag).toHaveLength(1);
    expect(Math.hypot(diag[0]!.a[0] - diag[0]!.b[0], diag[0]!.a[1] - diag[0]!.b[1])).toBeCloseTo(2.5 * Math.SQRT2, 9);
  });

  it.each([0, 180] as const)('a slope hides what is behind it only where it is (turn %i)', (rotation) => {
    // Upright: length on Y (foot at y = 0), thickness on Z, width on X — reversed at turn 180, so the
    // width-min side (where the taper bites) is the world +X side there. FRONT looks down -Z.
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, posture: 'upright', rotation, position: [0, 0, 0], angleCuts: [
      { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] },
    ] });
    // A small block behind the leg's foot (z < 0), inside the removed wedge (0.6in at y = 1).
    const x0 = rotation === 180 ? 1.75 - 0.1 - 0.25 : 0.1;
    const behind = createBoard({ length: 0.25, width: 0.25, thickness: 0.25, position: [x0, 1, -3] });
    const visibleOf = (parts: Board[]) => drawView(parts, FRONT).visible.filter((s) => s.part === behind.id);
    // CONTROL: without the taper the leg hides the block completely.
    expect(visibleOf([{ ...leg, angleCuts: [] }, behind])).toHaveLength(0);
    // With the taper the block shows through where the wedge was removed.
    expect(visibleOf([leg, behind]).length).toBeGreaterThan(0);
    // And a block behind the part that the taper left standing stays hidden (a flipped plane would show it).
    const kept = createBoard({ length: 0.25, width: 0.25, thickness: 0.25, position: [rotation === 180 ? 0.4 : 1.2, 1, -3] });
    const keptSegs = drawView([leg, kept], FRONT).visible.filter((s) => s.part === kept.id);
    expect(keptSegs).toHaveLength(0);
  });
});

describe('worldBodies — hand-mapped normals across every pose (invariant 44)', () => {
  const poses = (['flat', 'on-edge', 'upright'] as const).flatMap((posture) =>
    ([0, 90, 180, 270] as const).flatMap((rotation) =>
      [false, true].map((mirrored) => ({ posture, rotation, mirrored }))));
  it.each(poses)('%o: unit planes, every vertex inside its body, the centroid strictly inside', ({ posture, rotation, mirrored }) => {
    const base: Board = { ...chiralAngled(posture), rotation, position: [3, 1, -2] };
    const b = mirrored ? mirrorPart(base) : base;
    const clipped = worldBodies(b).filter((w) => w.box === null);
    expect(clipped.length).toBeGreaterThan(0);
    for (const w of clipped) {
      const n = w.verts.length;
      const c = [0, 1, 2].map((i) => w.verts.reduce((s, v) => s + v[i]!, 0) / n);
      for (const { m, c: k } of w.planes) {
        expect(Math.abs(Math.hypot(m[0], m[1], m[2]) - 1)).toBeLessThan(1e-12);
        for (const v of w.verts) expect(m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + k).toBeGreaterThanOrEqual(-1e-9);
        expect(m[0] * c[0]! + m[1] * c[1]! + m[2] * c[2]! + k).toBeGreaterThan(1e-6);
      }
    }
  });
});

describe('holes on the sheet (holes spec §3.4)', () => {
  const pin: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 2 };
  const holed = (extra: Partial<HoleRow> = {}) => box('s', 30, 11.25, 0.75, [0, 0, 0], { holes: [{ ...pin, ...extra }] });
  const near = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!) < 1e-9;

  // A part without holes: holeDrawing.test.ts pins that it adds no segments (ruling R1), and every test above guards the
  // unchanged output.
  it('front elevation: the depth lines are hidden (dashed), at x = 5 ± 1/8, down to y = 3/8; the bottom line too', () => {
    const d = drawView([holed()], FRONT);
    for (const x of [4.875, 5.125]) {
      const v = d.hidden.filter((s) => Math.abs(s.a[0] - x) < 1e-9 && Math.abs(s.b[0] - x) < 1e-9);
      expect(v.reduce((n, s) => n + Math.abs(s.b[1] - s.a[1]), 0)).toBeCloseTo(0.375, 9);
    }
    const bottom = horizontalAt(d.hidden, 0.375).filter((s) => Math.min(s.a[0], s.b[0]) > 4.8 && Math.max(s.a[0], s.b[0]) < 5.2);
    expect(bottom.length).toBeGreaterThan(0);
    // No hole line is visible in the elevation except where the rim lies on the top edge line (y = 3/4).
    expect(d.visible.filter((s) => Math.min(s.a[0], s.b[0]) > 4.8 && Math.max(s.a[0], s.b[0]) < 5.2 && (Math.abs(s.a[1] - 0.75) > 1e-9 || Math.abs(s.b[1] - 0.75) > 1e-9))).toEqual([]);
  });
  it('front elevation of a through pin: both rims edge-on, single segments on the top and bottom edge lines, covered by the visible part edges; both walls hidden over the full thickness', () => {
    const d = drawView([holed({ depth: 'through' })], FRONT);
    const inHole = (s: { a: readonly number[]; b: readonly number[] }) => Math.min(s.a[0]!, s.b[0]!) > 4.8 && Math.max(s.a[0]!, s.b[0]!) < 5.2;
    // A rim seen edge-on collapses to ONE segment x 4.875..5.125 on its edge line (top y = 3/4, bottom y = 0). The classifier
    // calls it hidden (its sight line grazes the top/bottom face), but on the sheet "hidden beneath visible" (spec §2.4)
    // puts it under the part's own solid edge line, which spans it: it reads as the edge, never as a dashed line.
    for (const y of [0.75, 0]) {
      const rim = d.hidden.filter((s) => inHole(s) && Math.abs(s.a[1]! - y) < 1e-9 && Math.abs(s.b[1]! - y) < 1e-9 && Math.abs(s.a[0]! - s.b[0]!) > 0.1);
      expect(rim).toHaveLength(1);
      expect(Math.min(rim[0]!.a[0]!, rim[0]!.b[0]!)).toBeCloseTo(4.875, 9);
      expect(Math.max(rim[0]!.a[0]!, rim[0]!.b[0]!)).toBeCloseTo(5.125, 9);
      const covers = d.visible.some((s) => Math.abs(s.a[1]! - y) < 1e-9 && Math.abs(s.b[1]! - y) < 1e-9 && Math.min(s.a[0]!, s.b[0]!) <= 4.875 && Math.max(s.a[0]!, s.b[0]!) >= 5.125);
      expect(covers).toBe(true);
    }
    // No hole line is drawn visible in the elevation.
    expect(d.visible.filter(inHole)).toEqual([]);
    for (const x of [4.875, 5.125]) {
      const wall = d.hidden.filter((s) => Math.abs(s.a[0]! - x) < 1e-9 && Math.abs(s.b[0]! - x) < 1e-9);
      expect(wall.reduce((n, s) => n + Math.abs(s.b[1]! - s.a[1]!), 0)).toBeCloseTo(0.75, 9);
      const ys = wall.flatMap((s) => [s.a[1]!, s.b[1]!]);
      expect(Math.min(...ys)).toBeCloseTo(0, 9);
      expect(Math.max(...ys)).toBeCloseTo(0.75, 9);
    }
    // A through hole has no bottom line inside the thickness.
    expect(horizontalAt(d.hidden, 0.375).filter(inHole)).toEqual([]);
  });
  it('plan: the entry rim is visible; a blind bottom rim is hidden beneath it', () => {
    const d = drawView([holed()], TOP);
    const inRim = (s: { a: readonly number[]; b: readonly number[] }) => Math.hypot(s.a[0] - 5, s.a[1] + 2) < 0.13;
    expect(d.visible.filter(inRim).length).toBeGreaterThan(0);
    expect(d.hidden.filter(inRim).length).toBeGreaterThan(0);
  });
  it('occluders stay hole-free: a through-bore\'s exit rim is hidden from above (Review Focus 1)', () => {
    const d = drawView([holed({ depth: 'through' })], TOP);
    // TOP: right = +X, up = -Z, so the hole at (x 5, z 2) draws around (5, -2). Every rim segment there is either
    // the entry rim (visible) or the exit rim (hidden): the exit rim never appears visible a second time.
    const around = (s: { a: readonly number[] }) => Math.hypot(s.a[0] - 5, s.a[1] + 2) < 0.13;
    const vis = d.visible.filter(around);
    const hid = d.hidden.filter(around);
    expect(hid.length).toBeGreaterThan(0);
    // Each visible rim segment is matched by a hidden one at the same place (the exit rim beneath it), not the reverse.
    expect(vis.every((s) => hid.some((h) => near(h.a, s.a) && near(h.b, s.b)))).toBe(true);
  });
  it('exploded: the hole segments move with their part and the sheet draws them (Review Focus 3)', () => {
    const offsets = new Map([['s', [0, 10, 0] as [number, number, number]]]);
    const d0 = drawView([holed()], ISO);
    const d1 = drawView([holed()], ISO, offsets);
    // The hole lines are there: more visible lines than the same part without holes.
    expect(d0.visible.length).toBeGreaterThan(drawView([box('s', 30, 11.25, 0.75)], ISO).visible.length);
    expect(d1.visible.length).toBe(d0.visible.length);
    const dy = ISO.up[1]! * 10;
    d0.visible.forEach((s, i) => expect(d1.visible[i]!.a[1]).toBeCloseTo(s.a[1] + dy, 9));
  });
});

describe('curved parts on the sheet (curves spec §5.1; Q2, Q3, Q4)', () => {
  // On edge: length on X, width on Y (up), thickness on Z (the Front view looks down the thickness).
  // Arch: R = 48.75, centre (15, -47.25) in (length, width); 18 model chords, 3 fine pieces each (Task 1's derivation).
  const arch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 }) };
  const apron = (cuts: Board['cuts'] = []) => box('ap', 30, 5, 0.75, [0, 0, 0], { posture: 'on-edge', curves: [arch], cuts });
  const off = ([x, y]: readonly number[]) => Math.abs(Math.hypot(x! - 15, y! + 47.25) - 48.75);
  const arcPieces = (segs: Seg2[]) => segs.filter((s) => off(s.a) < 1e-9 && off(s.b) < 1e-9 && !(Math.abs(s.a[1]) < 1e-9 && Math.abs(s.b[1]) < 1e-9));

  it('Front: the arch is 54 fine pieces on the true arc, visible on the near face and hidden on the far one', () => {
    const d = drawView([apron()], FRONT);
    expect(arcPieces(d.visible)).toHaveLength(54);
    expect(arcPieces(d.hidden)).toHaveLength(54);
  });

  it('the visible/hidden split is the model chords\' (Q2): every curved part\'s totals match chunk 1 within the sagitta', () => {
    const d = drawView([apron()], FRONT);
    const arcLen = 48.75 * 2 * Math.asin(12 / 48.75); // 24.249
    expect(total(arcPieces(d.visible))).toBeCloseTo(arcLen, 2);
    expect(total(arcPieces(d.hidden))).toBeCloseTo(arcLen, 2);
  });

  it('a dado splitting a chord: the drawn piece ends exactly at the dado wall (Q4), interior points on the arc', () => {
    const dado = { id: 'd', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 14.5, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 };
    const d = drawView([apron([dado])], FRONT);
    const all = [...d.visible, ...d.hidden];
    const atWall = all.flatMap((s) => [s.a, s.b]).filter((p) => Math.abs(p[0] - 14.5) < 1e-9 && p[1] > 1e-6 && p[1] < 4); // not the wall's far end at y = 5
    expect(atWall.length).toBeGreaterThan(0);
    for (const p of atWall) expect(off(p)).toBeLessThan(0.005);
    for (const p of all.flatMap((s) => [s.a, s.b])) {
      if (p[1] > 1e-6 && p[1] < 1.5 + 1e-9 && Math.abs(p[0] - 14.5) > 1e-9 && Math.abs(p[0] - 15.5) > 1e-9 && p[0] > 3 && p[0] < 27) {
        expect(off(p)).toBeLessThan(1e-9);
      }
    }
  });

  it('a part in front hides the arch mid-chord: the cut is a point ON the fine path, not on the chord', () => {
    // x = 14.2 (the cut lands within 1e-3 of it: the path bulges off the chord) falls inside the model chord 13.653..15.0 (18 chords, symmetric about x = 15): the visible near-face arc
    // stops at the interpolated path point, within the path's 0.001" of the true arc.
    const d = drawView([apron(), box('front', 8, 1, 5, [14.2, 0, 3])], FRONT);
    const ends = d.visible.filter((s) => s.part === 'ap').flatMap((s) => [s.a, s.b]).filter((p) => Math.abs(p[0] - 14.2) < 1e-3 && p[1] > 1e-6 && p[1] < 4);
    expect(ends.length).toBeGreaterThan(0);
    for (const p of ends) expect(off(p)).toBeLessThan(0.0015);
  });

  it('edge-on (Side looks along the length, in the arch\'s plane): chunk 1\'s chords, unrefined (Q3)', () => {
    // Measured on master 54ea740: Side draws 4 visible and 42 hidden chord segments for this apron; ruling Q1 adds the crown.
    const d = drawView([apron()], SIDE);
    expect(d.visible).toHaveLength(4);
    expect(d.hidden).toHaveLength(43);
    // The crown (15, 1.5) is model vertex 9 of 18 (fraction 1/2), a silhouette looking along the length; the wood beyond
    // it along +X hides it: one hidden 3/4" line at y = 1.5 (Side's right is -Z: x from -0.75 to 0).
    expect(total(horizontalAt(d.hidden, 1.5))).toBeCloseTo(0.75, 9);
    expect(total(horizontalAt(d.visible, 1.5))).toBe(0);
  });

  const POSTURES = ['flat', 'on-edge', 'upright'] as const;
  const TURNS = [0, 90, 180, 270] as const;
  // Matched by distance (1e-9), not by rounding: a rounding bucket splits two equal points that straddle its boundary
  // (measured on flat 90/270: points 2e-14 apart landed in -2 and -2.000001), which is noise, not a difference.
  const near = (a: number[][], b: number[][]) => {
    if (a.length !== b.length) return false;
    const used = new Array<boolean>(b.length).fill(false);
    return a.every((p) => {
      const k = b.findIndex((q, i) => !used[i] && Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!) < 1e-9);
      if (k < 0) return false;
      used[k] = true;
      return true;
    });
  };
  it.each(POSTURES.flatMap((posture) => TURNS.map((rotation) => ({ posture, rotation }))))(
    '%o: a mirrored curved part draws the reflection across x = 0 (Front and Plan)',
    ({ posture, rotation }) => {
      const b = { ...chiralCurved(posture), rotation, position: [2, 1, -3] as [number, number, number] };
      for (const v of [FRONT, TOP]) {
        const pts = (d: ReturnType<typeof drawView>) => [...d.visible, ...d.hidden].flatMap((s) => [[...s.a], [...s.b]]);
        const reflected = pts(drawView([b], v)).map(([x, y]) => [0 - x!, y!]);
        expect(near(pts(drawView([mirrorPart(b)], v)), reflected)).toBe(true);
        expect(total(drawView([mirrorPart(b)], v).visible)).toBeCloseTo(total(drawView([b], v).visible), 6);
      }
    },
  );
});

describe('curved surfaces draw their silhouettes (ruling Q1)', () => {
  // Flat: length X, thickness Y (up), width Z. Four 2" corners on a 36 x 20 x 3/4 top. Before chunk 2 its Front and Side
  // elevations had NO vertical line at either end (probe on master 54ea740).
  const top = box('t', 36, 20, 0.75, [0, 0, 0], { curves: defaultCorners({ length: 36, width: 20, thickness: 0.75 }).map((c, i) => ({ id: `c${i}`, ...c })) });
  it('Front: each end closes — one visible and one hidden 3/4" line at x = 0 and at x = 36', () => {
    const d = drawView([top], FRONT);
    for (const x of [0, 36]) {
      expect(total(verticalAt(d.visible, x))).toBeCloseTo(0.75, 9);
      expect(total(verticalAt(d.hidden, x))).toBeCloseTo(0.75, 9);
    }
  });
  it('Front: the tangent joins on the front and back faces (x = 1, the corner radius) draw no line', () => {
    const d = drawView([top], FRONT);
    for (const x of [1, 35]) {
      expect(total(verticalAt(d.visible, x))).toBe(0);
      expect(total(verticalAt(d.hidden, x))).toBe(0);
    }
  });
  it('Side: each end closes at x = 0 and x = -20 (Side\'s right is -Z)', () => {
    const d = drawView([top], SIDE);
    for (const x of [0, -20]) expect(total(verticalAt(d.visible, x))).toBeCloseTo(0.75, 9);
    // The silhouettes are at world x = 1 and x = 35 (the corner joins), z = 0 and 20 -> screen x = 0 and -20. The near
    // pair (x = 35) is visible, the far pair (x = 1) hides behind the part; both are asserted so a far line wrongly
    // turning visible (a visible total of 1.5) is caught.
    for (const x of [0, -20]) expect(total(verticalAt(d.hidden, x))).toBeCloseTo(0.75, 9);
  });
  it('Plan looks down the thickness: no silhouettes (the outline is the drawing)', () => {
    expect(curveSilhouettes(top, [0, 1, 0])).toHaveLength(0);
  });
});

describe('a shallow chord does not hide its own silhouette (review fix, ruling Q1)', () => {
  // Flat span x 12 x 3/4, a bow along the length on the width-min side, seen from Side (toward +X, screen x = -z, y = height).
  // Looking along the bow, the silhouette is where the bowed face's normal turns through edge-on: at the crown for 30 x 0.25
  // (8 chords: the crown, world (15, z = 0), is a vertex -> screen x = 0), and at the two vertices flanking the crown for
  // 60 x 0.1 (24 chords: world x = 24 and 36, z = 0.004 -> screen x = -0.004; one is near the viewer, one behind). The
  // chords there leave the face at n.toward ~ 4e-3 and 2.7e-3, so a fixed lift toward the viewer (1e-4) cleared them by
  // ~4e-7, less than the occluders' DRAW_EPS / 2 growth, and the near line read hidden (visible 0, hidden 0.75).
  const bow = (span: number, rise: number) =>
    box('b', span, 12, 0.75, [0, 0, 0], { curves: [{ id: 'bw', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span, rise }) }] });
  it.each([[30, 0.25, 0], [60, 0.1, -0.004]])('span %d rise %d: a 3/4" visible silhouette at screen x = %d', (span, rise, sx) => {
    const d = drawView([bow(span, rise)], SIDE);
    const near = (segs: Seg2[]) => total(segs.filter((s) => Math.abs(s.a[0] - sx) < 5e-4 && Math.abs(s.b[0] - sx) < 5e-4 && Math.abs(s.a[0] - s.b[0]) < 1e-9));
    expect(near(d.visible)).toBeCloseTo(0.75, 9);
  });
});

describe('a view drawn without hidden lines skips the hole lines that can only be hidden (fu 344)', () => {
  const pins = (b: Board): HoleRow[] => {
    const r = { id: 'f', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const,
      alongFrom: 'min' as const, station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min' as const, inset: 1.5 };
    return [r, { ...r, id: 'b', acrossFrom: 'max' as const }].map((x) => ({ ...x, inset: Math.min(x.inset, b.width / 2) }));
  };
  const key = (s: Seg2) => `${s.a.join(',')}|${s.b.join(',')}|${s.part}`;
  const same = (parts: Board[], offsets?: Map<string, [number, number, number]>) => {
    const all = drawView(parts, ISO, offsets);
    const vis = drawView(parts, ISO, offsets, { hiddenLines: false });
    return { equal: JSON.stringify(vis.visible.map(key)) === JSON.stringify(all.visible.map(key)), all, vis };
  };
  it('a drilled pair of sides, exploded: the same visible lines, far fewer hidden ones', () => {
    const s = createBoard({ id: 'L', length: 30, width: 11.25, thickness: 0.75, posture: 'upright' });
    const sides = [{ ...s, holes: pins(s) }, { ...s, id: 'R', position: [24, 0, 0] as [number, number, number], holes: pins(s) }];
    const { equal, all, vis } = same(sides, new Map([['R', [6, 0, 0]]]));
    expect(equal).toBe(true);
    expect(vis.hidden.length).toBeLessThan(all.hidden.length / 4);
  });
  it('a FAULTED bore (its wall runs out of the edge into air) keeps every line: the same visible lines', () => {
    const b = createBoard({ id: 'p', length: 10, width: 4, thickness: 1 });
    const out: HoleRow = { id: 'o', face: 'thickness', from: 'max', diameter: 1, depth: 0.5, along: 'length', alongFrom: 'min',
      station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.25 };
    const holed = { ...b, holes: [out] };
    expect(partGeometry(holed).holes.every((h) => !holeInStock(holed, h, stockChecks(holed)))).toBe(true);
    const { equal } = same([holed]);
    expect(equal).toBe(true);
  });
});

describe('drawView: feature tags (feature callouts spec §4.1)', () => {
  const tags = (segs: Seg2[]) => new Set(segs.flatMap((s) => (s.feature ? [s.feature] : [])));
  it('a part with no features draws byte-for-byte as before: no segment carries the key at all', () => {
    const d = drawView([box('p', 10, 4, 2)], FRONT);
    for (const s of [...d.visible, ...d.hidden]) expect('feature' in s).toBe(false);
  });
  it('a hole row: its rims are tagged in its true view (Plan) and its walls in Front', () => {
    const b = box('s', 30, 11.25, 0.75);
    const pin = { id: 'r', ...defaultShelfPinRow(b)! };
    const withPins = { ...b, holes: [pin] };
    expect(tags(drawView([withPins], TOP).visible)).toEqual(new Set(['s:hole:r']));
    const front = drawView([withPins], FRONT);
    expect(tags([...front.visible, ...front.hidden]).has('s:hole:r')).toBe(true);
  });
  it('tagging changes nothing else: the same segments, in the same order, with the key removed', () => {
    const b = box('s', 30, 11.25, 0.75);
    const withPins = { ...b, holes: [{ id: 'r', ...defaultShelfPinRow(b)! }] };
    const strip = (segs: Seg2[]) => segs.map(({ a, b: e, part }) => ({ a, b: e, part }));
    for (const v of [FRONT, SIDE, TOP]) {
      const d = drawView([withPins], v);
      const again = drawView([withPins], v);
      expect(strip(d.visible)).toEqual(strip(again.visible));
      expect(d.visible.length + d.hidden.length).toBeGreaterThan(0);
    }
  });
  it('an angle cut: the taper face edges are tagged by plane membership', () => {
    const leg = box('L', 28, 1.75, 1.75, [0, 0, 0], { angleCuts: [{ id: 't', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 20, amount: 0.5 }) }] });
    const all = (v: typeof FRONT) => { const d = drawView([leg], v); return tags([...d.visible, ...d.hidden]); };
    expect(all(FRONT).has('L:angle:t') || all(TOP).has('L:angle:t')).toBe(true);
    // An edge NOT on the taper's plane is untagged: the far end's square edges.
    const d = drawView([leg], SIDE);
    expect(d.visible.some((s) => !s.feature)).toBe(true);
  });
  it('an angle cut that removes nothing tags no edge, though its plane holds the part\'s own face (final review #2)', () => {
    const none = { id: 'z', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0], [20, 0]] as [[number, number], [number, number]] };
    const rail = box('r', 20, 3, 0.75, [0, 0, 0], { angleCuts: [none] });
    for (const v of [FRONT, SIDE, TOP]) {
      const d = drawView([rail], v);
      expect(tags([...d.visible, ...d.hidden]).size).toBe(0);
    }
  });
  it('a curve: arc chords in its true view and silhouettes across it are tagged', () => {
    const apron = box('a', 30, 5, 0.75, [0, 0, 0], { curves: [ARCH] });
    expect(tags(drawView([apron], TOP).visible).has('a:curve:c1')).toBe(true);
    const f = drawView([apron], FRONT);
    expect(tags([...f.visible, ...f.hidden]).has('a:curve:c1')).toBe(true);
    // The crown's silhouette shows looking along the length (Side), where the arch's normals turn across the view: it runs
    // along `through` (thickness: vertical); chords lie in length × width planes (horizontal there).
    const sv = drawView([apron], SIDE);
    const vertical = [...sv.visible, ...sv.hidden].filter((s) => s.feature === 'a:curve:c1' && Math.abs(s.a[0] - s.b[0]) < 1e-9 && Math.abs(s.a[1] - s.b[1]) > 1e-9);
    expect(vertical.length).toBeGreaterThan(0);
  });
  it('four corners: every corner tagged with its own id (one feature owns all four, Task 1)', () => {
    const top = box('p', 36, 20, 0.75);
    const four = defaultCorners(top).map((c, i) => ({ id: `k${i}`, ...c }));
    expect(tags(drawView([{ ...top, curves: four }], TOP).visible)).toEqual(new Set(four.map((c) => `p:curve:${c.id}`)));
  });
});

describe('drawings read the lean (splayed legs spec §6.1 R1–R3, §6.2)', () => {
  const T8 = slopeOf(8);
  const T12 = slopeOf(12);
  /** Rake 8° (world Z), splay 12° (world X): both slopes non-zero and unequal (the `chiralPart` rule). */
  const LEAN: Lean = { x: T12, z: T8, face: 'width' };
  const legOf = (over: Partial<Board> = {}): Board =>
    createBoard({ id: 'L', name: 'Leg', length: 16, width: 1.5, thickness: 1.25, posture: 'upright', position: [0.123, 0, 0.456], lean: LEAN, ...over });
  const levelled = (b: Board): Board => {
    const p = levelPlan(b, IMPERIAL);
    if (typeof p === 'string') throw new Error(p);
    return { ...b, length: p.length, position: p.position, angleCuts: p.angleCuts };
  };
  const P = (v: readonly number[]) => ({ length: v[0]!, width: v[1]!, thickness: v[2]! });
  const dotv = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  /** A face's world outward normal, off `toWorld` (which composes the lean, R1): independent of `worldBodies`. */
  const worldNormal = (b: Board, f: BodyFace): Vec3 => {
    const v0 = f.verts[0]!;
    const a = toWorld(b, P(v0));
    const tip = toWorld(b, P([v0[0] + f.n[0], v0[1] + f.n[1], v0[2] + f.n[2]]));
    return [tip[0] - a[0], tip[1] - a[1], tip[2] - a[2]];
  };
  /** The lines of a single CONVEX part as an oracle: each body edge (two faces sharing two vertices) is visible exactly
   *  when one of its two faces faces the viewer. Total projected lengths, visible and hidden. */
  function convexOracle(b: Board, view: View): { visible: number; hidden: number } {
    const [body] = partGeometry(b).bodies;
    expect(partGeometry(b).bodies).toHaveLength(1);
    const faces = body!.faces;
    const same = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!) <= 1e-9;
    let visible = 0;
    let hidden = 0;
    for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
      const shared = faces[i]!.verts.filter((p) => faces[j]!.verts.some((q) => same(p, q)));
      if (shared.length !== 2) continue;
      const [A, E] = shared.map((p) => toWorld(b, P(p)));
      const l = Math.hypot(dotv(E!, view.right) - dotv(A!, view.right), dotv(E!, view.up) - dotv(A!, view.up));
      const faces2 = [faces[i]!, faces[j]!].map((f) => dotv(worldNormal(b, f), view.toward));
      if (faces2.some((x) => x > 1e-9)) visible += l; else hidden += l;
    }
    return { visible, hidden };
  }

  it('a leaning leg\'s Front view: the lowest visible line of a levelled leg lies on y = 0, ending at the projected foot vertices', () => {
    const b = levelled(legOf());
    const foot = b.angleCuts.find((c) => c.from === 'min' && c.face === 'length')!;
    const footVerts = partGeometry(b).bodies.flatMap((body) => body.faces).filter((f) => f.cut === foot.id)
      .flatMap((f) => f.verts.map((v) => toWorld(b, P(v))));
    expect(footVerts.length).toBeGreaterThan(0);
    for (const v of footVerts) expect(Math.abs(v[1])).toBeLessThanOrEqual(1e-9);
    const xs = footVerts.map((v) => v[0]);
    const d = drawView([b], FRONT);
    const lowest = Math.min(...d.visible.flatMap((s) => [s.a[1], s.b[1]]));
    expect(Math.abs(lowest)).toBeLessThanOrEqual(1e-9);
    // The twist turns the foot in plan, so the Front view sees two foot edges meeting at the front corner: together they run
    // from the leftmost foot vertex to the rightmost, and every end is a projected foot vertex.
    const onFloor = d.visible.filter((s) => Math.abs(s.a[1]) <= 1e-9 && Math.abs(s.b[1]) <= 1e-9);
    expect(onFloor.length).toBeGreaterThan(0);
    for (const s of onFloor) for (const p of [s.a, s.b]) expect(Math.min(...xs.map((x) => Math.abs(x - p[0])))).toBeLessThanOrEqual(1e-9);
    expect(Math.min(...onFloor.flatMap((s) => [s.a[0], s.b[0]]))).toBeCloseTo(Math.min(...xs), 9);
    expect(Math.max(...onFloor.flatMap((s) => [s.a[0], s.b[0]]))).toBeCloseTo(Math.max(...xs), 9);
    expect(total(onFloor)).toBeCloseTo(Math.max(...xs) - Math.min(...xs), 9);
  });

  /** Inches: a hidden span's ends are trimmed by DRAW_EPS-scale amounts (1e-6; the clip's grown, sampled ray), so totals over a
   *  dozen edges agree with the oracle to a few 1e-6 (measured ≤ 2.3e-6), never exactly. */
  const TRIM = 1e-5;
  const agrees = (b: Board, view: View) => {
    const want = convexOracle(b, view);
    const d = drawView([b], view);
    expect.soft(Math.abs(total(d.visible) - want.visible), `${view.title} visible`).toBeLessThanOrEqual(TRIM);
    expect.soft(Math.abs(total(d.hidden) - want.hidden), `${view.title} hidden`).toBeLessThanOrEqual(TRIM);
  };

  it('the oracle agrees with today\'s drawing of an unleaned box and leg (so the lean checks below are not vacuous)', () => {
    for (const b of [legOf({ lean: undefined }), box('q', 3, 2, 1, [0.5, 0.25, 0.125])]) for (const view of [FRONT, SIDE, TOP, ISO]) agrees(b, view);
  });

  it.each([['levelled (planes path)', true], ['uncut (the box body, R3)', false]] as const)(
    'a %s leaning leg hides exactly the lines its own leaned wood hides, in every view', (_, cut) => {
      const b = cut ? levelled(legOf()) : legOf();
      expect(partGeometry(b).bodies[0]!.box !== null).toBe(!cut);
      for (const view of [FRONT, SIDE, TOP, ISO]) agrees(b, view);
    });

  it('a drawing\'s bounds are the leaning part\'s real bounds (R2), never its pre-lean box', () => {
    const b = levelled(legOf());
    const r = partBounds(b);
    for (const view of [FRONT, SIDE, TOP]) {
      const d = drawView([b], view);
      const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [(k & 1 ? r.max : r.min)[0], (k & 2 ? r.max : r.min)[1], (k & 4 ? r.max : r.min)[2]]);
      const sx = corners.map((c) => dotv(c, view.right));
      const sy = corners.map((c) => dotv(c, view.up));
      expect(d.bounds.min[0]).toBeCloseTo(Math.min(...sx), 12);
      expect(d.bounds.max[0]).toBeCloseTo(Math.max(...sx), 12);
      expect(d.bounds.min[1]).toBeCloseTo(Math.min(...sy), 12);
      expect(d.bounds.max[1]).toBeCloseTo(Math.max(...sy), 12);
    }
  });

  it('dimension chains use real extents: a seat on levelled legs dimensions its real height', () => {
    const leg = levelled(legOf());
    // The level top cut sits at the pivot's height (16), the foot on the floor; the seat rests on the tops.
    const seat = box('S', 20, 14, 1, [-5, 16, -5]);
    const d = dimensionView([leg, seat], FRONT, IMPERIAL);
    expect(d.vertical.overall!.from).toBeCloseTo(0, 9);
    expect(d.vertical.overall!.to).toBe(17);
    expect(d.vertical.overall!.label).toBe('17"');
  });

  it('another part still hides a leaning leg (the own-wood lift skips no other wood): a seat over it hides it in Plan', () => {
    const leg = levelled(legOf());
    const seat = box('S', 20, 14, 1, [-5, 16, -5]);
    const d = drawView([leg, seat], TOP);
    expect(total(d.visible, 'L')).toBe(0);
    expect(total(d.hidden, 'L')).toBeGreaterThan(0);
    // The seat's lift-free probe is unchanged by the leg beneath it: its four plan edges are visible.
    expect(total(d.visible, 'S')).toBeCloseTo(2 * (20 + 14), 9);
  });

  it('a hand-loaded leaning part with holes still draws (the occluder stays hole-free, inv 47)', () => {
    const b = levelled(legOf());
    const row = defaultShelfPinRow(b);
    expect(row).not.toBeNull();
    const holed: Board = { ...b, holes: [{ ...row!, id: 'h' }] };
    expect(() => drawView([holed], FRONT)).not.toThrow();
    expect(total(drawView([holed], FRONT).visible)).toBeGreaterThan(0);
  });

  it('a curved leaning leg draws its silhouette where its LEANED faces turn from the view (silhouetteLines gets the world view)', () => {
    const corner = { id: 'rc', ...cornerCurve({ through: 'length', uFrom: 'min', vFrom: 'max', radius: 0.5 }) };
    const b = legOf({ width: 1.5, thickness: 1.5, curves: [corner] });
    // The oracle: two adjacent faces of the curve whose world normals face opposite ways to the view; their shared line,
    // projected, must be drawn (a smooth join draws nothing else, inv 16).
    const faces = partGeometry(b).bodies.flatMap((body) => body.faces).filter((f) => f.curve === 'rc');
    const same = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!) <= 1e-9;
    let found = 0;
    for (const view of [ISO, FRONT, SIDE]) {
      const d = drawView([b], view);
      const drawn = [...d.visible, ...d.hidden].filter((s) => s.feature === 'L:curve:rc');
      for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) {
        const [s1, s2] = [faces[i]!, faces[j]!].map((f) => dotv(worldNormal(b, f), view.toward));
        if (!(s1! * s2! < 0 && Math.abs(s1!) > 1e-9 && Math.abs(s2!) > 1e-9)) continue;
        const shared = faces[i]!.verts.filter((p) => faces[j]!.verts.some((q) => same(p, q)));
        if (shared.length !== 2) continue;
        const [A, E] = shared.map((p) => { const w = toWorld(b, P(p)); return [dotv(w, view.right), dotv(w, view.up)] as P2; });
        const L = Math.hypot(E![0] - A![0], E![1] - A![1]);
        // Drawn segments on that line: both ends within 1e-6 of it.
        const off = (p: P2) => Math.abs((E![0] - A![0]) * (p[1] - A![1]) - (E![1] - A![1]) * (p[0] - A![0])) / L;
        const on = drawn.filter((s) => off(s.a) <= 1e-6 && off(s.b) <= 1e-6);
        expect(total(on)).toBeCloseTo(L, 6);
        found += 1;
      }
    }
    expect(found).toBeGreaterThan(0);
  });
});
