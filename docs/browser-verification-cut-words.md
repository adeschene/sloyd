# Browser verification: cut-list wording

Follow-ups 180, 181 and 189, 2026-10-04. Spec: `docs/superpowers/specs/2026-10-04-sloyd-cut-words-design.md`.

The round changed only words: how a cut is named, and how a tenon prints. Geometry, the schema and
cut-list grouping are untouched. This pass asked whether the words on real joined designs read the
way a woodworker would say them at the bench.

## How this was driven

Claude drove the dev server (`npm run dev -- --host 127.0.0.1 --port 5180`, Chromium) with the
Playwright MCP, and **the user watched the same browser**.
- **No paid calls.** The joined designs were built in a scratch script with `applyJoints` and the
  default joints, written out as `.sloyd` files, and imported through the project menu.
- **The three designs:**
  - **Workbench joined:** `fixtures/simple-workbench.sloyd` with defaults.
  - **Bookcase joined:** the joinery tests' bookcase (back behind, two sides, bottom, top) plus two
    shelves, with defaults.
  - **Bookcase stopped shelves:** the same bookcase, with each shelf housing chosen as a stopped
    dado stopped 3/4″ short of the front.
- **One practical note.** On this host's software GL, Playwright's click and screenshot calls timed
  out on the heavy scenes, so the toolbar buttons were clicked from the page instead
  (`element.click()` in `evaluate`). The file chooser still opened normally.

## Pass 1: the workbench, which the user passed

Every rail printed **exactly two tenon lines**, in place of its eight rabbet lines. Before this
round each rail printed eight lines; follow-up 180 had reported four per end:

```
1-1/4" tenon, 1/2" thick × 4-1/2" wide — at the length min end     (top rails)
1-1/4" tenon, 1/2" thick × 2-1/2" wide — at the length min end     (low rails)
```

The legs printed `1/2" mortise, 1-1/4" deep … stopped 28-1/4" short of the min end and 1/2" short of
the max end`, with their stops, as before.

## Pass 2: the bookcases, which gave the round its amendment

The first bookcase showed a word that was exact but misleading. **Each shelf housing printed
`3/4" stopped dado … stopped 1/4" short of the min end`.**
- **Why:** the housing stops 1/4″ short of the side's back edge only because the back rabbet has
  already removed that 1/4″. At the bench it is a plain through dado. The Joinery dialog called it
  a dado too.
- **The front-stopped variant** read `blind dado` for the same reason. Naming looked only at the
  board's edges, not at stock other cuts had already removed.

The user chose to **name cuts from the stock that is actually there**. This became spec §2.4: a side
of an opening is open when no stock remains between it and the board's edge. One helper,
`openSides`, serves both the word and the setup line's stop clause.

The user left the three remaining word calls to Claude, with research. They became spec §2.5–2.7:
- **§2.5:** a cut through the whole thickness at a corner is a `notch`, which is what a shelf
  "notched at the front corner" for a stopped dado gets.
- **§2.6:** a closed pocket is a `mortise` only when it is deeper than it is wide **and** no longer
  than 8× its depth. A 4× length-to-width rule was considered first and rejected, because it would
  have renamed the workbench's real 1/2″ × 4-1/2″ mortises `blind dado`.
- **§2.7:** writing the whole setup line from the shape is deferred, as follow-up 192.

After the amendment, the bookcase reloaded with these lines on each side:

```
3/8" rabbet, 1/4" deep — into the width face …, running across the length        back rabbet
3/4" rabbet, 1/4" deep — … 0" from the length min end, running across the width  bottom housing
3/4" rabbet, 1/4" deep — … 71-1/4" from the length min end, …                    top housing
3/4" dado, 1/4" deep — … 24" from the length min end, running across the width   shelf 1
3/4" dado, 1/4" deep — … 48" from the length min end, running across the width   shelf 2
```

In the stopped-shelf bookcase, the housings read `stopped dado` and the shelves' corner cuts read
`notch`. The final-review probes also printed these. **The user passed it.**

## Verdict

**Passed by the user.** Workbench tenons, mortises, housings into a rabbet, stopped housings and
shelf notches all read as a woodworker would say them.

## What this pass did not show

- **The rest of a setup line still follows how the cut is stored** (follow-up 192). Joinery stores
  a front-stopped housing across the side's length. Its line therefore reads `10-1/4" stopped dado …
  running across the length, stopped 24" short of the min end and 47-1/4" short of the max end`: the
  word is right, but the housing's height up the side is printed as two "stops".
- **Grain-aware words**, such as `groove` (follow-up 193).
- **Properties' `tenon shoulder` label** was not opened live. It is covered by tests, including the
  remove button's accessible name.

`localStorage` was cleared in the verifying browser afterward and read back empty (0 keys). The
browser was closed and the dev server stopped.
