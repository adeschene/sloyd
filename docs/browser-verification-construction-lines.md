# Browser verification — construction lines (fu 130, schema 31)

2026-10-30. The user's own Chrome over the MobaXterm tunnel (`localhost:5199`, real GPU), Claude driving through
claude-in-chrome, the user watching. Dev server on branch `construction-lines` at `0a236a2`. A NEW project,
"Construction lines check" (one 24" × 5-1/2" × 3/4" board), left in place afterwards (dev profile rule).
Readouts are from the page's own store module (`performance.getEntriesByType('resource')`), read-only except where
a step says it set view state.

| # | Check | Result |
|---|---|---|
| 1 | New project loads at version 31 | ✅ `version: 31` |
| 2 | Tape anchored on a corner `[24, 0.75, 0]`, Z pressed, nothing typed | ✅ hint `Along Z — Enter for a line, or type a distance`; the preview line draws along Z through the anchor |
| 3 | Enter with focus on the page (App's window path) | ✅ `{ at: [24, 0.75, 0], axis: 'z' }` added; anchor and axis cleared |
| 4 | Enter inside the readout's distance box (the readout path), anchored `[0, 0.75, 5.5]`, X | ✅ `{ at: [0, 0.75, 5.5], axis: 'x' }`; the Guides footer opened itself (`Guides · 2`) |
| 5 | Lines draw dashed in axis colours across the scene | ✅ X red, Z blue, Y green (by eye: see below) |
| 6 | Slide along the X line in open space | ✅ hover `kind 'line'` at `[32.0625, 0.75, 5.5]`, then `[33, 0.75, 5.5]`: along-axis on the 1/16" grid, y and z exact; marker drawn |
| 7 | Anchor on a slid point, Y, Enter | ✅ `{ at: [33, 0, 5.5], axis: 'y' }` (canonical) |
| 8 | Hover the X/Y crossing | ✅ `kind 'line-cross'` at `[33, 0.75, 5.5]`, owner `{ id: X, cross: Y }`, darker marker |
| 9 | Duplicate: anchored on the crossing, X (the same X line), Enter | ✅ hint `Along X — that line is already there; type a distance`; no guide added, undo stack unchanged (5), anchor and axis kept (A1) |
| 10 | Remove the X line while anchored on its crossing; then Ctrl+Z | ✅ anchor and axis dropped (inv 24, `cross`); undo restored the line |
| 11 | Remove labels | ✅ `Remove line along Z at X 24", Y 3/4"`, `… X at Y 3/4", Z 5-1/2"`, `… Y at X 33", Z 5-1/2"` |
| 12 | Anchored + Y locked, focus on the Guides footer toggle, Enter | ✅ the toggle activated (footer closed); no line placed; anchor and axis kept |
| 13 | Move: grab corner `[24, 0.75, 5.5]`, drop on the crossing | ✅ board position `[0, 0, 0]` → `[9, 0, 0]` exactly |
| 14 | Guides toggled off | ✅ no lines drawn; no slide candidate; on again, lines back |
| 15 | Exploded (`setExplode(0.5)`, view state) | ✅ lines hidden (A2); the list's fieldset disabled; `addGuideLine` refused (false), count unchanged |
| 16 | Section cut, side at x = 30 | ✅ board clipped; the Y line at x = 33 still drawn (not clipped); the Z line hidden behind the board (depth-tested) |
| 17 | Reload | ✅ all three lines and the board's move restored from autosave |
| 18 | Metric list | ✅ `Line along Z · X 610 mm · Y 19 mm`, `… X · Y 19 mm · Z 140 mm`, `… Y · X 838 mm · Z 140 mm`; stored values unchanged; switched back to inches |
| 19 | Console | ✅ no errors |

## By eye — the user's rulings

Owed: line colour and opacity (placed 0.55, preview 0.9), lines hidden behind parts (depth-tested), the two marker hues
(`line` #4a86b8, `line-cross` #3a4a8c). Rulings (2026-10-30): all three kept as built — "looks fine as is, keep all
three". Lines stay dashed in axis colours at 0.55 (preview 0.9), depth-tested behind parts, and both marker hues stay.
