# Sloyd — counterbores and countersinks: design

Status: MERGED `4f73858` and DEPLOYED 2026-10-29 as `index-D9SIz2nX.js` (schema 30) (the *Amended (build)* block at the end awaits the user's approval). APPROVED by the user 2026-10-29 ("Approved, write the plan"); builder check taken 2026-10-29 (one question for the user — Refine, §9, answered "Keep assembly whole"; two settled as my calls, §4.1, §4.3). Follow-up 330 (`docs/follow-ups.md`), chunk 1. The holes primitive
is `docs/superpowers/specs/2026-10-14-sloyd-holes-design.md`; the tilt (schema 23) is
`docs/superpowers/specs/2026-10-24-sloyd-angled-holes-design.md`, whose layout this follows.

The feature-gaps table is exhausted but for construction lines (fu 130, set aside); the user picked fu 330 from the
residue and asked to skip the design questions ("just write the spec from the code"). So every decision below that is not
quoted from the user is **my call** and is marked. The read-only survey behind it (every `HoleRow` and `Hole` reader, file
by file) is summarised in §10.

## 1. What and why

Every screwed joint starts with a bore the screw head sits in: a **countersink** (a cone, for a flat-head screw flush with
the face) or a **counterbore** (a wider, shallower flat-bottomed step, for a pan or washer head, or to take a wood plug
over the screw). Sloyd can bore a hole but cannot step it: two concentric rows are refused as `meets-hole` (holes spec
§2.4), so today a counterbore is either left off the model or faked as a single larger hole, and the cut list carries
neither.

This chunk lets a hole row carry a **head**: a counterbore or a countersink at its mouth, stored, drawn, faulted,
cut-listed and exported exactly.

**Cam-and-bolt is split out (my call; §12).** fu 330 names it beside the other two, but it is a different problem: two rows
in one part meeting at right angles (a face bore for the cam, an edge bore for the bolt), plus a bore in the mating part.
It needs a `meets-hole` exemption for a pair that meets on purpose and a rule for which pair qualifies; it brushes hardware
(fu 404). A head is one row, concentric, and needs neither.

## 2. Goals, non-goals, anti-goals

**Goals**
- (G1) A square hole row may carry a head: a counterbore (diameter, depth) or a countersink (diameter, included angle).
- (G2) Every hole reader is correct for a headed row: viewport mesh, rims, the section cut, drawings and the Plans
  sheet's part diagrams, feature callouts, faults, the bench line, the cut list's grouping, links and mirrors.
- (G3) Two presets: **Countersunk screw** and **Counterbored screw** (§4.3).

**Non-goals for this chunk**
- Cam-and-bolt (§12), and any other pair of holes meeting on purpose.
- A head on a TILTED row, and a tilt on a headed row (refused both ways, §3.3). A pocket screw is a counterbore at about
  15° — a real later want (new follow-up), not a never.
- Generate or Refine authoring a head (the design form is unchanged, fu 322; §9).
- Hardware derived from a headed row (inv 55: hardware is typed, never derived from holes; fu 404 stays open).
- Plugs as parts, and a plug's own cut-list line.
- A head at the exit of a through bore (counterboring from both faces).

**Anti-goals** (failure even if it "works")
- **A document with no headed row is byte for byte as before**: meshes, rims, drawings, diagrams, caps, faults, the cut
  list, export, `holeRowValues` key strings, and every identity and perf test (`holesSquare.snapshot.json`,
  `bodyMeshIdentity`, `drawingIdentity`, `diagramIdentity`, `sweptIdentity`, `holesPerf`, `curvesPerf`). A headless row's
  `Hole` objects gain no defined key (the snapshot compares with `toEqual`).
- **No head is ever lost silently.** A build, converter or AI path that cannot carry a head refuses or keeps the part; it
  never drills the plain bore.
- **A fault may over-report for a headed row, never under-report** (§6.3): the unclipped clean-hole mesh path trusts
  `holeInStock`, so an unflagged break-out draws a wall through air.
- Perf budgets are not raised to admit headed rows; they are met.

## 3. The model (schema 30)

### 3.1 Stored form

Flat optional scalars on `HoleRow` (my call; the survey's finding): a nested object would be shared by `copyHoleRow`'s
spread (two parts holding one object) and would never compare equal under `unjoin.ts`' `===` on non-numbers.

- `head?: 'counterbore' | 'countersink'` — present only when the row has a head;
- `headDiameter?: number` — the head's diameter at the face, inches, exact (both kinds);
- `headDepth?: number` — **counterbore only**: the step's depth from the entry face, inches, exact;
- `headAngle?: 82 | 90` — **countersink only**: the bit's included angle in degrees.

Present together or not at all: a counterbore stores `head`, `headDiameter`, `headDepth` and no `headAngle`; a countersink
stores `head`, `headDiameter`, `headAngle` and no `headDepth`. A headless row stores none of the four keys.

- **The countersink's depth is DERIVED, never stored** (my call; the curves `rise`/`radius` precedent): axial depth
  `(headDiameter − diameter) / 2 / tan(headAngle / 2)`. One home for it (`headReach`, in `holes.ts`).
- **The angle is stored in degrees from a closed set** (my call). The rule "degrees exist only in display and typed input"
  exists because a typed angle becomes a slope that geometry reads; a countersink's angle names a bit you own (82° for
  imperial flat-head screws, 90° for metric), is never typed freely, and is read only through `headReach`. The loader keeps
  exactly `82` or `90` and drops anything else. A later angle (100°, 60°) is a content-keyed addition with no bump.
- **`HOLE_FIELDS`** lists all four (inv 40: "same hole" includes the head). **`holeRowValues`** appends, for EACH PRESENT
  key, the key's NAME then its value, in `HOLE_KEYS` order (angled-holes Ruling P1's form), so a headless row's array is
  unchanged and a counterbore never equals a countersink of the same numbers.
- **Mirrors:** a head is symmetric about the bore's axis, so `mirrorHoleRow` carries it unchanged (inv 44 holds as
  written). **Links** share it with the rest of the row (inv 45; no new `LINK_FIELDS` entry).

### 3.2 Legality (loader and store alike)

A head is legal when, with `r` the bore radius and `R = headDiameter / 2`:
- `headDiameter` is finite and `> diameter` (strictly);
- a counterbore's `headDepth` is finite and `> 0`, and for a blind row `< depth` (strictly: equal would leave no bore);
- a countersink's `headAngle` is `82` or `90`, and for a blind row its derived reach `< depth`;
- the row is square (no `tiltAlong` or `tiltAcross`, §3.3);
- every number within `MAX_MAGNITUDE`.

The **loader DROPS a row whose head is malformed or illegal** (a malformed entry is dropped, per Versioning; dropping the
head alone would drill a plain bore, which the anti-goal forbids). The **store refuses** the same cases, one sentence
each, before any mutation. What depends on the part's size (a head deeper than a through row's part, a head past an
edge) is a FAULT, not a legality rule (§6.3), so a resize can fault a head and the row is KEPT and noted (inv 50).

### 3.3 Tilt and head, refused both ways

A head on a tilted row needs elliptical head rings, a stepped capsule for `meets-hole` and a tilted cone; every tilted
branch would double. In this chunk: adding a head to a tilted row is refused (`A tilted hole can't take a counterbore or
countersink yet.`), tilting a headed row is refused (`Remove the counterbore or countersink before tilting the hole.`),
`retilt` never applies to a headed row (no tilt to carry), and the loader drops a row carrying both. Bore leg sockets and
Add stretcher write headless rows, so they are untouched. Wording is the builder's.

### 3.4 Schema 29 → 30

- **Harm argument (this field's own):** `validateHoleRows` rebuilds every row field by field (`document.ts`), so a schema-29
  build (production today, `4420042`) would load a headed row, drop the four keys without a word, drill the plain bore —
  and autosave it. A 30 file must be refused by a 29 build.
- **The step** adds nothing (absent is headless). Validation per §3.2.
- **Rollback:** the nearest refusing boundary becomes `4420042` (`index-CUJBW7-r.js`, schema 29): it refuses every project
  saved at 30. `docs/versioning.md` and `docs/rounds.md`' rollback table get their rows.

## 4. Properties

### 4.1 The Head control

In the Holes section each row gets a **Head** select below Through/Depth: `None` / `Counterbore` / `Countersink` (my
call). Choosing one shows its fields; `None` removes all four keys in one edit.
- **Counterbore:** `Head dia` and `Head depth` (`DimensionField`s, each formatted as its bore twin is today: `Head dia`
  as Diameter, through `holeLengthText(…, 'diameter')` at 0.1 mm metric; `Head depth` as Depth, plain `formatLength`,
  whole mm metric — builder check: only diameter and pitch read 0.1 mm today).
- **Countersink:** `Head dia` and an `Angle` select, `82°` / `90°`; a read-only note gives the derived depth.
- **Defaults when a head is first chosen** (my call): counterbore `headDiameter = 2 × diameter`, `headDepth` = the smaller
  of `diameter` and half the blind depth (half the part's face dimension for a through row); countersink `headDiameter =
  2 × diameter`, angle 82° in an imperial project, 90° in a metric one. A default that faults or is illegal is reported as
  the select's error and nothing is written (the panel's existing rule).
- **Refusals** follow the Holes section: legality (§3.2) always; faults only when the edit ADDS one (inv 50), decided before
  any mutation, as the field's own error (`DimensionField`'s contract). Changing the bore's diameter or depth is checked
  against the head the same way (a bore widened to the head's diameter is refused as illegal).
- On a TILTED row the select is disabled with §3.3's sentence as its note.

### 4.2 Readout

A headed row's summary line (the row header the panel already shows) reads its head through `holeHeadText` (§8), e.g.
`3/16" dia through, 3/8" counterbore 3/8" deep` / `… 3/8" countersink, 82°`. Wording is the builder's.

### 4.3 Presets (G3)

Two new items in `+ Add hole`, each a single bore centred on the broad face like `Hole` (`defaultHole`'s placement), my
calls, sized for a #8 wood screw (the common cabinet screw) in an imperial project and its 4 mm metric counterpart:

| preset | imperial | metric |
|---|---|---|
| Countersunk screw | 3/16" through, countersink 3/8" at 82° | 4.5 mm through, countersink 9 mm at 90° |
| Counterbored screw | 3/16" through, counterbore 3/8" × 3/8" deep (takes a 3/8" plug) | 4.5 mm through, counterbore 10 mm × 10 mm deep |

The bore is through when the face dimension is 1½" or less, and blind at 1¼" on thicker stock (my call, settled after
the builder check: NOT `defaultHole`'s ½" rule, which would give ¾" stock a ½"-deep clearance hole; a screw clearance hole
through a thick leg is not what anyone means). Withheld when its default faults,
as every preset (`fits`). The existing presets are unchanged.

## 5. Bores that are joints

- **A headed row is never a socket** (`isSocketOf`, `staleSocketOf`) and **never seats a tenon** (`tenonJoints.ts`
  `seatedIn` requires a headless row) — my call, conservative: it can only report a part as unsupported, never grant
  support (inv 58: support is never granted by proximity). Stretchers inherit both.
- Bore leg sockets never replaces a headed row as stale (it is not a socket).

## 6. Geometry

### 6.1 The bore

A headed bore is the **union of two coaxial convex pieces**: the head (a cylinder of radius `R` over `[0, headDepth]`,
or a frustum from `R` at the face to `r` at `headReach`) and the bore (radius `r` over `[0, reach]`, as today; over the
head's span it lies inside the head). A polygonal frustum is still one convex polytope with planar (slanted) facets, so
`clipPlan`, `minusPrism`, `touchesPrism` and `clipPolygon` are reused unchanged; only the mesh wall's normals and the ring
radii are new (my call; the survey listed the cone as "needing a variant", which is true of the mesh, not the clip maths).
Bodies are cut by both pieces; `boardBodies` stays hole-free and convex (inv 48, 50).

- **Where the head lives** (new fields on `Hole`, or a separate derived head piece per hole) is the builder's, under two
  constraints: a headless row's `Hole` gains no defined key, and per-hole memoisation by the frozen `Hole`'s identity
  stays (inv 50's perf rule) — any head piece is frozen and memoised the same way.
- **Rings:** the mouth ring on the entry face is the HEAD's (radius `R`); the bottom disc or exit ring is the bore's.
  A counterbore adds a flat **annulus** at `headDepth` (outer ring `R`, inner ring `r`); a countersink adds one ring of
  radius `r` at `headReach` where cone meets bore. Every ring shares its vertices with the walls on either side, so the
  mesh is **watertight** (`curvesWatertight.test.ts` gains headed cases: a counterbore and a countersink, blind and
  through, on a plain and on a curved part).
- **Faces:** the entry plane's hole is the head ring (`faceTriangles`, `mergeHoledPlanes`, `ringDisc` read `R`).
- **Region and box tests** (`holeRegion`, `holeTouchesBox`, `insideHole`, `drawsAsBox`) contain the head. They are reject
  tests: the box must contain the whole bore.
- **The countersink wall** takes the cone's true normals (smooth shading, the swept-profile precedent).
- **Performance:** `holesPerf.test.ts` gains headed cases (a row of 20 counterbores; a countersunk row) under the same
  budgets (≤ 40 ms healthy, ≤ 100 ms faulted, the minimum of 9), never raised.

### 6.2 Section, snapping

- **Section caps** (`section.ts`) subtract the stepped profile: the head's radius for `t` within its span, the bore's past
  it; the step plane is special-cased as the mouth and bottom are today ("caps decide"), and the reach filter uses `R`.
- **Snap points:** the mouth centre as today; a counterbore adds its floor centre (on the axis at `headDepth`), the point a
  plug or a screw head seats on (my call). A countersink adds nothing.

### 6.3 Faults (inv 50)

**Spans are per piece**: the head's radius over the head's axial span, the bore's radius past it. (Judging the head's
radius over the whole depth would over-refuse a shelf-pin-like row near an edge.) Each rule:

| rule | for a headed row |
|---|---|
| `breaks-out` (edge) | exact: the head's radius `R` against the side faces (a cone's widest ring is the mouth, so `R` is exact for both kinds), the bore's `r` past the head |
| `breaks-out` into a curve or swept profile (`intoCurve`) | the head as a cylinder of radius `R` over its span — exact for a counterbore, **conservative** for a countersink |
| `off-flat` | the head's floor or cone, judged as that cylinder (exact for a counterbore's floor landing in a dado or on a cut's floor; conservative for a countersink), and the bore as today |
| `meets-hole` | same-axis and perpendicular forms judged per piece: the head's cylinder over its span, the bore past it (a countersink conservatively as its cylinder) |
| `too-deep` | a through row's head reaching the far face (`headDepth` or `headReach` ≥ the face dimension, touching counts) is `too-deep` with its own words (`the counterbore runs through the <face>`); a blind row's head cannot reach past its bore (legality) |

Inv 50's "exact closed forms" stays true for counterbores and for every headless row (unchanged code paths); a
countersink reads "exact or conservative, never sampled", as a tilted row does. Fault words stay in `holeFaultText`, the
ONE home.

## 7. Moving holes: stretch, resize, Level the ends

- **`rebaseHoles` and stretch** move station and inset only; the head rides along (no change).
- **Level the ends** (`levelEndHoles`): a blind row entering an end deepens by `e` as the mouth moves out, keeping its
  bottom in the wood. **The head keeps its depth from the mouth** (my call: a counterbore or countersink is sized to the
  screw head and cut from the face you drill from, after the end is cut). `storableRow` also checks the head's legality
  after the change; an unstorable result refuses, as Ruling T9b does.

## 8. Text, drawings and the Plans sheet

- **Bench line** (`holeText.ts`, the ONE home): `holeSizeText` gains a head clause through one new helper, `holeHeadText`,
  e.g. `Hole 3/16" dia × through, 3/8" counterbore × 3/8" deep in the …` and `…, 3/8" countersink at 82° in the …` (the
  builder's wording; the head's diameter formatted as the bore's diameter, its depth as the bore's depth). The cut list (`holeLine`) and Plans keys (`featureKeys.ts`)
  read it. Headless lines are byte for byte unchanged.
- **Cut-list grouping** reads `holeRowValues`, so a headed row never groups with a headless one (inv 40).
- **Drawings** (`holeDrawing.ts`): the entry view draws the head rim (`R`) and, below it, the step or cone-to-bore rim
  (`r`), each visible or hidden by the one hidden-line pass; side views draw the stepped (or tapered) silhouette — head
  lines over the head's span, bore lines past it, the step as a line across. The edge-on single-segment rule applies to
  each rim's plane. Feature tags stay on their segments (inv 16, 47).
- **Part diagrams** (`diagram.ts`, `PartDiagram.tsx`): a concentric head circle in the entry view; the side band is
  stepped or tapered. `DiagramHole` gains what that needs; headless diagrams are byte for byte unchanged.

## 9. AI paths, joinery and Refine

- **Generate:** unchanged. The design schema is byte for byte the same (fu 322's grammar budget is not spent).
- **Refine keeps a headed part exactly, and its ASSEMBLY whole — the box-joint/dovetail route, NOT the tilt route** (the
  user's ruling 2026-10-29, "Keep assembly whole", chosen over refusing as angled holes do and over carrying heads through
  the model). A headed part joins `keepsExactly` through the corner-joint side (`cornerJointed`'s keep behaviour), never
  through `keptForMoreThanFingers`: a headed root part is put in first, verbatim (a model part reusing its name dropped);
  a headed part inside an assembly keeps that assembly whole instead of refusing Refine; a joined Refine is ALLOWED when
  only corner-jointed and/or headed parts are kept, under inv 61's guards (a NEW site touching a kept part is fixed as
  BUTT, a recorded joint stays as recorded, and **(c)** the design comes back UNJOINED when the re-join would change a kept
  part). The kept-list wording names it (`has counterbores or countersinks`). So no head reaches the model, and none comes
  back plain.
- **The boundary (my call):** the head clause is added ONLY at Refine's keep sites (the predicate behind `keepsExactly`,
  the assembly-kept test, the joined-Refine allowance and the kept-list words). It does NOT join `cornerJointed` itself,
  whose other readers — joinery leaving a part's size and place alone, Repair's `changedDovetailed`, the finger-set claim
  sites — keep their meaning: joinery may still resize a headed part, its rows keeping their stations (faults kept and
  noted, inv 50), as for any holed part. The builder names the predicate (e.g. `keptWhole`) and states where each site
  reads it.
- **Links' turn candidates** (`roleLinks.ts` `turnCandidates`) re-store hole rows through `worldHoles` → `holeRowsFor`,
  which carry no head. They already return none for `keepsExactly` parts, so adding the head clause there covers this path
  with the same predicate as the tilt (the survey's flagged risk is closed by construction; a test pins a headed part's
  `turnCandidates` as empty).
- **Joinery and Repair** accept a headed row: `featureAllowed` and `featureZones` read `holeRegion`, which contains the
  head (§6.1). Dovetail zones (`holesZoneRefusal`) and `cornerPlan` likewise.

## 10. The survey, in brief

A read-only survey (2026-10-29) listed every `HoleRow` and `Hole` reader outside tests. The costs, largest first:
1. the mesh (`grainTiling.ts` `holeMesh`, `faceTriangles`, `mergeHoledPlanes`: the annulus, the cone wall, the head ring on
   the entry plane) under the watertight and perf guards;
2. the faults (`holeFaults.ts` `span`, `meets`, `breaksOut`, `offFlat`, `intoCurve` — per-piece spans);
3. drawings, part diagrams and section caps (stepped silhouettes, a second rim);
4. the schema bump (the loader rebuilds rows field by field and drops unknown keys silently);
5. the AI and link paths that re-store rows in world words (closed by `keepsExactly`, §9).
Readers that need nothing beyond the shared helpers: every `holeRowValues`/`HOLE_KEYS` consumer (cache keys, UV signature,
cut-list signature, links, `lowerHoles`, legSockets' `canonical`, stretchers' `rowsAgree`, `sortHoleRows`), the copy sites,
`mirrorHoleRow`, `rebaseHoles`, weight (holes ignored) and labels.

## 11. Records

- `docs/invariants.md` and CLAUDE.md: inv 50 (the head: two convex pieces, per-piece faults, the countersink's
  conservative clause, tilt and head refused together), inv 40 (`HOLE_FIELDS` with the head), inv 56 (`keepsExactly`: a headed part and its assembly kept whole, the corner-joint route), inv 61 (the joined-Refine allowance widened to headed parts), inv
  58 (a headed bore seats nothing); the Versioning line (30).
- `docs/versioning.md`, `docs/rounds.md` (rollback table: schema 30), `docs/module-map.md`.
- `docs/follow-ups.md`: 330 narrowed to cam-and-bolt (or closed with a new entry for it); new entries for AI authoring a head (so Refine can change a headed part), a head on a
  tilted row (pocket screws), a head at a through bore's exit, plugs as parts.
- `docs/feature-gaps.md`: a row (Holes' residue).
- Browser verification on the dev server: both presets added, seen, sectioned and drawn; a head edited and refused; a
  metric project's presets.

## 12. Later chunk (outline only)

**Chunk 2: cam-and-bolt.** A cam bore in a panel's face meeting a bolt bore from its edge, and the dowel or bolt bore in
the mating part; a `meets-hole` exemption for a recognised pair (perpendicular, the edge bore's axis through the face
bore), its own preset and bench line, and possibly hardware counted from it (fu 404). Its own spec.

## 13. Left to the builder

- The UI wording (§3.3, §4, §8) and the head fields' layout.
- Whether the head is fields on `Hole` or a derived piece (§6.1), within its constraints.
- The closed forms of §6.3's exact rows and the shape of the conservative ones, within "never under-report".
- How the stepped silhouettes and diagram bands are built, within byte identity for headless rows.

## Amended (build)

Recorded by the build (Task 10, 2026-10-29). **Not yet approved by the user.** Rulings are quoted from the SDD ledger; the differences are
what the task reports name.

**Rulings**
1. **R1 (Task 6): the exploded isometric (`visibleOnly`) keeps only a clean headed hole's mouth rim.** Spec §8 says visibility comes from the
   one hidden-line pass, but `visibleOnly` has no such pass and a clean headless hole already omits its walls and bottom there. Cost if wrong:
   on the exploded iso a counterbore reads like a plain hole of radius R. Follow-up 570.
2. **R2 (Task 8): the Head select sits after In from / Side (beside the tilt controls), not "below Through/Depth" as §4.1 says.** Kept for
   now, to be judged by the user by eye in the browser check. Cost if wrong: a one-line JSX move.
3. **R3 (Task 9): a new (c) sentence, `headJoinChanged`:** "Joinery would have changed <part>, which Refine keeps as it is for its
   counterbores or countersinks, so the design comes back unjoined." The box-joint sentence would be false for a headed part. A plain part in
   a mixed assembly takes the assembly's first kind's sentence. Cost if wrong: a copy tweak at the user's copy review.

**Differences from the spec as written**
- **Metric head text prints `9 mm`** (whole mm through `formatMm`), not `9.0 mm`: the plan's form was a guess. Spec §4.3's preset diameter
  `9 mm` and `10 mm` read the same way.
- **`tooDeep` for a blind headed row checks the whole row's depth** (a piece's depth is relative to its own start); a through row's head is the
  head piece's reach (Task 3).
- **A through counterbore with `headDepth` at or past the thickness is legal but faulted (`too-deep`)** and gives a bore piece of depth at or
  below 0; the mesh and the snap floor handle it (Task 4, Task 5 review).
- **The whole headed `Hole`'s own ring, prism and touches stay bore-only by design**; every reader uses `holePieces` or `holeEnvelope`
  (Task 2; the final review confirms every reader moved).
- **`radiusAt` is exact at both ends** by special case (the lerp is one ulp off for some inputs), so the cone's far ring and the bore's
  mouth ring are the same points (Task 2).
- **The loader passes any head key to `headProblem`**, so a head key without `head` is `malformed` and the row is dropped (Task 1).
- **`CornerKind` is now a string**, `definitionKind` listing box joints, dovetails and `counterbores or countersinks` joined with `and`; the
  three old outputs are byte for byte unchanged (Task 9).
- **Switching a row's head kind keeps `headDiameter`** (Task 8).
- **Not done, recorded:** the faulted headed perf case (fu 575), the oblique cone silhouettes (fu 574), the exploded-iso step rims (fu 570).
- **By eye, owed to the user:** the Head select's place, the Plans sheet's coincident rims after the hidden-line pass, the RefineDialog's longer
  kept-why string (Task 11, the browser check).
