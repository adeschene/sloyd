# Browser verification: a millimetre square reads like a fractional one

Follow-up 200, 2026-10-05. This was a bounded round: the design was approved in chat, and the rule is
in follow-up 200's closure in `docs/follow-ups.md`.

**What the round changed:** `runAxis` and the word table now compare the opening's COMPUTED extents
within `FLUSH_EPSILON`. Before, a square typed in millimetres went by its last bits: it could be
decided by "longer side" instead of the tie, keep the Match note that follow-up 198 hides, and tip
from `notch` to `stopped dado`.

## How this was driven

Claude drove the dev server (`npm run dev -- --host 127.0.0.1 --port 5180`, Chromium) with the
Playwright MCP, and **the user watched the same browser**. No paid calls were made.

A throwaway script wrote one `.sloyd` with three pine boards (24 × 5-1/2 × 3/4), and both the script
and the file were deleted afterward:
- **Pocket 20 mm:** a 20 mm square closed pocket typed running across the width. The script searched
  for mm sizes whose two extents come out unequal in the last bits but within 1e-9, which is
  follow-up 200's case.
- **Pocket 3/4 in:** its fractional twin, typed the same way.
- **Edge notch 20 mm:** a 20 mm square notch entering from the far edge, stored across the length.

## The pass, which the user passed

| Board | Sheet | Properties |
|---|---|---|
| Pocket 20 mm | `13/16" blind groove, 1/4" deep — … running across the length, stopped 3-15/16" short of the min end and 19-1/4" short of the max end` | Runs across: Width, no note |
| Pocket 3/4 in | `3/4" blind groove, 1/4" deep — … running across the length, stopped 6" short of the min end and 17-1/4" short of the max end` | Runs across: Width, no note |
| Edge notch 20 mm | `13/16" notch, 1/4" deep — … running across the width, stopped 4-11/16" short of the min end` | Runs across: Length, note and **Match the cut list** |

- **The two pockets read alike:** the same word, the same direction (the tie's length default), and
  no note. 20 mm prints as 13/16″ at sixteenth precision.
- **The mm edge notch reads `notch`,** as a 3/4″ one does, not `stopped dado`. Its open edge decides
  its direction, so it is not a default tie, and it correctly still offers Match because it is stored
  the other way.

## Verdict

**Passed by the user.**

## What this pass did not show

- **The guard at the tolerance boundary:** a cut whose extents differ by just under 1e-9, where
  re-storing would cross the boundary. It was found by the review (186 of 20,000 constructed cases)
  and is pinned in `cuts.test.ts` and `Properties.test.tsx`. It is not something a person types.
- **Fractions:** that they cannot change is proven by a test property (sixteenth extents are equal or
  at least 1/16 apart) and by the unchanged live-design literals, not shown here.

`localStorage` was cleared in the verifying browser afterward and read back empty (0 keys). The
browser was closed and the dev server stopped.
