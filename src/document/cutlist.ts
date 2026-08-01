import { MATERIALS } from './types';
import type { Board, Cut, Grain, SloydDocument } from './types';
import { positionAxisOf } from './geometry';
import { cutLabel } from './cuts';
import { formatLength } from '../units/length';

/**
 * One row of the cut list: every part that is cut from the same stock, in the
 * same way, collapsed together.
 *
 * The exact numbers are the FIRST such part's — two parts collapse when they
 * print identically, not when they are equal, so a row's exact values are a
 * representative rather than a shared truth. They exist for sorting and for
 * tests; `dims` is what the user sees, and it is derived from the same
 * representative, so screen and key can never disagree.
 */
export interface CutListRow {
  /** The identity string this row was grouped by. Stable, and the React key. */
  key: string;
  qty: number;
  /** Board names, in document order. Unique per invariant 8. */
  names: string[];
  length: number;
  width: number;
  thickness: number;
  grain: Grain;
  /** e.g. `24" × 3-1/2"`, already formatted. */
  dims: string;
  /** One line per cut, already formatted. Empty for a row with no joinery. */
  setup: string[];
}

export interface CutListGroup {
  /** MATERIALS key. */
  material: string;
  /** Exact inches. */
  thickness: number;
  /** e.g. `Pine — 3/4"` */
  label: string;
  rows: CutListRow[];
}

export interface CutList {
  groups: CutListGroup[];
}

/**
 * Total rather than assuming a validated document, for the same reason
 * `cutRegion` is: a Board built directly — a test, a future creation path —
 * can reach here without passing the validator.
 */
function materialLabel(material: string): string {
  return MATERIALS[material]?.label ?? material;
}

/**
 * The joinery half of a row's identity — EXACT, deliberately unlike the
 * dimensions.
 *
 * A stock dimension rounded to the precision you cut to costs you nothing; you
 * were going to cut to that precision anyway. A dado LOCATION rounded the same
 * way costs you the joint: two dados 1/32" apart are two different setups, and
 * a merged row would print one offset and be quietly wrong about the other
 * part. Being too strict splits a row, which is visible and harmless; being too
 * loose prints a wrong measurement, which is neither.
 *
 * This is not the float-equality hazard that made `cutLabel` wrong 2.8% of the
 * time — that compared a SUBTRACTION RESULT against a bound. These are stored
 * values compared to stored values, and two cuts entered as the same number are
 * the same number.
 *
 * Sorting is what makes it order-independent: the same two dados added in
 * either order produce the same signature. `id` is excluded — it is identity,
 * not geometry.
 */
function cutSignature(cuts: Cut[]): string {
  return cuts
    .map((c) =>
      [c.face, c.from, c.across, String(c.offset), String(c.width), String(c.depth)].join(':'),
    )
    .sort()
    .join(';');
}

/**
 * One cut as a line you can read at the bench.
 *
 * Takes the board, not just the cut, because `cutLabel` needs it — dado versus
 * rabbet depends on where the cut sits in the board's dimensions. That is why
 * setup lines are built during grouping, while the board is in hand, rather
 * than reconstructed later from a CutListRow, which carries no board.
 */
function setupLine(board: Board, cut: Cut, precision: number): string {
  const f = (n: number) => formatLength(n, precision);
  const pos = positionAxisOf(cut.face, cut.across);
  return (
    `${f(cut.width)} ${cutLabel(board, cut)}, ${f(cut.depth)} deep — ` +
    `into the ${cut.face} face (${cut.from} side), ` +
    `${f(cut.offset)} from the ${pos} min end, running across the ${cut.across}`
  );
}

/**
 * What makes two parts one row.
 *
 * Every NUMBER goes through `formatLength` at the document's precision, and
 * every ENUM goes in verbatim; the fields are joined with `|`, a character
 * `formatLength` never emits (its output is digits, `-`, `/` and `"`) and no
 * enum contains. So the tolerance rule is not a comparison that could disagree
 * with the screen — two rows that print identically ARE one row, by
 * construction, and no float is ever compared for equality.
 *
 * `position`, `rotation` and `posture` are absent deliberately: they say where
 * a part sits in the model, not how it is cut from stock. `grain` IS present —
 * a part whose fibres run along its width is laid out on the board differently
 * from one running along its length, so collapsing those would produce a row
 * you cannot cut as a batch.
 */
function rowKey(board: Board, precision: number): string {
  const f = (n: number) => formatLength(n, precision);
  return [
    board.material,
    f(board.thickness),
    f(board.length),
    f(board.width),
    board.grain,
    cutSignature(board.cuts),
  ].join('|');
}

export function buildCutList(doc: SloydDocument): CutList {
  const precision = doc.units.precision;
  const groups = new Map<string, CutListGroup>();
  const rows = new Map<string, CutListRow>();

  for (const board of doc.boards) {
    const groupKey = `${board.material}|${formatLength(board.thickness, precision)}`;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        material: board.material,
        thickness: board.thickness,
        label: `${materialLabel(board.material)} — ${formatLength(board.thickness, precision)}`,
        rows: [],
      };
      groups.set(groupKey, group);
    }

    // rowKey starts with the group's own two fields, so a row key is unique
    // across the whole list and belongs to exactly one group.
    const key = rowKey(board, precision);
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        qty: 0,
        names: [],
        length: board.length,
        width: board.width,
        thickness: board.thickness,
        grain: board.grain,
        dims: `${formatLength(board.length, precision)} × ${formatLength(board.width, precision)}`,
        setup: board.cuts.map((cut) => setupLine(board, cut, precision)),
      };
      rows.set(key, row);
      group.rows.push(row);
    }
    row.qty += 1;
    row.names.push(board.name);
  }

  const out = [...groups.values()];
  for (const group of out) {
    // `key` as the final tiebreak so the order is total: tests assert on it
    // and React keys off it, the same reason `mergeAlong` sorts.
    group.rows.sort(
      (a, b) => b.length - a.length || b.width - a.width || a.key.localeCompare(b.key),
    );
  }
  out.sort(
    (a, b) =>
      materialLabel(a.material).localeCompare(materialLabel(b.material)) ||
      b.thickness - a.thickness,
  );
  return { groups: out };
}
