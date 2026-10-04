# Sloyd — stopped cuts

**Date:** 2026-10-04 · **Status:** approved in conversation, section by section
**Builds on:** the joinery round (schema v4, `Cut`), the cut list rounds (diagrams, label
layout, per-face views) and the cut-aware snap points round. Every rule there still holds
unless this document says otherwise.

## 1. Problem and goal

A `Cut` always runs **fully across** one of its board's dimensions (`cutRegion`,
`src/document/cuts.ts`). That expresses dados, rabbets, grooves, half-laps, tenons (two or
four rabbets on a rail's end), bridle slots and finger joints. It cannot express a cut that
**stops short**: no blind or through mortise, no stopped dado, no stopped groove.

Phase 2 (follow-up 171) will rewrite `overlap` as "overlap not accounted for by a cut"
(invariant 38). A tenon with no mortise to sit in leaves the central furniture joint out of
that rule. So this round comes first, and 171's rule gets written once, against the joint set
it will actually face.

**Goal:** a person can model, by hand in Properties, a blind mortise, a through mortise and a
stopped dado. Each one is right in 3D, on the cut list's drawing and labels, and after a save
and reload.

**The user's three rulings, made in conversation:**

1. **Labels are derived from the shape**, using the full vocabulary of §4.1.
2. **Entry is two "stop short" distances**, both 0 by default, so no mode toggle.
3. **Stop distances are labelled on the drawing**, not only in the text line.

**Out of scope** (§9): angled and round joinery, any LLM change, and the overlap rule itself.

## 2. Definitions

- **Across span.** The extent of a cut along its `across` dimension. Before this round it was
  always `[0, board[across]]`.
- **Stop.** A distance the cut ends short of one end of its `across` dimension. `stopMin` is
  measured from the `min` end and `stopMax` from the `max` end. These are the same min/max
  words `Cut.from` uses.
- **Stopped.** `stopMin > 0 || stopMax > 0`, compared exactly, with no epsilon. A stop is a
  stored value the user typed, with no arithmetic on the way in, so invariant 18's reasoning
  applies.
- **Flush.** Today's test in `cutLabel`, unchanged, including `FLUSH_EPSILON`: the cut touches
  either end of its position axis.

## 3. The data and the schema

### 3.1 The type

```ts
export interface Cut {
  // …existing fields unchanged…
  /** How far short of the `across` dimension's MIN end the cut stops, in inches. 0 = runs out. */
  stopMin: number;
  /** How far short of the `across` dimension's MAX end the cut stops, in inches. 0 = runs out. */
  stopMax: number;
}
```

- Both fields are **required** in memory, so no consumer ever handles `undefined`.
- Every save writes both.
- The `Cut` doc comment in `types.ts` currently opens "A rectangular through-cut … running
  fully across one of its dimensions". It is rewritten to say the cut runs across **unless it
  is stopped**.

### 3.2 Geometry

`cutRegion` is the only geometry change:

```ts
region[cut.across] = [stopMin, board[cut.across] - stopMax]   // clamped, see below
```

- **Clamping.** Each stop is clamped into `[0, board[across]]`. If the two stops then cross
  (`lo >= hi`), the region is **empty**, so the cut removes nothing. `cutRegion` never returns
  a backwards span and never `NaN`.
  - This matters mid-session. Shortening a board can leave a cut's stops out of range, the same
    way offsets already can; the loader tidies them on the next load.
  - **How the empty region is written:** `cutRegion` already returns all-zero spans for a cut
    that names one dimension twice, and this uses the same form.
  - Every consumer already copes with an empty region, because a zero-width or zero-depth cut
    is the same shape. Tests pin that `boardSolids` and `stockProbe` treat it as "no cut".
- **What follows from the box.** `boardSolids`, `boardEdges` and `stockProbe` work from the
  box `cutRegion` returns. They already handle general boxes, so none of them changes.
- **`buildDepthField` is the exception, checked against the code.** Its local `rect`
  rebuilds a cut's in-plane rectangle itself, and hard-codes the across span as
  `[0, board[d]]`.
  - Left alone, a stopped cut would draw its hatch at full length while the 3D view showed
    it stopped. Two answers to one question.
  - So `rect` takes its two in-plane spans from `cutRegion(board, cut)`, which becomes the
    single source. The comment above it ("every cut on a face is a full-span rectangle") is
    removed, because it is no longer true.
  - An empty region from crossed stops is never "covering": the centre test uses strict
    inequalities, so a zero-width span adds boundaries and nothing else.
  - The agreement test (§7) is what proves the two now agree.

### 3.3 Validation (`validateCuts`)

- **A stop is defaulted to 0** when missing, not a number, not finite, or negative. That
  includes every pre-v7 cut. **Defaulted, not refused:** the same rule `stock.kerf` follows.
- **Then each stop is clamped** into `[0, board[across]]`.
- **If `stopMin + stopMax >= board[across]`, the cut is dropped**, the same way a zero-width
  or zero-depth cut is dropped today.
  - Equality counts: zero length is not a cut.
  - Clamping one stop toward the other is not done. There is no nearest legal value that
    keeps both numbers the user typed, and guessing which stop to shorten moves a mortise.
- **The remove-everything rule** becomes a statement about the box:
  - Today: depth equals the face dimension, AND offset is 0, AND width equals the position
    dimension.
  - Now: all three of those, **AND both stops are 0**.
  - So a full-depth, full-width cut that stops short is legal. It is a slot that leaves a
    bridge of wood at one or both ends.

### 3.4 Schema v6 → v7

- **`CURRENT_VERSION` becomes 7.** The step is **document-level**: no `rawBoards.map`.
  - §3.3's defaulting is all a v6 cut needs. 0 is the correct value for every old cut,
    because every old cut runs fully across.
  - So this is the v4→v5 and v5→v6 shape, not the per-board shape. CLAUDE.md's Versioning
    section names that distinction, and this is the document-level case.
- **The argument for the bump is wrong geometry, stronger than v6's data loss.**
  - What happens without it: a v6 build opening a v7 file ignores the stops. It reads a
    blind mortise as a through-dado, shows the wrong part with nothing to say so, and its
    autosave writes the wrong shape back.
  - The bump makes the v6 build refuse the file instead.
- **Rollback** past this round strands documents saved under v7, as earlier bumps did.
  Export first.

### 3.5 Unchanged

- **Cut ids**, and invariant 33's per-board scoping of them.
- **Nesting and board feet** do not read the stops. They price the stock you buy, not what
  remains.
- **`generated.ts`** still emits `cuts: []`.
- **`designCheck`** does not read cuts at all. That is 171's job.

## 4. What reads a stopped cut

### 4.1 Labels: `cutLabel`

The return type widens to a union of seven strings, exported as `CutKind`:

| Stopped ends | Not flush | Flush |
|---|---|---|
| none | `dado` | `rabbet` |
| one | `stopped dado` | `stopped rabbet` |
| both | `mortise`, or `through mortise` when `depth >= board[face]` | `notch` |

- **The through-mortise boundary uses the stored depth against the stored face dimension.**
  Use `>=` so that an out-of-range depth mid-session still reads as through.
- **The flush test is untouched**, and so is its existing doc comment about a cut flush at
  both ends.
- **Every place that typed the label as `'dado' | 'rabbet'`** moves to `CutKind`. That
  includes `DiagramCut.kind`, plus any switch or lookup keyed on it. A lookup that is not
  exhaustive must fail to compile, not fall through.

### 4.2 Cut list grouping: `cutSignature`

`cutSignature` is a **hand-written field list**:
`[face, from, across, offset, width, depth]`.

- **The trap.** Leave the stops out, and two parts that differ only in a stop share one row
  and one setup. A mortised leg would be cut as a through-dado.
- **The rule.** The signature is built from **every field of `Cut` except `id`**, enforced
  by the type system rather than by a comment. The plan picks the exact mechanism; one is a
  `satisfies Record<Exclude<keyof Cut, 'id'>, …>` table of fields.
  - Whatever the mechanism, adding a field to `Cut` must break `tsc` until the field is
    either in the signature or explicitly declared as excluded from it.
- **The test.** Two parts identical except `stopMax` give **two rows**.
- **Invariant 18 still holds.** Stops are machined, so they match exactly and are never
  rounded.

### 4.3 The setup line: `setupLine`

- **A cut that isn't stopped prints exactly as today, byte for byte.** A test pins the
  current string for a dado and for a rabbet.
- **A stopped cut appends one clause** after `running across the <across>`:
  - both stops: `, stopped <f(stopMin)> short of the min end and <f(stopMax)> short of the max end`;
  - one stop: `, stopped <f(stop)> short of the <min|max> end`.
- The label word in front comes from `cutLabel` as today, so `3/4" mortise, 1 1/2" deep — …`.

### 4.4 Diagrams: `diagram.ts` and `PartDiagram.tsx`

- **The band is already the cut's box**, read from `cutRegion`, so a stopped cut is drawn as
  its rectangle with no change to the geometry code.
- **New labels.** `DiagramCut` gains three optional, already-formatted labels:
  - `stopMinLabel` and `stopMaxLabel`, each present only when that stop is greater than 0;
  - `lengthLabel`, the cut's extent along `across`, present only when the cut is stopped.
- **Where they go.** In `PartDiagram`, they form a **second row of labels along the side of
  the figure parallel to the `across` axis**, spaced by the existing `packRow` exactly as
  today's offset, width and depth row is.
  - Today's row sits on the side parallel to the position axis, so the two rows never share
    a side.
  - Each label's centre is the midpoint of the span it names: near stop, the cut's length,
    then far stop.
- **The figure grows to make room** for the second row by the same mechanism that sizes it
  for the first.
  - **A view with no stopped cut keeps exactly today's size and layout.** Invariant 19's
    "nothing overlaps or bleeds" is pinned for both. A test asserts identical sizing for a
    view with no stopped cut.
- **Invariant 19's third clause.** Every new label string is assembled in `diagram.ts` and
  passed whole; `PartDiagram` concatenates nothing.
  - The strings are `formatLength` output only: ASCII digits, `/`, space and `"`. These are
    already measured in the monospace stack, so no new glyph needs measuring.

### 4.5 Snap points: `pointsOfCut`

- **The floor of the cut** keeps its 9 points: every combination of {min, mid, max} on the
  position and across axes. They now come from the stopped span automatically, because they
  are read from `cutRegion`.
- **The mouth now offers all 8 points around its opening**: every combination except the
  centre (pos mid, across mid). Today it offers only the 6 on its two shoulder lines.
  - **Why.** On a stopped cut, the stopped ends are wood, and the midpoints of those ends
    are real features. They are what you snap a tenon's shoulder to.
  - **Why the centre stays out:** it sits in the hole, the same exclusion as before.
- **For a through-cut, the 2 added points are filtered**, so **existing boards offer exactly
  today's points**.
  - Where they sit: on the board's own surface, where the opening meets the board's edge.
  - Why the filter (`stockProbe`) removes them:
    - The point touches only the cut's own top cell, which is empty.
    - Every other cell around it lies outside the board, and outside cells count as empty.
  - **This claim is pinned by a test, not left as an argument.** The test takes every board
    shape in the existing snap-point tests and asserts the snap-point set is unchanged.
  - **If that test fails**, the stated fallback is to offer the two end midpoints only on an
    end that is stopped. The plan must not quietly change existing behaviour to make the
    test pass.
- **The `kind` rule is unchanged**: it counts the mids among the in-plane axes.
- **The doc comment changes.** `pointsOfCut`'s comment says "15 per cut", and that count
  becomes "up to 17". The `cutSnapPoints` comment and CLAUDE.md's snapPoints entry
  ("15 for a dado, 12 for a rabbet") are corrected to match the measured counts.

## 5. Properties, and the store

### 5.1 The cut row: `CutRow` in `Properties.tsx`

- **Two new `DimensionField`s**, placed directly after "Runs across":
  - **"Stop short of near end"** (`stopMin`), `min={0}`, `max={board[across] - cut.stopMax}`;
  - **"Stop short of far end"** (`stopMax`), `min={0}`, `max={board[across] - cut.stopMin}`.
  - `DimensionField` refuses out-of-range entry rather than clamping it. That is unchanged.
- **The row gets a second refusal**, beside `wouldRemoveAll`:
  - **The case:** a patch whose stops sum to `>= board[across]` would leave no cut.
  - **What happens:** it is refused with the inline error `"That would leave no cut."`.
    This uses the existing `error` and `attempt` mechanism, so the field reverts to the
    stored value.
  - **Why the max alone isn't enough:** it rules out a sum *over* the length, but equality
    is a value the field allows.
- **Every list that tracks "what can make an error stale" gains `stopMin` and `stopMax`.**
  - That includes `wouldRemoveAll`'s own reads and the effect that clears a stale error.
  - Missing a dependency here is exactly invariant 15's failure mode.
- **Changing "Runs across" resets both stops to 0.** The stops measured along the old `across`
  direction, so carried over they would describe nothing.
  - That makes this a **reset, not a clamp**, and it is consistent with `repositionForAxes`'s
    doc comment: that comment prefers a clamp only where the number keeps its meaning.
  - **When `face` changes and `across` does not, the stops are kept.** The dimension they
    measure along is unchanged, so they stay legal.
  - **When `setFace` has to move `across` as well, the stops reset**, because `across`
    changed.
- **The row's head label and its remove button's `aria-label`** come from `cutLabel` as
  today, so they update live.

### 5.2 The store

- **`addCut`** creates `stopMin: 0, stopMax: 0`.
- **Stops change through the existing `updateCut`**, which already runs
  `dropHeldIfGone(boardId)` after the `edit()`. That is invariant 24, point-precise. A stop
  edit that makes a held point stop being offered drops it by the existing rule, with no new
  code. A store test proves this for a stop edit specifically.

## 6. Invariants and docs

- **New invariant 40: the cut list signature covers every field of `Cut` except `id`, by
  type, not by list.**
  - It records §4.2's trap and the mechanism.
  - It also records the general rule: **anything that decides "same cut" from a field list
    must be compiler-checked against the type**, invariant 15 one layer over.
- **CLAUDE.md:**
  - add the `stopMin`/`stopMax` meaning and the label table to the `cuts.ts` entry;
  - change the Versioning section to `CURRENT_VERSION` 7, with §3.4's argument;
  - add a row to the rounds table;
  - correct the snap-point count.
- **`docs/follow-ups.md`:** a note on 171 saying the "overlap explained by a cut" rule can now
  be written against mortises. New follow-ups only for residue the round actually finds.
- **`docs/history.md`:** an entry for the round.
- **`docs/browser-verification-stopped-cuts.md`:** the live check (§8), with screenshots in
  `docs/img/`. Here the finding is spatial, so screenshots earn their place.

## 7. Testing

**Unit tests, by file:**

- **`cuts.test.ts`**
  - `cutRegion` with no stops, one stop and two stops;
  - the clamp, and crossed stops giving an empty region;
  - that empty region doesn't remove anything in `boardSolids` or `stockProbe`;
  - **all seven labels**, plus the boundary between mortise and through mortise at
    `depth === board[face]`.
- **`document.test.ts`**
  - every way a stop is defaulted (missing, a string, `NaN`, `Infinity`, negative);
  - the clamp;
  - a sum `>=` the across length is dropped, with equality as its own case;
  - the remove-everything rule with and without stops;
  - a v6 document loads with every stop at 0;
  - `CURRENT_VERSION === 7`, and a version-8 document is refused;
  - a v7 save and reload keeps both stops.
- **`cutlist.test.ts`**
  - two rows for parts that differ only in a stop;
  - `setupLine` byte-for-byte for a dado and a rabbet with no stops;
  - the one-stop and two-stop clauses.
- **`diagram.test.ts`**
  - each of the three labels is present exactly when §4.4 says, and absent otherwise.
- **`PartDiagram` / `SheetLayout` tests**
  - a view with no stopped cut sizes identically to today;
  - the second row never overlaps or bleeds.
- **`snapPoints.test.ts`**
  - the unchanged-set test across the existing board shapes (§4.5);
  - a blind mortise offers its two end midpoints at the mouth;
  - a through mortise's floor points sit on the far surface.
- **`depthField.agreement.test.ts`**
  - add a stopped dado, a blind mortise and a through mortise.
  - It must assert the **depth value**, not just where cuts are (invariant 20).
- **`Properties.test.tsx`**
  - both fields commit;
  - the "leave no cut" refusal and its stale-error clearing after an undo;
  - changing "Runs across" resets the stops;
  - changing face alone keeps them;
  - the label updates live.
- **`store.test.ts`**
  - `addCut` defaults;
  - a stop edit drops a held point that stops being offered, and keeps one that is still
    offered.

**Mutation testing.** Every test the plan supplies is mutated, as the ledger requires. These
get it hardest, because each is the kind of test that can pass without checking anything:

- **every "unchanged for existing cuts" test**: snap points, the setup line, drawing size;
- **the signature test.** Mutation: delete one stop from the signature, and the test must
  fail. Then delete the type guard, and `tsc` must fail.
- **the reset on changing "Runs across".** Mutation: carry the stops over, and the test must
  fail.
- **the "leave no cut" refusal.** Mutation: `>` for `>=`.

`npm run build` is the type gate, and it must pass. A green `npm test` does not prove the
code compiles.

## 8. The live check

Claude drives the dev server with Playwright and the user watches. There are **no paid
calls**, and no key is needed.

**What gets modelled by hand:**
1. a leg with a blind mortise in its edge;
2. a rail with a matching four-shoulder tenon, made of four rabbets;
3. a case side with a stopped dado;
4. a through mortise.

**What gets checked:**
- each one in 3D, including the edge lines around a mortise's opening;
- the cut list: labels, drawings, the second row of labels, and the setup lines;
- a reload, so it survives a round trip;
- the Move tool snapping the tenon's shoulder to the mortise's end midpoint. That is phase 2's
  central gesture, done by hand.

Software GL's undefined-behaviour gap (follow-up 26a) is not touched: there is no new shader
or precision-sensitive rendering. `localStorage` is cleared afterward and read back empty.

## 9. Out of scope

- **Angled joinery** (dovetails, miters, splayed legs) and **round joinery** (dowels,
  drawbore pins). Every layer assumes axis-aligned boxes, including invariant 39's checks.
- **Any LLM change.** Generated designs keep `cuts: []`, and teaching the model joints is
  171's job.
- **The overlap rule (invariant 38).** It is unchanged here, and 171 rewrites it.
- **Groove versus dado** (with the grain versus across it). It isn't distinguished today and
  is not added. The table in §4.1 is the user's ruling, and it has no grain column.
