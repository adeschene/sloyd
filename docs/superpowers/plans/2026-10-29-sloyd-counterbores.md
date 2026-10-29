# Counterbores and countersinks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A square hole row may carry a head — a counterbore or a countersink at its mouth — stored (schema 30), drawn,
faulted, cut-listed and kept by Refine, with two screw presets.

**Architecture:** Four flat optional keys on `HoleRow`. `holes.ts` gives a headed `Hole` an optional frozen `head` and
splits it into convex PIECES (`holePieces`: the head — a cylinder, or a frustum for a countersink — and the bore below it),
so every reader that already works per convex prism (`minusPrism`, `clipPlan`, rings, rims, section) works per piece, and a
headless hole is its own single piece (same object: memo identity and bytes unchanged). Faults read an ENVELOPE of
cylinders (`holeEnvelope`: the countersink's frustum judged as its mouth cylinder — conservative). Refine keeps a headed
part, and its assembly, whole by the corner-joint route.

**Tech Stack:** TypeScript, React, three.js (react-three-fiber), Zustand, Vitest (`npx vitest run <file>`), `npm run build`
(the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-29-sloyd-counterbores-design.md` (APPROVED 2026-10-29). Read it first; where
this plan and the spec differ, the spec wins and the difference is reported.

## Global Constraints

- **A document with no headed row is byte for byte as before**: `holesSquare.snapshot.json`, `bodyMeshIdentity`,
  `drawingIdentity`, `diagramIdentity`, `sweptIdentity`, `bandFreeIdentity`, `holesPerf`, `curvesPerf` and every existing
  test pass unchanged. A headless `Hole` has NO `head` key (not `undefined`: the snapshot compares with `toEqual`).
- Stored keys (spec §3.1), present together or not at all:
  `head?: 'counterbore' | 'countersink'`, `headDiameter?: number` (both kinds), `headDepth?: number` (counterbore only),
  `headAngle?: 82 | 90` (countersink only, degrees). A countersink's axial depth is DERIVED, never stored:
  `(headDiameter − diameter) / 2 / tan(headAngle / 2)` — ONE home, `headReach`.
- Legal (spec §3.2): `headDiameter > diameter`; counterbore `headDepth > 0`; a blind row's head reach `< depth` (strict);
  angle `82 | 90`; the row is square; numbers finite within `MAX_MAGNITUDE`. The loader DROPS an illegal or malformed row;
  the store refuses.
- `CURRENT_VERSION` 30; the 29→30 step adds nothing. A 29 build refuses a 30 file (the existing "newer than this build" path).
- Faults (inv 50): per PIECE spans (head radius over the head's span, bore radius past it); exact for a counterbore,
  CONSERVATIVE for a countersink (its mouth cylinder); never under-report. Headless rows run their exact code unchanged.
- New copy (verbatim; store constants in `store.ts` beside `HOLE_TILT_PAST_BOUND`):
  - `HEAD_NOT_WIDER = 'The counterbore or countersink must be wider than the hole.'`
  - `HEAD_TOO_DEEP = 'The counterbore or countersink must be shallower than the hole.'`
  - `HEAD_ON_TILT = "A tilted hole can't take a counterbore or countersink yet."`
  - `TILT_ON_HEAD = 'Remove the counterbore or countersink before tilting the hole.'`
  - `HEAD_MALFORMED = "That counterbore or countersink isn't valid."`
  - fault words (`holeFaultText`, too-deep on a headed THROUGH row): `the counterbore runs through the <face>` /
    `the countersink runs through the <face>`.
  - Refine kept words: part `counterbores or countersinks` (`keptWhy`), `has counterbores or countersinks` (`whyKept`),
    header `have counterbores or countersinks` (`keptNote`, only when such a part or assembly is kept).
- Layer order (CLAUDE.md): `document` imports nothing from `store`, `generate`, `panels`, `viewport`. `holes.ts` produces no
  text and does not import `units` (presets take `metric: boolean`).
- Every refusal before any mutation; one undo entry per action; refused while read-only (inv 47).
- No `localStorage.clear()` on the dev server; test projects stay; paid runs: none needed.

## Review Focus

1. **The bore widened to (or past) its head.** Typing the Diameter up to the head's diameter must be refused with
   `HEAD_NOT_WIDER` and nothing stored (Task 8 test), and a loaded file with that row drops the row (Task 1).
2. **Head set back to None.** All four keys go; the row is `sameHoleRow`-equal to the headless original, so the cut list
   groups them again (Task 8 test).
3. **Two counterbored screws side by side, and a plain row beside a head.** Heads closer than `R1 + R2` meet; a plain
   bore within `R + r` of a counterbore's axis but BELOW its head span does not (per-piece spans; Task 3 test).
4. **A part resized thinner under a through counterbore.** The head reaching the far face is `too-deep`, KEPT and noted
   with the head's words, and the edit that caused it is not refused (Task 3 and Task 8 tests).
5. **A headed row on a mirrored or linked copy.** `mirrorHoleRow` carries the head unchanged (twice is the identity), and
   a Shape's users all show it (Task 1 test; Task 8's link test).

---

### Task 1: Schema 30 — the stored head

**Files:**
- Modify: `src/document/types.ts` (`HoleRow`), `src/document/holes.ts` (`HOLE_FIELDS`, `holeRowValues`, new helpers),
  `src/document/document.ts` (`CURRENT_VERSION`, `validateHoleRows`, re-exports), `docs/versioning.md`
- Test: `src/document/document.test.ts`, `src/document/holes.test.ts`

**Interfaces:**
- Produces (`types.ts`): the four optional keys on `HoleRow` (Global Constraints), each with a doc comment citing spec §3.1.
- Produces (`holes.ts`):
  - `export type HeadKind = 'counterbore' | 'countersink'`; `export const HEAD_ANGLES = [82, 90] as const`.
  - `hasHead(r: Pick<HoleRow, 'head'>): boolean`.
  - `headReach(r: Pick<HoleRow, 'diameter' | 'head' | 'headDiameter' | 'headDepth' | 'headAngle'>): number | null` — the
    head's AXIAL depth from the face (`headDepth`, or the countersink formula), null when headless.
  - `headProblem(r: Omit<HoleRow, 'id'>): 'malformed' | 'not-wider' | 'too-deep' | 'tilted' | null` — THE legality decider
    (loader and store): `malformed` = keys inconsistent with the kind (a counterbore with `headAngle` or without
    `headDepth`, any head key without `head`, a non-finite or non-positive number, an angle outside `HEAD_ANGLES`, past
    `MAX_MAGNITUDE`); then `not-wider`, `too-deep` (blind only: `headReach ≥ depth`), `tilted` (`isTilted`). Null when legal or
    headless.
  - `HOLE_FIELDS` gains `head`, `headDiameter`, `headDepth`, `headAngle`; `holeRowValues` appends, for each PRESENT head key
    in `HOLE_KEYS` order, the key's NAME then its value (the tilt keys' form).

- [ ] **Step 1: Failing tests** in `document.test.ts`:
  - `a 30 file keeps a counterbore exactly` (`head: 'counterbore', headDiameter: 0.375, headDepth: 0.375`) and `… a
    countersink exactly` (`headAngle: 82`) — every key `===`.
  - `a 29 file loads at CURRENT_VERSION 30 with no head keys`.
  - `drops a row whose head is illegal or malformed` — each of: `headDiameter` equal to `diameter`; blind `depth: 0.5` with
    `headDepth: 0.5`; a countersink at `headAngle: 100`; a counterbore carrying `headAngle`; `headDiameter` without `head`;
    a headed row with `tiltAlong: 0.1`; `headDepth: NaN`. The ROW is dropped, the part kept.
  - `a file newer than 30 is refused`.
  In `holes.test.ts`:
  - `holeRowValues of a headless row is unchanged` (the exact array for `defaultHole` of a fixture board).
  - `sameHoleRow tells heads apart`: a counterbore vs a countersink with the same `headDiameter`; headless vs headed.
  - `headReach`: counterbore → `headDepth`; countersink 3/16" bore, 3/8" head, 82° → `0.09375 / Math.tan(41 * Math.PI / 180)`
    to 1e-15; 90° → exactly `(D − d) / 2`.
  - `mirrorHoleRow carries a head unchanged`: for each `d`, the mirrored row's four head keys `===` the original's, and
    mirroring twice deep-equals the original.
- [ ] **Step 2: Run** `npx vitest run src/document/document.test.ts src/document/holes.test.ts` — FAIL.
- [ ] **Step 3: Implement.** `CURRENT_VERSION` 30, the step adds nothing. `validateHoleRows` copies the head keys only when
  `head` is present (unknown keys still dropped) and drops the row when `headProblem` is non-null. `docs/versioning.md`: the
  29→30 row (adds nothing; validates per spec §3.2; drops the row; harm: a 29 build drills the plain bore and autosaves it).
- [ ] **Step 4: Run** the two files, then `npx vitest run src/document` — PASS.
- [ ] **Step 5: Commit** `feat(counterbores): schema 30, the stored head (Task 1)`.

### Task 2: The headed `Hole` and its pieces

**Files:**
- Modify: `src/document/holes.ts`, `src/document/bodies.ts` (only if `deepFreeze` misses `head`), `src/document/document.ts`
  (re-exports)
- Test: `src/document/holes.test.ts`

**Interfaces:**
- Consumes: Task 1's `headReach`.
- Produces (`holes.ts`):
  - `Hole.head?: { kind: HeadKind; radius: number; reach: number }` — set by `holeInstances` ONLY for a headed row (`radius`
    = `headDiameter / 2`, `reach` = `headReach`); absent otherwise (no key).
  - `Hole.tip?: number` — ON PIECES ONLY: the far-end radius of a frustum piece (the countersink's head). Never set by
    `holeInstances`.
  - `holePieces(h: Hole): readonly Hole[]` — headless: `[h]` (the SAME object). Headed: `[head, bore]`, both without a
    `head` key: `head` = `{ ...h minus head, radius: R, depth: reach, reach, through: false }` plus `tip: r` for a
    countersink; `bore` = `{ ...h minus head, centre: centre + dir·reach on the face axis, depth: h.depth − reach, reach:
    h.reach − reach }` (its mouth plane is the step). Frozen and memoised per frozen `h` (the `holeMemo` WeakMap), so each
    piece's own prism/ring memos work.
  - `holeEnvelope(h: Hole): readonly Hole[]` — `holePieces(h)` with `tip` dropped (a frustum judged as its mouth cylinder);
    headless: `[h]`.
  - `holeRing(p, t)` on a piece with `tip`: the radius interpolated linearly from `radius` (t = 0) to `tip` (t = depth).
  - `holePrism(p)` on a piece with `tip`: the frustum — `HOLE_SEGMENTS` slanted facet planes (inscribed as the cylinder's
    are, so the polygon lies inside the true cone), both caps as today. `prismInfo`'s box contains the mouth ring.
  - On a WHOLE headed `Hole`: `holeRegion` / `holeTouchesBox` use the box of its pieces' boxes (in-plane ±R over the full
    depth: conservative, a reject test); `insideHole` is true when inside any piece (exact; a frustum by the interpolated
    radius); `holeRims(h)` returns every piece's rims, the countersink's duplicate cone/bore junction ring once.
  - Square (headless) code paths are unchanged; tilted rows never have a head (Task 1).

- [ ] **Step 1: Failing tests** in `holes.test.ts`:
  - `a headless Hole has no head key` (`'head' in h` is false) and `holePieces(h)[0] === h`.
  - Counterbore fixture (3/4" board, through 3/16", head 3/8" × 3/8" deep, both postures used by the square snapshot):
    pieces' radii `[0.1875, 0.09375]`, the head's depth `0.375`, the bore's centre `0.375` along `dir` from the mouth and its
    depth `0.375`; `holePieces(h) === holePieces(h)` for a frozen `h` (memo).
  - Countersink fixture (82°): the head piece has `tip === 0.09375`; every frustum `holeRing` vertex at axial `t` lies at
    the interpolated radius (1e-12); every prism plane keeps every ring vertex of the piece inside (≥ −1e-9).
  - `holeRegion` of a headed hole contains every vertex of every piece's rings; `insideHole` true at the head's mid-span at
    radius `(r + R)/2` (counterbore) and false there for the countersink just outside the cone; false outside R.
  - `holeRims` of a countersink has the junction ring exactly once.
  - The existing square snapshot test passes unchanged.
- [ ] **Step 2: Run** `npx vitest run src/document/holes.test.ts` — FAIL.
- [ ] **Step 3: Implement** the interfaces above. `frozen(h)` also requires `h.head` frozen when present (`deepFreeze` in
  `partGeometry` freezes it; check).
- [ ] **Step 4: Run** `npx vitest run src/document src/viewport` — PASS (identity tests unchanged).
- [ ] **Step 5: Commit** `feat(counterbores): the headed Hole and its pieces (Task 2)`.

### Task 3: Faults for a headed row, and their words

**Files:**
- Modify: `src/document/holeFaults.ts`, `src/document/holeText.ts` (`holeFaultText`)
- Test: `src/document/holeFaults.test.ts`, `src/document/holeText.test.ts`

**Interfaces:**
- Consumes: `holeEnvelope` (Task 2).
- Produces: `breaksOut`, `intoCurve`, `offFlat`, `tooDeep` and `holeInStock` judge a headed hole as `holeEnvelope(h).some(…)`
  (the first edge/curve found is reported); `meets(A, B)` is true when any envelope piece of A meets any of B (the existing
  per-cylinder `meets` on each pair); a hole's own pieces are never judged against each other. One fault per (hole, kind),
  as today. Headless holes: the envelope is `[h]`, so every path is the existing one.

- [ ] **Step 1: Failing tests** in `holeFaults.test.ts` (a 3/4" × 6" × 24" board unless stated):
  - `a counterbore breaks out where its bore would not`: through 3/16", head 3/8", centre 0.15" from an edge → breaks-out
    (R = 0.1875 > 0.15); the same row headless → none.
  - `a head only counts over its own span`: a counterbore (head 1/2" × 1/4" deep, bore 1/4" through) and a blind 1/4" row on
    the OPPOSITE face, 3/8" deep, axis 0.3" away: bores meet? (r + r = 0.25 < 0.3: no); head over [0, 1/4"] from the top vs the
    other bore over [3/8", 3/4"] from the top: spans disjoint → no `meets-hole`. Move the other row's depth to 5/8" (span
    reaches into the head's) → `meets-hole`.
  - `two counterbored screws meet by their heads`: head 3/8", axes 0.35" apart → `meets-hole`; 0.38" → none.
  - `a head beside a cut is off-flat where its bore is not`: through 3/16" bore, counterbore 3/8" × 3/8"; a rectangular cut on
    the entry face, 1/4" deep, its near wall 0.15" from the axis (outside r = 0.09375, inside R = 0.1875; the cut's depth
    overlaps the head's span) → off-flat; the same row headless → none.
  - `a through counterbore reaching the far face is too-deep`: `headDepth` 0.75 on 3/4" → too-deep; 0.74 → none.
  - `a countersink is judged as its mouth cylinder`: centre 0.17" from an edge, head 3/8" → breaks-out (conservative and
    exact here).
  - **Mutate:** temporarily make the envelope return only the bore and confirm the first, third and fifth tests fail; revert.
  In `holeText.test.ts`: `too-deep on a through counterbore reads the head's words` →
  `the counterbore runs through the thickness`; a countersink → `the countersink runs through the thickness`; a blind headed
  row's too-deep keeps `the holes are deeper than the thickness`.
- [ ] **Step 2: Run** `npx vitest run src/document/holeFaults.test.ts src/document/holeText.test.ts` — FAIL.
- [ ] **Step 3: Implement** as the Interfaces block.
- [ ] **Step 4: Run** `npx vitest run src/document` — PASS.
- [ ] **Step 5: Commit** `feat(counterbores): per-piece faults and the head's words (Task 3)`.

### Task 4: The viewport mesh

**Files:**
- Modify: `src/viewport/grainTiling.ts` (`holeMesh`, `faceTriangles`, `mergeHoledPlanes`, `ringDisc`, `holed`,
  `drawsAsBox` as needed)
- Test: `src/viewport/curvesWatertight.test.ts`, `src/viewport/holesPerf.test.ts`, `src/document/meshCases.ts` (headed
  fixtures)

**Interfaces:**
- Consumes: `holePieces`, frustum `holeRing`/`holePrism` (Task 2), `holeInStock` (Task 3).
- Produces:
  - **Faces:** every place that cuts a face by a hole cuts it by the hole's PIECES (`holePieces(h)`): the entry face then
    meets only the head piece (ring radius R); the bore piece's mouth lies inside the wood (the step), so no body face sees
    it; a through exit meets the bore piece. Bodies are cut by both pieces' prisms (`minusPrism` per piece).
  - **`holeMesh`** for a headed hole: the head's wall (cylinder: radial normals; frustum: the cone's true normals, inward
    with an axial component), then a counterbore's ANNULUS at `headDepth` (quads between the head's far ring and the bore's
    mouth ring, index-aligned, normal facing back toward the mouth), then the bore's wall and bottom/exit as today. A
    countersink's cone far ring and the bore's mouth ring are the SAME vertex array (computed once). Clean (`holeInStock`) →
    unclipped; faulted → each piece's quads clipped as today.
  - Headless holes call exactly the code they call today.
- [ ] **Step 1: Failing tests:** add to `meshCases.ts` a counterbore and a countersink, each blind and through, on a plain
  part and on a curved part (an arched apron), plus a counterbored row of 20; `curvesWatertight.test.ts` runs them
  (every directed edge matched, exact Float32 keys); `holesPerf.test.ts` gains `a row of 20 counterbores` and `a countersunk
  row` under the existing budgets (≤ 40 ms healthy, the minimum of 9; never raise a budget).
- [ ] **Step 2: Run** `npx vitest run src/viewport/curvesWatertight.test.ts src/viewport/holesPerf.test.ts` — FAIL.
- [ ] **Step 3: Implement** as the Interfaces block.
- [ ] **Step 4: Run** `npx vitest run src/viewport src/document` — PASS (`bodyMeshIdentity` unchanged). If perf fails,
  re-run quiet before treating it as a regression (CLAUDE.md).
- [ ] **Step 5: Commit** `feat(counterbores): the stepped and coned mesh (Task 4)`.

### Task 5: Section caps and snap points

**Files:**
- Modify: `src/document/section.ts`, `src/document/snapPoints.ts`
- Test: `src/document/section.test.ts`, `src/document/snapPoints.test.ts`

**Interfaces:**
- Consumes: `holePieces`, `holePrism`, `holeRegion` (Task 2).
- Produces: section caps subtract each piece's prism (`minusPrism`); a headed hole never takes the rings fast outline (its
  outline is the union of the cut pieces, as a tilted bore's is); the reach filter reads `holeRegion` (R). Snap points: a
  counterbore adds its FLOOR centre (on the axis at `headDepth`) as a hole-owned point beside the mouth centre; a
  countersink adds nothing.
- [ ] **Step 1: Failing tests:** `a section through a counterbore's head is cut at R, below it at r` — a Front section
  through the axis of a through counterbore on a 3/4" board: the removed area is `2R·headDepth + 2r·(T − headDepth)` within the 48-gon inscription (assert within 1%); `a countersink's cap follows the cone` — the cap's area minus the stock's equals the
  trapezoid `(R + r)·reach + 2r·(T − reach)` to within the 48-gon inscription (assert within 1%). Snap: a counterbore yields
  the floor centre — the mouth centre moved `dir·headDepth` along the face axis — exactly; a countersink and a headless hole yield the same points as before.
- [ ] **Step 2: Run** the two files — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/document` — PASS.
- [ ] **Step 5: Commit** `feat(counterbores): section caps and the counterbore floor snap (Task 5)`.

### Task 6: Drawings, part diagrams and feature callouts

**Files:**
- Modify: `src/document/holeDrawing.ts`, `src/document/diagram.ts`, `src/panels/PartDiagram.tsx`
- Test: `src/document/holeDrawing.test.ts`, `src/document/diagram.test.ts`

**Interfaces:**
- Consumes: `holePieces` (Task 2).
- Produces:
  - `holeDrawingSegments` draws a headed hole piece by piece: a cylinder piece through `squareLines` unchanged (so a
    counterbore draws the mouth rim R, the step's outer rim R and inner rim r, and the bore's far rim r, with R walls over the
    head and r walls past it); a frustum piece through a new `coneLines` (mouth rim R, two silhouettes from R at the mouth to
    r at `reach`; its far rim is the bore's mouth rim, drawn once). The step rims follow the blind-bottom visibility rule.
    Every segment keeps `row` (inv 16, 47).
  - `DiagramHole.headR?: number` (the head circle, concentric) and `DiagramHoleSide.head?: { h: Span; v: Span; cone:
    boolean }` (the head's box; the side drawing is stepped, or for `cone` a trapezoid from the head box's mouth corners to
    the bore's). Absent keys for headless holes; `PartDiagram.tsx` draws them.
- [ ] **Step 1: Failing tests:** a counterbore viewed down its axis yields rims of radius R and r (count the distinct radii
  of rim vertices about the centre: `{R, r}`); viewed from the side, wall segments of length `headDepth` at ±R and `T −
  headDepth` at ±r; a countersink's side view has two slanted silhouettes from ±R to ±r. Diagram: `headR` present only on
  headed holes; `drawingIdentity` and `diagramIdentity` unchanged.
- [ ] **Step 2: Run** the two files — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/document src/panels` — PASS.
- [ ] **Step 5: Commit** `feat(counterbores): drawings and part diagrams (Task 6)`.

### Task 7: Bench text

**Files:**
- Modify: `src/document/holeText.ts`
- Test: `src/document/holeText.test.ts`

**Interfaces:**
- Produces: `holeHeadText(r: HoleRow, units: Units): string | null` — `3/8" counterbore × 3/8" deep` /
  `3/8" countersink at 82°` (head diameter formatted as `holeSizeText`'s diameter, with the mm aside in imperial; depth with
  `formatLength`, as the bore's). `holeSizeText` appends `, ${holeHeadText}` when present, so the bench line, the cut list
  (`holeLine`) and Plans keys (`featureKeys.ts`) read it. Headless text byte for byte unchanged.
- [ ] **Step 1: Failing tests:** imperial through counterbore line is exactly
  `Hole 3/16" dia × through, 3/8" counterbore × 3/8" deep in …` (complete the expected string from the fixture's face and
  placement words); countersink `…, 3/8" countersink at 82° in …`; metric `4.5 mm dia × through, 9.0 mm countersink at 90°`
  (the metric diameter format `holeLengthText` gives — read it, do not guess); a headless line equals today's.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** `npx vitest run src/document` — PASS.
- [ ] **Step 5: Commit** `feat(counterbores): the head on the bench line (Task 7)`.

### Task 8: Store, panel, presets, joints and Level the ends

**Files:**
- Modify: `src/store/store.ts` (`addHoleRows`, `updateHoleRow`, constants), `src/panels/Holes.tsx`, `src/document/holes.ts`
  (presets), `src/document/tenonJoints.ts` (`seatedIn`), `src/document/legSockets.ts` (`isSocketOf`),
  `src/document/holeRebase.ts` (`storableRow`)
- Test: `src/store/store.test.ts` (or the holes store test file in use), `src/panels/Holes.test.tsx`,
  `src/document/holes.test.ts`, `src/document/tenonJoints.test.ts`, `src/document/legSockets.test.ts`,
  `src/document/levelEnds.test.ts`

**Interfaces:**
- Consumes: `headProblem`, `headReach` (Task 1), `holeFaults` (Task 3), `holeLine` (Task 7).
- Produces:
  - Store: `addHoleRows` and `updateHoleRow` map `headProblem` to the Global Constraints' sentences before any mutation —
    `tilted` → `TILT_ON_HEAD` when the stored row had a head, else `HEAD_ON_TILT`; plus the existing checks. A head key
    present as `undefined` in `next` is removed (never stored), as tilt keys are (`storedTilt`'s twin, `storedHead`).
  - `defaultCountersunkScrew(b: Board, metric: boolean)` and `defaultCounterboredScrew(b: Board, metric: boolean)` in
    `holes.ts`, `Omit<HoleRow, 'id'>`: `defaultHole`'s placement (broad face, `from: 'max'`, centred); bore 3/16" (metric
    `mm(4.5)`), `'through'` when `b[face] ≤ 1.5` else depth `1.25`; countersink `headDiameter` 3/8" at 82° (metric `mm(9)` at
    90°); counterbore 3/8" × 3/8" (metric `mm(10)` × `mm(10)`).
  - Panel (`HoleRowView`): a `Head` select (`None` / `Counterbore` / `Countersink`); `Head dia` (`DimensionField`, format
    `diameterText`); counterbore `Head depth` (`DimensionField`, no format, as Depth); countersink `Angle` select `82°`/`90°`
    and a read-only note with the derived depth (`formatLength`). First choice of a kind seeds `headDiameter = 2 ×
    diameter`; counterbore `headDepth = min(diameter, (blind ? depth : board[face]) / 2)`; countersink angle 82 imperial, 90
    metric. `None` patches all four keys to `undefined` (cleaned before the store, `cleanHead`). On a tilted row the select is
    disabled with `HEAD_ON_TILT` as its note. The tilt fields on a headed row: a typed tilt is refused with `TILT_ON_HEAD`.
    The fault rule is the existing `attempt` (refuse only an ADDED fault).
  - Presets `Countersunk screw` and `Counterbored screw` in `+ Add hole`, after `Hinge cup`, withheld by `fits`; details
    `3/16" screw, 3/8" countersink at 82°` / `3/16" screw, 3/8" counterbore 3/8" deep` (metric: the mm sizes, through
    `holeLengthText`).
  - `seatedIn` returns false for a headed row; `isSocketOf` returns false for a headed row.
  - `storableRow` also requires `headProblem(r) === null` (Level the ends refuses with its existing sentence when the
    head would become illegal); the head keeps its depth from the mouth (no change in `levelEndHoles`).
- [ ] **Step 1: Failing tests:**
  - Store: `updateHoleRow refuses a bore widened to its head` (`HEAD_NOT_WIDER`, document unchanged, no undo entry);
    `refuses a blind depth at or under the head` (`HEAD_TOO_DEEP`); `refuses a head on a tilted row` (`HEAD_ON_TILT`) and `a tilt
    on a headed row` (`TILT_ON_HEAD`); `a head set to undefined leaves no key` and the row `sameHoleRow`-equals the headless
    original (Review Focus 2); `a resize that faults a through counterbore is not refused and the fault is noted`
    (Review Focus 4); `a linked part's head shows on every user` (Review Focus 5).
  - Presets (`holes.test.ts`): on 3/4" stock both are through with the exact values; on 2" stock depth 1.25; metric values
    `mm(4.5)`, `mm(9)` at 90, `mm(10)` × `mm(10)`; both fault-free on a 3/4" × 4" × 12" board.
  - Panel (`Holes.test.tsx`): choosing `Counterbore` on a 1/4" through hole in 3/4" stock stores `headDiameter 0.5,
    headDepth 0.25`; `None` removes every head key; the Diameter field shows `HEAD_NOT_WIDER` when typed to the head size;
    both presets appear on a 3/4" panel; on 1/4" stock `Counterbored screw` is withheld (its 3/8" head is too-deep) and
    `Countersunk screw` still appears.
  - `seatedIn` is false for a headed row that would otherwise seat (copy the existing seating fixture, add a counterbore);
    `isSocketOf` likewise.
  - Level the ends: a blind counterbored row entering the end deepens by `e` and keeps `headDepth` exactly.
- [ ] **Step 2: Run** the listed files — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/store src/panels src/document` — PASS.
- [ ] **Step 5: Commit** `feat(counterbores): authoring, presets, joints and Level the ends (Task 8)`.

### Task 9: Refine keeps a headed part and its assembly whole

**Files:**
- Modify: `src/document/leanKeep.ts`, `src/generate/run.ts`, `src/document/dovetailText.ts` only if a kind sentence moves
- Test: `src/document/leanKeep.test.ts`, `src/document/roleLinks.test.ts`, `src/generate/refine.test.ts` (or the joined-Refine
  test file in use)

**Interfaces:**
- Produces (`leanKeep.ts`):
  - `hasHeads(b: Board): boolean` (`b.holes.some(hasHead)`).
  - `keptWhole(b: Board): boolean` = `cornerJointed(b) || hasHeads(b)` — read at Refine's keep sites ONLY: `keepsExactly`
    becomes `keptForMoreThanFingers(b) || keptWhole(b)`; `keptParts`' definitions filter reads `keptWhole`; `run.ts`'
    `guardedKept` reads `keptWhole`. `cornerJointed` itself, `leaningInAssembly`/`keptForMoreThanFingers`, joinery's
    `recipes.ts`, Repair and the finger claim sites are NOT changed (spec §9's boundary).
  - `definitionKind`/`assemblyKind` return the kinds present in order `box joints`, `dovetails`, `counterbores or
    countersinks`, joined `a and b` / `a, b and c`; the three existing outputs byte for byte unchanged. `CornerKind` widens to
    `string`; `kindHasBoxJoints`/`kindHasDovetails` test inclusion; `run.ts:274`'s `=== 'dovetails'` keeps its meaning.
  - `keptAssemblyLinked` for a kind including heads: `Refine can't keep an assembly with ${kind} whose parts are linked to
    parts outside it — Unlink first: ${part}.`; the existing three sentences unchanged.
  - Words: `keptWhy` appends `counterbores or countersinks`; `whyKept` appends `has counterbores or countersinks`;
    `keptNote`'s header adds `have counterbores or countersinks` only when such a part or assembly is kept.
- [ ] **Step 1: Failing tests:**
  - `keptParts keeps a headed root part verbatim` and `keeps the assembly holding a headed part` (definition and placements);
    `leaningInAssembly` is null for it (no refusal).
  - `turnCandidates of a headed part is empty` (`roleLinks.test.ts`).
  - Joined Refine (stub the model as the existing joined-Refine tests do): a joined project whose headed rail has a recorded
    tenon is NOT refused, the rail comes back with its head and its recorded joint; a re-join that would change the headed
    rail returns the design UNJOINED with the reason (inv 61 (c)).
  - Wording: `keptWhy` for a headed part is `counterbores or countersinks`; a box-jointed-only assembly's kind is still
    `box joints`.
  - **Mutate:** remove `hasHeads` from `keptWhole` and confirm the first and third tests fail; revert.
- [ ] **Step 2: Run** the listed files — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/document src/generate` — PASS.
- [ ] **Step 5: Commit** `feat(counterbores): Refine keeps a headed part's assembly whole (Task 9)`.

### Task 10: Records, typecheck and the full run

**Files:** `CLAUDE.md`, `docs/invariants.md`, `docs/module-map.md`, `docs/versioning.md` (Task 1's row checked),
`docs/follow-ups.md`, `docs/feature-gaps.md`, the spec's status line.
- [ ] **Step 1:** Invariants in FULL in `docs/invariants.md` and CONDENSED in CLAUDE.md: 50 (the head: pieces, per-piece
  faults, the countersink's conservative clause, tilt and head refused together), 40 (`HOLE_FIELDS` with the head), 56 and 61
  (`keptWhole`: a headed part and its assembly kept whole; the joined-Refine allowance), 58 (a headed bore seats nothing);
  the Versioning line (30); `module-map.md` entries for the new helpers.
- [ ] **Step 2:** `docs/follow-ups.md`: 330 narrowed to cam-and-bolt (its chunk 2); new entries — a head on a tilted row
  (pocket screws), AI authoring a head (so Refine can change a headed part), a head at a through bore's exit, plugs as parts;
  plus every ruling the build made. CLAUDE.md's open list updated. `feature-gaps.md`: Holes' row notes the round.
- [ ] **Step 3:** `npm run build` — exit 0. `npm test` — every test passes (re-run quiet before calling a timing guard a
  regression); record the new totals in CLAUDE.md's Commands line.
- [ ] **Step 4: Commit** `docs(counterbores): records (Task 10)`.

### Task 11: Browser verification (dev server, the user's Chrome)

Per CLAUDE.md's deployment rule and the browser memory: the dev server over the user's tunnel (`localhost:5199`), Claude
driving through claude-in-chrome; test projects left in place; never clear the profile. Write
`docs/browser-verification-counterbores.md` with one row per check (PASS/FAIL, DOM readout, an image where spatial):
1. Both presets on a 3/4" panel: seen in the viewport (the step and the cone, watertight, no shading seams).
2. Section through each: caps stepped and coned.
3. Plans sheet: the head rims and stepped side views; the bench line and callout.
4. A head edited (Head dia, Head depth, Angle) and refused (bore widened to the head; head on a tilted row).
5. A metric project's presets and text.
6. Undo/redo of a head change; export → import round trip keeps the head.
- [ ] Commit the verification doc.
