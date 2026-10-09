# Browser verification — refine by instruction (2026-10-09)

Dev server (`npm run dev -- --port 5199`) on branch `refine` at `c15f035`, driven through the
Playwright MCP (headed, the user watching), software GL. The user approved both paid runs. The
profile's stored API key was used as stored.

## 1. Generate the original — "A small side table with a lower shelf"

The dialog kept Moderate from an earlier session (Simple was intended; immaterial). `Ready`,
`≈ $0.05`. Saved `Small Side Table with Lower Shelf`: 14 loose parts, no assemblies; three shapes —
four legs (22-1/2 × 1-1/2 × 1-1/2), four aprons and four stretchers (both 13 × 3-1/2 × 3/4, kept
apart by role).

## 2. Refine — "Make the legs 2in longer and add a drawer under the top"

- Dialog: Detail preselected **Moderate** (14 distinct + 3 headroom > Simple's 12); estimate
  `≈ $0.02`.
- Finished `Done`, **actual `≈ $0.07`** (the estimate is a first-call lower bound; see fu 236).
- `0 new issues · 0 already present`. Change list, verbatim:
  `Added placement Drawer` · `Top moved Y +2"` · four `… leg: 22-1/2" × 1-1/2" × 1-1/2" → 24-1/2" ×
  1-1/2" × 1-1/2"` · `Back/Left/Right apron moved Y +2"` · `Added Left runner (13" × 1-1/2" × 3/4")` ·
  `Added Right runner (…)` · `Removed Front apron`.
- Stored result (read from `localStorage`):
  - the original is unchanged (stored JSON identical to the pre-run snapshot) and still active; the
    refined project exists, unopened;
  - **untouched parts exactly in place:** the four stretchers and the lower shelf have identical
    positions and sizes;
  - links: the legs still one shape (24-1/2in), the three remaining aprons one shape, the
    stretchers one shape;
  - the drawer is one definition (front, two sides, bottom, back) placed once, `rotation: 0`;
  - kerf carried over; no `"role"` in the stored JSON.
- Every change-list line matches the stored difference.

## 3. Refusal before any call

A cut added by hand to the original's Top (Properties → Add cut), then Refine opened: the dialog
showed only `Refine works on prototypes without joints. Refine first, then add joinery.`, no
instruction box, Refine disabled. Undo removed the cut (0 cuts stored afterwards). No paid joinery
run was needed.

## Console

0 errors; warnings only from three.js and the GL driver.

## Cleanup

Both projects this check created were deleted through the app's project menu; the profile's 16
older projects and its stored key are untouched (the user's standing choice).
