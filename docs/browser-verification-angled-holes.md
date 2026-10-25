# Browser verification — angled holes (splayed legs chunk 2)

2026-10-25, dev server (`npm run dev -- --port 5180`) on branch `angled-holes` at `ef556f4`, driven through the Playwright
browser (software GL). DOM readouts first; numbers read off the live store through the module instance the app itself loaded
(its version-stamped URL, `performance.getEntriesByType('resource')` — after HMR the bare `/src/store/store.ts` is a second,
empty instance). No paid call was made. Test project "Stool sockets check" (the chunk 1 stool file, renamed, imported) is left
in the dev profile with its four sockets bored (the user's 2026-10-17 ruling).

| # | Check | Result |
|---|---|---|
| 1 | Seat selected: the Holes section shows `Socket diameter` (1") and `Bore leg sockets`; pressing it bores four 1" through rows in ONE undo entry, each tilted (`tiltAlong` ±0.2126 = tan 12°, `tiltAcross` −0.1405 = tan 8°), each row's readout `Bore 14.3° off square · sightline 33.5° from the length` | PASS (verbatim) |
| 2 | Top view: four sockets near the corners, each leg's top visible down through its socket; Iso: the bores in the seat | PASS — `docs/img/angled-holes-top.png` |
| 3 | Section Front at z = 4.9 through the front sockets: the seat's cap shows the bores cut through at the legs' slant | PASS — `docs/img/angled-holes-section.png` |
| 4 | Cut list: the seat's bench lines end `bored 14.3° off square on a 33.5° sightline from the length`; its diagram draws the four mouths as user-unit paths (`path.cutlist-diagram-hole`, no `<ellipse>`, no vector-effect), the same stroke weight as the outline. Plans: the exploded view shows the mouths as ellipses; the plan view tags the sockets; the elevations draw the slanted bores as hidden lines | PASS — `docs/img/angled-holes-seat-diagram.png`, `docs/img/angled-holes-plans.png` |
| 5 | Front right rake 8 → 10: after Level the ends, the seat shows `Front right's socket no longer follows its leg — Bore leg sockets again.` and the same for Back left (its link-mate); Bore leg sockets again replaces exactly those two rows in place (ids kept, `tiltAcross` now tan 10°), one undo entry; the notes clear | PASS (verbatim) — see the finding below |
| 6 | `Tilt toward end` 45 on a row with 10° across: `The bore can't tilt past 45° in all — reduce an angle.`, the typed text kept, nothing stored; 20 stores `tiltAlong` exactly tan 20° (−0.36397023426620234) and leaves `tiltAcross` bit-identical; readout `Bore 22.0° off square · sightline 25.8° from the length`. `First at` 0.6 on that 20°-outward bore: `Puts hole 1 past the length max end — move it in, or reduce the count or the spacing first.` (its mouth would fit; its wall leaves the end lower down), nothing stored | PASS (verbatim) |
| 7 | A Hole preset added to the leaning Front left (no refusal): ¼" × ½" deep, 8-1/2" from the foot. Rake 8 → 6, then Level the ends: the foot shortened 3/16" (length 17 → 16-13/16), the row's station 8.5 → 8.375, and the hole's world mouth and bottom are identical before and after (distance 0) | PASS |
| 8 | Undo ×8 restores the imported stool exactly (no holes on the seat or the leg, rake 8°, length 17) | PASS |
| 9 | Console: 0 errors throughout (warnings: three.js's `PCFSoftShadowMap` and `THREE.Clock` deprecations only) | PASS |

**Finding (check 5):** right after a lean edit, BEFORE Level the ends, the seat shows no stale note: the leg's top is no longer
level, so it does not "stand under" the seat (spec §5's resting rule), and the Lean section's own `Level the ends again` note is
the cue. Once re-levelled the stale note appears and re-boring works. Recorded as follow-up 456; the spec's "a later lean edit …
the seat notes it" holds one step later.

**Not verified in the browser:** real hardware (fu 26a): software GL hides nothing new (no new shaders), but the by-eye check
stays owed; a printed Plans sheet with a tilted bore.
