# Sloyd — hide and unhide parts

**Date:** 2026-10-05 · **Status:** approved in conversation, section by section
**Builds on:** the multi-select round (`selectedIds`, `selectionPatch`, invariant 42) and invariants
1, 16, 24 and 27. Every rule there still holds unless this document says otherwise.

**Second of three rounds the user asked for, in this order:** multi-select (shipped), hide/unhide,
then repeated parts.

## 1. Problem and goal

Every part is always drawn. To work on a shelf inside a cabinet, or the far side of a frame, a person
orbits around the parts in the way, or moves them and has to move them back.

**Goal:** a person can hide parts, so they are not drawn or touched, and bring them back. Hiding
changes only what is seen and touched in the 3D view. Nothing about the design itself changes.

**The user's rulings, made in conversation:**
- **View state, not saved.** Hidden-ness is not in the document and there is no schema change. It
  clears on reload or project switch.
- **Undoable** (asked for after the first draft). Ctrl+Z and redo step through hides and shows like
  any edit (§2.1).
- **Controls: all four offered.**
  - an eye toggle on each parts-list row;
  - **H** hides the selection;
  - **Show all**, as a key (Alt+H) and as a button;
  - **hide others**, as a key (Shift+H) and as a **Hide others** button in Properties.
- **A hidden part cannot be selected.** Hiding deselects. Ctrl/Cmd+A selects visible parts only. A
  hidden row's name in the parts list is inert, and only its eye works. So a move, delete or group
  edit never acts on a part the person cannot see.

## 2. The hidden set

**`hiddenIds: string[]`** is store state beside `selectedIds`.
- **View state**, like the selection: not in the document and not saved. **There is no schema
  change.** Rolling back costs nothing but the round. Unlike the selection, it IS in the undo
  history (§2.1).
- **Order is insertion order**, and there are **no duplicates**.

**Actions** (the store). These are the ONLY writers of `hiddenIds`:

| Action | Key | Does | With nothing to act on |
|---|---|---|---|
| `hideSelected()` | H | hides every selected part | does nothing with nothing selected |
| `hideUnselected()` | Shift+H | hides every part NOT selected | does nothing with nothing selected (otherwise it would hide everything) |
| `showAll()` | Alt+H | empties the set | does nothing |
| `setHidden(id, hidden)` | — (the eye) | hides or shows one part | — |

**Hiding deselects, and a hidden part can never be selected.** `selectionPatch`, the one writer of
the selection (invariant 42), drops every hidden id from any selection it writes. That makes the rule
structural rather than a convention at each caller: `selectBoard` or `toggleSelected` on a hidden id
selects nothing, `selectAll` selects visible parts, and every hide re-runs `selectionPatch` on the
current selection. That carries invariant 24's retargeting rule with
it: a held Move grab whose owner is hidden is dropped. A grab whose owner stays visible and selected
is kept.

**Hiding never changes the document.** No `edit()` runs, and the document object stays the same
object, so autosave does not fire for a hide.

### 2.1 Undo

**A history entry becomes `{ doc, hiddenIds }`** (today `past`/`future` hold bare documents).
- `edit()`'s snapshot records both. It is still the one place an edit's snapshot is taken.
- **Every hide or show that changes the set pushes exactly one entry**, holding the current
  document (the same object, no copy) and the set as it was before. It clears `future`, as any edit
  does. The cost, accepted by the user: a hide after an undo discards the redo list.
- **A hide or show that changes nothing pushes nothing**: H or Shift+H with nothing selected, Alt+H
  or Show all with nothing hidden, an eye that already matches. That is invariant 4's rule: no undo
  entry that undoes to nothing.
- **`undo` and `redo` restore both** the entry's document and its set. The set is filtered to the
  restored document's parts. A Ctrl+Z after H shows the parts again; after an edit it restores the
  set as it was when that edit was made. Because the set otherwise changes only through entries (and
  through a delete, which is itself an entry), that set is always what the person saw at the time.
  Undo never unexpectedly hides or shows anything.
- **The selection stays consistent.** After an undo or redo it keeps only parts that exist AND are
  visible in the restored entry, through `selectionPatch`. A redo that re-hides a selected part
  deselects it, and drops a Move grab it owned, exactly as the hide did.
- **Held points survive an undo or redo that moves nothing.** Today `undo` and `redo` clear
  `grabbed`, `tapeAnchor`, `tapeHover` and `tapeAxis` unconditionally, because a wholesale document
  rewrite can move any point (invariant 24). When the restored entry's document is the SAME object
  as the current one (the undo of a hide or show), nothing moved, so they are kept. Otherwise a
  Ctrl+Z after hiding a part would drop a tape measurement that the hide itself was forbidden to
  drop. A grab whose owner the restored set hides is still dropped, through `selectionPatch`.
- **The selection is still not undone.** H deselects, and Ctrl+Z brings the parts back unselected.
  Making the selection part of undo would change every undo, not only hides.
- **A hide is refused while a gesture is open** (`gesturing`, read inside the store action, never
  by a component: invariant 34). A hide pushes its own entry, so inside a gesture it would land
  between a drag's lazy snapshot (invariant 4) and the drag's later frames. The drag's tail would
  then belong to the hide's entry, and one Ctrl+Z would undo part of the drag with the hide (the
  shape of follow-up 209). In practice only a gizmo drag can be open when a hide arrives:
  - the keys are blocked in a text field;
  - pressing the eye or Hide others blurs any focused field first, which ends its gesture.

  So H or Shift+H pressed during a gizmo drag does nothing. Release, then press it.
- `replaceDocument` clears the history as it does today, the set with it.

**Reconciling with the document** follows the selection's rules (multi-select spec §2):
- `undo` and `redo` restore the entry's set, keeping only ids that still exist;
- `replaceDocument` (open, import, switch, autosave restore) clears the set, because a replaced
  document is a different project;
- `deleteBoard`/`deleteBoards` remove the deleted ids. An undo that brings a deleted part back
  therefore brings it back visible;
- a new part (`addBoard`) and a copy (`duplicateBoards`) are visible. A copy is made from the
  selection, and the selection is always visible.

**Invariant 24's prohibition extends to hiding.** No hide or show action may clear `tapeAnchor` or
`tapeHover`. Each holds a world position, and hiding moves nothing; measuring from a part and then
hiding it is legitimate. A tape hover latched on a part that is then hidden stays latched, because it
is a real position on a real part. An unlatched hover is re-picked on the next pointer move from
the filtered candidates.

## 3. What a hidden part is

**`visibleBoards(boards, hiddenIds)`** is the ONE filter, in the store layer (beside
`selectionGesture.ts`, because the viewport and the store both need it). Every reader below goes
through it. A second hand-written filter is a second decider for one question.

A hidden part is:
- **not drawn** (`Viewport`'s board meshes), so it cannot be clicked;
- **not a snap point,** in either tool:
  - the Move tool's grab candidates are selected parts, so hidden ones are excluded already;
  - its targets are filtered;
  - the Tape tool's candidates are filtered.

  A marker must sit on something drawn (invariant 16's rule);
- **never selected:** `selectAll` selects visible parts only;
- **not framed:** `Home` frames visible parts. With every part hidden, Home does nothing. `f` frames
  the selection, which is visible by construction.

A hidden part is **still fully part of the design**. The cut list, the sheet nesting, the diagrams,
joinery, Generate, `checkDesign`, export and autosave all read `doc.boards` unchanged.

The gizmo needs no change: it follows the selection, which never holds a hidden part.

## 4. The controls

### 4.1 Parts list

- **Row layout.** Each row is **[eye] [name]**.
  - The eye is a button labelled "Hide Leg A" or "Show Leg A", so the label carries the state.
  - Its icon is an inline SVG: an eye, or a struck-through eye when hidden. The app has no icon set.
- **A hidden row** stays in the list in document order. Its name is dimmed and its name button
  `disabled`. Only the eye works.
- **Visible rows** behave exactly as now (`selectByClick`: a plain click selects, Shift or Ctrl/Cmd
  toggles).
- **Show all (N)** is a button beside the Parts heading, rendered only while something is hidden.
  N is the hidden count, so an empty-looking model never reads as a bug.

### 4.2 Properties

**Hide others** (`hideUnselected`) sits beside Duplicate and Delete, in both the single-part panel
and the group panel. Isolating one part is as useful as isolating several. No separate Hide button:
the eye and H cover hiding.

### 4.3 Keys

**H, Shift+H and Alt+H** go in `App`'s ONE keydown effect (invariant 27). They inherit its guards:
nothing happens while focus is in a text field (`isTextEntry`) or a modal is open (`modalOpen`).

- **Plain H:** `e.key` is `h`, with no Ctrl, Meta or Alt.
- **Shift+H:** `e.key` is `H`, with Shift and no Ctrl, Meta or Alt.
- **Alt+H** matches the physical key, **`e.code === 'KeyH'`**, with Alt. On a Mac, Option+H types
  `˙`, so matching `e.key` would make the shortcut dead there. That is the same reason Backspace
  counts as Delete.
- **Ctrl/Cmd+H is left unbound.** On a Mac, Cmd+H hides the browser.

**During a gesture:**
- **H or Shift+H during a gizmo drag does nothing** (§2.1: a hide is refused while a gesture is
  open).
- **H while a Move grab is held** deselects the grabbed part, so the grab drops. It is not blocked
  the way Delete is (Delete refuses while a grab or a tape anchor is held), because dropping a grab
  loses nothing and moves nothing.

## 5. What does not change

- **The document and its schema:** no new field; the version stays `CURRENT_VERSION` 7.
- **Everything derived from the document:** the cut list, nesting, diagrams, joinery, Generate,
  design checks, storage and the project library.
- **Guides:** the Guides toggle is separate and unchanged. Guides are document points, not parts.
- **The Escape ladder:** Escape does not show hidden parts.

## 6. Testing

**Store (unit):**
- each action, including `hideUnselected` doing nothing with nothing selected;
- no duplicate ids;
- **hiding deselects**, asserted by effect: a grab owned by a part being hidden drops, and one owned
  by a visible selected part stays;
- **invariant 24's prohibition:** for each hide and show action, `tapeAnchor` and `tapeHover`
  survive;
- `selectAll` skips hidden parts;
- **undo (§2.1):**
  - H then Ctrl+Z shows the parts again, and redo hides them again;
  - each hide or show is exactly one entry, holding the same `doc` object;
  - a hide that changes nothing pushes nothing;
  - undoing an edit restores the set recorded with it;
  - the selection is not restored;
  - a hide during an open gesture is refused: nothing changes and no entry is pushed;
  - a hide clears `future`;
  - a redo that re-hides a selected part deselects it;
  - undoing a hide keeps `tapeAnchor`, `tapeHover`, `tapeAxis` and `grabbed`, while undoing an edit
    still clears them;
- `selectBoard` and `toggleSelected` on a hidden id select nothing;
- reconciliation:
  - undo and redo filter the restored set to surviving ids;
  - `replaceDocument` clears the set;
  - a delete removes the id;
  - a new part and a copy are visible;
- **hiding never changes the document:** the same `doc` object afterwards.

**The filter and the candidate sets (unit):** `visibleBoards`, and `moveCandidates` never offering a
hidden part as a target.

**Panels (RTL):**
- the eye's label flips between Hide and Show;
- a hidden row's name is disabled;
- Show all (N) appears only while something is hidden, with the right count, and shows everything;
- Hide others appears in the single and group panels and hides the rest.

**App (RTL):**
- H, Shift+H and Alt+H, including Alt+H delivered as `key: '˙', code: 'KeyH'`;
- each key ignored in a text field and with a modal open;
- Ctrl+H does nothing.

**Mutation-test every new test.** At least:
- skip the deselect in a hide (the grab test must go red);
- drop the target filter (the candidates test must go red);
- let `hideUnselected` hide everything when nothing is selected;
- drop the set from an undo or redo restore;
- push an entry for a hide that changes nothing;
- let a hide through while a gesture is open.

**Browser:** the r3f viewport has no unit tests by design. The live check is on the dev server, with
the user watching:
- hide a leg with its eye, then confirm it is gone, unclickable and not a snap target;
- H on a selection, then confirm Ctrl+A skips the hidden parts;
- Shift+H and the Hide others button;
- Alt+H and Show all;
- H then Ctrl+Z brings the parts back, and Ctrl+Shift+Z hides them again;
- the cut list still lists hidden parts;
- a tape anchored on a part survives hiding that part.

Nothing in this round depends on shaders, so follow-up 26a does not bear on it.
