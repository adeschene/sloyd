import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, flatDocument } from './document';
import { clipConvex, partGeometry, type Body, type BodyFace } from './bodies';
import { bodyVolume } from './bodies';
import { arcChords, arcOf, CURVE_SEGMENTS_MAX, CURVE_TOLERANCE } from './curves';
import { strips } from './banding';
import { coreWeight, selectionWeight, stripWeight, weightOf, woodVolume } from './weight';
import { catalogOf } from './materials';
import { ARCH } from './curveFixtures';
import { halfBlindCorner } from './dovetailFixtures';
import { boardExtents } from './geometry';
import type { BandType, Board, CustomMaterial, FlatDocument, ProfileCut, SloydDocument } from './types';

type V3 = [number, number, number];
const flat = (boards: Board[], extra: Partial<SloydDocument> = {}): FlatDocument =>
  ({ ...createDocument('T'), boards, ...extra } as FlatDocument);
const box = (b: Board) => b.length * b.width * b.thickness;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

/** The partition (weight spec §4.1), checked WITHOUT any volume sum: no two bodies of a part share volume. */
function worstOverlap(b: Board): number {
  const bodies = partGeometry(b).bodies as Body[];
  const inside = (faces: BodyFace[]) => faces.map((f) => ({ n: [-f.n[0], -f.n[1], -f.n[2]] as V3, d: f.n[0] * f.verts[0]![0] + f.n[1] * f.verts[0]![1] + f.n[2] * f.verts[0]![2] }));
  let worst = 0;
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      let f = bodies[i]!.faces;
      for (const h of inside(bodies[j]!.faces)) { f = clipConvex(f, h); if (f.length < 4) break; }
      if (f.length >= 4) worst = Math.max(worst, bodyVolume({ box: null, faces: f }));
    }
  }
  return worst;
}

const cut = (o: object) => ({ id: 'k1', face: 'thickness', from: 'max', across: 'width', offset: 4, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0, ...o });

describe('woodVolume: the wood the model keeps (weight spec §4.1)', () => {
  it('a plain oak 3/4 × 6 × 24 board weighs 0.75·6·24/1728·44', () => {
    const b = createBoard({ material: 'oak', length: 24, width: 6, thickness: 0.75 });
    expect(woodVolume(b)).toBe(108);
    expect(weightOf(flat([b])).pounds).toBeCloseTo((0.75 * 6 * 24 / 1728) * 44, 12);
    expect(weightOf(flat([b])).unweighed).toEqual([]);
  });

  const cases: [string, Board, number, number][] = [
    ['a dado', createBoard({ cuts: [cut({})] as Board['cuts'] }), 24 * 5.5 * 0.75 - 0.75 * 0.25 * 5.5, 1e-9],
    ['a rabbet at the end', createBoard({ cuts: [cut({ offset: 23.25 })] as Board['cuts'] }), 24 * 5.5 * 0.75 - 0.75 * 0.25 * 5.5, 1e-9],
    ['a stopped notch', createBoard({ cuts: [cut({ face: 'width', across: 'thickness', offset: 10, width: 2, depth: 1, stopMin: 0, stopMax: 0 })] as Board['cuts'] }), 24 * 5.5 * 0.75 - 2 * 1 * 0.75, 1e-9],
    ['a taper', createBoard({ angleCuts: [{ id: 'a1', kind: 'taper', face: 'width', from: 'max', along: 'length', alongFrom: 'min', points: [[0, 0], [24, 1]] }] }), 24 * 5.5 * 0.75 - 0.5 * 24 * 1 * 0.75, 1e-9],
    ['an end miter', createBoard({ angleCuts: [{ id: 'a1', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [5.5, 2]] }] }), 24 * 5.5 * 0.75 - 0.5 * 5.5 * 2 * 0.75, 1e-9],
  ];
  for (const [name, b, want, tol] of cases) {
    it(`${name}: box less the cut's own volume, by hand; no two bodies overlap`, () => {
      expect(rel(woodVolume(b), want)).toBeLessThanOrEqual(tol);
      expect(worstOverlap(b)).toBeLessThan(1e-12);
    });
  }

  it('an arch: box less the chorded segment, its chords as the curve module builds them', () => {
    const b = createBoard({ name: 'Apron', length: 30, width: 5, thickness: 0.75, curves: [ARCH] });
    // A circular segment of chord 24 and rise 1.5: r = (c²/4 + h²)/(2h), its area by the chords actually drawn.
    const c = 24, h = 1.5, r = (c * c / 4 + h * h) / (2 * h), theta = 2 * Math.asin(c / 2 / r);
    const n = arcChords(arcOf([3, 0], [27, 0], 'left', { rise: 1.5 }, 0), CURVE_TOLERANCE, CURVE_SEGMENTS_MAX);
    const polySegment = (n / 2) * r * r * Math.sin(theta / n) - 0.5 * r * r * Math.sin(theta);
    expect(rel(woodVolume(b), 30 * 5 * 0.75 - polySegment * 0.75)).toBeLessThanOrEqual(1e-6);
    expect(worstOverlap(b)).toBeLessThan(1e-12);
  });

  it('a roundover: box less about (1 − π/4)·r²·run (chords sit inside the arc: within 1%)', () => {
    const p: ProfileCut = { id: 'p1', face: 'max', kind: 'roundover', size: 0.5, fillet: 0, facing: 'face', run: { start: { side: { across: 'width', from: 'max' }, through: 'min' }, end: { side: { across: 'width', from: 'max' }, through: 'max' } } };
    const b = createBoard({ length: 24, width: 5.5, thickness: 0.75, profiles: [p] });
    const want = 24 * 5.5 * 0.75 - (1 - Math.PI / 4) * 0.25 * 24;
    expect(rel(woodVolume(b), want)).toBeLessThanOrEqual(0.01);
    expect(woodVolume(b)).toBeLessThan(24 * 5.5 * 0.75);
    expect(worstOverlap(b)).toBeLessThan(1e-12);
  });

  it('a round tenon: the shoulder box plus the chorded round, 1" across and 3 long', () => {
    const b = createBoard({ name: 'Leg', length: 20, width: 2, thickness: 2, tenons: [{ id: 't1', end: 'max', diameter: 1, length: 3 }] });
    const sides = 4 * arcChords(arcOf([1, 0.5], [0.5, 1], 'left', { radius: 0.5 }, 0), CURVE_TOLERANCE, CURVE_SEGMENTS_MAX);
    const polyArea = (sides / 2) * 0.25 * Math.sin((2 * Math.PI) / sides);
    expect(rel(woodVolume(b), 17 * 2 * 2 + polyArea * 3)).toBeLessThanOrEqual(1e-6);
    expect(worstOverlap(b)).toBeLessThan(1e-12);
  });

  it('a half-blind dovetail corner: the two parts fill the corner box once — blanks less the box, by hand', () => {
    const top = createBoard({ id: 'top', name: 'Top', posture: 'flat', rotation: 0, length: 18, width: 6, thickness: 0.75, position: [0, 19.25, 0] });
    const side = createBoard({ id: 'side', name: 'Side', posture: 'upright', rotation: 90, length: 20, width: 6, thickness: 0.625, position: [0, 0, 0] });
    const c = halfBlindCorner(top, 'length', side, 'length', 3, 8, 0.25, 0.25);
    const ext = [0, 1, 2].map((i) => c.box.max[i]! - c.box.min[i]!);
    const corner = ext[0]! * ext[1]! * ext[2]!;
    const blanks = boardExtents(c.tails).reduce((a, x) => a * x, 1) + boardExtents(c.pins).reduce((a, x) => a * x, 1);
    expect(rel(woodVolume(c.tails) + woodVolume(c.pins), blanks - corner)).toBeLessThanOrEqual(1e-9);
    expect(worstOverlap(c.tails)).toBeLessThan(1e-12);
    expect(worstOverlap(c.pins)).toBeLessThan(1e-12);
  });

  it('a lean moves the wood, never its volume', () => {
    const leg = createBoard({ name: 'Leg', posture: 'upright', length: 18, width: 1.5, thickness: 1.5 });
    expect(woodVolume({ ...leg, lean: { x: 0.1, z: 0.05, face: 'width' } } as Board)).toBeCloseTo(woodVolume(leg), 9);
  });
});

describe('edging at its own density (weight spec §4.2)', () => {
  const walnut: BandType = { id: 'w', name: 'Walnut edging 1/4"', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'walnut', widthAllowance: 0.0625 };
  const shelf = createBoard({ name: 'Shelf', length: 30, width: 12, thickness: 0.75, material: 'plywood', bands: [{ side: { across: 'width', from: 'max' }, type: 'w' }] });
  const doc = flat([shelf], { bandTypes: [walnut] });
  const cat = catalogOf(doc);
  it('the core at plywood, the strip at walnut; core + strip is the finished wood exactly', () => {
    const [s] = strips(shelf, doc.bandTypes);
    // The FINISHED strip (final review I1): its finished run × the band's thickness × the part's thickness — never the cut
    // blank, whose length and thickness carry the allowances that are trimmed off.
    const sv = s!.finished * s!.width * shelf.thickness;
    expect(sv).toBe(30 * 0.25 * 0.75);
    expect(coreWeight(shelf, doc.bandTypes, cat)).toBeCloseTo(((30 * 12 * 0.75 - sv) / 1728) * 36, 12);
    expect(stripWeight(s!, cat)).toBeCloseTo((sv / 1728) * 38, 12);
    expect((30 * 12 * 0.75 - sv) + sv).toBe(woodVolume(shelf));
    expect(weightOf(doc).pounds).toBeCloseTo(((30 * 12 * 0.75 - sv) / 1728) * 36 + (sv / 1728) * 38, 12);
  });
});

describe('edging allowances are trimmed off, never weighed (final review I1)', () => {
  it('a small block banded all round with a 2" length allowance keeps a positive core equal to its finished wood less its edging', () => {
    const fat: BandType = { id: 'f', name: 'Fat edging', kind: 'solid', thickness: 0.25, lengthAllowance: 2, material: 'walnut', widthAllowance: 0.5 };
    const sides = [['width', 'min'], ['width', 'max'], ['length', 'min'], ['length', 'max']] as const;
    const block = createBoard({ name: 'Block', length: 3, width: 1, thickness: 0.75, material: 'oak', bands: sides.map(([across, from]) => ({ side: { across, from }, type: 'f' })) });
    const doc = flat([block], { bandTypes: [fat] });
    const cat = catalogOf(doc);
    const core = coreWeight(block, doc.bandTypes, cat)!;
    expect(core).toBeGreaterThan(0);
    const finishedEdging = strips(block, doc.bandTypes).reduce((a, s) => a + s.finished * s.width * block.thickness, 0);
    expect(core).toBeCloseTo(((3 * 1 * 0.75 - finishedEdging) / 1728) * 44, 12);
  });
});

describe('what counts (weight spec §4.3)', () => {
  const ash: CustomMaterial = { id: 'm-s-ash00001', label: 'Ash', color: '#d8c8a0', kind: 'solid' };
  it('a material with no density is named and adds nothing; with one, it counts', () => {
    const oak = createBoard({ id: 'o', material: 'oak' });
    const a = createBoard({ id: 'a', material: ash.id });
    const w = weightOf(flat([oak, a], { materials: [ash] }));
    expect(w.unweighed).toEqual([ash.id]);
    expect(w.pounds).toBeCloseTo((box(oak) / 1728) * 44, 12);
    const v = weightOf(flat([oak, a], { materials: [{ ...ash, density: 40 }] }));
    expect(v.unweighed).toEqual([]);
    expect(v.pounds).toBeCloseTo((box(oak) / 1728) * 44 + (box(a) / 1728) * 40, 12);
  });
  it('an assembly placed twice weighs twice; a mirrored copy weighs the same', () => {
    const part = createBoard({ id: 'p', name: 'Rail', material: 'cherry', length: 20, width: 3, thickness: 0.75 });
    const base = { ...createDocument('T'), boards: [], definitions: [{ id: 'd1', name: 'Frame', boards: [part], instances: [] }] } as unknown as SloydDocument;
    const placed = (mirrored: boolean[]) => ({ ...base, instances: mirrored.map((m, i) => ({ id: `i${i}`, name: `Frame ${i + 1}`, definition: 'd1', position: [i * 30, 0, 0], rotation: 0, ...(m ? { mirrored: true } : {}) })) }) as unknown as SloydDocument;
    const one = weightOf(flatDocument(placed([false]))).pounds;
    expect(one).toBeCloseTo((box(part) / 1728) * 35, 12);
    expect(weightOf(flatDocument(placed([false, false]))).pounds).toBeCloseTo(2 * one, 12);
    expect(weightOf(flatDocument(placed([false, true]))).pounds).toBeCloseTo(2 * one, 12);
  });
  it('selectionWeight weighs only the named parts', () => {
    const a = createBoard({ id: 'a', material: 'oak' });
    const b = createBoard({ id: 'b', material: 'pine' });
    expect(selectionWeight(flat([a, b]), new Set(['b'])).pounds).toBeCloseTo((box(b) / 1728) * 28, 12);
  });
});
