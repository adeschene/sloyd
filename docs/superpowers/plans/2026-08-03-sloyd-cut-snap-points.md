# Cut-Aware Snap Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a cut's shoulders snappable — every cut contributes 15 points (its floor rectangle and the two shoulder lines at its mouth) to the Move tool, so a shelf can be seated exactly in a side panel's dado.

**Architecture:** A second `SnapPoint` *provider* over the same board, exactly as the snap-move design's §2.3 anticipated. `document/cuts.ts` gains `stockProbe`, a predicate built once per board from the existing cell grid, answering "does this point touch remaining stock". `document/snapPoints.ts` gains `cutSnapPoints` (the 15 points per cut, filtered by that probe) and `snapPointsFor` (box lattice + cut points), which `MoveTool` calls in **both** branches of its candidate memo. `pickSnapPoint` is untouched, `SnapKind` is untouched, `SnapMarker.tsx` is untouched, and there is no schema change.

**Tech Stack:** TypeScript, React 18, react-three-fiber, Zustand, Vitest (`globals: true`), Vite.

## Global Constraints

- **Design doc:** `docs/superpowers/specs/2026-08-03-sloyd-cut-snap-points-design.md`. Read it before Task 1. Section references below (§3, §5, §7.2, §9) are to that file.
- **No schema change.** `CURRENT_VERSION` stays **5**. Nothing in `document.ts`'s migration chain is touched.
- **No new `SnapKind` and no change to `src/viewport/SnapMarker.tsx`.** The three existing kinds and their three browser-settled colours cover all 15 points.
- **No change to `src/viewport/snapPick.ts`'s `pickSnapPoint`.** Task 3 moves `sameSnapPoint` out of that file; `pickSnapPoint` itself is not edited.
- **`document/snapPoints.ts` must not import from `../units`.** A snap point carries no printed string. It may import `./types`, `./geometry` and (new in this round) `./cuts`.
- **Exact `===` comparison on coordinates, never `toBeCloseTo`, in the hand-written world-coordinate assertions.** Every expected value in this plan is a dyadic rational and exact in IEEE 754. If an assertion fails on the last bits, the mapping is wrong — do not relax the comparison. (`toBeCloseTo` is fine in the *existing* posture/rotation sweep in `snapPoints.test.ts`; do not change those.)
- **Test style is per-file.** `src/document/cuts.test.ts` and `src/store/store.test.ts` import from `'vitest'` explicitly; `src/document/snapPoints.test.ts` does not (the repo runs `globals: true`). Match whichever file you are editing.
- **`npm test` does not typecheck.** `npm run build` (`tsc -b && vite build`) is the typecheck gate and must pass before any commit that changes types.
- **No pull requests.** Work on a branch and merge locally with `git merge --no-ff`.
- **If you believe a test expectation in this plan is itself wrong, STOP and escalate.** Do not edit the assertion to match what the code does. This repo has an eight-instance chain of plan-supplied code and justifications being wrong (follow-ups 64, 68 ×2, 80, 87, 88, 107, 118); the fixture in Task 2 is this round's most likely slot in it.

**Branch setup (do this once, before Task 1):**

```bash
cd /home/alec/docker/sloyd
git checkout -b feat/cut-snap-points
npm test        # baseline: 668 passing
```

---

## File Structure

| File | Change | Responsible for |
|---|---|---|
| `src/document/cuts.ts` | Modify | New export `stockProbe(board)` — the "touches remaining stock" predicate, built once from the existing private `grid(board)` |
| `src/document/cuts.test.ts` | Modify | `stockProbe` cases |
| `src/document/snapPoints.ts` | Modify | New exports `cutSnapPoints`, `snapPointsFor`; `sameSnapPoint` moves here from `viewport/snapPick.ts` |
| `src/document/snapPoints.test.ts` | Modify | The 15 points, their kinds, their world coordinates, the withheld cases; `sameSnapPoint`'s tests move here |
| `src/document/document.ts` | Modify | Re-export the three new names |
| `src/viewport/snapPick.ts` | Modify | `sameSnapPoint` removed |
| `src/viewport/snapPick.test.ts` | Modify | `sameSnapPoint`'s describe block removed (moved) |
| `src/viewport/MoveTool.tsx` | Modify | Both memo branches call `snapPointsFor`; `sameSnapPoint` imported from `document` |
| `src/store/store.ts` | Modify | `dropGrabIfGone` helper; `addCut`/`updateCut`/`removeCut` call it (invariant 24) |
| `src/store/store.test.ts` | Modify | The three grab-clearing cases |
| `docs/browser-verification-cut-snap-points.md` | Create | Task 6's record |
| `docs/follow-ups.md` | Modify | Close 99, add this round's entries |
| `CLAUDE.md` | Modify | Round write-up, invariant 24 amendment, file map |

---

## Task 1: `stockProbe` — does this point touch remaining stock?

**Files:**
- Modify: `src/document/cuts.ts` (add one export after `boardSolids`, around line 180)
- Test: `src/document/cuts.test.ts`

**Interfaces:**
- Consumes: the existing private `grid(board)` in the same file, and the exported `Point` type (`Record<Dimension, number>`).
- Produces: `export function stockProbe(board: Board): (p: Point) => boolean` — call it once per board, then call the returned closure per point. The grid is built once, inside `stockProbe`, not per point.

**Background the implementer needs:**

`grid(board)` (private, `src/document/cuts.ts:71`) splits the board at every cut boundary into cells and marks each cell filled or empty. It returns `{ coords, filled }`: `coords[d]` is the sorted, deduplicated list of split planes on dimension `d` (always including `0` and `board[d]`), and `filled[i][j][k]` is the cell between `coords.length[i..i+1]`, `coords.width[j..j+1]`, `coords.thickness[k..k+1]`.

A point can sit *in* a cell's interior on a given axis (one cell index) or exactly *on* a split plane (two adjacent cell indices). The point touches stock iff **any** combination of those per-axis indices is a filled cell. This is `boardEdges`' four-cell test (`src/document/cuts.ts:241`) generalised from a segment to a point — up to eight cells rather than four.

- [ ] **Step 1: Write the failing tests**

Add this describe block at the end of `src/document/cuts.test.ts`, and add `stockProbe` to the existing `import { ... } from './cuts'` line at the top:

```ts
describe('stockProbe', () => {
  // Canonical dado on the default 24 x 5-1/2 x 3/4 board: a 3/4in-wide,
  // 1/4in-deep cut at 6in along, running across the width, entering the
  // thickness face from `max`. So cutRegion is
  // { length: [6, 6.75], width: [0, 5.5], thickness: [0.5, 0.75] }.

  it('accepts a point in solid stock well away from any cut', () => {
    const touches = stockProbe(withCuts([DADO]));
    expect(touches({ length: 3, width: 2, thickness: 0.25 })).toBe(true);
  });

  it('rejects a point in the middle of the removed stock', () => {
    const touches = stockProbe(withCuts([DADO]));
    // Dead centre of the dado's own volume: no cell touching it is filled.
    expect(touches({ length: 6.375, width: 2.75, thickness: 0.625 })).toBe(false);
  });

  it('accepts a point on the dado floor, where filled and empty cells meet', () => {
    const touches = stockProbe(withCuts([DADO]));
    // thickness 0.5 is a split plane: the cell below it is stock, the cell
    // above it was removed. Touching one filled cell is enough — this is the
    // whole reason the test is on the CLOSED span, not the open one.
    expect(touches({ length: 6.375, width: 2.75, thickness: 0.5 })).toBe(true);
  });

  it('accepts a point on a shoulder wall', () => {
    const touches = stockProbe(withCuts([DADO]));
    // length 6 is the shoulder plane; the stock on the low side of it is filled.
    expect(touches({ length: 6, width: 2.75, thickness: 0.625 })).toBe(true);
  });

  it('rejects every point on a board its own cuts consumed', () => {
    // Two adjacent full-depth cuts, each individually legal (neither is
    // full-width, so validateCuts refuses neither), jointly removing all the
    // stock. boardSolids returns [] here — see its doc comment.
    const board = withCuts([
      { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 0, width: 12, depth: 0.75 },
      { id: 'b', face: 'thickness', from: 'min', across: 'width', offset: 12, width: 12, depth: 0.75 },
    ]);
    expect(boardSolids(board)).toHaveLength(0);
    const touches = stockProbe(board);
    expect(touches({ length: 0, width: 0, thickness: 0 })).toBe(false);
    expect(touches({ length: 12, width: 2.75, thickness: 0.75 })).toBe(false);
    expect(touches({ length: 24, width: 5.5, thickness: 0.375 })).toBe(false);
  });

  it('rejects a point outside the board entirely', () => {
    const touches = stockProbe(withCuts([DADO]));
    expect(touches({ length: 30, width: 2, thickness: 0.25 })).toBe(false);
    expect(touches({ length: 3, width: 2, thickness: -1 })).toBe(false);
  });

  it('accepts the board corner of an uncut board', () => {
    const touches = stockProbe(withCuts([]));
    expect(touches({ length: 0, width: 0, thickness: 0 })).toBe(true);
    expect(touches({ length: 24, width: 5.5, thickness: 0.75 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: FAIL — `stockProbe is not a function` / TS complaining the export does not exist.

- [ ] **Step 3: Implement `stockProbe`**

Insert into `src/document/cuts.ts` immediately after `boardSolids` (i.e. after the closing brace at line 180, before the `/** A point in a board's own coordinate space. */` comment that introduces `Point`) — then move it below `Point`'s declaration if TypeScript complains about use-before-declaration of the type (type declarations hoist, so it should not):

```ts
/**
 * Whether a point in the board's own space touches any remaining stock.
 *
 * The one rule behind every withheld snap point (design §5): a marker must sit
 * on a feature that is actually drawn, and a point with no filled cell around
 * it sits in a hole. Both cases fall out of it — a board its own cuts consumed
 * entirely (nothing is filled, so nothing is offered) and a cut's floor corner
 * that a deeper, overlapping cut has since removed.
 *
 * This is boardEdges' four-cell configuration test generalised from a segment
 * to a point: on each axis a coordinate either falls inside one cell or lands
 * exactly on a split plane between two, so up to eight cells touch it, and one
 * filled cell is enough. The span test is CLOSED (`>=`/`<=`) precisely so a
 * point on a boundary — which is where every interesting snap point sits —
 * sees the cells on both sides of it.
 *
 * Returns a closure because the grid is built once per board and probed many
 * times: a board with n cuts is asked about 15n points.
 */
export function stockProbe(board: Board): (p: Point) => boolean {
  const { coords, filled } = grid(board);

  /** Every cell index on `d` whose closed span contains `v`. Empty if outside. */
  const cells = (d: Dimension, v: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < coords[d].length - 1; i += 1) {
      if (v >= coords[d][i] && v <= coords[d][i + 1]) out.push(i);
    }
    return out;
  };

  return (p) => {
    for (const i of cells('length', p.length)) {
      for (const j of cells('width', p.width)) {
        for (const k of cells('thickness', p.thickness)) {
          if (filled[i][j][k]) return true;
        }
      }
    }
    return false;
  };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: PASS, all previously-passing cases still green.

- [ ] **Step 5: Typecheck**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/document/cuts.ts src/document/cuts.test.ts
git commit -m "feat: stockProbe — whether a point touches a board's remaining stock"
```

---

## Task 2: `cutSnapPoints` and `snapPointsFor`

**Files:**
- Modify: `src/document/snapPoints.ts`
- Modify: `src/document/document.ts` (re-exports, near line 21)
- Test: `src/document/snapPoints.test.ts`

**Interfaces:**
- Consumes: `stockProbe(board)` and `cutRegion(board, cut)` and the `Point` type from `./cuts` (Task 1); `axisDimensions`, `positionAxisOf` from `./geometry`; the existing `boardSnapPoints`, `SnapPoint`, `SnapKind`, `SnapOwner` in this file.
- Produces:
  - `export function cutSnapPoints(board: Board): SnapPoint[]` — the cut-owned points only, `[]` for a board with no cuts.
  - `export function snapPointsFor(board: Board): SnapPoint[]` — `[...boardSnapPoints(board), ...cutSnapPoints(board)]`. **This is the name Tasks 4 and 5 use.**

**The geometry, stated once so the implementer does not have to re-derive it.** For a cut, name three axes: *face* is `cut.face` (the depth axis), *across* is `cut.across` (spanned fully — that is what makes it a through-cut), and *pos* is `positionAxisOf(cut.face, cut.across)`, along which `offset` and `width` are measured. `cutRegion` already returns the box in these terms. Two rectangles at the two ends of the *face* axis:

- **Floor** (the plane `depth` in from the surface): all 9 combinations of *pos* ∈ {min, mid, max} × *across* ∈ {min, mid, max}.
- **Mouth** (the plane at the board's own surface): only *pos* ∈ {min, max} × *across* ∈ {min, mid, max} = 6. The *pos* = mid row is dropped at the mouth because it spans the **opening** — those three points sit in the hole, not on wood.

Kind comes from counting the mids among the **two in-plane axes** (*pos*, *across*): 0 → `corner`, 1 → `edge-mid`, 2 → `face-center`. The *face* axis never contributes a mid.

**The local→world trap.** `pointToLocalXYZ` and `solidWorldBox` (both in `cuts.ts`) return **board-centre-relative** coordinates, because `BoardMesh` hangs solids in a `<group>` at `boardCenter(board)`. Do **not** use either here. `position` is the board's min-corner (invariant 2), so the mapping is a bare addition:

```
world[axis] = board.position[axis] + local[axisDimensions(board)[axis]]
```

- [ ] **Step 1: Write the failing tests**

Add to `src/document/snapPoints.test.ts`. First extend the imports at the top of the file:

```ts
import { boardSolids } from './cuts';
import { boardSnapPoints, cutSnapPoints, snapPointsFor } from './snapPoints';
import type { Board, Cut, Posture, Rotation } from './types';
```

Then append these two describe blocks:

```ts
/**
 * A POSED board: 24 x 6 x 1 at [10, 2, -5], standing on edge and turned 90.
 *
 * The posing is the test. axisDimensions for posture 'on-edge' puts `width`
 * up, leaving [length, thickness] horizontal, and rotation 90 swaps them — so
 * X = thickness, Y = width, Z = length. A flat, unrotated board at the origin
 * passes with a COMPLETELY WRONG local->world mapping, because every axis is
 * the identity there.
 */
const posed = (cuts: Cut[]): Board =>
  createBoard({
    length: 24,
    width: 6,
    thickness: 1,
    position: [10, 2, -5],
    posture: 'on-edge',
    rotation: 90,
    cuts,
  });

/** A 3/4in-wide, 1/4in-deep dado at 6in along, across the width, from `max`. */
const DADO: Cut = {
  id: 'c1', face: 'thickness', from: 'max', across: 'width',
  offset: 6, width: 0.75, depth: 0.25,
};

const key = (at: readonly number[]) => at.join(',');

describe('cutSnapPoints', () => {
  it('offers nothing for a board with no cuts', () => {
    expect(cutSnapPoints(posed([]))).toEqual([]);
  });

  it('offers 15 points for one dado: 8 corners, 6 edge midpoints, 1 face centre', () => {
    const points = cutSnapPoints(posed([DADO]));
    expect(points).toHaveLength(15);
    expect(points.filter((p) => p.kind === 'corner')).toHaveLength(8);
    expect(points.filter((p) => p.kind === 'edge-mid')).toHaveLength(6);
    expect(points.filter((p) => p.kind === 'face-center')).toHaveLength(1);
  });

  /**
   * Every world coordinate, by hand. Worked from the fixture:
   *
   *   dims       = [thickness, width, length]  (X, Y, Z)
   *   position   = [10, 2, -5]
   *   X = 10 + thickness, Y = 2 + width, Z = -5 + length
   *
   *   cutRegion  = { length: [6, 6.75], width: [0, 6], thickness: [0.75, 1] }
   *   mouth      = thickness 1    -> X = 11      (from: 'max')
   *   floor      = thickness 0.75 -> X = 10.75
   *   pos (length) {6, 6.375, 6.75}  -> Z {1, 1.375, 1.75}
   *   across (width) {0, 3, 6}       -> Y {2, 5, 8}
   *
   * Every value is a dyadic rational and therefore exact in IEEE 754. Compare
   * with === . If this fails on the last bits, the MAPPING is wrong.
   */
  it('places all 15 points at exactly the right world coordinates', () => {
    const points = cutSnapPoints(posed([DADO]));
    const got = new Map(points.map((p) => [key(p.at), p.kind]));

    const expected: [number[], string][] = [
      // Floor rectangle, X = 10.75.
      [[10.75, 2, 1], 'corner'],
      [[10.75, 2, 1.375], 'edge-mid'],
      [[10.75, 2, 1.75], 'corner'],
      [[10.75, 5, 1], 'edge-mid'],
      [[10.75, 5, 1.375], 'face-center'],
      [[10.75, 5, 1.75], 'edge-mid'],
      [[10.75, 8, 1], 'corner'],
      [[10.75, 8, 1.375], 'edge-mid'],
      [[10.75, 8, 1.75], 'corner'],
      // Mouth: the two shoulder lines only, X = 11.
      [[11, 2, 1], 'corner'],
      [[11, 5, 1], 'edge-mid'],
      [[11, 8, 1], 'corner'],
      [[11, 2, 1.75], 'corner'],
      [[11, 5, 1.75], 'edge-mid'],
      [[11, 8, 1.75], 'corner'],
    ];

    for (const [at, kind] of expected) {
      expect(got.get(key(at)), `missing ${key(at)}`).toBe(kind);
    }
    expect(got.size).toBe(15);
  });

  it('offers nothing at the mouth\'s middle row, which spans the opening', () => {
    const points = cutSnapPoints(posed([DADO]));
    // X = 11 (mouth plane), Z = 1.375 (pos mid). All three would hang in the
    // hole rather than sitting on wood — design §3.
    expect(points.some((p) => p.at[0] === 11 && p.at[2] === 1.375)).toBe(false);
  });

  it('carries the owning board\'s id on every point', () => {
    const b = posed([DADO]);
    for (const p of cutSnapPoints(b)) {
      expect(p.owner).toEqual({ type: 'board', id: b.id });
    }
  });

  it('still offers 15 for a rabbet, without de-duplicating against the box', () => {
    // offset 0 makes it flush with the length-min end, so four of its mouth
    // corners land exactly on board box points. Coincident candidates carry
    // the same position, kind and owner, so they produce the identical delta
    // and which one the picker returns is unobservable — design §9.
    const rabbet: Cut = { ...DADO, offset: 0, width: 2 };
    expect(cutSnapPoints(posed([rabbet]))).toHaveLength(15);
  });

  it('withholds the points a deeper overlapping cut has removed', () => {
    // B spans A entirely in both position (5..8 contains 6..6.75) and depth
    // (0.5..1 contains 0.75..1), so every one of A's 15 points sits in
    // removed stock. Only B's 15 survive.
    const deeper: Cut = {
      id: 'c2', face: 'thickness', from: 'max', across: 'width',
      offset: 5, width: 3, depth: 0.5,
    };
    const points = cutSnapPoints(posed([DADO, deeper]));
    expect(points).toHaveLength(15);
    // A's floor plane is thickness 0.75 -> X = 10.75. B's is 0.5 -> X = 10.5.
    expect(points.some((p) => p.at[0] === 10.75)).toBe(false);
    expect(points.some((p) => p.at[0] === 10.5)).toBe(true);
  });

  it('offers nothing on a board its own cuts consumed', () => {
    const board = posed([
      { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 0, width: 12, depth: 1 },
      { id: 'b', face: 'thickness', from: 'min', across: 'width', offset: 12, width: 12, depth: 1 },
    ]);
    expect(boardSolids(board)).toHaveLength(0);
    expect(cutSnapPoints(board)).toEqual([]);
  });

  it('offers nothing for a degenerate cut naming one dimension twice', () => {
    const degenerate: Cut = { ...DADO, face: 'width', across: 'width' };
    expect(cutSnapPoints(posed([degenerate]))).toEqual([]);
  });
});

describe('snapPointsFor', () => {
  it('is exactly boardSnapPoints for a board with no cuts', () => {
    const b = posed([]);
    expect(snapPointsFor(b)).toEqual(boardSnapPoints(b));
    expect(snapPointsFor(b)).toHaveLength(26);
  });

  it('is the box lattice plus the cut points for a dadoed board', () => {
    const b = posed([DADO]);
    expect(snapPointsFor(b)).toHaveLength(26 + 15);
  });

  it('keeps the 26 box points on a board its own cuts consumed', () => {
    // The ghost box IS drawn at the AABB (invariant 21), so the box points
    // still sit on a drawn feature; nothing draws the cut's shoulders.
    const board = posed([
      { id: 'a', face: 'thickness', from: 'min', across: 'width', offset: 0, width: 12, depth: 1 },
      { id: 'b', face: 'thickness', from: 'min', across: 'width', offset: 12, width: 12, depth: 1 },
    ]);
    expect(snapPointsFor(board)).toHaveLength(26);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/document/snapPoints.test.ts`
Expected: FAIL — `cutSnapPoints is not a function`.

- [ ] **Step 3: Implement the provider**

Replace the import header of `src/document/snapPoints.ts` with:

```ts
import { cutRegion, stockProbe } from './cuts';
import type { Point } from './cuts';
import { axisDimensions, boardExtents, positionAxisOf } from './geometry';
import type { Board, Cut } from './types';
```

Append to the same file, after `boardSnapPoints`:

```ts
/**
 * A point in the board's own space, in world inches.
 *
 * `position` is the min-corner (invariant 2) and axisDimensions says which
 * board dimension runs along each world axis, so this is a bare addition.
 *
 * Deliberately NOT pointToLocalXYZ or solidWorldBox: both of those return
 * coordinates relative to the board's CENTRE, because BoardMesh hangs solids
 * in a <group> at boardCenter(board). Using either here puts every point off
 * by half the board — which looks entirely plausible in a screenshot, and is
 * why the tests pose the fixture rather than sitting it flat at the origin.
 */
function toWorld(board: Board, p: Point): [number, number, number] {
  const dims = axisDimensions(board);
  return [
    board.position[0] + p[dims[0]],
    board.position[1] + p[dims[1]],
    board.position[2] + p[dims[2]],
  ];
}

/**
 * The 15 points one cut defines, in the board's own space, before any test of
 * whether the stock under them still exists.
 *
 * Two rectangles at the two ends of the cut's depth axis. The FLOOR gets all
 * nine combinations of {min, mid, max} on the position and across axes. The
 * MOUTH — the plane at the board's own surface — gets only the two shoulder
 * lines: its middle row spans the OPENING, so those three points (the mouth's
 * own face centre among them) would sit in the hole rather than on wood. That
 * is the volume-centre exclusion of design §2.1, one dimension down.
 *
 * The exclusion is definitional — it says what a cut OFFERS — and is a
 * separate question from whether stock remains, which stockProbe answers. On a
 * plain dado the two happen to agree (the cells above the mouth's middle row
 * are the cut's own, and empty), but they are not the same rule and neither is
 * a substitute for the other.
 *
 * Kind comes from counting the mids among the two IN-PLANE axes, which is
 * boardSnapPoints' rule applied in the rectangle rather than in the box.
 */
function pointsOfCut(board: Board, cut: Cut): { at: Point; kind: SnapKind }[] {
  // No position axis exists when a cut names one dimension twice, so it
  // defines no rectangle. cutRegion guards the same case for the same reason,
  // and neither may lean on document.ts's validator dropping such a cut on
  // load: a Board built directly can reach here without being validated.
  if (cut.face === cut.across) return [];

  const pos = positionAxisOf(cut.face, cut.across);
  const region = cutRegion(board, cut);
  const [faceLo, faceHi] = region[cut.face];
  // `from` names the surface the cut enters, so the floor is the far side.
  const mouth = cut.from === 'min' ? faceLo : faceHi;
  const floor = cut.from === 'min' ? faceHi : faceLo;

  const spread = (span: readonly [number, number]) => [span[0], (span[0] + span[1]) / 2, span[1]];
  const poss = spread(region[pos]);
  const acrosses = spread(region[cut.across]);

  const out: { at: Point; kind: SnapKind }[] = [];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      const mids = (i === 1 ? 1 : 0) + (j === 1 ? 1 : 0);
      const kind: SnapKind =
        mids === 0 ? 'corner' : mids === 1 ? 'edge-mid' : 'face-center';
      const planes = i === 1 ? [floor] : [floor, mouth];
      for (const plane of planes) {
        out.push({
          at: {
            [pos]: poss[i],
            [cut.across]: acrosses[j],
            [cut.face]: plane,
          } as unknown as Point,
          kind,
        });
      }
    }
  }
  return out;
}

/**
 * A board's cut-owned snap candidates: 15 per cut, minus any whose stock is
 * gone.
 *
 * The second provider the snap-move design's §2.3 was built for — pickSnapPoint
 * consumes SnapPoint[] and never sees a Board, so this is an addition rather
 * than a change to the picker. The owner stays the BOARD: a shoulder belongs to
 * the part it was cut into, which is what keeps commitSnapMove's ownership
 * guard and MoveTool's self-snap filter working unchanged.
 *
 * A board with no cuts returns immediately without building a grid, so joinery
 * still costs nothing at all for the boards that do not use it — the same
 * guarantee boardSolids makes in its first line.
 */
export function cutSnapPoints(board: Board): SnapPoint[] {
  if (board.cuts.length === 0) return [];
  const touchesStock = stockProbe(board);
  const owner: SnapOwner = { type: 'board', id: board.id };

  const out: SnapPoint[] = [];
  for (const cut of board.cuts) {
    for (const { at, kind } of pointsOfCut(board, cut)) {
      if (!touchesStock(at)) continue;
      out.push({ kind, at: toWorld(board, at), owner });
    }
  }
  return out;
}

/**
 * Everything on a board that can be snapped to or from.
 *
 * ONE function rather than two concatenations at the call sites, because
 * MoveTool needs the same set in both branches of its candidate memo and two
 * expressions that agree today are two places for a future rule to disagree
 * (follow-up 113).
 */
export function snapPointsFor(board: Board): SnapPoint[] {
  return [...boardSnapPoints(board), ...cutSnapPoints(board)];
}
```

Note `boardExtents` stays imported — `boardSnapPoints` above still uses it.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx vitest run src/document/snapPoints.test.ts`
Expected: PASS, including the existing `boardSnapPoints` cases.

- [ ] **Step 5: Re-export from `document.ts`**

In `src/document/document.ts`, change line 21 to:

```ts
export { boardSnapPoints, cutSnapPoints, snapPointsFor } from './snapPoints';
```

- [ ] **Step 6: Typecheck and run the full suite**

Run: `npm run build && npm test`
Expected: exit 0; suite green.

- [ ] **Step 7: Commit**

```bash
git add src/document/snapPoints.ts src/document/snapPoints.test.ts src/document/document.ts
git commit -m "feat: cutSnapPoints — 15 snap points per cut, filtered to remaining stock"
```

---

## Task 3: Move `sameSnapPoint` into `document/snapPoints.ts`

**Files:**
- Modify: `src/document/snapPoints.ts` (add), `src/document/document.ts` (re-export)
- Modify: `src/viewport/snapPick.ts` (remove, lines 86-106), `src/viewport/MoveTool.tsx:8` (import)
- Test: move the `describe('sameSnapPoint')` block from `src/viewport/snapPick.test.ts` to `src/document/snapPoints.test.ts`

**Interfaces:**
- Produces: `export function sameSnapPoint(a: SnapPoint | null, b: SnapPoint | null): boolean` from `document/snapPoints.ts`, re-exported by `document/document.ts`.

**Why:** Task 4 needs this comparison inside the **store**, and the store sits above `document` but not above `viewport` — it cannot import from `viewport`. Moving it, rather than duplicating or re-exporting from both, keeps one home, so there is no second name for it to be found under.

- [ ] **Step 1: Move the function**

Cut the whole `sameSnapPoint` function and its doc comment out of `src/viewport/snapPick.ts` (lines 86-106) and paste it into `src/document/snapPoints.ts`, immediately after the `SnapPoint` interface. Append one paragraph to its doc comment:

```ts
 * Lives here rather than beside pickSnapPoint because the store needs it too
 * (invariant 24's cut-edit clause) and the store cannot import from viewport.
 * One home, not a re-export from two.
```

`snapPick.ts` will now have an unused import if `SnapPoint` is used only there — check and leave the import if `pickSnapPoint` still uses the type (it does).

- [ ] **Step 2: Update the three consumers**

`src/document/document.ts` — extend the line edited in Task 2:

```ts
export { boardSnapPoints, cutSnapPoints, sameSnapPoint, snapPointsFor } from './snapPoints';
```

`src/viewport/MoveTool.tsx` line 4-8 — `sameSnapPoint` now comes from `document`:

```ts
import { boardSnapPoints, sameSnapPoint } from '../document/document';
import type { SnapPoint } from '../document/document';
...
import { PICK_RADIUS_PX, pickSnapPoint } from './snapPick';
```

(Task 5 replaces `boardSnapPoints` with `snapPointsFor` in that import — leave it as `boardSnapPoints` for now so this task's diff is a pure move.)

- [ ] **Step 3: Move the tests**

Cut `describe('sameSnapPoint', ...)` (from line 99 to the end of that block) out of `src/viewport/snapPick.test.ts` and paste it into `src/document/snapPoints.test.ts`. Fix imports in both files:

- `snapPick.test.ts`: drop `sameSnapPoint` from the `./snapPick` import. If the moved block was the only user of a `SnapPoint` helper defined in that file, leave the helper — `pickSnapPoint`'s own tests use it.
- `snapPoints.test.ts`: add `sameSnapPoint` to the `./snapPoints` import. The moved block constructs `SnapPoint` literals; if it used a local helper from `snapPick.test.ts`, copy that helper across too rather than importing across test files.

- [ ] **Step 4: Run both test files**

Run: `npx vitest run src/viewport/snapPick.test.ts src/document/snapPoints.test.ts`
Expected: PASS, with the same total number of tests as before the move.

- [ ] **Step 5: Typecheck and full suite**

Run: `npm run build && npm test`
Expected: exit 0; suite green with the same count as the Task 2 commit.

- [ ] **Step 6: Commit**

```bash
git add src/document/snapPoints.ts src/document/snapPoints.test.ts src/document/document.ts \
        src/viewport/snapPick.ts src/viewport/snapPick.test.ts src/viewport/MoveTool.tsx
git commit -m "refactor: move sameSnapPoint into document/snapPoints so the store can use it"
```

---

## Task 4: Invariant 24 — cut edits drop a grab whose point is gone

**Files:**
- Modify: `src/store/store.ts` (helper beside `edit`, around line 124; then `addCut` ~405, `updateCut` ~436, `removeCut` ~449)
- Test: `src/store/store.test.ts`

**Interfaces:**
- Consumes: `snapPointsFor` (Task 2) and `sameSnapPoint` (Task 3), both from `../document/document`.
- Produces: nothing new for later tasks — a behaviour change only.

**Why this is load-bearing, not defensive.** `grabbed.at` is a world position captured at grab time; `commitSnapMove` subtracts it from the target to get its delta. Cut edits are deliberately routed *around* `updateBoard` (invariant 2: a cut changes no extent, so reorienting on a cut change would be a no-op pivot), so they do not inherit its conditional clear. Today that is harmless because only box-lattice points are grabbable. From Task 5 on, `removeCut` can delete the point being carried and `updateCut` can move it — after which `commitSnapMove` would apply a delta derived from a position describing nothing: the board moves by a wrong amount, undoably, with nothing on screen to say why.

The clear is **precise, not blanket**: holding a box corner and editing a cut on the same board keeps the grab, because the corner genuinely did not move.

- [ ] **Step 1: Write the failing tests**

Add to the `snap move` describe block in `src/store/store.test.ts` (the one containing `cornerOf`, around line 502). Add `snapPointsFor` and `cutSnapPoints` to the existing `../document/document` import at the top of the file:

```ts
  const shoulderOf = (id: string) => {
    const board = useStore.getState().doc.boards.find((x) => x.id === id)!;
    const point = cutSnapPoints(board)[0];
    expect(point, 'fixture must have a cut with offerable points').toBeDefined();
    return point;
  };

  it('drops a grab on a shoulder when the cut is removed', () => {
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    useStore.getState().addCut(a.id);
    useStore.getState().grabSnapPoint(shoulderOf(a.id));
    expect(useStore.getState().grabbed).not.toBeNull();

    const cutId = useStore.getState().doc.boards.find((x) => x.id === a.id)!.cuts[0].id;
    useStore.getState().removeCut(a.id, cutId);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('drops a grab on a shoulder when the cut moves under it', () => {
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    useStore.getState().addCut(a.id);
    useStore.getState().grabSnapPoint(shoulderOf(a.id));

    const cutId = useStore.getState().doc.boards.find((x) => x.id === a.id)!.cuts[0].id;
    useStore.getState().updateCut(a.id, cutId, { offset: 9 });
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('KEEPS a grab on a box corner when a cut is added to the same board', () => {
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    const corner = cornerOf(a.id);
    useStore.getState().grabSnapPoint(corner);
    useStore.getState().addCut(a.id);
    // The corner did not move, so the captured position still describes it.
    // A blanket clear would be safe but would drop a grab needlessly.
    expect(useStore.getState().grabbed).toEqual(corner);
  });

  it('keeps a grab when a cut is edited on a DIFFERENT board', () => {
    const { a, b } = twoBoards();
    useStore.getState().setTool('move');
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().addCut(b.id);
    expect(useStore.getState().grabbed).not.toBeNull();
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx vitest run src/store/store.test.ts`
Expected: the two "drops" cases FAIL (`grabbed` is still the point); the two "keeps" cases PASS already. That split is the point — the failing pair is the behaviour being added, the passing pair is what must not regress.

- [ ] **Step 3: Implement the helper**

Extend the `../document/document` import at the top of `src/store/store.ts` with `sameSnapPoint` and `snapPointsFor`, then add this immediately after `edit`'s closing brace (line 124), before `return {`:

```ts
  /**
   * Invariant 24, for cut edits.
   *
   * A grab holds a WORLD POSITION captured at grab time, so anything that can
   * move or destroy the feature under it must drop it. Cut edits reach that
   * bar as soon as a shoulder is grabbable: removeCut can delete the point
   * being carried and updateCut can move it, after which commitSnapMove would
   * apply a delta derived from a position that describes nothing.
   *
   * They do not go through updateBoard (invariant 2 — a cut changes no extent,
   * so reorienting on a cut change would be a no-op pivot), so they do not
   * inherit its conditional clear and need this instead.
   *
   * Precise rather than blanket: the grab survives if the point it holds is
   * still on offer after the edit, which is the case whenever a box-lattice
   * point is held and only the joinery changed. Exact === on the coordinates
   * is correct here for invariant 18's reason — both sides come from the same
   * arithmetic over the same stored values, so an unmoved point holds
   * identical doubles, and nothing computes a difference on the way in.
   *
   * Call AFTER edit(), so `get().doc` is the post-edit document.
   */
  const dropGrabIfGone = (boardId: string) => {
    const grabbed = get().grabbed;
    if (!grabbed || grabbed.owner.id !== boardId) return;
    const board = get().doc.boards.find((b) => b.id === boardId);
    if (board && snapPointsFor(board).some((p) => sameSnapPoint(p, grabbed))) return;
    set({ grabbed: null });
  };
```

- [ ] **Step 4: Call it from the three cut actions**

In `addCut`, `updateCut` and `removeCut`, add one line immediately after the `edit(...)` call (and inside the action, after the existing early-return guards):

```ts
      dropGrabIfGone(boardId);
```

For `addCut` the parameter is also named `boardId`. Do not move the existing early-return guards — they exist so an unmatched id is a true no-op rather than a no-op undo entry (invariant 4).

- [ ] **Step 5: Run the tests and verify all four pass**

Run: `npx vitest run src/store/store.test.ts`
Expected: PASS, all four new cases, nothing else regressed.

- [ ] **Step 6: Typecheck and full suite**

Run: `npm run build && npm test`
Expected: exit 0; suite green.

- [ ] **Step 7: Commit**

```bash
git add src/store/store.ts src/store/store.test.ts
git commit -m "fix: cut edits drop a grab whose snap point they destroyed (invariant 24)"
```

---

## Task 5: Wire both `MoveTool` branches through `snapPointsFor`

**Files:**
- Modify: `src/viewport/MoveTool.tsx` (import line 4; the `candidates` memo, lines 73-79, and its doc comment)

**Interfaces:**
- Consumes: `snapPointsFor` from `../document/document` (Task 2).
- Produces: the feature, from the user's side.

**The one thing to get right.** CLAUDE.md's roadmap paragraph describes this round as extending *"the pre-grab branch"*, and following that literally ships the feature half-working. The headline operation — seat a shelf in a side panel's dado — grabs a corner **on the shelf** and clicks the shoulder **on the side panel**, so the cut point is a *target*, on the non-selected board, i.e. the **post-grab** branch. Both branches change.

- [ ] **Step 1: Change the import**

```ts
import { sameSnapPoint, snapPointsFor } from '../document/document';
```

(`boardSnapPoints` is no longer used in this file.)

- [ ] **Step 2: Change both branches**

Replace the body of the `candidates` memo (lines 73-79) with:

```ts
  const candidates = useMemo(() => {
    if (grabbed) {
      return boards.flatMap(snapPointsFor).filter((p) => p.owner.id !== grabbed.owner.id);
    }
    const selected = boards.find((b) => b.id === selectedId);
    return selected ? snapPointsFor(selected) : [];
  }, [boards, grabbed, selectedId]);
```

The dependency list is unchanged and correct: `cuts` ride inside `boards`, which is already a dependency. Do **not** add a second memo for cut points — a second memo would need its own hand-written dependency list, which is invariant 15's failure mode exactly (and the reason invariant 21's placeholder rides in the existing `geometries` memo).

- [ ] **Step 3: Extend the memo's doc comment**

Append to the existing comment block above `candidates`:

```
   * Both branches go through snapPointsFor, which is the box lattice plus the
   * cut-owned points. BOTH is load-bearing, not symmetry: the operation cut
   * points exist for grabs a corner on the shelf and clicks the shoulder on
   * the side panel, so a cut point is most often a TARGET, on the board that
   * is not selected. One function rather than two concatenations so the
   * branches cannot drift (follow-up 113).
```

- [ ] **Step 4: Typecheck and full suite**

Run: `npm run build && npm test`
Expected: exit 0; suite green. There are no unit tests for this file by design — the r3f viewport is verified by driving a real browser (Task 6).

- [ ] **Step 5: Commit**

```bash
git add src/viewport/MoveTool.tsx
git commit -m "feat: offer cut snap points as both grab candidates and targets"
```

---

## Task 6: Browser verification

**Files:**
- Create: `docs/browser-verification-cut-snap-points.md`

**Why a whole task:** the r3f viewport has no unit tests by design; this repo verifies it by driving a real browser. Everything in §9.1 of the design is settled by looking, not by asserting.

**Method, carried forward from the two previous rounds:**
- Run against the **dev server** (`npm run dev -- --port 5180`), never production. Sloyd has no server-side state, so `sloyd.autosave.v1` in a browser *is* someone's project; exercising a feature against production would overwrite it with a demo document and there is nothing to restore from.
- Use the Playwright MCP (the only browser automation that works on this host).
- Drive with **real** `page.mouse` / `page.keyboard` input, not synthetic `PointerEvent`s (follow-up 115 — this closed half of 106; touch and pen remain unexercised, and this pass does not change that).
- Project world→screen with **the app's own `project()`** against the live r3f camera, reached through the Vite dev server's module graph — do not re-derive the projection.
- Read exact results out of `localStorage` rather than judging coincidence by eye.
- Note: this host runs software GL (llvmpipe). See follow-up 26a — anything resting on undefined shader behaviour needs real hardware. Nothing in this round does, but say so in the report rather than leaving it unsaid.

- [ ] **Step 1: Build the fixture project**

Two boards: a side panel (24 × 12 × ¾, upright) with a ¾"-wide, ¼"-deep dado across its width at 8", and a shelf (23¼ × 11 × ¾, flat). Add both through the UI, add the cut through the Properties panel's Cuts section.

- [ ] **Step 2: Verify the marker set and colours**

With the Move tool armed and the **shelf** selected, screenshot the side panel's dado at working zoom. Record: how many markers appear on the dado, their colours, and whether a floor corner and its mouth corner (¼" apart) can be picked apart at `PICK_RADIUS_PX = 12`. Then select the **side panel** and confirm its own shoulders are now grab candidates.

Take the screenshots. **Do not describe coverage the screenshots do not show** — follow-up 108 is exactly this failure, and it was closed by taking the missing screenshots rather than by narrowing the prose.

- [ ] **Step 3: Verify the headline operation end to end**

Grab the shelf's end-face corner, orbit the camera (which must not disturb the grab), click the dado's floor corner. Read `sloyd.autosave.v1` out of `localStorage` and confirm the shelf's resulting corner coincides **exactly** with the dado floor corner — computed from the document, not read off a screenshot. Confirm one `Ctrl+Z` reverts the whole move.

- [ ] **Step 4: Verify the two withheld cases are visible as absences**

Add a second, deeper cut spanning the first and confirm no marker appears in the hole. Build the consumed board (two adjacent full-depth cuts) and confirm the ghost still shows its 26 box markers and **no** cut markers.

- [ ] **Step 5: Verify legibility in shadow**

The dado floor sits in shadow, and the three hues were settled against lit faces. Screenshot a dado's markers on pine, walnut and plywood. If any is not legible, that is a finding: record it and raise it — do not retune a colour without saying so.

- [ ] **Step 6: Verify the grab-clearing behaviour in the UI**

With a shoulder grabbed, delete the cut from the Properties panel and confirm the grabbed marker disappears. With a box corner grabbed, add a cut and confirm the grabbed marker stays.

- [ ] **Step 7: Check the console**

Zero errors. Three three.js deprecation warnings are known and expected.

- [ ] **Step 8: Write the report and commit**

Write `docs/browser-verification-cut-snap-points.md` covering every step above, with the screenshots' filenames, what each one shows, and — separately and explicitly — what this pass did **not** check.

```bash
git add docs/browser-verification-cut-snap-points.md
git commit -m "docs: browser verification for cut-aware snap points"
```

---

## Task 7: Documentation, follow-ups, and merge

**Files:**
- Modify: `docs/follow-ups.md`, `CLAUDE.md`

- [ ] **Step 1: Close follow-up 99 in `docs/follow-ups.md`**

Mark it **CLOSED**, in place, with what the round decided against what the entry asked: 15 points per cut (floor rectangle + shoulder lines at the mouth), the existing three `SnapKind`s reused, and `stockProbe` answering both of the entry's open questions with one rule. State that it landed as a *provider*, as the entry predicted, with `pickSnapPoint` untouched.

- [ ] **Step 2: Add this round's entries to `docs/follow-ups.md`**

Open a "From the cut-aware snap points round" section, numbered from **119**. It must include, at minimum, the §9 non-goals as decisions rather than omissions — no shoulder-wall points, no de-duplication against the box lattice, no fourth `SnapKind` — plus whatever Task 6 found, plus the note that the guides round's plan still needs its §3.1 filter merged into one predicate rather than stacked (follow-up 113, now with a third contributor to that branch).

- [ ] **Step 3: Update `CLAUDE.md`**

Four places:
1. **Status** — add cut-aware snap points to the round list; `CURRENT_VERSION` stays 5; update the test count from `npm test`.
2. **A "What the cut-aware snap points round did" section**, in the style of the rounds above it, linking the design doc and the browser-verification report.
3. **Invariant 24** — record that `addCut`/`updateCut`/`removeCut` now clear a grab, and that the clear is *conditional on the point still being on offer*, which is a narrower rule than the five world-moved actions use. Say why: those five invalidate a captured position, these can destroy the feature under it.
4. **"Where things live"** — `cuts.ts` gains `stockProbe`; `snapPoints.ts` gains `cutSnapPoints`, `snapPointsFor` and `sameSnapPoint` (and now imports `./cuts`, while still not importing `../units`); `snapPick.ts` loses `sameSnapPoint`.
5. **"The next line of work"** — the tape measure / guide points / guide lines round is now next, with its committed plan needing the revision pass already recorded.

- [ ] **Step 4: Final verification**

```bash
npm run build && npm test
```
Expected: exit 0; suite green. Record the new test count.

- [ ] **Step 5: Commit and merge**

```bash
git add docs/follow-ups.md CLAUDE.md
git commit -m "docs: cut-aware snap points round write-up, closing follow-up 99"
git checkout master
git merge --no-ff feat/cut-snap-points
npm test && npm run build
git branch -d feat/cut-snap-points
```

- [ ] **Step 6: Ask before deploying**

Do **not** deploy. Ask the user — the last two rounds were deployed same-day, the three before that were held back at the user's choice, and this is theirs to decide. If they say yes, `DEPLOYMENT.local.md` has the runbook. This round makes no schema change, so a rollback costs nothing but the feature itself.

---

## Notes for the reviewer between tasks

- **Task 2's fixture is the one to check hardest.** If it drifted to a flat, unrotated board at the origin, the local→world mapping is untested and the plan's most likely failure has landed.
- **Task 4's two "keeps" cases matter as much as the two "drops" cases.** They pass before the change and must still pass after; if the implementer reached for a blanket clear, the box-corner case fails and that is the signal.
- **Task 5 must change both branches.** A diff touching only the `selected ?` line is the half-working outcome described above.
