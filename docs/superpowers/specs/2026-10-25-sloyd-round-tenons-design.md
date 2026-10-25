# Splayed legs, chunk 2b: round tenons — design

Status: DRAFT 2026-10-25, awaiting the user's review. Follow-up 447 (the angled holes spec's §12 outline). Chunk 1 (a part
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
   line). This is `isSocketOf`'s test, shared and not copied;
3. **matching**: the bore's diameter equals the tenon's;
4. **inside**: the tenon's wood that lies in B lies within the bore's extent. A through bore takes any tenon. In a blind bore,
   the end's centre does not pass the bore's bottom (to `TOUCH`).

A tenon in no socket, in a socket of another diameter, or along another line is **not seated**, and nothing below applies
to it.

### 5.2 What a seated tenon changes in the checks

- **Overlap** (inv 38): the pair (A's tenon body, B's bodies) is not measured. Every other pair of the two parts' bodies is
  measured as today, A's shoulder included, so a shoulder pushed into the seat is still an overlap. The waiver is exact
  because the seated tenon fills its bore exactly.
- **Held** (inv 39): a new clause, **(d) joined**. A part with a seated tenon in another part, and that other part, are held
  to each other. A clause is added and none weakened; the prohibition stays verbatim.
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

Today a leg "stands under" a seat when its levelled top rests on the seat's underside (`legsUnder`). A tenoned leg's top
is inside the seat, so the rule is extended (my call): a leaning part also stands under the seat when its top end carries a
tenon whose tip is a level face coplanar (`TOUCH`) with one of the seat's up-facing level faces, with plan overlap. So:

- Bore leg sockets again, after a lean edit, replaces the stale socket (as today) and re-fits the leg's stale tenon (a
  top tenon that no longer matches) in the same entry;
- **Level the ends on a tenoned top** levels the tip, as it levels any top. The tenon is kept at the end, its length
  unchanged, and its shoulder rides with the end. A fault this causes is kept and noted.

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
2. **One seated tenon holds (§5.2).** Cost: a single peg is called held; the tip check still guards the piece.
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
  - clauses in invs 38 (the overlap waiver), 39 (clause (d)), 40 (`TENON_FIELDS`), 44 (the end flip), 45 (shared), 48
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
