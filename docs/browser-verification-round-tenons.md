# Browser verification — round tenons (splayed legs chunk 2b, fu 447)

2026-10-25, dev server (`npm run dev -- --port 5180`) on branch `round-tenons` at `f7ea86e`, driven through the Playwright
browser (software GL). DOM readouts first; numbers read off the live store through the module instance the app itself loaded
(its version-stamped URL from `performance.getEntriesByType('resource')`), joints and the design check through the loaded
`tenonJoints` / `checkDesign` on `flatDocument`. No paid call was made. Test project "Stool tenons check" (the chunk 1 stool
file, renamed, imported at schema 22 and loaded as 24) is left in the dev profile, tenoned and bored (the user's 2026-10-17
ruling).

| # | Check | Result |
|---|---|---|
| 1 | Seat selected: the Holes section shows `Socket diameter`, `Tenon the legs (replaces their top tenons)` and `Bore leg sockets`. With the box ticked, one press (ONE undo entry) bores four 1" through rows (tilt tan 12° / tan 8°) and gives both leg Shapes one top tenon each, `end 'max'`, 1" × 1-3/4"; the legs lengthen 17 → 18-1/2" so each tip reaches the seat's top face. The leg's Round tenons section reads `Top` / `Shoulder 16-5/16" from the bottom` / `Seated in Seat's socket.`; the cut list prints `1" round tenon, 1-3/4" long — at the length max end, shoulder 16-5/16" from the other end` above both miter lines, and the part diagram draws the tenon as a circle in the end view and a shoulder line plus tenon outline in the side view | PASS (verbatim) — `docs/img/round-tenons-cutlist.png` |
| 2 | 3D: with the seat hidden the four tenons stand on the leg tops, round, with no facet lines; a Top section at 16-3/4" through the seat (flipped to keep the lower half) shows four hatched disc caps, one in each bore | PASS — `docs/img/round-tenons-3d.png`, `docs/img/round-tenons-section.png` |
| 3 | Plans: the exploded view draws each leg's tenon and the seat's four mouths; the plan view shows each tenon's circle in its socket with the hidden bore lines; the miters keep their `A` tags (`A Miter 14.3° (8×)`, no "Not shown" note — T6a); no tenon callout (fu 457). The per-part diagrams live on the cut list (check 1) | PASS — `docs/img/round-tenons-plans.png` |
| 4 | Design check clean, `tenonJoints` 4 (each leg's tenon in its own row). Remove one socket row: 3 joints and `Seat passes 1.105in into Front right along X.`; Undo: 4 joints, clean | PASS |
| 5 | Front right's tenon `Diameter` 2 on a 1-1/2" leg: `A round tenon must be narrower than the part's section.` as the field's own error (`aria-invalid="true"`, focus and the typed `2` kept), nothing stored (both Shapes still 1") | PASS (verbatim) — `docs/img/round-tenons-refused.png` |
| 6 | Front right rake 8 → 10: the Lean section shows `Ends were levelled for a different lean — Level the ends again`; after Level the ends the seat shows `Front right's socket no longer follows its leg — Bore leg sockets again.`, the same for Back left (its link-mate), and `Front right's tenon no longer fits its socket — Bore leg sockets again.` / the same for Back left. Bore leg sockets again: those two rows re-tilted in place (ids kept, `tiltAcross` now tan 10°), the tenon id kept with its length re-fitted (1-3/4 → 1-49/64"), the other pair untouched; notes cleared, 4 joints, the check clean | PASS (verbatim) |
| 7 | `npm run build` exits 0 | PASS |
| 8 | Console: 0 errors throughout (warnings: three.js's `PCFSoftShadowMap` and `THREE.Clock` deprecations only) | PASS |

**No new findings.** The bench line's `at the length max end` beside the panel's `Top` is the ruled wording (P1, T8a) and is
already in the copy review (fu 464).

**Not verified in the browser:** real hardware (fu 26a) and a printed Plans sheet with a tenon; the by-eye items of fu 465.
