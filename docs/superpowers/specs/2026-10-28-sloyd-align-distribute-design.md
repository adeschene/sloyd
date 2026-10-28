# Sloyd — align and distribute

**Date:** 2026-10-28 · **Status:** approved by the user 2026-10-28; plan `docs/superpowers/plans/2026-10-28-sloyd-align-distribute.md`.

**Origin:** `docs/feature-gaps.md` §4, "Align / distribute" ("Equal shelf spacing etc.; copy in a row covers part of it"). The user
picked it on 2026-10-28 and asked for the spec without the brainstorm questions, so every choice below is Claude's call unless it is
marked as *the user's*. §10 lists those calls for checking.

## 1. Intent

Two jobs that today take arithmetic and typed positions:

- **Line parts up.** Make the fronts of three shelves flush with the front of a side. Stand four legs on the same floor. Centre a
  drawer front on its opening.
- **Space parts evenly.** Put five shelves at equal gaps between a bottom and a top that stay put. Spread three rails evenly along a
  frame.

Copy in a row makes NEW parts at a spacing. This round moves EXISTING ones.

**Goals**

- **Align:** with two or more items selected, move every item but the anchor along one world axis, so that its min face, centre or
  max face matches the anchor's.
- **Space evenly:** with three or more items selected, move the items between the two outermost along one axis, so that every gap
  between neighbours is equal.
- Both are exact (inv 25): never rounded to the grid, one undo entry, refused while exploded or mid-gesture.
- Items are what the selection holds: parts, or assemblies (an assembly moves whole).

**Non-goals (v1)**

- Aligning to a guide, a point, or the floor without a part there.
- Equal CENTRES (pitch). Spacing by a typed gap or pitch: Copy in a row already offers both for new parts. A follow-up for existing
  ones.
- Rotating or resizing anything.
- Aligning across levels (the selection is one level already, inv 42 and `selectionPatch`).
- A viewport handle or drag gesture for either.

**Anti-goals.** It would be a failure, even if it works, if:

- a result lands a hair off: rounded, accumulated drift, or a "flush" face 1e-12 proud that the checks read as a gap or overlap;
- the anchor moves;
- a refusal changes anything;
- one click makes several undo entries.

## 2. Items and their extents

- **The items** are `selectedIds` at the open level, in selection order. `selectionPatch` already keeps them to one level and drops
  hidden ones (inv 43).
- **An item's extent on an axis** is `partsBounds` over the world parts it covers (`isCovered`). This is the real extent: a leaning
  part's leaned box (inv 57 R2: never its pre-lean box), and an assembly's parts all together. It is the same extent Copy in a row and
  `moveGroupTo` read.
- **Axes are WORLD X, Y (up) and Z (+Z the front)**, as the Copy in a row directions are.

## 3. Align — the decision (`src/document/align.ts`, new, pure)

**The anchor is the FIRST item in `selectedIds`**: the one clicked first. It never moves. *Claude's call:* aligning to the
selection's bounds instead would move every item on a Centre align, and a woodworker aligning "to the side" means one particular
part.

For `edge` ∈ `min` | `centre` | `max` on axis `a`:
- the target is the anchor's `min[a]`, `(min[a] + max[a]) / 2` or `max[a]`;
- each other item's delta along `a` is `target − (its min[a] | its centre | its max[a])`, and its delta on the other two axes is
  exactly 0.

A delta of exactly 0 moves nothing. When every delta is 0, the action is a no-op: no edit, no undo entry.

## 4. Space evenly — the decision

On axis `a`, with `n ≥ 3` items:

1. **Order** the items by `min[a]`, then by `max[a]`, then by selection order. The first and last in that order stay put.
2. **The free space** is `F = last.min[a] − first.max[a] − Σ (inner items' sizes on a)`.
3. **The gap** is `g = F / (n − 1)`.
4. **Inner item k** (1-based in the order, 1 ≤ k ≤ n − 2) gets its new min directly from the FIRST item's max, never from a running
   position (inv 25's copy-in-a-row discipline): `newMin_k = first.max[a] + k·g + Σ_{j=1}^{k−1} size_j`. Its delta is
   `newMin_k − min_k`.
5. **Refusal:** when `g < −1e-9`, the inner items do not fit between the outer two. The sentence is
   `These parts don't fit between <first> and <last> along <X|Y|Z>.`, with the two names as the parts list prints them.
6. A gap within 1e-9 of 0 is legal (the parts butt).

*Claude's call:* the OUTERMOST two stay put. To space shelves in a carcase, select the bottom, the shelves and the top. The two
outer parts are the fixed ends, as in every drawing program.

## 5. The store — two actions, one edit each

- `alignItems(axis: 0 | 1 | 2, edge: 'min' | 'centre' | 'max')` and `distributeItems(axis: 0 | 1 | 2)` read the current selection.
- **The order inside each action:**
  - Refuse at entry while exploded (`readOnly()`, inv 47) or `gesturing`.
  - Refuse fewer than 2 items (align) or 3 (distribute). The panel never offers those (§6), but the action does not rely on it.
  - Compute every delta from ONE snapshot of the document (`align.ts`, pure). A refusal returns its sentence; nothing is written.
  - Write all moves in ONE `edit()`: for each item with a non-zero delta, `translateItems(doc, [id], delta)`, folded over the items.
    This is one undo entry (inv 4).
  - Then run `judgeHeld()` once (inv 24: anything that moves boards under a held point drops it), as `translateBoards` does.
- **Never rounded:** not to the grid, not in metric (inv 25 gains "align and space evenly" in its list of exact moves). Not via
  `moveGroupTo` (inv 42: that rounds a group's corner once; this is per item and exact).
- **A part inside a definition moves every copy** (inv 46), exactly as a Properties position edit does. A linked part's position is
  its own (`LINK_FIELDS`), so linking changes nothing here.

## 6. The panel

The multi-selection panel (`GroupProperties`) gains an **Align** section after the action bar:

```
 ALIGN                                  to <anchor name> (selected first)
   X   [Left]    [Centre]  [Right]
   Y   [Bottom]  [Middle]  [Top]
   Z   [Back]    [Centre]  [Front]
 Space evenly   [Along X]  [Along Y]  [Along Z]      (3 or more selected)
 <refusal sentence, when the last click was refused>
```

- The buttons sit inside `EditLock`: disabled while exploded.
- The `Space evenly` row shows only with three or more items.
- Each button's accessible name is unambiguous, e.g. `Align left (X)`, `Align top (Y)` and `Space evenly along Z`.
- The refusal shows as a `field-error` with `role="status"` until the selection or document changes, as the Link refusal does.
- *Claude's call:* a section of buttons, not a popover, because the panel is where the selection's other actions already live.

All copy is built in one module (`alignText.ts`, beside `align.ts`). It imports no `units`, because it carries no lengths.

## 7. What does not change

- No schema change; nothing new stored.
- The checks, joinery, cut list, Plans and Generate are untouched. A moved part is an ordinary position change.
- Copy in a row and the Move tool are unchanged.

## 8. Tests

Every expectation is computed by hand in the test, never by `align.ts`.

**`align.ts`**
- Align min, centre and max on each axis for three plain parts: the anchor's delta is `[0, 0, 0]`, and each other item's delta is
  the hand value, exactly (`toBe`).
- A leaning leg aligns by its leaned extent, not its pre-lean box. An assembly aligns by its parts' extent. A turned part (rotation
  90) aligns by its world extent.
- Every item already aligned gives every delta 0 (the store then writes nothing).

**Space evenly**
- Five shelves at uneven heights between a fixed bottom and top: every gap equal to 1e-12, the outer two at delta 0 exactly.
- Items selected out of order give the same result.
- Inner items too tall to fit give the refusal sentence, naming the outer two.
- A zero gap (the parts butt) is allowed.

**Store**
- One undo entry for an align that moves three parts. Undo restores every position exactly.
- A refusal writes nothing: no undo entry, the document the same object.
- Refused while exploded.
- A held tape anchor on a moved part is dropped; one on an unmoved part is kept (inv 24).
- A part inside a twice-placed definition moves in both copies.
- In a metric project, an off-grid result stays off-grid (not rounded).

**Panel**
- The section is present for 2+ selected. `Space evenly` is present for 3+ only. The anchor's name is shown.
- A click calls the action. A refusal shows its sentence.
- The buttons are disabled while exploded.

**Mutate**
- Round a delta to the grid: the exactness test must fail.
- Distribute by a running position: the 1e-12 equal-gap test must catch the drift on a fixture chosen to drift. The builder picks
  sizes whose running sum is inexact in binary, and proves the test fails.
- Move the anchor: the anchor test must fail.

## 9. Verification

On the dev server, build a carcase with sides, a bottom, a top and three shelves at uneven heights:
- select bottom, shelves, top, and choose Space evenly along Y; read the positions back and check the gaps by hand;
- select a side then the shelves, and choose Align front (Z); read the fronts.

Undo each and confirm the positions return. A DOM or store readout, with a screenshot of the panel.

Production: bundle hash, CSP and storage cleared. No paid runs.

## 10. Claude's calls, for checking

1. **The anchor** is the item selected FIRST, which never moves (not the selection's bounds).
2. **Space evenly** keeps the two OUTERMOST items fixed and makes equal GAPS (not equal centres). A typed gap or pitch is a
   follow-up.
3. **Extents** are the real world extents: a leaning part leaned, an assembly as a whole.
4. **Exact, never rounded,** with one undo entry. Refused while exploded or mid-gesture, and refused with a sentence when the parts
   don't fit.
5. **The UI** is a button section in the multi-selection panel, words per axis (Left/Right, Bottom/Top, Back/Front), showing which
   part is the anchor.
6. **Follow-ups:**
   - align to a guide or the floor;
   - equal centres;
   - spacing by a typed gap;
   - a viewport gesture.
