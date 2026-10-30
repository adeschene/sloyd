# Browser verification — construction lines, round 2 (fu 578–582, schema 32)

2026-10-30. The user's own Chrome over the MobaXterm tunnel (`localhost:5199`, real GPU), Claude driving through
claude-in-chrome. Dev server on branch `construction-lines-2` at `5be927a`, served from the worktree. A NEW project,
"Construction lines 2 check", left in place afterwards (dev profile rule). It holds:
- four parts: Plain, Dadoed (the default cut: a dado 6"–6-3/4" across, half deep), Bored (a 1/2" through hole at
  x 12, z 22-3/4), and an upright 1-1/2" × 1-1/2" × 18" Leg raked 8°;
- the guides listed per check below.

The parts were built and a few lines placed through the store actions the UI calls; each check below says which steps
used the real mouse or keyboard. Readouts are from the page's own store module.

| # | Check | Result |
|---|---|---|
| 1 | Round 1's project opens on the new build | ✅ `version: 32`, its three axis lines and the moved board intact |
| 2 | Anchored on the leg's bottom corner, a hover on the same edge's top corner, no axis, nothing typed | ✅ hint `Enter for a line through both points, or type a distance`; the preview line draws along the leg edge and past it |
| 3 | Enter from the page (App's path, real key) | ✅ `{ at, to }` stored exactly at the two corners; anchor cleared; one undo entry |
| 4 | Oblique line drawn; its Guides row | ✅ dashed violet-grey along the leg, hidden where the leg covers it; `Line through 30", 1/16", 2-1/2" and 30", 17-7/8", 0"` |
| 5 | Slide along the oblique line (real mouse hover on its visible stretch) | ✅ hover `kind 'line'`, owned by the line, at distance −7.25" from `at` (−116/16: on the 1/16" grid) |
| 6 | Face hits (`lineFaceHits`, the tools' source) | ✅ see the face-hit cases below |
| 7 | Face hits through the real pick (pointer moves across the viewport) | ✅ 24 `line-face` picks among line, crossing, corner, edge and face points; a real mouse hover on the dado wall picked `line-face` `[6, 0.5, 12]`, owner `{ guide, board: Dadoed }` |
| 8 | Move: grab Plain's corner `[24, 0, 0]`, drop on Bored's face hit `[13, 0.75, 22.75]` | ✅ 22 face-hit targets offered, none on Plain itself; Plain to `[-11, 0.75, 22.75]` exactly; one undo entry; undone |
| 9 | Shift+Enter step, real keys: anchor on Plain's corner `[24, 0.75, 0]`, **Z**, **3** | ✅ hint `Along Z — Enter to place, Shift+Enter to move the anchor there` |
| 10 | **Shift+Enter** | ✅ anchor `kind 'offset'` at `[24, 0.75, 3]`, `base` the corner; no guide added; no undo entry; Z lock kept; text cleared; the crimson marker drawn on the board's edge |
| 11 | **X**, **Enter** | ✅ X line `{ at: [0, 0.75, 3], axis: 'x' }`; one undo entry; anchor cleared |
| 12 | Edit that line's Z in the Guides list (real typing `2 1/2`, Enter) | ✅ stored exactly 2.5; one undo entry |
| 13 | Ctrl+Z from the page | ✅ z back to 3; the field resynced to `3"` |
| 14 | An oblique line on the floor, `[0,0,0]`→`[24,0,25.5]` (the ground-lift ruling) | ✅ shows as a dashed line on the grid, not lost in it; hidden under the boards |
| 15 | Oblique crossing: that floor line and an X line at y 0, z 12-3/4 | ✅ one `line-cross` at `[12, 0, 12.75]`, owned by both lines |
| 16 | Plans sheet: `Construction lines` checkbox | ✅ present before Print, unticked by default, enabled (the document has lines); unticked, no `path.plan-construction` |
| 17 | Ticked | ✅ the piece's trio draws 3 chain-line paths (one per view), clipped to each figure; the exploded view none; the figure did not resize |
| 18 | Exploded (`setExplode(0.5)`, view state) | ✅ `addGuideLine` and `moveGuideLine` refused; guide count unchanged; the Guides list's fieldset disabled; restored to 0 |
| 19 | Reload | ✅ all nine guides (two oblique, seven axis) back from autosave at version 32; the stepped line at z 3; the leg's lean |
| 20 | Guides list rows with fields | ✅ axis rows read `Line along X` with labelled fields (`Y`, `Z`) on the same line and × at the end; oblique rows are text |
| 21 | Console | ✅ no errors or warnings |

Face-hit cases for check 6:

| Line | Part | Hits |
|---|---|---|
| X line, y 3/8, z 2-3/4 | Plain | `[0, …]` and `[24, …]`, exactly |
| X line, y 1/2, z 12 | Dadoed | 0, 6, 6-3/4 and 24 (the dado walls are surfaces) |
| Z line, x 6-3/8, y 1/2 | Dadoed | none (it lies in the dado's air) |
| Z line, x 6-3/8, y 0.2 | Dadoed | z 10 and z 15-1/2 only (no hit at the cell seams) |
| Y line down the bore's axis | Bored | none |
| Y line, x 13, beside the bore | Bored | y 0 and y 3/4 |
| The leg's edge line | Leg | its two corners |

Not exercised in the browser:
- **Print preview.** The print dialog blocks the page. The chain lines are SVG paths in the sheet's DOM, and the print
  stylesheet hides only `.cutlist-actions`, the checkbox's row.
- **Metric rows.** Covered by the unit tests.

## By eye — the user's rulings

Owed:
- the oblique line's colour (`#8a7fb0`), and the floor diagonal against the grid (check 14);
- the `line-face` marker (`#341c00`) and the stepped-anchor marker (`#f00058`);
- the Plans chain line (`12 3 2 3`);
- the Guides row layout.

Also for the user (record only, fu 589): round 1's `line` and `line-cross` hues sit below fu 249's colour-blind floor
against the guide-point marker.

Rulings (2026-10-30): all kept as built — "The current state is fine, although I'm fine with making changes that align with
the color blindness requirements." The colour-blind retune is fu 590, approved in principle; selectable guides, the user's new request, is fu 591.
