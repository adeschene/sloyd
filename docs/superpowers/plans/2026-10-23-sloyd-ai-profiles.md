# AI edge profiles (fu 430, chunk 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the four angle arrays of the design form into one `angles` array (to fit the API's grammar cap), then let
Generate and Refine author edge profiles in world words, with untouched profiles returned exactly.

**Architecture:** The design (wire) form changes; the internal `GeneratedPart` form does not, apart from two TS-only fields.
`parseDesign` splits `angles` into the existing `tapers/miters/bevels/chamfers`; one serialiser `toWireDesign` merges them
back for the model. Profiles get one converter module, `profileWorld.ts`, and one design-fault module,
`profileDesignFaults.ts`, on the `holeWorld.ts` / `bandWorld.ts` pattern. Parts with curves or a two-side run keep their
profiles carried.

**Tech Stack:** TypeScript, Vitest, Anthropic structured output (one live compile).

**Spec:** `docs/superpowers/specs/2026-10-23-sloyd-ai-profiles-bands-design.md` — chunk 2 = "Chunk 2, revised" (R1–R6,
which WIN over §2–§9 where they differ) plus the profile parts of §1–§9. Read with the AI-holes spec it copies. Chunk 1
(bands) is shipped; its Amended block shows how.

## Global Constraints

- No document schema change (`CURRENT_VERSION` 20; `ProfileCut` unchanged). `DESIGN_SCHEMA` and `SYSTEM_PROMPT` change.
- Nothing ships without a live compile of the FINAL schema (Task 1). The probed form (R1) is the target: merged `angles`
  `{ kind: 'taper'|'miter'|'bevel'|'chamfer', dirs: [dir], toward: dir, values: [number] }` and `profiles`
  `{ edge: [dir], kind: 'roundover'|'cove'|'ogee'|'bead'|'thumbnail', size, fillet, depth, facing: 'face'|'edge', allRound: boolean, start, end }`,
  all fields required, `additionalProperties: false`, `dir` and `vec3` by `$ref`. If it is refused, STOP.
- R2's table is the angle mapping, verbatim. A chamfer's `toward` is ignored and written as `dirs[0]`.
- Profile ends: EXACTLY 0 or EXACTLY the part's extent along the run is a THROUGH end; within 1/32in of either is THROUGH
  only for a value NOT in the exact set; anything else is a station measured from the NEARER end (ties `min`). Numbers snap
  with `holeSnap` (nearer of 1/64in and a whole mm) unless in the exact set.
- Profile shape faults = exactly `validateProfiles`' drop rules (document.ts) plus: no or two broad-face dirs in `edge`
  (text names the broad faces, R6.5); the side not perpendicular to the broad face. A zero-length/reversed station run is
  NOT a shape fault (it stores; `stop-off`).
- Carried (never authored): profiles on a part with curves or any two-side run; bands on a part with curves. Their returned
  entries are ignored silently (R6.3).
- Change-list edge words are ABSOLUTE (`endWord`): `Top: 1/4" roundover added on the top/front edge`.
- Invariant 44: directions via `dirToLocal`/`localToDir`, positions via the axisFrame helpers.
- Branch `ai-profiles` off `master`; merge `--no-ff`; no PR. `npm run build` typechecks. Mutate every test justified by a
  refusal, an exclusion or an ordering. Paid runs ≤ 10 (probe included); the key never leaves the page.

## Review Focus

1. **Refine echo of a profiled project** — a stopped profile measured from its MAX end, a loop, and a part with a two-side
   run. Expected: every profile back with its stored fields and id; the two-side part untouched. Pinned in Task 5.
2. **Refine "add a cove to the top's front edge" on a full-length edge.** Expected: THROUGH ends (B3 precise), no `stop-off`.
   Pinned in Task 3 (`end = extent` in the exact set still reads THROUGH).
3. **A 1in roundover on a 3/4in top.** Expected: stored, raised as `'profile-fault'` (the straight run's `curveFaults`), fed
   back, part kept. Pinned in Task 4.
4. **An arched apron with a profile, on Refine.** Expected: profile carried exactly, model's profiles for it ignored, no
   `'profile-fault'` fed back. Pinned in Task 5.
5. **An existing tapered + chamfered + mitered project echoed by Refine after the angle merge.** Expected: every angle cut
   identical (the internal form is unchanged). Pinned in Task 1.

---

### Task 1: The merged `angles` form, `profiles` in the schema, `toWireDesign`, and the live compile

**Files:** `src/document/generated.ts` (schema, `parseDesign`, `toWireDesign`, `convertPart`'s angle-fault rejection),
`src/generate/refine.ts` (`refineMessage`), `src/generate/run.ts` (estimate chars), tests in `generated.test.ts`,
`refine.test.ts`, `run.test.ts`; re-capture `src/document/fixtures/design-schema-builtin.json`; create
`docs/browser-verification-ai-profiles.md`.

**Interfaces — Produces:**
- `export interface WorldAngle { kind: 'taper'|'miter'|'bevel'|'chamfer'; dirs: Dir[]; toward: Dir; values: number[] }`
- `export interface WorldProfile { edge: Dir[]; kind: ProfileKind; size: number; fillet: number; depth: number; facing: 'face'|'edge'; allRound: boolean; start: number; end: number }`
- `GeneratedPart` gains TS-only `angleFaults?: string[]` and `profiles?: WorldProfile[]` (required from the model).
- `export function toWireDesign(d: GeneratedDesign): unknown` — the model's JSON: `angles` merged in the order tapers,
  miters, bevels, chamfers; TS-only fields (`carry`, `grain`, `angleFaults`) dropped.
- `parseDesign` reads `angles` (splitting per R2; a wrong count → a string pushed to `angleFaults`, e.g.
  `has a miter with 2 directions; a miter takes 1`) and `profiles`.
- `convertPart`: a non-empty `angleFaults` rejects the part with reason `'taper'` (taper entry) or `'angle'`.

- [ ] **Step 1: Failing tests.** Schema pin: `angles` and `profiles` required, the four old keys absent. Parse: each kind's
  wire entry splits into today's internal array; `toWireDesign(parseDesign(x))` deep-equals `x` for a design with every
  kind; each wrong count (taper 0 dirs, miter 2 dirs, chamfer 1 value…) lands in `angleFaults` and `convertPart` rejects
  with the right reason — mutate one count rule. Review Focus 5: `documentToDesign` → `toWireDesign` → `parseDesign` →
  `designToDocument` of a tapered, chamfered, mitered, beveled project gives identical `angleCuts`. `refineMessage`
  contains `"angles"` and no `"tapers"`.
- [ ] **Step 2:** Run. FAIL. **Step 3:** Implement. Profiles parse but `convertPart` ignores them until Task 5.
- [ ] **Step 4: Live compile probe** of the final Refine-form schema (1 custom solid, 1 custom sheet, 1 custom band type)
  exactly as chunk 1's Task 1 (dev server `:5199`, Playwright MCP, key presence only, no `localStorage.clear()`, close the
  browser, stop the server). Pass: HTTP 200 / `max_tokens`. Refused: STOP, BLOCKED.
- [ ] **Step 5:** Re-capture the fixture (verify: the four arrays replaced by `angles`, plus `profiles`, nothing else).
  Full `npm test`, `npm run build`. Commit `feat(ai-profiles): merged angles + profiles in the design schema (compiled live, fu 322)`.

### Task 2: The prompt's angle section, and the angle live re-check (gate)

**Files:** `src/generate/prompt.ts`, `prompt.test.ts`; `docs/browser-verification-ai-profiles.md`.

- [ ] **Step 1: Failing test** pinning the rewritten angle guidance: every sentence that names `"tapers"`, `"miters"`,
  `"bevels"`, `"chamfers"` now speaks of `"angles"` entries with `"kind"`, keeping the same advice (inside-face Shaker
  tapers by corner, chamfer the exposed top edges, miters only where parts rest, the overlap rule). Pin:
  `Use "angles": [] for every part without tapers, miters, bevels or chamfers.` and one example per kind in the R2 form
  (e.g. `{ "kind": "taper", "dirs": ["+x", "+z"], "toward": "-y", "values": [22, 0.375] }`). Mutate one; it fails.
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS); full suite and build.
- [ ] **Step 5:** Commit `feat(ai-profiles): the prompt speaks the merged angles form (spec R2)`.
- [ ] **Step 6: Live re-check (paid, controller-run):** Generate "a Shaker side table" (inside-face tapers toward the floor,
  chamfered top edges); Generate "a picture frame" (four miters, long point outside); Refine an existing tapered/mitered
  dev project "make it 2 inches taller" (every angle cut identical). Record readouts. **A regression stops the round** and
  goes to the user before Task 3.

### Task 3: `profileWorld.ts` — the converter

**Files:** create `src/document/profileWorld.ts`, `profileWorld.test.ts`.

**Interfaces — Produces:**
- `worldProfiles(b: Board): WorldProfile[] | null` — canonical order; null when any run is two-side.
- `profilesFor(b: Board, entries: readonly WorldProfile[], exact?: ReadonlySet<number>): { profiles: Omit<ProfileCut,'id'>[] } | { fault: string }`
  — per Global Constraints (ends, snapping, shape faults); `canonicalRun`; sorted by `PROFILE_FIELDS` order. Ignored
  fields per kind (`fillet` for thumbnail, `depth` unless thumbnail, `facing` for symmetric) are dropped as the loader drops them.
- `sameWorldProfile(a: Omit<ProfileCut,'id'>, b: Omit<ProfileCut,'id'>, board: Board): boolean` — equal world forms on
  `board` (for Task 5's exact-entry map; never `sameProfile` on stored fields, B1).

- [ ] **Step 1: Failing tests.** Round trip, every posture × rotation on `chiralPart` (cuts stripped): each kind, both
  facings, through/through, station/through measured from min AND max, a loop → `worldProfiles` → `profilesFor` →
  `sameWorldProfile`. Review Focus 2: `start 0, end <extent>` with both values in the exact set → THROUGH ends. Tolerance:
  `end = extent − 1/64` → THROUGH when not exact, a station when exact. Nearer end: a stop 3in from the max end of a 24in
  edge stores `from: 'max', at: 3`. Shape faults, one test each, mutated: every `validateProfiles` drop rule; no broad
  face (text names the broad faces); two broad faces; side not perpendicular. A reversed station run stores (not a fault).
  `worldProfiles` is null for a two-side run.
- [ ] **Step 2–4:** FAIL, implement (inv 44 helpers), PASS; build.
- [ ] **Step 5:** Commit `feat(ai-profiles): profileWorld converter (spec §3.2–3.3, R6.2, R6.5)`.

### Task 4: `profileDesignFaults.ts` — strict faults, including oversized straight runs

**Files:** create `src/document/profileDesignFaults.ts` (+ test); modify `src/document/carryText.ts` (`faultKeys` reads the
same helper), `src/document/designCheck.ts` (`ViolationKind` gains `'profile-fault'`), `src/document/assemblyChecks.ts`
(`collapseViolations` keys it by message, as hole/band faults).

**Interfaces — Produces:**
- `profileFaultKinds(b: Board, p: ProfileCut): string[]` — `profileFaults(b, p)` kinds, plus `curveFaults(b, profileAsCurve(p))`
  kinds (`runs-off`, `cuts-through`) when the run is straight (`oneSide` and not swept). The ONE helper both readers use.
- `profileDesignFaults(flat: FlatDocument, display: Units): Violation[]` — one `'profile-fault'` per (part, profile, kind),
  skipping parts with curves; `message` `<Part>'s <kind> on <dir>/<dir> <phrase>.`; phrases: `overlap` "runs into another
  profile", `runs-off` "is bigger than the edge", `stop-off` "stops off its edge", `too-tight` "is too big for a curve on
  its path", `cuts-through` "cuts right through the part"; `shown` with the bench words.

- [ ] **Step 1: Failing tests.** Review Focus 3: a 1in roundover on a 3/4in-thick top raises `'profile-fault'` (`runs-off`
  or `cuts-through`), and the part converts (Task 5 asserts the conversion; here the fault list). A curved part's profile
  fault is NOT reported; mutate the skip. Two faulted profiles on one assembly part stay two problems. `faultKeys` agrees.
- [ ] **Step 2–4:** FAIL, implement, PASS; full suite, build.
- [ ] **Step 5:** Commit `feat(ai-profiles): profile design faults (spec §3.2, R6.1)`.

### Task 5: Conversion, exactness, carry and frame

**Files:** `src/document/generated.ts` (`convertPart`, `keptFrame`, `PartCarry`), `src/document/featureCarry.ts`
(`carryOf`, `carriedKinds`), `src/document/refineDesign.ts` (`documentToDesign`, `designValues`), `src/generate/run.ts`
(`evaluateDesign` adds `profileDesignFaults`, `preexisting`, `problemKey`).

**Interfaces:**
- Consumes `profilesFor`, `worldProfiles`, `sameWorldProfile`, `profileDesignFaults`.
- `PartCarry` gains `originalProfiles: ProfileCut[]` (as `originalHoles`); `carry.profiles` holds profiles only for a CARRIED
  part (curves or two-side).
- `convertPart`: carried → `carry.profiles`, model's ignored; else `profilesFor` (fault → reject, reason `'profile'`), then
  the exact-entry swap against `originalProfiles` only in a kept frame (restored with id and stored `from`s; original order
  when every entry is restored, the holes M3 rule).
- `keptFrame`: unconditional only for carried curves or carried profiles.
- `carriedKinds(b)`: curves, hardware, `profiles` when curves or a two-side run, `bands` when curves.
- `documentToDesign`: `profiles: worldProfiles(b) ?? []`, `[]` when the part has curves.
- `designValues` adds each profile's `size`, `fillet`, `depth`, `start`, `end`.

- [ ] **Step 1: Failing tests.** Review Focus 1: Refine echo of a part with a max-end stopped profile, a loop, and another
  part with a two-side run → every profile identical with ids (mutate the exact-entry swap away; it fails). Review Focus 4:
  an arched apron's profiles carried exactly, its returned profiles ignored, no fault fed back. A profiled-only part turned
  in plan is oriented like its plain twin; a curved one keeps its frame (mutate `keptFrame`). A resized part's full-length
  run stays full-length. `featureTurned` still faults a turned two-side-run part.
- [ ] **Step 2–4:** FAIL, implement, PASS; full suite, build.
- [ ] **Step 5:** Commit `feat(ai-profiles): convert, restore exactly, carry and frame (spec §3.4, §4, R6.3)`.

### Task 6: Change list, KEEP_LINE, linking

**Files:** `src/document/designDiff.ts`, `src/generate/refine.ts` (`KEEP_LINE`), `src/document/roleLinks.ts` (+ tests).

- `diffDesigns`: `ChangeKind` gains `'profiles'`; per part, matched on raw `edge` dirs + `kind`: `1/4" roundover added on
  the top/front edge`, `roundover on the top/front edge removed`, `roundover on the top/front edge now 3/8"` (size; or
  `now stopped` / `now full length` / `now all round`). Edge words via `endWord`.
- `KEEP_LINE`: `…chamfers, holes, edging and edge profiles.`
- `turnCandidates`: profiles no longer block (curves and two-side runs still do); re-stored via `worldProfiles` →
  `profilesFor` with an exact set; `alignedTo` adopts the representative's profile ids on a match.

- [ ] **Step 1: Failing tests.** Each change-list line; an untouched profile gets none. Two equal profiled tops link; a
  quarter-turned square one links (mutate the guard). A two-side-run part never turns.
- [ ] **Step 2–4:** FAIL, implement, PASS; full suite, build.
- [ ] **Step 5:** Commit `feat(ai-profiles): change list, KEEP_LINE, linking (spec §4.1, §5)`.

### Task 7: The prompt's profile section

**Files:** `src/generate/prompt.ts`, `prompt.test.ts`.

- [ ] **Step 1: Failing test** pinning (spec §6):
  - `"profiles": a shaped edge routed along a side of a part's broad face. "edge" names the broad face and the side, like a chamfer's edge; "start" and "end" are where it runs along that side, measured from the part's "at" (0 and the full length for the whole edge); "allRound": true runs it all round the broad face.`
  - `Add a profile only when asked, or a small roundover (1/8 to 1/4in) on the exposed top edges of a solid-wood tabletop where the style calls for it. Keep profiles off edges that meet other parts.`
  - `"profiles": [] for every part without them.`
- [ ] **Step 2–4:** FAIL, implement, PASS; full suite, build. **Step 5:** Commit `feat(ai-profiles): the prompt teaches profiles (spec §6)`.

### Task 8: Records, merge, live check, deploy

**Files:** `docs/invariants.md` + `CLAUDE.md` (inv 48 per R3; inv 53 "Refine carries them" → authored except curved/two-side;
inv 56's frame clause and PROHIBITION verbatim in both), `docs/module-map.md`, `docs/follow-ups.md` (fu 430 closed; fu 322
compiled form), `docs/rounds.md`, the spec's Amended block, the AI-angles and AI-tapers specs' pointer to R2,
`docs/browser-verification-ai-profiles.md`.

- [ ] **Step 1:** Records. Full `npm test` (browser closed) and `npm run build`.
- [ ] **Step 2:** Merge `--no-ff`, verify the merged tree, delete the branch.
- [ ] **Step 3: Live, paid** (stored-profile readouts): Generate "a cherry side table with a rounded-over top"; Refine
  "add a cove to the top's front edge"; Refine an echo ("make it 2 inches taller") on a dev project with a stopped and a
  two-side profile (every profile identical).
- [ ] **Step 4:** ASK the user before deploying; then deploy and verify as the last rounds did.
