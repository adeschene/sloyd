# Parametric Resize (Stretch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With an assembly or 2+ items selected, the user types a new overall size on one world axis and places a stretch line.
Stretch then moves everything past the line by the difference, and lengthens every part crossing it, with features following
their side of the line. It is exact, one undo entry, and refuses with a sentence whenever something can't follow.

**Architecture:**
- **`src/document/stretchPart.ts` (pure)** stretches ONE world part at a part-local station. It reuses each feature kind's existing
  rebase helper per side. Rectangular cuts get a new `stretchCut` in `cuts.ts`.
- **`src/document/stretch.ts` (pure)** is the ONE planner, `stretchPlan`. It walks the tree top-down (stay / move whole / span →
  descend or stretch), builds the after-document, and checks the copies-and-links post-conditions. The panel's preview and the store
  action both call it.
- **Copy** lives in `src/document/stretchText.ts`.
- **The store** gets `stretchItems` (one `edit()` with the plan's document, then `judgeHeld`) and the view state `stretchGuide`.
- **The panel** gets `src/panels/StretchSection.tsx`, in `InstanceProperties` and `GroupProperties`. The viewport draws the guide
  plane.

**Tech Stack:** TypeScript, React, Zustand, react-three-fiber, Vitest (`npx vitest run <file>`), `npm run build` (the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-28-sloyd-parametric-resize-design.md` (APPROVED 2026-10-28). The spec wins over this plan.
Work on branch `stretch` from `master`, and merge locally with `--no-ff`.

## Global Constraints

- **No schema change.** Nothing new stored. `CURRENT_VERSION` stays 29. No load-path change.
- **Exact (inv 25):**
  - `δ = size − (max_k − min_k)` is computed ONCE.
  - Every move adds `δ`, and every grown dimension is `was + δ`.
  - No `snapToGrid`, no `moveGroupTo`, no rounding, in imperial or metric.
  - `|δ| ≤ 1e-9` is a no-op: `stretchPlan` returns `null`, and there is no edit and no undo entry.
- **The line `s`** is a WORLD coordinate on axis `k`, and must satisfy `min_k + 1e-9 < s < max_k − 1e-9` over the items' extent.
  The panel shows and takes it as `s − min_k` (from the left / bottom / back).
- **Extents** come from `itemExtents` (`align.ts`) for items, and `partsBounds` over `worldParts` filtered by `isCovered` for any node
  path. They are leaned boxes (inv 57 R2).
- **Node classification** on axis `k` against `s`:
  - `max ≤ s + 1e-9`: stays.
  - `min ≥ s − 1e-9`: moves.
  - Else it spans.
  - With `δ < 0`, a SPANNING part must also satisfy `max ≥ s + |δ| − 1e-9`, else `tooShort`.
- **Feature bands, part-local on `d`:**
  - Let `u` be the line's part-local station along `d`. With `far = endFacing(b, k, 1)` and `w0` the part's world min on `k`
    (`partBounds`), `u = s − w0` when `far === 'max'`, else `u = b[d] − (s − w0)`.
  - **Grow:** the band is `[u, u]`.
  - **Shrink:** the band is `[u, u + |δ|]` when `far === 'max'`, else `[u − |δ|, u]`. That is the removed wood, in part terms.
  - A feature is **near** (on the fixed side) when it is wholly on the side of the band away from `far`, **far** when it is wholly
    beyond the band toward `far`, and **crossing** otherwise. Tolerance 1e-9.
- **The per-side rule:** NEAR features keep their distance to the fixed end, and FAR features keep their distance to the moving end.
  With the existing helpers (each takes `(b, d, end, amount)` and shifts the numbers measured FROM `end` by `amount`):
  - NEAR: call `rebaseX(tmp, d, far, δ)`;
  - FAR: call `rebaseX(tmp, d, opposite(far), δ)`.

  `tmp` is the part with only that one feature in its list. One feature at a time, results collected in the original order.
- **Copy (exact, all in `stretchText.ts`).** `<len>` is `formatLength(|δ|, units)`, and `<part>` / `<assembly>` are the node's own
  name (`partAt(...).name` / `instanceAt(...).name`).
  - `STRETCH_HEADING = 'Overall size'`.
  - Field labels: `Width (X)`, `Height (Y)`, `Depth (Z)`, and `Stretch at`.
  - The `from` words: `from the left`, `from the bottom`, `from the back`.
  - Buttons: `Middle`, `Stretch`, `Cancel`.
  - Refusals:
    - `The stretch line must be inside the selection.`
    - `The size must be more than 0.`
    - `<part> would get thicker — the line runs through its thickness; move the line.`
    - `<part> leans, so it can't be stretched — move the line off it.`
    - `<part> has a compound end cut, so it can't be stretched — move the line off it.`
    - `<part>'s <word> crosses the stretch line — move the line.`, where `<word>` is `hole row`, `curve`, `round tenon`, `profile`,
      `cut`, or an angle cut's `kind` (`taper`, `miter`, `bevel`, `chamfer`).
    - `<part> has box joints across the stretch line — move the line.`
    - `<part> has dovetails across the stretch line — move the line.`
    - `<part>'s round tenon is centred on its section, so it can't be stretched across it — move the line off it.`
    - `<part> has curves and profiles, so it can't be stretched — move the line off it.`
    - `<part> is too short to shrink by <len> at this line.`
    - `<assembly> has copies this stretch would change differently — Make Unique first.`
    - `<part> is linked to <other part>, which this stretch changes differently — Unlink first.`
  - Preview: `<from> → <to>: grows <names> · moves <n> · <m> stay`. Here `<from>` and `<to>` are `formatLength` of the old and new
    extent. `<names>` is the grown parts' names, the first 4 joined by `, `, then ` +N` when there are more; with none, `grows
    nothing`.
- **Refusal order** in `stretchPlan`:
  1. size;
  2. line;
  3. no-op;
  4. the walk, in tree order. For each spanning part: thickness, lean, compound, tooShort, then features in `Board` field order
     (cuts, angleCuts, holes, curves, profiles, tenons, dovetails and finger sets). The first refusal wins;
  5. the copies post-condition;
  6. the links post-condition.
- Before each commit, `git status` must show only this task's files.

## Review Focus

1. **A turned or mirrored part** (rotation 90/180, a mirrored placement) must stretch on its WORLD side. The far feature follows the
   world +k end even when that is the part's min end (Task 2: the `far === 'min'` tests).
2. **A mortise stored from the max end on a raised leg** must stay put when it is near the fixed end, and one stored from the min end
   must move when it is far. A test stores each both ways (Task 2).
3. **Two copies of a definition both spanning but placed differently** (one turned 180°) must refuse unless the lowered results agree
   (Task 3).
4. **Shrink back:** widen by 6, then shrink by 6 at the same line, gives the original numbers to 1e-9 (Task 3).
5. **The preview and the button agree.** The panel never shows a preview for a plan the action would refuse, because both call
   `stretchPlan` with the same inputs (Task 5).

---

### Task 1: `stretchCut` — rectangular cuts

**Files:**
- Modify: `src/document/cuts.ts` (beside `cutRegion`)
- Test: `src/document/stretchCut.test.ts`

**Interfaces:**
- Produces: `stretchCut(b: Board, c: Cut, d: Dimension, band: [number, number], far: CutFrom, delta: number): Cut | 'crosses'`. It
  returns `c` itself (same object) when no number changes.

- [ ] **Step 1: Write the failing tests** on a 20 × 6 × 0.75 part, `d = 'length'`, `far = 'max'`, grow `δ = 4`, band `[10, 10]`.
  Every expectation is by hand.
  - **Position axis is `d`** (`face: 'thickness', across: 'width'`):
    - offset 2, width 1: near, the same object;
    - offset 15, width 1: far, offset 19;
    - offset 9, width 2: crosses, width 6, offset 9.
  - **`across === d`** (`face: 'thickness', across: 'length'`):
    - stopMin 0, stopMax 0 (a full groove): crosses, unchanged numbers, the same object;
    - stopMin 12, stopMax 2: far, stopMin 16, stopMax 2;
    - stopMin 1, stopMax 13: near, stopMax 17.
  - **`face === d`** (into an end):
    - `from: 'max'`, depth 1.5: far, the same object;
    - `from: 'min'`, depth 1.5: near, the same object;
    - `from: 'max'`, depth 12: crosses, depth 16.
  - **`far === 'min'`** (a reversed part, band `[10, 10]` in part terms): the part's local MAX end is the fixed one.
    - Offset 15, width 1 is NEAR (on the fixed max side), so it keeps its distance to the max end: offset 19.
    - Offset 2 is FAR (by the moving min end), so it is unchanged: the same object.
    - Write that derivation in the test's comment.
  - **Shrink** `δ = −4`, band `[10, 14]`:
    - offset 15, width 1: far, offset 11;
    - offset 9, width 6 (covers the band): crosses, width 2;
    - offset 11, width 1 (inside the band): `'crosses'` refused. Return `'crosses'` for any shrink-crossing cut that does not cover
      the whole band.
- [ ] **Step 2: Run** `npx vitest run src/document/stretchCut.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - The span on `d` is `cutRegion(b, c)[d]`.
  - A crossing cut changes its one length on `d`:
    - `width` when `positionAxisOf(c.face, c.across) === d`;
    - nothing when `across === d` (its stops are end-measured, and the board grows);
    - `depth` when `face === d`.
  - A near/far cut shifts the numbers measured from the relevant end: `offset` is measured from min; `stopMin` / `stopMax` from their
    ends; `depth` from `from`.
  - One addition per number.
- [ ] **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Mutate.** Swap near and far: the reversed-part test must fail. Revert.
- [ ] **Step 6: Commit** `feat(stretch): stretchCut — a rectangular cut across a stretch line`.

### Task 2: `stretchPart` — one part, every field

**Files:**
- Create: `src/document/stretchPart.ts`, `src/document/stretchText.ts` (the refusal sentences only; the panel words come in Task 5)
- Test: `src/document/stretchPart.test.ts`

**Interfaces:**
- Consumes: `stretchCut` (Task 1).
  - `rebaseAngleCuts`, `rebaseCurves`, `rebaseProfiles` (`resizeEnd.ts`) and `rebaseHoles` (`holeRebase.ts`).
  - Span readers: `touchedRegion` (`angleCuts.ts`), `holeInstances` + `holeRegion` (`holes.ts`), `curveOutline` + `uvDims`
    (`curves.ts`), `endPos` + `runDim` (`profiles.ts`), `tenonZone` (`roundTenons.ts`), `dovetailZones` (`dovetails.ts`),
    `fingerSets` (`boxJoints.ts`).
  - `leans`, `hasCompoundCut`, `axisDimensions`, `endFacing`, `partBounds`.
- Produces: `stretchPart(b: Board, k: 0 | 1 | 2, s: number, delta: number, units: Units): Board | { refused: string }`. Its input is a
  WORLD part from `worldParts`. On success it returns a new object with `[d] = b[d] + delta`, `position` unchanged, and the feature
  lists re-stored; untouched entries keep their objects.
- Produces (`stretchText.ts`): one function per refusal in Global Constraints, e.g. `thicker(part)`, `leansText(part)`,
  `crosses(part, word)`, `tooShort(part, len)`, `copiesDiffer(assembly)`, `linkDiffers(part, other)`.

- [ ] **Step 1: Write the failing tests.** Use plain parts (`createBoard`) placed at a known world min. Every expectation is by hand.
  - **Plain:** a 30-long rail along X at x 0, `s = 10`, `δ = 6` gives `length` 36, the same `position`, and every list the same
    object.
  - **Refusals:**
    - thickness on `k`: `thicker`;
    - `lean` set: `leansText`;
    - a compound end cut: the compound sentence;
    - shrink with the part's max < `s + |δ|`: `tooShort` with `formatLength`.
  - **Holes:**
    - a row at station 3 (near) is the same object;
    - a row at station 25 `alongFrom: 'min'` (far) gets station 31;
    - a row with stations spanning 8–14: `crosses(…, 'hole row')`;
    - a row bored into the max end face (`face: 'length'`): the same object.
  - **Angle cuts:**
    - an end miter at the max end gets its points shifted per `rebaseAngleCuts(…, 'min', 6)`. Assert the shifted numbers by hand;
    - a full-length taper: `crosses(…, 'taper')`.
  - **Curves:**
    - an arch wholly past the line is shifted;
    - one spanning it: `crosses(…, 'curve')`;
    - a curve `through === d`: crosses.
  - **Profiles:**
    - a stopped run with both stations near: unchanged;
    - one with its end station far (`from: 'min'`): `at + 6`;
    - a `loop` and `through` ends: unchanged.
    - On shrink, a station inside the band: `crosses(…, 'profile')`.
    - A part with curves AND profiles spanning: the curves-and-profiles sentence.
  - **Round tenons** (`d = 'length'`):
    - tenons on both ends with the line between: the same tenons object;
    - the line inside a tenon's zone: `crosses(…, 'round tenon')`;
    - a tenoned part spanning on its WIDTH: the centred sentence.
  - **Dovetails / box joints:**
    - the line outside every zone on `dim`: passes, and the finger notches (rect cuts) at the far end follow (`stretchCut` far);
    - the line in a zone: the box-joints / dovetails sentence;
    - `d` is J: the same sentence.
  - **Turned and mirrored:** `chiralPart('flat')` with rotation 180, so `far === 'min'`. Every near/far feature lands where the
    hand computation in WORLD says: compare `partGeometry` / `cutRegion` world spans before and after. Near spans are identical, and
    far spans are shifted by exactly `δ` on `k`.
- [ ] **Step 2: Run** `npx vitest run src/document/stretchPart.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** per Global Constraints:
  - `d = axisDimensions(b)[k]`, `far = endFacing(b, k, 1)`, and the band as defined there;
  - refusals in the stated order;
  - then each list mapped with the per-side rule. Cuts go through `stretchCut`, and a `'crosses'` becomes `crosses(…, 'cut')`.
  - A feature kind with no rebase (bands, hardware, tenons on length, dovetails) is unchanged once it passes its check.
- [ ] **Step 4: Run.** Expect PASS. Then run `npx vitest run src/document` to check nothing else broke.
- [ ] **Step 5: Mutate:**
  - Use `rebaseX(…, far, δ)` for FAR features too (`resizeEnd`'s rule): the far-hole and far-miter tests must fail;
  - drop the thickness refusal: its test must fail;
  - revert both.
- [ ] **Step 6: Commit** `feat(stretch): stretchPart — one part stretched at a line, features follow or refuse`.

### Task 3: `stretchPlan` — the walk, the document, the post-conditions

**Files:**
- Create: `src/document/stretch.ts`
- Test: `src/document/stretch.test.ts`, with fixtures in `src/document/stretchFixtures.ts` (TEST-ONLY; add it to CLAUDE.md's
  test-only list in Task 7):
  - `apronTable()`: four 1.75-square legs 28.5 tall, two long aprons along X and two short ones along Z, mortised into the legs, and
    a top;
  - `framedTable()`: the same, with the two end frames (two legs and a short apron) as two placements of ONE definition, the right
    one mirrored.

**Interfaces:**
- Consumes: `stretchPart` (Task 2), `itemExtents`, `childrenOf`, `worldParts`, `partsBounds`, `isCovered`, `instanceAt`, `partAt`,
  `placementsOf`, `translateItems`, `writeBackParts`, `storageKey`, `stretchText.ts`.
- Produces:
  ```ts
  interface StretchPlan {
    axis: 0 | 1 | 2; line: number; delta: number; from: number; to: number;
    doc: SloydDocument;                 // the after-document
    grows: string[];                    // world-part occurrence ids grown
    moves: string[];                    // node paths moved whole
    stays: string[];                    // node paths left
  }
  function stretchPlan(doc: SloydDocument, ids: readonly string[], axis: 0 | 1 | 2, size: number, line: number):
    StretchPlan | { refused: string } | null;
  ```

- [ ] **Step 1: Write the failing tests.** Every number is by hand off the fixture's inputs.
  - **Widen the apron table on X:** size `+6` at the middle.
    - Top and both long aprons grow 6.
    - Both right legs and the right short apron move `+6` on X; the legs' mortises are unchanged in part terms (they moved with the
      leg).
    - The left legs and the left short apron are unchanged (the same stored objects).
    - Each long apron's far-end mortise or tenon cut is shifted 6.
    - `grows` / `moves` / `stays` list exactly those.
  - **Raise it on Y by 2 at the middle:** the legs grow 2, and the aprons and top move up 2. Each leg's apron mortises, near the top
    and therefore far, are shifted 2 in part terms. One leg has its mortise stored from min and another from max, and both land 2
    higher in world.
  - **Shrink:** widen 6, then shrink 6 at the same world line. Every number in the document is equal to the original within 1e-9
    (walk `worldParts` and compare).
  - **Copies:**
    - `framedTable` widened on X: each frame moves or stays as a PLACEMENT, and the definition is the same object;
    - deepened on Z: both frames span and agree, so the definition is written once;
    - one frame's placement turned 180° and stretched where the lowered results differ: `copiesDiffer('End frame')`;
    - a definition with a placement outside the selection, edited inside: `copiesDiffer`.
  - **Links:**
    - two linked aprons both grown 6: one Shape still holds both (`shapes.length` unchanged, both `shape` keys equal);
    - one linked apron grown while its mate (unselected) is not: `linkDiffers('Front apron', 'Back apron')`.
  - **Stretcher base** (`stoolDocument()` with `addStretcher` applied through the store helper the stretcher tests use) widened on
    X: every rung grows, and every tenon is still `seatedIn` after.
  - **Line and size:**
    - the line on the extent's face: the line refusal;
    - size 0: the size refusal;
    - `|δ| ≤ 1e-9`: `null`.
  - **No mutation:** a refused plan leaves `doc` the same object.
- [ ] **Step 2: Run** `npx vitest run src/document/stretch.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement `stretchPlan`:**
  1. Size, line and no-op checks off `itemExtents(doc, ids)` merged.
  2. **The walk:** for each item path, classify it.
     - A staying node goes to `stays`.
     - A moving node goes to `moves`, and its path is collected for ONE `translateItems(…, paths, along(k, δ))`.
     - **Dedupe the moved paths by storage target first.** For a part that is `storageKey`; for an instance it is the id of the
       definition holding it plus its own id. Two placements of one definition both spanning would otherwise send `i1/b` and
       `i2/b`, and `translateItems` would shift the definition's part TWICE. Add a test: `framedTable` deepened on Z with an inner
       part that moves (one frame's front leg past the line) must move it exactly `δ` once.
     - A spanning instance recurses over `childrenOf(doc, path)`.
     - A spanning part calls `stretchPart` on its world part. The first refusal returns.
  3. **The after-document:**
     - `writeBackParts(doc, grown.map(({ before, after }) => ({ before, after })))`, for keepWorld (inv 46);
     - then `translateItems` with the moved paths.
     - The two touch disjoint subtrees, because a moved node is never inside a spanning one.
  4. **The copies post-condition:**
     - Recompute `worldParts(after)`. Every occurrence must equal its EXPECTED world part:
       - a grown one equals its `stretchPart` result;
       - one under a moved node equals `before` with `position[k] + δ`;
       - every other one equals `before`.
     - Compare with `nearlyEqual(a, b, 1e-9)`: a deep compare over plain values. Numbers within 1e-9, everything else `===`;
       ignore the top-level `shape` and `mirrored` keys.
     - The first mismatch names the nearest ancestor placement whose definition has `placementsOf(doc).get(def) ≥ 2`, as
       `copiesDiffer`.
     - With no such ancestor and a shaped part, go on to step 5. Otherwise throw (a bug).
  5. **The links post-condition:** cornerPlan's own check (`cornerPlan.ts:424-435`), over `doc.shapes` against `after`. The first
     split gives `linkDiffers(first user, the first user in another group)`.
- [ ] **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Mutate:**
  - Skip step 4: the outside-copy test must fail;
  - skip step 5: the unselected-mate test must fail;
  - move placements by per-part write-back instead of `translateItems`: the widened `framedTable` "definition is the same object"
    test must fail;
  - revert all three.
- [ ] **Step 6: Commit** `feat(stretch): stretchPlan — the ONE planner (walk, write-back, copies and links)`.

### Task 4: The store — `stretchItems` and `stretchGuide`

**Files:**
- Modify: `src/store/store.ts`:
  - the interface beside `distributeItems`;
  - the implementation beside it;
  - `stretchGuide` beside `xray`;
  - its clears in `replaceDocument`'s reset, in `selectionPatch`'s result, and in `setExplode` when going above 0.
- Test: `src/store/store.stretch.test.ts` (reset state as `store.align.test.ts` does)

**Interfaces:**
- Consumes: `stretchPlan` (Task 3).
- Produces:
  - `stretchItems(axis: 0 | 1 | 2, size: number, line: number): string | null`. It returns the refusal, or null when it applied or was
    a no-op. It refuses at entry, returning null and writing nothing, while `readOnly()` or `gesturing`, or with no items.
  - `stretchGuide: { axis: 0 | 1 | 2; at: number } | null`, with `at` a world coordinate, and `setStretchGuide(g)`.
  - The guide is view state: never in `doc`, undo or autosave.

- [ ] **Step 1: Write the failing tests:**
  - **Widen the apron table** (select the root items): one new `past` entry, positions and sizes as Task 3's hand values. Undo
    restores them exactly (`toEqual`).
  - **A refusal:** the sentence is returned, no `past` entry, `doc` the same object.
  - **A no-op size:** no entry.
  - **Exploded:** returns null and writes nothing.
  - **Metric:** an off-grid result stays off-grid, exactly.
  - **Held points:** a `tapeAnchor` on a moved leg is cleared; one on a left leg is kept.
  - **The guide:** `setStretchGuide` then `selectBoard(null)` clears it; `setExplode(0.5)` clears it; undo does not touch it.
- [ ] **Step 2: Run** `npx vitest run src/store/store.stretch.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement:**
  - refuse at entry;
  - `const plan = stretchPlan(get().doc, get().selectedIds, axis, size, line)`;
  - `null` → return null; a refusal → return its sentence;
  - else `edit(() => plan.doc)`, `judgeHeld()`, `set({ stretchGuide: null })`, and return null.
- [ ] **Step 4: Run.** Expect PASS. Run `npx vitest run src/store`.
- [ ] **Step 5: Commit** `feat(stretch): the store — stretchItems and the stretch guide`.

### Task 5: The panel — `StretchSection`

**Files:**
- Create: `src/panels/StretchSection.tsx`, `src/panels/StretchSection.test.tsx`
- Modify:
  - `src/panels/Properties.tsx`: `<EditLock><StretchSection /></EditLock>` after `AlignSection` in `GroupProperties`, and after
    Orientation in `InstanceProperties`;
  - `src/document/stretchText.ts`: the panel words and `previewText`;
  - `src/styles.css`: a `.stretch-section` reusing the `.field-grid` look.

**Interfaces:**
- Consumes: `stretchItems`, `setStretchGuide`, `stretchPlan`, `itemExtents`, `parseLength`, `formatLength`.
- Produces (`stretchText.ts`): `AXIS_LABEL: Record<0 | 1 | 2, string>`, `FROM_WORD: Record<0 | 1 | 2, string>`, and
  `previewText(plan: StretchPlan, names: string[], units: Units): string`.

- [ ] **Step 1: Write the failing tests:**
  - **Shown or hidden:** shown with one assembly selected (`InstanceProperties`) and with 2+ items; absent for one part.
  - **The three fields** show `formatLength` of the extent.
  - **Typing** a new width does nothing until Stretch: the `doc` is the same object after blur.
  - **Arming:** after typing, `Stretch at` shows the middle (`formatLength((max − min) / 2)`) with `from the left`, and
    `stretchGuide` is `{ axis: 0, at: min + half }`. Typing in Height re-arms to Y.
  - **The preview** reads `previewText`'s exact string, e.g. for the apron table `48" → 54": grows Top, Front apron, Back apron ·
    moves 3 · 3 stay` (two right legs and the right short apron move; two left legs and the left short apron stay). Derive the counts from the fixture in the test.
  - **A refusal** (a line through a hole row) shows as `role="status"` with the sentence, and Stretch is disabled.
  - **Stretch** applies, then clears the armed state and the guide. **Cancel** restores the fields and clears the guide.
  - **`[Middle]`** resets the line.
  - **Exploded:** the controls are disabled.
- [ ] **Step 2: Run.** Expect FAIL.
- [ ] **Step 3: Implement:**
  - Local state is `{ axis, sizeText, lineText } | null`.
  - The preview plan is `useMemo(() => stretchPlan(doc, selectedIds, axis, parsed size, min + parsed line))`, so the preview and
    the action agree (Review Focus 5).
  - The armed state is cleared when `selectedIds` changes.
  - Each field has an accessible label equal to its visible label.
- [ ] **Step 4: Run.** Expect PASS.
- [ ] **Step 5: Commit** `feat(stretch): the Overall size section`.

### Task 6: The viewport guide plane

**Files:**
- Modify: `src/viewport/Viewport.tsx`, adding a `StretchGuide` component beside the section plane's rendering.

**Interfaces:**
- Consumes: `stretchGuide`, and the selection's extent (`itemExtents` in a memo).

- [ ] **Step 1: Implement** a translucent plane mesh at `at` on `axis`.
  - It spans the extent's other two axes plus 1" on every side.
  - Use `depthWrite: false`, opacity about 0.25 in the accent colour, and `raycast` disabled, so it is never picked (inv 21's
    concern is the reverse; a guide must not steal clicks).
  - It renders only while `stretchGuide` is set.
  - There are no unit tests, by design (viewport).
- [ ] **Step 2:** `npm run build` passes.
- [ ] **Step 3: Commit** `feat(stretch): the stretch line drawn in the viewport`.

### Task 7: Docs, invariant 64, CLAUDE.md trim

**Files:**
- `docs/invariants.md`: write inv 64 in full;
- `CLAUDE.md`: trim to make room, then inv 64 condensed, and inv 25's list gains "stretch". Add `stretchFixtures.ts` to the test-only
  list, add a "stretch" row to the "Where things live" table, and add `stretchText.ts` to the `→ units` edge list;
- `docs/module-map.md`: `cuts.ts`' `stretchCut`, `stretchPart.ts`, `stretch.ts`, `stretchText.ts`, `stretchFixtures.ts`,
  `StretchSection.tsx`, and the store's new members;
- `docs/feature-gaps.md`: the Parametric resize row;
- `docs/follow-ups.md`: S1–S5 as new numbered entries (545 onward), plus anything the build finds.

- [ ] **Step 1: Inv 64, in full:**
  - **`stretch.ts` `stretchPlan` is the ONE stretch decider**, for both the preview and the action.
  - Nothing stored, and no schema change.
  - The min side is fixed, and everything past the line moves `+δ` exactly.
  - A placement wholly on one side moves as a placement.
  - A spanning part grows on `d` and never on its thickness.
  - Features follow their side by the per-side rule, through each kind's own rebase helper, or refuse.
  - Every refusal before `edit()`, and ONE undo entry.
  - Copies and links refuse; they are never split. Write-back is keepWorld.
  - **PROHIBITION: do not stretch a feature with `resizeEnd`'s rebase (it keeps far features in the world, which breaks every joint
    past the line), and do not let `writeBackParts` split a definition or a Shape silently.**
- [ ] **Step 2: Trim CLAUDE.md.** Move detail into `docs/` files, never rules, until the file stays under ~60KB after adding inv 64.
  Every PROHIBITION stays verbatim in both files. Check with `wc -c CLAUDE.md`.
- [ ] **Step 3: Commit** `docs(stretch): invariant 64, module map, gaps, follow-ups; CLAUDE.md trimmed`.

### Task 8: Final gate and browser verification

- [ ] **Step 1:** `npm test` is all green. Re-run quiet if a timing guard fails under load.
- [ ] **Step 2:** `npm run build` is clean.
- [ ] **Step 3: Dev server, in the user's Chrome** (claude-in-chrome; the browser memory has the tunnel). Write it up in
  `docs/browser-verification-stretch.md`:
  - Build the apron table from the UI.
  - Widen it 6", raise it 2", and shrink it back. After each, read the sizes and positions back from the store.
  - Screenshot the preview line and the guide plane.
  - Put the line through a hole row and show the refusal.
  - Undo each.
  - Leave the test projects in place.
- [ ] **Step 4:** whole-branch review, then merge `stretch` into `master` with `--no-ff`, verify the merged tree (`npm test`,
  `npm run build`), and delete the branch.
- [ ] **Step 5:** Deploy only on the user's go-ahead (DEPLOYMENT.local.md). Rollback is free: no schema change.
