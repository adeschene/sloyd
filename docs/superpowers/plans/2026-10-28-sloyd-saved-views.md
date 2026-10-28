# Saved Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Named saved views (camera, section, explode, hidden parts) stored in the project document (schema 29), saved/updated/renamed/deleted from a Views footer and restored in one click.

**Architecture:** `SloydDocument.views: SavedView[]`, validated on load (`validateViews`) behind a schema bump. Four store actions write ONLY `views` through a new `editViews` path that is the one document write allowed while exploded (inv 47 carve-out); `goToView` sets explode, section and hidden (its own hide entry) and hands the camera back to App, which applies it through two new `ViewportHandle` methods without the projection-swap re-frame. Group/Ungroup/Make component re-key every view's `hidden` inside the same edit (`editRekeyed`).

**Tech Stack:** TypeScript, React, Zustand, react-three-fiber/drei, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-28-sloyd-saved-views-design.md` (approved 2026-10-28). Read it before starting; its §2–§7 are binding.

## Global Constraints

- `CURRENT_VERSION` 28 → **29**; `docs/versioning.md` gets the 28→29 row (document-level, no step; harm: a 28 build drops `views` and autosaves without them). A v30 file is refused.
- `SavedView` = `{ id, name, camera: { ortho, position, target, height? }, section: Section | null, explode, hidden: string[] }`; `height` present only when `ortho`; `createDocument` → `views: []`.
- Ortho extent is stored as visible world height: save `(top − bottom) / zoom`, restore `zoom = (top − bottom) / height`. `up` never stored or written.
- `saveView`/`updateView`/`renameView`/`deleteView`: each ONE undo entry; ALLOWED while exploded; refused mid-gesture; no entry for a no-op or unknown id. Undo/redo stay refused while exploded.
- `goToView` writes nothing to `doc`; refused mid-gesture; ends any hide run before `applyHidden` so its hide is its own entry.
- Default name `View N` (N = view count + 1) through `uniqueName`; rename: `cleanName`, trimmed, emptied reverts, unique among views excluding itself, returns the stored name.
- Copy (exact): footer `Views · N`; button `Save view`; row go button title `Go to this view`; `Update` title `Replace this view with the current view`; delete aria-label `Delete view <name>`, text `×`; empty `No saved views. Set up a view, then Save view.`
- The Views footer is NOT inside `EditLock`.
- Generate's design schema is untouched; Generate and Refine produce `views: []`.

## Review Focus

1. **A view saved in ortho restored after the window was resized** must show the same world height — pinned by Task 4's `orthoZoomFor` tests with two canvas heights.
2. **Going to a view whose projection differs** must land on the saved pose, not a re-frame — pinned by Task 6's browser step and Task 4's test of the pure decision helper `pendingPoseReady`.
3. **Undo after Save view while exploded**: undo is refused until explode returns to 0, then removes the view — pinned in Task 2.
4. **A view hiding a part that was then deleted**: going to it skips the id without error, and undoing the delete makes it hide again — pinned in Task 3.
5. **Ungroup of a hidden assembly** while a view hides that assembly: the view then hides its children (`lift`) — pinned in Task 3.

---

### Task 1: The stored shape and the load path (schema 29)

**Files:**
- Modify: `src/document/types.ts` (beside `GuidePoint` ~332 and `guides` ~410), `src/document/document.ts` (`CURRENT_VERSION` ~249 and its doc comment; `createDocument` ~347; `validateViews` beside `validateGuides` ~894; `migrateDocument`'s object ~1299), `docs/versioning.md`
- Create: `src/document/views.test.ts`

**Interfaces:**
- Produces: `export interface SavedViewCamera { ortho: boolean; position: [number, number, number]; target: [number, number, number]; height?: number }`; `export interface SavedView { id: string; name: string; camera: SavedViewCamera; section: Section | null; explode: number; hidden: string[] }` (Section via `import type` from `./section`); `SloydDocument.views: SavedView[]`; `export function validateViews(raw: unknown): SavedView[]` in `document.ts`.

- [ ] **Step 1: Write the failing tests** in `src/document/views.test.ts`, with a helper `good()` returning a valid perspective view and `goodOrtho()` an ortho one (`height: 40`):
  - `createDocument has no views`: `createDocument().views` equals `[]`; `CURRENT_VERSION` is `29`.
  - `a 28 file loads with views []` (`migrateDocument({...createDocument(), version: 28})` minus `views`).
  - `a 30 file is refused` (the same refusal shape the existing newer-version test asserts).
  - `round trip`: a doc with `[good(), goodOrtho()]` → `JSON.parse(JSON.stringify)` → `migrateDocument` → `views` deep-equal.
  - `drops` — one `it` per case, each asserting the result is `[]`: non-object; name not a string; name `'   '`; `camera.ortho` not boolean; position of 2 numbers; target with `NaN`; ortho with `height` 0; ortho with `height` missing; `explode` `Infinity`; `section` `{ axis: 'diagonal', at: 1, flip: false }`; `section` with `at: NaN`; `section` with `flip: 'no'`.
  - `keeps and repairs`: `explode: 1.5` → `1`, `-0.2` → `0`; perspective with `height: 5` → no `height` key (`'height' in v.camera` false); `hidden: ['a', 3, 'a', 'b']` → `['a', 'b']`; `hidden: 'x'` → `[]`; `name: '  Joint  '` → `'Joint'`; two named `Joint` → `Joint`, `Joint (1)` (whatever `uniqueName` gives for the second; assert `!== 'Joint'` and unique); two with id `v1` → first keeps `v1`, second differs; non-array `views` → `[]`.

- [ ] **Step 2: Run** `npx vitest run src/document/views.test.ts` — Expected: FAIL (types/`validateViews` missing; `views` undefined).

- [ ] **Step 3: Implement** the types, `views: []` in `createDocument`, `validateViews` (the §2 rules exactly; ids through `takeId` with its own `seen`; names through `uniqueName` against the views kept so far), `views: validateViews(d.views)` in `migrateDocument`'s object, `CURRENT_VERSION = 29` with a doc-comment line in the shape of 28's (what it adds, the harm a 28 build would do). Add the 28→29 row to `docs/versioning.md` and bump its "current version" line. Fix any existing test that pins `CURRENT_VERSION` 28 or a fixture's exact top-level key list (search `toBe(28)`, `version: 28`).

- [ ] **Step 4: Run** `npx vitest run src/document` — Expected: PASS. `npx tsc -b` — Expected: exit 0 (every `SloydDocument` literal now needs `views`; add `views: []` where a test or fixture builds one by hand).

- [ ] **Step 5: Commit** `feat(views): SavedView in the document, validateViews, schema 29`.

### Task 2: Store — saving, updating, renaming, deleting (the inv 47 carve-out)

**Files:**
- Modify: `src/store/store.ts` (`edit` ~665; new actions beside the guide actions ~2546; state interface)
- Create: `src/store/store.views.test.ts`

**Interfaces:**
- Consumes: Task 1's types.
- Produces: `saveView(camera: SavedViewCamera): string | null` (the new id, or null when refused); `updateView(id: string, camera: SavedViewCamera): void`; `renameView(id: string, typed: string): string` (the stored name; the old name when refused/emptied/unknown → `''` for unknown); `deleteView(id: string): void`.

- [ ] **Step 1: Write the failing tests** (`beforeEach` → `replaceDocument(createDocument('Test'))`; `cam` = a perspective camera):
  - `saveView appends View 1 with the current view state`: after `addBoard()`, `setSection({axis:'front',at:2,flip:false})`, `setHidden(boardId, true)`, `saveView(cam)` → `doc.views` has one entry `{ name: 'View 1', camera: cam, section: {…}, explode: 0, hidden: [boardId] }`; `past.length` up by exactly 1.
  - `names count up and stay unique`: save twice → `View 1`, `View 2`; delete `View 1`, save → `View 2 (1)`-or-whatever `uniqueName('View 2', …)` gives — assert the three names are unique.
  - `allowed while exploded, parts untouched`: `addBoard(); setExplode(0.5); saveView(cam)` → one view, `doc.boards` is the SAME array object; `updateView`, `renameView`, `deleteView` likewise work exploded.
  - `undo is refused while exploded, then removes the view`: after the above, `undo()` → view still there; `setExplode(0); undo()` → `views` `[]`.
  - `refused mid-gesture`: `beginGesture(); saveView(cam)` → `null`, no view; `endGesture()`.
  - `updateView replaces camera, section, explode, hidden; keeps id, name, order`: three views, update the middle one → same index, id, name; new fields equal current state; one entry. Updating with identical state → no entry.
  - `renameView`: returns `'Shelf joint'` for `'  Shelf joint '`; `'A › B'` stored as `'A > B'`; to another view's name → uniqued; `''` → returns old name, no entry; unknown id → `''`, no entry.
  - `deleteView`: removes, one entry; unknown id → no entry.
  - `edit() still refuses part edits while exploded` (regression of the carve-out): `setExplode(0.5); addBoard()` → no board added.

- [ ] **Step 2: Run** `npx vitest run src/store/store.views.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** Give `edit` a third parameter `opts?: { viewsOnly?: true }`; its explode guard becomes `if (get().explode > 0 && !opts?.viewsOnly) return;`. Add a local `editViews(fn: (views: SavedView[]) => SavedView[])` = refuse when `gesturing`; else `edit((d) => { const v = fn(d.views); return v === d.views ? d : { ...d, views: v }; }, undefined, { viewsOnly: true })`. The four actions go only through `editViews` (each returns the SAME array for a no-op). Comment at the guard: the inv 47 carve-out (saved-views spec §3) — only `editViews` passes `viewsOnly`, and it writes only `views`.

- [ ] **Step 4: Run** the file — PASS. Mutate: drop `&& !opts?.viewsOnly` → the exploded tests fail; make `editViews` skip the gesture refusal → the gesture test fails; restore.

- [ ] **Step 5: Commit** `feat(views): save, update, rename, delete views (one entry each, allowed exploded)`.

### Task 3: Store — going to a view, and re-keying views on Group/Ungroup

**Files:**
- Create: `src/document/views.ts` (pure), tests appended to `src/document/views.test.ts`
- Modify: `src/store/store.ts` (`goToView`; `editRekeyed` ~881), tests appended to `src/store/store.views.test.ts`

**Interfaces:**
- Consumes: `Rekey`, `Lift` from `src/document/treeOps.ts`; `applyHidden`, `hideRunEntry`, `setExplode`, `setSection` (store internals).
- Produces: `export function rekeyViews(doc: SloydDocument, rekey: Rekey, lift?: Lift): SloydDocument` (the SAME doc when no view's `hidden` changes; per id: `lift(id) ?? [rekey(id)]`, deduplicated, order kept); store `goToView(id: string): SavedView | null` (the view whose camera App must apply, or null when refused/unknown).

- [ ] **Step 1: Write the failing tests.**
  - Pure (`views.test.ts`): `rekeyViews` maps `['a', 'b']` with `rekey = p => p === 'a' ? 'g/a' : p` → `['g/a', 'b']`; with `lift = p => p === 'g' ? ['a', 'b'] : null` maps `['g', 'a']` → `['a', 'b']`; returns the same doc object when nothing changes.
  - Store (`store.views.test.ts`):
    - `goToView sets explode, section and hidden, and writes no doc`: save a view with section/hidden/explode 0.5, then clear all three; `goToView(id)` → state restored, `doc` the SAME object, returns the view.
    - `skips a deleted part`: view hides board B; delete B; `goToView` → `hiddenIds` `[]`, no throw; `undo()` (the delete) then `goToView` → `[B]`.
    - `its hide is its own entry`: `setHidden(A, true)` (one entry), `goToView(view hiding B)` → `past` up by one more; `undo()` → hidden is `[A]` (the run's end, not its start).
    - `go to A, go to B, undo → A's hidden set`.
    - `no entry when the hidden set already matches`.
    - `refused mid-gesture` → returns `null`, nothing changes.
    - `Group re-keys every view's hidden in the same entry`: two boards, a view hiding board 1; Group both → the view's `hidden` is the board's new path; `past` up by exactly one; `undo()` → the old id back.
    - `Ungroup of a hidden assembly lifts it in views`: a view hiding the assembly; Ungroup → the view hides both children.

- [ ] **Step 2: Run** both test files — Expected: FAIL.

- [ ] **Step 3: Implement** `rekeyViews` in `src/document/views.ts`. In `editRekeyed`, pass `edit((d) => rekeyViews(fn(d), rekey, lift), selection)` — one edit, so undo restores both. `goToView`: refuse when `gesturing`; find the view; `setExplode(view.explode)`; `setSection(view.section)`; `hideRunEntry = null`; `applyHidden(view.hidden)`; return the view. Comment: inv 43 amendment (a fifth user action through `applyHidden`; it ends any run).

- [ ] **Step 4: Run** — PASS. Mutate: remove `hideRunEntry = null` → `its hide is its own entry` fails; remove the `rekeyViews` wrap → the Group test fails; restore.

- [ ] **Step 5: Commit** `feat(views): go to a view; views follow Group and Ungroup`.

### Task 4: Viewport camera — read, write, no re-frame on a restore's projection swap

**Files:**
- Create: `src/viewport/viewCamera.ts`, `src/viewport/viewCamera.test.ts`
- Modify: `src/viewport/Viewport.tsx` (`ViewportHandle` ~356; `CameraKeys` ~156–189), `src/App.tsx` (a `goToView` handler beside `onView` ~992)

**Interfaces:**
- Consumes: `SavedViewCamera` (Task 1), store `goToView` (Task 3).
- Produces: `orthoHeight(top: number, bottom: number, zoom: number): number`; `orthoZoomFor(top: number, bottom: number, height: number): number`; `pendingPoseReady(pending: SavedViewCamera | null, isOrtho: boolean, controlsOnCamera: boolean): boolean`; `ViewportHandle.getCamera(): SavedViewCamera | null`; `ViewportHandle.setCamera(c: SavedViewCamera): void`; App `goToSavedView(id: string): void`.

- [ ] **Step 1: Write the failing tests** (`viewCamera.test.ts`):
  - `orthoHeight` of top 400, bottom −400, zoom 20 → `40`.
  - `orthoZoomFor` restores the same height at another canvas: top/bottom ±300 with height 40 → zoom 15 (`orthoHeight(300, -300, 15) === 40`); ±400 → 20.
  - `pendingPoseReady`: `null` → false; ortho pending on a perspective camera → false; matching projection but controls not yet on the camera → false; matching and on → true.

- [ ] **Step 2: Run** `npx vitest run src/viewport/viewCamera.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** the helpers. In `Viewport.tsx`: a `pendingPose` ref shared with `CameraKeys`; `getCamera` reads `camera.position`, `controls.target`, `camera.isOrthographicCamera`, and (ortho) `orthoHeight(camera.top, camera.bottom, camera.zoom)`, returning `null` until the canvas and controls exist; `setCamera(c)` stores `pendingPose.current = c` and asks `CameraKeys` to apply. In `CameraKeys`, on each relevant render/effect: when `pendingPoseReady(...)`, write `position`, (ortho) `zoom = orthoZoomFor(...)`, `updateProjectionMatrix()`, `controls.target.set(...)`, `controls.update()`, clear the pending pose, and mark the projection swap as framed so its re-frame does NOT run (set `framedCamera` to this camera). Never write `up`. In `App.tsx`, `goToSavedView(id)`: `const v = useStore.getState().goToView(id); if (!v) return; if (v.camera.ortho !== orthographic) setOrthographic(v.camera.ortho); viewportRef.current?.setCamera(v.camera);`.

- [ ] **Step 4: Run** the test file, `npx vitest run src/viewport src/App.test.tsx`, `npx tsc -b` — Expected: PASS / exit 0.

- [ ] **Step 5: Commit** `feat(views): read and set the camera; a restore's projection swap does not re-frame`.

### Task 5: The Views footer

**Files:**
- Create: `src/panels/ViewsFooter.tsx`, `src/panels/ViewsList.tsx`, `src/panels/ViewsFooter.test.tsx`
- Modify: `src/App.tsx` (render `<ViewsFooter key={activeId} getCamera={…} onGoTo={goToSavedView} />` beside `<GuidesFooter>` ~1026), `src/styles.css` (reuse the guides footer classes where possible; read `styles.css`' per-file rule in `docs/module-map.md` first)

**Interfaces:**
- Consumes: store `doc.views`, `saveView`, `updateView`, `renameView`, `deleteView`; `NameField` (`src/panels/NameField.tsx`, its `onCommit` returns the stored name).
- Produces: `ViewsFooter(props: { getCamera: () => SavedViewCamera | null; onGoTo: (id: string) => void })`.

- [ ] **Step 1: Write the failing tests** (render `ViewsFooter` with `getCamera = () => cam`, `onGoTo = vi.fn()`):
  - `the toggle reads Views · N and opens itself when a view is added` (as `GuidesFooter`'s tests do).
  - `empty text`: open → `No saved views. Set up a view, then Save view.`
  - `Save view adds View 1` (store has one view with `camera` = `cam`); with `getCamera` returning `null` it adds nothing.
  - `clicking a view's name calls onGoTo(id)`; its title is `Go to this view`.
  - `rename commits on Enter and blur; emptied reverts` (store name changes; emptied → old name shown).
  - `Update replaces the view` (store `updateView` effect: the view's `section` equals the current one after changing it); title `Replace this view with the current view`.
  - `× deletes`; aria-label `Delete view View 1`.
  - `it works while exploded`: `setExplode(0.5)`; Save view, Update, rename and × all take effect (no `fieldset[disabled]` ancestor).

- [ ] **Step 2: Run** `npx vitest run src/panels/ViewsFooter.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement** `ViewsFooter` in `GuidesFooter`'s shape (local open state, self-open on count rise against the mount baseline, keyed by `activeId` in App), NO `EditLock`; `ViewsList` rows: name button, `NameField`, Update, ×; `Save view` button above the list.

- [ ] **Step 4: Run** the file and `npx vitest run src/App.test.tsx` — PASS.

- [ ] **Step 5: Commit** `feat(views): the Views footer`.

### Task 6: Other paths, gate, real browser, docs

**Files:**
- Test: `src/generate/run.test.ts` (or the existing Refine test file) — a refined and a generated project have `views: []` even when the original had views; `src/App.test.tsx` — Duplicate project carries views (if a duplicate test helper exists; else a storage-level test in `src/storage/`)
- Create: `docs/browser-verification-saved-views.md`
- Modify: `docs/invariants.md` + `CLAUDE.md` (inv 47 carve-out and inv 43 fifth action, full and condensed; "Where things live" row; Versioning line → 29), `docs/module-map.md` (`document/views.ts`, `viewport/viewCamera.ts`, `ViewsFooter.tsx`, `ViewsList.tsx`), `docs/feature-gaps.md` (saved views status), `docs/follow-ups.md` (spec §11's three follow-ups, next numbers, "ask first"), the spec's Status line

- [ ] **Step 1:** Write the Refine/Generate/Duplicate tests; run; fix only if they fail (Refine spreads `out.doc`, which comes through `createDocument`, so `views: []` is expected — if it carries the original's views, set `views: []` explicitly in `run.ts`'s two `refined` builds).
- [ ] **Step 2:** `npm run build` → exit 0; `npm test` → all pass (re-run quiet before calling a timing guard a regression).
- [ ] **Step 3:** Browser check in the user's Chrome (`http://localhost:5199`, claude-in-chrome), spec §8's list: save in perspective, orbit away, go back (same pose — compare `getCamera` readouts via the page if reachable, else screenshots); save ortho, switch to perspective, go back (ortho, same extent, no re-frame); a view with section + explode + hidden; resize the browser window between save and go (ortho extent holds); reload — views persist; Save view / Update / rename / × while exploded. Make a NEW project for this (project menu → + New project) and leave it in place. Record in `docs/browser-verification-saved-views.md`.
- [ ] **Step 4:** The docs above. Commit `docs(views): invariants 43/47, versioning, module map, gaps, follow-ups, verification`.
