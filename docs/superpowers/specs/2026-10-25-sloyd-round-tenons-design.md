# Splayed legs, chunk 2b: round tenons — design

Status: APPROVED by the user 2026-10-25 ("Approved, write the plan"); builder check taken 2026-10-25 (five questions, each answered below as my call: §5.1, §5.2, §6.3, §6.4). Follow-up 447 (the angled holes spec's §12 outline).
**Built 2026-10-25 on branch `round-tenons`** (plan Tasks 1–11; schema 24); NOT merged or deployed. Browser verification (plan
Task 12, dev server) owed; then merge and deploy (the user's decision). Later rulings: the *Amended (build)* block at the end, which
wins where it differs from the text — **awaiting the user's approval**. Chunk 1 (a part
leans, schema 22) and chunk 2 (angled holes, schema 23) are deployed (`index-B114iN-Y.js`). Chunk 3, stretchers (fu 438),
builds on this one.

The user asked for round tenons next and to skip the design questions, so every decision below that is not quoted from the
user is **my call** and is marked. A read-only survey of every reader a tenon touches is summarised in §11.

## 1. What and why

A staked stool's leg goes up into its seat on a round tenon, glued (and later wedged) in the socket Bore leg sockets now
bores. Today Sloyd has the socket but nothing in it: the leg stops at the seat's underside, resting on its levelled top, and a
leg that went on into the seat would be reported as an overlap. Chunk 3's stretchers are held by nothing else: a rung has no
face to rest on, only a round tenon at each end in a socket in a leg.

This chunk adds a **round tenon** on a part's end, coaxial with its length. It also teaches the design checks that a tenon
seated in a matching socket is a **joint**: the two parts are held together there and do not overlap. And it extends Bore
leg sockets so that one action bores the seat and tenons the legs into it.

Who it serves: someone modelling staked furniture (stools, benches, chairs), anyone fitting a dowel-like round tenon (a
peg rail, a turned spindle), and chunk 3's rungs.

## 2. Goals, non-goals, anti-goals

**Goals**
- (G1) A part's end may carry a round tenon (diameter, length), stored, loaded, drawn, cut-listed and exported exactly.
- (G2) **A tenon seated in a matching socket is a joint**: the design checks hold the two parts together there and do not
  report the tenon's wood inside the socket as an overlap. Matching is structural (stored geometry compared at 1e-9),
  never proximity.
- (G3) **Bore leg sockets can tenon the legs**: in the same action and undo entry, each leg gets a top tenon that fits its
  socket, passing through the seat and cut flush with its top.
- (G4) Every reader that sees a part's shape is correct for a tenon: the viewport mesh and edges, the section cut, snapping,
  drawings, the part diagrams, the cut list's bench line and faults.

**Non-goals for this chunk**
- Stretchers (chunk 3, fu 438).
- Tapered (reamed) tenons and sockets (fu 449).
- Wedges, wedge kerfs and pins through a tenon (drawboring).
- A tenon off the part's centre, on a dimension other than the length, or not round. Rectangular tenons stay joinery's cut-built
  ones (`tenons.ts` recognises them; nothing stores them).
- Generate or Refine authoring a tenon (the design schema is unchanged).
- Plans feature callouts for a tenon (the bench line and part diagram carry it; a follow-up).
- Joinery or Repair working on a part with a tenon (refused, §9).

**Anti-goals** (failure even if it "works")
- **A document with no tenon is byte for byte as before**: meshes, edges, drawings, diagrams, caps, design check results,
  the cut list, export, and every identity and perf test (`bodyMeshIdentity`, `drawingIdentity`, `diagramIdentity`,
  `sweptIdentity`, `bandFreeIdentity`, `holesPerf`, `curvesPerf`).
- **No tenon is lost silently.** A build, a converter or an AI path that cannot carry a tenon refuses or keeps the part
  exactly; it never squares the end.
- **Support is never granted by proximity.** A tenon near a socket, in a socket of another size, or in one bored along
  another line is not a joint, and its wood inside the other part is an overlap, as today.
- No facet lines: a tenon's round surface draws its rims and silhouettes, never the lines between its facets (inv 16, 47).

## 3. The model (schema 24)

### 3.1 Stored form

- **`Board.tenons?: RoundTenon[]`**, at most one per end. `RoundTenon` is `{ id, end: 'min' | 'max', diameter, length }`:
  - `end` is an end of the part's `length` dimension (`min` the foot of an upright part, `max` its top);
  - `diameter` is the tenon's diameter;
  - `length` is measured **along the axis, from the shoulder to the end's centre**: the point where the axis meets the
    end face, square or mitered.
- **Coaxial with the length, centred on the section** (my call: a turned or tenon-cutter tenon). The axis is the length's
  centre line, the one `legAxis` already uses.
- **The shoulder is square to the axis** (my call): a plane of constant length coordinate, the face a tenon cutter or a
  lathe parting tool leaves. On a leaning leg it does not sit flat on a level seat's underside; the joint is the tenon in its
  socket (§5), as in real staked work.
- **The tenon is inside the part's length** (my call): the blank includes it, so the cut list's length is still what you
  buy and cut (inv 18). Adding, editing or removing a typed tenon leaves `length` unchanged (§4); Bore leg sockets' tenoning
  grows the leg on purpose (§6).
- **Absent or empty is no tenon**, and an empty array is never stored, so a tenon-free part keeps its bytes.
- **Ids** take the part's feature-id scope (inv 33: per board, per shape for a shape), re-minted on duplicate like a hole
  row's.
- **Shared** (inv 45): `tenons` joins `LINK_FIELDS` as a shared field (stored once on a Shape, a fresh copy per user), like
  `holes`. **Mirrors flip by flags** (inv 44): a mirror along the length swaps `min` and `max`; across the width or
  thickness it changes nothing. The inverse is the same flip.
- **One field table**, `TENON_FIELDS` (inv 40: every field but `id`, exact, checked by `satisfies`), feeds "same tenon",
  the cut list's grouping and `geometryKey`.

### 3.2 Bounds and faults (`tenonFaults`, the ONE decider)

Each a short sentence through one text home, refused on add and on an edit that ADDS it; a fault a later edit causes
(a resize, a lean, a new cut) is KEPT and noted, never clamped (the holes rule, inv 50):

| fault | when |
|---|---|
| `too-wide` | `diameter` at or above the part's smaller section dimension (`width`, `thickness`). The same rule as `socketTooWide` |
| `too-long` | the shoulders would meet or cross: `length` of this end's tenon plus the other end's at or above the part's length at the centre |
| `cut-reaches-shoulder` | the end's own cut (§3.3) reaches the shoulder anywhere across the full section, so part of the shoulder is cut away |
| `meets-feature` | another feature's region enters the tenon's zone (the end slab from the shoulder to the end): a rectangular cut, an angle cut other than the end's own, a hole row, a curve, a profile or a band. **Conservative** (my call): box tests that may refuse a feature that just clears, never the reverse |

The loader drops a malformed tenon (a missing or non-finite number, a non-positive diameter or length, a duplicate end) and
keeps a well-formed faulted one (Versioning: malformed dropped, faulted kept).

### 3.3 The end's own cut

An end with a tenon may be **square**, or carry **one end miter** (`kind 'miter'`, `face 'length'`, on that end: what Level
the ends writes). That miter is the tenon's **tip**, cut flush with the seat's top. Every other angle cut on that end (an end
bevel, a chamfer, a second cut) is a `meets-feature` fault. Level the ends keeps working on a tenoned end, because the cut
it replaces is the tip (§6.3).

### 3.4 Schema 23 → 24

- **Harm argument:** `validateBoard` rebuilds a board field by field, so a schema-23 build (production today,
  `index-B114iN-Y.js`) would drop `tenons` without a word. The leg would load as full-section stock all the way into the
  seat, and autosave it. A 24 file must be refused by a 23 build.
- **The step** adds nothing (absent is none). Validation is as §3.2.
- **Rollback:** rolling back past it refuses every project saved at 24; the rollback table and `docs/versioning.md` get
  their rows.

## 4. Properties: Round tenons

A new section, **Round tenons**, after Holes, over a pure refusal module (the panels rule). My calls throughout; wording is
the builder's (copy review owed, as fu 454).

- One row per end, named in the panel's existing end words (top and bottom for an upright part, the length's two ends
  otherwise). An end without one shows **Add round tenon**; an end with one shows **Diameter**, **Length** and **Remove**.
- **Defaults:** diameter 1" (25 mm in a metric project), refused as `too-wide` like any value, so a small part starts at
  the largest legal diameter that is a whole 1/8" (whole mm) instead; length 1" (25 mm). The diameter's precision is the
  hole's (`holeLengthText`: 0.1 mm), so a tenon and its socket read the same number.
- **Refusals** follow `DimensionField`'s contract: decided before `edit()`, shown as the field's own error, the typed text
  kept.
- **The readout** under a tenoned end: `Shoulder 16 1/4" from the bottom` (the shoulder's length coordinate at the centre,
  from the far end) and, when seated, `Seated in Seat's socket`.
- **A typed tenon keeps the part's length** (§3.1): the shoulder moves inward. That is the bench reality for a rung whose
  overall length is fixed.
- **One undo entry per edit; refused while read-only** (inv 47).

## 5. The joint: a seated tenon (G2)

### 5.1 Seated, structurally

A tenon on part A is **seated** in a hole row on part B (A ≠ B) when every one of these holds, compared in the WORLD
(`worldParts`, so the two may sit in different assemblies or under mirrors) at 1e-9:

1. the row is a single bore (`count` 1);
2. **coaxial**: the bore's world axis line is the tenon's (the bit parallel to the axis, the bore's mouth centre on the axis
   line). The tenon's axis is the length's centre line through the part's placement and lean, for ANY part, leaning or not
   (`partAxis`, generalising `legAxis`). The bore may be through or blind and enter from any face. My call after the builder
   check: one lower-level predicate, "this bore lies along this axis", is split out of `isSocketOf`. The seated test calls it.
   `isSocketOf` keeps its narrower rule for Bore leg sockets' skip and replace decisions (a through bore from the top),
   rebuilt on the same predicate, so the two can't drift;
3. **matching**: the bore's diameter equals the tenon's;
4. **inside**: the tenon's wood that lies in B lies within the bore's extent. A through bore takes any tenon. In a blind bore,
   **no point of the tip** passes the bore's bottom plane (to `TOUCH`). That is exact, not the centre alone: on a mitered tip
   the furthest point lies r·tan φ past the centre along the axis, where φ is the angle between the tip's normal and the
   axis. A part cut away by the bottom's own geometry never counts (my call after the builder check: a centre-only test would
   waive real overlap).

A tenon in no socket, in a socket of another diameter, or along another line is **not seated**, and nothing below applies
to it.

### 5.2 What a seated tenon changes in the checks

- **Overlap** (inv 38): the pair (A's tenon body, B's bodies) is not measured. Every other pair of the two parts' bodies is
  measured as today, A's shoulder included, so a shoulder pushed into the seat is still an overlap. The waiver is exact
  because the seated tenon fills its bore exactly.
- **Held** (inv 39): a new clause, **(d) joined**. A part with a seated tenon in another part, and that other part, are held
  to each other. **(d) is a full alternative** to resting, between and lapped, for ANY part, leaning or not, with no coverage
  threshold (the threshold belongs to the contact clauses). So a stool's seat, which after tenoning touches its legs only at
  shoulder corners, is held by its four joints (my call after the builder check). A clause is added and none weakened; the
  prohibition stays verbatim.
- **Real bodies** (inv 38): a part with a tenon is measured on its real bodies, as a tapered part is (`clipConvex`,
  `contactSolids`). A pocket-cell box would overstate an unseated tenon as full-section wood and give the shoulder a flat
  contact it doesn't have. Tenon-free pairs are byte for byte unchanged.
- **Grounding** (`groundedSet`, the ONE walk): a seated tenon connects its two parts.
- **Leaning parts** (invs 39, 57): today a leaning part is supported only by resting on its level faces. It is now also held
  by a seated tenon, its own or one seated in it (my call: the joint is what holds staked work). The levelled-foot rule is
  unchanged: an unlevelled leaning part is still not grounded.
- **The tip check** still judges the whole piece; a joint does not stop a piece tipping.
- **A tenon that is not seated** but enters another part is reported by the existing overlap check, with a hint naming the
  cure when its axis meets a hole row of the same diameter on another line or another diameter on the same line
  (`… doesn't match its socket`), and otherwise none. Hints are builder's wording.

My call: one seated tenon holds both parts, as a glued mortise and tenon does. The cost: a shelf hung on a single peg is
called held. The tip check, not the joint, decides whether the piece stands.

## 6. Bore leg sockets tenons the legs (G3)

### 6.1 The action

Bore leg sockets gains a checkbox beside its diameter, **Tenon the legs** (my call: on by default). With it on, the same
action and undo entry also give each leg it bores (or finds already bored) a **top tenon** that fits its socket:

- **diameter** = the socket's;
- **the tip flush with the seat's top**: the leg grows at its top along its axis until its end (its top's level miter, which
  stays level because the plane is moved along the axis) lies in the seat's top face. Growth is rounded UP to the drag grid
  and the miter's line offset so the plane is exact, as Level the ends does (one rounding rule, its helper reused);
- **the shoulder square to the axis**, placed where the leg's full section just clears the seat's underside: the section's
  highest corner on that plane, so a shoulder corner touches and nothing overlaps. The tenon's length is from there to the
  tip's centre, rounded UP to the hole grid so the shoulder only drops;
- **one leaning leg's position is recomputed** so that everything below the old top stays in the world. The leg grows at its
  top and the pivot is the top's centre, so this follows the same math as `levelPlan`, and holes are kept in the wood by
  the same `levelEndHoles`.

Each tenon is judged by `tenonFaults` before anything is written. A leg whose tenon would fault is named in one sentence, and
its socket is still bored (the socket rule of §5 of the angled holes spec stands).

### 6.2 Shared legs and seats

The legs of a stool are often one linked Shape. Since `tenons` is shared, one write lands on every user. The angled holes
rule applies unchanged: every copy is judged against its own seat and legs, and the action writes only when every copy
gives the same tenon and growth in the shared frame (to 1e-9). Otherwise it refuses in one sentence naming the copies that
disagree, and nothing is written.

### 6.3 Finding a tenoned leg again

Today a leg "stands under" a seat when its levelled top rests on the seat's underside (`legsUnder`). A tenoned leg's top is
inside the seat, so the rule is extended (my call, revised after the builder check). A leaning part also stands under the
seat when:
- its top end carries a tenon;
- its top is levelled (`isLevelled`);
- the tip's centre lies within the seat's stock, between its down- and up-facing level faces (inclusive, to `TOUCH`);
- its axis meets the seat's down-facing level face inside that face's outline.

This is structural. Finding a leg for the action grants it no support: support is §5's, only. It does not need the tip to
land exactly on the seat's top, so Level the ends' small reference drift (it keeps the old cut's reference, landing a hair
off) doesn't lose the leg.

The order is chunk 2's: **lean, then Level the ends, then Bore leg sockets again**. Straight after a lean edit the tip is no
longer level, so the leg isn't found, and the seat's Holes section shows the stale notes until the user re-levels.

- Bore leg sockets again replaces the stale socket (as today) and, with Tenon the legs on, re-fits the leg's top tenon in the
  same entry;
- **Level the ends on a tenoned top** levels the tip, as it levels any top. The tenon is kept at the end, its length
  unchanged, and its shoulder rides with the end. A fault this causes is kept and noted.

### 6.4 What a re-fit may change (my calls after the builder check)

- **It sets, not adds.** A re-fit computes the leg's top from scratch: tip flush with the seat's top, shoulder clearing the
  underside (§6.1). So it may **lengthen or shorten** the leg, by one rule both ways: the exact length rounded UP to the
  grid and the miter's line offset so the tip plane is exact. Holes are kept in the wood by `levelEndHoles` either way, and
  an unstorable hole refuses as Level the ends does.
- **It replaces the top tenon of every leg it finds under this seat**, a typed one included. Its diameter becomes the
  socket's; the checkbox says so (`Tenon the legs (replaces their top tenons)`, builder's wording). With the checkbox off,
  no tenon and no leg length is touched.
- A leg's **bottom** tenon is never touched.

The stale-socket note (fu 456) gains a tenon twin: `Front right's tenon no longer fits its socket — Bore leg sockets again`
on the seat's Holes section, when a tenon that was seated is not.

## 7. Geometry

- **`boardBodies` stays the ONE place a part's features become geometry, and bodies stay convex** (inv 48). The tenon's
  zone becomes the shoulder's full-section bodies up to the shoulder plane and the tenon's round wood beyond it, both
  clipped by the end's miter.
- **How it is built is the builder's** (§13), within these requirements:
  - edges: the shoulder's ring, the tip's outline (a circle on a square end, an ellipse on a miter), silhouettes of the
    round surface in drawings (inv 47), and no facet or seam lines (inv 16);
  - the mesh is WATERTIGHT (`curvesWatertight.test.ts` gains tenon cases: square end, mitered tip, on a leaning part);
  - `geometryKey`, `boardUVSignature` and `drawsAsBox` read the tenon, so nothing is served from a stale cache;
  - perf: `curvesPerf` or `holesPerf` gains tenon cases under the existing budgets (perf guards are the minimum of 9,
    lowered only).
- The survey (§11) points at the curve path: a tenon's waste is a stopped outline round the end with a square stop, the shape
  of P18's view curves with a span. Built that way, edges, silhouettes, caps and the watertight mesh come from tested code.
  The builder must confirm that the outline's pieces leave no seam line on the round surface before relying on it.
- **Section caps** come from the bodies, so a tenon's cap is drawn. A seated tenon fills the seat's subtracted bore in the
  section, so the cut shows two solids, which is correct.
- **Snapping:** the tip's centre and the shoulder ring's centre are snap points. The shoulder centre is a ring's centre, so it
  may sit inside wood, under inv 16's exception for a drawn ring's centre.

## 8. Text, the cut list and drawings

- **Bench line** (one home, `tenonText.ts` or beside `holeText.ts`; all lengths through `formatLength`, inv 52): after the
  rectangular-cut lines in `setupLines`, e.g. `1" round tenon, 1 7/8" long — at the top end, shoulder 16 1/4" from the
  bottom`. A tenon on a mitered end adds the miter's own line, as today.
- **Cut list:** the row's length is the blank, tenon included. `rowKey` adds a tenon signature, exact and order-independent
  like `holeSignature`. A tenon-free row's key is unchanged.
- **Drawings** (`drawView`): lines from the part's edges, as every body feature; tags not added (callouts out of scope).
  Non-tenoned drawings are byte for byte as before.
- **Part diagrams:** the end view draws the tenon as a circle inside the section; the side views draw the narrowed outline
  and the shoulder line. A tenon-free diagram is byte for byte as before.

## 9. AI paths, joinery and Refine

- **Generate:** unchanged; the design schema is byte for byte the same (fu 322).
- **Refine keeps a part with a tenon exactly** (`keepsExactly` gains it, inv 56): put in first, verbatim; a model part
  reusing its name is dropped; one inside an assembly refuses. So no tenon reaches the model and none comes back squared.
  `turnCandidates` never turns one. A joined Refine refuses one, as for a tilted row.
- **Joinery and Repair refuse a part with a tenon** through the ONE decider, `joineryRefusal`, after `leaningRefusal`, in one
  sentence (my call: v1; a later chunk can rule kinds out per site instead).

## 10. What it costs if wrong (my biggest calls)

1. **Square shoulder (§3.1).** A woodworker who scribes the shoulder to the seat's angle sees a gap the model shows too. The
   alternative, a shoulder parallel to the end, would let today's resting rule carry the leg, but it is not what a tenon
   cutter makes, and it does not fit chunk 3's rungs. Cost if wrong: the shoulder plane changes; the joint rule (§5) stands
   either way.
2. **One seated tenon holds, for any part, with no coverage threshold (§5.2).** Cost: a single peg is called held; the tip check still guards the piece.
3. **Tenoning grows the legs (§6.1), a typed tenon does not (§4).** Cost: two behaviours. The action's purpose is "fit the leg
   through the seat"; the panel's is "cut a tenon on this blank".
4. **Exact match of diameters (§5.1).** A tenon typed 1/64" smaller than its socket is not seated, so it overlaps. Cost: the
   user types the same number, which the defaults and the action make the usual case.

## 11. The survey, in brief

A read-only survey (2026-10-25) found:
1. **Nothing stores a tenon.** Joinery's rectangular tenon is four `pocketFor` waste cuts plus a mortise, recognised by
   `tenons.ts`. A round tenon needs a stored field: a schema bump and about a dozen enumerations of a board's features:
   - `types.ts`;
   - `links.ts`: `LINK_FIELDS`, `sharedOf`, `sharedPatch`, `sameShared`;
   - `shapes.ts` `resolveBoard`;
   - `frames.ts` `mirrorFeatures` and `treeEdit.ts`'s lowering and `changedKeys`;
   - `document.ts` `validateBoard` and the step;
   - `bodies.ts` `geometryKey`;
   - `cuts.ts` `CUT_GEOMETRY_KEYS`;
   - `grainTiling.ts` `boardUVSignature` and `drawsAsBox`;
   - `cutlist.ts` `rowKey`;
   - `store.ts`'s duplication and actions;
   - `roleLinks.ts`;
   - `featureCarry.ts` (`featuredKinds`, `hasFrameFeatures`, `carryOf`);
   - `leanKeep.ts`.
2. **A seated tenon would be an overlap today**: `bodyOverlap` (`designCheck.ts`) measures the leg's wood against the
   seat's hole-free bodies. The waiver must name the seated pair exactly.
3. **Support today** rests a leaning leg on the seat by its level top (`leanView.rests`, `groundedSet`). A square shoulder
   ends that, hence the joint clause.
4. **Geometry:** a stored `CurveCut` cannot stop; a VIEW curve can (`ViewCurve.span`, built from profiles). That is the
   cheapest route to a square-stopped round outline (§7). An N-gon body built by hand would need its own edge rules.
5. **Joinery** already refuses every document with a leaning part (`leaningRefusal`), and `findSites` skips leaning pairs.

## 12. Records

- `docs/invariants.md` and CLAUDE.md:
  - a new **invariant 58** (round tenons: the stored form, the ONE fault decider, the seated test, the joint clause);
  - clauses in invs 38 (the overlap waiver; a tenoned part measured on real bodies), 39 (clause (d)), 40 (`TENON_FIELDS`), 44 (the end flip), 45 (shared), 48
    (bodies), 56 (kept parts) and 57 (a leaning part held by a joint);
  - the Versioning line (24).

  CLAUDE.md is 62.7 KB, past its ~60 KB guideline: the records task moves detail out to `docs/invariants.md` (rules stay;
  condensed text only).
- `docs/versioning.md`, `docs/rounds.md` (rollback table: schema 24), `docs/module-map.md`.
- `docs/follow-ups.md`: 447 closed; new entries for anything deferred (feature callouts for a tenon, wedges and pins, a
  shoulder parallel to the end if wanted, joinery on a tenoned part); 438 notes it can use §5.
- `docs/feature-gaps.md`'s row.
- Browser verification on the dev server:
  - the stool's legs tenoned by Bore leg sockets, seen, sectioned, drawn and on the Plans sheet;
  - the design check clean with the sockets, and an overlap when one socket is removed;
  - a tenon typed and refused (`too-wide`);
  - a lean edit, then Bore leg sockets again re-fitting.

## 13. Left to the builder

- The UI wording and end words (§4, §5.2's hints, §6.3's note, §8's bench line), for the user's copy review.
- How the tenon becomes bodies and edges (§7), within its requirements, and how the shoulder and tip snap points are
  generated.
- The structural test of §6.3's tenoned "stands under", and the shape of §3.2's conservative `meets-feature` boxes.
- Where the seated test lives (a module beside `legSockets.ts` sharing `isSocketOf` and an exported `legAxis`), within "one
  test, not copied".

## Amended (build)

Rulings made while building, on branch `round-tenons` (2026-10-25; the SDD ledger and the task reports). The code plus these rulings
govern; where one differs from the text above, this block wins. **Every entry awaits the user's approval.** Records: invariant 58
new, invariants 2, 38, 39, 40, 41, 44, 45, 48, 50, 56 and 57 extended (`docs/invariants.md`); follow-ups 457–466 (447 closed).

- **Ruling P1 — the bench line's end words (§8's example).** It reads `<d> round tenon, <t> long — at the length <min|max> end,
  shoulder <s> from the other end` (the existing rectangular `tenonLine`'s words), not §8's `at the top end, shoulder … from the
  bottom`: one sheet names ends one way. Cost: wording only (copy review, fu 464).
- **Ruling T5d — `DiagramTenon` carries the tip (§8's side views).** On a MITERED end each side view's two sides stop where their
  generator meets the miter plane (`tip`, two stations), so a side never runs through the miter's waste; a square end's tenon carries
  only `end`, `diameter`, `shoulder`. Cost: one optional field.
- **Ruling T6a — a mitered tip keeps the miter's drawing tag (§8: "tags not added").** The tip's outline lies in the miter's plane and
  IS the miter's outline, so it keeps the miter's tag (keyed and lettered like a foot's miter); only the segments that are the
  tenon's alone — the sides, the silhouettes, the shoulder ring — carry no tag. Cost: if wrong, the tip shows a miter letter, which
  is still a true statement about the wood.
- **Ruling T6b — a faulted tenon's bench line (§8, silent).** Every STORED tenon prints; a faulted one ends ` — check: <its first
  fault>` and `(and N more)` (the holes/curves/bands shape). Cost: wording, folded into the copy review.
- **Ruling T7a — "seated" requires the tenon to ENTER the bore (§5.1).** Beyond §5.1's four conditions, along the tenon's outward
  direction the tenon (shoulder to the tip's furthest point) and the bore (mouth to far centre) must share more than `TOUCH`; and
  (with T7h) the tenon must BUILD (`builtTenons`: a faulted tenon cuts no wood, so it fills no bore). Without the first, a collinear
  bore anywhere further along the axis seats the tenon, and first-match would steal the joint. Cost: none found.
- **Ruling T7b / T7c — the mismatch hint (§5.2's hints, builder's wording).** ` — its round tenon doesn't match the socket there`,
  only when the unseated tenon runs where one of the other part's single bores is (a bore on its axis it enters by more than
  `TOUCH`, or one of its diameter on another line within the two radii; so a too-deep tip in a matching blind socket gets it too);
  the tenoned part is named first so "its" reads right. Cost: wording (copy review).
- **Ruling T7e — first match wins (§5.1, silent).** One joint per tenon: the first single bore in world and row order that seats it. A
  tenon through one part's through socket into a second part's socket reports an overlap with the second. Cost: a false overlap on a
  rare build (fu 461).
- **Ruling T7f — a built tenon's wood, its tip disc included, is never a CONTACT (§5.2's "Real bodies", tightened).** Not a rest,
  not the floor, not grounding's `connected`, not the tip footprint, for leaning and unleaned parts alike: an unleaned part's contact
  regions and floor test read its wood trimmed to the shoulders (`contactRegions`, `stands`), a leaning part's level faces its bodies
  cut at the shoulders (`checkedLevelFaces`, local to the checks: `levelFaces` keeps the tips, which Bore leg sockets finds legs by).
  The top-face clause's floor test reads `stands[o]` for a part with a built tenon; both halves of the clause are otherwise as
  before. Cost: a part standing only on a foot tenon's tip is not grounded (true to §5.2); a leaning one also gets the `Level the
  ends` hint, which would not help (ruling T7i, fu 462).
- **Ruling T7g — clause (d) holds only toward the floor (§5.2's "held to each other").** A joint holds a part only when its partner
  reaches the floor WITHOUT that part (`groundedWithout(i)`, the top-face clause's own guard): §5.2 assumed an anchored partner, and
  two parts holding each other up with nothing grounded was a false clean. Cost: none found (every existing case passes).
- **Ruling T7h — "real bodies" means a BUILT tenon (§5.2: "a part with a tenon").** `realBodied` is `isAngled(b) ||
  builtTenons(b).length > 0`: a part whose tenons are all faulted builds none and checks exactly as its tenon-free twin. Cost: none.
- **Ruling T8a — the panel's end words (§4).** `Top` / `Bottom` on an upright part, `Length min end` / `Length max end` otherwise; row
  groups `<end> tenon`; the readout `Shoulder <len> from the <other end word>` and `Seated in <part>'s socket.` Cost: wording.
- **Ruling T8b — an action never reports success for doing nothing (§4, silent).** `addTenon` on an end that has one, `updateTenon`
  changing `end`, and a non-positive or non-finite size refuse with a sentence (`This end already has a round tenon.`, `A round
  tenon can't change ends — remove it and add one at the other end.`, `A round tenon's diameter and length must be more than
  zero.`); a stale id is null, as the hole actions. Cost: three sentences for the copy review.
- **Ruling T8c — Add is withheld when its default would fault (§4).** The row shows the fault instead of `Add round tenon` (the
  AngleCuts preset rule). Cost: none.
- **Ruling T9a — finding a tenoned leg again (AMENDS §6.3's third bullet).** A tenoned leg also stands under the seat when its top
  tenon's CENTRE SEGMENT, shoulder centre → tip centre, in the world, meets the seat's stock between its level faces (a down face and
  an up face above it, inclusive to `TOUCH`), with its axis meeting that down face inside its outline — not the tip's centre alone.
  ONE predicate, `tenonInSeat`, is shared by `legsUnder` and `staleSocketOf` (the review showed `legsUnder` alone makes the re-fit
  bore a second socket beside each old one and refuse). `legsUnder` also requires `isLevelled`; `staleSocketOf` does not (its
  callers have already found the leg). So a LOWERED seat under fitted legs is found and the re-fit SHORTENS each leg, its socket and
  tenon ids kept; a RAISED seat (a gap above the tips) is not found, as an untenoned leg's is not. Cost: a leg whose tenon merely
  pokes into a seat's stock is found (being found grants no support).
- **Ruling T9c — Tenon the legs' details (§6.1, §6.2).** The tenon takes its socket ROW's diameter; a linked leg copy under no seat
  refuses with `socketsDisagree` naming the copies; Level the ends' refusal for any leg refuses the WHOLE action (nothing written);
  a leg whose fit faults is named in the note and not patched, its socket still bored. Cost: Level the ends' sentence does not name
  the leg (copy review).
- **Ruling T9d — a units switch (§6.3's `isLevelled`).** `isLevelled` rounds in the project's units, so after an imperial ↔ metric
  switch tenoned legs are not found until re-levelled; left as is, consistent with the Lean section's not-levelled note. Cost: the
  user presses Level the ends again before re-boring (fu 463).
- **Ruling T10a — the assembly refusal names tenons (§9).** `Refine can't keep a leaning part, a part with angled holes or a part
  with a round tenon inside an assembly yet — Ungroup it first: <name>.` Cost: one sentence for the copy review.
- **Ruling T10b — the model-facing note (§9).** A kept tenoned part's line says `has round tenons`; the header names round tenons
  only when one is kept, so a tenon-free prompt is byte for byte as before. Cost: none.
- **Ruling T10c — the order in a joined Refine (§9).** The tenon check runs after the lean and before the tilted-row check, matching
  `joineryRefusal` (lean, tenon, angle cuts). Cost: none.
- **Ruling T2a — `turnCandidates` never turns a tenoned part (§9's "never turns one", early).** Through `keepsExactly`: a tenon names an
  end of the STORED length, so a turn reversing the length in the world would carry it to the other world end. Cost: a turned twin
  is not linked.
