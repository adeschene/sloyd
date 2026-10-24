import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { DRAWING_HOLE_SEGMENTS, holeDrawingSegments } from './holeDrawing';
import { FRONT, ISO, TOP } from './drawing';
import { chiralHoled, sameSet } from './turnFixtures';
import { mirrorPart } from './frames';
import type { HoleRow } from './types';

// Flat at turn 0: length on X, thickness on Y (up), width on Z (drawing.test.ts' convention).
const pin: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 2 };
const side = (holes: HoleRow[]) => createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75, holes });

describe('holeDrawingSegments (spec §3.4)', () => {
  it('a part without holes has none, in every sheet view (so drawView draws what it drew before)', () => {
    for (const v of [FRONT, TOP, ISO]) expect(holeDrawingSegments(side([]), v.toward)).toEqual([]);
  });
  it('looking down the axis: the entry and bottom rims only (no silhouettes)', () => {
    const segs = holeDrawingSegments(side([pin]), [0, 1, 0]);
    expect(segs).toHaveLength(2 * DRAWING_HOLE_SEGMENTS);
    const ys = new Set(segs.flatMap(([a, b]) => [a[1], b[1]]).map((y) => y.toFixed(9)));
    expect([...ys].sort()).toEqual(['0.375000000', '0.750000000']);
  });
  it('looking across the axis (front, +Z): two silhouettes at x = 5 ± 1/8 from the mouth to the bottom', () => {
    const segs = holeDrawingSegments(side([pin]), [0, 0, 1]);
    expect(segs).toHaveLength(2 + 2); // two edge-on rims, two silhouettes
    const sil = segs.slice(2);
    const xs = sil.map(([a]) => a[0]).sort((p, q) => p - q);
    expect(xs[0]).toBeCloseTo(4.875, 12);
    expect(xs[1]).toBeCloseTo(5.125, 12);
    for (const [a, b] of sil) {
      expect(a[0]).toBeCloseTo(b[0], 12);                 // vertical
      expect([a[1], b[1]].sort((p, q) => p - q)).toEqual([0.375, 0.75]);
      expect(a[2]).toBeCloseTo(2, 12);                    // on the axis' plane through the centre, z = inset
    }
  });
  it('an edge-on rim is ONE segment, its exact projection (ruling R2): front, the mouth at y = 3/4 and the bottom at 3/8', () => {
    const rims = holeDrawingSegments(side([pin]), [0, 0, 1]).slice(0, 2);
    rims.forEach(([a, b], i) => {
      const y = [0.75, 0.375][i]!;
      expect(a[1]).toBeCloseTo(y, 12);
      expect(b[1]).toBeCloseTo(y, 12);
      expect([a[0], b[0]].sort((p, q) => p - q).map((x) => x.toFixed(9))).toEqual(['4.875000000', '5.125000000']);
      expect(a[2]).toBeCloseTo(2, 12);
      expect(b[2]).toBeCloseTo(2, 12);
    });
    // Seen from above the rims face the viewer: 96 chords each, no silhouettes.
    expect(holeDrawingSegments(side([pin]), [0, 1, 0])).toHaveLength(2 * DRAWING_HOLE_SEGMENTS);
    // Oblique (iso), a rim is an ellipse: 96 chords each, and two silhouettes.
    expect(holeDrawingSegments(side([pin]), ISO.toward)).toHaveLength(2 * DRAWING_HOLE_SEGMENTS + 2);
  });
  it('an upright part at turn 90, front: absolute silhouettes and rims (derived by hand)', () => {
    // Upright: length up (Y); horizontals [width, thickness]. Turn 90 (axisFrame's table): X = thickness (not reversed),
    // Y = length, Z = width REVERSED. Board 30 x 11.25 x 1.5 at the origin.
    // The hole: entered from the length MAX end (y = 30), so it runs DOWN, depth 1: y 30 → 29. Along width 4 from min →
    // z = 11.25 − 4 = 7.25 (reversed). Across = thickness, inset 0.5 from min → x = 0.5 (not reversed; reversed would be
    // 1.0). Front looks along +Z, the axis is Y, the disc is XZ, so the silhouette radial is ±X: x = 0.5 ± 0.125 =
    // 0.375 and 0.625, each from y 30 to 29 at z = 7.25. The rims' planes are horizontal and the view is horizontal:
    // both are edge-on, one segment each, x 0.375..0.625 at y 30 and y 29.
    const end: HoleRow = { id: 'e', face: 'length', from: 'max', diameter: 0.25, depth: 1, along: 'width', alongFrom: 'min', station: 4, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.5 };
    const b = createBoard({ id: 'u', length: 30, width: 11.25, thickness: 1.5, posture: 'upright', rotation: 90, holes: [end] });
    const segs = holeDrawingSegments(b, [0, 0, 1]);
    expect(segs).toHaveLength(4);
    const fix = (p: readonly number[]) => p.map((v) => (Math.abs(v) < 5e-13 ? 0 : v).toFixed(9)).join(' ');
    const got = segs.map(([p, q]) => [fix(p), fix(q)].sort().join(' | ')).sort();
    expect(got).toEqual([
      '0.375000000 29.000000000 7.250000000 | 0.375000000 30.000000000 7.250000000',
      '0.375000000 29.000000000 7.250000000 | 0.625000000 29.000000000 7.250000000',
      '0.375000000 30.000000000 7.250000000 | 0.625000000 30.000000000 7.250000000',
      '0.625000000 29.000000000 7.250000000 | 0.625000000 30.000000000 7.250000000',
    ].sort());
  });
  it('a through hole runs the whole thickness', () => {
    const segs = holeDrawingSegments(side([{ ...pin, depth: 'through' }]), [0, 0, 1]);
    expect(segs).toHaveLength(4);
    const sil = segs.slice(2);
    for (const [a, b] of sil) expect([a[1], b[1]].sort((p, q) => p - q)).toEqual([0, 0.75]);
  });
});

const POSTURES = ['flat', 'on-edge', 'upright'] as const;
const TURNS = [0, 90, 180, 270] as const;
const ends = (segs: [number[], number[]][]) => segs.flatMap(([a, b]) => [[...a], [...b]]);
// Both view directions are unchanged by x → -x, so the mirrored part's lines must be the reflection of the part's.
const VIEWS = [[0, 1, 0], [0, 0, 1]];

describe('hole lines through mirrors and turns (Review Focus 2)', () => {
  it.each(POSTURES.flatMap((posture) => TURNS.map((rotation) => ({ posture, rotation }))))(
    '%o: mirrorPart\'s hole lines are the reflection across x = 0',
    ({ posture, rotation }) => {
      const b = { ...chiralHoled(posture), rotation, position: [2, 1, -3] as [number, number, number] };
      for (const T of VIEWS) {
        const reflected = ends(holeDrawingSegments(b, T)).map(([x, y, z]) => [0 - x!, y!, z!]);
        expect(sameSet(ends(holeDrawingSegments(mirrorPart(b), T)), reflected)).toBe(true);
      }
    },
  );
  it('the fixture is chiral: rows left unmirrored would differ', () => {
    const b = chiralHoled('flat');
    const reflected = ends(holeDrawingSegments(b, [0, 0, 1])).map(([x, y, z]) => [0 - x!, y!, z!]);
    expect(sameSet(ends(holeDrawingSegments({ ...mirrorPart(b), holes: b.holes }, [0, 0, 1])), reflected)).toBe(false);
  });
});

describe('a tilted bore on the sheet (angled holes spec §8)', () => {
  // Tilted 20° toward +length (the far end from alongFrom 'min'), entered from the top (thickness max): the bit is
  // (tan 20°, 0, −1) board-local, so in world (flat, turn 0) it runs down −Y and along +X.
  const T20 = Math.tan((20 * Math.PI) / 180);
  const C20 = Math.cos((20 * Math.PI) / 180);
  const S20 = Math.sin((20 * Math.PI) / 180);
  const tilt = (extra: Partial<HoleRow> = {}): HoleRow => ({ ...pin, tiltAlong: T20, ...extra });
  const r = pin.diameter / 2;
  const xs = (segs: [number[], number[]][]) => segs.flatMap(([a, b]) => [a[0]!, b[0]!]);
  it('Front: the mouth plane is edge-on, ONE segment spanning the ellipse, r / cos 20° each way', () => {
    const segs = holeDrawingSegments(side([tilt({ depth: 'through' })]), [0, 0, 1]);
    expect(segs).toHaveLength(2 + 2);   // mouth, exit (both edge-on: their planes' normal is Y), two silhouettes
    const [mouth, exit] = segs;
    expect(Math.min(...xs([mouth!]))).toBeCloseTo(5 - r / C20, 12);
    expect(Math.max(...xs([mouth!]))).toBeCloseTo(5 + r / C20, 12);
    for (const p of mouth!) expect(p[1]).toBeCloseTo(0.75, 12);
    expect(Math.min(...xs([exit!]))).toBeCloseTo(5 + 0.75 * T20 - r / C20, 12);
    expect(Math.max(...xs([exit!]))).toBeCloseTo(5 + 0.75 * T20 + r / C20, 12);
    for (const p of exit!) expect(p[1]).toBeCloseTo(0, 12);
  });
  it('Front: the silhouettes run parallel to the bit, from the mouth plane to the exit plane', () => {
    const sil = holeDrawingSegments(side([tilt({ depth: 'through' })]), [0, 0, 1]).slice(2);
    expect(sil).toHaveLength(2);
    for (const [a, b] of sil) {
      const [hi, lo] = a[1]! > b[1]! ? [a, b] : [b, a];
      expect(hi[1]).toBeCloseTo(0.75, 12);
      expect(lo[1]).toBeCloseTo(0, 12);
      expect(lo[0]! - hi[0]!).toBeCloseTo(0.75 * T20, 12);   // the bit's travel over the thickness
      expect(a[2]).toBeCloseTo(2, 12);
    }
    // The two generators sit r off the bit's line, square to it: 2r / cos 20° apart along X at one height.
    const tops = sil.map(([a, b]) => (a[1]! > b[1]! ? a : b)[0]!).sort((p, q) => p - q);
    expect(tops[1]! - tops[0]!).toBeCloseTo((2 * r) / C20, 12);
  });
  it('a blind bottom is the disc square to the bit, `reach` down; edge-on where the view is square to the BIT', () => {
    const blind = tilt();   // depth 3/8 along the bit
    // Square to the bit (rim-plane normal b̂ = (sin 20°, −cos 20°, 0)): toward (cos 20°, sin 20°, 0). The mouth's plane
    // (normal Y) is not edge-on there: 96 chords; the bottom is one segment; two silhouettes.
    const segs = holeDrawingSegments(side([blind]), [C20, S20, 0]);
    expect(segs).toHaveLength(DRAWING_HOLE_SEGMENTS + 1 + 2);
    const bottom = segs[DRAWING_HOLE_SEGMENTS]!;
    // Its centre: the mouth centre + depth along the unit bit; its ends ± r along Z (square to both the bit and the view).
    const c = [5 + 0.375 * S20, 0.75 - 0.375 * C20, 2];
    const mid = [0, 1, 2].map((i) => (bottom[0][i]! + bottom[1][i]!) / 2);
    mid.forEach((v, i) => expect(v).toBeCloseTo(c[i]!, 12));
    expect(Math.abs(bottom[0][2]! - bottom[1][2]!)).toBeCloseTo(2 * r, 12);
    // Front (toward Z) is square to the bit as well: mouth and bottom edge-on, the bottom's segment 2r long, tilted.
    const front = holeDrawingSegments(side([blind]), [0, 0, 1]);
    expect(front).toHaveLength(4);
    const [p, q] = front[1]!;
    expect(Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!)).toBeCloseTo(2 * r, 12);
    [0, 1].forEach((i) => expect((p[i]! + q[i]!) / 2).toBeCloseTo(c[i]!, 12));
    // Its walls end ON the bottom disc (square to the bit), r from its centre; they start on the mouth plane.
    const b = [S20, -C20, 0];
    for (const [s0, s1] of front.slice(2)) {
      expect(s0[1]).toBeCloseTo(0.75, 12);
      expect([0, 1, 2].reduce((n, i) => n + (s1[i]! - c[i]!) * b[i]!, 0)).toBeCloseTo(0, 12);
      expect(Math.hypot(s1[0]! - c[0]!, s1[1]! - c[1]!, s1[2]! - c[2]!)).toBeCloseTo(r, 12);
    }
  });
  it('looking down the bit: rims only, no silhouettes', () => {
    expect(holeDrawingSegments(side([tilt()]), [-S20, C20, 0])).toHaveLength(2 * DRAWING_HOLE_SEGMENTS);
  });
});
