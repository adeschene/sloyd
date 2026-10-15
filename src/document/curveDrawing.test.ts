// src/document/curveDrawing.test.ts
import { describe, expect, it } from 'vitest';
import { createBoard, archCurve, cornerCurve, partGeometry } from './document';
import type { Board, Cut } from './types';
import { curveDrawEdges, DRAWING_CURVE_SEGMENTS_MAX } from './curveDrawing';

// Flat at turn 0. Arch on a 30 x 5 x 3/4 apron, width min side, 3" in from each end, 1-1/2" rise:
// R = (12^2 + 1.5^2) / (2 * 1.5) = 48.75, centre (15, 1.5 - 48.75) = (15, -47.25), sweep 2 asin(12/48.75) = 0.49742.
// Model chords: step 2 acos(1 - 0.005/48.75) = 0.028645 -> ceil(17.37) = 18. Fine: step 2 acos(1 - 0.001/48.75) =
// 0.012810 -> ceil(38.83) = 39; m = min(ceil(39/18) = 3, floor(96/18) = 5) = 3.
const arch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 }) };
const apron = (over: Partial<Board> = {}) => createBoard({ id: 'ap', length: 30, width: 5, thickness: 0.75, curves: [arch], ...over });
const onArc = (p: readonly number[]) => Math.abs(Math.hypot(p[0]! - 15, p[1]! + 47.25) - 48.75);

describe('curveDrawEdges (curves spec §5.1; Q2, Q4)', () => {
  it('a part without curves: its edges, no paths, and the same array for the same geometry', () => {
    const b = createBoard({ length: 20, width: 6, thickness: 0.75 });
    const e = curveDrawEdges(b);
    expect(e).toHaveLength(partGeometry(b).edges.length);
    expect(e.every((x) => x.path === undefined)).toBe(true);
    expect(curveDrawEdges({ ...b })).toBe(e);
  });

  it('the arch: 18 model chords on each face plane, each 3 fine pieces on the true arc, ends kept exactly', () => {
    const b = apron();
    const paths = curveDrawEdges(b).filter((x) => x.path);
    expect(paths).toHaveLength(36); // 18 chords x 2 planes (thickness 0 and 3/4)
    for (const { p, q, path } of paths) {
      expect(path!.k).toBe(2);
      expect(path!.pts).toHaveLength(4);
      expect(path!.pts[0]).toEqual(p);
      expect(path!.pts[3]).toEqual(q);
      for (const x of path!.pts) { expect(onArc(x)).toBeLessThan(1e-9); expect(x[2]).toBe(p[2]); }
      expect(path!.at[0]).toBe(0);
      expect(path!.at[3]).toBe(1);
      for (let i = 1; i < 4; i += 1) expect(path!.at[i]!).toBeGreaterThan(path!.at[i - 1]!);
    }
  });

  it('a 2" rounded corner: 12 model chords per plane, 3 pieces each (N = 25: m = min(3, 8))', () => {
    // Quarter circle r = 2: model step 2 acos(1 - 0.005/2) = 0.14146 -> ceil(11.10) = 12; fine 2 acos(1 - 0.001/2) =
    // 0.063249 -> ceil(24.83) = 25.
    const b = createBoard({ length: 36, width: 20, thickness: 0.75, curves: [{ id: 'c', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 2 }) }] });
    const paths = curveDrawEdges(b).filter((x) => x.path);
    expect(paths).toHaveLength(24);
    expect(paths.every((x) => x.path!.pts.length === 4)).toBe(true);
  });

  it('an arc never exceeds 96 pieces: a 10" half-round notch draws exactly 96 (n = 24, m = 4)', () => {
    // r = 10, sweep pi: model step 2 acos(1 - 0.0005) = 0.063249 -> 49.67 -> capped 24; fine step 2 acos(1 - 0.0001) =
    // 0.028285 -> 111.07 -> capped 96; m = min(4, 4) = 4.
    const notch = { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 5, span: 20, rise: 10 }) };
    const b = createBoard({ length: 30, width: 12, thickness: 0.75, curves: [notch] });
    const onPlane0 = curveDrawEdges(b).filter((x) => x.path && x.p[2] === 0);
    expect(onPlane0.reduce((n, x) => n + x.path!.pts.length - 1, 0)).toBe(DRAWING_CURVE_SEGMENTS_MAX);
  });

  it('a chord a dado splits keeps its split end on the chord; only interior nodes move to the arc (Q4)', () => {
    // A 1" dado 1/4" deep across the width at length 14.5..15.5, from the thickness max face: the max-face outline stops at
    // the dado walls. u = 14.5 is inside chord 8 (theta = asin(-0.5/48.75) = -0.010257; chords are 0.027634 wide, the crown
    // vertex at theta = 0), so that chord's piece on the max face ends off the arc.
    const dado: Cut = { id: 'd', face: 'thickness', from: 'max', across: 'width', offset: 14.5, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 };
    const b = apron({ cuts: [dado] });
    const split = curveDrawEdges(b).filter((x) => x.path && (Math.abs(x.p[0] - 14.5) < 1e-9 || Math.abs(x.q[0] - 14.5) < 1e-9));
    expect(split.length).toBeGreaterThan(0);
    for (const { p, q, path } of split) {
      const end = Math.abs(p[0] - 14.5) < 1e-9 ? p : q;
      expect(onArc(end)).toBeGreaterThan(1e-6); // on the chord, off the arc
      expect(onArc(end)).toBeLessThan(0.005);
      expect(path!.pts[0]).toEqual(p);
      expect(path!.pts[path!.pts.length - 1]).toEqual(q);
      for (const x of path!.pts.slice(1, -1)) expect(onArc(x)).toBeLessThan(1e-9);
    }
  });
});
