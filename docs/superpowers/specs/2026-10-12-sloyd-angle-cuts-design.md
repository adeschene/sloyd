# Sloyd — angle cuts: tapers, miters, bevels and chamfers

**Date:** 2026-10-12 · **Status:** approved by the user 2026-10-12; four amendments made while planning chunk 1 (§4.2, §6, §7 — marked *Amended*), also approved; chunk 1 implemented 2026-10-12 on branch angle-cuts (deployed 2026-10-12 as index-DLW02CPM.js); chunk 2 implemented 2026-10-12 on angle-cuts-2 (deployed 2026-10-12 as index-b4ad9aBu.js); chunk 3 (bevels and chamfers) implemented 2026-10-12 on angle-cuts-3 (not yet deployed)
**Builds on:** cuts (`cuts.ts`, invariants 16, 40), the turn table (invariant 44), the tree and mirrored instances
(invariants 45, 46), the cut list (invariant 18), the Plans sheet's hidden-line drawings (invariants 38, 47) and the v1
spec's non-goal "angled parts can arrive later as an explicit feature with compound-angle math done properly"
(`2026-07-29-sloyd-v1-design.md`). Every rule there still holds unless this document says otherwise.

**Origin:** `docs/feature-gaps.md` §1, "Tapered legs" and "Miters and bevels" (chosen 2026-10-12).

## 1. Problem and goal

Every part in Sloyd is an axis-aligned box minus axis-aligned rectangular cuts. A tapered leg, a mitered frame, a
case miter and a bevelled or chamfered edge cannot be drawn; a miter is faked as a butt joint today, and the cut list
cannot say what the saw does.

**Goal:** a woodworker can model all four by hand and read correct numbers off the cut list and the Plans sheet.

**The user's rulings, made in conversation:**
- **All four targets**: tapered legs, picture-frame miters, case/box miters, bevels and chamfers — delivered in chunks
  (§9).
- **Manual only**: Generate keeps emitting square parts; Add joinery, Refine and Repair joints **refuse** a document
  containing any angle cut this round (§6).
- **Approach A**: a new field beside `cuts`, not a variant of `Cut`, not one field per feature.
- **Half-space, no stops**: one angle cut is an unbounded plane; stopped chamfers and two-stage tapers are out (§10).
- **Short point** is shown for miters.
- **The existing min/max vocabulary** ("width face (min side)", "length min end"), not posture words like "foot".
- **A stored word names the cut** (`kind`), written by the preset; the geometry can't tell an end chamfer from a short
  steep taper.
- **Miter offers "both ends"**; there is **no "taper all four faces" shortcut**.

**Non-goals:** compound angles (crown, splayed legs — a later §1 gap), curves, edge profiles beyond a flat chamfer,
angle-aware joinery, angle callouts on the Plans sheet, viewport handles for angles.

## 2. The primitive

### 2.1 Shape

```ts
type AngleKind = 'taper' | 'miter' | 'bevel' | 'chamfer';

interface AngleCut {
  /** Unique within its board (per shape for a shape) — invariant 33's scopes, like Cut ids. */
  id: string;
  /** The preset's word. Names the cut and picks the row's controls; NOT geometry (§2.4). */
  kind: AngleKind;
  /** The dimension the cut goes into … */
  face: Dimension;
  /** … entering from its min or max face. Depths are measured from that face. */
  from: CutFrom;
  /** The second dimension of the sloped line's plane. Always differs from `face`. */
  along: Dimension;
  /** Which end of `along` stations are measured from. */
  alongFrom: CutFrom;
  /** Two points on the sloped line: [station along `along`, depth into `face`], inches. */
  points: [[number, number], [number, number]];
}

Board.angleCuts: AngleCut[];   // and Shape.angleCuts — shared (§5.2)
```

The third dimension — neither `face` nor `along` — is `through`: the cut runs straight through it.

### 2.2 Meaning

The two points define a line in the `face` × `along` plane. Every point of the part whose depth from the `from` face
is **less** than the line's depth at its station is removed, straight through `through`. One angle cut removes one
**half-space**: unbounded, convex, one saw pass. The line extends across the whole part, so a taper's line, which runs
negative above its start, removes nothing there by construction.

Worked examples (stations measured from `alongFrom`):

| Case | Stored |
|---|---|
| Taper, 29in leg, ⅝ off the width face, starting 24in from the length min end and reaching ⅝ at that end | `face: width, from: min, along: length, alongFrom: min, points: [[0, ⅝], [24, 0]]` |
| Picture-frame miter, 2½in stock, 45° at the length max end | `face: length, from: max, along: width, alongFrom: min, points: [[0, 0], [2½, 2½]]` |
| Case miter, ¾in stock, 45° at the length max end | as above with `along: thickness`, `[[0, 0], [¾, ¾]]` |
| Chamfer ⅛ × ⅛ on the thickness max / width min edge | `face: thickness, from: max, along: width, alongFrom: min, points: [[0, ⅛], [⅛, 0]]` |

### 2.3 Values and validation

- **Exact values** (invariants 18, 25). A preset angle θ stores `depth = run · tan θ` unrounded, **except 45°, which
  stores depth = run** with no `tan` (`Math.tan(π/4)` is 0.9999999999999999, which would make a 2½in miter 2.4999999999999996
  and break exact grouping). Display rounds.
- `validateAngleCut` (on load) drops an entry with: equal stations; a non-finite number; `along === face`; an unknown
  `face`/`from`/`along`/`alongFrom`. A missing or unknown `kind` is **derived, not dropped** (§2.4).
- Equal depths (a 0° line — a constant-depth slab, reachable only from a hand-edited file) are legal; the angle reads
  `0.0°`. The UI cannot produce one (§7).
- A cut that removes nothing at the part's current size is **kept**, with a note "removes nothing at this size". It
  is NOT dropped on load (unlike fu 178): keeping it costs nothing and restores the cut if the part grows back.

### 2.4 `kind`

`kind` is the word the user chose. It decides the label (§4) and which controls the row shows (§7), so an edit never
swaps a row's controls under the user. It is never used to decide geometry. It IS compared wherever two cuts are
asked to be "the same" (§5.2, §4.2): two cuts that would print different words cannot share a cut-list line.

Fallback, for a file without a valid `kind`: `face === 'length'` → `miter`; otherwise `along === 'length'` → `taper`;
otherwise both of the line's intercepts on the part's faces inside the part → `chamfer`; otherwise `bevel`.

## 3. Geometry

### 3.1 Two solid functions

- **`boardSolids` is renamed `pocketCells`.** Same function, same `Region[]`: stock minus rectangular cuts. The rename
  makes `tsc` stop at every caller so each chooses deliberately. Callers that legitimately want rectangles stay on it:
  `cutShape`, `openSides`, `cutLabel`, `storedAsShape`, `cutlist.ts`, Properties' cut rows, joinery's `recipes.ts` and
  `repair.ts` (which refuse angle cuts anyway, §6).
- **New `boardBodies(board): Body[]`** — the ONE place angle cuts become geometry. Each body is a pocket cell clipped by
  every angle cut's kept half-space: a convex polyhedron, stored as its half-spaces (`{ n, d }` in board-local inches)
  plus its vertices and its faces as polygons. A cell no angle cut touches is a body whose half-spaces are the cell's
  six. A board with no angle cuts yields bodies identical to its pocket cells. A board its angle cuts consume entirely
  yields `[]` (invariant 21's placeholder, unchanged).

*Amended (implementation):* `taperFields(c, board)` and `angleLine` read a taper that deepens toward the far end from
its deep end (end = other, amount = `depthAt(A)`, start = A - z), so one vocabulary and no negative amounts.

### 3.2 Sites the rename does not reach

The compiler will not find these; the plan must visit each:
- **`stockProbe`** and **`boardEdges`** call `cuts.ts`'s private `grid()` directly. `stockProbe` gains the kept
  half-spaces (a point outside any is not stock); `boardEdges` is rewritten per §3.4.
- **`depthField.ts`** mentions `boardSolids` only in a comment. It stays pockets-only (its job is the pocket's hatch
  depth, invariant 20); angle-cut waste is drawn separately in part diagrams (§4.3).
- **`boardUVSignature`** (`grainTiling.ts`) must include `angleCuts`, and BoardMesh's memo keys on it — invariant 15's
  failure mode, which shipped once already.
- `.cuts` reads that copy or transform a part field by field: `sharedOf`, `sharedPatch`, `sameShared` (`links.ts`),
  `copyBoard` (`store.ts`), `mirrorPart`/`lowerCuts` (`frames.ts`, `treeEdit.ts`), `treeOps.ts` (Make Unique, Ungroup),
  `shapes.ts` (`resolveBoard`), `document.ts` (validation, migration), `refineDesign.ts` (refusal). Each gains the
  matching `angleCuts` line; each has a test that fails without it.

### 3.3 Rendering (`BoardMesh`)

- A body no angle cut clips keeps today's `BoxGeometry` path **byte-for-byte**, so invariant 35's `FACE_AXES` table
  still governs every unclipped face.
- A clipped body gets a custom `BufferGeometry` from its face polygons (fan-triangulated, convex). Its axis-aligned
  faces take UVs through `FACE_AXES` (sign first, then swap), the same table.
- A **sloped face** takes UVs by projecting its board-local positions onto the plane of the dimension its normal is
  closest to; a tie goes to `face`. So a miter face (`face: length`) reads as end grain and a taper face
  (`face: width`) as long grain. UVs stay parent-relative and `FIT` resolves against the board (invariant 17), so the
  figure runs continuously onto the slope.
- The shading and grain on sloped faces are a **real-hardware check (26a)**; software GL is not evidence.

### 3.4 Edges (`boardEdges`, invariant 16 generalised)

An edge is drawn where two faces of the part's remaining stock meet and are **not coplanar**, and nowhere else. That
is the existing four-cell rule restated, and it extends to slopes: a sloped face crossing several cells draws no seams
between them, a box corner a miter removed draws nothing, and the sloped face's outline is drawn where it meets the
part's other faces.

### 3.5 Drawings (`drawing.ts`)

Occluders become world bodies. `hiddenSpan` already clips the edge's (t, s) polygon against a list of planes; a box
contributes six, a body contributes its half-spaces. Same algorithm, same `DRAW_EPS` growth, same closed-box rule (a
ray along a seam between bodies of one part is inside). A new `worldBodies(b)` maps bodies to world space through the
ONE composition (`placeBoard`); `worldSolids` stays the box mapping for `designCheck` and joinery.

### 3.6 Snap points

- Points that fall outside the bodies are withheld (through `stockProbe`, §3.2).
- Each sloped face's corners are added, owned by the **board** (`BoardSnapPoint`, invariant 26 unchanged), so the Tape
  tool can measure a taper's end or a miter's short point.

## 4. Bench numbers

### 4.1 Stock is unchanged

The cut list buys and lists the rectangle that is ripped and crosscut (invariant 18). Board feet, Buying and sheet
nesting are untouched. A mitered rail is bought at its long-point length.

### 4.2 Rows

`angleShape(board, cut)` is the ONE description of an angle cut: every string the cut list and diagrams print is built
there (invariant 19), in the existing vocabulary.

| `kind` | Reads as |
|---|---|
| miter | `Miter 45.0° across the width at the length max end, long point on the width min side` |
| taper | `Taper 5/8 off the width face (min side), from 24 from the length min end to that end` |
| bevel | `Bevel 15.0° off the width face (max side), across the thickness, long point on the thickness min side` |
| chamfer | `Chamfer 1/8" on the edge between the width face (max side) and the thickness face (max side), along the length` (unequal legs: `Chamfer 1/8" into the width × 3/16" into the thickness, on the edge between …`) |

- Angles display to **0.1°**, always (45.0°, 22.5°); there is no "exact" branch. Lengths use `formatLength`.
- *Amended (user, 2026-10-12):* the miter line names the long-point side (fu 294), so a trapezoid and a parallelogram print different lines.
- *Amended (chunk 3, approved with the plan):* bevel and chamfer take the final wording in the table above, in the
  same "long point" and "face (max side)" vocabulary as tapers and miters. A bevel names its long-point side; a chamfer
  names its edge by the two faces it lies between (width face before thickness face) and the dimension it runs along,
  and names both legs only when they differ. A cut neither row can describe keeps the generic `Bevel`/`Chamfer … off
  <face>, across the <dimension>` line.
- **Short point** = the stock length minus the greatest depth (within the part) of each miter entering an end; with
  miters at both ends, both are subtracted. Printed once per row, after the last miter.
- *Amended (planning chunk 1):* the short point is its own line, `Short point 19"`, not part of the miter line as the
  table above shows. Bevel and chamfer read `Bevel 15.0° off the width face (max side), across the thickness` and
  `Chamfer 1/8 × 1/8 off the thickness face (max side), at the width min edge`; they matter only for hand-edited files
  until chunk 3, which may polish them.
- **Grouping**: parts share a row only if their angle cuts are equal by `ANGLE_CUT_FIELDS` — every field but `id`,
  `kind` included, compared exactly — as an order-independent set (like `cutSignature`). The table is checked against
  `AngleCut` by `satisfies` (invariant 40's pattern, one type over).

*Amended (implementation):* the short point counts every end cut (`face === 'length'`) that removes stock, not only
`kind` miter (kind never decides geometry), and prints after ALL angle lines. See fu 281.

*Amended (user, 2026-10-12):* the short point is the SHORTEST LONG EDGE: the minimum, over the four corners of the end-face
rectangle (width x thickness), of `L - depth_min_end(corner) - depth_max_end(corner)`, clamped at 0, where an end's depth
at a corner is its deepest stock-removing end cut evaluated at that corner's coordinate on the cut's own `along`
dimension, clamped to [0, L]. The earlier formula subtracted each end's deepest depth even when the two deepest points
lay at opposite edges (parallel 45 degree ends on a 20 x 3-1/2 x 3/4 brace printed 13" where both long edges are 16-1/2").
Each end's depth is a max of linear functions (convex), so the remaining length is concave across the face and its least lies at a corner. Trapezoid ends (same slope) are unchanged: 24 - 2.5 - 2.5 = 19.

*Amended (user, 2026-10-12, fu 300):* a length face is named as an end in every angle line (`the length max end`), so an
end-edge chamfer reads `Chamfer 1/4" on the edge between the length max end and the width face (min side), along the
thickness`.

### 4.3 Part diagrams (`diagram.ts`)

In each face view where a slope shows as a line, the diagram draws the sloped line and hatches the wedge it removes as
a polygon (the half-space clipped to that view's rectangle), labelled from `angleShape`. In a view looking along the
slope it shows as an outline only. `depthField` is not involved (§3.2).

### 4.4 Plans sheet

The drawings read bodies (§3.5), so the exploded isometric and the elevations show true tapers and miters with
correct hidden lines. Overall and chain dimensions stay box-based. Angle callouts join fu 252.

## 5. Schema, mirroring, links

### 5.1 Schema 14

A document-level step, no per-board work: boards and shapes default `angleCuts: []`. Versioning table row:
`13→14 · angleCuts (default [], malformed entry dropped) · document-level · silent loss on round trip`. The v8 and v12
mirror steps never meet an angle cut (a file below 14 has none). Rolling back past 14 strands every project saved
since: export first.

### 5.2 Mirroring and links

- **Reflection is a flag flip, no arithmetic.** Reflecting along the posture's turn-0 X dimension flips `from` if
  `face` is that dimension, flips `alongFrom` if `along` is, and changes nothing otherwise. `mirrorPart` and the
  `lower` inverse each gain that rule. `kind` is untouched.
- **Turns and postures cost nothing**: the cut is stored in board-local dimensions.
- `LINK_FIELDS` gains `angleCuts: 'shared'`; `sameShared` compares it by `ANGLE_CUT_FIELDS` (the `_sharedPrimitives`
  guard fails `tsc` until it does); `sharedOf` deep-copies it. Edits go to the Shape, so every copy changes (invariant
  45).
- `copyBoard` (duplicate, copy in a row), Make Unique, Group and Ungroup carry `angleCuts` exactly as they carry
  `cuts`. Export and import are plain JSON.

## 6. Refusals

Add joinery, Refine and Repair joints **refuse** a document containing any angle cut, decided at entry before any
mutation (invariant 41). A mitered frame's stock boxes overlap at its corners, so a box-based run would report a false
overlap or cut into air. The message names the parts:
*"Add joinery doesn't handle angled parts yet (Leg 1, Leg 2…). Add joinery before tapering, or remove the angles
first."* Refine and Repair joints say the same in their own words. Generate's `designToDocument` emits `angleCuts: []`;
`documentToDesign` refuses. Tests assert no mutation and no paid call, never message text.

*Amended (planning chunk 1):* Repair joints is **not offered** on an angled document rather than refusing with its own
message: it is reachable only through the notice inside the Refine and Joinery dialogs, both of which refuse first, so a
refusal of its own would print the same message twice.

*Amended (implementation):* validation also drops non-finite slopes and non-finite station spans. In Properties, a
face switch that would remove more than the new face allows is refused with a field-error note (refuse, never clamp).

## 7. Authoring (Properties)

- An **Angles** section below Cuts, for a single selected part, with an **+ Add ▾** popover (Popover, Escape bound on
  its subtree, invariant 27): **Taper · Miter · Bevel · Chamfer**. Defaults scale to the part.
- Each row shows controls for its `kind`, in shop numbers, converting exactly to the stored points:
  - **Taper**: face (width/thickness, side) · start distance · from which end (`alongFrom`) · amount removed at that end.
  - **Miter**: which end · across width or thickness · angle (default 45°) · long-point side · **both ends** (adds the
    matching cut at the far end in the same undo entry).
  - **Bevel**: which edge · angle. **Chamfer**: which edge · size.
- Fields **refuse** out-of-range input, never clamp (DimensionField's rule): angle ≤ 0° or ≥ 90°, a start beyond the
  part, a removal beyond the face.
- Store actions `addAngleCuts` / `updateAngleCut` / `removeAngleCut`: through `edit()` (one undo entry, autosave),
  written back through `treeEdit` (invariant 46). Held points are re-judged with `dropHeldIfGone` AFTER the edit
  (invariant 24, point-precise: a miter can remove a grabbed corner). Inside the edit-lock fieldset, refused by
  `edit()` while exploded (invariant 47). Not offered for multi-selection.
- *Amended (planning chunk 1):* chunk 1 has a plain **+ Add taper** button; the **+ Add ▾** popover arrives in chunk
  2, when there is more than one preset to offer.
- *Amended (planning chunk 2, approved by the user):* "both ends" is an add-menu preset, not a row control:
  **+ Add ▾ → Miter both ends** adds two miters in one undo entry, long points on the same side (a picture-frame
  trapezoid, short point = length − 2 × width at 45°). An edited miter's match at the other end is added as a second
  miter (fu 295).
- No viewport handles. A resize keeps each cut on its end: a taper follows `alongFrom`'s end, a miter follows the end
  face it enters.

## 8. Testing

- **Units**: `boardBodies` volumes against closed forms (a taper removes ½·depth·run·through), with a mortise AND a
  taper on one part, and a part consumed entirely (`[]`). `angleShape` strings at the boundaries (45°, 22.5°, 0°, both
  ends). The 45° preset stores depth === run exactly.
- **Equivariance**: `chiralPart` with an asymmetric taper and a one-ended miter, under every turn, posture and mirror
  (invariant 44); mutate the fixture.
- **Every §3.2 site** has a test that fails when its `angleCuts` line is removed — mutate each.
- Drawings: a tapered leg behind an apron (hidden and visible spans). Snap points withheld and added. Cut-list
  grouping on exact equality, `kind` included. Migration round trip at 13 and 14. Refusals: no mutation, no call.
- **Viewport**: the dev server in the Playwright browser, DOM readouts first, `docs/img` screenshots for spatial
  findings, in `docs/browser-verification-angle-cuts.md`. Sloped-face shading and grain: the user, on real hardware.
- Every plan-supplied test is mutated before it is trusted.

## 9. Chunks

Each chunk ships and deploys on its own.

1. **Primitive + Taper**: schema 14, `boardBodies`, the `pocketCells` rename and §3.2's sites, rendering, edges,
   drawings, snap points, mirroring and links, store actions, the §6 refusals, `angleShape` for all four kinds (a
   hand-edited file reads right), cut-list rows and part diagrams, the Taper preset. The schema bump — and the rollback
   cost — lands here.
2. **Miter**: the preset, both ends, the short point.
3. **Bevel + Chamfer**: presets only.

## 10. Invariants amended (for CLAUDE.md when the round ships)

- **2**: `angleCuts` is absent from the reorient predicate, like `cuts`.
- **16**: generalised — an edge where two faces of the remaining stock meet and are not coplanar (§3.4).
- **35**: governs every axis-aligned face; a sloped face projects onto its nearest dimension's plane, ties to `face`.
- **38 / 47**: drawing occluders come from `worldBodies`; overlap, held and joinery stay on `worldSolids` (boxes) and
  joinery refuses angle cuts.
- **40**: `ANGLE_CUT_FIELDS` is the one "same angle cut" table, `kind` included.
- **44**: a reflection flips `from` / `alongFrom`, never arithmetic on stations.
- **New**: `boardBodies` is the ONE place angle cuts become geometry; `pocketCells` is stock minus rectangular cuts
  only.

## 11. Follow-ups this round leaves

Stopped angle cuts (stopped chamfer, two-stage taper); angle-aware joinery (splined and biscuited miters); Generate
emitting tapers and miters; a "taper all four faces" shortcut; angle callouts on the Plans sheet (fu 252); compound
angles.
