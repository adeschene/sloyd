import { createBoard, createDocument, buildCutList } from './document';
import type { Board, FlatDocument } from './types';
import { buildPurchase, defaultBuying, defaultShop, validateShop, type MaterialBuying, type ShopSettings, type StockBoard } from './purchase';

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
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 3/4" × 5-1/2" × 96", 1 × 3/4" × 5-1/2" × 72" · $21.00']);
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
      .toEqual(['Buy 1 × 3/4" × 5-1/2" × 96" · $12.00']);
    // Nothing priced → smallest area: C (72×5½ = 396) over A (528); cost unknown.
    const none = shopWith({ pine: { mode: 'piece', stock: [{ ...A, price: null }, cUnpriced] } });
    const p = purchase([pine('x', 30, 5)], none);
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 3/4" × 5-1/2" × 72" · no price']);
    expect(p.entries[0]!.cost).toBeNull();
  });

  it('notes a smaller unpriced size that would hold a board bought as a priced one (fu 273)', () => {
    // W ¾×11¼×96 $20 (priced), N ¾×1½×72 (no price). A 30×1 strip: both hold it; the priced W is chosen (spec
    // §3.2 step 4) and N, smaller (108 vs 1080 sq in), would do — so a note says so.
    const W = size('W', 0.75, 11.25, 96, 20);
    const N = size('N', 0.75, 1.5, 72, null);
    const p = purchase([pine('strip', 30, 1)], shopWith({ pine: { mode: 'piece', stock: [W, N] } }));
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 3/4" × 11-1/4" × 96" · $20.00']);
    expect(p.entries[0]!.notes).toEqual(['1 board priced as 3/4" × 11-1/4" × 96" — a 3/4" × 1-1/2" × 72" would hold its parts (no price set)']);
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
    expect(p.entries[0]!.lines).toEqual(['Buy 2 × 3/4" × 3-1/2" × 96" · $20.00']);
    expect(p.entries[0]!.notes).toEqual(['2 boards priced as 3/4" × 3-1/2" × 96" — a 3/4" × 2-1/2" × 72" would hold each one\'s parts (no price set)']);
  });

  it('uses the thinnest stock thick enough to hold the part, and says to plane it', () => {
    // ½" part → ¾" stock; 1¼" part → 1½" stock (D).
    const shop = shopWith({ pine: { mode: 'piece', stock: [A, D] } });
    const p = purchase([pine('half', 20, 3, 0.5), pine('thick', 20, 3, 1.25)], shop);
    expect(p.entries[0]!.notes).toEqual(['half: plane 3/4" stock to 1/2"', 'thick: plane 1-1/2" stock to 1-1/4"']);
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 3/4" × 5-1/2" × 96", 1 × 1-1/2" × 3-1/2" × 96" · $20.00']);
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
    expect(p.entries[0]!.lines).toEqual(['Buy 1 × 3/4" × 5-1/2" × 96" · $12.00']);
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
