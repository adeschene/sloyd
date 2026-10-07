# Sloyd — assemblies (round 1 of components)

**Date:** 2026-10-06 · **Status:** approved; shipped 2026-10-06 (merge `699cc45`, schema 10). Implementation amendments are in the last section.
**Builds on:**
- **Earlier rounds:** linking (`Board.link`, schema 9), quarter turns (`axisFrame`, invariant 44),
  copy in a row, hide/unhide, multi-select (`selectionPatch`).
- **Invariants:** 2, 4, 8, 23, 24, 25, 33, 42, 43, 44 and 45.
- **Precedence:** every rule there still holds unless this document says otherwise.

**First of two rounds.** Round 1, this one: assemblies, a real definition/instance tree in which every
definition has exactly one instance. Round 2: components, the same tree with a definition shared by
several instances (linked copies, Make Unique), and today's links migrated into it.

## 1. Problem and goal

**The problem.** Linking keeps PARTS identical, but a piece is built from assemblies. A drawer is
two sides, a front, a back and a bottom. To duplicate it, move it or turn it, you have to select five
parts every time, and nothing records that they belong together.

**Goal.** Parts can be grouped into ASSEMBLIES, assemblies can nest, and an assembly is selected,
moved, turned, duplicated and hidden as one thing. You edit inside it by opening it, as in SketchUp.

**Research (summary).**
- SketchUp, Fusion 360 and Onshape all model this as definitions placed by instances. Each instance
  carries its own transform, and its contents live in the definition's frame.
- SketchUp's group is a definition used once; Fusion's "Paste New" is a copy with its own definition.
- OpenCutList, the woodworking cut-list plugin for SketchUp, lists the LOWEST-level parts and groups
  them by definition. Sloyd's cut list already works from leaf parts, so assemblies change nothing
  about what is bought or cut.

**The user's rulings, made in conversation:**
- **Model A:** a real definition/instance tree, not labels laid over flat parts. This reverses the
  linking spec's §2 argument ("a label and not a separate definition"). It holds for one level and not
  for nesting, where the propagation and the repair would both have to be recursive.
- **Two rounds:** assemblies first (Duplicate makes an INDEPENDENT copy), components second.
- **Clicks follow SketchUp:** a click selects the outermost assembly; a double-click opens it.
- **Names are unique per level,** not across the document.
- **Part links keep working across the tree in round 1** (§7).

**Out of scope, deliberately:**
- **Scaled instances.** They make the cut list lie, and they cause real confusion in SketchUp cut lists.
- **Mirrored instances.** Left and right cabinet halves are useful, but they depend on follow-up 215
  (which hand each posture has). A later round.
- **Free rotation.** An instance turns in quarter turns about the vertical, like a part.
- **Dragging items between assemblies** in the parts list. Ungroup and regroup does that job.
- **A cut list organised by assembly** ("Drawer ×3"). Phase 3.
- **Shared definitions, linked copies and Make Unique.** Round 2.

## 2. Data model

```ts
interface SloydDocument {
  // ...every existing field, unchanged
  boards: Board[];             // the ROOT's parts, exactly as today
  instances: Instance[];       // the root's assemblies
  definitions: Definition[];   // document-wide, referenced by id
}

interface Definition {
  id: string;
  boards: Board[];             // positions and turns in THIS definition's frame
  instances: Instance[];       // nested assemblies, also in this frame
}

interface Instance {
  id: string;
  name: string;
  definition: string;          // a Definition id
  position: [number, number, number];  // the frame's ORIGIN in the parent frame, NOT a min corner
  rotation: Rotation;          // 0 | 90 | 180 | 270, about the vertical through the origin
}
```

- **The root is an implicit definition** (its `boards` and `instances` live on the document). A
  document without assemblies is today's document plus `instances: []` and `definitions: []`.
- **A part inside a definition is an ordinary `Board`** whose `position` and `rotation` are in that
  definition's frame. Invariant 2 still holds there: `position` is the part's min corner, in the
  definition's frame.
- **An instance places its definition's frame in its parent:** first a turn about the vertical
  through the frame origin, then a translation by `position`. Every turn is a true quarter turn
  (invariant 44), so turns compose by addition mod 360, and a flattened part is always a valid `Board`.
- **The frame never moves on its own.** Editing the contents never shifts the origin or any other part
  (SketchUp's behaviour). `Instance.position` is an origin, not a min corner. An instance is a
  different kind of object from a part, and invariant 2 stays a rule about parts.
- **Where a new frame starts.** A new assembly's frame has origin `[0, 0, 0]` and turn 0 in its
  parent's frame, so every child's local values equal the values it had in the parent, BIT FOR BIT
  (§4.1). Nothing ever sees the origin: the gizmo, the turn pivot and Home all use the world box.

### 2.1 One flattening, one composition step

- **`composeStep(parentFrame, instance)`** is the ONE home of the instance transform. It gives a
  child's frame, and it maps a child's `Board` from the instance's frame into the parent's. It reuses
  `axisFrame`'s turn table (invariant 44). Nothing else writes this arithmetic.
- **`worldParts(doc): Board[]`** walks the tree from the root, applying `composeStep` down each path.
  Each result is a self-contained world `Board`:
  - `id`: the occurrence id (§2.2);
  - `name`: the part's OWN name, never the display path. Properties' name field and its dedupe read
    it, so a path name there would be typed back into storage (amended 2026-10-06, see §10);
  - `rotation`: the sum of the turns on the path plus the part's own, mod 360;
  - `position`: the world min corner of the turned box;
  - every other field copied, cuts included.
- **Order:** root parts in document order, then each root instance in order, depth first; inside a
  definition, its parts before its nested instances. `repairLinks`' "first member" and nesting's
  tiebreak both read this order.
- **`worldParts` is pure, and it returns the SAME array for the same document object** (a `WeakMap`
  cache keyed on the document), and the document's own `boards` array when there are no instances.
  So a `useStore` selector over it returns a stable value (invariant 43's selector rule).
- **`flatDocument(doc)`** is the document with `boards: worldParts(doc)`, every name replaced by its
  display path, and empty `instances` and `definitions`. It is what the cut list and joinery read.
  The path names are built HERE, in the document layer, so the string the cut list measures is the
  string it draws (invariant 19's third clause).
- **Every reader of a placed part reads `worldParts` or `flatDocument`** (§6). None of them walks the
  tree itself.

### 2.2 Ids

- **Occurrence id:** the path of instance ids down to a part id, joined by `/`. For example
  `i3/i7/b12`. A root part's occurrence id is its plain id (`b12`), so flat documents keep every id
  they have today. An assembly is addressed by its instance path, for example `i3`.
- **Scope (invariant 33, restated):**
  - part and instance ids are unique WITHIN their definition (the root counts as one), and are
    checked together in one `seen` set;
  - definition ids are unique across the document;
  - cut ids stay per board.
  Together these make every occurrence id unique. Round 2 needs exactly this scope, because one
  definition's parts then appear in several occurrences.
- **`/` is reserved.** A part or instance id containing `/` is re-minted on load through `takeId`.

### 2.3 Names (invariant 8, restated)

- **A name is unique among its siblings:** the parts and instances of one definition (or of the root),
  checked together. `uniqueName` and `dedupeNames` take the sibling list. The four enforcement points
  stay (adding, duplicating, the name field, `migrateDocument`) and gain Group and Ungroup (§4).
- **The display path joins instance names and the part name with ` › `.** Siblings are unique, so
  paths are unique too.
- **A new instance is named `Assembly N`,** unique among its siblings.

### 2.4 Load repair

These run in `migrateDocument` before anything else reads an id, in this order:
1. **Duplicate definition id:** the first definition in document order keeps the id. A later one is
   dropped, because every reference already resolves to the first.
2. **An instance naming a missing definition** is dropped.
3. **Cycles:** walking from the root, an instance whose definition is already on the current path is
   dropped.
4. **Round 1 only, a definition referenced twice:** the second reference, in walk order, gets a copy of
   the definition under a fresh id. It is round 1's stand-in for a shared definition. A round-2 file
   never reaches it, because the version gate refuses that file first.
5. **An unreferenced definition** is dropped. Delete and Ungroup prune the same way (§4).
6. **Ids within each definition, then names within each definition** (§2.2, §2.3).
7. **`repairLinks`** on the flattened parts, writing its unlinks back (§7).

**Why the two-pass rewrite invariant 33 warned of is not needed.** References point only at
definition ids. A duplicate definition id is resolved by dropping, never by re-minting, so no
reference ever has to be rewritten.

### 2.5 Schema 10

- **`CURRENT_VERSION` becomes 10.**
- **The argument:** silent data loss on round-trip, stronger than v6's or v9's. A v9 build opening a v10
  file drops `instances` and `definitions`, so every part inside an assembly VANISHES. It autosaves,
  and those parts are gone.
- **The step:** document-level. Absent `instances` and `definitions` default to `[]`. There is no
  `rawBoards.map` step, and no file needs upgrading.
- **Validation:** `validateInstance` drops an instance with no id, a missing or non-string
  `definition`, or a non-finite position. A bad rotation falls back to 0, as `validateBoard`'s does.
  A malformed definition is dropped with its references (step 2). A saved document must always open.
- **Rollback costs v10 documents; export first.**

## 3. Selection and the open assembly

### 3.1 State

- **`openPath: string | null`:** the instance path being edited inside, or `null` at the top level.
- **It is view state:** not saved, and NOT undoable (as in SketchUp).
- **`restore` (undo/redo) and `replaceDocument` reconcile it** to the deepest prefix that still
  exists (`null` after a replace).
- **The selection and the hidden set hold occurrence ids or instance paths.**

### 3.2 What a click selects

- **`pickTarget(occurrenceId, openPath)`** (pure, store layer, beside `selectionGesture.ts`) maps a
  clicked part to its ancestor ONE LEVEL BELOW the open assembly:
  - with nothing open, a click on a drawer side selects the drawer (`i3`);
  - with the drawer open, the same click selects the side (`i3/b12`);
  - a part outside the open assembly gives `null` (§3.3).
  The viewport and the parts list both call it.
- **`selectionPatch` stays the ONE writer (invariant 42).** Beside the hidden filter it gains a second
  structural filter: it drops any id that is not a direct child of the open assembly. Do not move
  this filter out to the callers (invariant 43's reasoning).
- **Shift/Ctrl-click, Ctrl/Cmd+A and Delete** work as now, on the open level.

### 3.3 Opening and closing

- **Double-click** an assembly with the Select tool to open it, with nothing selected. Each
  double-click opens one level.
- **Escape** closes one level. It is the LAST rung of the existing ladder: grabbed → tapeAxis →
  tapeAnchor → tool → close.
- **Clicking a part outside the open assembly** closes up to the level that contains it and selects
  it there.
- **Clicking empty space** clears the selection, as now, and keeps the assembly open.
- **While an assembly is open, everything outside it:**
  - is drawn faded;
  - cannot be selected;
  - IS still a Move target and a tape target, so a side can be aligned to the cabinet.
  The fade is a material change in `BoardMesh` keyed on a prop. It is not a second list of parts.
- **Opening and closing push nothing onto the history,** and they clear no held points.

### 3.4 Hidden parts

- **A part is hidden when it, or any instance on its path, is in `hiddenIds`.** `visibleBoards`
  stays the one filter (invariant 43) and gains that ancestor test.
- **H and Shift+H act on the open level.** Alt+H and Show all clear everything, as now.

### 3.5 The parts list

- **It becomes a collapsible tree:** an instance row has a caret, its name and an eye; a part row is as
  today. Collapse state is local view state.
- **Clicking a row nested inside a closed assembly** opens its parent and selects the row, through
  `selectionPatch`.
- **Show all (N)** counts hidden ids, as now.

## 4. Actions

### 4.1 Group and Ungroup

- **Group** (Ctrl/Cmd+G, or **Group** in Properties) takes 1+ selected items at the open level, parts
  and assemblies alike. It does five things:
  1. makes a new definition holding those items, with their values UNCHANGED, because the new frame
     has origin `[0, 0, 0]` and turn 0 (§2);
  2. puts one instance in their place, named `Assembly N`;
  3. dedupes names: the moved items' names are already unique among themselves, and only the new
     instance's name is checked against the remaining siblings;
  4. selects the new instance;
  5. re-keys `hiddenIds` and the tape's held points to their new occurrence ids (§5.4).
  Grouping assemblies is how nesting happens. One undo entry.
- **Ungroup** (Ctrl/Cmd+Shift+G, or **Ungroup** in Properties) works on each selected instance:
  1. it maps the children into the parent's frame with `composeStep`, the same arithmetic
     `worldParts` uses. The instance's direct child PARTS come out BIT-IDENTICAL. A nested instance's
     frame is folded into one step, so the parts below it are placed as `o1 + (o2 + p)` instead of
     `(o1 + o2) + p`: exact when the ungrouped frame is the identity or the values are dyadic, and
     otherwise within float rounding (amended 2026-10-06, see §10);
  2. it dedupes their names against their new siblings;
  3. it prunes the now-unreferenced definition;
  4. it selects the children;
  5. it re-keys hidden ids and held points.
  One undo entry.
- **Neither moves anything in the world.** Group is exact, bit for bit. Ungroup is exact for direct
  child parts and within float rounding below them. §8 tests both against the document BEFORE the
  action.

### 4.2 An assembly selected

- **Move.** The gizmo and group moves follow invariant 42 unchanged: the selection's world box min is
  rounded once, and ONE world delta results. **Every move carries a delta, never an absolute
  position:** the world delta is rotated into each item's CONTAINER frame (a quarter turn only swaps
  and negates axes, so this is exact) and added to the item's stored `position` (a part) or origin (an
  instance). For a root item that is today's arithmetic exactly. Snap Move translates the same way,
  unrounded (invariant 25), and so does Copy in a row's step (amended 2026-10-06, see §10). While an assembly is
  selected, the Move tool's grab candidates are all the points of the parts under it.
- **Turn** 0/90/180/270 in Properties, about the instance's world-box centre, through one new helper,
  `turnInstance`, the instance counterpart of `reorientedPosition` (invariant 2). It works on a single
  instance only, as a part's turn does.
- **Duplicate** makes an INDEPENDENT copy: a new definition (recursively, so nested definitions are
  copied too), fresh instance and part ids within it, and a name unique among the siblings. A copied
  part carrying a `link` joins it and keeps its cut ids (invariant 45).
- **Copy in a row** makes N−1 independent copies, copy k at `original + k·step·sign` from the
  ORIGINAL (invariant 25), and the step comes from the selection's world box. One undo entry.
- **Hide, Hide others and Delete.** Delete prunes definitions no longer referenced.
- **Properties for an instance:** name, Turn, Duplicate, Copy in a row, Hide others, Delete, Ungroup.
- **A mixed selection** (parts and assemblies): move, delete, duplicate, hide and Group work. Length,
  Width, Thickness, Grain and Material show only when every selected item is a part. Link (invariant
  45) applies to parts only, so it is offered only when every selected item is a part.

### 4.3 Adding a board

**Add board** while an assembly is open adds the board inside that definition. Its name is unique
among that definition's items, and it is selected.

## 5. The store

### 5.1 `editParts`

`editParts(doc, occurrenceIds, fn)` is the one way a part inside an assembly is edited:
1. it resolves each occurrence to its definition, its part and its composed frame;
2. it calls `fn` with the WORLD `Board`s;
3. it maps each result back into its definition's frame.

`fn` is the existing per-part code, unchanged: `patchBoard`, the `reorientedPosition` pivot
(invariant 2), the sheet-good grain reset, cut actions and link mates. Every existing rule keeps running
in the space it was written for. A root part's frame is the identity, so a flat document goes through
exactly today's arithmetic. Round 2 changes only `editParts`.

### 5.2 Only changed fields go back

- **Mapping a value into the world and back is not bit-exact:** `(t + a) − t ≠ a` for a non-dyadic `a`.
  So `editParts` writes back ONLY fields `fn` changed. Primitives compare by `!==`; `position`
  compares ELEMENT BY ELEMENT, because a fresh array with equal values is not a change; `cuts` by
  reference (every cut writer builds a new array) (amended 2026-10-06, see §10).
- **A changed position goes back as a DELTA, level by level,** never as an absolute round trip: at each
  instance on the path, the stored value gains the inverse-rotated world change, less the change in the
  turned box's min-corner offset. An axis that did not move gains exactly zero.
- **Example:** a Length edit on a part inside a turned assembly leaves the stored local position
  untouched, unless the patch also pivoted it. This is invariant 25's rule: touch nothing that is
  already an exact position.
- **Cuts and dimensions are part-local,** so they go back as they are. Only `position` and `rotation`
  are mapped.
- **The gizmo rounds the WORLD min corner** of a part it moves inside an open assembly, because the grid
  you see is the world's, and then maps it back.

### 5.3 Instance actions

- **Instance actions** write `Instance.position` and `rotation` directly, inside one `edit()`.
- **Group, Ungroup, Duplicate, Copy in a row and Delete** each rewrite a definition list. Each is one
  `edit()`.

### 5.4 Held points (invariant 24)

- **Owners are occurrence ids,** judged against `worldParts` by the existing `dropHeldIfGone`.
- **Moving or turning an instance moves every part under it.** For held points owned under it, this is
  the world-moved case. Held points elsewhere are untouched.
- **Group and Ungroup change ids but move nothing, so they RE-KEY `tapeAnchor` and `tapeHover`** to
  the new occurrence ids rather than dropping them. That is invariant 43's argument: a hide moves
  nothing.
- **`grabbed` follows the selection rule, as now:** Group replaces the selection, so a grab owned by a
  grouped part drops through `selectionPatch`.
- **The prohibition carries over:** no open or close of an assembly, and no selection write, may clear
  `tapeAnchor` or `tapeHover`.

### 5.5 Undo

- **History entries are unchanged:** `{ doc, hiddenIds }`.
- **`restore` keeps the held points when the restored doc is the same object** (invariant 43), and it
  reconciles `openPath` (§3.1).

## 6. Readers of parts

- **They read `worldParts(doc)` or `flatDocument(doc)`, and that is their whole change:** the cut
  list, nesting, the diagrams and board feet through `flatDocument`; `checkDesign`, snap points and
  the viewport (`BoardMesh`, `MoveTool`,
  `TapeTool`, `moveCandidates`, Home and `f`).
- **The cut list.** Identical parts still collapse into one row, so three drawers' sides make one row
  of 6, listing `Drawer 1 › Side`, `Drawer 2 › Side`, …. Invariant 18 is unchanged. `flatDocument`
  builds the display paths, so nothing in the cut list concatenates names (invariant 19's third
  clause: the string that is measured is the string that is drawn).
- **Nesting's tiebreak** (`a.id.localeCompare(b.id)`) still has a total order, because occurrence ids
  are unique.
- **Generate** still produces flat designs. `designToDocument` is unchanged apart from writing the
  two empty lists.

### 6.1 Joinery keeps the tree

- **Input:** `flatDocument`, with path names. Every recipe (move, resize, trim, cut, carry) already
  works in world space.
- **Output:** a TREE-SHAPED document with the same instances. `applyJoints` ends in `migrateDocument`,
  which re-mints ids containing `/`, so joined parts are matched back to occurrences BY INDEX: every
  recipe preserves the count and order of parts, and a length mismatch THROWS (our bug, not a model
  failure). Each joined part is written back through §5.1's mapping, compared against the same
  flattened "before", so the path names compare equal and are never written back as renames. The
  mapping is 1:1 because every definition has one instance in round 1. The tree-shaped document is
  what lands on `result.doc`, the field `useJoinery` saves.
- **Why not flatten the output:** it would throw away the structure the user built.
- **Unchanged:** the output still ends in `migrateDocument`, and joinery still writes only through
  `createProject(doc, { activate: false })` (invariants 36, 41).
- **Round 2's open question:** what a joint cut into ONE instance of a shared definition means (make it
  unique, or cut every instance). Recorded as a follow-up for round 2; not decided here.

## 7. Links in round 1

- **A part link works across the tree.** Mates are found by label among `worldParts`, and propagation
  edits them through `editParts`, each in its own frame.
- **`LINK_FIELDS` is unchanged:** a part's `position` and `rotation` are own fields, local or world
  alike.
- **Duplicating an assembly** copies its parts' `link` fields, so a copied drawer's linked sides join
  those links (invariant 45's "copies join").
- **`repairLinks` stays in `migrateDocument`.** It decides on the flattened parts and writes its
  unlinks back to the definition parts.
- **Round 2 decides what links become** once shared definitions exist.

## 8. Testing

**Unit tests, every new one mutation-tested.**

- **Group and Ungroup move nothing.**
  - Group: `worldParts` before equals `worldParts` after, ids aside and EXACT, using `chiralPart`,
    nested turned instances and millimetre values.
  - Ungroup of a moved and turned instance: its direct child parts are EXACT; parts below a nested
    instance agree within 1e-9.
  - The bound comes from the document BEFORE the action, which the action cannot change (invariant 23).
- **Every store test runs against a part inside a turned, translated assembly AND against an instance
  path**, not only root parts: a lookup through `doc.boards` silently ignores both, and a root-only
  fixture passes with that bug live.
- **Ancestor membership:** `i3` covers `i3/b1` and does NOT cover `i30/b1`.
- **Equivariance (invariant 44).** An instance at turn r+90 gives the parts of the same instance at r,
  turned a quarter about the instance's world-box centre, with `chiralPart` inside, for `worldParts`,
  the snap points and `worldSolids`.
- **Exactness (§5.2).** A Length, Material or cut edit on a part inside a turned, translated assembly
  leaves its stored local `position` bit-identical. The fixture uses decimal and millimetre values, so
  a write-back of the round-tripped value is visible.
- **Load repair (§2.4).** A test per step: a duplicate definition id, a missing definition, a cycle, a
  double reference, an unreferenced definition, an id containing `/`, duplicate ids within a
  definition, duplicate sibling names. Each is pinned by the SURVIVOR's literal value (invariant 33's
  rule). A v9 file loads unchanged; a version above 10 is refused.
- **`pickTarget`** at the root, inside, nested, and outside the open assembly.
- **`selectionPatch`'s new filter:** no write path selects a non-child, Ctrl/Cmd+A included.
- **Readers:**
  - the cut list of a grouped document is IDENTICAL to its flat twin's, apart from names;
  - `worldParts` returns the same array for a flat document.
- **Held points:** Group re-keys a tape anchor and keeps it; moving an instance drops one owned under it
  and keeps one elsewhere; opening and closing clear nothing.
- **Joinery:** a joined drawer comes back with its instance, and each cut lands on the right definition
  part (§6.1).
- **Panels (RTL):** the parts-list tree, instance Properties, Group and Ungroup buttons, and fields
  hidden for a mixed selection.

**Browser.** The live check runs on the dev server with the user watching:
- build a drawer and Group it; Duplicate it twice; move and turn one;
- open one, edit a side, close it;
- nest the three drawers in a "Cabinet";
- Hide one drawer;
- check the cut list;
- reload: the tree persists;
- open a v9 project: it is unchanged.

## 9. New invariant (to promote when the round ships)

**46. The tree has one composition step and one flattening; every reader sees world parts and every
edit goes through `editParts`.**
- `composeStep` is the only place an instance transform is written;
- `worldParts` is the only walk that produces placed parts;
- a reader that walks the tree itself is a second decider;
- `editParts` writes back only changed fields;
- a new frame starts at origin `[0, 0, 0]`, turn 0, so Group moves nothing, bit for bit.

## 10. Amendments (2026-10-06, while writing the plan)

The plan's code reading contradicted three claims, and fixed two more details. No approved behaviour
changes.
1. **`worldParts` carries each part's OWN name** (§2.1). Path names come from `flatDocument`, for the
   cut list and joinery. Properties' name field reads `board.name`, so a path there would be stored.
2. **Ungroup is exact for direct child parts only** (§4.1). Folding a nested frame changes the order of
   additions. Group stays exact.
3. **`position` is compared element by element** (§5.2); a fresh equal array is not a change. A changed
   position goes back as a delta, level by level.
4. **Every move is a delta rotated into the item's container frame** (§4.2), never an absolute position
   through world space.
5. **Joinery maps parts back by index** (§6.1), throws on a count mismatch, and the tree document is
   what `useJoinery` saves.

