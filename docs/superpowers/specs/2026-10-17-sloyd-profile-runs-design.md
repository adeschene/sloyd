# Sloyd — profile runs: profiles that follow the outline, and stopped profiles (design)

Date: 2026-10-17. Follow-ups 390 (a profile does not follow a curved edge) and 365's remainder (stopped profiles). Status: design
approved in chat by the user 2026-10-17, section by section ("Yes, that looks right" ×4, then "Yes, write the spec"); written spec
approved by the user ("Approved, write the plan"); chunk a1 implemented (plan `docs/superpowers/plans/2026-10-17-sloyd-profile-runs-a1.md`,
merged as `305934d`); chunk a2 implemented (plan `docs/superpowers/plans/2026-10-18-sloyd-profile-runs-a2.md`; stopped profiles and the
run-out), **a1 and a2 deployed together** 2026-10-18 (`index-BbXkYYy4.js`). The rulings marked *Amended (implementation, a2)* (I1, I2)
await the user's review. **Chunk b designed** in a second brainstorm, 2026-10-18 (rulings B1–B9 below, "Yes, that looks right" ×3,
then "Yes, write the spec"); it splits into b1 (following) and b2 (stops on a turned path, two-side runs). **Schema 18** (chunk a): a build that understands only 17 refuses a v18 document, so rolling back past chunk (a)
strands every project saved since — export first.

This spec supersedes the edge profiles chunk 1 spec's §7 plan for chunk 2 ("one stored range along `through`"): a range along one
axis cannot follow an arch. Blind curved recesses, the other half of that plan, get their own later spec.

## 1. Purpose and rulings

Edge profiles chunk 1 (deployed 2026-10-17) made a profile a straight prism along one long edge or end. The user, after it went
live: profiles "don't work well with curves". On an edge an Arch, Bow, notch or Rounded corner has cut, a profile runs straight on
and disappears where the curve cuts in, instead of following the outline as a bearing-guided router bit does. A routed stop (a
profile that ends partway along an edge) cannot be made at all.

User rulings (brainstorm, 2026-10-17):

- **R1 Cases.** Both equally: a profile all the way round a top with rounded corners, and a profile along one shaped edge (an arched
  apron's edge, a bowed front).
- **R2 Scope.** Following plus stopped profiles, in one model. Blind curved recesses are a later spec.
- **R3 Stored form.** A new `profiles` list on parts and shapes (schema 18). Chunk 1's profile curves migrate into it on load: one
  representation of one bench feature. Rejected: keeping chunk 1's curves beside a new list (two forms, two readers, two row
  types), and a sweep path on `CurveCut` (it loses what a curve means: one outline cut straight through one axis).
- **R4 Order.** Three chunks: (a) the stored form, migration and stopped profiles on straight sides; (b) following every outline;
  (c) the speed of following coves, ogees and beads, if (b) leaves them over budget. Each chunk is its own plan, review and live
  pass.
- **R5 Stop ends.** A stop ends as a router leaves it: the cutter's own run-out, not a squared end.
- **R6 Sharp outside corners mitre**, as chunk 1's four-edge top does, so its wood is unchanged.

- **R4a** *Amended (planning, the user's choice 2026-10-17)*: chunk (a) splits in two. **(a1)** schema 18, the `profiles` list,
  migration and the existing rows, End to end only: a pure refactor, every drawing, mesh and word byte for byte as today. **(a2)**
  stopped profiles with the run-out, which brings the doubly curved machinery of §5 (normals, two-way facet suppression,
  facet-chain silhouettes) on that small surface, ready for (b). The run-out is itself doubly curved, so stops could not ship
  without it.

Rulings made while presenting the design, accepted with section 1:

- **R7** Inside sharp corners mitre too (a real bearing leaves its own radius there; a later round may add it).
- **R8** A profile follows the OUTER outline only; a through cut-out's inner loop is not followed (a follow-up).
- **R9** A run-out is cut by a standard 1/2" bearing: the cutter's radius at depth t is 1/4" plus the profile's reach at t. No field.
- **R10** A profile wider than a convex corner's radius is refused, as an arc past a half circle is.

Non-goals: blind curved recesses; scooped or dished surfaces; following an inner loop; a bearing radius at inside corners; a
bearing-size field; a pivoted (router-rounded) sharp corner; joinery, Refine or Repair on profiled parts (fu 363); Generate writing
profiles; a grain fix (fu 336).

**Chunk b rulings** (the user's, brainstorm 2026-10-18; they amend §3.3–§6 where marked *(B)*):

- **B1 Rounded ends.** End to end on a side whose ends are corner arcs carries the profile round each arc and runs out where the
  arc meets the next side (the bit lifted off at the far tangent point). All round stays the way to profile the whole face.
- **B2 Stations** are measured straight along the side's run dimension from its min end, as a tape laid along the part and squared
  to the edge (a2's rule, kept on curved sides). A station may sit on an arch, a bow or a corner arc.
- **B3 Two-side runs** are in chunk b: a stopped run may start on one side and stop on another, following the outline between them
  round any corners (a rounded top profiled front and ends, the back against a wall left plain).
- **B4 Two builders, one view.** A run whose whole path is ONE straight segment keeps a1/a2's view curve, bodies, mesh and words
  byte for byte. Every other run (a curved side, a corner arc, two sides, All round) is a SWEPT profile, built by §4.2's kept-wood
  construction, with a2's run-out where it stops. The choice is structural (`profilePath.ts`). Rejected: one new builder for every
  run (it loses a1/a2's byte-for-byte pins and re-verifies every shipped profile); subtracting swept waste (the probe: 2–9× the
  budget).
- **B5 Concave arcs under the bearing refuse.** A 1/2" bearing cannot follow a concave arc tighter than 1/4" radius; `too-tight`
  covers it, beside R10's convex arc under the reach. (Inside SHARP corners still mitre, R7.)
- **B6 Split:** **b1** follows the outline (End to end on a curved side or round its corner arcs, All round): path, geometry,
  mesh, edges, faults, probes, Plans sheet, diagrams, words, the row. **b2** adds stops on a turned path (the run-out on a curve)
  and two-side runs (a second Side select). Each its own plan, review and live pass.
- **B7 b1 deploys alone.** Until b2, the row greys Stopped on a turned path with its reason (`A stop on a curved or cornered run
  comes later`).
- **B8 Paper:** crease lines swept along a path arc are drawn at `DRAWING_CURVE_TOLERANCE` (they are what one sees on an arched
  apron); the profile's own arcs across the sweep stay model chords (P19 extended), as do run-outs.
- **B9 Probe first.** b1's plan opens with a throwaway probe of §4.2 on today's code (after a2's memo and indexing work) and of a
  run-out meeting a swept band; its numbers set b1's perf guards and decide whether a following cove, ogee or bead belongs in b1 or
  waits for chunk c.

**Planning rulings for chunk a1** (*Amended (planning)*):
- **P1** a1 keeps the Profiles row as it is (the Edge select of eight edges, Facing's words); Face, Run and Side replace the Edge
  select in a2, when Stopped arrives.
- **P2** a1's loader accepts the full stored form and REFUSES, with the newer-version message, a profile whose run a1 cannot build
  (a loop, a station end, ends on two sides). So a2 needs no further bump, and rolling a2 back to a1 refuses instead of drawing a
  stopped profile full length.
- **P3** An End to end run is stored `start: through 'min'`, `end: through 'max'`; mirroring it flips only `face` and the side
  (a full side has no travel to reverse). Station runs swap on a mirror (a2).
- **P4** Geometry, words and faults read profiles through ONE view, `geometryBoard`: the part's curves, then each profile as the
  exact `CurveCut` chunk 1 stored (`profileAsCurve`). A part with profiles only is byte for byte chunk 1. In a part with both,
  profiles now come after curves, so its bench-line order and body decomposition may differ (the same wood, pinned).
- **P5** A symmetric profile stored in the facing-u point order (hand-made; the chunk-1 writers always wrote v) migrates to
  `facing: 'face'`: the same wood, its bytes normalised.
- **P6** The `overlap` fault (§4.1) arrives with runs, in a2: chunk 1's stacked identical profiles stay allowed in a1.
- **P7** Profile ids share the part's curve id scope (`takeId`), so a geometry view never holds two curves with one id. A hole
  into a profile keeps the `:curve:<id>` fault key in a1 (through the view), so §4.1's `:profile:<id>` key is dropped as
  unnecessary.
- **P8** A recognised profile curve is moved into `profiles` on EVERY load (idempotent), not only from v17, so no build path can
  leave one in `curves`.

**Planning rulings for chunk a2** (*Amended (planning)*, 2026-10-18):
- **P9** (the user's ruling) A Start or Stop station marks **where the full profile ends**: the profile is full depth up to it, and
  the run-out lies beyond it. This is the same geometry as stopping the bit's axis there.
- **P10** a2 builds station runs on ONE side (start and end on the same side; each end a station or `through`). Ends on two
  sides still refuse (chunk b); a loop still refuses.
- **P11** A station run is stored with `start` before `end` along the face's counter-clockwise travel, seen from outside `face`
  (the travel `mirrorProfile` reverses). The row writes every station `from: 'min'`; a mirrored copy may hold `'max'`, and
  the lowering inverts it.
- **P12** `overlap`: two profiles on the same face and side whose spans overlap with positive length. Profiles meeting at a
  corner (the four-edge set) do not overlap.
- **P13** A run-out reaching past the part's end is not a fault: the cutter cuts air there.
- **P14** A hole is judged against a stopped profile's band, extended at each stop end by the run-out's reach
  (R = 1/4" bearing + the profile's reach). This is conservative: a hole just clear of a run-out may be refused.
- **P15** Words: a stopped bench line adds `, from <a> to <b> (stopped)`, stations from the run dimension's min end. The Plans
  key line adds `, stopped` (a key carries no positions). A stopped profile never joins the four-edge collapse.
- **P16** Part diagrams: no end-view hatch for an end the profile stops short of. Sharp-vertex lines are drawn only over the span.
- **P17** Snap points: at each stop, the profile's arc ends on the stop plane, as `'corner'`s.
- **P18** The geometry view carries a stopped profile as its chunk-1 curve plus a VIEW-ONLY `span`, never stored. A curve
  with no span keeps `curveValues` byte for byte; a spanned one's value appends the span (geometryKey, the UV signature and
  the cut list's grouping read it).
- **P19** *Amended (planning, a2)*: run-out lines are drawn as the model's chords (`CURVE_TOLERANCE`); paper-tolerance fine
  paths on a run-out are a follow-up.
- **I1** *Amended (implementation, a2)*: a `+ Add profile ▾` preset takes the FIRST edge where its default fits (the top long
  edge first, as before; then the other top sides; then the bottom), and its menu detail names that edge. Before this, the
  `overlap` withhold left no preset at all once the top long edge held a profile.
- **I2** *Amended (implementation, a2)*: typing 0 or the full length into Start or Stop makes that end run out through the end
  face (a `through` end), so a half-stopped profile can be made from the row. An end is matched by what the field SHOWS (fu 354's
  reads-the-same rule), so in imperial a value that displays as 0 or the length is that end; both ends at the part's ends make the
  run End to end. A Start past the Stop is refused (`Start must be before the Stop`), never swapped.

## 2. The probe (2026-10-17, throwaway)

A profile swept along an outline as convex 3D pieces, through `clipConvex` and `bodyEdges`. Times are the minimum of 5–9 runs and
cover bodies plus RAW edges only: no mesh (~25% of a rebuild in edge profiles' F3) and no smooth-line suppression.

| Case | Subtract swept waste | Build kept wood directly |
|---|---|---|
| 1/4" roundover along a 24" × 1-1/4" arch (30 × 5 × 3/4 apron) | 232 bodies, 66 ms | 37 bodies, 9 ms, same volume |
| 3/8" roundover around a half-round notch (ρ = 1) | 326 bodies, 86 ms | **wrong volume**: offset chords swallowed beside a sharp corner |
| 3/8" cove around 2" corners (36 × 20 top) | 275 bodies, 43 ms | 261 bodies, 48 ms, same volume |
| 1/4" roundover around 2" corners | 220 bodies, 59 ms | 53 bodies, 17 ms, same volume |
| (a roundover's kept wood is convex on a convex outline: one clipped body) | — | 1 body, 5–20 ms |

Conclusions: subtracting swept waste is not viable; building the kept wood is, for profiles whose kept cross-section is convex.
A cove, ogee or bead keeps a non-convex cross-section (several pieces per segment): chunk (c). The offset must handle swallowed
segments (§4.2).

## 3. Stored form (chunk a)

### 3.1 Types (`document/types.ts`)

```ts
/** One side of a broad face: the edge at `across`'s `from` end, running along the face's other dimension. */
interface ProfileSide { across: 'length' | 'width'; from: CutFrom }
/** A run's end: a station along the side's run measured from the named end of that dimension, or — at a side's sharp corner —
 *  out through that end face (chunk 1's full-length profile). */
type ProfileEnd = { side: ProfileSide; from: CutFrom; at: number } | { side: ProfileSide; through: CutFrom };
interface ProfileCut {
  id: string;
  face: CutFrom;                       // the broad (thickness) face it is routed from: 'max' top, 'min' bottom
  kind: ProfileKind;                   // roundover | cove | ogee | bead | thumbnail
  size: number;                        // radius / size / reach, as chunk 1's ProfileFields
  depth?: number;                      // thumbnail only
  fillet?: number;                     // fillet (roundover, cove, ogee) or quirk (bead)
  facing: 'face' | 'edge';             // asymmetric kinds: the profile's top lies on the broad face, or on the side face
  run: { loop: true } | { start: ProfileEnd; end: ProfileEnd };
}
```

- `Board.profiles` and `Shape.profiles` (default `[]`). A run goes from `start` to `end` counter-clockwise as seen looking at
  `face` from outside the part. The writers store canonical forms: a one-side run's start precedes its end along that travel.
- Symmetric kinds store `facing: 'face'`. `PROFILE_FIELDS` (`profiles.ts`, `satisfies`) lists every field but `id`, compared
  exactly and `run` deeply (inv 40); `profiles` is SHARED in `LINK_FIELDS` (inv 45).
- Mirroring is flag flips only (`mirrorProfile`, inv 44): `face` when thickness is the mirrored dimension; a side's `from` when
  its `across` is; an end's `from`/`through` when the side's run dimension is. A mirror reverses travel, so `start` and `end`
  swap. `lowerProfiles` is its exact inverse. Pinned with `chiralCurved`.
- Ids per board (per shape for a shape), repaired by `takeId` (inv 33).

### 3.2 Migration 17 → 18 (document-level, no step function)

- Every curve that `profileFields` recognises (chunk 1's profiles, and pre-chunk through-length or through-width Rounded corners)
  is moved out of `curves` into `profiles`. It gets the same id, the side and face its corner names, its kind and sizes, facing
  mapped from chunk 1's `u`/`v` by which of them is thickness, and run `{ start: { side, through: 'min' }, end: { side, through: 'max' } }`.
- Then `profiles` is validated. A malformed entry is dropped: a non-finite or non-positive size, a depth outside (0, size), a negative
  fillet, a bead without a quirk, an end missing its side, or a run that is neither shape. A faulted but well-formed entry is KEPT.
  An unknown `kind` string, or a run key the reader does not know, REFUSES the document with the newer-version message (curves'
  precedent: a new kind needs no bump).
- *(B)* b1 lifts the loader's refusal of `{loop: true}`, and b2 lifts its refusal of ends on two sides, with no schema bump
  (P2's purpose): a build one chunk back refuses such a document instead of drawing it wrong.
- **Pin:** for every chunk-1 fixture (each kind × 8 edges × facings, the four-edge sets, the mixed shelf), the migrated part's
  bodies hold the same wood: volume to 1e-8 and the point oracle.
- Versioning row: *16→17 … | 17→18 | `profiles` on parts and shapes (default `[]`; recognised profile curves moved in; malformed
  dropped; unknown kind or run refuses) | document-level, no step | silent loss (every profile becomes a curve read as plain wood
  edits, a stopped profile drawn full length)*.

### 3.3 The path is derived

`document/profilePath.ts` (new) is the ONE place a run becomes a path (as `curves.ts` is for outlines, inv 53):

- `faceOutline(board, face)` is the outer outline that the through-thickness curves leave on that face, as lines and arcs (each arc
  with its centre and radius, tessellated with `curveOutline`'s chords). A face with no such curves is its rectangle.
- `profilePath(board, profile)` gives the run's stretch of that outline, from `start` to `end` (or the closed loop). Each vertex
  is flagged sharp or tangent-continuous, judged on the true arcs (inv 16's rule).
- *(B)* A **side's stretch** is the outline between its two corners; a corner is a sharp vertex or a CORNER ARC (a curve meeting
  two sides). An arch, notch or bow along a side belongs to that side. End to end at a corner arc carries round it (B1); at a sharp
  corner it runs out through the end face, as chunk 1. Every piece of a side's stretch moves one way along its run dimension (an
  arc is at most a half circle; a corner arc runs from one side to the next), so a station (B2) names exactly one point.
- *(B)* A run's path goes counter-clockwise, looking at `face`, from Start to Stop; a two-side run (B3, b2) goes round every corner
  between its sides. Inner loops are not followed (R8).
- Editing, resizing or removing a curve re-routes the profile. A stop whose station is not on its side's stretch of the outline
  is a fault (`stop-off`), kept and noted, never moved.

## 4. Geometry

### 4.1 Faults (`profileFaults`, the ONE decider)

- **`runs-off`**: the reach passes the face's half-width, or the profile's depth passes the thickness.
- **`too-tight`** (chunk b): a convex ARC of the path (a tangent-continuous stretch) whose radius is under the reach (R10): the
  offset would fold; *(B5)* or a concave arc whose radius is under the bearing's 1/4". A SHARP vertex never faults: it mitres (R6, R7).
- **`stop-off`**: a station not on its side's outline, or a run-out whose cutter would leave the face.
- **`overlap`**: two profiles' waste meet on one face (they fight for the same wood). *(B)* Judged on paths: two profiles on one
  face whose paths share any stretch (a front End to end round its corner arcs meets an end side's). The Curves precedent kept stacked identical
  profiles; a run makes that precedent wrong, so this refuses.
- A hole into a profile's waste is a `breaks-out` keyed `:profile:<id>` (`intoProfile`, beside `intoCurve`), worded through
  `curveWord`.
- Authoring refuses a fault an edit ADDS, decided before any mutation. A fault a later resize causes is KEPT and noted
  (`… at this size.`, `— check: …`), never clamped.

### 4.2 Building the kept wood (`boardBodies`, after every curve; inv 48)

For each profile, in stored order, each current body is split three ways. Every result stays convex:

1. **Core**: the body ∩ each convex piece of the face outline offset inward by the reach (a prism through the profile's depth band;
   below that depth the body is untouched).
2. **Bands**: for each path segment, the body ∩ that segment's band ∩ each convex piece of the profile's KEPT cross-section.
   The band is the region within the reach of the segment, bounded by the mitre planes at its two vertices: vertical bisectors,
   at sharp vertices and tangent joins alike (R6, R7).
3. **Outside the run** (a stopped profile): the bands past each stop keep their full cross-section. At each station stop the cutter
   is subtracted from the few bodies near it, through `subtractPieces`. The cutter is the profile revolved about the bit's axis,
   which sits 1/4" outside the edge (R9), tessellated at `CURVE_TOLERANCE`. A `through` end runs out through the end face, as
   chunk 1 does.

- **The offset is robust.** A segment the offset swallows (shorter than the reach beside a sharp turn: the probe's notch) is
  dropped and its neighbours re-joined. A swallowed segment on a convex arc is `too-tight` instead, so a refused profile is never
  built.
- A pair that cannot meet is skipped by a box test, and a part sharing no volume with a piece stays whole (`DISJOINT_VOLUME`, F3),
  so bodies do not multiply.
- A body face on the swept surface carries `profile: <id>` (with its segment and profile-chord index), as a chord face carries
  `curve`.
- A part with no profiles keeps its bodies byte for byte.
- *(B4)* Only a SWEPT run (§3.3: any path that is not one straight segment) is built this way; a one-segment run keeps a1/a2's
  construction byte for byte. In b1 a swept run stops only where B1 leaves a corner arc onto a straight side, so a2's inscribed
  run-out applies unchanged there, meeting a swept band. *(b2)* A station on a curve runs out with the cutter revolved about the
  bit's axis 1/4" outside the outline along its outward normal, the forward half bounded by the plane across the path's tangent.
- Chunk (a) builds only straight runs: a profile on a side that a through-thickness curve has cut offers only End to end, built as
  chunk 1's prism.

### 4.3 Pins

- **Wood:** volume against an independent point oracle for every kind along every probe outline (arch, bow, half-round notch,
  2" and 1/2" corners, a sharp-cornered top, a stopped run on each). The probe's failed notch case is pinned explicitly.
- **Migration:** same wood (§3.2).
- **Watertight:** `curvesWatertight.test.ts` cases for each, holes included.
- **Performance:** `curvesPerf.test.ts`, ≤40 ms (minimum of 9) per case for a resize-drag rebuild (bodies, edges, mesh). A cove,
  ogee or bead following an outline that is over 40 in chunk (b) is guarded at its measured value plus margin and recorded for
  chunk (c).

## 5. Drawings, viewport and words

- **Shading.** Vertex normals on a `profile` face are the true swept surface's: the profile arc's normal in (s, t), turned by the
  path's tangent frame at that vertex. A straight band's normals equal chunk 1's. The mesh is welded, conformed and fanned from
  centroids (inv 50: watertight). Grain takes each face's nearest axis plan (inv 35); the seam around an arc is accepted (fu 336).
- **Lines (inv 16).** A profile draws:
  - each SHARP profile vertex, swept along the path (a crease line: where a cove or ogee meets a face, a bead's quirk, a fillet's
    shoulder);
  - the mitre line at each sharp path vertex;
  - a stop's run-out outline where it meets the faces.

  Facet lines are suppressed in both directions, per interval: between profile chords along the path, and between path segments
  wherever the path is tangent-continuous.
- **Plans sheet (inv 47).**
  - Swept lines are drawn on a fine path at `DRAWING_CURVE_TOLERANCE` along the path's arcs, with visibility judged on the model
    chords; *(B8)* the profile's own arcs across the sweep stay model chords.
  - A doubly curved surface's silhouette is the chain of facet edges whose two smooth faces turn opposite ways to the view, in either
    direction. It is probed from the viewer-facing faces' outward normals (`silhouetteLines`' rule) and clipped to the wood.
  - Model edges carry `curveEdgeLifts`' along-view lift.
  - `profileDrawing.test`'s independent ray oracle covers every new case, in the four views.
- **Section caps, occlusion, picking** read the bodies: no change. **Snap points:** each stop's end of a crease line is a
  `'corner'`; nothing else is added.
- **Part diagrams.**
  - A note per profile.
  - The through-face (plan) view draws the profile's inner edge, the offset line, along its path.
  - Chunk 1's end-view hatch stays for an End to end run on a side no curve cuts.
- **Words** (`curveText.ts`, `featureKeys.ts`; one home each):
  - End to end reads exactly as chunk 1: `Roundover 1/4" on the top long edge …`; *(B)* one that wraps corner arcs adds
    `, round the corners`.
  - All round: `Roundover 1/4" all round the top`.
  - Stopped: `Cove 3/8" along the width min side, from 3" to 27" (stopped)`.
  - *(B)* Chunk 1's four-edge collapse stays for four End to end profiles on a sharp-cornered face (a2 ruled it; a loop has its
    own line). A two-side stopped run (b2): `Roundover 1/4" from the length min end at 4" round the width max side to the length max
    end at 4" (stopped)`, in the row's Face/Side words.
  - Fillet words as today. Plans keys use the same text.
- Stock, the cut list's sizes and nesting are unchanged.

## 6. Properties

- **The Profiles row** replaces chunk 1's Edge select with:
  - **Face:** Top or Bottom.
  - **Run:** All round, End to end, Stopped.
  - **Side:** for End to end and Stopped.
  - **Start / Stop** (`DimensionField`s, stations from the side's min end, Stopped only).
- Kind, sizes, Fillet/Quirk and Facing are unchanged.
- Every select greys a refused choice with its reason, judged only on focus (fu 388's rule, `optionReason`). Fields return their
  refusal (holes chunk 1 R7). One undo entry per edit.
- Chunk (a) offers Stopped on straight sides only, and All round only once chunk (b) ships. *(B7)* b1 offers All round (Side
  hidden) and greys Stopped on a turned path with its reason until b2.
- A stopped run's ends on two different sides (the stored form allows it) are offered from chunk (b2), by a second Side select for
  Stop.
- `+ Add profile ▾` keeps chunk 1's presets (End to end on the top long edge), with the withhold rule.
- The store gets `addProfiles` / `updateProfile` / `removeProfile` (one edit; held points re-judged after, as curves'). `profiles`
  is absent from the reorient predicate (inv 2).
- Joinery, Refine and Repair refuse a profiled part (`curvedRefusal` counts profiles; message unchanged). `turnCandidates` gives
  none; the design checks ignore profiles. Hidden parts keep their profiles in the cut list (inv 43).

## 7. Invariants this amends (written into CLAUDE.md when each chunk ships)

- **inv 47:** a profile surface's silhouette is a facet-edge chain (§5), not a line along `through`.
- **inv 48:** profiles become bodies in `boardBodies` by BUILDING the kept wood (core, bands, run-out subtraction), never by
  subtracting swept waste. Bodies stay convex.
- **inv 53:** profiles leave the curve model. A profile is a `ProfileCut` routed from a broad face along a path derived from the
  outline (`profilePath.ts`), not a `CurveCut`. `profileFields` survives only to migrate a v17 file.
- **inv 40/44/45:** `PROFILE_FIELDS`; `mirrorProfile` flag flips; `profiles` shared.
- **Versioning:** the 17 → 18 row (§3.2).

## 8. Testing

- TDD in `document/`. Every refusal, withhold and ordering mutated.
- Pins, per §4.3: the point oracle, the migration's same wood, the ray oracle, watertight cases and perf guards.
- Component tests for the row: each control writes only its field; a refused choice is greyed with its reason; a stop field refuses
  past its side; a stored fault is noted.
- A live pass on the dev server per chunk (the viewport has no unit tests by design). Chunk (a): a stopped roundover on a shelf
  front, and a v17 project opened and saved (migrated, same look). Chunk (b1): an arched apron and a rounded-corner top, profiled; (b2): a rounded top profiled front and ends, the back plain.
  Test projects are left in place.

## 9. Follow-ups this leaves

- Blind curved recesses (fu 365's remainder, its own spec).
- A profile following an inner loop (R8).
- A bearing's radius at inside corners, and a bearing-size field (R7, R9).
- Chunk (c), if chunk (b) leaves a following cove, ogee or bead over 40 ms.
