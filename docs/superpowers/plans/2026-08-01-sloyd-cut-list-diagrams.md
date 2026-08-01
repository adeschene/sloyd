# Sloyd Cut List Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Draw each part's joinery on the cut list, so a dado is a picture instead of a sentence you decode while holding a router.

**Architecture:** Three new modules, each with one job. `src/document/diagram.ts` is a pure leaf emitting **board inches** — one view per `(face, across)` pair, cuts as bands. `src/panels/diagramScale.ts` is a pure module owning the inches→drawing-units clamps (precedent: `viewport/gizmoScale.ts`). `src/panels/PartDiagram.tsx` renders SVG and formats nothing. `buildCutList` gains one field; nothing else about it changes.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest + Testing Library (jsdom). No new dependencies.

Spec: `docs/superpowers/specs/2026-08-01-sloyd-cut-list-diagrams-design.md`. Read it before starting — this plan implements it and does not restate its reasoning.

## Global Constraints

- **`npm test` does not typecheck.** Run `npm run build` before claiming anything compiles. Both must be green before every commit.
- **`src/document/diagram.ts` must never import `./document`.** `document.ts` re-exports it; importing back is a cycle. Import `./types`, `./geometry`, `./cuts`, and `../units/length` only. (`cuts.ts` and `cutlist.ts` are both precedent.)
- **No schema change. `CURRENT_VERSION` stays 4.** No new field on `Board`, `Cut`, or `SloydDocument`. If a task seems to need one, stop and escalate — it means derived state is leaking into the document.
- **Stored values are exact; display rounds.** Every number that reaches the user goes through `formatLength(n, doc.units.precision)`. Note the field is flat — `doc.units.precision`, not `doc.units.display.precision`; `display` is the sibling format name. `PartDiagram.tsx` calls `formatLength` zero times.
- **Part-local vocabulary only.** `length`/`width`/`thickness`, never world axes, in every user-visible string.
- **Every new CSS class is enumerated in the `@media print` block explicitly.** Do not rely on `currentColor` inheritance or the cascade. Follow-up 58 shipped a grey-on-white `.cutlist-empty` for exactly this reason.
- **Pure modules must be total.** `cutRegion` is deliberately total for a `face === across` cut even though the validator drops such cuts on load; new code follows that, and never leans on validation having run.
- **This plan's code is not more trustworthy than hand-written code.** Seven of joinery's defects were in code its plan supplied verbatim. If a test fails, **fix the code, not the expectation.** If you conclude an *expectation itself* is wrong, **stop and escalate** rather than editing it.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/document/diagram.ts` | **Create.** `buildDiagrams` and its types. Views, bands, labels — all in board inches. Pure. |
| `src/document/diagram.test.ts` | **Create.** The geometry and labelling suite. |
| `src/document/cutlist.ts` | **Modify.** One field on `CutListRow`, one call. |
| `src/document/cutlist.test.ts` | **Modify.** The picture-agrees-with-the-prose test. |
| `src/document/document.ts` | **Modify.** Re-exports, near line 13. |
| `src/panels/diagramScale.ts` | **Create.** `fitView`, `band`, and the four constants. Pure. |
| `src/panels/diagramScale.test.ts` | **Create.** The clamp ladder. |
| `src/panels/PartDiagram.tsx` | **Create.** The SVG renderer. Formats nothing. |
| `src/panels/PartDiagram.test.tsx` | **Create.** Light jsdom render assertions. |
| `src/panels/CutList.tsx` | **Modify.** The three-state toggle and the render condition. |
| `src/panels/CutList.test.tsx` | **Modify.** Toggle states and the default. |
| `src/styles.css` | **Modify.** Diagram styles, then the `@media print` additions. |
| `CLAUDE.md`, `docs/follow-ups.md` | **Modify.** Final task. |

---

## Task 1: `buildDiagrams` — views, bands and labels

**Files:**
- Create: `src/document/diagram.ts`
- Create: `src/document/diagram.test.ts`
- Modify: `src/document/document.ts` (re-exports, near line 13)

**Interfaces:**
- Consumes: `Board`, `Cut`, `CutFrom`, `Dimension`, `Span` from `./types`; `DIMENSION_ORDER`, `positionAxisOf` from `./geometry`; `cutLabel`, `cutRegion` from `./cuts`; `formatLength` from `../units/length`.
- Produces: `buildDiagrams(board: Board, precision: number): DiagramView[]`, and the exported types `DiagramView` and `DiagramCut` with exactly the fields below. Task 2 attaches the result to `CutListRow`; Tasks 3–4 read these fields by name.

- [ ] **Step 1: Write the failing test**

Create `src/document/diagram.test.ts`:

```ts
import { buildDiagrams, createBoard } from './document';
import type { Board, Cut } from './document';

/** The canonical cut from the joinery work: 3/4" wide, 3/8" deep, 6" along. */
const dado = (over: Partial<Cut> = {}): Cut => ({
  id: 'c1', face: 'thickness', from: 'min', across: 'width',
  offset: 6, width: 0.75, depth: 0.375, ...over,
});

/** A default board is 24" x 5-1/2" x 3/4". */
const board = (...cuts: Cut[]): Board => createBoard({ cuts });

describe('buildDiagrams', () => {
  it('gives a cut-free board one broad-face view with no cuts', () => {
    const views = buildDiagrams(board(), 16);
    expect(views).toHaveLength(1);
    expect(views[0].face).toBe('thickness');
    expect(views[0].across).toBe('width');
    expect(views[0].along).toBe('length');
    expect(views[0].cuts).toEqual([]);
    expect(views[0].hasFar).toBe(false);
  });

  it('puts the position axis on the horizontal and `across` on the vertical', () => {
    const views = buildDiagrams(board(dado()), 16);
    expect(views).toHaveLength(1);
    expect(views[0].along).toBe('length');
    expect(views[0].h).toBe(24);
    expect(views[0].v).toBe(5.5);
  });

  it('always sets `along` to positionAxisOf(face, across)', () => {
    const views = buildDiagrams(board(
      dado(),
      dado({ id: 'c2', face: 'width', across: 'length', offset: 0.1, width: 0.2 }),
      dado({ id: 'c3', face: 'length', across: 'thickness', offset: 1, width: 0.5 }),
    ), 16);
    expect(views.map((v) => [v.face, v.across, v.along])).toEqual([
      ['length', 'thickness', 'width'],
      ['width', 'length', 'thickness'],
      ['thickness', 'width', 'length'],
    ]);
  });

  it('draws a cut as a band spanning the full height', () => {
    const views = buildDiagrams(board(dado()), 16);
    expect(views[0].cuts[0].h).toEqual([6, 6.75]);
    expect(views[0].cuts[0].v).toEqual([0, 5.5]);
  });

  it('splits one face into two views when `across` differs', () => {
    // Both cuts go into the thickness face, but their position axes differ —
    // this is the case the (face, across) key exists for. Spec section 2.
    const views = buildDiagrams(board(
      dado(),
      dado({ id: 'c2', across: 'length', offset: 1, width: 0.75 }),
    ), 16);
    expect(views).toHaveLength(2);
    expect(views.map((v) => v.along)).toEqual(['width', 'length']);
  });

  it('keeps both sides of one face in a single view', () => {
    const views = buildDiagrams(board(dado(), dado({ id: 'c2', from: 'max' })), 16);
    expect(views).toHaveLength(1);
    expect(views[0].cuts.map((c) => c.side)).toEqual(['min', 'max']);
    expect(views[0].hasFar).toBe(true);
  });

  it('does not move a band when the cut enters from the far side', () => {
    // `from` moves the cut along the FACE axis, which no view shows. If this
    // fails, the region span is being read out by the wrong key.
    const near = buildDiagrams(board(dado()), 16)[0].cuts[0];
    const far = buildDiagrams(board(dado({ from: 'max' })), 16)[0].cuts[0];
    expect(far.h).toEqual(near.h);
    expect(far.v).toEqual(near.v);
  });

  it('orders views by DIMENSION_ORDER on face, then across', () => {
    const views = buildDiagrams(board(
      dado({ id: 'c3', face: 'length', across: 'thickness', offset: 1, width: 0.5 }),
      dado(),
      dado({ id: 'c2', face: 'width', across: 'length', offset: 0.1, width: 0.2 }),
    ), 16);
    expect(views.map((v) => v.face)).toEqual(['length', 'width', 'thickness']);
  });

  it('orders cuts within a view by their position along the horizontal', () => {
    const views = buildDiagrams(board(
      dado({ id: 'late', offset: 18 }),
      dado({ id: 'early', offset: 2 }),
    ), 16);
    expect(views[0].cuts.map((c) => c.id)).toEqual(['early', 'late']);
  });

  it('heads a view with its face and direction', () => {
    expect(buildDiagrams(board(dado()), 16)[0].heading)
      .toBe('Thickness face — across the width');
  });

  it('formats every label at the given precision', () => {
    const [view] = buildDiagrams(board(dado()), 16);
    expect(view.hLabel).toBe('24"');
    expect(view.vLabel).toBe('5-1/2"');
    expect(view.cuts[0].offsetLabel).toBe('6"');
    expect(view.cuts[0].widthLabel).toBe('3/4"');
    expect(view.cuts[0].depthLabel).toBe('3/8" deep');
  });

  it('follows the document precision rather than assuming 1/16', () => {
    // 3/8 is unrepresentable at 1/4, so it rounds — proving precision is used.
    const [view] = buildDiagrams(board(dado()), 4);
    expect(view.cuts[0].depthLabel).toBe('1/2" deep');
  });

  it('carries the cut kind from cutLabel', () => {
    const flush = dado({ offset: 23.25 });   // reaches the far end: a rabbet
    expect(buildDiagrams(board(dado()), 16)[0].cuts[0].kind).toBe('dado');
    expect(buildDiagrams(board(flush), 16)[0].cuts[0].kind).toBe('rabbet');
  });

  it('keeps each cut its own id, so two identical cuts stay distinct', () => {
    // cutSignature and setupLine both exclude `id`, so identical cuts collapse
    // there. Here the Cut objects are in hand and the real id costs nothing.
    const views = buildDiagrams(board(dado(), dado({ id: 'c2' })), 16);
    expect(views[0].cuts.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('skips a degenerate cut naming one dimension twice', () => {
    // validateCuts drops these on load, but a Board built in code can hold one
    // and this function must not depend on validation having run.
    const views = buildDiagrams(board(dado({ across: 'thickness' })), 16);
    expect(views).toHaveLength(1);
    expect(views[0].face).toBe('thickness');
    expect(views[0].cuts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- diagram`
Expected: FAIL — `buildDiagrams` is not exported from `./document`.

- [ ] **Step 3: Write the implementation**

Create `src/document/diagram.ts`:

```ts
import type { Board, CutFrom, Dimension, Span } from './types';
import { DIMENSION_ORDER, positionAxisOf } from './geometry';
import { cutLabel, cutRegion } from './cuts';
import { formatLength } from '../units/length';

/**
 * One cut as it appears in a view, in BOARD INCHES.
 *
 * No pixels, no drawing units — those belong to `panels/diagramScale.ts`.
 * Keeping them out is what lets this module be tested against measurements
 * rather than against a rendering.
 */
export interface DiagramCut {
  /** `Cut.id` verbatim. Stable within the view; the React key. */
  id: string;
  /** [min, max] along the view's horizontal (position) axis. */
  h: Span;
  /** [min, max] along the view's vertical (`across`) axis — the full height. */
  v: Span;
  /** 'min' draws near: solid, hatched. 'max' draws far: dashed. */
  side: CutFrom;
  /** e.g. `3/8" deep`, already formatted. */
  depthLabel: string;
  /** e.g. `6"` — the offset from the horizontal axis's min end. */
  offsetLabel: string;
  /** e.g. `3/4"` — the cut's own extent along the horizontal axis. */
  widthLabel: string;
  /** From `cutLabel`. Representative, not consensus — see spec section 8. */
  kind: 'dado' | 'rabbet';
}

export interface DiagramView {
  /** `face|across`. Stable across renders; the React key. */
  key: string;
  /** e.g. `Thickness face — across the width` */
  heading: string;
  face: Dimension;
  across: Dimension;
  /** The horizontal axis: `positionAxisOf(face, across)`. */
  along: Dimension;
  /** Board inches. The outline is [0, h] x [0, v]. */
  h: number;
  v: number;
  hLabel: string;
  vLabel: string;
  /** In `h[0]` order. Empty for a cut-free board. */
  cuts: DiagramCut[];
  /** True when any cut has `side: 'max'`; the renderer shows a legend only then. */
  hasFar: boolean;
}

const capitalise = (d: Dimension): string => d[0].toUpperCase() + d.slice(1);

/**
 * A board's setups, drawn.
 *
 * ONE VIEW PER `(face, across)` PAIR, not per face. A cut spans `across` fully
 * and sits at [offset, offset + width] along the implied position axis, so
 * within a view it is always a band touching two opposite edges — the visual
 * signature of a through-cut. But one face admits two `across` values, and
 * those two cuts have DIFFERENT position axes, so they cannot both be bands
 * along the same screen axis. Keying on the pair means the horizontal is
 * always the position axis, every band is vertical, every leader is a
 * horizontal run beneath the board, and there is one layout in the whole
 * feature. `from` does NOT split a view: near and far share one drawing, which
 * is what makes a board dadoed on both faces legible at a glance.
 *
 * The geometry is entirely `cutRegion`'s. It is already the only place `from`
 * is consumed and it already returns the removed box keyed by dimension, so a
 * band is two of its three spans read out by name. No projection, no
 * `boardEdges`, no hidden-line computation.
 */
export function buildDiagrams(board: Board, precision: number): DiagramView[] {
  const f = (n: number) => formatLength(n, precision);
  const views = new Map<string, DiagramView>();

  const ensure = (face: Dimension, across: Dimension): DiagramView => {
    const key = `${face}|${across}`;
    let view = views.get(key);
    if (!view) {
      const along = positionAxisOf(face, across);
      view = {
        key,
        heading: `${capitalise(face)} face — across the ${across}`,
        face,
        across,
        along,
        h: board[along],
        v: board[across],
        hLabel: f(board[along]),
        vLabel: f(board[across]),
        cuts: [],
        hasFar: false,
      };
      views.set(key, view);
    }
    return view;
  };

  for (const cut of board.cuts) {
    // A cut naming one dimension twice has no position axis to draw against.
    // `validateCuts` drops it on load and `cutRegion` returns a zero region for
    // it, but a Board built in code can still reach here — the same totality
    // reasoning `cutRegion`'s own doc comment gives. Skip it; do not draw a
    // view for it, and do not let it invent one.
    if (cut.face === cut.across) continue;

    const view = ensure(cut.face, cut.across);
    const region = cutRegion(board, cut);
    view.cuts.push({
      id: cut.id,
      h: region[view.along],
      v: region[view.across],
      side: cut.from,
      depthLabel: `${f(cut.depth)} deep`,
      offsetLabel: f(cut.offset),
      widthLabel: f(cut.width),
      kind: cutLabel(board, cut),
    });
    if (cut.from === 'max') view.hasFar = true;
  }

  // A cut-free board still gets a drawing, for the "all parts" setting: broad
  // face on, length running horizontally — the view a woodworker draws by hand.
  if (views.size === 0) ensure('thickness', 'width');

  const out = [...views.values()];
  // `id` as the final tiebreak so the order is total, the same reason
  // `mergeAlong` and `buildCutList`'s row sort both carry one.
  for (const view of out) {
    view.cuts.sort((a, b) => a.h[0] - b.h[0] || a.id.localeCompare(b.id));
  }
  out.sort(
    (a, b) =>
      DIMENSION_ORDER.indexOf(a.face) - DIMENSION_ORDER.indexOf(b.face) ||
      DIMENSION_ORDER.indexOf(a.across) - DIMENSION_ORDER.indexOf(b.across),
  );
  return out;
}
```

- [ ] **Step 4: Add the re-exports**

In `src/document/document.ts`, immediately after the existing `cutlist` re-export lines (near line 13-14), add:

```ts
export { buildDiagrams } from './diagram';
export type { DiagramCut, DiagramView } from './diagram';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- diagram`
Expected: PASS, all 15 tests.

If the `positionAxisOf` test fails, do not adjust the expectation — re-read
`positionAxisOf`: it returns the dimension that is neither `face` nor `across`.

- [ ] **Step 6: Run the full suite and the typecheck**

Run: `npm test` then `npm run build`
Expected: both green. `npm test` alone proves nothing about `tsc`.

- [ ] **Step 7: Commit**

```bash
git add src/document/diagram.ts src/document/diagram.test.ts src/document/document.ts
git commit -m "feat: derive a part diagram from a board's cuts"
```

---

## Task 2: Attach diagrams to the cut list, and pin the picture to the prose

**Files:**
- Modify: `src/document/cutlist.ts`
- Modify: `src/document/cutlist.test.ts`

**Interfaces:**
- Consumes: `buildDiagrams`, `DiagramView` from `./diagram` (Task 1).
- Produces: `CutListRow.diagrams: DiagramView[]`, always populated. Task 5 reads it.

- [ ] **Step 1: Write the failing tests**

Append to the `describe('buildCutList', ...)` block in `src/document/cutlist.test.ts`:

```ts
  it('carries a diagram on every row, including cut-free ones', () => {
    const list = buildCutList(docWith({}));
    expect(list.groups[0].rows[0].diagrams).toHaveLength(1);
    expect(list.groups[0].rows[0].diagrams[0].cuts).toEqual([]);
  });

  it('draws the row representative\'s cuts', () => {
    const cut: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'width',
                       offset: 6, width: 0.75, depth: 0.375 };
    const [row] = buildCutList(docWith({ cuts: [cut] })).groups[0].rows;
    expect(row.diagrams[0].cuts[0].h).toEqual([6, 6.75]);
  });

  it('agrees with the setup line it is printed beside', () => {
    // The picture and the prose are two renderings of one Cut, and nothing
    // else would catch them drifting: a change to setupLine's formatting that
    // skipped buildDiagrams would leave a sheet contradicting itself in print.
    // Assert on the STRINGS, not the numbers.
    const cut: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'width',
                       offset: 6, width: 0.75, depth: 0.375 };
    const [row] = buildCutList(docWith({ cuts: [cut] })).groups[0].rows;
    const line = row.setup[0];
    const drawn = row.diagrams[0].cuts[0];

    expect(line.startsWith(`${drawn.widthLabel} ${drawn.kind},`)).toBe(true);
    expect(line).toContain(`${drawn.depthLabel} —`);
    expect(line).toContain(`${drawn.offsetLabel} from the`);
  });

  it('keeps that agreement at a different precision', () => {
    const cut: Cut = { id: 'c1', face: 'thickness', from: 'min', across: 'width',
                       offset: 6.03, width: 0.75, depth: 0.375 };
    const doc = docWith({ cuts: [cut] });
    doc.units = { display: 'imperial-fractional', precision: 32 };
    const [row] = buildCutList(doc).groups[0].rows;
    expect(row.setup[0]).toContain(`${row.diagrams[0].cuts[0].offsetLabel} from the`);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- cutlist`
Expected: FAIL — `diagrams` does not exist on `CutListRow`.

- [ ] **Step 3: Add the field**

In `src/document/cutlist.ts`, add the import beside the existing ones:

```ts
import { buildDiagrams } from './diagram';
import type { DiagramView } from './diagram';
```

Add to the `CutListRow` interface, after `setup`:

```ts
  /**
   * The same cuts, drawn. Always populated — a cut-free row carries its one
   * broad-face view, because the sheet's "all parts" setting renders it.
   *
   * Making this conditional would push a VIEW decision down into the
   * derivation and give the panel two shapes to handle, for no saving: the
   * work is a handful of rectangles per board.
   *
   * Representative, exactly as `setup` is: these are the first board's cuts.
   * Every number is right for every part in the row (`cutSignature` is exact);
   * only `kind` carries follow-up 55a's caveat, identically to the printed
   * word.
   */
  diagrams: DiagramView[];
```

And in `buildCutList`, add to the row literal immediately after `setup`:

```ts
        diagrams: buildDiagrams(board, precision),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- cutlist`
Expected: PASS.

- [ ] **Step 5: Run the full suite and the typecheck**

Run: `npm test` then `npm run build`
Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add src/document/cutlist.ts src/document/cutlist.test.ts
git commit -m "feat: hang a diagram on every cut list row"
```

---

## Task 3: `diagramScale` — inches to drawing units

**Files:**
- Create: `src/panels/diagramScale.ts`
- Create: `src/panels/diagramScale.test.ts`

**Interfaces:**
- Consumes: `Span` from `../document/document`.
- Produces: `DRAW_WIDTH`, `MAX_ASPECT`, `MAX_HEIGHT`, `MIN_FEATURE`, `fitView(h: number, v: number): DiagramFit`, `band(span: Span, fit: DiagramFit): { x: number; width: number }`, and the `DiagramFit` type. Task 4 consumes all of them.

This module lives in `panels/` rather than `document/` because it encodes a
*presentation* decision. The precedent is established: `viewport/gridDensity.ts`,
`screenScale.ts` and `gizmoScale.ts` are all pure, unit-tested modules inside a
UI folder — arithmetic that is easy to get wrong, has no React in it, and should
not have to be verified from a screenshot.

- [ ] **Step 1: Write the failing test**

Create `src/panels/diagramScale.test.ts`:

```ts
import { band, fitView, DRAW_WIDTH, MAX_ASPECT, MAX_HEIGHT, MIN_FEATURE } from './diagramScale';

describe('fitView', () => {
  it('scales uniformly when the aspect ratio is comfortable', () => {
    const fit = fitView(24, 5.5);
    expect(fit.sx).toBeCloseTo(fit.sy, 10);
    expect(fit.drawnH).toBe(DRAW_WIDTH);
    expect(fit.offsetX).toBe(0);
  });

  it('clamps a sliver so there is something to draw into', () => {
    // 96" x 3-1/2" is 27:1 — at true scale the board is a hairline.
    const fit = fitView(96, 3.5);
    expect(fit.drawnV).toBe(DRAW_WIDTH / MAX_ASPECT);
    expect(fit.sy).toBeGreaterThan(fit.sx);
    expect(fit.drawnH).toBe(DRAW_WIDTH);
  });

  it('shrinks a tall board uniformly rather than squashing it', () => {
    const fit = fitView(24, 24);
    expect(fit.drawnV).toBe(MAX_HEIGHT);
    expect(fit.sx).toBeCloseTo(fit.sy, 10);
    expect(fit.drawnH).toBeCloseTo(MAX_HEIGHT, 10);
  });

  it('centres a shrunken drawing in the nominal width', () => {
    const fit = fitView(24, 24);
    expect(fit.offsetX).toBeCloseTo((DRAW_WIDTH - fit.drawnH) / 2, 10);
  });

  it('cannot trip both clamps, whatever the input', () => {
    // An invariant of the CONSTANTS, not of the inputs. If you change either
    // constant, re-read the ladder before changing this expectation.
    expect(DRAW_WIDTH / MAX_ASPECT).toBeLessThan(MAX_HEIGHT);
  });

  it('never returns a non-finite scale for a degenerate board', () => {
    for (const fit of [fitView(0, 5), fitView(5, 0), fitView(-1, 5)]) {
      expect(Number.isFinite(fit.sx)).toBe(true);
      expect(Number.isFinite(fit.sy)).toBe(true);
    }
  });
});

describe('band', () => {
  it('places a comfortable band at true scale', () => {
    const fit = fitView(24, 5.5);
    const b = band([6, 6.75], fit);
    expect(b.x).toBeCloseTo(6 * fit.sx, 10);
    expect(b.width).toBeCloseTo(0.75 * fit.sx, 10);
  });

  it('widens a hairline band to the minimum', () => {
    const fit = fitView(96, 3.5);          // sx ~= 10.4 units per inch
    const b = band([84, 84.125], fit);     // 1/8" -> ~1.3 units, too thin
    expect(b.width).toBe(MIN_FEATURE);
  });

  it('widens about the centre, so position stays honest', () => {
    const fit = fitView(96, 3.5);
    const centre = (84 * fit.sx + 84.125 * fit.sx) / 2 + fit.offsetX;
    const b = band([84, 84.125], fit);
    expect(b.x + b.width / 2).toBeCloseTo(centre, 10);
  });

  it('respects the horizontal offset of a centred drawing', () => {
    const fit = fitView(24, 24);
    expect(band([0, 24], fit).x).toBeCloseTo(fit.offsetX, 10);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- diagramScale`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the implementation**

Create `src/panels/diagramScale.ts`:

```ts
import type { Span } from '../document/document';

/**
 * The nominal content width of a diagram, in DRAWING UNITS.
 *
 * The SVG carries a viewBox and fills its grid cell, so these are not CSS
 * pixels — but the unit-to-px ratio is a constant per medium, because every
 * diagram on the sheet renders into the same cell width (and print has its own
 * constant). That is what makes MIN_FEATURE meaningful as a fixed number.
 */
export const DRAW_WIDTH = 1000;
/** A board is never drawn thinner than DRAW_WIDTH / this. */
export const MAX_ASPECT = 8;
/** A drawing never grows taller than this. */
export const MAX_HEIGHT = 420;
/** A cut band is never drawn narrower than this. */
export const MIN_FEATURE = 6;

export interface DiagramFit {
  /** Drawing units per inch, horizontally. */
  sx: number;
  /** Drawing units per inch, vertically. Equal to `sx` except under the sliver clamp. */
  sy: number;
  drawnH: number;
  drawnV: number;
  /** Left inset, non-zero only when a tall drawing was shrunk and centred. */
  offsetX: number;
}

/**
 * Uniform by default; distorted only at the extremes.
 *
 * MAX_ASPECT and MAX_HEIGHT are GUESSES. They live here as named constants
 * precisely so a browser-verification pass can change them without touching
 * anything else. Do not treat the current values as settled.
 */
export function fitView(h: number, v: number): DiagramFit {
  // Total, like `cutRegion`: a degenerate board must not produce Infinity or
  // NaN in an SVG attribute, where it would fail silently rather than loudly.
  if (!(h > 0) || !(v > 0)) {
    return { sx: 0, sy: 0, drawnH: 0, drawnV: 0, offsetX: 0 };
  }

  let drawnH = DRAW_WIDTH;
  let drawnV = v * (DRAW_WIDTH / h);
  let offsetX = 0;

  const floor = DRAW_WIDTH / MAX_ASPECT;
  if (drawnV < floor) {
    // The sliver clamp — the ONLY step that makes the scale non-uniform. A
    // 96" x 3-1/2" rail needs somewhere to put a dado.
    drawnV = floor;
  } else if (drawnV > MAX_HEIGHT) {
    // Shrink BOTH axes: a 24" x 24" panel comes out square and smaller, never
    // squashed. The two branches are mutually exclusive because
    // DRAW_WIDTH / MAX_ASPECT is 125 and MAX_HEIGHT is 420.
    drawnH = DRAW_WIDTH * (MAX_HEIGHT / drawnV);
    drawnV = MAX_HEIGHT;
    offsetX = (DRAW_WIDTH - drawnH) / 2;
  }

  return { sx: drawnH / h, sy: drawnV / v, drawnH, drawnV, offsetX };
}

/**
 * A cut's band along the horizontal axis.
 *
 * Widening is ABOUT THE CENTRE, not from the left edge. Position is the
 * property the drawing preserves — "near the far end" must still read as near
 * the far end — and centre-preserving widening keeps the error symmetric and
 * bounded at MIN_FEATURE / 2. The annotated numbers stay exact regardless; the
 * printed caption says the drawing is schematic.
 */
export function band(span: Span, fit: DiagramFit): { x: number; width: number } {
  const x0 = fit.offsetX + span[0] * fit.sx;
  const x1 = fit.offsetX + span[1] * fit.sx;
  const width = x1 - x0;
  if (width >= MIN_FEATURE) return { x: x0, width };
  return { x: (x0 + x1) / 2 - MIN_FEATURE / 2, width: MIN_FEATURE };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- diagramScale`
Expected: PASS, all 10 tests.

- [ ] **Step 5: Run the full suite and the typecheck**

Run: `npm test` then `npm run build`
Expected: both green.

- [ ] **Step 6: Commit**

```bash
git add src/panels/diagramScale.ts src/panels/diagramScale.test.ts
git commit -m "feat: fit a part diagram to the sheet's column"
```

---

## Task 4: `PartDiagram` — the SVG

**Files:**
- Create: `src/panels/PartDiagram.tsx`
- Create: `src/panels/PartDiagram.test.tsx`
- Modify: `src/styles.css` (screen styles only; print comes in Task 6)

**Interfaces:**
- Consumes: `DiagramView` from `../document/document` (Task 1); `band`, `fitView`, `DRAW_WIDTH` from `./diagramScale` (Task 3).
- Produces: `PartDiagram({ view }: { view: DiagramView })`. Task 5 renders it.

- [ ] **Step 1: Write the failing test**

Create `src/panels/PartDiagram.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { buildDiagrams, createBoard } from '../document/document';
import type { Cut } from '../document/document';
import { PartDiagram } from './PartDiagram';

const dado = (over: Partial<Cut> = {}): Cut => ({
  id: 'c1', face: 'thickness', from: 'min', across: 'width',
  offset: 6, width: 0.75, depth: 0.375, ...over,
});

const view = (...cuts: Cut[]) => buildDiagrams(createBoard({ cuts }), 16)[0];

describe('PartDiagram', () => {
  it('draws the outline and one band per cut', () => {
    const { container } = render(<PartDiagram view={view(dado(), dado({ id: 'c2', offset: 12 }))} />);
    expect(container.querySelectorAll('.cutlist-diagram-outline')).toHaveLength(1);
    expect(container.querySelectorAll('.cutlist-diagram-near')).toHaveLength(2);
  });

  it('marks a far-side cut differently from a near one', () => {
    const { container } = render(<PartDiagram view={view(dado({ from: 'max' }))} />);
    expect(container.querySelectorAll('.cutlist-diagram-far')).toHaveLength(1);
    expect(container.querySelectorAll('.cutlist-diagram-near')).toHaveLength(0);
  });

  it('hatches a near cut and leaves a far one unfilled', () => {
    const { container } = render(<PartDiagram view={view(dado(), dado({ id: 'c2', from: 'max' }))} />);
    expect(container.querySelector('.cutlist-diagram-near')!.getAttribute('fill'))
      .toMatch(/^url\(#/);
    expect(container.querySelector('.cutlist-diagram-far')!.getAttribute('fill'))
      .toBe('none');
  });

  it('shows the legend only when a far cut is present', () => {
    render(<PartDiagram view={view(dado())} />);
    expect(screen.queryByText(/far side/)).not.toBeInTheDocument();
  });

  it('explains the two line styles when both sides are cut', () => {
    render(<PartDiagram view={view(dado(), dado({ id: 'c2', from: 'max' }))} />);
    expect(screen.getByText(/far side/)).toBeInTheDocument();
  });

  it('captions every diagram as schematic', () => {
    render(<PartDiagram view={view(dado())} />);
    expect(screen.getByText(/Schematic — not to scale/)).toBeInTheDocument();
  });

  it('prints the labels it was given and formats nothing itself', () => {
    render(<PartDiagram view={view(dado())} />);
    expect(screen.getByText('3/8" deep')).toBeInTheDocument();
    expect(screen.getByText('6"')).toBeInTheDocument();
    expect(screen.getByText('3/4"')).toBeInTheDocument();
    expect(screen.getByText('24"')).toBeInTheDocument();
    expect(screen.getByText('5-1/2"')).toBeInTheDocument();
  });

  it('names the view for a screen reader', () => {
    render(<PartDiagram view={view(dado())} />);
    expect(screen.getByRole('img', { name: 'Thickness face — across the width' }))
      .toBeInTheDocument();
  });

  it('gives its hatch pattern an id unique to the instance', () => {
    // Two diagrams on one sheet must not share a <pattern> id, or the second
    // silently reuses the first's fill.
    const { container } = render(
      <>
        <PartDiagram view={view(dado())} />
        <PartDiagram view={view(dado())} />
      </>,
    );
    const ids = [...container.querySelectorAll('pattern')].map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- PartDiagram`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the component**

Create `src/panels/PartDiagram.tsx`:

```tsx
import { useId } from 'react';
import type { DiagramView } from '../document/document';
import { band, fitView, DRAW_WIDTH } from './diagramScale';

/** Room above the outline for near-side depth labels. */
const TOP = 26;
/** Room below the outline for far-side depth labels, when there are any. */
const FAR = 22;
/** One stacked leader row per cut. */
const ROW = 22;
/** The overall-length run along the bottom. */
const BOTTOM = 34;
/** Room to the right of the outline for the overall-width label. */
const RIGHT = 90;

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
 * Leaders STACK, one row per cut, rather than being placed inline. That is
 * what avoids a collision solver; it costs vertical space linear in the cut
 * count, which is acceptable because a part with six cuts is a part whose
 * prose was the actual problem.
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
  const far = view.hasFar ? FAR : 0;
  const leaders = bottom + far;
  const height = leaders + ROW * view.cuts.length + BOTTOM;
  const baseline = height - BOTTOM / 2;

  return (
    <figure className="cutlist-diagram">
      <figcaption className="cutlist-diagram-head">{view.heading}</figcaption>

      <svg viewBox={`0 0 ${DRAW_WIDTH + RIGHT} ${height}`} role="img" aria-label={view.heading}>
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
            <g key={cut.id}>
              <rect
                className={near ? 'cutlist-diagram-near' : 'cutlist-diagram-far'}
                x={b.x}
                y={top}
                width={b.width}
                height={fit.drawnV}
                fill={near ? `url(#${hatch})` : 'none'}
              />
              {/* Above for near, below for far: the same distinction the line
                  style makes, encoded a second time and redundantly on
                  purpose. */}
              <text
                className="cutlist-diagram-depth"
                x={b.x + b.width / 2}
                y={near ? top - 8 : bottom + 16}
                textAnchor="middle"
              >
                {cut.depthLabel}
              </text>
            </g>
          );
        })}

        {view.cuts.map((cut, i) => {
          const b = band(cut.h, fit);
          const y = leaders + ROW * i + ROW / 2;
          return (
            <g className="cutlist-diagram-leader" key={cut.id}>
              <line x1={fit.offsetX} y1={y} x2={b.x} y2={y} />
              <text x={(fit.offsetX + b.x) / 2} y={y - 4} textAnchor="middle">
                {cut.offsetLabel}
              </text>
              <line x1={b.x} y1={y} x2={b.x + b.width} y2={y} />
              <text x={b.x + b.width / 2} y={y - 4} textAnchor="middle">
                {cut.widthLabel}
              </text>
            </g>
          );
        })}

        <g className="cutlist-diagram-leader">
          <line x1={fit.offsetX} y1={baseline} x2={fit.offsetX + fit.drawnH} y2={baseline} />
          <text x={fit.offsetX + fit.drawnH / 2} y={baseline - 4} textAnchor="middle">
            {view.hLabel}
          </text>
        </g>

        <text
          className="cutlist-diagram-depth"
          x={DRAW_WIDTH + 12}
          y={top + fit.drawnV / 2}
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

- [ ] **Step 4: Add the screen styles**

In `src/styles.css`, immediately after the `.cutlist-setup` rule (near line 548-556)
and before `.cutlist-empty`, add:

```css
.cutlist-diagram {
  grid-column: 2 / -1;
  margin: 10px 0 0;
}

.cutlist-diagram svg {
  display: block;
  width: 100%;
  height: auto;
  color: var(--ink);
  overflow: visible;
}

.cutlist-diagram-head {
  margin-bottom: 4px;
  font-size: 0.85em;
  color: var(--ink-dim);
}

.cutlist-diagram-note {
  margin: 2px 0 0;
  font-size: 0.78em;
  color: var(--ink-faint);
}

.cutlist-diagram-outline {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
}

.cutlist-diagram-near {
  stroke: currentColor;
  stroke-width: 2;
}

.cutlist-diagram-far {
  stroke: currentColor;
  stroke-width: 2;
  stroke-dasharray: 10 7;
}

.cutlist-diagram-depth,
.cutlist-diagram-leader text {
  fill: currentColor;
  font-size: 20px;
}

.cutlist-diagram-leader line {
  stroke: currentColor;
  stroke-width: 1.5;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- PartDiagram`
Expected: PASS, all 9 tests.

- [ ] **Step 6: Run the full suite and the typecheck**

Run: `npm test` then `npm run build`
Expected: both green.

- [ ] **Step 7: Commit**

```bash
git add src/panels/PartDiagram.tsx src/panels/PartDiagram.test.tsx src/styles.css
git commit -m "feat: draw a part diagram as SVG"
```

---

## Task 5: The toggle, and putting diagrams on the sheet

**Files:**
- Modify: `src/panels/CutList.tsx`
- Modify: `src/panels/CutList.test.tsx`
- Modify: `src/styles.css` (the toggle's own styles)

**Interfaces:**
- Consumes: `PartDiagram` from `./PartDiagram` (Task 4); `CutListRow.diagrams` (Task 2).
- Produces: no new exports. The sheet renders diagrams under the chosen rows.

- [ ] **Step 1: Write the failing test**

Append to the `describe('CutList', ...)` block in `src/panels/CutList.test.tsx`:

```tsx
  const dadoed = {
    cuts: [{ id: 'c1', face: 'thickness' as const, from: 'min' as const,
             across: 'width' as const, offset: 6, width: 0.75, depth: 0.375 }],
  };

  it('draws a joinery row by default and leaves a plain row undrawn', () => {
    load(dadoed, {});
    const { container } = render(<CutList onClose={() => {}} />);
    expect(container.querySelectorAll('.cutlist-diagram')).toHaveLength(1);
  });

  it('draws nothing when diagrams are turned off', async () => {
    load(dadoed, {});
    const { container } = render(<CutList onClose={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText('Diagrams'), 'none');
    expect(container.querySelectorAll('.cutlist-diagram')).toHaveLength(0);
  });

  it('draws every row when asked for all parts', async () => {
    load(dadoed, {});
    const { container } = render(<CutList onClose={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText('Diagrams'), 'all');
    expect(container.querySelectorAll('.cutlist-diagram')).toHaveLength(2);
  });

  it('starts a fresh open at joinery only', () => {
    load(dadoed, {});
    const first = render(<CutList onClose={() => {}} />);
    expect(first.container.querySelectorAll('.cutlist-diagram')).toHaveLength(1);
    first.unmount();
    const second = render(<CutList onClose={() => {}} />);
    expect(second.container.querySelectorAll('.cutlist-diagram')).toHaveLength(1);
  });

  it('keeps the setup line beside the drawing rather than replacing it', () => {
    load(dadoed);
    render(<CutList onClose={() => {}} />);
    expect(screen.getByText(/3\/4" dado, 3\/8" deep/)).toBeInTheDocument();
    expect(screen.getByText(/Schematic — not to scale/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- CutList`
Expected: FAIL — no element is labelled `Diagrams`.

- [ ] **Step 3: Add the toggle and the render condition**

In `src/panels/CutList.tsx`, change the import line to add `useState`, and add the
`PartDiagram` import:

```tsx
import { useEffect, useRef, useState } from 'react';
import { PartDiagram } from './PartDiagram';
```

Add above the component:

```tsx
/**
 * Which rows get drawn. LOCAL VIEW STATE, deliberately not in the store: it is
 * outside the document and outside the undo stack, the same reasoning that
 * made `shortcutsSuspended` a prop rather than store state. `buildCutList`
 * stays a pure function of the document — this chooses what to RENDER, never
 * what to compute. It is not persisted; a fresh open starts at 'joinery'.
 */
type DiagramMode = 'none' | 'joinery' | 'all';
```

Inside the component, beside the existing `sheet` ref:

```tsx
  const [diagrams, setDiagrams] = useState<DiagramMode>('joinery');
```

In the header, inside `<div className="cutlist-actions">` and **before** the Print
button, add:

```tsx
            <label className="cutlist-diagram-mode">
              Diagrams
              <select
                value={diagrams}
                onChange={(e) => setDiagrams(e.target.value as DiagramMode)}
              >
                <option value="none">None</option>
                <option value="joinery">Joinery only</option>
                <option value="all">All parts</option>
              </select>
            </label>
```

Inside the `row` map, immediately after the `row.setup.length > 0 && (...)` block and
still inside the `<li>`, add:

```tsx
                    {(diagrams === 'all' || (diagrams === 'joinery' && row.setup.length > 0)) &&
                      row.diagrams.map((view) => (
                        <PartDiagram key={view.key} view={view} />
                      ))}
```

- [ ] **Step 4: Add the toggle's styles**

In `src/styles.css`, immediately after the `.cutlist-actions` rule (near line 510-513),
add:

```css
.cutlist-diagram-mode {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  color: var(--ink-dim);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- CutList`
Expected: PASS.

If `getByLabelText('Diagrams')` fails to find the select, check that the `<select>`
is nested *inside* the `<label>` — that is what associates them without an `id`.

- [ ] **Step 6: Run the full suite and the typecheck**

Run: `npm test` then `npm run build`
Expected: both green.

- [ ] **Step 7: Commit**

```bash
git add src/panels/CutList.tsx src/panels/CutList.test.tsx src/styles.css
git commit -m "feat: put part diagrams on the sheet, behind a toggle"
```

---

## Task 6: Print, browser verification, documentation

**Files:**
- Modify: `src/styles.css` (the `@media print` block, near line 563-605)
- Modify: `CLAUDE.md`
- Modify: `docs/follow-ups.md`

**Interfaces:**
- Consumes: every class introduced in Tasks 4 and 5.
- Produces: nothing consumed by code.

- [ ] **Step 1: Extend the print block**

In `src/styles.css`, inside the existing `@media print { ... }` block:

Add `.cutlist-diagram-head` and `.cutlist-diagram-note` to the existing colour-reset
selector list, so it reads:

```css
  .cutlist-overlay,
  .cutlist-sheet,
  .cutlist-group h3,
  .cutlist-qty,
  .cutlist-names,
  /* The empty-sheet line belongs here too: --ink-faint is grey chosen against
     graphite, and grey on white is the one line on an otherwise blank page. */
  .cutlist-empty,
  /* The diagram's heading and caption are the same shape of defect: both are
     --ink-dim/--ink-faint, both are grey on white, and neither is noticed on
     screen. Enumerated rather than left to `currentColor` inheritance —
     follow-up 58 is what enumerating is for. */
  .cutlist-diagram-head,
  .cutlist-diagram-note,
  .cutlist-setup { color: #000; }
```

Then add, before the block's closing brace:

```css
  /* The SVG inherits `color`, and every stroke and fill inside it is
     `currentColor`, so this one declaration blackens the whole drawing. The
     hatch is a <pattern> fill — FOREGROUND content, which survives Chrome's
     "Background graphics" being off. A CSS background would not, and the
     near/far distinction would silently collapse to solid-versus-dashed. */
  .cutlist-diagram svg { color: #000; }

  /* A drawn row is several times taller than a text row. `break-inside` is
     already set on .cutlist-row; keeping the figure intact as well stops a
     leader stack being orphaned from its outline. */
  .cutlist-diagram { break-inside: avoid; }
```

- [ ] **Step 2: Run the full suite and the typecheck**

Run: `npm test` then `npm run build`
Expected: both green.

- [ ] **Step 3: Verify in a real browser**

Run `npm run dev -- --port 5180` and drive it with the Playwright MCP (the only
browser tooling that works on this host — see `docs/follow-ups.md` 26a for why the
software-GL caveat matters, though nothing here touches a shader).

Check, and **report what you saw rather than asserting it worked**:

1. A board with one dado: the band sits where the setup line says, and the
   depth label reads above the outline.
2. A board dadoed from both sides in the same face: one view, one solid hatched
   band, one dashed band, and the legend line present.
3. A board with cuts in two different faces: two views, each headed.
4. A long thin part (96" × 3½"): the sliver clamp gives a readable board. **This
   is where `MAX_ASPECT` gets judged.**
5. A square-ish panel (24" × 24"): drawn square and centred, not squashed.
   **This is where `MAX_HEIGHT` gets judged.**
6. Two cuts close together: do the depth labels collide? Spec §5 records this as
   unsolved and names the fix (move depth into the leader row).
7. The toggle: none / joinery only / all, and that a plain part draws only under
   "all".
8. **Print preview with "Background graphics" OFF.** The hatch must still show.
   If it does not, the `<pattern>` reasoning is wrong and that is a stop-and-escalate.
9. Print preview across a page boundary with several drawn rows: does a row split?

If `MAX_ASPECT` or `MAX_HEIGHT` needs changing, change it in `diagramScale.ts` and
re-run `npm test -- diagramScale` — the constants are named there for exactly this.

- [ ] **Step 4: Update `CLAUDE.md`**

- Status section: add the diagrams pass after the cut list, with the design and plan
  paths.
- "Where things live": add `src/document/diagram.ts`, `src/panels/diagramScale.ts`
  and `src/panels/PartDiagram.tsx` with one-line responsibilities.
- Architecture: note that `diagram.ts` is the *second* `document → units` importer,
  so that edge is now a settled boundary rather than a one-off exception.
- Test count: replace `438` with the new number in both the Status section and the
  Commands section.

- [ ] **Step 5: Update `docs/follow-ups.md`**

Add a "From the cut list diagrams" section recording, at minimum:

- the depth-label collision (§5), open, with the named fix;
- `MAX_ASPECT`/`MAX_HEIGHT` as browser-settled values that no test pins to a
  *readable* outcome, only to a consistent one;
- whether §2's per-`(face, across)` non-goal survived browser verification, or
  read as a bug.

State what was checked and what was deferred. Do not close anything that was not
actually verified.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css CLAUDE.md docs/follow-ups.md
git commit -m "docs: record the cut list diagrams"
```

---

## Self-Review Notes

Checked against the spec, section by section:

- §1 (adds/does not add) — Global Constraints; Task 2 adds the single `CutListRow` field.
- §2 (one view per `(face, across)`, near/far, no mirror, the non-goal) — Task 1 tests
  and implementation; the non-goal is a browser-verification item in Task 6 Step 5.
- §3 (`diagram.ts`, output shape, `id`) — Task 1 in full.
- §4 (`diagramScale.ts`, the ladder, minimum feature) — Task 3 in full.
- §5 (`PartDiagram`, the toggle) — Tasks 4 and 5.
- §6 (testing, including the agreement test) — Task 1, Task 2 Step 1, Tasks 3-5.
- §7 (print) — Task 6 Steps 1 and 3; the caption ships in Task 4's component.
- §8 (representative rule) — Task 2's doc comment on `diagrams`.
- §9 (non-goals) — nothing implements these by construction.
