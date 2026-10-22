# Joinery and Repair accept bands (chunk 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add joinery and Repair joints accept banded parts. Joinery rules out, per site, only the joint kinds that would
cut into solid edging or grow or trim a banded end. A strip's or tape's bought length, and its glue line, count only the
VISIBLE run, so a tenoned banded rail is not over-bought.

**Architecture:** Chunk 2's machinery, widened. Bands store no number, so there is **no rebase** and `resizeAt` is
untouched.
- **Zones.** The watch in `featureZones.ts` gains a band test, judged in the part's ORIGINAL frame (P5) like curves. It
  uses `flat.boards[part]` and `flat.bandTypes`, never a mid-trial board: a mid-trial board's run already spans the new
  wood, and `banding.ts` is memoised per object.
- **Visible run.** One decision in `banding.ts`, from the part's stored rectangular cuts, with no knowledge of joints:
  `strips`, `tapeRuns` and `glueLines` read it.
- **Gate.** `sameJoined` compares bands and `cornerRule`, exactly.

**Tech Stack:** TypeScript, React, Vitest. `npm test` does NOT typecheck; `npm run build` is the typecheck gate. Run it at
the end of every task.

**Spec:** `docs/superpowers/specs/2026-10-21-sloyd-joinery-features-design.md` (approved 2026-10-21; chunks 1 and 2
deployed 2026-10-22). This plan covers **chunk 3 only**: §3.3's band row, §3.4 for bands, §4.4, §4.5, §5, and §7's
chunk-3 tests. Read §1–§5, §7 and every *Amended* block first. Chunk 2's plan (`2026-10-22-sloyd-joinery-curves.md`) is
the pattern.

## Amended (planning, chunk 3)

Copied into the spec in Task 6.

- **P9: bands are judged in the original frame.** A solid band's region is the strip on its side of `flat.boards[part]`:
  band thickness in from that side × the part's full ORIGINAL run × its thickness. Each watched box or slab is moved into
  that frame by the running min-end shift, as for curves. So a tenon's cheek and shoulder waste, which lies in new wood,
  never meets a long-edge band. Tape has no region (§3.3).
- **P10: faulted bands are judged as stored (my call).** A band is judged at its type's thickness whatever
  `bandFaults` says, so fixing the fault later never reveals a joint through the edging. A band whose type is missing is
  skipped (the loader drops it; in memory it contributes nothing, as in `judge`).
- **P11: the end rule for bands (§3.4).**
  - **Growth along `d` at `end`:** a band ON that end (`side.across === d && side.from === end`), tape included, rules
    the growing kinds out.
  - **Run-through exception:** a band that runs along `d` is exempt when `d === 'length'` and either it is tape, or its
    strip in width (`[0, t]` or `[w − t, w]`) does not overlap the tenon section's `[shoulder, w − shoulder]` (open, so
    `t === shoulder` is kept). Otherwise it rules the growing kinds out.
  - **Trims:** a band on the trimmed end (tape included) conflicts. A band running along the trimmed dimension never
    does, because it is shortened with the part. Any other solid band conflicts if its region meets the slab.
- **P12: the visible run (§4.4).** For a band on side `s` (across `a`, run dimension `r`), a **qualifying cut** is a
  stored rectangular cut whose `clippedRegion` R meets all of the following, with `EPS` = 1e-9:
  - it covers the whole thickness: `R.thickness[0] ≤ EPS` and `R.thickness[1] ≥ thickness − EPS`;
  - it touches the side: `R[a][0] ≤ EPS` for `from: 'min'`, or `R[a][1] ≥ part[a] − EPS` for `'max'`;
  - it reaches an end of the run: `R[r][0] ≤ EPS` or `R[r][1] ≥ part[r] − EPS`;
  - it has positive extent (> EPS) along both `r` and `a`.

  The visible run is `[lo, hi]`:
  - `lo` is the largest `R[r][1]` over qualifying cuts reaching the min end (0 if none); `hi` is the smallest `R[r][0]`
    over those reaching the max end (`part[r]` if none).
  - An end with a qualifying cut is **shortened**. A shortened end takes no corner give-way, no mitre and no mitre glue
    line, because the corner is gone.
  - A run with `hi − lo ≤ EPS` yields no strip, no tape run and no glue line (my call).

  A cheek (part-thickness), a rabbet along the edge, or a mid-run notch never shortens. A tenon's shoulder and a stopped
  dado's notch are each ONE full-thickness cut (`recipes.ts` `mortiseTenon`, `dado`; confirmed at planning), so the
  single-cut rule fires for both.
- **P13: tape on a curved stretch.** Tape runs are clipped chord by chord. A LINE chord loses the part of it inside any
  qualifying cut's (r, a) rectangle (closed, grown by EPS), so the step a fu 415 bow leaves at a tenoned end is clipped
  too. An ARC chord is counted whole: an over-buy, never an under-buy. That is reachable only through a hand cut into an
  arc; it is recorded as a new follow-up (Task 6) and pinned by a test.
- **P14: glue lines follow the visible run** (inv 16: a line sits on a feature that is actually drawn). The spec names only
  strips and tape; the invariant decides this.

## Global Constraints

- No schema change (20). `JOINERY_PROMPT`, `DESIGN_SCHEMA` and the joinery prompt stay byte-identical.
- Refine stays refused for bands: `bandedRefusal(flat, 'refine')` keeps its words exactly ("Refine doesn't handle banded
  parts yet (…). Refine before banding, or remove the bands first.").
- A band-free document is byte for byte as before (`bandFreeIdentity.test.ts` unmodified and green). Every existing test
  stays unmodified and green except the intended flips Task 3 lists (only `bandedRefusal.test.ts`'s `'joinery'`
  assertions, found by grep at planning).
- Feature word: `edge band`, verb `is` (§3.5, P8). Line: `<Enter> → <Receive>: left as a butt — <Part>'s edge band is in
  the way of every joint.`
- `banding.ts` stays numbers-only (no `units` import; inv 52). It may import `clippedRegion` from `./cuts`: checked at
  planning, nothing `cuts.ts` imports reaches `banding.ts`.
- Every decision is made before any call or mutation (inv 41); tests assert call counts, never message text, for that.

## Review Focus

1. **Solid edging thicker than the shoulder along a tenoned rail's long edge** (5/8" on a 3.5" rail, shoulder 1/2"):
   mortise-tenon must be ruled out, not cut through the edging. Owner: Task 2.
2. **An existing project with a hand notch at a banded end:** its strip, its tape and Buying shorten, and two parts that
   differ only in the notch give two strip rows, never one. Owner: Task 1.
3. **A mortise landing in a receiver's solid edging** (a rail entering a side panel whose front edge carries 3/4"
   edging, the mortise inside the strip): mortise-tenon is ruled out. Owner: Task 2.
4. **A band whose type is missing, or a faulted band** (`needs-straight` on a bowed edge): no crash; the faulted band is
   judged as stored (P10). Owner: Task 2.
5. **Glue lines on a tenoned edged rail** must stop at the shoulders, not draw across the tenon in air. Owner: Task 1
   (unit); Task 5 (by eye).

---

### Task 1: The visible run in `banding.ts`

**Files:**
- Modify: `src/document/banding.ts` (`judge`, `stripsOf`, `tapeRunsOf`, `glueLinesOf`)
- Test: `src/document/bandingVisible.test.ts` (new)

**Interfaces:**
- Produces: `export function visibleRun(part: Board, side: ProfileSide): { lo: number; hi: number; shortLo: boolean; shortHi: boolean }`
  (P12). A standalone pure function of the part alone (it reads only `cuts` and dimensions, never band types), memoised
  per part object (a `WeakMap` keyed on the part, one entry per side index) and deep-frozen. `judge`, `stripsOf`,
  `tapeRunsOf` and `glueLinesOf` call it; Task 4's oracle calls it too.
  `Strip.finished` = `(hi − lo)` minus the give-way at each NON-shortened end. `Strip.ends[k].mitre` = null at a shortened
  end.

- [ ] **Step 1: Write the failing tests** (`bandingVisible.test.ts`). Use the 18 × 3.5 × 0.75 rail and the shelf from
  `banding.test.ts`' builders, with cuts hand-built as `mortiseTenon` stores them (shoulder 1/2", tenon length 1"):
  - `a tenoned rail's long-edge strip stops at both shoulders`: a rail grown to 20 with a tenon at each end, solid 1/4"
    on width-min → `strips(…)[0].finished === 18`, and `visibleRun(...)` = `{ lo: 1, hi: 19, shortLo: true, shortHi: true }`.
  - `tape on the same rail`: `tapeRuns(…)[0].length === 18 + lengthAllowance`.
  - `a dadoed shelf's run goes into the housing`: a shelf grown by 3/8" at each end with no cut → full length.
  - `a stopped dado's notch shortens it`: the notch as `dado` stores it (one full-thickness cut at the front corner) →
    shortened at that end only.
  - `does not shorten` (one `it` each): a cheek-only cut (thickness `[0, c]`); a part-thickness rabbet along the banded
    edge; a full-thickness notch mid-run; a full-thickness cut at the end on the OPPOSITE side.
  - `a shortened end takes no give-way and no mitre`: under `ends`, `long` and `mitre`, an end band beside a shortened
    long-edge end; expect `finished` without that end's deduction, `mitre === null` there, and no mitre glue line there.
  - `glue lines follow the visible run`: the tenoned rail's two glue lines run `length` from 1 to 19.
  - `a run with nothing visible makes no strip, tape or glue line`: one full-thickness cut along the whole side.
  - `tape on a bow at a tenoned end` (P13): a fu 415 default bow on width-min (`archCurve`/the Bow preset as in
    `featureZones.curves.test.ts`), tape on width-min, grown and shouldered at the max end → the line chords inside the
    shoulder (the tenon's bottom and the step) count 0; pin the total, and pin that an arc chord a hand cut reaches is
    counted whole.
  - `a metric rail's strip stops at both shoulders`: a rail with mm-derived dimensions (457 × 89 × 19 mm, `mm / 25.4`
    unrounded) and its tenons built through `mortiseTenon` itself (via `applyJoints` on a leg-rail-leg metric design), not
    hand-built: the strip still stops at both shoulders. Float drift at the 1e-9 end test bit fu 416 and P2.
  - `two parts differing only in a hand notch give two strip rows` (Review Focus 2): `buildCutList` (or the cut list's
    exported entry point) on both → two strip rows with different lengths.
  - `Buying counts the visible tape`: `purchase.ts`' tape inches for the tenoned taped rail = 18 + allowance.
- [ ] **Step 2: Run** `npx vitest run src/document/bandingVisible.test.ts`. Expected: FAIL (`visibleRun` not exported;
  lengths 20).
- [ ] **Step 3: Implement** `visibleRun` and its use in `judge` / `stripsOf` / `tapeRunsOf` / `glueLinesOf` per P12–P14.
  In `glueLinesOf`, an end's `lo`/`hi` is the visible end when shortened, else today's rule. Tape: per chord, LINE chords
  (no `arc`) are clipped against each qualifying cut's rectangle in the outline's (length, width) plane (Liang–Barsky per
  rectangle, merge the parameter intervals, count the rest); arc chords whole; the shared-corner half stays as is.
- [ ] **Step 4: Run** the new file plus `npx vitest run src/document/banding src/document/cutlistBands src/document/purchaseBands src/document/diagramBands src/document/drawingBands src/document/bandFreeIdentity src/viewport`.
  Expected: PASS. **An existing test whose number moves is read, never re-baselined:** it is either a hand-notched banded
  end (a §4.4 change, list it for Task 6's record) or a bug in this task.
- [ ] **Step 5: Mutate**: drop the thickness condition; drop "reaches an end"; use `<` for `≤ EPS`; skip the shortened-end
  give-way rule. Each must go red. Then run `npm run build`.
- [ ] **Step 6: Commit** `feat(banding): strips, tape and glue lines count only the visible run (joinery features §4.4)`.

### Task 2: Band zones in `featureAllowed`

**Files:**
- Modify: `src/document/featureRegions.ts` (band region helper), `src/document/ruledOutText.ts` (`FeatureWord`),
  `src/generate/joints/featureZones.ts` (watch, early return)
- Test: `src/generate/joints/featureZones.bands.test.ts` (new), `src/document/ruledOutText.test.ts`

**Interfaces:**
- Produces: `export function bandRegions(board: Board, types: readonly BandType[]): { band: Band; region: Region | null }[]`
  in `featureRegions.ts`: stored order; a missing type skipped; `region` null for thickness 0 (P10: the type's thickness,
  faults ignored).
- Produces: `FeatureWord` gains `'edge band'`.
- Consumes: `featureAllowed(flat, sites)` keeps its signature; its early return also checks `b.bands.length > 0`.

- [ ] **Step 1: Write the failing tests** (`featureZones.bands.test.ts`, the fixture builders of `featureZones.curves.test.ts`,
  bands added through `withBands` and the project's `bandTypes`):
  - §3.5 examples:
    - `a banded shelf with tape on its front edge, dadoed at both ends: allowed unchanged` (the Q2 case);
    - `a band on a shelf's end that enters a dado: left as a butt`, with `ruledOutLine` reading `Shelf → Side: left as a butt — Shelf's edge band is in the way of every joint.`
  - P11 growth: a rail with solid edging along width-min, tenoned → kept at `t` = 1/4 and at `t` = 1/2 (= shoulder,
    touching); ruled out at 5/8 (Review Focus 1). Tape along the edge → kept. A tape band on the tenoned end → growing
    kinds ruled out.
  - P11 condition `d === 'length'`: a hand-built width-grown dado site with a band running along width → ruled out (the
    chunk 2 pattern for P7's condition 1).
  - P9: `a tenon's new-wood waste never meets a long-edge band` (the 1/4 case above IS this test; mutate by judging on the
    mid-trial board and see it go red).
  - Pockets: a side panel with solid 3/4" edging on its front edge receiving a shelf → dado ruled out; stopped-dado
    kept with the stop at the front and `inset[0] ≥ 3/4`; ruled out at the sliver (`inset[0] = 3/4 − 1e-6`), kept when
    touching. Review Focus 3: a rail's mortise inside a receiver's edging strip → mortise-tenon ruled out.
  - Trims: a band on the end a rabbet trims → rabbet ruled out for the whole unit; a band running along the trimmed
    dimension → kept.
  - Review Focus 4: a `needs-straight` solid band on a bowed edge is judged at its thickness (rules a pocket out); a band
    whose type id is unknown is ignored, with no throw.
  - `a shelf with 3/4" solid edging on its front, entering a dado`: P11 gives the exemption by the tenon section (shoulder
    1/2" < 3/4"), so dado, stopped-dado and mortise-tenon are ruled out and the site is left a butt. **The expected value
    hangs on the user's ruling at handoff** (keep the spec's rule, or a dado-specific one); pin whichever is ruled.
  - Order: holes, then curves and profiles, then bands; one test where a hole and a band are met at one event → `holes`.
  - Byte for byte: a band-free fixture returns the SAME `sites` array (`toBe`).
  - `ruledOutText.test.ts`: the `edge band` line with `is`, both forms.
- [ ] **Step 2: Run** `npx vitest run src/generate/joints/featureZones.bands.test.ts src/document/ruledOutText.test.ts`.
  Expected: FAIL.
- [ ] **Step 3: Implement.** A band cache beside `shapes` (built only for a part with bands, off `flat.boards[part]` and
  `flat.bandTypes`). In `cut`, after holes and shaped features: a solid region meeting `original(box, shift)` →
  `'edge band'`. In `resize`, after the existing tests, apply P11's growth rule (the tenon section from the board as it
  stands, moved into the frame as `grows` does) or P11's trim rule. Update the watch's doc comment with the band clauses.
- [ ] **Step 4: Run** the two files plus `npx vitest run src/generate/joints`. Expected: PASS, with every existing test
  unmodified.
- [ ] **Step 5: Mutate**: drop the tape-on-end clause; `>` → `>=` in the exception's overlap; drop the frame shift; drop
  the trim skip; remove `b.bands.length > 0` from the early return. Each must go red. Then `npm run build`.
- [ ] **Step 6: Commit** `feat(joinery): bands rule out only the joint kinds they are in the way of (joinery features §3, chunk 3)`.

### Task 3: Lift the refusals; gate, Repair, order

**Files:**
- Modify: `src/generate/joints/tapers.ts:129` (`joineryRefusal`), `src/document/bandedRefusal.ts`,
  `src/generate/joints/repair.ts:103`, `src/generate/joints/unjoin.ts` (`sameJoined`)
- Test: `src/document/bandedRefusal.test.ts`, `src/generate/joints/unjoin.test.ts` (or chunk 2's gate test file),
  `src/generate/joints/repair.test.ts`, `src/generate/refineBase.test.ts`, `src/generate/joints/runJoinery.test.ts`

**Interfaces:**
- Produces: `bandedRefusal(flat: FlatDocument, _action: 'refine'): string | null` (as `holedRefusal`; the `'joinery'`
  words are deleted). `joineryRefusal` no longer calls it.

- [ ] **Step 1: Write the failing tests.**
  - `bandedRefusal.test.ts`: delete the `'joinery'` assertions (a call with `'joinery'` must now fail `npm run build`:
    that is its mutation); keep the refine words.
  - `joineryRefusal` on a banded plain document → null.
  - `runJoinery` on the taped-shelf Q2 fixture (`featureZones.bands` builders): one model call (count asserted); on the
    end-banded shelf alone: no call, the summary carries the butt line.
  - Gate (`sameJoined`): a band's side flipped, its type changed, or `cornerRule` changed → false, each its own `it`. A
    joined banded project (the tenoned taped rail) passes `gateUnjoin`, and its plain parts' bands equal the input's.
  - Repair: the fu 240 bug fixture (`repair.test.ts`'s) with a band on a receiving part → repaired, and its `bands` and
    `cornerRule` are deep-equal to before.
  - Shapes (§4.5): two parts on one Shape carrying a band, only one tenoned → the existing split/write-back path, with
    both stored results' bands pinned.
  - Order (`refineBase.test.ts`, beside `a joined Refine of a holed project refuses in Refine's words without a call`):
    the same for a banded project.
- [ ] **Step 2: Run** those files. Expected: FAIL (joinery refuses banded parts; Repair withholds; `sameJoined` is blind
  to bands).
- [ ] **Step 3: Implement.** Remove the `bandedRefusal` call from `joineryRefusal` and update its doc comment ("Holes,
  curves, profiles and bands no longer refuse"). Narrow `bandedRefusal`. Remove Repair's withholding line and the now-unused
  import. Add `sameBands(p.bands, q.bands) && p.cornerRule === q.cornerRule` to `sameJoined`, exact: bands store no number.
- [ ] **Step 4: Run** `npx vitest run src/generate src/document/bandedRefusal.test.ts`, then `npm run build`. Expected:
  PASS.
- [ ] **Step 5: Mutate**: drop each `sameJoined` clause in turn; restore the Repair withholding. Each must go red.
- [ ] **Step 6: Commit** `feat(joinery): Add joinery and Repair accept banded projects (fu 398's joinery and Repair half)`.

### Task 4: The bands oracle

**Files:**
- Test: `src/generate/joints/bandsOracle.test.ts` (new)

**Interfaces:**
- Consumes: `featureAllowed`, `applyJoints`, `findSites`, `rangesOf`, `defaultChoice`; `visibleRun` (Task 1) for the
  strip-length assertion only.

- [ ] **Step 1: Write the oracle**, structured as `curvesOracle.test.ts`: the same fixture list (leg-rail, rail between
  two legs, shelf in sides, the rabbeted back, laps, the Shaker table), every quarter turn. Add bands clear of their zones:
  solid 1/4" along each rail's long edges, tape on shelf front edges, solid 3/4" on side panels' front edges. Join with
  every narrowed site at each allowed kind's range bounds. Independently of `featureRegions.ts` and the watch, assert:
  - no new or changed rectangular cut's region, moved into the original frame, overlaps a solid band's original-frame
    strip beyond 1e-9;
  - no growth happened at an end carrying a band, and no trim removed a band on the trimmed end;
  - every band survives with the same side, type and `cornerRule`;
  - each tenoned edged rail's `visibleRun` equals its plain length.

  The frame shift is read off the world box, as chunk 2's oracle does.
- [ ] **Step 2: Run** `npx vitest run src/generate/joints/bandsOracle.test.ts`. Expected: PASS. If it fails, the fault is
  in Task 2's zones or this oracle. Fix the code, not the expectation; escalate if the spec's rule looks wrong.
- [ ] **Step 3: Mutate**: disable Task 2's pocket test in the watch → the oracle goes red on the side-panel fixture.
  Restore it.
- [ ] **Step 4: Commit** `test(joinery): bands oracle (joinery features §7, chunk 3)`.

### Task 5: Live check on the dev server

**Files:**
- Create: `docs/browser-verification-joinery-bands.md` (+ `docs/img/` only if a finding is spatial)

- [ ] **Step 1:** `npm run dev -- --port <free>`; drive the Playwright browser (the user may watch). Leave test projects in
  place; never clear the dev profile.
- [ ] **Step 2, free:** import the fu 240 bug fixture with a band (exported from Task 3's test) → Repair joints is
  offered and repairs; the band is unchanged in Properties.
- [ ] **Step 3, free:** import a tenoned edged rail joined by test code (export the JSON from Task 4's fixtures). Check:
  - the band paint and glue lines stop at the shoulders, not across the tenon (Review Focus 5);
  - the cut list's strip length and Buying's tape match Task 1's numbers (DOM readout);
  - the Plans sheet's glue lines also stop at the shoulders.
- [ ] **Step 4, paid, only with the user's approval at the time:** one Add joinery run on a banded project (the Q2 shelf
  with an end-banded member), checking the summary line.
- [ ] **Step 5: Commit** the verification doc.

### Task 6: Records

**Files:** the spec (chunk table row 3; copy *Amended (planning, chunk 3)* P9–P14 and any execution rulings),
`docs/invariants.md` + `CLAUDE.md` (inv 54: "Joinery, Refine and Repair refuse banded projects" → "Refine refuses banded
projects; joinery rules out only the joint kinds a band is in the way of (inv 41); Repair accepts them; a strip, tape run
and glue line count only the visible run (P12)"; inv 41's feature list gains bands; the home table's refusals row),
`docs/follow-ups.md` (fu 398: joinery and Repair half closed; a new record-only follow-up for P13's arc chord counted
whole; the §4.4 change to existing hand-notched documents, naming every test whose number moved in Task 1),
`docs/module-map.md`, `docs/rounds.md`, the Status block, and the test count.

- [ ] **Step 1:** Write the records. Every PROHIBITION is verbatim in both invariant files.
- [ ] **Step 2:** `npm test && npm run build`. Expected: all green, with the new count recorded.
- [ ] **Step 3: Commit** `docs: joinery features chunk 3 (bands) records`. Then merge `--no-ff`, verify the merged tree,
  delete the branch, and deploy and verify per `DEPLOYMENT.local.md` and the deployment rule. Deploying is the user's
  call.

**Owed to the user after this chunk:** the `edge band` summary words; P10 (faulted bands judged as stored), P12's "no
visible run, no strip", P13 and P14; and §4.4's change to existing hand-notched banded documents.
