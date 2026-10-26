# Square-set legs and compound level cuts (splayed legs chunk 2c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A splayed leg may be set square to the stool's sides (tilted, never turned about its axis). Level the ends then
writes a compound end miter (sloping across both cross dimensions), and every angle-cut reader handles it correctly or
refuses it.

**Architecture:**
- **Schema 25**: `Lean.square?: true` and `AngleCut.across?: { rise; from }`. The across term is valid only on an end miter,
  anchored at the through dimension's centre.
- **`angleCuts.ts`** stays the ONE home of angle-cut geometry. `keptHalfSpace` gains the across term, and the new
  `depthAtCross` is the full depth that every corner or disc reader calls.
- **`lean.ts`**: `leanMap` returns `m = T` for a square-set lean.
- **`levelEnds.ts`**: writes the compound cut.
- The rest is reader fixes from the spec's survey (§9), plus one new refusal step (`compoundRefusal`) and a Lean panel
  select.

**Tech Stack:** TypeScript, React, Zustand, Vitest (`npx vitest run <file>`), `npm run build` (the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-25-sloyd-square-set-legs-design.md` (APPROVED 2026-10-26). Read it first,
including its §9 survey. Where this plan and the spec differ, the spec wins and the difference is reported.

## Global Constraints

- **A project saved before this round is byte for byte as before.** That means:
  - no `square` key and no `across` key appear unless written by this round's paths;
  - every identity test passes unchanged (`bodyMeshIdentity`, `drawingIdentity`, `diagramIdentity`, `sweptIdentity`,
    `bandFreeIdentity`, `hardwareFreeIdentity`, `mirrorFreeIdentity`), as does every existing test except the few the
    spec's default change names (report each one changed, with why).
- **Stored forms:**
  - `Lean = { x; z; face; square?: true }`. `square` is present only as `true`.
  - `AngleCut.across?: { rise: number; from: CutFrom }`, legal only when `kind === 'miter' && face === 'length'`, with
    `rise > 0` and finite.
  - Depth at station `s` (from `alongFrom`) and cross position `t` (from `across.from`, along `throughOf(c)` of size `T`) is
    `depthAt(c, s) + rise · (t − T/2)`.
  - Anything else is malformed: the CUT is dropped on load (inv 11). A `square` other than `true` is dropped from the lean.
- `CURRENT_VERSION` 25. The 24 → 25 step changes nothing (absent fields default). A schema-24 build refuses a 25 file.
- Mirrors flip flags only (inv 44). Along the through dimension, flip `across.from`; the exact inverse reuses the stored
  object.
- **`leanMap`:**
  - square-set gives `m = T`;
  - turned gives `T · Ry(τ)`, unchanged byte for byte.
- **`setLean`:**
  - A part that does not lean yet gets `square: true`; a leaning part keeps its setting.
  - The face-flip refusal (`LEAN_TURNS_HOLES`) applies only to a turned lean.
  - The no-op test compares `square`.
- **Level the ends on a square-set leg** writes ONE miter per end:
  - `along` is the dimension with the larger slope (ties: width);
  - `points` is its single-slope line through the end's centre;
  - `across` carries the rest.
  - The floor-normal throw applies only to turned leans. `sameLevelLine` compares `across`.
- **Copy (verbatim):**
  - bench line: `Compound miter at the length <min|max> end: <a>° across the <along>, <b>° across the <through>` (degrees
    to one decimal place, as the existing miter words print them);
  - Set select label `Set`, options `Square to the sides` / `Turned to the lean (one-cut ends)`;
  - Set refusal: `Changing how this leg is set would turn it about its length and move its holes — remove the holes first.`
  - joinery: `Add joinery can't join a part with a compound end cut yet: <name>.`
  - Repair: `Repair can't join a part with a compound end cut yet: <name>.`
  - joined Refine: `Refine can't keep joints with a part with a compound end cut yet: <name>.`
- **Refusal order** wherever `tenonRefusal` is called: lean, tenon, compound, then angle cuts. Each refuses the whole run
  and names the first such part.
- Layer order (CLAUDE.md): `document` imports nothing from `store`, `generate`, `panels` or `viewport`.
- Every refusal is decided before any mutation. Each action is one undo entry.
- On the dev server, never run `localStorage.clear()`, and leave test projects in place.

## Review Focus

1. **A compound cut that bites only at an across corner.** Each along end alone reads zero depth.
   `angleCutRemovesNothing` must say it removes stock, the cut list must list it, and the bench line must print it
   (Tasks 2, 5).
2. **A mirrored square-set stool.** Front left is Front right's mirror. Its compound feet are flag-flipped, and both stand
   level on the floor: every foot corner at y = 0 to 1e-9 (Task 4).
3. **A round tenon on a compound tip.** It seats only when the true disc minimum `centre − r·hypot(k, rise)` is within the
   socket bottom. A tenon seated by ±r probes alone must NOT pass (Task 2).
4. **Clear lean on a levelled square-set leg.** The compound cuts stay. The Angles row shows the bench line and Remove.
   Joinery refuses, and Refine keeps the part (Tasks 5, 6).
5. **A rake-only square-set lean** has τ = 0. The Set change on a holed part is allowed, and the map is identical to
   turned (Task 3).

---

### Task 1: Schema 25 and the stored forms

**Files:** `src/document/types.ts`, `document.ts` (validation, `CURRENT_VERSION`, the step), `angleCuts.ts`
(`ANGLE_CUT_FIELDS`, `angleCutValues` flattening `across`, `copyAngleCut`, `mirrorAngleCut`), `treeEdit.ts`
(`lowerAngleCuts`, the lean lowering), `lean.ts` (`leanFlip`), `links.ts` (`sameShared` compares `square`),
`docs/versioning.md`. Tests beside each.

- [ ] **Step 1: Failing tests.**
  - A v24 file loads unchanged and saves as v25 with no new keys.
  - A v25 file round-trips `square` and `across` exactly.
  - A malformed `across` drops the cut in each of these cases: `rise` 0, negative or NaN; a bad `from`; `across` on a bevel;
    `across` on a miter whose `face` is not `length`.
  - `square: false` is dropped from the lean.
  - A v26 file is refused.
  - `sameAngleCut` tells apart two cuts that differ only in `across.rise`, and in `across.from`.
  - `copyAngleCut(c).across !== c.across`.
  - Mirroring along the through dimension flips `across.from`; mirroring twice is `toEqual` the original. The lowering
    inverse reuses the stored object.
  - `leanFlip` keeps `square`.
  - Two links that differ only in `square` are not `sameShared`.
- [ ] **Step 2–4:** FAIL, implement, then run `npx vitest run src/document` until it PASSES.
- [ ] **Step 5: Commit** `feat(square-legs): schema 25 — square-set leans and the across slope`.

### Task 2: Geometry readers

**Files:** `src/document/angleCuts.ts` (`keptHalfSpace`, the new
`depthAtCross(c: AngleCut, b: Pick<Board, Dimension>, s: number, t: number): number`, `angleCutRemovesNothing`,
`touchedRegion`), `featureKeys.ts` (`overruns`), `tenonJoints.ts` (`tipFarthest`), `roundTenons.ts` (`deepestDepth`).
Tests beside each, plus `curvesWatertight` / `bodyMeshIdentity` unchanged.

- [ ] **Step 1: Failing tests** (a hand-built compound end miter on a 1.5 × 1.5 × 16 part):
  - the corner depths equal `depthAtCross` at the four corners;
  - `keptHalfSpace`'s plane contains those four points to 1e-9;
  - `boardBodies` volume equals the analytic volume to 1e-9;
  - Review Focus 1: a cut biting at one across corner only is not "removes nothing";
  - `touchedRegion` contains every point of the cut plane inside the part;
  - Review Focus 3, both halves;
  - a single-slope cut's results are unchanged (`toEqual` the pre-change values for each touched function).
- [ ] **Step 2–4:** FAIL, implement, PASS. Then run `npx vitest run src/document src/viewport`.
- [ ] **Step 5: Commit** `feat(square-legs): angle-cut geometry reads the across slope`.

### Task 3: The square-set map and `setLean`

**Files:** `src/document/lean.ts` (`leanMap`), `src/store/store.ts` (`setLean`: the default, the face-flip gate, the Set
change with its refusal, the no-op compare), the viewport memo keys that read the lean (`section.ts` geo key,
`BoardMesh.tsx` keys). Tests: `lean.test.ts`, `store.test.ts`.

**Interfaces:**
- The store gains a Set change through the existing `setLean`, by passing `square: boolean` in its patch, or as a new
  `setLeanSet(id, square)`. It is the builder's call; report which. It is one undo entry and is refused on a holed part
  when τ ≠ 0, with the Set sentence. It writes the Shape once for a shaped part (inv 45).

- [ ] **Step 1: Failing tests:**
  - `leanMap` for square-set equals `T` (orthonormal, det +1, takes down onto the slopes);
  - the faces' plan twist is −0.83° / +0.82° at rake 8°, splay 12°, to 0.01°;
  - mirror conjugation `S·m·S` holds for square-set;
  - turned is unchanged (`toEqual` a captured literal);
  - first lean via the store writes `square: true`; a rake edit keeps it;
  - a Set change on a holed 8°/12° leg is refused verbatim and changes nothing; Review Focus 5 is allowed;
  - a rake → 0 edit on a holed square-set leg is allowed (no turn);
  - update store.test.ts:3743-style `toEqual` assertions the default changes, and list each in the report.
- [ ] **Step 2–4:** FAIL, implement, PASS. Then run `npx vitest run src/document src/store`.
- [ ] **Step 5: Commit** `feat(square-legs): a lean may be square-set (the default for a new lean)`.

### Task 4: Level the ends writes the compound cut

**Files:**
- Modify:
  - `src/document/levelEnds.ts` (`levelPlan`, the guard, `sameLevelLine`, `isLevelled`);
  - `legSockets.ts` (`sameCuts`).
- Create: `src/document/stoolFixture.ts` gains `squareStoolLegs()` / `squareStoolDocument()`, the same stool square-set. It is
  test-only.
- Test: `levelEnds.test.ts`, `legSockets.test.ts`.

- [ ] **Step 1: Failing tests:**
  - On the square stool, every foot corner is at y = 0 to 1e-9.
  - Every top corner is at R to 1e-9.
  - Each end holds ONE miter with `across`.
  - Lengths are rounded UP to the grid.
  - Re-level is a no-op (`isLevelled` true).
  - A Front right rake edit makes `isLevelled` false. Re-level then restores it.
  - Holes stay in the wood (the existing `levelEndHoles` test, square-set).
  - Review Focus 2.
  - Bore leg sockets with Tenon the legs on the square stool: 4 joints, check clean.
  - The turned stool is unchanged (its existing tests pass untouched).
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** `feat(square-legs): Level the ends cuts a compound end on a square-set leg`.

### Task 5: Text, drawings and the Angles row

**Files:**
- `src/document/angleText.ts`: `angleLine` (the compound sentence), `shortPointLine` (full corner depths).
- `featureKeys.ts`: `angleText`.
- `diagram.ts`: the wedge in both cross views.
- `angleCuts.ts`: `miterFields` returns null for a compound cut; `miterCut` never writes one.
- `panels/AngleCuts.tsx`: a compound row shows the bench line and Remove only.

Tests beside each, plus `diagramIdentity` / `drawingIdentity` unchanged.

- [ ] **Step 1: Failing tests:**
  - the bench line is verbatim on the square stool's foot, with both degrees matching the plane;
  - the short point is the smallest of the four corner lengths;
  - the leg diagram shows the foot wedge in both side views;
  - the Angles row for a compound cut has Remove and no Across/End/Long point/Angle controls;
  - Review Focus 4, the row half;
  - the Plans sheet keeps the miter tag on a compound foot (tags by plane membership).
- [ ] **Step 2–4:** FAIL, implement, PASS. Then run `npx vitest run src/document src/panels`.
- [ ] **Step 5: Commit** `feat(square-legs): the compound miter in words and drawings`.

### Task 6: Refusals and Refine

**Files:**
- `src/generate/joints/tapers.ts`: `compoundRefusal`, wired into `joineryRefusal` after `tenonRefusal`.
- `generate/repair.ts`: beside its lean/tenon calls, under the same gate.
- `generate/refine.ts`: the joined Refine.
- `document/leanKeep.ts`: `keepsExactly` gains a compound cut.

Tests: `tapers.test.ts`, `repair.test.ts`, `refine.test.ts`, `run.test.ts`, `roleLinks.test.ts`.

- [ ] **Step 1: Failing tests:**
  - each of the three sentences appears verbatim on a cleared levelled square-set leg (Review Focus 4);
  - order: a leaning, tenoned part with a compound cut gets the lean sentence; a tenoned, cleared part gets the tenon
    sentence;
  - Refine keeps a cleared compound part exactly (`toEqual`) and drops a model part reusing its name;
  - `turnCandidates` returns `[]` for it;
  - the design schema is byte for byte unchanged.
  - Mutate each ordering test once.
- [ ] **Step 2–4:** FAIL, implement, PASS. Then run `npx vitest run src/generate src/document`.
- [ ] **Step 5: Commit** `feat(square-legs): joinery refuses and Refine keeps a compound end cut`.

### Task 7: The Lean section's Set select

**Files:** `src/panels/Lean.tsx`, `Lean.test.tsx`.

- [ ] **Step 1: Failing tests:**
  - the select shows on a leaning part with both options verbatim;
  - choosing an option calls the Task 3 action;
  - its refusal appears as `role="alert"` and the select returns to the stored value;
  - the stale `Level the ends again` note appears after a Set change on a levelled leg;
  - it is disabled while exploded (`EditLock`).
- [ ] **Step 2–4:** FAIL, implement, PASS; `npm run build` passes.
- [ ] **Step 5: Commit** `feat(square-legs): the Lean section's Set choice`.

### Task 8: Records

- `docs/invariants.md`:
  - invariant **59** in full, or clauses in 48 and 57; it is the builder's call by size, so say which;
  - clauses in 40 (the table), 41 (`compoundRefusal`), 44 (the `across.from` flip), 45 (`square` in `sameShared`),
    56 (Refine keeps a compound cut) and 57 (square-set, the default, Level the ends' compound cut).
- `CLAUDE.md`:
  - the condensed text, with every PROHIBITION verbatim;
  - the Versioning line (25);
  - the test count;
  - **stay ≤ 60,000 bytes** by moving detail, never rules.
- `docs/versioning.md` (v25, checked), `docs/module-map.md`, `docs/rounds.md` (the round row; the rollback row for schema
  25, "not deployed"), `docs/follow-ups.md` (a hand-authored compound miter; a compound bevel or chamfer; any deferred
  review minor; fu 438 notes stretchers resume on square-set legs), `docs/feature-gaps.md`, the spec's status line and an
  *Amended (build)* block for build rulings.
- [ ] **Step 1:** Write them; `npx vitest run` and `npm run build` pass; record the counts.
- [ ] **Step 2: Commit** `docs(square-legs): records`.

### Task 9: Browser verification (dev server, Playwright)

Write `docs/browser-verification-square-set-legs.md`, with screenshots in `docs/img/square-legs-*.png`. Leave the test
project in place.

1. On a new upright part, type rake 8 and splay 12. Set reads `Square to the sides`, and from the Top view its faces sit
   square to the grid within about 1°.
2. Level the ends. Each foot is one compound cut, and the bench line is verbatim on the cut list. In 3D the foot sits flat
   on the floor; check it with a Front section at the foot.
3. Switch Set to Turned. The stale note appears; Level again gives single miters. Then switch back.
4. Import the turned stool from earlier rounds. It is unchanged: `Turned to the lean`, single miters.
5. Add a hole to a square-set 8°/12° leg, then try Set → Turned. It is refused verbatim.
6. Clear lean on a levelled square leg. Its Angles rows show the bench line and Remove.
7. `npm run build` exits 0, and the console has 0 errors.

- [ ] **Step 1:** Run the checks and write the report. **Step 2: Commit** `docs(square-legs): browser verification`.
