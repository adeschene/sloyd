# Sloyd — turned links: four tapered legs, one component (fu 301)

**Date:** 2026-10-13. **Status:** approved; shipped 2026-10-13 (merge `3e7474f`). Amendments made while planning and after the final review are marked *amended*.
**Builds on:** the generate-assemblies spec (role linking, `linkByRole`), components (inv 45), quarter turns (inv 44), the
AI-tapers spec (`taperWorld.ts`). **No schema change.** Rollback is free.

## 1. Problem and goal

A generated Shaker table's four legs are tapered on their inside faces, so the converter stores each with different taper
faces, and role linking (`sameShared`, exact) keeps them as four separate parts (fu 301).

The legs are the same part turned: on a square leg, the front-left leg turned 90°, 180° and 270° about the vertical is each
of the other three. `rotation` is an OWN field of a linked part (`LINK_FIELDS`), so the four legs can share one Shape and
keep their own turns. No mirroring is needed.

**Goal (the user's choice): one leg component.** After Generate (and after a Refine), a set of legs that are one part turned
share one Shape: changing one leg's taper or size in Properties changes all four.

**Not in scope:**
- Mirrored placements in the design format (fu 232).
- Turned assemblies.
- Turning a part that carries rectangular cuts.

## 2. Design

### 2.1 Where

`linkByRole` (`roleLinks.ts`) is the one place Generate and Refine decide which same-role parts share a Shape. It is called
by `designToDocument`, so both features get the change. Only the class search changes. `linksToShapes`, `sameShared` and
everything after them are untouched.

### 2.2 Turn candidates

For a stored part `b` (unshaped, with a role), its **turn candidates** are the parts `b'` such that:

- `b'` is `b` with only `rotation` changed, to one of 0/90/180/270, other than `b.rotation`. Posture, dimensions, material
  and grain are unchanged.
- `boardExtents(b')` equals `boardExtents(b)` exactly, so `position` (the min corner, inv 2) stays put and the world box is
  identical. 180° always qualifies; 90° and 270° qualify only when the two horizontal extents are equal.
- The grain runs along the same world axis: `axisDimensions(b').indexOf(b.grain) === axisDimensions(b).indexOf(b.grain)`.
  A square flat panel turned 90° would show its figure crosswise, so it is refused.
- `b.cuts` is empty. Generated parts and Refine's plain parts never have rectangular cuts. A part that has them is not
  turned, which keeps `mirrorCutAlong`-style re-storing out of this round.
- Its tapers are re-stored in the new frame: `taperCutsFor(b', worldTapers(b))`. If `worldTapers(b)` is null (a non-standard
  taper), or `b` has a non-taper angle cut, there are no candidates. Both are unreachable from the converter, but the code
  must not guess. A `fault` from `taperCutsFor` also means no candidate. The new cuts keep `b`'s angle-cut ids in order
  where the counts agree, otherwise they get fresh ids from `nextId`. Ids are then aligned to the representative's (§2.3).

The world part (box and tapered faces) is identical for every candidate, by construction through `taperWorld`
(invariant 44's helpers).

### 2.3 Class search

As today, each role's parts are split into classes of `sameShared` parts, in stored order, and the first member of a class
is its representative, encoded as the converter made it.

A later part joins the first class whose representative is `sameShared` with the part itself, or else with its first
matching candidate in 0/90/180/270 order. When it matches through a candidate, the stored part is replaced by that
candidate (rotation and `angleCuts` only). If nothing matches, the part starts a new class, unturned.

Order matters only for which leg keeps the converter's encoding, and that is deterministic.

**Angle-cut ids are aligned** (*amended while planning*). `sameShared` compares angle-cut ids, and the converter mints fresh
ids for every part. So today even identical tapered parts never link: three identical tapered legs give 0 Shapes, a latent
bug found while planning. A part (or a candidate) whose angle cuts equal the representative's by geometry
(`sameAngleCut`, index by index, in the canonical order `taperCutsFor` writes) takes the representative's ids before
`sameShared` judges it. Ids are not geometry, and the Shape keeps the representative's. A part with no angle cuts is judged
exactly as today, the same object, so untapered linking is byte-for-byte unchanged.

**The prompt** (*amended while planning*). The fu 313 line told the model that legs with mirrored tapers "do not share a
role". Linking finds them only through a shared role, so the line now says to give them the same role: Sloyd links them when
they are the same leg turned.

### 2.4 What changes downstream

- **Stored parts.** Generated documents may now contain parts at 180° and 270°. These have been real turns since schema 8
  (inv 44). Properties shows the turn, and the cut list and drawings already handle every turn.
- **Refine.** `documentToDesign` writes world boxes and world tapers, so a turned leg describes exactly as before. The
  refined design re-links through the same search, so the legs stay one component.
- **The change list.** `designDiff` judges world extents and world tapers, so re-turned legs show no "turned" or taper line.
- **Joinery.** It works on the flat (world) document, and a leg's mortises land on its local faces. With a symmetric set of
  aprons the four legs' cuts are identical, so joinery keeps the Shape. When they differ, joinery splits the Shape as it
  already does for linked parts (inv 45). Pinned by a test, not assumed.
- **Cut order is not geometry** (*amended during implementation, controller ruling*). Pinning the above showed joinery
  appending identical mortises in a different stored order on turned legs, so it split four legs into two Shapes, and
  Refine's unjoin gate would refuse a joined table with linked turned legs. Two places now treat cuts as a set:
  `regroupShapes` (treeEdit.ts) groups users by an order-insensitive `groupSignature` (cuts and angle cuts sorted; the Shape
  keeps its first member's order and ids), and `sameJoined` (unjoin.ts) matches cuts as a multiset (`sameCutSet`, still exact
  at GATE_TOLERANCE 1e-9; angle cuts stay in order). `splitAssemblies`' `resultSignature` stays order-sensitive (fu 316).

### 2.5 Invariant amendments

- **44.** "Generate stays at 0° and 90°" becomes: the converter (`orient`) encodes at 0° or 90°; role linking may store a
  part at any quarter turn that leaves its world box, grain axis and tapered faces unchanged (`linkByRole`, turned links).
- **45.** `linkByRole` may re-turn a member before linking, and only through §2.2's candidates.

**Size edits on a turned link** (*amended after the final review; the user's ruling*). A linked part grows from its own min
corner. With the legs stored at different turns, a width-only or thickness-only edit grows two legs along X and two along Z.
A square edit grows all four alike. Accepted and recorded as fu 318, not prevented.

## 3. Testing

TDD; every plan-supplied test is mutated before it is trusted.

- Identical tapered parts link (the id-alignment fix): three legs tapered on the same world faces give one Shape.
- Four inside-tapered square legs (the prompt's corner rule) link into ONE Shape. Each leg's `boardExtents`, `position`
  and `worldTapers` are unchanged from the unlinked conversion, and the stored turns are a permutation of 0/90/180/270.
- An outside-tapered set links the same way. Legs tapered on different numbers of faces do not link.
- A non-square (1.5 × 2.5) tapered leg set pairs only by 180°: two Shapes.
- A flat square panel set is never turned 90° (grain axis), only 180° if that matches.
- A part with rectangular cuts is never turned.
- An untapered design links exactly as before: the same Shapes and the same stored rotations as today's `linkByRole`.
- A Refine round trip (`documentToDesign` → `designToDocument`, exact) of the linked table keeps the four legs as one Shape
  with the same world tapers, and `diffDesigns` reports no change.
- Deterministic joinery on the linked table (mortise-and-tenon at every apron site) keeps the legs sharing one Shape, and
  the post-join `checkDesign` is empty.
- The headline integration test (`tapers.test.ts`, the four-leg table) asserts one leg Shape.

**Live check:** the paid Generate from AI-tapers chunk 2 is not repeated. The four-leg table is checked on the dev server by
importing a generated-shape fixture: Properties shows one linked component, and editing one leg's taper moves all four. This
check is free.

## 4. Follow-ups this leaves

- Turning parts that carry rectangular cuts (Refine of a joined design unjoins first, so this is rare).
- Mirror-only matches (a part equal to another only by reflection) still need mirrored placements (fu 232).
