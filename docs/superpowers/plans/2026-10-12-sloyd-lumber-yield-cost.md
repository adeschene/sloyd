# Lumber Yield and Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cut list ends with a Buying section. Per material it says what to buy and what it costs: board feet × waste factor for hardwood, a packed board count for by-the-piece lumber, sheets for sheet goods. It also gives a project total. Prices live in this browser and are edited in a Lumber & prices dialog.

**Architecture:**
- A pure `document/purchase.ts` builds the Buying section from the cut list and the browser-level `ShopSettings`.
- By-the-piece packing reuses the sheet packer's shelf core, generalised as `packOnto` in `nesting.ts`. Grain is locked along the board, the largest size is opened first, and each board then swaps down to the cheapest size that still holds its parts.
- Settings go through `StorageAdapter` (key `sloyd.shop.v1`) and are never part of the document. There is no schema change.

**Tech Stack:** TypeScript, React 18, Zustand, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-12-sloyd-lumber-yield-cost-design.md` (with its three "amended while planning" notes). Read it, and `CLAUDE.md`, before the first task.

## Global Constraints

- **No schema change.** `CURRENT_VERSION` stays 13. Nothing touches `migrateDocument` or `SloydDocument`.
- **Prices are browser state, not document state.** They live under key `sloyd.shop.v1` and are read and written only through `StorageAdapter` (`getShopSettings` / `setShopSettings`). They never go on the undo stack and are never exported with a project. Reading NEVER writes.
- **Layer rules:**
  - `document/purchase.ts` may import `units`, because it produces strings people read (the `→ units` edge rule).
  - `document` imports nothing from `storage`, `store`, `panels` or `viewport`.
  - `storage` may import `document`.
- **Invariant 18:** board feet come from the cut list's exact `stockInches` (stock, not remainder), never rounded before summing.
- **Invariant 19:** every Buying string is built in `purchase.ts`. Components format nothing, and `formatMoney` is the one money formatter.
- **Invariants 22/23:** the by-the-piece packer is the existing shelf FFD with the same EPS. The sheet path must not move, so every existing `nesting` test stays green unchanged.
- **Refuse, never clamp:** an invalid price, waste factor or size is refused. The waste factor range is [1, 3].
- **Constants:**
  - `SHOP_LAYOUT = 1`
  - `DEFAULT_WASTE_FACTOR = 1.3`
  - default pine sizes: ¾" × {1½, 2½, 3½, 5½, 7¼, 9¼, 11¼}" × {72, 96}", width-major, with ids `s<w>x<l>` and no prices
- **Testing discipline:**
  - Every expected value is hand-derived in the test, with the arithmetic in a comment.
  - Mutate each named test once: change the code so the test must fail, see it fail, then restore.
  - Every code block in this plan was run in a scratch worktree off `9d4510c`: 3035 tests passed across 112 files, the typecheck and build were clean, and the named mutations failed.
  - If something disagrees, find the cause before changing either side, and escalate.
- **Diffs:** where a task shows a ```diff block, save it to a file and `git apply` it from the repo root. If context has drifted, apply the hunk by hand. New files are given whole.
- `npm test` does not typecheck, so run `npm run build` before claiming a task compiles.
- Commit to `master` (no PRs; CLAUDE.md working agreements). End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, exactly. `git add` only the named files, never `-A`.

## Review Focus

1. **Stored settings from a newer build (layout 2) must survive a rollback.** Reading shows defaults plus a notice, and NEVER rewrites the key. Pinned in Task 4.
2. **A wide part that only thicker stock can hold** comes from the thicker stock with a planing note. It is not reported "unplaceable". Pinned in Task 3.
3. **No prices at all.** Quantities still show; the total reads "—" and names what is unpriced; nothing reads $0.00 as if free. Pinned in Task 3.
4. **The prices dialog opened above the cut list.** Escape closes only the dialog, the cut list is inert behind it, and focus returns to the "Lumber & prices…" button. Pinned in Task 6.
5. **An exact fit at a size boundary** (a 72" part on a 72" board) must swap down, and 72.01" must not. Pinned in Task 3.

---

### Task 1: `formatMoney`

**Files:**
- Modify: `src/units/quantity.ts` (append)
- Test: `src/units/quantity.money.test.ts`

**Interfaces:** Produces `formatMoney(dollars: number): string`, e.g. `$1,234.50`.

- [ ] **Step 1: Write the failing test.** Create `src/units/quantity.money.test.ts`:

```ts
import { formatMoney } from './quantity';

describe('formatMoney', () => {
  it('prints dollars with two decimals and thousands separators', () => {
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(21)).toBe('$21.00');
    expect(formatMoney(19.5)).toBe('$19.50');
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatMoney(1234567.891)).toBe('$1,234,567.89');
  });
});
```

- [ ] **Step 2: Confirm it fails.** Run `npx vitest run src/units/quantity.money.test.ts`. Expected: FAIL, because `formatMoney` is not exported.
- [ ] **Step 3: Implement.** Apply:

```diff
diff --git a/src/units/quantity.ts b/src/units/quantity.ts
index 335d4b6..c9f13b1 100644
--- a/src/units/quantity.ts
+++ b/src/units/quantity.ts
@@ -47,3 +47,13 @@ export function formatBoardFeet(cubicInches: number): string {
 export function formatSquareFeet(squareInches: number): string {
   return `${(squareInches / INCHES_PER_SQUARE_FOOT).toFixed(DECIMALS)} sq ft`;
 }
+
+/**
+ * A price, printed: US dollars, two decimals, thousands separators — `$1,234.50`.
+ * The one home of money formatting (lumber yield and cost spec §3.4); the cut
+ * list's Buying section never formats a price itself. Sums are kept exact by the
+ * caller and rounded only here, for display.
+ */
+export function formatMoney(dollars: number): string {
+  return `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
+}
```

- [ ] **Step 4: Confirm it passes.** Expected: PASS (1 test).
- [ ] **Step 5: Mutate.** Change `minimumFractionDigits: 2` to `0`. Expected: FAIL (`$21` instead of `$21.00`). Restore it.
- [ ] **Step 6: Build and commit.** Run `npm run build`.

```bash
git add src/units/quantity.ts src/units/quantity.money.test.ts
git commit -m "feat(lumber): formatMoney — the one price formatter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The by-the-piece packer — `packOnto` in `nesting.ts`

**Files:**
- Modify: `src/document/nesting.ts`
- Test: `src/document/nesting.packOnto.test.ts`

**Interfaces:**
- Produces:
  - `grainFootprint(board): Footprint`
  - `Bin { length; width }`
  - `PackedBin<B> { bin: B; parts: PlacedPart[] }`
  - `packOnto<B extends Bin>(boards, sizes: readonly B[], kerf, precision): { bins: PackedBin<B>[]; unplaceable: Board[] }`
- Unchanged: `footprintsOf`, `buildNesting`. `placeOn`'s stock parameter is widened to `{ length; width }` and behaves the same.

- [ ] **Step 1: Write the failing test.** Create `src/document/nesting.packOnto.test.ts`:

```ts
import { createBoard } from './document';
import { packOnto } from './nesting';

const part = (id: string, length: number, width: number) => createBoard({ id, name: id, length, width, thickness: 0.75 });
// Sizes in list order: C 72×5½, B 96×7¼, A 96×5½.
const C = { id: 'C', length: 72, width: 5.5 };
const B = { id: 'B', length: 96, width: 7.25 };
const A = { id: 'A', length: 96, width: 5.5 };

describe('packOnto', () => {
  it('opens the largest size that holds the next part — by length, then width', () => {
    // Two 40×5 parts: 40 + ⅛ + 40 = 80⅛ fits one 96" board. Largest: length 96 (A, B) then width 7¼ → B.
    const r = packOnto([part('p', 40, 5), part('q', 40, 5)], [C, B, A], 0.125, 16);
    expect(r.bins.map((b) => [b.bin.id, b.parts.map((p) => p.boardId)])).toEqual([['B', ['p', 'q']]]);
    expect(r.unplaceable).toEqual([]);
  });

  it('keeps grain along the board: a part longer than every size is unplaceable, never turned', () => {
    // 100 × 3: would fit across a 96 × 7¼ board only if turned; grain forbids it.
    const r = packOnto([part('long', 100, 3), part('ok', 30, 3)], [C, B, A], 0.125, 16);
    expect(r.unplaceable.map((b) => b.id)).toEqual(['long']);
    expect(r.bins.flatMap((b) => b.parts.map((p) => p.turned))).toEqual([false]);
  });

  it('fills open boards before opening another', () => {
    // 60 then 30 (sorted by width desc, then length desc): 60 opens B; 30 fits beside it (60 + ⅛ + 30 = 90⅛).
    const r = packOnto([part('s', 30, 5), part('l', 60, 5)], [C, B, A], 0.125, 16);
    expect(r.bins).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Confirm it fails.** Expected: FAIL, because `packOnto` is not exported.
- [ ] **Step 3: Implement.** Apply this diff. It adds `grainFootprint` above `footprintsOf`'s existing doc comment, makes `footprintsOf` use it, widens `placeOn`'s stock type, and appends `packOnto`:

```diff
diff --git a/src/document/nesting.ts b/src/document/nesting.ts
index db40948..0401232 100644
--- a/src/document/nesting.ts
+++ b/src/document/nesting.ts
@@ -30,6 +30,17 @@ export interface Footprint {
   turned: boolean;
 }
 
+/**
+ * A part's footprint with its grain running along the stock's LENGTH — the only
+ * orientation solid lumber allows, and the first option under `rotate: 'grain'`.
+ * Exported for the by-the-piece packer (`packOnto`).
+ */
+export function grainFootprint(board: Board): Footprint {
+  return board.grain === 'width'
+    ? { w: board.width, h: board.length, turned: true }
+    : { w: board.length, h: board.width, turned: false };
+}
+
 /**
  * The orientations a part is allowed to take, PREFERRED FIRST.
  *
@@ -43,16 +54,8 @@ export interface Footprint {
  * is a grouping key rather than a packing input.
  */
 export function footprintsOf(board: Board, stock: SheetStock): Footprint[] {
-  // 'thickness' is meaningless for a sheet good and validateBoard normalises
-  // it away; a Board built in code could still carry it, and defaulting beats
-  // throwing.
-  const natural: Footprint =
-    board.grain === 'width'
-      ? { w: board.width, h: board.length, turned: true }
-      : { w: board.length, h: board.width, turned: false };
-
+  const natural = grainFootprint(board);
   if (stock.rotate === 'grain') return [natural];
-
   const flipped: Footprint = { w: natural.h, h: natural.w, turned: !natural.turned };
   return natural.h <= flipped.h ? [natural, flipped] : [flipped, natural];
 }
@@ -174,7 +177,7 @@ function placeOn(
   sheet: WorkingSheet,
   board: Board,
   options: Footprint[],
-  stock: SheetStock,
+  stock: { length: number; width: number },
   kerf: number,
   precision: number,
 ): boolean {
@@ -320,3 +323,46 @@ export function buildNesting(
     sheet,
   };
 }
+
+/** One stock size a by-the-piece packer may open: its length runs along the grain. */
+export interface Bin { length: number; width: number }
+export interface PackedBin<B extends Bin> { bin: B; parts: PlacedPart[] }
+
+/**
+ * Pack solid-lumber parts onto boards chosen as packing proceeds (lumber yield
+ * and cost spec §3.2). The same SHELF FIRST-FIT-DECREASING core as buildNesting —
+ * edge-to-edge cuts, kerf between parts, the same EPS (invariants 22, 23) — with
+ * two differences: grain always runs along the board (no rotation), and the bins
+ * are not one sheet size. A part first tries every board already open; when none
+ * holds it, the LARGEST size (by length, then width; ties keep list order) that
+ * holds it alone is opened. A part no size holds is returned in `unplaceable`,
+ * never dropped. Choosing cheaper sizes afterwards is the caller's job.
+ */
+export function packOnto<B extends Bin>(
+  boards: Board[],
+  sizes: readonly B[],
+  kerf: number,
+  precision: number,
+): { bins: PackedBin<B>[]; unplaceable: Board[] } {
+  const sorted = [...boards].sort((a, b) => {
+    const fa = grainFootprint(a);
+    const fb = grainFootprint(b);
+    return fb.h - fa.h || fb.w - fa.w || a.id.localeCompare(b.id);
+  });
+  const open: { bin: B; sheet: WorkingSheet }[] = [];
+  const unplaceable: Board[] = [];
+  for (const board of sorted) {
+    const options = [grainFootprint(board)];
+    if (open.some((o) => placeOn(o.sheet, board, options, o.bin, kerf, precision))) continue;
+    let pick: B | null = null;
+    for (const s of sizes) {
+      if (!fits(options[0]!.w, s.length) || !fits(options[0]!.h, s.width)) continue;
+      if (!pick || s.length > pick.length || (s.length === pick.length && s.width > pick.width)) pick = s;
+    }
+    if (!pick) { unplaceable.push(board); continue; }
+    const sheet: WorkingSheet = { parts: [], shelves: [] };
+    placeOn(sheet, board, options, pick, kerf, precision);
+    open.push({ bin: pick, sheet });
+  }
+  return { bins: open.map((o) => ({ bin: o.bin, parts: o.sheet.parts })), unplaceable };
+}
```

- [ ] **Step 4: Run the new tests and every existing nesting test.** Run `npx vitest run src/document/nesting`. Expected: all PASS, with the existing ones unchanged.
- [ ] **Step 5: Mutate.** In `packOnto`, replace the size choice with `if (!pick) pick = s;` (the first that fits). Expected: FAIL in "opens the largest size…" and "fills open boards…". Restore it.
- [ ] **Step 6: Build and commit.**

```bash
git add src/document/nesting.ts src/document/nesting.packOnto.test.ts
git commit -m "feat(lumber): packOnto — the shelf packer for boards chosen as it goes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: What to buy — `document/purchase.ts`

**Files:**
- Create: `src/document/purchase.ts`
- Test: `src/document/purchase.test.ts`

**Interfaces:**
- Consumes:
  - `packOnto`, `grainFootprint`, `Nesting`, `PlacedPart` (Task 2)
  - `formatMoney` (Task 1)
  - `formatBoardFeet` and `INCHES_PER_BOARD_FOOT`
  - `CutList` from `cutlist.ts`
- Produces:
  - `StockBoard`, `MaterialBuying`, `ShopSettings`
  - `SHOP_LAYOUT`, `DEFAULT_WASTE_FACTOR`, `WASTE_FACTOR_MIN`, `WASTE_FACTOR_MAX`
  - `defaultBuying(material)`, `defaultShop()`
  - `validateShop(raw: unknown): { settings: ShopSettings; ok: boolean }`
  - `PurchaseEntry`
  - `Purchase { entries; total; totalLabel }`
  - `buildPurchase(doc: FlatDocument, list: CutList, shop: ShopSettings): Purchase`

- [ ] **Step 1: Write the failing tests.** Create `src/document/purchase.test.ts`:

```ts
import { createBoard, createDocument, buildCutList } from './document';
import type { Board, FlatDocument } from './types';
import { buildPurchase, defaultShop, validateShop, type MaterialBuying, type ShopSettings, type StockBoard } from './purchase';

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

describe('validateShop', () => {
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
```

- [ ] **Step 2: Confirm they fail.** Expected: FAIL (unresolved import).
- [ ] **Step 3: Implement.** Create `src/document/purchase.ts`:

```ts
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
export interface ShopSettings { layout: 1; materials: Record<string, MaterialBuying> }

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
  for (const m of Object.keys(MATERIALS)) {
    if (!(m in stored)) { materials[m] = defaultBuying(m); continue; }
    const v = validateBuying(m, stored[m]);
    if (!v) ok = false;
    materials[m] = v ?? defaultBuying(m);
  }
  return { settings: { layout: SHOP_LAYOUT, materials }, ok };
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
    const f = grainFootprint(part);
    const thick = thicknesses.filter((t) => t >= part.thickness - EPS);
    // The thinnest stock at least as thick as the part ON WHICH SOME SIZE HOLDS ITS FOOTPRINT (spec §3.2,
    // amended in the plan): a 10"-wide 3/4" shelf comes from 1x12 stock even when the 3/4" list stops at 1x8.
    const t = thick.find((th) => stock.some((s) => Math.abs(s.thickness - th) <= EPS && fitsIn(f, s)));
    if (t === undefined) {
      const reason = thick.length === 0 ? 'too thick'
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
  return { material, label, mode: 'piece', lines, notes, layouts, cost: used.length > 0 ? cost : 0, unplaceable };
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
  const unpriced = entries.filter((e) => e.cost === null).length;
  const unplaced = entries.reduce((n, e) => n + e.unplaceable, 0);
  const tail = [
    unpriced > 0 ? `(${unpriced} material${unpriced === 1 ? ' has' : 's have'} no price)` : '',
    unplaced > 0 ? `(${unplaced} part${unplaced === 1 ? '' : 's'} not placed)` : '',
  ].filter(Boolean).join(' ');
  const amount = entries.some((e) => e.cost !== null) ? formatMoney(total) : '—';
  return { entries, total, totalLabel: `Estimated materials: ${amount}${tail ? ` ${tail}` : ''}` };
}
```

- [ ] **Step 4: Confirm they pass.** Expected: PASS (15 tests).
- [ ] **Step 5: Mutate.** Run each mutation, confirm the named tests fail, then restore:
  - (a) Replace the swap-down choice with `const pick = bin.bin;`. Expected failures: the four swap-down and total tests.
  - (b) Pass `0` instead of `doc.stock.kerf` to `byThePiece`. Expected failure: "counts kerf between parts".
  - (c) Make the thickness choice consider only `thick[0]`. Expected failure: "goes to thicker stock…".
- [ ] **Step 6: Build and commit.**

```bash
git add src/document/purchase.ts src/document/purchase.test.ts
git commit -m "feat(lumber): buildPurchase — board feet, packed boards and sheets, priced

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Storage — `getShopSettings` / `setShopSettings`

**Files:**
- Modify: `src/storage/types.ts`, `src/storage/browser.ts`
- Test: `src/storage/browser.shop.test.ts`

**Interfaces:**
- Produces on `StorageAdapter`:
  - `getShopSettings(): Promise<{ settings: ShopSettings; readFailed: boolean }>`
  - `setShopSettings(s): Promise<boolean>`
- Exported: `SHOP_KEY = 'sloyd.shop.v1'`.

- [ ] **Step 1: Write the failing test.** Create `src/storage/browser.shop.test.ts`:

```ts
import { BrowserStorageAdapter, SHOP_KEY } from './browser';
import { defaultShop } from '../document/purchase';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  full = false;
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.get(k) ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) {
    if (this.full) throw Object.assign(new Error('QuotaExceededError'), { name: 'QuotaExceededError' });
    this.map.set(k, v);
  }
}

describe('shop settings storage', () => {
  it('reads defaults, unflagged, when nothing is stored', async () => {
    expect(await new BrowserStorageAdapter(new MemoryStorage()).getShopSettings()).toEqual({ settings: defaultShop(), readFailed: false });
  });

  it('round-trips what it stores', async () => {
    const a = new BrowserStorageAdapter(new MemoryStorage());
    const s = defaultShop();
    s.materials.oak = { mode: 'board-foot', pricePerBoardFoot: 7.25, wasteFactor: 1.5 };
    expect(await a.setShopSettings(s)).toBe(true);
    expect(await a.getShopSettings()).toEqual({ settings: s, readFailed: false });
  });

  it('reads unparseable or newer values as defaults, flagged, and never overwrites them', async () => {
    for (const raw of ['{not json', JSON.stringify({ layout: 2, materials: {} })]) {
      const store = new MemoryStorage();
      store.setItem(SHOP_KEY, raw);
      expect(await new BrowserStorageAdapter(store).getShopSettings()).toEqual({ settings: defaultShop(), readFailed: true });
      expect(store.getItem(SHOP_KEY)).toBe(raw);
    }
  });

  it('refuses to store when storage is full or missing', async () => {
    const store = new MemoryStorage();
    store.full = true;
    expect(await new BrowserStorageAdapter(store).setShopSettings(defaultShop())).toBe(false);
    expect(await new BrowserStorageAdapter(null).setShopSettings(defaultShop())).toBe(false);
    expect(await new BrowserStorageAdapter(null).getShopSettings()).toEqual({ settings: defaultShop(), readFailed: false });
  });
});
```

- [ ] **Step 2: Confirm it fails.**
- [ ] **Step 3: Implement.** Apply:

```diff
diff --git a/src/storage/browser.ts b/src/storage/browser.ts
index b3cbf9f..d4c598e 100644
--- a/src/storage/browser.ts
+++ b/src/storage/browser.ts
@@ -1,6 +1,7 @@
 import { DocumentError, createDocument, migrateDocument, nextId } from '../document/document';
 import type { SloydDocument } from '../document/document';
 import { derivedName } from '../document/names';
+import { defaultShop, validateShop, type ShopSettings } from '../document/purchase';
 import type { LibraryIndex, ProjectEntry } from './types';
 import type { LlmSettings, RecentEntry, StorageAdapter, StorageCapabilities } from './types';
 import { LAYOUT_VERSION, parseIndex, removeEntry, sortEntries, touchEntry } from './libraryIndex';
@@ -8,6 +9,8 @@ import { LAYOUT_VERSION, parseIndex, removeEntry, sortEntries, touchEntry } from
 export const AUTOSAVE_KEY = 'sloyd.autosave.v1';
 export const LIBRARY_KEY = 'sloyd.library.v1';
 export const LLM_KEY = 'sloyd.llm.v1';
+/** Browser-level lumber and price settings (lumber yield and cost spec §2). Never part of a project. */
+export const SHOP_KEY = 'sloyd.shop.v1';
 export const PROJECT_PREFIX = 'sloyd.project.';
 
 export class BrowserStorageAdapter implements StorageAdapter {
@@ -615,6 +618,29 @@ export class BrowserStorageAdapter implements StorageAdapter {
     }
   }
 
+  async getShopSettings(): Promise<{ settings: ShopSettings; readFailed: boolean }> {
+    const raw = this.store ? readRaw(this.store, SHOP_KEY) : null;
+    if (raw === null) return { settings: defaultShop(), readFailed: false };
+    let parsed: unknown = null;
+    try {
+      parsed = JSON.parse(raw);
+    } catch {
+      // unparseable reads as damaged: validateShop(null) gives defaults and the flag
+    }
+    const { settings, ok } = validateShop(parsed);
+    return { settings, readFailed: !ok };
+  }
+
+  async setShopSettings(settings: ShopSettings): Promise<boolean> {
+    if (!this.store) return false;
+    try {
+      this.store.setItem(SHOP_KEY, JSON.stringify(settings));
+      return true;
+    } catch {
+      return false;
+    }
+  }
+
   async clearLlmSettings(): Promise<void> {
     try {
       this.store?.removeItem(LLM_KEY);
diff --git a/src/storage/types.ts b/src/storage/types.ts
index b67a148..896e9e5 100644
--- a/src/storage/types.ts
+++ b/src/storage/types.ts
@@ -1,4 +1,5 @@
 import type { SloydDocument } from '../document/document';
+import type { ShopSettings } from '../document/purchase';
 
 export interface RecentEntry {
   id: string;
@@ -112,4 +113,12 @@ export interface StorageAdapter {
   setLlmSettings(settings: LlmSettings): Promise<boolean>;
   /** Forget the key. */
   clearLlmSettings(): Promise<void>;
+  /**
+   * The browser-level shop settings (lumber yield and cost spec §2). Never throws. Absent → defaults;
+   * unreadable, another layout or an invalid entry → defaults for what failed and `readFailed: true`.
+   * Reading NEVER writes: a value a newer build stored must survive a rollback.
+   */
+  getShopSettings(): Promise<{ settings: ShopSettings; readFailed: boolean }>;
+  /** Store the shop settings. False, changing nothing, when storage is unavailable or the write fails. */
+  setShopSettings(settings: ShopSettings): Promise<boolean>;
 }
```

- [ ] **Step 4: Confirm it passes.** Run `npx vitest run src/storage`. Expected: all PASS.
- [ ] **Step 5: Mutate.** Add `this.store?.setItem(SHOP_KEY, JSON.stringify(settings));` inside `getShopSettings`, just before its final return (a "repairing" read). Expected failure: "…never overwrites them". Restore it.
- [ ] **Step 6: Build and commit.** `npm run build` must pass. App does not call these methods yet.

```bash
git add src/storage/types.ts src/storage/browser.ts src/storage/browser.shop.test.ts
git commit -m "feat(lumber): shop settings through StorageAdapter, sloyd.shop.v1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Lumber & prices dialog

**Files:**
- Create: `src/panels/LumberPricesDialog.tsx`
- Test: `src/panels/LumberPricesDialog.test.tsx`

**Interfaces:**
- Consumes `ShopSettings`, `defaultBuying`, `DEFAULT_WASTE_FACTOR` and the waste-factor bounds (Task 3), plus `parseLength`/`formatLength`.
- Produces `LumberPricesDialog({ shop, readFailed, onSave: (s) => Promise<boolean>, onClose })`, with aria-label "Lumber and prices".

- [ ] **Step 1: Write the failing tests.** Create `src/panels/LumberPricesDialog.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LumberPricesDialog } from './LumberPricesDialog';
import { defaultShop, type ShopSettings } from '../document/purchase';

const setup = (over: Partial<{ readFailed: boolean; save: boolean }> = {}) => {
  const onSave = vi.fn(async (_s: ShopSettings) => over.save ?? true);
  const onClose = vi.fn();
  render(<LumberPricesDialog shop={defaultShop()} readFailed={over.readFailed ?? false} onSave={onSave} onClose={onClose} />);
  return { onSave, onClose };
};
const field = (name: string) => screen.getByRole('textbox', { name });
const saveBtn = () => screen.getByRole('button', { name: 'Save' });

describe('LumberPricesDialog', () => {
  it('saves an edited board-foot price and closes', async () => {
    const { onSave, onClose } = setup();
    fireEvent.change(field('Oak: price per board foot'), { target: { value: '8.50' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].materials.oak).toEqual({ mode: 'board-foot', pricePerBoardFoot: 8.5, wasteFactor: 1.3 });
  });

  it('refuses invalid input rather than clamping: Save is disabled while any field is bad', () => {
    setup();
    for (const v of ['-1', 'abc']) {
      fireEvent.change(field('Oak: price per board foot'), { target: { value: v } });
      expect(saveBtn()).toBeDisabled();
      expect(field('Oak: price per board foot')).toHaveAttribute('aria-invalid', 'true');
    }
    fireEvent.change(field('Oak: price per board foot'), { target: { value: '' } });
    fireEvent.change(field('Oak: waste factor'), { target: { value: '3.5' } });
    expect(saveBtn()).toBeDisabled();
    fireEvent.change(field('Oak: waste factor'), { target: { value: '3' } });
    expect(saveBtn()).toBeEnabled();
  });

  it('switches a material to by-the-piece, adds and removes sizes', async () => {
    const { onSave } = setup();
    fireEvent.change(screen.getByRole('combobox', { name: 'Oak: bought' }), { target: { value: 'piece' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add oak size' }));
    expect(saveBtn()).toBeDisabled(); // the new size has no width yet
    fireEvent.change(field('Oak size 1: width'), { target: { value: '5 1/2' } });
    fireEvent.change(field('Oak size 1: price'), { target: { value: '22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add oak size' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Oak size 2' }));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].materials.oak).toEqual({ mode: 'piece', stock: [
      { id: expect.any(String), thickness: 0.75, width: 5.5, length: 96, price: 22 },
    ] });
  });

  it('shows pine\'s default sizes, parses them back exactly, and resets one material', async () => {
    const { onSave } = setup();
    // Defaults run width-major: 1½×72, 1½×96, 2½×72, 2½×96, 3½×72, 3½×96, 5½×72 → size 7 is 5½ wide.
    expect(field('Pine size 7: width')).toHaveValue('5-1/2"');
    fireEvent.change(field('Pine size 1: price'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset pine to defaults' }));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].materials.pine).toEqual(defaultShop().materials.pine);
  });

  it('says when stored prices could not be read, and when saving fails', async () => {
    const { onClose } = setup({ readFailed: true, save: false });
    expect(screen.getByText(/could not be read; showing defaults/)).toBeInTheDocument();
    fireEvent.click(saveBtn());
    expect(await screen.findByText(/Could not save/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancels without saving', () => {
    const { onSave, onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Confirm they fail.**
- [ ] **Step 3: Implement.** Create `src/panels/LumberPricesDialog.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { MATERIALS, isSheetGood } from '../document/types';
import {
  defaultBuying, DEFAULT_WASTE_FACTOR, WASTE_FACTOR_MAX, WASTE_FACTOR_MIN,
  type MaterialBuying, type ShopSettings,
} from '../document/purchase';
import { formatLength, parseLength } from '../units/length';

interface Props {
  shop: ShopSettings;
  /** The stored value could not be read and defaults are showing (spec §2.2). */
  readFailed: boolean;
  /** Resolves false when the write failed; the dialog stays open and says so. */
  onSave: (s: ShopSettings) => Promise<boolean>;
  onClose: () => void;
}

/** Text drafts: a field may hold text that does not parse yet; Save stays off until every field does. */
type DraftSize = { id: string; thickness: string; width: string; length: string; price: string };
type Draft =
  | { mode: 'board-foot'; price: string; waste: string }
  | { mode: 'piece'; stock: DraftSize[] }
  | { mode: 'sheet'; price: string };

const PRICE_RE = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
const priceText = (v: number | null) => (v === null ? '' : String(v));
const lengthText = (v: number) => formatLength(v, 64);

function toDraft(b: MaterialBuying): Draft {
  if (b.mode === 'board-foot') return { mode: 'board-foot', price: priceText(b.pricePerBoardFoot), waste: String(b.wasteFactor) };
  if (b.mode === 'sheet') return { mode: 'sheet', price: priceText(b.pricePerSheet) };
  return { mode: 'piece', stock: b.stock.map((s) => ({ id: s.id, thickness: lengthText(s.thickness), width: lengthText(s.width), length: lengthText(s.length), price: priceText(s.price) })) };
}

/** A price: empty means "no price"; anything else must be a non-negative decimal. Refused, never clamped. */
function parsePrice(t: string): number | null | undefined {
  const s = t.trim();
  if (s === '') return null;
  return PRICE_RE.test(s) ? Number(s) : undefined;
}
function parseDim(t: string): number | undefined {
  const v = parseLength(t);
  return v !== null && v > 0 ? v : undefined;
}
function parseWaste(t: string): number | undefined {
  const v = Number(t.trim());
  return t.trim() !== '' && Number.isFinite(v) && v >= WASTE_FACTOR_MIN && v <= WASTE_FACTOR_MAX ? v : undefined;
}

/** The parsed entry, or undefined when any field is refused. */
function fromDraft(d: Draft): MaterialBuying | undefined {
  if (d.mode === 'board-foot') {
    const price = parsePrice(d.price);
    const waste = parseWaste(d.waste);
    return price === undefined || waste === undefined ? undefined : { mode: 'board-foot', pricePerBoardFoot: price, wasteFactor: waste };
  }
  if (d.mode === 'sheet') {
    const price = parsePrice(d.price);
    return price === undefined ? undefined : { mode: 'sheet', pricePerSheet: price };
  }
  const stock = d.stock.map((s) => ({ id: s.id, thickness: parseDim(s.thickness), width: parseDim(s.width), length: parseDim(s.length), price: parsePrice(s.price) }));
  if (stock.some((s) => s.thickness === undefined || s.width === undefined || s.length === undefined || s.price === undefined)) return undefined;
  return { mode: 'piece', stock: stock as { id: string; thickness: number; width: number; length: number; price: number | null }[] };
}

/**
 * Lumber & prices (lumber yield and cost spec §2.3). Browser-level settings, not the project: Save writes
 * through StorageAdapter, Cancel discards, nothing is undoable. The SettingsDialog modal pattern; its own
 * Escape listener closes it (it renders above the cut list, which ignores Escape while it is open).
 */
export function LumberPricesDialog({ shop, readFailed, onSave, onClose }: Props) {
  const sheet = useRef<HTMLDivElement>(null);
  const keys = Object.keys(MATERIALS);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(keys.map((m) => [m, toDraft(shop.materials[m] ?? defaultBuying(m))])));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nextId = useRef(0);

  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const parsed = Object.fromEntries(keys.map((m) => [m, fromDraft(drafts[m]!)]));
  const valid = keys.every((m) => parsed[m] !== undefined);
  const set = (m: string, d: Draft) => setDrafts((all) => ({ ...all, [m]: d }));
  const setSize = (m: string, i: number, field: keyof DraftSize, value: string) => {
    const d = drafts[m] as Extract<Draft, { mode: 'piece' }>;
    set(m, { ...d, stock: d.stock.map((s, j) => (j === i ? { ...s, [field]: value } : s)) });
  };
  const freshId = (d: Extract<Draft, { mode: 'piece' }>) => {
    let id = '';
    while (!id || d.stock.some((s) => s.id === id)) id = `new${nextId.current++}`;
    return id;
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    const ok = await onSave({ layout: 1, materials: parsed as Record<string, MaterialBuying> });
    setSaving(false);
    if (ok) onClose();
    else setError('Could not save: this browser is not letting Sloyd store settings.');
  };

  const bad = (ok: boolean) => (ok ? undefined : true);
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Lumber and prices">
      <div className="modal-sheet lumber-sheet" ref={sheet} tabIndex={-1}>
        <h2>Lumber &amp; prices</h2>
        <p className="modal-note">Stored in this browser, for every project. Leave a price empty if you don't know it.</p>
        {readFailed && <p className="field-error" role="status">Saved prices could not be read; showing defaults. Saving will replace them.</p>}
        {keys.map((m) => {
          const d = drafts[m]!;
          const label = MATERIALS[m]!.label;
          return (
            <fieldset className="lumber-material" key={m}>
              <legend>{label}</legend>
              {!isSheetGood(m) && (
                <label>
                  Bought
                  <select className="input" aria-label={`${label}: bought`} value={d.mode}
                    onChange={(e) => set(m, e.target.value === 'piece'
                      ? { mode: 'piece', stock: d.mode === 'piece' ? d.stock : [] }
                      : { mode: 'board-foot', price: '', waste: String(DEFAULT_WASTE_FACTOR) })}>
                    <option value="board-foot">By the board foot</option>
                    <option value="piece">By the piece</option>
                  </select>
                </label>
              )}
              {d.mode === 'board-foot' && (
                <>
                  <label>Price per bd ft ($)
                    <input className="input" aria-label={`${label}: price per board foot`} value={d.price}
                      aria-invalid={bad(parsePrice(d.price) !== undefined)} onChange={(e) => set(m, { ...d, price: e.target.value })} />
                  </label>
                  <label>Waste factor
                    <input className="input" aria-label={`${label}: waste factor`} value={d.waste}
                      aria-invalid={bad(parseWaste(d.waste) !== undefined)} onChange={(e) => set(m, { ...d, waste: e.target.value })} />
                  </label>
                </>
              )}
              {d.mode === 'sheet' && (
                <label>Price per sheet ($)
                  <input className="input" aria-label={`${label}: price per sheet`} value={d.price}
                    aria-invalid={bad(parsePrice(d.price) !== undefined)} onChange={(e) => set(m, { ...d, price: e.target.value })} />
                </label>
              )}
              {d.mode === 'piece' && (
                <ul className="lumber-sizes">
                  {d.stock.map((s, i) => (
                    <li key={s.id}>
                      {(['thickness', 'width', 'length'] as const).map((f) => (
                        <input key={f} className="input" aria-label={`${label} size ${i + 1}: ${f}`} value={s[f]}
                          aria-invalid={bad(parseDim(s[f]) !== undefined)} onChange={(e) => setSize(m, i, f, e.target.value)} />
                      ))}
                      <input className="input" aria-label={`${label} size ${i + 1}: price`} value={s.price}
                        aria-invalid={bad(parsePrice(s.price) !== undefined)} onChange={(e) => setSize(m, i, 'price', e.target.value)} />
                      <button aria-label={`Remove ${label} size ${i + 1}`}
                        onClick={() => set(m, { ...d, stock: d.stock.filter((_, j) => j !== i) })}>✕</button>
                    </li>
                  ))}
                  <li>
                    <button onClick={() => set(m, { ...d, stock: [...d.stock, { id: freshId(d), thickness: '3/4', width: '', length: '96', price: '' }] })}>
                      Add {label.toLowerCase()} size
                    </button>
                  </li>
                </ul>
              )}
              <button className="lumber-reset" onClick={() => set(m, toDraft(defaultBuying(m)))}>Reset {label.toLowerCase()} to defaults</button>
            </fieldset>
          );
        })}
        {!valid && <p className="field-error" role="status">Fix the highlighted fields: prices are dollars (or empty), sizes are positive lengths, waste factor is {WASTE_FACTOR_MIN}–{WASTE_FACTOR_MAX}.</p>}
        {error && <p className="field-error" role="status">{error}</p>}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={!valid || saving} onClick={() => void save()}>Save</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Confirm they pass.** Expected: PASS (6 tests).
- [ ] **Step 5: Mutate.** Change `PRICE_RE` to `/.*/`. Expected failure: "refuses invalid input…". Restore it.
- [ ] **Step 6: Build and commit.**

```bash
git add src/panels/LumberPricesDialog.tsx src/panels/LumberPricesDialog.test.tsx
git commit -m "feat(lumber): the Lumber & prices dialog

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The Buying section, App wiring, the Settings link, styles

**Files:**
- Modify:
  - `src/panels/SheetLayout.tsx` (a `noun` prop)
  - `src/panels/CutList.tsx` (Buying section, `shop`/`onOpenPrices`/`suspended` props, "Layouts")
  - `src/panels/SettingsDialog.tsx` (an `onOpenPrices` link)
  - `src/App.tsx` (shop state, the `'prices'` dialog, focus return)
  - `src/styles.css`
- Test: `src/panels/CutList.test.tsx`, `src/App.test.tsx`

**Interfaces:** Consumes Tasks 3–5.

- [ ] **Step 1: Write the failing tests.** Apply this diff to the two test files.
  - The App mock gains `getShopSettings`/`setShopSettings`, and two App tests are added.
  - CutList gains a Buying describe block.
  - One existing CutList test is scoped to `.cutlist-names`, because the Buying section also names that part in a planing note. Its assertion is unchanged.

```diff
diff --git a/src/App.test.tsx b/src/App.test.tsx
index ed8570b..3aa4245 100644
--- a/src/App.test.tsx
+++ b/src/App.test.tsx
@@ -239,6 +239,9 @@ let llmSettings: import('./storage/types').LlmSettings | null = null;
 const getLlmSettings = vi.fn(async () => llmSettings);
 const setLlmSettings = vi.fn(async (s: import('./storage/types').LlmSettings) => { llmSettings = s; return true; });
 const clearLlmSettings = vi.fn(async () => { llmSettings = null; });
+let shopSettings: import('./document/purchase').ShopSettings | null = null;
+const getShopSettings = vi.fn(async () => ({ settings: shopSettings ?? (await import('./document/purchase')).defaultShop(), readFailed: false }));
+const setShopSettings = vi.fn(async (s: import('./document/purchase').ShopSettings) => { shopSettings = s; return true; });
 const exportProject = vi.fn().mockResolvedValue(undefined);
 const importProject = vi.fn();
 
@@ -260,6 +263,8 @@ vi.mock('./storage/browser', () => ({
     getLlmSettings: () => getLlmSettings(),
     setLlmSettings: (s: import('./storage/types').LlmSettings) => setLlmSettings(s),
     clearLlmSettings: () => clearLlmSettings(),
+    getShopSettings: () => getShopSettings(),
+    setShopSettings: (s: import('./document/purchase').ShopSettings) => setShopSettings(s),
     exportProject: (...args: unknown[]) => exportProject(...args),
     importProject: (...args: unknown[]) => importProject(...args),
     listRecent: () => Promise.resolve([]),
@@ -888,6 +893,39 @@ const mountWithOneBoard = async () => {
   return worldParts(useStore.getState().doc)[0].id;
 };
 
+describe('Lumber & prices (lumber yield and cost spec §2.3, §4)', () => {
+  beforeEach(() => { shopSettings = null; });
+
+  it('opens above the cut list, saves a price the Buying section uses, and returns focus', async () => {
+    // The default board is pine 24 × 5½ × ¾; default pine sizes carry no price, so the smallest that holds it
+    // is chosen: ¾ × 5½ × 72 (size 7 in the default list: widths 1½,2½,3½ × 72/96, then 5½ × 72).
+    await mountWithOneBoard();
+    const user = userEvent.setup();
+    await user.click(screen.getByRole('button', { name: 'Cut list' }));
+    expect(screen.getByText('Buy 1 × 3/4" × 5-1/2" × 72" · no price')).toBeInTheDocument();
+    const open = screen.getByRole('button', { name: 'Lumber & prices…' });
+    await user.click(open);
+    expect(screen.getByRole('dialog', { name: 'Lumber and prices' })).toBeInTheDocument();
+    expect(screen.getByRole('dialog', { name: 'Cut list' }).hasAttribute('inert')).toBe(true);
+    fireEvent.change(screen.getByRole('textbox', { name: 'Pine size 7: price' }), { target: { value: '9' } });
+    await user.click(screen.getByRole('button', { name: 'Save' }));
+    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Lumber and prices' })).toBeNull());
+    expect(setShopSettings).toHaveBeenCalled();
+    expect(screen.getByText('Buy 1 × 3/4" × 5-1/2" × 72" · $9.00')).toBeInTheDocument();
+    expect(document.activeElement).toBe(open);
+  });
+
+  it('Escape closes the prices dialog but leaves the cut list open', async () => {
+    await mountWithOneBoard();
+    const user = userEvent.setup();
+    await user.click(screen.getByRole('button', { name: 'Cut list' }));
+    await user.click(screen.getByRole('button', { name: 'Lumber & prices…' }));
+    await user.keyboard('{Escape}');
+    expect(screen.queryByRole('dialog', { name: 'Lumber and prices' })).toBeNull();
+    expect(screen.getByRole('dialog', { name: 'Cut list' })).toBeInTheDocument();
+  });
+});
+
 describe('App keyboard delete', () => {
   it('deletes the selected board on Delete', async () => {
     const id = await mountWithOneBoard();
diff --git a/src/panels/CutList.test.tsx b/src/panels/CutList.test.tsx
index e87bcb4..46ecd79 100644
--- a/src/panels/CutList.test.tsx
+++ b/src/panels/CutList.test.tsx
@@ -1,10 +1,11 @@
-import { render, screen } from '@testing-library/react';
+import { render, screen, within } from '@testing-library/react';
 import userEvent from '@testing-library/user-event';
 import { useStore } from '../store/store';
 import { createBoard, createDocument } from '../document/document';
 import type { Board } from '../document/document';
 import { assemblyDoc } from '../document/treeFixtures';
 import { CutList } from './CutList';
+import { defaultShop, type ShopSettings } from '../document/purchase';
 
 const load = (...boards: Partial<Board>[]) =>
   useStore.getState().replaceDocument({
@@ -18,7 +19,8 @@ describe('CutList', () => {
   it('names parts inside assemblies by their display path (assemblies spec §6)', () => {
     useStore.getState().replaceDocument(assemblyDoc());
     render(<CutList onClose={() => {}} />);
-    expect(screen.getByText(/Drawer › Peg › Pin/)).toBeInTheDocument();
+    // Scoped to the row names: the Buying section below also names the part (a planing note).
+    expect(screen.getByText(/Drawer › Peg › Pin/, { selector: '.cutlist-names' })).toBeInTheDocument();
   });
 
   it('says so when there are no parts', () => {
@@ -147,4 +149,43 @@ describe('CutList', () => {
     expect(container.querySelector('.cutlist-subtotal .cutlist-stock')?.textContent)
       .toBe('2.05 bd ft');
   });
+
+  describe('Buying (lumber yield and cost spec §4)', () => {
+    const shop = (): ShopSettings => {
+      const s = defaultShop();
+      s.materials.oak = { mode: 'board-foot', pricePerBoardFoot: 10, wasteFactor: 1.3 };
+      s.materials.pine = { mode: 'piece', stock: [{ id: 'A', thickness: 0.75, width: 5.5, length: 96, price: 12 }] };
+      return s;
+    };
+
+    it('lists what to buy per material and an exact total', () => {
+      // Oak 48 × 6 × ¾ = 1.5 bd ft × 1.3 = 1.95 × $10 = $19.50. Pine 30 × 5 × ¾ on one A board = $12. Total $31.50.
+      load({ name: 'Top', material: 'oak', thickness: 0.75, length: 48, width: 6 },
+           { name: 'Rail', material: 'pine', thickness: 0.75, length: 30, width: 5 });
+      render(<CutList onClose={() => {}} shop={shop()} />);
+      const buying = screen.getByRole('region', { name: 'Buying' });
+      expect(within(buying).getByText('Oak — 3/4": buy 1.95 bd ft (1.50 bd ft net × 1.3) · $19.50')).toBeInTheDocument();
+      expect(within(buying).getByText('Buy 1 × 3/4" × 5-1/2" × 96" · $12.00')).toBeInTheDocument();
+      expect(within(buying).getByText('Estimated materials: $31.50')).toBeInTheDocument();
+      expect(within(buying).getByRole('img', { name: '3/4" × 5-1/2" × 96" — board 1, 1 part' })).toBeInTheDocument();
+    });
+
+    it('hides the board layouts with the Layouts toggle', async () => {
+      load({ name: 'Rail', material: 'pine', thickness: 0.75, length: 30, width: 5 });
+      render(<CutList onClose={() => {}} shop={shop()} />);
+      await userEvent.click(screen.getByRole('checkbox', { name: 'Layouts' }));
+      expect(screen.queryByRole('img', { name: /board 1/ })).toBeNull();
+    });
+
+    it('offers the prices dialog, and leaves Escape to it while suspended', async () => {
+      const onOpenPrices = vi.fn();
+      let closed = false;
+      const { rerender } = render(<CutList onClose={() => { closed = true; }} onOpenPrices={onOpenPrices} />);
+      await userEvent.click(screen.getByRole('button', { name: 'Lumber & prices…' }));
+      expect(onOpenPrices).toHaveBeenCalled();
+      rerender(<CutList onClose={() => { closed = true; }} onOpenPrices={onOpenPrices} suspended />);
+      await userEvent.keyboard('{Escape}');
+      expect(closed).toBe(false);
+    });
+  });
 });
```

- [ ] **Step 2: Confirm they fail.** Run `npx vitest run src/panels/CutList.test.tsx src/App.test.tsx`.
- [ ] **Step 3: Implement.** Apply:

```diff
diff --git a/src/App.tsx b/src/App.tsx
index 955986b..4a071bf 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -12,6 +12,8 @@ import { PlansSheet } from './panels/PlansSheet';
 import { TapeReadout } from './panels/TapeReadout';
 import { GenerateDialog } from './panels/GenerateDialog';
 import { SettingsDialog } from './panels/SettingsDialog';
+import { LumberPricesDialog } from './panels/LumberPricesDialog';
+import { defaultShop, type ShopSettings } from './document/purchase';
 import { useGenerations } from './useGenerations';
 import { useJoinery } from './useJoinery';
 import { JoineryDialog } from './panels/JoineryDialog';
@@ -77,7 +79,7 @@ export default function App() {
   // and buttons hold focus too, and `inert` cannot reach a window listener:
   // `m`, Backspace or Ctrl+Z pressed there would arm Move, delete the
   // selected board, or undo, behind the dialog.
-  const [dialog, setDialog] = useState<'generate' | 'settings' | 'joinery' | 'refine' | null>(null);
+  const [dialog, setDialog] = useState<'generate' | 'settings' | 'joinery' | 'refine' | 'prices' | null>(null);
   // Joinery reads the FLAT design (assemblies spec §10): the tree document's own
   // `boards` hold only the root parts, so a grouped design would show no sites.
   const joinerySites = useMemo(() => {
@@ -94,6 +96,10 @@ export default function App() {
   // left reading only the old flag.
   const modalOpen = cutListOpen || plansOpen || dialog !== null;
   const [llmSettings, setLlmSettingsState] = useState<LlmSettings | null>(null);
+  // The browser-level lumber and price settings (lumber yield and cost spec §2): read once, replaced on a
+  // successful save. Not document state — never on the undo stack, never exported with a project.
+  const [shop, setShop] = useState<ShopSettings>(defaultShop);
+  const [shopReadFailed, setShopReadFailed] = useState(false);
   // Generated this session and not yet opened (spec §6.3). Session-only:
   // not persisted and not in the store — a badge is a property of this
   // sitting, and nothing about it belongs on the undo stack.
@@ -149,6 +155,10 @@ export default function App() {
   );
   useEffect(() => {
     void storage.getLlmSettings().then(setLlmSettingsState);
+    void storage.getShopSettings().then(({ settings, readFailed }) => {
+      setShop(settings);
+      setShopReadFailed(readFailed);
+    });
   }, []);
   // Where focus was when the sheet or a dialog opened, so closing it puts
   // focus back. Captured HERE, in each opener, rather than in CutList's or a
@@ -156,6 +166,15 @@ export default function App() {
   // blurs whatever was focused behind the scrim, so by the time the modal
   // mounts the opener is already gone from `document.activeElement`.
   const opener = useRef<HTMLElement | null>(null);
+  // The prices dialog can open ABOVE the cut list, where `modalOpen` stays true throughout, so the
+  // modalOpen-keyed focus return below never fires for it. It gets its own return trip.
+  const pricesOpener = useRef<HTMLElement | null>(null);
+  useEffect(() => {
+    if (dialog !== null || !pricesOpener.current) return;
+    const back = pricesOpener.current;
+    pricesOpener.current = null;
+    back.focus();
+  }, [dialog]);
   const restored = useRef(false);
   const [activeId, setActiveId] = useState('');
   // False when adoption failed (spec §2.2). The session runs the legacy
@@ -954,7 +973,17 @@ export default function App() {
           </aside>
         </main>
       </div>
-      {cutListOpen && <CutList onClose={() => setCutListOpen(false)} />}
+      {cutListOpen && (
+        <CutList
+          onClose={() => setCutListOpen(false)}
+          shop={shop}
+          suspended={dialog !== null}
+          onOpenPrices={() => {
+            pricesOpener.current = document.activeElement as HTMLElement | null;
+            setDialog('prices');
+          }}
+        />
+      )}
       {plansOpen && <PlansSheet onClose={() => setPlansOpen(false)} />}
       {/*
         The two dialogs sit beside CutList, outside `.app-shell`, for the same
@@ -980,6 +1009,22 @@ export default function App() {
             setDialog(null);
           }}
           onClose={() => setDialog(null)}
+          onOpenPrices={() => setDialog('prices')}
+        />
+      )}
+      {dialog === 'prices' && (
+        <LumberPricesDialog
+          shop={shop}
+          readFailed={shopReadFailed}
+          onSave={async (s) => {
+            const ok = await storage.setShopSettings(s);
+            if (ok) {
+              setShop(s);
+              setShopReadFailed(false);
+            }
+            return ok;
+          }}
+          onClose={() => setDialog(null)}
         />
       )}
       {dialog === 'generate' && (
diff --git a/src/panels/CutList.tsx b/src/panels/CutList.tsx
index cd7bdbf..bd0f224 100644
--- a/src/panels/CutList.tsx
+++ b/src/panels/CutList.tsx
@@ -3,6 +3,9 @@ import { useStore } from '../store/store';
 import { buildCutList, flatDocument, sheetStockOf } from '../document/document';
 import { PartDiagram } from './PartDiagram';
 import { SheetLayout } from './SheetLayout';
+import { buildPurchase, defaultShop, type ShopSettings } from '../document/purchase';
+
+const DEFAULT_SHOP = defaultShop();
 
 /**
  * Which rows get drawn. LOCAL VIEW STATE, deliberately not in the store: it is
@@ -27,11 +30,20 @@ type DiagramMode = 'none' | 'joinery' | 'all';
  * arrangement is taking focus on mount, since focus is otherwise left on a
  * button that has just become unfocusable.
  */
-export function CutList({ onClose }: { onClose: () => void }) {
+export function CutList({ onClose, shop = DEFAULT_SHOP, onOpenPrices, suspended = false }: {
+  onClose: () => void;
+  /** The browser-level lumber and price settings (lumber yield and cost spec §2); App reads them. */
+  shop?: ShopSettings;
+  /** Opens the Lumber & prices dialog above this sheet; the button is absent without it. */
+  onOpenPrices?: () => void;
+  /** True while a dialog is open above the sheet: Escape belongs to it, and the sheet is inert. */
+  suspended?: boolean;
+}) {
   const doc = useStore((s) => s.doc);
   // The flat document: placed parts named by their display paths (assemblies spec §6).
   const flat = flatDocument(doc);
   const list = buildCutList(flat);
+  const purchase = buildPurchase(flat, list, shop);
   const sheet = useRef<HTMLDivElement>(null);
   const [diagrams, setDiagrams] = useState<DiagramMode>('joinery');
   /**
@@ -52,14 +64,14 @@ export function CutList({ onClose }: { onClose: () => void }) {
 
   useEffect(() => {
     const onKey = (e: KeyboardEvent) => {
-      if (e.key === 'Escape') onClose();
+      if (e.key === 'Escape' && !suspended) onClose();
     };
     window.addEventListener('keydown', onKey);
     return () => window.removeEventListener('keydown', onKey);
-  }, [onClose]);
+  }, [onClose, suspended]);
 
   return (
-    <div className="cutlist-overlay" role="dialog" aria-modal="true" aria-label="Cut list">
+    <div className="cutlist-overlay" role="dialog" aria-modal="true" aria-label="Cut list" inert={suspended}>
       <div className="cutlist-sheet" ref={sheet} tabIndex={-1}>
         <header className="cutlist-head">
           <h2>Cut list — {doc.name}</h2>
@@ -82,8 +94,9 @@ export function CutList({ onClose }: { onClose: () => void }) {
                 checked={layouts}
                 onChange={(e) => setLayouts(e.target.checked)}
               />
-              Sheet layouts
+              Layouts
             </label>
+            {onOpenPrices && <button onClick={onOpenPrices}>Lumber &amp; prices…</button>}
             <button onClick={() => window.print()}>Print</button>
             <button onClick={onClose} aria-label="Close cut list">✕</button>
           </div>
@@ -146,6 +159,21 @@ export function CutList({ onClose }: { onClose: () => void }) {
             </section>
           ))
         )}
+
+        {purchase.entries.length > 0 && (
+          <section className="cutlist-buying" aria-label="Buying">
+            <h3>Buying</h3>
+            {purchase.entries.map((e) => (
+              <div className="cutlist-buying-entry" key={e.material}>
+                <h4>{e.label}</h4>
+                {e.lines.map((line, i) => <p className="cutlist-buying-line" key={`l${i}`}>{line}</p>)}
+                {e.notes.map((note, i) => <p className="cutlist-buying-note" key={`n${i}`}>{note}</p>)}
+                {layouts && e.layouts.map((l) => <SheetLayout key={l.key} nesting={l.nesting} stock={l.stock} noun={l.title} />)}
+              </div>
+            ))}
+            <p className="cutlist-buying-total">{purchase.totalLabel}</p>
+          </section>
+        )}
       </div>
     </div>
   );
diff --git a/src/panels/SettingsDialog.tsx b/src/panels/SettingsDialog.tsx
index 255b6d5..0297f6b 100644
--- a/src/panels/SettingsDialog.tsx
+++ b/src/panels/SettingsDialog.tsx
@@ -10,6 +10,8 @@ interface Props {
   onClose: () => void;
   /** One free API call that says whether a key works (App passes checkAnthropicKey). */
   checkKey: (apiKey: string) => Promise<KeyCheck>;
+  /** Switches to the Lumber & prices dialog (lumber yield and cost spec §2.3); the link is absent without it. */
+  onOpenPrices?: () => void;
 }
 
 /**
@@ -25,7 +27,7 @@ const NOT_A_KEY = /[^\x21-\x7e]/;
  * `.app-shell` inert while this is open, this takes focus on mount, and its
  * own Escape listener closes it.
  */
-export function SettingsDialog({ settings, onSave, onForget, onClose, checkKey }: Props) {
+export function SettingsDialog({ settings, onSave, onForget, onClose, checkKey, onOpenPrices }: Props) {
   const sheet = useRef<HTMLDivElement>(null);
   const known = CLAUDE_MODELS.some((m) => m.id === settings?.model);
   const [apiKey, setApiKey] = useState('');
@@ -100,6 +102,11 @@ export function SettingsDialog({ settings, onSave, onForget, onClose, checkKey }
         <p className="modal-note">Stored in this browser only. Anyone with access to this browser profile can read it.</p>
         {error && <p className="field-error" role="status">{error}</p>}
         {note && <p className="modal-note" role="status">{note}</p>}
+        {onOpenPrices && (
+          <p className="modal-note">
+            <button className="link-button" onClick={onOpenPrices}>Lumber &amp; prices…</button> — what you pay for lumber, for the cut list's Buying section.
+          </p>
+        )}
         <div className="modal-actions">
           {settings && <button onClick={() => void onForget()}>Forget key</button>}
           <button onClick={onClose}>Cancel</button>
diff --git a/src/panels/SheetLayout.tsx b/src/panels/SheetLayout.tsx
index c5fa07a..40174b0 100644
--- a/src/panels/SheetLayout.tsx
+++ b/src/panels/SheetLayout.tsx
@@ -34,7 +34,7 @@ export const PAD = 6;
  * diagram hatch — so they survive printing with Chrome's "Background graphics"
  * off. A CSS background would not.
  */
-function Sheet({ sheet, stock, index }: { sheet: NestedSheet; stock: SheetStock; index: number }) {
+function Sheet({ sheet, stock, index, noun }: { sheet: NestedSheet; stock: SheetStock; index: number; noun: string }) {
   const s = DRAW_WIDTH / stock.length;
   const h = stock.width * s;
 
@@ -47,12 +47,12 @@ function Sheet({ sheet, stock, index }: { sheet: NestedSheet; stock: SheetStock;
 
   return (
     <figure className="cutlist-layout">
-      <figcaption className="cutlist-layout-head">Sheet {index + 1}</figcaption>
+      <figcaption className="cutlist-layout-head">{noun} {index + 1}</figcaption>
       <svg
         viewBox={`0 0 ${DRAW_WIDTH} ${h}`}
         fontSize={LABEL_SIZE}
         role="img"
-        aria-label={`Sheet ${index + 1}, ${sheet.parts.length} part${sheet.parts.length === 1 ? '' : 's'}`}
+        aria-label={`${noun} ${index + 1}, ${sheet.parts.length} part${sheet.parts.length === 1 ? '' : 's'}`}
       >
         <rect className="cutlist-layout-sheet" x={0} y={0} width={DRAW_WIDTH} height={h} />
         {sheet.parts.map((p) => {
@@ -108,11 +108,15 @@ function Sheet({ sheet, stock, index }: { sheet: NestedSheet; stock: SheetStock;
   );
 }
 
-export function SheetLayout({ nesting, stock }: { nesting: Nesting; stock: SheetStock }) {
+/**
+ * `noun` names each drawing: `Sheet 1` for sheet goods; the by-the-piece Buying section passes the stock
+ * size, e.g. `3/4" × 5-1/2" × 96" — board`, so a board strip reads as what it is (lumber yield spec §4).
+ */
+export function SheetLayout({ nesting, stock, noun = 'Sheet' }: { nesting: Nesting; stock: SheetStock; noun?: string }) {
   return (
     <>
       {nesting.sheets.map((sheet, i) => (
-        <Sheet key={i} sheet={sheet} stock={stock} index={i} />
+        <Sheet key={i} sheet={sheet} stock={stock} index={i} noun={noun} />
       ))}
     </>
   );
diff --git a/src/styles.css b/src/styles.css
index 4703af3..9747f57 100644
--- a/src/styles.css
+++ b/src/styles.css
@@ -1224,6 +1224,28 @@ select.input { cursor: pointer; }
   list-style: none;
 }
 
+/* The cut list's Buying section (lumber yield and cost spec §4). */
+.cutlist-buying { margin-top: 28px; padding-top: 12px; border-top: 2px solid var(--rule-strong); }
+.cutlist-buying h3 { margin: 0 0 8px; }
+.cutlist-buying-entry { margin: 12px 0; break-inside: avoid; }
+.cutlist-buying-entry h4 { margin: 0 0 4px; }
+.cutlist-buying-line { margin: 2px 0; font-variant-numeric: tabular-nums; }
+.cutlist-buying-note { margin: 2px 0; color: var(--ink-dim); }
+.cutlist-buying-total { margin: 16px 0 0; font-weight: 600; font-variant-numeric: tabular-nums; }
+
+/* Lumber & prices (spec §2.3): the one dialog that scrolls — fourteen pine sizes do not fit a screen. */
+.lumber-sheet { width: min(720px, 100%); max-height: calc(100vh - 48px); overflow-y: auto; }
+.lumber-material { margin: 12px 0; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 6px; }
+.lumber-material legend { padding: 0 4px; font-weight: 600; }
+.lumber-material label { display: inline-flex; align-items: center; gap: 6px; margin: 4px 12px 4px 0; }
+.lumber-material input.input { width: 7em; }
+.lumber-sizes { list-style: none; margin: 4px 0; padding: 0; }
+.lumber-sizes li { display: flex; gap: 6px; align-items: center; margin: 4px 0; }
+.lumber-sizes input.input { width: 6em; }
+.lumber-material input[aria-invalid='true'] { border-color: var(--alert); }
+.lumber-reset { margin-top: 6px; }
+.link-button { padding: 0; border: 0; background: none; color: inherit; text-decoration: underline; cursor: pointer; }
+
 @media print {
   /* The overlay is a direct child of `.app` — see CutList.tsx. */
   .app > *:not(.cutlist-overlay) { display: none !important; }
@@ -1291,6 +1313,7 @@ select.input { cursor: pointer; }
      alone is not enough wherever a more specific selector also sets color;
      this rule has to match that specificity to win. */
   .cutlist-subtotal .cutlist-stock { color: #000; }
+  .cutlist-buying-line, .cutlist-buying-note, .cutlist-buying-total { color: #000; }
 
   /* Follow-ups 58 and 81 are the SAME defect: an enumerated single-class
      override outranked by a MORE SPECIFIC screen rule. That contest does not
```

- [ ] **Step 4: Run the panel and App tests.** Run `npx vitest run src/panels src/App.test.tsx`. Expected: all PASS.
- [ ] **Step 5: Mutate.** Run each mutation, confirm the named tests fail, then restore:
  - (a) Remove `suspended={dialog !== null}` from App's `<CutList>`. Expected failures: both App "Lumber & prices" tests.
  - (b) Replace `back.focus();` in the prices-opener effect with `void back;`. Expected failure: "…returns focus".
- [ ] **Step 6: Full suite, build, commit.** Run `npm run build && npx vitest run`. Expected: 3038 tests across 113 files, all passing.

```bash
git add src/panels/SheetLayout.tsx src/panels/CutList.tsx src/panels/CutList.test.tsx src/panels/SettingsDialog.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat(lumber): the Buying section, Lumber & prices wiring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Browser pass on the dev server (controller-run)

**Files:** Create `docs/browser-verification-lumber-yield-cost.md`.

- **Setup:**
  - Start the dev server on a FRESH port (e.g. `--port 5182`), so no earlier projects are on that origin.
  - Note the `localStorage` keys at the start.
  - Import the cabinet fixture and a pine project through the project menu.
- **Check on screen:**
  - **Cut list with no prices:** quantities show and the total reads "—".
  - **Lumber & prices**, opened from the cut list and from Settings:
    - enter prices for pine, oak and plywood;
    - switch oak to by-the-piece and back;
    - add and remove a size;
    - invalid input is refused;
    - Escape closes only the dialog;
    - focus returns to the button;
    - the Buying lines and total update.
  - **Board layouts** draw as labelled strips.
- **Check in print emulation:** the Buying section prints in black, and the button is hidden.
- **Cleanup:** remove ONLY the keys this check created, `sloyd.shop.v1` included. Use a same-origin blank page (`page.route`), not `localStorage.clear()` (the dev-browser memory rule).
- **Record** what was checked and what could not be: a real print, and real prices.

---

### Task 8: Record the round

**Files:** `docs/follow-ups.md`, `docs/history.md`, `CLAUDE.md`, `docs/feature-gaps.md`, README (test count), and the spec's status line.

- **Follow-ups**, continuing after 264, one each for the spec §7 items:
  - per-project price overrides
  - custom materials and nominal names
  - edge banding
  - a hardware bill of materials
  - glue-ups
  - an optimal packer
  - other currencies
  - rough thickness classes

  Add any browser-pass findings that weren't fixed.
- **`docs/history.md`:** the round narrative and the planning amendments.
- **`CLAUDE.md`:**
  - a "lumber yield & cost" row in Rounds shipped;
  - the Status line;
  - the new files in Where things live: `purchase.ts`, `LumberPricesDialog.tsx`, and `SHOP_KEY` in storage;
  - the test count.
- **`docs/feature-gaps.md`:** set "Solid-lumber yield" and "Cost" to "merged, not deployed".
- **The spec's status line:** "implemented".
- **Last:** run `npm run build && npx vitest run` and commit with the subject `docs: record the lumber yield and cost round`.

Deploying is NOT part of this plan. It is a separate step the user approves (`DEPLOYMENT.local.md`).
