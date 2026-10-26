# Browser verification — stretchers (splayed legs chunk 3, fu 438)

2026-10-26, dev server (`npm run dev -- --port 5180`) on branch `stretchers` at `8982cfc` (the app code; Task 6 was docs only),
driven through the Playwright browser (software GL). DOM readouts first; joints and the design check read through the loaded
`tenonJoints` / `checkDesign` on `flatDocument`. No paid call was made. Test project "Stretchers check" (the chunk 1 stool file,
renamed, imported) is left in the dev profile with its four stretchers.

| # | Check | Result |
|---|---|---|
| 1 | The imported stool's legs lean TURNED. Front right + Front left selected: the `Stretcher` section shows `Height`, `Rung size`, `Tenon diameter`, `Add stretcher`; Add refuses `Set Front right square to the sides first (Lean).` (spec Amended S1). All four legs selected, Lean `Set` → `Square to the sides` in one step; Level the ends on Front right and Front left (their link-mates share the cuts): compound end miters, legs 17-1/8". Seat → Bore leg sockets with Tenon the legs | PASS (verbatim) |
| 2 | Front right + Front left: defaults Height 5-13/16", Rung size 1", Tenon diameter 5/8"; Add stretcher: a flat `Stretcher` along X, 14-5/16" stock, two 5/8" tenons, selected; its readout `Between Front left and Front right, 5-13/16" up · shoulder gap up to 1/4"`, and the notes `Back left got this socket too, through its link.` / `Back right got this socket too, through its link.` | PASS (verbatim) |
| 3 | Back left + Back right at the default (5-13/16"): `Stretcher (1)` added and the legs' socket rows REUSED (each leg Shape still holds one row) | PASS |
| 4 | The two side pairs: the default steps to 7-5/16" (the front/back sockets would meet at 5-13/16"); `Stretcher (2)` and `Stretcher (3)` added along Z. Design check clean with 12 joints (4 legs in the seat, 8 rung tenons in the legs). Cut list: the rungs' tenon lines (`5/8" round tenon, 7/8" long — at the length min end, shoulder 13-7/16" from the other end`) and the legs' socket lines (`Hole 5/8" dia × 3/4" deep in the width face (min side), … bored 11.9° off square on a 4.0° sightline from the length, depth measured along the bit`) | PASS — `docs/img/stretchers-cutlist.png`, `docs/img/stretchers-iso.png` |
| 5 | Plans: the exploded view draws every rung with its tenons; keys `A Compound miter 12.0° × 8.0° (8×)`, `B Hole 1" dia × through (4×)`, `C Hole 5/8" dia × 3/4" deep (8×)`; no "Not shown" note | PASS — `docs/img/stretchers-plans.png` |
| 6 | All four legs' rake 8 → 10 together (a single leg's edit makes a linked stool lopsided, and its rungs are refused not square — ruling T3a), Level the ends on Front right and Front left: every joint stale (`No longer fits Front left and Front right — Fit the stretcher again.`). Seat → Bore leg sockets; `Fit the stretcher again` on `Stretcher` (ONE undo entry, its link-twin `Stretcher (1)` re-fitted with it) and on `Stretcher (2)` (one entry, with `Stretcher (3)`): 12 joints, the check clean. Undo: the side rungs stale again (8 joints); Redo: 12 joints, clean | PASS (verbatim) |
| 7 | Refusals: Front right + Back left (a diagonal) → `These legs aren't square to each other at that height — a stretcher must run straight along the front, back or sides.`; Height 30 → `Front right doesn't reach that height.`; nothing added (still four rungs) | PASS (verbatim) |
| 8 | Console: 0 errors throughout (warnings: three.js deprecations only) | PASS |

**No new findings.** The readout names the legs in tenon order (`Between Front left and Front right` for a rung added from Front right
then Front left) — ruling T5b, in the copy review.

**Not verified in the browser:** real hardware (fu 26a) and a printed Plans sheet; a metric stool (covered by unit tests).
