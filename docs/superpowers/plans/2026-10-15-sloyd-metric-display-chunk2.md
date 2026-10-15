# Metric Display — Chunk 2 (drawings, buying, grid) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish metric display: in a metric project the Plans sheet, part diagrams and sheet-nesting labels read bare
millimetres with one "Dimensions in mm" note per sheet, the Buying section adds mm to the trade dimensions it shows and
reads the parts in mm, and the viewport grid steps 10 mm / 100 mm / 1 m. Imperial output stays byte-for-byte unchanged.
Chunks 1 and 2 then deploy together.

**Architecture:** The chunk-2 holders that chunk 1 pinned to `imperialAt(precision)` (`dimensions.ts`, `diagram.ts`' own
labels, `nesting.ts`' `formatDims`, `purchase.ts`) take the document's `Units` and format drawings with
`formatLengthBare(v, units)` (metric `762`, imperial identical to `formatLength`). The note is rendered by the two sheet
panels. Buying formats PARTS in the project's units and TRADE sizes (stock boards, planing stock) imperial with a metric
bracket through one new helper, `tradeLength`. `gridDensity` gains a units argument and a metric ladder.

**Tech Stack:** TypeScript, React, Vitest + Testing Library, three.js/r3f (grid only).

**Spec:** `docs/superpowers/specs/2026-10-15-sloyd-metric-display-design.md` (R3, R8, §4 chunk 2, §5 inv 52, §7). Chunk 1
is merged (`80d41fb`): `src/units/length.ts` has `Units`, `IMPERIAL`, `imperialAt`, `isMetric`, `formatLength`,
`parseLength`, `formatMm`, `formatLengthBare`, `formatSize`, `floorToTick`; CLAUDE.md has invariant 52.

## Global Constraints

- Imperial output byte-for-byte unchanged: NO existing expected value changes (a test's CALL may change).
- Drawings (Plans sheet, part diagrams, sheet-nesting labels) in metric: bare numbers (`762`), whole mm, and one note per
  sheet: `Dimensions in mm` (R8). Imperial drawings keep the ″ mark.
- inv 19: a label's measured string and drawn string are ONE string, built in the module (`nesting.ts`, `diagram.ts`,
  `dimensions.ts`), never assembled in a component.
- Buying (R3): trade units stay — board feet, $/bd ft, nominal names (`2×4`), stock lengths (`8′`), sheet sizes; an actual
  TRADE dimension shown on a buying line adds mm in brackets in a metric project. A PART's dimensions read in the
  project's units (they are the user's parts, typed in mm).
- Grid (metric): cell / section 10 mm / 100 mm, 100 mm / 1 m, 1 m / 10 m — the same density rule; imperial ladder
  1″ / 12″ / 144″ unchanged.
- inv 52: every length → text through `units/length.ts` with the document's `Units`. After this chunk, `imperialAt`
  appears in production only for the Materials dialog (P1), the hole pitch floor, and `stockLengthText`'s non-foot
  fallback inside `tradeLength`.
- No schema change. Branch `metric-2`, merged locally `--no-ff`. Deploy chunk 1 + 2 together, on the user's word.

## Review Focus

1. **A dimension chain step that rounds to 0 mm** (two coordinates 0.3 mm apart) must be dropped as today's imperial path
   drops one reading `0"` → Task 1 test "a sub-mm chain gap is skipped in metric".
2. **A nesting label that fit in inches but not in mm** (or the reverse): the label tier must be re-decided from the mm
   string (inv 19) → Task 1 test asserts `fitLabel`'s input is the bare mm string (read `SheetLayout`'s use).
3. **Buying in metric with a nominal material** (pine 2×4): the trade name stays, mm in brackets, part in mm → Task 3 test.
4. **An imperial project's cut-list / plans sheet** shows no "Dimensions in mm" note → Task 2 test.
5. **Grid tier at the ladder's ends** (fully zoomed out / degenerate camera) in metric falls back to the coarsest metric
   tier, not an inch tier → Task 4 test.

---

### Task 0: Branch

- [ ] `cd /home/alec/docker/sloyd && git checkout -b metric-2`

### Task 1: Drawings in bare mm (`dimensions.ts`, `diagram.ts`, `nesting.ts`)

**Files:** Modify `src/document/dimensions.ts`, `src/document/diagram.ts` (~line 132), `src/document/nesting.ts` (~19,
188, 252–319), `src/document/cutlist.ts` (~376, the `buildNesting` call), `src/panels/PlanFigure.tsx` (~112–115),
`src/panels/PlansSheet.tsx` (~23, 60, 65). Tests: `dimensions.test.ts`, `diagram.test.ts`, `nesting.test.ts`,
`PlanFigure.test.tsx` or `PlansSheet.test.tsx` (append).

**Interfaces:**
- `dimensionView(parts, view, units: Units): DimensionSet` (was `precision: number`); `axis(…, units)`.
- `buildNesting(boards, sheet, kerf, units: Units): Nesting` (was `precision`).
- `PlanTrio({ parts, units, label })` (was `precision`).
- `buildDiagrams(board, units)` unchanged signature; its own labels now `formatLengthBare(n, units)`.

Rules:
- Every label these three modules produce: `formatLengthBare(n, units)` (imperial === `formatLength(n, units)`, so imperial
  is byte-identical). In `dimensions.ts` the "reads as zero" test compares `formatLengthBare(gap, units)` against
  `formatLengthBare(0, units)` (metric `'0'`).
- `diagram.ts`: `const f = (n: number) => formatLengthBare(n, units);` — remove the chunk-1 comment and the `imperialAt`
  import if unused. The crossings note (`overlap: ${f(d)} deep governs`) and depth label (`${f(cut.depth)} deep`) follow.
- `nesting.ts`: `formatDims(length, width, units)` = `` `${formatLengthBare(length, units)} × ${formatLengthBare(width, units)}` ``;
  update its doc comment (one module still owns the string, inv 19).
- Callers: `cutlist.ts` passes `units` to `buildNesting`; `PlansSheet` passes `doc.units` to `PlanTrio`, `PlanTrio` passes
  `units` to `dimensionView` and lists `units` in its memo deps (inv 15) — read `PlanFigure.tsx` first.

- [ ] **Step 1: Failing tests**

```ts
// dimensions.test.ts — reuse the file's existing parts fixture and view (read it)
const MM = { display: 'metric-mm' as const, precision: 16 };
it('metric labels are bare whole mm', () => {
  const set = dimensionView(parts, FRONT, MM);
  expect(set.horizontal.overall!.label).toMatch(/^\d+$/);          // e.g. '762'; adapt the property names to DimensionSet
});
it('a sub-mm chain gap is skipped in metric', () => {
  // two parts whose edges differ by 0.3 mm along the axis: the chain keeps one coordinate there
  // build with createBoard, positions differing by 0.3 / 25.4; assert no chain label reads '0'
});
```
The implementer reads `DimensionSet`/`DimAxis` in `dimensions.ts` and writes the two assertions against the real
properties: (1) every label of a metric set matches `/^-?\d+$/`; (2) with two parts 0.3 mm apart, no label equals `'0'` and
the chain has one coordinate fewer than the same parts 3 mm apart.

```ts
// diagram.test.ts
it('metric part-diagram labels are bare mm', () => {
  const b = createBoard({ length: 30, width: 5.5, thickness: 0.75 });
  const v = buildDiagrams(b, MM)[0]!;
  expect(v.hLabel).toBe('762');
  expect(v.vLabel).toBe('140');
});

// nesting.test.ts — reuse its existing sheet fixture
it('metric nesting labels are bare mm', () => {
  const n = buildNesting([createBoard({ length: 30, width: 11.25, thickness: 0.75 })], sheet, 0.125, MM);
  expect(n.sheets[0]!.parts[0]!.dims).toBe('762 × 286');        // adapt to Nesting's real shape
});
```
Plus a `PlanFigure`/`PlansSheet` render test: a metric document's Plans sheet contains a dimension text matching `^\d+$`
and no `"`. Read the existing PlansSheet tests for how they render and query dimension text.

- [ ] **Step 2: Run** the touched test files — new cases FAIL.
- [ ] **Step 3: Implement** per the rules.
- [ ] **Step 4: Run** `npx vitest run src/document src/panels` and `npm run build` — PASS/clean, no expectation changed.
- [ ] **Step 5: Mutate.** Pass `imperialAt(units.precision)` back into `formatDims` → the nesting test fails; drop `units`
  from `PlanTrio`'s memo deps → a units switch must not leave stale labels (if no test catches it, add a re-render test).
  Revert.
- [ ] **Step 6: Commit** — `git commit -am "feat(units): drawings in bare mm — Plans sheet, part diagrams, nesting labels"`

### Task 2: The "Dimensions in mm" sheet note

**Files:** Modify `src/panels/CutList.tsx` (header ~77), `src/panels/PlansSheet.tsx` (header ~38); `src/styles.css` (one
rule for the note, surface roles only). Tests: `CutList.test.tsx`, `PlansSheet.test.tsx`.

- [ ] **Step 1: Failing tests**

```tsx
it('a metric cut list carries the sheet note; an imperial one does not', () => {
  // render CutList with a metric doc (store.setUnitsDisplay('metric-mm') after adding a board — read the file's setup)
  expect(screen.getByText('Dimensions in mm')).toBeInTheDocument();
  // then imperial
  expect(screen.queryByText('Dimensions in mm')).toBeNull();
});
```
The same pair for PlansSheet.

- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** — in both headers, directly under the `<h2>`:
```tsx
{isMetric(doc.units) && <p className="sheet-units-note">Dimensions in mm</p>}
```
(CutList: the document the sheet is built from — read which variable it uses, `doc` or `flat`.) CSS: `.sheet-units-note`
small, `color: var(--ink-muted)` or the nearest existing muted-ink ROLE (read styles.css; never a raw `--grey-*`); it must
print (it sits inside the printed sheet).
- [ ] **Step 4: Run** the two files — PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(units): one 'Dimensions in mm' note per metric sheet"`

### Task 3: Buying — parts in project units, trade sizes with a metric bracket

**Files:** Modify `src/document/purchase.ts` (~150–200, 258), `src/units/nominal.ts` (only if `stockLengthText` needs
a `Units`-typed signature). Test: `purchase.test.ts` (append).

**Interfaces — Produces** (in `src/units/length.ts`, beside `formatSize`):
```ts
/** A TRADE dimension (a stock board, a planing thickness; spec R3): imperial as the yard sells it at `units.precision`,
 *  with its millimetres in brackets in a metric project — `3/4" (19 mm)`. */
export function tradeLength(inches: number, units: Units): string;
/** A trade SIZE (`t × w × l`), the mm once in brackets in metric: `3/4" × 5-1/2" × 96" (19 × 140 × 2438 mm)`. */
export function tradeSize(values: readonly number[], units: Units): string;
```
Implementation:
```ts
export function tradeLength(inches: number, units: Units): string {
  const text = formatLength(inches, imperialAt(units.precision));
  return isMetric(units) ? `${text} (${formatLengthBare(inches, units)} mm)` : text;
}
export function tradeSize(values: readonly number[], units: Units): string {
  const text = values.map((v) => formatLength(v, imperialAt(units.precision))).join(' × ');
  return isMetric(units) ? `${text} (${values.map((v) => formatLengthBare(v, units)).join(' × ')} mm)` : text;
}
```
Imperial is byte-identical to today's per-value `formatLength(…, imperialAt(p))` join. Unit tests for both in `length.test.ts`:
`tradeLength(0.75, MM)` → `3/4" (19 mm)`; `tradeSize([0.75, 5.5, 96], MM)` → `3/4" × 5-1/2" × 96" (19 × 140 × 2438 mm)`;
imperial equals today's strings.

Rules in `purchase.ts`:
- `buildPurchase` passes `doc.units` down instead of `p`.
- `partDims(b, units)` → `formatSize([b.thickness, b.width, b.length], units)` — imperial byte-identical (formatSize's
  imperial path is the old join); metric `19 × 286 × 600 mm`.
- `sizeDims(s, units, nominal)`: nominal → `` `${name} × ${stockLengthText(s.length, units.precision)}` `` plus, in metric,
  `` ` (${formatLengthBare(s.thickness,u)} × ${formatLengthBare(s.width,u)} × ${formatLengthBare(s.length,u)} mm)` ``;
  non-nominal → `tradeSize([s.thickness, s.width, s.length], units)`.
- Plane note: `` `${part.name}: plane ${tradeLength(t, units)} stock to ${formatLength(part.thickness, units)}` `` (the
  stock is trade, the part is the user's).
- Board feet, money, counts: unchanged.

- [ ] **Step 1: Failing tests** (append to `purchase.test.ts`, reusing its pine fixture and shop settings):
```ts
it('metric: a nominal stock line keeps its name, adds mm; a part note reads mm', () => {
  // a metric doc with a pine part 19 × 89 × 600 mm needing 2×4 stock (read the fixture for how stock is listed)
  // expect an entry line to contain '2×4 × 8′ (38 × 89 × 2438 mm)'
  // a part too wide for any stock: its note contains '(19 × 300 × 600 mm) fits no pine stock'
});
it('metric: plane note — trade stock with mm, part in mm', () => {
  // a part 0.5" thick (13 mm) bought from 3/4" stock: note contains 'plane 3/4" (19 mm) stock to 13 mm'
});
it('imperial buying is byte-identical', () => {
  // the file's existing imperial cases already pin this — no new assertion needed beyond them staying green
});
```
The implementer fills the two metric cases from the file's existing fixtures with the exact strings above (derive the
numbers by hand: 1.5" = 38 mm, 3.5" = 89 mm, 96" = 2438 mm, 0.75" = 19 mm).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/document/purchase.test.ts src/units src/panels/CutList.test.tsx` — PASS.
- [ ] **Step 5: Mutate.** Make `partDims` use `IMPERIAL` → the metric note test fails; drop the bracket → the nominal test
  fails. Revert.
- [ ] **Step 6: Commit** — `git commit -am "feat(units): Buying — parts in project units, trade sizes with mm in brackets"`

### Task 4: The metric grid

**Files:** Modify `src/viewport/gridDensity.ts`, `src/viewport/Viewport.tsx` (`AdaptiveGrid`, ~264–285). Test:
`src/viewport/gridDensity.test.ts` (append).

**Interfaces:** `gridDensity(pixelsPerInch: number, units: Units): GridTier`; `GridTier.sectionSize` is 12× cell
(imperial) or 10× cell (metric).

- [ ] **Step 1: Failing tests**
```ts
import { IMPERIAL } from '../units/length';
const MM = { display: 'metric-mm' as const, precision: 16 };
const mm = (n: number) => n / 25.4;
it('metric ladder: 10 mm / 100 mm / 1 m, sections 10×', () => {
  expect(gridDensity(1000, MM)).toEqual({ cellSize: mm(10), sectionSize: mm(100) });
  expect(gridDensity(4 / mm(10) - 1e-6, MM)).toEqual({ cellSize: mm(100), sectionSize: mm(1000) });
  expect(gridDensity(1e-6, MM)).toEqual({ cellSize: mm(1000), sectionSize: mm(10000) });
});
it('metric degenerate camera falls back to the coarsest METRIC tier', () => {
  expect(gridDensity(NaN, MM)).toEqual({ cellSize: mm(1000), sectionSize: mm(10000) });
  expect(gridDensity(0, MM)).toEqual({ cellSize: mm(1000), sectionSize: mm(10000) });
});
it('imperial is unchanged', () => {
  expect(gridDensity(1000, IMPERIAL)).toEqual({ cellSize: 1, sectionSize: 12 });
});
```
Existing gridDensity tests change their CALL to pass `IMPERIAL`, never their expectations.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** — `const LADDER_IN = [1, 12, 144]; const LADDER_MM = [10, 100, 1000].map((v) => v / 25.4);`
  ladder and multiplier chosen by `isMetric(units)`; keep the doc comments' reasoning and add the metric ladder's (each tier
  10× the one below, so coarser lines still fall on finer ones). `AdaptiveGrid` reads `useStore((s) => s.doc.units)`,
  passes it, and its initial tier is `gridDensity(Infinity, units)`'s finest tier; its `setTier` compare stays on
  `cellSize`. Note `gridDensity.ts` now imports a TYPE (`Units`) and `isMetric` from `units` — `isMetric` is a value
  import; the `→ units` edge rule is about strings, so state in the file's comment that the grid's ladder is a display
  choice of the project's units (record it in CLAUDE.md at Task 5).
- [ ] **Step 4: Run** `npx vitest run src/viewport/gridDensity.test.ts`, `npm run build` — PASS/clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(units): metric grid ladder 10 mm / 100 mm / 1 m"`

### Task 5: Close the holders, live check, records

- [ ] **Step 1:** `grep -rn "imperialAt\|IMPERIAL" src --include=*.ts --include=*.tsx | grep -v '\.test\.'` — every
  remaining hit must be: the Materials dialog / `materialsDraft` (P1), `GenerateDialog` (P2), `AngleField`/`CountField`
  (unused placeholder), the hole pitch floor in `holeText.ts`, or `tradeLength`/`tradeSize`/`stockLengthText`. Convert any
  other. `npm run build && npm test`.
- [ ] **Step 2: Live check** on `npm run dev -- --port 5181 --strictPort` (Playwright; never `localStorage.clear()` on the
  dev origin; delete only what this check creates). In a new metric test project with two parts and a shelf-pin row: Cut
  list → "Dimensions in mm", part diagram labels bare mm, the layouts' labels bare mm, Buying lines per R3; Plans sheet →
  bare mm dimensions and the note; print-preview (`emulateMedia print`) shows the note; the viewport grid in metric at two
  zoom levels (screenshots — the look is owed to real hardware, fu 26a); an imperial project unchanged. Record in
  `docs/browser-verification-metric-display.md` (append a "Chunk 2" section).
- [ ] **Step 3: Records.** CLAUDE.md: inv 52's "until metric chunk 2" clause replaced by the final imperial-on-purpose list;
  the `→ units` rule notes the grid; Status/Rounds after deploy; follow-up 353 closed; history entry; feature-gaps row.
- [ ] **Step 4:** Final review, then on the user's word merge `metric-2` and deploy chunks 1 + 2 together
  (`DEPLOYMENT.local.md`; no schema change).
