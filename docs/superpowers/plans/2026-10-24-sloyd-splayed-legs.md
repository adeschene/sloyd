# Splayed Legs, Chunk 1 (a part that leans) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An upright part can lean at a typed rake and splay (schema 22). It is drawn, picked, snapped, sectioned, checked and
put on the Plans sheet on its real leaned shape, and "Level the ends" makes its foot flat on the floor and its top level.

**Architecture:**
- **Storage:** the lean is part-local data (`Board.lean`: two slopes in the turn-0 frame, plus the dimension that faces
  the sightline), shared through links like `angleCuts`.
- **One home:** `document/lean.ts` turns a WORLD board's lean into one rigid map about its pivot (the top-face centre of
  the pre-lean box). Every part-to-world crossing composes that map.
- **Unchanged:** bodies, edges and features stay part-local and untouched.
- **Mirrors:** they negate the stored X slope (exact flag-style flips).
- **The unleaned path:** a part without a lean takes today's code path, byte for byte.

**Tech Stack:** TypeScript, React, Zustand, react-three-fiber, Vitest (+ Testing Library).
- `npm test` does NOT typecheck: run `npm run build` too.
- Always run vitest with `< /dev/null`.

**Spec:** `docs/superpowers/specs/2026-10-24-sloyd-splayed-legs-design.md`. It is the authority; read it first. Project
rules are in `CLAUDE.md` (invariants 1, 2, 16, 19, 22, 24, 25, 38, 39, 41, 42, 44, 45, 46, 47, 51 and 56; read the full
text in `docs/invariants.md` before touching each area).

**Branch:** `git checkout -b splayed-legs` from `master`. At the end: `git merge --no-ff`, verify the merged tree, delete
the branch (no pull requests).

## Global Constraints

### The stored form

- `CURRENT_VERSION` becomes **22**.
- `export interface Lean { x: number; z: number; face: 'width' | 'thickness' }` and `Board.lean?: Lean`.
- **When stored:** ONLY when `x !== 0 || z !== 0`. A part with no lean has no `lean` key (in memory and in the file).
- **Meaning of the slopes:** `x` and `z` are the foot's travel per inch of drop along world X and Z, in the part's frame
  at rotation 0, before any mirror.
- **Shared:** `LINK_FIELDS.lean = 'shared'`.
- **Upright only:** only a part with `posture === 'upright'` may carry a lean. The loader drops a lean from any other
  posture.
- **Bounds:**
  - `|x| ≤ 1`, `|z| ≤ 1`, and `hypot(x, z) ≤ 1` (resultant ≤ 45°), each compared with a `1e-9` tolerance;
  - non-finite values are dropped, and so is a `face` outside `width` | `thickness`;
  - the loader refuses nothing on content.

### Degrees and the derived numbers

- Degrees appear only in display and typed input.
- **Typed input:** typed rake writes `z = sign · tan(rake°)`, and typed splay writes `x = sign · tan(splay°)`. Each leaves
  the other slope as stored.
- **The world frame:** world +Z is the FRONT (`FRONT.toward = [0,0,1]`, from the model TO the viewer), and world +X is
  the RIGHT.
- **Derived numbers:** resultant `R = atan(hypot(x, z))`; sightline from the front edge `= atan2(|wz|, |wx|)` in degrees
  (0–90), on WORLD slopes.
- **Display precision:** 0.1° (`toFixed(1)`), as `angleText.ts`.
- **Hand-worked pair, used in tests:** rake 8°, splay 12° gives R = **14.2957°** (14.3°) and sightline **33.4724°**
  (33.5°). That sightline is `atan2(tan 8°, tan 12°)`, NOT `atan(8/12)` = 33.69°.

### Copy (verbatim)

| Where | Text |
|---|---|
| Properties readout | `Resultant 14.3° · sightline 33.5° from the front edge` (the numbers vary) |
| Position note (leaning part) | `Position is the part before its lean; it leans about the centre of its top.` |
| Stale-ends note | `Ends were levelled for a different lean — Level the ends again` |
| Buttons | `Level the ends`, `Clear lean` |
| Section heading | `Lean` |
| Fields | `Rake` with select options `toward the front` / `toward the back`; `Splay` with `toward the left` / `toward the right` |

Refusals, all decided before any mutation:

| Refusal | Text |
|---|---|
| Lean on a non-upright part | `Only an upright part can lean.` |
| Posture change while leaning | `Clear the lean first — only an upright part can lean.` |
| Lean on a part with holes | `A part with holes can't lean yet — that comes with angled holes.` |
| Holes on a leaning part | `A leaning part can't take holes yet — that comes with angled holes.` |
| Over the bound | `The lean can't pass 45° in all — reduce the rake or splay.` |
| Level, end already cut | `Remove the angle cut on the foot first.` / `Remove the angle cut on the top first.` |
| Level, pivot at or below floor | `The top of this part is at or below the floor.` |
| Level, shared users disagree | `These linked parts' tops are at different heights, so one length can't level them all: <names>.` (names joined `, `) |
| Joinery and Repair | `Add joinery can't join a leaning part yet: <name>.` / `Repair can't join a leaning part yet: <name>.` (the first leaning part's flat name) |
| Joined Refine | `Refine can't keep joints with a leaning part yet: <name>.` |

Other notes:

| Where | Text |
|---|---|
| Refine done view | `Kept as is (leans): <names>` |
| Plans sheet note | `<name>: rake 8.0° toward the front, splay 12.0° toward the right — resultant 14.3° on a 33.5° sightline` (rake or splay of 0 prints `rake 0.0°` with no direction words) |

### Engineering rules

- **Grid:** the drag grid is `snapToGrid(v, units)` and `snapStep(units)` (1/16", or 1 mm metric). "Round up" means
  `Math.ceil(v / step - 1e-9) * step`.
- **Lean-free documents** are byte for byte unchanged: every existing identity and perf test passes untouched.
- **Testing discipline:** mutation-test every new test (each task lists its mutations). A failed compile is not a red
  test. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Rake equal to splay** (the diagonal layout): mirror twins must be exact reflections, cuts included. Pinned in Task 1
   (`mirror conjugation at x = z`) and Task 3 (`mirrored user of a diagonal lean is the reflection`).
2. **A leg in a turned, mirrored assembly**, edited from Properties: the world rake and splay you type are what you see,
   and the stored slopes lower exactly. Pinned in Task 3 and Task 8.
3. **Free-dragging a levelled leg:** the foot stays at `y = 0` exactly (the delta is rounded, never the corner). Pinned in
   Task 5.
4. **Resizing a levelled leg's length:** the joint at the top stays fixed, the foot moves, and the stale note appears.
   Pinned in Task 5 and Task 8.
5. **An unlevelled leg in the design checks:** it reports as not supported (edge contact is not a face), and a 0.5°
   near-level foot is not a contact. Pinned in Task 11.

---

### Task 1: `lean.ts` — the one home of the lean math

**Files:**
- Create: `src/document/lean.ts`, `src/document/lean.test.ts`

**Interfaces:**
- Produces:
  - `slopeOf(deg: number): number` and `degreesOf(slope: number): number`: `tan` and `atan` in degrees.
  - `resultantDeg(l: Pick<Lean,'x'|'z'>): number`.
  - `sightlineDeg(wx: number, wz: number): number`: degrees from the front edge, `atan2(|wz|, |wx|)`.
  - `withinBound(x: number, z: number): boolean`: implements the Global Constraints bound.
  - `chooseFace(b: Board, x: number, z: number): 'width' | 'thickness'`: the horizontal dimension needing the smaller
    twist; width on a tie (|twist| = 45° within 1e-9).
  - `worldSlopes(b: Board): [number, number]`: stored `(x, z)` rotated by `b.rotation` with the same convention as
    `rotateVec` (`frames.ts`) applied to `[x, 0, z]`.
  - `interface LeanMap { pivot: Vec3; m: Mat3; apply(p: Vec3): Vec3; applyDir(d: Vec3): Vec3; inverse(p: Vec3): Vec3; inverseDir(d: Vec3): Vec3 }`.
    `m` is row-major and orthonormal with det +1.
  - `leanMap(b: Board): LeanMap | null`: null when `b.lean` is absent. It acts on WORLD points of the pre-lean placement.
  - `leanFlip(l: Lean): Lean`: returns `{ x: 0 - l.x, z: l.z, face: l.face }`.

- [ ] **Step 1: Write the failing tests** in `lean.test.ts`. Use `createBoard` for an upright 1.5 × 1.5 × 16 leg at
  `position [0,0,0]` with `lean: { x: tan 12°, z: tan 8°, face: chooseFace(...) }`.
  - `resultant and sightline, hand-worked`: `resultantDeg` ≈ 14.2957 (1e-4); `sightlineDeg(tan12, tan8)` ≈ 33.4724.
  - `the pivot is the top-face centre and is fixed`: `pivot = [0.75, 16, 0.75]`; `apply(pivot)` equals pivot (1e-12).
  - `the foot travels along the slopes`: `apply([0.75, 0, 0.75]) − pivot` is parallel to `(x, −1, z)`, with length 16.
  - `the facing dimension lies in the sightline's vertical plane`: the world image of the facing dimension's direction,
    `applyDir`, has zero component on the horizontal perpendicular to the sightline (1e-12).
  - `twist is smallest`: splay-only (`z = 0`) and rake-only (`x = 0`) leans leave `applyDir` of each horizontal axis in its
    original vertical plane (no twist).
  - `round trip`: `inverse(apply(p))` equals `p` for 20 fixed points (1e-12), and the same for directions.
  - `mirror conjugation`: for leans (tan12, tan8) and (tan10, tan10) — the latter is the x = z case — and for `face`
    width and thickness: the map of `leanFlip` on the X-reflected board (`mirrorPart` from `frames.ts`) equals
    `S · m · S` with `S = diag(−1, 1, 1)`, entrywise (1e-12).
  - `turn equivariance`: the board at rotation 90 gives a map equal to `Ry · m · Ryᵀ` of rotation 0, with matching pivots.
    Use an asymmetric lean.
  - `bound`: `withinBound(1, 0)` is true; `withinBound(0.8, 0.8)` is false; `withinBound(1 + 1e-6, 0)` is false.
  - `chooseFace tie`: `chooseFace(b, t, t)` is `'width'` for t = tan 10°.
- [ ] **Step 2: Run** `npx vitest run src/document/lean.test.ts < /dev/null`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `lean.ts`.** The algorithm, which the signatures do not determine:
  - `(wx, wz) = worldSlopes(b)`; `R = atan(hypot)`; `σ = atan2(wz, wx)`.
  - The facing world axis LINE comes from `axisFrame(b)`: the entry whose `dim === lean.face`, giving index 0 or 2 and
    `θ = 0` or `π/2`.
  - `τ = σ − θ`, reduced into (−π/2, π/2].
  - `Ry(τ)` rotates in the XZ plane: `(x, z) → (x cos τ − z sin τ, x sin τ + z cos τ)`.
  - `T` is the Rodrigues rotation taking `(0, −1, 0)` to `normalize(wx, −1, wz)`, the identity when `R = 0`.
  - `m = T · Ry(τ)`.
  - `pivot = position + [ext0/2, ext1, ext2/2]`, using `boardExtents`.
  - `apply(p) = pivot + m(p − pivot)`; `inverse` uses `mᵀ`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Mutate** and confirm the named test fails, then restore:
  - reduce τ into (−π/4, π/4] (fails `mirror conjugation` at x = z);
  - drop `Ry(τ)` (fails `facing dimension …`);
  - use `atan(8/12)` (fails hand-worked);
  - pivot at the box centre (fails the pivot test).
- [ ] **Step 6: Commit** `feat(splayed-legs): lean.ts, the one home of the lean math`.

### Task 2: The model, links and schema 22

**Files:**
- Modify: `src/document/types.ts` (add `Lean`, `Board.lean?`, `Shape.lean?`);
  `src/document/links.ts` (`LINK_FIELDS`, `_sharedPrimitives` exclusion, `sameShared`, `sharedOf`);
  `src/document/shapes.ts` (`resolveBoard` copies `lean` as a fresh object);
  `src/document/document.ts` (`CURRENT_VERSION = 22`, `validateBoard`, `validateShapes`, the version comment block)
- Modify: `docs/versioning.md` (a v21→v22 row: adds nothing, validates the bounds/upright/face, drops malformed, harm =
  spec §3.6)
- Test: `src/document/document.test.ts`, `src/document/links.test.ts`

**Interfaces:**
- Consumes: `withinBound` (Task 1).
- Produces: `Board.lean?: Lean`, carried through load, links and resolve.

- [ ] **Step 1: Failing tests:**
  - `v22 keeps a valid lean`: round trip a doc with one leaning upright part; its `lean` is deep-equal.
  - `lean dropped when malformed`: `{x:'a'}`, `{x:2,z:0,face:'width'}`, `face:'length'`, and a lean on a `flat` part each
    load with no `lean` key. The part is kept.
  - `zero lean not stored`: `{x:0,z:0,face:'width'}` loads with no key.
  - `a lean-free document exports without a lean key`: `JSON.stringify` contains no `"lean"`.
  - `a 23 file is refused`: the version gate.
  - `sameShared compares lean`: two boards differing only in `lean.z` are not same; equal leans are.
  - `resolveBoard gives each user its own lean object`: not `===` the Shape's.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Lean is an object, so add `'lean'` to `_sharedPrimitives`' exclusion list and give `sameShared` an exact `x`, `z`,
    `face` compare (absent equals absent only).
  - `sharedOf` and `resolveBoard` copy it with `{ ...l }` when present and omit the key when absent.
  - Validation follows the Global Constraints.
- [ ] **Step 4: Run** `npm test < /dev/null` and `npm run build`. Expected: all pass, typecheck clean.
- [ ] **Step 5: Mutate:**
  - let `sameShared` ignore lean (fails its test);
  - store a zero lean (fails `zero lean not stored`).
- [ ] **Step 6: Commit** `feat(splayed-legs): Board.lean, shared through links (schema 22)`.

### Task 3: Mirrors, composition and write-back

**Files:**
- Modify: `src/document/frames.ts` (`mirrorFeatures` adds `lean: leanFlip(b.lean)` when present, so `mirrorPart` and
  `resolveBoard`'s mirrored user get it); `src/document/treeEdit.ts` (`lowerOwnMirror`, the mirror lowering, the
  changed-field predicate near lines 338–372: `lean` is written when edited, or when a mirror lowering produced a fresh
  object that is not the stored one, exactly as `angleCuts`)
- Test: `src/document/frames.test.ts`, `src/document/treeEdit.test.ts`, `src/store/store.test.ts`

**Interfaces:**
- Consumes: `leanFlip`, `leanMap` (Task 1).
- Produces:
  - a world part from `worldParts` carries its lean in its own turn-0 frame, already mirror-flipped;
  - `leanMap(worldPart)` is its world map.

- [ ] **Step 1: Failing tests:**
  - `mirrored user of a diagonal lean is the reflection`: a Shape with lean (tan10, tan10), one user plain and one
    `mirrored`. Every vertex of the mirrored user's world bodies, put through `leanMap`, equals the X-reflection of the
    plain user's, as a set (1e-9).
  - `a part in a turned, mirrored assembly`: the instance is rotated 90 and mirrored. The world map equals the composition
    of instance frame and part map (check 8 transformed corners).
  - `lean edit lowers exactly through a mirror`: from the world part, set `lean.z += 0.05` via the store's world edit. The
    stored slopes are the mirror-lowered values, with `x` unchanged bit for bit.
  - `lean edit re-judges held points`: a `tapeAnchor` on the leaning part's foot corner is dropped after a lean edit
    (inv 24).
  - `untouched lean is the same object`: an unrelated edit (rename) leaves `stored.lean` `===` its previous object.
  - `Ungroup keeps a leaning part's world pose`: an assembly (turned 90) holding a leaning leg, ungrouped, gives the
    same 8 mapped corners (1e-12).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Mirror only by `leanFlip`. Its inverse is itself, so `lowerOwnMirror` and the instance
  lowering apply it once per mirror on the path. Lean moves world points, so route it through the same held-point
  re-judging as a resize.
- [ ] **Step 4: Run** `npm test < /dev/null` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Mutate:**
  - flip `z` instead of `x` (fails the reflection test);
  - skip the flip in `lowerOwnMirror` (fails the lowering test).
- [ ] **Step 6: Commit** `feat(splayed-legs): mirrors flip the lean; write-back lowers it`.

### Task 4: World crossings and real bounds

**Files:**
- Create: `src/document/worldBounds.ts`, `src/document/worldBounds.test.ts`
- Modify:
  - `src/document/snapPoints.ts` (`toWorld`; `boardSnapPoints` builds the lattice part-local and maps it; the
    `stockProbe` path uses `inverse`);
  - `src/document/cuts.ts` (`solidWorldBox` / `pointToLocalXYZ`: for a leaning part, `solidWorldBox` returns the
    bounds of the mapped solid corners, and `pointToLocalXYZ` applies `inverse` first);
  - every `boardsBounds` caller listed below, which moves to `partsBounds`;
  - `src/viewport/framing.ts` `subsetBounds`;
  - `src/document/explode.ts` (centres and floor lift);
  - `src/document/section.ts` `sectionSpan`;
  - `src/document/dimensions.ts` (`extentAlong`).
- Test: `src/document/snapPoints.test.ts`, `src/document/explode.test.ts`, `src/viewport/framing.test.ts`

**Interfaces:**
- Consumes: `leanMap` (Task 1), `partGeometry` (`bodies.ts`).
- Produces:
  - `partBounds(b: Board): Bounds`: for an unleaned part it returns exactly `boardsBounds([b])`; for a leaning part, the
    min/max of every leaned body vertex.
  - `partsBounds(bs: readonly Board[]): Bounds | null`: returns `boardsBounds(bs)` when no part leans, so it is byte for
    byte unchanged.
  - Callers to switch: treeOps.ts:243, store.ts:1090 (group move), CopyInRow.tsx:55, sectionView.ts:38, Gizmo.tsx.
    `grep -rn boardsBounds src` must show only `worldBounds.ts` and `geometry.ts` afterwards.

- [ ] **Step 1: Failing tests:**
  - `partBounds reads the leaned bodies`: a leaning leg carrying a hand-made foot miter (any `face 'length'` cut). Its
    `partBounds` equals the min/max over `leanMap.apply` of every body vertex (1e-12), and differs from the pre-lean box.
    Task 6 adds the floor case.
  - `partsBounds without leans is boardsBounds`: `toBe`-equal numbers for a 5-part fixture.
  - `snap points of a leaning part`: the 26 lattice points are the `leanMap` images of the unleaned lattice. A foot
    corner snap point equals `apply(corner)`.
  - `stockProbe round trip`: a world point on a leaning part's face probes as stock.
  - `explode floor lift uses real bounds`: no exploded leaning part has world `min y < 0`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Each crossing checks `leanMap(b)`: when it is null, today's code runs unchanged; otherwise
  compose after today's world mapping. Update CLAUDE.md's `snapPoints.ts` rule text: "local→world is
  `position[axis] + toWorldOffset(...)`, then `leanMap(board).apply` for a leaning part".
- [ ] **Step 4: Run** `npm test < /dev/null` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Mutate:** have `partBounds` return the pre-lean box (fails the floor test).
- [ ] **Step 6: Commit** `feat(splayed-legs): world crossings compose the lean; real bounds`.

### Task 5: Store actions, refusals, resize and drag

**Files:**
- Modify: `src/store/store.ts`, `src/viewport/Gizmo.tsx`
- Test: `src/store/store.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `setLean(ids: string[], world: { rake?: number; splay?: number } | null): string | null`. The values are signed
    WORLD degrees: rake + is toward the front (+Z), splay + is toward the right (+X). `null` clears the lean. The return
    is a refusal or null.
    - It converts to world slopes, then to stored turn-0 slopes (inverse turn, and a flip per mirror on the path, via the
      existing world-edit lowering).
    - It sets `face` with `chooseFace` only when the part had no lean, and keeps it otherwise.
    - One undo entry. It refuses while `gesturing` or `readOnly()`.
  - `addHoleRows` refuses on a leaning part.
  - The posture change in `patchBoard` refuses on a leaning part.
  - `setLean` refuses on a holed part, a non-upright part, or past the bound, all before `edit()`.

- [ ] **Step 1: Failing tests:**
  - `setLean writes slopes`: rake 8, splay 12 on a turn-0 part gives stored `z = tan 8°` and `x = tan 12°` exactly (`toBe`).
  - `typing splay keeps rake bit for bit`: then `setLean(ids, { splay: 5 })` leaves `z` `toBe` the old value.
  - `world terms on a turned part`: on rotation 90, rake 8 gives a world `worldSlopes` z of tan 8° (1e-12).
  - Each refusal returns its verbatim text and pushes no undo entry: non-upright, holes, bound (rake 40 with splay 40),
    posture change, and `addHoleRows` on a leaning part.
  - `resize keeps the pivot`: on a leaning part, length 16 → 18 leaves `leanMap(after).pivot` equal to the before value
    (1e-12). Width 1.5 → 2 does the same.
  - `free drag of a levelled leg keeps the foot on the floor`: using Gizmo's commit helper (extract the delta rounding
    into a pure exported `dragTarget(start, raw, units, leaning)`), a raw delta of `[0.3, 0.01, 0.2]` on a part whose
    position is off-grid moves it by exactly `[snap(0.3), snap(0.01), snap(0.2)]`, and `partBounds(...).min[1]` stays 0
    (1e-12).
  - `group move with a leaning part rounds the delta`: the same property through the store's group move.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Resize keeps the pivot:** in `patchBoard`, when the part leans and a dimension changes, add a position delta so
    the pre-lean top-face centre is unchanged: `Δy = −ΔL` for length; `−Δ/2` on that dimension's world horizontal axis
    for width or thickness. An explicit `position` in the patch wins, as today.
  - **Drag rounding:** a single leaning part, or any group containing one, rounds the delta (inv 25 and inv 42 gain the
    clause in Task 13).
- [ ] **Step 4: Run** `npm test < /dev/null` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Mutate:**
  - round the corner instead of the delta (fails the drag test);
  - drop the resize delta (fails the pivot test).
- [ ] **Step 6: Commit** `feat(splayed-legs): setLean, refusals, resize keeps the pivot, drags round the delta`.

### Task 6: Level the ends

**Files:**
- Create: `src/document/levelEnds.ts`, `src/document/levelEnds.test.ts`
- Modify: `src/store/store.ts` (`levelEnds(id: string): string | null`)

**Interfaces:**
- Consumes: `leanMap`, `partBounds`, `snapStep`.
- Produces:
  - `levelPlan(world: Board, units: Units): { length: number; position: Vec3; angleCuts: AngleCut[] } | string`. It
    takes a world part and returns the new length, the new world pre-lean position and the full angle-cut list (the
    recognised end cuts replaced), or a refusal.
  - `isLevelled(world: Board, units: Units): boolean`: true when `levelPlan` would change nothing (1e-9).
  - `levelCutOf(c: AngleCut, lean: Lean): 'foot' | 'top' | null`: the recognition test. A cut is recognised when
    `kind === 'miter'`, `face === 'length'` and `along === lean.face`. `from: 'min'` is the foot and `'max'` is the top.

- [ ] **Step 1: Failing tests,** on the rake-8, splay-12 leg, length 16, pivot at y = 16:
  - `foot face on the floor`: after applying the plan, every vertex of the foot face of the leaned bodies has world
    `y = 0` (1e-9), and its world normal is `(0, −1, 0)` (1e-12).
  - `top face level through the old pivot`: every top-face vertex has `y = 16` (1e-9).
  - `the leaned axis is one line`: the old pivot lies on the new axis (distance 1e-9), and the new axis is parallel to the
    old.
  - `the length is a grid blank`: each end's change is rounded up; `length` is a multiple of 1/16 (exact `toBe` after ×16).
    A metric project gives a multiple of 1 mm.
  - `the foot is shortened when it runs past the floor`: a 30-long leg with its pivot at 16 gets `length < 30`, and its
    foot cut is the small wedge (depth ≤ `W·tan R + step`).
  - `cuts are read-only rows`: `miterFields(cut)` (`angleCuts.ts`) returns null for both.
  - The refusals, verbatim: an unrecognised end cut (a taper on the foot), a pivot at y = 0, and linked users with tops
    at 16 and 17.
  - `shared legs level together`: four users built by the spec §3.4 idiom (mirror and turn) all get floor feet and level
    tops in one undo entry.
  - `isLevelled goes false after a lean edit or a resize`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The algorithm:
  - `u` = the leaned axis up direction, `−normalize(wx, −1, wz)`.
  - Foot: `e_f = max over the 4 foot corners of y_c / u_y`. Top: `e_t = (P.y − min over the 4 top corners of y_c) / u_y`.
    Each is rounded up to the grid.
  - `L' = L + e_f + e_t`; the new pivot is `P' = P + e_t·u`; `position' = [P'.x − ext0/2, P'.y − L', P'.z − ext2/2]`.
  - Each end cut: `face 'length'`, `from 'min'` for the foot and `'max'` for the top, `along = lean.face`,
    `alongFrom 'min'`, `kind 'miter'`.
  - Its points are `[[0, d0], [A, dA]]`, where `A = board[lean.face]` and `d` is the length-wise distance from that end
    face to the plane at that station. Solve linearly with the leaned map: `y = 0` for the foot, `y = P.y` for the top.
  - Assert the plane's normal has zero component on the through dimension (1e-9), or refuse loudly. That is the §3.3
    guarantee.
  - The store action applies the plan to every user and placement (spec §5, "On a shared leg"). It refuses when the
    users' `P.y` differ by more than 1e-9, and writes one `edit()`.
- [ ] **Step 4: Run** `npm test < /dev/null` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Mutate:**
  - round down (fails the foot test);
  - keep the old pivot instead of `P'` (fails the one-line test).
- [ ] **Step 6: Commit** `feat(splayed-legs): Level the ends`.

### Task 7: Viewport

**Files:**
- Modify: `src/viewport/BoardMesh.tsx` (the part's `<group>` gets `matrix` from `leanMap`: pivot translation · m ·
  inverse pivot translation, composed with today's placement; `matrixAutoUpdate` handled so picking uses it);
  `src/viewport/Gizmo.tsx` (the handle at `partsBounds` centre)
- Test: none by design (inv 26a / viewport rule). Run `npm run build`.

- [ ] **Step 1: Implement.** Do not touch `boardUVSignature`, `partMesh` or the geometry memos: the lean is a group
  transform only.
- [ ] **Step 2: Run** `npm test < /dev/null` (the perf guards unchanged) and `npm run build`. Then make a quick dev-server
  check (`npm run dev -- --port 5180`): a leaning leg draws leaned, clicks select it, and the section plane clips it.
- [ ] **Step 3: Commit** `feat(splayed-legs): the viewport draws the lean`.

### Task 8: Properties — the Lean section

**Files:**
- Create: `src/panels/Lean.tsx`, `src/panels/Lean.test.tsx`
- Modify: `src/panels/Properties.tsx` (render `<Lean>` for one or more upright parts, inside `EditLock`);
  `src/panels/AngleField.tsx` (optional `min0?: boolean`, allowing 0 inclusive; existing callers unchanged)

**Interfaces:**
- Consumes: `setLean`, `levelEnds`, `isLevelled`, `resultantDeg`, `sightlineDeg`, `worldSlopes`.

- [ ] **Step 1: Failing tests:**
  - `shows world rake and splay`: a part with world slopes (tan 12°, −tan 8°) shows Rake `8.0°` `toward the back` and
    Splay `12.0°` `toward the right`, plus the readout `Resultant 14.3° · sightline 33.5° from the front edge`.
  - `typing rake commits once`, calling `setLean` with `{ rake: −8 }` when the select says back.
  - `a refusal is the field's own error`: a holed part shows the holes refusal text on the field.
  - `Level the ends and Clear lean` call their actions.
  - `the stale note shows` when `isLevelled` is false and the part has a recognised end cut.
  - `the position note shows` on a leaning part only.
  - `not shown on a flat part`.
  - `mixed values`: two parts with different rakes show an empty mixed field, and an untouched blur writes nothing
    (inv 5).
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** with `AngleField` (`min0`, `max 45`) plus a `<select>` per field. The direction select
  re-commits the current magnitude with the new sign.
- [ ] **Step 4: Run** `npm test < /dev/null` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Mutate:** swap the rake and splay axes (fails `shows world rake and splay`).
- [ ] **Step 6: Commit** `feat(splayed-legs): the Lean section`.

### Task 9: Drawings and the Plans sheet

**Files:**
- Modify:
  - `src/document/drawing.ts`: `worldBodies` skips the box fast path for a leaning part and maps vertices and normals
    by `leanMap`; `boardBox` uses `partBounds`; `silhouetteLines` and `curveEdgeLifts` receive
    `leanMap.inverseDir(view.toward)`; edges map through `toWorld`.
  - `src/document/featureKeys.ts` or `planKeys.ts`: the lean note line, built in the module, never the panel.
  - The Plans panel note rendering (follow how hole notes render under the figure).
- Test: `src/document/drawing.test.ts`, `src/document/plans.test.ts`, the existing `drawingIdentity.test.ts` unchanged

- [ ] **Step 1: Failing tests:**
  - `a leaning leg's Front view`: the drawn outline's lowest visible segment for a levelled leg lies on `y = 0`, and its
    endpoints equal the projected foot vertices (1e-9).
  - `dimension chains use real extents`: the Front view's overall height of a seat on levelled legs is the real height.
  - `the plans note`: the verbatim note for rake 8 front, splay 12 right, appearing once per part per sheet.
  - `lean-free drawings unchanged`: `drawingIdentity` passes untouched.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test < /dev/null` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Mutate:** pass the unmapped `view.toward` to `silhouetteLines` on a curved leaning fixture (a leg with a
  rounded-corner curve), which must fail a silhouette assertion you add for it.
- [ ] **Step 6: Commit** `feat(splayed-legs): drawings and Plans read the lean`.

### Task 10: Section caps on a leaning part

**Files:**
- Modify: `src/document/section.ts` (`sectionCaps`: for a leaning part, clip each convex body (`clipConvex`) by the world
  plane mapped into part-local coordinates by `inverse` / `inverseDir`, outline the cut polygons, and map them back with
  `apply`; the cache is keyed by the board's geometry key plus the lean's exact numbers)
- Test: `src/document/section.test.ts`

- [ ] **Step 1: Failing tests:**
  - `cap of a leaning leg`: a Front section through a leaning 1.5-square leg gives a polygon whose area is
    `1.5 × 1.5 / cos(angle between the leg axis and the plane normal)` (1e-9), lying in the plane.
  - `lean-free caps unchanged`: the existing cap tests pass untouched.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** Holes never occur on a leaning part in this chunk; assert that and skip the bore
  subtraction. A hand-loaded leaning part with holes draws its caps without bores and logs nothing.
- [ ] **Step 4: Run** `npm test < /dev/null` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Mutate:** skip the inverse mapping (fails the area test).
- [ ] **Step 6: Commit** `feat(splayed-legs): section caps on a leaning part`.

### Task 11: Design checks — extended, never weakened

**Files:**
- Create: `src/document/leanContacts.ts`, `src/document/leanContacts.test.ts`
- Modify: `src/document/designCheck.ts`
- Test: `src/document/designCheck.test.ts`

**Interfaces:**
- Produces:
  - `levelFaces(b: Board): { y: number; up: boolean; poly: [number, number][] }[]`: the leaned bodies' faces whose world
    normal has `|n_x|, |n_z| ≤ LEVEL_EPS`, with `poly` in (x, z).
  - `LEVEL_EPS = 1e-9`. Justify it in a comment: the level cuts are built from `leanMap` in one pass, so their normals
    carry ~1e-15 error; 0.5° is 8.7e-3.
  - `overlapArea(a, b): number`: convex polygon intersection area (Sutherland–Hodgman).

- [ ] **Step 1: Failing tests:**
  - `a levelled four-leg stool stands`: a 14 × 14 × 1.5 seat on four levelled legs built by the §3.4 idiom gives no
    `unsupported`, `hangs` or `tips` problem.
  - `an unlevelled leg is not grounded`: the same stool without Level gives an `unsupported` problem naming each leg.
  - `0.5° is not level`: a foot cut 0.5° off level is not in `levelFaces`, so the leg is `unsupported`. Mutate
    `LEVEL_EPS` to `1e-2` and it must fail.
  - `overlap on real bodies`: a leg whose levelled top is raised 0.25 into the seat reports `overlap`; a leg exactly
    touching reports none.
  - `the tip footprint includes leaning feet`: legs splayed outward pass `tips`, and the same seat on four legs leaning
    inward to a 2 × 2 footprint with a heavy overhanging part tips.
  - `lean-free check results unchanged`: snapshot the problems of the existing fixtures (`shakerTableFixture`), equal
    before and after.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Overlap and mass:** a pair with a leaning part goes through the real-bodies overlap path (`worldBodyFaces` with the
    lean), and `partMass` maps through the lean.
  - **Real bounds:** `boxesOf` takes a leaning part's box from `partBounds`, so `too-small`, `too-large` and the floor
    and distance tests read the real extent (spec §7.3).
  - **Contact, grounding, held, tip:** for any pair involving a leaning part, contact is "resting" only. That means a
    level down face of one and a level up face of the other within `TOUCH` in y, with `overlapArea > 0`.
  - **Grounded:** a level down face at `|y| ≤ TOUCH`.
  - **Feed the existing walks:** feed these into `groundedSet` (still the ONE walk), `isHeld` (resting clause only;
    coverage not consulted for a leaning pair) and the tip footprint (the floor polygons' bounding boxes).
  - **Leave unleaned pairs alone:** they take today's code untouched (the inv 39 PROHIBITION).
  - **Escalate an under-defined case** (a leaning part resting on another leaning part) as a question; do not guess.
- [ ] **Step 4: Run** `npm test < /dev/null` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Mutate:** as listed in Step 1, plus treat an edge contact as a contact (fails the unlevelled test).
- [ ] **Step 6: Commit** `feat(splayed-legs): design checks read leaning parts`.

### Task 12: Joinery and Repair refuse; Refine keeps

**Files:**
- Modify: `src/generate/joints/tapers.ts` (`joineryRefusal` returns the leaning refusal first; it is the one decider);
  `src/generate/run.ts` and the Repair entry (the Repair wording); `src/generate/refine.ts` (the keep, spec §8
  constraints (a)–(e)); `src/panels/RefineDialog.tsx` (the done-view line)
- Test: `src/generate/joints/tapers.test.ts`, `src/generate/refine.test.ts`

- [ ] **Step 1: Failing tests:**
  - `joinery refuses a leaning part`: the verbatim text; no mutation (the doc is `===` its input).
  - The Repair text and the joined Refine text, verbatim.
  - `Refine keeps a leaning leg`: a stub model returns the leg moved and resized, plus a renamed seat. The result's leg
    has an identical world pose (`leanMap` images of its corners equal, 1e-12), identical lean, cuts and Shape id. The
    seat is still on the leg tops (`designCheck` gives no `unsupported`). The done view lists `Kept as is (leans): Leg`.
  - `Refine floor rule with a kept leg`: no part moves relative to the kept legs.
  - `a model part reusing the kept name is dropped`, and the done view reports it.
  - `kept parts skip linkByRole`: its Shape id is unchanged.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.** The keep sits where inv 56's carry sits (before `migrateDocument` and `linkByRole`).
- [ ] **Step 4: Run** `npm test < /dev/null` and `npm run build`. Expected: PASS.
- [ ] **Step 5: Mutate:** apply the floor shift to the kept part (fails the floor test).
- [ ] **Step 6: Commit** `feat(splayed-legs): joinery refuses, Refine keeps leaning parts`.

### Task 13: Records

**Files:**
- Modify:
  - `docs/invariants.md`: a new invariant 57 in FULL (the lean's one home `lean.ts`; R1–R3; the pivot and `position`
    meaning; mirrors by `leanFlip` only; resize keeps the pivot; drags round the delta; checks extended, never
    weakened). Also clauses on invs 2, 24, 25, 38, 39, 42, 44, 45, 46, 51 and 56.
  - `CLAUDE.md`: the condensed inv 57 and condensed clauses, the Status, the test count, the "Where things live" row
    `lean | lean.ts, levelEnds.ts, leanContacts.ts, worldBounds.ts (inv 57)`, and the snapPoints rule. Keep it under
    ~60KB.
  - `docs/module-map.md`, `docs/versioning.md` (if not done in Task 2), `docs/rounds.md` (row and the rollback table:
    schema 22).
  - `docs/follow-ups.md`: new entries from 436 for automatic re-levelling, leaning parts with holes (chunk 2), the
    twist's 180° seam, and the multi-selection Lean if deferred.
  - `docs/feature-gaps.md`: the row status.
  - The spec's Status line.

- [ ] **Step 1: Write them.**
- [ ] **Step 2: Run** `npm test < /dev/null` and `npm run build`. Expected: PASS; record the test count.
- [ ] **Step 3: Commit** `docs(splayed-legs): invariant 57, records`.

### Task 14: Browser verification (dev server) and merge

- [ ] **Step 1: Run** `npm run dev -- --port 5180` and drive the Playwright browser (the user may watch). Leave test
  projects in place, and never clear the dev profile. Check:
  1. build a staked stool by the §3.4 idiom;
  2. the Lean fields, readout and notes;
  3. Level the ends;
  4. the design checks are clean;
  5. snapping onto a foot;
  6. a section through the legs;
  7. the Plans sheet with its note;
  8. exploded view;
  9. a drag of a levelled leg, which keeps the foot on the floor;
  10. Add joinery's refusal.
- [ ] **Step 2: Write** `docs/browser-verification-splayed-legs.md` (DOM readouts first, screenshots in `docs/img/` where
  a finding is spatial) and commit it.
- [ ] **Step 3: Merge:** `git checkout master && git merge --no-ff splayed-legs`. Run `npm test < /dev/null` and
  `npm run build` on the merged tree, then `git branch -d splayed-legs`. Commit the merge record in `docs/rounds.md`.
- [ ] **Step 4: Stop.** Deploying is a separate, user-approved step (`DEPLOYMENT.local.md`; schema 22 makes rolling back
  below it refuse new projects).
