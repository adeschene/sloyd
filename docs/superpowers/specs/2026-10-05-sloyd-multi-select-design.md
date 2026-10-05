# Sloyd — multi-select

**Date:** 2026-10-05 · **Status:** approved in conversation, section by section
**Builds on:** v1's selection (`selectedId`), the snap-move round (the Move tool), the
selected-board grabs round (grab candidates narrowed to the selected board), and invariants 2, 3,
5, 8, 24, 25 and 27. Every rule there still holds unless this document says otherwise.

**First of three rounds the user asked for, in this order:** multi-select, then hide/unhide, then
repeated parts. Each gets its own spec, plan and implementation. This one is the foundation: the
other two act on a selection set ("hide the selected parts", "make the selected parts copies of
each other").

## 1. Problem and goal

Today exactly one part can be selected (`selectedId` in the store). Every operation acts on that
one part: Properties, the gizmo, Duplicate, Delete and the Move tool's grab candidates. Moving
four legs together, deleting a set of parts, or setting them all to 3/4in thick means doing it
four times, and it is easy to break a layout doing so.

**Goal:** a person can select several parts and, in one step each, move them together, delete or
duplicate them, and set their dimensions, grain or material.

**The user's rulings, made in conversation:**
- **Operations in scope:** move together (gizmo and Move tool), delete and duplicate, and edit
  shared properties. **Rotating or reorienting as a group is out of scope.**
- **Gestures in scope:** Shift-click and Ctrl/Cmd-click to toggle a part, and Ctrl/Cmd+A to select
  all. **Out of scope:** parts-list range select and box select.
- **Group Properties fields:** Length, Width, Thickness, Grain and Material. **Out of scope:** name,
  X/Y/Z, posture and turn, and cuts.

## 2. The selection model

`selectedId: string | null` is replaced by **`selectedIds: string[]`**.

- **View state only**, exactly as `selectedId` was: not saved, not undone, not in the document.
  **There is no schema change**, and rolling back costs nothing but the round.
- **Order is insertion order**, so anything that walks the selection is deterministic. There is
  **no "primary" part**: no operation in scope needs one, and keeping one beside the list would be
  two deciders for one fact.
- **No duplicates**: an id appears at most once.

**Actions** (the store):
- `selectBoard(id: string | null)`: replace the selection with `[id]`, or clear it with `null`.
  Its existing rules carry over (it drops a held grab whose owner is no longer selected).
- `toggleSelected(id)`: add the id if absent, remove it if present.
- `selectAll()`: every board, in document order.

Every existing writer of `selectedId` becomes a writer of `selectedIds` with the same meaning:
- `edit()`'s optional `selection` callback returns the new list (so `addBoard` selects `[new]`
  and a group duplicate selects the copies);
- `deleteBoard` removes the deleted ids from the list;
- `commitSnapMove` keeps the moved parts selected;
- `undo` and `redo` keep only the ids that still exist (today they keep `selectedId` only when it
  still exists). `replaceDocument` keeps clearing the selection, as it does today: a replaced
  document is a different project. *(Corrected 2026-10-05 from the code while planning.)*

## 3. Selecting

**Viewport** (`Viewport.tsx`, `BoardMesh.tsx`):
- A plain click on a part selects just that part (`selectBoard`).
- A click with Shift, Ctrl or Cmd (Meta) held toggles that part (`toggleSelected`). The mesh's
  existing no-drag check (`CLICK_DRAG_SLOP_PX`) still decides what counts as a click. `onSelect`
  gains the modifier, read from the pointer event.
- A click on empty space clears the selection **only when no modifier is held**, so a slightly
  missed Shift-click does not wipe a selection built up over many clicks. This is still gated to
  the Select tool, as `onPointerMissed` is today.
- Every selected part draws as selected.
- `f` frames the whole selection; with nothing selected it does nothing, as today (`Home` frames
  everything). *(Corrected 2026-10-05 from the code while planning.)*

**Parts list** (`PartsList.tsx`): the same rules (plain click selects one; Shift or Ctrl/Cmd toggles),
and every selected row is marked selected.

**Ctrl/Cmd+A** selects every part. It lives in `App`'s ONE keydown effect (invariant 27), so it
inherits that effect's guards:
- it does nothing while focus is in a text field (`isTextEntry`), where Ctrl+A must select text;
- it does nothing while the cut list or a dialog is open (`modalOpen`).

It calls `preventDefault` so the browser does not select the page's text.

**Invariant 24, carried over:**
- **The retargeting rule, applied to a set.** A held Move grab (`grabbed`) is dropped whenever its
  owner leaves `selectedIds`. `commitSnapMove`'s refusal guard becomes "the grabbed owner is not in
  `selectedIds`".
- **The prohibition holds unchanged:** no selection change (`selectBoard`, `toggleSelected`,
  `selectAll`, or `edit()`'s selection callback) may clear `tapeAnchor` or `tapeHover`. The store
  tests that pin this are extended to the new actions.

## 4. Operating on the selection

### 4.1 The gizmo

With one part selected, nothing changes.

With two or more selected:
- **One gizmo**, placed at the centre of the selection's bounding box.
- **A drag moves every selected part by the same delta.**
- **Snapping.** The drag rounds the **group's min corner** to `SNAP_INCHES` (1/16in) and applies
  the resulting delta to every part. Parts' positions relative to each other are preserved
  **exactly**, even for a part that sits off the grid. This is invariant 25's rule: round what a
  free drag produced, and touch nothing that is already an exact position or a difference of two.
- **One drag is one undo entry** (the existing gesture coalescing).
- **The move patches `position` only**, so invariant 2's reorient predicate correctly fails: a
  group move translates, never turns.
- **Invariant 3's `dragging` guard is unchanged**: the proxy is not re-synced from the document
  mid-drag.
- **The size clamp (invariant 10)** sizes the gizmo against the group's bounding box rather than a
  single board's.

### 4.2 The Move tool

- **Grab candidates** are the snap points of **every** selected part. Today they are the selected
  part's only.
- **Targets** are the snap points of every part that is **not** selected, plus guides. A selected
  part cannot be a target, because it moves with the grab.
- **The drop** translates every selected part by the exact grab-to-target delta, with no rounding
  (invariant 25), as one undo entry.
- `grabbed` stays a `BoardSnapPoint` (invariant 26). Its owner is one of the selected parts.
- The Toolbar's "Select a part to move" hint still shows when nothing is selected.

### 4.3 Delete and Duplicate

**Delete.** The Delete/Backspace key and Properties' Delete button remove **every** selected part,
as one undo entry. The key's existing guards still apply: nothing is deleted while a part is grabbed
or the tape is anchored.

**Duplicate.** Properties' Duplicate copies **every** selected part, as one undo entry.
- Each copy is made **in place, exactly as a single duplicate is today**: same position, same
  dimensions, same cuts with fresh cut ids. The group's layout is therefore trivially kept.
- Every copy's name goes through `uniqueName` against the document as it grows during the
  duplicate, so copies cannot collide with each other (invariant 8).
- The copies become the selection.

### 4.4 Properties with two or more selected

- **A heading** reads "N parts selected".
- **The fields are** Length, Width, Thickness, Grain and Material, plus the Duplicate and Delete
  buttons.
- **No name, X/Y/Z, posture, turn or cuts.**
- **Shared versus mixed.** A field shows the shared value when every selected part has the same
  one. Otherwise it is empty, with a `mixed` placeholder; a select shows a disabled `mixed`
  option.
- **An edit applies to every selected part, as one undo entry.**
  - Each part keeps its own min corner, exactly as a single dimension edit does.
  - A dimension change that also needs a reorient pivot gets it from `reorientedPosition` per part,
    against that part's own post-patch extents (invariant 2).
  - A grain change goes through the same path the single field uses.
- **DimensionField's refusal of out-of-range input** applies to the typed value as a whole. If it
  is out of range for any selected part, it is refused for all, and nothing is written.

**THE TRAP: a mixed field must never write on an untouched blur (invariant 5).**
- A `mixed` field that takes focus and loses it without a keystroke writes **nothing**. Committing
  it would set every part to one value, silently, with no sign on screen.
- The same goes for a mixed select that is focused and blurred without a change.
- This gets its own test, and that test is mutation-tested: make the blur commit, and the test
  must go red.

When the selection changes while a group field holds a draft, the field resyncs from the new
selection, the same rule invariant 5 states for an external change.

## 5. What does not change

- **The document.** There is no schema change. The cut list, nesting, diagrams, joinery,
  generation, storage and the project library are untouched.
- **The Tape tool**, except that selection changes must not clear its held points (§3).
- **Cut editing**, which stays single-part.
- **The Escape ladder** (grabbed → tapeAxis → tapeAnchor → tool). Escape does not clear a
  selection.

## 6. Testing

**Unit tests (store):**
- the three actions;
- the no-duplicates rule;
- undo, redo and `replaceDocument` filtering the selection to surviving ids;
- a group delete and a group duplicate as one undo entry each, with copy names unique;
- a group snap move as one undo entry, translating every selected part by the exact delta;
- the grab-drop rule when its owner is toggled out;
- invariant 24's prohibition for each new action;
- the gizmo's group-move store path, with the min-corner rounding and the relative layout
  preserved exactly.

**Unit tests (Properties):**
- the group heading and fields;
- the shared and mixed display;
- an edit applying to all parts as one undo entry;
- refusal when the value is out of range for any part;
- **the untouched-blur test on a mixed field, mutation-tested.**

**Unit tests (App):** Ctrl/Cmd+A selects all, and does nothing in a text field or with a modal open.

**Browser:** the r3f viewport has no unit tests by design. The live check is on the dev server
with the user watching, and needs no paid calls. It covers:
- Shift/Ctrl-click selection in the viewport and the parts list;
- a missed modified click keeping the selection;
- the group gizmo drag;
- a group Move-tool snap;
- `f` framing the selection.

Remember 26a: software GL here does not match real hardware on undefined shader behaviour. Nothing
in this round depends on shaders.
