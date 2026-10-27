# Box joints (dovetails chunk 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With parts selected, one action finds every corner they make, runs both parts of each corner out to the outside
faces and cuts interlocking fingers into both ends. The fingers are ordinary rectangular cuts, recognised from their shape
when read, so the cut list shows one line per jointed end and Refine keeps box-jointed parts. No schema change.

**Architecture:**
- **`document/resizeEnd.ts`** (new): joinery's resize core and its rebase helpers MOVE here unchanged from
  `generate/joints/recipes.ts`, so the document layer can grow or trim a part at one end. `recipes.ts` and `unjoin.ts`
  import them. Behaviour is byte for byte unchanged.
- **`document/boxJoints.ts`** (new, pure, numbers-only): the ONE layout (`fingerLayout`), the ONE recogniser (`fingerSets`),
  and the ONE planner (`boxJointPlan`, `applyBoxJoints`). Its copy lives in **`document/boxJointText.ts`**, which takes the
  `→ units` edge.
- **Readers**: `cutlist.ts` (one setup line per finger set, claimed before the tenon finder), `diagram.ts` /
  `PartDiagram.tsx` (no per-notch leaders, one note), `recipes.ts` (skip a site at a finger-set end), `refine.ts` /
  `leanKeep.ts` / `refineDesign.ts` (claim finger sets before the gate, keep box-jointed parts).
- **UI**: store action `boxJointCorners`; panel section `panels/BoxJoints.tsx` in `GroupProperties`.

**Tech Stack:** TypeScript, React, Zustand, Vitest (`npx vitest run <file>`), `npm run build` (the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-26-sloyd-box-joints-design.md` (APPROVED 2026-10-27). Read it first. Where this
plan and the spec differ, the spec wins, and the difference is reported. The plan makes five differences (three
because the code gives no choice, one my call, one the user's ruling; listed under "Spec differences" below).

## Global Constraints

- **No schema change.** `CURRENT_VERSION` stays 25; `types.ts` gains no field. A box-joint-free project is byte for byte as
  before: every existing test passes UNCHANGED (cut list, diagrams, drawings, joinery, Refine, the identity tests).
- Layer order: `document` imports nothing from `store`, `generate`, `panels` or `viewport`.
- Layout (spec §3.3), all comparisons at `1e-9` unless stated:
  - `N = max(5, 2n + 1)` with `n` the integer nearest `q = (H/w − 1)/2`, and a TIE (`q − ⌊q⌋` within 1e-9 of 0.5)
    going DOWN (my call, after review: of the two odd counts a tie sits between, the fewer fingers give the wider outer
    pair, `e = 3w/2` instead of `w/2`; thin outer fingers break off). Inner fingers exactly `w`; outer
    `e = (H − (N − 2)·w) / 2`; refuse when `H < 4w`.
  - Segment `k` (1-based, part-local along the part's `J` dimension from its own min): `s1 = [0, e]`,
    `sk = [e + (k − 2)·w, e + (k − 1)·w]` for `2 ≤ k ≤ N − 1`, `sN = [e + (N − 2)·w, H]`. Computed directly, never as a
    running sum.
  - The outer-fingers part is notched at EVEN `k`, the outer-notches part at ODD `k`. Each notch is `depth` = the other
    part's thickness, exactly.
  - Phase: outer fingers on the part whose run axis comes first in Z, X, Y (world indices 2, 0, 1); **Swap fingers**
    inverts it for every corner.
  - Default width: the thinner part's thickness rounded DOWN to the drag grid (`snapStep`; metric: whole mm), never below
    1/4" (metric 6 mm).
- A notch is a `Cut`: `face` = the dimension running into the corner, `from` = that end, `across: 'thickness'`, `offset`/
  `width` = the segment along the part's `J` dimension, `stopMin: 0`, `stopMax: 0`.
- The run-out moves each part's end EXACTLY to the other part's outside face (never grid-rounded; inv 25).
- Copy (verbatim; home `boxJointText.ts`; lengths through `formatLength` with the document's units, inv 52):
  - no corner: `These parts don't meet at a corner.`
  - ignored (success note line): `<part> isn't at a corner with another selected part.`
  - heights: `<A> and <B> must be the same height along the joint.`
  - one end, two corners: `<part> meets two parts at one end.`
  - three-way: `<part> would be box-jointed on two different edges — that isn't supported yet.` (spec §3.1 left this
    wording to copy review; this is the plan's draft)
  - too short: `<A> and <B> are too short for five fingers that wide — try narrower fingers.`
  - a cut in the way: `<part> has a cut where the fingers go — remove it first.`
  - a hole in the way: `<part> has a hole where the fingers go.`
  - plain stock: `<part> has <a lean | an angle cut | a curve | an edge profile | edge banding | a round tenon> — box joints work on plain stock for now.`
    (the first found, in that order)
  - containers: `<A> and <B> must be in the same assembly.`
  - mirrored copy: `Box joints can't reach a part inside a mirrored copy yet: <part>.`
  - linked mate: `<part> is linked to <mate> — select <mate>'s corner too, or Unlink first.`
  - linked disagreement: `These linked parts would need different box joints: <parts joined by ", ">.`
  - width: `A finger width must be more than zero.`
  - success, one shared layout: `Jointed <n> corner(s): <N> fingers, <w> wide (the outer two <e>).`. Drop
    ` (the outer two <e>)` when `e === w`. Use `corner` for 1 and `corners` otherwise. When the corners' layouts differ:
    `Jointed <n> corners:` then one line per corner, `<A> and <B>: <N> fingers, <w> wide (the outer two <e>).`
  - length change: `<part> is now <x> longer.` / `<part> is now <x> shorter.`
  - cut list: `Box joint — <N> fingers <w> wide (the outer two <e>), <d> deep, at the <dim> <end> end; this part has the outer fingers.`
    / `…; this part has the outer notches.` (the parenthesis is dropped when `e === w`)
  - section `Box joints`; field `Finger width`; checkbox `Swap fingers`; button `Box joint the corners`.
  - joinery skip reason: `<part>'s box joint is already cut at that end`
  - Refine, a kept assembly linked outside itself (Task 6b): `Refine can't keep a box-jointed assembly whose parts are linked to parts outside it — Unlink first: <part>.`
  - Refine kept note: why-word `has box joints`.
- Every refusal is decided before any mutation. The action is ONE undo entry, refused while exploded (inv 47) or gesturing.
- On the dev server: no `localStorage.clear()`; test projects stay. No paid runs are needed beyond Task 6's Refine check
  (at most 2, within the 10-per-feature allowance).

## Spec differences (report them in the round's records; 1–3 the code decides, 4 is my call, 5 is the user's ruling)

1. **Siblings.** `selectionPatch` keeps only direct children of the open assembly, so every selection is already one
   container's siblings. The per-corner container refusal stays in the planner's API, but no selection reaches it. The
   spec's example of two drawers jointed in one action is therefore impossible: linked sides in two different drawer
   assemblies take the linked-mate refusal (Unlink first).
2. **Success note.** It is held in the section's own state (the selection does not change after the action), not in new
   store state. That is simpler than the spec's §4, and the note is still cleared on a selection change, because
   GroupProperties remounts the section.
3. **Linked write-back.** The SHARED fields of each storage target (`length`/`width`, `cuts`) are written through ONE
   representative world part: a non-mirrored user when there is one, else the first. Every OTHER user is passed to
   `mapWorld` with ONLY its own `position` changed (to its planned world min corner), its shared fields left exactly as
   currently resolved, so nothing is re-lowered through `mirrorCut`. The position matters because `position` is own while
   `length` is shared: a mate left as the same object would grow from its stored min corner and land off at a min-end
   run-out. Before building this, read how `applyWorldEdits` lowers an own position delta and skips unchanged shared
   fields (`treeEdit.ts`). If it cannot take a position-only mate next to a representative's size change, STOP and report
   it. Do not work around it.

4. **The tie.** Spec §3.3 writes `N = 2·round((H/w − 1)/2) + 1`, which leaves a tie (`H/w` an even whole number, e.g.
   a 4" drawer side at 1/2") to `Math.round`: up, to 1/4" outer fingers. The plan pins ties DOWN (3/4" outer fingers);
   see Global Constraints. This needs the user's sight; it is named in the handoff.

5. **Kept assemblies** (the user's ruling, 2026-10-27: "Widen Task 6 to assemblies"; spec §7, Amended). A box-jointed
   part inside an assembly makes Refine keep that WHOLE assembly (definition and every placement) exactly as stored. It
   no longer refuses. Task 6 does root parts; Task 6b does assemblies. Between the two commits, a box-jointed part in an
   assembly reaches `documentToDesign`'s `cuts` refusal. That is acceptable for one commit only.

## Review Focus

1. **A linked, mirrored drawer** (Side left / Side right linked, Side right `mirrored`): selecting all four parts joints
   all four corners in one undo entry, both sides read as one cut-list row, and the design check is clean (Task 3).
2. **Re-running on a jointed drawer with a new width** replaces every finger set in place. Lengths are unchanged, there is
   no stray notch, and it is one undo entry (Tasks 3, 4).
3. **A drawer whose bottom sits in a groove**: the groove runs through the corner and is carried by the run-out, so the
   action is NOT refused, and the groove still runs out at both ends (Task 3).
4. **A metric project**: default width in whole mm, notes in mm, the layout exact (Tasks 2, 4).
5. **Undo** restores the document exactly (`toEqual` the before), and `judgeHeld()` runs after the edit (a held point on a
   moved end goes through inv 24's existing rule) (Task 4).

---

### Task 1: Move the resize core into `document/`

**Files:**
- Create: `src/document/resizeEnd.ts`, `src/document/resizeEnd.test.ts`
- Modify: `src/generate/joints/recipes.ts` (delete the moved code; import it), `src/generate/joints/unjoin.ts` (import the
  rebase helpers from `document/resizeEnd`)

**Interfaces:**
- Produces (moved verbatim, doc comments included):
  - `resizeEnd(b: Board, k: number, side: -1 | 1, amount: number, onResize?: (d: Dimension, end: CutFrom, amount: number) => void): void`.
    This is today's `resize`. The `Tap` is replaced by `onResize`, called at the same point with the same arguments
    `watch.resize` gets minus the part index. `recipes.ts` keeps a private `resize(b, k, side, amount, tap?)` that calls it
    with `tap ? (d, end, a) => tap.watch.resize(tap.index.get(b)!, b, d, end, a) : undefined`.
  - `refaceFromEnd`, `rebaseAngleCuts`, `rebaseCurves`, `rebaseProfiles` (exported, unchanged). `rebaseCuts` moves but stays
    module-private.
  - `cutIntoEnd` stays in `recipes.ts` and imports `refaceFromEnd`.

- [ ] **Step 1: Failing test** `resizeEnd.test.ts`: on a 12 × 4 × 1/2 board with a groove (`face: 'thickness'`,
  `across: 'length'`, `stopMin: 0`, `stopMax: 0`), `resizeEnd(b, <its length's world axis>, 1, 0.5)` leaves `b.length === 12.5`,
  and the groove has `stopMax === 0` (it still runs out). With `side: -1` the position on that axis drops by 0.5 and the
  groove still runs out at both ends.
- [ ] **Step 2: Run** `npx vitest run src/document/resizeEnd.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Move the code.** A cut-and-paste plus imports; change no line of logic.
- [ ] **Step 4: Run** `npx vitest run src/document/resizeEnd.test.ts src/generate` and `npm run build`. Expected: all PASS,
  with no existing test edited.
- [ ] **Step 5: Commit** `refactor(box joints): joinery's resize core moves to document/resizeEnd.ts`.

### Task 2: The layout and the recogniser

**Files:**
- Create: `src/document/boxJoints.ts`, `src/document/boxJoints.test.ts`

**Interfaces:**
- Produces:
  - `interface FingerLayout { count: number; width: number; outer: number; length: number }` (`length` = `H`).
  - `fingerLayout(H: number, w: number): FingerLayout | null`: null when `w <= 0` or `H < 4w` (the caller words it).
  - `segment(l: FingerLayout, k: number): [number, number]`, per Global Constraints.
  - `notchCuts(l: FingerLayout, outerFingers: boolean, face: Dimension, from: CutFrom, along: Dimension, depth: number, ids: string[]): Cut[]`:
    one `Cut` per notch in segment order, ids taken in order. `along` is the part's `J` dimension; the offset is the
    segment start, measured from that dimension's min (part-local, never converted from world).
  - `interface FingerSet { dim: Dimension; end: CutFrom; layout: FingerLayout; depth: number; outerFingers: boolean; cutIds: string[] }`.
  - `fingerSets(board: Board): FingerSet[]`: one per end that carries a set, in the order length min, length max, width
    min, width max. Decided from SHAPE (spec §5.1): take the stock-removing cuts (`cutsThatRemoveStock`) whose
    `clippedRegion` touches that end face of `dim`, spans the whole `thickness`, and reaches one shared depth into `dim`
    (to 1e-9). Read along the other non-thickness dimension, those notches and the fingers between them must alternate
    across all of it in `N ≥ 5` odd segments, with every inner segment equal and the two outer equal (to 1e-9). `layout`
    is rebuilt from what was read (`width` = the inner segment, `outer` = the edge).
  - `fingerSetAt(board: Board, dim: Dimension, end: CutFrom): FingerSet | null`.
  - `defaultFingerWidth(thinner: number, units: Units): number`, per Global Constraints (TYPE-only `Units` import, plus
    `snapStep`).

- [ ] **Step 1: Failing tests:**
  - `fingerLayout(4.5, 0.5)` → `{ count: 9, width: 0.5, outer: 0.5, length: 4.5 }` (every finger equal).
    `fingerLayout(5.25, 0.5)` → count 11, outer 0.375. Ties go down: `fingerLayout(5, 0.5)` → count 9, outer 0.75, and
    `fingerLayout(4, 0.5)` → count 7, outer 0.75. `fingerLayout(1.9, 0.5)` → null. `fingerLayout(2, 0.5)` → count 5
    (the minimum), outer 0.25. Mutate the tie to go up: the two tie cases must fail.
  - For every `(H, w)` in `{(3,0.5),(4.75,0.5),(6,0.75),(100/25.4, 6/25.4)}`, both phases, both ends, `dim` length and
    width: `fingerSets` of a plain board carrying `notchCuts(...)` returns exactly one set, `toEqual` the planned
    `{ layout, depth, outerFingers, cutIds }`. This is the round trip.
  - Mutations, each recognising nothing: drop one notch; shift one notch by 1e-6; deepen one by 1e-6; stop one short of
    the thickness (`stopMin: 0.01`).
  - The same notches re-stored by `refaceFromEnd` (as a resize stores them) are still recognised. This pins shape over
    fields.
  - `findTenons(b)` is `[]` for every planned board above, plus `(1.6, 0.5)` on a length end in the outer-notches phase
    while the layout refuses it. Mutate `fingerLayout`'s minimum to 3 and its bound to `H < 2w`. The `(1.6, 0.5)` case
    (N = 3) must then fail the `findTenons` assertion. Confirm by running it, then restore.
  - `defaultFingerWidth(0.75, imperial)` = 0.75; `(0.2, imperial)` = 0.25; `(0.5, metric)` = 12/25.4; `(0.2, metric)` = 6/25.4.
- [ ] **Step 2: Run** `npx vitest run src/document/boxJoints.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `boxJoints.ts` imports no `units` value (only the TYPE and `snapStep` from `geometry`).
- [ ] **Step 4: Run** it again. Expected: PASS.
- [ ] **Step 5: Commit** `feat(box joints): the finger layout and its recogniser`.

### Task 3: The planner

**Files:**
- Modify: `src/document/boxJoints.ts`, `src/document/boxJoints.test.ts`
- Create: `src/document/boxJointText.ts` (every Global Constraints sentence the planner returns, plus `fingerSetLine` for
  Task 5)

**Interfaces:**
- Consumes: Task 1's `resizeEnd`; Task 2's layout and recogniser; `worldParts`, `displayNames`, `parentPath`,
  `instancesOn` (`tree.ts`); `axisDimensions`, `endFacing`, `spanToWorldOffset` (`geometry.ts`); `mapWorld`, `storageKey`
  (`treeEdit.ts`); `leans`, `hasTenons`, `holeTouchesBox`; `TOUCH` (`checkTolerances.ts`); `nextId`.
- Produces:
  - `interface BoxJointOptions { width: number; swap: boolean }`
  - `interface BoxJointCorner { a: string; b: string; layout: FingerLayout }` (world ids)
  - `interface BoxJointPlan { parts: Map<string, Board>; corners: BoxJointCorner[]; notes: string[] }`: `parts` maps
    each REPRESENTATIVE world id to its new world board (Spec difference 3). `notes` holds the success lines in order:
    the jointed line(s), then the length lines, then the ignored lines.
  - `boxJointPlan(doc: SloydDocument, ids: readonly string[], opts: BoxJointOptions): BoxJointPlan | string`
  - `applyBoxJoints(doc: SloydDocument, plan: BoxJointPlan): SloydDocument`: `mapWorld`, replacing exactly the planned
    representatives.

Planner order (each step can only refuse before any mutation; work on clones):
1. `width > 0`, else the width sentence.
2. Per part: the mirrored-copy test (as `stretcherPlan` does with `instancesOn`).
3. Candidate pairs (spec §3.1's order): thickness axes perpendicular AND each end reaching into the other's thickness
   slab (to `TOUCH`). For each candidate: the same `J` span (1e-9), else the heights sentence. Then one end in one corner
   only, then the three-way test (a part jointed at ends of two different dimensions). No candidate at all gives the
   no-corner sentence.
4. Per jointed part end: the plain-stock test in the copy's order (`leans`, `angleCuts.length`, `curves.length`,
   `profiles.length`, `bands.length`, `hasTenons`). Then remove that end's existing finger set (`fingerSetAt`). Then
   `resizeEnd` to the far face. Then the corner region (the last `other.thickness` of the run dimension at that end,
   full thickness, full `J` dimension): any stock-removing cut whose clipped region meets it (beyond 1e-9) without
   spanning it all along the run dimension gives the cut sentence, and a hole touching it (`holeTouchesBox`) gives the
   hole sentence.
5. The layout per corner (`fingerLayout` on the shared `H`; null gives the too-short sentence). Then the phase. Then the
   notch cuts.
6. Linked parts: group the jointed world parts by Shape. Every user of a jointed part's Shape must itself be jointed at
   the same Shape-local end (the end through `mirrored` and `mirrorDim` from `frames.ts`), else the linked-mate sentence.
   All users' parameters (count, width, outer, depth, phase, Shape-local end, new size along the run dimension) must agree
   exactly, else the disagreement sentence. Then choose ONE representative per `storageKey`. Ids are minted once per
   representative (`nextId` against its existing cut ids).

- [ ] **Step 1: Failing tests** (fixtures built in the test file; a drawer = Front, Back, Side left, Side right, 1/2"
  thick, 4" tall, inside 12 × 16, with butt corners: the sides run between front and back):
  - Drawer, all four selected, `width: 0.5`: 4 corners. Front and Back are each 1" longer, the sides unchanged. Every
    corner's two world finger sets are exact complements: the union of their world notch and finger boxes is the corner
    square, with no overlapping pair to 1e-9. `checkDesign(flatDocument(applyBoxJoints(doc, plan)), limits)` is `[]`.
  - The same drawer modelled with OVERLAPPING corners (every part runs to the outside): same result, with no length
    changes.
  - The same drawer modelled with empty corners (every part stops at the inside faces): each part is 1/2" longer.
  - Outer fingers land on the sides (run axis Z), and on Front/Back with `swap: true`.
  - A carcass (two sides 3/4 × 11 × 30 upright, a top 3/4 × 11 × 24 between them): `checkDesign` is `[]`. If it reports
    the top unsupported, STOP: do not change any check; report to the user (spec §5.3).
  - Grooved drawer: each side has a bottom groove (`face: 'thickness'`, `across: 'length'`). The plan does not refuse,
    and the planned sides' grooves still run out at both ends.
  - Linked, mirrored sides (Side right `mirrored` user of Side left's Shape): the plan succeeds; `applyBoxJoints` leaves
    ONE Shape whose cuts both sides resolve; the cut list (`buildCutList`) groups the sides as one row.
  - Linked parts that CHANGE length (the review's case; the butt-corner drawer's sides do not). (a) Linked Front/Back on
    the butt-corner drawer, Back turned 180°. (b) Linked mirrored sides on the EMPTY-corner drawer. For both, after
    `applyBoxJoints`: every part's world box reaches both outside faces of its corners (to 1e-9) and `checkDesign` is `[]`.
    Mutate: return the mates as the same object. Then (a) or (b) must fail.
  - Selecting Front and Side left only, with the sides linked: the linked-mate sentence naming Side right.
  - Re-run on the jointed drawer with `width: 0.375`: lengths unchanged; every finger set has the new layout; no cut
    outside the finger sets except the grooves.
  - One test per refusal sentence, each asserting the returned string AND that `doc` is unchanged (`toBe` the input).
    This includes the three-way corner (a tray: four sides plus a bottom jointed along its edges) and the too-short corner
    (H = 1.9, w = 0.5).
  - A selection with a shelf that touches nothing at a corner: success, with the ignored line in `notes`.
  - Metric drawer (12 mm stock): `defaultFingerWidth` gives 12 mm, and the notes print mm.
- [ ] **Step 2: Run** `npx vitest run src/document/boxJoints.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `boxJointPlan`, `applyBoxJoints` and the copy.
- [ ] **Step 4: Run** it again. Expected: PASS. Then mutate: make the phase rule rank X before Z, and make the run-out
  stop `TOUCH` short. Each must fail a test. Restore.
- [ ] **Step 5: Commit** `feat(box joints): the corner planner`.

### Task 4: Store action and the panel

**Files:**
- Modify: `src/store/store.ts`, `src/panels/Properties.tsx` (`GroupProperties`)
- Create: `src/panels/BoxJoints.tsx`, `src/panels/BoxJoints.test.tsx`; add store tests to the existing store test file
  that covers `addStretcher`

**Interfaces:**
- Consumes: Task 3's `boxJointPlan`, `applyBoxJoints`, `defaultFingerWidth`.
- Produces:
  - `boxJointCorners: (ids: string[], width: number, swap: boolean) => string | null`. Null and nothing done while
    exploded or gesturing, and for a stale id. It returns the planner's refusal, or null after ONE
    `edit((doc) => applyBoxJoints(doc, plan))` followed by `judgeHeld()`.
  - `BoxJointsSection({ ids }: { ids: string[] })`: shown in `GroupProperties` when 2+ parts are selected (all parts,
    no assemblies), inside its `EditLock`. It has the Finger width `DimensionField` (default `defaultFingerWidth` of the
    thinnest selected part, until typed), the Swap fingers checkbox, and the button, disabled only while the field shows
    a parse error. After the click it shows the store's refusal as `role="alert"`, or on success the planner's `notes`
    (planned over the same document object in the same tick, as `StretcherSection` does). Each note is a `<p>` under the
    section. Any field change clears the alert and notes.

- [ ] **Step 1: Failing tests:**
  - Store: the drawer from Task 3 jointed through `boxJointCorners` pushes exactly one undo entry, and `undo()` restores
    a document `toEqual` the before. A refusal pushes nothing. While exploded (`setExplode(0.5)`), it returns null and
    changes nothing.
  - Panel: selecting the four drawer parts shows `Box joints`. Clicking `Box joint the corners` shows
    `Jointed 4 corners: 7 fingers, 1/2" wide (the outer two 3/4").` (4" tall at 1/2": `fingerLayout(4, 0.5)` is count 7,
    outer 0.75, a tie gone down; the test also asserts that layout, so the sentence and the arithmetic cannot drift apart). Selecting two parts that make no corner and clicking shows
    `These parts don't meet at a corner.` as an alert.
- [ ] **Step 2: Run** `npx vitest run src/panels/BoxJoints.test.tsx` and the store test file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them again. Expected: PASS. Then `npm run build`.
- [ ] **Step 5: Commit** `feat(box joints): Box joint the corners`.

### Task 5: The cut list line and the part-diagram note

**Files:**
- Modify: `src/document/cutlist.ts` (`setupLines`), `src/document/diagram.ts`, `src/panels/PartDiagram.tsx`,
  `src/document/boxJointText.ts`
- Test: `src/document/cutlist.test.ts`, `src/document/diagram.test.ts`, `src/panels/PartDiagram.test.tsx`

**Interfaces:**
- Consumes: `fingerSets`, `FingerSet`.
- Produces:
  - `fingerSetLine(set: FingerSet, units: Units): string`, per Global Constraints (`<dim>` the dimension word, `<end>` the
    end word, as the tenon line names its end).
  - In `setupLines`: finger sets are claimed FIRST. Their cut ids are excluded from both `findTenons`' input and the
    per-cut loop, and one `fingerSetLine` per set comes before the tenon lines.
  - In `diagram.ts`: a finger-set cut still opens its view (`ensure`) but is NOT pushed to `view.cuts`, so it gets no
    leaders and no labels. Its notch still draws, because `view.cells` comes from the board. The view gains an OPTIONAL
    `fingerNotes?: { key: string; text: string }[]` (the key is the set's first cut id), present only when non-empty, so
    every existing view object is unchanged. `PartDiagram.tsx` renders them after `curveNotes`, as `curveNotes` are
    rendered.

- [ ] **Step 1: Failing tests:**
  - A planned drawer side's cut-list row: its setup lines contain exactly one `Box joint — …` line per jointed end and no
    line naming a notch, a dado or a rabbet for those cuts. The groove's own line is still present.
  - A part with a finger set at one end and a hand-made two-shoulder tenon at the other: the tenon line is still printed.
  - Its diagram's end view has `fingerNotes` with the same text as the setup line, and no `cuts` entry for any finger
    cut. A box-joint-free board's views have no `fingerNotes` key (`'fingerNotes' in view === false`).
  - `PartDiagram` renders the note text.
  - The existing identity tests (`diagramIdentity.test.ts`, `drawingIdentity.test.ts`) and the whole cut-list suite pass
    UNCHANGED.
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement.** The line is assembled in `boxJointText.ts`, never in the component (inv 19).
- [ ] **Step 4: Run** the three files plus the identity tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(box joints): one cut-list line and one diagram note per finger set`.

### Task 6: Joinery skips a jointed end; Refine keeps box-jointed parts

**Files:**
- Modify: `src/generate/joints/recipes.ts`, `src/generate/refine.ts` (`plainForRefine`), `src/document/leanKeep.ts`,
  `src/document/refineDesign.ts`
- Test: `src/generate/joints/runJoinery.test.ts` (or the recipes test that covers the grow skip), `src/generate/refine.test.ts`
  (or the file holding `plainForRefine`'s tests), `src/document/leanKeep.test.ts` (create it if absent)

**Interfaces:**
- Consumes: `fingerSetAt`, `fingerSets`.
- Produces:
  - A private `fingerEnd(b: Board, k: number, end: 'min' | 'max'): boolean` in `recipes.ts`:
    `fingerSetAt(b, axisDimensions(b)[k], endFacing(b, k, end === 'min' ? -1 : 1)) !== null`. Finger notches run through
    the thickness, so `refaceFromEnd` re-stores them and `cutIntoEnd` says false. Every `cutIntoEnd` caller needs this
    check too:
    - the GROW skip (`mortise-tenon`, `dado`, `stopped-dado`), just before the existing `cutIntoEnd` one: skip the site with
      the box-joint reason;
    - the rabbet recipe's two TRIM refusals (the panel's own trims, and the `trims` loop over butting parts): refuse with
      the box-joint reason naming the trimmed part, in the recipe's own refusal path.
  - `claimFingerSets(flat: FlatDocument): { flat: FlatDocument; claimed: Map<number, Cut[]> }` (in `refine.ts`, private):
    every recognised finger set's cuts removed per board index.
  - `plainForRefine`: if every cut in the project is claimed, return `{ plain: doc, joints: null }`. Otherwise run the
    existing refusals, then `gateUnjoin` on the CLAIMED flat, then put each board's claimed cuts back onto `g.plain[i]`
    (the same objects, appended) before `writeBackFlat`.
  - `keepsExactly` gains `|| fingerSets(b).length > 0`. `whyKept` appends `has box joints` (the existing forms unchanged).
    The `keptNote` header names box joints only when a box-jointed part is kept, so a document without one is byte for
    byte as before. `leaningInAssembly` and the `lean-assembly` refusal are NOT touched here (Task 6b).
  - `documentToDesign`'s defence-in-depth `cuts` refusal skips the kept root boards (`keptIds`): a box-joint-only project
    reaches it with its finger cuts in place. Without this, every box-jointed project refuses `cuts`.
  - `RefineDialog.tsx`'s kept line names box joints only when a box-jointed part is kept, e.g. `Kept as is (leans, angled
    holes, round tenons or box joints): …`. Its existing string is unchanged otherwise.
  - Note: the existing joined-project refusals for kept kinds (lean, round tenon, compound cut, tilted row) are NOT
    extended to box joints. A joined project with box joints must Refine (spec §7).

- [ ] **Step 1: Failing tests:**
  - Joinery: a box-jointed drawer whose sides' front ends face a false front's face (an end-into-face site) with
    `mortise-tenon` chosen: the site is skipped with `Side left's box joint is already cut at that end`, and the sides are
    unchanged (`toEqual`).
  - Joinery trim: a thin back panel rabbeted into a case where the rabbet's trim would shorten a box-jointed part at its
    jointed end: refused with the box-joint reason, and that part is unchanged (`toEqual`). Mutate: drop the trim check.
    The fingers must then be destroyed (the test fails).
  - `plainForRefine` on a box-joint-only project (root parts): returns `joints: null`, and `keptParts` holds the four
    drawer parts.
  - `plainForRefine` on a joined cabinet (a case with a dadoed shelf, from an existing joinery fixture) plus a root-level
    box-jointed drawer: no refusal. The plain document keeps every finger set exactly (`fingerSets` `toEqual` before) and
    the shelf's dado is read back as a joint.
  - `keptNote` without a box-jointed part is byte for byte the existing string (an existing test passing unchanged
    covers it).
  - `refineRefusal` on a box-joint-only project (root parts) is `null`. Mutate: restore the unfiltered `cuts` check.
    The test must then fail with the `cuts` refusal.
- [ ] **Step 2: Run** the test files. Expected: FAIL.
- [ ] **Step 3: Implement.** If the joined-cabinet test cannot keep the fingers exactly, STOP and report to the user (spec §7). Do not
  refuse silently.
- [ ] **Step 4: Run** them, then `npx vitest run src/generate src/document/leanKeep.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(box joints): joinery leaves a jointed end alone; Refine keeps box-jointed parts`.

### Task 6b: Refine keeps a box-jointed ASSEMBLY whole

Spec §7, Amended (the user's ruling). Its own reviewer gate. **STOP and report to the user if any of rules R1–R4 below
cannot be held.** Do not weaken one to make a test pass.

**Files:**
- Modify: `src/document/leanKeep.ts`, `src/document/refineDesign.ts`, `src/document/generated.ts` (`designToDocument`),
  `src/generate/run.ts`, `src/generate/evaluate*.ts` (wherever `RefineOutcome.leaning` is typed), `src/panels/RefineDialog.tsx`
- Test: `src/document/leanKeep.test.ts`, the `documentToDesign` tests, the `designToDocument` tests, a `runRefine` test with
  a fake client (the existing pattern in `src/generate/`)

**Interfaces:**
- Consumes: Task 6's `keepsExactly` (finger sets included) and `claimFingerSets`.
- Produces:
  - `KeptParts` gains `definitions: Definition[]` and `instances: Instance[]`, in document order, the SAME objects. A
    definition is kept when any of its boards resolves to a part with `fingerSets(r).length > 0`. All its root instances
    are kept with it. `names` stays the kept ROOT boards' names. New `placements: string[]` holds the kept instances'
    names. `shapes` covers the Shapes of every kept board, root and definition.
  - `leaningInAssembly(doc)` ignores a part kept ONLY for box joints (`keepsExactly` without the finger clause is false).
    So the leaning, tilted-row, tenon and compound kinds keep the existing refusal, word for word (R5).
  - `keptAssemblyLinkRefusal(doc): string | null` (in `leanKeep.ts`; copy beside the existing refusal copy): the first
    Shape with a user inside the kept set and a user outside it gives `Refine can't keep a box-jointed assembly whose
    parts are linked to parts outside it — Unlink first: <flat name of the outside user>.` `documentToDesign` returns it
    as reason `lean-assembly`, right after the `leaningInAssembly` check.
  - `documentToDesign`: a kept definition is left out of `assemblies`. Its boards are skipped by every pre-check (taper,
    angle, the `cuts` defence), exactly as kept root boards are. The mirrored, turned and nested refusals still read
    every instance, kept ones included (unchanged code).
  - `keptNote`: after the per-part lines, one line per kept placement:
    `"<placement>" is an assembly with box joints and is kept as is: x … to …, y … to …, z … to ….` (world bounds over
    its parts, `partBounds`, the same number format). The header names box joints when a kept placement or a box-jointed
    root part exists, and is otherwise unchanged.
  - `designToDocument` with `opts.kept`:
    - **R1 (order):** kept definitions are prepended to `definitions` and kept instances to `instances`, before the
      load gate, as kept boards are, so the first-wins repairs (invs 33, 8) keep the user's ids and names.
    - **R2 (echo):** `keptNames` also holds `kept.placements`. A loose model part with such a name is dropped. A model
      assembly placement with such a name is dropped. An assembly left with no placements is dropped silently, NOT
      rejected `unplaced`. Every dropped name goes into `replaced`.
    - **R3 (links):** guaranteed by `keptAssemblyLinkRefusal` before any call. `linkByRole` never sees a kept board
      (no role minted).
    - The floor `shift` is zero when `kept.boards.length + kept.instances.length > 0`.
  - **R4 (joined):** `plainForRefine` needs no new code. Its claimed flat already covers definition boards, because
    `flatDocument` walks them and `writeBackFlat` lowers them. The kept assembly's finger sets come back exactly, as
    root ones do (Task 6).
  - `run.ts` / `RefineOutcome.leaning`: `kept` lists the root names, then the kept placement names. `RefineDialog`'s
    kept line uses the box-joint wording when any kept placement exists.

- [ ] **Step 1: Failing tests:**
  - `keptParts` on a project with two placements of a box-jointed drawer definition (a grooved bottom inside, not
    box-jointed) plus a plain root table: `definitions` is that one definition, `instances` both placements (same
    objects), `placements` their names, `boards` empty.
  - `documentToDesign` on it: no refusal, and `assemblies` does not contain the drawer.
  - A drawer definition holding a LEANING part: the existing `lean-assembly` sentence, byte for byte (R5). Mutate: drop
    the finger-only exemption. The box-jointed fixture must then refuse.
  - The drawer bottom linked to a root panel: `keptAssemblyLinkRefusal` names the root panel. Mutate: return null. The
    round trip must then fail (a kept Shape with a non-kept user after `linkByRole`).
  - `designToDocument` round trip: a model design that echoes an assembly with a placement named like the kept drawer
    placement (`Drawer 1`), plus a new loose part named `Drawer 2`. The result holds the kept definition and instances
    `toEqual` the originals (ids and positions too). Both echoes are dropped and listed in `replaced`. Nothing is
    renamed. Mutate R1: append the kept entries instead of prepending them. The kept placement must then be renamed
    (`Drawer 1 (2)` or the gate's form), and the test fails.
  - Floor: a kept drawer standing at y 0 and model parts whose min y is 2. Nothing shifts. Mutate: count only
    `kept.boards`. The test must then fail.
  - Joined: a dadoed case (an existing joinery fixture) plus the box-jointed drawer assembly. Through `plainForRefine`,
    then a fake-client `runRefine` that echoes the design: the drawer's definition boards `toEqual` the originals,
    `fingerSets` included.
  - `keptNote` on the drawer project includes `"Drawer 1" is an assembly with box joints and is kept as is:` with the
    world bounds. Without kept placements, the string is byte for byte as before (existing tests unchanged).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/generate src/document`, then `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(box joints): Refine keeps a box-jointed assembly whole`.

### Task 7: Records

**Files:**
- Modify: `docs/invariants.md` (new inv 61, in full), `CLAUDE.md` (inv 61 condensed; the `→ units` edge list gains
  `boxJointText.ts`; the ONE-homes table gains box joints; the test count), `docs/module-map.md` (`resizeEnd.ts`,
  `boxJoints.ts`, `boxJointText.ts`, `BoxJoints.tsx`), `docs/rounds.md`, `docs/follow-ups.md` (new entries from 484: the
  spec's §12 list, a copy review for the user, the five spec differences recorded, and widening kept assemblies to the
  other kept kinds), `docs/feature-gaps.md` (the row:
  box joints shipped, dovetails open; refresh the header's status date), the spec (an *Amended (build)* block listing the
  five spec differences and anything else the build changed).

- [ ] **Step 1:** Write the records. Inv 61 states: a box joint is ordinary rectangular cuts; `boxJoints.ts` is the ONE
  layout, the ONE recogniser and the ONE planner, and they round-trip; the recogniser reads SHAPE; one layout per corner,
  exact complements; at least five fingers; no schema; a box-joint-free project is byte for byte as before.
- [ ] **Step 2:** Run `npm test` and `npm run build`. Expected: all pass (timing guards: re-run quiet before calling a
  failure a regression). CLAUDE.md stays under ~60KB (`wc -c CLAUDE.md`).
- [ ] **Step 3: Commit** `docs(box joints): records`.

### Task 8: Browser verification (dev server, Playwright)

**Files:**
- Create: `docs/browser-verification-box-joints.md` (with `docs/img/` screenshots only where the finding is spatial)

- [ ] **Step 1:** `npm run dev -- --port <free port>`. In a NEW project on the dev server, model the Task 3 drawer by hand
  (four parts, butt corners). Select all four, then click Box joint the corners.
- [ ] **Step 2:** Check by DOM readout: the success note, the cut list's `Box joint — …` lines, and no notch lines for
  those cuts. Check by screenshot: the corner close up in the viewport (the fingers interlock, with no z-fighting), the
  part diagram's end view (the notches drawn, one note, no leader stack), and the section view through a corner.
- [ ] **Step 3:** Undo restores the butt corners. Redo, change the width to 3/8", run again: the fingers are replaced.
  Toggle Swap fingers and run again.
- [ ] **Step 4:** Run the design check from the UI: clean. Leave the test project in place (dev-profile rule).
- [ ] **Step 4b:** Group the drawer into an assembly, add a plain root part (a shelf), and Refine once with an
  instruction about the shelf (one paid run of the two allowed). The drawer comes back exactly: same fingers, same
  position, the kept line names it. Leave the project in place.
- [ ] **Step 5: Commit** `docs(box joints): browser verification`.
