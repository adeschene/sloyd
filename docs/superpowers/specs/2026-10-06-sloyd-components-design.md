# Sloyd — components (round 2 of components)

**Date:** 2026-10-06 · **Status:** approved in conversation, section by section; this document awaits review
**Builds on:**
- **Round 1:** assemblies (`docs/superpowers/specs/2026-10-06-sloyd-assemblies-design.md`, schema 10,
  invariant 46), and the linking round (schema 9, invariant 45).
- **Invariants:** 2, 4, 8, 18, 24, 33, 40, 42, 43, 44, 45 and 46.
- **Inputs:** follow-ups 223 and 224.
- **Precedence:** every rule there still holds unless this document says otherwise.

## 1. Problem and goal

**The problem.** Round 1 made assemblies, but every definition is placed exactly once. Duplicate
makes an independent copy, so three drawers are three unrelated drawers. Changing a side means
changing it three times. Part links share fields between single parts, but by a second mechanism
(copied fields kept equal by propagation and a load repair). The two mechanisms do not compose.

**Goal.** SketchUp's components:
- copies of an assembly share ONE definition, so an edit inside any copy changes them all;
- Make Unique splits one copy off;
- linked parts become the same idea at part size: copies of one stored shape.

**Success.** Build a drawer and duplicate it twice. Change a side's length and add a groove inside
one copy: all three change, in one undo entry, and the cut list shows every part three times in one
row.

**The user's rulings, made in conversation:**
- **Duplicate shares.** Duplicate and Copy in a row make shared copies; Make Unique splits one off.
  Group still makes a new definition used once. There is one kind of assembly, not SketchUp's group
  and component split.
- **Links fold into components.** One sharing mechanism. A linked part still looks and works like a
  part.
- **Joinery shares where identical.** Copies whose joined results are identical stay shared; only
  copies that differ split. This closes follow-up 223.
- **Storage: shared shapes** (approach A). A linked part stays a part in its container; its shared
  fields are stored once in a `Shape` its users point to. Assemblies share definitions the same way.
  Rejected:
  - one-part assemblies (B), because every part code path would need an "assembly that is really a
    part" branch, and a part's min corner is not an instance's origin;
  - copies plus a reference (C), because propagation and the load repair would stay, which is two
    mechanisms in all but name.

**Out of scope, deliberately:**
- **Making two existing independent assemblies share** ("link these drawers"). Delete one and
  duplicate the other.
- **Mirrored, scaled or freely rotated copies** (follow-up 225).
- **A cut list organised by assembly** (follow-up 225).
- **Hiding inside a definition for every copy.** Hidden-ness stays view state per occurrence.

## 2. Data model (schema 11)

```ts
interface SloydDocument {
  // ...every existing field, unchanged
  boards: StoredBoard[];        // the root's parts
  instances: Instance[];        // unchanged
  definitions: Definition[];    // a definition may now be placed by MANY instances
  shapes: Shape[];              // NEW: shared part fields, document-wide
}

interface Definition { id: string; boards: StoredBoard[]; instances: Instance[] }

// LINK_FIELDS' 'shared' set, derived from it (invariant 45), plus an id:
interface Shape { id: string; length; width; thickness; material; grain; posture; cuts }

// A plain part is today's Board, minus `link`. A shaped part stores only its OWN fields:
interface ShapedBoard { id: string; name: string; position: [number, number, number]; rotation: Rotation; shape: string }
type StoredBoard = Board | ShapedBoard;
```

- **Shared assemblies.** `Instance.definition` already references by id. Several instances may now
  name one definition. Each copy keeps its own name, position, turn and visibility; the contents are
  stored once.
- **Linked parts.** A shaped part stores its own fields and `shape`. Every shared field lives in the
  `Shape`. A shaped part may sit at the root or inside any definition, so a shared table's legs can
  share one shape, and so can legs in two different tables.
- **`Board.link` is retired.** The `Shape` replaces it. A `Board` never carries `shape`, and a
  `ShapedBoard` never carries a shared field: the two are disjoint, and a helper `isShaped` tells
  them apart.
- **Types follow `LINK_FIELDS`.** `Shape` and `ShapedBoard` are derived from `LINK_FIELDS`
  (`Pick<Board, SharedField>` and `Pick<Board, OwnField>`), so a new `Board` field still fails `tsc`
  until it is classified (invariant 40's argument).

### 2.1 Resolution

- **`resolveBoard(doc, stored): Board`** fills a shaped part's shared fields from its shape, and
  returns a plain part unchanged (the same object). It is the ONE place a shape is read into a part.
- **`worldParts` resolves first, then places.** Its output is unchanged in shape: full world `Board`s,
  one per occurrence, with occurrence ids. Every reader of placed parts (viewport, snapping, tape,
  cut list, nesting, diagrams, `checkDesign`, joinery) is unchanged.
- **A stored part is not a `Board` any more.** Code that reads a container's `boards` directly
  (`treeOps`, `treeEdit`, `treeRepair`, the store) must resolve first. The union type makes `tsc`
  flag every such read of a shared field; each is fixed by resolving, never by a cast.

### 2.2 Ids

- **Occurrence paths are already unique per placement.** `i1/b2` and `i3/b2` are two placements of
  one stored part when `i1` and `i3` share a definition.
- **Shape ids are unique document-wide** and minted by `takeId`. A shape's cut ids are its own,
  scoped to the shape (invariant 33's per-board rule, with the shape standing in for the board).
- **Nothing else references a shape or a definition by id,** so invariant 33's single-pass repair
  still holds: a duplicate shape id is resolved by dropping the later shape, as a duplicate
  definition id is.

### 2.3 Load repair

These run in `migrateDocument`, in this order, replacing round 1's steps 1–7 where they differ:
1. **Duplicate definition id or shape id:** the first keeps it; a later one is dropped.
2. **An instance naming a missing definition** is dropped.
3. **Cycles:** as round 1.
4. **A definition referenced twice gets a copy ONLY for a file below v11.** Such a file could not
   have meant to share. From v11 on, sharing is legal and this step does not run.
5. **A shaped part naming a missing shape is dropped.** The shape is its only source of size, so it
   has no geometry to keep. A saved document must always open.
6. **An unreferenced definition or shape is dropped.**
7. **A shape with one user dissolves:** that user becomes a plain part carrying the shape's fields.
8. **Ids within each container, then names within each container** (invariants 33 and 8).

`repairLinks` and `repairLinksTree` are retired: users of one shape cannot differ, by construction.

### 2.4 Schema 11

- **`CURRENT_VERSION` becomes 11.**
- **The argument:** silent data loss, the strongest yet. A v10 build opening a v11 file would see
  shaped parts with no size (refused or dropped) and would copy every shared definition (step 4),
  silently un-sharing every component, then autosave.
- **The v10→v11 step is document-level,** on raw data before validation (invariant 11):
  - each `link` label becomes one `Shape`, built from its FIRST member in `worldParts` order;
  - each member whose shared fields equal the shape's (exactly, invariant 18; cuts in order, by id
    and every `CUT_GEOMETRY_KEYS` field) becomes a shaped part, keeping its id, name, position and
    turn untouched;
  - a member that differs keeps its fields and loses its `link`, which is what `repairLinks` did;
  - **nothing moves**: no position or turn is recomputed.
- **Rollback costs v11 documents; export first.**

## 3. Actions

### 3.1 Assemblies

- **Duplicate and Copy in a row share.** The new instance names the SAME definition, with a fresh
  id, a name unique among its siblings ("Drawer (1)"), and its own position and turn (Copy in a row's
  step from the original, invariant 25). One undo entry.
- **Group** makes a new definition used once, as in round 1. Grouping a shared copy puts that
  instance, still shared, inside the new definition.
- **Editing inside an open copy edits the definition**: dimensions, cuts, moving a part, Add board,
  Delete, Group and Ungroup inside. Every copy changes in the same undo entry. The other copies are
  drawn in the faded area and show the change at once.
- **Make Unique** is offered on a copy whose definition has two or more instances. That copy gets
  its own definition, **one level deep** (SketchUp's rule):
  - its plain parts are copied, KEEPING their ids (ids are per container, invariant 33, so the copy
    may reuse them);
  - its shaped parts keep their shape;
  - its nested instances keep their definitions.
  - One undo entry. Because the ids are kept, the copy's occurrence paths do not change, and hidden
    ids, the selection and held points need no re-keying.
- **Ungroup of a shared copy** puts that copy's contents into its parent, as round 1 does, with the
  same split: plain parts are copied, shaped parts keep their shape, nested instances stay shared.
  The other copies are untouched; the definition is pruned only when no instance is left.
- **Delete** of the last instance of a definition prunes it.
- **The panel** for a copy whose definition is shared reads "Shared by N copies: edits inside change
  all of them." and offers **Select copies** (the copies at the open level, as Select linked does
  today) and **Make Unique**.
- **The parts list** shows a count on a shared copy's row (`×3`), beside its name, with an accessible
  name "Shared, 3 copies"; a linked part keeps its chain icon.

### 3.2 Linked parts

The interaction is today's; only the storage changes.
- **Link** follows `linkPlan`'s rules, unchanged: the FIRST selected part is the source, and a
  selected part that is already linked brings its whole link. Afterwards every member is a shaped
  part naming one shape, which takes the source's shared fields. A source that is already shaped
  keeps its shape; otherwise a new shape is minted. A member with different shared fields is
  re-pivoted about its own centre when posture changes (invariant 2), exactly as Link does today.
- **Unlink** turns each selected shaped part back into a plain part carrying a copy of the shape's
  fields, cut ids kept. A shape left with one user dissolves (§2.3 step 7, the same helper).
- **Duplicate and Copy in a row of a shaped part share its shape,** as copies join links today.
  Duplicating a plain part stays independent.
- **Select linked** and the panel's "Linked with N other parts" block are unchanged in behaviour,
  and count the shape's users.
- **Delete** of a shape's last user prunes the shape; a shape left with one user dissolves.

### 3.3 What stays per copy

Name, position, turn and hidden-ness. Hiding a part inside one drawer hides it in that drawer only,
because `hiddenIds` holds occurrence paths.

## 4. The store

### 4.1 Write-back keys on the storage target

- **`applyWorldEdits` resolves each world edit to its storage target:** the stored part (a root part,
  or a definition's part) and, for a shaped part, its shape.
  - Own fields (name, position, rotation) go to the stored part, lowered level by level exactly as
    round 1 does (invariant 46).
  - Shared fields go to the shape when the part is shaped, and to the stored part otherwise.
  - Only changed fields are written, as in round 1.
- **Two edits that reach one storage target must agree.** Identical results merge into one write.
  Different results THROW: a user selection is one level, so it cannot produce two placements of one
  stored part, and a disagreement is a programming error. Joinery is the one caller that produces
  disagreement on purpose, and it has its own path (§5).
- **A shape's posture change re-pivots every user** about its own centre (`reorientedPosition`,
  invariant 2), each in its own container, in the same `edit()`. This is the one propagation that
  survives: posture is shared, a min corner is not. A size change alone pivots nothing, as today.
- **The sheet-good grain reset** runs once, on the shape.
- **Cut actions** (`addCut`, `updateCut`, `removeCut`) on a shaped part act on the shape's cuts. One
  cut id, one cut, every user.

### 4.2 Held points (invariant 24)

- **An edit inside a definition moves parts in every copy,** so a held point is judged whenever its
  owner's WORLD part changed, wherever the edit was made, not only under the edited occurrence. The
  test stays point-precise (`dropHeldIfGone`), and `grabbed` keeps its board-precise clause for the
  edited targets only (invariant 24's asymmetry).
- **The tape prohibitions carry over unchanged:** no selection write, open, close or hide clears
  `tapeAnchor` or `tapeHover`.

### 4.3 Undo

Unchanged: one action, one `edit()`, one entry; history entries stay `{ doc, hiddenIds }`.

## 5. Joinery: share where identical

Joinery runs on `flatDocument` and maps parts back by index, as round 1 does. The write-back
(`writeBackFlat`) groups the results instead of writing each occurrence:
- **Assemblies first, top-down.** For each definition, its placements' results are compared, each
  placement's whole subtree, in the definition's own frame (own fields lowered as in §4.1). The group
  holding the first placement keeps the definition. Each other group gets a copy, one level deep, and
  the comparison recurses into the nested definitions of each group. After this, every stored part's
  placements agree.
- **Then shapes.** Assemblies must split first: a shaped part placed in several copies has one
  result only once its definition has split. The users of each shape are grouped by their new shared fields, compared exactly,
  with cuts compared by geometry (`CUT_GEOMETRY_KEYS`) and NOT by id, because `pocketFor` mints fresh
  ids per board. The group holding the shape's first user keeps the shape. Each other group gets a
  new shape. Within a group, every user takes the first member's cut ids. A group of one dissolves to
  a plain part.
- **The original is never changed**; joinery still writes only through
  `createProject(doc, { activate: false })` (invariants 36, 41).
- **This closes follow-up 223:** four legs whose mortises come out identical stay one shape.

## 6. Invariants

- **45 is rewritten:** a link is a `Shape` referenced by its users. `LINK_FIELDS` stays the one
  shared/own table and now derives `Shape` and `ShapedBoard`. `linkPlan` stays the one decider for
  Link. `repairLinks`, `mates`, `sharedPatch`-to-mates propagation and `dissolveSingletons` over
  labels are retired; one-user shapes dissolve through one helper used by load, Unlink and Delete.
- **46 is amended:**
  - a definition may be placed many times;
  - `resolveBoard` is the one place a shape is read into a part, and `worldParts` resolves before it
    places;
  - write-back keys on the storage target and refuses disagreeing edits;
  - load-repair step 4 runs only below v11;
  - joinery's write-back splits by identical results.
- **33 gains:** shape ids are unique document-wide; a shape's cut ids are scoped to the shape.
- **40:** `sameShared`'s role (deciding "same cut") passes to the migration's equality and joinery's
  geometry compare, both derived from `CUT_GEOMETRY_KEYS`.

## 7. Testing

Unit tests, each guard mutation-tested (the ledger's rule: a test that cannot fail is a defect):
- **Migration v10→v11:** linked members' world parts come back bit-identical; a differing member is
  left unlinked with its own fields; a file below v11 with a definition referenced twice is still
  copied (step 4), and a v11 file's sharing is kept.
- **Resolution:** a shaped part resolves to its shape's fields; a plain part comes back as the same
  object; a missing shape drops the part on load.
- **Editing:** an edit inside one copy changes every copy in one undo entry; two disagreeing edits to
  one target throw; a shape's posture change re-pivots each user exactly about its own centre; a cut
  added on one user appears, with one id, on every user.
- **Actions:** Duplicate shares; Make Unique is one level deep and keeps occurrence paths; Ungroup of
  a shared copy leaves the other copies alone; Delete of the last copy or last user prunes; a
  one-user shape dissolves on Unlink, Delete and load.
- **Held points:** a point held on a part under another copy is judged after an edit inside the
  definition.
- **Joinery:** three identical drawers stay one definition; a drawer that also meets a divider splits
  off; four legs with identical mortises stay one shape, with shared cut ids.

**Live check on the dev server, the user watching:**
- build a drawer, duplicate it twice, edit a side inside one copy, then Make Unique on another;
- Link and Unlink four legs; Select linked; add a cut to one leg;
- the cut list (one row per part across copies) and the joinery dialog's sites;
- reload; import a v10 file with links and assemblies, and a v9 file.
