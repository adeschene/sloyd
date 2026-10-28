# Sloyd — printable part labels

**Date:** 2026-10-28 · **Status:** draft, awaiting the user's approval.

**Origin:** `docs/feature-gaps.md` §3, "Printable part labels" ("OpenCutList-style stickers; distinct from the diagram label
layout"). The user picked it on 2026-10-28 and asked for the spec without the brainstorm questions, so every choice below is
Claude's call unless it is marked as *the user's*. §10 lists them for checking.

## 1. Intent

Once the parts are cut, a pile of pieces looks alike. A sticker on each piece, carrying the same number as the cut list and
the Plans balloons, says which piece it is, how big it should be, what it is made of and which way the grain runs. The
woodworker prints a sheet of labels on standard sticker stock, peels them off and sticks one on each piece as it comes off
the saw.

**Goals**

- One label for every PHYSICAL piece the cut list asks you to cut: a row of quantity 4 gives four labels. Every part row and
  every edging-strip row is covered, hidden parts included, because they are in the cut list (inv 43).
- Each label carries:
  - the cut list's ROW NUMBER (the one series shared with the Plans balloons);
  - the piece's name;
  - its cut size;
  - its material;
  - its grain;
  - the project's name;
  - which copy it is (`2 of 4`).
- The labels print on four common sticker sheets, at true size, aligned to the stickers.
- The user can start part-way down a sheet already partly used.

**Non-goals (v1)**

- Barcodes and QR codes.
- Joinery or setup lines on the label. The number leads to them in the cut list.
- A label designer (choosing fields, fonts, sizes).
- Custom sheet geometry. Four presets only; more is a follow-up.
- Remembering the chosen stock between sessions (it is view state: §4.3).
- Labels for hardware.

**Anti-goals.** It would be a failure, even if it works, if:

- a label's number disagrees with the cut list or the Plans balloons;
- a sheet prints scaled, so the labels drift off the stickers by the bottom row;
- a piece is missing, or appears twice;
- anything about the cut list, Plans or the document changes. No schema change, no store change, nothing persisted.

## 2. What a label says

From the cut list, built once (`buildCutList` on the flat document, as the cut list panel does), every row in display order,
then each copy:

```
 ┌──────────────────────────────────────┐
 │ (12)  Base cabinet › Left side        │   the row number in a ring; the name
 │       30" × 11-1/2" × 3/4"           │   cut size: the row's dims × the group's thickness
 │       Plywood · grain along length    │   material (and nominal size); grain
 │       Bookcase              2 of 4    │   project name; copy k of the row's qty
 └──────────────────────────────────────┘
```

Each line, built in `labels.ts` (inv 19: the module builds the strings, the component prints them):

- **Number:** `row.number`.
- **Name:** that copy's name, `row.names[k]`: the flat display path. Strip rows carry the strip's own name.
- **Size:** `${row.dims} × ${formatLength(group.thickness, units)}`. This is the size you CUT, the same as the cut list (a banded
  part's core, inv 54). A row whose `nominal` is set appends it: `… (1×4)`.
- **Material:** `catalog.label(group.material)`.
- **Grain:**
  - `grain along length`, `grain across` or `end grain`, from `row.grain` (`length`, `width`, `thickness`);
  - omitted for a plain sheet (`materialKind` `sheet-plain`: MDF has none).
  - *Claude's call:* words, not an arrow. A sticker's orientation on the board is arbitrary, so an arrow on it says
    nothing.
- **Project:** `doc.name`.
- **Copy:** `k of qty` (1-based). Omitted when `qty` is 1.

All lengths go through `units/length.ts` with the document's `Units` (inv 52). A metric project reads `762 × 292 × 19 mm`, so
the label carries its unit and needs no sheet note.

## 3. The stock — `src/document/labels.ts` (new)

Four presets, as a typed table. All numbers are exact page geometry, so they are stored in their native units and converted
once:

| id | name shown | page | labels | label size | top margin | left margin | column pitch | row pitch |
|---|---|---|---|---|---|---|---|---|
| `avery-5160` | Avery 5160 / 8160 — 30 per sheet, 2-5/8" × 1" | Letter | 3 × 10 | 2.625 × 1 in | 0.5 in | 0.1875 in | 2.75 in | 1 in |
| `avery-5163` | Avery 5163 / 8163 — 10 per sheet, 4" × 2" | Letter | 2 × 5 | 4 × 2 in | 0.5 in | 0.15625 in | 4.1875 in | 2 in |
| `l7160` | Avery L7160 — 21 per sheet, 63.5 × 38.1 mm | A4 | 3 × 7 | 63.5 × 38.1 mm | 15.15 mm | 7.25 mm | 66.04 mm | 38.1 mm |
| `l7163` | Avery L7163 — 14 per sheet, 99.1 × 38.1 mm | A4 | 2 × 7 | 99.1 × 38.1 mm | 15.15 mm | 4.65 mm | 101.6 mm | 38.1 mm |

**Required test:** each preset fills its page within 0.01 in both ways:
- `2·left + (cols − 1)·colPitch + width` equals the page width;
- `2·top + (rows − 1)·rowPitch + height` equals the page height.

This is computed by hand in the test, against Letter (8.5 × 11 in) and A4 (210 × 297 mm), not against values the module
produces (inv 23's rule). The builder also checks each preset against the maker's published template and reports any
difference before using it.

**Default:** `avery-5160` in an imperial project, `l7160` in a metric one (*Claude's call*: Letter vs A4 follows the likely
paper).

**API (pure, numbers and strings, imports `units`):**
- `LABEL_STOCKS: readonly LabelStock[]`
- `labelsOf(flat: FlatDocument, list: CutList): PartLabel[]`, with
  `PartLabel { key; number; name; size; material; grain: string | null; project; copy: string | null }`
- `pagesOf(labels, stock, startAt)` returns `{ pages: (PartLabel | null)[][] }`: each page is `cols × rows` cells, row-major;
  `null` marks a skipped or empty cell.

**`startAt`:**
- 1-based, from 1 to `cols × rows`; it skips `startAt − 1` cells on the FIRST page only.
- An out-of-range value is refused in the field (the field's own error pattern), never clamped.

## 4. The Labels sheet

### 4.1 Where

The cut list's header gains a `Labels…` button. It sits beside Print, and is hidden in print like the other actions. It
opens the **Labels** sheet, an overlay built exactly like Plans: a direct child of `.app`, the shell inert, and the
`cutlist-overlay` class, so the existing print rule applies.

Closing it returns to the cut list. App gains one boolean, `labelsOpen`, beside `cutListOpen` and `plansOpen`, and joins
`modalOpen` (inv 27). Opening it closes the cut list, and closing it reopens the cut list. *Claude's call:* the alternative
is a sheet stacked on a sheet.

### 4.2 On screen

- The header: `Labels — <project>`, then a `Stock` select (the four presets), a `Start at` field (`label 1`…`label N`), a
  count line, `Print` and `✕`.
- The count line reads `24 labels on 1 sheet`, or `… on 3 sheets`.
- Below the header, every page is drawn at true size, in CSS physical units (`in` / `mm`), each label cell an outlined box.
  Skipped cells are drawn dashed, empty cells blank.
- A note under the header: `Print at 100% scale with margins set to None or Default; the page sets its own margins.`
  *Claude's call:* browsers scale "to fit" when told to, which ruins alignment, and the note is the only defence.

### 4.3 State

The stock and the start-at value are local view state (`useState`), with the default by units, reset each time the sheet
opens. Nothing is stored. Remembering the stock would need a `StorageAdapter` key (fu 8: nothing else touches
`localStorage`), which is a follow-up.

### 4.4 Print

A named `@page` per paper:
- `@page labels-letter { size: 8.5in 11in; margin: 0 }`
- `@page labels-a4 { size: 210mm 297mm; margin: 0 }`

Each `.labels-page` takes its stock's page name, is exactly one page high, and has `break-after: page`. The header and note
are hidden in print.

Each cell is absolutely positioned at its preset's `left + c·colPitch`, `top + r·rowPitch`, sized to the label.
- A label's content has a small inner padding (*Claude's call:* 0.06 in) and `overflow: hidden`.
- The name line truncates with an ellipsis. The number, size and copy never truncate.
- The font is in `pt`, sized per preset (larger on the 4 × 2), monospace for the size line (`--font-num`, inv 19's spirit).
- Black on white, with no background (follow-up 58's lesson).

**Required browser check:** print each preset to PDF (`page.pdf()`, the memory's method). Then read each page's size from the
PDF (Letter / A4 exactly) and the first and last cells' positions against the preset, to 0.01 in. One printed sheet held up to
real stock is owed to the user.

## 5. What does not change

- The document, the schema (stays 28), the store, storage, the cut list's strings and numbers, Plans, the viewport.
- `buildCutList` is read, never changed.
- The cut list's identity guards change only by the added `Labels…` button. `CutList.dovetailIdentity` removes it before
  hashing, the way it removes the weight lines.

## 6. Layers and rules

- `labels.ts` sits in `document` and imports `units` (it produces strings a person reads), joining the `→ units` list in
  `CLAUDE.md`.
- The component `panels/LabelsSheet.tsx` formats nothing itself.
- No new invariant. A per-file rule goes in `docs/module-map.md`: *`labels.ts` is the ONE home of label strings and sheet
  geometry. A label's number is `CutListRow.number`, never recounted.*

## 7. Tests

- **`labelsOf`, on a fixture with:**
  - a quantity-3 row;
  - a banded part and its strip row;
  - a nominal pine row;
  - an MDF part;
  - an assembly placed twice;
  - a hidden part;
  - a metric twin.

  Assert, by hand:
  - one label per piece (the total equals `Σ row.qty` over every row);
  - the labels in row-number order, then copy order;
  - every number equals its row's `number`;
  - the exact strings (`2 of 3`, `grain along length`, no grain on MDF, `(1×4)`, the strip's name, `mm` sizes).
- **`pagesOf`:**
  - 31 labels on 5160 give 2 pages, the second with 1 label and 29 nulls;
  - `startAt` 29 puts the first label in cell 28 (0-based) of page 1;
  - the panel's `Start at` field refuses 0, a non-integer and a value past `cols × rows` with its error and keeps the last good
    value; `pagesOf` is only ever called with a legal one.
- **The page-fill test of §3.**
- **Panel:** the cut list's `Labels…` opens the sheet; the stock select and the start-at field change the page count; `✕`
  returns to the cut list; Escape closes it.
- **Mutate:**
  - recount numbers in `labelsOf` instead of reading `row.number`, and the numbers test must fail;
  - drop the copy loop, and the count test must fail.

## 8. Verification

On the dev server, run the Shaker table fixture's labels on each preset and print to PDF:
- page sizes;
- cell positions;
- one label read back by text.

On production: bundle hash, CSP and storage cleared, as usual. No paid runs.

## 9. Docs

`docs/module-map.md` (`labels.ts`, `LabelsSheet.tsx`), the `→ units` list in `CLAUDE.md`, `docs/feature-gaps.md`,
`docs/rounds.md`, `docs/history.md`, follow-ups for the non-goals.

## 10. Claude's calls, for checking

1. One label per physical piece, edging strips included.
2. The size on the label is the CUT size, the same as the cut list (a banded part's core, not its finished size).
3. Grain in words, not an arrow; no grain line on MDF and other plain sheets.
4. Four presets (Avery 5160, 5163, L7160, L7163). The default is by units: Letter for imperial, A4 for metric.
5. `Start at` for a partly used sheet, on the first page only.
6. Opened from the cut list's header (`Labels…`), not the toolbar. It replaces the cut list while open.
7. The stock is not remembered between openings (no storage key in v1).
8. A print note asking for 100% scale.
9. Follow-ups to open:
   - more stock, and custom geometry;
   - remembering the stock;
   - a QR code;
   - labels for hardware;
   - a finished-size line on a banded part's label.
