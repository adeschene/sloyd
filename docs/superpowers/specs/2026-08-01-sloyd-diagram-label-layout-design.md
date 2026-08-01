# Cut list diagrams — label layout

**Date:** 2026-08-01
**Status:** design, approved
**Closes:** follow-up **59** (and the two further instances folded into it)
**Touches:** follow-up **60** (the layout constants), **62** (`band()`'s `Span` contract)
**Predecessor:** `2026-08-01-sloyd-cut-list-diagrams-design.md`

---

## 1. The defect, stated once

> Every `<text>` in `PartDiagram.tsx` is positioned by geometry alone, and nothing
> measures the width of the string being placed. SVG text has extent; the code treats
> it as a point.

Sharpened, from the measured sweep: **a label overflows whenever its run is shorter
than the label is wide.** Every recorded instance is that one sentence — two depth
labels colliding when their bands sit ¾" apart, a `0"` label centred on a zero-length
run and reaching x = −46, and a ¾" cut on a board drawn 125 units wide getting a
6-unit run to carry a 41-unit label.

`docs/diagram-overlap-sweep.js` (follow-up **65**) drove seven geometries in a real
browser and read real `getBBox()` values. Four pass, three fail:

| case | drawn width | verdict | what breaks |
|---|---|---|---|
| `1 baseline` — one dado, 24"×5½" | 1000 | pass | — (calibration control) |
| `2 two-close` — two dados ¾" apart | 420 | **FAIL** | the two `3/8" deep` labels overlap |
| `3 offset-zero` — cut at `offset: 0` | 1000 | **FAIL** | `0"`×`1/8"` overlap; three labels reach x = −46 |
| `4 flush-max` — rabbet flush at the max end | 1000 | pass | — |
| `5 min-width` — edge groove, `drawnH` floored | 125 | pass | — by ~0.7 units; a near-miss, not a clean result |
| `6 narrow-drawn` — 24"×100-15/16" panel | 125 | **FAIL** | `6"`×`3/4"` overlap; depth label 15 units left of the board |
| `7 many-cuts` — five spread dados | 1000 | pass | — |

Case 6 is the acceptance test, not case 2. Spec §5 of the predecessor named a fix —
fold the depth label into the leader row — which closes case 2 and neither of the
others, because those are leader labels colliding with each other and with the board's
own edge.

## 2. Two findings that decided the design

**Label width is computable, not merely measurable.** `styles.css` already defines a
`--font-num` monospace stack, used everywhere else in the app that a number appears
(lines 125, 280, 300, 377, 392, 403, 461). The diagram labels alone do not use it —
they inherit `--font-ui` (Inter). Measured in a real browser at `font-size: 20px`:

| string | `--font-ui` | `--font-num` |
|---|---|---|
| `3/4"` (4 chars) | 41.39 | 48.17 |
| `1-1/16"` (7 chars) | 74.06 | 84.30 |
| `100-15/16"` (10 chars) | 112.23 | 120.42 |
| `3/8" deep` (9 chars) | 97.75 | 108.38 |

`--font-num` is exactly linear at 12.05 units per glyph — every one of those numbers is
`chars × 12.05`. Under that face, `labelWidth` is arithmetic. That is what makes the
fix a pure function the test suite can see, rather than a `getComputedTextLength()`
call in a `useLayoutEffect` that jsdom returns 0 for — which is precisely the hole this
entire defect class came through.

Adopting `--font-num` for these labels is also a consistency fix in its own right: they
are the only numbers on the sheet not already set in it.

**Retuning the constants cannot fix case 6.** At `drawnH = 125`, `sx = 5.2` units per
inch. Raising `MIN_WIDTH` to 300 — already heavy distortion for a schematic — moves a
¾" cut's run from 3.9 units to 9.4, against a 48-unit label. No achievable constant
closes a 5× gap. The constants are a legibility knob; the layout has to handle labels
wider than their runs regardless. This is recorded because "just make the drawing
bigger" is the obvious first proposal and it is wrong.

## 3. Goals and non-goals

**Goals**

1. No two `<text>` elements in a diagram overlap, for any board and any legal set of
   cuts — by construction where possible, by arithmetic where not.
2. No text and no band is drawn outside the SVG's viewBox.
3. The numbers stay spatially attached to the geometry they describe.
4. The layout is a pure function, unit-testable without a browser.

**Non-goals**

- **Moving the numbers off the figure into a table or a legend.** Each cut already
  carries a full prose setup line above the drawing (`¾" dado, ⅜" deep — into the
  thickness face (max side), 6" from the length min end, running across the width`).
  The diagram's numbers are informationally redundant with it; their entire value is
  *spatial*. A layout that relocates them to a collision-free column has not solved the
  problem, it has deleted the feature. This rules out numbered callouts with a legend
  table, which was considered and rejected for this reason and not for a layout one.
- **Runtime text measurement.** Considered and rejected: exact for any font and
  invisible to vitest, plus a second render pass in a component whose main job is
  printing.
- **Changing what a view shows.** One view per `(face, across)` pair, bands touching
  two opposite edges, near hatched / far dashed — all unchanged. This is a layout
  round, not a redesign.
- **Any document-layer change.** `document/diagram.ts` already emits every label
  string this design needs. `CURRENT_VERSION` stays 4.

## 4. The drawing's new layout

Nothing is drawn above or below the outline. Every number belonging to a cut lives in
that cut's own stacked leader row.

```
        ┌────────┬──┬───────────────────┐
        │        │▨▨│                   │   outline + bands only, no text
        └────────┴──┴───────────────────┘
   ├────────────┤├──┤                        row 1 — leader line (geometry)
        6"        3/4"   3/8" deep           row 1 — labels (packed)
```

Three labels per row, in the order they occur along the board:

| label | ideal centre |
|---|---|
| `offsetLabel` | centre of the offset run, `(offsetX + b.x) / 2` |
| `widthLabel` | centre of the band, `b.x + b.width / 2` |
| `depthLabel` | just right of the band, `b.x + b.width + GAP_X + w/2` |

Depth runs perpendicular to this view — it has no position on the page — so "just right
of its band" is honest in a way "centred on its band" never was. That is a better
justification for the predecessor's §5 fix than the collision it was named for.

**Cross-cut collisions become impossible by construction.** Every label a cut owns is
in that cut's row, and rows are `ROW` units apart vertically. Case 2 dies here, without
any width arithmetic at all. Only the ≤3 labels *within* one row can collide, which is
a 1-D packing problem on a bounded interval.

**Near/far keeps its redundant second encoding.** Today it is encoded twice: by
hatch-versus-dash on the band, and by above-versus-below the outline for the depth
label. The second dies with this change, so the **row's leader line takes the same
`stroke-dasharray` as its band** for a far cut. Same redundancy, relocated somewhere it
cannot collide. `view.hasFar` continues to drive the legend in the caption.

**`band()` clamps.** Its `MIN_FEATURE`-widened result is clamped inside
`[fit.offsetX, fit.offsetX + fit.drawnH]`, which closes the band-bleed instance folded
into follow-up 59 (a cut at `offset: 0` narrower than `MIN_FEATURE` currently gets
`x = centre − 3`, left of the board's own edge). Clamping preserves the widening's
existing contract — the band stays visible at `MIN_FEATURE` wide — and only gives up
exact centring in the one case where exact centring puts the band outside the board.

## 5. Modules

New pure module `src/panels/diagramLabels.ts`, beside `diagramScale.ts`, with one
purpose: knowing how wide a label is and where a row of them can sit.

```ts
/** User units. Set on the <svg>, NOT in styles.css — see §5.1. */
export const LABEL_SIZE = 20;
/** An UPPER BOUND on monospace advance, in em. Measured 0.6025; 0.62 for headroom. */
export const LABEL_EM = 0.62;
export const CHAR_W = LABEL_SIZE * LABEL_EM;
/** Every diagram label is digits, '/', '-', '"', space and the word "deep". */
export const labelWidth = (s: string): number => s.length * CHAR_W;

export interface LabelBox {
  /** Where the label would sit if nothing else existed. */
  centre: number;
  width: number;
}

/**
 * Ideal centres in, non-overlapping centres out. Items MUST arrive in x order.
 */
export function packRow(
  items: LabelBox[],
  min: number,
  max: number,
  gap: number,
): number[];
```

`packRow` is a two-sweep packer:

1. Left to right: place each item's left edge at `max(centre − w/2, cursor)`, advancing
   `cursor` to `left + w + gap`. This preserves order and enforces the gap.
2. If the resulting right edge exceeds `max`, shift the whole row left by the overflow,
   then clamp the first item's left edge at `min` (allowing overflow to the right if
   and only if the row genuinely cannot fit).

Pure, total, deterministic, and order-preserving. It never returns NaN and never
reorders.

**The bounds `PartDiagram` passes are the viewBox's, not the outline's:** `min = 0` and
`max = DRAW_WIDTH + RIGHT`. A row's labels may legitimately extend past the board's own
edge — a depth label on a cut flush at the max end lands in the `RIGHT` gutter, and that
is fine, because the gutter's only other occupant is `vLabel`, which sits at the
outline's vertical midpoint while every row sits below the outline. Goal 2 is about the
viewBox, not about the outline; only *bands* are clamped to the outline (§4).

**The row always fits, and that is a property rather than a hope.** `offsetLabel` and
`widthLabel` are at most about 10 characters each and `depthLabel` about 14; 34
characters at 12.4 units is ~422 units plus two gaps, against a viewBox
`DRAW_WIDTH + RIGHT = 1090` wide. Step 2's overflow branch exists for totality — so the
function is defined on inputs a future caller could construct — not because a real part
reaches it.

### 5.1 `LABEL_SIZE` has exactly one home

The font size moves out of `styles.css` and onto the `<svg>` element as an attribute
driven by `LABEL_SIZE`, with `.cutlist-diagram-depth` / `.cutlist-diagram-leader text`
keeping only `fill` and the newly-added `font-family: var(--font-num)`. The constant the
arithmetic uses must be the constant the browser renders; a font size duplicated across
a `.ts` and a `.css` file is precisely the drift follow-up 64 is a record of.

Because the size is in SVG user units, it scales with the drawing and is therefore
medium-independent — screen and print agree — which is already true today and is not
changed by this.

### 5.2 Vertical constants in `PartDiagram.tsx`

| constant | now | becomes | why |
|---|---|---|---|
| `TOP` | 26 | stroke clearance only (~4) | nothing is drawn above the outline |
| `FAR` | 22 | deleted | nothing is drawn below the outline |
| `GAP` | 16 | unchanged | outline to leader stack |
| `ROW` | 26 | unchanged | one row per cut |
| `BOTTOM` | 34 | unchanged | the overall-length run |
| `RIGHT` | 90 | unchanged | the overall-width label's gutter |

A new horizontal constant, `GAP_X`, is the minimum clearance between two labels in a
row and the offset from a band to its depth label. Diagrams get roughly 40 units
shorter overall, which is a free improvement to the printed sheet's density.

## 6. Testing

Three layers, and the third is not optional.

**1. `diagramLabels.test.ts` — the packer directly.** Order preserved; no two boxes
closer than `gap`; every box inside `[min, max]` whenever the row fits; the overflow
branch clamps left rather than producing NaN or reordering; degenerate inputs (empty,
one item, zero-width items, coincident centres).

**2. `PartDiagram.test.tsx` — the seven sweep geometries, as unit tests.** This is the
part that matters. Because label width is now arithmetic, the predicate the browser
harness computes from `getBBox()` becomes computable in jsdom: render the diagram, read
each `<text>`'s `x`/`y` **attributes** (which are real, unlike `getBBox`), pair each with
`labelWidth(textContent)`, and assert no pairwise overlap and nothing outside the
viewBox. The test must resolve `text-anchor` when it turns an `x` into a box —
`x` is the label's *centre* under `middle` and its *left edge* under `start` — because
reading `x` as a left edge regardless would make the assertions wrong in exactly the
direction that hides a collision. Cases 2, 3 and 6 become regression tests. Case 5 becomes a test that passes by
an enforced gap instead of by 0.7 units of luck.

The existing numeric-coordinate test guarding follow-up 64 (the leader stack starts
below the outline) stays and must be updated for the new `TOP`/`FAR`.

**The boundary, stated plainly.** Layer 2 tests the *model* of text width, not the
browser's rendering of it. If `LABEL_EM` is wrong, or a machine resolves a monospace
face wider than 0.62em, every test passes and the browser still overlaps. Layer 2
closes the hole for layout logic and does **not** close it for font metrics. Claiming
otherwise would be the same mistake follow-up 64 records. A font wider than the bound
degrades gracefully — labels crowd, they do not pile up — because the bound is used for
spacing, not for clipping.

**3. `docs/diagram-overlap-sweep.js` in a real browser** — unchanged, and still the
arbiter. Run against the same seven geometries, seeded through `localStorage` under
`sloyd.autosave.v1`. Two harness notes carried forward from item 65:

- **`TOL = 1` must be re-calibrated downward.** It exists solely because every near-side
  depth label overhangs the viewBox top by 0.6 units of ascent padding. With no text
  above the outline, that overhang disappears — leaving the tolerance at 1 would mask a
  real regression of up to a unit.
- **Keep `1 baseline` in the set.** It is the only thing that makes a FAIL mean
  anything.

Playwright is the only browser tooling that works on this host (follow-up 26a).

## 7. The constants retune

Sequenced deliberately **after** the layout lands, because the layout changes what the
constants are for. `MIN_FEATURE` no longer has to leave room for a label — only to keep
a band visible — and `MIN_WIDTH` no longer trades off against label crowding, so both
can be judged on appearance alone.

The retune is a browser pass at three geometries: the two extremes follow-up 60 already
names (a 96" × 3½" rail against `MAX_ASPECT`, a 24" square panel against `MAX_HEIGHT`)
plus case 6's narrow panel against `MIN_WIDTH`. It is recorded the way 60 was — a
judgement with its evidence, not a proof.

**If nothing wants changing, the correct outcome is to change nothing and say so.** The
constants stay named exports of `diagramScale.ts` either way.

## 8. Order of work

1. `diagramLabels.ts` — `labelWidth`, `packRow`, and their tests.
2. `band()` clamped to the outline; `diagramScale.test.ts` extended. Note this also
   makes follow-up **62**'s latent hazard narrower, though it does not close it — an
   out-of-order `Span` still yields a negative width; it is now merely clamped in.
3. `PartDiagram.tsx` re-laid out: depth into the row, `TOP`/`FAR` revised, `packRow`
   applied, far leaders dashed, font size onto the `<svg>`.
4. `styles.css`: `font-family: var(--font-num)` on the diagram labels, `font-size`
   removed.
5. Tests: the seven geometries in `PartDiagram.test.tsx`.
6. `npm run build` (the typecheck gate — `npm test` does not typecheck).
7. Browser: re-calibrate `TOL`, run the sweep, all seven green.
8. The constants retune (§7).
9. `docs/follow-ups.md` and `CLAUDE.md` updated: 59 closed, 60 and 62 amended, 65's
   calibration note revised.

## 9. Risks

- **`LABEL_EM` is an upper bound taken from one machine's monospace resolution.** A
  wider face degrades gracefully (crowding, not piling) and the sweep is what would
  catch it. Mitigated, not eliminated; recorded as a follow-up after the round.
- **`packRow` moves a label away from its ideal centre**, so on a crowded row a number
  may sit slightly off the run it names. The leader line beneath still shows the true
  geometry, and the caption already says the drawing is schematic. This is the
  deliberate trade: a legible number slightly displaced beats an illegible one exactly
  placed.
- **Losing the above/below near-far encoding** is mitigated by the dashed leader line,
  which is a browser-judgement item for §7's pass rather than something a test pins.
