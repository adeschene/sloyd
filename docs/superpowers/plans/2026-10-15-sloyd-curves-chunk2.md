# Curves, chunk 2 (drawings) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Curved parts read truly on paper. The Plans sheet draws arcs smooth (≤ 0.001" from the true arc, ≤ 96 chords per
arc) and draws the silhouette lines of curved surfaces, which are missing today. Each part diagram shows the curve's waste
in the face it cuts through, a line at each sharp corner of the outline on the face that corner lies on, and each curve's
bench line as a note.

**Architecture:** A new `document/curveDrawing.ts`, beside `holeDrawing.ts`, holds two functions:
- `curveDrawEdges` re-reads a curved part's model edges and attaches a fine true-arc path to every edge lying on an arc's
  model chord.
- `curveSilhouettes` adds lines along `through` at the outline vertices where the surface turns away from the view.

`drawView` decides visibility on the MODEL chord, against the model's bodies, as today, and then draws the fine path with
that visible/hidden split. `diagram.ts` gains three per-view lists (`curves`, `curveLines`, `curveNotes`), and
`PartDiagram` draws them. Parts without curves keep every byte, and so do parts with curves drawn edge-on.

**Tech Stack:** TypeScript, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-15-sloyd-curves-design.md` §5 (chunk 2), approved 2026-10-15; fu 361.
- Read §3.1, §3.3, §4.1, §5 and §10 before Task 1.
- Read `CLAUDE.md` invariants 16, 19, 44, 47, 50 (its Plans-sheet paragraph) and 53.
- The holes chunk 2 plan (`docs/superpowers/plans/2026-10-14-sloyd-holes-chunk2.md`) is the precedent: `holeDrawing.ts`
  for the sheet and the holes block of `buildDiagrams` for the diagrams.

## Global Constraints

**Process**
- Work on a local branch `curves-2` from `master`. Merge with `git merge --no-ff`, verify the merged tree, then delete the
  branch. No pull requests. Merge and deploy happen only on the user's word.
- No schema change. `CURRENT_VERSION` stays 17.
- `npm test` does not typecheck. Run `npm run build` before claiming a task compiles, and the FULL `npm test` after any
  task that changes a type (`DiagramView` gains fields: hand-built views in panel tests may need them).
- Wall-clock guards (`holesPerf`, `sectionPerf`, `curvesPerf`) flake under load: re-run a failure alone.
- **Mutate every test this plan supplies** (break the code it pins, see it fail, restore). Each task lists its mutations.
- Plan-supplied numbers have been wrong before. Each number below carries its derivation; re-derive it by hand before
  changing it, fix the code rather than the expectation, and escalate when an expectation itself looks wrong.

**Constants (exact)**
- `DRAWING_CURVE_TOLERANCE = 0.001` (inches) and `DRAWING_CURVE_SEGMENTS_MAX = 96` (chords per arc, on paper).
- The model keeps `CURVE_TOLERANCE = 0.005` and `CURVE_SEGMENTS_MAX = 24`. Bodies, occluders and the viewport are
  unchanged.

**Rules**
- Strings: every note is built in `document/` (`curveText.ts`), never in a component (invariant 19).
- Every part↔world crossing goes through `toWorld` of board-local points (invariant 44). Directions are differences of
  mapped points, as `holeDrawing.ts` does.
- Chord frozen data: `partGeometry`'s results are shared and deep-frozen. Never mutate them; build new arrays.

## Planning rulings (spec gaps found while writing this plan — for the user's review with the plan)

**Q1 — Silhouettes (beyond spec §5.1; fixes a live defect).**
- **The defect.** A probe on master (2026-10-15) found that the Plans sheet draws no silhouette for a curved surface:
  - a four-corner rounded top's Front and Side elevations have open ends (no vertical line at either end);
  - an arched apron's Side view has no crown line, which should be hidden (dashed).
- **The cause.** A line along `through` at a smooth outline point is suppressed (invariant 16: no facet lines), and
  nothing replaces it where the surface turns away from the viewer.
- **The fix.** `curveSilhouettes(board, toward)` adds, per view, a line along `through` at each smooth MODEL outline vertex
  where the two faces meeting there face opposite ways relative to the view. It is the discrete silhouette of the model
  polygon, as holes add their wall silhouettes (`holeDrawingSegments`).
- **Why the model vertex, not the true tangent point.** For an arc that bows into the wood, the true arc lies up to 0.005"
  inside the model's wood, so a line there would test hidden when it is visible. The model vertex lies on the body
  boundary, and it is within the model tolerance of the true tangent point.

**Q2 — Visibility is decided on the model chord.** For the same reason as Q1, a fine path point on the true arc can sit
inside the model's wood. `drawView` therefore computes each chord's hidden spans exactly as today, then draws the fine path
with that split, mapping chord parameters onto the path. The spec's "occluders stay the model's bodies" holds, and the
visible/hidden split of every curved part is chunk 1's.

**Q3 — Edge-on views keep the model chords.**
- **When.** A view whose direction lies in the outline's plane (an arched apron's Side view).
- **Rule.** The view gets chunk 1's chords, unrefined. A 96-chord arc folds back over itself on screen, which is the holes
  chunk 2 R2 lesson.
- **Residue.** The 24-chord fold remains as chunk 1 had it. It almost always lies under the face's own visible edge line.
  It is filed as residue (Task 6), not fixed.

**Q4 — A chord split by another feature keeps its end.** When a dado or a second curve splits a model chord, the split end
stays exactly where the model put it, on the chord, up to 0.005" off the arc, so the other feature's line still meets it.
Only the path's interior nodes lie on the true arc.

**Q5 — Part diagrams.**
- The waste is hatched as angle wedges are.
- A sharp-vertex line is drawn only in the view of a FACE THE VERTEX LIES ON, and never along the outline's own edges. The
  spec's "in the other views" would put an arch's end lines on the far edge's view too, where nothing is.
- A curve opens its through face's MIN-side view only when neither side exists. That is decided after every hole has
  opened its entry view, so a hole's view takes the curve rather than a second view appearing.

**Q6 — Notes keep the four-corner collapse.** `curveLineEntries(board, units)` returns `{ ids, text }`, the
`curveLines` strings with the ids each covers. `curveLines` maps it, and a view lists the entries any of whose ids it
draws.

## Review Focus

1. **A rounded top's elevations close at both ends** (Q1). Task 3 pins Front and Side, visible and hidden.
2. **A dado through an arch's chord** (Q4): no gap where the dado meets the arc, and no point leaves the chord at the split.
   Task 1 pins the path ends; Task 2 pins the drawn endpoints.
3. **Mirrored and turned curved parts** draw the reflection of the unmirrored part (`chiralCurved`, every posture and
   turn). Tasks 2 and 3.
4. **A curve that runs off the part** (a faulted, kept curve) draws only inside the part on the diagram. Task 4.
5. **Parts without curves are byte-for-byte unchanged** on the sheet and in diagrams. Hashes were computed on master
   (`54ea740`) for this plan. Tasks 2 and 4.

---

### Task 1: `curveDrawing.ts` — the fine path on every model chord

**Files:**
- Create: `src/document/curveDrawing.ts`, `src/document/curveDrawing.test.ts`
- Modify: `src/document/curves.ts` (export `arcPoint`, currently a module function at line ~136)

**Interfaces:**
- Produces:
  - `DRAWING_CURVE_TOLERANCE = 0.001` and `DRAWING_CURVE_SEGMENTS_MAX = 96`.
  - `interface DrawEdge { p: V3; q: V3; path?: { pts: V3[]; at: number[]; k: number } }`, board-local
    `[length, width, thickness]`.
  - `curveDrawEdges(board: Board): readonly DrawEdge[]`.
  - `arcPoint` exported from `curves.ts`.
- Consumes: `partGeometry(board).edges` (`Segment = [Point, Point]`), and from `curves.ts` `localSegments`, `arcChords`,
  `distToSegment`, `uvDims`, `CURVE_TOLERANCE`, `CURVE_SEGMENTS_MAX`.

**The rule.** For each curve `c` (through axis index `k`, in-plane `ui`, `vi`) and each arc `s` of `localSegments(board, c)`:
- `n = arcChords(s, CURVE_TOLERANCE, CURVE_SEGMENTS_MAX)`.
- The model chords are `arcPoint(s, j/n) → arcPoint(s, (j+1)/n)`, exactly `curveOutline`'s points.
- Each chord is split into `m = max(1, min(ceil(N/n), floor(96/n)))` fine pieces, `N = arcChords(s, 0.001, 96)`. An arc
  never exceeds 96 pieces.

An edge `[p, q]` of `partGeometry(board).edges` lies on chord j when all of these hold:
- `|p[k] − q[k]| ≤ 1e-9`;
- both ends' `(u, v)` are within `ON_CHORD = 1e-7` of the chord segment;
- the ends are distinct.

The first match wins. Its path:
- `pts[0]` is `p` and the last point is `q`, the original numbers;
- between them, the fine nodes `arcPoint(s, (j + i/m)/n)` whose arc fraction lies strictly between those of `p` and `q`;
- each node is lifted to 3D with `p[k]`;
- `at[i]` is each point's parameter along `p→q` (projection onto `q − p`), `0` first and `1` last, strictly increasing.

A point's arc fraction on chord j uses the chord's half-angle `h = |sweep|/(2n)` and the chord parameter `t ∈ [0, 1]`:
`φ = 0.5 + atan((2t − 1)·tan h)/(2h)` (exactly 0 at t = 0 and 1 at t = 1), and the fraction is `(j + φ)/n`. This is the
central projection: a chord's interior point maps to the arc point on the same ray from the centre.

Edges matching no chord keep no path. A part with no curves returns its edges, each without a path. Results are memoised
in a `WeakMap` keyed on the frozen `partGeometry(board).edges` array. That is sound because the array is shared exactly
by boards with one `geometryKey`, and the key covers dimensions and curves. The result is frozen.

- [ ] **Step 1: Write the failing tests**

```ts
// src/document/curveDrawing.test.ts
import { describe, expect, it } from 'vitest';
import { createBoard, archCurve, cornerCurve, partGeometry } from './document';
import type { Board, Cut } from './types';
import { curveDrawEdges, DRAWING_CURVE_SEGMENTS_MAX } from './curveDrawing';

// Flat at turn 0. Arch on a 30 x 5 x 3/4 apron, width min side, 3" in from each end, 1-1/2" rise:
// R = (12^2 + 1.5^2) / (2 * 1.5) = 48.75, centre (15, 1.5 - 48.75) = (15, -47.25), sweep 2 asin(12/48.75) = 0.49742.
// Model chords: step 2 acos(1 - 0.005/48.75) = 0.028645 -> ceil(17.37) = 18. Fine: step 2 acos(1 - 0.001/48.75) =
// 0.012810 -> ceil(38.83) = 39; m = min(ceil(39/18) = 3, floor(96/18) = 5) = 3.
const arch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 }) };
const apron = (over: Partial<Board> = {}) => createBoard({ id: 'ap', length: 30, width: 5, thickness: 0.75, curves: [arch], ...over });
const onArc = (p: readonly number[]) => Math.abs(Math.hypot(p[0]! - 15, p[1]! + 47.25) - 48.75);

describe('curveDrawEdges (curves spec §5.1; Q2, Q4)', () => {
  it('a part without curves: its edges, no paths, and the same array for the same geometry', () => {
    const b = createBoard({ length: 20, width: 6, thickness: 0.75 });
    const e = curveDrawEdges(b);
    expect(e).toHaveLength(partGeometry(b).edges.length);
    expect(e.every((x) => x.path === undefined)).toBe(true);
    expect(curveDrawEdges({ ...b })).toBe(e);
  });

  it('the arch: 18 model chords on each face plane, each 3 fine pieces on the true arc, ends kept exactly', () => {
    const b = apron();
    const paths = curveDrawEdges(b).filter((x) => x.path);
    expect(paths).toHaveLength(36); // 18 chords x 2 planes (thickness 0 and 3/4)
    for (const { p, q, path } of paths) {
      expect(path!.k).toBe(2);
      expect(path!.pts).toHaveLength(4);
      expect(path!.pts[0]).toEqual(p);
      expect(path!.pts[3]).toEqual(q);
      for (const x of path!.pts) { expect(onArc(x)).toBeLessThan(1e-9); expect(x[2]).toBe(p[2]); }
      expect(path!.at[0]).toBe(0);
      expect(path!.at[3]).toBe(1);
      for (let i = 1; i < 4; i += 1) expect(path!.at[i]!).toBeGreaterThan(path!.at[i - 1]!);
    }
  });

  it('a 2" rounded corner: 12 model chords per plane, 3 pieces each (N = 25: m = min(3, 8))', () => {
    // Quarter circle r = 2: model step 2 acos(1 - 0.005/2) = 0.14146 -> ceil(11.10) = 12; fine 2 acos(1 - 0.001/2) =
    // 0.063249 -> ceil(24.83) = 25.
    const b = createBoard({ length: 36, width: 20, thickness: 0.75, curves: [{ id: 'c', ...cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 2 }) }] });
    const paths = curveDrawEdges(b).filter((x) => x.path);
    expect(paths).toHaveLength(24);
    expect(paths.every((x) => x.path!.pts.length === 4)).toBe(true);
  });

  it('an arc never exceeds 96 pieces: a 10" half-round notch draws exactly 96 (n = 24, m = 4)', () => {
    // r = 10, sweep pi: model step 2 acos(1 - 0.0005) = 0.063249 -> 49.67 -> capped 24; fine step 2 acos(1 - 0.0001) =
    // 0.028285 -> 111.07 -> capped 96; m = min(4, 4) = 4.
    const notch = { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 5, span: 20, rise: 10 }) };
    const b = createBoard({ length: 30, width: 12, thickness: 0.75, curves: [notch] });
    const onPlane0 = curveDrawEdges(b).filter((x) => x.path && x.p[2] === 0);
    expect(onPlane0.reduce((n, x) => n + x.path!.pts.length - 1, 0)).toBe(DRAWING_CURVE_SEGMENTS_MAX);
  });

  it('a chord a dado splits keeps its split end on the chord; only interior nodes move to the arc (Q4)', () => {
    // A 1" dado 1/4" deep across the width at length 14.5..15.5, from the thickness max face: the max-face outline stops at
    // the dado walls. u = 14.5 is inside chord 8 (theta = asin(-0.5/48.75) = -0.010257; chords are 0.027634 wide, the crown
    // vertex at theta = 0), so that chord's piece on the max face ends off the arc.
    const dado: Cut = { id: 'd', face: 'thickness', from: 'max', across: 'width', offset: 14.5, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 };
    const b = apron({ cuts: [dado] });
    const split = curveDrawEdges(b).filter((x) => x.path && (Math.abs(x.p[0] - 14.5) < 1e-9 || Math.abs(x.q[0] - 14.5) < 1e-9));
    expect(split.length).toBeGreaterThan(0);
    for (const { p, q, path } of split) {
      const end = Math.abs(p[0] - 14.5) < 1e-9 ? p : q;
      expect(onArc(end)).toBeGreaterThan(1e-6); // on the chord, off the arc
      expect(onArc(end)).toBeLessThan(0.005);
      expect(path!.pts[0]).toEqual(p);
      expect(path!.pts[path!.pts.length - 1]).toEqual(q);
      for (const x of path!.pts.slice(1, -1)) expect(onArc(x)).toBeLessThan(1e-9);
    }
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/document/curveDrawing.test.ts`
Expected: FAIL — cannot resolve `./curveDrawing`.

- [ ] **Step 3: Implement**

In `src/document/curves.ts`, change `function arcPoint(` to `export function arcPoint(`. Leave the doc comment as is. Then
create:

```ts
// src/document/curveDrawing.ts
import type { Board } from './types';
import { DIMENSION_ORDER } from './geometry';
import { partGeometry } from './bodies';
import type { Segment } from './cuts';
import {
  arcChords, arcPoint, distToSegment, localSegments, uvDims, CURVE_SEGMENTS_MAX, CURVE_TOLERANCE, type LocalArc, type P2,
} from './curves';

type V3 = [number, number, number];

/** Inches: a printed arc's greatest gap to the true arc (curves spec §5.1). The model keeps CURVE_TOLERANCE (0.005). */
export const DRAWING_CURVE_TOLERANCE = 0.001;
/** Chords per arc on paper, at most (as hole rims are 96-gons on the sheet). */
export const DRAWING_CURVE_SEGMENTS_MAX = 96;
/** Inches: an edge end matched to a model chord (body vertices are plane intersections, not arcPoint's numbers). */
const ON_CHORD = 1e-7;

/**
 * One drawing edge, board-local. `path` is set when the edge lies on a model chord of an arc: the fine path from p to q,
 * p and q themselves first and last (a split end stays where the model put it, ruling Q4), the nodes between ON the
 * true arc; at[i] is pts[i]'s parameter along p→q (0 … 1, increasing); k the through axis — the plane's normal.
 */
export interface DrawEdge { p: V3; q: V3; path?: { pts: V3[]; at: number[]; k: number } }

const v3 = (p: Segment[0]): V3 => [p.length, p.width, p.thickness];
const memo = new WeakMap<readonly Segment[], readonly DrawEdge[]>();

/** Fine pieces per model chord: the drawing tolerance's count spread over the model's chords, never past 96 per arc. */
function perChord(arc: LocalArc, n: number): number {
  const N = arcChords(arc, DRAWING_CURVE_TOLERANCE, DRAWING_CURVE_SEGMENTS_MAX);
  return Math.max(1, Math.min(Math.ceil(N / n), Math.floor(DRAWING_CURVE_SEGMENTS_MAX / n)));
}

/** The arc fraction of x on model chord j (P→Q) by central projection; exact at the chord's ends. */
function fractionOn(arc: LocalArc, n: number, j: number, P: P2, Q: P2, x: P2): number {
  const dx = Q[0] - P[0];
  const dy = Q[1] - P[1];
  const t = Math.min(1, Math.max(0, ((x[0] - P[0]) * dx + (x[1] - P[1]) * dy) / (dx * dx + dy * dy)));
  const h = Math.abs(arc.sweep) / n / 2;
  const phi = t === 0 ? 0 : t === 1 ? 1 : 0.5 + Math.atan((2 * t - 1) * Math.tan(h)) / (2 * h);
  return (j + phi) / n;
}

/**
 * A curved part's model edges for the Plans sheet (curves spec §5.1): every edge lying on an arc's model chord carries the
 * fine path along the true arc between its ends. drawView decides visibility on the chord (ruling Q2). A part without
 * curves gets its edges back unchanged. Memoised on partGeometry's frozen edges (shared by one geometryKey only).
 */
export function curveDrawEdges(board: Board): readonly DrawEdge[] {
  const edges = partGeometry(board).edges;
  const hit = memo.get(edges);
  if (hit) return hit;
  const chords = board.curves.flatMap((c) => {
    const [u, v] = uvDims(c.through);
    const ui = DIMENSION_ORDER.indexOf(u);
    const vi = DIMENSION_ORDER.indexOf(v);
    const k = DIMENSION_ORDER.indexOf(c.through);
    return localSegments(board, c).flatMap((s) => {
      if (s.kind !== 'arc') return [];
      const n = arcChords(s, CURVE_TOLERANCE, CURVE_SEGMENTS_MAX);
      const m = perChord(s, n);
      return Array.from({ length: n }, (_, j) => ({ arc: s, n, m, j, P: arcPoint(s, j / n), Q: arcPoint(s, (j + 1) / n), ui, vi, k }));
    });
  });
  const out: DrawEdge[] = edges.map(([P0, Q0]) => {
    const p = v3(P0);
    const q = v3(Q0);
    for (const ch of chords) {
      if (Math.abs(p[ch.k]! - q[ch.k]!) > 1e-9) continue;
      const a: P2 = [p[ch.ui]!, p[ch.vi]!];
      const b: P2 = [q[ch.ui]!, q[ch.vi]!];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= 1e-9) continue;
      if (distToSegment(a, ch.P, ch.Q) > ON_CHORD || distToSegment(b, ch.P, ch.Q) > ON_CHORD) continue;
      const fa = fractionOn(ch.arc, ch.n, ch.j, ch.P, ch.Q, a);
      const fb = fractionOn(ch.arc, ch.n, ch.j, ch.P, ch.Q, b);
      const lo = Math.min(fa, fb);
      const hi = Math.max(fa, fb);
      const nodes: P2[] = [];
      for (let i = 1; i < ch.m; i += 1) {
        const f = (ch.j + i / ch.m) / ch.n;
        if (f > lo + 1e-12 && f < hi - 1e-12) nodes.push(arcPoint(ch.arc, f));
      }
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const l2 = dx * dx + dy * dy;
      const param = (x: P2) => ((x[0] - a[0]) * dx + (x[1] - a[1]) * dy) / l2;
      nodes.sort((x, y) => param(x) - param(y));
      const lift = (x: P2): V3 => { const r: V3 = [p[0], p[1], p[2]]; r[ch.ui] = x[0]; r[ch.vi] = x[1]; return r; };
      return { p, q, path: { pts: [p, ...nodes.map(lift), q], at: [0, ...nodes.map(param), 1], k: ch.k } };
    }
    return { p, q };
  });
  const frozen = Object.freeze(out.map((e) => Object.freeze(e)));
  memo.set(edges, frozen);
  return frozen;
}
```

Note: `arcPoint(s, 0)` and `arcPoint(s, 1)` return `s.a` / `s.b` themselves, as `curveOutline` does, so the model chords
are the outline's exactly.

- [ ] **Step 4: Run the tests until they pass**

Run: `npx vitest run src/document/curveDrawing.test.ts`
Expected: PASS (5 tests). A count that is off: re-derive it by hand (the comments above) before touching code or test.

- [ ] **Step 5: Mutate**

Apply each mutation, see a test fail, then restore:
- Make `perChord` return `4` (the arch and corner tests fail: 5 points, not 4).
- Replace `pts: [p, …, q]` with nodes only (the "ends kept exactly" test fails).
- Set `fa` and `fb` to `ch.j / ch.n` (the split chord gains a node outside its own span; the split-chord test fails on
  `at` ordering or the on-arc check — if it survives, report it rather than weakening anything).
- Skip the memo `set` (the "same array" test fails).

**An unreachable guard, said plainly.** The `floor(96 / n)` term cannot bite with today's constants. N/n is about
√(0.005/0.001) ≈ 2.24 whenever neither count is capped. N reaches 96 only once n is capped at 24, where
ceil(N/24) ≤ 4 = floor(96/24). The term keeps "≤ 96 per arc" true if either tolerance changes. No test can fail by
removing it today, so record that in the report instead of inventing one.

- [ ] **Step 6: Build and commit**

Run: `npm run build` (clean), then:

```bash
git add src/document/curveDrawing.ts src/document/curveDrawing.test.ts src/document/curves.ts
git commit -m "curves: curveDrawEdges — the fine true-arc path on every model chord (chunk 2)"
```

---

### Task 2: `drawView` draws the fine path, with visibility from the chord

**Files:**
- Modify: `src/document/drawing.ts` (`drawView`, lines ~150–235)
- Test: `src/document/drawing.test.ts` (append), `src/document/drawingIdentity.test.ts` (create)

**Interfaces:**
- Consumes: `curveDrawEdges(board)` and `DrawEdge` (Task 1).
- Produces: `drawView` unchanged in signature. A curved part's arc lines arrive as consecutive `Seg2` pieces in path order,
  so `PlanFigure`'s `pathOf` chains them and a hidden arc dashes continuously.

**The rule.**
- **Segment list.** Each part's segment list becomes `{ A, E, path? }` objects, world space:
  - a part with no curves maps `partGeometry(b).edges` through `toWorld` EXACTLY as today;
  - a curved part maps `curveDrawEdges(b)`;
  - an edge with a path keeps it unless the outline's plane is edge-on to the view, where the chord stands (Q3). Edge-on
    means `|dot(toWorld(p + e_k) − toWorld(p), toward)| ≤ 1e-9`.
- **Visibility** (`spans`, `merged`) is computed on the chord A→E, unchanged.
- **Drawing.** For each visible or hidden interval [t0, t1] passing the existing `(t1 − t0)·length ≥ DRAW_EPS` gate:
  - a chord emits one piece, as today;
  - a path emits the polyline from `pointAt(t0)` through every node with `t0 < at[i] < t1` to `pointAt(t1)`, where
    `pointAt` interpolates between the projected nodes bracketing t. Skip only pieces of zero length (`< 1e-12`), so the
    chain never breaks.

- [ ] **Step 1: Pin the uncurved output BEFORE touching drawing.ts**

Create `src/document/drawingIdentity.test.ts`. The hashes below were computed on master `54ea740` by exactly this code. If
they do not reproduce on your unchanged tree, STOP and report: the fixture differs.

```ts
import { createHash } from 'node:crypto';
import { createBoard, defaultHingeCup, defaultShelfPinRow } from './document';
import { drawView, FRONT, SIDE, TOP, ISO } from './drawing';
import { chiralAngled } from './turnFixtures';

/** Parts WITHOUT curves draw byte-for-byte what they drew before curves chunk 2 (spec §5.1): a holed, a dadoed and an
 *  angled part in one scene, every sheet view, hashed on master 54ea740. They must not move. */
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
const side = createBoard({ id: 'side', length: 30, width: 11.25, thickness: 0.75, cuts: [dado] });
const sidePins = { ...side, holes: [{ id: 'r1', ...defaultShelfPinRow(side)! }] };
const door = createBoard({ id: 'door', length: 24, width: 15, thickness: 0.75, position: [0, 0, 12] });
const doorCup = { ...door, holes: [{ id: 'h1', ...defaultHingeCup(door) }] };
const angled = { ...chiralAngled('upright'), id: 'ang', position: [40, 0, 0] as [number, number, number] };
const scene = [sidePins, doorCup, angled];

describe('drawView of parts without curves is unchanged (byte-for-byte)', () => {
  it.each([
    [FRONT, 'f5d35b9cbb6a504743f6a1ff74ea72c1f3ba1edd89d37d5c867505670fc92545'],
    [SIDE, 'e66ce2a4c2e9b1ef6e62e81c3a2c7460e0d4829af2d7915f3cc82b8013562191'],
    [TOP, 'a69502032b83e3680b13927be187e55d02b92f62c4179367ec8e5a0617318583'],
    [ISO, '9192f4759448270933c830bc06b0b859ba705c6eaa97d3a91ec351506ffda228'],
  ])('%#: %o', (view, hash) => {
    expect(sha(drawView(scene, view))).toBe(hash);
  });
});
```

Run: `npx vitest run src/document/drawingIdentity.test.ts`. Expected: PASS on the unchanged tree. Commit it alone:

```bash
git add src/document/drawingIdentity.test.ts
git commit -m "test(drawing): pin drawView of uncurved parts before curves chunk 2"
```

- [ ] **Step 2: Write the failing tests** (append to `src/document/drawing.test.ts`)

```ts
import { archCurve } from './curves';
import { chiralCurved, sameSet } from './turnFixtures';

describe('curved parts on the sheet (curves spec §5.1; Q2, Q3, Q4)', () => {
  // On edge: length on X, width on Y (up), thickness on Z (the Front view looks down the thickness).
  // Arch: R = 48.75, centre (15, -47.25) in (length, width); 18 model chords, 3 fine pieces each (Task 1's derivation).
  const arch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 }) };
  const apron = (cuts: Board['cuts'] = []) => box('ap', 30, 5, 0.75, [0, 0, 0], { posture: 'on-edge', curves: [arch], cuts });
  const off = ([x, y]: readonly number[]) => Math.abs(Math.hypot(x! - 15, y! + 47.25) - 48.75);
  const arcPieces = (segs: Seg2[]) => segs.filter((s) => off(s.a) < 1e-9 && off(s.b) < 1e-9 && !(Math.abs(s.a[1]) < 1e-9 && Math.abs(s.b[1]) < 1e-9));

  it('Front: the arch is 54 fine pieces on the true arc, visible on the near face and hidden on the far one', () => {
    const d = drawView([apron()], FRONT);
    expect(arcPieces(d.visible)).toHaveLength(54);
    expect(arcPieces(d.hidden)).toHaveLength(54);
  });

  it('the visible/hidden split is the model chords\' (Q2): every curved part\'s totals match chunk 1 within the sagitta', () => {
    // Chunk 1 drew 18 chords per face; the fine path is longer than its chord by at most the arc-minus-chord excess,
    // far under 0.01 over the whole arch (24.33" of arc). Visible and hidden each keep their chord's share.
    const d = drawView([apron()], FRONT);
    const arcLen = 48.75 * 2 * Math.asin(12 / 48.75); // 24.249
    expect(total(arcPieces(d.visible))).toBeCloseTo(arcLen, 2);
    expect(total(arcPieces(d.hidden))).toBeCloseTo(arcLen, 2);
  });

  it('a dado splitting a chord: the drawn piece ends exactly at the dado wall (Q4), interior points on the arc', () => {
    const dado = { id: 'd', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 14.5, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 };
    const d = drawView([apron([dado])], FRONT);
    const all = [...d.visible, ...d.hidden];
    const atWall = all.flatMap((s) => [s.a, s.b]).filter((p) => Math.abs(p[0] - 14.5) < 1e-9 && p[1] > 1e-6);
    expect(atWall.length).toBeGreaterThan(0);
    for (const p of atWall) expect(off(p)).toBeLessThan(0.005);
    for (const p of all.flatMap((s) => [s.a, s.b])) {
      if (p[1] > 1e-6 && p[1] < 1.5 + 1e-9 && Math.abs(p[0] - 14.5) > 1e-9 && Math.abs(p[0] - 15.5) > 1e-9 && p[0] > 3 && p[0] < 27) {
        expect(off(p)).toBeLessThan(1e-9);
      }
    }
  });

  it('edge-on (Side looks along the length, in the arch\'s plane): chunk 1\'s chords, unrefined (Q3)', () => {
    // Measured on master 54ea740: Side draws 4 visible and 42 hidden segments for this apron.
    const d = drawView([apron()], SIDE);
    expect(d.visible).toHaveLength(4);
    expect(d.hidden).toHaveLength(42);
  });

  const POSTURES = ['flat', 'on-edge', 'upright'] as const;
  const TURNS = [0, 90, 180, 270] as const;
  const near = (a: number[][], b: number[][]) => sameSet(a.map((p) => p.map((v) => Math.round(v * 1e6) / 1e6)), b.map((p) => p.map((v) => Math.round(v * 1e6) / 1e6)));
  it.each(POSTURES.flatMap((posture) => TURNS.map((rotation) => ({ posture, rotation }))))(
    '%o: a mirrored curved part draws the reflection across x = 0 (Front and Plan)',
    ({ posture, rotation }) => {
      const b = { ...chiralCurved(posture), rotation, position: [2, 1, -3] as [number, number, number] };
      for (const v of [FRONT, TOP]) {
        const pts = (d: ReturnType<typeof drawView>) => [...d.visible, ...d.hidden].flatMap((s) => [[...s.a], [...s.b]]);
        const reflected = pts(drawView([b], v)).map(([x, y]) => [0 - x!, y!]);
        expect(near(pts(drawView([mirrorPart(b)], v)), reflected)).toBe(true);
        expect(total(drawView([mirrorPart(b)], v).visible)).toBeCloseTo(total(drawView([b], v).visible), 6);
      }
    },
  );
});
```

Add `SIDE` to the file's `./drawing` import, and merge `chiralCurved` and `sameSet` into its existing `./turnFixtures`
import (it already imports `chiralAngled` from there).

Rounding to 1e-6 before `sameSet` (which keys at 1e-9) absorbs trig noise between a curve and its mirror. Do not loosen it
further. If a mirror case fails at 1e-6, it is a real difference: report it.

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run src/document/drawing.test.ts`
Expected: the Front piece counts FAIL (18, not 54). The edge-on and mirror cases may pass already (chunk 1 behaviour);
they pin it.

- [ ] **Step 4: Implement** (in `drawing.ts`)

Add the import `import { curveDrawEdges } from './curveDrawing';`. Add, above `drawView`:

```ts
/** One line to draw, world space, no explode offset: a chord and, on a curved part, the fine path along it (curves spec
 *  §5.1, ruling Q2: visibility is decided on the chord A→E; the path only changes what is drawn). */
interface Seg3 { A: Vec3; E: Vec3; path?: { pts: Vec3[]; at: number[] } }

function partSegments(b: Board, toward: readonly number[]): Seg3[] {
  if (b.curves.length === 0) return partGeometry(b).edges.map(([p, q]) => ({ A: toWorld(b, p), E: toWorld(b, q) }));
  const W = (p: readonly number[]) => toWorld(b, { length: p[0]!, width: p[1]!, thickness: p[2]! });
  return curveDrawEdges(b).map((e) => {
    const A = W(e.p);
    const E = W(e.q);
    if (!e.path) return { A, E };
    const step = [e.p[0], e.p[1], e.p[2]];
    step[e.path.k] = step[e.path.k]! + 1;
    // Edge-on (ruling Q3): the outline's plane holds the view direction, so a fine path would fold over itself on
    // screen (holes chunk 2 R2) — the model chord stands.
    const n = W(step).map((x, i) => x - A[i]!);
    if (Math.abs(dot(n, toward)) <= 1e-9) return { A, E };
    return { A, E, path: { pts: e.path.pts.map(W), at: e.path.at } };
  });
}
```

In `drawView`, replace the `segments` array and the loop header:

```ts
    const segments: Seg3[] = [
      ...partSegments(b, view.toward),
      ...holeDrawingSegments(b, view.toward).map(([A, E]) => ({ A, E })),
    ];
    for (const seg of segments) {
      const A = plus(seg.A, off);
      const E = plus(seg.E, off);
```

(The rest of the loop body reads `A`, `E` as before.) Replace the `push` helper and its three calls:

```ts
      const at = (t: number): P2 => [pa[0] + t * (pe[0] - pa[0]), pa[1] + t * (pe[1] - pa[1])];
      const pp = seg.path?.pts.map((x) => proj(plus(x, off)));
      // The path's point at chord parameter t: between the two nodes bracketing it.
      const along = (t: number): P2 => {
        const ts = seg.path!.at;
        let i = 0;
        while (i < ts.length - 2 && ts[i + 1]! < t) i += 1;
        const f = (t - ts[i]!) / (ts[i + 1]! - ts[i]!);
        return [pp![i]![0] + f * (pp![i + 1]![0] - pp![i]![0]), pp![i]![1] + f * (pp![i + 1]![1] - pp![i]![1])];
      };
      const push = (out: Seg2[], t0: number, t1: number) => {
        if ((t1 - t0) * length < DRAW_EPS) return;
        if (!seg.path) { out.push({ a: at(t0), b: at(t1), part: b.id }); return; }
        const pts = [along(t0), ...pp!.filter((_, i) => seg.path!.at[i]! > t0 && seg.path!.at[i]! < t1), along(t1)];
        for (let i = 0; i + 1 < pts.length; i += 1) {
          const [p, q] = [pts[i]!, pts[i + 1]!];
          if (Math.hypot(q[0] - p[0], q[1] - p[1]) >= 1e-12) out.push({ a: p, b: q, part: b.id });
        }
      };
```

The three calls (`push(visible, cur, …)`, `push(hidden, …)`, `push(visible, cur, 1)`) are unchanged. Update the doc comment
of `drawView`: "Edges from `boardEdges` (invariant 16) — on a curved part through `curveDrawEdges`, the fine path drawn with
its chord's visibility (curves spec §5.1, Q2, Q3) — and hole lines …".

Check: `along(0)` is `pp[0]`, the projection of the same world point as `pa`. `along(1)` is the last node. A non-path edge
pushes exactly the object it pushed before, so `drawingIdentity.test.ts` must still pass unchanged.

- [ ] **Step 5: Run the drawing tests**

Run: `npx vitest run src/document/drawing.test.ts src/document/drawingIdentity.test.ts src/document/holeDrawing.test.ts src/panels/PlanFigure.test.tsx src/panels/PlansSheet.test.tsx`
Expected: PASS.

- [ ] **Step 6: Measure** (record in the task report; no guard is added)

Create a throwaway `src/zzPerf.test.ts`, run it, then delete it.
- The harness: build a table of 4 upright legs, 4 on-edge aprons each with an arch (span 11.25, rise 1.25, start 2 on a
  15.25 × 5 × 0.75 apron), and a 22 × 22 × 0.75 top with `defaultCorners`. Then time `drawView(parts, v)` for each of
  FRONT, SIDE, TOP and ISO: warm it up 3 times, and take the minimum of 9 runs.
- The baseline on master `54ea740`, measured while writing this plan: Front 4.9 ms, Side 5.1, Plan 5.7, Iso 6.4.
- The expected rise is small: visibility is still computed per chord, and only the push grows. A rise past 2× the baseline
  is a finding to report, not to fix silently. It ties to the sheet slider lag (fu 263/344).

- [ ] **Step 7: Mutate**

Apply each mutation, see a test fail, then restore:
- Return `{ A, E }` always from `partSegments` (the 54-piece tests fail).
- Remove the edge-on check (the Side test fails: 4/42 grows).
- In `along`, return `at(t)` (the chord point) (the true-arc tests fail).
- Push path pieces into `visible` regardless of `out` (the hidden count fails).

- [ ] **Step 8: Build, full test, commit**

Run: `npm run build`, `npm test`.

```bash
git add src/document/drawing.ts src/document/drawing.test.ts
git commit -m "curves: the Plans sheet draws arcs at 0.001\" — visibility from the model chord, edge-on views unrefined (chunk 2)"
```

---

### Task 3: `curveSilhouettes` — the lines where a curved surface turns away (Q1)

**Files:**
- Modify: `src/document/curveDrawing.ts`, `src/document/drawing.ts` (one line in the segment list),
  `src/document/curveDrawing.test.ts`, `src/document/drawing.test.ts` (update the edge-on count)

**Interfaces:**
- Produces: `curveSilhouettes(board: Board, toward: readonly number[]): [Vec3, Vec3][]`, world space, no explode offset.
- Consumes: `curveOutline` (model tolerance), `uvDims`, `twiceArea`, and `toWorld` from `snapPoints.ts`.

**The rule.** For each curve `c` (in-plane dims `u, v`, rectangle `U × V`, through axis `k`):
- Take the view direction in (u, v): `d = (dot(Wu, toward), dot(Wv, toward))`, where `Wu = toWorld(e_u) − toWorld(0)`
  (board-local unit points mapped, invariant 44). If `|d| ≤ 1e-9`, the view looks down `through`: no silhouettes.
- At each SMOOTH vertex `i` of `curveOutline(board, c)` (`smooth[i]`), take the two outline edges `(i−1 → i)` and
  `(i → i+1)`. Each has an outward WOOD normal:
  - an edge lying on one side of the face rectangle (both ends on `u = 0`, `u = U`, `v = 0` or `v = V` within 1e-9)
    stands in for the part's own face there, whose normal is the rectangle's outward normal on that side;
  - any other edge takes the waste's inward normal (into the waste). With `ccw = twiceArea(pts) > 0`, that is the left
    normal of the edge's direction when `ccw`, else the right normal.
- The vertex is a silhouette when `(n1·d)·(n2·d) ≤ 0`, so that a face exactly edge-on to the view counts. Emit the line
  from the vertex at `through = 0` to the vertex at `through = board[c.through]`, both through `toWorld`.
- Sharp vertices are skipped: `curvedEdges` already draws them.
- Wire it into `drawView`'s segment list after the hole lines:
  `...curveSilhouettes(b, view.toward).map(([A, E]) => ({ A, E })),`.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/drawing.test.ts`:

```ts
import { defaultCorners } from './curves';

describe('curved surfaces draw their silhouettes (ruling Q1)', () => {
  // Flat: length X, thickness Y (up), width Z. Four 2" corners on a 36 x 20 x 3/4 top. Before chunk 2 its Front and Side
  // elevations had NO vertical line at either end (probe on master 54ea740).
  const top = box('t', 36, 20, 0.75, [0, 0, 0], { curves: defaultCorners({ length: 36, width: 20, thickness: 0.75 }).map((c, i) => ({ id: `c${i}`, ...c })) });
  it('Front: each end closes — one visible and one hidden 3/4" line at x = 0 and at x = 36', () => {
    // The joins on the end faces: (0, 2) and (0, 18) (and at length 36). Viewer at +Z: the width-max join is in front
    // (visible), the width-min one behind the part (hidden), both projecting to the same line.
    const d = drawView([top], FRONT);
    for (const x of [0, 36]) {
      expect(total(verticalAt(d.visible, x))).toBeCloseTo(0.75, 9);
      expect(total(verticalAt(d.hidden, x))).toBeCloseTo(0.75, 9);
    }
  });
  it('Side: each end closes at x = 0 and x = -20 (Side\'s right is -Z)', () => {
    const d = drawView([top], SIDE);
    for (const x of [0, -20]) expect(total(verticalAt(d.visible, x))).toBeCloseTo(0.75, 9);
  });
  it('Plan looks down the thickness: no silhouettes (the outline is the drawing)', () => {
    expect(curveSilhouettes(top, [0, 1, 0])).toHaveLength(0);
  });
});
```

Add `import { curveSilhouettes } from './curveDrawing';` and merge `defaultCorners` into Task 2's `./curves` import.
Update the Task 2 edge-on
test: Side now also draws the arch's crown silhouette, hidden behind the apron's ends, so set `hidden` to `43` and add:

```ts
    // The crown (15, 1.5) is model vertex 9 of 18 (fraction 1/2), a silhouette looking along the length; the wood beyond
    // it along +X hides it: one hidden 3/4" line at y = 1.5 (Side's right is -Z: x from -0.75 to 0).
    expect(total(horizontalAt(d.hidden, 1.5))).toBeCloseTo(0.75, 9);
    expect(total(horizontalAt(d.visible, 1.5))).toBe(0);
```

Append to `src/document/curveDrawing.test.ts` (mirrors and turns, the holes pattern):

```ts
import { chiralCurved, sameSet } from './turnFixtures';
import { mirrorPart } from './frames';
import { curveSilhouettes } from './curveDrawing';

describe('silhouettes through mirrors and turns', () => {
  const POSTURES = ['flat', 'on-edge', 'upright'] as const;
  const TURNS = [0, 90, 180, 270] as const;
  const ends = (segs: [number[], number[]][]) => segs.flatMap(([a, b]) => [[...a], [...b]]).map((p) => p.map((v) => Math.round(v * 1e6) / 1e6));
  const VIEWS = [[0, 0, 1], [1, 0, 0], [0.5773502691896258, 0.5773502691896258, 0.5773502691896258]];
  it.each(POSTURES.flatMap((posture) => TURNS.map((rotation) => ({ posture, rotation }))))(
    '%o: mirrorPart\'s silhouettes are the reflection across x = 0',
    ({ posture, rotation }) => {
      const b = { ...chiralCurved(posture), rotation, position: [2, 1, -3] as [number, number, number] };
      for (const T of VIEWS) {
        const R = [-T[0]!, T[1]!, T[2]!]; // the mirrored part seen from the mirrored direction
        const reflected = ends(curveSilhouettes(b, T)).map(([x, y, z]) => [0 - x!, y!, z!]);
        expect(sameSet(ends(curveSilhouettes(mirrorPart(b), R)), reflected)).toBe(true);
      }
    },
  );
  it('the chiral fixture draws silhouettes in some view (the test above is not vacuous)', () => {
    expect(VIEWS.some((T) => curveSilhouettes(chiralCurved('flat'), T).length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/document/drawing.test.ts src/document/curveDrawing.test.ts`
Expected: FAIL — `curveSilhouettes` is not exported, and once it is stubbed, the Front, Side and crown totals read 0.

- [ ] **Step 3: Implement** (append to `curveDrawing.ts`)

```ts
import { toWorld } from './snapPoints';
import { curveOutline, twiceArea } from './curves';

type Vec3 = [number, number, number];

/**
 * The silhouette lines of a part's curved surfaces for a view looking along `toward` (ruling Q1), world space, no explode
 * offset: a line along each curve's `through`, the whole way through, at every SMOOTH model outline vertex whose two
 * faces face opposite ways to the view (a face exactly edge-on counts). The MODEL vertex, not the true tangent point: it
 * lies on the body boundary, so drawView's occluders judge it as they judge every other edge. Sharp vertices are
 * curvedEdges' lines already. An outline edge lying on the face rectangle stands in for the part's own face there.
 * Built only through `toWorld` (invariant 44). drawView decides what is hidden.
 */
export function curveSilhouettes(board: Board, toward: readonly number[]): [Vec3, Vec3][] {
  const out: [Vec3, Vec3][] = [];
  for (const c of board.curves) {
    const [u, v] = uvDims(c.through);
    const ui = DIMENSION_ORDER.indexOf(u);
    const vi = DIMENSION_ORDER.indexOf(v);
    const k = DIMENSION_ORDER.indexOf(c.through);
    const W = (x: P2, depth: number): Vec3 => {
      const p: V3 = [0, 0, 0];
      p[ui] = x[0]; p[vi] = x[1]; p[k] = depth;
      return toWorld(board, { length: p[0], width: p[1], thickness: p[2] });
    };
    const o = W([0, 0], 0);
    const axis = (x: P2) => W(x, 0).map((w, i) => w - o[i]!);
    const dot3 = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    const d: P2 = [dot3(axis([1, 0]), toward), dot3(axis([0, 1]), toward)];
    if (Math.hypot(d[0], d[1]) <= 1e-9) continue; // looking down `through`
    const { pts, smooth } = curveOutline(board, c);
    const ccw = twiceArea(pts) > 0;
    const U = board[u];
    const V = board[v];
    const at = (x: number, y: number) => Math.abs(x - y) <= 1e-9;
    const normal = (a: P2, b: P2): P2 => {
      if (at(a[0], 0) && at(b[0], 0)) return [-1, 0];
      if (at(a[0], U) && at(b[0], U)) return [1, 0];
      if (at(a[1], 0) && at(b[1], 0)) return [0, -1];
      if (at(a[1], V) && at(b[1], V)) return [0, 1];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const left: P2 = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l];
      return ccw ? left : [-left[0], -left[1]];
    };
    const m = pts.length;
    pts.forEach((q, i) => {
      if (!smooth[i]) return;
      const n1 = normal(pts[(i - 1 + m) % m]!, q);
      const n2 = normal(q, pts[(i + 1) % m]!);
      if ((n1[0] * d[0] + n1[1] * d[1]) * (n2[0] * d[0] + n2[1] * d[1]) <= 0) out.push([W(q, 0), W(q, board[c.through])]);
    });
  }
  return out;
}
```

Fold the new imports into the file's existing import lines, without duplicates; `Vec3` and `V3` are the same tuple type,
so keep one. In `drawing.ts`, add `curveSilhouettes` to the import and the segment list line given above. Update `drawView`'s
doc comment: "… and the curved surfaces' silhouettes from `curveSilhouettes` (ruling Q1)".

- [ ] **Step 4: Run until they pass**

Run: `npx vitest run src/document/drawing.test.ts src/document/curveDrawing.test.ts src/document/drawingIdentity.test.ts`
Expected: PASS.
- If Front reads 1.5 visible at x = 0: the width-min join was judged visible. Check the normal signs on paper; do not
  edit the expectation.
- If the crown count is off: n = 18 is even, so the crown IS a model vertex; re-derive before editing.

- [ ] **Step 5: Mutate**

Apply each mutation, see a test fail, then restore:
- `<= 0` → `< 0` (the rounded top's end lines vanish: the end face is exactly edge-on, product 0).
- Drop the rectangle cases in `normal` (the Front test fails: the join at (2, 0) becomes a false silhouette at x = 2).
- Emit at every smooth vertex (Front totals fail).
- In the mirror test, use `mirrorPart(b)` with `T` instead of `R` (it must fail, or the test is vacuous for that view).

- [ ] **Step 6: Build, full test, commit**

```bash
git add src/document/curveDrawing.ts src/document/curveDrawing.test.ts src/document/drawing.ts src/document/drawing.test.ts
git commit -m "curves: the Plans sheet draws curved surfaces' silhouettes — a rounded top's ends, an arch's crown (Q1)"
```

---

### Task 4: Part diagrams — waste outlines, sharp-vertex lines and notes (`diagram.ts`, `curveText.ts`)

**Files:**
- Modify: `src/document/curveText.ts` (`curveLineEntries`, `curveLines` mapping it), `src/document/diagram.ts`
- Test: `src/document/curveText.test.ts`, `src/document/diagram.test.ts` (append), `src/document/diagramIdentity.test.ts`
  (create)

**Interfaces:**
- Produces, on `DiagramView`:
  - `curves: { id: string; poly: [number, number][] }[]`;
  - `curveLines: { id: string; along: 'h' | 'v'; at: number }[]` (a line running along `along`, across the whole part, at
    `at` on the other axis, board inches);
  - `curveNotes: { key: string; text: string }[]`.
- Produces `curveLineEntries(board, units): { ids: string[]; text: string }[]`.
- Consumes: `curveOutline(board, c, DRAWING_CURVE_TOLERANCE, DRAWING_CURVE_SEGMENTS_MAX)` and `uvDims`.

**The rule (spec §5.2, Q5, Q6).**
1. **Opening.** After `for (const r of board.holes) ensure(r.face, r.from);` and before the hole circles: each curve
   opens `ensure(c.through, 'min')` when neither `${c.through}|min` nor `${c.through}|max` exists.
2. **Drawing.** After the hole notes, for every view:
   - **Its face is the curve's `through`:** the waste outline at the drawing tolerance (board-local (u, v), which are
     exactly the view's horizontal and vertical), clipped to `[0, h] × [0, v]` by Sutherland–Hodgman (one pass per
     rectangle side), with consecutive repeats dropped. It is pushed when ≥ 3 points remain and `|twiceArea| > 1e-12`.
   - **Its face is one of the curve's in-plane dims F:** for each SHARP model outline vertex q (`!smooth[i]`, model
     tolerance), take the other in-plane dim G:
     - q lies on the viewed face when `from === 'min' ? |q_F| ≤ 1e-9 : |q_F − board[F]| ≤ 1e-9`;
     - it is drawn when, in addition, `1e-9 < q_G < board[G] − 1e-9`;
     - the line runs along `through`: `along = view.horizontal === c.through ? 'h' : 'v'`, at `q_G`.
3. **Notes.** Per view, the entries of `curveLineEntries` with any id drawn in that view (outline or line), in entry
   order. The key is the entry's first id.

- [ ] **Step 1: Pin uncurved diagrams BEFORE touching diagram.ts**

Create `src/document/diagramIdentity.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { createBoard, defaultHingeCup, defaultShelfPinRow } from './document';
import { buildDiagrams } from './diagram';
import { chiralAngled } from './turnFixtures';
import { IMPERIAL } from '../units/length';

/** Parts WITHOUT curves build the diagrams they built before curves chunk 2 (spec §5.2), hashed on master 54ea740 with
 *  the chunk's three new (empty) lists set aside — JSON key order of the rest is unchanged. */
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
const side = createBoard({ id: 'side', length: 30, width: 11.25, thickness: 0.75, cuts: [dado] });
const sidePins = { ...side, holes: [{ id: 'r1', ...defaultShelfPinRow(side)! }] };
const door = createBoard({ id: 'door', length: 24, width: 15, thickness: 0.75, position: [0, 0, 12] });
const doorCup = { ...door, holes: [{ id: 'h1', ...defaultHingeCup(door) }] };
const angled = { ...chiralAngled('upright'), id: 'ang', position: [40, 0, 0] as [number, number, number] };

it('buildDiagrams of parts without curves is unchanged (byte-for-byte)', () => {
  const views = [sidePins, doorCup, angled].map((b) => buildDiagrams(b, IMPERIAL).map((v) => {
    const { curves, curveLines, curveNotes, ...rest } = v as typeof v & { curves?: unknown[]; curveLines?: unknown[]; curveNotes?: unknown[] };
    for (const list of [curves, curveLines, curveNotes]) expect(list ?? []).toEqual([]);
    return rest;
  }));
  expect(sha(views)).toBe('4c787da06364616a4b71a0f3a72c26dd4c7a4b007132f09611be2c8db72f38bc');
});
```

Run it on the unchanged tree: PASS (the three lists are absent today). Commit it alone:
`git commit -m "test(diagram): pin uncurved diagrams before curves chunk 2"`.

- [ ] **Step 2: Write the failing tests**

Append to `src/document/curveText.test.ts`:

```ts
import { curveLineEntries } from './curveText';
it('curveLineEntries: four equal corners are one entry carrying all four ids; curveLines is its texts', () => {
  const b = createBoard({ length: 36, width: 20, thickness: 0.75, curves: defaultCorners({ length: 36, width: 20, thickness: 0.75 }).map((c, i) => ({ id: `c${i}`, ...c })) });
  const e = curveLineEntries(b, IMPERIAL);
  expect(e).toEqual([{ ids: ['c0', 'c1', 'c2', 'c3'], text: 'Round all four corners to a 1" radius' }]);
  expect(curveLines(b, IMPERIAL)).toEqual(e.map((x) => x.text));
});
```

(`defaultCorners` uses radius min(1, min(36, 20)/4) = 1. Fold the imports into the file's existing lines.)

Append to `src/document/diagram.test.ts`:

```ts
import { archCurve, bowCurve, defaultCorners, twiceArea } from './curves';
import { curveLine } from './curveText';

describe('curves on part diagrams (curves spec §5.2; Q5, Q6)', () => {
  // Flat 30 x 5 x 3/4 apron, an arch on the width min side, 3" in from each end, 1-1/2" rise (R = 48.75, sweep 0.49742).
  const arch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 }) };
  const rabbet = (from: 'min' | 'max') => ({ id: `r${from}`, face: 'width' as const, from, across: 'length' as const, offset: 0, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 });
  const apron = (over: Partial<Board> = {}) => createBoard({ length: 30, width: 5, thickness: 0.75, curves: [arch], ...over });

  it('a curve opens its through face\'s min-side view and draws the waste there, at the drawing tolerance', () => {
    const views = buildDiagrams(apron(), IMPERIAL);
    expect(views.map((v) => v.key)).toEqual(['thickness|min']);
    const [c] = views[0]!.curves;
    expect(c!.id).toBe('a');
    // Segment area R^2/2 (theta - sin theta) = 2376.5625/2 * (0.49742 - sin 0.49742) = 23.94..; inscribed chords at
    // 0.001" lose under (2/3) * 0.001 * 24.25 = 0.016.
    const theta = 2 * Math.asin(12 / 48.75);
    const exact = (48.75 ** 2 / 2) * (theta - Math.sin(theta));
    const area = Math.abs(twiceArea(c!.poly)) / 2;
    expect(area).toBeLessThanOrEqual(exact + 1e-9);
    expect(exact - area).toBeLessThan(0.02);
    // 39 fine chords plus the closing line: 40 vertices (curveOutline: one point per segment start and per interior node).
    expect(c!.poly).toHaveLength(40);
  });

  it('a curve that runs off the part draws only inside it (Review Focus 4)', () => {
    const off = { id: 'o', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: -2, span: 10, rise: 1 }) };
    const [v] = buildDiagrams(createBoard({ length: 30, width: 5, thickness: 0.75, curves: [off] }), IMPERIAL);
    const poly = v!.curves[0]!.poly;
    expect(Math.min(...poly.map((p) => p[0]))).toBeCloseTo(0, 12);
    expect(poly.every(([h, w]) => h >= -1e-12 && h <= 30 + 1e-12 && w >= -1e-12 && w <= 5 + 1e-12)).toBe(true);
  });

  it('the arch\'s two ends draw as lines across the thickness on the arched edge\'s view only (Q5)', () => {
    const views = buildDiagrams(apron({ cuts: [rabbet('min'), rabbet('max')] }), IMPERIAL);
    const near = views.find((v) => v.key === 'width|min')!;
    const far = views.find((v) => v.key === 'width|max')!;
    // Width face: horizontal length, vertical thickness; the arch runs through the thickness (vertical).
    expect(near.curveLines).toEqual([{ id: 'a', along: 'v', at: 3 }, { id: 'a', along: 'v', at: 27 }]);
    expect(far.curveLines).toEqual([]);
    expect(near.curveNotes).toEqual([{ key: 'a', text: curveLine(apron(), arch, IMPERIAL) }]);
    expect(far.curveNotes).toEqual([]);
  });

  it('a bow and rounded corners draw no lines (their ends are at the outline, their joins smooth)', () => {
    const bow = { id: 'b', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }) };
    const corners = defaultCorners({ length: 30, width: 5, thickness: 0.75 }).map((c, i) => ({ id: `k${i}`, ...c }));
    const views = buildDiagrams(createBoard({ length: 30, width: 5, thickness: 0.75, curves: [bow, ...corners], cuts: [rabbet('min'), rabbet('max')] }), IMPERIAL);
    expect(views.flatMap((v) => v.curveLines)).toEqual([]);
  });

  it('four corners: one note in the through view, the collapsed line (Q6)', () => {
    const corners = defaultCorners({ length: 36, width: 20, thickness: 0.75 }).map((c, i) => ({ id: `k${i}`, ...c }));
    const [v] = buildDiagrams(createBoard({ length: 36, width: 20, thickness: 0.75, curves: corners }), IMPERIAL);
    expect(v!.curves).toHaveLength(4);
    expect(v!.curveNotes).toEqual([{ key: 'k0', text: 'Round all four corners to a 1" radius' }]);
  });

  it('a hole\'s entry view takes the curve: no second view of the face (Q5, order-independent)', () => {
    const hole = { id: 'h', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 1.5, count: 1, pitch: 0, acrossFrom: 'max' as const, inset: 1 };
    const views = buildDiagrams(apron({ holes: [hole] }), IMPERIAL);
    expect(views.map((v) => v.key)).toEqual(['thickness|max']);
    expect(views[0]!.curves).toHaveLength(1);
  });

  it('both sides of the through face, when both exist, each draw the waste', () => {
    const dado = (from: 'min' | 'max') => ({ id: `d${from}`, face: 'thickness' as const, from, across: 'width' as const, offset: 1, width: 0.5, depth: 0.125, stopMin: 0, stopMax: 0 });
    const views = buildDiagrams(apron({ cuts: [dado('min'), dado('max')] }), IMPERIAL);
    expect(views.filter((v) => v.curves.length === 1).map((v) => v.key)).toEqual(['thickness|min', 'thickness|max']);
  });
});
```

Notes on the derivations, so the numbers are checked rather than trusted:
- `poly` 40: `curveOutline` pushes `s.a` for each segment plus `n − 1` interior points per arc. With n = 39 at the drawing
  tolerance, the arc gives 1 + 38 and the line gives 1: 40 points. Clipping removes none (the arch lies inside).
- In the runs-off test, the arch from length −2 to 8 crosses `length = 0`. Clipping must leave a vertex there.

- [ ] **Step 3: Run them and see them fail**

Run: `npx vitest run src/document/diagram.test.ts src/document/curveText.test.ts`
Expected: FAIL (`curveLineEntries` missing; `curves` undefined).

- [ ] **Step 4: Implement**

**`curveText.ts`.** Rename the body of `curveLines` into `curveLineEntries`. It returns, for each curve not in `skip`, an
entry: `{ ids: [c.id, …the three skipped corners when collapsed], text }`. Record each collapse's four ids in stored order
(`four.map((c) => c.id)`). Then:

```ts
/** Every curve's line as `{ ids, text }` (spec §4.2, ruling Q6): THE ONE home of the collapse; `ids` names every curve the
 *  line covers (four for a collapsed set of corners), so a part diagram can list the lines of the curves it draws. */
export function curveLineEntries(board: Board, units: Units): { ids: string[]; text: string }[] { /* moved body */ }

/** Every curve's line, stored order (spec §4.2). */
export function curveLines(board: Board, units: Units): string[] {
  return curveLineEntries(board, units).map((e) => e.text);
}
```

**`diagram.ts`.**
- Add to `DiagramView`, after `holeNotes`, with doc comments:
  - `curves: DiagramCurve[]`: the waste outlines seen down a curve's `through`, clipped to the face, board inches;
  - `curveLines: DiagramCurveLine[]`: lines across the part at a curve's sharp outline vertices on this face (Q5);
  - `curveNotes: { key: string; text: string }[]`: bench lines of the curves drawn here (inv 19, Q6).
- Export the two interfaces: `DiagramCurve { id: string; poly: [number, number][] }` and
  `DiagramCurveLine { id: string; along: 'h' | 'v'; at: number }`.
- In `ensure`, initialise `curves: [], curveLines: [], curveNotes: []` AFTER `crossings: []`, so the uncurved hash's
  remaining key order is untouched.
- Imports: `curveOutline`, `twiceArea`, `uvDims` from `./curves`; `curveLineEntries` from `./curveText`;
  `DRAWING_CURVE_TOLERANCE`, `DRAWING_CURVE_SEGMENTS_MAX` from `./curveDrawing`.

The waste clip, a module function:

```ts
/** A curve's waste outline at the drawing tolerance, clipped to the face rectangle [0, W] x [0, H] (Sutherland–Hodgman:
 *  a non-convex subject against a convex window), consecutive repeats dropped; null when nothing is left. */
function wasteOnFace(board: Board, c: CurveCut, W: number, H: number): [number, number][] | null {
  let poly: [number, number][] = curveOutline(board, c, DRAWING_CURVE_TOLERANCE, DRAWING_CURVE_SEGMENTS_MAX).pts.map(([x, y]) => [x, y]);
  const sides: ((p: [number, number]) => number)[] = [(p) => p[0], (p) => W - p[0], (p) => p[1], (p) => H - p[1]];
  for (const g of sides) {
    const next: [number, number][] = [];
    for (let i = 0; i < poly.length; i += 1) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      if (g(p) >= 0) next.push(p);
      if ((g(p) >= 0) !== (g(q) >= 0)) {
        const t = g(p) / (g(p) - g(q));
        next.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    poly = next;
    if (poly.length === 0) return null;
  }
  const clean = poly.filter((p, i) => { const q = poly[(i + poly.length - 1) % poly.length]!; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9; });
  return clean.length >= 3 && Math.abs(twiceArea(clean)) > 1e-12 ? clean : null;
}
```

**Opening**, right after `for (const r of board.holes) ensure(r.face, r.from);`:

```ts
  // Curves (curves spec §5.2, ruling Q5): a curve opens its through face's min side when neither side exists — after
  // every hole has opened its entry view, so a hole's view takes the curve instead of a second view appearing.
  for (const c of board.curves) if (!views.has(`${c.through}|min`) && !views.has(`${c.through}|max`)) ensure(c.through, 'min');
```

**Drawing and notes**, right after the hole-notes loop:

```ts
  // Curves drawn (spec §5.2; Q5, Q6): the waste in every view of the through face; a line at each SHARP vertex on the
  // viewed face of another view, never along the outline's own edges; the bench lines of whatever this view draws.
  const curveEntries = curveLineEntries(board, u);
  for (const view of views.values()) {
    const drawn = new Set<string>();
    for (const c of board.curves) {
      if (view.face === c.through) {
        const poly = wasteOnFace(board, c, view.h, view.v);
        if (poly) { view.curves.push({ id: c.id, poly }); drawn.add(c.id); }
        continue;
      }
      const [cu, cv] = uvDims(c.through);
      const F = view.face;
      const G = F === cu ? cv : cu;
      const { pts, smooth } = curveOutline(board, c);
      pts.forEach((q, i) => {
        if (smooth[i]) return;
        const qF = F === cu ? q[0] : q[1];
        const qG = G === cu ? q[0] : q[1];
        const onFace = view.from === 'min' ? Math.abs(qF) <= 1e-9 : Math.abs(qF - board[F]) <= 1e-9;
        if (!onFace || qG <= 1e-9 || qG >= board[G] - 1e-9) return;
        view.curveLines.push({ id: c.id, along: view.horizontal === c.through ? 'h' : 'v', at: qG });
        drawn.add(c.id);
      });
    }
    for (const e of curveEntries) if (e.ids.some((id) => drawn.has(id))) view.curveNotes.push({ key: e.ids[0]!, text: e.text });
  }
```

`u` is `buildDiagrams`' existing `const u = units`. Do not shadow it.

- [ ] **Step 5: Run until they pass**

Run: `npx vitest run src/document/diagram.test.ts src/document/curveText.test.ts src/document/diagramIdentity.test.ts src/document/cutlist.test.ts`
Expected: PASS. Then `npm run build`. Panel tests that build a `DiagramView` by hand fail to compile until they carry the
three lists: add `curves: [], curveLines: [], curveNotes: []` there and nothing else.

- [ ] **Step 6: Mutate**

Apply each mutation, see a test fail, then restore:
- Drop the `onFace` test (the far-view test fails).
- Use `curveOutline(board, c)` (model tolerance) for the waste (the 40-point and area tests fail: 19 points).
- Open curve views BEFORE `ensure` for holes (the hole-entry test fails: two views).
- Skip the clip (the runs-off test fails).
- Make `curveLines` skip the collapse by listing `curveLine` per curve (the four-corner note test fails).

- [ ] **Step 7: Full test, build, commit**

```bash
git add src/document/curveText.ts src/document/curveText.test.ts src/document/diagram.ts src/document/diagram.test.ts src/document/diagramIdentity.test.ts
git commit -m "curves: part diagrams draw the waste, sharp-vertex lines on their face, and each curve's bench line (chunk 2)"
```

(Include any panel test files the build forced you to touch.)

---

### Task 5: `PartDiagram` draws them; CSS on screen and in print

**Files:**
- Modify: `src/panels/PartDiagram.tsx`, `src/styles.css`
- Test: `src/panels/PartDiagram.test.tsx` (append)

**Interfaces:** Consumes Task 4's three lists. Formats nothing (invariant 19).

- [ ] **Step 1: Write the failing tests**

```ts
import { archCurve, defaultCorners } from '../document/curves';

describe('PartDiagram curves (curves spec §5.2)', () => {
  const arch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 }) };
  const rabbet = { id: 'r', face: 'width' as const, from: 'min' as const, across: 'length' as const, offset: 0, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 };
  const views = () => buildDiagrams(createBoard({ length: 30, width: 5, thickness: 0.75, curves: [arch], cuts: [rabbet] }), IMPERIAL);

  it('draws the waste as a hatched polygon, one per curve, and its bench line once as an HTML note', () => {
    const v = views().find((x) => x.key === 'thickness|min')!;
    const { container } = render(<PartDiagram view={v} />);
    const polys = container.querySelectorAll('polygon.cutlist-diagram-curve');
    expect(polys).toHaveLength(1);
    expect(polys[0]!.getAttribute('fill')).toMatch(/^url\(#/);
    expect(polys[0]!.getAttribute('points')!.split(' ')).toHaveLength(v.curves[0]!.poly.length);
    const notes = container.querySelectorAll('p.cutlist-diagram-curve-note');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.textContent).toBe(v.curveNotes[0]!.text);
  });

  it('draws a sharp-vertex line across the part, scaled like the outline', () => {
    const v = views().find((x) => x.key === 'width|min')!;
    const { container } = render(<PartDiagram view={v} />);
    const lines = container.querySelectorAll('line.cutlist-diagram-curve-line');
    expect(lines).toHaveLength(2);
    const outline = container.querySelector('rect.cutlist-diagram-outline')!;
    const x0 = Number(outline.getAttribute('x'));
    const w = Number(outline.getAttribute('width'));
    // along 'v' at h = 3 of 30: x = x0 + 3 * sx, the line spans the outline's full height.
    expect(Number(lines[0]!.getAttribute('x1'))).toBeCloseTo(x0 + (3 / 30) * w, 6);
    expect(Number(lines[0]!.getAttribute('x2'))).toBeCloseTo(Number(lines[0]!.getAttribute('x1')), 9);
    expect(Math.abs(Number(lines[0]!.getAttribute('y2')) - Number(lines[0]!.getAttribute('y1')))).toBeCloseTo(Number(outline.getAttribute('height')), 6);
  });

  it('a vUp view flips the waste polygon\'s v like every other mark', () => {
    const v = views().find((x) => x.key === 'thickness|min')!;
    expect(v.vUp).toBe(true);
    const ys = (view: typeof v) => render(<PartDiagram view={view} />).container.querySelector('polygon.cutlist-diagram-curve')!
      .getAttribute('points')!.split(' ').map((p) => Number(p.split(',')[1]));
    const up = ys(v);
    const down = ys({ ...v, vUp: false });
    // Same figure and scales: flipped y + unflipped y is constant (2 * top + v * sy) across every point.
    const sums = up.map((y, i) => y + down[i]!);
    for (const s of sums) expect(s).toBeCloseTo(sums[0]!, 6);
  });

  it('a part without curves renders no curve elements', () => {
    const { container } = render(<PartDiagram view={view(dado())} />);
    expect(container.querySelectorAll('.cutlist-diagram-curve, .cutlist-diagram-curve-line, .cutlist-diagram-curve-note')).toHaveLength(0);
  });

  it('four corners print one note', () => {
    const corners = defaultCorners({ length: 36, width: 20, thickness: 0.75 }).map((c, i) => ({ id: `k${i}`, ...c }));
    const [v] = buildDiagrams(createBoard({ length: 36, width: 20, thickness: 0.75, curves: corners }), IMPERIAL);
    render(<PartDiagram view={v!} />);
    expect(screen.getAllByText('Round all four corners to a 1" radius')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/panels/PartDiagram.test.tsx`. Expected: FAIL (no curve elements).

- [ ] **Step 3: Implement**

In `PartDiagram.tsx`:
- After the `view.angles` polygons, draw the waste polygons, in the same form as the angle wedges:

```tsx
        {view.curves.map((c) => (
          <polygon
            key={c.id}
            className="cutlist-diagram-curve"
            points={c.poly.map(([h, v]) => {
              const x = left + fit.offsetX + h * fit.sx;
              const y = top + (view.vUp ? view.v - v : v) * fit.sy;
              return `${x},${y}`;
            }).join(' ')}
            fill={`url(#${hatch})`}
          />
        ))}

        {view.curveLines.map((l, i) => {
          const X = (h: number) => left + fit.offsetX + h * fit.sx;
          const Y = (v: number) => top + (view.vUp ? view.v - v : v) * fit.sy;
          const [x1, y1, x2, y2] = l.along === 'v' ? [X(l.at), Y(0), X(l.at), Y(view.v)] : [X(0), Y(l.at), X(view.h), Y(l.at)];
          return <line key={`${l.id}:${i}`} className="cutlist-diagram-curve-line" x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
```

- After the hole notes:

```tsx
      {view.curveNotes.map((n) => (
        <p className="cutlist-diagram-curve-note" key={n.key}>{n.text}</p>
      ))}
```

In `styles.css`:
- Beside `.cutlist-diagram-angle`, add:

```css
.cutlist-diagram-curve {
  stroke: currentColor;
  stroke-width: 1;
}

.cutlist-diagram-curve-line {
  stroke: currentColor;
  stroke-width: 1;
}
```

- Add `.cutlist-diagram-curve-note` to the screen rule listing `.cutlist-diagram-angle-note, .cutlist-diagram-hole-note`
  (~line 1191).
- Add it to the PRINT enumerated `color: #000` list (~line 1373). Without it the note prints grey (fu 58's defect).

- [ ] **Step 4: Run until they pass**, then `npm run build` and the full `npm test`.

- [ ] **Step 5: Mutate**

Apply each mutation, see a test fail, then restore:
- Drop the `vUp` flip in the polygon (the flip test fails).
- Swap `along` branches (the line test fails).
- Remove the notes map (the note tests fail).
- For CSS: confirm by `grep -n "cutlist-diagram-curve-note" src/styles.css` that it appears in BOTH lists.

- [ ] **Step 6: Commit**

```bash
git add src/panels/PartDiagram.tsx src/panels/PartDiagram.test.tsx src/styles.css
git commit -m "curves: PartDiagram draws the waste, sharp-vertex lines and curve notes; notes print black"
```

---

### Task 6: Live check and records

**Files:**
- Create: `docs/browser-verification-curves.md` gains a `## Chunk 2` section; screenshots go in `docs/img/curves2-*.png`.
- Modify: `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md`, `docs/feature-gaps.md`, and the spec (the rulings marked).

- [ ] **Step 1: Live check on the dev server**

Start the server with `npm run dev -- --port 5181 --strictPort`. Use the Playwright MCP only. The origin's localStorage is
the user's profile: never `localStorage.clear()`. Delete only what the check creates, and stop the server with
`fuser -k 5181/tcp`.

In a NEW project (deleted afterwards), build three parts:
- an on-edge 30 × 5 apron with an Arch;
- a 36 × 20 top with Rounded corners;
- a 30 × 12 part with a Bow and a dado.

Then check:
1. **Plans sheet.**
   - The arch reads smooth at print zoom.
   - The rounded top's Front and Side elevations close at both ends.
   - The Side view shows the arch's crown dashed.
   - Hidden arcs dash continuously.
   - Take a screenshot of each.
   - Toggle Explode and confirm 0 console errors.
2. **Cut list, Diagrams: All parts.**
   - The apron's thickness view shows the hatched arch and its note.
   - The top's view shows four hatched corners and ONE note.
   - Add a rabbet on the apron's arched edge: that edge's view shows two lines at the arch ends.
   - Print preview (`emulateMedia print`): the notes are black.
3. **Metric project:** the curve notes read mm (bench lines already do). Take one screenshot.

Record what software GL cannot confirm (fu 26a): the line weight of 96-chord arcs on a real print, and the user's Brave
print (with fu 254/345/357).

- [ ] **Step 2: Records**
- **The spec.** Mark §5.1 and §5.2 with `*Amended (implementation, chunk 2)*` notes for Q1–Q6, each in one or two
  sentences, as chunk 1's amendments are.
- **`CLAUDE.md`.**
  - Status: chunk 2 on its branch, not merged.
  - Rounds table: one row.
  - Where things live: `curveDrawing.ts`.
  - Invariant 47: drawings take edges through `curveDrawEdges` on a curved part, visibility on the model chord, edge-on
    unrefined, plus `curveSilhouettes`.
  - Invariant 53: chunk 2's drawing constants and the diagram rules.
  - Invariant 19: curve notes.
  - The test count.
- **`docs/follow-ups.md`.**
  - Close 361.
  - File new residue: the edge-on fold (Q3); a silhouette crossing another cut's air drawn anyway; a split chord's end
    up to 0.005" off the arc (Q4, record-only); the drawView timing measured in Task 2.
  - Next number after 373.
- **`docs/history.md`:** the round's narrative.
- **`docs/feature-gaps.md`:** curves' status.

Commit: `docs: curves chunk 2 — live check and records`.

- [ ] **Step 3: Hand back**

Do not merge or deploy. Report:
- the branch head and the test count;
- the Task 2 timing against the baseline;
- what the live check could and could not confirm;
- the rulings Q1–Q6 for the user's review.
