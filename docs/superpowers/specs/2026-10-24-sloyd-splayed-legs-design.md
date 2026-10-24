# Splayed legs, chunk 1: a part that leans — design

Status: draft, 2026-10-24. Feature gap §1 "Splayed / raked legs, compound angles" (`docs/feature-gaps.md`).
The user chose this gap and said: "a stool, typing rake and splay angles". On scope they said: "I just want to implement
features that a woodworker would expect, so do whatever makes sense with that goal in mind". They approved the chunked
outline in chat ("Looks right, write the design"). Every decision below that is not quoted from the user is **my call**
and is marked as such.

## 1. What and why

Splayed legs are the commonest furniture shape Sloyd cannot model. Think of a staked stool, a Windsor-style bench, or a
splay-legged step stool. The v1 spec deferred free-angle parts as "unscheduled, not declined" ("angled parts can arrive
later as an explicit feature with compound-angle math"). Today every part sits square to the world. `axisFrame` maps each
part dimension onto a world axis by a signed permutation, and nothing else exists.

A woodworker coming from SketchUp, who uses its rake-and-splay extension, expects the following:
- they type the two angles they read off a drawing;
- the model shows the leg leaning;
- the leg's ends are cut level, so the foot sits flat and the top meets the seat;
- Sloyd gives the **resultant angle and sightline**, the two numbers you set a bevel gauge to and sight along when you
  bore the seat.

This chunk delivers exactly that. Later chunks are outlined in §11 and are not designed here.

**Who it serves (my call):** someone modelling *staked* furniture, where the legs go into a thick seat and the legs are
the only angled parts. Aprons and stretchers between splayed legs need compound-angle rails and come later.

## 2. Goals, non-goals, anti-goals

**Goals**
- (G1) A part can carry a **lean**: its rake and splay are typed in degrees, stored, loaded, drawn and exported exactly.
- (G2) The lean is visible and correct everywhere the part's place in the world is read: viewport, picking, moving,
  snapping, the section cut, the Plans sheet, exploded view, framing and image export.
- (G3) **Level the ends**: one action makes the foot flat on the floor and the top end level, using today's angle cuts.
- (G4) The bench numbers (resultant and sightline) are shown in Properties and on the Plans sheet.
- (G5) The design checks judge a leaning part on its real shape. A levelled leg stands on the floor and holds up a seat.
- (G6) Four legs splay symmetrically as one link, using mirrored links (schema 21) and quarter turns.

**Non-goals for this chunk**
- Angled holes, meaning the seat's sockets and a round tenon on the leg (§11, chunk 2).
- Stretchers and rungs (chunk 3).
- Compound-angle aprons.
- Generate authoring a lean.
- Joinery on a leaning part.
- A leg whose faces stay square to the front of the piece. See §3.3: that needs a compound end cut, a new cut type.
- Rotating parts other than by a lean, such as a free-angle brace or a tilted panel. The lean is a general rotation
  under the hood, but the user-facing feature is a lean.

**Anti-goals** (failure even if it "works")
- **A document with no leaning part is byte for byte as before.** This covers drawings, meshes, checks, the cut list,
  export and every identity test.
- No existing project's stored numbers, world boxes or drawings change.
- **A leaning part's pre-lean box must never be shown to a person as its extent.** Dimension chains, framing, exploded
  view and bounds must all use the real, leaned shape. Plausibly-wrong numbers are this codebase's worst failure.
- No design check may be dropped or weakened for leaning parts (invs 38, 39). This chunk extends them; it does not
  exempt anything.
- Joinery and Refine must never silently mangle a leaning part. They refuse it or keep it exactly.

## 3. The model (schema 22)

### 3.1 Stored form

- **Values:** `lean` on a part stores two slopes, `[x, z]`. These are the foot's horizontal travel per inch of drop
  along world X and world Z.
- **Frame:** the slopes are measured in the part's own frame at its stored posture, *before* its quarter turn and
  before any mirror. So the lean turns and mirrors with the part.
- **When stored:** only when non-zero. A part with no lean stores nothing, and the loader treats absent as `[0, 0]`.
- **Why slopes and not degrees (the angle-cuts rule, CLAUDE.md "`angleCuts.ts` field conversions"):**
  - Degrees exist only in display and typed input.
  - A typed rake writes `tan(rake)` into one slope and leaves the other slope exactly as stored.
  - So editing the splay never drifts the rake, and the reverse.
- **Shared, not own (`LINK_FIELDS`):** four legs in one link share one lean. In a symmetric stool, the turns and mirrors
  of the link's users turn that one lean outward at every corner (§3.4).
- **If the optional-field check gets in the way:** `_sharedPrimitives` rejects an optional shared field (the reason
  `cornerRule` is always stored). The builder chooses the internal representation. Two primitive fields are fine, and
  so is following the `cornerRule` precedent. The *file* must still carry nothing for an unleaned part if at all
  possible. If that cannot be done, say so before building it.
- **Bounds (my call):**
  - rake and splay are each typed within ±45°;
  - the resulting lean is refused when the resultant would pass 45°;
  - the store refuses an out-of-range slope;
  - the loader drops a malformed `lean`, keeping the part unleaned (a malformed entry is dropped, per the Versioning
    section);
  - the loader refuses nothing on content.

### 3.2 The pivot and `position`

- **The pivot is the centre of the part's top face** (the max-Y face of the pre-lean box). Changing the lean swings the
  foot and keeps the joint with the seat where it was. Woodworkers lay out a staked piece from the seat's mortise
  locations.
- **`position` keeps its meaning** (inv 2): it is the min corner of the *pre-lean* box.
  - The lean is a rotation about the pivot, applied in the part's frame before its turn.
  - The composition (`placeBoard`, `placeInstance`, `cornerShift`) is therefore unchanged. A quarter turn about the
    vertical commutes with a lean about that same vertical line through the pivot.
  - Properties' Position fields stay as they are and get one note on a leaning part: "Position is the part before its
    lean; it leans about the centre of its top." (my call)

### 3.3 The rotation, and why the leg turns to its sightline

- **The derived numbers:** from slopes `x` and `z`, the **resultant** is `R = atan(hypot(x, z))` and the **sightline** is
  `σ = atan2(z, x)`, the plan direction the foot travels.
- **The rotation:**
  1. first a twist of `σ` about the vertical through the pivot;
  2. then a tilt of `R` about the horizontal axis perpendicular to the sightline, so the foot moves along the sightline
     by `hypot(x, z)` per inch of drop.
- **Smallest twist:** the twist is the smallest that puts one of the leg's two horizontal dimensions on the sightline
  (σ reduced into (−45°, 45°]), so a splay-only or rake-only lean twists nothing.
- **Consequence (my call, approved in the chat outline):** the leg's faces face its sightline. A square leg is therefore
  seen turned in plan. A round or octagonal staked leg looks the same either way.
- **Why:** with this twist, the floor's normal in the leg's own frame lies in one of the leg's own planes. "Level the
  ends" (§5) is then a single sloped line through one dimension, which today's `AngleCut` stores exactly. Keeping the
  faces square to the front would put the floor normal at an angle to all three of the leg's dimensions, which needs a
  compound cut. That is a new storage form with many readers (the survey listed the contact regions, `mirrorAngleCut`,
  the diagram wedges, the bench text, angleWorld and `joineryRefusal`). It is out of scope.
- **The ONE home:** a new pure module (suggested `document/lean.ts`) holds all of the following, and nothing else
  computes a lean:
  - slopes ↔ degrees;
  - the resultant and sightline;
  - the rotation, the pivot, and point and direction maps in both directions.

### 3.4 Turns, mirrors and assemblies

- **Turns:** a quarter turn rotates the lean with the part. That falls out of §3.1's frame.
- **Mirrors:** a mirror, either a part's own (schema 21, `mirrorDim`) or an instance's (schema 13), reflects the lean by
  negating the slope along the mirror's world axis.
  - This is an exact sign flip and is its own inverse, which keeps it in the spirit of inv 44's "flag flips, never
    arithmetic".
  - `mirrorFeatures` / `lowerOwnMirror` and the instance mirror step each get it, each with an exact inverse.
  - Equivariance tests must use a lean with *both* slopes non-zero and unequal (the `chiralPart` rule).
- **Composition:** assemblies compose unchanged (§3.2). The ONE walk (`worldParts`) carries each part's lean in its world
  form, so readers do not re-derive it.
- **Write-back (`treeEdit.ts`):**
  - lowers a lean edit through every turn and mirror on the path, exactly;
  - treats lean as a field that moves the part in the world, so held points are re-judged (inv 24). A lean edit drops
    held points exactly as a resize does.
- **The four-leg idiom (G6):**
  1. Make one leg and give it a lean.
  2. Copy mirrored for its left/right twin.
  3. Turn both 180°, or mirror again, for the back pair.
  4. Link them.

  One edit then splays all four. This needs nothing new beyond the mirror flip.

### 3.5 Posture

- A posture change keeps the stored slopes, so the lean stays in the same world directions at turn 0.
- `reorientedPosition` keeps its job. The pivot follows from the new box.
- My call: no refusal is needed.

### 3.6 Schema 21 → 22

- **Harm argument** (argue *this* field's harm): a schema-21 build would ignore `lean` and draw every leg upright. The
  level-end bevels would then sit on a vertical leg, cutting a wedge off its foot and top. That is silent, plausible and
  wrong. A 22 file must therefore be refused by a 21 build.
- **The step:** it adds nothing (absent is no lean).
- **Validation:** keeps finite slopes within the bounds and drops anything else.
- **Rollback:** the rollback table gains schema 22.
- **Records:** `docs/versioning.md` gets its row.

## 4. Properties: the Lean section

The section sits on a selected part, near Turn and Mirrored. My calls:

- **Fields:**
  - **Rake**: degrees, the foot's lean seen in the Side view (toward the front or back);
  - **Splay**: degrees, seen in the Front view (toward the left or right).
  - Both are shown and typed in **world** terms for the selected placement, with a word for direction (the builder
    settles the words, for example a signed value plus "foot toward front").
  - Editing either writes the stored local slopes through the turns and mirrors (§3.4).
  - Typed input runs through the existing degree parsing used by angle cuts. A refusal shows as the field's own error
    (`DimensionField`'s contract).
- **Readout:** `Resultant 14.3° · sightline 33.7° from the front edge`. That is the bench pair. Wording is the
  builder's, from `angleText.ts`'s precision (0.1°).
- **No lean:** the section shows the two fields at 0 and no readout.
- **Clear lean:** a button that sets both slopes to 0.
- **Multi-selection:** the section shows a mixed value when parts differ, following the mixed `DimensionField` rule. An
  edit writes the same world lean to each selected part. My call; if that proves awkward, show the section for a single
  part only and record it as a follow-up.
- **Holes:** a part with hole rows cannot take a lean in this chunk, and a leaning part cannot take a hole row (§8).
  Each refusal reads as a sentence naming chunk 2.
- **Exploded view:** the section sits inside `EditLock` like every other editing region (inv 47).

## 5. Level the ends

A button in the Lean section. My calls throughout.

- **The foot:** a sloped end cut on the part's bottom end, so the foot is a face on the world floor, `y = 0`.
- **The top:** a sloped end cut on the top end, level through the pivot.
- **Storage:** both are ordinary `AngleCut`s, in the kind the angle-cuts spec uses for an angled cut across an end (the
  builder confirms Miter versus Bevel against `angleCuts.ts`). Each cut's line runs in the plane of the leg's length and
  the dimension facing the sightline (§3.3), with depths from today's stored-slope rule, `tan R`.
- **Downstream:** because they are ordinary angle cuts, the following need nothing new:
  - the cut list's bench lines;
  - the part diagrams;
  - drawings;
  - snapping;
  - links (angle cuts are shared).
- **If the leg is too short:** after a lean, the low corners of the top face sit *below* the pivot's level and the
  foot's high corners sit above the floor. Cuts alone would leave a gap at the seat and a foot that rocks.
  - **The extension:** Level the ends therefore **lengthens the leg along its own axis at whichever end needs it**, in
    the same undo entry. Each end gets the smallest extension at which every corner of that end reaches its plane,
    rounded **up** to the drag grid (1/16", or 1 mm in a metric project), so the cut list prints a buyable blank.
  - **The foot:** extending the foot changes `length` and `position` only. The pivot stays where it is.
  - **The top:** extending the top moves the pre-lean box so that **the leaned axis is the same line and still passes
    through the old pivot point**. The pivot (§3.2: the new top face's centre) therefore moves up that axis, above the
    levelled top. The levelled top face then lies wholly in the level plane through the *old* pivot.
  - **Exactness:** this must be exact to float, and tested. The leaned axis before and after is one line, the old pivot
    lies on it, and every corner of each levelled face is on its plane.
  - **Known consequence:** a later lean edit pivots about the new, higher point. Record it; it is not a bug.
- **If an existing angle cut is on an end:** the action is refused, with the existing "remove it first" wording style.
  It never stacks a second cut on an end.
- **One undo entry; refused while read-only.**
- **Staleness:** after a later lean edit, the levelled ends are no longer level. My call for v1: the Lean section shows
  a note, `Ends were levelled for a different lean — Level the ends again`, and Level the ends replaces the two cuts it
  recognises.
  - **How it recognises them:** cuts on the two ends whose lines match a level cut for *some* lean in the same
    sightline dimension. The builder defines the test structurally.
  - Re-levelling is never automatic in v1. That is narrower and avoids a hidden derived cut. Record a follow-up for
    automatic re-levelling.

## 6. Where the lean is applied

The survey (2026-10-24) found that bodies, edges, holes, curves, profiles and bands are all part-local, and
`geometryKey` carries no pose. **The geometry needs no change.** The work is in the few helpers that cross from part to
world and in whatever reads `position + boardExtents` as a world box.

### 6.1 Rules

- **R1. Every part-to-world crossing composes the lean** through §3.3's one module:
  - `toWorld` (snapPoints);
  - `worldBodyFaces` / `worldBox` (designCheck);
  - `worldBodies` (drawing);
  - `solidWorldBox` / `pointToLocalXYZ` (cuts);
  - `worldOffsets` / `bodyMesh` (grainTiling);
  - `sectionCaps`;
  - joinery's `boxOf` / `pocketFor`, which only need to refuse (§8).

  CLAUDE.md's snapPoints rule ("local→world is `position[axis] + toWorldOffset(...)`") becomes "… then the lean". The
  builder updates it. An unleaned part takes today's code path, so its bytes are unchanged.
- **R2. One real-bounds helper.**
  - A leaning part's world extent is the bound of its *leaned bodies' vertices*.
  - Every reader of world extent uses it: `boardsBounds` and its callers (group move, Copy in a row, section span, the
    Gizmo), framing's `subsetBounds`, explode's centres and floor lift, Plans dimension chains (`extentAlong`), the
    drawing's `boardBox`, and design checks' `boxesOf`.
  - `position + boardExtents` is never presented as a leaning part's extent (anti-goal).
- **R3. The axis-aligned box fast paths are skipped for a leaning part.** It always takes the general planes path
  (drawing's `worldBodies` box path, the designCheck `real` path).

### 6.2 Subsystems

- **Viewport:** BoardMesh's group gets the lean as a derived rotation about the pivot. Inv 1 holds because it is derived
  and never written back. Grain UVs and band painting stay in the pre-lean frame, so the figure rides with the wood.
  - Inv 12/15/35 are untouched; the lean is not in `boardUVSignature`, because UVs are part-local.
  - Perf guards (inv 50) do not move.
- **Picking:** the raycast honours the group matrix. `keptBySection` tests world hit points, which is already correct.
- **Gizmo and Move:** both are translate-only and work on deltas, so they stay as they are.
  - The handle sits at the real bounds' centre (R2).
  - Group moves round the group's real-bounds min corner once (inv 42's rule, with R2's bounds).
- **Snap points:**
  - The 26-point lattice and feature points are built part-local and mapped through `toWorld`, plus the lean.
  - `stockProbe`'s world-to-local mapping uses the inverse.
  - The tape stays on world axes (the `TapeAxis` argument stands: the axis is a world axis, never a part axis).
  - **Exact moves (inv 25):** a snap onto a leaning part's point moves the *moving* part by an exact world delta. Not
    rounding still holds.
- **Section cut:**
  - The GPU plane is unchanged.
  - Caps for a leaning part come from clipping its convex bodies by the world plane (`clipConvex`) and outlining them in
    that plane. `sectionCaps` stays the ONE home of caps (inv 51).
  - A leaning part never has holes in this chunk (§8), so no oblique bore subtraction is needed.
- **Drawings and Plans:**
  - `drawView` reads leaned bodies and edges (R1, R3).
  - `silhouetteLines` and `curveEdgeLifts` receive the view direction mapped into the part's frame.
  - Feature tags still sit on their segments (inv 16, 47).
  - Unleaned drawings are byte for byte unchanged (`drawingIdentity`).
  - A leaning part gets an HTML note under the figure, never a measured SVG label (inv 19): `Leg: rake 8.0°, splay 12.0°
    — resultant 14.3° on a 33.7° sightline`. It appears once per part per sheet and follows the feature callouts'
    keying (`keyed`). Wording is the builder's.
- **Cut list, nesting, Buying:** unchanged. They are stock plus part-local cuts, with no pose. The level-end cuts print
  as their usual bench lines. Two legs with the same stock and cuts share a row whatever their leans. My call: lean is
  placement, like position.
- **Exploded view:** real-bounds centres; the floor lift uses the real minimum Y (R2).
- **Image export:** unchanged.
- **Standard views:** framing uses R2.

## 7. Design checks (invs 38, 39): extended, never weakened

The user's approved outline: overlap is measured on the real leaning shapes, and a level end face counts as contact, so
legs hold the seat up and stand on the floor.

### 7.1 Overlap and mass

- A pair with a leaning part is measured on real bodies (`bodyOverlap` on `worldBodyFaces`, with the lean), the way a
  tapered pair already is (fu 302).
- `partMass` weighs leaned bodies for the tip check.

### 7.2 Contact, support, grounding and tipping

- **What counts as contact:** a leaning part's contact faces are its leaned bodies' faces whose world normal is ±Y,
  within a stated angular tolerance. That tolerance is for floating error only. It must not admit a visibly sloped face.
  - The builder states and justifies the tolerance from the arithmetic actually done (inv 22's lesson).
  - Mutation-test it: a 0.5° slope must not count.
  - Contact with another part's horizontal face at the same height (`TOUCH`) is judged by polygon overlap area.
- **Resting:** a leaning part takes part in support only through these horizontal faces. Through them it is grounded,
  rests on a part below, and holds a part resting on it.
  - Vertical-face clauses ("between", "lapped" on a broad face) never apply to a leaning part, because its faces are not
    axis faces.
  - The PROHIBITION in inv 39 stands as written. Clause (c), the coverage threshold and both halves of the top-face
    clause are untouched for every unleaned pair. For a pair involving a leaning part, coverage is not used, because
    only resting applies.
- **Grounding:** `groundedSet` stays the ONE grounding walk.
- **Tipping:** the footprint includes a leaning part's floor polygons.
- **A leg that is not levelled** touches the floor at an edge or corner, not a face, so it is **not grounded**. It
  reports through the existing support fault, with a hint naming Level the ends where the wording allows. This is
  correct: an unlevelled leg rocks. It also teaches the action.
- **Under-defined:** if the builder finds a case where the clauses above are under-defined (a leaning part resting on
  another leaning part, say), escalate it. Do not guess. It is a ruling on inv 39.
- **Unchanged ground:** a document without leaning parts gets byte-identical check results.

### 7.3 Everything else

`too-small`, `too-large` and the floor-distance test read real bounds (R2).

## 8. What refuses, and what carries

Every refusal is decided before any mutation (inv 41's rule) and reads as a sentence.

- **Holes on a leaning part:** both directions are refused in this chunk (§4).
  - **Why:** a hole square to the leg is fine geometrically. But its section caps would need an oblique bore
    subtraction, and the seat-side socket that makes holes worth having is chunk 2's.
  - **Lifted in chunk 2.** A loaded document that has both (hand-edited or imported) is kept and drawn. Section caps
    then omit its bores, with a note. The loader refuses nothing.
- **Add joinery and Repair:** refused up front when the document has a leaning part, with one sentence naming it.
  - **Why:** pocket cuts are box-based (`pocketFor`, inv 41), and an angled socket is not a rectangular cut.
  - The refusal is decided in joinery's existing one-decider place (`joineryRefusal` or its sibling), not in the panel.
- **Refine (inv 56 territory):**
  - A leaning part is **kept exactly as stored**: lean, position, features, Shape reference and mirror flag.
  - **What the model sees:** the part as context, described with its real world bounds (R2) plus a line saying it leans
    and is kept as is.
  - **What comes back:** whatever the model returns under that part's flat name is discarded. The original is restored
    byte for byte.
  - **Done view:** says `Kept as is (leans): <names>`.
  - **Why:** the design schema describes parts as world boxes (`at` + `size`), and every world-word converter assumes
    part axes equal world axes. Teaching the model leans is a `DESIGN_SCHEMA` change with grammar cost (fu 322), so it
    is out of scope.
  - **Ordering:** the keep happens in the same place, and in the same order relative to `migrateDocument` and
    `linkByRole`, as inv 56's carry. The PROHIBITION there stands.
  - **Joined Refine is refused up front** while a leaning part exists, the same as joinery.
- **Generate:** never produces a lean. Unchanged.
- **Ungroup, Group, definitions and copies:** carry the lean like any shared field. Ungroup's exactness (direct child
  parts) holds, because the lean lowers exactly (§3.4).

## 9. Testing and verification

- **`lean.ts`:**
  - round trips (degrees → slopes → degrees; point → world → point);
  - resultant and sightline against hand-worked examples (rake 8°, splay 12° → R and σ by hand, stated in the test);
  - edge cases: 0, a single-axis lean, the bound;
  - mirror and turn equivariance with an asymmetric lean.
- **Byte-for-byte guards:** every existing identity test (`drawingIdentity`, `sweptIdentity`, `bandFreeIdentity`,
  `curvesWatertight`, the perf guards) still passes untouched, and a new lean-free identity check covers the meshes and
  check results.
- **Level the ends:**
  - the foot face's world normal is −Y within tolerance and sits at `y = 0`;
  - the top face is level through the pivot;
  - the lengthen-and-round-up case;
  - the refusal when an end is already cut.
- **Design checks:**
  - a four-legged levelled stool is supported and does not tip;
  - an unlevelled one reports;
  - a 0.5° near-level face is not a contact (mutated).
- **Migration:** v21 → v22, a malformed lean dropped, and a 22 file refused by the gate.
- **Viewport (no unit tests by design):** verify in the dev-server browser (Playwright, the user may watch):
  - build a four-leg staked stool by the §3.4 idiom;
  - turn, mirror and link the legs;
  - level the ends;
  - check the section cut, the Plans sheet and the exploded view;
  - confirm snapping onto a leaning foot;
  - write the readouts to `docs/browser-verification-splayed-legs.md`.

  Software GL hides nothing that matters here (no new shaders), but fu 26a is still owed on real hardware.
- **Deploy:** per the deployment rule. Production is checked by bundle hash and CSP only.

## 10. Records the builder keeps

- **New invariant (in full in `docs/invariants.md`, condensed in CLAUDE.md):** the lean's one home; R1–R3; the pivot and
  `position` meaning; the mirror flip; checks extended, never weakened.
- **Updated invariants:** 2, 24, 38, 39, 44, 45, 46, 51 and 56 gain their lean clauses, in full and condensed.
- **Other records:**
  - `docs/versioning.md`;
  - `docs/module-map.md`;
  - `docs/rounds.md` (the rollback table: schema 22);
  - `docs/follow-ups.md` (automatic re-levelling; leaning parts with holes; anything deferred);
  - `docs/feature-gaps.md`'s row.

## 11. Later chunks (outline only, each its own spec)

- **Chunk 2: angled holes.** A hole row may have a direction that is not square to a face. This gives the seat's leg
  sockets (bored along the leg's real axis, so the bevel-gauge numbers from §4 are the ones used) and lifts §8's hole
  refusal. Section caps and drawings get oblique bores, elliptical rims included. It is probably also the place for a
  round or tapered round tenon on a leg's top.
- **Chunk 3: stretchers** between splayed legs: rung length and angles found from the two legs' leaned axes.
- **Later, maybe:** compound-angle aprons; a leg kept square to the front (the compound end cut); Generate authoring
  leans.

## 12. Left to the builder

- How the lean is represented internally (§3.1), within the file-format constraint.
- Exact UI wording and the sign words (§4, §6.2's note).
- Miter versus Bevel as the kind for a level-end cut (§5), and the structural test that recognises one.
- The contact tolerance and its justification (§7).
- How the chunk is split into merges. **One deploy carries all of §3–§8 together:** joinery and Refine must never see a
  leaning part without the refusals and the keep.
