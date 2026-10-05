# Sloyd — copy in a row

**Date:** 2026-10-05 · **Status:** approved in conversation, section by section
**Builds on:** multi-select (`selectedIds`, `selectionPatch`, `duplicateBoards`, `boardsBounds`),
quarter turns (round 1 of repeated parts), and invariants 5, 8, 24, 25 and 42. Every rule there
still holds unless this document says otherwise.

**Second of three rounds that make up "repeated parts":** quarter turns (shipped), copy in a row,
then linking.

## 1. Problem and goal

**Today.** Making a row of identical parts (slats, shelves, balusters, legs) means duplicating one
part at a time and typing each copy's position. That is slow, and it is easy to mis-space.

**Goal.** In one step, make N ordinary copies of the selection along an axis, spaced the way the
person thinks about the row.

**The user's rulings, made in conversation:**
- **Copy and link are separate actions.** Copies are ordinary, independent parts; linking them is
  round 3.
- **All three spacing modes:** gap between parts, centre-to-centre pitch, and fit N across a distance.
- **Direction:** ±X, ±Y or ±Z.
- **The count is the total in the row,** the original included.
- **Controls:** an inline form in Properties (approach A). Rejected: a dialog, and dragging in the
  viewport.

## 2. What a row is

**What is copied.** The current selection, one part or a group, copied as a UNIT.
- **`s`** is the unit's extent along the chosen axis: `boardsBounds(selected).max[axis] − .min[axis]`.
- **The copies.** For k = 1 … N−1, copy k is every selected part shifted by `k × step × sign` along
  the axis.
- **No drift.** Each copy's position is computed from the ORIGINAL position, never by adding a step to
  the previous copy.

**The three modes** (`rowLayout`, §4):

| Mode | Step | Gap shown | Refused when |
|---|---|---|---|
| Gap `g` | `s + g` | `g` | `g < 0` |
| Pitch `p` | `p` | `p − s` | `p < s` |
| Fit across `D` | `(D − s) / (N − 1)` | `(D − N·s) / (N − 1)` | `D < N·s` |

**Spans and counts.**
- **Fit's span is measured outer to outer:** from the original's start face to the last copy's far
  face, in the chosen direction.
- **Row length** (in the summary) is `s + (N − 1) × step`.
- **Count** is a whole number from 2 to 100. Anything else is refused. The cap catches a typo.

**No rounding.** The step comes from values the person typed, so it is never rounded to
`SNAP_INCHES` (invariant 25's rule). A fit that works out to an odd gap keeps it exactly, and only the
display rounds.

**The copies.** They are made exactly as Duplicate makes them (`duplicateBoards`):
- fresh ids and fresh cut ids;
- names through `uniqueName` against the growing list (invariant 8);
- the same turn, posture, material, grain and cuts;
- copied position arrays.

**Undo and selection.**
- The whole row is **one undo entry** (one `edit()`).
- Afterwards the selection is the **original parts followed by the copies,** in order, through
  `edit()`'s selection callback, so through `selectionPatch` (invariant 42).
- A held Move grab owned by an original part survives, because it stays selected.
- The tape's held points are untouched (invariant 24).

**Other parts are not considered.** A copy that would overlap another part is made anyway, and the
design checks report it as usual.

**Hidden parts.** A hidden part is never selected, so it is never copied. The copies are visible.

## 3. The form

**The button.** **Copy in a row…** sits beside Duplicate in both Properties panels, the single-part
one and the group one. It opens an inline form under the buttons.

**The fields, in order:**
1. **Count.** A number input, whole numbers 2-100, default 2. An inline error shows when it is
   refused.
2. **Direction.** A select: **+X, −X, +Y (up), −Y (down), +Z, −Z**. Default +X.
3. **Spacing.** Three radio buttons: **Gap**, **Pitch**, **Fit across**. Default Gap.
4. **The measurement.** One `DimensionField`, labelled for the mode (**Gap**, **Pitch** or
   **Across**). It parses fractions and millimetres, refuses out-of-range entries, and Enter commits
   and blurs (follow-up 212).
   - **Gap** accepts 0 (`min={0}`).
   - **Pitch** and **Across** must be positive.
   - **Default value:** 0 for Gap, `s` for Pitch, `2·s` for Fit across.
5. **The summary line,** updated as the values change.
   - **When the layout works:** for example `4 in the row: 3 copies, gap 1/2", row 22-1/2" long`.
   - **When it is refused:** the reason. For example `Not enough room: 8 parts need 24", the span is
     20"`.
6. **Apply and Cancel.**
   - Apply is disabled while the summary shows a refusal.
   - Apply runs `copyInRow` and closes the form.
   - Cancel closes it.

**Form state.**
- **The form's values are local React state.** Nothing touches the document until Apply, and Cancel
  leaves no undo entry.
- **A selection change closes and resets the form.** The form is keyed on `selectedIds.join('|')`,
  the same keyed reset `GroupProperties` uses.

**Not this round:**
- a ghost preview in the 3D view;
- a keyboard shortcut;
- remembering the last settings.

## 4. Units

- **`rowLayout(mode, value, s, count)`.**
  - **Where:** a new pure module, `src/document/row.ts`.
  - **Returns:** `{ ok: true, step, gap, length }` or `{ ok: false, reason }`.
  - **One source:** the summary line and the store both use it, so the numbers shown are the numbers
    applied.
- **`copyInRow(ids, count, axis, sign, step)`.**
  - **Where:** a store action.
  - **It refuses without writing** (no `edit()`, no undo entry) when:
    - fewer than 2 or more than 100 are asked for;
    - `step` is not finite or not positive;
    - no id names a part.
  - It does not re-derive the mode; the caller has already run `rowLayout`.

## 5. What does not change

- **The schema and the document format.** No schema change.
- **Duplicate, the cut list, joinery, Generate and storage.**

## 6. Testing

**Unit tests, every new one mutation-tested.**

- **`rowLayout`.**
  - Each mode's step, gap and length.
  - **Boundaries:**
    - gap 0 is accepted and −1/16 refused;
    - pitch `= s` is accepted and `< s` refused;
    - fit `D = N·s` gives gap 0 and is accepted, and `D < N·s` is refused;
    - count 1, count 101 and count 2.5 are refused.
  - **Exactness:** `fit` with `D = 30`, `s = 0.75`, `N = 7` returns step `(30 − 0.75) / 6` exactly,
    not rounded.
- **`copyInRow`.**
  - **Placement.** Each copy's `position[axis]` equals `original + k × step × sign`, computed per
    copy. Pin it with a step like 0.1, where a cumulative sum drifts. Other axes are unchanged.
  - **Groups.** A two-part group keeps its exact relative layout in every copy.
  - **Directions.** −X, +Y and −Z.
  - **The copies.** Names are unique and cut ids fresh; turn, posture, material and cuts are carried
    over.
  - **Undo and selection.** One undo entry. The selection is the originals then the copies.
  - **Refusals** write nothing (the same `doc` object, `past` unchanged).
  - **Invariant 24.** A tape anchor survives.
- **Properties (RTL).**
  - **The form.** The button opens it; the summary updates as values change; Apply is disabled on a
    refusal; Apply makes the row and closes the form.
  - **Cancel** adds no undo entry.
  - **Selection change.** It closes and resets the form.
  - **The group panel** has the button too.

**Browser.** The live check is on the dev server, with the user watching:
- 8 slats, gap 1/2in, along +X;
- 3 shelves fitted across a height, going +Y;
- a leg copied at a pitch along −Z;
- a leg-and-rail group copied as a unit;
- one Ctrl+Z removes the row;
- the cut list shows the quantities.

No shader changes, so follow-up 26a does not apply.
