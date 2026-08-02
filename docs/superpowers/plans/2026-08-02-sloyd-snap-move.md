# Snap-move Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modal Move tool that places one board against another by clicking a corner or midpoint on each, so the two points end up exactly coincident.

**Architecture:** Two new pure, unit-tested modules — `document/snapPoints.ts` generates a board's 26 candidate points, `viewport/snapPick.ts` chooses the one nearest the cursor in screen space. Tool state (`tool`, `grabbed`) lives in the Zustand store beside `selectedId` as non-undoable view state; the move itself is one subtraction applied through the existing `updateBoard`, so undo and autosave need no changes. A new `MoveTool` component listens on the canvas DOM element and draws one marker per relevant point.

**Tech Stack:** TypeScript, React, Zustand, react-three-fiber / three.js, Vitest, Vite.

**Design doc:** `docs/superpowers/specs/2026-08-02-sloyd-snap-move-design.md`. Read it before Task 1. Section references below (§3.1, §5.2, …) point into it.

## Global Constants

Exact values, copied from the design. Do not invent alternatives.

| Constant | Value | Home | Notes |
|---|---|---|---|
| `PICK_RADIUS_PX` | `12` | `src/viewport/snapPick.ts` | browser-settled (§6.3) |
| `MARKER_PX` | `9` | `src/viewport/SnapMarker.tsx` | marker diameter on screen |
| `RING_PX` | `2` | `src/viewport/SnapMarker.tsx` | ring thickness on screen |
| corner colour | `#2e9e5b` | `src/viewport/SnapMarker.tsx` | green |
| edge-mid colour | `#22b8d4` | `src/viewport/SnapMarker.tsx` | cyan |
| face-center colour | `#8a5fd0` | `src/viewport/SnapMarker.tsx` | violet |
| ring colour | `#f5f2ec` | `src/viewport/SnapMarker.tsx` | light, for contrast on walnut |
| `CLICK_DRAG_SLOP_PX` | `2` | `src/viewport/pointer.ts` (moved) | currently in `BoardMesh.tsx` |

## Global Constraints

- **No schema change.** `CURRENT_VERSION` stays `5`. Nothing new is stored. If you find yourself editing `src/document/document.ts`'s migration chain, stop — you have gone wrong.
- **The committed position is NOT snapped to 1/16".** The gizmo's `SNAP_INCHES` must not be applied to a snap move. See §4: rounding could silently break the exact coincidence the whole feature exists to produce.
- **`npm test` does not typecheck.** Run `npm run build` (which is `tsc -b && vite build`) before claiming anything compiles. Every task's final verification step includes it.
- **No pull requests.** Solo repo. Work on a branch and merge locally with `git merge --no-ff`, or commit straight to `master`. Never open a PR.
- **The r3f viewport has no unit tests by design.** Tasks 1–3 are unit-tested because they are pure. Tasks 4–8 are verified by driving a real browser (Task 9). Do not write jsdom tests for `MoveTool`, `SnapMarker` or `Viewport`.
- **Fix the code, not the expectation.** If a test in this plan fails and you believe the *test* is wrong, stop and escalate rather than editing the assertion. This repo has recorded seven such cases where plan-supplied code was wrong and the expectation was right (see `docs/follow-ups.md`, joinery lesson; and follow-ups 64, 68, 80, 87, 88).

---

## File Structure

**Created:**

| File | Responsibility |
|---|---|
| `src/document/snapPoints.ts` | `SnapPoint`/`SnapKind`/`SnapOwner` types and `boardSnapPoints(board)`. Pure; imports only `./types` and `./geometry`. |
| `src/document/snapPoints.test.ts` | Unit tests for the above. |
| `src/viewport/snapPick.ts` | `pickSnapPoint(...)`, `sameSnapPoint(...)`, `PICK_RADIUS_PX`. Pure; no THREE import. |
| `src/viewport/snapPick.test.ts` | Unit tests for the above. |
| `src/viewport/pointer.ts` | `CLICK_DRAG_SLOP_PX`, moved out of `BoardMesh.tsx` so two call sites read one value. |
| `src/viewport/SnapMarker.tsx` | One screen-constant, always-on-top marker for a single `SnapPoint`. Owns the colours. |
| `src/viewport/MoveTool.tsx` | Canvas DOM event wiring, hover state, and rendering of the grabbed/hovered markers. |
| `docs/browser-verification-snap-move.md` | Task 9's report. |

**Modified:**

| File | Change |
|---|---|
| `src/document/document.ts` | Re-export `boardSnapPoints` and the snap types. |
| `src/store/store.ts` | `tool`, `grabbed`, `setTool`, `grabSnapPoint`, `cancelGrab`, `commitSnapMove`; clear `grabbed` in `deleteBoard`, `undo`, `redo`, `replaceDocument`. |
| `src/store/store.test.ts` | Tests for the above. |
| `src/viewport/BoardMesh.tsx` | Import `CLICK_DRAG_SLOP_PX`; new `selectable` prop gating `onClick`. |
| `src/viewport/Viewport.tsx` | Render `MoveTool`; hide `Gizmo` in move mode; gate `onPointerMissed`; crosshair cursor; pass `selectable`. |
| `src/panels/Toolbar.tsx` | Select / Move buttons. |
| `src/App.tsx` | `M`, `Escape`, and a Delete/Backspace guard, all inside the **existing** window keydown listener. |
| `docs/follow-ups.md` | New "From the snap-move round" section, numbering from 95. |
| `CLAUDE.md` | Status paragraph, "Where things live", invariants, follow-ups. |

---

## Task 1: `boardSnapPoints` — the 26 candidates

**Files:**
- Create: `src/document/snapPoints.ts`
- Create: `src/document/snapPoints.test.ts`
- Modify: `src/document/document.ts` (the re-export block, around lines 6–19)

**Interfaces:**
- Consumes: `Board` from `./types`, `boardExtents` from `./geometry`.
- Produces:
  ```ts
  export type SnapKind = 'corner' | 'edge-mid' | 'face-center';
  export interface SnapOwner { type: 'board'; id: string }
  export interface SnapPoint {
    kind: SnapKind;
    at: [number, number, number];
    owner: SnapOwner;
  }
  export function boardSnapPoints(board: Board): SnapPoint[];
  ```

**Background:** A board is always an axis-aligned box — `rotation` is only 0/90 about Y and `posture` names which dimension points up — so `boardExtents(board)` gives its world size along [X, Y, Z] and `board.position` is its **min-corner** (not its centre). The 26 points are the 3×3×3 lattice of {min, mid, max} on each axis, minus the volume centre.

- [ ] **Step 1: Write the failing test**

Create `src/document/snapPoints.test.ts`:

```ts
// No `import ... from 'vitest'` — this repo runs with `globals: true`
// (vite.config.ts), so describe/it/expect are already in scope and every
// other test file in the repo omits the import.
import { createBoard } from './document';
import { boardExtents } from './geometry';
import { boardSnapPoints } from './snapPoints';
import type { Board, Posture, Rotation } from './types';

/** A 24 x 6 x 1 board at a non-zero, non-symmetric corner. */
const board = (patch: Partial<Board> = {}): Board =>
  createBoard({
    length: 24,
    width: 6,
    thickness: 1,
    position: [10, 2, -5],
    ...patch,
  });

const countOf = (kind: string, b: Board) =>
  boardSnapPoints(b).filter((p) => p.kind === kind).length;

describe('boardSnapPoints', () => {
  it('yields 26 points: 8 corners, 12 edge midpoints, 6 face centres', () => {
    const b = board();
    expect(boardSnapPoints(b)).toHaveLength(26);
    expect(countOf('corner', b)).toBe(8);
    expect(countOf('edge-mid', b)).toBe(12);
    expect(countOf('face-center', b)).toBe(6);
  });

  it('offers no point at the board’s volume centre', () => {
    const b = board();
    const [ex, ey, ez] = boardExtents(b);
    const centre = [
      b.position[0] + ex / 2,
      b.position[1] + ey / 2,
      b.position[2] + ez / 2,
    ];
    // The 27th lattice point is deliberately excluded: it floats inside the
    // solid where nothing draws it (design §2.1).
    expect(
      boardSnapPoints(b).some((p) => p.at.every((v, i) => v === centre[i])),
    ).toBe(false);
  });

  it('yields 26 distinct positions', () => {
    const keys = new Set(boardSnapPoints(board()).map((p) => p.at.join(',')));
    expect(keys.size).toBe(26);
  });

  it('includes the min-corner and the max-corner', () => {
    const b = board();
    const [ex, ey, ez] = boardExtents(b);
    const keys = boardSnapPoints(b)
      .filter((p) => p.kind === 'corner')
      .map((p) => p.at.join(','));
    expect(keys).toContain([b.position[0], b.position[1], b.position[2]].join(','));
    expect(keys).toContain(
      [b.position[0] + ex, b.position[1] + ey, b.position[2] + ez].join(','),
    );
  });

  it('carries the owning board’s id on every point', () => {
    const b = board();
    for (const p of boardSnapPoints(b)) {
      expect(p.owner).toEqual({ type: 'board', id: b.id });
    }
  });

  it('places the centre of the top face at the top face’s centre', () => {
    const b = board();
    const [ex, ey, ez] = boardExtents(b);
    const top = [b.position[0] + ex / 2, b.position[1] + ey, b.position[2] + ez / 2];
    const hit = boardSnapPoints(b).find((p) => p.at.every((v, i) => v === top[i]));
    expect(hit?.kind).toBe('face-center');
  });

  it('places an edge midpoint at the middle of the bottom-front edge', () => {
    const b = board();
    const [ex, , ez] = boardExtents(b);
    const mid = [b.position[0] + ex / 2, b.position[1], b.position[2] + ez];
    const hit = boardSnapPoints(b).find((p) => p.at.every((v, i) => v === mid[i]));
    expect(hit?.kind).toBe('edge-mid');
  });

  // Every posture/rotation combination. The mapping from board dimensions to
  // world axes lives in axisDimensions (via boardExtents) and must not be
  // re-derived here — this asserts the points track it, not that it is right.
  const postures: Posture[] = ['flat', 'on-edge', 'upright'];
  const rotations: Rotation[] = [0, 90];
  for (const posture of postures) {
    for (const rotation of rotations) {
      it(`spans exactly boardExtents for posture=${posture} rotation=${rotation}`, () => {
        const b = board({ posture, rotation });
        const points = boardSnapPoints(b);
        const [ex, ey, ez] = boardExtents(b);
        for (const axis of [0, 1, 2] as const) {
          const values = points.map((p) => p.at[axis]);
          expect(Math.min(...values)).toBeCloseTo(b.position[axis], 10);
          expect(Math.max(...values)).toBeCloseTo(
            b.position[axis] + [ex, ey, ez][axis],
            10,
          );
        }
      });
    }
  }
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/document/snapPoints.test.ts`
Expected: FAIL — `Failed to resolve import "./snapPoints"`.

- [ ] **Step 3: Write the implementation**

Create `src/document/snapPoints.ts`:

```ts
import { boardExtents } from './geometry';
import type { Board } from './types';

/**
 * What a snap point sits on. Drives the marker's colour, and nothing else —
 * every kind snaps identically.
 */
export type SnapKind = 'corner' | 'edge-mid' | 'face-center';

/**
 * What a snap point belongs to.
 *
 * A discriminated union rather than a bare board id, deliberately: guide
 * points, guide lines and the tape measure are the named follow-ups to this
 * round, and every one of them produces candidates owned by something that is
 * not a board. Adding a member here is how they land; the picker's signature
 * never has to change. See the design's §2.3.
 */
export type SnapOwner = { type: 'board'; id: string };

export interface SnapPoint {
  kind: SnapKind;
  /** World position, inches. */
  at: [number, number, number];
  owner: SnapOwner;
}

/**
 * A board's 26 snap candidates: 8 corners, 12 edge midpoints, 6 face centres.
 *
 * A board is always an axis-aligned box (rotation is 0 or 90 about Y, posture
 * only names which dimension points up), so the candidates are the 3x3x3
 * lattice of {min, mid, max} on each world axis. The number of axes sitting at
 * `mid` is exactly what names the kind: none is a corner, one is an edge
 * midpoint, two is a face centre — and three is the volume centre, which is
 * skipped. It is the one lattice point with no feature under it to draw a
 * marker against, so an indicator there would appear to hang in mid-air.
 *
 * Pure, and derived on demand: nothing about snap points is stored, the same
 * way the cut list, the diagrams and the nesting are derived.
 */
export function boardSnapPoints(board: Board): SnapPoint[] {
  const [ex, ey, ez] = boardExtents(board);
  const [px, py, pz] = board.position;
  // `position` is the min-corner, not the centre — see invariant 2.
  const xs = [px, px + ex / 2, px + ex];
  const ys = [py, py + ey / 2, py + ey];
  const zs = [pz, pz + ez / 2, pz + ez];
  const owner: SnapOwner = { type: 'board', id: board.id };

  const points: SnapPoint[] = [];
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      for (let k = 0; k < 3; k += 1) {
        const mids = (i === 1 ? 1 : 0) + (j === 1 ? 1 : 0) + (k === 1 ? 1 : 0);
        if (mids === 3) continue;
        const kind: SnapKind =
          mids === 0 ? 'corner' : mids === 1 ? 'edge-mid' : 'face-center';
        points.push({ kind, at: [xs[i], ys[j], zs[k]], owner });
      }
    }
  }
  return points;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/document/snapPoints.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Re-export from `document.ts`**

Add to `src/document/document.ts`, in the existing re-export block (after the `buildNesting` line, around line 19):

```ts
export { boardSnapPoints } from './snapPoints';
export type { SnapKind, SnapOwner, SnapPoint } from './snapPoints';
```

- [ ] **Step 6: Full suite and typecheck**

Run: `npm test`
Expected: PASS — 617 previously-passing tests plus the 13 new ones.

Run: `npm run build`
Expected: exit 0, no `tsc` errors.

- [ ] **Step 7: Commit**

```bash
git add src/document/snapPoints.ts src/document/snapPoints.test.ts src/document/document.ts
git commit -m "feat: boardSnapPoints — a board's 26 snap candidates

The 3x3x3 lattice of {min, mid, max} on each world axis, minus the volume
centre. The count of axes sitting at mid names the kind: 0 corner, 1 edge
midpoint, 2 face centre.

SnapOwner is a discriminated union rather than a bare board id so the tape
measure and guides land as new owners rather than reopening the picker.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `pickSnapPoint` — screen-space selection

**Files:**
- Create: `src/viewport/snapPick.ts`
- Create: `src/viewport/snapPick.test.ts`

**Interfaces:**
- Consumes: `SnapPoint` from `../document/document` (Task 1).
- Produces:
  ```ts
  export const PICK_RADIUS_PX: number;                        // 12
  export interface ProjectedPoint { x: number; y: number; depth: number }
  export type Projector = (at: [number, number, number]) => ProjectedPoint | null;
  export function pickSnapPoint(
    candidates: SnapPoint[],
    project: Projector,
    cursor: { x: number; y: number },
    radiusPx: number,
  ): SnapPoint | null;
  export function sameSnapPoint(a: SnapPoint | null, b: SnapPoint | null): boolean;
  ```

**Background:** `project` is a callback rather than a camera precisely so this module imports no THREE and stays unit-testable. It returns `null` for a candidate the camera cannot see (behind it, or outside the depth range), which is what culls it. `depth` is NDC z — monotonic in view depth for both projections — so smaller is nearer the camera.

- [ ] **Step 1: Write the failing test**

Create `src/viewport/snapPick.test.ts`:

```ts
// No `import ... from 'vitest'` — `globals: true` is set in vite.config.ts.
import type { SnapPoint } from '../document/document';
import { PICK_RADIUS_PX, pickSnapPoint, sameSnapPoint } from './snapPick';
import type { Projector } from './snapPick';

let n = 0;
const point = (at: [number, number, number], id = `b${(n += 1)}`): SnapPoint => ({
  kind: 'corner',
  at,
  owner: { type: 'board', id },
});

/**
 * A projector driven by a lookup table keyed on the point's x coordinate, so
 * each test states screen positions directly instead of simulating a camera.
 */
const projectorFrom = (
  table: Record<number, { x: number; y: number; depth: number } | null>,
): Projector => (at) => table[at[0]] ?? null;

describe('pickSnapPoint', () => {
  it('returns null for an empty candidate list', () => {
    expect(pickSnapPoint([], () => ({ x: 0, y: 0, depth: 0 }), { x: 0, y: 0 }, 12))
      .toBeNull();
  });

  it('returns the nearest candidate within the radius', () => {
    const near = point([1, 0, 0]);
    const far = point([2, 0, 0]);
    const project = projectorFrom({
      1: { x: 103, y: 100, depth: 0 },
      2: { x: 110, y: 100, depth: 0 },
    });
    expect(pickSnapPoint([far, near], project, { x: 100, y: 100 }, 12)).toBe(near);
  });

  it('returns null when every candidate is outside the radius', () => {
    const p = point([1, 0, 0]);
    const project = projectorFrom({ 1: { x: 100, y: 113, depth: 0 } });
    expect(pickSnapPoint([p], project, { x: 100, y: 100 }, 12)).toBeNull();
  });

  it('includes a candidate exactly at the radius', () => {
    const p = point([1, 0, 0]);
    const project = projectorFrom({ 1: { x: 112, y: 100, depth: 0 } });
    expect(pickSnapPoint([p], project, { x: 100, y: 100 }, 12)).toBe(p);
  });

  it('culls a candidate the projector rejects, even when it is nearest', () => {
    const behind = point([1, 0, 0]);
    const visible = point([2, 0, 0]);
    const project = projectorFrom({
      1: null,
      2: { x: 105, y: 100, depth: 0 },
    });
    expect(pickSnapPoint([behind, visible], project, { x: 100, y: 100 }, 12))
      .toBe(visible);
  });

  it('returns null when the only candidate in range is culled', () => {
    const behind = point([1, 0, 0]);
    expect(pickSnapPoint([behind], projectorFrom({ 1: null }), { x: 100, y: 100 }, 12))
      .toBeNull();
  });

  it('breaks an exact screen-distance tie by depth, nearer to the camera first', () => {
    const back = point([1, 0, 0]);
    const front = point([2, 0, 0]);
    const project = projectorFrom({
      1: { x: 104, y: 100, depth: 0.9 },
      2: { x: 104, y: 100, depth: 0.1 },
    });
    // Listed back-first so a naive "first one wins" implementation fails.
    expect(pickSnapPoint([back, front], project, { x: 100, y: 100 }, 12)).toBe(front);
  });

  it('prefers a nearer-on-screen candidate over a nearer-to-camera one', () => {
    const close = point([1, 0, 0]);
    const deep = point([2, 0, 0]);
    const project = projectorFrom({
      1: { x: 101, y: 100, depth: 0.9 },
      2: { x: 108, y: 100, depth: 0.1 },
    });
    expect(pickSnapPoint([deep, close], project, { x: 100, y: 100 }, 12)).toBe(close);
  });

  it('measures distance in both axes, not just x', () => {
    const p = point([1, 0, 0]);
    const project = projectorFrom({ 1: { x: 109, y: 109, depth: 0 } });
    // 9,9 is 12.7px away — outside a 12px radius despite each axis being inside.
    expect(pickSnapPoint([p], project, { x: 100, y: 100 }, 12)).toBeNull();
  });

  it('ships a 12px default radius', () => {
    expect(PICK_RADIUS_PX).toBe(12);
  });
});

describe('sameSnapPoint', () => {
  it('treats two nulls as the same', () => {
    expect(sameSnapPoint(null, null)).toBe(true);
  });

  it('treats null and a point as different', () => {
    const p = point([1, 0, 0]);
    expect(sameSnapPoint(p, null)).toBe(false);
    expect(sameSnapPoint(null, p)).toBe(false);
  });

  it('compares by owner, kind and position rather than by reference', () => {
    const a: SnapPoint = { kind: 'corner', at: [1, 2, 3], owner: { type: 'board', id: 'x' } };
    const b: SnapPoint = { kind: 'corner', at: [1, 2, 3], owner: { type: 'board', id: 'x' } };
    expect(a).not.toBe(b);
    expect(sameSnapPoint(a, b)).toBe(true);
  });

  it('separates two points that differ only in kind', () => {
    const a: SnapPoint = { kind: 'corner', at: [1, 2, 3], owner: { type: 'board', id: 'x' } };
    const b: SnapPoint = { ...a, kind: 'face-center' };
    expect(sameSnapPoint(a, b)).toBe(false);
  });

  it('separates two points that differ only in owner', () => {
    const a: SnapPoint = { kind: 'corner', at: [1, 2, 3], owner: { type: 'board', id: 'x' } };
    const b: SnapPoint = { ...a, owner: { type: 'board', id: 'y' } };
    expect(sameSnapPoint(a, b)).toBe(false);
  });

  it('separates two points that differ only in position', () => {
    const a: SnapPoint = { kind: 'corner', at: [1, 2, 3], owner: { type: 'board', id: 'x' } };
    const b: SnapPoint = { ...a, at: [1, 2, 4] };
    expect(sameSnapPoint(a, b)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/viewport/snapPick.test.ts`
Expected: FAIL — `Failed to resolve import "./snapPick"`.

- [ ] **Step 3: Write the implementation**

Create `src/viewport/snapPick.ts`:

```ts
import type { SnapPoint } from '../document/document';

/**
 * How close, in canvas pixels, the cursor must come to a candidate before it
 * is offered.
 *
 * Browser-settled, in the sense of follow-up 60 — this is a judgement about
 * what a person can comfortably hit, not something a test can decide. Too
 * small and corners feel slippery; too large and adjacent candidates on a
 * small part fight each other. A named export so a browser pass can retune it
 * without touching any of the arithmetic below.
 */
export const PICK_RADIUS_PX = 12;

export interface ProjectedPoint {
  /** Canvas pixels from the left edge. */
  x: number;
  /** Canvas pixels from the top edge. */
  y: number;
  /** Normalised device depth: smaller is nearer the camera. */
  depth: number;
}

/**
 * Maps a world position to canvas pixels, or to `null` for a point the camera
 * cannot see.
 *
 * A callback rather than a camera on purpose: it is what keeps this module
 * free of THREE, and therefore unit-testable. The repo's working agreement is
 * that the r3f viewport is verified by driving a browser, not by asserting on
 * mocks — that still holds for how the tool FEELS, but which point is nearest
 * is arithmetic, and arithmetic does not need a browser.
 */
export type Projector = (at: [number, number, number]) => ProjectedPoint | null;

/**
 * The candidate nearest the cursor in screen space, or null if none is within
 * `radiusPx`.
 *
 * Screen space rather than a raycast against the board under the cursor. The
 * cheaper raycast-first approach fails on exactly the points the tool is most
 * useful for: a corner silhouetted against empty space has no board under the
 * cursor at all, so the corners easiest to SEE would be the hardest to hit.
 * See the design's §3.1.
 *
 * A candidate occluded by another board is still picked if it is nearest —
 * deliberate, and it composes with the same argument: rejecting occluded
 * candidates costs an occlusion raycast per candidate, and from some angles
 * the silhouetted corner above IS the occluded one. Its marker draws on top
 * so the pick is at least visible (§3.2).
 *
 * Ties in screen distance are broken by depth, nearer to the camera first.
 */
export function pickSnapPoint(
  candidates: SnapPoint[],
  project: Projector,
  cursor: { x: number; y: number },
  radiusPx: number,
): SnapPoint | null {
  let best: SnapPoint | null = null;
  // Seeded with the radius so "within range" and "better than what we have"
  // are one comparison. Squared throughout — no square root is needed to
  // order distances, and the boundary stays exact.
  let bestDistSq = radiusPx * radiusPx;
  let bestDepth = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const projected = project(candidate.at);
    if (!projected) continue;
    const dx = projected.x - cursor.x;
    const dy = projected.y - cursor.y;
    const distSq = dx * dx + dy * dy;
    if (distSq > bestDistSq) continue;
    // Strictly nearer on screen always wins. An exact tie — including the
    // first candidate found, whose distance ties the seeded radius — falls
    // through to depth.
    if (distSq < bestDistSq || projected.depth < bestDepth) {
      best = candidate;
      bestDistSq = distSq;
      bestDepth = projected.depth;
    }
  }
  return best;
}

/**
 * Whether two picks are the same point, by value.
 *
 * `boardSnapPoints` rebuilds its array on every call, so two picks of the same
 * corner are never reference-equal. This is what lets the hover state be
 * committed to React only when the pick actually changes rather than on every
 * pointermove — the same "re-evaluate continuously, commit only on change"
 * pattern AdaptiveGrid uses for grid tiers.
 */
export function sameSnapPoint(a: SnapPoint | null, b: SnapPoint | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    a.owner.type === b.owner.type &&
    a.owner.id === b.owner.id &&
    a.at[0] === b.at[0] &&
    a.at[1] === b.at[1] &&
    a.at[2] === b.at[2]
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/viewport/snapPick.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Full suite and typecheck**

Run: `npm test` → PASS.
Run: `npm run build` → exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/viewport/snapPick.ts src/viewport/snapPick.test.ts
git commit -m "feat: pickSnapPoint — nearest candidate in screen space

Screen space rather than raycast-first, because a corner silhouetted
against empty space has no board under the cursor: raycasting would make
the corners easiest to see the hardest to hit.

project() is a callback rather than a camera, which keeps the module free
of THREE and therefore unit-testable. Ties break by depth, nearer first.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: Store — tool state and the move

**Files:**
- Modify: `src/store/store.ts`
- Modify: `src/store/store.test.ts`

**Interfaces:**
- Consumes: `SnapPoint` and `boardSnapPoints` from `../document/document` (Task 1).
- Produces, on `StoreState`:
  ```ts
  tool: ToolMode;                                   // 'select' | 'move'
  grabbed: SnapPoint | null;
  setTool: (tool: ToolMode) => void;
  grabSnapPoint: (point: SnapPoint) => void;
  cancelGrab: () => void;
  commitSnapMove: (target: SnapPoint) => void;
  ```
  plus `export type ToolMode = 'select' | 'move';`

**Background:** Both fields are view state — outside the document, outside the undo stack — exactly `selectedId`'s existing shape. The move is `position += (target.at − grabbed.at)`, applied through the existing `updateBoard`, which is what earns undo and autosave for free.

Two things are easy to get wrong and are both pinned by tests below:

1. **The result is not snapped to 1/16".** `Gizmo.tsx` snaps because a free drag lands on arbitrary numbers. Here the point of the operation is exact coincidence, and rounding could break it silently.
2. **A grab must not survive anything that moves the boards under it.** `grabbed.at` is a world position captured at grab time. After an undo, a redo, a document replacement, or the deletion of the grabbed board, that position no longer describes anything, and committing would move a board by a wrong delta. All four clear it.

- [ ] **Step 1: Write the failing test**

Append to `src/store/store.test.ts`. The file already imports `createBoard`, `createDocument` and `boardCenter` from `../document/document`, and takes no `vitest` import (globals are on) — extend the existing import to add `boardSnapPoints`:

```ts
import { createBoard, createDocument, boardCenter, boardSnapPoints } from '../document/document';
```

Then append:

```ts
describe('the Move tool', () => {
  /** Two boards, returned with the store reset around them. */
  const twoBoards = () => {
    useStore.setState({
      doc: createDocument(),
      selectedId: null,
      past: [],
      future: [],
      tool: 'select',
      grabbed: null,
    });
    const s = useStore.getState();
    s.addBoard();
    s.addBoard();
    const [a, b] = useStore.getState().doc.boards;
    return { a, b };
  };

  const cornerOf = (id: string) => {
    const board = useStore.getState().doc.boards.find((x) => x.id === id)!;
    return boardSnapPoints(board).find((p) => p.kind === 'corner')!;
  };

  it('starts in the select tool with nothing grabbed', () => {
    twoBoards();
    expect(useStore.getState().tool).toBe('select');
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('drops any grab when the tool changes', () => {
    const { a } = twoBoards();
    useStore.getState().setTool('move');
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    expect(useStore.getState().grabbed).not.toBeNull();
    useStore.getState().setTool('select');
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('moves the grabbed board so the two points coincide exactly', () => {
    const { a, b } = twoBoards();
    // Put b somewhere unrelated so the delta is non-trivial.
    useStore.getState().updateBoard(b.id, { position: [37.5, 11.25, -4.125] });
    const grab = cornerOf(a.id);
    const target = cornerOf(b.id);
    useStore.getState().grabSnapPoint(grab);
    useStore.getState().commitSnapMove(target);

    const moved = useStore.getState().doc.boards.find((x) => x.id === a.id)!;
    const landed = boardSnapPoints(moved).find(
      (p) => p.kind === grab.kind && p.at.every((v, i) => v === target.at[i]),
    );
    expect(landed).toBeDefined();
  });

  it('does not round the result to 1/16 inch', () => {
    const { a, b } = twoBoards();
    // 0.01 is far off any sixteenth; a snap would visibly change it.
    useStore.getState().updateBoard(b.id, { position: [0.01, 0, 0] });
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().commitSnapMove(cornerOf(b.id));
    const moved = useStore.getState().doc.boards.find((x) => x.id === a.id)!;
    expect(moved.position[0]).toBeCloseTo(0.01, 10);
  });

  it('clears the grab and selects the board it moved', () => {
    const { a, b } = twoBoards();
    // b must be moved off a first. Two fresh boards share a default position,
    // so without this the delta is exactly zero and the commit correctly takes
    // the no-op path below instead of the one under test.
    useStore.getState().updateBoard(b.id, { position: [40, 0, 0] });
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().commitSnapMove(cornerOf(b.id));
    expect(useStore.getState().grabbed).toBeNull();
    expect(useStore.getState().selectedId).toBe(a.id);
  });

  it('reverts a whole snap move with one undo', () => {
    const { a, b } = twoBoards();
    useStore.getState().updateBoard(b.id, { position: [40, 0, 0] });
    const before = [...useStore.getState().doc.boards.find((x) => x.id === a.id)!.position];
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().commitSnapMove(cornerOf(b.id));
    useStore.getState().undo();
    expect(useStore.getState().doc.boards.find((x) => x.id === a.id)!.position)
      .toEqual(before);
  });

  it('ignores a target on the grabbed board itself', () => {
    const { a } = twoBoards();
    const corners = boardSnapPoints(useStore.getState().doc.boards[0]!)
      .filter((p) => p.kind === 'corner');
    const before = [...useStore.getState().doc.boards.find((x) => x.id === a.id)!.position];
    useStore.getState().grabSnapPoint(corners[0]!);
    useStore.getState().commitSnapMove(corners[7]!);
    expect(useStore.getState().doc.boards.find((x) => x.id === a.id)!.position)
      .toEqual(before);
    expect(useStore.getState().grabbed).not.toBeNull();
  });

  it('is a no-op with nothing grabbed', () => {
    const { a, b } = twoBoards();
    const undoDepth = useStore.getState().past.length;
    useStore.getState().commitSnapMove(cornerOf(b.id));
    expect(useStore.getState().past.length).toBe(undoDepth);
    expect(useStore.getState().doc.boards.find((x) => x.id === a.id)).toBeDefined();
  });

  it('leaves no undo entry when the two points already coincide', () => {
    const { a, b } = twoBoards();
    const grab = cornerOf(a.id);
    // Move b so its grabbed-kind corner is already where a's is.
    const target = cornerOf(b.id);
    const board = useStore.getState().doc.boards.find((x) => x.id === b.id)!;
    useStore.getState().updateBoard(b.id, {
      position: [
        board.position[0] + (grab.at[0] - target.at[0]),
        board.position[1] + (grab.at[1] - target.at[1]),
        board.position[2] + (grab.at[2] - target.at[2]),
      ],
    });
    const undoDepth = useStore.getState().past.length;
    useStore.getState().grabSnapPoint(grab);
    useStore.getState().commitSnapMove(cornerOf(b.id));
    // Invariant 4's shape: a no-op edit would still push a snapshot and wipe
    // redo, so Ctrl+Z would appear to do nothing.
    expect(useStore.getState().past.length).toBe(undoDepth);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('drops a grab when the grabbed board is deleted', () => {
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().deleteBoard(a.id);
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('keeps a grab when some other board is deleted', () => {
    const { a, b } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().deleteBoard(b.id);
    expect(useStore.getState().grabbed).not.toBeNull();
  });

  it('drops a grab on undo and on redo', () => {
    const { a } = twoBoards();
    // grabbed.at is a world position captured at grab time; an undo can move
    // the board out from under it, and committing would then apply a delta
    // derived from a position that no longer describes anything.
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().undo();
    expect(useStore.getState().grabbed).toBeNull();

    useStore.getState().grabSnapPoint(cornerOf(useStore.getState().doc.boards[0]!.id));
    useStore.getState().redo();
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('drops a grab when the document is replaced', () => {
    const { a } = twoBoards();
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().replaceDocument(createDocument());
    expect(useStore.getState().grabbed).toBeNull();
  });

  it('cancelGrab clears the grab and moves nothing', () => {
    const { a } = twoBoards();
    const before = [...useStore.getState().doc.boards.find((x) => x.id === a.id)!.position];
    useStore.getState().grabSnapPoint(cornerOf(a.id));
    useStore.getState().cancelGrab();
    expect(useStore.getState().grabbed).toBeNull();
    expect(useStore.getState().doc.boards.find((x) => x.id === a.id)!.position)
      .toEqual(before);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/store/store.test.ts`
Expected: FAIL — `setTool is not a function` (and the type errors are not surfaced by vitest, which is why Step 6 exists).

- [ ] **Step 3: Add the state and actions**

In `src/store/store.ts`:

Extend the imports:

```ts
import { create } from 'zustand';
import { createBoard, createDocument, reorientedPosition, uniqueName, isSheetGood, nextId } from '../document/document';
import type { Board, Cut, SloydDocument, SnapPoint } from '../document/document';
```

Add above the `StoreState` interface:

```ts
/**
 * Which viewport tool has the pointer. View state, not document state — it is
 * never saved and never undone, exactly like `selectedId`.
 */
export type ToolMode = 'select' | 'move';
```

Add to the `StoreState` interface, after `pendingLengthFocus`/`consumeLengthFocus`:

```ts
  /**
   * The active viewport tool, and the snap point the Move tool is carrying.
   *
   * Both live here rather than being prop-drilled from App the way
   * `shortcutsSuspended` is. That flag's reasoning — putting one flag into
   * shared state "to save one prop" buys nothing — does not reach these:
   * `tool` has consumers in Toolbar, Viewport, MoveTool and (via one prop)
   * BoardMesh, at three different depths. They are still view state, so they
   * are deliberately outside the document and outside the undo stack.
   */
  tool: ToolMode;
  grabbed: SnapPoint | null;
  setTool: (tool: ToolMode) => void;
  grabSnapPoint: (point: SnapPoint) => void;
  cancelGrab: () => void;
  commitSnapMove: (target: SnapPoint) => void;
```

Add to the returned object, after `consumeLengthFocus`:

```ts
    tool: 'select',
    grabbed: null,

    // Changing tools always drops the grab. A snap point carried into a
    // different tool has nothing that can consume it.
    setTool: (tool) => set({ tool, grabbed: null }),

    grabSnapPoint: (point) => set({ grabbed: point }),

    cancelGrab: () => set({ grabbed: null }),

    /**
     * Move the grabbed board so its grabbed point lands exactly on `target`.
     *
     * One subtraction, applied through updateBoard — which is what earns undo,
     * autosave and gesture coalescing without a line of new bookkeeping.
     *
     * Deliberately NOT snapped to SNAP_INCHES. Gizmo.tsx snaps because a free
     * drag lands on arbitrary numbers and a board should come to rest where a
     * person can measure to. Here the whole point is that the two points
     * coincide exactly, and rounding could break that silently, by a
     * sixteenth. If both boards already sit on 1/16" boundaries the delta is
     * exact anyway and a snap would be a no-op — the only case where it does
     * anything is the case where it does damage.
     *
     * The patch carries `position` only, so updateBoard's reorient predicate
     * is never reached. Correct: a snap move translates, it never turns.
     */
    commitSnapMove: (target) => {
      const grabbed = get().grabbed;
      if (!grabbed) return;
      // A board cannot be snapped onto itself. It is a legal subtraction — it
      // would translate the board by its own length — but never what anyone
      // means. MoveTool also withholds these candidates so the case cannot be
      // clicked; this guard is what makes the rule true of the action itself.
      if (target.owner.id === grabbed.owner.id) return;

      const board = get().doc.boards.find((b) => b.id === grabbed.owner.id);
      if (!board) {
        set({ grabbed: null });
        return;
      }

      const delta = [
        target.at[0] - grabbed.at[0],
        target.at[1] - grabbed.at[1],
        target.at[2] - grabbed.at[2],
      ] as const;

      // Guarded before the edit, the same rule updateCut and removeCut follow:
      // edit() unconditionally pushes an undo snapshot and clears redo, so a
      // no-op move would leave a no-op undo entry (invariant 4) and silently
      // wipe the redo stack.
      if (delta[0] === 0 && delta[1] === 0 && delta[2] === 0) {
        set({ grabbed: null });
        return;
      }

      get().updateBoard(board.id, {
        position: [
          board.position[0] + delta[0],
          board.position[1] + delta[1],
          board.position[2] + delta[2],
        ],
      });
      set({ grabbed: null, selectedId: board.id });
    },
```

- [ ] **Step 4: Drop the grab wherever the boards move under it**

Still in `src/store/store.ts`. `grabbed.at` is a world position captured at grab time; four operations can invalidate it.

In `deleteBoard`, replace the body's `edit(...)` call site so the grab is dropped when its own board goes:

```ts
    deleteBoard: (id) => {
      if (!get().doc.boards.some((b) => b.id === id)) return;
      const wasSelected = get().selectedId === id;
      // A grab on the board being deleted has nothing left to move.
      if (get().grabbed?.owner.id === id) set({ grabbed: null });
      edit(
        (doc) => ({ ...doc, boards: doc.boards.filter((b) => b.id !== id) }),
        () => (wasSelected ? null : get().selectedId),
      );
    },
```

In `replaceDocument`, add `grabbed: null`:

```ts
    replaceDocument: (doc) => set({ doc, selectedId: null, past: [], future: [], grabbed: null }),
```

In `undo`, add `grabbed: null` to the `set({...})` call:

```ts
      set({
        doc: previous,
        past: past.slice(0, -1),
        future: [doc, ...future].slice(0, HISTORY_LIMIT),
        selectedId: stillThere ? selectedId : null,
        // A grab captured a world position; an undo can move the board out
        // from under it, and committing would then apply a wrong delta.
        grabbed: null,
      });
```

In `redo`, the same addition to its `set({...})`:

```ts
      set({
        doc: next,
        past: [...past, doc].slice(-HISTORY_LIMIT),
        future: future.slice(1),
        selectedId: stillThere ? selectedId : null,
        grabbed: null,
      });
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run src/store/store.test.ts`
Expected: PASS — the file's existing tests plus 14 new ones.

- [ ] **Step 6: Full suite and typecheck**

Run: `npm test` → PASS.
Run: `npm run build` → exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/store/store.ts src/store/store.test.ts
git commit -m "feat: tool state and commitSnapMove in the store

tool and grabbed are view state beside selectedId — outside the document,
outside the undo stack. The move is one subtraction through updateBoard,
which earns undo and autosave unchanged.

Deliberately not snapped to 1/16: the point of the operation is exact
coincidence, and the only case where a snap does anything is the case
where it breaks it. A zero delta is guarded before edit() so a no-op move
leaves no no-op undo entry.

A grab holds a world position, so it is dropped by delete, undo, redo and
replaceDocument — all four can move the board out from under it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: Shared drag slop, and gating board selection

**Files:**
- Create: `src/viewport/pointer.ts`
- Modify: `src/viewport/BoardMesh.tsx` (the `CLICK_DRAG_SLOP_PX` const at lines 22–27, the `Props` interface at 45–49, the signature at 51, and the `onClick` handler at 152–167)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `export const CLICK_DRAG_SLOP_PX: number` from `src/viewport/pointer.ts`; a new required `selectable: boolean` prop on `BoardMesh`.

**Background:** `MoveTool` (Task 6) needs the same click-versus-drag threshold `BoardMesh` already uses. A second copy of the number is the drift shape follow-up 64 recorded once already, so it moves to a shared module instead.

The `selectable` gate matters for a specific failure: the commit click lands *on a board* having travelled ~0 px, so it passes the slop test and selects the target board — the user drops a part and the Properties panel jumps to the wrong one.

- [ ] **Step 1: Create the shared module**

Create `src/viewport/pointer.ts`:

```ts
/**
 * How far the pointer may travel between press and release and still count as
 * a click rather than a drag, in screen pixels. Matches the slop R3F applies
 * to its own pointer-missed handling.
 *
 * Shared rather than duplicated: BoardMesh uses it to tell a select-click from
 * an orbit, and MoveTool uses it to tell a grab-click from an orbit. Two
 * copies of one threshold is the drift shape follow-up 64 recorded — a second
 * home for a constant that agrees today and can silently stop agreeing.
 */
export const CLICK_DRAG_SLOP_PX = 2;
```

- [ ] **Step 2: Point `BoardMesh` at it and add the gate**

In `src/viewport/BoardMesh.tsx`:

Delete the local constant (the doc comment and `const CLICK_DRAG_SLOP_PX = 2;`, lines 22–27) and add to the imports:

```ts
import { CLICK_DRAG_SLOP_PX } from './pointer';
```

Extend `Props`:

```ts
interface Props {
  board: Board;
  selected: boolean;
  onSelect: (id: string) => void;
  /**
   * False while a viewport tool other than Select owns the pointer.
   *
   * Passed from Viewport rather than read from the store: it is one prop from
   * this component's own parent, not a thread from App, and it keeps BoardMesh
   * prop-driven the way it already is.
   *
   * Without it the Move tool's commit click — which lands ON a board, having
   * travelled ~0 px, so it passes the slop test below — would also select that
   * board, jumping the Properties panel to the part the user just snapped TO
   * rather than the one they moved.
   */
  selectable: boolean;
}
```

Update the signature:

```ts
export function BoardMesh({ board, selected, onSelect, selectable }: Props) {
```

And the first line of the `onClick` body (before the existing `e.delta` check):

```ts
          onClick={(e) => {
            if (!selectable) return;
            // Only a click that didn't travel selects. R3F fires onClick for any
```

- [ ] **Step 3: Typecheck to confirm the new prop is required**

Run: `npm run build`
Expected: FAIL — `Property 'selectable' is missing` at `Viewport.tsx`'s `<BoardMesh …>`. This is the intended intermediate state; Task 5 supplies it. If it does **not** fail, the prop was declared optional — fix it to be required.

- [ ] **Step 4: Satisfy the call site**

In `src/viewport/Viewport.tsx`, add the store read alongside the existing ones near the top of `Viewport`:

```ts
  const tool = useStore((s) => s.tool);
```

and pass the prop in the existing `boards.map`:

```tsx
      {boards.map((board) => (
        <BoardMesh
          key={board.id}
          board={board}
          selected={board.id === selectedId}
          onSelect={selectBoard}
          selectable={tool === 'select'}
        />
      ))}
```

- [ ] **Step 5: Verify**

Run: `npm run build` → exit 0.
Run: `npm test` → PASS, unchanged count (this task adds no tests; the behaviour it gates is viewport interaction, verified in Task 9).

- [ ] **Step 6: Commit**

```bash
git add src/viewport/pointer.ts src/viewport/BoardMesh.tsx src/viewport/Viewport.tsx
git commit -m "refactor: share CLICK_DRAG_SLOP_PX, gate board selection on the tool

MoveTool needs the same click-versus-drag threshold BoardMesh uses, and a
second copy is follow-up 64's drift shape, so it moves to pointer.ts.

selectable stops the Move tool's commit click — which lands on a board
having travelled ~0px, passing the slop test — from also selecting that
board and jumping the panel to the part snapped TO rather than moved.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: `SnapMarker` — the indicator

**Files:**
- Create: `src/viewport/SnapMarker.tsx`

**Interfaces:**
- Consumes: `SnapPoint`, `SnapKind` from `../document/document` (Task 1); `screenPixelsPerInch` from `./screenScale`.
- Produces:
  ```ts
  export const SNAP_COLORS: Record<SnapKind, string>;
  export const RING_COLOR: string;
  export const MARKER_PX: number;   // 9
  export const RING_PX: number;     // 2
  export function SnapMarker({ point }: { point: SnapPoint }): JSX.Element;
  ```

**Background:** Two concentric camera-facing discs, scaled every frame so their on-screen size is constant, drawn with `depthTest={false}` so an occluded candidate's marker is still visible (design §3.2, §6). `screenPixelsPerInch` already exists and returns pixels-per-world-inch, or `NaN` for a camera type it cannot measure — the fallback below must not write `NaN` into a matrix.

No unit test: this is r3f viewport code, verified in Task 9 per the repo's working agreement.

- [ ] **Step 1: Write the component**

Create `src/viewport/SnapMarker.tsx`:

```tsx
import { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SnapKind, SnapPoint } from '../document/document';
import { screenPixelsPerInch } from './screenScale';

/**
 * Marker colour by kind. These are OFF-PALETTE on purpose, with the user's
 * explicit approval, and that is worth defending rather than quietly fixing:
 * CLAUDE.md records brass (#c99a4e) as "the one live colour in the app."
 *
 * An inference marker is transient chrome, not part of the model, and it has
 * exactly one job — telling you which KIND of point you are about to snap to,
 * before you commit. Shape cannot carry that at the ~9px a marker has to be to
 * sit on a corner without hiding it. Hue can.
 *
 * All three are cool and saturated against a palette that is entirely warm and
 * desaturated (ground #e6e3dd, grid #c6c1b8/#958f84, brass #c99a4e), so they
 * read as not-part-of-the-model rather than as a clashing member of it. The
 * hues are spread far enough apart to stay mutually distinct, and they echo
 * SketchUp's own endpoint/midpoint convention closely enough to be read
 * without a legend — muted well below SketchUp's pure primaries, which would
 * look like error states here.
 *
 * Browser-settled in the sense of follow-up 60: verified against pine, walnut
 * and plywood on this app's own ground, not argued from theory.
 */
export const SNAP_COLORS: Record<SnapKind, string> = {
  corner: '#2e9e5b',
  'edge-mid': '#22b8d4',
  'face-center': '#8a5fd0',
};

/**
 * The ring around each marker. It exists because a flat fill legible on the
 * near-white ground is not reliably legible on walnut — the ring gives every
 * marker a light border whatever it is sitting on.
 */
export const RING_COLOR = '#f5f2ec';

/** Marker diameter, in screen pixels. */
export const MARKER_PX = 9;

/** Ring thickness beyond the marker's edge, in screen pixels. */
export const RING_PX = 2;

/**
 * Everything drawn by the Move tool renders after the boards. depthTest is off
 * (see the materials below), so this is what orders the ring behind the fill.
 */
const MARKER_RENDER_ORDER = 10;

/** Enough segments that a 9px disc reads as round rather than as a polygon. */
const SEGMENTS = 24;

/**
 * One snap indicator: a coloured disc with a light ring, held at a constant
 * size on screen and drawn on top of everything.
 *
 * Constant screen size uses the same screenPixelsPerInch helper the grid tier
 * ladder does. Drawing on top (depthTest false) is what makes the design's
 * decision to keep occluded candidates pickable usable rather than merely
 * permitted: a back corner can be picked, so its marker has to be visible.
 */
export function SnapMarker({ point }: { point: SnapPoint }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const at = useMemo(
    () => new THREE.Vector3(point.at[0], point.at[1], point.at[2]),
    [point.at[0], point.at[1], point.at[2]],
  );

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const ppi = screenPixelsPerInch(camera, at, size.height);
    // screenPixelsPerInch returns NaN for a camera type it cannot measure.
    // Falling back to 1 inch per pixel keeps a (large, obvious) marker on
    // screen rather than writing NaN into the matrix, which would make the
    // whole group vanish with no clue why.
    const inchesPerPx = Number.isFinite(ppi) && ppi > 0 ? 1 / ppi : 1;
    g.scale.setScalar(inchesPerPx);
    // Face the camera. The geometry below is authored in pixels on the XY
    // plane, so the group's own rotation is the whole billboarding step.
    g.quaternion.copy(camera.quaternion);
  });

  return (
    <group ref={group} position={point.at}>
      {/* Not raycastable. The tool reads raw DOM pointer events and never
          needs a hit here, and leaving it pickable would put an invisible
          obstacle in front of the boards it sits on. Same treatment as the
          shadow-receiver plane in Viewport. */}
      <mesh renderOrder={MARKER_RENDER_ORDER} raycast={() => null}>
        <circleGeometry args={[MARKER_PX / 2 + RING_PX, SEGMENTS]} />
        <meshBasicMaterial
          color={RING_COLOR}
          depthTest={false}
          depthWrite={false}
          transparent
          opacity={0.95}
          toneMapped={false}
        />
      </mesh>
      <mesh renderOrder={MARKER_RENDER_ORDER + 1} raycast={() => null}>
        <circleGeometry args={[MARKER_PX / 2, SEGMENTS]} />
        <meshBasicMaterial
          color={SNAP_COLORS[point.kind]}
          depthTest={false}
          depthWrite={false}
          transparent
          // toneMapped off keeps the three hues exactly the values above
          // rather than whatever the renderer's tone curve makes of them —
          // these are chrome, not lit surfaces.
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build` → exit 0. (The component is unused until Task 6; `tsc` does not complain about an unused export.)

Run: `npm test` → PASS, unchanged count.

- [ ] **Step 3: Commit**

```bash
git add src/viewport/SnapMarker.tsx
git commit -m "feat: SnapMarker — a screen-constant, always-on-top snap indicator

Two camera-facing discs scaled per frame by screenPixelsPerInch, with
depthTest off so an occluded candidate's marker is still visible — which
is what makes keeping occluded candidates pickable usable rather than
merely permitted.

The three colours are off-palette with the user's explicit approval: an
inference marker's one job is naming which KIND of point you are about to
snap to, and shape cannot carry that at 9px.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 6: `MoveTool` — event wiring and hover state

**Files:**
- Create: `src/viewport/MoveTool.tsx`

**Interfaces:**
- Consumes: `boardSnapPoints`, `SnapPoint` (Task 1); `PICK_RADIUS_PX`, `pickSnapPoint`, `sameSnapPoint`, `ProjectedPoint` (Task 2); `useStore` with `tool`/`grabbed`/`grabSnapPoint`/`cancelGrab`/`commitSnapMove` (Task 3); `CLICK_DRAG_SLOP_PX` (Task 4); `SnapMarker` (Task 5).
- Produces: `export function MoveTool(): JSX.Element | null` — rendered inside `<Canvas>` by Task 7.

**Background:**

Events come from `gl.domElement` directly rather than from R3F pointer handlers. R3F only raycasts objects that have registered handlers, so getting events over *empty space* would mean adding an invisible full-screen plane that then has to be excluded from every other hit test. Raw DOM events also give canvas-relative pixels, which is exactly what `pickSnapPoint` wants.

`useThree`'s `size` is in **CSS pixels**, and so is `getBoundingClientRect()`. Do not mix in `devicePixelRatio` — the canvas renders at dpr 2–3 (see `Viewport.tsx`), but none of that reaches these coordinates.

- [ ] **Step 1: Write the component**

Create `src/viewport/MoveTool.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { boardSnapPoints } from '../document/document';
import type { SnapPoint } from '../document/document';
import { useStore } from '../store/store';
import { CLICK_DRAG_SLOP_PX } from './pointer';
import { PICK_RADIUS_PX, pickSnapPoint, sameSnapPoint } from './snapPick';
import type { ProjectedPoint } from './snapPick';
import { SnapMarker } from './SnapMarker';

/** Reused rather than allocated per candidate per pointer event. */
const projected = new THREE.Vector3();

/**
 * The Move tool: click a snap point to grab it, click another to drop the
 * grabbed board so the two points coincide exactly.
 *
 * Renders nothing and listens to nothing unless `tool === 'move'`.
 */
export function MoveTool() {
  const tool = useStore((s) => s.tool);
  const boards = useStore((s) => s.doc.boards);
  const grabbed = useStore((s) => s.grabbed);

  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  const [hovered, setHovered] = useState<SnapPoint | null>(null);
  // Mirrors `hovered` so the pointermove handler can compare against the
  // current pick without re-subscribing the listener on every hover change.
  const hoveredRef = useRef<SnapPoint | null>(null);
  // Where the pointer went down, for the click-versus-drag test.
  const downAt = useRef<{ x: number; y: number } | null>(null);

  /**
   * Every board's candidates, minus the grabbed board's own.
   *
   * Withholding same-board candidates is what makes the exclusion legible: an
   * ineligible point draws no marker, so the case is never offered rather than
   * being offered and then silently ignored on click. (commitSnapMove guards
   * it too — that guard makes the rule true of the action, this makes it true
   * of the UI.)
   */
  const candidates = useMemo(() => {
    const all = boards.flatMap(boardSnapPoints);
    return grabbed ? all.filter((p) => p.owner.id !== grabbed.owner.id) : all;
  }, [boards, grabbed]);

  useEffect(() => {
    if (tool !== 'move') {
      hoveredRef.current = null;
      setHovered(null);
      return;
    }

    const el = gl.domElement;

    /** World position -> canvas pixels, or null for a point the camera cannot see. */
    const project = (at: [number, number, number]): ProjectedPoint | null => {
      projected.set(at[0], at[1], at[2]).project(camera);
      // Outside the normalised depth range means behind the camera (or beyond
      // the far plane). This is the whole of the culling pickSnapPoint relies
      // on: without it, a point behind a perspective camera projects to a
      // mirrored position in FRONT of the cursor and reads as a near miss.
      if (projected.z < -1 || projected.z > 1) return null;
      return {
        x: (projected.x * 0.5 + 0.5) * size.width,
        y: (-projected.y * 0.5 + 0.5) * size.height,
        // NDC z, not distance to the camera position: it is monotonic in view
        // depth for both projections, where a radial distance is not.
        depth: projected.z,
      };
    };

    const cursorOf = (e: PointerEvent) => {
      // size.width/height are CSS pixels and so is the bounding rect. The
      // canvas renders at dpr 2-3, and none of that belongs here.
      const rect = el.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      downAt.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      const next = pickSnapPoint(candidates, project, cursorOf(e), PICK_RADIUS_PX);
      // Committed to React only when the pick actually changes. pointermove
      // fires far more often than that — the same "re-evaluate continuously,
      // commit only on change" pattern AdaptiveGrid uses for grid tiers.
      if (sameSnapPoint(next, hoveredRef.current)) return;
      hoveredRef.current = next;
      setHovered(next);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const down = downAt.current;
      downAt.current = null;
      if (!down) return;
      // A release that travelled is an orbit, a pan or a zoom — not a click.
      // OrbitControls needs no gate precisely because of this test: the camera
      // stays fully usable between grabbing a point and dropping it.
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > CLICK_DRAG_SLOP_PX) return;

      // Re-picked at the release position rather than trusting the last
      // pointermove: a pen or touch click can produce no pointermove at all.
      const hit = pickSnapPoint(candidates, project, cursorOf(e), PICK_RADIUS_PX);
      // Read imperatively: `grabbed` from the render closure would be stale
      // for any event arriving between a store write and the next commit.
      const store = useStore.getState();
      if (!store.grabbed) {
        if (hit) store.grabSnapPoint(hit);
        return;
      }
      if (hit) store.commitSnapMove(hit);
      else store.cancelGrab();
    };

    const onPointerLeave = () => {
      hoveredRef.current = null;
      setHovered(null);
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointerleave', onPointerLeave);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointerleave', onPointerLeave);
    };
    // `candidates` is in the list because the handlers close over it, and it
    // already depends on both `boards` and `grabbed`. `size.width`/`.height`
    // rather than `size` so a re-created size object does not resubscribe.
  }, [tool, candidates, gl, camera, size.width, size.height]);

  if (tool !== 'move') return null;

  return (
    <>
      {/* The grabbed point stays marked while carrying it, so the user can
          see what they picked up. Both can be on screen at once. */}
      {grabbed && <SnapMarker point={grabbed} />}
      {hovered && <SnapMarker point={hovered} />}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build` → exit 0.
Run: `npm test` → PASS, unchanged count.

- [ ] **Step 3: Commit**

```bash
git add src/viewport/MoveTool.tsx
git commit -m "feat: MoveTool — canvas pointer wiring for snap-move

Events come from gl.domElement rather than R3F handlers: R3F only
raycasts objects with handlers, so covering empty space would mean an
invisible full-screen plane excluded from every other hit test. Raw DOM
events also give canvas-relative pixels, which is what the picker wants.

Same-board candidates are withheld while grabbed, so an ineligible point
draws no marker instead of being offered and silently ignored.

Hover is committed to React only when the pick changes — AdaptiveGrid's
pattern, since pointermove fires far more often than that.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 7: Wire the tool into the viewport

**Files:**
- Modify: `src/viewport/Viewport.tsx` (the `Viewport` function, roughly lines 236–367)
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `MoveTool` (Task 6), `tool` from the store (Task 3).
- Produces: nothing new; this is wiring.

**Background:** Three of the design's four gates (§5.2) land here — `onPointerMissed`, the gizmo, and (already done in Task 4) `BoardMesh`. The fourth, Delete/Backspace, is Task 8's.

- [ ] **Step 1: Gate the deselect, hide the gizmo, render the tool**

In `src/viewport/Viewport.tsx`, add the import beside the others:

```ts
import { MoveTool } from './MoveTool';
```

`const tool = useStore((s) => s.tool);` was already added in Task 4 — do not add it twice.

Change the `<Canvas>` opening tag (line 257) to gate the deselect and set the cursor:

```tsx
    <Canvas
      shadows
      dpr={[2, 3]}
      // A modal tool must not change the selection as a side effect. Without
      // this, cancelling a grab by clicking empty space would also clear the
      // selection, and the Properties panel would empty for no stated reason.
      onPointerMissed={() => { if (tool === 'select') selectBoard(null); }}
      // R3F puts `style` on the wrapping div; the canvas inherits the cursor.
      // This is the only signal, other than the toolbar, that the tool is armed.
      style={{ cursor: tool === 'move' ? 'crosshair' : undefined }}
    >
```

Replace the bare `<Gizmo />` (line 336) with:

```tsx
      {/* The gizmo's handles sit over the very board whose corner the Move
          tool is trying to grab, and it captures the pointer first. There is
          no way to share the pointer between them, so it is not rendered. */}
      {tool === 'select' && <Gizmo />}
      <MoveTool />
```

- [ ] **Step 2: Confirm the deselect gate reads the current tool**

The `tool` value is read via `useStore` at the top of `Viewport`, so `Viewport` re-renders whenever it changes and the `onPointerMissed` closure is fresh. No `getState()` call is needed. Read the file back and confirm there is exactly one `const tool =` line in it.

Run: `grep -c 'const tool = useStore' src/viewport/Viewport.tsx`
Expected: `1`

- [ ] **Step 3: Typecheck and run**

Run: `npm run build` → exit 0.
Run: `npm test` → PASS, unchanged count.

- [ ] **Step 4: Commit**

```bash
git add src/viewport/Viewport.tsx
git commit -m "feat: wire MoveTool into the viewport

Two of the design's four gates land here: onPointerMissed no longer
deselects in move mode (a modal tool must not change the selection as a
side effect), and the gizmo is not rendered, since its handles sit over
the board whose corner the tool is trying to grab.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 8: Toolbar buttons and keyboard

**Files:**
- Modify: `src/panels/Toolbar.tsx`
- Modify: `src/App.tsx` (the window keydown effect, roughly lines 115–152)

**Interfaces:**
- Consumes: `tool`, `setTool`, `grabbed`, `cancelGrab` from the store (Task 3).
- Produces: nothing new.

**Background — read this before touching `App.tsx`.** CLAUDE.md's standing rule is that *"any new `window` listener must join this list"* — the list of window-level shortcuts that take the cut-list open flag explicitly, because `inert` cannot touch a window listener. The design (§5.5) anticipated adding one. **Do not add one.** All three new bindings go inside `App`'s *existing* keydown effect, which already early-returns on `cutListOpen` at its top. That satisfies the rule more cheaply than a second listener would, and it is the correct outcome: pressing Escape while reading the cut list must close the sheet, not silently cancel a grab behind it.

- [ ] **Step 1: Add the Select / Move pair to the toolbar**

In `src/panels/Toolbar.tsx`, add to the store reads at the top of the component:

```ts
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
```

and insert after the undo/redo group's closing `<span className="toolbar-divider" />` — i.e. immediately before the `<button onClick={onToggleProjection}` block:

```tsx
        <button
          onClick={() => setTool('select')}
          aria-pressed={tool === 'select'}
          title="Select tool — click a part to select it, drag its gizmo to move it (Esc)"
        >
          Select
        </button>
        <button
          onClick={() => setTool('move')}
          aria-pressed={tool === 'move'}
          title="Move tool — click a corner or midpoint, then click one on another part to snap them together (M)"
        >
          Move
        </button>
        <span className="toolbar-divider" />
```

`button[aria-pressed='true']` is already styled in `styles.css` (the Orthographic toggle uses it), so no CSS is needed.

- [ ] **Step 2: Add the three key bindings**

In `src/App.tsx`, inside the existing `onKey` handler, **after** the `if (cutListOpen) return;` guard and **before** the `Ctrl+Z` block:

```ts
      // Escape backs out one level: drop the grab first, then the tool. Note
      // this sits below the cutListOpen guard on purpose — CutList owns
      // Escape while it is open, and a grab behind the sheet must survive it.
      if (e.key === 'Escape') {
        const { grabbed, tool, cancelGrab, setTool } = useStore.getState();
        if (grabbed) {
          e.preventDefault();
          cancelGrab();
        } else if (tool !== 'select') {
          e.preventDefault();
          setTool('select');
        }
        return;
      }

      // M toggles the Move tool. Modifier chords are left alone — Ctrl+M and
      // Cmd+M are the browser's and the OS's.
      if (e.key === 'm' || e.key === 'M') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        const { tool, setTool } = useStore.getState();
        setTool(tool === 'move' ? 'select' : 'move');
        return;
      }
```

and add the fourth gate to the existing Delete/Backspace block, immediately after its modifier check:

```ts
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // Deleting the board currently being carried would leave the grab
        // pointing at something that no longer exists. The store drops the
        // grab defensively too; this is what stops the delete happening at all.
        if (useStore.getState().grabbed) return;
        const id = useStore.getState().selectedId;
        if (!id) return;
        e.preventDefault();
        deleteBoard(id);
      }
```

- [ ] **Step 3: Typecheck and run**

Run: `npm run build` → exit 0.
Run: `npm test` → PASS, unchanged count.

- [ ] **Step 4: Confirm no second window listener was added**

Run: `grep -n "addEventListener('keydown'" src/App.tsx src/viewport/*.tsx src/panels/*.tsx`
Expected: exactly the two that existed before this round — one in `App.tsx`, one in `Viewport.tsx`'s `CameraKeys`. If a third appears, remove it and fold its binding into `App`'s existing handler.

- [ ] **Step 5: Commit**

```bash
git add src/panels/Toolbar.tsx src/App.tsx
git commit -m "feat: Select/Move toolbar pair, M / Escape, and the Delete guard

All three bindings go inside App's EXISTING window keydown effect rather
than a new listener. That effect already early-returns on cutListOpen,
which satisfies CLAUDE.md's rule that every window shortcut take the flag
explicitly — and gives the right behaviour: Escape while reading the cut
list closes the sheet rather than silently cancelling a grab behind it.

Escape backs out one level at a time, grab before tool. Delete no-ops
while a board is being carried.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 9: Browser verification

**Files:**
- Create: `docs/browser-verification-snap-move.md`

**Background:** This is the repo's rule for viewport work — *"the r3f viewport has no unit tests by design — verify it by driving a real browser, not by asserting on mocks."* Use the Playwright MCP (the only browser tooling that works on this host). Start the dev server with `npm run dev -- --port <n>` on a free port.

Note the standing hardware caveat, follow-up 26a: this host runs software GL (llvmpipe), which returns `1.0` for `pow(0.0, 0.0)` where real hardware returns `NaN`. Nothing in this round rests on undefined shader behaviour — the markers are `MeshBasicMaterial` — so record the caveat and proceed.

Write findings as findings. Follow-ups 64, 68, 80, 87 and 88 record five separate occasions in this repo where a plausible prose justification did not reproduce under review. If a constant looks wrong, say so and change it; if something cannot be checked here, say that instead of implying it passed.

- [ ] **Step 1: Build a fixture model**

In the running app, create at least four boards covering: a pine board flat, a walnut board on edge, a plywood board upright, and one board with a dado (so the marker is checked against a part with joinery even though cut shoulders are not candidates). Position them so some corners are silhouetted against empty space and some are occluded by other parts.

- [ ] **Step 2: Check the markers**

Record a screenshot for each. Confirm:

- [ ] Hovering a **corner** shows a green (`#2e9e5b`) marker.
- [ ] Hovering an **edge midpoint** shows a cyan (`#22b8d4`) marker.
- [ ] Hovering a **face centre** shows a violet (`#8a5fd0`) marker.
- [ ] All three are legible on pine, on walnut and on plywood — the ring is what carries this on walnut.
- [ ] The marker holds its size when the camera zooms from close to far.
- [ ] No marker appears at a board's volume centre.

- [ ] **Step 3: Check the two picking decisions the design argued for**

- [ ] A corner **silhouetted against empty space** is pickable. This is §3.1's entire justification; if it fails, the projector or the DOM-coordinate conversion is wrong.
- [ ] A corner **occluded behind another board** is pickable, and its marker draws on top rather than being buried.

- [ ] **Step 4: Check the move itself**

- [ ] Grab a corner on board A, click a corner on board B: A moves and the two points coincide. **Verify by reading the numbers, not by eye.** Autosave writes the whole document to `localStorage` under `AUTOSAVE_KEY` (`'sloyd.autosave.v1'`, exported from `src/storage/browser.ts`), debounced, so evaluate this in the page after the move settles:

```js
JSON.parse(localStorage.getItem('sloyd.autosave.v1'))
  .boards.map((b) => ({
    name: b.name,
    position: b.position,
    dims: [b.length, b.width, b.thickness],
    posture: b.posture,
    rotation: b.rotation,
  }))
```

Compute the two boards' corner positions from `position` + extents by hand and confirm they are equal to full precision. Record the actual numbers in the report — "looked right" is not a result.

- [ ] The landed position is **not** rounded to 1/16": set board B to a position like `0.01` first, snap to it, and confirm A lands on the same off-grid number.
- [ ] One `Ctrl+Z` reverts the whole move.
- [ ] Orbiting between the grab and the drop leaves the grab intact — the grabbed marker stays on screen and the commit still works.
- [ ] The grabbed marker and the hover marker are both visible while carrying.
- [ ] Hovering the grabbed board itself offers **no** markers while carrying.

- [ ] **Step 5: Check all four gates (§5.2)**

- [ ] Clicking a board while the Move tool is active does **not** select it.
- [ ] Clicking empty space while the Move tool is active does **not** deselect.
- [ ] The gizmo is absent while the Move tool is active, and returns on Escape.
- [ ] Delete does nothing while a board is being carried, and deletes normally otherwise.

- [ ] **Step 6: Check the keyboard and the modal interaction**

- [ ] `M` enters the tool; `M` again leaves it; `Escape` cancels a grab, and a second `Escape` leaves the tool.
- [ ] Typing `m` in the project-name field or a dimension field does **not** enter the tool (`isTextEntry` should already cover this).
- [ ] Open the cut list while in the Move tool with a grab held: `Escape` closes the sheet and the grab is **still held** afterward. This is §5.5's specific requirement.
- [ ] The cursor is a crosshair while the tool is active.

- [ ] **Step 7: Retune the constants if the render says to**

`PICK_RADIUS_PX`, `MARKER_PX`, `RING_PX` and the four colours are browser-settled. If any needs changing, change it, note the before/after in the report, and re-run the affected checks. A constant kept unchanged should be recorded as *verified*, not assumed.

- [ ] **Step 8: Write the report**

Create `docs/browser-verification-snap-move.md` covering: what was checked, the screenshots taken, the actual position numbers from Step 4, any constant that changed and why, and — explicitly — anything that could **not** be checked on this host.

- [ ] **Step 9: Commit**

```bash
git add docs/browser-verification-snap-move.md
# plus any constant files changed in Step 7
git commit -m "docs: browser verification for the snap-move round

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 10: Documentation

**Files:**
- Modify: `docs/follow-ups.md`
- Modify: `CLAUDE.md`

**Background:** Existing follow-ups run to **94**, so this round's start at **95**. Follow the file's existing per-round section format.

- [ ] **Step 1: Add the follow-ups section**

Append a `## From the snap-move round` section to `docs/follow-ups.md` with at least these entries, plus anything Task 9 found:

- **95 — Cut shoulders are not snap points.** A dado's shoulders are real corners a woodworker would expect to snap to, and `boardSolids` already yields them. Deferred at the user's explicit direction to keep v1 small. Cheap when it lands: a second provider over the same board, not a change to `pickSnapPoint` — see the design's §2.3.
- **96 — No free movement.** Away from a candidate the board does not move and the second click cancels. Free-hand positioning stays the gizmo's job. Ground-plane or face projection is what SketchUp actually does and needs a ray/plane intersection, a rule for a cursor pointing at the sky, and a live preview to make the result legible.
- **97 — No axis inference or locking**, because there is no free movement to constrain.
- **98 — No ghost preview** of the landing position. Rejected with the user: with snap-targets-only the result is fully determined by the marker already under the cursor, and a preview costs a second render of the board's geometry.
- **99 — Single-board moves only.** The store holds one `selectedId`; moving several parts at once is a selection-model change, not a tool change.
- **100 — Occluded candidates are pickable on purpose.** Rejecting them costs an occlusion raycast per candidate, and from some angles the silhouetted corner §3.1 exists for *is* the occluded one. Recorded because it is the kind of decision a later reader would otherwise read as an oversight.
- **101 — The tape measure, guide points and guide lines.** Named by the user as the intended follow-ups. Guides persist, so they need a schema bump (v6) and a `guides` array beside `boards` and `stock`; the tape measure probably needs none. This round's only obligation to them was §2.3's `SnapOwner` union, which it discharged.

- [ ] **Step 2: Update `CLAUDE.md`**

Four edits:

1. **Status** — add the snap-move round to the "**v1 shipped**, followed by …" paragraph, noting it is the first work on the viewport's *interaction* surface since the gizmo size ceiling, and that it is **not** a cut-list descendant. Update the test count to whatever `npm test` reports. Note that production no longer matches `master` until this is deployed.
2. **A "What the snap-move round did" section**, in the same voice as the sheet-nesting one: the 26-point lattice and why the volume centre is excluded; the `SnapOwner` union as the decision that outlives the round; screen-space picking rather than raycast-first, with the silhouetted-corner justification; the move as one subtraction through `updateBoard` and deliberately unsnapped; and `tool`/`grabbed` in the store rather than prop-drilled, with the explicit contrast against `shortcutsSuspended`'s reasoning.
3. **"Where things live"** — add `src/document/snapPoints.ts`, `src/viewport/snapPick.ts`, `src/viewport/pointer.ts`, `src/viewport/SnapMarker.tsx`, `src/viewport/MoveTool.tsx`, and note `BoardMesh`'s new `selectable` prop.
4. **Two new invariants**, numbered 24 and 25:

   - **24 — A grab holds a world position, so anything that moves the boards under it must drop it.** `grabbed.at` is captured at grab time. `deleteBoard`, `undo`, `redo` and `replaceDocument` all clear it, and all four are load-bearing rather than defensive: committing after any of them would apply a delta derived from a position that no longer describes anything, moving a board by a wrong amount with nothing on screen to indicate why. A future action that rewrites `doc.boards` wholesale joins this list.
   - **25 — The snap move is deliberately NOT rounded to `SNAP_INCHES`, and this is the opposite of what `Gizmo.tsx` does.** The gizmo snaps because a free drag lands on arbitrary numbers. A snap move's entire purpose is exact coincidence of two points; if both boards already sit on 1/16" boundaries the delta is exact and a snap is a no-op, so the only case where rounding does anything is the case where it silently breaks the result by a sixteenth. Compare invariant 22, which makes the same shape of argument for `nesting.ts`'s epsilon: apply the tolerance that matches the arithmetic you actually have, rather than one rule everywhere.

   Also extend **invariant 2**'s note on `updateBoard`: a snap move patches `position` only, so the reorient predicate is correctly never reached — a snap move translates, it never turns.

- [ ] **Step 3: Verify the counts quoted in `CLAUDE.md` are real**

Run: `npm test`
Copy the reported total into `CLAUDE.md`. Do not carry `617` forward unchanged — this round adds roughly 43 tests.

Run: `npm run build` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add docs/follow-ups.md CLAUDE.md
git commit -m "docs: close out the snap-move round

Follow-ups 95-101, two new invariants (a grab holds a world position and
must be dropped by anything that moves the boards under it; the snap move
is deliberately not rounded to SNAP_INCHES, the opposite of the gizmo),
and the round's own section in the status summary.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Done

After Task 10, use `superpowers:finishing-a-development-branch` to decide how to integrate. If the work was done on a branch: `git merge --no-ff`, verify the merged tree with `npm test` and `npm run build`, then delete the branch. **No pull request.**

Deployment is a separate, user-gated decision — `DEPLOYMENT.local.md` has the runbook. Note that this round makes **no schema change**, so unlike the last deploy there is no version-gate rollback cost.
