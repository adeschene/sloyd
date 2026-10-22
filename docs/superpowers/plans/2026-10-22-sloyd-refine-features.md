# Refine Carries Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine stops refusing projects with holes, curves, edge profiles, edge bands or hardware. Sloyd carries each
feature, exactly, onto the returned part with the same flat name, keeping the original part's frame.

**Architecture:** A new `document/featureCarry.ts` reads features off the original (resolved, flat) parts and attaches
them as a TS-only `carry` on the returned `GeneratedPart`/`GeneratedAssembly` in Refine's `prepare` step (replacing
`carryGrain`). `convertPart` honours `carry`: the original posture and rotation (never `orient`) and the features verbatim,
before `migrateDocument` and `linkByRole`. A new `'feature-turned'` design fault goes back to the model. The done view
gets two never-truncated lists (`document/carryText.ts`).

**Tech Stack:** TypeScript, Vitest, React (RefineDialog).

**Spec:** `docs/superpowers/specs/2026-10-22-sloyd-refine-features-design.md` (approved 2026-10-22). Read it first: §3.2
(the frame) and §4 (resized and turned parts) are what the tests below protect.

## Global Constraints

- No schema change: `CURRENT_VERSION` stays 20. `DESIGN_SCHEMA`, `SYSTEM_PROMPT` and `KEEP_LINE` stay byte-identical
  (existing pins must pass untouched).
- A feature-free Refine (no holes, curves, profiles, bands or hardware anywhere, and default band types) sends a
  byte-identical message and gets a byte-identical result.
- A part carrying any hole, curve, profile or band keeps the original's `posture` and `rotation`. It is never encoded by
  `orient`. A hardware-only part is encoded by `orient` as today.
- Features are copied with `copyHoleRow`, `copyCurve`, `copyProfile`, `copyBand` and `copyHardwareUse`, ids kept,
  numbers never snapped.
- The user's rulings (spec §12): features stay measured from the ends they name; a turned featured part is sent back to
  Claude as a fault; carry, not authoring.
- Branch `refine-features` off `master`; merge with `git merge --no-ff`, verify the merged tree, delete the branch. No PR.
- `npm test` does not typecheck: run `npm run build` before claiming a task compiles.
- Mutate every test justified by an order, a refusal or an exclusion (CLAUDE.md): break the code, see red, restore.

## Review Focus

1. **A part stored at rotation 180 or 270, untouched by the model.** The reasonable expectation is that its holes sit on
   the same world faces. Pinned in Task 2 (every posture × four turns).
2. **A square-section leg (width = thickness) with a chamfer and a hole row, untouched.** The expectation is that no side
   swaps. `orient`'s axis-index tie-break would swap it. Pinned in Task 2.
3. **Two linked holed copies whose stored rotations differ (0 and 180).** The expectation is that they still link into
   one Shape after Refine. Pinned in Task 2.
4. **A project whose custom band type is used only by a solid band on a definition (assembly) part.** The expectation is
   that the band, its type and the type's custom material all survive. Pinned in Task 2 and Task 6.
5. **A part the original already had faulted (a hole that breaks out), untouched by Refine.** The expectation is that it
   is not reported as "no longer fits". Pinned in Task 6.

---

### Task 1: The carry — reading features onto the returned design

**Files:**
- Create: `src/document/featureCarry.ts`, `src/document/featureCarry.test.ts`
- Modify: `src/document/generated.ts` (types only: `GeneratedPart.carry?`, `GeneratedAssembly.carry?`)
- Modify: `src/document/refineDesign.ts` (delete `carryGrain`; its tests move to `featureCarry.test.ts`)
- Modify: `src/generate/run.ts:256` (`prepare` calls `carryFromOriginal`)

**Interfaces:**
- Produces, in `generated.ts`:
  ```ts
  /** TS-only (never in the schema; parseDesign's fresh object drops it). Set by Refine's carryFromOriginal. */
  export interface PartCarry {
    /** Present iff any hole, curve, profile or band is carried: the ORIGINAL part's encoding (spec §3.2). */
    frame?: { posture: Posture; rotation: Rotation };
    holes: HoleRow[]; curves: CurveCut[]; profiles: ProfileCut[]; bands: Band[]; cornerRule: CornerRule; hardware: HardwareUse[];
  }
  // GeneratedPart gains `carry?: PartCarry`; GeneratedAssembly gains `carry?: { hardware: HardwareUse[] }`.
  ```
- Produces, in `featureCarry.ts`:
  - `carryFromOriginal(design: GeneratedDesign, original: SloydDocument): GeneratedDesign`: sets `grain` exactly as
    `carryGrain` did, plus `carry` per spec §3.1. A part with no match, or whose match carries nothing (all arrays empty),
    gets no `carry` key at all (identity).
  - `featuredKinds(b: Board): FeatureKind[]` with `type FeatureKind = 'holes' | 'curves' | 'profiles' | 'bands' | 'hardware'`,
    in that order (used by Tasks 4–6).
  - `hasFrameFeatures(b: Board): boolean`: holes, curves, profiles or bands non-empty.

- [ ] **Step 1: Write the failing tests** in `featureCarry.test.ts`:
  - `carries grain as carryGrain did`: move every `carryGrain` test from `refineDesign.test.ts`, renamed to call
    `carryFromOriginal`. Same assertions.
  - `carries a loose part's features by flat name`: an original with a holed, curved, profiled, banded part named
    `Side`, plus hardware on it, at rotation 180. The design part `Side` comes back with `carry.frame` equal to
    `{ posture, rotation: 180 }`, and `carry.holes`, `curves`, `profiles`, `bands`, `cornerRule` and `hardware`
    `toEqual` the original's, ids included. They are not the same objects (`not.toBe`).
  - `a shaped part carries its Shape's features`: the original `Side` is a ShapedBoard. The carry equals the Shape's arrays.
  - `an assembly part tries each placement in order`: an original with a definition placed as `Left` and `Right`, where
    the design names only `Right`. The assembly part takes the definition part's features.
  - `assembly hardware is carried by placement name`: `Definition.hardware` → the returned assembly's `carry.hardware`.
  - `hardware only: carry without frame`: `carry.frame` is `undefined` and `carry.hardware` is set.
  - `no match, or nothing to carry: no carry key`: `expect('carry' in part).toBe(false)`.
  - `parseDesign drops carry`: `parseDesign({ ...validJson, parts: [{ ...validPart, carry: {...} }] })` result has no
    `carry`.
- [ ] **Step 2:** Run `npx vitest run src/document/featureCarry.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement. Read originals through `flatDocument(original).boards` (already resolved) for parts. For
  assemblies, read `original.definitions` and `original.instances` (`flatDocument` empties definitions, hardware spec P2).
  In `run.ts`, `prepare: (d) => carryFromOriginal(d, base.plain)`. Delete `carryGrain` and its import.
- [ ] **Step 4:** Run the file, then `npm test` and `npm run build`. Expected: PASS. Nothing reads `carry` yet, so no
  other result moves.
- [ ] **Step 5: Commit** `feat(refine): carry features by flat name onto the returned design (spec §3.1)`

### Task 2: Conversion honours the carry (frame, order, types)

**Files:**
- Modify: `src/document/generated.ts` (`convertPart`, `designToDocument`, new `frameFor`)
- Modify: `src/generate/run.ts` (`EvaluateOpts` + `evaluateDesign` pass `bandTypes`/`hardwareTypes`; `runRefine`'s two
  document merges add `bandTypes: doc.bandTypes`)
- Test: `src/document/generated.test.ts` (or a new `src/document/carryConvert.test.ts`, the implementer's choice)

**Interfaces:**
- Consumes: `PartCarry` (Task 1).
- Produces:
  - `frameFor(size: [number, number, number], frame: { posture: Posture; rotation: Rotation }): Pick<Board, 'length' | 'width' | 'thickness' | 'posture' | 'rotation'>`:
    the dimension `axisDimensions` puts on world axis k takes `size[k]`.
  - `designToDocument` opts gain `bandTypes?: readonly BandType[]` and `hardwareTypes?: readonly HardwareType[]`, put on
    the document BEFORE `migrateDocument` (absent: `createDocument`'s defaults, so Generate is unchanged).
  - A definition built from an assembly with `carry` takes `hardware: carry.hardware`.

- [ ] **Step 1: Write the failing tests:**
  - `frameFor reproduces the box`: for every posture × rotation in {0, 90, 180, 270}, `boardExtents({...frameFor(s, f)})`
    equals `s`.
  - `an untouched featured part keeps its features on the same wood, every posture and turn`: for each posture × each
    of the four rotations, use `chiralPart(posture)` given a hole row, `chiralCurved(posture)` (a curve) and
    `chiralTwoSide(posture)` (profiles), each with a band on one side, set to that rotation.
    Run `documentToDesign` → `carryFromOriginal` → `designToDocument(…, { centre: false, exact: designValues(design), bandTypes, hardwareTypes })`.
    Assert the refined board's `posture`, `rotation`, `length`, `width` and `thickness` equal the original's, and that its
    world geometry is unchanged. Compare `partGeometry` world bodies, or the world hole centres
    (`holes.ts`' world helper) and world band sides. **Mutate:** encoding featured parts with `orient` must fail at 180
    and 270.
  - `a square-section leg does not swap sides`: a 1.5 × 1.5 × 30 leg with a hole row on its width face and a chamfer,
    untouched. Same assertion. **Mutate** as above.
  - `two linked holed copies at rotations 0 and 180 still link`: both come back with one `shape` id.
    **Mutate:** apply the carry after `linkByRole` and they no longer link.
  - `bands and hardware survive the load gate`: a part with a band of a custom solid band type (custom material) and a
    hardware use. The refined document keeps the band, the type and the material. **Mutate:** drop the opts types and the
    band and hardware vanish.
  - `the band survives on an assembly part` (Review Focus 4): the same as above, inside a definition.
  - `resized: features stay at stored stations`: the design makes the holed side's length +6. The refined holes
    `toEqual` the original's (same `station`, `alongFrom`), and length is +6 on the same world axis.
  - `taper on a featured part resized past its width`: a tapered, holed part whose width is made longer than its length
    converts with no rejection, and the taper stays on the stored length.
  - `runRefine keeps custom band types` (scripted client, in `run.test.ts`): the refined document's `bandTypes` equals
    the original's.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. In `convertPart`, `fields` uses `p.carry?.frame ? frameFor(size, p.carry.frame) : orient(size)`.
  The return spreads `p.carry`'s arrays (copied again with the copy helpers) in place of the empty ones. Leave tapers and
  angle cuts as they are: they already convert in whatever frame `board` has.
- [ ] **Step 4:** Run `npm test` and `npm run build`. Expected: PASS, with every existing Generate and Refine test
  unchanged.
- [ ] **Step 5: Commit** `feat(refine): convert carried parts in the original frame, before migrate and linking (spec §3.2–3.3)`

### Task 3: `turnCandidates` never turns a banded part

**Files:** Modify `src/document/roleLinks.ts:20`; Test `src/document/roleLinks.test.ts`

- [ ] **Step 1: Failing test** `turnCandidates gives none for a banded part`: a plain part with one band →
  `turnCandidates(b)` is `[]`.
- [ ] **Step 2:** Run it. Expected: FAIL (a 180° candidate is returned).
- [ ] **Step 3:** Add `|| b.bands.length > 0` to the guard and the word "bands" to the doc comment above it.
- [ ] **Step 4:** Run `roleLinks.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `fix(linking): turnCandidates never turns a banded part (spec §3.4)`

### Task 4: Lift the refusals; pre-checks in the part's own frame

**Files:**
- Modify: `src/generate/refine.ts` (`plainForRefine`), `src/document/refineDesign.ts` (`documentToDesign`, `RefusalReason`)
- Delete: `src/document/holedRefusal.ts`, `curvedRefusal.ts`, `bandedRefusal.ts`, `hardwareRefusal.ts` and their own tests
- Modify tests: `src/document/profilesView.test.ts` (keep its "turnCandidates gives none" pin, drop the refusal
  imports), `src/document/treeEdit.mirror.test.ts:376` (drop or re-aim the `curvedRefusal` message check), plus every
  Refine test asserting a `'holes' | 'curves' | 'bands' | 'hardware'` refusal (`grep -rn "reason: '\(holes\|curves\|bands\|hardware\)'" src`)

**Interfaces:** Produces `RefusalReason` without `'holes' | 'curves' | 'bands' | 'hardware'`.

- [ ] **Step 1: Failing tests** in `refineDesign.test.ts` / `refine.test.ts`:
  - `Refine accepts a holed, curved, profiled, banded project with hardware`: `refineRefusal(doc)` is `null`, and
    `documentToDesign` returns a design.
  - `a joined holed project reaches the gate`: a joined project with shelf-pin holes. `plainForRefine` returns `plain`
    with `joints`, and the plain parts still carry their holes.
  - `the taper pre-check reads a featured part in its own frame`: a holed, tapered part stored at a posture where
    `orient` would choose a different encoding. It is not refused `'taper-form'`. **Mutate:** judge it with `orient`
    and it is refused.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Remove the four calls in both places and the union members. In `documentToDesign`'s two pre-checks
  (`unencodable`, `unbuildable`), use `hasFrameFeatures(b) ? b : { ...b, ...orient(boardExtents(b)) }`. Delete the four
  modules. `npm run build` finds every remaining reference.
- [ ] **Step 4:** Run `npm test` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(refine): accept holes, curves, profiles, bands and hardware (spec §6)`

### Task 5: The message note, and the `'feature-turned'` fault

**Files:**
- Modify: `src/generate/refine.ts` (`refineMessage`), `src/document/designCheck.ts` (`ViolationKind` gains
  `'feature-turned'`), `src/generate/run.ts` (`EvaluateOpts.extraFaults`)
- Modify: `src/document/featureCarry.ts` (`featureTurned`), `src/document/carryText.ts` (create: words)
- Tests: `src/generate/refine.test.ts`, `src/document/featureCarry.test.ts`, `src/generate/run.test.ts`

**Interfaces:**
- `carryText.ts`: `kindsText(kinds: FeatureKind[], counts?: …): string`. Fixed words: holes → `holes`; curves → `a curve`
  / `curves`; profiles → `an edge profile` / `edge profiles`; bands → `edging`; hardware → `hardware`. Joined with
  `, `. Example: `Top (an edge profile, edging)`.
- `featuredNote(design: GeneratedDesign): string | null` (in `carryText.ts`), the spec §5 paragraph, verbatim:
  `These parts carry holes, curves, edge profiles, edging or hardware that this format does not show; Sloyd keeps them on the part with the same name. Keep each one's name, and keep it the same way round: ` + the list + `.`
  List items are `Name (kinds)` in design order, loose parts first. An assembly part appears once under its first
  placement as `Placement › Part`. Assembly hardware appears as `Placement (hardware)`. Returns null when nothing is
  carried.
- `refineMessage(design, s, catalog?, original?: SloydDocument)` gains `original`. It runs
  `featuredNote(carryFromOriginal(design, original))` and inserts `['', note]` right after the design JSON line only when
  the note is non-null. `original` absent means no note. `runRefine` and `refineEstimateUsd` pass `base.plain`.
- `featureTurned(refined: FlatDocument, original: FlatDocument): Violation[]` (in `featureCarry.ts`). For each refined
  part whose flat-name original `hasFrameFeatures`: let k be the world axis carrying the original's `thickness`
  (`axisDimensions(orig).indexOf('thickness')`), E0 the original's extents and E1 the refined part's. Skip it if
  `E0[k] > min(E0)`. Fault if `E1[k] > min(E1)`.
  - `kind: 'feature-turned'`, `parts: [name]`.
  - `message`: `` `${name} carries ${kindsText} Sloyd keeps on the part; keep it the same way round, ${E0[k]}in along ${'xyz'[k]}.` ``
  - `shown`: `` `${name} was turned onto another face; its ${kindsText} are now on the wrong faces.` ``
- `EvaluateOpts.extraFaults?: (flat: FlatDocument) => Violation[]`, concatenated into `raw` in `evaluateDesign`. Refine
  passes `(f) => featureTurned(f, plainFlat0)`.

- [ ] **Step 1: Failing tests:**
  - `refineMessage is byte-identical without features`: a feature-free design. The message equals today's (snapshot the
    current output before changing the code).
  - `refineMessage names featured parts`: the exact paragraph for a fixture with `Side` (holes), `Apron` (a curve),
    `Top` (an edge profile, edging) and `Door` (hardware).
  - `featureTurned`: a side returned lying flat gives one violation with the exact `message` and `shown`. The same box
    on an unfeatured part gives none. A refined box tied on k gives none. An original whose thickness is not its
    smallest extent gives none. **Mutate:** the tie rule (`>=` instead of `>`) must fail the tie test.
  - `run.test.ts`: a scripted Refine whose first answer turns the holed side and whose second keeps it. The second call's
    user turn contains the `feature-turned` message, and the outcome has no such violation.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` and `npm run build`. Expected: PASS. The `estimate.ts` and prompt pins are unchanged.
- [ ] **Step 5: Commit** `feat(refine): name carried parts to the model; send a turned featured part back (spec §4, §5)`

### Task 6: The done view — Not kept, Check at the new size

**Files:**
- Modify: `src/document/carryText.ts` (`carriedSummary`), `src/generate/run.ts` (`RefineOutcome.carried`),
  `src/panels/RefineDialog.tsx`
- Tests: `src/document/featureCarry.test.ts` (or `carryText.test.ts`), `src/panels/RefineDialog.test.tsx`, `src/generate/run.test.ts`

**Interfaces:**
- `carriedSummary(original: SloydDocument, refined: SloydDocument): { notKept: string[]; check: string[] }`:
  - Flat parts by name.
  - **notKept:** one line per original flat part with `featuredKinds` non-empty and no refined part of that name:
    `` `${name}'s ${kindsText} — no part named ${name} in the result.` ``. Original assemblies with hardware and no
    refined placement of any of their placement names get the same line with the placement name.
  - **check:** one line per refined featured part whose world extents differ from its original's (exact, per axis).
    - With a new fault: `` `${name} was resized — ${kindsText} no longer fit; see Properties.` ``
    - Otherwise: `` `${name} was resized — its ${kindsText} stay measured from where they were placed; check them.` ``
  - Hardware alone never makes a part "featured" for `check`.
- **New fault:** a fault key present on the refined part and absent on the original part. Keys are per feature id:
  - `` `h:${row.id}:${faultKey(f)}` `` from `holeFaults(board, row)`
  - `` `c:${c.id}:${f.kind}:${f.edge?.dim}${f.edge?.side}` `` from `curveFaults`
  - `` `p:${p.id}:${f.kind}` `` from `profileFaults(board, p)`
  - `` `b:${f.side.across}${f.side.from}:${f.kind}` `` from `bandFaults(part, doc.bandTypes)`
- `RefineOutcome` gains `carried: { notKept: string[]; check: string[] }`. `runRefine` computes it **plain to plain**:
  `carriedSummary(base.plain, refinedPlain)`, where `refinedPlain` is the refined document after the loop's merge and
  BEFORE `runJoinery`. Joinery grows tenon parts, so comparing the joined result would list every joined part as
  "resized". For an unjoined original, `refinedPlain` is the final document.
- `RefineDialog`: after the issues line, before the change list, render `notKept` under a `<p>Not kept:</p>` and `check`
  under `<p>Check at the new size:</p>`, each as a `<ul>` of all items, never sliced. Nothing renders for an empty list.

- [ ] **Step 1: Failing tests:**
  - A renamed holed part appears in `notKept` with the exact line.
  - A side made taller appears in `check` with the "stay measured" line.
  - A side made shorter so that a row breaks out gives the "no longer fit" line. **Mutate:** without the
    original-faults filter, an untouched part whose row already broke out is listed.
  - An untouched part that already broke out is NOT listed (Review Focus 5).
  - A part that only moved is not listed.
  - `RefineDialog` renders both lists in full with 14 items each (no "and N more").
  - `run.test.ts`: a joined holed project whose untouched sides were rebased by joinery gives `check: []`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(refine): done view lists features not kept and parts to check (spec §5)`

### Task 7: Records, merge, live check, deploy

**Files:** `docs/invariants.md`, `CLAUDE.md`, `docs/module-map.md`, `docs/follow-ups.md`, `docs/rounds.md`, the spec's
status line.

- [ ] **Step 1: Invariants.**
  - Invs 41, 50, 53, 54 and 55: the "Refine refuses…" clauses become "Refine CARRIES them by flat name in the original
    part's frame (refine-features spec §3)". Write it in full in `docs/invariants.md` and condensed in CLAUDE.md.
  - New inv 56, in full and condensed: **"A part Refine carries holes, curves, profiles or bands onto keeps the
    original's posture and rotation (`frameFor`); never `orient` it. The carry lands before `migrateDocument` (band and
    hardware types through `designToDocument`'s opts) and before `linkByRole`. `turnCandidates` never turns a part with
    holes, curves, profiles or bands."**
  - The CLAUDE.md "refusals of joinery/Refine/Repair" home row drops the deleted modules and adds `featureCarry.ts`.
- [ ] **Step 2: Records.**
  - `module-map.md`: `featureCarry.ts`, `carryText.ts`, the four deletions.
  - `follow-ups.md`: close 328 and 398 for Refine; close 363's Refine reading (authoring stays open); 329 stays open.
    Add a new record-only entry for spec §11's `carryGrain` grain-axis observation, and one for the plan-turn gap
    (spec §4). Update CLAUDE.md's open-follow-ups list to match.
- [ ] **Step 3: Verify.** Run `npm test` (record the new count in CLAUDE.md's Commands) and `npm run build`. Both
  green.
- [ ] **Step 4: Merge.** `git checkout master && git merge --no-ff refine-features`, run `npm test` and
  `npm run build` on the merged tree, then `git branch -d refine-features`.
- [ ] **Step 5: Live check on the dev server** (Playwright; paid runs pre-approved up to 10).
  - Build a small cabinet: two sides with shelf-pin rows, an arched apron, a top with a roundover and edging, and hinges
    on a door.
  - Refine "make it 6 inches taller". Then Refine the result with "add a second shelf".
  - Check:
    - every feature is where it was on the wood (by eye and by a DOM/document readout);
    - the sides are in "Check at the new size";
    - nothing appears in "Not kept";
    - the band and hardware types survive.
  - Write it up in `docs/browser-verification-refine-features.md`.
- [ ] **Step 6: Deploy** per `DEPLOYMENT.local.md`.
  - Confirm the bundle hash at the edge and in-network, and the CSP header.
  - Production is checked by page load only, and `localStorage` is confirmed cleared in the verifying browser
    afterwards.
  - Record the deploy: the CLAUDE.md Status block (production and rollback lines; rollback is free, still schema 20) and
    `docs/rounds.md` (a table row, the Status log and the rollback table). Commit.
