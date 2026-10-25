# Round tenons (splayed legs chunk 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A part's end may carry a round tenon. A tenon seated in a matching socket is a joint the design checks hold. Bore
leg sockets can tenon the legs through the seat in the same action.

**Architecture:** An optional `Board.tenons` array (schema 24), shared like `holes`, flipped by mirrors like every feature.
- **`roundTenons.ts`** (new, pure) is the ONE home of the stored form, the field table, the zone and the fault decider.
- **Geometry** joins the existing view-curve path: `geometryBoard` turns each tenon into stopped view curves
  (`ViewCurve.span`, P18's mechanism), so bodies, edges, silhouettes, caps and the watertight mesh come from tested code.
  Task 4 confirms that, or builds a dedicated step that meets the same tests.
- **`tenonJoints.ts`** (new, pure) is the ONE seated test, built on a predicate split out of `isSocketOf`. `designCheck.ts`
  reads it for the overlap waiver, the grounding walk and a new held clause (d).
- **`legSockets.ts`** gains the leg-tenon plan, and the store writes it in Bore leg sockets' one edit.

**Tech Stack:** TypeScript, React, three.js (react-three-fiber), Zustand, Vitest (`npx vitest run <file>`), and
`npm run build`, the typecheck gate.

**Spec:** `docs/superpowers/specs/2026-10-25-sloyd-round-tenons-design.md` (APPROVED 2026-10-25). Read it first. Where this
plan and the spec differ, the spec wins and the difference is reported.

## Global Constraints

- **A document with no tenon is byte for byte as before.** That means:
  - `bodyMeshIdentity`, `drawingIdentity`, `diagramIdentity`, `sweptIdentity`, `bandFreeIdentity` and every existing test
    pass unchanged;
  - a tenon-free part has no `tenons` key: never `[]`, never `undefined`;
  - `geometryBoard`, `geometryKey`, `rowKey`, `boardUVSignature`, `drawsAsBox` and every design-check result are identical
    for it.
- Stored form: `Board.tenons?: RoundTenon[]`, where `RoundTenon = { id: string; end: 'min' | 'max'; diameter: number;
  length: number }`, in inches, at most one per end, canonical order `min` then `max`.
  - `length` runs along the axis, from the shoulder to the end's centre (where the axis meets the end face, square or
    mitered).
  - The tenon is coaxial with the length and centred on the section.
  - The shoulder is the plane of constant length coordinate.
- `CURRENT_VERSION` 24; a schema-23 build refuses a 24 file (the existing "newer than this build" path).
- Fault copy (verbatim, one home `tenonText.ts`):
  - `too-wide` — `A round tenon must be narrower than the part's section.`
  - `too-long` — `The tenons would meet — shorten one.`
  - `cut-reaches-shoulder` — `The end's cut reaches the shoulder — lengthen the tenon.`
  - `meets-feature` — `The tenon would run into <a rectangular cut | an angle cut | a hole | a curve | a profile | a band> — move it or remove it first.`
- Other copy (verbatim):
  - stale tenon note: `<Leg name>'s tenon no longer fits its socket — Bore leg sockets again.`
  - checkbox: `Tenon the legs (replaces their top tenons)`
  - readout: `Shoulder <len> from the <other end word>` and, when seated, `Seated in <part name>'s socket.`
  - joinery: `Add joinery can't join a part with a round tenon yet: <name>.` / `Repair can't join a part with a round tenon yet: <name>.` / `Refine can't keep joints with a part with a round tenon yet: <name>.`
  - Refine's kept list: `Kept as is (leans, angled holes or round tenons): …` (replaces `Kept as is (leans or angled holes): …`)
- Comparisons in the world are at `1e-9` (`EPS`); `TOUCH` and `LEVEL_EPS` as the design checks define them.
- Rounding (§6.1): a leg's length change rounds UP to the drag grid (`snapStep`, Level the ends' `roundUp`). A fitted
  tenon's length rounds UP to `TENON_STEP`: 1/64" in an imperial project, 0.1 mm in a metric one.
- Layer order (CLAUDE.md): `document` imports nothing from `store`, `generate`, `panels` or `viewport`; the store never
  imports `generate`.
- Every refusal is decided before any mutation. Each action is one undo entry, and is refused while read-only (inv 47) or
  while gesturing.
- On the dev server: no `localStorage.clear()`; test projects stay. No paid runs are needed.

## Review Focus

1. **A stool inside a mirrored instance.** The tenon's `end` flips on a mirror along the length, and the four legs are
   still seated in the world after the mirror (Task 7's test, with a chiral leg: a tenon on one end only).
2. **A mitered tip in a blind socket.** The tip's centre stops short of the bottom, but its far edge passes it. That is NOT
   seated, so the overlap is reported (Task 7).
3. **A tenon 1/64" smaller than its socket** is not seated, so it overlaps, with the mismatch hint (Task 7).
4. **Linked legs under seats that disagree** (two different stools sharing one leg Shape): Tenon the legs refuses, names
   the copies, and writes nothing (Task 9).
5. **A tenon-free document**: every identity test, and every design-check result on the existing fixtures, is unchanged
   (every task's gate; Task 7 runs the design-check suite on the stool and Shaker fixtures with no tenons).

---

### Task 1: Schema 24 and `roundTenons.ts` (the stored form)

**Files:**
- Create: `src/document/roundTenons.ts`, `src/document/roundTenons.test.ts`
- Modify: `src/document/types.ts` (`RoundTenon`, `Board.tenons?`), `src/document/document.ts` (`CURRENT_VERSION`,
  validation, the 23→24 step, `takeId` scope), `docs/versioning.md`
- Test: `src/document/document.test.ts`

**Interfaces:**
- Produces, in `roundTenons.ts`:
  - `TENON_FIELDS` (every field but `id`, `satisfies` checked, inv 40);
  - `tenonValues(t): string`, exact (the `holeRowValues` style: `String()` round trip, `-0` told apart);
  - `sameTenon(a, b): boolean`;
  - `copyTenon(t): RoundTenon`;
  - `tenonsOf(b): readonly RoundTenon[]` (`b.tenons ?? []`);
  - `hasTenons(b): boolean`;
  - `tenonAt(b, end): RoundTenon | undefined`;
  - `withTenons(b, ts): Board`, which drops the key when `ts` is empty and sorts `min` first.

- [ ] **Step 1: Failing tests** in `document.test.ts`:
  - `a 24 file keeps a part's tenons exactly`;
  - `a 23 file loads at 24 with no tenons key`;
  - `drops a malformed tenon, keeps the part`: missing `end`, `diameter` 0, negative `length`, `NaN`, a string, two on
    `min` (the first is kept);
  - `keeps a well-formed faulted tenon` (diameter wider than the part);
  - `a duplicate tenon id is re-minted, the first keeps its id` (inv 33, per board).

  In `roundTenons.test.ts`: `TENON_FIELDS` covers every key but `id`; `withTenons(b, [])` has no `tenons` key; order is
  canonical.
- [ ] **Step 2:** Run `npx vitest run src/document/document.test.ts src/document/roundTenons.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Validation rebuilds each tenon field by field. It drops anything malformed (the Versioning rule) and never clamps.
  - The step adds nothing.
  - `docs/versioning.md` gets the 23→24 row, with the harm argument from spec §3.4.
- [ ] **Step 4:** Run the two files, then `npx vitest run src/document`. Expected: PASS, with no existing test changed
  except the version constant's own tests (`bandingLoad`, `hardwareLoad`, `profilesLoad` and kin pin the version: bump them
  as the angled holes round did).
- [ ] **Step 5: Commit** `feat(round-tenons): schema 24, the stored tenon`.

### Task 2: Links, mirrors, write-back and copies

**Files:**
- Modify: `src/document/links.ts` (`LINK_FIELDS.tenons: 'shared'`, `_sharedPrimitives`' exclusion list, `sharedOf`,
  `sharedPatch`, `sameShared`), `src/document/shapes.ts` (`resolveBoard`), `src/document/roundTenons.ts`
  (`mirrorTenons(ts, d)`, `lowerTenons`), `src/document/frames.ts` (`mirrorFeatures`, and every caller of `mirrorHoleRow`
  gains its tenon twin), `src/document/treeEdit.ts` (lowering, `changedKeys`, `valueOf`, the shape-field copy),
  `src/document/roleLinks.ts`, `src/store/store.ts` (`copyBoard` re-mints tenon ids)
- Test: `src/document/roundTenons.test.ts`, `src/document/links.test.ts`, `src/document/frames.test.ts`,
  `src/document/treeEdit.test.ts`, `src/store/store.test.ts`

**Interfaces:**
- `mirrorTenons(ts, d: Dimension)`: along `'length'` it swaps each `end` and re-sorts; across width or thickness it returns
  the SAME array. Its inverse is itself (flag flips only, inv 44).
- `tenons` is a shared field: one copy on a Shape, a fresh copy per user (`copyTenon`).
- `sameShared` compares tenons as an ordered list with `sameTenon`, ids included, matching the holes branch.

- [ ] **Step 1: Failing tests:**
  - `mirrorTenons twice is the identity`, with a chiral part (a tenon on `max` only);
  - `a mirrored instance's world part has its tenon on the mirrored end`;
  - `linking two legs stores their tenons once on the Shape`;
  - `a shaped part's tenon edit writes the Shape` (through `treeEdit`, changed fields only);
  - `duplicateBoards re-mints tenon ids`;
  - `linkByRole's mirror candidate mirrors the tenon`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Grep every `holes`-field enumeration across `links.ts`, `shapes.ts`, `frames.ts`,
  `treeEdit.ts` and `roleLinks.ts`, and give `tenons` its branch beside it. An absent key stays absent through every path.
- [ ] **Step 4:** `npx vitest run src/document src/store`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(round-tenons): shared, mirrored, lowered, copied`.

### Task 3: The zone and the faults

**Files:**
- Create: `src/document/tenonText.ts`
- Modify: `src/document/roundTenons.ts`
- Test: `src/document/roundTenons.test.ts`

**Interfaces:**
- `shoulderAt(b, t): number`: the shoulder's length coordinate.
  - On a square end it is `L − length` (`max`) or `length` (`min`).
  - On a mitered end, the centre of the end is where the end's miter (the one `face 'length'` miter on that end) meets the
    axis (`depthAt` at the centre station, as `levelPlan` reads it). The shoulder is `length` inward from there.
- `tenonZone(b, t): Region`: the end slab from the shoulder to the end, over the full section.
- `endCutOf(b, end): AngleCut | null | 'other'`:
  - `null` when the end is square;
  - the miter, when the end carries exactly one end miter;
  - `'other'` for anything else on that end.
- `tenonFaults(b, t): TenonFault[]`, where `TenonFault = { kind: 'too-wide' | 'too-long' | 'cut-reaches-shoulder' |
  'meets-feature'; feature?: 'cut' | 'angle-cut' | 'hole' | 'curve' | 'profile' | 'band' }`. This is the ONE decider:
  - `too-wide`: `diameter ≥ min(width, thickness) − 1e-9`;
  - `too-long`: the two shoulders meet or cross (`shoulderAt(min) ≥ shoulderAt(max) − 1e-9`). One tenon alone: its
    shoulder at or past the far end;
  - `cut-reaches-shoulder`: the end's miter plane reaches the shoulder plane anywhere inside the full section (its deepest
    point across the 4 section corners ≥ the tenon length);
  - `meets-feature`: an `'other'` end cut, or any rectangular cut, angle cut that is not the end's miter, hole row, curve,
    profile or band whose region's box meets `tenonZone`'s box with positive extent. Conservative: boxes, never sampled. A
    taper that runs along the length and reaches the end IS a feature here (it slopes the tenon zone).
- `addedTenonFaults(before, after, tenonEnd)`: the faults present after that were not present before (the edit rule).
- `tenonFaultText(f): string`, in `tenonText.ts`, which gives the verbatim copy.

- [ ] **Step 1: Failing tests**, one per fault kind, plus:
  - each one's boundary (exactly at the bound faults; 1e-6 inside does not);
  - a levelled top: a miter at 14°, with the tenon long enough clear and too short `cut-reaches-shoulder`;
  - a hole in the shoulder region clear, one in the zone faulted;
  - a taper on the far half clear.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. **Mutate** the bound comparisons (`≥` → `>`) and confirm a boundary test fails (CLAUDE.md:
  mutate the test).
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(round-tenons): the zone and the one fault decider`.

### Task 4: Geometry, edges and the mesh

**Files:**
- Modify: `src/document/profiles.ts` (`geometryBoard`: its early return also requires no tenons; it appends each
  fault-free tenon's view curves), `src/document/roundTenons.ts` (`tenonViewCurves(b, t): ViewCurve[]`),
  `src/document/bodies.ts` (only if the edge or stop paths need a tenon case), `src/viewport/grainTiling.ts`
  (`boardUVSignature`, `drawsAsBox`), `src/viewport/BoardMesh.tsx` (the memo deps, if `boardUVSignature` does not already
  carry it)
- Test: `src/document/roundTenons.test.ts`, `src/document/bodies.test.ts`, `src/viewport/curvesWatertight.test.ts`,
  `src/viewport/curvesPerf.test.ts`, `src/viewport/grainTiling.test.ts`

**Interfaces:**
- `tenonViewCurves(b, t)`: the waste round the tenon as one or more closed outlines through `'length'`, made of lines and
  MINOR arcs of radius `diameter / 2` about the section's centre, each with
  `span = { lo, hi, stopLo, stopHi }` over the zone. The stop is on the shoulder side; the end side is open.
  - They are view-only (P18: never stored, never validated).
  - `geometryKey` reads them, because it keys on `geometryBoard`'s curves. Add a test that a tenon changes it.
  - A FAULTED tenon builds nothing (the swept-profile rule, Q6), so a fault never produces broken bodies.

- [ ] **Step 1: Failing tests** for these properties of the built part:
  - its bodies' volume equals the section's area × the shoulder length plus π r² × the tenon length, within 1e-6 × the
    volume, for a square end. For a mitered end, use the clipped-cylinder volume (π r² × the tenon length at the centre is
    exact for a plane through the axis point: the wedge above and below cancels);
  - every body is convex;
  - edges (`boardEdges` through `edgesOf`):
    - a ring at the shoulder and one at the end;
    - NO segment that lies along the length inside the zone other than at the outline's sharp vertices. A round tenon has
      none, so there are no lines at all along its side. This is the seam test of spec §7;
    - drawings' silhouettes come from `silhouetteLines` (assert one pair in a side view);
  - `curvesWatertight.test.ts`: the tenoned part's mesh is closed and manifold for a square end, a mitered tip, and on a
    leaning part;
  - `curvesPerf.test.ts`: a tenoned leg rebuilds under the existing curve budget (the same minimum-of-9 harness);
  - `drawsAsBox` is false for a tenoned part; `boardUVSignature` differs with a tenon and is unchanged without one.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement through the view-curve path.**
  - **The seam gate:** if Step 1's no-seam assertion cannot pass with the outlines split into pieces (the quadrants' join
    points read as sharp vertices), fix it where the curve edge code decides sharpness, so the decision is on the TRUE
    arc. The arcs are tangent there, and this is inv 16's "judged on the true arc".
  - If that cannot be done without changing any existing curve's edges (the identity tests), stop and report DONE_WITH_CONCERNS
    with the evidence. The fallback, a dedicated `buildBodies` step with its own edge rules, is a controller ruling.
- [ ] **Step 4:** `npx vitest run src/document src/viewport`. Expected: PASS, with every identity test unchanged.
- [ ] **Step 5: Commit** `feat(round-tenons): bodies, edges and the watertight mesh`.

### Task 5: Section, snapping, drawings and part diagrams

**Files:**
- Modify: `src/document/snapPoints.ts` (the tip centre and the shoulder ring's centre), `src/document/section.ts` (only if
  its fast paths skip view curves), `src/document/diagram.ts`, `src/panels/PartDiagram.tsx`
- Test: `src/document/section.test.ts`, `src/document/snapPoints.test.ts`, `src/document/drawing.test.ts`,
  `src/document/diagram.test.ts`, `src/panels/PartDiagram.test.tsx`

**Interfaces:**
- Diagram: `DiagramTenon = { end, diameter, shoulder }` on the part's diagram model.
  - The end view draws a circle of the diameter at the section's centre.
  - The side views draw the narrowed outline: the shoulder line across the section and the tenon's two sides at ±r.
  - Notes stay HTML (inv 19). A tenon-free diagram is unchanged (`diagramIdentity`).

- [ ] **Step 1: Failing tests:**
  - the section through a tenoned leg's tenon caps a disc of radius r, to the facet tolerance;
  - the section through a seat with a seated tenon shows the seat's cap with the bore subtracted and the leg's disc cap
    inside it;
  - snap points include the tip centre (on the end face) and the shoulder centre;
  - `drawView`'s front view of a tenoned leg has the shoulder line and the two silhouette sides, and no facet lines;
  - the diagram's end view has the circle; the side view has the shoulder line.
- [ ] **Step 2–4:** Run (FAIL), implement, run `npx vitest run src/document src/panels` (PASS).
- [ ] **Step 5: Commit** `feat(round-tenons): section, snapping, drawings, part diagrams`.

### Task 6: Bench line and the cut list

**Files:**
- Modify: `src/document/tenonText.ts` (`tenonLine(b, t, units)`), `src/document/cutlist.ts` (`setupLines`, `rowKey`'s
  `tenonSignature`)
- Test: `src/document/cutlist.test.ts`, `src/document/tenonText.test.ts`

**Interfaces:**
- `tenonLine`: `<d> round tenon, <t> long — at the length <min|max> end, shoulder <s> from the other end`. All three
  lengths go through `formatLength` with the document's units (hole precision for `<d>`, `holeLengthText`).
  - `<s>` is the shoulder's distance from the far end at the centre.
  - It comes after the rectangular-cut lines and before the angle-cut lines in `setupLines`.
- `tenonSignature(b)`: exact and order-independent (`tenonValues`, sorted). It is appended to `rowKey` ONLY when the part
  has tenons, so a tenon-free key is unchanged.

- [ ] **Step 1: Failing tests:**
  - the line's text, imperial and metric;
  - two legs differing only in tenon length are separate rows;
  - two identical tenoned legs are one row of 2;
  - a tenon-free row's key is unchanged (string equality against `main`'s value for the Shaker fixture);
  - the row's length is the blank's, tenon included.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** `feat(round-tenons): bench line and cut list rows`.

### Task 7: The joint — seated tenons in the design checks

**Files:**
- Create: `src/document/tenonJoints.ts`, `src/document/tenonJoints.test.ts`
- Modify:
  - `src/document/legSockets.ts`: export `partAxis(b): { p: V3; u: V3 }` for ANY part (the length's centre line through
    placement and lean, `u` pointing from `min` to `max`), with `legAxis` = `partAxis` flipped up; split out
    `boreAlongAxis(holder, row, axis): boolean`, the coaxial test only; rebuild `isSocketOf` on it, so its narrower rule
    is unchanged;
  - `src/document/designCheck.ts`;
  - `src/document/leanContacts.ts`, if `worldBodyFaces` needs the tenon (it should not: bodies already carry it).
- Test: `src/document/tenonJoints.test.ts`, `src/document/designCheck.test.ts`, `src/document/legSockets.test.ts`
  (unchanged results)

**Interfaces:**
- `seatedIn(a: Board, t: RoundTenon, b: Board, row: HoleRow): boolean`, which implements spec §5.1:
  - `count === 1`;
  - `boreAlongAxis(b, row, partAxis(a))`;
  - `|row.diameter − t.diameter| ≤ 1e-9`;
  - for a blind row, the tip's furthest point along the axis is within the bore's bottom plane + `TOUCH`. That point is the
    centre advanced by `r·tan φ`, where φ is the angle between the end face's normal and the axis (0 on a square end).
  - World parts: `a` and `b` are `worldParts` entries.
- `tenonJoints(doc: FlatDocument): TenonJoint[]`, where `TenonJoint = { a: number; b: number; tenon: string; row: string }`
  (board indices). One pass, in world order: each fault-free tenon is matched against every other part's single bores, and
  the first match wins.
- `withoutTenon(faces: BodyFace[][], b: Board, t: RoundTenon): BodyFace[][]`: `a`'s world bodies clipped to the
  shoulder's kept half-space, which is exactly the wood that is not the tenon (the zone holds nothing else, by
  `meets-feature`).
- `designCheck.ts`:
  - `isAngled` stays as is. A new `realBodied(b) = isAngled(b) || hasTenons(b)` gates the overlap's real-body path,
    `contactRegions` and `contactSolids`, and `partMass`.
  - `contactRegions` trims the cells to the shoulders, like tapers' `lo`/`hi`. The tenon's round wood is never a contact.
  - Overlap: for a pair in `tenonJoints`, `a`'s bodies are replaced by `withoutTenon(…)` for that pair only.
  - `groundedSet` takes a `joined(i, j)` predicate (the pair is in `tenonJoints`, either way round), OR-ed into `joined`.
    It is consulted before the leaning rule, so a leaning part is connected by a joint too.
  - `isHeld` gets clause (d): `if (joints touch i, excluding \`without\`) return true`. It sits ABOVE the
    `lean?.leaning[i]` early return. The other clauses and the prohibitions are untouched.
  - The overlap message for a pair where `a` has a tenon that meets one of `b`'s single bores on its axis (or one of the
    same diameter whose axis does not match) gains ` — its round tenon doesn't match the socket there`. Otherwise it is
    unchanged.
  - With no tenons anywhere, every branch above is skipped: one `hasTenons` scan at the top, as `anyLean` does.

- [ ] **Step 1: Failing tests** (build the fixtures from `stoolFixture.ts`, legs levelled, through sockets bored by
  `socketPlan`, tenons set by hand, or Task 9's fit once it exists — here, by hand):
  - `a tenoned stool with seated tenons is clean`: no overlap, no hangs, no unsupported;
  - `the seat is held by its joints alone`: shoulders 1/16" below the underside, so nothing rests; still clean;
  - `remove one socket → that leg overlaps the seat`, with the mismatch hint absent (there is no bore);
  - `a socket 1/64" larger → overlap with the hint` (Review Focus 3);
  - `a blind socket, mitered tip whose centre stops short but whose edge passes the bottom → not seated, overlap` (Review
    Focus 2);
  - `the same stool inside a mirrored instance is clean` (Review Focus 1);
  - `a shoulder pushed into the seat by 1/16" overlaps` (the shoulder bodies are still measured);
  - `an unleaned rung, tenons at both ends seated in two posts' blind sockets, is held` (clause (d) for an unleaned part);
  - Review Focus 5: every existing `designCheck.test.ts` case passes unchanged.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3: Implement.** **Mutate:** delete clause (d) and confirm `the seat is held by its joints alone` fails; drop
  the blind-tip term and confirm Review Focus 2's test fails.
- [ ] **Step 4:** `npx vitest run src/document`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(round-tenons): a seated tenon is a joint (invs 38, 39)`.

### Task 8: Store and the Round tenons panel

**Files:**
- Modify: `src/store/store.ts`
- Create: `src/panels/RoundTenons.tsx`, `src/panels/RoundTenons.test.tsx`
- Modify: the Properties panel that hosts Holes (add the section after Holes)

**Interfaces:**
- Store actions. Each returns `string | null` (the refusal sentence), decides before `edit()`, writes through `mapWorld`
  (inv 46), and ends in `judgeHeld()` (inv 24):
  - `addTenon(boardId, end, diameter, length)`;
  - `updateTenon(boardId, tenonId, next: Omit<RoundTenon, 'id'>)`;
  - `removeTenon(boardId, tenonId)`, which returns `void`.
- Refusals: add refuses on any `tenonFaults`; update refuses when `addedTenonFaults` is non-empty. Each gives the first
  fault's `tenonFaultText`.
- **`length` of the part is never changed** by these actions (spec §4).
- The panel:
  - one row per end (end words as the Holes panel names a part's ends);
  - `Add round tenon`;
  - `Diameter`, `Length` and `Remove` (`DimensionField`s returning the refusal);
  - the readout (shoulder; seated, from `tenonJoints` over the flat document);
  - a kept fault noted under the row with its `tenonFaultText`.
  - Defaults per spec §4: 1" or 25 mm, else the largest whole 1/8" or whole mm that is not `too-wide`. Length 1" or 25 mm.

- [ ] **Step 1: Failing tests:**
  - store: add, update and remove are each one undo entry;
  - store: refused while exploded; refused on `too-wide`; an edit adding `too-long` refused; a resize that causes a fault
    keeps the tenon;
  - store: a linked leg's tenon is written once on the Shape;
  - panel: the rows, defaults, refusal as the field's own error, the readout's two lines.
- [ ] **Step 2–4:** FAIL, implement, `npx vitest run src/store src/panels` PASS.
- [ ] **Step 5: Commit** `feat(round-tenons): store actions and the Round tenons section`.

### Task 9: Bore leg sockets tenons the legs

**Files:**
- Modify:
  - `src/document/levelEnds.ts`: `levelPlan(world, units, opts?: { topAt?: number })`. With `topAt`, the top's reference
    height is `topAt` instead of R. Without it, the behaviour is byte for byte unchanged, and every existing test passes.
  - `src/document/legSockets.ts`:
    - `legsUnder` (spec §6.3's tenoned rule, added as a second OR branch);
    - `staleSocketOf` (a tenoned leg's "up face in the band" is its tip face lying in the seat's stock);
    - `legTenonPlan`;
    - `socketPlan` returns the legs' patches too.
  - `src/store/store.ts`: `boreLegSockets(seatId, diameter, tenonLegs: boolean)`.
  - `src/panels/Holes.tsx`: the checkbox, and the stale tenon note.
- Test: `src/document/legSockets.test.ts`, `src/document/levelEnds.test.ts`, `src/store/store.test.ts`,
  `src/panels/Holes.test.tsx`

**Interfaces:**
- `legTenonPlan(world: readonly Board[], seat: Board, leg: Board, diameter: number, units: Units): { length: number;
  position: Vec3; angleCuts: AngleCut[]; holes: HoleRow[]; tenons: RoundTenon[] } | string`, per spec §6.1 and §6.4:
  - the top through `levelPlan(leg, units, { topAt: <seat's top face height> })`. A leg already levelled to the seat's
    underside therefore grows by the seat's thickness along the axis, rounded up, with the miter offset;
  - the shoulder `ℓs = min over the 4 section corners of (y_under − c_k(0)) / u_y` on the NEW board, where `c_k(0)` is the
    corner heights at ℓ = 0 and the height is linear in ℓ with slope `u_y`;
  - the tenon length `= (tip centre ℓ) − ℓs`, rounded UP to `TENON_STEP`;
  - the leg's existing `max` tenon replaced (keeping its id) or a new one; `min` untouched;
  - judged by `tenonFaults` before return (a fault gives a sentence naming the leg: `<Leg>'s tenon: <tenonFaultText>`).
- `socketPlan(doc, seatId, diameter, tenonLegs = false)` returns `{ holes; legs?: { id: string; patch: … }[]; note? } |
  string`. With `tenonLegs`, every placement and Shape user is judged as today's sockets are (spec §6.2). It refuses with
  `socketsDisagree` naming the copies when the shared frame's tenons or lengths differ at 1e-9.
- The store writes the seat's holes and every leg's patch in ONE `edit` through `mapWorld`, then calls `judgeHeld()`. A
  linked leg is written once on its Shape.
- The checkbox is `Tenon the legs (replaces their top tenons)`, default on, beside the diameter. The stale tenon note shows
  on the seat's Holes section for a leg found under the seat whose top tenon is not seated in this seat.

- [ ] **Step 1: Failing tests:**
  - stool: one action gives four sockets and four top tenons. Each tip's centre lies in the seat's top face to 1e-9; each
    shoulder's highest corner is at or below the underside, within `TENON_STEP × u_y`. The design check is clean (Task 7);
  - again, immediately: no change (inv 4: one call, no entry);
  - after a rake edit plus Level the ends: one action re-fits, replacing the socket and the tenon (ids kept), and the check
    is clean;
  - a re-fit that SHORTENS a leg (seat lowered 1/2" first);
  - linked legs over one seat: written once on the Shape;
  - Review Focus 4: two stools sharing one leg Shape, seats of different thickness: refused, names both, nothing written;
  - checkbox off: the sockets only (today's behaviour), no leg touched;
  - `levelPlan` without `topAt`: every existing `levelEnds.test.ts` case unchanged.
  - Level the ends on a tenoned top (spec §3.3, §6.3): it levels the tip and keeps the tenon (same id, diameter, length); a fault it causes is kept and noted, never refused.
- [ ] **Step 2–4:** FAIL, implement, `npx vitest run src/document src/store src/panels` PASS.
- [ ] **Step 5: Commit** `feat(round-tenons): Bore leg sockets tenons the legs`.

### Task 10: Refine keeps, joinery refuses

**Files:**
- Modify: `src/document/leanKeep.ts` (`keepsExactly` gains `hasTenons`), `src/document/roleLinks.ts` (`turnCandidates`
  returns none for a tenoned part), `src/generate/joints/tapers.ts` (`tenonRefusal(entry, flat)` after `leaningRefusal`
  in `joineryRefusal`), `src/panels/RefineDialog.tsx` (the kept wording), `src/generate/refine.ts` (a joined Refine
  refuses a kept tenoned part, as for a tilted row)
- Test: `src/generate/refine.test.ts`, `src/generate/joints/*.test.ts` (the refusal), `src/panels/RefineDialog.test.tsx`,
  `src/document/roleLinks.test.ts`

- [ ] **Step 1: Failing tests:**
  - Refine keeps a tenoned rung verbatim (its tenon `===`-equal by value), and drops a model part reusing its name;
  - joinery, Repair and a joined Refine each refuse in their sentence;
  - the kept list's new wording;
  - `turnCandidates(tenoned) = []`;
  - the design schema is byte for byte unchanged (the existing schema snapshot test).
- [ ] **Step 2–4:** FAIL, implement, `npx vitest run src` PASS.
- [ ] **Step 5: Commit** `feat(round-tenons): Refine keeps, joinery refuses`.

### Task 11: Records

**Files:**
- `docs/invariants.md`:
  - a new invariant **58** in full;
  - clauses in 2 (`tenons` absent from the reorient predicate), 38, 39 (clause (d)), 40 (`TENON_FIELDS`), 44 (the end
    flip), 45, 48, 50 (`boreAlongAxis` shared), 56 and 57 (a leaning part held by a joint).
- `CLAUDE.md`:
  - the same, condensed, with every PROHIBITION verbatim;
  - the Versioning line (24);
  - the module table (`roundTenons.ts`, `tenonJoints.ts`, `tenonText.ts`);
  - the test-count line.
  - **CLAUDE.md is ~62.7 KB.** Bring it back to ≤ 60 KB by moving detail (not rules) into `docs/invariants.md` /
    `docs/module-map.md`. Report the before and after sizes.
- `docs/module-map.md`, `docs/versioning.md` (done in Task 1; check it), `docs/rounds.md` (the round row, and the rollback
  table row for schema 24, "not deployed").
- `docs/follow-ups.md`:
  - 447 closed;
  - new entries: Plans feature callouts for a tenon; wedges and pins; a shoulder parallel to the end; joinery on a tenoned
    part; and any deferred minor from the reviews;
  - 438 notes that it uses clause (d).
- `docs/feature-gaps.md`'s row; the spec's status line.

- [ ] **Step 1:** Write them. Run `npx vitest run` and `npm run build`. Record the counts in `docs/rounds.md`.
- [ ] **Step 2: Commit** `docs(round-tenons): records`.

### Task 12: Browser verification (dev server, Playwright)

Write `docs/browser-verification-round-tenons.md`, with screenshots in `docs/img/round-tenons-*.png`. On the dev server
(the user's profile; leave the test project in place):

1. Import the stool. Lean is already set and the ends levelled. Run Bore leg sockets with Tenon the legs on. Check four
   sockets, four tenons, and the bench lines on the cut list.
2. Check the 3D view (rings, silhouettes, no facet lines), and that the section through the seat shows the leg's discs in
   the bores.
3. Check the Plans sheet's part diagram for a leg (the circle in the end view, the shoulder line in the side view).
4. The design check is clean. Remove one socket and the overlap appears; undo.
5. Type a too-wide diameter and see it refused as the field's own error.
6. Edit the rake, then Level the ends, then Bore leg sockets again: re-fitted, and the check is clean.
7. Finally, `npm run build` exits 0.

Record PASS/FAIL per check, and any finding as a follow-up.
