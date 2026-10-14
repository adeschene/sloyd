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
    expect(segs).toHaveLength(2 * DRAWING_HOLE_SEGMENTS + 2);
    const sil = segs.slice(2 * DRAWING_HOLE_SEGMENTS);
    const xs = sil.map(([a]) => a[0]).sort((p, q) => p - q);
    expect(xs[0]).toBeCloseTo(4.875, 12);
    expect(xs[1]).toBeCloseTo(5.125, 12);
    for (const [a, b] of sil) {
      expect(a[0]).toBeCloseTo(b[0], 12);                 // vertical
      expect([a[1], b[1]].sort((p, q) => p - q)).toEqual([0.375, 0.75]);
      expect(a[2]).toBeCloseTo(2, 12);                    // on the axis' plane through the centre, z = inset
    }
  });
  it('a through hole runs the whole thickness', () => {
    const segs = holeDrawingSegments(side([{ ...pin, depth: 'through' }]), [0, 0, 1]);
    const sil = segs.slice(2 * DRAWING_HOLE_SEGMENTS);
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
