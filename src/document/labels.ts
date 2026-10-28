import type { FlatDocument } from './types';
import { materialKind } from './types';
import { catalogOf } from './materials';
import type { CutList } from './cutlist';
import { formatSize, isMetric, type Units } from '../units/length';

/**
 * Printable part labels (part labels spec): the ONE home of label strings and sticker-sheet geometry. A label's number is
 * `CutListRow.number` — the one series the cut list and the Plans balloons share — never recounted. Every string a person
 * reads off a label is built here (inv 19); `LabelsSheet` prints them.
 */

/** One sticker sheet: exact page geometry in its own unit (spec §3). Cells run row-major from the top left. */
export interface LabelStock {
  id: string;
  name: string;
  page: 'letter' | 'a4';
  cols: number;
  rows: number;
  width: number;
  height: number;
  top: number;
  left: number;
  colPitch: number;
  rowPitch: number;
  unit: 'in' | 'mm';
}

export const LABEL_STOCKS: readonly LabelStock[] = [
  { id: 'avery-5160', name: 'Avery 5160 / 8160 — 30 per sheet, 2-5/8" × 1"', page: 'letter', cols: 3, rows: 10, width: 2.625, height: 1, top: 0.5, left: 0.1875, colPitch: 2.75, rowPitch: 1, unit: 'in' },
  { id: 'avery-5163', name: 'Avery 5163 / 8163 — 10 per sheet, 4" × 2"', page: 'letter', cols: 2, rows: 5, width: 4, height: 2, top: 0.5, left: 0.15625, colPitch: 4.1875, rowPitch: 2, unit: 'in' },
  { id: 'l7160', name: 'Avery L7160 — 21 per sheet, 63.5 × 38.1 mm', page: 'a4', cols: 3, rows: 7, width: 63.5, height: 38.1, top: 15.15, left: 7.25, colPitch: 66.04, rowPitch: 38.1, unit: 'mm' },
  { id: 'l7163', name: 'Avery L7163 — 14 per sheet, 99.1 × 38.1 mm', page: 'a4', cols: 2, rows: 7, width: 99.1, height: 38.1, top: 15.15, left: 4.65, colPitch: 101.6, rowPitch: 38.1, unit: 'mm' },
];

/** Letter stock for an imperial project, A4 for a metric one: the likely paper (spec §3). */
export const defaultStock = (units: Units): LabelStock => LABEL_STOCKS[isMetric(units) ? 2 : 0]!;

export const stockCells = (s: LabelStock): number => s.cols * s.rows;

/** Cell `i` (row-major) of a page, in the stock's unit. */
export function cellBox(s: LabelStock, i: number): { left: number; top: number; width: number; height: number } {
  const r = Math.floor(i / s.cols), c = i % s.cols;
  return { left: s.left + c * s.colPitch, top: s.top + r * s.rowPitch, width: s.width, height: s.height };
}

/** One sticker's lines (spec §2). `grain` is null on a plain sheet (MDF has none); `copy` is null on a quantity-1 row. */
export interface PartLabel {
  key: string;
  number: number;
  name: string;
  size: string;
  material: string;
  grain: string | null;
  project: string;
  copy: string | null;
}

const GRAIN_TEXT = { length: 'grain along length', width: 'grain across', thickness: 'end grain' } as const;

/** One label per PHYSICAL piece the cut list asks for — every row, strip rows included, each copy — in display order. */
export function labelsOf(flat: FlatDocument, list: CutList): PartLabel[] {
  const catalog = catalogOf(flat);
  const out: PartLabel[] = [];
  for (const group of list.groups) {
    const material = catalog.label(group.material);
    const grainless = materialKind(group.material) === 'sheet-plain';
    for (const row of group.rows) {
      // ONE formatSize over the row's cut length and width (the numbers `row.dims` prints) and the group's thickness, so a
      // metric size carries its unit once (`508 × 89 × 19 mm`), never `row.dims`' own ` mm` mid-string.
      const size = `${formatSize([row.length, row.width, group.thickness], flat.units)}${row.nominal ? ` (${row.nominal})` : ''}`;
      for (let k = 1; k <= row.qty; k += 1) {
        out.push({
          key: `${row.key}#${k}`,
          number: row.number,
          name: row.names[k - 1]!,
          size,
          material,
          grain: grainless ? null : GRAIN_TEXT[row.grain],
          project: flat.name,
          copy: row.qty === 1 ? null : `${k} of ${row.qty}`,
        });
      }
    }
  }
  return out;
}

/**
 * The labels laid onto sheets: each page exactly `stockCells` cells, row-major; the first `startAt − 1` cells of the FIRST
 * page skipped (a partly used sheet), `null` for a skipped or empty cell. No labels, no pages. `startAt` is a legal 1-based
 * cell number (the field refuses any other, never clamps).
 */
export function pagesOf(labels: readonly PartLabel[], stock: LabelStock, startAt: number): (PartLabel | null)[][] {
  if (labels.length === 0) return [];
  const n = stockCells(stock);
  const cells: (PartLabel | null)[] = [...Array<null>(startAt - 1).fill(null), ...labels];
  const pages: (PartLabel | null)[][] = [];
  for (let i = 0; i < cells.length; i += n) {
    const page = cells.slice(i, i + n);
    pages.push([...page, ...Array<null>(n - page.length).fill(null)]);
  }
  return pages;
}
