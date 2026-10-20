import { describe, expect, it } from 'vitest';
import { bandRowRefusal, initialBandRows, newBandRow, planBandTypes } from './bandTypesDraft';
import { BUILT_IN_BAND } from '../document/banding';
import { createBoard } from '../document/document';
import type { BandType } from '../document/types';

const maple: BandType = { id: 'm', name: 'Maple edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const shelf = { ...createBoard({ id: 'a', name: 'Shelf', length: 30, width: 12, thickness: 0.75, material: 'plywood' }), bands: [{ side: { across: 'width', from: 'min' } as const, type: 'm' }] };
const ctx = { parts: [shelf], solids: new Set(['pine', 'oak', 'maple', 'walnut', 'cherry']) };
const original = [BUILT_IN_BAND, maple];

describe('the Edge banding section (edge banding spec §5.2)', () => {
  it('unchanged rows plan nothing', () => expect(planBandTypes(initialBandRows(original), original, ctx)).toBeNull());
  it('an edit plans the whole list, values parsed', () => {
    const rows = initialBandRows(original).map((r) => (r.id === 'm' ? { ...r, draft: { ...r.draft, thickness: '3/8' } } : r));
    expect(planBandTypes(rows, original, ctx)).toEqual([BUILT_IN_BAND, { ...maple, thickness: 0.375 }]);
  });
  it('a new row takes the defaults and a unique name', () => {
    const rows = initialBandRows(original);
    const added = newBandRow('solid', rows);
    expect(added.draft.name).toBe('Solid edging');
    const plan = planBandTypes([...rows, added], original, ctx) as BandType[];
    expect(plan[2]).toMatchObject({ kind: 'solid', thickness: 0.25, material: 'maple' });
  });
  it('refusals: an empty or repeated name, a bad number, a zero solid thickness, a sheet material', () => {
    const rows = initialBandRows(original);
    const m = rows[1]!;
    expect(bandRowRefusal({ ...m, draft: { ...m.draft, name: ' ' } }, rows, ctx)).toBe('Give the band type a name.');
    expect(bandRowRefusal({ ...m, draft: { ...m.draft, name: 'Iron-on veneer' } }, rows, ctx)).toBe('Another band type is called "Iron-on veneer".');
    expect(bandRowRefusal({ ...m, draft: { ...m.draft, thickness: 'abc' } }, rows, ctx)).toBe('Thickness must be a length.');
    expect(bandRowRefusal({ ...m, draft: { ...m.draft, thickness: '0' } }, rows, ctx)).toBe('Solid edging needs a thickness.');
    expect(bandRowRefusal({ ...m, draft: { ...m.draft, material: 'plywood' } }, rows, ctx)).toBe('Edging comes from solid wood.');
  });
  it('a deletion is refused while used; the built-in has none', () => {
    const rows = initialBandRows(original);
    expect(bandRowRefusal({ ...rows[1]!, deleted: true }, rows, ctx)).toBe('Used by 1 part — change its bands first.');
  });
  it('an edit that adds a fault to a part is refused, naming it', () => {
    const rows = initialBandRows(original);
    const m = rows[1]!;
    // one 12" band on the 12"-wide shelf's width min side leaves no core
    expect(bandRowRefusal({ ...m, draft: { ...m.draft, thickness: '12' } }, rows, ctx)).toBe('Shelf: leaves no core.');
  });
});
