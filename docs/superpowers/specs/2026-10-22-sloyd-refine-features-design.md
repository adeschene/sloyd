# Sloyd: Refine accepts holes, curves, profiles, bands and hardware

**Date:** 2026-10-22 · **Status:** approved 2026-10-22 (builder-checked; the user's three rulings, §12, folded in); merged `98f8296` and deployed 2026-10-23 as `index-BJwLoCPr.js`. Later rulings: the *Amended* blocks at the end.
**Builds on:** the refine, refine-joined, AI-tapers and AI-angles specs (`2026-10-13-sloyd-ai-angles-design.md`: how
Refine learned a feature last time) and the joinery-features spec (`2026-10-21-sloyd-joinery-features-design.md`, whose
§1 non-goal named this spec). Every rule there still holds unless this document says otherwise.
**No schema change, and `DESIGN_SCHEMA` and `SYSTEM_PROMPT` stay byte-identical.** No document field changes (schema 20),
so a rollback costs nothing, and there is no live grammar compile (fu 322).

**Origin:** the Refine half of follow-ups 328/329 (holes), 363 (curves and profiles), 398 (bands) and the hardware spec's
§6 refusal. Today Refine refuses any project with one of these at entry (`holedRefusal`, `curvedRefusal`,
`bandedRefusal`, `hardwareRefusal`, called in both `plainForRefine` and `documentToDesign`). Add joinery and Repair
accept all of them since 2026-10-22, so Refine is now the last Claude feature that refuses a real project, such as a
cabinet with shelf-pin holes, an arched apron, a rounded-over top or banded plywood.

**The user's direction (2026-10-22):** they chose "Refine on features" as the next round and then said "just look at the
code and draft the spec", skipping the questions. Every decision below that is not inherited from an earlier ruling is
marked **(my call)**. The ones that most change what gets built are collected in §12 for the user to rule on.

## 1. Goal, non-goals, anti-goals

**Goal:** Refine runs on a project whose parts carry holes, curves, edge profiles, edge bands or hardware (and whose
assemblies carry hardware). The refined project keeps every such feature on the part it was on. Each feature stays
exactly as stored, at the same place on the wood. A feature Sloyd could not keep is listed, never dropped silently.

**Non-goals:**
- **Refine does not author, edit or remove these features.** The model never sees them, so "add shelf-pin holes" or
  "make the arch shallower" does nothing to them. Authoring holes and curves in the design schema (fu 329, 363's second
  piece) is a later spec, each behind its own live compile (fu 322), and so are profiles and bands.
- Generate does not change.
- The design checks (overlap, held, tip, contact) still read a curved or profiled part as its box (fu 363's third piece).
- No change to joinery, Repair, the gate, the stored forms of features, or Properties.

**Anti-goals (a failure even if the tests pass):**
- **A feature moved on the wood by Refine.** On a part Refine did not touch, a hole, curve, profile or band ends up on a
  different face or edge, at a different station, or mirrored. That includes a part that simply went through the
  converter's re-encoding (§3.2).
- **A feature lost without saying so.** Every original feature either is on a part of the result or is named in the
  done view (§5).
- **A paid call spent and then refused.** Nothing in this spec refuses after the call.
- **A feature-free Refine changing.** A project with none of these features sends byte-identical messages and gets
  byte-identical results.

## 2. The approach: carry by name, not through the schema **(my call)**

The AI-angles precedent put the feature into the design schema, so the model reads and writes it. That is not possible
here in one step. fu 322 measured room for "at least two more angle-like arrays" in the compiled grammar. Holes have
eleven fields. Curves carry a segment union (lines and arcs) and profiles carry a run union, and both count against the
union cap. Bands name band types and hardware names hardware types, both per-document ids. Five arrays at once would
almost certainly not compile, and the unit suite cannot see that limit.

So Refine **carries** these features the way it already carries grain (`carryGrain`, refine spec §4). The model never
sees them. Sloyd takes them off each original part and puts them back on the returned part with the same flat display
name. This keeps the work to known machinery, carries the features exactly (they never pass through the model, so
nothing is snapped or re-derived), and leaves authoring as a separate later spec.

The cost is §1's first non-goal: Refine cannot change a feature. Untouched parts are the common case (Refine's KEEP_LINE
asks the model to keep every part it was not asked to change). For a part the model resizes, §4 rules what happens.

## 3. Carrying

### 3.1 Matching

- **Parts:** by flat display name, exactly as `carryGrain` matches. A loose part matches the original part of that name.
  An assembly part tries each placement's `Placement › Part` in order and takes the first original that matches.
- **What a match carries:** `holes`, `curves`, `profiles`, `bands`, `cornerRule` and `hardware`, read off the ORIGINAL
  part's resolved board (`resolveBoard`, so a shaped part's shared fields come from its Shape). They are copied with the
  existing copy helpers (`copyHoleRow`, `copyCurve`, `copyProfile`, `copyBand`, `copyHardwareUse`) and keep their ids
  (inv 33's scopes are per board or per shape, and the result's boards are new).
- **Assembly hardware** (`Definition.hardware`): a returned assembly takes the hardware of the original definition that
  owns an original placement with one of its placement names, first match in placement order. **(my call: the same
  first-match rule as parts.)**
- **The project's own hardware** is already carried (`run.ts`), unchanged.
- The carry happens in `prepare`, before conversion, beside `carryGrain` (one `carryFromOriginal(design, original)`,
  which may absorb `carryGrain`). It puts a TS-only `carry` field on `GeneratedPart` and `GeneratedAssembly`, as `grain`
  is TS-only today. `parseDesign` drops it, so the model cannot set it.

### 3.2 The frame: a featured part keeps the original's encoding

Holes, curves, profiles and bands are stored **board-local**: dimensions, `from` ends, (u, v) coordinates and sides.
`convertPart` re-encodes every returned part through `orient(size)`, which returns rotation 0 or 90 only and breaks a
width/thickness tie by axis index. So an untouched part that was stored at 180°, or a square-section leg, can come back
in a different encoding with the same box. Board-local features copied onto it would then land on the opposite face or
the swapped side. That is anti-goal 1.

**The rule:** a returned part whose `carry` holds any hole, curve, profile or band keeps the ORIGINAL part's `posture`
and `rotation`. Its `length`, `width` and `thickness` are read from the returned box through the original's frame:
`axisFrame` gives the dimension each world axis carries, and that dimension takes the box's extent on that axis. That
gives the same box and the original's hand, and the features ride on the wood exactly as before. This holds whether
the box is unchanged, resized or moved. **(my call.)** Every assembly in a refinable design is unturned (Refine refuses
turned and nested instances), so a definition part's local axes are world axes and the same rule applies.

- A part carrying only `hardware` (no board-local feature) is encoded by `orient` as today. Hardware has no frame.
- `convertPart` takes the frame from `carry` when present, else `orient`. Tapers and miters, bevels and chamfers then
  convert in that frame through `taperCutsFor` and `angleCutsFor` exactly as now. Under the carried frame, `length`
  stays on the same world axis whatever the resize, and `taperCutsFor`'s `along` check reads the `length` DIMENSION
  (`taperWorld.ts`), not the longest side. So a taper on a featured part that a resize leaves no longer longest is kept
  along its stored length, without a fault. **(my call: accepted.)** The wood is where it was, and only the model-facing
  phrase "a taper runs along a part's longest side" is loose for that part. No new fault is added.
- **`documentToDesign`'s pre-checks** (the fu 309 taper check and the angle-form check, which today judge
  `orient(boardExtents(b))`) judge a featured part in its OWN frame, as the converter will. Otherwise a featured part
  could pass the pre-check and then fault every round.

### 3.3 Order inside the conversion

The carried features must be on the parts **before `migrateDocument` and before `linkByRole`**:
- `linkByRole` judges equality with `sameShared`, which compares holes, curves, profiles, bands, `cornerRule` and
  `hardware`. Two copies of a holed side link only if both carry the holes when they are compared.
- `migrateDocument` **drops** a band whose type id is not in `bandTypes` and a hardware use whose type id is not in
  `hardwareTypes` (`validateBands`, `validateHardware`). `designToDocument` builds from `createDocument`, whose
  `bandTypes` is the built-in band only and whose `hardwareTypes` is empty. So `designToDocument`'s `opts` gains
  `bandTypes` and `hardwareTypes` beside `materials`, and Refine passes the original's. A solid band type naming a custom
  material keeps it, because `materials` goes in too (inv 49: the document carries the custom materials its band types
  use).
- `runRefine`'s two document-level merges (after the loop and after joinery) add `bandTypes: doc.bandTypes` beside
  `hardwareTypes`. Today `bandTypes` falls back to `createDocument`'s default there, so a project's custom band types
  are lost on Refine even when no part uses them. That is a latent bug, fixed here **(my call)**. §1's identity
  anti-goal covers projects whose band types are the default.

### 3.4 Linking: `turnCandidates` must not turn a banded part

`turnCandidates` (roleLinks.ts) returns no candidates for a part with cuts, holes, curves or profiles, because turning
moves a board-local feature to other world faces. It does **not** exclude bands, and turning a banded part 180° puts its
edging on the opposite edges. That is unreachable today (no generated part carries a band) and becomes reachable with
this spec. `turnCandidates` adds `b.bands.length > 0` to its guard (with a test that fails without it). A featured part
therefore links only with copies in its own encoding. Copies of one Shape share posture, and a carried part keeps its
own rotation, so originally linked copies still link (`rotation` is an own field).

## 4. Resized parts **(my call; §12 Q1)**

A featured part the model resized keeps its features at their stored stations, measured from the ends and sides they
name. That is what a resize in Properties does: a hole row measured from the bottom stays measured from the bottom, and
an arch drawn from one end stays where it was drawn. A fault the resize causes (a row that now breaks out, a curve past
the new edge, a profile or band that no longer fits) is **kept and noted**, never clamped or dropped. That is the
holes/curves/bands precedent (invs 50, 53, 54: "a fault a later edit causes is KEPT, noted").

The done view lists **every featured part the model resized**, faulted or not (§5), because a feature anchored at one
end can move relative to the part without faulting: a centred arch on a lengthened apron is no longer centred. **(my
call.)** Faults are judged by the ONE deciders (`holeFaults`, `curveFaults`, `profileFaults`, banding's band faults) on
the refined part. Only a fault the ORIGINAL part did not already have is named: a fault an earlier edit caused is kept
under invs 50, 53 and 54 and is not Refine's doing. The comparison is by fault key per feature id, as `faultKey` does
for holes.

**Turned parts.** The model can also return a featured part turned onto another face: its original thickness axis is
no longer its thinnest. In the original frame that reads as a resize to a strange shape, with the features on the wrong
faces of the wood. This becomes a **design fault fed back to the model** in the repair loop, beside the converter's
faults. It is a new `ViolationKind` `'feature-turned'`, in model-facing words (decimal inches, no units edge), for
example: `Side carries holes Sloyd keeps on the part; keep it the same way round, 0.75in along x.`
- **The test:** the original part's thinnest extent was on world axis k (all thinnest axes, if tied), and the returned
  box's extent on k is no longer the smallest of its three (ties allowed).
- An original whose thickness is not its smallest extent is never judged.
- If the fault is still there when the loop ends, the best attempt is kept as with any fault, the part keeps its
  features in the original frame, and the fault is listed with the new issues. Its person-facing copy is a `shown`
  string in the project's units (fu 355's pattern), for example `Side was turned onto another face; its holes are now
  on the wrong faces.`
- A quarter turn in plan (length and width swap world axes, thickness unchanged) is NOT caught. It reads as a resize,
  and the "Check at the new size" line names the part. **(my call: recorded, not built.)**

## 5. What the person sees

**The message** (`refineMessage`). When the design has any featured part, one paragraph goes after the design JSON in
the USER turn. `SYSTEM_PROMPT` stays a fixed prefix (the prompt.ts rule), and `KEEP_LINE` is unchanged:

> These parts carry holes, curves, edge profiles, edging or hardware that this format does not show; Sloyd keeps them on
> the part with the same name. Keep each one's name, and keep it the same way round: Side (holes), Apron (a curve),
> Top (an edge profile, edging), Door (hardware).

Each part is named once, by flat name, with its kinds. An assembly part is named once under its first placement, as the
model sees it. Assembly hardware is named by placement. With no featured part the message is byte-identical to today's
(pinned). The estimate reads `refineMessage`'s length, so it grows with the note on its own.

**The done view** (`RefineDialog`), above the change list and never truncated (the change list shows only 12), adds two
lists when non-empty. Their strings are built in a document module with `→ units` only if a length is printed (my
call: `document/carryText.ts`, words only, no lengths):
- **Not kept:** one line per original featured part (or assembly) with no match. Example: `Side's holes and hardware —
  no part named Side in the result.` A rename shows here and in the change list (as removed plus added).
- **Check at the new size:** one line per featured part whose box changed size, naming its feature kinds. A part with a
  NEW fault (§4) says so. Examples: `Apron was resized — its curve stays measured from where it was drawn; check it.`
  and `Side was resized — a hole row no longer fits; see Properties.` A part that only moved is not listed.

`RefineOutcome` gains `carried: { notKept: string[]; check: string[] }`. Both are computed from the result against the
original flat document, after the joined path's re-join, so joinery's rebases are included.

**The change list** (`diffDesigns`) is unchanged. A carried feature is not a change.

## 6. Refusals, the joined path, and what still refuses

- `plainForRefine` and `documentToDesign` drop the four refusal calls. `RefusalReason` loses `'holes'`, `'curves'`,
  `'bands'` and `'hardware'`. `holedRefusal`, `curvedRefusal`, `bandedRefusal` and `hardwareRefusal` then have no
  caller. They are deleted, with their tests, together with `holedParts`, `curvedParts`, `bandedParts` and
  `hardwareHolders`, which no product code else imports (`grainTiling.ts`' `curvedParts` is an unrelated local
  WeakMap). Two other tests use them and are re-homed, not dropped: `profilesView.test.ts` (imports `curvedParts` and
  `curvedRefusal`; its "turnCandidates gives none" pin stays) and `treeEdit.mirror.test.ts` (checks `curvedRefusal`'s
  message).
- **A joined featured project** now reaches `gateUnjoin`. Its gate already compares holes, curves, profiles and bands
  (joinery-features §5), and `resizeAt` undoes joinery's rebases, so the plain parts carry their features in the plain
  frame. They are carried onto the refined plain parts, and `runJoinery` re-joins with its feature zones and rebases
  (inv 41), as for any featured project. The fixed-choice records and `alsoPresent` are unchanged.
- Still refused, unchanged: empty, mirrored, turned or nested assemblies, too large, joints the gate cannot read, a
  taper or angle Refine cannot describe, and `angle-joint` on a joined original.

## 7. Invariants and records

- **Inv 41**'s "Refine refuses holed, curved, profiled or banded projects" sentences, and **50, 53, 54, 55**'s "Refine
  refuses…" clauses, change to: Refine CARRIES them by flat name in the original part's frame (this spec, §3).
  Changed in full in `docs/invariants.md` and condensed in CLAUDE.md.
- **A new rule in inv 45's area** (or a new invariant, numbered next): **a carried part keeps the original's posture
  and rotation; never `orient` a part with board-local features.** This is the rule whose breakage moves features
  silently.
- `docs/versioning.md`: no change (no schema bump). `docs/module-map.md`: the carry module and `carryText.ts`.
- Follow-ups: 328 and 398 close for Refine. 363's Refine reading closes (carried), and its authoring stays open. 329
  stays open (authoring). The hardware spec's §6 refusal is closed.

## 8. Testing

- **Frame, every posture × all four turns × a square-section tie:** a `chiralPart` (or `chiralCurved`, `chiralTwoSide`)
  with each feature kind goes original → `documentToDesign` → the design returned untouched → conversion. The refined
  part's world feature geometry (hole centres, curve outline in world, profile and band sides in world) equals the
  original's. **Mutate:** encoding the part with `orient` must fail the test at 180°, 270° and on the tied section.
- **Resized:** a holed side made taller keeps its rows at their stored stations (measured from their ends) and is
  listed in `check`. A row that now breaks out is KEPT and named as a new fault. A fault the original already had is not
  named (mutate: drop the original-faults filter). A part that only moved is not listed.
- **Taper on a featured part:** a resize that makes the part's width longer than its length keeps the taper along the
  stored length, with no fault.
- **Turned:** a featured side returned lying flat raises `'feature-turned'`. The same box on an unfeatured part does not.
  A tie on the thickness axis does not.
- **Order:** two holed copies with one role link into one Shape (fails if carry runs after `linkByRole`). A banded part
  keeps its band, and a hardware-carrying part its hardware, through `migrateDocument` (fails without the `opts` types).
  A solid band type's custom material survives `pruneMaterials`.
- **`turnCandidates`:** a banded part gets no candidates (mutate: remove the guard, and a 180° candidate appears).
- **Not kept:** a renamed featured part is listed. Assembly hardware is carried by placement name.
- **Identity:** a feature-free Refine's message and result are byte-identical to today's. `DESIGN_SCHEMA` and
  `SYSTEM_PROMPT` stay pinned.
- **Joined:** a joined project with shelf-pin holes in its sides is refined (scripted client) and re-joined, and the
  holes are where they were on the wood.
- **Live, paid (pre-approved up to 10, the user's ruling 2026-10-22):** a small cabinet with shelf-pin holes, an arched
  apron, a rounded-over and banded top, and hinges as hardware, refined with "make it 6 inches taller" and then with
  "add a second shelf". Checked against the dev server per the deployment rule.

## 9. Chunks

One chunk **(my call)**: the carry is one mechanism for every feature kind, and lifting the refusals one kind at a time
would mean the same plumbing four times. One plan, review, merge, deploy and live check.

## 10. What does not change

The document schema (20), `DESIGN_SCHEMA`, `SYSTEM_PROMPT`, `KEEP_LINE`, Generate, joinery, Repair, the gate, the stored
forms of every feature, the design checks, the change list, Properties, and every feature-free Refine.

## 11. Out of scope (follow-ups)

- Refine authoring holes, curves, profiles and bands in the design schema (fu 329; 363's second piece; bands, a new
  entry). Each needs a live compile and is likely its own chunk.
- The design checks reading curved bodies (fu 363's third piece).
- **New, record:** `carryGrain` carries the grain's DIMENSION NAME onto a part `orient` re-encodes. On an original whose
  longest side is not its `length` (possible after Properties edits), grain could then run along a different world
  axis. §3.2's frame rule fixes this for featured parts only. To record and measure, not fix here.

## 12. The user's rulings (2026-10-22)

Answered: (1) features stay measured from the ends they name (§4 as written); (2) a turned featured part is sent
back to Claude as a fault (§4 as written); (3) carry, not authoring, for this round (§2 as written). The questions as asked:

1. **Resized featured parts (§4):** keep each feature at its stored station and note any fault (my call, the Properties
   precedent). The alternatives: drop the features of any resized part and list them, or refuse to carry onto a resized
   part. What does a model resize do to your shelf-pin rows: stay measured from the bottom, or something else?
2. **Turned featured parts (§4):** fed back to the model as a fault (my call), or accepted silently in the original
   frame?
3. **Carry, not authoring, for this round (§2):** Refine keeps features but cannot change them. Is that the useful first
   step, or is authoring (at least holes, through the schema and a live compile) what you wanted from "Refine on
   features"?

## Amended (execution)

- **§5, when `carried` is computed.** §5 says the carried list is computed "after the joined path's re-join". It is computed
  plain-to-plain, BEFORE `runJoinery` (`carriedSummary`, `RefineOutcome.carried`): joinery grows tenons, so after the re-join every
  joined part would read as resized. The re-join still rebases features (§6); only the done-view comparison moved earlier.
- **Hardware spec §6 refusal.** The hardware spec's refusal of hardware on parts in Refine is closed through inv 55's rewrite: a part's
  hardware is carried by flat name from the RESOLVED flat part, and only an assembly's hardware reads the STORED definitions (P2).
- **`JointsSummary.notes`.** `runRefine` no longer discards joinery's ruled-out lines (a joint kind left out because a feature sits in
  its zone, so a meeting may be a butt): they are `JointsSummary.notes` (`[]` unless joined) and the dialog shows each under the joints
  line. A feature check that throws after the paid call returns the refined design unjoined (`notJoined: FEATURE_CHECK_FAILED`).
- **§4, the tie rule as ruled.** `featureTurned` takes T, the world axes where the original's extent equals its minimum (exact); a part
  is skipped when its thickness axis is not in T, and is a fault only when NO axis in T is a smallest axis of the result.
- **§5, person-facing nouns.** The done view's words use an article-free list (`holes`, `curve(s)`, `edge profile(s)`, `edging`,
  `hardware`; `X`, `X and Y`, `X, Y and Z`) with verb agreement (`nounsText`); the model-facing note and `feature-turned` message keep
  the article forms (`kindsText`), and the message's extent is rounded to three places.
- **§3.2's "taper kept with no fault" now covers only parts with curves, profiles or bands (AI-holes residual R1, ruling (a), 2026-10-23).**
  Since AI-holes, holes are authored in world words, not carried, and a holes-only part keeps the original's frame only while every world
  extent keeps its rank (`keptFrame`). A resize that swaps two extents' rank (a tapered side widened past its length) cannot be told from
  a turn in plan, so a holes-only part is oriented like its plain twin and its taper's `along` fault goes back to the model — rather than
  keeping a frame in which, for a real turn, the grain would silently run the other way. This guarantee was the controller's call, not a
  user ruling.
