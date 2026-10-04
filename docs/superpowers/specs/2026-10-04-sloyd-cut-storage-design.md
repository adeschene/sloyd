# Sloyd — store a cut the way the sheet reads it, and a shape-only tie (follow-ups 195, 196)

**Date:** 2026-10-04 · **Status:** approved in conversation

**Builds on:** the cut-lines spec (`2026-10-04-sloyd-cut-lines-design.md`): `cutShape`, `runAxis`
(§2.1) and the line and drawing written from it (§2.2, §2.4).

## 1. Problem and goal

The cut lines round made the sheet describe a cut by its shape. Two gaps remain:

- **195.** Properties edits a cut in its STORED form ("Runs across", the two stops, "From the
  end"). When a cut is stored sideways to the way it runs, the row and the sheet disagree. For
  follow-up 192's housing:
  - the sheet says `running across the width, stopped 3/4" short of the max end`;
  - the row says Runs across: Length, with stops 24″ and 47-1/4″.

  Joinery is where these cuts come from. `pocketFor` picks `across` as "the dimension with the
  most boundary contact", ties to the earlier. The housing touches no edge in either direction,
  because the back rabbet has removed the back 1/4″, so it is stored across the length.
- **196.** `runAxis` breaks an exact tie in extents by the stored `across` (cut-lines rule 3). A
  square notch or square mortise stored two ways therefore prints two different lines, both true.

**Measured before writing this spec** (a throwaway probe over the three cut-lines live-check
designs): of 108 joinery cuts, exactly 4 are stored sideways, the stopped shelf housings. The
workbench's 80 and the plain bookcase's 12 are already stored the way they run.

**Goal.** One shape gets one line, whatever its storage. A cut joinery makes is stored the way the
sheet reads it, and Properties offers one click to bring an older cut in line.

**Scope:**
- no geometry change: every re-stored cut removes exactly the stock it removed before;
- no schema change and no load-time rewrite of stored documents;
- follow-up 197 (the overhang drawing) is out of scope.

**The user's rulings:**
1. **195:** store it the sheet's way. Joinery stores every cut it makes that way. A row stored the
   other way shows a note and a **Match the cut list** button.
2. **196:** on a square tie, take the direction with exactly one open end (the edge the cut enters
   from), and otherwise length, width, thickness.

## 2. The tie (196)

`runAxis` keeps rules 1 and 2 of cut-lines §2.1. Rule 3 is replaced:

> **3.** If the two extents are exactly equal, the cut runs along the direction with **exactly
> one** open end, when exactly one of the two has one. Otherwise it runs along the earlier of the
> two in `DIMENSION_ORDER` (length, width, thickness).

`runAxis` no longer reads `cut.across`, so `cutShape` is a function of the board and the cut's
box alone.

**Why it has to change for 195 too:** §3 stores a cut with `across = run`. If `run` read `across`,
storage and direction would decide each other.

**Examples** (default board, 24 × 5-1/2 × 3/4):
- **A 3/4″ square edge notch** (opening `length [6, 6.75]`, `width [4.75, 5.5]`) runs across the
  width from its open far edge: `3/4" notch … 6" from the length min end, running across the width,
  stopped 4-3/4" short of the min end`, whichever way it is stored.
- **A square closed pocket** runs along the length, either storage.
- **A square corner opening** (one open end on each axis) runs along the length.

## 3. Storing a cut the way it runs (195)

### 3.1 `storedAsShape(board, cut, solids?)`

A new export in `cuts.ts`. It returns the same cut re-stored with `across = cutShape(...).run`:

| Field | Value |
|---|---|
| `id`, `face`, `from`, `depth` | unchanged |
| `across` | `run` |
| `offset`, `width` | `at[0]`, `at[1] - at[0]` (the clipped opening along `pos`) |
| `stopMin`, `stopMax` | `along[0]`, `board[run] - along[1]` (the clipped opening along `run`) |

**The same stock comes off.** The new cut's `cutRegion`, clipped to the board, equals the old
one's. Clipping only drops stored overhang that removed nothing. The stops are always ≥ 0
because the spans are clipped.

**To the bit where the schema allows it (final review).** `offset` and `stopMin` are copies, so
the near ends are exact. The far ends are recomputed by `cutRegion` as `offset + width` and
`board[run] − stopMax`, and the plain differences in the table can land an ulp off for decimal or
millimetre values. Worse, for a far end under half of `board[run]` NO float `stopMax` reaches it
(every `board[run] − x` is a multiple of ulp(x)), and `offset + width` misses rarely by
round-half-even. On a seeded sweep of 8,114 millimetre re-stores, 883 far ends could not be stored
exactly, 282 of those flipped a square opening's run, and the next click flipped it back. The
re-store therefore searches each far end one ulp at a time: the exact value where one exists, and
otherwise the nearest value on the side that KEEPS THE RUN (the run's extent never shrinks, the
position's never grows), within one ulp of the board's dimension. After it: 0 oscillations, 0 run
changes; 6 exact-tie notches read as stopped dados after growing by that ulp.

**The guard (user ruling).** If the re-stored cut's `cutShape` differs from the original's in
`word`, `run`, `pos` or which stops are null, `storedAsShape` returns the original cut unchanged,
so a re-store never changes what the sheet says. On the sweep it refuses exactly those 6
exact-square corner openings.

**When it is the identity.** A cut already stored with `across === run` is returned UNCHANGED,
the same object, overhang and all. Recomputing its fields would not be exact: `(offset + width) −
offset` is not `width` for a decimal such as 0.1 + 0.2 (found while planning). Only a sideways cut is
re-stored, from the clipped opening. A caller therefore tests `cut.across !== shape.run` to decide
whether to offer the change.

**It is meaningful only for a cut that removes stock.** For one that removes nothing it returns the
cut unchanged.

### 3.2 Joinery stores the shape's way

`pocketFor` builds its cut as now, then returns
`storedAsShape({ ...board, cuts: [...board.cuts, cut] }, cut)`. It reads the board's existing
cuts, so a housing beside an earlier back rabbet is stored running across the width. The returned
cut keeps the same id.

Invariant 41's test method is unchanged and must still pass: every pose is probed against the box
itself. The cut's REGION is what those tests read, and §3.1 keeps it.

**What changes in tests:** any assertion on joinery's STORED fields (`across`, `offset`, `width`,
`stopMin`, `stopMax`) for a cut that was stored sideways. The probe says that is the stopped
housing family only. An assertion on regions, lines, drawings or words that changes is a
stop-and-ask.

**Order.** A later cut can change which way an earlier cut runs. For example, a rabbet added after
a housing could open one of its ends. Joinery does not go back and re-store earlier cuts; §3.3's
note covers that case.

### 3.3 Properties: the note and the button

In `CutRow`, for a cut that removes stock and is not a tenon shoulder, when
`cut.across !== shape.run`:

- **A note** under the row's heading, as a `field-note`:
  `The cut list reads this cut as running across the <run>.` The run is lower-case, in the
  sheet's own word.
- **Only where the re-store is accepted.** The note and button show only when
  `storedAsShape(board, cut, solids) !== cut`, so a cut §3.1's guard refuses shows neither.
- **A button, `Match the cut list`.** It applies `storedAsShape` through the row's existing `set()`
  as ONE `updateCut`, so it is one undo step and passes the row's existing refusals (which a
  same-geometry patch never trips).

After the click the row shows "Runs across" as the run, the stops along it and the position along
the other axis, and the note is gone.

- **Tenon shoulders get no note.** The sheet prints the tenon, not its shoulder cuts, so there is
  no sheet direction to match.
- **Held points.** `updateCut` already runs `dropHeldIfGone` after the edit (invariant 24, the
  "feature destroyed" clause). Since the geometry is the same, a held snap point on the cut
  survives. That is the existing rule working; this spec adds nothing to it. Two exceptions, both
  the same rule working: an OVERHANGING cut's snap points can change, because the re-store clips
  the overhang and `pointsOfCut` reads the unclipped `cutRegion`, so a point held on the overhang
  drops; and a far end §3.1 cannot store exactly moves by an ulp, so a point held there drops.

### 3.4 Rows

`cutSignature` reads stored fields (invariant 40), so a re-stored cut can split a row. Two
identical sides, one matched and one not, print as two rows with identical lines until both are
matched. That is the visible, harmless direction of `cutSignature`'s comment. Rows are not
regrouped by shape in this round.

## 4. Testing

- **The tie (`cuts.test.ts`):**
  - the square edge notch reads the same line in both storages;
  - a square closed pocket runs along the length in both storages;
  - a square corner opening runs along the length;
  - the cut-lines test that pinned "runs along the stored `across`" is replaced by these.

  Mutations: drop the one-open-end preference; prefer the axis with NO open end; use the later
  axis on the final tie.
- **`storedAsShape` (`cuts.test.ts`):**
  - for each case it gives the same clipped region (`cutRegion` clipped, compared per axis) and
    the same `cutShape` as the input;
  - its `across` is the run;
  - it returns the very same object for a cut already stored the way it runs, including a
    decimal one (offset 0.1, width 0.2);
  - re-storing a sideways cut drops overhang: the dado stored across the length with its width
    span hanging 1/2″ past the near edge comes back with stops 0 and 0.

  Cases: 192's housing (stored across the length, with the back rabbet), the two-storage dado,
  the stopped dado, the mortise and the edge notch.
- **Joinery (`pocket.test.ts` / `cutlines.recipe.test.ts`):**
  - the stopped-shelf bookcase's housings are now stored with `across: 'width'`, and their lines
    and drawings are unchanged (the cut-lines literals still pass);
  - every cut in the joined workbench, joined bookcase and stopped-shelf bookcase has
    `across === cutShape(...).run`;
  - the existing pose probes pass unchanged.
- **Properties (`Properties.test.tsx`):**
  - a sideways-stored cut shows the note naming the run, and the button;
  - clicking re-stores it: the select now shows the run, and the note and button are gone;
  - one undo restores the old storage;
  - a cut stored the way it runs shows neither;
  - a tenon shoulder shows neither.

  Mutation: show the note unconditionally; apply the patch without `across`.
- **Existing tests:** any changed expectation is listed with its reason in the task report.

## 5. Live check

On the dev server, with the user watching:
1. Import a stopped-shelf bookcase made BEFORE this round, or rebuilt with the old storage.
2. Its housing rows show the note and the button. Click **Match the cut list**: the row now reads
   Runs across: Width, and the sheet line is unchanged.
3. Undo once and the old storage is back.
4. Run **Add joinery…** on a fresh bookcase layout, without a model call, through a scratch
   document as before. Its housings arrive already matching, with no note.

## 6. Docs

- `docs/follow-ups.md`: close 195 and 196.
- `CLAUDE.md`:
  - the `cuts.ts` entry names `storedAsShape`;
  - the `pocket.ts` entry says joinery stores a cut the way it runs;
  - invariant 41 gets one sentence: `pocketFor`'s `across` is now the shape's run, through
    `storedAsShape`;
  - a rounds-table row and the test counts are added at merge.
- `docs/history.md`: the round entry, plus a browser-verification write-up.
