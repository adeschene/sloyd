# Sloyd — curves: arcs cut through a part

**Date:** 2026-10-15 · **Status:** approved by the user 2026-10-15, with its two *Corrected (writing)* notes (§2.1's arc
side, §4.1's wording). Chunk 1 plan: `docs/superpowers/plans/2026-10-15-sloyd-curves-chunk1.md`; its planning rulings P1–P7
were approved by the user with the plan (2026-10-15) and are marked *Amended (planning chunk 1, approved by the user
2026-10-15)* where they touch this document. Changes made while executing chunk 1 (controller and review rulings, not yet
seen by the user) are marked *Amended (implementation, chunk 1)* and are **for the user's review**. **Chunk 1 implemented**
on branch `curves` (2026-10-15, schema 17), **not yet merged or deployed**; the record is `docs/history.md`.
**Builds on:** angle cuts (`2026-10-12-sloyd-angle-cuts-design.md`, invariant 48) — bodies, `partGeometry`, `clipConvex`;
holes (`2026-10-14-sloyd-holes-design.md`, invariant 50) — a second kind of geometry with its own home, faults kept and
noted, the rebuild-performance guard; the section cut (`2026-10-14-sloyd-section-cut-design.md`, invariant 51) — caps and
`unionOutline`; metric display (invariant 52). Every rule there still holds unless this document says otherwise.

**Origin:** `docs/feature-gaps.md` §1, "Curves — arched aprons, curved stretchers, rounded tops, bandsawn parts". Picked by
Claude at the user's request, 2026-10-15.

## 1. Problem and goal

A part is a box minus rectangular cuts, plane cuts and round holes. Nothing curved can be drawn on its outline: no arched
apron, no rounded tabletop corner, no bracket foot's cut-out, no bow-front rail. The cut list cannot tell the bandsaw what
to do.

**Goal:** a woodworker can cut circular arcs clean through a part — arches, half-round notches, bows and rounded corners —
see them in the viewport, the section cut and the drawings, and read bench numbers (span, rise, radius) off the cut list.

**The user's rulings, made in conversation:**
- **Curved profiles cut through the part first** (option A). Edge profiles (roundovers, coves) and bent/laminated parts
  come later or never.
- **Arcs now, splines later, without another schema bump** (option C): the stored form is a path of segments; a spline is
  one more segment type (§2.4).
- **Through any of the three dimensions**, defaulting to the thickness (option A): a bow-front rail is an arc through the
  width of a part standing on edge.
- **Claude features refuse** a project with curves this round (§7), as they did holes.
- **Approach 1, measured** (§3): curves become part of the ONE geometry (`boardBodies`), and a curved part's edge lines
  are built directly, not rediscovered by `bodyEdges` (the timing spike, §3.6).
- **Grain on a curved face**: accept the seam where the face's texture plan switches (§3.4); record it with fu 336.

**Non-goals:** splines and free curves; stopped curved cuts (a scooped seat, a curved recess); edge profiles (roundover,
cove, ogee); compound curves (a cabriole leg: two profiles on two faces is two curves, allowed, but nothing is designed for
it); bent and laminated parts; dimension callouts on curves (§5.1); Claude features reading or writing curves; the design
checks (overlap, held, tip) seeing curves.

## 2. The primitive

### 2.1 Shape

```ts
interface CurveCut {
  /** Unique within its board (per shape for a shape) — invariant 33's scopes, like cut, angle-cut and hole ids. */
  id: string;
  /** The dimension the cut goes clean through. */
  through: Dimension;
  /** u and v are the other two dimensions, in DIMENSION_ORDER (length, width, thickness): through thickness → u = length,
   *  v = width; through width → u = length, v = thickness; through length → u = width, v = thickness.
   *  Each is measured from a named end. */
  uFrom: CutFrom;
  vFrom: CutFrom;
  /** The WASTE's outline: a closed path in stored (u, v) — start, then segments, back to start. */
  start: [number, number];
  segments: CurveSegment[];
}

type CurveSegment =
  | { type: 'line'; to: [number, number] }
  | { type: 'arc'; to: [number, number]; side: 'left' | 'right'; rise: number }
  | { type: 'arc'; to: [number, number]; side: 'left' | 'right'; radius: number };

Board.curves: CurveCut[];   // and Shape.curves — shared (§6.2)
```

*Corrected (writing):* the design in conversation named the arc's direction `bulge: 'wood' | 'waste'`. That cannot be
decided for an arch: its waste outline is the arc and its own chord, a region with no "inside" to bulge toward until the
arc is placed, so the arc bowing up into the part and down off the part are both valid outlines. The stored form names the
side instead: **`side` is the side of the chord, travelling from the segment's start to its `to`, that the arc bows
toward, in stored (u, v) coordinates (u to the right, v up).** It stays a flag flip under mirroring for free (§6.2): a
mirror changes `uFrom` or `vFrom` and no stored number, so everything defined on stored numbers is unchanged. Whether an
arc bows into the wood or into the waste is DERIVED (§3.1), for wording and for choosing the geometry path.

### 2.2 Meaning

Stored (u, v) maps to board-local coordinates through the named ends: a coordinate `c` measured from `min` is `c`; from
`max` it is `dim − c`. The waste is the region the closed outline encloses, extruded through the whole `through`
dimension; the kept wood is the part minus every curve's waste (after rectangular and angle cuts). A segment's arc is the
**minor arc** (at most a half circle) from its start to `to`, bowing toward `side`, fixed by `rise` (the sagitta: the
arc's greatest distance from its chord) or by `radius` — whichever the user typed; the other is derived. Positions hang off
named ends, so a resize keeps a curve on its end (as cuts and holes do), and turns and postures cost nothing.

There is **no stored kind**. Which preset a curve is (§8) is derived structurally from its canonical form (`deriveCurveKind`,
as `deriveKind` does for angle cuts); a curve matching no canonical form renders and prints, and its row shows the bench
line and Remove only.

**Canonical forms** (a = start, s = span, h = rise, r = radius, U = the u dimension; edge at v = 0 of the `vFrom` side; ends
measured from `uFrom`):

| Kind | Stored |
|---|---|
| Arch | `start: [a, 0]`, `[{ arc, to: [a + s, 0], side: 'left', rise: h }, { line, to: [a, 0] }]` (0 < h ≤ s/2) |
| Half-round notch | an Arch with h = s/2 — the same kind, one row type |
| Bow | `start: [0, 0]`, `[{ line, to: [0, h] }, { arc, to: [U, h], side: 'right', rise: h }, { line, to: [U, 0] }, { line, to: [0, 0] }]` — the arc bows down toward the edge and touches it at its crown |
| Rounded corner | corner at stored (0, 0): `start: [0, 0]`, `[{ line, to: [r, 0] }, { arc, to: [0, r], side: 'left', radius: r }, { line, to: [0, 0] }]` |

An arch or notch along the v direction (on an end rather than a side) is the same form with u and v exchanged in the
coordinates; `deriveCurveKind` accepts both. Rounded corners at the other three corners are the same form under `uFrom` /
`vFrom`. Worked examples: a 30 × 5 × ¾ apron on edge, arched on its lower side 3" in from each end with a 1½" rise —
`through: thickness, uFrom: min, vFrom: min, start: [3, 0], segments: [{arc, to: [27, 0], side: 'left', rise: 1.5}, {line,
to: [3, 0]}]`; a 36 × 20 top with its length-max/width-min corner rounded to 2" — `through: thickness, uFrom: max, vFrom:
min, start: [0, 0], segments: [{line, to: [2, 0]}, {arc, to: [0, 2], side: 'left', radius: 2}, {line, to: [0, 0]}]`.

### 2.3 Values and validation

- **Exact values** (invariants 18, 25): nothing stored is rounded; `38mm` typed stores `38 / 25.4`. A rise or radius is
  never re-derived and written back.
- `validateCurveCut` (on load) **drops** an entry with: a non-finite number; an unknown `through` / `uFrom` / `vFrom` /
  `side`; fewer than one segment; an arc with `rise ≤ 0`, `radius ≤ 0`, `rise` greater than half its chord, `radius` less
  than half its chord, a zero-length chord, or both or neither of `rise` and `radius`; an outline that CROSSES itself
  (touching at a point is allowed — the Bow touches the edge at its crown); an outline enclosing no area. A missing id is
  re-minted by `takeId`'s rules (invariant 33).
- A **faulted** but well-formed curve (§2.5) is **kept** on load.

*Amended (planning chunk 1, approved by the user 2026-10-15) — P1, explicit closure:* a stored outline's last segment ends
EXACTLY at `start` (its `to` equal to `start`, both numbers `===`); an outline that does not close is malformed and dropped
on load. "Back to start" is thereby checkable. As built, validation also drops an outline of more than
`CURVE_SEGMENTS_STORED_MAX` (64) segments (a 10,000-segment file is dropped, not expanded), and its crossing test sees the
chords and crowns only (an arc crossing a straight side without its crown is not caught; fu 371).

### 2.4 Unknown segment types — the refusal gate

A segment whose `type` is neither `line` nor `arc` makes `migrateDocument` **refuse the whole document**, exactly as it
refuses a newer `version`, with the same message ("made by a newer version of Sloyd"), and writes nothing. Dropping it would
be silent loss on the next save. So a later spline round adds a segment type with NO schema bump: every build from schema 17
on refuses what it cannot draw. (A bump exists for the refusal gate, CLAUDE.md's Versioning; this gate is that gate, keyed
on content.) Every load path — open, import, autosave-restore — runs it, because they all run `migrateDocument`.
(As built, the message names the segment: `This project has a curve this version of Sloyd can't read (segment type "…") —
it was saved by a newer version of Sloyd.`)

### 2.5 Faults — `curveFaults`

`curveFaults(board, curve): CurveFault[]` is the ONE decider, exact against the true arcs (closed forms within `BODY_EPS`,
never against the polygon):

| Fault | When |
|---|---|
| `runs-off` | the outline leaves the part's face rectangle (on the boundary is allowed) — an arch whose part was shortened past it |
| `cuts-through` | the kept face region (the face rectangle minus the waste) is empty or falls into more than one piece — an arch or bow deeper than the part is wide |

- **Authoring refuses** an add or edit that ADDS a fault the stored curve lacks (holes' amended rule: a curve a resize
  faulted can be edited back), decided before any mutation (§8).
- **A fault a later edit causes** (a resize) is **kept**, noted on the row and on its bench line (§4.1), and drawn as it
  actually cuts. No stored value changes.
- Holes meeting curves are `holeFaults`' business (§6.3), not this decider's.

*Amended (implementation, chunk 1, Task 4 ruling — for the user's review):* the table's example "an arch or bow deeper than
the part is wide" is not a `cuts-through` under the stated rule: a curve deeper than the part leaves the face rectangle
(an arch's crown, a bow's end lines), and the kept region left inside the face need not fall apart. The code follows the
rule: such a curve reads **`runs-off`**, which still flags it on the row and refuses it at authoring. A `cuts-through` is a
waste that stays on the face yet splits the kept region into pieces or empties it — an arch whose crown exactly TOUCHES the
far side (rise equal to the width; 1e-6 less is clean, pinned). The waste test
behind both (`wasteContains`) closes the chord band per arc: an arc bowing into the wood keeps only the strict side of its
chord, an arc bowing into the waste the closed side (Task 4 review: a uniform closed band read a band along an outward arc's
chord as waste).

*Amended (planning chunk 1, approved by the user 2026-10-15) — P4, fault words:* `runs-off` reads `runs past the length max
end` (the first side it passes: u min, u max, v min, v max); `cuts-through` reads `cuts right through the part` (a general
outline has no single "to the width max side"). A hole into a curve reads `hole 3 runs into the arch` / `the bow` / `the
rounded corner` / `a curve cut` (the curve's derived kind, `curveKindWord`).

## 3. Geometry

### 3.1 `curves.ts` — the ONE place curves become geometry

- `curveOutline(board, curve, tolerance)`: the waste outline as a polygon in board-local (u, v), every arc as chords whose
  vertices lie ON the true arc, the chord count the smallest whose sagitta is ≤ `tolerance`, capped per arc.
  `CURVE_TOLERANCE = 0.005` inches (0.13 mm; a third of 1/64) and `CURVE_SEGMENTS_MAX = 24` for the model (viewport,
  section caps, snap probe); the drawings' finer tolerance is §5.1's.
- `arcCentre`, `arcRadius`, `arcRise` (the derived values), `bowsInto(board, curve, segment): 'wood' | 'waste'`
  (derived: an arc bows into the wood when its crown lies outside the outline's chord polygon — the enclosed waste grows
  — and into the waste otherwise; for an arc whose chord is also a segment of the outline, the arch, into the wood).
- `deriveCurveKind`, the canonical writers (`archCurve`, `bowCurve`, `cornerCurve`) and their readers (a reader returns null
  for a form its row cannot represent — the angle-cuts rule), `CURVE_FIELDS` (§6.1), `mirrorCurveCut` (§6.2).
- Imports only `types` and `geometry` (as `angleCuts.ts` does).

*As built (chunk 1 plan):* the derived values live on `LocalArc` (`arcOf`: centre, radius, rise, crown, sweep) over
`localSegments(board, curve)`, and the predicate is `bowsInto(segs, arc)` — the same behaviour as the names above. The plan
form governs. `curveKindWord` lives here too (a controller ruling: `holeText` and `curveText` both use it, and placing it in
`curveText` made an import cycle).

### 3.2 Bodies (`boardBodies`, invariant 48 extended)

`boardBodies` stays the ONE place cuts become bodies, and bodies stay CONVEX (invariant 50). After rectangular cuts
(pocket cells) and angle cuts (half-spaces), each curve's waste is removed from every body it meets:

- **Convex kept wood** — every chord's half-plane (the side away from the waste) contains the whole of that body's kept
  wood near the curve, which is the rounded corner and the bow: the chords CLIP the body like angle cuts. No new bodies.
  (Measured: a 36 × 20 top with four 2" corners, one body, 2 ms.)
- **Otherwise** — the arch and the notch: the body is split into the convex pieces left once the waste's convex
  decomposition is subtracted (each piece bounded by one chord plane and the body's own faces). (Measured: an arched apron
  at 18 chords, 20 bodies, under 1 ms.)

A test decides which path a curve takes; both produce the same wood (pinned: equal volume, and every point of one is in
the other, within `BODY_EPS`). A face lying on a chord carries `curve: <curve id>` (as a face on an angle cut's plane
carries `cut`). A body that no curve touches is unchanged byte-for-byte, and a part with no curves keeps every existing
path (the `BoxGeometry` path included).

*Amended (planning chunk 1, approved by the user 2026-10-15) — P6, the clip path's decider:* a curve CLIPS (no new bodies)
when every arc bows into the waste and every straight side lies along the face rectangle's boundary; otherwise it SPLITS.
Both give the same wood (pinned).

*Amended (implementation, chunk 1, Task 6 ruling and review — for the user's review):* the decider is **strengthened**: CLIP
also requires the arcs to form ONE run (two runs part the wood; each run's planes keep only their own side) and the wood to be convex at every outline vertex off the face boundary and at every arc–arc join
(`woodConvexOffBoundary`: such a vertex must be reflex or straight in the waste). P6 as written accepts two arcs that each
bow into the waste but meet in a convex WASTE corner — a reflex WOOD corner — and their extended chord planes then clip real
wood past the other arc (28 in³ lost in the test that pins it). The guard only sends more curves to SPLIT, which gives the
same wood; Arch, Bow and Corner are unaffected. Also as built: each chord's arc is found by INDEX (an arc of n chords owns n
consecutive outline edges), not by searching for the circle through its ends; a body lying wholly outside any one of a
piece's planes is kept whole (else the extended planes slice cells the waste never reaches — a box beside the arch keeps
`box`).

*Amended (implementation, chunk 1, Task 6 review):* "each piece bounded by one chord plane" is not how SPLIT builds them.
The waste is decomposed by ear clipping (`convexPieces`, zero-area ears dropped) into FAN pieces, each a convex polygon
whose edges are chords and diagonals; a body is sliced along every plane of a piece (extended across the body), so one
arch's 18 chords give 18 slices and an L-shaped waste of 14 pieces gives 83 bodies (fu 368). The agreement pin is volume
AND point containment both ways.

`geometryKey` adds every curve's id and `CURVE_FIELDS` values in stored order (the id because a face carries it, as for
angle cuts); `boardUVSignature` (invariant 15) includes them.

### 3.3 Edges (invariant 16 extended) — built directly

`bodyEdges` costs the square of the face count, and an arch's slices put every slice's face on the same two broad planes:
it measured 25 ms at 18 chords and 135 ms at 48 (§3.6). So a curved part's edges are built, not rediscovered:

- **On every plane square to a curve's `through`** (the two broad faces, and any cut floor parallel to them): the outline of
  the union of the body faces lying on it, from `unionOutline` (the section caps' boundary routine, `section.ts`).
- **Along `through`**: one line at each SHARP vertex of the kept outline, judged on the TRUE geometry (an arc's tangent at
  its end, not its first chord): an arch meeting the straight edge draws one; a rounded corner's ends, where the straight
  sides run into the arc tangentially, draw none, and neither does a bow's crown. **No line between two chords of one arc**:
  an arc draws no facet lines, as a hole's wall does not.
- **Every other face** (the box's other sides, rectangular-cut faces, angle-cut faces): `bodyEdges` over those faces only,
  keeping the lines that do not lie in a plane handled above.
- **Pinned**: for every fixture, the result equals `bodyEdges(bodies)` minus the lines along `through` at an arc's chord
  vertices and at an arc's tangent ends (the slow path is the oracle; inscribed chords make it draw a crease there),
  within `BODY_EPS`.
- `boardEdges` and `partGeometry.edges` take this path for a part with curves; a part without curves is unchanged.

*As built (chunk 1, Task 7 and its review ruling):* `unionOutline` and `SECTION_EPS` moved to `document/outline.ts`
(re-exported by `section.ts`), shared by the caps and `curvedEdges`. A line at a smooth outline point is suppressed **per
interval**, only where its wings are that curve's chord faces and the tangent-continuing face — never as a whole line, which
erased a real crease where another feature meets a tangent point (a dado wall at a corner's tangent end; pinned by an
independent fixture). A face is judged slanted against the matching plane's own axis only (testing every through axis made a
two-axis part nearly as slow as the slow path). With curves through two dimensions, an outline segment lying on another
curve's smooth line is skipped too, and every case asserts no line is drawn twice.

### 3.4 Rendering (`bodyMesh`, `BoardMesh`)

- Curved bodies render through `bodyMesh` like any non-box body.
- **Smooth shading**: a face tagged `curve` gets vertex normals from the true arc (the radial direction at each vertex),
  not from its chord, so an arch does not look faceted; `BoardMesh` uses the normals `bodyMesh` returns for such
  geometry instead of `computeVertexNormals`. Flat faces keep flat normals.
- **Seams**: the split path makes internal coplanar faces between pieces. `bodyMesh` drops them for a curved part (holes'
  seam-face subtraction, invariant 50, extended from holed bodies to split curved bodies), so a FADED part shows no
  internal walls.
- **Grain** (invariant 35, the user's ruling): a curve-tagged face takes the plan of the world axis its normal is nearest,
  as a sloped face does. Around an arc that plan switches partway, so the grain shows a seam there. Accepted this round;
  recorded with fu 336 (the wall-grain seam inside a bore), for the user's texture/shader session.
- **Section caps** (invariant 51) read the bodies: a curved part caps with no new code (caps measured 0.6–2 ms).

*Amended (implementation, chunk 1, final review — for the user's review): a curved part's mesh and cap are WATERTIGHT.*
The live check saw light pinholes in an arched apron's ground shadow along the arch and faint specks on its section cap;
the final review measured 90 unmatched directed edges in the default arch's merged mesh — T-junctions, where one slice's
chord vertex lies inside its neighbour's edge and the two triangulations do not share it. So:
- **Every body of a curved part renders through `bodyMesh`**, a box cell beside the slices included (`drawsAsBox`: a box
  no hole reaches, on a part WITHOUT curves, is the one routing decision BoardMesh reads). That replaces "curved bodies
  render through `bodyMesh`" above.
- **Seams are dropped for every body of a curved part** (not only split bodies; a box cell's walls against the slices
  too), and the "Seams" bullet reads so.
- Per part, once per frozen bodies array: every vertex is **welded** (within `CONFORM_EPS = 1e-7`; a crown at mid-length
  gives 0 in one slice and 1.8e-15 in the next, which Float32 keeps apart), and every drawn face takes, by **vertex
  insertion**, every welded part vertex lying strictly inside one of its edges (the candidates' own objects, never a
  projection — the uncovered remainder's corners included, e.g. a dado floor's), then is fanned from its **centroid** (a
  vertex-0 fan makes zero-area triangles, which are dropped, reopening the crack). `viewport/conform.ts`.
- **The cap** (`viewport/capFill.ts`, the fan moved out of BoardMesh): for a curved part each piece takes the other
  pieces' vertices on its edges and is centroid-fanned; a part without curves fans exactly as before.
- Pinned: `curvesWatertight.test.ts` (every directed edge matched by its reverse, exact Float32 keys, on the arch, notch, a
  lengthened bow, an L-notch and an arch beside a dado; every cap edge matched or on the outline);
  `bodyMeshIdentity.test.ts` (holed multi-body parts without curves hash byte-for-byte as on master).
- The live re-check found the shadow and cap clean (llvmpipe). **Limit:** a face a HOLE reaches still triangulates through
  `faceTriangles` (earcut drops collinear inserted points), so a holed face of a curved part may keep T-junctions (fu 369).

### 3.5 Snap points and picking

- New snap points: each arc's two ends; an arc's crown (its midpoint); the arc's centre — which can sit in air or off the
  part entirely: the exception invariant 16 already makes for a hole's centre (it is the centre of a drawn arc). A centre
  off the part's face is not offered.
- `stockProbe` reads the bodies, so the waste is air.
- Picking and the section's `keptBySection` are unchanged (they read meshes and points).

*Amended (planning chunk 1, approved by the user 2026-10-15) — P3, air at the waste's straight sides:* for the stock probe,
a point inside the closed waste is air, except a point ON an arc or on a straight side that is not on the part's face
boundary — those are the kept surface. So the lattice point in the middle of an arched edge is withheld (it is gone), and an
arc's end is kept (`isAir`).

*Amended (planning chunk 1, approved by the user 2026-10-15) — P5, snap kinds:* an arc's ends are `'corner'`, its crown
`'edge-mid'`, its centre `'face-center'` (the hole-centre precedent), each on both faces square to `through`; a point outside
the face rectangle is not offered.

### 3.6 Performance — `viewport/curvesPerf.test.ts`

The timing spike (2026-10-15, throwaway, the real code with injected bodies; minimum of several runs):

| Part | Chords | Bodies | Edges (`bodyEdges`) | One drawing | Mesh | Cap |
|---|---|---|---|---|---|---|
| Arched apron 30 × 5, 24" span, 1½" rise | 18 | 20 | 25 ms | 25 ms | 1 ms | 0.6 ms |
| Top 36 × 20, four 2" corners | 12 / corner | 1 | 18 ms | 19 ms | 2 ms | 2 ms |
| Arched apron | 48 | 50 | 135 ms | 131 ms | 2 ms | 1.3 ms |

The guard, as `holesPerf.test.ts`: an arched apron (18 chords) and the rounded top, each a full rebuild — `partGeometry`
with edges, plus every body's `bodyMesh` — at most **40 ms**, the MINIMUM of 9 runs (load only inflates a run; still
wall-clock, fu 340's caveat). With the direct edges the target is well under it; a regression to rediscovered edges fails
it.

*As built (chunk 1, Task 8 and the final fix wave):* four cases. The arch, the rounded top, and an arch with its arched edge
rounded through the length (two through axes) at **40 ms**; measured after the watertight fix about 7–13, 7 and 19–22 ms
(loaded machine). An **L-shaped notch** (a non-convex waste, ear-clipped into 14 pieces, 83 bodies, 477 faces) at **100
ms** — the holes guard's bound for an unusual case, ruled because no preset authors a non-convex waste (only a hand-edited
file can): about 48–54 ms before the fix (bodies 4, edges 35 on frozen bodies, mesh 8), 62–72 ms after (the conform pass).
The upstream causes are fu 368.

## 4. Bench numbers

### 4.1 The line — `curveText.ts`

`curveLine(board, curve)` in a new `curveText.ts` (→ units, the edge rule: it builds strings a person reads) builds every
string a curve prints (invariant 19), in the document's units, with the derived radius in brackets for the trammel:

| Kind | Reads as |
|---|---|
| Arch | `Arch on the width min side, 3" in from each length end: 24" span, 1-1/2" rise (radius 48-3/4")` |
| Arch, off-centre | `Arch on the width min side, from 3" to 21" from the length min end: 1-1/2" rise (radius …)` |
| Notch | `Half-round notch on the width min side, 2" wide, centred 15" from the length min end (radius 1")` |
| Bow (an 18" rail) | `Bow the width min side 1/2" (radius 81-1/4")` |
| Corner | `Round the corner of the length max end and the width min side to a 2" radius` |
| Four equal corners on one face | `Round all four corners to a 2" radius` (one line on the cut list, §4.2) |
| No canonical form | `Curve cut through the thickness: <n> arcs and <m> lines` (the row shows only this and Remove) |
| Metric | `Arch on the width min side, 76 mm in from each length end: 610 mm span, 38 mm rise (radius 1238 mm)` |

*Corrected (writing):* the conversation's examples read `on the bottom edge`, `the left end`, `the top-left corner`. Sloyd
has one face vocabulary — `edgeName` / `endWord` in `holeText.ts` (`the width min side`, `the length max end`; a length face
is an END, fu 300) — shared by Holes and Angles, and a part has no "bottom" or "left" of its own (its pose decides that).
The lines use it.

- Every length through `formatLength` / the document's `Units` (invariant 52), at the document's precision; the radius
  is derived and rounded only for display.
- The cut through a dimension other than the thickness says so: `Bow the thickness min side 1/2", cut through the width …`.
- A faulted curve's line ends `— check: runs past the length max end` / `— check: cuts right through to the width max side`
  (fault words have one home, `curveFaultText`, shared with the row's note — holes' amended §4.1 pattern).
- Curve lines print after the hole lines, in stored order.

*Amended (planning chunk 1, approved by the user 2026-10-15) — P7, through-suffix placement:* a curve cut through a dimension
other than the thickness ends its line `, cut through the width` AFTER the radius bracket — `Bow the thickness min side 1/2"
(radius 225-1/4"), cut through the width` (as seen live).

*Amended (planning chunk 1, approved by the user 2026-10-15) — P4 and P2:* the `cuts-through` suffix reads `— check: cuts
right through the part` (P4, §2.5). A Bow whose stored span differs from its edge (a resize does not stretch it, P2, §8)
reads `Bow the width min side 1/2" over 18" from the length min end (radius …)`. A faulted line with more than one fault
ends `… (and 1 more)`, as holes' does.

### 4.2 Grouping

Parts share a cut-list row only if their curves are equal by `CURVE_FIELDS` — every field but `id`, compared exactly, the
segment list included — as an order-independent multiset (holes' `holeSignature` pattern). The row lists each distinct
curve's line once; four corner curves with equal radius on one face collapse to the "all four" line. A curved part still
**buys its box** (invariant 18: stock, not remainder): board feet, Buying and sheet nesting are unchanged.

## 5. Drawings (chunk 2)

### 5.1 Plans sheet

The sheet already draws curved parts after chunk 1 — `drawView` reads `partGeometry`'s edges and occludes with the bodies —
at the model's tolerance. Chunk 2 draws arcs at a finer one on paper, as hole rims do (96-gons on the sheet, 48 in the
viewport): `DRAWING_CURVE_TOLERANCE = 0.001` inches, capped at 96 chords per arc, for the outline lines only. Occluders stay
the model's bodies (a chord's worst gap to the arc is 0.005", far below a printed line's width). No dimension callouts on
curves this round (with fu 252 and 333).

### 5.2 Part diagrams

- In the view looking down a curve's `through`: the waste outline is drawn (the drawing tolerance), clipped to the part.
- In the other views: a line across the part at each SHARP outline vertex, matching the viewport's lines (§3.3).
- Each curve's bench line (§4.1) as an HTML note under the figure — never a measured SVG label (invariant 19, as hole and
  angle-cut notes).

## 6. Schema, mirroring, links, holes

### 6.1 Schema 17 and `CURVE_FIELDS`

A document-level step with no per-board work: parts and shapes default `curves: []`, a malformed entry dropped (§2.3), an
unknown segment type refusing the document (§2.4). Versioning row: `16→17 · curves (default [], malformed entry dropped,
unknown segment type refuses) · document-level, no step · silent loss on round trip (every curve dropped)`. Rolling back
past 17 strands every project saved since: export first. `CURRENT_VERSION` becomes 17.

`CURVE_FIELDS` (`curves.ts`) is the one "same curve" table, checked against `CurveCut` by `satisfies` (invariant 40): every
field but `id`, exact, segments compared field by field in order.

### 6.2 Mirroring, links and the tree

- **Mirroring** (invariant 44): `mirrorCurveCut` flips `uFrom` when u is the mirrored dimension, `vFrom` when v is, nothing
  when `through` is — never arithmetic on coordinates, and `side` is untouched (it is defined on stored numbers, §2.1).
  `lowerCurves` is its exact inverse, reusing an untouched stored array. Tested with `chiralPart` under every turn,
  posture and mirror; mutate the fixture.
- **Links** (invariant 45): `curves` is SHARED in `LINK_FIELDS`; `sameShared` compares curves in order, ids included, as it
  does cuts, angle cuts and holes; the `_sharedPrimitives` guard gains `curves`.
- **Every site that carries cuts, angle cuts and holes carries curves**: `resolveBoard`, `copyBoard` (Copy, Duplicate,
  Copy in a row), Make Unique, Group/Ungroup, `writeBackFlat`, `treeEdit`'s write-back (changed fields only), export and
  import. Each has a test that fails when its `curves` line is removed — mutate each.
- **Ids** (invariant 33): curve ids per board (per shape for a shape).
- **Re-orient** (invariant 2): `curves` is absent from the reorient predicate, like `cuts`, `angleCuts` and `holes`.
- **Exploded** (invariant 47): curve edits go through `edit()`, refused while exploded.

### 6.3 Holes and curves

`holeFaults` gains one case: a hole whose cylinder meets a curve's waste (the exact region: lines and true arcs, within
`BODY_EPS`; touching is meeting) is a `breaks-out` fault naming the curve (`hole 3 runs into the arch`, through
`holeFaultText`). The existing rules apply both ways: an add or edit that ADDS the fault is refused — of a hole, by the
Holes row; of a curve, by the Curves row (`Puts hole 3 into the arch — move it first.`); a fault a later resize causes is
kept and noted. `holeInStock` (the clean test) counts it, so such a hole's wall is clipped (invariant 50).

*Amended (implementation, chunk 1, final review — for the user's review):* "refused both ways" needs the curve fault to be
told apart from an edge fault. `faultKey` (`holeText.ts`) keys a breaks-out as `…:breaks-out:edge` or
`…:breaks-out:curve:<id>`, and `distinctFaults` uses the same key, so a hole ALREADY past an edge (a resize faulted it) is
still refused into an arch, from either row, and a hole both past an edge and in a curve's waste can still be edited back
(invariant 50's rule). Its line then counts both: `— check: hole 1 runs past the width min side (and 1 more)`. The Holes
row's refusal for it reads `Puts hole 1 into the arch — move it first.` (Task 10 review: the edge wording crashed on a
fault with no edge).

Rectangular cuts and angle cuts combine with curves freely through the bodies; no refusal.

## 7. Refusals — Claude features

- Add joinery, Refine and Repair joints **refuse** a document containing any curve, at entry, before any mutation and any
  paid call, through `curvedRefusal` (`curvedParts`, the `holedRefusal` pattern) wired where `holedRefusal` is
  (`joineryRefusal`, `documentToDesign` / `plainForRefine`). The message names the parts: *"Add joinery doesn't handle
  parts with curves yet (Apron 1, Apron 2). Add joinery before cutting the curves, or remove them first."*
- Repair joints is withheld, as for holes.
- Generate's `designToDocument` emits `curves: []`; `DESIGN_SCHEMA` is byte-identical (fixture-pinned).
- `turnCandidates` returns none for a curved part.
- **The design checks never see a curve** this round: `checkDesign` (overlap, held, tip, contact) runs only inside
  Generate and Refine, both of which refuse or never write curves. Making them curve-aware is a follow-up (§12).
- Tests assert no mutation and no call, never message text.

## 8. Authoring (Properties)

- A **Curves** section after Holes, for a single selected part, inside the edit-lock fieldset (invariant 47). Not offered
  for multi-selection.
- **+ Add curve ▾** (Popover; Escape on its subtree, invariant 27):

  | Preset | Adds | Default |
  |---|---|---|
  | Arch | one Arch through the thickness on the width min side | 3" in from each length end; rise = the smaller of 1½" and ¼ of the v dimension |
  | Half-round notch | an Arch with rise = half its span | 2" span, centred on the side |
  | Bow | a Bow of the width min side | rise ½", or ¼ of the v dimension if less |
  | Rounded corner | one corner (length min / width min) | radius 1", or ¼ of the face's smaller dimension if less |
  | Rounded corners | all four corners of the face, ONE undo entry (as Miter both ends) | as above |

  A preset whose default would fault on this part (§2.5) is **withheld**, not added and refused (an Arch on a part under
  6" long; a Rounded corners on a face too small for its default).
- **Row controls by derived kind** (Arch and Notch share one row type):
  - Arch: **Through** (thickness / width / length) · **Side** (the edge, in `edgeName` words) · **From** (which end the
    positions count from) · **Start** · **Span** · **Rise**.
  - Bow: **Through** · **Side** · **Rise**.
  - Rounded corner: **Through** · **Corner** (the two ends' words) · **Radius**.
  - No canonical form: the bench line and Remove.
- Fields are `DimensionField`s in the document's units (invariant 52): they **refuse** out-of-range input and never clamp
  (invariant 5); Enter commits and blurs. A refusal is returned as the field's own message (`onCommit` returning a string,
  holes chunk 1 R7). Changing Through re-seats the curve on the new face's u/v (a select change, refused if the result
  faults).
- Every edit is checked by `curveFaults` and `holeFaults` on the result **before** `updateCurve`, refusing only a fault it
  ADDS. Refusals read: `An arc is at most a half circle — reduce the Rise first.` / `Removes more than the width — reduce
  the Rise first.` / `Runs past the length max end — reduce the Span first.` / `A radius can't exceed the width — reduce
  it first.` / `Puts hole 3 into the arch — move it first.` The select stays on the stored value.
- A fault a later edit caused shows as a note on the row; Remove always works.
- Store actions `addCurves` / `updateCurve` / `removeCurve`: through `edit()` (one undo entry, autosave), written back
  through `treeEdit` (invariant 46); held points re-judged with `dropHeldIfGone` AFTER the edit (invariant 24,
  point-precise: a new curve can remove a grabbed corner).

*Amended (planning chunk 1, approved by the user 2026-10-15) — P2, a Bow is stored at the edge's length when written; a
resize does not stretch it.* Every Bow edit (Rise, Through, Side) rewrites it at the CURRENT edge length (a refit). When the
stored span differs from the edge, the bench line says `… over 18" from the length min end …` (§4.1) and the row's note
reads `Spans 18" of this 24" length — change the Rise to refit it.` (Positions are stored, as every cut's are; stretching on
resize would be a hidden write.)

*Amended (implementation, chunk 1, Task 14 rulings and the final review — for the user's review):*
- **The half-circle refusal is judged on EVERY edit**, typed or selected (`pastHalfCircle`, the loader's own EXACT rule:
  a rise over half its chord, a radius under half, or no chord). The loader DROPS such an arc, so an unrefused edit would be
  silently lost on the next load. It refuses a Span under twice the Rise and a Bow's Rise past half its edge as well as the
  Arch's Rise, and a select change too (a faulted Bow re-seated through the length was refit to a 0.75" span at its old
  rise). Exactly a half circle is accepted (the notch). It always reads `… — reduce the Rise first.` (a corner's chord is
  r√2, so its Radius can never trip it).
- **The refusal words as built:** `An arc is at most a half circle — reduce the Rise first.` / `Removes more than the width
  — reduce the Rise first.` / `Runs past the length max end — reduce the Span first.` / for a corner, `A radius can't run
  past the length max end — reduce it first.` (not "exceed the width") / `Puts hole 3 into the arch — move it first.` A
  SELECT change (no field) names the field that sizes the kind: a Bow's Rise, a corner's Radius, else Span (final review:
  a Bow re-seated onto a short side said "reduce the Span", and a Bow has no Span).
- A typed refusal is the field's own message (holes R7); a select's is a row-level alert, the select left on the stored
  value. A preset is withheld when it is null, faults, or would put a hole into its waste; when none fits the section reads
  `No curve preset fits this part.` The row's stored fault shows as `Runs past the length max end at this size.`

## 9. Testing

- **`curves.ts`**: chord vertices on the true arc; the chord count meets the tolerance and the cap; rise ↔ radius both ways;
  `bowsInto` for every canonical form; `deriveCurveKind` and each reader round-tripping its writer; a form no row can
  represent returns null.
- **Validation**: every drop case in §2.3, the touching (Bow) case kept, a crossing outline dropped; §2.4's refusal on every
  load path (open, import, autosave-restore) with nothing written.
- **`curveFaults`** at every boundary: an outline ON the face edge (allowed) and 1e-6 past (faulted); a rise equal to the
  width (cuts through) and 1e-6 less (not).
- **Bodies**: total volume equals the exact face area minus each waste's exact area (arcs as true circular segments), times
  the through dimension, within the chord tolerance's bound; both geometry paths agree on a part where both apply; a part
  with no curves byte-identical.
- **Edges**: equal to `bodyEdges(bodies)` minus facet lines, for an arch, a notch, a bow, four corners, a curve through the
  width and through the length, a curved part with a dado, and one with a chamfer.
- **Mesh**: tagged faces carry radial normals; no internal seam faces in a split part; triangle area equals face area.
- **Equivariance**: `chiralPart` with an asymmetric arch under every turn, posture and mirror (invariant 44); mutate it.
- **Every §6.2 site**: a test that fails without its `curves` line — mutate each.
- **Holes**: a hole into an arch's waste is `breaks-out`; tangent passes; refused both ways; kept after a resize.
- **Bench lines**: every row of §4.1's table, imperial and metric; the fault suffix; the four-corner collapse.
- **Grouping**: equal as a multiset, ids ignored; one differing rise splits the row.
- **Refusals**: no mutation, no call; `DESIGN_SCHEMA` byte-identical.
- **Performance**: `curvesPerf.test.ts` (§3.6).
- **Viewport**: the dev server in the Playwright browser, DOM readouts first, `docs/img` for spatial findings, in
  `docs/browser-verification-curves.md`: presets, rows, refusals, snap points, the section cut through an arch, a faded
  curved part, print. Smooth shading and the grain seam: the user, on real hardware (fu 26a: software GL hides shading
  faults).
- Every plan-supplied test is mutated before it is trusted.

## 10. Chunks

1. **Primitive through bench**: schema 17 and the refusal gate; `curves.ts`, `curveFaults`; bodies (both paths), direct edges,
   `partGeometry` / `geometryKey` / `boardUVSignature`; rendering (smooth normals, seams); snap points and `stockProbe`;
   mirroring, links and every §6.2 site; holes meeting curves; the §7 refusals; `curveText.ts`, the cut-list lines and
   grouping; Properties with every preset; `curvesPerf.test.ts`. The schema bump, and the rollback cost, land here. The
   Plans sheet shows curves from here on, at the model's tolerance.
2. **Drawings**: the finer Plans-sheet arcs (§5.1); part-diagram outlines, sharp-vertex lines and notes (§5.2).

When each chunk deploys is the user's word at the time.

## 11. Invariants amended (for CLAUDE.md when the round ships)

- **2**: `curves` is absent from the reorient predicate.
- **15**: `boardUVSignature` includes curves.
- **16**: an arc draws its outline on every plane square to its `through` and a line along `through` only at a sharp outline
  vertex — no facet lines; an arc's centre snap point may sit in air (the hole-centre exception, extended).
- **33**: curve ids per board / per shape.
- **35**: a curve-tagged face takes the plan of its nearest world axis; the seam where it switches is accepted (fu 336).
- **40**: `CURVE_FIELDS` is the one "same curve" table.
- **44**: a reflection flips `uFrom` / `vFrom`, never arithmetic on coordinates; `side` is defined on stored numbers.
- **45**: `curves` is shared.
- **48**: `boardBodies` is the ONE place curves become bodies too (convex: clipped, or split along chords).
- **50**: seam faces are dropped in split curved bodies too; `holeFaults`' `breaks-out` includes a curve's waste.
- **New (53)**: `curves.ts` is the ONE place curves become outlines; `curveFaults` the ONE fault decider (refused at
  authoring when ADDED, kept with a note when a later edit causes it); a curved part's edges are BUILT (outline + sharp
  vertices + `bodyEdges` on the rest), never `bodyEdges` over its slices; an unknown segment type refuses the document;
  `curvesPerf.test.ts` guards the rebuild.

*As written into CLAUDE.md (records, chunk 1):* 50's seam clause covers EVERY body of a curved part (not only split
bodies — §3.4's watertight amendment), and adds the watertight rule (welded, conformed, centroid-fanned; `drawsAsBox`;
`curvesWatertight.test.ts`); 51 names `capFill` as the cap fan's home; 53 also carries the strengthened clip decider
(§3.2), the half-circle refusal on every edit (§8) and the fine `faultKey` (§6.3).

## 12. Follow-ups this round leaves

Filed 2026-10-15 in `docs/follow-ups.md` as 361–373 (the grain seam appended to fu 336, not a new number): chunk 2's
drawings 361; callouts 362; Claude features 363; splines 364; stopped curves and edge profiles 365; compound curves 366;
change-kind control 367; then the round's own residue — rebuild cost of a non-convex waste 368, holed faces of a curved
part 369, real-hardware looks 370, record-only minors 371–373.

- Grain on curved faces — recorded with fu 336 (the user's texture/shader session).
- Dimension callouts on curves (radius, rise) on the Plans sheet (with fu 252, 333).
- Claude features on curves: joinery and Repair accepting curved parts (refusing only a joint a curve runs into); Generate
  and Refine reading and writing curves; the design checks (overlap, held, tip, contact) reading curved bodies.
- Splines and free curves (a new segment type; no schema bump, §2.4).
- Stopped curved cuts and edge profiles (roundover, cove, ogee).
- Compound curves (a cabriole leg) designed as such.
- A curve's row control to change its kind (an Arch into a Bow) — the user removes and re-adds this round.
