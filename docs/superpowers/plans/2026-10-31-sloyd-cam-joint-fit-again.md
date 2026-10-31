# Fit the cam-and-bolt joint again (fu 602) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When A's cam pair is reused and B's bores have drifted off A's bolt axes, `camJointPlan` moves those bores in place
(ids kept), the section's button reads **Fit the joint again**, and A's own panel says the joint no longer lines up.

**Architecture:** Everything is in the ONE planner, `src/document/camJoint.ts`. After the reuse step, when A's pair is reused
and planned B bores are missing, it finds LOOSE B bores, adopts the nearest SHIFTED set and replaces those rows in B's list.
The store action `addCamJoint` is unchanged. A new pure helper drives A's readout. No schema change.

**Tech Stack:** TypeScript, Vitest, React (Testing Library), Zustand.

**Spec:** `docs/superpowers/specs/2026-10-31-sloyd-cam-joint-fit-again-design.md` (read it whole first; also the joint spec
`2026-10-30-sloyd-cam-and-bolt-joint-design.md` §3 and its Amended rulings R1–R18).

## Global Constraints

- No schema change; nothing new stored; `CURRENT_VERSION` stays 32.
- A plan with no adopted set is today's plan byte for byte plus `moved: []`; existing `camJoint.*` tests pass unmodified, except
  an added `moved` key where a test deep-equals a whole plan.
- Every tolerance is 1e-9 (`EPS` in `camJoint.ts`).
- A loose candidate: `count === 1`, no `head`, no non-zero `tiltAlong`/`tiltAcross`, `diameter` within 1e-9 of `mm(5)`,
  `depth` within 1e-9 of `mm(12)`, `face`/`from` equal to the planned rows'. It is not matched by `existingBore`. On every world
  part sharing B's `holesKey`, its bore is coaxial (`boreAlongAxis`) with NO bolt hole of any `camPairRows` pair on ANY world
  part.
- Nearest shifted set by Euclidean `|d|`. A tie is two sets within 1e-9 of each other's `|d|`, and it refuses
  `CAM_JOINT_TWO_FITS(B)`.
- Copy, verbatim (all in `camJointText.ts`):
  - `CAM_JOINT_TWO_FITS = (b) => \`${b} has two sets of bores this joint could fit — remove the ones you don't want first.\``
  - `camJointMovedNote = (part) => \`${part}'s bores moved there too, through its link.\``
  - `camJointStale = (a, b) => \`${b}'s bores no longer line up with ${a}'s cam locks.\``
  - `camJointStaleNote = (b) => \`No longer lines up with ${b}'s bores — select both to fit the joint again.\``
  - `FIT_CAM_JOINT = 'Fit the joint again'`
- Commit to `master` (no PRs). End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm test` does not typecheck: run `npm run build` before claiming a task compiles.
- Mutation-check every test justified by an ordering, a refusal or the nearest choice: break the code, see the test go red,
  restore it. Record each mutation in the commit body.

## Review Focus

1. **Shelf moved less than a bore's diameter (2 mm):** the user expects a clean fit, not `meets-hole` against the bore being
   moved. Pinned in Task 1 (`a 2 mm move fits`).
2. **A side carrying several jointed shelves, the side moved:** each shelf must take its own bores, never a neighbour's.
   Pinned in Task 1 (three shelves).
3. **Mirrored-linked sides with both ends jointed, the shelf moved:** one fit moves the shared row, the other side lines up
   too, and fitting the second side is then `CAM_JOINT_ALREADY`. Pinned in Task 2.
4. **An undo after a fit restores the exact old rows (ids and order).** Pinned in Task 3.
5. **A's readout on a Cam lock never bored into its side:** shows nothing (no nag). Pinned in Task 4.

---

### Task 1: The planner finds loose bores and moves the nearest shifted set

**Files:**
- Modify: `src/document/camJoint.ts` (`CamJointPlan`, `camJointPlan`, new private helpers)
- Modify: `src/document/camJointText.ts` (`CAM_JOINT_TWO_FITS`)
- Create: `src/document/camJoint.fit.test.ts`

**Interfaces:**
- Produces: `CamJointPlan.moved: string[]`, the ids of B's rows moved, in B's list order (`[]` when none). The spec says
  "a count"; ids are the builder's allowed choice (§9), and a count is `moved.length`.
- Produces: `CAM_JOINT_TWO_FITS(b: string): string`.

- [ ] **Step 1: Write the failing tests** in `camJoint.fit.test.ts`. Copy `planOf`, `apply`, `part`, `nameOf`, `patched` and
  `boltAxes` locally from `camJoint.plan.test.ts`; never import a test module. Each test starts from `carcass()`, joins
  `[shelf, left]` with `apply(doc, planOf(...))`, then moves a part with `patched` (position only):
  - `shelf moved up 2": moves both of the side's bores in place, ids and indices kept, coaxial; then CAM_JOINT_ALREADY`.
    Assert `p.reused.a === true`, `p.moved` equals the side's two bore ids in list order, and the side's write has the same
    length and the same id at each index as before. Every moved row is `boreAlongAxis` with its bolt axis. The shelf's write
    is unchanged. After `apply`, `camJointPlan(next, [shelf, left], null, null)` is `CAM_JOINT_ALREADY('Shelf', 'Left side')`.
  - `the side moved down 1" instead: the same fit` (move `left`'s position y by −1 and its x unchanged).
  - `metric: shelf moved up 50 mm fits` (`carcass(MM)`).
  - `a 2 mm move fits` (`mm(2)` up): `p.moved` has length 2, no refusal.
  - `three shelves on one side, the side moved 1": each shelf fits its own bores`. Add `shelf2` at y 15 and `shelf3` at y 20
    (`createBoard({...shelf, id, name, position})`, `migrateDocument`), join each to `left` in turn, then move `left` up 1".
    For each shelf, the plan's moved ids are exactly the ids that shelf's own join added. Apply each in turn; every plan
    succeeds.
  - `a tie refuses: CAM_JOINT_TWO_FITS`. Join at y 10, then add to the side a hand copy of each of its joint bores 2" higher
    (`boreRow` at the mouth + 2" in y, fresh ids). Move the shelf to y 11. The originals sit 1" below the new axes and the
    copies 1" above. Expect `CAM_JOINT_TWO_FITS('Left side')`.
  - `a hand-placed Cam bolt bore off its axis is adopted`. The shelf carries `defaultCamLock(shelf, 'min')`. The side has one
    hand 5 × 12 bore per fitting on its inner face, built with `boreRow` 3 mm off each bolt axis. Expect `moved` = those ids.
  - `never a candidate`. Each case gives no fit, and the plan adds new bores as today (`moved` `[]`, the side gains rows):
    a bore 6 mm across; one 10 mm deep; a headed bore (`head: 'counterbore'` with its fields); a tilted bore (`tiltAlong: 5`);
    a two-count row; a bore on the side's OUTER face.
  - `one of two old bores deleted: no fit, Add as today`.
  - `the shelf's pair count changed to 3 in its rows: no fit` (patch both pair rows' `count` and `pitch` to a 3-fitting
    layout: `defaultCamLock(shelf, 'min', 3)`'s values, ids kept).
  - `byte for byte: with nothing loose the plan is today's plus moved: []`. A fresh join's plan
    `toEqual({ ...<the same fields>, moved: [] })`, and the input document is unchanged (`JSON.stringify` before and after).
  - `a bore that lines up with ANOTHER shelf's bolt is never loose, even when nearer`: shelf 1 at y 10 and shelf 2 at y 13,
    both joined to `left`. Move shelf 1 to y 12. Shelf 2's bores are 1" from shelf 1's new axes; shelf 1's own are 2".
    Expect `moved` = shelf 1's join ids. Shelf 2's rows are byte for byte unchanged in the write.

- [ ] **Step 2: Run them, see them fail**

  Run: `npx vitest run src/document/camJoint.fit.test.ts`
  Expected: FAIL (`moved` undefined; `CAM_JOINT_TWO_FITS` not exported).

- [ ] **Step 3: Implement** in `camJoint.ts`, inside `camJointPlan` after `planned`, replacing the `bRows` computation:
  - `missing = planned.filter((r) => !existingBore(b, r))`.
  - Only when `lock` (A reused) and `missing.length > 0`: candidates per the Global Constraints. The carriers are
    `worldParts(doc).filter((x) => holesKey(doc, x) === holesKey(doc, b))`, each judged on its own copy of the row by id.
    The bolt axes are `worldParts(doc).flatMap((x) => camPairRows(x).flatMap((p) => boltAxes(x, p.bolt)))`, computed once.
  - The shifted-set search, as in spec §3.2: for each candidate `c`, `d = mouth(c) − mouth(missing[0])`. Then every missing
    bore must have a DISTINCT candidate at `mouth + d` (per coordinate within `EPS`). Keep each success with `|d|`. Sort by
    `|d|`; a second entry within `EPS` of the first returns `CAM_JOINT_TWO_FITS(nameOf(b))`. Compare mouths with
    `boreEnds(b, row)[0]`, the planned row given `id: ''`.
  - Adopted: `bAfter.holes` is `b.holes` with each adopted candidate replaced AT ITS INDEX by `{ ...plannedRow, id: candidate.id }`.
    No row is appended. Not adopted: today's `bRows` append, unchanged.
  - Check 8 loops over the moved rows and the new rows (in `bAfter`'s order) with `holeFaults(bAfter, r, { camPairs: false })`.
  - The trial `mapWorld` write must fire when anything moved (today it fires on `bRows.length > 0`). The `write(b, …)` helper
    reads back B's list when rows were added OR moved.
  - `CAM_JOINT_ALREADY` stays decided where it is (`lock && missing.length === 0`).
  - Return `moved` (ids in B's list order). `reused.b` stays `planned.length - missing.length`.
  - Update `camJointPlan`'s doc comment: the fit, its place in the refusal order (TWO_FITS after ALREADY, before check 8), and
    inv 50's new clause.

- [ ] **Step 4: Run the new tests and the existing cam suites**

  Run: `npx vitest run src/document/camJoint src/store/store.camJoint.test.ts src/panels/CamJoint.test.tsx`
  Expected: PASS. The only existing-test edits allowed are adding `moved` where a whole plan is deep-equalled.

- [ ] **Step 5: Mutation-check:** append instead of replace (the 2 mm test goes red with `meets-hole`); take the first set
  found instead of the nearest (the three-shelves test goes red); drop the tie branch (the tie test goes red); drop the "any
  world part's bolt" exclusion (the another-shelf test goes red). Restore each.

- [ ] **Step 6: `npm run build`**, expected clean. Commit: `feat(cam-joint): Fit again in the planner — loose B bores, the nearest shifted set, moved in place (fu 602)`.

### Task 2: Links — loose across carriers, R18 on moved rows, the moved note

**Files:**
- Modify: `src/document/camJoint.ts` (the R18 loop, the notes)
- Modify: `src/document/camJointText.ts` (`camJointMovedNote`)
- Test: `src/document/camJoint.fit.test.ts`

**Interfaces:**
- Consumes: Task 1's `moved`.
- Produces: `camJointMovedNote(part: string): string`.

- [ ] **Step 1: Write the failing tests.** Copy `mirroredCarcass()` from `camJoint.plan.test.ts` into the new file. It is
  12" deep, so use a 12"-deep variant (width 12) for two fittings, or keep its one centred fitting; either is the builder's
  call, but say which in the test name.
  - `mirrored linked sides, both ends joined, shelf moved up 2": fitting the left moves the shared row; the right then lines up (CAM_JOINT_ALREADY)`.
    Expect `p.notes` to equal `[camJointMovedNote('Right side')]` and `moved` to have length = fittings.
  - `a row coaxial with a bolt only on a link co-user is never loose, even when nearer`. Mirrored linked sides with
    `shelf` (y 10) joined to the left only, and `shelf2` (a copy at y 20) joined to the right only. Through the link, the
    left now carries shelf 2's bore at y ≈ 20, which is coaxial with shelf 2's bolt only on the RIGHT carrier. Move `shelf`
    to y 19: shelf 2's shared row is 1" from its new axis, its own 9". Expect `moved` = `shelf`'s own join id, and the
    plan succeeds. R18 passes: the moved row's right-side copy opens against `shelf`.
  - `plain-linked sides, R18 on a moved row`. Construct plain-linked sides where the moved row's co-user copy opens onto a
    bare face; expect `CAM_JOINT_BARE_FACE(<that side>)`. If no geometry reaches it (R18 already refuses the original join on
    plain links), build the joined state by hand (rows written directly) and document that in the test's comment.

- [ ] **Step 2: Run, see them fail**

  Run: `npx vitest run src/document/camJoint.fit.test.ts`
  Expected: FAIL (the notes say `got these bores too`; R18 skips moved ids).

- [ ] **Step 3: Implement.** R18's loop checks every row of a carrier `x` whose id is in B's new ids OR in `moved` and whose
  value differs from `before`'s row of that id (or which is new). Notes: an other part whose holes gained a row gets
  `camJointLinkNote`; one whose holes differ only by moved rows gets `camJointMovedNote`; one note per part.

- [ ] **Step 4: Run** `npx vitest run src/document/camJoint`; expected PASS.

- [ ] **Step 5: Mutation-check:** R18 back to new-ids-only (the R18 test goes red); judge loose on B alone, not its carriers
  (the co-user test goes red). Restore each.

- [ ] **Step 6: `npm run build`.** Commit: `feat(cam-joint): a fit through links — loose on every carrier, R18 and a note for moved bores`.

### Task 3: The store — one entry, undo, held points, the zone gate

**Files:**
- Test: `src/store/store.camJoint.test.ts` (new `describe('addCamJoint: Fit again (fu 602)')`)
- Modify: `src/store/store.ts` only if a test fails (the doc comment on `addCamJoint` gains one line: it also fits)

**Interfaces:**
- Consumes: Task 1's plan; the store's `addCamJoint(ids, count, camFrom)`, unchanged.

- [ ] **Step 1: Write the tests:**
  - `a fit is one undo entry; undo restores the exact old rows (ids and order)`: join, move the shelf with `edit`-free
    `useStore.setState` of a patched doc and `past: []`, call `addCamJoint`, expect `past.length === 1`, the moved ids at the
    same indices, then undo and expect `part(left).holes` `toEqual` the pre-fit list.
  - `a tape anchor on a moved bore's rim drops`. Set `tapeAnchor` to a snap point owned by the side at the old bore's mouth
    centre. Follow `store.stretcher*.test.ts`' tapeAnchor pattern for how it builds a held point. Fit, and expect
    `tapeAnchor` null.
  - `a fit into a dovetailed side's zone refuses with the zone sentence, nothing written`. Copy the existing zone test's
    dovetail set-up. Place the joint so the MOVE (not the original join) carries a bore into the zone.
  - `exploded and gesturing: a fit does nothing`.

- [ ] **Step 2: Run** `npx vitest run src/store/store.camJoint.test.ts`. Expected: PASS. `newRows` already counts a same-id
  row with new values; if the zone test fails, pass the moved rows explicitly and say so in the commit. Then mutation-check
  the zone test: change `newRows` to filter by id only, see it go red, restore.

- [ ] **Step 3: Commit:** `test(cam-joint): the store fits in one entry, undoes exactly, drops held points, gates dovetail zones`.

### Task 4: The panels — the relabelled button and A's readout

**Files:**
- Modify: `src/document/camJoint.ts` (export `camJointStaleFits`)
- Modify: `src/document/camJointText.ts` (`camJointStale`, `camJointStaleNote`, `FIT_CAM_JOINT`)
- Modify: `src/panels/CamJoint.tsx` (section changes; new `CamJointReadout`)
- Modify: `src/panels/Properties.tsx` (mount `<CamJointReadout board={board} />` after `<StretcherReadout …/>`)
- Test: `src/document/camJoint.fit.test.ts`, `src/panels/CamJoint.test.tsx`

**Interfaces:**
- Produces: `camJointStaleFits(doc: SloydDocument, id: string): { b: string; refusal: string | null }[]`, world order. For
  every world part `y ≠ id` with `candidatesFrom(A, y)` non-empty (A as the cam part only), run
  `camJointPlan(doc, [id, y], null, null)`. Keep `y` when the plan has `moved.length > 0` (refusal null) or the plan is
  `CAM_JOINT_TWO_FITS(...)` (that refusal). A throw from one `y` is caught, logged with `console.error` and skipped (R14).
  A leaning `id` returns `[]` before any box test.

- [ ] **Step 1: Write the failing tests:**
  - Document: `camJointStaleFits: the moved shelf names the left side; a never-bored Cam lock names nothing; a fitted joint names nothing; a tie is returned with its refusal`.
  - Panel, the section: `after the shelf moves, the line reads camJointStale and the button reads Fit the joint again; clicking it fits (the side's bores line up, ids kept)`.
    `a tie shows Fit the joint again disabled, with CAM_JOINT_TWO_FITS as a field-note`.
  - Panel, A's readout: `with the moved shelf alone selected, camJointStaleNote('Left side') shows; with a fitted shelf, or a shelf whose Cam lock was never bored, it does not`.

- [ ] **Step 2: Run, see them fail:** `npx vitest run src/document/camJoint.fit.test.ts src/panels/CamJoint.test.tsx`.

- [ ] **Step 3: Implement.**
  - Section: when `plan.moved.length > 0` or `plan === CAM_JOINT_TWO_FITS(B)`, show `camJointStale(A, B)` under the joint line.
    The button's label is `FIT_CAM_JOINT`, with the same handler. Everything else stays as is.
  - `CamJointReadout({ board })`: a memo on a signature of `JSON.stringify(worldParts(doc))` (one primitive, inv 43) and
    `units`. When `camJointStaleFits` is non-empty, render an `<h3>{CAM_JOINT_HEADING}</h3>` and one `field-note` per entry
    (`camJointStaleNote(name)`). Otherwise render nothing.
  - Time `camJointStaleFits` over every part of `shakerTableFixture` in a throwaway script. Report the number in the commit
    body; if any single call exceeds 5 ms, say so to the controller before going on.

- [ ] **Step 4: Run** the panel and document suites, then `npm run build`. Expected: PASS, clean.

- [ ] **Step 5: Commit:** `feat(cam-joint): Fit the joint again in the section, and the shelf's note when its joint no longer lines up`.

### Task 5: Records and the browser check

**Files:**
- Modify: `docs/invariants.md` (inv 50: the fit clause, full); `CLAUDE.md` (inv 50 condensed: append "a fit moves only LOOSE
  B bores (lining up with no cam bolt on any carrier), the nearest shifted set, ties refused, in place."; Commands' test count)
- Modify: `docs/module-map.md` (`camJoint.ts`, `camJointText.ts`, `CamJoint.tsx` entries), `docs/follow-ups.md` (fu 602's
  `**Status:**` closed by this round, pending deploy; new numbers from 608: strays left after an Add-after-move under the old
  behaviour; a note on B's own panel; a partial match after one bore is deleted; the readout's whole-document memo
  signature), `docs/rounds.md` (a row, pending deploy), `docs/feature-gaps.md` (the Holes row's residue: fu 602 done)
- Create: `docs/browser-verification-cam-joint-fit.md`

- [ ] **Step 1: Write the records.** Keep CLAUDE.md under ~60 KB (`wc -c CLAUDE.md`); if it grows past, trim detail into
  `docs/` without dropping a rule.
- [ ] **Step 2: Write the browser check's steps.** Join a shelf between two mirrored-linked sides, both ends. Move the shelf
  up 2". Read the shelf's note. Select the shelf and the left side, read the stale line, Fit the joint again. Check both
  sides' bores line up (X-ray, and a Front section through a bore). Undo, and see the old bores back. Set up a tie, and see
  the refusal. Each step lists its expected DOM readout.
- [ ] **Step 3: Full suite and build:** `npm test` (re-run quiet if a timing guard fails) and `npm run build`; record the new
  test count in CLAUDE.md.
- [ ] **Step 4: Commit:** `docs: cam joint Fit again (fu 602) — invariant, module map, follow-ups, browser check`.
