import { isSheetGood, sheetStockOf, MATERIALS } from './types';

describe('sheet stock metadata', () => {
  it('still reports which materials are sheet goods', () => {
    expect(isSheetGood('plywood')).toBe(true);
    expect(isSheetGood('mdf')).toBe(true);
    expect(isSheetGood('pine')).toBe(false);
    expect(isSheetGood('nonesuch')).toBe(false);
  });

  it('gives plywood a 4x8 sheet that honours grain', () => {
    expect(sheetStockOf('plywood')).toEqual({ length: 96, width: 48, rotate: 'grain' });
  });

  // MDF has no grain at all, so a part may be turned to pack better. This is
  // the whole reason `rotate` is a per-material policy rather than a global.
  it('lets MDF parts rotate freely', () => {
    expect(sheetStockOf('mdf')).toEqual({ length: 96, width: 48, rotate: 'free' });
  });

  it('has no sheet stock for solid lumber', () => {
    expect(sheetStockOf('walnut')).toBeUndefined();
    expect(sheetStockOf('nonesuch')).toBeUndefined();
  });

  it('gives every sheet good a sheet, and no solid material one', () => {
    for (const key of Object.keys(MATERIALS)) {
      expect(sheetStockOf(key) !== undefined).toBe(isSheetGood(key));
    }
  });
});
