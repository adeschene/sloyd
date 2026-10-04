# Cut Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a cut's direction depend on its shape alone (a square opening's tie included), store every joinery cut the way the cut sheet reads it, and give Properties a one-click "Match the cut list" for a cut stored the other way.

**Architecture:**
- `runAxis` in `cuts.ts` loses its last read of the stored `across`.
- A new `storedAsShape(board, cut, solids?)` re-stores a sideways cut from its clipped opening.
- `pocketFor` passes every cut it builds through `storedAsShape`.
- `CutRow` in `Properties.tsx` shows a note and a button when a cut's stored `across` differs from its shape's run.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library. `npm test` runs tests; `npm run build` (`tsc -b && vite build`, `noUnusedLocals` on) is the type gate. `npm test` does NOT type-check.

**Spec:** `docs/superpowers/specs/2026-10-04-sloyd-cut-storage-design.md`

## Global Constraints

- No geometry change: a re-stored cut's `cutRegion`, clipped to the board, equals the original's on every axis.
- No schema change, and no load-time rewrite of stored documents.
- `cuts.ts` must NOT import `../units`.
- `storedAsShape` returns the SAME OBJECT for a cut already stored with `across === run`, and the cut unchanged for one that removes nothing.
- The tie (spec §2) reads only the shape: the direction with exactly one open end, else the earlier in `DIMENSION_ORDER`. `runAxis` must not read `cut.across`.
- `cutSignature` / `rowKey` are untouched. A re-stored cut may split a row (spec §3.4); that is accepted.
- No line, drawing, word or region of the three live-check designs may change. Only joinery's STORED fields for the stopped housings may change. Anything else: stop and ask.
- Any existing test expectation that changes must be listed with its reason in the task report.
- Commits end with your harness's `Co-Authored-By` attribution trailer.

## Review Focus

1. **A cut whose direction comes from another cut.** The 192 housing touches no edge itself; the back rabbet opens one of its ends. `pocketFor` must see the board's existing cuts (Task 2).
2. **A decimal cut already stored the way it runs** (offset 0.1, width 0.2) must not be rewritten by `storedAsShape`. Otherwise the button would appear, or joinery would store float noise and split rows (Task 2).
3. **A tenon shoulder stored sideways shows no note.** The sheet prints the tenon, not the shoulder (Task 3).
4. **One click is one undo step,** and the undo brings the note back (Task 3).
5. **A cut that removes nothing** gets no note and no button, and `storedAsShape` leaves it alone (Tasks 2, 3).

---

### Task 1: The square tie reads only the shape (196)

**Files:**
- Modify: `src/document/cuts.ts` (`runAxis`, ~line 504–516, and its doc comment)
- Test: `src/document/cuts.test.ts`, `src/document/cutlist.test.ts`

**Interfaces:**
- Consumes: `runAxis(cut, ext, open)` inside `cuts.ts`; `Opening` is `ReturnType<typeof openSides>`.
- Produces: no new exports. `cutShape(...).run` now depends only on the board and the cut's box.

- [ ] **Step 1: Replace the old rule-3 test and add the new ones**

In `src/document/cuts.test.ts`, inside `describe('cutShape: one description, whichever way the cut is stored (cut-lines spec §2.1)'`, which already defines `b`, `cut` and `same`, REPLACE the test `'a square closed opening runs along the stored across (rule 3), so it is stable'` with:

```ts
  it('a square closed opening runs along the length, whichever way it is stored (cut-storage §2)', () => {
    const sq = cut({ offset: 6, width: 1, stopMin: 2, stopMax: 2.5 });
    const sq2 = cut({ across: 'length', offset: 2, width: 1, stopMin: 6, stopMax: 17 });
    expect(cutShape(b([sq]), sq).run).toBe('length');
    same(sq, sq2);
  });

  it('a square edge notch runs from its open edge, whichever way it is stored (cut-storage §2)', () => {
    // Opening length [6, 6.75] x width [4.75, 5.5]: open at the width's max edge only.
    const n1 = cut({ stopMin: 4.75 });
    const n2 = cut({ across: 'length', offset: 4.75, width: 0.75, stopMin: 6, stopMax: 17.25 });
    expect(cutShape(b([n1]), n1)).toMatchObject({ word: 'notch', run: 'width', pos: 'length', stopMin: 4.75, stopMax: null });
    same(n1, n2);
  });

  it('a square corner opening (one open end on each axis) runs along the length', () => {
    const c1 = cut({ offset: 0, width: 1, stopMin: 0, stopMax: 4.5 });
    const c2 = cut({ across: 'length', offset: 0, width: 1, stopMin: 0, stopMax: 23 });
    expect(cutShape(b([c1]), c1).run).toBe('length');
    same(c1, c2);
  });
```

In `src/document/cutlist.test.ts`, inside `describe('the setup line is written from the shape (cut-lines spec §2.2)'`, which has `line`, `both` and a local `dado` (face thickness, from min, across width, offset 6, width 3/4, depth 1/4), add:

```ts
  it('a square edge notch prints one line whichever way it is stored (cut-storage §2)', () => {
    both(dado({ stopMin: 4.75 }), dado({ across: 'length', offset: 4.75, width: 0.75, stopMin: 6, stopMax: 17.25 }),
      '3/4" notch, 1/4" deep — into the thickness face (min side), 6" from the length min end, running across the width, stopped 4-3/4" short of the min end');
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/cuts.test.ts src/document/cutlist.test.ts`
Expected: FAIL. The square closed pocket stored across the width runs `width`. The second storage of each pair follows its stored `across`.

- [ ] **Step 3: Implement**

In `src/document/cuts.ts`, replace `runAxis`'s last line (`return cut.across === b ? b : a;`) with:

```ts
  // Cut-storage spec §2: on an EXACT tie, the direction with exactly one open
  // end (the edge the cut enters from); otherwise the earlier dimension. Never
  // the stored `across`: joinery stores a cut WITH across = run, so reading
  // across here would let storage and direction decide each other.
  const oneOpen = (d: Dimension) => open[d].min !== open[d].max;
  if (oneOpen(a) !== oneOpen(b)) return oneOpen(a) ? a : b;
  return a;
```

Update `runAxis`'s doc comment: rule 3 is now "on an exact tie, the direction with exactly one open end, else the earlier in DIMENSION_ORDER (cut-storage spec §2)". Remove the sentence about the stored `across`. Also update the `CutShape`/`cutShape` doc comments if they mention the stored-`across` tie.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/document/cuts.test.ts src/document/cutlist.test.ts`, then `npm test` and `npm run build`.
Expected: PASS, build clean. `src/generate/joints/cutlines.recipe.test.ts` must stay green unchanged: its corner notches are settled by rule 1, not the tie. List any other changed expectation with its reason.

- [ ] **Step 5: Mutate**

Each must turn a test red; revert after each:
1. Delete the `if (oneOpen(a) !== oneOpen(b)) …` line.
2. Flip it: `return oneOpen(a) ? b : a;`.
3. `return b;` on the last line.
4. Restore the old `return cut.across === b ? b : a;` in place of `return a;`.

- [ ] **Step 6: Commit**

```bash
git add src/document/cuts.ts src/document/cuts.test.ts src/document/cutlist.test.ts
git commit -m "feat(cuts): a square opening's direction reads only its shape (fu 196)"
```

---

### Task 2: `storedAsShape`, and joinery stores cuts the way they run (195, part 1)

**Files:**
- Modify: `src/document/cuts.ts` (new export after `cutLabel`)
- Modify: `src/document/document.ts:13` (re-export `storedAsShape`)
- Modify: `src/generate/joints/pocket.ts` (`pocketFor`'s return, its doc comment)
- Test: `src/document/cuts.test.ts`, `src/generate/joints/pocket.test.ts`, `src/generate/joints/cutlines.recipe.test.ts`

**Interfaces:**
- Consumes: `cutShape(board, cut, solids?) → { run, pos, at, along, … }`, `cutRemovesNothing`, `boardSolids`, all in `cuts.ts`.
- Produces: `export function storedAsShape(board: Board, cut: Cut, solids?: Region[]): Cut`. Task 3 calls it as `storedAsShape(board, cut, solids)` and tests `cut.across !== cutShape(board, cut, solids).run`.

- [ ] **Step 1: Write the failing tests**

In `src/document/cuts.test.ts`, add `storedAsShape` to the import from `./cuts`, then append:

```ts
describe('storedAsShape: the same cut, stored the way it runs (cut-storage spec §3.1)', () => {
  const clipped = (b: Board, c: Cut) => {
    const r = cutRegion(b, c);
    return (['length', 'width', 'thickness'] as const).map((d) => [Math.max(0, r[d][0]), Math.min(b[d], r[d][1])]);
  };
  const check = (b: Board, c: Cut, run: Dimension) => {
    const s = storedAsShape(b, c);
    expect(s.across).toBe(run);
    expect(s.id).toBe(c.id);
    expect(clipped(b, s)).toEqual(clipped(b, c));
    expect(cutShape({ ...b, cuts: b.cuts.map((x) => (x.id === c.id ? s : x)) }, s)).toEqual(cutShape(b, c));
    return s;
  };

  it('re-stores 192\'s housing across the width, beside the back rabbet', () => {
    const backRabbet: Cut = { id: 'r', face: 'width', from: 'min', across: 'length', offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0 };
    const housing: Cut = { id: 'h', face: 'thickness', from: 'max', across: 'length', offset: 0.25, width: 10.25, depth: 0.25, stopMin: 24, stopMax: 47.25 };
    const side = createBoard({ length: 72, width: 11.25, thickness: 0.75, cuts: [backRabbet, housing] });
    expect(check(side, housing, 'width')).toEqual({ ...housing, across: 'width', offset: 24, width: 0.75, stopMin: 0.25, stopMax: 0.75 });
  });

  it('re-stores a sideways dado, stopped dado, mortise and edge notch', () => {
    const one = (c: Cut) => withCuts([c]);
    const dado = { ...DADO, across: 'length' as const, offset: 0, width: 5.5, stopMin: 6, stopMax: 17.25 };
    check(one(dado), dado, 'width');
    const stopped = { ...DADO, across: 'length' as const, offset: 0, width: 4.5, stopMin: 6, stopMax: 17.25 };
    check(one(stopped), stopped, 'width');
    const mortise = { ...DADO, across: 'width' as const, offset: 6, width: 3, depth: 0.625, stopMin: 2, stopMax: 3 };
    check(one(mortise), mortise, 'length');
    const notch = { ...DADO, across: 'length' as const, offset: 4.75, width: 0.75, stopMin: 6, stopMax: 17.25 };
    check(one(notch), notch, 'width');
  });

  it('returns the very same object for a cut already stored the way it runs, decimals included', () => {
    const c = { ...DADO, across: 'length' as const, offset: 0.1, width: 0.2, stopMin: 0, stopMax: 0 };
    const b = withCuts([c]);
    expect(cutShape(b, c).run).toBe('length');
    expect(storedAsShape(b, c)).toBe(c);
    expect(storedAsShape(withCuts([DADO]), DADO)).toBe(DADO);
  });

  it('drops overhang when it re-stores', () => {
    // The dado stored across the length, its width span hanging 1/2" past the near edge.
    const c = { ...DADO, across: 'length' as const, offset: -0.5, width: 6, stopMin: 6, stopMax: 17.25 };
    expect(check(withCuts([c]), c, 'width')).toMatchObject({ offset: 6, width: 0.75, stopMin: 0, stopMax: 0 });
  });

  it('leaves a cut that removes nothing alone', () => {
    const gone = { ...DADO, across: 'length' as const, offset: 30 };
    expect(storedAsShape(withCuts([gone]), gone)).toBe(gone);
  });
});
```

(`Board`, `Cut` and `Dimension` are already imported as types at the top of the file; `createBoard` is already imported.)

In `src/generate/joints/cutlines.recipe.test.ts`, add `cutShape, cutsThatRemoveStock` imported from `'../../document/cuts'`, and inside the `describe('the live designs …'` block append:

```ts
  it('joinery stores every cut the way the sheet reads it (cut-storage §3.2)', () => {
    for (const doc of [joined(migrateDocument(JSON.parse(workbenchRaw))), joined(bookcase()), stoppedShelves()]) {
      for (const b of doc.boards) {
        for (const c of cutsThatRemoveStock(b)) expect(c.across, `${b.name} ${c.id}`).toBe(cutShape(b, c).run);
      }
    }
    const side = stoppedShelves().boards.find((b) => b.name === 'Left side')!;
    // The two housings are the only thickness-face cuts with a stop (the top and bottom rabbets have none).
    const housings = side.cuts.filter((c) => c.face === 'thickness' && c.stopMax > 0);
    expect(housings.map((c) => [c.across, c.offset, c.stopMin, c.stopMax])).toEqual([['width', 24, 0.25, 0.75], ['width', 48, 0.25, 0.75]]);
  });
```

`stoppedShelves` is currently declared inside the describe, after the two characterisation tests. If the new `it` is placed after its declaration, nothing moves; otherwise hoist it to module scope unchanged.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/cuts.test.ts src/generate/joints/cutlines.recipe.test.ts`
Expected: FAIL. `storedAsShape` is not exported, and the housings are stored `across: 'length'`.

- [ ] **Step 3: Implement `storedAsShape`**

In `src/document/cuts.ts`, after `cutLabel`:

```ts
/**
 * The same cut, stored the way it runs (cut-storage spec §3.1): `across` is
 * its shape's run, the position and width are its clipped opening along the
 * other axis, and the stops are its clipped opening along the run. It removes
 * exactly the same stock; clipping only drops stored overhang that removed
 * nothing.
 *
 * A cut ALREADY stored with `across === run` comes back as the very same
 * object: recomputing its fields is not exact for decimals ((0.1 + 0.2) - 0.1
 * is not 0.2), and float noise here would split cut-list rows (invariant 18).
 * A cut that removes nothing has no shape to follow and is also returned as is.
 */
export function storedAsShape(board: Board, cut: Cut, solids: Region[] = boardSolids(board)): Cut {
  if (cutRemovesNothing(board, cut)) return cut;
  const s = cutShape(board, cut, solids);
  if (s.run === cut.across) return cut;
  return {
    ...cut,
    across: s.run,
    offset: s.at[0],
    width: s.at[1] - s.at[0],
    stopMin: s.along[0],
    stopMax: board[s.run] - s.along[1],
  };
}
```

Add `storedAsShape` to the `export { … } from './cuts'` list in `src/document/document.ts` (line 13).

- [ ] **Step 4: `pocketFor` stores the shape's way**

In `src/generate/joints/pocket.ts`:
1. Import `storedAsShape` alongside `nextId` from `'../../document/document'`.
2. Build the cut as now, into a `const cut: Cut = { … }`, then return:
   ```ts
   // Stored the way the cut sheet reads it (cut-storage spec §3.2), seen on the
   // board WITH its existing cuts, because another cut can open one of this
   // cut's ends (the shelf housing beside the back rabbet). Same region.
   return storedAsShape({ ...board, cuts: [...board.cuts, cut] }, cut);
   ```
3. In the doc comment, after the sentence about `across`, add: "`across` is then re-stored as the shape's run (`storedAsShape`), so the stored form matches the cut sheet; the region is unchanged."

The existing `across` choice stays as it is. It still decides the stored form when the shape agrees, which keeps `storedAsShape` returning the same object.

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/document/cuts.test.ts src/generate/joints/`, then `npm test` and `npm run build`.
Expected: PASS. In `pocket.test.ts` every pose probe must pass unchanged, because they probe the region. The test `'a stopped dado on a posed board: across is the dimension reaching one end…'` must still read `across: 'width'`, because its square opening ties toward the open end. In `cutlines.recipe.test.ts` the line and drawing literals must pass unchanged. List any changed expectation with its reason.

- [ ] **Step 6: Mutate**

Each must turn a test red; revert after each:
1. Remove the `if (s.run === cut.across) return cut;` early return.
2. `stopMin: 0` in place of `s.along[0]`.
3. In `pocketFor`, pass `board` instead of `{ ...board, cuts: [...board.cuts, cut] }`.
4. In `pocketFor`, return `cut` directly (no `storedAsShape`).

- [ ] **Step 7: Commit**

```bash
git add src/document/cuts.ts src/document/cuts.test.ts src/document/document.ts src/generate/joints/pocket.ts src/generate/joints/cutlines.recipe.test.ts
git commit -m "feat(cuts): storedAsShape; joinery stores each cut the way the sheet reads it (fu 195)"
```

---

### Task 3: Properties — the note and "Match the cut list" (195, part 2)

**Files:**
- Modify: `src/panels/Properties.tsx` (`CutRow`, its imports)
- Test: `src/panels/Properties.test.tsx` (inside `describe('cuts', …)`)

**Interfaces:**
- Consumes: `cutShape(board, cut, solids)` and `storedAsShape(board, cut, solids)` from `'../document/document'`, plus the existing `findTenons`, `cutRemovesNothing` and the row's `set(patch)`.
- Produces: UI only. The note text is `The cut list reads this cut as running across the <run>.`, with `<run>` one of `length` / `width` / `thickness`. The button's accessible name is `Match the cut list`.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('cuts', () => { … })` in `src/panels/Properties.test.tsx` (it has `renderWithBoard()`, which adds a default 24 × 5-1/2 × 3/4 board, selects it, renders, and returns its id):

```tsx
  describe('a cut stored the other way from the sheet (cut-storage §3.3)', () => {
    const backRabbet = { face: 'width' as const, from: 'min' as const, across: 'length' as const, offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0 };
    const housing = { face: 'thickness' as const, from: 'max' as const, across: 'length' as const, offset: 0.25, width: 10.25, depth: 0.25, stopMin: 24, stopMax: 47.25 };
    const seedSide = () => {
      const id = renderWithBoard();
      act(() => {
        const st = useStore.getState();
        st.updateBoard(id, { length: 72, width: 11.25 });
        st.addCut(id);
        st.addCut(id);
        const [r, h] = useStore.getState().doc.boards[0].cuts;
        st.updateCut(id, r.id, backRabbet);
        st.updateCut(id, h.id, housing);
      });
      const [r, h] = useStore.getState().doc.boards[0].cuts;
      return { id, rabbetId: r.id, housingId: h.id };
    };
    const note = /The cut list reads this cut as running across the width\./;
    const runsAcross = (cutId: string) => document.getElementById(`across-${cutId}`) as HTMLSelectElement;

    it('shows the note and the button on the sideways housing only', () => {
      const { rabbetId, housingId } = seedSide();
      expect(screen.getAllByText(note)).toHaveLength(1);
      expect(screen.getAllByRole('button', { name: 'Match the cut list' })).toHaveLength(1);
      expect(runsAcross(housingId).value).toBe('length');
      expect(runsAcross(rabbetId).value).toBe('length');
    });

    it('one click re-stores it the sheet\'s way, and one undo puts it back', async () => {
      const { id, housingId } = seedSide();
      const before = useStore.getState().past.length;
      await userEvent.click(screen.getByRole('button', { name: 'Match the cut list' }));
      expect(runsAcross(housingId).value).toBe('width');
      expect(screen.queryByText(note)).not.toBeInTheDocument();
      const stored = useStore.getState().doc.boards.find((b) => b.id === id)!.cuts.find((c) => c.id === housingId)!;
      expect(stored).toMatchObject({ across: 'width', offset: 24, width: 0.75, stopMin: 0.25, stopMax: 0.75 });
      expect(useStore.getState().past.length).toBe(before + 1);
      act(() => { useStore.getState().undo(); });
      expect(runsAcross(housingId).value).toBe('length');
      expect(screen.getAllByText(note)).toHaveLength(1);
    });

    it('shows nothing for a tenon shoulder stored sideways', () => {
      const id = renderWithBoard();
      // Two cheeks at the length's min end, each stored across the LENGTH (stops 0 / 23)
      // instead of across the width: the same boxes as the cheeks in the fu 180 test above.
      const cheek = (cid: string, from: 'min' | 'max') => ({ id: cid, face: 'thickness' as const, from, across: 'length' as const, offset: 0, width: 5.5, depth: 0.25, stopMin: 0, stopMax: 23 });
      act(() => {
        const st = useStore.getState();
        st.addCut(id);
        st.addCut(id);
        const [c1, c2] = useStore.getState().doc.boards[0].cuts;
        st.updateCut(id, c1.id, cheek(c1.id, 'min'));
        st.updateCut(id, c2.id, cheek(c2.id, 'max'));
      });
      expect(screen.getAllByText('tenon shoulder')).toHaveLength(2);
      expect(screen.queryByText(/The cut list reads this cut/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Match the cut list' })).not.toBeInTheDocument();
    });

    it('shows nothing for a cut that removes nothing', () => {
      const { id } = seedSide();
      act(() => { useStore.getState().updateBoard(id, { length: 20 }); });
      // The housing now starts past the board's end (offset 24 along a 20" length): it removes nothing.
      expect(screen.queryByText(/The cut list reads this cut/)).not.toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/panels/Properties.test.tsx`
Expected: the first two new tests FAIL (no note, no button). The last two pass vacuously until Step 3; their job is to catch an over-wide condition, which Step 5 mutates.

- [ ] **Step 3: Implement**

In `src/panels/Properties.tsx`:
1. Add `cutShape, storedAsShape` to the import from `'../document/document'`, and drop `cutLabel` from it if it becomes unused.
2. In `CutRow`, replace the `word` line with:
   ```tsx
   const tenon = findTenons(board).some((t) => t.cutIds.includes(cut.id));
   const shape = cutShape(board, cut, solids);
   const word = tenon ? 'tenon shoulder' : shape.word;
   // Cut-storage spec §3.3: offered only where the sheet prints THIS cut's own
   // line (not a tenon's shoulder) and reads it running the other way.
   const sideways = !tenon && !cutRemovesNothing(board, cut) && cut.across !== shape.run;
   ```
3. Directly after the existing `cutRemovesNothing(...) && (<p className="field-note" …>)` block, add:
   ```tsx
   {sideways && (
     <div className="field-note">
       <p>The cut list reads this cut as running across the {shape.run}.</p>
       <button onClick={() => set(storedAsShape(board, cut, solids))}>Match the cut list</button>
     </div>
   )}
   ```
   `set` takes `Partial<Cut>`, and a whole `Cut` with the same `id` is a valid patch. It runs the row's refusals, which a same-geometry patch never trips, and makes ONE `updateCut`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/panels/Properties.test.tsx`, then `npm test` and `npm run build`.
Expected: PASS, build clean.

- [ ] **Step 5: Mutate**

Each must turn a test red; revert after each:
1. `const sideways = cut.across !== shape.run;` (drop both exclusions; the tenon test must catch it).
2. `const sideways = !tenon && cut.across !== shape.run;` (drop the removes-nothing guard; the last test must catch it. If it survives because the housing's run happens to equal `across` once it removes nothing, change that test's board edit until the guard is the only thing hiding the note, and say so in the report).
3. Button applies `set({ ...storedAsShape(board, cut, solids), across: cut.across })`.
4. Note shown unconditionally.

- [ ] **Step 6: Commit**

```bash
git add src/panels/Properties.tsx src/panels/Properties.test.tsx
git commit -m "feat(properties): a sideways-stored cut offers 'Match the cut list' (fu 195)"
```

---

### Task 4: Docs

**Files:**
- Modify: `docs/follow-ups.md` (entries 195 and 196, near the end under "## From the cut lines round — 2026-10-04")
- Modify: `CLAUDE.md` (the `cuts.ts` and `pocket.ts` entries in "Where things live"; invariant 41)

- [ ] **Step 1: Close 195 and 196**

Replace each entry's `- **Status:** …` line:
- **195:** `- **Status:** CLOSED 2026-10-04 by the cut storage round, the user's ruling: joinery stores every cut the way the sheet reads it (\`pocketFor\` → \`storedAsShape\`), and a row stored the other way shows "The cut list reads this cut as running across the …" with a one-click **Match the cut list** (one undo step, same stock removed). No load-time rewrite.`
- **196:** `- **Status:** CLOSED 2026-10-04 by the cut storage round, the user's ruling: on an exact tie a cut runs along the direction with exactly one open end, else length, width, thickness. \`runAxis\` no longer reads the stored \`across\`.`

- [ ] **Step 2: CLAUDE.md**

- **`cuts.ts` entry:** after the `cutShape` sentence, add: `\`storedAsShape\` re-stores a sideways cut with across = its run (same stock; an already-aligned cut comes back as the same object, so no float noise splits rows). The run never reads the stored across, square ties included (fu 196).` Keep the fenced tree's `│   │` prefix, the continuation indent and the ~92-char wrapping.
- **`pocket.ts` entry:** add `then stores it the way the sheet reads it (\`storedAsShape\`, fu 195)`.
- **Invariant 41:** after "takes `across` as the dimension with the most boundary contact (order alone mislabelled a stopped dado a "notch")", add one sentence: "That choice is then re-stored through `storedAsShape`, against the board WITH its existing cuts, so a joined cut's stored `across` is the direction the cut sheet prints (fu 195)."

The rounds row, Status and test counts are done at merge, not here.

- [ ] **Step 3: Commit**

```bash
git add docs/follow-ups.md CLAUDE.md
git commit -m "docs: cut storage — close 195, 196; storedAsShape in the index and invariant 41"
```
