import { createBoard, createDocument, buildCutList } from './document';
import type { Board, CustomMaterial, FlatDocument } from './types';
import { buildPurchase, defaultBuying, defaultShop, validateShop, type MaterialBuying, type ShopSettings, type StockBoard } from './purchase';
import { nominalName } from '../units/nominal';
import { IMPERIAL, type Units } from '../units/length';

const size = (id: string, thickness: number, width: number, length: number, price: number | null): StockBoard =>
  ({ id, thickness, width, length, price });
// Pine sizes: A ¾×5½×96 $12, B ¾×7¼×96 $18, C ¾×5½×72 $9, D 1½×3½×96 $8.
const A = size('A', 0.75, 5.5, 96, 12);
const B = size('B', 0.75, 7.25, 96, 18);
const C = size('C', 0.75, 5.5, 72, 9);
const D = size('D', 1.5, 3.5, 96, 8);

const shopWith = (over: Record<string, MaterialBuying>): ShopSettings => {
  const s = defaultShop();
  return { ...s, materials: { ...s.materials, ...over } };
};
const docOf = (boards: Board[], kerf = 0.125): FlatDocument => ({ ...createDocument('T'), stock: { kerf }, boards });
const purchase = (boards: Board[], shop: ShopSettings, kerf?: number) => {
  const doc = docOf(boards, kerf);
  return buildPurchase(doc, buildCutList(doc), shop);
};
const pine = (id: string, length: number, width: number, thickness = 0.75) =>
  createBoard({ id, name: id, material: 'pine', length, width, thickness });

describe('buildPurchase — by the board foot', () => {
  it('buys net × waste factor and prices it per board foot', () => {
    // 48 × 6 × ¾ = 216 in³ = 1.5 bd ft net; × 1.3 = 1.95 bd ft; × $10 = $19.50.
    const shop = shopWith({ walnut: { mode: 'board-foot', pricePerBoardFoot: 10, wasteFactor: 1.3 } });
    const p = purchase([createBoard({ name: 'Top', material: 'walnut', length: 48, width: 6, thickness: 0.75 })], shop);
    expect(p.entries[0]!.lines).toEqual(['Walnut — 3/4": buy 1.95 bd ft (1.50 bd ft net × 1.3) · $19.50']);
    expect(p.entries[0]!.cost).toBeCloseTo(19.5, 12);
  });
});

describe('buildPurchase — by the piece', () => {
  it('opens the largest size, then swaps each board down to the cheapest that still holds it', () => {
    // Parts 40×5, 40×5, 30×5, kerf ⅛. Largest ¾ size is B (96×7¼): 40 + ⅛ + 40 = 80⅛ fits; 30 more does not
    // (110¼ > 96) and a second shelf needs 5⅛ + 5 = 10⅛ > 7¼ → a second B. Swap down: board 1 (80⅛ long) fits
    // A ($12) and B ($18), not C (72) → A; board 2 (30) fits A, B, C → C ($9). Total $21.
    const shop = shopWith({ pine: { mode: 'piece', stock: [A, B, C] } });
    const p = purchase([pine('p1', 40, 5), pine('p2', 40, 5), pine('p3', 30, 5)], shop);
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 1×6 × 8′, 1 × 1×6 × 6′ · $21.00']);
    expect(p.entries[0]!.cost).toBe(21);
    expect(p.entries[0]!.layouts.map((l) => [l.key, l.nesting.sheets.length])).toEqual([['A', 1], ['C', 1]]);
  });

  it('counts kerf between parts', () => {
    // Two 48" parts: 48 + ⅛ + 48 = 96⅛ > 96 → two boards ($24). With no kerf they share one ($12).
    const shop = shopWith({ pine: { mode: 'piece', stock: [A] } });
    expect(purchase([pine('a', 48, 5), pine('b', 48, 5)], shop, 0.125).entries[0]!.cost).toBe(24);
    expect(purchase([pine('a', 48, 5), pine('b', 48, 5)], shop, 0).entries[0]!.cost).toBe(12);
  });

  it('swaps down only when the parts still fit — exact fit on both sides of the boundary', () => {
    // A 72" part fits C (72 long) exactly → C ($9). A 72.01" part does not → stays on A ($12).
    const shop = shopWith({ pine: { mode: 'piece', stock: [A, C] } });
    expect(purchase([pine('x', 72, 5)], shop).entries[0]!.cost).toBe(9);
    expect(purchase([pine('x', 72.01, 5)], shop).entries[0]!.cost).toBe(12);
  });

  it('prefers a priced size over an unpriced one only when both fit; no prices → smallest area', () => {
    // C unpriced, A priced: a 30" part fits both → A (priced) even though C is smaller.
    const cUnpriced = { ...C, price: null };
    expect(purchase([pine('x', 30, 5)], shopWith({ pine: { mode: 'piece', stock: [A, cUnpriced] } })).entries[0]!.lines)
      .toEqual(['Buy 1 × 1×6 × 8′ · $12.00']);
    // Nothing priced → smallest area: C (72×5½ = 396) over A (528); cost unknown.
    const none = shopWith({ pine: { mode: 'piece', stock: [{ ...A, price: null }, cUnpriced] } });
    const p = purchase([pine('x', 30, 5)], none);
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 1×6 × 6′ · no price']);
    expect(p.entries[0]!.cost).toBeNull();
  });

  it('notes a smaller unpriced size that would hold a board bought as a priced one (fu 273)', () => {
    // W ¾×11¼×96 $20 (priced), N ¾×1½×72 (no price). A 30×1 strip: both hold it; the priced W is chosen (spec
    // §3.2 step 4) and N, smaller (108 vs 1080 sq in), would do — so a note says so.
    const W = size('W', 0.75, 11.25, 96, 20);
    const N = size('N', 0.75, 1.5, 72, null);
    const p = purchase([pine('strip', 30, 1)], shopWith({ pine: { mode: 'piece', stock: [W, N] } }));
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 1×12 × 8′ · $20.00']);
    expect(p.entries[0]!.notes).toEqual(['1 board priced as 1×12 × 8′ — a 1×2 × 6′ would hold its parts (no price set)']);
    // No note when the chosen size is already the smallest that holds it.
    expect(purchase([pine('wide', 30, 10)], shopWith({ pine: { mode: 'piece', stock: [W, N] } })).entries[0]!.notes).toEqual([]);
  });

  it('counts boards that share the same priced size and smaller unpriced alternative (fu 273)', () => {
    // W ¾×3½×96 $10, N ¾×2½×72 (no price). Two 70×2 strips: side by side 70 + ⅛ + 70 > 96, and stacked
    // 2 + ⅛ + 2 = 4⅛ > 3½, so two W boards. N (72 ≥ 70, 2½ ≥ 2) holds each strip alone and is smaller
    // (180 vs 336 sq in): one note for both boards.
    const W = size('W', 0.75, 3.5, 96, 10);
    const N = size('N', 0.75, 2.5, 72, null);
    const p = purchase([pine('a', 70, 2), pine('b', 70, 2)], shopWith({ pine: { mode: 'piece', stock: [W, N] } }));
    expect(p.entries[0]!.lines).toEqual(['Buy 2 × 1×4 × 8′ · $20.00']);
    expect(p.entries[0]!.notes).toEqual(['2 boards priced as 1×4 × 8′ — a 1×3 × 6′ would hold each one\'s parts (no price set)']);
  });

  it('uses the thinnest stock thick enough to hold the part, and says to plane it', () => {
    // ½" part → ¾" stock; 1¼" part → 1½" stock (D).
    const shop = shopWith({ pine: { mode: 'piece', stock: [A, D] } });
    const p = purchase([pine('half', 20, 3, 0.5), pine('thick', 20, 3, 1.25)], shop);
    expect(p.entries[0]!.notes).toEqual(['half: plane 3/4" stock to 1/2"', 'thick: plane 1-1/2" stock to 1-1/4"']);
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 1×6 × 8′, 1 × 2×4 × 8′ · $20.00']);
  });

  it('goes to thicker stock when no size at the thinnest thickness is wide enough', () => {
    // A ¾" part 4" wide... A is 5½ wide so it fits ¾. A 6"-wide ¾" part: no ¾" size wider than 5½ in [A, E];
    // E is 1" × 7¼" × 96" ($20) → from E, planed.
    const E = size('E', 1, 7.25, 96, 20);
    const p = purchase([pine('wide', 30, 6)], shopWith({ pine: { mode: 'piece', stock: [A, E] } }));
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 1" × 7-1/4" × 96" · $20.00']);
    expect(p.entries[0]!.notes).toEqual(['wide: plane 1" stock to 3/4"']);
  });

  it('lists a part no stock holds, never drops it, and counts it in the total', () => {
    const shop = shopWith({ pine: { mode: 'piece', stock: [A] } });
    const p = purchase([pine('wide', 30, 8), pine('long', 100, 3), pine('fat', 30, 3, 2), pine('ok', 30, 3)], shop);
    expect(p.entries[0]!.notes).toEqual([
      'wide (3/4" × 8" × 30") fits no pine stock — too wide',
      'long (3/4" × 3" × 100") fits no pine stock — too long',
      'fat (2" × 3" × 30") fits no pine stock — too thick',
    ]);
    expect(p.entries[0]!.unplaceable).toBe(3);
    expect(p.totalLabel).toBe('Estimated materials: $12.00 (3 parts not placed)');
  });
});

describe('buildPurchase — sheets and totals', () => {
  it('prices sheets, sums exactly, and notes materials without a price', () => {
    // Walnut $19.50 (above) + pine $21 (above) + plywood 1 sheet × $60 = $100.50.
    const shop = shopWith({
      walnut: { mode: 'board-foot', pricePerBoardFoot: 10, wasteFactor: 1.3 },
      pine: { mode: 'piece', stock: [A, B, C] },
      plywood: { mode: 'sheet', pricePerSheet: 60 },
    });
    const boards = [
      createBoard({ name: 'Top', material: 'walnut', length: 48, width: 6, thickness: 0.75 }),
      pine('p1', 40, 5), pine('p2', 40, 5), pine('p3', 30, 5),
      createBoard({ name: 'Back', material: 'plywood', length: 48, width: 24, thickness: 0.75 }),
    ];
    const p = purchase(boards, shop);
    expect(p.entries.find((e) => e.material === 'plywood')!.lines).toEqual(['Plywood — 3/4": buy 1 sheet · $60.00']);
    expect(p.total).toBeCloseTo(100.5, 12);
    expect(p.totalLabel).toBe('Estimated materials: $100.50');
    const noWalnut = shopWith({ ...shop.materials, walnut: { mode: 'board-foot', pricePerBoardFoot: null, wasteFactor: 1.3 } });
    expect(purchase(boards, noWalnut).totalLabel).toBe('Estimated materials: $81.00 (1 material has no price)');
  });

  it('shows a dash when nothing has a price', () => {
    const p = purchase([createBoard({ name: 'Top', material: 'oak', length: 48, width: 6, thickness: 0.75 })], defaultShop());
    expect(p.totalLabel).toBe('Estimated materials: — (1 material has no price)');
  });
});

describe('buildPurchase — nothing to buy (final review)', () => {
  it('says no sizes are listed, and does not total a material it could not buy as $0.00', () => {
    // An empty pine list: the part is not placed, and the total has nothing priced → "—", not "$0.00".
    const p = purchase([pine('p', 30, 3)], shopWith({ pine: { mode: 'piece', stock: [] } }));
    expect(p.entries[0]!.notes).toEqual(['p (3/4" × 3" × 30") fits no pine stock — no pine sizes listed']);
    expect(p.totalLabel).toBe('Estimated materials: — (1 part not placed)');
  });

  it('does not total all-unplaceable parts as $0.00', () => {
    const p = purchase([pine('long', 200, 3)], shopWith({ pine: { mode: 'piece', stock: [A] } }));
    expect(p.totalLabel).toBe('Estimated materials: — (1 part not placed)');
  });

  it('refuses an end-grain part rather than pricing it as long grain', () => {
    // Grain through the thickness: real stock cannot yield it along the board, so it is not placed.
    const eg = createBoard({ id: 'eg', name: 'eg', material: 'pine', length: 20, width: 5, thickness: 0.75, grain: 'thickness' });
    const p = purchase([eg, pine('ok', 30, 3)], shopWith({ pine: { mode: 'piece', stock: [A] } }));
    expect(p.entries[0]!.notes).toEqual(['eg (3/4" × 5" × 20") has end grain — not priced as pine stock']);
    expect(p.entries[0]!.unplaceable).toBe(1);
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 1×6 × 8′ · $12.00']);
  });
});

describe('validateShop', () => {
  it('carries a material this build does not know through untouched, unflagged (final review)', () => {
    // A newer build's custom material must survive this build's next save.
    const ash = { mode: 'board-foot', pricePerBoardFoot: 6, wasteFactor: 1.4, future: true };
    const r = validateShop({ layout: 1, materials: { ash, oak: { mode: 'board-foot', pricePerBoardFoot: 8, wasteFactor: 1.5 } } });
    expect(r.ok).toBe(true);
    expect(r.settings.extra).toEqual({ ash });
    expect(r.settings.materials).not.toHaveProperty('ash');
    expect(defaultShop()).not.toHaveProperty('extra');
  });

  it('defaults when absent or unreadable, and flags it', () => {
    expect(validateShop(null)).toEqual({ settings: defaultShop(), ok: false });
    expect(validateShop({ layout: 2, materials: {} })).toEqual({ settings: defaultShop(), ok: false });
  });
  it('gives a material missing from the stored value its default without flagging', () => {
    const r = validateShop({ layout: 1, materials: { oak: { mode: 'board-foot', pricePerBoardFoot: 8, wasteFactor: 1.5 } } });
    expect(r.ok).toBe(true);
    expect(r.settings.materials.oak).toEqual({ mode: 'board-foot', pricePerBoardFoot: 8, wasteFactor: 1.5 });
    expect(r.settings.materials.pine).toEqual(defaultShop().materials.pine);
  });
  it('refuses a waste factor outside [1, 3] rather than clamping, and flags it', () => {
    for (const wasteFactor of [0.9, 3.01]) {
      const r = validateShop({ layout: 1, materials: { oak: { mode: 'board-foot', pricePerBoardFoot: 8, wasteFactor } } });
      expect(r.ok).toBe(false);
      expect(r.settings.materials.oak).toEqual(defaultShop().materials.oak);
    }
    expect(validateShop({ layout: 1, materials: { oak: { mode: 'board-foot', pricePerBoardFoot: 8, wasteFactor: 3 } } }).ok).toBe(true);
  });
  it('drops a malformed stock board and re-mints a missing or duplicate id', () => {
    const r = validateShop({ layout: 1, materials: { pine: { mode: 'piece', stock: [
      { id: 'a', thickness: 0.75, width: 5.5, length: 96, price: 12 },
      { id: 'a', thickness: 0.75, width: 3.5, length: 96, price: null },
      { thickness: 0.75, width: 1.5, length: 72, price: 2 },
      { id: 'bad', thickness: 0, width: 1.5, length: 72, price: 2 },
      { id: 'neg', thickness: 0.75, width: 1.5, length: 72, price: -1 },
    ] } } });
    const stock = (r.settings.materials.pine as { stock: StockBoard[] }).stock;
    expect(stock.map((s) => s.id)).toEqual(['a', 's1', 's2']);
    expect(stock.map((s) => s.width)).toEqual([5.5, 3.5, 1.5]);
  });
  it('keeps sheet goods in sheet mode', () => {
    const r = validateShop({ layout: 1, materials: { plywood: { mode: 'board-foot', pricePerBoardFoot: 1, wasteFactor: 1.2 } } });
    expect(r.ok).toBe(false);
    expect(r.settings.materials.plywood).toEqual({ mode: 'sheet', pricePerSheet: null });
  });
});

describe('custom materials in the shop (custom materials spec §2.5, amended)', () => {
  it('defaults a custom solid to board feet and a custom sheet to sheets', () => {
    expect(defaultBuying('m-s-ash1')).toEqual({ mode: 'board-foot', pricePerBoardFoot: null, wasteFactor: 1.3 });
    expect(defaultBuying('m-p-hb48')).toEqual({ mode: 'sheet', pricePerSheet: null });
  });
  it('validates a custom id by its kind and keeps it in materials, never in extra', () => {
    const { settings, ok } = validateShop({ layout: 1, materials: {
      'm-s-ash1': { mode: 'board-foot', pricePerBoardFoot: 9, wasteFactor: 1.4 },
      'm-p-hb48': { mode: 'sheet', pricePerSheet: 22 },
      'future-key': { anything: true },
    } });
    expect(ok).toBe(true);
    expect(settings.materials['m-s-ash1']).toEqual({ mode: 'board-foot', pricePerBoardFoot: 9, wasteFactor: 1.4 });
    expect(settings.materials['m-p-hb48']).toEqual({ mode: 'sheet', pricePerSheet: 22 });
    expect(settings.extra).toEqual({ 'future-key': { anything: true } });
  });
  it('a custom entry of the wrong mode for its kind takes its default and flags the read', () => {
    const { settings, ok } = validateShop({ layout: 1, materials: { 'm-p-hb48': { mode: 'board-foot', pricePerBoardFoot: 3, wasteFactor: 1.3 } } });
    expect(ok).toBe(false);
    expect(settings.materials['m-p-hb48']).toEqual({ mode: 'sheet', pricePerSheet: null });
  });
  it('labels a custom material in Buying by the catalog', () => {
    const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
    const d = { ...createDocument(), boards: [createBoard({ id: 'a', name: 'A', material: 'm-s-ash1' })], materials: [ash] } as FlatDocument;
    const p = buildPurchase(d, buildCutList(d), defaultShop());
    expect(p.entries[0]!.label).toBe('Ash');
    expect(p.entries[0]!.mode).toBe('board-foot');
  });
});

describe('nominal default stock (custom materials spec §5.4)', () => {
  it('a nominal custom solid defaults to dimensional lumber by the piece, no prices', () => {
    const b = defaultBuying('m-s-spf1', true);
    expect(b.mode).toBe('piece');
    const names = (b as Extract<typeof b, { mode: 'piece' }>).stock.map((s) => `${nominalName(s.thickness, s.width, IMPERIAL)} ${s.length}`);
    expect(names).toEqual([
      ...['1×2', '1×3', '1×4', '1×6', '1×8', '1×10', '1×12'].map((n) => `${n} 96`),
      ...['2×2', '2×3', '2×4', '2×6', '2×8', '2×10', '2×12'].flatMap((n) => [96, 120, 144].map((l) => `${n} ${l}`)),
      '4×4 96',
    ]);
    expect((b as Extract<typeof b, { mode: 'piece' }>).stock.every((s) => s.price === null)).toBe(true);
    expect(new Set((b as Extract<typeof b, { mode: 'piece' }>).stock.map((s) => s.id)).size).toBe(29);
  });
  it('pine keeps its 1× boards at 6′ and 8′ and adds the nominal 2× and 4×4 sizes (fu 360)', () => {
    const b = defaultBuying('pine') as Extract<MaterialBuying, { mode: 'piece' }>;
    const names = b.stock.map((s) => `${nominalName(s.thickness, s.width, IMPERIAL)} ${s.length}`);
    expect(names).toEqual([
      ...['1×2', '1×3', '1×4', '1×6', '1×8', '1×10', '1×12'].flatMap((n) => [72, 96].map((l) => `${n} ${l}`)),
      ...['2×2', '2×3', '2×4', '2×6', '2×8', '2×10', '2×12'].flatMap((n) => [96, 120, 144].map((l) => `${n} ${l}`)),
      '4×4 96',
    ]);
    expect(b.stock.every((s) => s.price === null)).toBe(true);
    expect(new Set(b.stock.map((s) => s.id)).size).toBe(36);
    // The 1× ids are pine's own, as before.
    expect(b.stock[0]!.id).toBe('s1.5x72');
  });
  it('a 2×4 in built-in pine buys a 2×4 by default (fu 360)', () => {
    const d = docOf([pine('stud', 30, 3.5, 1.5)]);
    const p = buildPurchase(d, buildCutList(d), defaultShop());
    expect(p.entries[0]!.notes).toEqual([]);
    expect(p.entries[0]!.lines[0]).toMatch(/^Buy 1 × 2×4 × 8′/);
  });
  it('a 38 × 89 mm part in a METRIC pine project buys a 2×4 too, with no plane note (fu 360, as found)', () => {
    const d = { ...docOf([pine('stud', 610 / 25.4, 89 / 25.4, 38 / 25.4)]), units: { display: 'metric-mm' as const, precision: 16 } };
    const p = buildPurchase(d, buildCutList(d), defaultShop());
    expect(p.entries[0]!.notes).toEqual([]);
    expect(p.entries[0]!.lines[0]).toMatch(/^Buy 1 × 2×4 × 8′/);
  });
  it('the flag changes nothing for pine, sheets or a non-nominal solid', () => {
    expect(defaultBuying('pine', true)).toEqual(defaultBuying('pine'));
    expect(defaultBuying('m-v-bb55', true)).toEqual({ mode: 'sheet', pricePerSheet: null });
    expect(defaultBuying('m-s-ash1')).toEqual({ mode: 'board-foot', pricePerBoardFoot: null, wasteFactor: 1.3 });
  });
});

describe('Buying names nominal sizes (custom materials spec §5.3)', () => {
  const spf = { id: 'm-s-spf1', label: 'SPF', color: '#e0c890', kind: 'solid' as const, nominal: true as const };
  const doc = (boards: Board[], materials: CustomMaterial[] = [spf]) => ({ ...createDocument(), boards, materials }) as FlatDocument;
  const run = (d: FlatDocument, shop = defaultShop()) => buildPurchase(d, buildCutList(d), shop);

  it('a nominal material with no stored entry buys from the nominal list and names it', () => {
    const d = doc([createBoard({ id: 'a', name: 'Stud', material: 'm-s-spf1', length: 90, width: 3.5, thickness: 1.5 })]);
    expect(run(d).entries[0]!.lines).toEqual(['Buy 1 × 2×4 × 8′ · no price']);
  });
  it('pine stock reads 1×4 × 6′; a size that is not a section reads as before', () => {
    const d = doc([createBoard({ id: 'a', name: 'Rail', material: 'pine', length: 24, width: 3.5, thickness: 0.75 })], []);
    expect(run(d).entries[0]!.lines[0]).toMatch(/^Buy 1 × 1×4 × 6′ · /);
    const shop = defaultShop();
    shop.materials.pine = { mode: 'piece', stock: [{ id: 'odd', thickness: 0.75, width: 3.4, length: 100, price: null }] };
    const d2 = doc([createBoard({ id: 'a', name: 'Rail', material: 'pine', length: 24, width: 3, thickness: 0.75 })], []);
    expect(run(d2, shop).entries[0]!.lines[0]).toMatch(/^Buy 1 × 3\/4" × 3-.*" × 100" · /);
  });
  it('a non-whole-foot nominal board keeps its exact length', () => {
    const shop = defaultShop();
    shop.materials['m-s-spf1'] = { mode: 'piece', stock: [{ id: 'x', thickness: 1.5, width: 3.5, length: 100, price: null }] };
    const d = doc([createBoard({ id: 'a', name: 'Stud', material: 'm-s-spf1', length: 90, width: 3.5, thickness: 1.5 })]);
    expect(run(d, shop).entries[0]!.lines).toEqual(['Buy 1 × 2×4 × 100" · no price']);
  });
  it('an oak by-the-piece entry of the same section is NOT named (oak is not nominal)', () => {
    const shop = defaultShop();
    shop.materials.oak = { mode: 'piece', stock: [{ id: 'o', thickness: 0.75, width: 3.5, length: 96, price: null }] };
    const d = doc([createBoard({ id: 'a', name: 'Rail', material: 'oak', length: 24, width: 3.5, thickness: 0.75 })], []);
    expect(run(d, shop).entries[0]!.lines[0]).toMatch(/^Buy 1 × 3\/4" × 3-1\/2" × 96" · /);
  });
  it('the layout title takes the name; the SVG sheet label stays on actual dimensions (inv 19)', () => {
    const d = doc([createBoard({ id: 'a', name: 'Rail', material: 'pine', length: 24, width: 3.5, thickness: 0.75 })], []);
    const l = run(d).entries[0]!.layouts[0]!;
    expect(l.title).toBe('1×4 × 6′ — board');
    expect(l.nesting.sheet).toBe('3/4" × 3-1/2" × 72"');
  });
});

describe('Buying in a metric project (metric display chunk 2)', () => {
  const MM: Units = { display: 'metric-mm', precision: 16 };
  const inch = (mm: number) => mm / 25.4;
  const metric = (boards: Board[], shop: ShopSettings) => {
    const doc = { ...docOf(boards), units: MM };
    return buildPurchase(doc, buildCutList(doc), shop);
  };
  it('a nominal stock line keeps its name, adds mm; a part note reads mm', () => {
    const shop = shopWith({ pine: { mode: 'piece', stock: [D] } });
    const p = metric([pine('stud', 24, 3.5, 1.5), pine('wide', inch(600), inch(300), 1.5)], shop);
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 2×4 × 8\u2032 (38 × 89 × 2438 mm) \u00b7 $8.00']);
    expect(p.entries[0]!.notes).toEqual(['wide (38 × 300 × 600 mm) fits no pine stock \u2014 too wide']);
  });
  it('plane note: trade stock with mm, part in mm', () => {
    const p = metric([pine('half', 20, 3, 0.5)], shopWith({ pine: { mode: 'piece', stock: [A] } }));
    expect(p.entries[0]!.notes).toEqual(['half: plane 3/4" (19 mm) stock to 13 mm']);
  });
  it('no plane note when stock and part read the same whole mm', () => {
    const p = metric([pine('same', 20, 3, inch(19))], shopWith({ pine: { mode: 'piece', stock: [A] } }));
    expect(p.entries[0]!.notes).toEqual([]);
  });
  it('no plane note in IMPERIAL either when stock and part read the same (0.748" reads 3/4"; fu 359)', () => {
    const p = purchase([pine('same', 20, 3, 0.748)], shopWith({ pine: { mode: 'piece', stock: [A] } }));
    expect(p.entries[0]!.notes).toEqual([]);
  });
  it('an imperial part a 1/16" (one display step) under its stock reads differently, and keeps its note (fu 359)', () => {
    const p = purchase([pine('thin', 20, 3, 0.75 - 1 / 16)], shopWith({ pine: { mode: 'piece', stock: [A] } }));
    expect(p.entries[0]!.notes).toEqual(['thin: plane 3/4" stock to 11/16"']);
  });
  it('a non-nominal stock size reads as a trade size with mm in brackets', () => {
    const E = size('E', 1, 7.25, 96, 20);
    const p = metric([pine('wide', 30, 6)], shopWith({ pine: { mode: 'piece', stock: [A, E] } }));
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 1" × 7-1/4" × 96" (25 × 184 × 2438 mm) \u00b7 $20.00']);
  });
});

describe('metric parts fit the stock they read the same as (fu 354)', () => {
  const MM: Units = { display: 'metric-mm', precision: 16 };
  const mm = (n: number) => n / 25.4;
  const metric = (boards: Board[], shop: ShopSettings) => {
    const doc = { ...docOf(boards), units: MM };
    return buildPurchase(doc, buildCutList(doc), shop);
  };
  it('a 38 × 89 × 600 mm part is bought as a 2×4', () => {
    const shop = shopWith({ pine: { mode: 'piece', stock: [D] } });
    const p = metric([pine('stud', mm(600), mm(89), mm(38))], shop);
    expect(p.entries[0]!.unplaceable).toBe(0);
    expect(p.entries[0]!.lines[0]).toContain('2×4 × 8′ (38 × 89 × 2438 mm)');
  });
  it('a 286 mm shelf is bought as 1×12; 287 mm is too wide', () => {
    const E = size('E', 0.75, 11.25, 96, 30);
    const shop = shopWith({ pine: { mode: 'piece', stock: [E] } });
    expect(metric([pine('shelf', mm(600), mm(286), mm(19))], shop).entries[0]!.unplaceable).toBe(0);
    expect(metric([pine('shelf', mm(600), mm(287), mm(19))], shop).entries[0]!.unplaceable).toBe(1);
  });
  it('decimal mm: what is NAMED a 2×4 is BOUGHT as one (89.45 reads 89); 89.5 reads 90 and is too wide', () => {
    const shop = shopWith({ pine: { mode: 'piece', stock: [D] } });
    expect(nominalName(mm(38), mm(89.45), MM)).toBe('2×4');
    expect(metric([pine('stud', mm(600), mm(89.45), mm(38))], shop).entries[0]!.unplaceable).toBe(0);
    expect(metric([pine('stud', mm(600), mm(89.5), mm(38))], shop).entries[0]!.unplaceable).toBe(1);
  });
  it('a part reading thicker than the stock is not bought from it: 19.5 mm (reads 20) skips 3/4" stock', () => {
    const shop = shopWith({ pine: { mode: 'piece', stock: [A, size('F', 1, 5.5, 96, 20)] } });
    const p = metric([pine('board', mm(600), mm(100), mm(19.5))], shop);
    expect(p.entries[0]!.lines[0]).toContain('1" × 5-1/2" × 96" (25 × 140 × 2438 mm)');
    expect(p.entries[0]!.notes.join(' ')).toContain('plane 1" (25 mm) stock to 20 mm');
  });
  it('the half-mm boundary: 64 mm reads as 2-1/2" (63.5) — a 2×3 — and fits 2×3 stock', () => {
    const shop = shopWith({ pine: { mode: 'piece', stock: [size('G', 1.5, 2.5, 96, 6)] } });
    expect(nominalName(mm(38), mm(64), MM)).toBe('2×3');
    expect(metric([pine('rail', mm(600), mm(64), mm(38))], shop).entries[0]!.unplaceable).toBe(0);
  });
  it('a running sum is one bound: two 1219 mm parts plus kerf do not share a 96" (2438 mm) board', () => {
    const shop = shopWith({ pine: { mode: 'piece', stock: [D] } });
    const p = metric([pine('a', mm(1219), mm(89), mm(38)), pine('b', mm(1219), mm(89), mm(38))], shop);
    expect(p.entries[0]!.lines[0]).toContain('Buy 2 ×');
  });
  it('imperial stays exact: a 3.504" part fits no 2×4', () => {
    const shop = shopWith({ pine: { mode: 'piece', stock: [D] } });
    expect(purchase([pine('stud', 24, mm(89), 1.5)], shop).entries[0]!.unplaceable).toBe(1);
  });
});
