# Mirrored links (fu 432) — design

Status: draft, 2026-10-23. The user skipped the questions ("skip the questions and draft the spec"); every decision below
not quoted from the user is **my call** and is marked so. After the builder check the user chose the approach (§1.1).

## 1. What and why

A case's left and right sides are mirror images. Shelf-pin rows sit on each side's INSIDE face and edging (or a profile) on
each side's FRONT edge. Linking (inv 45) tries the part itself and its quarter turns about vertical (`turnCandidates`).
Turning the left side 180° puts its pins on the inside but its edging on the BACK, so no turn maps one side onto the other.
Generate, Refine and the user's Link all leave the pair as two unrelated parts, and an edit to one (move the pin row, change
the edging) does not follow to the other. The user deferred this on 2026-10-23 ("two parts for now"); this round closes it.

**Goal:** a part can use a Shape AS ITS MIRROR IMAGE. The pair is one link: one Shape stores the shared fields once; an edit to
either side's shared fields reaches the other, reflected. Generate and Refine find mirror twins when they link by role; a
person can make one by hand.

**Correcting the follow-up's premise (fu 432 named a cost that linking cannot fix):** fu 432 says the unlinked pair "counts
twice against Generate's part cap". It does today, but linking does not change that: `distinctParts` counts STORED parts
(`assemblyChecks.ts`), shaped or not, so two linked quarter-turned twins also count twice. The part cap is out of scope (§8).

### 1.1 The approach (the user's choice, 2026-10-23)

A one-part mirror link already exists by hand: group the left side into an assembly, then "Copy mirrored" (schema 13). The
mirrored-instances spec ruled "Assemblies only. To mirror one part, group it first" and put "mirrored loose parts" out of scope.
Offered (a) a mirror flag on parts (schema 21; this spec) or (b) Generate/Refine wrapping each twin pair in one-part mirrored
assemblies (no schema change), the user chose **(a) "Mirror flag on parts"**. This REVERSES that ruling for linked parts:
a loose part may now be mirrored, as a use of a Shape. The mirrored-instances spec gets a pointer here.

## 2. Goals, non-goals, anti-goals

- **Goals:** (G1) a mirrored use of a Shape, stored, loaded and drawn exactly; (G2) a shared-field edit on either side
  writes the Shape once and both sides show it, each in its own hand; (G3) Generate/Refine's `linkByRole` links mirror twins;
  (G4) a person can make, see and undo a mirrored link; (G5) Unlink leaves two plain parts exactly as they looked.
- **Non-goals:** the part cap (§1); grouping a one-handed part and its mirror into one cut-list row (§6.1: the precedent
  keeps them two rows); mirrors about any plane other than the part's own; a mirrored link among parts of different
  sizes or postures (a link shares sizes and posture today; unchanged).
- **Anti-goals:** a symmetric part (no one-handed feature) must never be stored as mirrored when an unmirrored or turned
  match exists (a needless flag is a needless schema-21 refusal for older builds, and a confusing badge); no world box,
  stored number or drawing of any existing project changes; a document with no mirrored part is byte for byte as before.

## 3. The model (schema 21)

- **`mirrored?: true` on a SHAPED stored part** (an OWN field: `LINK_FIELDS.mirrored = 'own'`). Meaning (my call, the
  schema-13 convention for instances): the part is its Shape **reflected across its own local X at turn 0 before its
  turn** — i.e. the Shape's cuts, angle cuts, hole rows, curves, profiles and bands are mirrored along `mirrorDim` (the
  dimension on X at turn 0 for the posture) by the existing flag-flip functions (`mirrorCut`, `mirrorAngleCut`,
  `mirrorHoleRow`, `mirrorCurveCut`, `mirrorProfile`, `mirrorBands`; inv 44), then the part's own `rotation` and
  `position` apply as for any part. Sizes, posture, material, grain, cornerRule and hardware are unchanged by a mirror
  (`mirrorPart`'s argument). The box is unchanged, so `position` (the min corner, inv 2) needs no adjustment.
- **Stored only when true**, as `Instance.mirrored`. A PLAIN part never carries it: the loader drops it from a plain part
  (a plain part's features are already in its own hand). `plainOf` strips it.
- **`resolveBoard` is the one place it is applied** (inv 45: "the ONE place a shape is read into a part"): a mirrored user
  resolves to a Board whose shared feature arrays are the Shape's, mirrored along `mirrorDim` of the resolved board, carrying
  `mirrored: true` so writers know to lower through it. Everything downstream (`worldParts`, `boardBodies`, drawings, the cut
  list, joinery, checks) sees an ordinary Board and needs no change.
- **Schema 20 → 21.** Harm argument (CLAUDE.md "argue your field's harm"): a build at 20 would ignore the flag and draw the
  right side with the LEFT side's features — pins on the outside, edging on the back — silently. So a 21 file must be refused
  by a 20 build. The v20→v21 step adds nothing (absent = unmirrored); validation keeps `true`, drops any other value, and
  drops the flag from a plain part. `docs/versioning.md` and the rollback table get their rows.

## 4. Writing edits back

- A Properties or tool edit of a SHARED field on a mirrored user is lowered through ONE mirror before it is written to the
  Shape, with the existing exact inverses (`lowerCuts`, `lowerAngleCuts`, `lowerHoles`, `lowerCurves`, `lowerProfiles`,
  `lowerBands` in `treeEdit.ts`; each reuses an untouched stored array so repeated edits never drift, inv 44).
- **The side of a mirror** becomes the parity of the container chain XOR the part's own flag (one helper replacing
  `mirroredAt` at every call that decides a side: `linkPlan`'s `mirroredOf`, `postureRefusal`, `sameSideFirst`, the store's
  `sideOfShape`). A mirrored user inside a mirrored assembly is therefore on the unmirrored side, which is correct: its
  world hand is the Shape's.
- **Posture:** a posture change moves `mirrorDim`, so it is refused for a Shape with users on both sides
  (`POSTURE_ACROSS_MIRROR`, the existing rule and words, now reached by part-level mirrors too).
- Own-field edits (name, position, rotation) are as today.

## 5. Making, seeing and undoing a mirrored link

### 5.1 Generate and Refine (`linkByRole`)

- After the part itself and its quarter turns (`turnCandidates`), `linkByRole` tries **mirror candidates**: the part
  reflected left-to-right in place (§5.2's operation: features mirrored along `mirrorDim`, `rotation` inverted) and then
  each quarter turn of that, judged by `alignedTo` exactly as turned candidates are. A hit stores the part as a mirrored
  user of the representative's Shape. Order (my call): unmirrored first, then turns, then mirrors, so a symmetric part is
  never stored mirrored (anti-goal).
- A turned mirror candidate re-stores holes, bands and profiles through their world forms exactly as `turnCandidates` does
  (exact sets, `known` stations) and is refused for parts with curves or carried profiles, as turns are. The UNTURNED
  mirror candidate is pure flag flips (`mirrorCurveCut`, `mirrorProfile`, exact) and is allowed for those parts too (my call,
  builder check Q7), so a Refine of hand-made mirrored sides with curves or two-side profiles keeps them linked.
- **Into the Shapes** (my call, builder check Q4): `linksToShapes` stays the ONE label→shape builder and still judges equality
  by `sameShared` only, never loosened — the candidate it compares is already in the representative's hand. A mirror hit
  enters it carrying `mirrored: true`; `linksToShapes` keeps the flag on the shaped record it writes. A mirror candidate
  that ends up in no shape (a class of one) is never stored: the ORIGINAL part is kept, so no plain part ever carries
  reflected features or the flag.
- Refine: `documentToDesign` already writes each part's RESOLVED world form, so the model sees two ordinary parts; the
  result relinks through `linkByRole`. Nothing in the prompt changes.

### 5.2 By hand (my call: two small actions, matching the assembly mirror's)

- **"Mirrored" checkbox** in a LINKED part's Properties (under Turn), shown only when the part uses a Shape. Ticking makes the
  part its mirror image LEFT-TO-RIGHT as seen from the front (reflected across the world X plane through its own centre),
  its box unchanged, whatever its turn (my call, builder check Q2: the flag alone reflects along `mirrorDim`, which for a
  case side stored at 90° would move the edging to the back). The store does it exactly: since M_x R(r) = R(−r) M_d0, the
  action flips the flag AND sets `rotation` to `inverseTurn(rotation)`; turns r and −r put the same dimensions on the same
  axes, so the box (and `position`) is unchanged. Unticking is the same action. One undo entry. A symmetric part shows no
  visible change (correct; the badge still shows the flag).
- **Link** keeps its rule (members take the source's shared fields, as the source LOOKS). To link a left and a right side by
  hand, a person Links them (the right becomes a copy of the left), then ticks Mirrored on the right. With part-level flags
  (my calls, builder check Q3):
  - the Shape is written in the source's UNMIRRORED hand: the source's resolved fields lowered through its own flag;
  - a plain part joining the link takes the SOURCE's flag (so it becomes a copy of what the person sees on the source);
  - a part already using one of the shapes involved keeps its own flag relative to the Shape, and its record keeps the flag;
  - `LINK_ACROSS_MIRROR` stays decided by ASSEMBLY parity only (the existing rule, unchanged words); a part's own flag never
    refuses a Link. So a third side or a divider can join an existing mirrored link by hand.
- **Parts list:** a mirrored part's row shows the mirrored badge (`role="img"`, accessible name "Mirrored"), the one the
  assembly rows use, beside its link badge.
- **Unlink** (and every dissolve: `dissolveShapes`, a one-user shape) stores the RESOLVED board as a plain part — its
  features already in its own hand — so nothing moves or changes (G5).
- **Duplicate, Copy in a row, copy/paste** keep the flag (own fields are copied). **Make Unique** and **Ungroup** keep today's
  behaviour (builder check Q5: both keep shaped parts shaped): the flag rides with a part that stays shaped; a part made
  plain (Ungroup through a mirrored assembly) is stored from its resolved board and carries no flag.

## 6. Everything else

### 6.1 Cut list, Plans, Buying, hardware

- The cut list groups by exact shared fields (inv 40), so a one-handed part and its mirror are two rows, as for mirrored
  assembly copies today (mirrored-instances spec §6; `cutlist.test.ts` "a one-handed part and its mirror are two rows");
  a symmetric part's mirror groups with it. Unchanged code; pinned by a new test.
- Plans, diagrams, nesting, Buying and hardware read resolved boards: no change. Hardware is shared and never mirrored.

### 6.2 Joinery and Repair

- Joinery runs on `flatDocument` and writes back through `writeBackFlat` (`treeEdit.ts`), which does NOT write shared fields
  into Shapes: it makes every shaped part plain (`plainWithMarkers`) and regroups users by `groupSignature`
  (`regroupShapes`). Built as is, that would split and dissolve every one-handed mirrored link on any joinery run, and
  drop the flag (builder check Q1). So (my call): **`regroupShapes` becomes mirror-aware.** Two former users of one Shape whose
  features are equal once one is reflected left-to-right (§5.2's operation) regroup as one Shape, stored in the hand of the
  first user in document order, the other flagged `mirrored`; users joinery cut so they are no longer mirror images split
  into separate shapes, exactly as differently-cut users of an unmirrored link split today. `sameJoined` and the unjoin
  gate compare resolved boards. Pinned with a joined case whose two sides are a mirrored link (it stays one link), and one
  where joinery cuts only one side (it splits).

### 6.3 What is unchanged

Generate's schema and prompt; the part cap; the viewport (it reads resolved boards); the design checks; invariants other than
44, 45, 46 and the schema-version notes.

## 7. Invariants and records

- **Inv 45:** a link may be used mirrored (`mirrored` is an OWN field; `resolveBoard` applies it); `linkByRole` tries mirror
  candidates after turns.
- **Inv 46:** the side of a mirror is the chain parity XOR the part's own flag.
- **Inv 44:** a part-level mirror reflects by the same flag flips along `mirrorDim`, with the same exact `lower…` inverses.
- Versioning (schema 21), the rollback table (rolling back past this refuses every project saved at 21 — export first),
  module map, fu 432 closed.

## 7.1 Pointers

The mirrored-instances spec (2026-10-11) gets a one-line pointer to §1.1 (its "assemblies only" ruling is reversed for linked
parts).

## 8. Out of scope (recorded as follow-ups if wanted)

- The part cap counting linked parts once (it counts stored parts; a separate decision for Generate).
- One cut-list row for a one-handed pair ("Side ×2 (1 L, 1 R)").
- Mirrored links between parts whose posture differs.

## 9. Testing

- **Round trips:** for each feature kind on `chiralPart`-style fixtures (inv 44: never a symmetric fixture), a mirrored user
  resolves to exactly `mirrorPart`'s feature arrays; Unlink returns that board byte for byte; a shared edit made through the
  mirrored user and read back from the unmirrored one equals the edit reflected, and repeated edits do not drift.
- **Parity:** a mirrored user inside a mirrored assembly draws as the Shape (two mirrors cancel); posture refusal and
  `LINK_ACROSS_MIRROR` judged by the combined side.
- **linkByRole:** the case-sides fixture (pins inside, edging front) links as one Shape with one mirrored user; a symmetric
  pair links UNMIRRORED (mutate the candidate order and see it fail); a turned twin still links as a turn.
- **Schema:** a v20 file loads unchanged; a 21 file with the flag on a plain part loads with it dropped; a value other than
  `true` is dropped; a mirror-free document is byte for byte as before (an identity test like `bandFreeIdentity`).
- **Live (dev, Playwright):** a hand-made mirrored link (Link + tick Mirrored) on a case with pins and edging; edit the pin
  row on the right side and see the left follow, mirrored; Unlink; undo. One paid Generate of "a plywood bookcase with
  adjustable shelves and oak edging" to see the sides link as a mirror (≤ 10 paid runs, as ruled).
