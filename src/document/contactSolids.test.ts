import { describe, expect, it } from 'vitest';
import { contactSolids, isTapered, worldSolids } from './designCheck';
import type { Box } from './designCheck';
import { createBoard } from './document';
import { taperCut } from './angleCuts';
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
    expect(isTapered(b)).toBe(false);
    expect(contactSolids(b)).toEqual(worldSolids(b));
  });

  it('trusts the square length and the shrunk thin end', () => {
    const b = leg();
    const t = { ...b, angleCuts: [taper(b, 0, 1, 20, 0.5)] };
    expect(isTapered(t)).toBe(true);
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

  it('throws on any other angle-cut kind (refused upstream)', () => {
    const b = leg();
    expect(() => contactSolids({ ...b, angleCuts: [{ ...taper(b, 0, 1, 20, 0.5), kind: 'miter' }] })).toThrow();
  });
});
