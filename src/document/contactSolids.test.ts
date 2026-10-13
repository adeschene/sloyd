import { describe, expect, it } from 'vitest';
import { contactRegions, contactSolids, isAngled, worldSolids } from './designCheck';
import type { Box } from './designCheck';
import { createBoard } from './document';
import { chamferCut, miterCut, taperCut } from './angleCuts';
import { axisFrame, endFacing } from './geometry';
import type { AngleCut, Board } from './types';

/** An upright leg: width on X, length on Y, thickness on Z (turn 0). */
const leg = (rotation: 0 | 180 = 0): Board =>
  createBoard({ name: 'Leg', position: [0, 0, 0], length: 28, width: 1.5, thickness: 1.5, posture: 'upright', rotation });
/** A taper on the world face (axis, side), thin toward the world end `toward` on Y. */
const taper = (b: Board, axis: 0 | 2, side: -1 | 1, start: number, amount: number, toward: -1 | 1 = -1): AngleCut => ({
  id: `t${axis}${side}${toward}`,
  ...taperCut({ face: axisFrame(b)[axis]!.dim as 'width' | 'thickness', from: endFacing(b, axis, side), end: endFacing(b, 1, toward), start, amount }),
});
const sorted = (bs: Box[]) => bs.map((b) => [b.min, b.max]).sort((p, q) => p[0][1]! - q[0][1]! || p[0][0]! - q[0][0]!);

describe('contactSolids (spec §3.2)', () => {
  it('is worldSolids, exactly, for a part with no taper — rectangular cuts included', () => {
    const b = createBoard({ name: 'Notched', length: 20, width: 4, thickness: 1, cuts: [
      { id: 'c1', face: 'thickness', from: 'max', across: 'length', offset: 2, width: 3, depth: 0.5, stopMin: 0, stopMax: 0 },
    ] });
    expect(isAngled(b)).toBe(false);
    expect(contactSolids(b)).toEqual(worldSolids(b));
  });

  it('trusts the square length and the shrunk thin end', () => {
    const b = leg();
    const t = { ...b, angleCuts: [taper(b, 0, 1, 20, 0.5)] };
    expect(isAngled(t)).toBe(true);
    expect(sorted(contactSolids(t))).toEqual([
      [[0, 0, 0], [1, 0, 1.5]],        // the floor end, 0.5 off its +X side
      [[0, 20, 0], [1.5, 28, 1.5]],    // the square length
    ]);
  });

  it('keeps the full far end of a full-length taper', () => {
    const b = leg();
    const t = { ...b, angleCuts: [taper(b, 0, 1, 28, 0.5)] };
    expect(sorted(contactSolids(t))).toContainEqual([[0, 28, 0], [1.5, 28, 1.5]]);
  });

  it('keeps only the end slabs when tapers from both ends overlap', () => {
    const b = leg();
    const t = { ...b, angleCuts: [taper(b, 0, 1, 20, 0.5, -1), taper(b, 2, 1, 20, 0.5, 1)] };
    expect(sorted(contactSolids(t))).toEqual([
      [[0, 0, 0], [1, 0, 1.5]],
      [[0, 28, 0], [1.5, 28, 1]],
    ]);
  });

  it('maps a turned leg through the turn table (taper toward the top)', () => {
    const b = leg(180);
    const t = { ...b, angleCuts: [taper(b, 0, 1, 20, 0.5, 1)] };
    expect(sorted(contactSolids(t))).toEqual([
      [[0, 0, 0], [1.5, 8, 1.5]],      // square from the floor up to 28 - 20
      [[0, 28, 0], [1, 28, 1.5]],      // the top end, 0.5 off its +X side
    ]);
  });

  it('reads a taper stored deep-end-last as the same taper', () => {
    const b = leg();
    const std = taper(b, 0, 1, 8, 0.5);                                   // thin toward the floor, square from 8
    const flipped: AngleCut = { ...std, alongFrom: std.alongFrom === 'min' ? 'max' : 'min', points: [[20, 0], [28, 0.5]] };
    expect(sorted(contactSolids({ ...b, angleCuts: [flipped] }))).toEqual(sorted(contactSolids({ ...b, angleCuts: [std] })));
  });

  it('a chamfered leg: the corner strip is never trusted, the rest is (AI-angles spec §2.2)', () => {
    const b = leg();
    // The +X/+Z vertical edge of the upright leg: width (X) max and thickness (Z) max, 1/4in legs, all of the length.
    const c: AngleCut = { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.25, legAlong: 0.25 }, b) };
    expect(contactSolids({ ...b, angleCuts: [c] }).map((x) => [x.min, x.max])).toEqual([
      [[0, 0, 0], [1.5, 28, 1.25]],    // thickness stations outside the strip, full width
      [[0, 0, 1.25], [1.25, 28, 1.5]], // inside it, only past the width leg
    ]);
  });

  it('a mitered end trusts nothing past its short point', () => {
    const b = leg();
    const c: AngleCut = { id: 'm', ...miterCut({ end: 'max', across: 'width', longSide: 'min', ratio: 1 }, b) };
    expect(sorted(contactSolids({ ...b, angleCuts: [c] }))).toEqual([[[0, 0, 0], [1.5, 26.5, 1.5]]]);
  });

  it('taper first, then the chamfer: never trusts removed wood, never overlaps (Review Focus 1)', () => {
    const b = leg();
    const t = taper(b, 0, 1, 20, 0.5);
    const c: AngleCut = { id: 'c', ...chamferCut({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'min', legFace: 0.25, legAlong: 0.25 }, b) };
    const rs = contactRegions({ ...b, angleCuts: [t, c] });
    const taperOnly = contactRegions({ ...b, angleCuts: [t] });
    const DIMS = ['length', 'width', 'thickness'] as const;
    type R = (typeof rs)[number];
    const within = (r: R, s: R) => DIMS.every((d) => r[d][0] >= s[d][0] - 1e-12 && r[d][1] <= s[d][1] + 1e-12);
    expect(rs.length).toBeGreaterThan(0);
    // Inside what the taper alone trusts, and outside the chamfer's strip.
    expect(rs.every((r) => taperOnly.some((s) => within(r, s)))).toBe(true);
    expect(rs.every((r) => r.width[0] >= 0.25 - 1e-12 || r.thickness[0] >= 0.25 - 1e-12)).toBe(true);
    // Pairwise disjoint: no pair shares positive extent on every dimension.
    const overlap = (p: R, q: R) => DIMS.every((d) => Math.min(p[d][1], q[d][1]) - Math.max(p[d][0], q[d][0]) > 0);
    expect(rs.some((p, i) => rs.some((q, j) => i !== j && overlap(p, q)))).toBe(false);
    // The taper's floor-end slab survives, shrunk past the chamfer too.
    expect(rs.some((r) => r.length[0] === 0 && r.length[1] === 0)).toBe(true);
  });

  it('a chamfer deeper than the part trusts nothing in its strip, and does not throw (Review Focus 4)', () => {
    const b = leg();
    const c: AngleCut = { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 5, legAlong: 0.25 }, b) };
    expect(sorted(contactSolids({ ...b, angleCuts: [c] }))).toEqual([[[0, 0, 0], [1.5, 28, 1.25]]]);
  });
});
