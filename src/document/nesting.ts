import type { Board, SheetStock } from './types';
import { formatLengthBare, formatSize, tradeSize, type Units } from '../units/length';

/**
 * `length × width`, formatted — the ONE home of that expression here.
 *
 * It had three copies (a placed part, an unplaceable part, the sheet stock
 * itself) with nothing pinning that they stayed in agreement if one were ever
 * edited alone — follow-up 92's first half. They are one dimension pair read
 * off one sheet, and the module already imports `formatLengthBare` so that a
 * dimension cannot read differently in two places on one printed sheet; three
 * spellings of the same expression is that guarantee held by convention
 * rather than by construction.
 *
 * Takes two numbers rather than a `Board`, which is what lets the sheet-stock
 * call site share it — `SheetStock` is not a `Board` and never will be.
 *
 * A drawing label (spec R8): bare numbers in the document's units — metric `762 × 286` (the sheet carries one
 * "Dimensions in mm" note), imperial with its marks, byte-for-byte as before. This module stays the one owner of
 * the string `SheetLayout` measures and draws (invariant 19).
 */
const formatDims = (length: number, width: number, units: Units) =>
  `${formatLengthBare(length, units)} × ${formatLengthBare(width, units)}`;

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
 * A part's footprint with its grain running along the stock's LENGTH — the only
 * orientation solid lumber allows, and the first option under `rotate: 'grain'`.
 * Exported for the by-the-piece packer (`packOnto`).
 */
export function grainFootprint(board: Board): Footprint {
  return board.grain === 'width'
    ? { w: board.width, h: board.length, turned: true }
    : { w: board.length, h: board.width, turned: false };
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
  const natural = grainFootprint(board);
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
  /**
   * Already formatted, e.g. `48" × 24"`, or `48" × 24" turned` for a part the
   * packer laid across the sheet — `length × width`, the board's OWN
   * dimensions, never `w`/`h` as placed. Two things this deliberately is not:
   * a re-derivation of the footprint (a turned part's `w`/`h` are swapped
   * relative to `length`/`width`, so printing those would transpose the
   * number a reader just saw on the cut-list row for the same board — see
   * `CutListRow.dims` in `cutlist.ts`, which always prints `length × width`
   * regardless of how a board sits), and not raw floats (`parseLength`
   * accepts decimal and millimetre entry, so an unformatted dimension can be
   * a 15-digit artifact). The panel formats nothing; this field is why it
   * doesn't have to for a placed part either.
   *
   * **The word `turned` is part of THIS string rather than the panel's, and
   * that is invariant 19 rather than tidiness** (follow-up 92's second half).
   * `SheetLayout` hands `[name, dims]` to `fitLabel` and then draws those same
   * two strings, so the measured text and the drawn text are the same object;
   * a panel-side concatenation would measure one string and draw a longer one,
   * and every unit test would still pass because the tests assert the
   * arithmetic, not the render. It costs the part label seven characters, so a
   * turned part reaches a smaller label tier sooner than an unturned one —
   * accepted, because the alternative is a rectangle whose rotation a reader
   * cannot recover at all near a 1:1 aspect ratio.
   *
   * `turned` above stays a boolean beside it: one is the fact, the other is
   * what gets printed, and the tests for the packer assert the fact.
   */
  dims: string;
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
  stock: { length: number; width: number },
  kerf: number,
  units: Units,
): boolean {
  // length × width, the board's own dimensions — matches CutListRow.dims's
  // order for the same board regardless of `turned`. Computed once here
  // rather than inside `put`, which runs per placement attempt.
  const dims = formatDims(board.length, board.width, units);

  const put = (f: Footprint, x: number, y: number) => {
    sheet.parts.push({
      boardId: board.id,
      name: board.name,
      x,
      y,
      w: f.w,
      h: f.h,
      turned: f.turned,
      // The word is APPENDED, never a transposition of the numbers: a reader
      // must see the same pair here as on the cut-list row for this board.
      dims: f.turned ? `${dims} turned` : dims,
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
  units: Units,
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
    if (sheets.some((sheet) => placeOn(sheet, board, options, stock, kerf, units))) continue;

    const sheet: WorkingSheet = { parts: [], shelves: [] };
    // A fresh sheet must never enter `sheets` unless a part actually landed
    // on it. `sheets.length` becomes the count printed on the sheet — an
    // empty sheet counted here is the exact wrong purchasing number this
    // feature exists to produce, so `push` happens only inside this branch,
    // gated on `placeOn`'s own result, never unconditionally before it.
    if (placeOn(sheet, board, options, stock, kerf, units)) {
      sheets.push(sheet);
    } else {
      unplaceable.push({
        boardId: board.id,
        name: board.name,
        // No `turned` here, and not an omission: a part that fit no sheet in
        // ANY allowed orientation was never placed, so it has none to report.
        // Prose in the cut list (the user's own part), not a measured label: a metric project reads `2500 × 600 mm`.
        dims: formatSize([board.length, board.width], units),
      });
    }
  }

  const count = sheets.length;
  // Prose (the group header, the unplaceable line), never measured by SheetLayout: the sheet in TRADE form as Buying
  // reads it — metric `96" × 48" (2438 × 1219 mm)`. Placed parts' `dims` stay bare (inv 19).
  const sheet = tradeSize([stock.length, stock.width], units);
  return {
    sheets: sheets.map((s) => ({ parts: s.parts })),
    unplaceable,
    label: `${count} sheet${count === 1 ? '' : 's'} (${sheet})`,
    sheet,
  };
}

/** One stock size a by-the-piece packer may open: its length runs along the grain. */
export interface Bin { length: number; width: number }
export interface PackedBin<B extends Bin> { bin: B; parts: PlacedPart[] }

/**
 * Pack solid-lumber parts onto boards chosen as packing proceeds (lumber yield
 * and cost spec §3.2). The same SHELF FIRST-FIT-DECREASING core as buildNesting —
 * edge-to-edge cuts, kerf between parts, the same EPS (invariants 22, 23) — with
 * two differences: grain always runs along the board (no rotation), and the bins
 * are not one sheet size. A part first tries every board already open; when none
 * holds it, the LARGEST size (by length, then width; ties keep list order) that
 * holds it alone is opened. A part no size holds is returned in `unplaceable`,
 * never dropped. Choosing cheaper sizes afterwards is the caller's job.
 */
export function packOnto<B extends Bin>(
  boards: Board[],
  sizes: readonly B[],
  kerf: number,
  units: Units,
): { bins: PackedBin<B>[]; unplaceable: Board[] } {
  const sorted = [...boards].sort((a, b) => {
    const fa = grainFootprint(a);
    const fb = grainFootprint(b);
    return fb.h - fa.h || fb.w - fa.w || a.id.localeCompare(b.id);
  });
  const open: { bin: B; sheet: WorkingSheet }[] = [];
  const unplaceable: Board[] = [];
  for (const board of sorted) {
    const options = [grainFootprint(board)];
    if (open.some((o) => placeOn(o.sheet, board, options, o.bin, kerf, units))) continue;
    let pick: B | null = null;
    for (const s of sizes) {
      if (!fits(options[0]!.w, s.length) || !fits(options[0]!.h, s.width)) continue;
      if (!pick || s.length > pick.length || (s.length === pick.length && s.width > pick.width)) pick = s;
    }
    if (!pick) { unplaceable.push(board); continue; }
    const sheet: WorkingSheet = { parts: [], shelves: [] };
    placeOn(sheet, board, options, pick, kerf, units);
    open.push({ bin: pick, sheet });
  }
  return { bins: open.map((o) => ({ bin: o.bin, parts: o.sheet.parts })), unplaceable };
}
