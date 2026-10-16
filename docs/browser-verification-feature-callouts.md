# Browser verification — Plans sheet feature callouts (fu 333, 279, 362)

Date: 2026-10-16. Branch `feature-callouts`, dev server on :5179, Playwright (software GL; the sheet is SVG, so nothing here
depends on the GPU). The profile's baseline `localStorage` was EMPTY (read from `/package.json`); the pass created
`sloyd.library.v1` and one project key, both removed and read back empty after 3 s from the same non-app path, then
`about:blank`. Documents were built with the app's own modules and loaded through `import('/src/store/store.ts')`
→ `replaceDocument`; readouts are from the DOM. Console: 0 errors (one favicon 404).

## 1. Bookcase (imperial) — `docs/img/feature-callouts-bookcase.png`

Two upright sides (turned 90°) with a Shelf-pin row each (stored `from: 'max'` on the left, `'min'` on the right — probed:
the mouths sit at x = 0.75 and x = 23.25, both facing IN), a top, a bottom, an on-edge apron with an arch.

- Key list: `A Arch, 18-1/2" span, 1-1/4" rise (radius 34-7/8")`, `B Row of 21 holes, 1/4" dia × 3/8" deep, every
  1-17/64" (32 mm) (2×)`. Tags `AB`.
- A is in Front — the arch's true view (looking through the apron's thickness).
- B is in Side — the rows' true view (looking down the hole axes). The two rows project onto one spot there and MERGED into
  one tag (R6), the count still 2×. **R4 exercised:** the same scene through `drawView` has 0 visible and every row segment
  hidden in all three views (Plan 84/84, Front 84/84, Side 4032/4032 per row), and `chooseView` picks Side, hidden (step 3) —
  the tag sits on dashed rims. At screenshot scale a 1/4" rim's `4px, 3px` dash reads as a solid ring (the effect fu 337
  recorded for rims); the readout, not the image, is the evidence.
- The exploded view carries no tags (R2).

## 2. Table (imperial) — `docs/img/feature-callouts-table.png`

Four upright legs, each tapered on its two inside faces (1/2" over 20"); two on-edge aprons mitered 45° at both ends.

- Key list: `A Miter 45.0° (4×)`, `B Taper 1/2" over 20" (8×)`. Tags `AAAABBBB`.
- A in Plan, at the apron ends: a miter across the thickness is edge-on looking down Y (its true view).
- B at each foot (the anchor is the outline point farthest from the part's centre); a leg's two tapers merged into one tag.
- **For the user's eye:** the four B tags sit on the overall-dimension lines under Front and Side (allowed by spec §4.4:
  tags may overlap dimension lines; the paper fill masks the line under the circle).

## 3. Metric cabinet assembly — `docs/img/feature-callouts-cabinet-metric.png`

A counter (loose) and a cabinet definition placed twice; the cabinet's door has two hinge cups.

- The piece trio: no key list (the counter has no features; the cabinet's parts belong to its listed assembly, §2.1).
- `Cabinet × 2`: `A Hole 35 mm dia × 13 mm deep (2×)` — mm through the bench-line helpers (ruling P1), counted as drawn,
  not multiplied by the placements. Both tags in Front (the cups' true view).

## 4. Print emulation

`emulateMedia print`: tag fill `#fff`, stroke `#000`, key text `#000`. Page fit is NOT judged: print emulation sets no paper
width, as in fu 254's earlier passes. A real print is owed (with 254).

## Not verified here

A real print; a crowded trio where tags are pushed or go to "Not keyed (no room)" (unit-tested only); a hand-edited compound
angle cut (ruling P2) and a lines-only curve (ruling P3) — unit-tested only.
