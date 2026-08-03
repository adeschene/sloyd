# Selected-Board Grabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict the Move tool's grabbable snap points to the currently selected board, so two boards that touch can no longer offer coincident grab points and move the wrong one.

**Architecture:** Three changes and no new files. `MoveTool.tsx`'s candidate memo splits into two phases — the selected board's points before a grab, every other board's points after one. `store.ts` keeps "the grabbed board is the selected board" true, by clearing `grabbed` at the two sites that can move `selectedId` off it and by guarding `commitSnapMove` against the mismatch. `Toolbar.tsx` renders a hint in the state the restriction newly creates: Move mode with nothing selected, where nothing is grabbable.

**Tech Stack:** TypeScript, React, Zustand, react-three-fiber, Vitest, Vite.

**Design doc:** `docs/superpowers/specs/2026-08-03-sloyd-selected-board-grabs-design.md`. Read it before Task 1 — §3 in particular, because the grab/target asymmetry is the one thing in this round that looks like an oversight and is not.

## Global Constraints

- **No schema change.** `CURRENT_VERSION` stays `5`. Nothing in this round touches `src/document/`.
- **`npm test` does not typecheck.** `npm run build` (`tsc -b && vite build`) is the typecheck gate. A green suite proves nothing about `tsc`. Run the build before claiming any task compiles.
- **Baseline is 660 tests across 32 files, all passing.** Tasks 1 and 2 add tests; note the new count in each commit's verification step.
- **The r3f viewport has no unit tests by design.** `MoveTool.tsx` (Task 3) is verified by driving a real browser (Task 5), never by asserting on mocks. Do not add a test file for it.
- **No pull requests.** Solo repo — commit directly to `master`.
- **If a supplied test or expectation looks wrong, stop and escalate.** Do not edit an assertion to make it pass. This repo has recorded seven instances of plan-supplied code being wrong (follow-ups 64, 68 ×2, 80, 87, 88, 107); the ones that ended well ended well because an implementer stopped. Task 2 contains one deliberate fixture change with a written justification — if that justification does not hold up when you read it, escalate rather than proceed.

---

### Task 1: The grab drops when the selection moves off the grabbed board

**Files:**
- Modify: `src/store/store.ts` — `edit()` (~lines 76-99) and `selectBoard` (~line 314)
- Test: `src/store/store.test.ts` — inside the existing `describe('the Move tool', ...)` block, after the `cancelGrab` test at the end (~line 664)

**Interfaces:**
- Consumes: the existing store — `grabSnapPoint(point)`, `selectBoard(id)`, `addBoard()`, `duplicateBoard(id)`, `grabbed`, `selectedId`, and the test file's own `twoBoards()` / `cornerOf(id)` helpers (~lines 476-495).
- Produces: the guarantee Task 2's guard leans on — after this task, no path through the store leaves `grabbed` naming a board other than `selectedId`. Task 2 adds the guard that makes the same rule true of the action itself.

**Context you need:** `edit()` takes an optional `selection` callback and applies it at the same `set` that writes the new document:

```ts
    set({
      doc: next,
      past: nextPast,
      future: nextFuture,
      ...(selection ? { selectedId: selection(next) } : {}),
    });
```

`addBoard` and `duplicateBoard` both pass that callback to select the board they create. `replaceDocument`, `undo`, `redo` and `deleteBoard` already null `grabbed` themselves, so they need nothing here.

- [ ] **Step 1: Write the failing tests**

Add to `src/store/store.test.ts`, at the end of the `describe('the Move tool', ...)` block (immediately after the `cancelGrab clears the grab and moves nothing` test):

```ts
  it('drops a grab when a different board is selected', () => {
    // A grab is only offered on the selected board's points, so the selection
    // moving elsewhere means the user retargeted the tool. Keeping the grab
    // would leave the tool carrying a point belonging to a board the
    // properties panel is no longer showing, with nothing explaining it.
    const { a, b } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().selectBoard(b.id);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('keeps a grab when the same board is re-selected', () => {
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().selectBoard(a.id);
    expect(useStore.getState().grabbed).not.toBeNull();
  });

  it('drops a grab when the selection is cleared', () => {
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().selectBoard(null);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('drops a grab when Add board selects the new board', () => {
    // addBoard selects its new board through edit()'s `selection` callback,
    // not through selectBoard — a second writer of selectedId that nothing
    // gates in Move mode. Without the clear inside edit(), the toolbar button
    // reaches exactly the mismatched state the tests above rule out.
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().addBoard();
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('drops a grab when Duplicate selects the copy', () => {
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().duplicateBoard(a.id);
    expect(useStore.getState().grabbed).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/store/store.test.ts -t "the Move tool"`

Expected: the two `keeps`/re-select tests pass already (nothing clears the grab today); the four `drops` tests **fail** — `expected SnapPoint to be null`. Confirm the failure message names `grabbed`, not a missing helper: if `duplicateBoard` or `selectBoard` is reported undefined, stop, you are editing the wrong describe block.

- [ ] **Step 3: Clear the grab inside `edit()`**

In `src/store/store.ts`, replace the `set({ ... })` at the end of `edit()` with:

```ts
    // Invariant 24's second list — the one that records what nulls `grabbed`
    // for reasons other than the world moving. The Move tool only offers the
    // SELECTED board's points as grab candidates, so a selection that moves
    // to a different board means the user retargeted the tool, and the point
    // in hand is no longer one they could have picked up. `edit()` rather
    // than each caller: addBoard and duplicateBoard both select what they
    // create through this callback, and so will the next action that does.
    const nextSelectedId = selection ? selection(next) : get().selectedId;
    const heldGrab = get().grabbed;
    const dropGrab = heldGrab !== null && heldGrab.owner.id !== nextSelectedId;

    set({
      doc: next,
      past: nextPast,
      future: nextFuture,
      ...(selection ? { selectedId: nextSelectedId } : {}),
      ...(dropGrab ? { grabbed: null } : {}),
    });
```

Note `nextSelectedId` falls back to the *current* `selectedId` when there is no callback, so an ordinary edit with no selection change never drops a grab that matches. Spreading `grabbed` conditionally rather than writing `grabbed: dropGrab ? null : get().grabbed` keeps this `set` from touching the key at all in the common case.

- [ ] **Step 4: Clear the grab in `selectBoard`**

Replace `selectBoard` (currently `selectBoard: (id) => set({ selectedId: id }),`) with:

```ts
    // Same rule as edit()'s: the grabbed board must be the selected one. This
    // is the path the parts list takes, which is the only way to change which
    // board the Move tool will move (BoardMesh's `selectable` is false in
    // move mode, deliberately — design §4).
    selectBoard: (id) =>
      set((s) => ({
        selectedId: id,
        ...(s.grabbed && s.grabbed.owner.id !== id ? { grabbed: null } : {}),
      })),
```

- [ ] **Step 5: Run the full suite**

Run: `npm test`

Expected: all pass, 665 tests (660 + 5). If any *pre-existing* Move-tool test now fails, stop and escalate — Task 1 is not supposed to change the behaviour of any existing test, and a break here means the fallback in Step 3 is wrong, not that the old test was.

- [ ] **Step 6: Typecheck**

Run: `npm run build`

Expected: exit 0, no `tsc` output.

- [ ] **Step 7: Commit**

```bash
git add src/store/store.ts src/store/store.test.ts
git commit -m "feat: drop the Move grab when the selection moves off the grabbed board"
```

---

### Task 2: `commitSnapMove` refuses a grab that is not the selected board

**Files:**
- Modify: `src/store/store.ts` — `commitSnapMove` (~lines 141-179)
- Modify: `src/store/store.test.ts` — the `twoBoards()` fixture (~lines 476-490), plus one new test

**Interfaces:**
- Consumes: Task 1's clearing rule (this guard is deliberately redundant with it).
- Produces: nothing new. `commitSnapMove`'s signature is unchanged.

**Read this before writing code — the fixture change is deliberate and needs to be understood, not pattern-matched.**

The existing fixture creates two boards and leaves `selectedId` pointing at the **second** one, because `addBoard` selects what it creates. Every existing Move-tool test then grabs a point on the **first**. That combination — grabbing board A's point while board B is selected — is a state the UI can no longer produce after Task 3, and one this guard now rejects outright. So the fixture is not being edited to make a failing assertion pass; it is being corrected to set up a state the tool can actually reach. The distinction matters and is exactly what follow-up 107 is about: change the fixture when the fixture was modelling something impossible, never when it was modelling the bug.

The check on that reasoning is Step 4's dedicated test: it constructs the mismatch **explicitly**, so the guard has a test that fails when the guard is deleted. If the fixture change were doing the guard's job, deleting the guard would leave every test green.

- [ ] **Step 1: Write the failing test**

Add to `src/store/store.test.ts`, at the end of the `describe('the Move tool', ...)` block:

```ts
  it('refuses to commit when the grabbed board is not the selected one', () => {
    // Unreachable through the UI — the candidate filter withholds every point
    // that isn't the selected board's, and every selectedId writer drops the
    // grab. This is the action-level half of that rule: the filter makes it
    // true of the UI, the guard makes it true of the action, the same pairing
    // the self-snap case already uses.
    const { a, b } = twoBoards();
    useStore.getState().updateBoard(b.id, { position: [40, 0, 0] });
    const before = [...useStore.getState().doc.boards.find((x) => x.id === a.id)!.position];
    const undoDepth = useStore.getState().past.length;

    useStore.getState().grabSnapPoint(cornerOf(a.id));
    // Reach past the store's own clearing to build the state under test.
    useStore.setState({ selectedId: b.id });
    useStore.getState().commitSnapMove(cornerOf(b.id));

    expect(useStore.getState().doc.boards.find((x) => x.id === a.id)!.position)
      .toEqual(before);
    // No edit() ran, so no undo snapshot was pushed and redo was not wiped.
    expect(useStore.getState().past.length).toBe(undoDepth);
    // The grab is left in hand rather than discarded: the state should be
    // unreachable, and silently dropping it would make it undiagnosable.
    expect(useStore.getState().grabbed).not.toBeNull();
  });
```

`useStore.setState({ selectedId: b.id })` is used rather than `selectBoard(b.id)` on purpose — `selectBoard` would clear the grab (Task 1) and there would be nothing left to test.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/store/store.test.ts -t "refuses to commit"`

Expected: FAIL on the position assertion — board A actually moves, because nothing stops it yet.

- [ ] **Step 3: Add the guard**

In `commitSnapMove`, immediately after the existing self-snap guard (`if (target.owner.id === grabbed.owner.id) return;`), add:

```ts
      // The Move tool only offers the selected board's points as grab
      // candidates, and every writer of selectedId drops a grab that stops
      // matching (see edit() and selectBoard). This guard is deliberately
      // redundant with both: the filter makes the rule true of the UI, this
      // makes it true of the action, so a future sixth writer of selectedId
      // that misses the rule costs a grab that refuses to commit rather than
      // a board that moves without the user knowing which one it was.
      // `grabbed` is deliberately left in hand — this state should be
      // unreachable, and discarding it quietly would hide that it wasn't.
      if (grabbed.owner.id !== get().selectedId) return;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/store/store.test.ts -t "refuses to commit"`

Expected: PASS.

- [ ] **Step 5: Run the full Move-tool block and watch it break**

Run: `npm test -- src/store/store.test.ts -t "the Move tool"`

Expected: **several pre-existing tests now fail** — every one that grabs board A while the fixture left board B selected. This is the fixture problem described above, not a defect in the guard. Read the failures and confirm they are all of that shape (a commit that did nothing) before continuing. If a failure is *not* of that shape, stop and escalate.

- [ ] **Step 6: Correct the fixture**

In `src/store/store.test.ts`, replace the `twoBoards()` helper's body ending with:

```ts
  /**
   * Two boards, returned with the store reset around them and the FIRST one
   * selected.
   *
   * addBoard selects what it creates, so without this the fixture leaves the
   * second board selected while every test below grabs a point on the first —
   * a combination the UI cannot produce, since the Move tool only offers the
   * selected board's points. Selecting `a` is what makes the fixture model a
   * state a user can actually reach; it is not what makes commitSnapMove's
   * mismatch guard pass, which has its own test constructing the mismatch
   * explicitly.
   */
  const twoBoards = () => {
    useStore.setState({
      doc: createDocument(),
      selectedId: null,
      past: [],
      future: [],
      tool: 'select',
      grabbed: null,
    });
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    const [a, b] = useStore.getState().doc.boards;
    useStore.getState().selectBoard(a!.id);
    return { a, b };
  };
```

Then check the one existing test that asserts on `selectedId` — `clears the grab and selects the board it moved` (~line 538). It expects `selectedId` to be `a.id` after the commit, which is now also true *before* the commit. Strengthen it so it still proves `commitSnapMove` writes the selection, rather than passing because the fixture already did: change its setup to select `b` and grab from `b`, moving `b` onto `a`:

```ts
  it('clears the grab and selects the board it moved', () => {
    const { a, b } = twoBoards();
    // b must be moved off a first. Two fresh boards share a default position,
    // so without this the delta is exactly zero and the commit correctly takes
    // the no-op path instead of the one under test.
    useStore.getState().updateBoard(b.id, { position: [40, 0, 0] });
    // Grab from b, not a: the fixture selects a, so asserting selectedId === a
    // after moving a would pass without commitSnapMove writing anything.
    useStore.getState().selectBoard(b.id);
    useStore.getState().grabSnapPoint(cornerOf(b.id));
    useStore.getState().commitSnapMove(cornerOf(a.id));
    expect(useStore.getState().grabbed).toBeNull();
    expect(useStore.getState().selectedId).toBe(b.id);
  });
```

Make no other change to any existing test. If one still fails after the fixture correction, stop and escalate — that is a real behaviour change this round did not intend.

- [ ] **Step 7: Run the full suite**

Run: `npm test`

Expected: all pass, 666 tests (665 + 1).

- [ ] **Step 8: Prove the guard is load-bearing**

Temporarily delete the guard line added in Step 3, run `npm test -- src/store/store.test.ts -t "refuses to commit"`, and confirm it FAILS. Restore the line and confirm it passes again. This repo has shipped a test that could not fail twice (follow-ups 87, 88) — do not skip this.

- [ ] **Step 9: Typecheck**

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 10: Commit**

```bash
git add src/store/store.ts src/store/store.test.ts
git commit -m "feat: refuse a snap move whose grabbed board is not the selected one"
```

---

### Task 3: Only the selected board's points are grabbable

**Files:**
- Modify: `src/viewport/MoveTool.tsx` — the `candidates` memo (lines 48-60) and the effect's dependency array (line 158)

**Interfaces:**
- Consumes: `useStore((s) => s.selectedId)` — a `string | null`; `boardSnapPoints(board)` from `../document/document`, already imported.
- Produces: no exported change. `pickSnapPoint` continues to receive a `SnapPoint[]` and handles an empty array by returning `null`.

**No unit test.** The r3f viewport is verified by driving a real browser (Task 5), not by asserting on mocks. Do not create `MoveTool.test.tsx`.

- [ ] **Step 1: Subscribe to `selectedId`**

In `MoveTool.tsx`, beside the existing store subscriptions at the top of the component (lines 22-24), add:

```ts
  const selectedId = useStore((s) => s.selectedId);
```

- [ ] **Step 2: Split the candidate set**

Replace the `candidates` memo (lines 48-60) in full:

```ts
  /**
   * The points on offer, which are two different sets rather than one set
   * with a filter.
   *
   * BEFORE a grab: only the SELECTED board's points. Boards in a real project
   * touch — that is what the tool is for — so two of them routinely share a
   * corner, and offering both meant pickSnapPoint's depth tie-break silently
   * decided which board was about to move. The marker sits at a position both
   * boards share, so nothing on screen said which one it named. With nothing
   * selected this is empty, and nothing is grabbable at all (Toolbar says so).
   *
   * AFTER a grab: every board's points minus the grabbed board's own.
   * Deliberately NOT restricted the same way — two coincident TARGET points
   * produce the identical delta, so which one wins is unobservable, and the
   * board being moved is by definition the selected one, so a selected-only
   * target set would leave nothing to snap to. See design §3.
   *
   * Withholding the grabbed board's own candidates is what makes the
   * self-snap exclusion legible: an ineligible point draws no marker, so the
   * case is never offered rather than being offered and then silently ignored
   * on click. (commitSnapMove guards it too — that guard makes the rule true
   * of the action, this makes it true of the UI.)
   */
  const candidates = useMemo(() => {
    if (grabbed) {
      return boards.flatMap(boardSnapPoints).filter((p) => p.owner.id !== grabbed.owner.id);
    }
    const selected = boards.find((b) => b.id === selectedId);
    return selected ? boardSnapPoints(selected) : [];
  }, [boards, grabbed, selectedId]);
```

**The dependency array is the part to get right.** Omitting `selectedId` is invariant 15's exact failure mode — the memo would keep returning the previously selected board's points while the store and the properties panel are both correct, which is the "looks like it works" signature that shipped once already.

- [ ] **Step 3: Check the effect's dependency array**

The effect at line 158 lists `[tool, candidates, gl, camera, size.width, size.height]`. `candidates` already covers the new input, so this list needs **no** change. Confirm the comment above it still reads true; if it enumerates the memo's own inputs, update it to include `selectedId`. Do not add `selectedId` to the effect's list — it would resubscribe the listeners for no reason.

- [ ] **Step 4: Typecheck**

Run: `npm run build`

Expected: exit 0. `boards.find` returns `Board | undefined`, which the ternary narrows.

- [ ] **Step 5: Run the suite**

Run: `npm test`

Expected: 666 passing, unchanged from Task 2 — nothing under test imports `MoveTool`.

- [ ] **Step 6: Commit**

```bash
git add src/viewport/MoveTool.tsx
git commit -m "feat: offer only the selected board's snap points as grab candidates"
```

---

### Task 4: The toolbar hint for Move mode with nothing selected

**Files:**
- Modify: `src/panels/Toolbar.tsx` — the store subscriptions (~line 40) and the tool-pair markup (~lines 64-78)
- Modify: `src/styles.css` — a rule beside `.toolbar-divider` (~line 117)

**Interfaces:**
- Consumes: `useStore((s) => s.selectedId)`.
- Produces: one new CSS class, `.toolbar-hint`. Nothing else imports it.

- [ ] **Step 1: Subscribe to `selectedId`**

In `Toolbar.tsx`, beside `const tool = useStore((s) => s.tool);`:

```ts
  const selectedId = useStore((s) => s.selectedId);
```

- [ ] **Step 2: Render the hint**

Immediately after the Move button's closing `</button>` (line 77) and before the `<span className="toolbar-divider" />` that follows it, add:

```tsx
        {tool === 'move' && !selectedId && (
          // The Move tool grabs points on the selected board only, so with
          // nothing selected no marker ever appears and the tool reads as
          // broken rather than as waiting. The button stays enabled: disabling
          // it would take a control away to explain a state, and would need
          // its own rule for a board deleted while the tool is active — which
          // this needs none for, since deleteBoard already clears both.
          <span className="toolbar-hint">Select a part to move</span>
        )}
```

Do **not** change the Move button's `onClick` or add a `disabled` prop.

- [ ] **Step 3: Style it**

In `src/styles.css`, after the `.toolbar-divider` rule (~line 122), add:

```css
/* Shown only while the Move tool is armed with nothing selected — the one
   state where the tool is live but nothing is grabbable. Muted, because it
   describes what to do next rather than reporting an error. */
.toolbar-hint {
  font-size: 12px;
  color: var(--ink-dim);
  white-space: nowrap;
}
```

`--ink-dim` (`#a8adb3`) is defined at `styles.css:28`, alongside `--ink` and
`--ink-faint`. Use it as written — do not introduce a new colour and do not use a
literal hex value.

- [ ] **Step 4: Typecheck and run the suite**

Run: `npm run build && npm test`

Expected: build exit 0; 666 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/panels/Toolbar.tsx src/styles.css
git commit -m "feat: hint that the Move tool needs a selected part"
```

---

### Task 5: Browser verification, and the write-ups

**Files:**
- Create: `docs/browser-verification-selected-board-grabs.md`
- Modify: `docs/follow-ups.md` — a new `## From the selected-board grabs round` section at the end, numbering from **109**
- Modify: `CLAUDE.md` — the status section and invariant 24

**This is the only verification the candidate filter gets.** `MoveTool.tsx` has no unit tests by design, so the report is the artifact everything downstream trusts about this surface. Follow-up 108's lesson governs it: if a check turns out not to have been done, take the screenshot rather than narrowing the sentence.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev -- --port 5199`

Use the Playwright MCP (the only browser tooling that works on this host) against `http://localhost:5199`. Do **not** verify against production: Sloyd has no server-side state, so `sloyd.autosave.v1` in the browser *is* the user's project, and exercising a feature there would overwrite it with a demo document with nothing to restore from.

- [ ] **Step 2: Build the ambiguity case**

Add two boards. Position them so they share a corner exactly — set the second board's position, via the properties panel, so one of its corners coincides with one of the first's. Record the two positions in the report. This is the case the round exists to fix; every check below is against this document.

- [ ] **Step 3: Check the restricted grab set**

With board A selected and the Move tool armed (`M` or the toolbar button): hover the shared corner and screenshot the marker; then select board B and hover the same pixel. Confirm a marker appears both times (one per owner) and that grabbing it moves the *selected* board each time — read the resulting positions out of `localStorage` (`sloyd.autosave.v1`), not by eye. Before the fix, which board moved was decided by the camera-facing tie-break; the check is that it is now decided by the selection.

- [ ] **Step 4: Check the empty state**

Deselect (parts list, or `Escape` in Select mode then switch to Move). Confirm: the toolbar hint reads *Select a part to move*; hovering anywhere over the boards produces no marker; clicking produces no grab. Screenshot the toolbar with the hint visible.

- [ ] **Step 5: Check the target set is unrestricted**

With board A selected, grab a point on A, then hover points on board B — confirm markers appear on B and that clicking one lands the move exactly. Read both boards' positions out of `localStorage` and assert coincidence numerically, including a target deliberately off the 1/16" grid (invariant 25 — a snap would land it on a sixteenth; the correct result is IEEE-754 noise around the requested value, not a rounded one).

- [ ] **Step 6: Check the grab-drop paths in the UI**

Three sequences, each ending with the marker gone and no move possible:
1. grab a point on A, then select B in the parts list;
2. grab a point on A, then click **+ Add board**;
3. grab a point on A, then duplicate A.

Then confirm the tool still works normally afterward — select a board, grab, commit.

- [ ] **Step 7: Confirm the four snap-move gates still hold**

Unchanged by this round, so this is a regression check, not new ground: the gizmo is absent in Move mode; a click on a board does not select it in Move mode; a click in empty space does not deselect; Delete/Backspace does not delete the board being carried. Also confirm `Escape` still backs out one level at a time, and that opening the cut list and pressing `Escape` closes the sheet while leaving a grab behind it untouched.

- [ ] **Step 8: Check the console**

Read console messages. Expected: 0 errors. Two three.js deprecation warnings are known and expected.

- [ ] **Step 9: Write the report**

Create `docs/browser-verification-selected-board-grabs.md` following the shape of `docs/browser-verification-snap-move.md`: what was checked, with screenshots and the numbers read out of `localStorage`; and an explicit section for what was **not** checked. State plainly that real pointer-capture, touch and OS input timing were not exercised — every interaction is a synthetic `PointerEvent` at a screenshot-located pixel, because snap points have no DOM presence (follow-up 106, unchanged by this round).

- [ ] **Step 10: Add the follow-ups section**

Append `## From the selected-board grabs round` to `docs/follow-ups.md`, numbering from **109** (the file currently ends at 108). Record at minimum:
- the round's non-goals from design §9, each as a decision with its reason — no click-to-select in Move mode, no target restriction, no multi-board moves, no gizmo change;
- the composition note from design §5: the guide-points design's §3.1 filter (grabbable candidates restricted to board-owned points) is subsumed by this one, and whichever ships second must merge them into a single expression rather than stacking two filters;
- anything the browser pass actually found. If it found nothing, say so — a section that records only deferrals is honest; one that implies findings it did not have is not.

- [ ] **Step 11: Update CLAUDE.md**

Two edits, both small:
1. **Invariant 24** — add this round's clearing to the entry's **second** list (the one beginning *"this list is not everything that nulls `grabbed`"*), **not** to the enumerated five. Those five are there because the world moved under a captured position; this one is because the user retargeted the tool. One sentence naming `edit()`'s selection callback and `selectBoard`, and one naming `commitSnapMove`'s mismatch guard as the action-level half.
2. **The status section** — a short paragraph after the snap-move description recording what this round did and why, in the register the surrounding text uses. Update the test count (`npm test` line under Commands, and the "660/660 tests passing" claim) to whatever `npm test` actually reports.

Do not restructure any other part of CLAUDE.md.

- [ ] **Step 12: Final verification**

Run: `npm test && npm run build`

Expected: all tests passing at the count you wrote into CLAUDE.md; build exit 0. Confirm the numbers match before committing — do not write a count you did not read off the terminal.

- [ ] **Step 13: Commit**

```bash
git add docs/browser-verification-selected-board-grabs.md docs/follow-ups.md CLAUDE.md
git commit -m "docs: browser verification and write-ups for selected-board grabs"
```

---

## Deployment

Not part of this plan. Sloyd deploys with `docker compose up -d --build`; read `DEPLOYMENT.local.md` (gitignored) first. This round makes **no schema change**, so a rollback costs nothing but the behaviour itself — a document saved by a build carrying this change still reads `version: 5` and the previous image opens it unchanged.
