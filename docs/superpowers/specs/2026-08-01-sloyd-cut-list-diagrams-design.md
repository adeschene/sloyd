# Sloyd cut list diagrams — the setup as a picture

> The cut list already carries the right numbers. A setup line says *¾" dado, ⅜" deep —
> into the thickness face (min side), 6" from the length min end, running across the
> width*, and every word of that is true. It is also a sentence you have to decode
> while holding a router. This draws it instead.

The complaint that started this is specific and worth keeping in view, because it
bounds the work: **the prose is hard to read, not wrong.** Nothing here changes a
number, a row, a group, or the document. It adds a second rendering of information
the sheet already computes correctly.

That framing settles the first question a reader will have. This is not a new
derivation competing with `buildCutList` — the setup lines stay exactly as they are,
and the diagram sits beside them. A user who finds the prose clearer keeps it; a user
who finds the picture clearer has it. Neither is authoritative over the other,
because both are derived from the same `Cut` by pure functions, and §6 says how that
agreement is pinned.

---

## 1. What this adds, and what it deliberately does not

**Adds:** a schematic drawing of each part that has joinery, printed with its row.
Three new modules, one new control on the sheet, one block of print CSS.

**Does not add:** any schema field, any `CURRENT_VERSION` bump, any store state, any
change to `buildCutList`'s grouping, ordering, tolerance rules, or output strings.
`CURRENT_VERSION` stays 4. If an implementation task finds itself wanting to store
something a diagram needs, that is derived state leaking into the document — stop and
escalate, exactly as the cut list's own spec said.

The one change to `CutListRow` is an added field, `diagrams`, carrying already-derived
geometry. It is a widening, not a rewrite: nothing that reads the existing fields
changes.

---

## 2. One view per `(face, across)` pair

**This is a correction to what was agreed in brainstorming, made while pinning down
the layout, and it is recorded rather than slipped in.** The discussion settled on
"one view per distinct cut `face`". That is not sufficient, and the reason is
mechanical.

A cut spans its `across` dimension fully and sits at `[offset, offset + width]` along
the *position axis* — the third dimension, implied by `positionAxisOf(face, across)`
and never stored. So within a view, a cut is always a band touching two opposite
edges of the outline. That band is the visual signature of a through-cut, and it is
worth getting for free.

But a single face admits two different `across` values. A board can carry one cut in
its thickness face running across the *width*, and another in the same thickness face
running across the *length*. Those two cuts have **different position axes**, so they
cannot both be drawn as bands along the same screen axis. Keying views on `face`
alone would put them in one drawing where one of them must be laid out sideways,
which means two annotation layouts, two leader geometries, and a collision problem
that has no clean answer.

Keying on the pair dissolves it:

- **View key:** `(face, across)`.
- **Horizontal axis:** `positionAxisOf(face, across)` — the position axis, always.
- **Vertical axis:** `across`.

Every cut in every view is therefore a **vertical band spanning the full height**,
every dimension leader is a **horizontal run beneath the board**, and there is exactly
one layout in the entire feature. At most six views exist (three faces × two `across`
values); one or two is the realistic case, and a board with more than two is already
a board whose prose was unreadable.

A board with **no cuts** gets a single view: `face: 'thickness'`, `across: 'width'` —
broad-face-on, length running horizontally. That is the view a woodworker draws by
hand, and it only ever renders under the "all" setting in §5.

### Near and far

Each view looks down its face axis **from the min end**. Within a view:

- `from: 'min'` is **near** — solid outline, hatched fill;
- `from: 'max'` is **far** — dashed outline, no fill.

This is the hidden-line convention, and it is what makes a board dadoed on both faces
legible: both cuts share one horizontal axis, so whether they overlap, align, or miss
each other is visible at a glance. Two separate drawings — the obvious alternative —
hide exactly that relationship behind a mental flip of the board.

Both sides are drawn in **board coordinates, never mirrored**: the position axis runs
min-to-max, left-to-right, in every view. Physically flipping a board reverses that
axis, and a drafting-correct mirror would be defensible — but every annotation on the
sheet is phrased "*n* from the *dimension* min end", and a mirrored view would make
the leftmost feature the one with the largest offset. Consistency with the numbers
wins over consistency with the physical flip.

### What a view does not show

**A cut belonging to a different `(face, across)` pair is not drawn, even though real
stock is missing from the region the view covers.** A view is *the setups for this
face and this direction*, headed as such — not a projection of the finished part.

This is a deliberate limit, and it is the one decision in this design most likely to
be reported as a bug. Drawing every cut in every view would need a third line weight
for "removed, but not by a setup shown here", and it would clutter the common case —
one face, one or two cuts — to serve a board that already has its own second view.
The heading is the mitigation. If it proves confusing in use, the fix is a follow-up,
not a reopening of this decision.

---

## 3. `src/document/diagram.ts` — board inches, no pixels

A pure leaf alongside `cutlist.ts` and `cuts.ts`. Imports `./types`, `./geometry`,
`./cuts`, and `../units/length`. **Never imports `./document`** — `document.ts`
re-exports it, so importing back is a cycle. `cuts.ts` and `cutlist.ts` are both
precedent.

It emits geometry in **board inches**. No drawing units, no viewBox, no pixels — those
belong to §4, and keeping them out is what lets this module be tested against
measurements rather than against a rendering.

The `../units/length` import is the same edge the cut list already opened
(`document → units`, spec §2 of the cut list design). It is not a second amendment:
that boundary already moved, and this module crosses it for the same reason — the
labels are formatted at the document's precision, by the function that does all the
other formatting.

### Output shape

```ts
/** One cut as it appears in a view, in board inches. */
export interface DiagramCut {
  /** Stable within the view. The React key. */
  id: string;
  /** [min, max] along the view's horizontal (position) axis. */
  h: Span;
  /** [min, max] along the view's vertical (`across`) axis. Always the full height. */
  v: Span;
  /** 'min' → drawn solid and hatched; 'max' → drawn dashed. */
  side: CutFrom;
  /** e.g. `3/8" deep`, already formatted. */
  depthLabel: string;
  /** e.g. `6"` — the offset from the horizontal axis's min end. */
  offsetLabel: string;
  /** e.g. `3/4"` — the cut's own extent along the horizontal axis. */
  widthLabel: string;
  /** From `cutLabel`. Representative, not consensus — see §8. */
  kind: 'dado' | 'rabbet';
}

export interface DiagramView {
  /** Stable across renders. The React key. */
  key: string;
  /** e.g. `Thickness face — across the width` */
  heading: string;
  face: Dimension;
  across: Dimension;
  /** The dimension on the horizontal axis: `positionAxisOf(face, across)`. */
  along: Dimension;
  /** Board inches. The outline is [0, h] × [0, v]. */
  h: number;
  v: number;
  /** Formatted overall dimensions for the two axis annotations. */
  hLabel: string;
  vLabel: string;
  /** In `offset` order along the horizontal axis. Empty for a cut-free board. */
  cuts: DiagramCut[];
  /** True when any cut has `side: 'max'` — the renderer shows a legend only then. */
  hasFar: boolean;
}

export function buildDiagrams(board: Board, precision: number): DiagramView[];
```

`cutlist.ts` calls it while the representative board is in hand — the same moment and
the same reason `setupLine` is called there rather than reconstructed later from a
`CutListRow`, which carries no board. Both are `document` leaves, so this is a sibling
import, not a new layer.

**`diagrams` is always populated, including for cut-free rows** (which get the single
broad-face view from §2). The toggle in §5 chooses what to *render*; it never chooses
what to compute. Making the field conditional would push a view decision down into the
derivation and give the panel two shapes to handle for no saving — the work is a
handful of rectangles per board.

`cutRegion(board, cut)` does the geometry. It is already the only place `from` is
consumed, and it already returns the removed box keyed by dimension, so a view's
rectangle is two of its three spans read out by name — `region[view.along]` and
`region[view.across]`. **No projection, no `boardEdges`, no hidden-line computation.**
The near/far distinction comes from `cut.from` directly, not from comparing spans.

Views are ordered by `DIMENSION_ORDER` on `face`, then on `across`, so a board's
drawings appear in the same order every render. Cuts within a view are ordered by
`h[0]`, which is what §4's leader stacking depends on.

### `id`, and why cuts keep theirs

`DiagramCut.id` is `Cut.id` verbatim. `cutSignature` and `setupLine` both exclude
`id` deliberately — two cuts identical but for `id` produce the same signature and
the same prose, which is why `CutList.tsx` keys setup lines on index. A diagram has
the same exposure and takes the opposite route: the cuts are already in hand as
objects here, so the real `id` is available and costs nothing. Use it.

---

## 4. `src/panels/diagramScale.ts` — inches to drawing units

Pure, unit-tested, and living in `panels/` rather than `document/` because it encodes
a *presentation* decision. The precedent is established and deliberate:
`viewport/gridDensity.ts`, `screenScale.ts` and `gizmoScale.ts` are all pure,
unit-tested modules inside a UI folder. Scale clamps are exactly that shape — a small
amount of arithmetic that is easy to get wrong, has no React in it, and should not
have to be verified by looking at a screenshot.

### Drawing space

The SVG carries a `viewBox` and fills its grid cell, so it scales with the column
rather than being laid out in CSS pixels. All constants below are therefore in
**drawing units**, not px. The unit-to-px ratio is a constant per medium (every
diagram on the sheet renders into the same grid cell width, and print has its own
constant), which is what makes a minimum feature size in these units meaningful.

- `DRAW_WIDTH = 1000` — the nominal content width.
- `MAX_ASPECT = 8` — a board is never drawn thinner than `DRAW_WIDTH / 8`.
- `MAX_HEIGHT = 420` — a drawing never grows taller than this.
- `MIN_FEATURE = 6` — a cut band is never drawn narrower than this.

### The ladder

Given a view's `h` and `v` in inches:

1. `s = DRAW_WIDTH / h`; `drawnH = DRAW_WIDTH`, `drawnV = v * s`. Uniform.
2. If `drawnV < DRAW_WIDTH / MAX_ASPECT`, raise `drawnV` to that floor. **The sliver
   clamp** — this is the only step that makes the scale non-uniform, and it exists so
   a 96" × 3½" rail has something to draw a dado into.
3. Otherwise, if `drawnV > MAX_HEIGHT`, scale **both** axes down by
   `MAX_HEIGHT / drawnV`. A 24" × 24" panel comes out square and smaller, never
   squashed. The content is centred horizontally in the `DRAW_WIDTH` box.

Steps 2 and 3 are mutually exclusive: `DRAW_WIDTH / MAX_ASPECT` is 125 and
`MAX_HEIGHT` is 420, so no input can trip both. That is an invariant of the constants,
not of the inputs, and a test asserts it — changing a constant without re-reading this
paragraph is the way it would break.

The result is `{ sx, sy, drawnH, drawnV, offsetX }`, with `sx === sy` except under the
sliver clamp.

### Minimum feature width

A cut band narrower than `MIN_FEATURE` is widened **about its centre**, not from its
left edge. Position is the property the drawing is trying to preserve — "near the far
end" must still read as near the far end — and centre-preserving widening keeps the
error symmetric and bounded at `MIN_FEATURE / 2` drawing units. The annotated numbers
remain exact regardless; the drawing is a schematic, and §7 says so where a user can
read it.

**`MAX_ASPECT` and `MAX_HEIGHT` are guesses.** They are stated as constants in one
module precisely so a browser-verification pass can change them without touching
anything else. Do not treat the current values as settled.

---

## 5. `src/panels/PartDiagram.tsx` and the toggle

### The drawing

One `<svg>` per view, with a `viewBox` of `0 0 1000 H` where `H` is `drawnV` plus the
annotation gutter. Inside:

- the board outline, a stroked rect with no fill;
- each cut band — near cuts stroked solid with a `<pattern>` hatch fill, far cuts
  stroked dashed with no fill;
- each cut's `depthLabel` as text immediately **above** the outline for a near cut and
  **below** it for a far cut. This encodes near/far a second time, redundantly and on
  purpose;
- the overall `hLabel` on a dimension run beneath everything, and `vLabel` to the
  right of the outline;
- one leader row per cut in the gutter, **stacked in `h[0]` order — cut *i* gets
  gutter row *i***. Each row draws the offset run from the origin to the band's left
  edge and the band's own width run, labelled `offsetLabel` and `widthLabel`.

Stacking rather than placing leaders inline is what avoids a collision solver. It
costs vertical space linear in the cut count, which is acceptable — a part with six
cuts is a part whose prose was the actual problem.

**Known limitation:** two cuts close together can still collide in their *depth*
labels, which sit on the outline rather than in the gutter. Left unsolved. If it
shows up in browser verification, the cheap answer is to move depth into the leader
row too, at the cost of the redundant above/below encoding.

The renderer **formats nothing**. Every string arrives from `buildDiagrams`, which is
the same rule `CutList.tsx` already follows and the reason display rounding lives in
one place.

### The toggle

A three-state control in the sheet header: **none / joinery only / all**, defaulting
to **joinery only**.

- *none* — text only, the sheet exactly as it prints today.
- *joinery only* — a diagram under every row with `setup.length > 0`. A cut-free part
  is a plain rectangle whose length and width already print on its row; drawing it is
  ink carrying nothing.
- *all* — every row drawn, including cut-free parts, using the single broad-face view
  from §2.

State is a `useState` in `CutList`, **deliberately not in the store**. It is local view
state, outside the document and outside the undo stack — the same reasoning that made
`shortcutsSuspended` a prop rather than store state. `buildCutList` stays a pure
function of the document; the toggle chooses what to render, never what to compute.

It lives inside `.cutlist-actions`, which the print block already hides, so it does not
print. It is not persisted: a fresh open starts at *joinery only*.

---

## 6. Testing

**`document/diagram.ts` carries the weight.** Pure, board-inches, no rendering:

- view count and keys for a board with cuts in one face, two faces, and the same face
  with two different `across` values — the case §2 exists for;
- the axis assignment: `along === positionAxisOf(face, across)` for every generated
  view;
- a cut's `v` span is always the full height (the through-cut signature);
- `side` follows `from`, and `hasFar` is true exactly when some cut has `from: 'max'`;
- a `from: 'max'` cut's `h` span equals the `from: 'min'` case — `from` moves the cut
  through the *face* axis, which no view shows, so it must not move the band;
- a cut-free board yields exactly one thickness/width view with no cuts;
- ordering: views by `DIMENSION_ORDER`, cuts by `h[0]`;
- labels format at the document's precision, and change when precision changes.

**The agreement test, and it is the important one.** For a board with a cut, the
diagram's `offsetLabel`, `widthLabel` and `depthLabel` must be exactly the substrings
`setupLine` produces for the same cut at the same precision. The picture and the prose
are two renderings of one `Cut`, and nothing else in the codebase would catch them
drifting apart — a change to `setupLine`'s formatting that skipped `buildDiagrams`
would leave a sheet that contradicts itself in print. Assert on the strings, not on
the numbers.

**`panels/diagramScale.ts`:** the three ladder branches, the mutual exclusivity of
steps 2 and 3, centre-preserving minimum-feature widening, and `sx === sy` in every
case except the sliver clamp.

**`panels/PartDiagram.tsx`:** a light jsdom render — one `<svg>` per view, correct
rect count, the dashed class present on far-side cuts and absent otherwise, the legend
rendered only when `hasFar`. The viewport's "no unit tests, drive a browser instead"
rule does not apply here: this is ordinary SVG DOM in jsdom, not react-three-fiber.

**`panels/CutList.test.tsx`:** the toggle's three states select the right rows, and the
default is *joinery only*.

**Browser verification is not optional**, and it owns the questions tests cannot
answer: whether `MAX_ASPECT` and `MAX_HEIGHT` produce a readable page, whether depth
labels collide, and whether a tall row breaks across a printed page.

---

## 7. Print

The sheet's whole point is that it prints, and this is where the release is most
likely to ship a defect, because the failure is invisible on screen.

- **SVG, not canvas.** It prints as vectors at printer resolution.
- **Hatching is an SVG `<pattern>` fill, never a CSS background.** The existing print
  block already carries a comment about Chrome dropping background colours unless
  "Background graphics" is enabled. A `<pattern>` fill is foreground content and
  survives that setting; a CSS background would not, and the near/far distinction
  would silently collapse to "solid outline versus dashed outline" on a default print.
- **Strokes and text use `currentColor`**, so the existing `.cutlist-*` colour reset
  reaches them.
- **Every new class is still enumerated in the `@media print` block explicitly.**
  `currentColor` inheritance is a convenience, not a guarantee, and follow-up 58
  shipped a grey-on-white `.cutlist-empty` for precisely the reason that nobody prints
  the state they did not think about. Enumerate; do not rely on cascade.
- **Pagination.** `.cutlist-row` already has `break-inside: avoid`. A row with a
  diagram is several times taller, and whether that rule survives — or strands a row
  on a fresh page — is a browser-verification item. It is not something a jsdom test
  can assert.

A one-line caption, `Schematic — not to scale`, prints under each diagram. §4 distorts
aspect ratio and minimum feature width by design, and a printed drawing without that
caption invites someone to measure it. This is the one place the schematic decision
reaches a printed word.

---

## 8. The representative rule, extended

Follow-up 55a already records that a row's setup lines come from whichever board
landed in the row first, and that every *number* on them is right for every part while
the dado/rabbet *word* may not be.

**The diagram inherits this exactly, and adds nothing new to it.** It is built from the
same representative board, so:

- every dimension it draws and labels is right for every part in the row, because
  `cutSignature` is exact and the rows collapsed on it;
- `DiagramCut.kind` is `cutLabel`'s output and carries the same caveat the printed
  word does — it is tested against the board's *exact* dimensions while the row
  collapsed at *display* precision.

This is a restatement of an accepted decision, not a new exposure. It is recorded here
and in a comment at the call site so a future reader who notices the mismatch finds it
decided rather than missed. No new follow-up is warranted.

---

## 9. Non-goals

Recorded as decisions, not omissions.

- **A projection of the finished part.** Each view shows one face's setups, not every
  cut that intersects it. See §2, which states this as the design's likeliest
  false-bug-report.
- **Section views.** Depth is a hatch and a label, not geometry. Two views per cut was
  considered and declined in brainstorming: it doubles the drawings and the vertical
  space for a number the label already carries unambiguously.
- **True scale, and break lines.** Both considered and declined in brainstorming. True
  scale makes a ¾" dado on a 96" board a hairline; break lines need placement logic and
  a legend for a convention the caption already replaces.
- **Mirroring the far side.** See §2 — drafting-correct, and inconsistent with every
  "from the min end" number on the sheet.
- **A collision solver for annotations.** Leaders stack by index; depth labels may
  collide and are left to browser verification. See §5.
- **Persisting the toggle.** It is view state; a fresh open starts at *joinery only*.
- **Diagrams anywhere but the cut list.** The properties panel's Cuts section is an
  editor and has the live viewport beside it. This is for the sheet you carry.
- **Any schema change.** See §1.
