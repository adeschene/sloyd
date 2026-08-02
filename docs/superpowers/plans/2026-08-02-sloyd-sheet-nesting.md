# Sheet-Goods Nesting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell a user how many sheets of plywood or MDF their project needs, and draw where every part sits on them.

**Architecture:** A new pure leaf, `src/document/nesting.ts`, packs a group's boards onto sheets by shelf first-fit-decreasing (guillotine-cuttable by construction). Sheet size and rotation policy become per-material facts on `MATERIALS`; kerf becomes a document field at schema v5. `buildCutList` attaches the result to each sheet-goods group, and a new `SheetLayout.tsx` draws it.

**Tech Stack:** TypeScript, React, Vitest, SVG. No new dependencies.

Design spec: `docs/superpowers/specs/2026-08-02-sloyd-sheet-nesting-design.md`. Read it before Task 1.

## Global Constraints

- **`npm test` does NOT typecheck.** `npm run build` (`tsc -b && vite build`) is the typecheck gate. Run it before claiming any task compiles.
- **No pull requests.** Solo repo. Work on branch `feat/sheet-nesting`, merge to `master` with `git merge --no-ff` at the end.
- **The document is the source of truth** (invariant 1). Nesting is derived on every render; nothing caches it, nothing stores it.
- **Migration steps run on raw data, before `validateBoard`, in version order** (invariant 11).
- **Purity:** `nesting.ts` imports only `./types`, `./geometry` (if needed) and `../units/length`. Never `./document` — that would cycle.
- **No `Math.random`, no `Date.now`** in any derivation. Output must be identical for identical input.
- **Panels format nothing.** Every string a panel prints arrives ready from the derivation layer.
- **`LABEL_SIZE` has exactly one home** (invariant 19). Never set `font-size` on diagram or layout SVG text in `styles.css`.
- **Constants must be measured or guarded** (follow-ups 64, 68, 80 — five recorded instances of plan-supplied constants shipping with reasoning that did not reproduce). Every constant this plan supplies is either pinned by a test that fails when it is wrong, or derived from something already measured. **If you believe a constant or an expectation in this plan is wrong, stop and escalate rather than fixing the test to match the code** — that instruction is what caught seven defects during joinery.
- **Class-name collision warning:** `.cutlist-sheet` is ALREADY TAKEN — it is the printable modal itself. Every new class in this round uses the `cutlist-layout-` prefix.

---

## Task 1: `MATERIALS.sheet` becomes a `SheetStock` object

**Files:**
- Modify: `src/document/types.ts` (the `MATERIALS` const, `isSheetGood`, ~lines 95-117)
- Test: `src/document/types.test.ts` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `interface SheetStock { length: number; width: number; rotate: 'grain' | 'free' }`, `MATERIALS[k].sheet?: SheetStock`, `isSheetGood(material: string): boolean` (unchanged signature), `sheetStockOf(material: string): SheetStock | undefined`.

- [ ] **Step 1: Write the failing test**

Create `src/document/types.test.ts`:

```ts
import { isSheetGood, sheetStockOf, MATERIALS } from './types';

describe('sheet stock metadata', () => {
  it('still reports which materials are sheet goods', () => {
    expect(isSheetGood('plywood')).toBe(true);
    expect(isSheetGood('mdf')).toBe(true);
    expect(isSheetGood('pine')).toBe(false);
    expect(isSheetGood('nonesuch')).toBe(false);
  });

  it('gives plywood a 4x8 sheet that honours grain', () => {
    expect(sheetStockOf('plywood')).toEqual({ length: 96, width: 48, rotate: 'grain' });
  });

  // MDF has no grain at all, so a part may be turned to pack better. This is
  // the whole reason `rotate` is a per-material policy rather than a global.
  it('lets MDF parts rotate freely', () => {
    expect(sheetStockOf('mdf')).toEqual({ length: 96, width: 48, rotate: 'free' });
  });

  it('has no sheet stock for solid lumber', () => {
    expect(sheetStockOf('walnut')).toBeUndefined();
    expect(sheetStockOf('nonesuch')).toBeUndefined();
  });

  it('gives every sheet good a sheet, and no solid material one', () => {
    for (const key of Object.keys(MATERIALS)) {
      expect(sheetStockOf(key) !== undefined).toBe(isSheetGood(key));
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/document/types.test.ts`
Expected: FAIL — `sheetStockOf` is not exported.

- [ ] **Step 3: Implement**

In `src/document/types.ts`, replace the `MATERIALS` block and `isSheetGood` with:

```ts
/**
 * The stock a sheet good is sold as.
 *
 * A property of the MATERIAL, not of the project: a 4x8 sheet is a fact about
 * plywood the same way `sheet: true` used to be, and Baltic birch comes 5x5
 * because of what it is rather than because of what you are building.
 *
 * This is deliberately the shape a later custom-materials round fills in — a
 * custom unveneered plywood is an entry with `rotate: 'free'`, Baltic birch is
 * one with `length: 60, width: 60` — so nothing in `nesting.ts` changes when
 * these entries move from a module constant into document data.
 */
export interface SheetStock {
  /** Inches. The long dimension of a full sheet. */
  length: number;
  /** Inches. */
  width: number;
  /**
   * 'grain' — the part's own `grain` field determines its orientation on the
   *   sheet and the packer never turns it. Correct for veneered plywood, where
   *   a part turned 90 degrees has its face veneer running the wrong way in
   *   the finished piece.
   * 'free'  — the packer may lay the part either way. Correct for MDF, which
   *   has no grain at all.
   */
  rotate: 'grain' | 'free';
}

export const MATERIALS: Record<string, { label: string; color: string; sheet?: SheetStock }> = {
  pine:    { label: 'Pine',     color: '#d9b98a' },
  oak:     { label: 'Oak',      color: '#c69c6d' },
  maple:   { label: 'Maple',    color: '#e6d2b5' },
  walnut:  { label: 'Walnut',   color: '#6b4630' },
  cherry:  { label: 'Cherry',   color: '#a4552f' },
  plywood: { label: 'Plywood',  color: '#cbb391',
             sheet: { length: 96, width: 48, rotate: 'grain' } },
  mdf:     { label: 'MDF',      color: '#a89a86',
             sheet: { length: 96, width: 48, rotate: 'free' } },
};
```

Keep the existing doc comment above `isSheetGood` verbatim and change only its body, then add `sheetStockOf` below it:

```ts
export function isSheetGood(material: string): boolean {
  return MATERIALS[material]?.sheet !== undefined;
}

/** The sheet a material is sold as, or undefined for solid lumber. */
export function sheetStockOf(material: string): SheetStock | undefined {
  return MATERIALS[material]?.sheet;
}
```

- [ ] **Step 4: Re-export the new names**

In `src/document/document.ts`, `export * from './types'` already re-exports `sheetStockOf` and the `SheetStock` type. Confirm by grep, do not add a duplicate export line:

Run: `grep -n "export \* from './types'" src/document/document.ts`
Expected: one match at line 6.

- [ ] **Step 5: Run the full suite and the typecheck gate**

Run: `npm test` — expected: all pass, including the existing `cutlist.test.ts` square-feet tests and `grainFaces` tiling tests that call `isSheetGood`.
Run: `npm run build` — expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/document/types.ts src/document/types.test.ts
git commit -m "feat: MATERIALS.sheet carries sheet size and rotation policy"
```

---

## Task 2: Schema v5 — `stock.kerf`

**Files:**
- Modify: `src/document/types.ts` (`SloydDocument`, add `DEFAULT_KERF`)
- Modify: `src/document/document.ts` (`CURRENT_VERSION` line 20, `createDocument` ~line 75, `migrateDocument` return ~lines 312-323)
- Test: `src/document/document.test.ts`

**Interfaces:**
- Consumes: Task 1's `SheetStock` (not directly used here).
- Produces: `SloydDocument.stock: { kerf: number }`, `DEFAULT_KERF = 0.125`, `CURRENT_VERSION = 5`.

- [ ] **Step 1: Write the failing tests**

Add to `src/document/document.test.ts` (a new `describe` block at the end of the file):

```ts
describe('schema v5 — stock.kerf', () => {
  it('gives a new document the default kerf', () => {
    expect(createDocument('Test').stock).toEqual({ kerf: 0.125 });
    expect(createDocument('Test').version).toBe(5);
  });

  it('defaults kerf on a v4 file that has none', () => {
    const doc = migrateDocument({ version: 4, name: 'Old', boards: [] });
    expect(doc.stock).toEqual({ kerf: 0.125 });
    expect(doc.version).toBe(5);
  });

  it('keeps a kerf the user set', () => {
    const doc = migrateDocument({ version: 5, name: 'X', stock: { kerf: 0.25 }, boards: [] });
    expect(doc.stock.kerf).toBe(0.25);
  });

  // A negative kerf places parts overlapping; an inch-wide kerf is a typo, not
  // a saw. Both fall back rather than throwing — a saved document must always
  // open, the same rule validateCuts follows.
  it.each([-0.1, 1, 2, Number.NaN, Infinity])('rejects an impossible kerf (%s)', (kerf) => {
    const doc = migrateDocument({ version: 5, name: 'X', stock: { kerf }, boards: [] });
    expect(doc.stock.kerf).toBe(0.125);
  });

  it('accepts a zero kerf', () => {
    const doc = migrateDocument({ version: 5, name: 'X', stock: { kerf: 0 }, boards: [] });
    expect(doc.stock.kerf).toBe(0);
  });

  it('ignores a stock field that is not an object', () => {
    for (const stock of ['x', 3, null, []]) {
      expect(migrateDocument({ version: 5, name: 'X', stock, boards: [] }).stock.kerf).toBe(0.125);
    }
  });

  // The whole reason the version is bumped: without it, a v4 build would open
  // a file carrying a 1/4" kerf, silently drop it, and print a different sheet
  // count than the build that saved it.
  it('refuses a file from a newer build', () => {
    expect(() => migrateDocument({ version: 6, name: 'X', boards: [] })).toThrow(DocumentError);
  });

  it('walks a v1 file all the way to v5', () => {
    const doc = migrateDocument({
      version: 1,
      name: 'Ancient',
      boards: [{ name: 'A', length: 24, width: 4, thickness: 0.75, position: [0, 0, 0],
                 rotation: 270, standing: true, material: 'pine' }],
    });
    expect(doc.version).toBe(5);
    expect(doc.stock).toEqual({ kerf: 0.125 });
    expect(doc.boards[0].rotation).toBe(90);
    expect(doc.boards[0].posture).toBe('on-edge');
    expect(doc.boards[0].grain).toBe('length');
    expect(doc.boards[0].cuts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/document/document.test.ts -t 'schema v5'`
Expected: FAIL — `doc.stock` is undefined.

- [ ] **Step 3: Add the field and its default**

In `src/document/types.ts`, extend `SloydDocument` and add the default beside `DEFAULT_MATERIAL`:

```ts
export interface SloydDocument {
  version: number;
  name: string;
  units: { display: 'imperial-fractional'; precision: number };
  /**
   * Facts about the SHOP, not about the project's materials. A table saw takes
   * 1/8", a thin-kerf blade less, a CNC router 1/4" — that belongs to the
   * person, so it travels with their file and is undoable like anything else.
   * Sheet SIZE deliberately lives on MATERIALS instead; see SheetStock.
   */
  stock: { kerf: number };
  boards: Board[];
}

/** Inches. A standard table-saw blade. */
export const DEFAULT_KERF = 0.125;
```

- [ ] **Step 4: Bump the version and write the field**

In `src/document/document.ts`:

Change line 20 to `export const CURRENT_VERSION = 5;` and replace its (absent) comment with:

```ts
/**
 * v5 added `stock.kerf`.
 *
 * Note the bump is NOT needed to upgrade an old file — an absent `stock`
 * simply defaults, exactly as an absent `units.precision` does. It is needed
 * for the gate at the OTHER end: without it, a v4 build would open a file
 * where the user set a 1/4" kerf, silently drop the field, and print a
 * different sheet count than the build that saved it. A wrong purchasing
 * number with no indication anything was lost.
 */
export const CURRENT_VERSION = 5;
```

Import `DEFAULT_KERF` on line 1's import from `./types`.

In `createDocument`, add `stock: { kerf: DEFAULT_KERF },` after the `units:` line.

In `migrateDocument`, after the `precision` block (~line 316) and before the `return`:

```ts
  // A DOCUMENT-level field, so unlike foldRotationToV2/addPostureToV3/
  // addCutsToV4 it has no per-board upgrade step: it is read defensively off
  // the raw document and defaulted, exactly as `precision` above is. Clamped
  // rather than thrown on, because a saved document must always open.
  const rawStock = d.stock;
  const kerf =
    typeof rawStock === 'object' && rawStock !== null && !Array.isArray(rawStock) &&
    typeof (rawStock as { kerf?: unknown }).kerf === 'number' &&
    Number.isFinite((rawStock as { kerf: number }).kerf) &&
    (rawStock as { kerf: number }).kerf >= 0 &&
    (rawStock as { kerf: number }).kerf < 1
      ? (rawStock as { kerf: number }).kerf
      : DEFAULT_KERF;
```

and add `stock: { kerf },` to the returned object, after `units`.

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run src/document/document.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS. **If any existing test asserts `version: 4` or compares a whole document with `toEqual`, update it to expect 5 and the `stock` field** — that is a real consequence of the bump, not a test to work around.

Run: `npm run build`
Expected: clean. `store.ts` and `storage/browser.ts` may need no change; if `tsc` reports a missing `stock` on a document literal, add it there.

- [ ] **Step 6: Commit**

```bash
git add -A src/document src/store src/storage
git commit -m "feat: schema v5 adds stock.kerf"
```

---

## Task 3: Footprints — how a part lands on a sheet

**Files:**
- Create: `src/document/nesting.ts`
- Create: `src/document/nesting.test.ts`

**Interfaces:**
- Consumes: `SheetStock` (Task 1), `Board` from `./types`.
- Produces: `interface Footprint { w: number; h: number; turned: boolean }` and `footprintsOf(board: Board, stock: SheetStock): Footprint[]` — the allowed orientations, **preferred first**.

- [ ] **Step 1: Write the failing test**

Create `src/document/nesting.test.ts`:

```ts
import { footprintsOf } from './nesting';
import { createBoard } from './document';
import type { SheetStock } from './types';

const PLY: SheetStock = { length: 96, width: 48, rotate: 'grain' };
const MDF: SheetStock = { length: 96, width: 48, rotate: 'free' };

describe('footprintsOf', () => {
  // Under 'grain' the part's grain field DETERMINES its orientation — it is
  // not merely a veto on rotating. A part whose veneer runs across its width
  // is laid on the sheet that way, which is what makes the drawing true.
  it('lays a length-grained part along the sheet', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'length', material: 'plywood' });
    expect(footprintsOf(b, PLY)).toEqual([{ w: 30, h: 20, turned: false }]);
  });

  it('lays a width-grained part across the sheet', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'width', material: 'plywood' });
    expect(footprintsOf(b, PLY)).toEqual([{ w: 20, h: 30, turned: true }]);
  });

  it('offers one orientation only under a grain policy', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'width', material: 'plywood' });
    expect(footprintsOf(b, PLY)).toHaveLength(1);
  });

  // Free rotation prefers the orientation that opens the SHORTER shelf: a
  // shelf's height is fixed by its first part, so lying parts down wastes
  // less sheet width.
  it('offers both orientations for a free-rotating material, shortest shelf first', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'length', material: 'mdf' });
    expect(footprintsOf(b, MDF)).toEqual([
      { w: 30, h: 20, turned: false },
      { w: 20, h: 30, turned: true },
    ]);
  });

  it('prefers the same orientation regardless of which way grain points', () => {
    const b = createBoard({ length: 30, width: 20, grain: 'width', material: 'mdf' });
    expect(footprintsOf(b, MDF)[0]).toEqual({ w: 30, h: 20, turned: false });
  });

  // Not reachable through the UI (validateBoard normalises it away for sheet
  // goods) but a Board built in code can carry it. Defaulting beats throwing,
  // same narrow scope as materialLabel's `??`.
  it('treats a thickness-grained sheet part as length-grained', () => {
    const b = createBoard({ length: 30, width: 20, material: 'plywood' });
    expect(footprintsOf({ ...b, grain: 'thickness' }, PLY)).toEqual([
      { w: 30, h: 20, turned: false },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/document/nesting.test.ts`
Expected: FAIL — cannot resolve `./nesting`.

- [ ] **Step 3: Implement**

Create `src/document/nesting.ts`:

```ts
import type { Board, SheetStock } from './types';

/**
 * How a part lands on a sheet: its footprint AS PLACED.
 *
 * `w` runs along the sheet's length, `h` across it. `turned` is true when the
 * part's own length runs ACROSS the sheet.
 */
export interface Footprint {
  w: number;
  h: number;
  turned: boolean;
}

/**
 * The orientations a part is allowed to take, PREFERRED FIRST.
 *
 * Under `rotate: 'grain'` there is exactly one, and `board.grain` chooses it —
 * the field is doing real work here rather than being passively obeyed. Under
 * `rotate: 'free'` both are allowed, and the one that opens the SHORTER shelf
 * comes first: a shelf's height is fixed by its first part, so lying parts
 * down wastes less of the sheet's width.
 *
 * A part's THICKNESS never appears — it is the sheet's, which is why thickness
 * is a grouping key rather than a packing input.
 */
export function footprintsOf(board: Board, stock: SheetStock): Footprint[] {
  // 'thickness' is meaningless for a sheet good and validateBoard normalises
  // it away; a Board built in code could still carry it, and defaulting beats
  // throwing.
  const natural: Footprint =
    board.grain === 'width'
      ? { w: board.width, h: board.length, turned: true }
      : { w: board.length, h: board.width, turned: false };

  if (stock.rotate === 'grain') return [natural];

  const flipped: Footprint = { w: natural.h, h: natural.w, turned: !natural.turned };
  return natural.h <= flipped.h ? [natural, flipped] : [flipped, natural];
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/document/nesting.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/document/nesting.ts src/document/nesting.test.ts
git commit -m "feat: footprintsOf resolves a part's orientation on a sheet"
```

---

## Task 4: The packer

**Files:**
- Modify: `src/document/nesting.ts`
- Modify: `src/document/nesting.test.ts`

**Interfaces:**
- Consumes: `footprintsOf` (Task 3), `formatLength` from `../units/length`.
- Produces: `PlacedPart`, `NestedSheet`, `UnplaceablePart`, `Nesting`, and
  `buildNesting(boards: Board[], stock: SheetStock, kerf: number, precision: number): Nesting`.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/nesting.test.ts` (keep the existing `PLY`/`MDF` consts):

```ts
import { buildNesting, footprintsOf } from './nesting';   // update the existing import
import type { Nesting } from './nesting';

/** A plywood part of exactly these dimensions, grain along its length. */
const part = (length: number, width: number, name: string) =>
  createBoard({ name, length, width, thickness: 0.75, grain: 'length', material: 'plywood' });

/** Every pair of parts on one sheet, as [a, b]. */
const pairs = (n: Nesting) =>
  n.sheets.flatMap((s) =>
    s.parts.flatMap((a, i) => s.parts.slice(i + 1).map((b) => [a, b] as const)),
  );

const overlaps = (a: { x: number; y: number; w: number; h: number },
                  b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('buildNesting', () => {
  it('returns no sheets for no parts', () => {
    const n = buildNesting([], PLY, 0.125, 16);
    expect(n.sheets).toEqual([]);
    expect(n.unplaceable).toEqual([]);
    expect(n.label).toBe('0 sheets (96" × 48")');
    expect(n.sheet).toBe('96" × 48"');
  });

  it('labels one sheet in the singular', () => {
    expect(buildNesting([part(24, 12, 'A')], PLY, 0.125, 16).label)
      .toBe('1 sheet (96" × 48")');
  });

  // THE EPSILON CASE. `remaining = sheetLength - used` compared against a
  // part's extent is a SUBTRACTION RESULT compared against a bound — the exact
  // shape that made cutLabel wrong 2.8% of the time. Reverting the fits-test
  // to an exact `<=` fails this and nothing else.
  it('fits four 24-inch parts on a 96-inch sheet at zero kerf', () => {
    const n = buildNesting(
      [part(24, 12, 'A'), part(24, 12, 'B'), part(24, 12, 'C'), part(24, 12, 'D')],
      PLY, 0, 16,
    );
    expect(n.sheets).toHaveLength(1);
    expect(n.sheets[0].parts.map((p) => p.x)).toEqual([0, 24, 48, 72]);
  });

  // Kerf is not decoration: the same four parts need 96.375" and no longer fit.
  it('spends a second sheet once kerf is counted', () => {
    const n = buildNesting(
      [part(24, 12, 'A'), part(24, 12, 'B'), part(24, 12, 'C'), part(24, 12, 'D')],
      PLY, 0.125, 16,
    );
    expect(n.sheets).toHaveLength(1);
    expect(n.sheets[0].parts).toHaveLength(4);
    // Three of them ride the first shelf; the fourth opens a second shelf on
    // the same sheet rather than a second sheet.
    expect(n.sheets[0].parts.map((p) => [p.x, p.y])).toEqual([
      [0, 0], [24.125, 0], [48.25, 0], [0, 12.125],
    ]);
  });

  it('leaves no kerf at a sheet or shelf edge', () => {
    const n = buildNesting([part(24, 12, 'A')], PLY, 0.125, 16);
    expect(n.sheets[0].parts[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('opens a second sheet when the first is full', () => {
    const boards = Array.from({ length: 9 }, (_, i) => part(48, 24, `P${i}`));
    const n = buildNesting(boards, PLY, 0, 16);
    expect(n.sheets).toHaveLength(3);
    expect(n.sheets.flatMap((s) => s.parts)).toHaveLength(9);
  });

  it('never overlaps two parts and never leaves the sheet', () => {
    const boards = [
      part(30, 20, 'A'), part(30, 20, 'B'), part(18, 18, 'C'),
      part(48, 6, 'D'), part(12, 40, 'E'), part(7, 3, 'F'),
    ];
    const n = buildNesting(boards, PLY, 0.125, 16);
    for (const [a, b] of pairs(n)) expect(overlaps(a, b)).toBe(false);
    for (const s of n.sheets) {
      for (const p of s.parts) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.x + p.w).toBeLessThanOrEqual(96 + 1e-6);
        expect(p.y + p.h).toBeLessThanOrEqual(48 + 1e-6);
      }
    }
  });

  // THE GUILLOTINE PROPERTY. Cuttability is the entire justification for
  // choosing shelf packing over maxrects, so it is a test rather than a
  // comment: every part's across-sheet interval falls inside exactly one
  // shelf band, and the bands are disjoint. That is what lets a shop rip the
  // sheet into strips and then crosscut each strip.
  it('places every part inside exactly one disjoint shelf band', () => {
    const boards = [
      part(30, 20, 'A'), part(30, 20, 'B'), part(18, 18, 'C'),
      part(48, 6, 'D'), part(12, 40, 'E'), part(7, 3, 'F'),
    ];
    const n = buildNesting(boards, PLY, 0.125, 16);
    for (const s of n.sheets) {
      const bands: [number, number][] = [];
      for (const p of s.parts) {
        const band = bands.find(([lo]) => Math.abs(lo - p.y) < 1e-6);
        if (band) band[1] = Math.max(band[1], p.y + p.h);
        else bands.push([p.y, p.y + p.h]);
      }
      bands.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < bands.length; i += 1) {
        expect(bands[i][0]).toBeGreaterThanOrEqual(bands[i - 1][1] - 1e-6);
      }
      // Every part starts on a band boundary — nothing floats mid-band.
      for (const p of s.parts) {
        expect(bands.some(([lo, hi]) => Math.abs(lo - p.y) < 1e-6 && p.y + p.h <= hi + 1e-6))
          .toBe(true);
      }
    }
  });

  it('records a part too big for any sheet without opening one', () => {
    const n = buildNesting([part(100, 30, 'Back Panel')], PLY, 0.125, 16);
    expect(n.sheets).toEqual([]);
    expect(n.unplaceable).toEqual([
      { boardId: expect.any(String), name: 'Back Panel', dims: '100" × 30"' },
    ]);
  });

  it('still packs the parts that do fit', () => {
    const n = buildNesting([part(100, 30, 'Oops'), part(24, 12, 'Fine')], PLY, 0.125, 16);
    expect(n.unplaceable).toHaveLength(1);
    expect(n.sheets).toHaveLength(1);
    expect(n.sheets[0].parts[0].name).toBe('Fine');
  });

  // `turned` follows the part's grain, not the packer's convenience: a
  // width-grained part on a tall sheet is laid across it, and the flag says so.
  it('reports a width-grained part as turned', () => {
    const ply = buildNesting(
      [createBoard({ name: 'X', length: 60, width: 40, grain: 'width', material: 'plywood' })],
      { length: 48, width: 96, rotate: 'grain' }, 0, 16,
    );
    expect(ply.sheets).toHaveLength(1);
    expect(ply.sheets[0].parts[0]).toMatchObject({ w: 40, h: 60, turned: true });
  });

  // DETERMINISM. Nothing else catches losing the boardId tiebreak, and losing
  // it produces a layout that reshuffles as parts are renamed.
  it('produces identical output whatever order the boards arrive in', () => {
    const boards = [
      part(30, 20, 'A'), part(30, 20, 'B'), part(18, 18, 'C'),
      part(48, 6, 'D'), part(12, 40, 'E'), part(7, 3, 'F'),
    ];
    const forward = buildNesting(boards, PLY, 0.125, 16);
    const reversed = buildNesting([...boards].reverse(), PLY, 0.125, 16);
    const shuffled = buildNesting([boards[3], boards[0], boards[5], boards[2], boards[4], boards[1]], PLY, 0.125, 16);
    expect(reversed).toEqual(forward);
    expect(shuffled).toEqual(forward);
  });

  it('packs free-rotating material at least as tightly as grain-locked', () => {
    const boards = Array.from({ length: 4 }, (_, i) =>
      createBoard({ name: `P${i}`, length: 40, width: 40, grain: 'length', material: 'mdf' }));
    expect(buildNesting(boards, MDF, 0, 16).sheets.length)
      .toBeLessThanOrEqual(buildNesting(boards, PLY, 0, 16).sheets.length);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/document/nesting.test.ts`
Expected: FAIL — `buildNesting` is not exported.

- [ ] **Step 3: Implement**

Append to `src/document/nesting.ts` (and add `import { formatLength } from '../units/length';` at the top):

```ts
/** One part, placed. Inches from the sheet's min corner. */
export interface PlacedPart {
  boardId: string;
  name: string;
  /** Along the sheet's length. */
  x: number;
  /** Across the sheet's width. */
  y: number;
  /** Footprint as placed — see Footprint. */
  w: number;
  h: number;
  turned: boolean;
}

export interface NestedSheet {
  parts: PlacedPart[];
}

export interface UnplaceablePart {
  boardId: string;
  name: string;
  /** Already formatted, e.g. `100" × 30"`. */
  dims: string;
}

export interface Nesting {
  sheets: NestedSheet[];
  /** Parts that fit no empty sheet in any allowed orientation. NEVER dropped. */
  unplaceable: UnplaceablePart[];
  /** e.g. `3 sheets (96" × 48")`, already formatted. */
  label: string;
  /**
   * Just the sheet size, e.g. `96" × 48"`. A separate field rather than a
   * substring of `label`, so the unplaceable line can name the sheet a part
   * failed to fit without a panel picking `label` apart with a regex — the
   * panel formats nothing, and that includes un-formatting.
   */
  sheet: string;
}

/**
 * Tolerance on the fits-test, and it is the OPPOSITE of invariant 18's rule.
 *
 * `remaining = sheetLength - used` compared against a part's extent is a
 * SUBTRACTION RESULT compared against a bound — precisely the shape
 * cutSignature's comment names as the hazard that made cutLabel wrong 2.8% of
 * the time. Four 24" parts at zero kerf must not fail on the fourth.
 *
 * Invariant 18 says cut signatures compare EXACTLY, and that stays true: there
 * both sides are stored values a user typed, and two cuts entered identically
 * hold identical doubles. Here one side is computed. Same rule, different
 * arithmetic — round nothing that is machined, tolerate float error where
 * float error is what you have.
 */
const EPS = 1e-6;

const fits = (extent: number, room: number): boolean => extent <= room + EPS;

/** A full-length strip. Its height is fixed by its first — therefore tallest — part. */
interface Shelf {
  y: number;
  h: number;
  /** How far along the sheet's length this shelf is filled. */
  used: number;
}

interface WorkingSheet {
  parts: PlacedPart[];
  shelves: Shelf[];
}

function placeOn(
  sheet: WorkingSheet,
  board: Board,
  options: Footprint[],
  stock: SheetStock,
  kerf: number,
): boolean {
  const put = (f: Footprint, x: number, y: number) => {
    sheet.parts.push({
      boardId: board.id, name: board.name, x, y, w: f.w, h: f.h, turned: f.turned,
    });
  };

  for (const shelf of sheet.shelves) {
    for (const f of options) {
      // Kerf between neighbours only — never at an edge.
      const x = shelf.used + kerf;
      if (fits(x + f.w, stock.length) && fits(f.h, shelf.h)) {
        put(f, x, shelf.y);
        shelf.used = x + f.w;
        return true;
      }
    }
  }

  const last = sheet.shelves[sheet.shelves.length - 1];
  const y = last ? last.y + last.h + kerf : 0;
  for (const f of options) {
    if (fits(f.w, stock.length) && fits(y + f.h, stock.width)) {
      put(f, 0, y);
      sheet.shelves.push({ y, h: f.h, used: f.w });
      return true;
    }
  }

  return false;
}

/**
 * Pack one material-and-thickness group's parts onto sheets.
 *
 * SHELF FIRST-FIT-DECREASING, and the choice is a domain fact rather than a
 * simplification. A shop breaks sheets down on a table saw or with a track
 * saw: EVERY CUT RUNS EDGE TO EDGE. A maxrects packer produces denser layouts
 * containing placements nobody can physically cut — an L-shaped remainder
 * needs a cut that stops in the middle of the sheet. Shelves are ripped, then
 * each strip is crosscut, which is exactly how the work is done.
 *
 * Takes BOARDS, never CutListRows. A row is representative — two parts share
 * one when they PRINT identically at the document's precision — and a layout
 * built from rounded dimensions can overflow a real sheet. Here the error
 * would decide whether you buy two sheets or three, so every rectangle
 * carries its own board's exact footprint. Fourth instance of the shape
 * follow-ups 55 and 82 record.
 *
 * STOCK, NOT REMAINDER: `board.cuts` is not read. A part is cut from the sheet
 * at its stock dimensions and the dados happen afterward, out of material
 * already on the bench. A reader arriving from cuts.ts is primed to subtract;
 * don't.
 */
export function buildNesting(
  boards: Board[],
  stock: SheetStock,
  kerf: number,
  precision: number,
): Nesting {
  // Decreasing by the preferred orientation's across-sheet extent, so a
  // shelf's first part really is its tallest. The `id` tiebreak is what makes
  // the order TOTAL, and therefore the output stable under input permutation —
  // without it a layout reshuffles as parts are renamed.
  const sorted = [...boards].sort((a, b) => {
    const fa = footprintsOf(a, stock)[0];
    const fb = footprintsOf(b, stock)[0];
    return fb.h - fa.h || fb.w - fa.w || a.id.localeCompare(b.id);
  });

  const sheets: WorkingSheet[] = [];
  const unplaceable: UnplaceablePart[] = [];

  for (const board of sorted) {
    const options = footprintsOf(board, stock);

    // Checked against an EMPTY sheet, before anything is opened: a part that
    // can never fit is reported, not dropped (follow-ups 48/49's shape — never
    // render nothing for a state the user created) and cannot spin the loop.
    if (!options.some((f) => fits(f.w, stock.length) && fits(f.h, stock.width))) {
      unplaceable.push({
        boardId: board.id,
        name: board.name,
        dims: `${formatLength(board.length, precision)} × ${formatLength(board.width, precision)}`,
      });
      continue;
    }

    if (!sheets.some((sheet) => placeOn(sheet, board, options, stock, kerf))) {
      const sheet: WorkingSheet = { parts: [], shelves: [] };
      sheets.push(sheet);
      // Guaranteed by the check above: it fits an empty sheet.
      placeOn(sheet, board, options, stock, kerf);
    }
  }

  const count = sheets.length;
  const sheet =
    `${formatLength(stock.length, precision)} × ${formatLength(stock.width, precision)}`;
  return {
    sheets: sheets.map((s) => ({ parts: s.parts })),
    unplaceable,
    label: `${count} sheet${count === 1 ? '' : 's'} (${sheet})`,
    sheet,
  };
}
```

Note the `Board` type is already imported by Task 3's `import type { Board, SheetStock } from './types';` — do not add a second import line.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/document/nesting.test.ts`
Expected: PASS.

**If the kerf test's expected coordinates (`[0,0] [24.125,0] [48.25,0] [0,12.125]`) do not match, STOP and escalate rather than editing the expectation.** They are derived: three 24" parts plus two 1/8" kerfs is 72.25", a fourth needs 96.375" > 96, so it opens a shelf at `y = 12 + 0.125`. If the code disagrees, one of the two is wrong and which one is a decision, not a fix.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/document/nesting.ts src/document/nesting.test.ts
git commit -m "feat: shelf first-fit-decreasing sheet packer"
```

---

## Task 5: Attach nesting to the cut list

**Files:**
- Modify: `src/document/cutlist.ts` (`CutListGroup` interface ~lines 70-92, `buildCutList` ~lines 217-300)
- Modify: `src/document/document.ts` (re-exports, ~lines 13-18)
- Modify: `src/document/cutlist.test.ts`

**Interfaces:**
- Consumes: `buildNesting`, `Nesting` (Task 4), `sheetStockOf` (Task 1), `doc.stock.kerf` (Task 2).
- Produces: `CutListGroup.nesting?: Nesting` — present exactly when `isSheetGood(group.material)`.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/cutlist.test.ts`:

```ts
describe('sheet nesting on the cut list', () => {
  it('gives a sheet-goods group a nesting', () => {
    const list = buildCutList(docWith(
      { material: 'plywood', thickness: 0.75, length: 24, width: 12 },
    ));
    expect(list.groups[0].nesting?.label).toBe('1 sheet (96" × 48")');
    expect(list.groups[0].nesting?.sheets).toHaveLength(1);
  });

  it('gives a solid-stock group none', () => {
    const list = buildCutList(docWith({ material: 'pine' }));
    expect(list.groups[0].nesting).toBeUndefined();
  });

  // Every board in the group is packed, not one rectangle per ROW: a row is
  // representative, and four identical parts still need four rectangles.
  it('packs every board, not every row', () => {
    const list = buildCutList(docWith(
      ...Array.from({ length: 4 }, () => ({ material: 'plywood', thickness: 0.75, length: 24, width: 12 })),
    ));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(4);
    expect(list.groups[0].nesting!.sheets.flatMap((s) => s.parts)).toHaveLength(4);
  });

  it('packs each thickness onto its own sheets', () => {
    const list = buildCutList(docWith(
      { material: 'plywood', thickness: 0.75, length: 24, width: 12 },
      { material: 'plywood', thickness: 0.5, length: 24, width: 12 },
    ));
    expect(list.groups).toHaveLength(2);
    for (const g of list.groups) expect(g.nesting!.sheets).toHaveLength(1);
  });

  it("uses the document's kerf", () => {
    const four = Array.from({ length: 4 }, () => (
      { material: 'plywood', thickness: 0.75, length: 24, width: 12 }));
    const tight = { ...docWith(...four), stock: { kerf: 0 } };
    const wide = { ...docWith(...four), stock: { kerf: 0.125 } };
    expect(buildCutList(tight).groups[0].nesting!.sheets[0].parts.map((p) => p.x))
      .toEqual([0, 24, 48, 72]);
    expect(buildCutList(wide).groups[0].nesting!.sheets[0].parts.map((p) => p.y))
      .toEqual([0, 0, 0, 12.125]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/document/cutlist.test.ts -t 'sheet nesting'`
Expected: FAIL — `nesting` is undefined.

- [ ] **Step 3: Implement**

In `src/document/cutlist.ts`:

Add to the imports:

```ts
import { MATERIALS, isSheetGood, sheetStockOf } from './types';
import { buildNesting } from './nesting';
import type { Nesting } from './nesting';
```

Add to `CutListGroup`, after `stock: string;`:

```ts
  /**
   * How this group's parts lay out on full sheets — present exactly when
   * `isSheetGood(material)`, absent otherwise, so the panel's existing
   * is-this-sheet-goods branch is the only condition it needs.
   *
   * Built from this group's BOARDS, not its rows: a row is representative and
   * a layout built from rounded dimensions can overflow a real sheet. See
   * buildNesting's own comment.
   */
  nesting?: Nesting;
```

In `buildCutList`, declare a side map beside `groups` and `rows`:

```ts
  // Boards per group, kept beside the groups rather than on them: nesting
  // needs every board's exact footprint, and CutListGroup deliberately
  // carries rows (representative) rather than boards.
  const groupBoards = new Map<CutListGroup, Board[]>();
```

Set it where the group is created — after `groups.set(groupKey, group);` add `groupBoards.set(group, []);` — and push in the same visit that accumulates stock, right after `group.stockInches += stock;`:

```ts
    groupBoards.get(group)!.push(board);
```

In the final `for (const group of out)` loop, after the `row.stock` line:

```ts
    // One nesting per group, because a group IS the packing partition: one
    // material (so one sheet size and one rotation policy) and one thickness
    // (parts of different thickness cannot share a sheet).
    const sheet = sheetStockOf(group.material);
    if (sheet) {
      group.nesting = buildNesting(groupBoards.get(group)!, sheet, doc.stock.kerf, precision);
    }
```

In `src/document/document.ts`, add beside the other cut-list re-exports:

```ts
export { buildNesting, footprintsOf } from './nesting';
export type { Nesting, NestedSheet, PlacedPart, UnplaceablePart, Footprint } from './nesting';
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run src/document/cutlist.test.ts`
Expected: PASS.

Run: `npm test && npm run build`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/document/cutlist.ts src/document/cutlist.test.ts src/document/document.ts
git commit -m "feat: cut list groups carry their sheet nesting"
```

---

## Task 6: `fitLabel` — the label fallback ladder

**Files:**
- Modify: `src/panels/diagramLabels.ts` (append)
- Create: `src/panels/diagramLabels.fitLabel.test.ts`

**Interfaces:**
- Consumes: `labelWidth`, `labelHeight` (existing).
- Produces: `type LabelTier = 'full' | 'name' | 'index'` and `fitLabel(lines: string[], boxW: number, boxH: number): LabelTier`.

- [ ] **Step 1: Write the failing test**

Create `src/panels/diagramLabels.fitLabel.test.ts`:

```ts
import { fitLabel, labelWidth, labelHeight } from './diagramLabels';

const NAME = 'Side Panel';
const DIMS = '24" × 12"';
const wide = Math.max(labelWidth(NAME), labelWidth(DIMS)) + 1;
const tall = labelHeight() * 2 + 1;

describe('fitLabel', () => {
  it('shows both lines when both fit', () => {
    expect(fitLabel([NAME, DIMS], wide, tall)).toBe('full');
  });

  it('drops to the name when the box is too short for two lines', () => {
    expect(fitLabel([NAME, DIMS], wide, labelHeight() + 1)).toBe('name');
  });

  it('drops to the name when the dimensions line is too wide', () => {
    expect(fitLabel([NAME, DIMS], labelWidth(NAME) + 1, tall)).toBe('name');
  });

  // A 3-inch-wide part gets an index rather than a name bleeding across its
  // neighbours. That is follow-up 59's defect and the reason width is measured
  // rather than estimated.
  it('drops to an index when even the name will not fit', () => {
    expect(fitLabel([NAME, DIMS], labelWidth(NAME) - 1, tall)).toBe('index');
  });

  it('drops to an index when nothing fits vertically', () => {
    expect(fitLabel([NAME, DIMS], wide, labelHeight() - 1)).toBe('index');
  });

  it('treats an empty label list as an index', () => {
    expect(fitLabel([], wide, tall)).toBe('index');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/panels/diagramLabels.fitLabel.test.ts`
Expected: FAIL — `fitLabel` is not exported.

- [ ] **Step 3: Implement**

Append to `src/panels/diagramLabels.ts`:

```ts
/** Which of a sheet-layout label's three tiers a part's rectangle can hold. */
export type LabelTier = 'full' | 'name' | 'index';

/**
 * The fallback ladder for a label drawn INSIDE its own rectangle.
 *
 * `packRow` is not used on a sheet layout and does not need to be: every label
 * lives in its own disjoint rect, so two labels cannot collide however long
 * their strings are. What CAN happen is a label wider than the part it names —
 * follow-up 59's defect exactly — so the three tiers degrade instead: both
 * lines, then the name alone, then a bare index keyed to a list beside the
 * sheet.
 *
 * Measured, not estimated: `labelWidth`'s monospace arithmetic is the same
 * one PartDiagram's leader rows rest on, which is why `--font-num` on these
 * elements is load-bearing (invariant 19).
 *
 * `lines[0]` is the name; the rest are detail lines.
 */
export function fitLabel(lines: string[], boxW: number, boxH: number): LabelTier {
  if (lines.length === 0) return 'index';
  const room = (s: string) => labelWidth(s) <= boxW;
  if (lines.every(room) && labelHeight() * lines.length <= boxH) return 'full';
  if (room(lines[0]) && labelHeight() <= boxH) return 'name';
  return 'index';
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/panels/diagramLabels.fitLabel.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/panels/diagramLabels.ts src/panels/diagramLabels.fitLabel.test.ts
git commit -m "feat: fitLabel picks a label tier that fits its rectangle"
```

---

## Task 7: Draw the sheets

**Files:**
- Create: `src/panels/SheetLayout.tsx`
- Modify: `src/panels/CutList.tsx`
- Modify: `src/styles.css` (screen rules, and the `@media print` block at line 657)

**Interfaces:**
- Consumes: `Nesting`, `NestedSheet`, `PlacedPart` (Task 5's re-exports), `fitLabel` (Task 6), `LABEL_SIZE`, `labelWidth`, `labelHeight`, `LABEL_ASCENT` from `./diagramLabels`, `DRAW_WIDTH` from `./diagramScale`, `SheetStock` (Task 1).
- Produces: `SheetLayout({ nesting, stock }: { nesting: Nesting; stock: SheetStock })`.

- [ ] **Step 1: Write the component**

Create `src/panels/SheetLayout.tsx`:

```tsx
import type { Nesting, NestedSheet, SheetStock } from '../document/document';
import { DRAW_WIDTH } from './diagramScale';
import { fitLabel, labelHeight, LABEL_ASCENT, LABEL_SIZE } from './diagramLabels';

/** Clearance between a label and its rectangle's edge, in drawing units. */
const PAD = 6;

/**
 * One sheet of stock with the parts laid out on it.
 *
 * NOT an extension of PartDiagram: a sheet with parts on it and a board with
 * cuts in it are different drawings that happen to both be SVG — the
 * (face, from) view model, the depth field, the hatch and the leader rows have
 * no meaning here.
 *
 * Formats nothing. Every string arrives from `buildNesting`, the rule
 * CutList.tsx and PartDiagram.tsx already follow.
 *
 * One uniform scale, and deliberately no `fitView`: that exists because a
 * board's cross-section can be too thin to draw a dado on and a square panel
 * can grow off the page. A sheet has a fixed aspect and neither problem.
 *
 * Part fills are SVG `fill` attributes — FOREGROUND content, exactly like the
 * diagram hatch — so they survive printing with Chrome's "Background graphics"
 * off. A CSS background would not.
 */
function Sheet({ sheet, stock, index }: { sheet: NestedSheet; stock: SheetStock; index: number }) {
  const s = DRAW_WIDTH / stock.length;
  const h = stock.width * s;

  const keyed: { n: number; name: string }[] = [];

  return (
    <figure className="cutlist-layout">
      <figcaption className="cutlist-layout-head">Sheet {index + 1}</figcaption>
      <svg
        viewBox={`0 0 ${DRAW_WIDTH} ${h}`}
        fontSize={LABEL_SIZE}
        role="img"
        aria-label={`Sheet ${index + 1}, ${sheet.parts.length} parts`}
      >
        <rect className="cutlist-layout-sheet" x={0} y={0} width={DRAW_WIDTH} height={h} />
        {sheet.parts.map((p, i) => {
          const x = p.x * s;
          const y = p.y * s;
          const w = p.w * s;
          const ph = p.h * s;
          const dims = `${p.w}" × ${p.h}"`;
          const tier = fitLabel([p.name, dims], w - 2 * PAD, ph - 2 * PAD);
          if (tier === 'index') keyed.push({ n: i + 1, name: `${p.name} — ${dims}` });
          const cx = x + w / 2;
          const cy = y + ph / 2;
          // LABEL_ASCENT/2 centres the glyph box on cy rather than sitting the
          // baseline on it — the same measured box PartDiagram's rotated
          // columns use.
          const base = cy + LABEL_ASCENT / 2;
          return (
            <g key={p.boardId}>
              <rect className="cutlist-layout-part" x={x} y={y} width={w} height={ph} />
              {tier === 'full' && (
                <>
                  <text x={cx} y={base - labelHeight() / 2} textAnchor="middle">{p.name}</text>
                  <text x={cx} y={base + labelHeight() / 2} textAnchor="middle">{dims}</text>
                </>
              )}
              {tier === 'name' && <text x={cx} y={base} textAnchor="middle">{p.name}</text>}
              {tier === 'index' && <text x={cx} y={base} textAnchor="middle">{i + 1}</text>}
            </g>
          );
        })}
      </svg>
      {keyed.length > 0 && (
        <ul className="cutlist-layout-key">
          {keyed.map((k) => <li key={k.n}>{k.n}. {k.name}</li>)}
        </ul>
      )}
    </figure>
  );
}

export function SheetLayout({ nesting, stock }: { nesting: Nesting; stock: SheetStock }) {
  return (
    <>
      {nesting.sheets.map((sheet, i) => (
        <Sheet key={i} sheet={sheet} stock={stock} index={i} />
      ))}
    </>
  );
}
```

- [ ] **Step 2: Wire it into the sheet**

In `src/panels/CutList.tsx`:

Add imports:

```tsx
import { buildCutList, sheetStockOf } from '../document/document';
import { SheetLayout } from './SheetLayout';
```

Add the toggle's state beside `diagrams`:

```tsx
  /**
   * Whether sheet layouts are drawn. LOCAL VIEW STATE, same reasoning as
   * `diagrams` above. Separate from the Diagrams select on purpose: "all
   * parts / joinery only / none" is a statement about PER-PART drawings and
   * has no meaning for a sheet, so folding these in would make one control
   * answer two unrelated questions.
   */
  const [layouts, setLayouts] = useState(true);
```

Add the control inside `.cutlist-actions`, before the Print button:

```tsx
            <label className="cutlist-layout-mode">
              <input
                type="checkbox"
                checked={layouts}
                onChange={(e) => setLayouts(e.target.checked)}
              />
              Sheet layouts
            </label>
```

Replace the group's `<h3>{group.label}</h3>` with:

```tsx
              <h3>
                {group.label}
                {group.nesting && (
                  <span className="cutlist-layout-count"> · {group.nesting.label}</span>
                )}
              </h3>
              {group.nesting?.unplaceable.map((p) => (
                <p className="cutlist-unplaceable" key={p.boardId}>
                  {p.name} ({p.dims}) does not fit a {group.nesting!.sheet} sheet.
                </p>
              ))}
```

and after the `<p className="cutlist-subtotal">…</p>` block, still inside the `<section>`:

```tsx
              {layouts && group.nesting && group.nesting.sheets.length > 0 && (
                <SheetLayout nesting={group.nesting} stock={sheetStockOf(group.material)!} />
              )}
```

- [ ] **Step 3: Add the screen styles**

Append to the screen section of `src/styles.css` (near the other `.cutlist-*` rules, NOT inside `@media print`):

```css
/* `.cutlist-sheet` is the printable modal itself — every class this round adds
   uses the `cutlist-layout-` prefix so the two never collide. */
.cutlist-layout-count { color: var(--ink-dim); font-weight: 400; }

.cutlist-unplaceable {
  color: var(--warn, #b4532a);
  margin: 0.25rem 0;
}

.cutlist-layout { margin: 0.75rem 0 1.25rem; }

.cutlist-layout-head {
  color: var(--ink-dim);
  margin-bottom: 0.25rem;
}

.cutlist-layout svg {
  width: 100%;
  height: auto;
  font-family: var(--font-num);
  fill: var(--ink);
  stroke: none;
}

.cutlist-layout-sheet {
  fill: none;
  stroke: var(--ink-dim);
  stroke-width: 2;
}

.cutlist-layout-part {
  fill: var(--panel-2, #2a2a28);
  stroke: var(--ink);
  stroke-width: 2;
}

.cutlist-layout-key {
  color: var(--ink-dim);
  margin: 0.25rem 0 0;
  padding-left: 1rem;
}
```

**Do not set `font-size` on `.cutlist-layout svg text`** — `LABEL_SIZE` is applied as an attribute and has exactly one home (invariant 19). `--font-num` here is load-bearing for the same reason: `labelWidth`'s fixed advance is only true of a monospace face.

- [ ] **Step 4: Add the print overrides**

Inside `@media print` in `src/styles.css`, add `.cutlist-layout-count`, `.cutlist-layout-head` and `.cutlist-layout-key` to the enumerated black-text list (the block ending `.cutlist-setup { color: #000; }`), and add after the existing `.cutlist-subtotal .cutlist-stock` rule:

```css
  /* Follow-ups 58 and 81 are the same defect twice: an enumerated single-class
     override outranked by a more specific screen rule. `.cutlist-layout svg`
     sets `fill` at specificity (0,1,1), so a bare `.cutlist-layout-part` here
     would lose. These match or beat it deliberately. */
  .cutlist-layout svg { fill: #000; }
  .cutlist-layout-part { fill: #fff; stroke: #000; }
  .cutlist-layout-sheet { stroke: #000; }
  .cutlist-unplaceable { color: #000; font-weight: 600; }
  .cutlist-layout { break-inside: avoid; }
```

- [ ] **Step 5: Typecheck and run the suite**

Run: `npm run build`
Expected: clean. `sheetStockOf(group.material)!` is non-null wherever `group.nesting` exists — if `tsc` complains, that is the assertion doing its job, not a reason to widen a type.

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/panels/SheetLayout.tsx src/panels/CutList.tsx src/styles.css
git commit -m "feat: draw sheet layouts on the cut list"
```

---

## Task 8: Browser verification

**Files:** none changed unless a defect is found. Report to `docs/browser-verification-sheet-nesting.md` (create).

This repo's rule: **the viewport and SVG output are verified by driving a real browser, not by asserting on mocks.** Follow-up 81 is the standing warning — a print-block defect survived a task review *and* an implementer self-review, and was caught only by rendering the page.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev -- --port 5199`
(Background it. Use a port unlikely to collide.)

- [ ] **Step 2: Build a plywood project**

Using the Playwright MCP, add at least eight plywood parts of mixed sizes to one project — include a 3"-wide sliver (to exercise the `index` tier), a part with `grain: 'width'`, and a part 100" long (to exercise `unplaceable`). Add two MDF parts as well, to see free rotation. Open the cut list.

- [ ] **Step 3: Screenshot and read the layout**

Capture the sheet-goods group. Confirm by eye:
- the sheet count in the heading matches the number of drawings;
- no label bleeds outside its rectangle, and the sliver shows an index with a key entry below;
- the unplaceable part is named and no sheet was opened for it;
- parts do not overlap and none crosses the sheet outline.

- [ ] **Step 4: Check print colours by computed style, not by reading CSS**

This is the step follow-ups 58 and 81 exist for. With `emulateMedia({ media: 'print' })`, evaluate:

```js
['.cutlist-layout-count', '.cutlist-layout-head', '.cutlist-unplaceable', '.cutlist-layout-key']
  .map((sel) => [sel, getComputedStyle(document.querySelector(sel)).color]);
```

Expected: every entry `rgb(0, 0, 0)`. Then check the part rects:

```js
[getComputedStyle(document.querySelector('.cutlist-layout-part')).fill,
 getComputedStyle(document.querySelector('.cutlist-layout-sheet')).stroke];
```

Expected: `rgb(255, 255, 255)` and `rgb(0, 0, 0)`.

Take a screenshot under print emulation too — a computed-style check confirms the cascade, not the composition.

- [ ] **Step 5: Record what was and was not verified**

Write `docs/browser-verification-sheet-nesting.md` with: what was rendered, the computed-style values observed, any constant retuned, and the standing gap — **this host's Playwright exposes no `pdf()`, so a real print-to-PDF render remains unverified** (follow-ups 70, 79, 84).

- [ ] **Step 6: Commit**

```bash
git add docs/browser-verification-sheet-nesting.md
git commit -m "docs: browser verification for sheet nesting"
```

If a defect was found, fix it in its own commit first, then re-verify before writing the report.

---

## Task 9: Documentation

**Files:**
- Modify: `docs/follow-ups.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add the follow-ups section**

Append a "From the sheet-nesting round" section to `docs/follow-ups.md`, numbered from 85. Record at minimum:
- shelf FFD's density cost versus maxrects, and why it is not a defect;
- what `buildNesting` deliberately does not do (no offcut tracking, no waste factor, no rounding up — carrying follow-up 83's rule forward);
- the still-unverified print-to-PDF render (carrying 70, 79, 84);
- anything the browser pass in Task 8 found or could not check.

- [ ] **Step 2: Update CLAUDE.md**

- Move sheet-goods nesting out of "NEXT LINE OF WORK" and into a "What the sheet-nesting round did" paragraph, following the shape of the board-feet paragraph.
- Update the **Status** line's schema version and test count. **Get the count by running `npm test` and reading it — do not estimate.**
- Update the **Architecture** section: `CURRENT_VERSION` is 5, and the v5 step is document-level rather than per-board (state that explicitly — it is the first migration in the chain that is not a `rawBoards.map`).
- Add `nesting.ts` and `SheetLayout.tsx` to **Where things live**.
- Add the new invariant: **`nesting.ts`'s fits-test uses an epsilon, and this is the deliberate opposite of invariant 18** — one side is computed there, both sides are stored values here.
- Update the cut list §7 line: nesting is no longer deferred, leaving CSV export and name run-collapsing as the declined items.
- Note that `MATERIALS.sheet` is now shaped for a future custom-materials round.

- [ ] **Step 3: Commit**

```bash
git add docs/follow-ups.md CLAUDE.md
git commit -m "docs: record the sheet-nesting round"
```

- [ ] **Step 4: Merge**

```bash
npm test && npm run build
git checkout master
git merge --no-ff feat/sheet-nesting -m "Merge feat/sheet-nesting: sheet counts and layouts on the cut list"
git branch -d feat/sheet-nesting
```

**Do not deploy.** `master` is already ahead of production by two rounds and that deferral was deliberate — see CLAUDE.md.

---

## Self-review notes

**Spec coverage.** §2.1 → Task 1. §2.2 → Task 2. §2.3 → Task 3. §3 → Tasks 3-5 (§3.4 → Task 5). §4 → Task 4 (§4.1 epsilon and §4.2 unplaceable both have named tests). §5 → Task 7 (§5.1 ladder → Task 6, §5.3 toggle → Task 7 step 2, §5.4 print → Task 7 step 4 and Task 8 step 4). §6 → tests throughout, §6.2 → Task 8. §7 non-goals → Task 9's follow-ups.

**Known omission, stated rather than hidden:** the plan adds no UI for editing `stock.kerf`. The field is migrated, defaulted, validated, undoable and used; changing it requires editing the JSON. A kerf control belongs with the custom-materials round's settings surface, and adding one here would mean a store action and a toolbar or preferences panel that nothing else in this round needs. If the user wants it now, it is a small addition to `Toolbar.tsx` plus a `setKerf` store action — but it is not in these tasks.
