# Sloyd — placed dimensions (fu 253)

Date: 2026-10-31. Status: **draft, awaiting the user's approval.**

The user picked fu 253 on 2026-10-31 and skipped the design questions ("skip the questions, go straight to the
spec"). Every open call below is **Claude's call**, marked **(call)**, for the user to override while reading. §13
lists them.

## 1. Intent

The Plans sheet's dimensions are all automatic (`document/dimensions.ts`): each view gets an overall size per axis and
a chain through every part edge. When the measurement a woodworker needs at the bench is not one of those (a shelf's
height above the floor, the gap between two drawer runners, a hole row's distance from the top), the sheet cannot show it.
The Tape tool can measure it in the viewport, but the reading is lost as soon as you stop measuring.

This round lets you **keep a measurement as a dimension**. It is stored in the project, drawn in the viewport, listed
so it can be removed, and printed on the Plans sheet. A placed dimension stores **what it measures**: two anchored
points and an axis. It never stores a number. When a part is moved, turned or resized, the dimension follows the part
and reads the new value.

### Goals

- Keep a Tape measurement as a dimension: one key, one undo entry.
- Anchors follow their part: a corner, edge midpoint or face centre (the box lattice) follows a resize too; any
  other part point (a cut corner, a hole centre) moves and turns with its part.
- Draw placed dimensions in the viewport, list them, delete them.
- Print them on the Plans sheet in the piece's orthographic views, beyond the automatic dimensions.
- Nothing silently disappears. A dimension whose part was deleted is not drawn, and the list and the sheet both say so.

### Non-goals (v1)

- No dragging a dimension's offset or label. The sheet lays placed dimensions out itself, as it does the automatic ones (§6).
- No aligned (slanted) dimensions: every dimension measures along world X, Y or Z.
- No angle, radius or diameter dimensions.
- No placed dimensions on the assembly figures, the ISO, the exploded figure or the section figure: the piece's three views only.
- No choosing the view a dimension prints in: a fixed rule per axis (§6.1).
- No editing an anchor. You delete the dimension and keep a new one.
- No selecting a dimension in the viewport (no click-select, no Properties panel). The list is how you manage them.
- Generate and Refine neither author nor carry dimensions (§8).
- No automatic (live) dimensions in the viewport. That is fu 258, a separate feature.

### Anti-goals

- **A number that is wrong without saying so.** A dimension's value is always computed from its anchors as they are
  now, never stored. A dimension that cannot be resolved is not drawn, and that is SAID.
- A dimension that silently stops tracking its part. That would be a world point where a part point was meant.
- A dimension-free project whose sheet or file changes by a byte.
- Rounding: the anchors are snap points, exact; the value is formatted for display only (invs 18, 25, 52).

## 2. The document — schema 33

```ts
/** Where one end of a placed dimension sits (placed-dimensions spec §2). */
export type DimAnchor =
  /** A box-lattice point of a part: each of the part's OWN dimensions (length, width, thickness) at 0, ½ or 1 of it. */
  | { part: string; frac: { length: 0 | 0.5 | 1; width: 0 | 0.5 | 1; thickness: 0 | 0.5 | 1 } }
  /** Any other point on a part, in the part's own space, inches from its min corner (the `Point` of `snapPoints.ts`). */
  | { part: string; local: { length: number; width: number; thickness: number } }
  /** A fixed world point, inches (a guide point, a line, a crossing, a stepped offset). */
  | { at: [number, number, number] };

export interface PlacedDimension {
  id: string;
  a: DimAnchor;
  b: DimAnchor;
  /** The world axis the dimension measures along. */
  axis: TapeAxis;
}

// SloydDocument gains:
  /** Placed dimensions (schema 33), in the order kept. */
  dimensions: PlacedDimension[];
```

- `part` is the part's **flat path id**, the `id` of its entry in `worldParts(doc)` (instance ids and the board id
  joined by `PATH_SEPARATOR`). Ids, not names, so a rename changes nothing.
- `frac` and `local` are keyed by `Dimension` (`'length' | 'width' | 'thickness'`); `local` IS a `Point` (`cuts.ts`).
- The value is `|resolve(b)[axis] − resolve(a)[axis]|`. It is never stored (anti-goal 1).
- The document always carries `dimensions` (`[]` when there are none), as it does `guides` and `views`.

### 2.1 Resolving an anchor: ONE home

`document/placedDims.ts` `resolveAnchor(parts, anchor)` is the only place an anchor becomes a world point. `parts` is
`worldParts(doc)`, read once per render. It returns a point or `null`.

- `frac`: find the world part by id. Its local point is `frac[dim] × size[dim]`, using `geometryBoard`'s size (the
  same size the lattice uses in `preLeanSnapPoints`). That point goes through `toWorld(board, p)`, the one part→world
  mapping (inv 44), which composes the lean (inv 57 R1).
- `local`: find the part and return `toWorld(board, local)`.
- `at`: return the point as stored.
- A missing part returns `null`, and the dimension is **detached**.

A frac anchor follows a resize: a corner stays the corner. A local anchor stays at its station from the part's min
corner, which is how the features it sits on behave under a resize (inv 56). Both follow moves, turns, mirrors and leans,
because `worldParts` composes them and `toWorld` reads `axisFrame`.

### 2.2 Making an anchor from a snap point: ONE home

`placedDims.ts` `anchorFor(parts, p: SnapPoint): DimAnchor` handles the three kinds of point:

- **Board-owned** (`owner.type === 'board'`): take the point's own coordinates on its part, `fromWorld(board, p.at)`.
  If every coordinate is within `1e-9` of 0, half the size or the full size on its dimension, the anchor is `frac`.
  Otherwise it is `local`. The test is geometric, not by `kind`, because a hole centre is also a `face-center`. **(call)**
- **A stepped offset** (`kind: 'offset'`): `at`. It sits in air beside its root point. **(call)**
- **Guide-owned**: a guide point, a line, a crossing, or a line-face hit (`owner.board`): `at`. A line-face hit
  belongs to its line (inv 26), so it does not follow the part either. **(call)**

`resolveAnchor(anchorFor(p)) ≈ p.at` within `1e-9` for every board-owned point `boardSnapPoints` produces. A test
asserts this over the fixture shapes: turned, mirrored, leaning (`chiralPart`), holed, cut.

### 2.3 Load: validate, repair ids, never repair references

- **v32→v33 step**: none. An absent `dimensions` loads as `[]`, the same as `views` at v29.
- **`validateDimensions`** drops a malformed entry: a non-string id, an `axis` other than x/y/z, an anchor that is
  none of the three shapes, a `frac` value other than 0, 0.5 or 1, or a non-finite number. A well-formed entry is
  KEPT, even when its part is gone (Versioning: "A malformed entry is DROPPED; a faulted but well-formed one is KEPT").
- **Ids** go through `takeId` in their own scope. The first keeps its id and a later duplicate is re-minted (inv 33).
- **A `part` reference is never repaired or dropped on load.** It is a hint resolved at read time, the
  `views[].hidden` exception inv 33 already names, so the single-pass repair is not broken. Inv 33's text gains
  "and placed dimensions' `part`".
- `migrateDocument`'s refusal gate is the schema check, as for every bump.

### 2.4 The bump, argued for this field

A schema-32 build (`4635ae34`) loading a schema-33 file would refuse it. Without the bump it would load the file,
rebuild the document field by field without `dimensions`, and on the next autosave write the project back **without
its dimensions**, with no word. That is a silent loss of the user's work, so the gate is needed. Confirmed against the
code: `migrateDocument` builds the document as a fresh literal of the known fields (`document.ts`, the `let doc:
SloydDocument = { … }` after validation), so an unknown top-level field is dropped.

Rollback cost: the nearest refusing boundary becomes `4635ae34` (schema 32). It refuses every project saved at 33,
so export first.

## 3. Keeping a dimension: the Tape tool

There is no new tool. A dimension is a Tape measurement you keep. **(call)** The Tape tool already picks two snap
points (`tapeAnchor`, then `tapeHover`), and X/Y/Z already lock an axis (`tapeAxis`).

- **D** while the Tape tool has an anchor and a hover point keeps a dimension from the anchor to the hover point. The
  key goes in `App`'s ONE keydown effect, which already takes the modal flag (inv 27). The modifier test is part of the
  condition. **The builder checks that `TapeReadout`'s typed capture never takes `d`.**
- **Which axis:**
  - with an axis locked, that axis;
  - otherwise, the one world axis the two points differ on;
  - if they differ on two or three axes with none locked, D refuses: "Lock an axis (X, Y or Z) to keep a dimension."
    Guessing the axis would print a number the user did not mean (anti-goal 1). **(call)**
- **Refusals**, said in the readout's message line and decided before `edit()`:
  - a zero value along the axis: "The two points are level along X." (and so on for Y and Z);
  - exploded (`edit()` refuses, inv 47; the Tape tool is not available there anyway).
- **A typed offset** (digits in the readout) does not join the gesture in v1. D keeps the hover point as it is.
- **`addDimension(a, b, axis)`** in the store: one `edit()`, one undo entry. `a` and `b` come from `anchorFor`,
  computed from `worldParts` of the document being edited.
- **The tape is untouched.** The anchor and hover stay held after D, so you can keep a chain of dimensions from one
  anchor. None of inv 24's three reasons to drop a held point applies: nothing moved, no feature went, nothing was
  retargeted.
- The readout's hint line gains "D keeps it as a dimension" while D would succeed. Wording: the builder's call, under
  the copy review.

## 4. Drawing in the viewport

A new `viewport/PlacedDims.tsx`, mounted beside `GuideLines`:

- For each resolvable dimension, draw the measured segment from `A` along the axis to `A′`, where `A′` equals `A` with
  `B`'s coordinate on the axis. Add a thin dashed extension leg from `A′` to `B` when they differ. Each end of the
  segment gets a short tick across it.
- The label is the value through `formatLength(value, doc.units)`, placed at the segment's midpoint. Use the same
  label mechanism the Tape tool's readout marker uses, whatever that is today. Builder's call.
- One colour for every placed dimension, distinct from guides and the tape. Picked by eye with the user
  (memory: the user judges visual changes by eye).
- **Not drawn:**
  - while exploded (the explode offset is render-time, and the anchors would sit on the unexploded parts);
  - a detached dimension;
  - a dimension with an anchor on a hidden part (draw-only, inv 43; the sheet still prints it).
- Not pickable and not a snap source, as the Tape's own line is not. **(call)**
- **The section cut**: drawn regardless. A dimension is an annotation, not wood.

## 5. The Dimensions list

A `Dimensions · N` footer list, beside Guides and Views, using the same component patterns (`GuidesFooter`,
`ViewsFooter`). It shows only when N > 0. Each row reads:

- **axis and value**: `X 23 1/2"`, using `formatLength`;
- **what it spans**: the part display names of both ends (`Left side › Leg to Top`), or `a point` for an `at`
  anchor, through `flatDocument`'s path names (inv 46);
- **`✕`**: deletes it. One `edit()`, one undo entry.
- **Hover** highlights the dimension in the viewport (`hoveredDimension`, store view state, never saved). **(call)**
- **A detached row** reads `(part deleted)` and stays deletable.
- **A row on a hidden part** reads `(hidden)`.

Rows are listed in stored order. The list sits inside `EditLock` like the Guides list, so ✕ is disabled while exploded.

## 6. The Plans sheet

Placed dimensions print in the **piece's** trio only (`PlanTrio` for the whole piece, as construction lines are,
§1 non-goal), and always. They are document data the user chose to keep, so there is no checkbox. **(call)**

### 6.1 Which view

| Axis | View | Direction on the paper |
|---|---|---|
| X | Front | horizontal (`right`) |
| Y | Front | vertical (`up`) |
| Z | Side | horizontal (`right`, which is −Z) |

**(call)** Front shows width and height, and Side is the only other view where depth reads horizontally. Plan (Top)
gets none. Choosing the view per dimension is a follow-up.

### 6.2 Where

Placed dimensions draw on the **same side** of the view as that axis's automatic overall dimension, in **rows beyond
it**. Each dimension is an interval `[lo, hi]` along the view direction, so:

- **Packing**: sort by `lo`, then by `hi`, then by stored order. Place each in the first row whose last interval ends
  before its `lo`. A gap of at least a label's width plus `DIM_LABEL_PAD` is required, so two labels never touch.
  Otherwise open a new row.
- **Extension lines** run from each anchor's projection to the dimension's row, the way the automatic dimensions' do.
- **Labels**: `formatLengthBare(value, units)`. Inv 19: the string is assembled in `document/placedDims.ts` (a
  `placedDimLines(doc, view)` returning `{ from, to, a, b, label }`) and measured by `labelWidth` in the panel layer,
  never rebuilt in the component.
- **A label wider than its span** sits outside the span, just past `hi`. The dimension is still drawn, never dropped:
  the user placed it. Packing reserves the label's room past `hi` for that row.
- **Space**: the rows count in the trio's layout bounds (`planLayout` / `trioScale`), so the figure is scaled to fit
  them. **A sheet with no placed dimensions is byte for byte as before** (pinned by a test, as `drawingIdentity` and the
  construction-lines checkbox are).

### 6.3 What the sheet says

- A detached dimension is not printed. One note under the piece's trio says "1 placed dimension not drawn — its part
  was deleted" (plural as needed). This follows the `fitChain` notes pattern: nothing disappears silently.
- An `at`-only dimension (both ends fixed world points) prints like any other.
- Metric prints bare mm, under the sheet's one `Dimensions in mm` note (inv 52).

## 7. Edits that touch anchors

- **Group and Ungroup** change flat paths but move nothing. Every `part` in `dimensions` is RE-KEYED with the same
  `rekey` in the same edit, so the dimension follows its part. (Hidden ids are re-keyed in view state; dimensions are
  document data, so they are re-keyed in the document passed to `edit()`.) A test pins a dimension surviving a
  Group/Ungroup round trip with the same value.
- **Deleting a part** leaves its dimensions **detached**, and they stay listed. **(call)** The store does not hunt
  dimensions down on every path that removes a part: there are many (delete, definition edits that remove a part from
  every copy, Ungroup's dissolve), and missing one would leave a silent dangling reference anyway. A detached row is
  visible and deletable, and undoing the delete re-attaches it, because the id comes back.
- **Duplicate, Copy in a row, Link, Stretch, Align** create or move parts. They never copy, move or re-anchor a
  dimension. A dimension follows its anchor's part wherever these put it.
- **Joinery and Repair** run on `flatDocument` and map back by index (inv 46). A part keeps its id, so anchors stay.
  A joint that cuts into an end can move a `local` anchor's feature, and the dimension then reads the anchor's
  station as stored. Accepted, as for any `local` anchor under a resize. **(call)**
- **Undo and redo** restore the document, so they restore dimensions too.

## 8. Generate, Refine, projects

- Generate's output starts with `dimensions: []`, and the design schema stays byte-identical (inv 48, fu 322).
- **Refine's result starts with no dimensions. (call)** Refine re-mints the parts, so every `part` would dangle. It
  carries `guides` (world points) but not `views`, and dimensions follow `views` here. Carrying them by flat name is a
  follow-up.
- Duplicate project, export and import carry `dimensions` as part of the document (storage seam, unchanged).

## 9. Invariant 65 (new), condensed for CLAUDE.md

> **65. A placed dimension stores WHAT it measures, never its value: two anchors and a world axis (schema 33).**
> `placedDims.ts` holds the ONE resolver (`resolveAnchor`) and the ONE snap-point→anchor converter (`anchorFor`).
> A lattice anchor is a FRACTION of the part's own size and follows a resize. Any other part anchor is LOCAL to its part.
> A guide-owned or offset anchor is a world point. A `part` reference is a hint resolved at read time, never repaired
> on load (inv 33). Group and Ungroup re-key it in the same edit. A detached dimension is drawn nowhere, and the list
> and the sheet SAY so. A dimension-free document and sheet are byte for byte as before. **PROHIBITION: never store a
> dimension's value, and never resolve an anchor anywhere but `resolveAnchor`.**

`docs/invariants.md` takes the full text. CLAUDE.md takes the condensed form and an inv 33 amendment, `versioning.md`
a v33 row, `module-map.md` the new files, and `rounds.md` the round.

## 10. Testing

TDD for the pure modules. The viewport is checked in the browser (no unit tests, by design).

- **`placedDims.ts`**:
  - the `anchorFor` round trip (§2.2) over turned, mirrored (instance and own mirror), leaning, holed and cut fixtures;
  - a frac anchor follows a resize, and a local one keeps its station;
  - a missing part returns `null`;
  - the value is never stored. Type-level: the interface has no value field. Behavioural: a resize changes the label.
- **Axis choice and refusals**: each refusal is pinned and **mutation-tested** (the working agreement). Remove the
  oblique refusal, and a test must fail.
- **Load**:
  - each malformed shape is dropped;
  - a well-formed entry with a missing part is kept;
  - takeId re-mints the second duplicate;
  - a v32 file loads with `[]`;
  - a v34 file is refused.
- **Group/Ungroup re-key**: the same value after each, and after a round trip.
- **Sheet**:
  - with no dimensions, byte for byte as before;
  - the axis→view table;
  - packing: two non-overlapping dimensions share a row, two overlapping ones do not;
  - a label wider than its span is drawn past `hi`, never dropped;
  - the detached note;
  - metric bare mm.
  - The packing's "never touch" bound is checked against a width the code under test does not compute (inv 23's
    lesson).
- **Store**:
  - `addDimension` makes one undo entry;
  - the tape's anchor and hover are kept after D;
  - ✕ makes one undo entry;
  - refused while exploded.
- **Browser check** (dev server, the user's Chrome), `docs/browser-verification-placed-dimensions.md`:
  1. keep an X, a Y and a Z dimension;
  2. the oblique refusal, then the same points with X locked;
  3. resize the part and see the dimension follow;
  4. turn and move the part;
  5. a dimension to a hole centre;
  6. delete the part to see the detached row, then undo to see it re-attach;
  7. Group/Ungroup;
  8. the Plans sheet: rows, the label past the span, the print preview;
  9. metric;
  10. hidden;
  11. exploded;
  12. reload (autosave).

  The colour is judged by eye.

## 11. Rollout

One branch, merged locally (`--no-ff`), deployed per `DEPLOYMENT.local.md`. Verified by bundle hash and CSP, and by
loading the page only on production. Rollback: `4635ae34` refuses schema 33 projects, so export first.

## 12. Left to the builder

- Label rendering in the viewport, the tick size and the extension-leg dash.
- The list's exact layout and its place among the footers.
- The hint wording (the copy review).
- `PlanFigure`'s internals for the rows.

## 13. Claude's calls, for review

1. No new tool: **D in the Tape tool** keeps the measurement (§3).
2. **Three anchor kinds**: a lattice point follows a resize, any other part point keeps its station, a guide or
   offset point is fixed in the world (§2).
3. **The oblique case refuses** unless an axis is locked. No guessing (§3).
4. **Deleting a part detaches** its dimensions rather than deleting them (§7).
5. **Fixed view per axis**: X and Y in Front, Z in Side. The sheet lays them out; no dragging (§6).
6. **Always printed**, with no checkbox (§6).
7. **Not drawn in the viewport while exploded or on a hidden part.** Still printed (§4).
8. **Refine starts without dimensions** (§8).
9. **Hover highlight** from the list; no viewport selection (§5).

## Follow-ups this round will record when it ships

- Choosing the view a dimension prints in, and placed dimensions on assembly figures.
- Dragging a dimension's row or offset on the sheet or in the viewport.
- Aligned, angle, radius and diameter dimensions.
- Selecting a dimension in the viewport.
- Refine carrying dimensions by flat name.
- A typed offset joining D.
