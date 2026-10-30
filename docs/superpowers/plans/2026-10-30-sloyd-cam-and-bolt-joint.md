# Cam-and-bolt joint (fu 568 chunk 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cam-and-bolt joint: with two parts selected, A's end butting B's face, one action lays out N cam locks at A's end and, in B, one bore per fitting coaxial with its bolt.

**Architecture:** A pure planner `src/document/camJoint.ts` (the ONE planner) returns a plan or a refusal sentence; a store action `addCamJoint` writes the plan in one `edit()` through `mapWorld`; a section `panels/CamJoint.tsx` in the multi-selection panel drives it. Modelled on Add stretcher (`stretchers.ts`, `store.addStretcher`, `panels/Stretcher.tsx`): read those before each task.

**Tech Stack:** TypeScript, React, Zustand, Vitest (`npm test`), `npm run build` is the typecheck gate.

**Spec:** `docs/superpowers/specs/2026-10-30-sloyd-cam-and-bolt-joint-design.md` (read it whole; chunk 1's spec `2026-10-30-sloyd-cam-and-bolt-design.md` §4.1 for the preset). CLAUDE.md invariants 25, 33, 40, 44, 45, 46, 47, 50, 55, 57 apply; read their full text in `docs/invariants.md` before touching their areas.

## Global Constraints

- No schema change; nothing new stored. A document the action never touched is byte for byte as before.
- `defaultCamLock(b, end)` with no further arguments returns today's rows exactly (its existing tests pass unchanged).
- Sizes: B's bore `mm(5)` diameter, `mm(12)` deep; stations 37 mm (`mm(37)`) from each side; count 1..12 (`CAM_JOINT_MAX = 12`).
- Every part↔world crossing goes through `toWorld`/`fromWorld`/`boardExtents`/`axisDimensions`/`endFacing` (inv 44); never `board[dim] - u` at a call site.
- Exact: a pitch is one division `(span − 2·mm(37)) / (count − 1)`, never a running sum (inv 25). A B bore is `boreRow`'s output, never rounded to a grid.
- Coaxial means `boreAlongAxis(B, row, axis)` (1e-9) AND the bore's far centre inside B's box.
- Every refusal is a sentence returned before `edit()`; one undo entry; null and nothing done while exploded (`readOnly()`) or gesturing.
- `src/document/` must not import from `src/generate/` (layer order). Sentences live in `camJointText.ts`; part names via `displayNames(doc)`.
- **Spec deviation (decided at planning, record it in the spec's Amended block in Task 6):** `holesZoneRefusal` is NOT moved; `addCamJoint` calls it in `store.ts` on each write's new rows, as `addStretcher` does (`store.ts` ~2614, with `newRows`). Tilt and head checks are vacuous for this planner (every row it makes is square and headless); Task 3 asserts that instead of calling them.
- Test-only fixtures go in `src/document/camJointFixtures.ts` (add it to CLAUDE.md's test-only list in Task 6); never import a `.test.ts` module.

## Review Focus

1. **A shelf in a carcass whose sides are mirrored linked parts** (the common case): the joint on the second side must reuse the shelf's cam rows and find the side's existing bore by WORLD geometry when the shelf has one centred fitting. Test in Task 3 (`reuses a centred bore on a mirrored linked side`).
2. **B turned (rotation 90/180/270) or on edge**: bores still coaxial and inside B. Test in Task 3 (`coaxial on every turn of B`).
3. **The Fittings field holding a non-integer or 0 or 13** (typed): refused with `CAM_JOINT_COUNT`, never a NaN pitch. Test in Task 2 for the refusal; Task 5 for the field not acting while refused.
4. **The selection changing after the panel rendered** (a part deleted, the shelf moved off the side): the store re-plans and refuses with the current sentence; nothing written. Test in Task 4 (`re-plans at click time`).
5. **Metric project**: the same mm sizes, and the cam depth rule of chunk 1 on 18 mm stock. Test in Task 3 (`metric carcass`).

---

### Task 1: `defaultCamLock` takes a count and a cam face

**Files:**
- Modify: `src/document/holes.ts` (`defaultCamLock`, ~line 165)
- Test: `src/document/holes.camLock.test.ts` (create; leave existing preset tests untouched)

**Interfaces:**
- Produces: `defaultCamLock(b: Board, end: CutFrom, count?: number, camFrom?: CutFrom): [Omit<HoleRow,'id'>, Omit<HoleRow,'id'>] | null`. `count` omitted = today's rule; `camFrom` omitted = `'max'` (the cam row's `from`). `count` is assumed an integer ≥ 1 (the planner validates).

- [ ] **Step 1: Write the failing tests**
  - `unchanged without count`: for a 3/4 × 12 × 24 flat board and a 3/4 × 3 × 24 one, both ends, `defaultCamLock(b, e)` `toEqual` `defaultCamLock(b, e, undefined, undefined)` and equals the literal rows today's code returns (capture them in the test from the current implementation before editing, as literal objects).
  - `count 1 centres`: `station === b.width / 2`, `count 1`, `pitch 0` on both rows, on the 12" board.
  - `count 5 is exact`: `station === mm(37)`, `pitch === (b.width - 2 * mm(37)) / 4` (`toBe`, not close), rows share `station`/`count`/`pitch`.
  - `camFrom min`: the cam row's `from === 'min'`; the bolt row's `inset` still `b.thickness / 2`; the pair is recognised: `camPairRows({ ...b, holes: rows with ids })` has length 1 and `holeFaults` on each row is `[]`.
- [ ] **Step 2:** Run `npx vitest run src/document/holes.camLock.test.ts` — the count/camFrom tests FAIL.
- [ ] **Step 3: Implement.** Count 1: `station = b[along] / 2`, `pitch 0`; count ≥ 2: `station mm(37)`, pitch as above. `from: camFrom ?? 'max'` on the cam row. R8 and R12 nulls unchanged and first.
- [ ] **Step 4:** Run the new file and `npx vitest run src/document src/panels/Holes` — all pass.
- [ ] **Step 5:** Mutate: change `count - 1` to `count` in the pitch and confirm `count 5 is exact` fails; revert. Commit `feat(cam-joint): defaultCamLock takes a count and a cam face`.

### Task 2: Finding the joint, and the refusals before the layout

**Files:**
- Create: `src/document/camJointText.ts`, `src/document/camJoint.ts`, `src/document/camJointFixtures.ts`
- Test: `src/document/camJoint.find.test.ts`

**Interfaces:**
- Produces (camJoint.ts):
  ```ts
  export const CAM_JOINT_MAX = 12;
  export interface CamJoint { a: string; b: string; end: CutFrom; k: 0 | 1 | 2; side: -1 | 1 }
  /** §3.1 and refusals 2–7 of §3.4 that need no layout, in the spec's order. */
  export function findCamJoint(doc: SloydDocument, ids: [string, string]): CamJoint | string;
  ```
  `end` is A's joined end in A's own frame (length dimension); `side` the world direction from A into B along `k`.
- Produces (camJointText.ts), plain sentences, names as given: `CAM_JOINT_LEAN(part)`, `CAM_JOINT_CONTAINERS`, `CAM_JOINT_MIRRORED(part)`, `CAM_JOINT_SAME_PART(a, b)`, `CAM_JOINT_NONE(a, b)`, `CAM_JOINT_END_FEATURE(part, feature)`, `CAM_JOINT_COUNT`, `CAM_JOINT_THIN(part)`, `CAM_JOINT_ON_EDGE(part)`, `CAM_JOINT_TWO_LOCKS(part)`, `CAM_JOINT_PARTIAL(part)`, `CAM_JOINT_ALREADY(a, b)`, `camJointFaulted(part, words)`, `camJointLinkNote(part)`, plus the panel copy `CAM_JOINT_HEADING = 'Cam-and-bolt joint'`, `ADD_CAM_JOINT = 'Add joint'`, `camJointLine(a, endWord, b)` (`<A>'s <end> end into <B>`), `camJointReused(n)` (`Uses the cam lock already at this end (N fittings).`), `CAM_FACE_LABEL = 'Cam face'`, `FITTINGS_LABEL = 'Fittings'`. Functions where a name is interpolated, constants otherwise. The builder writes the wording; each sentence says what is wrong and, where there is one, what to do.
- Produces (camJointFixtures.ts): `carcass(units?: Units): { doc: SloydDocument; left: string; right: string; shelf: string }` — two upright sides 3/4" thick, 12" deep, 30" tall standing 24" apart outside to outside (inner faces at x = 0.75 and 23.25), and a flat 3/4 × 12 × 22.5 shelf between them at y = 10, its length along world X, ends touching both inner faces exactly; metric: 18 mm sides 300 deep, 600 apart, shelf 18 × 300 × 564. Assert the extents with `boardExtents` in the fixture's own test.

- [ ] **Step 1: Write the failing tests** (each refusal's sentence asserted by `toBe` against the text module):
  - `finds shelf into left side either order`: `findCamJoint(doc, [shelf, left])` and `[left, shelf]` both `{ a: shelf, b: left, end: <the shelf's end at x=0.75>, k: 0, side: -1 }`.
  - `refuses two ends`: two flat shelves end to end (both lengths along X, ends touching): `CAM_JOINT_NONE`.
  - `refuses a gap`: shelf moved 1/16" off the left side (over `TOUCH` = 1/32): `CAM_JOINT_NONE`.
  - `refuses an overhang`: shelf 13" deep against a 12" side: `CAM_JOINT_NONE`.
  - No AMBIGUOUS test: for two axis-aligned boxes at most one candidate exists (both ends of A cannot touch one box, and
    A's end on B's face with B's end on A's face needs B's end inside A's face while B lies past A's end: at most a
    TOUCH-wide sliver, which the "within" bound excludes). More than one candidate throws (a bug), never a sentence;
    `CAM_JOINT_AMBIGUOUS` is not written. Record this in the spec's Amended block (Task 6).
  - `refuses lean`, `refuses containers` (shelf in an assembly, side at root), `refuses mirrored instance`, `refuses same storage target` (side and shelf as two users of one Shape is not geometric; use two placements of one definition part: the builder constructs it as in `stretchers.test.ts`' definition cases), each with its sentence.
  - `refuses an end feature`: shelf end with a round tenon (`withTenons`), with an end angle cut, with a dovetail at that end: `CAM_JOINT_END_FEATURE(shelfName, <word>)`; a tenon at the OTHER end does not refuse.
  - `order`: a leaning shelf in a different container gets `CAM_JOINT_LEAN`, not `CAM_JOINT_CONTAINERS` (mutate by swapping the two checks: this test must fail).
- [ ] **Step 2:** Run `npx vitest run src/document/camJoint.find.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `findCamJoint` with the world boxes from `boardExtents` + `position`, `TOUCH` from `checkTolerances.ts`; candidates over both orders × both length ends; container/mirror checks as `legRefusal` in `stretchers.ts`; same target via `storageKey(doc, id)`; end features via `tenonAt`, `dovetailAt(b, 'length', end)`, `fingerSets` (a set at that end), angle cuts / curves / profiles whose geometry reaches the end face (the builder picks the predicate; `cornerPlan.ts`' plain-stock test is the model).
- [ ] **Step 4:** Run the file — PASS. Run `npm run build` — typechecks.
- [ ] **Step 5:** Commit `feat(cam-joint): find the end-into-face joint and its refusals`.

### Task 3: The layout, reuse and the plan

**Files:**
- Modify: `src/document/camJoint.ts`
- Test: `src/document/camJoint.plan.test.ts`

**Interfaces:**
- Consumes: Task 1's `defaultCamLock`, Task 2's `findCamJoint` and text.
- Produces:
  ```ts
  export interface CamJointPlan {
    joint: CamJoint; fittings: number; camFrom: CutFrom;
    reused: { a: boolean; b: number };
    writes: { id: string; holes: HoleRow[] }[];   // per STORAGE target: a world occurrence id, its FULL new hole list (own frame)
    notes: string[];                               // camJointLinkNote per OTHER world part whose resolved holes gain a row
  }
  export function camJointPlan(doc: SloydDocument, ids: [string, string], count: number | null, camFrom: CutFrom | null): CamJointPlan | string;
  export function defaultCamJointCount(doc: SloydDocument, ids: [string, string]): number | null;   // null when no joint
  /** The two cam faces named by world direction, default first-class: `{ from, label, default }[]`, labels from the text module. */
  export function camFaceOptions(doc: SloydDocument, ids: [string, string]): { from: CutFrom; label: string }[] | null;
  export function defaultCamFrom(doc: SloydDocument, ids: [string, string]): CutFrom | null;
  ```
  New rows carry fresh ids (`nextId`) in the plan. `writes` and `notes` follow `StretcherPlan.legs`/`notes` exactly (read `stretchers.ts`' plan assembly and copy its storage-target grouping).

- [ ] **Step 1: Write the failing tests**
  - `shelf into left side, imperial`: plan with `count null, camFrom null` has `fittings 2` (12" ≥ 150 mm), the shelf's write adds two rows forming one whole pair (`camPairRows` length 1) with the cam row's `from` the face pointing DOWN (assert via `toWorld` of the cam mouth: its y is the shelf's bottom, 10), the left side's write adds 2 single-bore rows; for each fitting `boreAlongAxis(side, row, boltAxis)` is true and the bore's far centre (`boreEnds`) lies strictly inside the side's world box; every new row on both parts has `holeFaults(..) === []` (shelf's judged with both cam rows on it); every new row has no `tilt*` and no `head` key.
  - `count 3 and camFrom override`: 3 fittings, cam on the top face.
  - `coaxial on every turn of B`: the left side at `rotation` 0, 90, 180, 270 (re-placed so its inner face stays at x = 0.75; `turnedAbout` from `turnFixtures.ts`) and on edge: all coaxial and inside.
  - `metric carcass`: `carcass(MM)`; cam depth `mm(13.5)` (18/2 + 4.5 rounded up to .5), bore `mm(5)`/`mm(12)`.
  - `reuses the shelf's pair`: add the plan's shelf rows, then plan again with `count 5`: `reused.a === true`, `fittings 2`, the shelf's write unchanged rows (no new rows), side rows only where missing.
  - `already joined`: apply the whole plan (through `mapWorld` as the store will), plan again: `CAM_JOINT_ALREADY`.
  - `reuses a centred bore on a mirrored linked side`: a 3" deep shelf (one centred fitting) and sides that are a mirrored link pair (`linkByRole` or the Shape+`mirrored` construction `stretchers.test.ts` uses); joint into the left side applied, then into the right side: `reused.a`, and the right side's bore is found existing (`reused.b === 1`) → `CAM_JOINT_ALREADY`. Mutate: replace the world-geometry reuse test with `sameHoleRow` and confirm this test fails.
  - `link notes`: a shelf linked to a second shelf elsewhere: `notes` names the second shelf (`camJointLinkNote`).
  - `refuses count`: `0`, `13`, `2.5`, `NaN` → `CAM_JOINT_COUNT`; `CAM_JOINT_THIN` on a 1/2" shelf; `CAM_JOINT_TWO_LOCKS`; `CAM_JOINT_PARTIAL` (one cam pair hole whose row has a second, unpaired hole); `camJointFaulted` when the side has a shelf-pin row the bore meets.
  - `byte for byte`: `camJointPlan` does not mutate `doc` (deep-equal a `structuredClone` before and after).
- [ ] **Step 2:** Run `npx vitest run src/document/camJoint.plan.test.ts` — FAIL.
- [ ] **Step 3: Implement.** B's bore per spec §3.2: `face = axisDimensions(B)[k]`, `from = endFacing(B, k, -side)`, `dir = −bit` (the bolt's bit points into A), `mouth = boltMouth + faceCrossing(B, boltMouth, dir, face, from) · dir`, `boreRow(B, face, from, mouth, dir, mm(5), mm(12))`; throw if `boreAlongAxis` fails or a tilt appears. Reuse of B bores by world geometry: a stored single-bore B row whose `boreEnds` both equal the planned bore's to 1e-9, same diameter and depth. Default cam face: when A's `face` dimension (broad face) lies on world Y, the `from` whose face points −Y; else `'max'`.
- [ ] **Step 4:** Run the file and the whole `src/document` folder — PASS; `npm run build`.
- [ ] **Step 5:** Commit `feat(cam-joint): plan the fittings and B's coaxial bores, with reuse`.

### Task 4: The store action

**Files:**
- Modify: `src/store/store.ts` (interface beside `addStretcher`; implementation beside it)
- Test: `src/store/store.camJoint.test.ts`

**Interfaces:**
- Consumes: `camJointPlan`.
- Produces: `addCamJoint(ids: [string, string], count: number | null, camFrom: CutFrom | null): { notes: string[] } | string | null` — the refusal sentence; `null` when nothing was done silently (exploded, gesturing, a stale id); else the notes.

- [ ] **Step 1: Write the failing tests**: `one undo entry` (after add, `undo()` restores the exact prior `doc` object; `past` grew by one); `writes coaxial bores` (the stored side holes resolve to the plan's); `exploded does nothing` (`setExplode(0.5)`: returns null, doc unchanged); `gesturing does nothing`; `re-plans at click time` (move the shelf off the side via `updateBoard`, then `addCamJoint` returns `CAM_JOINT_NONE`, doc unchanged); `dovetail zone on B` (a side with a dovetail at the end the bore lands near: returns the `dovetailMoveClear` sentence from `holesZoneRefusal`, nothing written); `notes for a linked shelf`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement**: `readOnly()`/gesturing guard; plan; for each write, `holesZoneRefusal(doc, worldPart, newRows(worldPart.holes, write.holes))` (first refusal returned); then ONE `edit((doc) => mapWorld(doc, (w) => w.map(...)))` exactly as `addStretcher` writes its legs; `judgeHeld()`; return `{ notes }`.
- [ ] **Step 4:** Run the file and `npx vitest run src/store` — PASS.
- [ ] **Step 5:** Commit `feat(cam-joint): addCamJoint, one undo entry`.

### Task 5: The panel section

**Files:**
- Create: `src/panels/CamJoint.tsx`
- Modify: `src/panels/Properties.tsx` (render `<CamJointSection ids={[boards[0].id, boards[1].id]} />` when `boards.length === 2`, after `DovetailsSection`)
- Test: `src/panels/CamJoint.test.tsx` (pattern: `Stretcher.test.tsx`)

**Interfaces:**
- Consumes: `camJointPlan`, `defaultCamJointCount`, `camFaceOptions`, `defaultCamFrom`, `addCamJoint`, the text module.

- [ ] **Step 1: Write the failing tests**: on the carcass with shelf + left side selected, the heading, the joint line (`camJointLine`), a `Cam face` select defaulting to `Underside`, `Fittings` showing `2`; clicking `Add joint` adds the rows (store doc has the side bores) and shows no error; with shelf + a far part, the button is disabled and the `CAM_JOINT_NONE` sentence shows as a `field-note`; with the shelf's pair already there, the count field and select are absent and `camJointReused(2)` shows; a typed `0` in Fittings shows the count refusal and the button does not act; link notes appear as `field-note`s after an add; the section is absent with three parts selected.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3: Implement.** The plan for display is a `useMemo` keyed on a selector returning a primitive signature of the two parts (as `Stretcher.tsx`' `pairSignature`; never return arrays from a selector, inv 43) plus count and camFrom. The Fittings field is a plain integer `<input type="number" min=1 max=12>` with an `id`, committing on blur/Enter (inv 9's commit-once spirit; no per-keystroke plan). Notes and the click-time refusal held in section state (as Stretcher). Inside `EditLock` already (the multi-selection panel's region).
- [ ] **Step 4:** Run the file and `npx vitest run src/panels` — PASS. `npm run build`.
- [ ] **Step 5:** Commit `feat(cam-joint): the Cam-and-bolt joint section`.

### Task 6: Records and the browser check document

**Files:**
- Modify: `docs/invariants.md` (inv 50: the sentence from spec §5, full), `CLAUDE.md` (inv 50 condensed; the Homes table's holes row gains `camJoint.ts`; test-only list gains `camJointFixtures.ts`; test count), `docs/module-map.md` (the three new source files and the fixture), `docs/follow-ups.md` (fu 568 status: chunk 2 built; new entries after the last number for Fit again, dowels, the B-bore recogniser, and any build ruling), the spec's `## Amended (build)` block (the `holesZoneRefusal` deviation; AMBIGUOUS outcome; every other ruling).
- Create: `docs/browser-verification-cam-and-bolt-joint.md` — numbered checks, each with steps and the expected DOM readout: (1) carcass, shelf + left side, defaults shown, Add, side shows 2 bores in the Holes section and the viewport; (2) undo; (3) right side via the same shelf: reuse note, Add; (4) Cam face Top; (5) count 3; (6) a refusal shown (shelf + a far part); (7) a turned side; (8) metric project; (9) linked shelves: notes; (10) fu 590's snap markers on pine, walnut and plywood by eye (corner, edge mid, face centre, guide, line, line crossing, line meets face, stepped anchor).

- [ ] **Step 1:** Write the records.
- [ ] **Step 2:** `npm test` (all pass; timing guards re-run quiet before claiming a regression) and `npm run build`.
- [ ] **Step 3:** Commit `docs(cam-joint): records and the browser check`.
