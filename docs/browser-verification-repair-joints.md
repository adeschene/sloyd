# Browser verification — repair doubled joints (2026-10-09)

Dev server (`npm run dev -- --port 5199`) on branch `repair-joints` at `6759abf`, Playwright MCP,
software GL. No paid runs (the repair makes no model call).

## 1. A damaged project

`src/generate/joints/fixtures/2-frames-phantom.json`'s `damaged` document (made by the pre-`a899b51`
joinery: one shared Frame definition whose Leg stores 3 cuts — the rail mortise twice and the
stretcher's mortise, a phantom in the Back copy) imported through the project menu as
"Frames (fu240 check)". Import made it active.

## 2. Refine shows the note, not the gate's message

Refine opened with the note `This project's joints were doubled by a bug fixed on 2026-10-09: …`
and `Repair joints`; the gate's "edited by hand" refusal did not show; Refine disabled.

## 3. Repair joints

The dialog showed `Saved as 'Frames (fu240 check) — repaired' — 3 stray cuts removed.` and
`Front and Back no longer match, so they are no longer shared.`, with `Open Frames (fu240 check) — repaired`.
The original stayed active (invariant 36).

Stored:
- Original: 1 definition, both placements on it, Leg 3 cuts — untouched.
- Repaired: 2 definitions (Front, Back), Front Leg 2 cuts (rail + stretcher), Back Leg 1 cut (rail);
  Rails 4 cuts each; Stretcher 4 — the phantom and both duplicates gone.

## 4. The repaired project is clean

Opened through Open (it became active). Refine: the normal form, estimate and the joinery note — the
gate passes. Add joinery: no repair note.

## 5. Joinery on the damaged original

Add joinery on the original showed the note, `Running joinery again on this project would add to the
damage — repair it first.` and `Repair joints` (the site list read "No joints to add": a fully joined
design has no sites left).

## Console / cleanup

0 errors; warnings only Three.js deprecations and llvmpipe GPU-stall messages (pre-existing). Both
projects this check created were deleted through the project menu; the previously active project was
re-opened; the profile's 16 older projects and its key are untouched (read back).

## Not confirmed live

The refused-repair text, a storage failure, nested and turned fixtures (unit tests only). All four were
driven on 2026-10-10 (below).

## Follow-up 244's live pass (2026-10-10)

Dev server (`--port 5199`) on branch `record-only-243-244` at `124a259`, Playwright MCP, software GL.
No paid runs. Three files imported through the project menu, made from the fixtures by a throwaway
script: fixture 3's `damaged` (turned), fixture 6's (nested), and fixture 2's with a hand-added cut on
`Front › Rail` written into its tree (the unit test `repairDocument passes a refusal through`).

- **Refused repair.** Refine opened on the hand-cut project with `Sloyd can't repair this project's
  joints automatically — re-run Add joinery from the unjoined original.`, no Repair button, Refine
  disabled. Add joinery showed the same text (and "No joints to add"), Add joinery disabled.
- **Turned fixture.** Repair joints: `Saved as 'Turned (fu244 check) — repaired' — 2 stray cuts
  removed.`, no "no longer shared" line (duplicates only). The repaired project's Refine gave only
  its structural refusal (`Refine cannot keep a turned assembly…`): the joint gate passed.
- **Nested fixture.** `… — 12 stray cuts removed.`, no split line; the repaired project's Refine gave
  only `Refine cannot keep an assembly inside another assembly…`.
- **Storage failure.** On the nested original, `Storage.prototype.setItem` was made to throw for
  `sloyd.project.*` keys in that page only, then Repair joints: `Could not save the project — storage
  is unavailable.`, Repair joints still enabled (a retry), no project written (21 before and after).
  `setItem` restored.

Console: 0 errors; warnings only the two Three.js deprecations. Cleanup: the original active project
re-opened, the five projects this pass created deleted one at a time through the menu; 16 projects,
the same active id, the key present, no orphaned project keys (read back).

## After the final review

The storage rule (a stray's twin must be the same stored part, `04a795d`) landed after this check.
Fixture 2's phantom is in the same stored part as its twin, and its unit tests (same 3 cuts, same
split) pass unchanged, so the check was not repeated.
