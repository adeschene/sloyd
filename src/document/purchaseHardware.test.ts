import { describe, expect, it } from 'vitest';
import { buildCutList, createBoard, createDocument, flatDocument } from './document';
import { buildPurchase, defaultShop } from './purchase';
import type { HardwareTotal } from './hardware';
import type { HardwareType, TapeBand } from './types';

const type = (name: string, packSize: number, pricePerPack: number | null, id = name): HardwareType => ({ id, name, packSize, pricePerPack });
const total = (t: HardwareType, n: number): HardwareTotal => ({ type: t, total: n, uses: [] });
const flat = createBoard({ id: 'p1', name: 'P1', material: 'pine', length: 20, width: 4, thickness: 0.75 });
const base = flatDocument({ ...createDocument('T'), boards: [flat] });
const list = buildCutList(base);
const shop = defaultShop();
const empty = flatDocument(createDocument('E'));
const buy = (hw: HardwareTotal[], doc = empty) => buildPurchase(doc, buildCutList(doc), shop, hw);

describe('Buying: the Hardware block (hardware spec §4.2)', () => {
  it('pack size 1: buy <total> · <price>', () => {
    expect(buy([total(type('Euro hinge', 1, 4.5), 8)]).hardware).toEqual({ lines: ['Euro hinge: buy 8 · $36.00'], cost: 36 });
  });
  it('pack size > 1 rounds packs UP', () => {
    expect(buy([total(type('Screw', 100, 6.99), 120)]).hardware!.lines).toEqual(['Screw: 120, buy 2 packs of 100 · $13.98']);
  });
  it('exactly one pack reads singular', () => {
    expect(buy([total(type('Screw', 100, 6.99), 100)]).hardware!.lines).toEqual(['Screw: 100, buy 1 pack of 100 · $6.99']);
  });
  it('an unpriced type says so and stays out of the total', () => {
    const p = buy([total(type('Pull', 1, null), 4), total(type('Hinge', 1, 2), 3)]);
    expect(p.hardware).toEqual({ lines: ['Pull: buy 4 · no price', 'Hinge: buy 3 · $6.00'], cost: 6 });
    expect(p.total).toBe(6);
    expect(p.totalLabel).toBe('Estimated materials: $6.00 (1 hardware item has no price)');
  });
  it('nothing priced: cost null and the amount is a dash', () => {
    const p = buy([total(type('Pull', 1, null), 4)]);
    expect(p.hardware!.cost).toBeNull();
    expect(p.totalLabel).toBe('Estimated materials: — (1 hardware item has no price)');
  });
  it('the hardware cost joins the total', () => {
    const p = buy([total(type('Hinge', 1, 4.5), 8)]);
    expect(p.total).toBe(36);
    expect(p.totalLabel).toBe('Estimated materials: $36.00');
  });
  it('the tail counts kinds apart', () => {
    const tail = (n: number) => buy([total(type('Pull', 1, null), 1), ...Array.from({ length: n - 1 }, (_, i) => total(type(`P${i}`, 1, null), 1))]).totalLabel;
    expect(tail(1)).toContain('(1 hardware item has no price)');
    expect(tail(3)).toContain('(3 hardware items have no price)');
  });
  it('materials, band types and hardware list with commas and "and"', () => {
    const tape: TapeBand = { kind: 'tape', id: 'tb', name: 'Oak tape', tapeWidth: 1, pricePerFoot: null } as TapeBand;
    const doc = flatDocument({
      ...createDocument('T'),
      bandTypes: [tape],
      boards: [createBoard({ id: 'a', name: 'A', material: 'oak', length: 20, width: 4, thickness: 0.75, bands: [{ side: 'left', type: 'tb' }] } as never), createBoard({ id: 'b', name: 'B', material: 'pine', length: 20, width: 4, thickness: 0.75 })],
    });
    const hw = [total(type('H1', 1, null), 1), total(type('H2', 1, null), 1), total(type('H3', 1, null), 1)];
    const p = buildPurchase(doc, buildCutList(doc), shop, hw);
    expect(p.totalLabel).toMatch(/\(\d+ materials?, 1 band type and 3 hardware items have no price\)$/);
    const q = buildPurchase(base, list, shop, [total(type('H', 1, null), 1)]);
    expect(q.totalLabel).toBe('Estimated materials: — (1 material and 1 hardware item have no price)');
  });
  it('no hardware: null, and the label matches the three-argument call', () => {
    const three = buildPurchase(base, list, shop);
    const four = buildPurchase(base, list, shop, []);
    expect(four.hardware).toBeNull();
    expect(four.totalLabel).toBe(three.totalLabel);
    expect(four).toEqual(three);
  });
});
