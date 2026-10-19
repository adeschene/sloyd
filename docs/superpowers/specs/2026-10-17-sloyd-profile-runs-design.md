# Sloyd — profile runs: profiles that follow the outline, and stopped profiles (design)

Date: 2026-10-17. Follow-ups 390 (a profile does not follow a curved edge) and 365's remainder (stopped profiles). Status: design
approved in chat by the user 2026-10-17, section by section ("Yes, that looks right" ×4, then "Yes, write the spec"); written spec
approved by the user ("Approved, write the plan"); chunk a1 implemented (plan `docs/superpowers/plans/2026-10-17-sloyd-profile-runs-a1.md`,
merged as `305934d`); chunk a2 implemented (plan `docs/superpowers/plans/2026-10-18-sloyd-profile-runs-a2.md`; stopped profiles and the
run-out), **a1 and a2 deployed together** 2026-10-18 (`index-BbXkYYy4.js`). The rulings marked *Amended (implementation, a2)* (I1, I2)
await the user's review. **Chunk b designed** in a second brainstorm, 2026-10-18 (rulings B1–B9 below, "Yes, that looks right" ×3,
then "Yes, write the spec"); it splits into b1 (following) and b2 (stops on a turned path, two-side runs). **Chunk b1 implemented and merged** 2026-10-18 (plan
`docs/superpowers/plans/2026-10-18-sloyd-profile-runs-b1.md`; deployed 2026-10-18 as `index-CDDCzMGJ.js`; no schema change): the rulings marked *Amended
(implementation, b1…)* (B1's ε, B1a, Q3/Q6's Task 3 amendments, Q7) and Q6's *Amended (final review, the controller's ruling, I2)*
await the user's review; B10's *Amended (final review, the user's ruling, I1)* is the user's own. b2's planning rulings Q9–Q27 are in the b2 plan's *Planning questions* (approved by the user 2026-10-18); they amend this spec where they speak, and §4.1's `stop-off` clause on a run-out leaving the face yields to P13 (a run-out past the part's end is no fault, as a2 and b1 ship).
**Chunk b2 implemented** 2026-10-19 (plan `docs/superpowers/plans/2026-10-18-sloyd-profile-runs-b2.md`; code complete at `5027ff9`;
not yet merged or deployed; no schema change): stops on a turned path and two-side runs, so **chunk b is complete**. The blocks
marked *Amended (implementation, b2…)* and *Amended (final review, b2…)* await the user's review, including B3's crossed stations
and M1, B10's b2 Task 3 amendments (stops decided first; the neighbour-harm fallback), §3.2's rollback note, §4.2's frame, clips
and overlap intersection, §5's junction shading, §6's R5–R7 and the moved through end. Next: chunk (c), the speed of following
coves, ogees and beads (fu 393, 394). **Schema 18** (chunk a): a build that understands only 17 refuses a v18 document, so rolling back past chunk (a)
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
  *Amended (implementation, b1 Task 6 fix rounds 1–2; for the user's review)*: the BUILT run goes on past the far tangent
  point along the next side for ε = 2 · reach · tan(φ/2), φ the arc's end chord against that side (half the chord angle), and
  runs out there.
  - This joins the arc's end-chord band to a straight band on their shared bisector, and that band meets a2's run-out on the
    station plane in the side's own frame. So there is one section, with no step.
  - Before, the chord band was clipped across the side, stretching its section by 1/cos φ: about 0.0005" at 1/4" reach. It
    drew two near-coincident lines and a stub.
  - **ε depends on the chord count**, which makes it a modelling-tolerance artifact. Examples:
    - roundover 1/4: 0.016" on 2" corners, 0.033" on 1/2";
    - cove 3/8 on 2" corners: 0.025";
    - roundover 1/2 on 1/2" corners: 0.066";
    - cove 3/8 on 0.4" corners: 0.059";
    - thumbnail 3/4 × 1/4 on 3/4" corners: **0.084" (about 2 mm, the worst measured)**.
  - **ε never decides anything** (fix round 2). Every fault reads the station at the tangent point: overlap, too-tight,
    stop-off, and the P14 hole reach. A stopped run on the next side starting at the tangent point is therefore clean.
  - **Fallback:** ε is taken only along a STRAIGHT next side longer than 2ε. On a shorter side, or a curved one such as a
    full-round end, the station stays at the tangent point as it was before ε, and the small step there is accepted.
- **B1a** *Amended (implementation, b1)*: two profiles on one face whose stretches share ONLY a corner arc meet at that
  arc's middle in a mitre (the radial line through its midpoint), as R6 mitres a sharp corner; that is not an `overlap`. Each runs
  out at the far tangent point only where the adjacent side holds no such profile. (Without it a saved rounded top with four End to
  end profiles would fault all four and build none.)
- **B2 Stations** are measured straight along the side's run dimension from its min end, as a tape laid along the part and squared
  to the edge (a2's rule, kept on curved sides). A station may sit on an arch, a bow or a corner arc.
- **B3 Two-side runs** are in chunk b: a stopped run may start on one side and stop on another, following the outline between them
  round any corners (a rounded top profiled front and ends, the back against a wall left plain).
  *Amended (implementation, b2; the controller's ruling m3 on Q16)*: "up to three sides" means a two-side run may pass up to
  two whole sides BETWEEN Start's side and Stop's side (touching four sides in all); its walk never comes back onto Start's
  side, nor (read backwards) onto Stop's. A run that would re-enter one, or whose two ends are one point, has no path and is
  `stop-off` (never `runs-off`). A deliberate near-full wrap is authored as two runs or a loop.
  *Amended (final review, b2; the controller's ruling I1; for the user's review)*: CROSSED stations are `stop-off`. This refines
  Q16's "has no crossed state". A two-side run is crossed when Stop's side stretch holds the FIRST chord of Start's (the corner arc
  the two sides share is where travel enters Start's side) and the walk from Start to Stop never leaves that arc. Before, such a
  run built a fraction-of-an-inch hop (0.26", 0.0086 in³ on a 36 × 20 top with 2" corners) while its bench line named two whole
  sides, and a Curves edit (that corner 1/4" → 2") collapsed a 110" run into the hop unrefused. Now it has no path: refused on
  authoring, kept and faulted on load (`— check: a stop runs off the part`), built as nothing. Through ends on the shared arc are
  caught by the same walk. Curves names the profile on an added `stop-off`: `A stop on the roundover runs off the part — move it
  first.` *Cost:* a run that wants the short hop is authored as a one-side stop. Left open (M1, a spec question): a long-way run
  with ONE station on that shared arc is also `stop-off` (the re-entry rule counts the arc in both stretches), conservative but
  worded `A stop runs off the part`.
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

- **B10** (the user's ruling while planning b1, 2026-10-18): an End to end profile SAVED before b1 on a side a curve cuts follows
  that side's stretch on load (B1) — the fix the user asked for, applied to existing projects. A profile on an uncut side with
  sharp corners is unchanged byte for byte. No stored marker.
  *Amended (final review, the user's ruling, I1: "Fall back to straight")*: an End to end profile (never a loop) whose SWEPT
  faults are non-empty while its STRAIGHT faults — chunk 1's view curve (`curveFaults`) and a2's profile faults for it, the
  other profiles judged by their shape — are empty is built, drawn, worded and keyed EXACTLY as a2 built it (bodies, mesh,
  edges, drawings, diagrams, bench line, keys, snap points, stock probe, hole faults, the cut list; pinned by hashes taken on
  65947fd); it follows the curve only when the bit fits. ONE decision, in `geometryBoard` (memoised with the view): the
  profile stays a view curve, `viewProfileFaults` reads its straight faults, and `runsStraight` reads the decision back for
  the row's note, `Runs straight: too tight to follow the curve.` (the bench line has none: it describes what is cut).
  Authoring still judges an End to end on a cornered or arched side by its swept faults (`profileFaults`, unchanged): the
  Profiles row and Curves' `profileRefusal` refuse an ADDED swept fault, so authoring never creates a new one; a saved one,
  or a resize that makes it too tight, falls back.
  *Amended (implementation, b2 Task 3; Q10 for stops)*: a one-side STATION run falls back by the same test
  (`stopFallsBack`), decided FIRST with every other profile read by its shape and every path by stored presence ("phase 1"),
  so no fallback depends on another's; every other judgement ("phase 2", what `profileFaults` returns) then reads a
  fallen-back stop as straight. (1) B1a (Q18) never mitres a neighbour against a fallen-back stop on the stored part — a2's
  prism takes no arc — so the neighbour carries round to B1's station exactly as it is built (the view holds no fallen-back
  stop), and no half of a corner arc is left unprofiled; the profile being judged is always read as present by the others'
  paths (its swept judgement asks what it would claim if it followed). (2) Phase 2 is not always a subset of phase 1 in
  practice: two saved stops sharing only a corner arc both fall back, and the one whose only swept fault was the other has
  an EMPTY phase-2 swept judgement; the row's note therefore names the cause from the judgement that DECIDED the fallback
  (`fallbackCause`: a stop's phase 1, an End to end's `profileFaults`). (3) A fallen-back stop's own `profileFaults` stays its
  swept judgement (authoring's, as I1's fallen-back End to end reads `too-tight`); the row reads `viewProfileFaults` (its a2
  faults), clean.
  *Amended (implementation, b2 Task 3 fix round 1; the controller's rulings I1, I2)*: (4) A stop that follows never changes a
  neighbour's build: a saved stop also falls back when FOLLOWING would ADD a fault to any other profile on its face, so its
  own swept judgement includes the faults its following causes in its neighbours (`harmFaults`). Each neighbour is judged
  (phase 1) with that stop alone following against b1's baseline, every one-side station run read straight (a1/a2 built them
  so) — never against the other stops' shapes, so two half-stops that only together would mitre both corners of a saved End
  to end are each charged with it. Decided in phase 1 only: order-independent, no cycle. A b1 End to end beside a saved a2
  half-stop therefore keeps b1's build (pinned on dc49b01). *Cost:* such a stop stays straight where it could have followed.
  (5) The fault decision reads the reach the build uses: a swept profile whose built plan does not exist (the built path's
  chain, its skeleton at `bandReach`, which a bead's quirk wall widens by `WALL_MARGIN`) is `too-tight`, never clean.

**Planning rulings for chunk b1** (*Amended (planning)*, 2026-10-18; the probe: `docs/superpowers/plans/b1-probe/`):
- **Q1 The view.** `geometryBoard`'s `profiles` holds exactly the SWEPT profiles (stored order); straight ones stay view curves
  (P4, P18). The view is memoised to itself, so a second call returns it. ONE predicate, `shapedPart(view)` (curves or swept
  profiles), replaces every `curves.length === 0` routing gate.
- **Q2 Swept** = a loop, or an End to end run whose side's stretch (§3.3) is not that side's single straight segment. A STATION
  run stays a2's construction in b1 on any side (b2 makes one follow); the row offers no new one on a turned side (B7).
- **Q3 Construction** (§4.2, as probed): the face outline (rectangle with the through-thickness curves' chord chains spliced in,
  each chord carrying its curve's id), a truncated straight skeleton of the path (edge events: a swallowed segment collapses and
  its neighbours rejoin — the probe's notch case, a +2.9% volume error without it), skeleton face × convex piece of the kept
  (s, t) section as band pieces, the rest of the outline in convex pieces. The FIRST swept profile starts from the part's
  curve-free cells (cuts and angle cuts applied) and the through-thickness curves are not applied again (the outline carries
  them; starting after them multiplied an arch's 16 slices into 160 bodies, 49 ms against 11). Each further swept profile
  intersects the bodies it meets; then every other curve as today; then a B1 station's run-out (a2's `runoutPieces`).
  *Amended (implementation, b1 Task 3)*: a cell no piece reaches lies wholly in a skipped curve's waste and is DROPPED (the
  pieces tile outline × thickness); a body inside one piece keeps its object. An odd-count B1a mitre's end vertex is projected
  onto the outline chord.
- **Q4 Speed:** roundover, thumbnail and bead guarded at 40 ms (probe 10–33); a following cove and ogee are BUILT in b1 and
  guarded at 80 and 105 ms (probe 62 and 85), recorded for chunk (c).
  *Amended (implementation, b1):* the committed guards are each row's measured minimum + 25% (a single run's 25% flaked, Task 5):
  cove 81, ogee 113, both faces 78 ms (measured ~63, ~87–90, ~62). The BEAD loop is a chunk-c row too, guarded at 73 ms: its quirk
  wall became its own tagged section face (inv 16: no facet lines, smooth shading), a third section piece per segment, measured
  53–62 ms. Roundover, thumbnail and the front End to end with B1 run-outs keep 40.
- **Q5 Tags:** a vertical piece plane on an outline chord carries `curve: <id>` (chunk 1's radial normals and smooth lines below
  the profile unchanged); a swept section face carries `profileEdge` (a2's builder) and `sweep: <segment>`, so a2's `smoothPair`
  extends to swept facets in both directions.
- **Q6 Faults:** `profileFaults` adds `runs-off` (reach over half the face's smaller dimension, depth over the thickness, or no
  traceable outline) and `too-tight` (a convex outline arc's radius under the reach, R10; a concave one's under `BEARING`, B5;
  *amended, b1 Task 3*: or an end chord the offset swallows — the skeleton cannot end the band there);
  `overlap` is judged on outline stretches (straight and swept alike). A hole keeps the `:curve:<id>` key (P7).
  *Amended (final review, the controller's ruling, I2)*: a STATION (a2) run's coverage is its side's STRAIGHT chords only —
  a2's prism follows no curve, so it never claims a corner arc's or an arch's chords (over them it cuts only the curve's
  waste). A saved a2 stop inside a corner arc beside a B10 End to end on the adjacent side therefore stays clean, as on a2;
  a stop that shares a straight stretch with a swept run still overlaps.
  *Amended (planning, b2; the user approved 2026-10-18, the plan's contradiction 3)*: B6 makes station runs follow, so this
  holds only for a station run that FALLS BACK (Q10); a following one claims its path's cover like any swept profile.
- **Q7 Words:** `all round` reads `<name> all round <faceName>` (the collapse's own face words, so `the thickness face (max
  side)`, not §5's shorthand "the top"); its key `<name><fillet>, all round`. Bench lines list curves, then straight profiles,
  then swept, each in stored order.
  *Amended (implementation, b1)*: (1) an ASYMMETRIC swept profile (`profileAsymmetric`: ogee, bead, thumbnail, a filleted
  roundover or cove) LOOP facing the edge reads `, top on the edge` (the outline's edge is no single named face), before the
  fillet words as chunk 1 puts its facing words; facing the face (the stored default, as for symmetric kinds) it adds no top
  clause, since `all round <face>` already names the face; an End to end run reads chunk 1's line as is, its facing words
  included. Keys carry no facing, as chunk 1's do. (2) An End
  to end run reads `, round the corner` when its stretch takes ONE corner arc and `, round the corners` for two; the key
  likewise.
- **Q8 Diagrams:** a swept profile opens its face's thickness view and draws its inner offset line there, with its note.

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
  *Amended (final review, b2, M5)*: that holds for two-side runs only. A one-side stop on a turned path (an arch, notch, bow or
  corner arc; authorable since B7 lifted) is a station run b1 already loads, so b1 opens it SILENTLY — no fault, no note, the same
  bench line — and builds it as a2's straight prism, which on an arch cuts only air (the profile vanishes). Its data is intact, and
  it follows again when reopened on b2.
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
  *Amended (implementation, b2 Tasks 4–5)*: per Q12 the frame is the station's MODEL chord (`StopFrame`: F along it, N inward,
  the axis `BEARING` outside along −N), not the true arc's tangent, so the band (built on chords) and the run-out share one section.
  A stop never clips the band (the skeleton's stop ray already ends it in the stop plane), and a B1 station clips only its own END
  of it; clipping every face by every station's half-plane deleted a wrapping run's own band where it re-entered (a four-side wrap
  built 400.5 in³ against ~536).
  *Amended (implementation, b2 Task 6 fix round 1, I2; the implementer's ruling, endorsed)*: when an open run's two ends come
  within reach of each other round one sharp corner, their bands overlap. The overlap is NOT a fault (`overlap` is between two
  profiles; these stops are legal): the router cuts both passes, so the wood there is what NEITHER removes — the intersection of
  both chords' kept sections (`SweptPlan.bands`, the rest split into simple loops). Before, the bodies were the union of both
  passes' kept wood (225.515 in³ in a 225 in³ box). *Cost if wrong:* such a run should refuse instead.
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
  *Amended (implementation, b2 Task 6 fix round 1; the controller's ruling, for the user's review)*: a b2 stop's run-out is shaded
  by the section revolved about its own axis, except a vertex ON the stop plane, which takes the band's normal (`sweptNormals` of
  the end segment), so band and run-out agree there to 1e-6. At a stop on a corner arc they otherwise differed by up to ~0.9°
  (0.016 rad, about 3× b1's accepted tangent step): a shading choice, not geometry. Bodies, the axis and Q12 are untouched.
  *Cost if wrong:* the run-out's first sector interpolates a slightly bent normal.
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
    *Amended (planning, b2; the user approved 2026-10-18):* the example passed the wrong side and named no face — on the top face
    travel from the length min end to the length max end passes the width MIN side; the line names its face (Q21 of the b2 plan:
    `<name> on <face><top><fillet>, from <Start> round <between> to <Stop> (stopped)`).
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
  *Amended (implementation, b2 Task 9; the controller's rulings R5–R7, for the user's review)*: what the person sees governs. A
  one-side run keeps a2's lo/hi display (Start the lower station). **R5:** Stop side onto an ADJACENT side moves the station NEARER
  the corner the two sides share, keeps the other, and stores the run so the route goes the short way through that corner (Side
  and Stop side may trade roles afterwards); it had moved the field labelled Start, and the run went the long way round. **R6:**
  onto the OPPOSITE side it keeps the station SHOWN as Start and moves the one shown as Stop; Q16 routes it. **R7:** where keeping
  the shown Start would make an inconsistent `through` Start (Q17), it keeps the profiled extent on the kept side instead (the run
  still leaves through; the stored end moves). A moved end keeps the number it shows when that adds no fault to its own profile;
  a moved `through` end has no number, so it counts as at the corner its run leaves through and is always seeded `min(3, L/4)` in
  (Q26). Side on a one-side run stays a2's (both ends move; an end it runs off is greyed, not seeded — M2, for the user). Two-side
  runs: Side moves only Start, Stop side only Stop. *Cost if wrong:* the select's semantics reworked.
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
