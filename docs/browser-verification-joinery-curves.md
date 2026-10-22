# Browser verification — joinery and Repair accept curves and profiles (chunk 2)

**Date:** 2026-10-22 · **Branch:** `joinery-curves` (head 60549a8) · **Dev server:** `:5199`, the user's profile
(Playwright, the user able to watch). Spec: `docs/superpowers/specs/2026-10-21-sloyd-joinery-features-design.md`; plan:
`docs/superpowers/plans/2026-10-22-sloyd-joinery-curves.md` (Task 8).

Fixtures were written by throwaway test code (not committed) and imported:
- **Curved shaker table:** the Shaker table fixture with an arch along the bottom edge of each apron, clear of both
  ends (`uFrom: 'min'`, start 3), and a 1/4" end-to-end roundover on each leg's outer arris. Leg FL also carries a 1/2"
  roundover on the arris next to Apron F's outer face. The aprons sit 1/4" in from the legs' outer faces, so a 1/4"
  roundover there rules nothing out; the 1/2" one reaches the dado's patch.
- **The same table, joined by test code:** `featureAllowed`, then `applyJoints` with `defaultChoice` at every narrowed
  site, written back as `runJoinery` does.
- **The fu 240 damaged fixture** (`1-frames-duplicates.json`) with an arch and a straight roundover on one twin part,
  away from its joints.

Test code's `featureAllowed` on the unjoined table rules out one site: "Apron F → Leg FL: dado and stopped dado ruled
out — Leg FL's roundover profile is in the way." `defaultChoice` then picks butt there (the default for a wide apron
is a dado, and it does not fall back to a tenon); a paid run chooses among the narrowed kinds.

Test projects were left in the dev profile, as ruled 2026-10-17. Every result below is a DOM or `localStorage` readout.

## Free checks

1. **The test-code-joined table imports and renders.** Screenshot: `docs/img/joinery-curves-joined-shaker.png` (the
   arched aprons and the legs, no console errors; only the usual Three.js deprecation and software-GL stall warnings).
   - Apron B (dadoed at both ends) grew 9/16" at each end: position x 1.1875, length 27.625. Its arch's `start` went
     from 3 to 3.5625, so the arch begins at world x **4.75**, unchanged (`rebaseCurves`).
   - Apron F (butt at Leg FL, where the dado was ruled out) keeps position x 1.75 and `start` 3: world x **4.75** too.
   - Leg FL keeps both its roundovers (2 profiles) beside its cut.
2. **Repair on a curved project.** On master the dialog withholds it.
   - The joinery dialog on the curved fu 240 fixture shows the damage notice and **Repair joints**.
   - Running it: "Saved as 'Live — curved repair fixture — repaired' — 2 stray cuts removed."
   - The repaired project's curves and profiles are byte-identical to the source's.
3. **Add joinery opens on a curved project.** On the unjoined curved table the dialog lists all 12 sites with
   `claude-opus-5-5` and an estimate of ≈ $0.02–$0.14, with no refusal. On master it refuses, "doesn't handle parts
   with curves". The dialog was closed without running.

## Paid check

Not run yet: it needs the user's approval at the time.

## Not checked live

The wording of the summary line and of the dialog's failure refusal is for the user's eye. How curves and profiles look
beside joints on real hardware is for the user's eye too (fu 26a).
