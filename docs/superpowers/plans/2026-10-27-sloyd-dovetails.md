# Through dovetails (dovetails chunk 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With parts selected, one action finds every corner they make, runs both parts out to the outside faces and stores
a matching through dovetail on both ends (schema 26). The model, drawings, checks and cut list read it; the cut list sheet
prints both bench drawings beside the tail part's diagrams; Refine and joinery leave dovetailed parts alone.

**Architecture:**
- **`document/cornerPlan.ts`** (new): box joints' corner finding, run-out, corner-region refusals and linked-Shape planning,
  factored OUT of `boxJoints.ts` behind a small "joint kind" interface, so box joints and dovetails share ONE corner planner.
  Box joints are byte for byte unchanged.
- **`document/dovetails.ts`** (new, numbers-only): the ONE layout, `dovetailFaults` (the ONE fault decider), `builtDovetails`,
  the view curves, the bench-drawing model's numbers, and the planner (`dovetailPlan`, `applyDovetails`). Copy:
  **`document/dovetailText.ts`** (takes the `→ units` edge).
- **Geometry rides the round-tenon route**: `geometryBoard` (`profiles.ts`) appends each BUILT dovetail's waste as
  square-span VIEW curves (`CurveSpan.square`), so bodies, edges, the mesh, UVs, `geometryKey`, the drawings and every
  `squareSpan` filter pick it up with no new body code. Tail board: one view curve per pin socket, `through: 'thickness'`.
  Pin board: one view curve per tail socket, `through` = the run dimension, spanning `depth` back from the end.
- **Schema 26**: `Board.dovetails?`, SHARED, plumbed everywhere `tenons` is plumbed as an optional shared list.
- **Readers**: `designCheck.ts` (real bodies; inscribed contact boxes), `cutlist.ts` (lines, row key, bench model),
  `panels/DovetailBench.tsx`, `drawing.ts` (no feature tags), `snapPoints.ts`, joinery/Refine/Repair through ONE predicate
  `cornerJointed(b)`.
- **UI**: store `dovetailCorners`, `removeDovetail`; `panels/Dovetails.tsx` (multi-selection section and single-part section).

**Tech Stack:** TypeScript, React, Zustand, Vitest (`npx vitest run <file>`), `npm run build` (the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-27-sloyd-dovetails-design.md` (APPROVED 2026-10-27). Read it first; it wins over
this plan, and any difference is reported. Read `docs/superpowers/specs/2026-10-26-sloyd-box-joints-design.md` §3–§7 and its
two Amended sections too: §3.1's corner rules are inherited word for word. Read CLAUDE.md invs 15, 16, 33, 38–41, 44–48, 56,
58, 61 in `docs/invariants.md` before the task that touches each.

## Global Constraints

- **Schema 26.** `CURRENT_VERSION = 26` (`document.ts:223`). No upgrade step (absent means none). A dovetail-free document is
  byte for byte as before: no `dovetails` key on any part (never `[]`, never `undefined` in storage), and every existing test
  passes UNCHANGED except tests that assert the version number itself (list each one edited in the task report).
- Layer order: `document` imports nothing from `store`, `generate`, `panels` or `viewport`. `dovetails.ts` imports no `units`
  value (TYPE-only `Units`).
- The stored shape (spec §3.4), exactly:
  `interface Dovetail { id: string; dim: 'length' | 'width'; end: 'min' | 'max'; role: 'tails' | 'pins'; count: number; slope: number; pin: number; depth: number; outside?: 'min' | 'max' }`
  — `outside` present on pins ONLY (the thickness face the pins are narrow on), absent on tails. At most one per `(dim, end)`;
  canonical order `length min, length max, width min, width max`.
- Layout (spec §3.2), `J` the part's non-thickness dimension other than `dim`, `H = b[J]`, `p = pin`, `s = slope`, `N = count`:
  - `Te = (H − (N + 1)·p) / N`. Outside-plane boundaries along J from J's min, computed DIRECTLY (never a running sum):
    `x(0) = 0`, half pin `[0, p]`, tail `k` (0-based) `[p + k·(Te + p), p + k·(Te + p) + Te]`, last half pin `[H − p, H]`.
  - At distance `x` inward from the outside plane each tail edge moves INTO its tail by `x / s`. Tails: `x` runs from the
    end face (0) to `depth` (the baseline). Pins: `x` runs across the part's own thickness from the `outside` face (0) to
    the other face (`b.thickness`).
  - Fault `narrow`: `Te − 2·X/s < p + 2·X/s − 1e-9`, where `X = depth` (tails) or `b.thickness` (pins). Exactly equal passes.
  - Faults also: `count` not an integer ≥ 1 (`count`); `slope` outside `[4, 12]` (`slope`); `depth` ≥ `b[dim]` (`depth`); the
    fault list is `dovetailFaults(b, d)`'s, in that order.
- Pin width: imperial `0.25`; metric `6 / 25.4`. Never typed.
- Defaults: slope `8`. Auto count per corner: `N = max(1, round(H / A))`, `A = 1.5` imperial, `38 / 25.4` metric; then
  `N − 1` while the `narrow` fault holds on either part and `N > 1`; `N = 1` still faulting refuses (too narrow).
- Which part takes tails: box joints' `RUN_RANK` (Z, X, Y): the part whose run axis ranks first. Swap inverts.
  Re-plan (spec G3): on a corner whose two ends ALREADY carry dovetails (one tails, one pins, at those ends), a null count
  keeps the stored `count` (lowered as Auto only when the new slope faults it), and the CURRENT tails part keeps tails; Swap
  flips relative to the current side.
- Run-out, corner finding, the inherited refusals and their order: box joints' `boxJointPlan` steps 2–4 and 6 unchanged
  (Task 1 moves them).
- View curve ids `dovetail/<dovetail id>/<k>` (the loader re-mints stored ids holding `/`, inv 33, so none can collide).
- Copy (verbatim; home `dovetailText.ts`; lengths through `formatLength` with the document's units; the slope as `1:<s>`
  with `s` printed by `String(s)`):
  - shared with box joints (Task 1 moves them unchanged to `cornerText.ts`, re-exported from `boxJointText.ts`): `These parts
    don't meet at a corner.`; `<A> and <B> must be the same height along the joint.`; `<part> meets two parts at one end.`;
    `<A> and <B> must be in the same assembly.`; `<part> is linked to <mate> — select <mate>'s corner too, or Unlink first.`;
    `<part> isn't at a corner with another selected part.`; `<part> is now <x> longer.` / `… shorter.`
  - three-way: `<part> would be dovetailed on two different edges — that isn't supported yet.`
  - cut in the way: `<part> has a cut where the dovetails go — remove it first.`
  - hole in the way: `<part> has a hole where the dovetails go.`
  - plain stock: `<part> has <a lean | an angle cut | a curve | an edge profile | edge banding | a round tenon | box joints> — dovetails work on plain stock for now.`
  - mirrored copy: `Dovetails can't reach a part inside a mirrored copy yet: <part>.`
  - linked disagreement: `These linked parts would need different dovetails: <parts joined by ", ">.`
  - link split: `Dovetails can't keep these linked parts linked: <parts>. Unlink them first.`
  - slope: `A slope must be between 1:4 and 1:12.`
  - count: `A tail count must be a whole number, 1 or more.`
  - too narrow: `<A> and <B> are too narrow for <N> tails at <slope> — try fewer tails.` (`<N>` the count that failed)
  - success: `Dovetailed <n> corner(s): <N> tails, <slope>.` (one shared layout; `corner` for 1); else `Dovetailed <n>
    corners:` then `<A> and <B>: <N> tails, <slope>.` per corner; then `Tails on <tail parts joined by ", ">.`; then the length
    lines; then the ignored lines.
  - box joints on a dovetailed part: box joints' plain-stock sentence with `dovetails` (`<part> has dovetails — box joints work on plain stock for now.`)
  - another feature added to a dovetailed part: `<part> has dovetails — remove them first.`
  - a cut or hole reaching a dovetailed end: `<part> has dovetails there — move it clear of the joint.`
  - joinery: `<part> has dovetails, so joinery leaves its size and place alone`
  - Refine kept why-word: `has dovetails`; the (c) sentence for a kept part whose only kind is dovetails:
    `Joinery would have changed <name>, which Refine keeps as it is for its dovetails, so the design comes back unjoined.`
  - cut list, tails: `Through dovetails — <N> tails, <slope>, pins <p> at the narrow end, <depth> deep, at the <dim> <end> end; this part has the tails, <Te> at the end.`
  - cut list, pins: `Through dovetails — <N> tails, <slope>, pins <p> at the narrow end, <depth> deep, at the <dim> <end> end; this part has the pins, narrow on its thickness <outside> face.`
  - fault note (single-part section): `This dovetail no longer fits: <reason>.` with reasons `a tail is narrower than a pin`,
    `the tail count isn't a whole number, 1 or more`, `the slope is outside 1:4 to 1:12`, `it is deeper than the part`.
  - multi section: heading `Dovetails`; `Slope` (a `1 :` prefix before the number field); `Tails` (placeholder `Auto`);
    checkbox `Swap tails and pins`; button `Dovetail the corners`. Single-part section: heading `Dovetails`, button `Remove`.
  - bench drawing labels: `outside face`, `inside face`, `baseline`, `both ends`; the slope label `1:<s>`.
- Every refusal decided before any mutation; each action ONE undo entry; refused while exploded (inv 47) or gesturing.
- On the dev server: no `localStorage.clear()`; test projects stay. No paid runs are required (Refine is covered in node);
  at most 2 within the 10-per-feature allowance if Task 8's browser check wants one.

## Spec differences (report them in the round's records)

1. **§3.5's "my suggestion" for bodies is replaced by the round-tenon route** (square-span view curves through
   `geometryBoard`): the spec left the route to the builder; this one needs no new body, edge, mesh or UV code and puts the
   UV signature and `geometryKey` right by construction (inv 15). If Task 3's partition test shows a full-thickness square
   span does not build, STOP and report; do not write separate body code without the controller's ruling.
2. **Refusals on void store actions.** `addCut`, `updateCut`, `addAngleCuts`, `addCurves`, `addProfiles`, `setBands` return
   `void` today. Task 5 changes their return type to `string | null` (callers that ignore it compile unchanged) so the panel
   can show the spec's sentence.

## Review Focus

1. **A drawer whose sides are linked mirror twins** (Side right a `mirrored` user of Side left's Shape): all four selected,
   four corners in one undo entry, sides one cut-list row, the design check clean (Task 4).
2. **Re-running with only a new slope** keeps every corner's count and tail side (Task 4).
3. **A carcass top dovetailed onto two sides** is supported by the check (Task 6; STOP rule).
4. **A metric project**: 6 mm pins, Auto from 38 mm, lines and bench drawing in mm (Tasks 2, 7).
5. **Load safety**: a file newer than 26 is refused (the existing path, so a 25 build refuses a 26 file the same way), and
   a file with a malformed dovetail loads with the part kept and the entry dropped (Task 2).

---

### Task 1: Factor the corner planner out of `boxJoints.ts`

**Files:**
- Create: `src/document/cornerPlan.ts`, `src/document/cornerText.ts`
- Modify: `src/document/boxJoints.ts`, `src/document/boxJointText.ts` (re-export the moved sentences)

**Interfaces:**
- Produces:
  - `interface CornerEnd`, `interface Corner`, `interface EndOp` (moved from `boxJoints.ts`, exported; `EndOp` loses the
    finger-only fields, which become the kind's own `extra: unknown`).
  - `interface JointKind<P> {` `copy: CornerCopy;` `featureOf(b: Board): string | null;` `removeAt(b: Board, d: Dimension, end: CutFrom): void;`
    `planCorner(c: Corner, ops: [EndOp, EndOp], doc: SloydDocument): P | string;` (layout + phase per corner; a string refuses)
    `addAt(b: Board, op: EndOp, end: CutFrom, plan: P, side: 0 | 1, ownFlags: { jFlip: boolean; dimFlip: boolean; tFlip: boolean }): void;`
    `signature(plan: P, side: 0 | 1, ownFlags: …): unknown[];` (Shape-local, compared exactly) `}`
  - `interface CornerCopy` — one function per inherited sentence (mirrored, containers, heights, twoCorners, threeWay,
    plainStock, cutInTheWay, holeInTheWay, linkedMate, linkedDisagree, linkSplit, ignored, length).
  - `planCorners<P>(doc: SloydDocument, ids: readonly string[], kind: JointKind<P>): { parts: Map<string, Board>; corners: { a: string; b: string; plan: P }[]; ignored: string[]; lengths: string[] } | string`
    — `boxJointPlan`'s steps 2–4, the per-corner call into `kind.planCorner`/`kind.addAt`, step 6 (linked Shapes) and the
    link post-condition, exactly as they are today.
  - `writeCorners(doc, parts): SloydDocument` (today's `applyBoxJoints` body).
- `boxJointPlan` and `applyBoxJoints` keep their signatures and results; they become thin callers.

- [ ] **Step 1: Run** `npx vitest run src/document/boxJoints.test.ts src/store/store.boxJoints.test.ts src/panels src/generate`
  and record the pass count.
- [ ] **Step 2: Move the code.** Logic unchanged; only the finger-specific parts go behind `JointKind`.
- [ ] **Step 3: Run** the same tests and `npm run build`. Expected: the same pass count, NO test edited. Mutate: in the moved
  linked-Shape step drop the `jFlip` term of the signature. A box-joint linked test must fail. Restore.
- [ ] **Step 4: Commit** `refactor(dovetails): box joints' corner planner moves to document/cornerPlan.ts`.

### Task 2: Schema 26, the layout and the faults

**Files:**
- Create: `src/document/dovetails.ts`, `src/document/dovetails.test.ts`, `src/document/dovetailText.ts`
- Modify: `src/document/types.ts` (`Dovetail`, `Board.dovetails?`), `src/document/document.ts` (`CURRENT_VERSION`,
  `validateDovetails`, the v26 doc comment beside v24's at :206), `src/document/links.ts` (`LINK_FIELDS.dovetails: 'shared'`,
  `sharedOf`, `sharedPatch`, the comparison at :134), `src/document/shapes.ts:39-41`, `src/document/frames.ts:85-100`
  (`mirrorDovetails`), `src/document/treeEdit.ts` (`lowerDovetails` beside `lowerTenons` at :201 and :432; the ABSENT rule at
  :451; the signature at :588; the copy at :629), `src/document/treeOps.ts:215,343`, `src/store/store.ts:1039`
  (duplicate: fresh ids), `src/document/roleLinks.ts:126-132`. **Every place `tenons` is plumbed as an optional shared list
  gets the same treatment for `dovetails`** — grep `tenons` in `src/document` and `src/store` and account for each hit in the
  task report.

**Interfaces:**
- Produces (`dovetails.ts`):
  - `dovetailsOf(b: Pick<Board, 'dovetails'>): readonly Dovetail[]`; `hasDovetails(b): boolean`; `dovetailAt(b, dim, end): Dovetail | undefined`
  - `withDovetails<T extends Pick<Board,'dovetails'>>(b: T, list: Dovetail[]): T` (canonical order; no key when empty)
  - `copyDovetail(d: Dovetail): Dovetail`; `sameDovetail(a, b): boolean` (exact on `DOVETAIL_FIELDS`)
  - `DOVETAIL_FIELDS` — every field but `id`, `satisfies Record<Exclude<keyof Dovetail, 'id'>, true>` (inv 40)
  - `pinWidth(units: Units): number`; `autoTailCount(H: number, units: Units): number` (before the fault lowering)
  - `interface DovetailLayout { H: number; N: number; s: number; p: number; Te: number; bounds: number[] }` (`bounds` the
    `2N + 2` outside-plane boundaries, `bounds[0] = 0`, last `= H`)
  - `dovetailLayout(H: number, N: number, s: number, p: number): DovetailLayout`
  - `type DovetailFault = 'count' | 'slope' | 'depth' | 'narrow'`; `dovetailFaults(b: Board, d: Dovetail): DovetailFault[]`
  - `builtDovetails(b: Board): readonly Dovetail[]` (fault-free ones)
  - `mirrorDovetails(list: readonly Dovetail[], d: Dimension): Dovetail[]` and its exact inverse `lowerDovetails`: along
    `dim` flips `end`; along `thickness` flips `outside` (pins); along `J` nothing (palindrome).
- `dovetailText.ts`: every sentence in Global Constraints except the cut-list and bench ones (Task 7).

- [ ] **Step 1: Failing tests** (`dovetails.test.ts` and a new `document.v26.test.ts`):
  - `dovetailLayout(6, 4, 8, 0.25)`: `Te === 1.1875`; `bounds` `[0, .25, 1.4375, 1.6875, 2.875, 3.125, 4.3125, 4.5625, 5.75, 6]`.
    The spec's mockup numbers at depth 0.75: a tail at the baseline `1`, a pin at the inside face `0.4375`, a half pin `0.34375`.
  - `dovetailFaults`: tails with `depth` chosen so `Te − 2·depth/s === p + 2·depth/s` exactly (dyadic numbers) → `[]`; the
    depth one 1/64 deeper → `['narrow']`. Count 0, 1.5 → `count`; slope 3.99, 12.01 → `slope`; 4 and 12 pass. Mutate `<` to
    `<=` in the narrow test: the equal case must fail.
  - `autoTailCount(6, imperial) === 4`, `(4, imperial) === 3`, `(3, imperial) === 2`, `(1, imperial) === 1`; metric
    `(152/25.4) === 4`.
  - Mirrors: for `chiralPart` (turn fixtures) carrying one tails and one pins dovetail, `lowerDovetails(mirrorDovetails(x, d), d)`
    equals `x` for every `d`; mirroring along J leaves the list unchanged.
  - Load (`migrateDocument`): a v25 document with no dovetails loads byte for byte (`toEqual`) as before. A v26 part keeps a
    well-formed tails and pins entry; DROPS (part kept) each of: a non-object; `dim: 'thickness'`; `end: 'mid'`; `role: 'x'`;
    `count: 0`; `count: 2.5`; `slope: NaN`; `pin: 0`; `depth: -1`; a pins entry with no `outside`; a second entry for one
    `(dim, end)` (the first wins). A tails entry's stray `outside` is dropped, the entry kept. A faulted but well-formed
    entry (`slope: 20`) is KEPT. An id holding `/` is re-minted. A document at version 27 is refused (the existing newer-
    version path).
  - Links: two parts linked by `linkBoards` share `dovetails`; `sharedPatch({ dovetails: [] })` stores a removal (no key).
  - Duplicate (store): the copy's dovetail ids are fresh.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Follow `tenons` at every site listed above. Append `dovetails` to every signature or copy ONLY
  when present, so dovetail-free outputs are byte for byte unchanged.
- [ ] **Step 4: Run** `npx vitest run` (full) and `npm run build`. Expected: all PASS; only version-number assertions edited.
- [ ] **Step 5: Commit** `feat(dovetails): schema 26 — the stored dovetail, its layout and faults`.

### Task 3: The geometry (view curves)

**Files:**
- Modify: `src/document/dovetails.ts` (`dovetailViewCurves`), `src/document/profiles.ts` (`geometryBoard`, `profileView`:
  generalise the tenon memo to "joint views": tenon AND dovetail view curves), `src/document/drawing.ts` (a dovetail's edges
  and silhouettes carry no feature tag, as `tenonUntagged`), `src/document/snapPoints.ts` (the outside-plane corners)
- Test: `src/document/dovetailGeometry.test.ts`

**Interfaces:**
- Produces: `dovetailViewCurves(b: Board, d: Dovetail): ViewCurve[]`:
  - tails: per pin socket (each pin and half pin), `through: 'thickness'`, `span: { lo: 0, hi: b.thickness, stopLo: false, stopHi: false, square: true }`,
    the outline in `uvDims('thickness')` coordinates: at the end face the socket's outside-plane bounds, at `depth` back the
    bounds widened by `depth/s` each side (a half pin's outer side stays on the J face), traced along the part's boundary
    where it lies on it (as `tenonViewCurves` traces the section).
  - pins: per tail socket, `through: dim`, span from the baseline (`b[dim] − depth` or `depth`) to the end with ONE square stop
    at the baseline (as a tenon's shoulder), the outline in `uvDims(dim)`: at the `outside` face the tail's outside-plane
    bounds, at the other face narrowed by `b.thickness/s` each side.
  - Ids per Global Constraints; `uFrom`/`vFrom` `'min'`.
- `geometryBoard(b)` appends `builtDovetails(b).flatMap(d => dovetailViewCurves(b, d))` after the tenons' view curves; a
  part with neither keeps its object (identity).

- [ ] **Step 1: Failing tests:**
  - **Partition** (spec §10): build a corner (two plain parts, run out, one tails and one pins dovetail, each in its own
    turn), over `(H, N, s) ∈ {(6,4,8), (4,3,6), (3,1,8), (152/25.4, 4, 7)}`, metric and imperial `p`, roles swapped, and the
    tail part turned 90° about its run axis. World bodies (`worldBodies`) clipped to the corner square: total volume ===
    the square's volume (1e-9 relative) and no tail-part body overlaps a pin-part body (pairwise `clipConvex` volume < 1e-12).
    Mutate (a) `Te` + 1e-6 in the tails curve only; (b) the pins' narrowing sign flipped. Each must fail.
  - `boardBodies` of a dovetailed part are all convex (every face's plane leaves every vertex on the inner side).
  - The mesh is watertight (`curvesWatertight.test.ts`'s check) for a tails part and a pins part.
  - `cutlist` curve lines, `curveSignature`, part-diagram curves, `holeFaults.intoCurve` and snap-point arc marks see NO
    curve on a dovetailed part (the `squareSpan` filters).
  - Drawing: `drawView` of a dovetailed drawer tags no segment with a `curve` feature; the Plans sheet keys no curve callout.
  - Snap points: a tails part offers the end-face tail corners; none in a socket (air).
  - A faulted dovetail builds nothing: bodies equal the plain twin's.
  - Section: `sectionCaps` of a tails part and a pins part cut through the joint zone (each axis) have a total cap area equal
    to the bodies' cross-section there (1e-9); no cap lies in a socket.
  - Identity: the existing `diagramIdentity`, `drawingIdentity`, `bandFreeIdentity`, `mirrorFreeIdentity`,
    `hardwareFreeIdentity` and `sweptIdentity` tests pass unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** If the full-thickness square span does not build (Spec difference 1), STOP and report.
- [ ] **Step 4: Run** the new file, `npx vitest run src/document src/viewport` and `npm run build`. Expected: PASS. Then the
  perf guards quiet (close any browser first; `uptime` < 1.5): `npx vitest run -t perf`.
- [ ] **Step 5: Commit** `feat(dovetails): dovetails become geometry (view curves through geometryBoard)`.

### Task 4: The planner

**Files:**
- Modify: `src/document/dovetails.ts`, `src/document/dovetailText.ts`, `src/document/boxJoints.ts` (`featureOf` gains
  `dovetails`, after `round tenon`)
- Test: `src/document/dovetailPlan.test.ts`

**Interfaces:**
- Consumes: Task 1's `planCorners`, `writeCorners`, `JointKind`; Task 2's layout/faults; `pinWidth`, `autoTailCount`.
- Produces:
  - `interface DovetailOptions { slope: number; count: number | null; swap: boolean }`
  - `interface DovetailPlan { parts: Map<string, Board>; corners: { a: string; b: string; tails: string; N: number; s: number }[]; notes: string[] }`
  - `dovetailPlan(doc: SloydDocument, ids: readonly string[], opts: DovetailOptions): DovetailPlan | string`
  - `applyDovetails(doc: SloydDocument, plan: DovetailPlan): SloydDocument`
- Order: slope sentence, count sentence (before any corner work); then `planCorners` with the dovetail kind: `featureOf` in
  the copy's order (box joints' list plus `box joints` when `fingerSets(b).length > 0`); `removeAt` removes the existing
  dovetail at that end; `planCorner` picks the tails part (rank, re-plan rule, swap), the count (typed, kept, or Auto with
  the lowering), refuses `too narrow`; `addAt` stores tails on one end (`depth` = the pin part's thickness) and pins on the
  other (`depth` = the tail part's thickness, `outside` = the pin part's own thickness face on the tail part's far side,
  judged in world then read part-locally through `endFacing`); `signature` = `[dim, Shape-local end, role, N, s, p, depth,
  Shape-local outside]`.

- [ ] **Step 1: Failing tests** (the box joints planner fixtures: a drawer 1/2" sides, 3/4" front and back, 6" tall; a
  carcass):
  - Drawer, all four selected, defaults: 4 corners, tails on the sides (Z ranks first), each side's ends carry tails
    `{ count: 4, slope: 8, pin: 0.25, depth: 0.75 }`, front/back carry pins `depth: 0.5` with `outside` the face away from the
    drawer's inside. Notes: `Dovetailed 4 corners: 4 tails, 1:8.`, `Tails on Side left, Side right.` then the length lines.
  - `swap: true` puts tails on front and back.
  - Re-plan: the dovetailed drawer re-run with `{ slope: 6, count: null, swap: false }` keeps count 4 and tails on the sides;
    with `swap: true` after an earlier swap, tails return to the sides. Mutate the keep-count rule to Auto: a test fails.
  - Auto lowering: a 6" tall corner of two 1 1/2" thick parts at 1:4: Auto starts at 4 and lowers to 2 (4 and 3 fault
    `narrow`). A 1 1/2" tall corner of the same stock at 1:4, where `N = 1` still faults, gives `<A> and <B> are too narrow
    for 1 tails at 1:4 — try fewer tails.` (the copy is literal; copy review owns the plural).
  - Linked mirrored sides (Side right `mirrored`, its mirror along J): plan succeeds, ONE Shape, one cut-list row. Unmirrored
    linked carcass sides at 90° and 270°: succeeds (the palindrome; spec §6). Mutate the signature to compare `outside`
    un-flipped: the mirrored case must refuse.
  - One test per refusal sentence (inherited and new), each asserting the string AND `doc` unchanged (`toBe`).
  - A box-jointed part refuses with `… has box joints — dovetails work on plain stock for now.`, and `boxJointPlan` on a
    dovetailed part refuses with `… has dovetails — box joints work on plain stock for now.`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it, `src/document/boxJoints.test.ts`, and `npm run build`. Expected: PASS. Mutate the run-out to stop
  `TOUCH` short: the partition-in-world assertion fails. Restore.
- [ ] **Step 5: Commit** `feat(dovetails): the corner planner`.

### Task 5: Store actions, panels, and the other features' refusals

**Files:**
- Modify: `src/store/store.ts`, `src/panels/Properties.tsx` (`GroupProperties` beside `BoxJointsSection`; the single-part view
  beside `RoundTenons` at :775), the add/edit paths below and their panels
- Create: `src/panels/Dovetails.tsx`, `src/panels/Dovetails.test.tsx`, `src/store/store.dovetails.test.ts`

**Interfaces:**
- Produces:
  - `dovetailCorners: (ids: string[], slope: number, count: number | null, swap: boolean) => string | null` (as
    `boxJointCorners`: null and nothing while exploded/gesturing or for a stale id; ONE `edit`, then `judgeHeld()`)
  - `removeDovetail: (boardId: string, dovetailId: string) => void` (as `removeTenon`)
  - `DovetailsSection({ ids }: { ids: string[] })` (multi) and `DovetailsPart({ board }: { board: Board })` (single: one row
    per dovetail with its `dovetailLine`, the fault note when `dovetailFaults` is non-empty, and `Remove`)
  - `dovetailZoneRefusal(b: Board, region: Region): string | null` in `dovetails.ts` — the zone is `[b[dim] − depth, b[dim]]`
    (or `[0, depth]`) on `dim`, the whole section; a region meeting it beyond 1e-9 refuses with the zone sentence.
- Refusals on a dovetailed part (spec §3.6), each decided before `edit()`:
  - the add sentence from `addAngleCuts`, `addCurves`, `addProfiles`, `setBands` (adding a band), `setLean` (a non-null
    lean), `addTenon`, `boxJointCorners` (via Task 4);
  - the zone sentence from `addCut`/`updateCut` (the cut's `clippedRegion`), `addHoleRows`/`updateHoleRow` (any hole of the
    rows touching the zone, `holeTouchesBox`), `addStretcher`/`boreLegSockets` (a socket row in a dovetailed part's zone);
  - void actions become `string | null` (Spec difference 2); each panel shows a non-null return as its `role="alert"`.

- `dovetailLine(b: Board, d: Dovetail, units: Units): string` in `dovetailText.ts` (the cut-list wording in Global
  Constraints; Task 7's `setupLines` calls it).

- [ ] **Step 1: Failing tests:**
  - `dovetailLine` of Task 4's drawer side reads the tails sentence with `1 3/16" at the end`; the front's the pins sentence.
  - Store: the drawer dovetailed through `dovetailCorners` is ONE undo entry; `undo()` restores `toEqual` the before; a
    refusal pushes nothing; exploded → null, unchanged. `removeDovetail` on the last one leaves no `dovetails` key.
  - Each refusal path above: one test, the sentence returned and the document unchanged.
  - Panel: four drawer parts selected show `Dovetails` with `Slope` 8 and `Tails` empty (`Auto`); clicking `Dovetail the
    corners` shows the success notes from Task 4. Two parts that make no corner: the no-corner alert. The single-part view
    of a dovetailed side lists its line and `Remove`; a part resized so its dovetail faults shows `This dovetail no longer
    fits: a tail is narrower than a pin.`
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them, `npx vitest run src/panels src/store`, `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(dovetails): Dovetail the corners`.

### Task 6: The design check (the user's ruling, spec §5.3)

**Files:**
- Modify: `src/document/designCheck.ts` (`realBodied` :366, `contactRegions` :381)
- Test: `src/document/designCheck.dovetails.test.ts`

**Interfaces:**
- `realBodied(b)` gains `|| builtDovetails(b).length > 0`.
- `contactRegions(b)`, per BUILT dovetail: every cell is trimmed on `dim` to the region behind the baseline; then, per tail
  (tails part) or pin and half pin (pins part), the box INSCRIBED at its narrowest J span — a tail's baseline span, a pin's
  outside-face span — over the dovetail's full `dim` range and the full thickness, intersected with each cell, is added.
  Dovetail-free parts take the existing path unchanged.

- [ ] **Step 1: Failing tests:**
  - A dovetailed four-sided drawer on the floor (Task 4's planner): `checkDesign(...)` is `[]`.
  - A carcass (sides 3/4 × 11 × 30 upright, top 3/4 × 11 × 24) dovetailed with tails on the top: `[]`. **If it reports
    the top unsupported, STOP: change no check; report to the controller (spec §5.3).**
  - The same drawer with one side's dovetail faulted (resized along J by 1/2"): an overlap is reported at that corner.
  - Mutate: drop the inscribed boxes (cells trimmed only): the carcass must come back unsupported. Mutate: inscribe at the
    WIDEST span: an overlap or interpenetration must appear in a test (assert the contact boxes of a corner never
    interpenetrate: pairwise box overlap ≤ 1e-9).
  - Every existing designCheck test passes unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/document` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(dovetails): the design check reads dovetails (real bodies, inscribed contacts)`.

### Task 7: The cut list lines and the bench drawings

**Files:**
- Modify: `src/document/cutlist.ts` (`setupLines` :229 — one line per dovetail after the finger-set lines; `rowKey` :332 —
  `dovetailSignature(board)` appended only when the part has dovetails; the row gains `benches?: DovetailBench[]`, present
  only on a row whose representative has a tails dovetail), `src/document/dovetailText.ts`, `src/panels/CutList.tsx`
  (render benches after the diagrams, under the same `diagrams` condition), `src/styles.css`
- Create: `src/document/dovetailBench.ts`, `src/document/dovetailBench.test.ts`, `src/panels/DovetailBench.tsx`,
  `src/panels/DovetailBench.test.tsx`

**Interfaces:**
- Consumes Task 5's `dovetailLine`.
- `interface DovetailBench { key: string; ends: 'one' | 'both'; tail: BenchFigure; pin: BenchFigure }`, and
  `interface BenchFigure { width: number; height: number; outline: [number, number][]; waste: [number, number][][]; chain: { at: [number, number]; text: string }[]; labels: { at: [number, number]; text: string }[] }`
  — board-local inches, every label string assembled HERE (inv 19).
- `dovetailBenches(b: Board, units: Units): DovetailBench[]` — one per distinct tails layout on the part; two equal ones →
  one with `ends: 'both'`.
- Figure A (tail face): outline `H` × (`depth` + a margin of `depth`), the pin sockets as waste, the dashed baseline, the
  chain along the end `p, Te, p, …, Te, p` (`formatLength`), `baseline <depth>`, the overall `H`, the slope label. Figure B
  (pin end grain): `H` × the pin part's thickness (= the tails' `depth`), the tail sockets as waste, the same chain along
  the `outside face` (labelled), `inside face` labelled.
- `DovetailBench({ bench }: { bench: DovetailBench })` — two SVGs side by side (wrapping on a narrow sheet), the label
  size from its one home (`LABEL_SIZE`, the `<svg>` attribute; no CSS font-size on the text).

- [ ] **Step 1: Failing tests:**
  - Lines: the Task 4 drawer's side row reads `Through dovetails — 4 tails, 1:8, pins 1/4" at the narrow end, 3/4" deep,
    at the length max end; this part has the tails, 1 3/16" at the end.` (and the min end's); the front's pins line ends
    `narrow on its thickness <min|max> face.` Two sides with equal dovetails are one row; a dovetail differing only in `id`
    does not split a row; a different `slope` does.
  - The 6"/4/1:8 bench: tail chain texts `['1/4"', '1 3/16"', '1/4"', '1 3/16"', '1/4"', '1 3/16"', '1/4"', '1 3/16"', '1/4"']`,
    and the same chain on figure B; the chain's numbers equal the cut-list line's (`1 3/16"` in both). A drawer side with
    both ends equal gets ONE bench, `ends: 'both'`. Metric: chain in mm.
  - No label overlaps another in a rendered `DovetailBench` (the existing text-collision helper; measure the `1:8` glyphs
    in the browser in Task 8 if any non-ASCII is used — prefer ASCII).
  - Identity: a dovetail-free cut list's rows have no `benches` key; `CutList` renders byte for byte as before.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them, `npx vitest run src/document/cutlist.test.ts src/panels`, `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(dovetails): the cut list line and the bench drawings`.

### Task 8: Joinery, Refine and Repair leave dovetailed parts alone

**Files:**
- Modify: `src/document/leanKeep.ts` (:48, :52, :65, :122, :158), `src/generate/joints/recipes.ts` (:89 `jointed`, :281,
  :414, :441, :508), `src/generate/run.ts` (:266, :324, :374), `src/generate/joints/repair.ts`, the joinery site test that
  skips a pocket reaching a dovetailed zone
- Test: `src/generate/dovetailsRefine.test.ts`

**Interfaces:**
- `cornerJointed(b: Board): boolean` in `leanKeep.ts` = `fingerSets(b).length > 0 || hasDovetails(b)`; every listed
  `fingerSets(...).length > 0` site that decides KEEPING or LEAVING ALONE reads it instead (the finger CLAIM sites —
  `fingerClaim.ts`, `refineDesign.ts:98`, `cutlist.ts` — stay finger-only: a dovetail is not a cut).
- The joinery reason is the box-joint sentence or the dovetail sentence by which the part has (box joints first).
- The kept why-word `has dovetails`; the kept-assembly note's `have box joints` becomes `have dovetails` when the assembly
  has dovetails and no box joints, else unchanged.
- A joinery site whose pocket or bore would reach a dovetailed zone (`dovetailZoneRefusal`) is skipped with the joinery
  sentence.

- [ ] **Step 1: Failing tests:**
  - `gateUnjoin` on a dovetailed drawer (no other cut) sees no joint (verify the builder-check claim, spec §7).
  - Refine (node, the existing Refine harness with a scripted model) on a dovetail-only project, on a joined cabinet with
    a dovetailed drawer assembly, and on a dovetailed root part: every dovetail kept exactly (`toEqual`), sizes and
    positions unchanged; the (c) case returns UNJOINED with the dovetail sentence.
  - Add joinery on a carcass with a dovetailed top and a shelf in dados: the shelf joins; a site that would grow the top
    is skipped with `Top has dovetails, so joinery leaves its size and place alone`.
  - Repair on a dovetailed project changes no dovetailed part.
  - Every existing `src/generate` test passes unchanged.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/generate src/document` and `npm run build`. Expected: PASS. Mutate `cornerJointed`
  to finger-only: the Refine tests fail. Restore.
- [ ] **Step 5: Commit** `feat(dovetails): joinery, Refine and Repair keep dovetailed parts`.

### Task 9: Records

**Files:** `docs/invariants.md` (inv 62 in full), `CLAUDE.md` (inv 62 condensed; Versioning: `CURRENT_VERSION` 26; the Where
things live row `dovetails | dovetails.ts, dovetailText.ts, dovetailBench.ts, cornerPlan.ts (inv 62)`; the `→ units` edge
list gains `dovetailText.ts`; the type-only list gains `dovetails.ts`; the test count), `docs/module-map.md`,
`docs/versioning.md` (the 25→26 row, spec §8's harm argument), `docs/follow-ups.md` (fu 484 status; spec §11's new follow-ups,
numbered from 497; a copy-review follow-up for every sentence in Global Constraints), `docs/feature-gaps.md` (dovetails row).

- [ ] **Step 1:** Write them. Inv 62 states: a dovetail is a STORED parametric feature (schema 26), SHARED; `dovetails.ts` is
  the ONE layout, fault decider and view-curve source; its geometry is square-span view curves through `geometryBoard`; one
  layout per corner, an exact partition; a faulted dovetail builds nothing; a dovetail-free document is byte for byte as
  before; every reader correct or refuses (§3.6's refusals); the checks read real bodies and inscribed contacts.
- [ ] **Step 2:** `npx vitest run` (quiet machine) and `npm run build`. Record the count.
- [ ] **Step 3: Commit** `docs(dovetails): invariant 62, versioning, module map, follow-ups`.

### Task 10: Browser verification (dev server, Playwright)

- [ ] **Step 1:** `npm run dev -- --port 5199`; drive the watched Playwright browser (memory: the user can watch it). Build a
  drawer (four parts), select all, Dovetail the corners. Record in `docs/browser-verification-dovetails.md` with DOM readouts:
  the success notes; the cut list lines; the bench drawings present beside the side row's diagrams, the chain text; the
  design check clean; a screenshot of the corner in the viewport (to the scratchpad, absolute path) for the user's eye.
- [ ] **Step 2:** Undo restores; re-run with slope 6 keeps 4 tails; Swap moves the tails; Remove on one end shows the
  overlap in the check.
- [ ] **Step 3:** A real print of the cut list sheet (`page.pdf`, memory) shows both drawings unclipped; reset
  `emulateMedia` after.
- [ ] **Step 4:** `browser_close`; stop the dev server (find its pid first; never `pkill -f`). Commit the report.
