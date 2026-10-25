import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut, Board, RoundTenon } from './types';
import { IMPERIAL, type Units } from '../units/length';
import { tenonLine } from './tenonText';

const MM: Units = { display: 'metric-mm', precision: 16 };
// A 2 x 2 x 20 leg; a 1" tenon 3" long at its max end (shoulder 17 on a square end).
const leg = (extra: Partial<Board> = {}) => createBoard({ id: 'leg', name: 'Leg', length: 20, width: 2, thickness: 2, ...extra });
const top: RoundTenon = { id: 't', end: 'max', diameter: 1, length: 3 };
// An end miter whose depth runs 0.25 → 0.75 across the width: 0.5 at the centre.
const miter = (from: 'min' | 'max'): AngleCut => ({ id: `m${from}`, kind: 'miter', face: 'length', from, along: 'width', alongFrom: 'min',
  points: [[0, 0.25], [2, 0.75]] });

describe('tenonLine (round tenons spec §8)', () => {
  it('square ends, imperial: diameter, length, the end and the shoulder from the other end', () => {
    const b = leg({ tenons: [top] });
    expect(tenonLine(b, top, IMPERIAL)).toBe('1" round tenon, 3" long — at the length max end, shoulder 17" from the other end');
  });

  it('a min-end tenon: the shoulder measured from the max end', () => {
    const t: RoundTenon = { id: 't', end: 'min', diameter: 0.75, length: 2.5 };
    expect(tenonLine(leg({ tenons: [t] }), t, IMPERIAL))
      .toBe('3/4" round tenon, 2-1/2" long — at the length min end, shoulder 17-1/2" from the other end');
  });

  it('metric: every length in mm, the diameter at hole precision (0.1 mm)', () => {
    const b = leg({ tenons: [top] });
    expect(tenonLine(b, top, MM)).toBe('25.4 mm round tenon, 76 mm long — at the length max end, shoulder 432 mm from the other end');
  });

  it('mitered ends: the shoulder from the FAR end at the centre (where its miter meets the axis), not from its long point', () => {
    // Tip mitered: shoulder at 20 − 0.5 − 3 = 16.5. The foot mitered too: its centre at 0.5, so 16.5 − 0.5 = 16.
    const b = leg({ tenons: [top], angleCuts: [miter('min'), miter('max')] });
    expect(tenonLine(b, top, IMPERIAL)).toBe('1" round tenon, 3" long — at the length max end, shoulder 16" from the other end');
    // Only the foot mitered: shoulder 17, from 0.5.
    const foot = leg({ tenons: [top], angleCuts: [miter('min')] });
    expect(tenonLine(foot, top, IMPERIAL)).toBe('1" round tenon, 3" long — at the length max end, shoulder 16-1/2" from the other end');
  });
});
