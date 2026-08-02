# Sheet-goods nesting — design

Date: 2026-08-02
Status: approved, not yet planned

The last item from the cut list's §7 non-goals. Board feet answered *how much
material* for solid stock; square feet answered the same question for sheet goods
without pretending to have solved nesting ("the number you compare against a sheet").
This design answers the question square feet deferred: **how many sheets, and how are
the parts laid out on them.**

---

## 1. What this adds

For every sheet-goods group on the cut list — the groups already keyed by
`(material, thickness)` and already reporting square feet — one purchasing number and
its evidence:

> **Plywood — 3/4"**  ·  62.00 sq ft  ·  **3 sheets** (96" × 48")

and, behind a toggle, one drawing per sheet showing where each part sits.

The count is the number a buyer wants. The layout is both the evidence for that count
and a genuine bench output: it is guillotine-cuttable by construction (§4), so it is a
sheet you can take to the panel saw and follow.

---

## 2. Three facts, three homes

The inputs nesting needs are not all facts about the same thing, and each goes where
it is true.

### 2.1 Sheet size and rotation policy are facts about the MATERIAL

`MATERIALS`' `sheet?: boolean` becomes the object it was always standing in for:

```ts
export interface SheetStock {
  /** Inches. The long dimension of a full sheet. */
  length: number;
  /** Inches. */
  width: number;
  /**
   * 'grain' — the part's own `grain` field determines its orientation on the
   *   sheet; the packer never turns it. Correct for veneered plywood, where a
   *   part turned 90 degrees has its face veneer running the wrong way in the
   *   finished piece.
   * 'free'  — the packer may lay the part either way. Correct for MDF, which
   *   has no grain at all.
   */
  rotate: 'grain' | 'free';
}
```

```ts
plywood: { label: 'Plywood', color: '#cbb391',
           sheet: { length: 96, width: 48, rotate: 'grain' } },
mdf:     { label: 'MDF',     color: '#a89a86',
           sheet: { length: 96, width: 48, rotate: 'free'  } },
```

`isSheetGood(m)` keeps its signature and becomes `MATERIALS[m]?.sheet !== undefined`.
Every existing call site — `cutlist.ts`'s square-feet branch, `grainFaces.ts`'s
tiling rank — is unchanged.

**Why the material and not the document.** A 4×8 sheet is a property of the plywood
you buy, exactly as `sheet: true` already is. Baltic birch comes 5×5 because of what
it is, not because of what you are building. Putting the size on the document would
make one project's plywood a different size from another's while both say "Plywood".

**Why not a `grained: false` flag on MDF.** `rotate` is a packing policy stated per
material, which is a thing the packer needs; `grained` would be a fact about wood
that only one consumer reads, bolted on to answer one question. The distinction
matters for what comes next.

**This is deliberately the shape a later custom-materials round fills in.** Custom
wood types — customisable ply count, veneer colour, grain on/off, custom sheet
sizing — are planned but not part of this round. When they land, `MATERIALS` entries
move from a module constant into document data and gain their own fields; a custom
unveneered plywood is an entry with `rotate: 'free'`, and Baltic birch is one with
`length: 60, width: 60`. **Nothing in this round's derivation code changes when that
happens** — `buildNesting` reads `sheet.length`, `sheet.width`, `sheet.rotate` and
does not care where the entry came from. Preparing that shape now costs nothing;
choosing a document-level sheet size would have to be undone.

`MATERIALS` stays a module-level constant in this round. Making it document data is
the custom-types round's job and its own schema change.

### 2.2 Kerf is a fact about the SHOP — schema v5

```ts
stock: { kerf: number }   // inches, default 0.125
```

on `SloydDocument`, beside `units`. A table saw takes 1/8", a thin-kerf blade less, a
CNC router 1/4", a track saw its own. That belongs to the person, so it travels with
their file and is undoable like anything else.

**The migration step is structurally unlike the four before it, and the spec says so
rather than letting an implementer discover it.** `foldRotationToV2`,
`addPostureToV3` and `addCutsToV4` are all `rawBoards.map(step)` — per-board upgrades
that must run before `validateBoard` because that validator's fallback for a missing
field is a legal-but-wrong value (invariant 11). `stock` is a **document-level**
field, so it has no per-board step at all. It is handled the way `units.precision`
already is in `migrateDocument`: read defensively off the raw document, default when
absent or invalid.

```ts
const stock = d.stock as SloydDocument['stock'] | undefined;
const kerf =
  stock && typeof stock.kerf === 'number' && Number.isFinite(stock.kerf) &&
  stock.kerf >= 0 && stock.kerf < 1
    ? stock.kerf
    : 0.125;
```

Clamped to `[0, 1)`: a negative kerf places parts overlapping, and a one-inch kerf is
a typo, not a saw.

**Then why bump the version at all, if an absent field simply defaults?** Because of
the gate at the *other* end. `migrateDocument` refuses a file whose version exceeds
`CURRENT_VERSION`. Without the bump, a v4 build opening a file where the user set a
1/4" kerf would load it happily, silently drop the field, and print a different sheet
count than the build that saved it — a wrong purchasing number with no indication
anything was lost. The bump is what makes that a clear refusal instead. This is the
same reasoning that makes `addCutsToV4` worth having despite its default matching the
validator's: the chain's value is that every version means something definite.

`CURRENT_VERSION` becomes 5. `createDocument` writes `stock: { kerf: 0.125 }`.

### 2.3 A part's orientation is a fact about the PART, already stored

`Board.grain` says which of a board's dimensions the fibres run along. For a sheet
part that is `length` or `width` (`thickness` is meaningless for sheet goods — see
`grainFamily`'s comment in `grainFaces.ts`). Nothing new is stored per board.

---

## 3. `buildNesting` — inputs and outputs

New leaf: `src/document/nesting.ts`. Pure, deterministic, no cached state — the same
rules `buildCutList` lives by, and for the same reason: it is called on every render
and there is therefore nothing that can go stale.

```ts
export interface PlacedPart {
  boardId: string;
  name: string;
  /** Inches from the sheet's min corner. x runs along the sheet's length. */
  x: number;
  y: number;
  /** Footprint AS PLACED — w along the sheet's length, h across it. */
  w: number;
  h: number;
  /** True when the part's own length runs across the sheet rather than along it. */
  turned: boolean;
}

export interface NestedSheet {
  parts: PlacedPart[];
}

export interface Nesting {
  sheets: NestedSheet[];
  /** Parts that fit no empty sheet in any allowed orientation. Never dropped. */
  unplaceable: { boardId: string; name: string; dims: string }[];
  /** e.g. `3 sheets (96" × 48")`, already formatted. */
  label: string;
  /**
   * Just the sheet size, e.g. `96" × 48"` — a separate field rather than a
   * substring of `label`, so the unplaceable line can name the sheet without
   * a panel picking `label` apart. The panel formats nothing, and that
   * includes un-formatting.
   */
  sheet: string;
}

export function buildNesting(
  boards: Board[],
  stock: SheetStock,
  kerf: number,
  precision: number,
): Nesting;
```

### 3.1 Input is `doc.boards`, never `CutListRow`s

**This is the fourth instance of the 55/55a shape, and it resolves the way board feet
did.** A cut-list row is representative: two parts share a row when they *print*
identically at the document's precision, not when they are equal. A layout built from
a row's rounded dimensions can place four parts on a sheet that in reality overflows
it — and unlike a printed dimension, where the error is invisible because every part
on the row prints the same string, here the error decides whether you buy two sheets
or three.

So the packer takes boards. A row with `qty: 4` contributes four rectangles carrying
four exact footprints. `buildCutList` calls `buildNesting` per group with that group's
boards in hand, in the same pass that already accumulates `stockInches` — the same
reason that accumulator lives where it does, and the same guarantee: a group's count
and its square footage cannot disagree, because they are computed from the same
visits.

### 3.2 Stock, not remainder

`board.cuts` is not read. A part is cut from the sheet at its stock dimensions; the
dados happen afterward, out of material already on the bench. Same rule
`stockInchesOf` states, and stated again here because a reader arriving from `cuts.ts`
is primed to subtract.

### 3.3 Footprint and orientation

A sheet part's footprint is `length × width`; its `thickness` is the sheet's, which is
why thickness is a grouping key rather than a packing input.

Under `rotate: 'grain'`, orientation is **determined** by `board.grain`, not merely
constrained:

| `grain` | along the sheet's length | across it |
|---|---|---|
| `'length'` | `board.length` | `board.width` |
| `'width'` | `board.width` | `board.length` |

so `turned` is `grain === 'width'`. The field already stored is doing real work rather
than being passively obeyed — a part whose veneer runs across its width is *laid on
the sheet* that way, which is what makes the drawing true.

Under `rotate: 'free'`, both orientations are tried and the first that fits is taken.

`grain: 'thickness'` on a sheet good is not reachable through the UI and is treated as
`'length'` rather than throwing — a defensive default in the same spirit as
`materialLabel`'s `??`, with the same narrow stated scope: a `Board` constructed in
code, not an unvalidated document.

### 3.4 Where it attaches

`CutListGroup` gains `nesting?: Nesting` — present exactly when `isSheetGood(material)`
is true, absent otherwise, so the panel's existing "is this a sheet-goods group"
branch is the only condition it needs. `buildCutList` supplies `stock` from the
material entry and `kerf` from `doc.stock.kerf`, keeping its single-argument
signature (`buildCutList(doc)`), which was the point of putting kerf in the document.

`Nesting.label` is built with `formatLength` at the document's precision, like every
other string the derivation hands to a panel — the third consumer of the settled
`document → units` edge, and for the same reason: a sheet size printed here must read
the way a dimension printed beside it does.

---

## 4. Shelf first-fit-decreasing, because guillotine cuttability is a domain fact

A shop breaks sheets down on a table saw or with a track saw. **Every cut runs edge to
edge.** A maxrects packer produces denser layouts that contain placements no one can
physically cut — an L-shaped remainder needs a cut that stops in the middle of the
sheet. Shelf packing is not the simple option chosen over the good one; it is the
correct one for this app.

The algorithm:

1. **Sort** by across-sheet extent descending; tiebreak by along-sheet extent
   descending, then by `boardId`. The `boardId` tiebreak is what makes the order
   **total**, and therefore the output stable under input permutation (§6).
2. **Shelves** are full-length strips. A shelf's height is fixed by its first part,
   which — because of the sort — is its tallest. Shelves do not grow.
3. **Place** each part in the first shelf on the current sheet with room along its
   length; else open a new shelf if the sheet has width left; else open a new sheet.
4. **Kerf goes between neighbours only, never at a sheet edge**:
   `x = prev.x + prev.w + kerf`, and one dimension up, `y = prev.y + prev.h + kerf`.
   The first part on a shelf sits at `x = 0`; the first shelf at `y = 0`.

Cutting it is then: rip the sheet into strips at the shelf boundaries, crosscut each
strip. That correspondence is the whole justification, and §6 turns it into a test
rather than leaving it as prose.

### 4.1 The fits-test carries an epsilon, and this is the OPPOSITE of invariant 18

```ts
const EPS = 1e-6;
function fits(extent: number, remaining: number): boolean {
  return extent <= remaining + EPS;
}
```

`remaining = sheetLength - used` compared against a part's extent is a **subtraction
result compared against a bound** — precisely the shape named in `cutSignature`'s
comment as the hazard that made `cutLabel` wrong 2.8% of the time. Four 24" parts at
zero kerf on a 96" sheet must not fail on the fourth.

Invariant 18 says cut signatures compare **exactly**, and that stays true: there, both
sides are stored values a user typed, and two cuts entered identically hold identical
doubles. Here one side is computed. The two rules do not conflict — they are the same
rule applied to different arithmetic. Round nothing that is machined; tolerate float
error where float error is what you have.

### 4.2 A part too big for a sheet is reported, not dropped

A part that fits no *empty* sheet in any allowed orientation goes to
`Nesting.unplaceable` and is named on the printed sheet. It never opens a sheet, so it
cannot spin the loop.

Dropping it silently would be follow-ups 48 and 49's exact defect shape: rendering
nothing for a state the user created, leaving them to notice an absence. A 100"-long
part is a legal thing to have modelled and an illegal thing to cut from a 96" sheet,
and saying so is the whole job.

---

## 5. The drawing — `src/panels/SheetLayout.tsx`

A new component, **not** an extension of `PartDiagram`. A sheet with parts on it and a
board with cuts in it are different drawings that happen to both be SVG; the
`(face, from)` view model, the depth field, the hatch and the leader rows have no
meaning here.

- **One SVG per sheet**, drawn length-horizontal so a 96×48 sheet is a 2:1 box that
  suits a printed page.
- **One uniform scale** from sheet inches to drawing units. No sliver clamp and no
  height ceiling — `diagramScale.ts`'s `fitView` exists because a board's cross-section
  can be too thin to draw a dado on and a square panel can grow off the page; a sheet
  has a fixed aspect and neither problem.
- **Parts are outlined rects with a light fill; waste is left white**, so offcut reads
  as offcut. Fills are SVG `fill` attributes — foreground content, exactly like the
  diagram hatch — so they survive printing with Chrome's "Background graphics" off. A
  CSS background would not.
- **`LABEL_SIZE` still has exactly one home** (invariant 19). The scale into drawing
  units exists so that a unit here means what it means in `PartDiagram`, which is what
  keeps `labelWidth`'s measured monospace advance true. No `font-size` for these
  elements enters `styles.css`.

### 5.1 Labels cannot collide, so `packRow` is not used

Every label lives inside its own disjoint rect. What replaces packing is a **fallback
ladder**, measured with the same `labelWidth` / `LABEL_BOX_H` from
`diagramLabels.ts`:

1. name and dimensions, stacked, centred in the rect — if both lines fit by width and
   the pair fits by height;
2. else the name alone;
3. else a bare index, keyed to a list printed beside the sheet.

A 3"-wide part gets an index rather than a name bleeding across its neighbours. That
is follow-up 59's defect and the reason the width is measured rather than estimated.

The ladder is a **pure function** — `fitLabel(lines, boxW, boxH)` returning the tier —
so the three-way choice is unit-testable and `SheetLayout` stays a renderer that
formats nothing, the rule `CutList.tsx` and `PartDiagram.tsx` already follow.

### 5.2 On the sheet

The count and sheet size join the group heading beside the square feet already there.
Unplaceable parts are named directly under it:

> *Back Panel (100" × 30") does not fit a 96" × 48" sheet.*

The layouts render at the end of their group, after its rows.

### 5.3 Its own toggle

A two-state checkbox, defaulting **on**. Local view state, same reasoning as the
Diagrams toggle and `shortcutsSuspended` — outside the document and outside the undo
stack.

Separate from the Diagrams toggle because they control different objects:
"all parts / joinery only / none" is a statement about per-part drawings and has no
meaning for a sheet. Folding sheets into that toggle's "all" would make one control
answer two unrelated questions.

### 5.4 The print block is a design requirement here, not a QA note

Follow-ups 58 and 81 are the same defect twice, and **81 survived a task review and an
implementer self-review**: a correctly-enumerated single-class `@media print` override
was outranked by a more specific two-class screen rule, so the group subtotal printed
brass on white.

Every new class this round adds must therefore have its print override **and** a
specificity check against the screen cascade, verified by `getComputedStyle` on a
rendered page — not by reading the stylesheet, which is exactly what missed it last
time.

---

## 6. Testing

**Assert coordinates, not counts.** Invariant 20's lesson is directly on point:
`depthField.agreement.test.ts` passed with its cover step broken because it asserted
*where* rather than *what*. A sheet-count assertion has the same hole — a packer that
overlaps two parts reports the same count as one that does not.

`src/document/nesting.test.ts` pins:

- **Non-overlap and in-bounds**, as properties over a set of layouts: every pair of
  rects on a sheet is disjoint with at least `kerf` between neighbours, and every rect
  lies within the sheet.
- **The guillotine property**: every part's across-sheet interval falls inside exactly
  one shelf band, and the bands are disjoint. Cuttability is the justification for the
  algorithm, so it is a test.
- **The epsilon case, concretely**: four 24" parts, zero kerf, 96" sheet → one sheet.
  Reverting §4.1 to an exact comparison fails this.
- **Kerf changes the answer**: the same four parts at 1/8" need 96.375" → two sheets.
  Ignoring kerf is then a failing test rather than an optimistic number.
- **Grain determines orientation**: a 30×20 part with `grain: 'width'` occupies 20"
  along the sheet's length and reports `turned: true`; the same part in MDF may take
  either. This pins §3.3's rule that `'grain'` *reads* the field.
- **Unplaceable is reported and terminates**: a 100" part lands in `unplaceable` and
  opens no sheets.
- **Determinism under input permutation**: shuffling the boards produces identical
  output. Nothing else catches losing the `boardId` tiebreak, and losing it would
  produce a layout that reshuffles as parts are renamed.

`document.test.ts` gains the v5 chain: a v1 file walks 1→2→3→4→5, `stock.kerf`
defaults on every older file, an out-of-range kerf clamps, and a v6 file is refused.

`cutlist.test.ts` gains: a sheet-goods group carries a `nesting`, a solid-stock group
does not.

`fitLabel` is unit-tested for all three tiers. `SheetLayout` itself is not unit-tested
— the repo verifies SVG and viewport work by driving a real browser, and the
arithmetic under it is what tests cover.

### 6.1 Constants must be measured or guarded, never justified in prose

Five recorded instances (follow-ups 64, 68, 80) of plan-supplied constants shipping
with reasoning that did not reproduce. Every constant this round introduces —
`EPS`, the default kerf, the drawing scale, label padding — needs either a
reproducible measurement or a test that fails when it is wrong. A comment explaining
why a number is right is not evidence that it is.

### 6.2 Verification

`npm run build` is the typecheck gate; `npm test` does not typecheck. The visual pass
runs through the Playwright MCP with `emulateMedia` for print — this host's Playwright
still exposes no `pdf()`, so a real print-to-PDF render remains unverified
(follow-ups 70, 79, 84 carry forward).

---

## 7. Non-goals

Decisions, not omissions.

- **Optimal packing.** Shelf FFD packs a few percent looser than maxrects.
  Correct-and-cuttable beats dense-and-uncuttable, and the loss is bounded by the
  sort putting like heights together.
- **Waste factor or rounding up.** Follow-up 83's rule carried forward from board
  feet: the count is what the layout actually consumes. A user who wants a spare sheet
  can buy one; a tool that pads silently is lying about a purchasing number.
- **Offcut and remnant tracking.** "You will have a 96 × 11 strip left" is a real want
  and a different feature — it needs a notion of inventory the document does not have.
- **Solid-stock cut optimisation.** Nesting parts along 8-foot boards is a 1D problem
  with its own answer. Board feet is what this app says about solid stock.
- **Rearranging a layout by hand.** It is a derived drawing, not a document. Making it
  editable would put geometry state outside the document — invariant 1.
- **Custom material types.** Prepared for by §2.1's shape, built by its own round.
- **Mixed sheet sizes within one material.** One `SheetStock` per material entry;
  "some of my plywood is 5×5" is answered by custom types, not by a list here.
- **CSV or clipboard export.** Still declined, for the cut list's original reasons.
