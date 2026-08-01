# Board Feet on the Cut List — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print how much stock each cut-list row and each material group consumes — board feet for solid lumber, square feet for sheet goods.

**Architecture:** A new `units` leaf (`src/units/quantity.ts`) owns the 144-per-foot conversion and the decimal formatting. `buildCutList` accumulates each board's *exact* volume as it already walks every board, so rows and their group subtotals are summed in one pass from the same numbers. `CutList.tsx` renders two new strings and does no arithmetic. No schema change.

**Tech Stack:** TypeScript, Vitest, React. No new dependencies.

## Global Constraints

Copied from `docs/superpowers/specs/2026-08-01-sloyd-board-feet-design.md`. Every task's requirements implicitly include these.

- **Board feet uses STOCK dimensions; `cuts` are ignored entirely.** A dado does not reduce the board you buy. Never derive this from `boardSolids`. (§1)
- **Totals sum each board's EXACT volume, never `qty × representative dimensions`.** Rows collapse at *display* precision (invariant 18), and a sum does not stay bounded by that error the way a printed dimension does. (§2)
- **Precision is exactly two decimal places, fixed.** Do **not** use `doc.units.precision` — that is a fractional-inch denominator (16 means sixteenths) and is a category error applied to a decimal volume. (§5)
- **No rounding up.** Report the true number. (§5)
- **`CutList.tsx` formats nothing** — every string arrives ready from `buildCutList`. (§6)
- **No schema change.** `CURRENT_VERSION` stays 4. (§8)
- **The grouping key is untouched.** Board feet is derived *from* rows and must not participate in forming them. (§8)
- **No document-wide grand total**, no waste factor, no cost, no sheet count. (§3, §8)
- Unit suffixes are exactly `bd ft` and `sq ft`, one space after the number.
- Run `npm run build` before claiming anything compiles — `npm test` does **not** typecheck.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/units/quantity.ts` | Create | 144-per-foot conversion + decimal formatting. Imports nothing, like `length.ts`. |
| `src/units/quantity.test.ts` | Create | Unit tests for the above. |
| `src/document/cutlist.ts` | Modify | Accumulate exact volume per row/group; produce formatted strings. |
| `src/document/cutlist.test.ts` | Modify | The exact-vs-representative test and the units split. |
| `src/panels/CutList.tsx` | Modify | Render the row cell and the group subtotal line. |
| `src/styles.css` | Modify | Layout for both, plus the `@media print` colour override. |

---

### Task 1: `src/units/quantity.ts` — conversion and formatting

`units` is the bottom layer and imports nothing. `length.ts` prints lengths; this sibling prints volumes and areas. Splitting rather than widening `length.ts` keeps each filename honest (spec §5).

**Files:**
- Create: `src/units/quantity.ts`
- Test: `src/units/quantity.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `INCHES_PER_BOARD_FOOT: number` (= 144)
  - `INCHES_PER_SQUARE_FOOT: number` (= 144)
  - `formatBoardFeet(cubicInches: number): string` → e.g. `"1.38 bd ft"`
  - `formatSquareFeet(squareInches: number): string` → e.g. `"15.00 sq ft"`

- [ ] **Step 1: Write the failing tests**

Create `src/units/quantity.test.ts`:

```ts
import { formatBoardFeet, formatSquareFeet } from './quantity';

describe('formatBoardFeet', () => {
  it('converts 144 cubic inches to one board foot', () => {
    expect(formatBoardFeet(144)).toBe('1.00 bd ft');
  });

  it('formats a 24 x 5-1/2 x 3/4 board', () => {
    // 24 * 5.5 * 0.75 = 99 cubic inches
    expect(formatBoardFeet(99)).toBe('0.69 bd ft');
  });

  it('formats two of that board', () => {
    expect(formatBoardFeet(198)).toBe('1.38 bd ft');
  });

  it('always shows exactly two decimal places', () => {
    expect(formatBoardFeet(0)).toBe('0.00 bd ft');
    expect(formatBoardFeet(288)).toBe('2.00 bd ft');
  });

  it('rounds rather than truncating', () => {
    // 145 / 144 = 1.00694...; truncation would give 1.00.
    expect(formatBoardFeet(145)).toBe('1.01 bd ft');
  });

  it('is not exact at a floating-point half-way boundary, and that is fine', () => {
    // 144.72 / 144 is 1.00499...9 in binary, not 1.005, so toFixed gives 1.00
    // rather than the 1.01 a decimal-exact rounding would produce. Pinned
    // deliberately: at a 1/100 board foot this is roughly a tenth of a cubic
    // inch of lumber, so it costs nothing at the yard — but a future reader
    // should find the behaviour recorded instead of rediscovering it as a bug.
    expect(formatBoardFeet(144.72)).toBe('1.00 bd ft');
  });

  it('does not round up to a whole board foot', () => {
    // A yard selling in whole board feet is applying a purchasing policy;
    // reporting the true number is the honest thing. Spec section 5.
    expect(formatBoardFeet(150)).toBe('1.04 bd ft');
  });
});

describe('formatSquareFeet', () => {
  it('converts 144 square inches to one square foot', () => {
    expect(formatSquareFeet(144)).toBe('1.00 sq ft');
  });

  it('formats three 24 x 30 panels', () => {
    // 3 * 24 * 30 = 2160 square inches
    expect(formatSquareFeet(2160)).toBe('15.00 sq ft');
  });

  it('always shows exactly two decimal places', () => {
    expect(formatSquareFeet(0)).toBe('0.00 sq ft');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/units/quantity.test.ts`
Expected: FAIL — cannot resolve `./quantity`.

- [ ] **Step 3: Write the implementation**

Create `src/units/quantity.ts`:

```ts
/**
 * How much stock a part consumes, printed.
 *
 * A sibling of `length.ts` rather than an addition to it: `units` owns how
 * measured quantities print for this app, and a volume is not a length.
 * Widening `length.ts` to print cubic inches would make its filename a lie.
 *
 * Both units are 144 of something per foot — 144 cubic inches to the board
 * foot, 144 square inches to the square foot — which is a coincidence of
 * arithmetic, not one idea. They are named separately so that a future unit
 * that is not 144 does not have to fight a shared constant.
 */

/** 144 cubic inches of solid lumber. The unit lumber is sold in. */
export const INCHES_PER_BOARD_FOOT = 144;

/** 144 square inches of sheet. The unit sheet goods are measured in. */
export const INCHES_PER_SQUARE_FOOT = 144;

/**
 * Two decimal places, always — including trailing zeros, so a column of these
 * aligns on the point under `font-variant-numeric: tabular-nums`.
 *
 * Fixed rather than taking the document's `units.precision`: that value is a
 * fractional-inch DENOMINATOR (16 meaning sixteenths). Applied to a decimal it
 * is a category error that happens to typecheck.
 *
 * `toFixed` rounds rather than truncating, which is what we want — but it
 * never rounds UP to the next whole unit either. A yard that sells in whole
 * board feet is applying a purchasing policy; reporting the true number and
 * letting the user round is honest, and the reverse is not recoverable.
 *
 * Its rounding is binary, not decimal: 144.72 cubic inches is 1.00499...9 as a
 * double, so it prints 1.00 where decimal-exact rounding would give 1.01. At a
 * hundredth of a board foot that is about a tenth of a cubic inch of lumber —
 * nothing at the yard — and it is pinned by a test so it reads as known rather
 * than as a bug waiting to be found.
 */
const DECIMALS = 2;

/** e.g. `1.38 bd ft`. Takes CUBIC inches — length x width x thickness. */
export function formatBoardFeet(cubicInches: number): string {
  return `${(cubicInches / INCHES_PER_BOARD_FOOT).toFixed(DECIMALS)} bd ft`;
}

/** e.g. `15.00 sq ft`. Takes SQUARE inches — length x width, no thickness. */
export function formatSquareFeet(squareInches: number): string {
  return `${(squareInches / INCHES_PER_SQUARE_FOOT).toFixed(DECIMALS)} sq ft`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/units/quantity.test.ts`
Expected: PASS, 10 tests.

Every expected string above was computed with `node -e` before this plan was written, not by hand — including the two that surprised: `144.72` does **not** round to `1.01`, and `1.375` does round to `1.38`. Do not "correct" either.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: `✓ built in …`, no TS errors.

- [ ] **Step 6: Commit**

```bash
git add src/units/quantity.ts src/units/quantity.test.ts
git commit -m "feat: add board-feet and square-feet formatting to units"
```

---

### Task 2: Accumulate exact stock in `buildCutList`

The correctness fork (spec §2). `buildCutList` already walks every board and does `row.qty += 1` — the exact volume accumulates at that same point, which is what makes a row and its subtotal impossible to disagree.

**Files:**
- Modify: `src/document/cutlist.ts` (the `CutListRow` and `CutListGroup` interfaces; the `buildCutList` loop and its trailing sort pass)
- Test: `src/document/cutlist.test.ts`

**Interfaces:**
- Consumes: `formatBoardFeet`, `formatSquareFeet` from Task 1; `isSheetGood` from `./types` (already exists).
- Produces, on **both** `CutListRow` and `CutListGroup`:
  - `stockInches: number` — raw accumulated inches, **cubic** for solid stock and **square** for sheet goods.
  - `stock: string` — that value formatted with its unit, e.g. `"1.38 bd ft"`.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe('buildCutList', …)` block in `src/document/cutlist.test.ts`:

```ts
  it('reports board feet for a row, quantity included', () => {
    // 24 * 5.5 * 0.75 = 99 cubic inches each; two of them = 198; /144 = 1.375
    const list = buildCutList(docWith(
      { length: 24, width: 5.5, thickness: 0.75 },
      { length: 24, width: 5.5, thickness: 0.75 },
    ));
    expect(list.groups[0].rows[0].stock).toBe('1.38 bd ft');
    expect(list.groups[0].rows[0].stockInches).toBeCloseTo(198, 10);
  });

  it('sums each board EXACTLY, not the row representative times quantity', () => {
    // These two print identically at 1/16" and so share a row (invariant 18),
    // but they are not the same purchase. The row must total 99 + 99.0825 =
    // 198.0825 cubic inches, NOT 2 x 99. This is spec section 2, and it is the
    // test that fails if someone later "simplifies" this to qty * volume.
    const list = buildCutList(docWith(
      { length: 24, width: 5.5, thickness: 0.75 },
      { length: 24.02, width: 5.5, thickness: 0.75 },
    ));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
    expect(list.groups[0].rows[0].stockInches).toBeCloseTo(198.0825, 6);
    expect(list.groups[0].rows[0].stockInches).not.toBeCloseTo(198, 6);
  });

  it('ignores cuts — board feet is stock bought, not stock remaining', () => {
    // A dado does not reduce the board you buy. Spec section 1. If someone
    // "fixes" this by subtracting removed stock, this test is what stops them.
    const dado: Cut = {
      id: 'c1', face: 'thickness', from: 'max', across: 'width',
      offset: 6, width: 0.75, depth: 0.25,
    };
    const plain = buildCutList(docWith({ length: 24, width: 5.5, thickness: 0.75 }));
    const dadoed = buildCutList(docWith({ length: 24, width: 5.5, thickness: 0.75, cuts: [dado] }));
    expect(dadoed.groups[0].rows[0].stockInches)
      .toBeCloseTo(plain.groups[0].rows[0].stockInches, 10);
    expect(dadoed.groups[0].rows[0].stock).toBe('0.69 bd ft');
  });

  it('reports square feet for sheet goods, with thickness absent from the maths', () => {
    // 24 * 30 = 720 square inches; /144 = 5.00. Thickness must not appear.
    const list = buildCutList(docWith(
      { material: 'plywood', length: 24, width: 30, thickness: 0.75 },
    ));
    expect(list.groups[0].rows[0].stock).toBe('5.00 sq ft');
    expect(list.groups[0].rows[0].stockInches).toBeCloseTo(720, 10);
  });

  it('reports square feet for MDF too', () => {
    const list = buildCutList(docWith(
      { material: 'mdf', length: 12, width: 12, thickness: 0.5 },
    ));
    expect(list.groups[0].rows[0].stock).toBe('1.00 sq ft');
  });

  it('subtotals a group as the sum of its rows', () => {
    const list = buildCutList(docWith(
      { length: 24, width: 5.5, thickness: 0.75 },   // 99
      { length: 36, width: 7.25, thickness: 0.75 },  // 195.75
    ));
    const group = list.groups[0];
    expect(group.rows).toHaveLength(2);
    const summed = group.rows.reduce((n, r) => n + r.stockInches, 0);
    expect(group.stockInches).toBeCloseTo(summed, 10);
    expect(group.stockInches).toBeCloseTo(294.75, 10);
    expect(group.stock).toBe('2.05 bd ft');
  });

  it('gives a sheet-goods group its own unit', () => {
    const list = buildCutList(docWith(
      { material: 'plywood', length: 24, width: 30, thickness: 0.75 },
      { material: 'pine', length: 24, width: 5.5, thickness: 0.75 },
    ));
    const ply = list.groups.find((g) => g.material === 'plywood')!;
    const pine = list.groups.find((g) => g.material === 'pine')!;
    expect(ply.stock).toBe('5.00 sq ft');
    expect(pine.stock).toBe('0.69 bd ft');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/document/cutlist.test.ts`
Expected: FAIL — `stock` and `stockInches` are undefined on rows and groups.

- [ ] **Step 3: Add the imports**

In `src/document/cutlist.ts`, extend the existing `../units/length` import line with a new import beside it, and add `isSheetGood` to the existing `./types` import:

```ts
import { formatBoardFeet, formatSquareFeet } from '../units/quantity';
```

`isSheetGood` is exported from `src/document/types.ts` — add it to whichever existing `./types` import statement is already there rather than writing a second one.

- [ ] **Step 4: Add the fields to both interfaces**

In `CutListRow`, after `diagrams`:

```ts
  /**
   * Raw accumulated inches of stock this row consumes: CUBIC inches for solid
   * lumber, SQUARE inches for sheet goods. Quantity is already included.
   *
   * THE ONE NUMBER ON THIS ROW THAT IS NOT THE REPRESENTATIVE'S. Every other
   * dimension here is the first board's (see this interface's own doc comment
   * and follow-up 55); this is summed from every board's exact dimensions as
   * the grouping loop visits it. The distinction is not pedantic: a printed
   * dimension's rounding error is invisible because every board on the row
   * prints the same string, but a SUM multiplies that error by `qty` and then
   * again across the group. Two boards 0.02" apart are one row correctly, and
   * are not the same purchase.
   *
   * The visible consequence, which is intended: this may not equal `qty` times
   * the dimensions printed beside it. The printed dimensions are rounded; this
   * is not.
   */
  stockInches: number;
  /** `stockInches` formatted with its unit, e.g. `1.38 bd ft`. */
  stock: string;
```

In `CutListGroup`, after `rows`:

```ts
  /**
   * The sum of this group's rows' `stockInches`, in the same unit — cubic
   * inches for solid lumber, square inches for sheet goods. A group is one
   * material, and `isSheetGood` is a fact about the material, so a group is
   * uniform in unit and never has to choose.
   */
  stockInches: number;
  /** `stockInches` formatted with its unit, e.g. `2.05 bd ft`. */
  stock: string;
```

- [ ] **Step 5: Add a helper above `buildCutList`**

```ts
/**
 * The stock one board consumes, in the unit its material is sold in: cubic
 * inches for solid lumber, square inches for sheet goods (which are sold by
 * the sheet — thickness is a property of the sheet you buy, not a multiplier).
 *
 * STOCK DIMENSIONS ONLY — `board.cuts` is deliberately not read. A dado does
 * not reduce the board you buy: the stock leaves the yard whole and the
 * joinery happens afterward, out of material already paid for. This is the
 * inverse of what every other consumer of `cuts` does (`boardSolids` removes
 * stock, `buildDepthField` measures the removal, `buildDiagrams` draws it), so
 * a reader arriving from `cuts.ts` will be primed to subtract here. Don't.
 */
function stockInchesOf(board: Board): number {
  return isSheetGood(board.material)
    ? board.length * board.width
    : board.length * board.width * board.thickness;
}
```

- [ ] **Step 6: Initialise and accumulate in the loop**

In the `group` object literal, add `stockInches: 0,` and `stock: '',` alongside `rows: []`.
In the `row` object literal, add `stockInches: 0,` and `stock: '',` alongside `qty: 0`.

Then, immediately after the existing `row.qty += 1;` and `row.names.push(board.name);`, add:

```ts
    // Accumulated HERE, in the same visit that increments `qty`, and from this
    // board's own exact dimensions — see stockInches' doc comment. Adding to
    // the group in the same statement is what makes a subtotal and its rows
    // impossible to disagree: they are the same additions, not two passes.
    const stock = stockInchesOf(board);
    row.stockInches += stock;
    group.stockInches += stock;
```

- [ ] **Step 7: Format in the existing trailing pass**

In the `for (const group of out)` loop that already sorts rows, add before or after the sort:

```ts
    const format = isSheetGood(group.material) ? formatSquareFeet : formatBoardFeet;
    group.stock = format(group.stockInches);
    for (const row of group.rows) row.stock = format(row.stockInches);
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run src/document/cutlist.test.ts`
Expected: PASS — the seven new tests plus every pre-existing one.

- [ ] **Step 9: Run the whole suite and typecheck**

Run: `npm test && npm run build`
Expected: all files pass; build succeeds. If a pre-existing test constructs a `CutListRow` or `CutListGroup` literal it will now fail to typecheck — add the two fields to it rather than making them optional.

- [ ] **Step 10: Commit**

```bash
git add src/document/cutlist.ts src/document/cutlist.test.ts
git commit -m "feat: accumulate exact stock per cut-list row and group"
```

---

### Task 3: Render the numbers on the sheet

**Files:**
- Modify: `src/panels/CutList.tsx:80-83` (the row cells) and `:78-107` (the group's `<ul>`, which gains a subtotal sibling)
- Modify: `src/styles.css:538` (`.cutlist-row` grid), new rules, and the `@media print` block at `:628`

**Interfaces:**
- Consumes: `row.stock` and `group.stock` from Task 2. Both are ready-to-print strings — this component performs no arithmetic and calls no formatter (spec §6).
- Produces: no exports.

- [ ] **Step 1: Add the row cell**

In `src/panels/CutList.tsx`, inside `<li className="cutlist-row">`, add a fourth cell immediately after the `cutlist-names` span:

```tsx
                    <span className="cutlist-stock">{row.stock}</span>
```

- [ ] **Step 2: Add the group subtotal**

Immediately after the closing `</ul>` of `cutlist-rows`, still inside the `<section>`:

```tsx
              <p className="cutlist-subtotal">
                <span className="cutlist-subtotal-label">{group.label}</span>
                <span className="cutlist-stock">{group.stock}</span>
              </p>
```

- [ ] **Step 3: Widen the row grid and style both**

In `src/styles.css`, change `.cutlist-row`'s `grid-template-columns` from `3.5em 11em 1fr` to:

```css
  grid-template-columns: 3.5em 11em 1fr 7.5em;
```

Then add after the `.cutlist-names` rule:

```css
/* Right-aligned and monospace so a column of totals aligns on the decimal
   point. --font-num is the same stack the diagram labels rely on. */
.cutlist-stock {
  text-align: right;
  font-family: var(--font-num);
  color: var(--ink-dim);
  white-space: nowrap;
}

.cutlist-subtotal {
  display: grid;
  grid-template-columns: 1fr 7.5em;
  gap: 12px;
  margin: 8px 0 0;
  padding-top: 8px;
  font-variant-numeric: tabular-nums;
}

.cutlist-subtotal-label {
  text-align: right;
  color: var(--ink-faint);
}

/* The subtotal is the group's own total, so it reads brighter than the rows
   it sums. */
.cutlist-subtotal .cutlist-stock {
  color: var(--brass);
}
```

Note `.cutlist-setup` uses `grid-column: 2 / -1`, which still spans to the last column after the widening — no change needed there.

- [ ] **Step 4: Fix the print block**

Both new classes are `--ink-dim`/`--ink-faint`/`--brass` — grey or brass on white, which is follow-up 58's exact defect shape. In `src/styles.css`'s `@media print` block, add both selectors to the existing enumerated `color: #000` list (the one already naming `.cutlist-qty`, `.cutlist-names`, `.cutlist-setup` and the diagram classes):

```css
  .cutlist-stock,
  .cutlist-subtotal-label,
```

Add them alongside `.cutlist-names` in that selector list, so they pick up the same `color: #000`.

- [ ] **Step 5: Typecheck and run the suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass (this task adds no tests — the panel is verified in a browser, per the repo's working agreements).

- [ ] **Step 6: Commit**

```bash
git add src/panels/CutList.tsx src/styles.css
git commit -m "feat: print stock totals per row and per group on the cut list"
```

---

### Task 4: Browser verification and documentation

The repo's rule: the panel is verified by driving a real browser, and "done" includes docs. Both halves are this task's deliverable.

**Files:**
- Modify: `docs/follow-ups.md` (new section)
- Modify: `CLAUDE.md` (Status section, the "Deferred behind it" paragraph, `Where things live`, the test count in `Commands`)

**Interfaces:** none.

- [ ] **Step 1: Start a dev server**

```bash
npm run dev -- --port 5199
```

- [ ] **Step 2: Seed a document exercising both units**

Navigate to `http://localhost:5199/`, then in the browser console (or via Playwright `evaluate`) set the autosave key and reload:

```js
localStorage.setItem('sloyd.autosave.v1', JSON.stringify({
  version: 4, name: 'board feet check',
  units: { display: 'imperial-fractional', precision: 16 },
  boards: [
    { id: 'b1', name: 'Leg 1', length: 24, width: 5.5, thickness: 0.75,
      position: [0,0,0], rotation: 0, posture: 'flat', grain: 'length',
      material: 'pine', cuts: [] },
    { id: 'b2', name: 'Leg 2', length: 24, width: 5.5, thickness: 0.75,
      position: [8,0,0], rotation: 0, posture: 'flat', grain: 'length',
      material: 'pine', cuts: [] },
    { id: 'b3', name: 'Rail', length: 36, width: 7.25, thickness: 0.75,
      position: [16,0,0], rotation: 0, posture: 'flat', grain: 'length',
      material: 'pine', cuts: [] },
    { id: 'b4', name: 'Panel', length: 24, width: 30, thickness: 0.75,
      position: [0,0,12], rotation: 0, posture: 'flat', grain: 'length',
      material: 'plywood', cuts: [] },
  ],
}));
```

- [ ] **Step 3: Check the on-screen sheet**

Open the cut list. Confirm:
- Pine — 3/4" shows `1.38 bd ft` for the 2× Leg row, `1.36 bd ft` for the Rail, subtotal `2.73 bd ft`.
- Plywood — 3/4" shows `5.00 sq ft` and subtotal `5.00 sq ft`.
- The numbers right-align in a column and do not collide with long name lists.

- [ ] **Step 4: Check print rendering — this is the point of the task**

Emulate print media and screenshot. With Playwright:

```js
await page.emulateMedia({ media: 'print' });
await page.screenshot({ path: 'print-check.png', fullPage: true });
await page.emulateMedia({ media: null });
```

Confirm both the row totals and the subtotal are **black on white and legible**. Follow-up 58 records this exact defect happening once already in this modal. If either renders grey-on-white or invisible, fix `styles.css` and re-check before continuing.

Note: this host's Playwright exposes no `pdf()` — follow-ups 70 and 79 carry that forward. `emulateMedia` is the available substitute; say so rather than claiming a PDF was verified.

- [ ] **Step 5: Write the follow-ups section**

Append a `## From the board-feet round` section to `docs/follow-ups.md` covering at minimum:
- **The third instance of the 55/55a representative shape**, and that it was resolved the *other* way (exact, not representative) with the reasoning from spec §2 — including the visible consequence that a row's total may not equal `qty ×` its printed dimensions.
- **What `formatBoardFeet` does not do**: no rounding up, no waste factor, no user-configurable precision.
- Anything the browser pass turned up.
- Whether the print check was a media emulation or a real PDF (it will be the former).

- [ ] **Step 6: Update CLAUDE.md**

Four places:
1. **Status** — add a "What the board-feet round did" paragraph after the empty-solids placeholder paragraph.
2. **"Deferred behind it"** — board-feet is no longer deferred; sheet-goods nesting still is. Rewrite that sentence rather than deleting it, so the nesting deferral survives.
3. **Where things live** — add `src/units/quantity.ts` under `units/`, and note `cutlist.ts` now imports from it.
4. **Commands** — update `npm test # Vitest, currently 546 tests` to the new count. Get the real number from `npm test`, do not estimate.

Also check the Architecture section's module-order text: it says `units/length.ts` "Imports nothing" and describes `units` as the bottom layer. Adding a second leaf does not change the layering, but the sentence naming `length.ts` specifically should mention `quantity.ts` alongside it.

- [ ] **Step 7: Final gates**

```bash
npm run build && npm test
```
Expected: build succeeds; all tests pass. Report the exact test count.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: record the board-feet round"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §1 board feet formula; stock not remainder | Task 1 (formula), Task 2 step 5 + its test |
| §2 exact not representative | Task 2 steps 1, 4, 6 |
| §3 per-row + per-group, no grand total | Task 2 (derivation), Task 3 (render). No grand total is implemented anywhere — correct by omission. |
| §4 sheet goods → square feet via `isSheetGood` | Task 1, Task 2 steps 5, 7 |
| §5 formatting home, 2 decimals, no rounding up | Task 1 |
| §6 panel formats nothing; print is first-class | Task 3, Task 4 step 4 |
| §7 testing | Tasks 1 and 2 tests; Task 4 browser pass |
| §8 non-goals | Nothing implements them; the waste-factor and grand-total decisions are recorded in Task 4 step 5 |

**Type consistency:** `stockInches` and `stock` are used with those exact names in Tasks 2 and 3, on both `CutListRow` and `CutListGroup`. `formatBoardFeet`/`formatSquareFeet` are defined in Task 1 and consumed in Task 2 with matching signatures (both take raw inches and return a string with the unit suffix included).

**One risk worth flagging to the implementer:** Task 2 step 9 anticipates pre-existing tests breaking on the two new required interface fields. Adding the fields as required (not optional) is deliberate — an optional total is one a caller can forget to render.
