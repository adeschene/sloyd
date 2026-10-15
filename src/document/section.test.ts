import { createBoard, mirrorPart, pocketCells, keptHalfSpace, partGeometry, taperCut, miterCut, bevelCut, miterRatio, type Board, type Posture, type Rotation } from './document';
import { axisFrame, fromWorldOffset, DIMENSION_ORDER } from './geometry';
import { holePrism } from './holes';
import { keptBySection, sectionAxisIndex, sectionPlaneOf, sectionSpan, SECTION_EPS, sectionCaps, unionOutline, localCapPieces, type Section } from './section';
import { chiralPart } from './turnFixtures';
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

describe('sectionCaps outline', () => {
  it('across bores: the rectangle plus each 48-gon void', () => {
    const pin = { id: 'r1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.5,
      along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 2, acrossFrom: 'min' as const, inset: 1.5 };
    const b = createBoard({ id: 'v', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], holes: [pin] });
    const gonPerimeter = 48 * 2 * 0.125 * Math.sin(Math.PI / 48);
    expect(len(sectionCaps(b, { axis: 'top', at: 1.25, flip: false })!.outline as [P3, P3][])).toBeCloseTo(52 + 3 * gonPerimeter, 6);
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
function referenceUnionOutline(pieces: readonly V3[][], li: number): [V3, V3][] {
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
