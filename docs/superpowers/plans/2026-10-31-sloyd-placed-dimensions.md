# Placed dimensions (fu 253) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a Tape measurement as a stored dimension (schema 33). It is drawn in the viewport, listed so it can be
deleted, and printed on the Plans sheet's piece trio. Its value is always computed from two anchors that follow their parts.

**Architecture:**
- **Document layer.** A new pure module, `document/placedDims.ts`, holds the anchor model, the ONE resolver
  (`resolveAnchor`), the ONE snap-point→anchor converter (`anchorFor`), the D decider (`dimensionAxis`), the re-key, and
  the sheet's projected lines.
- **Store.** It gains `addDimension`/`removeDimension` and two view-state fields.
- **App.** The keydown effect gains D.
- **Viewport.** A new `PlacedDims.tsx` draws the dimensions.
- **Panels.** A Dimensions footer lists them. On the sheet, `planDims.ts` packs placed dimensions into rows and
  `planLayout.ts` makes room for the rows.

**Tech Stack:** TypeScript, React, Zustand, react-three-fiber, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-31-sloyd-placed-dimensions-design.md` (approved 2026-10-31). Read it whole before any task.

## Global Constraints

- `CURRENT_VERSION` 32 → **33**. The document always carries `dimensions: PlacedDimension[]` (`[]` when none).
- The value is NEVER stored. It is always `|resolve(b)[axis] − resolve(a)[axis]|`.
- `DIM_EPS = 1e-9`, the ONE tolerance for "on a lattice point", "differ" and "zero", exported from `placedDims.ts`.
- Anchor `part` = the part's `worldParts(doc)` id (flat path). It is never repaired or dropped on load. Group and
  Ungroup re-key it in the same edit.
- Lengths become text only through `units/length.ts`:
  - the viewport and the list use `formatLength(v, doc.units)`;
  - the sheet uses `formatLengthBare(v, units)` (inv 52).
- Inv 19: sheet label strings are built in `document/placedDims.ts` and measured with `labelWidth` in `panels/`.
  Components never rebuild them.
- A sheet with no placed dimensions is byte for byte as before.
- Exact copy (fixed by the spec):
  - `Lock an axis (X, Y or Z) to keep a dimension.`
  - `The two points are level along X.` (Y and Z alike)
  - list rows `(part deleted)` and `(hidden)`
  - sheet note `1 placed dimension not drawn — its part was deleted` / `N placed dimensions not drawn — their parts were deleted`
  - footer heading `Dimensions · N`
- No pull requests: branch `placed-dims`, merged locally `--no-ff`.
- `npm test` does not typecheck. Run `npm run build` at the end of every task.
- Mutate every refusal and ordering test (working agreement). Note the mutation in the commit body.

## Review Focus

1. **A leaning part's anchor.** `fromWorld`/`toWorld` round-trip noise of about 1e-15 must not turn a lattice
   corner into a `local` anchor, and must not make a vertical dimension on a splayed leg read as oblique. Owned by
   Tasks 2 and 4 (tests below).
2. **A dimension whose anchor is a hidden assembly's part, and a dimension on a part inside a copied assembly.**
   - A hidden assembly's part: the viewport hides the dimension when the PART is not visible (by `store/visibility.ts` `visibleBoards`, as the viewport does for parts).
   - A copied assembly: the path names one copy only, so the dimension does not follow the other copies.
   - Owned by Task 5 (the visibility test) and Task 2 (the path test).
3. **Undo across delete.** Delete a part, then undo: the dimension re-attaches with the same value. Owned by Task 3.
4. **Group then Undo.** The re-key is inside the one undo entry, so undo restores the old paths together with the old
   tree. Owned by Task 3.
5. **The sheet with a dimension much shorter than its label at a small scale** (a 1/4" gap on a 7' cabinet). Its label
   sits past `hi` and never overlaps the next dimension in its row. Owned by Task 6.

---

### Task 1: Schema 33 — types and load

**Files:**
- Modify:
  - `src/document/types.ts` (beside `GuidePoint`; `SloydDocument`)
  - `src/document/document.ts` (`CURRENT_VERSION`; `createDocument` ~l.380; the v29 comment block ~l.252 gains a v33
    line; a new `validateDimensions` beside `validateViews` ~l.980; the literal ~l.1409)
  - every other `SloydDocument` literal `npm run build` names (`generate/generated.ts` and test fixtures): add `dimensions: []`
  - `docs/versioning.md`: a v33 row, with spec §2.4's argument
- Test: `src/document/document.test.ts` (or the file where the `validateViews` tests live; follow it)

**Interfaces:**
- Produces:
  - `type DimFrac = 0 | 0.5 | 1`
  - `type DimAnchor = { part: string; frac: Record<Dimension, DimFrac> } | { part: string; local: Point } | { at: [number, number, number] }`
    - `Point` from `cuts.ts` is `Record<Dimension, number>`
  - `interface PlacedDimension { id: string; a: DimAnchor; b: DimAnchor; axis: TapeAxis }`
  - `SloydDocument.dimensions: PlacedDimension[]`
  - `validateDimensions(raw: unknown): PlacedDimension[]`

- [ ] **Step 1: Write the failing tests**
  - A v32 file with no `dimensions` loads with `dimensions: []` at `version: 33`.
  - A well-formed entry of each anchor kind round-trips through `migrateDocument` unchanged.
  - Each malformed entry is dropped and its well-formed neighbour kept, one case per bullet of spec §2.3:
    - a non-string id;
    - `axis: 'w'`;
    - an anchor `{}`;
    - `frac.length: 0.25`;
    - `local.width: NaN`;
    - `at` of length 2;
    - a `part` that is not a string.
  - An entry whose `part` names no part is KEPT (`toEqual` the input).
  - Two entries with id `d1`: the first keeps `d1` and the second is re-minted (`not.toBe('d1')`, no `/`).
  - A `version: 34` file is refused with `DocumentError`.
  - `createDocument().dimensions` is `[]`.
- [ ] **Step 2:** `npx vitest run src/document/document.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the types and `validateDimensions`.
  - Ids go through `takeId(raw, seen)` with a fresh `seen` scope for dimensions.
  - An anchor is exactly one of the three shapes. An object carrying both `frac` and `local` is malformed.
  - Bump `CURRENT_VERSION` and add `dimensions` to every literal.
- [ ] **Step 4:** `npx vitest run src/document` PASS, then `npm run build` PASS.
- [ ] **Step 5:** Commit `feat(document): schema 33 — placed dimensions on the document (fu 253)`.

### Task 2: `placedDims.ts` — resolve, convert, decide, re-key

**Files:**
- Create: `src/document/placedDims.ts`, `src/document/placedDims.test.ts`

**Interfaces:**
- Consumes: Task 1's types.
- Also consumes:
  - `toWorld` and `fromWorld` (`snapPoints.ts`);
  - `geometryBoard` (`resolveAnchor`'s size for a `frac` anchor is `geometryBoard(board)[dim]`, the board the
    lattice in `preLeanSnapPoints` is built from);
  - `worldParts` (`tree.ts`);
  - `Rekey` (`treeOps.ts`).
- Produces:
  - `DIM_EPS = 1e-9`
  - `resolveAnchor(parts: readonly Board[], a: DimAnchor): [number, number, number] | null`
  - `anchorFor(parts: readonly Board[], p: SnapPoint): DimAnchor`
  - `dimensionValue(parts: readonly Board[], d: PlacedDimension): number | null` (`null` = detached)
  - `dimensionAxis(a: Vec3, b: Vec3, locked: TapeAxis | null): { axis: TapeAxis } | { refusal: string }`, the ONE D decider, returning the exact copy
  - `rekeyDimensions(doc: SloydDocument, rekey: Rekey): SloydDocument`, which returns `doc` itself when nothing changed (as `rekeyViews`)

- [ ] **Step 1: Write the failing tests**
  1. **Round trip.** For EVERY point of `boardSnapPoints(b)`, `resolveAnchor(parts, anchorFor(parts, p))` is within
     `DIM_EPS` of `p.at`. Run it over:
     - a plain part;
     - a turned part (rotation 90);
     - a posture-changed part;
     - `chiralPart` with an own mirror;
     - a part in a mirrored instance;
     - a leaning part (`lean`, square-set);
     - a holed part;
     - a part with a rectangular cut and an angle cut.

     Reuse the existing fixtures (`turnFixtures.ts`, `treeFixtures.ts`).
  2. **Lattice vs local.**
     - Every pure lattice point of the leaning part yields `frac`, never `local` (Review Focus 1).
     - A cut's floor corner yields `local`.
  3. **Resize.** Resize the part's `length` by +6.
     - A `frac` max-end corner resolves 6 further along.
     - A `local` anchor resolves to the same part-space station (`fromWorld` equals the stored `local`).
  4. **Missing part.** `resolveAnchor` returns `null` for a part id not in `parts`, and `dimensionValue` returns `null`.
  5. **Copies.** A part path inside one placement of a definition placed twice resolves on THAT copy only (a test
     against the other copy's corner).
  6. **Guide-owned and offset points** each yield `{ at }`. A line-face hit (`owner.board` set) also yields `{ at }`.
  7. **`dimensionAxis`.**
     - `(0,0,0)` to `(0,5,0)`, no lock → `{ axis: 'y' }`.
     - To `(3,5,0)`, no lock → the oblique refusal string.
     - To `(3,5,0)`, `'x'` → `{ axis: 'x' }`.
     - To `(0,5,0)`, `'x'` → `The two points are level along X.`
     - A difference of `1e-12` on X plus 5 on Y, no lock → `{ axis: 'y' }` (the tolerance).
     - Mutate: replace `DIM_EPS` with `0`. The tolerance case must fail. Record the mutation.
  8. **Re-key.** `rekeyDimensions` maps every `part` and leaves `at` anchors alone, and returns the same object when
     `rekey` is the identity.
- [ ] **Step 2:** `npx vitest run src/document/placedDims.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement.
  - `anchorFor`:
    - board-owned: `fromWorld` of the world part. A coordinate is a lattice value when it is within `DIM_EPS` of `0`,
      `size/2` or `size`. When all three are, store the exact `0 | 0.5 | 1`. Otherwise store `local` as `fromWorld`
      returned it.
    - `kind === 'offset'` or guide-owned: `{ at: [...p.at] }`.
  - `resolveAnchor` is the only caller of `toWorld` in this module (inv 65's prohibition).
- [ ] **Step 4:** PASS, then `npm run build`.
- [ ] **Step 5:** Commit `feat(document): placedDims — anchors, the D decider, re-key (fu 253)`.

### Task 3: Store — add, remove, re-key, view state

**Files:**
- Modify: `src/store/store.ts`
  - the `addGuide` neighbourhood ~l.2868
  - `editRekeyed` ~l.1109
  - the state declarations near `tapeHover`
- Test: `src/store/store.placedDims.test.ts` (new; the `store.*.test.ts` naming)

**Interfaces:**
- Consumes: Task 2 (`anchorFor`, `dimensionAxis`, `dimensionValue`, `rekeyDimensions`).
- Produces:
  - `addDimension(a: SnapPoint, b: SnapPoint, axis: TapeAxis): boolean`
    - Refused (returns `false`, NO `edit()`) when `readOnly()`, when `gesturing`, or when the value along `axis` is
      ≤ `DIM_EPS`.
    - Otherwise ONE `edit()` appends `{ id: nextId(), a: anchorFor(...), b: anchorFor(...), axis }`, with the anchors
      computed from `worldParts(get().doc)`.
    - It never touches `tapeAnchor`, `tapeHover`, `tapeAxis` or the selection.
  - `removeDimension(id: string): void`: refused when `readOnly()`; a no-op for an unknown id (no `edit()`, inv 4); one `edit()`.
  - `hoveredDimension: string | null` + `setHoveredDimension(id)`: view state. Not in undo, the document or autosave.
  - `tapeNotice: string | null` + `setTapeNotice(s)`: view state. It is cleared to `null` wherever `tapeAnchor` or
    `tapeAxis` changes, and wherever `tapeHover` changes by `!sameSnapPoint`. Its declaration says so. It is not a held point, so inv 24 is not engaged.
  - `editRekeyed`'s edit becomes `edit((d) => rekeyDimensions(rekeyViews(fn(d), rekey, lift), rekey), selection)`.

- [ ] **Step 1: Write the failing tests**
  - `addDimension` pushes exactly one `past` entry, and `doc.dimensions` gains one entry whose anchors are of the
    expected kinds.
  - `tapeAnchor` and `tapeHover` are `toBe` the same objects afterwards.
  - A level pair returns `false` with `past` unchanged. Mutate: drop the guard, and the test fails.
  - With `explode > 0`: `false`, nothing pushed.
  - Delete the anchored part: the dimension is kept and `dimensionValue` is `null`. `undo()` brings the value back
    equal to before (Review Focus 3).
  - Group the anchored part:
    - its anchor's `part` changes and the value is unchanged;
    - one `undo()` restores the old `part` string AND the old tree (Review Focus 4);
    - Ungroup back gives the same value.
  - `removeDimension('nope')` pushes nothing. `removeDimension(id)` pushes one entry.
  - `setTapeNotice('x')` followed by `setTapeAxis('y')` leaves `tapeNotice === null`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement as the Interfaces say.
- [ ] **Step 4:** `npx vitest run src/store` PASS, then `npm run build`.
- [ ] **Step 5:** Commit `feat(store): addDimension, removeDimension, dimensions re-keyed with Group/Ungroup (fu 253)`.

### Task 4: D in the Tape tool, and the readout

**Files:**
- Modify:
  - `src/App.tsx`: the ONE keydown effect, beside T and R
  - `src/panels/TapeReadout.tsx`: the hint ladder ~l.258 and the error slot
- Test: `src/App.test.tsx`, `src/panels/TapeReadout.test.tsx`

**Interfaces:**
- Consumes: Task 3 (`addDimension`, `tapeNotice`, `setTapeNotice`) and Task 2 (`dimensionAxis`).
- **The D branch**, in `App`'s keydown effect:
  - Condition: `(e.key === 'd' || e.key === 'D') && !e.ctrlKey && !e.metaKey && !e.altKey && tool === 'tape' && tapeAnchor && tapeHover`.
  - It sits below the `modalOpen` and `isTextEntry` guards, which already precede every branch.
  - It computes `dimensionAxis(tapeAnchor.at, tapeHover.at, tapeAxis)`:
    - on a refusal, `setTapeNotice(refusal)`;
    - otherwise `addDimension(tapeAnchor, tapeHover, axis)`.
  - `e.preventDefault()` either way. Without the condition met, D falls through untouched.
- **The readout**:
  - A non-null `tapeNotice` shows in the error slot (`tape-readout-error`). A local `error` takes precedence when both are set.
  - While `tapeHover` is set, nothing is typed and `dimensionAxis` returns an axis, every hint string gains the suffix
    ` · D keeps it as a dimension`.

- [ ] **Step 1: Write the failing tests**
  - In `App.test`:
    - Tape tool, anchor and hover on the Y line of one part: pressing `d` adds one dimension with `axis: 'y'`.
    - An oblique pair: `d` adds none, and the readout shows `Lock an axis (X, Y or Z) to keep a dimension.`
    - The same pair after `x` (axis lock): one dimension with `axis: 'x'`.
    - Ctrl+D adds none.
    - With the cut list open (`modalOpen`), none.
    - `d` with the Select tool, none.
  - Leaning case (Review Focus 1): anchor and hover on the top and bottom lattice corners of one edge of a leaning
    part. Choose a case whose two world points share X and Z exactly: compute them from `boardSnapPoints`, and if
    none exists, use a square-set lean of zero splay. `d` adds a dimension.
  - In `TapeReadout.test`:
    - the suffix shows for an aligned pair and not for an oblique one;
    - the notice clears when the axis changes.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run src/App.test.tsx src/panels/TapeReadout.test.tsx` PASS, then `npm run build`.
- [ ] **Step 5:** Commit `feat: D keeps a Tape measurement as a dimension (fu 253)`.

### Task 5: The viewport drawing and the Dimensions footer

**Files:**
- Create:
  - `src/viewport/PlacedDims.tsx`, mounted in `Viewport.tsx` beside `<GuideLines>` (~l.634) under `explode === 0`
  - `src/panels/DimensionsFooter.tsx`, `src/panels/DimensionsList.tsx`, plus their tests
- Modify: `src/App.tsx` (mount the footer next to `GuidesFooter`), `src/styles.css`
- Test: `src/panels/DimensionsList.test.tsx`, `src/panels/DimensionsFooter.test.tsx`

**Interfaces:**
- Consumes: Tasks 2–3.
- `PlacedDims`, for each dimension:
  - **Skip it** when it is detached, or when an anchor's part is not drawn. Use `store/visibility.ts` `visibleBoards`, filtered in a memo, never a selector returning an array (inv 43).
  - **Draw**:
    - the segment `A → A′`, where `A′` is `A` with `B`'s coordinate on the axis;
    - a dashed leg `A′ → B` when they differ by more than `DIM_EPS`;
    - ticks at both ends;
    - a label `formatLength(value, units)` at the midpoint.
  - **Colour.** One CSS/material token, `--dim-placed` (start with the existing tape colour's hue shifted; the user picks
    it by eye in the browser check). Draw it emphasised when `hoveredDimension === id`.
  - **Labels.** Use whatever the Tape tool's on-canvas label uses. If it uses none, use drei `Html` with the `pointer-events: none` class.
  - Not raycast (`raycast={() => null}` on the meshes and lines).
- `DimensionsFooter`:
  - It renders nothing when the count is 0.
  - Otherwise it is the `GuidesFooter` pattern exactly: the heading `Dimensions · N`, closed by default, opening itself
    when the count goes up, and keyed by project in `App` the same way.
  - The list sits inside `EditLock`.
- `DimensionsList` row:
  - `${AXIS} ${formatLength(value)}`;
  - the span: each end's display name via `flatDocument`'s names, or `a point` for an `at` anchor, joined with ` to `;
  - `(part deleted)` when detached, `(hidden)` when an anchor's part is hidden;
  - `onMouseEnter`/`onMouseLeave` → `setHoveredDimension`;
  - a `✕` button (`aria-label="Delete dimension"`) → `removeDimension`.

- [ ] **Step 1: Write the failing tests (list and footer only; the viewport is browser-checked by design)**
  - A row's text for a Y dimension on `Left side › Leg` reads `Y 29"` (adjust to the fixture's exact numbers, computed by hand, never from the code).
  - A detached row says `(part deleted)` and its ✕ removes it.
  - A hidden part's row says `(hidden)`.
  - Hover sets `hoveredDimension`, and leaving clears it.
  - The footer is absent at 0 and opens itself when a dimension is added.
  - ✕ is disabled while exploded.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement all three components.
- [ ] **Step 4:** Tests PASS, then `npm run build`.
- [ ] **Step 5:** Commit `feat: placed dimensions in the viewport and a Dimensions list (fu 253)`.

### Task 6: The Plans sheet

**Files:**
- Modify:
  - `src/document/placedDims.ts` (sheet lines)
  - `src/panels/planDims.ts` (packing)
  - `src/panels/planLayout.ts` (`layoutTrio` extras)
  - `src/panels/PlanFigure.tsx` (`PlanTrio` `placed` prop, `trioScale`)
  - `src/panels/PlansSheet.tsx` (passes `doc.dimensions` to the piece trio only, and the same to `trioScale` for `SectionBlock`)
- Test:
  - `src/document/placedDims.test.ts`
  - `src/panels/planDims.test.ts`
  - `src/panels/planLayout.test.ts`
  - `src/panels/PlansSheet.test.tsx`

**Interfaces:**
- **`placedDimLines(parts, dims, units)`** returns `{ frontH: PlacedLine[]; frontV: PlacedLine[]; sideH: PlacedLine[]; detached: number }`.
  - `PlacedLine = { id: string; from: number; to: number; a: P2; b: P2; label: string }`.
  - **Routing**, the table in spec §6.1: X → `frontH`, Y → `frontV`, Z → `sideH`.
  - **Projection**: `a` and `b` are the anchors projected into the view, `[dot(p, view.right), dot(p, view.up)]` (as
    `planLines`).
  - **Ends**: `from`/`to` are the sorted projections on the dimension's direction, so `to > from`.
  - **Label**: `formatLengthBare(to - from, units)`.
- **`DIM_ROW = 40`** (SVG units), in `planLayout.ts`. **`layoutTrio(front, side, top, extra = { frontBelow: 0, frontRight: 0, sideBelow: 0 })`**:
  - `frontRight` rows widen the gap between front and side;
  - `max(frontBelow, sideBelow)` rows are added under both;
  - both enter the scale's band sums.
  - Zero extras give results `toEqual` today's.
- **`packPlaced(lines: PlacedLine[], scale: number): { line: PlacedLine; row: number; past: boolean }[]`** in `planDims.ts`.
  - **The span `[from·scale, to·scale]`**. `past` is `labelWidth(label) + DIM_LABEL_PAD > (to − from)·scale`, which
    makes the occupied span `[from·scale, to·scale + EXT_GAP + labelWidth(label)]`.
  - **Packing**: sort by `from`, then `to`, then input order. Place each in the first row whose last occupied end
    + `DIM_LABEL_PAD` ≤ this start. Otherwise open a new row.
  - This refines spec §6.2's "gap of a label's width". A centred label lies inside its own span, so only the pad is
    needed. Record it in the spec's Amended block.
  - Move `EXT_GAP` to `planDims.ts` (exported) if `PlanFigure.tsx` is its only home today.
- **`fitPlaced(drawings, lines, …)`**, in `PlanFigure.tsx`, shared by `PlanTrio` and `trioScale`:
  - lay out with zero extras;
  - pack at that scale;
  - lay out again with the row counts;
  - repack;
  - repeat until the row counts are stable, at most `lines.length + 1` times. Rows only grow as the scale falls, so
    this terminates.
- **Drawing**, in `PlanTrio`:
  - **Row positions.** Horizontal row `k`'s line sits at `bottom + DIM_BAND + (k + 1)·DIM_ROW − 8`. Vertical row `k`'s
    line sits at `right + DIM_BAND + (k + 1)·DIM_ROW − 8`.
  - **Extension lines** run from each projected anchor to the row (class `plan-ext`).
  - **Line and label.** The existing `Dim` draws the line and ticks. A `past` label is drawn left-anchored at
    `to + EXT_GAP` (rotated for a vertical one), in class `plan-dim-placed`.
  - **Detached note.** When `detached > 0`, push the spec's sheet note onto `notes`.

- [ ] **Step 1: Write the failing tests**
  - `placedDimLines`:
    - routing for x, y and z;
    - `from < to` whichever anchor is first;
    - a metric label is bare mm;
    - `detached` counts a missing part, and that dimension appears in no list.
  - `layoutTrio` with zero extras `toEqual` the call without them, for a fixture.
  - `frontRight: 2` puts `side.x` exactly `2·DIM_ROW` further right, before the scale change is accounted for. Assert
    against hand-computed numbers.
  - `packPlaced`, with fixed `scale = 10` and labels whose widths you compute from `labelWidth` in the TEST from
    constants, never from `packPlaced`'s output (inv 23):
    - two disjoint spans share row 0;
    - two overlapping spans take rows 0 and 1;
    - a 0.25" span with a long label is `past: true`, and a span starting inside its label's occupied end goes to
      row 1 (Review Focus 5).
    - Mutate: drop the `past` extension from the occupied end. The last case fails.
  - `PlansSheet`:
    - **Byte for byte.** The markup with `doc.dimensions = []` equals the markup rendered with the `placed` prop
      omitted. Also capture the piece figure's `outerHTML` before Task 6's changes on a fixture and pin it as a string
      constant in the test. Write that constant in Step 1, from the CURRENT build.
    - With one X dimension, the front view gains one `plan-dim-placed` group, and the assembly trios gain none.
    - A detached dimension's note shows.
    - `SectionBlock`'s scale equals the piece trio's when placed rows exist.
- [ ] **Step 2:** Run. Expected: FAIL (except the byte-for-byte pin, which passes now and must keep passing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npx vitest run src/panels src/document` PASS, then `npm run build`.
- [ ] **Step 5:** Commit `feat(plans): placed dimensions on the piece trio, packed in rows (fu 253)`.

### Task 7: Records, full suite, browser check doc

**Files:**
- `docs/invariants.md`: inv 65 in full, and the inv 33 amendment ("and placed dimensions' `part`").
- `CLAUDE.md`:
  - inv 65 condensed, with the PROHIBITION verbatim;
  - inv 33's line;
  - the Versioning `CURRENT_VERSION` line (32 → 33, naming placed dimensions);
  - the "Where things live" row `placed dimensions | placedDims.ts, PlacedDims.tsx, DimensionsList.tsx (inv 65)`;
  - CLAUDE.md is about 60 KB, so move an equal amount of detail out to `docs/module-map.md` or `docs/invariants.md`.
    Never trim a rule.
- `docs/module-map.md`: the new files.
- `docs/follow-ups.md`:
  - fu 253 → closed by this round;
  - fu 258 gets a note;
  - new entries for the spec's follow-up list and the build's deferred minors.
- `docs/browser-verification-placed-dimensions.md`: spec §10's twelve checks, unrun.
- The spec: an *Amended (build)* block with every ruling the build made, including Task 6's packing refinement.

- [ ] **Step 1:** Write the records.
- [ ] **Step 2:** Run `npm test` in full (quiet machine; re-run timing guards before calling a regression) and `npm run build`. Both PASS. Record the new test count in CLAUDE.md's Commands line.
- [ ] **Step 3:** Commit `docs: placed dimensions — inv 65, records, browser check list (fu 253)`.

The browser check, merge and deploy follow, per CLAUDE.md's deployment rule. They are not plan tasks: the user watches
the check and approves the deploy.
