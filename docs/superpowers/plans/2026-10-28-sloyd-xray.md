# X-ray Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An X-ray view toggle (button + R key) that draws the selected parts solid and every other part in the existing faded look.

**Architecture:** One boolean of view state in the Zustand store (`xray`, ONE writer `setXray`), reset where `section`/`explode`
are. `Viewport.tsx` decides each part's `faded` prop through a new pure helper `fadedFor` (`src/viewport/xray.ts`) that ORs
today's assembly fade with the X-ray term. A toggle button in `ViewportControls.tsx`, and R in `App`'s one keydown effect.
`BoardMesh.tsx`, picking, snapping and assembly click rules are NOT touched.

**Tech Stack:** TypeScript, React, Zustand, react-three-fiber, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-28-sloyd-xray-design.md` (approved 2026-10-28). Read it before starting.

## Global Constraints

- No schema change; nothing reaches the document, undo (`past`/`future`) or autosave.
- `setXray` is the ONE writer of `xray`; reset to `false` only in the initial state and `replaceDocument` (beside `explode: 0`,
  `section: null`).
- X-ray OFF draws exactly as today: `fadedFor` with `xray: false` returns today's expression.
- The X-ray term is NOT gated on `clean`; the assembly term stays gated on it.
- Nothing selected → nothing fades.
- `BoardMesh.tsx` unchanged; `clickPart`/`clickTarget` unchanged; no raycast/snap changes.
- Button label `X-ray`, title `Fade every part but the selection, to see the joints inside`, `aria-pressed={xray}`, placed directly
  after the `Section` button, never disabled.
- Key: `r`/`R` toggles, in `App`'s ONE keydown effect (inv 27), after the `modalOpen` and text-entry guards; Ctrl/Meta/Alt chords
  left alone (no `preventDefault`).
- CLAUDE.md working agreement: mutate each guard test (delete the guard, see the test fail, restore).

## Review Focus

1. **A selection that is a path inside an instance** (`inst-1/leg`): its siblings in the same instance must fade and it must stay
   solid — `isCovered` is prefix-based; pinned by a `fadedFor` test in Task 2.
2. **Shift+R (`key: 'R'`)** must toggle like `r`, as M and T accept both cases — pinned in Task 4.
3. **R while the tape's typed-length box has focus** must type nothing into X-ray (it is a text field) — covered by Task 4's
   text-field test; use a bare `<input>`, not the project-name field (see the H test's comment at `src/App.test.tsx` ~1300).
4. **Toggling while exploded or mid-gesture** must still work (spec §2) — pinned in Task 1.
5. **A selected part inside an OPEN assembly with X-ray on**: parts outside the open assembly stay faded (assembly term), siblings
   inside it fade (X-ray term) — pinned by a `fadedFor` test in Task 2.

---

### Task 1: Store state `xray` / `setXray`

**Files:**
- Modify: `src/store/store.ts` (state interface beside `section` ~line 344; initial state ~1138; `replaceDocument` reset ~1819)
- Create: `src/store/store.xray.test.ts`

**Interfaces:**
- Produces: `xray: boolean`, `setXray: (on: boolean) => void` on the store state.

- [ ] **Step 1: Write the failing tests** in `src/store/store.xray.test.ts`, same setup as `store.section.test.ts`
  (`beforeEach(() => s().replaceDocument(createDocument('Test')))`):
  - `starts off and is set by setXray`: `xray` is `false`; `setXray(true)` → `true`; `setXray(false)` → `false`.
  - `is view state: no undo entry, no document change`: after `addBoard()`, record `doc` and `past.length`; `setXray(true)`;
    `doc` is the same object (`toBe`), `past.length` unchanged.
  - `undo, redo, selection, explode and section leave it`: `setXray(true)`; `addBoard(); undo(); redo();`
    `setExplode(0.5); setExplode(0); setSection({ axis: 'front', at: 1, flip: false }); setSection(null);` `toggleSelected(id)` twice on the added part
    (select, then clear); `xray` still `true`.
  - `works while exploded and mid-gesture`: `setExplode(0.5); setXray(true)` → `true`; `beginGesture(); setXray(false)` →
    `false`; `endGesture()`.
  - `is cleared by replaceDocument (a project switch)`: `setXray(true); replaceDocument(createDocument('Other'))` → `false`.

- [ ] **Step 2: Run** `npx vitest run src/store/store.xray.test.ts` — Expected: FAIL (`setXray` is not a function).

- [ ] **Step 3: Implement** `xray: boolean` and `setXray(on: boolean): void` in `store.ts`. Doc comment on the field in the
  shape of `section`'s: X-ray (x-ray spec §2), view state, never in the document, never autosaved, no undo entry, `setXray` its
  ONE writer, reset only where `explode` is. `setXray` is a plain `set({ xray: on })` — no gesture or `readOnly()` refusal. Add
  `xray: false` to the initial state and to `replaceDocument`'s reset list beside `section: null`.

- [ ] **Step 4: Run** the test file — Expected: PASS. Mutate: remove `xray: false` from `replaceDocument`'s list → the last test
  fails; restore.

- [ ] **Step 5: Commit** `feat(xray): store view state xray / setXray`.

### Task 2: `fadedFor` and the Viewport wiring

**Files:**
- Create: `src/viewport/xray.ts`, `src/viewport/xray.test.ts`
- Modify: `src/viewport/Viewport.tsx` (the `BoardMesh` map ~line 510; read `xray` from the store beside `selectedIds` ~384)

**Interfaces:**
- Consumes: `xray` (Task 1); `isCovered(path, ids)` from `../document/document`.
- Produces: `export function fadedFor(id: string, view: { clean: boolean; openPath: string | null; xray: boolean; selected: ReadonlySet<string> }): boolean`

- [ ] **Step 1: Write the failing tests** in `src/viewport/xray.test.ts` (`const v = (o) => ({ clean: false, openPath: null, xray: false, selected: new Set<string>(), ...o })`):
  - `X-ray off is the assembly fade exactly`: for `openPath: null` → `false` for any id; `openPath: 'a1'` → `fadedFor('a1/leg')`
    `false`, `fadedFor('b2')` `true`, `fadedFor('a10/leg')` `true` (prefix needs the `/`); with `clean: true` → all `false`.
  - `X-ray on with nothing selected fades nothing`: `xray: true`, empty set → `false` for `'p1'`.
  - `X-ray on fades every part not selected`: `selected: {'p1'}` → `'p1'` `false`, `'p2'` `true`.
  - `an assembly selection keeps all its parts solid`: `selected: {'asm'}` → `'asm/leg'` and `'asm/sub/rail'` `false`, `'p2'` `true`.
  - `a part inside an instance is selected alone`: `selected: {'inst-1/leg'}` → `'inst-1/leg'` `false`, `'inst-1/rail'` `true`.
  - `the assembly fade survives X-ray`: `openPath: 'a1'`, `xray: true`, `selected: {'b2'}` → `'b2'` `true` (outside the open
    assembly); `'a1/leg'` `true` (not selected); with `selected: {'a1/leg'}` → `'a1/leg'` `false`.
  - `the X-ray term ignores clean`: `clean: true, xray: true, selected: {'p1'}` → `'p2'` `true`.

- [ ] **Step 2: Run** `npx vitest run src/viewport/xray.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `fadedFor` in `src/viewport/xray.ts`: `(!clean && openPath !== null && !id.startsWith(`${openPath}/`)) || (xray && selected.size > 0 && !isCovered(id, selected))`. Doc comment: the ONE decision of a part's faded look (assemblies spec §3.3, x-ray spec §3), the assembly term gated on `clean`, the X-ray term not. Move the existing comment at the `faded=` prop ("Faded, but still clickable…") onto the call site unchanged. In `Viewport.tsx` read `const xray = useStore((s) => s.xray)` and pass `faded={fadedFor(board.id, { clean, openPath, xray, selected: selectedSet })}`.

- [ ] **Step 4: Run** the test file and `npx vitest run src/viewport` — Expected: PASS. Mutate: drop `selected.size > 0` → the
  empty-selection test fails; drop `!clean &&` → the `clean: true` off test fails; restore both.

- [ ] **Step 5: Commit** `feat(xray): fadedFor decides the faded look; Viewport reads it`.

### Task 3: The X-ray button

**Files:**
- Modify: `src/panels/ViewportControls.tsx` (after the `Section` button ~line 146)
- Test: `src/panels/ViewportControls.test.tsx` (new `describe('ViewportControls X-ray', …)`)

**Interfaces:**
- Consumes: `xray`, `setXray` (Task 1).

- [ ] **Step 1: Write the failing tests** (use the file's `renderControls()` and `btn()`; `afterEach` → `setXray(false)`):
  - `the X-ray button toggles the store and shows its state`: `btn('X-ray')` has `aria-pressed="false"`; click → store `xray`
    `true`, `aria-pressed="true"`; click → `false`.
  - `it reflects a change made elsewhere`: `act(() => setXray(true))` → `aria-pressed="true"`.
  - `it carries the title and is enabled while exploded`: `toHaveAttribute('title', 'Fade every part but the selection, to see the joints inside')`; after `setExplode(0.5)` → `not.toBeDisabled()`; reset explode.

- [ ] **Step 2: Run** `npx vitest run src/panels/ViewportControls.test.tsx` — Expected: FAIL (no button named X-ray).

- [ ] **Step 3: Implement** the button directly after `Section`: `<button aria-pressed={xray} onClick={() => setXray(!xray)} title="…">X-ray</button>`, store reads beside `setSection`'s.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** `feat(xray): X-ray button in the view bar`.

### Task 4: The R key

**Files:**
- Modify: `src/App.tsx` (the ONE keydown effect, a branch beside M and T ~line 698–716)
- Test: `src/App.test.tsx` (a `describe('App X-ray key', …)` using `mountWithThreeBoards()`; `afterEach` → `setXray(false)`)

**Interfaces:**
- Consumes: `xray`, `setXray` (Task 1), read via `useStore.getState()` inside the handler.

- [ ] **Step 1: Write the failing tests:**
  - `R toggles X-ray`: `user.keyboard('r')` → `true`; again → `false`.
  - `Shift+R toggles too`: `user.keyboard('{Shift>}R{/Shift}')` → `true`.
  - `Ctrl+R, Meta+R and Alt+R are left to the browser`: `fireEvent.keyDown(document.body, { key: 'r', ctrlKey: true })` returns
    `true` (not prevented) and `xray` stays `false`; same for `metaKey`, and for `altKey` (`key: 'r'`, `code: 'KeyR'`).
  - `R does nothing in a text field`: a bare `<input>` appended to the body and focused (as the H test does), `keyDown(input, { key: 'r' })` → `false` state.
  - `R does nothing behind a modal`: open the cut list (its button) so `modalOpen` is set, `fireEvent.keyDown(document.body, { key: 'r' })` → `xray` stays `false`; close it.

- [ ] **Step 2: Run** `npx vitest run src/App.test.tsx -t "X-ray"` — Expected: FAIL.

- [ ] **Step 3: Implement** in the keydown effect, after T's branch: on `e.key === 'r' || e.key === 'R'`, return early on
  `e.ctrlKey || e.metaKey || e.altKey`; else `preventDefault()` and `setXray(!xray)` from `getState()`; `return`. Comment in the
  M/T style: R toggles X-ray (x-ray spec §5); chords are the browser's (Ctrl+R reloads).

- [ ] **Step 4: Run** — Expected: PASS. Mutate: delete the modifier test → the Ctrl+R test fails; move the branch above the
  `modalOpen` guard → the modal test fails; restore.

- [ ] **Step 5: Commit** `feat(xray): R toggles X-ray`.

### Task 5: Gate, real-browser check, docs

**Files:**
- Create: `docs/browser-verification-xray.md`
- Modify: `docs/module-map.md` (an entry for `viewport/xray.ts`), `CLAUDE.md` ("Where things live": X-ray row → `viewport/xray.ts`
  `fadedFor`, store `xray`), `docs/feature-gaps.md` §2 (X-ray status), `docs/follow-ups.md` (the spec §9 follow-up, next number,
  "ask first"), the spec's Status line.

- [ ] **Step 1:** `npm run build` — Expected: exit 0. `npm test` — Expected: all pass (re-run quiet before calling a timing guard
  a regression).
- [ ] **Step 2:** Browser check per spec §7 in the user's Chrome (`http://localhost:5199`, claude-in-chrome; dev server
  `--port 5199 --strictPort`): stretcher tenons inside the legs; a box side's mating sockets/fingers; click a faded part → it becomes
  solid; R and the button agree; empty selection → all solid; exploded; with the section cut; Save image with X-ray on; inside an
  opened assembly; opening another project turns it off. Test projects are left in place (dev profile rule). Record DOM readouts and
  screenshots in `docs/browser-verification-xray.md`.
- [ ] **Step 3:** Update the docs listed above. Commit `docs(xray): verification, module map, gaps, follow-up`.
