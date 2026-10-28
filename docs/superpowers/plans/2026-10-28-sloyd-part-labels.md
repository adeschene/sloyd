# Part Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Labels sheet, opened from the cut list, prints one sticker per physical piece on four standard sticker sheets
(Avery 5160 and 5163, L7160 and L7163). Each sticker shows the row number, name, cut size, material, grain, project and copy.

**Architecture:**
- **Strings and geometry live in a new pure module, `src/document/labels.ts`.** It holds the stock table, `labelsOf` (from
  `buildCutList`'s output) and `pagesOf` (cells per page).
- **The display lives in a new overlay, `src/panels/LabelsSheet.tsx`.** It is built like `PlansSheet` (`cutlist-overlay`
  class, direct child of `.app`), with named `@page` rules for Letter and A4 at margin 0.
- **App gains `labelsOpen`.** Opening Labels from the cut list closes the cut list, and closing Labels reopens it.

**Tech Stack:** TypeScript, React, Vitest (`npx vitest run <file>`), `npm run build` (the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-28-sloyd-part-labels-design.md` (APPROVED 2026-10-28). It wins over this plan. Work
on branch `labels` from `master`, and merge locally with `--no-ff` (no PRs).

## Global Constraints

- **No schema change** (stays 28), no store action, nothing persisted.
- `buildCutList` and the cut list's strings are unchanged. The ONLY cut-list change is the `Labels…` button in
  `.cutlist-actions`.
- **Presets** (exact; `LabelStock { id, name, page: 'letter' | 'a4', cols, rows, width, height, top, left, colPitch, rowPitch, unit: 'in' | 'mm' }`):
  - `avery-5160`, `Avery 5160 / 8160 — 30 per sheet, 2-5/8" × 1"`: letter, 3 × 10, 2.625 × 1, top 0.5, left 0.1875, pitch
    2.75 / 1 (in).
  - `avery-5163`, `Avery 5163 / 8163 — 10 per sheet, 4" × 2"`: letter, 2 × 5, 4 × 2, top 0.5, left 0.15625, pitch 4.1875 / 2
    (in).
  - `l7160`, `Avery L7160 — 21 per sheet, 63.5 × 38.1 mm`: a4, 3 × 7, 63.5 × 38.1, top 15.15, left 7.25, pitch 66.04 / 38.1
    (mm).
  - `l7163`, `Avery L7163 — 14 per sheet, 99.1 × 38.1 mm`: a4, 2 × 7, 99.1 × 38.1, top 15.15, left 4.65, pitch 101.6 / 38.1
    (mm).
  - Default: `avery-5160` imperial, `l7160` metric (`isMetric(doc.units)`).
- **Label strings (exact):**
  - `size` = `${row.dims} × ${formatLength(group.thickness, units)}`, with ` (${row.nominal})` appended when `row.nominal`;
  - `material` = `catalog.label(group.material)`;
  - `grain` = `grain along length` / `grain across` / `end grain` for `row.grain` `length` / `width` / `thickness`, and `null`
    when `materialKind(group.material) === 'sheet-plain'`;
  - `project` = `flat.name`;
  - `copy` = `${k} of ${qty}`, `null` when `qty === 1`;
  - `name` = `row.names[k − 1]`;
  - `number` = `row.number`, never recounted;
  - `key` = `${row.key}#${k}`.
- **Order:** groups in `list.groups` order, rows in group order (that is row-number order), copies 1..qty.
- **Sheet copy:**
  - title `Labels — <project>`;
  - `Stock` select;
  - `Start at` field (CountField, `min` 1, `max` = cells, invalid `Enter a label number from 1 to <cells>`);
  - count line `<n> label|labels on <m> sheet|sheets`;
  - note `Print at 100% scale with margins set to None or Default; the page sets its own margins.`;
  - button `Labels…`, close label `Close labels`.
- **Print:**
  - `@page labels-letter { size: 8.5in 11in; margin: 0 }` and `@page labels-a4 { size: 210mm 297mm; margin: 0 }`;
  - `.labels-page { page: labels-letter|labels-a4; break-after: page; position: relative; width/height = the paper }`;
  - cells absolutely positioned in the stock's unit;
  - inner padding 0.06in;
  - name line `text-overflow: ellipsis`;
  - black on white, no background;
  - the header and note hidden in print.
- **Dev server:** no `localStorage.clear()`. No paid runs.
- Before each commit, check `git status` shows only this task's files. Another `claude --continue` session may run in the repo.

## Review Focus

1. **A partly used sheet:** with `Start at` 29 on 5160, the first label lands in the 29th sticker; the page count includes the
   skipped cells (Task 1, Task 2).
2. **Assemblies placed twice and hidden parts:** every copy has a label and none is missing; the total equals `Σ qty` (Task 1).
3. **A metric project:** sizes read `… mm`, and the default stock is A4 (Task 1, Task 2).
4. **An empty project:** the sheet shows `0 labels on 0 sheets` and no page; Print still works (Task 2).
5. **Printed geometry:** the PDF pages are exactly Letter or A4, and the first and last cells sit where the preset says
   (Task 5).

---

### Task 1: `labels.ts` — stock, labels and pages

**Files:**
- Create: `src/document/labels.ts`
- Test: `src/document/labels.test.ts`

**Interfaces:**
- Consumes:
  - `CutList`, `CutListRow`, `CutListGroup` (`cutlist.ts`);
  - `catalogOf`;
  - `materialKind`;
  - `formatLength`, `Units`, `isMetric`.
- Produces:
  - `LabelStock` and `LABEL_STOCKS` (the four, in the order above);
  - `defaultStock(units): LabelStock`;
  - `stockCells(s): number` (`cols × rows`);
  - `PartLabel { key; number; name; size; material; grain: string | null; project; copy: string | null }`;
  - `labelsOf(flat: FlatDocument, list: CutList): PartLabel[]`;
  - `pagesOf(labels, stock, startAt): (PartLabel | null)[][]`. Each page has exactly `stockCells` entries, row-major, and the
    first `startAt − 1` of page 1 are `null`. No labels gives `[]`.
  - `cellBox(stock, i): { left; top; width; height }` (in the stock's unit).

- [ ] **Step 1: Write the failing tests.**
  - **Page fill:** for each preset, `2·left + (cols−1)·colPitch + width` is within 0.01 in of the page width, and the same
    for height. Compute by hand against 8.5 × 11 in and 210 × 297 mm (convert mm with 25.4).
  - **`labelsOf` on a hand-built flat document:**
    - an oak part of qty 3 (three identical boards);
    - a plywood shelf with a solid maple band (one strip row);
    - a pine 3/4 × 3-1/2 part (nominal `1×4`);
    - an MDF part;
    - an assembly placed twice (via `flatDocument`);
    - a part whose id is in no special state. Hidden-ness is store state, so it is noted as counted by construction.

    Assert:
    - `labels.length === Σ row.qty` over `buildCutList`;
    - every label's number equals its row's `number`, and numbers never decrease;
    - the copies read `1 of 3`, `2 of 3`, `3 of 3`, and a qty-1 row has `copy: null`;
    - the strip label's name is the strip row's name;
    - the pine size ends `(1×4)`;
    - MDF `grain: null`, oak `grain along length`;
    - a metric twin's size ends ` mm`.
  - **`pagesOf`:**
    - 31 labels on 5160 give 2 pages; page 2 has 1 label then 29 nulls;
    - `startAt` 29 gives page 1 cells 0..27 null and cell 28 the first label;
    - 0 labels give `[]`.
  - **`cellBox(5160, 4)`** (row 1, col 1) is `{ left: 0.1875 + 2.75, top: 0.5 + 1, width: 2.625, height: 1 }`.
- [ ] **Step 2: Run** `npx vitest run src/document/labels.test.ts`. Expect FAIL (no module).
- [ ] **Step 3: Implement** `labels.ts` per the Global Constraints.
- [ ] **Step 4: Run** the test again. Expect PASS.
- [ ] **Step 5: Mutate.**
  - Recount `number` from a counter: the numbers test must fail.
  - Push one label per row instead of `qty`: the count test must fail.
  - Revert both.
- [ ] **Step 6: Commit** `feat(labels): labels.ts — stock, labels, pages`.

### Task 2: `LabelsSheet.tsx` and the print CSS

**Files:**
- Create: `src/panels/LabelsSheet.tsx`, `src/panels/LabelsSheet.test.tsx`
- Modify: `src/styles.css` (screen styles, the two `@page` rules, print rules)

**Interfaces:**
- Consumes: Task 1's exports, `buildCutList`, `flatDocument`, `CountField`.
- Produces: `LabelsSheet({ onClose }: { onClose: () => void })`.

- [ ] **Step 1: Write the failing tests** (render with a store document of 4 oak parts, 2 rows):
  - the title `Labels — <name>`;
  - the count `4 labels on 1 sheet`;
  - `.labels-cell` elements: 30 for 5160;
  - the first filled cell's text contains `1`, the name and the size.

  Then:
  - choose `avery-5163`: 10 cells per page;
  - set `Start at` to 9: the count reads `4 labels on 2 sheets`;
  - `Start at` 31 on 5160 shows the field's error and keeps 1 page;
  - a metric project defaults to `Avery L7160`;
  - an empty project reads `0 labels on 0 sheets` with no `.labels-page`;
  - Escape and `Close labels` call `onClose`.
- [ ] **Step 2: Run** the test. Expect FAIL.
- [ ] **Step 3: Implement.**
  - The component follows the `PlansSheet` pattern (overlay, focus on mount, the Escape listener).
  - Its pages are `div.labels-page.labels-page-<letter|a4>`, sized in the stock's unit.
  - Each cell is `div.labels-cell` with an inline `left/top/width/height` from `cellBox`, `${n}${unit}`.
  - A null cell is `labels-cell labels-skip` when it is before `startAt` on page 1, else `labels-cell labels-empty`.
  - A filled cell contains `.labels-num`, `.labels-name`, `.labels-size`, `.labels-material` (material and grain, joined
    ` · `), `.labels-foot` (project and copy).
  - CSS per Global Constraints, with font sizes per preset class (`labels-avery-5163` larger).
- [ ] **Step 4: Run** the test, then `npm run build`. Expect PASS and a clean build.
- [ ] **Step 5: Commit** `feat(labels): the Labels sheet`.

### Task 3: Wiring — `Labels…` in the cut list, `labelsOpen` in App

**Files:**
- Modify: `src/panels/CutList.tsx` (an `onOpenLabels?: () => void` prop; the button, absent without it), `src/App.tsx`
  (`labelsOpen` state, `modalOpen` includes it, mount `LabelsSheet` beside `PlansSheet`).
- Test:
  - `src/panels/CutList.test.tsx`: the button calls `onOpenLabels`, and is absent without the prop;
  - `src/panels/CutList.dovetailIdentity.test.tsx`: unchanged. It renders without `onOpenLabels`, so the button is absent
    and the hash holds; confirm.
  - `src/App.test.tsx` (mirror the Plans-opening test at ~`:1163`): Cut list → Labels… → the Labels sheet is open and
    the cut list closed; ✕ → the cut list is back.

- [ ] **Step 1: Write the failing tests.**
- [ ] **Step 2: Run** them. Expect FAIL.
- [ ] **Step 3: Implement.** App's `onOpenLabels` sets `cutListOpen` false and `labelsOpen` true. `LabelsSheet`'s `onClose`
  does the reverse. Focus return follows the existing `opener` pattern.
- [ ] **Step 4: Run** `npx vitest run src/panels src/App.test.tsx`, then `npm run build`. Expect PASS.
- [ ] **Step 5: Commit** `feat(labels): Labels… from the cut list`.

### Task 4: Records

**Files:**
- `docs/module-map.md`: `labels.ts`, `LabelsSheet.tsx`, and the per-file rule from spec §6.
- `CLAUDE.md`:
  - the `→ units` list gains `labels.ts`;
  - the module-map per-file list names it;
  - the test count;
  - the Status block after deploy.
- `docs/feature-gaps.md`: the labels row.
- `docs/follow-ups.md`: new entries for the spec §10.9 follow-ups, and for the user's real-stock print check (owed).
- `docs/rounds.md` and `docs/history.md`.

- [ ] **Step 1: Write them.** Keep CLAUDE.md under ~60KB.
- [ ] **Step 2: Run** the full `npx vitest run` and `npm run build`.
- [ ] **Step 3: Commit** `docs(labels): module map, follow-ups, rounds`.

### Task 5: Browser verification (dev server)

**File:** `docs/browser-verification-labels.md`

- [ ] **Step 1:** Restart the dev server first (a hot-reloaded module gives a second store). On a scratch profile, load the
  Shaker table (`SHAKER_TABLE_JSON` through `designToDocument`).
  - Open Cut list → Labels….
  - Read the count line and the first three labels' text.
- [ ] **Step 2:** For each preset, `page.pdf({ preferCSSPageSize: true })`. Read every page's MediaBox, which must be
  612 × 792 pt for Letter and 595.28 × 841.89 pt for A4.
- [ ] **Step 3:** Read the first and last cells' `getBoundingClientRect` in print emulation (`page.emulateMedia({ media:
  'print' })`) against the preset, to 0.01 in (96 px/in).
- [ ] **Step 4:** Take a screenshot of the on-screen sheet, and record findings in the doc. One real sheet of stickers is owed
  to the user.
- [ ] **Step 5: Commit** `docs(labels): browser verification`.
