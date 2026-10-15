# Browser verification — metric display, chunk 1 (2026-10-15)

Dev server `npm run dev -- --port 5181` on branch `metric-1` (before the final-review fix wave), Playwright MCP browser.
One project created ("Metric check — delete me") and deleted afterwards; `localStorage` read back with exactly the keys it
started with (library index, autosave, three projects, the key).

| # | Check | Result |
|---|---|---|
| 1 | New project → Units `mm` → + Add board | Length / Width / Thickness / X read `610 mm`, `140 mm`, `19 mm`, `0 mm` (the default 24 × 5-1/2 × 3/4 board). |
| 2 | Type `600` in Length | Field `600 mm`; stored `23.62204724409449` = 600 / 25.4 exactly. |
| 3 | Type `1/2` in Thickness | Stored exactly `0.5` in (a fraction is inches); field `13 mm`. |
| 4 | Shelf-pin row on a 600 × 286 × 19 mm side | Diameter `6.4 mm`, Depth `10 mm`, First at `51 mm`, Every `32 mm`, In from `38 mm` (R7). |
| 5 | Cut list | Group `Pine — 19 mm`; row `600 × 286 mm`; bench line `Row of 16 holes 6.4 mm dia × 10 mm deep … first 51 mm … every 32 mm, last at 531 mm; 38 mm in …`. The part diagram's own labels (`23-5/8"`, `11-1/4"`) and Buying stay imperial — chunk 2, as planned (chunk 1 deploys only with chunk 2). |
| 6 | Gizmo drag along X | Position `631 mm`; stored × 25.4 = 631 exactly (R5: whole mm). No hopping seen on software GL. |
| 7 | Units → `in`, then Undo | Length `23-5/8"`, then `600 mm` again (one undo entry). |
| 8 | Reload | The project keeps `mm`. |

Observed consequence, recorded as a follow-up: a part typed in round millimetres no longer matches nominal lumber exactly
(286 mm = 11.26" > a 1×12's 11.25"), so Buying reports it "fits no pine stock — too wide".

Not exercised here: the tape typed in mm (TapeReadout's metric commit is unit-tested only through `parseLength`), the
viewport grid (chunk 2), a real print.

## Chunk 2 (2026-10-15, branch `metric-2`, before the final review)

One project created ("Metric 2 check — delete me") and deleted; the profile read back with its 6 keys and 3 projects.

| # | Check | Result |
|---|---|---|
| 1 | Cut list of a metric project (a 600 × 286 × 19 mm drilled side, a second part) | `Dimensions in mm` under the title; part-diagram labels bare (`600`, `286`); bench lines in mm (chunk 1). |
| 2 | Buying | Parts in mm (`Board (19 × 286 × 600 mm) fits no pine stock — too wide`); a true 1×4 typed in inches buys `1 × 1×4 × 6′ (19 × 89 × 1829 mm)`; its layout caption carries the same bracket. |
| 3 | Plans sheet | Note under the title; every dimension bare mm (`600`, `100`, `1300`, `286`, `197`, `89`, `19`) — `metric-2-plans.png`. |
| 4 | Print emulation | The note is visible and black (`display: block`, `rgb(0, 0, 0)`). |
| 5 | Viewport grid (Iso) | 100 mm sections with 10 mm cells — `metric-2-grid.png`; the look is owed to real hardware (fu 26a). |
| 6 | The user's imperial "Shaker Side Table — joined" | Plans sheet unchanged (`20"`, `20-1/4"`…), no note. |

Seen again (fu 354): parts typed in round mm (19 × 89, 38 × 89) match no nominal pine section, so Buying places neither.

## fu 357 — the units note on every printed page (2026-10-15, branch `fu-357`)

Dev server, Playwright's Chromium 148, `page.pdf` (Letter, 0.4in margins — a print dialog's default; at Playwright's default 0
margins the margin box has no room and the text, though in the PDF, is not visible). One project imported ("fu 357 print check —
delete me": the cabinets fixture plus 60 strips, metric) and deleted; the profile read back with its 6 keys and 3 projects, the
user's "Shaker Side Table — joined" active again (its `savedAt` moved: the switch re-saves the open project).

| # | Check | Result |
|---|---|---|
| 1 | Spike: a CSS `table-header-group`, a real `<thead>` (one body row, and a row per line), `position: fixed`, an `@page` margin box | Header groups: page 1 only. Fixed: every page, over the content. Margin box: every page, in the margin. |
| 2 | Metric cut list, all diagrams (16 pages) | `Dimensions in mm` on 16/16 pages (page 1 twice: margin and header), top-right, clear of the rows. |
| 3 | Metric Plans sheet (3 pages, one section each) | 3/3. |
| 4 | The same project in inches, Plans sheet | No note on any page; same page count. |

Owed: Firefox and Safari ignore margin boxes (page-1 note only, as before); a real print from Brave for the user's eye (fu 254, 345).
