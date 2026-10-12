# Browser verification — lumber yield and cost (2026-10-12)

Dev server only (the deployment rule), driven through the Playwright MCP on a FRESH port (127.0.0.1:5182), so no
earlier projects or keys were on that origin. Software GL (llvmpipe) — nothing here depends on rendering.

## Fixture

`cabinet-test.sloyd` (carcase in ¾" plywood, two drawers: oak fronts/backs, ½" maple sides, ¼" plywood bottoms),
imported through the project menu; later one added board was set to pine and narrowed to 5" in Properties.

## Checked

| Check | Result |
|---|---|
| Cut list with no prices | Buying lines show quantities with "no price"; total `Estimated materials: — (3 materials have no price)` |
| Board foot | `Oak — 3/4": buy 2.82 bd ft (2.17 bd ft net × 1.3)`, `Maple — 1/2": buy 1.81 bd ft (1.39 bd ft net × 1.3)` |
| Lumber & prices from the cut list | opens above it; the cut list is `inert`; `abc` in a price disables Save (refused, not clamped) |
| Mode switch | oak → by the piece, Add/Remove size, → back to board foot |
| Save | oak $9, maple $7.50, plywood $60 → `$25.35`, `$13.54`, `$60.00` × 2; total `$158.89` (hand: 25.35 + 13.54 + 60 + 60). `sloyd.shop.v1` written |
| Focus | returns to "Lumber & prices…" after Save |
| Escape over the cut list | closes only the prices dialog; the cut list stays open |
| From Settings | "Lumber & prices…" link opens the dialog with the saved values (oak 9) |
| Too-wide pine part | a 15½"-wide pine board (wider than any default pine stock) → `Board (3/4" × 15-1/2" × 28-1/2") fits no pine stock — too wide`; total adds `(1 part not placed)` |
| By the piece | narrowed to 5": `Buy 1 × 3/4" × 5-1/2" × 72" · no price` (no prices → smallest area that holds it); total `$158.89 (1 material has no price)` |
| Board layout | drawn as a labelled strip `3/4" × 5-1/2" × 72" — board 1` (`docs/img/lumber-buying.png`) |
| Print (emulateMedia) | Buying text `rgb(0, 0, 0)`; the button row `display: none` |
| Console | no new warnings (only the existing Three.js / WebGL software-GL ones) |

Observed, not a defect of this round: "+ Add board" copies the current material (plywood in this fixture), which is
existing behaviour.

## Cleanup

All four keys on the fresh origin were created by this check (`sloyd.library.v1`, two `sloyd.project.*`,
`sloyd.shop.v1`); they were removed by name from a same-origin blank page and read back empty. No
`localStorage.clear()` (the dev-browser rule).

## Not verified

A real print-to-PDF (no `pdf()` here, as fu 70/79/84); real-world prices; the dialog on a small screen.
