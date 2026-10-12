# Browser verification — Plans sheet and exploded view

Date: 2026-10-11. Dev server (Vite, port 5180), Playwright, software GL (fu 26a: layout and DOM, not shading).
Spec: `docs/superpowers/specs/2026-10-11-sloyd-plans-sheet-design.md`. Plan:
`docs/superpowers/plans/2026-10-11-sloyd-plans-sheet.md`. Branch `plans-sheet`; the pass ran on `9841726`, the fixes
landed in `70dd36c`, and the re-check below ran on that.

Run by the controller with the user watching (Playwright MCP). Fixture: `cabinet-test.sloyd`, a carcase plus a
drawer definition placed twice, one placement mirrored (17 parts; the Plans sheet reads
"Cabinet test" and "Drawer × 2 (one copy mirrored)"). The session started and ended with an empty `localStorage`.

## 1. What was checked, and how

**Viewport explode** (slider in the viewport controls, a `<fieldset class="edit-lock" disabled>` around the edit
controls):
- The slider at 0, 50 and 100%: the drawers move out as units, then open up a little (hierarchical, spec §3).
- While exploded: Add board, Undo, Redo and the name field are disabled; all 17 Properties controls report
  `:disabled` under the `display: contents` fieldset (the Task 6 ruling, now confirmed in a real browser); the keys
  M, T, Delete, Ctrl+D, Ctrl+Z and G changed nothing (still 17 parts, tool Select); selection, H and Alt+H still work;
  no gizmo is drawn.

**Plans sheet:** opened from the toolbar; sections "Exploded view", "Cabinet test", "Drawer × 2 (one copy mirrored)";
third-angle alignment of front, side and plan; hidden lines dashed beneath visible; the exploded isometric's hidden
lines correct; the sheet's own slider independent of the viewport's (`data-amount` 0.2 on the sheet, the viewport
untouched); controls hidden under `emulateMedia('print')`.

## 2. Findings

| | What | Resolution |
|---|---|---|
| F1 | Every dimension chain was omitted ("too dense") on the cabinet and the drawer: panel thicknesses of 1/4"-3/4" make many narrow segments, so spec §5.3's "more than a third dropped, omit the chain" arm always fired on casework. | **The user's decision.** Drop only the narrow segments, with a note; omit a chain only past `CHAIN_MAX` labelled segments. The one-third arm is removed (spec §5.3 amended). |
| F2 | Print: the plans SVG inherited the screen `--ink` (light), nearly invisible on white. The cut list has `.cutlist-diagram svg { color: #000 }` in print; plans lacked it. | Fixed: same print rule for the plans figure. |
| F3 | The Move and Tape buttons did not look disabled while exploded (the store refused silently). | Fixed: both are disabled while exploded. |
| F4 | At 100% the lower drawer sank below the floor (y < 0). | **The user's decision.** Lift the exploded set by `dy = max(0, assembledMinY − explodedMinY)` so its lowest part never goes below the assembled lowest point (spec §3 amended). |

## 3. Re-check after `70dd36c`

- Move and Tape are visibly disabled while exploded.
- The cabinet sheet shows chains (12", 7-1/4", 12-1/2") with "N small … spacings not labelled" notes under the views.
- Print ink computes to `rgb(0, 0, 0)`; the print screenshot is legible.
- At 100% the exploded piece stays above the floor.
- `localStorage` for `:5180` read empty after navigating away (`storageState`), checked rather than assumed.

Screenshots: `docs/img/plans-sheet-print-cabinet.png` (the cabinet's sheet under print media),
`docs/img/plans-explode-viewport-50.png` (the viewport at 50%).

## 4. Not verified

- **Real print-to-PDF.** Playwright exposes no `pdf()` here, so only `emulateMedia('print')` was driven; a trio
  taller than a page (`break-inside`) is unconfirmed. Same limit as fu 70/79/84; recorded as fu 254.
- **The explode spread constants on real hardware.** `EXPLODE_SPREAD` and `EXPLODE_INNER` were looked at on software
  GL (llvmpipe, fu 26a) only; recorded as fu 255. The drawings are exact vector geometry, so 26a does not touch them.
