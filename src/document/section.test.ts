import { createBoard, mirrorPart, pocketCells, keptHalfSpace, partGeometry, taperCut, miterCut, bevelCut, miterRatio, type Board, type Posture, type Rotation } from './document';
import { arcChords, arcOf, CURVE_SEGMENTS_MAX, CURVE_TOLERANCE } from './curves';
import { toWorld as toWorldOf } from './snapPoints';
import type { HoleRow, RoundTenon } from './types';
import { axisFrame, fromWorldOffset, toWorldOffset, DIMENSION_ORDER } from './geometry';
import { holePrism } from './holes';
import { keptBySection, sectionAxisIndex, sectionPlaneOf, sectionSpan, SECTION_EPS, sectionCaps, unionOutline, localCapPieces, type Section } from './section';
import { unionLoops } from './outline';
import { chooseFace, leanMap, slopeOf, worldSlopes } from './lean';
import { levelPlan } from './levelEnds';
import { IMPERIAL } from '../units/length';
import { partBounds } from './worldBounds';
import { chiralPart } from './turnFixtures';
import { stoolLegs } from './stoolFixture';
import type { V3 } from './angleCuts';

describe('section side test', () => {
  const front: Section = { axis: 'front', at: 3, flip: false };
  it('maps the axis to the world index of the standard view it is seen from', () => {
    expect(sectionAxisIndex('side')).toBe(0);
    expect(sectionAxisIndex('top')).toBe(1);
    expect(sectionAxisIndex('front')).toBe(2);
  });
  it('keeps the far side by default and the near side when flipped; on the plane is kept both ways', () => {
    expect(keptBySection(front, [0, 0, 2])).toBe(true);
    expect(keptBySection(front, [0, 0, 4])).toBe(false);
    expect(keptBySection({ ...front, flip: true }, [0, 0, 2])).toBe(false);
    expect(keptBySection({ ...front, flip: true }, [0, 0, 4])).toBe(true);
    expect(keptBySection(front, [0, 0, 3 + SECTION_EPS / 2])).toBe(true);
    expect(keptBySection({ ...front, flip: true }, [0, 0, 3 - SECTION_EPS / 2])).toBe(true);
    expect(keptBySection(front, [0, 0, 3 + 1e-5])).toBe(false);
  });
  it('keeps everything with no section', () => {
    expect(keptBySection(null, [0, 0, 1e9])).toBe(true);
  });
  it('reads only its own axis', () => {
    const side: Section = { axis: 'side', at: 1, flip: false };
    expect(keptBySection(side, [0.5, 100, 100])).toBe(true);
    expect(keptBySection(side, [1.5, -100, -100])).toBe(false);
  });
});

describe('sectionPlaneOf', () => {
  const signed = (s: Section, p: number[]) => {
    const { normal, constant } = sectionPlaneOf(s);
    return normal[0] * p[0]! + normal[1] * p[1]! + normal[2] * p[2]! + constant;
  };
  it('agrees with keptBySection on both sides, for every axis and both flips', () => {
    for (const axis of ['front', 'side', 'top'] as const) {
      for (const flip of [false, true]) {
        const s: Section = { axis, at: 2.5, flip };
        const k = sectionAxisIndex(axis);
        for (const v of [1, 4]) {
          const p = [7, 7, 7]; p[k] = v;
          expect(signed(s, p) >= 0).toBe(keptBySection(s, p));
        }
      }
    }
  });
});

describe('sectionSpan', () => {
  // Flat at turn 0: X = length, Y = thickness, Z = width.
  const a = createBoard({ id: 'a', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0] });
  const b = createBoard({ id: 'b', length: 10, width: 4, thickness: 0.75, position: [5, 1.5, -3] });
  it('is the drawn extent of the parts along the axis', () => {
    expect(sectionSpan([a, b], null, 'front')).toEqual([-3, 6]);
    expect(sectionSpan([a, b], null, 'top')).toEqual([0, 2.25]);
    expect(sectionSpan([a, b], null, 'side')).toEqual([0, 20]);
  });
  it('adds explode offsets (the parts where they are drawn)', () => {
    expect(sectionSpan([a, b], new Map([['b', [0, 10, 0]]]), 'top')).toEqual([0, 12.25]);
  });
  it('is null with no parts', () => {
    expect(sectionSpan([], null, 'front')).toBeNull();
  });
  it('a leaning part spans its real bounds, offsets added (splayed legs spec §6.1 R2)', () => {
    const base = createBoard({ id: 'L', length: 28, width: 1.5, thickness: 1.5, posture: 'upright', position: [1, 0, 2] });
    const leg: Board = { ...base, lean: { x: slopeOf(12), z: slopeOf(8), face: chooseFace(base, slopeOf(12), slopeOf(8)) } };
    const r = partBounds(leg);
    expect(sectionSpan([leg], null, 'side')).toEqual([r.min[0], r.max[0]]);
    expect(sectionSpan([leg], new Map([['L', [0, 0, 3]]]), 'front')).toEqual([r.min[2] + 3, r.max[2] + 3]);
    expect(sectionSpan([leg], null, 'side')).not.toEqual([1, 2.5]);
  });
});


type P3 = [number, number, number];
/** Newell area of a planar polygon. */
const area = (poly: readonly P3[]) => {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return Math.hypot(x, y, z) / 2;
};
const totalArea = (pieces: readonly P3[][]) => pieces.reduce((s, p) => s + area(p), 0);
/** Point in a convex planar polygon, projected off axis k. */
function inConvex(poly: readonly P3[], p: readonly number[], k: number): boolean {
  const [i, j] = [0, 1, 2].filter((d) => d !== k) as [number, number];
  let sign = 0;
  for (let n = 0; n < poly.length; n++) {
    const a = poly[n]!, b = poly[(n + 1) % poly.length]!;
    const c = (b[i] - a[i]) * (p[j]! - a[j]) - (b[j] - a[j]) * (p[i]! - a[i]);
    if (Math.abs(c) < 1e-12) continue;
    if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false;
  }
  return true;
}
/** Independent: world point → local through the frame, then in a pocket cell, kept by every angle cut, in no bore. */
const cellsOf = new WeakMap<Board, ReturnType<typeof pocketCells>>();   // pocketCells per sample made the sweep ~4 s a pose
function solidAt(b: Board, w: readonly number[]): boolean {
  const frame = axisFrame(b);
  const local: P3 = [0, 0, 0];
  frame.forEach(({ dim }, axis) => { local[DIMENSION_ORDER.indexOf(dim)] = fromWorldOffset(b, axis, w[axis]! - b.position[axis]!); });
  const [l, wd, t] = local;
  if (!cellsOf.has(b)) cellsOf.set(b, pocketCells(b));
  const inCell = cellsOf.get(b)!.some((r) => l > r.length[0] && l < r.length[1] && wd > r.width[0] && wd < r.width[1] && t > r.thickness[0] && t < r.thickness[1]);
  if (!inCell) return false;
  if (!b.angleCuts.every((c) => { const h = keptHalfSpace(b, c); return !h || h.n[0] * l + h.n[1] * wd + h.n[2] * t + h.d >= 0; })) return false;
  return !partGeometry(b).holes.some((h) => holePrism(h).every((q) => q.n[0] * l + q.n[1] * wd + q.n[2] * t + q.d >= 0));
}

const len = (segs: readonly [P3, P3][]) => segs.reduce((s, [a, b]) => s + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0);
const box = createBoard({ id: 'box', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0] });

describe('sectionCaps: a plain box', () => {
  it('front at 3 caps the full 20 × 1.5 section on z = 3', () => {
    const cap = sectionCaps(box, { axis: 'front', at: 3, flip: false })!;
    expect(totalArea(cap.pieces as P3[][])).toBeCloseTo(30, 9);
    for (const p of cap.pieces.flat()) expect(p[2]).toBeCloseTo(3, 12);
  });
  it('is the same cap flipped', () => {
    expect(totalArea(sectionCaps(box, { axis: 'front', at: 3, flip: true })!.pieces as P3[][])).toBeCloseTo(30, 9);
  });
  it('is null when the plane misses the part', () => {
    expect(sectionCaps(box, { axis: 'front', at: 7, flip: false })).toBeNull();
    expect(sectionCaps(box, { axis: 'top', at: -1, flip: true })).toBeNull();
  });
  it('caps an outer face lying on the plane when the part is on the kept side', () => {
    // top at 1.5, default keeps y ≤ 1.5: the box's top face is on the plane, facing the removed side.
    expect(totalArea(sectionCaps(box, { axis: 'top', at: 1.5, flip: false })!.pieces as P3[][])).toBeCloseTo(120, 9);
    // flipped, the box is all removed: nothing to cap.
    expect(sectionCaps(box, { axis: 'top', at: 1.5, flip: true })).toBeNull();
  });
});

describe('sectionCaps: explode offset', () => {
  it('a part offset by [0, 0, 5] cut at front 8 is capped as the same part moved by 5 and cut at 8', () => {
    const moved = { ...box, position: [0, 0, 5] as P3 };
    const a = sectionCaps(box, { axis: 'front', at: 8, flip: false }, [0, 0, 5])!;
    const b = sectionCaps(moved, { axis: 'front', at: 8, flip: false })!;
    expect(a.pieces).toEqual(b.pieces);
    for (const p of a.pieces.flat()) expect(p[2]).toBeCloseTo(8, 12);
  });
  it('an offset off the cut axis only translates the cap', () => {
    const a = sectionCaps(box, { axis: 'front', at: 3, flip: false }, [10, 0, 0])!;
    expect(Math.min(...a.pieces.flat().map((p) => p[0]))).toBeCloseTo(10, 12);
  });
});

describe('sectionCaps: holes', () => {
  const pin = { id: 'r1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.5,
    along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 2, acrossFrom: 'min' as const, inset: 1.5 };
  const drilled = createBoard({ id: 'd', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], holes: [pin] });
  it('across the bores: three 48-gon voids out of the 20 × 6 cap', () => {
    // top at 1.25: inside the pins' depth (1.0 … 1.5). 48-gon area = (n/2) r² sin(2π/n).
    const gon = (48 / 2) * 0.125 ** 2 * Math.sin((2 * Math.PI) / 48);
    const cap = sectionCaps(drilled, { axis: 'top', at: 1.25, flip: false })!;
    expect(totalArea(cap.pieces as P3[][])).toBeCloseTo(120 - 3 * gon, 6);
  });
  it('along the bores: a notch from the top edge per pin', () => {
    // front at z = 1.5 (the row's inset): each pin's section is its full diameter wide (the 48-gon's vertex-to-vertex
    // width along x through the centre is 2r) and 0.5 deep, from the top face down.
    const cap = sectionCaps(drilled, { axis: 'front', at: 1.5, flip: false })!;
    expect(totalArea(cap.pieces as P3[][])).toBeCloseTo(20 * 1.5 - 3 * 0.25 * 0.5, 6);
  });
  it('below the bores: untouched', () => {
    expect(totalArea(sectionCaps(drilled, { axis: 'top', at: 0.5, flip: false })!.pieces as P3[][])).toBeCloseTo(120, 9);
  });
});

describe('sectionCaps: headed bores (counterbores spec §6.2)', () => {
  const row = (over: Record<string, unknown>) => ({ id: 'c1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25,
    depth: 'through' as const, along: 'length' as const, alongFrom: 'min' as const, station: 6, count: 1, pitch: 0,
    acrossFrom: 'min' as const, inset: 3, ...over });
  const T = 0.75, R = 0.375, r = 0.125;
  const stock = 20 * T;
  const removed = (over: Record<string, unknown>) => {
    const part = createBoard({ id: 'h', length: 20, width: 6, thickness: T, position: [0, 0, 0], holes: [row(over) as HoleRow] });
    return stock - totalArea(sectionCaps(part, { axis: 'front', at: 3, flip: false })!.pieces as P3[][]);
  };
  it('a section through a counterbore\'s head is cut at R, below it at r', () => {
    const want = 2 * R * 0.25 + 2 * r * (T - 0.25);
    expect(removed({ head: 'counterbore', headDiameter: 0.75, headDepth: 0.25 })).toBeCloseTo(want, 1);
    expect(Math.abs(removed({ head: 'counterbore', headDiameter: 0.75, headDepth: 0.25 }) / want - 1)).toBeLessThan(0.01);
  });
  it('a countersink\'s cap follows the cone', () => {
    const reach = 0.25;   // (0.75 - 0.25) / 2 / tan 45 deg
    const want = (R + r) * reach + 2 * r * (T - reach);
    expect(Math.abs(removed({ head: 'countersink', headDiameter: 0.75, headAngle: 90 }) / want - 1)).toBeLessThan(0.01);
  });
  it('a blind counterbore is cut too, and a plane beside it leaves the cap whole', () => {
    const part = createBoard({ id: 'h', length: 20, width: 6, thickness: T, position: [0, 0, 0],
      holes: [row({ depth: 0.5, head: 'counterbore', headDiameter: 0.75, headDepth: 0.25 }) as HoleRow] });
    const cut = totalArea(sectionCaps(part, { axis: 'front', at: 3, flip: false })!.pieces as P3[][]);
    expect(Math.abs((stock - cut) / (2 * R * 0.25 + 2 * r * 0.25) - 1)).toBeLessThan(0.01);
    expect(totalArea(sectionCaps(part, { axis: 'front', at: 3.5, flip: false })!.pieces as P3[][])).toBeCloseTo(stock, 9);
  });
  it('a top plane inside the head is a ring of radius R, below it r', () => {
    const part = createBoard({ id: 'h', length: 20, width: 6, thickness: T, position: [0, 0, 0],
      holes: [row({ head: 'counterbore', headDiameter: 0.75, headDepth: 0.25 }) as HoleRow] });
    const gon = (48 / 2) * Math.sin((2 * Math.PI) / 48);
    expect(totalArea(sectionCaps(part, { axis: 'top', at: 0.6, flip: false })!.pieces as P3[][])).toBeCloseTo(120 - gon * R * R, 6);
    expect(totalArea(sectionCaps(part, { axis: 'top', at: 0.3, flip: false })!.pieces as P3[][])).toBeCloseTo(120 - gon * r * r, 6);
  });
  it('a through counterbore deeper than the part is still capped (its dead bore piece is skipped)', () => {
    expect(removed({ head: 'counterbore', headDiameter: 0.75, headDepth: 1 })).toBeGreaterThan(0);
  });
});

describe('sectionCaps: plane on a seam between cells is capped (spec amendment)', () => {
  // A dado across the width, 0.75 wide at x 10 … 10.75, 0.25 deep from the top, on a drilled part (so bodyMesh
  // subtracts seam faces). A plane exactly on the dado's shoulder must still read solid.
  const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10,
    width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
  const pin = { id: 'r1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.5,
    along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 1.5 };
  const part = createBoard({ id: 's', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], cuts: [dado], holes: [pin] });
  it('side at the shoulder, either way, caps the full section below and beside the dado', () => {
    for (const flip of [false, true]) {
      const cap = sectionCaps(part, { axis: 'side', at: 10, flip })!;
      expect(cap).not.toBeNull();
      // At x = 10 the stock is the full 6 × 1.5 on the kept-left side (flip false: the cell left of the shoulder's face),
      // and 6 × 1.25 under the dado on the right (flip true). Either is non-empty and inside the part.
      expect(totalArea(cap.pieces as P3[][])).toBeCloseTo(flip ? 6 * 1.25 : 6 * 1.5, 9);
    }
  });
});

describe('sectionCaps: the kept side follows a reversed axis (a plane on a shoulder tells the sides apart)', () => {
  const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10,
    width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
  const turned = createBoard({ id: 't', length: 20, width: 6, thickness: 1.5, rotation: 180, position: [0, 0, 0], cuts: [dado] });
  it('turned 180°, world x runs against the length: x ≤ 10 keeps the dado side, x ≥ 10 the full side', () => {
    expect(axisFrame(turned)[0]!.reversed).toBe(true);
    expect(totalArea(sectionCaps(turned, { axis: 'side', at: 10, flip: false })!.pieces as P3[][])).toBeCloseTo(6 * 1.25, 9);
    expect(totalArea(sectionCaps(turned, { axis: 'side', at: 10, flip: true })!.pieces as P3[][])).toBeCloseTo(6 * 1.5, 9);
  });
  it('turned 90° and cut on front, world z runs against the length: z ≤ 10 keeps the dado side', () => {
    const quarter = createBoard({ id: 'q', length: 20, width: 6, thickness: 1.5, rotation: 90, position: [0, 0, 0], cuts: [dado] });
    expect(axisFrame(quarter)[2]!.reversed).toBe(true);
    // z = 10 is the shoulder (length 10 either way, the extent being 0 … 20). Reversed: flip false keeps length ≥ 10, the
    // 6 × 1.25 slab under the dado; flip true keeps length ≤ 10, the full 6 × 1.5 block whose end face lies on the plane.
    const a = sectionCaps(quarter, { axis: 'front', at: 10, flip: false })!;
    const b = sectionCaps(quarter, { axis: 'front', at: 10, flip: true })!;
    expect(totalArea(a.pieces as P3[][])).toBeCloseTo(6 * 1.25, 9);
    expect(totalArea(b.pieces as P3[][])).toBeCloseTo(6 * 1.5, 9);
    expect(len(a.outline as [P3, P3][])).toBeCloseTo(2 * (6 + 1.25), 9);
    expect(len(b.outline as [P3, P3][])).toBeCloseTo(2 * (6 + 1.5), 9);
    expect(a.outline).toHaveLength(4);
    expect(b.outline).toHaveLength(4);
  });
});

describe('sectionCaps: every pose agrees with an independent inside-test', () => {
  const pin = { id: 'r1', face: 'thickness' as const, from: 'min' as const, diameter: 0.375, depth: 1,
    along: 'length' as const, alongFrom: 'min' as const, station: 14, count: 2, pitch: 2.5, acrossFrom: 'max' as const, inset: 2 };
  const AXES = ['side', 'top', 'front'] as const;   // index = world axis
  /** Three planes per axis; on each, a sample grid at irrational-ish offsets compared with `solidAt`. */
  function sweep(b: Board) {
    for (const axis of AXES) {
      const k = sectionAxisIndex(axis);
      const span = sectionSpan([b], null, axis)!;
      const [i, j] = [0, 1, 2].filter((d) => d !== k) as [number, number];
      const si = sectionSpan([b], null, AXES[i]!)!;
      const sj = sectionSpan([b], null, AXES[j]!)!;
      for (const frac of [0.2371, 0.5113, 0.8737]) {
        const at = span[0] + frac * (span[1] - span[0]);
        for (const flip of [false, true]) {
          const cap = sectionCaps(b, { axis, at, flip });
          for (let a = si[0] + 0.0731; a < si[1]; a += 0.4137) for (let c = sj[0] + 0.0519; c < sj[1]; c += 0.3311) {
            const p = [0, 0, 0]; p[k] = at; p[i] = a; p[j] = c;
            const inCap = !!cap && cap.pieces.some((poly) => inConvex(poly as P3[], p, k));
            expect(inCap, `${axis} at ${at} flip ${flip} sample ${p}`).toBe(solidAt(b, p));
          }
        }
      }
    }
  }
  const cases: [string, Board][] = [];
  for (const posture of ['flat', 'on-edge', 'upright'] as Posture[]) for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    const base: Board = { ...chiralPart(posture), holes: [pin], rotation, position: [1.25, 0.5, -2.75] };
    cases.push([`${posture} ${rotation}`, base]);
    cases.push([`${posture} ${rotation} mirrored`, mirrorPart(base)]);
  }
  it.each(cases)('%s', (_name, b) => sweep(b));
  it.each([['flat', 0], ['on-edge', 90], ['upright', 270]] as [Posture, Rotation][])('a tilted bore, %s %s, and its mirror (angled holes spec §6.2)', (posture, rotation) => {
    const tilted = { ...pin, id: 'tb', count: 1, depth: 'through' as const, tiltAlong: 0.6, tiltAcross: -0.35 };
    const base: Board = { ...chiralPart(posture), holes: [pin, tilted], rotation, position: [1.25, 0.5, -2.75] };
    sweep(base);
    sweep(mirrorPart(base));
  });
  it.each([['flat', 0], ['upright', 90]] as [Posture, Rotation][])('a tapered leg, %s %s (bodies clipped by an angle cut)', (posture, rotation) => {
    const leg = createBoard({ id: 'leg', length: 20, width: 2, thickness: 2, posture, rotation, position: [0.5, 0, 0.5],
      angleCuts: [{ id: 't1', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 15, amount: 0.75 }) }] });
    sweep(leg);
    sweep(mirrorPart(leg));
  });
  it.each([['flat', 0], ['on-edge', 90], ['upright', 270]] as [Posture, Rotation][])('a mitered and beveled rail, %s %s', (posture, rotation) => {
    const dims = { length: 16, width: 3, thickness: 1.25 };
    // A 45° miter at the max end across the width, and a 30° bevel along the max-width edge: sloped faces on two
    // different axes, so every section axis crosses at least one of them somewhere.
    const rail = createBoard({ id: 'rail', ...dims, posture, rotation, position: [0.5, 0.25, -1],
      angleCuts: [
        { id: 'm1', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, dims) },
        { id: 'b1', ...bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: miterRatio(30) }, dims) },
      ] });
    sweep(rail);
    sweep(mirrorPart(rail));
  });
});

describe('unionOutline', () => {
  it('two squares sharing an edge: the shared edge cancels', () => {
    // in plane z = 0 (li = 2), both CCW about +z
    const a: P3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
    const b: P3[] = [[1, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1, 0]];
    expect(len(unionOutline([a, b], 2) as [P3, P3][])).toBeCloseTo(6, 12);
  });
  it('a T-junction: a long edge against two short twins cancels exactly', () => {
    const big: P3[] = [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]];
    const s1: P3[] = [[0, 1, 0], [1, 1, 0], [1, 2, 0], [0, 2, 0]];
    const s2: P3[] = [[1, 1, 0], [2, 1, 0], [2, 2, 0], [1, 2, 0]];
    // union is the 2 × 2 square
    expect(len(unionOutline([big, s1, s2], 2) as [P3, P3][])).toBeCloseTo(8, 12);
  });
  it('a partial overlap leaves only the uncovered stretch', () => {
    const big: P3[] = [[0, 0, 0], [3, 0, 0], [3, 1, 0], [0, 1, 0]];
    const top: P3[] = [[1, 1, 0], [2, 1, 0], [2, 2, 0], [1, 2, 0]];
    // perimeter of the union: 3 + 1 + (1 + 1 + 1 + 1 + 1) + 1 = 10
    expect(len(unionOutline([big, top], 2) as [P3, P3][])).toBeCloseTo(10, 12);
  });
});

describe('unionLoops (fu 369): the same stretches, directed as the pieces run', () => {
  // Signed area of the directed stretches about +z: shoelace over each stretch (a closed boundary's sum is its area).
  const signed = (segs: [P3, P3][]) => segs.reduce((s, [p, q]) => s + (p[0] * q[1] - q[0] * p[1]) / 2, 0);
  it('a T-junction: the union runs counter-clockwise (area +4), the same stretches as unionOutline', () => {
    const big: P3[] = [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]];
    const s1: P3[] = [[0, 1, 0], [1, 1, 0], [1, 2, 0], [0, 2, 0]];
    const s2: P3[] = [[1, 1, 0], [2, 1, 0], [2, 2, 0], [1, 2, 0]];
    const loops = unionLoops([big, s1, s2], 2) as [P3, P3][];
    expect(signed(loops)).toBeCloseTo(4, 12);
    expect(len(loops)).toBeCloseTo(len(unionOutline([big, s1, s2], 2) as [P3, P3][]), 12);
  });
  it('a frame of four pieces round a gap: outer counter-clockwise, inner clockwise (area 9 − 1)', () => {
    const sq = (x0: number, y0: number, x1: number, y1: number): P3[] => [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]];
    const frame = [sq(0, 0, 3, 1), sq(0, 2, 3, 3), sq(0, 1, 1, 2), sq(2, 1, 3, 2)];
    const loops = unionLoops(frame, 2) as [P3, P3][];
    expect(signed(loops)).toBeCloseTo(8, 12);
    expect(len(loops)).toBeCloseTo(16, 12);
  });
});

// fu 348: across bores the outline is built from the unbored pieces and the rings; it must be what a union of the bored
// pieces gives (every segment of each lies on the other's). Overlapping bores fall back to the union itself.
const covers = (a: [P3, P3][], b: [P3, P3][]) => a.every(([p, q]) => {
  const m: P3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
  return b.some(([x, y]) => {
    const d = [y[0] - x[0], y[1] - x[1], y[2] - x[2]];
    const l2 = d[0]! ** 2 + d[1]! ** 2 + d[2]! ** 2;
    const t = Math.max(0, Math.min(1, ((m[0] - x[0]) * d[0]! + (m[1] - x[1]) * d[1]! + (m[2] - x[2]) * d[2]!) / l2));
    return Math.hypot(m[0] - x[0] - t * d[0]!, m[1] - x[1] - t * d[1]!, m[2] - x[2] - t * d[2]!) <= 1e-9;
  });
});

describe('sectionCaps outline', () => {
  it('across bores: the rectangle plus each 48-gon void', () => {
    const pin = { id: 'r1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.5,
      along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 2, acrossFrom: 'min' as const, inset: 1.5 };
    const b = createBoard({ id: 'v', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], holes: [pin] });
    const gonPerimeter = 48 * 2 * 0.125 * Math.sin(Math.PI / 48);
    expect(len(sectionCaps(b, { axis: 'top', at: 1.25, flip: false })!.outline as [P3, P3][])).toBeCloseTo(52 + 3 * gonPerimeter, 6);
  });
  const pinRow = (station: number, count: number) => ({ id: `r${station}`, face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.5,
    along: 'length' as const, alongFrom: 'min' as const, station, count, pitch: 2, acrossFrom: 'min' as const, inset: 1.5 });
  it('across bores, the built outline is the union of the bored pieces (fu 348)', () => {
    const b = createBoard({ id: 'v1', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], holes: [pinRow(2, 3)] });
    const cap = sectionCaps(b, { axis: 'top', at: 1.25, flip: false })!;
    const union = unionOutline(cap.pieces, 1) as [P3, P3][];
    expect(covers(cap.outline as [P3, P3][], union)).toBe(true);
    expect(covers(union, cap.outline as [P3, P3][])).toBe(true);
  });
  it('overlapping bores: the outline is the union\'s, not two whole rings (fu 348)', () => {
    const b = createBoard({ id: 'v2', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], holes: [pinRow(2, 1), pinRow(2.1, 1)] });
    const cap = sectionCaps(b, { axis: 'top', at: 1.25, flip: false })!;
    const union = unionOutline(cap.pieces, 1) as [P3, P3][];
    expect(covers(cap.outline as [P3, P3][], union)).toBe(true);
    expect(covers(union, cap.outline as [P3, P3][])).toBe(true);
  });
  it('a plain box: the rectangle', () => {
    expect(len(sectionCaps(box, { axis: 'front', at: 3, flip: false })!.outline as [P3, P3][])).toBeCloseTo(43, 9);
  });
  it('a notched part: one outline, no seam lines between pocket cells', () => {
    const b = { ...chiralPart('flat'), position: [0, 0, 0] as P3 };
    const s = { axis: 'side' as const, at: 4.375, flip: false };   // through c1's dado
    const cap = sectionCaps(b, s)!;
    for (const [p, q] of cap.outline as [P3, P3][]) {
      const m: P3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      const d: P3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      const l = Math.hypot(d[1], d[2]);
      const off: P3 = [0, (-d[2] / l) * 1e-4, (d[1] / l) * 1e-4];
      const left = solidAt(b, [m[0], m[1] + off[1], m[2] + off[2]]);
      const right = solidAt(b, [m[0], m[1] - off[1], m[2] - off[2]]);
      expect(left !== right, `segment ${p} → ${q}`).toBe(true);
    }
  });
  it('plane on a seam (a cut merged slab beside a neighbour face on the plane): one rectangle, no seam line', () => {
    const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10,
      width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const b = createBoard({ id: 'm', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], cuts: [dado] });
    expect(len(sectionCaps(b, { axis: 'side', at: 10, flip: false })!.outline as [P3, P3][])).toBeCloseTo(2 * (6 + 1.5), 9);
  });
  it('blind bore along its axis notches the outline (no line across the notch mouth)', () => {
    const pin = { id: 'r1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.5,
      along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 1.5 };
    const b = createBoard({ id: 'n', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], holes: [pin] });
    const cap = sectionCaps(b, { axis: 'front', at: 1.5, flip: false })!;
    expect(len(cap.outline as [P3, P3][])).toBeCloseTo(43 - 0.25 + 0.5 + 0.5 + 0.25, 6);
  });
});

// The linear-scan, per-interval-sum union outline as it stood before the bucketed/sweep rewrite (perf round): the
// optimised one must return exactly the same segments.
function referenceUnionOutline(pieces: readonly (readonly V3[])[], li: number): [V3, V3][] {
  const [i, j] = [0, 1, 2].filter((d) => d !== li) as [number, number];
  const plane = pieces[0]?.[0]?.[li] ?? 0;
  interface Line { dx: number; dy: number; c: number; spans: { t0: number; t1: number; w: number }[] }
  const lines: Line[] = [];
  for (const poly of pieces) {
    for (let n = 0; n < poly.length; n += 1) {
      const p = poly[n]!, q = poly[(n + 1) % poly.length]!;
      let dx = q[i] - p[i], dy = q[j] - p[j];
      const l = Math.hypot(dx, dy);
      if (l <= SECTION_EPS) continue;
      dx /= l; dy /= l;
      let w = 1;
      if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) { dx = -dx; dy = -dy; w = -1; }
      const c = -dy * p[i] + dx * p[j];                    // offset along the line's normal (−dy, dx)
      const ta = dx * p[i] + dy * p[j], tb = dx * q[i] + dy * q[j];
      let line = lines.find((m) => Math.abs(m.dx - dx) <= 1e-9 && Math.abs(m.dy - dy) <= 1e-9 && Math.abs(m.c - c) <= SECTION_EPS);
      if (!line) { line = { dx, dy, c, spans: [] }; lines.push(line); }
      line.spans.push({ t0: Math.min(ta, tb), t1: Math.max(ta, tb), w });
    }
  }
  const out: [V3, V3][] = [];
  const at = (m: Line, t: number): V3 => {
    const v: V3 = [0, 0, 0];
    v[li] = plane;
    v[i] = -m.dy * m.c + m.dx * t;
    v[j] = m.dx * m.c + m.dy * t;
    return v;
  };
  for (const m of lines) {
    const ts = m.spans.flatMap((s) => [s.t0, s.t1]).sort((a, b) => a - b);
    const cuts: number[] = [];
    for (const t of ts) if (!cuts.length || t - cuts[cuts.length - 1]! > SECTION_EPS) cuts.push(t);
    let runStart: number | null = null;
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      const mid = (cuts[k]! + cuts[k + 1]!) / 2;
      const sum = m.spans.reduce((s, sp) => s + (sp.t0 < mid && mid < sp.t1 ? sp.w : 0), 0);
      if (sum !== 0) { if (runStart === null) runStart = cuts[k]!; }
      else if (runStart !== null) { out.push([at(m, runStart), at(m, cuts[k]!)]); runStart = null; }
    }
    if (runStart !== null) out.push([at(m, runStart), at(m, cuts[cuts.length - 1]!)]);
  }
  return out;
}

describe('sectionCaps: tilted bores (angled holes spec §6.2)', () => {
  const DEG = Math.PI / 180;
  /** The 48-gon's area over the circle's: the prism's facets join ring vertices on the true circle. */
  const GON = (48 / (2 * Math.PI)) * Math.sin((2 * Math.PI) / 48);
  const tiltedPin = (over: Record<string, unknown> = {}) => ({ id: 't1', face: 'thickness' as const, from: 'max' as const,
    diameter: 0.5, depth: 'through' as const, along: 'length' as const, alongFrom: 'min' as const, station: 6, count: 1,
    pitch: 0, acrossFrom: 'min' as const, inset: 3, tiltAlong: Math.tan(20 * DEG), tiltAcross: Math.tan(10 * DEG), ...over });
  it('a tilted bore is subtracted from an unleaned part\'s cap', () => {
    // Flat at turn 0 (Y = thickness): a Top plane is face-parallel, and cuts the bore's true slice, an ellipse of area
    // π r² / cos(tilt) — |bit| = hypot(1, tan a, tan c) is 1 / cos(tilt) — strictly between mouth and exit.
    const b = createBoard({ id: 'tilt-across', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], holes: [tiltedPin()] });
    const bit = Math.hypot(1, Math.tan(20 * DEG), Math.tan(10 * DEG));
    const ellipse = Math.PI * 0.25 ** 2 * bit;
    for (const at of [0.3, 0.75, 1.2]) {
      const cap = sectionCaps(b, { axis: 'top', at, flip: false })!;
      const removed = 120 - totalArea(cap.pieces as P3[][]);
      expect(Math.abs(removed - ellipse)).toBeLessThan(0.01 * ellipse * GON);
      expect(Math.abs(removed - ellipse * GON)).toBeLessThan(1e-9);
      // The void sits where the bit has carried it: the mouth centre (6, 3) slid by (1.5 − at)·(tan a, tan c).
      const slid: P3 = [6 + (1.5 - at) * Math.tan(20 * DEG), at, 3 + (1.5 - at) * Math.tan(10 * DEG)];
      expect(cap.pieces.some((poly) => inConvex(poly as P3[], slid, 1))).toBe(false);
    }
  });
  it('the reach filter keeps a steep bore\'s far mouth', () => {
    // 40° along the length through 0.75: the exit centre is 0.75·tan 40° ≈ 0.629 along x, and the exit ellipse reaches
    // r / cos 40° ≈ 0.653 past it — x ≈ 6.282, beyond the mouth centre's radius + depth (5 + 1.25). A Side plane at 6.27
    // meets only that far tip.
    const pin = tiltedPin({ diameter: 1, station: 5, tiltAlong: Math.tan(40 * DEG), tiltAcross: undefined });
    const b = createBoard({ id: 'tilt-reach', length: 20, width: 6, thickness: 0.75, position: [0, 0, 0], holes: [pin] });
    const at = 6.27;
    expect(at - 5).toBeGreaterThan(0.5 + 0.75);
    const cap = sectionCaps(b, { axis: 'side', at, flip: false })!;
    expect(totalArea(cap.pieces as P3[][])).toBeLessThan(6 * 0.75 - 1e-4);
    // A point just above the exit face, inside the tip (independent: solidAt reads the prism, not the caps).
    const p: P3 = [at, 0.001, 3];
    expect(solidAt(b, p)).toBe(false);
    expect(cap.pieces.some((poly) => inConvex(poly as P3[], p, 0))).toBe(false);
  });
  it('overlapping tilted bores: the outline is the union\'s, not two whole rings', () => {
    // Tilted 40° across, their ellipses are 2 · 0.25 / cos 40° ≈ 0.65 across the width: 0.55 apart, they overlap, though
    // their ring[0] radii (0.25, the minor axis) say clear.
    const t = Math.tan(40 * DEG);
    const b = createBoard({ id: 'tilt-overlap', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], holes: [
      tiltedPin({ id: 'o1', inset: 2, tiltAlong: undefined, tiltAcross: t }),
      tiltedPin({ id: 'o2', inset: 2.55, tiltAlong: undefined, tiltAcross: t }),
    ] });
    const cap = sectionCaps(b, { axis: 'top', at: 0.75, flip: false })!;
    const union = unionOutline(cap.pieces, 1) as [P3, P3][];
    expect(covers(cap.outline as [P3, P3][], union)).toBe(true);
    expect(covers(union, cap.outline as [P3, P3][])).toBe(true);
  });
  it('a tilted bore beside a clean square ring: the outline still has the tilted bore (no ring path past it)', () => {
    const square = { id: 's1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 1,
      along: 'length' as const, alongFrom: 'min' as const, station: 12, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 3 };
    const b = createBoard({ id: 'tilt-mixed', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], holes: [square, tiltedPin()] });
    const cap = sectionCaps(b, { axis: 'top', at: 0.75, flip: false })!;
    const union = unionOutline(cap.pieces, 1) as [P3, P3][];
    expect(covers(cap.outline as [P3, P3][], union)).toBe(true);
    expect(covers(union, cap.outline as [P3, P3][])).toBe(true);
  });
});

describe('unionOutline equals the linear-scan reference', () => {
  const pin = (id: string, acrossFrom: 'min' | 'max') => ({
    id, face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const,
    alongFrom: 'min' as const, station: 2, count: 21, pitch: 32 / 25.4, acrossFrom, inset: 1.5,
  });
  const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
  const part = createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75, cuts: [dado], holes: [pin('r1', 'min'), pin('r2', 'max')] });
  it.each([
    ['across the bores', { axis: 'top', at: 0.6, flip: false }],
    ['along a row', { axis: 'front', at: 1.5, flip: false }],
    ['through the dado (seams between pocket cells)', { axis: 'side', at: 10.4, flip: false }],
    ['a pocket-cell seam plane', { axis: 'side', at: 10, flip: true }],
  ] as const)('%s', (_name, s) => {
    const local = localCapPieces(part, s)!;
    const got = unionOutline(local.pieces, local.li);
    expect(got.length).toBeGreaterThan(0);
    expect(got).toEqual(referenceUnionOutline(local.pieces, local.li));
  });
});

describe('unionOutline line grouping across a bucket edge', () => {
  // Two squares sharing the edge y = c in the plane x = 0 (li = 0, so i = y... pieces use [x, y, z]); the shared edge's
  // offset differs by 0.95e-7 (inside SECTION_EPS) and straddles a cell boundary of the 1e-6 quantum.
  it('cancels a seam whose two copies sit on either side of a cell edge', () => {
    const edge = 3e-6;                                   // a cell boundary of the 1e-6 quantum
    const a = edge - 0.5e-7, b = edge + 0.45e-7;
    // Counter-clockwise about +x in (y, z): piece 1 below the seam z = a, piece 2 above it at z = b.
    const lower: V3[] = [[0, 0, 0], [0, 1, 0], [0, 1, a], [0, 0, a]];
    const upper: V3[] = [[0, 0, b], [0, 1, b], [0, 1, 1], [0, 0, 1]];
    const seam = unionOutline([lower, upper], 0).filter(([p, q]) => Math.abs(p[2] - q[2]) < 1e-3 && p[2] > 1e-6 && p[2] < 0.5);
    expect(seam).toEqual([]);
    expect(unionOutline([lower, upper], 0).length).toBe(unionOutline([upper, lower], 0).length);
  });
});

describe('sectionCaps: the local cap cache (final review I3)', () => {
  const pin = { id: 'r1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const,
    alongFrom: 'min' as const, station: 2, count: 5, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
  const part = createBoard({ id: 'cached', length: 12, width: 6, thickness: 0.75, posture: 'upright', rotation: 90,
    position: [1, 0.5, -2], holes: [pin] });
  const s: Section = { axis: 'top', at: 3.3, flip: false };
  /** The same cap built cold: a part id no other call uses, so its slot is empty. */
  let cold = 0;
  const uncached = (b: Board, sec: Section, offset?: number[]) => { cold += 1; return sectionCaps({ ...b, id: `cold-${cold}` }, sec, offset); };
  const close = (a: readonly (readonly number[])[], b: readonly (readonly number[])[]) => {
    expect(a.length).toBe(b.length);
    a.forEach((p, n) => p.forEach((v, k) => expect(v).toBeCloseTo(b[n]![k]!, 9)));
  };
  it('a move across the plane\'s direction (same place in the part) gives the cap translated', () => {
    const first = sectionCaps(part, s)!;
    const moved = { ...part, position: [3.5, 0.5, 4] as P3 };
    const again = sectionCaps(moved, s)!;
    expect(again.pieces.length).toBe(first.pieces.length);
    first.pieces.forEach((poly, n) => close(again.pieces[n]!, poly.map((p) => [p[0] + 2.5, p[1], p[2] + 6])));
    expect(again).toEqual(uncached(moved, s));
  });
  it('a move ALONG the cut axis (a new place in the part) is rebuilt, not translated', () => {
    sectionCaps(part, s);
    const moved = { ...part, position: [1, 0.25, -2] as P3 };
    expect(sectionCaps(moved, s)).toEqual(uncached(moved, s));
  });
  it('the same id with new geometry at the same place is rebuilt (never a stale cap)', () => {
    sectionCaps(part, s);
    const resized = { ...part, thickness: 1 };              // upright: thickness is not the cut axis
    expect(sectionCaps(resized, s)).toEqual(uncached(resized, s));
    const drilled = { ...part, holes: [{ ...pin, count: 3 }] };
    expect(sectionCaps(drilled, s)).toEqual(uncached(drilled, s));
    const flipped = { ...s, flip: true };
    expect(sectionCaps(part, flipped)).toEqual(uncached(part, flipped));
  });
  it('mutating what localCapPieces or sectionCaps returned never reaches the next call', () => {
    const expected = uncached(part, s);
    const local = localCapPieces(part, s)!;
    local.pieces[0]![0]![0] = 999;
    local.pieces.length = 0;
    const world = sectionCaps(part, s)!;
    world.pieces[0]![0]![0] = 999;
    world.outline.length = 0;
    expect(sectionCaps(part, s)).toEqual(expected);
  });
});

describe('sectionCaps: a leaning part (splayed legs spec §6.2)', () => {
  const T8 = slopeOf(8);
  const T12 = slopeOf(12);
  const leanOf = (b: Board, x: number, z: number) => ({ x, z, face: chooseFace(b, x, z) });
  /** A 1.5-square leg, 28 long, upright: splay 12° on X, rake 8° on Z (both non-zero and unequal). */
  const legAt = (rotation: Rotation = 0, over: Partial<Board> = {}): Board => {
    const base = createBoard({ id: `lean-${rotation}`, length: 28, width: 1.5, thickness: 1.5, posture: 'upright', rotation,
      position: [1.25, 0.5, -2.75], ...over });
    return { ...base, lean: leanOf(base, T12, T8) };
  };
  /** Expected values off the slopes and the pivot alone (never `leanMap(b).m`, which is what is under test). */
  const axisOf = (b: Board) => {
    const [wx, wz] = worldSlopes(b);
    const len = Math.hypot(wx, 1, wz);
    const pivot = [b.position[0] + 0.75, b.position[1] + b.length, b.position[2] + 0.75];
    const mid = (k: number) => pivot[k]! + (b.length / 2) * [wx, -1, wz][k]! / len;
    return { wx, wz, len, mid };
  };

  it.each([0, 90] as Rotation[])('cap of a leaning leg, turned %s: a Top section is one 4-gon of 1.5 × 1.5 / cos(axis, normal)', (rotation) => {
    const leg = legAt(rotation);
    const { len, mid } = axisOf(leg);
    const at = mid(1);
    const cap = sectionCaps(leg, { axis: 'top', at, flip: false })!;
    expect(cap.pieces).toHaveLength(1);
    expect(cap.pieces[0]).toHaveLength(4);
    // cos between the leg's axis (wx, −1, wz)/len and the plane normal (0, 1, 0) is 1/len.
    expect(Math.abs(area(cap.pieces[0] as P3[]) - 2.25 * len)).toBeLessThan(1e-9);
    for (const p of cap.pieces.flat()) expect(Math.abs(p[1] - at)).toBeLessThan(1e-9);
    for (const [a, b] of cap.outline) { expect(Math.abs(a[1] - at)).toBeLessThan(1e-9); expect(Math.abs(b[1] - at)).toBeLessThan(1e-9); }
    expect(cap.outline).toHaveLength(4);
  });

  it.each([0, 90] as Rotation[])('cap of a leaning leg, turned %s: a Front section through the axis midpoint is one 4-gon of 1.5 × 1.5 / cos', (rotation) => {
    const leg = legAt(rotation);
    const { wz, len, mid } = axisOf(leg);
    expect(Math.abs(wz)).toBeGreaterThan(0.1);           // the plane is not parallel to the axis
    const at = mid(2);
    for (const flip of [false, true]) {
      const cap = sectionCaps(leg, { axis: 'front', at, flip })!;
      expect(cap.pieces).toHaveLength(1);
      expect(cap.pieces[0]).toHaveLength(4);             // the four long faces only: no end face is met
      expect(Math.abs(area(cap.pieces[0] as P3[]) - 2.25 * len / Math.abs(wz))).toBeLessThan(1e-9);
      for (const p of cap.pieces.flat()) expect(Math.abs(p[2] - at)).toBeLessThan(1e-9);
      expect(cap.outline).toHaveLength(4);
    }
  });

  it('a Set change (square-set legs §3.2) rebuilds the cached cap: same id, slopes, face, turn and pivot, never stale', () => {
    // The cache slot is keyed by part id, axis and side; only the `square` term of its geo key tells the two maps apart.
    const turned = legAt(0, { id: 'set-change' });
    const square: Board = { ...turned, lean: { ...turned.lean!, square: true } };
    const sec: Section = { axis: 'top', at: axisOf(turned).mid(1), flip: false };
    const a = sectionCaps(turned, sec)!;
    const b = sectionCaps(square, sec)!;
    expect(b).not.toEqual(a);
    expect(b).toEqual(sectionCaps({ ...square, id: 'set-change-cold' }, sec));
    // And back: the turned cap again, not the square one.
    expect(sectionCaps(turned, sec)).toEqual(sectionCaps({ ...turned, id: 'set-change-cold-turned' }, sec));
  });

  /** Independent of the caps: the drawn point mapped back through the lean, then the unleaned part's inside-test. */
  function sweepLeaning(b: Board) {
    const map = leanMap(b)!;
    for (const axis of ['side', 'top', 'front'] as const) {
      const k = sectionAxisIndex(axis);
      const [i, j] = [0, 1, 2].filter((d) => d !== k) as [number, number];
      const AX = ['side', 'top', 'front'] as const;
      const span = sectionSpan([b], null, axis)!;
      const si = sectionSpan([b], null, AX[i]!)!;
      const sj = sectionSpan([b], null, AX[j]!)!;
      for (const frac of [0.2371, 0.5113, 0.8737]) {
        const at = span[0] + frac * (span[1] - span[0]);
        for (const flip of [false, true]) {
          const cap = sectionCaps(b, { axis, at, flip });
          for (let a = si[0] + 0.0731; a < si[1]; a += 0.2137) for (let c = sj[0] + 0.0519; c < sj[1]; c += 0.3311) {
            const p: P3 = [0, 0, 0]; p[k] = at; p[i] = a; p[j] = c;
            const inCap = !!cap && cap.pieces.some((poly) => inConvex(poly as P3[], p, k));
            expect(inCap, `${axis} at ${at} flip ${flip} sample ${p}`).toBe(solidAt(b, map.inverse(p)));
          }
        }
      }
    }
  }
  const tapered = (rotation: Rotation) => legAt(rotation,
    { angleCuts: [{ id: 't1', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 15, amount: 0.5 }) }] });
  it.each([0, 90, 180, 270] as Rotation[])('every plane agrees with an independent inside-test: a tapered leaning leg turned %s, and its mirror', (rotation) => {
    sweepLeaning(tapered(rotation));
    sweepLeaning(mirrorPart(tapered(rotation)));
  });

  it('an explode offset caps the part where it is drawn (the same part moved by the offset)', () => {
    const leg = legAt(0);
    const o: P3 = [0.5, 2, 3];
    const moved = { ...leg, id: 'lean-moved', position: [leg.position[0] + o[0], leg.position[1] + o[1], leg.position[2] + o[2]] as P3 };
    for (const s of [{ axis: 'top', at: 16, flip: false }, { axis: 'front', at: axisOf(moved).mid(2), flip: true }] as Section[]) {
      const a = sectionCaps(leg, s, o)!;
      const b = sectionCaps(moved, s)!;
      expect(a.pieces.length).toBe(b.pieces.length);
      a.pieces.forEach((poly, n) => poly.forEach((p, m) => p.forEach((v, k) => expect(Math.abs(v - b.pieces[n]![m]![k]!)).toBeLessThan(1e-9))));
    }
  });

  it('a levelled foot lying ON a Top plane, on the kept side, is capped (the leg never reads hollow)', () => {
    const leg = legAt(0);
    const p = levelPlan(leg, IMPERIAL);
    if (typeof p === 'string') throw new Error(p);
    const levelled: Board = { ...leg, id: 'lean-levelled', length: p.length, position: p.position, angleCuts: p.angleCuts };
    const cap = sectionCaps(levelled, { axis: 'top', at: 0, flip: true })!;
    expect(cap).not.toBeNull();
    // A horizontal section of the 1.5-square prism: 1.5 × 1.5 · len, as above.
    expect(Math.abs(totalArea(cap.pieces as P3[][]) - 2.25 * axisOf(levelled).len)).toBeLessThan(1e-9);
    // Flipped the other way the whole leg is removed: nothing to cap.
    expect(sectionCaps(levelled, { axis: 'top', at: 0, flip: false })).toBeNull();
  });

  it('a leaning part\'s cap has its bores (fu 437\'s residue lifted)', () => {
    // The stool's Front right leg and its mirror, a square through hole across the width at mid-length. The world plane
    // square to the axis the width runs along, through the bore's mid-depth: the leaned slice of the bore is the 48-gon
    // over |cos| of the bore's world direction against the plane's normal (independent of the caps: two points through
    // the lean, never its matrix).
    const pin = { id: 'r1', face: 'width' as const, from: 'min' as const, diameter: 0.5, depth: 'through' as const,
      along: 'length' as const, alongFrom: 'min' as const, station: 8, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 0.75 };
    const gon = (48 / 2) * 0.25 ** 2 * Math.sin((2 * Math.PI) / 48);
    for (const plain of stoolLegs().slice(0, 2)) {
      const holed: Board = { ...plain, id: `${plain.id}-holed`, holes: [pin] };
      const map = leanMap(holed)!;
      const frame = axisFrame(holed);
      const world = (local: readonly number[]): P3 => map.apply(frame.map(({ dim }, k) =>
        holed.position[k]! + toWorldOffset(holed, k, local[DIMENSION_ORDER.indexOf(dim)]!, frame)) as P3) as P3;
      const c = world([8, 0.75, 0.75]);
      const e = world([8, 1.75, 0.75]);
      const dir = [e[0] - c[0], e[1] - c[1], e[2] - c[2]];
      const k = frame.findIndex(({ dim }) => dim === 'width');
      const axis = (['side', 'top', 'front'] as const)[k]!;
      for (const flip of [false, true]) {
        const s: Section = { axis, at: c[k]!, flip };
        const bored = sectionCaps(holed, s)!;
        const whole = sectionCaps(plain, s)!;
        expect(totalArea(whole.pieces as P3[][]) - totalArea(bored.pieces as P3[][])).toBeCloseTo(gon / Math.abs(dir[k]!), 9);
        expect(bored.pieces.some((poly) => inConvex(poly as P3[], c, k))).toBe(false);
        expect(whole.pieces.some((poly) => inConvex(poly as P3[], c, k))).toBe(true);
        const union = unionOutline(bored.pieces, k) as [P3, P3][];
        expect(covers(bored.outline as [P3, P3][], union)).toBe(true);
      }
    }
  });

  it('every plane agrees with an independent inside-test: a holed leaning leg, square and tilted bores', () => {
    const pins = [
      { id: 'h1', face: 'width' as const, from: 'max' as const, diameter: 0.5, depth: 0.75, along: 'length' as const,
        alongFrom: 'min' as const, station: 14, count: 2, pitch: 2, acrossFrom: 'min' as const, inset: 0.75 },
      { id: 'h2', face: 'thickness' as const, from: 'min' as const, diameter: 0.375, depth: 'through' as const, along: 'length' as const,
        alongFrom: 'max' as const, station: 6, count: 1, pitch: 0, acrossFrom: 'max' as const, inset: 0.75, tiltAlong: 0.5, tiltAcross: -0.25 },
    ];
    sweepLeaning({ ...tapered(0), id: 'lean-holed-sweep', holes: pins });
    sweepLeaning(mirrorPart({ ...tapered(90), id: 'lean-holed-sweep-90', holes: pins }));
  });

  it('localCapPieces is null for a leaning part (its cut is not one of the part\'s axis planes)', () => {
    expect(localCapPieces(legAt(0), { axis: 'top', at: 14, flip: false })).toBeNull();
  });

  describe('the local cap cache', () => {
    const s: Section = { axis: 'top', at: 14.3, flip: false };
    let cold = 0;
    const uncached = (b: Board, sec: Section, offset?: number[]) => { cold += 1; return sectionCaps({ ...b, id: `lean-cold-${cold}` }, sec, offset); };
    it('a lean edited with the part in place is rebuilt, never a stale cap', () => {
      const leg = legAt(0, { id: 'lean-cached' });
      sectionCaps(leg, s);
      const edited: Board = { ...leg, lean: { ...leg.lean!, x: slopeOf(10) } };
      expect(sectionCaps(edited, s)).toEqual(uncached(edited, s));
      expect(sectionCaps(edited, s)).not.toEqual(sectionCaps({ ...leg, id: 'lean-cold-orig' }, s));
      const turned: Board = { ...leg, lean: { ...leg.lean!, face: leg.lean!.face === 'width' ? 'thickness' : 'width' } };
      expect(sectionCaps(turned, s)).toEqual(uncached(turned, s));
    });
    it('a move across the plane\'s direction gives the cap translated', () => {
      const leg = legAt(0, { id: 'lean-cached-move' });
      const first = sectionCaps(leg, s)!;
      const moved = { ...leg, position: [leg.position[0] + 2.5, leg.position[1], leg.position[2] + 6] as P3 };
      const again = sectionCaps(moved, s)!;
      first.pieces.forEach((poly, n) => poly.forEach((p, m) => {
        const q = again.pieces[n]![m]!;
        expect(Math.abs(q[0] - p[0] - 2.5) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2] - 6)).toBeLessThan(1e-9);
      }));
      expect(again).toEqual(uncached(moved, s));
    });
    it('mutating what sectionCaps returned never reaches the next call', () => {
      const leg = legAt(0, { id: 'lean-cached-mut' });
      const expected = uncached(leg, s);
      const world = sectionCaps(leg, s)!;
      world.pieces[0]![0]![0] = 999;
      world.pieces.length = 0;
      world.outline.length = 0;
      expect(sectionCaps(leg, s)).toEqual(expected);
    });
  });
});

describe('sectionCaps: round tenons (round tenons spec §7)', () => {
  // An upright 2 x 2 x 20 leg (length on Y) with a 1" tenon 3" long at its top: the shoulder at y = 17.
  const r = 0.5;
  /** The inscribed polygon round the whole circle: 4 quarter arcs of `arcChords` chords, vertices ON the circle. */
  const sides = 4 * arcChords(arcOf([1, 0.5], [0.5, 1], 'left', { radius: r }, 0), CURVE_TOLERANCE, CURVE_SEGMENTS_MAX);
  const polyArea = (sides / 2) * r * r * Math.sin((2 * Math.PI) / sides);
  const gon48 = (48 / 2) * r * r * Math.sin((2 * Math.PI) / 48);
  const tenon: RoundTenon = { id: 't', end: 'max', diameter: 1, length: 3 };
  const leg = (id: string, extra: Partial<Board> = {}) =>
    createBoard({ id, name: 'Leg', length: 20, width: 2, thickness: 2, posture: 'upright', position: [0, 0, 0], tenons: [tenon], ...extra });
  const centroid = (pieces: readonly (readonly number[])[][]) => {
    const pts = pieces.flat();
    return [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k]!, 0) / pts.length);
  };

  it('a Top plane through the tenon caps a disc of radius r: the inscribed polygon, its outline the ring', () => {
    const b = leg('tenon-cap');
    const centre = toWorldOf(b, { length: 18.5, width: 1, thickness: 1 });
    const cap = sectionCaps(b, { axis: 'top', at: 18.5, flip: false })!;
    expect(Math.abs(totalArea(cap.pieces as P3[][]) - polyArea)).toBeLessThan(1e-9);
    // One closed ring of `sides` chords, every end on the circle: no seam between the outlines' pieces.
    expect(cap.outline).toHaveLength(sides);
    for (const [p, q] of cap.outline) for (const v of [p, q]) {
      expect(Math.abs(Math.hypot(v[0] - centre[0]!, v[2] - centre[2]!) - r)).toBeLessThan(1e-9);
      expect(v[1]).toBeCloseTo(18.5, 12);
    }
    // Below the shoulder the full section is capped.
    expect(totalArea(sectionCaps(b, { axis: 'top', at: 16, flip: false })!.pieces as P3[][])).toBeCloseTo(4, 9);
  });

  it('a seated tenon: the seat caps with its bore subtracted, and the leg caps the disc inside the bore', () => {
    // A 10 x 10 x 1.5 seat (flat, thickness on Y, y 17 .. 18.5) bored through at its centre, over the leg's axis (1, 1).
    const bore: HoleRow = { id: 'h', face: 'thickness', from: 'max', diameter: 1, depth: 'through', along: 'length',
      alongFrom: 'min', station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 5 };
    const seat = createBoard({ id: 'seated-seat', name: 'Seat', length: 10, width: 10, thickness: 1.5, position: [-4, 17, -4], holes: [bore] });
    const b = leg('seated-leg');
    const s: Section = { axis: 'top', at: 17.75, flip: false };
    const seatCap = sectionCaps(seat, s)!;
    const legCap = sectionCaps(b, s)!;
    expect(Math.abs(totalArea(seatCap.pieces as P3[][]) - (100 - gon48))).toBeLessThan(1e-6);
    expect(Math.abs(totalArea(legCap.pieces as P3[][]) - polyArea)).toBeLessThan(1e-9);
    const c = centroid(legCap.pieces);
    expect(c[0]).toBeCloseTo(1, 9);
    expect(c[2]).toBeCloseTo(1, 9);
    // Every point of the leg's cap lies in the bore (radius r about (1, 1)), which the seat's cap leaves empty.
    for (const p of legCap.pieces.flat()) expect(Math.hypot(p[0] - 1, p[2] - 1)).toBeLessThanOrEqual(r + 1e-9);
    expect(seatCap.pieces.flat().every((p) => Math.hypot(p[0] - 1, p[2] - 1) >= r - 1e-9)).toBe(true);
  });
});
