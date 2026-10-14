# Section Cut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One axis-aligned section plane in the viewport: GPU-clipped parts and edges, exact solid caps (bores shown as
voids), editing left free, with clicks and snap points on the removed side ignored.

**Architecture:** A pure module `src/document/section.ts` owns the side test, the plane, the axis span and the caps:
each part's convex bodies (`partGeometry`) are clipped in board-local coordinates by `clipConvex`, the bores are
subtracted with `minusPrism`, and the outline is the boundary of the pieces' union (opposite collinear edges cancel).
The store holds `section` as view state with one writer. The viewport puts one shared `THREE.Plane` on every part and
edge material, draws each part's cap inside its `BoardMesh`, filters raycasts and snap candidates through
`keptBySection`.

**Tech Stack:** TypeScript, React, Zustand, three.js / react-three-fiber, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-14-sloyd-section-cut-design.md` — read it first; this plan argues from it.

## Global Constraints

- View state only: `section` never enters the document, autosave or undo (spec §2.1).
- `axis`: `'front'` → plane `z = at`, `'side'` → `x = at`, `'top'` → `y = at`. Default kept half-space is
  `toward · p ≤ at` (world axis value ≤ at); `flip` keeps `≥ at`. A point within `SECTION_EPS` (1e-7 in) of the plane is
  kept.
- `at` is exact world inches: never rounded, never clamped (inv 25's spirit; spec §2.1). The field REFUSES out-of-range
  input (`DimensionField` min/max), never clamps (inv 5).
- Every part↔world crossing goes through `axisFrame`'s helpers (`fromWorldOffset`, `toWorld`); never `board[dim] - u`
  at a call site (inv 44).
- `partGeometry` results are deep-frozen and shared: never mutate a body, face, vertex or hole (bodies.ts rule).
- A slider move must not rebuild part geometry (spec §5, inv 50's budget): only caps recompute.
- No pull requests; branch `section-cut`, merged locally with `git merge --no-ff` at the end.
- `npm test` does not typecheck: `npm run build` is the gate before any "it compiles" claim.
- The viewport has no unit tests by design; viewport behaviour is verified live (Task 7).

**One deliberate amendment to the spec, to confirm with the user at plan review:** spec §3.1 step 2 says a plane lying
exactly on a body face adds no cap. That is wrong for a **seam face of a holed part**: `bodyMesh` subtracts seam faces
inside holed bodies (inv 50), so a plane typed exactly at a dado's shoulder on a drilled side would show a hole into the
part. This plan instead caps a body face lying ON the plane and facing the removed side (Task 2). On an outer face that
cap coincides with the drawn face and wins by `polygonOffset` — the face reads as cut, which is what it is.

## Review Focus

1. **Plane typed exactly at a cut shoulder or seam** (an exact `DimensionField` value is the likely way to get there):
   the part must read solid, never hollow → Task 2 test "plane on a seam between cells is capped".
2. **Turned, on-edge, upright and mirrored parts:** a cap must sit where the wood is, not reflected → Task 2's
   pose-sweep test against an independent inside-test.
3. **A blind bore cut along its axis:** a notch from the cap's edge, not a closed slot, and no stray outline across the
   notch mouth → Task 3 test "blind bore along its axis notches the outline".
4. **Every part hidden while the section is on** (no span): controls must not throw and must not write `NaN` →
   Task 5 test "with every part hidden".
5. **Model edited so `at` falls outside the parts** (part shortened, moved): `at` is kept, no clamp, field shows it →
   Task 4 test "an edit never moves `at`" and Task 5 test "stored position outside the span".

---

## File structure

| File | Role |
|---|---|
| Create `src/document/section.ts` | `Section`, `SectionAxis`, `SECTION_EPS`, `sectionAxisIndex`, `keptBySection`, `sectionPlaneOf`, `sectionSpan`, `sectionCaps`, `unionOutline` |
| Create `src/document/section.test.ts` | unit tests for all of the above |
| Modify `src/document/document.ts` | re-export section.ts' public names |
| Modify `src/store/store.ts` | `section` state, `setSection`, resets |
| Create `src/store/store.section.test.ts` | store tests |
| Modify `src/panels/ViewportControls.tsx`, `ViewportControls.test.tsx`, `src/styles.css` | toggle + Section group |
| Create `src/viewport/sectionPlane.ts` | the ONE shared `THREE.Plane` and its sync |
| Modify `src/viewport/Viewport.tsx`, `BoardMesh.tsx`, `MoveTool.tsx`, `TapeTool.tsx` | clipping, caps, raycast and snap filters |
| Create `src/viewport/sectionPerf.test.ts` | the cap rebuild guard |
| Modify `CLAUDE.md`, `docs/follow-ups.md`, `docs/history.md`, `docs/feature-gaps.md`; create `docs/browser-verification-section-cut.md` | records |

---

### Task 0: Branch

- [ ] `cd /home/alec/docker/sloyd && git checkout -b section-cut`

### Task 1: Section model — side test, plane, span

**Files:**
- Create: `src/document/section.ts`
- Create: `src/document/section.test.ts`
- Modify: `src/document/document.ts` (add an export line beside the snapPoints export)

**Interfaces:**
- Produces:
  ```ts
  export type SectionAxis = 'front' | 'side' | 'top';
  export interface Section { axis: SectionAxis; at: number; flip: boolean }
  export const SECTION_EPS = 1e-7;
  export function sectionAxisIndex(axis: SectionAxis): 0 | 1 | 2;          // side→0 (x), top→1 (y), front→2 (z)
  export function keptBySection(s: Section | null, p: readonly number[]): boolean;
  export function sectionPlaneOf(s: Section): { normal: V3; constant: number };  // kept where normal·p + constant ≥ 0
  export function sectionSpan(boards: readonly Board[], offsets: ReadonlyMap<string, readonly number[]> | null,
                              axis: SectionAxis): [number, number] | null;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// src/document/section.test.ts
import { createBoard } from './document';
import { keptBySection, sectionAxisIndex, sectionPlaneOf, sectionSpan, SECTION_EPS, type Section } from './section';

describe('section side test', () => {
  const front: Section = { axis: 'front', at: 3, flip: false };
  it('maps the axis to the world index of the standard view it is seen from', () => {
    expect(sectionAxisIndex('side')).toBe(0);
    expect(sectionAxisIndex('top')).toBe(1);
    expect(sectionAxisIndex('front')).toBe(2);
  });
  it('keeps the far side by default and the near side when flipped; on the plane is kept both ways', () => {
    expect(keptBySection(front, [0, 0, 2])).toBe(true);
    expect(keptBySection(front, [0, 0, 4])).toBe(false);
    expect(keptBySection({ ...front, flip: true }, [0, 0, 2])).toBe(false);
    expect(keptBySection({ ...front, flip: true }, [0, 0, 4])).toBe(true);
    expect(keptBySection(front, [0, 0, 3 + SECTION_EPS / 2])).toBe(true);
    expect(keptBySection({ ...front, flip: true }, [0, 0, 3 - SECTION_EPS / 2])).toBe(true);
    expect(keptBySection(front, [0, 0, 3 + 1e-5])).toBe(false);
  });
  it('keeps everything with no section', () => {
    expect(keptBySection(null, [0, 0, 1e9])).toBe(true);
  });
  it('reads only its own axis', () => {
    const side: Section = { axis: 'side', at: 1, flip: false };
    expect(keptBySection(side, [0.5, 100, 100])).toBe(true);
    expect(keptBySection(side, [1.5, -100, -100])).toBe(false);
  });
});

describe('sectionPlaneOf', () => {
  const signed = (s: Section, p: number[]) => {
    const { normal, constant } = sectionPlaneOf(s);
    return normal[0] * p[0]! + normal[1] * p[1]! + normal[2] * p[2]! + constant;
  };
  it('agrees with keptBySection on both sides, for every axis and both flips', () => {
    for (const axis of ['front', 'side', 'top'] as const) {
      for (const flip of [false, true]) {
        const s: Section = { axis, at: 2.5, flip };
        const k = sectionAxisIndex(axis);
        for (const v of [1, 4]) {
          const p = [7, 7, 7]; p[k] = v;
          expect(signed(s, p) >= 0).toBe(keptBySection(s, p));
        }
      }
    }
  });
});

describe('sectionSpan', () => {
  // Flat at turn 0: X = length, Y = thickness, Z = width.
  const a = createBoard({ id: 'a', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0] });
  const b = createBoard({ id: 'b', length: 10, width: 4, thickness: 0.75, position: [5, 1.5, -3] });
  it('is the drawn extent of the parts along the axis', () => {
    expect(sectionSpan([a, b], null, 'front')).toEqual([-3, 6]);
    expect(sectionSpan([a, b], null, 'top')).toEqual([0, 2.25]);
    expect(sectionSpan([a, b], null, 'side')).toEqual([0, 20]);
  });
  it('adds explode offsets (the parts where they are drawn)', () => {
    expect(sectionSpan([a, b], new Map([['b', [0, 10, 0]]]), 'top')).toEqual([0, 12.25]);
  });
  it('is null with no parts', () => {
    expect(sectionSpan([], null, 'front')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/document/section.test.ts`
Expected: FAIL — cannot resolve `./section`.

- [ ] **Step 3: Implement**

```ts
// src/document/section.ts
import type { Board } from './types';
import type { V3 } from './angleCuts';
import { boardExtents } from './geometry';

/**
 * The viewport's section cut (section-cut spec): ONE axis-aligned plane, view state only (never in the document).
 * `axis` names the standard view the cut is seen from (drawing.ts' FRONT/SIDE/TOP): front → z = at, side → x = at,
 * top → y = at. The kept half-space is the FAR side seen from that view (world axis value ≤ at); `flip` keeps the near
 * side. This module is the one home of the side test (`keptBySection`, invariant 51) and of the caps (`sectionCaps`).
 */
export type SectionAxis = 'front' | 'side' | 'top';
export interface Section { axis: SectionAxis; at: number; flip: boolean }

/** Inches: a point this close to the plane is ON it, and kept. Well above float drift of `position + offset` sums at
 *  furniture scale, far below anything visible. */
export const SECTION_EPS = 1e-7;

const AXIS_INDEX: Readonly<Record<SectionAxis, 0 | 1 | 2>> = { side: 0, top: 1, front: 2 };

export function sectionAxisIndex(axis: SectionAxis): 0 | 1 | 2 {
  return AXIS_INDEX[axis];
}

/** THE side test: picking, snapping and the caps' kept side all read it. No section keeps everything. */
export function keptBySection(s: Section | null, p: readonly number[]): boolean {
  if (!s) return true;
  const v = p[AXIS_INDEX[s.axis]]! - s.at;
  return s.flip ? v >= -SECTION_EPS : v <= SECTION_EPS;
}

/** The plane as THREE.Plane wants it: kept where normal·p + constant ≥ 0 (three clips the negative side). */
export function sectionPlaneOf(s: Section): { normal: V3; constant: number } {
  const normal: V3 = [0, 0, 0];
  normal[AXIS_INDEX[s.axis]] = s.flip ? 1 : -1;
  return { normal, constant: s.flip ? -s.at : s.at };
}

/** The parts' drawn extent along the axis (explode offsets added, as framing's subsetBounds), or null with no parts. */
export function sectionSpan(
  boards: readonly Board[], offsets: ReadonlyMap<string, readonly number[]> | null, axis: SectionAxis,
): [number, number] | null {
  if (boards.length === 0) return null;
  const k = AXIS_INDEX[axis];
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of boards) {
    const min = b.position[k]! + (offsets?.get(b.id)?.[k] ?? 0);
    lo = Math.min(lo, min);
    hi = Math.max(hi, min + boardExtents(b)[k]!);
  }
  return [lo, hi];
}
```

In `src/document/document.ts`, beside the `snapPoints` export line, add:

```ts
export { keptBySection, sectionAxisIndex, sectionPlaneOf, sectionSpan, SECTION_EPS } from './section';
export type { Section, SectionAxis } from './section';
```

(Task 2 extends the first line with `sectionCaps`, Task 3 with `unionOutline`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/document/section.test.ts` — Expected: PASS.

- [ ] **Step 5: Mutate.** Swap `<=`/`>=` in `keptBySection`; confirm the side test fails. Change `flip ? -s.at : s.at` to
  `s.at`; confirm `sectionPlaneOf`'s agreement test fails. Revert both.

- [ ] **Step 6: Commit**

```bash
git add src/document/section.ts src/document/section.test.ts src/document/document.ts
git commit -m "feat(section): side test, plane and span"
```

### Task 2: Cap pieces — bodies clipped, bores subtracted, any pose

**Files:**
- Modify: `src/document/section.ts`, `src/document/section.test.ts`, `src/document/document.ts`

**Interfaces:**
- Consumes: Task 1's `Section`, `SECTION_EPS`, `sectionAxisIndex`; `partGeometry` (bodies.ts), `clipConvex`
  (bodies.ts, exported from the module file, not from document.ts), `holePrism`/`minusPrism` (holes.ts), `axisFrame`,
  `fromWorldOffset`, `DIMENSION_ORDER` (geometry.ts), `toWorld` (snapPoints.ts).
- Produces:
  ```ts
  export interface SectionCap { pieces: V3[][]; outline: [V3, V3][] }   // world inches, WHERE DRAWN (offset added)
  export function sectionCaps(board: Board, s: Section, offset?: readonly number[]): SectionCap | null;
  /** internal, exported for tests: board-local pieces (normalised winding) + the local index of the cut dimension */
  export function localCapPieces(board: Board, s: Section, offset?: readonly number[]): { pieces: V3[][]; li: number; u: number } | null;
  ```
  In this task `outline` is returned as `[]`; Task 3 fills it.

- [ ] **Step 1: Write the failing tests** (append to `section.test.ts`)

The pose sweep checks caps against an INDEPENDENT inside-test built from `pocketCells`, `keptHalfSpace` and the hole
prism planes — none of which `sectionCaps` uses directly — sampling a grid on the plane at irrational offsets so no
sample lands on an edge.

```ts
import { mirrorPart, pocketCells, keptHalfSpace, partGeometry, axisFrame, fromWorldOffset, DIMENSION_ORDER,
  type Board, type Posture, type Rotation } from './document';
import { holePrism } from './holes';
import { localCapPieces, sectionCaps } from './section';
import { chiralPart } from './turnFixtures';

type P3 = [number, number, number];
/** Newell area of a planar polygon. */
const area = (poly: readonly P3[]) => {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
    x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return Math.hypot(x, y, z) / 2;
};
const totalArea = (pieces: readonly P3[][]) => pieces.reduce((s, p) => s + area(p), 0);
/** Point in a convex planar polygon, projected off axis k. */
function inConvex(poly: readonly P3[], p: readonly number[], k: number): boolean {
  const [i, j] = [0, 1, 2].filter((d) => d !== k) as [number, number];
  let sign = 0;
  for (let n = 0; n < poly.length; n++) {
    const a = poly[n]!, b = poly[(n + 1) % poly.length]!;
    const c = (b[i] - a[i]) * (p[j]! - a[j]) - (b[j] - a[j]) * (p[i]! - a[i]);
    if (Math.abs(c) < 1e-12) continue;
    if (sign === 0) sign = Math.sign(c); else if (Math.sign(c) !== sign) return false;
  }
  return true;
}
/** Independent: world point → local through the frame, then in a pocket cell, kept by every angle cut, in no bore. */
function solidAt(b: Board, w: readonly number[]): boolean {
  const frame = axisFrame(b);
  const local: P3 = [0, 0, 0];
  frame.forEach(({ dim }, axis) => { local[DIMENSION_ORDER.indexOf(dim)] = fromWorldOffset(b, axis, w[axis]! - b.position[axis]!); });
  const [l, wd, t] = local;
  const inCell = pocketCells(b).some((r) => l > r.length[0] && l < r.length[1] && wd > r.width[0] && wd < r.width[1] && t > r.thickness[0] && t < r.thickness[1]);
  if (!inCell) return false;
  if (!b.angleCuts.every((c) => { const h = keptHalfSpace(b, c); return !h || h.n[0] * l + h.n[1] * wd + h.n[2] * t + h.d >= 0; })) return false;
  return !partGeometry(b).holes.some((h) => holePrism(h).every((q) => q.n[0] * l + q.n[1] * wd + q.n[2] * t + q.d >= 0));
}

const box = createBoard({ id: 'box', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0] });

describe('sectionCaps: a plain box', () => {
  it('front at 3 caps the full 20 × 1.5 section on z = 3', () => {
    const cap = sectionCaps(box, { axis: 'front', at: 3, flip: false })!;
    expect(totalArea(cap.pieces as P3[][])).toBeCloseTo(30, 9);
    for (const p of cap.pieces.flat()) expect(p[2]).toBeCloseTo(3, 12);
  });
  it('is the same cap flipped', () => {
    expect(totalArea(sectionCaps(box, { axis: 'front', at: 3, flip: true })!.pieces as P3[][])).toBeCloseTo(30, 9);
  });
  it('is null when the plane misses the part', () => {
    expect(sectionCaps(box, { axis: 'front', at: 7, flip: false })).toBeNull();
    expect(sectionCaps(box, { axis: 'top', at: -1, flip: true })).toBeNull();
  });
  it('caps an outer face lying on the plane when the part is on the kept side', () => {
    // top at 1.5, default keeps y ≤ 1.5: the box's top face is on the plane, facing the removed side.
    expect(totalArea(sectionCaps(box, { axis: 'top', at: 1.5, flip: false })!.pieces as P3[][])).toBeCloseTo(120, 9);
    // flipped, the box is all removed: nothing to cap.
    expect(sectionCaps(box, { axis: 'top', at: 1.5, flip: true })).toBeNull();
  });
});

describe('sectionCaps: explode offset', () => {
  it('a part offset by [0, 0, 5] cut at front 8 is capped as the same part moved by 5 and cut at 8', () => {
    const moved = { ...box, position: [0, 0, 5] as P3 };
    const a = sectionCaps(box, { axis: 'front', at: 8, flip: false }, [0, 0, 5])!;
    const b = sectionCaps(moved, { axis: 'front', at: 8, flip: false })!;
    expect(a.pieces).toEqual(b.pieces);
    for (const p of a.pieces.flat()) expect(p[2]).toBeCloseTo(8, 12);
  });
  it('an offset off the cut axis only translates the cap', () => {
    const a = sectionCaps(box, { axis: 'front', at: 3, flip: false }, [10, 0, 0])!;
    expect(Math.min(...a.pieces.flat().map((p) => p[0]))).toBeCloseTo(10, 12);
  });
});

describe('sectionCaps: holes', () => {
  const pin = { id: 'r1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.5,
    along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 2, acrossFrom: 'min' as const, inset: 1.5 };
  const drilled = createBoard({ id: 'd', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], holes: [pin] });
  it('across the bores: three 48-gon voids out of the 20 × 6 cap', () => {
    // top at 1.25: inside the pins' depth (1.0 … 1.5). 48-gon area = (n/2) r² sin(2π/n).
    const gon = (48 / 2) * 0.125 ** 2 * Math.sin((2 * Math.PI) / 48);
    const cap = sectionCaps(drilled, { axis: 'top', at: 1.25, flip: false })!;
    expect(totalArea(cap.pieces as P3[][])).toBeCloseTo(120 - 3 * gon, 6);
  });
  it('along the bores: a notch from the top edge per pin', () => {
    // front at z = 1.5 (the row's inset): each pin's section is its full diameter wide (the 48-gon's vertex-to-vertex
    // width along x through the centre is 2r) and 0.5 deep, from the top face down.
    const cap = sectionCaps(drilled, { axis: 'front', at: 1.5, flip: false })!;
    expect(totalArea(cap.pieces as P3[][])).toBeCloseTo(20 * 1.5 - 3 * 0.25 * 0.5, 6);
  });
  it('below the bores: untouched', () => {
    expect(totalArea(sectionCaps(drilled, { axis: 'top', at: 0.5, flip: false })!.pieces as P3[][])).toBeCloseTo(120, 9);
  });
});

describe('sectionCaps: plane on a seam between cells is capped (spec amendment)', () => {
  // A dado across the width, 0.75 wide at x 10 … 10.75, 0.25 deep from the top, on a drilled part (so bodyMesh
  // subtracts seam faces). A plane exactly on the dado's shoulder must still read solid.
  const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10,
    width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
  const pin = { id: 'r1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.5,
    along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 1.5 };
  const part = createBoard({ id: 's', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], cuts: [dado], holes: [pin] });
  it('side at the shoulder, either way, caps the full section below and beside the dado', () => {
    for (const flip of [false, true]) {
      const cap = sectionCaps(part, { axis: 'side', at: 10, flip })!;
      expect(cap).not.toBeNull();
      // At x = 10 the stock is the full 6 × 1.5 on the kept-left side (flip false: the cell left of the shoulder's face),
      // and 6 × 1.25 under the dado on the right (flip true). Either is non-empty and inside the part.
      expect(totalArea(cap.pieces as P3[][])).toBeCloseTo(flip ? 6 * 1.25 : 6 * 1.5, 9);
    }
  });
});

describe('sectionCaps: every pose agrees with an independent inside-test', () => {
  const pin = { id: 'r1', face: 'thickness' as const, from: 'min' as const, diameter: 0.375, depth: 1,
    along: 'length' as const, alongFrom: 'min' as const, station: 14, count: 2, pitch: 2.5, acrossFrom: 'max' as const, inset: 2 };
  const AXES = ['side', 'top', 'front'] as const;   // index = world axis
  /** Three planes per axis; on each, a sample grid at irrational-ish offsets compared with `solidAt`. */
  function sweep(b: Board) {
    for (const axis of AXES) {
      const k = sectionAxisIndex(axis);
      const span = sectionSpan([b], null, axis)!;
      const [i, j] = [0, 1, 2].filter((d) => d !== k) as [number, number];
      const si = sectionSpan([b], null, AXES[i]!)!;
      const sj = sectionSpan([b], null, AXES[j]!)!;
      for (const frac of [0.2371, 0.5113, 0.8737]) {
        const at = span[0] + frac * (span[1] - span[0]);
        for (const flip of [false, true]) {
          const cap = sectionCaps(b, { axis, at, flip });
          for (let a = si[0] + 0.0731; a < si[1]; a += 0.4137) for (let c = sj[0] + 0.0519; c < sj[1]; c += 0.3311) {
            const p = [0, 0, 0]; p[k] = at; p[i] = a; p[j] = c;
            const inCap = !!cap && cap.pieces.some((poly) => inConvex(poly as P3[], p, k));
            expect(inCap, `${axis} at ${at} flip ${flip} sample ${p}`).toBe(solidAt(b, p));
          }
        }
      }
    }
  }
  const cases: [string, Board][] = [];
  for (const posture of ['flat', 'on-edge', 'upright'] as Posture[]) for (const rotation of [0, 90, 180, 270] as Rotation[]) {
    const base: Board = { ...chiralPart(posture), holes: [pin], rotation, position: [1.25, 0.5, -2.75] };
    cases.push([`${posture} ${rotation}`, base]);
    cases.push([`${posture} ${rotation} mirrored`, mirrorPart(base)]);
  }
  it.each(cases)('%s', (_name, b) => sweep(b));
  it.each([['flat', 0], ['upright', 90]] as [Posture, Rotation][])('a tapered leg, %s %s (bodies clipped by an angle cut)', (posture, rotation) => {
    const leg = createBoard({ id: 'leg', length: 20, width: 2, thickness: 2, posture, rotation, position: [0.5, 0, 0.5],
      angleCuts: [{ id: 't1', ...taperCut({ face: 'width', from: 'min', end: 'min', start: 15, amount: 0.75 }) }] });
    sweep(leg);
    sweep(mirrorPart(leg));
  });
});
```

Add `taperCut` to the `./document` import (it is re-exported there).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/section.test.ts` — Expected: FAIL (`sectionCaps` not exported).

- [ ] **Step 3: Implement** (append to `section.ts`; add imports at the top)

```ts
import type { Board } from './types';
import { axisFrame, DIMENSION_ORDER, fromWorldOffset } from './geometry';
import { clipConvex, partGeometry, BODY_EPS } from './bodies';
import { holePrism, minusPrism } from './holes';
import { toWorld } from './snapPoints';

export interface SectionCap { pieces: V3[][]; outline: [V3, V3][] }

/**
 * A part's cap in its own coordinates: the plane is one of the part's axis planes, because a placed part turns only in
 * quarter turns and the composition resolves mirroring before the part is drawn (invariants 44, 46). Pieces are convex
 * and wound counter-clockwise about the cap's normal (which faces the REMOVED side), so `unionOutline` can cancel seams.
 * Null when the plane misses the part or nothing of it is cut.
 */
export function localCapPieces(
  board: Board, s: Section, offset?: readonly number[],
): { pieces: V3[][]; li: number; u: number } | null {
  const k = AXIS_INDEX[s.axis];
  const { dim, reversed } = axisFrame(board)[k]!;
  const li = DIMENSION_ORDER.indexOf(dim);
  // The GPU clips the part where it is DRAWN (position + explode offset), so the plane moves into the undrawn frame.
  const u = fromWorldOffset(board, k, s.at - (offset?.[k] ?? 0) - board.position[k]!);
  if (u < -BODY_EPS || u > board[dim] + BODY_EPS) return null;
  // Kept side in local terms: the world kept side, reflected when this axis runs reversed.
  const keepLow = s.flip === reversed;
  const n: V3 = [0, 0, 0];
  n[li] = keepLow ? -1 : 1;
  const h = { n, d: keepLow ? u : -u };          // kept where n·x + d ≥ 0
  const capN: V3 = [-n[0], -n[1], -n[2]];          // the cap faces the removed side
  const onPlane = (p: readonly number[]) => Math.abs(p[li]! - u) <= BODY_EPS;
  const { bodies, holes } = partGeometry(board);
  let pieces: V3[][] = [];
  for (const body of bodies) {
    const faces = body.faces as BodyFace[];
    const clipped = clipConvex(faces, h);
    if (clipped.length === 0) continue;
    if (clipped === faces) {
      // Nothing removed: a face of this body lying ON the plane and facing the removed side is the cut (a seam a
      // holed body's mesh subtracts, or an outer face) — cap it, so the part never reads hollow (plan amendment).
      const f = faces.find((g) => g.n[li] === capN[li] && g.verts.every(onPlane));
      if (f) pieces.push(f.verts.map((p) => [p[0], p[1], p[2]] as V3));
      continue;
    }
    const cap = clipped.find((g) => g.cut === '');
    if (cap) pieces.push(cap.verts);
  }
  // ONE winding for every piece (counter-clockwise about capN): `clip`'s cap is ringed about the KEPT side's normal,
  // a body face is wound about its own outward normal (capN) — opposite ways. pocketCells MERGES cells (mergeAlong),
  // so a plane on a grid line can both cut a merged slab and lie on a neighbour's face, mixing the two; unionOutline's
  // cancellation needs them to agree. minusPrism keeps a polygon's winding.
  pieces = pieces.map((poly) => (newellAlong(poly, li) * capN[li]! < 0 ? [...poly].reverse() : poly));
  for (const hole of holes) {
    const prism = holePrism(hole);
    pieces = pieces.flatMap((p) => minusPrism(p, prism));
  }
  return pieces.length ? { pieces, li, u } : null;
}

/** Twice the signed area of a polygon projected along index `li` (Newell's component `li`). */
function newellAlong(poly: readonly V3[], li: number): number {
  const [i, j] = [(li + 1) % 3, (li + 2) % 3] as const;
  let a = 0;
  for (let n = 0; n < poly.length; n += 1) {
    const p = poly[n]!, q = poly[(n + 1) % poly.length]!;
    a += (p[i] - q[i]) * (p[j] + q[j]);
  }
  return a;
}

/** THE caps (section-cut spec §3.1): a part's cut faces in world inches where the part is DRAWN (explode offset
 *  added), or null. */
export function sectionCaps(board: Board, s: Section, offset?: readonly number[]): SectionCap | null {
  const local = localCapPieces(board, s, offset);
  if (!local) return null;
  const o = offset ?? [0, 0, 0];
  const w = (p: readonly number[]): V3 => {
    const q = toWorld(board, { length: p[0]!, width: p[1]!, thickness: p[2]! });
    return [q[0] + o[0]!, q[1] + o[1]!, q[2] + o[2]!];
  };
  return { pieces: local.pieces.map((poly) => poly.map(w)), outline: [] };
}
```

Add `type BodyFace` to the bodies import. Notes for the implementer:
- `clip` marks the face it adds with `cut: ''`; a body face carries `undefined` or an angle cut's id, so `cut === ''`
  finds the cap uniquely. If `clipConvex`'s doc comment or `clip` disagree with this, stop and report.
- `holes.ts` cannot import `bodies.ts` (cycle noted in holes.ts); `section.ts` imports both, which is fine — check
  `npm run build` for a cycle warning anyway.
- Check `newellAlong`'s sign convention once on the unit square `[[0,0,0],[1,0,0],[1,1,0],[0,1,0]]` with li = 2
  (counter-clockwise about +z): Newell's z component is `Σ (x_n − x_{n+1})(y_n + y_{n+1})` = +2 for it. If your hand
  check disagrees, fix the formula — the cyclic `(li+1, li+2)` order is what keeps the sign right-handed.
- If the seam test's expected areas disagree with the implementation, work out which side's cell owns the on-plane face
  by hand before changing either: the expectation was derived, not run.

Then extend document.ts' section export line with `sectionCaps` and add `SectionCap` to the type export.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run src/document/section.test.ts` — Expected: PASS.

- [ ] **Step 5: Mutate.** (a) Replace `const keepLow = s.flip === reversed` with `const keepLow = !s.flip` — the pose sweep
  must fail on reversed axes. (b) Delete the `clipped === faces` branch's push — the seam test must fail. (c) Skip the
  hole loop — both hole tests must fail. Revert each.

- [ ] **Step 6: Commit**

```bash
git add src/document/section.ts src/document/section.test.ts src/document/document.ts
git commit -m "feat(section): exact cap pieces from bodies minus bores, every pose"
```

### Task 3: Cap outline — the boundary of the union

**Files:**
- Modify: `src/document/section.ts`, `src/document/section.test.ts`, `src/document/document.ts`

**Interfaces:**
- Consumes: Task 2's `localCapPieces`.
- Produces: `export function unionOutline(pieces: readonly V3[][], li: number): [V3, V3][]` (local, in the plane
  `x[li] = const`); `sectionCaps(...).outline` filled (world).

- [ ] **Step 1: Write the failing tests**

```ts
import { unionOutline } from './section';

const len = (segs: readonly [P3, P3][]) => segs.reduce((s, [a, b]) => s + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), 0);

describe('unionOutline', () => {
  it('two squares sharing an edge: the shared edge cancels', () => {
    // in plane z = 0 (li = 2), both CCW about +z
    const a: P3[] = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]];
    const b: P3[] = [[1, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1, 0]];
    expect(len(unionOutline([a, b], 2) as [P3, P3][])).toBeCloseTo(6, 12);
  });
  it('a T-junction: a long edge against two short twins cancels exactly', () => {
    const big: P3[] = [[0, 0, 0], [2, 0, 0], [2, 1, 0], [0, 1, 0]];
    const s1: P3[] = [[0, 1, 0], [1, 1, 0], [1, 2, 0], [0, 2, 0]];
    const s2: P3[] = [[1, 1, 0], [2, 1, 0], [2, 2, 0], [1, 2, 0]];
    // union is the 2 × 2 square
    expect(len(unionOutline([big, s1, s2], 2) as [P3, P3][])).toBeCloseTo(8, 12);
  });
  it('a partial overlap leaves only the uncovered stretch', () => {
    const big: P3[] = [[0, 0, 0], [3, 0, 0], [3, 1, 0], [0, 1, 0]];
    const top: P3[] = [[1, 1, 0], [2, 1, 0], [2, 2, 0], [1, 2, 0]];
    // perimeter of the union: 3 + 1 + (1 + 1 + 1 + 1 + 1) + 1 = 10
    expect(len(unionOutline([big, top], 2) as [P3, P3][])).toBeCloseTo(10, 12);
  });
});

describe('sectionCaps outline', () => {
  it('across bores: the rectangle plus each 48-gon void', () => {
    const pin = { id: 'r1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.5,
      along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 2, acrossFrom: 'min' as const, inset: 1.5 };
    const b = createBoard({ id: 'v', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], holes: [pin] });
    const gonPerimeter = 48 * 2 * 0.125 * Math.sin(Math.PI / 48);
    expect(len(sectionCaps(b, { axis: 'top', at: 1.25, flip: false })!.outline as [P3, P3][])).toBeCloseTo(52 + 3 * gonPerimeter, 6);
  });
  it('a plain box: the rectangle', () => {
    expect(len(sectionCaps(box, { axis: 'front', at: 3, flip: false })!.outline as [P3, P3][])).toBeCloseTo(43, 9);
  });
  it('a notched part: one outline, no seam lines between pocket cells', () => {
    // chiralPart flat at the origin; front plane through c2's groove region: the outline length equals the perimeter
    // of the union, which the sweep's inside-test bounds: assert no outline segment has solid on BOTH sides.
    const b = { ...chiralPart('flat'), position: [0, 0, 0] as P3 };
    const s = { axis: 'side' as const, at: 4.375, flip: false };   // through c1's dado
    const cap = sectionCaps(b, s)!;
    for (const [p, q] of cap.outline as [P3, P3][]) {
      const m: P3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
      const d: P3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
      // in-plane perpendicular (plane x = const): (0, -dz, dy), normalised, nudged 1e-4 each way
      const l = Math.hypot(d[1], d[2]);
      const off: P3 = [0, (-d[2] / l) * 1e-4, (d[1] / l) * 1e-4];
      const left = solidAt(b, [m[0], m[1] + off[1], m[2] + off[2]]);
      const right = solidAt(b, [m[0], m[1] - off[1], m[2] - off[2]]);
      expect(left !== right, `segment ${p} → ${q}`).toBe(true);
    }
  });
  it('plane on a seam (a cut merged slab beside a neighbour face on the plane): one rectangle, no seam line', () => {
    // pocketCells merges the cells under the dado into ONE full-length slab (t 0 … 1.25), so at x = 10 the slab is
    // CUT (clip's cap) while the top-left block's face lies ON the plane (a face cap): mixed winding unless normalised.
    const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10,
      width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const b = createBoard({ id: 'm', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], cuts: [dado] });
    expect(len(sectionCaps(b, { axis: 'side', at: 10, flip: false })!.outline as [P3, P3][])).toBeCloseTo(2 * (6 + 1.5), 9);
  });
  it('blind bore along its axis notches the outline (no line across the notch mouth)', () => {
    const pin = { id: 'r1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.5,
      along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 1.5 };
    const b = createBoard({ id: 'n', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0], holes: [pin] });
    const cap = sectionCaps(b, { axis: 'front', at: 1.5, flip: false })!;
    // rectangle 2 × (20 + 1.5) = 43, minus the 0.25 mouth, plus the notch's two 0.5 sides and 0.25 floor
    expect(len(cap.outline as [P3, P3][])).toBeCloseTo(43 - 0.25 + 0.5 + 0.5 + 0.25, 6);
  });
});
```

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/document/section.test.ts` — FAIL.

- [ ] **Step 3: Implement**

```ts
/**
 * The boundary of the union of coplanar, disjoint, consistently wound convex pieces in the plane x[li] = const: every
 * piece edge, grouped by its supporting line, with each line's stretches weighted +1 along the line's canonical
 * direction and −1 against it; a stretch whose weights sum to zero is interior (a seam between pocket cells, or one of
 * minusPrism's splits, always meets its twin running the other way) and is dropped. What is left is the cut's outline.
 */
export function unionOutline(pieces: readonly V3[][], li: number): [V3, V3][] {
  const [i, j] = [0, 1, 2].filter((d) => d !== li) as [number, number];
  const plane = pieces[0]?.[0]?.[li] ?? 0;
  interface Line { dx: number; dy: number; c: number; spans: { t0: number; t1: number; w: number }[] }
  const lines: Line[] = [];
  for (const poly of pieces) {
    for (let n = 0; n < poly.length; n += 1) {
      const p = poly[n]!, q = poly[(n + 1) % poly.length]!;
      let dx = q[i] - p[i], dy = q[j] - p[j];
      const l = Math.hypot(dx, dy);
      if (l <= SECTION_EPS) continue;
      dx /= l; dy /= l;
      let w = 1;
      if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) { dx = -dx; dy = -dy; w = -1; }
      const c = -dy * p[i] + dx * p[j];                    // offset along the line's normal (−dy, dx)
      const ta = dx * p[i] + dy * p[j], tb = dx * q[i] + dy * q[j];
      let line = lines.find((m) => Math.abs(m.dx - dx) <= 1e-9 && Math.abs(m.dy - dy) <= 1e-9 && Math.abs(m.c - c) <= SECTION_EPS);
      if (!line) { line = { dx, dy, c, spans: [] }; lines.push(line); }
      line.spans.push({ t0: Math.min(ta, tb), t1: Math.max(ta, tb), w });
    }
  }
  const out: [V3, V3][] = [];
  const at = (m: Line, t: number): V3 => {
    const v: V3 = [0, 0, 0];
    v[li] = plane;
    v[i] = -m.dy * m.c + m.dx * t;
    v[j] = m.dx * m.c + m.dy * t;
    return v;
  };
  for (const m of lines) {
    const ts = m.spans.flatMap((s) => [s.t0, s.t1]).sort((a, b) => a - b);
    const cuts: number[] = [];
    for (const t of ts) if (!cuts.length || t - cuts[cuts.length - 1]! > SECTION_EPS) cuts.push(t);
    let runStart: number | null = null;
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      const mid = (cuts[k]! + cuts[k + 1]!) / 2;
      const sum = m.spans.reduce((s, sp) => s + (sp.t0 < mid && mid < sp.t1 ? sp.w : 0), 0);
      if (sum !== 0) { if (runStart === null) runStart = cuts[k]!; }
      else if (runStart !== null) { out.push([at(m, runStart), at(m, cuts[k]!)]); runStart = null; }
    }
    if (runStart !== null) out.push([at(m, runStart), at(m, cuts[cuts.length - 1]!)]);
  }
  return out;
}
```

and in `sectionCaps` replace `outline: []` with
`outline: unionOutline(local.pieces, local.li).map(([a, b]) => [w(a), w(b)] as [V3, V3])`.
Export `unionOutline` from document.ts' section line.

Check the line reconstruction once by hand: with unit `(dx, dy)` and normal `(−dy, dx)`, a point is
`c·(−dy, dx) + t·(dx, dy)`; `c = −dy·x + dx·y` and `t = dx·x + dy·y` invert it. If a test disagrees, fix the code, not
the expectation (the expectations are perimeters you can check on paper).

- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Mutate.** (a) Set `w = 1` unconditionally (no sign): the shared-edge, T-junction, partial-overlap and
  notched-part tests must fail. (c) Delete the winding normalisation line in `localCapPieces`: the seam outline test
  must fail (before deleting, confirm with a console.log that the dado part really yields one clip cap and one face cap
  at x = 10 — if pocketCells does not merge there, pick a cut layout where it does, and say so). (b) Skip the `cuts` de-duplication (push every `t`): the T-junction test must still
  pass (zero-length intervals contribute nothing) — if it fails, the de-dup is load-bearing; say so in a comment.
  Revert both.
- [ ] **Step 6: Commit** — `git commit -am "feat(section): cap outline as the boundary of the pieces' union"`

### Task 4: Store — `section` view state

**Files:**
- Modify: `src/store/store.ts`
- Create: `src/store/store.section.test.ts`

**Interfaces:**
- Consumes: `Section` from `../document/document`.
- Produces: `section: Section | null; setSection: (next: Section | null) => void` on the store.

- [ ] **Step 1: Write the failing tests**

```ts
// src/store/store.section.test.ts
import { useStore } from './store';
import { createDocument } from '../document/document';

const s = () => useStore.getState();
beforeEach(() => s().replaceDocument(createDocument('Test')));

describe('section', () => {
  it('starts off and is set by setSection', () => {
    expect(s().section).toBeNull();
    s().setSection({ axis: 'front', at: 3, flip: false });
    expect(s().section).toEqual({ axis: 'front', at: 3, flip: false });
    s().setSection(null);
    expect(s().section).toBeNull();
  });
  it('refuses a non-finite position, keeping the stored section', () => {
    s().setSection({ axis: 'top', at: 1, flip: true });
    s().setSection({ axis: 'top', at: Number.NaN, flip: true });
    s().setSection({ axis: 'top', at: Infinity, flip: true });
    expect(s().section).toEqual({ axis: 'top', at: 1, flip: true });
  });
  it('is view state: no undo entry, no document change', () => {
    const doc = s().doc;
    const past = s().past.length;
    s().setSection({ axis: 'side', at: 2, flip: false });
    expect(s().doc).toBe(doc);
    expect(s().past.length).toBe(past);
  });
  it('an edit never moves `at`, and undo/redo/setTool/explode leave it alone', () => {
    s().addBoard();
    s().setSection({ axis: 'front', at: 99, flip: false });
    s().addBoard();
    s().undo();
    s().redo();
    s().setTool('tape');
    s().setTool('select');
    s().setExplode(0.5);
    s().setExplode(0);
    expect(s().section).toEqual({ axis: 'front', at: 99, flip: false });
  });
  it('is cleared by replaceDocument (a project switch)', () => {
    s().setSection({ axis: 'front', at: 3, flip: false });
    s().replaceDocument(createDocument('Other'));
    expect(s().section).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/store/store.section.test.ts` — FAIL.

- [ ] **Step 3: Implement.** In `store.ts`:
  - Import `type Section` from `'../document/document'` with the other document imports.
  - In the state interface, directly after `setExplode`'s declaration (around line 280), add:

```ts
  /**
   * The viewport's section cut (section-cut spec §2.1; invariant 51): ONE axis plane, or null. View state, like
   * `hiddenIds` and `explode`: never in the document, never autosaved, no undo entry. `setSection` is its ONE writer
   * and refuses a non-finite position; nothing clamps `at` (an edit that leaves it outside the parts keeps it).
   * Reset only where `explode` is (the initial state and `replaceDocument`); undo, redo, `setTool` and Escape leave it.
   */
  section: Section | null;
  setSection: (next: Section | null) => void;
```

  - In the initial state next to `explode: 0,` (line ~877):

```ts
    section: null,
    setSection: (next) => {
      if (next !== null && !Number.isFinite(next.at)) return;
      set({ section: next });
    },
```

  - In `replaceDocument`'s `set({...})`, next to `explode: 0,` add `section: null,`.
  - `grep -n "explode: 0" src/store/store.ts` must show exactly the two places you edited; if a third reset exists,
    add `section: null` there too and say so in the commit message.

- [ ] **Step 4: Run** — PASS. Also run `npx vitest run src/store` — PASS.
- [ ] **Step 5: Mutate.** Remove `section: null` from `replaceDocument` — the switch test fails. Remove the finite
  guard — the refusal test fails. Revert.
- [ ] **Step 6: Commit** — `git add src/store && git commit -m "feat(section): store view state, one writer"`

### Task 5: Controls — Section toggle and group

**Files:**
- Modify: `src/panels/ViewportControls.tsx`, `src/panels/ViewportControls.test.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: store `section`/`setSection`/`doc`/`hiddenIds`/`explode`; `worldParts`, `sectionSpan` from
  `../document/document`; `visibleBoards` from `../store/visibility`; `explodeOffsets`, `EXPLODE_SPREAD` from
  `../document/explode`; `DimensionField` from `./DimensionField`.
- Produces: a `Section` toggle button (name "Section", `aria-pressed`) in the View group; while on, a group
  `role="group" aria-label="Section"` holding a "Section axis" segmented group (Front / Side / Top buttons,
  `aria-pressed`), a range input labelled "Section position", a `DimensionField` labelled "Position", and a "Flip" button.

- [ ] **Step 1: Write the failing tests** (append to `ViewportControls.test.tsx`)

```tsx
import { createBoard } from '../document/document';
import { formatLength } from '../units/length';

describe('ViewportControls section', () => {
  const withPart = () => {
    const doc = createDocument('Test');
    doc.boards = [createBoard({ id: 'a', length: 20, width: 6, thickness: 1.5, position: [0, 0, 0] })];
    useStore.getState().replaceDocument(doc);
  };
  it('is disabled with no parts', () => {
    renderControls();
    expect(btn('Section')).toBeDisabled();
  });
  it('turns on at the middle of the parts, seen from the front', async () => {
    withPart();
    renderControls();
    await userEvent.click(btn('Section'));
    expect(useStore.getState().section).toEqual({ axis: 'front', at: 3, flip: false });
    expect(btn('Section')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group', { name: 'Section' })).toBeInTheDocument();
  });
  it('changing axis re-centres; Flip toggles; turning off clears', async () => {
    withPart();
    renderControls();
    await userEvent.click(btn('Section'));
    await userEvent.click(btn('Section side'));   // not the standard view's Side
    expect(useStore.getState().section).toEqual({ axis: 'side', at: 10, flip: false });
    await userEvent.click(btn('Flip'));
    expect(useStore.getState().section?.flip).toBe(true);
    await userEvent.click(btn('Section'));
    expect(useStore.getState().section).toBeNull();
  });
  it('the position field refuses a value outside the parts, never clamps', async () => {
    withPart();
    renderControls();
    await userEvent.click(btn('Section'));
    const field = screen.getByLabelText('Position');
    await userEvent.clear(field);
    await userEvent.type(field, '9{Enter}');
    expect(useStore.getState().section?.at).toBe(3);
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(field);
    await userEvent.type(field, '1 1/2{Enter}');
    expect(useStore.getState().section?.at).toBe(1.5);
  });
  it('a stored position outside the span is shown, not moved', () => {
    withPart();
    act(() => useStore.getState().setSection({ axis: 'front', at: 40, flip: false }));
    renderControls();
    expect(useStore.getState().section?.at).toBe(40);
    expect((screen.getByLabelText('Position') as HTMLInputElement).value).toBe(formatLength(40));
  });
  it('with every part hidden: the group stays usable and writes no NaN', async () => {
    withPart();
    renderControls();
    await userEvent.click(btn('Section'));
    act(() => useStore.setState({ hiddenIds: ['a'] }));
    await userEvent.click(btn('Section top'));
    expect(Number.isFinite(useStore.getState().section!.at)).toBe(true);
    expect(useStore.getState().section!.axis).toBe('front');   // no span to centre on: the axis change is refused
  });
});
```

The standard-view buttons are also named Front / Side / Top, so the section axis buttons carry accessible names
"Section front", "Section side", "Section top" (`aria-label`) with visible text Front / Side / Top. If `DimensionField` passes a `precision` to `formatLength`, use the same call in the expectation.

- [ ] **Step 2: Run** `npx vitest run src/panels/ViewportControls.test.tsx` — FAIL.

- [ ] **Step 3: Implement** in `ViewportControls.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { sectionSpan, worldParts, type SectionAxis } from '../document/document';
import { explodeOffsets, EXPLODE_SPREAD } from '../document/explode';
import { visibleBoards } from '../store/visibility';
import { DimensionField } from './DimensionField';

const SECTION_AXES: readonly { axis: SectionAxis; text: string; title: string }[] = [
  { axis: 'front', text: 'Front', title: 'Cut across the depth, seen from the front' },
  { axis: 'side', text: 'Side', title: 'Cut across the width, seen from the side' },
  { axis: 'top', text: 'Top', title: 'Cut across the height, seen from above' },
];
```

Inside the component:

```tsx
  const section = useStore((s) => s.section);
  const setSection = useStore((s) => s.setSection);
  const doc = useStore((s) => s.doc);
  const hiddenIds = useStore((s) => s.hiddenIds);
  const shown = useMemo(() => visibleBoards(worldParts(doc), hiddenIds), [doc, hiddenIds]);
  const offsets = useMemo(
    () => (explode > 0 ? explodeOffsets(doc, explode * EXPLODE_SPREAD) : null),
    [doc, explode],
  );
  const spanOf = (axis: SectionAxis) => sectionSpan(shown, offsets, axis);
  const centre = (axis: SectionAxis) => { const sp = spanOf(axis); return sp ? (sp[0] + sp[1]) / 2 : null; };
  const toggleSection = () => {
    if (section) { setSection(null); return; }
    const at = centre('front');
    if (at !== null) setSection({ axis: 'front', at, flip: false });
  };
  const span = section ? spanOf(section.axis) : null;
```

In the View group, after the Grid/Origin/Guides segmented div:

```tsx
        <button aria-pressed={section !== null} onClick={toggleSection}
          disabled={section === null && centre('front') === null}
          title="Cut the model with a plane to see inside joints and holes">Section</button>
```

After the View group's closing `</div>`:

```tsx
      {section && (
        <div className="viewport-controls viewport-controls-section" role="group" aria-label="Section">
          <div className="segmented" role="group" aria-label="Section axis">
            {SECTION_AXES.map(({ axis, text, title }) => (
              <button key={axis} aria-label={`Section ${axis}`} aria-pressed={section.axis === axis} title={title}
                onClick={() => {
                  if (axis === section.axis) return;
                  const at = centre(axis);
                  if (at !== null) setSection({ ...section, axis, at });
                }}>{text}</button>
            ))}
          </div>
          <input type="range" aria-label="Section position" step="any"
            min={span ? span[0] : section.at} max={span ? span[1] : section.at} value={section.at}
            onChange={(e) => setSection({ ...section, at: Number(e.target.value) })} />
          <DimensionField label="Position" value={section.at} allowNegative
            min={span?.[0]} max={span?.[1]} onCommit={(at) => setSection({ ...section, at })} />
          <button aria-pressed={section.flip} onClick={() => setSection({ ...section, flip: !section.flip })}
            title="Keep the other side of the cut">Flip</button>
        </div>
      )}
```

Read `DimensionField`'s `min` handling with `allowNegative` before relying on it (a min may already imply negatives are
legal); keep `allowNegative` only if a negative position would otherwise be refused before the min check.

In `styles.css`, beside the `.viewport-controls-view` rule, add a position for `.viewport-controls-section` below the
View group (top-right, offset down by the View group's height; follow how `.viewport-hint` is placed bottom-left), using
surface ROLES only (`--surface`, `--rule`, `--ink`), never raw `--grey-*`/`--walnut-*` (styles.css rule). Constrain the
range input's width (e.g. `width: 10rem`) so the group never wraps at 1440 px; at phone width it may wrap.

- [ ] **Step 4: Run** the file and `npx vitest run src/panels` — PASS.
- [ ] **Step 5: Mutate.** Make the axis buttons not re-centre (`setSection({ ...section, axis })`) — the re-centre test
  fails. Drop the `at !== null` guard in the axis handler — the hidden-parts test fails (NaN or a throw). Revert.
- [ ] **Step 6: Commit** — `git commit -am "feat(section): Section toggle and controls"`

### Task 6: Viewport — clipping, caps, picking, snapping

**Files:**
- Create: `src/viewport/sectionPlane.ts`
- Modify: `src/viewport/Viewport.tsx`, `src/viewport/BoardMesh.tsx`, `src/viewport/MoveTool.tsx`,
  `src/viewport/TapeTool.tsx`

**Interfaces:**
- Consumes: store `section`; `sectionCaps`, `sectionPlaneOf`, `keptBySection`, `type Section` from
  `../document/document`.
- Produces: `SECTION_PLANES: THREE.Plane[]` (one plane), `NO_PLANES: THREE.Plane[]`, `syncSectionPlane(s: Section)`;
  BoardMesh prop `section: Section | null`.

No unit tests (viewport, by design); `npm run build` is the gate and Task 7 verifies live.

- [ ] **Step 1: The shared plane**

```ts
// src/viewport/sectionPlane.ts
import * as THREE from 'three';
import { sectionPlaneOf, type Section } from '../document/document';

/**
 * THE section plane (section-cut spec §4; invariant 51): one THREE.Plane shared by every part and edge material, so a
 * slider move changes one uniform and rebuilds nothing. Three clips the plane's NEGATIVE side.
 */
const PLANE = new THREE.Plane();
export const SECTION_PLANES: THREE.Plane[] = [PLANE];
/** A stable empty list, so a material's `clippingPlanes` prop does not change identity every render. */
export const NO_PLANES: THREE.Plane[] = [];

export function syncSectionPlane(s: Section): void {
  const { normal, constant } = sectionPlaneOf(s);
  PLANE.set(new THREE.Vector3(normal[0], normal[1], normal[2]), constant);
}
```

- [ ] **Step 2: Viewport.tsx**
  - `const section = useStore((s) => s.section);`
  - `useLayoutEffect(() => { if (section) syncSectionPlane(section); }, [section]);` (import `useLayoutEffect`).
  - On `<Canvas>` add `onCreated={({ gl }) => { gl.localClippingEnabled = true; }}` with a comment: local clipping is
    per-material and costs nothing for a material whose `clippingPlanes` is empty.
  - Pass `section={section}` to each `<BoardMesh>`.

- [ ] **Step 3: BoardMesh.tsx**
  - Add to Props: `/** The section cut, or null (invariant 51). Clips this part's materials and edges; draws its cap. */ section: Section | null;`
  - `const clip = section ? SECTION_PLANES : NO_PLANES;` — pass `clippingPlanes={clip}` AND `clipShadows` to the ghost
    `meshStandardMaterial` and every grain `meshStandardMaterial`, and `clippingPlanes={clip}` to the
    `lineBasicMaterial`. `Material.clipShadows` defaults to false: without it the removed half still casts its shadow.
    Add `clip` to nothing's key: three recompiles on a plane-count change by itself.
  - Raycast: a module-level factory
    ```ts
    /** Drops hits on the section's removed side, so a click passes through to what is drawn (invariant 51). */
    function sectionRaycast(s: Section) {
      return function (this: THREE.Mesh, rc: THREE.Raycaster, hits: THREE.Intersection[]) {
        const start = hits.length;
        THREE.Mesh.prototype.raycast.call(this, rc, hits);
        let w = start;
        for (let i = start; i < hits.length; i += 1) if (keptBySection(s, hits[i]!.point.toArray())) hits[w++] = hits[i]!;
        hits.length = w;
      };
    }
    ```
    `const raycast = useMemo(() => (section ? sectionRaycast(section) : THREE.Mesh.prototype.raycast), [section]);`
    and `raycast={raycast}` on each part `<mesh>` (never `undefined`: R3F would assign it).
  - Factor the `onClick` and `onDoubleClick` handlers into `const onClick = ...`/`const onDoubleClick = ...` above the
    return (unchanged bodies) so the cap uses the same ones.
  - The cap:
    ```ts
    const cap = useMemo(() => {
      if (!section) return null;
      const c = sectionCaps(board, section, offset);
      if (!c) return null;
      const fill: number[] = [];
      for (const poly of c.pieces) for (let k = 1; k + 1 < poly.length; k += 1) fill.push(...poly[0]!, ...poly[k]!, ...poly[k + 1]!);
      const fillGeo = new THREE.BufferGeometry();
      fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(fill, 3));
      // EXPLICIT normals (lit by meshStandardMaterial): the cap faces the removed side, −sectionPlaneOf's normal.
      // Without them the normal is zero and the lighting undefined — software GL may hide that (26a).
      const { normal } = sectionPlaneOf(section);
      const normals = new Float32Array(fill.length);
      for (let k = 0; k < normals.length; k += 3) { normals[k] = -normal[0]; normals[k + 1] = -normal[1]; normals[k + 2] = -normal[2]; }
      fillGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(c.outline.flatMap(([a, b]) => [...a, ...b]), 3));
      return { fillGeo, lineGeo };
    }, [section, offset?.[0], offset?.[1], offset?.[2], board.position[0], board.position[1], board.position[2],
        board.rotation, board.posture, extents[0], extents[1], extents[2], boardUVSignature(board)]);
    useEffect(() => () => { cap?.fillGeo.dispose(); cap?.lineGeo.dispose(); }, [cap]);
    const capColor = useMemo(() => (faded ? fadedColor : new THREE.Color(color)).clone().multiplyScalar(CAP_DARKEN), [faded, fadedColor, color]);
    ```
    Before relying on that dep list, confirm `boardUVSignature` covers every geometry input `partGeometry` reads (its
    doc comment says it includes cut, angle cut and hole rows — inv 15); position/rotation/posture are added because a
    cap, unlike the meshes, depends on where the part sits relative to the plane. A mirrored world part differs from its
    source only in fields this list already has.
    `const CAP_DARKEN = 0.62;` beside `EDGE_DARKEN`, commented "the cut face reads as end grain: darker than every face;
    real-hardware look owed (fu NEW)".
    Render, inside the `<group>`, after the edges, positioned at `-(center + offset)` (the group sits at
    `center + offset`, and the cap is already in world inches where drawn, offset included):
    ```tsx
      {cap && (
        <group position={offset
          ? [-center[0] - offset[0], -center[1] - offset[1], -center[2] - offset[2]]
          : [-center[0], -center[1], -center[2]]}>
          <mesh geometry={cap.fillGeo} onClick={onClick} onDoubleClick={onDoubleClick} renderOrder={faded ? FADED_RENDER_ORDER : 0}
            castShadow={!faded}>
            <meshStandardMaterial color={capColor} roughness={0.9} metalness={0} side={THREE.DoubleSide}
              emissive={selected ? SELECTED : '#000000'} emissiveIntensity={selected ? 0.16 : 0}
              transparent={faded} opacity={faded ? FADED_OPACITY : 1}
              polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>
          <lineSegments geometry={cap.lineGeo}>
            <lineBasicMaterial color={selected ? SELECTED : faded ? fadedEdgeColor : edgeColor}
              transparent opacity={faded ? FADED_EDGE_OPACITY : selected ? 1 : 0.8} />
          </lineSegments>
        </group>
      )}
    ```
    `castShadow` on the cap closes the kept half's shadow where the cut opened it.
    The cap's materials take NO `clippingPlanes` (it lies on the plane) and its mesh keeps three's default raycast (a
    cap hit is on the plane; the float32 position would fail a 1e-7 side test).

- [ ] **Step 4: Snap filters.** In `MoveTool.tsx` and `TapeTool.tsx`: `const section = useStore((s) => s.section);`
  and wrap each `candidates` memo's result in `.filter((p) => keptBySection(section, p.at))`, adding `section` to its
  dep list (inv 15: the deps are exactly what the memo reads). In MoveTool the filter goes around `moveCandidates(...)`;
  keep the `tool !== 'move' ? []` short-circuit outside it.

- [ ] **Step 5: Typecheck and test**

Run: `npm run build && npm test`
Expected: build clean; all tests pass (count = previous + the new section, store and controls tests).

- [ ] **Step 6: Commit** — `git add src/viewport && git commit -m "feat(section): clipping plane, caps, pass-through picking and snapping"`

### Task 7: Performance guard

**Files:** Create `src/viewport/sectionPerf.test.ts`

- [ ] **Step 1: Write the guard**, modelled on `holesPerf.test.ts` (read its header; copy `pinRow`, `rows`, `side` and
  the min-of-9 timing helper verbatim). Cases, each timing `sectionCaps(board, s)` on a FRESH geometry key per run
  (length moves by a micro-inch, as holesPerf does):
  - two shelf-pin rows (42 holes), `top` plane through the pins' depth (cut ACROSS every bore);
  - same part, `front` plane at the rows' inset (cut ALONG a row of 21 bores);
  - same part with `crossingDado`, `side` plane through the dado.
- [ ] **Step 2: Measure first.** Run each case with `expect(ms).toBeLessThan(Infinity)` and print the minima
  (`console.log`). Set each bound to about 3× the measured minimum, rounded up to 5 ms, and write the measured numbers
  into the file header, as holesPerf records its own. If any case measures above 16 ms, STOP and report: a slider drag
  recomputes this per crossed part per frame, so that needs the user's decision (first suspect `unionOutline`'s linear
  `lines.find`: key the lines in a `Map` on rounded `(dx, dy, c)`; memoising caps per geometry key and plane position is
  the next remedy — measure before adopting either).
- [ ] **Step 3: Mutate.** Temporarily build the prism without the memo (`holePrism(h, 47)` forces a fresh prism) and
  confirm the across-bores case slows measurably; revert. (If it does not, say so in the header: the guard then guards
  only the absolute budget.)
- [ ] **Step 4: Commit** — `git add src/viewport/sectionPerf.test.ts && git commit -m "test(section): cap rebuild performance guard"`

### Task 8: Live check, records, merge

- [ ] **Step 1: Dev server.** `npm run dev -- --port 5181` (the user's dev profile lives on that origin: never
  `localStorage.clear()`; delete only projects this check creates). Drive Playwright; the user watches.
- [ ] **Step 2: Check, recording each in `docs/browser-verification-section-cut.md`** (DOM readouts preferred,
  screenshots in `docs/img/` where spatial):
  1. Shaker Side Table — joined: Section on (Front), slide through a leg's mortise: tenons and mortises read as caps
     with outlines, no seam lines across a leg.
  2. A new test project: a drilled side (Holes → Shelf-pin row), cut Top through the pins (round voids) and Front along
     a row (notches).
  3. Click a part on the removed side through empty space: selects what is behind / nothing. Click a cap: selects its
     part.
  4. Move and Tape: markers appear only on the kept side.
  5. Explode 50%, with the cut axis the one the parts explode along (Top): every cap sits ON its part's cut, not
     floating off it.
  5a. Shadows: the removed half casts no shadow; the kept half's shadow is closed (no light through the cut).
  5b. Caps are lit like a face (not black, not noisy) from Front, Side, Top and Iso — real-hardware look still owed.
  6. Save image: the PNG contains the section.
  7. Type the exact shoulder position of a dado on the drilled side: solid, not hollow.
  8. Edit the part (resize) while sectioned: caps follow, `at` unchanged.
  Delete the test project afterwards and confirm only it is gone.
- [ ] **Step 3: Records.**
  - `docs/follow-ups.md`: next free numbers (read the file's tail; it ends at 346) for: snap points on caps; cap colour
    and z-fighting owed a real-hardware look (26a); Plans-sheet section views (link fu 256); any residue found.
  - `CLAUDE.md`: add invariant 51 (spec §5 text, condensed); add `section.ts` to "Where things live"; Status and the
    Rounds table only after deploy (Status says production state).
  - `docs/feature-gaps.md` §2 Section cut row: status "merged 2026-10-14 (section cut)".
  - `docs/history.md`: the round's narrative, including the seam-cap amendment and the perf numbers.
- [ ] **Step 4: Final review, then merge** (after the user approves the live check):

```bash
git checkout master && git merge --no-ff section-cut -m "Merge section cut" && npm run build && npm test && git branch -d section-cut
```

Deploy only on the user's word (`DEPLOYMENT.local.md`); no schema change, so rollback is free.
