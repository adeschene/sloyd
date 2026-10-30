# Selectable guides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select guide points and construction lines by click (viewport, Select tool; Guides list), emphasise them, delete them
with Delete/Backspace and hide them with H, as view state, with no schema change.

**Architecture:** Two new view-state fields in the store, `selectedGuideIds` and `hiddenGuideIds`, written only through the
existing ONE writers (`selectionPatch` for selection, inv 42; `applyHidden` for hidden-ness, inv 43). A part selection and a
guide selection exclude each other. One `visibleGuides` filter feeds every drawing and snapping reader. A pure screen-space
picker (`pickGuide` in `snapPick.ts`, sharing a factored `closestOnLine` with `pickOnLine`) decides the guide hit. A capture-phase
`click` listener on the canvas runs it before R3F's own click/miss handling and stops the event when a guide wins.

**Tech Stack:** TypeScript, React, Zustand, react-three-fiber/drei, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-30-sloyd-selectable-guides-design.md`. Read it whole; section numbers below are its.

## Global Constraints

- No schema change. `CURRENT_VERSION` stays 32; nothing new goes into `SloydDocument`, autosave or export.
- `selectionPatch` stays the ONE writer of a user's selection change (inv 42), now of both kinds; `applyHidden` stays the ONE
  writer of hidden-ness (inv 43), now of both sets.
- **PROHIBITION (inv 43, carried over): no guide hide or show may clear `tapeAnchor` or `tapeHover`.**
- Every window shortcut stays in `App`'s ONE keydown effect (inv 27).
- Never return `visibleGuides`' array from a Zustand selector; filter in a memo (inv 43's rule).
- `ConstructionLine` keeps `raycast={() => null}`; lines are never raycast targets.
- Viewport components get no unit tests (the repo's rule); `npm run build` is the typecheck gate; `npm test` must stay green
  (timing guards may flake under load: re-run quiet before calling a regression).
- Mutate every test justified by an ordering, a refusal or a filter (CLAUDE.md working agreements): break the code, see red,
  restore.
- Commit to the branch `selectable-guides` (create it from `master` before Task 1); merge with `--no-ff` at the end. No PRs.

## Review Focus

1. **A selection-clear inside the store that is not the user's.** `applyHidden`, `restore`, `edit()`'s selection callback and
   others call `selectionPatch([])`-shaped patches; if any of those wiped a guide selection, a guide would deselect when a part
   is hidden. Task 1 pins `applyHidden` with a guide selected.
2. **Undo of the edit that added a guide while it is selected**: the guide is gone, so the selection must drop it. Task 1 pins it.
3. **A part hide and a guide hide in one run, then Ctrl+Z**: both come back in one step. Task 2 pins it.
4. **A crossing of a hidden line with a shown line** still offered as a snap. Task 2 pins it through `visibleGuides` feeding
   `guideCandidates`.
5. **A line behind a part**: clicking where the part covers it must select the part. Task 3 pins the depth rule in
   `pickGuide`; Task 4's browser check confirms the wiring.

---

### Task 1: Guide selection in the store

**Files:**
- Modify: `src/store/store.ts` (state + `selectionPatch` + new actions + `restore`, `replaceDocument`, `setExplode`,
  `selectBoard`, `removeGuide`)
- Test: `src/store/store.guideSelection.test.ts` (new)

**Interfaces:**
- Produces (on `StoreState`):
  - `selectedGuideIds: string[]` — view state, insertion order, no duplicates; never saved, never undone.
  - `selectGuide(id: string, toggle: boolean): void`
  - `selectGuides(ids: string[]): void` — `[]` clears the guide selection only.
  - `removeGuides(ids: string[]): void` — ONE undo entry; `removeGuide(id)` becomes `removeGuides([id])`.
  - `selectBoard(null)` now clears BOTH kinds (the user's "select nothing"; `clearOnMiss` calls it).
- Internal: a guide form of the selection writer, beside `selectionPatch` in the same block, e.g.
  `guideSelectionPatch(ids: string[], hiddenGuides = get().hiddenGuideIds, guides = get().doc.guides)`, returning
  `{ selectedGuideIds }` plus, when non-empty, the full part-clearing patch `selectionPatch([])` produces. Its doc comment and
  `selectionPatch`'s say the PAIR is inv 42's ONE writer. `hiddenGuideIds` does not exist until Task 2: declare it in this task
  as `hiddenGuideIds: string[]` initialised `[]` with no writer yet, so the filter can be written once here.

- [ ] **Step 1: Write the failing tests** in `store.guideSelection.test.ts` (use the fixture style of `store.test.ts`; a
  document with two parts, a guide point `g1` and an axis line `g2`):
  - `selectGuide('g1', false)` → `selectedGuideIds` `['g1']`; then `selectGuide('g2', true)` → `['g1','g2']`; then
    `selectGuide('g1', true)` → `['g2']`.
  - with parts selected, `selectGuide('g1', true)` → `selectedIds` `[]`, `selectedGuideIds` `['g1']` (kinds never mix, spec §3.3).
  - with `['g1']` selected, `selectBoard(partId)` → `selectedGuideIds` `[]`; `selectAll()` → `[]` too.
  - with `['g1']` selected, `setHidden(partId, true)` (an empty part re-assertion through `applyHidden`) → still `['g1']`.
  - with `['g1']` selected and a part, `selectBoard(null)` → both empty.
  - `selectGuide('nope', false)` → `[]` (unknown id dropped).
  - with `['g1']` selected, `setExplode(0.5)` → `[]` (spec §7).
  - `addGuide([1, 2, 3])`, select it, `undo()` → `selectedGuideIds` `[]` (Review Focus 2); `redo()`
    leaves it `[]` (selection is never undone).
  - `replaceDocument(doc)` → `[]`.
  - `removeGuides(['g1','g2'])` → both gone, `past` grew by exactly ONE, `selectedGuideIds` `[]`; `undo()` restores both.
  - `removeGuides(['nope'])` → `past` unchanged (inv 4).
  - `removeGuides` while exploded → nothing changes.
  - `removeGuides(['g1'])` with `tapeAnchor` owned by `g1` → `tapeAnchor` `null` (inv 24, `dropHeldOwnedBy`); with an anchor
    owned by `g2` → kept.
  - `selectGuide('g1', false)` while a part is `grabbed` → `grabbed` `null` (it inherits `selectionPatch`'s retargeting rule).

- [ ] **Step 2: Run** `npx vitest run src/store/store.guideSelection.test.ts` — expected: FAIL (`selectGuide` is not a function).

- [ ] **Step 3: Implement.** In `selectionPatch`, when the resulting `selectedIds` is non-empty add `selectedGuideIds: []`;
  an empty result leaves it alone (spec §3.2). Audit all 15 `selectionPatch(` call sites and list in the commit message which
  pass a possibly-empty selection that is NOT a user clear (they must keep the guide selection) — `selectBoard(null)` is the only
  user clear and sets `selectedGuideIds: []` explicitly. `restore` and `edit()` also re-filter `selectedGuideIds` against the
  new document's guide ids (a guide removed by undo/edit drops). `replaceDocument` sets `[]`. `setExplode` with `next > 0` adds
  `selectedGuideIds: []`. `removeGuides`: `readOnly()` refusal, keep only known ids, return before `edit()` when none,
  `dropHeldOwnedBy` per id, one `edit()`.

- [ ] **Step 4: Run** the new file, then `npx vitest run src/store` — expected: PASS. Mutate: delete the `selectedGuideIds: []`
  in `selectionPatch`'s non-empty branch → the exclusivity test fails; make `selectionPatch` clear guides on an empty result →
  the `setHidden` test fails. Restore.

- [ ] **Step 5: Commit** `feat(guides): guide selection in the store (fu 591)`.

### Task 2: Hidden guides and the one visible filter

**Files:**
- Modify: `src/store/store.ts` (`HistoryEntry`, `applyHidden`, `restore`, `replaceDocument`, `showAll`, new actions,
  `removeGuides`/`clearGuides` reconcile)
- Modify: `src/store/visibility.ts` (add `visibleGuides`)
- Test: `src/store/store.guideHiding.test.ts` (new), `src/store/visibility.test.ts`

**Interfaces:**
- Consumes: Task 1's `hiddenGuideIds` field and guide selection writer.
- Produces:
  - `HistoryEntry` = `{ doc; hiddenIds; hiddenGuideIds: string[] }` (every constructor of an entry passes it).
  - `applyHidden(next: string[], nextGuides: string[] = get().hiddenGuideIds)` — ONE writer of both sets; one run, one entry;
    a run back at its start (both sets) drops its entry; guide ids filtered to existing guides; the guide selection loses
    hidden ids (through the guide selection writer).
  - `hideSelectedGuides(): void`, `hideOtherGuides(): void` (every guide not selected; no-op with nothing selected),
    `setGuideHidden(id: string, hidden: boolean): void`. `showAll()` → `applyHidden([], [])`.
  - `visibleGuides(guides: Guide[], hiddenGuideIds: readonly string[]): Guide[]` (mutable, because `guideCandidates` and `lineFaceCandidates` take `Guide[]`) in `visibility.ts` — the
    SAME array when nothing is hidden.

- [ ] **Step 1: Write the failing tests.**
  - `visibility.test.ts`: `visibleGuides(gs, [])` returns `gs` by identity; with `['g2']` it omits `g2` only. Feed its result
    for two crossing axis lines, one hidden, to `guideCandidates(…, SCENE_EXTENT)` (from `document`): no `cross` candidate;
    both shown: the crossing is there (Review Focus 4). Same for `lineFaceCandidates` with a line through a part: the hidden
    line offers nothing.
  - `store.guideHiding.test.ts`:
    - select `g1`, `hideSelectedGuides()` → `hiddenGuideIds` `['g1']`, `selectedGuideIds` `[]`, `past` +1, `doc` the SAME object.
    - `setHidden(part, true)` then `setGuideHidden('g2', true)` → `past` +1 in all (one run); `undo()` → both sets empty
      (Review Focus 3).
    - `setGuideHidden('g2', true)` then `setGuideHidden('g2', false)` → `past` back to its length before (inv 4).
    - `hideOtherGuides()` with `g1` selected → `['g2']`; with nothing selected → no change.
    - `showAll()` with a part and a guide hidden → both sets `[]`, one entry.
    - **Prohibition:** `tapeAnchor` and `tapeHover` owned by `g1`; `setGuideHidden('g1', true)` → both kept (`toBe` the same
      objects); `undo()` of that hide → both still kept.
    - `setGuideHidden` while `gesturing` → no change.
    - `removeGuides(['g1'])` with `g1` hidden → `hiddenGuideIds` `[]`; `undo()` → `['g1']` again (the entry's set);
      `clearGuides()` → `[]`; `replaceDocument` → `[]`.
    - `goToView(id)` → `hiddenGuideIds` unchanged (saved views are board-only, spec §3.4).
    - `saveView(...)` → the stored view has no guide ids (`hidden` holds part ids only).

- [ ] **Step 2: Run** both files — expected: FAIL.

- [ ] **Step 3: Implement** per the Interfaces. `restore` filters `entry.hiddenGuideIds` to the entry document's guides. Every
  other site that builds a `HistoryEntry` (`edit()`'s push, gestures, `editRekeyed`'s rewrite) carries `hiddenGuideIds` from
  state. `goToView` passes the current `hiddenGuideIds` through unchanged.

- [ ] **Step 4: Run** `npx vitest run src/store` — expected: PASS. Mutate: make `applyHidden` clear `tapeAnchor` → the
  prohibition test fails; make `visibleGuides` return `guides` always → the crossing test fails. Restore.

- [ ] **Step 5: Commit** `feat(guides): hidden guides through applyHidden; visibleGuides (fu 591)`.

### Task 3: The pure guide pick

**Files:**
- Modify: `src/viewport/snapPick.ts`
- Test: `src/viewport/snapPick.test.ts`

**Interfaces:**
- Produces:
  - `closestOnLine(line: AnyLine, ray: { origin: Vec3; dir: Vec3 }, extent: number): { t: number; at: Vec3 } | null` — the
    closest approach, `t` CLAMPED to the drawn extent (`±extent` on an axis line, `lineSpan` on an oblique one), `at` the
    UNROUNDED point; `null` for a ray parallel to the line or an oblique line missing the box. Both of `pickOnLine`'s branches
    call it and then round `t` exactly as today.
  - `pickGuide(guides: readonly Guide[], project: Projector, cursor: { x: number; y: number }, ray: { origin: Vec3; dir: Vec3 },
    radiusPx: number, extent: number, occluderDepth: number | null): string | null` — the picked guide's id. Points by
    projected distance (never occluded: markers draw `depthTest: false`); lines by the projected `closestOnLine` point, kept
    only when `occluderDepth === null || projected.depth <= occluderDepth + DEPTH_EPS`. Nearest on screen wins; ties go to the
    nearer depth; a point beats a line at an equal distance. `occluderDepth` is the NDC depth of the first part hit under the
    cursor (same `ProjectedPoint.depth` scale), computed by the caller. Export `DEPTH_EPS = 1e-6` with a one-line why
    (`projected.depth` and the caller's depth come from one projection; the epsilon only absorbs float noise).

- [ ] **Step 1: Write the failing tests** (use the existing orthographic test projector in `snapPick.test.ts`, or add
  `project = ([x, y, z]) => ({ x, y: -y, depth: -z })`-style with a ray straight down −Z):
  - every existing `pickOnLine` test passes unchanged (do not edit them).
  - `closestOnLine` on an X axis line at `(0, 5, 0)` with the ray from `(3, 0, 10)` along `(0, 0, -1)` → `t` 3,
    `at` `[3, 5, 0]`; past `extent` → `t` clamped to `extent`; a ray parallel to the line → `null`.
  - `pickGuide`: a point 5 px off → its id; 13 px off with radius 12 → `null`; an axis line 4 px off → its id; an oblique line
    4 px off → its id; a point and a line both 4 px off → the point; a line 4 px off with `occluderDepth` NEARER than the line's
    depth → `null` (Review Focus 5); the same with the occluder BEHIND → the line; a point with a nearer occluder → still the point.

- [ ] **Step 2: Run** `npx vitest run src/viewport/snapPick.test.ts` — expected: FAIL (not exported).

- [ ] **Step 3: Implement** per Interfaces; refactor `pickOnLine` onto `closestOnLine` without changing its results.

- [ ] **Step 4: Run** — expected: PASS. Mutate: drop the occluder check → the occluded-line test fails; swap the point/line
  tie rule → its test fails. Restore.

- [ ] **Step 5: Commit** `feat(guides): pickGuide, closestOnLine shared with pickOnLine (fu 591)`.

### Task 4: Viewport — filter, emphasis, the click

**Files:**
- Modify: `src/viewport/GuideMarkers.tsx`, `src/viewport/GuideLines.tsx`, `src/viewport/TapeTool.tsx`,
  `src/viewport/MoveTool.tsx`, `src/viewport/moveCandidates.ts`, `src/viewport/Viewport.tsx`
- Create: `src/viewport/GuidePicker.tsx`
- Test: `src/viewport/moveCandidates.test.ts`

**Interfaces:**
- Consumes: `visibleGuides` (Task 2), `pickGuide`, `PICK_RADIUS_PX` (Task 3), `selectGuide` (Task 1), `CLICK_DRAG_SLOP_PX`
  from `pointer.ts`.
- Produces: `GuidePicker` (inside the Canvas, no props beyond `enabled: boolean`), mounted under
  `showGuides && explode === 0`.

- [ ] **Step 1: Write the failing test** in `moveCandidates.test.ts`: `moveCandidates` given a guide id in a new trailing
  parameter `hiddenGuideIds: readonly string[]` offers no candidate owned by it, nor any crossing involving it.

- [ ] **Step 2: Run** it — expected: FAIL.

- [ ] **Step 3: Implement.**
  - `moveCandidates` filters its `guides` through `visibleGuides` once, at the top.
  - TapeTool and MoveTool: the `lines` memo and every guide candidate builder read `visibleGuides(guides, hiddenGuideIds)`,
    inside the existing memos, with `hiddenGuideIds` added to their deps.
  - `GuideMarkers` and `GuideLines` read through `visibleGuides` in their memo; a guide in `selectedGuideIds` is drawn
    emphasised: a point as `<SnapMarker point={p} />` (no `resting`; the full size) in addition to its resting marker; a line
    through `ConstructionLine`'s new `selected?: boolean` prop: opacity `1`, `lineWidth` `2.4` (`SELECTED_OPACITY`,
    `SELECTED_WIDTH` constants beside `PREVIEW_OPACITY`, "for the user to judge by eye"). Rewrite the `raycast` comment: never
    a RAYCAST target; selection is a screen-space pick (`GuidePicker`), spec §2.
  - `GuidePicker`: on `gl.domElement` add capture-phase `pointerdown` (record the press point) and `click` and `dblclick`
    listeners. On `click`: only when `tool === 'select'` and the press-to-release travel is `<= CLICK_DRAG_SLOP_PX`; compute
    `occluderDepth` by raycasting the scene with R3F's `raycaster` from the cursor (first hit whose object is a part mesh;
    BoardMesh's section-aware `raycast` already applies; markers and lines return no hits), projected to NDC depth with the same
    projector the tools use; call `pickGuide` with `visibleGuides`. On a hit: `e.stopPropagation()` (R3F handles `onClick` and
    `onPointerMissed` from this same `click` event, so the part click and the miss never run — one decider, spec §4.1) and
    `selectGuide(id, isToggleModifier(e))`. Remember the hit for the following `dblclick` and stop that too, so a double-click
    on a guide never opens the assembly behind it. On a miss, do nothing (R3F proceeds as today).
  - Hover (spec §4.3): on `pointermove` in the Select tool, set the canvas cursor to `pointer` while `pickGuide` hits, else
    leave it. Throttle to one pick per animation frame; if that still costs visibly (the plan executor checks in the browser),
    drop hover and record it in the browser-verification doc.
  - Mount `GuidePicker` in `Viewport.tsx` beside `GuideMarkers` under the same condition.

- [ ] **Step 4: Run** `npx vitest run src/viewport` and `npm run build` — expected: PASS, no type errors. Mutate: remove the
  filter in `moveCandidates` → the new test fails. Restore.

- [ ] **Step 5: Commit** `feat(guides): pick, emphasise and filter guides in the viewport (fu 591)`.

### Task 5: Panels — Guides list rows, footer, Properties line

**Files:**
- Modify: `src/panels/GuidesList.tsx`, `src/panels/GuidesFooter.tsx`, `src/panels/Properties.tsx`, `src/styles.css`
- Test: `src/panels/GuidesList.test.tsx`, `src/panels/GuidesFooter.test.tsx`, `src/panels/Properties.test.tsx`

**Interfaces:**
- Consumes: `selectGuide`, `setGuideHidden`, `selectedGuideIds`, `hiddenGuideIds`. PartsList's eye icon: move it into a shared
  export (e.g. `src/panels/EyeIcon.tsx`) rather than copying it.

- [ ] **Step 1: Write the failing tests.**
  - GuidesList: the row text is a button (`aria-pressed` false); clicking it selects (`aria-pressed` true, the `li` has class
    `selected`); Shift-click on a second toggles it in; typing in a line's X field and blurring, and clicking ×, leave
    `selectedGuideIds` unchanged; the eye button (`aria-label` `Hide <row text>` / `Show <row text>`) hides; a hidden row has
    class `hidden` and its select button is disabled (a hidden guide is never selected).
  - GuidesFooter: closed, then `selectGuide('g1', false)` from the store → the footer is open.
  - Properties: with a guide selected and no part → `1 guide selected — Delete removes it, H hides it.`; two →
    `2 guides selected — Delete removes them, H hides them.`; with nothing selected → the existing `Select a part to edit it.`
    only.

- [ ] **Step 2: Run** the three files — expected: FAIL.

- [ ] **Step 3: Implement.** Rewrite `GuidesList`'s doc comment: selection now exists (fu 591, spec §2); keep the remove-by-id
  sentence. The row button selects through `isToggleModifier`. The footer opens when `selectedGuideIds` goes from empty to
  non-empty (beside the count rule; it still never closes itself). The list scrolls the first selected row into view
  (`scrollIntoView({ block: 'nearest' })`, guarded for jsdom where it is undefined). Styles read surface roles only
  (`styles.css` rule); the selected row matches PartsList's selected-row look.

- [ ] **Step 4: Run** `npx vitest run src/panels` — expected: PASS.

- [ ] **Step 5: Commit** `feat(guides): select and hide guides from the Guides list (fu 591)`.

### Task 6: Keys

**Files:**
- Modify: `src/App.tsx` (the ONE keydown effect)
- Test: `src/App.test.tsx` (or the App keys test file it already uses; find by `hideSelected` in tests)

- [ ] **Step 1: Write the failing tests** (spec §5), each with a guide selected and no part:
  - Delete → the guide is gone, one undo entry; Backspace the same; Delete while `tapeAnchor` set → nothing.
  - H → hidden; Shift+H → the other guides hidden, parts untouched; Alt+H (`code: 'KeyH'`) → everything shown.
  - Escape with nothing else held, Select tool, no open assembly → `selectedGuideIds` `[]`.
  - With a PART selected, Delete still deletes the part (unchanged).

- [ ] **Step 2: Run** — expected: FAIL.

- [ ] **Step 3: Implement.** Delete/Backspace: after the existing `grabbed`/`tapeAnchor` early return, a non-empty
  `selectedGuideIds` → `removeGuides`. H branch: with `selectedGuideIds` non-empty, plain → `hideSelectedGuides`, Shift →
  `hideOtherGuides`; Alt → `showAll` always. Escape: a new last rung after `openPath`.

- [ ] **Step 4: Run** `npx vitest run src/App*` — expected: PASS. Then the whole suite `npm test` and `npm run build`.

- [ ] **Step 5: Commit** `feat(guides): Delete, H and Escape act on a guide selection (fu 591)`.

### Task 7: Docs

**Files:** `docs/invariants.md`, `CLAUDE.md`, `docs/module-map.md`, `docs/follow-ups.md`,
`docs/superpowers/specs/2026-10-29-sloyd-construction-lines-design.md`, `docs/browser-verification-selectable-guides.md` (new)

- [ ] **Step 1:** Edit invariants 42, 43 and 47 in FULL in `docs/invariants.md` and condensed in CLAUDE.md (the prohibition
  verbatim in both): 42 — `selectionPatch` and its guide form are the ONE writer, parts and guides exclusive; 43 —
  `applyHidden` writes both sets, the prohibition covers guides, hidden guides are not drawn or snapped through ONE
  `visibleGuides`, saved views are board-only; 47 — exploding clears the guide selection, `removeGuides` refuses. Add
  `GuidePicker.tsx` and `visibleGuides` to the CLAUDE.md "construction lines" home row and to `docs/module-map.md`; rewrite the
  `GuidesList.tsx` and `GuideLines.tsx` per-file rules. Note the test count from Task 6's run.
- [ ] **Step 2:** Round 1 spec §5: an *Amended (2026-10-30)* note pointing to the selectable-guides spec. Follow-ups: new
  entries for hidden guides in saved views (schema), a guide properties panel, dragging a guide; fu 591's status → built, not
  deployed.
- [ ] **Step 3:** Write `docs/browser-verification-selectable-guides.md` with spec §10's seven checks and the by-eye items,
  results blank.
- [ ] **Step 4: Commit** `docs(guides): invariants 42/43/47, module map, follow-ups, verification sheet (fu 591)`.

After Task 7: whole-branch review, browser verification in the user's Chrome (spec §10), merge `--no-ff` to `master`, deploy
per `DEPLOYMENT.local.md` only with the user's go-ahead.
