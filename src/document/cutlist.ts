import { isSheetGood, type SheetStock } from './types';
import { catalogOf } from './materials';
import type { BandType, Board, CornerRule, Cut, Grain, ProfileSide, Region, FlatDocument } from './types';
import { CUT_GEOMETRY_KEYS, pocketCells, cutShape, cutsThatRemoveStock } from './cuts';
import type { CutShape } from './cuts';
import { angleCutValues, angleCutsThatRemoveStock } from './angleCuts';
import { angleLine, shortPointLine } from './angleText';
import { holeLine } from './holeText';
import { holeRowValues } from './holes';
import { curveLines } from './curveText';
import { curveValues } from './curves';
import { findTenons } from './tenons';
import type { Tenon } from './tenons';
import { buildDiagrams } from './diagram';
import type { DiagramView } from './diagram';
import { buildNesting } from './nesting';
import type { Nesting } from './nesting';
import { formatLength, formatSize, type Units } from '../units/length';
import { nominalName } from '../units/nominal';
import { formatBoardFeet, formatSquareFeet } from '../units/quantity';
import { geometryBoard, profileValues, sweptProfiles } from './profiles';
import { bandFaultText, bandFaults, bandSignature, bandsMeetAtCorner, coreSize, cutStock, sameSide, stripBoard, strips } from './banding';
import type { BandFaultKind, Strip } from './banding';
import { edgeName } from './holeText';

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
  /** 1-based position in display order across every group (plans balloons spec §2): the ONE row number, printed on
   *  the cut list and on the Plans sheet's balloons. Assigned once, after the sort below; never stored. */
  number: number;
  /** The ids of the row's boards, in document order (`flatDocument` ids, which are `worldParts` ids). [] on a strip row. */
  boardIds: string[];
  /** A strip row's strip ids (edge banding spec §4.2), so a board layout labels a strip with its number; [] on a part row. */
  stripIds: string[];
  /** Board names, in document order. Unique per invariant 8. */
  names: string[];
  length: number;
  width: number;
  thickness: number;
  grain: Grain;
  /** e.g. `24" × 3-1/2"`, already formatted. */
  dims: string;
  /**
   * The nominal name (`2×4`) when the material is sold in nominal sizes and EVERY board on the row is that section
   * (exactly in imperial; reading the same whole mm in metric, fu 354 — `nominalName`); null otherwise (custom materials spec §5.3). Not the representative's: a row collapses boards that PRINT
   * alike, and naming them all after the first would round what is machined (invariant 18).
   */
  nominal: string | null;
  /** One line per cut and per angle cut, then the short point when mitered; already formatted. Empty for a row with no joinery. */
  setup: string[];
  /**
   * The same cuts, drawn. Always populated — a cut-free row carries its one
   * broad-face view, because the sheet's "all parts" setting renders it.
   *
   * Making this conditional would push a VIEW decision down into the
   * derivation and give the panel two shapes to handle, for no saving: the
   * work is a handful of rectangles per board.
   *
   * Representative, exactly as `setup` is: these are the first board's cuts.
   * Every number is right for every part in the row (`cutSignature` is exact);
   * only `kind` carries follow-up 55a's caveat, identically to the printed
   * word.
   */
  diagrams: DiagramView[];
  /**
   * Raw accumulated inches of stock this row consumes: CUBIC inches for solid
   * lumber, SQUARE inches for sheet goods. Quantity is already included.
   *
   * THE ONE NUMBER ON THIS ROW THAT IS NOT THE REPRESENTATIVE'S. Every other
   * dimension here is the first board's (see this interface's own doc comment
   * and follow-up 55); this is summed from every board's exact dimensions as
   * the grouping loop visits it. The distinction is not pedantic: a printed
   * dimension's rounding error is invisible because every board on the row
   * prints the same string, but a SUM multiplies that error by `qty` and then
   * again across the group. Two boards 0.02" apart are one row correctly, and
   * are not the same purchase.
   *
   * The visible consequence, which is intended: this may not equal `qty` times
   * the dimensions printed beside it. The printed dimensions are rounded; this
   * is not.
   */
  stockInches: number;
  /** `stockInches` formatted with its unit, e.g. `1.38 bd ft`. */
  stock: string;
}

export interface CutListGroup {
  /** A built-in MATERIALS key or a custom material id. */
  material: string;
  /**
   * Exact inches — but the FIRST board's, exactly as `CutListRow`'s numbers
   * are: a group collapsed because its parts' thicknesses print identically,
   * not because they are equal. Representative, not consensus; do not compare
   * two groups' thicknesses for equality. `label` is what the user sees.
   */
  thickness: number;
  /** e.g. `Pine — 3/4"` */
  label: string;
  rows: CutListRow[];
  /**
   * The sum of this group's rows' `stockInches`, in the same unit — cubic
   * inches for solid lumber, square inches for sheet goods. A group is one
   * material, and `isSheetGood` is a fact about the material, so a group is
   * uniform in unit and never has to choose.
   */
  stockInches: number;
  /** `stockInches` formatted with its unit, e.g. `2.05 bd ft`. */
  stock: string;
  /**
   * How this group's parts lay out on full sheets — present exactly when
   * `isSheetGood(material)`, absent otherwise, so the panel's existing
   * is-this-sheet-goods branch is the only condition it needs.
   *
   * Built from this group's BOARDS, not its rows: a row is representative and
   * a layout built from rounded dimensions can overflow a real sheet. See
   * buildNesting's own comment.
   */
  nesting?: Nesting;
  /** The sheet this group nests on — present exactly when `nesting` is (custom materials spec §3). */
  sheet?: SheetStock;
}

export interface CutList {
  groups: CutListGroup[];
  /** Sheet notes (edge banding spec §4.1); [] when nothing is banded. */
  notes: string[];
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
    .map((c) => CUT_GEOMETRY_KEYS.map((k) => String(c[k])).join(':'))
    .sort()
    .join(';');
}

/**
 * The setup line's tail: one stop for each CLOSED end of the cut's run axis,
 * or '' (cut-lines spec §2.2). An end with no stock in the gap — the board's
 * edge, or another cut's opening — is open and prints nothing, so a dado,
 * groove or rabbet, which runs through, can never carry a stop.
 */
function stopClause(s: CutShape, f: (n: number) => string): string {
  if (s.stopMin !== null && s.stopMax !== null) {
    return `, stopped ${f(s.stopMin)} short of the min end and ${f(s.stopMax)} short of the max end`;
  }
  if (s.stopMin !== null) return `, stopped ${f(s.stopMin)} short of the min end`;
  if (s.stopMax !== null) return `, stopped ${f(s.stopMax)} short of the max end`;
  return '';
}

/**
 * One cut as a line you can read at the bench, written from its SHAPE
 * (`cutShape`), never its stored fields: one pocket can be stored two ways,
 * and the line must not depend on which (follow-up 192). The drawing beside it
 * formats the same `CutShape` (diagram.ts), which is what keeps the two in
 * agreement.
 *
 * Takes the board, not just the cut, because the shape depends on the board's
 * dimensions and its other cuts. That is why setup lines are built during
 * grouping, while the board is in hand.
 */
function setupLine(board: Board, cut: Cut, units: Units, solids: Region[]): string {
  const f = (n: number) => formatLength(n, units);
  const s = cutShape(board, cut, solids);
  return (
    `${f(s.at[1] - s.at[0])} ${s.word}, ${f(cut.depth)} deep — ` +
    `into the ${cut.face} face (${cut.from} side), ` +
    `${f(s.at[0])} from the ${s.pos} min end, running across the ${s.run}` +
    stopClause(s, f)
  );
}

/** A tenon as one bench line (fu 180): it replaces the shoulder cuts it is made of. */
function tenonLine(t: Tenon, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  return `${f(t.length)} tenon, ${f(t.thickness)} thick × ${f(t.width)} wide — at the length ${t.end} end`;
}

const sideWords = (s: ProfileSide) => edgeName({ dim: s.across, side: s.from });
const CORNER_WORDS: Record<CornerRule, string> = { long: 'long edges run through', ends: 'ends run through', mitre: 'mitred corners' };

/**
 * THE band line (edge banding spec §4.1, Amended (planning) P5): one clause per band type (sides in canonical order),
 * faulted sides their own clause with its check; the corner words only where two ADJACENT unfaulted bands with thickness
 * meet and one is solid (the corner rule matters nowhere else); `finished` only when the core differs from the part.
 */
function bandLine(board: Board, types: readonly BandType[], units: Units): string | null {
  if (board.bands.length === 0) return null;
  const faults = bandFaults(board, types);
  const faultOf = (s: ProfileSide) => faults.find((f) => sameSide(f.side, s));
  const groups = new Map<string, { type: string; fault: BandFaultKind | undefined; sides: ProfileSide[] }>();
  const nameOf = new Map(types.map((t) => [t.id, t.name]));
  for (const b of board.bands) {
    // A band naming no type contributes nothing (as `judge` skips it); the loader and store never leave one.
    if (!nameOf.has(b.type)) continue;
    const fault = faultOf(b.side)?.kind;
    const key = fault ? `${b.type}|${fault}` : b.type;
    const g = groups.get(key);
    if (g) g.sides.push(b.side);
    else groups.set(key, { type: b.type, fault, sides: [b.side] });
  }
  const clauses = [...groups.values()].map(({ type, fault, sides }) =>
    `${sides.map(sideWords).join(' and ')} — ${nameOf.get(type)!}${fault ? ` — check: ${bandFaultText(fault)}` : ''}`);
  if (clauses.length === 0) return null;
  const meets = bandsMeetAtCorner(board, types);
  const core = coreSize(board, types);
  const finished = core.length !== board.length || core.width !== board.width ? `; finished ${formatSize([board.length, board.width], units)}` : '';
  return `Band: ${clauses.join('; ')}${meets ? `, ${CORNER_WORDS[board.cornerRule]}` : ''}${finished}`;
}

const deg = (r: number) => `${Number(((r * 180) / Math.PI).toFixed(1))}°`;
/** A strip's bench line (spec §4.2): trim flush, then its mitred ends, each its own angle. */
function stripSetup(s: Strip): string {
  const m = s.ends.filter((e) => e.mitre !== null).map((e) => e.mitre!);
  if (m.length === 0) return 'Trim flush';
  if (m.length === 1) return `Trim flush; mitre one end ${deg(m[0]!)}`;
  return Math.abs(m[0]! - m[1]!) <= 1e-12 ? `Trim flush; mitre both ends ${deg(m[0]!)}` : `Trim flush; mitre ends ${deg(m[0]!)} and ${deg(m[1]!)}`;
}
/** A strip row's identity tail: its ends, exact (a square and a mitred strip of one cut size are two setups). */
const endsKey = (s: Strip) => s.ends.map((e) => (e.mitre === null ? 'sq' : String(e.mitre))).join(',');

/** Setup lines: one per tenon (where its first cut stood), the rest one per cut, unchanged; the band line last. */
function setupLines(board: Board, units: Units, types: readonly BandType[]): string[] {
  const tenons = findTenons(board);
  const owner = new Map(tenons.flatMap((t) => t.cutIds.map((id) => [id, t] as const)));
  const done = new Set<Tenon>();
  const lines: string[] = [];
  const solids = pocketCells(board);
  for (const cut of cutsThatRemoveStock(board)) {
    const t = owner.get(cut.id);
    if (!t) { lines.push(setupLine(board, cut, units, solids)); continue; }
    if (!done.has(t)) { done.add(t); lines.push(tenonLine(t, units)); }
  }
  for (const c of angleCutsThatRemoveStock(board)) lines.push(angleLine(board, c, units));
  const short = shortPointLine(board, units);
  if (short) lines.push(short);
  for (const r of board.holes) lines.push(holeLine(board, r, units));
  lines.push(...curveLines(board, units));
  const band = bandLine(board, types, units);
  if (band) lines.push(band);
  return lines;
}

/** The angle-cut half of a row's identity: EXACT and order-independent, like cutSignature, `kind` included (spec §4.2). */
function angleSignature(board: Board): string {
  return angleCutsThatRemoveStock(board).map((c) => angleCutValues(c).join(':')).sort().join(';');
}

/** The hole half of a row's identity: EXACT and order-independent, ids ignored (holes spec §4.2). */
function holeSignature(board: Board): string {
  return board.holes.map((r) => holeRowValues(r).join(':')).sort().join(';');
}

/** The curve half of a row's identity: EXACT and order-independent, ids ignored (curves spec §4.2). */
function curveSignature(board: Board): string {
  board = geometryBoard(board);
  const curves = board.curves.map(curveValues).sort().join(';');
  // Swept profiles (profile runs b1), the same rule: exact, sorted, ids ignored; appended only when the view holds one.
  const swept = sweptProfiles(board);
  return swept.length === 0 ? curves : `${curves}|${swept.map(profileValues).sort().join(';')}`;
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
 * One exception, and it is on the screen: the dado/rabbet WORD in a setup line
 * is not built from this key at all. See the note at `setup:` in
 * `buildCutList` and follow-up 55a — every number agrees with the key; the
 * noun is the representative board's.
 *
 * `position`, `rotation` and `posture` are absent deliberately: they say where
 * a part sits in the model, not how it is cut from stock. Posture may be omitted
 * because every posture has one hand since v12 (fu 215): the same stored cut is
 * the same physical cut in any posture. `grain` IS present —
 * a part whose fibres run along its width is laid out on the board differently
 * from one running along its length, so collapsing those would produce a row
 * you cannot cut as a batch.
 */
/** A board's GROUP: material and displayed thickness. The row key BEGINS with these, so a group can never hold a board its
 *  row does not (fu 54: two hand-written lists could drift into an empty group heading). */
function groupFields(board: Board, units: Units): string[] {
  return [board.material, formatLength(board.thickness, units)];
}

function rowKey(board: Board, units: Units, types: readonly BandType[]): string {
  const f = (n: number) => formatLength(n, units);
  // A banded part is cut at its CORE size (edge banding spec §4.1); a band-free part's core is its own size.
  const core = coreSize(board, types);
  const bands = bandSignature(board, types);
  return [
    ...groupFields(board, units),
    f(core.length),
    f(core.width),
    board.grain,
    // A cut a board edit has left removing nothing changes nothing you cut,
    // so it must not split a row (follow-up 178).
    cutSignature(cutsThatRemoveStock(board)),
    // An angle cut that removes nothing must not split a row either (spec §2.3).
    angleSignature(board),
    holeSignature(board),
    curveSignature(board),
    // Appended only when non-empty, so a band-free key is byte for byte what it was.
    ...(bands === '' ? [] : [bands]),
  ].join('|');
}

/**
 * The stock one board consumes, in the unit its material is sold in: cubic
 * inches for solid lumber, square inches for sheet goods (which are sold by
 * the sheet — thickness is a property of the sheet you buy, not a multiplier).
 *
 * STOCK DIMENSIONS ONLY — `board.cuts` is deliberately not read. A dado does
 * not reduce the board you buy: the stock leaves the yard whole and the
 * joinery happens afterward, out of material already paid for. This is the
 * inverse of what every other consumer of `cuts` does (`pocketCells` removes
 * stock, `buildDepthField` measures the removal, `buildDiagrams` draws it), so
 * a reader arriving from `cuts.ts` will be primed to subtract here. Don't.
 */
function stockInchesOf(board: Board): number {
  return isSheetGood(board.material)
    ? board.length * board.width
    : board.length * board.width * board.thickness;
}

/** 1 for an edging strip row (edge banding spec §4.2), 0 for a part row: the sorts' first key, so strips come last. */
const isStripRow = (r: CutListRow) => (r.stripIds.length > 0 ? 1 : 0);
/** 1 for a group holding only strip rows, 0 for one holding any part. */
const stripOnly = (g: CutListGroup) => (g.rows.every((r) => r.stripIds.length > 0) ? 1 : 0);

export function buildCutList(doc: FlatDocument): CutList {
  const units = doc.units;
  const catalog = catalogOf(doc);
  const groups = new Map<string, CutListGroup>();
  const rows = new Map<string, CutListRow>();
  // Boards per group, kept beside the groups rather than on them: nesting
  // needs every board's exact footprint, and CutListGroup deliberately
  // carries rows (representative) rather than boards.
  const groupBoards = new Map<CutListGroup, Board[]>();

  /**
   * One visit: `board` is what the row describes (a stored part, or a strip as a part), `cut` what is cut from stock
   * (the part at its CORE size, the same object when it has no bands; a strip is its own cut). A row is made from its
   * FIRST visit's `make()`.
   */
  const visit = (board: Board, cut: Board, key: string, make: () => Pick<CutListRow, 'setup' | 'diagrams'>, strip: boolean) => {
    const groupKey = groupFields(board, units).join('|');
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        material: board.material,
        thickness: board.thickness,
        label: `${catalog.label(board.material)} — ${formatLength(board.thickness, units)}`,
        rows: [],
        stockInches: 0,
        stock: '',
      };
      groups.set(groupKey, group);
      groupBoards.set(group, []);
    }

    // rowKey starts with the group's own two fields, so a row key is unique
    // across the whole list and belongs to exactly one group.
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        qty: 0,
        number: 0,
        names: [],
        boardIds: [],
        stripIds: [],
        length: cut.length,
        width: cut.width,
        thickness: board.thickness,
        grain: board.grain,
        dims: formatSize([cut.length, cut.width], units),
        // The setup lines are the FIRST board's, and the row's other boards
        // hold numerically identical cuts — `cutSignature` is exact, so that
        // much really is by construction. The WORD is not: `cutLabel` decides
        // dado-versus-rabbet by testing the cut against the board's exact
        // dimensions, and the dimensions collapsed at display precision. Two
        // boards 24" and 24.02" long share a row, and a cut at offset 23.25
        // width 0.75 is flush on the first and not on the second — so the row
        // prints "rabbet" for a part that is really a dado 0.02" from the end.
        // Every NUMBER on the line is right for every part in the row; only
        // the noun is the representative's. Left as is deliberately: at the
        // precision the sheet is printed to, the representative's word is the
        // more useful one at the bench. Follow-up 55.
        ...make(),
        nominal: catalog.get(board.material)?.nominal ? nominalName(cut.thickness, cut.width, units) : null,
        stockInches: 0,
        stock: '',
      };
      rows.set(key, row);
      group.rows.push(row);
    }
    if (row.qty > 0 && row.nominal !== null && nominalName(cut.thickness, cut.width, units) !== row.nominal) row.nominal = null;
    row.qty += 1;
    row.names.push(board.name);
    // A strip row draws no part (edge banding spec §4.2): its ids are strip ids, never board ids.
    (strip ? row.stripIds : row.boardIds).push(board.id);

    // Accumulated HERE, in the same visit that increments `qty`, and from this
    // board's own exact dimensions — see stockInches' doc comment. Adding to
    // the group in the same statement is what makes a subtotal and its rows
    // impossible to disagree: they are the same additions, not two passes.
    // A banded part's stock is its CORE (edge banding spec §4.1).
    const stock = stockInchesOf(cut);
    row.stockInches += stock;
    group.stockInches += stock;
    groupBoards.get(group)!.push(cut);
  };

  // What is cut from stock (banding.ts): every part at its core size, index for index with `doc.boards`. Nesting reads
  // these, never the stored boards (edge banding spec §4.3).
  const cutParts = cutStock(doc).slice(0, doc.boards.length);
  doc.boards.forEach((board, i) => {
    visit(board, cutParts[i]!, rowKey(board, units, doc.bandTypes),
      () => ({ setup: setupLines(board, units, doc.bandTypes), diagrams: buildDiagrams(board, units) }), false);
  });
  // Strip rows (edge banding spec §4.2): in the group of the edging material and the strip's thickness, collapsed by cut
  // size, material and ends. "After its parts" is the SORT's job below: strip rows last in a group, strip-only groups
  // after the material's part groups.
  for (const part of doc.boards) {
    for (const s of strips(part, doc.bandTypes)) {
      const sb = stripBoard(s);
      visit(sb, sb, `${rowKey(sb, units, doc.bandTypes)}|strip|${endsKey(s)}`,
        () => ({ setup: [stripSetup(s)], diagrams: buildDiagrams(sb, units) }), true);
    }
  }

  const out = [...groups.values()];
  for (const group of out) {
    // `key` as the final tiebreak so the order is total: tests assert on it
    // and React keys off it, the same reason `mergeAlong` sorts.
    // Strip rows after part rows (edge banding spec §4.2), each by the same order; a band-free group has none.
    group.rows.sort(
      (a, b) => isStripRow(a) - isStripRow(b) || b.length - a.length || b.width - a.width || a.key.localeCompare(b.key),
    );
    const format = isSheetGood(group.material) ? formatSquareFeet : formatBoardFeet;
    group.stock = format(group.stockInches);
    for (const row of group.rows) row.stock = format(row.stockInches);

    // One nesting per group, because a group IS the packing partition: one
    // material (so one sheet size and one rotation policy) and one thickness
    // (parts of different thickness cannot share a sheet).
    const sheet = catalog.get(group.material)?.sheet;
    if (sheet) {
      group.sheet = sheet;
      group.nesting = buildNesting(groupBoards.get(group)!, sheet, doc.stock.kerf, units);
    }
  }
  out.sort(
    (a, b) =>
      catalog.label(a.material).localeCompare(catalog.label(b.material)) ||
      // A material's strip-only groups after its groups holding any part (edge banding spec §4.2: "after its parts").
      stripOnly(a) - stripOnly(b) ||
      b.thickness - a.thickness,
  );
  // The ONE numbering (plans balloons spec §2): display order, after both sorts.
  let n = 0;
  for (const group of out) for (const row of group.rows) row.number = ++n;
  const notes = doc.boards.some((b) => b.bands.length > 0)
    ? ['Cut sizes are before banding; band before machining — every cut, hole and curve is measured on the banded part.']
    : [];
  return { groups: out, notes };
}
