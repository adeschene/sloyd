# Construction Lines, Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship fu 578–582: oblique lines (schema 32), line-meets-face snap points, a typed-offset anchor step, typed line
editing, and construction lines on the Plans sheet.

**Architecture:** Oblique lines join `doc.guides` as a third kind (`GuideRay`, discriminated by `to`). Every line helper in
`document/snapPoints.ts` is widened to take either kind (`AnyLine`). New snap candidates are guide-owned: face hits carry
`owner.board`, stepped anchors carry `base`. The store's inv 24 machinery judges a held point through one helper,
`heldRoot`/`heldBoard`, so those two fields cannot be missed site by site. Plans lines are a pure projector, `planLines`,
drawn by `PlanTrio` only when the sheet's new checkbox is on.

**Tech Stack:** TypeScript, React, react-three-fiber/drei, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-sloyd-construction-lines-2-design.md`. Round 1's spec,
`2026-10-29-sloyd-construction-lines-design.md`, and its Amended block govern anything this spec leaves unchanged.

## Global Constraints

- `CURRENT_VERSION` 31 → 32. Only Task 1 bumps it; every other task stores nothing new.
- `CROSS_TOLERANCE = 1e-6` (inches), a named export in `snapPoints.ts`.
- Copy is verbatim from spec §2.1, §2.6, §4.1 and §5.1. Every length is printed through `formatLength(v, doc.units)` (inv 52).
- Exactness (inv 25). Axis × axis crossings stay `===`. An axis line's hit on a face square to it takes the plane's constant,
  never `at + t·u`. A typed line edit is stored exactly.
- The viewport has no unit tests except pure helpers and perf guards. Perf guards take the MINIMUM of 9 runs with a 40 ms
  bound, and a bound is only ever lowered.
- Mutate every test justified by an ordering, a refusal or an exactness property. Each task names its mutations; record the
  result in the report.
- A project without oblique lines, and a Plans sheet with the option off, must stay byte for byte as before.
- Never renumber invariants; this round adds none. Read the full text in `docs/invariants.md` (24, 25, 26, 27, 33, 47, 51)
  before touching that area, and the `docs/module-map.md` entries for `snapPoints.ts`, `store.ts`, `TapeTool.tsx`, `MoveTool`,
  `GuidesList.tsx`, `DimensionField.tsx`, `plans.ts` and `App.tsx` keys.
- `npm run build` is the typecheck gate. Run the full `npm test` before reporting. If `curvesPerf` fails under load, re-run it
  quietly before calling it a regression.

## Review Focus

1. **A line lying in a part's face, or along its edge (grazing).** A person expects hits only where the line actually enters
   or leaves the wood (at the part's ends), never a scatter along the face. Task 4 owns the test.
2. **Undo right after a Shift+Enter step.** A step adds no undo entry, so Ctrl+Z undoes the previous document edit; `restore`
   then clears the anchor. Task 6 owns the test.
3. **Face hits on a hidden part, or on the removed side of the section.** Neither offers anything, but lines and crossings stay
   exempt from the section. Task 4 owns the test (`keepsCandidate`).
4. **Moving a part onto a face hit on itself.** It is not offered, because that hit moves with the part. Task 4 owns the test
   (`moveCandidates`).
5. **Typing the same coordinate in another form** (`1'` for `12"`). This is a no-op: no undo entry, redo left alone. Task 7
   owns the test.

---

### Task 1: Oblique lines in the document and the store (schema 32)

**Files:**
- Modify: `src/document/types.ts`, `src/document/document.ts` (`validateGuides`, `CURRENT_VERSION`, re-exports),
  `src/document/snapPoints.ts`, `src/store/store.ts` (`addGuideLine`)
- Modify: every caller of `addGuideLine`: `src/panels/TapeReadout.tsx`, `src/App.tsx`, and the tests
- Modify: the tests that pin the version. Find them with `grep -rln "version: 31\|toBe(31)" src`.
- Modify: `docs/versioning.md` (the 31→32 row: spec §2.3)
- Test: `src/document/obliqueLines.test.ts` (new), `src/store/guideLines.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `interface GuideRay { id: string; at: [n,n,n]; to: [n,n,n]; axis?: undefined }`
  - `GuidePoint` and `GuideLine` each gain `to?: undefined`
  - `type Guide = GuidePoint | GuideLine | GuideRay`
  - `type AnyLine = GuideLine | GuideRay`
  - the predicates `isGuideRay`, `isAnyLine` (`g.axis !== undefined || g.to !== undefined`), and `isGuidePoint` (both absent).
    `isGuideLine` stays axis-only.
- Produces, in `snapPoints.ts`:
  - `type NewLine = { at: Vec3; axis: TapeAxis } | { at: Vec3; to: Vec3 }`, where `Vec3 = [number, number, number]`
  - `lineThrough(a, b): NewLine | null`
    - null when `a` equals `b` exactly;
    - an axis line, canonical through `canonicalLine`, when exactly two coordinates are `===`;
    - otherwise `{ at: a, to: b }`, both copied.
  - `sameNewLine(a: NewLine, b: NewLine): boolean`
    - axis vs axis: `sameLine`;
    - oblique vs oblique: the unordered pair, every coordinate `===`;
    - mixed: false.
  - `tapeLineFor(anchor, axis, typed, hover: Vec3 | null): NewLine | null`
    - an axis lock, nothing typed: round 1's result;
    - no axis, nothing typed, a hover: `lineThrough(anchor, hover)`;
    - otherwise null.
- Produces, in the store: `addGuideLine(line: NewLine): boolean`, replacing `(at, axis)`.
  - It refuses while exploded and refuses a duplicate (`sameNewLine` against every stored line) before `edit()`.
  - An axis line is stored canonical. An oblique line is stored `{ id, at, to }`.

- [ ] **Step 1: Write the failing tests** in `obliqueLines.test.ts`. Each is one `it`.
  - **Loader:**
    - `validateGuides([{id:'r',at:[1,2,3],to:[4,5.5,6]}])` deep-equals the same object.
    - A 31-shaped file containing a point and an axis line round-trips through `migrateDocument` `toEqual` the input guides.
    - `to: [1, 2]` drops the entry; so does `to: [1, NaN, 3]`; so does `{ axis: 'x', to: [...] }`.
    - `to` equal to `at` drops the entry.
    - `{ at: [1,2,3], to: [9,2,3] }` loads as `{ at: [0,2,3], axis: 'x' }` with no `to` key (`'to' in g === false`).
    - A duplicate id between an oblique line and a point is re-minted on the second entry.
  - **The gate:** a document at `version: 33` is refused, as the round-1 gate test does for 32.
  - **`lineThrough`:**
    - `([1,2,3],[1,2,3])` is null.
    - `([1,2,3],[1,2,9])` is `{ at: [1,2,0], axis: 'z' }`.
    - `([1,2,3],[4,5,6])` is `{ at: [1,2,3], to: [4,5,6] }`, and mutating the input arrays afterwards does not change the result.
  - **`sameNewLine`:**
    - `({at:a,to:b},{at:b,to:a})` is true.
    - One coordinate off by one ulp (`Math.nextUp` style: `x + Number.EPSILON * x`) is false.
    - An axis line against an oblique line is false.
  - **`tapeLineFor`, each spec §2.1 row:**
    - axis `'x'`, typed `''`, any hover: the canonical axis line;
    - no axis, typed `''`, hover `[4,5,6]`: the oblique line;
    - no axis, typed `' '`, no hover: null;
    - no axis, typed `'3'`, a hover: null;
    - hover equal to the anchor: null.
  - **Store** (in `guideLines.test.ts`):
    - `addGuideLine({at:[1,2,3],to:[4,5,6]})` returns true and pushes one undo entry.
    - Then `addGuideLine({at:[4,5,6],to:[1,2,3]})` returns false, `past.length` is unchanged, and `future` is unchanged (set up
      a redo first).
    - It returns false while `explode > 0`.

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run src/document/obliqueLines.test.ts src/store/guideLines.test.ts`.
  Expected: FAIL (missing exports, type errors).

- [ ] **Step 3: Implement.**
  - `validateGuides` follows spec §2.3's five bullets in that order:
    1. `axis` and `to` both present: drop.
    2. `to` present: validate it as three finite numbers, else drop; then `lineThrough(at, to)`.
       - null: drop;
       - an axis line: push it canonical;
       - otherwise: push `{ id, at, to }`.
    3. Otherwise, today's axis or point path, unchanged.
  - `CURRENT_VERSION = 32`; the step from 31 adds nothing.
  - `validateGuides` calls `lineThrough`. If importing `snapPoints.ts` into `document.ts` makes a cycle, move `lineThrough`
    and `canonicalLine` into a leaf module, re-export them from `snapPoints.ts`, and say so in the report.
  - Update every `addGuideLine` caller to pass a `NewLine`. `TapeReadout` and `App` pass the hover:
    `store.tapeHover?.at ?? null`.

- [ ] **Step 4: Confirm they pass, then mutate.** Rerun the step 1 command; expected PASS. Make each mutation below, see a
  named test fail, then revert it:
  - drop the reversed-pair branch of `sameNewLine`;
  - let the loader keep an axis-parallel `to` as oblique;
  - make `addGuideLine` call `edit()` before the duplicate check.

- [ ] **Step 5: Update the docs and check the whole suite.**
  - `docs/versioning.md`: add the 31→32 row with the spec's harm argument.
  - `docs/follow-ups.md`: in fu 556's status line, change "schema 32 now" to "schema 33 now", and make the same change in
    CLAUDE.md's fu 556 mention.
  - Run `npm run build && npm test`. Expected: green.

- [ ] **Step 6: Commit.** `git commit -m "feat(lines2): oblique lines in the document and store (schema 32)"`

### Task 2: Placing an oblique line: Enter on a hover, hints, preview

**Files:**
- Modify: `src/panels/TapeReadout.tsx`, `src/App.tsx` (the Enter branch's comment only, if it names the axis), and
  `src/viewport/TapeTool.tsx` (the preview)
- Test: `src/panels/TapeReadout.test.tsx`

**Interfaces:**
- Consumes: Task 1's `tapeLineFor(anchor, axis, typed, hover)` and `addGuideLine(line)`.
- Produces: none. Task 3 widens `ConstructionLine` to take a `NewLine`; until then the preview draws only an axis line.

- [ ] **Step 1: Write the failing tests** (TapeReadout).
  - Anchored, no axis, hover set, empty text: Enter in the input adds one oblique guide and clears the anchor.
  - The same through a window keydown `Enter` with focus on `document.body` (App's path; follow the existing round-1 App
    Enter test's setup).
  - Anchored, no axis, NO hover, empty text: Enter shows `Hover a point, or press X / Y / Z` and adds nothing.
  - The hint, no axis, empty text, with a hover: `Enter for a line through both points, or type a distance`. Without a hover:
    `Type a distance, Enter to place`. With that oblique line already stored: `That line is already there; type a distance`.
  - With a typed `3` and a hover, Enter still adds a guide POINT (today's path).

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run src/panels/TapeReadout.test.tsx`. Expected: FAIL (an
  `unparseable` error instead of a line; the old hint).

- [ ] **Step 3: Implement.**
  - `commit()` and the derived `pending`/`duplicate` already call `tapeLineFor`. Pass the hover, and compare against stored
    lines with `sameNewLine` over `guides.filter(isAnyLine)`. Each stored guide maps to a `NewLine`: `{ at, axis }` or
    `{ at, to }`.
  - Hint ladder, with no axis and empty text:
    1. `pending` is a duplicate: the duplicate text;
    2. `pending` exists: the line text;
    3. otherwise: today's text.
  - The axis branches are unchanged.
  - `TapeTool`'s preview passes the hover: `tapeLineFor(anchor?.at ?? null, axis, typed, hovered?.at ?? null)`. It renders
    `ConstructionLine` only when the result has `axis`, until Task 3 widens it.

- [ ] **Step 4: Confirm they pass, then mutate.** Rerun; expected PASS. Mutation: drop the hover argument in `commit()`, and
  the Enter-in-input test must fail.

- [ ] **Step 5: Commit.** `git commit -m "feat(lines2): Enter on a hover places a line through both points"`

### Task 3: Oblique lines on screen: span, slide, crossings, drawing, list row

**Files:**
- Modify: `src/document/snapPoints.ts`, `src/viewport/snapPick.ts`, `src/viewport/GuideLines.tsx`, `TapeTool.tsx`,
  `MoveTool.tsx`, `src/panels/GuidesList.tsx`
- Test: `src/document/obliqueLines.test.ts`, `src/viewport/snapPick.test.ts`, `src/panels/GuidesList.test.tsx`

**Interfaces:**
- Produces, in `snapPoints.ts`:
  - `lineDir(line: AnyLine): Vec3`. The unit axis for an axis line; `(to − at)/|to − at|` for an oblique one.
  - `lineSpan(line: AnyLine, extent: number): [number, number] | null`. The parameter range, measured as distance from
    `line.at` along `lineDir`, of the part of the line inside the box `±extent`.
    - An axis line returns `[-extent, extent]`.
      **Ruling, kept from round 1:** an axis line's parameter is the world coordinate on its axis, because its `at[axis]`
      is 0.
    - An oblique line is clipped against the six planes (slab method). It returns null when the line misses the box.
  - `CROSS_TOLERANCE = 1e-6`.
  - `lineCrossings(guides, extent)`:
    - axis × axis: today's code, untouched;
    - every pair involving a `GuideRay`: the closest approach.
      - Parallel lines (`|u × v| < 1e-12`) never cross.
      - Otherwise they cross when the gap is `< CROSS_TOLERANCE`, at the midpoint of the closest-approach segment.
      - A crossing is kept when every coordinate is within `±extent`.
      - Owners are as in round 1: array order.
- Produces, in `snapPick.ts`: `pickOnLine(lines: AnyLine[], …)` and `pickGuided(…, lines: AnyLine[], …)`, with the same other
  parameters.
  - An axis line keeps its existing code path verbatim.
  - An oblique line:
    1. the general closest approach gives `t`;
    2. clamp `t` to `lineSpan`; a null span gives no candidate;
    3. the screen test runs on the clamped, unrounded point;
    4. the returned point is `at + snapToGrid(t, units)·u`, kind `'line'`.
- Produces, in `GuideLines.tsx`: `ConstructionLine({ line: NewLine; preview?: boolean })`.
  - An axis line draws exactly as today.
  - An oblique line draws the `lineSpan` segment in `OBLIQUE_COLOR` (the builder picks it from the guide family and puts it in
    the report for the user's eye), with no ground lift.

- [ ] **Step 1: Write the failing tests.**
  - **`lineSpan`:**
    - An axis line gives `[-120, 120]`.
    - `{at:[0,0,0],to:[1,1,0]}` gives `±120·√2` within 1e-9.
    - A line wholly outside the box, `{at:[200,0,0],to:[200,1,0]}`, gives null.
  - **`lineCrossings`:**
    - An oblique line and an axis line that truly meet: one crossing, `toBeCloseTo` the meeting point at 9 places.
    - The same pair moved `2e-6` apart: none.
    - Two parallel oblique lines: none.
    - Two axis lines: the result `toEqual`s the round-1 expectation, and the existing tests stay untouched and green.
  - **`pickOnLine` (oblique):**
    - Use a stub orthographic projector, as the existing tests do, and the line `{at:[0,0,0],to:[3,4,0]}`, with the cursor
      aimed at distance 2.03 along it. The result is `[1.2, 1.6, 0]`: `snapToGrid(2.03) = 2`, times `(0.6, 0.8)`. Check it
      with `toBeCloseTo` at 12 places.
    - The same case in metric: 2.03" rounds to the nearest mm first.
    - A ray parallel to the line gives null.
    - **Ruling:** the existing axis-line tests stay unchanged and green. That is the "identical to round 1" requirement.
  - **`GuidesList`:** an oblique row reads `Line through 1", 2", 3" and 4", 5-1/2", 6"`, its remove label is
    `Remove line through 1", 2", 3" and 4", 5-1/2", 6"`, and a metric row prints mm.

- [ ] **Step 2: Run them and confirm they fail.** Run
  `npx vitest run src/document/obliqueLines.test.ts src/viewport/snapPick.test.ts src/panels/GuidesList.test.tsx`.

- [ ] **Step 3: Implement.** Both tools build `lines` with `guides.filter(isAnyLine)`. The preview from Task 2 now renders any
  `NewLine`. `GuideLines` maps every `AnyLine`.

- [ ] **Step 4: Confirm they pass, then mutate.** Rerun; expected PASS. Make each mutation, see a test fail, then revert:
  - `<` → `<=` on `CROSS_TOLERANCE`, using a test at exactly the tolerance; add one if needed;
  - round world coordinates instead of `t`;
  - drop the span clamp.

- [ ] **Step 5: Check the whole suite.** Run `npm run build && npm test`.

- [ ] **Step 6: Commit.** `git commit -m "feat(lines2): oblique lines drawn, slid along, crossed, listed"`

### Task 4: Where a line meets a part (`line-face`)

**Files:**
- Create: `src/document/lineFaces.ts`
- Modify: `src/document/snapPoints.ts` (types), `src/document/document.ts` (re-exports), `src/viewport/moveCandidates.ts`,
  `TapeTool.tsx`, `MoveTool.tsx`, `SnapMarker.tsx`
- Test: `src/document/lineFaces.test.ts` (new), `src/viewport/moveCandidates.test.ts` (extend; create it if absent),
  `src/viewport/lineFacePerf.test.ts` (new)

**Interfaces:**
- Produces, in `snapPoints.ts`:
  - The guide owner becomes `{ type: 'guide'; id: string; cross?: string; board?: string }`.
  - `SnapKind` gains `'line-face'`.
  - `sameSnapPoint` compares `board` as well.
- Produces, in `lineFaces.ts`:
  - `FACE_PROBE = 1e-4` (inches; far below any 1/64" feature, far above `DRAW_EPS`).
  - `lineFaceHits(line: AnyLine, board: Board): SnapPoint[]`. No extent; the callers filter (below).
  - `lineFaceCandidates(guides: Guide[], boards: readonly Board[], extent: number): SnapPoint[]`. Every line against every
    board, keeping hits with every coordinate within `±extent`.
  - `keepsCandidate(section: Section | null, p: SnapPoint): boolean`. Returns
    `(p.owner.type === 'guide' && p.owner.board === undefined) || keptBySection(section, p.at)`.
- The algorithm, per `lineFaceHits`:
  1. For each `WorldBody` from `worldBodies(board)`, clip the line to an interval `[tin, tout]`, with `t` as in `lineSpan`.
     - A box body uses slabs.
     - Any other body uses Cyrus–Beck over the inside half-spaces `m·x + c ≥ 0`.
  2. Every `tin`/`tout` is a candidate parameter.
  3. Keep `t` only when `inWood(t − FACE_PROBE) !== inWood(t + FACE_PROBE)`.
     - `inWood(s)` is true when the point at `s` lies in any body of the part: the box test closed, or every plane `≥ −1e-9`.
  4. **Exact assignment.** For an axis line whose hit comes from a box face on its axis, or from a plane with `m` equal to
     ±that unit axis, the hit's coordinate on that axis is `box.min[i]`/`box.max[i]`, or `−c / m[i]`. The other two
     coordinates are `line.at`'s. Every other hit is `at + t·u`.
  5. Drop a hit lying in a bore.
     - Map it with `local = fromWorld(board, at)` and test it against `boardHoles(board)`, through `holePieces`.
     - Let `w = local − piece.centre` and `s = w·piece.bit`. The hit is in the bore when `−HOLE_EPS ≤ s ≤ piece.depth + HOLE_EPS`
       and the radial distance `|w − s·bit|` is less than `R(s) − DRAW_EPS`.
       - `R(s)` is `piece.radius`, or for a frustum (`tip` set) `radius + (tip − radius)·s/depth`.
     - **Check first that `bit` is a unit vector** (assert it in a test). If it is not, normalise it and say so in the report.
  6. Deduplicate equal points (`===` on all three coordinates). Return them in ascending `t`, as
     `{ kind: 'line-face', at, owner: { type: 'guide', id: line.id, board: board.id } }`.
- **Wiring:**
  - `TapeTool` adds `lineFaceCandidates(guides, visibleBoards(boards, hiddenIds), SCENE_EXTENT)` when `showGuides` is on.
  - `moveCandidates` adds it after a grab, over the same non-moving shown boards it already offers as targets.
  - Both tools' section filter becomes `keepsCandidate(section, p)`.
  - `SNAP_COLORS['line-face']`: the builder picks it and puts it in the report.

- [ ] **Step 1: Write the failing tests** (`lineFaces.test.ts`, on a plain 24 × 5-1/2 × 3/4 board at the origin, posture
  flat).
  - **An axis line through the board,** the Z line at x = 3, y = 0.375: two hits.
    - Their z values are `=== 0` and `=== 5.5`, where 5.5 is the box's own max.
    - x and y are the line's values.
    - Mutate the exact assignment into `at + t·u` on a board at `position: [0.1, 0.2, 0.3]` and watch it fail. That board
      makes `a + (c − a) !== c` real; the test picks values where it is, and says so in a comment.
  - **The grazing line (Review Focus 1),** the X line at y = 0.75, z = 0, along a top edge: exactly two hits, at
    `[0, 0.75, 0]` and `[24, 0.75, 0]`.
  - **A line that misses:** `[]`.
  - **A pocketed part,** a dado across the middle, made through the existing cut fixtures/helpers, with an X line through the
    remaining wood under the dado: no hit at the internal cell boundaries; only the true ends and the dado walls.
  - **A bored part,** a through hole with a Y line down its axis: no hit at either face. A Y line beside the hole: two hits.
  - **An oblique line through an angle-cut end:** the hit lies on the sloped plane within 1e-9.
  - **A leaning leg** (reuse a lean fixture from `lean` tests): two hits, each on the leg's top or bottom plane within 1e-9.
  - **`keepsCandidate` (Review Focus 3):**
    - with a section whose kept side excludes `p.at`: a crossing is kept; a `line-face` point is dropped; a board point is
      dropped;
    - with `null`: all three are kept.
  - **`moveCandidates` (Review Focus 4):**
    - grabbing part A, a line through A and B offers B's hits and none of A's;
    - with `showGuides` false it offers none;
    - a hidden B offers none.
  - **`sameSnapPoint`:** two face hits differing only in `board` are not the same.
  - **The perf guard** (`lineFacePerf.test.ts`): `lineFaceCandidates` over 20 lines (10 axis lines spread through the piece
    and 10 oblique) against `worldParts` of the shaker-table fixture (`SHAKER_TABLE_JSON` through the loader the other perf
    tests use). Take the MINIMUM of 9 runs, below 40 ms, and write the header comment in the same form as `curvesPerf.test.ts`.

- [ ] **Step 2: Run them and confirm they fail.** Run
  `npx vitest run src/document/lineFaces.test.ts src/viewport/moveCandidates.test.ts`.

- [ ] **Step 3: Implement** per the Interfaces block.

- [ ] **Step 4: Confirm they pass, then mutate.** Rerun; expected PASS. Make each mutation, see a test fail, then revert:
  - drop the `inWood` probe;
  - drop the bore test;
  - make `keepsCandidate` exempt every guide-owned point;
  - offer the moving parts' own hits.

- [ ] **Step 5: Check the whole suite.** Run `npm run build && npm test`, including the perf guard, quietly if it flakes.

- [ ] **Step 6: Commit.** `git commit -m "feat(lines2): snap where a line meets a part's face"`

### Task 5: Held points for face hits and stepped anchors (inv 24)

**Files:**
- Modify: `src/document/snapPoints.ts`, `src/store/store.ts` (`judgeHeld`, `dropHeldIfGone`, the doomed clauses in
  `deleteBoards`, `rekeyHeld`, and the sentences at `tapeHover`'s declaration)
- Test: `src/store/heldOnLines.test.ts` (new)

**Interfaces:**
- Produces, in `snapPoints.ts`:
  - `SnapKind` gains `'offset'`.
  - `SnapPoint` gains `base?: SnapPoint`, present only on a stepped anchor (`kind: 'offset'`). A base never has its own `base`.
  - `heldRoot(p: SnapPoint): SnapPoint`, which is `p.base ?? p`.
  - `heldBoard(p: SnapPoint): string | null`. Take `r = heldRoot(p)`. Return `r.owner.id` for a board owner, `r.owner.board`
    for a guide owner with `board`, else null.
  - `ownedByGuide(p, id)` judges `heldRoot(p)`.
  - `sameSnapPoint` also compares `base`, recursively, null with null.
- Produces, in the store:
  - `judgeHeld` collects `heldBoard(h)` over the three held fields.
  - In `dropHeldIfGone(boardId)`:
    - `heldOnBoard` matches `heldBoard(held) === boardId`;
    - `survives(held)` judges `r = heldRoot(held)`:
      - a board owner: today's `snapPointsFor` test;
      - a guide owner with `board`: find the line `r.owner.id` in `get().doc.guides`. It survives when the line still exists
        and `lineFaceHits(line, board)` contains `r` (`sameSnapPoint`).
  - `deleteBoards`' anchor and hover clauses test `heldBoard(p)` against the doomed set (`isCovered`).
  - `rekeyHeld` re-keys a board owner's `id`, a guide owner's `board`, and both again inside `base`.
    - `grabbed` stays a `BoardSnapPoint` (inv 26). None of this widens it.

- [ ] **Step 1: Write the failing tests.** Hold each point by setting `tapeAnchor` (or `tapeHover`) directly through the
  store's setters, as the existing inv 24 tests do.
  - **A face hit on board B, held as the anchor:**
    - `updateBoard(B, { length: … })` drops it, along with `tapeAxis`;
    - `renameItem(B, …)` keeps it;
    - `removeGuide(line)` drops it;
    - `deleteBoard(B)` drops it;
    - an edit to a different board C keeps it.
  - **A face hit held as the hover:** resizing B drops the hover and keeps a board-A anchor.
  - **Group and Ungroup** re-key `owner.board`: after `group([B, C])` the held face hit's `board` is B's new path, and it still
    survives a rename. (Follow the existing `rekeyHeld` tests' setup.)
  - **A stepped anchor** `{ kind: 'offset', at: [9,9,9], owner: B's corner owner, base: B's corner }`:
    - a rename keeps it;
    - a resize that moves that corner drops it;
    - a resize that keeps that corner keeps it;
    - with a guide-point base, `removeGuide` of that guide drops it;
    - with a crossing base, removing either line drops it.
  - **`sameSnapPoint`:** two offsets at one `at` with different bases are not the same.

- [ ] **Step 2: Run them and confirm they fail.** Run `npx vitest run src/store/heldOnLines.test.ts`.

- [ ] **Step 3: Implement.**
  - Keep `dropHeldIfGone`'s guard-first shape: it must return before any grid or body arithmetic when nothing relevant is held.
  - Add ONE sentence for `board` and ONE for `base` at `tapeHover`'s declaration. Restate nothing anywhere else.

- [ ] **Step 4: Confirm they pass, then mutate.** Rerun; expected PASS. Make each mutation, see a test fail, then revert:
  - judge `p` instead of `heldRoot(p)` in `ownedByGuide`;
  - drop `owner.board` from `heldBoard`;
  - skip the base re-key.

- [ ] **Step 5: Check the whole suite.** Run `npm run build && npm test`.

- [ ] **Step 6: Commit.** `git commit -m "feat(lines2): held face hits and stepped anchors follow inv 24"`

### Task 6: Shift+Enter steps the anchor

**Files:**
- Modify: `src/panels/TapeReadout.tsx`, `src/App.tsx` (drop `!e.shiftKey` from the Enter branch's condition),
  `src/viewport/SnapMarker.tsx` (`SNAP_COLORS.offset`)
- Test: `src/panels/TapeReadout.test.tsx`

**Interfaces:**
- Consumes: Task 5's `base`, `heldRoot` and kind `'offset'`.
- The step: `commit(step: boolean)`.
  - Shift+Enter in the input calls `commit(true)`.
  - With text typed, `commit(true)` computes `at` exactly as the point path does, with the same errors, then calls
    `setTapeAnchor({ kind: 'offset', at, owner: root.owner, base: root })`, where `root = heldRoot(from)`. It adds no guide.
  - With nothing typed, Shift+Enter behaves exactly as Enter.

- [ ] **Step 1: Write the failing tests.**
  - **The step:**
    - Anchored on a board corner `[24, 0.75, 0]`, axis `'z'`, typed `3`, Shift+Enter: the anchor is `kind: 'offset'` at
      `[24, 0.75, 3]`;
    - `doc.guides` is unchanged;
    - `past.length` is unchanged;
    - the axis is still `'z'`;
    - the text is `''`.
  - **The gesture end to end:** after the step, `setTapeAxis('x')`, then Enter with empty text adds the X line
    `{ at: [0, 0.75, 3], axis: 'x' }`.
  - **Chaining:** a second step keeps `base` equal to the original corner (`sameSnapPoint`).
  - **Errors:** Shift+Enter with `abc` typed shows `Can't read that as a length` and moves nothing.
  - **App's path:** Shift+Enter with empty text through the window places the line, as Enter does.
  - **The hints:** with `3` typed and axis Z, `Along Z — Enter to place, Shift+Enter to move the anchor there`; with no axis
    and a hover, `Enter to place, Shift+Enter to move the anchor there`.
  - **Review Focus 2:** add a guide, step the anchor, then `undo()`. The guide is gone and the anchor is null (restore's
    blanket clear).

- [ ] **Step 2: Run them and confirm they fail.**

- [ ] **Step 3: Implement.** The hint ladder for typed text:
  - with an axis: `Along Z — Enter to place, Shift+Enter to move the anchor there`;
  - without: `Enter to place, Shift+Enter to move the anchor there`.

- [ ] **Step 4: Confirm they pass, then mutate.** Rerun; expected PASS. Make each mutation, see a test fail, then revert:
  - set `base: from` instead of the root (the chaining test);
  - call `addGuide` as well (the guides test).

- [ ] **Step 5: Commit.** `git commit -m "feat(lines2): Shift+Enter steps the tape anchor by the typed distance"`

### Task 7: Editing an axis line in the Guides list

**Files:**
- Modify: `src/store/store.ts` (`moveGuideLine`, and `dropHeldOwnedBy(id)` extracted from `removeGuide`),
  `src/panels/GuidesList.tsx`, `src/styles.css` if the row needs layout
- Test: `src/store/moveGuideLine.test.ts` (new), `src/panels/GuidesList.test.tsx`

**Interfaces:**
- Produces: `moveGuideLine(id: string, at: Vec3): boolean`. It returns false in each of these cases:
  - while exploded;
  - for an unknown id, or one that names a point or an oblique line;
  - when the result is unchanged after canonicalising (a no-op, no undo entry);
  - when the result `sameLine`s another stored line.
  Otherwise it calls `dropHeldOwnedBy(id)` and then ONE `edit()` replacing that guide's `at`, and returns true.
- Produces: `dropHeldOwnedBy(id)` holds `removeGuide`'s two `ownedByGuide` clauses, moved verbatim with their comments.
  `removeGuide` calls it.
- In the row, each fixed coordinate is a `DimensionField`:
  - `label` is `Y` (or `X`, `Z`), `allowNegative`, `units` the document's;
  - `value` is the stored coordinate;
  - `onCommit = (v) => moveGuideLine(g.id, with at[i] = v) ? undefined : 'That line is already there'`.
  **Ruling:** a refused commit shows its reason through DimensionField's own refusal channel. Spec §5.2 says it "resyncs …
  as a refused DimensionField edit does elsewhere"; that is how one does. An unchanged commit never reaches here, because
  DimensionField skips it.

- [ ] **Step 1: Write the failing tests.**
  - **Store:**
    - one undo entry per move;
    - the stored value `===` the typed `12.3456789` (exact);
    - a move onto another line returns false with `past` unchanged;
    - it returns false while exploded;
    - an oblique id returns false;
    - it drops an anchor on that line's crossing and a hover on its face hit, and keeps an anchor on another line;
    - `removeGuide`'s existing tests stay green.
  - **Review Focus 5:** `moveGuideLine(id, [0, 12, 3])` on a line already at Y 12 leaves `past` and `future` unchanged.
    Through the list, typing `1'` into the Y field showing `12"` and pressing Enter leaves `past.length` unchanged.
  - **The list:**
    - an X line's row shows two fields labelled Y and Z, holding `12"` and `3-1/2"`;
    - typing `14` and Enter stores 14;
    - blur without typing commits nothing;
    - typing a value that equals another line shows `That line is already there`;
    - an oblique row has no fields;
    - a point row has no fields.

- [ ] **Step 2: Run them and confirm they fail.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Confirm they pass, then mutate.** Rerun; expected PASS. Make each mutation, see a test fail, then revert:
  - move the duplicate check after `edit()`;
  - drop the `dropHeldOwnedBy` call;
  - drop the unchanged-value guard.

- [ ] **Step 5: Check the whole suite.** Run `npm run build && npm test`.

- [ ] **Step 6: Commit.** `git commit -m "feat(lines2): edit an axis line's coordinates in the Guides list"`

### Task 8: Construction lines on the Plans sheet

**Files:**
- Create: `src/document/planLines.ts`
- Modify: `src/panels/PlanFigure.tsx` (`PlanTrio` gains `lines?: readonly AnyLine[]`; `Elevation` draws them),
  `src/panels/PlansSheet.tsx` (the checkbox), `src/styles.css` (`.plan-construction`)
- Test: `src/document/planLines.test.ts` (new), `src/panels/PlansSheet.test.tsx`

**Interfaces:**
- Produces: `planLines(lines: readonly AnyLine[], view: View, bounds: { min: P2; max: P2 }): { a: P2; b: P2 }[]`.
  - For each line, `u = lineDir(line)`.
  - Skip the line when `|u·view.toward| > 1 − 1e-12` (edge-on).
  - Otherwise project `at` and `u` with `[dot(p, right), dot(p, up)]`, clip the infinite 2-D line to the bounds rectangle
    (Liang–Barsky), and skip it when nothing is left.
- `PlanTrio`: with `lines` absent or empty, the output is exactly today's.
  - With lines present, each orthographic `Elevation` draws one `<path className="plan-construction">` after its visible
    lines, built with the same `toSvg` map. Nothing joins the dimensions, keys or bounds.
- `PlansSheet`:
  - `const [showLines, setShowLines] = useState(false)`;
  - a `<label className="plans-lines"><input type="checkbox"> Construction lines</label>` before Print, disabled when
    `!doc.guides.some(isAnyLine)`;
  - it passes `lines` to the WHOLE PIECE's `PlanTrio` only, and only when ticked.
- CSS: `.plan-construction { fill: none; stroke: currentColor; stroke-width: <hairline, the builder matches .plan-hidden>;
  stroke-dasharray: 12 3 2 3 }`. That is a chain line, and it must read differently from `.plan-hidden`'s dash.

- [ ] **Step 1: Write the failing tests.**
  - **`planLines`:**
    - An X line at y = 2, z = 1 in FRONT with bounds `[0,0]`–`[24,30]`: one segment, `[0,2]`–`[24,2]`.
    - The same line in SIDE: `[]`.
    - In TOP (`up = [0,0,-1]`): `[0,-1]`–`[24,-1]` when the bounds contain y = −1; `[]` when they do not.
    - The oblique `{at:[0,0,0],to:[1,1,0]}` in FRONT with bounds `[0,0]`–`[10,5]`: `[0,0]`–`[5,5]`.
    - An oblique line parallel to `toward`: `[]`.
  - **The sheet:**
    - With a document carrying two lines and the box unticked, the piece figure's `outerHTML` `===` that of the same document
      with `guides: []` (anti-goal: byte for byte).
    - Ticked: the piece figure has 2 `path.plan-construction` (or as many as the views allow; assert the exact count for the
      fixture), and no assembly figure has any.
    - The checkbox is disabled for a document with points only.

- [ ] **Step 2: Run them and confirm they fail.**

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Confirm they pass, then mutate.** Rerun; expected PASS. Make each mutation, see a test fail, then revert:
  - drop the edge-on test;
  - pass `lines` to the assembly trios too.

- [ ] **Step 5: Check the whole suite.** Run `npm run build && npm test`.

- [ ] **Step 6: Commit.** `git commit -m "feat(lines2): construction lines on the Plans sheet (opt-in)"`

### Task 9: Docs

**Files:** `docs/invariants.md`, `CLAUDE.md`, `docs/module-map.md`, `docs/follow-ups.md`, `docs/feature-gaps.md`, and the
spec's `## Amended (plan and build)` block.

- [ ] **Step 1: Invariants.** Write inv 24, 25, 33, 47 and 51 in full in `docs/invariants.md`, per spec §7, and condense them
  in CLAUDE.md. Every PROHIBITION stays verbatim in both.
- [ ] **Step 2: CLAUDE.md, the rest.**
  - Versioning line: `CURRENT_VERSION` is **32** (round 2: an oblique line's `to`).
  - Fu 556: "schema 33 now", if Task 1 did not already change it.
  - The construction-lines ONE-homes row: add `lineFaces.ts` (`lineFaceHits`), `planLines.ts`, `moveGuideLine`, and
    `heldRoot`/`heldBoard`.
- [ ] **Step 3: `docs/module-map.md`.** Add the new files, and per-file rule entries where a file gains a rule:
  - `snapPoints.ts`: `heldRoot`;
  - `GuidesList.tsx`: the edit fields;
  - `PlanFigure.tsx`: lines only on the piece trio.
- [ ] **Step 4: `docs/follow-ups.md`.**
  - Close 578–582 with a status line naming this round.
  - Add new numbered entries (from 583) for spec §1's non-goals:
    - editing an oblique line;
    - an axis change;
    - editing guide points (refer to fu 130);
    - dragging lines;
    - lines in the ISO, assembly and section figures;
    - face hits on a bore wall.
  - Update CLAUDE.md's "Open follow-ups" list and its `(1–N)` count to match.
- [ ] **Step 5: The spec's Amended block.** Record each ruling made in this plan or during the build: `lineSpan`'s parameter,
  the DimensionField refusal, and any others.
- [ ] **Step 6: Commit.** `git commit -m "docs(lines2): invariants, module map, follow-ups"`

### Task 10: Browser verification

The controller runs this with the user, in the user's Chrome over the tunnel to the dev server on `localhost:5199`. Record the
results in `docs/browser-verification-construction-lines-2.md`, in round 1's form. Run every check in spec §9's browser list,
then:
- confirm the schema is 32 on a new project;
- read the console for errors.

Collect the by-eye rulings: the oblique colour, the `line-face` and `offset` hues, and the Plans chain line. Commit the
verification doc.
