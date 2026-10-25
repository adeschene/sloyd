# Stretchers (splayed legs chunk 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** With two upright legs selected, one action adds a level rung between them at a typed height, with a round tenon
on each end seated in an angled socket bored in each leg. A second action re-fits it after the legs change. Nothing new is
stored (no schema change).

**Architecture:**
- **`legSockets.ts`**: the bit-slope arithmetic of `socketRow` (a world direction and a mouth point into a single-hole row's
  flag-relative fields) is factored into ONE core, `boreRow`, which `socketRow` and the new `rungSocketRow` both call.
  `socketRow`'s output is byte for byte unchanged.
- **`stretchers.ts`** (new, pure, `document` layer) is the ONE home of the rung's geometry, the add plan, the structural
  finder (`rungLegAt`, `stretcherOf`) and the re-fit plan (with the linked closure). It imports `units` only for the
  height default's grid (`snapStep`, a TYPE-only `Units`); its strings live in `stretcherText.ts`, which takes the `→ units`
  edge (it formats lengths).
- **`store.ts`**: `addStretcher` and `fitStretcher`, each ONE `edit` through `mapWorld`, ending in `judgeHeld()`.
- **`panels/Stretcher.tsx`** (new): the multi-selection section and the rung's readout.

**Tech Stack:** TypeScript, React, Zustand, Vitest (`npx vitest run <file>`), and `npm run build` (the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-25-sloyd-stretchers-design.md` (APPROVED 2026-10-25). Read it first. Where this
plan and the spec differ, the spec wins and the difference is reported.

## Global Constraints

- **No schema change.** `CURRENT_VERSION` stays 24; `types.ts` gains no field. A project without a stretcher is byte for
  byte as before: every existing test passes unchanged, and `socketRow` / `socketPlan` / Bore leg sockets return exactly
  what they return today (a pinned literal test, Task 1).
- The rung is an ordinary part: posture `flat`, its length along world X (turn 0) or Z (turn 90), section width ×
  thickness = the rung size, `tenons` = one `min` and one `max` `RoundTenon`. Its sockets are ordinary single-hole blind
  `HoleRow`s on the legs (a linked leg's on its Shape, inv 45).
- Geometry (spec §3), all comparisons at `1e-9` unless stated:
  - the rung's axis joins the points where the two legs' `partAxis` lines cross `y = h`; they must differ in exactly one of
    X and Z to **1e-6**; the axis is then made exactly axis-aligned (its cross coordinate the two points' midpoint, Y = h);
  - stock length `L = D` rounded DOWN to the drag grid (`snapStep`: 1/16", 1 mm), centred between the axis points;
  - shoulder-to-shoulder `S = D − sA − sB` rounded DOWN to the same grid, its slack split evenly;
  - each tenon's length is what that placement leaves (exact; the two sum to `L − S`);
  - each socket: blind, along the exact rung axis, entering the leg face whose outward normal is nearest the direction
    toward the other leg, depth along the bit from the mouth to the tenon tip rounded UP to `TENON_STEP`
    (`roundTenons.ts`: 1/64", 0.1 mm).
- Defaults: Height = one third of the lower leg's top height (its axis's highest world Y), rounded to the grid, stepped up
  by 1-1/2" (metric 40 mm) while either leg already has a socket the new one would meet; Rung size 1" (25 mm); Tenon
  diameter 5/8" (16 mm).
- Copy (verbatim; one home `stretcherText.ts` for the new ones):
  - not square: `These legs aren't square to each other at that height — a stretcher must run straight along the front, back or sides.`
  - out of reach: `<Leg> doesn't reach that height.`
  - containers: `Select two legs in the same assembly.`
  - mirrored copy: `A stretcher can't join a leg inside a mirrored copy yet: <Leg>.`
  - socket fault: `<Leg>'s socket would <words> — choose a different height, or a smaller tenon.` (`<words>` as
    `socketFaulted`'s)
  - too steep: `socketTooSteep(<Leg>)` (existing)
  - too wide: `A round tenon must be narrower than the part's section.` (existing `tenonText.ts`)
  - a different socket: `<Leg> already has a different socket there — remove it first.`
  - link note (one line per part): `<Part> got this socket too, through its link.`
  - readout: `Between <A> and <B>, <h> up · shoulder gap up to <g>`
  - stale: `No longer fits <A> and <B> — Fit the stretcher again.`
  - closure disagreement: `These linked legs need their shared socket in different places: <rung names>.`
  - turned rung: `<Rung> would now run the other way — add it again.`
  - ambiguous socket: `<Leg> has two sockets this tenon could be in — remove one.`
  - section heading `Stretcher`; fields `Height`, `Rung size`, `Tenon diameter`; buttons `Add stretcher`,
    `Fit the stretcher again`.
  - Lengths in sentences through `units/length.ts` (`formatLength`, the document's units, inv 52).
- Layer order: `document` imports nothing from `store`, `generate`, `panels` or `viewport`.
- Every refusal is decided before any mutation. Each action is ONE undo entry, refused while exploded (inv 47) or while
  gesturing. A refusal changes nothing.
- On the dev server: no `localStorage.clear()`; test projects stay. No paid runs are needed.

## Review Focus

1. **Linked legs (the stool fixture's).** Adding the front rung bores Back left's and Back right's copies too; adding the
   back rung then REUSES them (no second row; the rung seats at 1e-9). Fit again on one rung re-fits both, one undo entry
   (Tasks 2, 3).
2. **Two rungs at one height in one leg** refuse with the socket-fault sentence (`meets-hole`), and the panel's default
   height steps up so a second Add at the default succeeds (Tasks 2, 5).
3. **A metric project**: the length on the 1 mm grid, the tenon tip short of the axis by under 0.5 mm, the readout in mm
   (Tasks 2, 5).
4. **Unleaned upright legs** (a plain table's): square sockets (no tilt keys stored), the same rung rule, the check clean
   (Task 2).
5. **Undo** after Add or Fit again restores the document exactly (`toEqual` the before), and held points survive (Task 4).

---

### Task 1: One bore core

**Files:**
- Modify: `src/document/legSockets.ts`
- Test: `src/document/legSockets.test.ts`

**Interfaces:**
- Produces:
  - `boreRow(holder: Board, face: Dimension, from: CutFrom, mouth: V3, dir: V3, diameter: number, depth: number | 'through'): Omit<HoleRow, 'id'>`:
    `mouth` a world point on the entry face, `dir` a world direction pointing INTO the holder. The shared arithmetic of
    today's `socketRow`: `fromWorld` of the mouth and of `mouth + dir`, the bit scaled to axial ±1, `along` by `othersOf`,
    the nearer-end flags, the flag-relative slopes, a zero slope omitted.
  - `socketRow(seat, leg, diameter)` calls it with `depth: 'through'` and is unchanged in behaviour.
  - `rungSocketRow(leg: Board, line: WorldAxis, towardOther: V3, diameter: number, tip: V3, step: number): Omit<HoleRow, 'id'> | string`:
    the entry face per Global Constraints; the mouth where `line` crosses that face; depth = |tip − mouth| along the bit,
    rounded UP to `step`; `socketTooSteep(leg.name)` past `withinTiltBound`.

- [ ] **Step 1: Failing tests:**
  - every Bore leg sockets row on the stool (4 legs) `toEqual` a literal captured BEFORE the refactor (paste it from a run at
    HEAD), and every existing `legSockets.test.ts` case passes;
  - `rungSocketRow` on Front right along the front rung's line at h = 6: `boreAlongAxis(leg, row, line)` true;
    `seatedIn` true for a tenon of that diameter whose tip is `tip` (build the rung by hand in the test);
  - on an unleaned upright leg: no `tiltAlong` / `tiltAcross` key;
  - a line 50° off the entry face's normal: the steep sentence.
- [ ] **Step 2–4:** FAIL, implement, `npx vitest run src/document/legSockets.test.ts` PASS.
- [ ] **Step 5: Commit** `refactor(stretchers): one bore core for seat and rung sockets`.

### Task 2: `stretchers.ts` — the rung and the add plan

**Files:**
- Create: `src/document/stretchers.ts`, `src/document/stretcherText.ts`, `src/document/stretchers.test.ts`

**Interfaces:**
- Consumes: `partAxis`, `boreRow`/`rungSocketRow` (Task 1), `seatedIn`, `tenonFaults`, `TENON_STEP`, `holeFaults`,
  `leanMap`, `worldParts`, `flatDocument`.
- Produces:
  - `rungLine(a: Board, b: Board, h: number): { p0: V3; p1: V3; axis: 0 | 2 } | string` — exact axis-aligned (Global
    Constraints); refusals not-square, out-of-reach.
  - `shoulderStation(leg: Board, line: { p0: V3; p1: V3 }, size: number, atStart: boolean): number` — spec §3.3: the
    largest distance from the end's axis point, over the 4 corner lines, to where that line leaves the leg's leaned bodies
    (`partGeometry` bodies through the lean; convex, so clip each line against each body's planes).
  - `stretcherPlan(doc: SloydDocument, legIds: [string, string], o: { height: number; size: number; diameter: number }):
    { rung: Board; legs: { id: string; holes: HoleRow[] }[]; notes: string[]; gap: number } | string` — the new rung (no id
    collision: `nextId`; name via `uniqueName` in the legs' container), each leg's full hole list with its socket added or
    reused (Review Focus 1: reuse when the planned tenon is `seatedIn` an existing row), the link notes, the larger shoulder
    gap. Every refusal of Global Constraints, decided here.
  - `defaultHeight(doc, legIds, diameter): number` (Global Constraints' stagger).
- `stretcherText.ts`: every new sentence above, as constants or small functions.

- [ ] **Step 1: Failing tests** (on `stoolDocument()` unless stated):
  - front rung (Front right, Front left) at h = 6: the rung runs along X, level (both tenons' axis points at y = 6 to
    1e-9); `L` and `S` are multiples of 1/16 to 1e-9; each tip lies short of its leg axis by (D − L)/2; every shoulder
    corner is outside the leg's bodies (a probe 1e-6 inside the shoulder plane at each corner is not in the leg);
  - apply the plan by hand and run `tenonJoints(flatDocument(...))`: 2 joints for the rung; `checkDesign` clean;
  - the four legs' Shapes: Front right's socket also appears on Back left (shared); notes name `Back left` and `Back right`;
  - then the back rung at h = 6: it REUSES those rows (hole counts unchanged), 4 rung joints in all, the check clean;
  - a side rung at h = 6 with the front rung present: refused with the socket-fault sentence (`meets-hole`);
    `defaultHeight` returns 6 + 1-1/2 there;
  - legs not square (one leg nudged 0.01 in Z): the not-square sentence; h above a leg's top: out-of-reach naming it;
    diameter ≥ size: the too-wide sentence; legs in two assemblies: the container sentence; a leg reached through a mirrored
    instance: the mirrored-copy sentence naming it;
  - Review Focus 3 (metric document) and 4 (two unleaned upright legs 12" apart: no tilt keys, `L = 12 − ...` exact);
  - each refusal test mutated once (the condition removed) fails.
- [ ] **Step 2–4:** FAIL, implement, `npx vitest run src/document/stretchers.test.ts` PASS.
- [ ] **Step 5: Commit** `feat(stretchers): the rung and the add plan`.

### Task 3: The finder and the re-fit

**Files:**
- Modify: `src/document/stretchers.ts`, `src/document/stretchers.test.ts`

**Interfaces:**
- Produces:
  - `rungLegAt(world: readonly Board[], rung: Board, t: RoundTenon): Board | null` — spec §6.2: the upright part other
    than the rung whose leaned world bodies the tenon's centre segment meets to `TOUCH`, first in world order.
  - `stretcherOf(world: readonly Board[], rung: Board): { legs: [Board, Board]; height: number; seated: boolean } | null` —
    non-null only for an unleaned rung whose two tenons find two different upright legs; `seated` when both tenons are
    `seatedIn` a row of their leg.
  - `refitPlan(doc: SloydDocument, rungId: string): { rungs: { id: string; patch: Partial<Board> }[]; legs: { id: string;
    holes: HoleRow[] }[] } | string` — the closure of spec §6.3; each rung re-planned at its own height through
    Task 2's geometry; sockets moved IN PLACE (ids kept: the seated row, or once stale the single blind bore of the
    tenon's diameter nearest the tip; a tie refuses); tenon ids kept; a rung whose axis now runs along the other world
    axis refuses (turned-rung sentence); shared rows that disagree refuse (closure sentence).

- [ ] **Step 1: Failing tests:**
  - after adding front and back rungs, Front right's rake 8 → 10 then Level the ends (`levelPlan`): `stretcherOf` finds both
    rungs, `seated` false; `refitPlan(front)` re-plans BOTH rungs (closure), every id kept, then 4 joints, the check clean;
  - `refitPlan` on a fitted rung changes nothing (`toEqual`);
  - a rung whose tenon misses every leg (moved 3" away): `stretcherOf` null;
  - a hand-made duplicate socket: the ambiguous-socket sentence;
  - an asymmetric linked case (Back left's rung at another height sharing the row): the closure sentence, nothing planned;
  - each refusal mutated once fails.
- [ ] **Step 2–4:** FAIL, implement, PASS.
- [ ] **Step 5: Commit** `feat(stretchers): find a stretcher's legs and fit it again`.

### Task 4: Store actions

**Files:**
- Modify: `src/store/store.ts`
- Test: `src/store/store.stretchers.test.ts` (new)

**Interfaces:**
- `addStretcher(legIds: [string, string], height: number, size: number, diameter: number): string | null` — null on
  success (the rung selected through `selectionPatch`), else the refusal sentence. ONE `edit`: the rung added to the legs'
  container through the write-back (a root part at the root), each leg's holes written through `mapWorld` (a linked leg
  once, on its Shape), then `judgeHeld()`. Refused (`null` never) while exploded or gesturing, with the existing sentences.
- `fitStretcher(rungId: string): string | null` — `refitPlan` written in ONE `edit`; a fitted rung is a no-op that takes no
  undo entry.

- [ ] **Step 1: Failing tests:**
  - add front rung on the stool document: one undo entry; undo restores `toEqual` the before; redo re-applies;
  - the store result agrees with `stretcherPlan` (same rung fields, same rows);
  - inside an assembly (the stool grouped): the rung is a sibling of the legs, the world result the same as at the root;
  - exploded: refused, nothing changed; a held tape point on a leg survives Add (inv 24, `judgeHeld`);
  - `fitStretcher` after a rake edit + Level the ends: one entry, the check clean.
- [ ] **Step 2–4:** FAIL, implement, `npx vitest run src/store` PASS.
- [ ] **Step 5: Commit** `feat(stretchers): store actions`.

### Task 5: The panels

**Files:**
- Create: `src/panels/Stretcher.tsx`, `src/panels/Stretcher.test.tsx`
- Modify: `src/panels/Properties.tsx` (mount the section in the multi-selection panel when exactly two upright parts are
  selected; mount the rung readout in the single-part panel under Round tenons when `stretcherOf` is non-null)

**Interfaces:**
- The section: three `DimensionField`s (Height, Rung size, Tenon diameter; defaults per Global Constraints, Height through
  `defaultHeight`), `Add stretcher`, its refusal as `role="alert"` (cleared on any field change), the link notes after a
  success. Inside `EditLock` (inv 47).
- The readout: `Between …` when `seated`, else the stale sentence and `Fit the stretcher again`; its refusal as an alert.
  Selectors return primitives or memo over `worldParts` (inv 43's rule: never return a fresh array from a selector).

- [ ] **Step 1: Failing tests:** the section shows only for two upright parts (not one, not three, not a flat part); the
  default height and its stagger; Add selects the rung; a refusal shows verbatim and changes nothing; the readout's two
  states; Fit clears the stale state; a metric project's readout in mm.
- [ ] **Step 2–4:** FAIL, implement, `npx vitest run src/panels` PASS; `npm run build` passes.
- [ ] **Step 5: Commit** `feat(stretchers): the Stretcher section and the rung readout`.

### Task 6: Records

- `docs/invariants.md`: invariant **59** in full (or a stretcher clause in 58, the builder's call by size; say which):
  Add stretcher and Fit again are ONE planner (`stretchers.ts`); the rung is found structurally (`rungLegAt`), never stored;
  sockets along the exact axis; the bore core is shared with Bore leg sockets; no check changes. Inv 50's Bore leg sockets
  line names the shared `boreRow`.
- `CLAUDE.md`: the condensed invariant; the holes/lean row of the homes table gains `stretchers.ts`; the `→ units` edge
  sentence names `stretcherText.ts`; the test count. **Stay ≤ 60,000 bytes** (`wc -c`), moving detail, never rules.
- `docs/module-map.md`, `docs/rounds.md` (the round row: no schema change, rollback free), `docs/follow-ups.md` (438
  closed; the spec §11 follow-ups added; any deferred review minor), `docs/feature-gaps.md`'s row, the spec's status line
  and an *Amended (build)* block for any ruling made during the build (awaiting the user's approval).
- [ ] **Step 1:** Write them; `npx vitest run` and `npm run build` pass; record the counts in `docs/rounds.md`.
- [ ] **Step 2: Commit** `docs(stretchers): records`.

### Task 7: Browser verification (dev server, Playwright)

Write `docs/browser-verification-stretchers.md`, screenshots `docs/img/stretchers-*.png`. On the dev server (leave the test
project in place):

1. Import the stool, Bore leg sockets with Tenon the legs. Select Front right and Front left: the Stretcher section with
   its defaults; Add stretcher: the rung appears, level, selected, with the link note naming the back legs.
2. Select Back left and Back right: Add at the default: the sockets are reused (the legs' hole rows unchanged in count).
3. Add the two side rungs at the staggered default. The design check is clean (four stretcher joints plus the four seat
   joints); the cut list's rung lines and the legs' socket lines; the readout's shoulder gap.
4. 3D and a section through a rung's height; the Plans sheet.
5. Front right's rake 8 → 10, Level the ends: the rung's stale note; Fit the stretcher again: both front/back rungs re-fitted
   in one undo entry, the check clean. Undo, redo.
6. A refusal: Add between Front right and Back left (not square); and at a height above the legs.
7. `npm run build` exits 0; the console has 0 errors.

Record PASS/FAIL per check, and any finding as a follow-up.
- [ ] **Step 1:** Run and write it. **Step 2: Commit** `docs(stretchers): browser verification`.
