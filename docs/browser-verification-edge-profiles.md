# Browser verification — edge profiles, chunk 1 (fu 365 full-length, fu 386)

Date: 2026-10-17. Dev server (`npm run dev -- --port 5180`), the Playwright MCP browser, branch `edge-profiles-1` at `3dd0eb2`
(before the final-review fixes). Fixture `.playwright-mcp/edge-profiles-check.sloyd.json` (gitignored), imported through
Project ▾ → Import… as the project "Edge profiles check" and left in place (the user's dev-profile ruling):

- **Top** 36 × 20 × 3/4, a 1/4" Roundover on all four top edges;
- **Shelf** 30 × 10 × 3/4, a Roman ogee (length, max, max), a bead (width, max, max) and a thumbnail (length, min, max);
- **Old rail** 24 × 3 × 3/4, a pre-chunk `cornerCurve` through the length, radius 3/8.

| Case | What was done | Read back |
|---|---|---|
| Properties | Select each part | a Profiles section lists every profile, Curves lists none; the old rail's through-length corner reads `Roundover 3/8"` |
| Row edits | Old rail: Fillet on, then Profile → Cove → Thumbnail, then Edge → index 0 | each edit applied; the row and its bench line follow each change |
| Cut list | Cut list | bench lines per profile; the top's four roundovers collapse to one line (`Roundover 1/4" on all four edges of …`) |
| Part diagram | Cut list diagrams | the waste hatched in the end view, one note per profile entry (`docs/img/edge-profiles-diagram.png`) |
| Viewport | Iso | profiles render smooth with no seams or pinholes (`docs/img/edge-profiles-iso.png`; software GL, so shading is for the user's eye) |
| Plans sheet | Plans | key `A Roundover 1/4" (4×)` and one letter for each of the shelf's profiles (`docs/img/edge-profiles-plans.png`) |
| Metric | Units → mm, then back | profile rows and the preset menu's details in whole mm |

- **Found live (Important, fixed in the final fix pass as F1, `34d4b16`):** the Plans exploded view dropped the shelf's far long
  edge. The thumbnail's crisp line on the width-min edge face is a silhouette edge, but `drawView` put it in `hidden`: visible
  length 74.9 against 99.8 for the plain shelf. Cause: an edge whose most viewer-facing face meets the view shallowly
  (n·toward ≲ 0.25) grazed hidden in its own DRAW_EPS-grown body. Now every curved-part model edge carries an along-view probe
  lift (`curveEdgeLifts`). Checked against an independent ray oracle: 281 wrong verdicts before the fix, 0 after, across every
  kind × edge × facing × view, the four-edge sets and the Curves presets (which had the same defect on master). The fixture
  gives 0 mismatches in all four views.
- Console: 0 errors; the warnings are the known THREE deprecations and the software-GL ReadPixels stall.
- Left for the user's eye: profile shading on real hardware — **approved by the user 2026-10-17** ("The profiles look great on
  real hardware") —, and the Plans sheet on a real print.
