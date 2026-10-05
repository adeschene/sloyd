# Browser verification: an overhanging cut shows only what it removes

Follow-up 197, 2026-10-05. This was a bounded round: the design was approved in chat, and the rule is
in follow-up 197's closure in `docs/follow-ups.md`.

**What the round changed:**
- `clippedRegion(board, cut)` is the cut's box clipped to the board.
- The drawing's leader spans and the snap points read it. So do `cutShape`, `openSides` and
  `findTenons`, which keeps the clip rule in one home.
- Before, the drawing's leader band and the snap points used the stored box, which can hang past
  the board.

## How this was driven

Claude drove the dev server (`npm run dev -- --host 127.0.0.1 --port 5180`, Chromium) with the
Playwright MCP, and **the user watched the same browser**. No paid calls were made.

**A false start, recorded so the next pass does not repeat it.** The first file held a rabbet stored
with a negative offset (−1/2″, width 1-1/4″) to make an overhang at the near end. Importing runs
`validateCuts`, which clamps a negative offset to 0 without shortening the width. So the cut arrived
as a genuine 1-1/4″ rabbet, and the sheet printed it correctly as one.

**An overhang cannot come in through a file.** It arises only in the session, when a board is
shrunk under an end cut, and the loader clamps it on the next open.

The pass therefore loaded a 24 × 3 × 3/4 rail with a 3/4″ rabbet at its far end (offset 23-1/4″),
then set its Length to 23-1/2″ in Properties. The rabbet's stored box now hangs 1/2″ past the end.

## The pass, which the user passed

| | Before the shrink | After the shrink |
|---|---|---|
| Part | `24" × 3"` | `23-1/2" × 3"` |
| Setup line | `3/4" rabbet … 23-1/4" from the length min end` | `1/4" rabbet … 23-1/4" from the length min end` |
| Hatch (outline 0–1000) | x 969, width 31 | x 989, width 11 |
| Dimension band | 969 → 1000 | **989 → 1000**, ending at the outline |
| Labels | `23-1/4"`, `3/4"`, `1/4" deep` | `23-1/4"`, `1/4"`, `1/4" deep` |

Everything shown is the 1/4″ that remains: the line, the hatch, the band and its labels agree.
Before this round the band ran from 989 to about 1021, past the outline, under a `1/4"` label.

## Verdict

**Passed by the user.**

## What this pass did not show

- **Snap points:** an overhanging cut offers exactly the snap points of the same cut flush with the
  edge, and an over-deep dado offers those of a through dado. Seeing that needs the Move tool hovering
  the 3D view, which this host's software GL cannot drive (invariant 26a's caution). Unit tests in
  `snapPoints.test.ts` pin both.

`localStorage` was cleared in the verifying browser afterward and read back empty (0 keys). The
browser was closed and the dev server stopped.
