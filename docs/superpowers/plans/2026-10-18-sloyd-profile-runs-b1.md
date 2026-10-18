# Profile runs, chunk b1 (a profile follows the outline) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a profile follows the part's outline. End to end on a side that an Arch, notch, Bow or Rounded corner has cut follows
that side's stretch, and carries round its corner arcs to run out at the far tangent points (B1). All round follows the whole
outline. It is built, shaded, edged, drawn, faulted, worded, keyed and edited like the straight profiles a1/a2 ship, and saved
projects pick it up on load (B10).

**Architecture:**
- **One path home.** `document/profilePath.ts` (new) is the ONE place a run becomes a path: the face outline, a side's stretch,
  the run's path, and the decision straight vs swept (Q2).
- **One view.** `geometryBoard` keeps straight profiles as a1/a2's view curves, byte for byte. Its `profiles` now holds exactly
  the swept ones (Q1). Every routing gate reads one predicate, `shapedPart`.
- **One construction home.** `document/sweep.ts` (new) is the ONE place a swept profile becomes geometry. It builds the outline's
  skeleton bands × the kept section, plus the rest of the outline. `boardBodies` intersects the bodies with those pieces (Q3).
  It follows the probe in `docs/superpowers/plans/b1-probe/probe.ts.txt`.
- **The readers learn the swept form:**
  - edges (`smoothPair` both ways), mesh normals, the stock probe and hole faults;
  - the Plans sheet (fine paths, facet-chain silhouettes, lifts, tags), part diagrams, words, keys;
  - the row and presets, and Curves' refusals.

**Tech Stack:** TypeScript, React, Zustand, Vitest. `npm test` does NOT typecheck. `npm run build` (`tsc -b && vite build`) is
the gate.

**Spec:** `docs/superpowers/specs/2026-10-17-sloyd-profile-runs-design.md`. Read these before any task:
- §1: R6–R10, the chunk b rulings B1–B10, and the **planning rulings for b1, Q1–Q8**;
- §3.3, §4, §5, §6, each amended where marked *(B)*.

**The probe** (`docs/superpowers/plans/b1-probe/`): `probe.ts.txt` is throwaway and runs as `npx tsx`; rename it to `.ts` in a
scratch directory to run it. It holds the reference construction (`faceOutline`, `skeleton`, `section`, `bandPiece`, `build`),
the independent oracle (`pathOracle`, `oracleVolume`, `pointwise`) and its cases. `results.txt` holds its numbers. Port from it;
do not import it.

## Global Constraints

- **No schema bump** (18). The stored form is unchanged. b1 lifts the loader's refusal of `{loop: true}` and nothing else. Ends
  on two sides still refuse (b2).
- **Byte for byte:** a part whose view holds no swept profile has every reader's output unchanged. `profilesView.test.ts`,
  `drawingIdentity.test.ts`, `bodyMeshIdentity.test.ts` and every a2 test pass UNTOUCHED (a test may gain cases, never lose or
  change one).
- **Swept** (Q2): a loop, or an End to end run whose side's stretch is not that side's single straight segment. A station run is
  a2's construction on any side in b1.
- **Paths (§3.3 *(B)*):**
  - The outer outline only (R8).
  - A side's stretch runs between its corners. A corner is a sharp rectangle corner or a corner arc. At a sharp corner the run
    goes out through the end face; at a corner arc it carries round the arc and stops at the far tangent point, where a2's run-out
    applies (B1).
- **Construction (Q3):** bodies stay CONVEX (inv 48). The first swept profile starts from the curve-free cells, and
  through-thickness curves are not applied again. Each piece is intersected (`clip`), never subtracted. A body no piece's box
  reaches keeps its object.
- **Tags (Q5):**
  - a vertical plane on an outline chord carries `curve: <curve id>`;
  - a section face carries `profileEdge: profileEdgeName(<profile id>, a, b)` (a2's builder) and `sweep: <segment index>`.
- **Faults (Q6):** `runs-off`, `too-tight` (convex arc radius < reach; concave arc radius < `BEARING` = 0.25), `stop-off`, and
  `overlap` on outline stretches.
  - Authoring refuses an ADDED fault.
  - A fault a later edit or resize causes is KEPT and noted (`… at this size.`, `— check: …`), never clamped.
  - A faulted swept profile builds nothing; the part draws without it.
- **Words (Q7):**
  - End to end reads as today, plus `, round the corners` when its path takes a corner arc.
  - All round reads `<profileName> all round <faceName('thickness', face)><filletWords>`.
  - Keys: `<profileName><fillet>, all round` / `…, round the corners`.
  - Order: curves, then straight profiles, then swept, each in stored order.
- **Paper (B8):** crease lines along a path ARC are drawn at `DRAWING_CURVE_TOLERANCE` (0.001"), with visibility on the model
  chord (inv 47). The profile's own arcs across the sweep, and run-outs, stay model chords (P19).
- **Performance (Q4):** `curvesPerf.test.ts`' method (minimum of 9, fresh `geometryKey` per run, bodies + edges + mesh), each
  case on the fixtures below:

  | Case | Guard |
  |---|---|
  | Roundover 1/4" along the arched apron | ≤ 40 ms |
  | Roundover 1/4" all round the 2" and 1/2" corner tops | ≤ 40 ms |
  | Roundover 3/8" round the notch | ≤ 40 ms |
  | Thumbnail all round the 2" top | ≤ 40 ms |
  | Bead all round the 2" top | ≤ 40 ms |
  | Roundover End to end on the front of the 2" top (B1 run-outs) | ≤ 40 ms |
  | Cove all round the 2" top | ≤ 80 ms |
  | Ogee all round the 2" top | ≤ 105 ms |

  **Close the Playwright browser before any full-suite run** (a2: its GPU process at ~250% CPU failed wall-clock guards).
- **Watertight (inv 50):** every swept case has 0 unmatched directed edges, holes included.
- **Invariants touched:** 16, 44, 47, 48, 50, 53 (written into CLAUDE.md in Task 10). Never `board[dim] - x` at a call site;
  stations go through `endPos`.
- **Process:**
  - Commit after each task with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `profile-runs-b1`, from master.
  - Mutate every refusal, ordering and "cannot exceed" test (the project rule: plan-supplied tests have been wrong more than ten
    times).

**Fixtures** (every task uses these; build them in `src/document/sweepFixtures.ts`, TEST-ONLY, in Task 1):

| Name | Part | Curves | Profile |
|---|---|---|---|
| `apronArch` | 30 × 5 × 3/4 | `archCurve({through:'thickness', along:'length', side:'min', from:'min', start:3, span:24, rise:1.25})` | 1/4" roundover, face max, End to end on side `{across:'width', from:'min'}` |
| `topCorners(r)` | 36 × 20 × 3/4 | four `cornerCurve({through:'thickness', uFrom, vFrom, radius:r})`, r = 2 or 1/2 | loop, face max |
| `notchEdge` | 30 × 5 × 3/4 | half-round notch, `archCurve` with rise = span/2 = 1, start 14 | 3/8" roundover End to end on that side |
| `frontOnly` | as `topCorners(2)` | — | End to end on `{across:'width', from:'min'}` |

`sweepFixtures.ts` is a test-only module. Never import a test module from it (CLAUDE.md: it re-registers its suite).

## Review Focus

1. **A swept profile on a mirrored or turned copy:** the world wood must be the mirror image of the original's. Task 3 pins it
   with a chiral pose (`chiralCurved`'s arch on one side, mirrored along length and through thickness).
2. **Editing the curve under a profile:**
   - Growing a rounded corner or an arch re-routes the profile.
   - A corner shrunk under the reach is refused in Curves when it ADDS `too-tight`.
   - A resize that causes the fault keeps it, noted.
   - Task 2 pins the faults; Task 9 pins the Curves refusal and the row's note.
3. **A hole near a swept band:** refused when it would meet the band (plus reach) and allowed once clear. Task 4 pins both
   sides of the boundary, on an arc stretch.
4. **Two swept profiles on one part:** All round the top AND All round the bottom (same outline). Both build, the result is
   watertight, and the time is measured. Task 3 pins wood; Task 5 pins watertight and records the time (guard at measured
   plus 25% if over 40).
5. **A swept profile with a dado and a chamfer on the same part:** pieces intersect cells that cuts and angle cuts already
   shaped. Task 3 pins wood against the oracle with the box cut's and plane's air included; Task 5 pins watertight.

---

### Task 1: `profilePath.ts` — the face outline, a side's stretch, the path

**Files:**
- Create: `src/document/profilePath.ts`, `src/document/profilePath.test.ts`, `src/document/sweepFixtures.ts`
- Read: `src/document/curves.ts` (`curveOutline`, `localSegments`, `arcOf`, `inPolygonClosed`, `twiceArea`, `P2`); the probe's
  `faceOutline` (probe.ts.txt:99-136)

**Interfaces:**
- Produces:
  ```ts
  /** One chord of the face outline, board-local (u = length, v = width), CCW looking at the max face. */
  export interface OutlineChord { a: P2; b: P2; curve?: string; arc?: { c: P2; r: number; concave: boolean } }
  export interface FaceOutline { chords: OutlineChord[] }          // closed loop, CCW, chord i ends where i+1 starts
  export function faceOutline(board: Pick<Board, Dimension | 'curves'>): FaceOutline | null;   // null: not one simple loop
  /** A side's stretch: the chord index range [from, to] (inclusive, may wrap), and how each end ends. */
  export interface Stretch { from: number; to: number; startEnd: 'sharp' | 'arc'; endEnd: 'sharp' | 'arc' }
  export function sideStretch(board, outline: FaceOutline, side: ProfileSide): Stretch | null;
  export interface ProfilePath { chords: OutlineChord[]; loop: boolean; ends?: [PathEnd, PathEnd] }
  export type PathEnd = { kind: 'through'; ray: P2 } | { kind: 'station'; at: P2; tangent: P2; side: ProfileSide };
  export function profilePath(board, p: ProfileCut): ProfilePath | null;   // in the FACE's frame (see below)
  export function isSwept(board, p: ProfileCut): boolean;                   // Q2
  ```
- **The face's frame:** the outline is computed on the plan (length × width) and is the same for both faces. `profilePath` returns
  it CCW as seen from OUTSIDE `p.face`, reversed for `face: 'min'`, so travel (spec §3.1) matches.

- [ ] **Step 1: Fixtures.** Write `sweepFixtures.ts`:
  ```ts
  import { createBoard } from './document';
  import { archCurve, cornerCurve } from './curves';
  import type { Board, ProfileCut, ProfileSide } from './types';
  const side = (across: 'length' | 'width', from: 'min' | 'max'): ProfileSide => ({ across, from });
  export const endToEnd = (id: string, s: ProfileSide, size = 0.25, kind: ProfileCut['kind'] = 'roundover'): ProfileCut =>
    ({ id, face: 'max', kind, size, fillet: 0, facing: 'face', run: { start: { side: s, through: 'min' }, end: { side: { ...s }, through: 'max' } } });
  export const loop = (id: string, size = 0.25, kind: ProfileCut['kind'] = 'roundover', face: 'min' | 'max' = 'max'): ProfileCut =>
    ({ id, face, kind, size, ...(kind === 'thumbnail' ? { depth: 0.25 } : { fillet: kind === 'bead' ? 1 / 16 : 0 }), facing: 'face', run: { loop: true } });
  export const stopped = (id: string, s: ProfileSide, lo: number, hi: number): ProfileCut =>
    ({ ...endToEnd(id, s), run: { start: { side: s, from: 'min', at: lo }, end: { side: { ...s }, from: 'min', at: hi } } });
  export const apronArch: Board = createBoard({ length: 30, width: 5, thickness: 0.75,
    curves: [{ id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }) }],
    profiles: [endToEnd('p1', side('width', 'min'))] });
  const corners = (r: number) => (['min', 'max'] as const).flatMap((u) => (['min', 'max'] as const).map((v) =>
    ({ id: `c${u}${v}`, ...cornerCurve({ through: 'thickness', uFrom: u, vFrom: v, radius: r }) })));
  export const topCorners = (r: number, p: ProfileCut = loop('p1')): Board =>
    createBoard({ length: 36, width: 20, thickness: 0.75, curves: corners(r), profiles: [p] });
  export const notchEdge: Board = createBoard({ length: 30, width: 5, thickness: 0.75,
    curves: [{ id: 'c1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 }) }],
    profiles: [endToEnd('p1', side('width', 'min'), 0.375)] });
  export const frontOnly: Board = topCorners(2, endToEnd('p1', side('width', 'min')));
  /** A plain 30 × 10 × 3/4 part: an End to end on its uncut top long edge (straight) and a loop (swept: the mitred rectangle). */
  export const straightTopLong = endToEnd('s1', side('width', 'max'));
  export const plainLoop: Board = createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [loop('w1')] });
  ```
  Check every fixture loads through `migrateDocument` unchanged except for the loop, which loads only once Task 2 lifts the
  refusal. Until then, build fixtures with `createBoard` only, never through the loader.

- [ ] **Step 2: Write the failing tests** (`profilePath.test.ts`):
  ```ts
  import { describe, expect, it } from 'vitest';
  import { faceOutline, isSwept, profilePath, sideStretch } from './profilePath';
  import { apronArch, topCorners, frontOnly, notchEdge, endToEnd, loop, stopped, straightTopLong, plainLoop } from './sweepFixtures';
  import { createBoard } from './document';
  import { twiceArea } from './curves';

  const pts = (o: NonNullable<ReturnType<typeof faceOutline>>) => o.chords.map((c) => c.a);
  describe('faceOutline', () => {
    it('is the rectangle, CCW, for a part with no thickness curves', () => {
      const o = faceOutline(createBoard({ length: 30, width: 5, thickness: 0.75 }))!;
      expect(pts(o)).toEqual([[0, 0], [30, 0], [30, 5], [0, 5]]);
    });
    it('splices an arch chain in, each chord carrying the curve id; area = rectangle − arch waste', () => {
      const o = faceOutline(apronArch)!;
      const arcs = o.chords.filter((c) => c.curve === 'c1');
      expect(arcs.length).toBeGreaterThan(8);
      expect(arcs.every((c) => c.arc && c.arc.concave)).toBe(true);
      // the arch segment's area: circular segment of chord 24, rise 1.25
      const R = (12 * 12 + 1.25 * 1.25) / (2 * 1.25), th = 2 * Math.asin(12 / R), seg = (R * R / 2) * (th - Math.sin(th));
      expect(twiceArea(pts(o)) / 2).toBeCloseTo(30 * 5 - seg, 2);    // chords: within CURVE_TOLERANCE × arc length
    });
    it('rounds four corners: convex arcs, area = rectangle − 4(r² − πr²/4)', () => {
      const o = faceOutline(topCorners(2))!;
      expect(o.chords.filter((c) => c.arc).every((c) => !c.arc!.concave)).toBe(true);
      expect(twiceArea(pts(o)) / 2).toBeCloseTo(36 * 20 - 4 * (4 - Math.PI), 1);
    });
  });
  describe('sideStretch (§3.3 (B))', () => {
    it('an arched side runs corner to corner through the arch; both ends sharp', () => {
      const s = sideStretch(apronArch, faceOutline(apronArch)!, { across: 'width', from: 'min' })!;
      expect([s.startEnd, s.endEnd]).toEqual(['sharp', 'sharp']);
    });
    it('a side between two corner arcs carries round both (B1): ends are arc', () => {
      const s = sideStretch(frontOnly, faceOutline(frontOnly)!, { across: 'width', from: 'min' })!;
      expect([s.startEnd, s.endEnd]).toEqual(['arc', 'arc']);
    });
  });
  describe('isSwept (Q2)', () => {
    it('End to end on an uncut side with sharp corners is straight', () => {
      const b = createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [straightTopLong] });
      expect(isSwept(b, straightTopLong)).toBe(false);
      // the apron's OTHER long side (width max) is uncut: straight too
      expect(isSwept(apronArch, endToEnd('q', { across: 'width', from: 'max' }))).toBe(false);
    });
    it('the arched side, the cornered side and every loop are swept', () => {
      expect(isSwept(apronArch, apronArch.profiles[0]!)).toBe(true);
      expect(isSwept(frontOnly, frontOnly.profiles[0]!)).toBe(true);
      expect(isSwept(topCorners(2), topCorners(2).profiles[0]!)).toBe(true);
    });
    it('a station run is never swept in b1 (a2 builds it)', () => {
      expect(isSwept(apronArch, stopped('q', { across: 'width', from: 'min' }, 5, 25))).toBe(false);
    });
    it('a plain part\'s loop is swept', () => { expect(isSwept(plainLoop, plainLoop.profiles[0]!)).toBe(true); });
  });
  describe('profilePath', () => {
    it('a loop is the whole outline, CCW from outside the face (reversed for face min)', () => {
      const b = topCorners(2);
      const max = profilePath(b, loop('a'))!, min = profilePath(b, loop('b', 0.25, 'roundover', 'min'))!;
      expect(max.loop).toBe(true);
      expect(max.chords.length).toBe(faceOutline(b)!.chords.length);
      expect(min.chords.map((c) => [c.b, c.a])).toEqual(max.chords.slice().reverse().map((c) => [c.a, c.b]));
    });
    it('the cornered front ends at stations on the end sides at the far tangent points, tangent along the end side', () => {
      const p = profilePath(frontOnly, frontOnly.profiles[0]!)!;
      const [s, e] = p.ends!;
      expect(s.kind).toBe('station'); expect(e.kind).toBe('station');
      // face max, CCW: the front (width min) runs +x; its stretch starts at the length-min end's tangent point (0, 2) and
      // ends at the length-max end's (36, 2). `tangent` points AWAY from the run, where the run-out lies: +y at both.
      if (s.kind !== 'station' || e.kind !== 'station') throw new Error('unreachable');
      expect(s.at[0]).toBeCloseTo(0, 12); expect(s.at[1]).toBeCloseTo(2, 12);
      expect(e.at[0]).toBeCloseTo(36, 12); expect(e.at[1]).toBeCloseTo(2, 12);
      expect(s.tangent).toEqual([0, 1]); expect(e.tangent).toEqual([0, 1]);
      expect(s.side).toEqual({ across: 'length', from: 'min' }); expect(e.side).toEqual({ across: 'length', from: 'max' });
    });
    it('a sharp-cornered end is a through end whose ray runs along the end face into the part', () => {
      const p = profilePath(apronArch, apronArch.profiles[0]!)!;
      const [s, e] = p.ends!;
      if (s.kind !== 'through' || e.kind !== 'through') throw new Error('expected through ends');
      expect(s.ray).toEqual([0, 1]); expect(e.ray).toEqual([0, 1]);   // along x = 0 and x = 30, into the width
    });
  });
  ```
  Mutation: reverse the loop for `face: 'min'` or not, swap `'arc'`/`'sharp'`, and drop the corner arcs from a stretch; the tests
  must catch each.

- [ ] **Step 3: Run:** `npx vitest run src/document/profilePath.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 4: Implement.**
  - `faceOutline`: port probe.ts.txt:99-136. Take each curve with `through === 'thickness'`: its `curveOutline` chord chain
    (the run of `arcEdge` chords), spliced into the rectangle's perimeter.
    - Carry `curve: c.id`.
    - Carry `arc: { c, r, concave }` from `localSegments`/`arcOf` (the TRUE arc's centre and radius). An arc is concave when its
      centre lies outside the kept wood.
    - Return null when two curves' perimeter intervals overlap, a chain does not start and end on the boundary, or the result is
      not CCW (a `cuts-through` or `runs-off` curve: the profile then faults `runs-off`, Q6).
    - Memoise per part (WeakMap on the stored board object) and deep-freeze.
  - `sideStretch`: the chords whose geometry lies on the side's rectangle edge, plus every curve chain whose BOTH perimeter
    endpoints lie on that edge (an arch, notch, bow). A corner arc (a chain from this edge to an adjacent one) is added at each
    end and marks that end `'arc'` (B1).
  - `profilePath`:
    - A loop is every chord.
    - End to end is `sideStretch`'s chords. At a sharp end, `{kind: 'through', ray}`, the ray running along the end face out of
      the wood (the probe's `endRays`). At an arc end, `{kind: 'station', at: <far tangent point>, tangent, side: <the adjacent
      side>}`.
    - Reverse for `face: 'min'`.
  - `isSwept`: `'loop' in p.run`, or an End to end run whose stretch is not exactly one chord.

- [ ] **Step 5: Run** the test again. Expected: PASS. Mutate per Step 2's note; restore.

- [ ] **Step 6: Commit.** `git add src/document/profilePath.ts src/document/profilePath.test.ts src/document/sweepFixtures.ts && git commit -m "profilePath: the face outline, a side's stretch and a run's path (profile runs b1)"`

---

### Task 2: The view, the loader, faults, memo keys and the routing gate

**Files:**
- Modify: `src/document/profiles.ts` (`geometryBoard`, `profileFaults`, `viewProfileFaults`), `src/document/document.ts`
  (`validateProfiles` :548-604), `src/document/curveText.ts` (`profileFaultText`, `profileFaultNote`), `src/document/bodies.ts`
  (`geometryKey`, `edgesOf`), `src/viewport/grainTiling.ts` (`boardUVSignature`, `drawsAsBox`, `bodyMesh`'s `curved`),
  `src/document/cutlist.ts` (`curveSignature`), `src/document/drawing.ts:182`, `src/document/snapPoints.ts:150`,
  `src/document/curveDrawing.ts:184,327`, `src/viewport/BoardMesh.tsx:287`
- Test: `src/document/profilesLoad.test.ts`, `src/document/profiles.test.ts`, `src/document/sweepView.test.ts` (new)

**Interfaces:**
- Consumes: `isSwept`, `faceOutline`, `profilePath`, `sideStretch` (Task 1).
- Produces:
  ```ts
  // profiles.ts
  export function shapedPart(view: { curves: readonly unknown[]; profiles?: readonly unknown[] }): boolean; // curves || swept
  export type ProfileFault = { kind: 'stop-off' } | { kind: 'overlap'; other: string } | { kind: 'runs-off' } | { kind: 'too-tight' };
  export function sweptProfiles(view): readonly ProfileCut[];   // view.profiles (the swept ones), [] for a plain part
  ```

- [ ] **Step 1: Write the failing tests.**
  - `profilesLoad.test.ts`:
    - A `{loop: true}` profile LOADS, keeps `run: {loop: true}` and round-trips byte for byte.
    - `loop: false`, `loop: 1`, and a run with both `loop` and `start` REFUSE (the newer-version message).
    - Ends on two sides still refuse.
    - Mutation: let the tail's `if (!s || !e) continue` run for a loop; the "loads" test must catch the silent drop.
  - `sweepView.test.ts`:
    ```ts
    it('the view keeps straight profiles as view curves and swept ones in profiles (Q1)', () => {
      const b = { ...apronArch, profiles: [...apronArch.profiles, straightTopLong] };   // End to end on the uncut width-max side
      const v = geometryBoard(b);
      expect(v.profiles.map((p) => p.id)).toEqual(['p1']);
      expect(v.curves.map((c) => c.id)).toEqual(['c1', straightTopLong.id]);
      expect(geometryBoard(v)).toBe(v);                       // idempotent: memoised to itself
    });
    it('shapedPart is true for a swept-only rectangle', () => {
      expect(shapedPart(geometryBoard(plainLoop))).toBe(true);
      expect(shapedPart(geometryBoard(createBoard({ length: 30, width: 10, thickness: 0.75, profiles: [straightTopLong] })))).toBe(true);
      expect(shapedPart(createBoard({ length: 30, width: 10, thickness: 0.75 }))).toBe(false);
    });
    it('geometryKey, boardUVSignature and the cut list signature change with a swept profile and its size', () => {
      const a = topCorners(2), b = topCorners(2, loop('p1', 0.375)), plain = createBoard({ length: 36, width: 20, thickness: 0.75, curves: topCorners(2).curves });
      for (const key of [geometryKey, boardUVSignature] as ((x: Board) => string)[]) {
        expect(key(a)).not.toBe(key(b)); expect(key(a)).not.toBe(key(plain));
        expect(key(plain)).toBe(key({ ...plain, profiles: [] }));            // a part with no swept profile: today's key
      }
      // two parts differing only in the swept profile's size are two cut-list rows
      expect(buildCutList({ ...createDocument(), boards: [{ ...a, id: 'x' }, { ...b, id: 'y' }] } as SloydDocument).rows.length).toBe(2);
    });
    ```
    The swept-only rectangle is a loop on a part with no curves. It is swept (Q2) and its outline is the rectangle, so it is the
    four-edge mitred top as one loop.
  - `profiles.test.ts` (faults, Q6):
    - `topCorners(1/4)` + roundover 3/8 loop → `too-tight` (convex).
    - `notchEdge` with the notch radius set to 0.2 → `too-tight` (concave, under `BEARING`).
    - Radius exactly 0.25 → none (touching is not tight).
    - Reach 3 on a 5"-wide apron → `runs-off`.
    - `frontOnly` + an End to end on the length min end → `overlap` (the front's corner arc is shared).
    - Two straight profiles on one side keep a2's overlap result.
    - Mutation: `<` ↔ `<=` at both tight bounds.

- [ ] **Step 2: Run:** `npx vitest run src/document/profilesLoad.test.ts src/document/sweepView.test.ts src/document/profiles.test.ts`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.**
  - **Loader** (`document.ts`):
    - Replace :573's refusal with an explicit branch: `loop === true` with no other run key pushes `run: { loop: true }`;
      anything else under `loop` refuses `'all round'`. Skip `canonicalRun` for a loop.
    - Fix the comment above `validateProfiles`.
    - Update `profileToFields`' error text: it stays a throw, but only for a swept run, which the view now never passes it.
  - **View** (`profiles.ts`):
    ```ts
    export function geometryBoard<T extends …>(b: T): T {
      if (!b.profiles || b.profiles.length === 0) return b;
      const hit = views.get(b);
      if (hit) return hit as T;
      const dims = b as …;
      const straight = b.profiles.filter((p) => !isSwept(b as Board, p));
      const swept = b.profiles.filter((p) => isSwept(b as Board, p));
      const view = { ...b, curves: [...b.curves, ...straight.map(asCurve)], profiles: swept } as T;
      for (const p of swept) sweptSources.set(p, { board: dims });   // the stored part, for faults
      views.set(b, view); views.set(view, view);
      return view;
    }
    export const shapedPart = (v: { curves: readonly unknown[]; profiles?: readonly unknown[] }) => v.curves.length > 0 || (v.profiles?.length ?? 0) > 0;
    ```
    `isSwept` takes the STORED part (curves included). A part with no swept profile builds `profiles: []` exactly as today, so
    a1/a2 parts are unchanged.
  - **Faults:** `profileFaults` gains the Q6 kinds.
    - `runs-off`: reach `> Math.min(L, W) / 2`, or depth `> thickness`, or `profilePath` is null for a swept run.
    - `too-tight`: walk the path's chords; for each distinct `arc`, `!concave && r < reach` or `concave && r < BEARING`.
    - `overlap` for every pair on one face whose outline stretches share positive length. Straight profiles use their side
      chord, and a2 station spans their sub-interval of it, so a2's results are unchanged (pin).
    - Words (`curveText.ts`, one home): `profileFaultText` adds `'it runs off the part'` and `'it is too tight for the curve'`;
      `profileFaultNote` gives each its row note (`It runs off the part at this size.`, `Too tight for the curve at this size.`).
  - **Keys:**
    - `geometryKey` appends `|${view.profiles.map((p) => `${JSON.stringify(p.id)}:${profileValues(p).map(val).join(',')}`).join(';')}` ONLY when
      `view.profiles.length > 0`, so every other part's key is byte for byte.
    - `boardUVSignature` and `curveSignature` follow the same rule (sorted, ids ignored, for the cut list).
  - **Gates:** replace each `curves.length === 0` / `> 0` routing test at the lines listed in **Files** with `!shapedPart(view)`
    / `shapedPart(view)`. Do not touch any other `curves` read.

- [ ] **Step 4: Run** Step 2's command, then `npx vitest run src/document/profilesView.test.ts src/document/drawingIdentity.test.ts src/viewport/bodyMeshIdentity.test.ts`. Expected: PASS, all untouched files green.

- [ ] **Step 5: Commit.** `git commit -m "profiles: swept runs in the view, loops load, path faults, keys and one routing gate (profile runs b1)"`

---

### Task 3: `sweep.ts` — the kept-wood construction

**Files:**
- Create: `src/document/sweep.ts`, `src/document/sweep.test.ts`
- Modify: `src/document/bodies.ts` (`boardBodies`; export `clip` as `clipFaces` if not exported; `BodyFace` gains
  `sweep?: number`)
- Read: probe.ts.txt:138-330 (`skeleton`, `section`, `prismPlanes`, `bandPiece`, `build`, `subtractRunout`), runout.ts
  (`profileSection`, `runoutPieces`)

**Interfaces:**
- Consumes: `profilePath`, `faceOutline` (Task 1); `sweptProfiles`, `shapedPart` (Task 2).
- Produces:
  ```ts
  export interface SweptPiece { planes: { n: V3; d: number }[]; tags: Partial<BodyFace>[]; bb: [number, number, number, number]; band: boolean }
  export function keptSection(view: Board, p: ProfileCut): { pieces: { pts: P2[]; onArc: boolean[]; edge: (string | null)[] }[]; reach: number; depth: number };
  export function pathSkeleton(chords: readonly OutlineChord[], loop: boolean, reach: number, rays?: [P2, P2]): { faces: P2[][]; wave: P2[]; events: number };
  export function sweptPieces(view: Board, p: ProfileCut): SweptPiece[];   // memoised per (part, profile)
  ```

- [ ] **Step 1: Write the failing tests** (`sweep.test.ts`), with the independent oracle ported from probe.ts.txt:355-416.
  - **The oracle** (`pathOracle`/`oracleVolume`/`pointwise`): wood is inside the chord outline and `t > tau(distance to the path
    chords)`; past a station it is a2's cutter about the bit axis. It never uses the construction's planes.
  - **The oracle must be able to fail:** with the profile removed, it must misclassify points (the probe: 8,848 of 200,000).
  - **Volume against the oracle** (two seeds, 0.004" grid), within 1e-3 in³ and ≤ 0.1% of the waste, for:
    - `apronArch`;
    - `topCorners(2)` and `topCorners(0.5)` × roundover;
    - `topCorners(2)` × thumbnail, bead, cove, ogee;
    - `notchEdge`;
    - `frontOnly` × roundover and cove.
  - **Points:** 0 of 50,000 random points misclassified per case.
  - **The notch regression:** with skeleton events disabled (a test-only `events: false` option), `notchEdge`'s volume error
    exceeds 1% (the probe: +2.9%). Then, with events on, every skeleton face has positive area (`> 1e-12`), and the faces' areas
    plus the rest's equal the outline's within 1e-9.
  - **Every body convex:** each face's vertices are on its plane within 1e-9, and every vertex of the body is on the kept side of
    every face.
  - **Review Focus 1:** the `apronArch` fixture mirrored along length (`mirrorPart`) and through thickness: world volume and
    100k-point world classification equal the original's mirror image.
  - **Review Focus 4:** a loop on BOTH faces of `topCorners(2)`; volume against an oracle taking both wastes.
  - **Review Focus 5:** `topCorners(2)` loop + a 1/4"-deep dado across the width at 18" + a 45° chamfer on the bottom long edge;
    the oracle excludes the dado box and the chamfer half-space.
  - **No regression:** for every `profilesView` fixture, `boardBodies` is the same array content (`toEqual`) as on master.

- [ ] **Step 2: Run:** `npx vitest run src/document/sweep.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement** `sweep.ts`, ported from the probe with these product rules:
  - `keptSection`: the probe's `section`, built from `profileSection` of the profile's straight view curve (`profileAsCurve` of a
    one-side copy of `p`, which only gives the (s, t) section). Kept outline: `[big, 0], …waste[1..], [0, T], [big, T]`, then
    `convexPieces`. Carry per section edge its `profileEdgeName(p.id, a, b)` run, written only for an edge off the part's faces
    (a2's rule, reuse a2's code that names runs).
  - `pathSkeleton`: the probe's `skeleton`.
    - A loop gets bisectors at every vertex.
    - An open path gets its two end vectors: a through end's `ray`; a station end's direction along the path tangent continued
      past the tangent point, as the probe's `front-stations` case does.
    - An end segment collapsing is a fault, not a throw: return null, and `profileFaults` reports `too-tight`.
  - `sweptPieces`:
    - Band pieces: skeleton face × kept piece (the probe's `bandPiece`). The vertical skeleton planes carry
      `{ curve: chord.curve }` when they lie on an outline chord. Section planes carry `{ profileEdge, sweep: seg }`. Plus
      `onArc` for `bodyMesh`'s use (Task 5).
    - Rest pieces: `convexPieces` of the rest polygon (with spike removal at a through ray along the end face: drop a vertex
      whose two edges are collinear and reverse, before `convexPieces`). Vertical planes on an outline chord carry
      `{ curve: chord.curve }`.
    - A station end (B1) clips the band faces at the plane across the path at the station (the probe's `stations`). The
      run-out is applied after, by `boardBodies`.
    - Memoise in a WeakMap on the frozen view keyed by profile id, deep-frozen.
  - `boardBodies`, after the angle-cut clip:
    - If `sweptProfiles(view).length > 0` and every one has a path: the bodies are the curve-free cells. Intersect each body
      with the FIRST swept profile's pieces whose bounding box meets the body's (band pieces first, then rest pieces; a body no
      band piece reaches keeps its object). Then each further swept profile likewise.
    - Then the existing curve loop, SKIPPING curves with `through === 'thickness'` (the outline carries them, Q3).
    - Then, for each swept profile with a station end, a2's run-out: `subtractPieces(body.faces, runoutPieces(view, c), p.id)`
      with `c` the profile's one-side view curve on the end side spanning to the station (stopHi or stopLo set).
    - A part with no swept profile takes today's path, unchanged.

- [ ] **Step 4: Run** Step 2's command, then `npx vitest run src/document src/viewport`. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "sweep: a swept profile's kept wood, built from the outline's skeleton bands (profile runs b1)"`

---

### Task 4: The stock probe, hole faults and snap points

**Files:**
- Modify: `src/document/cuts.ts` (`stockProbe` :275-298), `src/document/holeFaults.ts` (`intoCurve` :80, `stockChecks`,
  `holeInStock`), `src/document/snapPoints.ts` (gate already widened in Task 2; no new marks)
- Test: `src/document/sweepProbes.test.ts` (new)

**Interfaces:**
- Produces: `sweptAirTester(view, p): (pt: V3) => boolean` and `sweptWasteMeets(view, p, hole): boolean` in `sweep.ts`.

- [ ] **Step 1: Failing tests:**
  - `stockProbe` on `topCorners(2)` with a loop: a point at depth 0.1 within 0.05 of the edge (in the waste) is air; the same
    point at 0.3 in is stock; a point ON the profile surface is stock (P3's open form).
  - `apronArch` along the arch: the same, at the arch's crown.
  - Review Focus 3, holes:
    - a 1/4" hole from the top, 3/8" deep, centred 0.4" from the arch (inside reach + radius) is a `breaks-out` keyed
      `:curve:p1` (P7);
    - the same hole 0.6" away is clean;
    - mutation: shrink the extension to 0; the near case must fail.
  - `boardSnapPoints` on a swept-only rectangle (loop on a plain part) offers no point in air (each point `stockProbe`-checked).

- [ ] **Step 2: Run:** `npx vitest run src/document/sweepProbes.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - `sweptAirTester`: the oracle's rule on the model chords (distance to the path chords d, depth t from `p.face`: air if
    `0 <= d < reach`, `t < tau(d)` strictly), hoisted per profile.
  - `stockProbe` ORs each swept profile's tester beside the curves'.
  - `sweptWasteMeets`: P14 along the path. A hole meets the band when its plan circle (or its side-entry rectangle) comes within
    `reach` of the path chords AND its depth interval meets `[0, depth]` from the face, conservative as P14.
  - `intoCurve` returns a `breaks-out` carrying `curve: p.id` and the profile's kind for `curveWord`.

- [ ] **Step 4: Run** Step 2's command and `npx vitest run src/document`. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "sweep: swept waste is air to the stock probe; holes into it break out (profile runs b1)"`

---

### Task 5: The mesh — swept normals, watertight, perf guards

**Files:**
- Modify: `src/viewport/grainTiling.ts` (`bodyMesh` :331-430: a swept face's normals), `src/viewport/curvesWatertight.test.ts`,
  `src/viewport/curvesPerf.test.ts`
- Create: `src/viewport/sweptNormals.test.ts`

**Interfaces:**
- Produces: `sweptNormals(view, p): (face: BodyFace, v: V3) => V3 | null` in `sweep.ts`. It is memoised per part on the frozen
  bodies, as a2 fix F1 did for `runoutNormals`; that per-call rebuild was a2's full-suite perf failure.

- [ ] **Step 1: Failing tests** (`sweptNormals.test.ts`):
  - On `topCorners(2)` with a roundover loop: a vertex on a straight stretch's band face has chunk 1's normal for that straight
    edge (within 1e-9). A vertex on a corner band has the profile arc's normal turned by the radial direction from the corner's
    centre (computed independently from `cornerCurve`'s centre).
  - Normals are continuous across a chord vertex of the corner (the two adjacent segments' normals at the shared vertex agree
    within 1e-6).
  - A face with no `sweep` tag returns null.
- [ ] **Step 2:** Add a watertight row (`unmatchedEdges === 0`, `capCracks` 0) for:
  - every Task 3 volume case;
  - `topCorners(2)` loop + a 35 mm hinge-cup hole clear of the band;
  - Review Focus 4 (top and bottom loops) and 5 (dado and chamfer).
- [ ] **Step 3:** Add `curvesPerf` cases at the Global Constraints' guards. Review Focus 4 is guarded at its measured value plus
  25% if over 40, recorded in the report.
- [ ] **Step 4: Run:** `npx vitest run src/viewport/sweptNormals.test.ts src/viewport/curvesWatertight.test.ts src/viewport/curvesPerf.test.ts` (browser closed). Expected: the normals tests FAIL; watertight and perf may pass already (record which).
- [ ] **Step 5: Implement** `sweptNormals`:
  - At vertex v, find the path chord the face's `sweep` names and its TRUE geometry. On an arc chord, the inward direction is
    from v toward (convex) or away from (concave) the arc's centre; on a straight chord, the chord's inward normal.
  - Then s = the distance from the true arc (or line), and t = depth from the face.
  - Take the section's normal at (s, t) from the nearest section arc (a2's `runoutNormals` approach and its tangent-arc
    assumption), and turn it into 3D by the inward direction.
  - In `bodyMesh`, a face with `sweep` takes these normals. A face with `curve` keeps chunk 1's radial normals.
- [ ] **Step 6: Run** Step 4's command. Expected: PASS.
- [ ] **Step 7: Commit.** `git commit -m "bodyMesh: swept faces shade smooth; watertight rows and perf guards (profile runs b1)"`

---

### Task 6: Edges and part diagrams

**Files:**
- Modify: `src/document/bodies.ts` (`curvedEdges` :677, its `smoothPair` :794-806), `src/document/diagram.ts`,
  `src/panels/PartDiagram.tsx`
- Test: `src/document/sweepEdges.test.ts` (new), `src/document/diagram.test.ts`

- [ ] **Step 1: Failing tests:**
  - On `topCorners(2)` with a roundover loop, `boardEdges` draws:
    - the crease where the roundover meets the top face along the WHOLE path (one chain of segments, no gap at the corners);
    - the vertical side's top edge below the profile;
    - nothing else. No line between two band faces of one section edge at a smooth path vertex; no line between two arc
      section edges of one segment.
    - Count the drawn segments and assert an exact number; derive it by hand from the fixture's chord count, as the probe's
      `facetCount` did (364 facet lines suppressed of 572 on that case).
  - `apronArch`: two sharp mitre lines are drawn where the band meets the end faces at the sharp corners. The arch's tangent
    ends are NOT sharp (no line there).
  - A cove loop: the crease at the cove's two sharp vertices is drawn along the path.
  - `buildDiagrams(topCorners(2) + loop)`:
    - the top face's thickness view is opened;
    - it holds the profile's inner offset line, a closed polyline at the reach;
    - its notes hold the profile's bench line.
    - The `apronArch` case is the same, with an open line.
- [ ] **Step 2: Run:** `npx vitest run src/document/sweepEdges.test.ts src/document/diagram.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `smoothPair` gains the swept rule: two faces with `profileEdge` of the same profile, both `sweep`-tagged, where either:
    - the `sweep` segments are equal or adjacent at a path vertex that is smooth on the TRUE outline (inv 16's judgement), and
      the section runs are equal; or
    - the segments are equal and the section runs are adjacent at a smooth section vertex.

    a2's run-out rule is unchanged, and it covers a B1 station's run-out meeting the last band, because both carry the
    profile's `profileEdge`.
  - `curvedEdges`' stage 1 (planes square to `through`) must not union swept faces. Swept faces go to stage 2 (`bodyEdges`)
    with the new `smoothPair`.
  - Diagrams: a swept profile opens `p.face`'s thickness view (after holes' entry views, before curves' rule, Q8). The view
    gains `sweeps: { id: string; pts: [number, number][]; closed: boolean }[]`, the offset outline at the reach in the view's
    coordinates. `PartDiagram` draws it as a thin solid line. Notes come from `curveLineEntries` (Task 8), keyed by `drawn` ids
    including the profile's.
- [ ] **Step 4: Run** Step 2's command and `npx vitest run src/document`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "edges: swept facets suppressed both ways; diagrams draw a swept profile's line (profile runs b1)"`

---

### Task 7: The Plans sheet

**Files:**
- Modify: `src/document/curveDrawing.ts` (`curveDrawEdges` :53, `silhouetteLines` :181, `runoutSilhouettes` :230,
  `curveEdgeLifts` :316), `src/document/drawing.ts` (`partSegments` :181-201, tags)
- Test: `src/document/profileDrawing.test.ts` (extend), `src/document/sweepDrawing.test.ts` (new)

- [ ] **Step 1: Failing tests:**
  - `profileDrawing`'s ray oracle (`mismatches(b, view)`) is 0 in FRONT, SIDE, TOP and ISO for:
    - `apronArch`;
    - `topCorners(2)` × roundover and cove;
    - `frontOnly`.
  - `sweepDrawing.test.ts`:
    - In the TOP view of `topCorners(2)` with a loop, the crease segments along a corner arc are drawn as a fine path whose nodes
      lie on the TRUE offset arc within 1e-9. Count: within `DRAWING_CURVE_SEGMENTS_MAX`, at `DRAWING_CURVE_TOLERANCE`.
    - The same segments' visible/hidden split equals the model chords' split (inv 47).
    - In ISO, the cove's silhouette is a facet chain (`runoutSilhouettes`' rule) along the corner, not a line along `through`.
    - Every swept segment carries `feature: featureTag(b.id, 'curve', p.id)`, so `planKeys` can anchor its letter.
- [ ] **Step 2: Run:** `npx vitest run src/document/profileDrawing.test.ts src/document/sweepDrawing.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `curveDrawEdges`: an edge whose two wings are `sweep`-tagged section faces of one profile, on a path ARC chord (an
    along-path crease), becomes a fine path. Its nodes are on the true arc offset by the crease's s, at the crease's t (B8). Its
    ends stay on the model chord (Q4 of curves chunk 2).
  - Silhouettes: `runoutSilhouettes`' facet-chain rule over `smoothJoins` now also covers swept joins (rename it
    `profileSilhouettes`; keep the old name as an alias only if tests import it). It is probed from the viewer-facing faces'
    outward normals and clipped to the wood.
  - `curveEdgeLifts`' body-face fallback also takes `sweep`-tagged faces (gate: any swept profile).
  - `partSegments` tags a swept segment with the profile's feature.
- [ ] **Step 4: Run** Step 2's command, then `npx vitest run src/document/drawingIdentity.test.ts src/document/profilesView.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "drawing: swept creases on fine paths, facet-chain silhouettes, lifts and tags (profile runs b1)"`

---

### Task 8: Words and keys

**Files:**
- Modify: `src/document/curveText.ts` (`curveLineEntries` :117-171, `curveLine`), `src/document/featureKeys.ts` (`curveText`
  :73, `partFeatures` :94-115)
- Test: `src/document/curveText.test.ts`, `src/document/featureKeys.test.ts`

- [ ] **Step 1: Failing tests:**
  - Bench lines:
    - `topCorners(2)` loop reads `Roundover 1/4" all round the thickness face (max side)`;
    - a filleted cove reads `Cove 3/8" all round the thickness face (max side), with a 1/16" fillet`;
    - `frontOnly` reads chunk 1's line plus `, round the corners`;
    - `apronArch` reads chunk 1's line exactly (it follows the arch, and the words are unchanged);
    - a faulted loop appends `— check: it is too tight for the curve`.
  - Order: a part with curve c1, straight profile s, swept loop w and straight profile t lists c1, s, t, w (Q7).
  - Plans keys: `Roundover 1/4", all round`; `Roundover 1/4", round the corners`.
  - `partFeatures` on a swept-only part does not throw, and its trueAxis is the thickness axis.
  - Mutation: drop the round-the-corners clause; the frontOnly line must catch it.
- [ ] **Step 2: Run:** `npx vitest run src/document/curveText.test.ts src/document/featureKeys.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `sweptLine(view, p, units)` in curveText.ts (one home), used by `curveLineEntries` after the view's
  curves. Remove `featureKeys`' non-null `b.curves.find(…)!` for profile ids: look up a swept profile in `view.profiles`.
- [ ] **Step 4: Run** Step 2's command. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "words: all round, round the corners; keys for swept profiles (profile runs b1)"`

---

### Task 9: The row, presets and Curves' refusals

**Files:**
- Modify: `src/panels/Profiles.tsx` (`ProfileRow` :79-110, Run select :132-148, Side :188-192, presets `fits` :254-282),
  `src/panels/Curves.tsx` (:41, :72, :189-207)
- Test: `src/panels/Profiles.test.tsx`, `src/panels/Curves.test.tsx`

- [ ] **Step 1: Failing tests:**
  - The Run select offers End to end, Stopped and All round.
    - Choosing All round on `topCorners(2)` stores `{loop: true}`, hides Side, and makes one undo entry.
    - On `topCorners(0.25)` with a 3/8" roundover, All round is greyed on focus with its reason (`optionReason` of the
      `too-tight` refusal).
    - On `frontOnly`, Stopped is greyed with `A stop on a curved or cornered run comes later` (B7).
    - On an uncut side, Stopped is offered as today.
  - A swept row renders without throwing; its line is `sweptLine`'s.
  - Its size field refuses a value that ADDS `too-tight` (the field's own error).
  - A stored `too-tight` caused by a corner edit shows `Too tight for the curve at this size.`
  - Presets on `topCorners(2)` take the first edge whose default fits. The top long edge is swept there, judged by its swept
    faults.
  - Curves, Review Focus 2:
    - on `topCorners(2)` with a 1/4" roundover loop, shrinking a corner radius to 0.2 is refused, with the profile fault's words
      (an ADDED `too-tight`);
    - growing it to 3 is accepted, and the profile re-routes (its bench line unchanged);
    - removing a corner is accepted.
  - Mutation: compare faults by kind before and after, or skip the comparison. The refuse test must catch it.
- [ ] **Step 2: Run:** `npx vitest run src/panels/Profiles.test.tsx src/panels/Curves.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `ProfileRow` reads the STORED `ProfileCut`. `curve` comes from the view only for a straight profile; a swept one has a
    stable per-view object (the view's `profiles` entry) for `useReasons`.
  - `refuse` for a swept profile: added `profileFaults` kinds, then `holeRefusal`, with no CurveCut checks.
  - `fits`: a swept preset is judged by `profileFaults` alone.
  - `Curves.tsx`: every curve add/edit/remove computes each profile's faults before and after on the stored part, and refuses
    (decided before the store write) when any profile gains a kind.
- [ ] **Step 4: Run** Step 2's command, then `npm test` (browser closed) and `npm run build`. Expected: PASS, build clean.
- [ ] **Step 5: Commit.** `git commit -m "Profiles: All round, a greyed Stopped on a turned run; Curves refuses an edit that adds a profile fault (profile runs b1)"`

---

### Task 10: Live pass, docs, merge

- [ ] **Step 1: Live pass** on the dev server with the Playwright MCP browser; leave the test projects in place. **Close the
  browser before any suite run.** On a new project:
  1. A 30 × 5 × 3/4 apron with an Arch on its bottom edge. Add a Roundover, set Side to the arched side: it follows the arch (Iso
     screenshot), and the bench line is unchanged.
  2. A 36 × 20 × 3/4 top with Rounded corners (2"). Add a Roundover and choose Run → All round: the bench line reads `… all round
     …`. Check the Plans key and the cut list notes (the plan view's offset line).
  3. On the same top, End to end on the front: it carries round both corners and runs out on the ends (`, round the corners`).
     Stopped is greyed with its reason.
  4. Shrink a corner to 0.2" with a 1/4" roundover: refused, with words. Grow it to 3": the profile follows.
  5. A Cove All round: it builds; note the rebuild feel (it is guarded at 80 ms).
  6. Mirrored copy of the apron: the profile follows the mirrored arch.
  7. Open "Edge profiles check" and "Stopped profiles check": unchanged (a1/a2 parts; a stopped profile on a straight side).
  8. Undo each step. Console: 0 errors.

  Record DOM readouts and one screenshot per spatial finding.
- [ ] **Step 2: Docs.**
  - `docs/browser-verification-profile-runs-b1.md`.
  - **CLAUDE.md:**
    - the Status bullet (b1 can deploy alone, B7);
    - a Rounds row;
    - Where things live: `profilePath.ts`, `sweep.ts`, `sweepFixtures.ts`, the view's swept `profiles`, `shapedPart`;
    - inv 16 (swept facets suppressed both ways; mitre and crease lines);
    - inv 47 (fine paths along path arcs; facet-chain silhouettes on swept surfaces; lifts);
    - inv 48 (sweep.ts builds kept wood; the first swept profile starts from curve-free cells);
    - inv 50 (swept watertight; normals memoised);
    - inv 53 (swept profiles in the view; path faults);
    - the Versioning row's 17→18 note (a loop loads since b1);
    - the test count.
  - **`docs/follow-ups.md`:**
    - 390: b1 shipped, b2 next;
    - a new residue entry, including the cove and ogee times for chunk c, and any Review Focus 4 measurement.
  - **`docs/history.md`:** the round's section.
  - **The spec:** the Status line.
- [ ] **Step 3: Merge** (no PRs): `git checkout master && git merge --no-ff profile-runs-b1`, then `npm test && npm run build` on
  the merged tree (browser closed), then `git branch -d profile-runs-b1`. **Deploy only on the user's word.** b1 may deploy alone
  (B7). No schema change, but a b1 project holding a loop is refused by a2 (rollback to `3ee667e` refuses such projects; export
  first).
