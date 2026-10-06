# Sloyd — linked parts

**Date:** 2026-10-06 · **Status:** approved in conversation, section by section
**Builds on:**
- **Earlier rounds:** quarter turns (true per-part turns), copy in a row, multi-select
  (`selectionPatch`, group edits), and hide/unhide.
- **Invariants:** 2, 4, 8, 11, 24, 33, 40 and 42.
- **Precedence:** every rule there still holds unless this document says otherwise.

**Last of the three "repeated parts" rounds:** quarter turns (shipped), copy in a row (shipped),
linking.

## 1. Problem and goal

**The problem.** A piece usually has several identical parts: four legs, six slats, two sides.
Today each is independent. Changing the legs' length, or adding a mortise, means doing it four
times, and the parts drift apart.

**Goal.** Parts can be LINKED, so they stay identical. Editing one linked part's shared properties
edits them all. Each part keeps its own place and its own turn. This is SketchUp's components, made
simpler.

**The user's rulings, made in conversation:**
- **Copy and link are separate actions.** A link is made on existing parts.
- **Shared:** length, width, thickness, material, grain, posture and cuts.
- **Per part:** name, position and turn. For example, four linked legs share their mortises, and each
  is turned so its mortises face its own rails.
- **Linking parts that differ:** the FIRST SELECTED part wins. The others take its shared values.
- **Copies:** Duplicate and Copy in a row produce copies that JOIN the source's link.
- **Posture is shared.**

## 2. What a link is

**Data.** `Board.link?: string` is a minted label, for example `L3`. Parts with the same label are
one link.
- **A label held by one part only is cleared.** A link has at least two members.
- **Why a label and not a separate definition:** every part stays self-contained (its own dimensions
  and cuts). So the cut list, nesting, the viewport, joinery and `checkDesign` read parts exactly as
  today, and none of them change.
- **Invariant 33 still holds:** nothing in the document references a board by id. A label is not an
  id.

**One table decides shared versus own.** `LINK_FIELDS` maps every `Board` key to `'shared'` or
`'own'`, and `satisfies Record<keyof Board, 'shared' | 'own'>`. A new `Board` field therefore fails
`tsc` until it is classified (invariant 40's argument).
- **Shared:** `length`, `width`, `thickness`, `material`, `grain`, `posture`, `cuts`.
- **Own:** `id`, `name`, `position`, `rotation`, `link`.
- **Its readers:** linking, propagation and the load repair all read this table. None of them keeps
  its own list.

**`sameShared(a, b)`.** It is true when every shared field is equal.
- Cuts are compared in order, by `id` and by every `CUT_GEOMETRY_FIELDS` field, exactly.
- Values are compared exactly, as stored values (invariant 18).

## 3. Behaviour

### 3.1 Link

- **Where:** select two or more parts and choose **Link**, one undo entry.
- **The source:** the first part in `selectedIds`, which is in insertion order.
- **What the others take:**
  - the source's shared fields, cuts INCLUDING their ids (cut ids are per board, invariant 33, so
    identical ids across members are legal);
  - posture through `reorientedPosition`, so a part whose posture changes turns about its own centre
    (invariant 2);
  - **kept per part:** position (apart from that pivot) and turn.
- **The label.** Every selected part gets one label. If any selected part is already linked, the
  whole of each such link joins. That includes members that are not selected, and they also take the
  source's values. A fresh label is minted when none applies.
- **Held points.** After the edit, `dropHeldIfGone` runs for every part whose cuts or shape changed
  (invariant 24, point-precise).

### 3.2 Propagation

- **What propagates:** an edit to a shared field of a linked part, through any path, reaches every
  member of its link, as the SAME undo entry. Members that are hidden or unselected are included.
  The paths are:
  - `updateBoard` and `updateBoards` (Length, Width, Thickness, Material, Grain, Posture);
  - `addCut`, `updateCut` and `removeCut`.
- **What does not:** `name`, `position` and `rotation` edits, gizmo moves, snap moves and group moves.
- **Per-board rules still apply.** Each member goes through the same per-board rules a single edit
  does: its own min corner, its own reorient pivot, and the sheet-good grain reset.
- **Cuts.** `addCut` mints ONE new cut id and adds the same cut to every member.
  `updateCut(boardId, cutId)` and `removeCut(boardId, cutId)` act on that cut id on every member.
- **Held points.** `dropHeldIfGone` runs for every member touched.

### 3.3 Unlink

- **Unlink** clears `link` on the selected parts and keeps their current values. One undo entry.
- **A link left with one member dissolves:** its label is cleared. The same normalisation runs after
  Unlink, `deleteBoards`, and the load repair.

### 3.4 Copies

`duplicateBoards` and `copyInRow` copy `link` along with the rest (through the shared `copyBoard`
helper). So copies of a linked part are members of its link.

### 3.5 Load repair and schema

- **`CURRENT_VERSION` becomes 9.**
  - **The argument:** silent data loss on round-trip. A v8 build drops every `link`, autosaves, and the
    links are gone with nothing saying so. That is v6's argument for guides.
  - **The step:** document-level, so no per-board step is needed. An absent `link` means unlinked.
- **`validateBoard` keeps `link` only when it is a non-empty string,** and drops it otherwise. A bad
  link value never refuses the file.
- **After validation, `repairLinks`** walks each label in document order:
  - **members that differ:** the first member is the reference, and any member whose shared fields
    differ from it (`!sameShared`) is UNLINKED;
  - **one member left:** a label with one member is cleared;
  - **no geometry moves on load.**
- **Joinery's output.** Joinery cuts parts individually, so linked parts it cuts differently come out
  unlinked in the new joined project, through this same repair when that project is loaded. The
  original project is untouched.
  - The joined document is passed through `repairLinks` before it is saved, so the saved project is
    already consistent.

## 4. Controls

- **The group panel (2+ selected).**
  - **Link:** beside Duplicate, Hide others and Delete. It is shown unless every selected part is
    already in ONE link.
  - **The "will match" line:** when any selected part's shared fields differ from the source's, a line
    above the buttons reads `Linking makes N parts match <source name>: size, material, grain, posture
    and cuts.`, where N counts the parts that will change.
  - **Unlink:** shown when any selected part is linked.
- **The single panel, for a linked part.** A block under the name field:
  - `Linked with N other parts: edits to size, material, grain, posture or cuts change all N+1.`
  - **Select linked:** selects every VISIBLE member, through `selectionPatch`, which drops hidden ids.
  - **Unlink.**
- **The parts list.** A linked row shows a small inline-SVG chain icon after the name, with
  `aria-label="Linked, N parts"`.
- **Unchanged:** the viewport and the cut list. No new keyboard shortcut.

## 5. What does not change

- **Readers of a part:** the cut list, nesting, diagrams, the viewport, snapping, joinery's algorithm,
  Generate and `checkDesign` all read self-contained parts as before.
- **Generated designs** carry no links.

## 6. Testing

**Unit tests, every new one mutation-tested.**

- **The document layer.**
  - **`LINK_FIELDS` and `sameShared`:**
    - each shared field, flipped, makes it false;
    - own fields are ignored;
    - a cut differing in id or in any geometry field makes it false.
  - **`repairLinks`:**
    - a differing member is unlinked;
    - the reference is the first member in document order;
    - singletons are cleared;
    - geometry is unchanged.
  - **`validateBoard`:** drops a non-string or empty `link`.
  - **The version gate:**
    - `CURRENT_VERSION` is 9;
    - a v8 file loads with no links;
    - a version above 9 is refused.
- **The store.**
  - **Link:**
    - the first selected part wins;
    - position and turn stay per part;
    - a posture change pivots each part about its own centre;
    - cuts are copied with their ids;
    - a selection that includes an already-linked part merges that WHOLE link (unselected members
      included);
    - one undo entry.
  - **Propagation:**
    - length, material, grain and posture each reach every member, a hidden member included, as one
      undo entry;
    - addCut, updateCut and removeCut reach every member with the same cut id;
    - name, position and rotation do not propagate;
    - `updateBoards` on a group reaches the unselected members of the group's links.
  - **Unlink, and dissolving:**
    - Unlink keeps the values;
    - unlinking one of two dissolves the other;
    - deleting one of two dissolves the other.
  - **Copies:** `duplicateBoards` and `copyInRow` copies carry the link.
  - **Invariant 24:**
    - a tape anchor on another member's cut point is dropped when a propagated cut edit moves that cut;
    - an anchor on a box corner that did not move is kept.
  - **Undo** restores links and values.
- **The panels (RTL).**
  - Link is visible for 2+ parts that are not already one link, and hidden when they are.
  - The "will match" line appears only when the parts differ, and its count is right.
  - Unlink is visible when the selection holds a linked part.
  - The single-panel block shows its text; Select linked selects the members; Unlink works.
  - The parts-list chain icon carries `aria-label`.

**Browser.** The live check is on the dev server, with the user watching:
- link four turned legs, then add a mortise to one: all four get it, each facing its own rail;
- change one leg's length: all four change;
- unlink one leg, edit it, and the others don't follow;
- Copy in a row of a linked leg: the copies are linked;
- reload: the links persist;
- open a v8 project: it has no links and is unchanged;
- check the cut list.
