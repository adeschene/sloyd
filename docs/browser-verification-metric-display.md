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
