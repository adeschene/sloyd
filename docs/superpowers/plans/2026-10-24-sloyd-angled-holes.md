# Angled holes (splayed legs chunk 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hole row's bit may tilt off square; a seat bores sockets for its leaning legs in one action; holes and leans
coexist on a part.

**Architecture:** Two optional flag-relative slopes on `HoleRow` (schema 23). One new pure module, `holeTilt.ts`, is the
ONE home of tilt math (slopes ↔ degrees, the bit vector, flag re-expression). `holes.ts` gives `Hole` a bit vector and
generalises rings to face-parallel planes, so every existing reader keeps working for square rows byte for byte and gains
the tilt where it reads the bit. A second pure module, `legSockets.ts`, decides Bore leg sockets; the store writes through
`mapWorld` like every hole edit.

**Tech Stack:** TypeScript, React, three.js (react-three-fiber), Zustand, Vitest (`npx vitest run <file>`), `npm run build`
(the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-24-sloyd-angled-holes-design.md` (APPROVED 2026-10-24). Read it first; where
this plan and the spec differ, the spec wins and the difference is reported.

## Global Constraints

- **A document with no tilted hole is byte for byte as before**: `bodyMeshIdentity`, `drawingIdentity`, `diagramIdentity`,
  `sweptIdentity`, `bandFreeIdentity` and every existing test pass unchanged; a square row's `Hole`, rings, prism,
  rims, faults, bench line and key strings are identical (`===` on numbers, same arrays' contents).
- Stored keys: `tiltAlong?: number`, `tiltAcross?: number` on `HoleRow` — slopes (tan of the angle), positive toward the
  far end from `alongFrom` / the far side from `acrossFrom`. Stored only when non-zero; never `-0` (store `0 - x`-style
  plus-zero, or omit). Degrees only in display and typed input.
- Bound: each component within ±45° (`|slope| ≤ 1`) and `atan(hypot(tiltAlong, tiltAcross)) ≤ 45°`
  (`hypot ≤ 1`). Store refusal copy: `The bore can't tilt past 45° in all — reduce an angle.`
- `CURRENT_VERSION` 23. A schema-22 build refuses a 23 file (the existing "newer than this build" path).
- Depth of a blind tilted bore is measured ALONG THE BIT; `station`/`inset` locate the MOUTH centre on the entry face;
  `through` exits the opposite face; a blind bottom is a disc square to the bit.
- Fault tests for a tilted bore are exact or CONSERVATIVE (may over-report, never under-report). Square rows keep their
  exact code paths untouched.
- Layer order (CLAUDE.md): `document` imports nothing from `store`, `generate`, `panels`, `viewport`. The store never
  imports `generate`.
- Removed copy (verbatim, both strings and their tests go): `A part with holes can't lean yet — that comes with angled
  holes.` and `A leaning part can't take holes yet — that comes with angled holes.`
- New copy (verbatim):
  - lean re-choice on a holed part: `This lean would turn the part a quarter turn about its length, and its holes with it — keep both angles above 0, or remove the holes first.`
  - stale socket note: `<Leg name>'s socket no longer follows its leg — Bore leg sockets again.`
  - copies disagree: `Its copies stand over different legs (<names>) — make them match, or make this part unique first.`
  - socket faults: `<Leg name>'s socket would <fault words> — move the leg, or choose a smaller diameter.`
  - diameter too big: `The socket must be narrower than <Leg name>.`
- Every refusal is decided before any mutation; one undo entry per action; refused while read-only (inv 47) or gesturing.
- No `localStorage.clear()` on the dev server; test projects stay; paid runs: none needed.

## Review Focus

1. **A mirrored or turned seat.** Bore leg sockets on a seat inside a mirrored instance, turned 90°, must give a world bore
   on each leg's axis to 1e-9 (Task 10's test).
2. **A square row after a tilt is cleared.** Typing both angles back to 0 must leave no `tiltAlong`/`tiltAcross` key at
   all, so the row is `sameHoleRow`-equal to its original and the cut list groups them (Task 9).
3. **Level the ends on a leg with a socket measured from the foot.** The socket stays at the same place in the wood
   (Task 9's test reads the hole's world mouth before and after).
4. **A tilted bore near an edge.** A bore whose mouth is inside the face but whose wall leaves a side further down must be
   `breaks-out`, and the mesh path must clip it (Task 3 test; Task 4's watertight/clean gate).
5. **Mirror equivariance with a chiral tilt** (both slopes non-zero and unequal): `mirrorHoleRow` twice is the identity,
   and the mirrored part's world bore is the reflection of the original's (Task 2).

---

### Task 1: Schema 23 — the stored tilt

**Files:**
- Modify: `src/document/types.ts` (`HoleRow`), `src/document/holes.ts` (`HOLE_FIELDS`, `holeRowValues`),
  `src/document/document.ts` (`CURRENT_VERSION`, `validateHoleRows`, the 22→23 step), `docs/versioning.md`
- Test: `src/document/document.test.ts`, `src/document/holes.test.ts`

**Interfaces:**
- Produces: `HoleRow.tiltAlong?: number`, `HoleRow.tiltAcross?: number`; `HOLE_FIELDS` lists both;
  `holeRowValues(r)` appends a tilt value ONLY when present (an absent key emits nothing, so square rows' value arrays are
  unchanged in length and content).

- [ ] **Step 1: Failing tests** in `document.test.ts`:
  - `a 23 file keeps a tilted row's slopes exactly` — load a doc at version 23 with `tiltAlong: 0.25, tiltAcross: -0.1`;
    the row comes back with both, `===`.
  - `a 22 file loads with CURRENT_VERSION 23 and no tilt keys appear`.
  - `drops a row whose tilt is malformed` — `tiltAlong: 'x'`, `NaN`, `Infinity`, `hypot > 1` (e.g. `tiltAlong: 0.8,
    tiltAcross: 0.8`) — the ROW is dropped, the part kept.
  - `a zero tilt is stored as absent` — `tiltAlong: 0` loads as a row with no `tiltAlong` key (`'tiltAlong' in row` is false).
  - `a file newer than 23 is refused` (the existing refusal, re-pinned at 24).
  In `holes.test.ts`: `holeRowValues of a square row is unchanged` (assert the exact array for `defaultHole` of a fixture
  board, 11 entries) and `sameHoleRow tells tilts apart` (two rows differing only in `tiltAcross`).
- [ ] **Step 2: Run** `npx vitest run src/document/document.test.ts src/document/holes.test.ts` — FAIL.
- [ ] **Step 3: Implement.** Bump `CURRENT_VERSION` to 23; the step adds nothing. `validateHoleRows` copies each tilt key
  only when it is a finite number, non-zero (zero → omitted), and the row passes `|a| ≤ 1, |c| ≤ 1, hypot(a, c) ≤ 1`
  (else the row is dropped). `HOLE_FIELDS` gains `tiltAlong: true, tiltAcross: true`; `holeRowValues` skips a key whose
  value is `undefined`. `docs/versioning.md`: the 22→23 row (adds nothing; validates the tilt; drops a malformed row;
  harm: a 22 build drills a tilted hole square — spec §3.3).
- [ ] **Step 4: Run** the two files, then `npx vitest run src/document` — PASS (identity tests included).
- [ ] **Step 5: Commit** `feat(angled-holes): schema 23, the stored tilt (Task 1)`.

### Task 2: `holeTilt.ts` and the bore geometry

**Files:**
- Create: `src/document/holeTilt.ts`, `src/document/holeTilt.test.ts`
- Modify: `src/document/holes.ts`, `src/document/document.ts` (re-export), `src/document/holes.test.ts`

**Interfaces:**
- Produces (`holeTilt.ts`, the ONE home of tilt math; imports `lean.ts`' `slopeOf`/`degreesOf`):
  - `isTilted(r: Pick<HoleRow, 'tiltAlong' | 'tiltAcross'>): boolean`
  - `bitVector(r: HoleRow): V3` — board-local, UNNORMALISED, axial component exactly `±1` (`+1` entering from min):
    `m[face] = dir`, `m[along] = (alongFrom === 'min' ? 1 : -1) * (tiltAlong ?? 0)`, `m[across]` likewise with
    `acrossFrom`. A square row gives exactly `±1` and two `0`s (never `-0`).
  - `tiltDegrees(r): { along: number; across: number }` (signed, toward the far end/side positive),
    `tiltResultantDeg(r): number`, `tiltSightlineDeg(r): number` (0–90, from the `along` dimension).
  - `withinTiltBound(a: number, c: number): boolean`.
  - `retilt(prev: HoleRow, next: HoleRow): HoleRow` — the edit rule: if `face` or `from` changed, the result has no tilt;
    otherwise the bit keeps its board-local direction (each dimension's signed lateral component is re-expressed through
    `next`'s `along`/`alongFrom`/`acrossFrom`), zero components omitted.
- Produces (`holes.ts`):
  - `Hole` gains `bit: V3` (= `bitVector(row)`, axial component ±1). `axis`/`dir` keep naming the ENTRY face.
    `depth` keeps its meaning for a through hole (the face dimension, axial) and is ALONG THE BIT for a blind one;
    add `reach: number` = the axial distance from the entry plane to the far ring plane for a through hole, and to the
    bottom disc's CENTRE for a blind one (`depth / |bit|`; equals `depth` for a square row).
  - `holeRing(h, t)` — the ring where the cylinder meets the face-parallel plane at axial `t` (vertices: circle square to
    the bit, slid along the bit to the plane: `p_k = c + t·bit + r·w_k + λ_k·bit`, `λ_k = −dir·(r·w_k)[a]`). For a square
    hole the existing `ringOf` arithmetic runs unchanged (branch on `isTilted`).
  - `holeBottom(h): V3[]` — a blind bore's bottom ring, square to the bit; for a square hole it IS `holeRing(h, h.depth)`.
  - `holePrism` — facets parallel to the bit; entry cap the face plane; far cap the bottom disc's plane (blind) or the
    exit face plane (through); PRISM_EPS as today. `prismInfo`'s box contains every facet vertex and the mouth ellipse.
  - `holeRims(h)` — mouth ring and far ring (`holeBottom` blind, `holeRing(h, h.reach)` through).
  - `holeRegion`, `holeTouchesBox` — the tilted bore's axis-aligned box (contains the bore; conservative).
  - `insideHole(h, p)` — perpendicular distance to the bit's line `< r`, between the entry plane and the far cap.
  - `axialOffset` unchanged (faces square to the face axis), now valid for tilted rings because rings live on
    face-parallel planes.

- [ ] **Step 1: Failing tests** in `holeTilt.test.ts`: `bitVector` of a square row is exactly `[±1,0,0]`-shaped per face
  (all three faces, both `from`); a typed 10° along with `alongFrom: 'max'` points toward the min end; `retilt` keeps a
  bore's direction across an `alongFrom` flip and an `along` swap (chiral tilt 0.2 / −0.05) and clears it on a `face` or
  `from` change; `tiltResultantDeg` of `(tan 8°, tan 12°)` is 14.29…° (match `lean.ts`' `resultantDeg` on the same pair to
  1e-12). In `holes.test.ts`: for a tilted row (chiral, through and blind) every `holeRing` vertex lies on its plane
  (|Δ| ≤ 1e-12) and at distance `r` from the bit's line (≤ 1e-12); `holeBottom` vertices are `r` from the line and on the
  plane square to the bit at the bottom centre; every prism plane keeps every ring vertex inside (≥ −1e-9); `prismInfo`'s
  box and `holeRegion` contain every ring vertex; `insideHole` is true at the bore's mid-axis and false just outside the
  wall; **square rows**: `holeInstances`, `holeRing`, `holePrism`, `holeRims`, `holeRegion` deep-equal snapshots taken
  from the CURRENT code (capture them in the test before changing `holes.ts`, as literal arrays, for one blind and one
  through row in two postures). **Mirror equivariance**: for a chiral tilted row, `mirrorHoleRow(mirrorHoleRow(r, d), d)`
  deep-equals `r` for each `d`, and the mirrored row's `bitVector` is the original's with component `d` negated.
- [ ] **Step 2: Run** `npx vitest run src/document/holeTilt.test.ts src/document/holes.test.ts` — FAIL.
- [ ] **Step 3: Implement** `holeTilt.ts` and the `holes.ts` changes above. Memoisation by frozen identity stays; the ring
  memo key stays the numeric `t`; `holeBottom` gets its own memo slot.
- [ ] **Step 4: Run** the two files and `npx vitest run src/document src/viewport` — PASS (identity tests unchanged).
- [ ] **Step 5: Commit** `feat(angled-holes): holeTilt.ts and the tilted bore (Task 2)`.

### Task 3: Faults for a tilted bore

**Files:**
- Modify: `src/document/holeFaults.ts`, `src/document/sweep.ts` (`sweptWasteMeets`), `src/document/holeText.ts`
  (`holeFaultText` only if a new case is needed)
- Test: `src/document/holeFaults.test.ts`

**Interfaces:** `holeFaults`, `breaksOut`, `offFlat`, `tooDeep`, `intoCurve`, `holeInStock` keep their signatures. Square
holes take the existing branches unchanged (branch on `isTilted`).

- [ ] **Step 1: Failing tests** (each with its mutation noted in the test name or a comment, inv 23's rule):
  - `a tilted bore whose wall leaves a side below the mouth breaks out there` — mouth 0.3" from the width min side,
    r 0.125, through 1.5" stock, tilt 20° toward that side: `breaks-out` with `edge: { dim: 'width', side: 'min' }`;
    the same bore tilted 20° AWAY is clean. Exact boundary: a tilt that makes the wall exactly tangent to the side at the
    exit passes; 1e-6 more fails.
  - `too-deep judges the bottom disc's deepest point` — blind, tilted 30°, depth chosen so the bottom CENTRE clears the
    back face but the disc rim (`r·sin 30°` deeper) reaches it: `too-deep`.
  - `off-flat against an angle cut is exact for a tilt` — closed-form boundary case passes, 1e-6 past fails.
  - `off-flat against a rectangular cut and meets-hole are conservative for a tilt` — a pair that truly clears by 0.05"
    may report; a pair that truly meets ALWAYS reports (construct one where two tilted bores cross at mid-depth).
  - `a tilted bore never reports less than its square twin would at the mouth` (a bore whose mouth disc already breaks out
    still breaks out when tilted).
  - `square rows' faults are unchanged` — the existing holeFaults suite passes untouched.
- [ ] **Step 2: Run** `npx vitest run src/document/holeFaults.test.ts` — FAIL.
- [ ] **Step 3: Implement** per spec §6.3: `breaksOut` — per in-plane dimension, the extent of the bore over its axial
  span: the mouth ellipse's extent (`r·√(1 − b_i²/|b|²)/…` — derive and comment the closed form) and the far ring's; a
  through exit that leaves by a side is `breaks-out` on that side. `tooDeep` — the deepest point of the bottom disc
  (centre's axial depth + `r·sin θ`) against the back face. `offFlat` planes — the minimum of the plane over each end ring's
  disc in closed form (`n·c − r·|n − (n·b̂)b̂|`). `offFlat` regions, `meets` with a tilted hole, `intoCurve` and
  `sweptWasteMeets` for a tilted hole — the bore's axis-aligned box (`holeRegion`) against the region/curve, and a capsule
  test (segment distance ≤ r1 + r2) between two bores when either is tilted. Comment each conservative branch with the
  spec clause.
- [ ] **Step 4: Run** the file and `npx vitest run src/document` — PASS.
- [ ] **Step 5: Commit** `feat(angled-holes): faults for a tilted bore (Task 3)`.

### Task 4: The viewport mesh

**Files:**
- Modify: `src/viewport/grainTiling.ts` (`holeMesh`, `faceTriangles`, `mergeHoledPlanes`)
- Test: `src/viewport/curvesWatertight.test.ts`, `src/viewport/holesPerf.test.ts`, `src/viewport/bodyMeshIdentity.test.ts`
  (unchanged, must pass)

**Interfaces:** none new. `holeMesh` reads `h.bit`, `holeRing`, `holeBottom`; the inward wall normal is
`−(p − c − ((p − c)·b̂)b̂)` normalised; a blind bottom's normal is `−b̂`; the through exit plane is the opposite face
(`centre[a] + dir·h.reach`).

- [ ] **Step 1: Failing tests:** `curvesWatertight.test.ts` gains tilted cases (a through and a blind tilted bore in a
  flat board; one in a curved part; one beside a stopped profile's run-out) — every directed edge matched, as the file
  asserts today. `holesPerf.test.ts` gains a healthy tilted case (a 4-socket seat) under the existing ≤ 40 ms budget, the
  MINIMUM of 9 runs.
- [ ] **Step 2: Run** `npx vitest run src/viewport/curvesWatertight.test.ts src/viewport/holesPerf.test.ts` — FAIL.
- [ ] **Step 3: Implement** the three functions for a tilted hole; a square hole runs today's code to the byte.
- [ ] **Step 4: Run** `npx vitest run src/viewport` — PASS (`bodyMeshIdentity`, `sweptIdentity` unchanged). Perf guards
  can fail under machine load; re-run the perf file alone before concluding (CLAUDE.md Commands).
- [ ] **Step 5: Commit** `feat(angled-holes): the tilted bore's mesh, watertight (Task 4)`.

### Task 5: Section caps

**Files:**
- Modify: `src/document/section.ts` (`buildLocalPieces` reach filter; `buildLeaningPieces` subtracts bores)
- Test: `src/document/section.test.ts`

- [ ] **Step 1: Failing tests:** `a tilted bore is subtracted from an unleaned part's cap` — a section through a tilted
  through bore: the cap's area equals the stock's slice minus the bore's true elliptical slice within 1% of the 48-gon
  area (compute the expected polygon from `holeRing`-style points on the cut plane); `a leaning part's cap has its bores` —
  the chunk 1 stool leg with a square through hole across it, cut through the hole: the cap pieces exclude the hole's
  disc (the leaning cap's area drops by the bore's slice); `the reach filter keeps a steep bore's far mouth` — a 40° bore
  whose exit lies beyond `radius + depth` of the mouth centre in the cut axis is still subtracted.
- [ ] **Step 2: Run** `npx vitest run src/document/section.test.ts` — FAIL.
- [ ] **Step 3: Implement:** widen the reach to the bore's `holeRegion` box; `buildLeaningPieces` subtracts each bore's
  prism (`minusPrism`) in the part's own frame BEFORE the pivot transform. Remove the "No bores" comment and fu 437's
  residue note in the code.
- [ ] **Step 4: Run** `npx vitest run src/document/section.test.ts src/document` — PASS.
- [ ] **Step 5: Commit** `feat(angled-holes): section caps of tilted bores and of leaning parts' bores (Task 5)`.

### Task 6: Snapping, drawings and feature callouts

**Files:**
- Modify: `src/document/snapPoints.ts` (exit centre), `src/document/holeDrawing.ts`, `src/document/featureKeys.ts`
- Test: `src/document/snapPoints.test.ts`, `src/document/drawing.test.ts`, `src/document/featureKeys.test.ts` (or the
  existing callouts test file)

**Interfaces:** `holeDrawingTagged` builds rims from `holeRing`/`holeBottom` and silhouettes from the general cylinder along
`h.bit`; its edge-on test reads the RIM PLANE's normal (the face axis for a mouth and a through exit; `b̂` for a blind
bottom). `partFeatures` passes `trueAxis: null` for a tilted row.

- [ ] **Step 1: Failing tests:** snap — a tilted through bore's exit centre is where the bit's line meets the exit face
  (1e-12) and maps through the lean on a leaning part; drawing — the Plan view of a 20°-tilted through bore in a flat
  board draws the mouth ellipse (its rim's extent along the tilt = `r / cos 20°` ± 1e-9) and the exit offset by
  `T·tan 20°`; a tilted rim whose plane is edge-on to a view draws ONE segment; `drawingIdentity` unchanged; callouts —
  a tilted row's key has `trueAxis === null`.
- [ ] **Step 2: Run** the three files — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/document` — PASS.
- [ ] **Step 5: Commit** `feat(angled-holes): snapping, drawings and callouts read the bit (Task 6)`.

### Task 7: Part diagrams

**Files:**
- Modify: `src/document/diagram.ts` (`DiagramHole`, hole views), `src/panels/PartDiagram.tsx` (draws an ellipse)
- Test: `src/document/diagram.test.ts`, `src/document/diagramIdentity.test.ts` (unchanged, must pass)

**Interfaces:** `DiagramHole` gains optional `rx`, `ry`, `rot` (degrees) for an ellipse; a square hole's entry carries
none of them (byte-identical). Side views: a tilted bore's band is a slanted quadrilateral (`DiagramHole`'s side form gains
the four corners, or a new `holeBands` entry — builder's choice, one form).

- [ ] **Step 1: Failing tests:** the entry view of a tilted bore has `rx = r`, `ry = r / cos θ` along the tilt, rotated by
  the sightline; the exit circle sits `T·tan θ` along the tilt; a side view's band is slanted by θ; square holes'
  diagrams deep-equal before/after (`diagramIdentity`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** (`PartDiagram.tsx` renders `<ellipse>` when `rx` is present, `<circle>` otherwise).
- [ ] **Step 4: Run** `npx vitest run src/document src/panels` — PASS.
- [ ] **Step 5: Commit** `feat(angled-holes): tilted bores in part diagrams (Task 7)`.

### Task 8: Bench text

**Files:**
- Modify: `src/document/holeText.ts` (`holeLine` / `holeLineBase`)
- Test: `src/document/holeText.test.ts`, `src/document/cutlist.test.ts`

- [ ] **Step 1: Failing tests:** a tilted row's bench line ends with `, bored 14.3° off square on a 33.5° sightline from
  the <along>` (one decimal, `angleText.ts`'s formatter) and, when blind, says `deep along the bit`; a single-plane tilt
  (`tiltAcross` absent) reads `bored 10.0° off square toward the <along> <min|max> end` (the end the bit leans toward);
  every square row's line is byte-identical (existing tests).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** in `holeText.ts` only (the ONE home), reading `holeTilt.ts`.
- [ ] **Step 4: Run** `npx vitest run src/document` — PASS.
- [ ] **Step 5: Commit** `feat(angled-holes): the tilted bore's bench line (Task 8)`.

### Task 9: Store and panel — tilting a row; holes on leaning parts; Level the ends keeps holes

**Files:**
- Create: `src/document/holeRebase.ts` (moved `rebaseHoles` and the end-face rule)
- Modify: `src/generate/joints/recipes.ts` (import `rebaseHoles` from document; delete its own), `src/document/levelEnds.ts`
  (`levelPlan` returns `holes`), `src/store/store.ts` (`addHoleRows`, `updateHoleRow` bound refusal, `setLean`,
  `levelEnds`), `src/panels/Holes.tsx`, `src/panels/Lean.tsx` (nothing but tests may change), docs strings
- Test: `src/store/store.test.ts`, `src/panels/Holes.test.tsx`, `src/panels/Lean.test.tsx`, `src/document/levelEnds.test.ts`

**Interfaces:**
- `rebaseHoles(b, d, end, amount)` — unchanged behaviour, now exported from `document/holeRebase.ts` (and re-exported
  through `document.ts`).
- `levelEndHoles(rows: HoleRow[], eF: number, eT: number, board: Board): HoleRow[]` in `holeRebase.ts`: the rows after
  the foot grows by `eF` (length min end) and the top by `eT` (length max end): stations/insets measured from an end shift
  by that end's amount (`rebaseHoles`' rule); a row ENTERING an end (`face === 'length'`) keeps its bottom in the wood —
  a blind square row's `depth += e`; a blind tilted row's `depth += e·|bit|` and its station/inset move by `−e` times its
  lateral slopes (signs through its flags); a through row is unchanged. Exact (one addition per number).
- `LevelPlan` gains `holes: HoleRow[]`; the store writes it with length/position/angleCuts.
- `updateHoleRow` returns `string | null` (the bound refusal) — callers updated.
- `setLean`: drop `LEAN_HAS_HOLES`; refuse with the re-choice copy when `b.holes.length > 0 && b.lean && lean.face !==
  b.lean.face` (the seam re-choice). `addHoleRows`: drop `HOLES_ON_LEAN`.
- Holes panel: per row, `Tilt toward end` (`AngleField`, degrees, `min0`) + select of the two `along` ends, `Tilt toward
  side` + select of the two across sides, readout `Bore 14.3° off square · sightline 33.5° from the <along>` when tilted;
  every row edit goes through `retilt(row, next)` before the fault check; a typed angle writes `slopeOf(deg)` into its one
  slope and keeps the other exactly.

- [ ] **Step 1: Failing tests:**
  - store: `a hole row can be added to a leaning part`; `a holed part can take a lean`; `the seam re-choice on a holed part
    is refused with the copy`; `updateHoleRow refuses a tilt past 45° in all`; `typing both angles back to 0 leaves no tilt
    key` (Review Focus 2); `Level the ends keeps a socket measured from the foot at the same place in the wood` — world
    mouth centre (`toWorld`) before and after within 1e-9 (Review Focus 3), and a blind row entering the top end keeps its
    bottom; `levelEnds is one undo entry with the holes`.
  - `levelEnds.test.ts`: `levelEndHoles` exactness cases (square/tilted, blind/through, each end).
  - panel: `Tilt toward end` 10 with the far-end select writes `tiltAlong = tan 10°` and leaves `tiltAcross` untouched;
    changing `From` keeps the bore's direction (via `retilt`); the readout text; Lean.test's two refusal tests are REPLACED
    by "a holed part leans" and "a leaning part takes a hole".
  - recipes: the existing joinery rebase tests still pass with the moved function.
- [ ] **Step 2: Run** `npx vitest run src/store src/panels src/document/levelEnds.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/store src/panels src/document src/generate` — PASS; `npm run build` — PASS.
- [ ] **Step 5: Commit** `feat(angled-holes): tilt a row; holes on leaning parts; Level the ends keeps holes (Task 9)`.

### Task 10: Bore leg sockets

**Files:**
- Create: `src/document/legSockets.ts`, `src/document/legSockets.test.ts`
- Modify: `src/document/designCheck.ts` (export `REST_AREA`), `src/store/store.ts` (`boreLegSockets`),
  `src/panels/Holes.tsx` (button, diameter field, stale notes), `src/document/document.ts` (re-export)
- Test: `src/store/store.test.ts`, `src/panels/Holes.test.tsx`

**Interfaces (`legSockets.ts`, pure):**
- `legsUnder(world: readonly Board[], seat: Board): Board[]` — leaning parts whose up-facing level face is coplanar
  (|Δy| ≤ `LEVEL_EPS`) with a down-facing level face of `seat`, with `overlapArea > REST_AREA`; world order.
- `socketRow(seat: Board, leg: Board, diameter: number): Omit<HoleRow, 'id'>` — `count` 1, `through`, entering from the
  seat's face OPPOSITE the one the leg meets, mouth centre where the leg's axis (through `leanMap(leg).pivot`, direction
  `applyDir` of the length axis) meets that face, tilt along the axis in the seat's own frame (`fromWorld` for the point;
  the direction by mapping two points), `alongFrom`/`acrossFrom` the nearer end/side; zero slopes omitted.
- `isSocketOf(seat: Board, row: HoleRow, leg: Board): boolean` — the row's world axis is the leg's axis (mouth on it and
  bit parallel, 1e-9).
- `staleSocketOf(seat: Board, leg: Board): HoleRow | null` — a count-1 row of `seat`, not `isSocketOf`, whose axis segment
  passes through the leg's up-facing level face polygon (plan point-in-polygon at the face's height).
- `socketPlan(doc: SloydDocument, seatId: string, diameter: number): { holes: HoleRow[] } | string` — every placement and
  Shape user of the seat (as `levelEnds` collects users) computes its own legs' rows; each copy's resulting stored row set
  (lowered as `mapWorld` would, `lowerHoles`) must agree exactly (`sameHoleRow` as a multiset, 1e-9 on the slopes) or the
  disagree copy is returned; refusals in spec order (diameter ≥ a leg's smaller section; a socket with a fault, `holeFaults`
  on the seat with the new rows); legs with a matching socket are skipped; a stale socket is replaced in place (its id
  kept).
- Store: `boreLegSockets(seatId: string, diameter: number): string | null` — one `edit()` through `mapWorld`, `judgeHeld()`
  after; null when nothing would change (no undo entry).
- Panel: shown on an unleaned part with `legsUnder` non-empty: a diameter `DimensionField` (default 1") and `Bore leg
  sockets`; one stale note per leg whose `staleSocketOf` is non-null.

- [ ] **Step 1: Failing tests** (`legSockets.test.ts`, on `stoolDocument()` from `stoolFixture.ts`):
  - `legsUnder finds the four legs under the seat` and none under a part beside them.
  - `each socket's world axis is its leg's axis` — mouth and exit centres (via `toWorld`) on the leg's axis within 1e-9,
    resultant 14.29…° and sightline 33.5…° (`tiltResultantDeg`, `tiltSightlineDeg`) for every leg.
  - `a turned and mirrored seat bores the same world sockets` — the seat wrapped in a mirrored instance turned 90° (Review
    Focus 1).
  - `copies over different legs refuse with the copy`; `two identical placements bore once`; `a linked seat` and a
    `mirrored copy` agree.
  - `a socket that would break out refuses naming the leg`; `a diameter at the leg's section refuses`.
  - `boring again replaces a stale socket in place and skips a matching one` (change one leg's rake, bore again: that row's
    id kept, numbers changed; the others untouched; one undo entry).
  - store: `boreLegSockets is one undo entry`; `refused while exploded`.
  - panel: the button shows only with legs under the part; the stale note text.
- [ ] **Step 2: Run** `npx vitest run src/document/legSockets.test.ts src/store src/panels` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` (full) and `npm run build` — PASS (perf guards: re-run alone on failure).
- [ ] **Step 5: Commit** `feat(angled-holes): Bore leg sockets (Task 10)`.

### Task 11: Refine keeps a part with a tilted row

**Files:**
- Modify: `src/document/leanKeep.ts` (`keptParts`, `leaningInAssembly`, `keptNote`), `src/document/roleLinks.ts`
  (`turnCandidates`), `src/generate/refine.ts` / `src/panels/RefineDialog.tsx` (the kept-list wording only)
- Test: `src/generate/refine.test.ts`, `src/document/roleLinks.test.ts`, `src/generate/run.test.ts`

**Interfaces:** `keptParts` keeps every root part whose resolved form leans OR has a tilted row (`isTilted`);
`leaningInAssembly` likewise (its refusal copy names "a leaning part or a part with angled holes"; builder words);
`keptNote` says why each is kept; `turnCandidates` returns `[]` for a part with a tilted row. Kept-list wording:
`Kept as is (leans or angled holes): <names>`.

- [ ] **Step 1: Failing tests:** a stool with bored seat sockets: Refine's base design omits the seat and the legs; the
  result carries the seat's stored record verbatim (rows `===`-equal); a model part named "Seat" is dropped; a seat with
  a tilted row inside an assembly refuses; `turnCandidates` of a tilted-row part is `[]`.
  Joinery: Add joinery on a project whose unleaned seat has a tilted bore runs (no refusal), and a joint kind whose zone
  the bore's box enters is ruled out (`featureAllowed`, spec §9) — `src/generate/joints/featureZones.test.ts`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/generate src/document src/panels` — PASS.
- [ ] **Step 5: Commit** `feat(angled-holes): Refine keeps a part with angled holes (Task 11)`.

### Task 12: Records

**Files:** `CLAUDE.md`, `docs/invariants.md`, `docs/module-map.md`, `docs/versioning.md` (Task 1 wrote its row; check),
`docs/rounds.md`, `docs/follow-ups.md`, `docs/feature-gaps.md`, the spec's status line.

- [ ] **Step 1:** invariants, FULL text in `docs/invariants.md` and CONDENSED in CLAUDE.md (every PROHIBITION verbatim in
  both): inv 50 (the bit vector; `holeTilt.ts` the ONE home of tilt math; tilted faults exact-or-conservative, never
  under; the unclipped clean path trusts them), inv 44 (the tilt is flag-relative, flips with the flags), inv 56 (kept
  parts: leaning or tilted), inv 57 (holes on leaning parts; the re-choice refusal; Level the ends keeps holes; caps with
  bores). CLAUDE.md's Versioning line (23), Status NEXT line, the "ONE homes" table (`holeTilt.ts`, `legSockets.ts`,
  `holeRebase.ts`), Commands' test count. Keep CLAUDE.md ≤ ~62 KB (move detail out, not rules).
- [ ] **Step 2:** `docs/module-map.md` (new files), `docs/rounds.md` (a row and a Status log entry, the rollback table's
  schema 23 line: not deployed), `docs/follow-ups.md` (437: closed except the round tenon → new entry "chunk 2b: round
  tenons"; 438: depends on 2b; new entries: a socket that follows its leg; tapered sockets; AI authoring a tilt; any
  deferred review item), `docs/feature-gaps.md`'s row.
- [ ] **Step 3:** `npx vitest run` and `npm run build` — PASS; commit `docs(angled-holes): records (Task 12)`.

### Task 13: Browser verification (dev server, Playwright)

**Files:** `docs/browser-verification-angled-holes.md`, `docs/img/angled-holes-*.png`

- [ ] **Step 1:** `npm run dev -- --port 5180`. In the dev profile (never clear it; leave test projects), import the stool
  (as chunk 1's check 9) or open "Stool check (splayed legs)" and copy it to a new project "Stool sockets check".
- [ ] **Step 2 — checks (DOM readouts first, numbers from the live store):** (1) the seat's Holes section shows Bore leg
  sockets; bore at 1": four rows, each readout `Bore 14.3° off square · sightline 33.5° …`; (2) the sockets visible in the
  viewport, the leg tops centred in them (screenshot); (3) section Front through a socket: the cap shows the elliptical
  bore (screenshot); (4) Plans: part diagram of the seat with four ellipses; the bench lines; (5) change one leg's rake →
  the stale note; Bore again → that row replaced, note gone; (6) tilt a row by typing; a refusal past 45°; a fault refusal
  near an edge; (7) add a hole to a leaning leg; Level the ends after → the hole stays put (world mouth readout); (8) undo
  each; (9) console 0 errors.
- [ ] **Step 3:** record each as PASS/FAIL with readouts; commit `docs(angled-holes): browser verification (Task 13)`.
