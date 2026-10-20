import { describe, expect, it } from 'vitest';
import { buildCutList } from './cutlist';
import { buildPurchase, defaultShop } from './purchase';
import { createBoard, createDocument } from './document';
import { BAND_SIDES, BUILT_IN_BAND } from './bandModel';
import type { BandType, FlatDocument } from './types';

const maple: BandType = { id: 'm', name: 'Maple edging', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
const shelf = (id: string, type: string) =>
  ({ ...createBoard({ id, name: id, length: 30, width: 12, thickness: 0.75, material: 'plywood' }), bands: BAND_SIDES.map((side) => ({ side, type })) });
const flat = (boards: object[], bandTypes: BandType[], units?: object): FlatDocument =>
  ({ ...createDocument('T'), boards, bandTypes, ...(units ? { units } : {}) } as FlatDocument);
const buy = (d: FlatDocument, shop = defaultShop()) => buildPurchase(d, buildCutList(d), shop);

describe('Buying with bands (edge banding spec §4.4)', () => {
  it('no tape, no block', () => expect(buy(flat([shelf('a', 'm')], [BUILT_IN_BAND, maple])).banding).toBeNull());
  it('tape: one line per type, whole feet rounded up, unpriced shows feet only and joins the unpriced count', () => {
    const p = buy(flat([shelf('a', BUILT_IN_BAND.id), shelf('b', BUILT_IN_BAND.id)], [BUILT_IN_BAND]));
    // per shelf: 30.5 + 30.5 + 12.5 + 12.5 = 86"; two shelves 172" = 14.33 ft → 15′
    expect(p.banding!.lines).toEqual(['Iron-on veneer, 7/8" wide: buy 15′ · no price']);
    expect(p.banding!.cost).toBeNull();
    // the plywood (default shop: unpriced sheets) is a material, the tape a band type (fu 395(3))
    expect(p.totalLabel).toBe('Estimated materials: — (1 material and 1 band type have no price)');
  });
  it('tape the only unpriced item: the tail names the band type alone', () => {
    const shop = defaultShop();
    const priced = { ...shop, materials: { ...shop.materials, plywood: { mode: 'sheet' as const, pricePerSheet: 50 } } };
    const p = buy(flat([shelf('a', BUILT_IN_BAND.id)], [BUILT_IN_BAND]), priced);
    expect(p.totalLabel).toBe('Estimated materials: $50.00 (1 band type has no price)');
  });
  it('priced tape joins the total', () => {
    const priced = { ...BUILT_IN_BAND, pricePerFoot: 0.3 };
    const p = buy(flat([shelf('a', priced.id)], [priced]));
    expect(p.banding!.lines).toEqual(['Iron-on veneer, 7/8" wide: buy 8′ · $2.40']);   // 86" = 7.17 ft → 8′
    expect(p.banding!.cost).toBeCloseTo(2.4, 9);
    expect(p.total).toBeCloseTo(2.4, 9);
  });
  it('metric: metres with the bought feet in brackets; the trade width imperial with mm', () => {
    const p = buy(flat([shelf('a', BUILT_IN_BAND.id)], [BUILT_IN_BAND], { display: 'metric-mm', precision: 16 }));
    expect(p.banding!.lines).toEqual(['Iron-on veneer, 7/8" (22 mm) wide: 2.2 m, buy 8′ · no price']);
  });
  it('solid strips join their material\'s board feet', () => {
    const d = flat([shelf('a', 'm')], [BUILT_IN_BAND, maple]);
    const entry = buy(d).entries.find((e) => e.material === 'maple')!;
    expect(entry.mode).toBe('board-foot');
    // 2 × 30.5 + 2 × 12 = 85" of 1/4 × 13/16
    const net = (85 * 0.25 * 0.8125) / 144;
    expect(entry.lines[0]).toContain(`(${net.toFixed(2)} bd ft net`);
  });
  it('by the piece: strips are ripped from stock at least as thick as the strip is wide (Review Focus 5)', () => {
    const d = flat([shelf('a', 'm')], [BUILT_IN_BAND, maple]);
    const shop = defaultShop();
    shop.materials.maple = { mode: 'piece', stock: [{ id: 'k', thickness: 1, width: 6, length: 96, price: null }] };
    const entry = buy(d, shop).entries.find((e) => e.material === 'maple')!;
    expect(entry.unplaceable).toBe(0);
    expect(entry.notes.some((n) => n.includes('plane 1" stock to 13/16"'))).toBe(true);
    const labels = entry.layouts[0]!.nesting.sheets[0]!.parts.map((p) => p.boardId);
    expect(labels.every((id) => id.includes('#band:'))).toBe(true);
  });
});
