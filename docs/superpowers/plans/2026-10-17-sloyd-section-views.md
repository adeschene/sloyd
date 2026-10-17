# Section Views on the Plans Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the viewport's Section is on, the Plans sheet marks the cut on the piece's trio and adds a hatched
"Section A–A" drawing of the assembled piece after it.

**Architecture:**
- `drawView` gains a `section` option. It clips every segment and every occluder to the kept half-space, inside the ONE
  hidden-line pass, and returns the parts' caps from `sectionCaps`, projected.
- A new pure module, `document/sectionView.ts`, owns:
  - the section's view (mirrored when flipped);
  - its title;
  - the cutting line;
  - the hatch assignment.
- `PlanFigure.tsx` draws the marker on the piece trio and a `SectionBlock`. `PlansSheet.tsx` reads the store's
  `section`.

**Tech Stack:** TypeScript, React 18, Vitest + Testing Library, SVG.

**Spec:** `docs/superpowers/specs/2026-10-17-sloyd-section-views-design.md`

## Global Constraints

- Work on branch `section-views`. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No
  pull request: `git merge --no-ff` into master after `npm run build` and the full `npm test` pass on the merged tree.
  Then delete the branch.
- **A sheet with no section is byte-for-byte unchanged.** `drawView` without `opts.section` returns no `caps` key, and
  `drawingIdentity.test.ts`'s hashes must not move.
- Caps come ONLY from `sectionCaps` (inv 51). Lines come only from `boardEdges`, hole lines and silhouettes (inv 47/16).
  No second visibility routine.
- The side test is `keptBySection`'s: kept where `p[k] − at ≤ SECTION_EPS` (flipped: `≥ −SECTION_EPS`), with
  `SECTION_EPS = 1e-7`.
- The section is always of the ASSEMBLED piece: the sheet never passes explode offsets to it.
- No dimensions, balloons or feature tags on the section. No hidden lines are drawn in it.
- Title: `Section A–A — <Front|Side|Plan> cut <formatLength(at − piece min, units)> from the <back|left|bottom>,
  looking <toward the back|toward the front / toward the left|toward the right / down|up>`.
- No-wood line: `Section A–A: the cut meets no part of the assembled piece.`
- Explode note: `Cut through the assembled piece at the viewport's position.`
- Hatches: 45°, 135°, 45° wide, 135° wide. The gaps are 4 and 8 SVG user units (≈ 3 and 6 px at print width).
- The viewport (`src/viewport/`) is untouched.

## Review Focus

1. **A plane lying exactly on a part's face.** The part is drawn whole, its face is capped, and a zero-thickness
   occluder is dropped. Pinned in Task 1, Step 1, "a cut on a face".
2. **The viewport exploded while the sheet draws assembled.** Caps come from the assembled piece, never from the
   exploded coordinates of a part. Pinned in Task 4, Step 1, "cuts the assembled piece while the viewport is exploded".
3. **A turned or angled part** (planes bodies, a taper, a miter) cut across. No visible line passes the plane, and the
   clipped body still occludes. Pinned in Task 1, Step 1, "angled and curved parts".
4. **A metric project.** The title reads whole mm. Pinned in Task 2, Step 1.
5. **A sheet with many parts.** One extra `drawView` and the caps stay cheap. Measured in Task 4, Step 6, with no
   budget.

---

### Task 1: `drawView` with a section

**Files:**
- Modify: `src/document/drawing.ts` (imports; `Drawing`; `drawView`, lines 199–300)
- Test: `src/document/drawingSection.test.ts` (create)

**Interfaces:**
- Consumes:
  - `sectionCaps(board, s, offset?)`, `keptBySection`, `sectionAxisIndex`, `SECTION_EPS` and `Section` from
    `./section`. They exist; `section.ts` does not import `drawing.ts`, so there is no cycle.
- Produces:
  - `export interface CapDrawing { part: string; polys: P2[][]; outline: Seg2[] }`
  - `Drawing` gains `caps?: CapDrawing[]`. It is present only when a section was given.
  - `drawView(parts, view, offsets?, opts: { hiddenLines?: boolean; section?: Section } = {})`

- [ ] **Step 1: Write the failing tests**

Create `src/document/drawingSection.test.ts`:

```ts
import { createBoard, defaultHole } from './document';
import type { Board } from './types';
import { ARCH } from './curveFixtures';
import { chiralAngled } from './turnFixtures';
import { boardExtents } from './geometry';
import { drawView, FRONT, SIDE, TOP, type Seg2, type P2 } from './drawing';
import type { Section } from './section';

const len = (s: Seg2) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
const total = (segs: Seg2[], part?: string) =>
  segs.filter((s) => part === undefined || s.part === part).reduce((n, s) => n + len(s), 0);
const area = (polys: P2[][]) => polys.reduce((sum, p) => {
  let a = 0;
  for (let i = 0; i < p.length; i += 1) { const [x0, y0] = p[i]!; const [x1, y1] = p[(i + 1) % p.length]!; a += x0 * y1 - x1 * y0; }
  return sum + Math.abs(a) / 2;
}, 0);
// Flat at turn 0: length on X, thickness on Y (up), width on Z.
const box = (id: string, length: number, width: number, thickness: number, position: [number, number, number] = [0, 0, 0], extra: Partial<Board> = {}) =>
  createBoard({ id, name: id, length, width, thickness, position, ...extra });

describe('drawView with a section', () => {
  it('without a section the drawing carries no caps key (the identity hash holds)', () => {
    expect('caps' in drawView([box('b', 10, 4, 2)], FRONT)).toBe(false);
    expect('caps' in drawView([box('b', 10, 4, 2)], FRONT, undefined, {})).toBe(false);
  });

  it('keeps exactly the kept part of each crossing edge and drops the removed edges', () => {
    // X 0..10, Y 0..2, Z 0..4; cut at x = 4. Front view: X-edges 4 + 4 kept, the x = 0 Y-edge (2) kept, x = 10 gone.
    const b = box('b', 10, 4, 2);
    const kept = drawView([b], FRONT, undefined, { section: { axis: 'side', at: 4, flip: false } });
    expect(total(kept.visible)).toBeCloseTo(10, 9);
    expect(total(kept.hidden)).toBeCloseTo(10, 9);
    expect(kept.bounds).toEqual({ min: [0, 0], max: [4, 2] });
    const flipped = drawView([b], FRONT, undefined, { section: { axis: 'side', at: 4, flip: true } });
    expect(total(flipped.visible)).toBeCloseTo(14, 9);
    expect(flipped.bounds).toEqual({ min: [4, 0], max: [10, 2] });
  });

  it('a part on the removed side no longer hides; a kept part still does', () => {
    // R: X 0..10, Y 0..2, Z 0..4. F: X 3..7, Y 0..2, Z 10..11, in front. Unsectioned, F hides 8 of R's front edges.
    const R = box('R', 10, 4, 2);
    const F = box('F', 4, 1, 2, [3, 0, 10]);
    const away = drawView([R, F], FRONT, undefined, { section: { axis: 'front', at: 5, flip: false } });
    expect(total(away.hidden, 'R')).toBeCloseTo(24, 5);
    expect(total(away.visible, 'R')).toBeCloseTo(24, 5);
    expect(total(away.visible, 'F') + total(away.hidden, 'F')).toBe(0);
    const through = drawView([R, F], FRONT, undefined, { section: { axis: 'front', at: 10.5, flip: false } });
    expect(total(through.hidden, 'R')).toBeCloseTo(32, 5);
  });

  it('an angled (planes) body on the removed side no longer hides', () => {
    const A = { ...chiralAngled('upright'), id: 'A' };
    const ext = boardExtents(A);
    const R = box('R', ext[0], 4, ext[1], [A.position[0], A.position[1], A.position[2] - 10]);
    const s: Section = { axis: 'front', at: A.position[2] - 1, flip: false };
    const cut = drawView([R, A], FRONT, undefined, { section: s });
    const alone = drawView([R], FRONT);
    expect(total(cut.visible, 'R')).toBeCloseTo(total(alone.visible, 'R'), 6);
    // Unsectioned, A hides some of R: the comparison above can fail.
    expect(total(drawView([R, A], FRONT).visible, 'R')).toBeLessThan(total(alone.visible, 'R') - 1e-3);
  });

  it('a cut on a face draws the part whole and caps that face', () => {
    // Z 0..11.25; the plane at the front face, keeping z <= 11.25: nothing removed.
    const b = box('b', 30, 11.25, 0.75);
    const d = drawView([b], FRONT, undefined, { section: { axis: 'front', at: 11.25, flip: false } });
    expect(total(d.visible)).toBeCloseTo(total(drawView([b], FRONT).visible), 9);
    expect(d.caps).toHaveLength(1);
    expect(area(d.caps![0]!.polys)).toBeCloseTo(30 * 0.75, 6);
  });

  it('caps a dadoed part with its notch, and gives no cap to a part the plane misses', () => {
    const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    const side = box('side', 30, 11.25, 0.75, [0, 0, 0], { cuts: [dado] });
    const far = box('far', 5, 5, 1, [0, 0, 40]);
    const d = drawView([side, far], FRONT, undefined, { section: { axis: 'front', at: 5, flip: false } });
    expect(d.caps!.map((c) => c.part)).toEqual(['side']);
    // 30 x 0.75 less the 0.75 x 0.25 groove; perimeter 30 + .75 + .75 + 10 + 19.25 + 2(.25) + .75 = 62.
    expect(area(d.caps![0]!.polys)).toBeCloseTo(22.5 - 0.1875, 6);
    expect(total(d.caps![0]!.outline)).toBeCloseTo(62, 6);
  });

  it('a through bore reads as a ring across its axis and as a slot along it', () => {
    const base = box('p', 30, 5, 0.75);
    const plate = { ...base, holes: [{ id: 'h', ...defaultHole(base), depth: 'through' as const }] };
    // The bore runs along Y at x = 15, z = 2.5, diameter 1/4.
    const across = drawView([plate], TOP, undefined, { section: { axis: 'top', at: 0.3, flip: false } });
    expect(area(across.caps![0]!.polys)).toBeCloseTo(150 - Math.PI * 0.125 ** 2, 2);
    expect(total(across.caps![0]!.outline)).toBeGreaterThan(2 * (30 + 5) + 0.7);
    const along = drawView([plate], FRONT, undefined, { section: { axis: 'front', at: 2.5, flip: false } });
    expect(area(along.caps![0]!.polys)).toBeCloseTo(30 * 0.75 - 0.25 * 0.75, 2);
  });

  it('angled and curved parts: no visible line passes the plane, and some end on it', () => {
    const angled = { ...chiralAngled('upright'), id: 'ang', position: [0, 0, 0] as [number, number, number] };
    const apron = box('a', 30, 5, 0.75, [0, 0, 0], { curves: [ARCH] });
    for (const [part, tol] of [[angled, 1e-6], [apron, 0.005]] as const) {
      const at = part.position[0] + boardExtents(part)[0] / 2;
      for (const view of [FRONT, TOP]) {
        // FRONT and TOP both have right = +X, so screen x is world x.
        const d = drawView([part], view, undefined, { section: { axis: 'side', at, flip: false } });
        const xs = d.visible.flatMap((s) => [s.a[0], s.b[0]]);
        expect(Math.max(...xs)).toBeLessThanOrEqual(at + tol);
        expect(Math.max(...xs)).toBeGreaterThan(at - tol);
      }
    }
  });

  it('applies offsets to lines and caps alike (the viewport frame), so the sheet must pass none', () => {
    const b = box('b', 10, 4, 2);
    const off = new Map([['b', [0, 0, 20] as [number, number, number]]]);
    const d = drawView([b], SIDE, off, { section: { axis: 'front', at: 22, flip: false } });
    expect(d.caps).toHaveLength(1);
    expect(drawView([b], SIDE, undefined, { section: { axis: 'front', at: 22, flip: false } }).caps).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/document/drawingSection.test.ts`
Expected: the first test PASSES (no caps key today). Every other test FAILS: `section` is ignored, so totals are
unclipped and `d.caps` is undefined.

- [ ] **Step 3: Implement**

In `src/document/drawing.ts`:

1. Add the import:

```ts
import { sectionAxisIndex, sectionCaps, SECTION_EPS, type Section } from './section';
```

2. Replace the `Drawing` interface (line 38):

```ts
/** A part's section cap on paper (section views spec §3.1): the cut faces' pieces, projected, and their outline. */
export interface CapDrawing { part: string; polys: P2[][]; outline: Seg2[] }
/** `caps`: present only when drawn with a section, so a section-less drawing is byte-for-byte what it was. */
export interface Drawing { visible: Seg2[]; hidden: Seg2[]; bounds: { min: P2; max: P2 }; caps?: CapDrawing[] }
```

3. Add these helpers above `drawView`:

```ts
/** The part of a box on `s`'s kept side, or null when less than SECTION_EPS of it is kept (a face on the plane). */
function keptBox(bx: { min: Vec3; max: Vec3 }, s: Section): { min: Vec3; max: Vec3 } | null {
  const k = sectionAxisIndex(s.axis);
  const min = [...bx.min] as Vec3;
  const max = [...bx.max] as Vec3;
  if (s.flip) min[k] = Math.max(min[k], s.at);
  else max[k] = Math.min(max[k], s.at);
  return max[k] - min[k] > SECTION_EPS ? { min, max } : null;
}

/** The kept side of `s` as one more inside half-space m·x + c >= 0, |m| = 1. */
function keptHalf(s: Section): { m: Vec3; c: number } {
  const m: Vec3 = [0, 0, 0];
  m[sectionAxisIndex(s.axis)] = s.flip ? 1 : -1;
  return { m, c: s.flip ? -s.at : s.at };
}

/** The chord-parameter range of A→E on `s`'s kept side (keptBySection's test), or null when none of it is kept. */
function keptRange(A: Vec3, E: Vec3, s: Section): [number, number] | null {
  const k = sectionAxisIndex(s.axis);
  const sg = s.flip ? -1 : 1;
  const fa = sg * (A[k] - s.at);
  const fe = sg * (E[k] - s.at);
  const inA = fa <= SECTION_EPS;
  const inE = fe <= SECTION_EPS;
  if (inA && inE) return [0, 1];
  if (!inA && !inE) return null;
  const t = Math.min(1, Math.max(0, fa / (fa - fe)));
  return inA ? [0, t] : [t, 1];
}
```

4. In `drawView`:
   - Change the signature to `opts: { hiddenLines?: boolean; section?: Section } = {}` and add
     `const section = opts.section;`.
   - Change the empty return to
     `return section ? { visible, hidden, bounds: { min: [0, 0], max: [0, 0] }, caps: [] } : { visible, hidden, bounds: { min: [0, 0], max: [0, 0] } };`.
   - Compute bounds from the kept boxes. Keep `boxes` (all parts) for `lo`/`hi`/`sMax` exactly as today:

```ts
  const boxes = parts.map((b) => boardBox(b, offsets?.get(b.id)));
  const drawn = section ? boxes.flatMap((bx) => keptBox(bx, section) ?? []) : boxes;
  const screen = drawn.flatMap((bx) => corners(bx).map(proj));
  const bounds = screen.length === 0 ? { min: [0, 0] as P2, max: [0, 0] as P2 } : {
    min: [Math.min(...screen.map((p) => p[0])), Math.min(...screen.map((p) => p[1]))] as P2,
    max: [Math.max(...screen.map((p) => p[0])), Math.max(...screen.map((p) => p[1]))] as P2,
  };
```

   - Replace the `solids` builder so each body is clipped:

```ts
  const solids = parts.flatMap((b) => {
    const off = offsets?.get(b.id);
    return worldBodies(b).flatMap((w) => {
      let bx = w.box ? { min: plus(w.box.min, off), max: plus(w.box.max, off) } : null;
      let planes = w.box ? null : w.planes.map(({ m, c }) => ({ m, c: c - dot(m, off ?? [0, 0, 0]) }));
      if (section) {
        // Section views spec §3.1: an occluder is only its kept wood. A box stays a box; a planes body gains the plane.
        if (bx) { bx = keptBox(bx, section); if (!bx) return []; }
        else planes = [...planes!, keptHalf(section)];
      }
      // The prefilter reads the clipped box, or the unclipped vertices (conservative: it only skips work).
      const pts = bx ? corners(bx) : w.verts.map((p) => plus(p, off));
      const sp = pts.map(proj);
      return [{
        bx, planes,
        rmin: [Math.min(...sp.map((p) => p[0])), Math.min(...sp.map((p) => p[1]))],
        rmax: [Math.max(...sp.map((p) => p[0])), Math.max(...sp.map((p) => p[1]))],
        depthMax: Math.max(...pts.map((p) => dot(p, view.toward))),
      }];
    });
  });
```

   - In the segment loop, after `if (length < DRAW_EPS) continue;`, add:

```ts
      const range = section ? keptRange(A, E, section) : null;
      if (section && !range) continue;
      const [t0, t1] = range ?? [0, 1];
```

   - Replace the final span walk (`let cur = 0; … push(visible, cur, 1);`) with the following. With `t0 = 0` and
     `t1 = 1` it is the old walk: `hiddenSpan`'s spans lie in [0, 1] with `s1 > s0`.

```ts
      let cur = t0;
      for (const [s0, s1] of merged) {
        const h0 = Math.max(s0, t0);
        const h1 = Math.min(s1, t1);
        if (h1 <= h0) continue;
        push(visible, cur, Math.max(cur, h0));
        push(hidden, h0, h1);
        cur = Math.max(cur, h1);
      }
      push(visible, cur, t1);
```

   - Replace `return { visible, hidden, bounds };` with:

```ts
  if (!section) return { visible, hidden, bounds };
  // The caps (invariant 51): only from sectionCaps, projected. They lie on the plane, in front of everything kept.
  const caps: CapDrawing[] = [];
  for (const b of parts) {
    const cap = sectionCaps(b, section, offsets?.get(b.id));
    if (!cap || cap.pieces.length === 0) continue;
    caps.push({
      part: b.id,
      polys: cap.pieces.map((poly) => poly.map(proj)),
      outline: cap.outline.map(([p, q]) => ({ a: proj(p), b: proj(q), part: b.id })),
    });
  }
  return { visible, hidden, bounds, caps };
```

   - Add one sentence to `drawView`'s doc comment: `With opts.section (section views spec §3.1), every line and
     occluder is clipped to the kept half-space and the caps are returned.`

- [ ] **Step 4: Run the tests to verify they pass, with identity held**

Run: `npx vitest run src/document/drawingSection.test.ts src/document/drawingIdentity.test.ts src/document/drawing.test.ts src/document/section.test.ts`
Expected: all PASS. The identity hashes are unchanged.

- [ ] **Step 5: Mutate**

Apply each mutation, run `npx vitest run src/document/drawingSection.test.ts`, confirm the named test FAILS, then
revert:
- In `keptRange`, `const sg = s.flip ? 1 : -1;`. "keeps exactly the kept part" fails.
- In the solids builder, delete the `if (section) { … }` block. "a part on the removed side" and "an angled (planes)
  body" fail.
- Delete only the `else planes = …` line. "an angled (planes) body" fails.
- Compute `bounds` from `boxes` instead of `drawn`. The `bounds` expectations in "keeps exactly the kept part"
  fail.

- [ ] **Step 6: Commit**

```bash
git add src/document/drawing.ts src/document/drawingSection.test.ts
git commit -m "drawView: a section option clips lines and occluders to the kept side and returns the caps (fu 256)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `document/sectionView.ts`

**Files:**
- Create: `src/document/sectionView.ts`
- Test: `src/document/sectionView.test.ts`

**Interfaces:**
- Consumes:
  - `FRONT`, `SIDE`, `TOP`, `DRAW_EPS`, `View`, `Drawing`, `P2`, `CapDrawing` from `./drawing` (Task 1);
  - `sectionAxisIndex`, `Section` from `./section`;
  - `boardsBounds` from `./geometry`;
  - `formatLength`, `Units` from `../units/length`. This is an allowed `→ units` edge: the title is a string a
    person reads.
- Produces:
  - `sectionViewOf(s: Section): View`
  - `markedView(s: Section): 'front' | 'top'`
  - `sectionTitle(s: Section, parts: readonly Board[], units: Units): string`
  - `interface CuttingLine { a: P2; b: P2; sight: P2 }`
  - `cuttingLine(s: Section, view: View, d: Drawing): CuttingLine | null`
  - `type Hatch = 0 | 1 | 2 | 3`
  - `HATCHES: readonly { angle: number; gap: number }[]`
  - `hatchPatterns(caps: readonly CapDrawing[]): Map<string, Hatch>`

- [ ] **Step 1: Write the failing tests**

Create `src/document/sectionView.test.ts`:

```ts
import { createBoard } from './document';
import { IMPERIAL, type Units } from '../units/length';
import { drawView, FRONT, SIDE, TOP, type View } from './drawing';
import type { Section } from './section';
import { cuttingLine, hatchPatterns, markedView, sectionTitle, sectionViewOf } from './sectionView';

const METRIC: Units = { display: 'metric-mm', precision: 16 } as Units;
const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const close = (a: readonly number[], b: readonly number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 12));
const box = (id: string, length: number, width: number, thickness: number, position: [number, number, number] = [0, 0, 0]) =>
  createBoard({ id, name: id, length, width, thickness, position });

describe('sectionViewOf', () => {
  it('is the standard view unflipped', () => {
    expect(sectionViewOf({ axis: 'front', at: 0, flip: false })).toBe(FRONT);
    expect(sectionViewOf({ axis: 'side', at: 0, flip: false })).toBe(SIDE);
    expect(sectionViewOf({ axis: 'top', at: 0, flip: false })).toBe(TOP);
  });
  it.each([
    ['front', 'Back', [0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ['side', 'Left side', [-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    ['top', 'Underside', [0, -1, 0], [1, 0, 0], [0, 0, 1]],
  ] as const)('flipped %s is the proper opposite view %s', (axis, title, toward, right, up) => {
    const v: View = sectionViewOf({ axis, at: 0, flip: true });
    expect(v.title).toBe(title);
    close(v.toward, toward); close(v.right, right); close(v.up, up);
    close(cross([...v.right], [...v.up]), [...v.toward]);
  });
  it('every standard view is proper too (the table agrees with drawing.ts)', () => {
    for (const v of [FRONT, SIDE, TOP]) close(cross([...v.right], [...v.up]), [...v.toward]);
  });
});

describe('markedView', () => {
  it('marks the Plan for a Front or Side cut and the Front for a Top cut', () => {
    expect(markedView({ axis: 'front', at: 0, flip: false })).toBe('top');
    expect(markedView({ axis: 'side', at: 0, flip: true })).toBe('top');
    expect(markedView({ axis: 'top', at: 0, flip: false })).toBe('front');
  });
});

describe('sectionTitle', () => {
  // Flat 30 x 11.25 x 0.75 at (2, 1, 3): X 2..32, Y 1..1.75, Z 3..14.25.
  const parts = [box('b', 30, 11.25, 0.75, [2, 1, 3])];
  it.each([
    [{ axis: 'front', at: 10.5, flip: false }, 'Section A–A — Front cut 7-1/2" from the back, looking toward the back'],
    [{ axis: 'front', at: 10.5, flip: true }, 'Section A–A — Front cut 7-1/2" from the back, looking toward the front'],
    [{ axis: 'side', at: 17, flip: false }, 'Section A–A — Side cut 15" from the left, looking toward the left'],
    [{ axis: 'side', at: 17, flip: true }, 'Section A–A — Side cut 15" from the left, looking toward the right'],
    [{ axis: 'top', at: 1.5, flip: false }, 'Section A–A — Plan cut 1/2" from the bottom, looking down'],
    [{ axis: 'top', at: 1.5, flip: true }, 'Section A–A — Plan cut 1/2" from the bottom, looking up'],
  ] as [Section, string][])('%o', (s, title) => {
    expect(sectionTitle(s, parts, IMPERIAL)).toBe(title);
  });
  it('reads whole mm in a metric project', () => {
    expect(sectionTitle({ axis: 'front', at: 10.5, flip: false }, parts, METRIC))
      .toBe('Section A–A — Front cut 191 mm from the back, looking toward the back');
  });
});

describe('cuttingLine', () => {
  const parts = [box('b', 30, 11.25, 0.75)];
  it('a Front cut is a horizontal line across the Plan at -at, sight toward the back (up the page)', () => {
    const d = drawView(parts, TOP);
    const line = cuttingLine({ axis: 'front', at: 5, flip: false }, TOP, d)!;
    expect(line.a).toEqual([0, -5]);
    expect(line.b).toEqual([30, -5]);
    close(line.sight, [0, 1]);
    close(cuttingLine({ axis: 'front', at: 5, flip: true }, TOP, d)!.sight, [0, -1]);
  });
  it('a Side cut is a vertical line across the Plan, sight toward the left', () => {
    const d = drawView(parts, TOP);
    const line = cuttingLine({ axis: 'side', at: 12, flip: false }, TOP, d)!;
    expect(line.a).toEqual([12, -11.25]);
    expect(line.b).toEqual([12, 0]);
    close(line.sight, [-1, 0]);
  });
  it('a Top cut is a horizontal line across the Front, sight down', () => {
    const d = drawView(parts, FRONT);
    const line = cuttingLine({ axis: 'top', at: 0.5, flip: false }, FRONT, d)!;
    expect(line.a).toEqual([0, 0.5]);
    expect(line.b).toEqual([30, 0.5]);
    close(line.sight, [0, -1]);
  });
  it('is null for a view that looks across the plane', () => {
    expect(cuttingLine({ axis: 'front', at: 5, flip: false }, FRONT, drawView(parts, FRONT))).toBeNull();
  });
});

describe('hatchPatterns', () => {
  const caps = (boxes: ReturnType<typeof box>[]) =>
    drawView(boxes, FRONT, undefined, { section: { axis: 'front', at: 1, flip: false } }).caps!;
  it('touching caps differ; a third touching both takes the third pattern; apart caps may repeat', () => {
    // Front cut through flat boards (thickness on Y): A X 0..2, B X 2..4 side by side; C across both on top; D apart.
    const A = box('A', 2, 4, 1);
    const B = box('B', 2, 4, 1, [2, 0, 0]);
    const C = box('C', 4, 4, 1, [0, 1, 0]);
    const D = box('D', 2, 4, 1, [20, 0, 0]);
    const h = hatchPatterns(caps([A, B, C, D]));
    expect(h.get('A')).toBe(0);
    expect(h.get('B')).toBe(1);
    expect(h.get('C')).toBe(2);
    expect(h.get('D')).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/document/sectionView.test.ts`
Expected: FAIL, because `./sectionView` does not exist.

- [ ] **Step 3: Implement**

Create `src/document/sectionView.ts`:

```ts
import type { Board } from './types';
import type { Vec3 } from './frames';
import { boardsBounds } from './geometry';
import { DRAW_EPS, FRONT, SIDE, TOP, type CapDrawing, type Drawing, type P2, type Seg2, type View } from './drawing';
import { sectionAxisIndex, type Section, type SectionAxis } from './section';
import { formatLength, type Units } from '../units/length';

/** Section views on the Plans sheet (section views spec §2.3–2.4): the view, title, cutting line and hatches. Pure. */

const STANDARD: Readonly<Record<SectionAxis, View>> = { front: FRONT, side: SIDE, top: TOP };
const OPPOSITE: Readonly<Record<SectionAxis, string>> = { front: 'Back', side: 'Left side', top: 'Underside' };
/** Negation without -0, so the views compare cleanly. */
const neg = (v: readonly number[]): Vec3 => [v[0] === 0 ? 0 : -v[0]!, v[1] === 0 ? 0 : -v[1]!, v[2] === 0 ? 0 : -v[2]!];

/** Seen from the removed side into the kept wood: the standard view, or (flipped) its proper opposite (right × up = toward). */
export function sectionViewOf(s: Section): View {
  const v = STANDARD[s.axis];
  if (!s.flip) return v;
  return s.axis === 'top'
    ? { ...v, toward: neg(v.toward), up: neg(v.up), title: OPPOSITE.top }
    : { ...v, toward: neg(v.toward), right: neg(v.right), title: OPPOSITE[s.axis] };
}

/** The ONE elevation that carries the cutting line (spec §2.4): one that sees the plane edge-on. */
export function markedView(s: Section): 'front' | 'top' {
  return s.axis === 'top' ? 'front' : 'top';
}

const AXIS_WORD: Readonly<Record<SectionAxis, string>> = { front: 'Front', side: 'Side', top: 'Plan' };
const REFERENCE: Readonly<Record<SectionAxis, string>> = { front: 'back', side: 'left', top: 'bottom' };
const LOOKING: Readonly<Record<SectionAxis, readonly [string, string]>> = {
  front: ['toward the back', 'toward the front'], side: ['toward the left', 'toward the right'], top: ['down', 'up'],
};

/** The section's heading (spec §2.3): measured from the assembled piece's own min along the axis — paper has no origin. */
export function sectionTitle(s: Section, parts: readonly Board[], units: Units): string {
  const k = sectionAxisIndex(s.axis);
  const lo = boardsBounds(parts)?.min[k] ?? 0;
  return `Section A–A — ${AXIS_WORD[s.axis]} cut ${formatLength(s.at - lo, units)} from the ${REFERENCE[s.axis]}, looking ${LOOKING[s.axis][s.flip ? 1 : 0]}`;
}

export interface CuttingLine { a: P2; b: P2; sight: P2 }
const dot = (p: readonly number[], v: readonly number[]) => p[0]! * v[0]! + p[1]! * v[1]! + p[2]! * v[2]!;

/** The cutting line across `view`'s drawing `d` (drawing coordinates, before the panel's overrun) and the unit direction
 *  of sight in that view (−toward of the section's view), or null when `view` does not see the plane edge-on. */
export function cuttingLine(s: Section, view: View, d: Drawing): CuttingLine | null {
  const k = sectionAxisIndex(s.axis);
  if (Math.abs(view.toward[k]!) > DRAW_EPS) return null;
  const sv = sectionViewOf(s);
  const sight: P2 = [-dot(sv.toward, view.right) || 0, -dot(sv.toward, view.up) || 0];
  if (Math.abs(view.right[k]!) > DRAW_EPS) {
    const x = s.at * view.right[k]!;
    return { a: [x, d.bounds.min[1]], b: [x, d.bounds.max[1]], sight };
  }
  const y = s.at * view.up[k]!;
  return { a: [d.bounds.min[0], y], b: [d.bounds.max[0], y], sight };
}

export type Hatch = 0 | 1 | 2 | 3;
/** SVG user units (≈ 0.72 px at print width): 4 ≈ 3 px, 8 ≈ 6 px. */
export const HATCHES: readonly { angle: number; gap: number }[] = [
  { angle: 45, gap: 4 }, { angle: 135, gap: 4 }, { angle: 45, gap: 8 }, { angle: 135, gap: 8 },
];

const onSeg = (p: P2, s: Seg2) => {
  const dx = s.b[0] - s.a[0];
  const dy = s.b[1] - s.a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dy) / l2));
  return Math.hypot(p[0] - (s.a[0] + t * dx), p[1] - (s.a[1] + t * dy)) <= DRAW_EPS;
};
const touching = (x: CapDrawing, y: CapDrawing) =>
  x.outline.some((s) => y.outline.some((t) => onSeg(s.a, t) || onSeg(s.b, t) || onSeg(t.a, s) || onSeg(t.b, s)));

/** One hatch per part (spec §2.3): in drawing order, the first its touching neighbours have not used (four never run
 *  out on rectangular parts; a fifth falls back to the first — a recorded residue). */
export function hatchPatterns(caps: readonly CapDrawing[]): Map<string, Hatch> {
  const out = new Map<string, Hatch>();
  caps.forEach((c, i) => {
    const used = new Set(caps.slice(0, i).filter((o) => touching(c, o)).map((o) => out.get(o.part)));
    out.set(c.part, ([0, 1, 2, 3] as const).find((n) => !used.has(n)) ?? 0);
  });
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/document/sectionView.test.ts`
Expected: PASS. If a `cuttingLine` expectation for `a`/`b` fails only on `-0` vs `0`, the code is wrong, not the test:
normalise with `|| 0` in `cuttingLine`.

- [ ] **Step 5: Mutate**

Apply each, confirm the failure, then revert:
- `touching` returns `false`. The hatch test fails (B gets 0).
- `LOOKING[s.axis][s.flip ? 0 : 1]`. The title tests fail.
- `sight` without the leading minus signs. The cutting-line sight tests fail.

- [ ] **Step 6: Commit**

```bash
git add src/document/sectionView.ts src/document/sectionView.test.ts
git commit -m "sectionView: the section's view, title, cutting line and hatches (fu 256)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The marker on the trio and the section block (`PlanFigure.tsx`, CSS)

**Files:**
- Modify: `src/panels/PlanFigure.tsx`
- Modify: `src/styles.css` (after `.plans-key-tag`, line ~1260; the print block near line 1407)
- Test: `src/panels/PlanFigure.test.tsx`

**Interfaces:**
- Consumes:
  - from Task 1: `drawView(…, { hiddenLines: false, section })`, `Drawing.caps`;
  - from Task 2: `sectionViewOf`, `markedView`, `cuttingLine`, `sectionTitle`, `hatchPatterns`, `HATCHES`;
  - `Section` from `../document/section`.
- Produces:
  - `trioScale(parts: readonly Board[]): number` (the piece trio's scale, from cached drawings);
  - `PlanTrio` gains the prop `section?: Section | null`;
  - `SectionBlock({ parts, section, units, scale, exploded }: { parts: readonly Board[]; section: Section; units: Units; scale: number; exploded: boolean })`,
    which renders a whole `<section className="plans-section">`.

**Ruling (spec §3.3 amended):** the spec had `PlanTrio` render the section as a sibling. Instead, `PlansSheet` renders
`SectionBlock` as its own `plans-section`, so it gets its own heading and its own `break-inside: avoid` page block. The
scale is shared through `trioScale`, which reads the trio's drawings from a WeakMap keyed on the `parts` array, the
same array `PlanTrio` uses. No drawing is done twice.

- [ ] **Step 1: Write the failing tests**

Append to `src/panels/PlanFigure.test.tsx`. Merge the imports into the file's import lines:

```ts
import { PlanTrio, ExplodedFigure, pathOf, SectionBlock, trioScale } from './PlanFigure';
```

```ts
describe('section views (fu 256)', () => {
  const shelf = createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75 });
  const metric = { display: 'metric-mm', precision: 16 } as typeof IMPERIAL;

  it('PlanTrio marks the cut on the Plan for a Front cut and on the Front for a Top cut, once', () => {
    const front = render(<PlanTrio parts={[shelf]} units={IMPERIAL} label="P" section={{ axis: 'front', at: 5, flip: false }} />);
    const marks = front.container.querySelectorAll('.plans-cut-mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toHaveAttribute('data-view', 'Plan');
    expect([...marks[0]!.querySelectorAll('text')].map((t) => t.textContent)).toEqual(['A', 'A']);
    front.unmount();
    const top = render(<PlanTrio parts={[shelf]} units={IMPERIAL} label="P" section={{ axis: 'top', at: 0.5, flip: false }} />);
    expect(top.container.querySelector('.plans-cut-mark')).toHaveAttribute('data-view', 'Front');
  });

  it('PlanTrio without a section draws no marker', () => {
    const { container } = render(<PlanTrio parts={[shelf]} units={IMPERIAL} label="P" />);
    expect(container.querySelector('.plans-cut-mark')).toBeNull();
  });

  it('SectionBlock: titled, hatched caps, visible lines only, no dimensions', () => {
    const parts = [shelf];
    const { container } = render(<SectionBlock parts={parts} section={{ axis: 'front', at: 5, flip: false }}
      units={IMPERIAL} scale={trioScale(parts)} exploded={false} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Section A–A — Front cut 5" from the back, looking toward the back');
    const fig = screen.getByRole('img', { name: 'Section A–A — Front cut 5" from the back, looking toward the back' });
    expect(fig.querySelectorAll('path.plans-cap')).toHaveLength(1);
    expect(fig.querySelector('path.plans-cap')).toHaveAttribute('data-hatch', '0');
    expect(fig.querySelectorAll('path.plans-cap-outline')).toHaveLength(1);
    expect(fig.querySelector('path.plan-hidden')).toBeNull();
    expect(fig.querySelector('.plan-dim')).toBeNull();
    expect(container.querySelectorAll('pattern')).toHaveLength(4);
    expect(screen.queryByText("Cut through the assembled piece at the viewport's position.")).toBeNull();
  });

  it('SectionBlock: the explode note, and one line when the cut meets no wood', () => {
    const parts = [shelf];
    const a = render(<SectionBlock parts={parts} section={{ axis: 'front', at: 5, flip: false }} units={IMPERIAL} scale={10} exploded />);
    expect(screen.getByText("Cut through the assembled piece at the viewport's position.")).toBeInTheDocument();
    a.unmount();
    render(<SectionBlock parts={parts} section={{ axis: 'front', at: 50, flip: false }} units={IMPERIAL} scale={10} exploded={false} />);
    expect(screen.getByText('Section A–A: the cut meets no part of the assembled piece.')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('SectionBlock reads whole mm in a metric project', () => {
    render(<SectionBlock parts={[shelf]} section={{ axis: 'front', at: 5, flip: false }} units={metric} scale={10} exploded={false} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Front cut 127 mm from the back');
  });

  it('the section is drawn at the trio scale', () => {
    const parts = [shelf];
    const scale = trioScale(parts);
    render(<SectionBlock parts={parts} section={{ axis: 'front', at: 5, flip: false }} units={IMPERIAL} scale={scale} exploded={false} />);
    // 30" wide plus a 16-unit margin each side.
    expect(screen.getByRole('img').getAttribute('viewBox')).toBe(`0 0 ${30 * scale + 32} ${0.75 * scale + 32}`);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/panels/PlanFigure.test.tsx`
Expected: FAIL, because `SectionBlock` and `trioScale` are not exported.

- [ ] **Step 3: Implement in `PlanFigure.tsx`**

1. Imports. Add `useId`, the section pieces and `ISO_MARGIN`:

```ts
import { memo, useId, useMemo } from 'react';
import { DIM_BAND, ISO_MARGIN, PLAN_WIDTH, layoutTrio, toSvg, type Placement } from './planLayout';
import type { Section } from '../document/section';
import { cuttingLine, hatchPatterns, HATCHES, markedView, sectionTitle, sectionViewOf, type CuttingLine } from '../document/sectionView';
```

2. Add the shared trio drawings and scale, above `PlanTrio`:

```ts
/** The trio's three drawings, cached on the parts ARRAY (worldParts and planAssemblies hand out stable arrays), so the
 *  section block reads the piece trio's scale without drawing it twice (section views spec §3.3, as amended). */
const trioCache = new WeakMap<readonly Board[], readonly [Drawing, Drawing, Drawing]>();
function trioDrawings(parts: readonly Board[]): readonly [Drawing, Drawing, Drawing] {
  const hit = trioCache.get(parts);
  if (hit) return hit;
  const out = [drawView(parts, FRONT), drawView(parts, SIDE), drawView(parts, TOP)] as const;
  trioCache.set(parts, out);
  return out;
}
export function trioScale(parts: readonly Board[]): number {
  const [f, s, t] = trioDrawings(parts);
  return layoutTrio(f.bounds, s.bounds, t.bounds).scale;
}
```

3. In `PlanTrio`:
   - Add `section` to the props: `({ parts, units, label, keyed, section }: { …; keyed?: ReadonlySet<string>; section?: Section | null })`.
   - Change the `views` memo to read the cache:

```ts
  const views = useMemo(() => {
    const ds = trioDrawings(parts);
    return [FRONT, SIDE, TOP].map((view: View, i) => ({ view, d: ds[i]!, dims: dimensionView(parts, view, units) }));
  }, [parts, units]);
```

   - After `const drawn = …`, add:

```ts
  const marked = section ? (markedView(section) === 'top' ? { x: top, at: lay.top } : { x: front, at: lay.front }) : null;
  const line = section && marked ? cuttingLine(section, marked.x.view, marked.x.d) : null;
```

   - In the `<svg>`, after `{keys.tags.map(…)}`, add:

```tsx
        {line && marked && <CuttingMark line={line} map={toSvg(marked.x.d, marked.at, lay.scale)} view={marked.x.view.title} />}
```

4. Add the marker and the block, after `PlanTrio`:

```tsx
/** SVG units: the line's run past the view at each end, the arrow's length, its head. */
const CUT_OVERRUN = 12;
const CUT_ARROW = 22;
const CUT_HEAD = 6;

/** The cutting-plane line (section views spec §2.4): a heavy chain line past the view, an arrow at each end pointing in
 *  the direction of sight, "A" beyond each arrow. Not a feature tag: tags may sit over it (fu 381's ruling). */
function CuttingMark({ line, map, view }: { line: CuttingLine; map: ToSvg; view: string }) {
  const a = map(line.a);
  const b = map(line.b);
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const u: P2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  const A: P2 = [a[0] - u[0] * CUT_OVERRUN, a[1] - u[1] * CUT_OVERRUN];
  const B: P2 = [b[0] + u[0] * CUT_OVERRUN, b[1] + u[1] * CUT_OVERRUN];
  const s: P2 = [line.sight[0], -line.sight[1]]; // SVG y runs down
  const end = (p: P2, key: string) => {
    const tip: P2 = [p[0] + s[0] * CUT_ARROW, p[1] + s[1] * CUT_ARROW];
    const back: P2 = [tip[0] - s[0] * CUT_HEAD, tip[1] - s[1] * CUT_HEAD];
    const label: P2 = [tip[0] + s[0] * LABEL_SIZE * 0.8, tip[1] + s[1] * LABEL_SIZE * 0.8 + (LABEL_ASCENT - LABEL_DESCENT) / 2];
    return (
      <g key={key}>
        <path className="plans-cut-arrow" d={`M${p[0]} ${p[1]}L${tip[0]} ${tip[1]}M${back[0] - s[1] * CUT_HEAD} ${back[1] + s[0] * CUT_HEAD}L${tip[0]} ${tip[1]}L${back[0] + s[1] * CUT_HEAD} ${back[1] - s[0] * CUT_HEAD}`} />
        <text x={label[0]} y={label[1]} textAnchor="middle">A</text>
      </g>
    );
  };
  return (
    <g className="plans-cut-mark" data-view={view}>
      <path className="plans-cut-line" d={`M${A[0]} ${A[1]}L${B[0]} ${B[1]}`} />
      {end(A, 'a')}
      {end(B, 'b')}
    </g>
  );
}

const polysPath = (polys: P2[][], map: ToSvg) =>
  polys.map((p) => `M${p.map((q) => map(q).map((n) => n.toFixed(2)).join(' ')).join('L')}Z`).join('');

/** Section A–A (section views spec §2.3): the assembled piece cut by the viewport's plane, at the piece trio's scale —
 *  hatched caps over a paper ground, the visible lines beyond, the cap outlines heavy. No dimensions, tags or hidden lines. */
export const SectionBlock = memo(function SectionBlock({ parts, section, units, scale, exploded }: {
  parts: readonly Board[]; section: Section; units: Units; scale: number; exploded: boolean;
}) {
  const pid = useId();
  const d = useMemo(() => drawView(parts, sectionViewOf(section), undefined, { hiddenLines: false, section }), [parts, section]);
  const caps = d.caps ?? [];
  const hatch = useMemo(() => hatchPatterns(caps), [caps]);
  const title = sectionTitle(section, parts, units);
  const note = exploded && <ul className="plans-notes"><li>Cut through the assembled piece at the viewport's position.</li></ul>;
  if (caps.length === 0) {
    return (
      <section className="plans-section">
        <p className="plans-notes">Section A–A: the cut meets no part of the assembled piece.</p>
        {note}
      </section>
    );
  }
  const width = (d.bounds.max[0] - d.bounds.min[0]) * scale + 2 * ISO_MARGIN;
  const height = (d.bounds.max[1] - d.bounds.min[1]) * scale + 2 * ISO_MARGIN;
  const map = toSvg(d, { x: ISO_MARGIN, y: ISO_MARGIN }, scale);
  return (
    <section className="plans-section">
      <h3>{title}</h3>
      <figure className="plans-figure-wrap">
        <svg className="plans-figure" viewBox={`0 0 ${width} ${height}`} style={pageWidth(width)} role="img" aria-label={title}>
          <defs>
            {HATCHES.map((h, n) => (
              <pattern key={n} id={`${pid}-h${n}`} patternUnits="userSpaceOnUse" width={h.gap} height={h.gap} patternTransform={`rotate(${h.angle})`}>
                <line className="plans-hatch-line" x1={0} y1={0} x2={0} y2={h.gap} />
              </pattern>
            ))}
          </defs>
          {caps.map((c) => <path key={`g${c.part}`} className="plans-cap-ground" d={polysPath(c.polys, map)} />)}
          {caps.map((c) => (
            <path key={`h${c.part}`} className="plans-cap" data-hatch={hatch.get(c.part)}
              style={{ fill: `url(#${CSS.escape(`${pid}-h${hatch.get(c.part)}`)})` }} d={polysPath(c.polys, map)} />
          ))}
          <Lines d={d} map={map} hidden={false} />
          {caps.map((c) => <path key={`o${c.part}`} className="plans-cap-outline" d={pathOf(c.outline, map)} />)}
        </svg>
        {note}
      </figure>
    </section>
  );
});
```

   Check that `useId` ids contain `:`. A `url(#…)` with an unescaped `:` is valid in an attribute but not in CSS, which
   is why the style uses `CSS.escape`. If jsdom lacks `CSS.escape`, use `fill={…}` as an attribute plus a CSS rule
   `.plans-figure path.plans-cap { fill: revert-layer }` instead, and write a `Ruling:` in the ledger. Either way the
   rendered pattern must apply. Task 5's live pass checks it on a real page.

- [ ] **Step 4: Add the CSS**

In `src/styles.css`, after the `.plans-key-tag` rule (~line 1260):

```css
/* Section views (fu 256): the cutting line, the caps' paper ground and hatch, the section outline. */
.plans-figure .plans-cut-line { stroke-width: 2.5; stroke-dasharray: 24 5 5 5; }
.plans-figure .plans-cut-arrow { stroke-width: 1.5; }
.plans-figure .plans-cap-ground { fill: var(--surface); stroke: none; }
.plans-figure .plans-cap { stroke: none; }
.plans-figure .plans-cap-outline { stroke-width: 2.5; }
.plans-figure .plans-hatch-line { stroke-width: 0.75; }
```

In the print block, beside `.plans-key-tag { fill: #fff; }`:

```css
  .plans-figure .plans-cap-ground { fill: #fff; }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/panels/PlanFigure.test.tsx src/panels/PlansSheet.test.tsx`
Expected: PASS. The existing PlanTrio and sheet tests are unchanged.

- [ ] **Step 6: Mutate**

Apply each, confirm the failure, then revert:
- `markedView` result ignored, always the Front: the first test fails.
- `hidden={true}` in SectionBlock's `Lines`: "visible lines only" fails.

- [ ] **Step 7: Commit**

```bash
git add src/panels/PlanFigure.tsx src/panels/PlanFigure.test.tsx src/styles.css
git commit -m "Plans sheet: the cutting-plane marker on the piece trio and the hatched Section A–A block (fu 256)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wire the sheet (`PlansSheet.tsx`)

**Files:**
- Modify: `src/panels/PlansSheet.tsx`
- Test: `src/panels/PlansSheet.test.tsx`

**Interfaces:**
- Consumes: `PlanTrio`'s `section` prop, `SectionBlock` and `trioScale` (Task 3); the store's `section` and `explode`.
- Produces: nothing further.

- [ ] **Step 1: Write the failing tests**

Append to `src/panels/PlansSheet.test.tsx`, adding the imports
`import { boardsBounds } from '../document/geometry';` and `import { worldParts } from '../document/tree';`:

```ts
describe('PlansSheet section views (fu 256)', () => {
  const one = () => ({ ...createDocument('One'), boards: [createBoard({ id: 'b', length: 30, width: 11.25, thickness: 0.75 })] });

  it('with Section off the sheet has no marker and no section block', () => {
    act(() => useStore.getState().replaceDocument(cabinetsDoc()));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    expect(container.querySelector('.plans-cut-mark')).toBeNull();
    expect(screen.queryByText(/Section A–A/)).toBeNull();
  });

  it('with Section on: one marker on the piece trio, the section right after it, none on the assemblies', () => {
    const doc = cabinetsDoc();
    act(() => useStore.getState().replaceDocument(doc));
    // Through the middle of the piece, so the cut meets wood whatever the fixture's layout.
    const bounds = boardsBounds(worldParts(doc))!;
    act(() => useStore.getState().setSection({ axis: 'front', at: (bounds.min[2] + bounds.max[2]) / 2, flip: false }));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    expect(container.querySelectorAll('.plans-cut-mark')).toHaveLength(1);
    expect(container.querySelectorAll('path.plans-cap').length).toBeGreaterThan(0);
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings[0]).toBe('Exploded view');
    expect(headings[1]).toBe('Cabinets');
    expect(headings[2]).toMatch(/^Section A–A — Front cut /);
    expect(headings.slice(3)).toEqual(['Cabinet × 3', 'Cabinet › Drawer × 4', 'Solo']);
  });

  it('a cut meeting no wood says so in one line', () => {
    act(() => useStore.getState().replaceDocument(one()));
    act(() => useStore.getState().setSection({ axis: 'front', at: 50, flip: false }));
    render(<PlansSheet onClose={() => {}} />);
    expect(screen.getByText('Section A–A: the cut meets no part of the assembled piece.')).toBeInTheDocument();
  });

  it('cuts the assembled piece while the viewport is exploded, with the note', () => {
    act(() => useStore.getState().replaceDocument(one()));
    act(() => useStore.getState().setSection({ axis: 'front', at: 5, flip: false }));
    act(() => useStore.setState({ explode: 0.5 }));
    const { container } = render(<PlansSheet onClose={() => {}} />);
    expect(container.querySelectorAll('path.plans-cap')).toHaveLength(1);
    expect(screen.getByText("Cut through the assembled piece at the viewport's position.")).toBeInTheDocument();
    act(() => useStore.setState({ explode: 0 }));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/panels/PlansSheet.test.tsx`
Expected: the first new test PASSES. The other three FAIL, because the sheet ignores `section`.

- [ ] **Step 3: Implement**

In `src/panels/PlansSheet.tsx`:

```ts
import { ExplodedFigure, PlanTrio, SectionBlock, trioScale } from './PlanFigure';
```

In the component, after `const doc = …`:

```ts
  // The viewport's cut (section views spec §2.1): view state, read as the sheet renders; never saved.
  const section = useStore((s) => s.section);
  const exploded = useStore((s) => s.explode > 0);
```

Replace the piece's block:

```tsx
            <section className="plans-section">
              <h3>{doc.name}</h3>
              <PlanTrio parts={parts} units={doc.units} label={doc.name} keyed={pieceKeys} section={section} />
            </section>
            {section && <SectionBlock parts={parts} section={section} units={doc.units} scale={trioScale(parts)} exploded={exploded} />}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/panels/PlansSheet.test.tsx src/panels/PlanFigure.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mutate**

Pass `section={null}` to `PlanTrio`: the marker-count test fails. Revert.

- [ ] **Step 6: Measure (Review Focus 5)**

Run a throwaway vitest file in the scratchpad (not committed). Build 60 flat 24 × 3 × 0.75 parts in a 6 × 10 grid,
each with one dado. Time `drawView(parts, FRONT, undefined, { hiddenLines: false, section })` with a cut through the
middle: take the minimum of 9 runs against the same call without a section. Record both numbers in the ledger. There
is no budget, but flag a ratio above 3× to the user.

- [ ] **Step 7: Full gate and commit**

Run: `npm run build && npm test`
Expected: the build passes, and every test passes (4654 + this round's).

```bash
git add src/panels/PlansSheet.tsx src/panels/PlansSheet.test.tsx
git commit -m "Plans sheet reads the viewport's section: marker on the piece trio, Section A–A after it (fu 256)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Live pass, a real print, and the record

**Files:**
- Create: `docs/browser-verification-section-views.md`
- Modify: `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md`,
  `docs/superpowers/specs/2026-10-17-sloyd-section-views-design.md`
- Modify (memory): `/home/alec/.claude/projects/-home-alec-docker-sloyd/memory/sloyd-roadmap-cut-points-then-guides.md`,
  `MEMORY.md`

This task is done by the session (not a subagent): the user watches the Playwright browser.

- [ ] **Step 1: Start the dev server and record the baseline keys**

Run `npx vite --port 5179 --strictPort` in the background. In Playwright, open `http://localhost:5179/package.json`
and record `Object.keys(localStorage)`.

- [ ] **Step 2: Drive four cases**

For each case:
- build or import a fixture;
- turn Section on with the axis, position and Flip given;
- open Plans;
- read back the section heading, the `.plans-cut-mark`'s `data-view`, the count of `path.plans-cap` and their
  `data-hatch` values;
- take a screenshot to the scratchpad.

The cases:
1. A bookcase (two sides with dadoes, three shelves): a Front cut through the dadoes.
2. A table (legs and aprons): a Side cut through a leg and an apron.
3. The same table: a flipped Top cut through the aprons.
4. A metric project: the title reads mm.

Check:
- the hatch applies (the computed `fill` of a `.plans-cap` is a `url(...)` and the pattern renders in the screenshot);
- neighbouring parts' hatches differ;
- arrows point toward the kept side.

- [ ] **Step 3: A real print**

`page.emulateMedia({ media: 'print' })`, then `page.pdf({ path: '<scratchpad>/section.pdf', format: 'Letter' })`.
Read it back with PyMuPDF (`python3` without `-I`): find the page with `Section A–A`, confirm the section block is not
split across pages, and render that page to PNG for the user. Then run `page.emulateMedia({ media: null })`.

- [ ] **Step 4: Clean up**

Delete only the `localStorage` keys this pass created (compare with Step 1), confirm they are gone, close the browser,
and stop the dev server by its PID from `ss -ltnp`.

- [ ] **Step 5: Write the record**

- `docs/browser-verification-section-views.md`: the four cases, the numbers read back, the PDF finding, and what is
  left for the user's eye (the hatch density, the cut line's weight).
- The spec: set the status to `approved; plan docs/superpowers/plans/2026-10-17-sloyd-section-views.md`, and amend §3.3
  with Task 3's ruling (PlansSheet renders `SectionBlock`; the scale comes through `trioScale`).
- `docs/follow-ups.md`: append to 256 `**Status:** closed 2026-10-17 — section views on the Plans sheet (spec
  2026-10-17-sloyd-section-views-design.md).` Add a new entry for any residue the live pass finds.
- `CLAUDE.md`:
  - **Status:** a section-views bullet (merged, not deployed).
  - **Rounds table:** one row:
    `| section views | 10-17 | — | Plans sheet: the viewport's section as a hatched Section A–A after the piece trio, the cutting line on one elevation (fu 256) |`.
  - **Inv 51:** append the spec §3.5 amendment.
  - **Where things live:** `sectionView.ts` under `document/`, and `drawing.ts`' `section` option.
  - **The `→ units` rule:** add `sectionView.ts` to the list.
  - **Test count**, and remove 256 from the open list.
- `docs/history.md`: the round's narrative.
- Memory: the roadmap line 11 `(latest)` and the `MEMORY.md` index line.

- [ ] **Step 6: Merge**

```bash
git add -A docs CLAUDE.md && git commit -m "docs: section views (fu 256) — live pass, record

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git checkout master && git merge --no-ff section-views -m "Merge branch 'section-views': section views on the Plans sheet (fu 256)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm run build && npm test
git branch -d section-views
```

Expected: the build passes and every test passes on the merged tree. Do NOT deploy; that waits for the user's word.
