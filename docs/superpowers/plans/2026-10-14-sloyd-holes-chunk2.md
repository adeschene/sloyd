# Holes, chunk 2 (drawings and the Hinge cup) — Implementation Plan

**Status:** implemented on branch `holes-2`, merged 2026-10-14 as `d74e5c5`, deployed 2026-10-14 as `index-DFCdm3n1.js`
(no schema change). The record is `docs/history.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Holes show on the printed drawings: the Plans sheet draws each hole's rims and its dashed depth lines through
the existing hidden-line pass, the cut list's part diagrams draw hole circles (with centre marks) and dashed depth
outlines with each row's bench line as a note, and Properties offers a **Hinge cup** preset.

**Architecture:** No schema change, no new geometry kind. A new `holeDrawing.ts` turns a part's hole instances
(`partGeometry(b).holes`, chunk 1) into world-space segments — rims as 96-gons, plus the two wall silhouettes for the view
direction — built only through `toWorld` (inv 44). `drawView` treats them exactly like `boardEdges`' edges: same
occluders (the hole-free bodies, inv 47), same visible/hidden split. `buildDiagrams` gains per-view hole circles, side
outlines and notes in board inches; `PartDiagram` draws them, scaling as it scales everything else.

**Tech Stack:** TypeScript, React, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-10-14-sloyd-holes-design.md` §3.4, §4.3, §7 (Hinge cup), §9 chunk 2; chunk 1's
plan `docs/superpowers/plans/2026-10-14-sloyd-holes-chunk1.md` and CLAUDE.md invariant 50 for what exists. One planning
amendment (§4.3, below) needs the user's approval with the plan (approved 2026-10-14).

### Planning amendment — §4.3's row label (approved by the user 2026-10-14)

The spec has each row "labelled once (`21 × Ø1/4" × 3/8"`) … measured as today". Two facts make that a poor fit:
1. Part diagrams are **schematic with unequal horizontal and vertical scales** ("Schematic — not to scale"), so a label
   placed beside one hole of a row must be laid out against every other label in the figure (`packRow`/columns) — new
   collision logic for a short string that adds nothing the bench line lacks.
2. `Ø` is non-ASCII: invariant 19 requires a non-ASCII glyph to be **measured in a browser** before a measured label is
   trusted.

Angle cuts already solved the same problem: their wedge is drawn in the SVG and their **bench line is an HTML note under
the figure** (`cutlist-diagram-angle-note`), never a measured SVG label. **Amended:** a hole row's note under the figure
is its bench line (`holeLine`, the one home of the words, inv 19) — e.g. `Row of 21 holes 1/4" dia × 3/8" deep in the
thickness face (max side), …` — once per row per view. No `Ø`, no measuring. Circles and outlines carry no text.

## Global Constraints

- Work on a local branch `holes-2`; merge with `git merge --no-ff` into `master`, verify the merged tree, delete the
  branch. **No pull requests.** Deploying is the user's decision.
- **No schema change** (stays 16): rolling back to chunk 1 (`2ded5cc`/`index-CTpNZw9F.js`) costs nothing but the round.
- `DRAWING_HOLE_SEGMENTS = 96` (drawings only; never in the viewport, which keeps `HOLE_SEGMENTS = 48`).
- Every part↔world crossing goes through `toWorld` (inv 44) — no hand-written turn or `board[dim] - u` anywhere.
- **Occluders stay the hole-free bodies** (spec §3.4, inv 47): you cannot see through a through-hole on the sheet; what
  lies below a hole's mouth draws hidden. Pinned by a test.
- **A part with no holes draws exactly what it drew before** — Plans sheet and part diagrams, byte for byte.
- Strings shown on a drawing come from `holeText.ts` (inv 19); none is assembled in a component.
- `styles.css` rules read surface roles (`--ink`, `--ink-faint`, …), never raw `--grey-*`/`--walnut-*`.
- `npm test` does not typecheck — run `npm run build` before claiming a task compiles; full `npm test` after any task.
- Mutate every plan-supplied test (break the code, see it fail, restore by hand — never `git checkout` over uncommitted
  work). Plan-supplied numbers are hypotheses: derive a failing one by hand before changing anything; report changes.

## Review Focus

1. **A through-bore seen from above on the Plans sheet** must not show its exit rim as visible (occluders are hole-free:
   it is hidden, dashed in the elevation, absent in the exploded view). Pinned in Task 1.
2. **A holed part inside a mirrored or turned assembly** on the sheet: rims and depth lines land where the 3D view puts
   the holes (through `toWorld`, after the one composition). Pinned in Task 1 (chiral fixture under a mirror and turns).
3. **The exploded view** (offsets per part): hole segments move with their part, and no hidden line is drawn there.
   Pinned in Task 1.
4. **A part with holes but no cuts** gets its entry-face diagram (not the default thickness-min view when the holes are
   on the max side), and a hole on an END (length face) opens a length view. Pinned in Task 2.
5. **A faulted row** (holes run past the part's end after a resize): the diagram draws only what lies within the
   outline's span the way it draws every hole — circles are not clipped, but the note carries the `— check:` suffix the
   bench line already has. Pinned in Tasks 2 and 3 (the note equals `holeLine`).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/document/holeDrawing.ts` (create) | `DRAWING_HOLE_SEGMENTS`, `holeDrawingSegments(b, toward)`: world-space rim and silhouette segments for one part |
| `src/document/drawing.ts` (modify) | `drawView` feeds hole segments through the same hidden-line pass |
| `src/document/diagram.ts` (modify) | `DiagramHole`, `DiagramHoleSide`; `DiagramView.holes`, `.holeSides`, `.holeNotes` |
| `src/panels/PartDiagram.tsx` (modify) | draws circles + centre marks, dashed side outlines, notes |
| `src/styles.css` (modify) | `.cutlist-diagram-hole`, `.cutlist-diagram-hole-side`, `.cutlist-diagram-hole-note` |
| `src/document/holes.ts` (modify) | `defaultHingeCup` |
| `src/panels/Holes.tsx` (modify) | the Hinge cup menu item |
| `src/document/document.ts` (modify) | barrel exports |
| `docs/browser-verification-holes.md` (modify) | a "Chunk 2" section |

---

### Task 1: Holes on the Plans sheet

**Files:**
- Create: `src/document/holeDrawing.ts`, `src/document/holeDrawing.test.ts`
- Modify: `src/document/drawing.ts` (`drawView`), `src/document/document.ts` (barrel)
- Test: `src/document/drawing.test.ts`

**Interfaces:**
- Consumes: `partGeometry(b).holes: readonly Hole[]` (chunk 1; `Hole` = `{ row, index, axis, dir, centre, radius, depth,
  through }`, board-local `[length, width, thickness]`); `holeRing(h, t, n)` (holes.ts; `n` ≠ 48 bypasses the memo);
  `toWorld(board, Point)` (snapPoints.ts); `DIMENSION_ORDER` (geometry.ts).
- Produces: `DRAWING_HOLE_SEGMENTS = 96`; `holeDrawingSegments(b: Board, toward: readonly number[]): [Vec3, Vec3][]` —
  world-space, no offset applied.

- [ ] **Step 0: Branch** — `git checkout -b holes-2`

- [ ] **Step 1: Write the failing tests**

`src/document/holeDrawing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { DRAWING_HOLE_SEGMENTS, holeDrawingSegments } from './holeDrawing';
import type { HoleRow } from './types';

// Flat at turn 0: length on X, thickness on Y (up), width on Z (drawing.test.ts' convention).
const pin: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 2 };
const side = (holes: HoleRow[]) => createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75, holes });

describe('holeDrawingSegments (spec §3.4)', () => {
  it('a part without holes has none', () => {
    expect(holeDrawingSegments(side([]), [0, 0, 1])).toEqual([]);
  });
  it('looking down the axis: the entry and bottom rims only (no silhouettes)', () => {
    const segs = holeDrawingSegments(side([pin]), [0, 1, 0]);
    expect(segs).toHaveLength(2 * DRAWING_HOLE_SEGMENTS);
    const ys = new Set(segs.flatMap(([a, b]) => [a[1], b[1]]).map((y) => y.toFixed(9)));
    expect([...ys].sort()).toEqual(['0.375000000', '0.750000000']);
  });
  it('looking across the axis (front, +Z): two silhouettes at x = 5 ± 1/8 from the mouth to the bottom', () => {
    const segs = holeDrawingSegments(side([pin]), [0, 0, 1]);
    expect(segs).toHaveLength(2 * DRAWING_HOLE_SEGMENTS + 2);
    const sil = segs.slice(2 * DRAWING_HOLE_SEGMENTS);
    const xs = sil.map(([a]) => a[0]).sort((p, q) => p - q);
    expect(xs[0]).toBeCloseTo(4.875, 12);
    expect(xs[1]).toBeCloseTo(5.125, 12);
    for (const [a, b] of sil) {
      expect(a[0]).toBeCloseTo(b[0], 12);                 // vertical
      expect([a[1], b[1]].sort((p, q) => p - q)).toEqual([0.375, 0.75]);
      expect(a[2]).toBeCloseTo(2, 12);                    // on the axis' plane through the centre, z = inset
    }
  });
  it('a through hole runs the whole thickness', () => {
    const segs = holeDrawingSegments(side([{ ...pin, depth: 'through' }]), [0, 0, 1]);
    const sil = segs.slice(2 * DRAWING_HOLE_SEGMENTS);
    for (const [a, b] of sil) expect([a[1], b[1]].sort((p, q) => p - q)).toEqual([0, 0.75]);
  });
});
```

Append to `src/document/drawing.test.ts` (it has `box`, `horizontalAt`, `verticalAt`, `total`, `FRONT`, `TOP`, `ISO`):

```ts
describe('holes on the sheet (holes spec §3.4)', () => {
  // (add `HoleRow` to the file's `import type { Board } from './types'`)
  const pin: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 2 };
  const holed = (extra: Partial<HoleRow> = {}) => box('s', 30, 11.25, 0.75, [0, 0, 0], { holes: [{ ...pin, ...extra }] });
  const near = (p: readonly number[], q: readonly number[]) => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!) < 1e-9;

  it('a part without holes draws exactly what it drew before', () => {
    const plain = box('s', 30, 11.25, 0.75);
    for (const v of [FRONT, TOP, ISO]) expect(drawView([plain], v)).toEqual(drawView([{ ...plain, holes: [] }], v));
  });
  it('front elevation: the depth lines are hidden (dashed), at x = 5 ± 1/8, down to y = 3/8; the bottom line too', () => {
    const d = drawView([holed()], FRONT);
    for (const x of [4.875, 5.125]) {
      const v = d.hidden.filter((s) => Math.abs(s.a[0] - x) < 1e-9 && Math.abs(s.b[0] - x) < 1e-9);
      expect(v.reduce((n, s) => n + Math.abs(s.b[1] - s.a[1]), 0)).toBeCloseTo(0.375, 9);
    }
    const bottom = horizontalAt(d.hidden, 0.375).filter((s) => Math.min(s.a[0], s.b[0]) > 4.8 && Math.max(s.a[0], s.b[0]) < 5.2);
    expect(bottom.length).toBeGreaterThan(0);
    // No hole line is visible in the elevation except where the rim lies on the top edge line (y = 3/4).
    expect(d.visible.filter((s) => Math.min(s.a[0], s.b[0]) > 4.8 && Math.max(s.a[0], s.b[0]) < 5.2 && Math.abs(s.a[1] - 0.75) > 1e-9)).toEqual([]);
  });
  it('plan: the entry rim is visible; a blind bottom rim is hidden beneath it', () => {
    const d = drawView([holed()], TOP);
    const inRim = (s: { a: readonly number[]; b: readonly number[] }) => Math.hypot(s.a[0] - 5, s.a[1] + 2) < 0.13;
    expect(d.visible.filter(inRim).length).toBeGreaterThan(0);
    expect(d.hidden.filter(inRim).length).toBeGreaterThan(0);
  });
  it('occluders stay hole-free: a through-bore\'s exit rim is hidden from above (Review Focus 1)', () => {
    const d = drawView([holed({ depth: 'through' })], TOP);
    // TOP: right = +X, up = -Z, so the hole at (x 5, z 2) draws around (5, -2). Every rim segment there is either
    // the entry rim (visible) or the exit rim (hidden): the exit rim never appears visible a second time.
    const around = (s: { a: readonly number[] }) => Math.hypot(s.a[0] - 5, s.a[1] + 2) < 0.13;
    const vis = d.visible.filter(around);
    const hid = d.hidden.filter(around);
    expect(hid.length).toBeGreaterThan(0);
    // Each visible rim segment is matched by a hidden one at the same place (the exit rim beneath it), not the reverse.
    expect(vis.every((s) => hid.some((h) => near(h.a, s.a) && near(h.b, s.b)))).toBe(true);
  });
  it('exploded: the hole segments move with their part and the sheet draws them (Review Focus 3)', () => {
    const offsets = new Map([['s', [0, 10, 0] as [number, number, number]]]);
    const d0 = drawView([holed()], ISO);
    const d1 = drawView([holed()], ISO, offsets);
    expect(d1.visible.length).toBe(d0.visible.length);
    const dy = ISO.up[1]! * 10;
    d0.visible.forEach((s, i) => expect(d1.visible[i]!.a[1]).toBeCloseTo(s.a[1] + dy, 9));
  });
});
```

Append to `src/document/holeDrawing.test.ts` (Review Focus 2 — through the one composition, every pose and a mirror):

```ts
import { chiralHoled, sameSet } from './turnFixtures';
import { mirrorPart } from './frames';

const POSTURES = ['flat', 'on-edge', 'upright'] as const;
const TURNS = [0, 90, 180, 270] as const;
const ends = (segs: [number[], number[]][]) => segs.flatMap(([a, b]) => [[...a], [...b]]);
// Both view directions are unchanged by x → -x, so the mirrored part's lines must be the reflection of the part's.
const VIEWS = [[0, 1, 0], [0, 0, 1]];

describe('hole lines through mirrors and turns (Review Focus 2)', () => {
  it.each(POSTURES.flatMap((posture) => TURNS.map((rotation) => ({ posture, rotation }))))(
    '%o: mirrorPart\'s hole lines are the reflection across x = 0',
    ({ posture, rotation }) => {
      const b = { ...chiralHoled(posture), rotation, position: [2, 1, -3] as [number, number, number] };
      for (const T of VIEWS) {
        const reflected = ends(holeDrawingSegments(b, T)).map(([x, y, z]) => [0 - x!, y!, z!]);
        expect(sameSet(ends(holeDrawingSegments(mirrorPart(b), T)), reflected)).toBe(true);
      }
    },
  );
  it('the fixture is chiral: rows left unmirrored would differ', () => {
    const b = chiralHoled('flat');
    const reflected = ends(holeDrawingSegments(b, [0, 0, 1])).map(([x, y, z]) => [0 - x!, y!, z!]);
    expect(sameSet(ends(holeDrawingSegments({ ...mirrorPart(b), holes: b.holes }, [0, 0, 1])), reflected)).toBe(false);
  });
});
```

(Mutate: make `holeDrawingSegments` ignore `h.dir` — always toward +axis — and see the mirror cases fail.)

- [ ] **Step 2: Run them to see them fail** — `npx vitest run src/document/holeDrawing.test.ts src/document/drawing.test.ts`

- [ ] **Step 3: Implement `holeDrawing.ts`**

```ts
import type { Board } from './types';
import type { V3 } from './angleCuts';
import { DIMENSION_ORDER } from './geometry';
import { partGeometry } from './bodies';
import { holeRing } from './holes';
import { toWorld } from './snapPoints';

type Vec3 = [number, number, number];

/** The polygon a hole's rim is DRAWN as on the sheet (print scale; spec §3.4). The viewport keeps HOLE_SEGMENTS (48). */
export const DRAWING_HOLE_SEGMENTS = 96;

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/**
 * One part's hole lines for a view looking along `toward` (from the model to the viewer), in world space, no explode
 * offset (spec §3.4): every hole's entry rim and far rim (a through hole's exit, a blind hole's bottom) as
 * DRAWING_HOLE_SEGMENTS-gons, and — unless the view looks down the axis — the wall's two silhouette generators, the
 * lines where the cylinder's surface turns away from the viewer. Built only from `toWorld` of board-local points
 * (invariant 44): the radial directions U, V and the axis A are differences of mapped points, so every turn, posture and
 * mirror is the one composition's. The silhouette's radial r = (V·T)·U − (U·T)·V, scaled to the radius, is the one
 * direction in the disc plane perpendicular to T. drawView decides what is hidden; this module decides nothing about it.
 */
export function holeDrawingSegments(b: Board, toward: readonly number[]): [Vec3, Vec3][] {
  const P = (p: V3): Vec3 => toWorld(b, { length: p[0], width: p[1], thickness: p[2] }) as Vec3;
  const out: [Vec3, Vec3][] = [];
  for (const h of partGeometry(b).holes) {
    for (const t of [0, h.depth]) {
      const ring = holeRing(h, t, DRAWING_HOLE_SEGMENTS).map(P);
      for (let i = 0; i < ring.length; i += 1) out.push([ring[i]!, ring[(i + 1) % ring.length]!]);
    }
  }
  for (const h of partGeometry(b).holes) {
    const a = DIMENSION_ORDER.indexOf(h.axis);
    const [u, v] = [0, 1, 2].filter((i) => i !== a) as [number, number];
    const at = (du: number, dv: number, t: number): Vec3 => {
      const p: V3 = [h.centre[0], h.centre[1], h.centre[2]];
      p[u] += du; p[v] += dv; p[a] += h.dir * t;
      return P(p);
    };
    const C = at(0, 0, 0);
    const U = at(h.radius, 0, 0).map((x, i) => x - C[i]!);
    const V = at(0, h.radius, 0).map((x, i) => x - C[i]!);
    const A = at(0, 0, h.depth).map((x, i) => x - C[i]!);
    const tu = dot(U, toward);
    const tv = dot(V, toward);
    const n = Math.hypot(tu, tv);
    if (n <= 1e-9 * h.radius) continue; // looking down the axis: the rim covers the wall
    const r = [0, 1, 2].map((i) => (tv * U[i]! - tu * V[i]!) / n);
    for (const s of [1, -1]) {
      const p0: Vec3 = [C[0] + s * r[0]!, C[1] + s * r[1]!, C[2] + s * r[2]!];
      out.push([p0, [p0[0] + A[0]!, p0[1] + A[1]!, p0[2] + A[2]!]]);
    }
  }
  return out;
}
```

(The rims are pushed first and the silhouettes after, so the test's `slice(2 * DRAWING_HOLE_SEGMENTS)` picks out the
silhouettes for a single hole. If `snapPoints.ts` → `bodies.ts` makes an import cycle with `drawing.ts`, check how
`drawing.ts` already imports `toWorld` and `partGeometry` and do the same.)

- [ ] **Step 4: Feed them through `drawView`** — in `drawing.ts`, replace the edge loop's source so each part's segments
  are its board edges followed by its hole segments, both in world space, then offset:

```ts
  for (const b of parts) {
    const off = offsets?.get(b.id);
    // Board edges (invariant 16) and hole lines (holes spec §3.4): one list, one hidden-line pass, the same occluders —
    // the hole-free bodies, so a through-bore's far rim seen down its axis is hidden (spec §3.4, pinned by test).
    const segments: [Vec3, Vec3][] = [
      ...partGeometry(b).edges.map(([p, q]) => [toWorld(b, p), toWorld(b, q)] as [Vec3, Vec3]),
      ...holeDrawingSegments(b, view.toward),
    ];
    for (const [P0, Q0] of segments) {
      const A = plus(P0, off);
      const E = plus(Q0, off);
      // … the existing body of the loop, unchanged, from `const pa = proj(A);` on …
    }
  }
```

  and update `drawView`'s doc comment: "Edges from `boardEdges` (invariant 16) and hole lines from `holeDrawingSegments`".
  A part without holes adds an empty list, so its output is unchanged (the first new test pins it).

- [ ] **Step 5: Barrel** — export `DRAWING_HOLE_SEGMENTS`, `holeDrawingSegments` from `document.ts`.

- [ ] **Step 6: Run, full suite, build; measure** — `npx vitest run src/document/holeDrawing.test.ts
  src/document/drawing.test.ts`, then `npm test`, `npm run build`. Then, in a throwaway test file (deleted afterwards),
  time `drawView` for a cabinet side with two 21-pin rows plus three plain parts around it, in FRONT, TOP and ISO; report
  the numbers in the report (the sheet draws once, not per frame; over ~300 ms per view, say so as a concern — do not
  optimise unmeasured).

- [ ] **Step 7: Mutate** — drop the silhouettes (front test fails); swap `toward`'s sign (still passes? if so, note
  that silhouettes are symmetric in T — expected); make occluders see holes by skipping the through hole's exit rim
  (occlusion test fails); add the holes only when `holes.length > 1` (the no-holes equality test still passes, the
  others fail). Restore by hand.

- [ ] **Step 8: Commit** — `holes chunk 2: rims and depth lines on the Plans sheet` + Co-Authored-By trailer.

---

### Task 2: Holes in the part diagrams (data)

**Files:**
- Modify: `src/document/diagram.ts`, `src/document/document.ts` (types to barrel)
- Test: `src/document/diagram.test.ts`

**Interfaces:**
- Consumes: `holeInstances(board, row)` (holes.ts), `holeLine(board, row, precision)` (holeText.ts).
- Produces:
  ```ts
  /** A hole seen down its axis (spec §4.3): a circle, board inches, in the view's (h, v). */
  export interface DiagramHole { row: string; index: number; h: number; v: number; r: number }
  /** A hole seen across its axis: the box of its depth, drawn dashed (the two walls and, when blind, the bottom). */
  export interface DiagramHoleSide {
    row: string; index: number; h: Span; v: Span;
    /** Which in-plane axis the hole's depth runs along: its two walls are lines along it. */
    axis: 'h' | 'v';
    /** Where the bottom line is drawn (blind holes only); null for a through hole. */
    bottomAt: 'hmin' | 'hmax' | 'vmin' | 'vmax' | null;
  }
  DiagramView.holes: DiagramHole[]; DiagramView.holeSides: DiagramHoleSide[]; DiagramView.holeNotes: string[]
  ```

- [ ] **Step 1: Write the failing tests** (append to `diagram.test.ts`; it imports `buildDiagrams`, `createBoard`)

```ts
describe('holes in the part diagrams (holes spec §4.3, amended)', () => {
  const pins = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
  const side = (over: Record<string, unknown> = {}) => createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75, holes: [pins], ...over });

  it('a part without holes draws exactly what it drew before', () => {
    const plain = createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75 });
    expect(buildDiagrams({ ...plain, holes: [] }, 16)).toEqual(buildDiagrams(plain, 16));
    expect(buildDiagrams(plain, 16)[0]!.holes).toEqual([]);
  });
  it('a holed part with no cuts opens its ENTRY face view, with one circle per hole (Review Focus 4)', () => {
    const views = buildDiagrams(side(), 16);
    expect(views.map((v) => v.key)).toEqual(['thickness|max']);
    const v = views[0]!;
    expect(v.horizontal).toBe('length');
    expect(v.holes).toEqual([
      { row: 'h1', index: 0, h: 2, v: 1.5, r: 0.125 },
      { row: 'h1', index: 1, h: 3.25, v: 1.5, r: 0.125 },
      { row: 'h1', index: 2, h: 4.5, v: 1.5, r: 0.125 },
    ]);
    expect(v.holeNotes).toEqual([expect.stringMatching(/^Row of 3 holes 1\/4" dia × 3\/8" deep/)]);
  });
  it('a hole into an end opens the length view', () => {
    const dowel = { ...pins, id: 'd', face: 'length' as const, from: 'max' as const, diameter: 0.375, depth: 1, along: 'width' as const, station: 2, count: 1, acrossFrom: 'min' as const, inset: 0.375 };
    const views = buildDiagrams(side({ holes: [dowel] }), 16);
    expect(views.map((v) => v.key)).toEqual(['length|max']);
    expect(views[0]!.holes).toHaveLength(1);
  });
  it('a view across the axis that exists for another reason shows the depth outline (dashed), not a circle', () => {
    // A rabbet on the width face opens 'width|min'; the pins (along thickness) are seen across their axis there.
    const rabbet = { id: 'c1', face: 'width' as const, from: 'min' as const, across: 'length' as const, offset: 0, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 };
    const views = buildDiagrams(side({ cuts: [rabbet] }), 16);
    const w = views.find((v) => v.key === 'width|min')!;
    expect(w.holes).toEqual([]);
    expect(w.holeSides).toHaveLength(3);
    // width view: h = length, v = thickness. Hole 1 at length 2 ± 1/8, from the max face (0.75) down 3/8.
    expect(w.holeSides[0]).toMatchObject({ row: 'h1', index: 0, h: [1.875, 2.125], v: [0.375, 0.75], axis: 'v', bottomAt: 'vmin' });
    expect(w.holeNotes).toHaveLength(1);
  });
  it('a through hole shows its circle on the far side only when that view exists, and has no bottom', () => {
    const thru = { ...pins, depth: 'through' as const, count: 1 };
    const dado = { id: 'c1', face: 'thickness' as const, from: 'min' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const views = buildDiagrams(side({ holes: [thru], cuts: [dado] }), 16);
    expect(views.find((v) => v.key === 'thickness|min')!.holes).toHaveLength(1);
    expect(views.find((v) => v.key === 'thickness|max')!.holes).toHaveLength(1);
  });
  it('a faulted row\'s note is its bench line, check suffix included (Review Focus 5)', () => {
    const short = side({ length: 4 });
    const v = buildDiagrams(short, 16)[0]!;
    expect(v.holeNotes[0]).toMatch(/— check: hole 3 runs past the length max end$/);
  });
});
```

- [ ] **Step 2: Run to see them fail.**

- [ ] **Step 3: Implement** — in `diagram.ts`:
  - The two interfaces above (with doc comments), and `holes: [], holeSides: [], holeNotes: []` in `ensure`'s new view.
  - After the angle-cut loop and BEFORE `if (views.size === 0) ensure('thickness', 'min')`:

```ts
  // Holes (holes spec §4.3, amended). Down the axis: a circle in the ENTRY face's view (opened, like a cut's), and on the
  // exit side of a through hole only when that view already exists. Across the axis: the depth box, only in views that
  // exist for another reason (a hole opens no view of its own across its axis). The note is the row's bench line (inv 19).
  const noted = new Map<DiagramView, Set<string>>();
  const note = (view: DiagramView, r: HoleRow) => {
    if (!noted.has(view)) noted.set(view, new Set());
    if (noted.get(view)!.has(r.id)) return;
    noted.get(view)!.add(r.id);
    view.holeNotes.push(holeLine(board, r, precision));
  };
  for (const r of board.holes) for (const h of holeInstances(board, r)) {
    const entry = ensure(r.face, r.from);
    const exit = h.through ? views.get(`${r.face}|${r.from === 'min' ? 'max' : 'min'}`) : undefined;
    for (const view of [entry, exit]) {
      if (!view) continue;
      const hi = DIMENSION_ORDER.indexOf(view.horizontal);
      const vi = DIMENSION_ORDER.indexOf(view.vertical);
      view.holes.push({ row: r.id, index: h.index, h: h.centre[hi]!, v: h.centre[vi]!, r: h.radius });
      note(view, r);
    }
  }
  for (const r of board.holes) for (const h of holeInstances(board, r)) {
    for (const view of views.values()) {
      if (view.face === r.face) continue;
      const a = DIMENSION_ORDER.indexOf(r.face);
      const s0 = h.centre[a]!;
      const s1 = s0 + h.dir * h.depth;
      const axial: Span = [Math.min(s0, s1), Math.max(s0, s1)];
      const spanOf = (d: Dimension): Span => {
        if (d === r.face) return axial;
        const i = DIMENSION_ORDER.indexOf(d);
        return [h.centre[i]! - h.radius, h.centre[i]! + h.radius];
      };
      const axisIsH = view.horizontal === r.face;
      const bottomAt = h.through ? null : axisIsH ? (h.dir > 0 ? 'hmax' : 'hmin') : (h.dir > 0 ? 'vmax' : 'vmin');
      view.holeSides.push({ row: r.id, index: h.index, h: spanOf(view.horizontal), v: spanOf(view.vertical), axis: axisIsH ? 'h' : 'v', bottomAt });
      note(view, r);
    }
  }
```

  (Import `holeInstances`, `HoleRow`, `holeLine`. A view across the axis whose plane does not contain the axis cannot
  occur: a view's two in-plane dimensions are the two that are not its face, and the hole's axis is not the view's
  face, so it is one of them.)

- [ ] **Step 4: Run, full suite, build.** Existing diagram tests (and every `toEqual` on a whole `DiagramView`) must pass
  — if a whole-view `toEqual` in an existing test now fails only because of the three new empty arrays, add them to its
  expectation and report it.

- [ ] **Step 5: Mutate** — open the exit view for a through hole when it doesn't exist (the far-side test fails);
  put the note per hole instead of per row (`holeNotes` length test fails); `bottomAt` sign flipped (the across test
  fails). Restore by hand.

- [ ] **Step 6: Commit** — `holes chunk 2: holes in the part-diagram data` + trailer.

---

### Task 3: Draw holes in the part diagrams

**Files:**
- Modify: `src/panels/PartDiagram.tsx`, `src/styles.css`
- Test: `src/panels/PartDiagram.test.tsx`

**Interfaces:**
- Consumes: `DiagramView.holes`, `.holeSides`, `.holeNotes` (Task 2); the panel's existing `left`, `top`, `fit.offsetX`,
  `fit.sx`, `fit.sy`, `view.vUp` mapping (exactly as the angle polygons use it).

- [ ] **Step 1: Write the failing tests** (append to `PartDiagram.test.tsx`)

```tsx
describe('PartDiagram holes (holes spec §4.3, amended)', () => {
  const pins = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
  const holedView = (over: Record<string, unknown> = {}) =>
    buildDiagrams(createBoard({ length: 30, width: 11.25, thickness: 0.75, holes: [pins], ...over }), 16)[0]!;

  it('draws one ellipse and one centre mark per hole, scaled like the outline', () => {
    const { container } = render(<PartDiagram view={holedView()} />);
    const holes = container.querySelectorAll('ellipse.cutlist-diagram-hole');
    expect(holes).toHaveLength(3);
    expect(container.querySelectorAll('.cutlist-diagram-hole-centre')).toHaveLength(3);
    // rx/ry are r times the panel's own scales (unequal: the diagram is schematic).
    const rx = Number(holes[0]!.getAttribute('rx'));
    const ry = Number(holes[0]!.getAttribute('ry'));
    expect(rx).toBeGreaterThan(0);
    expect(ry).toBeGreaterThan(0);
  });
  it('prints each row\'s bench line once, as a note under the figure (HTML, not a measured label)', () => {
    render(<PartDiagram view={holedView()} />);
    const notes = screen.getAllByText(/^Row of 3 holes/);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.tagName).toBe('P');
  });
  it('draws a hole seen across its axis as a dashed outline: two walls and a bottom when blind', () => {
    const rabbet = { id: 'c1', face: 'width' as const, from: 'min' as const, across: 'length' as const, offset: 0, width: 0.25, depth: 0.25, stopMin: 0, stopMax: 0 };
    const views = buildDiagrams(createBoard({ length: 30, width: 11.25, thickness: 0.75, holes: [pins], cuts: [rabbet] }), 16);
    const w = views.find((v) => v.key === 'width|min')!;
    const { container } = render(<PartDiagram view={w} />);
    // Per hole: two wall lines + one bottom line (blind) = 3; three holes.
    expect(container.querySelectorAll('line.cutlist-diagram-hole-side')).toHaveLength(9);
  });
  it('a part without holes renders exactly as before (no hole elements, no hole notes)', () => {
    const { container } = render(<PartDiagram view={view(dado())} />);
    expect(container.querySelectorAll('.cutlist-diagram-hole, .cutlist-diagram-hole-side, .cutlist-diagram-hole-note')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to see them fail.**

- [ ] **Step 3: Implement** — in `PartDiagram.tsx`, after the angle polygons:

```tsx
        {view.holes.map((c) => {
          const x = left + fit.offsetX + c.h * fit.sx;
          const y = top + (view.vUp ? view.v - c.v : c.v) * fit.sy;
          const k = HOLE_MARK; // px half-length of the centre mark
          return (
            <g key={`${c.row}:${c.index}`}>
              <ellipse className="cutlist-diagram-hole" cx={x} cy={y} rx={c.r * fit.sx} ry={c.r * fit.sy} />
              <path className="cutlist-diagram-hole-centre" d={`M${x - k} ${y}H${x + k}M${x} ${y - k}V${y + k}`} />
            </g>
          );
        })}

        {view.holeSides.flatMap((s) => {
          const X = (h: number) => left + fit.offsetX + h * fit.sx;
          const Y = (v: number) => top + (view.vUp ? view.v - v : v) * fit.sy;
          // The two walls run along the hole's axis; the bottom (blind only) closes its far end.
          const lines: [number, number, number, number][] = s.axis === 'h'
            ? [[X(s.h[0]), Y(s.v[0]), X(s.h[1]), Y(s.v[0])], [X(s.h[0]), Y(s.v[1]), X(s.h[1]), Y(s.v[1])]]
            : [[X(s.h[0]), Y(s.v[0]), X(s.h[0]), Y(s.v[1])], [X(s.h[1]), Y(s.v[0]), X(s.h[1]), Y(s.v[1])]];
          if (s.bottomAt === 'hmin') lines.push([X(s.h[0]), Y(s.v[0]), X(s.h[0]), Y(s.v[1])]);
          if (s.bottomAt === 'hmax') lines.push([X(s.h[1]), Y(s.v[0]), X(s.h[1]), Y(s.v[1])]);
          if (s.bottomAt === 'vmin') lines.push([X(s.h[0]), Y(s.v[0]), X(s.h[1]), Y(s.v[0])]);
          if (s.bottomAt === 'vmax') lines.push([X(s.h[0]), Y(s.v[1]), X(s.h[1]), Y(s.v[1])]);
          return lines.map(([x1, y1, x2, y2], i) => (
            <line key={`${s.row}:${s.index}:${i}`} className="cutlist-diagram-hole-side" x1={x1} y1={y1} x2={x2} y2={y2} />
          ));
        })}
```

  After the angle notes:

```tsx
      {view.holeNotes.map((line) => (
        <p className="cutlist-diagram-hole-note" key={line}>{line}</p>
      ))}
```

  `const HOLE_MARK = 3;` beside the module's other px constants, with a one-line comment.

  `styles.css`, beside `.cutlist-diagram-angle`:

```css
.cutlist-diagram-hole {
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
}

.cutlist-diagram-hole-centre {
  stroke: currentColor;
  stroke-width: 0.75;
}

.cutlist-diagram-hole-side {
  stroke: currentColor;
  stroke-width: 1;
  stroke-dasharray: 3 2;
}
```

  and add `.cutlist-diagram-hole-note` to the `.cutlist-diagram-crossings, .cutlist-diagram-angle-note` rule's selector
  list. (Check the print stylesheet section for `.cutlist-diagram-angle` — if it overrides colours or strokes for print,
  give the hole classes the same treatment.)

- [ ] **Step 4: Run, full suite, build.**
- [ ] **Step 5: Mutate** — drop the vUp flip for holes (write a vUp test first: a hole on the thickness MIN side, whose
  view is vUp, must draw at `top + (v − c.v)·sy`; it fails without the flip); drop the bottom line (the 9-lines test
  fails). Restore by hand.
- [ ] **Step 6: Commit** — `holes chunk 2: draw holes in the part diagrams` + trailer.

---

### Task 4: The Hinge cup preset

**Files:**
- Modify: `src/document/holes.ts`, `src/panels/Holes.tsx`, `src/document/document.ts`
- Test: `src/document/holes.test.ts`, `src/panels/Holes.test.tsx`

**Interfaces:**
- Produces: `defaultHingeCup(b: Board): Omit<HoleRow, 'id'>`.

- [ ] **Step 1: Write the failing tests**

`holes.test.ts`:

```ts
import { defaultHingeCup, mm } from './holes';
describe('the Hinge cup preset (spec §7)', () => {
  it('35 mm × 1/2" deep in the broad face, 3" from the length min end, 22.5 mm in from the width min side', () => {
    const door = createBoard({ length: 20, width: 15, thickness: 0.75 });
    expect(defaultHingeCup(door)).toEqual({
      face: 'thickness', from: 'max', diameter: mm(35), depth: 0.5, along: 'length', alongFrom: 'min',
      station: 3, count: 1, pitch: 0, acrossFrom: 'min', inset: mm(22.5),
    });
  });
});
```

`Holes.test.tsx` (its `open`, `add`, `rows` helpers):

```tsx
  it('adds a hinge cup; its line prints the millimetres', async () => {
    const user = userEvent.setup();
    open(side({ length: 20, width: 15 }));
    await add(user, 'Hinge cup');
    expect(rows()[0]).toMatchObject({ diameter: 35 / 25.4, depth: 0.5, station: 3, count: 1 });
    expect(screen.getByText(/^Hole 1-3\/8" \(35 mm\) dia × 1\/2" deep/)).toBeInTheDocument();
  });
  it('withholds the hinge cup on stock too thin for a 1/2" cup', async () => {
    const user = userEvent.setup();
    open(side({ length: 20, width: 15, thickness: 0.5 }));
    await user.click(screen.getByRole('button', { name: '+ Add hole' }));
    expect(screen.queryByRole('button', { name: 'Hinge cup' })).toBeNull();
  });
```

- [ ] **Step 2: Run to see them fail.**
- [ ] **Step 3: Implement** — `holes.ts`, after `defaultShelfPinRow`:

```ts
/** "Hinge cup" (spec §7): a 35 mm Forstner cup, 1/2" deep, in the broad face, 3" from the min end of the longer side,
 *  22.5 mm in from the min side (the common cup-hinge spec puts the cup's edge 3–6 mm from the door edge). */
export function defaultHingeCup(b: Board): Omit<HoleRow, 'id'> {
  const face = broadFace(b);
  const [along] = othersOf(b, face);
  return {
    face, from: 'max', diameter: mm(35), depth: 0.5, along, alongFrom: 'min', station: 3, count: 1, pitch: 0,
    acrossFrom: 'min', inset: mm(22.5),
  };
}
```

  `Holes.tsx`: `const cup = defaultHingeCup(board);` and a third item
  `...(fits(cup) ? [{ label: 'Hinge cup', detail: '35 mm cup, 1/2" deep, 22.5 mm in from the edge', run: () => addHoleRows(board.id, [cup]) }] : []),`.
  Barrel: export `defaultHingeCup`.

  (Thin stock: a 1/2" blind cup in 1/2" stock is `too-deep`, so `fits` withholds it — no special case.)

- [ ] **Step 4: Run, full suite, build.**
- [ ] **Step 5: Mutate** — drop `fits(cup)` (the withheld test fails); `mm(22.5)` → `22.5 / 25.4 * 1` is the same value —
  instead change it to `0.886` and see the preset test fail. Restore.
- [ ] **Step 6: Commit** — `holes chunk 2: the Hinge cup preset` + trailer.

---

### Task 5: Live check, records and merge

- [ ] **Step 1: Live check on the dev server** (controller-driven; the user can watch). Read
  `~/.claude/projects/-home-alec-docker-sloyd/memory/browser-verification-on-this-vps.md` and
  `dev-browser-profile-is-the-users.md` first. Port 5181; record the profile's projects and active project; import a
  fixture as a NEW project (cabinet side with a dado, a shelf-pin row, a through-bore; a door with a Hinge cup); open the
  **Plans** sheet and the **Cut list** diagrams; screenshot both to the SDD workspace; check: rims and dashed depth lines
  in the elevations, nothing seen through the through-bore from above, the exploded view without hidden lines, diagram
  circles/centre marks/dashed sides and the notes; delete the fixture project, restore the active project, close the
  browser, stop the server. Real print-to-PDF stays unverified (fu 254: no `pdf()` here) — say so.
- [ ] **Step 2: Final whole-branch review** (most capable model), one fix wave if needed, one scoped re-review.
- [ ] **Step 3: Records** — CLAUDE.md (Status; a Rounds-shipped row; the file index: `holeDrawing.ts`, diagram hole
  fields; invariant 47's drawings sentence names hole lines; invariant 50 names `DRAWING_HOLE_SEGMENTS`; the test count),
  `docs/history.md` (narrative + the §4.3 amendment), `docs/follow-ups.md` (close 327; new residue entries from 343),
  `docs/feature-gaps.md` (Holes: chunk 2 merged), the spec's Status, `docs/browser-verification-holes.md` ("Chunk 2").
- [ ] **Step 4: Merge** — `git checkout master && git merge --no-ff holes-2`, `npm test && npm run build` on the merged
  tree, `git branch -d holes-2`. Deploying is a separate question for the user (no schema change: rollback is free).
