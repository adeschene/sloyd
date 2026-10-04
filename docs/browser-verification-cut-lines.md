# Browser verification: setup lines from the shape, and `groove`

Follow-ups 192 and 193, 2026-10-04. Spec: `docs/superpowers/specs/2026-10-04-sloyd-cut-lines-design.md`.

The round changed what the cut list prints, not the geometry:
- the setup line and the drawing's labels are now written from the cut's shape (`cutShape`);
- a channel running with the grain says `groove`.

This pass asked two things: whether the lines that should not change still don't, and whether the
ones that change read the way a woodworker would say them.

## How this was driven

Claude drove the dev server (`npm run dev -- --host 127.0.0.1 --port 5180`, Chromium) with the
Playwright MCP, and **the user watched the same browser**.
- **No paid calls.** The designs were built in a throwaway script and written out as `.sloyd`
  files. The script was deleted afterward.
  - **Workbench joined:** `fixtures/simple-workbench.sloyd` with the default joints.
  - **Bookcase stopped shelves:** the cut-words round's bookcase, with each shelf housing stopped
    3/4″ short of the front.
  - **Grooves:** five small boards:
    - an oak rail with a panel groove in its edge;
    - a pine drawer side with a groove and a stopped groove;
    - a plywood panel with a blind groove;
    - an MDF panel with the same channel;
    - a shelf with a dado across it.
- **Loading:** files were imported through the project menu. Buttons were clicked from the page
  (`element.click()` in `evaluate`), as in earlier passes. Screenshots time out on this host's
  software GL, so the drawing was scrolled into view for the user to read directly.

## Pass 1: the workbench, unchanged, which the user passed

Every leg printed its four mortise lines byte-for-byte as before, for example:

```
1/2" mortise, 1-1/4" deep — into the width face (max side), 1/2" from the thickness min end,
running across the length, stopped 28-1/4" short of the min end and 1/2" short of the max end
```

The drawings carried the same `6-1/2"`, `24-1/4"`, `28-1/4"`, `4-1/2"` and `1/2"` labels. The
rails printed one tenon line per end. There was no `groove` anywhere: every channel-like cut on the
workbench runs across its board's grain or is a tenon shoulder.

## Pass 2: the bookcase, follow-up 192's case, which the user passed

Each side's two shelf housings now print:

```
3/4" stopped dado, 1/4" deep — into the thickness face (max side), 24" from the length min end,
running across the width, stopped 3/4" short of the max end
```

and the same at `48"`. Before this round the same cut read `10-1/4" stopped dado … 1/4" from the
width min end, running across the length, stopped 24" short of the min end and 47-1/4" short of
the max end`. That printed the housing's height up the side as two "stops" and never showed its
real front stop.
- **The back:** no stop prints at the back end, because the back rabbet has already removed that
  1/4″.
- **The drawing:** it now carries the same numbers: `24"` and `3/4"`, `48"` and `3/4"` along the
  length, and `10-1/4"` then `3/4"` across the width.
- **Unchanged:**
  - the 3/8″ back rabbets;
  - the bottom and top housing rabbets at `0"` and `71-1/4"`;
  - the top's and bottom's back rabbets;
  - the shelves' corner `notch` lines.
- **No `groove`:** the sides' grain runs up their length and every housing runs across it.

## Pass 3: grooves, which the user passed

| Board | Sheet line |
|---|---|
| Rail (oak), edge | `1/4" groove, 3/8" deep — into the width face (max side), 1/4" from the thickness min end, running across the length` |
| Drawer side (pine) | `1/4" groove …` and `1/4" stopped groove … stopped 1" short of the max end` |
| Panel (plywood) | `3/4" blind groove … stopped 2" short of the min end and 2" short of the max end` |
| Panel (MDF) | `3/4" dado …`, the same channel, no grain |
| Shelf (pine) | `3/4" dado … running across the width`, across the grain |

Properties uses the same words. The drawer side's cut rows are headed `groove` and `stopped
groove`, and their remove buttons read `Remove cut (groove, offset 1/2")` and `Remove cut (stopped
groove, offset 2-1/2")`.

## Verdict

**Passed by the user.** The unchanged designs print as before. Follow-up 192's housing reads with
its height as the position and its front stop as its only stop, in the line and on the drawing.
Channels with the grain say `groove` on solid wood and plywood, and not on MDF.

## What this pass did not show

- **Properties still shows each cut as stored** (follow-up 195). On the bookcase housings its "Runs
  across" disagrees with the sheet. On the grooves board the two happen to agree.
- **A square opening** prints one of two lines depending on how it is stored (follow-up 196).
  None of the designs here had one.
- **An overhanging cut's drawing** (follow-up 197) was not exercised.

`localStorage` was cleared in the verifying browser afterward and read back empty (0 keys). The
browser was closed and the dev server stopped.
