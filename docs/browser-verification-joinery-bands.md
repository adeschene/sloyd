# Browser verification — joinery and Repair accept bands (chunk 3)

**Date:** 2026-10-22 · **Branch:** `joinery-bands` (head b34e8f1) · **Dev server:** `:5199`, the user's profile
(Playwright, the user able to watch). Spec: `docs/superpowers/specs/2026-10-21-sloyd-joinery-features-design.md`; plan:
`docs/superpowers/plans/2026-10-22-sloyd-joinery-bands.md` (Task 5).

Fixtures were written by throwaway test code (not committed) and imported:
- **Banded rail, joined by test code:** a rail between two legs. The rail has 1/4" solid maple edging on its bottom edge
  and iron-on tape on its top edge, and is tenoned into both legs by `featureAllowed` then `applyJoints`
  (mortise-tenon, 1/2" tenons), written back as `runJoinery` does.
- **Edged bookcase:** two sides with 3/4" solid maple edging on their fronts, a shelf with tape on its front, and a back.
  Imported once plain, and once joined by test code with a stopped dado at each side's front.
- **The fu 240 damaged fixture** (`1-frames-duplicates.json`) with a tape band on one twin part.

Test projects were left in the dev profile, as ruled 2026-10-17. Every result below is a DOM or `localStorage`
readout, except item 1's viewport look. Screenshots are kept in the gitignored SDD workspace only.

## Free checks

1. **Banded rail, joined.** The viewport renders the rail with tenons; exploded and seen from the front, the bottom
   edging's paint runs shoulder to shoulder and not onto the tenons. This was judged on software GL; the user's eye on
   real hardware is owed (Review Focus 5).
   - Cut list: the strip row is **1 × 18-1/2" × 1/4", "Rail edging (width min side)"**, which is the 18" visible run
     plus 1/2" allowance. The rail itself is 19" long with its tenons.
   - Buying, tape: **"Iron-on veneer, 7/8" wide: buy 2′"**. That is 18" + 1/2". Before this branch the tape counted
     19" + 1/2", which still rounds to 2′, so Buying alone doesn't show the change; the strip row does.
2. **Add joinery opens on a banded project.** On the plain edged bookcase, the dialog lists all 4 sites with
   `claude-opus-5-5` and an estimate of ≈ $0.01–$0.05, with no refusal. On master it refuses ("doesn't handle banded
   parts"). The dialog was closed without running.
3. **Repair on a banded project.** On master the dialog withholds it.
   - The dialog on the banded fu 240 fixture shows the damage notice and **Repair joints**.
   - Running it gives "Saved as 'Live — banded repair fixture — repaired' — 2 stray cuts removed."
   - The repaired project's bands and corner rules are identical to the source's (`localStorage`, all parts and
     definitions).
4. **Edged bookcase, joined at the front stop (the user's two rulings).** Cut list:
   - Each side: "3/4" stopped dado, 1/8" deep … **stopped 3/4" short of the max end**". The groove stops exactly at the
     inner face of the 3/4" edging.
   - The shelf: two 3/4" notches, one at each front corner. Tape: "buy 2′" (20-1/4" less the two 1/8"-deep notches at
     the front = 20" visible, + 1/2").
   - Edging strips: 2 × 30-1/2" × 3/4" (30" + allowance; no cut reaches a run end).

## Paid check

Not run. One real Add joinery run on a banded project needs the user's approval at the time (spec §7).
