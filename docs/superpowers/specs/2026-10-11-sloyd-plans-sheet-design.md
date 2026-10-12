# Sloyd — plans sheet (dimensioned drawings) and exploded view

**Date:** 2026-10-11 · **Status:** implemented (2026-10-11); amended during planning (§2.3, §3, §4.1, §4.2, §4.4, §5.3, §7) and after the browser pass (§3 floor lift, §5.3 chain drops), all approved by the user
**Builds on:** the cut list round (the printable overlay, `.app > *` print rule), the per-face
diagrams round (`diagramLabels.ts`, invariant 19), assemblies and components (invariants 45, 46),
mirrored instances (schema 13) and invariants 1, 16, 24, 27, 38 and 43. Every rule there still holds
unless this document says otherwise.

**Origin:** `docs/feature-gaps.md` §2. Dimensioned drawings were the most-cited gap in the research;
the exploded view was asked for in both the viewport and the printed sheet.

## 1. Problem and goal

Sloyd draws each part on its own (the per-part diagrams), but nothing shows the piece as a whole
with its dimensions: where the shelves sit, how tall the base is, how a drawer goes together. At the
bench that means orbiting the model and taping points to read numbers back.

**Goal:** a printable **Plans** sheet with dimensioned elevations of the whole piece and of each
assembly, and an exploded view — on that sheet and live in the viewport.

**The user's rulings, made in conversation:**
- **The printable sheet first** (option A). Live dimension annotations in the viewport are not this
  round.
- **Automatic dimensions now, user-placed later** (option C). Overall and per-assembly overall
  dimensions plus chain dimensions, with a clutter cap. User-placed dimensions (a tool, stored in the
  document, a schema bump) are a follow-up.
- **Exploded view in both places**, exploding **hierarchically** (option B): assemblies move apart as
  units, then the parts inside each spread from that assembly's own centre.
- **A slider** (0–1) in the viewport controls; **the view is read-only while exploded.**

**No schema change.** `CURRENT_VERSION` stays 13; rolling back costs nothing but the round.

## 2. Drawing method — exact hidden-line vector drawings

Every solid is an axis-aligned box after `boardSolids` and `worldSolids`, so an orthographic drawing
is computed exactly, as SVG, with no rendering and no software-GL caveat (26a does not apply).

### 2.1 Inputs

- **Edges** come from `boardEdges` (invariant 16: the lines drawn are the cell-grid lines the viewport
  draws, never per-solid box outlines). Each `Segment` is mapped to world inches by snapPoints'
  `toWorld` (position plus `toWorldOffset` through `axisFrame`). **`toWorld` is exported from
  `snapPoints.ts` as the ONE home of that mapping**; `drawing.ts` must not restate it, and must not
  use `pointToLocalXYZ`/`solidWorldBox` (CENTRE-relative; CLAUDE.md's snapPoints warning).
- **Occluders** are `worldSolids(b)` for every part (invariant 38: the ONE world-solid mapping).
- **Exploded drawings** add each part's offset (§3) to both its edges and its solids before drawing.

### 2.2 Views

A view is an orthographic camera given by `toward` (unit vector from the model TOWARD the viewer),
`right` and `up` (screen axes, unit, orthogonal). World Y is up.

| View | `toward` | `right` | `up` |
|---|---|---|---|
| Front | +Z | +X | +Y |
| Right side | +X | −Z | +Y |
| Top (plan) | +Y | +X | −Z |
| Isometric | (1,1,1)/√3 | (1,0,−1)/√2 | `toward × right`, which points up the screen |

The plan's `up = −Z` puts the piece's front edge at the bottom of the plan, next to the front view,
as third-angle projection expects.

### 2.3 Visibility

*(Amended 2026-10-11 during planning: the first draft used the strict interior of each box shrunk
by `DRAW_EPS`. That calls a mortise wall VISIBLE in an elevation, because `boardSolids` splits a cut
board into abutting boxes and the ray from the wall runs exactly along the seam between two of them,
in neither box's interior. Occlusion must treat the union of solids as solid.)*

A point P is **hidden by box B** when the ray `P + s·toward` travels a positive length inside the
CLOSED box: there is an s ≥ `DRAW_EPS` such that both `P + s·toward` and `P + (s + DRAW_EPS)·toward`
lie in B grown by `DRAW_EPS / 2` on every side (the growth absorbs float drift at seams). On an edge
`P(t) = A + t·(E − A)`, t ∈ [0, 1], that is linear in (t, s), for σ ∈ {0, DRAW_EPS}:

    for each axis i:  lo_i − DRAW_EPS/2 ≤ A_i + t·d_i + (s + σ)·toward_i ≤ hi_i + DRAW_EPS/2
    0 ≤ t ≤ 1,  DRAW_EPS ≤ s ≤ S_MAX

The feasible set is a convex polygon in (t, s). Clip the rectangle [0,1] × [DRAW_EPS, S_MAX] by the
twelve half-planes and take its t-range: **one hidden interval per box, at most.** S_MAX is the
model's bounding diagonal plus 1 (computed, not a magic number).

- An edge's hidden set is the union of its per-box intervals; the visible set is the complement in
  [0,1]. Fragments whose projected length is under `DRAW_EPS` are dropped.
- **No drawing order is involved**, so cyclic overlaps are exact. A painter's algorithm is not an
  acceptable substitute (§7's three-stick test is one no draw order can reproduce).
- **A face's own edges:** an edge on a face that the ray LEAVES through (a front face) is not hidden,
  since the ray spends no length inside. An edge whose ray GRAZES a face parallel to the view (a
  box's back silhouette edge in an elevation, a part's edge lying along a neighbour's face) counts as
  hidden. Its projection lies on that face's projected outline, which is drawn solid wherever it is
  a real edge, so the dashed line is covered by it (hidden is drawn beneath visible, §2.4). Where the
  outline is only a seam between two solids, the ray really is inside the union, and hidden is right.
- `DRAW_EPS = 1e-6` inches, a named constant with this justification in its comment: well above the
  float drift of `position + toWorldOffset` sums at furniture scale, and far below anything visible
  at print scale. It is not `TOUCH` and not `FLUSH_EPSILON`; do not unify them.
- Bounding-box prefilter (a box whose screen rectangle misses the edge's cannot hide it) is a pure
  optimisation and must not change results.
- An edge whose projection has length < `DRAW_EPS` (it runs along `toward`) is skipped.

### 2.4 Output

`drawView(parts, view, offsets?)` *(Corrected at merge: the offsets are the optional third argument.)* returns `{ visible: Seg2[], hidden: Seg2[], bounds }` in screen
inches (`right` and `up` coordinates). Collinear touching fragments of one edge are merged. Elevations
draw `hidden` dashed **beneath** `visible` (so a hidden line coinciding with a visible one is covered
by it). The isometric figure draws `visible` only.

## 3. Exploded offsets — `document/explode.ts`

`explodeOffsets(doc, k): Map<occurrenceId, Vec3>`, pure, k ∈ [0, 1].

- Parts come from `worldParts(doc)`; each part's id is its occurrence path. Its ancestors are read
  with `parentPath`.
- `centre(path)` is the centre of the world bounding box of every part at or below that path; the
  root's centre is that of every part.
- A part at `A/B/p` moves by
  `k·(centre(A) − centre(root)) + k·INNER·(centre(A/B) − centre(A)) + k·INNER·(centre(p) − centre(A/B))`.
  The FIRST term (the top-level item away from the piece's centre) has weight k; every deeper term
  has weight `k·EXPLODE_INNER`. A root-level part takes only its one first term.
- *(Amended 2026-10-11 during planning.)* The first draft used weight k on every term. Those sums
  telescope to `k·(centre(p) − centre(root))`, which is plain radial explode (option A), not the
  option B the user chose. Unequal weights are what make an assembly move out as a unit and then
  open up a little. `EXPLODE_INNER` (initially 0.5, must stay below 1) is tuned by eye in the
  browser pass with the user, as `EXPLODE_SPREAD` is.
- `EXPLODE_SPREAD` maps the slider's 0–1 to `amount = slider × EXPLODE_SPREAD` (initially 1). It is
  applied by the callers; `explodeOffsets(doc, amount)` takes the amount.
- Hidden parts count toward centres (the sheet includes them; the viewport uses the same offsets so
  a part never jumps when another is hidden).
- **Floor lift.** After the offsets are computed, every offset's Y is raised by
  `dy = max(0, assembledMinY − explodedMinY)`, where `assembledMinY` is the lowest `position[1]` over
  all world parts and `explodedMinY` the lowest `position[1] + offset[1]`. The lowest part never goes
  below where the assembled piece's lowest point sits. *(Amended 2026-10-11 after the browser pass,
  by the user's ruling: an exploded view sank parts through the floor.)*
- Cached per (doc object, k) like `worldParts`.

## 4. The viewport exploded view

### 4.1 State

**`explode: number`** is store state, 0 by default: view state, not in the document, not in undo, not
saved. It is store state, not App state like `showGrid`, because the read-only gate (§4.2) must live
in the store.

- **`setExplode(k)`** is its ONE writer. It is refused while `gesturing` (as a hide is, invariant 43),
  and refuses a non-finite value; it clamps to [0, 1]. Moving it off 0 calls `setTool('select')`
  **before** it sets the amount, and that existing blanket clear drops the held points and the tape
  fields with the anchor in the same statement. **No new clearing writer is added**; invariant 24
  says the tape-clear licence "is not to be extended". The new trigger is recorded in the
  enumeration at `tapeHover`'s declaration.
- `replaceDocument` resets it to 0 (a project switch or import starts assembled).

### 4.2 Read-only while exploded

**One gate: `edit()` refuses (returns without effect) while `explode > 0`, and so do `undo` and
`redo`.** UI disabling is a courtesy on top of it, not the enforcement. So no keyboard path, panel
or future caller can edit an exploded model, because nothing that changes the document goes around
`edit()`.

- Selection is allowed (`selectionPatch` is not an edit), and Properties shows values. Properties
  and the guides footer sit in a `<fieldset disabled>` whose title says "Slide Explode back to 0 to
  edit".
- **`setTool` refuses any tool but Select while exploded**, so the M and T keys cannot arm Move or
  Tape. The gizmo is not drawn.
- **`renameItem` returns the STORED name while exploded** (invariant 9: `onCommit` returns the stored
  name; returning the typed one would show a name that was never written).
- The toolbar's Undo and Redo buttons, the project-name input and "+ Add board" are disabled while
  exploded. They read `past`/`future` and call edits directly, so the gate alone would leave them
  looking live.
- Hide and show are allowed. They are view state and go through `applyHidden`, not `edit()`.
- *(Amended during planning.)* *(Corrected at merge: the opener is in `Toolbar.tsx`, and the keydown effect is unchanged; there is no "keydown gate".)* App's keydown effect is NOT changed. Every edit shortcut ends in
  `edit()`, `undo`, `redo` or `setTool`, and each of those refuses, so a keydown branch would be a
  second, redundant gate.
- Generate, Joinery, Refine and Repair create new projects and never adopt (invariant 36); they stay
  available.

### 4.3 Drawing

- `BoardMesh` takes the part's offset and adds it to its group position. Nothing writes a transform
  back (invariant 1).
- Snap markers and guide markers are not drawn while exploded (invariant 16: a marker must sit on a
  feature that is actually drawn, and they are world positions).
- The camera does not re-frame as the slider moves.

### 4.4 Control

An **Explode** range input (0–1, step 0.05) in `ViewportControls`' view group, with its value as a
percentage beside it. *(Amended during planning: the first draft disabled it while `gesturing`, but
invariant 34 forbids any component reading `gesturing`; the store's refusal is the whole rule.)*

## 5. The plans sheet

### 5.1 Opening it

A **Plans** entry beside Cut list (same placement rules as the ui-polish action row). `PlansSheet.tsx`
follows `CutList.tsx` exactly:
- a direct child of `.app`, with `.app-shell` inert behind it;
- `modalOpen` includes it;
- focus on mount, its own Escape, and Print and Close buttons;
- the opener recorded for focus return;
- a print block in `styles.css`, beside the cut list's.

It is derived from the store's document on every render, and it formats nothing itself.

### 5.2 Contents, in order

1. **Exploded view.** The isometric drawing of the whole piece at a sheet-local amount (a range
   input on the sheet, default 0.6, local view state like the cut list's `diagrams` select, hidden
   when printing). Visible lines only, no dimensions.
2. **The whole piece.** Front, right side and plan, in third-angle arrangement: plan above front,
   side to the right of front. The three are drawn at **one shared scale**, chosen so the
   arrangement fits the sheet width, so they align across views. *(Amended 2026-10-12, fu 254, by the
   user's decision: the scale also fits `TRIO_MAX_HEIGHT` = 1250 units down (Letter's printable ratio
   with room for the heading), whichever binds; a figure is drawn at its share of the page width, never
   stretched to 100%, so a tall piece prints on one page. The exploded figure gets the same width rule.)*
3. **Each assembly.** Each `Definition` is drawn once, ordered by first placement in `worldParts`
   order, from its own parts in its own local frame (`partsBelow(doc, definition)`). It is titled with
   its first placement's flat display name, "× N" when placed N times (`placementsOf`), and "(one copy
   mirrored)" / "(N copies mirrored)" when any placement is mirrored. It gets its own front, side and
   plan at its own shared scale.

Hidden parts are included everywhere (invariant 43: hidden-ness never reaches the sheet, cut list,
joinery or export). An empty document shows "Nothing to draw yet."

### 5.3 Dimensions — `document/dimensions.ts` and `panels/planDims.ts`

*(Amended during planning: `labelWidth` lives in `panels/diagramLabels.ts` and `document` must not
import `panels`.)* So the work is split the way the diagrams already split it:
- **`document/dimensionView(parts, view, precision)`** builds the overall dimension and the collapsed
  chain, with every string. It imports `units` (`formatLength`) because it produces strings a person
  reads (the `→ units` edge rule); `drawing.ts` and `explode.ts` do not.
- **`panels/fitChain(axis, scale)`** measures those strings, then drops, caps and writes the notes.

- **Overall:** the view's full horizontal extent below the view, and its full vertical extent to the
  right. On the front these are width and height, on the side depth and height, and on the plan width
  and depth.
- **Chain:** along each screen axis, the distinct coordinates of every part's min and max on the
  world axis that screen axis shows (cuts ignored; parts, not solids). They are sorted, and a
  coordinate whose distance from the last kept one **formats** to `0"` at the document's precision
  is skipped. **The maximum always survives**: if it was skipped, it replaces the last kept
  coordinate, so the chain still sums to the overall. A chain of one segment is the overall, so it
  is not drawn. The segments form a chain above (horizontal) or to the left (vertical) of the view.
- **Fitting:** each segment's label string is built here and measured with `labelWidth`
  (invariant 19: the measured string is the drawn string, assembled in the module that builds it).
  A segment whose label does not fit its drawn length plus a margin is **dropped** (no label, no
  ticks).
- **Clutter cap:** if more than `CHAIN_MAX = 12` segments remain, the whole chain on that axis is
  omitted and only the overall dimension is drawn. *(Amended 2026-10-11 after the browser pass, by
  the user's decision: on casework the one-third arm omitted every chain, because panel thicknesses
  leave many unlabelable gaps. Narrow segments are now dropped individually and noted.)*
- **Nothing disappears silently.** `DimensionSet.notes` carries "Chain omitted: too dense" or
  "N small spacings not labelled", rendered under the view. *(Corrected at merge: the notes come from `fitChain` in
  `panels/planDims.ts` and read "<Axis> chain omitted — too dense" / "N small <axis> spacing(s) not labelled"; there is no
  `DimensionSet.notes`.)*
- **Exactness:** segment values are differences of exact stored coordinates (no rounding before
  formatting; invariant 25's spirit: round only what is displayed). Overall = max − min, exact.
- Strings use `formatLength` at `doc.units.precision`, so a dimension reads the same here as on the
  cut list.

### 5.4 Rendering

`PlanFigure.tsx` *(Corrected at merge: the component file is `PlanFigure.tsx`, not `PlanView.tsx`.)* renders one view as an `<svg>`:
- the drawing's hidden (dashed) and visible segments;
- the dimension lines, with extension lines, ticks and labels;
- the notes.

`LABEL_SIZE` is set as the `<svg>` attribute, as in the diagrams; CSS never sets a font-size on its
text, and `--font-num` stays monospace (invariant 19). Line weights: visible 1.5, hidden 1 with a
dash, dimensions 0.75, in SVG user units at a fixed `vector-effect: non-scaling-stroke`.

## 6. Modules and layers

| Module | Layer | Job | Imports `units`? |
|---|---|---|---|
| `document/explode.ts` | document | §3 offsets | no |
| `document/drawing.ts` | document | §2 projection + hidden lines | no |
| `document/dimensions.ts` | document | §5.3 strings + collapse | **yes** |
| `document/plans.ts` | document | the assemblies to draw: order, title, copies, mirrored count | no |
| `panels/planDims.ts`, `panels/planLayout.ts` | panels | §5.3 fitting; the third-angle layout and scale | — |
| `snapPoints.ts` | document | exports `toWorld` (no behaviour change) | no (unchanged) |
| `store/store.ts` | store | `explode`, `setExplode`, the `edit`/`undo`/`redo` gate | — |
| `viewport/BoardMesh.tsx`, `Viewport.tsx` | viewport | offsets; markers hidden; gizmo/tools off | — |
| `panels/ViewportControls.tsx` | panels | the slider | — |
| `panels/PlansSheet.tsx`, `panels/PlanFigure.tsx` *(Corrected at merge: was `PlanView.tsx`)* | panels | §5 | — |
| `App.tsx`, `Toolbar.tsx`, `styles.css` | — | opener (in `Toolbar.tsx`), `modalOpen`, print block *(Corrected at merge: no keydown gate)* | — |

`panels` must not import from `viewport` (as now).

## 7. Testing

**Unit tests** (Vitest). Each is mutated to show it can fail (working agreement; fu 155).
Expected values are computed by hand in the test, never by calling the code under test.

- **`drawing.ts`:**
  - **A box alone, front view:** its four front edges are visible; the four back edges graze and
    are hidden (§2.3), beneath the visible ones; the four depth edges are skipped.
  - **A box behind a box:** the hidden length is hand-computed. Mutate by moving the front box out
    of the way; the rear box's hidden length falls by the hand-computed amount.
  - **Flush faces:** a board stacked on another, isometric. The joint line on the near faces stays
    visible; the lower board's far top edges are hidden by the upper one. The total visible length
    is hand-computed.
  - **Three-stick cycle** *(replaces the pinwheel, amended during planning: four flat boards at one
    height need not form a cyclic depth order)*. Three sticks along X, Y and Z, each in front of the
    next, viewed isometrically. Every stick is partly hidden, which no draw order can produce,
    because whichever is drawn last comes out whole. Each crossing is hand-derived.
  - **Mortise:** a leg with a mortise, front view, gives dashed lines at the mortise's hand-computed
    position.
  - **Pose coverage:** a quarter-turned part and an on-edge part (a pose whose `axisFrame` reverses an
    axis), with coordinates hand-derived, per the snapPoints rule. The `chiralPart` fixture is used
    so a mirrored mapping shows.
  - **Mirrored instance:** a part drawn through a mirrored placement matches its hand-reflected
    coordinates.
- **`explode.ts`:** expected offsets are written as hand-derived vectors combined with
  `EXPLODE_INNER`, so tuning it by eye does not quietly break them.
  - Hierarchy is not radial: a nested part's offset differs from `amount·(centre(p) − centre(root))`.
  - k = 0 gives all zero offsets.
  - Offsets are linear in k.
  - All parts of one assembly share its assembly-level term.
  - A nested assembly gets all three terms, hand-computed.
  - A flat document reduces to radial explode.
  - Hidden parts are counted.
- **`dimensions.ts`:**
  - The chain sums to the overall (both values hand-computed, never read from the code under test).
  - Collapsing happens at display precision.
  - A too-narrow label is dropped, with its note.
  - The cap fires on count. *(Corrected at merge: the fraction arm was removed in F1.)*
  - `CHAIN_MAX` is a strict bound: 12 segments are kept and 13 are omitted.
  - A rotated part contributes its WORLD extent.
- **`store.ts`:**
  - Every refusal is asserted as "no undo entry was pushed", never by reading a flag (invariant 34):
    - `edit` refused while exploded;
    - `undo`/`redo` refused;
    - `setExplode` refused while gesturing.
  - Leaving 0 clears the held points.
  - `replaceDocument` resets the amount.
  - Selection and hide still work while exploded.
- **Panels:**
  - `PlansSheet`: sections in order; "× N" and the mirrored note; the empty state; Escape and focus;
    the sheet-local amount re-renders the figure.
  - `ViewportControls`: the slider calls `setExplode`.
  - `Properties`: disabled while exploded, with its title.

**Browser pass** (dev server, Playwright; recorded in `docs/browser-verification-plans-sheet.md`).
`EXPLODE_SPREAD` is tuned there by eye with the user.
- **Viewport slider:** the hierarchy reads correctly on a generated table and on a cabinet with a
  drawer assembly.
- **Read-only lockout:** each path tried — gizmo, Move, Tape, Properties field, Delete, Ctrl+Z.
- **Plans sheet:** at screen size and under `emulateMedia('print')`.
- **Not verified:** a real print-to-PDF, for the reason fu 70/79/84 give. Recorded, not promised.

## 8. What does not change

- The document and the schema.
- `worldParts`, `flatDocument`, the cut list, the nesting, the per-part diagrams.
- Generate, joinery, refine and repair.
- Invariant 24's existing clearing rules. One reason is added (§4.1); none are removed.

## 9. Out of scope — recorded as follow-ups when the round ships

- Numbered callouts linking the exploded figure to cut-list rows.
- User-placed dimensions: a dimension tool, stored in the document, a schema bump.
- Section views (a clipping plane).
- Exploding along each joint's engagement direction (option C).
- Live dimension annotations in the viewport (option B of the first question).
- A real print-to-PDF check.
