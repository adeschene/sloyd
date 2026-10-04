# Cut-List Wording Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a cut gets the word a woodworker would use, the same word however it is stored, and a
tenon prints as one line.

**Architecture:**
- `cutLabel` names a cut from its clipped box's opening: which sides reach the board's edge, plus
  its proportions.
- A new `findTenons` recognises groups of end cuts that leave one tongue.
- The cut list prints one line per tenon.
- Properties labels a tenon's cuts `tenon shoulder`.

**Tech Stack:** TypeScript (strict), Vitest + Testing Library, React 19.

**Spec:** `docs/superpowers/specs/2026-10-04-sloyd-cut-words-design.md`. Read it first; it is
the authority for this plan.

## Global Constraints

- **Branch and commits:**
  - Branch `cutwords`; never `master`; no PRs.
  - Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Gates:** every task ends with `npm test` green and `npm run build` passing. The build
  typechecks the tests.
- **Expectations:** never edit a test's expected value to make it pass. If a plan-supplied
  expectation looks wrong, STOP and report.
- **No geometry, schema, cut, or grouping changes.** Words only.
- **Words, exact:**
  - `dado`, `rabbet`, `stopped dado`, `stopped rabbet`, `notch`, `mortise`, `blind dado`,
    `through mortise`;
  - `tenon shoulder`, in Properties only.
- **Tenon line, exact:** `<ℓ> tenon, <thickness> thick × <width> wide — at the length <min|max> end`.
  The numbers are formatted by `formatLength`, as `setupLine` does.
- **Layers:** `src/document/tenons.ts` imports only `./types`, `./geometry`, `./cuts`.

## Review Focus

1. **The same box stored two ways gets one word** (181). This is Task 1's pair test.
2. **Every case the old table named correctly keeps its word.** These are Task 1's pinned old
   cases.
3. **A tenon at the max end, whose ℓ comes from a subtraction**, still groups. This is Task 2's
   both-ends test.
4. **A full-length edge rabbet pair is not a tenon.** This is Task 2's `ℓ ≤ L/2` test.
5. **An untouched cut's setup line is byte-identical** (Task 3).

---

### Task 1: `cutLabel` from the opening

**Files:**
- Modify: `src/document/cuts.ts`: export `FLUSH_EPSILON`, rewrite `cutLabel`, keep the old body
  as a private `fieldLabel`, add `'blind dado'` to `CutKind`.
- Test: `src/document/cuts.test.ts`

**Interfaces:**
- Produces:
  - `export const FLUSH_EPSILON = 1e-9` (keep its doc comment);
  - `cutLabel(board, cut): CutKind`;
  - `CutKind` gains `'blind dado'`.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/cuts.test.ts`. Add `cutLabel`, `createBoard` and `Cut` imports if they
are missing.

```ts
describe('cutLabel names the opening (cut-words spec §2)', () => {
  // 24 long × 6 wide × 1 thick. Every cut enters the thickness face from min.
  const b = createBoard({ length: 24, width: 6, thickness: 1 });
  const c = (over: Partial<Cut>): Cut => ({
    id: 'c', face: 'thickness', from: 'min', across: 'width',
    offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0, ...over,
  });

  it.each<[string, Partial<Cut>, string]>([
    ['a mid-face dado', {}, 'dado'],
    ['an end rabbet', { offset: 0 }, 'rabbet'],
    ['the whole face lowered', { offset: 0, width: 24 }, 'rabbet'],
    ['a rabbet stopped at one end (a corner)', { offset: 0, stopMax: 2 }, 'stopped rabbet'],
    ['a dado stopped at one end', { stopMax: 2 }, 'stopped dado'],
    ['a hinge pocket on an edge (3in along, 3/4in in)',
      { across: 'length', offset: 0, width: 0.75, stopMin: 10, stopMax: 11 }, 'notch'],
    ['a long edge rabbet stopped at both ends (20in along, 3/4in in)',
      { across: 'length', offset: 0, width: 0.75, stopMin: 2, stopMax: 2 }, 'stopped rabbet'],
    ['a tenon mortise (1/2in × 2in, 3/4in deep)',
      { across: 'length', offset: 2, width: 0.5, depth: 0.75, stopMin: 10, stopMax: 12 }, 'mortise'],
    ['a shelf housing closed at both ends (3/4in × 4in, 1/4in deep)',
      { stopMin: 1, stopMax: 1 }, 'blind dado'],
    ['a through mortise', { across: 'length', offset: 2, width: 0.5, depth: 1, stopMin: 10, stopMax: 12 }, 'through mortise'],
  ])('%s → %s', (_, over, want) => {
    expect(cutLabel(b, c(over))).toBe(want);
  });

  it('gives one box stored two ways one word (fu 181)', () => {
    // Box: thickness [0, 0.25], width [0, 0.75] (at the edge), length [2, 22].
    const acrossLength = c({ across: 'length', offset: 0, width: 0.75, stopMin: 2, stopMax: 2 });
    const acrossWidth = c({ across: 'width', offset: 2, width: 20, stopMin: 0, stopMax: 5.25 });
    expect(cutLabel(b, acrossLength)).toBe('stopped rabbet');
    expect(cutLabel(b, acrossWidth)).toBe('stopped rabbet');
  });

  it('ties: a square pocket on an edge is a notch; a pocket as deep as wide is a blind dado', () => {
    expect(cutLabel(b, c({ across: 'length', offset: 0, width: 0.75, stopMin: 10, stopMax: 13.25 }))).toBe('notch');
    expect(cutLabel(b, c({ across: 'length', offset: 2, width: 0.5, depth: 0.5, stopMin: 10, stopMax: 12 }))).toBe('blind dado');
  });

  it('a cut that removes nothing keeps its old-table word', () => {
    expect(cutLabel(b, c({ offset: 30 }))).toBe('dado');
  });
});
```

**Where the numbers come from** (all hand-derived; if one differs, STOP and report):

- **The hinge pocket.**
  - It runs along length: 24 − 10 − 11 = 3. It reaches in along width: 0.75.
  - Is it "reach > run"? No (0.75 is not more than 3).
  - Is it "run > 4 × reach"? No (3 is not more than 3).
  - So it is a `notch`.
- **The long edge rabbet.** It runs 20 and reaches 0.75; 20 is more than 3, so it is a
  `stopped rabbet`.
- **The mortise.** The opening is 0.5 × 2 and the depth is 0.75; 0.75 is more than 0.5, so it is
  a `mortise`.
- **The housing.** The opening is 0.75 × 4 and the depth is 0.25; 0.25 is not more than 0.75, so
  it is a `blind dado`.
- **The square tie.** It runs 24 − 10 − 13.25 = 0.75 and reaches 0.75. That is not "more", so it
  is a `notch`.
- **The depth tie.** The depth is 0.5 and the smaller extent is 0.5. That is not "more", so it is
  a `blind dado`.
- **The 181 pair.** Both are the same box. One edge (width min) is open, the run is 20, and the
  reach is 0.75, so both are a `stopped rabbet`.
- **The cut that removes nothing.** It sits at offset 30 on a 24″ board. Under the old table it
  has no stops and is not flush, so it is a `dado`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/document/cuts.test.ts`

Expected: these FAIL against the current code:
- the hinge pocket;
- the long edge rabbet;
- the housing;
- the pair;
- the ties.

The still-right rows pass already.

- [ ] **Step 3: Implement**

In `src/document/cuts.ts`:

1. Change `const FLUSH_EPSILON = 1e-9;` to `export const FLUSH_EPSILON = 1e-9;`.
2. Add `'blind dado'` to `CutKind`.
3. Rename the current `cutLabel` body to `function fieldLabel(board: Board, cut: Cut): CutKind`.
   It stays private, keeps its comments, and its doc comment should say "The OLD table
   (stopped-cuts spec §4.1). Used only for a cut that removes nothing — it has no opening to
   read".
4. Add the new `cutLabel`:

```ts
/**
 * What a cut is called (cut-words spec §2): read from the OPENING its clipped
 * box makes on the face it enters — which of the opening's four sides reach
 * the board's edge, and its proportions. Derived only from the box, so one
 * pocket stored two ways (either in-plane dimension as `across`) gets one
 * word (fu 181).
 */
export function cutLabel(board: Board, cut: Cut): CutKind {
  if (cutRemovesNothing(board, cut)) return fieldLabel(board, cut);
  const r = cutRegion(board, cut);
  const [a, b] = DIMENSION_ORDER.filter((d) => d !== cut.face);
  const span = (d: Dimension): Span => [Math.max(0, r[d][0]), Math.min(board[d], r[d][1])];
  const ext = (d: Dimension) => span(d)[1] - span(d)[0];
  const opens = (d: Dimension) =>
    (span(d)[0] <= FLUSH_EPSILON ? 1 : 0) + (span(d)[1] >= board[d] - FLUSH_EPSILON ? 1 : 0);
  const na = opens(a);
  const nb = opens(b);
  if (na + nb >= 3) return 'rabbet';
  if (na + nb === 2) return na === 2 || nb === 2 ? 'dado' : 'stopped rabbet';
  if (na + nb === 1) {
    const openAxis = na === 1 ? a : b;
    const other = na === 1 ? b : a;
    const reach = ext(openAxis);
    const run = ext(other);
    if (reach > run) return 'stopped dado';
    return run > 4 * reach ? 'stopped rabbet' : 'notch';
  }
  if (cut.depth >= board[cut.face]) return 'through mortise';
  return cut.depth > Math.min(ext(a), ext(b)) ? 'mortise' : 'blind dado';
}
```

5. `cutRemovesNothing` is declared before `cutLabel` in the file, so no move is needed. If it is
   declared after, move `cutLabel` below it.

- [ ] **Step 4: Run, then fix any existing test that pinned an OLD wrong word**

Run: `npx vitest run src/document`, then `npm test`.

The ONLY existing expectations allowed to change are ones this spec says are changing:
- the old `notch` row (flush + both stops);
- a closed shallow pocket that was `mortise`;
- a both-ends-stopped edge rabbet that was `stopped dado` or `notch`.

For each one you change:
- check by hand that the new word follows from spec §2.2;
- cite the row in a comment;
- list it in the report.

Anything else that goes red is a bug in the new code: fix the code.

- [ ] **Step 5: Mutation-check**

Apply each change, check the test that should fail, and record the result:

| Mutation | Test that must fail |
|---|---|
| `reach > run` → `reach >= run` | the square tie |
| `run > 4 * reach` → `run >= 4 * reach` | the hinge pocket |
| `cut.depth > Math.min(...)` → `>=` | the depth tie |
| Drop the `cutRemovesNothing` early return | the removes-nothing test, or a crash |

- [ ] **Step 6: Commit**

Run `npm test && npm run build`, then commit:
`feat(cuts): name a cut from its opening — one word per shape (fu 181, 189)`.

---

### Task 2: `findTenons`

**Files:**
- Create: `src/document/tenons.ts`
- Modify: `src/document/document.ts` (re-export `findTenons` and `Tenon`)
- Test:
  - Create `src/document/tenons.test.ts` (hand-built cuts).
  - Create `src/generate/joints/tenons.recipe.test.ts` (real recipe output).

**Interfaces:**
- Consumes: `cutRegion`, `cutsThatRemoveStock`, `FLUSH_EPSILON` (Task 1).
- Produces:

```ts
export interface Tenon { end: 'min' | 'max'; length: number; thickness: number; width: number; cutIds: string[] }
export function findTenons(board: Board): Tenon[]
```

- [ ] **Step 1: Write the failing tests**

Create `src/document/tenons.test.ts`:

```ts
import { createBoard } from './document';
import { findTenons } from './tenons';
import type { Cut } from './types';

// An 18in rail, 3-1/2 wide, 3/4 thick.
const rail = (cuts: Cut[]) => createBoard({ length: 18, width: 3.5, thickness: 0.75, cuts });
// An end pocket: thickness face from `from`, `depth` deep, across width with stops, at the length min (or max) end, ℓ long.
const cheek = (id: string, from: 'min' | 'max', depth: number, ell: number, end: 'min' | 'max' = 'min'): Cut => ({
  id, face: 'thickness', from, across: 'width', offset: end === 'min' ? 0 : 18 - ell, width: ell, depth, stopMin: 0, stopMax: 0,
});
const shoulder = (id: string, from: 'min' | 'max', depth: number, ell: number, end: 'min' | 'max' = 'min'): Cut => ({
  id, face: 'width', from, across: 'thickness', offset: end === 'min' ? 0 : 18 - ell, width: ell, depth, stopMin: 0, stopMax: 0,
});
const four = (end: 'min' | 'max', p: string) => [
  cheek(`${p}1`, 'min', 0.25, 1, end), cheek(`${p}2`, 'max', 0.25, 1, end),
  shoulder(`${p}3`, 'min', 0.5, 1, end), shoulder(`${p}4`, 'max', 0.5, 1, end),
];

describe('findTenons', () => {
  it('a four-shoulder tenon', () => {
    expect(findTenons(rail(four('min', 'a')))).toEqual([
      { end: 'min', length: 1, thickness: 0.25, width: 2.5, cutIds: ['a1', 'a2', 'a3', 'a4'] },
    ]);
  });

  it('a two-cheek tenon', () => {
    expect(findTenons(rail([cheek('a', 'min', 0.25, 1), cheek('b', 'max', 0.25, 1)]))).toEqual([
      { end: 'min', length: 1, thickness: 0.25, width: 3.5, cutIds: ['a', 'b'] },
    ]);
  });

  it('a barefaced tenon (one cheek and both shoulders)', () => {
    expect(findTenons(rail([cheek('a', 'min', 0.25, 1), shoulder('b', 'min', 0.5, 1), shoulder('c', 'max', 0.5, 1)]))).toEqual([
      { end: 'min', length: 1, thickness: 0.5, width: 2.5, cutIds: ['a', 'b', 'c'] },
    ]);
  });

  it('tenons at both ends, the max end grouped despite its ℓ being a subtraction', () => {
    const t = findTenons(rail([...four('min', 'a'), ...four('max', 'b')]));
    expect(t.map((x) => [x.end, x.length, x.cutIds.length])).toEqual([['min', 1, 4], ['max', 1, 4]]);
  });

  it('a single end rabbet is a lap, not a tenon', () => {
    expect(findTenons(rail([cheek('a', 'min', 0.25, 1)]))).toEqual([]);
  });

  it('two end cuts that leave TWO tongues are not a tenon', () => {
    // A slot through the middle of the thickness, split into two cuts across the width.
    const slot = (id: string, stopMin: number, stopMax: number): Cut => ({
      id, face: 'length', from: 'min', across: 'width', offset: 0.25, width: 0.25, depth: 1, stopMin, stopMax,
    });
    expect(findTenons(rail([slot('a', 0, 2), slot('b', 1.5, 0)]))).toEqual([]);
  });

  it('two end cuts of different ℓ are not a tenon', () => {
    expect(findTenons(rail([cheek('a', 'min', 0.25, 1), cheek('b', 'max', 0.25, 1.5)]))).toEqual([]);
  });

  it('a full-length edge rabbet pair is not a tenon (ℓ ≤ L/2)', () => {
    expect(findTenons(rail([cheek('a', 'min', 0.25, 18), cheek('b', 'max', 0.25, 18)]))).toEqual([]);
  });
});
```

**Where the numbers come from** (hand-derived; if one differs, STOP and report):

- **The four-shoulder tenon.** The section is 3.5 wide by 0.75 thick.
  - The cheeks take thickness [0, .25] and [.5, .75], which leaves .25.
  - The shoulders take width [0, .5] and [3, 3.5], which leaves 2.5.
- **The barefaced tenon.**
  - One cheek takes thickness [0, .25], which leaves thickness [.25, .75] = 0.5.
  - The shoulders leave width 2.5.
- **The slot.**
  - Cut `a` covers width [0, 1.5] and cut `b` covers [1.5, 3.5].
  - Both cover thickness [.25, .5].
  - Together they remove a full-width slot, which leaves two rectangles: thickness [0, .25] and
    [.5, .75].

Create `src/generate/joints/tenons.recipe.test.ts`, using real recipe output (the round's own
LEG_RAIL fixture):

```ts
import { designToDocument } from '../../document/generated';
import { findTenons } from '../../document/tenons';
import { findSites } from './sites';
import { applyJoints } from './recipes';

it('recognises the tenon joinery actually builds', () => {
  const doc = designToDocument({ name: 'T', parts: [
    { name: 'Leg', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 } },
    { name: 'Rail', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3.5, z: 0.75 } },
  ] }).doc;
  const out = applyJoints(doc, findSites(doc), [{ site: 1, joint: 'mortise-tenon', tenonLength: 1 }]);
  const rail = out.doc.boards.find((b) => b.name === 'Rail')!;
  const t = findTenons(rail);
  expect(t).toHaveLength(1);
  expect(t[0]).toMatchObject({ end: 'min', length: 1, thickness: 0.25, width: 2.5 });
  expect([...t[0].cutIds].sort()).toEqual(rail.cuts.map((c) => c.id).sort());
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/document/tenons.test.ts src/generate/joints/tenons.recipe.test.ts`
Expected: FAIL, because the module does not exist.

- [ ] **Step 3: Implement**

Create `src/document/tenons.ts`:

```ts
import type { Board, Span } from './types';
import { FLUSH_EPSILON, cutRegion, cutsThatRemoveStock } from './cuts';

export interface Tenon { end: 'min' | 'max'; length: number; thickness: number; width: number; cutIds: string[] }

/**
 * Tenons on a board (cut-words spec §3), recognised from its cuts rather than
 * stored, so a hand-made tenon is named as well as one joinery built. At each
 * end of the LENGTH: the stock-removing cuts reaching that end and spanning
 * the same ℓ (≤ half the board, so a full-length edge rabbet never counts),
 * at least two of them, whose union leaves EXACTLY ONE rectangle of the
 * section, smaller than the section.
 */
export function findTenons(board: Board): Tenon[] {
  const L = board.length;
  const out: Tenon[] = [];
  const clip = (s: Span, max: number): Span => [Math.max(0, s[0]), Math.min(max, s[1])];
  for (const end of ['min', 'max'] as const) {
    const groups: { ell: number; ids: string[]; rects: { w: Span; t: Span }[] }[] = [];
    for (const cut of cutsThatRemoveStock(board)) {
      const r = cutRegion(board, cut);
      const [lo, hi] = clip(r.length, L);
      const atEnd = end === 'min' ? lo <= FLUSH_EPSILON : hi >= L - FLUSH_EPSILON;
      if (!atEnd) continue;
      const ell = end === 'min' ? hi : L - lo;
      if (ell > L / 2 + FLUSH_EPSILON) continue;
      const rect = { w: clip(r.width, board.width), t: clip(r.thickness, board.thickness) };
      const g = groups.find((x) => Math.abs(x.ell - ell) <= FLUSH_EPSILON);
      if (g) { g.ids.push(cut.id); g.rects.push(rect); } else groups.push({ ell, ids: [cut.id], rects: [rect] });
    }
    for (const g of groups) {
      if (g.ids.length < 2) continue;
      const left = remainingRectangle(board.width, board.thickness, g.rects);
      if (!left) continue;
      const full = left.w[0] <= FLUSH_EPSILON && left.w[1] >= board.width - FLUSH_EPSILON &&
        left.t[0] <= FLUSH_EPSILON && left.t[1] >= board.thickness - FLUSH_EPSILON;
      if (full) continue;
      out.push({ end, length: g.ell, thickness: left.t[1] - left.t[0], width: left.w[1] - left.w[0], cutIds: g.ids });
    }
  }
  return out;
}

/** The section [0,W]×[0,T] minus the rectangles, when what remains is exactly one rectangle; else null. */
function remainingRectangle(W: number, T: number, rects: { w: Span; t: Span }[]): { w: Span; t: Span } | null {
  const cuts = (max: number, spans: Span[]) =>
    [...new Set([0, max, ...spans.flat().filter((v) => v > 0 && v < max)])].sort((a, b) => a - b);
  const ws = cuts(W, rects.map((r) => r.w));
  const ts = cuts(T, rects.map((r) => r.t));
  const free: [number, number][] = [];
  for (let i = 0; i < ws.length - 1; i++) {
    for (let j = 0; j < ts.length - 1; j++) {
      const cw = (ws[i] + ws[i + 1]) / 2;
      const ct = (ts[j] + ts[j + 1]) / 2;
      if (!rects.some((r) => cw > r.w[0] && cw < r.w[1] && ct > r.t[0] && ct < r.t[1])) free.push([i, j]);
    }
  }
  if (free.length === 0) return null;
  const i0 = Math.min(...free.map((f) => f[0])), i1 = Math.max(...free.map((f) => f[0]));
  const j0 = Math.min(...free.map((f) => f[1])), j1 = Math.max(...free.map((f) => f[1]));
  if (free.length !== (i1 - i0 + 1) * (j1 - j0 + 1)) return null;
  return { w: [ws[i0], ws[i1 + 1]], t: [ts[j0], ts[j1 + 1]] };
}
```

Then:
- In `src/document/document.ts`, add `export { findTenons } from './tenons';` and
  `export type { Tenon } from './tenons';`.
- Check that `Span` is exported from `./types`. Import it from wherever `cuts.ts` gets it.

- [ ] **Step 4: Run, mutation-check, commit**

Run: `npx vitest run src/document src/generate/joints`, then `npm test && npm run build`.

Apply each change, check the test that should fail, and record the result:

| Mutation | Test that must fail |
|---|---|
| Drop the `ell > L/2` cap | the full-length pair |
| `ids.length < 2` → `< 1` | the single rabbet |
| Remove the "exactly fill the bounding box" check | the two-tongue slot |
| Group ℓ by `===` instead of the epsilon | the both-ends test. If it still passes, say so: the max-end subtraction may be exact on this fixture. Do not change the test; note it. |

Commit: `feat(document): findTenons — recognise a tenon from the cuts that leave one tongue (fu 180)`.

---

### Task 3: one line per tenon; `tenon shoulder` in Properties

**Files:**
- Modify: `src/document/cutlist.ts`, `src/panels/Properties.tsx`
- Test: `src/document/cutlist.test.ts`, `src/panels/Properties.test.tsx`

**Interfaces:**
- Consumes: `findTenons` (Task 2).

- [ ] **Step 1: Write the failing tests**

Append to `src/document/cutlist.test.ts`, using the file's `docWith`:

```ts
describe('tenons on the sheet (fu 180)', () => {
  const cheek = (id: string, from: 'min' | 'max', end: 'min' | 'max'): Cut => ({
    id, face: 'thickness', from, across: 'width', offset: end === 'min' ? 0 : 23, width: 1, depth: 0.25, stopMin: 0, stopMax: 0,
  });
  const shoulder = (id: string, from: 'min' | 'max', end: 'min' | 'max'): Cut => ({
    id, face: 'width', from, across: 'thickness', offset: end === 'min' ? 0 : 23, width: 1, depth: 0.5, stopMin: 0, stopMax: 0,
  });
  const tenon = (end: 'min' | 'max', p: string) =>
    [cheek(`${p}1`, 'min', end), cheek(`${p}2`, 'max', end), shoulder(`${p}3`, 'min', end), shoulder(`${p}4`, 'max', end)];

  it('prints one line per tenon, replacing its shoulder lines', () => {
    // The default board is 24 × 5-1/2 × 3/4: tenon 1 long, 1/4 thick, 4-1/2 wide.
    const list = buildCutList(docWith({ cuts: [...tenon('min', 'a'), ...tenon('max', 'b')] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '1" tenon, 1/4" thick × 4-1/2" wide — at the length min end',
      '1" tenon, 1/4" thick × 4-1/2" wide — at the length max end',
    ]);
  });

  it('prints a dado beside a tenon exactly as before', () => {
    const list = buildCutList(docWith({ cuts: [...tenon('min', 'a'), dado()] }));
    expect(list.groups[0].rows[0].setup).toEqual([
      '1" tenon, 1/4" thick × 4-1/2" wide — at the length min end',
      '3/4" dado, 1/4" deep — into the thickness face (min side), 6" from the length min end, running across the width',
    ]);
  });
});
```

Append to `src/panels/Properties.test.tsx`, inside `describe('cuts')` and using its helpers:

```ts
  it('labels a tenon\'s cuts "tenon shoulder" and a lone rabbet "rabbet" (fu 180)', async () => {
    const id = renderWithBoard();
    const cheek = (cid: string, from: 'min' | 'max') => ({ id: cid, face: 'thickness' as const, from, across: 'width' as const, offset: 0, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 });
    act(() => { useStore.getState().updateBoard(id, { cuts: [cheek('a', 'min'), cheek('b', 'max')] }); });
    expect(screen.getAllByText('tenon shoulder')).toHaveLength(2);
    act(() => { useStore.getState().updateBoard(id, { cuts: [cheek('a', 'min')] }); });
    expect(screen.queryByText('tenon shoulder')).not.toBeInTheDocument();
    expect(screen.getByText('rabbet')).toBeInTheDocument();
  });
```

If `updateBoard` cannot set `cuts` (invariant 2 routes cut edits through their own actions),
seed the cuts with `addCut` plus `updateCut` instead. Keep the assertions.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/document/cutlist.test.ts src/panels/Properties.test.tsx`
Expected: FAIL. The sheet prints rabbet lines, and Properties shows `rabbet`.

- [ ] **Step 3: Implement**

In `cutlist.ts`:

1. Import `findTenons` from `./tenons`.
2. Add:

```ts
/** A tenon as one bench line (fu 180): it replaces the shoulder cuts it is made of. */
function tenonLine(t: Tenon, precision: number): string {
  const f = (n: number) => formatLength(n, precision);
  return `${f(t.length)} tenon, ${f(t.thickness)} thick × ${f(t.width)} wide — at the length ${t.end} end`;
}

/** Setup lines: one per tenon (where its first cut stood), the rest one per cut, unchanged. */
function setupLines(board: Board, precision: number): string[] {
  const tenons = findTenons(board);
  const owner = new Map(tenons.flatMap((t) => t.cutIds.map((id) => [id, t] as const)));
  const done = new Set<Tenon>();
  const lines: string[] = [];
  for (const cut of cutsThatRemoveStock(board)) {
    const t = owner.get(cut.id);
    if (!t) { lines.push(setupLine(board, cut, precision)); continue; }
    if (!done.has(t)) { done.add(t); lines.push(tenonLine(t, precision)); }
  }
  return lines;
}
```

3. Replace `setup: cutsThatRemoveStock(board).map((cut) => setupLine(board, cut, precision)),`
   with `setup: setupLines(board, precision),`. Import the `Tenon` type.

In `Properties.tsx`, `CutRow`:
- import `findTenons`;
- compute `const word = findTenons(board).some((t) => t.cutIds.includes(cut.id)) ? 'tenon shoulder' : cutLabel(board, cut);`;
- use `word` in both the head `<span>` and the remove button's `aria-label`.

- [ ] **Step 4: Run, mutation-check, commit**

Run `npm test && npm run build`.

Apply each change, check the test that should fail, and record the result:

| Mutation | Test that must fail |
|---|---|
| Push the tenon line once per CUT | the one-line test |
| Skip non-tenon cuts | the dado-beside test |
| Always use `cutLabel` in Properties | the Properties test |

Commit: `feat(cutlist): one line per tenon; Properties labels its cuts "tenon shoulder" (fu 180)`.

---

### Task 4: rules docs

**Files:** `CLAUDE.md`, `docs/follow-ups.md`

- [ ] **Step 1: follow-ups**

Close 180, 181 and 189, each with a short "CLOSED 2026-10-04 by the cut-words round" paragraph
that says how:
- **180:** `findTenons`, with one line per tenon and `tenon shoulder` in Properties.
- **181:** words come from the opening, so one box gets one word.
- **189:** a closed pocket is named by its proportions, giving `blind dado`.

Say that 181's example, the joinery Top's back rabbet, now reads `stopped rabbet`.

- [ ] **Step 2: CLAUDE.md**

1. In "Where things live", change the `cuts.ts` entry's clause about `cutLabel → CutKind, seven
   words…` to read: `cutLabel` names a cut from its OPENING (sides reaching the edge, plus
   proportions; cut-words spec §2). One box, one word. A cut that removes nothing keeps the old
   table.
2. Add a `tenons.ts` line: `findTenons` recognises a tenon from the end cuts that leave one
   tongue (ℓ ≤ L/2, at least 2 cuts, exactly one remaining rectangle). The sheet prints one line
   per tenon.
3. Update the test count in Status and Commands.
4. Do NOT add the rounds row or a Status paragraph. The controller adds those after the live
   check.
5. Keep the tree lines within their neighbours' width.

- [ ] **Step 3: Check and commit**

Run `npm test && npm run build`. Commit: `docs: cut words — follow-ups 180/181/189 closed, cuts.ts and tenons.ts entries`.

---

## After the tasks (the controller)

1. The final whole-branch review.
2. The live check (spec §6): no paid calls; the user judges the words.
3. The write-up, then the merge and deploy on the user's word.

---

## Amendment: live-check rulings (spec §2.4–2.7)

The live check found a housing that runs out into the back rabbet printing as `stopped dado … stopped 1/4" short`. The user chose to name cuts from the stock that is actually there. Two further rulings, calls 2 and 3, are in spec §2.5 and §2.6. These tasks follow the Global Constraints above.

### Task 5: `openSides`, the corner notch, mortise by depth, and the stop clause

**Files:**
- Modify: `src/document/cuts.ts`
  - add `openSides`;
  - rewrite `cutLabel`'s open counting and its closed branch;
  - add the corner-notch test.
- Modify: `src/document/cutlist.ts`: `stopClause` takes the board and leaves out an open stop.
- Test: `src/document/cuts.test.ts`, `src/document/cutlist.test.ts`

**Interfaces:**
- Produces: `export function openSides(board: Board, cut: Cut): Record<Dimension, { min: boolean; max: boolean }>`. The entry for `cut.face` is always `{ min: false, max: false }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/cuts.test.ts`, importing `openSides`:

```ts
describe('open means no stock (cut-words spec §2.4)', () => {
  // A bookcase side: 72 long × 11-1/4 wide (back to front) × 3/4 thick.
  // The back rabbet removes width [0, 1/4] × thickness [3/8, 3/4] along the whole length.
  const backRabbet = (over: Partial<Cut> = {}): Cut => ({
    id: 'r', face: 'width', from: 'min', across: 'length', offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0, ...over,
  });
  // A shelf housing 24in up: width [stopMin, 11.25 − stopMax] × thickness [1/2, 3/4].
  const housing = (over: Partial<Cut> = {}): Cut => ({
    id: 'h', face: 'thickness', from: 'max', across: 'width', offset: 24, width: 0.75, depth: 0.25, stopMin: 0.25, stopMax: 0, ...over,
  });
  const side = (...cuts: Cut[]) => createBoard({ length: 72, width: 11.25, thickness: 0.75, cuts });

  it('a housing that runs out into the back rabbet is a dado', () => {
    const b = side(backRabbet(), housing());
    expect(openSides(b, b.cuts[1]).width).toEqual({ min: true, max: true });
    expect(cutLabel(b, b.cuts[1])).toBe('dado');
  });

  it('the same housing with no rabbet is still stopped', () => {
    const b = side(housing());
    expect(cutLabel(b, b.cuts[0])).toBe('stopped dado');
  });

  it('a rabbet too narrow to reach the housing leaves stock: stopped', () => {
    // width [0, 1/8] removed; [1/8, 1/4] still stands between the housing and the back edge.
    const b = side(backRabbet({ depth: 0.125 }), housing());
    expect(cutLabel(b, b.cuts[1])).toBe('stopped dado');
  });

  it('a rabbet too shallow to cover the housing\'s depth leaves stock: stopped', () => {
    // thickness [5/8, 3/4] removed; the housing is [1/2, 3/4], so [1/2, 5/8] still stands.
    const b = side(backRabbet({ offset: 0.625, width: 0.125 }), housing());
    expect(cutLabel(b, b.cuts[1])).toBe('stopped dado');
  });

  it('a housing stopped at the front and open into the rabbet is a stopped dado; with no rabbet a blind dado', () => {
    expect(cutLabel(side(backRabbet(), housing({ stopMax: 0.75 })), housing({ stopMax: 0.75 }))).toBe('stopped dado');
    expect(cutLabel(side(housing({ stopMax: 0.75 })), housing({ stopMax: 0.75 }))).toBe('blind dado');
  });
});

describe('a full-thickness corner cut is a notch (cut-words spec §2.5)', () => {
  // A shelf 30-1/2 long × 11 wide × 3/4 thick, notched at the length-min/width-max corner: length [0, 1/4] × width [10-1/4, 11].
  const shelf = (cut: Cut) => createBoard({ length: 30.5, width: 11, thickness: 0.75, cuts: [cut] });
  it('stored entering the end', () => {
    const cut: Cut = { id: 'n', face: 'length', from: 'min', across: 'thickness', offset: 10.25, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    expect(cutLabel(shelf(cut), cut)).toBe('notch');
  });
  it('the same box stored entering the broad face, through', () => {
    const cut: Cut = { id: 'n', face: 'thickness', from: 'min', across: 'width', offset: 0, width: 0.25, depth: 0.75, stopMin: 10.25, stopMax: 0 };
    expect(cutLabel(shelf(cut), cut)).toBe('notch');
  });
  it('a full-thickness strip along a whole edge is not a notch', () => {
    const cut: Cut = { id: 'n', face: 'width', from: 'max', across: 'length', offset: 0, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    expect(cutLabel(shelf(cut), cut)).not.toBe('notch');
  });
});

describe('a mortise is a deep hole, not a long channel (cut-words spec §2.6)', () => {
  const pocket = (b: { length: number; width: number; thickness: number }, cut: Cut) => cutLabel(createBoard({ ...b, cuts: [cut] }), cut);
  it('the workbench mortise: 1/2 × 4-1/2, 1-1/4 deep', () => {
    // A 34in leg, 1-3/4 square. Opening: thickness [1/2, 1] × length [28, 32.5].
    expect(pocket({ length: 34, width: 1.75, thickness: 1.75 },
      { id: 'm', face: 'width', from: 'max', across: 'length', offset: 0.5, width: 0.5, depth: 1.25, stopMin: 28, stopMax: 1.5 })).toBe('mortise');
  });
  it('a 30in back groove 1/4 wide and 3/8 deep is a blind dado', () => {
    expect(pocket({ length: 72, width: 11.25, thickness: 0.75 },
      { id: 'g', face: 'thickness', from: 'min', across: 'length', offset: 1, width: 0.25, depth: 0.375, stopMin: 2, stopMax: 40 })).toBe('blind dado');
  });
  it('exactly 8× its depth is still a mortise', () => {
    // Opening 1/4 × 4, depth 1/2: 4 = 8 × 1/2.
    expect(pocket({ length: 34, width: 1.75, thickness: 1.75 },
      { id: 'm', face: 'width', from: 'max', across: 'length', offset: 0.5, width: 0.25, depth: 0.5, stopMin: 10, stopMax: 20 })).toBe('mortise');
  });
});
```

Append to `src/document/cutlist.test.ts`:

```ts
describe('a stop with no stock in its gap is not printed (cut-words spec §2.4)', () => {
  const backRabbet: Cut = { id: 'r', face: 'width', from: 'min', across: 'length', offset: 0.375, width: 0.375, depth: 0.25, stopMin: 0, stopMax: 0 };
  const housing: Cut = { id: 'h', face: 'thickness', from: 'max', across: 'width', offset: 24, width: 0.75, depth: 0.25, stopMin: 0.25, stopMax: 0 };
  const setup = (cuts: Cut[]) => buildCutList(docWith({ length: 72, width: 11.25, thickness: 0.75, cuts })).groups[0].rows[0].setup;
  it('a housing running out into the back rabbet prints as a plain dado', () => {
    expect(setup([backRabbet, housing])[1]).toBe(
      '3/4" dado, 1/4" deep — into the thickness face (max side), 24" from the length min end, running across the width');
  });
  it('with no rabbet, the stop still prints', () => {
    expect(setup([housing])[0]).toBe(
      '3/4" stopped dado, 1/4" deep — into the thickness face (max side), 24" from the length min end, running across the width, stopped 1/4" short of the min end');
  });
});
```

**Where the numbers come from** (hand-derived; if one differs, STOP and report):

- **The back rabbet's region.** On the width axis it is `[0, 0.25]`, because the cut enters the width face from min, 1/4″ deep. On thickness it is `[0.375, 0.75]`.
- **The housing.**
  - Its region is width `[0.25, 11.25]` × thickness `[0.5, 0.75]` × length `[24, 24.75]`.
  - The strip toward width-min is width `[0, 0.25]` × thickness `[0.5, 0.75]` × length `[24, 24.75]`. The rabbet removed all of it, so that side is open.
  - Width-max is at the edge, so both width ends are open. That makes it a `dado`.
- **The narrow rabbet.** It removes width `[0, 0.125]` only, so stock remains in `[0.125, 0.25]` and the side stays closed.
- **The shallow rabbet.** It removes thickness `[0.625, 0.75]` only, so stock remains in `[0.5, 0.625]` and the side stays closed.
- **The front-stopped housing.**
  - With the rabbet, its width span is `[0.25, 10.5]`: open toward min, closed at max, closed on length. That is one open side, with reach 10.25 > run 0.75, so a `stopped dado`.
  - With no rabbet nothing is open, and depth 0.25 is not greater than 0.75, so a `blind dado`.
- **The notches.**
  - Both boxes are length `[0, 0.25]` × width `[10.25, 11]` × thickness `[0, 0.75]`. Each reaches exactly one end of the length and one of the width, through the full thickness.
  - The strip is length `[0, 30.5]`, which reaches both ends of the length, so it is not a notch.
- **The mortise.**
  - Its opening is 0.5 × (34 − 28 − 1.5 = 4.5).
  - Depth 1.25 > 0.5, and 4.5 ≤ 10, so `mortise`.
- **The groove.**
  - Its opening is 0.25 × (72 − 2 − 40 = 30).
  - Depth 0.375 > 0.25, but 30 > 3, so `blind dado`.
- **The tie.**
  - Its opening is 0.25 × (34 − 10 − 20 = 4).
  - Depth 0.5 > 0.25, and 4 ≤ 4, so `mortise`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/document/cuts.test.ts src/document/cutlist.test.ts`. Record which tests fail and which pass.

- [ ] **Step 3: Implement**

In `cuts.ts`, below `cutRegion` and `boardSolids`:

```ts
/**
 * Which sides of a cut's opening are OPEN (cut-words spec §2.4): no stock
 * remains between that side and the board's edge — in the strip as wide as
 * the opening and spanning the cut's depth. A side at the edge has an empty
 * strip; a side that runs out into another cut's removed space has a strip
 * with no stock. The `face` entry is always closed (it is the depth axis).
 */
export function openSides(board: Board, cut: Cut): Record<Dimension, { min: boolean; max: boolean }> {
  const r = cutRegion(board, cut);
  const span = (d: Dimension): Span => [Math.max(0, r[d][0]), Math.min(board[d], r[d][1])];
  const solids = boardSolids(board);
  const noStock = (strip: Region) =>
    DIMENSION_ORDER.some((d) => strip[d][1] - strip[d][0] <= FLUSH_EPSILON) ||
    !solids.some((s) => DIMENSION_ORDER.every((d) => Math.min(s[d][1], strip[d][1]) - Math.max(s[d][0], strip[d][0]) > FLUSH_EPSILON));
  const box = { length: span('length'), width: span('width'), thickness: span('thickness') };
  const out = {} as Record<Dimension, { min: boolean; max: boolean }>;
  for (const d of DIMENSION_ORDER) {
    if (d === cut.face) { out[d] = { min: false, max: false }; continue; }
    out[d] = {
      min: noStock({ ...box, [d]: [0, box[d][0]] }),
      max: noStock({ ...box, [d]: [box[d][1], board[d]] }),
    };
  }
  return out;
}
```

In `cutLabel`, after the `cutRemovesNothing` early return and the existing `r`, `span` and `ext`:

```ts
  const ends = (d: Dimension) =>
    (span(d)[0] <= FLUSH_EPSILON ? 1 : 0) + (span(d)[1] >= board[d] - FLUSH_EPSILON ? 1 : 0);
  if (ends('thickness') === 2 && ends('length') === 1 && ends('width') === 1) return 'notch';
  const open = openSides(board, cut);
  const na = (open[a].min ? 1 : 0) + (open[a].max ? 1 : 0);
  const nb = (open[b].min ? 1 : 0) + (open[b].max ? 1 : 0);
```

Then:
- Remove the old `opens` helper and the old `na`/`nb`.
- Keep the table branches as they are.
- Replace the last line with:

```ts
  const narrow = Math.min(ext(a), ext(b));
  const long = Math.max(ext(a), ext(b));
  return cut.depth > narrow && long <= 8 * cut.depth ? 'mortise' : 'blind dado';
```

Update `cutLabel`'s doc comment so it also cites spec §2.4–2.6.

In `cutlist.ts`:
- `stopClause(board, cut, f)` reads `const o = openSides(board, cut)[cut.across];`.
- A stop prints only when it is `> 0` AND its end is not open (`!o.min` for stopMin, `!o.max` for stopMax). Keep the three existing string shapes.
- Update `setupLine`'s call.
- Import `openSides`.

- [ ] **Step 4: Run, then fix any existing test that pinned an OLD word**

Run `npm test`. The only existing expectations allowed to change are ones spec §2.4–2.6 changes:
- a full-thickness corner cut that read `rabbet` (for example the joinery shelf "notched to match");
- a housing that runs out into another cut and read `stopped …`;
- a long closed groove that read `mortise`.

For each one you change:
- hand-check it against the spec;
- cite the section in a comment;
- list it in the report.

Anything else that goes red is a bug in the new code.

- [ ] **Step 5: Mutation-check**

Apply each change, check the test that should fail, and record the result:

| Mutation | Test that must fail |
|---|---|
| `noStock` checks only that the strip is empty, not the solids | the rabbet-into-dado test |
| The strip spans the full board on the face axis, not the cut's depth | the shallow-rabbet test |
| Remove the notch line | the two notch tests |
| `ends('length') === 1` → `>= 1` | the strip test |
| Drop `long <= 8 * cut.depth` | the groove test |
| `<=` → `<` in the 8× test | the tie test |
| `stopClause` ignores `openSides` | the plain-dado setup-line test |

- [ ] **Step 6: Commit**

Run `npm test && npm run build`, then commit:
`feat(cuts): open means no stock — a housing into a rabbet is a dado; corner notch; mortise by depth (spec §2.4–2.6)`.

### Task 6: docs for the amendment

**Files:** `CLAUDE.md`, `docs/follow-ups.md`

- [ ] **Step 1: follow-ups**

Add three entries, in the format of the entries around 180–191:
- **192:** the setup line is written from the cut's stored fields, not its shape (spec §2.7). Give the stopped-housing example.
- **193:** grain-aware words, `groove` with the grain and `dado` across it. The research basis: a groove runs with the grain, a dado across it.
- **194:** two boards a hair apart in exact length share a cut-list row, but can differ in whether `findTenons` recognises a tenon. The first-listed board decides the row's lines. Effectively unreachable (the ℓ ≤ L/2 cap); the same class as follow-up 55a.

- [ ] **Step 2: CLAUDE.md**

- In the `cuts.ts` tree entry, add `openSides`: open means no stock between the side and the edge, read by both `cutLabel` and the setup line's stop clause (one helper, so the word and the stops cannot disagree). Keep the line widths.
- Update "1-191" to "1-194".
- Update the test count in Status and in Commands.

- [ ] **Step 3: Check and commit**

Run `npm test && npm run build`. Commit: `docs: cut words amendment — openSides; follow-ups 192–194`.
