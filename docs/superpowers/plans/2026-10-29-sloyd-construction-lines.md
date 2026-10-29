# Construction lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Axis-parallel construction lines (schema 31). You place one with the Tape tool
(anchor, X/Y/Z, Enter with nothing typed). It is drawn across the scene and listed with the
guides. The Tape and Move tools snap anywhere along it (the along-line coordinate
grid-rounded) and exactly where two lines cross.

**Architecture:** A line is a `Guide` with an `axis`, kept in the existing `guides` array.
Its along-axis coordinate is stored as 0 (canonical). `GuidePoint.axis?: undefined` makes
the compiler find every reader that assumes points. Crossings are discrete candidates owned
by `{ type: 'guide', id, cross }`. Sliding is a THREE-free picker (`pickOnLine`) that runs
only when no discrete candidate is in range. Both Enter sites share one decider,
`tapeLineFor`.

**Tech Stack:** TypeScript, React, three.js (react-three-fiber), Zustand, Vitest
(`npx vitest run <file>`), `npm run build` (the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-29-sloyd-construction-lines-design.md` (APPROVED
2026-10-29). Read it first. Where this plan and the spec differ, the spec wins and you
report the difference. The plan amends it in two places (below), and Task 8 writes those
amendments into the spec.

**Branch:** `construction-lines` off `master`. Merge with `git merge --no-ff`, no PR.

## Amendments to the spec (decided while planning; recorded in the spec in Task 8)

- **A1 (§3.3, duplicate line).** The spec says a duplicate clears the anchor and shows a
  `'duplicate-line'` error. But `TapeReadout` renders nothing once the anchor clears, so that
  hint could never be seen, and App's Enter path has no error channel at all. Instead: a
  duplicate is a no-op that **keeps** the anchor and axis. The hint is DERIVED, not an error
  state: while locked with nothing typed, the readout computes `tapeLineFor(...)`. If an
  equal line already exists it reads `Along X — that line is already there; type a
  distance`. There is no `'duplicate-line'` `TapeError`. Both Enter sites behave the same.
- **A2 (§5, explode).** `GuideMarkers` is mounted only when `showGuides && explode === 0`.
  Lines use the same condition, so they are hidden while exploded rather than drawn
  unmoved. Save image draws guide markers (they are not gated on `clean`), so it draws lines
  too.

## Global Constraints

- **A project with no lines behaves exactly as before.** Every existing test passes,
  except the version-pinned assertions that Task 1 bumps (30→31, and the "newer" probe
  31→32).
- Stored shape: `GuideLine { id: string; at: [number, number, number]; axis: 'x' | 'y' | 'z' }`,
  with `at[axis] === 0` always. A point is `GuidePoint { id; at; axis?: undefined }` and is
  stored as `{ id, at }` with no `axis` key.
- `CURRENT_VERSION` 31. The 30→31 step adds nothing. A 30 build refuses a 31 file through
  the existing "newer version of Sloyd" path.
- Two lines are equal when `axis` and all three `at` values are `===`. A crossing is found
  by `===`, never an epsilon.
- A slid point: its along-axis coordinate goes through `snapToGrid(v, doc.units)`
  (`document/geometry.ts`). The other two coordinates are the line's own, exact.
- Copy, verbatim:
  - readout hint, locked + nothing typed: `Along X — Enter for a line, or type a distance`
    (axis letter uppercased)
  - the same, when the line already exists: `Along X — that line is already there; type a distance`
  - locked + typed (unchanged): `Along X — Enter to place`
  - list row: `Line along X · Y 12" · Z 3 1/2"` (the two fixed axes in X, Y, Z order, values via
    `formatLength(v, units)`)
  - remove label: `Remove line along X at Y 12", Z 3 1/2"`
  - empty list: `No guides. Use the Tape tool to place a point or a line.`
  - Tape button title: the current title + `; lock X, Y or Z and press Enter for a construction line`
    (inside the sentence, before ` (T)`)
  - Guides toggle title: `Show guide points and lines`
- Layer order: `document/` never imports `viewport/`. `SCENE_EXTENT` (`viewport/extent.ts`,
  120) is passed into `document` functions as a parameter.
- Inv 27: the new Enter branch lives inside App's ONE keydown effect. The modifier test is
  part of the condition, and the branch respects the modal flag the same way the
  neighbouring tape branches do.

## Review Focus

1. **Looking straight down a line** (the camera ray parallel to it). A line seen end-on must
   offer no slide candidate, and must never produce a NaN position. Test in Task 3.
2. **A line through a part's corner.** Hovering there must pick the CORNER (exact), not a
   grid-rounded slide point a hair away. Test in Task 3 (`pickGuided`).
3. **Removing a line that a held tape point crosses on.** An anchor that is the crossing of
   A and B must drop when A *or* B is removed, and survive removal of C. Test in Task 4.
4. **A metric project.** Slide rounding must land on whole millimetres (`k / 25.4` exactly),
   and the list prints mm. Tests in Tasks 3 and 7.
5. **Enter where it must do nothing**: Ctrl+Enter, Enter with a modal open, Enter on the
   Select tool, Enter anchored without a lock. None may place a line or alter today's
   behaviour. Test in Task 5.

---

### Task 1: Schema 31 — the `GuideLine` type and the loader

**Files:**
- Modify: `src/document/types.ts:342-346` (`GuidePoint`), `:438` (`guides`)
- Modify: `src/document/document.ts:260` (`CURRENT_VERSION`), `:907-936` (`validateGuides`), its exports
- Modify: `src/document/snapPoints.ts:477` (`guideSnapPoints` takes `Guide[]`, returns points only)
- Modify: `src/viewport/GuideMarkers.tsx`, `src/viewport/moveCandidates.ts:39` (types only)
- Create: `src/document/guideLines.test.ts`
- Modify: every test with a version-pinned assertion (see Step 5)

**Interfaces:**
- Produces: `type TapeAxis` (already in `snapPoints.ts`; `types.ts` imports or redeclares it
  without making a cycle; the builder picks one home); `interface GuideLine`;
  `type Guide = GuidePoint | GuideLine`; `isGuideLine(g: Guide): g is GuideLine`;
  `isGuidePoint(g: Guide): g is GuidePoint`. All exported from `document/document.ts`.
  `SloydDocument.guides: Guide[]`. `validateGuides(raw: unknown): Guide[]`.

- [ ] **Step 1: Write the failing tests** in `src/document/guideLines.test.ts`
  (`describe('schema 31: construction lines (construction-lines spec §2)')`):
  - `CURRENT_VERSION` is 31; `migrateDocument({ ...createDocument('T'), version: 32 })` throws `/newer version of Sloyd/`.
  - A 30 file with points `[{ id: 'g1', at: [1, 2, 3] }]` loads to exactly that, with no `axis` key
    (`expect(Object.keys(g)).toEqual(['id', 'at'])`).
  - `{ id: 'l1', at: [7, 2, 3], axis: 'x' }` loads to `{ id: 'l1', at: [0, 2, 3], axis: 'x' }`. Same for `'y'` (index 1)
    and `'z'` (index 2).
  - Dropped: `axis: 'w'`, `axis: 1`, `axis: null`, a line with a non-finite `at`, a line with no id.
  - A point and a line sharing id `'g1'`: the first keeps it, and the second is re-minted (not `'g1'`).
  - Two equal lines in a file are both KEPT (the loader repairs ids, not content).
  - `isGuideLine` / `isGuidePoint` on each kind.
- [ ] **Step 2: Run** `npx vitest run src/document/guideLines.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The types per the Interfaces. `GuidePoint` gains
  `axis?: undefined` with the spec's §2.3 comment. `validateGuides` keeps today's point path
  byte for byte. When `'axis' in g` and `g.axis !== undefined`: require `'x' | 'y' | 'z'`,
  else drop. A line's `at` gets its axis index set to 0. `CURRENT_VERSION = 31`, with a
  comment line for 30→31 beside the existing ones. `guideSnapPoints(guides: Guide[])` maps
  `guides.filter(isGuidePoint)`.
- [ ] **Step 4: Run** `npx vitest run src/document/guideLines.test.ts`. Expected: PASS.
- [ ] **Step 5: Bump the version-pinned assertions.** Run `npx vitest run src/document` and
  update ONLY assertions that fail because they pin 30 as current (`toBe(30)` on
  `CURRENT_VERSION` or `doc.version`) or use 31 as the "newer" probe (→ 32). The exact files
  are listed by `grep -rln "version: 31\|CURRENT_VERSION).toBe(30)\|version).toBe(30)" src`.
  Do not touch unrelated `toBe(30)` lengths (e.g. `stretch.test.ts`).
- [ ] **Step 6: Typecheck.** `npm run build`. Every compile error at a `Guide[]` →
  `GuidePoint[]` boundary gets a filter (`isGuidePoint`) or a widened parameter type, never
  a cast. `GuideMarkers` already goes through `guideSnapPoints`. `moveCandidates`' param
  becomes `Guide[]`. Expected: build passes.
- [ ] **Step 7: Full suite** `npm test`. Expected: all pass (re-run quiet if a timing guard flakes).
- [ ] **Step 8: Commit** `feat(lines): schema 31 — GuideLine in guides, canonical at[axis] = 0`

### Task 2: Snap-point helpers — crossings, the owner's `cross`, `tapeLineFor`

**Files:**
- Modify: `src/document/snapPoints.ts` (`SnapKind`, `SnapOwner`, `sameSnapPoint`, new functions); export from `document.ts`
- Modify: `src/viewport/SnapMarker.tsx:36` (`SNAP_COLORS` gains the two kinds; `Record<SnapKind, …>` forces it)
- Test: `src/document/guideLines.test.ts` (new `describe`s)

**Interfaces:**
- Consumes: Task 1's `Guide`, `GuideLine`, `isGuideLine`.
- Produces:
  - `SnapKind` += `'line' | 'line-cross'`
  - `SnapOwner` = `{ type: 'board'; id: string } | { type: 'guide'; id: string; cross?: string }`
  - `canonicalLine(at: [number, number, number], axis: TapeAxis): { at: [number, number, number]; axis: TapeAxis }` (a copy with `at[axis] = 0`)
  - `sameLine(a: { at; axis }, b: { at; axis }): boolean` (axis and all three `at` values `===`)
  - `lineCrossings(guides: Guide[], extent: number): SnapPoint[]`
  - `guideCandidates(guides: Guide[], extent: number): SnapPoint[]` = `[...guideSnapPoints(guides), ...lineCrossings(guides, extent)]` (the ONE list both tools offer)
  - `tapeLineFor(anchor: [number, number, number] | null, axis: TapeAxis | null, typed: string): { at: [number, number, number]; axis: TapeAxis } | null`
  - `ownedByGuide(p: SnapPoint | null, id: string): boolean` (`p.owner.type === 'guide' && (p.owner.id === id || p.owner.cross === id)`)

- [ ] **Step 1: Write the failing tests:**
  - `lineCrossings`: X line `at [0, 5, 2]` and Z line `at [3, 5, 0]` give exactly one point,
    `{ kind: 'line-cross', at: [3, 5, 2], owner: { type: 'guide', id: <X's id>, cross: <Z's id> } }`
    (first in array order is `id`). With the Z line at `y = 5 + Number.EPSILON * 8` there is
    no crossing. Two X lines never cross. Points are ignored. A crossing with a coordinate
    beyond `±extent` is not offered (extent 120, a Z line at x = 121). Three mutually
    crossing lines (X, Y, Z through one point) give 3 candidates, each pair once.
  - `sameSnapPoint` distinguishes two crossings that differ only in `cross`.
  - `tapeLineFor`: null without an anchor, without an axis, or with `typed` `'3'`. `'  '`
    counts as empty. With anchor `[4, 5, 6]` and `'y'`, `''` gives `{ at: [4, 0, 6], axis: 'y' }`,
    and the anchor array is not mutated.
  - `ownedByGuide` for `id`, for `cross`, for a board-owned point, for null.
- [ ] **Step 2: Run** `npx vitest run src/document/guideLines.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `lineCrossings`, a pair of different axes `(a, b)` crosses
  when they agree on the third axis `k` (the one that is neither `a.axis` nor `b.axis`):
  `a.at[k] === b.at[k]`. The point takes `b`'s value on `a.axis`, `a`'s value on `b.axis`, and
  the shared value on `k`. `sameSnapPoint` adds `a.owner.cross === b.owner.cross` (read
  through a narrowing on `type === 'guide'`). Update `SnapOwner`'s doc comment: `cross`
  exists only on a crossing, and "owned by guide G" means `ownedByGuide`. `SNAP_COLORS`: two
  hues from the guide family (builder's pick; Task 9 shows them to the user).
- [ ] **Step 4: Mutate.** Change `===` to `<=`, drop the extent test, and emit both pair
  orders. Each mutation must turn a test red. Restore.
- [ ] **Step 5: Run** `npx vitest run src/document/guideLines.test.ts && npm run build`. Expected: PASS, build passes.
- [ ] **Step 6: Commit** `feat(lines): crossings, the guide owner's cross, tapeLineFor`

### Task 3: `pickOnLine` and the composed picker

**Files:**
- Modify: `src/viewport/snapPick.ts`
- Test: `src/viewport/snapPick.test.ts` (new `describe`s, same stub-`Projector` style as the existing ones)

**Interfaces:**
- Consumes: `GuideLine`, `isGuideLine`, `snapToGrid` (`document/geometry.ts`), `Units`.
- Produces:
  - `type Vec3 = [number, number, number]`
  - `pickOnLine(lines: GuideLine[], project: Projector, cursor: { x: number; y: number }, ray: { origin: Vec3; dir: Vec3 }, radiusPx: number, units: Units, extent: number): SnapPoint | null`
  - `pickGuided(candidates: SnapPoint[], lines: GuideLine[], project: Projector, cursor: { x: number; y: number }, ray: { origin: Vec3; dir: Vec3 }, radiusPx: number, units: Units, extent: number): SnapPoint | null` = `pickSnapPoint(candidates, …) ?? pickOnLine(lines, …)`

- [ ] **Step 1: Write the failing tests** with a top-down orthographic stub (`project = at => ({ x: at[0] * 10, y: at[2] * 10, depth: -at[1] })`, `ray = { origin: [cx/10, 100, cy/10], dir: [0, -1, 0] }`):
  - An X line at `[0, 0, 2]`, cursor at `(73.4, 20)` (world x = 7.34): picks `at [7.375, 0, 2]`
    (`snapToGrid(7.34)` imperial = 118/16 = 7.375), `kind 'line'`, `owner { type: 'guide', id }`.
    Exactly that value, and `at[1]`/`at[2]` exactly the line's own.
  - Metric units, the same cursor: `at[0] === Math.round(7.34 * 25.4) / 25.4`.
  - Cursor 13 px from the line (radius 12): null.
  - Two X lines at z = 2 and z = 2.5, cursor nearer the second: picks the second.
  - **Parallel ray**: a Y line viewed by this top-down camera (its direction is the ray's): null, and no NaN anywhere.
  - Closest point beyond the extent (cursor at world x = 130, extent 120): the along coordinate clamps to 120, then rounds.
  - `pickGuided`: a board corner candidate at `[7, 0, 2]` on the line, cursor 3 px from it:
    returns the CORNER (the discrete candidate), not a slide point. With the corner outside
    the radius, it returns the slide point.
- [ ] **Step 2: Run** `npx vitest run src/viewport/snapPick.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** The closest approach between the line `P + t·e` (`e` the unit
  axis, `P = line.at`) and the ray `O + s·d`: with `w = P − O`, `b = e·d`, `c = d·d`,
  `p = e·w`, `q = d·w`, `den = c − b²` (since `e·e = 1`). Parallel when
  `den <= 1e-9 * c` → no candidate. Otherwise `t = (b·q − c·p) / den` (the along-axis world
  coordinate, because `P[axis] = 0`). Clamp `t` to `[−extent, extent]`. Project the
  UNROUNDED point for the screen test (≤ radius; null from the projector culls it). Ties
  break by screen distance, then depth, the way `pickSnapPoint` does. The returned `at` is
  the line's `at` with `[axis] = snapToGrid(t, units)`.
- [ ] **Step 4: Mutate.** Remove the parallel guard (the parallel test must go red or show
  NaN), and skip `snapToGrid` (the rounding test goes red). Restore.
- [ ] **Step 5: Run** `npx vitest run src/viewport/snapPick.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(lines): pickOnLine and pickGuided — slide along a line, discrete points first`

### Task 4: Store — `addGuideLine`, removal drops crossings, Refine carries lines

**Files:**
- Modify: `src/store/store.ts` (interface beside `addGuide` `:627`; action beside `addGuide` `:2634`; `removeGuide` `:2695-2722`; `tapeHover`'s declaration comment `~:210-232`)
- Create: `src/store/guideLines.test.ts`
- Test: Refine's carry in the existing `src/generate/run.test.ts` (or whichever test file covers `run.ts:319`/`:389`; find with `grep -ln "guides" src/generate/*.test.ts`)

**Interfaces:**
- Consumes: `canonicalLine`, `sameLine`, `ownedByGuide`, `isGuideLine`.
- Produces: `addGuideLine: (at: [number, number, number], axis: TapeAxis) => boolean` (true when a line was added).

- [ ] **Step 1: Write the failing tests:**
  - `addGuideLine([4, 5, 6], 'x')` returns true; `doc.guides` ends with
    `{ id: <any string>, at: [0, 5, 6], axis: 'x' }`; one undo entry (undo removes it, redo
    restores it); `selectedIds` unchanged.
  - The same call again returns false: `doc` is the same object (`toBe`), the undo stack
    depth is unchanged, and a pending redo survives (undo something first, then the
    duplicate add, then redo still works). Assert the stack, never a flag (inv 34).
  - Exploded (`setExplode(0.5)`): returns false, nothing changes.
  - With anchor = a crossing `{ owner: { type: 'guide', id: A, cross: B } }` and hover = a slide on C:
    `removeGuide(B)` clears `tapeAnchor` and `tapeAxis` but keeps `tapeHover`. In a fresh
    setup, `removeGuide(D)` (an unrelated line) leaves all three.
  - `removeGuide(C)` clears the hover only.
  - Refine's carry: the existing carry test's fixture gains a line, and the refined doc's
    `guides` still contain it (both `run.ts` sites, if the existing tests reach both).
- [ ] **Step 2: Run** `npx vitest run src/store/guideLines.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `addGuideLine`: `readOnly()` refuses → false. Canonicalise.
  If `doc.guides.some(g => isGuideLine(g) && sameLine(g, line))` → false (before `edit()`).
  Otherwise `edit(doc => ({ ...doc, guides: [...doc.guides, { id: nextId(), ...line }] }))`
  → true (use whatever id minting `createGuide` uses). `removeGuide`'s two clauses change
  from the hand-written `owner.type === 'guide' && owner.id === id` to `ownedByGuide(…, id)`.
  At `tapeHover`'s declaration add one sentence: a guide-owned point may be a crossing
  (`owner.cross`), and removal tests both ids through `ownedByGuide`. Do not restate the
  writer list.
- [ ] **Step 4: Mutate.** Revert `removeGuide` to the `id`-only test; the `removeGuide(B)` case must go red. Restore.
- [ ] **Step 5: Run** `npx vitest run src/store src/generate`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(lines): addGuideLine; removing a line drops a crossing held on it`

### Task 5: Placing a line — readout, App's Enter, the hint

**Files:**
- Modify: `src/panels/TapeReadout.tsx` (`commit()` `:127-154`, hint `:243-245`)
- Modify: `src/App.tsx` (the keydown effect, beside the tape axis branch `~:766`)
- Test: `src/panels/TapeReadout.test.tsx`, `src/App.test.tsx` (the `App type-anywhere tape capture` describe)

**Interfaces:**
- Consumes: `tapeLineFor`, `sameLine`, `isGuideLine`, `addGuideLine`, `clearTapeAnchor`.

- [ ] **Step 1: Write the failing tests:**
  - Readout: anchored at `[1, 2, 3]`, axis `'z'`, empty text, Enter in the input → `doc.guides`
    gains `{ at: [1, 2, 0], axis: 'z' }`, and the anchor and axis clear. No error is shown.
  - Readout: the same with that line already present → no new guide; the anchor and axis
    STAY; the hint reads `Along Z — that line is already there; type a distance`.
  - Readout: locked with nothing typed, no such line → hint `Along Z — Enter for a line, or type a distance`;
    after typing `3` → `Along Z — Enter to place` (unchanged).
  - Readout: anchored, NO axis, empty Enter → the `unparseable` error as today, no guide.
  - Readout: locked, `3` typed, Enter → a guide POINT 3" along Z (unchanged).
  - App: tape tool, anchored, axis `'x'`, nothing typed, focus on `document.body`, Enter
    keydown on window → a line is added. The same with `ctrlKey`, with a modal open (use
    whatever the existing tape tests use for `modalOpen`), on the Select tool, or anchored
    without an axis → no guide, nothing else changes.
- [ ] **Step 2: Run** `npx vitest run src/panels/TapeReadout.test.tsx src/App.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** `commit()` first does
  `const line = tapeLineFor(from.at, store.tapeAxis, text)`. If it is non-null:
  `if (store.addGuideLine(line.at, line.axis)) store.clearTapeAnchor(); return;`. Otherwise
  it takes the point path unchanged. The hint derives `duplicate` in render from
  `tapeLineFor` + `doc.guides` (subscribe to `doc.guides`, inv 15's subscription rule). In
  App, the Enter branch takes the same condition shape as the axis branch (`!e.ctrlKey &&
  !e.metaKey && !e.altKey`, and add `!e.shiftKey`): tool is tape, anchored, `tapeLineFor(...)`
  non-null → `preventDefault`, add, and clear the anchor on true. Otherwise fall through.
- [ ] **Step 4: Run** the two test files. Expected: PASS. Then `npm run build`.
- [ ] **Step 5: Commit** `feat(lines): Enter with nothing typed under an axis lock places a line`

### Task 6: The tools snap to lines

**Files:**
- Modify: `src/viewport/TapeTool.tsx` (candidates memo `~:120-128`; the three `pickSnapPoint` call sites `~:171, 195`, and any other; `project` `~:140`)
- Modify: `src/viewport/MoveTool.tsx`, `src/viewport/moveCandidates.ts:58`
- Test: `src/viewport/moveCandidates.test.ts`

**Interfaces:**
- Consumes: `guideCandidates`, `pickGuided`, `isGuideLine`, `SCENE_EXTENT`.

- [ ] **Step 1: Write the failing test** in `moveCandidates.test.ts`: grabbing with
  `showGuides` and two crossing lines → the list contains the `'line-cross'` point. Not
  grabbing → it does not. `showGuides` false → it does not.
- [ ] **Step 2: Run** `npx vitest run src/viewport/moveCandidates.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** `moveCandidates`' grabbing branch uses
  `guideCandidates(guides, SCENE_EXTENT)` in place of `guideSnapPoints(guides)`. `TapeTool`'s
  memo does the same (its section filter already exempts `owner.type === 'guide'`). In both
  tools, every `pickSnapPoint(candidates, project, cursor, PICK_RADIUS_PX)` becomes
  `pickGuided(candidates, lines, project, cursor, rayOf(e), PICK_RADIUS_PX, units, SCENE_EXTENT)`,
  where `lines` is `showGuides ? guides.filter(isGuideLine) : []` (memoised beside the
  candidates). In MoveTool, `lines` is `[]` before a grab: lines are targets, never grab
  sources (inv 26). `rayOf(e)` builds NDC from the same canvas coordinates `cursorOf` uses
  and calls a module-level reused `THREE.Raycaster`'s `setFromCamera(ndc, camera)`,
  returning `{ origin, dir }` as arrays. `units` comes from `useStore(s => s.doc.units)`.
- [ ] **Step 4: Run** `npx vitest run src/viewport && npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lines): Tape and Move snap along lines and to crossings`

### Task 7: Drawing, the preview, the list, the tooltips

**Files:**
- Create: `src/viewport/GuideLines.tsx`
- Modify: `src/viewport/OriginAxes.tsx` (export `AXIS_COLOR`; share the dash-scale `useFrame` if it can be lifted without changing OriginAxes' behaviour; otherwise call the same `dashScaleForScreenPeriod`/`screenPixelsPerInch` helpers)
- Modify: `src/viewport/Viewport.tsx:630` (mount beside `GuideMarkers`, same condition)
- Modify: `src/viewport/TapeTool.tsx` (the §3.5 preview)
- Modify: `src/panels/GuidesList.tsx`, `src/panels/ViewportControls.tsx:125,146`
- Test: `src/panels/GuidesList.test.tsx`, `src/panels/ViewportControls.test.tsx` (copy only)

**Interfaces:**
- Produces: `GuideLines()` (reads `doc.guides`) and `ConstructionLine({ at, axis, preview }: { at: Vec3; axis: TapeAxis; preview?: boolean })`, both exported from `GuideLines.tsx`.

- [ ] **Step 1: Write the failing tests:**
  - `GuidesList` (imperial): a line `{ at: [0, 12, 3.5], axis: 'x' }` renders `Line along X · Y 12" · Z 3 1/2"`
    and a button labelled `Remove line along X at Y 12", Z 3 1/2"`; clicking it removes the
    line. A Y line prints X and Z, in that order. Metric: `{ at: [0, 300 / 25.4, 0], axis: 'z' }`
    prints the mm form `formatLength` gives. Points render exactly as before. Empty → the new
    empty text.
  - `ViewportControls`: the two titles, verbatim.
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `GuideLines`: one dashed `LineSegments` (or drei `Line` in OriginAxes' idiom) per axis
    colour, memoised on `guides`. Each line runs from `at` with `[axis] = −SCENE_EXTENT` to
    `+SCENE_EXTENT`. Depth-tested, reduced opacity (builder's value, for the user to judge),
    not clipped by the section plane (follow whatever `GuideMarkers`/`SnapMarker` do about
    `clippingPlanes`). Mounted with `showGuides && explode === 0` (A2).
  - The preview in `TapeTool`: when `anchor && axis && typed.trim() === ''`, render
    `<ConstructionLine {...tapeLineFor(anchor.at, axis, typed)!} preview />` (stronger
    opacity). `lineEnd` keeps returning null in that state. Replace the comment that calls
    the empty state a non-goal with one citing this spec's §3.5.
  - `GuidesList`: the row and label per Global Constraints, branching on `isGuideLine`.
  - `ViewportControls`: the two titles.
- [ ] **Step 4: Run** the tests and `npm run build`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(lines): draw lines, preview the line under a lock, list them`

### Task 8: Docs

**Files:** `docs/invariants.md`, `CLAUDE.md`, `docs/module-map.md`, `docs/versioning.md`, `docs/follow-ups.md`, `docs/feature-gaps.md`, the spec

- [ ] **Step 1:** `docs/versioning.md`: the intro's `CURRENT_VERSION` becomes **31**, plus a 30→31 row (spec §2.4: what is kept, zeroed, dropped; harm: "a 30 build loads a line as a guide point at `at` and autosaves it — the line lost, a stray point near the origin. So a 31 file must be refused by a 30 build. Rollback past this round refuses every project saved at 31: export first").
- [ ] **Step 2:** `docs/invariants.md`, in full: inv 24 (crossings, `cross`, `ownedByGuide`), inv 25 (crossing exact; slid point rounds the along-line coordinate only), inv 33 (lines share `guides`' `takeId` scope). CLAUDE.md gets the condensed forms. Its Versioning paragraph and `CURRENT_VERSION` become 31 ("31, construction lines: a guide's `axis`"). The fu 556 line changes "schema 31 now" to "schema 32 now". A "Where things live" row: `construction lines | snapPoints.ts (lineCrossings, tapeLineFor), snapPick.ts pickOnLine, GuideLines.tsx (inv 24, 25)`.
- [ ] **Step 3:** `docs/module-map.md`: `GuideLines.tsx` (new), plus the changed roles of `snapPoints.ts` and `snapPick.ts`.
- [ ] **Step 4:** `docs/follow-ups.md`: 130's construction-lines bullet gains a `**Status:**` line (shipped by this round; the residue below). New entries 578–582, each `**Status:** open (feature; ask first)`: oblique lines; a line at a typed offset in one gesture; moving or editing a line; a line meeting a part's face as a snap point; lines on the Plans sheet. CLAUDE.md's open-follow-up list gets them under feature-sized.
- [ ] **Step 5:** The spec gets an `## Amended (plan)` block with A1 and A2, verbatim from this plan. `docs/feature-gaps.md`'s construction-lines row gets status "merged (construction lines, schema 31)", to be updated at deploy.
- [ ] **Step 6:** `npm test && npm run build`. Expected: all pass. Commit `docs(lines): invariants, versioning, module map, follow-ups 578–582`

### Task 9: Browser verification (with the user)

**Files:** Create `docs/browser-verification-construction-lines.md`

- [ ] **Step 1:** Run the dev server on 5199 (the browser memory has the setup). Drive the
  user's Chrome over claude-in-chrome on a NEW test project. Leave it in place afterwards
  (dev profile rule).
- [ ] **Step 2:** Check, recording a DOM or store readout for each: lines on all three axes
  from a part corner; the preview under a lock; the duplicate hint; sliding the tape along a
  line (the readout's distance lands on 1/16" steps); anchoring on a crossing; moving a
  part's corner onto a line and onto a crossing (the part's position exact); toggling
  Guides; the section cut; exploded (lines hidden, list locked); undo and redo; the list;
  reload (autosave); a metric project's list and slide.
- [ ] **Step 3:** By eye, the user's: line colour and opacity, depth behaviour, the two
  marker hues. Record their rulings.
- [ ] **Step 4:** Commit the verification doc. Then merge (`git merge --no-ff construction-lines`),
  run `npm test && npm run build` on the merged tree, and delete the branch. Deploy per
  `DEPLOYMENT.local.md` only on the user's go-ahead.
