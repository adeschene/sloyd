# Browser verification — profile runs, chunk b2 (stops on a turned path, two-side runs)

**Setup:**
- Date: 2026-10-19.
- Dev server on port 5180, branch `profile-runs-b2` at `5027ff9`.
- Browser: the Playwright MCP browser, under software GL. Plain clicks timed out under the GL load, so most steps were driven
  through `page.evaluate` / `run_code` with long timeouts.
- Readouts are DOM text unless an image is named.

**Test project:** "Stops on curves check", imported from `.playwright-mcp/stops-check.sloyd.json` (gitignored). The file was built
from the test-only `sweepFixtures.ts` and passed through `migrateDocument` before writing. It holds:
- **Front and ends:** `frontAndEnds()`, a two-side run.
- **Corner stop:** `stopOnCorner()`, a front stop from 1.1" (on the 2" corner arc) to 30".
- **Arched apron stop:** `stopOnArch`, a stop from 10" to 20" on the arched side.
- **Tight stop:** a 3/8" stop from 0.1" over 1/4" corners (Task 3's `tightStop`).
- **I2 pair:** a front stop from 1" to 30" beside an End to end on the length min end (Task 3's `i2Pair`).
- **Stop to through:** `stationFrontToBack()`.

The project was left in place, per the user's dev-profile ruling.

## Bench lines (the Profiles row)

| Part | Line |
|---|---|
| Front and ends | `Roundover 1/4" on the thickness face (max side), from the length min end at 4" round the width min side to the length max end at 4" (stopped)` (Q21). Its fields read `Start (from the width min end)` and `Stop (from the width min end)`. |
| Corner stop | `Roundover 1/4" on the edge between the width face (min side) and the thickness face (max side), along the length, from 1-1/8" to 30" (stopped)` |
| Arched apron stop | `… along the length, from 10" to 20" (stopped)` |
| Tight stop | `Roundover 3/8" … from 1/8" to 30" (stopped)`, with the row note `Runs straight: too tight to follow the curve.` |
| I2 pair | The stop reads `… from 1" to 30" (stopped)` with the note `Runs straight: it would overlap another profile if it followed the curve.` (by cause, Q10). The End to end reads `… along the width, round the corners`. |
| Stop to through | `Roundover 1/4" on the thickness face (max side), from the width min side at 20" round the length max end to the width max side at its length min end (stopped)` |

The row shows `Side`, `Stop side`, `Run` (`End to end`, `Stopped`, `All round`), `Start` and `Stop`. Stopped is offered on a turned run
(B7 lifted).

## Stop side (R5)

On Corner stop:
- **Stop side → Length max end:** the line reads `… from the width min side at 1-1/8" round the corner to the length max end at 3" (stopped)`.
  - Start keeps 1-1/8".
  - The moved end is seeded 3" in.
  - The route goes round the shared corner, with no alert.
- **One Undo** restores `… from 1-1/8" to 30" (stopped)`.

## Curves under a stop (Review Focus 3)

On Corner stop:
- **Its first corner's Radius → 1:** accepted. The corner reads `… to a 1" radius` and the profile's line is unchanged. Undone.
- **Refusal setup:** the profile was set to 3/8" with Start 0.1, giving `Roundover 3/8" … from 1/8" to 30" (stopped)`.
- **That corner → 0.2:** refused with `Too tight for the roundover — reduce the roundover first.`
  - The field keeps `0.2` and focus.
  - The stored corner stays `2"`.
- **Two Undos** restore the 1/4" stop from 1-1/8".

## Plans sheet and cut list

- **Plans key list:** `A Roundover 1/4", stopped (5×)`, `E Roundover 1/4", round the corners`, `F Roundover 3/8", stopped` (Q22). Image:
  `docs/img/profile-runs-b2-plans.png`.
- **Cut list notes:** each stopped profile's bench line appears in its part's notes, the two-side and stop-to-through lines included.

## Viewport

**Image:** `docs/img/profile-runs-b2-front-and-ends.png`, Front and ends alone, zoomed toward the length min end.
- At this zoom and under software GL, the profile and its stops show as a soft highlight along the top edge.
- The run-outs' look is for the user's eye on real hardware: smooth shading at a curved stop, and no step at the stop plane.

## b1 / a2 projects (unchanged)

- **"Swept profiles check":**
  - Loop top: `Roundover 1/4" all round the thickness face (max side)`.
  - Front top: `… along the length, round the corners`.
  - Cove top: `Cove 3/8" all round …`.
  - Tight top: `… — check: it is too tight for the curve`.
  - Arched apron: chunk 1's line.
- **"Edge profiles check":** the four roundovers, plus the ogee, bead and thumbnail lines with `top on the thickness face (max side)`, and `Roundover 3/8" … along the length`.
- **"Stopped profiles check":** `… from 3" to 27" (stopped)` for the roundover and the cove.

All lines are as recorded in the a2 and b1 passes.

## Console

- 0 errors.
- Warnings are only the known ones:
  - the THREE deprecations (`PCFSoftShadowMap`, `Clock`);
  - the software-GL driver performance message.
- The browser was closed before any suite run.

## Not exercised live (covered by unit tests)

- Two-side Face → Bottom swap, the Side select on a two-side run, R6/R7 (opposite-side Stop side), a through end moved by Stop side.
- The neighbour refusal (an edit that adds a fault to another profile).
- Crossed stations on a shared arc being `stop-off`.
- A mirrored copy of a two-side run (3600 mirror cases in tests).
- Watertight run-outs, section caps through a stop, the overlap intersection, and edge lines at stops (inv 16).
- The rebuild feel of a two-side cove during a resize drag: the guard is 69 ms, ~55 ms measured, over a frame.
