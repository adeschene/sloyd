import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { boardsBounds } from './geometry';
import { partGeometry } from './bodies';
import { chooseFace, leanMap, slopeOf } from './lean';
import { toWorld } from './snapPoints';
import { partBounds, partsBounds } from './worldBounds';
import type { AngleCut, Board } from './types';

const T12 = slopeOf(12);
const T8 = slopeOf(8);

/** A foot miter: a `face 'length'` cut at the foot (from 'min', the floor end of an upright part). */
const FOOT: AngleCut = { id: 'f', kind: 'miter', face: 'length', from: 'min', along: 'width', alongFrom: 'min', points: [[0, 0], [1.5, 1.5]] };

/** An upright 1.5 × 1.5 × 28 leg at a non-symmetric corner, leaning rake 8°, splay 12°, with a foot miter. */
function leaningLeg(extra: Partial<Board> = {}): Board {
  const b = createBoard({ length: 28, width: 1.5, thickness: 1.5, posture: 'upright', position: [3, 1, -2], angleCuts: [FOOT], ...extra });
  return { ...b, lean: { x: T12, z: T8, face: chooseFace(b, T12, T8) } };
}

describe('worldBounds (splayed legs spec §6.1, R2)', () => {
  it('partBounds reads the leaned bodies', () => {
    const b = leaningLeg();
    const m = leanMap(b)!;
    const { lean: _lean, ...flat } = b;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const body of partGeometry(b).bodies) {
      for (const f of body.faces) {
        for (const v of f.verts) {
          const w = m.apply(toWorld(flat, { length: v[0], width: v[1], thickness: v[2] }));
          for (let k = 0; k < 3; k += 1) { min[k] = Math.min(min[k]!, w[k]!); max[k] = Math.max(max[k]!, w[k]!); }
        }
      }
    }
    const got = partBounds(b);
    for (let k = 0; k < 3; k += 1) {
      expect(Math.abs(got.min[k]! - min[k]!)).toBeLessThan(1e-12);
      expect(Math.abs(got.max[k]! - max[k]!)).toBeLessThan(1e-12);
    }
    // Not the pre-lean box, and not the box's 8 corners leaned either (the miter took one of them).
    const pre = boardsBounds([b])!;
    expect([...got.min, ...got.max].some((v, i) => Math.abs(v - [...pre.min, ...pre.max][i]!) > 1e-3)).toBe(true);
  });

  it('partBounds of a leaning part whose cuts left no bodies leans the box it draws (inv 21)', () => {
    const b = leaningLeg({ angleCuts: [] });
    const ghost = { ...b, cuts: [{ id: 'c', face: 'thickness', from: 'min', across: 'width', offset: 0, width: 28, depth: 1.5, stopMin: 0, stopMax: 0 }] } as Board;
    expect(partGeometry(ghost).bodies).toHaveLength(0);
    const m = leanMap(ghost)!;
    const pre = boardsBounds([ghost])!;
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => m.apply([
      i & 1 ? pre.max[0] : pre.min[0], i & 2 ? pre.max[1] : pre.min[1], i & 4 ? pre.max[2] : pre.min[2],
    ]));
    const got = partBounds(ghost);
    for (let k = 0; k < 3; k += 1) {
      expect(got.min[k]).toBeCloseTo(Math.min(...corners.map((c) => c[k]!)), 12);
      expect(got.max[k]).toBeCloseTo(Math.max(...corners.map((c) => c[k]!)), 12);
    }
  });

  it('partBounds of an unleaned part is boardsBounds([b])', () => {
    const b = createBoard({ length: 7, width: 3.3, thickness: 0.7, posture: 'on-edge', rotation: 90, position: [0.1, 0.2, 0.3], angleCuts: [FOOT] });
    expect(partBounds(b)).toEqual(boardsBounds([b]));
  });

  it('partsBounds without leans is boardsBounds', () => {
    const parts: Board[] = [
      createBoard({ length: 24, width: 6, thickness: 1, position: [10, 2, -5] }),
      createBoard({ length: 18.3, width: 2.5, thickness: 0.75, posture: 'upright', rotation: 90, position: [0.1, 0.3, 0.7] }),
      createBoard({ length: 30, width: 4, thickness: 1.25, posture: 'on-edge', rotation: 270, position: [-3, 1 / 3, 2], angleCuts: [FOOT] }),
      createBoard({ length: 12, width: 12, thickness: 0.5, rotation: 180, position: [5, 5, 5] }),
      createBoard({ length: 1.5, width: 1.5, thickness: 28, posture: 'upright', position: [-0.4, 0, 9.9] }),
    ];
    const got = partsBounds(parts)!;
    const want = boardsBounds(parts)!;
    for (let k = 0; k < 3; k += 1) {
      expect(got.min[k]).toBe(want.min[k]);
      expect(got.max[k]).toBe(want.max[k]);
    }
    expect(partsBounds([])).toBeNull();
  });

  it('partsBounds with a leaning part is the union of partBounds', () => {
    const leg = leaningLeg();
    const plain = createBoard({ length: 24, width: 6, thickness: 1, position: [10, 2, -5] });
    const a = partBounds(leg);
    const p = partBounds(plain);
    expect(partsBounds([plain, leg])).toEqual({
      min: [0, 1, 2].map((k) => Math.min(a.min[k]!, p.min[k]!)),
      max: [0, 1, 2].map((k) => Math.max(a.max[k]!, p.max[k]!)),
    });
  });
});
