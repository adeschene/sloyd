# Multi-select Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a person can select several parts and, in one step each, move them together (gizmo and Move tool), delete or duplicate them, and set their Length, Width, Thickness, Grain or Material.

**Architecture:** the store's `selectedId: string | null` becomes `selectedIds: string[]`.
- `selectionPatch` is the one writer of the list. It also applies invariant 24's retargeting rule to the set.
- The group operations are store actions, each one `edit()`:
  - `deleteBoards`, `duplicateBoards` and `updateBoards` (the singular actions delegate to them);
  - `moveGroupTo` for the gizmo;
  - `commitSnapMove`, widened to translate every selected part.
- The r3f components only wire these up. The decisions they would otherwise make live in pure modules with unit tests:
  - `store/selectionGesture.ts`: modifier clicks and the missed-click rule;
  - `viewport/moveCandidates.ts`: the Move tool's two candidate sets;
  - `document/geometry.ts` `boardsBounds`: the group box.
- Properties gains a group mode. `DimensionField` learns a `null` ("mixed") value.

**Tech Stack:** React 19, TypeScript (strict), Zustand 5, Vitest 4 + Testing Library (globals, jsdom), react-three-fiber 9.

**Spec:** `docs/superpowers/specs/2026-10-05-sloyd-multi-select-design.md`. Read it; this plan argues from it. Where the two disagree, see **Spec clarifications** below. The code decided each one.

## Global Constraints

- **Branch:** `multi-select`, cut from `master`. **No pull requests**: merge locally with `git merge --no-ff` after the live check, on the user's word.
- **Every commit** ends with the trailer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **The gates, at the end of EVERY task:** `npm test` all green AND `npm run build` passing.
  - `npm test` does not typecheck.
  - `tsconfig.app.json` includes test files, so a test still reading `selectedId` fails `npm run build`, not `npm test`.
- **No schema change.** `CURRENT_VERSION` stays **7**. Nothing under `src/document/` changes except:
  - `geometry.ts` gains `boardsBounds`, re-exported from `document.ts`;
  - two doc comments that name `selectedId`.

  `generate/`, `llm/`, `storage/`, the cut list, nesting, diagrams and joinery are untouched.
- **Selection is view state** (spec §2): not saved, not undone, not in the document.
  - Order is insertion order.
  - No id appears twice.
  - There is **no primary part**: no field, variable or prop may single one out.
- **Invariants that bind, by number.** Each task names the ones it touches: 2, 3, 4, 5, 8, 10, 15, 24, 25, 26, 27, 34.
  - **Invariant 34's selector rule, restated because it decides how components read the selection.** Every `useStore` call passes a selector returning a bare field or a single element reference.
  - `s.selectedIds` is fine. `s.doc.boards.filter(...)` inside a selector is NOT: under Zustand 5 a fresh array per call loops or re-renders on every `set()`.
  - Subscribe to `s.doc.boards` and `s.selectedIds` separately and derive with `useMemo`.
- **UI strings, exact:**
  - heading `` `${n} parts selected` ``;
  - placeholder `mixed`;
  - disabled select option `mixed`;
  - the existing hint `Select a part to move` (unchanged).
- **Out of scope (spec §1):**
  - group rotate or reorient;
  - parts-list range select and box select;
  - group name, X/Y/Z, posture, turn and cuts.

  Escape does not clear a selection (spec §5).
- **Mutation-test every test this plan supplies.** Each key test lists the mutations it must go red against.
  - Apply each one, run the test, confirm red, revert. Record the result in the task report.
  - A test that survives its listed mutation is a plan failure. STOP and report it. Do not weaken the mutation.
  - CLAUDE.md's ledger: six plan-supplied tests in one round could not fail.
- **When an expectation looks wrong:**
  - never edit a test's expected value to make it pass. Fix the code;
  - if you believe a plan-supplied expectation or code block is itself wrong, STOP and report it with your evidence;
  - plan-supplied code has been wrong more than ten times in this repo.
- **The r3f viewport has no unit tests by design.** `Gizmo.tsx`, `MoveTool.tsx`, `Viewport.tsx` and `BoardMesh.tsx` are verified in the live check (After the tasks). Each task touching them says what the live check covers.

## Spec clarifications (where the spec and the code disagreed)

1. **`f` with nothing selected.** Spec §3 says it "frames everything, as today". Today it does nothing: `CameraKeys` filters to the selection, gets an empty subset and returns. Only `Home` frames everything. The spec's intent is "unchanged", so **`f` with nothing selected stays a no-op**, and `f` with a selection frames the whole selection.
2. **`replaceDocument` and the selection.** Spec §2 says `undo`, `redo` and `replaceDocument` "keep only the ids that still exist (today they keep `selectedId` only when it still exists)". Only `undo` and `redo` filter today. `replaceDocument` clears unconditionally, and `store.test.ts` pins it ("installs the document and clears history and selection"). A replaced document is a different project, and carrying a selection into it would be wrong. **`replaceDocument` keeps clearing** (`selectedIds: []`). `undo` and `redo` filter.
3. **"Out of range for any selected part" (spec §4.4).** Length, Width and Thickness have exactly one range rule in `DimensionField`, the default `> 0`. It is identical for every part, and single-part mode has no per-part `max` on these fields. So the refusal is DimensionField's own, applied before `onCommit` is called. The test is: `0` is refused and no part is written. No new per-part constraint is invented.
4. **Selecting in the Move tool.** `BoardMesh`'s `selectable` is false outside the Select tool (shipped behaviour, kept). So modifier clicks in the viewport work in the Select tool, and the parts list is how the selection changes in Move mode. The spec is silent on this; nothing changes.
5. **The single-part gizmo path is not routed through the group path.** For a non-dyadic `old`, routing one board through `moveGroupTo` computes `old + (snap(t) − old)`, which is not bit-identical to today's `snap(t)`. The spec says one selected part changes nothing, so `Gizmo.tsx` keeps its single-board `commit` byte for byte.

## Review Focus

These are the five unexercised input classes most likely to bite a user. Each has a test in its owning task.

1. **A selection containing a part that an undo removes.** Expected:
   - the selection keeps only the survivors;
   - Properties drops to the single-part panel when one survivor is left;
   - nothing reads a stale id.

   Pinned in Task 1 (store: undo and redo filtering) and Task 7 (Properties).
2. **Ctrl/Cmd+A while a text field has focus.** Expected: the browser's select-all-text runs, the parts selection is unchanged, and the event is **not** `preventDefault`ed. Pinned in Task 3 (App).
3. **A mixed field, or a mixed select, focused and blurred untouched.** Expected:
   - nothing is written and no undo entry is pushed;
   - no error appears;
   - the box is still empty with its `mixed` placeholder.

   Pinned in Task 6 (DimensionField) and Task 7 (Properties).
4. **A group gizmo drag where one part sits off the 1/16in grid.** Expected:
   - the group's min corner lands on the grid;
   - the off-grid part moves by exactly the same delta and stays off-grid;
   - relative layout is kept.

   Pinned in Task 2 (`moveGroupTo`).
5. **Shift-clicking (toggling) a part while a Move grab is held.** Expected:
   - toggling out a selected part that is not the grab's owner keeps the grab, and that part becomes a snap target;
   - toggling out the owner drops the grab.

   Pinned in Task 1 (store) and Task 4 (`moveCandidates`).

One more is pinned beyond the five, because it is invariant 18's distinction showing through. Two parts whose thicknesses **display** alike but are **stored** differently (0.7 and 0.6875, both `11/16"`) show `mixed`, and typing `3/4` writes exactly 0.75 to both. Pinned in Task 7.

---

### Task 1: The selection set — `selectedIds`, three actions, group delete and duplicate, and every reader migrated

**Files:**
- Modify: `src/store/store.ts`
- Modify (mechanical migration, single-select behaviour preserved):
  - `src/viewport/Gizmo.tsx:230-231`
  - `src/viewport/MoveTool.tsx:48,120-122`
  - `src/viewport/Viewport.tsx:61,122,137,257,359`
  - `src/panels/PartsList.tsx:5,17`
  - `src/panels/Properties.tsx:259`
  - `src/panels/Toolbar.tsx:100,152`
  - `src/App.tsx:729-732`
- Modify (comments only): `src/document/document.ts:108`, `src/panels/GuidesList.tsx:8`
- Test: `src/store/store.test.ts`, `src/App.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces (store), used by every later task:
  - `selectedIds: string[]`;
  - `selectBoard(id: string | null): void`;
  - `toggleSelected(id: string): void`;
  - `selectAll(): void`;
  - `deleteBoards(ids: string[]): void` (one undo entry);
  - `duplicateBoards(ids: string[]): void` (one undo entry; selects the copies);
  - `deleteBoard(id)` and `duplicateBoard(id)`, kept, now delegating to the plural actions;
  - `edit()`'s `selection` callback now returns `string[]`.

- [ ] **Step 0: Branch**

```bash
cd /home/alec/docker/sloyd && git checkout -b multi-select
```

- [ ] **Step 1: Write the failing store tests**

Append to `src/store/store.test.ts`:

```ts
describe('multi-select — the selection set', () => {
  /** Three boards, nothing selected. */
  const threeBoards = () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    useStore.getState().selectBoard(null);
    const [a, b, c] = useStore.getState().doc.boards;
    return { a: a!, b: b!, c: c! };
  };
  const ids = () => useStore.getState().selectedIds;
  const cornerOf = (id: string) =>
    boardSnapPoints(useStore.getState().doc.boards.find((x) => x.id === id)!)
      .find((p) => p.kind === 'corner')!;

  it('selectBoard replaces the selection with one part, or clears it', () => {
    const { a, b } = threeBoards();
    useStore.getState().toggleSelected(a.id);
    useStore.getState().selectBoard(b.id);
    expect(ids()).toEqual([b.id]);
    useStore.getState().selectBoard(null);
    expect(ids()).toEqual([]);
  });

  it('toggleSelected adds a part in the order selected, and removes it again', () => {
    const { a, c } = threeBoards();
    useStore.getState().toggleSelected(c.id);
    useStore.getState().toggleSelected(a.id);
    // Insertion order, not document order (spec §2).
    expect(ids()).toEqual([c.id, a.id]);
    useStore.getState().toggleSelected(c.id);
    expect(ids()).toEqual([a.id]);
  });

  it('never holds an id twice', () => {
    const { a, b } = threeBoards();
    useStore.getState().toggleSelected(a.id);
    useStore.getState().toggleSelected(b.id);
    useStore.getState().toggleSelected(a.id);
    useStore.getState().toggleSelected(a.id);
    expect(ids()).toEqual([b.id, a.id]);
  });

  it('selectAll selects every part, in document order', () => {
    const { a, b, c } = threeBoards();
    useStore.getState().toggleSelected(c.id);
    useStore.getState().selectAll();
    expect(ids()).toEqual([a.id, b.id, c.id]);
  });

  it('is view state: no selection change leaves an undo entry', () => {
    const { a, b } = threeBoards();
    const before = useStore.getState().past.length;
    useStore.getState().toggleSelected(a.id);
    useStore.getState().selectAll();
    useStore.getState().selectBoard(b.id);
    expect(useStore.getState().past.length).toBe(before);
  });

  it('undo keeps only the selected parts that still exist', () => {
    const { a, b } = threeBoards();
    useStore.getState().selectAll();
    useStore.getState().undo(); // un-adds c
    expect(ids()).toEqual([a.id, b.id]);
  });

  it('undo keeps the whole selection when every selected part survives', () => {
    const { a, b } = threeBoards();
    useStore.getState().updateBoard(a.id, { length: 30 });
    useStore.getState().toggleSelected(a.id);
    useStore.getState().toggleSelected(b.id);
    useStore.getState().undo(); // un-does the length edit; nothing is removed
    expect(ids()).toEqual([a.id, b.id]);
  });

  it('redo keeps only the selected parts that still exist', () => {
    const { a, b } = threeBoards();
    useStore.getState().deleteBoards([b.id]);
    useStore.getState().undo(); // b is back
    useStore.getState().toggleSelected(a.id);
    useStore.getState().toggleSelected(b.id);
    useStore.getState().redo(); // b is gone again
    expect(ids()).toEqual([a.id]);
  });

  it('deleteBoards removes every named part as ONE undo entry', () => {
    const { a, b, c } = threeBoards();
    useStore.getState().selectAll();
    const before = useStore.getState().past.length;
    useStore.getState().deleteBoards([a.id, c.id]);
    expect(useStore.getState().doc.boards.map((x) => x.id)).toEqual([b.id]);
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(ids()).toEqual([b.id]);
    useStore.getState().undo();
    expect(useStore.getState().doc.boards.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
  });

  it('deleteBoards with no existing id leaves no undo entry', () => {
    threeBoards();
    const before = useStore.getState().past.length;
    useStore.getState().deleteBoards(['nope']);
    useStore.getState().deleteBoards([]);
    expect(useStore.getState().past.length).toBe(before);
  });

  it('duplicateBoards copies every named part in place as ONE undo entry, names unique, copies selected', () => {
    const { a, b } = threeBoards();
    useStore.getState().updateBoard(a.id, { name: 'Leg', position: [1, 0, 2] });
    useStore.getState().updateBoard(b.id, { name: 'Leg (1)', position: [10, 0, 2] });
    useStore.getState().addCut(a.id);
    const before = useStore.getState().past.length;
    useStore.getState().duplicateBoards([a.id, b.id]);
    const boards = useStore.getState().doc.boards;
    const copies = boards.slice(3);
    expect(useStore.getState().past.length).toBe(before + 1);
    // Named against the document AS IT GROWS (invariant 8): naming both
    // against the original boards would give two "Leg (2)".
    expect(copies.map((x) => x.name)).toEqual(['Leg (2)', 'Leg (3)']);
    expect(copies.map((x) => x.position)).toEqual([[1, 0, 2], [10, 0, 2]]);
    expect(ids()).toEqual(copies.map((x) => x.id));
    const sourceCut = boards.find((x) => x.id === a.id)!.cuts[0]!;
    expect(copies[0]!.cuts[0]!.id).not.toBe(sourceCut.id);
    expect({ ...copies[0]!.cuts[0]!, id: '' }).toEqual({ ...sourceCut, id: '' });
  });

  // Review Focus 5, store half.
  it('keeps a held grab when a DIFFERENT selected part is toggled out', () => {
    const { a, b } = threeBoards();
    useStore.getState().toggleSelected(a.id);
    useStore.getState().toggleSelected(b.id);
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().toggleSelected(b.id);
    expect(useStore.getState().grabbed?.owner.id).toBe(a.id);
  });

  it('drops a held grab when its OWNER is toggled out', () => {
    const { a, b } = threeBoards();
    useStore.getState().toggleSelected(a.id);
    useStore.getState().toggleSelected(b.id);
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().toggleSelected(a.id);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('keeps a held grab when another part is toggled IN, or everything is selected', () => {
    const { a, c } = threeBoards();
    useStore.getState().toggleSelected(a.id);
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().toggleSelected(c.id);
    expect(useStore.getState().grabbed?.owner.id).toBe(a.id);
    useStore.getState().selectAll();
    expect(useStore.getState().grabbed?.owner.id).toBe(a.id);
  });

  it('deleteBoards keeps a grab whose owner survives, and drops one whose owner is deleted', () => {
    const { a, b, c } = threeBoards();
    useStore.getState().selectAll();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().deleteBoards([b.id, c.id]);
    expect(useStore.getState().grabbed?.owner.id).toBe(a.id);
    expect(ids()).toEqual([a.id]);
    useStore.getState().deleteBoards([a.id]);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('refuses a snap move when the grabbed board is not among the selected', () => {
    const { a, b, c } = threeBoards();
    useStore.getState().updateBoard(c.id, { position: [40, 0, 0] });
    useStore.getState().toggleSelected(a.id);
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    // Reach past the store's own clearing to build the state under test.
    useStore.setState({ selectedIds: [b.id] });
    const before = useStore.getState().past.length;
    useStore.getState().commitSnapMove(cornerOf(c.id));
    expect(useStore.getState().past.length).toBe(before);
    expect(useStore.getState().grabbed).not.toBeNull();
  });
});

// Invariant 24's prohibition, extended to the two new actions (spec §3). The
// fixture makes the selection really MOVE in each case: a test whose selection
// never changes claims more than its fixture does (follow-up 126's shape).
describe('tape held points are NOT cleared by the new selection actions', () => {
  const anchoredAndLatched = () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    useStore.getState().selectBoard(null);
    const [a, b, c] = useStore.getState().doc.boards;
    const far = boardSnapPoints(b!).find((p) => p.at[0] > 0);
    if (!far) throw new Error('fixture: expected a snap point off the min corner');
    useStore.getState().setTapeAnchor(boardSnapPoints(a!)[0]!);
    useStore.getState().setTapeHover(far);
    return { a: a!, b: b!, c: c! };
  };

  it('toggleSelected, in and out, leaves the anchor and the latched hover alone', () => {
    const { a, c } = anchoredAndLatched();
    useStore.getState().toggleSelected(c.id); // [] -> [c]
    useStore.getState().toggleSelected(a.id); // [c] -> [c, a]
    useStore.getState().toggleSelected(a.id); // [c, a] -> [c]
    expect(useStore.getState().tapeAnchor).not.toBeNull();
    expect(useStore.getState().tapeHover).not.toBeNull();
  });

  it('selectAll leaves the anchor and the latched hover alone', () => {
    anchoredAndLatched();
    useStore.getState().selectAll(); // [] -> [a, b, c]
    expect(useStore.getState().tapeAnchor).not.toBeNull();
    expect(useStore.getState().tapeHover).not.toBeNull();
  });
});
```

- [ ] **Step 2: Migrate the existing tests that read `selectedId`**

Exact edits:

- `src/store/store.test.ts`:
  - **11–13:** use `const { doc, selectedIds } = useStore.getState();` and `expect(selectedIds).toEqual([doc.boards[0].id]);`.
  - **214:** `expect(useStore.getState().selectedIds).toEqual([]);`
  - **224–228:** `const { doc, selectedIds } = useStore.getState();` … `expect(selectedIds).toEqual([doc.boards[1].id]);`
  - **333:** `expect(s.selectedIds).toEqual([]);`
  - **422** (`cuts` `beforeEach`) and **536** (`twoBoards`): `selectedId: null` → `selectedIds: []`.
  - **596–609** (`'clears the grab and selects the board it moved'`): line 608 becomes `expect(useStore.getState().selectedIds).toEqual([b.id]);`
  - **686:** `expect(useStore.getState().selectedIds).toEqual([a.id]);`
  - **932:** `useStore.setState({ selectedIds: [b.id] });`
  - **1029–1031:** `const selected = useStore.getState().selectedIds;` … `expect(useStore.getState().selectedIds).toEqual(selected);`
  - **Comments.** Around line 602, "asserting selectedId === a" becomes "asserting selectedIds equals [a]". Around line 902, "a second writer of selectedId" becomes "a second writer of the selection".
- `src/App.test.tsx`:
  - **836:** `expect(useStore.getState().selectedIds).toEqual([id]);`
  - **842:** `expect(useStore.getState().selectedIds).toEqual([]);`
  - **915:** `expect(useStore.getState().selectedIds).toEqual([id]);`

- [ ] **Step 3: Run to verify red**

Run: `npx vitest run src/store/store.test.ts`
Expected: FAIL. The new tests fail with `toggleSelected is not a function` (and `selectAll`, `deleteBoards`, `duplicateBoards`). The migrated ones fail because `selectedIds` is `undefined`.

- [ ] **Step 4: Implement the store**

All edits are in `src/store/store.ts`.

(a) **`StoreState`.** Replace `selectedId: string | null;` (line 15) with:

```ts
  /**
   * The selected parts, in the order they were selected, each at most once.
   * View state, not document state — never saved, never undone — exactly as
   * the single `selectedId` it replaced. There is no "primary" part: nothing
   * in scope needs one, and keeping one beside this list would be two
   * deciders for one fact (multi-select spec §2). Written ONLY through
   * `selectionPatch` below.
   */
  selectedIds: string[];
```

Replace the four action declarations at lines 200–202 (`deleteBoard`, `duplicateBoard`, `selectBoard`) with:

```ts
  deleteBoard: (id: string) => void;
  /** Delete every named part, as ONE undo entry. Unknown ids are ignored. */
  deleteBoards: (ids: string[]) => void;
  duplicateBoard: (id: string) => void;
  /**
   * Copy every named part in place, as ONE undo entry, and select the copies.
   * Each copy's name goes through `uniqueName` against the document AS IT
   * GROWS, so copies cannot collide with each other (invariant 8).
   */
  duplicateBoards: (ids: string[]) => void;
  selectBoard: (id: string | null) => void;
  toggleSelected: (id: string) => void;
  selectAll: () => void;
```

Also change the doc comment on `ToolMode` (line 9): `exactly like \`selectedId\`` → `exactly like \`selectedIds\``.

(b) **`selectionPatch`.** Add it inside the factory, directly above `const edit = (`:

```ts
  /**
   * The ONE place a new selection is written. `selectBoard`, `toggleSelected`,
   * `selectAll` and `edit()`'s selection callback all route through it.
   *
   * It carries invariant 24's retargeting rule, applied to a SET: the Move
   * tool's grab candidates are the selected parts' points, so a held grab
   * survives exactly when its owner is still selected. One helper rather than
   * the rule restated at four call sites — a rule written out four times is a
   * rule that holds in three places after the next edit.
   *
   * It does NOT touch `tapeAnchor` or `tapeHover`, and that is a PROHIBITION
   * (see edit()'s comment): the tape has no selected-board restriction.
   */
  const selectionPatch = (ids: string[]): { selectedIds: string[]; grabbed?: null } => {
    const held = get().grabbed;
    return {
      selectedIds: ids,
      ...(held && !ids.includes(held.owner.id) ? { grabbed: null } : {}),
    };
  };
```

(c) **`edit()`.** Change the signature's second parameter to
`selection?: (doc: SloydDocument) => string[],`. Replace lines 263–308 (the comment block from "Invariant 24's second list" through the end of the `set({...})` call) with:

```ts
    // Invariant 24's retargeting rule, for edits that move the selection
    // (addBoard and duplicateBoards select what they create through this
    // callback). The rule itself lives in selectionPatch: a held grab
    // survives exactly when its owner is still among the resulting
    // selection. An edit that carries no `selection` moves the selection
    // nowhere, so it has nothing to invalidate — reaching further would also
    // silently repair a mismatch that `commitSnapMove`'s guard is meant to
    // expose rather than paper over.
    //
    // `tapeAnchor` is DELIBERATELY NOT dropped here, and this is a prohibition
    // rather than an omission (design §4.2). Everything above is an argument
    // about the SELECTED parts: the Move tool offers only their points as
    // grab candidates, so a selection that moves elsewhere means the user
    // retargeted the tool. The Tape tool has no such restriction — it anchors
    // on any board or guide, and measuring from one board to another is most
    // of what it exists for, so clearing the anchor when the selection moves
    // would break the tool invisibly. Note addBoard reaches here, so "measure
    // from this board to the one I am about to add" is a live path.
    // `tapeHover` is not dropped here either, for the identical reason.
    // Pinned by tests in store.test.ts; adding `tapeAnchor: null` to
    // selectionPatch is exactly what they exist to catch.
    set({
      doc: next,
      past: nextPast,
      future: nextFuture,
      ...(takeSnapshot ? { gestureSnapshotTaken: true } : {}),
      ...(selection ? selectionPatch(selection(next)) : {}),
    });
```

(d) **Initial state.** `selectedId: null,` (line 402) → `selectedIds: [],`.

(e) **`commitSnapMove`.** Task 2 widens it to a group. Here, change only two things:
- Line 513 becomes `if (!get().selectedIds.includes(grabbed.owner.id)) return;`. In its comment block (504–512), make three replacements:
  - "offers only the selected board's points" → "offers only the selected parts' points";
  - "every writer of selectedId" → "every writer of the selection (selectionPatch)";
  - "a future writer of selectedId that misses the rule" → "a future writer of the selection that misses the rule".
- Line 543 becomes `set({ grabbed: null });`. The moved board is already selected, since the guard above just required it, so there is nothing to select.

(f) **`addBoard`.** Change `() => board.id,` to `() => [board.id],`.

(g) **Delete.** Replace the whole `deleteBoard: (id) => { ... },` (lines 673–697) with:

```ts
    deleteBoard: (id) => get().deleteBoards([id]),

    deleteBoards: (ids) => {
      const doomed = new Set(ids.filter((id) => get().doc.boards.some((b) => b.id === id)));
      // Guarded before edit(): a no-op would push an undo entry (invariant 4).
      if (doomed.size === 0) return;
      // A grab on a board being deleted has nothing left to move, an anchor
      // on one has nothing left to measure from, and a latched hover on one
      // has nothing left to measure TO — invariant 24, all three instances.
      //
      // Board-precise is exactly right HERE, unlike in updateBoard: a deleted
      // board offers no snap points at all, so "is this point still on offer"
      // and "is this a deleted board" are the same question with the same
      // answer for every point on it.
      const { grabbed, tapeAnchor, tapeHover } = get();
      if (grabbed && doomed.has(grabbed.owner.id)) set({ grabbed: null });
      if (tapeAnchor?.owner.type === 'board' && doomed.has(tapeAnchor.owner.id)) {
        set({ tapeAnchor: null, tapeAxis: null });
      }
      if (tapeHover?.owner.type === 'board' && doomed.has(tapeHover.owner.id)) {
        set({ tapeHover: null });
      }
      edit(
        (doc) => ({ ...doc, boards: doc.boards.filter((b) => !doomed.has(b.id)) }),
        () => get().selectedIds.filter((id) => !doomed.has(id)),
      );
    },
```

(h) **Duplicate.** Replace the whole `duplicateBoard: (id) => { ... },` (lines 699–722) with the code below. Keep the existing comment ("Drop the id so createBoard generates a fresh one…") above the `const { id: _sourceId` line.

```ts
    duplicateBoard: (id) => get().duplicateBoards([id]),

    duplicateBoards: (ids) => {
      // Walk the ids in the order given — the selection's insertion order —
      // so the copies, and the new selection, come out in that order too.
      const boards = get().doc.boards;
      const sources = [...new Set(ids)].flatMap((id) => boards.filter((b) => b.id === id));
      if (sources.length === 0) return;
      const copies: Board[] = [];
      for (const source of sources) {
        const { id: _sourceId, ...rest } = source;
        const fresh = createBoard({
          ...rest,
          position: [...source.position],
          cuts: source.cuts.map((cut) => ({ ...cut, id: nextId() })),
        });
        // Against the document AS IT GROWS: copies of "Leg" and "Leg (1)"
        // would otherwise both be named "Leg (2)" (invariant 8).
        copies.push({ ...fresh, name: uniqueName(source.name, [...boards, ...copies]) });
      }
      edit(
        (doc) => ({ ...doc, boards: [...doc.boards, ...copies] }),
        () => copies.map((c) => c.id),
      );
    },
```

(i) **Selection actions.** Replace `selectBoard: (id) => set((s) => ({ ... })),` (lines 738–742) with the code below. In the comment block above it (724–737), replace "the grabbed board must be the selected one" with "a held grab's owner must stay selected (selectionPatch)", and "`tapeAnchor` is DELIBERATELY NOT dropped here" with "`tapeAnchor` is DELIBERATELY NOT dropped by any of these three".

```ts
    selectBoard: (id) => set(selectionPatch(id === null ? [] : [id])),

    toggleSelected: (id) => {
      const ids = get().selectedIds;
      set(selectionPatch(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    },

    selectAll: () => set(selectionPatch(get().doc.boards.map((b) => b.id))),
```

(j) **`replaceDocument`.** `selectedId: null,` → `selectedIds: [],`. Keep the clear and do not filter: a replaced document is another project (spec clarification 2).

(k) **`undo` / `redo`.** In `undo`, replace the destructure and `stillThere` (lines 779 and 782) and the `selectedId:` entry (787):

```ts
      const { past, future, doc, selectedIds } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      const surviving = selectedIds.filter((id) => previous.boards.some((b) => b.id === id));
```

```ts
        // Only the parts that still exist stay selected. The same array is
        // kept when nothing was lost, so a subscriber re-renders only on a
        // real change.
        selectedIds: surviving.length === selectedIds.length ? selectedIds : surviving,
```

Make the identical change in `redo`, with `next` in place of `previous`.

(l) **Comment.** In `addGuide`'s doc comment, change "Deliberately does NOT change `selectedId`" to "`selectedIds`". Change "Compare commitSnapMove, which DOES select, because it moved a board the user is working on" to "Compare commitSnapMove, which keeps the moved parts selected".

- [ ] **Step 5: Migrate every reader, keeping single-select behaviour**

These keep today's behaviour with one part selected. Tasks 3–7 widen them.

`src/viewport/Gizmo.tsx`, lines 230–231. Task 5 replaces these:

```ts
  const selectedId = useStore((s) => (s.selectedIds.length === 1 ? s.selectedIds[0]! : null));
  const board = useStore((s) =>
    s.selectedIds.length === 1 ? s.doc.boards.find((b) => b.id === s.selectedIds[0]) : undefined);
```

`src/viewport/MoveTool.tsx`. Line 48 becomes
`const selectedIds = useStore((s) => s.selectedIds);`. In the memo (lines 120–122) replace the last two lines and the dep list. Task 4 replaces the memo.

```ts
    const selected = selectedIds.length === 1 ? boards.find((b) => b.id === selectedIds[0]) : undefined;
    return selected ? snapPointsFor(selected) : [];
  }, [boards, grabbed, selectedIds, guides, showGuides]);
```

In the effect's closing comment (lines 220–224), change "`selectedId`" to "`selectedIds`".

`src/viewport/Viewport.tsx`:
- **`CameraKeys`.** Line 61 becomes `const selectedIds = useStore((s) => s.selectedIds);`. Line 122 becomes the code below. Line 137's dep list becomes `[boards, selectedIds, frame, suspended]`.

```ts
        // The whole selection. With nothing selected this is empty and `f`
        // does nothing, exactly as before multi-select — `Home` is the key
        // that frames everything (multi-select plan, spec clarification 1).
        subset = boards.filter((b) => selectedIds.includes(b.id));
```
- **`Viewport`.** Line 257 becomes `const selectedIds = useStore((s) => s.selectedIds);`. Line 359 becomes `selected={selectedIds.includes(board.id)}`.

`src/panels/PartsList.tsx`. Line 5 becomes `const selectedIds = useStore((s) => s.selectedIds);`. Line 17 becomes `className={selectedIds.includes(b.id) ? 'part selected' : 'part'}`. Task 3 rewrites the file.

`src/panels/Properties.tsx`, line 259:

```ts
  const board = useStore((s) =>
    s.selectedIds.length === 1 ? s.doc.boards.find((b) => b.id === s.selectedIds[0]) : undefined);
```

`src/panels/Toolbar.tsx`. Line 100 becomes `const hasSelection = useStore((s) => s.selectedIds.length > 0);`. Line 152 becomes `{tool === 'move' && !hasSelection && (`.

`src/App.tsx`, lines 729–732. Task 3 widens this to every selected part:

```ts
        const id = useStore.getState().selectedIds[0];
        if (!id) return;
        e.preventDefault();
        deleteBoard(id);
```

Comments: in `src/document/document.ts:108` and `src/panels/GuidesList.tsx:8`, change `selectedId` to `selectedIds`.

Check that nothing is left:

Run: `grep -rnw "selectedId" src`
Expected: matches ONLY in `src/viewport/Gizmo.tsx`, the local `const selectedId` from the migration above and its four reads (the Route 1 effect, the `return null` guard, `commit`). Task 5 removes them. Any other match is a missed reader or comment: fix it.

- [ ] **Step 6: Run to verify green, then the gates**

Run: `npx vitest run src/store/store.test.ts`
Expected: PASS.

Run: `npm test && npm run build`
Expected: all green; build passes.

- [ ] **Step 7: Mutation-test**

Apply each mutation, run `npx vitest run src/store/store.test.ts`, confirm red, revert:

1. `toggleSelected` always appends (`set(selectionPatch([...ids, id]))`). Red: "never holds an id twice", "toggleSelected adds … and removes".
2. `selectAll` keeps the existing order and appends the rest. Red: "selectAll selects every part, in document order".
3. `undo` keeps `selectedIds` unfiltered. Red: "undo keeps only the selected parts that still exist".
4. `undo` clears the selection (`selectedIds: []`). Red: "undo keeps the whole selection when every selected part survives".
5. `redo` keeps `selectedIds` unfiltered. Red: "redo keeps only…".
6. `deleteBoards` implemented as `ids.forEach((id) => deleteBoardOld(id))`, which is one edit each. Red: "deleteBoards removes every named part as ONE undo entry".
7. `duplicateBoards` names each copy against `boards` only (`uniqueName(source.name, boards)`). Red: names `['Leg (2)', 'Leg (2)']`.
8. `selectionPatch` drops the grab unconditionally. Red: the two "keeps a held grab" tests and the `deleteBoards` grab test.
9. `selectionPatch` never drops the grab. Red: "drops a held grab when its OWNER is toggled out".
10. Add `tapeAnchor: null, tapeHover: null` to `selectionPatch`'s return. Red: both tests in "tape held points are NOT cleared…".
11. `commitSnapMove`'s guard deleted. Red: "refuses a snap move when the grabbed board is not among the selected".

- [ ] **Step 8: Commit**

```bash
git add src
git commit -m "feat(store): selectedIds — toggle, select all, group delete and duplicate; readers migrated

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Group edits in the store — `boardsBounds`, `updateBoards`, the group snap move, `moveGroupTo`

**Files:**
- Modify: `src/document/geometry.ts` (add `Bounds`, `boardsBounds`)
- Modify: `src/document/document.ts:9-11` (re-export them)
- Modify: `src/store/store.ts`
- Test: `src/document/document.test.ts`, `src/store/store.test.ts`

**Interfaces:**
- Consumes: Task 1's `selectedIds`, `toggleSelected` and `selectBoard`.
- Produces:
  - `interface Bounds { min: [number, number, number]; max: [number, number, number] }`;
  - `boardsBounds(boards: readonly Board[]): Bounds | null`, from `../document/document`;
  - store `updateBoards(ids: string[], patch: Partial<Board>): void` (one undo entry; `updateBoard` delegates to it);
  - store `moveGroupTo(ids: string[], minCorner: [number, number, number]): void`. Its argument is the ABSOLUTE wanted min corner of the group. The store rounds it to `SNAP_INCHES`, takes one delta against the group's current min, and applies it to every part. Zero delta means no edit.
  - `commitSnapMove` now translates every selected part.

- [ ] **Step 1: Write the failing tests**

In `src/document/document.test.ts`, change line 4 to
`import { boardExtents, boardCenter, reorientedPosition, axisDimensions, boardsBounds } from './geometry';`
and append:

```ts
describe('boardsBounds', () => {
  it('is null for no boards', () => {
    expect(boardsBounds([])).toBeNull();
  });

  it('spans every board from its min corner to its far corner, honouring orientation', () => {
    const flat = createBoard({ position: [2, 0, 1] }); // extents [24, 0.75, 5.5]
    const upright = createBoard({ position: [-3, 0, 10], posture: 'upright' }); // extents [5.5, 24, 0.75]
    expect(boardsBounds([flat, upright])).toEqual({
      min: [-3, 0, 1],
      max: [26, 24, 10.75],
    });
  });
});
```

Append to `src/store/store.test.ts`:

```ts
describe('multi-select — group edits', () => {
  const board = (id: string) => useStore.getState().doc.boards.find((x) => x.id === id)!;

  /** a at the origin, b at [0, 0, 10], c at [40, 0, 0]; a and b selected. */
  const threeForMove = () => {
    useStore.setState({ tool: 'select', grabbed: null });
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    const [a, b, c] = useStore.getState().doc.boards;
    useStore.getState().updateBoard(b!.id, { position: [0, 0, 10] });
    useStore.getState().updateBoard(c!.id, { position: [40, 0, 0] });
    useStore.getState().selectBoard(a!.id);
    useStore.getState().toggleSelected(b!.id);
    return { a: a!.id, b: b!.id, c: c!.id };
  };
  /** The min corner — boardSnapPoints' first point IS `position`. */
  const minCornerOf = (id: string) => boardSnapPoints(board(id))[0]!;

  it('updateBoards applies one patch to every named part as ONE undo entry', () => {
    const { a, b } = threeForMove();
    const before = useStore.getState().past.length;
    useStore.getState().updateBoards([a, b], { thickness: 1.5 });
    expect([board(a).thickness, board(b).thickness]).toEqual([1.5, 1.5]);
    expect(useStore.getState().past.length).toBe(before + 1);
    useStore.getState().undo();
    expect([board(a).thickness, board(b).thickness]).toEqual([0.75, 0.75]);
  });

  it('updateBoards leaves each part on its own min corner', () => {
    const { a, b } = threeForMove();
    useStore.getState().updateBoards([a, b], { length: 36 });
    expect(board(a).position).toEqual([0, 0, 0]);
    expect(board(b).position).toEqual([0, 0, 10]);
  });

  it('updateBoards resets grain PER PART when a group switches to a sheet good', () => {
    const { a, b } = threeForMove();
    useStore.getState().updateBoard(a, { grain: 'thickness' });
    useStore.getState().updateBoard(b, { grain: 'width' });
    useStore.getState().updateBoards([a, b], { material: 'plywood' });
    expect(board(a).grain).toBe('length');
    expect(board(b).grain).toBe('width');
  });

  it('updateBoards ignores unknown ids, and leaves no undo entry when none exist', () => {
    const { a } = threeForMove();
    const before = useStore.getState().past.length;
    useStore.getState().updateBoards(['nope'], { length: 30 });
    expect(useStore.getState().past.length).toBe(before);
    useStore.getState().updateBoards([a, 'nope'], { length: 30 });
    expect(board(a).length).toBe(30);
  });

  it('updateBoards drops a latched hover on ANY edited member whose point moved', () => {
    const { a, b, c } = threeForMove();
    const far = boardSnapPoints(board(b)).find((p) => p.at[0] > 0)!;
    useStore.getState().setTapeAnchor(minCornerOf(c));
    useStore.getState().setTapeHover(far);
    useStore.getState().updateBoards([a, b], { length: 36 });
    expect(useStore.getState().tapeHover).toBeNull();
    expect(useStore.getState().tapeAnchor).not.toBeNull();
  });

  it('a group snap move translates every selected part by the exact delta, as ONE undo entry', () => {
    const { a, b, c } = threeForMove();
    const before = useStore.getState().past.length;
    useStore.getState().grabSnapPoint(minCornerOf(a)); // [0, 0, 0]
    useStore.getState().commitSnapMove(minCornerOf(c)); // [40, 0, 0]
    expect(board(a).position).toEqual([40, 0, 0]);
    expect(board(b).position).toEqual([40, 0, 10]);
    expect(board(c).position).toEqual([40, 0, 0]);
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(useStore.getState().selectedIds).toEqual([a, b]);
    expect(useStore.getState().grabbed).toBeNull();
    useStore.getState().undo();
    expect(board(a).position).toEqual([0, 0, 0]);
    expect(board(b).position).toEqual([0, 0, 10]);
  });

  it('does not round a group snap move (invariant 25)', () => {
    const { a, b, c } = threeForMove();
    useStore.getState().updateBoard(c, { position: [40.01, 0, 0] });
    useStore.getState().grabSnapPoint(minCornerOf(a));
    useStore.getState().commitSnapMove(minCornerOf(c));
    expect(board(a).position[0]).toBe(40.01);
    expect(board(b).position[0]).toBe(40.01);
  });

  it('refuses a target on ANY selected part, keeping the grab and leaving no undo entry', () => {
    const { a, b } = threeForMove();
    const before = useStore.getState().past.length;
    useStore.getState().grabSnapPoint(minCornerOf(a));
    useStore.getState().commitSnapMove(minCornerOf(b)); // b moves with the grab: never a target
    expect(board(a).position).toEqual([0, 0, 0]);
    expect(board(b).position).toEqual([0, 0, 10]);
    expect(useStore.getState().past.length).toBe(before);
    expect(useStore.getState().grabbed).not.toBeNull();
  });

  it('moveGroupTo lands the group min corner on the 1/16in grid', () => {
    const { a, b } = threeForMove(); // group min [0, 0, 0]
    useStore.getState().moveGroupTo([a, b], [3.03, 0, 0]); // rounds to 3
    expect(board(a).position).toEqual([3, 0, 0]);
    expect(board(b).position).toEqual([3, 0, 10]);
  });

  it('moveGroupTo measures from the GROUP min corner, not from the first part', () => {
    const { a, b } = threeForMove();
    useStore.getState().updateBoard(a, { position: [5, 0, 0] }); // b (x = 0) is now the min on x
    useStore.getState().moveGroupTo([a, b], [2, 0, 0]);
    expect(board(b).position[0]).toBe(2);
    expect(board(a).position[0]).toBe(7);
  });

  // Review Focus 4.
  it('moveGroupTo moves an off-grid part by exactly the group delta, leaving it off-grid', () => {
    const { a, b } = threeForMove();
    useStore.getState().updateBoard(b, { position: [5.01, 0, 10] }); // off-grid, NOT the min
    useStore.getState().moveGroupTo([a, b], [2.5, 0, 0]); // group min 0 -> 2.5, so the delta is 2.5
    expect(board(a).position[0]).toBe(2.5);
    expect(board(b).position[0]).toBe(5.01 + 2.5);
    expect(Number.isInteger(board(b).position[0] / (1 / 16))).toBe(false);
  });

  it('one gizmo drag is one undo entry; the target is absolute; a zero move leaves none', () => {
    const { a, b } = threeForMove();
    const before = useStore.getState().past.length;
    useStore.getState().moveGroupTo([a, b], [0, 0, 0]); // already there
    expect(useStore.getState().past.length).toBe(before);
    useStore.getState().beginGesture();
    useStore.getState().moveGroupTo([a, b], [1, 0, 0]);
    useStore.getState().moveGroupTo([a, b], [2, 0, 0]);
    useStore.getState().moveGroupTo([a, b], [2, 0, 0]); // same target again: no further move
    useStore.getState().endGesture();
    expect(board(a).position).toEqual([2, 0, 0]);
    expect(board(b).position).toEqual([2, 0, 10]);
    expect(useStore.getState().past.length).toBe(before + 1);
  });
});
```

- [ ] **Step 2: Run to verify red**

Run: `npx vitest run src/document/document.test.ts src/store/store.test.ts`
Expected: FAIL.
- `boardsBounds` is not exported.
- `updateBoards` and `moveGroupTo` are not functions.
- The group snap move moves `a` only, so b's position assertion fails.
- The any-selected-target refusal moves `a`.

- [ ] **Step 3: Implement `boardsBounds`**

Append to `src/document/geometry.ts`:

```ts
/** An axis-aligned box in world space, inches. */
export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * The world box around a set of boards, from the least min corner to the
 * greatest far corner, or null for no boards. `position` is the min corner
 * (invariant 2) and `boardExtents` already honours posture and rotation, so
 * this is one pass of min/max — no centre arithmetic to get wrong.
 *
 * The group gizmo is placed at its centre and the store's group move rounds
 * its `min` (multi-select spec §4.1).
 */
export function boardsBounds(boards: readonly Board[]): Bounds | null {
  if (boards.length === 0) return null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of boards) {
    const extents = boardExtents(b);
    for (const axis of [0, 1, 2] as const) {
      min[axis] = Math.min(min[axis], b.position[axis]);
      max[axis] = Math.max(max[axis], b.position[axis] + extents[axis]);
    }
  }
  return { min, max };
}
```

In `src/document/document.ts`, extend the geometry re-export to:

```ts
export {
  boardExtents, boardCenter, boardsBounds, reorientedPosition, axisDimensions, DIMENSION_ORDER, positionAxisOf,
} from './geometry';
export type { Bounds } from './geometry';
```

- [ ] **Step 4: Implement the store actions**

All edits are in `src/store/store.ts`.

(a) **Imports.** Add `boardsBounds` to the `../document/document` value import, and add a new line:
`import { SNAP_INCHES } from '../document/geometry';`

(b) **`StoreState`.** After `updateBoard: (id: string, patch: Partial<Board>) => void;` add:

```ts
  /**
   * One patch to every named part, as ONE undo entry. Each part goes through
   * the same per-board rules a single edit does — its own min corner, its own
   * reorient pivot, its own sheet-good grain reset — so a group edit is N
   * single edits sharing one snapshot. Unknown ids are ignored.
   */
  updateBoards: (ids: string[], patch: Partial<Board>) => void;
  /**
   * The group gizmo's path (multi-select spec §4.1). `minCorner` is the
   * ABSOLUTE place the group's min corner should go — not a delta, because
   * TransformControls fires onObjectChange every frame and a delta would
   * accumulate. It is rounded to SNAP_INCHES ONCE, and the one resulting delta
   * is added to every part, so parts keep their exact relative layout even
   * off the grid (invariant 25: round what a free drag produced, never an
   * exact position). Position only — a group move translates, never turns
   * (invariant 2). A zero delta writes nothing (invariant 4).
   */
  moveGroupTo: (ids: string[], minCorner: [number, number, number]) => void;
```

(c) **Two helpers.** Add them inside the factory, directly below `dropHeldIfGone`.

The comment blocks currently inside `updateBoard` move into `patchBoard`, verbatim, beside the lines they describe:
- the "Reorienting turns the board in place…" block;
- the "Sheet goods have no 'thickness' grain…" block.

```ts
  /**
   * One board with one patch applied, by the rules every board edit follows.
   * Shared by updateBoard (via updateBoards) so a group edit is exactly N
   * single edits — never a second copy of the reorient or grain rule.
   */
  const patchBoard = (current: Board, patch: Partial<Board>): Board => {
    // (move the "Reorienting turns the board in place…" comment block here)
    const reorienting =
      (patch.rotation !== undefined && patch.rotation !== current.rotation) ||
      (patch.posture !== undefined && patch.posture !== current.posture);
    const position =
      reorienting && !patch.position
        ? reorientedPosition(current, patch)
        : patch.position;

    // (move the "Sheet goods have no 'thickness' grain…" comment block here)
    const switchingToSheetGoodWithThicknessGrain =
      patch.material !== undefined &&
      patch.material !== current.material &&
      isSheetGood(patch.material) &&
      (patch.grain ?? current.grain) === 'thickness';

    return {
      ...current,
      ...patch,
      ...(position ? { position: [...position] as [number, number, number] } : {}),
      ...(switchingToSheetGoodWithThicknessGrain ? { grain: 'length' as const } : {}),
    };
  };

  /**
   * Add one delta to every named board's position, as one edit, then run
   * invariant 24's point-precise survival test for each of them. The ONE
   * translate both group moves use (the Move tool's commit and the gizmo).
   * The delta is computed once by the caller; nothing here rounds.
   */
  const translateBoards = (ids: ReadonlySet<string>, delta: readonly [number, number, number]) => {
    edit((doc) => ({
      ...doc,
      boards: doc.boards.map((b) => {
        if (!ids.has(b.id)) return b;
        const position: [number, number, number] = [
          b.position[0] + delta[0],
          b.position[1] + delta[1],
          b.position[2] + delta[2],
        ];
        return { ...b, position };
      }),
    }));
    for (const id of ids) dropHeldIfGone(id);
  };
```

(d) **`updateBoard` → `updateBoards`.** Replace the whole `updateBoard: (id, patch) => { ... },` with the code below. The comment blocks named in it move with the lines they describe, verbatim:
- "Invariant 24: a grab holds a world position…" now sits above the `grabbed` line. Delete its last sentences, from "Safe for commitSnapMove's own call into updateBoard" to the end of the block: after (e) below, `commitSnapMove` no longer calls it. Also change "commitSnapMove even selects the board it just moved" to "commitSnapMove leaves the moved parts selected".
- "BOTH TAPE FIELDS ARE DELIBERATELY ABSENT HERE…" follows it;
- "Point-precise, and AFTER the edit…" sits above the loop.

```ts
    updateBoard: (id, patch) => get().updateBoards([id], patch),

    updateBoards: (ids, patch) => {
      const targets = new Set(ids.filter((id) => get().doc.boards.some((b) => b.id === id)));
      if (targets.size === 0) return;

      // (move the "Invariant 24: a grab holds a world position…" comment here)
      const grabbed = get().grabbed;
      if (grabbed && targets.has(grabbed.owner.id)) set({ grabbed: null });

      // (move the "BOTH TAPE FIELDS ARE DELIBERATELY ABSENT HERE…" comment here)

      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) => (targets.has(b.id) ? patchBoard(b, patch) : b)),
      }));

      // (move the "Point-precise, and AFTER the edit…" comment here)
      for (const id of targets) dropHeldIfGone(id);
    },
```

(e) **`commitSnapMove`.** Replace everything from Task 1's guard line
(`if (!get().selectedIds.includes(grabbed.owner.id)) return;`) to the end of the action with the code below. Keep the comment block above the guard. Then delete the old self-snap line (`if (target.owner.type === 'board' && target.owner.id === grabbed.owner.id) return;`) and its comment's last two sentences ("This is the ONLY runtime ownership test…"); the new guard below supersedes them. Leave the rest of that comment above the new guard, reworded from "A board cannot be snapped onto itself" to "No selected part can be a target".

```ts
      const selected = new Set(get().selectedIds);
      if (!selected.has(grabbed.owner.id)) return;
      // A selected part moves WITH the grab, so it can never be a target
      // (spec §4.2) — snapping a group onto one of its own members is a legal
      // subtraction and never what anyone means. The grabbed board itself is
      // one such part, so this is the self-snap rule widened, not a second
      // rule beside it. MoveTool withholds these candidates (moveCandidates),
      // so the case cannot be clicked; this makes the rule true of the action.
      // OWNERS are compared, not bare ids: a guide is a legal target, and a
      // guide whose id collided with a selected board's must not read as one.
      if (target.owner.type === 'board' && selected.has(target.owner.id)) return;

      const moving = new Set(get().doc.boards.filter((b) => selected.has(b.id)).map((b) => b.id));
      if (!moving.has(grabbed.owner.id)) {
        set({ grabbed: null });
        return;
      }

      const delta = [
        target.at[0] - grabbed.at[0],
        target.at[1] - grabbed.at[1],
        target.at[2] - grabbed.at[2],
      ] as const;

      // Guarded before the edit (invariant 4): a no-op move would leave a
      // no-op undo entry and silently wipe the redo stack.
      if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) {
        set({ grabbed: null });
        return;
      }

      // Every selected part by the SAME exact delta, unrounded (invariant 25),
      // as one edit. The selection is unchanged: the moved parts are exactly
      // the selected ones.
      translateBoards(moving, delta);
      set({ grabbed: null });
    },
```

Also update the action's doc comment. "One subtraction, applied through updateBoard" becomes "One subtraction, applied to every selected part through translateBoards". "The patch carries `position` only, so updateBoard's reorient predicate is never reached" becomes "Position only — a snap move translates, it never turns (invariant 2)".

(f) **`moveGroupTo`.** Add it after `commitSnapMove`:

```ts
    moveGroupTo: (ids, minCorner) => {
      const wanted = new Set(ids);
      const moving = get().doc.boards.filter((b) => wanted.has(b.id));
      const bounds = boardsBounds(moving);
      if (!bounds) return;
      // Round the GROUP's min corner, once. Rounding each part's corner
      // instead would pull an off-grid part onto the grid and break the
      // layout by up to a sixteenth, invisibly (invariant 25).
      const snap = (v: number) => Math.round(v / SNAP_INCHES) * SNAP_INCHES;
      const delta = [
        snap(minCorner[0]) - bounds.min[0],
        snap(minCorner[1]) - bounds.min[1],
        snap(minCorner[2]) - bounds.min[2],
      ] as const;
      if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) return;
      translateBoards(new Set(moving.map((b) => b.id)), delta);
    },
```

- [ ] **Step 5: Run to verify green, then the gates**

Run: `npx vitest run src/document/document.test.ts src/store/store.test.ts`
Expected: PASS, including every pre-existing `updateBoard`, reorient, grain-reset and Move-tool test unchanged.

Run: `npm test && npm run build`
Expected: green; build passes.

- [ ] **Step 6: Mutation-test**

Run the two files after each mutation, confirm red, revert:

1. `updateBoards` loops `updateBoard`-style, one `edit()` per id. Red: "updateBoards applies one patch … as ONE undo entry".
2. `patchBoard` computes `switchingToSheetGoodWithThicknessGrain` from the FIRST target and applies it to all. Red: "resets grain PER PART" (b becomes `'length'`).
3. `updateBoards` calls `dropHeldIfGone` for the first target only. Red: "drops a latched hover on ANY edited member".
4. `commitSnapMove` translates only the grabbed owner (`translateBoards(new Set([grabbed.owner.id]), delta)`). Red: "a group snap move translates every selected part" (b stays put).
5. The any-selected guard narrowed back to `target.owner.id === grabbed.owner.id`. Red: "refuses a target on ANY selected part".
6. `translateBoards` rounds each coordinate to `SNAP_INCHES`. Red: "does not round a group snap move" and "moveGroupTo moves an off-grid part…".
7. `moveGroupTo` snaps each part's corner separately (`position: [snap(b.position[0] + raw[0]), …]`). Red: "moveGroupTo moves an off-grid part…".
8. `moveGroupTo` measures from `moving[0].position` instead of `bounds.min`. Red: "moveGroupTo measures from the GROUP min corner…".
9. `moveGroupTo` treats its argument as a delta (`delta = snap(minCorner[i])`). Red: "one gizmo drag is one undo entry; the target is absolute…" (a ends at 5).
10. The zero-delta guard in `moveGroupTo` is removed. Red: the same test's first `past` assertion.
11. `boardsBounds` uses `b.position[axis] + extents[axis] / 2` for `max`. Red: the `boardsBounds` span test.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat(store): group edits — updateBoards, group snap move, moveGroupTo rounding the group's min corner

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Selecting — modifier clicks, the missed-click rule, the parts list, Ctrl/Cmd+A, Delete on all

**Files:**
- Create: `src/store/selectionGesture.ts`
- Create: `src/store/selectionGesture.test.ts`
- Create: `src/panels/PartsList.test.tsx`
- Modify: `src/panels/PartsList.tsx` (whole file)
- Modify: `src/viewport/BoardMesh.tsx:39-56,159-175`
- Modify: `src/viewport/Viewport.tsx:256-259,278,360`
- Modify: `src/App.tsx` (the keydown effect, lines 539–737, and the `deleteBoard` subscription at line 47)
- Test: `src/App.test.tsx`, `src/panels/Toolbar.test.tsx`

**Interfaces:**
- Consumes: Task 1's `selectBoard`, `toggleSelected`, `selectAll`, `deleteBoards` and `selectedIds`.
- Produces:
  - `interface ToggleModifiers { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }`;
  - `isToggleModifier(e: ToggleModifiers): boolean`;
  - `selectByClick(id: string, e: ToggleModifiers): void`;
  - `clearOnMiss(e: ToggleModifiers, tool: ToolMode): void`;
  - `BoardMesh`'s `onSelect` prop becomes `(id: string, modifiers: ToggleModifiers) => void`.

**Why `store/`:** the modifier rule has three callers: BoardMesh, Viewport's miss handler and PartsList. One predicate must serve all three, or the parts list and the viewport can disagree about what Cmd means (follow-up 113's shape). `panels` and `viewport` may both import the store layer, and neither may import the other.

**Invariants:**
- **27:** Ctrl/Cmd+A joins `App`'s ONE keydown effect, below `isTextEntry` and `modalOpen`.
- **24:** the missed click never touches the tape.

- [ ] **Step 1: Write the failing tests**

Create `src/store/selectionGesture.test.ts`:

```ts
import { useStore } from './store';
import { createDocument } from '../document/document';
import { clearOnMiss, isToggleModifier, selectByClick } from './selectionGesture';

const none = { shiftKey: false, ctrlKey: false, metaKey: false };

beforeEach(() => {
  useStore.getState().replaceDocument(createDocument('Test'));
  useStore.getState().setTool('select');
});

const twoBoards = () => {
  useStore.getState().addBoard();
  useStore.getState().addBoard();
  const [a, b] = useStore.getState().doc.boards;
  useStore.getState().selectBoard(a!.id);
  return { a: a!.id, b: b!.id };
};

describe('isToggleModifier', () => {
  it('is true for Shift, Ctrl or Cmd, and false with none', () => {
    expect(isToggleModifier(none)).toBe(false);
    expect(isToggleModifier({ ...none, shiftKey: true })).toBe(true);
    expect(isToggleModifier({ ...none, ctrlKey: true })).toBe(true);
    expect(isToggleModifier({ ...none, metaKey: true })).toBe(true);
  });
});

describe('selectByClick', () => {
  it('a plain click selects just that part', () => {
    const { b } = twoBoards();
    selectByClick(b, none);
    expect(useStore.getState().selectedIds).toEqual([b]);
  });

  it('a modified click toggles that part, in and out', () => {
    const { a, b } = twoBoards();
    selectByClick(b, { ...none, shiftKey: true });
    expect(useStore.getState().selectedIds).toEqual([a, b]);
    selectByClick(a, { ...none, metaKey: true });
    expect(useStore.getState().selectedIds).toEqual([b]);
  });
});

describe('clearOnMiss', () => {
  it('a plain miss in the Select tool clears the selection', () => {
    twoBoards();
    clearOnMiss(none, 'select');
    expect(useStore.getState().selectedIds).toEqual([]);
  });

  it('a MODIFIED miss keeps the selection: a slightly missed Shift-click must not wipe it', () => {
    const { a, b } = twoBoards();
    useStore.getState().toggleSelected(b);
    clearOnMiss({ ...none, shiftKey: true }, 'select');
    clearOnMiss({ ...none, ctrlKey: true }, 'select');
    clearOnMiss({ ...none, metaKey: true }, 'select');
    expect(useStore.getState().selectedIds).toEqual([a, b]);
  });

  it('a miss in any other tool keeps the selection', () => {
    const { a } = twoBoards();
    clearOnMiss(none, 'move');
    clearOnMiss(none, 'tape');
    expect(useStore.getState().selectedIds).toEqual([a]);
  });
});
```

Create `src/panels/PartsList.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { PartsList } from './PartsList';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

/** 'Board', 'Board (1)', 'Board (2)', nothing selected, list rendered. */
const threeParts = () => {
  act(() => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    useStore.getState().selectBoard(null);
  });
  render(<PartsList />);
  return useStore.getState().doc.boards.map((b) => b.id);
};
const ids = () => useStore.getState().selectedIds;

describe('PartsList selection', () => {
  it('a plain click selects just that part', async () => {
    const [, b] = threeParts();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await user.click(screen.getByRole('button', { name: 'Board (1)' }));
    expect(ids()).toEqual([b]);
  });

  it('Shift-click, Ctrl-click and Cmd-click each toggle a part', async () => {
    const [a, b, c] = threeParts();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await user.keyboard('{Shift>}');
    await user.click(screen.getByRole('button', { name: 'Board (2)' }));
    await user.keyboard('{/Shift}');
    expect(ids()).toEqual([a, c]);
    await user.keyboard('{Control>}');
    await user.click(screen.getByRole('button', { name: 'Board' }));
    await user.keyboard('{/Control}');
    expect(ids()).toEqual([c]);
    await user.keyboard('{Meta>}');
    await user.click(screen.getByRole('button', { name: 'Board (1)' }));
    await user.keyboard('{/Meta}');
    expect(ids()).toEqual([c, b]);
  });

  it('marks every selected row, and only those', () => {
    const [a, , c] = threeParts();
    act(() => {
      useStore.getState().toggleSelected(a);
      useStore.getState().toggleSelected(c);
    });
    expect(screen.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Board' })).toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Board (1)' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Board (1)' })).not.toHaveClass('selected');
    expect(screen.getByRole('button', { name: 'Board (2)' })).toHaveAttribute('aria-pressed', 'true');
  });
});
```

Append to `src/panels/Toolbar.test.tsx`, and add `act` to its `@testing-library/react` import. This pins the hint across the migration. It passes as soon as Task 1 lands; its value is the mutation below.

```tsx
describe('the Move tool hint', () => {
  afterEach(() => { act(() => useStore.getState().setTool('select')); });

  it('shows "Select a part to move" in the Move tool exactly while nothing is selected', () => {
    renderToolbar();
    act(() => useStore.getState().setTool('move'));
    expect(screen.getByText('Select a part to move')).toBeInTheDocument();
    act(() => useStore.getState().addBoard());
    expect(screen.queryByText('Select a part to move')).not.toBeInTheDocument();
    act(() => {
      useStore.getState().addBoard();
      useStore.getState().selectAll();
    });
    expect(screen.queryByText('Select a part to move')).not.toBeInTheDocument();
    act(() => useStore.getState().selectBoard(null));
    expect(screen.getByText('Select a part to move')).toBeInTheDocument();
  });
});
```

Append to `src/App.test.tsx`, after the `describe('App keyboard delete', …)` block:

```tsx
describe('App select all, and Delete on the whole selection', () => {
  /** Three boards; 'Board' clicked in the parts list so focus is on a button. */
  const mountWithThreeBoards = async () => {
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    act(() => useStore.getState().setTool('select'));
    await act(async () => {
      useStore.getState().addBoard();
      useStore.getState().addBoard();
      useStore.getState().addBoard();
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Board' }));
    return { user, ids: useStore.getState().doc.boards.map((b) => b.id) };
  };

  it('Ctrl+A selects every part', async () => {
    const { user, ids } = await mountWithThreeBoards();
    await user.keyboard('{Control>}a{/Control}');
    expect(useStore.getState().selectedIds).toEqual(ids);
  });

  it('Cmd+A selects every part', async () => {
    const { user, ids } = await mountWithThreeBoards();
    await user.keyboard('{Meta>}a{/Meta}');
    expect(useStore.getState().selectedIds).toEqual(ids);
  });

  // Review Focus 2.
  it('Ctrl+A in a text field selects TEXT: the parts selection is unchanged and the event is not prevented', async () => {
    const { ids } = await mountWithThreeBoards();
    const projectName = screen.getByLabelText('Project name');
    act(() => projectName.focus());
    // fireEvent returns false iff a handler called preventDefault.
    expect(fireEvent.keyDown(projectName, { key: 'a', ctrlKey: true })).toBe(true);
    expect(useStore.getState().selectedIds).toEqual([ids[0]]);
    act(() => projectName.blur());
  });

  it('Ctrl+A does nothing while the cut list is open', async () => {
    const { user, ids } = await mountWithThreeBoards();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    await user.keyboard('{Control>}a{/Control}');
    expect(useStore.getState().selectedIds).toEqual([ids[0]]);
  });

  it('Delete removes every selected part, as ONE undo entry', async () => {
    const { user, ids } = await mountWithThreeBoards();
    act(() => useStore.getState().toggleSelected(ids[2]!));
    const before = useStore.getState().past.length;
    await user.keyboard('{Delete}');
    expect(useStore.getState().doc.boards.map((b) => b.id)).toEqual([ids[1]]);
    expect(useStore.getState().past.length).toBe(before + 1);
  });

  it('Delete deletes nothing while a part is grabbed, however many are selected', async () => {
    const { user, ids } = await mountWithThreeBoards();
    act(() => {
      useStore.getState().toggleSelected(ids[1]!);
      useStore.getState().setTool('move');
      useStore.getState().grabSnapPoint(boardSnapPoints(useStore.getState().doc.boards[0]!)[0]!);
    });
    await user.keyboard('{Delete}');
    expect(useStore.getState().doc.boards).toHaveLength(3);
    act(() => useStore.getState().setTool('select'));
  });
});
```

- [ ] **Step 2: Run to verify red**

Run: `npx vitest run src/store/selectionGesture.test.ts src/panels/PartsList.test.tsx src/panels/Toolbar.test.tsx src/App.test.tsx`
Expected:
- `selectionGesture.test.ts` fails: module not found.
- PartsList: the modifier test fails (a Shift-click replaces), and the `aria-pressed` test fails (no attribute).
- Toolbar: PASS (a pin).
- App: the two Ctrl/Cmd+A tests fail; selection stays `[ids[0]]`. The Delete test fails: only `ids[0]` is deleted and two boards remain. The text-field, modal and grabbed tests already pass, and are pins for the mutations below.

- [ ] **Step 3: Implement**

Create `src/store/selectionGesture.ts`:

```ts
import { useStore } from './store';
import type { ToolMode } from './store';

/** The three modifier flags every pointer and mouse event carries. */
export interface ToggleModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/**
 * Shift, Ctrl or Cmd held: the click TOGGLES a part rather than replacing the
 * selection (multi-select spec §3). The ONE definition, shared by the
 * viewport's click and miss handlers and the parts list, so the two surfaces
 * cannot disagree about what Cmd means.
 */
export const isToggleModifier = (e: ToggleModifiers): boolean =>
  e.shiftKey || e.ctrlKey || e.metaKey;

/** A click on a part: plain replaces the selection, modified toggles the part. */
export function selectByClick(id: string, e: ToggleModifiers): void {
  const s = useStore.getState();
  if (isToggleModifier(e)) s.toggleSelected(id);
  else s.selectBoard(id);
}

/**
 * A click that hit no part. Clears the selection only in the Select tool —
 * a modal tool must not change the selection as a side effect (cancelling a
 * grab by clicking empty space would otherwise empty the Properties panel) —
 * and only with NO modifier held, so a slightly missed Shift-click does not
 * wipe a selection built up over many clicks.
 */
export function clearOnMiss(e: ToggleModifiers, tool: ToolMode): void {
  if (tool !== 'select' || isToggleModifier(e)) return;
  useStore.getState().selectBoard(null);
}
```

Replace `src/panels/PartsList.tsx` with:

```tsx
import { useStore } from '../store/store';
import { selectByClick } from '../store/selectionGesture';

export function PartsList() {
  const boards = useStore((s) => s.doc.boards);
  const selectedIds = useStore((s) => s.selectedIds);

  if (boards.length === 0) {
    return <p className="empty">No parts yet. Add a board to begin.</p>;
  }

  return (
    <ul className="parts">
      {boards.map((b) => {
        const selected = selectedIds.includes(b.id);
        return (
          <li key={b.id}>
            {/* aria-pressed: with several parts selectable, each row is a
                toggle, and assistive tech should hear which are on. */}
            <button
              className={selected ? 'part selected' : 'part'}
              aria-pressed={selected}
              onClick={(e) => selectByClick(b.id, e)}
            >
              {b.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
```

In `src/viewport/BoardMesh.tsx`:
- Add `import type { ToggleModifiers } from '../store/selectionGesture';`.
- In `Props`, replace `onSelect: (id: string) => void;` with:

```ts
  /** Called with the click's modifiers: plain selects, Shift/Ctrl/Cmd toggles. */
  onSelect: (id: string, modifiers: ToggleModifiers) => void;
```

- In the `onClick` handler, replace `e.stopPropagation();` and `onSelect(board.id);` with:

```ts
            // stopPropagation is LOAD-BEARING since multi-select: a ray through
            // a board split by a dado hits two of its solids, R3F would deliver
            // onClick to each, and a toggle delivered twice is a no-op.
            e.stopPropagation();
            onSelect(board.id, e.nativeEvent);
```

In `src/viewport/Viewport.tsx`:
- Add `import { clearOnMiss, selectByClick } from '../store/selectionGesture';`.
- Delete the line `const selectBoard = useStore((s) => s.selectBoard);`.
- Replace the `onPointerMissed` prop and its comment with:

```tsx
      // A modal tool must not change the selection as a side effect, and a
      // modified miss must not wipe a built-up selection — both rules live
      // in clearOnMiss.
      onPointerMissed={(e) => clearOnMiss(e, tool)}
```

- In the `BoardMesh` element, replace `onSelect={selectBoard}` with `onSelect={selectByClick}`.

In `src/App.tsx`:
- Line 47 becomes `const deleteBoards = useStore((s) => s.deleteBoards);`.
- Insert directly above the `if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {` block:

```ts
      // Ctrl/Cmd+A selects every part (multi-select spec §3). In this ONE
      // listener (invariant 27), so it inherits both guards above:
      // isTextEntry (in a field, Ctrl+A must select the field's text — and
      // that early return is why it is not preventDefaulted there) and
      // modalOpen (nothing is selected behind a sheet or a dialog). Below
      // the axis and capture blocks, which both require no modifier, so
      // neither can swallow it. preventDefault so the browser does not
      // select the page's text.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        useStore.getState().selectAll();
        return;
      }
```

- Replace the Delete block's tail (Task 1's `const id = … deleteBoard(id);`) with:

```ts
        const ids = useStore.getState().selectedIds;
        if (ids.length === 0) return;
        e.preventDefault();
        // Every selected part, as one undo entry (spec §4.3).
        deleteBoards(ids);
```

- The effect's dep list becomes `[undo, redo, deleteBoards, modalOpen]`.

- [ ] **Step 4: Run to verify green, then the gates**

Run: `npx vitest run src/store/selectionGesture.test.ts src/panels/PartsList.test.tsx src/panels/Toolbar.test.tsx src/App.test.tsx`
Expected: PASS, including every pre-existing App keyboard and type-anywhere test.

Run: `npm test && npm run build`
Expected: green; build passes.

- [ ] **Step 5: Mutation-test**

1. `isToggleModifier` drops `metaKey`. Red: the `isToggleModifier` test, the selectByClick toggle test and PartsList's Cmd step.
2. `clearOnMiss` ignores modifiers. Red: "a MODIFIED miss keeps the selection".
3. `clearOnMiss` ignores the tool. Red: "a miss in any other tool keeps the selection".
4. PartsList calls `selectBoard(b.id)` unconditionally. Red: the PartsList modifier test.
5. PartsList drops `aria-pressed`. Red: "marks every selected row".
6. Toolbar hint condition becomes `selectedIds.length !== 1` (`s.selectedIds.length === 1` as `hasSelection`). Red: the hint test at the `selectAll` step.
7. Hoist the Ctrl+A block above the `isTextEntry` early return. Red: "Ctrl+A in a text field…" (`fireEvent` returns false).
8. Hoist the Ctrl+A block above the `modalOpen` guard. Red: "Ctrl+A does nothing while the cut list is open".
9. Delete calls `deleteBoards([ids[0]])`. Red: "Delete removes every selected part".
10. Delete the `grabbed || tapeAnchor` guard. Red: "Delete deletes nothing while a part is grabbed…".

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: multi-select gestures — Shift/Ctrl/Cmd toggle, modified miss keeps, parts list, Ctrl/Cmd+A, Delete on all

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Live check (After the tasks):**
- Shift-, Ctrl- and Cmd-click on parts in the viewport toggle them, and every selected part draws brass.
- A Shift-click that just misses a part keeps the selection; a plain miss clears it.
- A click on a board split by a dado toggles it exactly once.
- In the Move tool, a viewport click selects nothing (unchanged).

---

### Task 4: The Move tool — grab from every selected part, snap to every unselected one

**Files:**
- Create: `src/viewport/moveCandidates.ts`
- Create: `src/viewport/moveCandidates.test.ts`
- Modify: `src/viewport/MoveTool.tsx:72-122`

**Interfaces:**
- Consumes: Task 1's `selectedIds`; Task 2's group `commitSnapMove`.
- Produces: `moveCandidates(boards: readonly Board[], guides: GuidePoint[], selectedIds: readonly string[], grabbing: boolean, showGuides: boolean): SnapPoint[]`.

**Invariants:**
- **26:** `grabbed` stays a `BoardSnapPoint`. MoveTool still narrows at the grab call with `isBoardOwned`, unchanged.
- **15:** the memo's deps are exactly what `moveCandidates` reads.

- [ ] **Step 1: Write the failing test**

Create `src/viewport/moveCandidates.test.ts`:

```ts
import { createBoard, createGuide, snapPointsFor } from '../document/document';
import { moveCandidates } from './moveCandidates';

const a = createBoard({ position: [0, 0, 0] });
const b = createBoard({ position: [0, 0, 10] });
const c = createBoard({ position: [40, 0, 0] });
const boards = [a, b, c];
const guides = [createGuide([5, 5, 5])];
const owners = (points: { owner: { id: string } }[]) => new Set(points.map((p) => p.owner.id));

describe('moveCandidates', () => {
  it('before a grab: the points of EVERY selected part, and nothing else', () => {
    const points = moveCandidates(boards, guides, [a.id, b.id], false, true);
    expect(owners(points)).toEqual(new Set([a.id, b.id]));
    expect(points).toHaveLength(snapPointsFor(a).length + snapPointsFor(b).length);
  });

  it('before a grab with nothing selected: nothing is grabbable', () => {
    expect(moveCandidates(boards, guides, [], false, true)).toEqual([]);
  });

  // Review Focus 5, viewport half: a part toggled OUT of the selection during
  // a grab stops moving with it and becomes a target.
  it('after a grab: every UNSELECTED part and the guides — no selected part is a target', () => {
    const points = moveCandidates(boards, guides, [a.id, b.id], true, true);
    expect(owners(points)).toEqual(new Set([c.id, guides[0]!.id]));
    const afterToggleOut = moveCandidates(boards, guides, [a.id], true, true);
    expect(owners(afterToggleOut)).toEqual(new Set([b.id, c.id, guides[0]!.id]));
  });

  it('hidden guides offer no target', () => {
    const points = moveCandidates(boards, guides, [a.id], true, false);
    expect(owners(points)).toEqual(new Set([b.id, c.id]));
  });
});
```

- [ ] **Step 2: Run to verify red**

Run: `npx vitest run src/viewport/moveCandidates.test.ts`
Expected: FAIL: module `./moveCandidates` not found.

- [ ] **Step 3: Implement**

Create `src/viewport/moveCandidates.ts`. Its doc comment is MoveTool's existing candidate comment (lines 72–112), moved and amended for the set. Pure, so it has the unit test MoveTool cannot.

```ts
import { guideSnapPoints, snapPointsFor } from '../document/document';
import type { Board, GuidePoint, SnapPoint } from '../document/document';

/**
 * The points the Move tool offers, which are two different sets rather than
 * one set with a filter.
 *
 * BEFORE a grab: the points of every SELECTED part. Boards in a real project
 * touch, so an unselected neighbour's coincident corner must not be offered —
 * pickSnapPoint's depth tie-break would silently decide which board moves.
 * Two SELECTED parts sharing a corner are harmless: both move together and
 * the two points coincide, so which one is grabbed is unobservable. With
 * nothing selected this is empty, which the toolbar's "Select a part to move"
 * hint exists to explain.
 *
 * AFTER a grab: every UNSELECTED part's points, plus the guides when shown.
 * A selected part moves with the grab, so it can never be a target (spec
 * §4.2); withholding its points is what makes that legible — an ineligible
 * point draws no marker. commitSnapMove guards the same rule for the action.
 *
 * Both branches go through snapPointsFor (box lattice + cut-owned points);
 * a cut point is most often a TARGET, on a part that is not selected.
 * GUIDES ARE TARGETS, NEVER GRAB SOURCES, so they appear after a grab only,
 * and hidden guides offer nothing (design §6).
 */
export function moveCandidates(
  boards: readonly Board[],
  guides: GuidePoint[],
  selectedIds: readonly string[],
  grabbing: boolean,
  showGuides: boolean,
): SnapPoint[] {
  const selected = new Set(selectedIds);
  if (grabbing) {
    return [
      ...boards.filter((b) => !selected.has(b.id)).flatMap(snapPointsFor),
      ...(showGuides ? guideSnapPoints(guides) : []),
    ];
  }
  return boards.filter((b) => selected.has(b.id)).flatMap(snapPointsFor);
}
```

In `src/viewport/MoveTool.tsx`:
- Replace the import `import { guideSnapPoints, sameSnapPoint, snapPointsFor } from '../document/document';` with `import { sameSnapPoint } from '../document/document';`, and add `import { moveCandidates } from './moveCandidates';`.
- Replace the comment block and memo at lines 72–122 with:

```ts
  // The two candidate sets — selected parts' points before a grab, every
  // unselected part's (plus guides) after — are moveCandidates' rule; see its
  // comment. `grabbing` rather than `grabbed` in the deps: the sets depend on
  // whether a grab is held, not on which point (invariant 15 — the deps are
  // exactly what moveCandidates reads).
  const grabbing = grabbed !== null;
  const candidates = useMemo(
    () => moveCandidates(boards, guides, selectedIds, grabbing, showGuides),
    [boards, guides, selectedIds, grabbing, showGuides],
  );
```

- In the effect's closing comment, change "`boards`, `grabbed`, `selectedIds`, `guides` and `showGuides`" to "`boards`, `grabbing`, `selectedIds`, `guides` and `showGuides`".

- [ ] **Step 4: Run to verify green, then the gates**

Run: `npx vitest run src/viewport/moveCandidates.test.ts`
Expected: PASS.

Run: `npm test && npm run build`
Expected: green; build passes.

- [ ] **Step 5: Mutation-test**

1. The post-grab filter excludes only one board, e.g. `b.id !== selectedIds[0]`, which is today's "minus the grabbed board's own" carried over. Red: "after a grab: every UNSELECTED part…" (b is offered).
2. Pre-grab returns only the first selected part's points. Red: "before a grab: the points of EVERY selected part".
3. Guides added to the pre-grab branch. Red: "before a grab…" (the guide owner appears).
4. `showGuides` ignored. Red: "hidden guides offer no target".

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat(move): grab from every selected part, snap to every unselected one (moveCandidates)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Live check (After the tasks):**
- With two parts selected, markers appear on both before a grab and on neither after it.
- Snapping one corner onto an unselected part moves both by the same delta.
- Ctrl+Z restores both in one step.
- Toggling a selected non-owner out in the parts list mid-grab keeps the grab, and its corners become targets.

---

### Task 5: The group gizmo

**Files:**
- Modify: `src/viewport/Gizmo.tsx:1-9` (imports), `:121-130` (`StabilizeOptions` comment), `:229-342` (the component)

**Interfaces:**
- Consumes: Task 1's `selectedIds`; Task 2's `moveGroupTo`, `boardsBounds` and `updateBoard` (unchanged).
- Produces: nothing new.

**Invariants:**
- **3:** the `dragging` guard is unchanged.
- **4:** one drag is one gesture.
- **10:** the size clamp reads the group box.
- **15:** effect deps are primitives.
- **25:** the store rounds the group min, once.
- **34:** bare-field selectors only.

**Why no unit test:** r3f has no unit tests by design. Everything decidable here is a store action Task 2 already tests (`moveGroupTo`: rounding, exact layout, absolute target, zero delta). This component only converts the proxy's centre to the group's min corner. The live check verifies it.

- [ ] **Step 1: Implement**

Imports: change line 1 to `import { useEffect, useMemo, useRef } from 'react';` and line 7 to `import { boardCenter, boardExtents, boardsBounds } from '../document/document';`.

In `StabilizeOptions`, reword the `boardMaxExtent` comment's first sentence to: "The longest edge of what the gizmo moves — the selected board, or with two or more selected the selection's bounding box (invariant 10, multi-select spec §4.1) — read fresh on every frame."

Replace the component from `export function Gizmo() {` through `const proxy = useRef…` (lines 229–233) with:

```tsx
export function Gizmo() {
  // Bare fields, derived below — a selector returning a fresh array would
  // re-render on every set() (invariant 34's selector rule).
  const boards = useStore((s) => s.doc.boards);
  const selectedIds = useStore((s) => s.selectedIds);
  const updateBoard = useStore((s) => s.updateBoard);
  const moveGroupTo = useStore((s) => s.moveGroupTo);
  const selected = useMemo(
    () => boards.filter((b) => selectedIds.includes(b.id)),
    [boards, selectedIds],
  );
  // ONE part selected: the original single-board path, byte for byte. It is
  // deliberately NOT routed through moveGroupTo — `old + (snap(t) - old)` is
  // not bit-identical to `snap(t)` for a non-dyadic `old`, and the spec says
  // one selected part changes nothing.
  const board = selected.length === 1 ? selected[0] : undefined;
  const bounds = selected.length >= 2 ? boardsBounds(selected) : null;
  const size: [number, number, number] | null = board
    ? boardExtents(board)
    : bounds
      ? [bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]]
      : null;
  const center: [number, number, number] | null = board
    ? boardCenter(board)
    : bounds
      ? [(bounds.min[0] + bounds.max[0]) / 2, (bounds.min[1] + bounds.max[1]) / 2, (bounds.min[2] + bounds.max[2]) / 2]
      : null;
  // A string, so the effects below re-run on a real selection change and not
  // on every render (an array dep is a new identity each time — invariant 15).
  const selectionKey = selected.map((b) => b.id).join('|');
  const proxy = useRef<THREE.Object3D>(new THREE.Object3D());
```

Then replace each of these:

1. `boardMaxExtent.current = board ? Math.max(...boardExtents(board)) : 0;` with `boardMaxExtent.current = size ? Math.max(...size) : 0;`. In its comment, "The board's longest edge" becomes "The longest edge of what the gizmo moves".
2. The stabilize effect's deps `[board?.id, camera]` with `[selectionKey, camera]`. In the effect's comment above `const camera`, "not just on selection change" stays true.
3. The proxy-sync effect with the code below. Keep its comment block, which states invariant 3's guard.

```tsx
  useEffect(() => {
    if (center && !dragging.current) proxy.current.position.set(...center);
  }, [selectionKey, center?.[0], center?.[1], center?.[2]]);
```

4. The Route 1 effect with the code below. Keep its comment, rewording "the board is deleted or deselected" to "the selection empties (a delete, an undo, a deselect)".

```tsx
  const hasTarget = center !== null;
  useEffect(() => {
    if (hasTarget) return;
    if (dragging.current) {
      dragging.current = false;
      useStore.getState().endGesture();
    }
  }, [hasTarget]);
```

5. `if (!board || !selectedId) return null;` with `if (!center || !size) return null;`.
6. The `commit` function with the code below.

```tsx
  const commit = () => {
    const p = proxy.current.position;
    if (board) {
      const extents = boardExtents(board);
      // Gizmo works in centers; the document stores min-corners. Convert back,
      // then snap — snapping the corner, not the center, is what makes a board
      // land flush on a 1/16" boundary. `translationSnap` already steps the
      // control itself; this second snap keeps the stored corner exact after the
      // center-to-corner conversion.
      updateBoard(board.id, {
        position: [
          snap(p.x - extents[0] / 2),
          snap(p.y - extents[1] / 2),
          snap(p.z - extents[2] / 2),
        ],
      });
      return;
    }
    // Two or more: hand the store the group's wanted min corner, UNROUNDED.
    // moveGroupTo rounds it once and moves every part by one delta, so the
    // layout survives exactly even for an off-grid part (invariant 25).
    moveGroupTo(selected.map((b) => b.id), [
      p.x - size[0] / 2,
      p.y - size[1] / 2,
      p.z - size[2] / 2,
    ]);
  };
```

The JSX return is unchanged. Grep the file for `selectedId`: there must be none.

- [ ] **Step 2: The gates**

Run: `npm test && npm run build`
Expected: green; build passes. The build is the real check here: `size` must narrow to non-null inside `commit`, after the early return.

- [ ] **Step 3: Commit**

```bash
git add src/viewport/Gizmo.tsx
git commit -m "feat(gizmo): one gizmo for a group, at the selection's centre; drag via moveGroupTo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Live check (After the tasks).** All of it is the dev server with the user watching:
- With two or more parts selected there is one gizmo, at the selection box's centre, sized for the box. It does not shrink to one part's size.
- A drag moves every part.
- Ctrl+Z after one drag restores every part in one step.
- With an off-grid part in the group (type `5.01` into its X first, in single-part mode), its offset from the others reads the same before and after the drag. Use `localStorage` readback, as invariant 25's verification did.
- One part selected: the gizmo behaves exactly as before.
- Switching the projection with a group selected keeps the gizmo's flip fix.
- Mousing up on a group's gizmo without moving snaps an off-grid group min onto the grid. That is today's single-board behaviour (the `onMouseUp` commit), carried over; note it, don't fix it.

---

### Task 6: `DimensionField` learns "mixed"

**Files:**
- Modify: `src/panels/DimensionField.tsx`
- Test: `src/panels/DimensionField.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `DimensionField`'s `value` prop becomes `number | null`. `null` means MIXED: the box shows `''` with placeholder `mixed`, and every resync shows `''` again. Callers passing a number are unaffected.

**Invariant 5:** the untouched-blur guard is what makes a mixed field safe. This task makes `null` survive every path that formats `value`: the initial state, the adopt effect, the blur resync and Escape.

- [ ] **Step 1: Write the failing tests**

Append to `src/panels/DimensionField.test.tsx`:

```tsx
describe('DimensionField — mixed (value null)', () => {
  it('shows an empty box with a "mixed" placeholder', () => {
    const { input } = setup({ value: null });
    expect(input.value).toBe('');
    expect(input).toHaveAttribute('placeholder', 'mixed');
  });

  it('a field with a value has no placeholder', () => {
    const { input } = setup();
    expect(input).not.toHaveAttribute('placeholder');
  });

  // Review Focus 3. THE TRAP (invariant 5): committing here would set every
  // selected part to one value, silently. Asserts the error state too: with
  // the dirty guard deleted, blur commits '' — parseLength('') is null — so
  // "no onCommit" alone would survive that mutation.
  it('writes NOTHING when focused and blurred untouched, and shows no error', async () => {
    const { onCommit, input } = setup({ value: null });
    await userEvent.click(input);
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // The case where a deleted dirty guard really WRITES: a shared field is
  // focused, an external change makes the parts differ while it holds focus
  // (the adopt effect skips while editing), and it blurs untouched. Without
  // the guard, blur commits the stale "1-1/2" text, 1.5 !== null, and every
  // part is set to 1.5. This is invariant 5's original failure mode, arriving
  // through the mixed state.
  it('writes nothing when a focused field turns mixed under it and then blurs untouched', async () => {
    const onCommit = vi.fn();
    const { rerender } = render(<DimensionField label="Length" value={1.5} onCommit={onCommit} />);
    const input = screen.getByLabelText('Length') as HTMLInputElement;
    await userEvent.click(input);
    rerender(<DimensionField label="Length" value={null} onCommit={onCommit} />);
    await userEvent.tab();
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('writes nothing on Enter when untouched', async () => {
    const { onCommit, input } = setup({ value: null });
    await userEvent.click(input);
    await userEvent.keyboard('{Enter}');
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('commits a typed value', async () => {
    const { onCommit, input } = setup({ value: null });
    await userEvent.type(input, '3/4');
    await userEvent.tab();
    expect(onCommit).toHaveBeenCalledWith(0.75);
  });

  it('Escape reverts a draft to the empty mixed box', async () => {
    const { onCommit, input } = setup({ value: null });
    await userEvent.type(input, '3/4{Escape}');
    expect(input.value).toBe('');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('adopts an external change from mixed to a value and back', () => {
    const onCommit = vi.fn();
    const { rerender } = render(<DimensionField label="Length" value={null} onCommit={onCommit} />);
    const input = screen.getByLabelText('Length') as HTMLInputElement;
    rerender(<DimensionField label="Length" value={2} onCommit={onCommit} />);
    expect(input.value).toBe('2"');
    rerender(<DimensionField label="Length" value={null} onCommit={onCommit} />);
    expect(input.value).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify red**

Run: `npx vitest run src/panels/DimensionField.test.tsx`
Expected: FAIL.
- `formatLength(null, …)` shows a non-empty or `NaN` string, or throws.
- No `placeholder` attribute.
- `npm run build` would also reject `value: null` against `value: number`.

- [ ] **Step 3: Implement**

In `src/panels/DimensionField.tsx`, replace the `value` prop declaration with:

```ts
  /**
   * The stored value, or null for MIXED: several parts are being edited and
   * they differ (multi-select spec §4.4). Mixed shows an empty box with a
   * `mixed` placeholder. The untouched-blur guard below is what makes it
   * safe — committing a mixed field nobody typed in would set every part to
   * one value, silently (invariant 5).
   */
  value: number | null;
```

Directly after `const id = useId();`, add:

```ts
  // The one formatter for `value`, so every resync path — initial state, the
  // adopt effect, the untouched-blur resync, Escape — handles mixed alike.
  const display = (v: number | null) => (v === null ? '' : formatLength(v, precision));
```

Then replace each of the four `formatLength(value, precision)` calls with `display(value)`:
- the `useState` initialiser: `useState(() => display(value))`;
- the adopt effect's `setText`;
- the `!dirty.current` blur branch's `setText`;
- the Escape branch's `setText`.

`formatLength(parsed, precision)`, `formatLength(min, precision)` and `formatLength(max, precision)` stay as they are.

On the `<input>`, add `placeholder={value === null ? 'mixed' : undefined}`.

`commit()` needs no change. Its `if (parsed === value) return;` never matches `null`, so a typed value always commits.

- [ ] **Step 4: Run to verify green, then the gates**

Run: `npx vitest run src/panels/DimensionField.test.tsx`
Expected: PASS, including every pre-existing DimensionField test.

Run: `npm test && npm run build`
Expected: green; build passes.

- [ ] **Step 5: Mutation-test**

1. Delete the `if (!dirty.current) { … return; }` branch in `onBlur`. Red:
   - "writes NOTHING when focused and blurred untouched": an alert appears and `aria-invalid` is `true`;
   - "writes nothing when a focused field turns mixed under it…": `onCommit(1.5)` is called. This one goes red at the WRITE.
2. `display` returns `formatLength(v ?? 0, precision)`. Red: the placeholder test and the untouched test (`value` becomes `0"`).
3. The adopt effect keeps `formatLength(value, precision)`. Red: "adopts an external change from mixed to a value and back".
4. The Escape branch keeps `formatLength(value, precision)`. Red: "Escape reverts a draft to the empty mixed box".
5. Enter commits regardless of `dirty`. Red: "writes nothing on Enter when untouched".
6. Drop the `placeholder` prop. Red: "shows an empty box with a 'mixed' placeholder".

- [ ] **Step 6: Commit**

```bash
git add src/panels/DimensionField.tsx src/panels/DimensionField.test.tsx
git commit -m "feat(panels): DimensionField value null = mixed — empty, placeholder, never writes on an untouched blur

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Properties with two or more parts selected

**Files:**
- Modify: `src/panels/Properties.tsx` (imports, a new `shared` helper and `GroupProperties` above `export function Properties`, and the top of `Properties`)
- Test: `src/panels/Properties.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1's `selectedIds`, `deleteBoards` and `duplicateBoards`;
  - Task 2's `updateBoards`;
  - Task 6's `DimensionField value: number | null`.
- Produces: nothing exported.

**Invariants:**
- **5:** the mixed trap.
- **2:** each part keeps its own min corner, through `updateBoards` → `patchBoard`.
- **8:** duplicate names.
- **34:** bare-field selectors and `useMemo`.
- **18's reading:** "shared" compares exact stored values, so `0.7` and `0.6875` are mixed even though both display `11/16"`.

- [ ] **Step 1: Write the failing tests**

Append to `src/panels/Properties.test.tsx`:

```tsx
describe('Properties with two or more parts selected', () => {
  const board = (id: string) => useStore.getState().doc.boards.find((x) => x.id === id)!;
  const past = () => useStore.getState().past.length;

  /** a at the origin, b 3-1/2 wide at [30, 0, 8]; both selected. */
  const group = () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    const [a, b] = useStore.getState().doc.boards;
    useStore.getState().updateBoard(b!.id, { width: 3.5, position: [30, 0, 8] });
    useStore.getState().selectBoard(a!.id);
    useStore.getState().toggleSelected(b!.id);
    return { a: a!.id, b: b!.id };
  };

  it('reads "N parts selected" and offers only the group fields', () => {
    group();
    render(<Properties />);
    expect(screen.getByRole('heading', { name: '2 parts selected' })).toBeInTheDocument();
    for (const label of ['Length', 'Width', 'Thickness', 'Runs']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.getByRole('combobox', { name: 'Material' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duplicate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    for (const label of ['Part name', 'X', 'Y', 'Z', 'Posture', 'Turn']) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: /add cut/i })).not.toBeInTheDocument();
  });

  it('shows a shared value, and an empty "mixed" box where the parts differ', () => {
    group();
    render(<Properties />);
    expect((screen.getByLabelText('Length') as HTMLInputElement).value).toBe('24"');
    const width = screen.getByLabelText('Width') as HTMLInputElement;
    expect(width.value).toBe('');
    expect(width).toHaveAttribute('placeholder', 'mixed');
  });

  it('shows a disabled "mixed" option on a select whose parts differ', () => {
    const { b } = group();
    useStore.getState().updateBoard(b, { grain: 'width' });
    render(<Properties />);
    expect((screen.getByLabelText('Runs') as HTMLSelectElement).value).toBe('');
    expect(screen.getByRole('option', { name: 'mixed' })).toBeDisabled();
  });

  it('treats values that DISPLAY alike but are stored differently as mixed; a typed value lands exactly on both', async () => {
    const { a, b } = group();
    useStore.getState().updateBoards([a, b], { thickness: 0.7 });
    useStore.getState().updateBoard(b, { thickness: 0.6875 }); // both read 11/16"
    render(<Properties />);
    const t = screen.getByLabelText('Thickness') as HTMLInputElement;
    expect(t.value).toBe('');
    await userEvent.type(t, '3/4');
    await userEvent.tab();
    expect(board(a).thickness).toBe(0.75);
    expect(board(b).thickness).toBe(0.75);
  });

  it('an edit applies to every selected part as ONE undo entry, each on its own corner', async () => {
    const { a, b } = group();
    render(<Properties />);
    const before = past();
    const len = screen.getByLabelText('Length');
    await userEvent.clear(len);
    await userEvent.type(len, '30');
    await userEvent.tab();
    expect([board(a).length, board(b).length]).toEqual([30, 30]);
    expect(board(a).position).toEqual([0, 0, 0]);
    expect(board(b).position).toEqual([30, 0, 8]);
    expect(past()).toBe(before + 1);
  });

  it('refuses a value out of range and writes to no part', async () => {
    const { a, b } = group();
    render(<Properties />);
    const before = past();
    const len = screen.getByLabelText('Length');
    await userEvent.clear(len);
    await userEvent.type(len, '0');
    await userEvent.tab();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect([board(a).length, board(b).length]).toEqual([24, 24]);
    expect(past()).toBe(before);
  });

  // Review Focus 3. THE TRAP, at the panel: spec §4.4 asks for this test by name.
  it('THE TRAP: a mixed field focused and blurred untouched writes NOTHING (invariant 5)', async () => {
    group();
    render(<Properties />);
    const before = past();
    const doc = useStore.getState().doc;
    const width = screen.getByLabelText('Width') as HTMLInputElement;
    await userEvent.click(width);
    await userEvent.tab();
    expect(useStore.getState().doc).toBe(doc);
    expect(past()).toBe(before);
    expect(width.value).toBe('');
    expect(width).toHaveAttribute('placeholder', 'mixed');
    expect(width).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // The panel half of Task 6's write case: the trap test above starts mixed,
  // so a deleted guard commits '' and is refused. Here the field holds real
  // text when the parts start to differ under it, so a deleted guard WRITES.
  it('a shared field that turns mixed while focused writes nothing on an untouched blur', async () => {
    const { a, b } = group();
    render(<Properties />);
    const len = screen.getByLabelText('Length') as HTMLInputElement; // shared: 24"
    await userEvent.click(len);
    act(() => { useStore.getState().updateBoard(b, { length: 30 }); }); // now 24 / 30
    const before = past();
    const doc = useStore.getState().doc;
    await userEvent.tab();
    expect(useStore.getState().doc).toBe(doc);
    expect(past()).toBe(before);
    expect([board(a).length, board(b).length]).toEqual([24, 30]);
    expect(len.value).toBe('');
  });

  it('a mixed select focused and blurred without a change writes nothing', async () => {
    const { b } = group();
    useStore.getState().updateBoard(b, { grain: 'width' });
    render(<Properties />);
    const before = past();
    const doc = useStore.getState().doc;
    await userEvent.click(screen.getByLabelText('Runs'));
    await userEvent.tab();
    expect(useStore.getState().doc).toBe(doc);
    expect(past()).toBe(before);
  });

  it('a grain change applies to every part', async () => {
    const { a, b } = group();
    render(<Properties />);
    await userEvent.selectOptions(screen.getByLabelText('Runs'), 'width');
    expect([board(a).grain, board(b).grain]).toEqual(['width', 'width']);
  });

  it('a material change resets grain per part, the way a single edit does', async () => {
    const { a, b } = group();
    useStore.getState().updateBoard(a, { grain: 'thickness' });
    useStore.getState().updateBoard(b, { grain: 'width' });
    render(<Properties />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Material' }), 'plywood');
    expect([board(a).material, board(b).material]).toEqual(['plywood', 'plywood']);
    expect([board(a).grain, board(b).grain]).toEqual(['length', 'width']);
  });

  it('offers "Through thickness" only when no selected part is a sheet good', () => {
    const { b } = group();
    useStore.getState().updateBoard(b, { material: 'plywood' });
    render(<Properties />);
    expect(screen.queryByRole('option', { name: 'Through thickness' })).not.toBeInTheDocument();
  });

  it('Duplicate copies every selected part as one undo entry and selects the copies', async () => {
    const { a, b } = group();
    render(<Properties />);
    const before = past();
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    const boards = useStore.getState().doc.boards;
    expect(boards).toHaveLength(4);
    expect(past()).toBe(before + 1);
    expect(useStore.getState().selectedIds).toEqual([boards[2]!.id, boards[3]!.id]);
    expect(useStore.getState().selectedIds).not.toContain(a);
    expect(useStore.getState().selectedIds).not.toContain(b);
  });

  it('Delete removes every selected part as one undo entry', async () => {
    group();
    render(<Properties />);
    const before = past();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(useStore.getState().doc.boards).toHaveLength(0);
    expect(past()).toBe(before + 1);
  });

  it('resyncs from the new selection when it changes under a draft, writing nothing', async () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    s.addBoard();
    const [a, b, c] = useStore.getState().doc.boards.map((x) => x.id);
    useStore.getState().updateBoard(c!, { length: 30 });
    useStore.getState().selectBoard(a!);
    useStore.getState().toggleSelected(b!);
    render(<Properties />);
    const before = past();
    const len = screen.getByLabelText('Length') as HTMLInputElement;
    await userEvent.clear(len);
    await userEvent.type(len, '12'); // a draft: typed, not committed
    act(() => { useStore.getState().toggleSelected(c!); });
    const after = screen.getByLabelText('Length') as HTMLInputElement;
    expect(after.value).toBe(''); // 24, 24, 30: mixed
    expect(after).toHaveAttribute('placeholder', 'mixed');
    expect(past()).toBe(before);
    expect([board(a!).length, board(b!).length, board(c!).length]).toEqual([24, 24, 30]);
  });

  // Review Focus 1, panel half.
  it('drops to the single-part panel when an undo removes a member of the group', () => {
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    const [a, b] = useStore.getState().doc.boards.map((x) => x.id);
    useStore.getState().selectBoard(a!);
    useStore.getState().toggleSelected(b!);
    render(<Properties />);
    expect(screen.getByRole('heading', { name: '2 parts selected' })).toBeInTheDocument();
    act(() => { useStore.getState().undo(); }); // un-adds b
    expect(screen.queryByRole('heading', { name: /parts selected/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Part name')).toHaveValue('Board');
  });
});
```

**If "resyncs from the new selection…" fails because jsdom fires `blur` on the removed, focused input (the draft gets committed), STOP and report it.** It would mean a group draft can be committed to the OLD selection on a selection change. That is a design question for the user, not a test to adjust.

- [ ] **Step 2: Run to verify red**

Run: `npx vitest run src/panels/Properties.test.tsx`
Expected: FAIL. With two selected, `Properties` renders "Select a part to edit it.", so every group test fails to find its heading or field. The undo test fails at its first assertion.

- [ ] **Step 3: Implement**

In `src/panels/Properties.tsx`, change line 1 to `import { useEffect, useMemo, useRef, useState } from 'react';`.

Add above `export function Properties()`:

```tsx
/**
 * The value every part holds, or null when they differ. EXACT comparison of
 * stored values: two thicknesses that both display 11/16" but are stored as
 * 0.7 and 0.6875 are mixed, because showing "11/16" would claim they agree
 * when they do not (stored values are exact; display rounds — invariant 5).
 */
function shared<T>(boards: Board[], read: (b: Board) => T): T | null {
  const first = read(boards[0]!);
  return boards.every((b) => read(b) === first) ? first : null;
}

/**
 * Properties for two or more selected parts (multi-select spec §4.4): Length,
 * Width, Thickness, Grain and Material, plus Duplicate and Delete. No name,
 * position, posture, turn or cuts.
 *
 * Every edit is ONE `updateBoards` call — one undo entry, each part through
 * the same per-board rules a single edit uses (its own min corner, its own
 * sheet-good grain reset).
 *
 * THE TRAP is invariant 5's: a mixed field (null value) must never write on an
 * untouched blur. DimensionField's dirty guard holds that for the text fields;
 * the selects write only from onChange, never on blur.
 *
 * The root is keyed on the selection, so ANY selection change remounts the
 * fields and they resync from the new parts — the rule invariant 5 states for
 * an external change. Without it a mixed field (null -> null) would keep a
 * stale draft across a selection change, since its value never changed.
 */
function GroupProperties() {
  const allBoards = useStore((s) => s.doc.boards);
  const selectedIds = useStore((s) => s.selectedIds);
  const precision = useStore((s) => s.doc.units.precision);
  const updateBoards = useStore((s) => s.updateBoards);
  const deleteBoards = useStore((s) => s.deleteBoards);
  const duplicateBoards = useStore((s) => s.duplicateBoards);
  const boards = useMemo(
    () => selectedIds.flatMap((id) => allBoards.filter((b) => b.id === id)),
    [allBoards, selectedIds],
  );
  if (boards.length === 0) return null;

  const set = (patch: Partial<Board>) => updateBoards(selectedIds, patch);
  const grain = shared(boards, (b) => b.grain);
  const material = shared(boards, (b) => b.material);
  // A sheet good has no 'thickness' grain (isSheetGood's comment), so the
  // option is offered only when it would be legal for EVERY selected part.
  const anySheetGood = boards.some((b) => isSheetGood(b.material));

  return (
    <div className="properties" key={selectedIds.join('|')}>
      <h3>{boards.length} parts selected</h3>

      <h3>Dimensions</h3>
      <DimensionField label="Length" precision={precision} value={shared(boards, (b) => b.length)}
        onCommit={(v) => set({ length: v })} />
      <DimensionField label="Width" precision={precision} value={shared(boards, (b) => b.width)}
        onCommit={(v) => set({ width: v })} />
      <DimensionField label="Thickness" precision={precision} value={shared(boards, (b) => b.thickness)}
        onCommit={(v) => set({ thickness: v })} />

      <h3>Grain</h3>
      <div className="field field-wide">
        <label htmlFor="grain">Runs</label>
        <select id="grain" className="input" value={grain ?? ''}
          onChange={(e) => set({ grain: e.target.value as Grain })}>
          {grain === null && <option value="" disabled>mixed</option>}
          <option value="length">Along length</option>
          <option value="width">Across width</option>
          {!anySheetGood && <option value="thickness">Through thickness</option>}
        </select>
      </div>

      <h3 id="material-heading">Material</h3>
      <div className="field field-wide">
        <select aria-labelledby="material-heading" className="input" value={material ?? ''}
          onChange={(e) => set({ material: e.target.value })}>
          {material === null && <option value="" disabled>mixed</option>}
          {Object.entries(MATERIALS).map(([key, m]) => (
            <option key={key} value={key}>{m.label}</option>
          ))}
        </select>
      </div>

      <div className="row">
        <button onClick={() => duplicateBoards(selectedIds)}>Duplicate</button>
        <button className="danger" onClick={() => deleteBoards(selectedIds)}>Delete</button>
      </div>
    </div>
  );
}
```

At the top of `Properties`, below the `board` selector (Task 1's version), add:

```tsx
  const groupSize = useStore((s) => s.selectedIds.length);
```

Directly above `if (!board) return <p className="empty">Select a part to edit it.</p>;` add the line below. Every hook in `Properties` sits above it, so hook order is unchanged.

```tsx
  if (groupSize >= 2) return <GroupProperties />;
```

- [ ] **Step 4: Run to verify green, then the gates**

Run: `npx vitest run src/panels/Properties.test.tsx`
Expected: PASS, including every pre-existing single-part test.

Run: `npm test && npm run build`
Expected: green; build passes.

- [ ] **Step 5: Mutation-test**

1. The Width field gets `value={boards[0]!.width}` in place of `shared(...)`. Red: "shows a shared value, and an empty 'mixed' box…" and THE TRAP (`value` is `5-1/2"`).
2. Delete DimensionField's `!dirty` blur branch (Task 6's mutation 1, re-run at the panel). This is the "make the blur commit" mutation spec §4.4 names. Red:
   - THE TRAP, at the alert and `aria-invalid` (blur commits `''`, which is refused);
   - "a shared field that turns mixed while focused…", at the doc identity and `past`. Blur commits the stale `24"`, so `updateBoards` sets b back to 24.
3. Mutations 1 and 2 together. Red: THE TRAP, at the `value` assertion (`5-1/2"`). It does NOT write: `5-1/2"` parses back to 5.5, which equals the passed value, so `commit()` returns before `onCommit`.
4. Add `onBlur={(e) => set({ grain: e.target.value as Grain })}` to the grain select. Red: "a mixed select focused and blurred without a change writes nothing".
5. `onCommit` loops `updateBoard` per id. Red: "an edit applies … as ONE undo entry".
6. `onCommit` writes only `selectedIds[0]`. Red: the same test (b stays 24).
7. Group Length gets `min={0}`. Red: "refuses a value out of range…".
8. Key the root `div` on a constant (`key="group"`). Red: "resyncs from the new selection when it changes under a draft" (the field still shows `12`).
9. `shared` compares `formatLength` of each value rather than the value. Red: "treats values that DISPLAY alike … as mixed".
10. Duplicate calls `duplicateBoards([selectedIds[0]!])`. Red: the Duplicate test (3 boards, not 4).
11. Delete calls `deleteBoards([selectedIds[0]!])`. Red: the Delete test.
12. Drop the `anySheetGood` condition. Red: "offers 'Through thickness' only when…".
13. `undo` stops filtering the selection (Task 1's mutation 3, re-run at the panel). Red: "drops to the single-part panel…". The stale id keeps `groupSize` at 2, so `GroupProperties` renders "1 parts selected".

- [ ] **Step 6: Commit**

```bash
git add src/panels/Properties.tsx src/panels/Properties.test.tsx
git commit -m "feat(properties): group mode — N parts selected, shared/mixed fields, one undo entry per edit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: CLAUDE.md rules for the round

**Files:**
- Modify: `CLAUDE.md` (the Sloyd one, `/home/alec/docker/sloyd/CLAUDE.md`)

**Interfaces:** documentation only. No code.

- [ ] **Step 1: Make these edits, and only these**

1. **"Where things live":**
   - **`geometry.ts`** (the `document/geometry.ts` line): append "`boardsBounds` — the box around a set of boards; the group gizmo sits at its centre and `moveGroupTo` rounds its `min`".
   - **`store/store.ts`:** append "`selectedIds` — insertion order, no duplicates, view state, NO primary part — written ONLY through `selectionPatch`, which also carries invariant 24's retargeting rule for a set. Group actions are each one `edit()`: `deleteBoards`, `duplicateBoards` (names against the growing list, inv 8) and `updateBoards` (each part through `patchBoard`, the one per-board rule set). The singular actions delegate. `moveGroupTo` takes an ABSOLUTE min corner and rounds the group's, once (inv 42). `commitSnapMove` translates every selected part through `translateBoards`."
   - **Add a line** under `store/`: "`selectionGesture.ts` — `isToggleModifier` (Shift/Ctrl/Cmd), `selectByClick`, `clearOnMiss` (no clear on a MODIFIED miss, nor outside the Select tool). In the store layer because the viewport AND the parts list share it."
   - **`Viewport.tsx`:** append "plain click selects, a modified click toggles (`selectByClick`); a modified miss keeps the selection (`clearOnMiss`); `f` frames the whole selection and stays a no-op with none".
   - **`BoardMesh.tsx`:** append "`onSelect(id, modifiers)`. Its `stopPropagation` is load-bearing: a toggle delivered to two solids of one board is a no-op".
   - **`MoveTool.tsx`:** replace "Candidates are TWO SETS, not one set with a filter: pre-grab the SELECTED board's points only, post-grab every board's minus the grabbed board's own" with "Candidates are `moveCandidates` (pure, tested): pre-grab every SELECTED part's points, post-grab every UNSELECTED part's. A selected part moves with the grab and is never a target".
   - **Add a line** under `viewport/`: "`moveCandidates.ts` — the Move tool's two candidate sets. Pure".
   - **`Gizmo.tsx`:** append "With 2+ selected: one proxy at the selection box's centre, committing through `moveGroupTo`. The single-part commit is untouched ON PURPOSE (inv 42)".
   - **`DimensionField.tsx`:** append "`value: null` is MIXED: an empty box with a `mixed` placeholder. Every resync path formats through `display`".
   - **`Properties.tsx`:** append "2+ selected: `GroupProperties` — Length/Width/Thickness/Grain/Material + Duplicate/Delete, each edit one `updateBoards`; `shared` compares EXACT stored values; the root is keyed on the selection so a change resyncs".
   - **`PartsList.tsx`** (on the `PartsList.tsx  FileMenu.tsx` line): append "PartsList: plain click selects, a modified click toggles; `aria-pressed` per row".
   - **`App.tsx`:** change "M, T, X/Y/Z, Escape and undo/redo all live in the ONE existing keydown effect" to "M, T, X/Y/Z, Ctrl/Cmd+A, Escape, Delete and undo/redo all live in the ONE existing keydown effect". Append "Delete removes every selected part".

2. **Invariant 5.** Append this paragraph:

```markdown
    **A MIXED field is the sharpest case (multi-select).** `DimensionField`'s `value: null`
    shows an empty box; an untouched blur there must write nothing, because a commit would set
    every selected part to one value with no sign on screen. The test for it asserts the ERROR
    state as well as the absence of a write: with the dirty guard deleted, blur commits `''`,
    which `parseLength` refuses, so "nothing written" alone survives the mutation.
```

3. **Invariant 24, "The user retargeted the tool" bullet.** Replace the bullet's text with:

```markdown
    - **The user retargeted the tool.** Only `grabbed`, because Move's grab candidates are the
      SELECTED parts' points. Every selection write — `selectBoard`, `toggleSelected`,
      `selectAll`, and `edit()`'s `selection` callback (so `addBoard`/`duplicateBoards` inherit
      it) — goes through `selectionPatch`, which drops the grab exactly when its owner leaves
      `selectedIds`. Toggling out a selected part that is NOT the owner keeps the grab, and
      that part becomes a target. `commitSnapMove` also refuses outright when
      `grabbed.owner.id` is not in `selectedIds`, before any `edit()`, deliberately leaving
      `grabbed` in hand.
```

   In the PROHIBITION bullet below it, change "`edit()`'s selection callback and `selectBoard` must NOT clear `tapeAnchor` or `tapeHover`" to "no selection write — `selectionPatch`, and so `selectBoard`, `toggleSelected`, `selectAll` and `edit()`'s selection callback — may clear `tapeAnchor` or `tapeHover`".

4. **Invariant 42.** Add it after invariant 41:

```markdown
42. **A group move rounds the GROUP's min corner once and adds ONE delta to every part; the
    single-part gizmo path stays separate.** `moveGroupTo` takes the ABSOLUTE wanted min
    corner (TransformControls fires every frame, so a delta would accumulate), rounds it to
    `SNAP_INCHES`, subtracts the group's current min, and hands that one delta to
    `translateBoards` — the same helper `commitSnapMove` uses, unrounded there. Rounding each
    part's corner instead pulls an off-grid part onto the grid and breaks the layout by up to
    a sixteenth, with the display rounding to the same string (invariant 25's argument, one
    level up). And one selected part does NOT go through `moveGroupTo`: `old + (snap(t) - old)`
    is not bit-identical to `snap(t)` for a non-dyadic `old`, so routing it there would change
    shipped single-part behaviour invisibly. **Do not "unify" the two paths**, and do not
    round inside `translateBoards`.

    The selection itself has ONE writer, `selectionPatch`. A second place that assigns
    `selectedIds` is a second decider for invariant 24's grab rule.
```

5. **The rounds table and the Status block.** Do NOT edit them yet. The controller does after the live check.

- [ ] **Step 2: Check and commit**

Run: `npm test && npm run build`. Nothing should change, but run them anyway.

```bash
git add CLAUDE.md
git commit -m "docs: multi-select — invariant 42, invariants 5 and 24 widened, where things live

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the tasks (the controller, not a task)

- **The final whole-branch review**, on the most capable model.
- **The live check (spec §6, Browser).** Claude drives the dev server in the Playwright browser and the user watches. No paid calls, and nothing in this round depends on shader behaviour (26a). It covers the checklists at the end of Tasks 3, 4 and 5:
  - Shift/Ctrl/Cmd-click selection in the viewport and the parts list;
  - a missed modified click keeping the selection;
  - the group gizmo drag, including the off-grid readback;
  - a group Move-tool snap;
  - `f` framing the selection.
- **The record:**
  - `docs/browser-verification-multi-select.md`, with screenshots in `docs/img/` where the finding is spatial (the single group gizmo);
  - the history entry, the rounds-table row and the Status test count;
  - then the merge (`git merge --no-ff multi-select`) and the deploy, each on the user's word.

---

## Self-Review

**1. Spec coverage.**

| Spec section | Where |
|---|---|
| §2 model and three actions | Task 1 |
| §2 writers: `edit()` callback, `deleteBoard`, `commitSnapMove`, undo/redo | Task 1; `replaceDocument` per clarification 2 |
| §3 viewport clicks, missed click, highlight, `f` | Task 3 (helpers + wiring); highlight and `f` migrated in Task 1; live check |
| §3 parts list | Task 3 |
| §3 Ctrl/Cmd+A and its guards | Task 3 |
| §3 invariant 24 for a set, and the prohibition | Task 1 |
| §4.1 gizmo, snapping, undo, position-only, invariants 3 and 10 | Task 2 (store path) + Task 5 (component) + live check |
| §4.2 Move tool | Task 2 (commit) + Task 4 (candidates) |
| §4.2 the hint | Task 1 (migration) + Task 3 (pin) |
| §4.3 Delete key and button | Tasks 3 and 7 |
| §4.3 Duplicate | Tasks 1 and 7 |
| §4.4 Properties group mode, the trap, resync on selection change | Tasks 6 and 7 |
| §4.4 per-part refusal | clarification 3 |
| §5 unchanged items | Global Constraints |
| §6 every listed unit test | owned as above |

No gaps.

**2. Placeholder scan.**
- Every code step carries the code.
- Three steps tell the implementer to move an existing comment block verbatim. That is an instruction about prose, not missing code.
- No TBDs.

**3. Type consistency.**

| Name | Defined | Used |
|---|---|---|
| `selectedIds: string[]` | Task 1 | Tasks 1–7 |
| `deleteBoards(ids: string[])`, `duplicateBoards(ids: string[])` | Task 1 | Tasks 3 and 7 |
| `updateBoards(ids: string[], patch: Partial<Board>)` | Task 2 | Task 7 |
| `moveGroupTo(ids: string[], minCorner: [number, number, number])` | Task 2 | Task 5 |
| `boardsBounds(boards: readonly Board[]): Bounds \| null` | Task 2 | Tasks 2 and 5 |
| `ToggleModifiers`, `isToggleModifier`, `selectByClick`, `clearOnMiss` | Task 3 | Task 3 |
| `moveCandidates(boards, guides, selectedIds, grabbing, showGuides)` | Task 4 | Task 4 |
| `DimensionField value: number \| null` | Task 6 | Task 7 |

**4. Review Focus.** Five lines, each with its test in the owning task:
1. Tasks 1 and 7.
2. Task 3.
3. Tasks 6 and 7.
4. Task 2.
5. Tasks 1 and 4.

The display-alike-but-stored-differently case is pinned in Task 7 as a sixth.
