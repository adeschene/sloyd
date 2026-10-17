# Browser verification — presets batch (fu 278, 298, 367)

Date: 2026-10-17. Dev server (`npm run dev -- --port 5180`), the Playwright MCP browser, branch `presets-batch` at `4e0fd00`.
Baseline `localStorage`: empty (the one `Untitled` project present was created by the first page load of this pass).
Fixture imported through Project ▾ → Import…: a 28 × 2 × 2 leg, a 20 × 12 × 3/4 panel, a 30 × 5 × 3/4 apron.

| Case | What was done | Read back |
|---|---|---|
| Menu | `+ Add ▾` on the leg | Taper, **Taper two faces**, **Taper four faces**, Miter, Miter both ends, Bevel, Chamfer, **Raised panel** |
| fu 278 | Leg → Taper four faces | four rows: `Taper 1/2" off the width face (min side) / (max side)`, `… thickness face (min side) / (max side)`, each `from 21" from the length min end` |
| fu 298 | Panel → Raised panel | four rows, fields `Into the width 1-1/2"` / `Into the thickness 1/2"` (long edges), `Into the length 1-1/2"` / `Into the thickness 1/2"` (ends) |
| Viewport | Hide others, Iso | flat field, four bevels meeting on the corner diagonals, a thin tongue at every edge (`docs/img/presets-raised-panel.png`) |
| Plans sheet | Plans | the panel's Plan shows the field rectangle and the four corner diagonals; Front/Side show the bevels and the tongue; the leg's tapers drawn; key list `A Chamfer 1-1/2" × 1/2" (4×)`, `B Taper 1/2" over 21" (4×)` (`docs/img/presets-plans.png`) |
| Cut list | Cut list | stock unchanged (Panel 20" × 12", 1.25 bd ft; Leg 28" × 2", 0.78 bd ft); the part diagrams list every chamfer and taper as notes (`docs/img/presets-cutlist.png`) |
| Metric | Units → mm, then back | `Into the width 38 mm`, `Into the thickness 13 mm`; bench line `Chamfer 38 mm into the width × 13 mm into the thickness, …` |
| fu 367 | Apron → Arch; Kind → Bow → Rounded corner → Arch | `Arch on the width min side, 3" in from each length end: 24" span, 1-1/4" rise` → `Bow the width min side 1/2"` → `Round the corner of the length min end and the width min side to a 1" radius` → the Arch again; no alert at any step; **Half-round notch disabled** only while the 24" arch is stored (its notch would cut through the 5" apron) |

- Seen live and recorded as fu 385: the raised panel's cut-list row reads `Short point 17"`. Geometrically true (the front
  face's long edges are 20 − 2 × 1-1/2), but a raised panel's end bevels are not end cuts a woodworker measures a short point
  from.
- Console: 0 errors; the warnings are the known THREE deprecations and the software-GL ReadPixels stall.
- Cleanup: the three `sloyd.*` keys this pass created were removed and `localStorage` read back empty from `/package.json`
  after leaving the app; the fixture file was deleted; the dev server was stopped.
- Left for the user's eye on real hardware: the bevels' shading and grain (software GL). **Approved by the user 2026-10-17**
  ("The shading and grain looks good").
