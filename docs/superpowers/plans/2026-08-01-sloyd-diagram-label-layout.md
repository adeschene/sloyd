# Cut List Diagram — Label Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible for two labels in a cut list diagram to overlap, by moving every cut's numbers into that cut's own stacked leader row and packing the labels in that row with measured-by-arithmetic widths.

**Architecture:** Diagram labels adopt `--font-num`, the monospace stack the rest of the app already uses for numbers, which makes `labelWidth(s) = s.length × CHAR_W` exact rather than estimated. Cross-cut collisions then die by construction (one row per cut, rows are `ROW` apart vertically), and the ≤3 labels within a row are placed by a pure two-sweep 1-D packer. Nothing is drawn above or below the outline any more.

**Tech Stack:** TypeScript, React 19, SVG, Vitest + @testing-library/react (jsdom), Playwright for browser verification.

**Spec:** `docs/superpowers/specs/2026-08-01-sloyd-diagram-label-layout-design.md`. Read it before starting — particularly §2 (why the constants cannot fix this) and §6's stated boundary on what the unit tests do and do not prove.

## Global Constraints

- **`PartDiagram.tsx` formats nothing.** Every label string arrives from `buildDiagrams`. Do not build, concatenate, or round a string in the renderer. `document/diagram.ts` is not modified by this plan at all.
- **No schema change.** `CURRENT_VERSION` stays 4.
- **`npm test` does not typecheck.** `npm run build` (`tsc -b && vite build`) is the typecheck gate and must be run before any task is called done.
- **The suite is 488 tests before this plan.** It must be green, and larger, after every task.
- **Layer order holds:** `panels` may import from `document` and `units`; nothing in `document` may import from `panels`.
- **`LABEL_SIZE` has exactly one home** — `diagramLabels.ts`. It is applied to the `<svg>` as an attribute. `styles.css` must not carry a `font-size` for diagram text.
- **Playwright is the only browser tooling that works on this host** (follow-up 26a). Not chrome-devtools MCP, not claude-in-chrome.
- Commit after every task. No pull requests — this repo commits to `master` or merges a local branch with `--no-ff`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/panels/diagramLabels.ts` | **create** | How wide a label is, and where a row of them can sit. Pure. |
| `src/panels/diagramLabels.test.ts` | **create** | `labelWidth` and `packRow`, directly. |
| `src/panels/diagramScale.ts` | modify | `band()` gains an ordering guard and an outline clamp. |
| `src/panels/diagramScale.test.ts` | modify | Two new `band` cases. |
| `src/panels/PartDiagram.tsx` | modify | Re-laid out: depth into the row, `packRow` applied, far leaders dashed. |
| `src/panels/PartDiagram.test.tsx` | modify | Two existing tests updated; the seven sweep geometries added. |
| `src/styles.css` | modify | `font-family: var(--font-num)` on diagram text; `font-size` removed. |
| `docs/diagram-overlap-sweep.js` | modify | `TOL` re-derived from a post-change baseline run. |
| `docs/follow-ups.md` | modify | 59 closed, 60/62/65 amended. |
| `CLAUDE.md` | modify | "What is next" replaced by what this round did. |

---

### Task 1: `diagramLabels.ts` — label width and row packing

**Files:**
- Create: `src/panels/diagramLabels.ts`
- Test: `src/panels/diagramLabels.test.ts`

**Interfaces:**
- Consumes: nothing. This is a leaf module; it imports nothing.
- Produces: `LABEL_SIZE: number`, `LABEL_EM: number`, `CHAR_W: number`, `labelWidth(s: string): number`, `interface LabelBox { centre: number; width: number }`, `packRow(items: LabelBox[], min: number, max: number, gap: number): number[]` — returns **centres**, one per item, in the same order.

- [ ] **Step 1: Write the failing tests**

Create `src/panels/diagramLabels.test.ts`:

```ts
import { labelWidth, packRow, CHAR_W, LABEL_SIZE, LABEL_EM } from './diagramLabels';

describe('labelWidth', () => {
  it('is linear in the character count', () => {
    // Measured in a real browser at font-size 20 with --font-num: every glyph
    // is exactly 12.05 units. See the spec's section 2 table.
    expect(labelWidth('6"')).toBeCloseTo(2 * CHAR_W, 10);
    expect(labelWidth('3/4"')).toBeCloseTo(4 * CHAR_W, 10);
    expect(labelWidth('100-15/16"')).toBeCloseTo(10 * CHAR_W, 10);
  });

  it('bounds the measured advance from ABOVE, never below', () => {
    // 12.05 was measured; CHAR_W must exceed it or the packer under-spaces and
    // the browser overlaps while every test here passes.
    expect(CHAR_W).toBeGreaterThan(12.05);
    expect(CHAR_W).toBe(LABEL_SIZE * LABEL_EM);
  });

  it('counts the space in a label that has one', () => {
    expect(labelWidth('3/8" deep')).toBeCloseTo(9 * CHAR_W, 10);
  });

  it('is zero for an empty label', () => {
    expect(labelWidth('')).toBe(0);
  });
});

describe('packRow', () => {
  it('leaves comfortably-spaced labels exactly where they asked to be', () => {
    const out = packRow([{ centre: 100, width: 20 }, { centre: 300, width: 20 }], 0, 1000, 8);
    expect(out).toEqual([100, 300]);
  });

  it('pushes an overlapping pair apart to exactly the gap', () => {
    const out = packRow([{ centre: 100, width: 40 }, { centre: 110, width: 40 }], 0, 1000, 8);
    expect(out[0]).toBeCloseTo(100, 10);          // the leftmost never moves...
    expect(out[1] - out[0]).toBeCloseTo(48, 10);  // ...the next one cascades right
    expect(out[1] - 20 - (out[0] + 20)).toBeCloseTo(8, 10);
  });

  it('preserves order, whatever the ideal centres ask for', () => {
    const out = packRow(
      [{ centre: 500, width: 100 }, { centre: 10, width: 100 }, { centre: 20, width: 100 }],
      0, 1000, 8,
    );
    expect(out[0]).toBeLessThan(out[1]);
    expect(out[1]).toBeLessThan(out[2]);
  });

  it('shifts the whole row left rather than overflowing the right bound', () => {
    const out = packRow([{ centre: 90, width: 40 }, { centre: 95, width: 40 }], 0, 100, 8);
    expect(out[1] + 20).toBeCloseTo(100, 10);     // right edge sits exactly on max
    expect(out[1] - out[0]).toBeCloseTo(48, 10);  // the gap survived the shift
  });

  it('overflows RIGHT, never left, when a row genuinely cannot fit', () => {
    // Two 40-wide labels plus a gap need 88 units; the interval is 50.
    const out = packRow([{ centre: 25, width: 40 }, { centre: 25, width: 40 }], 0, 50, 8);
    expect(out[0] - 20).toBe(0);                  // clamped at min, not pushed past it
    expect(out[1] + 20).toBeGreaterThan(50);      // the overflow goes right
  });

  it('handles the degenerate rows without returning NaN', () => {
    expect(packRow([], 0, 100, 8)).toEqual([]);
    expect(packRow([{ centre: 50, width: 0 }], 0, 100, 8)).toEqual([50]);
    for (const c of packRow([{ centre: 5, width: 30 }], 0, 100, 8)) {
      expect(Number.isFinite(c)).toBe(true);
    }
  });

  it('clamps a single over-left label into the interval', () => {
    expect(packRow([{ centre: 5, width: 30 }], 0, 100, 8)).toEqual([15]);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/panels/diagramLabels.test.ts`
Expected: FAIL — `Failed to resolve import "./diagramLabels"`.

- [ ] **Step 3: Write the implementation**

Create `src/panels/diagramLabels.ts`:

```ts
/**
 * How wide a diagram label is, and where a row of them can sit.
 *
 * WHY THIS IS ARITHMETIC AND NOT A MEASUREMENT. Every `<text>` in
 * `PartDiagram.tsx` used to be positioned by geometry alone, with nothing
 * measuring the string being placed — SVG text has extent and the code treated
 * it as a point (follow-up 59). The obvious fix, `getComputedTextLength()` in a
 * layout effect, is invisible to vitest: jsdom returns 0, which is the exact
 * hole the whole defect class came through.
 *
 * So the labels are set in `--font-num` instead — the monospace stack the rest
 * of the app already uses for every number it prints, and the one thing the
 * diagram labels inexplicably did not use. Measured in a real browser at
 * font-size 20, that face advances EXACTLY 12.05 units per glyph for the whole
 * label alphabet (digits, `/`, `-`, `"`, space, and the word "deep"), so a
 * label's width is its character count times a constant. See the design spec's
 * section 2 for the measurements.
 */

/**
 * The label font size, in SVG USER UNITS.
 *
 * This is the single home for the number. It is applied to the `<svg>` element
 * as an attribute, NOT set in `styles.css` — the constant the arithmetic below
 * uses has to be the constant the browser renders, and a font size living in
 * both a .ts and a .css file is precisely the drift follow-up 64 records.
 *
 * User units rather than px means it scales with the drawing, so screen and
 * print agree without a second set of constants.
 */
export const LABEL_SIZE = 20;

/**
 * An UPPER BOUND on monospace advance, in em.
 *
 * Measured 0.6025 on this host; 0.62 leaves headroom for a machine whose
 * `--font-num` stack resolves to a wider face. The bound must err HIGH: too
 * wide only spaces labels further apart than they needed, while too narrow
 * silently reintroduces the overlap this module exists to prevent, with every
 * unit test still passing.
 */
export const LABEL_EM = 0.62;

export const CHAR_W = LABEL_SIZE * LABEL_EM;

export const labelWidth = (s: string): number => s.length * CHAR_W;

export interface LabelBox {
  /** Where the label would sit if nothing else existed. */
  centre: number;
  width: number;
}

/**
 * Ideal centres in, non-overlapping centres out.
 *
 * Items MUST arrive in left-to-right order; the function preserves that order
 * rather than establishing it, because the caller's order is the board's
 * order (offset run, then band, then depth) and re-sorting by centre would
 * silently reassociate a label with the wrong feature on a crowded row.
 *
 * The leftmost label never moves unless the row overflows `max`. That is what
 * makes a crowded row read as a CASCADE — each label displaced right of the
 * one before it — rather than as a clump slid away from the geometry. See the
 * spec's section 9 for the worked case-6 numbers.
 */
export function packRow(items: LabelBox[], min: number, max: number, gap: number): number[] {
  if (items.length === 0) return [];

  const lefts: number[] = [];
  let cursor = min;
  for (const item of items) {
    const left = Math.max(item.centre - item.width / 2, cursor);
    lefts.push(left);
    cursor = left + item.width + gap;
  }

  // `cursor` sits one gap past the last item's right edge.
  const overflow = cursor - gap - max;
  if (overflow > 0) {
    // Shift uniformly, which preserves every gap, then re-clamp the head at
    // `min`. A row that genuinely cannot fit overflows to the RIGHT, into the
    // gutter, rather than to the left across the board it annotates.
    const shift = Math.min(overflow, lefts[0] - min);
    for (let i = 0; i < lefts.length; i += 1) lefts[i] -= shift;
  }

  return lefts.map((left, i) => left + items[i].width / 2);
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/panels/diagramLabels.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/panels/diagramLabels.ts src/panels/diagramLabels.test.ts
git commit -m "feat: add diagramLabels — computable label width and row packing

Label width becomes arithmetic rather than a getComputedTextLength call
jsdom returns 0 for, because --font-num advances exactly 12.05 units per
glyph at font-size 20. CHAR_W deliberately bounds that from above: too
wide only over-spaces, too narrow reintroduces the overlap with every
test still green.

packRow preserves caller order rather than sorting by centre — the order
is the board's order, and re-sorting would reassociate a label with the
wrong feature on a crowded row."
```

---

### Task 2: `band()` — clamp to the outline, and close follow-up 62

**Files:**
- Modify: `src/panels/diagramScale.ts:91-97`
- Test: `src/panels/diagramScale.test.ts` (append to the existing `describe('band')`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `band(span, fit)` keeps its signature `(span: Span, fit: DiagramFit) => { x: number; width: number }`. Its result is now guaranteed to satisfy `x >= fit.offsetX` and `x + width <= fit.offsetX + fit.drawnH` whenever `fit.drawnH >= MIN_FEATURE`.

**Why follow-up 62 gets closed here rather than deferred again:** an out-of-order `[max, min]` span produces a negative `width`, which fails the `width >= MIN_FEATURE` test and falls into the widening branch — so it silently re-centres as a legitimate-looking narrow band in the wrong place. Clamping alone does not narrow that hazard at all, because the band being clamped is already a positive `MIN_FEATURE` one. It is a two-line guard in a function this task already edits.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('band', ...)` in `src/panels/diagramScale.test.ts`:

```ts
  it('keeps a widened band inside the outline at the min edge', () => {
    // Follow-up 59's third instance: a cut at offset 0 narrower than
    // MIN_FEATURE used to get x = centre - 3, i.e. LEFT of the board's own
    // edge, and `overflow: visible` drew it there rather than clipping it.
    const fit = fitView(24, 5.5);
    const b = band([0, 0.125], fit);
    expect(b.x).toBeGreaterThanOrEqual(fit.offsetX);
    expect(b.width).toBe(MIN_FEATURE);
  });

  it('keeps a widened band inside the outline at the max edge', () => {
    const fit = fitView(24, 5.5);
    const b = band([23.875, 24], fit);
    expect(b.x + b.width).toBeLessThanOrEqual(fit.offsetX + fit.drawnH);
    expect(b.width).toBe(MIN_FEATURE);
  });

  it('respects the offset of a centred drawing when it clamps', () => {
    const fit = fitView(0.75, 24);            // the MIN_WIDTH branch: offsetX > 0
    const b = band([0, 0.01], fit);
    expect(b.x).toBeGreaterThanOrEqual(fit.offsetX);
  });

  it('normalises an out-of-order span instead of drawing it in the wrong place', () => {
    // Follow-up 62, closed. A [max, min] span gives a NEGATIVE width, which
    // fails the MIN_FEATURE test and falls into the widening branch — so it
    // used to draw a plausible-looking narrow band centred between the two
    // values, with no error anywhere. cutRegion never emits one, but band() is
    // a small exported pure function a future caller can reach without reading
    // cutRegion's contract first.
    const fit = fitView(24, 5.5);
    expect(band([6.75, 6], fit)).toEqual(band([6, 6.75], fit));
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/panels/diagramScale.test.ts`
Expected: FAIL — the min-edge case reports `b.x` of about `-3` against `fit.offsetX` of `0`, and the out-of-order case returns a `MIN_FEATURE` band rather than the true one.

- [ ] **Step 3: Write the implementation**

Replace `band` in `src/panels/diagramScale.ts` (the whole function, keeping the existing doc comment above it and extending it):

```ts
/**
 * A cut's band along the horizontal axis.
 *
 * Widening is ABOUT THE CENTRE, not from the left edge. Position is the
 * property the drawing preserves — "near the far end" must still read as near
 * the far end — and centre-preserving widening keeps the error symmetric and
 * bounded at MIN_FEATURE / 2. The annotated numbers stay exact regardless; the
 * printed caption says the drawing is schematic.
 *
 * Two guards sit around that, and neither is decoration:
 *
 * ORDERING. A `[max, min]` span yields a negative width, which fails the
 * MIN_FEATURE test and falls into the widening branch — drawing a plausible
 * narrow band in the wrong place with no error anywhere (follow-up 62).
 * `cutRegion` is the only current producer and always emits min-then-max, but
 * this is a small exported pure function and a hand-built Span is one import
 * away.
 *
 * CLAMPING. Widening about the centre puts the band outside the board whenever
 * the cut is within MIN_FEATURE / 2 of an edge — a cut at `offset: 0` came out
 * at `x = centre - 3`, left of the outline, and `overflow: visible` drew it
 * there. Clamping gives up exact centring in precisely the case where exact
 * centring is wrong, and nowhere else.
 */
export function band(span: Span, fit: DiagramFit): { x: number; width: number } {
  const lo = Math.min(span[0], span[1]);
  const hi = Math.max(span[0], span[1]);
  const x0 = fit.offsetX + lo * fit.sx;
  const x1 = fit.offsetX + hi * fit.sx;
  const width = x1 - x0;
  if (width >= MIN_FEATURE) return { x: x0, width };

  // Widen about the centre, then slide back inside the outline if that pushed
  // an edge cut out of it. `Math.max` last so a board drawn narrower than
  // MIN_FEATURE pins to the left edge rather than inverting the clamp.
  const left = fit.offsetX;
  const right = fit.offsetX + fit.drawnH;
  const x = (x0 + x1) / 2 - MIN_FEATURE / 2;
  return { x: Math.max(left, Math.min(x, right - MIN_FEATURE)), width: MIN_FEATURE };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/panels/diagramScale.test.ts`
Expected: PASS. The four pre-existing `band` tests must still pass — in particular "widens about the centre, so position stays honest", whose cut at 84" on a 96" board is nowhere near an edge and therefore is not clamped.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/panels/diagramScale.ts src/panels/diagramScale.test.ts
git commit -m "fix: clamp a widened band inside the outline, and close follow-up 62

A cut at offset 0 narrower than MIN_FEATURE got x = centre - 3, left of
the board's own edge, and overflow: visible drew it there rather than
clipping it — the third instance folded into follow-up 59.

Closes 62 in the same function: an out-of-order [max, min] span yields a
negative width, which FAILS the MIN_FEATURE test and falls into the
widening branch, so it drew a plausible narrow band in the wrong place
with no error. Clamping does not narrow that hazard, since the band being
clamped is already a positive MIN_FEATURE one — it needs its own guard."
```

---

### Task 3: `PartDiagram.tsx` — the new layout

**Files:**
- Modify: `src/panels/PartDiagram.tsx` (substantially rewritten)
- Modify: `src/styles.css:608-617`
- Test: `src/panels/PartDiagram.test.tsx` (two existing tests updated)

**Interfaces:**
- Consumes: `labelWidth`, `packRow`, `LABEL_SIZE` from `./diagramLabels` (Task 1); `band`, `fitView`, `DRAW_WIDTH` from `./diagramScale` (Task 2).
- Produces: the rendered SVG. Class names later tasks assert on: `.cutlist-diagram-outline`, `.cutlist-diagram-near`, `.cutlist-diagram-far`, `.cutlist-diagram-leader` (a `<g>` per row and one for the overall-length run), `.cutlist-diagram-leader-far` (added to a far cut's row `<g>`), `.cutlist-diagram-overall` (the overall-width label — **replaces** `.cutlist-diagram-depth`, which no longer exists).

- [ ] **Step 1: Update the two existing tests that assert the old layout**

In `src/panels/PartDiagram.test.tsx`, **replace** the test named `'keeps the first leader label clear of the outline AND the far label, when there is a far cut'` (lines 99-114) with:

```tsx
  it('draws no text at all above or below the outline', () => {
    // The heart of this round: every number a cut owns now lives in that cut's
    // own leader row, which is what makes cross-cut collisions impossible by
    // construction rather than by arithmetic. Nothing may drift back into the
    // band above or below the board.
    const { container } = render(<PartDiagram view={view(dado(), dado({ id: 'c2', from: 'max' }))} />);
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const top = Number(outline.getAttribute('y'));
    const bottom = top + Number(outline.getAttribute('height'));
    for (const t of container.querySelectorAll('text')) {
      const y = Number(t.getAttribute('y'));
      // The overall-width label sits BESIDE the outline, vertically within it.
      if (t.classList.contains('cutlist-diagram-overall')) continue;
      expect(y - 15).toBeGreaterThan(bottom);
    }
    expect(top).toBeGreaterThan(0);
  });

  it('dashes a far cut\'s leader row, so near/far stays encoded twice', () => {
    // Depth labels used to sit above the outline for a near cut and below for a
    // far one — the same distinction the band's line style makes, encoded
    // redundantly on purpose. Folding depth into the row costs that second
    // encoding, so the row's own leader line takes it over.
    const { container } = render(<PartDiagram view={view(dado(), dado({ id: 'c2', from: 'max' }))} />);
    const rows = [...container.querySelectorAll('.cutlist-diagram-leader')];
    const far = rows.filter((g) => g.classList.contains('cutlist-diagram-leader-far'));
    expect(far).toHaveLength(1);
  });
```

**Replace** the test named `"tracks the outline's actual right edge for the overall-width label, not the nominal width"` (lines 116-131) with:

```tsx
  it('tracks the outline\'s actual right edge for the overall-width label, not the nominal width', () => {
    // Important 2: the label used to be pinned to DRAW_WIDTH + 12 regardless
    // of where the outline was actually drawn. Use a board that enters the
    // shrink branch (h = 24, v = 24, via width: 24) so offsetX/drawnH differ
    // from the nominal DRAW_WIDTH.
    const { container } = render(
      <PartDiagram view={buildDiagrams(createBoard({ width: 24, cuts: [dado()] }), 16)[0]} />,
    );
    const outline = container.querySelector('.cutlist-diagram-outline')!;
    const right = Number(outline.getAttribute('x')) + Number(outline.getAttribute('width'));
    const vLabel = container.querySelector('.cutlist-diagram-overall')!;
    expect(Number(vLabel.getAttribute('x'))).toBeCloseTo(right + 12, 10);
    expect(vLabel.getAttribute('dominant-baseline')).toBe('middle');
  });

  it('pulls the overall-width label back inside the viewBox when the gutter cannot hold it', () => {
    // A long board with a long width label: right + 12 + labelWidth would run
    // past DRAW_WIDTH + RIGHT. Goal 2 of the spec is about the viewBox, so this
    // is enforced rather than assumed to be unreachable.
    const { container } = render(
      <PartDiagram
        view={buildDiagrams(createBoard({ length: 240, width: 100.9375, cuts: [dado()] }), 16)[0]}
      />,
    );
    const svg = container.querySelector('svg')!;
    const vbWidth = Number(svg.getAttribute('viewBox')!.split(/\s+/)[2]);
    const vLabel = container.querySelector('.cutlist-diagram-overall')!;
    expect(Number(vLabel.getAttribute('x')) + labelWidth(vLabel.textContent!))
      .toBeLessThanOrEqual(vbWidth);
  });
```

Add to the imports at the top of the file:

```tsx
import { labelWidth } from './diagramLabels';
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/panels/PartDiagram.test.tsx`
Expected: FAIL — `.cutlist-diagram-overall` matches nothing (the class does not exist yet), and text is still drawn above the outline.

- [ ] **Step 3: Rewrite `PartDiagram.tsx`**

Replace the whole of `src/panels/PartDiagram.tsx` with:

```tsx
import { useId } from 'react';
import type { DiagramView } from '../document/document';
import { band, fitView, DRAW_WIDTH } from './diagramScale';
import { labelWidth, packRow, LABEL_SIZE } from './diagramLabels';

/** Stroke clearance above the outline. Nothing is DRAWN above it any more. */
const TOP = 4;
/** Clearance between the outline and the leader stack. */
const GAP = 16;
/** One stacked leader row per cut. */
const ROW = 26;
/** The overall-length run along the bottom. */
const BOTTOM = 34;
/** Room to the right of the outline for the overall-width label. */
const RIGHT = 90;
/** Minimum clearance between two labels in a row, and band-to-depth-label. */
const GAP_X = 8;
/** The full drawable interval — the viewBox, not the outline. */
const VIEW_W = DRAW_WIDTH + RIGHT;

/**
 * One view of a part, as a schematic.
 *
 * Formats NOTHING — every string arrives from `buildDiagrams`, which is the
 * rule `CutList.tsx` already follows and the reason display rounding lives in
 * one place.
 *
 * SVG rather than canvas: it prints as vectors at printer resolution, and the
 * hatch is an SVG `<pattern>` fill, which is FOREGROUND content. A CSS
 * background would be dropped whenever Chrome's "Background graphics" is off —
 * the existing print block already carries a comment about that — and the
 * near/far distinction would silently collapse to solid-versus-dashed on a
 * default print.
 *
 * NOTHING IS DRAWN ABOVE OR BELOW THE OUTLINE. Every number a cut owns lives in
 * that cut's own stacked leader row, which is what makes a collision BETWEEN
 * cuts impossible by construction — rows are ROW units apart vertically, so no
 * arithmetic is involved. Only the three labels WITHIN a row can collide, and
 * `packRow` settles those (follow-up 59).
 *
 * Depth moved into the row for a better reason than the collision that prompted
 * it: depth runs PERPENDICULAR to this view. It has no position on the page, so
 * centring it on its band was never spatially meaningful — placing it beside the
 * band is honest about that.
 */
export function PartDiagram({ view }: { view: DiagramView }) {
  // A `<pattern>` id must be unique in the document: two diagrams sharing one
  // would leave the second silently reusing the first's fill.
  //
  // Stripped of punctuation on purpose. `useId` returns a value wrapped in
  // reserved characters (`:r0:`, and `«r0»` in React 19), and BOTH are unsafe
  // inside a `url(#...)` reference — the fragment stops parsing at the
  // punctuation and the fill silently resolves to nothing. jsdom will not
  // catch this: the attribute still starts with `url(#`, so a naive test
  // passes while a real browser draws an unhatched rect. Do not simplify this
  // back to a bare `useId()`.
  const hatch = `hatch${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const fit = fitView(view.h, view.v);

  const top = TOP;
  const bottom = top + fit.drawnV;
  const leaders = bottom + GAP;
  const height = leaders + ROW * view.cuts.length + BOTTOM;
  const baseline = height - BOTTOM / 2;

  // The overall-length label is a one-item row, so it clamps into the viewBox
  // by the same rule as everything else rather than by being assumed to fit.
  const [hx] = packRow(
    [{ centre: fit.offsetX + fit.drawnH / 2, width: labelWidth(view.hLabel) }],
    0, VIEW_W, GAP_X,
  );
  // The overall-width label is anchored at its START, beside the outline, so it
  // is pulled back rather than centred when the gutter cannot hold it.
  const vx = Math.min(fit.offsetX + fit.drawnH + 12, VIEW_W - labelWidth(view.vLabel));

  return (
    <figure className="cutlist-diagram">
      <figcaption className="cutlist-diagram-head">{view.heading}</figcaption>

      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        fontSize={LABEL_SIZE}
        role="img"
        aria-label={view.heading}
      >
        <defs>
          <pattern
            id={hatch}
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke="currentColor" strokeWidth="1.5" />
          </pattern>
        </defs>

        <rect
          className="cutlist-diagram-outline"
          x={fit.offsetX}
          y={top}
          width={fit.drawnH}
          height={fit.drawnV}
        />

        {view.cuts.map((cut) => {
          const b = band(cut.h, fit);
          const near = cut.side === 'min';
          return (
            <rect
              key={cut.id}
              className={near ? 'cutlist-diagram-near' : 'cutlist-diagram-far'}
              x={b.x}
              y={top}
              width={b.width}
              height={fit.drawnV}
              fill={near ? `url(#${hatch})` : 'none'}
            />
          );
        })}

        {view.cuts.map((cut, i) => {
          const b = band(cut.h, fit);
          const y = leaders + ROW * i + ROW / 2;
          const depthW = labelWidth(cut.depthLabel);
          // In board order, left to right: the offset run, the band, then depth
          // just clear of the band. `packRow` preserves that order.
          const [ox, wx, dx] = packRow(
            [
              { centre: (fit.offsetX + b.x) / 2, width: labelWidth(cut.offsetLabel) },
              { centre: b.x + b.width / 2, width: labelWidth(cut.widthLabel) },
              { centre: b.x + b.width + GAP_X + depthW / 2, width: depthW },
            ],
            0, VIEW_W, GAP_X,
          );
          return (
            <g
              className={
                cut.side === 'min'
                  ? 'cutlist-diagram-leader'
                  : 'cutlist-diagram-leader cutlist-diagram-leader-far'
              }
              key={cut.id}
            >
              <line x1={fit.offsetX} y1={y} x2={b.x} y2={y} />
              <line x1={b.x} y1={y} x2={b.x + b.width} y2={y} />
              <text x={ox} y={y - 6} textAnchor="middle">{cut.offsetLabel}</text>
              <text x={wx} y={y - 6} textAnchor="middle">{cut.widthLabel}</text>
              <text x={dx} y={y - 6} textAnchor="middle">{cut.depthLabel}</text>
            </g>
          );
        })}

        <g className="cutlist-diagram-leader">
          <line x1={fit.offsetX} y1={baseline} x2={fit.offsetX + fit.drawnH} y2={baseline} />
          <text x={hx} y={baseline - 6} textAnchor="middle">{view.hLabel}</text>
        </g>

        <text
          className="cutlist-diagram-overall"
          x={vx}
          y={top + fit.drawnV / 2}
          dominantBaseline="middle"
        >
          {view.vLabel}
        </text>
      </svg>

      <p className="cutlist-diagram-note">
        Schematic — not to scale
        {view.hasFar && ' · hatched: this side · dashed: far side'}
      </p>
    </figure>
  );
}
```

- [ ] **Step 4: Update `styles.css`**

Replace lines 608-617 of `src/styles.css`:

```css
/* --font-num, not the sheet's UI face: these are numbers, like every other
   number in the app — and the monospace advance is what makes labelWidth()
   arithmetic rather than a measurement jsdom cannot make. font-size is set on
   the <svg> from LABEL_SIZE and must NOT be duplicated here. */
.cutlist-diagram-overall,
.cutlist-diagram-leader text {
  fill: currentColor;
  font-family: var(--font-num);
}

.cutlist-diagram-leader line {
  stroke: currentColor;
  stroke-width: 1.5;
}

/* Near/far, encoded a second time — it used to be above-versus-below the
   outline for the depth label, which no longer exists. */
.cutlist-diagram-leader-far line {
  stroke-dasharray: 10 7;
}
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. All of `PartDiagram.test.tsx` is green, including the pre-existing tests for the outline, band count, hatch fill, legend, caption, the label strings, the aria label, the pattern id and its safe alphabet, and "keeps the first leader label clear of the outline".

- [ ] **Step 6: Typecheck**

Run: `npm run build`
Expected: exit 0. `RIGHT` is still referenced (via `VIEW_W`); `FAR` is gone entirely.

- [ ] **Step 7: Commit**

```bash
git add src/panels/PartDiagram.tsx src/panels/PartDiagram.test.tsx src/styles.css
git commit -m "feat: put every cut's numbers in that cut's own leader row

Nothing is drawn above or below the outline any more, which makes a
collision BETWEEN cuts impossible by construction rather than by
arithmetic — rows are ROW units apart. Only the three labels within one
row can collide, and packRow settles those.

Depth moved into the row for a better reason than the collision that
prompted it: it runs perpendicular to this view, so centring it on its
band was never spatially meaningful. The near/far encoding it carried
above-versus-below the outline moves to a dashed leader line.

Labels adopt --font-num, the stack every other number in the app already
uses, with font-size set on the <svg> from LABEL_SIZE so the constant the
arithmetic uses is the constant the browser renders."
```

---

### Task 4: The seven sweep geometries, as unit tests

**Files:**
- Test: `src/panels/PartDiagram.test.tsx` (append a new `describe` block)

**Interfaces:**
- Consumes: `labelWidth` from `./diagramLabels`; `buildDiagrams`, `createBoard` from `../document/document`.
- Produces: nothing consumed by later tasks.

This is the task that puts the defect class inside the suite's reach for the first time. Because label width is arithmetic, the predicate the browser harness computes from `getBBox()` becomes computable in jsdom.

**The boundary, which must go in the file as a comment:** this tests the *model* of text width, not the browser's rendering of it. If `LABEL_EM` is wrong, every test here passes and the browser still overlaps. It closes the hole for layout logic and not for font metrics — Task 5 is not optional.

- [ ] **Step 1: Write the failing tests**

Append to `src/panels/PartDiagram.test.tsx`, after the existing `describe('PartDiagram')` block:

```tsx
/**
 * The seven geometries from follow-up 59's measured browser sweep, as unit
 * tests. Three of them (2, 3 and 6) FAILED in the browser before this round.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT. Label width is now arithmetic
 * (`labelWidth`), so the overlap predicate `docs/diagram-overlap-sweep.js`
 * computes from real `getBBox()` values is computable here from the `x`/`y`
 * ATTRIBUTES, which jsdom does report. That closes the hole for LAYOUT LOGIC.
 * It does NOT close it for FONT METRICS: if LABEL_EM is too small, or a machine
 * resolves --font-num to a wider face, every test below passes and the browser
 * still overlaps. The browser sweep remains the arbiter.
 */
describe('PartDiagram label collisions — the seven sweep geometries', () => {
  interface Box { text: string; left: number; right: number; top: number; bottom: number }

  const boxes = (container: HTMLElement): Box[] =>
    [...container.querySelectorAll('text')].map((t) => {
      const text = t.textContent ?? '';
      const w = labelWidth(text);
      const x = Number(t.getAttribute('x'));
      const y = Number(t.getAttribute('y'));
      // `x` is the CENTRE under text-anchor: middle and the LEFT EDGE otherwise.
      // Reading it as a left edge regardless would make every assertion below
      // wrong in exactly the direction that hides a collision.
      const left = t.getAttribute('text-anchor') === 'middle' ? x - w / 2 : x;
      // At font-size 20 the glyph box rises ~15 above the baseline and drops ~5
      // below it; a dominant-baseline: middle label straddles `y` instead.
      const mid = t.getAttribute('dominant-baseline') === 'middle';
      return {
        text,
        left,
        right: left + w,
        top: mid ? y - 10 : y - 15,
        bottom: mid ? y + 10 : y + 5,
      };
    });

  const overlaps = (a: Box, b: Box) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  const check = (container: HTMLElement) => {
    const svg = container.querySelector('svg')!;
    const [, , vbW, vbH] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    const bs = boxes(container);
    expect(bs.length).toBeGreaterThan(0);
    for (let i = 0; i < bs.length; i += 1) {
      for (let j = i + 1; j < bs.length; j += 1) {
        expect(
          overlaps(bs[i], bs[j]),
          `"${bs[i].text}" overlaps "${bs[j].text}"`,
        ).toBe(false);
      }
      expect(bs[i].left, `"${bs[i].text}" reaches left of the viewBox`).toBeGreaterThanOrEqual(0);
      expect(bs[i].right, `"${bs[i].text}" reaches right of the viewBox`).toBeLessThanOrEqual(vbW);
      expect(bs[i].top, `"${bs[i].text}" reaches above the viewBox`).toBeGreaterThanOrEqual(0);
      expect(bs[i].bottom, `"${bs[i].text}" reaches below the viewBox`).toBeLessThanOrEqual(vbH);
    }
  };

  const draw = (board: Parameters<typeof createBoard>[0]) => {
    const { container } = render(
      <PartDiagram view={buildDiagrams(createBoard(board), 16)[0]} />,
    );
    return container;
  };

  it('1 baseline — one dado on a 24" x 5-1/2" board (the calibration control)', () => {
    check(draw({ cuts: [dado()] }));
  });

  it('2 two-close — two dados 3/4" apart on a 24" square panel (was FAIL)', () => {
    check(draw({ width: 24, cuts: [dado({ offset: 6 }), dado({ id: 'c2', offset: 7.5 })] }));
  });

  it('3 offset-zero — a cut at offset 0 (was FAIL)', () => {
    check(draw({ cuts: [dado({ offset: 0, width: 0.125 })] }));
  });

  it('4 flush-max — a rabbet flush at the max end', () => {
    check(draw({ cuts: [dado({ offset: 23.25, width: 0.75 })] }));
  });

  it('5 min-width — an edge groove, drawnH floored (was a 0.7-unit near-miss)', () => {
    // face: 'width', across: 'length' gives along: 'thickness' — h = 0.75,
    // v = 24, which is fitView's MIN_WIDTH branch.
    check(draw({ cuts: [dado({ face: 'width', across: 'length', offset: 0.25, width: 0.25 })] }));
  });

  it('6 narrow-drawn — a 24" x 100-15/16" panel, the acceptance case (was FAIL)', () => {
    check(draw({ length: 24, width: 100.9375, cuts: [dado()] }));
  });

  it('7 many-cuts — five spread dados', () => {
    check(draw({
      cuts: [0, 4, 8, 12, 16].map((offset, i) => dado({ id: `c${i}`, offset })),
    }));
  });

  it('survives a board cut from both sides in the same view', () => {
    check(draw({ cuts: [dado(), dado({ id: 'c2', offset: 12, from: 'max' })] }));
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/panels/PartDiagram.test.tsx`
Expected: PASS, all eight. If any fails, the message names the two colliding strings — fix `GAP_X`, `ROW` or the ideal centres in `PartDiagram.tsx`, **not** the assertion. If a case fails on the viewBox bound rather than on overlap, the fix is in `packRow`'s bounds or the `vx` clamp, again not the assertion.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/panels/PartDiagram.test.tsx
git commit -m "test: pin the seven sweep geometries as unit tests

Three of these (two dados 3/4in apart, a cut at offset 0, and a board
drawn narrow by the shrink branch) failed in a real browser before this
round, and were invisible to the suite because getBBox returns zeros
under jsdom. Label width being arithmetic is what makes the same
predicate computable from the x/y attributes instead.

The boundary is written into the file: this tests the MODEL of text
width, not the browser's rendering of it. If LABEL_EM is wrong these all
pass and the browser still overlaps, so the browser sweep is still the
arbiter."
```

---

### Task 5: Browser verification — re-derive `TOL`, run the sweep

**Files:**
- Modify: `docs/diagram-overlap-sweep.js` (the `TOL` constant and its comment)

**Interfaces:**
- Consumes: the built app, running on a dev server.
- Produces: a recorded pass/fail per geometry, used by Task 7's follow-up write-up.

**This task cannot be done without a real browser, and Playwright is the only tooling that works on this host** (follow-up 26a — software GL here also lies about undefined shader behaviour, though that does not bear on SVG text).

- [ ] **Step 1: Start the dev server**

```bash
npm run dev -- --port 5199
```

- [ ] **Step 2: Seed the seven geometries and open the cut list**

Seed by writing a document straight to `localStorage` under `sloyd.autosave.v1` and reloading — faster and more repeatable than building parts through the UI. The document needs `version: 4`, `name`, `units: { display: 'imperial-fractional', precision: 16 }`, and a `boards` array whose entries match the seven geometries in Task 4 (same dimensions, same cuts, one board each, each with a distinct `name`). Every board needs `id`, `name`, `position`, `rotation: 0`, `posture: 'flat'`, `grain: 'length'`, `material`, and `cuts`.

Then open the cut list from the toolbar and set the Diagrams toggle to **All parts**.

- [ ] **Step 3: Re-derive `TOL` from the baseline geometry alone**

**Order matters here and inverting it defeats the calibration.** `TOL = 1` existed solely because every near-side depth label overhung the viewBox top by 0.6 units of ascent padding — and no text is drawn above the outline any more, so that overhang is gone.

With only the `1 baseline` board on screen, evaluate the sweep's own measurement loop and read the *actual* worst overhang past each viewBox edge. Set `TOL` from that number (round up to the next tenth). Do **not** pick a lower value first and then check the seven cases against the guess — the control exists to produce the tolerance, not to be checked against one chosen in advance.

Update the `TOL` comment in `docs/diagram-overlap-sweep.js` to say what the new number was derived from and on what date, replacing the ascent-padding explanation, which no longer applies.

- [ ] **Step 4: Run the sweep on all seven**

Paste `sweepDiagrams` and evaluate it. Expected: `issues` empty for every entry.

If anything fails, **stop and report it rather than adjusting `TOL` upward.** A tolerance widened to make a failure disappear is the one change that makes this harness worthless.

- [ ] **Step 5: Check print, since print is the point**

Print to PDF with **Background graphics off** and confirm: the hatch still fills near bands (it is a `<pattern>`, i.e. foreground, and must survive), the far leader rows still read as dashed, no row splits across a page break (`break-inside: avoid` on `.cutlist-row` and `.cutlist-diagram`), and the labels are set in the monospace face.

- [ ] **Step 6: Commit**

```bash
git add docs/diagram-overlap-sweep.js
git commit -m "docs: re-derive the sweep's TOL after the layout change

TOL = 1 existed only because near-side depth labels overhung the viewBox
top by 0.6 units of ascent padding. No text is drawn above the outline
any more, so the tolerance had to come from a fresh baseline run rather
than from lowering the old number by eye."
```

---

### Task 6: The constants retune

**Files:**
- Modify: `src/panels/diagramScale.ts:11-24` (only if the browser pass calls for it)
- Modify: `src/panels/diagramScale.test.ts` (only if a constant changes)

**Interfaces:**
- Consumes: the running app from Task 5.
- Produces: either changed constants plus updated tests, or a recorded decision to change nothing.

**Sequenced after the layout deliberately**, because the layout changes what the constants are *for*. `MIN_FEATURE` no longer has to leave room for a label — only to keep a band visible — and `MIN_WIDTH` no longer trades off against label crowding. Both can now be judged on appearance alone.

**The spec already rules out the tempting move:** no achievable `MIN_WIDTH` fixes case 6. At `drawnH = 125`, `sx = 5.2` units/inch; raising `MIN_WIDTH` to 300 takes a ¾" cut's run from 3.9 units to 9.4, against a 48-unit label. Do not reopen that.

- [ ] **Step 1: Look at the three extremes in the browser**

With the seeded document still open: the 96" × 3½" rail (`MAX_ASPECT`), the 24" square panel (`MAX_HEIGHT`), and the 24" × 100-15/16" panel (`MIN_WIDTH`). Judge three things per figure — is the band visible, does the outline read as a board of roughly the right proportion, and does the leader stack sit comfortably under it.

- [ ] **Step 2: Decide, and write the decision down either way**

If a constant changes, change it in `src/panels/diagramScale.ts`, update whichever `diagramScale.test.ts` expectations name it, re-run `npm test` and `npm run build`, and **re-run Task 5's sweep** — a changed constant changes every geometry.

**If nothing wants changing, the correct outcome is to change nothing and say so.** Record it in the follow-ups (Task 7) as a judgement with its evidence, the way follow-up 60 was written. Do not change a constant to have something to show.

- [ ] **Step 3: Commit (only if something changed)**

```bash
git add src/panels/diagramScale.ts src/panels/diagramScale.test.ts
git commit -m "fix: retune <constant> after the label layout round"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/follow-ups.md` (the "From the cut list diagrams" section)
- Modify: `CLAUDE.md` (the Status section's "What is next" paragraph, the "Where things live" tree, and the invariants list)

**Interfaces:**
- Consumes: the recorded outcomes of Tasks 5 and 6.
- Produces: nothing.

- [ ] **Step 1: Update `docs/follow-ups.md`**

- **59 — closed.** Say what closed it and, importantly, *which part closed by construction versus by arithmetic*: cross-cut collisions died with the one-row-per-cut layout, and only the within-row cases needed `packRow`. Record that the three folded-in instances (two-close, offset-zero, band bleeding past the outline) are all closed, and that the fix addressed the diagnosis rather than spec §5's named symptom.
- **60 — amended.** Record Task 6's outcome, including "nothing changed" if that is what happened, with the three geometries looked at.
- **62 — closed.** An ordering guard in `band()`; note it was closed opportunistically because the round was already editing that function.
- **63 — amended.** `DiagramCut.v` and `.kind` are still unused, but `.cutlist-diagram-depth` is gone; check whether the entry's wording still describes the code.
- **65 — amended.** The new `TOL` and what it was derived from. Keep the "calibrate before you conclude" instruction; only the number and its reason change.
- **A new entry for `LABEL_EM` as a bounded risk.** It is an upper bound taken from one machine's monospace resolution. A wider face degrades gracefully — labels crowd, they do not pile up — and the sweep is what would catch it. Record it rather than pretending the bound is universal.

- [ ] **Step 2: Update `CLAUDE.md`**

- Replace the **"What is next: a diagram refinement round"** paragraph with a "What the label layout round did" paragraph, in the same voice as the neighbouring ones. It should carry: the `--font-num` measurement and why it mattered (arithmetic, not measurement — jsdom returns 0 for `getComputedTextLength`); one-row-per-cut as a *by construction* fix; why depth moved (perpendicular to the view, not merely colliding); and the honest boundary that the unit tests cover layout logic and not font metrics.
- Add `diagramLabels.ts` to the **Where things live** tree, beside `diagramScale.ts`.
- Add an **invariant** for the single-home rule: `LABEL_SIZE` lives in `diagramLabels.ts` and is applied to the `<svg>`; `styles.css` must not carry a `font-size` for diagram text, because the constant the arithmetic uses has to be the constant the browser renders. Note that the labels use `--font-num` for a load-bearing reason, not a cosmetic one — a proportional face breaks `labelWidth`.
- Update the test count in the Status section and the Commands section (`npm test # Vitest, currently N tests`) to the real number.

- [ ] **Step 3: Verify the test count claim before writing it**

Run: `npm test`
Read the actual total off the output. Do not write a number you have not read.

- [ ] **Step 4: Commit**

```bash
git add docs/follow-ups.md CLAUDE.md
git commit -m "docs: close follow-up 59 and record the label layout round"
```

---

## Self-review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §2 — `--font-num`, computable width | 1 (constants + `labelWidth`), 3 (CSS) |
| §3 goal 1 — no two texts overlap | 3 (layout), 1 (`packRow`), 4 (tests) |
| §3 goal 2 — nothing outside the viewBox | 3 (`packRow` bounds, `vx` clamp), 4 (tests) |
| §3 goal 3 — numbers stay attached to geometry | 3 (ideal centres from band geometry) |
| §3 goal 4 — pure and unit-testable | 1 |
| §4 — depth into the row, `TOP`/`FAR`, dashed far leader | 3 |
| §4 — `band()` clamped to the outline | 2 |
| §5 — `diagramLabels.ts` API | 1 |
| §5.1 — `LABEL_SIZE` has one home | 3 (svg attribute + CSS), 7 (invariant) |
| §5.2 — vertical constants | 3 |
| §6 layer 1 — packer tests | 1 |
| §6 layer 2 — seven geometries in jsdom | 4 |
| §6 layer 3 — browser sweep, `TOL` re-derived | 5 |
| §7 — constants retune | 6 |
| §8 — order of work | task order |
| §9 — `LABEL_EM` risk recorded | 7 |
| Follow-up 62 closed | 2 |

**Type consistency:** `labelWidth`, `packRow`, `LabelBox`, `CHAR_W`, `LABEL_SIZE`, `LABEL_EM` are named identically in Tasks 1, 3 and 4. `.cutlist-diagram-overall` replaces `.cutlist-diagram-depth` consistently in Tasks 3 (component + CSS) and 4. `packRow` returns centres, and every call site treats it as centres.

**One deliberate ordering note:** Task 3 changes `styles.css` and `PartDiagram.tsx` together rather than splitting them, because the font-family and the `font-size` removal are what make Task 4's arithmetic true. Splitting them would leave a commit where the tests assert monospace widths against a proportional face.
