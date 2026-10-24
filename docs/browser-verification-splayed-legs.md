# Browser verification — splayed legs, chunk 1 (a part that leans)

2026-10-24, dev server (`npm run dev -- --port 5180`) on branch `splayed-legs` at `b3fa5f0`, driven through the Playwright
browser (software GL). DOM readouts first; numbers read off the live store via Vite's module graph
(`import('/src/store/store.ts')` in the page — the same module instance the app uses). No paid call was made. Test projects
"Splayed leg check" and "Stool check (splayed legs)" are left in the dev profile (the user's 2026-10-17 ruling).

| # | Check | Result |
|---|---|---|
| 1 | New part, 1-1/2 × 1-1/2 × 16, Upright: the **Lean** section appears (Rake / Rake direction / Splay / Splay direction) | PASS |
| 2 | Rake 8 toward the front, splay 12 toward the right: fields read `8.0°` front / `12.0°` right; readout `Resultant 14.3° · sightline 33.5° from the front edge`; position note shown | PASS (verbatim) |
| 3 | Stored slopes `x = 0.2125565617` (tan 12°), `z = 0.1405408347` (tan 8°), face `thickness` | PASS |
| 4 | Level the ends: length 16 → 17 (grid blank); two Miter rows `Miter 14.3° across the thickness at the length min/max end …`; real bounds min y = 0, max y = 16 (top level at the old joint height); `isLevelled` true | PASS |
| 5 | Level the ends again: nothing changes (length stays 17) | PASS |
| 6 | Length 17 → 18: `leanMap.pivot` identical before and after (resize keeps the pivot); stale note `Ends were levelled for a different lean — Level the ends again` shown; Undo restores 17 | PASS |
| 7 | Posture → Flat on the leaning part: refused, `Clear the lean first — only an upright part can lean.`, posture stays Upright | PASS (verbatim) |
| 8 | Holes → One bore on the leaning part: `A leaning part can't take holes yet — that comes with angled holes.`; no hole row stored | PASS (verbatim) |
| 9 | Import a four-leg stool (spec §3.4 idiom: mirror + 180° turns, levelled, linked by role into two Shapes) at schema 22: real bounds symmetric (legs ±3.9407…±9.4602 in X, ±3.9475…±8.3011 in Z, y 0–16; seat y 16–17.5) | PASS |
| 10 | `checkDesign` on the stool: no violations (legs grounded on their level feet, seat resting on the level tops) | PASS |
| 11 | Plans sheet: overall `18-15/16"` × `16-5/8"` × `17-1/2"` (real extents, not pre-lean boxes); four notes, one per leg, e.g. `Front right: rake 8.0° toward the front, splay 12.0° toward the right — resultant 14.3° on a 33.5° sightline`, back legs `toward the back`, left legs `toward the left`; plan view shows the legs turned to their sightlines | PASS (verbatim) — `docs/img/splayed-legs-plans.png` |
| 12 | Section Front at z = 6: the front legs' caps come back in leaned world coordinates (a 5-gon in the plane z = 6 from y ≈ 1.40 to y = 16) and draw on the cut | PASS — `docs/img/splayed-legs-section.png` |
| 13 | Exploded (offsets at 100%): every leg's real min y + offset = 0; no leg below the floor | PASS |
| 14 | Claude → Add joinery…: `Add joinery can't join a leaning part yet: Front right.` shown at once; no request to api.anthropic.com | PASS (verbatim) |
| 15 | Console: 0 errors throughout (warnings are three.js's existing `PCFSoftShadowMap` deprecation) | PASS |

The stool as drawn: `docs/img/splayed-legs-stool.png`.

## The three owed checks (2026-10-24, on master at `bfa1c96`, same dev server and project)

| # | Check | Result |
|---|---|---|
| 16 | Gizmo drag of a levelled leg (Front right, pre-lean corner off-grid at `4.198506…, −0.757741…, 4.215953…`): a free drag on the X arrow moved x by exactly 3.625 (58 grid steps), y and z, the lean and the length bit-identical; one Undo restores the exact corner. A 2 px drag moves x by exactly 1/16 — the delta rounds, the off-grid corner is kept, and the leg does not jump on the first frame | PASS |
| 17 | Section Front at z = 6, then Rake 8 → 4 typed on Front right: the drawn cap follows the new lean (computed cap y −0.137…15.078, x 5.692…9.276, against 1.396…16 and 5.153…7.872 at 8°); the screenshot shows the cap on the new leg, reaching below the floor where the unlevelled foot now sits; nothing left from the old cap | PASS — `docs/img/splayed-legs-section-lean-edit.png` |
| 18 | Tape, pointer hover on Front right's foot (Iso): snaps to `corner` points on the leaned foot, `(8.632859, 0, 8.301137)` and `(9.460162, 0, 7.049909)` — y exactly 0, matching the leg's real bounds; anchored on one and hovering the other reads `1-1/2"` (the foot edge) | PASS — `docs/img/splayed-legs-tape-foot.png` |

Every edit undone afterwards (no undo entries left); console 0 errors (warnings: the `PCFSoftShadowMap` deprecation only).

**Not verified in the browser:** real hardware (fu 26a): software GL hides nothing new here (no new shaders), but the by-eye
check stays owed.
