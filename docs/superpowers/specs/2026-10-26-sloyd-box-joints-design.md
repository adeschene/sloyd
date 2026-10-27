# Box joints (dovetails chunk 1) — design

Status: APPROVED by the user 2026-10-27 ("Approved, write the plan"). BUILT 2026-10-27 on branch `box-joints`; the *Amended (build)* block and the equal-fingers amendment APPROVED by the user 2026-10-27 ("Approved, merge it") and merged to master (not deployed). Builder check taken 2026-10-27 (seven questions: five settled as my
calls, two ruled by the user, §5.2 and §7; three claims the code contradicted, corrected). Feature gap §1, "Dovetails, box joints" (`docs/feature-gaps.md`); the
user chose "Box joints, then dovetails" and asked to skip the design questions, so every decision below not quoted from the
user is **my call** and is marked as such where it matters. Dovetails get their own spec after this chunk ships (§11).

## 1. What and why

A box joint (finger joint) is the workhorse corner of drawers, keepsake boxes, tool chests and small carcasses: two boards
meet at a corner, both run out to the outside faces, and each end is cut into fingers that interlock with the other's. Today
Sloyd can model a corner only as a butt, a rabbet or a dado (Add joinery), or as an overlap the design check reports. A
woodworker who wants box joints works out the finger count and the outer finger widths by hand, then cuts five to fifteen
notches per end by hand in the Cuts section. Working out those numbers is the job Sloyd exists to do.

Every finger notch is a plain **rectangular cut** entering from the part's end, running straight through its thickness: the
existing `Cut` already stores one exactly (`face` = the dimension running into the corner, `from` = that end, `across` =
`thickness`, `offset`/`width` along the joint line, `depth` = the mating part's thickness, `stopMin = stopMax = 0`). So this
chunk is **one action, Box joint the corners, plus one cut-list line** — and, my call, **no schema change**. A box joint is
stored as ordinary cuts and recognised from their shape when read (the precedent is `tenons.ts`' `findTenons`, fu 180: tenons
recognised from shoulder cuts, never stored). Rolling back past this round costs nothing: an older build shows the fingers as
plain cuts.

Who it serves: anyone building a box-jointed drawer, box or case. Dovetails come next (§11). Their geometry is not a
rectangular cut, so they need a new stored feature.

## 2. Goals, non-goals, anti-goals

**Goals**
- (G1) **Box joint the corners**: select two or more parts. One action (one undo entry) finds every corner they make in
  pairs, runs both parts of each corner out to the outside faces, and cuts interlocking fingers into both ends. The design
  check passes on a box-jointed drawer box.
- (G2) **The bench numbers**: on the cut list each jointed end reads as ONE line (finger count, finger width, the outer
  fingers' width, depth, which end, and whether this part has the outer fingers or the outer notches), never as a pile of
  notch lines. The part's length is already the length after jointing.
- (G3) **Change it by running it again**: running the action on corners that are already box-jointed re-plans them
  (a new finger width, or swapped fingers) in place, as one undo entry.
- (G4) **Refine keeps them**: Refine works on a box-jointed project, joined or not, and keeps every box-jointed part
  exactly (§7).

**Non-goals for this chunk** (each a follow-up, §12)
- Dovetails of any kind (§11).
- Fingers left proud for sanding flush, and glue clearance: the model is the finished, flush joint.
- Corners whose two parts differ in height along the joint (a drawer front taller than its sides): refused.
- Box joints on a part that leans, or that carries an angle cut, curve, edge profile, edge band or round tenon (refused;
  v1 is plain stock, plus grooves and dados, §3.5).
- Add joinery choosing a box joint as a joint kind (§7).
- A pinned or dowelled box joint, a box joint at an angle (a splayed box).

**Anti-goals** (failure even if it "works")
- **No overlap is made, no gap is left.** The fingers of each corner are cut from ONE planned layout, so the two parts'
  fingers and notches are exact complements (to 1e-9). The design check sees touching faces, never overlap.
- **A project without a box joint is byte for byte as before**: no reader, check, drawing or cut-list line changes for it.
- **Nothing is stored that an older build would refuse.** No new field and no new `Cut` value.
- **The cut list never calls a finger "a tenon" or prints one notch per line.** The recogniser runs before the tenon
  finder and the per-cut lines (§5.2).

## 3. The geometry (my calls)

### 3.1 What counts as a corner

**Order of the tests** (my call, builder check): a pair is a *candidate* only when its thickness axes are perpendicular
AND each end reaches into the other's thickness (the first and third tests below). Only a candidate can be refused for the
height test. A non-candidate pair is simply not a corner, so selecting a whole drawer with its bottom panel never refuses
because the front and the bottom differ in span.

Two selected parts A and B, both unleaned (every unleaned part is axis-aligned: quarter turns only), make a corner when:
- **their thickness axes are perpendicular** world axes `tA` ≠ `tB`. The third world axis is the **joint line** `J`; the
  fingers alternate along it.
- **they span exactly the same interval along `J`** (to 1e-9). Otherwise refused: `<A> and <B> must be the same height
  along the joint.` (the word "height" is copy-review material; `J` is vertical on a drawer).
- **each one's end reaches into the other's thickness**: along `tB`, A's end facing B lies in B's thickness span
  `[b_near − TOUCH, b_far + TOUCH]`, and along `tA`, B's end facing A lies in `[a_near − TOUCH, a_far + TOUCH]`. "Far" is the
  face of the slab away from the other part's body (judged by the other part's centre). This accepts the three ways a
  woodworker models a corner before jointing: a **butt** (A runs to B's outside face, B stops at A's inside face), **both
  running out** (overlapping at the corner, which the check reports today), and both stopping at the inside faces (an
  empty corner).

A part end may belong to only one corner (`<part> meets two parts at one end.`). **No three-way corners** (my call,
advisor): a part may be jointed at ends of ONE dimension only. A side jointed to the front (`J` = Y) and to a bottom (`J` =
Z) refuses: `<part> would be jointed on two kinds of edge — box joint the sides and the bottom separately isn't supported
yet.` (wording for copy review). Two reasons. One corner's run-out changes the part's span along the other corner's joint
line, so the result would depend on the order the corners were planned. And the cube where three parts meet would be
claimed by three layouts at once. A six-sided box or a tray with a jointed bottom is a follow-up. Selected parts that make no corner with any
other selected part are ignored, and the success note says so (`<part> isn't at a corner with another selected part.`). A
selection with no corner refuses: `These parts don't meet at a corner.`

### 3.2 Running out to the corner

The **corner square** is A's thickness span (on `tA`) by B's thickness span (on `tB`). Each part's end is moved EXACTLY to
the other part's outside face (`b_far` for A, `a_far` for B), growing or shrinking that part along the dimension that runs
into the corner. That is usually its length, but a part may run in with its width; this is general. The move is exact,
never rounded to the drag grid (inv 25: an exact move).

Moving an end goes through the same core joinery's `resize` uses (`recipes.ts`: the dimension changes, `position` moves on a
min end, and cuts, angle cuts, holes, curves and profiles are rebased so they stay put in the world). The document layer
cannot import `generate/`, so that core moves down into `document/` and `recipes.ts` imports it. The move itself is the
builder's choice, under ONE resize core, never a copy (§13).

### 3.3 The finger layout (ONE layout per corner)

Inputs: the shared span along `J` of length `H`, and the typed **finger width** `w`.
- **Default `w`** (my call): the thinner part's thickness, rounded DOWN to the drag grid (`snapStep`; metric, whole mm),
  never below 1/4" (6 mm). For 3/4" stock that gives 3/4" fingers, for 1/2" drawer sides 1/2". The field remembers the last
  typed value for the session.
- **Count `N`**: the odd number nearest `H / w`, at least **5** (my call, below): `N = 2·round((H/w − 1)/2) + 1`.
- **Widths**: the `N − 2` inner fingers are exactly `w` wide. The two outer fingers share what is left equally:
  `e = (H − (N − 2)·w) / 2`, which lies in `[w/2, 3w/2]` by the choice of `N`. When `H` is an odd multiple of `w`, every
  finger is `w`. This is how a woodworker using a box-joint jig or dado stack works: one fixed finger width, with the slack
  at the edges, centred. The finger positions are derived exactly and are never rounded. Display rounds; stored values are
  exact (inv 5, inv 18).
- **Phase**: one part of the corner has the two **outer fingers** and `(N − 1)/2` notches between fingers; the other has
  the outer notches, `(N + 1)/2` notches with two at the edges. Default (my call): the outer fingers go on the part whose run
  axis (the world axis it runs into the corner along, `tB` for A) comes first in the order Z, X, Y. On a drawer that puts
  them on the sides, which run front to back. The rule is the same for left and right, so mirrored, linked sides agree. A
  **Swap fingers** checkbox inverts the phase for every corner in the action.
- **Depth**: each part's notches are exactly the OTHER part's thickness deep (flush; proud fingers are a non-goal).

**Why at least five fingers** (my call, measured against the code): with three, the outer-notch part's end is two edge
notches leaving one centre rectangle, which `findTenons` (`tenons.ts`: two or more cuts at a length end whose union leaves
exactly one rectangle) already reads as a tenon. Five or more always leaves two or more rectangles on both parts, so the
existing tenon finder never claims a finger. That holds even if the box-joint recogniser were bypassed. A corner too short
for five fingers of width `w` (`H < 4w`) refuses: `<A> and <B> are too short for five fingers that wide — try narrower
fingers.`

### 3.4 The cuts written

Per jointed end, one `Cut` per notch: `face` = the dimension running into the corner, `from` = that end, `across` =
`thickness`, `offset` and `width` along the part's dimension on `J`, `depth` as §3.3, `stopMin = stopMax = 0`.

**Planned in part-local terms, never world-minus-position** (my call, advisor). The layout is a palindrome (equal outer
fingers, equal inner ones), so the direction a turn gives the part's `J` dimension cannot matter. Notch `k` therefore sits
at a part-local offset computed directly as `e + (k − 1)·w` (or `0` for an outer notch), never as a running sum and never
converted from world coordinates. The last outer segment's width is `H −` its start. Both parts of a corner use the ONE `H`
(the shared span). Twin parts then get bit-identical cuts whatever their positions, so linked users agree (§6) and identical
sides stay one cut-list row (inv 40). Only the corner finding, the run-out and the phase are judged in the world. Converting
those uses the `axisFrame` helpers (inv 44), never `board[dim] − u` at a call site. Ids are minted ONCE per
STORAGE target (`storageKey`, inv 46), not per world part (builder check: `applyWorldEdits` merges a Shape's fields by
`sameRecord`, ids included, so per-board ids would throw `disagreeing edits` instead of refusing). A `mirrored` user's Shape
cuts are planned directly in Shape-local terms from the agreed parameters (§6), never lowered through `mirrorCut`, which is
not bit-exact on non-dyadic sizes (`treeEdit.ts`). Two notches never touch: a finger separates every pair, so `cutsThatRemoveStock` keeps them
all.

### 3.5 What a part may already carry

- **Rectangular cuts that run straight THROUGH the corner along the run dimension** (`across` = the run dimension: a drawer
  bottom's groove, a dado along the side) are allowed and carried by the move (§3.2). Where such a groove meets the fingers
  it shows through an end finger, as it does on a real drawer.
- **An existing box joint at that end** (recognised, §5.1) is REPLACED: its notches are removed and the new layout's added,
  in the same edit (G3). Ids of the new notches are fresh. My call: keeping ids by position is not worth the code when
  nothing references a cut id.
- **Any other cut that removes stock inside the corner square's slab of that part** (a rabbet at the corner, a tenon's
  shoulders, a hand-made notch) refuses: `<part> has a cut where the fingers go — remove it first.`
- **A hole row reaching the corner region** refuses (`<part> has a hole where the fingers go.`). Elsewhere on the part
  holes are fine and are rebased by the move.
- **A lean, an angle cut, a curve, an edge profile, an edge band or a round tenon anywhere on the part** refuses
  (`<part> has <a curve | …> — box joints work on plain stock for now.`). That is narrow on purpose. Lifting it means
  judging each feature against the corner region (joinery's `featureZones.ts` is the model) and is a follow-up.

## 4. The UI: Box joint the corners

In the Properties panel's multi-selection view (`N parts selected`, where Add stretcher already lives), a **Box joints**
section (my call on placement and words; copy review owed):
- **Finger width**: a `DimensionField` (inv 5's draft rules apply), default as §3.3.
- **Swap fingers**: a checkbox, off.
- **Box joint the corners**: the button. It is disabled only while a field fails to parse. A plan refusal shows after the
  click, the way Add stretcher shows its refusals (builder check: `Stretcher.tsx` decides nothing live, and running the
  planner on every change would need a primitive-keyed memo, invs 34 and 43).
- On success, a note under the section (new store-held view state, cleared on the next selection change; the builder's
  plumbing, since Add stretcher's note lands on the new rung's own panel instead): `Jointed 4 corners: 7 fingers, 1/2" wide (the outer two 5/8").` Plus one line per part whose length
  changed: `Front is now 3/4" longer.` / `Side left is now 3/8" shorter.`, and any ignored part (§3.1). The note is an HTML
  note under the section, as Add stretcher's readout is.

Refused while exploded (inv 47: `readOnly()` at entry; the section sits inside `EditLock`). ONE undo entry for the whole
action. Held points are re-judged after the edit (`judgeHeld`, inv 24): a held point on a moved part end may drop.

## 5. What the readers see

### 5.1 The recogniser (ONE home)

`boxJoints.ts` is the ONE home: the planner (§3) and the recogniser `fingerSets(board)`. A **finger set** is decided on the
board alone, never the world, and **from the cuts' SHAPE, never their stored fields** (my call, builder check: the repo's
rule, fu 181/192 and the `setupLine` comment in `cutlist.ts`; the resize core re-stores a cut into a moving end as a
thickness-face pocket, `recipes.ts` `refaceFromEnd`, and a field-reading recogniser would silently stop seeing it). At one
end of one dimension `D` (`length` or `width`): the stock-removing cuts whose clipped region (`clippedRegion`) is open at
that end face, runs fully through `thickness`, and reaches one shared depth along `D` (exactly). Read along
the board's other non-thickness dimension `P`, those notches and the fingers left between them must alternate across ALL of
`P` in `N ≥ 5` (odd) segments, with every inner segment exactly one width `w` and the two edge segments equal (to 1e-9).
That is exactly the layout §3.3 builds, so recognising is planning's inverse, and a test round-trips the two. A finger set
reports `{ dim, end, count, width, outer, depth, outerFingers: boolean, cutIds }`.

Any other set of cuts is not a finger set and reads as before.

### 5.2 The cut list and drawings

- **Setup lines**: `setupLines` claims finger sets FIRST. One line per set replaces its notches' per-cut lines, the way
  `tenonLine` replaces a tenon's shoulder cuts. Draft wording (copy home `boxJointText.ts`, through `units/length.ts`,
  inv 52): `Box joint — 7 fingers 1/2" wide (the outer two 5/8"), 3/4" deep, at the length max end; this part has the outer
  fingers.` / `…; this part has the outer notches.` When every finger is `w`: `… 7 fingers 1/2" wide, 3/4" deep, …`.
- **Row identity** is unchanged: `cutSignature` already groups two sides with identical notches as one row (inv 40), and
  the recogniser reads the representative board, as `setup` does.
- **Part diagrams** (the user's ruling, 2026-10-27: "One note per finger set"): the notches are drawn as today, but a
  finger set's notches get NO per-notch dimension leaders and no "dado" label. Instead ONE HTML note under the figure carries
  the set's line, the way hole and curve notes do (inv 19: notes under the figure, never measured SVG labels). This is new
  drawing code in `diagram.ts`/`PartDiagram.tsx`. A diagram with no finger set is byte for byte as before (the existing
  `diagramIdentity` tests).
- **The Plans sheet, the section view, the viewport**: unchanged. Notches are pocket cells, and every one of them already
  draws, edges, occludes and caps rectangular cuts.
- **`→ units` edge** (CLAUDE.md): `boxJointText.ts` takes `units` (a copy home). `boxJoints.ts` stays numbers-only, apart
  from a TYPE-only `Units` import for the default width.

### 5.3 The checks (nothing new)

The fingers are pocket cells, and `worldSolids` already measures overlap between them, so the joint's faces touch and
never overlap. No check changes. A box-jointed drawer standing on the floor is grounded as today. **Required test**
(builder): a box-jointed four-sided drawer, and a small carcass whose top is box-jointed onto two sides (the top off the
floor), both pass the design check unchanged. If the carcass top comes back unsupported, STOP and bring it to the user.
Granting support to fingers is a check change (inv 39) and a human decision, never something to patch silently.

## 6. Linked parts, assemblies, copies

- **Each corner's two parts must be siblings in one container** (my call; judged PER CORNER, builder check). One action
  may joint corners in several containers, e.g. two drawers whose sides share one Shape, which the linked-mate rule below
  needs. A corner whose parts are in different containers refuses: `<A> and <B> must be in the same assembly.` A drawer is one assembly. Writes go back through `treeEdit.ts` (inv 46, the write-back that keeps the world
  position, as joinery's `keepWorld` does), so a part inside a Definition edits every copy. Each copy's corner partner is in
  the same Definition, so every copy stays matched.
- **A part inside a mirrored copy refuses** (`Box joints can't reach a part inside a mirrored copy yet: <part>.`), as with
  stretchers.
- **Linked parts** (inv 45: `length`, `width` and `cuts` are SHARED): when a jointed part is linked, EVERY other user of its
  Shape must also be jointed at the matching end (by Shape-local end) in the same action, else it refuses: `<part> is
  linked to <mate> — select <mate>'s corner too, or Unlink first.` That stops a Shape-level size change landing on a mate
  whose partner is not being jointed. It also avoids picking which end a mate grows from: every user is planned explicitly.
  The edits planned for one Shape from its users must then agree on their layout PARAMETERS (count, `w`, `e`, depth,
  phase, the Shape-local end, and the run-out's new size). The Shape's cuts are then planned ONCE from those parameters,
  never compared as reflected floats. Otherwise: `These linked parts would need different box joints: <parts>.` On a
  symmetric drawer with linked left and right sides, selecting all four parts plans both sides alike, and they agree.

**Single-part view** (my call, builder check): the Cuts section lists a jointed part's notches as ordinary rows, 6–16 of
them, as it lists any cut. Editing one breaks the shape and the part reads as plain cuts again, which is honest. A
finger-set readout or lock in that section is a follow-up.

## 7. AI paths, joinery, Refine, Repair

**Add joinery** (my call, builder check): `findSites` already skips the corner itself (the two run-out boxes
interpenetrate). But a site at a recognised finger-set end elsewhere (a false front glued over a box-jointed drawer puts
the sides' end grain against the front's face) could grow the jointed end and re-store its notches. So joinery SKIPS any
site whose entering part would grow or be trimmed at a recognised finger-set end, with the reason `<part> has box joints, so
joinery leaves its size and place alone` (the build widened and reworded this, see *Amended (build)*). This is decided before any mutation, as `cutIntoEnd` is (inv 41). That is the one joinery change.

**Refine keeps box joints** (the user's ruling, 2026-10-27: "Refine keeps box joints"). Today any cut sends Refine
through `gateUnjoin` (`refine.ts`), and fingers are cuts no joint explains, so the whole project would refuse with
`GATE_REFUSAL`. Instead:
- Recognised finger sets are claimed BEFORE the gate and never reach `readJoints`. The gate judges only the cuts that are
  left.
- A box-jointed part is KEPT exactly through Refine (its size, position, fingers and every other field), joining the
  `keepsExactly` / `keptParts` set (inv 56). The model sees it as a fixed part. A Refine that would change a kept part
  is handled as the existing kept kinds are.
- Unlike the existing kept kinds, a JOINED project with box-jointed parts must still Refine (a cabinet with dados plus a
  box-jointed drawer is the common case). The re-join must leave every finger set exactly as it was (§7's joinery skip
  rule covers the jointed ends). The plan works out the mechanism. **If the joined case cannot keep the fingers exactly,
  the builder stops and brings it back to the user** rather than refusing silently. A box-joint-only project (no other
  joints) Refines with the box-jointed parts kept.
- A box-jointed part inside an assembly follows the kept kinds' existing rule (inv 56). If that refuses, the refusal names
  the box joint.

**Amended 2026-10-27 (the user's ruling: "Widen Task 6 to assemblies").** A box-jointed part inside an assembly no longer
refuses. Refine keeps its WHOLE assembly exactly as stored: the definition (every part in it, box-jointed or not) and every
placement of it. My call: the whole assembly is the unit kept, never one part spliced into a definition the model rebuilt.
The model can rename an assembly, move or add placements, and change its parts; any of those would land a spliced part
somewhere new. A box-jointed drawer is one unit anyway: its sides cannot change without re-cutting the fingers.
- The cost, said plainly: **an instruction about a kept drawer ("make the drawer deeper") does nothing to it.** The model
  sees the drawer as fixed, as it sees a kept root part.
- The kept assembly is left out of the design and named in the kept note, one line per placement, with world bounds.
  It goes back into the result FIRST, before the load gate, so the first-wins id and name repairs (invs 33, 8) keep the
  user's names. A model assembly placement, or a loose part, reusing a kept placement's name is dropped and listed as
  replaced, as a kept root part's name is today.
- A part in a kept assembly linked to a part outside the kept set refuses Refine ("Unlink first"), so a kept Shape still has
  only kept users.
- The other kept kinds (leaning, tilted row, round tenon, compound cut) inside an assembly keep their existing refusal,
  word for word. Widening those is a follow-up.
- A joined project treats the kept assembly's parts as it treats kept root box-jointed parts (the rule above).

Add joinery and Repair: Repair already makes no offer on unexplained notches (`repair.ts`). With finger sets claimed
first, it ignores them. Generate never authors a box joint. The design schema is byte for byte the same. Add joinery
choosing a box joint as a joint kind is a follow-up.

## 8. What it costs if wrong (my biggest calls)

- **No schema, recognised from shape.** If a later feature needs to know a set of cuts *is* a box joint while its shape is
  broken (one notch edited by hand), the recogniser stops seeing it and the cut list falls back to notch lines. That is an
  honest fallback, not a wrong answer. A stored marker would need a schema bump; cheap to add later.
- **Fixed finger width, slack at the edges.** Matches jig practice. A woodworker who wants all-equal fingers types
  `w = H / N`, and the line then omits "the outer two". If the user prefers equal fingers as the default, that is a
  one-function change.
- **At least five fingers.** Keeps the tenon finder honest without touching it. A three-finger corner is rare, and the
  refusal says what to do.
- **Refine keeps box-jointed parts exactly.** The model cannot resize a drawer box that has box joints, only the parts
  around it. A woodworker who wants it resized changes it by hand and runs Box joint the corners again.
- **Plain stock only (plus through grooves).** Covers drawer boxes and plain boxes, the common case. A part with a
  roundover on its top edge refuses until the feature-zone follow-up.
- **A linked mate must come along.** Stricter than stretchers (which bore a mate's socket and say so). A size change is
  more invasive than a hole, and the alternative needs a rule for which end a mate grows from.

## 9. Records

A new invariant 61 (the builder words it in full in `docs/invariants.md`, condensed in CLAUDE.md): a box joint is ordinary
rectangular cuts; `boxJoints.ts` is the ONE planner and the ONE recogniser, and they are each other's inverse; one layout per
corner, exact complements; no schema; a box-joint-free project is byte for byte as before. Also `docs/module-map.md`,
`docs/rounds.md`, `docs/follow-ups.md` (§12's follow-ups added), and the feature-gaps row ("box joints shipped; dovetails
open").

## 10. Tests the builder owes beyond the usual

- Round trip: for a spread of `H`, `w`, phases and turned parts, `fingerSets` of the planned parts returns exactly the
  layout planned. Mutate the planner (drop a notch, shift one by 1e-6) and the recogniser must stop recognising.
- Complements: per corner, the union of the two parts' world finger boxes is exactly the corner square, with no
  overlapping pair (to 1e-9).
- `findTenons` claims nothing on any planned part (`N ≥ 5`). Mutate the minimum to 3 and that test must fail.
- Byte-for-byte: a box-joint-free fixture's cut list, drawings and plans are unchanged (the existing identity tests).
- §5.3's two check fixtures.
- A part diagram with a finger set shows one note and no per-notch leaders; the existing diagram identity tests stay green.
- Refine on a box-joint-only project and on a joined cabinet with a box-jointed drawer keeps every finger set exactly; a
  joinery site at a finger-set end is skipped with its reason.
- Each refusal is decided before ANY mutation, with one test per refusal, including the three-way corner (§3.1).
- Two linked sides at different world positions, one of them `mirrored`, plan bit-identical Shape cuts (§3.4, §6).

## 11. Dovetails (the next chunk, its own spec)

Recorded so the next spec starts from it, not decided here. A through dovetail's **tails** board loses trapezoidal waste
running straight through its thickness. A `CurveCut` through `thickness` with straight segments could express that today.
The **pins** board's waste is a trapezoid in its END face, cut back to a baseline, so it does not run all the way through
the part. No current feature stores that (a curve cut runs through the whole part; a rectangular cut has square walls). So
dovetails likely need a new stored feature (an angled-wall end notch) and a schema bump. Half-blind dovetails (drawer fronts)
need a stopped version of it. The planner shape of this chunk (select parts, find corners, one layout per corner, run out,
recognise on read) carries over unchanged.

## 12. Follow-ups to add

Dovetails (through, then half-blind; §11); box joints on parts of different heights along the joint; box joints on featured
parts (feature zones); proud fingers and glue clearance; joinery choosing a box joint as a joint kind; a
three-finger corner (teach the tenon finder to give way); pinned box joints.

## 13. Left to the builder

- Where the moved resize core lives in `document/` and its name (ONE core, `recipes.ts` imports it).
- The exact far/near and corner-finding arithmetic, within §3.1's rules and tolerances.
- The live-refusal plumbing in the panel (copy Add stretcher's).
- UI wording beyond the quoted sentences (copy review is owed to the user, as for every round).
- The invariant's full wording.

## Amended (build)

Rulings made while building (2026-10-27). **APPROVED by the user 2026-10-27** ("Approved, merge it"); the copy is fu 491.

**Spec differences**
- **D1 — siblings.** `selectionPatch` keeps only direct children of the open assembly, so every selection is one container's siblings. The
  per-corner container refusal stays in the planner but no selection reaches it; §6's two drawers jointed in one action is impossible: linked
  sides in two drawer assemblies take the linked-mate refusal (`Unlink first`).
- **D2 — the success note** is held in the section's own state, not new store state (§4); a selection change clears it, since the section remounts.
- **D3 — linked write-back** is `writeBackParts` (`treeEdit.ts`), not §6's representative-plus-position-only-mates: `mapWorld` cannot take a
  position-only mate beside a size change (it throws on an unmirrored one, lands a mirrored one off in a turned assembly) and misplaces any
  part that grows at its world-MAX end. Every user gets its full after-state, one edit per storage key, `keepWorld`, `regroupShapes`; a result
  that would split a link refuses (`boxLinkSplit`: `Box joints can't keep these linked parts linked: <parts>. Unlink them first.`). A link-split
  refusal can reach a user with all-mirrored metric links.
- **D4 — the tie** (my call, needs the user's sight): §3.3's `N = 2·round((H/w − 1)/2) + 1` leaves a tie (a 4" drawer side at 1/2") to `Math.round`,
  up, to 1/4" outer fingers; the build pins a tie DOWN (3/4" outer fingers, `e = 3w/2`): thin outer fingers break off.
  **Moot since 2026-10-27:** the equal-fingers ruling (the last Amended section) replaced the symmetric layout, so no tie arises (Task 9).
- **D5 — kept assemblies** (the user's ruling, "Widen Task 6 to assemblies"): see §7's Amended paragraph; built as Task 6b.

**Ruling lines from the build ledger**
- **R-T1:** `recipes.ts` re-exports the four moved rebase helpers so unedited tests keep importing them (fu 495).
- **R-T2a:** a recognised width or depth may be an ulp off the planned value (exact for the usual cases, 1e-9 in general); §5.1 forbids reading stored
  fields, and no consumer compares recognised numbers across boards exactly. **R-T2b:** `FingerSet` nests `layout` (§5.1 lists flat fields); the same
  information. **R-T2c:** `notchCuts` throws when `along` is not the cut's position axis (a programmer-error assertion). **R-T2d:** a live test that
  a three-segment set IS a tenon to `findTenons` pins why the minimum is five. **R-T2e:** the recogniser ignores a partial-thickness cut over the
  fingers (§5.1 as written); the planner refuses to make that case.
- **R-T3a:** two parts meet at a corner only when their `J` spans also overlap beyond 1e-9 (a shelf beside a drawer would otherwise refuse the
  whole selection with the heights sentence); a near-miss pair gets the ignored line instead. **R-T3b:** the corner-region rule needs `across === the
  run dimension` AND through (§3.5 names end rabbets and tenon shoulders as refusals). **R-T3c:** a selected leaning part that would be a candidate
  by its pre-lean box refuses with the lean plain-stock sentence before the heights sentence (inv 57 R2). **R-T3d:** the plan's "empty corners: each part 1/2" longer" was wrong (1/2" per end = 1" per part); the build's 1" stands.
- **R-T6a (§7's "kept exactly" met by mechanism, not refusal):** (a) joinery skips or refuses any site that would resize, trim or carry a part
  with ANY recognised finger set, whatever the axis (a pocket INTO it stays allowed); (b) a joined Refine fixes every NEW or unrecorded site touching a
  kept part as butt, but keeps a RECORDED joint into a kept part as recorded (forcing it butt would drop the pocket the read-back took off the part);
  (c) after the re-join, a kept part whose finger sets, size or position differ from the original comes back UNJOINED with a reason (inv 41's
  precedent); (d) Refine refuses, in words, when the gate changed a box-jointed part's sets; (e) the `cuts` defence filters only recognised finger cut ids.
  Cost if wrong: Add joinery skips some sites on box-jointed parts the user expected joined (a tenon into a box-jointed side's END is still skipped).
- **R-T6b:** Repair claims finger sets too (§7's sentence had no owner), and refuses a result that breaks one.
- **R-T6c:** the joinery reason reads `<part> has box joints, so joinery leaves its size and place alone` (§7's `already cut at that end` was
  false when the set is elsewhere on the part); §7 above is corrected.
- **R-T6d (6b):** a loose model part's name is compared TRIMMED against kept placement names (the gate trims, so `" Drawer 2 "` would otherwise win
  the name over the kept placement); kept root names stay exact. **R-T6e:** the (c) sentence is `Joinery would have changed <name>, which Refine
  keeps as it is for its box joints, so the design comes back unjoined.` (it also covers fingerless parts of a kept assembly).
- **R-F1 (final review):** linked users' planned run-out SIZES compare at 1e-9, everything else in the signature exactly. The size is a world
  subtraction (`e.far - p0`), so the same drawer at another X offset can plan it an ulp off (14 of 40 offsets on a 7 mm grid refused as
  disagreeing); this is the same class as R-T2a's recognised-number ulp ruling. The Shape still takes the representative's size, and the link
  post-condition still guards the written result.


## Amended 2026-10-27 (the user's ruling after the build: equal fingers)

The user, on seeing the build: "having differently-sized first and last fingers … is almost never how a person would make
box joints in practice. All fingers should be the same size and the awkwardly-cut fingers at one side should be accepted."
Rulings (2026-10-27): the odd finger goes at the **bottom edge**; a sliver **merges into its neighbour**. This replaces
§3.3's symmetric layout (two equal outer fingers) and the tie rule (spec difference 4), which no longer arises.

- **Layout.** `k = floor(H/w)` (to 1e-9: an `H` within 1e-9 of a multiple counts as that multiple), `r = H − k·w`.
  - `r ≤ 1e-9`: `N = k`, every finger exactly `w`.
  - `0 < r < w/4`: `N = k`, the odd finger is `w + r` (the sliver merged into its neighbour). The `w/4` bound is judged at
    1e-9 (an `r` within 1e-9 of `w/4` is `w/4`, not a sliver; build `r < w/4 − 1e-9`), so the `<`/`<=` mutation is equivalent;
    the real tests move the bound to or past `w/4` (Task 9's M1b and M1c), which `(4.125, 0.5)` catches.
  - `r ≥ w/4`: `N = k + 1`, the odd finger is `r`.
  - Refuse when `N < 5` (the five-segment floor stays: fewer read as a tenon). `N` may be even.
- **Where the odd finger goes.** The odd finger is at J's world min on every axis — the bottom for Y, the back for Z (+Z is
  the front), the left for X — ruled 2026-10-27 after review (full fingers start at J's world max; this replaces "when `J` is
  horizontal, full fingers start at J's world min and the odd one is at the far end", which put it at the visible front).
  Each part's segments are computed DIRECTLY in its own part-local terms,
  from whichever of its own J ends is the start edge (never by world conversion of offsets).
- **Phase.** The part whose run axis comes first in Z, X, Y takes a FINGER in the start-edge segment; the other takes a
  notch there. Swap fingers inverts it. With an even `N` each part has one finger at one edge and a notch at the other.
- **Linked parts (ruled 2026-10-27 after review).** One Shape cannot put an asymmetric layout (an odd finger, or an even
  `N`) at the same world edge on two users that see its J reversed, so both cases REFUSE with the disagreement sentence
  (`These linked parts would need different box joints: <parts>.`): a user mirrored along J at the SAME turn as its mate, and
  UNMIRRORED users at opposite turns (carcass sides at 90° and 270°). A symmetric layout (odd `N`, no odd finger) succeeds in
  both; Mirror's own pair (a mirrored user at the inverse turn) succeeds always.
- **Recogniser (§5.1).** Read part-locally, at least 5 alternating segments: every segment exactly the same width `w`
  (1e-9), except at most ONE end segment, which may be any width in `(0, 1.25w)` (to 1e-9). A set with two differing end
  segments is not recognised. It reports `fingerAtMin` (does J's min segment carry a finger on this part) and `oddEnd`
  (`'min' | 'max' | null`, null when every segment is `w`), never anything world-relative.
- **Copy (replaces the outer-two forms; copy review fu 491 still covers all of it).**
  - Success: `Jointed <n> corner(s): <N> fingers, <w> wide.` with ` (the odd one <x>)` before the period when one exists.
    The per-corner form likewise.
  - Cut list: `Box joint — <N> fingers <w> wide (the odd one <x> at the <J> <oddEnd> edge), <d> deep, at the <dim> <end>
    end; this part has a <finger | notch> at the <J> <start> edge.` The parenthesis is dropped when there is no odd
    finger; the start edge is then J's max (a part-local convention).
