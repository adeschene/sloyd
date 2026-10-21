# Browser verification — joinery and Repair accept holes (chunk 1)

**Date:** 2026-10-21 · **Branch:** `joinery-holes` (head 532748c) · **Dev server:** `:5199`, the user's profile (Playwright,
the user able to watch). Spec: `docs/superpowers/specs/2026-10-21-sloyd-joinery-features-design.md`; plan:
`docs/superpowers/plans/2026-10-21-sloyd-joinery-holes.md` (Task 8).

Fixtures were written by throwaway test code (not committed) and imported:
- **Holed shaker table:** the Shaker table fixture with Leg FL made a plain part (its role cleared — a hole set on one user
  of a shared shape is not stored, by inv 45). It has two hole rows:
  - **Leg FL:** a 1/4" hole, 3/8" deep from its outside (−x) face, at Apron F's mid height and the tenon's z. That is inside
    the mortise zone and clear of the dado zone.
  - **Apron F:** three 1/4" holes, 1/4" deep in its front face, 2" apart, the first at world x 5.
- **The same table, joined by test code**, through `featureAllowed` and defaults.
- **The fu 240 damaged fixture** (`1-frames-duplicates.json`) with one hole row on its first part (as `repair.test.ts`).

Test projects were left in the dev profile, as ruled 2026-10-17. Every result below is a DOM or `localStorage` readout.

## Free checks

1. **The test-code-joined table imports and renders.** A screenshot was taken in the SDD workspace (not committed); a
   second one timed out, the known llvmpipe limit.
   - The defaults chose dados at every apron, so the dado grew Apron F by 9/16" at each end: position x 1.1875, length
     27.625.
   - Its hole row's station went from 3.25 to 3.8125, so its first hole sits at world x **5.0**, unchanged (`rebaseHoles`).
   - Leg FL's hole row is unchanged. Its dado runs 9/16" in from the inner face, clear of the 3/8"-deep hole on the outer
     face.
2. **Repair on a holed project.** On master the dialog withholds it.
   - The joinery dialog on the holed fu 240 fixture now shows the damage notice and **Repair joints**.
   - Running it: "Saved as 'Live — holed repair fixture — repaired' — 2 stray cuts removed."
   - The repaired project's hole rows are byte-identical to the source's.
3. **Trials only while the dialog is open.** This is the App memo gate. It is pinned by `App.test.tsx` (the refused-project
   skip and the throw → refusal tests) rather than by a console count. The memo's only path to `featureAllowed` is
   `dialog === 'joinery'`.

## Paid check (approved by the user at the time)

On the unjoined holed table, **Add joinery** opened with no refusal. On master it refuses, "doesn't handle parts with
holes".
- **Before the run:** 12 sites listed; claude-opus-5-5; estimate ≈ $0.02–$0.14.
- **Run:** "Done ≈ $0.03 — Saved as 'Live — holed shaker table — joined' — 8 joints: 7 mortise and tenon, 1 dado".
- **Summary line:** "Apron F → Leg FL: mortise and tenon ruled out — Leg FL's holes are in the way."
- **The one dado is that site.** Its tenon was ruled out before the call, so the model was never offered it there.
- **Saved result:** Apron F's first hole is at world x **5.0** (position 1.375 + station 3.625). Leg FL's hole row is intact.
  Leg FL's dado (3/8" deep from the inner face) and Apron L's mortise both stay clear of it.

## Not checked live

The wording of the summary line is for the user's eye (as fu 410–412). How holes look beside joints on real hardware is
for the user's eye too (fu 26a).
