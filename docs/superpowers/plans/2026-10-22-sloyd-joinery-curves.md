# Joinery and Repair accept curves and profiles (chunk 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add joinery and Repair joints accept parts with curves and edge profiles. Joinery keeps every curve and profile
where it is on the wood, rules out per site only the joint kinds that would cut into one, and lets a feature that runs
straight out through a tenoned end ride through when it clears the tenon. Repair's gate compares curves and profiles.

**Architecture:** Chunk 1's machinery, widened. No new mechanism, except one change to how the watch judges shaped wood.
- **Re-anchoring.** `rebaseCurves` and `rebaseProfiles` sit beside `rebaseHoles` in `resize` and in `resizeAt`.
- **Gate.** `sameJoined` gains a structural, field-table-driven comparison for curves and profiles.
- **Zones.** Chunk 1's watched trials stay. The watch judges a part's curves and profiles in the part's **original
  frame** (P5): each watched cut box and trim slab is shifted back by that part's min-end growth so far in the trial, and
  tested against the stored part's features as `flatDocument` gave them. New wood carries no stored feature, so a
  feature that runs out through the grown end is judged once, at the resize, by the tenon-clearance rule.
- **Geometry.** The open (touching-allowed) region tests live in `document/` beside the closed ones they mirror.

**Tech Stack:** TypeScript, React, Vitest. `npm test` does NOT typecheck; `npm run build` is the typecheck gate. Run it at
the end of every task.

**Spec:** `docs/superpowers/specs/2026-10-21-sloyd-joinery-features-design.md` (approved 2026-10-21; chunk 1 shipped
2026-10-22 as `f3493a7`). This plan covers **chunk 2 only**: everything there for curves and profiles (§3.3's curve and
profile regions, §3.4, §4.2, §4.3, §4.5, §5, and §7's chunk-2 tests). Read §1–§5, §7 and both *Amended* blocks before
Task 1. Chunk 1's plan (`docs/superpowers/plans/2026-10-21-sloyd-joinery-holes.md`) shows the pattern each task follows.

## Amended (planning)

Copied into the spec as *Amended (planning, chunk 2)* in Task 7.

- **P4: open tests, conservative where the closed ones are.** Spec §3.3 asks for touching to pass:
  - **Curves and straight profiles:** `rectOverlapsWaste`, an open test, is used on the real outline.
  - **A stopped profile's extent along `through`:** its span widened by `runoutReach` at each stopped end, as
    `intoCurve` widens it. It is compared open.
  - **Swept profiles:** these keep `sweptWasteMeets`' conservative footprint (`BEARING` + reach), through a box form,
    `sweptWasteMeetsBox`.

  Cost: a joint that only touches a swept profile, or a stopped profile's run-out allowance, is ruled out. It is never
  wrongly allowed.
- **P5: judge in the original frame.** The watch tests curves and profiles on `flat.boards[part]`, the part before the
  trial (`applyJoints` clones it, so it is never mutated). It never builds a geometry view of a mid-trial board
  (`geometryBoard` and `sweptWaste` are memoised per object, so a view of a mutated board is stale). A cut box or trim
  slab is moved into the original frame by subtracting, per dimension, the sum of the part's min-end growths so far in
  the trial. Holes keep chunk 1's rule unchanged, judged on the board as it stands, so a holes-only project behaves byte
  for byte as in chunk 1.
- **P6: "touches the joined end with positive area" (§3.4).**
  - **A curve or straight profile across the grown dimension** (`d` is `u` or `v`): the length of the end line, in the
    curve's (u, v) plane, that lies inside the waste exceeds 1e-9 (`wasteOnSegment`). So a bow, whose waste meets the end
    only at a corner point, keeps the growing kinds.
  - **Along the grown dimension** (`d === through`): its extent along `through` reaches that end.
  - **A swept profile:** conservatively, its box form meets the end face, touching included.
- **P7: the run-through exception (§3.4), decided per growing face.** A feature takes it when all three hold:
  1. `d === 'length'`. `tenonSection` is defined over width × thickness, the recipe's own frame.
  2. It is a curve or straight profile with `through === d` that runs out through the GROWING face: a plain curve
     always does; a view curve with a `span` does unless that end is a stop.
  3. Its waste in (width, thickness) does not overlap the tenon section `[shoulder, w − shoulder] × [cheek, t − cheek]`
     (open).

  A run-through feature at a TRIMMED end never conflicts: it is shortened with the part. Swept profiles take no
  exception. A profile `through` at the growing end and stopped at the far end takes it. Its far station is measured
  from either end; if measured from the growing end, `rebaseProfiles` keeps it in place.
- **P8: words.** Spec §3.5 gives two forms: its example says "roundover", its word list `<kind> profile`. The word list
  wins.
  - Feature words: `holes`, `curve`, `roundover profile`, `cove profile`, `Roman ogee profile`, `bead profile`,
    `thumbnail profile`.
  - The verb is `are` after `holes` and `is` otherwise.
  - The dialog's failure refusal is generalised (exact copy in Global Constraints).

  All of this is for the user's eye.

## Global Constraints

- **No schema change**; `CURRENT_VERSION` stays 20. `DESIGN_SCHEMA`, Generate and Refine are unchanged. Refine still
  refuses curved and profiled projects in its own words (`curvedRefusal(flat, 'refine')` in `refine.ts` and
  `refineDesign.ts`).
- **`JOINERY_PROMPT` and `JOINT_SCHEMA` are byte-identical.** Chunk 1's pin test stays green and unmodified.
- **Byte for byte:**
  - With no hole, curve or profile on any part, `featureAllowed` returns the SAME `sites` array and no ruled-out entry.
  - A holes-only project is judged exactly as in chunk 1.
  - Every existing joinery, Repair, gate, `featureZones` and `holesOracle` test passes unmodified.
- **Touching passes:** a conflict is an overlap above `1e-9` on all three axes, never `TOUCH`. The P4 conservative cases
  are the only exceptions.
- **Ruling-out is decided before any call or mutation** (inv 41).
- **Never mutate a stored curve, profile or array in place.** Flat twins share them. A rebase replaces changed entries
  with new objects; unchanged entries keep their identity.
- **Bands keep today's refusal and Repair withholding** (`bandedRefusal(flat, 'joinery')` and `repairDocument`'s
  `bandedParts` guard). That is chunk 3.
- **Exact copy:**
  - `<Enter> → <Receive>: <kinds> ruled out — <Part>'s <feature> is in the way.` (`are` after `holes`)
  - `<Enter> → <Receive>: left as a butt — <Part>'s <feature> is in the way of every joint.` (`are` after `holes`)
  - The kind words and list joining are chunk 1's; the feature words are P8's.
  - The dialog's failure refusal (was `HOLE_CHECK_FAILED`), renamed `FEATURE_CHECK_FAILED`: `Sloyd couldn't check this
    project's holes, curves and profiles against its joints. Add joinery before drilling or shaping, or remove those
    first.` Its console line: `Sloyd: checking features against joints threw`.
- **Branch and keys.** Branch `joinery-curves` off `master`; merge with `git merge --no-ff`. No pull request. Never
  commit a key; never clear the dev browser profile.

## Review Focus

Inputs the spec implies but its examples do not exercise, most likely first. Each has a test in its owning task.

1. **A rail tenoned at its MIN end, with an arch 1" from that end** (`uFrom: 'min'`). After the growth, a stale or
   current-frame judgement puts the shoulder cuts over the arch. Expect mortise-tenon kept.
   - Task 4: `an arch near the min end of a rail tenoned there keeps the tenon`.
   - Mutation: judge cuts in the current frame.
2. **A mirrored instance's curved or two-side part** (`mirrorCurveCut`/`mirrorProfile` flip flags, swap station ends).
   The rebase runs in the flat frame and write-back lowers it. The world waste is unchanged and the stored form lowers
   exactly. Use `chiralCurved` and `chiralTwoSide`, never a symmetric fixture (inv 44).
   - Task 1: `mirrored.test.ts`.
3. **Two rails on one Shape with an arch measured from the end only Rail A's tenon grows** (§4.5).
   - Rail A's arch stays put in world space.
   - Rail B's stored arch is unchanged.
   - The write-back splits as chunk 1's shape test does.
   - Task 2.
4. **A stopped roundover that runs out through the tenoned end and stops at the far end.** It takes the exception
   (P7) when it clears the tenon, and loses the growing kinds when it does not.
   - Task 4.
5. **Speed with a swept profile:** the shaker table with roundovers on every leg, arched aprons and an ogee loop on the
   top. `featureAllowed`'s median over 20 runs is ≤ 100 ms, else stop and escalate (the dialog runs it on every
   document change while open).
   - Task 4, Step 5.

---

### Task 1: `rebaseCurves`, `rebaseProfiles` and their inverse

**Files:**
- Modify: `src/generate/joints/recipes.ts` (beside `rebaseHoles` ~227; `resize` ~58–70)
- Modify: `src/generate/joints/unjoin.ts` (`resizeAt` ~91–101)
- Test: `src/generate/joints/curvesRebase.test.ts` (new), `src/generate/joints/mirrored.test.ts`

**Interfaces:**
- Produces, in `recipes.ts`, each mutating `b.curves` / `b.profiles` by replacing changed entries:
  ```ts
  export function rebaseCurves(b: Board, d: Dimension, end: CutFrom, amount: number): void
  export function rebaseProfiles(b: Board, d: Dimension, end: CutFrom, amount: number): void
  ```
  - **Curves (spec §4.2):** with `[u, v] = uvDims(c.through)`, add `amount` to every u coordinate (`start[0]` and each
    segment's `to[0]`) when `u === d && c.uFrom === end`, and to every v coordinate when `v === d && c.vFrom === end`.
    `rise`, `radius`, `side` and `through` are untouched.
  - **Profiles (spec §4.3):** a station end `{ side, from, at }` gets `at += amount` when
    `runDim(side) === d && from === end`. `through` ends, `loop` and every other field are untouched.

- [ ] **Step 1: Write the failing tests** in `curvesRebase.test.ts`, for each posture × turn (`turnFixtures.ts` poses),
  driven through `mortiseTenon` (growth, both world sides) and the rabbet trim path (shrink):
  - `a curve measured from the moving end stays put in world space`. An arch with `uFrom === end` and a notch with
    `vFrom === end` (when `d` is v). Every `localSegments` endpoint's world position (the `snapPoints` local→world rule)
    is unchanged within 1e-12.
  - `a curve measured from the far end is untouched` (`toBe`).
  - `a through-d curve keeps its numbers` (`toBe`).
  - `a station measured from the moving end stays put`: the stopped profile's view-curve span (`profileSpan`) and each
    station's world position are unchanged.
  - `through ends and loops are untouched` (`toBe`).
  - `a two-side run shifts only its station on the moving dimension`.
  - `curve and profile ids and counts survive applyJoints` (its closing `migrateDocument` drops a malformed entry
    silently).
  - `the input is never mutated`: deep-freeze the input flat document's curves and profiles; `applyJoints` does not
    throw.
  - `resize then resizeAt restores every number within GATE_TOLERANCE`, through `readJoints`' `plain`.
  - `mirrored.test.ts`: `a mirrored copy's curved and two-side parts keep their waste in world space through joinery`,
    with `chiralCurved` and `chiralTwoSide`. The lowered stored forms equal the input's within `GATE_TOLERANCE`.

- [ ] **Step 2: Run them and see them fail.**
  Run: `npx vitest run src/generate/joints/curvesRebase.test.ts src/generate/joints/mirrored.test.ts`
  Expected: the stays-put tests FAIL, off by `a`.

- [ ] **Step 3: Implement** both rebases and call them in `resize` and `resizeAt`, right after `rebaseHoles`.

- [ ] **Step 4: Mutate.** For each shift: drop it, flip its sign, and test the wrong `from`. Make one rebase mutate in
  place. Each must turn a test red. Restore.

- [ ] **Step 5: Run** `npx vitest run src/generate/joints && npm run build`. All PASS; no existing test changes.

- [ ] **Step 6: Commit.** `feat(joinery): re-anchor curves and profiles when joinery grows or trims a part`

### Task 2: The gate compares curves and profiles; Repair accepts them

**Files:**
- Modify: `src/generate/joints/unjoin.ts` (`sameJoined` ~306–323), `src/generate/joints/repair.ts` (the `curvedParts`
  guard ~104), `src/document/profiles.ts` (export `PROFILE_KEYS`)
- Test: `src/generate/joints/unjoin.test.ts`, `src/generate/joints/repair.test.ts`,
  `src/generate/joints/runJoinery.test.ts`

**Interfaces:**
- Consumes: Task 1's rebases.
- Produces, from `unjoin.ts`:
  ```ts
  export function sameCurves(a: readonly CurveCut[], b: readonly CurveCut[]): boolean
  export function sameProfiles(a: readonly ProfileCut[], b: readonly ProfileCut[]): boolean
  ```
  Both compare in stored order, ids ignored, walking each `CURVE_KEYS` / `PROFILE_KEYS` field structurally (inv 40):
  - arrays element by element, with equal lengths;
  - objects by an equal key set, so a `rise` vs a `radius`, or a `through` end vs a station end, differs;
  - numbers within `GATE_TOLERANCE`;
  - every other value with `===`.

  Do not hand-list fields.

- [ ] **Step 1: Write the failing tests.**
  - `unjoin.test.ts`:
    - `gateUnjoin passes a joined project with curves and profiles`: the shaker table with an arch on each apron
      (clear of the ends) and an end-to-end roundover along each leg's outer arris, joined with defaults.
    - `sameJoined fails when a curve or profile moved after joining`: a curve's `start` or a station's `at` + 1e-3
      fails; + 1e-10 passes. Pin it through `sameJoined`, as chunk 1 found for holes.
    - `a metric curve coordinate stored from max round-trips through the gate`: `127 / 25.4`, `uFrom: 'max'`, a tenon
      `L = 1.25`.
  - `repair.test.ts`: replace the curved withholding test with `repairDocument repairs a curved bug fixture`. The fu 240
    fixture, with an arch and a straight roundover on one twin away from its joints, gives `{ doc, dropped }` as without
    them. `curves` and `profiles` in `flatDocument(out.doc)` are `toEqual` the input's.
  - `runJoinery.test.ts`, `two rails on one shape with an arch: only Rail A tenoned` (Review Focus 3). The shape is on
    the ENTERING rails. The arch is measured from the end Rail A's tenon grows. Assert:
    - Rail A's arch is unchanged in world space;
    - Rail B's stored arch is unchanged;
    - positions are unchanged;
    - `out.shapes` matches chunk 1's shape test.

- [ ] **Step 2: Run and see them fail.** The scalar `same` compares arrays by identity, so the gate test fails for
  curved projects. The Repair test is withheld, giving `null`.

- [ ] **Step 3: Implement.**
  - Write `sameCurves` and `sameProfiles`; call them in `sameJoined` after `sameHoles`.
  - Drop `repairDocument`'s `curvedParts` guard and its import. Keep the banded guard.

- [ ] **Step 4: Mutate.**
  - Compare numbers exactly: the metric test goes red. If it does not, record that in the commit message and keep the
    tolerance per P2.
  - Skip `segments`: the moved-curve test goes red.
  - Skip `run`: the moved-station test goes red.

- [ ] **Step 5: Run** `npx vitest run src/generate && npm run build`. All PASS.

- [ ] **Step 6: Commit.** `feat(repair): the gate compares curves and profiles; Repair accepts them`

### Task 3: Open region tests for curves and profiles

**Files:**
- Modify: `src/document/curves.ts` (beside `rectMeetsWaste` ~548), `src/document/sweep.ts` (beside `sweptWasteMeets`
  ~682), `src/document/ruledOutText.ts`
- Create: `src/document/featureRegions.ts`
- Test: `src/document/curves.test.ts`, `src/document/sweep.test.ts` (or the file `sweptWasteMeets` is tested in),
  `src/document/featureRegions.test.ts` (new), `src/document/ruledOutText.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // curves.ts — OPEN: overlap above 1e-9 (the rect shrunk by 2·CURVE_EPS per side, then rectMeetsWaste; false if empty)
  export function rectOverlapsWaste(segs: readonly LocalSeg[], lo: P2, hi: P2): boolean
  // curves.ts — the length of segment a→b inside the closed waste. Breakpoints: a, b, every boundaryHits point, and every
  // outline vertex within CURVE_EPS of the segment (a boundary line ALONG the segment gives no crossing). Each gap counts
  // when its midpoint is in the waste ('closed').
  export function wasteOnSegment(segs: readonly LocalSeg[], a: P2, b: P2): number
  // sweep.ts — sweptWasteMeets' conservative footprint test for an axis-aligned box (closed, P4)
  export function sweptWasteMeetsBox(view: SweepBoard, p: ProfileCut, box: Region): boolean
  // ruledOutText.ts
  export type FeatureWord = 'holes' | 'curve' | 'roundover profile' | 'cove profile' | 'Roman ogee profile' | 'bead profile' | 'thumbnail profile'
  export function profileWord(kind: ProfileKind): FeatureWord
  // featureRegions.ts — one part's shaped features, read through geometryBoard (stored order: curves, straight
  // profiles, swept)
  export interface ShapedFeature { word: FeatureWord; curve?: ViewCurve; swept?: ProfileCut }
  export function shapedFeatures(board: Board): { view: Board; features: ShapedFeature[] }
  export function featureMeetsBox(view: Board, f: ShapedFeature, box: Region): boolean
  export function featureTouchesEnd(view: Board, f: ShapedFeature, d: Dimension, end: CutFrom): boolean
  export function runsOutThrough(view: Board, f: ShapedFeature, d: Dimension, end: CutFrom): boolean
  export function crossSectionOverlaps(view: Board, f: ShapedFeature, lo: P2, hi: P2): boolean
  ```
  - **`featureMeetsBox`, for a curve:** two conditions must both hold, open:
    - the box's `through` span overlaps the curve's extent along `through` by more than 1e-9: the whole dimension, or
      the view `span` widened by `runoutReach` at each stopped end;
    - `rectOverlapsWaste` holds on the box's (u, v) projection.
  - **`featureMeetsBox`, for a swept profile:** `sweptWasteMeetsBox`.
  - **`featureTouchesEnd`:** P6.
  - **`runsOutThrough`:** P7's condition 2.
  - **`crossSectionOverlaps`:** `rectOverlapsWaste` in the curve's (u, v). Only meaningful for a curve `through` d.
  - Words come from `profileFields(c)?.kind` for a view curve, as `intoCurve` reads them, and `p.kind` for a swept one.

- [ ] **Step 1: Write the failing tests.**
  - `rectOverlapsWaste`:
    - a rect sharing an edge with a rounded corner's waste, or tangent to an arch's crown: false;
    - the same rect pushed 1e-6 in: true.
    - Mutation: shrink by 0, and the touching cases go red.
  - `wasteOnSegment`:
    - a rounded corner of radius r at the end gives `r` within 1e-12;
    - a bow running corner to corner gives 0;
    - an arch clear of the end gives 0;
    - a notch cut from the end edge gives its width.
    - Mutation: drop the on-line vertices, and the corner gives 0.
  - `sweptWasteMeetsBox`: agrees with `sweptWasteMeets` for a thin box at a hole's footprint; false for a box clear of an
    ogee loop by its reach plus 1/16".
  - `featureRegions.test.ts`:
    - a leg's outer-arris roundover against a mortise box starting exactly at the cheek: false;
    - against a dado box across the flush face: true;
    - a stopped roundover against a box just past its stop, inside the run-out allowance: true (P4);
    - `runsOutThrough` for a plain through-length roundover, a profile stopped at the growing end (false), and one
      stopped only at the far end (true);
    - `featureTouchesEnd` for a bow (false) and a rounded corner (true).
  - `ruledOutText.test.ts`: each P8 word in both sentences, with `is` and `are`.

- [ ] **Step 2: Run and see them fail** (no exports).

- [ ] **Step 3: Implement.**
  - `ruledOutLine` picks the verb from the word.
  - `RuledOutLine.feature` becomes `FeatureWord`.
  - `boundaryHits` stays private; reuse it.

- [ ] **Step 4: Run** `npx vitest run src/document && npm run build`. All PASS.

- [ ] **Step 5: Commit.** `feat(document): open region tests for curves and profiles; feature words`

### Task 4: `featureAllowed` over curves and profiles

**Files:**
- Modify: `src/generate/joints/featureZones.ts`
- Test: `src/generate/joints/featureZones.curves.test.ts` (new)

**Interfaces:**
- Consumes: Task 3's `featureRegions.ts`; `tenonSection` (`recipes.ts`); chunk 1's `JoinWatch`.
- Produces: the same `featureAllowed` signature. `FeatureWord` is now Task 3's type (re-exported, or imported by
  `run.ts` from `ruledOutText.ts`). `RuledOut.feature` names the hit feature's word.

- [ ] **Step 1: Write the failing tests**, one per spec §3.5 curve or profile example, plus the Review Focus cases. Each
  asserts `allowed` and `ruledOut` exactly:
  - **Spec §3.5 examples:**
    - `a leg rounded over on its outer corner, apron flush: dado ruled out, tenon kept`. Name `roundover profile`.
    - `an apron arched between the legs, clear of the ends: allowed unchanged`.
    - `a rail with a 1/4 roundover along its top edges, tenoned at both ends: allowed unchanged`. Write this one FIRST
      and confirm it is red under chunk 1's rule applied to curves: the cheek cuts land in the run-through extension.
  - **Growing end and exception:**
    - `a rounded corner at the rail's tenoned end rules out the growing kinds` (P6).
    - `a bow on a tenoned rail keeps the growing kinds` (P6, point contact).
    - `a run-through roundover deeper than the shoulder rules out the growing kinds` (P7, condition 3).
    - `run-through at a width-grown end takes no exception` (P7, condition 1).
    - The two Review Focus 4 cases.
  - **Trims:**
    - `a curve in the slab a rabbet would trim rules rabbet out at the trimming site, for its whole unit`.
    - `a run-through feature at a trimmed end does not`.
  - **Review Focus:**
    - Review Focus 1.
    - `a swept loop on a top rules out what its footprint touches` (P4).
  - **Chunk 1 regression:** `holes and a curve on one part: the first hit names its word`. Holes are judged first.
  - **Byte for byte:**
    - with no feature, the same array comes back;
    - every chunk 1 `featureZones.test.ts` case still passes unmodified (run it).

- [ ] **Step 2: Run and see them fail** (curved projects rule nothing out today).

- [ ] **Step 3: Implement.**
  - **Early return:** widen it to any hole, curve or profile.
  - **The watch.** Rename `watchHoles` to a watch over all features. It keeps chunk 1's hole rule as it is, and adds:
    - **Per part:** `shapedFeatures(flat.boards[part])`, computed once per `featureAllowed` call and cached by part
      index. Also per part, a running `shift: Record<Dimension, number>` of min-end growths in this trial.
    - **`cut`:** shift `clippedRegion(board, cut)` back by `shift` (P5). The cut conflicts with the first feature
      `featureMeetsBox` reports.
    - **`resize`, growth (`amount > 0`):** for each feature that `featureTouchesEnd(view, f, d, end)` reports, it is
      exempt when P7 holds, using `tenonSection(board.thickness, board.width)` as the rect. Otherwise it is a hit. Then,
      when `end === 'min'`, `shift[d] += amount`.
    - **`resize`, trim (`amount < 0`):** skip features that run out through that end along `d` (P7). Hit on any
      feature whose `featureMeetsBox` reports the slab (in the original frame). Then, when `end === 'min'`,
      `shift[d] += amount`.
    - **Order and naming:** a hit records `{ part, word }`, holes before shaped features, first wins.
      `RuledOut.feature` is the word.

- [ ] **Step 4: Mutate.** Each must turn a test red; then restore.
  - Judge in the current frame.
  - Drop the exception.
  - Drop condition 1, then condition 3.
  - Make `featureTouchesEnd` closed for curves.
  - Drop the trim skip.

- [ ] **Step 5: Measure** per Review Focus 5. Record the median in the commit message. Above 100 ms, stop and escalate.

- [ ] **Step 6: Run** `npx vitest run src && npm run build`. All PASS, chunk 1's tests unmodified.

- [ ] **Step 7: Commit.** `feat(joinery): rule out only the joint kinds that would cut into a curve or profile`

### Task 5: Wire it in

**Files:**
- Modify: `src/generate/joints/tapers.ts` (`joineryRefusal`: drop the curved call and import),
  `src/document/curvedRefusal.ts` (narrow `action` to `'refine'`, as `holedRefusal` was), `src/App.tsx` (~45, ~99–105),
  `src/generate/run.ts` (only the `FeatureWord` import if it moved)
- Test: `src/generate/joints/runJoinery.test.ts`, `src/document/curvedRefusal.test.ts`, `src/App.test.tsx`,
  the Refine test that pins chunk 1's order (grep `Refine doesn't handle parts with holes`)

- [ ] **Step 1: Write the failing tests.**
  - `runJoinery.test.ts`:
    - `a curved project runs`. The client's user message for the rounded-leg fixture lists `mortise-tenon` and not
      `dado` at that site. `notes[0]` is the exact line with `roundover profile` and `is`.
    - `every site left butt by a curve: no call` (call count 0).
  - Refine order: `a joined Refine of a curved project refuses in Refine's words before joineryRefusal`. The message
    starts `Refine doesn't handle parts with curves yet`, and the client is never called.
  - `App.test.tsx`: chunk 1's throw → refusal test reads `FEATURE_CHECK_FAILED`'s exact copy.
  - `curvedRefusal.test.ts`: remove the `'joinery'` cases (a compile error once narrowed).
- [ ] **Step 2: Run and see them fail.**
- [ ] **Step 3: Implement.** Drop the curved `'joinery'` call; narrow `curvedRefusal`; rename and reword the App constant
  and its console line (Global Constraints). Refine's two calls are unchanged.
- [ ] **Step 4: Mutate.** Restore the curved call in `joineryRefusal`: `a curved project runs` goes red. Restore.
- [ ] **Step 5: Run** `npx vitest run src && npm run build`. All PASS.
- [ ] **Step 6: Commit.** `feat(joinery): Add joinery accepts curved and profiled projects`

### Task 6: The oracle

**Files:**
- Test: `src/generate/joints/curvesOracle.test.ts` (new)

**Interfaces:**
- Consumes: `featureAllowed`, `applyJoints`, `defaultChoice`, `curveFaults`, `profileFaults`, `geometryBoard`, the air
  testers (`isAir`, `profileAirTester`, `sweptAirTester`). It must NOT use `JoinWatch`, `featureRegions.ts` or
  `rectOverlapsWaste`. It is independent, by point sampling.

- [ ] **Step 1: Write the oracle.**
  - **Fixtures:** the shaker table and every `recipes.test.ts` fixture that starts with no cuts. Give every part these
    features, keeping only those with no `curveFaults` / `profileFaults` on that part:
    - an end-to-end roundover (1/4") on one long side;
    - a stopped roundover from 1/4 to 3/4 of the length on the opposite side;
    - an arch on a width side, clear of the ends;
    - a rounded corner (1/2") at the length-max end.

    Add an ogee loop on the shaker top.
  - **Run:** chunk 1's two kinds of run over the narrowed sites:
    - defaults everywhere;
    - one run per (site, narrowed kind) at the P1 trial sizes.
  - **Assert,** sampling 7 × 7 × 7 interior points of each box, shrunk by 1e-6:
    1. **No new cut's box contains feature waste**, except in a run-through feature's new wood (sampled in the original
       frame, as the stored part had it).
    2. **No tenon is shaped:** on a grown part, every kept point of the new slab is outside every feature's waste.
       Kept means not inside any of that part's cuts.
    3. **No growing end was entered:** no feature that does not run through `d` has waste on the old end plane. Sample
       points 1e-6 inside the old wood.
    4. **No trimmed slab held waste:** every trimmed slab, sampled on the part before joining, holds no waste of a
       feature that does not run through `d`.
    5. **Features stay put:** every part not in `result.moved` keeps each curve's `localSegments` endpoints and each
       profile's view-span or path endpoints in world space within 1e-9.
    6. **Nothing is lost:** curve and profile ids and counts survive.
    7. **No new faults:** no part gains a `curveFaults` or `profileFaults` fault.
  - **Pin non-vacuity:** across the fixtures, at least one non-butt joint is applied, at least one kind is ruled out by a
    curve and one by a profile, and at least one P7 exemption is exercised.
- [ ] **Step 2: Run it.** PASS. A failure is a real zone gap: fix the code, never the oracle, and record it in the
  commit message.
- [ ] **Step 3: Mutate.** Drop Task 4's exception; then make the watch judge in the current frame. Each must turn an
  assertion red. Restore.
- [ ] **Step 4: Commit.** `test(joinery): oracle: no joint takes wood from a curve or profile`

### Task 7: Records

**Files:**
- Modify: `docs/invariants.md`, `CLAUDE.md`, `docs/module-map.md`, `docs/follow-ups.md`, `docs/rounds.md`, the spec

- [ ] **Step 1: The spec.**
  - Add *Amended (planning, chunk 2)* with P4–P8, and *Amended (execution, chunk 2)* with any rulings made while
    executing.
  - Mark §2's chunk 2 row implemented (merge hash in Task 8).
- [ ] **Step 2: Invariants**, in full in `docs/invariants.md` and condensed in CLAUDE.md. Every PROHIBITION stays
  verbatim.
  - **inv 41:** add `rebaseCurves`/`rebaseProfiles`, their inverse, and `sameCurves`/`sameProfiles`. Add the watch's
    original-frame rule (P5) and the per-face run-through exception (P7).
  - **inv 53** (`docs/invariants.md:518`): "Joinery, Refine and Repair refuse a curved project" becomes "Refine refuses
    a curved or profiled project; joinery rules out only the joint kinds whose zone one enters; Repair accepts them".
    Mirror it in CLAUDE.md's condensed inv 53.
  - **inv 54's** "after holes' and curves'" ordering note: banded is now the only joinery refusal of the three.
- [ ] **Step 3: The rest.**
  - **CLAUDE.md:**
    - the refusals home row (`curvedRefusal.ts (Refine only)`, `featureRegions.ts`);
    - the test count.
    - CLAUDE.md has about 500 bytes left. Move inv 41's long holes sentence to a pointer ("per-site ruling-out:
      `docs/invariants.md`"), keeping the full text there, so the file stays under ~60KB.
  - **`docs/module-map.md`:** `featureRegions.ts`, the new curve and sweep exports, `rebaseCurves`/`rebaseProfiles`.
  - **`docs/follow-ups.md`:** fu 363's first piece is closed (joinery and Repair). Add any record-only items from review.
  - **`docs/rounds.md`:** a row (not yet merged).
- [ ] **Step 4: Commit.** `docs: joinery accepts curves and profiles (chunk 2): invariants 41/53, module map, fu 363`

### Task 8: Live check, merge, deploy

- [ ] **Step 1: Free check on the dev server** (Playwright, which the user can watch; leave the dev profile and its test
  projects in place). Write `docs/browser-verification-joinery-curves.md` with DOM readouts:
  - Import a shaker table joined by test code: arched aprons, legs rounded over on the outer arris, and a rail with a
    through roundover, exported to the scratchpad. In the viewport, confirm the arches and roundovers sit where they
    were and the roundover runs onto the tenoned rail's shoulders. Take one screenshot to `docs/img/`.
  - Import the curved bug fixture: the joinery dialog offers Repair.
- [ ] **Step 2: Paid check, only with the user's approval at the time.** One Add joinery run on the rounded-leg
  shaker table, which has one site expected to lose dado. Record the cost, the notes' line, and the joined result.
- [ ] **Step 3: Merge.** Run `npm run build` and `npx vitest run` on the branch. Then
  `git checkout master && git merge --no-ff joinery-curves`, re-run both, and delete the branch.
- [ ] **Step 4: Deploy when the user says so,** per `DEPLOYMENT.local.md`: bundle hash at the edge and in-network, the
  CSP header, and production `localStorage` checked empty after. Update CLAUDE.md's Status and rollback table (no schema
  change: free), `docs/rounds.md`, the spec's chunk row and memory; commit.
