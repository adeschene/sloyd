# Sloyd — metric display (design)

Date: 2026-10-15. Feature gaps §3 ("Metric display: input already parses metric; `units.display` only allows
`'imperial-fractional'`"). Status: spec, awaiting the user's review.

## 1. Purpose and rulings

Some projects are built metric (European plans, Baltic birch, 32 mm cabinet systems), others in inches. A project chooses
how its lengths read and are typed; every surface that project produces follows it.

User rulings (brainstorm, 2026-10-15):

- **R1 Per-project.** The choice lives in the document (`units.display`), travels with an export, and is undone like any
  edit. No browser-level default.
- **R2 Whole mm.** Metric lengths display as whole millimetres. Stored values stay exact inches; display rounds (inv 5).
- **R3 Buying keeps trade units.** Board feet, $/bd ft, nominal names (`2×4`), stock lengths (`8′`) and sheet sizes
  (`4×8`) stay as the lumberyard sells; an actual dimension shown on a buying line adds mm in brackets.
- **R4 A bare number typed in a metric project is millimetres.** A number with an inch mark, a fraction, or feet is
  inches; `mm` is always millimetres.
- **R5 Free drags snap to 1 mm** in a metric project (1/16″ in an imperial one). Exact moves stay unrounded (inv 25).
- **R6 No schema bump.** An older build opening a metric project shows and re-saves it in inches; nothing else is lost
  (all geometry is stored in inches either way), and rollback stays free.
- **R7 Hole diameters and pitches** show one decimal when not a whole mm (a 1/4″ bit reads `6.4 mm`): a drill bit is
  named exactly, and rounding it would name the wrong bit.
- **R8 Drawings** (Plans sheet, part diagrams, sheet-nesting labels) read bare numbers with one note per sheet:
  "Dimensions in mm". Imperial drawings keep the ″ mark.
- **Approach A**: the project's `units` passed explicitly wherever a length becomes text (rejected: a module-level
  "current units" — a background Refine/joinery run or a sheet built from another document would format wrongly, the
  argument inv 49 made against a global materials registry; React context for panels plus a parameter elsewhere — two
  mechanisms for one rule).

Non-goals: cm or m display, decimal inches, metric prices or volumes (m³, m²), metric stock or sheet sizes, the prompts
Generate and Refine send (they stay in inches — the model's grammar), Generate's and joinery's 1/16″ design rounding.

## 2. Model

```ts
// units/length.ts (units imports nothing)
export type LengthDisplay = 'imperial-fractional' | 'metric-mm';
export interface Units { display: LengthDisplay; precision: number }   // precision: the fraction denominator (imperial)
```

- `SloydDocument.units: Units`. `precision` is kept in a metric project (ignored for display) so switching back
  restores it. `createDocument` defaults to imperial, precision 16, as today.
- **Validation (no step, no bump):** `display` is `'metric-mm'` when stored so, else `'imperial-fractional'` (an unknown
  value falls back, as every malformed field does). Precision is validated as today.
- **Switching changes no stored number.** Geometry, cuts, holes, guides, prices are untouched; only display, parsing and
  free-drag snap change.
- **Every path that makes a project from another carries `units`** (Duplicate, Refine, Repair, joined results, import), as
  inv 49 requires of `materials`.

## 3. Formatting and parsing (`units/length.ts`)

- `formatLength(inches, units)`: imperial exactly as today (fractions reduced at `units.precision`, the ″ mark).
  Metric: whole mm, `762 mm`, `-38 mm`, `0 mm`; rounding half away from zero after the same relative-epsilon nudge the
  fraction path uses (18.4999… → `18 mm`, 18.5 → `19 mm`, −18.5 → `-19 mm`); non-finite → `—`.
- `formatMm(inches, decimals)`: the hole exception (R7) — one decimal unless the value is a whole mm at that precision
  (`6.4 mm`, `32 mm`, `35 mm`).
- A **bare** variant for drawings (R8): `formatLengthBare(inches, units)` — metric `762`, imperial identical to
  `formatLength` (the ″ stays on imperial drawings). One function produces both the measured and the drawn string
  (inv 19).
- `parseLength(text, units)`: imperial exactly as today. Metric: a bare decimal (`19`, `19.5`, `-38`) is millimetres; a
  number with `"`/`in`/`inch`/`inches`, a fraction or mixed number (`3/4`, `1-1/2`, `1 1/2`), or feet (`2'`, `2'6"`) is
  inches; `mm` is millimetres in both modes. `canBeginLength` is unchanged (its derivation from the grammar still holds).
- `snapStep(units)`: `1/16` or `1 / 25.4` inches (R5). `SNAP_INCHES` remains for Generate and joinery.
- The **`→ units` edge rule** stands: a module imports `units` when it produces a string a person reads, and now passes
  the document's `units` through.

## 4. Surfaces

### Chunk 1 — core and text

- **The Units switch:** an `in | mm` segmented control labelled "Units" in the top bar beside the project name; a document
  edit (one undo entry, autosaved); refused while exploded (inv 47, like every edit).
- **Fields** (`DimensionField` and its users: Properties size and position, cuts, angle cuts' lengths, holes, Copy in a row,
  Materials dialog sizes), **GuidesList**, **TapeReadout** (display and type-anywhere capture): format and parse with the
  project's units. A committed `3/4` in a metric project then shows `19 mm`.
- **Free-drag snap:** Gizmo and the store's drag rounding use `snapStep(doc.units)`.
- **Cut list:** stock collapses at display precision (inv 18) — whole mm in metric; a size triple writes the unit once:
  `762 × 140 × 19 mm`.
- **Bench lines:** cuts (`cutlist.ts`), angle cuts (`angleText.ts`: lengths in mm, angles in degrees), holes
  (`holeText.ts`: diameter and pitch per R7; positions whole mm; the imperial line's "(32 mm)" aside is unchanged).
- **Refusal messages and Refine's change list** (`angledRefusal.ts`, `designDiff.ts`, `JoineryDialog`): the project's units.

### Chunk 2 — drawings, buying, grid

- **Plans sheet** (`dimensions.ts`, `planDims.ts`, `PlansSheet`): bare numbers and the sheet note (R8).
- **Part diagrams** (`diagram.ts`, `PartDiagram`) and **sheet nesting** (`nesting.ts`' `formatDims`, `SheetLayout`): bare
  numbers, the note once per printed sheet; labels re-measured through `fitLabel` (inv 19).
- **Buying** (`purchase.ts`): trade units unchanged; an actual dimension adds `(… mm)` (R3).
- **Viewport grid** (`gridDensity.ts`): a metric ladder 10 mm / 100 mm / 1 m (cell / section), the same density rule;
  owed a real-hardware look (fu 26a).

## 5. Invariants

New **inv 52**: *A length becomes text only through `units/length.ts` with the document's own `Units` — never a module-level
or browser-level unit setting. Imperial output is byte-for-byte unchanged. Stored values are inches always; display rounds
(whole mm, holes one decimal), parsing decides by the project's units, and a units switch moves no number.* Inv 18, 19, 25
and the `→ units` edge rule are restated to name `Units` where they name precision.

## 6. Testing

- `units` (tested hardest): format and parse tables for both modes, incl. negatives, zero, the half-mm boundary both signs,
  fractions/feet/marks in metric, `mm` in imperial, junk → null; round-trip `parse(format(x)) ≈ x` within 0.5 mm.
- **Imperial byte-identity:** existing tests stay green unchanged; fixtures of the cut list, bench lines (and in chunk 2
  diagrams, Plans sheet, buying) compared against master output.
- Every formatting module exercised in metric; the units switch: one undo entry, no geometry change after in → mm → in;
  derived projects carry `units`; load falls back on an unknown `display`.
- Mutation-test the bare-number rule, the rounding, and the snap step.
- Live check on the dev server with the user watching: a metric project's fields, typing, tape, drag snap, cut list (chunk
  1); Plans sheet, diagrams, nesting, buying, grid (chunk 2).
