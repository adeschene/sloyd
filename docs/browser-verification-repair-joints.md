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

The refused-repair text, a storage failure, nested and turned fixtures (unit tests only).
