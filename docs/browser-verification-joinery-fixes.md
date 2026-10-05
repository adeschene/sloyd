# Browser verification: joinery fixes (follow-ups 183, 184, 185, 190)

2026-10-05. A bounded round with the design ruled in chat (183: carry the outer-face chain; 190:
defaults only). The rules are in each follow-up's closure in `docs/follow-ups.md`.

## How this was driven

Claude drove the dev server on branch `joinery-fixes` (`npm run dev -- --port 5199`, Chromium)
with the Playwright MCP, and **the user watched the same browser**. The user typed their own API key
into Settings; it never passed through chat or a file. Each paid run was approved by the user. The
model was `claude-opus-5-5`.

The fixtures were built with `designToDocument` and checked with `checkDesign` (nothing reported)
before import. They went in through the project menu's Import.

**Two harness notes for the next pass.** The first is that `browser_file_upload` accepts only paths
under the repo or `.playwright-mcp/`, not the session scratchpad. The second is that on this host
(software GL), Playwright's click on a toolbar button and every screenshot timed out at 5s. Clicks
dispatched through `browser_evaluate` worked. So this pass has **no screenshots**. The record is
the dialog text and the coordinates read back from `localStorage`.

## Run 1: a cabinet with a hanging cleat (follow-up 183), ≈ $0.02

The fixture had two sides, a top and a bottom between them, a 1/4″ plywood back behind everything,
and a 22-1/2 × 3 × 3/4 cleat on the back's outer face. That made 8 sites.

- The model chose 4 rabbets (the back into the sides, top and bottom) and 4 stopped dados.
- The dialog read: `Moved relative to the rest: Back, Hanging cleat. Trimmed: Back.` It reported no
  new problems.
- Read back from the saved project:
  - the back spans z −5.125 to −4.875, flush with the sides' back edges (z −5.125);
  - the cleat spans z −5.875 to −5.125, so its face lies exactly on the back's outer face.
- On master the cleat stayed put and ended 1/4″ off (`unsupported`).

## Run 2: a three-layer lap stack (follow-up 185), ≈ $0.01

The fixture had a lower rail (along X, on the floor), a cross rail (along Z, on it) and an upper
rail (along X, on the cross rail). It gave two crossing sites.

- The model chose 2 half-laps. Both were applied and none was skipped.
- The dialog read: `Moved relative to the rest: Cross rail, Upper rail.` and `Overall height now 3/4"
  (was 2-1/4")`.
- Read back from the saved project:
  - all three rails sit at y 0, 3/4″ thick;
  - the lower rail's top notch (x −1 to 2) matches the cross rail's span;
  - the cross rail carries a bottom notch at z 4 to 7 (the lower rail) and a top notch at z 11 to 14
    (the upper rail);
  - the upper rail's bottom notch is at x −1 to 2.

  Every notch is filled.
- On master this listing order skipped the upper rail's site and left it floating.

## Run 3: a drawer box on a rabbeted bottom (follow-up 184), ≈ $0.02

The fixture had a front, a back and two sides on edge, standing on a 1/4″ plywood bottom. It gave
4 rabbet sites and 4 end-into-face sites.

**Why it was added.** Claude had predicted that run 1 would show the lowered line. It could not:
the cabinet's back moves horizontally, so nothing lifts.

- The model chose 4 rabbets and 4 stopped dados.
- The dialog read: `Moved relative to the rest: Bottom. Trimmed: Bottom.` followed by `The whole
  piece was lowered 1/4" to sit on the floor again.` and `Overall height now 4" (was 4-1/4")`.
- Every part's y reads back as 0.

## Common to all three

- Each result was saved as a new project and was **not** opened by the run. It was opened afterwards
  through the dialog's Open button (invariant 36).
- The console showed 0 errors. The only warnings were pre-existing ones from three.js
  (`PCFSoftShadowMap` deprecated, a GL `ReadPixels` stall).

## Not exercised live

Follow-up 190 is reachable only through the fallback defaults, which run when the model call fails.
It is unit-verified only.
