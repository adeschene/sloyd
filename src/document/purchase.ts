import type { Board, FlatDocument, SheetStock } from './types';
import { MATERIALS, isSheetGood } from './types';
import type { CutList } from './cutlist';
import { packOnto, grainFootprint, type Nesting, type PlacedPart } from './nesting';
import { formatLength } from '../units/length';
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

/** A material's default buying entry. No default carries a price: prices are local facts. */
export function defaultBuying(material: string): MaterialBuying {
  if (isSheetGood(material)) return { mode: 'sheet', pricePerSheet: null };
  if (material === 'pine') {
    return {
      mode: 'piece',
      stock: S4S_WIDTHS.flatMap((w) => S4S_LENGTHS.map((l) => ({ id: `s${w}x${l}`, thickness: 0.75, width: w, length: l, price: null }))),
    };
  }
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
 * silently: that is a new MATERIALS key, not damage. Keys no longer in MATERIALS are not kept.
 */
export function validateShop(raw: unknown): { settings: ShopSettings; ok: boolean } {
  if (!isObj(raw) || raw.layout !== SHOP_LAYOUT || !isObj(raw.materials)) return { settings: defaultShop(), ok: false };
  const stored = raw.materials;
  let ok = true;
  const materials: Record<string, MaterialBuying> = {};
  const extra = Object.fromEntries(Object.entries(stored).filter(([k]) => !(k in MATERIALS)));
  for (const m of Object.keys(MATERIALS)) {
    if (!(m in stored)) { materials[m] = defaultBuying(m); continue; }
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
export interface Purchase { entries: PurchaseEntry[]; total: number; totalLabel: string }

const sizeDims = (s: StockBoard, p: number) => `${formatLength(s.thickness, p)} × ${formatLength(s.width, p)} × ${formatLength(s.length, p)}`;
const partDims = (b: Board, p: number) => `${formatLength(b.thickness, p)} × ${formatLength(b.width, p)} × ${formatLength(b.length, p)}`;
const priceText = (cost: number | null) => (cost === null ? 'no price' : formatMoney(cost));
const fitsIn = (f: { w: number; h: number }, s: StockBoard) => f.w <= s.length + 1e-6 && f.h <= s.width + 1e-6;

/** First minimum by `key`, so ties keep list order (spec §3.2 step 4). */
function minBy<T>(items: readonly T[], key: (t: T) => number): T {
  let best = items[0] as T;
  for (const t of items) if (key(t) < key(best)) best = t;
  return best;
}

function byThePiece(material: string, label: string, parts: Board[], stock: StockBoard[], kerf: number, p: number): PurchaseEntry {
  const notes: string[] = [];
  let unplaceable = 0;
  const thicknesses = [...new Set(stock.map((s) => s.thickness))].sort((a, b) => a - b);
  const groups = new Map<number, Board[]>();
  for (const part of parts) {
    // End grain (grain through the thickness) cannot come out of a board along its length; pricing it as long
    // grain would buy stock that cannot yield it. Refused with its reason until it is modelled (final review).
    if (part.grain === 'thickness') {
      notes.push(`${part.name} (${partDims(part, p)}) has end grain — not priced as ${label.toLowerCase()} stock`);
      unplaceable += 1;
      continue;
    }
    const f = grainFootprint(part);
    const thick = thicknesses.filter((t) => t >= part.thickness - EPS);
    // The thinnest stock at least as thick as the part ON WHICH SOME SIZE HOLDS ITS FOOTPRINT (spec §3.2,
    // amended in the plan): a 10"-wide 3/4" shelf comes from 1x12 stock even when the 3/4" list stops at 1x8.
    const t = thick.find((th) => stock.some((s) => Math.abs(s.thickness - th) <= EPS && fitsIn(f, s)));
    if (t === undefined) {
      const reason = stock.length === 0 ? `no ${label.toLowerCase()} sizes listed`
        : thick.length === 0 ? 'too thick'
        : stock.some((s) => s.thickness >= part.thickness - EPS && f.h <= s.width + 1e-6) ? 'too long' : 'too wide';
      notes.push(`${part.name} (${partDims(part, p)}) fits no ${label.toLowerCase()} stock — ${reason}`);
      unplaceable += 1;
      continue;
    }
    if (t > part.thickness + EPS) notes.push(`${part.name}: plane ${formatLength(t, p)} stock to ${formatLength(part.thickness, p)}`);
    groups.set(t, [...(groups.get(t) ?? []), part]);
  }

  const count = new Map<string, number>();
  const chosen: { size: StockBoard; parts: PlacedPart[] }[] = [];
  for (const t of thicknesses) {
    const group = groups.get(t);
    if (!group) continue;
    const sizes = stock.filter((s) => Math.abs(s.thickness - t) <= EPS);
    const byId = new Map(group.map((b) => [b.id, b]));
    for (const bin of packOnto(group, sizes, kerf, p).bins) {
      const own = bin.parts.map((pp) => byId.get(pp.boardId)!);
      const holds = (s: StockBoard) => {
        const r = packOnto(own, [s], kerf, p);
        return r.bins.length === 1 && r.unplaceable.length === 0 ? r.bins[0]!.parts : null;
      };
      const fitting = sizes.filter((s) => s === bin.bin || holds(s) !== null);
      const priced = fitting.filter((s) => s.price !== null);
      const pick = priced.length > 0 ? minBy(priced, (s) => s.price!) : minBy(fitting, (s) => s.length * s.width);
      chosen.push({ size: pick, parts: pick === bin.bin ? bin.parts : holds(pick)! });
      count.set(pick.id, (count.get(pick.id) ?? 0) + 1);
    }
  }

  const used = stock.filter((s) => count.has(s.id));
  const cost = used.some((s) => s.price === null) ? null : used.reduce((n, s) => n + count.get(s.id)! * s.price!, 0);
  const lines = used.length > 0 ? [`Buy ${used.map((s) => `${count.get(s.id)} × ${sizeDims(s, p)}`).join(', ')} · ${priceText(cost)}`] : [];
  const layouts = used.map((s) => {
    const dims = sizeDims(s, p);
    return {
      key: s.id,
      title: `${dims} — board`,
      stock: { length: s.length, width: s.width, rotate: 'grain' as const },
      nesting: { sheets: chosen.filter((c) => c.size === s).map((c) => ({ parts: c.parts })), unplaceable: [], label: '', sheet: dims },
    };
  });
  // Nothing bought is not "priced at $0" (final review): null, and with no buy line it is not counted as unpriced.
  return { material, label, mode: 'piece', lines, notes, layouts, cost: used.length > 0 ? cost : null, unplaceable };
}

/**
 * What to buy and what it costs (lumber yield and cost spec §3). Pure. Takes the cut list already built
 * from `doc`, so its groups (material x thickness, exact `stockInches`, sheet nesting) are the ones the
 * sheet shows above. Costs are summed exactly; only `formatMoney` rounds.
 *
 * The by-the-piece packer is a HEURISTIC, not an optimum: open the largest size that fits, then swap each
 * board down to the cheapest size that still holds its parts, proved by re-packing them.
 */
export function buildPurchase(doc: FlatDocument, list: CutList, shop: ShopSettings): Purchase {
  const p = doc.units.precision;
  const materials = [...new Set(list.groups.map((g) => g.material))];
  const entries: PurchaseEntry[] = materials.map((m) => {
    const label = MATERIALS[m]?.label ?? m;
    const buying = shop.materials[m] ?? defaultBuying(m);
    const groups = list.groups.filter((g) => g.material === m);
    if (buying.mode === 'piece' && !isSheetGood(m)) {
      return byThePiece(m, label, doc.boards.filter((b) => b.material === m), buying.stock, doc.stock.kerf, p);
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

  const total = entries.reduce((n, e) => n + (e.cost ?? 0), 0);
  // A material is unpriced when it has something to buy (a buy line) but no cost; one that bought nothing is not.
  const unpriced = entries.filter((e) => e.cost === null && e.lines.length > 0).length;
  const unplaced = entries.reduce((n, e) => n + e.unplaceable, 0);
  const tail = [
    unpriced > 0 ? `(${unpriced} material${unpriced === 1 ? ' has' : 's have'} no price)` : '',
    unplaced > 0 ? `(${unplaced} part${unplaced === 1 ? '' : 's'} not placed)` : '',
  ].filter(Boolean).join(' ');
  const amount = entries.some((e) => e.cost !== null) ? formatMoney(total) : '—';
  return { entries, total, totalLabel: `Estimated materials: ${amount}${tail ? ` ${tail}` : ''}` };
}
