import { footprintsOf } from './nesting';
import { createBoard } from './document';
import type { SheetStock } from './types';

const PLY: SheetStock = { length: 96, width: 48, rotate: 'grain' };
const MDF: SheetStock = { length: 96, width: 48, rotate: 'free' };

describe('footprintsOf', () => {
  // Under 'grain' the part's grain field DETERMINES its orientation — it is
  // not merely a veto on rotating. A part whose veneer runs across its width
  // is laid on the sheet that way, which is what makes the drawing true.
  it('lays a length-grained part along the sheet', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'length', material: 'plywood' });
    expect(footprintsOf(b, PLY)).toEqual([{ w: 30, h: 20, turned: false }]);
  });

  it('lays a width-grained part across the sheet', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'width', material: 'plywood' });
    expect(footprintsOf(b, PLY)).toEqual([{ w: 20, h: 30, turned: true }]);
  });

  it('offers one orientation only under a grain policy', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'width', material: 'plywood' });
    expect(footprintsOf(b, PLY)).toHaveLength(1);
  });

  // Free rotation prefers the orientation that opens the SHORTER shelf: a
  // shelf's height is fixed by its first part, so lying parts down wastes
  // less sheet width.
  it('offers both orientations for a free-rotating material, shortest shelf first', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'length', material: 'mdf' });
    expect(footprintsOf(b, MDF)).toEqual([
      { w: 30, h: 20, turned: false },
      { w: 20, h: 30, turned: true },
    ]);
  });

  it('prefers the same orientation regardless of which way grain points', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'width', material: 'mdf' });
    expect(footprintsOf(b, MDF)[0]).toEqual({ w: 30, h: 20, turned: false });
  });

  // Not reachable through the UI (validateBoard normalises it away for sheet
  // goods) but a Board built in code can carry it. Defaulting beats throwing,
  // same narrow scope as materialLabel's `??`.
  it('treats a thickness-grained sheet part as length-grained', () => {
    const b = createBoard({ length: 30, width: 20, material: 'plywood' });
    expect(footprintsOf({ ...b, grain: 'thickness' }, PLY)).toEqual([
      { w: 30, h: 20, turned: false },
    ]);
  });
});
