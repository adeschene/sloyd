import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildCutList, createBoard, createDocument, flatDocument, worldParts, writeBackFlat, migrateDocument } from './document';
import type { Board, FlatDocument } from './types';
import { designToDocument, parseDesign } from './generated';
import { SHAKER_TABLE_JSON } from './shakerTableFixture';
import { applyJoints } from '../generate/joints/recipes';
import { findSites } from '../generate/joints/sites';
import { defaultChoice } from '../generate/joints/choose';
import { buildPurchase, defaultShop, type MaterialBuying, type ShopSettings, type StockBoard } from './purchase';
import { ARCH } from './curveFixtures';
import { loop, topCorners } from './sweepFixtures';

/**
 * Edge banding 1 (Global Constraints: byte for byte). A document with no bands gives exactly today's cut list and Buying.
 * Every hash below was captured on the tree BEFORE edge banding touched `cutlist.ts` or `purchase.ts` (the
 * `sweptIdentity` pattern); the replacer drops only the keys banding adds (`stripIds`, `notes`, `banding`). Never
 * re-capture a literal to make this pass.
 */
const DROPPED = new Set(['stripIds', 'notes', 'banding']);
const strip = (k: string, v: unknown) => (DROPPED.has(k) ? undefined : v);
/** Minted ids carry `Date.now()` (ids.ts), so each is renamed by first appearance; their relations are kept. */
function canonical(json: string): string {
  const seen = new Map<string, string>();
  return json.replace(/id_[0-9a-z]+_[0-9a-z]+/g, (m) => seen.get(m) ?? (seen.set(m, `ID${seen.size}`), `ID${seen.size - 1}`));
}
const sha = (x: unknown) => createHash('sha256').update(canonical(JSON.stringify(x, strip))).digest('hex').slice(0, 16);

const size = (id: string, thickness: number, width: number, length: number, price: number | null): StockBoard =>
  ({ id, thickness, width, length, price });
const shopWith = (over: Record<string, MaterialBuying>): ShopSettings => {
  const s = defaultShop();
  return { ...s, materials: { ...s.materials, ...over } };
};
const docOf = (boards: Board[], over: Partial<FlatDocument> = {}): FlatDocument => ({ ...createDocument('T'), boards, ...over });

/** The generated, joined Shaker table (refine.test's flow): tenons, tapers, oak by the board foot. */
function shaker(): FlatDocument {
  const made = designToDocument(parseDesign(SHAKER_TABLE_JSON)!, { centre: false });
  const flat = flatDocument(made.doc);
  const sites = findSites(flat);
  const joined = applyJoints(flat, sites, sites.map((s) => defaultChoice(s, flat, sites)));
  return flatDocument(migrateDocument(writeBackFlat(made.doc, flat.boards, worldParts(joined.doc))));
}

/** Sheet goods with nesting beside solid parts. */
const sheets = (): FlatDocument => docOf([
  ...Array.from({ length: 5 }, (_, i) => createBoard({ name: `Side ${i}`, material: 'plywood', length: 30, width: 23.25, thickness: 0.75 })),
  createBoard({ name: 'Back', material: 'plywood', length: 40, width: 30, thickness: 0.5 }),
  createBoard({ name: 'Shelf', material: 'mdf', length: 36, width: 11.25, thickness: 0.75 }),
  createBoard({ name: 'Rail', material: 'pine', length: 34.5, width: 3.5, thickness: 0.75 }),
]);

/** By the piece, priced pine; with an arch, a loop profile and a cut so the setup lines are exercised too. */
const pieces = (): FlatDocument => docOf([
  createBoard({ name: 'p1', material: 'pine', length: 40, width: 5, thickness: 0.75 }),
  createBoard({ name: 'p2', material: 'pine', length: 40, width: 5, thickness: 0.75, curves: [ARCH] }),
  createBoard({ name: 'p3', material: 'pine', length: 30, width: 5, thickness: 0.75,
    cuts: [{ id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 4, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 }] }),
  { ...topCorners(2, loop('p1', 0.5, 'ogee')), name: 'Top', material: 'pine' },
]);
const PIECE_SHOP = shopWith({ pine: { mode: 'piece', stock: [size('A', 0.75, 5.5, 96, 12), size('B', 0.75, 7.25, 96, 18), size('C', 0.75, 5.5, 72, 9), size('D', 1.5, 12, 96, 30)] } });

const CASES: [string, () => FlatDocument, ShopSettings][] = [
  ['shaker table', shaker, defaultShop()],
  ['sheet goods', sheets, defaultShop()],
  ['by the piece', pieces, PIECE_SHOP],
  ['sheet goods, metric', () => ({ ...sheets(), units: { display: 'metric-mm', precision: 16 } }), defaultShop()],
];

// Captured 2026-10-20 on edge-banding-1 at 6e5d6dd (before Task 5 touched cutlist.ts; before Task 6 touched purchase.ts).
const PINNED: Record<string, [string, string]> = {
  'shaker table': ['2fd0edc02a046a21', 'fc03aadea642f331'],
  'sheet goods': ['465fd867e3bb167e', 'a124fae07b29b33d'],
  'by the piece': ['460c41c5b698657d', 'd6efcd77fc6dd403'],
  'sheet goods, metric': ['5721bb7e74c90ef4', '2ef12b2fc9cf932d'],
};

describe('a band-free document: the cut list and Buying byte for byte (edge banding 1)', () => {
  it.each(CASES)('%s', (name, make, shop) => {
    const d = make();
    const list = buildCutList(d);
    const got: [string, string] = [sha(list), sha(buildPurchase(d, list, shop))];
    expect(got).toEqual(PINNED[name]);
  });
});
