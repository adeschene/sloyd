# AI edge bands (fu 430, chunk 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and Refine author edge bands in world words; Generate edges the exposed front edges of plywood parts by
default; an untouched band comes back exactly; solid edging is minted once per species as `<Species> edging`, 1/4in.

**Architecture:** One converter module, `src/document/bandWorld.ts` (the `holeWorld.ts` pattern): a design-wide minting
pass resolves each `edging` key to a band type id before any part converts, `bandsFor` stores a part's bands, `worldBands`
reads them back. The minted type list is threaded through `designToDocument`, the fault check and both Refine paths. Parts
with curves keep their bands carried, as today.

**Tech Stack:** TypeScript, Vitest, React (panels untouched), Anthropic structured output (one live compile).

**Spec:** `docs/superpowers/specs/2026-10-23-sloyd-ai-profiles-bands-design.md` (chunk 1 = everything about bands; the
profile sections are chunk 2 and are NOT built here). Read it with this plan, and the AI-holes spec it copies.

## Global Constraints

- No document schema change: `CURRENT_VERSION` stays 20; `Band`, `BandType`, `cornerRule` unchanged. `DESIGN_SCHEMA` and
  `SYSTEM_PROMPT` DO change.
- Nothing ships without a successful live compile of the final schema (Task 1). Fallbacks per spec §2.3 do not apply to
  bands (two fields); if the bands form is refused, STOP and report.
- The design form is `bands: [{ edge: Dir, edging: string }]`, required on every part, `[]` when unused.
- `edging` keys (spec §3.1): `"veneer"` = `BUILT_IN_BAND_ID`; each of the PROJECT's other band type ids; `"solid <id>"`
  for every solid material id in the catalog (built-in and custom).
- `"solid <m>"` reuses the project's first `kind: 'solid'` type with `material === m` and `thickness === 0.25`; else mints
  `newBandType('solid', taken)` with `material: m`, `name: '<catalog label of m> edging'` (unique by `freeName`'s rule:
  `Oak edging`, `Oak edging 2`). Minted once per design. A Refine echo mints nothing.
- `cornerRule` is never in the design: Generate stores `'long'`; Refine carries the original's.
- A part with curves keeps its bands CARRIED (design shows `bands: []`, the model's bands for it are ignored).
- Change-list words for an edge are ABSOLUTE (`endWord`: front/back/left/right/top/bottom + " edge"), not inside/outside:
  `Shelf: edging added on the front edge (Oak edging)` (spec §4.1's examples).
- Invariant 44: directions through `dirToLocal`/`localToDir`; never hand-rolled axis arithmetic.
- Branch `ai-bands` off `master`; merge `--no-ff`; no PR. `npm run build` typechecks, `npm test` does not. Mutate every
  test justified by a refusal, an exclusion or a reuse rule.
- Paid runs ≤ 10 for this feature, probes included (the user's ruling 2026-10-22). The key never goes into chat or a file.

## Review Focus

1. **Refine "make it taller" on a project with a custom solid band type (`Live — edged bookcase`, Maple edging).** Expected:
   nothing minted, `bandTypes` identical, every band identical. Pinned in Task 3.
2. **`"solid oak"` when the project already has a 3/4in Oak solid type named `Oak edging`.** Expected: not reused
   (thickness differs); a new `Oak edging 2` at 1/4in is minted. Pinned in Task 2.
3. **A curved, banded part (an arched apron with edging) on Refine.** Expected: its bands carried exactly, its design entry
   shows `bands: []`, and any bands the model returns for it are ignored. Pinned in Task 4.
4. **A banded part inside an assembly placed three times.** Expected: one minted type, the band stored once on the
   definition part, the change list's line merged `(×3)`. Pinned in Task 3.
5. **The JOINED Refine path** (a project already joined). Expected: a minted type survives into the saved result (run.ts
   rebuilds the document there too). Pinned in Task 3.

---

### Task 1: The schema, parsing, and the live compile probe

**Files:** Modify `src/document/generated.ts` (types, `designSchema`, `parseDesign`), `src/generate/run.ts` (schema call
sites pass band types), tests in `src/document/generated.test.ts`; re-capture `src/document/fixtures/design-schema-builtin.json`.
Probe record: create `docs/browser-verification-ai-bands.md`.

**Interfaces:**
- Produces, in `generated.ts`:
  - `export interface WorldBand { edge: Dir; edging: string }`; `GeneratedPart.bands?: WorldBand[]` (required from the
    model, optional in TS like `holes`).
  - `export function edgingKeys(catalog: MaterialCatalog, bandTypes: readonly BandType[]): string[]` — `'veneer'`, the
    non-built-in type ids in stored order, then `solid <id>` for each solid catalog material in catalog order.
  - `designSchema(catalog = builtInCatalog(), bandTypes: readonly BandType[] = [BUILT_IN_BAND])`: `partSchema` gains
    `bands: { type: 'array', items: { edge: {$ref dir}, edging: { enum: edgingKeys(...) } } }`, last in `properties` and
    `required`, `additionalProperties: false`.
  - `parseDesign(json, catalog, bandTypes = [BUILT_IN_BAND])` rejects a part without `bands` or with an `edging` outside
    the keys.
- In `run.ts`: Refine's schema is `designSchema(catalog, doc.bandTypes)`, its `prefixChars` likewise; `evaluateDesign`
  passes `opts.bandTypes` to `parseDesign`. Generate keeps `DESIGN_SCHEMA` (built-ins).

- [ ] **Step 1: Failing tests.**
  - `bands` is required; a band item's keys are exactly `edge, edging`, both required.
  - `edgingKeys(builtInCatalog(), [BUILT_IN_BAND])` starts `['veneer', ...]` and contains `'solid oak'`, not `'solid plywood'`.
  - With a custom solid material and a custom band type, both appear (`solid m-s-…`, the type id).
  - `parseDesign` rejects a missing `bands`, an unknown `edging`, and keeps a valid band.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. `convertPart` ignores `bands` until Task 3.
- [ ] **Step 4: Live compile probe** on the dev server (`npx vite --port 5199`, Playwright MCP), exactly as the AI-holes
  plan's Task 1 Step 4 (memory note `browser-verification-on-this-vps.md`; never clear localStorage; key presence only).
  Schema: `designSchema(catalogOf({ materials: [a custom solid, a custom sheet] }), [BUILT_IN_BAND, a custom solid band type])`.
  Pass: HTTP 200, stop `max_tokens`. Record request id, schema chars, tokens. Refused → STOP, report BLOCKED.
- [ ] **Step 5:** Re-capture the builtin schema fixture (verify old bytes + `bands` and nothing else). `npm test`,
  `npm run build`. Commit `feat(ai-bands): bands in the design schema (compiled live, fu 322)`.

### Task 2: `bandWorld.ts` — keys, minting and the converter

**Files:** Create `src/document/bandWorld.ts`, `src/document/bandWorld.test.ts`.

**Interfaces** (Consumes `WorldBand`, `edgingKeys`):
- `mintBandTypes(keys: readonly string[], types: readonly BandType[], catalog: MaterialCatalog): { types: BandType[]; idOf: (key: string) => string }`
  — the design-wide pass: `keys` are every `edging` in the design; returns `types` (input plus any minted, input order
  first) and the key → type id map. Pure apart from `nextId`.
- `bandsFor(b: Board, entries: readonly WorldBand[], idOf: (key: string) => string): { bands: Band[] } | { fault: string }`
  — `edge` through `dirToLocal`; a thickness-axis edge is the fault `has edging on a broad face (<dir>)`; two entries on
  one side is `has two edgings on <dir>`; result `canonicalBands`.
- `worldBands(b: Board): WorldBand[]` — canonical order; `edging` is `'veneer'` for `BUILT_IN_BAND_ID`, else the type id.

- [ ] **Step 1: Failing tests.**
  - Round trip, every posture × rotation 0/90/180/270 on `chiralPart` (cuts stripped) with bands on all four sides of
    two types: `worldBands` → `bandsFor` gives `sameBands` as the original.
  - Minting: `'solid oak'` with no Oak type mints one type `{ kind: 'solid', material: 'oak', thickness: 0.25, name: 'Oak edging' }`;
    two `'solid oak'` keys mint ONE; `'veneer'` and an existing id mint nothing.
  - Review Focus 2: an existing 3/4in Oak solid type named `Oak edging` is NOT reused; the minted one is `Oak edging 2`.
    Mutate the thickness test away, and it fails.
  - Reuse: an existing 1/4in Oak solid type (any name) is reused; mutate to "always mint", and it fails.
  - A custom solid material's label names its type (`<label> edging`).
  - Shape faults, one test each, mutated: an edge on the thickness axis; two entries on one side.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run src/document/bandWorld.test.ts`, `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ai-bands): bandWorld converter and band type minting (spec §3.1–3.3)`.

### Task 3: Conversion, faults, and the type list through every path

**Files:** Modify `src/document/generated.ts` (`designToDocument`, `convertPart`, `keptFrame`, `RejectedPart`),
`src/generate/run.ts` (`evaluateDesign`, both Refine rebuilds, `problemKey`), `src/document/refineDesign.ts`
(`documentToDesign`); create `src/document/bandDesignFaults.ts` (+ test). Tests in `generated.test.ts`, `run.test.ts`.

**Interfaces:**
- `designToDocument(design, opts)`: before converting, `mintBandTypes(<every edging in parts and assembly parts>,
  opts.bandTypes ?? [BUILT_IN_BAND], catalog)`; the result's `doc.bandTypes` is the minted list (always set).
- `convertPart(…, idOf)`: a part WITHOUT `carry.curves` gets `bands` from `bandsFor` (a fault rejects the part, reason
  `'band'`, detail `<label> <fault>.`, fed back like `'hole'`); a part with carried curves keeps `carry.bands` and ignores
  the model's. `cornerRule`: `carry?.cornerRule ?? 'long'`.
- `keptFrame`: the frame is kept unconditionally only for carried curves or profiles; a part whose frame features are
  holes and/or bands follows the rank + thickness rule.
- `bandDesignFaults(flat: FlatDocument, display: Units): Violation[]` — one `'band-fault'` per (part, side, kind) from
  `bandFaults(part, flat.bandTypes)`; `message` `<Part>'s edging on <dir> <phrase>.`, `shown` with the bench words; phrases:
  `needs-straight` "needs a straight edge", `no-side` "is on a side that is cut away", `too-thick` "is thicker than the
  part allows", `tape-narrow` "is narrower than the part is thick". `ViolationKind` gains `'band-fault'`; `problemKey`
  includes the message for it (as `'hole-fault'`).
- `run.ts`: `evaluateDesign` adds `bandDesignFaults`; Refine's `preexisting` includes the original's; both rebuilds take
  `bandTypes: out.doc.bandTypes` (plain) and the joined result's own `bandTypes`, never `doc.bandTypes`.
- `documentToDesign`: each part's `bands: worldBands(b)`, except `[]` for a part with curves.

- [ ] **Step 1: Failing tests.**
  - Generate form: a part with `[{ edge: '+z', edging: 'solid oak' }]` converts to a stored band on the right side and
    `doc.bandTypes` holds the minted Oak edging; the load gate keeps it (round trip through `migrateDocument`).
  - Review Focus 4: an assembly placed three times with a banded part mints one type; the band is on the definition part.
  - Review Focus 1: Refine echo of a project with a custom 1/4in Maple solid type: `bandTypes` identical, bands identical,
    nothing minted.
  - Review Focus 5: the joined Refine path keeps a minted type in the saved document (`run.test.ts`, as the existing
    joined-path tests do). Mutate `out.doc.bandTypes` back to `doc.bandTypes`, and it fails.
  - A curved part's model bands are ignored and its carried bands kept exactly.
  - Frame: a bands-only part returned turned in plan is oriented like its plain twin, its bands converted from world
    words; a curved banded part keeps its frame.
  - `bandDesignFaults`: a 1in solid band on a 3/4in-thick part's end raises `'band-fault'`; the part is NOT rejected.
  - A broad-face band rejects the part with reason `'band'` and its feedback names it.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ai-bands): convert, fault and thread band types through Generate and Refine (spec §3–4)`.

### Task 4: Refine's carry, the message and the change list

**Files:** Modify `src/document/featureCarry.ts`, `src/document/carryText.ts`, `src/generate/refine.ts`,
`src/document/designDiff.ts` (+ tests).

**Interfaces:**
- `carriedKinds(b)`: holes never; `bands` only when `b.curves.length > 0`. `featureTurned` and `carriedSummary` follow it.
- `carryOf`: `bands` carried only for a curved part; `cornerRule` always.
- `KEEP_LINE`: `…tapers, miters, bevels, chamfers, holes and edging.`
- `refineMessage`: after the custom-materials line, when the project has non-built-in band types:
  `Edging types in this design: "<id>" is <name> (<solid <material label>, <thickness>in | tape>); …`.
- `diffDesigns`: `ChangeKind` gains `'bands'`; per part, matched by side (raw direction):
  `edging added on the front edge (Oak edging)`, `edging on the front edge removed`, `edging on the front edge now
  Iron-on veneer`. Edge word = `endWord(dir)`. Type names from each side's own `bandTypes`.

- [ ] **Step 1: Failing tests.**
  - Review Focus 3: a curved banded part — carried, named in the note, listed by `carriedSummary` on a resize; a plain
    banded part — not carried, not in the note, not in `carriedSummary`.
  - `KEEP_LINE` and the edging-types line (present with a custom type, absent without).
  - Change list: added, removed, changed-type lines; a part with an untouched band gets no line; an assembly part's line
    merges `(×3)`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ai-bands): Refine's carry, message and change list for edging (spec §4)`.

### Task 5: Linking banded parts

**Files:** Modify `src/document/roleLinks.ts` (+ test).

**Interfaces:** `turnCandidates(b)` no longer returns `[]` for bands alone (curves, profiles and cuts still block);
each candidate's bands are re-stored as `bandsFor(t, worldBands(b), id => id === 'veneer' ? BUILT_IN_BAND_ID : id)`;
a fault blocks that turn.

- [ ] **Step 1: Failing tests.** Two equal edged shelves link (one Shape). A shelf whose twin is turned a quarter in plan
  with its band re-stored links to it. Mutate the guard back, and the turned case fails. Pinned-and-edged mirror sides do
  NOT link (fu 432, recorded limit) — assert two Shapes or none, so a future fix updates the test on purpose.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`, `npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(ai-bands): banded parts link through turns (spec §5)`.

### Task 6: The prompt

**Files:** Modify `src/generate/prompt.ts`, `src/generate/prompt.test.ts`, re-measure `src/generate/estimate.ts` if the
measured chars-per-token figure moves (AI-angles precedent).

- [ ] **Step 1: Failing test** pinning these sentences in `SYSTEM_PROMPT` (the spec §6 defaults, the user's ruling: by
  default):
  - `"bands": edging glued to a side of a part's broad face. "edge" is that side; "edging" is "veneer" (iron-on), an edging type the project already has, or "solid <material>" (1/4in solid edging of that wood).`
  - `Band the EXPOSED front edges of plywood parts (shelves, case sides, tops, dividers): "solid <the piece's solid wood>" when it has solid wood parts, else "veneer". Never band an edge that meets another part, and never band solid-wood parts.`
  - `"bands": [] for every part without edging.`
  And `SYSTEM_PROMPT` still contains no `bookcase` (the caching test).
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** `npm test`, `npm run build`. PASS.
- [ ] **Step 5:** Commit `feat(ai-bands): the prompt teaches edging (spec §6)`.

### Task 7: Records, merge, live check, deploy

**Files:** `docs/invariants.md` (inv 54, 56 full text), `CLAUDE.md` (condensed inv 54/56, PROHIBITION of inv 56 rewritten
to "curves or profiles" verbatim in both, module map row `bandWorld.ts`, `bandDesignFaults.ts`), `docs/module-map.md`,
`docs/follow-ups.md` (fu 430: chunk 1 done; fu 322: the compiled form), `docs/rounds.md`, the spec's Amended block,
`docs/browser-verification-ai-bands.md`.

- [ ] **Step 1:** Records as listed. Full `npm test` (browser closed, load < 1.5) and `npm run build`.
- [ ] **Step 2:** Merge `ai-bands` into `master` with `--no-ff`; verify the merged tree (build + the round's tests); delete
  the branch.
- [ ] **Step 3: Live, paid** (dev server, stored-band readouts through `migrateDocument` → `flatDocument`):
  - Generate "a plywood bookcase with oak edging": front edges of sides, shelves and top banded `Oak edging`; no band on
    an edge that meets a part; one minted type.
  - Generate "a painted plywood wall cabinet": veneer on exposed front edges.
  - Refine `Live — edged bookcase` "make it 6 inches taller": nothing minted, every band and type identical.
  - Refine that Generate result "remove the edging from the shelves": the change list reads `Shelf …: edging on the front
    edge removed`.
- [ ] **Step 4:** ASK the user before deploying. On approval: deploy per `DEPLOYMENT.local.md`, verify as the last
  rounds did (in-network and edge 200s, sha256 = dist, old bundle 404, CSP, new strings in the edge bundle, a real-browser
  load with 0 errors, production storage empty before and after), record it.
