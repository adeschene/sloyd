# Splayed legs, chunk 2: angled holes — design

Status: APPROVED by the user 2026-10-24 ("Approved, write the plan"); builder check taken 2026-10-24 (one question, answered in §5 as my call). Feature gap §1 "Splayed / raked legs, compound angles" (`docs/feature-gaps.md`),
follow-up 437. Chunk 1 (a part that leans, schema 22) is deployed: `docs/superpowers/specs/2026-10-24-sloyd-splayed-legs-design.md`.
**Built 2026-10-25 on branch `angled-holes`** (plan Tasks 1–12; schema 23); NOT merged or deployed. Browser verification (plan
Task 13) is owed. Later rulings: the *Amended (build)* block at the end, which wins where it differs from the text.

The user chose stretchers next. The numbers on the chunk 1 stool (rake 8°, splay 12°) showed that a square rung's end lands
across a leaning leg's corner, so no saw cut can shoulder it flush; staked furniture fits rungs as round tenons in sockets
bored at an angle. Asked how to order the work, the user chose **"Angled holes first"**, then stretchers on top of it. They
asked to skip the design questions, so every decision below that is not quoted from the user is **my call** and is marked.
The read-only survey behind this design (every hole reader, file by file) is summarised in §10.

## 1. What and why

A staked seat's leg sockets are bored at the legs' resultant angle along their sightlines — the two numbers chunk 1
already prints. Today Sloyd can only bore square to a face, refuses holes on a leaning part, and refuses a lean on a holed
part. This chunk lets a hole row's bit **tilt**, bores a seat's sockets for its leaning legs in one action, and lifts both
refusals, so a later chunk can bore a leg for a stretcher.

Who it serves: someone modelling staked furniture (the seat's sockets now) and anyone boring at an angle (an angled dowel,
a canted shelf pin, a pocket into a rail).

## 2. Goals, non-goals, anti-goals

**Goals**
- (G1) A hole row may tilt: its bit leans off square by two typed angles, stored, loaded, drawn, cut-listed and exported
  exactly.
- (G2) **Bore leg sockets**: on a seat, one action bores a through socket for every leaning leg that stands under it,
  along each leg's real axis.
- (G3) A leaning part may take hole rows, and a holed part may lean.
- (G4) Every hole reader is correct for a tilted bore: viewport mesh, rims, the section cut, snapping, drawings and the
  Plans sheet's part diagrams, faults and bench text.

**Non-goals for this chunk**
- Round tenons (on a leg's top or a rung's end) and the design checks reading a tenon in its socket: **chunk 2b**.
- Stretchers between legs: chunk 3 (fu 438), built on 2b.
- Tapered (reamed) sockets and tapered tenons.
- Generate or Refine authoring a tilt (the design form is unchanged).
- A socket that follows its leg automatically when the lean changes (§5's note instead).

**Anti-goals** (failure even if it "works")
- **A document with no tilted hole is byte for byte as before**: meshes, rims, drawings, diagrams, caps, faults, the cut
  list, export, and every identity and perf test (`bodyMeshIdentity`, `drawingIdentity`, `diagramIdentity`,
  `sweptIdentity`, `holesPerf`, `curvesPerf`).
- **No tilt is ever lost silently.** A build, a converter or an AI path that cannot carry a tilt refuses or keeps the
  part; it never drills the hole square.
- **A fault test may over-report for a tilted bore, never under-report** (§6.3). The unclipped "clean hole" mesh path
  trusts it.
- No hole moves in the wood because of an edit that does not name it (Level the ends, §7).

## 3. The model (schema 23)

### 3.1 Stored form

- **Two optional slopes on `HoleRow`**, flat primitives (my call; the survey's recommendation):
  - `tiltAlong` — the bit's travel along the `along` dimension per inch of depth, **positive toward the far end from
    `alongFrom`**;
  - `tiltAcross` — the same along the third dimension, **positive toward the far side from `acrossFrom`**.
- **Relative to the row's own flags**, so `mirrorHoleRow`'s flag flips carry the tilt with no arithmetic (inv 44 holds as
  written) and are their own inverse. An *edit* that changes `alongFrom` or `acrossFrom` negates the matching slope so the
  bore keeps its world direction (an edit may do arithmetic; a mirror may not).
- **Stored only when non-zero.** A square row stores neither key, so square rows, `holeRowValues` key strings and every
  identity test are unchanged. `holeRowValues` skips an absent tilt (it never emits `undefined`).
- **Degrees exist only in display and typed input** (the angle-cuts rule): a typed angle writes `tan(angle)` into one
  slope and leaves the other exactly as stored.
- **Bound (my call):** each component within ±45°, and the resultant `atan(hypot(tiltAlong, tiltAcross))` at most 45°. The
  store refuses past it with a sentence; the loader drops a row whose tilt is malformed or past it (a malformed entry is
  dropped, per Versioning).
- **`HOLE_FIELDS`** lists both keys (inv 40: "same hole" then includes the tilt, ids ignored). Links share them with the
  rest of the row (inv 45; no new `LINK_FIELDS` entry).

### 3.2 What the numbers mean (my calls)

- **`station` and `inset` locate the MOUTH centre** on the entry face — the point you mark and start the bit on.
- **`depth` is measured along the bit**, at the centre: what a depth stop on a tilted drill guide sets. The bench text says
  so (§8).
- **`through` means the bore exits the opposite face.** A tilted bore whose wall reaches a side face instead is a
  `breaks-out` fault, as a square bore past an edge is today.
- **The bottom of a blind bore is a flat disc square to the bit** (a Forstner or brad-point bottom), not parallel to the
  face.

### 3.3 Schema 22 → 23

- **Harm argument:** `validateHoleRows` rebuilds every row field by field, so a schema-22 build (production today,
  `index-B3SCZcHR.js`) would load a tilted row, drop the tilt without a word and drill it square — then autosave it. A 23
  file must be refused by a 22 build.
- **The step** adds nothing (absent is square). Validation keeps finite slopes within the bound and drops anything else.
- **Rollback:** rolling back past it refuses every project saved at 23; the rollback table and `docs/versioning.md` get
  their rows.

## 4. Properties: tilting a row

In the Holes section, each row gets the tilt below its existing fields. My calls:

- **Fields:** `Tilt toward end` (degrees, with a select naming the two ends of `along` in the panel's existing words) and
  `Tilt toward side` (degrees, with a select naming the two sides of the third dimension). Both read 0 on a square row.
  This mirrors the Lean section's magnitude-and-direction controls, so a symmetric edit never flips a direction (chunk 1
  Ruling 17).
- **Readout** on a tilted row: `Bore 14.3° off square · sightline 33.5° from the <along> dimension`. Wording is the
  builder's, through `angleText.ts`'s precision (0.1°).
- **Refusals** follow the Holes section's rule: an edit is refused when it ADDS a fault (inv 50), decided before any
  mutation, shown as the field's own error (`DimensionField`'s contract). The bound refusal is one sentence.
- **Presets** stay square. Any row may be tilted, a row of several holes included (they stay parallel).
- **Holes on a leaning part:** the `A leaning part can't take holes yet …` refusal is removed. The Holes section works on
  a leaning part as on any other (the row is in the part's own frame).

## 5. Bore leg sockets (G2)

A button in the Holes section of an UNLEANED part, shown only when at least one leaning part stands under it. My calls
throughout.

- **"Stands under it":** a leaning part whose up-facing LEVEL face (`levelFaces`, inv 57) is coplanar with one of this
  part's down-facing level faces, with plan overlap (`overlapArea`, the resting rule the design checks use). Found in the
  WORLD (`worldParts`), so the legs and the seat may sit in different assemblies.
- **What it bores, per leg:** one through hole (`count` 1) in the seat,
  - **entering from the seat's top** — the face opposite the one the leg meets (the face you mark and bore from, seat up);
  - **centred where the leg's axis meets that face**, the axis being the line through the leg's pivot along its leaned
    length (`lean.ts`);
  - **tilted along the axis** in the seat's own frame, so the hole's resultant and sightline are the leg's;
  - with a **diameter** typed once beside the button (default 1", refused at or above the leg's smaller section
    dimension).
- **The tilt is written through the seat's own placement** (its turn, posture and any mirror on its path), lowered like
  every edit (`treeEdit.ts`, inv 46). The world bore is exact to float; a test pins mouth centre and axis against the
  leg's axis to 1e-9 in a turned and mirrored seat.
- **A shared seat** (a linked seat, or one in a definition placed more than once) stores its holes once, so a socket bored
  from one copy lands in every copy. My call, after the builder check, following Level the ends' precedent (chunk 1 §5):
  the action judges **every** placement and Shape user of the seat against **its own** legs, and bores (or replaces) only
  when every copy gives the same sockets in the shared frame (to 1e-9). Otherwise it refuses in one sentence naming the
  copies that disagree, and nothing is written. Two identical stools from one component therefore work; two that differ
  refuse. The stale-socket replace rule is judged the same way, so boring from one copy can never remove a socket another
  copy still needs. Tests cover a definition placed twice (agreeing and disagreeing), a linked seat and a mirrored copy.
- **Each socket must be fault-free** (§6.3); a socket that would break out or meet another hole is not added, and the
  action names that leg in one sentence. The others are bored.
- **A leg that already has its socket** (a row whose world axis is the leg's axis, to 1e-9) is skipped.
- **Stale sockets:** the socket copies the leg's axis; a later lean edit, resize or move leaves it pointing the old way.
  The seat's Holes section notes it: `Front right's socket no longer follows its leg — Bore leg sockets again`. Boring
  again **replaces** that leg's stale socket: a count-1 row whose axis segment passes through the leg's up-facing level
  face (the builder defines the test structurally), in the same undo entry. Never automatic in this chunk.
- **One undo entry; refused while read-only** (inv 47).
- **Bench note:** each socket's row prints its bench line (§8), so the cut list and Plans carry the boring numbers.

## 6. Geometry

### 6.1 The bore

- **`Hole` gets a unit axis vector** (and an in-plane basis), while `axis`/`dir` keep naming the ENTRY face, which stays
  axis-aligned. Every reader that used `axis` as "the drill direction" uses the vector; readers that used it as "the face"
  (mouth plane, plane keys, diagram views) keep it. A square row's vector is exactly the face axis, so its geometry is
  unchanged.
- **Rings:** the mouth (and a through exit) is an ELLIPSE in the face plane (semi-axes r and r/cos θ); a blind bottom is a
  circle square to the bit. Each ring's vertices are the circle square to the bit slid along the bit to its plane, so the
  face, the wall and the rim share vertices (watertightness).
- **The prism** keeps facets parallel to the bit; its entry cap is the face plane, its far cap the bottom disc's plane or
  the exit face. It stays one convex polytope, so `minusPrism`, `clipPlan`, `touchesPrism` and `clipPolygon` are reused
  unchanged. Its axis-aligned box (`prismInfo`, `holeRegion`, `holeTouchesBox`) is recomputed for the tilt: these are
  REJECT tests, so the box must contain the bore.
- **Faces:** the plane-ring helper (today `axialOffset`, faces square to the axis only) generalises to "where this
  cylinder meets this plane", so `faceTriangles` and `mergeHoledPlanes` cut an elliptical ring instead of falling back to
  the convex split. **A tilted bore's mesh is watertight** in every case `curvesWatertight.test.ts` covers, with tilted
  cases added.
- **Performance:** `holesPerf.test.ts` gains tilted cases under the same budgets (≤ 40 ms healthy, ≤ 100 ms faulted, the
  minimum of 9). Memoising by the frozen hole's identity stays.

### 6.2 On a leaning part

A holed leaning part's bores are part-local, so the viewport mesh, rims, drawings and snap points already compose the lean.
**Section caps** of a leaning part now subtract its bores (in the part's frame, before the pivot transform), lifting the
chunk 1 residue (fu 437: caps without bores). The section's `radius + depth` reach filter widens for a tilted mouth and an
offset exit.

### 6.3 Faults (inv 50)

| rule | for a tilted bore |
|---|---|
| `breaks-out` (edge) | exact: the wall's reach in each face direction over the segment from mouth to bottom (or exit), plus the mouth ellipse |
| `too-deep` | exact: the bottom disc's deepest point against the back face; a bottom poking out a side is `breaks-out` |
| `off-flat` vs an angle cut | exact: the minimum of the plane's distance over the end discs |
| `off-flat` vs a rectangular cut, `meets-hole`, `breaks-out` into a curve or swept profile | **conservative** (my call): a closed form that may report a fault where the true cylinder just clears, never the reverse — the bore's box against a cut or curve region, a capsule test between two bores |

Inv 50's "exact closed forms" stays true for square rows (unchanged code paths); for a tilted row it reads "exact or
conservative, never sampled". The cost: a legal tilted bore very close to a cut, a curve or another hole may be refused;
the refusal says so. Fault words gain a tilted bore's side break-out, through `holeFaultText`, the ONE home.

## 7. Holes on leaning parts

- **Both refusals are lifted** (`HOLES_ON_LEAN`, `LEAN_HAS_HOLES`; their strings and the tests pinning them go).
- **Level the ends keeps holes in the wood.** Today it lengthens both ends and moves the part. With holes allowed, a row
  measured from the foot, or entering an end, would shift silently. Level the ends re-anchors every hole row exactly
  (`rebaseHoles`, moved from `generate/joints/` into `document/`, since the store must not import `generate`), in the same
  edit; a hole the new ends cut through is KEPT and its fault noted (inv 50's resize rule).
- **The lean's face re-choice** (`seamFree`, chunk 1 Ruling 2) turns a part's features a quarter turn about its length at
  one exact angle. Accepted for angle cuts; for holes it would turn a stretcher socket to face the wrong way. **A lean edit
  that re-chooses the face on a part with holes is refused** (my call), one sentence naming the cure (keep both angles
  non-zero, or remove the holes).
- **The design checks still ignore holes** (inv 38). A leg standing under a socket is unchanged by it.

## 8. Text, drawings and the Plans sheet

- **Bench line** (`holeText.ts`, the ONE home): a tilted row adds `bored 14.3° off square on a 33.5° sightline from the
  <along>` and says the depth is along the bit. Square rows' lines are byte for byte unchanged.
- **Drawings** (`holeDrawing.ts`): rims are the mouth and exit/bottom ellipses; the edge-on single-segment rule judges the
  RIM PLANE's normal, not the bit. Feature tags stay on their segments (inv 16, 47); square-hole drawings are unchanged.
- **Part diagrams** (`diagram.ts`, `PartDiagram.tsx`): a tilted mouth draws as its ellipse in the entry view, the exit
  offset by the tilt, and the side views draw the bore as a slanted band, not a box. `DiagramHole` gains what an ellipse
  needs; square holes' diagrams are byte for byte unchanged.
- **Feature callouts:** a tilted bore is true in no orthographic view, so its key follows the "visible" order (inv 16's
  view order).
- **Snapping:** a through bore's exit centre is where the bit's axis meets the exit face.

## 9. AI paths, joinery and Refine

- **Generate:** unchanged. The design schema is byte for byte the same (fu 322's grammar budget is not spent).
- **Refine keeps a part with a tilted row exactly**, as it keeps a leaning part (`leanKeep.ts`'s `keptParts`, inv 56): put
  in first, verbatim; a model part reusing its name is dropped; no floor shift while one is kept; one inside an assembly
  refuses Refine. The kept-list wording names it (`Kept as is (leans or angled holes): …`). So no tilt reaches the model,
  and none comes back square.
- **`turnCandidates`** never turns a part with a tilted row (as for a leaning part).
- **Joinery and Repair** accept a tilted bore on an unleaned part: `featureAllowed` reads its (conservative) box like any
  hole. A leaning part is still refused first (`leaningRefusal`).

## 10. The survey, in brief

A read-only survey (2026-10-24, this design's scratch) listed every hole reader. The costs, largest first:
1. the geometry core (the axis as a vector; elliptical rings; the plane-ring helper; the mesh under the perf and
   watertight guards);
2. the faults (§6.3: two have no practical exact form for a skew cylinder);
3. the schema bump (§3.3: the loader rebuilds rows field by field);
4. AI paths that re-store holes in world words would lose a tilt (§9 keeps those parts instead);
5. Level the ends moving holes, the face re-choice turning them, and a socket not following its leg (§5, §7).
It also found that `holeWorld.sameHoles` compares only some fields (not table-driven); with tilted parts kept from the
model it is not reached by a tilt, and the builder notes it.

## 11. Records

- `docs/invariants.md` and CLAUDE.md: inv 50 (the vector axis, the tilt, the conservative clause), inv 44 (tilt flips with
  the flags), inv 56 (kept parts), inv 57 (holes on leaning parts; the re-choice refusal); the Versioning line (23).
- `docs/versioning.md`, `docs/rounds.md` (rollback table: schema 23), `docs/module-map.md`.
- `docs/follow-ups.md`: 437 closed by this chunk except the round tenon (moved to a new chunk 2b entry); 438 notes its
  dependence on 2b; new entries for anything deferred (a socket that follows its leg; tapered sockets; AI authoring a tilt).
- `docs/feature-gaps.md`'s row.
- Browser verification on the dev server: the stool's sockets bored, seen, sectioned and drawn; a tilted row edited and
  refused; a holed leaning leg levelled.

## 12. Later chunks (outline only)

- **Chunk 2b: round tenons.** A round (later tapered) tenon on a part's end, coaxial with it; the leg's top tenon through
  its socket; the design checks hold a tenon seated in a matching socket (an extension of invs 38/39, never proximity).
- **Chunk 3: stretchers** (fu 438): a rung between two leaning legs at a typed height, its length and end angles from the
  legs' axes, round tenons into sockets bored in the legs along the rung.

## 13. Left to the builder

- The UI wording and the direction words (§4, §5, §8).
- The structural test that recognises a leg's stale socket (§5).
- The closed forms of §6.3's exact rows and the shape of the conservative ones, within "never under-report".
- How the plane-ring helper and the elliptical diagram are built, within byte-identity for square holes.

## Amended (build)

Rulings made while building, on branch `angled-holes` (2026-10-24/25; the SDD ledger and the task reports). The code plus these
rulings govern; where one differs from the text above, this block wins. Records: invariants 44, 50, 51, 56 and 57 in
`docs/invariants.md`; follow-ups 447–455 (437 closed but the round tenon).

- **Ruling P1 — tilt keys in `holeRowValues` carry their NAMES (§3.1's "`holeRowValues` skips an absent tilt", narrowed).** For
  EACH PRESENT tilt key it appends the key's name then its value (e.g. `'tiltAlong', 0.25`), in `HOLE_KEYS` order; an absent key
  appends nothing, so square rows' arrays are unchanged. `sameHoleRow` also requires equal lengths: "skip absent" alone let a square
  row equal a tilted one (the shorter array walked) and a `tiltAlong`-only row equal a `tiltAcross`-only row of the same value. Cost:
  the key strings (cut-list grouping, `geometryKey`) of TILTED rows carry the key names; harmless.
- **Ruling T2a — `holes.test`'s `holeInstances` deep-equal gains `bit` / `reach`.** The widened `Hole` forces it; "existing tests
  unchanged" means behaviour, not a deep-equal on a widened struct. Cost: none (the square values are asserted equal).
- **Ruling T2b — `holeTilt.ts` restates `lean.ts`' two degree conversions.** An import would cycle (holes → holeTilt → lean → frames →
  holes); a test pins the copies against `lean.ts`. Cost: two one-line copies could drift; the test catches it.
- **Ruling T2c — `retilt` re-derives from the previous row only (§3.1's edit rule).** The Holes panel applies it ONLY for a change
  of `face`, `from`, `along`, `alongFrom` or `acrossFrom`, and writes a typed tilt directly. Cost: a combined edit would drop a typed
  tilt (no such control exists).
- **Ruling T2d — a new fault kind, `too-shallow` (§6.3, which was silent).** A blind tilted bore whose bottom disc reaches back to the
  entry face — depth along the bit ≤ r·tanθ + `HOLE_EPS`, the disc's uphill rim at or above the mouth plane — is `too-shallow`:
  `holeFaults` decides it, `holeInStock` is false (the mesh takes the clipped path), and it has its own words (`holeFaultText`,
  `faultKey`; the panel's `Too shallow for its angle — deepen it, or use Through.`). An add or edit that ADDS it is refused; one a later
  edit causes is KEPT and noted (inv 50). Cost: one more fault word; a 1/2" bore at 45° needs more than 1/4" of depth.
- **Ruling T3a — the off-flat and capsule forms (§6.3's closed forms, as built).** The mouth/exit `off-flat` form is
  `n·c − r·|n − dir(n·m)e_a|` (the plan's form under-reports at the mouth), and `meets-hole`'s pair capsule (`capsuleOf`) runs `r·tanθ` past a
  face-flat end (the plain capsule misses the mouth's uphill tip). Both stand over the plan's text. Cost: none (the reviewer re-derived both).
- **Ruling T7a — square holes keep rendering as `<ellipse>` (the plan said `<circle>` otherwise).** That IS today's output; byte
  identity wins over the plan's text. A tilted mouth was first an `<ellipse>` with a matrix transform; the Task 7 review replaced it
  with a `<path>` of `TILT_ELLIPSE_POINTS` points in user units, so its stroke scales with the viewBox like every other hole line.
  Cost: none.
- **Ruling T8a — a blind tilted bench line ends `, depth measured along the bit` (§8's "says the depth is along the bit").** Not `,
  deep along the bit`, which dangles a clause away from the depth number. Cost: a wording tweak.
- **Ruling T9a — a TILTED row entering an end slides on Level the ends (§7, and the plan's "through rows are unchanged").** Its
  station and inset move by `−e` times its slopes, through or blind (`levelEndHoles`); "unchanged" holds only for square rows —
  otherwise the bore's line moves in the wood. Cost: none (world-line tests).
- **Ruling T9b — Level the ends REFUSES an unstorable hole (§7's "a hole the new ends cut through is KEPT and its fault noted",
  superseded for that case).** When a shortened end would leave a row with a negative station or inset, or a blind depth ≤ 0
  (`storableRow`), it refuses: `Levelling the ends would cut away a hole — move it or remove it first.` Those values are unstorable
  (the loader drops the row silently), so keep-and-note is impossible; a fault on a storable row is still kept and noted. Cost: the
  user removes a hole before re-levelling; the wording is unreviewed (fu 454).
- **Ruling T9c — the panel's wording calls (§4).** Selects `Tilt end` / `Tilt side`; a square row's select defaults to the far
  end/side; the readout ends `from the <along>` (§4 said `… dimension`); `addHoleRows` also refuses an out-of-bound tilt
  (`HOLE_TILT_PAST_BOUND`). Cost: wording tweaks (fu 454).
- **Ruling T10a — a faulted socket is left out and the rest bored, each faulted leg named (§5).** The plan's `socketPlan` returned
  rows or a refusal; it refuses outright only when no socket can be bored, and otherwise carries the sentences as a note. Cost: none
  (the spec wins).
- **Ruling T10b — "stands under" judges height within `TOUCH` (1/32"), the design checks' resting tolerance (§5's "the resting
  rule"), not `LEVEL_EPS`.** After a lean edit and Level the ends a leg's top sits ~0.0013" off the seat and would otherwise lose its
  stale note and be re-bored beside its old socket. Cost: a leg up to 1/32" below a seat counts as under it.
- **Ruling T10c — copies are compared on every number at 1e-9, in a flag-free form (§5's "to 1e-9").** Exact comparison fails on
  non-dyadic offsets. Cost: two copies differing by less than 1e-9 bore as one.
- **Ruling T10d — only a TILTED count-1 row can be a stale socket (§5's structural test).** A user's square clearance hole over a
  leg top is never replaced. Cost: a square socket from elsewhere is never replaced (leaning legs always give tilted sockets).
- **Ruling T11a — a JOINED Refine refuses up front when any part has a tilted row (§9, which keeps such a part EXACTLY).**
  `runJoinery` re-joins the whole refined document, kept boards included, which cannot promise "exactly" (as chunk 1 refuses a kept
  leaning part in a joined Refine): `Refine can't keep a part with angled holes in a joined project yet: <name>.` (reason
  `'lean-joint'`). Joinery and Repair are unchanged. Cost: Refine is unavailable on a joined project with an angled-hole part until the
  joints are removed (leaning stools already refuse a joined Refine).

Also as built (no ruling; the text above reads loosely): §3.1's "per inch of depth" is per inch of AXIAL travel (along the face's
normal: `bitVector`'s face-axis component is exactly ±1), while a blind row's stored `depth` is measured along the bit (§3.2), so
the bore's axial reach is `depth / |bit|`. In the section (§6.2), a tilted bore the plane meets never takes fu 348's rings fast
outline: its outline is the union of the bored pieces.
