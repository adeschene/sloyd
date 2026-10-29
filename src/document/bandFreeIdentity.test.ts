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
// `pounds` and `weight` are the weight round's additions to the cut list (weight spec §5.1; asserted in cutlistWeight.test.ts):
// dropped so everything else stays pinned to the same literals.
const DROPPED = new Set(['stripIds', 'banding', 'pounds', 'weight']); // Purchase.hardware (hardware round, Task 6) is null here: dropped below ONLY when null
/** Drops what banding adds: `stripIds` and `banding` anywhere, and `notes` ONLY on the CutList itself — Buying's own
 *  `PurchaseEntry.notes` (plane, fits-no-stock, end grain, the fu 273 smaller-size note) stay pinned (fix round 1). */
function strip(this: unknown, k: string, v: unknown) {
  if (DROPPED.has(k)) return undefined;
  if (k === 'hardware' && v === null) return undefined;
  if (k === 'notes' && typeof this === 'object' && this !== null && 'groups' in this) return undefined;
  return v;
}
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
const docOf = (boards: Board[], over: Partial<FlatDocument> = {}): FlatDocument => fixIds({ ...createDocument('T'), boards, ...over });

/**
 * Every fixture id FIXED (fix round 1 of Task 8): a minted id is `id_<Date.now() base36>_<counter base36>`, and nesting breaks
 * ties between identical parts by `a.id.localeCompare(b.id)` — a counter crossing a base-36 digit (`z` → `10`) inside one
 * millisecond inverted that order against creation order, and a millisecond tick between the two mints did not, so the pin
 * flaked under load. The fixtures' own parts carry literal
 * ids (`id_fix_NN`); any id minted inside a builder (the Shaker table's `designToDocument`, joinery) is renamed to a literal
 * `id_fix_NNNN` in CREATION order (timestamp, then counter, compared as numbers). Both still match `canonical`'s pattern, so
 * the pinned hashes are unchanged.
 */
const MINTED = /id_([0-9a-z]+)_([0-9a-z]+)/g;
function fixIds<T>(x: T): T {
  const json = JSON.stringify(x);
  const minted = [...new Set([...json.matchAll(MINTED)].filter((m) => m[1] !== 'fix').map((m) => m[0]))];
  const order = (id: string) => id.split('_').slice(1).map((p) => parseInt(p, 36));
  minted.sort((a, b) => { const [ta, ca] = order(a), [tb, cb] = order(b); return ta! - tb! || ca! - cb!; });
  const fixed = new Map(minted.map((id, i) => [id, `id_fix_${String(i).padStart(4, '0')}`]));
  return JSON.parse(json.replace(MINTED, (m) => fixed.get(m) ?? m)) as T;
}
const fid = (n: number) => `id_fix_${String(n).padStart(2, '0')}`;

/** The generated, joined Shaker table (refine.test's flow): tenons, tapers, oak by the board foot. */
function shaker(): FlatDocument {
  const made = designToDocument(parseDesign(SHAKER_TABLE_JSON)!, { centre: false });
  const flat = flatDocument(made.doc);
  const sites = findSites(flat);
  const joined = applyJoints(flat, sites, sites.map((s) => defaultChoice(s, flat, sites)));
  return fixIds(flatDocument(migrateDocument(writeBackFlat(made.doc, flat.boards, worldParts(joined.doc)))));
}

/**
 * Sheet goods with nesting beside solid parts, its eight parts' ids given. The five Sides tie in nesting, which orders them
 * by id STRING. The pinned literals were captured with minted ids, so each case's ids reproduce the order it was captured in
 * (fix round 1 of Task 8, read off the minted ids of a capture run): `sheet goods` ran after the Shaker table, its counter
 * crossing `z` → `10` between Side 2 and Side 3 (`…_x … _z, …_10 …`), so Sides 3 and 4 sorted FIRST; `sheet goods, metric`
 * ran with counters `19 … 1g`, in creation order. Each is now a literal, so neither can flip with the clock.
 */
const ROLLED_OVER = ['x', 'y', 'z', '10', '11', '12', '13', '14'].map((c) => `id_fix_${c}`);
const IN_ORDER = Array.from({ length: 8 }, (_, i) => fid(i));
const sheets = (ids: readonly string[]): FlatDocument => docOf([
  ...Array.from({ length: 5 }, (_, i) => createBoard({ id: ids[i]!, name: `Side ${i}`, material: 'plywood', length: 30, width: 23.25, thickness: 0.75 })),
  createBoard({ id: ids[5]!, name: 'Back', material: 'plywood', length: 40, width: 30, thickness: 0.5 }),
  createBoard({ id: ids[6]!, name: 'Shelf', material: 'mdf', length: 36, width: 11.25, thickness: 0.75 }),
  createBoard({ id: ids[7]!, name: 'Rail', material: 'pine', length: 34.5, width: 3.5, thickness: 0.75 }),
]);

/** By the piece, priced pine; with an arch, a loop profile and a cut so the setup lines are exercised too. */
const pieces = (): FlatDocument => docOf([
  createBoard({ id: fid(10), name: 'p1', material: 'pine', length: 40, width: 5, thickness: 0.75 }),
  createBoard({ id: fid(11), name: 'p2', material: 'pine', length: 40, width: 5, thickness: 0.75, curves: [ARCH] }),
  createBoard({ id: fid(12), name: 'p3', material: 'pine', length: 30, width: 5, thickness: 0.75,
    cuts: [{ id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 4, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 }] }),
  { ...topCorners(2, loop('p1', 0.5, 'ogee')), id: fid(13), name: 'Top', material: 'pine' },
]);
const PIECE_SHOP = shopWith({ pine: { mode: 'piece', stock: [size('A', 0.75, 5.5, 96, 12), size('B', 0.75, 7.25, 96, 18), size('C', 0.75, 5.5, 72, 9), size('D', 1.5, 12, 96, 30), size('E', 0.75, 5.5, 48, null)] } });

const CASES: [string, () => FlatDocument, ShopSettings][] = [
  ['shaker table', shaker, defaultShop()],
  ['sheet goods', () => sheets(ROLLED_OVER), defaultShop()],
  ['by the piece', pieces, PIECE_SHOP],
  ['sheet goods, metric', () => ({ ...sheets(IN_ORDER), units: { display: 'metric-mm', precision: 16 } }), defaultShop()],
];

// The CutList hashes (first of each pair): captured 2026-10-20 on edge-banding-1 at 6e5d6dd, before Task 5 touched
// cutlist.ts; never re-captured. The Buying hashes (second): RE-CAPTURED once in Task 5's fix round 1 (at 1d8c5b2), because
// the first replacer dropped `notes` at every depth and so left Buying's own PurchaseEntry.notes unpinned; the by-the-piece
// shop also gained an unpriced 4' size so its Buying carries the fu 273 note beside its fits-no-stock note. purchase.ts was
// still untouched since master then, so these are still today's Buying bytes.
// The by-the-piece Buying hash was RE-CAPTURED once more in the glue-ups round (2026-10-29, fu 268), and only that one: its
// `Top` (3/4 × 20 × 36 against stock at most 7-1/4 wide) was `too wide` and is now glued up from 3 strips by design (glue-ups
// spec §3). Diffed before re-capturing: the Top's note, its strips on the layouts, the buy line and the total changed, and
// nothing else (the fu 273 note left with the old packing). The cut-list hash is unchanged.
const PINNED: Record<string, [string, string]> = {
  'shaker table': ['2fd0edc02a046a21', '4fd16a9b34e7bb78'],
  'sheet goods': ['465fd867e3bb167e', 'c77f0e028fe8b2ce'],
  'by the piece': ['460c41c5b698657d', '7ae050d1bc8bd91b'],
  'sheet goods, metric': ['5721bb7e74c90ef4', '8f53656cbbabb8ef'],
};

describe('a band-free document: the cut list and Buying byte for byte (edge banding 1)', () => {
  it.each(CASES)('%s', (name, make, shop) => {
    const d = make();
    const list = buildCutList(d);
    const got: [string, string] = [sha(list), sha(buildPurchase(d, list, shop))];
    expect(got).toEqual(PINNED[name]);
  });
});
