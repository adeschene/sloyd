# Sloyd — presets batch: taper shortcuts, raised panel, curve kind (design)

Date: 2026-10-17. Follow-ups 278, 298, 367. Status: design approved in chat by the user 2026-10-17 ("Yes, go ahead");
written spec approved ("Approved, write the plan"); implemented, plan `docs/superpowers/plans/2026-10-17-sloyd-presets-batch.md`. **No schema change** (17): rolling this round back costs nothing.

## 1. Purpose and rulings

Three gaps in the Properties rows, each a missing shortcut or control over geometry that already exists:

- **fu 278**: a tapered leg needs one Taper row per face, added one at a time.
- **fu 298**: a raised (fielded) panel's bevel is an unequal-leg chamfer. `chamferCut` stores one, but the Chamfer row cannot
  make it, and it cannot edit it either: its one Size field writes equal legs, and it reads as mixed (`value: null`) on an
  unequal chamfer.
- **fu 367**: changing a curve's kind (an Arch into a Bow) means Remove and re-add.

User rulings (brainstorm, 2026-10-17):

- **R1 (278)** Two menu items: **Taper four faces** and **Taper two faces** (the leg's two inside faces). They add
  independent Taper rows in one undo entry, with the same amount on every face. There is no linked edit.
- **R2 (298)** The Chamfer row gets **two leg fields**. A **Raised panel** preset defaults to a bevel **1-1/2" into the face**
  that leaves a **1/4" tongue** at the edge.
- **R3 (367)** A **Kind** select on a representable curve row. A kind change keeps the curve's placement and takes the new
  kind's preset sizes. The one exception is Arch ↔ Half-round notch, which keeps the span.
  **Reconfirmed by the user 2026-10-17**, after seeing it live (the notch greyed out from a 24" arch on a 5" apron, available
  from a 4" one): "losing the span is probably never going to be the intention, and if it was, the user could simply delete
  the arch and add a new one, then choose half-round". Do not re-propose the preset-notch alternative.

Non-goals:
- linked or grouped angle cuts;
- the raised panel's fillet (the small step at the field's edge);
- raising the back face;
- a Kind select on angle-cut rows;
- "Rounded corners" (all four) as a kind;
- any change to bodies, edges, drawings, the cut list or the design schema.

## 2. Taper shortcuts (fu 278)

`angleCuts.ts` gets `defaultTaperFaces(board, faces)`. It returns one `taperCut` per listed face:

- each from the length `min` end;
- each starting at `board.length * 0.75`, as `defaultTaper` does;
- each removing `Math.min(board.width, board.thickness) / 4` (one amount for every face, so a square leg stays square).

Two named sets:
- `TAPER_FOUR = [width|min, width|max, thickness|min, thickness|max]`;
- `TAPER_TWO = [width|min, thickness|min]`.

Every returned cut is a plain `taperCut` result. `deriveKind`, `taperFields`, the bench line and every reader treat it exactly as
a single Taper. The menu (`AngleCuts.tsx`) adds both items after Taper through `addAngleCuts(board.id, cuts)`, which is already one
edit and one undo entry. They follow the existing withhold rule: a preset whose default would be refused on this part is not
offered. A taper's amount is at most a quarter of either cross dimension, so the only part it can be withheld on is one with a
zero dimension. That case cannot be stored, so in practice the items always show. Do not invent a guard for it.

Details:
- Taper two faces → "Slope two adjacent faces (a leg's inside faces)".
- Taper four faces → "Slope all four faces along the length".

## 3. Raised panel (fu 298)

### 3.1 Two leg fields

The Chamfer row's single **Size** field is replaced by two `DimensionField`s. Each is labelled by the dimension its leg is
measured along, in the bench line's own words (`angleText.ts`: "`legFace` into the `face` × `legAlong` into the `along`"):

- **Into the `<face>`**: value `chamfer.legFace`, max `board[chamfer.face]`; it writes `{ legFace }`.
- **Into the `<along>`**: value `chamfer.legAlong`, max `board[chamfer.along]`; it writes `{ legAlong }`.

Each shows its own stored leg, so no chamfer is ever a mixed field. An equal 45° chamfer is typed as two equal legs. The
existing rules carry over per leg:

- min/max refuse, never clamp (`DimensionField`);
- an Edge change keeps both legs and is refused when a leg would pass its new dimension by more than the stored legs already
  do (fu 296, unchanged);
- a leg already past its dimension after a resize is kept and noted (`This chamfer is bigger than its edge at this size.`).

That last rule clashes with the field max. A field's max is its dimension, so a resized-past leg would block every commit in
that field, including one that reduces the leg. The fields' `max` is therefore `Math.max(board[dim], storedLeg)`, so the leg can
be reduced and never deepened, matching fu 296's "no deeper than stored". The other leg is not touched by an edit of one.

### 3.2 The preset

`angleCuts.ts` gets `defaultRaisedPanel(board)`, which returns four `chamferCut`s, the four edges of the **thickness max** face (the
panel's front):

| Edge | `face` / `from` | `along` / `alongFrom` | `legFace` | `legAlong` |
|---|---|---|---|---|
| long edge, width min | width / min | thickness / max | `w` | `t` |
| long edge, width max | width / max | thickness / max | `w` | `t` |
| end, length min | length / min | thickness / max | `w` | `t` |
| end, length max | length / max | thickness / max | `w` | `t` |

- `w = Math.min(1.5, Math.min(board.length, board.width) / 4)`: the bevel's reach into the face.
- `t = board.thickness - 0.25`: it leaves a 1/4" tongue.

Rows are canonical, `face` before `along` in `DIMENSION_ORDER`, as `CHAMFER_EDGES` is.

The four planes meet on the corner diagonals. Each body is the intersection of half-spaces, so the usual mitred corners
need no new geometry.

- **Withheld** on a part under 1/2" thick (a tongue of 1/4" would leave a bevel under 1/4" deep).
- Menu label "Raised panel", detail "Bevel the four front edges, leaving a 1/4\" tongue".
- One `addAngleCuts` call, one undo entry.

Only thickness-max is seeded. A panel modelled on edge is still a part whose thinnest dimension is `thickness`, and the user
can move each row's Edge.

## 4. Curve kind select (fu 367)

`curves.ts` gets `curveAs(kind, curve, board): Draft | null`, where `kind` is one of `'arch' | 'notch' | 'bow' | 'corner'`. It
rewrites a representable curve as another kind through that kind's canonical writer. It returns null when the target cannot be
built on this part (an Arch with no span left), or when `curve` is not representable.

**Placement** is read from the source and kept:

| Source | `through` | edge dimension `along` | `side` (edge's side) | `from` (along's end) |
|---|---|---|---|---|
| Arch / notch | `through` | `along` | `side` | `from` |
| Bow | `through` | `along` | `side` | `min` |
| Corner | `through` | u of `uvDims(through)` | `vFrom` | `uFrom` |

**Sizes** for the target come from the preset rules, generalised from `through: 'thickness'` to the kept `through` and `along`
(`other` is the in-face dimension that is not `along`):

| Target | Writer and sizes |
|---|---|
| Arch | `archCurve` with start 3, span `board[along] − 6`, rise `min(1.5, board[other] / 4)`; null when span ≤ 0. **From a notch:** keep start and span, rise = span / 4. |
| Half-round notch | `archCurve` with span 2, rise 1, centred (`start = board[along] / 2 − 1`); null when `board[along] < 2`. **From an arch:** keep start and span, rise = span / 2. |
| Bow | `bowCurve` with span `board[along]`, rise `min(0.5, board[other] / 4)`. |
| Rounded corner | `cornerCurve` with the corner's flags taken from placement (`along`'s flag is `from`, the other's is `side`, mapped onto u/v), radius `min(1, min(U, V) / 4)`. |

The existing presets are re-expressed through the same generalised helpers. Their output must stay byte-identical: pin each one
against today's value before refactoring.

### 4.1 The row

`CurveRowView` gets a **Kind** select first in its field grid, with options Arch, Half-round notch, Bow and Rounded corner. The
value is the row's derived label: a notch is an arch whose rise is exactly span / 2.

- It is shown only on a row one of the readers represents. A "Curve cut" row keeps its line and Remove only.
- The stored kind's own option is enabled.
- Each other option is computed per render, `curveAs(...)` then `refusalFor(board, curve, candidate, null)`. It is `disabled`
  when the result is null or refused. This follows the menu's withhold precedent: a choice that would be refused is not offered.
- On change, the candidate goes through the row's `set` (`attempt` with no control), so a stale render still refuses in the
  row's own words and the select stays on the stored value.
- `updateCurve` keeps the curve's id: hole fault keys and drawing feature tags stay stable.

## 5. Testing

- **TDD in `document/`.** Cover:
  - `defaultTaperFaces` (each set; square leg: equal amounts);
  - `defaultRaisedPanel` (the table above on a 3/4" panel; the cap on a small panel; withheld under 1/2");
  - `curveAs` (every source → target pair; placement kept, sizes per table; null cases; a mirrored source's flags kept, not
    re-derived; the existing presets pinned byte-identical before and after the refactor).
- **Component tests.** Cover:
  - the menus (one undo entry each; Raised panel withheld on a thin part);
  - the two leg fields (each writes only its leg; an unequal chamfer shows both values, no mixed field; a resized-past leg can
    be reduced and not deepened);
  - the Kind select (options disabled when refused; a change keeps the id; the stored kind is selected; absent on a "Curve
    cut" row).
- **Mutate** every refusal and withhold test, and the "only its leg" test.
- **Live pass on the dev server** (Playwright; the viewport has no unit tests by design). Check:
  - a four-face tapered leg;
  - a raised panel's corners in the viewport and on the Plans sheet (Front/Side/Plan and the part diagram);
  - an Arch → Bow → Rounded corner → Arch round trip.
  Delete only what the check created (the dev browser profile is the user's).

## 6. Follow-ups this round leaves

None planned. The fillet and a raised back face are record-only non-goals (§1) unless the user asks.
