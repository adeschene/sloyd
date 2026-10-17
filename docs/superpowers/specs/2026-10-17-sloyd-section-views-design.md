# Sloyd — section views on the Plans sheet (design)

Date: 2026-10-17. Follow-up 256 (the sheet half of section views; the viewport half shipped as the section cut,
`2026-10-14-sloyd-section-cut-design.md`, inv 51). Status: approved by the user 2026-10-17 ("go with what you'd recommend"); plan
`docs/superpowers/plans/2026-10-17-sloyd-section-views.md`.

## 1. Purpose and rulings

A printed section shows what an elevation cannot: the inside of a joint, a dado's depth, a bore's path, how a panel sits
in its groove. The viewport already cuts the model; this puts that cut on paper.

User rulings (brainstorm, 2026-10-17):

- **R1 The viewport's cut is the source.** When the viewport's Section is on as the Plans sheet opens, the sheet adds one
  section drawing. With Section off, the sheet is unchanged. No new control and nothing saved. This supersedes the
  section-cut spec's R1 ("viewport only") for the sheet. That spec's other rulings stand.
- **R2 The whole piece.** The section is of the piece, placed directly after the piece's Front/Side/Plan trio. It is not
  repeated per assembly.
- **R3 A full section.** The cut faces are hatched, and the kept wood beyond the plane is drawn as a view from the cut.
  It shows visible lines only, with no hidden lines.
- **Approach A** (chosen; §3): the section is a `drawView` option that clips every line and every occluder to the kept
  half-space, with caps from `sectionCaps`. Two alternatives were rejected:
  - a temporary angle cut per part (it cannot express a slab removed parallel to a face, and it would churn the
    geometry cache);
  - caps painted over a normal view (removed parts would still hide what is behind them).

Non-goals:
- more than one section;
- a section per assembly;
- a section control on the sheet itself;
- dimensions, balloons or feature tags on the section;
- grain marks in the hatch;
- saving the section with the project.

## 2. What the sheet shows

### 2.1 When

`PlansSheet` reads the store's `section` (view state, inv 51) when it renders:

- if it is null, the sheet is unchanged byte-for-byte;
- otherwise the piece's block gains a cutting-plane marker on one elevation (§2.4), and a **Section A–A** block follows
  it.

Hidden parts are drawn: the sheet already draws every part, whatever the viewport hides.

### 2.2 Explode

The sheet draws the piece assembled. The viewport's `at` is a coordinate in the drawn (possibly exploded) world, and the
sheet uses the same coordinate on the assembled piece. When the viewport is exploded (`explode > 0`), the section block
carries the note *"Cut through the assembled piece at the viewport's position."*

If the plane meets no wood of the assembled piece (no part has a cap), the section block is replaced by one line:
*"Section A–A: the cut meets no part of the assembled piece."*

### 2.3 The section drawing

**Scale.** It uses the scale of the piece trio it follows, so a reader can compare it with the elevations directly.
Its bounds are the screen box of the parts that keep wood on the kept side. A section is never larger than the
corresponding elevation, so it fits wherever the trio fits (the fu 254 height cap included).

**View.** The section is seen square-on from the removed side, looking into the kept wood. With `flip: false` that is
the standard view of the section's axis (Front, Side, Plan; the kept half-space is `toward·p ≤ at`). With `flip: true`
it is the opposite view. Each opposite view is proper: `right × up = toward`.

| axis | flip | view | toward | right | up |
|---|---|---|---|---|---|
| front | false | Front | (0,0,1) | (1,0,0) | (0,1,0) |
| front | true | Back | (0,0,−1) | (−1,0,0) | (0,1,0) |
| side | false | Side | (1,0,0) | (0,0,−1) | (0,1,0) |
| side | true | Left side | (−1,0,0) | (0,0,1) | (0,1,0) |
| top | false | Plan | (0,1,0) | (1,0,0) | (0,0,−1) |
| top | true | Underside | (0,−1,0) | (1,0,0) | (0,0,1) |

**Content:**
- Every board edge, hole line and silhouette, clipped to the kept half-space, through the one hidden-line pass against
  occluders also clipped to it. Only the visible lines are drawn.
- **Caps** are each part's `sectionCaps(board, section)`, taken with no offset because the piece is assembled. The
  pieces fill as a hatched region, and the outline is drawn as visible lines in the section line weight (heavier than
  edges). The caps lie on the plane, in front of everything kept, so nothing occludes them.
- A bore crossing the plane is already subtracted by `sectionCaps`. One cut across its axis reads as a hole in the
  hatch, and one cut along its axis reads as a slot.

**Hatch.** Lines at 45° and 135°, spaced 3 px at print scale, with one pattern per part.
- Two parts whose caps touch (their outlines share a point within `SECTION_EPS`) get different patterns.
- Each part, in drawing order, takes the first pattern its touching neighbours have not used, from this list: 45°,
  135°, 45° wide (6 px), 135° wide.
- If all four are used, it falls back to 45°. With rectangular parts this cannot happen, so that case is a recorded
  residue, not a refusal.
- The hatch prints black.

**Title.** `Section A–A — <axis word> cut <distance> from the <reference>, looking <direction>`:

| axis | `<axis word>` | `<reference>` | `<direction>` (`flip: false` / `flip: true`) |
|---|---|---|---|
| front | Front | back | toward the back / toward the front |
| side | Side | left | toward the left / toward the right |
| top | Plan | bottom | down / up |

Two notes on the title:
- `<distance>` is `at` minus the assembled piece's minimum along the axis. It is formatted with the document's units
  through `formatLength` (inv 52), so a metric sheet reads bare mm, like the other dimensions.
- Paper has no origin, so the distance is measured from the piece itself. (In the brainstorm this read "at 12-3/4"",
  the viewport's world coordinate. The change is flagged for the user's review.)

Example: *Section A–A — Front cut 7-1/2" from the back, looking toward the back.*

**Nothing else.** The section carries no dimensions, balloons or feature tags.

### 2.4 The cutting-plane marker

The marker sits on ONE elevation of the piece trio, one that sees the plane edge-on:
- the **Plan** view for a Front or Side cut;
- the **Front** view for a Top cut.

Marking both edge-on views would be clutter.

How it is drawn:
- **The line** is a heavy chain line (long dash, short dash) across the view at the plane's position. It runs past the
  view's bounds by 12 px at each end.
- **The arrows** sit at each end, square to the line, and point in the direction of sight (`−toward` of the section's
  view, projected into the marked view).
- **The letter** "A" sits beside each arrow.

The marker is not a feature tag, and it does not move tags, which may sit over it. This matches the user's ruling on fu
381, which accepted tags on dimension lines. It is checked by eye on the live pass.

## 3. Architecture

### 3.1 `document/drawing.ts`

`drawView(parts, view, offsets?, opts)` gains `opts.section?: Section`. With no section, every path is unchanged: the
drawing is byte-for-byte as today, and `drawingIdentity.test` pins it.

With a section:

1. **Segments.** Each segment `A→E` is clipped to the kept half-space by the parameter range where `keptBySection`
   holds. The range is computed on the model segment, which for a curved part is the model chord (inv 47). A segment
   wholly removed is dropped. One clipped wholly kept is unchanged. One crossing the plane keeps `[0, t*]` or
   `[t*, 1]`, and the existing visibility and `push` machinery runs on that sub-range.
   - A fine curve path (`seg.path`) is drawn over the same chord sub-range through `along`. Its end may then sit off the
     cap outline by no more than `CURVE_TOLERANCE` (0.005", the chord-to-arc gap). This is accepted, matching chunk 2's
     Q4: a split chord keeps its end on the chord.
   - The silhouette probe (`lift`) moves with its segment.
2. **Occluders.** Each solid is intersected with the kept half-space:
   - a box solid becomes a box with its `min` or `max` on the axis set to `at` (still exact);
   - a box solid wholly removed is dropped;
   - a planes solid gains the plane as one more inside half-space (`m` = ±axis unit, `c` accordingly, `|m| = 1`).
   The prefilter fields (`rmin`, `rmax`, `depthMax`) stay as computed from the unclipped body. They are conservative,
   and a prefilter that is too generous only costs time.
3. **Bounds** are taken over the parts with wood on the kept side, computed as their clipped boxes.
4. **Caps.** The drawing returns `caps: { part: string; polys: P2[][]; outline: Seg2[] }[]`. For each part,
   `sectionCaps(b, section, off)` gives the pieces, projected through `proj`, and the outline, projected as segments.
   Without a section, `caps` is absent, not empty, which keeps the identity hash unchanged.
5. **Hidden lines.** The section passes `hiddenLines: false`, and the figure draws `visible` only.

`drawView` stays the ONE hidden-line pass. No second visibility routine is written for sections.

### 3.2 `document/sectionView.ts` (new, pure)

- `sectionViewOf(section): View`: the table in §2.3, built from `FRONT`, `SIDE` and `TOP` by negating `toward` and
  choosing `right` (never hand-typed vectors that could drift from the standard views).
- `sectionTitle(section, parts, units): string`: §2.3's title. The minimum comes from `boardsBounds` of the assembled
  parts.
- `cuttingLine(section, view, drawing): { a: P2; b: P2; sight: P2 } | null`: the marker's line in the marked view's
  drawing coordinates, before the 12 px overrun, which is added in the panel at print scale, with the unit direction
  of sight. It returns null for a view that does not see the plane edge-on.
- `markedView(section): 'front' | 'top'`: §2.4's choice.
- `hatchPatterns(caps): Map<string, 0 | 1 | 2 | 3>`: §2.3's touching rule, greedy in drawing order.

### 3.3 `panels/PlanFigure.tsx`

- `PlanTrio` takes `section?: Section`, which is passed only for the piece trio.
  - With a section it draws the cutting line on the marked view.
  - It then renders a `SectionFigure` as a SIBLING block after its own `<figure>`, handing over its `lay.scale`, so
    the scale is shared without drawing the trio twice.
  - The memo holds, because the store's `section` is a stable object while the sheet is open (the sheet is modal).
- `SectionFigure` draws, in this order:
  - the caps' hatch (SVG `<pattern>` per pattern index, ids scoped by the figure);
  - the cap fill as a white underlay;
  - the visible lines;
  - the cap outlines in the section line weight.
  Then come the title and, when they apply, the explode note and the no-wood line.
- Print: the section block is `break-inside: avoid`, like the trio.

*Amended (implementation, 2026-10-17):* `PlansSheet` renders `SectionBlock` as its OWN `plans-section` after the piece's,
not `PlanTrio` (its own heading and page block); the scale is shared through `trioScale`, which reads the trio's drawings from
a WeakMap keyed on the parts array. The marker is drawn only when the plane crosses the piece in the marked view (review M2).
Touching caps are judged within `DRAW_EPS`, not `SECTION_EPS`, with a bounding-box pre-check (review M1). On paper a part with
no kept wood draws nothing, even a face lying on the plane (review I1).

### 3.4 `panels/PlansSheet.tsx`

It reads `useStore((s) => s.section)` and `s.explode`, and passes `section` to the piece's `PlanTrio`. Nothing else in
the sheet changes.

### 3.5 Invariants

**Inv 51 is amended:**
- the Plans sheet reads the store's section (view state; never saved);
- its caps come only from `sectionCaps`;
- its section drawing comes only from `drawView`'s `section` option, one hidden-line pass with clipped lines and
  occluders;
- a sheet with no section is byte-for-byte unchanged.

**Inv 47's sources stand:** lines come from `boardEdges`, hole lines and silhouettes, and occluders from `worldBodies`.

## 4. Testing

**Pure tests on `drawView` with a section:**
- **Identity:** no section gives the same drawing as today, through the `drawingIdentity` hash.
- **Clipping:** a box cut through its middle keeps exactly the kept half of each crossing edge, and drops every edge
  wholly on the removed side.
  - Flipped, the other half is kept.
  - Mutate: invert the side test, and the test fails.
- **Occluders:** a part on the removed side that would hide a kept part's edge no longer hides it. A kept part still
  hides what is behind it.
- **Caps:** they are present for parts the plane meets and absent for the others.
  - A dado shows its notch in the cap outline.
  - A through bore across its axis shows a ring.
  - A bore along its axis shows a slot.
- **Angled and curved parts:** a tapered leg cut across, and an arched apron cut across its arch, give clipped
  silhouettes and chords that end on the plane.
- **Explode:** offsets are not applied for the sheet. The section is always assembled.

**Pure tests on `sectionView.ts`:**
- Each of the six views is proper (`right × up = toward`) and agrees with the standard views when unflipped.
- Titles in inches and mm, measured from the piece's minimum.
- The cutting line lands on the marked view at the plane's projected position. Its sight points toward the kept side
  as the reader sees it, so it flips with `flip`.
- Hatch: two touching caps differ, a third touching both takes the third pattern, and non-touching caps may repeat.
  Mutate the touch test, and the test fails.

**Panel tests (`PlansSheet.test.tsx`):**
- Section off: the markup is unchanged.
- Section on: there is one section block after the piece trio, with the title and one cutting line on the marked view.
- Exploded: the note is shown.
- A cut meeting no wood: the one line replaces the drawing.
- Assembly trios carry no marker.

**Live pass (dev server, Playwright, the user watching):**
- a bookcase cut Front through a dado;
- a table cut Side through a leg and apron;
- a flipped Top cut;
- a metric project.
Then a real Chromium PDF (`page.pdf()`), read back for page breaks and the look, and judged by the user's eye. Afterwards,
reset `emulateMedia({ media: null })` and delete only the keys the check created.

Performance: one more `drawView` over the piece, plus `sectionCaps` per part, which is cached per part. Measure on the
Shaker table fixture in vitest, with no budget unless the number surprises.
