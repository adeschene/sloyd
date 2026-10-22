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

## Paid check (approved by the user, "All paid runs are approved", 2026-10-22; run on `ac799bb`)

Add joinery on the plain **Live — edged bookcase** (`claude-opus-5-5`, estimate ≈ $0.01–$0.05, spent ≈ $0.01):
- "Saved as 'Live — edged bookcase — joined' — 4 joints: 2 stopped dados, 2 rabbets"; "Overall depth now 11-1/4" (was 11-1/2")";
  "Moved relative to the rest: Back. Trimmed: Shelf, Back."
- Summary lines: "Shelf → Left: mortise and tenon and dado ruled out — Left's edge band is in the way." and the same for Right.
- Cut list of the result: each side's 3/4" stopped dado, 1/4" deep, is "stopped 3/4" short of the max end" (clear of the 3/4" face
  edging; the front stop end only, "Offer clear ends"); the back's 3/8" rabbets sit at the sides' back edges, clear of the edging; the
  shelf (11" deep after the trim) carries its two 3/4" notches; the edging strips are unchanged (2 × 30-1/2" × 3/4").

## fu 419 (2026-10-22, `ac799bb`, dev server)

The F1 probe under Mitred (a 10 × 12 panel, 3/4" maple edging on width min and both ends, a hand cut along width min to 9.6) imported
and its cut list read: **Panel edging (width min side) 1 × 7/8" × 3/4", "Trim flush"** — a square 0.40 leftover plus allowance, never
the mitred piece the cut list printed before; the length-max end's strip 11-3/4" (gives way to the leftover: 11-1/4" + 1/2") and the
length-min end's 11-1/2" (shortened by the cut to 11"), both square.
