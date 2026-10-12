# Angle cuts, chunk 3 (Bevel + Chamfer presets) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The user can add and edit bevels (an edge cut at a blade tilt, along the length) and chamfers (a corner
knocked off at 45°, any of a part's twelve edges) by hand, and the cut list describes both unambiguously at the bench.

**Architecture:** Chunk 1 already draws, edges, snaps, prints and mirrors any `AngleCut`; chunk 2 built the pattern
(fields that hold the stored slope ratio, `AngleField`, a row per kind, the "+ Add ▾" menu). This chunk adds
`BevelFields`/`ChamferFields` conversions beside `MiterFields`, two rows, two menu items, and final bench wording for
both kinds. No schema change; no store change.

**Tech Stack:** TypeScript, React, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-12-sloyd-angle-cuts-design.md` §2.2 (chamfer example), §4.2 (wording — this
plan amends the bevel and chamfer rows, see below), §7 (Bevel: which edge · angle; Chamfer: which edge · size), §9
chunk 3.

## Wording decisions in this plan (for the user to confirm at plan review)

Spec §4.2's bevel and chamfer rows were placeholders (hand-edited files only until now). This plan proposes:

| Kind | New line |
|---|---|
| bevel | `Bevel 15.0° off the width face (max side), across the thickness, long point on the thickness min side` |
| chamfer, equal legs | `Chamfer 1/8" on the edge between the width face (max side) and the thickness face (max side), along the length` |
| chamfer, unequal legs (hand-edited) | `Chamfer 1/8" into the width × 3/16" into the thickness, on the edge between the width face (max side) and the thickness face (max side), along the length` |

The same "long point" and "face (max side)" vocabulary as tapers and miters (the user approved "long point" for
miters, fu 294). The task that changes the wording also amends spec §4.2.

## Global Constraints

- Work on a local branch `angle-cuts-3`; merge with `git merge --no-ff`; no pull requests.
- **No schema change** (`CURRENT_VERSION` stays 14); **no new store action** — `addAngleCuts` / `updateAngleCut` /
  `removeAngleCut` only (several cuts in one call are one undo entry).
- Fields carry STORED values, never re-derived through trigonometry: a bevel holds its slope ratio (like `MiterFields`;
  `miterRatio(45) === 1`), a chamfer holds its two leg lengths. Degrees appear only in display and typed input.
- Angles display to 0.1° with `°` (HTML text only, invariant 19); lengths through `formatLength`.
- Fields REFUSE out-of-range input, never clamp (invariant 5): a bevel's depth (`run × ratio`) must not exceed the face's
  dimension; a chamfer's size must be > 0 and not exceed either of its two faces' dimensions.
- A bevel always slopes across the part's other CROSS dimension and runs along the length (face width → across
  thickness; face thickness → across width). A cut with `face` width/thickness and `along: 'length'` is a taper, never a
  bevel row.
- `kind` never decides geometry; it picks the row. A stored cut the row cannot represent (hand-edited) shows its bench
  line and a remove button, never a wrong control.
- Every hook in `AngleRow` stays above every kind branch (a fixed chunk-1 bug).
- `npm test` does not typecheck; run `npm run build`. Mutate every plan-supplied test.

## Review Focus

1. **A 45° bevel edited only in its face or long-point side** keeps `depth === run` exactly. Pinned in Task 1.
2. **A chamfer stored "the other way round"** (deepening toward the far side, or `face`/`along` swapped, as a hand-edited
   file may hold it) reads its edge and legs correctly and rewrites canonically on edit. Pinned in Task 1.
3. **Chamfer size larger than the thinner face** (e.g. 1" on a 3/4" board): refused, nothing written. Pinned in Task 3.
4. **Switching a bevel to a face whose dimension is smaller than its depth** (a steep bevel moved from the width face to
   the thickness face): refused with a note, nothing written. Pinned in Task 3.
5. **The chamfer's twelve edges** each map to a distinct stored cut that removes the expected corner, checked against
   `boardBodies` geometry, not the conversion under test. Pinned in Task 1.

---

### Task 1: Bevel and chamfer field conversions

**Files:**
- Modify: `src/document/angleCuts.ts` (beside the miter conversions), `src/document/document.ts` (barrel)
- Test: `src/document/angleCuts.test.ts` (append)

**Interfaces:**
- Consumes (existing): `miterRatio`, `miterDegrees`, `miterLongSide(c, board)` (generic: the side of `along` where the
  stored line is shallower), `depthAt`, `zeroStation`, private `flip`.
- Produces:
  - `interface BevelFields { face: 'width' | 'thickness'; from: CutFrom; longSide: CutFrom; ratio: number }`
  - `bevelAcross(face: 'width' | 'thickness'): 'thickness' | 'width'` (the other cross dimension)
  - `bevelCut(f, board): Omit<AngleCut, 'id'>` — `kind: 'bevel', face, from, along: bevelAcross(face), alongFrom: longSide, points: [[0, 0], [run, run × ratio]]`, `run = board[along]`
  - `bevelFields(c, board): BevelFields | null` — null when the cut is not a bevel the row can show (`face` length, or `along` length)
  - `defaultBevel(board)` — 15° off the width face (max side), long point on the thickness min side (`ratio = miterRatio(15)`)
  - `interface ChamferEdge { face: Dimension; from: CutFrom; along: Dimension; alongFrom: CutFrom }` with `face` before `along` in `DIMENSION_ORDER` (canonical)
  - `CHAMFER_EDGES: ChamferEdge[]` — all twelve, in a fixed order (for each `through` in DIMENSION_ORDER: the two other dims, sides min/max × min/max)
  - `interface ChamferFields extends ChamferEdge { legFace: number; legAlong: number }` — `legFace` = depth INTO `face`, `legAlong` = depth into `along`
  - `chamferCut(f, board)` — `kind: 'chamfer', face, from, along, alongFrom, points: [[0, legFace], [legAlong, 0]]`
  - `chamferFields(c, board): ChamferFields | null` — canonicalises (swaps `face`/`along` and the legs if `face` is later in DIMENSION_ORDER; reads a line that deepens toward the far side from that side, as `taperFields` does); null when the line is not a corner chamfer (it never reaches 0 inside the part, or a leg exceeds its dimension)
  - `defaultChamfer(board)` — the width-max / thickness-max edge, both legs `min(1/8, width/4, thickness/4)`

- [ ] **Step 1: Write the failing tests**

```ts
import { boardBodies, bodyVerts, bodyVolume } from './bodies';
import {
  bevelCut, bevelFields, bevelAcross, defaultBevel, miterRatio,
  CHAMFER_EDGES, chamferCut, chamferFields, defaultChamfer,
} from './angleCuts';

const stock = () => createBoard({ length: 20, width: 3, thickness: 0.75 });
const volume = (b: Board) => boardBodies(b).reduce((v, x) => v + bodyVolume(x), 0);

describe('bevel fields (spec §7)', () => {
  it('slopes across the other cross dimension', () => {
    expect(bevelAcross('width')).toBe('thickness');
    expect(bevelAcross('thickness')).toBe('width');
  });
  it('a 45° bevel keeps depth === run through a face/side edit (Review Focus 1)', () => {
    const b = stock();
    const c = { id: 'b', ...bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: 1 }, b) };
    expect(c.points).toEqual([[0, 0], [0.75, 0.75]]);
    const f = bevelFields(c, b)!;
    expect(f).toEqual({ face: 'width', from: 'max', longSide: 'min', ratio: 1 });
    const moved = bevelCut({ ...f, from: 'min', longSide: 'max' }, b);
    expect(moved.points).toEqual([[0, 0], [0.75, 0.75]]);
  });
  it('removes ½ · run · depth · length', () => {
    const b = { ...stock(), angleCuts: [{ id: 'b', ...bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: miterRatio(15) }, stock()) }] };
    const d = 0.75 * Math.tan((15 * Math.PI) / 180);
    expect(Math.abs(volume(b) - (20 * 3 * 0.75 - 0.5 * 0.75 * d * 20))).toBeLessThan(1e-9);
  });
  it('is null for a cut the bevel row cannot show', () => {
    const b = stock();
    expect(bevelFields({ id: 't', kind: 'bevel', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.5], [10, 0]] }, b)).toBeNull();
    expect(bevelFields({ id: 'm', kind: 'bevel', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [3, 3]] }, b)).toBeNull();
  });
  it('defaults to 15° off the width face (max side), long point on the thickness min side', () => {
    expect(defaultBevel(stock())).toEqual(bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: miterRatio(15) }, stock()));
  });
});

describe('chamfer fields (spec §7)', () => {
  it('lists twelve distinct canonical edges', () => {
    expect(CHAMFER_EDGES).toHaveLength(12);
    expect(new Set(CHAMFER_EDGES.map((e) => `${e.face}${e.from}${e.along}${e.alongFrom}`)).size).toBe(12);
    for (const e of CHAMFER_EDGES) expect(['length', 'width', 'thickness'].indexOf(e.face)).toBeLessThan(['length', 'width', 'thickness'].indexOf(e.along));
  });
  it('each edge removes the corner it names, checked against the geometry (Review Focus 5)', () => {
    const b0 = stock();
    for (const e of CHAMFER_EDGES) {
      const b = { ...b0, angleCuts: [{ id: 'c', ...chamferCut({ ...e, legFace: 0.125, legAlong: 0.125 }, b0) }] };
      // The named corner point (on both faces) is gone; the opposite corner on the same through line is kept.
      const corner = { length: 0, width: 0, thickness: 0 } as Record<Dimension, number>;
      corner[e.face] = e.from === 'min' ? 0 : b0[e.face];
      corner[e.along] = e.alongFrom === 'min' ? 0 : b0[e.along];
      const through = (['length', 'width', 'thickness'] as const).find((d) => d !== e.face && d !== e.along)!;
      corner[through] = b0[through] / 2;
      const verts = boardBodies(b).flatMap(bodyVerts);
      const near = (p: number[]) => Math.abs(p[0]! - corner.length) < 1e-9 && Math.abs(p[1]! - corner.width) < 1e-9;
      expect(verts.some((p) => near(p) && Math.abs(p[2]! - corner.thickness) < 1e-9), `${JSON.stringify(e)} corner removed`).toBe(false);
      expect(Math.abs(volume(b) - (20 * 3 * 0.75 - 0.5 * 0.125 * 0.125 * b0[through]))).toBeLessThan(1e-9);
    }
  });
  it('round-trips exactly', () => {
    const b = stock();
    const e = CHAMFER_EDGES[0]!;
    const c = { id: 'c', ...chamferCut({ ...e, legFace: 0.125, legAlong: 0.1875 }, b) };
    expect(chamferFields(c, b)).toEqual({ ...e, legFace: 0.125, legAlong: 0.1875 });
  });
  it('canonicalises a hand-edited chamfer stored the other way round (Review Focus 2)', () => {
    const b = stock();
    // face thickness / along width (non-canonical order), and deepening toward the far side of `along`.
    const c = { id: 'h', kind: 'chamfer' as const, face: 'thickness' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const,
      points: [[2.75, 0], [3, 0.25]] as [[number, number], [number, number]] };
    // It knocks off the thickness-max / width-max corner: 0.25 into the thickness, 0.25 into the width.
    expect(chamferFields(c, b)).toEqual({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.25, legAlong: 0.25 });
  });
  it('is null for a line that is not a corner chamfer', () => {
    const b = stock();
    expect(chamferFields({ id: 'n', kind: 'chamfer', face: 'width', from: 'max', along: 'thickness', alongFrom: 'min', points: [[0, 0.5], [0.75, 0.7]] }, b)).toBeNull(); // deep at both sides: never reaches 0 inside the part
  });
  it('defaults to 1/8 on the width-max / thickness-max edge, smaller on a tiny part', () => {
    const d = defaultChamfer(stock());
    expect(d).toMatchObject({ kind: 'chamfer', face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', points: [[0, 0.125], [0.125, 0]] });
    const tiny = defaultChamfer(createBoard({ length: 4, width: 0.25, thickness: 0.25 }));
    expect(tiny.points).toEqual([[0, 0.0625], [0.0625, 0]]);
  });
});
```

(Import `Board`, `Dimension`, `createBoard` as the file already does.) Before relying on the "canonicalises" test's
expected value, verify by hand against `keptHalfSpace`/`boardBodies` that the stored cut really removes the
thickness-max / width-max corner with 0.25 legs; if not, fix the FIXTURE so it does and keep the expectation's meaning.

Run: `npx vitest run src/document/angleCuts.test.ts -t "bevel fields|chamfer fields"` — Expected: FAIL.

- [ ] **Step 2: Implement**

```ts
/** A bevel as the shop reads it (spec §7): an edge face cut at a blade tilt, along the length. `ratio` is the stored
 *  slope, like MiterFields — never re-derived through trigonometry. */
export interface BevelFields { face: 'width' | 'thickness'; from: CutFrom; longSide: CutFrom; ratio: number }

/** A bevel slopes across the part's OTHER cross dimension (it runs along the length). */
export function bevelAcross(face: 'width' | 'thickness'): 'thickness' | 'width' {
  return face === 'width' ? 'thickness' : 'width';
}

export function bevelCut(f: BevelFields, board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  const along = bevelAcross(f.face);
  const run = board[along];
  return { kind: 'bevel', face: f.face, from: f.from, along, alongFrom: f.longSide, points: [[0, 0], [run, run * f.ratio]] };
}

/** Null for a cut the bevel row cannot show (an end cut, or a slope along the length — that is a taper). */
export function bevelFields(c: AngleCut, board: Pick<Board, Dimension>): BevelFields | null {
  if (c.face === 'length' || c.along === 'length') return null;
  const [[s1, q1], [s2, q2]] = c.points;
  return { face: c.face, from: c.from, longSide: miterLongSide(c, board), ratio: Math.abs(q2 - q1) / Math.abs(s2 - s1) };
}

export function defaultBevel(board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  return bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: miterRatio(15) }, board);
}

/** One of a part's twelve edges, canonical: `face` before `along` in DIMENSION_ORDER. */
export interface ChamferEdge { face: Dimension; from: CutFrom; along: Dimension; alongFrom: CutFrom }

export const CHAMFER_EDGES: ChamferEdge[] = DIMENSION_ORDER.flatMap((through) => {
  const [face, along] = DIMENSION_ORDER.filter((d) => d !== through) as [Dimension, Dimension];
  return (['min', 'max'] as CutFrom[]).flatMap((from) => (['min', 'max'] as CutFrom[]).map((alongFrom) => ({ face, from, along, alongFrom })));
});

/** A chamfer's edge and its two legs: `legFace` into `face`, `legAlong` into `along` (stored values, exact). */
export interface ChamferFields extends ChamferEdge { legFace: number; legAlong: number }

export function chamferCut(f: ChamferFields, _board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  return { kind: 'chamfer', face: f.face, from: f.from, along: f.along, alongFrom: f.alongFrom, points: [[0, f.legFace], [f.legAlong, 0]] };
}

/**
 * The edge and legs of a stored chamfer, canonical (`face` before `along`). A line that deepens toward the far side of
 * `along` is read from that side (as taperFields does); null when the line is not a corner chamfer — it never reaches
 * depth 0 inside the part, or a leg exceeds its dimension. Editing rewrites it canonically via `chamferCut`.
 */
export function chamferFields(c: AngleCut, board: Pick<Board, Dimension>): ChamferFields | null {
  const A = board[c.along];
  let alongFrom = c.alongFrom;
  let legFace = depthAt(c, 0);
  let legAlong = zeroStation(c);
  if (legFace <= 0 && depthAt(c, A) > 0) { alongFrom = flip(c.alongFrom); legFace = depthAt(c, A); legAlong = A - legAlong; }
  if (!(legFace > 0 && legFace <= board[c.face] && Number.isFinite(legAlong) && legAlong > 0 && legAlong <= A)) return null;
  const swap = DIMENSION_ORDER.indexOf(c.face) > DIMENSION_ORDER.indexOf(c.along);
  return swap
    ? { face: c.along, from: alongFrom, along: c.face, alongFrom: c.from, legFace: legAlong, legAlong: legFace }
    : { face: c.face, from: c.from, along: c.along, alongFrom, legFace, legAlong };
}

export function defaultChamfer(board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  const leg = Math.min(0.125, board.width / 4, board.thickness / 4);
  return chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: leg, legAlong: leg }, board);
}
```

Swapping `face`/`along` must describe the SAME removed corner: the depth into `face` measured at the `along` surface is
the leg lying along the `along` direction — confirm the swap by the "canonicalises" test against geometry, and fix the
swap (not the test) if the geometry disagrees. Export everything through the barrel.

- [ ] **Step 3: Run tests, `npm run build`, `npm test`.** Expected: PASS.

- [ ] **Step 4: Mutate** — make `bevelCut` use `Math.tan` for ratio 1 (route degrees) → Review Focus 1 test fails; drop
  the swap in `chamferFields` → the canonicalise test fails; flip `alongFrom` in one `CHAMFER_EDGES` mapping → the
  twelve-edge geometry test fails. Restore each.

- [ ] **Step 5: Commit** — `feat(angle cuts): bevel and chamfer field conversions`.

---

### Task 2: Final bench wording for bevels and chamfers

**Files:**
- Modify: `src/document/angleText.ts` (`angleLine`'s bevel and chamfer cases)
- Modify: `docs/superpowers/specs/2026-10-12-sloyd-angle-cuts-design.md` §4.2 table + an *Amended (chunk 3)* note
- Test: `src/document/angleText.test.ts` (update the two pinned lines; add cases)

**Interfaces:**
- Consumes: `bevelFields`, `chamferFields` (Task 1), `miterLongSide`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('bevel and chamfer lines (chunk 3 wording)', () => {
  const b = createBoard({ length: 20, width: 3, thickness: 0.75 });
  it('a bevel names its long point', () => {
    const c = { id: 'b', ...bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: miterRatio(15) }, b) };
    expect(angleLine(b, c, 16)).toBe('Bevel 15.0° off the width face (max side), across the thickness, long point on the thickness min side');
  });
  it('mirror-image bevels read differently', () => {
    const one = { id: 'b', ...bevelCut({ face: 'width', from: 'max', longSide: 'min', ratio: 1 }, b) };
    const two = { id: 'b', ...bevelCut({ face: 'width', from: 'max', longSide: 'max', ratio: 1 }, b) };
    expect(angleLine(b, one, 16)).not.toBe(angleLine(b, two, 16));
  });
  it('an equal-legged chamfer names its edge', () => {
    const c = { id: 'c', ...defaultChamfer(b) };
    expect(angleLine(b, c, 16)).toBe('Chamfer 1/8" on the edge between the width face (max side) and the thickness face (max side), along the length');
  });
  it('an unequal-legged chamfer names both legs', () => {
    const c = { id: 'c', ...chamferCut({ face: 'width', from: 'max', along: 'thickness', alongFrom: 'max', legFace: 0.125, legAlong: 0.1875 }, b) };
    expect(angleLine(b, c, 16)).toBe('Chamfer 1/8" into the width × 3/16" into the thickness, on the edge between the width face (max side) and the thickness face (max side), along the length');
  });
  it('reads a hand-edited chamfer canonically', () => {
    const c = { id: 'h', kind: 'chamfer' as const, face: 'thickness' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const,
      points: [[2.75, 0], [3, 0.25]] as [[number, number], [number, number]] };
    expect(angleLine(b, c, 16)).toBe('Chamfer 1/4" on the edge between the width face (max side) and the thickness face (max side), along the length');
  });
  it('falls back to a generic line for a shape neither row can describe', () => {
    const c = { id: 'n', kind: 'chamfer' as const, face: 'width' as const, from: 'max' as const, along: 'thickness' as const, alongFrom: 'min' as const, points: [[0, 0.5], [0.75, 0.7]] as [[number, number], [number, number]] };
    expect(angleLine(b, c, 16)).toMatch(/^Chamfer .*off the width face \(max side\)/);
  });
});
```

(Use the `formatLength` output form these strings assume; check `formatLength(0.1875, 16)` first and use its real form.)

Run — Expected: FAIL.

- [ ] **Step 2: Implement** the two cases in `angleLine`:

```ts
    case 'bevel': {
      const bf = bevelFields(c, board);
      if (!bf) return `Bevel ${deg} off ${side}, across the ${c.along}`;
      return `Bevel ${deg} off ${side}, across the ${c.along}, long point on the ${c.along} ${bf.longSide} side`;
    }
    case 'chamfer': {
      const cf = chamferFields(c, board);
      if (!cf) return `Chamfer ${deg} off ${side}, across the ${c.along}`;
      const through = DIMENSION_ORDER.find((d) => d !== cf.face && d !== cf.along)!;
      const edge = `the edge between the ${cf.face} face (${cf.from} side) and the ${cf.along} face (${cf.alongFrom} side), along the ${through}`;
      return cf.legFace === cf.legAlong
        ? `Chamfer ${f(cf.legFace)} on ${edge}`
        : `Chamfer ${f(cf.legFace)} into the ${cf.face} × ${f(cf.legAlong)} into the ${cf.along}, on ${edge}`;
    }
```

(`f` is `angleLine`'s existing `formatLength` helper; the field variables are named `bf`/`cf` so they do not shadow it.) Update the two chunk-1
expectations at `angleText.test.ts:34-35` to the new wording, and the spec §4.2 table rows with an
*Amended (chunk 3, approved with the plan):* note.

- [ ] **Step 3: Run tests, `npm run build`, `npm test`.** Expected: PASS (grep `src` for other pinned bevel/chamfer
  strings — cutlist/diagram tests — and update them).

- [ ] **Step 4: Mutate** — drop the long-point clause → the mirror-image test fails; skip the canonical read
  (format raw `face`) → the hand-edited test fails. Restore.

- [ ] **Step 5: Commit** — `feat(angle cuts): bevel and chamfer bench wording`.

---

### Task 3: Bevel and Chamfer rows and menu items

**Files:**
- Modify: `src/panels/AngleCuts.tsx`
- Test: `src/panels/AngleCuts.test.tsx` (append; reuse its setup)

**Interfaces:**
- Consumes: Task 1's functions; `AngleField({ label, value, onCommit, max? })` (floors its limit to 0.1°);
  `DimensionField` (refuses, never clamps; `max` inclusive; default rule refuses ≤ 0); the existing `error` state and
  `head`/`line`/`none` pieces of `AngleRow`.

- [ ] **Step 1: Write the failing tests**

```tsx
describe('bevels and chamfers in the Angles section (chunk 3)', () => {
  // setup: a selected 20 × 3 × 3/4 board, Properties rendered — copy the file's existing setup.
  it('adds a bevel and a chamfer from + Add ▾', async () => {
    await user.click(screen.getByRole('button', { name: /\+ Add/ }));
    await user.click(screen.getByRole('button', { name: 'Bevel' }));
    expect(screen.getByText(/^Bevel 15\.0° off the width face \(max side\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /\+ Add/ }));
    await user.click(screen.getByRole('button', { name: 'Chamfer' }));
    expect(screen.getByText(/^Chamfer 1\/8" on the edge between/)).toBeInTheDocument();
  });
  it('edits a bevel angle exactly (45 → depth === run)', async () => { /* add a bevel; type 45 in Angle; points[1] === [0.75, 0.75] */ });
  it('refuses moving a steep bevel to a face too thin for it (Review Focus 4)', async () => {
    /* a 20 × 0.5 × 3 part (width 0.5, thickness 3), bevel 30° off the thickness face (across the width, run 0.5, depth 0.289 ≤ 3):
       choose Face "Width face — max side" (run becomes thickness 3, depth 1.73 > width 0.5) → stored cut unchanged,
       alert "Removes more than the width — reduce the angle first." */
  });
  it('edits a chamfer edge and size; refuses a size past the thinner face (Review Focus 3)', async () => {
    /* add a chamfer; choose Edge "Thickness max / width min" (or the option text you render for it) → stored face/from/along/alongFrom
       match that CHAMFER_EDGES entry; type 3/16 in Size → points [[0, 0.1875], [0.1875, 0]]; type 1 in Size → refused
       ("Must be at most 3/4\"", the thinner of width 3 and thickness 3/4), stored unchanged */
  });
  it('a hand-edited bevel the row cannot show gets its line and a remove button only', () => {
    /* a bevel with along 'length' → no Angle/Face controls in its row, its bench line shown, Remove present */
  });
});
```

Write every test fully in the file's style; each comment states exactly what it must assert. Run — Expected: FAIL.

- [ ] **Step 2: Implement the rows** in `AngleRow`, after the miter branch and before the taper branch, every hook
  already above:

  **Bevel** (when `cut.kind === 'bevel'` and `bevelFields(cut, board)` is non-null):
  - Face select: four options `Width face — min side`, `Width face — max side`, `Thickness face — min side`,
    `Thickness face — max side` (value `${face}|${from}`; reuse the taper's `FACES` constant).
  - Long point select: `${Across} — min side` / `— max side`, where Across = `bevelAcross(face)` capitalised.
  - `AngleField label="Angle" value={miterDegrees(f.ratio)} max={miterDegrees(board[f.face] / board[bevelAcross(f.face)])}
    onCommit={(deg) => setB({ ratio: miterRatio(deg) })}`.
  - `setB(patch)`: `next = { ...f, ...patch }`; if `board[bevelAcross(next.face)] * next.ratio > board[next.face]` →
    `setError(\`Removes more than the ${next.face} — reduce the angle first.\`)` and return; else clear the error and
    `updateAngleCut(board.id, cut.id, bevelCut(next, board))`.

  **Chamfer** (when `cut.kind === 'chamfer'` and `chamferFields(cut, board)` is non-null):
  - Edge select over `CHAMFER_EDGES` (value = index), option text
    `${Face} ${from} / ${along} ${alongFrom} edge (along the ${through})`, e.g. `Width max / thickness max edge (along the length)`.
    Changing the edge keeps the legs; refuse (with the alert `Too big for that edge — reduce the size first.`) when a leg
    would exceed the new edge's dimensions.
  - `DimensionField label="Size" value={f.legFace === f.legAlong ? f.legFace : null}
    max={Math.min(board[f.face], board[f.along])} onCommit={(v) => setC({ legFace: v, legAlong: v })}` (a `null` value
    shows "mixed" for a hand-edited unequal chamfer; committing sets both legs equal).
  - `setC(patch)` → `updateAngleCut(board.id, cut.id, chamferCut({ ...f, ...patch }, board))`.

  A bevel or chamfer whose fields are null falls through to the existing read-only branch (line + remove). Update the
  `AngleRow` doc comment: "every kind is edited; a stored cut the row cannot represent shows its line and Remove."

- [ ] **Step 3: Add the menu items** to the `+ Add ▾` Popover, after the miter items:
  `{ label: 'Bevel', detail: '15° along one edge', run: () => addAngleCuts(board.id, [defaultBevel(board)]) }` and
  `{ label: 'Chamfer', detail: 'Knock off one edge at 45°', run: () => addAngleCuts(board.id, [defaultChamfer(board)]) }`.
  Withhold Bevel when `board.thickness * miterRatio(15) > board.width` (its default would remove more than the width) —
  the same add-time rule chunk 2 applies to miters.

- [ ] **Step 4: Run `AngleCuts.test.tsx`, `npm run build`, `npm test`.** Expected: PASS.

- [ ] **Step 5: Mutate** — remove the bevel depth refusal → Review Focus 4 fails; remove the Size `max` → Review Focus 3
  fails; route the chamfer Size commit to `legFace` only → the size test fails. Restore.

- [ ] **Step 6: Commit** — `feat(angle cuts): Bevel and Chamfer rows and menu items`.

---

### Task 4: Live check and record

**Files:** `docs/browser-verification-angle-cuts.md` (append "Chunk 3: bevels and chamfers"), screenshots
`docs/img/angle-cuts-bevel-*.png`, the spec Status line, `docs/follow-ups.md` (next free number for anything found).

Rules: dev server only (`npm run dev -- --port 5183`), Playwright MCP only, absolute screenshot paths, never
`localStorage.clear()`, delete only the check's project, no paid calls.

- [ ] **Step 1:** A 30 × 18 × 3/4 panel; **+ Add ▾ → Bevel** on each long edge (Face: width min side, then width max
  side), set 15° and 30°; record the two lines (long point named) and screenshot. Bevels run along the length only
  (Global Constraints): note in the section that an end bevel is drawn as a miter across the thickness, and file a
  follow-up if a raised-panel field bevel on the ends needs its own preset.
- [ ] **Step 2:** A 1-1/2 × 1-1/2 leg: **+ Add ▾ → Chamfer** on its four long edges (Edge select); record the four lines;
  set one size to 3/16; try 2 (refused). Screenshot the leg with edge lines on the chamfers.
- [ ] **Step 3:** Cut list and part diagram for both parts; Plans sheet hidden lines; explode → controls disabled.
- [ ] **Step 4:** Delete the project; confirm via the library index; stop the server. Write the section; update the spec
  Status ("chunk 3 implemented …, not yet deployed") and follow-ups; commit docs only.

---

## After the plan

Merge `angle-cuts-3` with `--no-ff` after the final review; deploy on the user's word (no schema change; rollback to
`80e41b6` / `index-b4ad9aBu.js` is free). After a deploy: CLAUDE.md Status (angle cuts complete) and a Rounds row,
`docs/history.md`, `DEPLOYMENT.local.md`, `docs/feature-gaps.md` ("Miters and bevels: shipped").
