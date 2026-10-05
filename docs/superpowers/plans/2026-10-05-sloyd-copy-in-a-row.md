# Copy in a Row Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In one step, make N ordinary copies of the selection along ±X/±Y/±Z, spaced by gap, by
pitch, or by fitting them across a distance.

**Architecture:** The work is split into three units:
- `rowLayout`, in a new pure module `src/document/row.ts`, turns (mode, value, unit size, count)
  into a step or a refusal reason.
- The store action `copyInRow` makes the copies in one `edit()`. It shares a per-copy helper with
  `duplicateBoards`.
- `CopyInRow`, in `src/panels/CopyInRow.tsx`, is the inline form. It is rendered inside both
  Properties panels' selection-keyed root, so a selection change remounts it.

**Tech Stack:** TypeScript strict, React 19, Zustand 5, Vitest 4 + RTL.

**Spec:** `docs/superpowers/specs/2026-10-05-sloyd-copy-in-a-row-design.md`. Read it first; it is
the authority.

## Global Constraints

- **Branch:** `copy-in-a-row`, off master at `e40b77a`. Commit only to the branch.
- **Gates:** `npm test` must stay green (1814 tests across 61 files at start), and `npm run build`
  must pass. `npm test` does NOT typecheck.
- **No schema change.** `CURRENT_VERSION` stays 8.
- **The count** is the TOTAL in the row, 2-100 (`MAX_ROW = 100`).
- **Copy positions:** copy k's position on the axis is `original + k × step × sign`, computed per
  copy from the original. Never cumulative, and never rounded to `SNAP_INCHES` (invariant 25).
- **One `edit()` per row.** The selection afterwards is the original parts, in selection order, then
  the copies. It is set through `edit()`'s selection callback, so it goes through `selectionPatch`
  (invariant 42).
- **Copies are made exactly as Duplicate makes them,** through ONE shared helper:
  - fresh ids, and fresh cut ids via `nextId()`;
  - copied position arrays;
  - names through `uniqueName` against the growing list (invariant 8).
- **`row.ts` imports no `units`.** It returns reason CODES; the panel formats every string (the
  `→ units` edge rule: only a module producing a string a person reads takes it).
- **Selectors return bare fields** (invariant 34's cost rule).
- **Mutation-test every new test.** Break the code it guards, confirm red, then revert BY HAND
  (never `git checkout` over uncommitted work). Name each mutation and its result in the report.
- **Style:** terse comments that state WHY. No new dependencies.

**Ruling recorded here (controller, while planning):** spec §3 puts the button "beside Duplicate".
`CopyInRow` renders its own button on its own line, directly under the Duplicate/Hide others/Delete
row, so the component owns its open state. Cost if wrong: a one-line move.

## Review Focus

1. **A fit that does not divide evenly** (30in, 7 parts, 3/4in wide). Expect exact even spacing, with
   no part landing on the 1/16 grid by rounding. Covered by the Task 1 exactness test and the Task 2
   drift test.
2. **A group whose parts are not aligned** (a leg plus a rail at different heights). Every copy must
   keep the exact relative layout (Task 2 test).
3. **Changing the count after typing a fit span.** The summary updates and Apply follows it (Task 3
   test: count change flips a fit from refused to ok).
4. **A selection change while the form is open.** The form resets and makes nothing (Task 3 test).
5. **Copying toward −Y below the floor.** Allowed: the copies are made and `checkDesign` reports
   them as usual. Not refused by the form; this is a live-check note.

---

### Task 1: `rowLayout` — the spacing arithmetic

**Files:**
- Create: `src/document/row.ts`, `src/document/row.test.ts`

**Interfaces:**
- **Produces:**
  - `export type RowMode = 'gap' | 'pitch' | 'fit'`
  - `export const MAX_ROW = 100`
  - `export type RowRefusal = 'count' | 'value' | 'negative-gap' | 'pitch-short' | 'no-room'`
  - `export type RowLayout = { ok: true; step: number; gap: number; length: number } | { ok: false; reason: RowRefusal }`
  - `export function rowLayout(mode: RowMode, value: number, s: number, count: number): RowLayout`

- [ ] **Step 1: Failing tests.** Write `src/document/row.test.ts`:

```ts
import { MAX_ROW, rowLayout } from './row';

describe('rowLayout', () => {
  it('gap: step is the part plus the gap; gap 0 is touching', () => {
    expect(rowLayout('gap', 0.5, 3.5, 4)).toEqual({ ok: true, step: 4, gap: 0.5, length: 15.5 });
    expect(rowLayout('gap', 0, 3.5, 2)).toEqual({ ok: true, step: 3.5, gap: 0, length: 7 });
    expect(rowLayout('gap', -1 / 16, 3.5, 2)).toEqual({ ok: false, reason: 'negative-gap' });
  });

  it('pitch: step is the pitch; a pitch shorter than the part is refused', () => {
    expect(rowLayout('pitch', 4, 1.5, 3)).toEqual({ ok: true, step: 4, gap: 2.5, length: 9.5 });
    expect(rowLayout('pitch', 1.5, 1.5, 3)).toEqual({ ok: true, step: 1.5, gap: 0, length: 4.5 });
    expect(rowLayout('pitch', 1.4, 1.5, 3)).toEqual({ ok: false, reason: 'pitch-short' });
  });

  it('fit: N parts spread evenly across D, outer to outer', () => {
    expect(rowLayout('fit', 20, 2, 4)).toEqual({ ok: true, step: 6, gap: 4, length: 20 });
    expect(rowLayout('fit', 8, 2, 4)).toEqual({ ok: true, step: 2, gap: 0, length: 8 });
    expect(rowLayout('fit', 7.9, 2, 4)).toEqual({ ok: false, reason: 'no-room' });
  });

  it('fit does not round: 7 parts of 3/4in across 30in', () => {
    const r = rowLayout('fit', 30, 0.75, 7);
    expect(r.ok && r.step).toBe((30 - 0.75) / 6);
    expect(r.ok && r.gap).toBe((30 - 7 * 0.75) / 6);
  });

  it('refuses a count outside 2..MAX_ROW or not whole, and a non-finite value', () => {
    expect(rowLayout('gap', 0, 1, 1)).toEqual({ ok: false, reason: 'count' });
    expect(rowLayout('gap', 0, 1, MAX_ROW + 1)).toEqual({ ok: false, reason: 'count' });
    expect(rowLayout('gap', 0, 1, 2.5)).toEqual({ ok: false, reason: 'count' });
    expect(rowLayout('gap', 0, 1, MAX_ROW).ok).toBe(true);
    expect(rowLayout('gap', Number.NaN, 1, 2)).toEqual({ ok: false, reason: 'value' });
  });
});
```

  Run `npx vitest run src/document/row.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 2: Implement** `src/document/row.ts`:

```ts
/**
 * The arithmetic of a row of copies (copy-in-a-row spec §2): the step from one
 * copy to the next, the clear gap between them, and the row's outer length.
 * `s` is the unit's extent along the row's axis. The count is the TOTAL in the
 * row, original included.
 *
 * Nothing here rounds: every value comes from what the person typed, so it is
 * kept exact (invariant 25). A refusal is a CODE, not a sentence, so this
 * module stays free of `units`; the panel words it.
 */
export type RowMode = 'gap' | 'pitch' | 'fit';
export const MAX_ROW = 100;
export type RowRefusal = 'count' | 'value' | 'negative-gap' | 'pitch-short' | 'no-room';
export type RowLayout =
  | { ok: true; step: number; gap: number; length: number }
  | { ok: false; reason: RowRefusal };

export function rowLayout(mode: RowMode, value: number, s: number, count: number): RowLayout {
  if (!Number.isInteger(count) || count < 2 || count > MAX_ROW) return { ok: false, reason: 'count' };
  if (!Number.isFinite(value) || !(s > 0)) return { ok: false, reason: 'value' };
  const n = count - 1;
  switch (mode) {
    case 'gap':
      if (value < 0) return { ok: false, reason: 'negative-gap' };
      return { ok: true, step: s + value, gap: value, length: s + n * (s + value) };
    case 'pitch':
      if (value < s) return { ok: false, reason: 'pitch-short' };
      return { ok: true, step: value, gap: value - s, length: s + n * value };
    case 'fit':
      if (value < count * s) return { ok: false, reason: 'no-room' };
      return { ok: true, step: (value - s) / n, gap: (value - count * s) / n, length: value };
  }
}
```

- [ ] **Step 3: Run.** Run `npx vitest run src/document/row.test.ts`, then `npm run build`.
  Expected: PASS.

- [ ] **Step 4: Mutation-test.** Each of these must turn red; revert each by hand.
  - make the gap check `value <= 0`;
  - make the pitch check `value <= s`;
  - make the fit check `value <= count * s`;
  - round `step` to 1/16 in fit;
  - drop `!Number.isInteger(count)`.

- [ ] **Step 5: Commit.**

```bash
git add src/document/row.ts src/document/row.test.ts
git commit -m "feat(document): rowLayout — gap, pitch and fit-across spacing for a row of copies"
```

---

### Task 2: `copyInRow` — the store action

**Files:**
- Modify: `src/store/store.ts` (a new private helper shared with `duplicateBoards`, and the new
  action plus its declaration).
- Test: `src/store/store.test.ts` (a new `describe('copyInRow', …)` block at the end).

**Interfaces:**
- **Consumes:** `MAX_ROW` from `src/document/row.ts`.
- **Produces:**
  `copyInRow: (ids: string[], count: number, axis: 0 | 1 | 2, sign: 1 | -1, step: number) => void`.

- [ ] **Step 1: Failing tests.** Append to `src/store/store.test.ts`:

```ts
describe('copyInRow', () => {
  const st = () => useStore.getState();
  const part = (patch: Partial<Board>) => {
    st().addBoard();
    const id = st().doc.boards.at(-1)!.id;
    st().updateBoard(id, patch);
    return id;
  };

  it('places copy k at original + k·step·sign on the axis, per copy, never cumulative', () => {
    const a = part({ length: 24, width: 0.1, thickness: 0.75, position: [0, 0, 0] });
    st().copyInRow([a], 11, 2, 1, 0.1);
    const zs = st().doc.boards.map((b) => b.position[2]);
    // A cumulative sum of 0.1 ten times is 0.9999999999999999; k·0.1 is 1.
    expect(zs).toEqual([0, ...Array.from({ length: 10 }, (_, i) => 0 + (i + 1) * 0.1 * 1)]);
    expect(st().doc.boards.every((b) => b.position[0] === 0 && b.position[1] === 0)).toBe(true);
  });

  it('copies a group as a unit, keeping its exact relative layout', () => {
    const leg = part({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright', position: [0, 0, 0] });
    const rail = part({ length: 16.5, width: 4, thickness: 0.75, posture: 'on-edge', position: [1.75, 22, 0.5] });
    st().copyInRow([leg, rail], 3, 2, -1, 20);
    const byName = (n: string) => st().doc.boards.filter((b) => b.name.startsWith(n));
    expect(st().doc.boards).toHaveLength(6);
    const [l0, l1, l2] = st().doc.boards.filter((b) => b.posture === 'upright');
    const [r0, r1, r2] = st().doc.boards.filter((b) => b.posture === 'on-edge');
    for (const [l, r, k] of [[l0, r0, 0], [l1, r1, 1], [l2, r2, 2]] as const) {
      expect(l!.position).toEqual([0, 0, 0 - k * 20]);
      expect(r!.position).toEqual([1.75, 22, 0.5 - k * 20]);
    }
    expect(byName('Board').length).toBe(6);
  });

  it('runs along Y, keeps turn, posture, material and cuts, and gives fresh ids', () => {
    const a = part({ length: 20, width: 6, thickness: 0.75, rotation: 180, material: 'walnut', position: [0, 5, 0] });
    st().addCut(a);
    st().copyInRow([a], 3, 1, 1, 10);
    const [o, c1, c2] = st().doc.boards;
    expect([o!.position[1], c1!.position[1], c2!.position[1]]).toEqual([5, 15, 25]);
    for (const c of [c1!, c2!]) {
      expect(c.rotation).toBe(180);
      expect(c.material).toBe('walnut');
      expect(c.cuts).toHaveLength(1);
      expect(c.cuts[0]!.id).not.toBe(o!.cuts[0]!.id);
      expect(c.id).not.toBe(o!.id);
    }
    expect(new Set(st().doc.boards.map((b) => b.name)).size).toBe(3);
  });

  it('is one undo entry and selects the originals then the copies', () => {
    const a = part({ position: [0, 0, 0] });
    const before = st().past.length;
    st().copyInRow([a], 4, 0, 1, 30);
    expect(st().past.length).toBe(before + 1);
    const ids = st().doc.boards.map((b) => b.id);
    expect(st().selectedIds).toEqual(ids);
    st().undo();
    expect(st().doc.boards.map((b) => b.id)).toEqual([a]);
  });

  it('refuses a bad count, a bad step or no parts, writing nothing', () => {
    const a = part({ position: [0, 0, 0] });
    const doc = st().doc;
    const past = st().past.length;
    st().copyInRow([a], 1, 0, 1, 5);
    st().copyInRow([a], 101, 0, 1, 5);
    st().copyInRow([a], 3, 0, 1, 0);
    st().copyInRow([a], 3, 0, 1, Number.NaN);
    st().copyInRow(['nope'], 3, 0, 1, 5);
    expect(st().doc).toBe(doc);
    expect(st().past.length).toBe(past);
  });

  it('never clears the tape anchor (invariant 24)', () => {
    const a = part({ position: [0, 0, 0] });
    st().setTapeAnchor(boardSnapPoints(st().doc.boards[0]!)[0]!);
    st().copyInRow([a], 3, 0, 1, 30);
    expect(st().tapeAnchor).not.toBeNull();
  });
});
```

  - **Imports:** add `Board` to the file's type imports if needed. `boardSnapPoints` is already
    imported.
  - **Unused helper:** `byName` in the group test is only used for the name count. Keep it or
    inline it.
  - **Run** `npx vitest run src/store/store.test.ts -t copyInRow`. Expected: FAIL (not a function).

- [ ] **Step 2: Implement.** In `src/store/store.ts`:
  - **Shared helper.** Extract `duplicateBoards`' per-copy body into a private helper above the
    returned object. Keep `duplicateBoards`' existing comment on the reasons; move the per-copy part
    of it onto the helper.

```ts
  /**
   * One copy of `source` at `position`, exactly as Duplicate makes it: a fresh
   * id, fresh cut ids (nextId), copied arrays so no snapshot shares them, and
   * a name unique against `taken`, which the caller GROWS as it copies
   * (invariant 8). Shared by duplicateBoards and copyInRow so the two cannot
   * drift.
   */
  const copyBoard = (source: Board, position: [number, number, number], taken: Board[]): Board => {
    const { id: _sourceId, ...rest } = source;
    const fresh = createBoard({
      ...rest,
      position: [...position],
      cuts: source.cuts.map((cut) => ({ ...cut, id: nextId() })),
    });
    return { ...fresh, name: uniqueName(source.name, taken) };
  };
```

  - **`duplicateBoards`' loop** becomes `copies.push(copyBoard(source, source.position, [...boards, ...copies]));`.
  - **The action**, beside `duplicateBoards`:

```ts
    copyInRow: (ids, count, axis, sign, step) => {
      // Guarded before edit(): a refusal writes nothing (invariant 4). The
      // caller has run rowLayout; this re-checks only what would make a bad row.
      if (!Number.isInteger(count) || count < 2 || count > MAX_ROW) return;
      if (!Number.isFinite(step) || step <= 0) return;
      const boards = get().doc.boards;
      const sources = [...new Set(ids)].flatMap((id) => boards.filter((b) => b.id === id));
      if (sources.length === 0) return;
      const copies: Board[] = [];
      for (let k = 1; k < count; k += 1) {
        // From the ORIGINAL every time, never the previous copy: a running sum
        // drifts by an ulp per copy. Never rounded (invariant 25).
        const shift = k * step * sign;
        for (const source of sources) {
          const position = [...source.position] as [number, number, number];
          position[axis] = source.position[axis] + shift;
          copies.push(copyBoard(source, position, [...boards, ...copies]));
        }
      }
      edit(
        (doc) => ({ ...doc, boards: [...doc.boards, ...copies] }),
        () => [...sources.map((s) => s.id), ...copies.map((c) => c.id)],
      );
    },
```

  - **The interface entry,** with a doc comment: "N − 1 copies of the selection, each shifted
    k·step·sign along `axis` from the original. ONE undo entry; selects the originals then the
    copies. Refuses (writes nothing) a count outside 2..MAX_ROW, a non-positive or non-finite step,
    or no known ids."
  - **Import** `MAX_ROW` from `'../document/row'`.

- [ ] **Step 3: Run.** Run `npx vitest run src/store`, then `npm test` and `npm run build`. Expected:
  all pass, including the existing `duplicateBoards` tests.

- [ ] **Step 4: Mutation-test.** Each of these must turn red; revert each by hand.
  - compute positions cumulatively (keep a running position and add `step`): the drift test;
  - share one `taken` list that does not grow (`boards` only): the names test;
  - reuse the source cut ids: the fresh-ids test;
  - drop the count guard: the refusal test;
  - select only the copies: the selection test.

- [ ] **Step 5: Commit.**

```bash
git add src/store/store.ts src/store/store.test.ts
git commit -m "feat(store): copyInRow — N copies along an axis, one undo entry; shares Duplicate's copy helper"
```

---

### Task 3: The Copy in a row form

**Files:**
- Create: `src/panels/CopyInRow.tsx`, `src/panels/CopyInRow.test.tsx`.
- Modify: `src/panels/Properties.tsx` (render `<CopyInRow />` in both panels), and `src/styles.css`.

**Interfaces:**
- **Consumes:**
  - `rowLayout`, `RowMode`, `MAX_ROW` (Task 1);
  - `copyInRow` (Task 2);
  - `boardsBounds` from `../document/geometry` (re-exported via `../document/document`);
  - `formatLength` from `../units/length`;
  - `DimensionField`.
- **Produces:** `export function CopyInRow()`, which takes no props and reads `selectedIds` itself.

- [ ] **Step 1: Failing tests.** Write `src/panels/CopyInRow.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createDocument } from '../document/document';
import { Properties } from './Properties';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

/** One flat 24 x 3-1/2 x 3/4 part at the origin, selected. Its Z extent is 3-1/2. */
const onePart = () => {
  act(() => {
    useStore.getState().addBoard();
    const id = useStore.getState().doc.boards[0]!.id;
    useStore.getState().updateBoard(id, { length: 24, width: 3.5, thickness: 0.75, position: [0, 0, 0] });
    useStore.getState().selectBoard(id);
  });
  render(<Properties />);
};
const open = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Copy in a row…' }));

describe('Copy in a row', () => {
  it('summarises the row as values change, and Apply makes it', async () => {
    onePart();
    const user = userEvent.setup();
    await open(user);
    const count = screen.getByRole('spinbutton', { name: 'Count' });
    await user.clear(count);
    await user.type(count, '4');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), '+Z');
    const gap = screen.getByRole('textbox', { name: 'Gap' });
    await user.clear(gap);
    await user.type(gap, '1/2{Enter}');
    expect(screen.getByText(/4 in the row: 3 copies, gap 1\/2", row 15-1\/2" long/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(useStore.getState().doc.boards.map((b) => b.position[2])).toEqual([0, 4, 8, 12]);
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('refuses a fit with no room, with the reason, and enables Apply when the count drops', async () => {
    onePart();
    const user = userEvent.setup();
    await open(user);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Direction' }), '+Z');
    await user.click(screen.getByRole('radio', { name: 'Fit across' }));
    const count = screen.getByRole('spinbutton', { name: 'Count' });
    await user.clear(count);
    await user.type(count, '4');
    const across = screen.getByRole('textbox', { name: 'Across' });
    await user.clear(across);
    await user.type(across, '10{Enter}');
    expect(screen.getByText(/Not enough room/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await user.clear(count);
    await user.type(count, '2');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled();
  });

  it('Cancel adds no undo entry and makes nothing', async () => {
    onePart();
    const user = userEvent.setup();
    const past = useStore.getState().past.length;
    await open(user);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useStore.getState().past.length).toBe(past);
    expect(useStore.getState().doc.boards).toHaveLength(1);
  });

  it('a selection change closes and resets the form', async () => {
    onePart();
    act(() => useStore.getState().addBoard());
    const [a] = useStore.getState().doc.boards.map((b) => b.id);
    act(() => useStore.getState().selectBoard(a!));
    const user = userEvent.setup();
    await open(user);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
    act(() => useStore.getState().selectBoard(useStore.getState().doc.boards[1]!.id));
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('the group panel offers it too', () => {
    act(() => {
      useStore.getState().addBoard();
      useStore.getState().addBoard();
      useStore.getState().selectAll();
    });
    render(<Properties />);
    expect(screen.getByRole('button', { name: 'Copy in a row…' })).toBeInTheDocument();
  });
});
```

  - **Note on `addBoard`:** in `onePart`, `addBoard` sets a one-shot Length-focus request that
    Properties consumes. If that steals focus in a way that breaks a test, call
    `consumeLengthFocus()` in the fixture. Do not change Properties' focus logic.
  - **Run** `npx vitest run src/panels/CopyInRow.test.tsx`. Expected: FAIL (no button).

- [ ] **Step 2: Implement** `src/panels/CopyInRow.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { boardsBounds } from '../document/document';
import { MAX_ROW, rowLayout } from '../document/row';
import type { RowMode, RowRefusal } from '../document/row';
import { formatLength } from '../units/length';
import { DimensionField } from './DimensionField';

const DIRECTIONS = [
  { label: '+X', axis: 0, sign: 1 },
  { label: '−X', axis: 0, sign: -1 },
  { label: '+Y (up)', axis: 1, sign: 1 },
  { label: '−Y (down)', axis: 1, sign: -1 },
  { label: '+Z', axis: 2, sign: 1 },
  { label: '−Z', axis: 2, sign: -1 },
] as const;
const FIELD_LABEL: Record<RowMode, string> = { gap: 'Gap', pitch: 'Pitch', fit: 'Across' };

/**
 * Copy in a row (copy-in-a-row spec §3): N ordinary copies of the selection
 * along an axis. Reads the selection itself and holds its values as local
 * state; nothing touches the document until Apply. It is rendered inside each
 * Properties panel's selection-keyed root, so a selection change remounts it,
 * closed and reset. rowLayout is the ONE source of the numbers: the summary
 * shows exactly what Apply will do.
 */
export function CopyInRow() {
  const allBoards = useStore((s) => s.doc.boards);
  const selectedIds = useStore((s) => s.selectedIds);
  const precision = useStore((s) => s.doc.units.precision);
  const copyInRow = useStore((s) => s.copyInRow);
  const [open, setOpen] = useState(false);
  const [countText, setCountText] = useState('2');
  const [dir, setDir] = useState(0);
  const [mode, setMode] = useState<RowMode>('gap');
  const [typed, setTyped] = useState<Partial<Record<RowMode, number>>>({ gap: 0 });

  const selected = useMemo(
    () => selectedIds.flatMap((id) => allBoards.filter((b) => b.id === id)),
    [allBoards, selectedIds],
  );
  if (selected.length === 0) return null;
  if (!open) {
    return <button className="copy-row-open" onClick={() => setOpen(true)}>Copy in a row…</button>;
  }

  const { axis, sign } = DIRECTIONS[dir]!;
  const bounds = boardsBounds(selected)!;
  const s = bounds.max[axis] - bounds.min[axis];
  const value = typed[mode] ?? (mode === 'pitch' ? s : 2 * s);
  const count = Number(countText);
  const layout = rowLayout(mode, value, s, count);
  const fmt = (v: number) => formatLength(v, precision);
  const why: Record<RowRefusal, string> = {
    count: `A row has 2 to ${MAX_ROW} parts.`,
    value: 'Enter a measurement.',
    'negative-gap': "The gap can't be negative: the copies would overlap.",
    'pitch-short': `The pitch must be at least the part's ${fmt(s)}: the copies would overlap.`,
    'no-room': `Not enough room: ${count} parts need ${fmt(count * s)}, the span is ${fmt(value)}.`,
  };
  const summary = layout.ok
    ? `${count} in the row: ${count - 1} ${count - 1 === 1 ? 'copy' : 'copies'}, gap ${fmt(layout.gap)}, row ${fmt(layout.length)} long`
    : why[layout.reason];

  return (
    <fieldset className="copy-row">
      <legend>Copy in a row</legend>
      <div className="field">
        <label htmlFor="row-count">Count</label>
        <input id="row-count" className="input" type="number" min={2} max={MAX_ROW} step={1}
          value={countText} onChange={(e) => setCountText(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="row-dir">Direction</label>
        <select id="row-dir" className="input" value={dir} onChange={(e) => setDir(Number(e.target.value))}>
          {DIRECTIONS.map((d, i) => <option key={d.label} value={i}>{d.label}</option>)}
        </select>
      </div>
      <div className="copy-row-modes" role="radiogroup" aria-label="Spacing">
        {(['gap', 'pitch', 'fit'] as const).map((m) => (
          <label key={m}>
            <input type="radio" name="row-mode" checked={mode === m} onChange={() => setMode(m)} />
            {m === 'gap' ? 'Gap' : m === 'pitch' ? 'Pitch' : 'Fit across'}
          </label>
        ))}
      </div>
      {/* Keyed on the mode so switching modes shows that mode's value, not the
          last field's draft (invariant 5's resync, by remount). */}
      <DimensionField key={mode} label={FIELD_LABEL[mode]} precision={precision} value={value}
        min={mode === 'gap' ? 0 : undefined}
        onCommit={(v) => setTyped((t) => ({ ...t, [mode]: v }))} />
      <p className={layout.ok ? 'copy-row-summary' : 'copy-row-summary invalid'} role="status">{summary}</p>
      <div className="row">
        <button disabled={!layout.ok}
          onClick={() => { if (layout.ok) { copyInRow(selectedIds, count, axis, sign, layout.step); setOpen(false); } }}>
          Apply
        </button>
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </fieldset>
  );
}
```

  - **Hook order.** `useMemo` runs before the early returns. Every hook here is called
    unconditionally before any `return`; keep it that way.
  - **`boardsBounds`.** If it is not re-exported from `../document/document`, import it from
    `../document/geometry`.
  - **`DimensionField`'s `min` prop** is inclusive, so `min={0}` makes Gap accept 0. With no `min`,
    it refuses `<= 0`, which is right for Pitch and Across.

- [ ] **Step 3: Wire it in.** In `src/panels/Properties.tsx`:
  - in `GroupProperties`, immediately after the `<div className="row">` holding
    Duplicate/Hide others/Delete, and still inside the keyed `.properties` root, add `<CopyInRow />`;
  - in the single-part panel, add it immediately after its Duplicate/Hide others/Delete row, inside
    the `key={board.id}` root;
  - import it.

  In `src/styles.css`, beside the Properties rules, use only existing tokens:

```css
.copy-row {
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 8px 10px;
  margin: 8px 0 0;
}

.copy-row legend {
  padding: 0 4px;
  color: var(--ink-dim);
}

.copy-row-modes {
  display: flex;
  gap: 12px;
  margin: 6px 0;
}

.copy-row-summary {
  margin: 6px 0;
  color: var(--ink-dim);
}

.copy-row-summary.invalid {
  color: var(--danger, #c0392b);
}

.copy-row-open {
  margin-top: 6px;
}
```

  Check that `--rule`, `--ink-dim` and `--danger` exist in `styles.css`. If `--danger` does not,
  use the token the existing `.field-error` rule uses.

- [ ] **Step 4: Run.** Run `npx vitest run src/panels`, then `npm test` and `npm run build`.
  Expected: all pass, including the existing Properties tests.

- [ ] **Step 5: Mutation-test.** Each of these must turn red; revert each by hand.
  - make Apply always enabled: the no-room test;
  - drop `key={mode}` on the field, then switch Gap → Fit across and confirm the Across field shows
    the gap's value. If no existing test catches this, add one that switches modes and asserts the
    field's value;
  - render `<CopyInRow />` outside the keyed root: the selection-change test.

- [ ] **Step 6: Commit.**

```bash
git add src/panels/CopyInRow.tsx src/panels/CopyInRow.test.tsx src/panels/Properties.tsx src/styles.css
git commit -m "feat(panels): Copy in a row — count, direction, gap/pitch/fit, a live summary, one Apply"
```

---

### Task 4: Docs

**Files:** `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md`.

- [ ] **Step 1: CLAUDE.md.**
  - **Invariant 25:** one sentence adding a row of copies to what it covers. The step comes from typed
    values and is never rounded. Copy k is computed from the original, never from the previous copy,
    because a running sum drifts.
  - **"Where things live":**
    - `src/document/row.ts`: `rowLayout`, reason codes and no `units` (the edge rule);
    - `store.ts`: `copyInRow` and the shared `copyBoard` helper;
    - `panels/CopyInRow.tsx`: inside the keyed root, rowLayout as the one source of the summary.
  - **Status:** a paragraph for this round, "on branch, not merged". Say it is round 2 of repeated
    parts and that linking is next.
  - **Rounds table:** a row for this round.
  - **Test counts:** updated.
- [ ] **Step 2: `docs/history.md`.** The round's entry at the top of "What each round did". Cover:
  - the user's rulings: all three modes, ±X/Y/Z, count = total, an inline form;
  - the placement ruling for the button;
  - any rulings made during execution.
- [ ] **Step 3: `docs/follow-ups.md`.** Number any residues from 218. If there are none, write none.
- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md docs/history.md docs/follow-ups.md
git commit -m "docs: copy in a row round — invariant 25 extended, where things live"
```
