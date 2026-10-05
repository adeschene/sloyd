# Hide and Unhide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person can hide parts so they are not drawn or touched, bring them back, and undo either.

**Architecture:**
- `hiddenIds: string[]` is store view state beside `selectedIds`.
- Undo history entries become `{ doc, hiddenIds }`, so a hide or show is one undo entry holding the
  same document object.
- `selectionPatch` drops hidden ids from every selection it writes, so a hidden part can never be
  selected.
- One pure filter, `visibleBoards`, is read by everything in the viewport.
- Parts-list eyes, a Show all button, a Hide others button and H / Shift+H / Alt+H are the controls.

**Tech Stack:** React 19, TypeScript strict, Zustand 5, Vitest 4 + RTL (jsdom),
react-three-fiber.

**Spec:** `docs/superpowers/specs/2026-10-05-sloyd-hide-unhide-design.md`. Read it first. It is the
authority, and this plan argues from it.

## Global Constraints

- Branch `hide-unhide` (already created off master at `871afd3`). Commit to the branch only.
- `npm test` must stay green (1710 tests across 58 files at the start). `npm run build` must pass;
  `npm test` does NOT typecheck.
- **No schema change.** `CURRENT_VERSION` stays 7. Hidden-ness is never written to the document or
  to storage.
- **`hiddenIds` has exactly four writers:** `hideSelected`, `hideUnselected`, `showAll`,
  `setHidden`, all through one private helper. Undo, redo, `replaceDocument` and `deleteBoards`
  only reconcile it.
- **`selectionPatch` stays the ONE writer of `selectedIds`** (invariant 42), and it is where hidden
  ids are filtered out.
- **A hide or show never runs `edit()` and never replaces `doc`.**
- **Invariant 24's prohibition:** no hide or show action may clear `tapeAnchor` or `tapeHover`.
- **Invariant 34:** `gesturing` may be READ inside a store action, never subscribed to by a
  component.
- **Selectors return bare fields (invariant 34's cost argument).** Never
  `useStore((s) => visibleBoards(s.doc.boards, s.hiddenIds))`, which returns a new array on every
  `set()` and re-renders on every gesture boundary. Select `s.doc.boards` and `s.hiddenIds`
  separately and filter in a `useMemo` keyed on both.
- **Invariant 27:** the keys go in `App`'s ONE keydown effect, below its `isTextEntry` and
  `modalOpen` guards.
- **Mutation-test every new test.** Break the code it guards, confirm red, revert. Name each mutation
  and its result in the report. A test that cannot fail does not count.
- Match the surrounding code's style: terse comments that state WHY, no new dependencies.

## Review Focus

1. **A redo that re-hides a selected part.** Expect it to be deselected, and a Move grab it owned
   dropped (Task 1 test).
2. **Ctrl+Z after hiding a part the tape is anchored on.** Expect the measurement to survive the hide
   AND its undo (Task 1 test).
3. **A hidden part selected by a stale click path** (`selectBoard`/`toggleSelected` on a hidden id).
   Expect nothing selected (Task 1 test).
4. **Alt+H on a Mac**, where `e.key` is `˙`. Expect it to show all (Task 4 test, delivered as
   `{ key: '˙', code: 'KeyH', altKey: true }`).
5. **Home with every part hidden.** Expect nothing to happen, rather than framing an empty box. This
   is viewport code with no unit tests by design, so it is a live-check item, and Task 2's code
   keeps the existing `subset.length === 0` early return.

---

### Task 1: The store — hidden set, history entries, undo

**Files:**
- Create: `src/store/visibility.ts`, `src/store/visibility.test.ts`
- Modify: `src/store/store.ts`
- Test: `src/store/store.test.ts` (new `describe('hide and unhide', …)` block at the end)

**Interfaces:**
- Produces:
  - `visibleBoards(boards: readonly Board[], hiddenIds: readonly string[]): readonly Board[]`.
    It returns the SAME array when `hiddenIds` is empty, so memos stay stable.
  - `HistoryEntry = { doc: SloydDocument; hiddenIds: string[] }` (exported from `store.ts`).
  - Store fields:
    - `hiddenIds: string[]`;
    - `past: HistoryEntry[]`, `future: HistoryEntry[]`;
    - `hideSelected(): void`;
    - `hideUnselected(): void`;
    - `showAll(): void`;
    - `setHidden(id: string, hidden: boolean): void`.

- [ ] **Step 1: Write the filter test.** `src/store/visibility.test.ts`:

```ts
import { createBoard } from '../document/document';
import { visibleBoards } from './visibility';

const a = createBoard({});
const b = createBoard({});
const c = createBoard({});

describe('visibleBoards', () => {
  it('drops hidden parts and keeps document order', () => {
    expect(visibleBoards([a, b, c], [c.id, a.id])).toEqual([b]);
  });

  it('returns the SAME array when nothing is hidden, so a memo over it stays stable', () => {
    const boards = [a, b];
    expect(visibleBoards(boards, [])).toBe(boards);
  });

  it('ignores an id that names no part', () => {
    expect(visibleBoards([a, b], ['nope'])).toEqual([a, b]);
  });
});
```

- [ ] **Step 2: Implement it.** `src/store/visibility.ts`:

```ts
import type { Board } from '../document/document';

/**
 * The ONE filter for "which parts are drawn and touchable" (hide/unhide spec
 * §3). Every viewport reader goes through it; a second hand-written filter is
 * a second decider for one question. In the store layer because the store
 * (selectAll) and the viewport both need it.
 *
 * Returns the same array when nothing is hidden, so a useMemo over it does not
 * hand its consumers a new array on every render.
 */
export function visibleBoards(boards: readonly Board[], hiddenIds: readonly string[]): readonly Board[] {
  if (hiddenIds.length === 0) return boards;
  const hidden = new Set(hiddenIds);
  return boards.filter((b) => !hidden.has(b.id));
}
```

Run: `npx vitest run src/store/visibility.test.ts`. Expected: PASS.

- [ ] **Step 3: Write the store tests (failing).** Append to `src/store/store.test.ts`. Add
  `import { visibleBoards } from './visibility';` only if a test needs it. Fixture: three boards,
  with `a` and `b` selected.

```ts
describe('hide and unhide', () => {
  const three = () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    const [a, b, c] = useStore.getState().doc.boards.map((x) => x.id);
    useStore.getState().selectBoard(a!);
    useStore.getState().toggleSelected(b!);
    return { a: a!, b: b!, c: c! };
  };
  const st = () => useStore.getState();
  const corner = (id: string) =>
    boardSnapPoints(st().doc.boards.find((x) => x.id === id)!).find((p) => p.kind === 'corner')!;

  it('hideSelected hides the selection and deselects it', () => {
    const { a, b } = three();
    st().hideSelected();
    expect(st().hiddenIds).toEqual([a, b]);
    expect(st().selectedIds).toEqual([]);
  });

  it('hideUnselected hides every part not selected, and keeps the selection', () => {
    const { a, b, c } = three();
    st().hideUnselected();
    expect(st().hiddenIds).toEqual([c]);
    expect(st().selectedIds).toEqual([a, b]);
  });

  it('hideUnselected with nothing selected does nothing (it would hide everything)', () => {
    three();
    st().selectBoard(null);
    const before = st().past.length;
    st().hideUnselected();
    expect(st().hiddenIds).toEqual([]);
    expect(st().past.length).toBe(before);
  });

  it('showAll empties the set; setHidden toggles one part; no duplicates', () => {
    const { a, c } = three();
    st().setHidden(c, true);
    st().setHidden(c, true);
    expect(st().hiddenIds).toEqual([c]);
    st().setHidden(c, false);
    expect(st().hiddenIds).toEqual([]);
    st().hideSelected();
    st().showAll();
    expect(st().hiddenIds).toEqual([]);
    expect(st().doc.boards.some((x) => x.id === a)).toBe(true);
  });

  it('a hidden part can never be selected', () => {
    const { a, b, c } = three();
    st().setHidden(c, true);
    st().selectBoard(c);
    expect(st().selectedIds).toEqual([]);
    st().toggleSelected(c);
    expect(st().selectedIds).toEqual([]);
    st().selectAll();
    expect(st().selectedIds).toEqual([a, b]);
  });

  it('hiding the owner of a held Move grab drops it; hiding another part keeps it', () => {
    const { a, b } = three();
    st().setTool('move');
    st().grabSnapPoint(corner(a));
    st().setHidden(b, true);
    expect(st().grabbed).not.toBeNull();
    st().setHidden(a, true);
    expect(st().grabbed).toBeNull();
  });

  it('never clears the tape anchor or hover (invariant 24 prohibition), for every hide and show', () => {
    const { a } = three();
    st().setTapeAnchor(corner(a));
    st().setTapeHover(corner(a));
    st().hideSelected();
    st().showAll();
    st().hideUnselected();
    st().setHidden(a, true);
    expect(st().tapeAnchor).not.toBeNull();
    expect(st().tapeHover).not.toBeNull();
  });

  it('never changes the document: same object, one undo entry, redo cleared', () => {
    const { b } = three();
    st().updateBoard(b, { length: 30 });
    st().undo();
    expect(st().future.length).toBe(1);
    const doc = st().doc;
    const before = st().past.length;
    st().hideSelected();
    expect(st().doc).toBe(doc);
    expect(st().past.length).toBe(before + 1);
    expect(st().past.at(-1)!.doc).toBe(doc);
    expect(st().future).toEqual([]);
  });

  it('a hide or show that changes nothing pushes nothing', () => {
    three();
    const before = st().past.length;
    st().showAll();
    st().selectBoard(null);
    st().hideSelected();
    expect(st().past.length).toBe(before);
  });

  it('undo shows the parts again, redo hides them again', () => {
    const { a, b } = three();
    st().hideSelected();
    st().undo();
    expect(st().hiddenIds).toEqual([]);
    expect(st().selectedIds).toEqual([]); // the selection is not undone
    st().redo();
    expect(st().hiddenIds).toEqual([a, b]);
  });

  it('a redo that re-hides a selected part deselects it and drops its grab', () => {
    const { a } = three();
    st().setHidden(a, true);
    st().undo();
    st().selectBoard(a);
    st().setTool('move');
    st().grabSnapPoint(corner(a));
    st().redo();
    expect(st().hiddenIds).toEqual([a]);
    expect(st().selectedIds).toEqual([]);
    expect(st().grabbed).toBeNull();
  });

  it('undoing a hide keeps held points; undoing an edit still clears them', () => {
    const { a, c } = three();
    st().setTapeAnchor(corner(a));
    st().setTapeHover(corner(a));
    st().setHidden(c, true);
    st().undo();
    expect(st().tapeAnchor).not.toBeNull();
    expect(st().tapeHover).not.toBeNull();
    st().updateBoard(c, { length: 30 });
    st().undo();
    expect(st().tapeAnchor).toBeNull();
  });

  it('undoing an edit restores the set recorded with it', () => {
    const { b, c } = three();
    st().setHidden(c, true);
    st().updateBoard(b, { length: 30 });
    st().showAll();
    st().undo(); // the show
    expect(st().hiddenIds).toEqual([c]);
    st().undo(); // the edit: hidden as it was when the edit was made
    expect(st().hiddenIds).toEqual([c]);
    st().undo(); // the hide
    expect(st().hiddenIds).toEqual([]);
  });

  it('is refused while a gesture is open: nothing changes and no entry is pushed', () => {
    const { a, b } = three();
    const before = st().past.length;
    st().beginGesture();
    st().hideSelected();
    st().hideUnselected();
    st().setHidden(a, true);
    st().endGesture();
    expect(st().hiddenIds).toEqual([]);
    expect(st().selectedIds).toEqual([a, b]);
    expect(st().past.length).toBe(before);
  });

  it('deleting a hidden part removes its id; an undo brings it back visible', () => {
    const { c } = three();
    st().setHidden(c, true);
    st().deleteBoards([c]);
    expect(st().hiddenIds).toEqual([]);
    st().undo();
    expect(st().doc.boards.some((x) => x.id === c)).toBe(true);
    expect(st().hiddenIds).toEqual([c]); // the entry recorded it hidden at deletion time
  });

  it('replaceDocument clears the set', () => {
    const { c } = three();
    st().setHidden(c, true);
    st().replaceDocument(createDocument('Other'));
    expect(st().hiddenIds).toEqual([]);
  });

  it('a new part and a copy are visible', () => {
    const { a, b } = three();
    st().setHidden(b, true);
    st().selectBoard(a);
    st().duplicateBoards([a]);
    st().addBoard();
    expect(st().hiddenIds).toEqual([b]);
  });
});
```

  **About the delete test's last line.** The spec says "an undo that brings a deleted part back
  brings it back visible". That holds for a part deleted while VISIBLE, which is the only kind the
  UI can delete: a hidden part cannot be selected, and Delete and the Properties buttons act on the
  selection. For a hidden part deleted through the store directly, the undo entry restores the set
  as it was before the delete, which is coherent (spec §2.1, "undo restores both"). Assert what the
  entry says, as written above, and add one more test for the reachable case:

```ts
  it('a part deleted while visible comes back visible on undo', () => {
    const { a } = three();
    st().deleteBoards([a]);
    st().undo();
    expect(st().hiddenIds).toEqual([]);
  });
```

Run: `npx vitest run src/store/store.test.ts`. Expected: FAIL (`hideSelected` is not a function,
and so on).

- [ ] **Step 4: Implement in `src/store/store.ts`.**

  **4a. Types.** Above `interface StoreState`:

```ts
/**
 * One undo step: the document AND the hidden set as they were (hide/unhide
 * spec §2.1). Hidden-ness is view state, never saved, but it IS undone, so a
 * Ctrl+Z after H shows the parts again. A hide's entry holds the SAME document
 * object, so nothing is copied and autosave does not fire.
 */
export interface HistoryEntry { doc: SloydDocument; hiddenIds: string[] }
```

  Then, in `StoreState`:
  - change `past: SloydDocument[]` to `past: HistoryEntry[]`, and the same for `future`;
  - add, beside `selectedIds`:

```ts
  /**
   * The hidden parts, insertion order, no duplicates (hide/unhide spec §2). View
   * state: never in the document, never saved, but in the undo history. Written
   * ONLY by the four actions below, through `applyHidden`. A hidden part is
   * never selected: selectionPatch filters it out.
   */
  hiddenIds: string[];
  hideSelected: () => void;
  hideUnselected: () => void;
  showAll: () => void;
  setHidden: (id: string, hidden: boolean) => void;
```

  Initialise `hiddenIds: []` beside `selectedIds: []`.

  **4b. `selectionPatch` filters hidden ids.** Replace it with:

```ts
  const selectionPatch = (
    ids: string[],
    hidden: readonly string[] = get().hiddenIds,
  ): { selectedIds: string[]; grabbed?: null } => {
    const held = get().grabbed;
    // A hidden part is never selected (hide/unhide spec §2): filtered HERE, in
    // the one writer, so no caller has to remember it. The same array is kept
    // when nothing is dropped, so a subscriber re-renders only on a real change.
    const kept = hidden.length === 0 ? ids : ids.filter((id) => !hidden.includes(id));
    const selectedIds = kept.length === ids.length ? ids : kept;
    return {
      selectedIds,
      ...(held && !selectedIds.includes(held.owner.id) ? { grabbed: null } : {}),
    };
  };
```

  Update its doc comment: add that it also drops hidden ids, and that `hidden` is passed explicitly
  only by callers that are about to write a NEW hidden set in the same `set()`.

  **4c. `edit()` records the set.** Change `nextPast = [...past, doc].slice(-HISTORY_LIMIT);` to
  `nextPast = [...past, { doc, hiddenIds: get().hiddenIds }].slice(-HISTORY_LIMIT);`.

  **4d. The one writer helper and the four actions.** Put `applyHidden` after `edit`:

```ts
  /**
   * The ONE writer of `hiddenIds` (hide/unhide spec §2.1). Never runs edit() and
   * never replaces `doc`: the entry it pushes holds the SAME document object.
   *
   * Refused while a gesture is open. A hide pushes its own entry, so inside a
   * gesture it would land between the gesture's lazy snapshot (invariant 4) and
   * its later frames, and the drag's tail would undo with the hide. Reading
   * `gesturing` inside an action is allowed; subscribing to it is not
   * (invariant 34).
   *
   * Pushes nothing when the set does not change (invariant 4: no entry that
   * undoes to nothing). Never touches tapeAnchor/tapeHover (invariant 24's
   * prohibition): hiding moves nothing.
   */
  const applyHidden = (next: string[]) => {
    const { doc, hiddenIds, past, selectedIds, gesturing } = get();
    if (gesturing) return;
    const exists = new Set(doc.boards.map((b) => b.id));
    const clean = [...new Set(next)].filter((id) => exists.has(id));
    if (clean.length === hiddenIds.length && clean.every((id) => hiddenIds.includes(id))) return;
    set({
      hiddenIds: clean,
      past: [...past, { doc, hiddenIds }].slice(-HISTORY_LIMIT),
      future: [],
      ...selectionPatch(selectedIds, clean),
    });
  };
```

  In the returned object, beside `selectAll`:

```ts
    hideSelected: () => {
      const { hiddenIds, selectedIds } = get();
      applyHidden([...hiddenIds, ...selectedIds]);
    },

    // With nothing selected this would hide every part, so it does nothing.
    hideUnselected: () => {
      const { hiddenIds, selectedIds, doc } = get();
      if (selectedIds.length === 0) return;
      applyHidden([...hiddenIds, ...doc.boards.map((b) => b.id).filter((id) => !selectedIds.includes(id))]);
    },

    showAll: () => applyHidden([]),

    setHidden: (id, hidden) => {
      const { hiddenIds } = get();
      applyHidden(hidden ? [...hiddenIds, id] : hiddenIds.filter((x) => x !== id));
    },
```

  **4e. `selectAll`** (already goes through `selectionPatch`, which now filters). Leave its code,
  and add a comment: `// Visible parts only: selectionPatch drops hidden ids.`

  **4f. `deleteBoards`** reconciles the set after its `edit()` (the entry `edit()` pushed already
  recorded the set as it was):

```ts
      const hiddenAfter = get().hiddenIds.filter((id) => !doomed.has(id));
      if (hiddenAfter.length !== get().hiddenIds.length) set({ hiddenIds: hiddenAfter });
```

  **4g. `replaceDocument`** adds `hiddenIds: []`.

  **4h. `undo` and `redo`.** Replace both bodies:

```ts
    undo: () => {
      const { past, future, doc, hiddenIds, selectedIds } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1]!;
      set({
        past: past.slice(0, -1),
        future: [{ doc, hiddenIds }, ...future].slice(0, HISTORY_LIMIT),
        ...restore(previous, doc, selectedIds),
      });
    },

    redo: () => {
      const { past, future, doc, hiddenIds, selectedIds } = get();
      if (future.length === 0) return;
      const next = future[0]!;
      set({
        past: [...past, { doc, hiddenIds }].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        ...restore(next, doc, selectedIds),
      });
    },
```

  with this helper beside `applyHidden`. Move the existing undo comments (the blanket clear, and
  invariant 34's prohibition on the gesture flags) onto it:

```ts
  /**
   * What undo and redo both restore from an entry: its document, its hidden set
   * (filtered to that document's parts), and a selection reconciled with both
   * through selectionPatch, so a redo that re-hides a selected part deselects it
   * and drops a grab it owned.
   *
   * Held points: an entry whose document is a DIFFERENT object is a wholesale
   * rewrite, so grabbed / tapeAnchor / tapeHover / tapeAxis clear unconditionally
   * (invariant 24, the reasoning at replaceDocument). An entry holding the SAME
   * object, the undo of a hide or show, moved nothing, so they are kept.
   * Otherwise Ctrl+Z after a hide would drop a measurement the hide itself was
   * forbidden to drop.
   *
   * INVARIANT 34: `gesturing`/`gestureSnapshotTaken` deliberately do NOT join
   * this list. A gesture belongs to the component that opened it.
   */
  const restore = (entry: HistoryEntry, current: SloydDocument, selectedIds: string[]) => {
    const exists = new Set(entry.doc.boards.map((b) => b.id));
    const hidden = entry.hiddenIds.filter((id) => exists.has(id));
    const surviving = selectedIds.filter((id) => exists.has(id));
    return {
      doc: entry.doc,
      hiddenIds: hidden,
      ...selectionPatch(surviving.length === selectedIds.length ? selectedIds : surviving, hidden),
      ...(entry.doc === current ? {} : { grabbed: null, tapeAnchor: null, tapeHover: null, tapeAxis: null }),
    };
  };
```

  The final spread must come AFTER `selectionPatch`'s, so a document change clears `grabbed` even
  when `selectionPatch` would keep it.

  **4i. Fix the compile.** `npm run build`. Anything that read `past[i]` or `future[i]` as a
  document now reads `.doc`. A grep found no non-test reader of entry contents.
  `useStore.setState({ past: [], future: [] })` in tests still typechecks.

- [ ] **Step 5: Run.** `npx vitest run src/store` then `npm test`, then `npm run build`. Expected:
  all pass.

- [ ] **Step 6: Mutation-test.** At least these, each red then reverted:
  - in `applyHidden`, pass `selectedIds` without the `clean` argument to `selectionPatch` ("hideSelected
    hides … deselects" and the grab test must go red);
  - delete the `selectionPatch` hidden filter (the "never selected" test);
  - delete `if (gesturing) return;` (the gesture test);
  - delete the no-change early return (the "changes nothing" test);
  - in `restore`, use `entry.hiddenIds` without filtering, AND separately use the current
    `hiddenIds` instead of the entry's (the undo/redo tests);
  - make the held-point clear unconditional (the "undoing a hide keeps held points" test);
  - drop the `hidden` argument in `restore`'s `selectionPatch` call (the redo-re-hides test);
  - remove `hideUnselected`'s empty-selection guard;
  - remove the `deleteBoards` reconciliation.

  Report each and its result.

- [ ] **Step 7: Commit.**

```bash
git add src/store/visibility.ts src/store/visibility.test.ts src/store/store.ts src/store/store.test.ts
git commit -m "feat(store): hidden set — four writers, history entries carry it, selection never holds a hidden part"
```

---

### Task 2: The viewport reads visible parts only

**Files:**
- Modify: `src/viewport/moveCandidates.ts`, `src/viewport/MoveTool.tsx`,
  `src/viewport/TapeTool.tsx`, `src/viewport/Viewport.tsx`
- Test: `src/viewport/moveCandidates.test.ts`

**Interfaces:**
- Consumes: `visibleBoards` from `src/store/visibility.ts`; `hiddenIds` from the store.
- Produces: `moveCandidates(boards, guides, selectedIds, hiddenIds, grabbing, showGuides)`.
  `hiddenIds: readonly string[]` is inserted as the FOURTH parameter. It is required, with no
  default, so a caller cannot forget it.

- [ ] **Step 1: Failing test.** In `moveCandidates.test.ts`:
  - update the existing calls to pass `[]` as the new fourth argument;
  - add:

```ts
  it('a hidden part is never a target, and never a grab source', () => {
    const after = moveCandidates(boards, guides, [a.id], [c.id], true, true);
    expect(owners(after)).toEqual(new Set([b.id, guides[0]!.id]));
    // Defensive: a selected id that is also hidden offers nothing (the store
    // never produces this state; the filter is one rule, not two).
    const before = moveCandidates(boards, guides, [a.id], [a.id], false, true);
    expect(before).toEqual([]);
  });
```

  Run it. Expected: FAIL (type error, or wrong owners).

- [ ] **Step 2: Implement `moveCandidates`.**

```ts
export function moveCandidates(
  boards: readonly Board[],
  guides: GuidePoint[],
  selectedIds: readonly string[],
  hiddenIds: readonly string[],
  grabbing: boolean,
  showGuides: boolean,
): SnapPoint[] {
  const selected = new Set(selectedIds);
  // A hidden part offers no points at all: a marker must sit on something
  // drawn (invariant 16; hide/unhide spec §3).
  const shown = visibleBoards(boards, hiddenIds);
  if (grabbing) {
    return [
      ...shown.filter((b) => !selected.has(b.id)).flatMap(snapPointsFor),
      ...(showGuides ? guideSnapPoints(guides) : []),
    ];
  }
  return shown.filter((b) => selected.has(b.id)).flatMap(snapPointsFor);
}
```

  Import `visibleBoards` from `'../store/visibility'`. Add one sentence to the doc comment.

- [ ] **Step 3: `MoveTool.tsx`.**
  - add `const hiddenIds = useStore((s) => s.hiddenIds);`;
  - pass it as the fourth argument;
  - add `hiddenIds` to the memo's deps (invariant 15: the deps are exactly what `moveCandidates`
    reads);
  - update the comment near line 181 that lists what the memo depends on.

- [ ] **Step 4: `TapeTool.tsx`.**
  - add `const hiddenIds = useStore((s) => s.hiddenIds);`;
  - change the candidates memo to
    `[...visibleBoards(boards, hiddenIds).flatMap(snapPointsFor), ...(showGuides ? guideSnapPoints(guides) : [])]`,
    with deps `[boards, hiddenIds, guides, showGuides]`;
  - in the doc comment's "withholds nothing" paragraph, add: "except hidden parts, which are not
    drawn (hide/unhide spec §3)";
  - update the comment near line 250 that lists the memo's deps.

- [ ] **Step 5: `Viewport.tsx`.**
  - **The board render** (the scene component near line 260):
    - add `const hiddenIds = useStore((s) => s.hiddenIds);`;
    - add `const shown = useMemo(() => visibleBoards(boards, hiddenIds), [boards, hiddenIds]);`
      (import `useMemo` if needed);
    - map `shown` instead of `boards`.
  - **`CameraKeys`:**
    - subscribe to `hiddenIds` the same way;
    - change `frame`'s parameter type to `readonly Board[]`;
    - `Home` frames `visibleBoards(boards, hiddenIds)`. The existing `subset.length === 0` early
      return already makes Home a no-op with everything hidden (Review Focus 5). Do NOT remove it;
    - add `hiddenIds` to the effect's dep list;
    - the projection-swap re-frame reads
      `const s = useStore.getState(); frame(visibleBoards(s.doc.boards, s.hiddenIds));`, still
      imperative, for the reason its comment gives.
  - `f` is unchanged: it frames the selection, which never holds a hidden part.

- [ ] **Step 6: Run and mutate.**
  - `npm test` and `npm run build`. Expected: pass.
  - Mutation: in `moveCandidates`, use `boards` instead of `shown` in the grabbing branch. The new
    test must go red. Revert.
  - The viewport components have no unit tests by design. Their behaviour is a live-check item.

- [ ] **Step 7: Commit.**

```bash
git add src/viewport/moveCandidates.ts src/viewport/moveCandidates.test.ts src/viewport/MoveTool.tsx src/viewport/TapeTool.tsx src/viewport/Viewport.tsx
git commit -m "feat(viewport): hidden parts are not drawn, framed or offered as snap points"
```

---

### Task 3: Parts list eyes, Show all, and Hide others

**Files:**
- Modify: `src/panels/PartsList.tsx`, `src/panels/Properties.tsx`, `src/styles.css`
- Test: `src/panels/PartsList.test.tsx`, `src/panels/Properties.test.tsx`

**Interfaces:**
- Consumes: `hiddenIds`, `setHidden`, `showAll`, `hideUnselected` from the store.

**Ruling recorded here:** the spec puts **Show all (N)** "beside the Parts heading". The heading
`<h2>Parts</h2>` is in `App.tsx`. Render the button inside `PartsList`, as its first child above the
list, so the component owns everything it needs; it sits directly under the heading. Cost if wrong:
a one-line move.

- [ ] **Step 1: Failing tests.** In `PartsList.test.tsx`, using the existing `threeParts()` fixture
  (names `Board`, `Board (1)`, `Board (2)`, nothing selected):

```ts
describe('PartsList hiding', () => {
  it('each row has an eye whose label carries the state', async () => {
    const [a] = threeParts();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Hide Board' }));
    expect(useStore.getState().hiddenIds).toEqual([a]);
    expect(screen.getByRole('button', { name: 'Show Board' })).toBeInTheDocument();
  });

  it("a hidden row's name is disabled, and only its eye works", async () => {
    threeParts();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Hide Board' }));
    const name = screen.getByRole('button', { name: 'Board' });
    expect(name).toBeDisabled();
    await user.click(name);
    expect(useStore.getState().selectedIds).toEqual([]);
  });

  it('Show all (N) appears only while something is hidden, and shows everything', async () => {
    threeParts();
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Hide Board' }));
    await user.click(screen.getByRole('button', { name: 'Hide Board (2)' }));
    await user.click(screen.getByRole('button', { name: 'Show all (2)' }));
    expect(useStore.getState().hiddenIds).toEqual([]);
    expect(screen.queryByRole('button', { name: /^Show all/ })).toBeNull();
  });
});
```

  Note: `getByRole('button', { name: 'Board' })` must still find the NAME button, and not
  `Hide Board`. Accessible names match exactly, so it does.

  In `Properties.test.tsx`:

```ts
describe('Hide others', () => {
  it('in the single-part panel, hides every other part', async () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    const [a, b] = useStore.getState().doc.boards.map((x) => x.id);
    useStore.getState().selectBoard(a!);
    render(<Properties />);
    await userEvent.click(screen.getByRole('button', { name: 'Hide others' }));
    expect(useStore.getState().hiddenIds).toEqual([b]);
  });

  it('in the group panel, hides every unselected part', async () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    const [a, b, c] = useStore.getState().doc.boards.map((x) => x.id);
    useStore.getState().selectBoard(a!);
    useStore.getState().toggleSelected(b!);
    render(<Properties />);
    await userEvent.click(screen.getByRole('button', { name: 'Hide others' }));
    expect(useStore.getState().hiddenIds).toEqual([c]);
  });
});
```

  Run them. Expected: FAIL.

- [ ] **Step 2: `PartsList.tsx`.**

```tsx
import { useStore } from '../store/store';
import { selectByClick } from '../store/selectionGesture';

/** An eye, or a struck-through eye. Inline because the app has no icon set. */
function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      {hidden && <line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" strokeWidth="1.5" />}
    </svg>
  );
}

export function PartsList() {
  const boards = useStore((s) => s.doc.boards);
  const selectedIds = useStore((s) => s.selectedIds);
  const hiddenIds = useStore((s) => s.hiddenIds);
  const setHidden = useStore((s) => s.setHidden);
  const showAll = useStore((s) => s.showAll);

  if (boards.length === 0) {
    return <p className="empty">No parts yet. Add a board to begin.</p>;
  }

  return (
    <>
      {/* The count is the point: with parts hidden, an emptier model must
          never read as a bug (hide/unhide spec §4.1). */}
      {hiddenIds.length > 0 && (
        <button className="parts-show-all" onClick={showAll}>Show all ({hiddenIds.length})</button>
      )}
      <ul className="parts">
        {boards.map((b) => {
          const selected = selectedIds.includes(b.id);
          const hidden = hiddenIds.includes(b.id);
          return (
            <li key={b.id} className={hidden ? 'part-row hidden' : 'part-row'}>
              <button
                className="part-eye"
                aria-label={`${hidden ? 'Show' : 'Hide'} ${b.name}`}
                onClick={() => setHidden(b.id, !hidden)}
              >
                <EyeIcon hidden={hidden} />
              </button>
              {/* aria-pressed: with several parts selectable, each row is a
                  toggle. A hidden part cannot be selected (spec §1), so its
                  name is disabled and only the eye works. */}
              <button
                className={selected ? 'part selected' : 'part'}
                aria-pressed={selected}
                disabled={hidden}
                onClick={(e) => selectByClick(b.id, e)}
              >
                {b.name}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
```

- [ ] **Step 3: CSS** in `src/styles.css`, in the parts-list section, using the existing tokens:

```css
.part-row {
  display: flex;
  align-items: stretch;
}

.part-eye {
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 6px;
  background: none;
  border: 0;
  border-radius: 0;
  color: var(--ink-dim);
  cursor: pointer;
}

.part-eye:hover {
  color: var(--ink);
}

.part-row.hidden .part {
  opacity: 0.45;
  cursor: default;
}

.parts-show-all {
  margin: 0 0 6px;
  align-self: flex-start;
}
```

  `.part` is `display: block; width: 100%`. Inside the flex row, add `.part-row .part { flex: 1;
  min-width: 0; }` so it fills the remainder.

- [ ] **Step 4: `Properties.tsx`.** In BOTH button rows (the group panel near line 342, and the
  single panel near line 477), add between Duplicate and Delete:

```tsx
        <button onClick={hideUnselected}>Hide others</button>
```

  Use `const hideUnselected = useStore((s) => s.hideUnselected);` in each component.

- [ ] **Step 5: Run and mutate.**
  - `npm test` and `npm run build`. Expected: pass.
  - Mutations, each red then reverted:
    - remove `disabled={hidden}` (the disabled-row test);
    - render Show all unconditionally (the Show all test);
    - wire Hide others to `hideSelected` (both Hide others tests).

- [ ] **Step 6: Commit.**

```bash
git add src/panels/PartsList.tsx src/panels/PartsList.test.tsx src/panels/Properties.tsx src/panels/Properties.test.tsx src/styles.css
git commit -m "feat(panels): eye per part, Show all (N), Hide others"
```

---

### Task 4: H, Shift+H and Alt+H

**Files:**
- Modify: `src/App.tsx` (the ONE keydown effect)
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `hideSelected`, `hideUnselected`, `showAll`.

- [ ] **Step 1: Failing tests.** In `App.test.tsx`, beside the Ctrl/Cmd+A tests, reuse
  `mountWithThreeBoards()`. It leaves the first board (`Board`) selected and returns
  `{ user, ids }`.

```ts
  it('H hides the selection', async () => {
    const { user, ids } = await mountWithThreeBoards();
    await user.keyboard('h');
    expect(useStore.getState().hiddenIds).toEqual([ids[0]]);
  });

  it('Shift+H hides everything else', async () => {
    const { user, ids } = await mountWithThreeBoards();
    await user.keyboard('{Shift>}H{/Shift}');
    expect(useStore.getState().hiddenIds).toEqual([ids[1], ids[2]]);
  });

  it("Alt+H shows all, matched by the physical key (a Mac's Option+H types ˙)", async () => {
    const { user } = await mountWithThreeBoards();
    await user.keyboard('h');
    fireEvent.keyDown(document.body, { key: '˙', code: 'KeyH', altKey: true });
    expect(useStore.getState().hiddenIds).toEqual([]);
  });

  it('Ctrl+H does nothing', async () => {
    await mountWithThreeBoards();
    fireEvent.keyDown(document.body, { key: 'h', code: 'KeyH', ctrlKey: true });
    expect(useStore.getState().hiddenIds).toEqual([]);
  });

  it('H does nothing in a text field', async () => {
    await mountWithThreeBoards();
    const projectName = screen.getByLabelText('Project name');
    act(() => projectName.focus());
    fireEvent.keyDown(projectName, { key: 'h', code: 'KeyH' });
    expect(useStore.getState().hiddenIds).toEqual([]);
    act(() => projectName.blur());
  });

  it('H does nothing while the cut list is open', async () => {
    const { user } = await mountWithThreeBoards();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    await user.keyboard('h');
    expect(useStore.getState().hiddenIds).toEqual([]);
  });

  it('H then Ctrl+Z shows the part again', async () => {
    const { user } = await mountWithThreeBoards();
    await user.keyboard('h');
    await user.keyboard('{Control>}z{/Control}');
    expect(useStore.getState().hiddenIds).toEqual([]);
  });
```

  The Alt+H and Ctrl+H events are dispatched on `document.body`, so they bubble to the window
  listener with an element target, as a real keypress does (`isTextEntry` reads the target).

  Run. Expected: FAIL.

- [ ] **Step 2: Implement.** In `App.tsx`'s keydown effect, after the T block and before the X/Y/Z
  block:

```ts
      // H hides the selection, Shift+H everything else, Alt+H shows all
      // (hide/unhide spec §4.3). Alt+H matches the PHYSICAL key: on a Mac,
      // Option+H types '˙', so matching e.key would make it dead there (the
      // same reason Backspace counts as Delete). Ctrl/Cmd+H is left alone:
      // Cmd+H hides the browser on a Mac.
      if (e.code === 'KeyH' || e.key === 'h' || e.key === 'H') {
        if (e.ctrlKey || e.metaKey) return;
        const { hideSelected, hideUnselected, showAll } = useStore.getState();
        e.preventDefault();
        if (e.altKey) showAll();
        else if (e.shiftKey) hideUnselected();
        else hideSelected();
        return;
      }
```

  The early `return` for Ctrl/Meta is safe here, unlike for `z`: no other branch below wants an
  H chord.

- [ ] **Step 3: Run and mutate.**
  - `npm test` and `npm run build`. Expected: pass.
  - Mutations, each red then reverted:
    - match Alt+H by `e.key === 'h'` only (the `˙` test);
    - remove the Ctrl/Meta return (the Ctrl+H test);
    - swap the Shift and plain branches.

- [ ] **Step 4: Commit.**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(app): H hides the selection, Shift+H the rest, Alt+H shows all"
```

---

### Task 5: Docs

**Files:** `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md`.

- [ ] **Step 1: CLAUDE.md.**
  - **A new invariant 43** (append it; never renumber). Its substance:
    - **The writer rule.** `hiddenIds` has four writers, all through `applyHidden`, which never
      runs `edit()` and never replaces `doc`.
    - **Hidden parts are never selected.** `selectionPatch` filters hidden ids, so it is structural.
    - **The history entry is `{ doc, hiddenIds }`.** A hide pushes one entry holding the SAME
      document object.
    - **A hide is refused while `gesturing`,** and why: it would split a drag's undo.
    - **Undo and redo keep held points when the restored document is the same object.**
    - **The prohibition:** a hide never clears `tapeAnchor` or `tapeHover`.
    - **The selector rule:** select `boards` and `hiddenIds` as bare fields; filter in a memo.
  - **Where things live:**
    - `src/store/visibility.ts`;
    - `moveCandidates`' new parameter;
    - PartsList's eye and Show all;
    - Properties' Hide others;
    - App's H keys.
  - **Invariant 24:** widen its "world moved" bullet. Undo and redo clear held points only when the
    restored document is a different object; point at invariant 43.
  - **Invariant 27:** list H with the other keys in "Where things live".
  - **Status:** a paragraph for this round, "on branch, not merged".
  - **Rounds table:** a row for this round. Update the test count everywhere it appears.
- [ ] **Step 2: `docs/history.md`.** Add the round's entry at the top of "What each round did", in
  the multi-select entry's shape. It covers:
  - decomposition and order;
  - the rulings (view state, all four controls, no selection of hidden parts, undo added after the
    first draft);
  - the change;
  - the two spec corrections found while planning: the selection filtered structurally, and held
    points kept across a document-identical undo.
- [ ] **Step 3: `docs/follow-ups.md`.** Add a numbered entry for each residue found during the
  round. If there are none, write none.
- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md docs/history.md docs/follow-ups.md
git commit -m "docs: hide/unhide round — invariant 43, history, where things live"
```
