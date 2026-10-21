# Joinery and Repair accept holes (chunk 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add joinery and Repair joints accept parts with hole rows. Joinery keeps every hole where it is on the wood. At
each site it rules out only the joint kinds that would cut into a hole, before the call. Repair's gate compares holes.

**Architecture:**
- **Re-anchoring.** `rebaseHoles` sits beside `rebaseAngleCuts` in `resize`, and its exact inverse goes in `readJoints`'
  `resizeAt`.
- **Gate.** `sameJoined` gains holes.
- **Zones.** Spec §3.2 asks for each joint kind's zone to be derived from the recipe code. **The plan derives it by
  running the recipe**: `applyJoints` gains an optional `JoinWatch` that reports every pocket it cuts and every resize,
  part by part, before the change. `featureAllowed` runs one trial `applyJoints` per (site, kind) at the kind's
  zone-maximising sizes. It rules a kind out when the trial's watch sees a cut or a resize meet a hole. That is exactly
  "the wood that kind could take", with no second copy of the recipes to drift (*Amended (planning)* P1).
- **Wording.** The person-facing lines live in `document/ruledOutText.ts`.

**Tech Stack:** TypeScript, React, Vitest. `npm test` does NOT typecheck. `npm run build` is the typecheck gate: run it at
the end of every task.

**Spec:** `docs/superpowers/specs/2026-10-21-sloyd-joinery-features-design.md` (approved 2026-10-21). This plan covers
**chunk 1 only**: everything said there for holes, plus the shared machinery (§3.2's zones, §3.5's ruling-out, §5's
gate). Read §1–§5 and §7 before Task 1, and re-read the task's own sections before each task.

## Amended (planning)

Copied into the spec as an *Amended (planning)* block in Task 7.

- **P1: zones by trial.** The §3.2 table becomes one trial `applyJoints` per (site, kind), watched. Sizes per trial:
  - **mortise-tenon:** `tenonLength[1]`.
  - **dado:** `dadoDepth[1]`.
  - **stopped-dado:** once per stop end, at `dadoDepth[1]` and that end's `inset(e)[0]`.
  - **half-lap:** once.
  - **rabbet:** once per unit (every site sharing `enter|axis|side` with rabbet allowed, all rabbeted together), at every
    member's `rabbetDepth[0]` and again at every member's `rabbetDepth[1]`. Depth grows the pocket; the panel's trim
    shrinks as depth grows.

  Every site but the trial's is left butt. Zones are judged before any other joint runs: the spec's stated assumption,
  with the oracle as backstop. A row's "mutation test" is deleting one watch call.
- **P2: gate tolerance, decided without the measurement step.** A hole number goes out as `x' = x + L` and is read back as
  `x' − L`. When `x' > 2L` that subtraction rounds (Sterbenz does not apply), so re-joining need not give back `x'`
  bitwise. Hole numbers are therefore compared within `GATE_TOLERANCE`, as the spec's default said. The same reasoning
  applies to `sameAngleCut`'s exact comparison: this is raised with the user as a new follow-up, not changed here.
- **P3: one part per summary line.** When several parts or kinds rule out kinds at one site, the line names the part of
  the first ruled-out kind in `JOINTS` order. Spec §3.5 asks for one line per site.

## Global Constraints

- **No schema change**; `CURRENT_VERSION` stays 20. `DESIGN_SCHEMA`, Generate and Refine are unchanged. Refine still
  refuses holed projects in its own words.
- **`JOINERY_PROMPT` and `JOINT_SCHEMA` are byte-identical.** Only the user turn's site list (`siteMessage`) changes,
  listing each site's narrowed `allowed`.
- **Byte for byte:** with no hole on any part, `featureAllowed` returns the SAME `sites` array object and no ruled-out
  entries, and every existing joinery, Repair and gate test passes unmodified.
- **Touching:** a conflict is an overlap above `1e-9` on all three axes (spec §3.3, amended). Never `TOUCH`.
- **Ruling-out is decided before any call or mutation** (inv 41). A site left with only `butt` is joined as a butt and is
  NOT sent to the chooser. A run with no open site makes no call.
- **Curves, profiles and bands keep today's refusals and wording** (`curvedRefusal`, `bandedRefusal` with `'joinery'`, and
  `repairDocument`'s withholding of both). That is chunk 2 and 3's work.
- **Exact copy** (spec §3.5): `<Enter> → <Receive>: <kinds> ruled out — <Part>'s holes are in the way.` and
  `<Enter> → <Receive>: left as a butt — <Part>'s holes are in the way of every joint.` Kind words:
  - `mortise-tenon` → `mortise and tenon`
  - `stopped-dado` → `stopped dado`
  - `dado`, `rabbet` and `half-lap` as written

  Several kinds are joined `a`, `a and b`, `a, b and c`.
- Branch `joinery-holes` off `master`; merge with `git merge --no-ff`. No pull request. Never commit a key; never clear
  the dev browser profile.

## Review Focus

The inputs the spec implies but its examples do not exercise, most likely to bite first. Each has a test in its owning
task:

1. **A part that moves during the trial (a rabbet panel, a half-lap).** Its holes move with it, and the watch must judge
   in the part's own frame, never in world space against stale positions. Task 4,
   `a rabbeted back with a hole clear of every rabbet keeps rabbet`.
2. **A hole measured from the end a tenon grows, on a part grown at its MIN end under a turn.** `endFacing` maps the world
   side to the part's end. Task 1's posture/turn sweep.
3. **A rabbet unit where only one member's receiver has a hole.** Every member loses rabbet. Task 4,
   `rabbet goes as a unit`.
4. **Twin placements of one definition, where one copy's site is ruled out and the other's is not** (flat twins share one
   `cuts` array; the trial clones per board). Task 4, `twin placements are judged per placement`.
5. **The dialog estimate when every open site is left butt.** No cost is shown. Task 5,
   `estimate is null when every site is left butt`.

---

### Task 1: `rebaseHoles` and its inverse

**Files:**
- Modify: `src/generate/joints/recipes.ts` (beside `rebaseAngleCuts`, ~186–200; `resize`, ~42–52)
- Modify: `src/generate/joints/unjoin.ts` (`resizeAt`, ~91–98)
- Test: `src/generate/joints/holesRebase.test.ts` (new)

**Interfaces:**
- Produces: `export function rebaseHoles(b: Board, d: Dimension, end: CutFrom, amount: number): void` in `recipes.ts`.
  It mutates `b.holes` by replacing changed rows with new objects; untouched rows keep their identity, like
  `rebaseAngleCuts`.

- [ ] **Step 1: Write the failing tests** in `holesRebase.test.ts`. For each posture × turn (the `turnFixtures.ts`
  poses), with a hole row on a part and `resize(part, k, side, ±a)` driven through `mortiseTenon` (growth) and the rabbet
  trim path (shrink):
  - `a hole measured from the growing end stays put in world space`: the world centre of every hole (through
    `holeInstances` + `worldBox`) is unchanged within 1e-12. Cover `along === d && alongFrom === end` (station) and
    `acrossOf(row) === d && acrossFrom === end` (inset).
  - `a hole measured from the far end is untouched`: the same row object is kept (`toBe`).
  - `resize then resizeAt restores every number within GATE_TOLERANCE`: call the exported `readJoints` on the joined flat
    document and compare its `plain` board's rows to the original.
  - `a metric station round-trips within tolerance`: a station of `127 / 25.4` (5 in, stored unrounded) and a tenon
    `L = 1.25`. Pin `Math.abs(back − x) <= GATE_TOLERANCE`. Also record in the test's comment whether it was bitwise
    equal.

- [ ] **Step 2: Run them and see them fail.**
  Run: `npx vitest run src/generate/joints/holesRebase.test.ts`
  Expected: the stays-put tests FAIL. The holes slide with the end, off by `a`.

- [ ] **Step 3: Implement `rebaseHoles`** and call it in `resize` right after `rebaseAngleCuts`, and in `resizeAt` right
  after its `rebaseAngleCuts` call. The rule (spec §4.1):
  - `station += amount` when `along === d && alongFrom === end`;
  - `inset += amount` when `acrossOf(row) === d && acrossFrom === end`;
  - nothing else changes.

  `face === d` rows are never shifted. Spec §3.4 rules them out before they reach here, and a far-end row is correct
  untouched.

- [ ] **Step 4: Mutate.** Drop the station shift, flip its sign, and test `alongFrom !== end`. Do the same for inset.
  Each must turn a test red. Restore.

- [ ] **Step 5: Run the joints suite and build.**
  Run: `npx vitest run src/generate/joints && npm run build`
  Expected: all PASS, and the build is clean. No existing test changes; nothing in them has holes.

- [ ] **Step 6: Commit.** `feat(joinery): re-anchor holes when joinery grows or trims a part`

### Task 2: The gate compares holes; Repair accepts them

**Files:**
- Modify: `src/generate/joints/unjoin.ts` (`sameJoined`, ~298–311)
- Modify: `src/generate/joints/repair.ts` (`repairDocument`'s `holedParts` guard, ~108)
- Test: `src/generate/joints/unjoin.test.ts`, `src/generate/joints/repair.test.ts`,
  `src/generate/joints/runJoinery.test.ts` (shared shape)

**Interfaces:**
- Consumes: Task 1's `rebaseHoles` (through `resize` and `resizeAt`).
- Produces: `sameHoles(a: readonly HoleRow[], b: readonly HoleRow[]): boolean`, exported from `unjoin.ts`. It compares
  rows in stored order, ids ignored, every `HOLE_FIELDS` field: enumerations exactly, numbers within `GATE_TOLERANCE`, and
  `'through'` only equal to `'through'`. Use `HOLE_FIELDS` (inv 40); do not hand-list the fields.

- [ ] **Step 1: Write the failing tests.**
  - `unjoin.test.ts`, `gateUnjoin passes a joined project with holes`: the shaker table (`shakerTableFixture.ts`) with
    shelf-pin-like rows on its legs, clear of the aprons, joined through `applyJoints` with defaults. The gate is not
    refused.
  - `gateUnjoin refuses when a hole moved after joining`: the same, with one station `+ 1e-3` after joining. Expect
    `{ refused }`.
  - `repair.test.ts`: replace `repairDocument withholds a holed document` with
    `repairDocument repairs a holed bug fixture`. Take the existing damaged fixture, add a hole row to one twin part away
    from its joints, and run `repairDocument`. It returns `{ doc, dropped }`, with `dropped` as without the hole. The hole
    rows in `flatDocument(out.doc)` are `toEqual` the input's.
  - `runJoinery.test.ts`, `two parts on one shape with a hole row: only one tenoned`. Build it beside the existing
    `two linked legs…` fixture (~152–174), with the row on the Shape. Join so only one user gets a tenon. Expect: no
    throw; both parts' hole world centres unchanged; the write-back splits exactly as the same fixture does today with an
    angle cut instead of a hole. Assert the same shape count that fixture asserts.

- [ ] **Step 2: Run and see them fail.**
  Expected: the moved-hole gate test FAILS (it passes today, blind), and the Repair test FAILS (withheld → `null`).

- [ ] **Step 3: Implement** `sameHoles`, and call it in `sameJoined` after the angle-cut clause. Drop `repairDocument`'s
  `holedParts` guard and its import. Leave the `curvedParts` and `bandedParts` guards.

- [ ] **Step 4: Mutate** `sameHoles` (skip numbers; compare exactly instead of within tolerance) and check that the
  metric round-trip from Task 1, run through the gate, goes red under exact comparison. If it does not, note in the
  commit message that the fixture was bitwise exact, and keep tolerance per P2.

- [ ] **Step 5: Run** `npx vitest run src/generate && npm run build`. Expect all PASS.

- [ ] **Step 6: Commit.** `feat(repair): the gate compares holes; Repair accepts holed projects`

### Task 3: `applyJoints` reports what it cuts and resizes

**Files:**
- Modify: `src/generate/joints/recipes.ts` (`applyJoints` ~325, `resize`, `mortiseTenon`, `dado`, `rabbet`, `halfLap`)
- Test: `src/generate/joints/joinWatch.test.ts` (new)

**Interfaces:**
- Produces, exported from `recipes.ts`:
  ```ts
  export interface JoinWatch {
    /** A pocket about to be pushed onto part `part` (a flat-document index), as stored on `board` at that moment. */
    cut(part: number, board: Board, cut: Cut): void;
    /** `board` (part `part`) about to grow (amount > 0) or shrink at `end` of `d`, before anything changes. */
    resize(part: number, board: Board, d: Dimension, end: CutFrom, amount: number): void;
  }
  export function applyJoints(doc: FlatDocument, sites: Site[], choices: JointChoice[], watch?: JoinWatch): JoinResult
  ```
  Part indices come from a `Map<Board, number>` built right after the per-board clone. How the watch reaches each recipe
  (an optional trailing parameter, or on `State`) is the builder's choice. Every `E.cuts.push`/`R.cuts.push` of a new
  pocket and every `resize` call goes through it.

- [ ] **Step 1: Write the failing tests** in `joinWatch.test.ts`. Use one small fixture per recipe (copy the shapes of
  `recipes.test.ts`' own: a rail into a leg, a shelf into a side, a back in a frame with a butting shelf, two crossing
  stretchers):
  - `mortise-tenon reports the entering part's growth, its four shoulder wastes, and the mortise`: assert the events'
    parts and kinds, and that the `resize` event's `amount` equals the tenon length.
  - `stopped-dado reports the notch on the entering part and the shortened pocket`.
  - `rabbet reports each receiver's pocket, the butting part's trim (amount < 0), and the panel's own trims`.
  - `half-lap reports both notches`.
  - `a watched run returns a result identical to an unwatched one`: `toEqual` on the whole `JoinResult` for every fixture
    above, plus the shaker table.

- [ ] **Step 2: Run and see them fail** (`applyJoints` ignores the argument).

- [ ] **Step 3: Implement** the hook. Call `resize` before any mutation, with the end the part's own (`endFacing`), as
  `resize` already computes it. Call `cut` with the `Cut` from `pocketFor`, just before the push.

- [ ] **Step 4: Mutate.** Delete each recipe's `cut` call in turn, then the `resize` call. Each deletion must turn one test
  red. Restore.

- [ ] **Step 5: Run** `npx vitest run src/generate/joints && npm run build`. Expect all PASS.

- [ ] **Step 6: Commit.** `feat(joinery): applyJoints can report the wood each joint takes`

### Task 4: `featureAllowed`, ruling joint kinds out around holes

**Files:**
- Create: `src/generate/joints/featureZones.ts`
- Modify: `src/document/holes.ts` (add `holeRegion`)
- Test: `src/generate/joints/featureZones.test.ts` (new), `src/document/holes.test.ts`

**Interfaces:**
- Consumes: Task 3's `JoinWatch` and `applyJoints`; `rangesOf` (`sites.ts`); `clippedRegion` (`cuts.ts`);
  `holeInstances`.
- Produces:
  ```ts
  // holes.ts: the bore's board-local box, mouth to bottom along `axis`, centre ± radius across.
  export function holeRegion(h: Hole): Region
  // featureZones.ts
  export type FeatureWord = 'holes';            // chunks 2 and 3 widen this
  export interface RuledOut { site: number; kind: Exclude<JointKind, 'butt'>; part: number; feature: FeatureWord }
  export function featureAllowed(flat: FlatDocument, sites: readonly Site[]): { sites: Site[]; ruledOut: RuledOut[] }
  ```
  `sites` comes back in the same order with the same ids, each `allowed` filtered (butt always kept). `ruledOut` has one
  entry per (site, kind), in site order then `JOINTS` order, and each entry names the first conflicting part.

- [ ] **Step 1: Write the failing tests.**
  - `holes.test.ts`, `holeRegion`: a 3/8" bore 1/2" deep from the thickness max face gives the expected spans; a through
    hole spans the whole dimension.
  - `featureZones.test.ts`, one test per spec §3.5 example, asserting each site's `allowed` and `ruledOut`:
    - `holes under a shelf's dado and mortise zone: left as a butt`;
    - `dowel holes at a butt joint: left as a butt` (holes drilled into the rail's end; the growth rule rules out all
      three growing kinds);
    - `leg holes clear of the apron: allowed unchanged`;
    - `3/8 deep from the outer face of 3/4 stock under a 1/2-thick shelf: tenon ruled out, dado kept`. The dado zone
      touches the hole at exactly 3/8 and passes; mutate `> 1e-9` to `>= -1e-9` and see it go red.
    - `a hole touching the mortise zone passes; a 1e-6 overlap is ruled out`;
    - `a hole 'through' along a rail's length rules out its growing kinds`.
  - The Review Focus tests:
    - `a rabbeted back with a hole clear of every rabbet keeps rabbet`;
    - `rabbet goes as a unit`: a back in a three-sided frame, a hole only in the top's rabbet zone; all three sites lose
      rabbet;
    - `a hole in a part the rabbet would trim rules rabbet out at the trimming site`: a shelf butting the back gets a
      hole in its trimmed slab;
    - `half-lap: a hole in the notch rules half-lap out`;
    - `twin placements are judged per placement`: two placements of one definition, a hole on a part of the definition
      lying under one placement's site only. Only that site's kinds are ruled out.
  - `with no holes, the same sites array comes back`: `toBe(sites)`, and `ruledOut` is `[]`. Use the shaker table and every
    `recipes.test.ts` fixture. This pins the byte-for-byte rule.

- [ ] **Step 2: Run and see them fail** (no module).

- [ ] **Step 3: Implement** `holeRegion`, then `featureAllowed`:
  - Return early (same array) when no flat part has a hole row.
  - Run the trials per P1. The watch's `cut` rules the trial's kind out when `clippedRegion(board, cut)` overlaps any
    `holeRegion` of `board`'s holes (from `holeInstances` over `board.holes`, the board as it stands, so already rebased)
    by more than 1e-9 on all three dimensions.
  - The watch's `resize`:
    - when `amount > 0`, rules the kind out when any hole region on `board` touches face `end` of `d`
      (`end === 'min' ? r[d][0] <= 1e-9 : r[d][1] >= board[d] - 1e-9`);
    - when `amount < 0`, rules it out when any hole region overlaps the slab within `−amount` of that end by more than
      1e-9.
  - A rabbet trial's conflict rules rabbet out at every site of its unit.
  - Narrowed sites are new objects; unchanged sites keep their identity.

- [ ] **Step 4: Mutate** the touching comparison (as above), the growth rule (drop it), the trim rule (drop it), and the
  unit spread (rule out only the hit site). Each must turn a test red. Restore.

- [ ] **Step 5: Measure.** Log `featureAllowed`'s time on the shaker table with a hole row on every part, run 20 times. If
  the median is above 100 ms, stop and escalate: the dialog runs it once per document change while open (Task 5). Record
  the median in the commit message.

- [ ] **Step 6: Run** `npx vitest run src && npm run build`. Expect all PASS.

- [ ] **Step 7: Commit.** `feat(joinery): rule out only the joint kinds that would cut into a hole`

### Task 5: Wire it in: refusal, run, prompt, estimate, summary

**Files:**
- Create: `src/document/ruledOutText.ts` (+ `ruledOutText.test.ts`)
- Modify:
  - `src/generate/joints/tapers.ts` (`joineryRefusal`: drop the holed call and import)
  - `src/document/holedRefusal.ts` (narrow `action` to `'refine'`)
  - `src/generate/run.ts` (`runJoinery` ~350–425, `joineryShape`/`joineryEstimateUsd` ~428–446)
  - `src/App.tsx` (~85–107)
- Test: `src/generate/joints/runJoinery.test.ts`, `src/generate/refineBase.test.ts`, `src/document/holedRefusal.test.ts`,
  `src/generate/refine.test.ts` (or wherever Refine's holed refusal is tested today; grep `holedRefusal`)

**Interfaces:**
- Consumes: Task 4's `featureAllowed`, `RuledOut`.
- Produces:
  ```ts
  // ruledOutText.ts (document layer: plain names in, a sentence out; no generate/ import)
  export interface RuledOutLine { enter: string; receive: string; kinds: readonly string[]; butt: boolean; part: string; feature: 'holes' }
  export function ruledOutLine(l: RuledOutLine): string
  ```
  `kinds` are `JointKind` strings; the function maps them to the Global Constraints' words. When `butt` is true, `kinds`
  is ignored.

- [ ] **Step 1: Write the failing tests.**
  - `ruledOutText.test.ts`: both exact sentences from Global Constraints, with one, two and three kinds.
  - `runJoinery.test.ts`:
    - `a holed project runs: the sites sent list narrowed allowed`: spy the client and assert that the user message
      (`siteMessage`) for the §3.5 "tenon ruled out" fixture lists `dado` and not `mortise-tenon`;
    - `every site left butt: no call`: the client is called 0 times, the outcome is built, and every applied joint is
      butt;
    - `the summary lines lead the notes`: the outcome's `notes[0]` is the exact line;
    - `JOINERY_PROMPT and JOINT_SCHEMA are unchanged`: a hash or snapshot taken at `master` before this branch.
  - `refineBase.test.ts`:
    - `estimate counts only sites still sent`: fewer open sites give a smaller `prefix + message` shape;
    - `estimate is null when every site is left butt`.
  - `holedRefusal.test.ts`: remove the `'joinery'` cases. That use is gone, and the narrowed type makes them a compile
    error.
  - Refine order: `a joined Refine of a holed project refuses in Refine's words before joineryRefusal`. Assert the
    message starts `Refine doesn't handle parts with holes yet`, and that the client is never called.

- [ ] **Step 2: Run and see them fail.**

- [ ] **Step 3: Implement.**
  - `joineryRefusal` no longer calls `holedRefusal`.
  - In `runJoinery`, right after `joineryRefusal` passes, replace `sites` with `featureAllowed(flat, sites).sites`.
    Everything downstream (`fixed`, `validChoice`, `defaultChoice`, `merge`, `applyJoints`, `siteMessage`) reads the
    narrowed list.
  - `open` also excludes sites whose `allowed` is `['butt']`; `merge` already makes them butt.
  - Build each summary line with `ruledOutLine`:
    - `butt` is true when the site's narrowed `allowed` is `['butt']`;
    - `part` and `feature` come from P3;
    - names come from `flat.boards`.

    Prepend the lines to `notes` in `build`, so the fallback path carries them too.
  - `joineryShape` uses the narrowed sites, minus butt-only ones, and returns null when none are left.
  - In `App.tsx`, compute the estimate in a `useMemo` keyed on `[llmSettings, doc, joineryRefusal]` instead of in JSX, so
    the trials run once per document change.

- [ ] **Step 4: Mutate.** Leave butt-only sites in `open` (the no-call test goes red). Pass the un-narrowed `sites` to
  `siteMessage` (the narrowed-list test goes red). Restore.

- [ ] **Step 5: Run** `npx vitest run src && npm run build`. Expect all PASS, with `JoineryDialog.test.tsx` unchanged.

- [ ] **Step 6: Commit.** `feat(joinery): Add joinery accepts holed projects, ruling out only blocked joints`

### Task 6: The oracle

**Files:**
- Test: `src/generate/joints/holesOracle.test.ts` (new)

**Interfaces:**
- Consumes: `featureAllowed`, `applyJoints`, `defaultChoice`, `holeFaults`, `holeRegion`, `clippedRegion`. The oracle does
  NOT use `JoinWatch`; it must be independent of Task 4's mechanism.

- [ ] **Step 1: Write the oracle.**
  - **Fixtures:** the shaker table and every `recipes.test.ts` fixture that starts with no cuts. On each, place a
    deterministic hole grid on every part: 1/4" diameter, half the thickness deep, from each thickness face, at stations
    1/5, 1/2 and 4/5 of the length, inset half the width. Also add one 1/4" hole drilled into each part's length-min end,
    3/4" deep.
  - **Run:** `featureAllowed`, then `applyJoints` with `defaultChoice` over the narrowed sites.
  - **Assert:**
    1. no cut on any joined part overlaps any hole region on that part beyond 1e-9 on all three dimensions;
    2. no part gains a `holeFaults` fault it lacked before;
    3. every part not in `result.moved` keeps each hole's world box within 1e-9.

    Pin non-vacuity: across all fixtures, at least one non-butt joint is applied AND at least one kind is ruled out.

- [ ] **Step 2: Run it.** Expected: PASS. A failure is a real zone gap: fix the code (Task 3 or 4), never the oracle, and
  record what it found in the commit message.

- [ ] **Step 3: Mutate.** Delete the watch's growth rule from Task 4. Assertion 1 or 3 must go red. Restore.

- [ ] **Step 4: Commit.** `test(joinery): oracle: no joint takes wood from a hole`

### Task 7: Records

**Files:**
- Modify: `docs/invariants.md`, `CLAUDE.md`, `docs/module-map.md`, `docs/follow-ups.md`, `docs/rounds.md`,
  `docs/superpowers/specs/2026-10-21-sloyd-joinery-features-design.md`

- [ ] **Step 1: The spec.** Add an *Amended (planning)* block with P1–P3, and mark §2's chunk 1 row implemented (merge
  hash filled in Task 8).

- [ ] **Step 2: Invariants, in full in `docs/invariants.md` and condensed in CLAUDE.md.**
  - **inv 41:** "Every refusal is decided before ANY mutation" stays. Add: per-site ruling-out by `featureAllowed` (trials
    watched through `JoinWatch`), decided before the call; `rebaseHoles` re-anchors on resize and `resizeAt` undoes it;
    `sameJoined` compares holes within `GATE_TOLERANCE`.
  - **inv 50:** "Joinery, Refine and Repair refuse holed projects" becomes "Refine refuses holed projects; joinery rules
    out only the joint kinds whose zone a hole enters; Repair accepts them."

  Every PROHIBITION stays verbatim.

- [ ] **Step 3: The rest.**
  - CLAUDE.md: the "refusals of joinery/Refine/Repair" home row gains `featureZones.ts`, and the test count is updated
    (`npx vitest run` total).
  - `docs/module-map.md`: `featureZones.ts`, `ruledOutText.ts`, `holeRegion`, `JoinWatch`.
  - `docs/follow-ups.md`:
    - fu 328's status becomes "closed for joinery and Repair (chunk 1); Refine stays with fu 329";
    - add **fu 413**: `sameAngleCut`'s exact gate comparison can be refused by `(x' − L) + L` rounding (P2's argument);
      record-only until a real refusal shows; ask first.

- [ ] **Step 4: Commit.** `docs: joinery accepts holes (chunk 1): invariants 41/50, module map, fu 328/413`

### Task 8: Live check, merge, deploy

- [ ] **Step 1: Free check on the dev server** (Playwright, which the user can watch; leave the dev profile and its test
  projects in place). Write `docs/browser-verification-joinery-holes.md` with DOM readouts:
  - Import a holed shaker table joined by test code, as an exported JSON written to the scratchpad from a one-off vitest
    run. Confirm in the viewport that the leg holes sit where they were beside the tenons, and take one screenshot to
    `docs/img/`.
  - Import a holed bug fixture: the joinery dialog offers Repair.
- [ ] **Step 2: Paid check, only with the user's approval at the time.** One Add joinery run on a holed project with one
  site expected to lose a kind. Record the cost, the notes' line, and the joined result.
- [ ] **Step 3: Merge.** Run `npm run build` and `npx vitest run` on the branch, then
  `git checkout master && git merge --no-ff joinery-holes`. Re-run both on the merged tree, then delete the branch.
- [ ] **Step 4: Deploy when the user says so,** per `DEPLOYMENT.local.md`. Verify by bundle hash at the edge and
  in-network, plus the CSP header. Clear `localStorage` in the verifying browser on PRODUCTION only, and check it. Update
  CLAUDE.md's Status and rollback table (no schema change: the rollback is free) and `docs/rounds.md`, then commit.
