import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBoard } from '../document/document';
import type { BandType, Board } from '../document/types';
import { archCurve } from '../document/curves';
import * as banding from '../document/banding';
import { BAND_SIDES } from '../document/banding';
import { bandCurveRefusal } from './curveRefusal';

// Final review 3: Curves' band refusal is worded by band kind, and `no-side` reads as a sentence.
const W0 = BAND_SIDES[0]!;
const maple: BandType = { id: 'm', name: 'Maple', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
// A tape WITH thickness: a zero-thickness tape (the built-in) never needs a straight edge, so it could not be refused.
const thickTape: BandType = { id: 't', name: 'PVC', kind: 'tape', thickness: 1 / 32, lengthAllowance: 0.5, tapeWidth: 1, pricePerFoot: null };
const types = [maple, thickTape];
const banded = (type: string, over: Partial<Board> = {}) =>
  createBoard({ id: 'a', name: 'Top', length: 30, width: 12, thickness: 0.75, material: 'plywood', bands: [{ side: W0, type }], ...over } as Partial<Board>);
const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };

afterEach(() => vi.restoreAllMocks());

describe('bandCurveRefusal words (final review 3)', () => {
  it('solid: the existing Edging words, byte for byte', () => {
    expect(bandCurveRefusal(banded('m'), banded('m', { curves: [arch] }), types))
      .toBe('Edging on the width min side needs a straight edge — remove the band first.');
  });
  it('tape: Tape on the …', () => {
    expect(bandCurveRefusal(banded('t'), banded('t', { curves: [arch] }), types))
      .toBe('Tape on the width min side needs a straight edge — remove the band first.');
  });
  it('no-side: the band would have no edge left', () => {
    const before = banded('t'), after = banded('t', { curves: [arch] });
    vi.spyOn(banding, 'bandFaults').mockImplementation((p) => (p === after ? [{ side: W0, kind: 'no-side' }] : []));
    expect(bandCurveRefusal(before, after, types)).toBe('The band on the width min side would have no edge left — remove the band first.');
  });
});
