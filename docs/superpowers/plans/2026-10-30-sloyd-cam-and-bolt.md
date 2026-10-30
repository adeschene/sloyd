# Cam-and-bolt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A blind face bore (cam) and a blind edge bore (bolt) meeting as the spec's §3.1 defines are recognised by
shape as a cam pair. They are exempt from `meets-hole`, drawn without air (a watertight mesh, rims, drawings and
diagrams), listed as one bench line, and added by a Cam lock preset. No schema change.

**Architecture:**
- A new leaf, `src/document/camBolt.ts`, is the ONE recogniser over `Hole` instances.
- `holeFaults` skips a hole's partner at its one `hit` search.
- `partGeometry` attaches a frozen `mate` key to each paired `Hole`. Every geometry reader branches on `h.mate` only, so
  unpaired holes run byte-for-byte the code they ran before.
- The intersection loop is ONE vertex array (`camLoop`, in `holes.ts`), shared by the bolt's wall and the cam's window.

**Tech Stack:** TypeScript, Vitest, three.js `ShapeUtils.triangulateShape`, React (panels).

**Spec:** `docs/superpowers/specs/2026-10-30-sloyd-cam-and-bolt-design.md` (approved 2026-10-30). Executors read it
whole; section numbers below are the spec's.

## Global Constraints

- **No pair-free change.** These pass UNCHANGED, without being regenerated:
  - `holesSquare.snapshot.json`, `bodyMeshIdentity`, `drawingIdentity`, `diagramIdentity`, `sweptIdentity`;
  - `holesPerf`, `curvesPerf`.

  An unpaired `Hole` gains no defined key (the snapshot compares with `toEqual`).
- **No schema change.** `CURRENT_VERSION` stays 32. `HOLE_FIELDS`, `HOLE_KEYS` and `holeRowValues` are untouched.
- **The recogniser's comparisons are conservative:** a borderline pair is NOT a pair (spec §3.1).
- **Comparisons use `HOLE_EPS` (1e-9)**, imported from `holes.ts`.
- **Perf budgets** are the minimum of 9 runs: ≤ 40 ms healthy, ≤ 100 ms faulted. Never raised.
- **Inv 19:** every bench string is assembled in `holeText.ts`. **Inv 52:** lengths become text only through
  `units/length.ts` / `holeLengthText`.
- **Preset sizes** (spec §4.1, exact):
  - cam: 15 mm dia, depth = `t/2 + 4 mm + 0.5 mm` rounded UP to the next 0.5 mm, 24 mm in from the end;
  - bolt: 8 mm dia, 24 mm deep from the end, inset `t/2` exactly;
  - stations: 37 mm from each side, count 2, when the width is ≥ 150 mm, else one centred;
  - Cam bolt bore: 5 mm × 12 mm deep.
- `npm test` does not typecheck. Run `npm run build` before claiming a task compiles.
- Commit to the branch `cam-and-bolt`, one commit per task, each message ending with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A pair beside a third hole.** A shelf-pin row or a second cam lock placed so a third bore touches the cam or bolt
   must still report `meets-hole` on that hole, even when the partner is found first (Task 2 test
   `a third hole meeting a paired bore still faults`).
2. **A part turned, mirrored or linked.** The pair is recognised on the resolved board-local shape, so a mirrored Shape's
   user and a 90° turn draw the same window (Task 3 test `mirrored and turned parts keep the pair`).
3. **A resize that thins the part.** Thickness drops so the bolt touches the cam's floor: the pair stops being a pair, the
   mesh falls back to two plain bores and stays watertight, and the fault is kept (Task 4 test
   `a thinned part unpairs and stays watertight`).
4. **Editing one row of a Cam lock.** Station, count or pitch moves both rows; an `along` change is refused (Task 9 tests).
5. **A metric project and a narrow part.** The preset gives one centred fitting under 150 mm wide and is withheld on stock
   too thin (Task 8 tests `narrow part: one fitting` and `withheld on 1/2" stock`).

## Shared fixture (used by Tasks 1–10)

Add to `src/document/camBoltFixtures.ts` (test-only, list it with the other test-only modules in CLAUDE.md in Task 11).
- `camPart(over?: Partial<Board>): Board`: `createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.75 })` with
  `holes: [CAM, BOLT]`.
- `CAM: HoleRow`: `{ id: 'cam', face: 'thickness', from: 'max', diameter: mm(15), depth: mm(14.5), along: 'width',
  alongFrom: 'min', station: mm(37), count: 2, pitch: 11.25 - 2 * mm(37), acrossFrom: 'min', inset: mm(24) }`.
- `BOLT: HoleRow`: `{ id: 'bolt', face: 'length', from: 'min', diameter: mm(8), depth: mm(24), along: 'width',
  alongFrom: 'min', station: mm(37), count: 2, pitch: 11.25 - 2 * mm(37), acrossFrom: 'min', inset: 0.375 }`.

(`mm` is `holes.ts`' exported `mm`.) This is exactly what `defaultCamLock(camPart-sized board, 'min', …)` must produce
(Task 8 asserts it).

---

### Task 1: The recogniser (`camBolt.ts`)

**Files:**
- Create: `src/document/camBolt.ts`, `src/document/camBoltFixtures.ts`
- Test: `src/document/camBolt.test.ts`

**Interfaces:**
- Produces:
  - `camPartners(holes: readonly Hole[]): Map<Hole, Hole>`. Each paired hole maps to its partner, both directions;
    unpaired holes are absent. This is the spec's clauses 1–7 exactly.
  - `camRole(h: Hole, mate: Hole): 'cam' | 'bolt'` (the face bore is the one whose axis is not the other's travel; it
    is the cam iff clause 6 holds with it as F).
  - `camPairRows(board: Board): { cam: HoleRow; bolt: HoleRow }[]`: WHOLE pairs of rows (every hole of each row pairs
    with a hole of the other, counts equal), in `board.holes` order of the cam row.
  - `camRowIds(board: Board): ReadonlySet<string>`: ids of rows with at least one paired hole. Memoised in a `WeakMap`
    keyed on the `board.holes` array.

- [ ] **Step 1: Write the failing tests.** These go in `camBolt.test.ts` and use `holeInstances` on `camPart()`:
  - `the fixture is two pairs`: `camPartners` has size 4; cam index k ↔ bolt index k.
  - `camPairRows names the whole pair`: `[{ cam: CAM, bolt: BOLT }]`; `camRowIds` = `{'cam','bolt'}`.
  - One test per clause, each one MUTATION past its boundary returning an empty map, and its boundary-side twin still
    paired:
    - clause 1: bolt `tiltAlong: 0.01`; cam `head: 'counterbore'` (with legal head keys); cam `depth: 'through'`;
    - clause 2: bolt `face: 'thickness'`;
    - clause 3: bolt `station` + 1e-6 (unpaired). The twin `+ 1e-10` stays paired, within HOLE_EPS;
    - clause 4: cam depth `0.375 + mm(4)`, so the bolt is tangent to the floor (unpaired). The twin is the fixture;
    - clause 5: bolt diameter = cam diameter;
    - clause 6, bottom: bolt depth `mm(24) + Math.sqrt(mm(7.5) ** 2 - mm(4) ** 2)`, exactly at the far limit
      (unpaired), and `mm(24) - Math.sqrt(...)` at the near limit (unpaired). Depth `mm(24) + mm(3)` stays paired;
    - clause 6, mouth: cam inset `mm(7.5)`, the cam touching the end face (unpaired);
    - clause 7: a second bolt row on the same cams, entering from the other end at `face: 'length', from: 'max'`, depth
      reaching each cam (no cam pairs).
  - `a shorter bolt that stops in the wood does not pair`: bolt depth `mm(15)`.

- [ ] **Step 2: Run, verify they fail.** `npx vitest run src/document/camBolt.test.ts`. Expected: FAIL, the module is
  missing.

- [ ] **Step 3: Implement `camBolt.ts`.** Build the candidate pairs over all ordered (F, E) instance pairs. For E against
  F, with `a = idx(F.axis)`, `b = idx(E.axis)`, `c = 3 - a - b`, `R = F.radius`, `r = E.radius`:
  - clause 3: `|E.centre[c] − F.centre[c]| ≤ HOLE_EPS`;
  - clause 4: F's span along a is `[min(F.centre[a], F.centre[a] + F.dir·F.depth), max(…)]`, and E's extent
    `E.centre[a] ± r` must lie strictly inside it by more than HOLE_EPS at both ends;
  - clause 5: `r < R − HOLE_EPS`;
  - clause 6: `s = (E.centre[b] + E.dir·E.depth) − F.centre[b]`, and `s² + r² ≤ R² − HOLE_EPS`; and
    `E.dir·(F.centre[b] − E.centre[b]) > R + HOLE_EPS`.

  Then clause 7: drop every hole that appears in more than one candidate, with all of its candidates. Iterating rows in
  order makes the result deterministic.

- [ ] **Step 4: Run, verify they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Mutate.** Flip each clause's `<` to `<=` (or drop the clause) one at a time. The matching test must go
  red. Restore.
- [ ] **Step 6: Commit** `feat(cam-bolt): the recogniser (fu 568)`.

### Task 2: The exemption, and no leaks to planners or seats

**Files:**
- Modify: `src/document/holeFaults.ts` (`holeFaults`), `src/document/tenonJoints.ts:89` (`seatedIn`),
  `src/document/stretchers.ts:409, :593, :769`, `src/document/legSockets.ts:370`
- Test: `src/document/holeFaults.test.ts`, `src/document/stretchers.test.ts`, `src/document/tenonJoints.test.ts` (find
  the existing seatedIn suite)

**Interfaces:**
- Consumes: `camPartners`, `camRowIds` (Task 1).
- Produces: `holeFaults(board: Board, row: HoleRow, opts?: { camPairs?: boolean }): HoleFault[]`. The default
  `camPairs: true` applies the exemption; `false` judges every meeting as today.

- [ ] **Step 1: Write the failing tests.**
  - `a cam pair has no fault`: `holeFaults(camPart(), CAM)` and `(…, BOLT)` are both `[]`.
  - `the exemption is off for planners`: with `{ camPairs: false }`, both rows report `0:meets-hole` and `1:meets-hole`.
  - `a third hole meeting a paired bore still faults`: add a row `{ id: 'pin', face: 'thickness', from: 'max',
    diameter: 0.25, depth: 0.25, along: 'width', alongFrom: 'min', station: mm(37), count: 1, pitch: 0,
    acrossFrom: 'min', inset: mm(24) + mm(7.5) }`, which touches cam 0 tangentially at its far side. Then
    `holeFaults(b, pin)` has `meets-hole` with `other: { row: 'cam', index: 0 }`, and cam's faults include `0:meets-hole`
    naming `pin`. Order the rows `[CAM, BOLT, pin]` and `[pin, CAM, BOLT]`, so the partner is found both first and last.
  - `seatedIn refuses a bolt bore`: a count-1 bolt row with a built round tenon of `mm(8)` on a part coaxial with it. Use
    the seatedIn suite's own fixture shape and move the bore. The test asserts `false`. Twin: the same bore with the cam
    row removed asserts `true`.
  - `usedRow skips a paired row`: through the exported stretcher refit plan (find which export reaches `usedRow` in
    `stretchers.test.ts`). A leg whose only blind bore of the tenon's diameter is a paired bolt gets no `usedRow` (the
    plan reports the socket missing, as for a leg with no bore).

- [ ] **Step 2: Run, verify they fail.** `npx vitest run src/document/holeFaults.test.ts src/document/tenonJoints.test.ts
  src/document/stretchers.test.ts`.

- [ ] **Step 3: Implement.**
  - In `holeFaults`, when `opts?.camPairs !== false`, compute `camPartners([...mine, ...others])` once. In the `hit`
    search, skip `o` when `partners.get(h) === o` and keep searching. Do not filter after `.find()`.
  - `seatedIn`: return false when `camRowIds(b).has(row.id)`.
  - `usedRow`'s `near` filter: `&& !camRowIds(leg).has(r.id)`.
  - Pass `{ camPairs: false }` at `stretchers.ts:409`, `:769` and `legSockets.ts:370`.

- [ ] **Step 4: Run** the three files, then the whole suite: `npm test`. Expected: all PASS, with the snapshot unchanged.
- [ ] **Step 5: Mutate.** Replace the skip with a post-`.find()` filter: the third-hole test must go red. Restore.
- [ ] **Step 6: Commit** `feat(cam-bolt): meets-hole exemption for a recognised pair; planners and seats never take it`.

### Task 3: The mate on `Hole`, the loop, and the rims

**Files:**
- Modify: `src/document/holes.ts` (`Hole`, new `camLoop`, `holeRims`), `src/document/bodies.ts` (`partGeometry`)
- Test: `src/document/camBolt.test.ts`, `src/document/holes.test.ts`

**Interfaces:**
- Consumes: `camPartners`, `camRole` (Task 1).
- Produces:
  - `Hole.mate?: { role: 'cam' | 'bolt'; axis: Dimension; dir: 1 | -1; centre: V3; radius: number; depth: number }`.
    This is the PARTNER's geometry. It is set only in `partGeometry` and frozen with the hole. The doc comment says the
    memo is safe because the partner's geometry is part of the key.
  - `camLoop(bolt: Hole, n = HOLE_SEGMENTS): V3[]`. For each vertex k of `holeRing(bolt, 0, n)`, set the vertex's
    `b`-coordinate to `F.centre[b] − bolt.dir·√(R² − (p[c] − F.centre[c])²)`, where F is `bolt.mate`. Index-aligned
    with the mouth ring, so a band from ring to loop is ruled along the bit. Memoised per frozen hole at the default
    `n`, as `holeRing` is.
  - `holeRims(h)` for a bolt is the mouth ring and `camLoop(h)`, never its bottom ring. For a cam it is unchanged.

- [ ] **Step 1: Write the failing tests.**
  - `partGeometry marks both bores`: on `camPart()`, 4 holes carry `mate`; cams `mate.role === 'bolt'`, bolts `'cam'`.
  - `an unpaired part's holes carry no mate key`: `Object.keys` of every hole of `camPart({ holes: [CAM] })` excludes
    `mate`.
  - `camLoop lies on both cylinders`: every loop point's distance from the cam's axis equals R, to 1e-12. Its distance
    from the bolt's axis equals r. Each point lies between the bolt's mouth and its bottom.
  - `bolt rims end on the loop`: `holeRims(bolt)` has `2 × HOLE_SEGMENTS` segments, and the second loop's points are
    `camLoop(bolt)`'s, `===`.
  - `mirrored and turned parts keep the pair`: `partGeometry(mirrorPart(camPart()))` and the part in each of
    `chiralPart`'s postures (with `CAM`/`BOLT` in its frame) carry 4 mates.

- [ ] **Step 2: Run, verify they fail.**
- [ ] **Step 3: Implement.** In `partGeometry`, `const holes = deepFreeze(withMates(boardHoles(board)))`. `withMates`
  lives in `camBolt.ts`: it copies each paired hole with a `mate` built from its partner and returns the others
  unchanged (the same objects).
- [ ] **Step 4: Run** the tests, then `npm test`. Expected: PASS, identity tests unchanged.
- [ ] **Step 5: Commit** `feat(cam-bolt): the mate key, the intersection loop, rims`.

### Task 4: The watertight mesh

**Files:**
- Modify: `src/viewport/grainTiling.ts` (`holeMesh`)
- Test: `src/viewport/curvesWatertight.test.ts`, `src/viewport/holesPerf.test.ts`

**Interfaces:**
- Consumes: `Hole.mate`, `camLoop` (Task 3).

- [ ] **Step 1: Write the failing tests** in `curvesWatertight.test.ts`, each asserting `unmatched === 0` through the
  file's `unmatchedEdges`:
  - the plain `camPart()`;
  - `camPart()` with `ARCH` (`curveFixtures`) on its far end;
  - `mirrorPart(camPart())`;
  - `camPart()` with a dado crossing a cam: the faulted path, both bores clipped;
  - `camPart()` beside a counterbored row;
  - `a thinned part unpairs and stays watertight`: `camPart({ thickness: 0.5 })` with the rows unchanged (no mates; two
    plain bores, faulted, meeting).

  Add one more test, `no wall in air`. No vertex of any triangle of the bolt's mesh lies at a distance less than
  `R − 1e-6` from the cam's axis within the cam's depth span. No triangle of the cam's wall has its centroid within
  `r − 1e-6` of the bolt's axis.

  In `holesPerf.test.ts`: `four cam pairs (two Cam locks each end), clean: minimum of 9 full rebuilds is at most 40 ms`.

- [ ] **Step 2: Run, verify they fail.** `npx vitest run src/viewport/curvesWatertight.test.ts
  src/viewport/holesPerf.test.ts`.

- [ ] **Step 3: Implement in `holeMesh`.** This is a new branch before the headless `else`, taken only when `h.mate` is
  set.
  - **Bolt (`h.mate.role === 'cam'`):** `band(top, camLoop(h), wallNormal, radialFacet, planFor([...top, ...loop]))`
    and NO `disc`.
  - **Cam (`h.mate.role === 'bolt'`):** the ring `top = holeRing(h, 0)` and `far = holeRing(h, h.depth)`. Rebuild the
    bolt's `Hole` from `h.mate` (the same geometry `camLoop` needs; the builder adds a small helper in `holes.ts`, e.g.
    `mateHole(h)`, so `camLoop(mateHole(h))` returns the SAME memoised array the bolt's mesh uses). Then:
    1. Unroll each ring vertex and loop vertex to `(θ·R, t)`. θ is measured about the cam's axis from the direction
       pointing back toward the bolt's mouth (`−bolt.dir` along b), in (−π, π]. t is the axial depth from the mouth.
    2. The window's columns: `k0` = one column below the column holding the loop's minimum θ, and `k1` = one above the
       column holding its maximum. Indices are mod HOLE_SEGMENTS, unwrapped so they are contiguous.
    3. Emit every other column with `band` exactly as the headless path does.
    4. For the window, triangulate with `ShapeUtils.triangulateShape(outer, [loop])`. `outer` is the top-ring vertices
       `k0..k1+1` followed by the far-ring vertices `k1+1..k0` (reversed). Emit the triangles from the original 3D
       vertices (rings and loop), not re-mapped points, with `wallNormal` normals and `radialFacet` facets. Clip each
       through the hole's `planFor` when the hole is not clean.
  - Keep the cam's bottom `disc` as today.
  - Fall back to the headless path (`band` whole) if `triangulateShape` returns fewer than `outer.length + loop.length`
    triangles: the watertight test catches a bad window rather than hiding it.

- [ ] **Step 4: Run** the tests, then `npm test`. Expected: PASS, `bodyMeshIdentity` unchanged.
- [ ] **Step 5: Mutate.** Give the bolt its `disc` back: `no wall in air` goes red. Rebuild the loop as a fresh array in
  the cam branch (not the memoised one): the watertight tests stay green ONLY if the values are bit-identical. Then
  perturb one loop vertex by 1e-7 in the cam branch only: the watertight test must go red. Restore.
- [ ] **Step 6: Commit** `feat(cam-bolt): the pair's watertight mesh`.

### Task 5: Drawings (`holeDrawing.ts`)

**Files:**
- Modify: `src/document/holeDrawing.ts`
- Test: `src/document/holeDrawing.test.ts`

**Interfaces:**
- Consumes: `Hole.mate`, `camLoop` (Task 3; drawing resolution `camLoop(h, DRAWING_HOLE_SEGMENTS)`).

- [ ] **Step 1: Write the failing tests** on `camPart()`, for three views: down the cam (`toward` the thickness
  normal), along the width (c), and along the length (b). The tests work in board-local terms by inverting `toWorld`, or
  on an unrotated part where world equals local.
  - `the bolt has no bottom rim`: no segment endpoint lies on the bolt's bottom plane within the cam.
  - `the loop is drawn`: `DRAWING_HOLE_SEGMENTS` segments tagged `'bolt'` whose endpoints are `camLoop(h, 96)`.
  - `bolt silhouettes stop on the cam cylinder`: in each view where the bolt has silhouettes, each silhouette's far
    endpoint is at distance R from the cam's axis, to 1e-9.
  - `the cam's silhouette on the bolt's side is split over the window`: looking along the width, the cam's generator at
    `b = F.b − bolt.dir·R` has two pieces, leaving `a ∈ E.a ± r` uncovered. The generator on the far side is one piece.
  - `visibleOnly drops the clean pair's bolt walls and loop` (as the clean-hole rule).

- [ ] **Step 2: Run, verify they fail.**
- [ ] **Step 3: Implement** two new functions, called from `holeDrawingTagged` only when `h.mate` is set:
  - `boltLines(h, P, toward, clean)`: the mouth rim as `squareLines` draws it; the loop as a closed rim (skipped when
    `clean && visibleOnly`); each silhouette generator from `p0` (local offset `o` from the axis) to its end at local
    `b = F.b − dir·√(R² − o_c²)`.
  - `camLines(h, P, toward, clean)`: `squareLines`' rims, and each silhouette generator split when its local offset
    `(o_b, o_c)` has `o_b·bolt.dir < 0` (the bolt's side) and `|o_c| < r`. The gap is `a ∈ E.a ± √(r² − o_c²)`.
  - `squareLines` itself is not edited.

- [ ] **Step 4: Run** the tests and `npx vitest run src/document/drawingIdentity.test.ts`. Expected: PASS, identity
  unchanged.
- [ ] **Step 5: Commit** `feat(cam-bolt): drawings trim the pair at the window`.

### Task 6: Part diagrams (`diagram.ts`, `PartDiagram.tsx`)

**Files:**
- Modify: `src/document/diagram.ts:493–528` (side bands), `DiagramHoleSide` type, `src/panels/PartDiagram.tsx`
- Test: `src/document/diagram.test.ts`

**Interfaces:**
- Produces: `DiagramHoleSide.gap?: { wall: 'hmin' | 'hmax' | 'vmin' | 'vmax'; from: number; to: number }`. It is set
  only on a paired cam's band in a view whose lateral axis is the pair's b. The band's wall on that side is drawn as two
  pieces, leaving `[from, to]` open along the axis.

- [ ] **Step 1: Write the failing tests** on `camPart()`. Open the width-face view by giving the part an end miter, the
  existing way a view across a hole is opened in `diagram.test.ts`.
  - In the thickness (cam entry) view, the bolt band's axial span ends at `F.b − dir·√(R² − r²)`, and its `bottomAt` is
    `null`.
  - In the width view, the bolt band ends at `F.b − dir·R` with `bottomAt: null`. The cam band carries
    `gap: { wall: <the bolt's side>, from: E.a − r, to: E.a + r }`.
  - A pair-free part's diagram is byte for byte unchanged: `diagramIdentity` passes untouched.

- [ ] **Step 2: Run, verify they fail.**
- [ ] **Step 3: Implement.** In the side-band loop, branch on the hole's `mate` (read the holes from
  `partGeometry(board).holes` rather than `holeInstances` for this, or attach mates with Task 3's `withMates`; the
  builder picks). `PartDiagram.tsx` draws a wall with a `gap` as two dashed segments.
- [ ] **Step 4: Run** the tests and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(cam-bolt): part diagrams end the bolt band on the cam`.

### Task 7: The bench line

**Files:**
- Modify: `src/document/holeText.ts`, `src/document/cutlist.ts:275`, `src/panels/Holes.tsx:67`
- Test: `src/document/holeText.test.ts`, `src/document/cutlist.test.ts`

**Interfaces:**
- Consumes: `camPairRows` (Task 1).
- Produces: `camPairLine(board: Board, cam: HoleRow, bolt: HoleRow, units: Units): string`. It contains
  `Cam-and-bolt ×<count>`, `holeSizeText(cam)` with its face and its inset from the end, and `holeSizeText(bolt)` from
  the end. The wording follows spec §6.3's example; the builder settles it. Faults from both rows are appended as
  `holeLine` appends them.

- [ ] **Step 1: Write the failing tests.**
  - `camPairLine` on `camPart()` in a metric project equals a fixed string. Write it once, read it, and pin it. It must
    contain `×2`, `15 mm`, `14.5 mm deep`, `8 mm` and `24 mm`.
  - In an imperial project it contains `holeSizeText(CAM, 'imperial')` and `holeSizeText(BOLT, …)` verbatim.
  - The cut list for `camPart()` has ONE line containing `Cam-and-bolt` and no `holeLine(…, BOLT)`.
  - A part with CAM only keeps `holeLine` exactly.
  - A part where the bolt row has `count: 1` (partly paired) prints both rows' `holeLine`s unchanged.

- [ ] **Step 2: Run, verify they fail.**
- [ ] **Step 3: Implement.**
  - `cutlist.ts`: for a cam row of a whole pair, push `camPairLine`; skip its bolt row.
  - `Holes.tsx` `HoleRowView`: `line` is `camPairLine` for either row of a whole pair.
  - `featureKeys.ts` and `diagram.ts`' `holeNotes` stay per row (spec §6.3).

- [ ] **Step 4: Run** the tests and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(cam-bolt): one bench line per pair`.

### Task 8: Presets

**Files:**
- Modify: `src/document/holes.ts` (new defaults), `src/panels/Holes.tsx:284–303`
- Test: `src/document/holes.test.ts`, `src/panels/Holes.test.tsx`

**Interfaces:**
- Produces:
  - `defaultCamLock(b: Board, end: CutFrom): [Omit<HoleRow, 'id'>, Omit<HoleRow, 'id'>]` (cam, bolt). The cam's face
    is `broadFace(b)`, entered `from: 'max'` (as `defaultHole`). Its `along` is the other non-length dimension. Its
    `acrossFrom` is `end`, and the bolt's `from` is `end`. The cam depth is
    `mm(Math.ceil((b[face] * 25.4 / 2 + 4.5) * 2 - 1e-9) / 2)`. Stations and count per Global Constraints, exact in
    `mm(…)`.
  - `defaultCamBoltBore(b: Board): Omit<HoleRow, 'id'>`: `defaultHole(b)` with `diameter: mm(5)` and `depth: mm(12)`.
  - The store's `addHoleRows` is reused (it already takes several rows, one edit).

- [ ] **Step 1: Write the failing tests.**
  - `defaultCamLock(camPart-sized board, 'min')` equals `[CAM, BOLT]` without ids.
  - The `'max'` end gives `acrossFrom: 'max'` and `from: 'max'`.
  - `narrow part: one fitting`: width `mm(140)` gives count 1 at `station: width / 2`.
  - Stock of 5/8" gives a cam depth of `mm(12.5)`.
  - In `Holes.test.tsx`: the popover lists `Cam lock` for each end and `Cam bolt bore`. Clicking one adds two rows in
    ONE undo entry (undo removes both). `withheld on 1/2" stock`: no Cam lock item when thickness is 0.5, where the
    pair's faults are non-empty.

- [ ] **Step 2: Run, verify they fail.**
- [ ] **Step 3: Implement.** In `Holes.tsx`, add `fitsAll(rows)`, which probes BOTH rows on the board with both added
  (ids `__cam`, `__bolt`) and requires every row's `holeFaults` to be empty. Item labels and details are the builder's,
  using the panel's end words.
- [ ] **Step 4: Run** the tests and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(cam-bolt): Cam lock and Cam bolt bore presets`.

### Task 9: Editing a pair moves both rows

**Files:**
- Modify: `src/store/store.ts` (new `updateHoleRows`), `src/panels/Holes.tsx` (`attempt`), `src/document/holeText.ts`
  (two refusal sentences)
- Test: `src/store/store.test.ts` (or the store's holes test file), `src/panels/Holes.test.tsx`

**Interfaces:**
- Produces:
  - `updateHoleRows(boardId: string, edits: { rowId: string; next: Omit<HoleRow, 'id'> }[]): string | null`. It runs
    `updateHoleRow`'s per-row refusals for each row, then ONE `edit()`. A no-op edit pushes nothing (inv 4).
  - `CAM_PAIR_ALONG` and `CAM_PAIR_PARTIAL`, the two sentences (spec §4.3; the builder's wording).

- [ ] **Step 1: Write the failing tests.**
  - Editing the cam's `station` to `mm(50)` in the panel moves both rows. Both store `station: mm(50)`, the faults stay
    `[]`, and one undo restores both.
  - The same for `count` 2 → 3 and for `pitch`.
  - Editing the bolt's `alongFrom` copies all four fields onto the cam.
  - An `along` edit on either row is refused with `CAM_PAIR_ALONG`, and nothing changes.
  - On a partly paired pair (bolt `count: 1`), a station edit on the cam is refused with `CAM_PAIR_PARTIAL`.
  - Editing a non-shared field (the cam's `depth`) edits only its row. Twin: a depth that unpairs the rows (tangent to
    the bolt) is refused as `meets-hole`, as today.

- [ ] **Step 2: Run, verify they fail.**
- [ ] **Step 3: Implement.** In `attempt`, after `next` is built (R5's pitch seeding included) and before the fault
  check:
  - if `next.along !== row.along` and `camRowIds(board).has(row.id)`, return `CAM_PAIR_ALONG`;
  - if any of `alongFrom`/`station`/`count`/`pitch` changed and the row is in `camRowIds`, find the row's whole pair in
    `camPairRows(board)` with an equal `along`, or return `CAM_PAIR_PARTIAL`;
  - `partnerNext = { ...partner, alongFrom, station, count, pitch }` taken from `next`;
  - judge the added faults for BOTH rows on the board with both replaced (the existing `had`/`added` rule per row);
  - call `updateHoleRows`.

- [ ] **Step 4: Run** the tests and `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(cam-bolt): editing a pair moves both rows`.

### Task 10: Pinning tests (moving holes, AI round trip, links)

**Files:**
- Test only: `src/document/camBolt.test.ts`

- [ ] **Step 1: Write the tests.** Each is expected to PASS on arrival. If one fails, it is a real bug: fix the code,
  not the test, and report it.
  - `Level the ends keeps the pair`: `levelEndHoles(camPart().holes, e, 0, camPart())` with `e = 0.1` keeps 4 partners
    on the board whose length grows by `e` at min.
  - `stretch past the cam keeps the pair; through the bolt refuses`: `stretchPart(camPart(), 0, 20, 2, 'imperial')`
    keeps 4 partners. `stretchPart(camPart(), 0, mm(10), 2, …)` returns `{ refused }`.
  - `rebaseHoles at the far end keeps the pair`.
  - `Refine's world round trip keeps the pair`: `worldHoles(camPart())` rows, converted back through `holeWorld.ts`'
    inverse, satisfy `sameHoles` for each row and give 4 partners.
  - `a linked Shape's mirrored user has the pair`: through `resolveBoard` on a `mirrored: true` user (the
    `frames.mirror.test.ts` fixture shape).

- [ ] **Step 2: Run.** `npx vitest run src/document/camBolt.test.ts`. Expected: PASS.
- [ ] **Step 3: Commit** `test(cam-bolt): pin the pair through every move`.

### Task 11: Records

**Files:** `docs/invariants.md`, `CLAUDE.md`, `docs/module-map.md`, `docs/versioning.md`, `docs/follow-ups.md`,
`docs/feature-gaps.md`

- [ ] **Step 1:** Write each record, in full in `docs/invariants.md` and condensed in CLAUDE.md, per spec §8:
  - inv 50 gains the cam pair;
  - inv 58: a pair member seats no tenon;
  - inv 60: planner sockets are checked without the exemption.

  Then:
  - add the ONE-homes holes row (`camBolt.ts` `camPartners`; `holes.ts` `camLoop`);
  - list `camBoltFixtures.ts` as test-only;
  - add `camBolt.ts` to the module map;
  - add the versioning note: no bump, and why (spec §3.1);
  - in follow-ups, narrow 568 to chunk 2, and add new entries: the bolt past the cam; the bolt into the cam's floor (the
    real-hardware tangency); hardware from a pair (ask first, inv 55).
- [ ] **Step 2:** `npm run build` and `npm test`. Expected: the build is clean and every test passes. Update CLAUDE.md's
  test count from the output.
- [ ] **Step 3: Commit** `docs(cam-bolt): records`.

After Task 11: the whole-branch review, then the browser check on the dev server
(`docs/browser-verification-cam-and-bolt.md`, the list in spec §8), then merge `--no-ff` to master on the user's word.
