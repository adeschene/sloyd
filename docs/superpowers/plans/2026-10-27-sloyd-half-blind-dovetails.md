# Half-blind dovetails (dovetails chunk 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dovetail the corners can make a HALF-BLIND corner. The pin part (a drawer front) keeps a solid `lap` in front of
its sockets, and the tail part's end stops at the lap plane. This is stored as `Dovetail.lap` (schema 27) and read by the
geometry, checks, cut list, bench drawings and panel.

**Architecture:**
- **One new optional field, `Dovetail.lap`, on BOTH entries of a half-blind corner.** Only the pins entry's geometry and
  fault read it. A through entry has no key.
- **Geometry stays on the view-curve route** (dovetails SD1). The pins' tail-socket outline in (J, thickness) runs from the
  LAP PLANE to the inside face instead of from face to face. Task 1 proves this before anything else is built on it.
- **`cornerPlan.ts` gains ONE optional `JointKind.inset` hook.** It is called per corner end before any end moves, and moves
  that end's `far` (and with it `size` and `depth`) `inset` back into the other part. Box joints do not implement it.
- **`dovetails.ts` gains one corner-style function**, `dovetailCornerStyle`: which side takes the tails, and the lap or
  null. Both `inset` and `planCorner` call it, so both read the same answer.

**Tech Stack:** TypeScript, React, Zustand, Vitest (`npx vitest run <file>`), `npm run build` (the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-27-sloyd-half-blind-dovetails-design.md` (APPROVED 2026-10-27). Read it first.
It wins over this plan, and any difference is reported. Background: `2026-10-27-sloyd-dovetails-design.md` (§3 and its
*Amended (build)* SD1–SD20) and inv 62 in `docs/invariants.md`. Work on branch `half-blind` (from `master`), and merge
locally with `--no-ff` (no PRs).

## Global Constraints

- **Schema 27.** `CURRENT_VERSION = 27` (`document.ts:234`). No upgrade step (absent `lap` means through). A
  through-dovetailed document and a dovetail-free one are byte for byte as before. **Never write a `lap` key on a through
  entry: not `0`, not `undefined`.** Every existing test passes UNCHANGED except tests asserting the version number (list each
  edited one in the task report).
- `Dovetail` gains `lap?: number`: inches, > 0. It is present on BOTH entries of a half-blind corner (the same value) and
  absent on a through one. It sits after `outside` in the interface and in `DOVETAIL_FIELDS`.
- **Mirrors:** `lap` flips under nothing. `mirrorOne` is unchanged.
- **Angled extent `X`:** tails `X = d.depth` (unchanged; on a half-blind corner `depth = tP − lap`); pins
  `X = b.thickness − (d.lap ?? 0)`.
- **Fault order:** `count`, `slope`, `lap`, `depth`, `narrow`. `lap` applies only to a PINS entry with a `lap`, when
  `!(lap > 1e-9 && lap < b.thickness − 1e-9)`. A tails entry's `lap` never faults.
- **Auto lap:** `autoLap(t: number, units: Units)` = `max(min, round(t / 3 / step) · step)`, with `step` = 1/16 and
  `min` = 1/8 imperial, and `step` = 1/25.4 and `min` = 3/25.4 metric. A typed lap is stored exactly.
- **The joint option:** `joint: 'keep' | 'through' | 'half-blind'`, default `'keep'`.
  - `keep`: a corner already dovetailed (one tails end, one pins end) keeps its kind. The PINS entry's `lap` decides
    (present means half-blind). A new corner is through.
  - **The lap of a half-blind corner:**
    - a typed `lap` (not null) is used as typed;
    - else a re-plan whose pins PART is unchanged keeps the stored pins `lap`;
    - else `autoLap(P.thickness)`.
  - A lap ≥ `P.thickness − 1e-9` refuses with the lap sentence, before any end moves.
- **The run-out:** a tails end with inset `L` gets `far' = e.far − e.side·L`, `size` computed from `far'` exactly as now,
  and `depth = e.depth − L`.
- **Copy** (home `dovetailText.ts`; lengths through `formatLength`, the bench through `formatLengthBare`; copy review owed):
  - Cut list, tails: `Half-blind dovetails — <N> <tail|tails>, 1:<s>, pins <p> at the narrow end, <depth> deep, at the <dim> <end> end; this part has the tails, each <Te> wide at the end.`
  - Cut list, pins: `Half-blind dovetails — <N> <tail|tails>, 1:<s>, pins <p> at the narrow end, <depth> deep, at the <dim> <end> end; this part has the pins, their narrow ends <lap> in from its thickness <outside> face (the lap).`
  - A through line is byte for byte as now.
  - Lap refusal (planner): `<part> is too thin for a <lap> lap.`
  - Lap field parse error: `A lap must be a length more than 0.`
  - Fault reason: `the lap isn't inside the part's thickness` (in `This dovetail no longer fits: <reason>.`).
  - Success, one shared layout: `Dovetailed <n> <corner|corners>, half-blind: <N> <tail|tails>, 1:<s>, <lap> lap.`
  - Success, per corner: `<A> and <B>: <N> <tail|tails>, 1:<s>, half-blind, <lap> lap.`
  - A through corner's success lines are byte for byte as now. A mix of kinds uses the per-corner form.
  - Panel: select label `Joint`, options `As they are` / `Through` / `Half-blind`; field `Lap`, placeholder `Auto`.
  - Bench: figure B label `lap <x>`.
- Every refusal is decided before any mutation. One undo entry per action. Refused while exploded (inv 47) or gesturing.
- **Dev server:** no `localStorage.clear()`; test projects stay. No paid runs are needed.
- **Another `claude --continue` session (from Oct 26) runs in this repo.** Before each commit, check that `git status`
  shows only this task's files.

## Review Focus

1. **Re-running with only a new slope on a half-blind drawer** (`As they are`, Lap blank) keeps every corner half-blind with
   its lap, and the sides do not move (Task 3).
2. **A metric project:** an 18 mm front gets a 6 mm Auto lap, and the lines and bench print mm (Tasks 3, 6).
3. **A real drawer:** a half-blind front and a through back, with the sides linked mirror twins. The sides stay one cut-list
   row with two benches (one per kind: the `layoutKey` fix), and the check is clean (Tasks 5, 6).
4. **Swap on a half-blind corner whose side is thinner than the stored lap:** the lap is re-chosen by Auto for the new pins
   part; a typed lap that does not fit refuses with the lap sentence, never `… is too short for its dovetails.` (Task 3).
5. **Undo after a half-blind run** restores both parts' sizes and positions exactly; **Redo** re-applies it (Task 4).

---

### Task 1: The proof — half-blind pins geometry (spec §3.4, the risk first)

**Files:**
- Modify: `src/document/types.ts` (`Dovetail.lap?`), `src/document/dovetailModel.ts` (`DOVETAIL_FIELDS.lap`; `dovetailValues`
  omits an absent `lap`), `src/document/dovetails.ts` (`dovetailFaults`, `dovetailViewCurves`, `dovetailCorners`),
  `src/document/dovetailFixtures.ts` (a half-blind corner builder)
- Test: `src/document/dovetailGeometry.test.ts` (new `describe` blocks), `src/document/dovetails.test.ts`

**Interfaces:**
- Produces:
  - `type DovetailFault = 'count' | 'slope' | 'lap' | 'depth' | 'narrow'`.
  - `dovetailFaults(b, d)`: the order and `X` per Global Constraints.
  - `dovetailViewCurves(b, d)`, pins with a `lap`: with `vo` the outside face's coordinate and `vi` the other face's, the lap
    plane is `vl = vo + (vi > vo ? lap : −lap)`; `w = (b.thickness − lap) / d.slope`; the outline is
    `[[a, vl], [c, vl], [c − w, vi], [a + w, vi]]`. Same span and ids as through.
  - `dovetailCorners(b, d)`, pins with a `lap`: the points sit at `vl`, not `vo`.
  - `halfBlindCorner(...)` in `dovetailFixtures.ts`: as the through builder, with a `lap` argument. The tails part's end sits
    at the lap plane, `depth = tP − lap`, and both entries carry `lap`.

- [ ] **Step 1: Failing tests:**
  - **Partition with a lap:** for `(H, N, s) ∈ {(6,4,8), (4,3,6), (3,1,8), (152/25.4,4,7)}` × `lap ∈ {0.25, 3/16, 6/25.4}` ×
    roles swapped × a 90° turned tail part × the width-run corner (`widthCorner`'s twin), using `expectPartition` over the
    tails part's world box within the pins part:
    - total volume equals the box's volume (1e-9 relative);
    - no pair overlaps;
    - the lap slab (the pins part's box from the outside face to the lap plane, over the corner's J span and run depth) is
      the PINS part's wood to its full volume.
  - **Mutate:** (a) `vl` shifted 1e-6 toward `vi`; (b) `w` computed from `b.thickness` (through's). Each must fail.
  - `boardBodies` of a half-blind pins part are convex. The mesh is watertight (the `curvesWatertight` check). Section caps
    through the joint zone on each axis total the bodies' cross-section (1e-9), and none lies in a socket.
  - Edges: no edge segment lies on the outside face inside the corner's J span except the part's own outline (the lap is
    unbroken).
  - Snap points: none on the outside face's plane within the joint zone; each pins corner has thickness coordinate `vl`.
  - Faults: on a pins part `t = 0.75`, `lap` 0 → `['lap', …]`; `1e-9` → `lap`; `0.75` → `lap`; `0.25` → no `lap` fault.
    `narrow` is judged on `t − lap`: a corner `(H=3, N=2, s=6, p=0.25)` that faults `narrow` as through (`t = 0.75`) passes
    with `lap = 0.25`. Mutate `X` back to `b.thickness`: that test fails. A tails entry with `lap: 5` does not fault `lap`.
  - Identity: `dovetailValues` of a through entry is exactly the string it was before (compute it from a literal and
    compare). Every existing test in `dovetailGeometry.test.ts`, `dovetails.test.ts`, `cutlist.dovetails.test.ts` and
    `dovetailBench.test.ts` passes unchanged.
- [ ] **Step 2: Run** `npx vitest run src/document/dovetailGeometry.test.ts src/document/dovetails.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** **If the partition, watertight or caps test fails because the view curve does not build**
  (rather than a numeric slip), apply the spec's fallback: the lap-slab split as two convex bodies through the same path. If
  that also fails, STOP and report; write no body code of its own.
- [ ] **Step 4: Run** `npx vitest run src/document src/viewport` and `npm run build`. Expected: PASS. Then the perf guards,
  quiet: `npx vitest run -t perf`.
- [ ] **Step 5: Commit** `feat(half-blind): the stopped pin sockets build (view curves to the lap plane)`.

### Task 2: Schema 27 and the loader

**Files:**
- Modify: `src/document/document.ts` (`CURRENT_VERSION = 27`; a v27 doc comment beside v26's at :224 arguing §8's harm;
  `validateDovetails` reads `lap`), `docs/versioning.md` (the v27 row)
- Test: `src/document/document.v27.test.ts` (new), and the version assertions that must change

**Interfaces:**
- Produces: `validateDovetails`. When the raw `lap` is present, it must be finite and > 0, else the ENTRY is dropped (the
  part kept). A valid `lap` is copied onto the rebuilt entry; an absent one adds no key.

- [ ] **Step 1: Failing tests:**
  - A v26 document with through dovetails loads `toEqual` its v26 self (no `lap` key anywhere).
  - A v27 part keeps a half-blind pair with `lap: 0.25`.
  - These each DROP the entry and keep the part: `lap: 0`, `lap: -1`, `lap: NaN`, `lap: '0.25'`.
  - A well-formed faulted `lap: 2` on a 0.75 pins part is KEPT, and `dovetailFaults` lists `lap`.
  - A version 28 document is refused (the existing newer-version path).
  - A link round-trip (`linkBoards`) keeps `lap` on the Shape.
  - Duplicate keeps `lap` with fresh ids.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` (full) and `npm run build`. Expected: all PASS; only version-number assertions edited.
- [ ] **Step 5: Commit** `feat(half-blind): schema 27 — Dovetail.lap`.

### Task 3: The planner — inset, corner style, lap (spec §3.1, §3.2, §4)

**Files:**
- Modify: `src/document/cornerPlan.ts` (`JointKind.inset?`; step 4 builds the `EndOp` with the inset), `src/document/dovetails.ts`
  (`DovetailOptions`, `dovetailCornerStyle`, `autoLap`, the kind's `inset`/`planCorner`/`addAt`/`signature`),
  `src/document/dovetailText.ts` (the lap sentence; the success lines take the kind and lap)
- Test: `src/document/dovetailPlan.test.ts` (new `describe('half-blind …')` blocks), `src/document/boxJoints.test.ts` (unchanged; run it)

**Interfaces:**
- Consumes: Task 1's `lap` field and faults.
- Produces:
  - In `cornerPlan.ts`:
    `JointKind.inset?(c: Corner, side: 0 | 1, doc: SloydDocument, nameOf: (b: Board) => string): number | string`.
    - It is called for every corner end after step 3's refusals and before step 4.
    - A string refuses.
    - A number `L > 0` builds that end's `EndOp` with `far = e.far − e.side·L`, the size from that `far`, and
      `depth = e.depth − L`.
    - Absent, or 0, leaves `EndOp` exactly as now.
  - `interface DovetailOptions { slope: number; count: number | null; swap: boolean; joint?: 'keep' | 'through' | 'half-blind'; lap?: number | null }`.
    Absent `joint` means `'keep'`; absent `lap` means null. Existing callers compile unchanged.
  - `autoLap(t: number, units: Units): number` (Global Constraints).
  - `dovetailCornerStyle(c: Corner, doc: SloydDocument, opts: DovetailOptions, nameOf): { tails: 0 | 1; lap: number | null } | string`.
    - It reads the corner's ORIGINAL parts (`CornerEnd.part`).
    - `tails` follows today's rule (re-plan current side, else `RUN_RANK`, then Swap), moved here from `planCorner`.
    - `lap` follows Global Constraints' lap rules. "Pins part unchanged" means the re-plan's current pins end is the new
      pins end.
    - `lap ≥ P.thickness − 1e-9` returns the lap sentence naming P.
  - The kind:
    - `inset` returns the style's `lap` for the TAILS side, else 0.
    - `planCorner` takes `tails` from the style (one source) and builds its `narrow` probe's pins trial WITH `lap`.
    - `addAt` writes `lap` on both entries only when non-null.
    - `signature` appends `lap ?? null`.
  - `dovetailedLines(layouts: { count; slope; lap: number | null }[], names, units)`: a through-only result is byte for byte
    as now.

- [ ] **Step 1: Failing tests** (`dovetailPlan.test.ts`, on the existing drawer fixtures with the front 0.75 thick and the
  sides 0.5):
  - `joint: 'half-blind'` on front + sides:
    - the sides' front ends land exactly on the lap plane (`front's outside face ∓ 0.25`), for the min-side AND the max-side
      end (the front at either end of the run), and across a 90° turned side;
    - the sides' `depth === 0.5`, the front's `depth === 0.5`, and both entries have `lap === 0.25`;
    - `expectPartition` holds on the planned parts.
  - **Mutate:** in `cornerPlan.ts` apply the inset to `size` only (leave `far`). The min-side test must fail.
  - Auto lap: a 0.75 front gives `0.25`; 0.625 gives `0.1875`; 0.875 gives `0.3125`; metric 18 mm gives 6 mm; a typed
    `lap: 0.3` is stored exactly.
  - `keep` on a half-blind drawer with only `slope: 6`: still half-blind, the same lap, the sides' sizes unchanged (Review
    Focus 1). `keep` on new corners: through, byte for byte the same plan as with no `joint`.
  - `through` on a half-blind drawer: the sides lengthen by exactly `0.25`, and no `lap` key is left on any entry.
  - Swap on a half-blind corner: the lap is re-chosen by Auto from the new pins part (a 0.5 side gives `0.1875`, since
    `0.5/3 = 0.1667` rounds to 3/16). A typed `lap: 0.6` with Swap refuses with the lap sentence naming the side, the lap through
    `formatLength(0.6, units)` (Review Focus 4), never the too-short sentence. The document is unchanged.
  - Linked mirror-twin sides (the existing linked fixture) with half-blind: succeed, and the Shape carries `lap`.
  - Disagreeing ends under `keep` (spec §8): a hand-made corner whose tails entry has no `lap` and whose pins entry has
    `lap: 0.25` re-plans half-blind with `0.25`. The reverse (only the tails entry has a `lap`) re-plans through.
  - Box joints: `npx vitest run src/document/boxJoints.test.ts src/store/store.boxJoints.test.ts` passes with no test edited.
  - Success notes: `Dovetailed 2 corners, half-blind: 4 tails, 1:8, 1/4" lap.`; a through run's notes are unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the refusal order documented in `planCorners`' and `dovetailPlan`'s doc comments (the
  inset refusal sits between step 3 and step 4).
- [ ] **Step 4: Run** `npx vitest run src/document` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(half-blind): the planner — the tails end stops at the lap plane`.

### Task 4: Store and panel (spec §4)

**Files:**
- Modify: `src/store/store.ts` (`dovetailCorners(ids, slope, count, swap, joint = 'keep', lap = null)`),
  `src/panels/Dovetails.tsx` (`DovetailsSection`: the Joint select and the Lap field), `src/document/dovetailText.ts` (panel words)
- Test: `src/store/store.dovetailCorners.test.ts`, `src/panels/Dovetails.test.tsx`

**Interfaces:**
- Consumes: Task 3's `DovetailOptions`.
- Produces:
  - The select. Its value is `'keep'` by default and is passed to the store.
  - A `LapField`, as `TailsField`: blank is Auto (null), a length through the document's units, the parse error per Global
    Constraints, disabled when `joint === 'through'`.
  - Any change to either control clears the notes and the alert, as the other fields do.

- [ ] **Step 1: Failing tests:**
  - Store: a half-blind run is ONE undo entry. Undo restores every part's `position`, sizes and `dovetails` `toEqual` the
    before-state; Redo re-applies it (Review Focus 5). Refused while exploded.
  - Panel (Testing Library): the section shows `Joint` with the three options and `Lap` with placeholder `Auto`. Choosing
    `Through` disables Lap. Typing `0` shows the parse error and disables the button. A half-blind run shows the success
    note.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/store src/panels` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(half-blind): the Joint select and the Lap field`.

### Task 5: The design check (spec §3.4, inv 38)

**Files:**
- Modify: `src/document/designCheck.ts` (`dovetailContacts`: one extra box per pins dovetail with a `lap`, the lap slab:
  `{ [dim]: run, thickness: [outside face … lap plane] }`, full J)
- Test: `src/document/designCheck.dovetails.test.ts`

- [ ] **Step 1: Failing tests:**
  - A drawer on the floor with a half-blind front, a through back and the sides as tails passes: no overlap, nothing
    unsupported.
  - The carcass fixture with a half-blind top passes too. **If it comes back unsupported, STOP and report** (spec §10; an
    inv 39 question for the user).
  - The lap slab box is present in `contactRegions` for a half-blind pins part and absent for a through one. Mutate by
    dropping the slab box: name the test that then fails, or report that none does (then the box is not load-bearing; say
    so).
  - A faulted half-blind front (`lap` ≥ thickness) checks as its plain twin.
  - The existing through tests pass unchanged.
- [ ] **Step 2: Run.** Expected: FAIL (or report which pass already, and why).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/document/designCheck*` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(half-blind): the checks read the lap`.

### Task 6: Cut list lines and the bench drawings (spec §5)

**Files:**
- Modify: `src/document/dovetailText.ts` (`dovetailLine` branches on `d.lap`; the bench `lap` label),
  `src/document/dovetailBench.ts` (`layoutKey` gains `lap`; figure B per below; `BenchLabelKind` gains `'lap'`),
  `src/panels/DovetailBench.tsx` (draws the lap band and places the `lap` label)
- Test: `src/document/dovetailLine.test.ts`, `src/document/dovetailBench.test.ts`, `src/document/cutlist.dovetails.test.ts`

**Interfaces:**
- Produces: `BenchFigure.lap?: number` (figure B only, half-blind).
  - Figure B, half-blind: `height = depth + lap` (`tP`).
  - The lap band is `[0, lap]` from the outside face.
  - The sockets run from `y = lap` to `y = tP`, narrowing by `(tP − lap)/s` each side.
  - The chain runs at `y = lap`.
  - The labels are `outside face`, `inside face`, the overall and `lap <x>`.
  - Figure A is unchanged.

- [ ] **Step 1: Failing tests:**
  - The two half-blind lines exactly (Global Constraints) for the 6", 4 tails, 1:8 drawer: front 0.75, sides 0.5, lap 1/4".
  - The through lines are unchanged.
  - Metric: an 18 mm front's line prints `6 mm` lap (Review Focus 2).
  - A side with a half-blind front end and a through back end (back 0.5 thick) has TWO benches (`layoutKey`). Its figure B
    heights are `0.75` for the half-blind bench (`0.5 + 0.25`) and `0.5` for the through bench (its own depth).
  - The linked mirror-twin sides are one cut-list row.
  - The bench's `lap` label text equals `formatLengthBare(lap)`, and the chain at the lap plane equals the cut-list line's
    numbers.
  - The label-collision harness passes for the half-blind figure B.
  - Every through bench's existing assertions pass unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/document src/panels` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(half-blind): the cut-list lines and the bench's lap`.

### Task 7: Joinery, Refine, Repair pinned on a half-blind drawer (spec §7)

**Files:**
- Test only, unless a test fails: `src/document/leanKeep.dovetails.test.ts`, the Refine/joinery dovetail tests beside it
  (grep `cornerJointed` and `changedDovetailed` for their homes)

- [ ] **Step 1: Write tests:**
  - Joinery on a cabinet containing a half-blind drawer leaves the front and sides' sizes and places alone, with the
    dovetail reason.
  - Refine keeps every half-blind dovetail exactly (`toEqual`, `lap` included).
  - Repair never changes a half-blind part.
  - Mutate `cornerJointed` to ignore entries with a `lap`: the tests must fail.
- [ ] **Step 2: Run** them. Expected: PASS (if any fails, fix the code, not the test, and report it).
- [ ] **Step 3: Commit** `test(half-blind): joinery, Refine and Repair leave a half-blind drawer alone`.

### Task 8: Records

**Files:** `docs/invariants.md` (inv 62: `lap`, the inset hook, `X = tP − lap`, the fault order), `CLAUDE.md` (inv 62
condensed; Versioning's `CURRENT_VERSION`; the Status block after the deploy), `docs/module-map.md`, `docs/versioning.md`
(from Task 2), `docs/follow-ups.md`, `docs/feature-gaps.md`, `docs/rounds.md`, `docs/history.md`, and the spec's *Amended
(build)* block.

**Follow-ups:**
- fu 497 closes for the joint itself; its heights half moves to fu 485.
- fu 485 is re-worded to cover box joints and both dovetail kinds.
- New entries: rabbeted (lipped) and overlay fronts; a third bench figure if wanted; the half-blind copy review (owed to the
  user).

- [ ] **Step 1: Write them.** Every PROHIBITION verbatim in both places. CLAUDE.md stays under ~60KB.
- [ ] **Step 2: Run** `npx vitest run` (full, quiet machine) and `npm run build`, and record the test count in CLAUDE.md.
- [ ] **Step 3: Commit** `docs(half-blind): invariant 62, versioning, module map, follow-ups`.

### Task 9: Browser verification (dev server, Playwright; the user can watch)

**File:** `docs/browser-verification-half-blind.md`

- [ ] **Step 1: Build a drawer** (front 3/4", sides 1/2", back 1/2"). Dovetail the front and sides with `Half-blind`, and
  the back and sides with `Through`.
- [ ] **Step 2: Read back** the parts' dovetails, sizes and positions from the store (a DOM or store readout), the design
  check, and the cut-list lines.
- [ ] **Step 3: Look:**
  - the front shows no socket on its face (screenshot from the Front view);
  - the sockets show in a section cut through the corner;
  - the bench pair shows the lap band;
  - the Plans sheet draws the joint.
  Record each finding with a DOM readout, and add an image where the finding is spatial.
- [ ] **Step 4: Re-run** with `As they are` and slope 1:6. It stays half-blind.
- [ ] **Step 5:** Leave the test project in place (dev profile rule). Commit the record:
  `docs(half-blind): browser verification`.
