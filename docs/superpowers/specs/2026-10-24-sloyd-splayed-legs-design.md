# Splayed legs, chunk 1: a part that leans — design

Status: APPROVED by the user 2026-10-24 ("Approved, write the plan"); builder check taken the same day (every answer is my call, marked). Feature gap §1 "Splayed / raked legs, compound angles" (`docs/feature-gaps.md`).
**Built 2026-10-24 on branch `splayed-legs`** (plan Tasks 1–13; schema 22); NOT merged or deployed — the browser verification
(plan Task 14), the merge and the deploy are pending. Later rulings: the *Amended (build)* block at the end, which wins where it
differs from the text.
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
- **The facing dimension:** `lean` also stores which of the leg's two horizontal dimensions faces the sightline
  (`width` or `thickness`; §3.3). It is stored, not derived (builder check, 2026-10-24). Deriving the twist with a
  reduction into any half-open interval breaks at the endpoint. For example, rake equal to splay, the commonest
  diagonal layout, gives σ = 45° exactly, so its mirror twin would be spun 90° and its level cuts would sit on the
  wrong dimension. A derived twist would also jump 90° on a 0.01° edit. The facing dimension is chosen when a lean is
  first set (the one needing the smaller twist; width on a tie) and is kept by later edits. Clear lean removes it.
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

- **Only an upright part can lean** (posture `upright`: length vertical; my call, builder check). A leaning flat or
  on-edge board is the tilted panel this chunk excludes. The Lean section shows only on an upright part. A posture
  change is refused while a lean is set, with a sentence ("Clear the lean first"). §3.5 is replaced by this rule.
- **The pivot is the centre of the part's top face** (the top end of the pre-lean box). Changing the lean swings the
  foot and keeps the joint with the seat where it was. Woodworkers lay out a staked piece from the seat's mortise
  locations.
- **`position` keeps its meaning** (inv 2): it is the min corner of the *pre-lean* box.
  - The lean is a rotation about the pivot, applied in the part's frame before its turn.
  - The composition (`placeBoard`, `placeInstance`, `cornerShift`) is therefore unchanged. A quarter turn about the
    vertical commutes with a lean about that same vertical line through the pivot.
  - Properties' Position fields stay as they are and get one note on a leaning part: "Position is the part before its
    lean; it leans about the centre of its top." (my call)
- **A resize keeps the pivot** (my call, builder check). This is the woodworker's expectation: the joint with the seat
  stays put.
  - A length change grows or shrinks the foot end.
  - A width or thickness change is symmetric about the pivot.
  - On a leaning part, the Properties resize path therefore lowers a position delta alongside the size. This is a
    third case beside inv 46's two write-back rules, applied per user for a shared size.
  - A resize also makes levelled ends stale (§5's note).

### 3.3 The rotation, and why the leg turns to its sightline

- **The derived numbers:** from slopes `x` and `z`, the **resultant** is `R = atan(hypot(x, z))` and the **sightline** is
  `σ = atan2(z, x)`, the plan direction the foot travels.
- **The rotation:**
  1. first a twist of `σ` about the vertical through the pivot;
  2. then a tilt of `R` about the horizontal axis perpendicular to the sightline, so the foot moves along the sightline
     by `hypot(x, z)` per inch of drop.
- **The twist** is the signed angle from the stored facing dimension's + direction to the sightline, reduced into
  (−90°, 90°]. When first set it is the smaller of the two choices (§3.1), so a splay-only or rake-only lean twists
  nothing.
  - **The seam:** the twist is continuous except where the sightline swings 90° from where it was first set. At that
    seam the leg spins 180° about its own axis. Its ends are stale by then anyway, because any lean edit makes them
    stale (§5).
  - The `lean.ts` tests pin both the seam and the rake = splay case.
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
- **Mirrors:** a mirror, either a part's own (schema 21, `mirrorDim`) or an instance's (schema 13), applies to the
  lean as a **conjugation of the whole leaned rotation by the reflection**. It is never applied by flipping a slope and
  re-deriving the twist.
  - Re-deriving fails: from flipped slopes the derived twist differs from the true mirrored twist by 180° whenever the
    facing dimension is the one on X (builder check, 2026-10-24).
  - In stored terms, a mirrored user resolves to the Shape's slopes with the turn-0 X slope negated, the same facing
    dimension, and the twist negated. That is exact sign flips, and its own inverse. `mirrorPart` reflects along
    `mirrorDim` and negates the turn, so the flip is always the stored turn-0 X slope, whatever the part's turn.
  - `mirrorFeatures` / `lowerOwnMirror` and the instance mirror step each get it, each with an exact inverse.
  - Equivariance tests must use a lean with *both* slopes non-zero and unequal (the `chiralPart` rule), and also the
    rake = splay case.
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

Replaced by §3.2's rule: only an upright part leans, and a posture change is refused while a lean is set.

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
- **Readout:** `Resultant 14.3° · sightline 33.5° from the front edge`. That is the bench pair. Wording is the
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

- **The foot:** a sloped end cut on the part's bottom end, so the foot is a face on the world floor. **The floor is
  world `y = 0`**, the design checks' floor, whatever assembly the leg is in (my call).
- **The top:** a sloped end cut on the top end, level through the pivot.
- **Refused:** when the pivot is at or below the floor.
- **Storage:** both are ordinary `AngleCut`s, in the kind the angle-cuts spec uses for an angled cut across an end (the
  builder confirms Miter versus Bevel against `angleCuts.ts`). Each cut's line runs in the plane of the leg's length and
  the dimension facing the sightline (§3.3), with depths from today's stored-slope rule, `tan R`.
- **Downstream:** because they are ordinary angle cuts, the following need nothing new:
  - the cut list's bench lines;
  - the part diagrams;
  - drawings;
  - snapping;
  - links (angle cuts are shared).
- **The length is always adjusted** (builder check: the top needs it on any non-zero lean). A level plane through the
  top-face centre leaves half that face's corners below it, so cuts alone would leave a gap at the seat. The foot's
  high corners may sit above the floor, or the foot may run far below it.
  - **The adjustment:** Level the ends therefore **sets the leg's length along its own axis at each end**, in the same
    undo entry, so that every corner of that end just reaches its plane. The top is always extended. The foot is
    extended, or **shortened** when it runs past the floor, so the foot cut is always the small wedge. Each end's
    change is rounded **up** to the drag grid (1/16", or 1 mm in a metric project), so the cut list prints a buyable
    blank.
  - **The foot:** changing the foot changes `length` and `position` only. The pivot stays where it is.
  - **The top:** extending the top moves the pre-lean box so that **the leaned axis is the same line and still passes
    through the old pivot point**. The pivot (§3.2: the new top face's centre) therefore moves up that axis, above the
    levelled top. The levelled top face then lies wholly in the level plane through the *old* pivot.
  - **Exactness:** this must be exact to float, and tested. The leaned axis before and after is one line, the old pivot
    lies on it, and every corner of each levelled face is on its plane.
  - **Always moves the pivot:** because the top is always extended, Level the ends always moves the pivot up the axis.
    A later lean edit pivots about that higher point. Record it; it is not a bug.
  - **The cuts are read-only rows:** after the round-up the cut lines are offset (they reach depth 0 at neither side).
    `miterFields` then returns null, so each Angle cuts row shows the bench line and Remove only, never editable
    fields. That is intended (re-level instead). The recognition test below must accept offset lines.
- **On a shared leg** (a link, or a part in a definition placed more than once): length and angle cuts are shared, but
  position is each user's own.
  - The action levels **every user and every placement in one edit**. Each user's own position moves by its own
    recipe, which is the same recipe in the Shape's frame, applied through that user's turn and mirror.
  - Because the lean is shared, every user has the same resultant, so the top extension is the same for all.
  - The foot change depends on each user's pivot height. When users' pivots are not all at one world height (to 1e-9),
    one shared length cannot level them all, so the action is **refused** with a sentence naming the parts.
- **If an existing angle cut is on an end:** the action is refused, with the existing "remove it first" wording style.
  It never stacks a second cut on an end.
- **One undo entry; refused while read-only.**
- **Staleness:** after a later lean edit or resize, the levelled ends are no longer level. My call for v1: the Lean section shows
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
- **Gizmo and Move:** both are translate-only.
  - The handle sits at the real bounds' centre (R2).
  - **A free drag of a single leaning part rounds the drag DELTA to the grid, never a corner** (my call, builder check).
    The pre-lean corner is off-grid after Level the ends, so rounding it would lift a levelled foot off `y = 0` by up to
    half a grid step. The real-bounds corner would move the seat joint. A grid-multiple delta keeps both exact.
  - Group moves keep inv 42's rule (round the group's min corner once, one delta). For a group containing a leaning
    part the delta is rounded instead, by the same argument.
  - Inv 25 and inv 42 get this clause.
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
    — resultant 14.3° on a 33.5° sightline`. It appears once per part per sheet and follows the feature callouts'
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
  - **Constraints the mechanism must meet** (builder check; the mechanism in `refine.ts` is the builder's):
    - (a) **World pose:** each kept part keeps its world pose exactly, in whatever form Refine's output stores parts
      (its flat world form if the output is flat, with the lean in world terms). Its features, lean and mirror flag
      come back unchanged.
    - (b) **The floor rule:** the floor shift (`-min[1]` in `generated.ts`) must not separate the piece from its kept
      parts. Either it is computed over the whole result with the kept parts' **real** bounds (R2), or the result is
      shifted so the kept parts do not move. The other parts move to them, never the reverse.
    - (c) **Shapes:** kept parts are **excluded from `linkByRole`**. Their Shape survives with its id, re-minted only
      on an id collision (inv 33's rule).
    - (d) **Ordering:** the keep sits where inv 56's carry sits (before `migrateDocument` and `linkByRole`), so that
      PROHIBITION stands.
    - (e) **Collisions:** a model part that reuses a kept part's flat name is dropped. It is reported in the done view
      as replaced by the kept part.
  - **Joined Refine is refused up front** while a leaning part exists, the same as joinery.
- **Generate:** never produces a lean. Unchanged.
- **Ungroup, Group, definitions and copies:** carry the lean like any shared field. Ungroup's exactness (direct child
  parts) holds, because the lean lowers exactly (§3.4).

## 9. Testing and verification

- **`lean.ts`:**
  - round trips (degrees → slopes → degrees; point → world → point);
  - resultant and sightline against hand-worked examples (rake 8°, splay 12° → R = 14.30°, σ = 33.47° = atan2(tan 8°, tan 12°), NOT atan(8/12) = 33.7°; stated in the test);
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

## Amended (build)

Rulings made while building, on branch `splayed-legs` (2026-10-24; the SDD ledger and the task reports). The code plus these rulings
govern; where one differs from the text above, this block wins. Records: invariant 57 (and its clauses on invs 2, 24, 25, 38, 39, 41,
42, 44–47, 51 and 56) in `docs/invariants.md`; follow-ups 436–446.

- **Ruling 1 — the seam is removed, not tolerated (`seamFree`; §3.1 "kept by later edits" and §3.3's seam note, superseded at the
  seam).** A lean whose stored face would twist by exactly ±90° — `face 'width'` with `x === 0`, or `face 'thickness'` with `z === 0`, in
  the stored turn-0 frame — faces the OTHER dimension (twist 0). At the closed end of the reduction a mirror maps the twist to itself
  while S · Ry(90°) · S = Ry(−90°), so mirror conjugation (§3.4) failed. An exact equality on stored slopes, no tolerance; the loader,
  `setLean` and `leanMap` all use the seam-free face, so the stored face is re-chosen there. Cost: a rake-only or splay-only leg's
  features turn 90° about its axis (the same box) when an edit lands exactly on the seam; its ends are stale then anyway. What is left
  of §3.3's seam — a 180° spin when the sightline crosses it through a sign change — is unchanged (fu 440).
- **Ruling 2 — a zero lean is no lean.** `leanMap` returns null at `x === 0 && z === 0` and `seamFree` leaves it alone: σ = atan2(0, 0)
  would otherwise twist a seam-free face by 90°. Never stored (the loader drops it; `setLean` removes the key). Cost: none.
- **Ruling 3 — removing a lean.** A patch whose `lean` key is present with value `undefined` deletes the stored key everywhere
  (`sharedPatch`, the Shape, every lowering); scoped to `lean`. "Clear lean" (§4) is this. Cost: none.
- **Ruling 4 — `setLean` writes one lean per Shape, and magnitude and direction are separate controls (§4's "an edit writes the same
  world lean to each selected part", superseded).** Selected users of one Shape collapse to the FIRST selected; the rest follow through
  the Shape, each in its own hand (a Shape cannot hold one world lean on both sides of a mirror; linked legs splaying symmetrically is the
  point of linking). Each field shows a shared MAGNITUDE and is empty-mixed only when magnitudes differ; typing keeps EACH part's own world
  sign (`keepSign`; a zero part takes +); the direction select writes its direction to all and keeps each magnitude (`rakeSign` /
  `splaySign`). One edit, one undo entry. Cost: to force one direction on a mixed pair, use the select.
- **Ruling 5 — `cuts.ts`' `solidWorldBox` / `pointToLocalXYZ` stay lean-free (§6.1 R1's list, narrowed).** They are group-relative;
  BoardMesh's group carries the lean, so composing there would lean twice. Their only production caller is BoardMesh. Cost: a future
  non-viewport caller would read pre-lean coordinates (their doc comments say so).
- **Ruling 6 — snap points are built pre-lean, then mapped (§6.2).** `boardSnapPoints` builds and `stockProbe`-filters the lattice in the
  pre-lean placement, where the closed spans are exact, then maps the survivors; `fromWorld` (the inverse, then `fromWorldOffset`) is
  exported. It is exact only for an unleaned part: through a lean it carries ~1e-15, so it is never fed to an exact closed-span test.
- **Ruling 7 — Level's top reference R (§5's "the top is always extended" and "always moves the pivot", narrowed to an uncut top).** The
  top plane passes through R: where an existing recognised top cut's plane meets the leaned axis (its centre station), else the pivot. A
  first levelling extends the top and moves the pivot up the axis, as §5 says; a re-level keeps the seat-joint height, so after a lean
  edit the top change can be negative, `levelPlan` is idempotent and a second press pushes no undo entry. The floor refusal reads R
  (`R.y ≤ 1e-9`), which is the pivot on a first levelling. (The brief's algorithm grew the leg on every press and `isLevelled` could never
  be true.) Cost: after a lean edit the top re-levels at the old joint height (intended).
- **Ruling 8 — which end cuts Level replaces or refuses (§5's "if an existing angle cut is on an end: refused", narrowed).** On a leaning
  part ANY end miter (`kind 'miter'`, `face 'length'`), along width OR thickness, is a recognised level cut and is replaced in place (ids
  kept): a lean edit can flip the seam-free face (Ruling 1), and cuts levelled along the old face must never be stranded. Any other kind on
  an end (bevel, chamfer) refuses with §5's wording; a taper is not on an end and is kept (refusing every tapered leg would block the
  commonest splayed-leg shape). A further recognised cut on one end (only a hand-edited file) is removed. New cuts slope along
  `seamFree(lean).face`. Cost: a deliberate decorative end miter on a leaning leg is replaced by Level (undo restores it).
- **Ruling 9 — a shared leg (§5).** Length and angle cuts are written ONCE through the clicked user; each storage target writes its own
  planned position; users whose pivots differ in world Y by more than 1e-9 refuse with §5's sentence naming every user (deduplicated); a
  mate whose own plan's length differs by more than 1e-9 throws (an internal guard, not copy). Cost: the refusal names the users that
  agree too (fu 446).
- **Ruling 10 — the silhouettes take the WORLD view direction (§6.2's "the view direction mapped into the part's frame", superseded).**
  `silhouetteLines` and `curveEdgeLifts` receive the plain `view.toward`: since `toWorld` composes the lean, every direction they compare
  against it is already leaned, so `inverseDir` would lean twice (it is the pinned mutation). Cost if wrong: a curved leaning part's
  silhouettes misplaced (a test pins them against world normals).
- **Ruling 11 — the own-wood probe lift on a leaning part (§6.2, added).** Every edge of a leaning part carries inv 47's along-view probe
  lift (`ownWoodLift`, from the faces whose plane holds the edge, normals turned by the lean): a lean makes every face oblique to every
  view, and without it a 14.3° leg drew 5.6" of 15" in Plan. Other wood still hides it (pinned). Cost if wrong: a leaning part's own
  hidden edges could show as visible.
- **Ruling 12 — the Plans note (§6.2's example, reworded).** `<name>: rake 8.0° toward the front, splay 12.0° toward the right — resultant
  14.3° on a 33.5° sightline`, from WORLD slopes; a component that READS `0.0°` after rounding prints `rake 0.0°` with no direction words
  (a turned stored 0 comes back −0, which an exact-zero rule would print "toward the back"). The name is the trio's stored name. Cost: a
  0.04° component prints without its direction word.
- **Ruling 13 — the design checks (§7.2, made definite).** The contact tolerance is `LEVEL_EPS` = 1e-9 on the face normal's horizontal
  part (float error only; 0.5° is not a contact). A resting contact needs plan overlap > `REST_AREA` = 1e-9 sq in (float slivers where
  faces share only an edge). A leaning part resting on a leaning part uses the same level-face-on-level-face rule (§7.2's under-defined
  case; conservative). Nothing is held "between" leaning parts or lapped onto a leaning leg's side in this chunk: aprons and stretchers on
  splayed legs report unsupported or hangs until chunk 3 (fu 438). A grounded leaning part off the floor keeps the existing `hangs`
  sentence (no new copy, fu 439). The tip footprint is the bounding boxes of the feet's floor polygons (fu 444). The hint is the clause
  `; it leans, and its foot is not level: Level the ends`, appended to the unsupported message (and `shown`) only for a leaning part
  with no level down face.
- **Ruling 14 — Repair refuses only with cuts present (§8's "refused up front when the document has a leaning part", narrowed).** The
  Joinery dialog always runs Repair; refusing every leaning document would stack a second refusal under joinery's. A leaning document
  with no cuts is "nothing to repair"; one with cuts shows both sentences (both true; rare). Cost: cosmetic.
- **Ruling 15 — Refine refuses a leaning part inside an assembly (§8, added; new copy).** `Refine can't keep a leaning part inside an
  assembly yet — Ungroup it first: <name>.` (reason `'lean-assembly'`): Refine rebuilds every definition from the model's assembly, so a
  kept part there has no stable container. The §3.4 idiom builds legs at the root. Cost: a grouped staked piece must be ungrouped before
  Refine (fu 441).
- **Ruling 16 — no floor shift while any part is kept (§8 constraint (b): its second option).** With the first option a model part below
  the floor would move the kept legs; shifting the model's parts only would separate the seat from the legs. A model part left below the
  floor stays there, and the design checks report it.
- **Ruling 17 — Refine's keep, as built (§8, made definite).** `keptParts` keeps every ROOT stored part whose resolved form leans, its
  Shapes and flat names; the model is told in the USER turn with real bounds (`keptNote`); a loose model part reusing a kept flat name is
  dropped before conversion and reported as `Replaced by the kept part of the same name: <names>` (my wording; the kept line is the
  verbatim `Kept as is (leans): <names>`); `jointFaults` is unchanged (a stray `angle-joint` fault between a kept leg's level top and a
  seat did not appear; the fix if it does is to exclude leaning parts from its sites); `KEEP_LINE` is unchanged; kept parts count toward
  the result's part caps (fu 442); a model ASSEMBLY placement named like a kept part is renamed by the load gate, not reported (fu 443).
- **Ruling 18 — a hand-loaded leaning part with holes (§8's "section caps then omit its bores, with a note", narrowed).** It is kept and
  drawn, and its section caps omit the bores, but no note is shown (fu 437).
- **Ruling 19 — where the posture refusal lives (§3.2).** `postureRefusal` (treeEdit.ts), the one decider the store and the Posture field
  share; `updateBoards` / `updateBoard` return its sentence. `setLean` and `levelEnds` return null silently while gesturing or exploded
  (the copy table has no sentence for those).

Unchanged from the text: §3.2's pivot and `position` meaning; §3.4's conjugation (`leanFlip` in `mirrorFeatures`, `lowerLean` in
write-back); §6.1 R2 and R3; §6.2's delta-rounded drags (`dragTarget`; a group with a leaning part rounds `snap(minCorner − bounds.min)`);
the section caps through `clipConvex` (built in the pivot frame, returned in leaned world coordinates, drawn outside the leaned group); the
cut list, nesting and Buying.
