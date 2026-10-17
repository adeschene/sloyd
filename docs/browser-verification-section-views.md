# Browser verification — section views on the Plans sheet (fu 256)

Date: 2026-10-17. Dev server (`npx vite --port 5179`), the Playwright MCP browser, branch `section-views` at `0a90531`.
Baseline `localStorage` (read from `/package.json`): empty. Fixtures imported through Project ▾ → Import….

| Case | Section | Heading read back | Marker | Caps (`data-hatch`) |
|---|---|---|---|---|
| Table | Side at 0.9" | `Section A–A — Side cut 1-7/8" from the left, looking toward the left` | Plan | 0, 0, 1, 1 |
| Bookcase (sides dadoed) | Front at 5" | `Section A–A — Front cut 5" from the back, looking toward the back` | Plan | 0, 0, 1, 1, 1 (sides ≠ shelves) |
| Table | Top at 25", Flip | `Section A–A — Plan cut 25" from the bottom, looking up` | Front (arrows up) | 0 ×6, 1 ×2 |
| Table, metric | Front at 300 mm | `Section A–A — Front cut 325 mm from the back, looking toward the back` | Plan | 3 caps |

- The hatch applies on a real page: the first cap's computed `fill` is `url("#_r_3_-h0")` (`useId` + `CSS.escape`), and
  the screenshots show the pattern.
- The bookcase's dado notches show in the cut outline (`docs/img/fu256-section-bookcase.png`). The cutting line, arrows and
  "A" letters on the trio: `docs/img/fu256-cut-mark.png`.
- The distances are measured from the piece's own minimum: the metric table's top overhangs 1" behind the origin, so 300 mm
  reads 325 mm.
- **A real print** (`page.pdf()`, Letter): 3 pages — the exploded view, the trio, then Section A–A alone on page 3, unsplit,
  black on white, with the hatch visible and `Dimensions in mm` in the margin. `emulateMedia` was reset to `null` afterward.
- Seen live and recorded as fu 384(1): a fixture whose aprons OVERLAP the legs gives them the same hatch where they cross.
- Cleanup: the six `sloyd.*` keys this pass created were removed and `localStorage` read back empty; the browser was closed and
  the dev server stopped by PID.
- Left for the user's eye: the hatch density and weight on paper, and the cut line's weight and arrows (fu 384(2)).
