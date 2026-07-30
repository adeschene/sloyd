# Sloyd v1 Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix six defects found in a manual pass over shipped Sloyd v1 — grid shimmer after camera moves, duplicate board names, blank board names, a missing origin marker, no keyboard delete, and a transform gizmo that reads inside-out from the far side.

**Architecture:** Name uniqueness lands as a new leaf module (`src/document/names.ts`) that imports only the `Board` type, wired into the four places a name can be created or changed — including `migrateDocument`, so an imported file cannot violate the invariant. The name input converts from per-keystroke writes to a single commit on blur/Enter, which is what lets an emptied field revert without leaving a dead undo entry. The origin axes are a new self-contained viewport component. Two items are visual bugs specified as a diagnosis protocol, not a predetermined fix.

**Tech Stack:** React 19, TypeScript, Zustand, react-three-fiber 9 / drei 10.7.7 / three 0.185.1, Vitest 4 + Testing Library, Vite 8.

**Spec:** `docs/superpowers/specs/2026-07-30-sloyd-v1-polish-design.md`. Read it before starting — it records *why* several of these are shaped the way they are, and two tasks are protocols whose outcome the spec deliberately leaves open.

## Global Constraints

- **No schema change.** `CURRENT_VERSION` stays at `1`. No field is added to `Board`. Load-time name dedup is a normalization in the same family as the existing name/material fallbacks in `validateBoard`, not a migration.
- **No new dependencies.** Everything here is buildable with what is already in `package.json`.
- **`npm test` does not typecheck.** A green suite proves nothing about `tsc`. `npm run build` (`tsc -b && vite build`) is the typecheck gate and must pass before any task is called done.
- **Test count baseline: 124 passing** before this plan starts. Every task adds tests; none may reduce the count.
- **The document is the source of truth.** No component may hold geometry state not derived from it, and nothing may write to a Three.js object's transform as a way of recording a change.
- **`position` is the min-corner** of the world AABB, not the center.
- **The r3f viewport is not unit-tested, by design.** Tasks 6, 7 and 8 are verified by driving a real browser. Do not add mock-based assertions for them.
- **Undo hygiene:** an action that changes nothing must leave no entry on the undo stack. Gesture snapshots are lazy (taken on the first `edit()` inside a gesture) precisely so that focusing and blurring a field leaves no no-op entry. Do not regress this.
- **No pull requests.** Solo repo — commit to `master`, or branch and merge locally with `git merge --no-ff`. Commit after every task.
- Comparison of board names is **exact and case-sensitive**. `leg` and `Leg` are two distinct names.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/document/names.ts` | **create** | `uniqueName` and `dedupeNames`. Pure; imports only the `Board` type. A leaf of the dependency graph, like `units/length.ts`. |
| `src/document/names.test.ts` | **create** | Unit tests for the naming rules. |
| `src/document/document.ts` | modify | Re-export the two new functions; call `dedupeNames` in `migrateDocument`; comment `createBoard` about the dedup contract. |
| `src/document/document.test.ts` | modify | Load-time dedup tests. |
| `src/store/store.ts` | modify | `addBoard` and `duplicateBoard` dedupe their names. |
| `src/store/store.test.ts` | modify | Naming tests for both actions. |
| `src/panels/NameField.tsx` | **create** | The part-name input: local draft, one commit on blur/Enter, Escape reverts, empty reverts. |
| `src/panels/Properties.tsx` | modify | Use `NameField`; own the dedup-on-commit callback. |
| `src/panels/Properties.test.tsx` | modify | Rename/revert/undo-hygiene tests. |
| `src/viewport/OriginAxes.tsx` | **create** | The three origin axis lines. |
| `src/viewport/Viewport.tsx` | modify | Render `OriginAxes`; the grid/damping fix from Task 7. |
| `src/viewport/Gizmo.tsx` | modify | The gizmo fix from Task 8 (if the fix lands here rather than in materials). |
| `src/App.tsx` | modify | Delete/Backspace binding; shared text-entry guard. |
| `src/App.test.tsx` | modify | Keyboard delete tests. |
| `CLAUDE.md` | modify | Module map and invariants (Task 9). |

**Task order rationale:** the pure module first (Task 1), then its consumers bottom-up (store → document → panels), then the viewport work, then docs. Tasks 6–8 are browser-verified and come last so the whole test suite is already green when you start staring at pixels. Tasks 7 and 8 are both about what happens while and after the camera orbits — do them in one browser session.

---

### Task 1: `uniqueName` and `dedupeNames`

**Files:**
- Create: `src/document/names.ts`
- Test: `src/document/names.test.ts`

**Interfaces:**
- Consumes: the `Board` type from `src/document/types.ts` (type-only import).
- Produces:
  - `uniqueName(base: string, boards: Board[], excludeId?: string): string`
  - `dedupeNames(boards: Board[]): Board[]` — returns a new array; does not mutate its input.

**Background you need.** Board names must be unique so a part is identifiable in the parts list and, later, in a cut list. Duplicates get a ` (n)` suffix: `Board`, `Board (1)`, `Board (2)`. The number is the smallest *free* one, not a running counter — delete `Board (1)`, add a board, and you get `Board (1)` again.

Two rules that look contradictory and are not:

- If the requested name is free, it is returned **unchanged**, even if it already ends in ` (n)`. The user typed it; honor it.
- If it is taken, a trailing ` (n)` is **stripped** before searching. This is what stops a duplicate-of-a-duplicate from growing tails: duplicating `Leg (1)` yields `Leg (2)`, not `Leg (1) (1)`.

`base` is required to be non-empty after trimming. Both call sites guarantee this — the name field reverts an emptied value before committing (Task 4), and `validateBoard` already substitutes `'Board'` for a missing or empty name on load. This is a documented precondition, not something the function defends against.

- [ ] **Step 1: Write the failing tests**

Create `src/document/names.test.ts`:

```ts
import { createBoard } from './document';
import { uniqueName, dedupeNames } from './names';

const named = (...names: string[]) => names.map((name) => createBoard({ name }));

describe('uniqueName', () => {
  it('returns the base unchanged when nothing has that name', () => {
    expect(uniqueName('Leg', named('Apron', 'Top'))).toBe('Leg');
  });

  it('returns the base unchanged when there are no boards at all', () => {
    expect(uniqueName('Leg', [])).toBe('Leg');
  });

  it('appends (1) on a collision', () => {
    expect(uniqueName('Leg', named('Leg'))).toBe('Leg (1)');
  });

  it('picks the next free number', () => {
    expect(uniqueName('Leg', named('Leg', 'Leg (1)', 'Leg (2)'))).toBe('Leg (3)');
  });

  it('reuses a gap rather than counting upward', () => {
    // "Leg (1)" was deleted; the next board should fill the hole.
    expect(uniqueName('Leg', named('Leg', 'Leg (2)'))).toBe('Leg (1)');
  });

  it('strips an existing suffix instead of nesting it', () => {
    // Duplicating "Leg (1)" must not produce "Leg (1) (1)".
    expect(uniqueName('Leg (1)', named('Leg', 'Leg (1)'))).toBe('Leg (2)');
  });

  it('honors an explicitly typed suffix when it happens to be free', () => {
    expect(uniqueName('Leg (1)', named('Leg'))).toBe('Leg (1)');
  });

  it('lets a board keep its own name when renaming', () => {
    const boards = named('Leg', 'Apron');
    expect(uniqueName('Leg', boards, boards[0].id)).toBe('Leg');
  });

  it('still deduplicates against boards other than the excluded one', () => {
    const boards = named('Leg', 'Apron');
    expect(uniqueName('Apron', boards, boards[0].id)).toBe('Apron (1)');
  });

  it('trims surrounding whitespace', () => {
    expect(uniqueName('  Leg  ', named('Apron'))).toBe('Leg');
  });

  it('treats a trimmed name as colliding', () => {
    expect(uniqueName('  Leg  ', named('Leg'))).toBe('Leg (1)');
  });

  it('is case-sensitive — "leg" and "Leg" are different parts', () => {
    expect(uniqueName('leg', named('Leg'))).toBe('leg');
  });
});

describe('dedupeNames', () => {
  it('leaves already-unique names alone', () => {
    const boards = named('Leg', 'Apron', 'Top');
    expect(dedupeNames(boards).map((b) => b.name)).toEqual(['Leg', 'Apron', 'Top']);
  });

  it('renames repeats, first occurrence keeping its name', () => {
    const boards = named('Leg', 'Leg', 'Leg');
    expect(dedupeNames(boards).map((b) => b.name)).toEqual(['Leg', 'Leg (1)', 'Leg (2)']);
  });

  it('does not collide with a suffix that already exists later in the list', () => {
    const boards = named('Leg', 'Leg (1)', 'Leg');
    expect(dedupeNames(boards).map((b) => b.name)).toEqual(['Leg', 'Leg (1)', 'Leg (2)']);
  });

  it('does not mutate the input', () => {
    const boards = named('Leg', 'Leg');
    dedupeNames(boards);
    expect(boards.map((b) => b.name)).toEqual(['Leg', 'Leg']);
  });

  it('preserves every other field and the ids', () => {
    const boards = named('Leg', 'Leg');
    const result = dedupeNames(boards);
    expect(result.map((b) => b.id)).toEqual(boards.map((b) => b.id));
    expect(result[1].length).toBe(boards[1].length);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/document/names.test.ts`
Expected: FAIL — `Failed to resolve import "./names"`.

- [ ] **Step 3: Write the implementation**

Create `src/document/names.ts`:

```ts
import type { Board } from './types';

/**
 * A trailing " (n)" disambiguation suffix, e.g. "Leg (2)". The stem is
 * captured lazily so "Leg (1) (2)" yields "Leg (1)" — only the last suffix
 * is a disambiguator; any earlier one was typed by the user.
 */
const SUFFIX_RE = /^(.*?)\s\((\d+)\)$/;

/**
 * A board name that no other board is using, disambiguated with " (n)" if
 * needed. `excludeId` is the board being renamed, so it does not collide
 * with itself.
 *
 * Precondition: `base` is non-empty after trimming. Both call sites
 * guarantee it — the name field reverts an emptied value before committing,
 * and validateBoard substitutes 'Board' for a blank name on load.
 */
export function uniqueName(base: string, boards: Board[], excludeId?: string): string {
  const wanted = base.trim();
  const taken = new Set(
    boards.filter((b) => b.id !== excludeId).map((b) => b.name),
  );

  // Free as typed — including a name that already ends in " (n)". The user
  // asked for it, so it is not ours to rewrite.
  if (!taken.has(wanted)) return wanted;

  // Taken: search from the stem, so duplicating "Leg (1)" gives "Leg (2)"
  // rather than "Leg (1) (1)".
  const stem = SUFFIX_RE.exec(wanted)?.[1] ?? wanted;
  let n = 1;
  while (taken.has(`${stem} (${n})`)) n += 1;
  return `${stem} (${n})`;
}

/**
 * Resolve duplicate names across a whole list, in order — the first board
 * with a given name keeps it and later ones are disambiguated. Returns a new
 * array; the input is untouched.
 *
 * This is the load-time half of the uniqueness invariant. It cannot live in
 * validateBoard, which sees one board at a time and cannot know its siblings.
 */
export function dedupeNames(boards: Board[]): Board[] {
  const out: Board[] = [];
  for (const board of boards) {
    // Only the boards already placed are candidates for collision, so no
    // exclusion is needed: `board` itself is never in `out` yet.
    out.push({ ...board, name: uniqueName(board.name, out) });
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/document/names.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/document/names.ts src/document/names.test.ts
git commit -m "feat: add uniqueName and dedupeNames

A leaf module like units/length.ts — imports only the Board type, so the
naming rules can be tested hard in isolation. The next-free-number rule and
the suffix-stripping rule are the two easy things to get subtly wrong."
```

---

### Task 2: `addBoard` and `duplicateBoard` produce unique names

**Files:**
- Modify: `src/store/store.ts:86-99` (`addBoard`), `src/store/store.ts:122-138` (`duplicateBoard`)
- Test: `src/store/store.test.ts`

**Interfaces:**
- Consumes: `uniqueName(base, boards, excludeId?)` from Task 1.
- Produces: no new signatures. Behavior only.

**Behavior change, deliberate and spec'd.** `duplicateBoard` currently names the copy `` `${source.name} copy` `` (`store.ts:133`). It becomes `Leg (1)`. Two naming schemes in one app would be worse than either alone — do not keep "copy" as a special case.

- [ ] **Step 1: Write the failing tests**

Add to `src/store/store.test.ts`. There is an existing `describe('addBoard', ...)` and a `describe('duplicateBoard', ...)`; add these cases inside them, and add `uniqueName`'s import only if you need it (these tests do not).

```ts
// inside describe('addBoard', ...)
  it('gives each new board a unique name', () => {
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    expect(useStore.getState().doc.boards.map((b) => b.name))
      .toEqual(['Board', 'Board (1)', 'Board (2)']);
  });

  it('reuses a freed number rather than counting upward', () => {
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    useStore.getState().addBoard();
    const middle = useStore.getState().doc.boards[1].id;
    useStore.getState().deleteBoard(middle);
    useStore.getState().addBoard();
    expect(useStore.getState().doc.boards.map((b) => b.name))
      .toEqual(['Board', 'Board (2)', 'Board (1)']);
  });

// inside describe('duplicateBoard', ...)
  it('names the copy with a numeric suffix, not "copy"', () => {
    useStore.getState().addBoard();
    const source = useStore.getState().doc.boards[0];
    useStore.getState().updateBoard(source.id, { name: 'Leg' });
    useStore.getState().duplicateBoard(source.id);
    expect(useStore.getState().doc.boards.map((b) => b.name)).toEqual(['Leg', 'Leg (1)']);
  });

  it('duplicating a duplicate does not nest suffixes', () => {
    useStore.getState().addBoard();
    const source = useStore.getState().doc.boards[0];
    useStore.getState().updateBoard(source.id, { name: 'Leg' });
    useStore.getState().duplicateBoard(source.id);
    const copy = useStore.getState().doc.boards[1];
    expect(copy.name).toBe('Leg (1)');
    useStore.getState().duplicateBoard(copy.id);
    expect(useStore.getState().doc.boards[2].name).toBe('Leg (2)');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/store/store.test.ts`
Expected: FAIL — the add tests report all three boards named `Board`; the duplicate tests report `Leg copy`.

- [ ] **Step 3: Write the implementation**

In `src/store/store.ts`, extend the import on line 2:

```ts
import { createBoard, createDocument, uniqueName } from '../document/document';
```

Replace the body of `addBoard` (lines 86-99) with:

```ts
    addBoard: () => {
      const boards = get().doc.boards;
      const last = boards[boards.length - 1];
      const fresh = createBoard(
        last
          ? { length: last.length, width: last.width, thickness: last.thickness, material: last.material }
          : {},
      );
      // createBoard has no view of the document and cannot dedupe — that is
      // the caller's job. See the note on createBoard.
      const board = { ...fresh, name: uniqueName(fresh.name, boards) };
      edit(
        (doc) => ({ ...doc, boards: [...doc.boards, board] }),
        () => board.id,
      );
      set({ pendingLengthFocus: true });
    },
```

In `duplicateBoard`, replace the `name` line (line 133):

```ts
        name: uniqueName(source.name, get().doc.boards),
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS. Watch for a pre-existing test that asserted `'Leg copy'` or a bare `'Board'` for a second board — if one fails, it is asserting the old behavior and should be updated to the new expectation, not worked around.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/store/store.ts src/store/store.test.ts
git commit -m "feat: unique names for added and duplicated boards

Duplicating now yields 'Leg (1)' rather than 'Leg copy' — one naming
scheme instead of two."
```

---

### Task 3: Loading a document deduplicates names

**Files:**
- Modify: `src/document/document.ts:31-44` (comment on `createBoard`), `src/document/document.ts:5` (re-export), `src/document/document.ts:137-142` (`migrateDocument` return)
- Test: `src/document/document.test.ts`

**Interfaces:**
- Consumes: `dedupeNames(boards)` from Task 1.
- Produces: `uniqueName` and `dedupeNames` become reachable via `src/document/document.ts`, which is the module the rest of the app imports from (`store`, `panels` and `viewport` all import from `'../document/document'`, never from `./names` directly).

**Why this task exists.** Uniqueness enforced only at creation is an invariant any imported or hand-edited file can violate. `migrateDocument` runs on *every* load path — open, import, autosave restore — so it is the one place that can make the guarantee real. This is a normalization, not a migration: `CURRENT_VERSION` stays at 1.

- [ ] **Step 1: Write the failing tests**

Add to `src/document/document.test.ts`. There is an existing `describe('migrateDocument', ...)`; add these inside it.

```ts
  it('deduplicates board names, first occurrence keeping its name', () => {
    const raw = {
      version: 1,
      name: 'Bench',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [
        { name: 'Leg', length: 24, width: 3, thickness: 3, position: [0, 0, 0] },
        { name: 'Leg', length: 24, width: 3, thickness: 3, position: [0, 0, 6] },
        { name: 'Leg', length: 24, width: 3, thickness: 3, position: [0, 0, 12] },
      ],
    };
    expect(migrateDocument(raw).boards.map((b) => b.name))
      .toEqual(['Leg', 'Leg (1)', 'Leg (2)']);
  });

  it('leaves already-unique names untouched', () => {
    const raw = {
      version: 1,
      name: 'Bench',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [
        { name: 'Leg', length: 24, width: 3, thickness: 3, position: [0, 0, 0] },
        { name: 'Apron', length: 40, width: 4, thickness: 0.75, position: [0, 0, 6] },
      ],
    };
    expect(migrateDocument(raw).boards.map((b) => b.name)).toEqual(['Leg', 'Apron']);
  });

  it('deduplicates the names it substitutes for blank ones', () => {
    // validateBoard turns a blank name into 'Board'; two blanks must not
    // both come out as 'Board'.
    const raw = {
      version: 1,
      name: 'Bench',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [
        { name: '', length: 24, width: 3, thickness: 3, position: [0, 0, 0] },
        { length: 24, width: 3, thickness: 3, position: [0, 0, 6] },
      ],
    };
    expect(migrateDocument(raw).boards.map((b) => b.name)).toEqual(['Board', 'Board (1)']);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/document/document.test.ts`
Expected: FAIL — names come back as `['Leg', 'Leg', 'Leg']` and `['Board', 'Board']`.

- [ ] **Step 3: Write the implementation**

In `src/document/document.ts`, add the re-export next to the existing geometry one (line 5):

```ts
export { boardExtents, boardCenter } from './geometry';
export { uniqueName, dedupeNames } from './names';
```

Add the import at the top, next to the existing `./types` import:

```ts
import { dedupeNames } from './names';
```

Change the `boards` line of `migrateDocument`'s return (line 141):

```ts
    boards: dedupeNames(d.boards.map(validateBoard)),
```

Add a comment above `createBoard` (line 31) recording the dedup contract, because this is a real trap for a future call site:

```ts
/**
 * A board with defaults filled in. Deliberately unaware of the document, so
 * it cannot deduplicate its own name — the caller must pass a name through
 * uniqueName (see store.addBoard / store.duplicateBoard) or accept that the
 * default 'Board' may collide.
 */
export function createBoard(partial: Partial<Board> = {}): Board {
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/document/document.ts src/document/document.test.ts
git commit -m "feat: deduplicate board names on load

Uniqueness enforced only at creation is an invariant any imported file can
violate. migrateDocument runs on every load path, so it is where the
guarantee can actually be made. Normalization, not a migration —
CURRENT_VERSION stays 1."
```

---

### Task 4: The name field commits once, and an emptied name reverts

**Files:**
- Create: `src/panels/NameField.tsx`
- Modify: `src/panels/Properties.tsx:36-43` (replace the raw name input)
- Test: `src/panels/Properties.test.tsx`

**Interfaces:**
- Consumes: `uniqueName` from `'../document/document'`.
- Produces: `NameField` component with props

  ```ts
  interface Props {
    /** The stored name. Also what an emptied or Escape-cancelled edit reverts to. */
    value: string;
    /**
     * Commit a non-empty, trimmed name. Returns the name actually stored,
     * which may differ from what was typed because names are deduplicated.
     */
    onCommit: (name: string) => string;
  }
  ```

**Why the shape is what it is — read this before writing code.**

The current input writes to the document on every keystroke (`Properties.tsx:42`), coalesced into one undo entry by the `beginGesture`/`endGesture` pair. That cannot support "an emptied name reverts": by the time a blur handler noticed the field was empty and wrote the old name back, the gesture would already have taken its undo snapshot, leaving an entry on the stack that undoes to nothing. `Ctrl+Z` would appear to do nothing — the exact failure the lazy-snapshot design exists to prevent. So the field commits **once**, on blur or Enter, and an empty field commits nothing at all: no write, no snapshot, no dead entry.

`onCommit` returns the stored name rather than returning `void`. This is load-bearing. Renaming a board to a name another board already has stores `Leg (1)` while the user typed `Leg`, and the field must end up showing what was stored. Returning it is the only version of this that has one source of truth: the alternative — letting the field guess, or re-deriving from the `value` prop — breaks in the case where dedup maps the typed name straight back onto the board's *current* name, where `value` never changes and no re-render is triggered.

Ordering matters in the blur handler: clear `editing` **before** calling `commit()`, exactly as `DimensionField.tsx:75-85` does, so the adopt-external-changes effect is live when the store update lands.

**No `dirty` guard is needed here**, unlike `DimensionField`. A focus-and-blur with no typing commits the unchanged name, `uniqueName` returns it unchanged (the board is excluded from its own collision check), and `Properties` skips the write because the name did not change. There is no lossy display format to quantize — that is what the `dirty` ref in `DimensionField` protects against, and names have no equivalent.

- [ ] **Step 1: Write the failing tests**

Add to `src/panels/Properties.test.tsx` — a new `describe` block. Note `reset()` and `beforeEach` already exist at the top of that file.

```ts
describe('the part name field', () => {
  const selectFirstBoard = () => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0].id;
    useStore.getState().selectBoard(id);
    return id;
  };

  it('commits a new name on blur', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Front apron');
    await userEvent.tab();

    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name)
      .toBe('Front apron');
  });

  it('commits on Enter without needing a blur', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Stretcher{Enter}');

    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name)
      .toBe('Stretcher');
  });

  it('does not write to the document while typing', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Leg');

    // Still the old name: nothing is committed until blur or Enter.
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name)
      .toBe('Board');
  });

  it('reverts an emptied name and leaves the document untouched', async () => {
    const id = selectFirstBoard();
    render(<Properties />);
    const before = useStore.getState().doc;

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.tab();

    expect(name.value).toBe('Board');
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name).toBe('Board');
    // Untouched means the same object, not merely an equal one.
    expect(useStore.getState().doc).toBe(before);
  });

  it('reverts a whitespace-only name', async () => {
    selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, '   ');
    await userEvent.tab();

    expect(name.value).toBe('Board');
  });

  it('adds no undo entry when a name is cleared and blurred', async () => {
    selectFirstBoard();
    render(<Properties />);
    const before = useStore.getState().past.length;

    const name = screen.getByLabelText('Part name');
    await userEvent.clear(name);
    await userEvent.tab();

    expect(useStore.getState().past.length).toBe(before);
  });

  it('adds no undo entry when the field is focused and blurred untouched', async () => {
    selectFirstBoard();
    render(<Properties />);
    const before = useStore.getState().past.length;

    await userEvent.click(screen.getByLabelText('Part name'));
    await userEvent.tab();

    expect(useStore.getState().past.length).toBe(before);
  });

  it('adds exactly one undo entry for a rename', async () => {
    selectFirstBoard();
    render(<Properties />);
    const before = useStore.getState().past.length;

    const name = screen.getByLabelText('Part name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Rail');
    await userEvent.tab();

    expect(useStore.getState().past.length).toBe(before + 1);
  });

  it('reverts on Escape', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'Discarded{Escape}');

    expect(name.value).toBe('Board');
    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name).toBe('Board');
  });

  it('shows the deduplicated name when renaming onto an existing one', async () => {
    useStore.getState().addBoard();               // 'Board'
    useStore.getState().addBoard();               // 'Board (1)'
    const second = useStore.getState().doc.boards[1].id;
    useStore.getState().updateBoard(useStore.getState().doc.boards[0].id, { name: 'Leg' });
    useStore.getState().selectBoard(second);
    render(<Properties />);

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'Leg');
    await userEvent.tab();

    expect(useStore.getState().doc.boards.find((b) => b.id === second)!.name).toBe('Leg (1)');
    // The field must show what was stored, not what was typed.
    expect(name.value).toBe('Leg (1)');
  });

  it('adopts an external change (undo) when the field is not focused', async () => {
    const id = selectFirstBoard();
    render(<Properties />);

    const name = screen.getByLabelText('Part name') as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'Rail');
    await userEvent.tab();
    expect(name.value).toBe('Rail');

    act(() => { useStore.getState().undo(); });

    expect(useStore.getState().doc.boards.find((b) => b.id === id)!.name).toBe('Board');
    expect((screen.getByLabelText('Part name') as HTMLInputElement).value).toBe('Board');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/panels/Properties.test.tsx`
Expected: FAIL. Specifically: "does not write to the document while typing" fails because the current field writes per keystroke; the revert tests fail because clearing currently stores `''`; the Escape test fails because there is no Escape handler.

- [ ] **Step 3: Write `NameField`**

Create `src/panels/NameField.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';

interface Props {
  /** The stored name. Also what an emptied or Escape-cancelled edit reverts to. */
  value: string;
  /**
   * Commit a non-empty, trimmed name. Returns the name actually stored,
   * which may differ from what was typed because names are deduplicated.
   */
  onCommit: (name: string) => string;
}

/**
 * The part-name input. Holds a local draft and commits once — on blur or
 * Enter — never per keystroke.
 *
 * That single-commit shape is what makes "an emptied name reverts" possible.
 * Writing per keystroke and correcting on blur would have taken the gesture's
 * undo snapshot before the correction landed, leaving an entry that undoes to
 * nothing. Committing once means an empty field never touches the document at
 * all: no write, no snapshot, no dead undo entry.
 *
 * onCommit returns the stored name rather than void because dedup can store
 * something other than what was typed ("Leg" -> "Leg (1)"), and the field has
 * to end up showing what was stored. Deriving that from the `value` prop
 * instead would miss the case where dedup maps the typed name back onto this
 * board's current name — `value` never changes, so no re-render arrives.
 */
export function NameField({ value, onCommit }: Props) {
  const [text, setText] = useState(value);
  const editing = useRef(false);
  const reverting = useRef(false);

  // Adopt external changes (undo, an import, a rename from elsewhere) unless
  // the user is mid-edit and would have their typing yanked out from under
  // them.
  useEffect(() => {
    if (!editing.current) setText(value);
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    // Emptied: revert. Nothing is ever stored blank, and no board is
    // silently renamed on the user's behalf.
    if (!trimmed) {
      setText(value);
      return;
    }
    setText(onCommit(trimmed));
  };

  return (
    <input
      className="input name"
      aria-label="Part name"
      value={text}
      onFocus={() => { editing.current = true; }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        // Cleared before commit() so the adopt-external-changes effect above
        // is live when the store update lands — same ordering as
        // DimensionField.
        editing.current = false;
        // A blur triggered by the Escape handler must not commit the text
        // Escape just discarded.
        if (reverting.current) { reverting.current = false; return; }
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { commit(); return; }
        if (e.key === 'Escape') {
          reverting.current = true;
          editing.current = false;
          setText(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
```

- [ ] **Step 4: Wire it into `Properties`**

In `src/panels/Properties.tsx`, extend the document import (line 3) and add the component import:

```tsx
import { MATERIALS, uniqueName } from '../document/document';
import { NameField } from './NameField';
```

Replace the whole `<input className="input name" ... />` block (lines 36-43) with:

```tsx
      <NameField value={board.name} onCommit={commitName} />
```

And add `commitName` next to `setPos` (after line 32):

```tsx
  /**
   * Store a renamed board, deduplicated against its siblings, and report the
   * name that was actually stored so the field can show it.
   *
   * The equality check is not an optimization: without it, a rename that
   * dedups straight back onto the current name (typing "Leg" on the board
   * already called "Leg (1)") would push an undo entry that changes nothing.
   * Read the boards imperatively so the check sees the live document.
   */
  const commitName = (typed: string) => {
    const name = uniqueName(typed, useStore.getState().doc.boards, board.id);
    if (name !== board.name) updateBoard(board.id, { name });
    return name;
  };
```

Note what is *removed* along with the old input: the `onFocus`/`onBlur` `beginGesture`/`endGesture` pair. With one commit per edit there is nothing left to coalesce. Do not carry it over — a gesture that wraps a single `edit()` is harmless but misleading.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/panels/Properties.test.tsx`
Expected: PASS, including the pre-existing two tests in that file.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npm run build`
Expected: both pass. If a `PartsList` or `Toolbar` test asserted on the old name input, update it to `NameField`'s markup — the `aria-label="Part name"` is unchanged, so a query by label still works.

- [ ] **Step 7: Commit**

```bash
git add src/panels/NameField.tsx src/panels/Properties.tsx src/panels/Properties.test.tsx
git commit -m "feat: name field commits once; an emptied name reverts

Per-keystroke writes could not support reverting: the gesture's undo
snapshot would already be taken by the time a blur handler wrote the old
name back, leaving an entry that undoes to nothing. One commit per edit
means an empty field never touches the document.

onCommit returns the stored name because dedup can store something other
than what was typed, and the field has to show what was stored."
```

---

### Task 5: Delete and Backspace delete the selected board

**Files:**
- Modify: `src/App.tsx:71-83` (the keydown effect)
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `deleteBoard(id)` from the store — already exists (`store.ts:113`).
- Produces: no new signatures.

**Both keys, not just `Delete`.** The key labeled "delete" on a Mac keyboard is Backspace. Binding only `Delete` means the feature does not exist for a Mac user. The existing "never steal keys from a field the user is typing in" guard is what makes Backspace safe; extend it to `TEXTAREA` and `contentEditable` at the same time so it stays safe if the app grows either.

Clicking a part in the parts list leaves focus on that `<button>` (`PartsList.tsx:16`), not on an input — so Backspace immediately after selecting from the list correctly deletes. That is the common case, and one of the tests below pins it.

- [ ] **Step 1: Write the failing tests**

In `src/App.test.tsx`, add these imports to the existing ones on lines 1-4:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
```

Add a new `describe` block at the end of the file:

```tsx
describe('App keyboard delete', () => {
  const mountWithOneBoard = async () => {
    loadAutoSaved.mockResolvedValue(null);
    render(<App />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { useStore.getState().addBoard(); });
    return useStore.getState().doc.boards[0].id;
  };

  it('deletes the selected board on Delete', async () => {
    const id = await mountWithOneBoard();
    expect(useStore.getState().selectedId).toBe(id);

    await userEvent.keyboard('{Delete}');

    expect(useStore.getState().doc.boards).toHaveLength(0);
    expect(useStore.getState().selectedId).toBeNull();
  });

  it('deletes the selected board on Backspace — the Mac "delete" key', async () => {
    await mountWithOneBoard();

    await userEvent.keyboard('{Backspace}');

    expect(useStore.getState().doc.boards).toHaveLength(0);
  });

  it('is undoable', async () => {
    const id = await mountWithOneBoard();

    await userEvent.keyboard('{Delete}');
    act(() => { useStore.getState().undo(); });

    expect(useStore.getState().doc.boards.map((b) => b.id)).toEqual([id]);
  });

  it('does nothing when no board is selected', async () => {
    await mountWithOneBoard();
    act(() => { useStore.getState().selectBoard(null); });

    await userEvent.keyboard('{Delete}');

    expect(useStore.getState().doc.boards).toHaveLength(1);
  });

  it('does not steal Backspace from a text field', async () => {
    await mountWithOneBoard();

    await userEvent.click(screen.getByLabelText('Project name'));
    await userEvent.keyboard('{Backspace}');

    expect(useStore.getState().doc.boards).toHaveLength(1);
  });

  it('ignores a modified Delete', async () => {
    await mountWithOneBoard();

    await userEvent.keyboard('{Control>}{Delete}{/Control}');

    expect(useStore.getState().doc.boards).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL — the delete tests report 1 board remaining, since nothing is bound yet. The three negative tests ("does nothing", "does not steal", "ignores a modified") pass already; that is fine and expected — they exist to stop a fix from over-reaching.

- [ ] **Step 3: Write the implementation**

In `src/App.tsx`, add a module-level helper above the component:

```tsx
/**
 * True for anything the user might be typing into. Keyboard shortcuts must
 * never fire while focus is here — most of all Backspace, which is bound to
 * delete-the-selected-board because that is what the Mac "delete" key sends.
 */
function isTextEntry(el: HTMLElement | null): boolean {
  if (!el) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'SELECT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable
  );
}
```

Add the store selector next to the existing ones (after line 14):

```tsx
  const deleteBoard = useStore((s) => s.deleteBoard);
```

Replace the keydown effect (lines 71-83) with:

```tsx
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Never steal keys from a field the user is typing in.
      if (isTextEntry(e.target as HTMLElement)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }

      // Backspace as well as Delete: the key labeled "delete" on a Mac
      // keyboard is Backspace, and binding only Delete would mean this
      // feature does not exist there.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const id = useStore.getState().selectedId;
        if (!id) return;
        e.preventDefault();
        deleteBoard(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, deleteBoard]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS, all six new tests plus the four pre-existing ones.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat: Delete and Backspace delete the selected board

Backspace too, because that is what the key labeled 'delete' sends on a
Mac. The text-entry guard now also covers textarea and contentEditable,
which is what makes binding Backspace safe."
```

---

### Task 6: Origin axis lines

**Files:**
- Create: `src/viewport/OriginAxes.tsx`
- Modify: `src/viewport/Viewport.tsx` (import and render it)

**Interfaces:**
- Consumes: nothing from the store or document — the axes are fixed world geometry.
- Produces: `OriginAxes` component, no props.

**Verified in a real browser, not by unit tests.** The r3f viewport has no unit tests by design; asserting on mocked three objects would prove nothing about what is on screen. Do not add a test file for this.

**The depth handling is the substance of this task.** y=0 already holds two coplanar things — drei's `<Grid>` and the shadow receiver — and `Viewport.tsx:172-195` carries a long comment about the `polygonOffset` and `renderOrder` that stops them z-fighting into a checkerboard. The X and Z axes make it three. `polygonOffset` is a polygon-rasterization feature and does nothing for lines, so the treatment here is a small lift (1/64", visually zero) plus a `renderOrder` after both. Lifting rather than switching off `depthTest` is what keeps occlusion correct: a board resting on the ground spans y=0 upward, so it hides the axis running beneath it. An axis bleeding through the board on top of it would be worse than no axis.

**Two constraints worth knowing before you write it:**

- WebGL ignores `linewidth` on native lines — they are always 1px whatever the material says. Do not set it and expect anything. If 1px proves too faint in Step 4, the escape hatch is drei's `<Line>` (mesh-based, honors width), not a `linewidth` value that silently does nothing.
- Use `<lineSegments>`, not `<line>`. R3F's `<line>` collides with the SVG `line` element in JSX typing and needs awkward casts; `<lineSegments>` with a two-point geometry is exactly equivalent for a single segment and is already the pattern in `BoardMesh.tsx:75`.

- [ ] **Step 1: Write the component**

Create `src/viewport/OriginAxes.tsx`:

```tsx
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

/**
 * How far the axes run, in inches. Matches SHADOW_EXTENT in Viewport — the
 * same ten-foot working volume. Finite on purpose: an infinite axis outruns
 * the grid's own fade and reads as a stray line across an empty sky.
 */
const AXIS_EXTENT = 120;

/**
 * Lift for the two ground axes, in inches. They are coplanar with both the
 * grid and the shadow receiver at y=0, and polygonOffset — the fix used for
 * the shadow plane — does not apply to lines. 1/64" is visually zero at any
 * usable zoom and enough to win the depth test outright.
 *
 * Lifting rather than disabling depthTest is what keeps occlusion correct: a
 * board resting on the ground spans y=0 upward, so it hides the axis running
 * underneath it instead of having the axis bleed through it.
 */
const GROUND_LIFT = 1 / 64;

/**
 * three.js convention — red X, green Y (up), blue Z — because that is what
 * the rest of the code speaks. Muted rather than saturated so they sit inside
 * the wood palette instead of shouting over it.
 */
const AXIS_COLOR = { x: '#b6483c', y: '#4e8b46', z: '#3f6ea8' } as const;

/** Inches. Long enough to read as "dashed" at furniture scale. */
const DASH_SIZE = 1.5;
const GAP_SIZE = 1.5;

type Axis = keyof typeof AXIS_COLOR;

/** A point `distance` along `axis`, lifted if it lies in the ground plane. */
function point(axis: Axis, distance: number): THREE.Vector3 {
  if (axis === 'x') return new THREE.Vector3(distance, GROUND_LIFT, 0);
  if (axis === 'z') return new THREE.Vector3(0, GROUND_LIFT, distance);
  return new THREE.Vector3(0, distance, 0);
}

/**
 * Axis lines through the world origin: solid in the positive direction,
 * dashed in the negative, so both the origin and the sense of each axis read
 * at a glance.
 */
export function OriginAxes() {
  const segments = useMemo(() => {
    const axes: Axis[] = ['x', 'y', 'z'];
    return axes.flatMap((axis) =>
      ([1, -1] as const).map((sign) => {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          point(axis, 0),
          point(axis, AXIS_EXTENT * sign),
        ]);
        // A dashed material measures its dashes along the line. Without this
        // the attribute is missing and the dashes never appear.
        geometry.computeLineDistances();
        return { key: `${axis}${sign}`, axis, positive: sign > 0, geometry };
      }),
    );
  }, []);

  // Same discipline as BoardMesh's edge geometry: built once, disposed on
  // unmount, never constructed inline where it would leak on every render.
  useEffect(
    () => () => segments.forEach((s) => s.geometry.dispose()),
    [segments],
  );

  return (
    <>
      {segments.map(({ key, axis, positive, geometry }) => (
        // renderOrder 3 puts these after the grid (0) and the shadow
        // receiver (2), so they draw over the grid lines they cross rather
        // than being painted over by them. raycast is disabled explicitly:
        // an axis must never be a click target, for the same
        // belt-and-braces reason the shadow plane says so.
        <lineSegments key={key} geometry={geometry} renderOrder={3} raycast={() => null}>
          {positive ? (
            <lineBasicMaterial
              color={AXIS_COLOR[axis]}
              depthWrite={false}
              transparent
              opacity={0.9}
            />
          ) : (
            <lineDashedMaterial
              color={AXIS_COLOR[axis]}
              dashSize={DASH_SIZE}
              gapSize={GAP_SIZE}
              depthWrite={false}
              transparent
              opacity={0.55}
            />
          )}
        </lineSegments>
      ))}
    </>
  );
}
```

- [ ] **Step 2: Render it in the viewport**

In `src/viewport/Viewport.tsx`, add the import next to the other viewport imports (after line 9):

```tsx
import { OriginAxes } from './OriginAxes';
```

And render it immediately after the shadow-receiver `<mesh>` closes (after line 211), before the boards:

```tsx
      <OriginAxes />
```

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: exits 0. If `lineDashedMaterial` or `raycast` draws a type error, fix the types — do not reach for `any`.

- [ ] **Step 4: Verify in a real browser**

Run: `npm run dev -- --port 5199` and open `http://localhost:5199`.

Check each of these, and fix what fails:

- Three lines cross at the origin: red along X, green vertical, blue along Z.
- The positive half of each is solid, the negative half dashed.
- No z-fighting with the grid — no shimmering or checkerboarding along the X and Z axes as you orbit. This is the one most likely to need adjustment; if it appears, raise `GROUND_LIFT` (1/32", then 1/16") until it stops, and stop at the smallest value that works.
- Add a board and drag it over the origin: the board **hides** the axis lines running under it. If the axes draw through the board, `depthTest` has been disabled somewhere it should not be.
- Click directly on an axis line: selection does not change, and if a board is selected it stays selected.
- Toggle Orthographic in the toolbar: all of the above still holds.
- The lines are legible but not loud — they should not compete with the boards for attention.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS, unchanged count. Nothing here should touch an existing test.

- [ ] **Step 6: Commit**

```bash
git add src/viewport/OriginAxes.tsx src/viewport/Viewport.tsx
git commit -m "feat: origin axis lines

Red X, green Y-up, blue Z — three.js convention, which is what the code
already speaks. Solid positive, dashed negative.

The ground axes are lifted 1/64in rather than having depthTest disabled:
polygonOffset does not apply to lines, and lifting keeps occlusion correct
so a board resting on the ground hides the axis beneath it."
```

---

### Task 7: Diagnose and fix the grid shimmer after a pan or orbit

**Files:**
- Modify: `src/viewport/Viewport.tsx:159-170` (the `<Grid>`) **or** `src/viewport/Viewport.tsx:224` (`OrbitControls`) — whichever the diagnosis implicates. Possibly both. Possibly only one.

**Interfaces:** none. Configuration only.

**This task has no predetermined fix, on purpose.** Two independent contributors are visible in the code and which one dominates is an empirical question:

- `OrbitControls` runs `enableDamping` with `dampingFactor={0.12}`. Damping is exponential decay, so at 0.12 the camera keeps creeping perceptibly for around a second after the pointer is released. During that time nothing is wrong with the grid — the camera is genuinely still moving.
- The `<Grid>` draws 1-inch cells out to `fadeDistance={220}`. At that density distant cells are sub-pixel, which is a textbook moiré generator. A slowly creeping camera is exactly the input that turns static moiré into visible crawl.

They compose: damping supplies the slow motion, density supplies the shimmer. That is why the symptom is "for a few seconds after" rather than "always".

Do not skip to a change. Changing both at once and declaring victory leaves nobody knowing which mattered, and `dampingFactor` is not a free knob — damping is what makes an orbit feel weighted instead of twitchy.

- [ ] **Step 1: Reproduce and characterize**

Run `npm run dev -- --port 5199`, add two or three boards, then pan and orbit and release.

Write down, before changing anything:

- Does the whole view drift smoothly after release (camera), or does a localized shimmer crawl in the distance (aliasing), or both?
- Roughly how long until it settles?
- Does it happen in orthographic as well as perspective?
- Does it still happen with no boards in the scene? (Isolates the grid from the boards and their shadows.)

- [ ] **Step 2: Test the damping hypothesis alone**

Set `dampingFactor={0.3}` on `OrbitControls` (`Viewport.tsx:224`), leaving the grid untouched. Reload, repeat the gesture.

Then try `enableDamping={false}` as a bracketing experiment — not necessarily as the fix, but to see the symptom with the camera provably stationary at release. If the shimmer is entirely gone with damping off, the motion was the whole story. If it still shimmers *during* a drag, the grid is implicated regardless.

- [ ] **Step 3: Test the density hypothesis alone**

Restore damping to `0.12`. Now try, one at a time:

- `fadeDistance={120}` (matches the working volume the shadow camera already assumes)
- `cellThickness={0.4}`
- `cellSize={2}` — last resort only. One inch per cell is a deliberate design decision: "the units are the grid." Prefer fade and thickness over giving that up.

Note which one changes the symptom and by how much.

- [ ] **Step 4: Apply the smallest change that settles it**

Keep only what the diagnosis justifies. If damping alone settles it, do not touch the grid. If the grid alone settles it, restore `dampingFactor` to `0.12` exactly.

Add a brief comment at the change site saying what was observed and why the value is what it is — the next person to read `dampingFactor={0.3}` will otherwise assume it is arbitrary.

- [ ] **Step 5: Verify**

Acceptance, all of which must hold:

- Releasing a pan or an orbit leaves the view visually static within roughly a third of a second.
- No crawling in the distance, in perspective **and** orthographic.
- Motion *during* a drag is still smooth — trading the shimmer for a jerky orbit is not a fix. If the only way to stop the shimmer is a twitchy orbit, stop and report it rather than shipping the trade.
- `F` (frame selection) and `Home` (frame all) still work and still land smoothly.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add src/viewport/Viewport.tsx
git commit -m "fix: grid no longer shimmers after a pan or orbit

<Replace this body with what you actually found: which of the two
contributors — the damping tail or 1in cell density at fadeDistance 220 —
was responsible, what was measured, and why this value.>"
```

---

### Task 8: Diagnose and fix the gizmo reading inside-out from the far side

**Files:**
- Modify: `src/viewport/Gizmo.tsx` — the fix is a prop or a material tweak on `<TransformControls>`; the exact shape depends on the diagnosis.

**Interfaces:** none.

**One premise to correct before you start.** Nothing is actually flipping. In three 0.185.1, `gizmoTranslate` defines an arrow at *both* ends of every axis — `[0.5,0,0]` and `[-0.5,0,0]` for X, and likewise Y and Z (`node_modules/three/examples/jsm/controls/TransformControls.js:1310-1323`). There is no flip logic in `updateMatrixWorld`; the only camera-dependent behavior is an `AXIS_HIDE_THRESHOLD = 0.99` that hides an axis pointing nearly straight at the viewer. So do not go looking for a flip to disable — there isn't one.

Two candidate mechanisms:

- **Every gizmo material sets `depthTest: false`** (`TransformControls.js:1200-1214`). The gizmo always paints over the board, so the arrow *behind* the board draws in front of it. When the camera crosses to the far side, the two arrows on an axis swap actual depth with no corresponding change on screen — which reads as the axis snapping inside-out. In orthographic there is not even a perspective size cue to tell the near arrow from the far one, which fits the report.
- **The plane handles** (`XY`, `YZ`, `XZ`) sit at fixed positive offsets like `[0.15, 0.15, 0]` and never migrate to the camera-facing quadrant, so from the far side they are buried inside the board.

- [ ] **Step 1: Reproduce and identify which element is jarring**

Run `npm run dev -- --port 5199`, add a long board (say 48" × 5½"), select it, and orbit slowly past 90° and 180° in both perspective and orthographic.

Determine, and write down: is the jarring element the arrows, the three small plane squares, or both? Does it read as a jump at a particular angle, or as continuous wrongness from the far side?

- [ ] **Step 2: Test the depth hypothesis**

drei's `<TransformControls>` forwards unknown props to the underlying control, and the control exposes its gizmo objects, so the materials are reachable. The cheapest probe: get a ref to the control and walk its gizmo children setting `material.depthTest = true`, then orbit again.

Ask: does the board now occlude the far arrow, and does that make the near/far reading obvious? And the cost: how much of the gizmo disappears inside a large board?

- [ ] **Step 3: Test the hide-the-negative-arrows hypothesis**

Separately from Step 2, hide the negative-direction arrows (the second entry of each axis in the gizmo group) and orbit again. Does the ambiguity disappear? Confirm dragging still works in **both** directions along every axis — you push or pull along a single arrow. A fix that makes it impossible to pull a board toward −X is not a fix.

- [ ] **Step 4: Test hiding the plane handles**

Separately again: hide `XY`, `YZ`, `XZ`. Note whether their absence is a loss in practice — they are how you drag in a plane rather than along an axis.

- [ ] **Step 5: Apply the smallest change that matched, and record why**

Keep only what the diagnosis justifies. Add a comment at the change site naming the mechanism and the trade — three ships this gizmo depth-test-off deliberately, so a change here needs its reason written down.

If the honest conclusion is that no single change is clearly better than the current behavior, **stop and report that** rather than shipping a change for its own sake. That is a legitimate outcome of a diagnosis task.

- [ ] **Step 6: Verify**

- Orbiting past the object no longer produces a jarring inside-out reading, in perspective and orthographic.
- Dragging still works along +X, −X, +Y, −Y, +Z, −Z.
- 1/16" snapping still holds: drag a board and confirm the Properties X/Y/Z fields land on sixteenths.
- No jitter or drift during a drag — the `dragging` ref guard in `Gizmo.tsx` is load-bearing and easy to disturb while editing this file. If jitter appears, that guard is what to look at.
- Undo after a drag restores the previous position in one step.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test && npm run build`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add src/viewport/Gizmo.tsx
git commit -m "fix: transform gizmo no longer reads inside-out from the far side

<Replace this body with what you actually found: which mechanism was
responsible, what was ruled out, and the trade the chosen fix makes.>"
```

---

### Task 9: Update the project documentation

**Files:**
- Modify: `CLAUDE.md` — the "Where things live" map and the "Invariants" list
- Modify: `docs/follow-ups.md` — only if any task deferred something

**Interfaces:** none.

Do this last, once the behavior is settled, so the docs describe what shipped rather than what was planned.

- [ ] **Step 1: Update the module map**

In `CLAUDE.md`'s "Where things live" tree, add the two new files with a one-line description each, matching the existing terse style:

```
├── document/
│   ├── names.ts             uniqueName / dedupeNames. Imports only Board.
├── panels/
│   ├── NameField.tsx        part name; commits on blur/Enter, empty reverts
├── viewport/
│   ├── OriginAxes.tsx       origin axis lines, R=X G=Y(up) B=Z
```

- [ ] **Step 2: Add the two new invariants**

Append to the numbered "Invariants" list in `CLAUDE.md`, in the same voice as the existing entries — what breaks, and how it presents:

```markdown
8. **Board names are unique, and enforced in four places** — `addBoard`,
   `duplicateBoard`, the name-field commit, and `migrateDocument`. Creation-only
   enforcement is not enough: an imported or hand-edited file would violate it.
   `createBoard` cannot dedupe (it has no view of the document), so any new call
   site that adds a board must pass its name through `uniqueName` itself.

9. **`NameField` commits once, on blur or Enter — never per keystroke.** An
   emptied name reverts, and that is only possible with a single commit: writing
   per keystroke and correcting on blur takes the gesture's undo snapshot before
   the correction lands, leaving an entry that undoes to nothing. Its `onCommit`
   returns the stored name because dedup can store something other than what was
   typed.
```

- [ ] **Step 3: Note the module dependency order**

The "Architecture" section lists the module layers. `names.ts` is a leaf alongside `units` and belongs in layer 1 — add it there, noting it imports only the `Board` type.

- [ ] **Step 4: Record anything deferred**

If any task left something undone — most likely Task 7 or 8 concluding that a trade was not worth making — add it to `docs/follow-ups.md` with the same "what was found, why it was left, what it would take" shape the existing entries use. If nothing was deferred, skip this step and say so.

- [ ] **Step 5: Verify the docs against the code**

Re-read the changed CLAUDE.md sections with the diff open. Every file path, function name, and behavior claim must match what actually shipped. A confidently wrong CLAUDE.md is worse than a thin one.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/follow-ups.md
git commit -m "docs: record the name-uniqueness and name-field invariants"
```

---

## Final verification

Before calling the plan done:

- [ ] `npm test` — passes, and the count is above the 124 baseline (roughly 155 with this plan's additions).
- [ ] `npm run build` — exits 0. This is the typecheck gate; a green suite does not substitute.
- [ ] All six review items demonstrably fixed in a real browser, in one pass: unique names when adding and duplicating; a cleared name reverting; the origin axes; Delete and Backspace; a settled grid after a pan and an orbit; the gizmo readable from the far side.
- [ ] `git log --oneline` shows one commit per task, with the two diagnosis commits carrying real findings rather than the placeholder bodies.
- [ ] The tasks that concluded "no change was justified" (if any) are recorded in `docs/follow-ups.md`, not silently dropped.
