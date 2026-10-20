import { describe, expect, it } from 'vitest';
import { bandEditRefusal, bandsShownCorner } from './bandingRefusal';
import { createBoard } from '../document/document';
import { archCurve } from '../document/curves';
import { BAND_SIDES, BUILT_IN_BAND } from '../document/banding';
import type { BandType } from '../document/types';

const maple: BandType = { id: 'm', name: 'Maple', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const types = [BUILT_IN_BAND, maple];
const W0 = BAND_SIDES[0]!, L0 = BAND_SIDES[2]!;
const plain = createBoard({ id: 'a', length: 30, width: 12, thickness: 0.75, material: 'plywood' });
const arched = { ...plain, id: 'b', curves: [{ id: 'c', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 2 }) }] };

describe('band edit refusals (edge banding spec §5.1)', () => {
  it('solid on an arched side is refused with its reason; tape is not', () => {
    expect(bandEditRefusal([plain, arched], types, [W0], 'm')).toBe('Needs a straight edge');
    expect(bandEditRefusal([plain, arched], types, [W0], BUILT_IN_BAND.id)).toBeNull();
    expect(bandEditRefusal([plain], types, [W0], 'm')).toBeNull();
  });
  it('clearing is never refused; a fault the part already has does not refuse', () => {
    const faulted = { ...arched, bands: [{ side: W0, type: 'm' }] };
    expect(bandEditRefusal([faulted], types, [W0], null)).toBeNull();
    expect(bandEditRefusal([faulted], types, [L0], BUILT_IN_BAND.id)).toBeNull();
  });
  it('the Corners select shows only for adjacent bands with thickness, one solid', () => {
    expect(bandsShownCorner([{ ...plain, bands: [{ side: W0, type: 'm' }, { side: L0, type: 'm' }] }], types)).toBe(true);
    expect(bandsShownCorner([{ ...plain, bands: [{ side: W0, type: 'm' }, { side: BAND_SIDES[1]!, type: 'm' }] }], types)).toBe(false);
    expect(bandsShownCorner([{ ...plain, bands: [{ side: W0, type: 'm' }, { side: L0, type: BUILT_IN_BAND.id }] }], types)).toBe(false);
  });
  it('two adjacent TAPE bands with thickness show no Corners select (tape makes no strips)', () => {
    const thick: BandType = { id: 't', name: 'Thick tape', kind: 'tape', thickness: 0.03125, lengthAllowance: 0.5, tapeWidth: 1, pricePerFoot: null };
    const all = [...types, thick];
    expect(bandsShownCorner([{ ...plain, bands: [{ side: W0, type: 't' }, { side: L0, type: 't' }] }], all)).toBe(false);
    expect(bandsShownCorner([{ ...plain, bands: [{ side: W0, type: 't' }, { side: L0, type: 'm' }] }], all)).toBe(true);
  });
  it('a faulted band meets no corner; one part of several is enough', () => {
    const arc = { ...arched, bands: [{ side: W0, type: 'm' }, { side: L0, type: 'm' }] };
    expect(bandsShownCorner([arc], types)).toBe(false);
    expect(bandsShownCorner([arc, { ...plain, bands: [{ side: BAND_SIDES[1]!, type: 'm' }, { side: BAND_SIDES[3]!, type: 'm' }] }], types)).toBe(true);
  });
});
