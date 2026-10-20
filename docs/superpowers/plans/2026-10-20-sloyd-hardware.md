# Hardware bill of materials (schema 20) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Projects name their hardware (per-project types with a pack size and a price per pack); parts, assemblies and
the project carry counts that multiply with copies; the cut list gets a Hardware section and Buying a priced Hardware
block.

**Architecture:**
- Stored: `doc.hardwareTypes`, and `hardware: HardwareUse[]` on `Board`/`Shape` (SHARED in `LINK_FIELDS`), on
  `Definition`, and on the document (the root container). `Container` gains `hardware`, so the root and a definition are
  read and written alike.
- Two document modules: `hardwareModel.ts` (types-level helpers: field table, copy/compare/canonical order, presets,
  `withHardwareTypes`) and `hardware.ts` (THE counter: totals, where-used, used-by, placements; numbers and plain words,
  no `units`).
- No geometry anywhere: bodies, drawings, viewport, nesting are untouched.

**Tech Stack:** TypeScript, React, Zustand, Vitest. `npm test` does NOT typecheck; `npm run build` (`tsc -b && vite
build`) is the typecheck gate — run it at the end of every task.

**Spec:** `docs/superpowers/specs/2026-10-20-sloyd-hardware-design.md` (approved by the user 2026-10-20). Read all of it
before Task 1, and the task's own sections again before each task. Its *Amended (builder check)* blocks are part of it.

## Amended (planning)

For the user's review; copied into the spec as an *Amended (planning)* block in Task 10.
- **P1 — Ungroup is REFUSED when a merged count would exceed `HARDWARE_COUNT_MAX` (999).** Spec §6 merges the dissolved
  assembly's hardware into its parent's by adding counts; a sum above the loader's bound would be DROPPED on the next load
  (silent loss). `ungroupItem` returns null for it, like its other refusals. Reachable only with counts in the hundreds.
- **P2 — `hardwareRefusal` takes the STORED document**, not the flat one: `flatDocument` empties `definitions`, so an
  assembly's hardware is invisible from it.

## Global Constraints

- `CURRENT_VERSION` becomes **20**. A v19 build refuses a v20 document (the existing newer-version gate).
- **Byte for byte:** a document with no hardware types and no hardware entries gives exactly today's cut list, Buying,
  drawings and meshes. `buildPurchase`'s `totalLabel` and tail are unchanged when no hardware is counted.
- `HARDWARE_COUNT_MAX = 999` (an entry's count, whole, 1..999); `PACK_SIZE_MAX = 10000` (a type's pack size, whole,
  1..10000). Fields REFUSE out-of-range input, never clamp (DimensionField's rule, inv 5).
- Canonical entry order: ascending `type` id by plain string comparison (`a.type < b.type`); at most one entry per type
  per holder.
- `hardware.ts` and `hardwareModel.ts` import only `document` modules — never `units` (inv 52's edge rule; nothing they
  produce carries a length).
- Every store action: refused while exploded (`readOnly()`), ONE undo entry, and NO entry when nothing changes (inv 4:
  return the same object).
- Prices are US dollars per pack in the DOCUMENT; `formatMoney` renders them; unpriced is `null`.
- Exact copy (spec): `Project hardware`; `+ Add hardware ▾`; `Already added`; `New hardware type…`; `Remove`; `Counted
  once per copy: <n> in all.`; `Used by N — remove it from them first.`; `+ Add hardware type ▾` presets `Hinge` (1),
  `Drawer slides (pair)` (1), `Pull` (1), `Knob` (1), `Screw` (100), `Shelf pin` (20), `Dowel` (50), `Other` (1); the Refine
  refusal `Refine doesn't handle hardware on parts yet (<names>). Refine before adding hardware, or remove it first.`
- Never commit a key; never clear the dev browser profile (CLAUDE.md's deployment rule).

## Review Focus

The inputs the spec implies but its examples do not exercise, most likely to bite first; each has a test in its owning
task:
1. **Ungrouping one copy of a SHARED assembly** (its definition also placed elsewhere): totals must be unchanged and the
   other copy keeps its hardware (Task 3, `ungroup keeps totals for a shared definition`).
2. **A mirrored copy** (Copy mirrored) is counted like any copy, and Make Unique on it keeps its hardware (Task 3,
   `mirrored copy and make unique keep hardware`).
3. **Typed counts** `0`, `2.5`, `-1`, `1000`, `1e3` and empty are refused with the field's own error, focus kept, nothing
   written (Task 7, `count refusals`).
4. **Deleting a type used only by an assembly or the project** (no part uses it) is refused with the placed-holder count
   (Task 8, `delete refused for assembly and project use`).
5. **Refine on a project whose only hardware is project-level** is allowed and the refined project keeps the types and
   the project's entries (Task 9, `refine carries project hardware`).

---

### Task 1: Types and `hardwareModel.ts`

**Files:**
- Modify: `src/document/types.ts` (new interfaces; `Board`, `Definition`, `SloydDocument` fields)
- Modify: `src/document/tree.ts:7` (`Container` gains `hardware`), `src/document/treeEdit.ts:19-28` (`updateContainer`
  reads and writes `hardware`)
- Modify: `src/document/links.ts` (`LINK_FIELDS.hardware: 'shared'`; `sharedOf`; `sameShared`; `_sharedPrimitives`'
  exclusion list), `src/document/shapes.ts:36`, `src/document/treeEdit.ts` (the `k === 'bands'` branches at ~348, ~354,
  ~507)
- Modify: `src/document/document.ts` (`createBoard` → `hardware: []`; `createDocument` → `hardwareTypes: [], hardware: []`)
- Create: `src/document/hardwareModel.ts`
- Test: `src/document/hardwareModel.test.ts`

**Interfaces:**
- Produces (types.ts): `interface HardwareType { id: string; name: string; packSize: number; pricePerPack: number | null }`;
  `interface HardwareUse { type: string; count: number }`; `Board.hardware: HardwareUse[]`; `Definition.hardware:
  HardwareUse[]`; `SloydDocument.hardwareTypes: HardwareType[]`; `SloydDocument.hardware: HardwareUse[]`; `Container`
  `{ boards; instances; hardware: HardwareUse[] }`.
- Produces (hardwareModel.ts):
  - `HARDWARE_COUNT_MAX = 999`, `PACK_SIZE_MAX = 10000`
  - `HARDWARE_FIELDS = { type: true, count: true } as const satisfies Record<keyof HardwareUse, true>` (inv 40)
  - `copyHardwareUse(u: HardwareUse): HardwareUse`
  - `sameHardware(a: readonly HardwareUse[], b: readonly HardwareUse[]): boolean` — in order, every `HARDWARE_FIELDS` key exact
  - `canonicalHardware(uses: readonly HardwareUse[]): HardwareUse[]` — first entry per type wins, then sorted by `type`
  - `withHardwareUse(uses: readonly HardwareUse[], type: string, count: number | null): HardwareUse[]` — set (or, `null`,
    remove) one type's entry, canonical
  - `mergeHardware(a: readonly HardwareUse[], b: readonly HardwareUse[]): HardwareUse[] | null` — counts added per type,
    canonical; `null` when any sum exceeds `HARDWARE_COUNT_MAX` (P1)
  - `HARDWARE_PRESETS: readonly { name: string; packSize: number }[]` — the eight presets, in the Global Constraints order
  - `sameHardwareType(a: HardwareType, b: HardwareType): boolean`
  - `withHardwareTypes<T extends { hardwareTypes: HardwareType[] }>(doc: T, next: readonly HardwareType[] | undefined): T`
    — returns `doc` itself when `next` is undefined or equal element-wise (the `withBandTypes` pattern, `bandModel.ts:76`)

- [ ] **Step 1: Write the failing tests** in `hardwareModel.test.ts`:
  - `canonicalHardware` on `[{type:'b',count:2},{type:'a',count:1},{type:'b',count:5}]` → `[{type:'a',count:1},{type:'b',count:2}]`.
  - `withHardwareUse([], 'x', 3)` → `[{type:'x',count:3}]`; `withHardwareUse([{type:'x',count:3}], 'x', null)` → `[]`.
  - `mergeHardware([{type:'a',count:2}], [{type:'a',count:3},{type:'b',count:1}])` → `[{type:'a',count:5},{type:'b',count:1}]`;
    `mergeHardware([{type:'a',count:500}], [{type:'a',count:500}])` → `null`; `[{type:'a',count:499}]+[{type:'a',count:500}]` → 999.
  - `sameHardware` false when one count differs; false when the order differs; true for equal canonical lists.
  - `withHardwareTypes(doc, undefined) === doc`; `withHardwareTypes(doc, [...doc.hardwareTypes].map(t => ({...t}))) === doc`;
    a changed price returns a new object.
  - `sameShared(a, b)` (links.ts) is false for two `createBoard()`s differing only in `hardware`.
  - **Mutate:** make `canonicalHardware` keep the LAST duplicate and `mergeHardware` use `>=` for its bound — the tests must fail.
- [ ] **Step 2: Run** `npx vitest run src/document/hardwareModel.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** the types and the module. Then run `npm run build` and fix every site tsc reports for the
  new required fields: test fixtures that build a `Board`, `Definition` or document literal get `hardware: []` /
  `hardwareTypes: []` (the bands round did the same); `updateContainer` passes `hardware` through; every
  `k === 'bands'` branch over `SHARED_KEYS` gets a `hardware` sibling (copy with `copyHardwareUse`, compare with
  `sameHardware`, the signature at `treeEdit.ts:~507` with `${type}:${count}` joined by `;`). The five hand-built
  Definitions (`treeEdit.ts` `copyDefinition`, `treeOps.ts` Group and Make Unique, `treeRepair.ts`, `generated.ts`) get
  `hardware: []` here so the build passes; Task 3 makes the three that must COPY (copyDefinition, Make Unique,
  treeRepair) do so.
- [ ] **Step 4: Run** `npx vitest run src/document/hardwareModel.test.ts src/document/links.test.ts` then `npm test` and
  `npm run build` — all green.
- [ ] **Step 5: Commit** `feat(hardware): types, LINK_FIELDS, hardwareModel helpers`.

### Task 2: Load (schema 20)

**Files:**
- Modify: `src/document/document.ts` (`CURRENT_VERSION = 20`; the version comment block at ~169 gains v20; a
  `validateHardwareTypes`; a `validateHardware`; `validateBoard`, `validateDefinitions`, `validateShapes` take the
  hardware id set; the document's own `hardware`)
- Modify: `docs/versioning.md` (the 19→20 row, per spec §2.3)
- Test: `src/document/hardwareLoad.test.ts`

**Interfaces:**
- Consumes: Task 1's types, `canonicalHardware`, `HARDWARE_COUNT_MAX`.
- Produces: `migrateDocument` returns documents whose every holder has a valid canonical `hardware` and whose
  `hardwareTypes` are valid.

- [ ] **Step 1: Write the failing tests** (`hardwareLoad.test.ts`), each through `migrateDocument` on raw JSON:
  - A v19 document with no hardware fields loads with `hardwareTypes: []`, `hardware: []` on the document, every part,
    shape and definition.
  - Types: dropped when name is `''` or not a string, `packSize` is `0`, `2.5`, `-1` or `'3'`, `pricePerPack` is `-1`,
    `NaN` or `'1'`; kept with `pricePerPack: null` when the key is absent; two types with id `h1` → the second re-minted;
    two named `Hinge` → deduped (the second renamed by `dedupeNames`).
  - Entries (on a part, a shape, a definition and the document alike): dropped when `count` is `0`, `1.5`, `1000`, or
    `type` is a number or names no type; a second entry for one type dropped (first wins: `[{h1,2},{h1,7}]` → `[{h1,2}]`);
    `[{h2,1},{h1,1}]` loads sorted `[{h1,1},{h2,1}]`.
  - **Order:** a definition's entries survive `repairTree` (Task 3 makes `treeRepair.ts` keep them — this test fails until
    then; mark it and re-run in Task 3).
  - A v21 document refuses with the existing newer-version `DocumentError`.
  - **Mutate:** validate entries BEFORE hardware types (the order rule) — the dangling-type test must fail.
- [ ] **Step 2: Run** `npx vitest run src/document/hardwareLoad.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** Order (spec §2.3): materials → band types → `validateHardwareTypes(d.hardwareTypes)` → parts,
  shapes, definitions (each `validateHardware(raw, hardwareIds)`) → `doc.hardware = validateHardware(d.hardware,
  hardwareIds)` → the existing `repairTree`/`pruneMaterials` tail. Duplicate ids via `takeId` (inv 33), names via
  `dedupeNames` — the `validateBandTypes` shape (`document.ts:636`) is the model. Write the v20 note in the version
  comment (harm: silent loss of every hardware type and entry, then autosaved).
- [ ] **Step 4: Run** the file, `npm test`, `npm run build` — green except the marked repairTree test.
- [ ] **Step 5: Commit** `feat(hardware): schema 20 load`.

### Task 3: The tree keeps hardware (copies, Ungroup, links, mirrors)

**Files:**
- Modify: `src/document/treeEdit.ts:543-551` (`copyDefinition` copies `hardware`), `src/document/treeOps.ts:328`
  (`makeUniqueItem` copies it), `src/document/treeRepair.ts:52` (keeps `inner.hardware`), `src/document/treeOps.ts:154`
  (Group: `hardware: []`), `src/document/generated.ts:375` (`hardware: []`), `src/document/treeOps.ts:177-224`
  (`ungroupItem` merges)
- Modify: every site that copies a part's arrays with `bands: b.bands.map(copyBand)` (`grep -rn "bands.map(copyBand)"
  src --include=*.ts`: `links.ts`, `treeOps.ts`, `shapes.ts`, `treeEdit.ts`, `store/store.ts` `copyBoard`) — add
  `hardware: b.hardware.map(copyHardwareUse)`
- Test: `src/document/hardwareTree.test.ts`

**Interfaces:**
- Consumes: `mergeHardware`, `copyHardwareUse`; `hardwareTotals` does not exist yet — the tests here compare a local
  helper `totalsByType(doc): Map<string, number>` written in the test file from `worldParts` + `placementsOf` +
  `doc.hardware` (Task 4's module later replaces it; keep the helper, it is an independent oracle).
- Produces: `ungroupItem` returns null when `mergeHardware` returns null (P1).

- [ ] **Step 1: Write the failing tests** (`hardwareTree.test.ts`), fixtures built with `createDocument`, `createBoard`
  and the tree ops (`groupItems`, `ungroupItem`, `makeUniqueItem`, the store's `duplicateBoards`/`copyMirrored` where a
  store is needed — `useStore.setState` on a fresh doc, as `store.test.ts` does):
  - `ungroup moves hardware to the root`: an assembly with `[{h1,3}]` on its definition and a part inside with `[{h1,2}]`;
    after `ungroupItem` the root's `hardware` is `[{h1,3}]` and totals are unchanged.
  - `ungroup into a definition merges`: a nested assembly inside an outer one whose definition already has `[{h1,1}]`;
    after ungrouping the inner one the outer definition holds `[{h1,1+inner}]`; totals unchanged.
  - `ungroup keeps totals for a shared definition`: definition D placed by two instances; ungroup ONE; the other instance
    still names D with its hardware; totals unchanged.
  - `ungroup refuses an overflowing merge`: root `[{h1,600}]`, assembly `[{h1,600}]` → `ungroupItem` returns null.
  - `mirrored copy and make unique keep hardware`: Copy mirrored on an assembly with hardware → totals double; Make
    Unique on the copy → the new definition's `hardware` equals the old one's (a new array, `!==`); totals unchanged.
  - `split copy keeps hardware`: a definition placed twice whose two copies receive different cuts through
    `writeBackFlat` (the `splitAssemblies` path — the existing split test in `treeEdit.test.ts` is the fixture model) →
    both definitions carry the hardware; totals unchanged.
  - `repairTree keeps definition hardware` (re-run Task 2's marked test).
  - `group starts empty`: `groupItems` → the new definition's `hardware` is `[]`; parts keep theirs.
  - `duplicate and copy in a row copy part hardware` (store): totals scale by the copy count.
  - `mirror leaves hardware untouched`: `chiralPart` (the existing fixture) with `[{h1,2}]`, placed through a mirrored
    instance, every mirror; `placeBoard` result's `hardware` deep-equals the stored one; lower∘place = identity (the
    existing equivariance test's pattern).
  - `link gives the first part's hardware` (store `linkBoards`): two parts, `[{h1,4}]` and `[]` → both `[{h1,4}]`.
  - **Mutate:** drop the copy in `copyDefinition`; drop the merge in `ungroupItem` — named tests must fail.
- [ ] **Step 2: Run** `npx vitest run src/document/hardwareTree.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** `ungroupItem`: compute `mergeHardware(c.hardware, def.hardware)` before building; null →
  return null; the `updateContainer` callback returns `{ boards, instances, hardware: merged }`. The definition itself is
  untouched (its other placements keep it; `pruneDefinitions` drops it when unplaced).
- [ ] **Step 4: Run** the file, `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(hardware): tree ops keep hardware; ungroup merges into the parent`.

### Task 4: `hardware.ts` — THE counter

**Files:**
- Create: `src/document/hardware.ts`
- Test: `src/document/hardware.test.ts`

**Interfaces:**
- Consumes: `worldParts`, `placementsOf`, `flatDocument` names, `containerAt`, `definitionAt`.
- Produces:
  - `type HardwareTarget = { kind: 'part'; id: string } | { kind: 'assembly'; path: string } | { kind: 'project' }`
    (part `id` is the occurrence path the store and Properties use)
  - `interface HardwareUseLine { holder: string; each: number; times: number }`
  - `interface HardwareTotal { type: HardwareType; total: number; uses: readonly HardwareUseLine[] }`
  - `hardwareTotals(doc: SloydDocument): readonly HardwareTotal[]` — memoised on the document object (a `WeakMap`),
    deep-frozen; types with total 0 omitted; `doc.hardwareTypes` order
  - `hardwareUsedBy(doc: SloydDocument, typeId: string): number` — placed holders using the type
  - `holderPlacements(doc: SloydDocument, target: HardwareTarget): number` — 1 for the project; the placements of the
    part's container (or of the assembly's definition)
  - `holderHardware(doc: SloydDocument, target: HardwareTarget): readonly HardwareUse[]` — the stored list (a shaped
    part's from its Shape, via `resolveBoard`)
  - `hardwareUseText(t: HardwareTotal): string` — spec §4.1: uses `<holder>: <each>` with ` × <times>` when `times > 1`,
    joined by `; `
- Rules (spec §3, *Amended (builder check)*): one use line per STORED holder; parts from every container, each with
  `times` = its container's placements (root 1); assemblies (definitions) with `times` = `placementsOf(def)`; the project
  `{ holder: 'Project', times: 1 }`. Holder names: a part's — the `flatDocument` name of its FIRST occurrence in
  `worldParts` order; an assembly's — its first instance's path name (the same `›` join `flatDocument` uses); `total` =
  Σ each × times. Hidden parts count; `explode` is not read.

- [ ] **Step 1: Write the failing tests:**
  - Root part `[{h1,2}]` → total 2, uses `[{holder:'Door', each:2, times:1}]`, text `Door: 2`.
  - The part inside an assembly placed twice → total 4, one use `{ holder: 'Base cabinet › Left door', each: 2, times: 2 }`,
    text `Base cabinet › Left door: 2 × 2`.
  - Assembly `[{h2,3}]` placed twice inside an outer assembly placed twice → 12 (`times: 4`).
  - Project `[{h1,40}]` and an assembly `[{h1,40}]` placed twice → 120, text `Base cabinet: 40 × 2; Project: 40`.
  - Two shelves sharing a Shape with `[{h3,4}]` → two use lines, total 8.
  - Hidden parts count by construction: hidden-ness is store view state (inv 43) and `hardwareTotals` takes only the
    document — assert in `CutList.test.tsx` (Task 6) that hiding a part leaves the section's totals unchanged.
  - A type with no uses is omitted; types follow `doc.hardwareTypes` order, not use order.
  - `hardwareUsedBy`: a type on one part placed twice, one assembly placed once and the project → 4.
  - `holderPlacements` for each target kind; `holderHardware` of a shaped part reads the Shape.
  - `hardwareTotals(doc) === hardwareTotals(doc)` (memo) and `Object.isFrozen` on a total and its `uses`.
  - Agreement: `hardwareTotals` matches Task 3's `totalsByType` oracle on every Task 3 fixture (import nothing from the
    test file — copy the oracle; never import a test module).
  - **Mutate:** use `times: 1` for definitions; skip the project list; count a definition's parts once — tests must fail.
- [ ] **Step 2: Run** `npx vitest run src/document/hardware.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(hardware): hardware.ts counts totals, where-used and used-by`.

### Task 5: Store actions

**Files:**
- Modify: `src/store/store.ts` (a `setHardware` action; `applyMaterials` gains `hardwareTypes`)
- Test: `src/store/hardware.store.test.ts`

**Interfaces:**
- Consumes: `HardwareTarget`, `withHardwareUse`, `withHardwareTypes`.
- Produces:
  - `setHardware: (target: HardwareTarget, type: string, count: number | null) => void` — `null` removes. Part: through
    `oneEditPerTarget` + `mapWorld` (a shaped part's edit lands on its Shape, `applyWorldEdits`, as `setBands` at
    `store.ts:1779`); assembly: the definition `definitionAt(doc, path)` names; project: `doc.hardware`. Refuses: exploded,
    a `type` naming no hardware type, a count outside 1..`HARDWARE_COUNT_MAX` or not whole. No change → no edit.
  - `applyMaterials: (upserts, assign?, bandTypes?, hardwareTypes?: HardwareType[]) => void` — `withHardwareTypes` in the
    same `edit()` as band types (one undo entry); the `kept.length > 0 || bandTypes !== undefined` gate also opens for
    `hardwareTypes !== undefined`, and the `assign` path passes it through `updateBoards` (add a fifth parameter there).
- [ ] **Step 1: Write the failing tests:** one undo entry per `setHardware` (assert `undo` restores the previous doc,
  never a flag — inv 34); a no-op set writes no entry (`past.length` unchanged); a shaped part's set changes every user;
  an assembly set changes `definitions[i].hardware`; project set; refused while `explode > 0` (doc `===`); refused for an
  unknown type and for counts `0`, `1000`, `2.5`; `applyMaterials([], undefined, undefined, [type])` adds the type in one
  entry and an identical list adds none.
- [ ] **Step 2: Run** `npx vitest run src/store/hardware.store.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(hardware): setHardware and hardware types through applyMaterials`.

### Task 6: The cut list's Hardware section and Buying's Hardware block

**Files:**
- Modify: `src/document/purchase.ts` (`buildPurchase` gains a 4th parameter; `Purchase.hardware`; `unpricedTail`)
- Modify: `src/panels/CutList.tsx` (the section after the material groups; the Buying block after Edge banding; the
  Buying section shows when `purchase.hardware` is non-null too)
- Modify: `src/styles.css` (`.cutlist-hardware` table, surface ROLES only — `styles.css`' rule)
- Test: `src/document/purchaseHardware.test.ts`, `src/panels/CutList.test.tsx` (new cases), and a byte-identity guard
  `src/document/hardwareFreeIdentity.test.ts`

**Interfaces:**
- Consumes: `hardwareTotals`, `hardwareUseText`.
- Produces: `buildPurchase(doc: FlatDocument, list: CutList, shop: ShopSettings, hardware: readonly HardwareTotal[] = [])`;
  `Purchase.hardware: { lines: string[]; cost: number | null } | null` (null when `hardware` is empty).
- Lines (spec §4.2): pack size 1 → `<name>: buy <total> · <price>`; pack size > 1 → `<name>: <total>, buy <packs> pack<s>
  of <packSize> · <price>`, `packs = Math.ceil(total / packSize)`; `price` = `formatMoney(packs × pricePerPack)` or `no
  price`. The block's priced lines join `total`; the `amount` test (`'—'` when nothing is priced) also counts it.
- Tail: `unpricedTail(materials, bandTypes, hardware)`: one kind alone reads exactly as today
  (`(1 hardware item has no price)`, `(3 hardware items have no price)`); two or three kinds list with commas and `and`
  (`(2 materials, 1 band type and 3 hardware items have no price)`, `(1 material and 1 hardware item have no price)`).
- Cut list section: heading `Hardware`; one row per total: name, total, `hardwareUseText`. CutList calls
  `hardwareTotals(doc)` on the STORED doc it already holds (not `flat`: flat has no definitions) and passes it to
  `buildPurchase`.

- [ ] **Step 1: Write the failing tests:**
  - `purchaseHardware.test.ts`: 8 hinges, pack 1, $4.50 → `Euro hinge: buy 8 · $36.00`; 120 screws, pack 100, $6.99 →
    `…: 120, buy 2 packs of 100 · $13.98`; exactly 100 → `buy 1 pack of 100`; unpriced → `· no price`, excluded from the
    total; every tail combination above; a document with no hardware → `purchase.hardware === null` and `totalLabel`
    identical to `buildPurchase(flat, list, shop)` with three arguments.
  - `hardwareFreeIdentity.test.ts`: for the existing cut-list/Buying fixtures (`shakerTableFixture` and the fixtures
    `bandFreeIdentity.test.ts` hashes), the cut list and Buying output are deep-equal with and without the new parameter,
    and with hardware TYPES present but no entries.
  - `CutList.test.tsx`: the section renders `Hardware`, a row `Euro hinge, 35 mm` / `8` / `Base cabinet › Left door: 2 × 2;
    …`; absent with no hardware; the Buying block `Hardware` appears after `Edge banding`; the section is not numbered
    (no `rowNumbers` entry) and contributes no balloon (`planBalloons` untouched — assert its output unchanged on a
    fixture with hardware); hiding a part (store `hide`) leaves the section's totals unchanged.
  - **Mutate:** round packs with `Math.round`; drop the hardware cost from the total — tests must fail.
- [ ] **Step 2: Run** the three files — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files, `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(hardware): cut list Hardware section and Buying's Hardware block`.

### Task 7: Properties — the Hardware section

**Files:**
- Create: `src/panels/Hardware.tsx`
- Modify: `src/panels/CountField.tsx` (props `max?: number` default `HOLE_COUNT_MAX`, `invalid?: string` default today's
  words; hole callers unchanged)
- Modify: `src/panels/Properties.tsx` (single part after `<Banding … />` at ~724; `InstanceProperties` after its
  Orientation fields; the empty state at ~606 — the project, or the OPEN assembly when `openPath` is set; a new prop
  `onNewHardwareType: () => void` beside `onNewBandType`)
- Modify: `src/App.tsx` (passes `onNewHardwareType`; opens the dialog with `newHardware`, Task 8)
- Test: `src/panels/Hardware.test.tsx`

**Interfaces:**
- Consumes: `setHardware`, `holderHardware`, `holderPlacements`, `HardwareTarget`.
- Produces: `function Hardware({ target, heading, onNewHardwareType }: { target: HardwareTarget; heading: string;
  onNewHardwareType: () => void })`. Headings: `Hardware` (part, assembly), `Project hardware` (empty state at the root),
  `<assembly name> hardware` (empty state inside an open assembly).
- Behaviour (spec §5.1): no entries → only `+ Add hardware ▾` (the Popover pattern `Banding.tsx` uses); items: each type
  by name, one already on the holder greyed with `Already added`; then `New hardware type…`. With entries: one row each —
  the type's name, `CountField` (`max={HARDWARE_COUNT_MAX}`, `invalid="Enter a whole number, 1 to 999"`), `Remove`; then
  `+ Add hardware ▾`. Adding writes count 1 and focuses that row's count field. `Counted once per copy: <n> in all.` under
  the rows when `holderPlacements ≥ 2`, `n` = Σ counts × placements. Wrapped in `EditLock`. Selectors return primitives
  or stored arrays only (inv 43: never a freshly built array from a selector).

- [ ] **Step 1: Write the failing tests** (`Hardware.test.tsx`, Testing Library, the `Banding.test.tsx` setup):
  - Empty holder shows only `+ Add hardware ▾`; choosing `Hinge` adds `count: 1` and focuses the count field.
  - `count refusals`: typing `0`, `2.5`, `-1`, `1000`, `1e3` and empty then Enter → the field's error, focus kept, the
    store's doc unchanged (`===`).
  - `Remove` deletes the entry (one undo entry).
  - A type already on the holder is greyed `Already added` and not clickable.
  - `New hardware type…` calls `onNewHardwareType`.
  - Assembly placed twice with `[{h1,3}]` → `Counted once per copy: 6 in all.`
  - Empty state at the root edits `doc.hardware` under `Project hardware`; with `openPath` set it edits that assembly's
    definition under `<name> hardware`.
  - Exploded → the section's controls are disabled (inside `fieldset.edit-lock[disabled]`).
- [ ] **Step 2: Run** `npx vitest run src/panels/Hardware.test.tsx` — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, `npx vitest run src/panels/Properties.test.tsx src/panels/Holes.test.tsx` (CountField
  callers), `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(hardware): Properties Hardware section (part, assembly, project)`.

### Task 8: Materials & prices — the Hardware section

**Files:**
- Create: `src/panels/hardwareTypesDraft.ts` (the `bandTypesDraft.ts` pattern)
- Modify: `src/panels/MaterialsDialog.tsx` (the section after Edge banding; props; the plan's `hardwareTypes`)
- Modify: `src/App.tsx:1033-1066` (props; `onSave` passes `plan.hardwareTypes` to `applyMaterials`'s 4th parameter and
  counts it in `projectChanged`; `newHardware` state cleared on close)
- Test: `src/panels/hardwareTypesDraft.test.ts`, `src/panels/MaterialsDialog.test.tsx` (new cases)

**Interfaces:**
- Consumes: `HARDWARE_PRESETS`, `PACK_SIZE_MAX`, `hardwareUsedBy`.
- Produces (`hardwareTypesDraft.ts`): `interface HardwareRow { id: string; original: HardwareType | null; draft: Record<'name'
  | 'packSize' | 'pricePerPack', string>; deleted: boolean }`; `interface HardwareCtx { usedBy: (typeId: string) =>
  number }`; `initialHardwareRows(types)`; `newHardwareRow(preset: { name: string; packSize: number }, rows)` (names by
  the band rows' local free-name rule: `Hinge`, `Hinge 2`, …); `hardwareRowRefusal(r, rows, ctx): string | null`;
  `planHardwareTypes(rows, original, ctx): HardwareType[] | null | { refused: string }` (null = unchanged);
  `hardwareFieldValid(r, key)`; `rebaseHardwareRows(rows, types)`.
- Dialog props: `hardwareTypes?: HardwareType[]`, `hardwareUsedBy?: (id: string) => number`, `newHardware?: boolean`
  (opens with a new `Other` row, its name focused). App passes `hardwareUsedBy={(id) => hardwareUsedBy(doc, id)}` from
  the STORED doc.
- Rules (spec §5.2): name required, unique among rows, refused only when one side's name was TYPED (the band types'
  amended rule); pack size whole 1..`PACK_SIZE_MAX`; price empty → `null`, else a number ≥ 0 (the band types' price
  field); Delete refused `Used by N — remove it from them first.`; a new row's id from `nextId()`.

- [ ] **Step 1: Write the failing tests:** presets prefill name and pack size (`Screw` → 100, `Shelf pin` → 20,
  `Dowel` → 50); two `Hinge` presets name `Hinge`, `Hinge 2`; pack size `0`, `1.5`, `10001` refused; price `-1` refused,
  empty → `null`; `delete refused for assembly and project use` (a type used by one assembly placed twice and the project
  → `Used by 3 — remove it from them first.`); an unused type deletes; `planHardwareTypes` returns `null` for untouched
  rows; the dialog's one Save makes ONE undo entry carrying a band type edit and a hardware type edit together;
  `newHardware` opens with a focused name field; exploded (`locked`) disables the section.
- [ ] **Step 2: Run** the two files — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files, `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(hardware): Materials & prices Hardware section`.

### Task 9: Refine refuses part and assembly hardware; joinery and Repair keep it

**Files:**
- Create: `src/document/hardwareRefusal.ts`
- Modify: `src/document/refineDesign.ts:23` (`RefusalReason` gains `'hardware'`), `:81-82` (after the banded refusal)
- Modify: `src/generate/refine.ts:70-71` (after the banded refusal)
- Modify: `src/generate/run.ts:256`, `:286` (the refined document also takes `hardwareTypes: doc.hardwareTypes, hardware:
  doc.hardware`)
- Test: `src/document/hardwareRefusal.test.ts`, `src/generate/refine.test.ts` / `run.test.ts` (new cases), and
  `src/generate/joints/hardwareJoinery.test.ts`

**Interfaces:**
- Produces: `hardwareHolders(doc: SloydDocument): string[]` (flat part names whose hardware is non-empty, then assembly
  path names whose definition's is; the project never); `hardwareRefusal(doc: SloydDocument): string | null` — the exact
  copy in Global Constraints, names listed as `bandedRefusal` lists them (first three, `…`).

- [ ] **Step 1: Write the failing tests:**
  - `hardwareRefusal` null for no hardware and for project-only hardware; the message for a part, for an assembly.
  - Both Refine gates refuse with reason `'hardware'` before any paid call (assert the fake client's call count is 0, the
    existing refusal tests' pattern).
  - `refine carries project hardware`: a refine run (the existing fake-client fixture) on a project with types and
    `doc.hardware` → the result document has the same `hardwareTypes` and `hardware`, at both re-attach sites (plain and
    joined results).
  - `hardwareJoinery.test.ts`: Add joinery and Repair (the existing fixtures that produce a joint and a split copy) on a
    project with hardware on a plain part, a shaped part, an assembly placed twice and the project → `hardwareTotals`
    before deep-equals after, and every part's `hardware` is byte-identical (`JSON.stringify`).
  - **Mutate:** remove the `copyDefinition` copy from Task 3 — the joinery split test must fail.
- [ ] **Step 2: Run** the files — expect FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the files, `npm test`, `npm run build`.
- [ ] **Step 5: Commit** `feat(hardware): Refine refuses hardware on parts; carries types and project hardware`.

### Task 10: Live check and docs

**Files:**
- Create: `docs/browser-verification-hardware.md`
- Modify: `CLAUDE.md`, `docs/invariants.md`, `docs/versioning.md` (if not done in Task 2), `docs/module-map.md`,
  `docs/rounds.md`, `docs/follow-ups.md`, `docs/feature-gaps.md`, the spec (Status line; P1/P2 as an *Amended (planning)*
  block)

- [ ] **Step 1: Live pass on the DEV server** (`npm run dev -- --port <free port>`, the Playwright MCP; the user may
  watch). Leave test projects in place; never clear the profile. Build and record with a DOM readout:
  - a two-door cabinet: hinges ×2 and a pull on each door; Duplicate the cabinet → the cut list's Hardware totals double;
  - a drawer assembly with `Drawer slides (pair)` ×1, Copy in a row ×3 → 3 (or 6 with the cabinet doubled);
  - a shelf set sharing a Shape with `Shelf pin` ×4; project `Screw` ×40 with pack 100 and a price;
  - Ungroup the drawer → totals unchanged; Undo → back; the dialog's Save → one undo entry;
  - the printed cut list as a real Chromium PDF (`page.pdf()` through `run_code`): the Hardware section and Buying's block
    on the page.
- [ ] **Step 2: Docs.** `CLAUDE.md`: Versioning table row 19→20 (`hardwareTypes`, `hardware` on parts, shapes,
  definitions and the project; harm: every hardware type and entry dropped, then autosaved), `CURRENT_VERSION` 20 in the
  prose, Where-things-live row `hardware | hardwareModel.ts, hardware.ts (inv 55), hardwareRefusal.ts`, the document shape
  line gains `hardwareTypes, hardware`, the test count, and a condensed **inv 55**: *`hardware.ts` is the ONE place
  hardware is counted (a part per placement, an assembly per placement of its definition, the project once; hidden parts
  count). Hardware never groups the cut list, never touches geometry, and every Definition copy carries it (Ungroup
  merges it into the parent).* Write inv 55 in FULL in `docs/invariants.md`. `docs/module-map.md`: the new files.
  `docs/follow-ups.md`: 267's hardware half closed by this round; 332 closed (dowels as hardware types); new entries
  404– for spec §11's follow-ups and this round's review minors. `docs/feature-gaps.md`: Hardware row → this round; fix
  the stale Edge banding and Edge profiles rows. `docs/rounds.md`: the row and Status log entry. The Status block's
  production line and rollback table change only at deploy, which is the user's call.
- [ ] **Step 3: Run** `npm test` and `npm run build` one last time; record the test count.
- [ ] **Step 4: Commit** `docs: hardware BOM round — invariant 55, versioning 20, follow-ups, live check`.

Merge: `git merge --no-ff` to master, verify the merged tree (`npm test`, `npm run build`), delete the branch (CLAUDE.md's
working agreement — no pull request). Deploy waits for the user.
