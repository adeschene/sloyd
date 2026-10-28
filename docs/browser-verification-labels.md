# Browser verification — part labels

Date: 2026-10-28. Dev server (`npm run dev -- --port 5199`, restarted fresh first so the script's store is the app's) on branch
`labels`. **Nobody watched this run.** There was no X server, so the Playwright MCP's headed browser could not start. The pass was
driven headless from a node script using the MCP's own Playwright library: `/opt/google/chrome/chrome` headless, SwiftShader GL,
`DISPLAY` unset, a scratch profile. No paid call, and production was not touched. The test project, "Shaker table" (the
`SHAKER_TABLE_JSON` fixture), is in the SCRATCH profile on origin `:5199`, not in the user's dev profile, and it is left in place.

## Readouts

- **Cut list → `Labels…`** opens the Labels sheet and closes the cut list. The count reads `9 labels on 1 sheet`, one for each piece
  (4 legs, the top, 2 front/back aprons and 2 side aprons).
- **The first three labels:** `1 Leg FL | 28-1/4" × 1-3/4" × 1-3/4" | Oak · grain along length | Shaker table 1 of 4`, then
  `Leg FR … 2 of 4` and `Leg BL … 3 of 4`. The numbers are the cut list's row numbers: the legs are row 1, the top row 2, the
  aprons rows 3 and 4.

## Print geometry (each preset, print emulation and `page.pdf({ preferCSSPageSize: true })`)

| Preset | Cells | Header in print | PDF pages (pt) | First cell vs preset | Last cell vs preset |
|---|---|---|---|---|---|
| Avery 5160 | 30 | hidden | one, 612 × 792 (Letter) | 0.0000" | 0.0000" |
| Avery 5163 | 10 | hidden | one, 612 × 792 | 0.0000" | 0.0000" |
| L7160 | 21 | hidden | one, 594.96 × 841.92 (A4 is 595.28 × 841.89: within 0.32 pt, Chrome's whole-pixel page) | 0.0001" | 0.0001" |
| L7163 | 14 | hidden | one, 594.96 × 841.92 | 0.0001" | 0.0001" |

The page box sits at the paper's corner. The PDF's own text positions, read with PyMuPDF, put 5160's first size line at x = 0.247"
(the 0.1875" margin plus the 0.06" padding), and L7163's at 0.243" (4.65 mm plus 0.06"). A render of the 5160 PDF shows nine stickers
in the top three rows and nothing else on the page: no header, no outlines.

## One finding, fixed

On screen, the true-size Letter page (8.5" ≈ 816 px) overhung the cut-list-width sheet (760 px). Fixed in the build: `.labels-sheet`
is `min(8.5in + 56px, 100%)` wide and scrolls sideways on a narrow screen. In print, the sheet's width comes from the print rule and its
overflow is reset to visible. The re-run's numbers above are unchanged.

**Owed to the user:** one printed sheet held against real sticker stock. Software GL throughout: the screenshots show layout only
(fu 26a).
