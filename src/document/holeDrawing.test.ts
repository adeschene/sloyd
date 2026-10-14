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
