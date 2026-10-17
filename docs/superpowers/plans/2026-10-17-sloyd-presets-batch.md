# Presets batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Taper two/four faces shortcuts (fu 278), a two-leg Chamfer row and a Raised panel preset (fu 298), and a
Kind select on curve rows (fu 367). There is no schema change.

**Architecture:** Every new behaviour is a pure writer in `src/document/` (`angleCuts.ts`, `curves.ts`), re-exported through
`document.ts` and called from the existing rows in `src/panels/AngleCuts.tsx` and `src/panels/Curves.tsx`. All of them use the
store actions the rows already use (`addAngleCuts`, `updateAngleCut`, `updateCurve`). No store, geometry, drawing or schema
code changes.

**Tech Stack:** TypeScript, React, Zustand, Vitest + Testing Library. `npm run build` is the typecheck gate.

**Spec:** `docs/superpowers/specs/2026-10-17-sloyd-presets-batch-design.md` (approved 2026-10-17). Read it before each task.

## Global Constraints

- `CURRENT_VERSION` stays **17**. No field is added to any stored type.
- Stored values are exact inches (inv 25). There is no rounding in any writer.
- Refuse, never clamp (`DimensionField` min/max; a row's refusal leaves the stored value).
- **A preset whose default would be refused on this part is withheld**, not added and then refused. A select option that
  would be refused is `disabled`.
- **Every multi-cut preset is ONE `addAngleCuts` call**, so it is one undo entry.
- **The existing curve presets (`defaultArch`, `defaultNotch`, `defaultBow`, `defaultCorner`, `defaultCorners`) stay
  byte-identical**, key order included.
- The rows of `AngleCuts.tsx` keep every hook above every `kind` branch.
- The viewport has no unit tests by design; Task 6 checks it in a real browser.
- Commit to `master` on a branch `presets-batch`, merged locally with `--no-ff` at the end. No pull requests.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Metric projects.** The leg fields and the bench lines of a Raised panel show mm; the preset still stores 1-1/2" and
   1/4" as exact inches. Pinned in Task 3, Step 1 (metric test).
2. **A panel exactly 1/2" thick** is offered the preset (the bevel is 1/4" deep); one under 1/2" is not. Pinned in Task 3,
   Step 1 (boundary pair).
3. **A kind change that puts an existing hole into the new waste** is disabled, not stored. Pinned in Task 5, Step 1.
4. **Undo after a kind change** restores the old curve with the SAME id, in one entry. Pinned in Task 5, Step 1.
5. **A chamfer leg pushed past its part by a resize** can be reduced but not deepened, and an edit of one leg never touches
   the other. Pinned in Task 2, Step 1.

---

### Task 0: Branch

- [ ] **Step 1:** Create the branch.

```bash
cd /home/alec/docker/sloyd && git checkout -b presets-batch && npm test 2>&1 | tail -3
```

Expected: the suite passes (4694 tests across 161 files at the time of writing). Record the count.

---

### Task 1: Taper two / four faces (fu 278)

**Files:**
- Modify: `src/document/angleCuts.ts` (after `defaultTaper`, ~line 209)
- Modify: `src/document/document.ts:34-35` (re-exports)
- Modify: `src/panels/AngleCuts.tsx` (the `+ Add ▾` items)
- Test: `src/document/angleCuts.test.ts`, `src/panels/AngleCuts.test.tsx`

**Interfaces:**
- Produces: `TaperFace = { face: 'width' | 'thickness'; from: CutFrom }`, `TAPER_TWO: readonly TaperFace[]`,
  `TAPER_FOUR: readonly TaperFace[]`, `defaultTaperFaces(board: Pick<Board, Dimension>, faces: readonly TaperFace[]): Omit<AngleCut, 'id'>[]`.

- [ ] **Step 1: Write the failing document test.** Append to `src/document/angleCuts.test.ts`, adding the new names to its
  imports from `./angleCuts` and `createBoard` from `./document` if they are not already imported:

```ts
describe('defaultTaperFaces (fu 278)', () => {
  const sq = createBoard({ length: 28, width: 2, thickness: 2 });
  it('four faces: one taper per face, same amount, from the min end over the last quarter', () => {
    const cs = defaultTaperFaces(sq, TAPER_FOUR);
    expect(cs.map((c) => `${c.face}|${c.from}`)).toEqual(['width|min', 'width|max', 'thickness|min', 'thickness|max']);
    for (const c of cs) {
      expect(c).toEqual(taperCut({ face: c.face as 'width' | 'thickness', from: c.from, end: 'min', start: 21, amount: 0.5 }));
    }
  });
  it('two faces: the adjacent min faces (a leg\'s inside faces)', () => {
    expect(defaultTaperFaces(sq, TAPER_TWO).map((c) => `${c.face}|${c.from}`)).toEqual(['width|min', 'thickness|min']);
  });
  it('one amount for every face, from the thinner cross dimension', () => {
    const cs = defaultTaperFaces(createBoard({ length: 28, width: 2, thickness: 1 }), TAPER_FOUR);
    expect(new Set(cs.map((c) => c.points[0]![1]))).toEqual(new Set([0.25]));
  });
});
```

- [ ] **Step 2: Run it.** `npx vitest run src/document/angleCuts.test.ts`. Expected: FAIL (`defaultTaperFaces` is not
  exported).

- [ ] **Step 3: Implement.** In `src/document/angleCuts.ts`, directly after `defaultTaper`:

```ts
/** One face a taper shortcut slopes (fu 278). */
export interface TaperFace { face: 'width' | 'thickness'; from: CutFrom }
/** A leg's two inside faces: adjacent, both min. */
export const TAPER_TWO: readonly TaperFace[] = [{ face: 'width', from: 'min' }, { face: 'thickness', from: 'min' }];
export const TAPER_FOUR: readonly TaperFace[] = [
  { face: 'width', from: 'min' }, { face: 'width', from: 'max' }, { face: 'thickness', from: 'min' }, { face: 'thickness', from: 'max' },
];

/** The taper shortcuts (fu 278): one plain taper per face, each from the min end over ¾ of the length, ONE amount — a
 *  quarter of the thinner cross dimension — so a square leg stays square. Independent rows; no linked edit. */
export function defaultTaperFaces(board: Pick<Board, Dimension>, faces: readonly TaperFace[]): Omit<AngleCut, 'id'>[] {
  const amount = Math.min(board.width, board.thickness) / 4;
  return faces.map(({ face, from }) => taperCut({ face, from, end: 'min', start: board.length * 0.75, amount }));
}
```

  In `src/document/document.ts` line 34, add `TAPER_FOUR, TAPER_TWO, defaultTaperFaces` to the `./angleCuts` export list, and
  add `TaperFace` to the type export on line 35.

- [ ] **Step 4: Run it.** `npx vitest run src/document/angleCuts.test.ts`. Expected: PASS.

- [ ] **Step 5: Write the failing panel test.** Append inside `describe('the Angles section', …)` in
  `src/panels/AngleCuts.test.tsx`:

```ts
  it('Taper four faces adds four rows in one undo entry; Taper two faces adds two (fu 278)', async () => {
    const user = userEvent.setup();
    open(leg());
    const before = useStore.getState().past.length;
    await addMenu(user, 'Taper four faces');
    expect(cuts().map((c) => `${c.face}|${c.from}`)).toEqual(['width|min', 'width|max', 'thickness|min', 'thickness|max']);
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(screen.getAllByLabelText('Starts')).toHaveLength(4);
    act(() => useStore.getState().undo());
    expect(cuts()).toEqual([]);
    await addMenu(user, 'Taper two faces');
    expect(cuts().map((c) => `${c.face}|${c.from}`)).toEqual(['width|min', 'thickness|min']);
  });
```

- [ ] **Step 6: Run it.** `npx vitest run src/panels/AngleCuts.test.tsx`. Expected: FAIL (no such menu item).

- [ ] **Step 7: Implement the menu.** In `src/panels/AngleCuts.tsx`, add `TAPER_FOUR, TAPER_TWO, defaultTaperFaces` to the
  `../document/document` import, and insert after the `Taper` item:

```tsx
          { label: 'Taper two faces', detail: "Slope two adjacent faces (a leg's inside faces)", run: () => addAngleCuts(board.id, defaultTaperFaces(board, TAPER_TWO)) },
          { label: 'Taper four faces', detail: 'Slope all four faces along the length', run: () => addAngleCuts(board.id, defaultTaperFaces(board, TAPER_FOUR)) },
```

  These have no withhold guard. Spec §2: the amount is at most a quarter of either cross dimension, so it is never refused on a
  storable part. Do not add a guard for it.

- [ ] **Step 8: Run it and mutate.** `npx vitest run src/panels/AngleCuts.test.tsx`. Expected: PASS. Then make two mutations,
  each with its own expected result:
  1. Replace the four-faces `run` with one `addAngleCuts` call per cut, inside a loop. Expected: the undo-count assertion fails.
  2. Change `amount` to `board.width / 4`. Expected: the "thinner cross dimension" document test fails.

  Revert both mutations.

- [ ] **Step 9: Commit.**

```bash
git add src/document/angleCuts.ts src/document/angleCuts.test.ts src/document/document.ts src/panels/AngleCuts.tsx src/panels/AngleCuts.test.tsx
git commit -m "presets batch: Taper two faces / Taper four faces (fu 278)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Two chamfer leg fields (fu 298, spec §3.1)

**Files:**
- Modify: `src/panels/AngleCuts.tsx` (the chamfer branch: the `Size` `DimensionField`)
- Test: `src/panels/AngleCuts.test.tsx` (two existing tests use `getByLabelText('Size')`; they are updated here)

**Interfaces:**
- Consumes: `ChamferFields` (`legFace` is measured along `face`, `legAlong` along `along`, the bench line's own words in
  `angleText.ts`: "`legFace` into the `face` × `legAlong` into the `along`"), and `chamferCut` (points
  `[[0, legFace], [legAlong, 0]]`).
- Produces: field labels `Into the <face>` and `Into the <along>` (for example `Into the width`, `Into the thickness`).
  Task 3's test reads them.

- [ ] **Step 1: Write the failing tests.** In `src/panels/AngleCuts.test.tsx`, add `import { formatLength } from '../units/length';`.
  Inside `describe('bevels and chamfers in the Angles section (chunk 3)', …)`, replace the test
  `'edits a chamfer edge and size; refuses a size past the thinner face (Review Focus 3)'` with:

```ts
  it('edits a chamfer edge and each leg; refuses a leg past its face (Review Focus 3)', async () => {
    const user = userEvent.setup();
    open(plank());
    await addMenu(user, 'Chamfer');
    await user.selectOptions(screen.getByLabelText('Edge'), 'Width min side · thickness max side');
    expect(cuts()[0]).toMatchObject({ face: 'width', from: 'min', along: 'thickness', alongFrom: 'max' });
    const wide = screen.getByLabelText('Into the width');
    await user.clear(wide); await user.type(wide, '1-1/2{Enter}');
    expect(cuts()[0]!.points).toEqual([[0, 1.5], [0.125, 0]]);              // only its own leg
    const deep = screen.getByLabelText('Into the thickness');
    await user.clear(deep); await user.type(deep, '1/2{Enter}');
    expect(cuts()[0]!.points).toEqual([[0, 1.5], [0.5, 0]]);
    await user.clear(deep); await user.type(deep, '1{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Must be at most 3/4"');
    expect(cuts()[0]!.points).toEqual([[0, 1.5], [0.5, 0]]);
  });
  it('an unequal chamfer shows both legs — no mixed field (fu 298)', () => {
    const b = plank();
    open({ ...b, angleCuts: [{ id: 'c1', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 1.5, legAlong: 0.5 }, b) }] });
    expect(screen.getByLabelText('Into the width')).toHaveValue(formatLength(1.5, 'in'));
    expect(screen.getByLabelText('Into the thickness')).toHaveValue(formatLength(0.5, 'in'));
  });
  it('a leg a resize pushed past its part may be reduced, never deepened, and the other leg is untouched (fu 296)', async () => {
    const user = userEvent.setup();
    chamferOn(plank({ width: 3, thickness: 0.75 }), { face: 'width', from: 'max', along: 'thickness', alongFrom: 'max' }, 0.5);
    act(() => useStore.getState().updateBoard('leg', { thickness: 0.4 }));     // the thickness leg: 0.1 over
    const deep = screen.getByLabelText('Into the thickness');
    await user.clear(deep); await user.type(deep, '0.45{Enter}');           // still over, but less: allowed
    expect(cuts()[0]!.points).toEqual([[0, 0.5], [0.45, 0]]);
    await user.clear(deep); await user.type(deep, '0.6{Enter}');            // deeper than stored: refused
    expect(screen.getByRole('alert')).toHaveTextContent('Must be at most');
    expect(cuts()[0]!.points).toEqual([[0, 0.5], [0.45, 0]]);
  });
```

  In the existing test `'keeps a chamfer editable after the part is resized below its legs'`, replace
  `expect(screen.getByLabelText('Size')).toBeInTheDocument();` with:

```ts
    expect(screen.getByLabelText('Into the width')).toBeInTheDocument();
    expect(screen.getByLabelText('Into the thickness')).toBeInTheDocument();
```

- [ ] **Step 2: Run them.** `npx vitest run src/panels/AngleCuts.test.tsx`. Expected: FAIL (no field labelled `Into the
  width`).

- [ ] **Step 3: Implement.** In the chamfer branch of `src/panels/AngleCuts.tsx`, replace the single `Size` `DimensionField`
  with:

```tsx
          {/* fu 298: one field per leg, each its own stored value (never a mixed field), labelled as the bench line words
              it. A leg a resize pushed past its dimension may be reduced, never deepened (fu 296): the max is the larger of
              the dimension and the stored leg. */}
          <DimensionField label={`Into the ${chamfer.face}`} units={units}
            value={chamfer.legFace} max={Math.max(board[chamfer.face], chamfer.legFace)}
            onCommit={(v) => setC({ legFace: v })} />
          <DimensionField label={`Into the ${chamfer.along}`} units={units}
            value={chamfer.legAlong} max={Math.max(board[chamfer.along], chamfer.legAlong)}
            onCommit={(v) => setC({ legAlong: v })} />
```

  Leave the Edge select's refusal text (`… reduce the size first.`) unchanged. The existing edge-change tests pin it.

- [ ] **Step 4: Run them.** `npx vitest run src/panels/AngleCuts.test.tsx`. Expected: PASS.

- [ ] **Step 5: Mutate.** Make three mutations, each with its own expected result:
  1. Set both fields' `max` back to `board[dim]`. Expected: the "may be reduced" test fails at `0.45`.
  2. Make the second field write `{ legFace: v, legAlong: v }`. Expected: the "only its own leg" assertion fails.
  3. Pass `value={null}` to the first field. Expected: the unequal-chamfer test fails.

  Revert all three.

- [ ] **Step 6: Commit.**

```bash
git add src/panels/AngleCuts.tsx src/panels/AngleCuts.test.tsx
git commit -m "presets batch: the Chamfer row edits each leg (fu 298)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Raised panel preset (fu 298, spec §3.2)

**Files:**
- Modify: `src/document/angleCuts.ts` (after `defaultChamfer`, end of file)
- Modify: `src/document/document.ts:34` (re-export)
- Modify: `src/panels/AngleCuts.tsx` (menu item)
- Test: `src/document/angleCuts.test.ts`, `src/panels/AngleCuts.test.tsx`

**Interfaces:**
- Consumes: `chamferCut`, `angleLine` (`./angleText`), and the field labels from Task 2.
- Produces: `defaultRaisedPanel(board: Pick<Board, Dimension>): Omit<AngleCut, 'id'>[] | null`.

- [ ] **Step 1: Write the failing document tests.** Append to `src/document/angleCuts.test.ts`, importing
  `defaultRaisedPanel`, `chamferCut` and `angleCutRemovesNothing` from `./angleCuts`, `angleLine` from `./angleText`, and
  `formatLength` from `../units/length`:

```ts
describe('defaultRaisedPanel (fu 298)', () => {
  const panel = createBoard({ length: 20, width: 12, thickness: 0.75 });
  it('four chamfers on the thickness max face: 1-1/2" into the face, a 1/4" tongue', () => {
    const cs = defaultRaisedPanel(panel)!;
    const at = (face: 'width' | 'length', from: 'min' | 'max') =>
      chamferCut({ face, from, along: 'thickness', alongFrom: 'max', legFace: 1.5, legAlong: 0.5 }, panel);
    expect(cs).toEqual([at('width', 'min'), at('width', 'max'), at('length', 'min'), at('length', 'max')]);
    for (const c of cs) expect(angleCutRemovesNothing(panel, { id: 'x', ...c })).toBe(false);
    expect(angleLine(panel, { id: 'x', ...cs[0]! }, 'in'))
      .toContain(`${formatLength(1.5, 'in')} into the width × ${formatLength(0.5, 'in')} into the thickness`);
  });
  it('the face leg is capped at a quarter of the narrower in-face side', () => {
    const cs = defaultRaisedPanel(createBoard({ length: 4, width: 3, thickness: 0.75 }))!;
    expect(cs.every((c) => c.points[0]![1] === 0.75)).toBe(true);
  });
  it('offered at exactly 1/2" thick (a 1/4" bevel), withheld under it', () => {
    expect(defaultRaisedPanel(createBoard({ length: 20, width: 12, thickness: 0.5 }))![0]!.points).toEqual([[0, 1.5], [0.25, 0]]);
    expect(defaultRaisedPanel(createBoard({ length: 20, width: 12, thickness: 0.49 }))).toBeNull();
  });
});
```

  Before relying on it, check the `angleCutRemovesNothing` signature in `angleCuts.ts`. If it takes `(board, cut)` with a
  full `AngleCut`, the `{ id: 'x', ...c }` form is right; otherwise adapt the call and leave the assertion's meaning unchanged.

- [ ] **Step 2: Run them.** `npx vitest run src/document/angleCuts.test.ts`. Expected: FAIL (not exported).

- [ ] **Step 3: Implement.** Append to `src/document/angleCuts.ts`:

```ts
/** The "Raised panel" preset (fu 298, presets-batch spec §3.2): the four edges of the thickness max face (the panel's
 *  front) chamfered with UNEQUAL legs — 1-1/2" into the face (at most ¼ of the narrower in-face side), leaving a 1/4"
 *  tongue at the edge. The four planes meet on the corner diagonals (each body is an intersection of half-spaces), so the
 *  mitred corners need no geometry of their own. Null under 1/2" thick: the bevel would be under 1/4" deep. Canonical rows,
 *  `face` before `along` (as CHAMFER_EDGES). */
export function defaultRaisedPanel(board: Pick<Board, Dimension>): Omit<AngleCut, 'id'>[] | null {
  if (board.thickness < 0.5) return null;
  const legFace = Math.min(1.5, Math.min(board.length, board.width) / 4);
  const legAlong = board.thickness - 0.25;
  const edges: [Dimension, CutFrom][] = [['width', 'min'], ['width', 'max'], ['length', 'min'], ['length', 'max']];
  return edges.map(([face, from]) => chamferCut({ face, from, along: 'thickness', alongFrom: 'max', legFace, legAlong }, board));
}
```

  Add `defaultRaisedPanel` to the `./angleCuts` export list in `src/document/document.ts`.

- [ ] **Step 4: Run them.** `npx vitest run src/document/angleCuts.test.ts`. Expected: PASS.

- [ ] **Step 5: Write the failing panel tests.** Append to `describe('bevels and chamfers in the Angles section (chunk 3)', …)`:

```ts
  it('Raised panel adds four unequal chamfers in one undo entry (fu 298)', async () => {
    const user = userEvent.setup();
    open(plank({ length: 20, width: 12 }));
    const before = useStore.getState().past.length;
    await addMenu(user, 'Raised panel');
    expect(cuts()).toHaveLength(4);
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(screen.getAllByLabelText('Into the thickness').map((el) => (el as HTMLInputElement).value))
      .toEqual(Array(4).fill(formatLength(0.5, 'in')));
  });
  it('withholds Raised panel under 1/2" thick', async () => {
    const user = userEvent.setup();
    open(plank({ thickness: 0.375 }));
    await user.click(screen.getByRole('button', { name: '+ Add' }));
    expect(screen.getByRole('button', { name: 'Chamfer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Raised panel' })).toBeNull();
  });
  it('a metric Raised panel stores exact inches and shows mm (Review Focus 1)', async () => {
    const user = userEvent.setup();
    open(plank({ length: 20, width: 12 }));
    act(() => useStore.getState().setUnitsDisplay('mm'));
    await addMenu(user, 'Raised panel');
    expect(cuts()[0]!.points).toEqual([[0, 1.5], [0.5, 0]]);
    expect(screen.getAllByLabelText('Into the width')[0]).toHaveValue(formatLength(1.5, 'mm'));
  });
```

  Check the units action's name in `src/store/store.ts` (`grep -n "setUnitsDisplay" src/store/store.ts`) and use it exactly.
  If it takes another argument shape, adapt the call, not the assertion.

  Before the first test, check which leg field the long edge's row labels `Into the width`. Edge (`width`, `thickness`) has
  `Into the width` and `Into the thickness`. The end rows (`length`, `thickness`) have `Into the length` and `Into the
  thickness`. So `Into the thickness` appears four times and `Into the width` twice. The assertions above rely on exactly
  that.

- [ ] **Step 6: Run them.** `npx vitest run src/panels/AngleCuts.test.tsx`. Expected: FAIL (no menu item).

- [ ] **Step 7: Implement the menu.** In `src/panels/AngleCuts.tsx`, import `defaultRaisedPanel`, compute
  `const raised = defaultRaisedPanel(board);` in `AngleCuts` above the `return`, and add after the `Chamfer` item:

```tsx
          // Withheld under 1/2" thick (spec §3.2): the 1/4" tongue would leave too shallow a bevel.
          ...(raised ? [{ label: 'Raised panel', detail: 'Bevel the four front edges, leaving a 1/4" tongue', run: () => addAngleCuts(board.id, raised) }] : []),
```

- [ ] **Step 8: Run and mutate.** `npx vitest run src/panels/AngleCuts.test.tsx src/document/angleCuts.test.ts`. Expected:
  PASS. Then make two mutations, each with its own expected result:
  1. Change `< 0.5` to `<= 0.5`. Expected: the exactly-1/2" test fails.
  2. Drop the `Math.min(…, /4)` cap. Expected: the small-panel test fails.

  Revert both.

- [ ] **Step 9: Commit.**

```bash
git add src/document/angleCuts.ts src/document/angleCuts.test.ts src/document/document.ts src/panels/AngleCuts.tsx src/panels/AngleCuts.test.tsx
git commit -m "presets batch: the Raised panel preset (fu 298)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `curveAs`, with the curve presets on generalised helpers (fu 367, spec §4)

**Files:**
- Modify: `src/document/curves.ts` (the presets block, ~lines 677–708, and a new block after `deriveCurveKind`)
- Modify: `src/document/document.ts:42-43` (re-exports)
- Test: `src/document/curves.test.ts`

**Interfaces:**
- Produces:
  - `CurvePlacement = { through: Dimension; along: Dimension; side: CutFrom; from: CutFrom }`
  - `CurveKindChoice = 'arch' | 'notch' | 'bow' | 'corner'`
  - `curveKindChoice(c: Omit<CurveCut, 'id'>): CurveKindChoice | null`
  - `curvePlacement(c: Omit<CurveCut, 'id'>): CurvePlacement | null`
  - `curveAs(kind: CurveKindChoice, c: Omit<CurveCut, 'id'>, b: Pick<Board, Dimension>): Omit<CurveCut, 'id'> | null`

- [ ] **Step 1: Pin the presets byte-identical first.** Append to `describe('presets (spec §8)', …)` in
  `src/document/curves.test.ts`, BEFORE touching `curves.ts`:

```ts
  it('presets are byte-identical across the helper refactor (presets-batch spec §4)', () => {
    const pins = [apron, top, createBoard({ length: 3, width: 2, thickness: 0.75 }), createBoard({ length: 6, width: 5, thickness: 0.75 })]
      .map((b) => JSON.stringify([defaultArch(b), defaultNotch(b), defaultBow(b), defaultCorner(b), defaultCorners(b)]));
    expect(pins).toMatchInlineSnapshot();
  });
```

  Run `npx vitest run src/document/curves.test.ts -u` once, so Vitest writes the inline snapshot from TODAY's code. Check
  that the written strings contain `"through":"thickness"` and the expected numbers, then commit that test on its own:

```bash
git add src/document/curves.test.ts
git commit -m "test: pin the curve presets' bytes before the helper refactor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the failing `curveAs` tests.** Append to `src/document/curves.test.ts`, adding `curveAs`,
  `curveKindChoice`, `curvePlacement`, `archCurve`, `bowCurve` and `cornerCurve` to the imports from `./curves`:

```ts
describe('curveAs: a kind change keeps placement, takes preset sizes (fu 367)', () => {
  const arch = archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 });
  const notch = archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 });
  const bow = bowCurve({ through: 'thickness', along: 'length', side: 'max', span: 30, rise: 0.5 });
  const corner = cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'min', radius: 1 });
  it('reads the kind, a notch being an arch at rise = span / 2', () => {
    expect([arch, notch, bow, corner].map(curveKindChoice)).toEqual(['arch', 'notch', 'bow', 'corner']);
  });
  it('reads placement; a corner maps u to along, its v flag to side, its u flag to from', () => {
    expect(curvePlacement(bow)).toEqual({ through: 'thickness', along: 'length', side: 'max', from: 'min' });
    expect(curvePlacement(corner)).toEqual({ through: 'thickness', along: 'length', side: 'min', from: 'max' });
  });
  it('arch → bow / corner; arch → notch keeps start and span', () => {
    expect(curveAs('bow', arch, apron)).toEqual(bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }));
    expect(curveAs('corner', arch, apron)).toEqual(cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }));
    expect(curveAs('notch', arch, apron)).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 12 }));
  });
  it('notch → arch keeps start and span, rise = span / 4', () => {
    expect(curveAs('arch', notch, apron)).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 0.5 }));
  });
  it('bow → arch / notch on its own side, from the min end', () => {
    expect(curveAs('arch', bow, apron)).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'max', from: 'min', start: 3, span: 24, rise: 1.25 }));
    expect(curveAs('notch', bow, apron)).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'max', from: 'min', start: 14, span: 2, rise: 1 }));
  });
  it('corner → arch → corner round-trips its flags (stored, never re-derived)', () => {
    const a = curveAs('arch', corner, apron)!;
    expect(a).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'max', start: 3, span: 24, rise: 1.25 }));
    expect(curveAs('corner', a, apron)).toEqual(corner);
    expect(curveAs('bow', corner, apron)).toEqual(bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }));
  });
  it('keeps another through and an along on v', () => {
    const b = createBoard({ length: 30, width: 0.75, thickness: 5 });
    const v = archCurve({ through: 'width', along: 'thickness', side: 'min', from: 'min', start: 1, span: 3, rise: 1 });
    expect(curveAs('bow', v, b)).toEqual(bowCurve({ through: 'width', along: 'thickness', side: 'min', span: 5, rise: 0.5 }));
  });
  it('the same kind is the curve itself; null when the target cannot be built or the source is unrepresentable', () => {
    expect(curveAs('arch', arch, apron)).toEqual(arch);
    expect(curveAs('arch', bow, createBoard({ length: 6, width: 5, thickness: 0.75 }))).toBeNull();      // no span left
    expect(curveAs('notch', bow, createBoard({ length: 1.5, width: 5, thickness: 0.75 }))).toBeNull();
    const odd: Omit<CurveCut, 'id'> = { through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0],
      segments: [{ type: 'line', to: [2, 0] }, { type: 'line', to: [0, 1] }, { type: 'line', to: [0, 0] }] };
    expect(curveAs('bow', odd, apron)).toBeNull();
  });
});
```

- [ ] **Step 3: Run them.** `npx vitest run src/document/curves.test.ts`. Expected: FAIL (not exported); the snapshot test
  passes.

- [ ] **Step 4: Implement.** In `src/document/curves.ts`, replace the presets block (from the `// ── Presets` comment through
  `defaultCorners`) with:

```ts
// ── Presets (spec §8): the Properties menu's defaults, through the canonical writers above. Each rule is written once,
//    at a PLACEMENT (presets-batch spec §4), so a kind change (`curveAs`) and the menu share it; the menu's placement is
//    `PRESET`, which reproduces the curves round's presets byte for byte.

/** Where a curve sits: cut through `through`, on the `side` edge of the in-face dimension that is not `along`, measured
 *  from `along`'s `from` end. */
export interface CurvePlacement { through: Dimension; along: Dimension; side: CutFrom; from: CutFrom }
const PRESET: CurvePlacement = { through: 'thickness', along: 'length', side: 'min', from: 'min' };
const otherOf = (p: CurvePlacement): Dimension => uvDims(p.through).find((d) => d !== p.along)!;

/** Arch: 3" in from each `along` end, rise min(1-1/2", ¼ of the other dimension). Null when no span is left. */
function archAt(b: Pick<Board, Dimension>, p: CurvePlacement): Omit<CurveCut, 'id'> | null {
  const span = b[p.along] - 6;
  if (span <= 0) return null;
  return archCurve({ ...p, start: 3, span, rise: Math.min(1.5, b[otherOf(p)] / 4) });
}
/** Half-round notch: 2" wide (rise 1), centred along `along`. Null when `along` is under 2". */
function notchAt(b: Pick<Board, Dimension>, p: CurvePlacement): Omit<CurveCut, 'id'> | null {
  if (b[p.along] < 2) return null;
  return archCurve({ ...p, start: b[p.along] / 2 - 1, span: 2, rise: 1 });
}
/** Bow: the whole `side` edge, rise min(1/2", ¼ of the other dimension) (P2: written at the edge's length). */
function bowAt(b: Pick<Board, Dimension>, p: CurvePlacement): Omit<CurveCut, 'id'> {
  return bowCurve({ through: p.through, along: p.along, side: p.side, span: b[p.along], rise: Math.min(0.5, b[otherOf(p)] / 4) });
}
const cornerRadius = (b: Pick<Board, Dimension>, through: Dimension) => { const [u, v] = uvDims(through); return Math.min(1, Math.min(b[u], b[v]) / 4); };
/** Rounded corner: the corner at `along`'s `from` end and the other dimension's `side`. */
function cornerAt(b: Pick<Board, Dimension>, p: CurvePlacement): Omit<CurveCut, 'id'> {
  const [u] = uvDims(p.through);
  const onU = p.along === u;
  return cornerCurve({ through: p.through, uFrom: onU ? p.from : p.side, vFrom: onU ? p.side : p.from, radius: cornerRadius(b, p.through) });
}

/** "Arch": through the thickness, on the min side of the in-face dimension that is not the length, 3" in from each
 *  length end, rise min(1-1/2", ¼ of that dimension). Null when no span is left. */
export function defaultArch(b: Pick<Board, Dimension>): Omit<CurveCut, 'id'> | null { return archAt(b, PRESET); }
/** "Half-round notch": 2" wide (rise 1), centred along the length. Null on a part under 2" long. */
export function defaultNotch(b: Pick<Board, Dimension>): Omit<CurveCut, 'id'> | null { return notchAt(b, PRESET); }
/** "Bow": the whole width min side, rise min(1/2", ¼ of the width) (P2: written at the edge's length). */
export function defaultBow(b: Pick<Board, Dimension>): Omit<CurveCut, 'id'> { return bowAt(b, PRESET); }
/** "Rounded corner": the length-min / width-min corner. */
export function defaultCorner(b: Pick<Board, Dimension>): Omit<CurveCut, 'id'> { return cornerAt(b, PRESET); }
/** "Rounded corners": all four, one undo entry (the store's addCurves takes them together). */
export function defaultCorners(b: Pick<Board, Dimension>): Omit<CurveCut, 'id'>[] {
  const r = cornerRadius(b, 'thickness');
  return (['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => cornerCurve({ through: 'thickness', uFrom: uf, vFrom: vf, radius: r })));
}
```

  Then, directly after `deriveCurveKind`, add:

```ts
/** The kinds a curve row's Kind select offers (fu 367); a notch is an Arch at rise = span / 2 exactly (the row's label rule). */
export type CurveKindChoice = 'arch' | 'notch' | 'bow' | 'corner';
export function curveKindChoice(c: Omit<CurveCut, 'id'>): CurveKindChoice | null {
  const a = archFields(c);
  if (a) return a.rise === a.span / 2 ? 'notch' : 'arch';
  return bowFields(c) ? 'bow' : cornerFields(c) ? 'corner' : null;
}

/** A representable curve's placement (presets-batch spec §4): an Arch's own; a Bow's from the min end; a corner's u as
 *  `along`, its v flag as `side`, its u flag as `from`. Read off STORED flags, never re-derived (inv 44). */
export function curvePlacement(c: Omit<CurveCut, 'id'>): CurvePlacement | null {
  const a = archFields(c);
  if (a) return { through: a.through, along: a.along, side: a.side, from: a.from };
  const w = bowFields(c);
  if (w) return { through: w.through, along: w.along, side: w.side, from: 'min' };
  const k = cornerFields(c);
  if (k) return { through: k.through, along: uvDims(k.through)[0], side: k.vFrom, from: k.uFrom };
  return null;
}

/** `c` rewritten as `kind` (fu 367, presets-batch spec §4): placement kept, sizes from the kind's preset rule — except
 *  Arch ↔ Half-round notch, which keeps start and span (notch rise = span / 2, arch rise = span / 4). The same kind is `c`
 *  itself. Null when `c` is unrepresentable or the target cannot be built here. Decides no fault: the row judges it. */
export function curveAs(kind: CurveKindChoice, c: Omit<CurveCut, 'id'>, b: Pick<Board, Dimension>): Omit<CurveCut, 'id'> | null {
  const p = curvePlacement(c);
  if (!p) return null;
  const was = curveKindChoice(c);
  if (was === kind) return c;
  const a = archFields(c);
  if (kind === 'arch') return a ? archCurve({ ...a, rise: a.span / 4 }) : archAt(b, p);
  if (kind === 'notch') return a ? archCurve({ ...a, rise: a.span / 2 }) : notchAt(b, p);
  if (kind === 'bow') return bowAt(b, p);
  return cornerAt(b, p);
}
```

  In `curveAs`, `a` non-null with a different kind means `notch → arch` or `arch → notch`, which is exactly the
  span-keeping exception. `curveAs('arch', c)` returning `c` when `was === 'arch'` also covers arch → arch.

  The `curveAs('arch', arch, apron)` test expects `toEqual(arch)`, and returning `c` satisfies it. Note: if `c` carries an
  `id` at runtime (the row passes a `CurveCut`), the result does too. The row never stores the same-kind result (its option is
  the stored value), so this is harmless. Do not strip it.

  Add to `src/document/document.ts` line 42: `curveAs, curveKindChoice, curvePlacement`. Add to line 43: `CurveKindChoice,
  CurvePlacement`.

- [ ] **Step 5: Run.** `npx vitest run src/document/curves.test.ts`. Expected: PASS, the inline snapshot included and
  unchanged. If the snapshot differs, the refactor changed a preset; fix the helper. Do not update the snapshot.

- [ ] **Step 6: Mutate.** Make three mutations, each with its own expected result:
  1. In `cornerAt`, swap `onU ? p.from : p.side` for `onU ? p.side : p.from`. Expected: the round-trip test fails, and the
     snapshot fails.
  2. In `curveAs`, change `span / 4` to `span / 3`. Expected: the notch → arch test fails.
  3. In `curvePlacement`, give a Bow `from: 'max'`. Expected: the bow → arch test fails.

  Revert all three.

- [ ] **Step 7: Full suite and typecheck.** Run `npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3`. Expected: all pass,
  and the build succeeds.

- [ ] **Step 8: Commit.**

```bash
git add src/document/curves.ts src/document/curves.test.ts src/document/document.ts
git commit -m "presets batch: curveAs — a curve rewritten as another kind; presets on shared placement helpers (fu 367)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The Kind select on a curve row (fu 367, spec §4.1)

**Files:**
- Modify: `src/panels/Curves.tsx` (`CurveRowView`)
- Test: `src/panels/Curves.test.tsx`

**Interfaces:**
- Consumes: `curveAs`, `curveKindChoice`, `CurveKindChoice` from Task 4; the row's existing `refusalFor(board, curve, next,
  null)` and `set(next)`.

- [ ] **Step 1: Write the failing tests.** Append to `src/panels/Curves.test.tsx`, adding `cornerCurve` to the imports if it
  is missing and `import type { HoleRow } from '../document/document';`:

```ts
describe('the Kind select (fu 367)', () => {
  const kind = () => screen.getByLabelText('Kind') as HTMLSelectElement;
  it('shows the stored kind; a notch reads as Half-round notch', async () => {
    const user = userEvent.setup();
    open(apron());
    await add(user, 'Half-round notch');
    expect(kind().value).toBe('notch');
  });
  it('Arch → Bow keeps the id and placement, one undo entry; undo restores the arch (Review Focus 4)', async () => {
    const user = userEvent.setup();
    open(apron());
    await add(user, 'Arch');
    const stored = curves()[0]!;
    const before = useStore.getState().past.length;
    await user.selectOptions(kind(), 'Bow');
    expect(curves()[0]!.id).toBe(stored.id);
    expect(bowFields(curves()[0]!)).toEqual({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 });
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(kind().value).toBe('bow');
    act(() => useStore.getState().undo());
    expect(curves()[0]).toEqual(stored);
  });
  it('an option that would be refused is disabled (the notch from a 24" arch cuts through a 5" apron)', async () => {
    const user = userEvent.setup();
    open(apron());
    await add(user, 'Arch');
    expect(screen.getByRole('option', { name: 'Half-round notch' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Bow' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Arch' })).toBeEnabled();
  });
  it('an option that would put a hole into the new waste is disabled (Review Focus 3)', () => {
    // A through hole near the length-min end, 0.3" in from the width-min edge: clear of the Arch (it starts 3" in), inside
    // the Bow's waste there (the bow's edge at 1" from the end sits ~0.435" in).
    const hole: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 'through', along: 'length', alongFrom: 'min',
      station: 1, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.3 };
    const arch = { id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) };
    open(apron({ holes: [hole], curves: [arch] }));
    expect(screen.getByRole('option', { name: 'Bow' })).toBeDisabled();
  });
  it('a curve no row represents has no Kind select', () => {
    const odd: CurveCut = { id: 'c1', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0],
      segments: [{ type: 'line', to: [2, 0] }, { type: 'line', to: [0, 1] }, { type: 'line', to: [0, 0] }] };
    open(apron({ curves: [odd] }));
    expect(screen.queryByLabelText('Kind')).toBeNull();
  });
  it('a corner → Arch keeps its corner\'s end and side', async () => {
    const user = userEvent.setup();
    open(apron({ curves: [{ id: 'c1', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'min', radius: 1 }) }] }));
    await user.selectOptions(kind(), 'Arch');
    expect(archFields(curves()[0]!)).toEqual({ through: 'thickness', along: 'length', side: 'min', from: 'max', start: 3, span: 24, rise: 1.25 });
  });
});
```

  Before relying on the hole test, verify its premise directly. In a scratch test, run `holeFaults` on the apron with this
  hole and a Bow (`defaultBow(apron)`). It should report a `breaks-out` carrying `curve`, and with the Arch it should report
  none. If the premise fails, move `station`/`inset` until it holds, and note the numbers in the test comment. Do not weaken
  the assertion.

- [ ] **Step 2: Run them.** `npx vitest run src/panels/Curves.test.tsx`. Expected: FAIL (no `Kind` label).

- [ ] **Step 3: Implement.** In `src/panels/Curves.tsx`:
  - Add `curveAs, curveKindChoice` to the `../document/document` import, and `CurveKindChoice` to the type import.
  - At module level, after `HALF_CIRCLE`:

```tsx
const KIND_OPTIONS: { value: CurveKindChoice; label: string }[] = [
  { value: 'arch', label: 'Arch' }, { value: 'notch', label: 'Half-round notch' }, { value: 'bow', label: 'Bow' }, { value: 'corner', label: 'Rounded corner' },
];
```

  - In `CurveRowView`, after `const kind = deriveCurveKind(curve);`:

```tsx
  // fu 367: a kind change keeps the curve's placement and id and takes the new kind's preset sizes (`curveAs`). An option
  // whose result would be refused is disabled (the menu's withhold precedent); the change still goes through `set`, so a
  // stale render refuses in the row's own words and the select stays on the stored kind.
  const choice = curveKindChoice(curve);
  const kindSelect = choice && (
    <div className="field">
      <label htmlFor={`curve-kind-${curve.id}`}>Kind</label>
      <select id={`curve-kind-${curve.id}`} className="input" value={choice} onChange={(e) => {
        const next = curveAs(e.target.value as CurveKindChoice, curve, board);
        if (next) set(next);
      }}>
        {KIND_OPTIONS.map((o) => {
          const next = o.value === choice ? null : curveAs(o.value, curve, board);
          const ok = o.value === choice || (next !== null && refusalFor(board, curve, next, null) === null);
          return <option key={o.value} value={o.value} disabled={!ok}>{o.label}</option>;
        })}
      </select>
    </div>
  );
```

  - Make `{kindSelect}` the FIRST child of each of the three `field-grid` divs (arch, bow, corner branches), before
    `{throughSelect(…)}`.

  Note: `curveAs` returns `curve` itself (with its `id`) for the same kind, but that path never reaches `set`, since the
  stored option's change event cannot fire for its own value. If it does, `updateCurve`'s `sameCurve` check makes it a no-op.

- [ ] **Step 4: Run them.** `npx vitest run src/panels/Curves.test.tsx`. Expected: PASS.

- [ ] **Step 5: Mutate.** Make two mutations, each with its own expected result:
  1. Change `disabled={!ok}` to `disabled={false}`. Expected: both disabled tests fail.
  2. In `onChange`, call `updateCurve(board.id, curve.id, next)` directly, bypassing `set`, and drop the `disabled`. Expected:
     the hole test's selected Bow is stored. Use this to confirm that the `set` path is the guard: with `disabled` removed and
     `set` kept, `user.selectOptions(kind(), 'Bow')` leaves the curve unchanged and shows the alert `Puts hole 1 into the bow
     — move it first.` Add that as a temporary assertion, see it pass, then delete it.

  Revert both.

- [ ] **Step 6: Full suite and typecheck.** Run `npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3`. Expected: all pass,
  and the build succeeds.

- [ ] **Step 7: Commit.**

```bash
git add src/panels/Curves.tsx src/panels/Curves.test.tsx
git commit -m "presets batch: the Kind select on a curve row (fu 367)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Live pass, record, merge

**Files:**
- Create: `docs/browser-verification-presets-batch.md`
- Modify: `docs/follow-ups.md` (entries 278, 298, 367: append a closing `**Status:**` line)
- Modify: `docs/history.md` (the round's narrative)
- Modify: `CLAUDE.md` (Status bullet, Rounds-shipped row, Open follow-ups: delete 278 and 367 from the curves/angle-cut lists,
  and 298 likewise; bump the test count under Commands)
- Modify: `docs/superpowers/specs/2026-10-17-sloyd-presets-batch-design.md` (Status line: implemented, plan path)

- [ ] **Step 1: Dev server.** Run `npm run dev -- --port 5180` in the background. Drive the Playwright MCP browser; the user
  can watch. Use a NEW project created for this check. Never `localStorage.clear()`; delete only what this check created.

- [ ] **Step 2: Check, recording each finding as a DOM readout (and a screenshot under `docs/img/` where spatial).**
  1. A 2 × 2 × 28 leg with Taper four faces: four rows. In the viewport, the leg narrows to 1" square at the min end.
  2. A 20 × 12 × 3/4 panel with Raised panel: four rows. The viewport shows a flat field and mitred corner lines, with a 1/4"
     tongue at each edge. On the Plans sheet, the Front/Side/Plan views show the bevel lines and the corner diagonals. The
     part diagram shows the four chamfer notes. The cut list is unchanged by the cuts (stock, not remainder).
  3. Metric: switch the panel project to mm. The leg fields read whole mm, and the bench line reads mm.
  4. An Arch on an apron: Kind → Bow → Rounded corner → Arch. Each step keeps the row; Half-round notch is greyed while the
     arch is 24" wide.
  5. Delete the check's project. Confirm the project list is back to what it was before the check.

- [ ] **Step 3: Write the record.** In `docs/browser-verification-presets-batch.md`, record what was checked, what each check
  showed, and what software GL cannot confirm (the bevel's shading on real hardware). Add that as owed to the user's eye.

- [ ] **Step 4: Update the docs.**
  - `docs/follow-ups.md`: on 278, 298 and 367, append `**Status:** closed (presets batch, 2026-10-17).`
  - `docs/history.md`: one section for the round.
  - `CLAUDE.md`:
    - a Status bullet for presets batch: merged, not yet deployed, no schema change;
    - a Rounds-shipped row: `| presets batch | 10-17 | — | Taper two/four faces (fu 278); Chamfer row edits each leg, Raised panel preset (fu 298); Kind select on curve rows, curveAs (fu 367) |`;
    - remove 278, 298 and 367 from the Feature-sized list;
    - the new test count.
  - The spec's Status line: "implemented; plan `docs/superpowers/plans/2026-10-17-sloyd-presets-batch.md`".

- [ ] **Step 5: Merge.**

```bash
git add docs CLAUDE.md && git commit -m "docs: presets batch — live pass and record (fu 278, 298, 367)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git checkout master && git merge --no-ff presets-batch -m "Merge branch 'presets-batch': taper shortcuts, raised panel, curve kind (fu 278, 298, 367)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3 && git branch -d presets-batch
```

  Expected: the merged tree's tests and build pass.

- [ ] **Step 6: Deploy only on the user's go.** Deploying is a separate request, run per `DEPLOYMENT.local.md` and the
  deployment rule. Ask first.
