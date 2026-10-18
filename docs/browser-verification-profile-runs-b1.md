# Browser verification — profile runs, chunk b1 (swept profiles: round corners, along an arch, all round)

**Setup:**
- Date: 2026-10-18.
- Dev server on port 5180, branch `profile-runs-b1` at `fafc8b6`.
- Browser: the Playwright MCP browser, under software GL.
- Readouts are DOM text unless an image is named.

**Test project:** "Swept profiles check", imported from `.playwright-mcp/swept-check.sloyd.json` (gitignored). The file was built
from the test-only `sweepFixtures.ts` and passed through `migrateDocument` before writing. It holds:
- **Arched apron:** a 30 × 5 apron with an arch and a Roundover End to end along the arch.
- **Loop top:** a 36 × 20 top with 2" corners and a Roundover All round.
- **Front top:** 2" corners and a Roundover End to end on the front.
- **Cove top:** 2" corners and a 3/8" Cove All round.
- **Tight top:** 0.2" corners and a 1/4" Roundover All round, which faults.
- **Plain corner top:** 2" corners, no profile.

The project was left in place, per the user's dev-profile ruling.

## Bench lines (the Profiles row)

| Part | Line |
|---|---|
| Arched apron | `Roundover 1/4" on the edge between the width face (min side) and the thickness face (max side), along the length`. This is chunk 1's line, unchanged. |
| Loop top | `Roundover 1/4" all round the thickness face (max side)` |
| Front top | `Roundover 1/4" on the edge between the width face (min side) and the thickness face (max side), along the length, round the corners` |
| Cove top | `Cove 3/8" all round the thickness face (max side)` |
| Tight top | `Roundover 1/4" all round the thickness face (max side) — check: it is too tight for the curve`, with the row note `Too tight for the curve at this size.` and the menu `No profile preset fits this part.` |

On a loop row the Side control is hidden. On an End to end row it is shown.

## The Run select (Front top, judged on focus)

- The options are `End to end`, `Stopped — a stop on a curved or cornered run comes later` (disabled; B7) and `All round`.
- Choosing **All round** gives `Roundover 1/4" all round the thickness face (max side)` and hides Side.
- **One Undo** restores the End to end line, with `, round the corners`.

## Curves refuses an edit that adds a profile fault (Loop top)

- **First corner's Radius → 0.2:** refused with `Too tight for the roundover — reduce the roundover first.` The typed text stays in
  the field, and the stored corner is unchanged.
- **Radius → 3:** accepted. The curve's line reads `Round the corner of the length min end and the width min side to a 3" radius`,
  and the profile re-routes. Its line, `Roundover 1/4" all round the thickness face (max side)`, is unchanged.

## Viewport

**Image:** `docs/img/profile-runs-b1-cove-corner.png`, the Cove top alone in Iso.
- The cove runs continuously round all four 2" corners and the long sides, with no visible seam or step at the tangent points.
- Under software GL and at this scale, the shading is for the user's eye on real hardware.

**Image:** `docs/img/profile-runs-b1-mirrored-apron.png`.
- The apron was grouped, then **Copy mirrored** (`Assembly 1 (1)`, ⇋).
- The mirrored copy's profile follows the mirrored arch.
- The arch's silhouette shows its model chords at this zoom, as chunk 1's arch does.

## Plans sheet (`docs/img/profile-runs-b1-plans.png`)

**The key list:**
- `C Roundover 1/4", all round`
- `E Roundover 1/4", round the corners`
- `G Cove 3/8", all round`
- `A Roundover 1/4"` (the apron)

**Corner keys:**
- `D Rounded corner, 3" radius`
- `F Four rounded corners, 2" radius (3×)`
- `H Four rounded corners, 3/16" radius`
- `I Rounded corner, 2" radius (3×)`

**The faulted loop:** the Tight top is listed as `Not shown in these views: Roundover 1/4", all round — check the cut list.` The
loop builds nothing, so nothing is tagged, which is the existing rule.

## Cut list

- Each swept profile's bench line appears in its part's notes.
- The Tight top's line carries `— check: it is too tight for the curve`.

## a1 / a2 projects (unchanged)

**"Stopped profiles check":**
- `Roundover 1/4" … along the length, from 3" to 27" (stopped)`
- `Cove 3/8" … along the length, from 3" to 27" (stopped)`

**"Edge profiles check":**
- `Roundover 1/4" on all four edges of the thickness face (max side)`
- the ogee, bead and thumbnail lines with `top on the thickness face (max side)`
- `Roundover 3/8" … along the length`

All lines are as recorded in the a1 and a2 passes.

## Console

- 0 errors.
- Warnings are only the known ones:
  - THREE deprecations (`PCFSoftShadowMap`, `Clock`);
  - the software-GL `ReadPixels` stall.
- The browser was closed before any suite run.

## Not exercised live (covered by unit tests)

- The final-review fallback: a saved End to end too tight to follow its corner runs straight, with the row note
  `Runs straight: too tight to follow the curve.` It is pinned against a2's output in hash tests.
- A stopped a2 run inside a corner arc, beside a swept neighbour.
- The rebuild feel of a cove or bead loop during a resize drag. The guards are wall-clock: cove 81, bead 73, ogee 113 ms.
