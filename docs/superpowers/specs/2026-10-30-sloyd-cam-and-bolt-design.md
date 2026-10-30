# Sloyd — cam-and-bolt: design

Status: DRAFT, awaiting the user's approval. Builder check taken 2026-10-30 (three questions, all settled as my calls:
§4.3, §6.1/§6.2, §6.3). Follow-up 568 (`docs/follow-ups.md`; counterbores spec §12, fu 330's chunk 2).
The holes primitive is `docs/superpowers/specs/2026-10-14-sloyd-holes-design.md`; the head (schema 30) is
`docs/superpowers/specs/2026-10-29-sloyd-counterbores-design.md`, whose layout this follows.

The user asked to skip the design questions ("skip the questions"), so every decision below not quoted from the user is
**my call** and is marked. The read-only survey behind §5–§7 (every reader of `holeFaults`, `holeInStock`, `meets-hole`,
`rebaseHoles`, `levelEndHoles`, `holeInstances`, `holeRims`, `holePrism`, `holeRing`) is summarised in §10.

## 1. What and why

A cam-and-bolt fitting (Minifix-style knock-down hardware) joins a panel's end to another panel's face, as in a carcass
shelf or a bed rail. Two bores are drilled in the panel that carries the cam:
- a **cam bore** (the housing, typically 15 mm) is drilled into the broad face, near the end;
- a **bolt bore** (typically 8 mm) is drilled from the end face, along the length, until it opens into the cam bore.

The bolt's shank runs through the bolt bore and its head hooks into the cam. The bolt itself screws into a third bore in
the mating panel's face.

Sloyd cannot model the first two today. They meet, `holeFaults` reports `meets-hole`, and an add is refused. So the
fitting is either left off the model or faked, and the cut list carries neither bore. This chunk lets that **pair** of
bores exist in one part, drawn and listed as the joint it is.

## 2. Goals, non-goals, anti-goals

**Goals**
- (G1) A **cam pair** is recognised from SHAPE: a blind face bore and a blind edge bore in the same part meeting as
  §3.1 defines. A recognised pair is not a `meets-hole` fault. Nothing is stored and there is no schema change.
- (G2) Every reader is correct for a pair: the mesh (watertight), edge rims, drawings, part diagrams, section caps, the
  bench line and the cut list.
- (G3) A preset, **Cam lock**, adds both rows at one end of the selected part in one edit (one undo entry). A second
  preset, **Cam bolt bore**, adds the mating part's bore as an ordinary row (my call; §4.2).

**Non-goals for this chunk**
- **Pairing ACROSS parts** (the bolt bore in A lined up with the bolt's bore in the mating part B), and a planner that
  lays out a whole joint (A's end against B's face, N fittings, every bore in both parts). That is chunk 2 (§11), its own
  spec. Here the mating bore is an ordinary row the user places.
- **Hardware counted from a pair.** fu 568 says "possibly hardware counted from it (fu 404)", but inv 55 says hardware
  is typed, never derived from holes. That invariant stands. The user adds a hardware type as today. Chunk 2's planner may
  offer to add typed hardware uses; that is a question for that spec.
- An edge bore that runs on past the cam bore into the wood beyond, or that dips into the cam's floor, or a cam bore
  that is through. Each needs a second wall piece or a floor opening (§3.1's narrowness); each is a new follow-up.
- A tilted or headed bore in a pair.
- Generate or Refine authoring a pair on purpose. `DESIGN_SCHEMA` is unchanged (fu 322). A pair the model happens to
  write is recognised like any other (§7).

**Anti-goals** (a failure even if it "works")
- **A document with no cam pair is byte for byte as before.** That covers meshes, rims, drawings, diagrams, caps, faults,
  bench lines, the cut list and export. Every identity and perf test (`holesSquare.snapshot.json`, `bodyMeshIdentity`,
  `drawingIdentity`, `diagramIdentity`, `sweptIdentity`, `holesPerf`, `curvesPerf`) passes unchanged. An unpaired `Hole`
  gains no defined key.
- **No exemption leaks.** Two holes that meet but are not a §3.1 pair stay `meets-hole`. A third hole meeting either
  bore of a pair still faults. No planner adopts a pair's bore as a socket or a tenon seat (§6.4).
- **No air is drawn.** The bolt bore's wall stops at the cam cylinder. The cam wall shows the opening. No bottom disc,
  rim, silhouette or band end is drawn inside the cam's air.
- **Perf budgets are met, never raised.**

## 3. The pair

### 3.1 The recogniser (one home)

A new leaf module, `document/camBolt.ts`, is **the ONE recogniser** (the builder names its exports, e.g.
`camPairs(board, holes)`). It works on `Hole` instances (`holeInstances`), never on rows: count and pitch must line up
hole for hole. Let F be the face bore (radius R) and E the edge bore (radius r), every number board-local:

1. **Both square** (`!tiltedHole`), **both headless**, **both blind**.
2. **Perpendicular axes:** `E.axis ≠ F.axis`.
3. **E's axis passes through F's axis.** On the third dimension c (neither axis), `|E.centre[c] − F.centre[c]| ≤
   HOLE_EPS`.
4. **E's cross-section lies strictly inside F's depth.** Along F's axis a, E's extent `[E.centre[a] − r, E.centre[a] + r]`
   lies inside F's span `(mouth, bottom)`, with HOLE_EPS of margin at both ends. So E meets only F's wall, never its
   floor or its mouth plane.
5. **E is narrower:** `r < R − HOLE_EPS`.
6. **E opens fully into F and ends in F's air.** Let s be E's bottom's signed distance along E's axis b from F's axis,
   measured toward E's travel. Then `s² + r² ≤ R² − HOLE_EPS`, so the whole bottom disc is in F's air. E's mouth lies
   outside F, `|E.centre[b] − F.centre[b]| > R + HOLE_EPS`. (If not, F breaks out of E's entry face, which is
   `breaks-out` anyway.)
7. **One to one.** A hole belongs to at most one pair. If an F qualifies with two E's, or an E with two F's, none of
   those candidates pair and every meeting is `meets-hole` (my call: the mesh opens one window per cam).

Clause 6 uses `≤` with HOLE_EPS taken off. The builder keeps every comparison on the conservative side: a borderline
pair is NOT recognised, so it stays a fault. Each clause gets a mutation test: a one-ulp offset on clause 3, a bore
stopping short of F's wall, F too shallow for E (clause 4), a bottom past F's far wall, tilted, headed, through, and a
third hole.

**Harm argument for "no schema change"** (the argument for this field itself, per Versioning). `validateHoleRows`
(`document.ts`) drops only malformed rows. A well-formed row with a fault is KEPT (inv 50). So a build from before this
round (schema 32, `9c3b57b`) loading a pair keeps both rows and shows a kept `meets-hole` fault and a mesh that draws
through air. Nothing is lost, nothing is rewritten, and no wrong number is autosaved. There is no refusal gate to
protect, so no bump (the box-joint precedent, inv 61).

### 3.2 The exemption (one site)

The exemption lives in `holeFaults` at the `hit` search and nowhere else. When searching for the hole `h` meets, skip
`h`'s pair partner and **keep searching**. Do not test only `.find()`'s first hit, which would miss a third hole met
after the partner. Every other rule (`breaks-out`, `off-flat`, `too-deep`, a curve's waste) judges each bore of a pair
exactly as today.

Faults a later edit causes are KEPT and noted (inv 50). A resize that thins the part below clause 4 makes the pair
unrecognised, so `meets-hole` appears and is noted, never clamped. An edit that breaks the pair ADDS a fault, so the
Holes panel refuses it, as it would today.

### 3.3 Where the pairing lives on `Hole`

`partGeometry` (or `holeInstances` for a whole board, the builder's choice) attaches the pairing to each paired `Hole`
as one new optional key, e.g. `meets?: { …the partner's centre, radius, axis… }`. It is frozen, and an unpaired hole has
NO such key. The per-hole memo keyed on the frozen `Hole`'s identity stays (inv 50's perf rule). The partner's geometry
is part of what the key holds, so a paired hole's memo cannot outlive a change to its partner. The builder states this
in the key's doc comment.

## 4. Presets and Properties

### 4.1 Cam lock (G3)

The `+ Add hole` popover gains one item per length end of the selected part: **Cam lock at the `<end>` end** (wording
the builder's, from the panel's existing end words). It adds TWO rows in one `edit()`, one undo entry, checked as a
pair. It is withheld when either row's `holeFaults` (with the exemption) is non-empty on the part with both added. Sizes
and placement are my calls (Minifix-style 15 mm; the hardware is metric in both unit systems, as the Hinge cup preset's
35 mm is):

| | cam row (F) | bolt row (E) |
|---|---|---|
| face / from | thickness, the face `defaultHole` enters from | length, from that end |
| diameter | 15 mm | 8 mm |
| depth | `t/2 + 4 mm + 0.5 mm`, rounded UP to the next 0.5 mm (19.05 mm stock → 14.5 mm) | 24 mm (its bottom at the cam's centre: s = 0) |
| position | 24 mm in from the end, on the stations below | mid-thickness (`t/2`, exact), on the same stations |

- **Stations along the width:** two holes at 37 mm in from each side (the 32 mm system's line) when the width is at least
  150 mm, otherwise one centred. The two rows share `along`, `alongFrom`, `station`, `count` and `pitch` exactly.
- The 0.5 mm in the cam depth keeps clause 4 strict. A real fitting's quoted depth (Häfele lists 13.5 mm for 19 mm board)
  would leave E tangent to F's floor, which clause 4 refuses. This is the narrowness the non-goals name; the user edits the
  depth to their own hardware's number.
- Withheld on stock too thin for it, by the faults (`too-deep`) rather than by a separate rule.

### 4.2 Cam bolt bore

One ordinary blind row, **5 mm × 12 mm deep**, placed as `Hole` is (centred on the broad face), for the user to move onto
the mating part's line (my call). It is the screw-in bolt's pilot. It pairs with nothing; chunk 2 places it.

### 4.3 Editing a pair

Each row stays its own row in the Holes section with its own fields. No new control. A pair's summary line (§6.3) names
it. Editing one row so the pair no longer holds adds `meets-hole` and is refused (§3.2).

Changing a pair's shared stations one row at a time would always pass through a non-pair state, which the panel refuses.
So, my call (settled after the builder check):
- **On a row of a whole pair** (every hole of both rows paired) whose partner has the same `along`, an edit to
  `alongFrom`, `station`, `count` or `pitch` copies ALL FOUR of the edited row's new values onto the partner, in the same
  edit, checked as a pair. Both rows then have the same along-encoding, so their holes line up exactly, whatever
  encoding the partner had before.
- The same edit is refused with one sentence on rows only partly paired, or whose `along`s differ (a count-1 pair can
  have them differ).
- **An `along` edit on a pair member is refused.** The partner cannot take it: F's `along` is length or width, E's is
  width or thickness.
- Every other field edits its own row only.

This is a new store action (today `updateHoleRow` edits one row and the panel checks faults). The builder names it.

## 5. Geometry

### 5.1 The mesh (watertight)

`holeMesh` (`grainTiling.ts`) draws a paired hole as follows:
- **E (bolt):** its wall is a band of HOLE_SEGMENTS quads from its mouth ring to the **intersection loop**, with NO
  bottom disc. Loop vertex k is E's ring vertex k slid along E's axis onto F's cylinder. Each point is a closed form: at
  ring offset w on the third dimension, the axial position is where `dist to F's axis = R`, which is `F.centre[b] ∓
  √(R² − w²)` on E's near side.
- **F (cam):** its wall is the usual band, except for the columns the loop reaches. Those columns are triangulated in
  F's unrolled (θ·R, axial) plane with the loop as a hole (`ShapeUtils.triangulateShape`, as `faceTriangles` already
  uses), and mapped back onto the cylinder exactly. The outer contour is the affected columns' top-ring and bottom-ring
  vertices. The window never straddles θ = ±π (the unroll is centred on E's direction). Its θ extent is under π (r < R),
  and it is strictly inside the band by clause 4.
- **The loop's vertices are ONE array** shared by both walls, the way a countersink's cone shares the bore's mouth ring,
  so the pair is watertight with no tolerance.
- **The faulted path** (a pair whose bores fault otherwise, so `holeInStock` is false) clips the same triangles to every
  body (`planFor`/`clip`), as today.
- Normals: E's wall is radial to E's axis, F's wall radial to F's, smooth. The cut faces on either side meet at a crease
  along the loop.

`curvesWatertight.test.ts` gains pair cases: a pair on a plain part; on a curved part; on a mirrored part; both bores
faulted by a resize (the clip path); and a pair beside a counterbore.

**Performance:** `holesPerf.test.ts` gains a part with four pairs (two at each end, the Cam lock preset twice) under the
existing budgets (≤ 40 ms healthy, ≤ 100 ms faulted, the minimum of 9). They are never raised.

### 5.2 Rims (viewport edges, inv 16)

`holeRims` for E draws its mouth ring and the **intersection loop**, never its bottom ring. F's rims are unchanged:
mouth and floor. The loop is a real crease of the model, so it is a line that sits on a drawn feature.

### 5.3 Section caps, snapping

- **Section caps** need no change. Both prisms are subtracted, which is the union (survey). The browser check includes a
  plane through both bores.
- **Snap points:** mouth centres only, both on real faces. Nothing to add. E has no far centre.

### 5.4 Bodies, regions, joinery zones

`boardBodies` stays hole-free and convex (inv 48, 50). Every region, box and inside test is per bore (`holeRegion`,
`holeTouchesBox`, `insideHole`, `featureZones`), so the pair is their union and they need no change.

## 6. Readers that must know about a pair

### 6.1 Drawings (`holeDrawing.ts`)

For E:
- Each wall silhouette generator ends where it meets F's cylinder (at offset w: `√(R² − w²)` from F's axis), not at E's
  bottom.
- E's bottom rim is not drawn.
- The intersection loop is drawn as a rim (DRAWING_HOLE_SEGMENTS points), visible or hidden by the one hidden-line pass.

For F, the rims are unchanged. In the view looking along the third dimension c (a shelf's front elevation, say), F's
silhouette generator on E's side runs across E's opening: over `a ∈ E.centre[a] ± r` it lies in E's air. So that
generator is split into its two pieces either side of the window (settled after the builder check; the anti-goal
governs). Only a PAIRED F takes this branch, so `squareLines` is unchanged for every unpaired hole (`drawingIdentity`
holds). Tags stay on their segments (inv 16, 47). With `visibleOnly` (the exploded iso), a clean pair's
E walls and loop are left out, as a clean hole's walls are today.

### 6.2 Part diagrams (`diagram.ts`, `PartDiagram.tsx`)

In F's entry view, E's side band runs from the edge to F's circle. Its walls end ON the circle: at w = ±r the end point is
`√(R² − r²)` from F's centre, which lies on the circle. It has no bottom line. In E's entry view, nothing changes. In the
c view, when another feature has opened it (`diagram.ts` opens no view for a hole across its axis alone), E's band stops
at F's band wall with no bottom line, and F's wall on E's side is broken over E's band, as in §6.1. A `DiagramHoleSide`
gains only what this needs, and an unpaired band is byte for byte as before.

### 6.3 Text: the bench line and the cut list (`holeText.ts`, the ONE home)

- When two rows are a **whole pair** (every hole of each pairs with a hole of the other), they print ONE line, e.g.
  `Cam-and-bolt ×2: 15 mm cam bore 14.5 mm deep in the top face, 24 mm from the left end; 8 mm bolt bore 24 mm deep
  from the left end into each`. The wording is the builder's, assembled in `holeText.ts` (inv 19). The Holes panel's
  summary line and the cut list (`holeLine`) read it.
- **The Plans sheet keeps one key and one balloon per ROW** (`featureKeys.ts`' short `holeText`, segments tagged by row
  id), unchanged (my call, settled after the builder check). The two keys are numbered as today, so callout keying is
  untouched.
- Rows only partly paired print their own two lines unchanged. They are still true drilling instructions.
- Cut-list grouping is unchanged: `HOLE_FIELDS` and `holeRowValues` are untouched (inv 40). Two parts with the same pair
  have the same rows.

### 6.4 Sockets, seats and planners (no adoption)

- `tenonJoints.ts` `seatedIn`: a bore that is a pair member seats no tenon (my call, conservative, as a headed bore;
  inv 58). So `staleTenonOf`, `holderOf` and the stretchers' callers inherit it.
- `stretchers.ts` `usedRow`: skips a pair member, as it skips a headed row.
- **Planner-made sockets** (Add stretcher, Fit the stretcher again, Bore leg sockets) are checked WITHOUT the exemption.
  A socket that would form a pair is a `meets-hole` socket fault, refused as today, and `defaultHeight`'s stepping steps
  over it. The builder picks the mechanism, e.g. an option on `holeFaults` read only by these planners, or a post-check
  that the new row is not in a pair. A planner never relies on the exemption.
- Leg sockets (`isSocketOf`, `staleSocketOf`) are through bores, so they never pair (clause 1). No change.

### 6.5 Moving holes

None of these splits a pair (survey):
- **Level the ends** deepens a blind edge bore by exactly the end's `e`, keeping its bottom fixed, so the pair holds.
- **Stretch** refuses a line crossing either bore (`crosses`). Otherwise both rows move together.
- **`rebaseHoles`** never shifts a `face === d` row, and joinery's growth of the bolt's own end is refused upstream
  (`featureZones`, `cornerPlan`'s hole-in-the-way).
- Each gets a pinning test with a Cam lock part, so a later resize path that skips those guards fails a test rather than
  quietly unpairing.

## 7. AI paths, joinery, links and mirrors

- **Refine** carries holes through `holeWorld.ts` row by row, exactly when untouched (inv 50), so a pair round-trips.
  A model that moves one row breaks the pair: the `meets-hole` is KEPT and flagged (`holeDesignFaults`), never clamped.
  There is no new keep route (my call). A pair is not `keptWhole`.
- **Generate:** unchanged; the design schema is byte for byte the same.
- **Joinery and Repair:** unchanged. The zones are the union (§5.4).
- **Mirrors** flip flags (inv 44), and the recogniser reads the resolved shape, so a mirrored part's pair is recognised.
  Tested with `chiralPart`. **Links** share holes (inv 45), so every user of a Shape has the pair.

## 8. Records

- `docs/invariants.md` and CLAUDE.md, in full and condensed:
  - inv 50: the cam pair (one recogniser, one exemption site, recognised by shape, the mesh's shared loop);
  - inv 58: a pair member seats no tenon;
  - the stretchers inv 60: planner sockets are checked without the exemption.
- `docs/module-map.md`: `camBolt.ts`. CLAUDE.md's ONE-homes table, holes row.
- `docs/versioning.md`: a note that this round has no bump, and why (§3.1).
- `docs/rounds.md`: the rollback table is unchanged (no schema change).
- `docs/follow-ups.md`: 568 narrowed to chunk 2. New entries for an edge bore past the cam, an edge bore into the cam's
  floor (the real-hardware tangency, §4.1), and hardware from a pair (ask first, inv 55).
- Browser verification on the dev server (`docs/browser-verification-cam-and-bolt.md`):
  - Cam lock added at each end, seen and orbited (the window, the loop);
  - sectioned through both bores;
  - drawn on the Plans sheet and the part diagram;
  - a station edited (both rows move), and a pair-breaking edit refused;
  - a metric project;
  - Cam bolt bore added.

## 9. Left to the builder

- The UI wording (§4, §6.3), and the names in `camBolt.ts`.
- Where the pairing is attached (§3.3), within its constraints.
- The unrolled triangulation's details (§5.1), within watertightness and the perf budgets.
- The planners' no-exemption mechanism (§6.4).

## 10. The survey, in brief

A read-only survey (2026-10-30) of every non-test reader.
- **Wrong for a pair, given a rule above:**
  - `holeMesh` (clean holes drawn whole: the cam wall over the opening, the bolt wall and bottom in air);
  - `holeRims` (a phantom bottom ring);
  - `holeDrawing.ts` (the bottom rim and the silhouettes' ends in air);
  - `diagram.ts` side bands (into the cam circle, a bottom line in air);
  - `seatedIn` and `usedRow` (could adopt a bolt bore);
  - the stretcher planners' `meets-hole` socket checks and stepping (could accept a socket ending in a cam housing).
- **Fine as is:**
  - `holeInStock`; `mergeHoledPlanes` and `faceTriangles` (the mouths are on different faces);
  - section caps (both prisms subtracted; no plane crosses both bores in the fast ring path);
  - snap points; `lineFaces`; the stock probe; `cornerPlan`'s and `roundTenons`' touch tests; `featureZones`;
  - `rebaseHoles`, `levelEndHoles` and stretch (§6.5);
  - `holeWorld`; every `holeFaults` text reader (it follows the exemption);
  - leg sockets (through only); `validateHoleRows` (keeps a faulted row).

## 11. Later chunk (outline only)

**Chunk 2: the cam-and-bolt joint.** With two parts selected (A's end butting B's face), lay out N fittings:
- cam and bolt rows in A;
- the bolt's bore in B, coaxial with A's bolt bore (the world-space line-up `seatedIn` does for tenons);
- one undo entry, every refusal before `edit()`.

Possibly dowels beside each fitting, and typed hardware uses (ask, inv 55). A "Fit again" when either part moves. Its
own spec.
