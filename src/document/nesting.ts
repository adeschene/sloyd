import type { Board, SheetStock } from './types';

/**
 * How a part lands on a sheet: its footprint AS PLACED.
 *
 * `w` runs along the sheet's length, `h` across it. `turned` is true when the
 * part's own length runs ACROSS the sheet.
 */
export interface Footprint {
  w: number;
  h: number;
  turned: boolean;
}

/**
 * The orientations a part is allowed to take, PREFERRED FIRST.
 *
 * Under `rotate: 'grain'` there is exactly one, and `board.grain` chooses it —
 * the field is doing real work here rather than being passively obeyed. Under
 * `rotate: 'free'` both are allowed, and the one that opens the SHORTER shelf
 * comes first: a shelf's height is fixed by its first part, so lying parts
 * down wastes less of the sheet's width.
 *
 * A part's THICKNESS never appears — it is the sheet's, which is why thickness
 * is a grouping key rather than a packing input.
 */
export function footprintsOf(board: Board, stock: SheetStock): Footprint[] {
  // 'thickness' is meaningless for a sheet good and validateBoard normalises
  // it away; a Board built in code could still carry it, and defaulting beats
  // throwing.
  const natural: Footprint =
    board.grain === 'width'
      ? { w: board.width, h: board.length, turned: true }
      : { w: board.length, h: board.width, turned: false };

  if (stock.rotate === 'grain') return [natural];

  const flipped: Footprint = { w: natural.h, h: natural.w, turned: !natural.turned };
  return natural.h <= flipped.h ? [natural, flipped] : [flipped, natural];
}
