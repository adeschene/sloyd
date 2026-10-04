# Sloyd — setup lines from the shape, and `groove` (follow-ups 192, 193, 194)

**Date:** 2026-10-04 · **Status:** approved in conversation

**Builds on:** the cut-words spec (`2026-10-04-sloyd-cut-words-design.md`): `openSides` (§2.4),
the naming table (§2.2–2.6), and §2.7, which deferred this work as follow-up 192.

## 1. Problem and goal

The cut words round made the **word** come from the cut's shape. The rest of the setup line still
comes from how the cut is **stored** (`across`, `offset`, `width`, `stopMin`/`stopMax`). One
pocket can be stored two equivalent ways, and joinery may pick either one, so:

- **192, seen live.** Joinery stores a front-stopped shelf housing across the side's LENGTH. It
  prints
  `10-1/4" stopped dado, 1/4" deep — … 1/4" from the width min end, running across the length,
  stopped 24" short of the min end and 47-1/4" short of the max end`.
  The housing's height up the side is printed as two "stops", and its real 3/4" stop at the front
  never appears.
- **192, the other side of it.** A through cut stored across the "wrong" axis can carry a stop
  clause after a through word (`11-1/4" dado … stopped 24" short of …`; 4 of 1,389 `dado` labels
  in the cut-words round's random search).
- **193.** Woodworking usage calls a channel running **with** the grain a groove and one running
  **across** it a dado. `cutLabel` has no grain input, so it says `dado` for both.

**Goal.** Every part of a setup line describes the cut's shape, so one shape prints one line,
whichever way it is stored. A with-grain channel says `groove`.

**Scope:**
- no change to geometry, the schema, `Cut`, or how cut-list rows group (`rowKey` and
  `cutSignature` are untouched);
- no change to the tenon line or to `findTenons`;
- no change to a cut that removes nothing (it keeps the old table, `fieldLabel`, and never
  reaches the cut list);
- the Joinery dialog's recipe names (`dado`, `stopped-dado`) are joint names, not cut words, and
  are unchanged.

**The user's rulings:**
1. The setup-line design in §2 ("yes, go ahead").
2. `groove` applies to **solid wood and plywood**; MDF has no grain and keeps `dado` (§3).
3. **194 is closed by decision**, with no code (§4).

## 2. Which way a cut runs, and the line written from it (192)

### 2.1 `runAxis(board, cut, solids?)` — the one decider

A new export in `cuts.ts`, beside `openSides`. It takes the same clipped opening and the same
`openSides` result. Of the two non-face dimensions `a` and `b`:

1. If **exactly one** of them is open at **both** ends, the cut runs along it. (A dado, a groove
   and a rabbet run along the axis they pass right through.)
2. Otherwise, the cut runs along the opening's **longer** clipped extent. (A stopped dado is
   longest toward its open edge, by the table's own `reach > run` rule; a stopped rabbet, a
   mortise and a blind dado run along their long side.)
3. If the two extents are **exactly** equal, it is the stored `across`. Equal extents mean a
   square opening, where either answer is true; the stored field makes the result stable.

The **position axis** is the other non-face dimension.

**One decider, two readers.** `cutLabel` (for `groove`, §3) and the setup line (§2.2) both call
`runAxis`, so the word and the line cannot disagree about direction. This is the argument
`openSides` was built on, one level up.

**Cost.** `runAxis` must not compute `openSides` a second time on the setup-line path. It takes
the precomputed `solids` like its siblings, and the implementation may pass an already computed
`openSides` result through an optional parameter. The joined workbench's `buildCutList` was 14.0 ms
after the cut words round; this round must stay within 1.5× of that, measured the same way.

### 2.2 The setup line

```
<P> <word>, <depth> deep — into the <face> face (<from> side), <O> from the <pos> min end,
running across the <run>[stop clause]
```

- `run` = `runAxis`; `pos` = the other non-face dimension.
- `P` = the clipped opening's extent along `pos`; `O` = its low end along `pos`.
- `depth`, `face` and `from` are unchanged (`cut.depth`, `cut.face`, `cut.from`).
- **Stop clause:** for each end of `run` that is **not open** (`openSides(...)[run]`), the gap
  from that end of the opening to the board's edge: `gapMin = span[run][0]`,
  `gapMax = board[run] - span[run][1]`. The wording is the existing one:
  `, stopped <gapMin> short of the min end and <gapMax> short of the max end`, or just the one
  present. An end that is open prints nothing, as now.

  A gap of zero can never print: a zero-width strip has no stock, so `openSides` calls that end
  open (its `noStock` test returns true for a degenerate strip).

**What changes, measured before writing this spec** (a throwaway probe over the three designs
from the cut-words live check, old line against new):
- **joined workbench:** all 16 mortise lines are byte-identical;
- **joined bookcase:** all lines are byte-identical (the back rabbets, the bottom and top
  housings, and both shelf dados);
- **bookcase with stopped shelves:** the four stopped housings change, and nothing else:

  ```
  old: 10-1/4" stopped dado, 1/4" deep — into the thickness face (max side), 1/4" from the width
       min end, running across the length, stopped 24" short of the min end and 47-1/4" short of
       the max end
  new: 3/4" stopped dado, 1/4" deep — into the thickness face (max side), 24" from the length min
       end, running across the width, stopped 3/4" short of the max end
  ```

  The back end of the housing is open (the back rabbet removed that 1/4"), so it prints no stop.
  This is 192's own case, read the way the user would read the board.

38 lines unchanged, 4 changed. The plan's tests pin these designs' lines so this stays true.

### 2.3 What else follows

- **A through word can no longer carry a stop clause**, because a dado's, a groove's and a
  rabbet's run axis is open at both ends by rule 1. The second half of 192 goes away by
  construction, not by a special case.
- **A clipped cut prints its clipped numbers.** A cut stored with a negative offset or hanging
  past an end prints where it really is, never a negative distance.
- **`stopClause` and its `cut.stopMin`/`cut.stopMax` reads go.** The stored stops still shape the
  cut (through `cutRegion`); the line no longer reads them directly.
- **Rows still group by stored fields.** Two cuts with the same shape stored two ways still make
  two rows that now print the same line. That is the "too strict splits a row, visible and
  harmless" side of `cutSignature`'s comment, and it is not changed here.

## 3. `groove` (193)

In `cutLabel`, after the table has chosen a word (§2.2–2.6 of the cut-words spec):

| Table word | Run axis is the board's grain, on a material with grain | Otherwise |
|---|---|---|
| `dado` | `groove` | `dado` |
| `stopped dado` | `stopped groove` | `stopped dado` |
| `blind dado` | `blind groove` | `blind dado` |

- **Run axis** is `runAxis` (§2.1). **The board's grain** is `board.grain`, a `Dimension`.
- **A material with grain:** every material except one whose sheet stock rotates freely
  (`MATERIALS[m].sheet?.rotate === 'free'`, which is MDF). Plywood's grain is its face veneer
  and counts (the user's ruling). The test reads the material table, not a list of names, so a
  new grainless sheet good follows by declaring `rotate: 'free'`.
- **Unchanged words:** `rabbet`, `stopped rabbet`, `notch`, `mortise`, `through mortise`, the
  tenon line and `tenon shoulder`.
- **`CutKind`** gains `'groove' | 'stopped groove' | 'blind groove'`.
- **Where the word shows:** the cut list and Properties. `DiagramCut.kind` carries it but nothing
  renders it.
- **A cut that removes nothing** keeps `fieldLabel` and never says `groove`; it has no opening to
  take a run axis from.
- **On the live designs** nothing changes word: the workbench has no channels, and the bookcase
  sides' grain runs along their length while every housing runs across the width.

## 4. 194, closed by decision

Two boards a hair apart in exact length share a row (display precision, invariant 18), and
`findTenons` could in principle recognise a tenon on one and not the other. The first board's
lines represent the row.

This is follow-up 55a's class, and 55a already decided it: a row is decided at display precision,
its representative's words are the more useful ones at the bench, and splitting a row over a
difference no saw can hold is what invariant 18 rules out. The ℓ ≤ L/2 cap also puts the boundary
far from any hair's-breadth difference. **Closed, pointing at 55a, with no code.**

## 5. Testing

- **`runAxis`:** a dado and a rabbet each stored both ways (`across` swapped, same box) give the
  same run axis; a stopped dado runs toward its open edge; a stopped rabbet and a mortise run
  along their long side; a square opening returns the stored `across`; an end opened by another
  cut counts as open (the bookcase housing next to the back rabbet).
- **The setup line, both storages:** the same pocket stored with `across` on either in-plane
  axis prints the **same line**. This is 192's real property and the test that would have caught
  it. Include a stopped dado, a mortise and a rabbet.
- **192's live case:** the stopped-shelf bookcase's side prints the new line in §2.2 exactly.
- **No through word with a stop clause:** over a seeded random search of single cuts (the
  cut-words round's shape), no line whose word is `dado`, `groove` or `rabbet` contains
  `stopped`.
- **Unchanged lines:** the joined workbench and joined bookcase print exactly the lines they
  print today (captured before the change, pinned as literals).
- **`groove`:** a with-grain channel on pine says `groove`; the same on plywood says `groove`;
  the same on MDF says `dado`; turning the board's grain makes it `dado`; one each for `stopped
  groove` and `blind groove`; a with-grain rabbet stays `rabbet`; a removes-nothing cut stays on
  the old table.
- **Mutation:** the run-axis rules (drop rule 1, drop rule 2, flip the tie), the stop clause's
  open test, and the groove condition (material test, grain comparison) are each mutated and
  must be caught.
- **Existing tests:** any existing expectation that changes is listed with its reason in the
  task report. One that changes for a reason not in this spec is a stop-and-ask.
- **Cost:** `buildCutList` on the joined workbench, before and after, against §2.1's bound.

## 6. Live check

Dev server, the user watching, as in the cut-words round:
- the joined workbench and joined bookcase read as before;
- the stopped-shelf bookcase's housings read with their height as the position and the front stop
  as the only stop;
- a board with a with-grain channel says `groove` on the sheet and in Properties.

## 7. Docs

- `docs/follow-ups.md`: close 192 and 193 with this round, and close 194 by decision (§4).
- `CLAUDE.md`: a rounds-table row; the `cuts.ts` tree entry names `runAxis` as the one decider for
  direction; test counts.
- `docs/history.md`: the round entry. A browser-verification write-up after the live check.
