# Stopped Cuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a `Cut` can stop short of either end of its `across` dimension, so Sloyd can model blind and through mortises and stopped dados.

**Architecture:** `Cut` gains `stopMin` and `stopMax`, two required numbers, both 0 for a cut that runs fully across.
- `cutRegion` is the one place a cut becomes a box. Every geometry consumer reads that box.
- `buildDepthField` is the one consumer that rebuilds the box itself, so it is repointed at `cutRegion`.
- The schema goes 6 → 7 as a document-level step.
- Labels, the cut list signature and setup line, the diagram, snap points and the Properties row each learn about stops.

**Tech Stack:** React 19, TypeScript (strict), Vitest + Testing Library (globals, jsdom), Zustand.

**Spec:** `docs/superpowers/specs/2026-10-04-sloyd-stopped-cuts-design.md`. Read it; this plan argues from it.

## Global Constraints

- **Branch:** work on `stopped`, never on `master`. No pull requests.
- **Every commit** ends with the trailer
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **The gates:**
  - every task ends with `npm test` all green AND `npm run build` passing;
  - `npm test` does not typecheck, and `tsconfig.app.json` includes test files, so a test
    fixture missing a field fails `npm run build`, not `npm test`.
- **When an expectation looks wrong:**
  - never edit a test's expected value to make it pass. Fix the code;
  - if you believe a plan-supplied expectation is itself wrong, STOP and report it with your
    evidence. Do not "fix" it either way;
  - this ledger has caught plan-supplied code wrong more than ten times (CLAUDE.md).
- **Field names:** `stopMin`, `stopMax`. "Stopped" means `stopMin > 0 || stopMax > 0`,
  compared exactly, with no epsilon (invariant 18's reasoning: stored values the user typed).
- **Label strings, exact:** `dado`, `rabbet`, `stopped dado`, `stopped rabbet`, `mortise`,
  `through mortise`, `notch`.
- **UI strings, exact:**
  - field labels `Stop short of near end` and `Stop short of far end`;
  - error `That would leave no cut.`
- **Formatting:**
  - `panels/PartDiagram.tsx` formats nothing;
  - every label string is built in `document/diagram.ts` with `formatLength`
    (invariant 19, third clause).
- **No LLM changes.**
  - `generate/`, `llm/` and `designCheck.ts` are untouched;
  - `generated.ts` keeps `cuts: []`.

## Review Focus

1. **A board shortened under a stopped cut mid-session.** The stops can cross, so the region
   is empty.
   - Expected: nothing produces `NaN`, nothing throws, and the cut removes nothing.
   - Pinned in Task 1 (`cutRegion`, `boardSolids`) and Task 4 (a rendered diagram has no `NaN`
     attribute).
2. **Stops that sum to exactly the across length.**
   - Expected: refused in the loader (Task 1) and in Properties (Task 6). Equality is its own
     test case in both.
3. **A full-depth, full-width cut that stops short.**
   - Expected: legal, a slot leaving a bridge of wood, and neither dropped nor refused as
     "remove the whole board".
   - Pinned in Task 1 (loader) and Task 6 (Properties).
4. **Duplicating a board with a stopped cut keeps its stops.** Pinned in Task 1 (store).
5. **An undo that resolves a "leave no cut" refusal clears the stale error.** Pinned in Task 6.

**Spec clarification:** spec §7 names "`PartDiagram` / `SheetLayout` tests". `SheetLayout`
draws nested sheets and has no cuts, so only `PartDiagram` is involved.

---

### Task 1: The schema — `stopMin`/`stopMax`, `cutRegion`, validation, v7

**Files:**
- Modify: `src/document/types.ts` (the `Cut` interface and its doc comment)
- Modify: `src/document/cuts.ts` (`cutRegion` and its doc comment)
- Modify: `src/document/document.ts` (`CURRENT_VERSION` and its doc comment, `validateCuts`)
- Modify: `src/store/store.ts` (`addCut`)
- Modify: every test file with a `Cut`-typed literal (they fail `npm run build` once the fields
  are required)
- Test: `src/document/cuts.test.ts`, `src/document/document.test.ts`, `src/store/store.test.ts`

**Interfaces:**
- Produces: `Cut.stopMin: number`, `Cut.stopMax: number` (required).
- Produces: `cutRegion(board, cut)` returns the stopped box, or the all-zero region
  `{ length: [0, 0], width: [0, 0], thickness: [0, 0] }` when the stops cross.
- Produces: `CURRENT_VERSION === 7`.

- [ ] **Step 1: Add the fields to `Cut`**

In `src/document/types.ts`:

1. Replace the first paragraph of the `Cut` doc comment ("A rectangular through-cut …
   derived from the geometry (see cutLabel) rather than stored.") with:

```ts
/**
 * A rectangular cut: stock removed from a board. It runs across one of the
 * board's dimensions — fully, unless `stopMin`/`stopMax` stop it short of an
 * end. A dado is this cut taken in the middle of a face and a rabbet the same
 * cut taken at an edge; stopped at one end it is a stopped dado or rabbet, and
 * stopped at both a mortise (or a notch at an edge). The name is derived from
 * the geometry (see cutLabel) rather than stored.
```

   Keep the rest of the comment.

2. Add these two fields after `depth`:

```ts
  /**
   * How far short of the `across` dimension's MIN end the cut stops, in
   * inches. 0 means it runs out at that end. Same min/max words as `from`.
   */
  stopMin: number;
  /** How far short of the `across` dimension's MAX end the cut stops. 0 = runs out. */
  stopMax: number;
```

- [ ] **Step 2: Make every `Cut` literal compile**

Run `npm run build`. Every error is a `Cut` literal without the two fields:
- a test helper like `dado = (over) => ({ … })`;
- an inline `Cut` object;
- `addCut` in `src/store/store.ts`.

Fix each one by adding `stopMin: 0, stopMax: 0`. For `addCut`, put them after
`depth: board.thickness / 2,`.

Rules:
- Do NOT add them to raw objects passed to `migrateDocument`. Those are untyped on purpose.
- Do NOT touch anything else.

Repeat until `npm run build` passes, then run `npm test`; it must be all green.

- [ ] **Step 3: Write the failing `cutRegion` tests**

Append to `src/document/cuts.test.ts`. Reuse its existing imports, adding `stockProbe`,
`boardSolids` and `createBoard` if they are not already imported:

```ts
describe('cutRegion with stops', () => {
  const b = createBoard({ length: 24, width: 6, thickness: 1 });
  const base: Cut = {
    id: 'c', face: 'thickness', from: 'min', across: 'width',
    offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0,
  };
  const EMPTY = { length: [0, 0], width: [0, 0], thickness: [0, 0] };

  it('runs fully across when neither end is stopped', () => {
    expect(cutRegion(b, base).width).toEqual([0, 6]);
  });

  it('stops short of the min end', () => {
    expect(cutRegion(b, { ...base, stopMin: 1 }).width).toEqual([1, 6]);
  });

  it('stops short of the max end', () => {
    expect(cutRegion(b, { ...base, stopMax: 2 }).width).toEqual([0, 4]);
  });

  it('stops short of both ends — a mortise — and leaves the other two spans alone', () => {
    expect(cutRegion(b, { ...base, stopMin: 1, stopMax: 2 })).toEqual({
      length: [6, 6.75], width: [1, 4], thickness: [0, 0.25],
    });
  });

  it('clamps a negative stop to 0', () => {
    expect(cutRegion(b, { ...base, stopMin: -1 }).width).toEqual([0, 6]);
  });

  it('treats a non-finite stop as no stop, so no NaN can reach the grid', () => {
    expect(cutRegion(b, { ...base, stopMin: NaN, stopMax: Infinity }).width).toEqual([0, 6]);
  });

  it('removes nothing when the stops cross (a board shortened under its cut)', () => {
    const crossed: Cut = { ...base, stopMin: 4, stopMax: 3 };
    expect(cutRegion(b, crossed)).toEqual(EMPTY);
    const cutBoard = createBoard({ length: 24, width: 6, thickness: 1, cuts: [crossed] });
    expect(boardSolids(cutBoard)).toEqual(boardSolids(b));
    expect(stockProbe(cutBoard)({ length: 6.375, width: 3, thickness: 0.1 })).toBe(true);
  });

  it('removes nothing when the stops exactly meet', () => {
    expect(cutRegion(b, { ...base, stopMin: 3, stopMax: 3 })).toEqual(EMPTY);
  });

  it('leaves stock past a stopped end', () => {
    const stopped = createBoard({
      length: 24, width: 6, thickness: 1, cuts: [{ ...base, stopMax: 2 }],
    });
    const probe = stockProbe(stopped);
    // Inside the cut's footprint, just under the surface: removed.
    expect(probe({ length: 6.375, width: 2, thickness: 0.1 })).toBe(false);
    // Past the stop, same depth: still wood.
    expect(probe({ length: 6.375, width: 5, thickness: 0.1 })).toBe(true);
  });
});
```

- [ ] **Step 4: Run them to confirm they fail**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: the stop cases FAIL, because `cutRegion` ignores the stops. The "runs fully across"
case passes.

- [ ] **Step 5: Implement `cutRegion`**

In `src/document/cuts.ts`:

1. Add this module-level constant above `cutRegion`:

```ts
/** A region nothing is inside: `inside`'s strict interior test can never contain a cell centre. */
const NO_REGION = (): Region => ({ length: [0, 0], width: [0, 0], thickness: [0, 0] });
```

2. Replace `cutRegion`'s body with:

```ts
export function cutRegion(board: Board, cut: Cut): Region {
  if (cut.face === cut.across) return NO_REGION();
  const pos = positionAxisOf(cut.face, cut.across);
  const faceDim = board[cut.face];
  const acrossDim = board[cut.across];
  // Total, like the face === across guard: a Board built directly can carry a
  // non-finite or out-of-range stop, and a shortened board can leave legal
  // stops crossing. Neither may put NaN or a backwards span into the grid.
  const stop = (s: number) => (Number.isFinite(s) ? Math.min(Math.max(s, 0), acrossDim) : 0);
  const lo = stop(cut.stopMin);
  const hi = acrossDim - stop(cut.stopMax);
  if (lo >= hi) return NO_REGION();
  const region = {} as Region;
  region[cut.across] = [lo, hi];
  region[pos] = [cut.offset, cut.offset + cut.width];
  region[cut.face] = cut.from === 'min'
    ? [0, cut.depth]
    : [faceDim - cut.depth, faceDim];
  return region;
}
```

3. Update the doc comment above it:
   - "A cut spans its `across` axis fully (that is what makes it a through-cut)" becomes
     "A cut spans its `across` axis from `stopMin` to `board[across] - stopMax` — fully, when
     both are 0";
   - add one sentence: "Stops that meet or cross (a board shortened under its cut) remove
     nothing, by the same zero-region return as the degenerate case below."

- [ ] **Step 6: Run the tests to confirm they pass**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing loader tests**

Append to `src/document/document.test.ts` (`createBoard`, `migrateDocument` and
`CURRENT_VERSION` are already imported there):

```ts
describe('stopped cuts (v7)', () => {
  const rawDoc = (cut: Record<string, unknown>, version = 7) => ({
    version,
    name: 'x',
    boards: [{
      ...createBoard({ length: 24, width: 6, thickness: 1 }),
      cuts: [{
        id: 'c', face: 'thickness', from: 'min', across: 'width',
        offset: 6, width: 0.75, depth: 0.25, ...cut,
      }],
    }],
  });
  const loaded = (cut: Record<string, unknown>, version = 7) =>
    migrateDocument(rawDoc(cut, version)).boards[0].cuts;

  it('is version 7', () => {
    expect(CURRENT_VERSION).toBe(7);
  });

  it('defaults missing stops to 0', () => {
    expect(loaded({})[0]).toMatchObject({ stopMin: 0, stopMax: 0 });
  });

  it.each([
    ['a string', '2'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['a negative number', -1],
    ['null', null],
  ])('defaults %s stop to 0 rather than refusing the file', (_, v) => {
    expect(loaded({ stopMin: v, stopMax: v })[0]).toMatchObject({ stopMin: 0, stopMax: 0 });
  });

  it('keeps legal stops exactly', () => {
    expect(loaded({ stopMin: 1, stopMax: 2 })[0]).toMatchObject({ stopMin: 1, stopMax: 2 });
  });

  it('drops a cut whose stops pass each other', () => {
    expect(loaded({ stopMin: 4, stopMax: 3 })).toEqual([]);
  });

  it('drops a cut whose stops exactly use up the across dimension', () => {
    expect(loaded({ stopMin: 4, stopMax: 2 })).toEqual([]);
  });

  it('keeps a full-depth, full-width cut that stops short — a slot leaving a bridge', () => {
    expect(loaded({ offset: 0, width: 24, depth: 1, stopMax: 1 })).toHaveLength(1);
  });

  it('still drops a full-depth, full-width cut that is not stopped', () => {
    expect(loaded({ offset: 0, width: 24, depth: 1 })).toEqual([]);
  });

  it('loads a v6 cut with both stops at 0', () => {
    expect(loaded({}, 6)[0]).toMatchObject({ stopMin: 0, stopMax: 0 });
  });

  it('round-trips both stops through a save', () => {
    const doc = migrateDocument(rawDoc({ stopMin: 1, stopMax: 2 }));
    const again = migrateDocument(JSON.parse(JSON.stringify(doc)));
    expect(again.version).toBe(7);
    expect(again.boards[0].cuts[0]).toMatchObject({ stopMin: 1, stopMax: 2 });
  });
});
```

- [ ] **Step 8: Run them to confirm they fail**

Run: `npx vitest run src/document/document.test.ts`
Expected: the new cases FAIL. The loader does not emit stops, and the version is 6.

- [ ] **Step 9: Implement validation and the version bump**

In `src/document/document.ts`:

1. **The version constant.** Change `export const CURRENT_VERSION = 6;` to `7`. Append to
   the doc comment above it:

```ts
 *
 * v7 added `Cut.stopMin`/`stopMax` (stopped cuts: mortises, stopped dados).
 * Document-level in shape — no rawBoards.map step — because 0 is the correct
 * value for every older cut, all of which run fully across; validateCuts
 * defaults it. The bump's argument is WRONG GEOMETRY, stronger than v6's data
 * loss: a v6 build opening a v7 file would ignore the stops, show a blind
 * mortise as a through-dado with nothing saying so, and autosave that shape
 * back. The gate makes it refuse the file instead.
```

2. **In `validateCuts`,** after the line `const depth = clamp(c.depth as number, 0, faceDim);`
   and its following `if (width <= 0 || depth <= 0) continue;`, add:

```ts
    // Defaulted, not refused, like stock.kerf: a missing or bogus stop is "no
    // stop", which is what every pre-v7 cut means. A pair that leaves no length
    // is dropped like a zero-width cut — never clamped toward each other,
    // because no nearest legal value keeps both numbers and guessing which stop
    // to shorten moves the mortise.
    const acrossDim = board[across];
    const stopOf = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, acrossDim) : 0;
    const stopMin = stopOf(c.stopMin);
    const stopMax = stopOf(c.stopMax);
    if (stopMin + stopMax >= acrossDim) continue;
```

3. **The remove-everything check.** Replace it and its comment with:

```ts
    // The cut's box is the whole board: full depth, the full position axis,
    // and — only when neither end is stopped — the full across axis.
    if (depth === faceDim && offset === 0 && width === posDim &&
        stopMin === 0 && stopMax === 0) continue;
```

4. **The push.** Change it to
   `out.push({ id, face, from: c.from as CutFrom, across, offset, width, depth, stopMin, stopMax });`.

- [ ] **Step 10: Fix the version literals the bump invalidates**

Run `npx vitest run src/document/document.test.ts`. Existing tests that hard-code the version
now fail. Two kinds:

- `expect(…version).toBe(6)` and `createDocument(…).version).toBe(6)` mean "the current
  version". Change them to `7`.
- `migrateDocument({ version: 7, … })` expecting a refusal means "one past current". Change
  them to `8`.
- `version: 6` used as an INPUT document stays as it is: v6 files must still load.

Change nothing else.

- [ ] **Step 11: Write the store tests**

In `src/store/store.test.ts`, in the `describe` that contains
`'adds a cut with a default that fits the board'`, add:

```ts
  it('adds a cut that is not stopped', () => {
    useStore.getState().addCut(boardId());
    expect(cuts()[0]).toMatchObject({ stopMin: 0, stopMax: 0 });
  });

  it('keeps the stops when the board is duplicated', () => {
    useStore.getState().addCut(boardId());
    useStore.getState().updateCut(boardId(), cuts()[0].id, { stopMin: 1, stopMax: 0.5 });
    useStore.getState().duplicateBoard(boardId());
    const copy = useStore.getState().doc.boards[1];
    expect(copy.cuts[0]).toMatchObject({ stopMin: 1, stopMax: 0.5 });
  });
```

If `duplicateBoard` takes a different argument or places the copy elsewhere, read its
signature and adapt the call and the lookup only. The assertion stays.

- [ ] **Step 12: Run everything**

Run: `npm test && npm run build`
Expected: all green, and the build passes.

- [ ] **Step 13: Commit**

```bash
git add -A src
git commit -m "feat(document): Cut gains stopMin/stopMax; cutRegion stops short; schema v7

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Labels, and the depth field reading `cutRegion`

**Files:**
- Modify: `src/document/cuts.ts` (`cutLabel`, a new exported `CutKind`)
- Modify: `src/document/document.ts` (re-export `CutKind`)
- Modify: `src/document/diagram.ts` (`DiagramCut.kind` type only)
- Modify: `src/document/depthField.ts` (`rect`)
- Test: `src/document/cuts.test.ts`, `src/document/depthField.test.ts`,
  `src/document/depthField.agreement.test.ts`

**Interfaces:**
- Consumes: `Cut.stopMin`/`stopMax`, and `cutRegion` from Task 1.
- Produces:
  `export type CutKind = 'dado' | 'rabbet' | 'stopped dado' | 'stopped rabbet' | 'mortise' | 'through mortise' | 'notch'`;
  `cutLabel(board, cut): CutKind`.

- [ ] **Step 1: Write the failing label tests**

Append to `src/document/cuts.test.ts` (import `cutLabel` if not already imported):

```ts
describe('cutLabel with stops', () => {
  // 24 x 6 x 1. The position axis is length, so offset 0 or 23.25 (width 0.75) is flush.
  const b = createBoard({ length: 24, width: 6, thickness: 1 });
  const c = (over: Partial<Cut>): Cut => ({
    id: 'c', face: 'thickness', from: 'min', across: 'width',
    offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0, ...over,
  });

  it.each<[string, Partial<Cut>]>([
    ['dado', {}],
    ['rabbet', { offset: 0 }],
    ['stopped dado', { stopMax: 1 }],
    ['stopped dado', { stopMin: 1 }],
    ['stopped rabbet', { offset: 0, stopMax: 1 }],
    ['mortise', { stopMin: 1, stopMax: 1 }],
    ['through mortise', { stopMin: 1, stopMax: 1, depth: 1 }],
    ['notch', { offset: 0, stopMin: 1, stopMax: 1 }],
    ['notch', { offset: 23.25, stopMin: 1, stopMax: 1 }],
    ['notch', { offset: 0, stopMin: 1, stopMax: 1, depth: 1 }],
  ])('names %s', (want, over) => {
    expect(cutLabel(b, c(over))).toBe(want);
  });

  it('calls a mortise a sixteenth short of full depth a mortise, not through', () => {
    expect(cutLabel(b, c({ stopMin: 1, stopMax: 1, depth: 0.9375 }))).toBe('mortise');
  });

  it('calls a depth past the face (out of range mid-session) through', () => {
    expect(cutLabel(b, c({ stopMin: 1, stopMax: 1, depth: 1.5 }))).toBe('through mortise');
  });
});
```

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: every stopped case FAILS (the function returns `dado` or `rabbet`).

- [ ] **Step 3: Implement `cutLabel`**

In `src/document/cuts.ts`:

1. Above `cutLabel`, add:

```ts
/** Every name a cut can have. Derived from its shape by cutLabel, never stored. */
export type CutKind =
  | 'dado' | 'rabbet'
  | 'stopped dado' | 'stopped rabbet'
  | 'mortise' | 'through mortise'
  | 'notch';
```

2. Change `cutLabel`'s signature to return `CutKind`. Keep the `flush` computation and its
   comment exactly as they are. Replace the final `return` with:

```ts
  // Stopped is compared exactly: a stop is a stored value the user typed, with
  // no arithmetic on the way in (invariant 18), unlike `flush`'s far-end test.
  const stops = (cut.stopMin > 0 ? 1 : 0) + (cut.stopMax > 0 ? 1 : 0);
  if (stops === 0) return flush ? 'rabbet' : 'dado';
  if (stops === 1) return flush ? 'stopped rabbet' : 'stopped dado';
  if (flush) return 'notch';
  // `>=`, not `===`: a depth left past the face mid-session is still through.
  return cut.depth >= board[cut.face] ? 'through mortise' : 'mortise';
```

3. Extend the doc comment's first sentence to read: "What a cut is called — dado, rabbet, their
   stopped forms, mortise, through mortise or notch (the table in the stopped-cuts spec §4.1)."

4. In `src/document/document.ts`, add a type re-export next to the existing `cuts` export
   line: `export type { CutKind } from './cuts';`.

5. In `src/document/diagram.ts`:
   - change `kind: 'dado' | 'rabbet';` to `kind: CutKind;`;
   - add `CutKind` to the type import from `./cuts` (use `import type`).

- [ ] **Step 4: Run them to confirm they pass**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing depth-field tests**

1. Append to `src/document/depthField.test.ts` (match its imports; it already has `createBoard`
   and `buildDepthField`):

```ts
describe('stopped cuts', () => {
  it('hatches a stopped cut only where it runs', () => {
    const board = createBoard({ length: 24, width: 12, cuts: [{
      id: 'a', face: 'thickness', from: 'min', across: 'width',
      offset: 6, width: 0.75, depth: 0.25, stopMin: 2, stopMax: 3,
    }] });
    expect(buildDepthField(board, 'thickness', 'min', 'length', 'width')).toEqual([
      { h: [6, 6.75], v: [2, 9], depth: 0.25, crossing: false },
    ]);
  });

  it('hatches nothing for a cut whose stops cross', () => {
    const board = createBoard({ length: 24, width: 12, cuts: [{
      id: 'a', face: 'thickness', from: 'min', across: 'width',
      offset: 6, width: 0.75, depth: 0.25, stopMin: 7, stopMax: 6,
    }] });
    expect(buildDepthField(board, 'thickness', 'min', 'length', 'width')).toEqual([]);
  });
});
```

2. In `src/document/depthField.agreement.test.ts`:
   - The `cut` helper already received `stopMin: 0, stopMax: 0` in Task 1.
   - Append these to `GEOMETRIES`. The board there is `createBoard({ length: 24, width: 12, cuts })`,
     whose default thickness is 0.75:

```ts
  { name: 'a stopped dado', cuts: [
    cut({ id: 'a', across: 'width', offset: 6, width: 0.75, stopMax: 3 })] },
  { name: 'a blind mortise', cuts: [
    cut({ id: 'a', across: 'width', offset: 6, width: 0.75, depth: 0.5, stopMin: 2, stopMax: 2 })] },
  { name: 'a through mortise', cuts: [
    cut({ id: 'a', across: 'width', offset: 6, width: 0.75, depth: 0.75, stopMin: 2, stopMax: 2 })] },
  { name: 'a mortise crossing a dado at a different depth', cuts: [
    cut({ id: 'a', across: 'width',  offset: 6, width: 2,    depth: 0.5,  stopMin: 3, stopMax: 3 }),
    cut({ id: 'b', across: 'length', offset: 5, width: 0.75, depth: 0.25 })] },
```

- [ ] **Step 6: Run them to confirm they fail**

Run: `npx vitest run src/document/depthField.test.ts src/document/depthField.agreement.test.ts`
Expected:
- the new depth-field cases FAIL: the field still spans `[0, 12]`;
- each new agreement case FAILS with "field says cut … boardSolids still has stock there".

- [ ] **Step 7: Repoint `rect` at `cutRegion`**

In `src/document/depthField.ts`:

1. Add `import { cutRegion } from './cuts';`.
2. Replace the `rect` helper, and the comment above it ("Both `across` and the position axis
   are in-plane, which is exactly why every cut on a face is a full-span rectangle."), with:

```ts
  // Read from cutRegion, the ONE place a cut becomes a box. This used to
  // rebuild the rectangle itself with the across span hard-coded to the full
  // dimension — true until cuts could stop short, and then a second answer to
  // one question: a stopped cut hatched full-length while the 3D model showed
  // it stopped. Both in-plane spans come out of the region by name.
  const rect = (cut: Cut): { h: Span; v: Span } => {
    const region = cutRegion(board, cut);
    return { h: region[horizontal], v: region[vertical] };
  };
```

Keep the `Cut` type import if it is still used. Otherwise drop the now-unused names, because
`noUnusedLocals` fails the build.

- [ ] **Step 8: Run everything**

Run: `npm test && npm run build`
Expected: all green, and the build passes.

- [ ] **Step 9: Commit**

```bash
git add -A src
git commit -m "feat(document): cutLabel names stopped cuts; depthField reads cutRegion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The cut list — a type-checked signature and the stop clause

**Files:**
- Modify: `src/document/cutlist.ts` (`cutSignature`, `setupLine`)
- Test: `src/document/cutlist.test.ts`

**Interfaces:**
- Consumes: `Cut.stopMin`/`stopMax` (Task 1) and `cutLabel` (Task 2).
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

In `src/document/cutlist.test.ts`, after the existing `'phrases a cut flush with an end as a rabbet'`
test, add the tests below. They use the file's `docWith` and `dado` helpers. The default board
is 24 × 5-1/2 × 3/4, and `dado` is offset 6, width 3/4, depth 1/4, across the width, with stops
0 after Task 1:

```ts
  it('prints an unstopped rabbet exactly as before', () => {
    const list = buildCutList(docWith({ cuts: [dado({ offset: 0 })] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '3/4" rabbet, 1/4" deep — into the thickness face (min side), ' +
      '0" from the length min end, running across the width',
    ]);
  });

  it('adds a clause for a stop at the max end', () => {
    const list = buildCutList(docWith({ cuts: [dado({ stopMax: 1 })] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '3/4" stopped dado, 1/4" deep — into the thickness face (min side), ' +
      '6" from the length min end, running across the width, stopped 1" short of the max end',
    ]);
  });

  it('adds a clause for a stop at the min end', () => {
    const list = buildCutList(docWith({ cuts: [dado({ stopMin: 0.5 })] }));
    expect(list.groups[0].rows[0].setup[0]).toMatch(
      /, running across the width, stopped 1\/2" short of the min end$/,
    );
  });

  it('names both stops of a mortise', () => {
    const list = buildCutList(docWith({ cuts: [dado({ stopMin: 1, stopMax: 1.5 })] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '3/4" mortise, 1/4" deep — into the thickness face (min side), ' +
      '6" from the length min end, running across the width, ' +
      'stopped 1" short of the min end and 1-1/2" short of the max end',
    ]);
  });

  it('splits two parts that differ only in a stop into two rows', () => {
    const list = buildCutList(docWith({ cuts: [dado()] }, { cuts: [dado({ stopMax: 1 })] }));
    expect(list.groups[0].rows).toHaveLength(2);
  });

  it('splits two parts that differ only in which end is stopped', () => {
    const list = buildCutList(docWith(
      { cuts: [dado({ stopMin: 1 })] },
      { cuts: [dado({ stopMax: 1 })] },
    ));
    expect(list.groups[0].rows).toHaveLength(2);
  });

  it('keeps two parts with identical stopped cuts in one row', () => {
    const list = buildCutList(docWith(
      { cuts: [dado({ stopMin: 1, stopMax: 1 })] },
      { cuts: [dado({ stopMin: 1, stopMax: 1 })] },
    ));
    expect(list.groups[0].rows).toHaveLength(1);
    expect(list.groups[0].rows[0].qty).toBe(2);
  });
```

If `formatLength(1.5, 16)` prints something other than `1-1/2"` in this repo, check one
existing test's expected string. `'Oak — 1-1/2"'` in this file is one. If the two disagree,
STOP and report; do not change the expectation.

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run src/document/cutlist.test.ts`
Expected:
- the clause and mortise cases FAIL;
- the "differ only in a stop" cases FAIL with one row instead of two;
- the unstopped-rabbet and identical-stops cases pass already.

- [ ] **Step 3: Implement the signature from the type**

In `src/document/cutlist.ts`, replace `cutSignature` (keep the doc comment above it, and append
the paragraph shown here):

```ts
/**
 * Every field of `Cut` that decides "same cut": all but `id`.
 *
 * A TABLE CHECKED AGAINST THE TYPE, not a list in a function body (invariant
 * 40). The signature used to be a hand-written field list, and adding
 * `stopMin`/`stopMax` to `Cut` without adding them there would have grouped a
 * mortised leg with a through-dadoed one: one row, one setup, half the legs
 * cut wrong. `satisfies` makes a new `Cut` field fail `tsc` here until it is
 * listed — invariant 15's lesson, one layer over.
 */
const SIGNATURE_FIELDS = {
  face: true, from: true, across: true, offset: true, width: true, depth: true,
  stopMin: true, stopMax: true,
} as const satisfies Record<Exclude<keyof Cut, 'id'>, true>;

const SIGNATURE_KEYS = Object.keys(SIGNATURE_FIELDS) as (keyof typeof SIGNATURE_FIELDS)[];

function cutSignature(cuts: Cut[]): string {
  return cuts
    .map((c) => SIGNATURE_KEYS.map((k) => String(c[k])).join(':'))
    .sort()
    .join(';');
}
```

- [ ] **Step 4: Prove the type check bites**

Delete `stopMin: true,` from `SIGNATURE_FIELDS` and run `npm run build`.
- Expected: it FAILS, with an error naming `stopMin`.
- Restore the line.
- Record the error text in your report.

Then add a bogus key `extra: true,`, run `npm run build`, and confirm it fails too. Remove it.

- [ ] **Step 5: Implement the stop clause**

In `src/document/cutlist.ts`:

1. Add above `setupLine`:

```ts
/**
 * The setup line's tail for a stopped cut, or '' for one that runs fully
 * across — so an unstopped cut prints byte-for-byte as it did before stops
 * existed.
 */
function stopClause(cut: Cut, f: (n: number) => string): string {
  if (cut.stopMin > 0 && cut.stopMax > 0) {
    return `, stopped ${f(cut.stopMin)} short of the min end and ${f(cut.stopMax)} short of the max end`;
  }
  if (cut.stopMin > 0) return `, stopped ${f(cut.stopMin)} short of the min end`;
  if (cut.stopMax > 0) return `, stopped ${f(cut.stopMax)} short of the max end`;
  return '';
}
```

2. In `setupLine`, append `+ stopClause(cut, f)` after
   `` `${f(cut.offset)} from the ${pos} min end, running across the ${cut.across}` ``
   inside the returned expression.

- [ ] **Step 6: Run everything**

Run: `npm test && npm run build`
Expected: all green, and the build passes.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat(cutlist): signature covers every Cut field by type; setup line names stops

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Diagrams — stop labels and the stop leader

**Files:**
- Modify: `src/document/diagram.ts` (`DiagramCut`, `buildDiagrams`)
- Modify: `src/panels/PartDiagram.tsx` (leaders generalised)
- Test: `src/document/diagram.test.ts`, `src/panels/PartDiagram.test.tsx`

**Interfaces:**
- Consumes: `cutRegion` (Task 1) and `CutKind` (Task 2).
- Produces: three new optional fields on `DiagramCut`: `stopMinLabel?: string`,
  `stopMaxLabel?: string` and `lengthLabel?: string`. `lengthLabel` is present exactly when the
  cut is stopped.

**Design, for the implementer.** `PartDiagram` already draws each cut's position as a
*leader*:
- a horizontal row below the outline for a cut positioned along the horizontal axis;
- a rotated column left of the outline for a cut positioned along the vertical axis.

A stopped cut gets one more leader **in the other orientation**, measuring along `across`:
- the near-stop run, labelled `stopMinLabel`;
- the band, labelled `lengthLabel`;
- the far-stop run, labelled `stopMaxLabel`.

So a stopped horizontal-axis cut adds a column, and a stopped vertical-axis cut adds a row.
Existing leaders keep their order and are drawn identically. The new ones are appended after
them.

- [ ] **Step 1: Pin today's diagrams before touching anything (characterisation)**

Add this test to `src/panels/PartDiagram.test.tsx` and run it against the UNCHANGED code to
capture the numbers. It hashes each diagram's layout, so "a view with no stopped cut draws
exactly as before" is checked rather than argued:

```ts
describe('PartDiagram — a view with no stopped cut draws exactly as before', () => {
  /** Every drawn element's markup, pattern ids stripped (useId varies by render order). */
  const layout = (container: HTMLElement): string => {
    const svg = container.querySelector('svg')!;
    const parts = [svg.getAttribute('viewBox') ?? ''];
    for (const el of svg.querySelectorAll('line, text, rect')) {
      parts.push(el.outerHTML.replace(/url\(#[^)]*\)/g, 'url(#)'));
    }
    return parts.join('\n');
  };
  /** djb2 — a stable fingerprint, so the pinned values below stay one line each. */
  const hash = (s: string): number => {
    let h = 5381;
    for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h;
  };
  const fingerprint = (board: Parameters<typeof createBoard>[0]) => {
    const { container } = render(<PartDiagram view={buildDiagrams(createBoard(board), 16)[0]} />);
    return hash(layout(container));
  };

  it.each<[string, Parameters<typeof createBoard>[0], number]>([
    ['baseline dado', { cuts: [dado()] }, 0],
    ['two close dados', { width: 24, cuts: [dado({ offset: 6 }), dado({ id: 'c2', offset: 7.5 })] }, 0],
    ['offset zero', { cuts: [dado({ offset: 0, width: 0.125 })] }, 0],
    ['flush max', { cuts: [dado({ offset: 23.25, width: 0.75 })] }, 0],
    ['edge groove column', { cuts: [dado({ face: 'width', across: 'length', offset: 0.25, width: 0.25 })] }, 0],
    ['narrow drawn', { length: 24, width: 100.9375, cuts: [dado()] }, 0],
    ['five dados', { cuts: [0, 4, 8, 12, 16].map((offset, i) => dado({ id: `c${i}`, offset })) }, 0],
    ['row and column crossing', { length: 24, width: 12, cuts: [
      dado({ id: 'a', across: 'width', offset: 6, width: 0.75, depth: 0.125 }),
      dado({ id: 'b', across: 'length', offset: 4, width: 0.75, depth: 0.375 }),
    ] }, 0],
    ['no cuts', {}, 0],
  ])('%s', (_, board, pinned) => {
    expect(fingerprint(board)).toBe(pinned);
  });
});
```

How to capture the values:
- Run `npx vitest run src/panels/PartDiagram.test.tsx -t "draws exactly as before"`. Each case
  fails, printing the received hash.
- Replace each `0` with the hash that case printed.
- Run it again: all nine must PASS on the unchanged code.
- Commit this alone:

```bash
git add src/panels/PartDiagram.test.tsx
git commit -m "test(diagram): pin the layout of today's diagrams before stop leaders

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

These pinned values must never be edited later in this task. If one fails after your change,
your change altered an unstopped diagram: fix the code.

- [ ] **Step 2: Write the failing `diagram.ts` tests**

Append to `src/document/diagram.test.ts`. Its `dado` is offset 6, width 3/4, depth 3/8, across
the width, on a default 24 × 5-1/2 board with stops 0:

```ts
describe('buildDiagrams — stopped cuts', () => {
  const only = (cut: Cut) => buildDiagrams(board(cut), 16)[0].cuts[0];

  it('adds no stop labels to a cut that is not stopped', () => {
    const c = only(dado());
    expect(c.stopMinLabel).toBeUndefined();
    expect(c.stopMaxLabel).toBeUndefined();
    expect(c.lengthLabel).toBeUndefined();
  });

  it('labels one stop and the cut\'s own length', () => {
    const c = only(dado({ stopMax: 1 }));
    expect(c.stopMinLabel).toBeUndefined();
    expect(c.stopMaxLabel).toBe('1"');
    expect(c.lengthLabel).toBe('4-1/2"');
  });

  it('labels both stops of a mortise', () => {
    const c = only(dado({ stopMin: 1, stopMax: 1.5 }));
    expect(c.stopMinLabel).toBe('1"');
    expect(c.stopMaxLabel).toBe('1-1/2"');
    expect(c.lengthLabel).toBe('3"');
    expect(c.kind).toBe('mortise');
  });

  it('draws a stopped cut as its rectangle', () => {
    // Broad face: horizontal = length, vertical = width (the across axis here).
    const c = only(dado({ stopMin: 1, stopMax: 1.5 }));
    expect(c.h).toEqual([6, 6.75]);
    expect(c.v).toEqual([1, 4]);
  });
});
```

- [ ] **Step 3: Run them to confirm they fail**

Run: `npx vitest run src/document/diagram.test.ts`
Expected: the label cases FAIL (the fields don't exist). The rectangle case passes already,
because the band comes from `cutRegion`.

- [ ] **Step 4: Implement the labels**

In `src/document/diagram.ts`:

1. Add to `DiagramCut`, after `kind`:

```ts
  /** e.g. `1"` — how far short of the across axis's min end. Present only when > 0. */
  stopMinLabel?: string;
  /** How far short of the across axis's max end. Present only when > 0. */
  stopMaxLabel?: string;
  /** The cut's own extent along `across`. Present exactly when the cut is stopped. */
  lengthLabel?: string;
```

2. In the `view.cuts.push({ … })` call, after `kind: cutLabel(board, cut),`, add:

```ts
      // Assembled here, never in the panel: the measured string and the drawn
      // string must be the same string (invariant 19).
      ...(cut.stopMin > 0 ? { stopMinLabel: f(cut.stopMin) } : {}),
      ...(cut.stopMax > 0 ? { stopMaxLabel: f(cut.stopMax) } : {}),
      ...(cut.stopMin > 0 || cut.stopMax > 0
        ? { lengthLabel: f(region[cut.across][1] - region[cut.across][0]) }
        : {}),
```

3. Update `buildDiagrams`' doc comment: "every cut is a band running fully across whichever
   of the two is its `across`" becomes "every cut is a band along whichever of the two is its
   `across` (fully across it unless stopped)".

Run `npx vitest run src/document/diagram.test.ts`: PASS.

- [ ] **Step 5: Write the failing `PartDiagram` tests**

Add these inside `describe('PartDiagram label collisions — the seven sweep geometries', …)`
in `src/panels/PartDiagram.test.tsx`, after case 8. They reuse that block's `check`, `draw` and
`boxes`:

```ts
  it('9 blind mortise — a stopped horizontal-axis cut adds a stop COLUMN', () => {
    const container = draw({ cuts: [dado({ stopMin: 1, stopMax: 1.5 })] });
    check(container);
    const texts = [...container.querySelectorAll('.cutlist-diagram-leader-v text')].map((t) => t.textContent);
    expect(texts).toEqual(['1"', '3"', '1-1/2"']);
  });

  it('10 stopped dado — one stop draws one stop label and the length', () => {
    const container = draw({ cuts: [dado({ stopMax: 1 })] });
    check(container);
    const texts = [...container.querySelectorAll('.cutlist-diagram-leader-v text')].map((t) => t.textContent);
    expect(texts).toEqual(['4-1/2"', '1"']);
  });

  it('11 a stopped vertical-axis cut adds a stop ROW', () => {
    // across: 'length' makes this cut positioned along width (a column); its
    // stops run along length, the horizontal axis, so they are a row.
    const container = draw({ length: 24, width: 12, cuts: [
      dado({ across: 'length', offset: 4, width: 0.75, stopMin: 2, stopMax: 3 }),
    ] });
    check(container);
    const rows = [...container.querySelectorAll('g.cutlist-diagram-leader:not(.cutlist-diagram-leader-v)')];
    const stopRow = rows.find((g) => [...g.querySelectorAll('text')].some((t) => t.textContent === '19"'));
    expect(stopRow, 'the stop row carries the 19" length').toBeDefined();
    expect([...stopRow!.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['2"', '19"', '3"']);
  });

  it('12 crowded stops — a mortise with sixteenth stops still never overlaps', () => {
    check(draw({ cuts: [dado({ stopMin: 0.0625, stopMax: 0.0625 })] }));
  });

  it('13 a stopped cut on a sliver view (edge face) never overlaps or bleeds', () => {
    check(draw({ cuts: [dado({ face: 'width', across: 'length', offset: 0.25, width: 0.25, stopMin: 2, stopMax: 2 })] }));
  });

  it('14 a mortise and an unstopped dado together', () => {
    check(draw({ width: 12, cuts: [dado({ id: 'm', stopMin: 2, stopMax: 2 }), dado({ id: 'd', offset: 14 })] }));
  });
```

And add this to the top-level `describe('PartDiagram', …)`:

```ts
  it('draws a cut whose stops cross without a NaN anywhere', () => {
    // A Board built directly (bypassing the loader), as a shortened board
    // reaches it mid-session: the region is empty, nothing is removed.
    const v = buildDiagrams(createBoard({ cuts: [dado({ stopMin: 4, stopMax: 3 })] }), 16)[0];
    const { container } = render(<PartDiagram view={v} />);
    for (const el of container.querySelectorAll('*')) {
      for (const attr of el.getAttributeNames()) {
        expect(el.getAttribute(attr), `${el.tagName} ${attr}`).not.toMatch(/NaN/);
      }
    }
  });
```

Why the case 9 order is `['1"', '3"', '1-1/2"']`: this file's `dado` has depth 3/8, across the
width (5-1/2), so stops of 1 and 1-1/2 leave a 3" cut. The column draws near stop, band, far
stop, top to bottom, and a stop leader has no depth label.

- [ ] **Step 6: Run them to confirm they fail**

Run: `npx vitest run src/panels/PartDiagram.test.tsx`
Expected:
- cases 9, 10 and 11 FAIL: no stop leader exists;
- the pinned characterisation cases still PASS;
- the NaN case may pass already. It is a guard, and is required either way.

- [ ] **Step 7: Generalise the leaders in `PartDiagram.tsx`**

1. **Imports.** Add `import type { DiagramCut } from '../document/document';` next to the
   existing `DiagramView` import (merge them), and `import type { Span } from '../document/document';`.

2. **Add above `export function PartDiagram`:**

```ts
/**
 * One measured run beside the outline. A cut's POSITION leader (offset run,
 * band, then depth with no run of its own) or, for a stopped cut, its STOP
 * leader in the other orientation (near-stop run, band, far-stop run) — the
 * stops measure along `across`, perpendicular to the position.
 *
 * Every string arrives from `buildDiagrams`; this formats nothing.
 */
interface Leader {
  key: string;
  /** Board inches along this leader's own axis. */
  span: Span;
  /** Labels the run from the outline's near edge to the band. Absent: no run is drawn. */
  before?: string;
  band: string;
  /** Labels the run from the band to the outline's far edge. Absent: no run is drawn. */
  after?: string;
  /** A label just past the band with no run of its own (depth). */
  trailing?: string;
}

const positionLeader = (cut: DiagramCut, span: Span): Leader => ({
  key: cut.id, span, before: cut.offsetLabel, band: cut.widthLabel, trailing: cut.depthLabel,
});

/** Null for a cut that is not stopped — `lengthLabel` is present exactly when it is. */
const stopLeader = (cut: DiagramCut, span: Span): Leader | null =>
  cut.lengthLabel === undefined
    ? null
    : { key: `${cut.id}-stop`, span, before: cut.stopMinLabel, band: cut.lengthLabel, after: cut.stopMaxLabel };

const present = <T,>(x: T | null): x is T => x !== null;

/**
 * A leader's labels in drawing order, each centred on what it measures. `lo`
 * and `hi` are the outline's edges on the leader's axis, `b` its band. The
 * position leader's three centres are exactly the ones this file used before
 * stops existed — the characterisation test pins that.
 */
const labelItems = (l: Leader, lo: number, hi: number, b: { start: number; size: number }) => {
  const items: { text: string; centre: number; width: number }[] = [];
  if (l.before !== undefined) {
    items.push({ text: l.before, centre: (lo + b.start) / 2, width: labelWidth(l.before) });
  }
  items.push({ text: l.band, centre: b.start + b.size / 2, width: labelWidth(l.band) });
  if (l.after !== undefined) {
    items.push({ text: l.after, centre: (b.start + b.size + hi) / 2, width: labelWidth(l.after) });
  }
  if (l.trailing !== undefined) {
    const w = labelWidth(l.trailing);
    items.push({ text: l.trailing, centre: b.start + b.size + GAP_X + w / 2, width: w });
  }
  return items;
};
```

3. **Build the two leader lists.** Inside `PartDiagram`, replace the two lines

```ts
  const hCuts = view.cuts.filter((c) => c.axis === 'h');
  const vCuts = view.cuts.filter((c) => c.axis === 'v');
```

with

```ts
  const hCuts = view.cuts.filter((c) => c.axis === 'h');
  const vCuts = view.cuts.filter((c) => c.axis === 'v');
  // Position leaders first, in their existing order, so every unstopped
  // diagram draws exactly as before; a stopped cut's stop leader is appended
  // in the OTHER orientation (its stops run along `across`).
  const rowLeaders: Leader[] = [
    ...hCuts.map((c) => positionLeader(c, c.h)),
    ...vCuts.map((c) => stopLeader(c, c.h)).filter(present),
  ];
  const colLeaders: Leader[] = [
    ...vCuts.map((c) => positionLeader(c, c.v)),
    ...hCuts.map((c) => stopLeader(c, c.v)).filter(present),
  ];
```

4. **Count leaders, not cuts.**
   - In `left`, replace `vCuts.length` (both occurrences) with `colLeaders.length`.
   - In `height`, replace `ROW * hCuts.length` with `ROW * rowLeaders.length`.
   - Update the comment above `left`: "one COL-wide column per vertical leader".

5. **Columns.** Replace the `columns` computation and `maxColumnBottom` with:

```ts
  const columns = colLeaders.map((l, i) => {
    const b = bandOn(l.span, fit.sy, top, fit.drawnV);
    const items = labelItems(l, top, bottom, b);
    const ys = packRow(items, top, Infinity, GAP_X);
    return {
      l, b, items, ys,
      // Anchored at `fit.offsetX`, not 0 — under the shrink branch (a tall
      // narrow board) `offsetX` can be several hundred units, and the gutter
      // has to sit immediately left of the OUTLINE, not left of the viewBox's
      // own left edge, or the leader line points at empty space instead of
      // the board (found by mutation review: a 450-unit gap on a 24" x
      // 100-15/16" panel).
      x: fit.offsetX + COL * (i + 1) - TICK,
      labelX: fit.offsetX + COL * i + LABEL_ASCENT,
    };
  });
  // The figure grows to fit whichever column's LAST label runs deepest — the
  // depth label for a position column, the far stop (or band) for a stop column.
  const maxColumnBottom = columns.length
    ? Math.max(...columns.map((c) => c.ys[c.ys.length - 1] + c.items[c.items.length - 1].width / 2))
    : 0;
```

6. **Rows.** Replace the `{hCuts.map((cut, i) => { … })}` block with the following. It keeps
   the existing comment about the bound at the board's left edge. Element order matches
   today's for a position leader, which is what the characterisation test checks:

```tsx
        {rowLeaders.map((l, i) => {
          const lo = left + fit.offsetX;
          const hi = lo + fit.drawnH;
          const b = bandOn(l.span, fit.sx, lo, fit.drawnH);
          const end = b.start + b.size;
          const y = leaders + ROW * i + ROW / 2;
          const items = labelItems(l, lo, hi, b);
          // Bound at the board's left edge, not the viewBox's. A label centred
          // on a run shorter than itself would otherwise start left of the
          // board — harmless in isolation, but the row's leader LINE already
          // starts at `left + fit.offsetX`, so a label drifting left of its own
          // line's origin reads as belonging to nothing.
          const xs = packRow(items, lo, viewW, GAP_X);
          return (
            <g className="cutlist-diagram-leader" key={l.key}>
              {l.before !== undefined && <line x1={lo} y1={y} x2={b.start} y2={y} />}
              <line x1={b.start} y1={y} x2={end} y2={y} />
              {l.before !== undefined && <line x1={lo} y1={y - TICK} x2={lo} y2={y + TICK} />}
              <line x1={b.start} y1={y - TICK} x2={b.start} y2={y + TICK} />
              <line x1={end} y1={y - TICK} x2={end} y2={y + TICK} />
              {l.after !== undefined && <line x1={end} y1={y} x2={hi} y2={y} />}
              {l.after !== undefined && <line x1={hi} y1={y - TICK} x2={hi} y2={y + TICK} />}
              {items.map((it, k) => (
                <text key={k} x={xs[k]} y={y - 6} textAnchor="middle">{it.text}</text>
              ))}
            </g>
          );
        })}
```

7. **Columns, rendered.** Replace the `{columns.map(({ cut, b, oy, wy, dy, x, labelX }) => ( … ))}`
   block with:

```tsx
        {columns.map(({ l, b, items, ys, x, labelX }) => {
          const end = b.start + b.size;
          return (
            <g className="cutlist-diagram-leader cutlist-diagram-leader-v" key={l.key}>
              {l.before !== undefined && <line x1={x} y1={top} x2={x} y2={b.start} />}
              <line x1={x} y1={b.start} x2={x} y2={end} />
              {l.before !== undefined && <line x1={x - TICK} y1={top} x2={x + TICK} y2={top} />}
              <line x1={x - TICK} y1={b.start} x2={x + TICK} y2={b.start} />
              <line x1={x - TICK} y1={end} x2={x + TICK} y2={end} />
              {l.after !== undefined && <line x1={x} y1={end} x2={x} y2={bottom} />}
              {l.after !== undefined && <line x1={x - TICK} y1={bottom} x2={x + TICK} y2={bottom} />}
              {items.map((it, k) => (
                <text key={k} x={labelX} y={ys[k]} textAnchor="middle" transform={`rotate(-90 ${labelX} ${ys[k]})`}>
                  {it.text}
                </text>
              ))}
            </g>
          );
        })}
```

8. **The module doc comment.** Extend the module's long doc comment above `PartDiagram` with
   one paragraph:

```
 * A STOPPED cut adds a second leader in the OTHER orientation — its stops
 * measure along `across`, which is perpendicular to its position — so a
 * stopped horizontal-axis cut gets a column and a stopped vertical-axis cut a
 * row. Leaders, not cuts, are what get a row or a column now; position leaders
 * come first, so a diagram with no stopped cut draws exactly as it did before
 * (pinned by the characterisation test, by layout hash).
```

If the characterisation hashes fail after this step:
- Compare against the old JSX. Attribute order, element order and whether an element is
  rendered all count.
- Fix the code until the pins pass. Do not repin.

- [ ] **Step 8: Run everything**

Run: `npm test && npm run build`
Expected: all green, including the nine pinned hashes, and the build passes.

- [ ] **Step 9: Commit**

```bash
git add -A src
git commit -m "feat(diagram): a stopped cut gets a stop leader — near stop, length, far stop

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Snap points — the mouth offers its whole opening

**Files:**
- Modify: `src/document/snapPoints.ts` (`pointsOfCut` and its doc comment, the `cutSnapPoints`
  doc comment)
- Test: `src/document/snapPoints.test.ts`, `src/store/store.test.ts`

**Interfaces:**
- Consumes: `cutRegion` with stops (Task 1).
- Produces: no new exports. A cut now offers up to 17 points.

- [ ] **Step 1: Pin today's counts before touching anything (characterisation)**

Add this to `src/document/snapPoints.test.ts`, below the existing `cutSnapPoints` describe. It
reuses the file's `posed`, `DADO` and `Cut`. Run it on the UNCHANGED code to capture the
values:

```ts
describe('cutSnapPoints — every through-cut offers exactly what it did before stops', () => {
  const counts = (cuts: Cut[]) => {
    const pts = cutSnapPoints(posed(cuts));
    return [
      pts.filter((p) => p.kind === 'corner').length,
      pts.filter((p) => p.kind === 'edge-mid').length,
      pts.filter((p) => p.kind === 'face-center').length,
    ];
  };

  it.each<[string, Cut[], number[]]>([
    ['dado', [DADO], [0, 0, 0]],
    ['rabbet at the min end', [{ ...DADO, offset: 0, width: 2 }], [0, 0, 0]],
    ['rabbet at the max end', [{ ...DADO, offset: 22, width: 2 }], [0, 0, 0]],
    ['dado from the min side', [{ ...DADO, from: 'min' }], [0, 0, 0]],
    ['edge groove', [{ ...DADO, face: 'width', across: 'length', offset: 0.25, width: 0.5, depth: 0.5 }], [0, 0, 0]],
    ['end slot', [{ ...DADO, face: 'length', across: 'thickness', offset: 2, width: 1, depth: 3 }], [0, 0, 0]],
    ['full-depth dado', [{ ...DADO, depth: 1 }], [0, 0, 0]],
    ['two overlapping dados', [DADO, { ...DADO, id: 'c2', offset: 6.5, depth: 0.5 }], [0, 0, 0]],
    ['crossing dado and groove', [DADO, { ...DADO, id: 'c2', across: 'length', offset: 2, width: 0.5 }], [0, 0, 0]],
  ])('%s', (_, cuts, pinned) => {
    expect(counts(cuts)).toEqual(pinned);
  });
});
```

How to capture the values:
- Run `npx vitest run src/document/snapPoints.test.ts -t "exactly what it did before"`.
- Replace each `[0, 0, 0]` with the received value.
- Rerun: all must PASS on the unchanged code.
- Sanity check: `dado` must come out `[8, 6, 1]`, matching the existing "offers 15 points"
  test. If it does not, STOP and report.

Commit alone:

```bash
git add src/document/snapPoints.test.ts
git commit -m "test(snap): pin every through-cut's snap counts before the mouth change

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the failing tests**

Append to `src/document/snapPoints.test.ts`, after the characterisation block. The worked
mapping is the same as the existing "places all 15 points" test:
- `X = 10 + thickness`, `Y = 2 + width`, `Z = -5 + length`;
- `DADO` enters from `max` at depth 1/4, so the mouth is at `X = 11` and the floor at
  `X = 10.75`;
- the position axis (length) runs 6 to 6.75, so its mid 6.375 is at `Z = 1.375`.

```ts
describe('cutSnapPoints — stopped cuts', () => {
  it('offers 17 for a blind mortise: the mouth\'s whole opening plus the floor', () => {
    expect(cutSnapPoints(posed([{ ...DADO, stopMin: 1, stopMax: 2 }]))).toHaveLength(17);
  });

  it('offers the midpoints of a mortise\'s stopped ends at the mouth', () => {
    // across (width) runs 1..4 -> Y 3..6; its mid 2.5 -> Y 4.5.
    const keys = cutSnapPoints(posed([{ ...DADO, stopMin: 1, stopMax: 2 }])).map((p) => key(p.at));
    expect(keys).toContain(key([11, 3, 1.375]));
    expect(keys).toContain(key([11, 6, 1.375]));
    // The mouth's own centre sits in the hole — never offered.
    expect(keys).not.toContain(key([11, 4.5, 1.375]));
  });

  it('offers a stopped dado\'s stopped end at the mouth, and not its open end', () => {
    // stopMax 2: across runs 0..4 -> Y 2..6. The open end (Y 2) is the board's own edge.
    const keys = cutSnapPoints(posed([{ ...DADO, stopMax: 2 }])).map((p) => key(p.at));
    expect(keys).toContain(key([11, 6, 1.375]));
    expect(keys).not.toContain(key([11, 2, 1.375]));
  });

  it('puts a through mortise\'s floor on the far surface, minus its centre (no stock there)', () => {
    const pts = cutSnapPoints(posed([{ ...DADO, depth: 1, stopMin: 1, stopMax: 2 }]));
    const floor = pts.filter((p) => p.at[0] === 10);
    expect(floor).toHaveLength(8);
    expect(floor.map((p) => key(p.at))).not.toContain(key([10, 4.5, 1.375]));
    expect(pts).toHaveLength(16);
  });
});
```

Where the counts come from:
- **17:** the floor's 9 points plus the mouth's 8. Every one touches wood, because the cut is
  stopped at both ends and sits mid-board.
- **16:** a through mortise's floor centre has the hole on one side and air on the other, so
  `stockProbe` removes it.

If either count comes out different, STOP and report the actual points. Do not change the
expectation or the rule to fit.

- [ ] **Step 3: Run them to confirm they fail**

Run: `npx vitest run src/document/snapPoints.test.ts`
Expected:
- 17 and the two end-midpoint `toContain`s FAIL: today's mouth offers 6;
- the characterisation block PASSES.

- [ ] **Step 4: Implement**

In `src/document/snapPoints.ts`, `pointsOfCut`:

1. Change `const planes = i === 1 ? [floor] : [floor, mouth];` to

```ts
      // The mouth offers its whole opening except the centre, which sits in
      // the hole. On a stopped cut the stopped ends are wood and their
      // midpoints are real features; on a through-cut those two points sit
      // where the opening meets the board's edge, and stockProbe removes them
      // (pinned: every through-cut offers exactly what it did before stops).
      const planes = i === 1 && j === 1 ? [floor] : [floor, mouth];
```

2. Rewrite the function's doc comment:
   - First paragraph: "The up-to-17 points one cut defines, in the board's own space, before
     any test of whether the stock under them still exists."
   - Second paragraph: "Two rectangles at the two ends of the cut's depth axis. The FLOOR gets
     all nine combinations of {min, mid, max} on the position and across axes. The MOUTH — the
     plane at the board's own surface — gets the eight around its opening, every combination
     but the centre, which sits in the hole rather than on wood. That is the volume-centre
     exclusion of design §2.1, one dimension down. A through-cut's two across-end midpoints are
     on no wood and stockProbe drops them, which is why a dado still offers 15."
   - Keep the remaining paragraphs.

3. In `cutSnapPoints`' doc comment, change "15 per cut, minus any whose stock is gone" to "up
   to 17 per cut (15 for a through-cut), minus any whose stock is gone".

- [ ] **Step 5: Run the snap tests**

Run: `npx vitest run src/document/snapPoints.test.ts`
Expected: all PASS, including every characterisation pin.
- If a pin fails, the claim "stockProbe drops a through-cut's added points" is wrong for that
  shape. STOP and report the shape and its extra points.
- The spec's stated fallback is to offer the two end midpoints only on an end that is stopped.
  Do not apply it without a ruling.

- [ ] **Step 6: The held-point tests**

In `src/store/store.test.ts`, in the `describe` that holds
`'drops a grab on a shoulder when the cut moves under it'`, add the tests below. Add
`sameSnapPoint` to the existing import from the snap points module if it is not there:

```ts
  /** Points of a's cut that a stopMin edit to 1 removes, and ones it keeps. */
  const stopEditSplit = (id: string) => {
    const board = useStore.getState().doc.boards.find((x) => x.id === id)!;
    const before = cutSnapPoints(board);
    const after = cutSnapPoints({ ...board, cuts: [{ ...board.cuts[0], stopMin: 1 }] });
    const gone = before.find((p) => !after.some((q) => sameSnapPoint(p, q)));
    const kept = before.find((p) => after.some((q) => sameSnapPoint(p, q)));
    expect(gone, 'fixture: a stop edit must remove some point').toBeDefined();
    expect(kept, 'fixture: a stop edit must keep some point').toBeDefined();
    return { gone: gone!, kept: kept! };
  };

  it('drops a grab on a point a stop edit removes', () => {
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    useStore.getState().addCut(a.id);
    const { gone } = stopEditSplit(a.id);
    useStore.getState().grabSnapPoint(gone);
    const cutId = useStore.getState().doc.boards.find((x) => x.id === a.id)!.cuts[0].id;
    useStore.getState().updateCut(a.id, cutId, { stopMin: 1 });
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('KEEPS a grab on a point a stop edit leaves in place', () => {
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    useStore.getState().addCut(a.id);
    const { kept } = stopEditSplit(a.id);
    useStore.getState().grabSnapPoint(kept);
    const cutId = useStore.getState().doc.boards.find((x) => x.id === a.id)!.cuts[0].id;
    useStore.getState().updateCut(a.id, cutId, { stopMin: 1 });
    expect(useStore.getState().grabbed).not.toBeNull();
  });
```

These should pass with no source change: `updateCut` already runs `dropHeldIfGone` after its
`edit()` (invariant 24). Mutation-check them in your report:
- comment out the `dropHeldIfGone(boardId)` call in `updateCut`, and the "drops" test must
  FAIL;
- restore it.

- [ ] **Step 7: Run everything**

Run: `npm test && npm run build`
Expected: all green, and the build passes.

- [ ] **Step 8: Commit**

```bash
git add -A src
git commit -m "feat(snap): a cut's mouth offers its whole opening, so a mortise's ends are snap targets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Properties — two stop fields, the reset, and the refusal

**Files:**
- Modify: `src/panels/Properties.tsx` (`CutRow`)
- Test: `src/panels/Properties.test.tsx`

**Interfaces:**
- Consumes: `Cut.stopMin`/`stopMax` (Task 1), `cutLabel` (Task 2), and the existing
  `updateCut`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('cuts', …)` in `src/panels/Properties.test.tsx`, using its
`renderWithBoard`.
- The default board is 24 × 5-1/2 × 3/4.
- The default cut is face thickness, from max, across width, offset 6, width 3/4, depth 3/8.
- So `across` is 5-1/2.

```ts
  const stored = (id: string) => useStore.getState().doc.boards.find((b) => b.id === id)!.cuts[0];
  const typeInto = async (label: RegExp, text: string) => {
    const field = screen.getByLabelText(label);
    await userEvent.clear(field);
    await userEvent.type(field, text);
    await userEvent.tab();
  };

  it('commits both stops and names the cut a mortise', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short of near end/i, '1');
    await typeInto(/stop short of far end/i, '1.5');
    expect(stored(id)).toMatchObject({ stopMin: 1, stopMax: 1.5 });
    expect(screen.getByText('mortise')).toBeInTheDocument();
  });

  it('names a cut stopped at one end a stopped dado', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short of far end/i, '1');
    expect(screen.getByText('stopped dado')).toBeInTheDocument();
  });

  it('refuses stops that exactly use up the across dimension', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short of near end/i, '3');
    // 3 + 2.5 = 5.5, the board's width: no cut left. The field's max allows
    // equality, so this is the row's refusal, not DimensionField's.
    await typeInto(/stop short of far end/i, '2.5');
    expect(screen.getByText(/would leave no cut/i)).toBeInTheDocument();
    expect(stored(id).stopMax).toBe(0);
  });

  it('clears the leave-no-cut error after an undo resolves it', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short of near end/i, '3');
    await typeInto(/stop short of far end/i, '2.5');
    expect(screen.getByText(/would leave no cut/i)).toBeInTheDocument();
    // Undoes stopMin = 3 (the refused stopMax never reached the stack). With
    // stopMin back at 0 nothing is wrong, so the error must not outlive it.
    act(() => { useStore.getState().undo(); });
    expect(screen.queryByText(/would leave no cut/i)).not.toBeInTheDocument();
  });

  it('resets both stops when Runs across changes', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short of near end/i, '1');
    await typeInto(/stop short of far end/i, '1');
    const across = screen.getByLabelText(/runs across/i) as HTMLSelectElement;
    const other = [...across.options].map((o) => o.value).find((v) => v !== across.value)!;
    await userEvent.selectOptions(across, other);
    expect(stored(id)).toMatchObject({ stopMin: 0, stopMax: 0 });
  });

  it('keeps the stops when Cut into changes and across does not', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short of near end/i, '1');
    // Face -> End (length). across stays width, so the stops still mean what they said.
    await userEvent.selectOptions(screen.getByLabelText(/cut into/i), 'length');
    expect(stored(id).across).toBe('width');
    expect(stored(id).stopMin).toBe(1);
  });

  it('resets the stops when Cut into takes the across dimension', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short of near end/i, '1');
    // Face -> Edge (width) moves across off width.
    await userEvent.selectOptions(screen.getByLabelText(/cut into/i), 'width');
    expect(stored(id).across).not.toBe('width');
    expect(stored(id)).toMatchObject({ stopMin: 0, stopMax: 0 });
  });

  it('allows a full-depth, full-width cut that stops short', async () => {
    const id = renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await typeInto(/stop short of far end/i, '1');
    await typeInto(/from the end/i, '0');
    await typeInto(/cut width/i, '24');
    await typeInto(/^depth$/i, '3/4');
    expect(screen.queryByText(/would remove the whole board/i)).not.toBeInTheDocument();
    expect(stored(id)).toMatchObject({ offset: 0, width: 24, depth: 0.75, stopMax: 1 });
  });
```

About the depth field's label:
- The existing tests use `/depth/i`. That still matches only the Depth field, because neither
  new label contains "depth".
- `/^depth$/i` is used in the last test to be explicit. If `getByLabelText` does not match it,
  because the label text carries extra content, use `/depth/i` as the existing tests do.

- [ ] **Step 2: Run them to confirm they fail**

Run: `npx vitest run src/panels/Properties.test.tsx`
Expected: the new tests FAIL, because there are no stop fields.

- [ ] **Step 3: Implement**

In `src/panels/Properties.tsx`, `CutRow`:

1. **The across length.** Next to `const faceDim = board[cut.face];` add
   `const acrossDim = board[cut.across];`.

2. **`wouldRemoveAll`.** Its return becomes:

```ts
    return next.depth >= board[next.face] &&
           next.offset <= 0 &&
           next.width >= board[p] &&
           next.stopMin <= 0 &&
           next.stopMax <= 0;
```

3. **The new refusal.** Add after `wouldRemoveAll`:

```ts
  // A stop pair meeting or passing across the whole `across` dimension leaves
  // no cut. Each stop field's max refuses a sum OVER the length, but equality
  // is a value DimensionField allows — so this is needed beside it, not
  // instead of it. Post-patch, like wouldRemoveAll, and for the same reason.
  const wouldLeaveNoCut = (patch: Partial<Cut>) => {
    const next = { ...cut, ...patch };
    return next.stopMin + next.stopMax >= board[next.across];
  };
```

4. **The stale-error effect.** Change it to clear only when neither refusal holds, and add the
   stops to its key list:

```ts
  useEffect(() => {
    if (error && !wouldRemoveAll({}) && !wouldLeaveNoCut({})) setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cut.face, cut.across, cut.offset, cut.width, cut.depth, cut.stopMin, cut.stopMax,
      board.length, board.width, board.thickness]);
```

   Update its comment's last sentence to "Keyed on exactly what `wouldRemoveAll` and
   `wouldLeaveNoCut` read, so it re-checks whenever any of that changes."

5. **`set`.** It becomes:

```ts
  const set = (patch: Partial<Cut>) => {
    if (wouldRemoveAll(patch)) {
      setError('That would remove the whole board.');
      setAttempt((n) => n + 1);
      return;
    }
    if (wouldLeaveNoCut(patch)) {
      setError('That would leave no cut.');
      setAttempt((n) => n + 1);
      return;
    }
    setError(null);
    updateCut(board.id, cut.id, patch);
  };
```

6. **`repositionForAxes`.**
   - Its return becomes:

```ts
    // The stops measure along `across`. A new `across` makes them numbers
    // along a different dimension that describe nothing, so they RESET —
    // unlike offset/width/depth, which keep meaning on their own axes and are
    // clamped. Same `across`: kept, and still legal.
    return {
      face, across, offset, width, depth,
      ...(across === cut.across ? {} : { stopMin: 0, stopMax: 0 }),
    };
```

   - Add one sentence to its doc comment: "The stops are the exception that resets rather
     than clamps (see the return)."

7. **The two fields.** Insert these JSX elements directly after the "Runs across" `.field`
   `div` and before the `From the end` `DimensionField`:

```tsx
      <DimensionField key={`stopMin-${attempt}`} label="Stop short of near end" precision={precision}
        value={cut.stopMin} min={0} max={Math.max(0, acrossDim - cut.stopMax)}
        onCommit={(v) => set({ stopMin: v })} />
      <DimensionField key={`stopMax-${attempt}`} label="Stop short of far end" precision={precision}
        value={cut.stopMax} min={0} max={Math.max(0, acrossDim - cut.stopMin)}
        onCommit={(v) => set({ stopMax: v })} />
```

- [ ] **Step 4: Run everything**

Run: `npm test && npm run build`
Expected: all green, and the build passes.

- [ ] **Step 5: Mutation-check the new refusals**

Apply each mutation, run `npx vitest run src/panels/Properties.test.tsx`, confirm the named
test FAILS, then revert. List each result in your report.

| Mutation | Test that must fail |
|---|---|
| In `wouldLeaveNoCut`, `>=` becomes `>` | "refuses stops that exactly use up the across dimension" |
| Drop `cut.stopMin, cut.stopMax` from the effect's deps | "clears the leave-no-cut error after an undo resolves it" |
| `repositionForAxes` always keeps the stops | "resets both stops when Runs across changes" |
| `repositionForAxes` always resets the stops | "keeps the stops when Cut into changes and across does not" |
| Delete the `next.stopMin <= 0 && next.stopMax <= 0` clause | "allows a full-depth, full-width cut that stops short" |

If a mutation survives, strengthen the test so it fails, and report what you changed.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(properties): Stop short of near/far end; refuse a stop pair that leaves no cut

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: CLAUDE.md rules for the round

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/follow-ups.md` (171 only)

**Interfaces:** documentation only. No code.

- [ ] **Step 1: Make these edits to `CLAUDE.md`, and only these**

1. **Status.** In the first line of the Status section, change "schema `CURRENT_VERSION`
   **6**" to **7**.

2. **The Versioning section.**
   - Change "`CURRENT_VERSION` is **6**" to **7**.
   - To the document-level bullet, add: "v6→v7 `Cut.stopMin`/`stopMax` (defaulted to 0 in
     `validateCuts`)".
   - After the paragraph about v5's and v6's arguments, add:

```markdown
v7's argument is the strongest of the three: **wrong geometry**. A v6 build opening a v7
file ignores the stops, shows a blind mortise as a through-dado with nothing saying so, and
autosaves that shape back.
```

3. **"Where things live".**
   - **`cuts.ts`:** append "`cutRegion` honours `stopMin`/`stopMax` (crossed stops remove
     nothing); `cutLabel` → `CutKind`, seven words derived from the shape (stopped-cuts spec
     §4.1)".
   - **`depthField.ts`:** append "reads its rectangles from `cutRegion` — it once rebuilt
     them with the across span hard-coded to full length".
   - **`cutlist.ts`:** append "`cutSignature` is built from `SIGNATURE_FIELDS`, checked
     against `Cut` by `satisfies` (inv 40)".
   - **`snapPoints.ts`:** change "(floor rectangle 9 + the mouth's two shoulder lines 6, its
     middle row spanning the opening; 15 for a dado, 12 for a rabbet" to "(floor rectangle 9 +
     the mouth's opening, every point but its centre, 8; stockProbe drops a through-cut's two
     across-end mouth points, so 15 for a dado, 12 for a rabbet, 17 for a blind mortise".
   - **`Properties.tsx`** (the `Properties.tsx` line; add one if it has none): append "Stop short of near/far
     end; a stop pair leaving no cut is refused, and changing `across` RESETS the stops".

4. **Invariant 40.** Add it after invariant 39:

```markdown
40. **Anything that decides "same cut" from a list of `Cut`'s fields must be checked against
    the type by the compiler.** `cutSignature` decides which parts share a cut-list row, and
    it was a hand-written field list. Adding `stopMin`/`stopMax` to `Cut` without adding them
    there would have grouped a mortised leg with a through-dadoed one: one row, one setup,
    half the legs cut wrong, and every existing test green. So `SIGNATURE_FIELDS` is a table
    that `satisfies Record<Exclude<keyof Cut, 'id'>, true>`, and a new `Cut` field fails `tsc`
    until it is listed. This is invariant 15 one layer over: a hand-written list of what a
    computation reads goes stale silently. **Do not replace the table with a list in the
    function body**, and do not add a field to the table's exclusions without a written
    reason.
```

5. **The rounds table.** Do NOT add a row yet. The controller adds it after the live check.

- [ ] **Step 2: Follow-up 171**

In `docs/follow-ups.md`, append one paragraph to entry 171:

```markdown
**2026-10-04: the stopped cuts round landed first.** A `Cut` can stop short of either end of
its `across` dimension (`stopMin`/`stopMax`, schema v7), so mortises, through mortises and
stopped dados exist. The "overlap not accounted for by a cut" rule can be written against a
tenon sitting in a mortise rather than only in a through slot. Angled and round joinery are
still out.
```

- [ ] **Step 3: Check and commit**

Run: `npm test && npm run build`. Nothing should change, but run them anyway.

```bash
git add CLAUDE.md docs/follow-ups.md
git commit -m "docs: stopped cuts — invariant 40, schema v7, where things live, 171 note

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the tasks (the controller, not a task)

- **The final whole-branch review**, on the most capable model.
- **The live check (spec §8).** Claude drives the dev server and the user watches. No paid
  calls.
- **The record:**
  - `docs/browser-verification-stopped-cuts.md`, with screenshots in `docs/img/`;
  - the history entry and the rounds-table row;
  - then the merge and the deploy, each on the user's word.
