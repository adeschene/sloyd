# Browser verification — square-set legs and compound level cuts (splayed legs chunk 2c)

2026-10-26, dev server (`npm run dev -- --port 5180`) on branch `square-legs` at `e663a71` (records commit; the app code is
`e318f88`), driven through the Playwright browser (software GL). DOM readouts first; numbers read off the live store through
the module instance the app itself loaded (its version-stamped URL). No paid call was made. Test projects left in the dev
profile: "Square legs check" (one cleared square-set leg with its compound cuts) and "Stool check (splayed legs)" (the
chunk 1 stool file, re-imported).

| # | Check | Result |
|---|---|---|
| 1 | A new upright part (16 × 1-1/2 × 1-1/2), rake 8 toward the front, splay 12 toward the right: the Lean section shows `Set` = `Square to the sides`; the stored lean is `{ x: tan 12°, z: tan 8°, face: 'thickness', square: true }`. Top view: the leg's faces sit square to the grid; measured through `leanMap`, the width face's plan direction is −0.834° and the thickness face's +0.824° (spec §1: 0.83° / 0.82°) | PASS — `docs/img/square-legs-top.png` |
| 2 | Level the ends: ONE miter per end, each `along: 'width'` with `across: { rise: tan 8°, from: 'max' / 'min' }`; the cut list prints `Compound miter at the length min end: 12.0° across the width, 8.0° across the thickness` (and the max end) (after the final review, the line also names its long corner — TFa; this check was not re-run), short point 16-1/2". The leaned body's four lowest vertices are at y = 0 exactly and its four highest at y = 16 exactly: the foot stands flat, the top is level | PASS (verbatim) — `docs/img/square-legs-cutlist.png`, `docs/img/square-legs-iso.png` |
| 3 | Set → `Turned to the lean (one-cut ends)`: the stored lean drops `square`, and `Ends were levelled for a different lean — Level the ends again` shows; Level the ends then writes two single-slope miters (`along: 'thickness'`, no `across`). Set back to `Square to the sides` and Level: the compound cuts return | PASS (verbatim) |
| 4 | Re-import the chunk 1 stool file (schema 22): it loads at version 25 unchanged — both Shapes' leans have no `square` key, their level cuts no `across`; Front right's Set reads `Turned to the lean (one-cut ends)`; no stale note | PASS |
| 5 | A Hole preset on the square-set 8°/12° leg, then Set → Turned: `Changing how this leg is set would turn it about its length and move its holes — remove the holes first.` as an alert; nothing stored changes (`square` still true) and the select stays on `Square to the sides` | PASS (verbatim) |
| 6 | Undo the hole, then Clear lean on the levelled square-set leg: the lean is gone, both compound cuts stay; each Angles row shows only `Miter`, its bench line and Remove (✕) — no Across / End / Long point / Angle controls | PASS — `docs/img/square-legs-cleared.png` |
| 7 | Console: 0 errors throughout (warnings: three.js deprecations only); `npm run build` exits 0 | PASS |

**No new findings.**

**Not verified in the browser:** real hardware (fu 26a) and a printed Plans sheet with a compound foot; the copy review (fu 473).
