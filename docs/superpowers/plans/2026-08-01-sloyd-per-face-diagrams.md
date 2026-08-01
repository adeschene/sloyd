# Per-Face Cut List Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw one diagram per physical face, so perpendicular cuts appear in one figure and the region where they cross is marked with the depth that actually governs there.

**Architecture:** Views re-key from `(face, across)` to `(face, from)`. A new pure module computes a **depth field** over a face — split the face at every cut boundary on both in-plane axes, give each cell the maximum depth of the cuts covering it — which is the same split/cover skeleton `cuts.ts` uses in 3D and is what makes the drawing and `boardSolids` agree by construction. `PartDiagram` then draws cut bands on both axes, with leader rows below for horizontally-positioned cuts and rotated leader columns at the left for vertically-positioned ones.

**Tech Stack:** TypeScript, React 19, SVG, Vitest + @testing-library/react (jsdom), Playwright for browser verification.

**Spec:** `docs/superpowers/specs/2026-08-01-sloyd-per-face-diagrams-design.md`. Read it before starting — especially §4 (the depth field is NOT `cuts.ts` reused), §6 (what this deliberately retires), and §7 (two fills, and why not fill-per-depth).

## Global Constraints

- **`PartDiagram.tsx` formats nothing.** Every label string arrives from `buildDiagrams`. No string built, concatenated, interpolated or rounded in the renderer.
- **No schema change.** `CURRENT_VERSION` stays 4. Everything derives from `cuts`, already stored.
- **Layer order:** `units` imports nothing; `document` may import `units`; `panels` may import both. Nothing in `document` may import from `panels`.
- **`npm test` does NOT typecheck.** `npm run build` (`tsc -b && vite build`) is the typecheck gate and must pass before any task is called done.
- **The suite is 515 tests at the start of this plan.** Green after every task.
- **`LABEL_SIZE` has exactly one home** (`diagramLabels.ts`) and is applied to the `<svg>`. `styles.css` must never carry a `font-size` for diagram text. This is invariant 19 — do not reintroduce it.
- Commit after every task. No pull requests — commit to a local branch and merge with `--no-ff`.

## Measured constants (do not re-derive; these came from a real browser this session)

| quantity | value | note |
|---|---|---|
| monospace advance | **12.029 units/glyph** at `font-size: 20` | `CHAR_W = 12.4` already bounds it |
| glyph box height | **23.68 units** (1.1839 em) | new constant, Task 1 |
| ascent above baseline | **18.6 units** | new constant, Task 1 |
| descent below baseline | **5.07 units** | new constant, Task 1 |

**`getBBox()` ignores the element's own transform.** Measured directly: a `rotate(-90)` label reported a bbox of 120.29 × 23.68 (its *unrotated* extents) while its true screen rect was 14 × 71.13. Any predicate that reads `getBBox()` on a rotated label silently measures it as horizontal **and passes**. Task 7 fixes the sweep harness for this; it is the single most important correctness note in this plan.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/panels/diagramLabels.ts` | modify | + glyph-height constants and `labelHeight()` |
| `src/document/depthField.ts` | **create** | The depth field over one face. Pure, numeric, no strings. |
| `src/document/depthField.test.ts` | **create** | Region partition, depths, the crossing rule. |
| `src/document/depthField.agreement.test.ts` | **create** | Depth field vs `boardSolids` — the round's strongest test. |
| `src/panels/diagramScale.ts` | modify | + `bandOn`, the axis-agnostic primitive `band` delegates to |
| `src/document/diagram.ts` | modify | Re-keyed on `(face, from)`; per-axis cuts; regions; legend lines |
| `src/document/document.ts` | modify | Re-export `depthField`'s types |
| `src/panels/PartDiagram.tsx` | modify | Two-axis bands, leader rows + rotated columns, legend, cross-hatch |
| `src/styles.css` | modify | Cross-hatch fill; remove the far-side dash rule |
| `docs/diagram-overlap-sweep.js` | modify | Screen-rect measurement so rotated labels are measured correctly |
| `docs/follow-ups.md`, `CLAUDE.md` | modify | Write-up |

---

### Task 1: Glyph height constants

**Files:**
- Modify: `src/panels/diagramLabels.ts`
- Test: `src/panels/diagramLabels.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `LABEL_ASCENT: number`, `LABEL_DESCENT: number`, `LABEL_BOX_H: number`, `labelHeight(): number`.

- [ ] **Step 1: Write the failing tests**

Append to `src/panels/diagramLabels.test.ts`:

```ts
describe('labelHeight', () => {
  it('bounds the measured glyph box from ABOVE, never below', () => {
    // Measured in a real browser at font-size 20 with --font-num: the glyph
    // box is 23.68 units tall, 18.6 above the baseline and 5.07 below. The
    // bound must err HIGH for the same reason CHAR_W does — too tall only
    // spaces rows further apart, too short silently reintroduces overlap with
    // every test still green.
    expect(labelHeight()).toBeGreaterThan(23.68);
    expect(LABEL_ASCENT).toBeGreaterThan(18.6);
    expect(LABEL_DESCENT).toBeGreaterThan(5.07);
  });

  it('is the sum of its two halves', () => {
    expect(labelHeight()).toBeCloseTo(LABEL_ASCENT + LABEL_DESCENT, 10);
    expect(LABEL_BOX_H).toBe(labelHeight());
  });

  it('does not depend on the string, unlike labelWidth', () => {
    // Height is a property of the FACE, not the text. A per-string height
    // would be wrong for exactly the rotated labels this exists to serve.
    expect(labelHeight()).toBe(LABEL_BOX_H);
  });
});
```

Add `LABEL_ASCENT, LABEL_DESCENT, LABEL_BOX_H, labelHeight` to the file's existing import from `./diagramLabels`.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/panels/diagramLabels.test.ts`
Expected: FAIL — the names do not exist.

- [ ] **Step 3: Implement**

Append to `src/panels/diagramLabels.ts`:

```ts
/**
 * The glyph box above and below the baseline, in user units.
 *
 * MEASURED, not derived from LABEL_SIZE. At font-size 20 with --font-num a
 * label's `getBBox` height is 23.68 units — 18.6 above the baseline and 5.07
 * below. These are rounded UP for the same reason CHAR_W is: too tall only
 * spaces rows further apart than needed, while too short silently reintroduces
 * the overlap this module exists to prevent, with every unit test passing.
 *
 * These exist because a `rotate(-90)` label's extent along X is the glyph box
 * HEIGHT, and nothing here modelled that — `labelWidth` measures advance along
 * the text direction only. Until this round that number lived hard-coded in a
 * test helper, which is not a place a layout constant can live.
 */
export const LABEL_ASCENT = 19;
export const LABEL_DESCENT = 6;
export const LABEL_BOX_H = LABEL_ASCENT + LABEL_DESCENT;

/**
 * The height of any label, whatever it says.
 *
 * A function rather than a bare constant so call sites read symmetrically with
 * `labelWidth(s)` — but it deliberately takes NO string, because height is a
 * property of the face and not of the text. A per-string height would be wrong
 * for precisely the rotated labels this serves.
 */
export const labelHeight = (): number => LABEL_BOX_H;
```

- [ ] **Step 4: Run and verify pass**

Run: `npx vitest run src/panels/diagramLabels.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run build` — expected exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/panels/diagramLabels.ts src/panels/diagramLabels.test.ts
git commit -m "feat: add measured glyph-height constants to diagramLabels

A rotate(-90) label's extent along X is the glyph box HEIGHT, which
labelWidth does not model — it measures advance along the text direction.
Measured in a browser at font-size 20 with --font-num: 23.68 units tall,
18.6 above the baseline and 5.07 below, rounded up so the bound errs high
like CHAR_W does. Until now this number existed only hard-coded in a test
helper."
```

---

### Task 2: The depth field

**Files:**
- Create: `src/document/depthField.ts`
- Test: `src/document/depthField.test.ts`
- Modify: `src/document/document.ts` (re-export)

**Interfaces:**
- Consumes: `Board`, `Cut`, `CutFrom`, `Dimension`, `Span` from `./types`; `positionAxisOf` from `./geometry`.
- Produces:

```ts
export interface FaceCell {
  /** [min, max] along the view's HORIZONTAL in-plane dimension, board inches. */
  h: Span;
  /** [min, max] along the view's VERTICAL in-plane dimension, board inches. */
  v: Span;
  /** The depth that governs here. Always > 0 — uncut cells are not emitted. */
  depth: number;
  /** True only when >1 cut covers this cell AND their depths differ. */
  crossing: boolean;
}

export function buildDepthField(
  board: Board,
  face: Dimension,
  from: CutFrom,
  horizontal: Dimension,
  vertical: Dimension,
): FaceCell[];
```

**A concrete reading of spec §4 that the spec leaves implicit, and the implementer must not "improve":** the spec says to merge adjacent equal-depth cells into regions, then says merging is a labelling concern rather than a rendering one. **Do not build a geometric merge.** Emit cells. Because the hatch is a `<pattern>` with `patternUnits="userSpaceOnUse"`, adjacent cell rects render indistinguishably from one merged shape, so the visual "region" is free. And the equal-depth case the spec cares about falls out of the `crossing` flag, not out of geometry: two crossing cuts of equal depth produce a cell covered by 2 cuts whose depths do NOT differ, so `crossing` is false, no cross-hatch, no legend line — which is the correct outcome.

- [ ] **Step 1: Write the failing tests**

Create `src/document/depthField.test.ts`:

```ts
import { buildDepthField } from './depthField';
import { createBoard } from './document';
import type { Cut } from './types';

const cut = (over: Partial<Cut>): Cut => ({
  id: 'c', face: 'thickness', from: 'min', across: 'width',
  offset: 0, width: 1, depth: 0.25, ...over,
});

// A 24 x 12 x 3/4 board. Thickness face, min side: horizontal = length,
// vertical = width (DIMENSION_ORDER puts length first).
const field = (cuts: Cut[]) =>
  buildDepthField(createBoard({ length: 24, width: 12, cuts }), 'thickness', 'min', 'length', 'width');

describe('buildDepthField', () => {
  it('emits nothing for a face with no cuts', () => {
    expect(field([])).toEqual([]);
  });

  it('emits only cut cells, never the uncut remainder', () => {
    // A cut across the width at 6..6.75 covers the full width.
    const cells = field([cut({ id: 'a', across: 'width', offset: 6, width: 0.75 })]);
    expect(cells).toHaveLength(1);
    expect(cells[0].h).toEqual([6, 6.75]);
    expect(cells[0].v).toEqual([0, 12]);
    expect(cells[0].depth).toBe(0.25);
    expect(cells[0].crossing).toBe(false);
  });

  it('keeps two parallel disjoint cuts separate', () => {
    const cells = field([
      cut({ id: 'a', across: 'width', offset: 2, width: 0.75 }),
      cut({ id: 'b', across: 'width', offset: 8, width: 0.75 }),
    ]);
    expect(cells).toHaveLength(2);
    expect(cells.every((c) => !c.crossing)).toBe(true);
  });

  it('takes the deeper depth where two PARALLEL cuts overlap', () => {
    const cells = field([
      cut({ id: 'a', across: 'width', offset: 2, width: 2, depth: 0.125 }),
      cut({ id: 'b', across: 'width', offset: 3, width: 2, depth: 0.375 }),
    ]);
    // Split at 2, 3, 4, 5 -> three cells.
    expect(cells).toHaveLength(3);
    const overlap = cells.find((c) => c.h[0] === 3 && c.h[1] === 4)!;
    expect(overlap.depth).toBe(0.375);
    expect(overlap.crossing).toBe(true);
  });

  it('marks a PERPENDICULAR crossing of differing depths', () => {
    const cells = field([
      cut({ id: 'a', across: 'width',  offset: 6, width: 0.75, depth: 0.125 }),
      cut({ id: 'b', across: 'length', offset: 4, width: 0.75, depth: 0.375 }),
    ]);
    const cross = cells.find((c) => c.crossing)!;
    expect(cross.h).toEqual([6, 6.75]);
    expect(cross.v).toEqual([4, 4.75]);
    expect(cross.depth).toBe(0.375);
  });

  it('does NOT mark a perpendicular crossing of EQUAL depth', () => {
    // The case that is easy to get backwards. When both cuts are 3/8" deep
    // there is nothing about the intersection to report, and cross-hatching it
    // would invent a distinction the stock does not have.
    const cells = field([
      cut({ id: 'a', across: 'width',  offset: 6, width: 0.75, depth: 0.375 }),
      cut({ id: 'b', across: 'length', offset: 4, width: 0.75, depth: 0.375 }),
    ]);
    expect(cells.every((c) => c.depth === 0.375)).toBe(true);
    expect(cells.some((c) => c.crossing)).toBe(false);
  });

  it('handles a three-way overlap under the same rule', () => {
    const cells = field([
      cut({ id: 'a', across: 'width',  offset: 6, width: 2, depth: 0.125 }),
      cut({ id: 'b', across: 'length', offset: 4, width: 2, depth: 0.25 }),
      cut({ id: 'c', across: 'width',  offset: 7, width: 2, depth: 0.5 }),
    ]);
    const deepest = cells.filter((c) => c.depth === 0.5);
    expect(deepest.length).toBeGreaterThan(0);
    expect(deepest.every((c) => c.h[0] >= 7 && c.h[1] <= 9)).toBe(true);
  });

  it('ignores cuts belonging to the other side of the same face', () => {
    const cells = field([
      cut({ id: 'a', from: 'min', across: 'width', offset: 6, width: 0.75 }),
      cut({ id: 'b', from: 'max', across: 'width', offset: 2, width: 0.75 }),
    ]);
    expect(cells).toHaveLength(1);
    expect(cells[0].h).toEqual([6, 6.75]);
  });

  it('ignores cuts belonging to a different face', () => {
    const cells = field([
      cut({ id: 'a', face: 'thickness', across: 'width', offset: 6, width: 0.75 }),
      cut({ id: 'b', face: 'width', across: 'length', offset: 2, width: 0.75 }),
    ]);
    expect(cells).toHaveLength(1);
  });

  it('skips a degenerate cut naming one dimension twice', () => {
    expect(field([cut({ id: 'a', face: 'thickness', across: 'thickness' })])).toEqual([]);
  });

  it('covers the whole face when a cut spans it', () => {
    const cells = field([cut({ id: 'a', across: 'width', offset: 0, width: 24 })]);
    expect(cells).toHaveLength(1);
    expect(cells[0].h).toEqual([0, 24]);
    expect(cells[0].v).toEqual([0, 12]);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/document/depthField.test.ts`
Expected: FAIL — `Failed to resolve import "./depthField"`.

- [ ] **Step 3: Implement**

Create `src/document/depthField.ts`:

```ts
import type { Board, Cut, CutFrom, Dimension, Span } from './types';
import { positionAxisOf } from './geometry';

/**
 * One cell of a face's depth field, in BOARD INCHES.
 *
 * No pixels, no drawing units — those belong to `panels/`. Keeping them out is
 * what lets this be tested against measurements rather than a rendering.
 */
export interface FaceCell {
  /** [min, max] along the view's HORIZONTAL in-plane dimension. */
  h: Span;
  /** [min, max] along the view's VERTICAL in-plane dimension. */
  v: Span;
  /** The depth that governs here. Always > 0 — uncut cells are not emitted. */
  depth: number;
  /** True only when more than one cut covers this cell AND their depths differ. */
  crossing: boolean;
}

/** Sorted, deduplicated boundaries, always including 0 and `extent`. */
function boundaries(extent: number, spans: Span[]): number[] {
  const set = new Set<number>([0, extent]);
  for (const [lo, hi] of spans) {
    if (lo > 0 && lo < extent) set.add(lo);
    if (hi > 0 && hi < extent) set.add(hi);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * The depth of stock removed at every point of one face.
 *
 * THE SAME SKELETON AS `cuts.ts`, ONE DIMENSION DOWN — split at every cut
 * boundary, then classify each cell by its centre. Splitting first is what
 * makes the centre test sound: no cell can straddle a cut edge, so a cell is
 * either wholly inside a cut or wholly outside it.
 *
 * BUT IT IS NOT `cuts.ts` REUSED, and reaching for `boardSolids` here will not
 * work. `boardSolids` DROPS a cell whose centre is inside any cut — a boolean.
 * This assigns the MAXIMUM depth among the covering cuts. Same skeleton,
 * different operation. Call it a depth field, not a solid decomposition.
 *
 * What the shared skeleton does buy is agreement by construction: a cell has
 * depth > 0 exactly when the corresponding 3D column has stock removed at this
 * face, which `depthField.agreement.test.ts` asserts directly rather than
 * leaving as an argument.
 *
 * `crossing` is deliberately NOT "covered by more than one cut". Two crossing
 * cuts of equal depth leave nothing to report about their intersection, and
 * marking it would invent a distinction the stock does not have.
 */
export function buildDepthField(
  board: Board,
  face: Dimension,
  from: CutFrom,
  horizontal: Dimension,
  vertical: Dimension,
): FaceCell[] {
  // A cut naming one dimension twice has no position axis to lay out against —
  // the same totality reasoning `cutRegion` gives. Skip it rather than let it
  // invent a boundary.
  const cuts = board.cuts.filter(
    (c) => c.face === face && c.from === from && c.face !== c.across,
  );
  if (cuts.length === 0) return [];

  // Both `across` and the position axis are in-plane (positionAxisOf returns
  // the dimension that is neither `face` nor `across`), which is exactly why
  // every cut on a face is a full-span rectangle.
  const rect = (cut: Cut): { h: Span; v: Span } => {
    const pos = positionAxisOf(cut.face, cut.across);
    const spanOf = (d: Dimension): Span =>
      d === cut.across ? [0, board[d]] : [cut.offset, cut.offset + cut.width];
    void pos;
    return { h: spanOf(horizontal), v: spanOf(vertical) };
  };

  const rects = cuts.map((c) => ({ cut: c, ...rect(c) }));
  const hs = boundaries(board[horizontal], rects.map((r) => r.h));
  const vs = boundaries(board[vertical], rects.map((r) => r.v));

  const out: FaceCell[] = [];
  for (let i = 0; i < hs.length - 1; i += 1) {
    for (let j = 0; j < vs.length - 1; j += 1) {
      const hMid = (hs[i] + hs[i + 1]) / 2;
      const vMid = (vs[j] + vs[j + 1]) / 2;
      const covering = rects.filter(
        (r) => hMid > r.h[0] && hMid < r.h[1] && vMid > r.v[0] && vMid < r.v[1],
      );
      if (covering.length === 0) continue;
      const depths = covering.map((r) => r.cut.depth);
      const depth = Math.max(...depths);
      out.push({
        h: [hs[i], hs[i + 1]],
        v: [vs[j], vs[j + 1]],
        depth,
        crossing: covering.length > 1 && !depths.every((d) => d === depths[0]),
      });
    }
  }
  return out;
}
```

**Note for the implementer:** the `void pos;` line above is a placeholder to keep `positionAxisOf` imported and its role documented. If your linter objects, delete both the `void pos;` and the `const pos` line and the import — `spanOf` derives everything it needs from `cut.across`. Do NOT leave an unused import.

- [ ] **Step 4: Run and verify pass**

Run: `npx vitest run src/document/depthField.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Re-export from the barrel**

In `src/document/document.ts`, beside the existing `buildDiagrams` export:

```ts
export { buildDepthField } from './depthField';
export type { FaceCell } from './depthField';
```

- [ ] **Step 6: Full suite and typecheck**

Run: `npm test` then `npm run build`. Expected: green, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/document/depthField.ts src/document/depthField.test.ts src/document/document.ts
git commit -m "feat: compute a face's depth field

Split the face at every cut boundary on both in-plane axes, give each cell
the maximum depth of the cuts covering it. Same skeleton as cuts.ts one
dimension down, but it assigns a max rather than dropping a boolean, so
boardSolids is not reusable here and the comment says so.

crossing is deliberately not 'covered by more than one cut': two crossing
cuts of equal depth leave nothing to report, and marking them would invent
a distinction the stock does not have."
```

---

### Task 3: The agreement test

**Files:**
- Create: `src/document/depthField.agreement.test.ts`

**Interfaces:**
- Consumes: `buildDepthField` (Task 2), `boardSolids` and `cutRegion` from `./cuts`.
- Produces: nothing.

This is the round's strongest test. It pins spec goal 3 — that the drawing and `boardSolids` agree **by construction** — to an assertion instead of an argument, and it is what would catch the two drifting apart in any future change to either.

- [ ] **Step 1: Write the test**

Create `src/document/depthField.agreement.test.ts`:

```ts
import { buildDepthField } from './depthField';
import { boardSolids } from './cuts';
import { createBoard } from './document';
import type { Board, Cut } from './types';

const cut = (over: Partial<Cut>): Cut => ({
  id: 'c', face: 'thickness', from: 'min', across: 'width',
  offset: 0, width: 1, depth: 0.25, ...over,
});

/**
 * Is the stock at (x along length, y along width) still present at the very top
 * of the board — i.e. at the min-side thickness face?
 *
 * Probes just INSIDE the face rather than exactly on it, because a solid's
 * bounds are closed and a point exactly on a boundary belongs to both sides.
 */
const stockAtMinFace = (board: Board, x: number, y: number): boolean => {
  const z = 1e-6;
  return boardSolids(board).some(
    (s) =>
      x > s.length[0] && x < s.length[1] &&
      y > s.width[0] && y < s.width[1] &&
      z > s.thickness[0] && z < s.thickness[1],
  );
};

const GEOMETRIES: { name: string; cuts: Cut[] }[] = [
  { name: 'one dado across the width', cuts: [cut({ id: 'a', across: 'width', offset: 6, width: 0.75 })] },
  { name: 'two parallel disjoint', cuts: [
    cut({ id: 'a', across: 'width', offset: 2, width: 0.75 }),
    cut({ id: 'b', across: 'width', offset: 8, width: 0.75 })] },
  { name: 'two parallel overlapping, different depths', cuts: [
    cut({ id: 'a', across: 'width', offset: 2, width: 2, depth: 0.125 }),
    cut({ id: 'b', across: 'width', offset: 3, width: 2, depth: 0.375 })] },
  { name: 'perpendicular crossing, different depths', cuts: [
    cut({ id: 'a', across: 'width',  offset: 6, width: 0.75, depth: 0.125 }),
    cut({ id: 'b', across: 'length', offset: 4, width: 0.75, depth: 0.375 })] },
  { name: 'perpendicular crossing, equal depths', cuts: [
    cut({ id: 'a', across: 'width',  offset: 6, width: 0.75, depth: 0.375 }),
    cut({ id: 'b', across: 'length', offset: 4, width: 0.75, depth: 0.375 })] },
  { name: 'rabbets on all four edges plus crossing dados', cuts: [
    cut({ id: 'a', across: 'width',  offset: 0,    width: 0.5,  depth: 0.25 }),
    cut({ id: 'b', across: 'width',  offset: 23.5, width: 0.5,  depth: 0.25 }),
    cut({ id: 'c', across: 'length', offset: 0,    width: 0.5,  depth: 0.25 }),
    cut({ id: 'd', across: 'length', offset: 11.5, width: 0.5,  depth: 0.25 }),
    cut({ id: 'e', across: 'width',  offset: 12,   width: 0.75, depth: 0.125 }),
    cut({ id: 'f', across: 'length', offset: 6,    width: 0.75, depth: 0.125 })] },
];

describe('the depth field agrees with boardSolids, by construction', () => {
  it.each(GEOMETRIES)('$name', ({ cuts }) => {
    const board = createBoard({ length: 24, width: 12, cuts });
    const cells = buildDepthField(board, 'thickness', 'min', 'length', 'width');

    // Every cell the field reports as cut must be cut in the 3D model.
    for (const c of cells) {
      const x = (c.h[0] + c.h[1]) / 2;
      const y = (c.v[0] + c.v[1]) / 2;
      expect(c.depth, `cell at ${x},${y} must have positive depth`).toBeGreaterThan(0);
      expect(
        stockAtMinFace(board, x, y),
        `field says cut at ${x},${y}; boardSolids still has stock there`,
      ).toBe(false);
    }

    // And the converse: anywhere the 3D model removed stock at this face, the
    // field must have a cell. Sampled on a grid fine enough to land inside
    // every cut in GEOMETRIES.
    const covered = (x: number, y: number) =>
      cells.some((c) => x > c.h[0] && x < c.h[1] && y > c.v[0] && y < c.v[1]);
    for (let x = 0.125; x < 24; x += 0.25) {
      for (let y = 0.125; y < 12; y += 0.25) {
        if (!stockAtMinFace(board, x, y)) {
          expect(covered(x, y), `boardSolids removed stock at ${x},${y}; field has no cell`).toBe(true);
        }
      }
    }
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/document/depthField.agreement.test.ts`
Expected: PASS, 6 cases.

**If a case fails, this is a REAL finding, not a test to adjust.** Either the depth field or `boardSolids` is wrong about the same board. Report it with the failing coordinate rather than loosening the assertion or the sampling grid.

- [ ] **Step 3: Full suite and typecheck**

Run: `npm test` then `npm run build`.

- [ ] **Step 4: Commit**

```bash
git add src/document/depthField.agreement.test.ts
git commit -m "test: pin the depth field's agreement with boardSolids

Goal 3 of the spec says the drawing and the 3D model agree by
construction. This asserts it both ways -- every cell the field calls cut
has no stock in boardSolids, and every point boardSolids cleared has a
cell -- so a future change to either that breaks the correspondence fails
here rather than shipping a drawing that disagrees with the model."
```

---

### Task 4: `bandOn` — the axis-agnostic band primitive

**Files:**
- Modify: `src/panels/diagramScale.ts`
- Test: `src/panels/diagramScale.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `bandOn(span: Span, scale: number, origin: number, extent: number): { start: number; size: number }`. `band(span, fit)` keeps its exact current signature and behaviour and delegates to it.

- [ ] **Step 1: Write the failing tests**

Append to `src/panels/diagramScale.test.ts`:

```ts
describe('bandOn', () => {
  it('places a comfortable band at true scale on either axis', () => {
    expect(bandOn([6, 6.75], 40, 0, 1000)).toEqual({ start: 240, size: 30 });
    expect(bandOn([6, 6.75], 40, 100, 1000)).toEqual({ start: 340, size: 30 });
  });

  it('widens a hairline band about its centre', () => {
    const b = bandOn([6, 6.05], 40, 0, 1000);
    expect(b.size).toBe(MIN_FEATURE);
    expect(b.start + b.size / 2).toBeCloseTo(6.025 * 40, 10);
  });

  it('clamps a widened band inside the extent at both ends', () => {
    expect(bandOn([0, 0.01], 40, 0, 1000).start).toBe(0);
    const far = bandOn([24, 24], 40, 0, 960);
    expect(far.start + far.size).toBeLessThanOrEqual(960);
  });

  it('normalises an out-of-order span', () => {
    expect(bandOn([6.75, 6], 40, 0, 1000)).toEqual(bandOn([6, 6.75], 40, 0, 1000));
  });

  it('is what band() delegates to, so the two cannot drift', () => {
    const fit = fitView(24, 5.5);
    const b = band([6, 6.75], fit);
    const on = bandOn([6, 6.75], fit.sx, fit.offsetX, fit.drawnH);
    expect(b).toEqual({ x: on.start, width: on.size });
  });
});
```

Add `bandOn` to the file's existing import list.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/panels/diagramScale.test.ts`
Expected: FAIL — `bandOn is not a function`.

- [ ] **Step 3: Implement**

In `src/panels/diagramScale.ts`, replace the body of `band` and add `bandOn` above it, keeping `band`'s existing doc comment attached to `band`:

```ts
/**
 * A band along ONE axis, given that axis's scale, origin and drawn extent.
 *
 * Axis-agnostic on purpose: a per-face view draws cut bands on BOTH axes — a
 * cut positioned along the horizontal axis is a vertical band, one positioned
 * along the vertical axis is a horizontal band — and the widening, ordering and
 * clamping rules are identical either way. Keeping one implementation is what
 * stops the vertical axis quietly acquiring different behaviour.
 *
 * Both guards live here rather than in the caller. ORDERING: a [max, min] span
 * yields a negative size, which fails the MIN_FEATURE test and falls into the
 * widening branch, drawing a plausible band in the wrong place with no error
 * (follow-up 62). CLAMPING: widening about the centre puts the band outside the
 * board whenever the cut is within MIN_FEATURE / 2 of an edge.
 */
export function bandOn(
  span: Span,
  scale: number,
  origin: number,
  extent: number,
): { start: number; size: number } {
  const lo = Math.min(span[0], span[1]);
  const hi = Math.max(span[0], span[1]);
  const a = origin + lo * scale;
  const b = origin + hi * scale;
  const size = b - a;
  if (size >= MIN_FEATURE) return { start: a, size };
  const centred = (a + b) / 2 - MIN_FEATURE / 2;
  // `Math.max` last so an extent narrower than MIN_FEATURE pins to the origin
  // rather than inverting the clamp.
  return {
    start: Math.max(origin, Math.min(centred, origin + extent - MIN_FEATURE)),
    size: MIN_FEATURE,
  };
}
```

Then make `band` a one-liner delegating to it, keeping its own doc comment:

```ts
export function band(span: Span, fit: DiagramFit): { x: number; width: number } {
  const { start, size } = bandOn(span, fit.sx, fit.offsetX, fit.drawnH);
  return { x: start, width: size };
}
```

- [ ] **Step 4: Run and verify pass**

Run: `npx vitest run src/panels/diagramScale.test.ts`
Expected: PASS. **All pre-existing `band` tests must still pass unmodified** — if one fails, `bandOn` is not behaviour-identical; fix `bandOn`, not the test.

- [ ] **Step 5: Full suite and typecheck**

Run: `npm test` then `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/panels/diagramScale.ts src/panels/diagramScale.test.ts
git commit -m "refactor: extract bandOn, the axis-agnostic band primitive

A per-face view draws cut bands on both axes, and the widening, ordering
and clamping rules are identical either way. One implementation is what
stops the vertical axis quietly acquiring different behaviour. band()
keeps its signature and delegates, with a test pinning that the two
cannot drift."
```

---

### Task 5: Re-key `buildDiagrams` on `(face, from)`

**Files:**
- Modify: `src/document/diagram.ts` (substantially rewritten)
- Test: `src/document/diagram.test.ts` (existing tests updated; new ones added)

**Interfaces:**
- Consumes: `buildDepthField`, `FaceCell` (Task 2); `cutLabel`, `cutRegion` from `./cuts`; `formatLength` from `../units/length`.
- Produces:

```ts
export interface DiagramCut {
  id: string;
  /** [min, max] along the view's HORIZONTAL axis, board inches. */
  h: Span;
  /** [min, max] along the view's VERTICAL axis, board inches. */
  v: Span;
  /** Which axis this cut's offset and width are measured along. */
  axis: 'h' | 'v';
  depthLabel: string;
  offsetLabel: string;
  widthLabel: string;
  kind: 'dado' | 'rabbet';
}

export interface DiagramView {
  /** `${face}|${from}`. */
  key: string;
  heading: string;
  face: Dimension;
  from: CutFrom;
  horizontal: Dimension;
  vertical: Dimension;
  /** Board inches. The outline is [0, h] x [0, v]. */
  h: number;
  v: number;
  hLabel: string;
  vLabel: string;
  cuts: DiagramCut[];
  cells: FaceCell[];
  /** One line per distinct crossing depth, already formatted. Empty when none. */
  crossings: string[];
}
```

**`DiagramView.hasFar` and `DiagramCut.side` are DELETED.** See spec §6 — every view is one side now, so near/far has nothing left to encode. This is deliberate, not an oversight.

- [ ] **Step 1: Update the existing tests to the new shape**

`src/document/diagram.test.ts`'s current tests assert `(face, across)` keying, `view.cuts[].side`, and `view.hasFar`. Rewrite them for the new shape. Every existing behavioural assertion that still makes sense must be kept — in particular that labels are formatted by `formatLength` at the document's precision, that a cut-free board still yields one view, and that a cut naming one dimension twice is skipped.

Add these new tests:

```ts
  it('draws ONE view per physical face, not per (face, across) pair', () => {
    // The defect this round exists to fix: two perpendicular cuts on the same
    // face used to produce two diagrams, each showing one cut and neither
    // showing where they cross.
    const board = createBoard({ length: 24, width: 12, cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 6, width: 0.75, depth: 0.375 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.125 },
    ]});
    const views = buildDiagrams(board, 16);
    expect(views).toHaveLength(1);
    expect(views[0].cuts).toHaveLength(2);
  });

  it('splits the two sides of one face into separate views', () => {
    const board = createBoard({ cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.375 },
      { id: 'b', face: 'thickness', from: 'max', across: 'width', offset: 6, width: 0.75, depth: 0.375 },
    ]});
    const views = buildDiagrams(board, 16);
    expect(views).toHaveLength(2);
    expect(views.map((v) => v.from).sort()).toEqual(['max', 'min']);
  });

  it('puts the earlier DIMENSION_ORDER dimension on the horizontal axis', () => {
    const views = buildDiagrams(createBoard({ cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 6, width: 0.75, depth: 0.375 },
    ]}), 16);
    expect(views[0].horizontal).toBe('length');
    expect(views[0].vertical).toBe('width');
  });

  it('tags each cut with the axis its offset is measured along', () => {
    const views = buildDiagrams(createBoard({ length: 24, width: 12, cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 6, width: 0.75, depth: 0.375 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.125 },
    ]}), 16);
    const byId = Object.fromEntries(views[0].cuts.map((c) => [c.id, c]));
    expect(byId.a.axis).toBe('h');   // across the width -> positioned along the length
    expect(byId.b.axis).toBe('v');   // across the length -> positioned along the width
  });

  it('reports one legend line per distinct crossing depth', () => {
    const views = buildDiagrams(createBoard({ length: 24, width: 12, cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 6, width: 0.75, depth: 0.125 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.375 },
    ]}), 16);
    expect(views[0].crossings).toEqual(['crossing: 3/8" deep governs']);
  });

  it('reports NO legend line when crossing cuts share a depth', () => {
    const views = buildDiagrams(createBoard({ length: 24, width: 12, cuts: [
      { id: 'a', face: 'thickness', from: 'min', across: 'width',  offset: 6, width: 0.75, depth: 0.375 },
      { id: 'b', face: 'thickness', from: 'min', across: 'length', offset: 4, width: 0.75, depth: 0.375 },
    ]}), 16);
    expect(views[0].crossings).toEqual([]);
  });
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/document/diagram.test.ts` — expect failures on the new shape.

- [ ] **Step 3: Implement**

Rewrite `buildDiagrams` in `src/document/diagram.ts`. The grouping loop becomes:

```ts
const ensure = (face: Dimension, from: CutFrom): DiagramView => {
  const key = `${face}|${from}`;
  let view = views.get(key);
  if (!view) {
    // Both in-plane dimensions; the earlier in DIMENSION_ORDER runs horizontal.
    const inPlane = DIMENSION_ORDER.filter((d) => d !== face);
    const [horizontal, vertical] = inPlane;
    view = {
      key,
      heading: `${capitalise(face)} face — ${from} side`,
      face, from, horizontal, vertical,
      h: board[horizontal],
      v: board[vertical],
      hLabel: f(board[horizontal]),
      vLabel: f(board[vertical]),
      cuts: [], cells: [], crossings: [],
    };
    views.set(key, view);
  }
  return view;
};
```

Per cut, the region already comes from `cutRegion`, so read its two in-plane spans by name and set `axis` from whether the position axis is the horizontal one:

```ts
  const view = ensure(cut.face, cut.from);
  const region = cutRegion(board, cut);
  const pos = positionAxisOf(cut.face, cut.across);
  view.cuts.push({
    id: cut.id,
    h: region[view.horizontal],
    v: region[view.vertical],
    axis: pos === view.horizontal ? 'h' : 'v',
    depthLabel: `${f(cut.depth)} deep`,
    offsetLabel: f(cut.offset),
    widthLabel: f(cut.width),
    kind: cutLabel(board, cut),
  });
```

After the loop, fill `cells` and `crossings` per view:

```ts
for (const view of out) {
  view.cells = buildDepthField(board, view.face, view.from, view.horizontal, view.vertical);
  const depths = [...new Set(view.cells.filter((c) => c.crossing).map((c) => c.depth))]
    .sort((a, b) => a - b);
  view.crossings = depths.map((d) => `crossing: ${f(d)} deep governs`);
}
```

Keep the existing cut-free fallback, now `ensure('thickness', 'min')`. Keep the existing sorts, replacing the `across` tiebreak with `from` (`'min'` before `'max'`), and sort each view's cuts by `h[0]`, then `v[0]`, then `id`.

- [ ] **Step 4: Run and verify pass**

Run: `npx vitest run src/document/diagram.test.ts`

- [ ] **Step 5: Full suite**

Run: `npm test`. **`PartDiagram.test.tsx` will now fail** — it renders the old shape. That is expected at this step and Task 6 fixes it. Do NOT edit `PartDiagram.tsx` here. Record the failing count in your report and proceed.

- [ ] **Step 6: Commit**

```bash
git add src/document/diagram.ts src/document/diagram.test.ts
git commit -m "feat: re-key diagram views on (face, from)

One view per physical face, so perpendicular cuts appear in one figure
instead of two that each show half the truth. Cuts carry the axis their
offset is measured along; the view carries the face's depth field and one
legend line per distinct crossing depth.

Retires hasFar and DiagramCut.side: every view is one side now, so near
and far have nothing left to encode.

PartDiagram is left broken deliberately -- the renderer is the next task."
```

---

### Task 6: Render the per-face view

**Files:**
- Modify: `src/panels/PartDiagram.tsx` (substantially rewritten)
- Modify: `src/styles.css`
- Test: `src/panels/PartDiagram.test.tsx`

**Interfaces:**
- Consumes: `DiagramView`/`DiagramCut`/`FaceCell` (Task 5); `bandOn` (Task 4); `labelWidth`, `labelHeight`, `LABEL_ASCENT`, `packRow`, `LABEL_SIZE` (Task 1).
- Produces: the rendered SVG. Class names later tasks assert on: `.cutlist-diagram-outline`, `.cutlist-diagram-cell`, `.cutlist-diagram-cross`, `.cutlist-diagram-leader` (rows), `.cutlist-diagram-leader-v` (rotated columns), `.cutlist-diagram-overall`, `.cutlist-diagram-crossings`.

**Layout.** Horizontal-axis cuts keep today's leader rows below the outline. Vertical-axis cuts get leader columns to the LEFT, so the drawing gains a left gutter of `LEFT = COL * (number of v-axis cuts)`. Each column's labels are `rotate(-90)` and packed with `packRow` on the y axis — `packRow` is 1-D arithmetic and needs no change. A rotated label's extent along **x** is `labelHeight()`, and along **y** is `labelWidth(s)`.

- [ ] **Step 1: Update the tests**

Rewrite `src/panels/PartDiagram.test.tsx`'s helpers for the new shape and keep every assertion that still applies. The eight sweep-geometry collision tests must be retained and extended: the box helper must now account for rotated labels, whose x-extent is `labelHeight()` and y-extent is `labelWidth(text)`.

Add:

```tsx
  it('draws one cell rect per depth-field cell', () => {
    const { container } = render(<PartDiagram view={crossingView()} />);
    expect(container.querySelectorAll('.cutlist-diagram-cell').length).toBeGreaterThan(1);
  });

  it('cross-hatches only the crossing cells', () => {
    const { container } = render(<PartDiagram view={crossingView()} />);
    const cross = container.querySelectorAll('.cutlist-diagram-cross');
    expect(cross).toHaveLength(1);
    expect(cross[0].getAttribute('fill')).toMatch(/^url\(#/);
  });

  it('gives a vertically-positioned cut a rotated leader column, not a row', () => {
    const { container } = render(<PartDiagram view={crossingView()} />);
    const col = container.querySelector('.cutlist-diagram-leader-v')!;
    expect(col).toBeInTheDocument();
    expect(col.querySelector('text')!.getAttribute('transform')).toMatch(/rotate\(-90/);
  });

  it('prints the crossing legend it was given and formats nothing itself', () => {
    render(<PartDiagram view={crossingView()} />);
    expect(screen.getByText('crossing: 3/8" deep governs')).toBeInTheDocument();
  });

  it('no longer dashes anything for a far side', () => {
    // Retired with hasFar (spec section 6): every view is one side now.
    const { container } = render(<PartDiagram view={crossingView()} />);
    expect(container.querySelector('.cutlist-diagram-leader-far')).toBeNull();
  });
```

with a `crossingView()` helper building the perpendicular-crossing board from Task 5's tests at precision 16.

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run src/panels/PartDiagram.test.tsx`

- [ ] **Step 3: Implement the renderer**

Key changes to `src/panels/PartDiagram.tsx`:

1. Add `const COL = 26;` (one leader column per v-axis cut) and `const LEFT_PAD = 12;`.
2. Compute `vCuts = view.cuts.filter(c => c.axis === 'v')` and `hCuts = view.cuts.filter(c => c.axis === 'h')`. The left gutter is `left = COL * vCuts.length + (vCuts.length ? LEFT_PAD : 0)`.
3. Offset the whole drawing right by `left`; the outline's x becomes `left + fit.offsetX`.
4. Add a second `<pattern>` for the cross-hatch — two `<line>`s at right angles, same `useId`-derived safe-id treatment as the existing hatch. **Both patterns must be `<pattern>` fills, never CSS backgrounds**, so they survive print with Background graphics off.
5. Render `view.cells` as rects using `bandOn` on each axis: x/width from `bandOn(cell.h, fit.sx, left + fit.offsetX, fit.drawnH)`, y/height from `bandOn(cell.v, fit.sy, top, fit.drawnV)`. Class `cutlist-diagram-cell`, plus `cutlist-diagram-cross` and the cross-hatch fill when `cell.crossing`.
6. Leader rows below for `hCuts` — unchanged from today, including the three end ticks.
7. Leader columns at the left for `vCuts`, at `x = COL * i + COL / 2`, with the line running vertically from the outline's top to the band, ticks perpendicular, and labels `transform={`rotate(-90 ${x} ${y})`}` packed by `packRow` on y.
8. Render `view.crossings` as a `<p className="cutlist-diagram-crossings">` beneath the figure, one line each.
9. **Delete** the `hasFar` caption clause and the `cutlist-diagram-leader-far` class.

- [ ] **Step 4: Update `styles.css`**

Add `.cutlist-diagram-cross` if it needs any stroke treatment, add `.cutlist-diagram-crossings` styling matching `.cutlist-diagram-note`, and **delete** the `.cutlist-diagram-leader-far` rule. Do not add a `font-size` (invariant 19).

- [ ] **Step 5: Run the suite and typecheck**

Run: `npm test` then `npm run build`. Everything green.

- [ ] **Step 6: Commit**

```bash
git add src/panels/PartDiagram.tsx src/panels/PartDiagram.test.tsx src/styles.css
git commit -m "feat: render per-face diagrams with two-axis leaders

Cut cells on both axes, cross-hatch and a legend line where crossing cuts
of differing depths meet, and rotated leader columns at the left for cuts
positioned along the vertical axis. Retires the far-side dash with hasFar."
```

---

### Task 7: Browser verification, and fixing the sweep for rotated text

**Files:**
- Modify: `docs/diagram-overlap-sweep.js`

**THE MOST IMPORTANT THING IN THIS TASK.** `getBBox()` returns a bounding box in the element's own user space, **before its own transform is applied**. Measured this session: a `rotate(-90)` label reported a bbox of 120.29 × 23.68 — its unrotated extents — while its true on-screen rect was 14 × 71.13. The harness currently reads `getBBox()`, so **every rotated label would be measured as horizontal and silently pass.** Given that this whole feature exists because a predicate quietly succeeded under jsdom, shipping a second silently-passing predicate would be the same mistake twice.

- [ ] **Step 1: Switch the harness to transform-aware measurement**

Replace `el.getBBox()` with a helper that composes the bbox with the element's CTM relative to the SVG, so a rotated label reports its true extents in viewBox units:

```js
  /**
   * The element's box in the SVG's own coordinate system, WITH its transform
   * applied.
   *
   * getBBox() alone is measured in the element's user space BEFORE its own
   * transform — a rotate(-90) label reports its UNROTATED extents (measured:
   * 120.29 x 23.68 against a true screen box of 14 x 71.13). Reading getBBox()
   * directly would measure every rotated label as horizontal and pass.
   */
  const boxOf = (el, svg) => {
    const b = el.getBBox();
    const m = el.getScreenCTM().multiply(svg.getScreenCTM().inverse());
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .map(([x, y]) => {
        const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(m);
      });
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys),
             width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  };
```

Use `boxOf(el, svg)` everywhere the harness currently uses `el.getBBox()` for a `<text>`. Update the file's header comment to record why.

- [ ] **Step 2: Prove the fix bites before trusting a green run**

With the app open, evaluate `boxOf` against a rotated leader label and confirm its reported `width` is about 24 and its `height` about the label's advance — i.e. the numbers are swapped relative to `getBBox()`. **If they are not swapped, the fix is not working and a green sweep means nothing.** Record both readings.

- [ ] **Step 3: Re-derive `TOL`**

Run the sweep on the `1 baseline` geometry alone, read the actual worst overhang, set `TOL` from it. Same ordering rule as before: the control produces the tolerance; never pick a tolerance and check the control against it.

- [ ] **Step 4: Run the sweep on the full geometry set**

Seed via `localStorage` under `sloyd.autosave.v1`, then reload. The set must include: the seven original geometries, a perpendicular crossing of differing depths, a perpendicular crossing of equal depth, and the twelve-cut worst case (rabbets on all four edges of both faces plus crossing dados). Expected: `issues` empty for every figure.

If anything fails, **report it — do not widen `TOL`.**

- [ ] **Step 5: Judge what no predicate can**

Look at the rendered sheet and record: whether hatch and cross-hatch are distinguishable at screen size; whether the rotated column labels are readable; and **the total sheet length for the twelve-cut part**, which spec §10 flags as unverified — a part that now yields four figures may make the sheet impractical even though every figure is individually correct.

- [ ] **Step 6: Commit**

```bash
git add docs/diagram-overlap-sweep.js
git commit -m "docs: make the sweep transform-aware, and re-derive TOL

getBBox() is measured in the element's own user space BEFORE its own
transform, so a rotate(-90) label reports its unrotated extents -- 120.29
x 23.68 against a true box of 14 x 71.13. The harness would have measured
every rotated label as horizontal and passed, which is the same
silently-succeeding-predicate failure this feature already shipped once."
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/follow-ups.md`, `CLAUDE.md`

- [ ] **Step 1: `docs/follow-ups.md`**

Record: that the `(face, across)` key fragmented a single face into two figures and how it was found (driving a real browser with a twelve-cut board, not by reading code); that `hasFar` and the far-side dash were retired one round after being added, and why that is not a regression; that `getBBox()` ignores an element's own transform, with the measured numbers, as a standing trap for anyone extending the harness; and the §10 risks that survive — two fills may be too few, and view count rises.

- [ ] **Step 2: `CLAUDE.md`**

Replace the "what is next" paragraph with what this round did. Add `depthField.ts` to the Where things live tree. Add an invariant for the depth field's relationship to `boardSolids`: same split skeleton, different operation (max versus boolean), agreement asserted by `depthField.agreement.test.ts` rather than assumed. Update the test count to the real number — run `npm test` and read it; do not write a number you have not read.

- [ ] **Step 3: Commit**

```bash
git add docs/follow-ups.md CLAUDE.md
git commit -m "docs: record the per-face diagram round"
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §4 depth field (split/cover/merge) | 2 |
| §4 "not `cuts.ts` reused" stated in code | 2 |
| §5 `(face, from)` key, heading, axis rule | 5 |
| §6 retire `hasFar` / dash / `.leader-far` | 5 (data), 6 (render + CSS) |
| §7 two fills, cross-hatch, legend | 5 (strings), 6 (fills) |
| §7 depth stays per cut in its leader | 6 |
| §7 new measured glyph-height constant | 1 |
| §7 rotated leader columns, `packRow` reused | 6 |
| §8 layer 1 — depth field unit tests | 2 |
| §8 layer 2 — agreement test | 3 |
| §8 layer 3 — layout collision predicate | 6 |
| §8 unverifiable: legibility, print | 7 (recorded), 8 (written up) |
| §9 sequencing: depth field ≠ layout | 2/3 vs 6 |
| §10 risks | 8 |

**Type consistency:** `FaceCell` is named identically in Tasks 2, 5 and 6. `buildDepthField`'s five-parameter signature is identical in Tasks 2, 3 and 5. `bandOn` returns `{ start, size }` in Tasks 4 and 6 — deliberately NOT `{ x, width }`, so an axis mix-up is a type-level error rather than a silent y-into-x bug. `DiagramCut.axis` is `'h' | 'v'` in Tasks 5 and 6.

**One deliberate red flag, called out rather than hidden:** Task 5 ends with `PartDiagram.test.tsx` failing, and Task 6 fixes it. This violates the usual "green after every task" rule. The alternative — one task rewriting `diagram.ts`, `PartDiagram.tsx`, the CSS and two test files together — is exactly what spec §9 forbids, because it would forfeit the ability to reject the risky renderer while keeping the reviewed data layer. The reviewer of Task 5 should verify the failures are confined to `PartDiagram.test.tsx` and are shape mismatches, nothing else.
