# Plans Sheet and Exploded View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A printable Plans sheet (exploded isometric, dimensioned third-angle elevations of the piece
and of each assembly) and a live exploded view in the viewport behind a 0–1 slider.

**Architecture:** Every solid is an axis-aligned box, so drawings are exact vector hidden-line
projections computed in the `document` layer (`drawing.ts`), with no rendering. The exploded offsets
(`explode.ts`) are pure and shared by the viewport and the sheet. Dimension strings are built in
`document/dimensions.ts`. Fitting them, which needs `labelWidth`, happens in `panels/planDims.ts`.
The viewport's explode amount is store view state, and the store's `edit()`, `undo`, `redo`,
`setTool` and `renameItem` refuse while it is above 0: one gate.

**Tech Stack:** TypeScript, React 18, Zustand, react-three-fiber (viewport only), Vitest +
Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-11-sloyd-plans-sheet-design.md`, including its "amended
during planning" notes. Read the spec before each task. Read `CLAUDE.md` before the first one.

## Global Constraints

- **No schema change.** `CURRENT_VERSION` stays 13. Nothing here touches `migrateDocument` or the
  document shape.
- **Layer rules:** `document` imports nothing from `store`, `viewport` or `panels`. `panels` does not
  import `viewport`. `document/dimensions.ts` imports `units`; `drawing.ts`, `explode.ts` and
  `plans.ts` do NOT (the `→ units` edge rule).
- **The ONE homes:**
  - World solids come from `worldSolids` (invariant 38).
  - Lines come from `boardEdges` (invariant 16).
  - Local→world points come from `toWorld` in `snapPoints.ts`, exported by Task 1. Never use
    `pointToLocalXYZ` or `solidWorldBox`, which are centre-relative.
  - Placed parts come from `worldParts` or `partsBelow`.
- **Invariant 19:** the dimension string that is measured is the one drawn, built in
  `dimensions.ts`. `LABEL_SIZE` is set only as the `<svg fontSize>` attribute. CSS never sets a
  font-size on SVG text.
- **Invariant 34:** no component reads `gesturing`/`gestureSnapshotTaken`. Store tests assert undo
  entries (`past.length`), not those flags.
- **Invariant 24:** `setExplode` adds no clearing writer of its own. It calls `setTool('select')`.
- **Invariant 1:** the explode offset is a render-time translation only. Nothing writes it back.
- **Constants (initial values, tuned by eye in Task 10):** `DRAW_EPS = 1e-6`,
  `EXPLODE_SPREAD = 1`, `EXPLODE_INNER = 0.5`, `CHAIN_MAX = 12`, `DIM_LABEL_PAD = 8`,
  `PLAN_WIDTH = 1000`, `DIM_BAND = 56`, `VIEW_GAP = 24`, `MAX_PLAN_SCALE = 24`, `ISO_MAX_HEIGHT = 640`,
  `ISO_MARGIN = 16`. The sheet's default explode amount is `0.6`.
- **Every expected value in a test is hand-derived** in the test (a comment shows the arithmetic),
  never read back from the code under test. **Mutate each test once** (change the code or fixture so
  the test must fail, see it fail, restore). If a hand value disagrees with the code, find out why
  before touching either. The values in this plan were checked against a scratch prototype of
  Task 1's algorithm. Escalate if one still disagrees.
- `npm test` does not typecheck. Run `npm run build` before claiming a task compiles.
- Commit to `master` directly (no PRs). End each commit message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A cut that removes a whole end of a part** (a full-width, full-thickness slab): the drawing's
   bounds and the dimensions must still agree. Both read the part's BOARD box (`position` +
   `boardExtents`), never the solids' extent. Pinned in Task 1 (bounds from board boxes) and
   Task 3.
2. **An empty project or an assembly with no parts**: the sheet must show "Nothing to draw yet."
   and skip empty assemblies, never draw a NaN-sized SVG. Pinned in Tasks 4, 7 and 9.
3. **A focused field while the user grabs the slider**: blur runs first (`endGesture`), so
   `setExplode` is accepted. A slider change while a gesture is open is refused, and the slider must
   then still show the store's value (it is controlled). Pinned in Tasks 5 and 6.
4. **Rename while exploded**: `renameItem` must return the stored name, or a NameField shows a name
   that was never written (invariant 9). Pinned in Task 5.
5. **A mirrored or nested assembly on the sheet**: the drawing uses the definition's LOCAL parts,
   the copy count includes nested placements, and the mirrored count uses parity along the path.
   Pinned in Task 4.

---

### Task 1: Hidden-line drawing — `document/drawing.ts`

**Files:**
- Modify: `src/document/snapPoints.ts` (export `toWorld`; no behaviour change)
- Create: `src/document/drawing.ts`
- Test: `src/document/drawing.test.ts`

**Interfaces:**
- Consumes: `boardEdges(board): Segment[]` (`cuts.ts`), `worldSolids(b): Box[]` (`designCheck.ts`),
  `toWorld(board, p): [number, number, number]` (`snapPoints.ts`), `boardExtents` (`geometry.ts`),
  `Vec3` (`frames.ts`).
- Produces:
  - `View { toward: Vec3; right: Vec3; up: Vec3; title: string; rightName: string; upName: string }`
  - `FRONT`, `SIDE`, `TOP`, `ISO: View`
  - `P2 = [number, number]`
  - `Seg2 { a: P2; b: P2; part: string }`
  - `Drawing { visible: Seg2[]; hidden: Seg2[]; bounds: { min: P2; max: P2 } }`
  - `DRAW_EPS`
  - `hiddenSpan(a: Vec3, e: Vec3, box: { min: readonly number[]; max: readonly number[] }, toward: Vec3, sMax: number): [number, number] | null`
  - `drawView(parts: readonly Board[], view: View, offsets?: ReadonlyMap<string, Vec3>): Drawing`

- [ ] **Step 1: Export `toWorld`.** In `src/document/snapPoints.ts`, change `function toWorld(` to
  `export function toWorld(`. Append one sentence to its doc comment: "Exported as the ONE home of the
  part→world point mapping; `drawing.ts` reads edges through it (plans-sheet spec §2.1)."

- [ ] **Step 2: Write the failing tests** in `src/document/drawing.test.ts`:

```ts
import { createBoard } from './document';
import type { Board } from './types';
import { drawView, hiddenSpan, FRONT, ISO, TOP, type Seg2 } from './drawing';

const len = (s: Seg2) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
const total = (segs: Seg2[], part?: string) =>
  segs.filter((s) => part === undefined || s.part === part).reduce((n, s) => n + len(s), 0);
const horizontalAt = (segs: Seg2[], y: number) =>
  segs.filter((s) => Math.abs(s.a[1] - y) < 1e-9 && Math.abs(s.b[1] - y) < 1e-9);
const verticalAt = (segs: Seg2[], x: number) =>
  segs.filter((s) => Math.abs(s.a[0] - x) < 1e-9 && Math.abs(s.b[0] - x) < 1e-9);

// Flat at turn 0: length on X, thickness on Y (up), width on Z (CLAUDE.md, axisFrame).
const box = (id: string, length: number, width: number, thickness: number, position: [number, number, number] = [0, 0, 0], extra: Partial<Board> = {}) =>
  createBoard({ id, name: id, length, width, thickness, position, ...extra });

describe('drawView', () => {
  it('draws a lone box in front view: front edges visible, back edges hidden beneath them', () => {
    // X 0..10, Y 0..2, Z 0..4. Four X-edges (10 each) and four Y-edges (2 each) project;
    // the four Z-edges project to points and are skipped. Front (z=4): 10+10+2+2 = 24 visible.
    // Back (z=0): their rays graze the box along +Z (spec §2.3), so hidden: 24.
    const d = drawView([box('b', 10, 4, 2)], FRONT);
    expect(total(d.visible)).toBeCloseTo(24, 9);
    expect(total(d.hidden)).toBeCloseTo(24, 9);
    expect(d.bounds).toEqual({ min: [0, 0], max: [10, 2] });
  });

  it('hides the part of a rear box that a front box covers', () => {
    // R: X 0..10, Y 0..2, Z 0..4. F: X 3..7, Y 0..2, Z 10..11 (in front).
    // R's own back edges: 10+10+2+2 = 24 hidden. R's front X-edges (y=0, y=2) are covered for
    // x in [3,7]: 4+4 = 8 more. R hidden = 32; R visible = 20 - 8 + 2 + 2 = 16.
    const R = box('R', 10, 4, 2);
    const F = box('F', 4, 1, 2, [3, 0, 10]);
    const d = drawView([R, F], FRONT);
    expect(total(d.hidden, 'R')).toBeCloseTo(32, 5);
    expect(total(d.visible, 'R')).toBeCloseTo(16, 5);
    // Moved clear (x 20..24), F covers nothing of R: R hidden falls by 8 to 24.
    const clear = drawView([R, { ...F, position: [20, 0, 10] }], FRONT);
    expect(total(clear.hidden, 'R')).toBeCloseTo(24, 5);
  });

  it('keeps a flush joint line visible and hides what the board above covers (isometric)', () => {
    // A: X 0..10, Y 0..1, Z 0..4; B the same on top (Y 1..2). Viewed from +X+Y+Z, an axis-aligned
    // unit length projects to sqrt(2/3). A's visible edges: X-edges at (y,z)=(0,4),(1,4): 20;
    // Y-edges at (x,z)=(10,0),(0,4),(10,4): 3; Z-edges at (x,y)=(10,0),(10,1): 8. Total 31.
    // (A lone box would also show its far top edges, (y,z)=(1,0) and (x,y)=(0,1); B hides them.)
    const A = box('A', 10, 4, 1);
    const B = box('B', 10, 4, 1, [0, 1, 0]);
    const d = drawView([A, B], ISO);
    expect(total(d.visible, 'A')).toBeCloseTo(31 * Math.sqrt(2 / 3), 6);
  });

  it('draws a hidden mortise as dashed lines in the front view, through the seam between solids', () => {
    // 20 (X) x 4 (Z) x 2 (Y). Mortise into the top: x 8..9, y 1..2, z 1..3 (stops 1 each end).
    // Its walls at x=8 and x=9, y 1..2, are behind the front material (z 3..4) — hidden. The ray
    // from a wall runs exactly along a seam between abutting solids; the union is solid (spec §2.3).
    const leg = box('M', 20, 4, 2, [0, 0, 0], {
      cuts: [{ id: 'c', face: 'thickness', from: 'max', across: 'width', offset: 8, width: 1, depth: 1, stopMin: 1, stopMax: 1 }],
    });
    const d = drawView([leg], FRONT);
    for (const x of [8, 9]) {
      expect(total(verticalAt(d.hidden, x))).toBeCloseTo(2, 9); // two walls (z=1, z=3), 1 each
      expect(verticalAt(d.visible, x)).toHaveLength(0);
    }
    // Front outline 20+20+2+2 = 44 visible. Hidden: back outline 44 (graze), mortise walls 4,
    // mortise floor edges 1+1, rim edges at z=1 and z=3 on y=2: 1+1. 44 + 8 = 52.
    expect(total(d.visible)).toBeCloseTo(44, 9);
    expect(total(d.hidden)).toBeCloseTo(52, 9);
  });

  it('hides part of every stick in a three-stick cycle, which no draw order can produce', () => {
    // Centre lines A (x,0,1), B (1,y,0), C (0,1,z). Seen along (1,1,1), A crosses in front of B
    // (zA > zB), B in front of C (xB > xC), C in front of A (yC > yA). Sticks are 0.5 square.
    const SA = box('SA', 7, 0.5, 0.5, [-3, -0.25, 0.75]);                                   // along X
    const SB = box('SB', 7, 0.5, 0.5, [0.75, -3, -0.25], { posture: 'upright' });            // along Y
    const SC = box('SC', 0.5, 7, 0.5, [-0.25, 0.75, -3]);                                     // along Z
    const all = drawView([SA, SB, SC], ISO);
    for (const s of [SA, SB, SC]) {
      const alone = total(drawView([s], ISO).hidden);
      // Each stick loses more than a whole inch of projected line to the one in front of it.
      expect(total(all.hidden, s.id)).toBeGreaterThan(alone + 1);
    }
  });

  it('maps an on-edge part through its reversed thickness (fu 215)', () => {
    // On-edge at turn 0: L on X, W on Y, T on Z with thickness REVERSED (thickness 0 at z = 2).
    // A rabbet from thickness MIN, width 0..1, depth 0.5, therefore sits at z 1.5..2 — the FRONT.
    // Its shoulder line at y = 1 is visible for the full length 10. Mapped without the reversal
    // the rabbet would be at the back and that line hidden.
    const part = box('E', 10, 4, 2, [0, 0, 0], {
      posture: 'on-edge',
      cuts: [{ id: 'r', face: 'thickness', from: 'min', across: 'length', offset: 0, width: 1, depth: 0.5, stopMin: 0, stopMax: 0 }],
    });
    const d = drawView([part], FRONT);
    expect(total(horizontalAt(d.visible, 1))).toBeCloseTo(10, 9);
  });

  it('draws a turned part with its world extents', () => {
    // Flat, turned 90: width on X, length on Z. Top view: right = +X, up = -Z.
    const d = drawView([box('T', 10, 4, 1, [0, 0, 0], { rotation: 90 })], TOP);
    expect(d.bounds).toEqual({ min: [0, -10], max: [4, 0] });
  });

  it('adds offsets to edges, solids and bounds', () => {
    const d = drawView([box('b', 10, 4, 2)], FRONT, new Map([['b', [5, 1, 0] as [number, number, number]]]));
    expect(d.bounds).toEqual({ min: [5, 1], max: [15, 3] });
  });

  it('returns an empty drawing for no parts', () => {
    expect(drawView([], FRONT)).toEqual({ visible: [], hidden: [], bounds: { min: [0, 0], max: [0, 0] } });
  });
});

describe('hiddenSpan', () => {
  const t: [number, number, number] = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
  it('hides a point whose ray enters the box', () => {
    // (1,-1,0) + s(1,1,1) at s = 1 is (2,0,1), the centre line of A (x -3..4, y ±0.25, z 0.75..1.25).
    const span = hiddenSpan([1, -1.01, 0], [1, -0.99, 0], { min: [-3, -0.25, 0.75], max: [4, 0.25, 1.25] }, t, 100);
    expect(span).toEqual([0, 1]);
  });
  it('does not hide an edge on a face the ray leaves through', () => {
    // Front-top edge of X 0..10, Y 0..2, Z 0..4, viewed from +Z: the ray leaves at once.
    expect(hiddenSpan([0, 2, 4], [10, 2, 4], { min: [0, 0, 0], max: [10, 2, 4] }, [0, 0, 1], 100)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail.**
  Run: `npx vitest run src/document/drawing.test.ts`
  Expected: FAIL, "Failed to resolve import ./drawing".

- [ ] **Step 4: Implement** `src/document/drawing.ts`:

```ts
import type { Board } from './types';
import type { Vec3 } from './frames';
import { boardEdges } from './cuts';
import { worldSolids } from './designCheck';
import { boardExtents } from './geometry';
import { toWorld } from './snapPoints';

/**
 * An orthographic view (plans-sheet spec §2.2). `toward` points from the model TO the viewer;
 * `right` and `up` are the screen axes. World Y is up. The names label dimension axes.
 */
export interface View {
  toward: Vec3; right: Vec3; up: Vec3;
  title: string; rightName: string; upName: string;
}

const R2 = Math.SQRT2;
const R3 = Math.sqrt(3);
const R6 = Math.sqrt(6);
export const FRONT: View = { toward: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0], title: 'Front', rightName: 'Width', upName: 'Height' };
export const SIDE: View = { toward: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0], title: 'Side', rightName: 'Depth', upName: 'Height' };
/** `up = -Z` puts the piece's front edge at the bottom of the plan, next to the front view (third-angle). */
export const TOP: View = { toward: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1], title: 'Plan', rightName: 'Width', upName: 'Depth' };
/** From front-right-above; `up = toward × right`. */
export const ISO: View = {
  toward: [1 / R3, 1 / R3, 1 / R3], right: [1 / R2, 0, -1 / R2], up: [-1 / R6, 2 / R6, -1 / R6],
  title: 'Exploded', rightName: '', upName: '',
};

export type P2 = [number, number];
export interface Seg2 { a: P2; b: P2; part: string }
export interface Drawing { visible: Seg2[]; hidden: Seg2[]; bounds: { min: P2; max: P2 } }

/**
 * Inches. Well above the float drift of `position + toWorldOffset` sums at furniture scale, far
 * below anything visible at print scale. Not TOUCH, not FLUSH_EPSILON — do not unify them.
 */
export const DRAW_EPS = 1e-6;

const dot = (p: readonly number[], v: readonly number[]) => p[0]! * v[0]! + p[1]! * v[1]! + p[2]! * v[2]!;
const plus = (p: readonly number[], o: readonly number[] | undefined): Vec3 =>
  [p[0]! + (o?.[0] ?? 0), p[1]! + (o?.[1] ?? 0), p[2]! + (o?.[2] ?? 0)];

/** Keep the part of a convex (t, s) polygon where a·t + b·s + c ≥ 0 (Sutherland–Hodgman, one edge). */
function clip(poly: P2[], a: number, b: number, c: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const fp = a * p[0] + b * p[1] + c;
    const fq = a * q[0] + b * q[1] + c;
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) {
      const r = fp / (fp - fq);
      out.push([p[0] + r * (q[0] - p[0]), p[1] + r * (q[1] - p[1])]);
    }
  }
  return out;
}

/**
 * The t-range of the edge a→e hidden by one CLOSED box (spec §2.3): some s ≥ DRAW_EPS with both
 * P(t) + s·toward and P(t) + (s + DRAW_EPS)·toward inside the box grown by DRAW_EPS/2. Closed, so a
 * ray along the seam between two abutting solids of one part counts as inside (the union is solid).
 * The second sample is what stops a ray that merely LEAVES through a face from counting.
 */
export function hiddenSpan(
  a: Vec3, e: Vec3, box: { min: readonly number[]; max: readonly number[] }, toward: Vec3, sMax: number,
): [number, number] | null {
  const d = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
  const grow = DRAW_EPS / 2;
  let poly: P2[] = [[0, DRAW_EPS], [1, DRAW_EPS], [1, sMax], [0, sMax]];
  for (let i = 0; i < 3; i++) {
    const v = toward[i]!;
    for (const sigma of [0, DRAW_EPS]) {
      poly = clip(poly, d[i]!, v, a[i]! + sigma * v - box.min[i]! + grow);
      poly = clip(poly, -d[i]!, -v, box.max[i]! + grow - a[i]! - sigma * v);
      if (poly.length === 0) return null;
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const [t] of poly) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
  return hi > lo ? [lo, hi] : null;
}

/** A part's BOARD box in world space, offset. Bounds read this, not the solids (Review Focus 1). */
function boardBox(b: Board, off: readonly number[] | undefined): { min: Vec3; max: Vec3 } {
  const ext = boardExtents(b);
  const min = plus(b.position, off);
  return { min, max: [min[0] + ext[0], min[1] + ext[1], min[2] + ext[2]] };
}

const corners = (bx: { min: readonly number[]; max: readonly number[] }): Vec3[] =>
  [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [
    (k & 1 ? bx.max : bx.min)[0]!, (k & 2 ? bx.max : bx.min)[1]!, (k & 4 ? bx.max : bx.min)[2]!,
  ]);

/**
 * Visible and hidden 2D segments for `parts` seen through `view` (spec §2). Edges from
 * `boardEdges` (invariant 16) through `toWorld`; occluders from `worldSolids` (invariant 38).
 * No drawing order is involved, so cyclic overlaps are exact.
 */
export function drawView(parts: readonly Board[], view: View, offsets?: ReadonlyMap<string, Vec3>): Drawing {
  const proj = (p: readonly number[]): P2 => [dot(p, view.right), dot(p, view.up)];
  const visible: Seg2[] = [];
  const hidden: Seg2[] = [];
  if (parts.length === 0) return { visible, hidden, bounds: { min: [0, 0], max: [0, 0] } };

  const boxes = parts.map((b) => boardBox(b, offsets?.get(b.id)));
  const screen = boxes.flatMap((bx) => corners(bx).map(proj));
  const bounds = {
    min: [Math.min(...screen.map((p) => p[0])), Math.min(...screen.map((p) => p[1]))] as P2,
    max: [Math.max(...screen.map((p) => p[0])), Math.max(...screen.map((p) => p[1]))] as P2,
  };
  const lo = [0, 1, 2].map((i) => Math.min(...boxes.map((bx) => bx.min[i]!)));
  const hi = [0, 1, 2].map((i) => Math.max(...boxes.map((bx) => bx.max[i]!)));
  const sMax = Math.hypot(hi[0]! - lo[0]!, hi[1]! - lo[1]!, hi[2]! - lo[2]!) + 1;

  const solids = parts.flatMap((b) => worldSolids(b).map((s) => {
    const bx = { min: plus(s.min, offsets?.get(b.id)), max: plus(s.max, offsets?.get(b.id)) };
    const pts = corners(bx);
    const sp = pts.map(proj);
    return {
      bx,
      rmin: [Math.min(...sp.map((p) => p[0])), Math.min(...sp.map((p) => p[1]))],
      rmax: [Math.max(...sp.map((p) => p[0])), Math.max(...sp.map((p) => p[1]))],
      depthMax: Math.max(...pts.map((p) => dot(p, view.toward))),
    };
  }));

  for (const b of parts) {
    const off = offsets?.get(b.id);
    for (const [p, q] of boardEdges(b)) {
      const A = plus(toWorld(b, p), off);
      const E = plus(toWorld(b, q), off);
      const pa = proj(A);
      const pe = proj(E);
      const length = Math.hypot(pe[0] - pa[0], pe[1] - pa[1]);
      if (length < DRAW_EPS) continue; // runs along the view direction: a point on screen
      const depthMin = Math.min(dot(A, view.toward), dot(E, view.toward));
      const segMin = [Math.min(pa[0], pe[0]), Math.min(pa[1], pe[1])];
      const segMax = [Math.max(pa[0], pe[0]), Math.max(pa[1], pe[1])];

      const spans: [number, number][] = [];
      for (const s of solids) {
        // Pure prefilter: a solid entirely behind the edge, or off to the side on screen, hides none of it.
        if (s.depthMax < depthMin) continue;
        if (s.rmax[0]! < segMin[0]! - DRAW_EPS || s.rmin[0]! > segMax[0]! + DRAW_EPS) continue;
        if (s.rmax[1]! < segMin[1]! - DRAW_EPS || s.rmin[1]! > segMax[1]! + DRAW_EPS) continue;
        const span = hiddenSpan(A, E, s.bx, view.toward, sMax);
        if (span) spans.push(span);
      }
      spans.sort((x, y) => x[0] - y[0]);
      const merged: [number, number][] = [];
      for (const s of spans) {
        const last = merged[merged.length - 1];
        if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
        else merged.push([s[0], s[1]]);
      }

      const at = (t: number): P2 => [pa[0] + t * (pe[0] - pa[0]), pa[1] + t * (pe[1] - pa[1])];
      const push = (out: Seg2[], t0: number, t1: number) => {
        if ((t1 - t0) * length >= DRAW_EPS) out.push({ a: at(t0), b: at(t1), part: b.id });
      };
      let cur = 0;
      for (const [s0, s1] of merged) {
        push(visible, cur, Math.max(cur, s0));
        push(hidden, Math.max(0, s0), Math.min(1, s1));
        cur = Math.max(cur, s1);
      }
      push(visible, cur, 1);
    }
  }
  return { visible, hidden, bounds };
}
```

- [ ] **Step 5: Run the tests and confirm they pass.**
  Run: `npx vitest run src/document/drawing.test.ts`
  Expected: PASS (11 tests).

- [ ] **Step 6: Mutate.** Run each mutation, confirm the named test fails, then revert:
  - (a) In `hiddenSpan`, replace `for (const sigma of [0, DRAW_EPS])` with `for (const sigma of [0])`.
    Expected failure: "does not hide an edge on a face the ray leaves through".
  - (b) Replace `grow = DRAW_EPS / 2` with `grow = -DRAW_EPS`, which shrinks the box to its interior.
    Expected failure: the mortise test.
  - (c) In `drawView`, use `boardEdges` points directly without `toWorld` (`[p.length, p.thickness, p.width]`).
    Expected failure: the on-edge test.
  - (d) Delete the `push(hidden, …)` line. Expected failure: the lone-box and mortise tests.

- [ ] **Step 7: Typecheck and commit.**
  Run: `npm run build`. Expected: exit 0.

```bash
git add src/document/snapPoints.ts src/document/drawing.ts src/document/drawing.test.ts
git commit -m "feat(plans): exact hidden-line drawing of axis-aligned solids

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Exploded offsets — `document/explode.ts`

**Files:**
- Create: `src/document/explode.ts`
- Test: `src/document/explode.test.ts`

**Interfaces:**
- Consumes: `worldParts(doc): Board[]`, `parentPath(path): string | null` (`tree.ts`),
  `boardExtents` (`geometry.ts`).
- Produces: `EXPLODE_SPREAD`, `EXPLODE_INNER`,
  `explodeOffsets(doc: SloydDocument, amount: number): ReadonlyMap<string, Vec3>`, keyed by
  occurrence id (`worldParts`' `id`). The same `(doc, amount)` returns the same Map object.

- [ ] **Step 1: Write the failing tests** in `src/document/explode.test.ts`:

```ts
import { createBoard, createDocument } from './document';
import type { SloydDocument } from './types';
import { explodeOffsets, EXPLODE_INNER } from './explode';

type V = [number, number, number];
const cube = (id: string, position: V) => createBoard({ id, name: id, length: 2, width: 2, thickness: 2, position });
const plus = (a: V, k: number, b: V): V => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];

/**
 * Root part r (x 10..12). Assembly i at the origin holding p (x 0..2), q (x 4..6) and assembly j at
 * y 4 holding s. World: r, i/p, i/q, i/j/s. Centres (hand): root bounds x 0..12, y 0..6, z 0..2 →
 * (6,3,1); i: x 0..6, y 0..6 → (3,3,1); j: (1,5,1); r (11,1,1); p (1,1,1); q (5,1,1); s (1,5,1).
 */
const doc = (): SloydDocument => ({
  ...createDocument('Explode'),
  boards: [cube('r', [10, 0, 0])],
  instances: [{ id: 'i', name: 'Box', definition: 'd', position: [0, 0, 0], rotation: 0 }],
  definitions: [
    { id: 'd', boards: [cube('p', [0, 0, 0]), cube('q', [4, 0, 0])],
      instances: [{ id: 'j', name: 'Peg', definition: 'd2', position: [0, 4, 0], rotation: 0 }] },
    { id: 'd2', boards: [cube('s', [0, 0, 0])], instances: [] },
  ],
});

const expectVec = (got: V | undefined, want: V) => want.forEach((w, k) => expect(got![k]).toBeCloseTo(w, 12));

describe('explodeOffsets', () => {
  it('moves the top level by full weight and deeper levels by EXPLODE_INNER', () => {
    const o = explodeOffsets(doc(), 1);
    expectVec(o.get('r'), [5, -2, 0]);                              // (11,1,1) − (6,3,1)
    expectVec(o.get('i/p'), plus([-3, 0, 0], EXPLODE_INNER, [-2, -2, 0])); // c(i)−c(root), then c(p)−c(i)
    expectVec(o.get('i/q'), plus([-3, 0, 0], EXPLODE_INNER, [2, -2, 0]));
    // i/j/s: c(i)−c(root), INNER·(c(j)−c(i)) = INNER·(−2,2,0), INNER·(c(s)−c(j)) = 0.
    expectVec(o.get('i/j/s'), plus([-3, 0, 0], EXPLODE_INNER, [-2, 2, 0]));
  });

  it('is not plain radial explode for a nested part', () => {
    // Radial would be c(p) − c(root) = (−5,−2,0); the hierarchy differs whenever INNER ≠ 1.
    expect(EXPLODE_INNER).toBeLessThan(1);
    const p = explodeOffsets(doc(), 1).get('i/p')!;
    expect(Math.abs(p[0] - -5) + Math.abs(p[1] - -2)).toBeGreaterThan(1e-6);
  });

  it('is zero at amount 0 and linear in the amount', () => {
    const d = doc();
    for (const v of explodeOffsets(d, 0).values()) v.forEach((c) => expect(c).toBeCloseTo(0, 12));
    const one = explodeOffsets(d, 1);
    const half = explodeOffsets(d, 0.5);
    for (const [id, v] of one) expectVec(half.get(id), [v[0] / 2, v[1] / 2, v[2] / 2]);
  });

  it('reduces to radial explode for a document with no assemblies', () => {
    // a x 0..2, b x 8..10: centre (5,1,1); a → (1,1,1) − (5,1,1) = (−4,0,0).
    const flat = { ...createDocument('Flat'), boards: [cube('a', [0, 0, 0]), cube('b', [8, 0, 0])] };
    expectVec(explodeOffsets(flat, 1).get('a'), [-4, 0, 0]);
    expectVec(explodeOffsets(flat, 1).get('b'), [4, 0, 0]);
  });

  it('returns the same map for the same document and amount', () => {
    const d = doc();
    expect(explodeOffsets(d, 0.4)).toBe(explodeOffsets(d, 0.4));
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run: `npx vitest run src/document/explode.test.ts`.
  Expected: FAIL (unresolved import).

- [ ] **Step 3: Implement** `src/document/explode.ts`:

```ts
import type { SloydDocument } from './types';
import type { Vec3 } from './frames';
import { parentPath, worldParts } from './tree';
import { boardExtents } from './geometry';

/** Slider 0..1 → amount (spec §3). Callers apply it; tuned by eye with the user. */
export const EXPLODE_SPREAD = 1;
/**
 * The weight of every level below the top one (spec §3, amended). MUST stay below 1: with equal
 * weights the per-level terms telescope to `amount·(centre(part) − centre(root))`, plain radial
 * explode, and an assembly no longer moves out as a unit.
 */
export const EXPLODE_INNER = 0.5;

const ROOT = '';
const cache = new WeakMap<SloydDocument, Map<number, ReadonlyMap<string, Vec3>>>();

/** ['', 'A', 'A/B', 'A/B/p'] for occurrence 'A/B/p'. */
function chainOf(id: string): string[] {
  const out = [id];
  for (let p = parentPath(id); p !== null; p = parentPath(p)) out.unshift(p);
  return [ROOT, ...out];
}

/**
 * Each placed part's exploded offset, by occurrence id. Hidden parts count toward centres, so a
 * part never jumps when another is hidden. Pure; cached per (document object, amount).
 */
export function explodeOffsets(doc: SloydDocument, amount: number): ReadonlyMap<string, Vec3> {
  let byAmount = cache.get(doc);
  if (!byAmount) { byAmount = new Map(); cache.set(doc, byAmount); }
  const hit = byAmount.get(amount);
  if (hit) return hit;

  const parts = worldParts(doc);
  const lo = new Map<string, Vec3>();
  const hi = new Map<string, Vec3>();
  for (const b of parts) {
    const ext = boardExtents(b);
    const min: Vec3 = [b.position[0], b.position[1], b.position[2]];
    const max: Vec3 = [min[0] + ext[0], min[1] + ext[1], min[2] + ext[2]];
    for (const key of chainOf(b.id)) {
      const l = lo.get(key);
      const h = hi.get(key);
      lo.set(key, l ? [Math.min(l[0], min[0]), Math.min(l[1], min[1]), Math.min(l[2], min[2])] : min);
      hi.set(key, h ? [Math.max(h[0], max[0]), Math.max(h[1], max[1]), Math.max(h[2], max[2])] : max);
    }
  }
  const centre = (key: string): Vec3 => {
    const l = lo.get(key)!;
    const h = hi.get(key)!;
    return [(l[0] + h[0]) / 2, (l[1] + h[1]) / 2, (l[2] + h[2]) / 2];
  };

  const out = new Map<string, Vec3>();
  for (const b of parts) {
    const chain = chainOf(b.id);
    const off: Vec3 = [0, 0, 0];
    for (let i = 1; i < chain.length; i++) {
      const w = amount * (i === 1 ? 1 : EXPLODE_INNER);
      const c1 = centre(chain[i]!);
      const c0 = centre(chain[i - 1]!);
      for (let k = 0; k < 3; k++) off[k] += w * (c1[k] - c0[k]);
    }
    out.set(b.id, off);
  }
  byAmount.set(amount, out);
  return out;
}
```

- [ ] **Step 4: Run the tests and confirm they pass.** Run: `npx vitest run src/document/explode.test.ts`.
  Expected: PASS (5 tests).

- [ ] **Step 5: Mutate.**
  - (a) Change `i === 1 ? 1 : EXPLODE_INNER` to `1`. Expected failure: the first two tests.
  - (b) Drop the `ROOT` entry from `chainOf`. Expected failure: the radial test.

- [ ] **Step 6: Build and commit.** Run: `npm run build`. Expected: exit 0.

```bash
git add src/document/explode.ts src/document/explode.test.ts
git commit -m "feat(plans): hierarchical exploded offsets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Dimension strings — `document/dimensions.ts`

**Files:**
- Create: `src/document/dimensions.ts`
- Test: `src/document/dimensions.test.ts`

**Interfaces:**
- Consumes: `View` (Task 1), `boardExtents`, `formatLength(inches, precision)` (`units/length.ts`;
  `0` formats as `0"`, `7.5` as `7-1/2"`).
- Produces:
  - `DimLine { from: number; to: number; label: string }`, in screen inches along the axis.
  - `DimAxis { name: string; overall: DimLine | null; chain: DimLine[] }`
  - `DimensionSet { horizontal: DimAxis; vertical: DimAxis }`
  - `dimensionView(parts: readonly Board[], view: View, precision: number): DimensionSet`. Axis views
    only: `right`/`up` must be ± a world axis.

- [ ] **Step 1: Write the failing tests** in `src/document/dimensions.test.ts`:

```ts
import { createBoard } from './document';
import { FRONT, TOP } from './drawing';
import { dimensionView } from './dimensions';

// Flat, turn 0: length X, thickness Y, width Z.
const slab = (y: number, thickness = 1) => createBoard({ length: 30, width: 12, thickness, position: [0, y, 0] });

describe('dimensionView', () => {
  it('chains the part boundaries and sums to the overall', () => {
    // Boards at y 0..1, 10..11, 20..21 → coordinates 0,1,10,11,20,21 → 1, 9, 1, 9, 1 (sum 21).
    const d = dimensionView([slab(0), slab(10), slab(20)], FRONT, 16);
    expect(d.vertical.overall).toEqual({ from: 0, to: 21, label: '21"' });
    expect(d.vertical.chain.map((c) => c.label)).toEqual(['1"', '9"', '1"', '9"', '1"']);
    const sum = d.vertical.chain.reduce((n, c) => n + (c.to - c.from), 0);
    expect(sum).toBeCloseTo(21, 12);
    expect(d.vertical.name).toBe('Height');
    // Every part spans x 0..30: one segment is the overall, so no chain.
    expect(d.horizontal.overall).toEqual({ from: 0, to: 30, label: '30"' });
    expect(d.horizontal.chain).toEqual([]);
  });

  it('collapses boundaries that format the same and keeps the maximum', () => {
    // Tops at 5, 10 and 10.01 (0.01in rounds to 0/16). Coordinates 0,5,10,10.01 → kept 0,5,10.01:
    // the skipped maximum replaces 10, so the chain still sums to the overall.
    const parts = [slab(0, 5), slab(0, 10), slab(0, 10.01)];
    const d = dimensionView(parts, FRONT, 16);
    expect(d.vertical.chain.map((c) => [c.from, c.to])).toEqual([[0, 5], [5, 10.01]]);
    expect(d.vertical.chain.map((c) => c.label)).toEqual(['5"', '5"']);
    expect(d.vertical.overall!.to).toBe(10.01);
  });

  it('reads a turned part by its world extent', () => {
    // Flat, turned 90: width (4) on X, length (10) on Z. Plan: right +X, up −Z.
    const d = dimensionView([createBoard({ length: 10, width: 4, thickness: 1, rotation: 90 })], TOP, 16);
    expect(d.horizontal.overall!.label).toBe('4"');
    expect(d.vertical.overall!.label).toBe('10"');
    expect(d.vertical.name).toBe('Depth');
  });

  it('has no dimensions for no parts', () => {
    expect(dimensionView([], FRONT, 16)).toEqual({
      horizontal: { name: 'Width', overall: null, chain: [] },
      vertical: { name: 'Height', overall: null, chain: [] },
    });
  });
});
```

- [ ] **Step 2: Run and confirm failure.** Run: `npx vitest run src/document/dimensions.test.ts`.
  Expected: FAIL (unresolved import).

- [ ] **Step 3: Implement** `src/document/dimensions.ts`:

```ts
import type { Board } from './types';
import type { View } from './drawing';
import { boardExtents } from './geometry';
import { formatLength } from '../units/length';

/** One dimension, in screen inches along its axis; `label` is THE string drawn and measured (invariant 19). */
export interface DimLine { from: number; to: number; label: string }
export interface DimAxis { name: string; overall: DimLine | null; chain: DimLine[] }
export interface DimensionSet { horizontal: DimAxis; vertical: DimAxis }

const dot = (p: readonly number[], v: readonly number[]) => p[0]! * v[0]! + p[1]! * v[1]! + p[2]! * v[2]!;

/** A part's BOARD box (not its solids) along an axis direction: exact for ± a world axis. */
function extentAlong(b: Board, dir: readonly number[]): [number, number] {
  const ext = boardExtents(b);
  const a = dot(b.position, dir);
  const c = dot([b.position[0] + ext[0], b.position[1] + ext[1], b.position[2] + ext[2]], dir);
  return a <= c ? [a, c] : [c, a];
}

function axis(parts: readonly Board[], dir: readonly number[], name: string, precision: number): DimAxis {
  if (parts.length === 0) return { name, overall: null, chain: [] };
  const line = (from: number, to: number): DimLine => ({ from, to, label: formatLength(to - from, precision) });
  const coords = [...new Set(parts.flatMap((b) => extentAlong(b, dir)))].sort((x, y) => x - y);
  const lo = coords[0]!;
  const hi = coords[coords.length - 1]!;
  // Skip a coordinate whose distance from the last kept one READS as zero at this precision.
  const zero = formatLength(0, precision);
  const kept = [lo];
  for (const c of coords.slice(1)) {
    if (formatLength(c - kept[kept.length - 1]!, precision) !== zero) kept.push(c);
  }
  // The maximum always survives, so the chain sums to the overall (spec §5.3, amended).
  if (kept[kept.length - 1] !== hi) {
    if (kept.length > 1) kept[kept.length - 1] = hi;
    else kept.push(hi);
  }
  const chain = kept.length > 2 ? kept.slice(1).map((c, i) => line(kept[i]!, c)) : [];
  return { name, overall: line(lo, hi), chain };
}

/** Overall and chain dimensions for an axis view (spec §5.3). Fitting is `panels/planDims.ts`. */
export function dimensionView(parts: readonly Board[], view: View, precision: number): DimensionSet {
  return {
    horizontal: axis(parts, view.right, view.rightName, precision),
    vertical: axis(parts, view.up, view.upName, precision),
  };
}
```

- [ ] **Step 4: Run and confirm passing.** Run: `npx vitest run src/document/dimensions.test.ts`.
  Expected: PASS (4 tests).

- [ ] **Step 5: Mutate.**
  - (a) Delete the "maximum always survives" block. Expected failure: the collapse test (the chain
    ends at 10).
  - (b) Change `kept.length > 2` to `kept.length > 1`. Expected failure: the first test's
    `horizontal.chain`.

- [ ] **Step 6: Build and commit.** Run: `npm run build`.

```bash
git add src/document/dimensions.ts src/document/dimensions.test.ts
git commit -m "feat(plans): overall and chain dimension strings

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The assemblies to draw — `document/plans.ts`

**Files:**
- Create: `src/document/plans.ts`
- Test: `src/document/plans.test.ts`

**Interfaces:**
- Consumes: `partsBelow(doc, container)`, `placementsOf(doc)`, `NAME_SEPARATOR` (`tree.ts`).
- Produces:
  `PlanAssembly { definition: string; title: string; copies: number; mirroredCopies: number; parts: Board[] }`,
  `planAssemblies(doc: SloydDocument): PlanAssembly[]`. The list is in first-placement order, one
  entry per definition, with `parts` in the definition's own frame and empty definitions skipped.

- [ ] **Step 1: Write the failing tests** in `src/document/plans.test.ts`:

```ts
import { cabinetsDoc } from './treeFixtures';
import { createDocument } from './document';
import { planAssemblies } from './plans';

describe('planAssemblies', () => {
  it('lists each definition once, in first-placement order, with nested placements counted', () => {
    // cabinetsDoc: dc placed c1..c3; dd placed under each cabinet (3) and as x (1) = 4; ds once.
    const got = planAssemblies(cabinetsDoc()).map((a) => [a.definition, a.title, a.copies, a.mirroredCopies]);
    expect(got).toEqual([
      ['dc', 'Cabinet', 3, 0],
      ['dd', 'Cabinet › Drawer', 4, 0],
      ['ds', 'Solo', 1, 0],
    ]);
  });

  it('draws a definition in its own frame', () => {
    // dd's only part `front` sits at the definition's origin, not at its placement (1,0,1).
    const dd = planAssemblies(cabinetsDoc()).find((a) => a.definition === 'dd')!;
    expect(dd.parts.map((b) => [b.id, b.position])).toEqual([['front', [0, 0, 0]]]);
  });

  it('counts mirrored placements by parity along the path', () => {
    // c2 mirrored, and the drawer inside every cabinet mirrored: c1/dr odd, c2/dr even, c3/dr odd,
    // x even → dd has 2 mirrored placements; dc has 1 (c2).
    const doc = cabinetsDoc();
    doc.instances = doc.instances.map((i) => (i.id === 'c2' ? { ...i, mirrored: true } : i));
    doc.definitions = doc.definitions.map((d) =>
      d.id === 'dc' ? { ...d, instances: d.instances.map((i) => ({ ...i, mirrored: true })) } : d);
    const byDef = new Map(planAssemblies(doc).map((a) => [a.definition, a.mirroredCopies]));
    expect(byDef.get('dc')).toBe(1);
    expect(byDef.get('dd')).toBe(2);
  });

  it('skips a definition with no parts and returns nothing for a flat document', () => {
    const doc = { ...createDocument('Empty'), instances: [{ id: 'e', name: 'Empty', definition: 'de', position: [0, 0, 0] as [number, number, number], rotation: 0 as const }],
      definitions: [{ id: 'de', boards: [], instances: [] }] };
    expect(planAssemblies(doc)).toEqual([]);
    expect(planAssemblies(createDocument('Flat'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and confirm failure.** Run: `npx vitest run src/document/plans.test.ts`.

- [ ] **Step 3: Implement** `src/document/plans.ts`:

```ts
import type { Board, Instance, SloydDocument, StoredBoard } from './types';
import { NAME_SEPARATOR, partsBelow, placementsOf } from './tree';

/** One assembly drawing on the plans sheet (spec §5.2 item 3). */
export interface PlanAssembly {
  definition: string;
  /** The first placement's flat display path, e.g. "Cabinet › Drawer". */
  title: string;
  /** Instance PATHS naming the definition (a nested one counts per placement of its parent). */
  copies: number;
  /** Placements reflected an odd number of times along their path. */
  mirroredCopies: number;
  /** The definition's parts in its OWN frame. */
  parts: Board[];
}

/** Each definition once, in first-placement order (instance preorder = worldParts order). */
export function planAssemblies(doc: SloydDocument): PlanAssembly[] {
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const counts = placementsOf(doc);
  const out = new Map<string, PlanAssembly>();
  const walk = (c: { boards: StoredBoard[]; instances: Instance[] }, prefix: string, parity: boolean, onPath: Set<string>) => {
    for (const inst of c.instances) {
      const d = defs.get(inst.definition);
      if (!d || onPath.has(d.id)) continue;
      const title = prefix + inst.name;
      const mirrored = parity !== (inst.mirrored === true);
      let entry = out.get(d.id);
      if (!entry) {
        entry = { definition: d.id, title, copies: counts.get(d.id) ?? 1, mirroredCopies: 0, parts: partsBelow(doc, d) };
        out.set(d.id, entry);
      }
      if (mirrored) entry.mirroredCopies += 1;
      walk(d, title + NAME_SEPARATOR, mirrored, new Set([...onPath, d.id]));
    }
  };
  walk(doc, '', false, new Set());
  return [...out.values()].filter((a) => a.parts.length > 0);
}
```

- [ ] **Step 4: Run and confirm passing.** Run: `npx vitest run src/document/plans.test.ts`.
  Expected: PASS (4 tests).

- [ ] **Step 5: Mutate.** Change `parity !== (inst.mirrored === true)` to `inst.mirrored === true`.
  Expected failure: the parity test (dd would give 3).

- [ ] **Step 6: Build and commit.**

```bash
git add src/document/plans.ts src/document/plans.test.ts
git commit -m "feat(plans): assemblies to draw, with copies and mirrored parity

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Store — `explode` and the read-only gate

**Files:**
- Modify: `src/store/store.ts`
  - the interface: add the declarations next to `hiddenIds`;
  - `edit`, `setTool`, `renameItem`, `replaceDocument`, `undo`, `redo`;
  - the `tapeHover` declaration comment.
- Test: `src/store/store.explode.test.ts`

**Interfaces:**
- Produces: `explode: number`, `setExplode(amount: number): void` on `StoreState`.

- [ ] **Step 1: Write the failing tests** in `src/store/store.explode.test.ts`:

```ts
import { useStore } from './store';
import { boardSnapPoints, createDocument, worldParts } from '../document/document';

const s = () => useStore.getState();
beforeEach(() => s().replaceDocument(createDocument('Test')));

describe('explode', () => {
  it('starts at 0, clamps, and refuses a non-finite amount', () => {
    expect(s().explode).toBe(0);
    s().setExplode(2);
    expect(s().explode).toBe(1);
    s().setExplode(Number.NaN);
    expect(s().explode).toBe(1);
    s().setExplode(-1);
    expect(s().explode).toBe(0);
  });

  it('refuses every edit while exploded, pushing no undo entry', () => {
    s().addBoard();
    const doc = s().doc;
    const past = s().past.length;
    s().setExplode(0.5);
    s().addBoard();
    s().setDocumentName('Renamed');
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(past);
    s().setExplode(0);
    s().addBoard();
    expect(s().past.length).toBe(past + 1);
  });

  it('refuses undo and redo while exploded', () => {
    s().addBoard();
    s().addBoard();
    s().undo();
    const doc = s().doc;
    const [past, future] = [s().past.length, s().future.length];
    s().setExplode(0.5);
    s().undo();
    s().redo();
    expect(s().doc).toBe(doc);
    expect([s().past.length, s().future.length]).toEqual([past, future]);
  });

  it('is refused inside a gesture', () => {
    s().beginGesture();
    s().setExplode(0.5);
    s().endGesture();
    expect(s().explode).toBe(0);
  });

  it('leaving 0 returns to Select and drops held points; no other tool while exploded', () => {
    s().addBoard();
    const board = worldParts(s().doc)[0]!;
    s().setTool('tape');
    s().setTapeAnchor(boardSnapPoints(board)[0]!);
    s().setExplode(0.3);
    expect(s().tool).toBe('select');
    expect(s().tapeAnchor).toBeNull();
    s().setTool('move');
    expect(s().tool).toBe('select');
  });

  it('rename returns the STORED name while exploded (invariant 9)', () => {
    s().addBoard();
    const board = worldParts(s().doc)[0]!;
    s().setExplode(0.3);
    expect(s().renameItem(board.id, 'Something else')).toBe(board.name);
    expect(worldParts(s().doc)[0]!.name).toBe(board.name);
  });

  it('still selects and hides while exploded', () => {
    s().addBoard();
    const id = worldParts(s().doc)[0]!.id;
    s().selectBoard(null);
    s().setExplode(0.3);
    s().selectBoard(id);
    expect(s().selectedIds).toEqual([id]);
    s().hideSelected();
    expect(s().hiddenIds).toEqual([id]);
  });

  it('is reset by replaceDocument', () => {
    s().setExplode(0.7);
    s().replaceDocument(createDocument('Other'));
    expect(s().explode).toBe(0);
  });
});
```

- [ ] **Step 2: Run and confirm failure.** Run: `npx vitest run src/store/store.explode.test.ts`.
  Expected: FAIL (`setExplode` is not a function / `explode` undefined).

- [ ] **Step 3: Implement.** In `src/store/store.ts`:

  1. In `interface StoreState`, after `setHidden`, add:

```ts
  /**
   * How far the viewport's exploded view is spread, 0..1 (plans-sheet spec §4). View state: not in
   * the document, not in undo, not saved; `replaceDocument` resets it. While it is above 0 the model
   * is READ-ONLY through ONE gate: `edit()`, `undo` and `redo` refuse, `setTool` refuses anything
   * but Select, and `renameItem` returns the stored name. UI disabling is a courtesy on top.
   * `setExplode` is its ONE writer: refused inside a gesture, refuses a non-finite value, clamps.
   * Leaving 0 goes through `setTool('select')`, the existing blanket clear — no new clearing writer.
   */
  explode: number;
  setExplode: (amount: number) => void;
```

  2. First statement of `edit`'s body (before `const { doc, past, … } = get();`):

```ts
    if (get().explode > 0) return; // read-only while exploded (plans-sheet spec §4.2)
```

  3. `setTool` becomes:

```ts
    setTool: (tool) => {
      if (tool !== 'select' && get().explode > 0) return; // no Move/Tape over an exploded view
      set({ tool, grabbed: null, tapeAnchor: null, tapeHover: null, tapeTyped: '', tapeAxis: null });
    },
```

  4. In `undo` and `redo`, change `if (past.length === 0) return;` / `if (future.length === 0) return;`
     to `if (past.length === 0 || get().explode > 0) return;` and
     `if (future.length === 0 || get().explode > 0) return;`.

  5. In `renameItem`, after `const doc = get().doc;`:

```ts
      // Exploded: nothing is written, so report what IS stored (invariant 9).
      if (get().explode > 0) return instanceAt(doc, path)?.name ?? partAt(doc, path)?.name ?? typed;
```

  6. In `replaceDocument`'s `set({...})`, add `explode: 0,` after `tapeAxis: null,`.

  7. Next to `hiddenIds`' initial value in the store body, add:

```ts
    explode: 0,
    setExplode: (amount) => {
      if (!Number.isFinite(amount) || get().gesturing) return;
      const next = Math.min(1, Math.max(0, amount));
      if (next > 0 && get().explode === 0) get().setTool('select');
      set({ explode: next });
    },
```

  8. In the `tapeHover` declaration's enumeration, after the bullet that begins
     "`setTool`, `clearGuides` and `replaceDocument` clear it blanket.", add:

```ts
   *  - `setExplode` leaving 0 reaches the blanket clear THROUGH `setTool('select')` — the drawn
   *    world no longer matches world positions (plans-sheet spec §4.1). It is not a new writer.
```

- [ ] **Step 4: Run the new tests and the whole store suite.**
  Run: `npx vitest run src/store`.
  Expected: PASS. The existing store tests must be unchanged and green.

- [ ] **Step 5: Mutate.**
  - (a) Remove the `edit()` guard. Expected failure: "refuses every edit".
  - (b) Remove the `setTool` guard. Expected failure: the leaving-0 test, at `setTool('move')`.
  - (c) Remove the `renameItem` guard. Expected failure: the rename test.

- [ ] **Step 6: Build and commit.** Run: `npm run build && npm test`. Expected: all green.

```bash
git add src/store/store.ts src/store/store.explode.test.ts
git commit -m "feat(plans): explode view state; the model is read-only while exploded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Viewport exploded view and the edit lock in the UI

**Files:**
- Modify: `src/viewport/BoardMesh.tsx`: `offset` prop.
- Modify: `src/viewport/Viewport.tsx`: offsets; no Gizmo or GuideMarkers while exploded.
- Modify: `src/panels/ViewportControls.tsx`: the slider.
- Modify: `src/panels/Toolbar.tsx`: disable the name, Add board, Undo and Redo while exploded.
- Modify: `src/App.tsx`: `<fieldset className="edit-lock" disabled>` around Properties and the
  guides footer.
- Modify: `src/styles.css`: `.edit-lock` reset; `.viewport-explode`.
- Test: `src/panels/ViewportControls.test.tsx`, `src/panels/Toolbar.test.tsx`, `src/App.test.tsx`.

**Interfaces:**
- Consumes: `explode`/`setExplode` (Task 5), `explodeOffsets`/`EXPLODE_SPREAD` (Task 2).
- Produces: `EXPLODED_TITLE = 'Slide Explode back to 0 to edit'` exported from
  `src/panels/ViewportControls.tsx`, used by App and Toolbar.

- [ ] **Step 1: Write the failing tests.**

  Append to `src/panels/ViewportControls.test.tsx`:

```tsx
describe('ViewportControls explode', () => {
  afterEach(() => { act(() => useStore.getState().setExplode(0)); });

  it('sets the explode amount from the slider and shows it as a percentage', () => {
    renderControls();
    const slider = screen.getByRole('slider', { name: 'Explode' });
    expect(slider).toHaveValue('0');
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(useStore.getState().explode).toBe(0.5);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('shows the store value when a change is refused inside a gesture', () => {
    renderControls();
    const slider = screen.getByRole('slider', { name: 'Explode' });
    act(() => useStore.getState().beginGesture());
    fireEvent.change(slider, { target: { value: '0.5' } });
    act(() => useStore.getState().endGesture());
    expect(slider).toHaveValue('0');
  });
});
```

  Add `fireEvent` to the file's `@testing-library/react` import.

  Append to `src/panels/Toolbar.test.tsx`, using that file's existing render helper (read the top of
  the file and call it the way the other tests do):

```tsx
describe('Toolbar while exploded', () => {
  afterEach(() => { act(() => useStore.getState().setExplode(0)); });
  it('disables the project name, Add board, Undo and Redo', () => {
    act(() => { useStore.getState().addBoard(); useStore.getState().setExplode(0.4); });
    /* render the Toolbar here exactly as the other tests in this file do */
    expect(screen.getByRole('textbox', { name: 'Project name' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Add board' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });
});
```

  The comment placeholder above is the ONE place this plan defers to the file. Replace it with the
  file's own render call; do not invent props.

  Append to `src/App.test.tsx`, inside the `describe` that defines `mountWithOneBoard`, or a new
  `describe` that can reach it:

```tsx
  it('locks Properties and the guides footer while exploded', async () => {
    await mountWithOneBoard();
    const lock = document.querySelector('.panel-props fieldset.edit-lock') as HTMLFieldSetElement;
    expect(lock.disabled).toBe(false);
    act(() => useStore.getState().setExplode(0.4));
    expect(lock.disabled).toBe(true);
    expect(lock.title).toBe('Slide Explode back to 0 to edit');
    act(() => useStore.getState().setExplode(0));
  });
```

- [ ] **Step 2: Run and confirm failure.**
  Run: `npx vitest run src/panels/ViewportControls.test.tsx src/panels/Toolbar.test.tsx src/App.test.tsx`.
  Expected: the three new tests FAIL. No slider, no disabled attributes, no fieldset.

- [ ] **Step 3: Implement.**

  `src/panels/ViewportControls.tsx`: export the title constant above the component:

```tsx
/** The one wording for "this is locked because the view is exploded" (plans-sheet spec §4.2). */
export const EXPLODED_TITLE = 'Slide Explode back to 0 to edit';
```

  Inside the component, read the store:

```tsx
  const explode = useStore((s) => s.explode);
  const setExplode = useStore((s) => s.setExplode);
```

  In the `viewport-controls-view` group, after the Grid/Origin/Guides `segmented` div, add:

```tsx
        <label className="viewport-explode"
          title="Explode the parts apart to see how they go together; editing pauses until it is back at 0">
          Explode
          <input type="range" min={0} max={1} step={0.05} value={explode}
            onChange={(e) => setExplode(Number(e.target.value))} />
          <span className="viewport-explode-value">{Math.round(explode * 100)}%</span>
        </label>
```

  The input's accessible name comes from the wrapping label's text, "Explode". The `%` span is
  inside the label too, so check that `getByRole('slider', { name: 'Explode' })` resolves. If the
  computed name includes the percentage, move the `<span>` outside the `<label>` and wrap both in a
  `<div className="viewport-explode">`.

  `src/viewport/BoardMesh.tsx`: add to `Props`:

```tsx
  /** View-only exploded translation (plans-sheet spec §4.3); never written back (invariant 1). */
  offset?: [number, number, number];
```

  Destructure it, and change `<group position={center}>` to:

```tsx
    <group position={offset ? [center[0] + offset[0], center[1] + offset[1], center[2] + offset[2]] : center}>
```

  `src/viewport/Viewport.tsx`, in the component that renders the boards (the one with `shown`):

```tsx
  const doc = useStore((s) => s.doc);
  const explode = useStore((s) => s.explode);
  const offsets = useMemo(
    () => (explode > 0 ? explodeOffsets(doc, explode * EXPLODE_SPREAD) : null),
    [doc, explode],
  );
```

  Then:
  - pass `offset={offsets?.get(board.id)}` to `<BoardMesh>`;
  - change `{showGuides && <GuideMarkers />}` to `{showGuides && explode === 0 && <GuideMarkers />}`;
  - change `{tool === 'select' && <Gizmo />}` to `{tool === 'select' && explode === 0 && <Gizmo />}`.

  Import `explodeOffsets, EXPLODE_SPREAD` from `'../document/explode'`. Add a comment on the guide
  line: "Guide markers are world positions; while exploded they would sit away from the parts they
  belong to (invariant 16)."

  `src/panels/Toolbar.tsx`: add `const exploded = useStore((s) => s.explode > 0);` beside `canUndo`.
  - project-name input: `disabled={exploded}` and `title={exploded ? EXPLODED_TITLE : undefined}`;
  - `+ Add board`: `disabled={exploded}`;
  - Undo and Redo: `disabled={!canUndo || exploded}` and `disabled={!canRedo || exploded}`.

  Import `EXPLODED_TITLE` from `'./ViewportControls'`.

  `src/App.tsx`: add `const exploded = useStore((s) => s.explode > 0);` near the other store reads.
  Wrap `<Properties />`:

```tsx
            <section className="panel panel-props">
              <h2>Properties</h2>
              <fieldset className="edit-lock" disabled={exploded} title={exploded ? EXPLODED_TITLE : undefined}>
                <Properties />
              </fieldset>
            </section>
```

  Wrap `<GuidesFooter key={activeId} />` the same way, keeping its comment above the fieldset.
  Import `EXPLODED_TITLE`.

  `src/styles.css`: after the `.viewport-controls` rules add:

```css
/* A disabled fieldset is the plans-sheet edit lock (spec §4.2): it disables every control inside
   without each component knowing. It must not draw a box. */
.edit-lock { border: 0; padding: 0; margin: 0; min-width: 0; }

.viewport-explode {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ink);
}
.viewport-explode input { width: 96px; }
.viewport-explode-value { font-family: var(--font-num); min-width: 3.5ch; text-align: right; }
```

  If `--ink` is not the role used by `.viewport-controls` text, use whatever role that rule uses
  (styles.css rule: roles, never raw `--grey-*`).

- [ ] **Step 4: Run the tests.**
  Run: `npx vitest run src/panels src/App.test.tsx`. Expected: PASS.

- [ ] **Step 5: Mutate.** Remove `disabled={exploded}` from the fieldset. Expected failure: the App
  test.

- [ ] **Step 6: Build, run everything, commit.** Run: `npm run build && npm test`.

```bash
git add src/viewport/BoardMesh.tsx src/viewport/Viewport.tsx src/panels/ViewportControls.tsx src/panels/ViewportControls.test.tsx src/panels/Toolbar.tsx src/panels/Toolbar.test.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat(plans): exploded viewport behind a slider; edit controls lock while exploded

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Fitting and layout — `panels/planDims.ts`, `panels/planLayout.ts`

**Files:**
- Create: `src/panels/planDims.ts`, `src/panels/planLayout.ts`
- Test: `src/panels/planDims.test.ts`, `src/panels/planLayout.test.ts`

**Interfaces:**
- Consumes: `DimAxis`, `DimLine` (Task 3); `labelWidth` (`diagramLabels.ts`, `s.length × 12.4`).
- Produces:
  - `CHAIN_MAX`, `DIM_LABEL_PAD`;
  - `fitChain(axis: DimAxis, scale: number): { chain: DimLine[]; note: string | null }`;
  - `PLAN_WIDTH`, `DIM_BAND`, `VIEW_GAP`, `MAX_PLAN_SCALE`, `ISO_MAX_HEIGHT`, `ISO_MARGIN`;
  - `Rect2 { min: [number, number]; max: [number, number] }`, `Placement { x: number; y: number }`;
  - `TrioLayout { scale; width; height; front: Placement; side: Placement; top: Placement }`;
  - `layoutTrio(front: Rect2, side: Rect2, top: Rect2): TrioLayout`;
  - `layoutSingle(r: Rect2): { scale: number; width: number; height: number; at: Placement }`.

  A Placement is the SVG position of the view's (min right, max up) corner.

- [ ] **Step 1: Write the failing tests.** `src/panels/planDims.test.ts`:

```ts
import { fitChain, CHAIN_MAX } from './planDims';
import type { DimAxis } from '../document/dimensions';

// labelWidth('1"') = 2 × 12.4 = 24.8; + pad 8 = 32.8 needed. At scale 4: 1in = 4 (drop), 9in = 36 (keep).
const seg = (from: number, to: number) => ({ from, to, label: `${to - from}"` });
const axis = (chain: ReturnType<typeof seg>[]): DimAxis => ({ name: 'Height', overall: seg(0, 1), chain });

describe('fitChain', () => {
  it('drops a label that does not fit and says so', () => {
    const r = fitChain(axis([seg(0, 1), seg(1, 10), seg(10, 19), seg(19, 28)]), 4);
    expect(r.chain.map((c) => c.from)).toEqual([1, 10, 19]);
    expect(r.note).toBe('1 small height spacing not labelled');
  });
  it('keeps the chain at exactly a third dropped, omits it above', () => {
    // 3 segments, 1 dropped: 1·3 > 3 is false → kept.
    expect(fitChain(axis([seg(0, 1), seg(1, 10), seg(10, 19)]), 4).chain).toHaveLength(2);
    // 5 segments, 3 dropped (the 1in ones): 9 > 5 → omitted.
    const r = fitChain(axis([seg(0, 1), seg(1, 10), seg(10, 11), seg(11, 20), seg(20, 21)]), 4);
    expect(r).toEqual({ chain: [], note: 'Height chain omitted — too dense' });
  });
  it('caps at CHAIN_MAX segments', () => {
    const many = (n: number) => axis(Array.from({ length: n }, (_, k) => seg(k, k + 1)));
    expect(CHAIN_MAX).toBe(12);
    expect(fitChain(many(12), 40).chain).toHaveLength(12);       // 1in = 40 ≥ 32.8: all fit
    expect(fitChain(many(13), 40)).toEqual({ chain: [], note: 'Height chain omitted — too dense' });
  });
  it('has no note for an empty chain', () => {
    expect(fitChain(axis([]), 4)).toEqual({ chain: [], note: null });
  });
});
```

  `src/panels/planLayout.test.ts`:

```ts
import { layoutTrio, layoutSingle, PLAN_WIDTH, DIM_BAND, VIEW_GAP, MAX_PLAN_SCALE } from './planLayout';

const rect = (w: number, h: number) => ({ min: [0, 0] as [number, number], max: [w, h] as [number, number] });

describe('layoutTrio', () => {
  it('fills the width at one shared scale and aligns the views third-angle', () => {
    // Front 30 wide × 20 high, side 12 × 20, plan 30 × 12. Room = 1000 − 4·56 − 24 = 752; 752 / 42.
    const l = layoutTrio(rect(30, 20), rect(12, 20), rect(30, 12));
    expect(l.scale).toBeCloseTo(752 / 42, 12);
    expect(l.width).toBeCloseTo(PLAN_WIDTH, 9);
    expect(l.top.x).toBe(l.front.x);          // plan directly above front
    expect(l.side.y).toBe(l.front.y);         // side level with front
    expect(l.front.y).toBeCloseTo(DIM_BAND + 12 * l.scale + DIM_BAND + VIEW_GAP + DIM_BAND, 9);
    expect(l.height).toBeCloseTo(l.front.y + 20 * l.scale + DIM_BAND, 9);
  });
  it('caps the scale for a small piece', () => {
    expect(layoutTrio(rect(1, 1), rect(1, 1), rect(1, 1)).scale).toBe(MAX_PLAN_SCALE);
  });
  it('does not divide by zero', () => {
    const l = layoutTrio(rect(0, 0), rect(0, 0), rect(0, 0));
    expect(Number.isFinite(l.width) && Number.isFinite(l.height)).toBe(true);
  });
});

describe('layoutSingle', () => {
  it('fits the width or the height, whichever binds', () => {
    // Wide: (1000 − 32) / 100 = 9.68 < 640 / 10 = 64.
    expect(layoutSingle(rect(100, 10)).scale).toBeCloseTo(9.68, 12);
    // Tall: 640 / 200 = 3.2 < 968 / 10.
    expect(layoutSingle(rect(10, 200)).scale).toBeCloseTo(3.2, 12);
  });
});
```

- [ ] **Step 2: Run and confirm failure.** Run: `npx vitest run src/panels/planDims.test.ts src/panels/planLayout.test.ts`.

- [ ] **Step 3: Implement.** `src/panels/planDims.ts`:

```ts
import type { DimAxis, DimLine } from '../document/dimensions';
import { labelWidth } from './diagramLabels';

/** More surviving chain segments than this and the chain is omitted (spec §5.3). */
export const CHAIN_MAX = 12;
/** Drawn room a label needs beyond its own width (SVG user units). */
export const DIM_LABEL_PAD = 8;

/**
 * Measure, drop and cap a chain at a drawn scale (user units per inch). The strings arrive built
 * (invariant 19); this only decides which are drawn. Nothing disappears silently: the note says so.
 */
export function fitChain(axis: DimAxis, scale: number): { chain: DimLine[]; note: string | null } {
  const total = axis.chain.length;
  if (total === 0) return { chain: [], note: null };
  const fits = axis.chain.filter((d) => labelWidth(d.label) + DIM_LABEL_PAD <= (d.to - d.from) * scale);
  const dropped = total - fits.length;
  if (fits.length > CHAIN_MAX || dropped * 3 > total) {
    return { chain: [], note: `${axis.name} chain omitted — too dense` };
  }
  const note = dropped === 0 ? null
    : `${dropped} small ${axis.name.toLowerCase()} spacing${dropped === 1 ? '' : 's'} not labelled`;
  return { chain: fits, note };
}
```

  `src/panels/planLayout.ts`:

```ts
/** SVG user units across a plans figure (cf. DRAW_WIDTH for the part diagrams). */
export const PLAN_WIDTH = 1000;
/** Room on each side of a view for one dimension level (line, ticks, label). */
export const DIM_BAND = 56;
export const VIEW_GAP = 24;
/** User units per inch, at most: a small piece is not blown up to fill the page. */
export const MAX_PLAN_SCALE = 24;
export const ISO_MAX_HEIGHT = 640;
export const ISO_MARGIN = 16;

export interface Rect2 { min: [number, number]; max: [number, number] }
/** SVG position of a view's (min right, max up) corner. */
export interface Placement { x: number; y: number }
export interface TrioLayout { scale: number; width: number; height: number; front: Placement; side: Placement; top: Placement }

const w = (r: Rect2) => r.max[0] - r.min[0];
const h = (r: Rect2) => r.max[1] - r.min[1];

/**
 * Third-angle: plan above front, side right of front, ONE scale so the views align (spec §5.2).
 * Each view has a DIM_BAND on all four sides (chain above/left, overall below/right).
 */
export function layoutTrio(front: Rect2, side: Rect2, top: Rect2): TrioLayout {
  const across = w(front) + w(side);
  const room = PLAN_WIDTH - 4 * DIM_BAND - VIEW_GAP;
  const scale = across > 0 ? Math.min(room / across, MAX_PLAN_SCALE) : MAX_PLAN_SCALE;
  const topAt = { x: DIM_BAND, y: DIM_BAND };
  const frontAt = { x: DIM_BAND, y: DIM_BAND + h(top) * scale + DIM_BAND + VIEW_GAP + DIM_BAND };
  const sideAt = { x: DIM_BAND + w(front) * scale + DIM_BAND + VIEW_GAP + DIM_BAND, y: frontAt.y };
  return {
    scale,
    width: sideAt.x + w(side) * scale + DIM_BAND,
    height: frontAt.y + h(front) * scale + DIM_BAND,
    front: frontAt, side: sideAt, top: topAt,
  };
}

/** One undimensioned figure (the exploded view): fit the width or ISO_MAX_HEIGHT, whichever binds. */
export function layoutSingle(r: Rect2): { scale: number; width: number; height: number; at: Placement } {
  const byW = w(r) > 0 ? (PLAN_WIDTH - 2 * ISO_MARGIN) / w(r) : Infinity;
  const byH = h(r) > 0 ? ISO_MAX_HEIGHT / h(r) : Infinity;
  const scale = Math.min(byW, byH, MAX_PLAN_SCALE);
  return { scale, width: 2 * ISO_MARGIN + w(r) * scale, height: 2 * ISO_MARGIN + h(r) * scale, at: { x: ISO_MARGIN, y: ISO_MARGIN } };
}
```

  `layoutSingle`'s test expects 9.68 and 3.2, both under `MAX_PLAN_SCALE` (24) ✓.

- [ ] **Step 4: Run and confirm passing.** Expected: PASS (8 tests).

- [ ] **Step 5: Mutate.**
  - (a) Change `dropped * 3 > total` to `>=`. Expected failure: the "exactly a third" assertion.
  - (b) Change `fits.length > CHAIN_MAX` to `>=`. Expected failure: the 12-kept assertion.

- [ ] **Step 6: Build and commit.**

```bash
git add src/panels/planDims.ts src/panels/planDims.test.ts src/panels/planLayout.ts src/panels/planLayout.test.ts
git commit -m "feat(plans): fit dimension chains; third-angle layout at one scale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The figures — `panels/PlanFigure.tsx`

**Files:**
- Create: `src/panels/PlanFigure.tsx`
- Test: `src/panels/PlanFigure.test.tsx`
- Modify: `src/styles.css` (plan line classes)

**Interfaces:**
- Consumes: Tasks 1–3, 7; `LABEL_SIZE` (`diagramLabels.ts`); `worldParts`.
- Produces: `PlanTrio({ parts: readonly Board[]; precision: number; label: string })` and
  `ExplodedFigure({ doc: SloydDocument; amount: number })`.

- [ ] **Step 1: Write the failing tests** in `src/panels/PlanFigure.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { createBoard, createDocument } from '../document/document';
import { PlanTrio, ExplodedFigure } from './PlanFigure';

// 2in shelves: the trio's scale is 752 / (30 + 12) ≈ 17.9 per inch (Task 7), so a 2in spacing is
// ≈ 35.8 drawn, room for a 2-char label (24.8 + 8 = 32.8). 1in spacings (17.9) would be dropped.
const slab = (y: number) => createBoard({ length: 30, width: 12, thickness: 2, position: [0, y, 0] });
const mortised = createBoard({
  length: 20, width: 4, thickness: 2,
  cuts: [{ id: 'c', face: 'thickness', from: 'max', across: 'width', offset: 8, width: 1, depth: 1, stopMin: 1, stopMax: 1 }],
});

describe('PlanTrio', () => {
  it('draws three views with overall and chain dimensions', () => {
    const { container } = render(<PlanTrio parts={[slab(0), slab(10), slab(20)]} precision={16} label="Shelf unit" />);
    expect(screen.getByRole('img', { name: 'Shelf unit: front, side and plan' })).toBeInTheDocument();
    const labels = [...container.querySelectorAll('text')].map((t) => t.textContent);
    // Coordinates 0,2,10,12,20,22: chain 2, 8, 2, 8, 2; overall 22.
    expect(labels).toContain('22"');   // overall height, front and side
    expect(labels).toContain('30"');   // overall width
    expect(labels).toContain('8"');    // chain
    expect(labels).toContain('2"');    // chain
    expect(container.querySelector('svg')!.getAttribute('font-size')).toBe('20');
  });

  it('draws hidden lines dashed in the elevations', () => {
    const { container } = render(<PlanTrio parts={[mortised]} precision={16} label="Leg" />);
    expect(container.querySelector('path.plan-hidden')!.getAttribute('d')).toMatch(/M/);
  });

  it('lists a note when a chain is omitted', () => {
    // Thirteen 1in boards stacked: 13 chain segments > CHAIN_MAX.
    const parts = Array.from({ length: 13 }, (_, k) => createBoard({ length: 30, width: 12, thickness: 1, position: [0, k, 0] }));
    render(<PlanTrio parts={parts} precision={16} label="Stack" />);
    expect(screen.getAllByText(/Height chain omitted — too dense/).length).toBeGreaterThan(0);
  });
});

describe('ExplodedFigure', () => {
  it('draws visible lines only', () => {
    const doc = { ...createDocument('X'), boards: [mortised] };
    const { container } = render(<ExplodedFigure doc={doc} amount={0.6} />);
    expect(container.querySelector('path.plan-visible')!.getAttribute('d')).toMatch(/M/);
    expect(container.querySelector('path.plan-hidden')).toBeNull();
    expect(screen.getByRole('img', { name: 'Exploded view' })).toHaveAttribute('data-amount', '0.6');
  });
});
```

- [ ] **Step 2: Run and confirm failure.** Run: `npx vitest run src/panels/PlanFigure.test.tsx`.

- [ ] **Step 3: Implement** `src/panels/PlanFigure.tsx`:

```tsx
import { useMemo } from 'react';
import type { Board, SloydDocument } from '../document/types';
import { worldParts } from '../document/tree';
import { drawView, FRONT, ISO, SIDE, TOP, type Drawing, type P2, type Seg2, type View } from '../document/drawing';
import { dimensionView, type DimLine } from '../document/dimensions';
import { explodeOffsets } from '../document/explode';
import { fitChain } from './planDims';
import { DIM_BAND, layoutSingle, layoutTrio, type Placement } from './planLayout';
import { LABEL_SIZE } from './diagramLabels';

const TICK = 6;
const EXT_GAP = 4;

type ToSvg = (p: P2) => P2;
const mapper = (d: Drawing, at: Placement, scale: number): ToSvg =>
  (p) => [at.x + (p[0] - d.bounds.min[0]) * scale, at.y + (d.bounds.max[1] - p[1]) * scale];

const pathOf = (segs: Seg2[], map: ToSvg) => segs.map((s) => {
  const [ax, ay] = map(s.a);
  const [bx, by] = map(s.b);
  return `M${ax.toFixed(2)} ${ay.toFixed(2)}L${bx.toFixed(2)} ${by.toFixed(2)}`;
}).join('');

/** Hidden beneath visible (spec §2.4), so a hidden line coinciding with a visible one is covered. */
function Lines({ d, map, hidden }: { d: Drawing; map: ToSvg; hidden: boolean }) {
  return (
    <>
      {hidden && d.hidden.length > 0 && <path className="plan-hidden" d={pathOf(d.hidden, map)} />}
      <path className="plan-visible" d={pathOf(d.visible, map)} />
    </>
  );
}

/** One dimension line between SVG points a and b, label centred; `vertical` rotates the label. */
function Dim({ a, b, label, vertical }: { a: P2; b: P2; label: string; vertical: boolean }) {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const tick = (p: P2) => <line x1={p[0] - TICK / 2} y1={p[1] + TICK / 2} x2={p[0] + TICK / 2} y2={p[1] - TICK / 2} />;
  return (
    <g className="plan-dim">
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      {tick(a)}
      {tick(b)}
      {vertical ? (
        <text className="plan-dim-label" x={mx - EXT_GAP} y={my} textAnchor="middle" transform={`rotate(-90 ${mx - EXT_GAP} ${my})`}>{label}</text>
      ) : (
        <text className="plan-dim-label" x={mx} y={my - EXT_GAP} textAnchor="middle">{label}</text>
      )}
    </g>
  );
}

interface Fitted { overall: DimLine | null; chain: DimLine[] }

/** One elevation with its dimensions: chain above/left, overall below/right (spec §5.4). */
function Elevation({ d, at, scale, h, v }: { d: Drawing; at: Placement; scale: number; h: Fitted; v: Fitted }) {
  const map = mapper(d, at, scale);
  const left = at.x;
  const right = at.x + (d.bounds.max[0] - d.bounds.min[0]) * scale;
  const top = at.y;
  const bottom = at.y + (d.bounds.max[1] - d.bounds.min[1]) * scale;
  const X = (r: number) => map([r, 0])[0];
  const Y = (u: number) => map([0, u])[1];
  const hDim = (line: DimLine, y: number, edge: number) => (
    <g key={`h${y}${line.from}`}>
      <line className="plan-ext" x1={X(line.from)} y1={edge} x2={X(line.from)} y2={y + (y > edge ? TICK : -TICK)} />
      <line className="plan-ext" x1={X(line.to)} y1={edge} x2={X(line.to)} y2={y + (y > edge ? TICK : -TICK)} />
      <Dim a={[X(line.from), y]} b={[X(line.to), y]} label={line.label} vertical={false} />
    </g>
  );
  const vDim = (line: DimLine, x: number, edge: number) => (
    <g key={`v${x}${line.from}`}>
      <line className="plan-ext" x1={edge} y1={Y(line.from)} x2={x + (x > edge ? TICK : -TICK)} y2={Y(line.from)} />
      <line className="plan-ext" x1={edge} y1={Y(line.to)} x2={x + (x > edge ? TICK : -TICK)} y2={Y(line.to)} />
      <Dim a={[x, Y(line.from)]} b={[x, Y(line.to)]} label={line.label} vertical />
    </g>
  );
  return (
    <g>
      <Lines d={d} map={map} hidden />
      {h.overall && hDim(h.overall, bottom + DIM_BAND / 2, bottom)}
      {h.chain.map((c) => hDim(c, top - DIM_BAND / 2, top))}
      {v.overall && vDim(v.overall, right + DIM_BAND / 2, right)}
      {v.chain.map((c) => vDim(c, left - DIM_BAND / 2, left))}
    </g>
  );
}

/** Front, side and plan of `parts`, third-angle, one scale, dimensioned (spec §5.2). */
export function PlanTrio({ parts, precision, label }: { parts: readonly Board[]; precision: number; label: string }) {
  const views = useMemo(() => [FRONT, SIDE, TOP].map((view: View) => ({
    view, d: drawView(parts, view), dims: dimensionView(parts, view, precision),
  })), [parts, precision]);
  const [front, side, top] = views as [typeof views[0], typeof views[0], typeof views[0]];
  const lay = layoutTrio(front.d.bounds, side.d.bounds, top.d.bounds);
  const notes: string[] = [];
  const draw = (x: typeof front, at: Placement) => {
    const h = fitChain(x.dims.horizontal, lay.scale);
    const v = fitChain(x.dims.vertical, lay.scale);
    for (const n of [h.note, v.note]) if (n) notes.push(`${x.view.title}: ${n}`);
    return <Elevation key={x.view.title} d={x.d} at={at} scale={lay.scale}
      h={{ overall: x.dims.horizontal.overall, chain: h.chain }}
      v={{ overall: x.dims.vertical.overall, chain: v.chain }} />;
  };
  const drawn = [draw(top, lay.top), draw(front, lay.front), draw(side, lay.side)];
  return (
    <figure className="plans-figure-wrap">
      <svg className="plans-figure" viewBox={`0 0 ${lay.width} ${lay.height}`} fontSize={LABEL_SIZE}
        role="img" aria-label={`${label}: front, side and plan`}>
        {drawn}
      </svg>
      {notes.length > 0 && <ul className="plans-notes">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
    </figure>
  );
}

/** The isometric exploded view, visible lines only (spec §5.2 item 1). */
export function ExplodedFigure({ doc, amount }: { doc: SloydDocument; amount: number }) {
  const d = useMemo(() => drawView(worldParts(doc), ISO, explodeOffsets(doc, amount)), [doc, amount]);
  const lay = layoutSingle(d.bounds);
  return (
    <svg className="plans-figure" viewBox={`0 0 ${lay.width} ${lay.height}`} role="img"
      aria-label="Exploded view" data-amount={amount}>
      <Lines d={d} map={mapper(d, lay.at, lay.scale)} hidden={false} />
    </svg>
  );
}
```

  `src/styles.css`: append near the cut-list diagram rules:

```css
/* Plans sheet figures (plans-sheet spec §5.4). Line weights in screen pixels whatever the scale.
   No font-size here: LABEL_SIZE is the <svg> attribute (invariant 19). */
.plans-figure { display: block; width: 100%; height: auto; color: var(--ink); }
.plans-figure path, .plans-figure line { fill: none; stroke: currentColor; vector-effect: non-scaling-stroke; }
.plan-visible { stroke-width: 1.5; }
.plan-hidden { stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.7; }
.plan-dim line, .plan-ext { stroke-width: 0.75; }
.plan-dim-label { fill: currentColor; stroke: none; font-family: var(--font-num); }
.plans-notes { margin: 4px 0 0; padding-left: 1.2em; font-size: 12px; color: var(--ink-muted, var(--ink)); }
```

  Check that the roles used (`--ink`, and `--ink-muted` if it exists) are defined in `styles.css`. If
  not, use the role the cut list's `.cutlist-diagram` text uses.

- [ ] **Step 4: Run and confirm passing.** Run: `npx vitest run src/panels/PlanFigure.test.tsx`.
  Expected: PASS (4 tests).

- [ ] **Step 5: Mutate.** Swap the order in `Lines` (visible before hidden). No unit test catches
  this; it is a drawing-order property. Revert, and note it as a browser-pass check for Task 10.
  Then mutate the `fontSize={LABEL_SIZE}` attribute away. Expected failure: the first test.

- [ ] **Step 6: Build and commit.**

```bash
git add src/panels/PlanFigure.tsx src/panels/PlanFigure.test.tsx src/styles.css
git commit -m "feat(plans): dimensioned third-angle elevations and the exploded figure

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Plans sheet — `PlansSheet.tsx`, toolbar entry, App wiring, print

**Files:**
- Create: `src/panels/PlansSheet.tsx`
- Test: `src/panels/PlansSheet.test.tsx`
- Modify: `src/panels/Toolbar.tsx` (`onOpenPlans` prop, Plans button after Cut list)
- Modify: `src/App.tsx` (`plansOpen`, `modalOpen`, mount beside `CutList`)
- Modify: `src/styles.css` (section spacing; page breaks in print)
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: Tasks 2, 4, 8; `EXPLODE_SPREAD`.
- Produces: `PlansSheet({ onClose }: { onClose: () => void })`.

- [ ] **Step 1: Write the failing tests** in `src/panels/PlansSheet.test.tsx`:

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import { cabinetsDoc } from '../document/treeFixtures';
import { PlansSheet } from './PlansSheet';

beforeEach(() => useStore.getState().replaceDocument(createDocument('Test')));

describe('PlansSheet', () => {
  it('says so when there is nothing to draw', () => {
    render(<PlansSheet onClose={() => {}} />);
    expect(screen.getByText('Nothing to draw yet.')).toBeInTheDocument();
  });

  it('draws the exploded view, the piece, then each assembly with its count', () => {
    act(() => useStore.getState().replaceDocument(cabinetsDoc()));
    render(<PlansSheet onClose={() => {}} />);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['Exploded view', 'Cabinets', 'Cabinet × 3', 'Cabinet › Drawer × 4', 'Solo']);
  });

  it('notes mirrored copies', () => {
    const doc = cabinetsDoc();
    doc.instances = doc.instances.map((i) => (i.id === 'c2' ? { ...i, mirrored: true } : i));
    act(() => useStore.getState().replaceDocument(doc));
    render(<PlansSheet onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Cabinet × 3 (one copy mirrored)' })).toBeInTheDocument();
  });

  it('re-draws the exploded figure at the sheet amount, apart from the viewport', () => {
    act(() => useStore.getState().replaceDocument({ ...createDocument('One'), boards: [createBoard()] }));
    render(<PlansSheet onClose={() => {}} />);
    const fig = screen.getByRole('img', { name: 'Exploded view' });
    expect(fig).toHaveAttribute('data-amount', '0.6');
    fireEvent.change(screen.getByRole('slider', { name: 'Explode' }), { target: { value: '0.2' } });
    expect(screen.getByRole('img', { name: 'Exploded view' })).toHaveAttribute('data-amount', '0.2');
    expect(useStore.getState().explode).toBe(0);
  });

  it('closes on Escape and takes focus on mount', () => {
    const onClose = vi.fn();
    render(<PlansSheet onClose={onClose} />);
    expect(document.activeElement).toHaveClass('plans-sheet');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

  `data-amount` is the sheet amount × `EXPLODE_SPREAD`. With `EXPLODE_SPREAD = 1` it reads `0.6`.
  If Task 10 retunes the spread, update these two literals to `0.6 * EXPLODE_SPREAD` and
  `0.2 * EXPLODE_SPREAD`.

  Append to `src/App.test.tsx`, beside the cut-list tests:

```tsx
  it('opens the plans sheet as a modal and returns focus to its button', async () => {
    await mountWithOneBoard();
    const user = userEvent.setup();
    const open = screen.getByRole('button', { name: 'Plans' });
    await user.click(open);
    expect(screen.getByRole('dialog', { name: 'Plans' })).toBeInTheDocument();
    expect(document.querySelector('.app-shell')!.hasAttribute('inert')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Close plans' }));
    expect(screen.queryByRole('dialog', { name: 'Plans' })).toBeNull();
    expect(document.activeElement).toBe(open);
  });
```

- [ ] **Step 2: Run and confirm failure.**
  Run: `npx vitest run src/panels/PlansSheet.test.tsx src/App.test.tsx`.

- [ ] **Step 3: Implement** `src/panels/PlansSheet.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { worldParts } from '../document/tree';
import { planAssemblies } from '../document/plans';
import { EXPLODE_SPREAD } from '../document/explode';
import { ExplodedFigure, PlanTrio } from './PlanFigure';

/** The sheet's own explode amount (spec §5.2): local view state, separate from the viewport's. */
const SHEET_EXPLODE = 0.6;

const mirroredNote = (n: number) => (n === 0 ? '' : n === 1 ? ' (one copy mirrored)' : ` (${n} copies mirrored)`);

/**
 * The plans sheet (spec §5). Built exactly like CutList: a direct child of `.app` with the shell
 * inert behind it, so the `.app > *:not(.cutlist-overlay)` print rule and its focus handling apply
 * unchanged — which is why it wears the `cutlist-overlay`/`cutlist-sheet` classes. Derived from the
 * store's document on every render; it formats nothing itself.
 */
export function PlansSheet({ onClose }: { onClose: () => void }) {
  const doc = useStore((s) => s.doc);
  const parts = worldParts(doc);
  const assemblies = useMemo(() => planAssemblies(doc), [doc]);
  const precision = doc.units.precision;
  const [amount, setAmount] = useState(SHEET_EXPLODE);
  const sheet = useRef<HTMLDivElement>(null);

  useEffect(() => { sheet.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cutlist-overlay plans-overlay" role="dialog" aria-modal="true" aria-label="Plans">
      <div className="cutlist-sheet plans-sheet" ref={sheet} tabIndex={-1}>
        <header className="cutlist-head">
          <h2>Plans — {doc.name}</h2>
          <div className="cutlist-actions">
            <label className="plans-explode">
              Explode
              <input type="range" min={0} max={1} step={0.05} value={amount}
                onChange={(e) => setAmount(Number(e.target.value))} />
            </label>
            <button onClick={() => window.print()}>Print</button>
            <button onClick={onClose} aria-label="Close plans">✕</button>
          </div>
        </header>

        {parts.length === 0 ? (
          <p className="cutlist-empty">Nothing to draw yet.</p>
        ) : (
          <>
            <section className="plans-section">
              <h3>Exploded view</h3>
              <ExplodedFigure doc={doc} amount={amount * EXPLODE_SPREAD} />
            </section>
            <section className="plans-section">
              <h3>{doc.name}</h3>
              <PlanTrio parts={parts} precision={precision} label={doc.name} />
            </section>
            {assemblies.map((a) => (
              <section className="plans-section" key={a.definition}>
                <h3>{a.title}{a.copies > 1 ? ` × ${a.copies}` : ''}{mirroredNote(a.mirroredCopies)}</h3>
                <PlanTrio parts={a.parts} precision={precision} label={a.title} />
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
```

  `src/panels/Toolbar.tsx`: add to `Props`, after `onOpenCutList`:

```tsx
  /** Opens the plans sheet (plans-sheet spec §5.1). */
  onOpenPlans: () => void;
```

  Destructure it, and after the Cut list button add:

```tsx
        <button onClick={onOpenPlans} title="Plans — dimensioned drawings and an exploded view">
          Plans
        </button>
```

  Every existing `<Toolbar …>` render in the tests must now pass `onOpenPlans`. Add
  `onOpenPlans={() => {}}` (or the file's `noop`) wherever `onOpenCutList` is passed in a test.

  `src/App.tsx`:
  - add `const [plansOpen, setPlansOpen] = useState(false);` beside `cutListOpen`;
  - change `const modalOpen = cutListOpen || dialog !== null;` to
    `const modalOpen = cutListOpen || plansOpen || dialog !== null;` and update the comment above it
    to name the plans sheet;
  - pass to `<Toolbar>`:

```tsx
          onOpenPlans={() => {
            opener.current = document.activeElement as HTMLElement | null;
            setPlansOpen(true);
          }}
```

  - mount beside `CutList`: `{plansOpen && <PlansSheet onClose={() => setPlansOpen(false)} />}`.

  `src/styles.css`: next to the `.cutlist-sheet` rules add:

```css
.plans-section { margin-top: 24px; }
.plans-section h3 { margin: 0 0 8px; }
.plans-explode { display: flex; align-items: center; gap: 6px; }
```

  In the `@media print` block add:

```css
  /* One drawing set per page where it fits; never split a figure. */
  .plans-section { break-inside: avoid; }
```

  The sheet controls sit in `.cutlist-actions`, which print already hides.

- [ ] **Step 4: Run and confirm passing.**
  Run: `npx vitest run src/panels src/App.test.tsx`. Expected: PASS.

- [ ] **Step 5: Mutate.**
  - (a) Change `modalOpen` back to omit `plansOpen`. Expected failure: the App test's `inert`
    assertion.
  - (b) Drop the `× N` suffix. Expected failure: the headings test.

- [ ] **Step 6: Build, run everything, commit.** Run: `npm run build && npm test`.

```bash
git add src/panels/PlansSheet.tsx src/panels/PlansSheet.test.tsx src/panels/Toolbar.tsx src/panels/Toolbar.test.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat(plans): the Plans sheet — exploded view, piece and assembly drawings, print

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Browser pass on the dev server (the user watches)

**Files:**
- Create: `docs/browser-verification-plans-sheet.md`
- Possibly modify: the constants `EXPLODE_SPREAD`, `EXPLODE_INNER` (`explode.ts`) and `MAX_PLAN_SCALE`
  (`planLayout.ts`), after the user's judgement. Any retune comes with its tests updated in the
  same commit.

This task is driven in the Playwright MCP browser against `npm run dev -- --port 5180`, never
production (CLAUDE.md, the deployment rule). Record each check with a DOM readout; add a screenshot
to `docs/img/` when a finding is spatial.

- [ ] **Step 1:** Start the dev server in the background. Open it in Playwright. Build two fixtures
  through the UI or by importing a `.sloyd`:
  - a generated table (or `src/document/fixtures/simple-workbench.sloyd`);
  - a cabinet with a drawer assembly placed twice, one copy mirrored.
- [ ] **Step 2: Viewport slider.** Take it to 0.25, 0.5 and 1. Confirm that:
  - the drawer moves out as a unit and then opens up a little;
  - nothing moves when a part is hidden;
  - the gizmo and guide markers are gone above 0.

  **Show the user and ask** whether `EXPLODE_SPREAD` and `EXPLODE_INNER` read well. Retune only on
  their word.
- [ ] **Step 3: Read-only lockout.** With Explode above 0, try each path and confirm nothing changes
  `past.length`. Read it with `browser_evaluate` on the store if it is exposed; otherwise read the
  Undo button's disabled state and the part's Properties values before and after:
  - drag where the gizmo was;
  - press M and T;
  - type into a Properties field, which should be disabled;
  - press Delete;
  - press Ctrl+D;
  - press Ctrl+Z;
  - rename the project.

  Confirm that selection and H / Alt+H still work.
- [ ] **Step 4: Plans sheet.** Open Plans. Confirm:
  - the section order;
  - the "× N" and mirrored notes;
  - hidden lines are dashed and sit BENEATH visible ones (Task 8's unpinned ordering);
  - the chain dimensions on the shelf heights;
  - a too-dense note when one exists;
  - the sheet slider leaves the viewport's amount alone.

  Then use `browser_emulate_media` with `print` and screenshot. Record that a real print-to-PDF is
  NOT verified (no `pdf()` here; fu 70/79/84).
- [ ] **Step 5:** Confirm `localStorage` is cleared in the verifying browser afterwards. Check it;
  don't assume it. Write `docs/browser-verification-plans-sheet.md`: what was checked, how, and what
  could not be confirmed (software GL, 26a; no real PDF).
- [ ] **Step 6: Commit.**

```bash
git add docs/browser-verification-plans-sheet.md docs/img
git commit -m "docs(plans): browser verification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Record the round

**Files:** `docs/follow-ups.md`, `docs/history.md`, `CLAUDE.md`, `docs/feature-gaps.md`, the spec's
status line, README (test count, if it carries one).

- [ ] **Step 1: `docs/follow-ups.md`.** Add a "From the plans-sheet round — 2026-10-11" section with
  numbered entries continuing after 251, one per §9 out-of-scope item:
  - callouts;
  - user-placed dimensions;
  - section views;
  - joint-direction explode;
  - live viewport dimensions;
  - real print-to-PDF.

  Add an entry for anything Task 10 found but did not fix.
- [ ] **Step 2: `docs/history.md`.** Add the round's narrative: the three planning-time spec
  amendments and why (telescoping weights, closed-box seams, the layer split), the browser pass's
  results, and the final constants.
- [ ] **Step 3: `CLAUDE.md`.**
  - Add a "plans sheet" row to Rounds shipped.
  - Update Status: test count; "not yet deployed" until a deploy happens.
  - Add the new files to Where things live.
  - Promote one condensed invariant, **47**: "**Exploded is read-only through ONE gate**: `edit()`,
    `undo`, `redo` refuse, `setTool` refuses all but Select, `renameItem` returns the stored name;
    `setExplode` is the one writer and leaves 0 only through `setTool('select')`. The explode offset
    is a render-time translation, never written back. Drawings take lines from `boardEdges` and
    occluders from `worldSolids`, closed boxes (a ray along a seam between solids is inside)."
  - Update the test count under Commands from `npm test`'s output.
- [ ] **Step 4: `docs/feature-gaps.md`.** Set dimensioned drawings and exploded view to
  "shipped (plans-sheet round, 2026-10-11)", or "merged, not deployed" if no deploy yet.
- [ ] **Step 5:** Set the spec's status line to "implemented".
- [ ] **Step 6:** Run `npm run build && npm test` one last time and quote the counts in the commit body.

```bash
git add CLAUDE.md docs README.md
git commit -m "docs: record the plans-sheet round

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Deploying is NOT part of this plan. It is a separate step the user approves, following
`DEPLOYMENT.local.md`, with production verified by bundle hash and CSP only.
