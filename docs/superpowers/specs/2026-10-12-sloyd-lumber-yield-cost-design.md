# Sloyd — solid-lumber yield and cost

**Date:** 2026-10-12 · **Status:** approved in conversation, section by section; spec awaiting review
**Builds on:** the cut list (`cutlist.ts`, invariant 18), board feet (`units/quantity.ts`), sheet nesting
(`nesting.ts`, invariants 19, 22, 23), the storage seam (`StorageAdapter`, invariants 7, 31) and the Settings
dialog. Every rule there still holds unless this document says otherwise.

**Origin:** `docs/feature-gaps.md` §3, "Solid-lumber yield" and "Cost".

## 1. Problem and goal

The cut list says how much STOCK the parts are: board feet for solid wood, a sheet layout for plywood and MDF.
It does not say what to BUY or what it will COST. A hardwood buyer needs the board feet with an allowance for
defects and milling; a big-box buyer needs to know how many 1×6×8's to put on the cart; both want a total.

**Goal:** the cut list ends with a **Buying** section: per material, what to buy and what it costs, and a project
total.

**The user's rulings, made in conversation:**
- **Both buying modes** (option C): each material is bought either by the board foot (rough or surfaced hardwood,
  random widths and lengths) or by the piece (dimensional / S4S boards in fixed sizes). Sheet goods are bought by
  the sheet.
- **Prices live in this browser** (option B): set once, applied to every project; NOT in the document. **No schema
  change** — `CURRENT_VERSION` stays 13 and a rollback costs nothing. Per-project overrides are a later round.
- **Several stock sizes per by-the-piece material, and the packer picks the mix** (option B).

## 2. The shop settings (browser-level)

### 2.1 Shape

Stored under the key **`sloyd.shop.v1`**, read and written ONLY through `StorageAdapter` (new methods
`getShopSettings(): Promise<ShopSettings>` and `setShopSettings(s: ShopSettings): Promise<boolean>`), like the LLM
settings. It is NOT part of `SloydDocument`, never exported with a project, and never on the undo stack.

```ts
interface ShopSettings {
  layout: 1;                                   // the storage layout, like the library index's `layout`
  materials: Record<string, MaterialBuying>;   // keyed by MATERIALS key
}
type MaterialBuying =
  | { mode: 'board-foot'; pricePerBoardFoot: number | null; wasteFactor: number }
  | { mode: 'piece'; stock: StockBoard[] }
  | { mode: 'sheet'; pricePerSheet: number | null };
interface StockBoard { id: string; thickness: number; width: number; length: number; price: number | null }
```

- **Modes per material:** a sheet good (`isSheetGood`) is always `'sheet'` — its size stays on `MATERIALS` (the
  sheet-nesting round's ruling). A solid material is `'board-foot'` or `'piece'`, the user's choice.
- **Defaults** (`DEFAULT_SHOP`, one home, in `document/purchase.ts`): oak, maple, walnut, cherry →
  board-foot, waste factor **1.3**, no price; pine → piece, with ¾" × {1½, 2½, 3½, 5½, 7¼, 9¼, 11¼}" × {72, 96}"
  (14 sizes), no prices; plywood, MDF → sheet, no price. **No default carries a price** — prices are local facts.
- **A material missing from the stored settings** (a key added to `MATERIALS` later) takes its default entry.

### 2.2 Validation and failure

- `getShopSettings` **never throws** (invariant 7's spirit). Absent key → defaults. Unparseable JSON, a
  `layout` other than 1, or a value failing validation → defaults, and the adapter reports it so the Lumber &
  prices dialog shows "Saved prices could not be read; showing defaults. Saving will replace them." It **never
  overwrites the stored value on read** (a newer layout written by a newer build must survive a rollback).
- Per-field validation on read: a price must be finite and ≥ 0, or null; a waste factor finite and in [1, 3]
  (refused, not clamped — outside it the entry falls back to its default); a stock board must have finite
  thickness, width and length > 0; a malformed stock board is dropped; a stock board id is re-minted if missing or
  duplicate within its material.
- `setShopSettings` returns false (and changes nothing) when storage is unavailable; the dialog then says so.

### 2.3 The Lumber & prices dialog

`panels/LumberPricesDialog.tsx`, a modal like `SettingsDialog` (joins `modalOpen`; `.app-shell` inert; Escape and
focus handling as the other dialogs). Opened from a **"Lumber & prices…"** button in the cut list header (hidden in
print) and from the Settings dialog.

- One row per material (MATERIALS order): its label; for a solid material a mode select (By the board foot / By the
  piece); then the mode's fields:
  - board-foot: **Price per bd ft** and **Waste factor**;
  - piece: a list of stock sizes — thickness, width, length (`DimensionField`-style length entry, fractional inches)
    and price — with **Add size** and a remove button per row;
  - sheet: **Price per sheet**.
- Prices are entered as decimal currency; an empty field means "no price". Invalid input is **refused, not clamped**
  (the field shows the error and keeps focus, as `DimensionField` does).
- **Save** writes through `setShopSettings`; **Cancel** discards. Edits are not undoable (not document state).
- **Reset to defaults** per material.

## 3. What is computed — `document/purchase.ts`

`buildPurchase(doc: FlatDocument, shop: ShopSettings): Purchase`, pure. It imports `units` (it produces strings a
person reads — the `→ units` edge rule) and reuses `nesting.ts`'s packer.

### 3.1 By the board foot

Per material, per cut-list thickness group (hardwood is bought by thickness, e.g. 4/4 and 8/4):
- **net** = the group's exact stock cubic inches (the cut list's `stockInches`: stock, not remainder; never
  rounded before summing — invariant 18);
- **buy** = net × waste factor; **cost** = buy (in bd ft) × price, or null without a price.
- Line: `Buy 4.62 bd ft (3.55 net × 1.3) · $46.20` per thickness, e.g. `Walnut — 3/4"`.

### 3.2 By the piece

Per material, across all its thickness groups:

1. **Thickness.** Each part is assigned the **thinnest stock thickness ≥ its own thickness** (compared with the
   cut list's FLUSH-style epsilon, `1e-9`). A part whose stock is thicker carries a note `plane to 1/2"`.
2. **Unplaceable.** A part thicker than every stock thickness, or whose footprint fits no stock board at its
   thickness (too wide or too long), goes to `unplaceable` — **never dropped** (as nesting's). Glue-ups are not
   modelled.
3. **Pack.** Per stock thickness, the parts are packed with the sheet packer's SHELF FIRST-FIT-DECREASING core
   (`nesting.ts`; invariants 22, 23): edge-to-edge guillotine cuts, kerf `doc.stock.kerf` between parts, **grain
   along the board's length always** (a part's `grain` dimension runs along the stock length; it never rotates).
   The core is generalised to take a SEQUENCE of bins chosen as packing proceeds: when a new board is needed, the
   packer opens the **largest** stock size at that thickness (by length, then width) that fits the next part.
4. **Swap down.** After packing, each board is replaced by the **cheapest** stock size at that thickness that still
   holds that board's parts — verified by re-packing those parts onto the candidate size, not by comparing areas.
   With no prices at that thickness, "cheapest" is **smallest area**; with some prices missing, a priced size is
   preferred over an unpriced one only when both fit (the unpriced cost is unknown, not zero). Ties keep the earlier
   size in the user's list.
   - This is a **heuristic, not an optimum** — stated in the module comment and the UI does not claim "minimum".
5. **Report:** board count per stock size, e.g. `Buy 2 × 3/4" × 5-1/2" × 96", 1 × 3/4" × 7-1/4" × 96" · $38.97`;
   one line per unplaceable part (`Shelf (3/4" × 12" × 30") fits no pine stock — too wide`); a layout per board.

### 3.3 By the sheet

The cut list's existing nesting per thickness group: `Buy 3 sheets · $165.00` (sheet count × price per sheet).

### 3.4 Money and totals

- **`formatMoney(dollars)`** in `units/quantity.ts`: `$1,234.50` — two decimals, thousands separators, US dollars.
  One home; the Buying section never formats money itself (invariant 19's rule).
- Costs are summed EXACTLY and rounded only for display.
- **Project total:** `Estimated materials: $250.17`; when any material in the project has no price (or an
  unplaceable part), the line adds `(2 materials have no price)` / `(1 part not placed)` — nothing is left out
  silently.
- A material with no parts in the project does not appear.

## 4. Where it shows — the cut list

- A **Buying** section at the end of `CutList.tsx`, one entry per material present (board-foot lines per thickness;
  piece: the buy line, unplaceable lines and board layouts; sheet: the buy line), then the project total.
- **Board layouts** for by-the-piece materials are drawn by a `BoardLayout` component modelled on `SheetLayout`
  (strings and measured labels built in `purchase.ts` / the packer, never in the component — invariant 19). They
  share the existing layouts toggle, relabelled **"Layouts"**.
- The cut list reads the shop settings once on open (through `StorageAdapter`) and again after the Lumber & prices
  dialog saves.
- Print: the Buying section prints (ink rules as the cut list's); the dialog button does not.
- **Unchanged:** the per-group rows, board feet and sheet layouts above; the Plans sheet; the viewport; Generate.

## 5. Modules and layers

| Module | Layer | Job |
|---|---|---|
| `units/quantity.ts` | units | `formatMoney` |
| `document/purchase.ts` | document | `ShopSettings` types, `DEFAULT_SHOP`, `validateShop`, `buildPurchase` (imports `units`) |
| `document/nesting.ts` | document | the shelf core generalised to a chosen sequence of bins; sheet behaviour unchanged |
| `storage/types.ts`, `storage/browser.ts` | storage | `getShopSettings` / `setShopSettings`, key `sloyd.shop.v1` |
| `panels/LumberPricesDialog.tsx` | panels | §2.3 |
| `panels/CutList.tsx`, `panels/BoardLayout.tsx` | panels | §4 |
| `App.tsx`, `panels/SettingsDialog.tsx`, `styles.css` | — | dialog wiring, `modalOpen`, the Settings link, styles |

## 6. Testing

Expected values are hand-derived in the test; each test is mutated once (it must fail).
- **`purchase.ts`:** board-foot net/buy/cost; thickness assignment (thinnest ≥, the planing note, the epsilon,
  too thick); unplaceable (too wide, too long) listed and counted in the total's note; packing with kerf (a
  hand-laid example whose board count changes when kerf is removed); the "largest first" opening rule; swap-down
  (moves to a cheaper size only when the parts still fit — an exact-fit boundary both sides; prefers priced over
  unpriced only when both fit; no prices → smallest area; ties keep list order); totals and the missing-price note;
  sheet cost from the existing nesting.
- **`nesting.ts`:** every existing test unchanged and green (the sheet path must not move).
- **`validateShop` / storage:** absent → defaults; malformed / newer layout → defaults + the read-failure flag, and
  the stored value is NOT overwritten; field rules (price, waste factor range refused, stock board dropped, ids
  re-minted); a set/get round trip; `setShopSettings` false when storage is unavailable; a new MATERIALS key takes
  its default.
- **`formatMoney`:** decimals, thousands, zero.
- **Dialog:** edit a price, switch a mode, add/remove a size, refuse invalid input, Save writes, Cancel does not,
  Reset restores one material.
- **Cut list:** the Buying section's lines and total for a mixed project; the missing-price note; layouts toggle.
- **Browser pass** on the dev server with the cabinet fixture plus a pine project, in a FRESH port/profile; at the
  end delete only what the check created (the dev-browser memory rule).

## 7. Out of scope — recorded as follow-ups when the round ships

Per-project price overrides (option C); custom materials and nominal lumber names (2×4); edge banding; a hardware
bill of materials; glue-up panels from narrow stock; a true optimal packer; currencies other than US dollars;
rough-lumber thickness classes (4/4, 8/4) as named stock.
