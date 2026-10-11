# Mirrored instances — design (follow-up 225, its first item)

Date: 2026-10-11. Status: approved in conversation (the approach and all five sections); this file is its
written form. Schema 12 → 13.

## 1. What and why

Left and right cabinet halves, a pair of mirror-image legs, the two sides of a bench: one design, built twice,
one of them mirror-imaged. The assemblies round put mirrored instances out of scope because they depended on
follow-up 215 (which hand each posture has). Since schema 12 every posture shares ONE hand, so the mirror image
of a part is simply a part whose cuts are reflected — an ordinary part, with an ordinary cut-list row.

The user's decisions:

- **A LIVE mirrored copy** (not a one-shot mirrored duplicate): a placement of a shared assembly flagged
  mirrored. Editing either half changes the other as its mirror image.
- **Assemblies only.** A mirror lives on an assembly placement (an `Instance`). To mirror one part, group it
  first.
- **Entry points:** a "Copy mirrored" action and a "Mirrored" checkbox, both on a selected assembly.
- **Approach A:** the mirror lives inside the ONE composition (`placeBoard` / `placeInstance`), so every world
  part is an ordinary board and nothing that reads world parts changes. Rejected: B, a mirror flag on world
  parts drawn with negative scale (every consumer would learn it; it re-introduces two hands); C, a stored
  second definition kept in sync (the propagation invariant 45 forbids).

Out of scope: mirrored loose parts; a mirror across a horizontal plane (upside down); Generate emitting mirrored
assemblies (follow-up 232 stays open); Refine describing them (it refuses, §6).

## 2. The model (schema 13)

- `Instance.mirrored?: boolean`. Absent means not mirrored. `validateInstance` keeps it only when it is
  literally `true` (`false`, absent and any non-boolean load as absent, so an unmirrored instance's stored record
  is unchanged and saved files stay as they were). No migration step: `CURRENT_VERSION` becomes 13 so a build
  below 13 refuses a v13 file. **Harm a build one version back would do: wrong geometry** — it would drop the
  flag and draw the right cabinet as a second left one.
- **The mirror plane** is the assembly's own left/right axis: local X, x → −x, applied in the instance's own
  coordinates BEFORE its turn and translation. With turns, "mirror then turn 180°" is a front/back mirror; no
  second flag is needed.
- The frame of an instance is therefore `T(position) · R(rotation) · M^mirrored`, M the reflection of local X.

## 3. Placing through a mirror (the composition)

`placeBoard(f, b)` and `placeInstance(f, j)` gain one step when `f.mirrored`: the child is first reflected in
f's own coordinates (`mirrorPart` / the instance rule below), then placed through the unmirrored frame exactly as
today. Nothing else composes frames (invariant 46).

**A part `b` (turn s, posture p, cuts C) reflected in its container's coordinates becomes:**

- **turn** `(360 − s) % 360` (M R(s) = R(−s) M);
- **cuts** each mirrored along `d0(p)`, the part dimension that lies on X at turn 0 for posture p — `length` for
  flat and on-edge, `width` for upright — with `mirrorCutAlong(c, d0, b[d0])` (since v12, M · F = F · M_d0 for
  the turn-0 frame F: a reflection of X is a reflection of the dimension F puts on X, whichever direction it
  runs);
- **position** `[−(x + ex), y, z]`, ex = `boardExtents(b)[0]` (turns s and −s put the same dimensions on the same
  axes, so the extents do not change);
- posture, sizes, material, grain, name, id: unchanged.

Why this form (the user approved it over keeping the turn and mirroring the dimension on X at turn s, which
describes the same solid): a turn edit inside a mirrored copy then changes ONLY the stored turn, never the
stored cuts, and the Turn select shows exactly the turn chosen.

**A nested instance `j` (origin o, turn t, flag m) reflected in its container's coordinates becomes** origin
`[−o.x, o.y, o.z]`, turn `(360 − t) % 360`, flag `!m` (M · T(o) R(t) M^m = T(Mo) R(−t) M^(m+1)). So two mirrors
cancel at any depth; three equal one.

**`mirrorCutAlong`** is today a private, untyped helper in `document.ts` (the v8/v12 migrations' one legitimate
hand reflection; invariant 44: clip first, one sum, no snap). The composition uses the SAME function through a
typed export; it is not rewritten onto the frame helpers.

## 4. Writing edits back (the exact inverse)

Write-back (`lowerEdit` / `lower` in `treeEdit.ts`, `translateItems`, the store's `copyInRow`) lowers a world
edit through each frame on the occurrence's chain. Through a mirrored frame the lowering is the exact inverse of
§3 (M is its own inverse), so **placing a written-back part returns the edited world part**:

- **position / rotation**: unturned and untranslated as today, then reflected (x → −(x + ex), turn negated).
  The three hand-written frame calculations outside `frames.ts` (`lower`'s `rotateVec(inverseTurn(...))`,
  `translateItems`' `containerTurn` delta, `copyInRow`'s `rotateVec(inverseTurn(turn), w)`) move onto one
  mirror-aware helper in `frames.ts` that maps a world vector into a container's local frame (the linear part
  of the chain: turns and reflections).
- **cuts**: lowered through each mirrored frame on the chain (mirrored back along `d0` of the LOWERED posture).
  A world cut that is exactly the placed form of the stored cut with the same id maps back to THAT stored cut
  object, so an untouched cut is never re-reflected (`mirrorCutAlong` twice is not bit-exact in floating point;
  repeated edits must not drift). Only a new or changed cut is reflected back. A cut written to a Shape (a
  shared field, invariant 45) is the lowered value.
- **The one coupling (approved):** under an odd number of mirrors the stored cuts depend on the stored posture's
  `d0`. A posture change between flat/on-edge (`d0` = length) and upright (`d0` = width) keeps the edited world
  part exactly as seen, so its stored cuts are re-reflected and written even though the world cuts did not
  change. If that part is shaped, the Shape's cuts are rewritten and every other user of the Shape shows the
  change. A turn never couples (§3).
- `keepWorld` (joinery) and the Properties rule (keep the stored local position) are unchanged in meaning; both
  are expressed through the inverse.

*Amended 2026-10-11 (final review).* The coupling above assumed every user of a Shape has one mirror parity;
Ungroup of a plain original after Copy mirrored, Make Unique of a mirrored copy and Link can all make a Shape
whose users sit on both sides of a mirror. The user's rulings and one rule the implementation already followed:

- **Link refuses parts on opposite sides of a mirror.** Parity is the XOR of `mirrored` along an occurrence's
  instance chain (`mirroredAt`). `linkPlan` (the ONE Link decider) refuses, with "Can't link parts on opposite
  sides of a mirror.", when some member's STORED part has no occurrence on the source's side: that part would
  show the source's cuts mirror-imaged. A member whose stored part also sits on the source's side is allowed;
  its other-side occurrences are the live mirrored copy, the feature itself (linking two shelves inside a
  cabinet that has a mirrored copy works, and the copy shows the mirror). Every member counts, including those
  an already-linked part brings along, since each becomes a user of the Shape; "will match" counts only members
  on the source's side. Nothing changes on refusal; the group panel shows the message in place of the Link
  button. On ONE side of a mirror Link builds the Shape from the source's STORED shared fields, never its world
  fields (which under a mirror are the stored ones reflected), so no member's world geometry changes.
- **A posture change between flat/on-edge and upright on a Shape with users on both sides is refused**
  (`postureRefusal`, shared by the store and the Posture field), before any mutation: "Linked parts on both
  sides of a mirror can't change between flat and upright. Unlink first." The two sides would write different
  cuts to the one Shape. Every placement of every user counts, so this also covers linked parts inside an
  assembly that has a mirrored copy, edited from either side. Flat ↔ on-edge (d0 unchanged), sizes, material, and any posture change on a Shape
  whose users are all on one side are unchanged.
- **A Properties resize keeps the stored cuts** (the world cuts follow the mirror at the new size, as through a
  plain frame), while `keepWorld` (joinery, which keeps the world box) re-mirrors the cuts at the new size.

## 5. Actions and UI

- **"Mirrored" checkbox** in an assembly's Properties, under Turn (Orientation). Toggling flips the flag in place
  and adjusts the instance's position so the assembly's world bounds are unchanged — `turnInstance`'s rule
  (keep the box centre, min height), which the mirror-aware `placeBoard` makes exact. An assembly with no parts
  keeps its position. One undo entry; like `turnAssembly` (not refused while a gesture is open; a checkbox
  click ends a drag). *Amended 2026-10-11 (final review): was "refused while a gesture is open, like any edit".*
- **"Copy mirrored"** beside Duplicate: a shared copy (`shareInstance`) with the OPPOSITE flag, placed so its world
  box abuts the original's on the side `rotateVec(rotation, +X)` points to, whatever the original's flag (for a
  turned original that side is turned with it; for an already-mirrored original it is the same world side as
  for a plain one, so every Copy mirrored continues the same way). *Amended 2026-10-11 (final review): was "on
  the original's local +X side (the reflection of the original about the plane of its own local-X max face)",
  which for a mirrored original would name the other side.* Name through `uniqueName` among
  its siblings. The copy becomes the selection. One undo entry.
- **Parts list:** a mirrored assembly row shows a mirrored badge (`role="img"`, accessible name "Mirrored"),
  beside the shared-copies ×N badge.
- **Existing actions keep the flag:** Duplicate, Copy in a row, Make Unique. **Ungroup** lifts a mirrored
  assembly's children through the mirror (`placeBoard` / `placeInstance`): its parts come out as plain,
  independent parts with reflected cuts and its nested assemblies with flipped flags; nothing moves.
  **Group** inside a mirrored assembly is the identity frame, as today.

## 6. Everything else

- **Unchanged, because they read world parts:** the viewport (BoardMesh, grain: a mirrored copy's figure is
  drawn as for any part, not mirror-imaged), cut list (a one-handed part's mirror is its own row; a symmetric
  part shares one), cut-sheet diagrams, nesting, design checks, snap points, tape, Move, hide/unhide, selection.
- **Joinery** runs on `flatDocument` and writes back through `writeBackFlat` (the exact inverse). A
  mirror-symmetric left/right pair gets mirror-image joints, which lower to identical stored cuts, so the two
  halves stay ONE shared definition. Joint repair (fu 240) takes the same path.
- **Refine** refuses a design containing a mirrored assembly (`documentToDesign`), before any call: "Refine can't
  describe a mirrored assembly yet — Ungroup the mirrored copy first." Generate is unchanged.
- **Rollback:** a build below 13 refuses every project saved after the deploy; export first.
- **CLAUDE.md:** the Versioning table (a 12→13 row: document-level, no step; harm "wrong geometry"), invariant 46
  (the composition includes the mirror; write-back is its exact inverse), invariant 44 (the composition is the
  second caller of `mirrorCutAlong`), Status. Follow-up 225's mirrored-instances item closes when this ships.

## 7. Tests

- **The composition**, for every posture × turn × mirror, with `chiralPart` (invariant 44): a part placed
  through a mirrored instance has world solids exactly equal to the reflection of its unmirrored placement,
  the reflection computed independently in the test (about the instance's local X plane, then turned and
  translated by hand), never by the code under test. Nested: two mirrors give the unmirrored world exactly;
  three equal one.
- **The exact inverse**, for every posture × turn × mirror × nesting depth 1–2: write back a moved part, a turned
  part (the stored turn negated, stored cuts the SAME objects), an added cut (placed back within 1e-9 of the
  world cut), and a posture change flat ↔ upright (cuts re-reflected); placing each result returns the edited
  world part. An untouched cut survives ten edits bit-identical.
- **Store:** the Mirrored checkbox leaves the world bounds unchanged; Copy mirrored makes an abutting, shared,
  opposite-flag copy with a unique name, selected, one undo entry; a group move and Copy in a row of / inside a
  mirrored assembly land at the typed world positions; Ungroup of a mirrored assembly leaves every world part
  bit-identical.
- **Cut list:** a mirrored copy of a one-handed part is a separate row; of a symmetric part, the same row.
- **Joinery:** a mirror-symmetric pair, joined, keeps one shared definition and passes `gateUnjoin`.
- **Load:** v13 round-trips the flag; `mirrored: false`, `"yes"`, `1` load as absent; a v12 file loads
  unmirrored; a v14 file is refused.
- **Refine:** refuses with the §6 message.
- **Mutation-test every new test** (drop the turn negation, the cut reflection, the position reflection, the
  flag flip of nested instances, the cut-object reuse, and the posture coupling — each must turn a test red).
- **Live check** (dev server, Playwright; software GL, fu 26a — geometry, not shading): a cabinet with a
  one-handed dado, Copy mirrored, the dado mirrored in 3D; a cut edited on the right half appears mirrored on the
  left; the cut list's rows. Recorded in `docs/browser-verification-mirrored-instances.md`.
