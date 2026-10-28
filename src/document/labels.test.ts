import { describe, expect, it } from 'vitest';
import { LABEL_STOCKS, cellBox, defaultStock, labelsOf, pagesOf, stockCells, type PartLabel } from './labels';
import { buildCutList } from './cutlist';
import { createBoard, createDocument, flatDocument } from './document';
import type { BandType, Board, Definition, FlatDocument, Instance, SloydDocument } from './types';
import { IMPERIAL, type Units } from '../units/length';

const METRIC: Units = { display: 'metric-mm', precision: 16 };
const flat = (boards: Board[], extra: Partial<SloydDocument> = {}): FlatDocument => ({ ...createDocument('Bookcase'), boards, ...extra } as FlatDocument);

describe('the stock (part labels spec §3)', () => {
  const PAGE = { letter: [8.5, 11], a4: [210 / 25.4, 297 / 25.4] } as const;
  for (const s of LABEL_STOCKS) {
    it(`${s.id} fills its page within 0.01" both ways`, () => {
      const k = s.unit === 'mm' ? 1 / 25.4 : 1;
      const [W, H] = PAGE[s.page];
      expect(Math.abs((2 * s.left + (s.cols - 1) * s.colPitch + s.width) * k - W)).toBeLessThanOrEqual(0.01);
      expect(Math.abs((2 * s.top + (s.rows - 1) * s.rowPitch + s.height) * k - H)).toBeLessThanOrEqual(0.01);
    });
  }
  it('the four presets, by id, and the default by units', () => {
    expect(LABEL_STOCKS.map((s) => s.id)).toEqual(['avery-5160', 'avery-5163', 'l7160', 'l7163']);
    expect(LABEL_STOCKS.map(stockCells)).toEqual([30, 10, 21, 14]);
    expect(defaultStock(IMPERIAL).id).toBe('avery-5160');
    expect(defaultStock(METRIC).id).toBe('l7160');
  });
  it('cellBox: row-major, from the preset', () => {
    const s = LABEL_STOCKS[0]!;
    expect(cellBox(s, 4)).toEqual({ left: 0.1875 + 2.75, top: 0.5 + 1, width: 2.625, height: 1 });
    expect(cellBox(s, 0)).toEqual({ left: 0.1875, top: 0.5, width: 2.625, height: 1 });
  });
});

describe('labelsOf (part labels spec §2)', () => {
  const maple: BandType = { id: 'm', name: 'Maple edging 1/4"', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple', widthAllowance: 0.0625 };
  const shelves = [0, 1, 2].map((i) => createBoard({ id: `s${i}`, name: `Side ${i + 1}`, material: 'oak', length: 30, width: 11.25, thickness: 0.75 }));
  const shelf = createBoard({ id: 'sh', name: 'Shelf', material: 'plywood', length: 30, width: 12, thickness: 0.75, bands: [{ side: { across: 'width', from: 'max' }, type: 'm' }] });
  const cleat = createBoard({ id: 'c', name: 'Cleat', material: 'pine', length: 20, width: 3.5, thickness: 0.75 });
  const back = createBoard({ id: 'b', name: 'Back', material: 'mdf', length: 30, width: 20, thickness: 0.25 });
  const doc = flat([...shelves, shelf, cleat, back], { bandTypes: [maple] });
  const list = buildCutList(doc);
  const labels = labelsOf(doc, list);
  const rows = list.groups.flatMap((g) => g.rows);

  it('one label per piece: the total is Σ qty, every strip row included', () => {
    expect(labels).toHaveLength(rows.reduce((s, r) => s + r.qty, 0));
    expect(labels).toHaveLength(7);
    expect(new Set(labels.map((l) => l.key)).size).toBe(7);
  });
  it("every number is its row's number, never decreasing", () => {
    const byKey = new Map(rows.map((r) => [r.key, r.number]));
    for (const l of labels) expect(l.number).toBe(byKey.get(l.key.split('#')[0]!));
    for (let i = 1; i < labels.length; i += 1) expect(labels[i]!.number).toBeGreaterThanOrEqual(labels[i - 1]!.number);
  });
  const find = (name: string) => labels.find((l) => l.name === name)!;
  it('copies, sizes, materials, grain, the project', () => {
    expect(labels.filter((l) => l.material === 'Oak').map((l) => l.copy)).toEqual(['1 of 3', '2 of 3', '3 of 3']);
    expect(find('Side 2')).toMatchObject({ size: '30" × 11-1/4" × 3/4"', material: 'Oak', grain: 'grain along length', project: 'Bookcase' });
    expect(find('Cleat')).toMatchObject({ size: '20" × 3-1/2" × 3/4" (1×4)', copy: null });
    expect(find('Back').grain).toBeNull();
    expect(find('Shelf').size).toBe('30" × 11-3/4" × 3/4"');
    const strip = labels.find((l) => l.material === 'Maple')!;
    expect(strip.name).toBe(rows.find((r) => r.stripIds.length > 0)!.names[0]);
  });
  it('a metric project prints mm', () => {
    const m = flat([cleat], { units: METRIC });
    expect(labelsOf(m, buildCutList(m))[0]!.size).toBe('508 × 89 × 19 mm (1×4)');
  });
  it('an assembly placed twice: one label per copy', () => {
    const rail = createBoard({ id: 'r', name: 'Rail', material: 'cherry', length: 20, width: 3, thickness: 0.75 });
    const d1: Definition = { id: 'd1', boards: [rail], instances: [], hardware: [] };
    const inst = (i: number): Instance => ({ id: `i${i}`, name: `Frame ${i}`, definition: 'd1', position: [i * 30, 0, 0], rotation: 0 });
    const f = flatDocument({ ...createDocument('T'), definitions: [d1], instances: [inst(1), inst(2)] } as unknown as SloydDocument);
    const ls = labelsOf(f, buildCutList(f));
    expect(ls.map((l) => l.copy)).toEqual(['1 of 2', '2 of 2']);
    expect(new Set(ls.map((l) => l.name)).size).toBe(2);
  });
});

describe('pagesOf (part labels spec §3)', () => {
  const s = LABEL_STOCKS[0]!;
  const L = (n: number): PartLabel[] => Array.from({ length: n }, (_, i) => ({ key: `k${i}`, number: i + 1, name: `P${i}`, size: '', material: '', grain: null, project: '', copy: null }));
  it('31 labels on 5160: two pages, the second one label then 29 empty cells', () => {
    const p = pagesOf(L(31), s, 1);
    expect(p).toHaveLength(2);
    expect(p.every((pg) => pg.length === 30)).toBe(true);
    expect(p[1]![0]!.key).toBe('k30');
    expect(p[1]!.slice(1).every((c) => c === null)).toBe(true);
  });
  it('start at 29: cells 0..27 skipped, the first label in cell 28', () => {
    const p = pagesOf(L(4), s, 29);
    expect(p).toHaveLength(2);
    expect(p[0]!.slice(0, 28).every((c) => c === null)).toBe(true);
    expect(p[0]![28]!.key).toBe('k0');
    expect(p[1]![1]!.key).toBe('k3');
  });
  it('no labels: no pages', () => expect(pagesOf([], s, 5)).toEqual([]));
});
