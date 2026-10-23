# Browser verification — Refine carries features

**Date:** 2026-10-22 · **Master** at 98f8296 (merge of `refine-features`) · **Dev server:** `:5199`, the user's profile
(Playwright, the user able to watch). Spec: `docs/superpowers/specs/2026-10-22-sloyd-refine-features-design.md` (§1, §4,
§5, §8, Amended).

Fixtures were written by throwaway test code (not committed), passed through `migrateDocument` with every feature checked
to survive the load and to have no fault (`holeFaults`, `curveFaults`, `profileFaults`, `bandFaults`), and imported
through the app's Import:
- **Live — refine cabinet** (loose parts, `checkDesign` empty):
  - Left and Right side: 30 × 12 × 3/4", upright, turned 90. Each has two shelf-pin rows on its inner face: 8 holes,
    1/4" dia × 3/8" deep, the first 8" from the bottom (`alongFrom: 'min'`), every 1-1/4", 1-1/2" in from front and back.
  - Bottom: 22-1/2 × 11-1/4 × 3/4.
  - Top: 24 × 12-1/2 × 3/4. A 1/4" roundover runs the length of its front top edge (width max, face max), and a custom
    solid band type, "Maple edging", is on the same front side.
  - Apron: 22-1/2 × 3-1/2 × 3/4, on edge. An arch is cut in its bottom edge (3" from the min end, span 16-1/2", rise
    1-1/2").
  - Door: 26-1/2 × 22-1/2 × 3/4, with hardware type "Hinge" (pack of 2), count 2.
- **Live — refine cabinet — joined:** the same cabinet joined by test code (`findSites` → `featureAllowed` →
  `defaultChoice` → `applyJoints`). That gave 8 dados (the sides, door and apron into the top/bottom/apron), with the
  Door → Apron mortise-tenon ruled out by the arch. `refineRefusal` returns null.

Test projects were left in the dev profile, as ruled 2026-10-17. The API key was checked for presence only. Every result
below is a DOM or `localStorage` readout. Screenshots timed out (llvmpipe, the known MCP quirk), so none are kept.

## Free check

1. **Refine opens on a featured project. PASS.** On **Live — refine cabinet**, Claude ▾ → Refine… shows the instruction
   form with "Model: claude-opus-5-5" and "≈ $0.05–$0.26", and no refusal. Before this round it refused with "doesn't
   handle parts with holes yet". The joined variant also opens with no refusal: "≈ $0.05–$0.36, plus a joinery call if
   new meetings appear".

## Paid checks (pre-approved up to 10, the user's ruling 2026-10-22; 3 used)

2. **"make it 6 inches taller" on Live — refine cabinet. PASS.** Cost **≈ $0.04**.
   - Done view: "Saved as 'Live — refine cabinet — refined'", "0 new issues · 0 already present".
   - Check at the new size:
     - "Left side was resized — its holes stay measured from where they were placed; check them."
     - The same line for Right side.
   - Not kept: no list shown (empty).
   - Changes: Left and Right side 30" → 36"; "Top moved Y +6""; Door 26-1/2" → 32-1/2".
   - The Door was resized but is not on the check list. That is by design: `carriedSummary` lists only parts with
     frame features (`hasFrameFeatures`), and hardware has no frame (spec §3.2).
   - The refined document in `localStorage`, part by part against the original:
     - `holes`, `curves`, `profiles`, `bands`, `cornerRule` and `hardware` are JSON-identical on all six parts. The
       sides' rows are still `alongFrom: 'min'`, station 8 (measured from the bottom).
     - Posture and rotation are unchanged on every part (sides upright/90, Top flat/0, Apron on-edge/0, Door
       upright/0).
     - `bandTypes` (including Maple edging) and `hardwareTypes` (Hinge) are identical. There are no shapes, no
       definitions, and the schema is 20.
   - The cut list of the result shows each side 36" × 12" with both rows: "first 8" from the min end, every 1-1/4", last
     at 16-3/4"" on the max-side face (Left) and the min-side face (Right). The Top shows "Roundover 1/4" on the edge
     between the width face (max side) and the thickness face (max side)" and "Band: the width max side — Maple edging",
     with the edging strip row 24-1/2" × 1/4".
   - No `feature-turned` issue arose.
3. **"add a second shelf" on the result. PASS.** Cost **≈ $0.02**.
   - Done view: "Saved as 'Live — refine cabinet — refined 2'", "0 new issues · 0 already present", and "Added Shelf 2
     (22-1/2" × 11-1/4" × 3/4")". No check list, which is correct because nothing was resized. Not kept is empty.
   - The document against the run-2 result: every carried field on all six parts is identical. Posture, rotation, sizes
     and positions are unchanged, and the band and hardware types are identical.
   - The new Shelf 2 (flat/0, at Y 19-3/4) carries nothing.
4. **Joined variant, "make it 2 inches wider". PASS.** Cost **≈ $0.02**, with no joinery call because no new meetings
   appeared.
   - Done view: "Saved as 'Live — refine cabinet — joined — refined'", "0 new issues · 0 already present", "8 joints
     kept · 0 chosen · 0 dropped".
   - The joinery note "Door → Apron: mortise and tenon ruled out — Apron's curve is in the way." is shown under the
     joints line (Amended, `JointsSummary.notes`).
   - Check at the new size:
     - "Top was resized — its edge profile and edging stay measured from where they were placed; check them."
     - "Apron was resized — its curve stays measured from where it was placed; check it."
   - The sides only moved and are correctly not listed. The Door (hardware only) is not listed either.
   - Changes: Right side moved X +2"; Bottom, Top and Apron +2"; Door 22-1/2" → 24-1/2" wide.
   - The document against the joined original: carried fields are identical on all six parts. That includes the
     Apron's arch at the joined frame's `start [3.25, 0]` (the plain 3" plus the 1/4" joinery grew at that end), and
     the Top's roundover and band. Posture and rotation are unchanged. Every part's cuts are identical except the Top's
     right-side dado, which moved from offset 23.25 to 25.25 with the Right side. Its front stop (0.5) is still clear of
     the edging. The band and hardware types are identical.

**Paid runs: 3 (of 4 allowed, 10 approved), total ≈ $0.08.**

## Owed to the user (real hardware, by eye)

- The refined cabinets in the viewport: shelf-pin holes on the inner faces of the 36" sides, the roundover and maple
  edging on the Top's front edge, and the arch on the widened apron. They are no longer centred, as spec §4 rules and as
  the check list says.
- Whether the check-list wording reads well to a woodworker ("…stay measured from where they were placed; check
  them."). Also whether a hardware-only part that was resized (the Door) should also be named. Today it is not, by
  design.
