# Browser verification — edge banding, chunk 1 (schema 19)

**Setup:**
- Date: 2026-10-20.
- Dev server: `npm run dev -- --port 5180 --host 127.0.0.1`, branch `edge-banding-1` at `90e9bde` (Tasks 1–9). This is the
  DEV server only. Production was not touched (the deployment rule).
- Browser: the Playwright MCP browser, under software GL. Steps were driven through `browser_run_code_unsafe` (role and label
  locators). Readouts are DOM text, `localStorage`, or text pulled from a real Chromium PDF. Where a number needed more
  precision than the page prints, the dev server's own `/src/document/banding.ts` was imported in the page and run on the
  autosaved document.
- **No screenshots.** No finding was spatial. The two PDFs (`cutlist.pdf`, `plans.pdf`) sit in the gitignored SDD workspace
  (`.superpowers/sdd/2026-10-19-sloyd-edge-banding-1/img/`) and will not survive a `git clean -fdx`. The numbers below are
  the durable record.
- The console showed 0 errors. Its only warnings were three.js deprecations and WebGL driver messages.

**Test project:** "Edge banding check" (`sloyd.project.id_mvg0nvgm_1`), new, left in place on the dev profile per the user's
ruling. Its parts: Shelf, Shelf (1)–(3), Tabletop, Apron.

## 1. Four taped shelves

Four 30 × 12 × 3/4 plywood shelves were made (Shelf, then Duplicate ×3) and selected together (4 parts selected). Then
`Band ▾ → Iron-on veneer: long edges`. The menu offered `Iron-on veneer: all edges`, `long edges`, `ends` and `Remove all
bands`.

- Properties: `Width min side` and `Width max side` read `Iron-on veneer`, the two ends read `None`. There was **no Corners
  select**: the tape has no thickness.
- The cut list header: `Cut sizes are before banding; band before machining — every cut, hole and curve is measured on the
  banded part.`
- Row: `4 × 30" × 12"`, `Shelf, Shelf (1), Shelf (2), Shelf (3)`, `10.00 sq ft`, then
  `Band: the width min side and the width max side — Iron-on veneer`. At thickness 0 there is no `finished` clause.
- Buying: `Edge banding` / `Iron-on veneer, 7/8" wide: buy 21′ · no price`. That is 8 sides × (30 + 1/2) = 244" = 20.33 ft,
  rounded up to 21′. **Matches the plan.**
- The total reads `Estimated materials: — (2 materials have no price)`. The tape counts as a "material" in that tail (Task
  6's plan-mandated wording, fu 395(3)).

## 2. A solid band type, undo and redo

From the cut list: `Materials & prices…`, then `+ Add band type ▾`. The menu offered `Tape` and `Solid`. Choosing `Solid`
added a row with **no kind select** (P3): Name `Solid edging`, Thickness `1/4"`, Length allowance `1/2"`, Material (Pine, Oak,
Maple, Walnut, Cherry — solids only), Width allowance `1/16"`, and a Remove ✕. The built-in row has no ✕. The row was renamed
`Maple edging 1/4"` with Material Maple, then saved.

- The stored document: `version: 19`, and `bandTypes` holds `band-iron-on` plus
  `{ id: 'id_mvg0sd55_6', name: 'Maple edging 1/4"', kind: 'solid', thickness: 0.25, lengthAllowance: 0.5, material: 'maple',
  widthAllowance: 0.0625 }`.
- **Undo** (toolbar) stored `["Iron-on veneer"]`. **Redo** stored `["Iron-on veneer", "Maple edging 1/4\""]`. The Save is one
  undo entry, and undo reverts the band type.

## 3. A mitred tabletop with maple edging

A 36 × 20 × 3/4 plywood part, `Tabletop`, had each side select set to `Maple edging 1/4"`. The **Corners** select then
appeared (`Long edges run through`, `Ends run through`, `Mitred`) and was set to `Mitred`.

- Maple section, `Maple — 13/16"` (3/4 + 1/16 width allowance):
  - Row 1: `2 × 36-1/2" × 1/4"`, `Tabletop edging (width min side), Tabletop edging (width max side)`, `0.10 bd ft`,
    `Trim flush; mitre both ends 45°`.
  - Row 2: `2 × 20-1/2" × 1/4"`, `Tabletop edging (length min end), Tabletop edging (length max end)`, `0.06 bd ft`,
    `Trim flush; mitre both ends 45°`.
  - Section total `0.16 bd ft`. That is 2 × 36.5 × 0.25 × 13/16 / 144 = 0.103, plus 2 × 20.5 × … = 0.058. Mitred: every strip
    is its finished side plus 1/2".
- Plywood section, row 3: `1 × 35-1/2" × 19-1/2"`, `Tabletop`, `4.81 sq ft`, then
  `Band: the width min side and the width max side and the length min end and the length max end — Maple edging 1/4",
  mitred corners; finished 36" × 20"`. The core is 36 − 2 × 1/4 by 20 − 2 × 1/4. **Matches the plan.**
- The sheet layout nests `Tabletop 35-1/2" × 19-1/2"`, the core size.
- Buying adds `Maple — 13/16": buy 0.21 bd ft (0.16 bd ft net × 1.3) · no price`. The tape line is unchanged at 21′, since
  the maple is solid.
- **Finding, for the user (fu 395(1)):** row 3's diagram (`Thickness face — min side`) is labelled `36"` × `20"`. That is
  the FINISHED part, printed beside the `35-1/2" × 19-1/2"` cut size on the same row. Task 5 recorded this as a deferred
  minor and the user has not ruled on it. Chunk 2 redraws the part diagrams.
- **Wording, for the user's eye (fu 395(2)):** four sides of one type join with repeated `and`.

## 4. An arched apron, taped

A 30 × 4 × 3/4 plywood `Apron` got Curves → `Arch`: `Arch on the width min side, 3" in from each length end: 24" span, 1"
rise (radius 72-1/2")`.

- Focusing `Width min side` (options are judged on focus) read: `None`, `Iron-on veneer`, and
  `Maple edging 1/4" — Needs a straight edge` (**disabled**).
- Choosing `Iron-on veneer` was accepted, and the select reads `Iron-on veneer`. The row line is
  `Band: the width min side — Iron-on veneer`.
- The tape length (`tapeRuns` on the autosaved part): **30.610957"**. That is 3 + 24.110957 + 3 + 1/2, where the arc is
  2 · 72.5 · asin(12 / 72.5) = 24.110957". The tape grows by the arc's extra 0.110957" over the 24" chord, measured on the true
  arc as spec §3.3 requires. `bandFaults` = `[]`; the core stays `30 × 4 × 3/4`.
- Buying: `Iron-on veneer, 7/8" wide: buy 23′ · no price`. That is 244 + 30.611 = 274.611" = 22.88 ft, rounded up to 23′.

## 5. Print (a real Chromium PDF)

The cut list was printed with `page.emulateMedia({ media: 'print' })` and `page.pdf({ format: 'Letter' })` (4 pages); media
was reset afterwards.
- Page 1: the header note, then the Maple section with both strip rows and their `Trim flush; mitre both ends 45°`.
- Page 2: Plywood, with rows 3 (Tabletop, its band line wrapping onto a second line) and 4 (the shelves, their band line).
- Page 3: row 5 (Apron), its arch line and `Band: the width min side — Iron-on veneer`, then the sheet layout.
- Page 4: Buying, with Maple, Plywood, `Edge banding` / `Iron-on veneer, 7/8" wide: buy 23′ · no price`, and the total. Each
  section and Buying start on a new page (fu 383's rule holds).

On the Plans sheet, the DOM's `[data-number]` values are **`3`, `5`, `4`**: one balloon for each PART row (Tabletop 3,
Apron 5, the shelves 4). Strip rows 1 and 2 have **no balloon** and **no hidden-part note**: the printed Plans page 1 reads
only `Plans — Edge banding check / Exploded view / 3 5 4`. Plans page 2's dimensions show the finished `36"` × `20"`
tabletop. The model is the finished size.

**Seen, for the user's eye:** the maple section sorts before plywood by material, so its strips take the first numbers of
the one series. The exploded view's balloons therefore start at 3 (spec §4.2's amended block).

## 6. Reload (schema 19 round trip)

`page.reload()`. The project reopened as `Edge banding check` with stored `version: 19`. Tabletop's selects read `Maple
edging 1/4"` on all four sides, with Corners `Mitred`. The cut list reads exactly as before: the strip rows, the
`35-1/2" × 19-1/2"` core, all three band lines, the maple and tape (23′) Buying lines.

## Summary

Every number the plan computed matched the page: 21′, then 23′ with the arch; core `35-1/2" × 19-1/2"`; strips
`36-1/2"` / `20-1/2" × 1/4"` at 13/16". Three items are for the user's eye or ruling, none of them a wrong number (fu 395):
- the banded row's diagram shows the finished size next to the cut size;
- the four-side `and … and …` wording;
- Buying's unpriced tail counts tape as a material.
