# Sloyd — holes: bores and shelf-pin rows

**Date:** 2026-10-14 · **Status:** design approved by the user in conversation 2026-10-14; this written spec awaits review
**Builds on:** angle cuts (`2026-10-12-sloyd-angle-cuts-design.md`, invariant 48) — bodies, `partGeometry`, the field-by-field
sites; cuts (`cuts.ts`, invariants 16, 40); the turn table (invariant 44); the tree and mirrored instances (invariants 45,
46); the cut list (invariant 18); the Plans sheet's hidden-line drawings (invariant 47). Every rule there still holds unless
this document says otherwise.

**Origin:** `docs/feature-gaps.md` §1, "Holes — dowels, shelf-pin rows, hardware bores" (chosen 2026-10-14).

## 1. Problem and goal

A part is a box minus rectangular cuts and plane cuts. Nothing round can be drawn: no shelf-pin row on a cabinet side, no
hinge-cup bore in a door, no dowel hole, no through-bolt. The cut list cannot tell the drill what to do.

**Goal:** a woodworker can model blind and through holes, singly or in evenly spaced rows, square to any face of a part,
and read correct numbers off the cut list (chunk 1) and the drawings (chunk 2).

**The user's rulings, made in conversation:**
- **Holes only.** A dowel joint is two matching holes placed by hand; there is no dowel object, no dowel count. Dowels as
  hardware belong with the hardware-BOM gap (§3 of feature-gaps).
- **Rows are stored**, with a count and a pitch: one entry is the jig, and editing the pitch moves every hole.
- **Claude features refuse** a project with holes this round (§6). Carrying holes through joinery and Refine is the
  likely next chunk; authoring them in Generate after that.
- **Strict geometry**: a hole sits wholly on one flat face (§2.4). Counterbores, half-holes and holes meeting holes wait.
- **Station / pitch / inset from named ends** is the vocabulary (not first-and-last).

**Non-goals:** counterbores and countersinks (concentric holes), cam-and-bolt hardware (holes meeting), half-holes and
holes breaking out of an edge, angled or compound holes (pocket screws, splayed tenons), pointed (twist/brad-point)
bottoms, dowels as objects, metric display, holes on a sloped face, Claude features reading or writing holes.

## 2. The primitive

### 2.1 Shape

```ts
interface HoleRow {
  /** Unique within its board (per shape for a shape) — invariant 33's scopes, like Cut and AngleCut ids. */
  id: string;
  /** The dimension the holes go into: the drill axis … */
  face: Dimension;
  /** … entering from its min or max face. Depth is measured from that face. */
  from: CutFrom;
  /** Inches, exact. A metric entry stores mm / 25.4 unrounded. */
  diameter: number;
  /** Inches from the `from` face, or right through the `face` dimension. */
  depth: number | 'through';
  /** The row's direction: one of the two dimensions that are not `face`. */
  along: Dimension;
  /** Which end of `along` stations are measured from. */
  alongFrom: CutFrom;
  /** The first hole's centre, from that end. */
  station: number;
  /** Integer ≥ 1. A single bore is a row of one. */
  count: number;
  /** Centre to centre, toward the far end. Stored, and ignored, when count is 1. */
  pitch: number;
  /** The third dimension (neither `face` nor `along`): which side the centres are measured from … */
  acrossFrom: CutFrom;
  /** … and how far. */
  inset: number;
}

Board.holes: HoleRow[];   // and Shape.holes — shared (§5.2)
```

### 2.2 Meaning

Hole *k* (0-based, *k* < `count`) is a flat-bottomed right cylinder of radius `diameter / 2` whose axis is parallel to
`face`, centred at `station + k·pitch` from the `alongFrom` end of `along` and `inset` from the `acrossFrom` side of the
third dimension. It runs from the `from` face to `depth` into the part, or through the whole `face` dimension when `depth`
is `'through'` — so a through-hole follows the stock when that dimension changes.

Positions hang off their named ends, so a resize keeps a row on its end (as cuts do), and turns and postures cost nothing:
everything is board-local.

There is **no `kind` word** (unlike angle cuts): the stored geometry fully names what the drill does. Presets (§7) only
choose defaults.

Worked examples (a 30 × 11¼ × ¾ cabinet side lying flat; a 20 × 15 × ¾ door):

| Case | Stored |
|---|---|
| Shelf-pin row, ¼ × ⅜ deep, every 32 mm from 2" up, 1½ in from the front edge | `face: thickness, from: max, diameter: ¼, depth: ⅜, along: length, alongFrom: min, station: 2, count: 21, pitch: 32/25.4, acrossFrom: min, inset: 1½` |
| Hinge cup, 35 mm × ½ deep, 3" from the door's end, 22.5 mm in from its edge | `face: thickness, from: max, diameter: 35/25.4, depth: ½, along: length, alongFrom: min, station: 3, count: 1, pitch: 0, acrossFrom: min, inset: 22.5/25.4` |
| ⅜ dowel hole 1" deep into the end grain of a rail | `face: length, from: max, diameter: ⅜, depth: 1, along: width, alongFrom: min, station: <half the width>, count: 1, …` |

### 2.3 Values and validation

- **Exact values** (invariants 18, 25). Display rounds; nothing stored is rounded. `32mm` typed into a field stores
  `32 / 25.4`.
- `validateHoleRow` (on load) **drops** an entry with: a non-finite number; `diameter ≤ 0`; a numeric `depth ≤ 0`; a `depth`
  that is neither a number nor `'through'`; `count` not a positive integer; a negative `pitch`, `station` or `inset`; `along
  === face`; an unknown `face`/`from`/`along`/`alongFrom`/`acrossFrom`. A missing id is re-minted by `takeId`'s rules
  (invariant 33).
- A **faulted** but well-formed row (§2.4) is **kept** on load.

### 2.4 The strict rule — `holeFaults`

`holeFaults(board, row): HoleFault[]` is the ONE decider. Each fault names its hole index and its kind:

| Fault | When |
|---|---|
| `breaks-out` | the circle leaves the rectangle of its entry face (tangent is allowed) |
| `off-flat` | the cylinder meets the region of any rectangular cut (`clippedRegion`) or the removed side of any angle cut's half-space (`keptHalfSpace`) |
| `meets-hole` | the cylinder meets another hole of the part — this row's or another's (closed forms for parallel and perpendicular axes; touching is meeting) |
| `too-deep` | a numeric depth ≥ the `face` dimension (that is `'through'`) |

All tests are exact against the cylinder (a closed form per case, within `BODY_EPS`), never sampled: tangent to an edge
passes, 1e-6 past it fails.

- **Authoring refuses** an add or edit whose result faults, decided before any mutation (§7). Never clamped.
- **A fault a later edit causes** (a resize, a new dado, a new taper, a row whose last holes run off a shortened part) is
  **kept**, with a note on the row (§7), and drawn approximately (§3.2): no stored value changes. The count is never
  trimmed.

## 3. Geometry

### 3.1 `holes.ts` — the ONE place holes become geometry

- `holeInstances(board, row): Hole[]` — the cylinders, board-local inches: entry centre, axis (unit, pointing into the
  part), radius, and depth range `[0, depth]` (`[0, face dimension]` for through). Every reader below goes through it.
- `holeFaults` (§2.4).
- `partGeometry` gains a `holes` entry (the instances of every row), computed with bodies and frozen like them;
  `geometryKey` gains every row's id and `HOLE_KEYS` values in stored order.
- **`boardBodies` is unchanged.** Bodies stay hole-free and convex (§10, new invariant 50). A body with a hole is not
  convex, and every reader of `Body` — `clip`, `clipConvex`, `bodyEdges`, the drawings' occluders, contact — assumes it is.
  Decomposing around a polygonal cylinder would also make `bodyEdges` draw a crease at every wall facet. That alternative,
  and mesh-level CSG (a dependency, UVs outside invariant 35, recomputed on drag frames, analytic rims still needed), were
  considered and set aside.

### 3.2 Rendering (`bodyMesh`, `BoardMesh`)

- `HOLE_SEGMENTS = 48`: the polygon a hole is rendered as, vertices on the true circle.
- A body face that lies on a hole's entry plane (or exit plane, for through) and that the hole's polygon overlaps is
  replaced by **disjoint convex pieces**: a convex polygon minus a convex polygon is the union, over the subtrahend's edges
  *i*, of the face clipped to the outside of edge *i* and the inside of edges 0…*i*−1. Several holes subtract in turn;
  a piece whose bounds miss a hole skips it. Each piece is fan-triangulated as today and takes UVs through `FACE_AXES`
  (invariants 35, 17), so the grain runs continuously around the hole.
- Each hole adds a **wall** — 48 inward-facing quads with smooth (radial) normals — and, when blind, a **bottom** disc.
  Wall and bottom UVs project onto the plane of the dimension they are nearest (invariant 35's sloped-face rule): a wall
  drilled into a broad face reads as end grain.
- A **faulted** hole is drawn approximately: the wall is clipped to the part's bodies (each quad against each body's
  half-spaces), only faces on the entry and exit planes are opened, and a side face it breaks through stays closed.
- **A part with no holes keeps today's geometry byte-for-byte**, including the `BoxGeometry` path.
- `boardUVSignature` gains the holes (invariant 15's failure mode, shipped once with angle cuts); BoardMesh's memo keys on
  it.
- Shading and grain inside a hole are a real-hardware check (26a); software GL is not evidence.

*Amended (planning chunk 1):* the clip split above leaves T-junctions at every rim (a piece's long edge passes ring
vertices that are not its own), which can crack on real hardware. A face every overlapping hole's ring lies **strictly
inside** (by more than `BODY_EPS`) is instead triangulated with those rings as holes (`THREE.ShapeUtils.triangulateShape`),
from the SAME ring vertices the wall uses (`holeRing`), so face and wall share every rim vertex — pinned by a test. The clip
split stays as the fallback (a tangent hole, a seam face parallel to the axis, a faulted hole), where a T-junction is
accepted. Each prism cap is pushed out by `PRISM_EPS = 1e-7` so a face lying on the entry plane, or an internal seam inside
the hole's depth, is punched. Walls carry explicit radial normals (BoardMesh's `computeVertexNormals` would facet them), and
are wound to face the axis: the materials are `FrontSide`.

### 3.3 Edges (invariant 16 extended)

- Each hole draws its **rim** where it meets its entry face, and its exit face when through: the same 48-gon's vertices
  in the viewport (a line sits on a drawn feature).
- No wall facet lines.
- Body edges are unchanged: under the strict rule a hole never crosses one. A faulted hole's rim is drawn whole, which is
  part of "approximately".

*Amended (planning chunk 1):* a blind hole also draws its **bottom rim** in the viewport: wall meets bottom at a right
angle, a crease by this section's own rule.

### 3.4 Drawings (`drawing.ts`, chunk 2)

- Rims run through the same hidden-line pass as every other edge, as polylines of `DRAWING_HOLE_SEGMENTS = 96` (print
  scale; never displayed in the viewport).
- **Depth lines**: in each view, the wall's two silhouette generators (the lines tangent to the view direction) and,
  when blind, the bottom rim. A view looking down the axis has no silhouettes (the rim covers the bottom). In the
  elevations these are hidden (inside the part) and draw dashed, as a shop drawing does; the exploded view draws no
  hidden lines, as today.
- **Occluders stay the hole-free bodies.** You cannot see through a through-hole, and what lies below a hole's mouth
  draws hidden. This is a rule, pinned by a test, not an accident.
- Overall and chain dimensions stay box-based; hole callouts on the sheet join fu 252.

### 3.5 Snap points

- Each hole adds its **centre** on the entry face, and on the exit face when through, owned by the board
  (`BoardSnapPoint`, invariant 26 unchanged) — so the Tape tool measures centre to centre.
- `stockProbe` withholds a lattice point strictly inside a hole's cylinder (open: a point on the rim is stock).

*Amended (planning chunk 1):* every lattice point lies on the box surface, so "strictly inside" would withhold nothing:
the **mouth is air**. `stockProbe` withholds a point within the radius (open: the rim is stock) and between the caps
(closed). The centre points reuse the existing `'face-center'` kind (no new `SnapKind`), deduped by distance against the
lattice. A centre sits in air, a deliberate exception to invariant 16's marker-on-a-drawn-feature rule: it is the
centre of a drawn rim.

### 3.6 Who reads holes

| Reads holes | Ignores holes, deliberately |
|---|---|
| Rendering, edges, snap points, `stockProbe` | Overlap, held/hangs, tip, contact, grounding (invariants 38, 39): a hole never decides support |
| Cut-list lines and grouping (§4) | Stock dimensions, board feet, Buying, sheet nesting (invariant 18: the rectangle is bought) |
| Part diagrams and Plans drawings (chunk 2) | Explode offsets and framing (box-based) |
| Properties' fault notes (§7) | `depthField` (invariant 20) |

## 4. Bench numbers

### 4.1 The line

`holeLine(board, row)` in a new `holeText.ts` (→ units) builds every string a hole row prints (invariant 19), in the
existing vocabulary:

| Case | Reads as |
|---|---|
| row | `Row of 21 holes 1/4" dia × 3/8" deep in the thickness face (max side), along the length: first 2" from the min end, every 1-17/64" (32 mm), last at 27-3/16"; 1-1/2" in from the width min side` |
| single | `Hole 1-3/8" (35 mm) dia × 1/2" deep in the thickness face (max side), 3" from the length min end, 7/8" in from the width min side` |
| through | `× through` in place of `× <depth> deep` |

- A face of `length` reads as an end (fu 300's rule): `in the length max end`.
- Every length through `formatLength` (which writes `1-1/2"`), at the document's precision (1/16 by default) except as
  amended below. "last at" is computed from the exact values, not from the rounded pitch. The table's strings are exact
  at precision 16 (*corrected while planning chunk 1*: they first showed a 1/64 display and spaced fractions).
- Hole lines print after the angle lines, rows in stored order.

*Amended (planning chunk 1):* the document's default precision is 1/16, at which 32 mm would print `1 1/4"` — a jig set to
that drifts ⅕" over 21 holes. So the **pitch prints at 1/64 at least** (`max(precision, 64)`), and a **diameter or pitch that
is a whole number of millimetres and not an exact 1/64** also prints its millimetres: `every 1-17/64" (32 mm)`,
`1-3/8" (35 mm) dia`. "last at" is computed exactly and printed at the document precision. This is not metric display:
`units.display` is unchanged.

### 4.2 Grouping

Parts share a cut-list row only if their holes are equal by `HOLE_FIELDS` — every field but `id`, compared exactly — as
an order-independent multiset (like `cutSignature`). `HOLE_FIELDS` is checked against `HoleRow` by `satisfies`
(invariant 40's pattern).

### 4.3 Part diagrams (chunk 2)

In the face view looking down the drill axis, each hole draws as a circle with a centre mark; a row is labelled once
(`21 × Ø1/4" × 3/8"`). In views across the axis a hole draws its dashed depth lines. Strings are built in `diagram.ts`
from `holeText.ts` (invariant 19), measured as today.

## 5. Schema, mirroring, links

### 5.1 Schema 16

A document-level step with no per-board work: parts and shapes default `holes: []`, a malformed entry dropped (§2.3).
Versioning row: `15→16 · holes (default [], malformed entry dropped) · document-level, no step · silent loss on round trip
(every hole dropped)`. Rolling back past 16 strands every project saved since: export first. `CURRENT_VERSION` becomes 16.

### 5.2 Mirroring and links

- **Reflection is a flag flip, no arithmetic** (invariant 44): reflecting along the posture's turn-0 X dimension flips
  `from` if `face` is that dimension, `alongFrom` if `along` is, `acrossFrom` if the third dimension is. `mirrorPart` gains
  it; `lower` is its exact inverse, reusing an untouched stored array.
- `LINK_FIELDS` gains `holes: 'shared'`; `sameShared` compares by `HOLE_FIELDS` (the `_sharedPrimitives` guard fails
  `tsc` until it does); `sharedOf` deep-copies it. Edits go to the Shape (invariant 45).
- `copyBoard`, Make Unique, Group, Ungroup, `resolveBoard` carry `holes` exactly as they carry `angleCuts`.
- Role linking: a part with holes is never re-turned (`turnCandidates` returns none, like fu 314's rectangular cuts), and
  links only on exact equality.
- **Every field-by-field site** — the files `grep -rln angleCuts src` lists outside `angleCuts.ts`/`angleText.ts`/
  `angleWorld.ts`/`taperWorld.ts`/`AngleCuts.tsx` — is visited by the plan, and each gets a test that fails without its
  `holes` line.

## 6. Refusals

- Add joinery, Refine and Repair joints **refuse** a document containing any hole, decided at entry before any mutation
  and any paid call: through `joineryRefusal` (`joints/tapers.ts`) and `documentToDesign` / `plainForRefine`
  (`refineDesign.ts`). The message names the parts: *"Add joinery doesn't handle parts with holes yet (Side 1, Side 2).
  Add joinery before drilling, or remove the holes first."* Refine says the same in its own words.
- Repair joints is **withheld** rather than refusing (angle cuts' amended §6: it is reachable only through dialogs that
  have already refused).
- Generate's `designToDocument` emits `holes: []`; `DESIGN_SCHEMA` is byte-identical (fixture-pinned).
- Tests assert no mutation and no call, never message text.

## 7. Authoring (Properties)

- A **Holes** section below Angles, for a single selected part, inside the edit-lock fieldset (invariant 47). Not offered
  for multi-selection.
- **+ Add ▾** (Popover; Escape bound on its subtree, invariant 27). Defaults scale to the part; a preset whose default
  would fault on this part is **withheld**, not added and refused.

  | Preset | Chunk | Default |
  |---|---|---|
  | Hole | 1 | ¼" dia, ½" deep (through if the face dimension is ½" or less), centred on a broad face, entering from max |
  | Shelf-pin row | 1 | ¼" dia × ⅜" deep in a broad face, along the length from the min end: first at 2", every 32 mm, as many as fit with the last at least 2" from the far end; 1½" in from the width min side |
  | Hinge cup | 2 | 35 mm dia × ½" deep in a broad face, 3" from the length min end, 22.5 mm in from the width min side |

- **One row type** (count 1 is a hole). Controls: Face + side · Diameter · Depth with a **Through** checkbox · Along
  (the two non-face dimensions) + from which end · First at · Count · Every (disabled at count 1) · In from + which side.
- Fields are DimensionFields: they **refuse** out-of-range input and never clamp (invariant 5); Enter commits and blurs.
  Count is an integer field with the same refusal rule.
- Every edit is checked by `holeFaults` on the resulting row **before** `updateHoleRow`; a refused edit keeps focus and
  reads by fault: `Puts hole 12 past the length max end — reduce the count or the spacing first.` / `… into the dado —
  move it first.` / `… into hole 3 — move it first.` / `… deeper than the thickness — use Through.` The select stays on
  the stored value.
- A fault a later edit caused shows as a note on the row (`Hole 12 runs past the length max end at this size.`); Remove
  always works.

*Amended (planning chunk 1):*
- The menu reads **+ Add hole ▾** (as "+ Add cut"), not "+ Add ▾": two popovers named "+ Add" in one panel collide.
- **An edit is refused when it ADDS a fault** — a (hole, kind) pair the stored row does not already have. "Refuse any result
  that faults" would trap a row a resize already faulted: every edit toward fixing it (one fewer hole, a smaller pitch)
  would still fault and be refused. An add is refused on any fault (there is no stored row).
- **Every** is hidden at count 1, not disabled. **Count** is a DimensionField with a whole-number parse (AngleField's
  pattern), min 1.
- Store actions `addHoleRows` / `updateHoleRow` / `removeHoleRow`: through `edit()` (one undo entry, autosave), written
  back through `treeEdit` (invariant 46). Held points are re-judged with `dropHeldIfGone` AFTER the edit (invariant 24,
  point-precise: a new hole can swallow a grabbed lattice point). Refused by `edit()` while exploded (invariant 47).

## 8. Testing

- **`holeFaults`** at every boundary: tangent to an edge (allowed) and 1e-6 past (refused); touching a dado's region; a
  chamfer's plane passing within the radius and just clear of it; two parallel holes touching and clear; a perpendicular
  pair meeting and clear; depth equal to the dimension.
- **`holeInstances`**: positions under each `alongFrom` / `acrossFrom` / `from`, count 1 ignoring pitch, through following
  the dimension.
- **`holeLine`** strings: row, single, through, an end face, 32 mm pitch with "last at" computed exactly.
- **Mesh**: `bodyMesh` output for a holed face — triangle area equals face area minus each hole's 48-gon area (exact for
  the polygon), wall and bottom present, no triangle inside a hole, UVs per invariant 35's interior-number rule. A part
  without holes: byte-identical output.
- **Equivariance**: `chiralPart` with an asymmetric row under every turn, posture and mirror (invariant 44); mutate the
  fixture.
- **Every §5.2 site** has a test that fails when its `holes` line is removed — mutate each.
- Cut-list grouping on exact equality as a multiset. Migration round trip at 15 and 16. Refusals: no mutation, no call.
- Drawings (chunk 2): a through-hole and a blind hole in an elevation (rim visible, depth lines hidden); the no-see-through
  rule.
- **Viewport**: the dev server in the Playwright browser, DOM readouts first, `docs/img` screenshots for spatial findings,
  in `docs/browser-verification-holes.md`. Shading and grain inside a hole: the user, on real hardware.
- Every plan-supplied test is mutated before it is trusted.

## 9. Chunks

Each chunk ships and deploys on its own.

1. **Primitive through bench**: schema 16, `holes.ts` (instances, faults), `partGeometry`/`geometryKey`/
   `boardUVSignature`, rendering, edges, snap points and `stockProbe`, mirroring and links and every §5.2 site, the §6
   refusals, `holeText.ts` and the cut-list line and grouping, Properties with the **Hole** and **Shelf-pin row** presets.
   The schema bump — and the rollback cost — lands here.
2. **Drawings and polish**: Plans-sheet rims and dashed depth lines, part-diagram circles and labels, the **Hinge cup**
   preset.

## 10. Invariants amended (for CLAUDE.md when the round ships)

- **2**: `holes` is absent from the reorient predicate, like `cuts` and `angleCuts`.
- **15**: `boardUVSignature` includes holes.
- **16**: a hole draws its rim on its entry (and exit) face; a wall draws no facet lines.
- **38**: overlap, held, tip and contact ignore holes.
- **40**: `HOLE_FIELDS` is the one "same hole row" table.
- **44**: a reflection flips `from` / `alongFrom` / `acrossFrom`, never arithmetic on positions.
- **47**: drawing occluders are hole-free bodies: you cannot see through a hole.
- **New (50)**: `holes.ts` is the ONE place holes become geometry; `boardBodies` stays hole-free and convex. `holeFaults`
  is the ONE strict-rule decider; a fault is refused at authoring and kept with a note when a later edit causes it.

## 11. Follow-ups this round leaves

Carrying holes through Add joinery, Repair and Refine (with a rebase for holes measured from a moving end, and a
hole-in-pocket refusal); Generate and Refine authoring holes in world words (a `DESIGN_SCHEMA` change, fu 322's live
compile); counterbores, countersinks and cam-and-bolt (holes meeting holes); half-holes and breakout; dowels as hardware
(with the hardware BOM); hole callouts on the Plans sheet (fu 252); pointed bottoms; metric display of hole sizes.
