import type { Board, SheetStock } from './types';
import { formatLength } from '../units/length';

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

/** One part, placed. Inches from the sheet's min corner. */
export interface PlacedPart {
  boardId: string;
  name: string;
  /** Along the sheet's length. */
  x: number;
  /** Across the sheet's width. */
  y: number;
  /** Footprint as placed — see Footprint. */
  w: number;
  h: number;
  turned: boolean;
}

export interface NestedSheet {
  parts: PlacedPart[];
}

export interface UnplaceablePart {
  boardId: string;
  name: string;
  /** Already formatted, e.g. `100" × 30"`. */
  dims: string;
}

export interface Nesting {
  sheets: NestedSheet[];
  /** Parts that fit no empty sheet in any allowed orientation. NEVER dropped. */
  unplaceable: UnplaceablePart[];
  /** e.g. `3 sheets (96" × 48")`, already formatted. */
  label: string;
  /**
   * Just the sheet size, e.g. `96" × 48"`. A separate field rather than a
   * substring of `label`, so the unplaceable line can name the sheet a part
   * failed to fit without a panel picking `label` apart with a regex — the
   * panel formats nothing, and that includes un-formatting.
   */
  sheet: string;
}

/**
 * Tolerance on the fits-test, and it is the OPPOSITE of invariant 18's rule.
 *
 * The hazard is accumulated ADDITION, not subtraction: `x = shelf.used + kerf`
 * and `shelf.used = x + f.w` chain across every part placed on a shelf, so
 * `fits(x + f.w, stock.length)` compares a running SUM against a bound —
 * error can build with every part added to the shelf, the same shape
 * cutSignature's comment names as the hazard that made cutLabel wrong 2.8% of
 * the time. (No remainder is ever computed here — `stock.length - used` does
 * not appear in this file.)
 *
 * For fractional-inch input this hazard is provably unreachable: sixteenths
 * and sixty-fourths are dyadic rationals, and sums of dyadic rationals are
 * exact in binary floating point. A sweep of 15,298 fractional-inch cases
 * (every 1/16 and 1/64 up to 96", against kerfs 0, 1/8, 1/16, 3/32) produced
 * bit-identical output with and without EPS — the four-24"-parts fixture
 * below does not exercise this tolerance at all, since 24 × 4 = 96 exactly.
 * EPS earns its keep on the inputs `parseLength` accepts that are NOT
 * dyadic — decimal entry (`DECIMAL_RE` in `src/units/length.ts`) and
 * millimetres (divided by 25.4, an irrational-in-binary constant) — where
 * summed error is real and visible after enough parts accumulate it.
 *
 * Invariant 18 says cut signatures compare EXACTLY, and that stays true: there
 * both sides are stored values a user typed, and two cuts entered identically
 * hold identical doubles. Here one side is computed. Same rule, different
 * arithmetic — round nothing that is machined, tolerate float error where
 * float error is what you have.
 */
const EPS = 1e-6;

const fits = (extent: number, room: number): boolean => extent <= room + EPS;

/** A full-length strip. Its height is fixed by its first — therefore tallest — part. */
interface Shelf {
  y: number;
  h: number;
  /** How far along the sheet's length this shelf is filled. */
  used: number;
}

interface WorkingSheet {
  parts: PlacedPart[];
  shelves: Shelf[];
}

function placeOn(
  sheet: WorkingSheet,
  board: Board,
  options: Footprint[],
  stock: SheetStock,
  kerf: number,
): boolean {
  const put = (f: Footprint, x: number, y: number) => {
    sheet.parts.push({
      boardId: board.id, name: board.name, x, y, w: f.w, h: f.h, turned: f.turned,
    });
  };

  for (const shelf of sheet.shelves) {
    for (const f of options) {
      // Kerf between neighbours only — never at an edge.
      const x = shelf.used + kerf;
      if (fits(x + f.w, stock.length) && fits(f.h, shelf.h)) {
        put(f, x, shelf.y);
        shelf.used = x + f.w;
        return true;
      }
    }
  }

  const last = sheet.shelves[sheet.shelves.length - 1];
  const y = last ? last.y + last.h + kerf : 0;
  for (const f of options) {
    if (fits(f.w, stock.length) && fits(y + f.h, stock.width)) {
      put(f, 0, y);
      sheet.shelves.push({ y, h: f.h, used: f.w });
      return true;
    }
  }

  return false;
}

/**
 * Pack one material-and-thickness group's parts onto sheets.
 *
 * SHELF FIRST-FIT-DECREASING, and the choice is a domain fact rather than a
 * simplification. A shop breaks sheets down on a table saw or with a track
 * saw: EVERY CUT RUNS EDGE TO EDGE. A maxrects packer produces denser layouts
 * containing placements nobody can physically cut — an L-shaped remainder
 * needs a cut that stops in the middle of the sheet. Shelves are ripped, then
 * each strip is crosscut, which is exactly how the work is done.
 *
 * Takes BOARDS, never CutListRows. A row is representative — two parts share
 * one when they PRINT identically at the document's precision — and a layout
 * built from rounded dimensions can overflow a real sheet. Here the error
 * would decide whether you buy two sheets or three, so every rectangle
 * carries its own board's exact footprint. Fourth instance of the shape
 * follow-ups 55 and 82 record.
 *
 * STOCK, NOT REMAINDER: `board.cuts` is not read. A part is cut from the sheet
 * at its stock dimensions and the dados happen afterward, out of material
 * already on the bench. A reader arriving from cuts.ts is primed to subtract;
 * don't.
 */
export function buildNesting(
  boards: Board[],
  stock: SheetStock,
  kerf: number,
  precision: number,
): Nesting {
  // Decreasing by the preferred orientation's across-sheet extent — first-fit
  // DECREASING, not a guarantee. Under `rotate: 'free'` this key is the
  // SMALLER-h orientation (footprintsOf's shortest-shelf preference), while
  // `placeOn` may still choose the taller one for a given shelf; the sort
  // alone does not make a shelf's first part its tallest. That property is
  // enforced by `placeOn`'s `fits(f.h, shelf.h)` guard, not by this ordering —
  // do not "simplify" that guard away on the strength of this comment. The
  // `id` tiebreak is what makes the order TOTAL, and therefore the output
  // stable under input permutation — without it a layout reshuffles as parts
  // are renamed.
  const sorted = [...boards].sort((a, b) => {
    const fa = footprintsOf(a, stock)[0];
    const fb = footprintsOf(b, stock)[0];
    return fb.h - fa.h || fb.w - fa.w || a.id.localeCompare(b.id);
  });

  const sheets: WorkingSheet[] = [];
  const unplaceable: UnplaceablePart[] = [];

  for (const board of sorted) {
    const options = footprintsOf(board, stock);

    // ONE PATH, not two predicates that could drift apart. Earlier this
    // called a standalone `options.some(fits(...))` pre-check before ever
    // opening a sheet, then trusted that check's verdict when deciding
    // whether a failed fresh-sheet placement was possible — and had that
    // trust betrayed by a THROW when the two disagreed. But `buildNesting`
    // is called on every render of the cut list, with no cache and no error
    // boundary (see `buildCutList` and `panels/CutList.tsx`), so a throw
    // here blanks the whole sheet for a state whose correct rendering is a
    // one-line "doesn't fit" entry — worse than the empty-sheet bug it was
    // guarding against. `UnplaceablePart`'s own doc comment already names
    // the condition precisely: "parts that fit no empty sheet in any allowed
    // orientation." A part that fails `placeOn` on a FRESH (therefore empty)
    // sheet has just demonstrated that condition directly, so recording it
    // here loses no information and needs no separate predicate to agree
    // with. Try existing sheets first; if none take it, try one fresh sheet;
    // only THAT attempt's own result decides placed-vs-unplaceable, so there
    // is nothing left to diverge from.
    if (sheets.some((sheet) => placeOn(sheet, board, options, stock, kerf))) continue;

    const sheet: WorkingSheet = { parts: [], shelves: [] };
    if (placeOn(sheet, board, options, stock, kerf)) {
      sheets.push(sheet);
    } else {
      unplaceable.push({
        boardId: board.id,
        name: board.name,
        dims: `${formatLength(board.length, precision)} × ${formatLength(board.width, precision)}`,
      });
    }
  }

  const count = sheets.length;
  const sheet =
    `${formatLength(stock.length, precision)} × ${formatLength(stock.width, precision)}`;
  return {
    sheets: sheets.map((s) => ({ parts: s.parts })),
    unplaceable,
    label: `${count} sheet${count === 1 ? '' : 's'} (${sheet})`,
    sheet,
  };
}
