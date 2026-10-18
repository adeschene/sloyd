# Browser verification — profile runs, chunk a2 (stopped profiles, the router run-out)

Date: 2026-10-18. Dev server on port 5180 (branch `profile-runs-a2`), the Playwright MCP browser, software GL. The project
"Stopped profiles check" (imported from `.playwright-mcp/stopped-check.sloyd.json`, gitignored) holds one part, **Stopped shelf**,
30 × 10 × 3/4. It was left in place, per the user's dev-profile ruling. Readouts are DOM text, not screenshots.

## First pass (branch head `38cec08`, before the final fixes)

- **Run → Stopped** on a top Roundover seeds 3" to 27". The bench line reads
  `Roundover 1/4" on the edge between the width face (min side) and the thickness face (max side), along the length, from 3" to 27" (stopped)`.
- **The row** shows Face, Side, Run (End to end / Stopped), `Start (from the length min end)` and `Stop (from the length min end)`.
- **A bottom-face stopped Cove** reads `…between the width face (max side) and the thickness face (min side)…, from 3" to 27" (stopped)`.
- **Plans sheet:** the key list reads `A Roundover 1/4", stopped` and `B Cove 3/8", stopped`.
- **Cut list:** the bench lines appear as notes in the two side views. The ends the profiles stop short of are not hatched, and one
  sharp-vertex line is drawn.
- **Resize to 20":** the row notes `A stop runs off the part at this size.` and the bench line gains `— check:`. Setting Stop to 15"
  edits it back.
- **Metric:** Start and Stop read 76 mm and 381 mm, and the bench line reads in mm.
- **Undo ×4** restores the shelf.
- **Console:** only the known warnings (THREE deprecations, the software-GL stall).
- **Screenshot:** `docs/img/profile-runs-a2-iso.png` (Iso). At this scale and under software GL the run-outs are too small to
  judge. **Their shading is for the user's eye on real hardware.**
- **Finding (Important, fixed in the final pass):** every preset targeted the top long edge. Once that edge held a profile, the
  overlap withhold removed every preset ("No profile preset fits this part."), so no second profile could be added. Spec I1 now has
  presets take the first edge where their default fits.

## Supplemental pass (head `2027245`, after the final fixes)

- **The menu details name the edge**, for example `Roundover 1/4" radius, Top · Width max side`.
- **I1:** a Bead was added on the top's width-max side. The next menu then skipped the top's width-min side, where the stopped
  roundover overlaps a full-length default, and named `Top · Length max end` for all five presets.
- **I2:** the Bead was set to Run → Stopped (3..27), then Start was set to `0`. The bench line reads
  `Bead 1/4" with a 1/16" quirk …, top on the thickness face (max side), from the length min end to 27" (stopped)`. This is a
  half-stopped bead, made from the row. Start shows `0"`, Stop `27"`.
- **F3:** typing Start 28 with Stop at 27 is refused as `Start must be before the Stop`. The typed text stays.
- **Undo ×3** returns the shelf to its two profiles.
- **The a1 project "Edge profiles check" is unchanged:**
  - Top: 4 roundovers.
  - Shelf: ogee, bead and thumbnail.
  - Old rail: one 3/8" roundover.
  - Every bench line is a1's, and none reads stopped.
- **Console:** 0 errors.
- **Host load:** the Playwright browser's GPU process ran at about 250% CPU during the first pass and the final fix pass. Closing
  it brought the full suite back to green (5279/5279). Close the browser before a perf-sensitive suite run.
