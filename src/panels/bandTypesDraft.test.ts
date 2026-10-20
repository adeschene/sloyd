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

describe('the fault rule judges against the STORED list (task 9 review)', () => {
  it('two edits that together leave no core are refused, though each alone reads the other as given', () => {
    const a: BandType = { ...maple, id: 'a1', name: 'A' };
    const b: BandType = { ...maple, id: 'b1', name: 'B' };
    const part = { ...shelf, bands: [{ side: { across: 'width', from: 'min' } as const, type: 'a1' }, { side: { across: 'width', from: 'max' } as const, type: 'b1' }] };
    const types = [BUILT_IN_BAND, a, b];
    const rows = initialBandRows(types).map((r) => (r.id === 'a1' || r.id === 'b1' ? { ...r, draft: { ...r.draft, thickness: '11-3/4' } } : r));
    expect(planBandTypes(rows, types, { ...ctx, parts: [part] })).toEqual({ refused: 'Shelf: leaves no core.' });
  });
});

describe('a name clash refuses only a TYPED name (task 9 review)', () => {
  it('an imported pair differing only in case is not refused untouched, and an edit onto it is', () => {
    const t1: BandType = { ...BUILT_IN_BAND, id: 't1', name: 'Tape' };
    const t2: BandType = { ...BUILT_IN_BAND, id: 't2', name: 'tape' };
    const types = [BUILT_IN_BAND, t1, t2];
    const rows = initialBandRows(types);
    expect(planBandTypes(rows, types, ctx)).toBeNull();
    expect(bandRowRefusal({ ...rows[1]!, draft: { ...rows[1]!.draft, name: 'TAPE ' } }, rows, ctx)).toBeNull(); // the same name, re-cased
    expect(bandRowRefusal({ ...rows[0]!, draft: { ...rows[0]!.draft, name: 'tape' } }, rows, ctx)).toBe('Another band type is called "Tape".');
  });
});
