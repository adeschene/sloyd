# Weight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every material has a density. The cut list prints each group's weight and the project's total, Properties prints
the selection's weight, and a custom material's density is typed in Materials & prices and stored on the material
(schema 28).

**Architecture:**
- **One new pure module, `src/document/weight.ts`**, is the ONE home of weight. It sums the volumes of `boardBodies` (read
  through `partGeometry`), splits solid edging out at its band's density, and returns pounds. It imports nothing from `units`.
- **Density is a catalog fact.** Built-ins carry a constant on `MATERIALS`, a custom material an optional
  `CustomMaterial.density`. Both reach readers only as `MaterialInfo.density` (inv 49).
- **Strings** are built in `units/quantity.ts` (`formatWeight`, `formatDensity`, `parseDensity`), `cutlist.ts` (the group and
  project lines) and `weight.ts`'s sentence helper. The `→ units` edge: `weight.ts` does NOT import `units`. The sentence
  helper lives in `cutlist.ts`, which already imports `units`, and Properties reuses it.

**Tech Stack:** TypeScript, React, Zustand, Vitest (`npx vitest run <file>`), `npm run build` (the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-28-sloyd-weight-design.md` (APPROVED 2026-10-28, option A). Read it first. It
wins over this plan, and any difference is reported. Work on branch `weight` (from `master`), and merge locally with
`--no-ff` (no PRs).

## Global Constraints

- **Schema 28.** `CURRENT_VERSION = 28` (`document.ts:243`). No migration step: an absent `density` means unweighed.
- **Byte-for-byte rules:**
  - A material without a density stores NO `density` key: never `null`, `0` or `undefined`. A document with no custom
    density saves byte for byte as before.
  - Every existing test passes UNCHANGED, with two exceptions, and each edited test is listed in the task report:
    - tests asserting the version number;
    - cut-list string assertions, which break by design on the new weight text. Update them to assert the old string with
      ONLY the weight text added, never by regenerating a snapshot.
- **Stored density** is lb/ft³. It is legal when finite, `> 0` and `<= DENSITY_MAX` (150). On load, a malformed density
  DROPS THE FIELD and KEEPS the material.
- **Built-in densities (lb/ft³):** pine 28, oak 44, maple 44, walnut 38, cherry 35, plywood 36, mdf 48.
- **Conversions:**
  - `LB_PER_KG = 1 / 0.45359237`;
  - `KG_M3_PER_LB_FT3 = 16.018463`;
  - one cubic foot is 1728 cubic inches.
- **Weight text** (`formatWeight(pounds, units)`):
  - imperial `lb`, metric `kg`;
  - one decimal when the value, rounded to one decimal, is under 10 (`6.2 lb`, `9.9 lb`); otherwise whole (`10 lb`,
    `47 lb`). 9.96 lb prints `10 lb`.
- **Density text** (`formatDensity(lbPerFt3, units)`):
  - imperial `44 lb/ft³` (whole; one decimal under 10);
  - metric `705 kg/m³` (whole).
  - `densityText` is the same number without the unit, which is what the dialog field shows.
- **Copy** (exact):
  - group subtotal suffix: `· 12 lb`, or `· no density`;
  - project line: `Weight: about 47 lb`;
  - partial project line: `Weight: about 40 lb, not counting Ash (no density)`. Labels are joined `A`, `A and B`,
    `A, B and C`, in catalog order;
  - all unweighed: `Weight: not known (Ash has no density)`, or `(Ash and Elm have no density)` for more than one;
  - Properties: label `Weight`, value `about 6.2 lb`, or `about 6.2 lb, not counting Ash`, or `not known`;
  - dialog field: label `Density (lb/ft³)` or `Density (kg/m³)`, placeholder `Unknown`;
  - dialog refusal: `Density must be a number more than 0 and at most <formatDensity(150, units)>, or left empty.`
- **Nothing else changes:**
  - geometry, every design check (`partMass` keeps its fast path), joinery, Refine, Repair and Generate;
  - Generate's schema and prompt text stay byte-identical (inv 49);
  - the cut list's rows, keys and numbers, and Buying.
- **Dev server:** no `localStorage.clear()`, and test projects stay in place. No paid runs are needed.
- Before each commit, `git status` must show only this task's files. Check `ps` for an orphaned `claude --continue`.

## Review Focus

1. **Assemblies placed twice, and mirrored instances:** each copy weighs once, so a mirrored copy weighs the same as its
   source (Task 3).
2. **A metric project:** kg in the cut list and Properties. A density typed as `705` kg/m³ reads back `705`, and an
   untouched field writes the stored value exactly (inv 5) (Tasks 1, 6).
3. **Edging of another species:** walnut on plywood. The walnut group's weight is non-zero, the plywood group excludes it,
   and the total equals the sum of the groups (Tasks 3, 4).
4. **A density-only edit** in Materials & prices is actually written. `sameMaterial` must compare it, or `upsertMaterials`
   skips it (Tasks 2, 6).
5. **A project with every part in one unweighed custom material:** `Weight: not known (…)`, never `about 0 lb` (Task 4).

---

### Task 1: Weight and density text (`units/quantity.ts`)

**Files:**
- Modify: `src/units/quantity.ts`
- Test: `src/units/quantity.test.ts` (extend, or create beside it)

**Interfaces:**
- Produces:
  - `formatWeight(pounds: number, units: Units): string`
  - `densityText(lbPerFt3: number, units: Units): string` (the bare number)
  - `formatDensity(lbPerFt3: number, units: Units): string`
  - `parseDensity(text: string, units: Units): number | null`. This returns lb/ft³. It gives `null` for empty text, and
    for anything that is not a plain decimal number `> 0` in the field's unit.
  - `DENSITY_UNIT(units): 'lb/ft³' | 'kg/m³'`
- Import `Units` and `isMetric` from `./length`. This is a sibling `units` file, not a layer edge.

- [ ] **Step 1: Write the failing tests.**
  - `formatWeight`:
    - `formatWeight(1.375, IMPERIAL)` → `'1.4 lb'`; `9.96` → `'10 lb'`; `47.3` → `'47 lb'`; `0.04` → `'0.0 lb'`;
    - metric: `formatWeight(22.0462, METRIC)` → `'10 kg'`; `2.2` → `'1.0 kg'`.
  - `formatDensity`:
    - `formatDensity(44, IMPERIAL)` → `'44 lb/ft³'`; `formatDensity(9.25, IMPERIAL)` → `'9.3 lb/ft³'`;
    - `formatDensity(44, METRIC)` → `'705 kg/m³'`.
  - `parseDensity`:
    - `parseDensity('705', METRIC)` → `705 / 16.018463`, and its `densityText` round-trips to `'705'`;
    - `parseDensity('44', IMPERIAL)` → `44`;
    - `''`, `'0'`, `'-3'`, `'abc'` and `'4 4'` → `null`.
  - Use the units fixtures `length.test.ts` already uses for imperial and metric.
- [ ] **Step 2: Run** `npx vitest run src/units/quantity.test.ts`. Expect FAIL (not exported).
- [ ] **Step 3: Implement** the five exports with the constants in Global Constraints.
- [ ] **Step 4: Run** the test again. Expect PASS.
- [ ] **Step 5: Commit** `feat(weight): weight and density text`.

### Task 2: Density on the material; schema 28

**Files:**
- Modify:
  - `src/document/types.ts`: `MATERIALS` entries gain `density: number`; `CustomMaterial` gains `density?: number`; export
    `DENSITY_MAX = 150`.
  - `src/document/materials.ts`:
    - `MaterialInfo.density?: number`;
    - `builtInInfo` / `customInfo` carry it;
    - `validateCustomMaterial` keeps a legal density on every kind and drops a malformed one, keeping the material;
    - `sameMaterial` compares `density` (absent ≡ absent).
  - `src/document/document.ts:243`: `CURRENT_VERSION = 28`.
  - `docs/versioning.md`: row 27→28. Copy the harm text from spec §3.4. Note that the browser library is not versioned.
- Test:
  - Create `src/document/document.v28.test.ts` (the `document.v27.test.ts` pattern).
  - Extend `src/document/materials.test.ts`.
  - Edit the version assertion in `document.v27.test.ts` (and any other `CURRENT_VERSION` pin) and list each one.

**Interfaces:**
- Produces:
  - `MaterialInfo.density?: number` (lb/ft³; always present for a built-in);
  - `CustomMaterial.density?: number`;
  - `DENSITY_MAX`.

- [ ] **Step 1: Write the failing tests.**
  - `document.v28.test.ts`:
    - `this build writes 28`.
    - A v27 document with a custom solid loads equal to the same at v28, and `JSON.stringify` contains no `density`.
    - A v28 material `{ …, density: 40 }` keeps `density: 40`. So does a veneered sheet with `density: 36`.
    - For each of `0, -1, NaN, Infinity, 151, '40', null`, the material is KEPT (the part is still on it, not pine) and has
      no `density` key.
    - A document at version 29 is refused (the existing newer-version pattern).
  - `materials.test.ts`:
    - `sameMaterial(a, { ...a, density: 40 })` is false;
    - `upsertMaterials` with a density-only change returns a NEW doc whose material has the density;
    - `catalogOf(doc).get('oak')!.density === 44`, and each built-in has its value from Global Constraints;
    - a custom material without a density gives `get(id)!.density === undefined`.
  - Generate identity: a test asserting that `Object.keys(MATERIALS)` and each label are unchanged, and that the design
    schema is byte-identical. Reuse `generated.test.ts`' existing schema pin. If none pins it, add one comparing
    `JSON.stringify(DESIGN_SCHEMA)` with a copy taken BEFORE this task's edit.
- [ ] **Step 2: Run** `npx vitest run src/document/document.v28.test.ts src/document/materials.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** the edits listed under Files. `validateCustomMaterial` stays a field-by-field rebuild and adds
  `density` only when legal.
- [ ] **Step 4: Run** those tests, then the full `npx vitest run src/document src/storage src/generate`. Expect PASS,
  except the version pins edited in Files.
- [ ] **Step 5: Mutate.**
  - Make `validateCustomMaterial` return null on a malformed density. The "material KEPT" test must fail.
  - Drop the density compare from `sameMaterial`. The upsert test must fail.
  - Revert both.
- [ ] **Step 6: Commit** `feat(weight): density on materials, schema 28`.

### Task 3: `weight.ts` — the wood and its weight

**Files:**
- Create: `src/document/weight.ts`
- Modify: `src/document/designCheck.ts` (`partMass` calls the shared tetrahedron helper; its fast path is untouched)
- Modify: `src/document/document.ts` re-exports, if that barrel is how panels import (it is: `Properties.tsx` imports from
  `'../document/document'`)
- Test: `src/document/weight.test.ts`

**Interfaces:**
- Consumes:
  - `partGeometry(board).bodies` (`Body { box: Region | null; faces: BodyFace[] }`);
  - `strips(part, types)` and `stripBoard(s)` (`banding.ts`);
  - `MaterialCatalog` / `catalogOf`;
  - `FlatDocument`.
- Produces:
  - `tetraSum(faces: readonly { verts: readonly (readonly number[])[] }[]): { v: number; m: [number, number, number] }`.
    This is the body-volume-and-moment loop moved VERBATIM out of `partMass`, with the same arithmetic in the same order.
    `partMass` then divides `m` by `v` as now.
  - `woodVolume(b: Board): number` (cubic inches). The sum over `partGeometry(b).bodies` is: a `box` body's product of
    spans, else `tetraSum(body.faces).v`.
  - `stripVolume(s: Strip): number` (the strip box's `length·width·thickness`).
  - `coreWeight(part, types, catalog): number | null`: pounds of the core,
    `(woodVolume(part) − Σ stripVolume(strips(part)))/1728 · density`. Null when the part's material has no density.
  - `stripWeight(s, catalog): number | null`, at the band type's material's density.
  - ```ts
    interface WeightSummary { pounds: number; unweighed: string[] }  // unweighed: material ids, catalog order (catalog.ids)
    ```
  - `weightOf(flat: FlatDocument): WeightSummary`: every part's core plus every strip.
  - `selectionWeight(flat: FlatDocument, partIds: ReadonlySet<string>): WeightSummary`: those parts' cores plus their own
    strips.
- A material is unweighed when `catalog.get(id)?.density === undefined`, which includes an unknown id.

- [ ] **Step 1: Write the failing tests** in `weight.test.ts`. Every expected number is computed by hand in the test, never
  by calling `weight.ts`.
  - **Hand number:** oak `0.75 × 6 × 24` → `weightOf` gives `0.75*6*24/1728*44` (1.375) to 1e-12.
  - **Partition** (spec §4.1). For each fixture, `woodVolume` equals an analytic value to 1e-6 relative:
    - a dado (box − `w·d·width`);
    - a rabbet;
    - a notch;
    - a taper (a frustum or prism, by hand);
    - an end miter (box − triangular prism);
    - an arch curve (box − circular segment area × thickness);
    - a roundover profile (box − `(1 − π/4)·r²·run`);
    - a round tenon (shoulder box + `π r² ·length`);
    - a through dovetail pair and a half-blind pair, built with the fixtures in `dovetailFixtures.ts`. The test sums by
      hand each part's blank minus its sockets (from `dovetailLayout`'s bounds and the slope).
  - **Banding:**
    - a plywood shelf with solid walnut edging on one long side;
    - `coreWeight` is `(finishedVolume − strip box)·36/1728`;
    - `stripWeight` is `strip box·38/1728`;
    - core volume + strip volume equals `woodVolume(finished part)` exactly (`toBe`).
  - **Copies:**
    - an assembly placed twice weighs twice one copy;
    - a mirrored instance weighs the same as its source to 1e-12;
    - a hidden part is counted.
  - **Unweighed:**
    - a custom solid with no density lands in `unweighed` and adds nothing to `pounds`;
    - with `density: 40` it is counted.
  - **Lean:** a leaning leg's `woodVolume` equals the same leg unleaned to 1e-9.
  - **`partMass` identity:** for the Shaker table and the stool fixtures, `partMass` returns the SAME numbers (`toBe`) as
    before. Record them before the refactor.
- [ ] **Step 2: Run** `npx vitest run src/document/weight.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - Move the loop into `tetraSum` first, run `designCheck` tests and the `partMass` identity test, and only then add the
    rest.
  - Memoise `woodVolume` on the `PartGeometry` object (a `WeakMap<PartGeometry, number>`). It is already keyed by
    `geometryKey` (inv 15/50: never a hand-written field list).
- [ ] **Step 4: Run** `npx vitest run src/document`. Expect PASS.
- [ ] **Step 5: Mutate.**
  - Count the first body twice in `woodVolume`. The partition tests must fail.
  - Drop the strip subtraction from `coreWeight`. The banding identity must fail.
  - Revert both.
- [ ] **Step 6: Commit** `feat(weight): weight.ts — the wood the model keeps, edging at its own density`.

### Task 4: The cut list

**Files:**
- Modify:
  - `src/document/cutlist.ts`;
  - `src/panels/CutList.tsx` (the subtotal paragraph at ~`:181`, and a new line after the groups, before Hardware);
  - `src/styles.css` (`.cutlist-weight`, `.cutlist-weight-total`, matching `.cutlist-stock` and `.cutlist-buying-total`).
- Test: `src/document/cutlist.test.ts`, `src/document/cutlistBands.test.ts`, `src/panels/CutList.test.tsx`, and the
  identity guards that pin cut-list strings (`CutList.dovetailIdentity.test.tsx`, `bandFreeIdentity.test.ts`,
  `hardwareFreeIdentity.test.ts`; grep for `cutlist-subtotal` and `.stock` assertions).

**Interfaces:**
- Consumes: Task 3's `coreWeight` and `stripWeight`; Task 1's `formatWeight`.
- Produces:
  - `CutListGroup.pounds: number | null` (null when the group's material is unweighed) and `CutListGroup.weight: string`
    (`· 12 lb` / `· no density`);
  - `CutList.weight: string | null` (the project line; null when the document has no parts);
  - `CutList.pounds: number`;
  - `weightSentence(s: WeightSummary, catalog, units): string`, the Properties value (`about 6.2 lb`, `…, not counting
    Ash`, `not known`), exported for Task 5.

- [ ] **Step 1: Write the failing tests.**
  - On a two-group oak and pine fixture, each group's `weight` reads `· <formatWeight(hand pounds)>`. `CutList.weight` is
    `Weight: about <n> lb`, and `pounds` equals the sum of the groups' `pounds` (`toBe`).
  - On the walnut-edged shelf, the walnut strip group's `pounds > 0`, the plywood group's `pounds` excludes the strip, and
    the total equals the sum.
  - With an Ash custom material (no density) beside oak:
    - the Ash group reads `· no density`;
    - the project line reads `Weight: about <n> lb, not counting Ash (no density)`.
  - With every part in Ash: `Weight: not known (Ash has no density)`. With Ash and Elm: `(Ash and Elm have no density)`.
  - A metric project prints `kg`.
  - `CutList.test.tsx`: the subtotal renders `group.stock` then `group.weight`, and the project line renders once.
- [ ] **Step 2: Run** the new tests. Expect FAIL.
- [ ] **Step 3: Implement.**
  - In `visit`, add to `group.pounds` in the same statement block as `stockInches`. A part visit adds `coreWeight(board)`,
    a strip visit `stripWeight(s)`, so `visit` needs the strip: pass it as an optional argument.
  - A null contribution sets the group to null. A group is one material, so it is all-or-nothing.
  - Format in the finishing loop beside `group.stock`.
  - Build the project line from the groups. The unweighed labels are the null groups' materials, distinct, in catalog
    order.
- [ ] **Step 4: Update the identity and string tests** so each asserts the OLD text plus ONLY the weight text. Run
  `npx vitest run src/document src/panels`. Expect PASS. List every edited test in the report.
- [ ] **Step 5: Mutate.**
  - Weigh strips at the part's density. The edging test must fail.
  - Make an unweighed group contribute 0 without nulling. The partial-line test must fail.
  - Revert both.
- [ ] **Step 6: Commit** `feat(weight): the cut list's group weights and project line`.

### Task 5: Properties — the selection's weight

**Files:**
- Modify: `src/panels/Properties.tsx`
- Test: `src/panels/Properties.test.tsx`

**Interfaces:**
- Consumes: `selectionWeight` (Task 3), `weightSentence` (Task 4), `flatDocument`, `worldParts`.

- [ ] **Step 1: Write the failing tests.**
  - One selected oak part shows `Weight` `about 1.4 lb`.
  - Two parts selected show their sum.
  - A selected assembly shows the sum of its parts. These are the world parts whose id equals the selected path or starts
    with `path + '/'`.
  - A part in Ash (no density) shows `not known`.
  - An Ash part and an oak part show `about 1.4 lb, not counting Ash`.
- [ ] **Step 2: Run** `npx vitest run src/panels/Properties.test.tsx`. Expect FAIL.
- [ ] **Step 3: Implement** a `SelectionWeight` component, rendered in the single-part, group and instance branches
  (read-only, one line, `aria-label="Weight"`).
  - It reads `doc` and `selectedIds` and computes inside `useMemo`.
  - **Never return an array from a selector** (inv 43, inv 55's crash): the selector returns the doc and the ids, and the
    memo builds the id set.
- [ ] **Step 4: Run** the test. Expect PASS.
- [ ] **Step 5: Commit** `feat(weight): the selection's weight in Properties`.

### Task 6: Materials & prices — the Density field

**Files:**
- Modify:
  - `src/panels/materialsDraft.ts`: `DefDraft.density: string`; `toDraft`, `fromDraft`, `rowRefusal`, `rowNotes`,
    `initialRows` and `planSave` take `units: Units`;
  - `src/panels/MaterialDefinition.tsx`: a `Density` field on every kind, after the kind or nominal or sheet fields;
  - `src/panels/MaterialsDialog.tsx`: pass `doc.units`, and show each BUILT-IN material's density read-only beside its
    buying fields (`Density 44 lb/ft³`).
- Test: `src/panels/materialsDraft.test.ts`, `src/panels/MaterialsDialog.test.tsx`

**Note:** this goes past the dialog's ruling P1 ("stock and sheet sizes … stay imperial"), and spec §5.3 wins:
density follows the project's units. P1 still governs the sizes. Report this in the task report.

- [ ] **Step 1: Write the failing tests.**
  - Drafts:
    - A stored `density: 44` drafts as `'44'` (imperial) and `'705'` (metric).
    - An UNTOUCHED field gives `fromDraft(...).density === stored` EXACTLY (inv 5), including a stored `44.123`.
    - A typed `'40'` gives `40`, and an emptied field gives no `density` key.
    - `'0'`, `'abc'` and `'151'` refuse with the copy in Global Constraints (with `2403 kg/m³` in metric).
    - A density-only edit makes `planSave`'s `project` carry the new density.
  - Dialog:
    - the field shows with the unit label;
    - the built-in rows show `Density 44 lb/ft³` for oak;
    - Save writes the density into the project and, with Add to library, the library.
- [ ] **Step 2: Run** them. Expect FAIL.
- [ ] **Step 3: Implement.** The untouched rule is `text === densityText(stored, units) ? stored : parseDensity(text, units)`.
- [ ] **Step 4: Run** `npx vitest run src/panels`. Expect PASS. Then run `npm run build`.
- [ ] **Step 5: Mutate.** Drop the untouched-keep branch. The exact-keep test must fail on `44.123`. Revert.
- [ ] **Step 6: Commit** `feat(weight): the Density field in Materials & prices`.

### Task 7: Performance check

- [ ] **Step 1: Time `buildCutList`** on the Shaker table and the stool fixtures, before (on `master`) and after (median of
  20, quiet machine). Record the times in the task report.
- [ ] **Step 2:** If the cut list is more than 10% slower, look at the memo before going on. Perf guards are lowered only,
  never raised (inv 50).
- [ ] **Step 3: Run** the full `npx vitest run` and `npm run build`. Record the test count.

### Task 8: Records

**Files:**
- `docs/invariants.md`: new **inv 63** in FULL (spec §8), and inv 49's density sentence.
- `CLAUDE.md`:
  - inv 63 condensed;
  - inv 49's addition;
  - Versioning's `CURRENT_VERSION` 28;
  - the Where-things-live row `weight | weight.ts (inv 63)`;
  - the `→ units` paragraph: `weight.ts` does not import `units`;
  - the test count;
  - the Status block, after the deploy.
- `docs/module-map.md`: `weight.ts`, and the `quantity.ts` additions.
- `docs/versioning.md`: from Task 2.
- `docs/follow-ups.md`: new entries for:
  - hardware weight;
  - holes subtracted from weight;
  - weight on the Plans sheet;
  - density in the tip check;
  - the copy review of the weight strings (owed to the user).
- `docs/feature-gaps.md`: the Weight row.
- `docs/rounds.md`: a row, the rollback line (past this round refuses schema 28; export first).
- `docs/history.md`.
- The spec's *Amended (build)* block, if anything changed.

- [ ] **Step 1: Write them.** Keep CLAUDE.md under ~60KB.
- [ ] **Step 2: Commit** `docs(weight): invariant 63, versioning, module map, follow-ups`.

### Task 9: Browser verification (dev server, Playwright; the user can watch)

**File:** `docs/browser-verification-weight.md`

- [ ] **Step 1:** Open a new test project on the dev server: an oak table (top, four legs, aprons) and a plywood shelf
  edged in walnut. Read back the cut list's subtotals and project line (DOM readout), and check the numbers by hand.
- [ ] **Step 2:** Select the top, then a leg and the top, and read Properties' Weight line.
- [ ] **Step 3:** Add a custom `Ash` with no density, and put a part on it. Read the partial line. Type a density, Save,
  and confirm the line completes.
- [ ] **Step 4:** Switch the project to metric, and read kg and kg/m³.
- [ ] **Step 5:** Leave the test project in place (dev profile rule). Commit `docs(weight): browser verification`.

Deployment follows `DEPLOYMENT.local.md` after merge, verified by bundle hash and CSP, and `localStorage` is cleared on the
verifying production browser.
