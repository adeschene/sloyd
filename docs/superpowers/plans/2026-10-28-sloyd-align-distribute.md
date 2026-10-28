# Align and Distribute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the multi-selection panel, Align moves the selected items so their min face, centre or max face on one world axis matches
the anchor's. The anchor is the item selected first. Space evenly makes equal gaps between the items lying between the two outermost.
Both are exact, one undo entry per click.

**Architecture:**
- **A pure decider, `src/document/align.ts`,** takes the items' extents and returns per-item world deltas or a refusal.
- **Copy lives in `src/document/alignText.ts`.**
- **Two store actions,** `alignItems` and `distributeItems`, each make ONE `edit()` folding `translateItems` over the items, then call
  `judgeHeld()`.
- **An `Align` section in `GroupProperties`** carries the buttons.

**Tech Stack:** TypeScript, React, Zustand, Vitest (`npx vitest run <file>`), `npm run build` (the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-28-sloyd-align-distribute-design.md` (APPROVED 2026-10-28). It wins over this plan. Work
on branch `align` from `master`, and merge locally with `--no-ff`.

## Global Constraints

- No schema change. Nothing stored beyond positions.
- **Exact (inv 25):** no `snapToGrid`, no rounding anywhere, and never through `moveGroupTo` (inv 42).
- **The anchor** is `selectedIds[0]`; its delta is `[0, 0, 0]` and it is never passed to `translateItems`.
- **Extents:** for an item, `partsBounds(worldParts(doc).filter((b) => isCovered(b.id, new Set([id]))))`.
- **Space evenly:** see spec §4.
  - Order by `min[a]`, then `max[a]`, then selection index.
  - `g = (last.min[a] − first.max[a] − Σ inner sizes) / (n − 1)`.
  - Inner `newMin_k = first.max[a] + k·g + Σ_{j<k} innerSize_j`.
  - Refuse when `g < −1e-9`.
  - The outer two get delta 0.
- **Copy (exact, in `alignText.ts`):**
  - section heading `Align`;
  - the anchor note `to <name> (selected first)`;
  - row labels `X`, `Y`, `Z`;
  - button words `Left` / `Centre` / `Right`, `Bottom` / `Middle` / `Top`, `Back` / `Centre` / `Front`;
  - accessible names `Align left (X)`, `Align centre (X)`, `Align right (X)`, `Align bottom (Y)`, `Align middle (Y)`, `Align top (Y)`,
    `Align back (Z)`, `Align centre (Z)`, `Align front (Z)`;
  - `Space evenly` with buttons `Along X` / `Along Y` / `Along Z`, accessible names `Space evenly along X|Y|Z`;
  - refusal `These parts don't fit between <first> and <last> along <X|Y|Z>.`;
  - names are the items' display names: a part's name, or an assembly's `name`.
- **Store actions:**
  - `alignItems(axis: 0 | 1 | 2, edge: 'min' | 'centre' | 'max'): string | null` and `distributeItems(axis: 0 | 1 | 2): string | null`.
  - Each returns a refusal sentence, or null when it applied or was a no-op.
  - Refused at entry (returning null, nothing written) while `readOnly()` or `gesturing`, or with too few items: under 2 for align,
    under 3 for distribute.
  - An all-zero result writes nothing.
- Before each commit, `git status` must show only this task's files.

## Review Focus

1. **A leaning leg:** aligned by its LEANED extent, its feet flush with a plumb leg's after Align bottom (Task 1, Task 2).
2. **Selection order:** ctrl-click B then A makes B the anchor, and the panel names B (Task 3).
3. **Assemblies:** an assembly aligns as one item by all its parts. A part inside a definition placed twice moves in both copies
   (Task 2).
4. **Space evenly with items selected out of order or overlapping:** the order is decided by position, never by selection. The
   refusal names the two outer items (Task 1).
5. **Undo:** one entry per click, and positions restored exactly (Task 2).

---

### Task 1: `align.ts` and `alignText.ts` — the decisions

**Files:**
- Create: `src/document/align.ts`, `src/document/alignText.ts`, `src/document/align.test.ts`

**Interfaces:**
- Produces:
  - ```ts
    interface AlignItem { id: string; name: string; min: readonly number[]; max: readonly number[] }
    ```
  - `alignDeltas(items: readonly AlignItem[], axis: 0 | 1 | 2, edge: 'min' | 'centre' | 'max'): [number, number, number][]`, index for
    index with `items`, where `items[0]` is the anchor;
  - `distributeDeltas(items: readonly AlignItem[], axis: 0 | 1 | 2): [number, number, number][] | { refused: string }`;
  - `itemExtents(doc: SloydDocument, ids: readonly string[]): AlignItem[]`, from `worldParts` + `partsBounds` + `isCovered`, named
    by `partAt` / `instanceAt`;
  - in `alignText.ts`:
    - `AXIS_WORDS: Record<0 | 1 | 2, { min: string; centre: string; max: string; letter: 'X' | 'Y' | 'Z' }>`;
    - `alignLabel(axis, edge)` (the accessible name);
    - `spaceLabel(axis)`;
    - `anchorNote(name)`;
    - `noRoomText(first, last, axis)`.

- [ ] **Step 1: Write the failing tests.** Every expected number is computed by hand.
  - Three items with extents `[0,0,0]–[2,1,1]` (anchor), `[5,3,4]–[6,4,7]` and `[1.25,0,0]–[1.5,9,1]`.
  - Align min X gives deltas `[0,0,0]`, `[-5,0,0]` and `[-1.25,0,0]` (`toEqual`, exact).
  - Align centre Y: the anchor's centre is 0.5, so the deltas are `[0,0,0]`, `[0,-3,0]` and `[0,-4,0]`.
  - Align max Z: the anchor's max is 1, so the deltas are `[0,0,0]`, `[0,0,-6]` and `[0,0,0]`.
  - Already aligned: all zeros.
  - **Distribute along Y.** Bottom `[0,0,0]–[1,0.75,1]`, top `[0,30,0]–[1,30.75,1]`, and three shelves 0.75 thick at y 3, 4 and 20.
    - `g = (30 − 0.75 − 2.25) / 4 = 6.75`.
    - The shelves' new mins are 7.5, 15 and 22.5, so their deltas are 4.5, 11 and 2.5.
    - The outer two get delta 0.
    - Selecting them in any order gives the same deltas.
  - **Drift:** ten 0.1-thick inner items between a first item spanning `[0, 0.1]` and a last item at min 1.7 (0.1 is inexact in
    binary).
    - `g = (1.7 − 0.1 − 10·0.1) / 11`.
    - Every gap after applying the deltas is equal to 1e-12.
    - The LAST inner item (k = 10) has new min `0.1 + 10·g + 9·0.1`, computed by hand in the test.
  - **Refusal:** inner items summing past the free space give `{ refused: "These parts don't fit between Bottom and Top along Y." }`.
    A gap of exactly 0 is allowed.
  - **`itemExtents`:**
    - a leaning leg's extent equals `partBounds` (leaned), not its pre-lean box;
    - an assembly's extent covers both its parts;
    - a 90°-turned part's X extent is its width (world).
- [ ] **Step 2: Run** `npx vitest run src/document/align.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement** per Global Constraints.
- [ ] **Step 4: Run** the test. Expect PASS.
- [ ] **Step 5: Mutate.**
  - Compute inner positions by a running sum (`pos += size + g`): the drift test must fail. If it does not, change the fixture until
    it does, and record which one.
  - Give the anchor a delta: the anchor test must fail.
  - Revert both.
- [ ] **Step 6: Commit** `feat(align): the align and space-evenly decisions`.

### Task 2: The store actions

**Files:**
- Modify: `src/store/store.ts` (the interface beside `copyInRow`; the implementations beside `moveGroupTo`)
- Test: `src/store/store.align.test.ts` (reset state as `store.boxJoints.test.ts:14` does)

**Interfaces:**
- Consumes: Task 1's `itemExtents`, `alignDeltas`, `distributeDeltas`; `translateItems`; `judgeHeld`; `readOnly`.
- Produces: `alignItems(axis, edge): string | null`, `distributeItems(axis): string | null`.

- [ ] **Step 1: Write the failing tests.**
  - Align three parts: one new `past` entry. The positions equal the hand values exactly. Undo restores the original positions
    exactly (`toEqual`).
  - Already aligned: no `past` entry, and `doc` is the same object.
  - Distribute refused: the action returns the sentence, with no `past` entry and `doc` the same object.
  - Exploded (`setExplode(0.5)`): returns null and writes nothing.
  - A `tapeAnchor` on a moved part is cleared; one on the unmoved anchor is kept.
  - A part inside a definition placed twice: after Align, both copies moved by the same world delta (`worldParts`).
  - Metric project, an off-grid result: the stored position equals the exact hand value, not a whole mm.
  - Ctrl-click order: select B then toggle A, then Align min X. B is unmoved.
- [ ] **Step 2: Run** `npx vitest run src/store/store.align.test.ts`. Expect FAIL.
- [ ] **Step 3: Implement.**
  - Refuse at entry.
  - Compute `itemExtents(get().doc, selectedIds)` and the deltas.
  - Return any refusal.
  - If every delta is zero, return null.
  - Otherwise `edit((doc) => items.reduce((d, it, i) => (isZero(delta[i]) ? d : translateItems(d, [it.id], delta[i])), doc))`, then
    `judgeHeld()`.
- [ ] **Step 4: Run** the test, then `npx vitest run src/store`. Expect PASS.
- [ ] **Step 5: Mutate.** Wrap a delta in `snapToGrid`: the metric off-grid test must fail. Revert.
- [ ] **Step 6: Commit** `feat(align): alignItems and distributeItems`.

### Task 3: The Align section

**Files:**
- Create: `src/panels/AlignSection.tsx`, `src/panels/AlignSection.test.tsx`
- Modify:
  - `src/panels/Properties.tsx`: render `<AlignSection />` in `GroupProperties` after the action bar, inside `EditLock`;
  - `src/styles.css`: a three-column button grid, like the existing field grids.

**Interfaces:**
- Consumes: Task 2's actions, Task 1's `alignText.ts`.

- [ ] **Step 1: Write the failing tests.**
  - With two parts selected: the `Align` heading and `to <first name> (selected first)`; nine buttons by their accessible names; no
    `Space evenly`.
  - With three selected: the three `Space evenly along …` buttons.
  - Clicking `Align top (Y)` calls through, and positions change (store readout).
  - A refused Space evenly shows the sentence in a `role="status"` element. Selecting differently clears it.
  - Exploded: the buttons are disabled.
  - Ctrl-click order: the anchor note names the first-clicked part.
- [ ] **Step 2: Run** them. Expect FAIL.
- [ ] **Step 3: Implement.**
  - The refusal is local state, cleared on a `selectedIds` or `doc` change (an effect keyed on both).
  - The anchor name comes from `itemExtents(doc, [selectedIds[0]])[0].name` in a memo. Never return an array from a selector
    (inv 43).
- [ ] **Step 4: Run** `npx vitest run src/panels`, then `npm run build`. Expect PASS.
- [ ] **Step 5: Commit** `feat(align): the Align section`.

### Task 4: Browser verification (dev server)

**File:** `docs/browser-verification-align.md`

- [ ] **Step 1:** Restart the dev server fresh. On a scratch profile, build a carcase: sides 30 × 12 × 3/4 upright, a bottom, a top
  and three shelves at uneven heights.
  - Select bottom, the shelves and top; Space evenly along Y. Read the positions from the store and check the gaps by hand.
  - Select a side, then the shelves; Align front (Z). Read the fronts.
  - Undo both, and check the positions return.
- [ ] **Step 2:** Screenshot the panel. Commit `docs(align): browser verification`.

### Task 5: Records

**Files:**
- `docs/invariants.md` and `CLAUDE.md`: inv 25's exact-move list gains "align and space evenly", in full and condensed.
- `docs/module-map.md`: `align.ts`, `alignText.ts`, `AlignSection.tsx`.
- `docs/feature-gaps.md`, `docs/follow-ups.md` (the spec §10.6 follow-ups), `docs/rounds.md`, `docs/history.md`.
- CLAUDE.md's test count.

- [ ] **Step 1: Write them.** Keep CLAUDE.md under ~60KB.
- [ ] **Step 2: Run** the full `npx vitest run` and `npm run build`.
- [ ] **Step 3: Commit** `docs(align): records`.
