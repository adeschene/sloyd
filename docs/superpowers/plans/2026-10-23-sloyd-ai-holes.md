# Generate and Refine Author Hole Rows — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The design format gains a `holes` array in world words, so Generate and Refine can add, move, change and remove
hole rows. Untouched rows come back stored exactly.

**Architecture:** A new `document/holeWorld.ts` is the ONE converter between the design form and stored `HoleRow`s, in
both directions. `convertPart` uses it. Refine passes the original rows through `PartCarry` for exact restore, and stops
carrying holes as features. Faults from `holeFaults` become `'hole-fault'` design violations, and are never a reason to
reject the part.

**Tech Stack:** TypeScript, Vitest, React; the Anthropic API (one paid compile probe).

**Spec:** `docs/superpowers/specs/2026-10-23-sloyd-ai-holes-design.md` (approved 2026-10-23; the user took all three
§11 calls). Read §2–§5 before any task.

## Global Constraints

- No document schema change: `CURRENT_VERSION` stays 20, `HoleRow` unchanged. `DESIGN_SCHEMA` and `SYSTEM_PROMPT` DO
  change.
- Nothing ships without a successful live compile of the final schema (Task 1). The fallback order is spec §2.2, verbatim.
- The design form is `{ face: Dir, diameter, depth, through: boolean, offset: Vec3, toward: Dir, count, pitch }`, where
  `offset` is the first centre measured from the part's `at` along world axes.
- Hole numbers snap to the NEARER of the 1/64in grid and a whole millimetre (ties: imperial), unless exact. Part sizes and
  positions keep `SNAP_INCHES`.
- Re-derived rows are stored with `alongFrom: 'min'` (canonical direction), `acrossFrom` = the nearer side (ties `min`).
- Shape faults are exactly `validateHoleRows`' drop rules, plus `offset` more than 1/32in off the face plane. Strict
  faults (`holeFaults`) keep the row and raise `'hole-fault'`.
- Invariant 44: directions through `dirToLocal`/`localToDir` and points through the axisFrame helpers. Never hand-roll
  axis arithmetic.
- Branch `ai-holes` off `master`; merge with `--no-ff`; no PR. `npm run build` typechecks, `npm test` does not. Mutate
  every test justified by an order, a refusal or an exclusion.
- Paid runs: up to 10 for this feature (the user's ruling 2026-10-22), probes included. The key never goes into chat or a
  file.

## Review Focus

1. **A metric project whose pins were typed as 32 mm in Properties, untouched by Refine.** The reasonable expectation is
   that they come back with the exact `32 / 25.4` pitch. Pinned in Task 3 (exact-row map).
2. **A row stored measured from the max end and the far side, on a part that only MOVED.** The expectation is that it is
   restored exactly. Pinned in Task 3.
3. **A case with pins on both sides' inside faces, from Generate.** The expectation is that the sides link as one part.
   Pinned in Task 4.
4. **A loader-legal but odd stored row (`pitch: 0`, `count: 3`).** The expectation is that the part is not rejected, and
   the row raises `meets-hole`. Pinned in Task 2.
5. **An assembly part (a definition placed twice) with a row.** The expectation is that its `offset` is relative to the
   assembly part's own `at`, and it round-trips. Pinned in Task 3.

---

### Task 1: The schema, parsing, and the live compile probe

**Files:** Modify `src/document/generated.ts` (schema, `GeneratedPart.holes`, `parseDesign`'s `isPart`/`partOf`), tests
in `src/document/generated.test.ts`. Probe record: `docs/browser-verification-ai-holes.md` (created here, extended in
Task 7).

**Interfaces:**
- Produces, in `generated.ts`:
  - `export interface WorldHoleRow { face: Dir; diameter: number; depth: number; through: boolean; offset: Vec3; toward: Dir; count: number; pitch: number }`
    (holeWorld.ts imports it).
  - `GeneratedPart.holes?: WorldHoleRow[]`, required from the model as `tapers` is.
  - `partSchemaFor` gains `holes: { type: 'array', items: holeSchema }`, last in `properties` and in `required`.

- [ ] **Step 1: Failing tests.**
  - The schema pin: `holes` is required.
  - A hole item's keys are exactly `face, diameter, depth, through, offset, toward, count, pitch`, all required, with
    `additionalProperties: false`.
  - `parseDesign` rejects a part missing `holes`, keeps a valid row, and drops an unknown key on a row.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement. `convertPart` ignores `holes` until Task 3.
- [ ] **Step 4: The live compile probe**, on the dev server (`npx vite --port 5199`, Playwright MCP).
  - Follow the memory note `browser-verification-on-this-vps.md` and CLAUDE.md's deployment rule. Never clear
    localStorage, and never read the key out.
  - From inside the dev page, POST `https://api.anthropic.com/v1/messages` with the stored key: model as Refine uses it,
    max_tokens 16, `output_format`/structured output exactly as `LlmClient` sends it, with the FULL Refine schema
    (`designSchema(catalog)` with a custom material in the catalog).
  - Pass: HTTP 200, stop `max_tokens`. Record the request id, size in chars and token counts.
  - **If refused:** apply spec §2.2's fallbacks in order, one probe each, adjusting the schema, tests and
    `WorldHoleRow` accordingly. Fallback 2 removes `through`; fallback 3 replaces `toward` and `pitch` with `step: Vec3`.
  - If none compiles, STOP and report BLOCKED. No later task runs.
- [ ] **Step 5:** Run `npm test` and `npm run build`. Commit
  `feat(ai-holes): holes in the design schema (compiled live, fu 322)`.

### Task 2: `holeWorld.ts` — the converter

**Files:** Create `src/document/holeWorld.ts`, `src/document/holeWorld.test.ts`.

**Interfaces** (Consumes `WorldHoleRow`):
- `holeSnap(v: number): number`: the nearer of `Math.round(v*64)/64` and `Math.round(v*25.4)/25.4`; ties imperial.
- `worldHoles(b: Board): WorldHoleRow[]`: the design form of every row, sorted canonically.
- `holeRowsFor(b: Board, rows: readonly WorldHoleRow[], exact?: ReadonlySet<number>): { rows: Omit<HoleRow, 'id'>[] } | { fault: string }`
  - Shape faults only.
  - The fault text is model-facing, prefixed by the caller with the part's name like `taperCutsFor`'s, for example
    `has a hole row on +x whose first centre is not on that face`.
  - Rows come back canonical: `alongFrom: 'min'`, `acrossFrom` nearer, sorted by `HOLE_FIELDS` order.
- `sameHoles(a: Omit<HoleRow,'id'>, b: Omit<HoleRow,'id'>, board: Board): boolean`: the same face and `from`, diameter,
  depth (or both through), count, and every hole centre equal within 1e-9 in board-local coordinates. Used by Task 3's
  exact-row map.

- [ ] **Step 1: Failing tests.**
  - Round trip, every posture × rotations 0/90/180/270: `chiralPart(posture)` (cuts stripped) with rows on three
    different faces → `worldHoles` → `holeRowsFor` gives stored rows whose holes are `sameHoles` as the original.
  - Canonical: a row written `toward +y` and the same holes `toward -y` store identically.
  - `holeSnap`: `holeSnap(1.26) === 32/25.4`, `holeSnap(0.197) === 5/25.4`, `holeSnap(0.25) === 0.25`,
    `holeSnap(0.3125) === 0.3125`.
  - Shape faults, one test each, mutated: non-finite; `diameter 0`; `depth 0` not through; `count 0`; `count 501`;
    `count 2.5`; negative `pitch`; `toward` on the face axis; `offset` 1/16 off the plane.
  - Accepted: `offset` 1/64 off the plane (it is put on the plane).
  - Review Focus 4: `{ pitch: 0, count: 3 }` is NOT a shape fault, and `holeFaults` on the stored result reports
    `meets-hole`.
  - Every stored row `validateHoleRows` keeps round-trips: a property test over a small generated grid of rows.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement with `dirToLocal`, `localToDir` and `toWorldOffset`/`fromWorldOffset` (inv 44).
- [ ] **Step 4:** Run `npx vitest run src/document/holeWorld.test.ts` and `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ai-holes): holeWorld converter (spec §3.1–3.2)`.

### Task 3: Conversion, faults and Refine exactness

**Files:** Modify `src/document/generated.ts` (`convertPart`, `RejectedPart.reason` gains `'hole'`),
`src/document/featureCarry.ts` (`PartCarry`), `src/document/refineDesign.ts` (`documentToDesign` writes `holes`;
`designValues` adds hole numbers), `src/generate/run.ts` (`problemKey`, `evaluateDesign`, `runRefine`'s `preexisting`),
`src/document/designCheck.ts` (`ViolationKind` gains `'hole-fault'`). Tests: `src/document/carryConvert.test.ts`,
`src/generate/run.test.ts`, `src/document/refineDesign.test.ts`.

**Interfaces:**
- `PartCarry.holes` is REMOVED. Add `PartCarry.originalHoles: HoleRow[]`: the matched original's stored rows, for exact
  restore only, never written to the output. `carryFromOriginal` sets it.
- `convertPart`:
  - `holeRowsFor(board, p.holes ?? [], exact)` runs after the angle cuts. A fault rejects the part with reason `'hole'`
    and detail `` `${label} ${fault}.` ``.
  - Then each re-derived row is swapped for the first unused `carry.originalHoles` row that is `sameHoles` on the NEW
    board. It keeps that row's id; the others are minted.
  - The swap happens only when the part's frame is the carried frame.
- `holeDesignFaults(flat: FlatDocument, display: Units): Violation[]` lives in `holeWorld.ts`. It gives one violation
  per (row, fault kind):
  - `kind: 'hole-fault'`, `parts: [name]`.
  - `message`: `` `${name}'s hole row on ${face} ${phrase}.` ``. The phrase is one of `breaks out of its face`,
    `runs into a cut or angle`, `meets another hole`, `is deeper than the part` (breaks-out, off-flat, meets-hole,
    too-deep).
  - `shown`: the same words, the face given as the part's side name through `holeText`.
- `evaluateDesign` concatenates `holeDesignFaults` into `raw` for BOTH Generate and Refine. `runRefine`'s `preexisting`
  adds it.
- `problemKey(v)` is `JSON.stringify([v.kind, sortedParts, v.kind === 'hole-fault' ? v.message : null])`.

- [ ] **Step 1: Failing tests.**
  - Generate path: a design part with a row converts to a stored row. A breaking-out row is STORED and raises one
    `'hole-fault'`. Mutate: reject the part instead, and the test fails.
  - Refine exactness:
    - Review Focus 2: an untouched row measured from `alongFrom: 'max'` and the FAR side comes back identical, id
      included. The same holds after the whole part moves.
    - Review Focus 1: a metric `32/25.4` pitch row comes back exact.
    - Mutate: drop the exact-row swap, and both fail.
  - Resized (the user's ruling): the model keeps the holes where they were in the box on a part lengthened at the row's
    measured end. The row is re-derived (`alongFrom: 'min'`), and its world centres equal the model's.
  - Review Focus 5: an assembly part's row round-trips through `documentToDesign` → conversion.
  - `problemKey`: an original faulted row plus a NEW faulted row on the same part feeds the new one back (scripted
    `run.test.ts` client: the second call's user turn contains the new message, not the old).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` and `npm run build`. Expected: PASS. Existing Refine tests that relied on carried holes
  may change: they now go through the model's echo, and the exact-row map keeps them identical. Fix the tests only where
  the change is the spec's.
- [ ] **Step 5:** Commit `feat(ai-holes): convert, flag and restore hole rows exactly (spec §3.1, §3.3)`.

### Task 4: Linking holed parts

**Files:** Modify `src/document/roleLinks.ts` (`turnCandidates`, `alignedTo`); tests in
`src/document/roleLinks.test.ts`.

**Interfaces:**
- `turnCandidates` drops `b.holes.length > 0` from its guard. It re-stores rows per turn with
  `holeRowsFor(t, worldHoles(b))`, and a fault skips that turn.
- `alignedTo` also aligns hole ids by index when every row is equal (`HOLE_FIELDS` without `id`), the same way it
  aligns angle cuts.

- [ ] **Step 1: Failing tests.**
  - Two equal holed parts with different ids link (`alignedTo`).
  - Review Focus 3: two case sides with pin rows on their INSIDE faces (mirror images) link as one Shape through
    `linkByRole`.
  - Mutate: restore the holes guard, and they fail; drop the hole-id alignment, and they fail.
  - A curved part still gets no candidates.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx vitest run src/document/roleLinks.test.ts src/document/carryConvert.test.ts` and
  `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ai-holes): holed parts link through turns (spec §5)`.

### Task 5: Refine's carry, KEEP_LINE and the change list

**Files:** Modify `src/document/featureCarry.ts` (`featuredKinds` for the carry paths, `featureTurned`),
`src/document/carryText.ts` (`featuredNote`, `carriedSummary`), `src/generate/refine.ts` (`KEEP_LINE`),
`src/document/designDiff.ts` (`ChangeKind` gains `'holes'`). Tests are the existing files beside each.

**Interfaces:**
- The carried kinds for the note, `featureTurned` and `carriedSummary` are curves, profiles, bands and hardware. Holes are
  excluded everywhere in those three. `hasFrameFeatures` is UNCHANGED: it still counts holes (the frame is kept).
- `KEEP_LINE` becomes:
  `Keep every part you are not asked to change exactly as it is: the same name, role, material, size, position, tapers, miters, bevels, chamfers and holes. Keep assembly and placement names. Return the whole design.`
- `diffDesigns` matches rows per part by `face` plus first centre on design forms (`worldHoles`; offsets are
  part-relative). Unmatched rows are a removal plus an addition. Lines, built with `formatLength`:
  - `` `${part}: ${count} hole${s} added on ${face}, ${diameter} Ø` `` (`s` is empty when count is 1)
  - `` `${part}: hole row on ${face} removed` ``
  - `` `${part}: hole row on ${face} now ${what}` ``, where `what` is one of `${depth} deep`, `through`,
    `${diameter} Ø`, `${count} holes`, `${pitch} apart` and `moved`, comma-joined when several change.
  - `face` is the world direction (`+x`), as the angle lines print it.

- [ ] **Step 1: Failing tests.**
  - The note omits a holes-only part and keeps `Apron (a curve)`.
  - `featureTurned` ignores a holes-only part.
  - `carriedSummary` never names holes.
  - The `KEEP_LINE` pin.
  - The change list: added, removed, deeper, and moved part (no line).
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test` and `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ai-holes): Refine reads and lists holes; the carry keeps the rest (spec §4)`.

### Task 6: The prompt

**Files:** Modify `src/generate/prompt.ts` (`SYSTEM_PROMPT`), `src/generate/estimate.ts` (`CHARS_PER_TOKEN` only if a
re-measure moves it), and the prompt pins.

- [ ] **Step 1:** Write `SYSTEM_PROMPT`'s holes paragraph from spec §6, verbatim in substance. The bullet list needs
  three things the spec does not say:
  - the `offset` rule ("measured from the part's own at; on the face you drill, that coordinate is 0 or the part's
    size");
  - one example row;
  - `"holes": []` for parts without them.
- [ ] **Step 2:** Update the prompt pin tests. Re-measure chars-per-token by the method `estimate.ts`' comment names. Use
  the probe's input token count from Task 1 if it applies; otherwise one more probe.
- [ ] **Step 3:** Run `npm test` and `npm run build`. Expected: PASS. Commit
  `feat(ai-holes): the prompt teaches hole rows (spec §6)`.

### Task 7: Records, merge, live check, deploy

- [ ] **Step 1: Records.**
  - Inv 48 ($defs list), inv 50 (author + exact-row map), inv 56 (holes leave the carry; the frame still counts them):
    in full in `docs/invariants.md` and condensed in CLAUDE.md.
  - `module-map.md`: `holeWorld.ts`.
  - `follow-ups.md`: close 329, and record the compiled form under 322.
  - The spec's Amended block, if anything was ruled during execution.
- [ ] **Step 2:** Run `npm test` and `npm run build`; record the count in CLAUDE.md. Merge
  `git merge --no-ff ai-holes`, verify the merged tree, and delete the branch.
- [ ] **Step 3: Live check (dev server, paid; at most 10 runs in all, probes included).** Run the spec §9 runs and append
  them to `docs/browser-verification-ai-holes.md`:
  - Generate "a bookcase with adjustable shelves": rows on the sides' inside faces, and the sides linked.
  - Refine "move the shelf pins 1 inch closer to the front": the change list shows it, and the rows are re-derived.
  - Refine "add a knob hole to the door": the untouched rows are byte-identical.
- [ ] **Step 4: Deploy** only after the user says so.
  - Follow DEPLOYMENT.local.md: bundle hash in-network and at the edge, CSP, a real-browser load, storage cleared and read
    back empty.
  - Record it in the CLAUDE.md Status block, `docs/rounds.md` and the runbook.
