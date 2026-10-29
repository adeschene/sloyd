import type { Board, FlatDocument, SheetStock, TapeBand } from './types';
import { cutStock, tapeRuns } from './banding';
import { MATERIALS, isCustomMaterialId, isSheetGood } from './types';
import type { HardwareTotal } from './hardware';
import { catalogOf } from './materials';
import type { CutList } from './cutlist';
import { fitsStock, packOnto, grainFootprint, type Nesting, type PlacedPart } from './nesting';
import { formatLength, formatLengthBare, formatSize, isMetric, mmBracket, mmTicks, tradeLength, tradeSize, type Units } from '../units/length';
import { NOMINAL_SECTIONS, nominalName, stockLengthText } from '../units/nominal';
import { formatBoardFeet, formatMoney, INCHES_PER_BOARD_FOOT } from '../units/quantity';

/** One by-the-piece stock size, inches; `price` per board, or null when not set. */
export interface StockBoard { id: string; thickness: number; width: number; length: number; price: number | null }

/** How one material is bought (lumber yield and cost spec §2.1). */
export type MaterialBuying =
  | { mode: 'board-foot'; pricePerBoardFoot: number | null; wasteFactor: number }
  | { mode: 'piece'; stock: StockBoard[] }
  | { mode: 'sheet'; pricePerSheet: number | null };

/** The browser-level shop settings stored under `sloyd.shop.v1`. NOT document state. */
export interface ShopSettings {
  layout: 1;
  materials: Record<string, MaterialBuying>;
  /**
   * Stored entries for materials this build does not know (a newer build's custom material), carried through
   * untouched so this build's next save does not erase them (final review, fu 266's hazard). Never read here.
   */
  extra?: Record<string, unknown>;
}

export const SHOP_LAYOUT = 1;
export const DEFAULT_WASTE_FACTOR = 1.3;
/** A waste factor outside [MIN, MAX] is refused, never clamped (spec §2.2). */
export const WASTE_FACTOR_MIN = 1;
export const WASTE_FACTOR_MAX = 3;
/** Same tolerance as the cut list's flush tests: far below 1/16", far above float drift. */
const EPS = 1e-9;

const S4S_WIDTHS = [1.5, 2.5, 3.5, 5.5, 7.25, 9.25, 11.25];
const S4S_LENGTHS = [72, 96];

/** A new nominal material's stock (spec §5.4): 1× at 8′; 2× at 8′, 10′, 12′; 4×4 at 8′. No prices. */
export const NOMINAL_DEFAULT_STOCK: readonly StockBoard[] = [
  ...NOMINAL_SECTIONS.filter((s) => s.thickness === 0.75).map((s) => [s, 96] as const),
  ...NOMINAL_SECTIONS.filter((s) => s.thickness === 1.5).flatMap((s) => [96, 120, 144].map((l) => [s, l] as const)),
  ...NOMINAL_SECTIONS.filter((s) => s.name === '4×4').map((s) => [s, 96] as const),
].map(([s, l]) => ({ id: `n${s.name.replace('×', 'x')}x${l}`, thickness: s.thickness, width: s.width, length: l, price: null }));

/** A material's default buying entry. No default carries a price: prices are local facts.
 *  `nominal`: a custom solid sold in nominal sizes (spec §5.4). Pine keeps its own 1× list (6′ and 8′, its own ids)
 *  and adds the nominal list's thicker sizes, so a 2×4 in pine buys a 2×4 (fu 360). */
export function defaultBuying(material: string, nominal = false): MaterialBuying {
  if (isSheetGood(material)) return { mode: 'sheet', pricePerSheet: null };
  if (material === 'pine') {
    return {
      mode: 'piece',
      stock: [
        ...S4S_WIDTHS.flatMap((w) => S4S_LENGTHS.map((l) => ({ id: `s${w}x${l}`, thickness: 0.75, width: w, length: l, price: null }))),
        ...NOMINAL_DEFAULT_STOCK.filter((s) => s.thickness > 0.75).map((s) => ({ ...s })),
      ],
    };
  }
  if (nominal) return { mode: 'piece', stock: NOMINAL_DEFAULT_STOCK.map((s) => ({ ...s })) };
  return { mode: 'board-foot', pricePerBoardFoot: null, wasteFactor: DEFAULT_WASTE_FACTOR };
}

/** Fresh defaults for every MATERIALS key (spec §2.1). A new object each call, so nothing shares state. */
export function defaultShop(): ShopSettings {
  return { layout: SHOP_LAYOUT, materials: Object.fromEntries(Object.keys(MATERIALS).map((m) => [m, defaultBuying(m)])) };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const validPrice = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

function validateBuying(material: string, raw: unknown): MaterialBuying | null {
  if (!isObj(raw)) return null;
  if (isSheetGood(material)) {
    return raw.mode === 'sheet' && validPrice(raw.pricePerSheet) ? { mode: 'sheet', pricePerSheet: raw.pricePerSheet } : null;
  }
  if (raw.mode === 'board-foot') {
    const f = raw.wasteFactor;
    if (!validPrice(raw.pricePerBoardFoot)) return null;
    if (typeof f !== 'number' || !Number.isFinite(f) || f < WASTE_FACTOR_MIN || f > WASTE_FACTOR_MAX) return null;
    return { mode: 'board-foot', pricePerBoardFoot: raw.pricePerBoardFoot, wasteFactor: f };
  }
  if (raw.mode === 'piece' && Array.isArray(raw.stock)) {
    const seen = new Set<string>();
    const stock: StockBoard[] = [];
    for (const s of raw.stock) {
      if (!isObj(s) || !positive(s.thickness) || !positive(s.width) || !positive(s.length) || !validPrice(s.price)) continue;
      let id = typeof s.id === 'string' && s.id.length > 0 && !seen.has(s.id) ? s.id : '';
      for (let n = stock.length; !id; n++) if (!seen.has(`s${n}`)) id = `s${n}`;
      seen.add(id);
      stock.push({ id, thickness: s.thickness, width: s.width, length: s.length, price: s.price });
    }
    return { mode: 'piece', stock };
  }
  return null;
}

/**
 * Read stored shop settings (spec §2.2). Never throws. `ok` is false when the stored value had to be
 * replaced, wholly (not an object, another layout) or in part (an entry failed validation and took its
 * default) — the dialog then says so. A material absent from the stored value takes its default
 * silently: that is a new MATERIALS key, not damage. A key that is neither built in nor custom-shaped
 * (another build's, or one no longer in MATERIALS) is kept, untouched, in `extra`, so a write puts it back.
 * A top-level `extra` object (left by an earlier faulty write) is folded in as stored entries; `materials`
 * wins a key both hold.
 */
export function validateShop(raw: unknown): { settings: ShopSettings; ok: boolean } {
  if (!isObj(raw) || raw.layout !== SHOP_LAYOUT || !isObj(raw.materials)) return { settings: defaultShop(), ok: false };
  const stored: Record<string, unknown> = { ...(isObj(raw.extra) ? raw.extra : {}), ...raw.materials };
  let ok = true;
  const materials: Record<string, MaterialBuying> = {};
  // Known = built-in OR custom-shaped (amended §2.5): the kind is in the id, so a custom entry validates
  // without knowing which project is open, and an id never moves between `materials` and `extra`.
  const known = (k: string) => k in MATERIALS || isCustomMaterialId(k);
  const extra = Object.fromEntries(Object.entries(stored).filter(([k]) => !known(k)));
  for (const m of Object.keys(MATERIALS)) {
    if (!(m in stored)) { materials[m] = defaultBuying(m); continue; }
    const v = validateBuying(m, stored[m]);
    if (!v) ok = false;
    materials[m] = v ?? defaultBuying(m);
  }
  for (const m of Object.keys(stored).filter(isCustomMaterialId)) {
    const v = validateBuying(m, stored[m]);
    if (!v) ok = false;
    materials[m] = v ?? defaultBuying(m);
  }
  const settings: ShopSettings = { layout: SHOP_LAYOUT, materials };
  if (Object.keys(extra).length > 0) settings.extra = extra;
  return { settings, ok };
}

/** One material's lines in the cut list's Buying section; every string is built here (invariant 19). */
export interface PurchaseEntry {
  material: string;
  /** `Pine` — the MATERIALS label. */
  label: string;
  mode: MaterialBuying['mode'];
  lines: string[];
  /** Planing notes and unplaceable parts. */
  notes: string[];
  /** By-the-piece board layouts, one per stock size used, ready for SheetLayout. */
  layouts: { key: string; title: string; stock: SheetStock; nesting: Nesting }[];
  /** Exact dollars, or null when a price this material needs is not set. */
  cost: number | null;
  unplaceable: number;
}
export interface Purchase {
  entries: PurchaseEntry[];
  banding: { lines: string[]; cost: number | null } | null;
  /** Hardware to buy (hardware spec §4.2); null when the project carries none. */
  hardware: { lines: string[]; cost: number | null } | null;
  total: number;
  totalLabel: string;
}

/** A stock size as the yard names it: `2×4 × 8′` for a nominal material's section, else actual `t × w × l`. */
const sizeDims = (s: StockBoard, units: Units, nominal: boolean) => {
  const name = nominal ? nominalName(s.thickness, s.width, units) : null;
  if (name === null) return tradeSize([s.thickness, s.width, s.length], units);
  return `${name} × ${stockLengthText(s.length, units.precision)}${mmBracket([s.thickness, s.width, s.length], units)}`;
};
/** A PART as the user sees it: in the project's units (a metric project reads mm). */
const partDims = (b: Board, units: Units) => formatSize([b.thickness, b.width, b.length], units);
const priceText = (cost: number | null) => (cost === null ? 'no price' : formatMoney(cost));
/** The packer's own stock test (`fitsStock`, fu 354), so a part admitted here always gets a board. */
const fitsIn = (f: { w: number; h: number }, s: StockBoard, units: Units) => fitsStock(f.w, s.length, units) && fitsStock(f.h, s.width, units);
/** Stock at least as thick as the part: in metric, reading no thinner at whole mm (fu 354); imperial exact at EPS. */
const thickEnough = (t: number, part: number, units: Units) => (isMetric(units) ? mmTicks(t) >= mmTicks(part) : t >= part - EPS);

/** First minimum by `key`, so ties keep list order (spec §3.2 step 4). */
function minBy<T>(items: readonly T[], key: (t: T) => number): T {
  let best = items[0] as T;
  for (const t of items) if (key(t) < key(best)) best = t;
  return best;
}

/** Glue-ups (glue-ups spec §4): added to each strip's width (jointing both glue edges, the final rip) and length (trimming
 *  both ends square after clamping), inches. Fixed constants, not settings. */
export const GLUE_WIDTH_ALLOWANCE = 1 / 8;
export const GLUE_LENGTH_ALLOWANCE = 1;

/** One part bought as a glue-up: the stock thickness the strips come from, the width across the grain they make up, and the
 *  N equal strips — plain solid parts, never stored. */
export interface GluePlan { thickness: number; across: number; strips: Board[] }

const GLUE_TAG = '#glue:';

/**
 * A part no listed size is wide enough for, as N equal strips (glue-ups spec §4). The caller has already decided it is a
 * candidate (§3: today's reason is `too wide`). The thickness is the thinnest at least as thick as the part with a size long
 * enough for a strip; N is the fewest (≥ 2) whose strip fits that thickness's widest such size, by `fitsStock` (whole mm in a
 * metric project). Null when no thickness has a size long enough. Exact: nothing is rounded (inv 18).
 */
export function gluePlan(part: Board, stock: readonly StockBoard[], units: Units): GluePlan | null {
  const f = grainFootprint(part);
  const along = f.w + GLUE_LENGTH_ALLOWANCE;
  const across = f.h;
  const thicknesses = [...new Set(stock.map((s) => s.thickness))].sort((a, b) => a - b).filter((t) => thickEnough(t, part.thickness, units));
  for (const t of thicknesses) {
    const sizes = stock.filter((s) => Math.abs(s.thickness - t) <= EPS && fitsStock(along, s.length, units) && s.width > GLUE_WIDTH_ALLOWANCE);
    if (sizes.length === 0) continue;
    const widest = Math.max(...sizes.map((s) => s.width));
    let n = 2;
    while (!fitsStock(across / n + GLUE_WIDTH_ALLOWANCE, widest, units)) n += 1;
    const width = across / n + GLUE_WIDTH_ALLOWANCE;
    const strips = Array.from({ length: n }, (_, i): Board => ({
      id: `${part.id}${GLUE_TAG}${i + 1}`, name: `${part.name} strip ${i + 1} of ${n}`,
      length: along, width, thickness: part.thickness, position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length',
      material: part.material, cuts: [], angleCuts: [], holes: [], curves: [], profiles: [], bands: [], cornerRule: 'long', hardware: [],
    }));
    return { thickness: t, across, strips };
  }
  return null;
}

/** The part a glue strip's id belongs to (the id before its LAST tag), or null for any other id. */
export function glueStripPart(id: string): string | null {
  const i = id.lastIndexOf(GLUE_TAG);
  return i < 0 ? null : id.slice(0, i);
}

function byThePiece(material: string, label: string, parts: Board[], stock: StockBoard[], kerf: number, units: Units, nominal: boolean, edging: ReadonlySet<string>): PurchaseEntry {
  const notes: string[] = [];
  let unplaceable = 0;
  const thicknesses = [...new Set(stock.map((s) => s.thickness))].sort((a, b) => a - b);
  const groups = new Map<number, Board[]>();
  // Stock and part that READ the same leave nothing to plane to say: a 19 mm part from 3/4" stock (the same whole mm),
  // or a 0.748" part from 3/4" stock (both 3/4" at display precision; fu 359, the user's ruling — imperial too).
  const planeNote = (part: Board, t: number) => {
    const same = formatLengthBare(t, units) === formatLengthBare(part.thickness, units);
    if (t > part.thickness + EPS && !same) notes.push(`${part.name}: plane ${tradeLength(t, units)} stock to ${formatLength(part.thickness, units)}`);
  };
  for (const part of parts) {
    // End grain (grain through the thickness) cannot come out of a board along its length; pricing it as long
    // grain would buy stock that cannot yield it. Refused with its reason until it is modelled (final review).
    if (part.grain === 'thickness') {
      notes.push(`${part.name} (${partDims(part, units)}) has end grain — not priced as ${label.toLowerCase()} stock`);
      unplaceable += 1;
      continue;
    }
    const f = grainFootprint(part);
    const thick = thicknesses.filter((t) => thickEnough(t, part.thickness, units));
    // The thinnest stock at least as thick as the part ON WHICH SOME SIZE HOLDS ITS FOOTPRINT (spec §3.2,
    // amended in the plan): a 10"-wide 3/4" shelf comes from 1x12 stock even when the 3/4" list stops at 1x8.
    const t = thick.find((th) => stock.some((s) => Math.abs(s.thickness - th) <= EPS && fitsIn(f, s, units)));
    if (t === undefined) {
      const reason = stock.length === 0 ? `no ${label.toLowerCase()} sizes listed`
        : thick.length === 0 ? 'too thick'
        : stock.some((s) => thickEnough(s.thickness, part.thickness, units) && fitsStock(f.h, s.width, units)) ? 'too long' : 'too wide';
      // Glue-ups (glue-ups spec §3): ONLY where the answer is `too wide`, and never an edging strip, so every part that gets a
      // board today gets exactly the same board. End grain was refused above.
      const glue = reason === 'too wide' && !edging.has(part.id) ? gluePlan(part, stock, units) : null;
      if (glue) {
        const n = glue.strips.length;
        const strip = glue.strips[0]!;
        notes.push(`${part.name} (${partDims(part, units)}): glue up from ${n} strips, ${formatSize([strip.thickness, strip.width, strip.length], units)}`
          + ` — no ${label.toLowerCase()} stock is ${formatLength(glue.across, units)} wide`);
        planeNote(part, glue.thickness);
        groups.set(glue.thickness, [...(groups.get(glue.thickness) ?? []), ...glue.strips]);
        continue;
      }
      const why = reason === 'too wide' && !edging.has(part.id)
        ? `too wide, and too long to glue up (strips need ${formatLength(GLUE_LENGTH_ALLOWANCE, units)} to trim)`
        : reason;
      notes.push(`${part.name} (${partDims(part, units)}) fits no ${label.toLowerCase()} stock — ${why}`);
      unplaceable += 1;
      continue;
    }
    planeNote(part, t);
    groups.set(t, [...(groups.get(t) ?? []), part]);
  }

  const count = new Map<string, number>();
  // fu 273: boards bought as a priced size where a SMALLER unpriced size would also hold the parts, by pair.
  const cheaperUnknown = new Map<string, { priced: StockBoard; smaller: StockBoard; boards: number }>();
  const chosen: { size: StockBoard; parts: PlacedPart[] }[] = [];
  for (const t of thicknesses) {
    const group = groups.get(t);
    if (!group) continue;
    const sizes = stock.filter((s) => Math.abs(s.thickness - t) <= EPS);
    const byId = new Map(group.map((b) => [b.id, b]));
    const area = (s: StockBoard) => s.length * s.width;
    // The largest-first plan, then — only when its every board has a price — one plan per size preferred as the opener
    // (fu 269: largest-first alone paid up to 44% more). Each board is swapped down to the cheapest size that still holds
    // its parts, proved by re-packing. Without prices there is no money to compare, so the plan stays largest-first (the
    // default pine stock is unpriced; the user's approval was for price).
    const plan = (prefer: StockBoard | undefined) =>
      packOnto(group, sizes, kerf, units, prefer).bins.map((bin) => {
        const own = bin.parts.map((pp) => byId.get(pp.boardId)!);
        const holds = (s: StockBoard) => {
          const r = packOnto(own, [s], kerf, units);
          return r.bins.length === 1 && r.unplaceable.length === 0 ? r.bins[0]!.parts : null;
        };
        const fitting = sizes.filter((s) => s === bin.bin || holds(s) !== null);
        const priced = fitting.filter((s) => s.price !== null);
        const pick = priced.length > 0 ? minBy(priced, (s) => s.price!) : minBy(fitting, area);
        return { pick, fitting, parts: pick === bin.bin ? bin.parts : holds(pick)! };
      });
    // A plan's price, or null when any board it buys has none.
    const price = (p: ReturnType<typeof plan>) =>
      p.every((b) => b.pick.price !== null) ? p.reduce((sum, b) => sum + b.pick.price!, 0) : null;
    let best = plan(undefined);
    let bestPrice = price(best);
    if (bestPrice !== null) {
      for (const s of sizes) {
        const p = plan(s);
        const cost = price(p);
        // Strictly cheaper only: a tie keeps the largest-first plan (fewer boards).
        if (cost !== null && cost < bestPrice - EPS) { best = p; bestPrice = cost; }
      }
    }
    for (const { pick, fitting, parts } of best) {
      chosen.push({ size: pick, parts });
      const smaller = fitting.filter((s) => s.price === null && area(s) < area(pick));
      if (pick.price !== null && smaller.length > 0) {
        const alt = minBy(smaller, area);
        const key = `${pick.id}|${alt.id}`;
        const seen = cheaperUnknown.get(key);
        cheaperUnknown.set(key, { priced: pick, smaller: alt, boards: (seen?.boards ?? 0) + 1 });
      }
      count.set(pick.id, (count.get(pick.id) ?? 0) + 1);
    }
  }

  for (const { priced, smaller, boards } of cheaperUnknown.values()) {
    notes.push(boards === 1
      ? `1 board priced as ${sizeDims(priced, units, nominal)} — a ${sizeDims(smaller, units, nominal)} would hold its parts (no price set)`
      : `${boards} boards priced as ${sizeDims(priced, units, nominal)} — a ${sizeDims(smaller, units, nominal)} would hold each one's parts (no price set)`);
  }
  const used = stock.filter((s) => count.has(s.id));
  const cost = used.some((s) => s.price === null) ? null : used.reduce((n, s) => n + count.get(s.id)! * s.price!, 0);
  const lines = used.length > 0 ? [`Buy ${used.map((s) => `${count.get(s.id)} × ${sizeDims(s, units, nominal)}`).join(', ')} · ${priceText(cost)}`] : [];
  const layouts = used.map((s) => {
    const dims = sizeDims(s, units, nominal);
    return {
      key: s.id,
      title: `${dims} — board`,
      stock: { length: s.length, width: s.width, rotate: 'grain' as const },
      // Actual dimensions on purpose: nothing reads `sheet` for a Buying layout (it is the sheet-goods unplaceable noun); the caption names the section.
      nesting: { sheets: chosen.filter((c) => c.size === s).map((c) => ({ parts: c.parts })), unplaceable: [], label: '', sheet: sizeDims(s, units, false) },
    };
  });
  // Nothing bought is not "priced at $0" (final review): null, and with no buy line it is not counted as unpriced.
  return { material, label, mode: 'piece', lines, notes, layouts, cost: used.length > 0 ? cost : null, unplaceable };
}

/** Tape to buy (edge banding spec §4.4): per tape type, the runs' total rounded UP to whole feet (what is bought is rounded,
 *  inv 18); priced by the foot; metric reads metres to 0.1 with the bought feet beside. Null when nothing is taped. `cost` is
 *  null only when no line is priced; `unpriced` counts the lines with no price. */
function tapeToBuy(doc: FlatDocument): { banding: Purchase['banding']; unpriced: number } {
  const inches = new Map<string, number>();
  for (const b of doc.boards) for (const r of tapeRuns(b, doc.bandTypes)) inches.set(r.type.id, (inches.get(r.type.id) ?? 0) + r.length);
  if (inches.size === 0) return { banding: null, unpriced: 0 };
  let cost = 0;
  let priced = false;
  let unpriced = 0;
  const lines = doc.bandTypes.filter((t): t is TapeBand => t.kind === 'tape' && inches.has(t.id)).map((t) => {
    const total = inches.get(t.id)!;
    const feet = Math.ceil(total / 12 - EPS);
    const c = t.pricePerFoot === null ? null : feet * t.pricePerFoot;
    if (c === null) unpriced++; else { cost += c; priced = true; }
    const amount = isMetric(doc.units) ? `${(total * 0.0254).toFixed(1)} m, buy ${feet}′` : `buy ${feet}′`;
    return `${t.name}, ${tradeLength(t.tapeWidth, doc.units)} wide: ${amount} · ${priceText(c)}`;
  });
  return { banding: { lines, cost: priced ? cost : null }, unpriced };
}

/**
 * What to buy and what it costs (lumber yield and cost spec §3). Pure. Takes the cut list already built
 * from `doc`, so its groups (material x thickness, exact `stockInches`, sheet nesting) are the ones the
 * sheet shows above. Costs are summed exactly; only `formatMoney` rounds.
 *
 * The by-the-piece packer is a HEURISTIC, not an optimum: open the largest size that fits, then swap each
 * board down to the cheapest size that still holds its parts, proved by re-packing them.
 */
/** Buying's unpriced tail: materials, band types (fu 395(3)) and hardware items (hardware spec §4.2) counted apart; one kind
 *  alone reads as it always did, two or three join as `a, b and c`. */
function unpricedTail(materials: number, bandTypes: number, hardware: number): string {
  const n = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;
  const parts = [
    materials > 0 ? n(materials, 'material') : '',
    bandTypes > 0 ? n(bandTypes, 'band type') : '',
    hardware > 0 ? n(hardware, 'hardware item') : '',
  ].filter(Boolean);
  if (parts.length === 0) return '';
  const list = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `(${list} ${(materials || bandTypes || hardware) === 1 && parts.length === 1 ? 'has' : 'have'} no price)`;
}

/** Hardware to buy (hardware spec §4.2): packs rounded UP (what is bought is rounded, inv 18), priced per pack. Null when
 *  there is none. `cost` is null only when no line is priced; `unpriced` counts the lines with no price. */
function hardwareToBuy(hardware: readonly HardwareTotal[]): { hardware: Purchase['hardware']; unpriced: number } {
  if (hardware.length === 0) return { hardware: null, unpriced: 0 };
  let cost = 0;
  let priced = false;
  let unpriced = 0;
  const lines = hardware.map(({ type, total }) => {
    const packs = Math.ceil(total / type.packSize);
    const c = type.pricePerPack === null ? null : packs * type.pricePerPack;
    if (c === null) unpriced++; else { cost += c; priced = true; }
    const what = type.packSize === 1 ? `buy ${total}` : `${total}, buy ${packs} pack${packs === 1 ? '' : 's'} of ${type.packSize}`;
    return `${type.name}: ${what} · ${priceText(c)}`;
  });
  return { hardware: { lines, cost: priced ? cost : null }, unpriced };
}

export function buildPurchase(doc: FlatDocument, list: CutList, shop: ShopSettings, hardwareList: readonly HardwareTotal[] = []): Purchase {
  const catalog = catalogOf(doc);
  const stock = cutStock(doc);
  // Edging strips follow the parts in `cutStock`; they are never glued up (glue-ups spec §3).
  const edging = new Set(stock.slice(doc.boards.length).map((b) => b.id));
  const materials = [...new Set(list.groups.map((g) => g.material))];
  const entries: PurchaseEntry[] = materials.map((m) => {
    const label = catalog.label(m);
    const nominal = catalog.get(m)?.nominal === true;
    const buying = shop.materials[m] ?? defaultBuying(m, nominal);
    const groups = list.groups.filter((g) => g.material === m);
    if (buying.mode === 'piece' && !isSheetGood(m)) {
      return byThePiece(m, label, stock.filter((b) => b.material === m), buying.stock, doc.stock.kerf, doc.units, nominal, edging);
    }
    if (buying.mode === 'board-foot' && !isSheetGood(m)) {
      const price = buying.pricePerBoardFoot;
      let sum = 0;
      const lines = groups.map((g) => {
        const buy = g.stockInches * buying.wasteFactor;
        const cost = price === null ? null : (buy / INCHES_PER_BOARD_FOOT) * price;
        sum += cost ?? 0;
        return `${g.label}: buy ${formatBoardFeet(buy)} (${formatBoardFeet(g.stockInches)} net × ${buying.wasteFactor}) · ${priceText(cost)}`;
      });
      return { material: m, label, mode: 'board-foot', lines, notes: [], layouts: [], cost: price === null ? null : sum, unplaceable: 0 };
    }
    const price = buying.mode === 'sheet' ? buying.pricePerSheet : null;
    let sum = 0;
    let unplaceable = 0;
    const lines = groups.map((g) => {
      const n = g.nesting?.sheets.length ?? 0;
      unplaceable += g.nesting?.unplaceable.length ?? 0;
      const cost = price === null ? null : n * price;
      sum += cost ?? 0;
      return `${g.label}: buy ${n} sheet${n === 1 ? '' : 's'} · ${priceText(cost)}`;
    });
    return { material: m, label, mode: 'sheet', lines, notes: [], layouts: [], cost: price === null ? null : sum, unplaceable };
  });

  const { banding, unpriced: tapeUnpriced } = tapeToBuy(doc);
  const { hardware, unpriced: hardwareUnpriced } = hardwareToBuy(hardwareList);
  const total = entries.reduce((n, e) => n + (e.cost ?? 0), 0) + (banding?.cost ?? 0) + (hardware?.cost ?? 0);
  // A material is unpriced when it has something to buy (a buy line) but no cost; one that bought nothing is not.
  const unpriced = entries.filter((e) => e.cost === null && e.lines.length > 0).length;
  const unplaced = entries.reduce((n, e) => n + e.unplaceable, 0);
  const tail = [
    unpricedTail(unpriced, tapeUnpriced, hardwareUnpriced),
    unplaced > 0 ? `(${unplaced} part${unplaced === 1 ? '' : 's'} not placed)` : '',
  ].filter(Boolean).join(' ');
  const amount = entries.some((e) => e.cost !== null) || banding?.cost != null || hardware?.cost != null ? formatMoney(total) : '—';
  return { entries, banding, hardware, total, totalLabel: `Estimated materials: ${amount}${tail ? ` ${tail}` : ''}` };
}
