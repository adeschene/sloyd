# Browser verification: the default-tie note and growth by shape

Follow-ups 198 and 199, 2026-10-05. This was a bounded round: the design was approved in chat, and the
rules are in the two follow-ups' closures in `docs/follow-ups.md`.

**What the round changed:**
- **198:** Properties shows no **Match the cut list** note when a cut's direction comes only from
  the square tie's length-first default (`CutShape.runByDefault`).
- **199:** when Add joinery grows a part, `rebaseCuts` re-stores the part's existing cuts by their
  shape first, judged on the part before it grows. A cut that runs along the growth keeps running
  out; one positioned at the moving end stays put. This holds whichever way either was stored.

## How this was driven

Claude drove the dev server (`npm run dev -- --host 127.0.0.1 --port 5180`, Chromium) with the
Playwright MCP, and **the user watched the same browser**. No paid calls were made.

A throwaway script wrote two `.sloyd` files, and both the script and the files were deleted
afterward:
- **Square 198:**
  - a 28 × 1-3/4 × 1-3/4 leg with a 3/4″ square closed pocket, typed running across the width;
  - for contrast, a 30 × 11-1/4 side with a housing stored sideways.
- **Growth 199:** the joinery tests' Side and Shelf, joined by the dado recipe twice, with each
  output's names tagged A and B. Shelf A carries a full-length groove and an end rabbet stored one
  way; Shelf B carries the same two cuts stored the other way.

## Pass 1: 198, which the user passed

| Part | Sheet | Properties | Note and button |
|---|---|---|---|
| Leg, square pocket typed across the width | `3/4" blind groove … running across the length, stopped 6" short of the min end and 21-1/4" short of the max end` | Runs across: Width | **none** |
| Side, sideways housing | `3/4" blind dado … 12" from the length min end, running across the width …` | Runs across: Length | **shown** |

The leg's row disagrees with the sheet only on a square, where both directions are true, and it no
longer nags. The sideways housing still gets its note.

## Pass 2: 199, which the user passed

The two shelves print as **one row, `2 × 20-1/4" × 11-1/4"`**, because after joining both hold
identical cuts:
- `1/2" groove, 1/4" deep — … 5" from the width min end, running across the length`. The groove runs
  the whole grown length in both storages. Before this round, the sideways-stored one stopped 1/4″
  short of the new end.
- `3/4" dado, 1/4" deep — … 1/4" from the length min end, running across the width`. The end rabbet,
  positioned at the old end, stayed there in both storages, so the 1/4″ of growth in front of it
  makes it a dado.

Properties shows the two shelves identically: the groove runs across Length and the dado across
Width, with no note on either. The two sides also print as one row.

## Verdict

**Passed by the user.**

## What this pass did not show

- **A real Add joinery run:** the designs were joined in a script with the same recipe code, to avoid
  a paid call.
- **A square typed in millimetres** (follow-up 200). It is not a float-exact tie, so it keeps the
  note.

`localStorage` was cleared in the verifying browser afterward and read back empty (0 keys). The
browser was closed and the dev server stopped.
