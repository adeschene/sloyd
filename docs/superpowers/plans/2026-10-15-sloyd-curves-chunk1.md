# Curves, chunk 1 (primitive through bench) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A part can carry curve cuts (`Board.curves`, schema 17) — arcs cut clean through it — that the 3D view, edges,
section caps, snap points and cut list show truly; the user can add and edit an **Arch**, **Half-round notch**, **Bow**,
**Rounded corner** or **Rounded corners** by hand; Add joinery, Refine and Repair joints stay away from curved documents.

**Architecture:** One new primitive (`CurveCut`: a closed waste outline of line and arc segments in a face's (u, v),
extruded through one dimension) beside `cuts`, `angleCuts` and `holes`. `curves.ts` is the ONE place curves become
outlines (arc math, chords to a tolerance, inside tests, faults, presets). `boardBodies` removes each curve's waste from
the convex bodies — **clipping** them by chord half-planes when the wood left is convex (corners, bows), **splitting** them
along the waste's convex pieces otherwise (arches, notches) — so bodies stay convex and every body reader (section caps,
drawings, occluders, picking) works unchanged. A curved part's edges are **built** (`curvedEdges`: `unionOutline` on the
planes square to `through`, then `bodyEdges` on everything else with the lines at smooth outline points dropped), never
rediscovered over its slices. A part with no curves keeps every existing code path byte-for-byte.

**Tech Stack:** TypeScript, React, Zustand, react-three-fiber/three.js, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-10-15-sloyd-curves-design.md` (approved 2026-10-15). Read it, and `CLAUDE.md`'s
invariants 2, 4, 5, 15, 16, 19, 24, 27, 33, 35, 40, 41, 44, 45, 46, 47, 48, 50, 51, 52, before Task 1. The holes chunk 1
plan (`docs/superpowers/plans/2026-10-14-sloyd-holes-chunk1.md`) is the precedent for nearly every site below: where this
plan says "as holes do", open that site's `holes` line and add the `curves` line beside it.

## Global Constraints

- Work on a local branch `curves`; merge with `git merge --no-ff` into `master`, verify the merged tree, delete the branch.
  **No pull requests.** Merge and deploy happen only on the user's word.
- `CURRENT_VERSION` becomes **17**. Versioning row: `16→17 · curves (default [], malformed entry dropped, unknown segment
  type refuses the document) · document-level, no step · silent loss on round trip (every curve dropped)`.
- Stored values are exact; display rounds. `38mm` typed stores `38 / 25.4`, unrounded. A rise or radius is never
  re-derived and written back.
- Constants: `CURVE_TOLERANCE = 0.005` (inches, chord sagitta for the model), `CURVE_SEGMENTS_MAX = 24` (chords per arc,
  model), `CURVE_SEGMENTS_STORED_MAX = 64` (segments per stored curve; more is dropped on load), `CURVE_EPS = 1e-9`,
  `SMOOTH_EPS = 1e-7` (matching a body vertex to an outline point).
- Wording uses the existing vocabulary: `edgeName` / `endWord` from `holeText.ts` ("the width min side", "the length max
  end"). Lengths through `formatLength(v, units)` with the DOCUMENT's units (invariant 52).
- `CURVE_FIELDS` (every field of `CurveCut` but `id`, `satisfies`) is the one "same curve" table (invariant 40's pattern).
- Rules from CLAUDE.md that bind every task: invariants 1, 4 (no no-op undo entries), 5 (DimensionField refuses, never
  clamps), 15, 16, 19, 24, 27, 33, 36, 41, 44, 45, 46, 47, 48, 50, 52.
- `npm test` does not typecheck. **Run `npm run build` before claiming any task compiles, and the FULL `npm test` after
  any task that changes a type or a reader** — `as Board` casts and hand-written fixtures get past the compiler and crash
  at runtime when a reader starts reading `board.curves`.
- `src/viewport/holesPerf.test.ts` and `sectionPerf.test.ts` are wall-clock guards that flake under load (fu 340): re-run
  a failure alone before treating it as real. `curvesPerf.test.ts` (Task 8) is the same kind.
- **Mutate every test this plan supplies** (break the code it pins, see it fail, restore) before trusting it. Each task
  lists its mutations. Plan-supplied code and numbers have been wrong more than ten times in this repo: fix the code, not
  the expectation; re-derive a number by hand before changing it; escalate when an expectation itself looks wrong.
- Chunk 1 has no drawing-specific work: the Plans sheet shows curves through `partGeometry`'s edges at the model's
  tolerance; part diagrams are chunk 2.

## Planning rulings (spec gaps found while writing this plan — for the user's review with the plan)

- **P1 — Explicit closure.** A stored outline's last segment ends exactly at `start` (`to` equal to `start`, both
  numbers `===`); an outline that does not close is malformed and dropped on load. (The spec says "back to start"; this
  makes it checkable.)
- **P2 — A Bow is stored at the edge's length when written; a resize does not stretch it.** Every Bow edit (Rise,
  Through, Side) rewrites it at the CURRENT edge length. When the stored span differs from the edge, the bench line says
  `… over 18" from the length min end …` and the row shows that as its note. (Positions are stored, as every cut's are;
  stretching on resize would be a hidden write.)
- **P3 — Air at the waste's straight sides.** For the stock probe (snap points), a point inside the closed waste is air,
  except a point ON an arc or on a straight side that is not on the part's face boundary — those are the kept surface. So
  the lattice point in the middle of an arched edge is withheld (it is gone), and an arc's end is kept.
- **P4 — Fault words.** `runs-off` reads `runs past the length max end` (the first side it passes, u min, u max, v min,
  v max). `cuts-through` reads `cuts right through the part` (the spec's "to the width max side" has no single answer
  for a general outline). A hole into a curve reads `hole 3 runs into the arch` / `the bow` / `the rounded corner` /
  `a curve cut` (the curve's derived kind).
- **P5 — Snap kinds.** An arc's ends are `'corner'`, its crown `'edge-mid'`, its centre `'face-center'` (the hole-centre
  precedent), each on both faces square to `through`; a point outside the face rectangle is not offered.
- **P6 — The clip path's decider.** A curve CLIPS (no new bodies) when every arc bows into the waste and every straight
  side lies along the face rectangle's boundary; otherwise it SPLITS. Both give the same wood (pinned in Task 6).
- **P7 — Through-suffix placement.** A curve cut through a dimension other than the thickness ends its line
  `, cut through the width` (after the radius bracket).

## Review Focus

1. **An arched apron shortened until its arch runs past the end**: the curve is kept unchanged, the Properties row shows
   `Runs past the length max end at this size.`, an edit that does not ADD a fault is accepted (a shorter span), and the
   cut-list line ends `— check: runs past the length max end`. Pinned in Tasks 4, 11 and 14.
2. **A curved part inside a mirrored assembly**: the copy shows the mirror-image curve (an off-centre arch on the other
   end); editing either side writes the stored curve back exactly; repeated identical edits do not rewrite the stored
   array. Pinned in Task 5.
3. **A hand-edited file**: a malformed curve (non-closing, crossing, a rise over half its chord) is dropped and the rest
   opens; a curve with `type: 'spline'` refuses the whole document with the newer-version message on every load path; a
   10,000-segment outline is dropped, not expanded. Pinned in Task 1.
4. **A rounded top that is also drilled, and an arch with a shelf-pin row near it**: a hole into the waste is a fault
   refused at authoring from either row; the mesh still has no internal walls and no membrane. Pinned in Tasks 8 and 10.
5. **Duplicating, linking and listing curved parts**: duplicates carry fresh curve ids; Link sees a curved part and a
   plain one as different; two parts with the same curves in a different order are one cut-list row; four equal corners
   print as one line. Pinned in Tasks 2 and 11.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/document/types.ts` (modify) | `CurveSegment`, `CurveCut`, `Board.curves`; `BodyFace.curve` lives in `bodies.ts` |
| `src/document/curves.ts` (create) | THE curve model and geometry: `CURVE_FIELDS`, `curveValues`, `sameCurve`, `copyCurve`, `uvDims`, `mirrorCurveCut`; `localSegments`, `arcOf`, `curveOutline`, `bowsInto`, `smoothPoints`, `wasteContains`, `isAir`, `boundaryDistance`, `rectMeetsWaste`, `circleMeetsWaste`, `curvePlan`; `curveFaults`; the writers/readers (`archCurve`/`archFields`, `bowCurve`/`bowFields`, `cornerCurve`/`cornerFields`), `deriveCurveKind`, presets. Runtime imports: `geometry` only. |
| `src/document/curveText.ts` (create) | `curveLine`, `curveLines`, `curveFaultText`, `curveKindWord` — every curve string (→ `units`) |
| `src/document/curvedRefusal.ts` (create) | `curvedParts`, `curvedRefusal` |
| `src/document/document.ts` (modify) | schema 17, `validateCurveCuts` (with the unknown-type refusal), `createBoard` default, barrel exports |
| `src/document/links.ts`, `shapes.ts`, `treeOps.ts`, `treeEdit.ts`, `frames.ts`, `roleLinks.ts`, `generated.ts` (modify) | carry / compare / mirror `curves` |
| `src/document/refineDesign.ts`, `src/generate/refine.ts`, `src/generate/joints/tapers.ts`, `src/generate/joints/repair.ts` (modify) | the refusals |
| `src/document/bodies.ts` (modify) | `BodyFace.curve`; `clip`'s tag; `boardBodies`' curve paths; `bodyEdges`' line filter; `curvedEdges`; `geometryKey`; `partGeometry`/`boardEdges` |
| `src/document/cuts.ts` (modify) | `stockProbe`: the waste is air (P3) |
| `src/document/snapPoints.ts` (modify) | arc ends, crowns, centres |
| `src/document/holeFaults.ts`, `holeText.ts` (modify) | a hole into a curve's waste is `breaks-out` |
| `src/document/cutlist.ts` (modify) | curve lines and grouping |
| `src/document/turnFixtures.ts` (modify) | `chiralCurved(posture)` test fixture |
| `src/viewport/grainTiling.ts` (modify) | `boardUVSignature`; `bodyMesh` normals and seams for curved parts |
| `src/viewport/BoardMesh.tsx` (modify) | uses `bodyMesh`'s normals when given |
| `src/viewport/curvesPerf.test.ts` (create) | the rebuild guard |
| `src/store/store.ts` (modify) | `copyBoard`; `addCurves` / `updateCurve` / `removeCurve` |
| `src/panels/Curves.tsx` (create), `src/panels/Properties.tsx` (modify) | the Curves section |
| `docs/browser-verification-curves.md` (create) | the live pass |

---

### Task 1: The primitive, schema 17, validation, links

**Files:**
- Modify: `src/document/types.ts`, `src/document/document.ts`, `src/document/links.ts`, `src/document/generated.ts`
- Create: `src/document/curves.ts`
- Test: `src/document/curves.test.ts` (create), `src/document/document.test.ts`, `src/document/links.test.ts`

**Interfaces:**
- Produces: `CurveSegment`, `CurveCut` (types.ts); `Board.curves: CurveCut[]` (and `Shape.curves`, via `LINK_FIELDS`);
  from curves.ts (re-exported by document.ts): `CURVE_FIELDS`, `CURVE_KEYS`, `CURVE_EPS`, `CURVE_TOLERANCE`,
  `CURVE_SEGMENTS_MAX`, `CURVE_SEGMENTS_STORED_MAX`, `curveValues(c: Omit<CurveCut,'id'>): string`,
  `sameCurve(a, b): boolean`, `copyCurve(c: CurveCut): CurveCut`, `uvDims(through: Dimension): [Dimension, Dimension]`,
  `type P2 = [number, number]`; `CURRENT_VERSION === 17`.

- [ ] **Step 0: Branch**

```bash
cd /home/alec/docker/sloyd && git checkout -b curves
```

- [ ] **Step 1: Write the failing tests**

`src/document/curves.test.ts` (new):

```ts
import { describe, expect, it } from 'vitest';
import { copyCurve, curveValues, sameCurve, uvDims } from './curves';
import type { CurveCut } from './types';

/** An arch on a 30 × 5 apron: 3" in from each length end, 1-1/2" rise, on the width min side (spec §2.2). */
export const ARCH: CurveCut = {
  id: 'c1', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [3, 0],
  segments: [{ type: 'arc', to: [27, 0], side: 'left', rise: 1.5 }, { type: 'line', to: [3, 0] }],
};
/** The length-max / width-min corner of a 36 × 20 top rounded to 2". */
export const CORNER: CurveCut = {
  id: 'c2', through: 'thickness', uFrom: 'max', vFrom: 'min', start: [0, 0],
  segments: [{ type: 'line', to: [2, 0] }, { type: 'arc', to: [0, 2], side: 'left', radius: 2 }, { type: 'line', to: [0, 0] }],
};

describe('curve cuts (curves spec §2.1)', () => {
  it('uvDims: the other two dimensions in DIMENSION_ORDER', () => {
    expect(uvDims('thickness')).toEqual(['length', 'width']);
    expect(uvDims('width')).toEqual(['length', 'thickness']);
    expect(uvDims('length')).toEqual(['width', 'thickness']);
  });
  it('sameCurve ignores the id and sees every field, segments field by field', () => {
    expect(sameCurve(ARCH, { ...ARCH, id: 'other' })).toBe(true);
    const variants: CurveCut[] = [
      { ...ARCH, through: 'width' }, { ...ARCH, uFrom: 'max' }, { ...ARCH, vFrom: 'max' }, { ...ARCH, start: [3.5, 0] },
      { ...ARCH, segments: [{ type: 'arc', to: [27, 0], side: 'right', rise: 1.5 }, { type: 'line', to: [3, 0] }] },
      { ...ARCH, segments: [{ type: 'arc', to: [27, 0], side: 'left', rise: 1.25 }, { type: 'line', to: [3, 0] }] },
      { ...ARCH, segments: [{ type: 'arc', to: [27, 0], side: 'left', radius: 1.5 }, { type: 'line', to: [3, 0] }] },
      { ...ARCH, segments: [{ type: 'arc', to: [26, 0], side: 'left', rise: 1.5 }, { type: 'line', to: [3, 0] }] },
    ];
    for (const v of variants) expect(sameCurve(ARCH, v), curveValues(v)).toBe(false);
  });
  it('curveValues tells -0 from 0', () => {
    expect(curveValues({ ...ARCH, start: [3, -0] })).not.toBe(curveValues(ARCH));
  });
  it('copyCurve is equal and shares no array', () => {
    const c = copyCurve(CORNER);
    expect(c).toEqual(CORNER);
    expect(c.start).not.toBe(CORNER.start);
    expect(c.segments).not.toBe(CORNER.segments);
    expect(c.segments[1]!.to).not.toBe(CORNER.segments[1]!.to);
  });
});
```

Append to `src/document/document.test.ts` (it already imports `migrateDocument`, `createDocument`, `CURRENT_VERSION`,
`Board`, `DocumentError`; add any that are missing):

```ts
describe('schema 17: curves (curves spec §2.3, §2.4, §6.1)', () => {
  const v16 = (boards: unknown[], extra: Record<string, unknown> = {}) => ({ ...createDocument('C'), version: 16, boards, ...extra });
  const apron = { id: 'b1', name: 'Apron', length: 30, width: 5, thickness: 0.75, position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length', material: 'oak', cuts: [], angleCuts: [], holes: [] };
  const arch = { id: 'c1', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [3, 0], segments: [{ type: 'arc', to: [27, 0], side: 'left', rise: 1.5 }, { type: 'line', to: [3, 0] }] };
  const curvesOf = (doc: { boards: unknown[] }) => (doc.boards[0] as Board).curves;
  const at17 = (curves: unknown[]) => ({ ...v16([{ ...apron, curves }]), version: 17 });

  it('is version 17', () => {
    expect(CURRENT_VERSION).toBe(17);
  });
  it('defaults a v16 part to no curves', () => {
    expect(curvesOf(migrateDocument(v16([apron])))).toEqual([]);
  });
  it('keeps a well-formed curve exactly, a radius arc included', () => {
    const corner = { id: 'c2', through: 'thickness', uFrom: 'max', vFrom: 'min', start: [0, 0], segments: [{ type: 'line', to: [2, 0] }, { type: 'arc', to: [0, 2], side: 'left', radius: 2 }, { type: 'line', to: [0, 0] }] };
    expect(curvesOf(migrateDocument(at17([arch, corner])))).toEqual([arch, corner]);
  });
  it('drops malformed curves and keeps the rest (Review Focus 3)', () => {
    const seg = (s: Record<string, unknown>) => ({ ...arch, segments: [{ ...arch.segments[0], ...s }, arch.segments[1]] });
    const bad = [
      { ...arch, id: 'e1', through: 'depth' },
      { ...arch, id: 'e2', uFrom: 'top' },
      { ...arch, id: 'e3', start: [3] },
      { ...arch, id: 'e4', start: [3, NaN] },
      { ...arch, id: 'e5', segments: [] },
      { ...seg({ rise: 0 }), id: 'e6' },
      { ...seg({ rise: 12.5 }), id: 'e7' },                                    // over half the 24" chord
      { ...seg({ rise: undefined, radius: 11.9 }), id: 'e8' },               // under half the chord
      { ...seg({ radius: 50 }), id: 'e9' },                                  // both rise and radius
      { ...seg({ rise: undefined }), id: 'e10' },                            // neither
      { ...seg({ side: 'up' }), id: 'e11' },
      { ...seg({ to: [3, 0] }), id: 'e12' },                                 // zero-length chord
      { ...arch, id: 'e13', segments: [arch.segments[0]] },                  // does not close (P1)
      { ...arch, id: 'e14', start: [0, 0], segments: [{ type: 'line', to: [4, 4] }, { type: 'line', to: [4, 0] }, { type: 'line', to: [1, 3] }, { type: 'line', to: [0, 0] }] }, // crosses itself at (2, 2), area 2: only the crossing test drops it
      { ...arch, id: 'e15', start: [0, 0], segments: [{ type: 'line', to: [4, 0] }, { type: 'line', to: [0, 0] }] }, // no area
      { ...arch, id: 'e16', segments: Array.from({ length: 70 }, () => ({ type: 'line', to: [3, 0] })) },  // too many segments
      { ...arch, id: 'e17', segments: [{ ...arch.segments[0], type: undefined }, arch.segments[1]] },     // no type: malformed, not refused
      'nonsense',
    ];
    expect(curvesOf(migrateDocument(at17([...bad, arch]))).map((c) => c.id)).toEqual(['c1']);
  });
  it('keeps a Bow, whose arc touches the edge at its crown (touching is not crossing)', () => {
    const bow = { id: 'c3', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0], segments: [{ type: 'line', to: [0, 0.5] }, { type: 'arc', to: [30, 0.5], side: 'right', rise: 0.5 }, { type: 'line', to: [30, 0] }, { type: 'line', to: [0, 0] }] };
    expect(curvesOf(migrateDocument(at17([bow])))).toEqual([bow]);
  });
  it('keeps a faulted but well-formed curve (an arch past the end)', () => {
    const off = { ...arch, segments: [{ type: 'arc', to: [40, 0], side: 'left', rise: 1.5 }, { type: 'line', to: [3, 0] }] };
    expect(curvesOf(migrateDocument(at17([off])))).toEqual([off]);
  });
  it('an unknown segment type refuses the whole document, on a part and on a shape (spec §2.4)', () => {
    const spline = { ...arch, segments: [{ type: 'spline', to: [27, 0], through: [[15, 2]] }, arch.segments[1]] };
    expect(() => migrateDocument(at17([spline]))).toThrow(DocumentError);
    expect(() => migrateDocument(at17([spline]))).toThrow(/newer version of Sloyd/);
    const shaped = { id: 'b2', name: 'Apron 2', shape: 's1', position: [0, 0, 0], rotation: 0 };
    const withShape = { ...v16([shaped]), version: 17, shapes: [{ id: 's1', length: 30, width: 5, thickness: 0.75, posture: 'flat', grain: 'length', material: 'oak', cuts: [], angleCuts: [], holes: [], curves: [spline] }] };
    expect(() => migrateDocument(withShape)).toThrow(/newer version of Sloyd/);
  });
  it('repairs a duplicate curve id per board, the first keeping it (invariant 33)', () => {
    const ids = curvesOf(migrateDocument(at17([arch, { ...arch, start: [4, 0], segments: [{ type: 'arc', to: [26, 0], side: 'left', rise: 1 }, { type: 'line', to: [4, 0] }] }]))).map((c) => c.id);
    expect(ids[0]).toBe('c1');
    expect(ids[1]).not.toBe('c1');
  });
  it('gives a Shape its own curves', () => {
    const shaped = { id: 'b2', name: 'Apron 2', shape: 's1', position: [0, 0, 0], rotation: 0 };
    const doc = migrateDocument({ ...v16([shaped]), version: 17, shapes: [{ id: 's1', length: 30, width: 5, thickness: 0.75, posture: 'flat', grain: 'length', material: 'oak', cuts: [], angleCuts: [], holes: [], curves: [arch] }] });
    expect(doc.shapes[0]!.curves).toEqual([arch]);
  });
});
```

Append to `src/document/links.test.ts` (import `createBoard` from `./document`, `sameShared`, `sharedOf` from `./links`
if not already imported; import `ARCH` from `./curves.test`):

```ts
describe('links see curves (curves spec §6.2)', () => {
  const a = createBoard({ id: 'a', curves: [ARCH] });
  it('a curved part and a plain one are not the same shared part', () => {
    expect(sameShared(a, { ...a, id: 'b', curves: [] })).toBe(false);
  });
  it('equal curves with equal ids are the same; a changed rise or id is not', () => {
    expect(sameShared(a, { ...a, id: 'b', curves: [{ ...ARCH }] })).toBe(true);
    expect(sameShared(a, { ...a, id: 'b', curves: [{ ...ARCH, id: 'zz' }] })).toBe(false);
    expect(sameShared(a, { ...a, id: 'b', curves: [{ ...ARCH, segments: [{ type: 'arc', to: [27, 0], side: 'left', rise: 1 }, { type: 'line', to: [3, 0] }] }] })).toBe(false);
  });
  it('sharedOf copies the curves', () => {
    expect(sharedOf(a).curves).toEqual([ARCH]);
    expect(sharedOf(a).curves[0]).not.toBe(ARCH);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/document/curves.test.ts src/document/document.test.ts src/document/links.test.ts`
Expected: FAIL — `./curves` does not exist; `CURRENT_VERSION` is 16.

- [ ] **Step 3: Implement**

`src/document/types.ts` — after `HoleRow`:

```ts
/**
 * One step of a curve cut's outline (curves spec §2.1), from the previous point to `to`, in STORED (u, v): each
 * coordinate measured from its named end (`uFrom`, `vFrom`). An arc is the MINOR arc (at most a half circle) bowing
 * toward `side` of its chord — left or right of travel from its start to `to`, in stored (u, v) with u to the right and v
 * up — fixed by `rise` (the sagitta) or by `radius`, whichever the user typed; the other is derived, never stored. A later
 * round adds segment types; a build that meets one it does not know refuses the document (spec §2.4).
 */
export type CurveSegment =
  | { type: 'line'; to: [number, number] }
  | { type: 'arc'; to: [number, number]; side: 'left' | 'right'; rise: number; radius?: never }
  | { type: 'arc'; to: [number, number]; side: 'left' | 'right'; radius: number; rise?: never };

/**
 * A cut clean through one dimension of a part along a curved outline (curves spec §2): the WASTE is the region the
 * closed outline encloses — `start`, then each segment, the last ending exactly at `start` — extruded through `through`.
 * u and v are the other two dimensions in DIMENSION_ORDER (`uvDims`). Board-local, so turns and postures cost nothing.
 * No `kind`: the preset (Arch, Bow, Rounded corner) is derived from the stored form (`deriveCurveKind`).
 */
export interface CurveCut {
  /** Unique within its board (per shape for a shape) — invariant 33's scopes. */
  id: string;
  through: Dimension;
  uFrom: CutFrom;
  vFrom: CutFrom;
  start: [number, number];
  segments: CurveSegment[];
}
```

and in `Board`, after `holes`:

```ts
  /** Curve cuts through the part (curves spec §2). Empty for most parts. */
  curves: CurveCut[];
```

`src/document/curves.ts` (new; Tasks 3–5 and 14 add to it):

```ts
import type { CurveCut, CurveSegment, Dimension } from './types';
import { DIMENSION_ORDER } from './geometry';

/** A point in a face's (u, v). */
export type P2 = [number, number];

/** Inches: closed tests on the true arcs (faults, inside, distance). Far below any bench precision. */
export const CURVE_EPS = 1e-9;
/** Inches: a chord's greatest gap to its arc in the model — viewport, bodies, caps, snap probe (spec §3.1). */
export const CURVE_TOLERANCE = 0.005;
/** Chords per arc in the model, at most (spec §3.1; the timing spike, §3.6). */
export const CURVE_SEGMENTS_MAX = 24;
/** Segments per stored curve, at most: a hand-edited file with more is dropped on load, not expanded (Review Focus 3). */
export const CURVE_SEGMENTS_STORED_MAX = 64;

/**
 * Every field of `CurveCut` that decides "same curve": all but `id` (spec §6.1). A TABLE CHECKED AGAINST THE TYPE
 * (invariant 40's pattern): a new `CurveCut` field fails `tsc` here, and in FIELD_TEXT below, until it is listed.
 */
export const CURVE_FIELDS = {
  through: true, uFrom: true, vFrom: true, start: true, segments: true,
} as const satisfies Record<Exclude<keyof CurveCut, 'id'>, true>;
export const CURVE_KEYS = Object.keys(CURVE_FIELDS) as (keyof typeof CURVE_FIELDS)[];

/** Exact: String() round-trips a finite number; -0 is told from 0. */
const num = (n: number) => (Object.is(n, -0) ? '-0' : String(n));
const segText = (s: CurveSegment) => (s.type === 'line'
  ? `L${num(s.to[0])},${num(s.to[1])}`
  : `A${num(s.to[0])},${num(s.to[1])},${s.side},${s.rise !== undefined ? `r${num(s.rise)}` : `R${num(s.radius!)}`}`);
const FIELD_TEXT: { [K in keyof typeof CURVE_FIELDS]: (v: CurveCut[K]) => string } = {
  through: (v) => v, uFrom: (v) => v, vFrom: (v) => v,
  start: (v) => `${num(v[0])},${num(v[1])}`,
  segments: (v) => v.map(segText).join(' '),
};

/** One curve's comparable value, exact, in CURVE_KEYS order (the cut list's grouping and geometryKey read it). */
export function curveValues(c: Omit<CurveCut, 'id'>): string {
  return CURVE_KEYS.map((k) => (FIELD_TEXT[k] as (v: unknown) => string)(c[k])).join('|');
}

/** Exact equality on every CURVE_FIELDS field (stored values, invariant 18). */
export function sameCurve(a: Omit<CurveCut, 'id'>, b: Omit<CurveCut, 'id'>): boolean {
  return curveValues(a) === curveValues(b);
}

/** A deep copy: no two parts ever hold one array. */
export function copyCurve(c: CurveCut): CurveCut {
  return { ...c, start: [c.start[0], c.start[1]], segments: c.segments.map((s) => ({ ...s, to: [s.to[0], s.to[1]] }) as CurveSegment) };
}

/** u and v of a cut through `through`: the other two dimensions, in DIMENSION_ORDER. */
export function uvDims(through: Dimension): [Dimension, Dimension] {
  return DIMENSION_ORDER.filter((d) => d !== through) as [Dimension, Dimension];
}

/** Twice the signed area of a closed polygon. */
export function twiceArea(pts: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a;
}

/** Two closed segments CROSS: they meet at a point interior to both, transversally. Touching at an end, or a
 *  collinear overlap, is not crossing (the Bow touches its edge at its crown). */
export function segmentsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  const s = (x: number) => (x > CURVE_EPS ? 1 : x < -CURVE_EPS ? -1 : 0);
  return s(d1) * s(d2) < 0 && s(d3) * s(d4) < 0;
}
```

`src/document/document.ts`:
1. Import `CurveCut`, `CurveSegment` with the other types; import `CURVE_SEGMENTS_STORED_MAX`, `segmentsCross`,
   `twiceArea` from `./curves`.
2. Add `CurveCut, CurveSegment` to the `export type { … } from './types'` list, and
   `export { CURVE_EPS, CURVE_FIELDS, CURVE_KEYS, CURVE_SEGMENTS_MAX, CURVE_SEGMENTS_STORED_MAX, CURVE_TOLERANCE, copyCurve, curveValues, sameCurve, uvDims } from './curves';`
   beside the hole barrel line, and `export type { P2 } from './curves';`.
3. `createBoard`: `curves: [],` after `holes: [],`.
4. Versioning comment, after the v16 paragraph:

```ts
 * v17 (curves spec §6.1): `Board.curves` (and `Shape.curves`), document-level, no step — an absent field defaults to [].
 * Harm a v16 build would do: silent loss on round trip — it drops every curve and autosaves. From v17 on, a segment
 * type this build does not know refuses the document (spec §2.4), so a later segment type needs no bump.
```

   and `export const CURRENT_VERSION = 17;`
5. After `validateHoleRows`:

```ts
/** A segment `type` this build cannot draw (spec §2.4): the whole document is refused, as a newer version is. */
function refuseUnknownSegment(type: string): never {
  throw new DocumentError(
    `This project has a curve this version of Sloyd can't read (segment type "${type}") — it was saved by a newer version of Sloyd.`,
  );
}

/**
 * Curve cuts (curves spec §2.3), in order. Dropped, never clamped: an unknown dimension or side; a start that is not two
 * finite numbers; no segments or more than CURVE_SEGMENTS_STORED_MAX; a segment with no string `type`, a `to` that is not
 * two finite numbers; an arc with an unknown `side`, both or neither of `rise`/`radius`, a non-positive one, a
 * zero-length chord, a rise over half its chord or a radius under half; an outline whose last `to` is not exactly `start`
 * (P1), that crosses itself, or that encloses no area. A STRING `type` other than line/arc REFUSES THE DOCUMENT (spec
 * §2.4). A faulted but well-formed curve (curveFaults) is KEPT. Ids scoped to this board, or this shape (invariant 33).
 */
function validateCurveCuts(raw: unknown): CurveCut[] {
  if (!Array.isArray(raw)) return [];
  const out: CurveCut[] = [];
  const seen = new Set<string>();
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && finite(v[0]) && finite(v[1]);
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Record<string, unknown>;
    const segsRaw = c.segments;
    // The refusal is decided before anything else about this curve: a newer build's curve must never be dropped quietly.
    if (Array.isArray(segsRaw)) {
      for (const s of segsRaw) {
        const t = (s as Record<string, unknown> | null)?.type;
        if (typeof t === 'string' && t !== 'line' && t !== 'arc') refuseUnknownSegment(t);
      }
    }
    if (!VALID_DIMENSIONS.includes(c.through as Dimension)) continue;
    if (![c.uFrom, c.vFrom].every((f) => VALID_FROMS.includes(f as CutFrom))) continue;
    if (!pair(c.start)) continue;
    if (!Array.isArray(segsRaw) || segsRaw.length === 0 || segsRaw.length > CURVE_SEGMENTS_STORED_MAX) continue;
    const segments: CurveSegment[] = [];
    let at: [number, number] = [c.start[0], c.start[1]];
    let ok = true;
    for (const sr of segsRaw) {
      const s = sr as Record<string, unknown> | null;
      if (!s || !pair(s.to)) { ok = false; break; }
      const to: [number, number] = [s.to[0], s.to[1]];
      if (s.type === 'line') {
        segments.push({ type: 'line', to });
      } else if (s.type === 'arc') {
        const chord = Math.hypot(to[0] - at[0], to[1] - at[1]);
        const hasRise = s.rise !== undefined;
        const hasRadius = s.radius !== undefined;
        if (s.side !== 'left' && s.side !== 'right') { ok = false; break; }
        if (hasRise === hasRadius || chord <= CURVE_EPS) { ok = false; break; }
        if (hasRise) {
          if (!finite(s.rise) || s.rise <= 0 || s.rise > chord / 2) { ok = false; break; }
          segments.push({ type: 'arc', to, side: s.side, rise: s.rise });
        } else {
          if (!finite(s.radius) || s.radius <= 0 || s.radius < chord / 2) { ok = false; break; }
          segments.push({ type: 'arc', to, side: s.side, radius: s.radius });
        }
      } else { ok = false; break; }
      at = to;
    }
    if (!ok) continue;
    if (at[0] !== c.start[0] || at[1] !== c.start[1]) continue;           // P1: closes exactly
    // Crossing and area are judged on the stored points with each arc as its chord and crown — enough to catch a
    // hand-edited figure eight; the true arcs are the model's business (curves.ts).
    const pts: [number, number][] = [[c.start[0], c.start[1]]];
    let prev: [number, number] = [c.start[0], c.start[1]];
    for (const s of segments) {
      if (s.type === 'arc') {
        const dx = s.to[0] - prev[0], dy = s.to[1] - prev[1];
        const ch = Math.hypot(dx, dy);
        const h = s.rise !== undefined ? s.rise : s.radius! - Math.sqrt(Math.max(0, s.radius! ** 2 - ch * ch / 4));
        const sg = s.side === 'left' ? 1 : -1;
        pts.push([(prev[0] + s.to[0]) / 2 - sg * h * dy / ch, (prev[1] + s.to[1]) / 2 + sg * h * dx / ch]);
      }
      pts.push([s.to[0], s.to[1]]);
      prev = s.to;
    }
    pts.pop();                                                             // the closing point repeats start
    if (Math.abs(twiceArea(pts)) <= CURVE_EPS) continue;
    let crosses = false;
    for (let i = 0; i < pts.length && !crosses; i += 1) {
      for (let j = i + 2; j < pts.length; j += 1) {
        if (i === 0 && j === pts.length - 1) continue;                     // neighbours across the closing point
        if (segmentsCross(pts[i]!, pts[(i + 1) % pts.length]!, pts[j]!, pts[(j + 1) % pts.length]!)) { crosses = true; break; }
      }
    }
    if (crosses) continue;
    out.push({ id: takeId(c.id, seen), through: c.through as Dimension, uFrom: c.uFrom as CutFrom, vFrom: c.vFrom as CutFrom, start: [c.start[0], c.start[1]], segments });
  }
  return out;
}
```

   (`VALID_DIMENSIONS`, `VALID_FROMS`, `takeId`, `DocumentError` are already in this file; confirm the names with
   `grep -n "VALID_DIMENSIONS\|VALID_FROMS" src/document/document.ts`.) The "no area" case `e15` has two points after
   `pop()`, area 0. `e14`'s edges (0,0)–(4,4) and (4,0)–(1,3) cross at (2, 2); its signed area is −2 (twice-area −4), so
   only the crossing test drops it — which is what its mutation in Step 7 relies on.
6. `validateSharedFields`' return gains `curves: validateCurveCuts(b.curves)`.

`src/document/links.ts`:
- `import { copyCurve, sameCurve } from './curves';`
- `LINK_FIELDS`: `… holes: 'shared', curves: 'shared',`
- `_sharedPrimitives`: `Exclude<SharedField, 'cuts' | 'angleCuts' | 'holes' | 'curves'>`; the comment above it and the
  `sameShared` doc comment name curves.
- `sharedOf`: `curves: b.curves.map(copyCurve),`
- `sharedPatch`: `if (patch.curves) out.curves = patch.curves.map(copyCurve);`
- `sameShared`, a branch after `holes`:

```ts
    } else if (k === 'curves') {
      if (a.curves.length !== b.curves.length) return false;
      for (let i = 0; i < a.curves.length; i += 1) {
        const ca = a.curves[i]!;
        const cb = b.curves[i]!;
        if (ca.id !== cb.id || !sameCurve(ca, cb)) return false;
      }
```

`src/document/generated.ts`: both `{ id: '', angleCuts: [], holes: [], ...fields } as Board` casts gain `curves: []`,
and the part's return becomes `return { ...fields, angleCuts, holes: [], curves: [] };` (Generate writes no curves, spec
§7; `DESIGN_SCHEMA` is untouched).

- [ ] **Step 4: Update the version pins**

`grep -n "toBe(16)" src/document/document.test.ts src/document/linksToShapes.test.ts src/storage/*.test.ts` — every
assertion about the document VERSION or `CURRENT_VERSION` becomes 17. Read each hit: **do not touch** a `toBe(16)` that
counts something else (snap points, segments, rows).

- [ ] **Step 5: Typecheck and fix fixtures**

Run: `npm run build`
Every hand-written `Board`/`Shape` literal the compiler now rejects for a missing `curves` gets `curves: []` beside its
`holes`. Then `grep -rn "as Board\b\|as StoredBoard\b\|as Shape\b" src` and read each cast that builds a part from a
literal: one without `curves` gets `curves: []` (the compiler cannot see these).

- [ ] **Step 6: Run the full suite** — `npm test`. Expected: PASS.

- [ ] **Step 7: Mutate**
- Remove the `refuseUnknownSegment` loop → the spline test fails (the curve is dropped instead). Restore.
- Change `> CURVE_SEGMENTS_STORED_MAX` to `> 1e9` → `e16` survives → fails. Restore.
- Remove the closure check (P1) → `e13` survives. Restore.
- Remove the crossing loop → `e14` survives. Restore.
- Drop the `curves` branch from `sameShared` → "equal curves" fails (different array objects). Restore.
- Remove `segments: true` from `CURVE_FIELDS` → `tsc` fails. Restore.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "curves: the CurveCut primitive, schema 17, validation and the unknown-segment refusal, links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01WqyEbwsWjdnvZC4aEAMAde"
```

---

### Task 2: Copies carry curves

**Files:**
- Modify: `src/document/shapes.ts`, `src/document/treeOps.ts` (two sites), `src/document/treeEdit.ts` (`copyDefinition`),
  `src/store/store.ts` (`copyBoard`), `src/document/roleLinks.ts` (`turnCandidates`)
- Test: `src/document/shapes.test.ts`, `src/document/treeOps.test.ts`, `src/store/store.test.ts`, `src/document/roleLinks.test.ts`

**Interfaces:**
- Consumes: `copyCurve` (Task 1).

- [ ] **Step 1: Write the failing tests** — copy each holes test of the same site (holes chunk 1 plan, Task 2) and swap
  the row for `ARCH` (import it from `./curves.test` or `../document/curves.test`):

`shapes.test.ts`:

```ts
describe('resolveBoard copies curves', () => {
  it('gives each user its own curves', () => {
    const shape = { id: 's1', length: 30, width: 5, thickness: 0.75, posture: 'flat' as const, grain: 'length' as const, material: 'oak', cuts: [], angleCuts: [], holes: [], curves: [ARCH] };
    const shapes = new Map([['s1', shape]]);
    const one = resolveBoard(shapes, { id: 'x', name: 'A1', position: [0, 0, 0], rotation: 0, shape: 's1' })!;
    const two = resolveBoard(shapes, { id: 'y', name: 'A2', position: [12, 0, 0], rotation: 0, shape: 's1' })!;
    expect(one.curves).toEqual([ARCH]);
    expect(one.curves).not.toBe(shape.curves);
    expect(one.curves[0]).not.toBe(two.curves[0]);
  });
});
```

`treeOps.test.ts` (beside the two hole tests, same `base()`):

```ts
  it('makeUniqueItem copies curves with their ids, sharing no curve object', () => {
    const doc = base();
    doc.definitions[0]!.boards[0] = createBoard({ id: 'b1', name: 'Apron', curves: [ARCH] });
    const out = makeUniqueItem(doc, 'i2')!;
    const i2 = out.instances.find((i) => i.id === 'i2')!;
    const copy = out.definitions.find((d) => d.id === i2.definition)!.boards[0] as Board;
    expect(copy.curves).toEqual([ARCH]);
    expect(copy.curves[0]).not.toBe(ARCH);
  });

  it('ungroupItem lifts a plain part with its curves, sharing no curve with the surviving definition', () => {
    const doc = base();
    doc.definitions[0]!.boards[0] = createBoard({ id: 'b1', name: 'Apron', curves: [ARCH] });
    const r = ungroupItem(doc, 'i1')!;
    const lifted = partAt(r.doc, r.rekey('i1/b1')) as Board;
    expect(lifted.curves).toEqual([ARCH]);
    expect((r.doc.definitions[0]!.boards[0] as Board).curves[0]).not.toBe(lifted.curves[0]);
  });
```

`store.test.ts` (Review Focus 5):

```ts
describe('duplicating a curved part (curves spec §6.2)', () => {
  it('gives the copy fresh curve ids and its own curves', () => {
    useStore.getState().replaceDocument({ ...createDocument('T'), boards: [createBoard({ id: 'apron', name: 'Apron', length: 30, width: 5, thickness: 0.75, curves: [ARCH] })] });
    useStore.getState().duplicateBoards(['apron']);
    const [a, b] = useStore.getState().doc.boards as Board[];
    expect(b!.curves).toHaveLength(1);
    expect(b!.curves[0]!.id).not.toBe(a!.curves[0]!.id);
    expect(sameCurve(a!.curves[0]!, b!.curves[0]!)).toBe(true);
    expect(b!.curves[0]!.segments).not.toBe(a!.curves[0]!.segments);
  });
});
```

`roleLinks.test.ts`:

```ts
  it('offers no turned candidates for a curved part (curves spec §7)', () => {
    const leg: Board = { ...createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }), curves: [{ ...ARCH, start: [3, 0], segments: [{ type: 'arc', to: [6, 0], side: 'left', rise: 0.5 }, { type: 'line', to: [3, 0] }] }] };
    expect(turnCandidates({ ...leg, curves: [] }).length).toBeGreaterThan(0);   // the guard refuses, not the box
    expect(turnCandidates(leg)).toEqual([]);
  });
```

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement**

- `shapes.ts` `resolveBoard`: add `: k === 'curves' ? s.curves.map(copyCurve)` before `: s[k]` (import `copyCurve`).
- `treeOps.ts`, both plain-part copies: append `, curves: placed.curves.map(copyCurve)` / `, curves: b.curves.map(copyCurve)`.
- `treeEdit.ts` `copyDefinition`: append `, curves: b.curves.map(copyCurve)` to the plain branch.
- `store.ts` `copyBoard`, plain branch, after the `holes` line (and the comment above it names curves):

```ts
      curves: source.curves.map((c) => ({ ...copyCurve(c), id: nextId() })),
```

- `roleLinks.ts` `turnCandidates`: `if (b.cuts.length > 0 || b.holes.length > 0 || b.curves.length > 0) return [];` and
  the doc comment says "None for a part with rectangular cuts, holes or curves, or a cut either cannot describe."

- [ ] **Step 4: Full suite and build** — `npm test && npm run build`: PASS.

- [ ] **Step 5: Mutate** — remove each of the six lines in turn; the matching test fails; restore.

- [ ] **Step 6: Commit** — `curves: copies carry curves` (with both trailer lines).

---

### Task 3: Arc geometry and the outline

**Files:**
- Modify: `src/document/curves.ts`, `src/document/document.ts` (barrel)
- Test: `src/document/curves.test.ts`

**Interfaces:**
- Produces (curves.ts, barrel-exported):
  - `interface LocalLine { kind: 'line'; a: P2; b: P2; segment: number }`,
    `interface LocalArc { kind: 'arc'; a: P2; b: P2; centre: P2; radius: number; rise: number; crown: P2; sweep: number; segment: number }`
    (`sweep`: signed radians from a to b about the centre, positive anticlockwise), `type LocalSeg = LocalLine | LocalArc`
  - `arcOf(a: P2, b: P2, side: 'left' | 'right', size: { rise: number } | { radius: number }, segment: number): LocalArc`
  - `localSegments(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>): LocalSeg[]` — board-local (u, v)
  - `arcChords(arc: LocalArc, tolerance: number, max: number): number` — the chord count
  - `interface Outline { pts: P2[]; arcEdge: boolean[]; smooth: boolean[] }` — `pts` closed implicitly; `arcEdge[i]`:
    the edge pts[i]→pts[i+1] is a chord of an arc; `smooth[i]`: the kept surface has no crease through pts[i]
  - `curveOutline(board, c, tolerance = CURVE_TOLERANCE, max = CURVE_SEGMENTS_MAX): Outline`
  - `bowsInto(segs: LocalSeg[], arc: LocalArc): 'wood' | 'waste'`

- [ ] **Step 1: Write the failing tests** (`curves.test.ts`)

```ts
import { arcOf, bowsInto, curveOutline, localSegments } from './curves';
import { createBoard } from './document';

const apron = createBoard({ length: 30, width: 5, thickness: 0.75 });
const top = createBoard({ length: 36, width: 20, thickness: 0.75 });
const close = (a: readonly number[], b: readonly number[], eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]!) <= eps);

describe('arcOf (spec §2.2)', () => {
  it('rise → radius, crown and centre: a 24" chord with a 1-1/2" rise is radius 48-3/4', () => {
    const a = arcOf([3, 0], [27, 0], 'left', { rise: 1.5 }, 0);
    expect(a.radius).toBe(48.75);
    expect(close(a.crown, [15, 1.5])).toBe(true);
    expect(close(a.centre, [15, -47.25])).toBe(true);
    expect(a.sweep).toBeLessThan(0);                                    // bowing left of travel: clockwise about the centre
  });
  it('radius → rise: a quarter circle of radius 2', () => {
    const a = arcOf([2, 0], [0, 2], 'left', { radius: 2 }, 0);
    expect(close(a.centre, [2, 2])).toBe(true);
    expect(a.rise).toBeCloseTo(2 - Math.SQRT2, 12);
    expect(Math.abs(a.sweep)).toBeCloseTo(Math.PI / 2, 12);
  });
  it('a half circle: rise = half the chord', () => {
    const a = arcOf([0, 0], [2, 0], 'right', { rise: 1 }, 0);
    expect(a.radius).toBe(1);
    expect(close(a.crown, [1, -1])).toBe(true);
    expect(Math.abs(a.sweep)).toBeCloseTo(Math.PI, 12);
  });
});

describe('localSegments: stored → board-local (spec §2.2)', () => {
  it('measures from the named ends, and a reflection flips the side', () => {
    const [arc] = localSegments(top, CORNER);                           // uFrom max: u = 36 - stored u
    expect(arc!.kind).toBe('line');
    const segs = localSegments(top, CORNER);
    const a = segs[1] as Extract<ReturnType<typeof localSegments>[number], { kind: 'arc' }>;
    expect(close(a.a, [34, 0])).toBe(true);
    expect(close(a.b, [36, 2])).toBe(true);
    expect(close(a.centre, [34, 2])).toBe(true);                        // the arc still bows toward the corner (36, 0)
    expect(close(a.crown, [36 - (2 - Math.SQRT2), 2 - Math.SQRT2])).toBe(true);
  });
});

describe('curveOutline (spec §3.1)', () => {
  it('chords meet the tolerance and every vertex lies on the true arc', () => {
    const o = curveOutline(apron, ARCH);
    const arc = localSegments(apron, ARCH)[0] as Extract<ReturnType<typeof localSegments>[number], { kind: 'arc' }>;
    const onArc = o.pts.filter((_, i) => o.arcEdge[i] || o.arcEdge[(i - 1 + o.pts.length) % o.pts.length]);
    for (const p of onArc) expect(Math.abs(Math.hypot(p[0] - arc.centre[0], p[1] - arc.centre[1]) - arc.radius)).toBeLessThan(1e-9);
    const chords = o.arcEdge.filter(Boolean).length;
    const sag = arc.radius * (1 - Math.cos(Math.abs(arc.sweep) / chords / 2));
    expect(sag).toBeLessThanOrEqual(0.005 + 1e-12);
    expect(chords).toBe(18);                                            // the spike's count for this arch
  });
  it('caps the chord count', () => {
    expect(curveOutline(apron, ARCH, 1e-6, 24).arcEdge.filter(Boolean).length).toBe(24);
  });
  it('smooth: interior chord vertices and a corner\'s tangent ends; an arch\'s ends are sharp', () => {
    const a = curveOutline(apron, ARCH);
    expect(a.smooth[0]).toBe(false);                                    // (3, 0): the arch leaves the edge at an angle
    expect(a.smooth.filter(Boolean).length).toBe(17);                   // the 17 interior vertices
    const c = curveOutline(top, CORNER);
    const at = (p: P2) => c.pts.findIndex((q) => close(q, p));
    expect(c.smooth[at([34, 0])]).toBe(true);                           // the straight side runs into the arc tangentially
    expect(c.smooth[at([36, 2])]).toBe(true);
    expect(c.smooth[at([36, 0])]).toBe(false);
  });
});

describe('bowsInto', () => {
  it('an arch bows into the wood; a corner and a bow into the waste', () => {
    const segs = localSegments(apron, ARCH);
    expect(bowsInto(segs, segs[0] as never)).toBe('wood');
    const cs = localSegments(top, CORNER);
    expect(bowsInto(cs, cs[1] as never)).toBe('waste');
    const bow: CurveCut = { id: 'b', through: 'thickness', uFrom: 'min', vFrom: 'min', start: [0, 0], segments: [{ type: 'line', to: [0, 0.5] }, { type: 'arc', to: [30, 0.5], side: 'right', rise: 0.5 }, { type: 'line', to: [30, 0] }, { type: 'line', to: [0, 0] }] };
    const bs = localSegments(apron, bow);
    expect(bowsInto(bs, bs[1] as never)).toBe('waste');
  });
});
```

(Import `P2` and `CurveCut` types. The 18 is the spike's count: half-angle `asin(12/48.75)`, sweep ≈ 0.4974 rad, chord angle
`2·acos(1 − 0.005/48.75)` ≈ 0.02864 rad → ceil(17.37) = 18. Re-derive it by hand before changing it.)

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement** (append to `curves.ts`; add `Board`, `CutFrom` to the type import)

```ts
export interface LocalLine { kind: 'line'; a: P2; b: P2; segment: number }
export interface LocalArc {
  kind: 'arc'; a: P2; b: P2; centre: P2; radius: number; rise: number; crown: P2;
  /** Signed radians from a to b about the centre: positive is anticlockwise in (u, v). */
  sweep: number;
  segment: number;
}
export type LocalSeg = LocalLine | LocalArc;

/**
 * The minor arc from a to b bowing toward `side` of its chord (spec §2.2): rise → radius (R = (c²/4 + h²) / 2h) or
 * radius → rise (h = R − √(R² − c²/4)); the crown is h from the chord's middle on `side`, the centre R − h on the other.
 * Bowing to the LEFT of travel runs CLOCKWISE about the centre (the centre is on the right).
 */
export function arcOf(a: P2, b: P2, side: 'left' | 'right', size: { rise: number } | { radius: number }, segment: number): LocalArc {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const c = Math.hypot(dx, dy);
  const m: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const nl: P2 = [-dy / c, dx / c];
  const s = side === 'left' ? 1 : -1;
  let radius: number;
  let rise: number;
  if ('rise' in size) { rise = size.rise; radius = (c * c / 4 + rise * rise) / (2 * rise); }
  else { radius = size.radius; rise = radius - Math.sqrt(Math.max(0, radius * radius - c * c / 4)); }
  const crown: P2 = [m[0] + s * rise * nl[0], m[1] + s * rise * nl[1]];
  const centre: P2 = [m[0] - s * (radius - rise) * nl[0], m[1] - s * (radius - rise) * nl[1]];
  const half = Math.asin(Math.min(1, c / (2 * radius)));
  return { kind: 'arc', a, b, centre, radius, rise, crown, sweep: -s * 2 * half, segment };
}

const flipSide = (s: 'left' | 'right') => (s === 'left' ? 'right' : 'left');

/**
 * A curve's segments in BOARD-LOCAL (u, v) (spec §2.2): a stored coordinate measured from `max` is `dim − c`. Exactly
 * one of the two measured from max is a reflection, which flips every arc's side; both is a half turn, which does not.
 */
export function localSegments(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>): LocalSeg[] {
  const [u, v] = uvDims(c.through);
  const map = (p: readonly number[]): P2 => [c.uFrom === 'min' ? p[0]! : board[u] - p[0]!, c.vFrom === 'min' ? p[1]! : board[v] - p[1]!];
  const reflected = (c.uFrom === 'max') !== (c.vFrom === 'max');
  const out: LocalSeg[] = [];
  let at = map(c.start);
  c.segments.forEach((s, i) => {
    const to = map(s.to);
    if (s.type === 'line') out.push({ kind: 'line', a: at, b: to, segment: i });
    else out.push(arcOf(at, to, reflected ? flipSide(s.side) : s.side, s.rise !== undefined ? { rise: s.rise } : { radius: s.radius! }, i));
    at = to;
  });
  return out;
}

/** Chords for one arc: the fewest whose sagitta is within `tolerance`, at least 1, at most `max`. */
export function arcChords(arc: LocalArc, tolerance: number, max: number): number {
  const step = tolerance >= 2 * arc.radius ? Math.PI : 2 * Math.acos(1 - tolerance / arc.radius);
  return Math.min(max, Math.max(1, Math.ceil(Math.abs(arc.sweep) / step - 1e-9)));
}

/** The arc's point at fraction t of its sweep (t = 0 is a, 1 is b — returned exactly). */
function arcPoint(arc: LocalArc, t: number): P2 {
  if (t === 0) return arc.a;
  if (t === 1) return arc.b;
  const t0 = Math.atan2(arc.a[1] - arc.centre[1], arc.a[0] - arc.centre[0]) + arc.sweep * t;
  return [arc.centre[0] + arc.radius * Math.cos(t0), arc.centre[1] + arc.radius * Math.sin(t0)];
}

/** A segment's unit direction of travel where it starts (`end` false) or ends (`end` true). */
function tangent(s: LocalSeg, end: boolean): P2 {
  if (s.kind === 'line') { const d = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]); return [(s.b[0] - s.a[0]) / d, (s.b[1] - s.a[1]) / d]; }
  const p = end ? s.b : s.a;
  const r: P2 = [(p[0] - s.centre[0]) / s.radius, (p[1] - s.centre[1]) / s.radius];
  return s.sweep > 0 ? [-r[1], r[0]] : [r[1], -r[0]];
}

export interface Outline {
  /** The waste's outline as a polygon, closed implicitly (the last point joins the first). */
  pts: P2[];
  /** arcEdge[i]: the edge pts[i] → pts[i + 1] is a chord of an arc. */
  arcEdge: boolean[];
  /** smooth[i]: the KEPT surface has no crease through pts[i] — an interior chord vertex, or a join where the two
   *  segments' true tangents are parallel either way (a rounded corner's straight sides run into the arc; the waste
   *  there is a cusp). An arch meeting its edge at an angle is not smooth (spec §3.3). */
  smooth: boolean[];
}

/** The waste outline at `tolerance` (spec §3.1): every arc as chords whose vertices lie ON the true arc. */
export function curveOutline(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>, tolerance = CURVE_TOLERANCE, max = CURVE_SEGMENTS_MAX): Outline {
  const segs = localSegments(board, c);
  const pts: P2[] = [];
  const arcEdge: boolean[] = [];
  const smooth: boolean[] = [];
  segs.forEach((s, i) => {
    const prev = segs[(i - 1 + segs.length) % segs.length]!;
    const tIn = tangent(prev, true);
    const tOut = tangent(s, false);
    pts.push(s.a);
    smooth.push(Math.abs(tIn[0] * tOut[1] - tIn[1] * tOut[0]) <= CURVE_EPS);
    if (s.kind === 'line') { arcEdge.push(false); return; }
    const n = arcChords(s, tolerance, max);
    arcEdge.push(true);
    for (let k = 1; k < n; k += 1) { pts.push(arcPoint(s, k / n)); arcEdge.push(true); smooth.push(true); }
  });
  return { pts, arcEdge, smooth };
}

/** Point in a closed polygon by ray parity; a point within CURVE_EPS of an edge counts as inside. */
export function inPolygonClosed(poly: readonly P2[], p: P2): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (distToSegment(p, a, b) <= CURVE_EPS) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

export function distToSegment(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** The outline's polygon with every arc replaced by its chord: the segments' start points. */
export function chordPolygon(segs: readonly LocalSeg[]): P2[] {
  return segs.map((s) => s.a);
}

/** Whether an arc bows into the WOOD (its crown outside the chord polygon: the waste grows — an arch) or into the
 *  WASTE (crown inside or on it: a rounded corner, a bow). Derived, for wording and the geometry path (spec §2.1). */
export function bowsInto(segs: readonly LocalSeg[], arc: LocalArc): 'wood' | 'waste' {
  return inPolygonClosed(chordPolygon(segs), arc.crown) ? 'waste' : 'wood';
}
```

Barrel (`document.ts`): export `arcOf`, `bowsInto`, `curveOutline`, `localSegments`, `arcChords` and the types
`LocalArc`, `LocalLine`, `LocalSeg`, `Outline`.

- [ ] **Step 4: Run, full suite, build** — PASS.

- [ ] **Step 5: Mutate** — flip `-s` to `s` in `sweep` (the arch test's sign fails, and the outline's on-arc test fails);
  drop `reflected ? flipSide(...)` (the corner's centre lands at (34, -2)); change `<= CURVE_EPS` in `smooth` to `< 0`
  (the corner's tangent ends read sharp); remove `Math.min(max, …)` (the cap test fails). Restore each.

- [ ] **Step 6: Commit** — `curves: arc geometry and the outline`.

---

### Task 4: Inside, distance, faults, writers and readers

**Files:**
- Modify: `src/document/curves.ts`, `src/document/document.ts` (barrel)
- Test: `src/document/curves.test.ts`

**Interfaces:**
- Produces (curves.ts, barrel-exported):
  - `boundaryDistance(segs: readonly LocalSeg[], p: P2): number` — to the TRUE outline
  - `wasteContains(segs: readonly LocalSeg[], p: P2, mode: 'closed' | 'open'): boolean`
  - `isAir(board, c, p: P2): boolean` (P3)
  - `circleMeetsWaste(segs, centre: P2, r: number): boolean`, `rectMeetsWaste(segs, lo: P2, hi: P2): boolean` (closed:
    touching meets)
  - `type CurveFaultKind = 'runs-off' | 'cuts-through'`; `interface CurveFault { kind: CurveFaultKind; edge?: { dim: Dimension; side: CutFrom } }`;
    `curveFaults(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>): CurveFault[]`
  - `interface ArchFields { through: Dimension; along: Dimension; side: CutFrom; from: CutFrom; start: number; span: number; rise: number }`,
    `archCurve(f: ArchFields): Omit<CurveCut, 'id'>`, `archFields(c: Omit<CurveCut, 'id'>): ArchFields | null`
  - `interface BowFields { through: Dimension; along: Dimension; side: CutFrom; span: number; rise: number }`, `bowCurve`, `bowFields`
  - `interface CornerFields { through: Dimension; uFrom: CutFrom; vFrom: CutFrom; radius: number }`, `cornerCurve`, `cornerFields`
  - `type CurveKind = 'arch' | 'bow' | 'corner'`; `deriveCurveKind(c): CurveKind | null`

- [ ] **Step 1: Write the failing tests** (`curves.test.ts`)

```ts
import {
  archCurve, archFields, bowCurve, bowFields, cornerCurve, cornerFields, curveFaults, deriveCurveKind,
  boundaryDistance, circleMeetsWaste, isAir, rectMeetsWaste, wasteContains,
} from './curves';

describe('inside and distance, on the true arcs', () => {
  const segs = localSegments(apron, ARCH);
  it('the crown is on the boundary; just under it is waste; the chord line is the boundary', () => {
    expect(boundaryDistance(segs, [15, 1.5])).toBeLessThan(1e-9);
    expect(wasteContains(segs, [15, 1.4], 'open')).toBe(true);
    expect(wasteContains(segs, [15, 1.6], 'closed')).toBe(false);
    expect(wasteContains(segs, [15, 0], 'closed')).toBe(true);
    expect(wasteContains(segs, [15, 0], 'open')).toBe(false);
  });
  it('a corner: the region between the corner and the arc; the chord line is NOT waste', () => {
    const cs = localSegments(top, CORNER);
    expect(wasteContains(cs, [35.9, 0.1], 'open')).toBe(true);
    expect(wasteContains(cs, [35, 1], 'closed')).toBe(false);          // on the chord (34,0)–(36,2), inside the arc's lens
  });
  it('isAir (P3): the middle of the arched edge is air; an arc end is not; the rect corner of a rounded corner is air', () => {
    expect(isAir(apron, ARCH, [15, 0])).toBe(true);
    expect(isAir(apron, ARCH, [3, 0])).toBe(false);
    expect(isAir(apron, ARCH, [15, 1.5])).toBe(false);
    expect(isAir(top, CORNER, [36, 0])).toBe(true);
    expect(isAir(top, CORNER, [20, 10])).toBe(false);
  });
  it('a circle meets the waste when it touches it', () => {
    expect(circleMeetsWaste(segs, [15, 2], 0.5)).toBe(true);           // touches the crown
    expect(circleMeetsWaste(segs, [15, 2], 0.5 - 1e-6)).toBe(false);
    expect(circleMeetsWaste(segs, [15, 0.5], 0.1)).toBe(true);         // inside
  });
  it('a rectangle meets the waste when it touches it', () => {
    expect(rectMeetsWaste(segs, [14, 1.5], [16, 3])).toBe(true);       // its edge touches the crown
    expect(rectMeetsWaste(segs, [14, 1.5 + 1e-6], [16, 3])).toBe(false);
    expect(rectMeetsWaste(segs, [0, 0], [2, 5])).toBe(false);          // beside the arch
  });
});

describe('curveFaults (spec §2.5)', () => {
  it('none for the arch, the corner and a bow', () => {
    expect(curveFaults(apron, ARCH)).toEqual([]);
    expect(curveFaults(top, CORNER)).toEqual([]);
    expect(curveFaults(apron, bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }))).toEqual([]);
  });
  it('runs-off: an arch on a shortened part names the side it passes (Review Focus 1)', () => {
    expect(curveFaults({ ...apron, length: 26 }, ARCH)).toEqual([{ kind: 'runs-off', edge: { dim: 'length', side: 'max' } }]);
  });
  it('cuts-through: a rise equal to the width touches the far side; just under it does not', () => {
    const deep = (rise: number) => archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise });
    expect(curveFaults({ ...apron, width: 1.5 }, deep(1.5))).toEqual([{ kind: 'cuts-through' }]);
    expect(curveFaults({ ...apron, width: 1.5 + 1e-6 }, deep(1.5))).toEqual([]);
  });
});

describe('writers and readers (spec §2.2 canonical forms)', () => {
  it('archCurve writes the spec\'s apron arch and archFields reads it back', () => {
    const f = { through: 'thickness' as const, along: 'length' as const, side: 'min' as const, from: 'min' as const, start: 3, span: 24, rise: 1.5 };
    const { id: _id, ...arch } = ARCH;
    expect(archCurve(f)).toEqual(arch);
    expect(archFields(archCurve(f))).toEqual(f);
  });
  it('an arch along v (on an end) round-trips', () => {
    const f = { through: 'thickness' as const, along: 'width' as const, side: 'max' as const, from: 'min' as const, start: 1, span: 3, rise: 0.5 };
    expect(archFields(archCurve(f))).toEqual(f);
    expect(archCurve(f).segments[0]).toMatchObject({ side: 'right' });
  });
  it('bow and corner round-trip; the spec\'s corner is cornerCurve', () => {
    const b = { through: 'width' as const, along: 'length' as const, side: 'max' as const, span: 18, rise: 0.5 };
    expect(bowFields(bowCurve(b))).toEqual(b);
    const c = { through: 'thickness' as const, uFrom: 'max' as const, vFrom: 'min' as const, radius: 2 };
    const { id: _id, ...corner } = CORNER;
    expect(cornerCurve(c)).toEqual(corner);
    expect(cornerFields(cornerCurve(c))).toEqual(c);
  });
  it('deriveCurveKind; a form no row represents is null', () => {
    expect(deriveCurveKind(ARCH)).toBe('arch');
    expect(deriveCurveKind(CORNER)).toBe('corner');
    expect(deriveCurveKind(bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }))).toBe('bow');
    expect(deriveCurveKind({ ...ARCH, segments: [{ type: 'arc', to: [27, 0], side: 'left', radius: 50 }, { type: 'line', to: [3, 0] }] })).toBeNull();
  });
});
```

(Hand derivations: the crown of ARCH is at v = 1.5; a circle centred 0.5 above it with r = 0.5 touches it. On a 26"
apron the arch's end (27, 0) is past u = 26: `runs-off` at the length max end; it does NOT cut through (its crown is at
1.5 of 5). With width 1.5 the crown touches v = 1.5: the boundary ∩ waste has two runs (the arched edge and the crown's
touch point) — cuts-through. The chord (34,0)–(36,2) of CORNER: (35, 1) is on it; distance from the centre (34, 2) is √2 <
2, so it is in the lens, in the chord triangle, hence not waste.)

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement** (append to `curves.ts`)

```ts
/** A point's distance to one TRUE segment (spec §3.1: never the chords). An arc: |p − C| − R when the ray from the centre
 *  through p meets the arc (that point lies on the crown's side of the chord), else the nearer end. */
function segDistance(s: LocalSeg, p: P2): number {
  if (s.kind === 'line') return distToSegment(p, s.a, s.b);
  const d = Math.hypot(p[0] - s.centre[0], p[1] - s.centre[1]);
  if (d > 0) {
    const q: P2 = [s.centre[0] + ((p[0] - s.centre[0]) * s.radius) / d, s.centre[1] + ((p[1] - s.centre[1]) * s.radius) / d];
    if (crownSide(s, q) >= -CURVE_EPS) return Math.abs(d - s.radius);
  }
  return Math.min(Math.hypot(p[0] - s.a[0], p[1] - s.a[1]), Math.hypot(p[0] - s.b[0], p[1] - s.b[1]));
}

/** Signed distance of p from an arc's chord line, positive toward the crown. */
function crownSide(s: LocalArc, p: P2): number {
  const dx = s.b[0] - s.a[0];
  const dy = s.b[1] - s.a[1];
  const c = Math.hypot(dx, dy);
  const nl = (-dy * (p[0] - s.a[0]) + dx * (p[1] - s.a[1])) / c;      // left of a→b
  const crownLeft = -dy * (s.crown[0] - s.a[0]) + dx * (s.crown[1] - s.a[1]) > 0;
  return crownLeft ? nl : -nl;
}

export function boundaryDistance(segs: readonly LocalSeg[], p: P2): number {
  return Math.min(...segs.map((s) => segDistance(s, p)));
}

/**
 * The waste as a set (spec §2.2): the chord polygon (CLOSED) XOR each arc's lens — the disc on the crown's side of the
 * chord, chord line included. A crown outside the polygon adds its lens (an arch); one inside removes it (a corner), so
 * a point on a corner's chord is not waste. A point within CURVE_EPS of the TRUE outline is in the waste when `mode` is
 * 'closed', out of it when 'open'; elsewhere the XOR decides unambiguously.
 */
export function wasteContains(segs: readonly LocalSeg[], p: P2, mode: 'closed' | 'open'): boolean {
  if (boundaryDistance(segs, p) <= CURVE_EPS) return mode === 'closed';
  let inside = inPolygonClosed(chordPolygon(segs), p);
  for (const s of segs) {
    if (s.kind !== 'arc') continue;
    if (Math.hypot(p[0] - s.centre[0], p[1] - s.centre[1]) < s.radius && crownSide(s, p) >= -CURVE_EPS) inside = !inside;
  }
  return inside;
}

/** Whether a straight side lies along the face rectangle's boundary (both ends on one side line). */
function onRectBoundary(board: Pick<Board, Dimension>, through: Dimension, s: LocalLine): boolean {
  const [u, v] = uvDims(through);
  const on = (k: 0 | 1, val: number) => Math.abs(s.a[k] - val) <= CURVE_EPS && Math.abs(s.b[k] - val) <= CURVE_EPS;
  return on(0, 0) || on(0, board[u]) || on(1, 0) || on(1, board[v]);
}

/**
 * Air for the stock probe (P3): inside the closed waste, except ON the kept surface — an arc, or a straight side that is
 * not along the face boundary. So the lattice point in the middle of an arched edge is air; an arc's end is stock.
 */
export function isAir(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>, p: P2): boolean {
  const segs = localSegments(board, c);
  if (!wasteContains(segs, p, 'closed')) return false;
  return !segs.some((s) => segDistance(s, p) <= CURVE_EPS && (s.kind === 'arc' || !onRectBoundary(board, c.through, s)));
}

/** Where a closed segment p0→p1 meets an arc (closed: tangency counts), as points. */
function segArcHits(p0: P2, p1: P2, s: LocalArc): P2[] {
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.abs(Math.hypot(p0[0] - s.centre[0], p0[1] - s.centre[1]) - s.radius) <= CURVE_EPS && crownSide(s, p0) >= -CURVE_EPS ? [p0] : [];
  const t0 = ((s.centre[0] - p0[0]) * dx + (s.centre[1] - p0[1]) * dy) / l2;
  const fx = p0[0] + t0 * dx - s.centre[0];
  const fy = p0[1] + t0 * dy - s.centre[1];
  const dist = Math.hypot(fx, fy);
  if (dist > s.radius + CURVE_EPS) return [];
  const half = Math.sqrt(Math.max(0, s.radius * s.radius - dist * dist)) / Math.sqrt(l2);
  const out: P2[] = [];
  for (const t of half === 0 ? [t0] : [t0 - half, t0 + half]) {
    if (t < -CURVE_EPS || t > 1 + CURVE_EPS) continue;
    const q: P2 = [p0[0] + t * dx, p0[1] + t * dy];
    if (crownSide(s, q) >= -CURVE_EPS) out.push(q);
  }
  return out;
}

/** Where a closed segment meets a line segment (closed): the crossing point, or both ends of a collinear overlap. */
function segSegHits(p0: P2, p1: P2, a: P2, b: P2): P2[] {
  const r: P2 = [p1[0] - p0[0], p1[1] - p0[1]];
  const s: P2 = [b[0] - a[0], b[1] - a[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  const qp: P2 = [a[0] - p0[0], a[1] - p0[1]];
  if (Math.abs(den) <= CURVE_EPS * Math.hypot(...r) * Math.hypot(...s)) {
    // Parallel: collinear overlap only.
    if (distToSegment(a, p0, p1) > CURVE_EPS && distToSegment(b, p0, p1) > CURVE_EPS && distToSegment(p0, a, b) > CURVE_EPS && distToSegment(p1, a, b) > CURVE_EPS) return [];
    return [a, b, p0, p1].filter((p) => distToSegment(p, p0, p1) <= CURVE_EPS && distToSegment(p, a, b) <= CURVE_EPS);
  }
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den;
  const w = (qp[0] * r[1] - qp[1] * r[0]) / den;
  const tol = 1e-12;
  return t >= -tol && t <= 1 + tol && w >= -tol && w <= 1 + tol ? [[p0[0] + t * r[0], p0[1] + t * r[1]]] : [];
}

/** Every point where a closed segment meets the true outline. */
function boundaryHits(segs: readonly LocalSeg[], p0: P2, p1: P2): P2[] {
  return segs.flatMap((s) => (s.kind === 'line' ? segSegHits(p0, p1, s.a, s.b) : segArcHits(p0, p1, s)));
}

/** A disc meets the waste (closed: touching meets) — a hole whose axis runs along `through` (spec §6.3). */
export function circleMeetsWaste(segs: readonly LocalSeg[], centre: P2, r: number): boolean {
  return wasteContains(segs, centre, 'closed') || boundaryDistance(segs, centre) <= r + CURVE_EPS;
}

/** An axis-aligned rectangle [lo, hi] meets the waste (closed) — a hole square to `through`, projected (spec §6.3). */
export function rectMeetsWaste(segs: readonly LocalSeg[], lo: P2, hi: P2): boolean {
  const corners: P2[] = [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]];
  if (corners.some((p) => wasteContains(segs, p, 'closed'))) return true;
  const inRect = (p: P2) => p[0] >= lo[0] - CURVE_EPS && p[0] <= hi[0] + CURVE_EPS && p[1] >= lo[1] - CURVE_EPS && p[1] <= hi[1] + CURVE_EPS;
  if (segs.some((s) => inRect(s.a) || (s.kind === 'arc' && inRect(s.crown)))) return true;
  return corners.some((p, i) => boundaryHits(segs, p, corners[(i + 1) % 4]!).length > 0);
}

export type CurveFaultKind = 'runs-off' | 'cuts-through';
export interface CurveFault { kind: CurveFaultKind; edge?: { dim: Dimension; side: CutFrom } }

/** The arc's points at 0°, 90°, 180°, 270° about its centre that lie on it: with its ends, its extremes in u and v. */
function arcExtremes(s: LocalArc): P2[] {
  const out: P2[] = [];
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    const q: P2 = [s.centre[0] + dx * s.radius, s.centre[1] + dy * s.radius];
    if (crownSide(s, q) >= -CURVE_EPS) out.push(q);
  }
  return out;
}

/**
 * THE fault decider (spec §2.5), exact against the true arcs:
 * - `runs-off`: a point of the outline outside the face rectangle (on it is allowed); the edge is the first side passed,
 *   in the order u min, u max, v min, v max (P4);
 * - `cuts-through`: the kept face is empty or in pieces — judged on the face's boundary loop: the parts of it inside the
 *   (closed) waste form two or more runs, or the whole loop. A touch counts (zero thickness is no wood).
 */
export function curveFaults(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>): CurveFault[] {
  const [u, v] = uvDims(c.through);
  const U = board[u];
  const V = board[v];
  const segs = localSegments(board, c);
  const out: CurveFault[] = [];
  const pts = segs.flatMap((s) => (s.kind === 'arc' ? [s.a, s.b, ...arcExtremes(s)] : [s.a, s.b]));
  const passes: [boolean, { dim: Dimension; side: CutFrom }][] = [
    [pts.some((p) => p[0] < -CURVE_EPS), { dim: u, side: 'min' }],
    [pts.some((p) => p[0] > U + CURVE_EPS), { dim: u, side: 'max' }],
    [pts.some((p) => p[1] < -CURVE_EPS), { dim: v, side: 'min' }],
    [pts.some((p) => p[1] > V + CURVE_EPS), { dim: v, side: 'max' }],
  ];
  const first = passes.find(([hit]) => hit);
  if (first) out.push({ kind: 'runs-off', edge: first[1] });
  // The boundary loop, parametrised from (0, 0) anticlockwise: the four sides as segments.
  const loop: [P2, P2][] = [[[0, 0], [U, 0]], [[U, 0], [U, V]], [[U, V], [0, V]], [[0, V], [0, 0]]];
  const samples: P2[] = [];
  for (const [p0, p1] of loop) {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const ts = [0, ...boundaryHits(segs, p0, p1).map((q) => Math.hypot(q[0] - p0[0], q[1] - p0[1]) / len)].sort((a, b) => a - b);
    const cuts: number[] = [];
    for (const t of ts) if (!cuts.length || t - cuts[cuts.length - 1]! > 1e-12) cuts.push(Math.max(0, Math.min(1, t)));
    if (cuts[cuts.length - 1]! < 1 - 1e-12) cuts.push(1);
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      const at = (t: number): P2 => [p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])];
      samples.push(at(cuts[k]!), at((cuts[k]! + cuts[k + 1]!) / 2));
    }
  }
  const inside = samples.map((p) => wasteContains(segs, p, 'closed'));
  if (inside.every(Boolean)) { out.push({ kind: 'cuts-through' }); return out; }
  // Runs of `true`, around the loop: count the starts (a true after a false).
  const runs = inside.filter((b, i) => b && !inside[(i - 1 + inside.length) % inside.length]).length;
  if (runs >= 2) out.push({ kind: 'cuts-through' });
  return out;
}

// ── Canonical forms (spec §2.2): one writer and one reader per row type. A reader returns null for a stored form its row
//    cannot represent exactly (the angle-cuts rule): the row then shows the bench line and Remove only.

export interface ArchFields { through: Dimension; along: Dimension; side: CutFrom; from: CutFrom; start: number; span: number; rise: number }

/** An Arch (or Half-round notch: rise = span / 2) on the `side` edge of the in-face dimension that is not `along`,
 *  from `start` to `start + span` measured from `from`'s end of `along`, bowing `rise` into the wood. */
export function archCurve(f: ArchFields): Omit<CurveCut, 'id'> {
  const [u] = uvDims(f.through);
  if (f.along === u) {
    return { through: f.through, uFrom: f.from, vFrom: f.side, start: [f.start, 0],
      segments: [{ type: 'arc', to: [f.start + f.span, 0], side: 'left', rise: f.rise }, { type: 'line', to: [f.start, 0] }] };
  }
  return { through: f.through, uFrom: f.side, vFrom: f.from, start: [0, f.start],
    segments: [{ type: 'arc', to: [0, f.start + f.span], side: 'right', rise: f.rise }, { type: 'line', to: [0, f.start] }] };
}

export function archFields(c: Omit<CurveCut, 'id'>): ArchFields | null {
  if (c.segments.length !== 2) return null;
  const [a, l] = c.segments as [CurveSegment, CurveSegment];
  if (a.type !== 'arc' || a.rise === undefined || l.type !== 'line') return null;
  if (l.to[0] !== c.start[0] || l.to[1] !== c.start[1]) return null;
  const [u, v] = uvDims(c.through);
  if (c.start[1] === 0 && a.to[1] === 0 && a.to[0] > c.start[0] && a.side === 'left') {
    return { through: c.through, along: u, side: c.vFrom, from: c.uFrom, start: c.start[0], span: a.to[0] - c.start[0], rise: a.rise };
  }
  if (c.start[0] === 0 && a.to[0] === 0 && a.to[1] > c.start[1] && a.side === 'right') {
    return { through: c.through, along: v, side: c.uFrom, from: c.vFrom, start: c.start[1], span: a.to[1] - c.start[1], rise: a.rise };
  }
  return null;
}

export interface BowFields { through: Dimension; along: Dimension; side: CutFrom; span: number; rise: number }

/** A Bow of the `side` edge along `along`, over `span` from that dimension's MIN end (P2: written at the edge length),
 *  bowing `rise` into the waste: the edge's middle stays, its ends come in by `rise`. */
export function bowCurve(f: BowFields): Omit<CurveCut, 'id'> {
  const [u] = uvDims(f.through);
  const { span: s, rise: h } = f;
  if (f.along === u) {
    return { through: f.through, uFrom: 'min', vFrom: f.side, start: [0, 0],
      segments: [{ type: 'line', to: [0, h] }, { type: 'arc', to: [s, h], side: 'right', rise: h }, { type: 'line', to: [s, 0] }, { type: 'line', to: [0, 0] }] };
  }
  return { through: f.through, uFrom: f.side, vFrom: 'min', start: [0, 0],
    segments: [{ type: 'line', to: [h, 0] }, { type: 'arc', to: [h, s], side: 'left', rise: h }, { type: 'line', to: [0, s] }, { type: 'line', to: [0, 0] }] };
}

export function bowFields(c: Omit<CurveCut, 'id'>): BowFields | null {
  if (c.segments.length !== 4 || c.start[0] !== 0 || c.start[1] !== 0) return null;
  const [l1, a, l2, l3] = c.segments as [CurveSegment, CurveSegment, CurveSegment, CurveSegment];
  if (l1.type !== 'line' || a.type !== 'arc' || a.rise === undefined || l2.type !== 'line' || l3.type !== 'line') return null;
  if (l3.to[0] !== 0 || l3.to[1] !== 0) return null;
  const [u, v] = uvDims(c.through);
  const h = a.rise;
  if (c.uFrom === 'min' && a.side === 'right' && l1.to[0] === 0 && l1.to[1] === h && a.to[1] === h && l2.to[0] === a.to[0] && l2.to[1] === 0 && a.to[0] > 0) {
    return { through: c.through, along: u, side: c.vFrom, span: a.to[0], rise: h };
  }
  if (c.vFrom === 'min' && a.side === 'left' && l1.to[1] === 0 && l1.to[0] === h && a.to[0] === h && l2.to[1] === a.to[1] && l2.to[0] === 0 && a.to[1] > 0) {
    return { through: c.through, along: v, side: c.uFrom, span: a.to[1], rise: h };
  }
  return null;
}

export interface CornerFields { through: Dimension; uFrom: CutFrom; vFrom: CutFrom; radius: number }

/** The corner at (`uFrom`, `vFrom`) rounded to `radius` — a quarter circle tangent to both sides. */
export function cornerCurve(f: CornerFields): Omit<CurveCut, 'id'> {
  const r = f.radius;
  return { through: f.through, uFrom: f.uFrom, vFrom: f.vFrom, start: [0, 0],
    segments: [{ type: 'line', to: [r, 0] }, { type: 'arc', to: [0, r], side: 'left', radius: r }, { type: 'line', to: [0, 0] }] };
}

export function cornerFields(c: Omit<CurveCut, 'id'>): CornerFields | null {
  if (c.segments.length !== 3 || c.start[0] !== 0 || c.start[1] !== 0) return null;
  const [l1, a, l2] = c.segments as [CurveSegment, CurveSegment, CurveSegment];
  if (l1.type !== 'line' || a.type !== 'arc' || a.radius === undefined || l2.type !== 'line' || a.side !== 'left') return null;
  const r = a.radius;
  if (l1.to[0] !== r || l1.to[1] !== 0 || a.to[0] !== 0 || a.to[1] !== r || l2.to[0] !== 0 || l2.to[1] !== 0) return null;
  return { through: c.through, uFrom: c.uFrom, vFrom: c.vFrom, radius: r };
}

export type CurveKind = 'arch' | 'bow' | 'corner';
export function deriveCurveKind(c: Omit<CurveCut, 'id'>): CurveKind | null {
  return archFields(c) ? 'arch' : bowFields(c) ? 'bow' : cornerFields(c) ? 'corner' : null;
}
```

(Add `CurveSegment` to the type import.) Barrel-export every name in the Interfaces block.

- [ ] **Step 4: Run, full suite, build** — PASS.

- [ ] **Step 5: Mutate** — make `wasteContains`' lens test skip `crownSide` (the corner's chord point reads waste); drop
  the `s.kind === 'arc' ||` in `isAir` (an arc end reads air); count `runs >= 3` (the touching crown passes); drop
  `arcExtremes` from `pts` (an arch whose ends are inside but whose crown is outside the face is missed — add the test
  `curveFaults({ ...apron, width: 1 }, ARCH)` includes `runs-off` at the width max side if not already caught, and keep
  it); swap `'left'` to `'right'` in `archCurve` (round-trip fails). Restore each.

- [ ] **Step 6: Commit** — `curves: inside tests, faults, canonical writers and readers`.

---

### Task 5: Mirroring and write-back

**Files:**
- Modify: `src/document/curves.ts` (`mirrorCurveCut`), `src/document/frames.ts` (`mirrorPart`), `src/document/treeEdit.ts`
  (`lowerCurves`, `lower`, `changedKeys`, `valueOf`, `sharedSignature`, `groupSignature`), `src/document/turnFixtures.ts`
- Test: `src/document/curves.test.ts`, `src/document/frames.mirror.test.ts`, `src/document/treeEdit.mirror.test.ts`, `src/document/treeEdit.test.ts`

**Interfaces:**
- Produces: `mirrorCurveCut(c: CurveCut, d: Dimension): CurveCut` (barrel-exported); `chiralCurved(posture: Posture): Board` (turnFixtures.ts).

- [ ] **Step 1: The fixture** (`turnFixtures.ts`)

```ts
/**
 * chiralPart plus curves with a HAND (curves spec §6.2): an off-centre arch on one long side measured from the min end,
 * and one rounded corner. A reflection anywhere in the curve mapping shows up as different world outline points.
 */
export function chiralCurved(posture: Posture): Board {
  const b = chiralPart(posture);
  return {
    ...b,
    curves: [
      { id: 'k1', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 2, span: 5, rise: 0.75 }) },
      { id: 'k2', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'max', radius: 1 }) },
    ],
  };
}
```

(Check `chiralPart`'s dimensions first — `grep -n "export function chiralPart" -A12 src/document/turnFixtures.ts`; the
arch must fit (start + span < length) and the radius must fit; adjust the numbers to the fixture and say so in the
commit.)

- [ ] **Step 2: Write the failing tests**

`curves.test.ts`:

```ts
import { mirrorCurveCut } from './curves';
describe('mirrorCurveCut (inv 44: a flag flip, no arithmetic)', () => {
  it('flips exactly the flag on the mirrored dimension; through changes nothing', () => {
    expect(mirrorCurveCut(ARCH, 'length')).toEqual({ ...ARCH, uFrom: 'max' });
    expect(mirrorCurveCut(ARCH, 'width')).toEqual({ ...ARCH, vFrom: 'max' });
    expect(mirrorCurveCut(ARCH, 'thickness')).toEqual(ARCH);
    expect(mirrorCurveCut(mirrorCurveCut(ARCH, 'width'), 'width')).toEqual(ARCH);
  });
  it('a reflected arch still bows into the wood (localSegments flips the side)', () => {
    const m = mirrorCurveCut(ARCH, 'width');
    const [arc] = localSegments(apron, m) as [Extract<ReturnType<typeof localSegments>[number], { kind: 'arc' }>];
    expect(close(arc.crown, [15, 5 - 1.5])).toBe(true);
  });
});
```

`frames.mirror.test.ts` (imports `chiralCurved`, `curveOutline`, `toWorld`, `uvDims`; same `POSTURES`, `TURNS`,
`sameSet` helpers as the hole test there):

```ts
/** Every outline vertex in world, on the `through` min face. */
const worldOutline = (b: Board) => b.curves.flatMap((c) => {
  const [u, v] = uvDims(c.through);
  return curveOutline(b, c).pts.map(([x, y]) => toWorld(b, { length: 0, width: 0, thickness: 0, [u]: x, [v]: y, [c.through]: 0 } as Point));
});

describe('a mirrored frame reflects curves (inv 44, curves spec §6.2)', () => {
  for (const posture of POSTURES) {
    for (const rotation of TURNS) {
      it(`${posture} at ${rotation} deg: mirrorPart's outline is the reflection across x = 0`, () => {
        const b = { ...chiralCurved(posture), rotation, position: [2, 1, -3] as [number, number, number] };
        const reflected = worldOutline(b).map(([x, y, z]) => [0 - x!, y!, z!]);
        expect(sameSet(worldOutline(mirrorPart(b)), reflected)).toBe(true);
        const placed = placeBoard({ position: [0, 0, 0], rotation: 0, mirrored: true }, b);
        expect(placed.curves).toEqual(mirrorPart(b).curves);
      });
    }
  }
  it('the fixture is chiral: unmirrored curves would differ', () => {
    const b = chiralCurved('flat');
    const reflected = worldOutline(b).map(([x, y, z]) => [0 - x!, y!, z!]);
    expect(sameSet(worldOutline({ ...mirrorPart(b), curves: b.curves }), reflected)).toBe(false);
  });
});
```

(`sameSet` must compare with a tolerance of about 1e-9: outline points come from trigonometry. If the file's `sameSet`
is exact, add a tolerant one beside it.)

`treeEdit.mirror.test.ts` — copy the four tests of `describe('holes through a mirror (Review Focus 3)')` into
`describe('curves through a mirror (Review Focus 2)')`, with `chiralCurved` for `chiralHoled`, `.curves` for `.holes`,
`sameCurve` for `sameHoleRow`, and the edit `curves.map((c) => (c.id === 'k1' ? { ...c, ...archCurve({ ...archFields(c)!, start: 3 }) } : c))`.

`treeEdit.test.ts` — beside the hole `groupSignature` test:

```ts
  it('users whose curves differ only in order and ids stay one Shape; a differing curve splits (groupSignature)', () => {
    const shape = { id: 's1', length: 30, width: 5, thickness: 0.75, material: 'oak', grain: 'length' as const, posture: 'flat' as const, cuts: [], angleCuts: [], holes: [], curves: [] };
    const doc: SloydDocument = { ...createDocument(), shapes: [shape],
      boards: [0, 1, 2].map((k) => ({ id: `l${k}`, name: `Apron ${k}`, position: [k * 10, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })) };
    const c1 = archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 });
    const c2 = cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'max', radius: 1 });
    const before = flat(doc);
    const sets = [[{ ...c1, id: 'a' }, { ...c2, id: 'b' }], [{ ...c2, id: 'c' }, { ...c1, id: 'd' }], [{ ...c1, id: 'e' }]];
    const out = writeBackFlat(doc, before, before.map((b, k) => ({ ...b, curves: sets[k]! })));
    expect(out.shapes).toHaveLength(2);
    expect(shapeOfAt(out, 'l0')).toBe(shapeOfAt(out, 'l1'));
    expect(shapeOfAt(out, 'l2')).not.toBe(shapeOfAt(out, 'l0'));
  });
```

- [ ] **Step 3: Run them to see them fail.**

- [ ] **Step 4: Implement**

`curves.ts`:

```ts
const flipFrom = (f: CutFrom): CutFrom => (f === 'min' ? 'max' : 'min');

/** A curve reflected along dimension `d` (inv 44): a FLAG FLIP, never arithmetic on coordinates — `uFrom` when u is `d`,
 *  `vFrom` when v is, nothing when `d` is `through` (the cut runs right through it). `side` is defined on stored numbers,
 *  which do not change, so it is untouched; `localSegments` flips it where the mapping reflects. Its own inverse. */
export function mirrorCurveCut(c: CurveCut, d: Dimension): CurveCut {
  if (d === c.through) return c;
  const [u] = uvDims(c.through);
  return d === u ? { ...c, uFrom: flipFrom(c.uFrom) } : { ...c, vFrom: flipFrom(c.vFrom) };
}
```

`frames.ts` `mirrorPart`: `curves: b.curves.map((c) => mirrorCurveCut(c, d)),` and the doc comment names curves.

`treeEdit.ts`:

```ts
/**
 * A part's curves lowered back through ONE mirror (curves spec §6.2): like lowerHoles, a flag flip, exact and size-free;
 * a curve equal to the stored one with the same id maps back to THAT object; all reused: the stored array.
 */
function lowerCurves(storedBefore: Board, draft: Board): CurveCut[] {
  const d0 = mirrorDim(draft);
  const byId = new Map(storedBefore.curves.map((c) => [c.id, c]));
  const out = draft.curves.map((c) => {
    const back = mirrorCurveCut(c, d0);
    const s = byId.get(c.id);
    return s && sameCurve(s, back) ? s : back;
  });
  return out.length === storedBefore.curves.length && out.every((c, i) => c === storedBefore.curves[i]) ? storedBefore.curves : out;
}
```

- `lower()`'s mirrored branch: `curves: lowerCurves(lowerBefore, draft),`
- `changedKeys`, beside the `holes` clause:

```ts
    if (k === 'curves') {
      // As holes: written when edited, or when a mirror lowering produced a fresh array that is not the stored one.
      return rec(before)[k] !== rec(after)[k] || (cur.curves !== after.curves && cur.curves !== resolved.curves);
    }
```

- `valueOf`: `… : k === 'holes' ? cur.holes : k === 'curves' ? cur.curves : rec(after)[k]` — **without this the WORLD
  curves are written back through a mirror**.
- `sharedSignature`: `… : k === 'curves' ? b.curves.map(curveValues) : b[k]`.
- `groupSignature`: `… : k === 'curves' ? sorted(b.curves.map(curveValues)) : b[k]` (check that `sorted` accepts an
  array of strings; if it is typed for arrays of arrays, map each to `[curveValues(c)]`).
- The doc comment on `applyWorldEdits` names curves beside holes. Imports: `CurveCut` type; `curveValues`,
  `mirrorCurveCut`, `sameCurve`.

- [ ] **Step 5: Full suite and build** — PASS.

- [ ] **Step 6: Mutate** — each of: `mirrorPart`'s curves line; `lower`'s curves line; the `valueOf` clause; the
  `changedKeys` clause (first half only); `lowerCurves`' reuse; `groupSignature`'s `sorted`; `mirrorCurveCut` returning
  `c` for every `d`. Each fails a test; restore.

- [ ] **Step 7: Commit** — `curves: mirroring and write-back (flag flips, lowerCurves)`.

---

### Task 6: Bodies — clip or split

**Files:**
- Modify: `src/document/bodies.ts` (`BodyFace`, `clip`, `clipConvex`, `boardBodies`, `geometryKey`), `src/document/curves.ts`
  (`curvePlan`, `convexPieces`), `src/viewport/grainTiling.ts` (`boardUVSignature`)
- Test: `src/document/bodies.test.ts`, `src/document/curves.test.ts`, `src/viewport/grainTiling.test.ts`

**Interfaces:**
- Produces: `BodyFace.curve?: string`; `curvePlan(board, c): { clip: true; planes: { n: V3; d: number }[] } | { clip: false; pieces: { planes: { n: V3; d: number }[]; onArc: boolean[] }[] } | null`
  (curves.ts; null when the outline has no area inside the part); `convexPieces(pts: P2[], arcEdge: boolean[]): { pts: P2[]; onArc: boolean[] }[]`.

- [ ] **Step 1: Write the failing tests**

`bodies.test.ts`:

```ts
import { ARCH, CORNER } from './curves.test';
import { boardBodies, bodyVolume, geometryKey } from './bodies';
import { archCurve, bowCurve, curvePlan, localSegments } from './curves';

/** The exact area of an arc's segment (between chord and arc): R²·acos((R−h)/R) − (R−h)·√(2Rh − h²). */
const segmentArea = (R: number, h: number) => R * R * Math.acos((R - h) / R) - (R - h) * Math.sqrt(2 * R * h - h * h);

describe('boardBodies with curves (curves spec §3.2)', () => {
  const apron = createBoard({ length: 30, width: 5, thickness: 0.75 });
  const top = createBoard({ length: 36, width: 20, thickness: 0.75 });
  const vol = (b: Board) => boardBodies(b).reduce((s, x) => s + bodyVolume(x), 0);

  it('an arch SPLITS: the volume is the box minus the true segment, within the chord tolerance', () => {
    const v = vol({ ...apron, curves: [ARCH] });
    const exact = (30 * 5 - segmentArea(48.75, 1.5)) * 0.75;
    const arcLength = 48.75 * 2 * Math.asin(12 / 48.75);
    expect(v).toBeGreaterThanOrEqual(exact - 1e-9);                     // inscribed chords leave MORE wood
    expect(v - exact).toBeLessThanOrEqual(0.005 * arcLength * 0.75);
    expect(boardBodies({ ...apron, curves: [ARCH] }).length).toBeGreaterThan(1);
  });
  it('a rounded corner CLIPS: one body, volume the box minus (r² − πr²/4), within the tolerance', () => {
    const bodies = boardBodies({ ...top, curves: [CORNER] });
    expect(bodies).toHaveLength(1);
    const exact = (36 * 20 - (4 - Math.PI)) * 0.75;
    expect(Math.abs(bodyVolume(bodies[0]!) - exact)).toBeLessThanOrEqual(0.005 * Math.PI * 0.75 + 1e-9);
    expect(bodies[0]!.box).toBeNull();
  });
  it('both paths give the same wood where both apply (a bow, forced down the split path)', () => {
    const bow = { id: 'w', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }) };
    const b = { ...apron, curves: [bow] };
    const clipped = vol(b);
    const plan = curvePlan(b, bow)!;
    expect(plan.clip).toBe(true);
    expect(Math.abs(clipped - splitVolumeForTest(b, bow))).toBeLessThan(1e-9);
  });
  it('faces on an arc chord carry the curve id; a body no curve touches keeps its box', () => {
    const b = { ...apron, cuts: [{ id: 't', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 0.5, width: 1, depth: 0.25, stopMin: 0, stopMax: 0 }], curves: [ARCH] };
    const bodies = boardBodies(b);
    expect(bodies.some((x) => x.faces.some((f) => f.curve === 'c1'))).toBe(true);
    expect(bodies.some((x) => x.box !== null)).toBe(true);              // the cells around the dado at the far end
  });
  it('a part with no curves is byte-for-byte unchanged', () => {
    expect(boardBodies({ ...apron, curves: [] })).toEqual(boardBodies(apron));
  });
  it('geometryKey carries each curve\'s id and values', () => {
    expect(geometryKey({ ...apron, curves: [ARCH] })).not.toBe(geometryKey(apron));
    expect(geometryKey({ ...apron, curves: [{ ...ARCH, id: 'zz' }] })).not.toBe(geometryKey({ ...apron, curves: [ARCH] }));
    expect(geometryKey({ ...apron, curves: [{ ...ARCH, start: [3.5, 0] }] })).not.toBe(geometryKey({ ...apron, curves: [ARCH] }));
  });
});
```

`splitVolumeForTest` is a test-only export of `bodies.ts` that runs the SPLIT path for one curve on a part's cells
(implement it as `export function splitBodiesForTest(board, c): Body[]` beside `boardBodies`, and in the test sum
`bodyVolume` over it). It exists so the agreement test can force the path the decider would not pick; its doc comment
says TEST-ONLY.

`grainTiling.test.ts`:

```ts
  it('boardUVSignature includes curves (inv 15)', () => {
    const b = createBoard({ length: 30, width: 5, thickness: 0.75 });
    expect(boardUVSignature({ ...b, curves: [ARCH] })).not.toBe(boardUVSignature(b));
  });
```

`curves.test.ts`:

```ts
import { convexPieces } from './curves';
describe('convexPieces', () => {
  it('a convex outline is one piece; an L is split, every original arc edge kept flagged', () => {
    expect(convexPieces([[0, 0], [2, 0], [2, 2], [0, 2]], [false, true, false, false])).toEqual([{ pts: [[0, 0], [2, 0], [2, 2], [0, 2]], onArc: [false, true, false, false] }]);
    const l = convexPieces([[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]], [false, true, false, false, false, false]);
    expect(l.length).toBeGreaterThan(1);
    expect(l.reduce((s, p) => s + Math.abs(twiceArea(p.pts)) / 2, 0)).toBeCloseTo(3, 12);
    expect(l.flatMap((p) => p.onArc).filter(Boolean)).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement**

`curves.ts` — the plan for one curve on one part:

```ts
/** A convex polygon's pieces after ear clipping (CCW), each edge flagged when it is an ORIGINAL arc chord. A convex
 *  input comes back whole. Diagonals are never arc edges. */
export function convexPieces(pts: P2[], arcEdge: boolean[]): { pts: P2[]; onArc: boolean[] }[] {
  const ccw = twiceArea(pts) > 0;
  const P = ccw ? pts : [...pts].reverse();
  // Edge i of the reversed polygon is edge (n - 2 - i) of the original: P[i] → P[i+1] = pts[n-1-i] → pts[n-2-i].
  const n = P.length;
  const flag = ccw ? arcEdge : P.map((_, i) => arcEdge[(n - 2 - i + n) % n]!);
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  if (P.every((p, i) => cross(p, P[(i + 1) % n]!, P[(i + 2) % n]!) >= -CURVE_EPS)) return [{ pts: P, onArc: flag }];
  // Ear clipping on indices; an edge (i, i+1 mod n) of the original keeps its flag.
  const idx = P.map((_, i) => i);
  const tris: [number, number, number][] = [];
  let guard = 0;
  while (idx.length > 3 && guard < 10 * n) {
    guard += 1;
    for (let k = 0; k < idx.length; k += 1) {
      const i0 = idx[(k - 1 + idx.length) % idx.length]!;
      const i1 = idx[k]!;
      const i2 = idx[(k + 1) % idx.length]!;
      if (cross(P[i0]!, P[i1]!, P[i2]!) <= CURVE_EPS) continue;
      const inside = idx.some((j) => j !== i0 && j !== i1 && j !== i2
        && cross(P[i0]!, P[i1]!, P[j]!) >= 0 && cross(P[i1]!, P[i2]!, P[j]!) >= 0 && cross(P[i2]!, P[i0]!, P[j]!) >= 0);
      if (inside) continue;
      tris.push([i0, i1, i2]);
      idx.splice(k, 1);
      break;
    }
  }
  if (idx.length === 3) tris.push([idx[0]!, idx[1]!, idx[2]!]);
  const edgeFlag = (a: number, b: number) => (b === (a + 1) % n ? flag[a]! : false);
  return tris.map(([a, b, c]) => ({ pts: [P[a]!, P[b]!, P[c]!], onArc: [edgeFlag(a, b), edgeFlag(b, c), edgeFlag(c, a)] }));
}

type Half = { n: V3; d: number };

/**
 * How `boardBodies` removes one curve's waste (spec §3.2, P6). CLIP — every arc bows into the waste and every straight
 * side lies along the face boundary, so the wood left is convex near the curve: one kept half-plane per chord, the side
 * holding the arc's centre. SPLIT otherwise: the waste polygon's convex pieces, each as inside half-planes (n points INTO
 * the waste) with the edges that are arc chords flagged. Planes are board-local 3D with no component along `through`.
 */
export function curvePlan(board: Pick<Board, Dimension>, c: Omit<CurveCut, 'id'>):
  { clip: true; planes: Half[] } | { clip: false; pieces: { planes: Half[]; onArc: boolean[] }[] } | null {
  const [u, v] = uvDims(c.through);
  const iu = DIMENSION_ORDER.indexOf(u);
  const iv = DIMENSION_ORDER.indexOf(v);
  const lift = (n: P2, d: number): Half => { const N: V3 = [0, 0, 0]; N[iu] = n[0]; N[iv] = n[1]; return { n: N, d }; };
  const segs = localSegments(board, c);
  const o = curveOutline(board, c);
  if (Math.abs(twiceArea(o.pts)) <= CURVE_EPS) return null;
  const clips = segs.every((s) => (s.kind === 'arc' ? bowsInto(segs, s) === 'waste' : onRectBoundary(board, c.through, s)));
  if (clips) {
    const planes: Half[] = [];
    for (let i = 0; i < o.pts.length; i += 1) {
      if (!o.arcEdge[i]) continue;
      const p = o.pts[i]!;
      const q = o.pts[(i + 1) % o.pts.length]!;
      const arc = segs.find((s): s is LocalArc => s.kind === 'arc' && Math.abs(Math.hypot(p[0] - s.centre[0], p[1] - s.centre[1]) - s.radius) <= 1e-9
        && Math.abs(Math.hypot(q[0] - s.centre[0], q[1] - s.centre[1]) - s.radius) <= 1e-9)!;
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      let n: P2 = [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];
      if (n[0] * (arc.centre[0] - p[0]) + n[1] * (arc.centre[1] - p[1]) < 0) n = [-n[0], -n[1]];
      planes.push(lift(n, -(n[0] * p[0] + n[1] * p[1])));
    }
    return { clip: true, planes };
  }
  return {
    clip: false,
    pieces: convexPieces(o.pts, o.arcEdge).map(({ pts, onArc }) => ({
      onArc,
      planes: pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length]!;
        const l = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const n: P2 = [-(q[1] - p[1]) / l, (q[0] - p[0]) / l];       // CCW: left of each edge is inside
        return lift(n, -(n[0] * p[0] + n[1] * p[1]));
      }),
    })),
  };
}
```

(Import `type V3` from `./angleCuts` — the board-local `[length, width, thickness]` tuple, as holes.ts does.)

`bodies.ts`:
- `BodyFace`: `export interface BodyFace { n: V3; verts: V3[]; cut?: string; curve?: string }` and its doc comment: "`curve`
  names the curve whose chord plane the face lies on (curves spec §3.2): `bodyMesh` reads it for smooth normals."
- `clip(faces, h, tag: { cut?: string; curve?: string })`: the cap becomes
  `{ n: [...], verts: r, ...(tag.cut !== undefined ? { cut: tag.cut } : {}), ...(tag.curve !== undefined ? { curve: tag.curve } : {}) }`.
  `clipConvex` passes `{ cut: '' }` (section caps read `g.cut === ''` — unchanged); `boardBodies`' angle loop passes
  `{ cut: id }`.
- `boardBodies`, after the angle-cut loop builds `out` (and before returning):

```ts
  // Curves (curves spec §3.2): each curve's waste leaves every body convex — clipped by the chords' kept half-planes when
  // the wood left is convex (P6), else split along the waste's convex pieces. A body no curve reaches keeps its object,
  // so its `box` survives (invariant 48's box path). Caps on an arc chord carry the curve's id.
  let bodies = out;
  for (const c of board.curves) {
    const plan = curvePlan(board, c);
    if (!plan) continue;
    bodies = bodies.flatMap((body) => {
      const faces = plan.clip ? clipAll(body.faces, plan.planes, c.id) : subtractPieces(body.faces, plan.pieces, c.id);
      return faces.flatMap((f) => (f === body.faces ? [body] : f.length >= 4 ? [{ box: null, faces: f }] : []));
    });
  }
  return bodies;
```

  with, above `boardBodies`:

```ts
/** A body clipped by every kept half-plane of a CLIP plan: one body or none. */
function clipAll(faces: BodyFace[], planes: readonly { n: V3; d: number }[], curve: string): BodyFace[][] {
  let f = faces;
  for (const h of planes) { f = clip(f, h, { curve }); if (f.length === 0) return []; }
  return [f];
}

/**
 * A body minus the waste of a SPLIT plan (spec §3.2): for each convex piece in turn, every current part splits at the
 * piece's planes — the part OUTSIDE each plane (inside the ones before) is kept, the part inside them all (waste) dropped.
 * Caps on an arc chord carry the curve's id. A body the waste does not reach comes back as its own array (one element).
 */
function subtractPieces(faces: BodyFace[], pieces: readonly { planes: { n: V3; d: number }[]; onArc: boolean[] }[], curve: string): BodyFace[][] {
  let parts: BodyFace[][] = [faces];
  for (const piece of pieces) {
    const next: BodyFace[][] = [];
    for (const part of parts) {
      let rest = part;
      piece.planes.forEach((h, i) => {
        if (rest.length === 0) return;
        const tag = piece.onArc[i] ? { curve } : {};
        const outside = clip(rest, { n: [-h.n[0], -h.n[1], -h.n[2]], d: -h.d }, tag);
        if (outside.length >= 4) next.push(outside);
        rest = outside === rest ? [] : clip(rest, h, tag);
      });
    }
    parts = next;
  }
  return parts;
}

/** TEST-ONLY: the split path for one curve over a part's bodies before curves (the clip/split agreement test). */
export function splitBodiesForTest(board: Board, c: CurveCut): Body[] { … build the plan's pieces with clip: false forced … }
```

  For `splitBodiesForTest`, build the pieces exactly as `curvePlan`'s split branch does (factor that branch into an
  exported `splitPieces(board, c)` in curves.ts and call it from both). `boardBodies`' existing early structure is
  unchanged for a part with no curves (the loop does not run; `bodies === out`).

  Note on `subtractPieces`: when the part lies wholly OUTSIDE plane i, `clip` returns the same array: that is pushed as
  the piece and nothing remains (`rest = []`), so an untouched body returns as its own array — the identity
  `boardBodies` tests with `f === body.faces`.
- `geometryKey`: after `holes`,
  `const curves = board.curves.map((c) => \`${JSON.stringify(c.id)}:${curveValues(c)}\`).join(';');` and return
  `…|${holes}|${curves}`; the doc comment gains "and every curve's id and CURVE_FIELDS values (a chord face carries its
  curve id, BodyFace.curve)".

`grainTiling.ts` `boardUVSignature`: add `board.curves.map((c) => \`${c.id}:${curveValues(c)}\`).join(';')` beside the
holes entry (read how holes are added there and match it).

- [ ] **Step 4: Full suite and build** — PASS. Then re-run `src/viewport/sectionPerf.test.ts` and `holesPerf.test.ts`
  alone (parts without curves must not have slowed).

- [ ] **Step 5: Mutate** — make `curvePlan` always split (the corner's one-body test fails); drop the `onArc` tag (the
  chord-face test fails); in `subtractPieces` keep `rest` instead of `[]` when `outside === rest` (the untouched-box test
  or the volume test fails); drop `curves` from `geometryKey`. Restore each.

- [ ] **Step 6: Commit** — `curves: bodies — clip or split, chord faces tagged`.

---

### Task 7: Edges, built directly

**Files:**
- Modify: `src/document/bodies.ts` (`bodyEdges`' filter, `curvedEdges`, `boardEdges`, `partGeometry`), `src/document/curves.ts`
  (`smoothLines`)
- Test: `src/document/bodies.test.ts`

**Interfaces:**
- Produces: `bodyEdges(bodies, keep?: (o: V3, u: V3) => boolean)` (a candidate line is skipped when `keep` returns
  false); `curvedEdges(board: Board, bodies: readonly Body[]): [V3, V3][]`; `smoothLines(board): { k: number; p: V3 }[]`
  (curves.ts: lines along axis `k` through the smooth outline points, `p[k] = 0`).

- [ ] **Step 1: Write the failing tests** (`bodies.test.ts`)

```ts
import { curvedEdges, bodyEdges } from './bodies';
import { smoothLines } from './curves';

/** Segments as a canonical set: each line's intervals merged, endpoints ordered, rounded to 1e-7. */
function canon(segs: readonly [V3, V3][]): string[] {
  const r = (x: number) => Math.round(x * 1e7) / 1e7;
  const lines = new Map<string, [number, number][]>();
  for (const [a, b] of segs) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(...d);
    if (l < 1e-7) continue;
    let u = d.map((x) => x / l);
    const lead = u.find((x) => Math.abs(x) > 1e-9)!;
    if (lead < 0) u = u.map((x) => -x);
    const ta = a[0] * u[0]! + a[1] * u[1]! + a[2] * u[2]!;
    const foot = [0, 1, 2].map((i) => a[i]! - ta * u[i]!);
    const key = [...u, ...foot].map(r).join(',');
    const tb = b[0] * u[0]! + b[1] * u[1]! + b[2] * u[2]!;
    (lines.get(key) ?? lines.set(key, []).get(key)!).push([Math.min(ta, tb), Math.max(ta, tb)]);
  }
  const out: string[] = [];
  for (const [key, spans] of lines) {
    spans.sort((x, y) => x[0] - y[0]);
    let [s, e] = spans[0]!;
    for (const [s2, e2] of spans.slice(1)) { if (s2 <= e + 1e-7) e = Math.max(e, e2); else { out.push(`${key}|${r(s)},${r(e)}`); [s, e] = [s2, e2]; } }
    out.push(`${key}|${r(s)},${r(e)}`);
  }
  return out.sort();
}

/** The slow oracle: bodyEdges over every face, minus the lines along `through` at smooth outline points. */
function oracle(b: Board): string[] {
  const smooth = smoothLines(b);
  const keep = (o: V3, u: V3) => !smooth.some(({ k, p }) => Math.abs(Math.abs(u[k]!) - 1) <= 1e-9
    && [0, 1, 2].every((i) => i === k || Math.abs(o[i]! - p[i]!) <= 1e-7));
  return canon(bodyEdges(boardBodies(b), keep));
}

describe('curvedEdges equals the slow edges minus facet lines (curves spec §3.3)', () => {
  const apron = createBoard({ length: 30, width: 5, thickness: 0.75 });
  const top = createBoard({ length: 36, width: 20, thickness: 0.75 });
  const dado = { id: 't', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
  const chamfer = { /* one chamfer on a long edge — copy a chamfer fixture from angleCuts.test.ts and give it id 'ch' */ };
  const cases: [string, Board][] = [
    ['arch', { ...apron, curves: [ARCH] }],
    ['notch', { ...apron, curves: [{ id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 }) }] }],
    ['bow', { ...apron, curves: [{ id: 'w', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }) }] }],
    ['four corners', { ...top, curves: (['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => ({ id: `${uf}${vf}`, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: vf, radius: 2 }) }))) }],
    ['through the width', { ...apron, curves: [{ id: 'x', ...bowCurve({ through: 'width', along: 'length', side: 'min', span: 30, rise: 0.25 }) }] }],
    ['through the length', { ...apron, curves: [{ id: 'y', ...cornerCurve({ through: 'length', uFrom: 'min', vFrom: 'max', radius: 0.5 }) }] }],
    ['with a dado', { ...apron, cuts: [dado], curves: [ARCH] }],
    ['with a chamfer', { ...apron, angleCuts: [chamfer as never], curves: [ARCH] }],
  ];
  for (const [name, b] of cases) {
    it(name, () => {
      expect(canon(curvedEdges(b, boardBodies(b)))).toEqual(oracle(b));
    });
  }
  it('an arch draws no line between its chords and one at each end', () => {
    const b = { ...apron, curves: [ARCH] };
    const along = curvedEdges(b, boardBodies(b)).filter(([a, c]) => Math.abs(a[0] - c[0]) < 1e-9 && Math.abs(a[1] - c[1]) < 1e-9);
    const at = (x: number, y: number) => along.some(([a]) => Math.abs(a[0] - x) < 1e-7 && Math.abs(a[1] - y) < 1e-7);
    expect(at(3, 0)).toBe(true);
    expect(at(27, 0)).toBe(true);
    expect(at(15, 1.5)).toBe(false);                                    // the crown is a chord vertex (18 chords: k = 9)
  });
  it('a part without curves keeps its edges byte-for-byte', () => {
    expect(boardEdges({ ...apron, curves: [] })).toEqual(boardEdges(apron));
  });
});
```

(The `along` filter keeps lines running along the thickness, local index 2. Fill `chamfer` from an existing chamfer
fixture before running; do not invent one.)

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement**

`curves.ts`:

```ts
/** The lines along each curve's `through` at its smooth outline points (spec §3.3): board-local, the point with
 *  p[k] = 0, k the through axis. curvedEdges drops a candidate line on one of these. */
export function smoothLines(board: Pick<Board, Dimension | 'curves'>): { k: number; p: V3 }[] {
  return board.curves.flatMap((c) => {
    const [u, v] = uvDims(c.through);
    const k = DIMENSION_ORDER.indexOf(c.through);
    const o = curveOutline(board, c);
    return o.pts.flatMap((q, i) => {
      if (!o.smooth[i]) return [];
      const p: V3 = [0, 0, 0];
      p[DIMENSION_ORDER.indexOf(u)] = q[0];
      p[DIMENSION_ORDER.indexOf(v)] = q[1];
      return [{ k, p }];
    });
  });
}
```

`bodies.ts`:
- `bodyEdges(bodies, keep?)`: in step 1, after computing `u` for a polygon edge and before the line lookup:
  `if (keep && !keep(a, u)) continue;` — a skipped edge makes no candidate line, but its face still contributes wings
  to the lines that remain (the face list is unchanged). Doc comment: "`keep` (curves spec §3.3) skips candidate lines".
- `curvedEdges`:

```ts
/** Signed area of a face polygon in the plane square to axis k (the other two axes in order). */
function areaIn(verts: readonly V3[], k: number): number {
  const [i, j] = [0, 1, 2].filter((d) => d !== k) as [number, number];
  let a = 0;
  for (let n = 0; n < verts.length; n += 1) {
    const p = verts[n]!;
    const q = verts[(n + 1) % verts.length]!;
    a += p[i]! * q[j]! - q[i]! * p[j]!;
  }
  return a;
}

/**
 * A curved part's edges, BUILT (curves spec §3.3; the timing spike: bodyEdges over an arch's slices is quadratic in
 * them). (1) On every plane square to a curve's `through`: the boundary of the faces lying on it, by `unionOutline`,
 * a face facing +k wound anticlockwise and one facing −k clockwise — so two bodies' faces against each other (a seam)
 * cancel, and slices' faces merge into one outline. A segment already drawn on a plane of an earlier axis is skipped.
 * (2) Everything else: `bodyEdges` with the lines on those planes skipped, and the lines along `through` at smooth
 * outline points (a chord vertex, a tangent join) skipped — an arc draws no facet lines (invariant 16).
 */
export function curvedEdges(board: Board, bodies: readonly Body[]): [V3, V3][] {
  const axes = [...new Set(board.curves.map((c) => DIMENSION_ORDER.indexOf(c.through)))];
  const faces = bodies.flatMap((b) => b.faces);
  const out: [V3, V3][] = [];
  const planes: { k: number; c: number }[] = [];
  for (const k of axes) {
    const groups: { c: number; pieces: V3[][] }[] = [];
    for (const f of faces) {
      if (Math.abs(Math.abs(f.n[k]!) - 1) > BODY_EPS) continue;
      const c = f.verts[0]![k]!;
      let g = groups.find((x) => Math.abs(x.c - c) <= BODY_EPS);
      if (!g) { g = { c, pieces: [] }; groups.push(g); }
      const wantPositive = f.n[k]! > 0;
      g.pieces.push(areaIn(f.verts, k) > 0 === wantPositive ? f.verts : [...f.verts].reverse());
    }
    for (const g of groups) {
      for (const [a, b] of unionOutline(g.pieces, k)) {
        if (planes.some((p) => Math.abs(a[p.k]! - p.c) <= BODY_EPS && Math.abs(b[p.k]! - p.c) <= BODY_EPS)) continue;
        out.push([a, b]);
      }
    }
    for (const g of groups) planes.push({ k, c: g.c });
  }
  const smooth = smoothLines(board);
  const keep = (o: V3, u: V3) => {
    if (planes.some(({ k, c }) => Math.abs(u[k]!) <= BODY_EPS && Math.abs(o[k]! - c) <= BODY_EPS)) return false;
    return !smooth.some(({ k, p }) => Math.abs(Math.abs(u[k]!) - 1) <= BODY_EPS
      && [0, 1, 2].every((i) => i === k || Math.abs(o[i]! - p[i]!) <= SMOOTH_EPS));
  };
  out.push(...bodyEdges(bodies, keep));
  return out;
}
```

  (`unionOutline` lives in `section.ts`, which imports `bodies.ts`: importing it back makes a cycle. Move
  `unionOutline` AND `SECTION_EPS` (its only dependency) into a new `src/document/outline.ts` that imports nothing from
  `bodies.ts` or `section.ts`; `section.ts` imports both from it and re-exports them, so every existing import keeps
  working. Confirm with `grep -n "import" src/document/section.ts` that nothing else `unionOutline` needs is left behind.
  `SMOOTH_EPS = 1e-7` is a constant beside `BODY_EPS`.)
- `boardEdges`: `if (board.angleCuts.length === 0 && board.curves.length === 0) return pocketEdges(board);` then
  `const bodies = boardBodies(board); return (board.curves.length > 0 ? curvedEdges(board, bodies) : bodyEdges(bodies)).map(…toPoint…)`.
- `partGeometry`'s `edges` getter: the same three-way choice over the cached `bodies`.

- [ ] **Step 4: Full suite and build** — PASS. Any oracle case that fails: print both canonical sets' differences and
  find which side is wrong before touching either (a missing segment on a seam plane, a duplicated outline segment on
  an edge two axes share). Do not loosen `canon`.

- [ ] **Step 5: Mutate** — wind every face anticlockwise regardless of its normal (the dado case's seam lines appear);
  drop the smooth filter (facet lines appear, the arch test fails); drop the earlier-plane skip (the "through the
  length" case duplicates). Restore each.

- [ ] **Step 6: Commit** — `curves: edges built directly (outline on the through planes, bodyEdges on the rest)`.

---

### Task 8: The 3D view — smooth normals, seams, and the rebuild guard

**Files:**
- Modify: `src/viewport/grainTiling.ts` (`bodyMesh`), `src/viewport/BoardMesh.tsx`
- Create: `src/viewport/curvesPerf.test.ts`
- Test: `src/viewport/grainTiling.test.ts`

**Interfaces:**
- Produces: `bodyMesh(board, body, holes, bodies)` returns `normals?: Float32Array` — present only when
  `board.curves.length > 0` (a part without curves is byte-for-byte unchanged and BoardMesh still calls
  `computeVertexNormals` for it).

- [ ] **Step 1: Write the failing tests**

`grainTiling.test.ts`:

```ts
describe('curved bodies in the mesh (curves spec §3.4)', () => {
  const b = { ...createBoard({ length: 30, width: 5, thickness: 0.75 }), curves: [ARCH] };
  const bodies = boardBodies(b);
  it('returns normals; on a chord face they are radial (perpendicular to the arc), not the chord\'s', () => {
    const arc = localSegments(b, ARCH)[0] as LocalArc;
    let radial = 0;
    for (const body of bodies) {
      const m = bodyMesh(b, body, [], bodies);
      expect(m.normals).toBeDefined();
      // Board flat at turn 0: world X = length, Y = thickness, Z = width; positions are centred.
      for (let i = 0; i < m.positions.length; i += 3) {
        const x = m.positions[i]! + 15;
        const z = m.positions[i + 2]! + 2.5;
        const ny = m.normals![i + 1]!;
        // Float32 positions near 48.75" carry ~4e-6 of error: judge "on the arc" at 1e-4.
        const onArc = Math.abs(Math.hypot(x - arc.centre[0], z - arc.centre[1]) - arc.radius) < 1e-4 && ny === 0 && z > 1e-4;
        if (!onArc) continue;
        const r = [(x - arc.centre[0]) / arc.radius, (z - arc.centre[1]) / arc.radius];
        expect(Math.abs(m.normals![i]! * r[1]! - m.normals![i + 2]! * r[0]!)).toBeLessThan(1e-6);   // parallel to the radius
        radial += 1;
      }
    }
    expect(radial).toBeGreaterThan(0);
  });
  it('a split part shows no internal walls: total triangle area equals the outer surface', () => {
    let area = 0;
    for (const body of bodies) {
      const m = bodyMesh(b, body, [], bodies);
      for (let i = 0; i < m.positions.length; i += 9) {
        const p = [0, 3, 6].map((o) => [m.positions[i + o]!, m.positions[i + o + 1]!, m.positions[i + o + 2]!]);
        const e1 = p[1]!.map((v, k) => v - p[0]![k]!);
        const e2 = p[2]!.map((v, k) => v - p[0]![k]!);
        area += Math.hypot(e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!) / 2;
      }
    }
    const o = curveOutline(b, ARCH);
    const faceArea = 30 * 5 - Math.abs(twiceArea(o.pts)) / 2;            // the polygon actually removed
    const chordLen = o.pts.reduce((s, p, i) => (o.arcEdge[i] ? s + Math.hypot(o.pts[(i + 1) % o.pts.length]![0] - p[0], o.pts[(i + 1) % o.pts.length]![1] - p[1]) : s), 0);
    const outer = 2 * faceArea + 0.75 * (30 + 2 * 5 + (30 - 24) + chordLen); // two faces; top, ends, bottom beside the arch, arch
    expect(area).toBeCloseTo(outer, 6);
  });
  it('a part without curves returns no normals (BoardMesh keeps computeVertexNormals)', () => {
    const plain = { ...createBoard({ length: 30, width: 5, thickness: 0.75 }), angleCuts: [/* the chamfer fixture */] };
    const pb = boardBodies(plain);
    expect(bodyMesh(plain, pb[0]!, [], pb).normals).toBeUndefined();
  });
});
```

`src/viewport/curvesPerf.test.ts` — modelled on `holesPerf.test.ts` (its comment block explains the method; copy its
`minOf9` shape):

```ts
import { createBoard, partGeometry, archCurve, cornerCurve } from '../document/document';
import type { Board } from '../document/document';
import { bodyMesh } from './grainTiling';

/**
 * Curve rebuild performance (curves spec §3.6). A resize drag rebuilds a curved part every frame — bodies, EDGES (the
 * spike's slow step: bodyEdges over an arch's slices measured 25 ms at 18 chords, 135 ms at 48) and every body's mesh.
 * Each case is a full rebuild through partGeometry with a fresh geometry key (the length moves by a micro-inch), the
 * MINIMUM of 9 runs (load only inflates a run). Bound 40 ms, the holes guard's.
 */
const arch = { id: 'a', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.5 }) };
const corners = (['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => ({ id: `${uf}${vf}`, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: vf, radius: 2 }) })));

let tick = 0;
function rebuild(make: (len: number) => Board): number {
  tick += 1;
  const board = make(1 + tick * 1e-6);
  const start = performance.now();
  const g = partGeometry(board);
  void g.edges;
  for (const body of g.bodies) bodyMesh(board, body, g.holes, g.bodies);
  return performance.now() - start;
}
const minOf9 = (make: (k: number) => Board) => {
  for (let i = 0; i < 3; i += 1) rebuild(make);
  return Math.min(...Array.from({ length: 9 }, () => rebuild(make)));
};

describe('a curved part rebuilds inside a frame', () => {
  it('an arched apron (18 chords): at most 40 ms', () => {
    expect(minOf9((k) => createBoard({ length: 30 * k, width: 5, thickness: 0.75, curves: [arch] }))).toBeLessThanOrEqual(40);
  });
  it('a top with four 2" corners: at most 40 ms', () => {
    expect(minOf9((k) => createBoard({ length: 36 * k, width: 20, thickness: 0.75, curves: corners }))).toBeLessThanOrEqual(40);
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement** — `bodyMesh`:
  1. Seams: `const faces = bodies && (holed(body, holes) || (board.curves.length > 0 && body.box === null)) ? body.faces.flatMap((f) => uncovered(f, body, bodies)) : body.faces;`
     and extend `uncovered`'s and `holed`'s doc comments ("and a split curved body, curves spec §3.4").
  2. Normals, only when `board.curves.length > 0`: a third stream per material, `nor`. For each emitted vertex `p`
     (board-local `V3`, before `offsetOf`), the LOCAL normal is `f.n` unless `f.curve` is set; then take the curve
     (`board.curves.find((c) => c.id === f.curve)`), its arcs (`localSegments`, memoised per curve per call), pick the arc
     whose circle the face's vertices lie on (|dist − R| smallest at the face's centroid), and use the radial direction
     at `p` in (u, v) — flipped so its dot with `f.n` is positive. Map a local normal to world exactly as `n` is mapped
     (`n[i] = local[dimIndex(frame[i].dim)] * (frame[i].reversed ? -1 : 1)`). Push it once per emitted vertex, in the
     same order as `put` (so a reversed triangle `w0, w2, w1` pushes the normals `n0, n2, n1`).
  3. Return `normals` from `packGroups` when the stream exists.
  4. `BoardMesh.tsx`: in the bodyMesh branch, `if (m.normals) geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3)); else geo.computeVertexNormals();`
- (`uncovered` cost: every face against every other body's faces. For an 18-chord arch that is about 120 × 114 cheap
  tests; the guard covers it.)

- [ ] **Step 4: Full suite, build, then the three perf guards alone** — PASS. If a curves case exceeds 40 ms, profile
  before changing anything (which of bodies, edges, mesh) and report the numbers; do not raise the bound.

- [ ] **Step 5: Mutate** — use `f.n` for every vertex (the radial test fails); drop the curved clause from the seam
  condition (the area test fails by the internal walls' area); return normals for every part (the no-normals test fails).
  Restore each.

- [ ] **Step 6: Commit** — `curves: smooth normals and no seams in the mesh; the rebuild guard`.

---

### Task 9: Snap points and the stock probe

**Files:**
- Modify: `src/document/cuts.ts` (`stockProbe`), `src/document/snapPoints.ts` (`boardSnapPoints`)
- Test: `src/document/snapPoints.test.ts`

- [ ] **Step 1: Write the failing tests** (`snapPoints.test.ts`; a flat part at the origin maps length → X,
  thickness → Y, width → Z — confirm against an existing flat-part test in this file):

```ts
describe('curve snap points (curves spec §3.5, P5)', () => {
  const apron = createBoard({ id: 'p', length: 30, width: 5, thickness: 0.75, curves: [ARCH] });
  const has = (pts: BoardSnapPoint[], at: number[], kind?: string) => pts.some((p) => (!kind || p.kind === kind) && p.at.every((v, i) => Math.abs(v - at[i]!) <= 1e-9));
  it('arc ends (corner) and crown (edge-mid) on both faces; the arched edge\'s middle is withheld (P3)', () => {
    const pts = boardSnapPoints(apron);
    for (const y of [0, 0.75]) {
      expect(has(pts, [3, y, 0], 'corner')).toBe(true);
      expect(has(pts, [27, y, 0], 'corner')).toBe(true);
      expect(has(pts, [15, y, 1.5], 'edge-mid')).toBe(true);
      expect(has(pts, [15, y, 0])).toBe(false);
    }
  });
  it('a centre off the face is not offered; a corner\'s centre is, as face-center, and the rounded-off corner is withheld', () => {
    expect(boardSnapPoints(apron).some((p) => p.at[2]! < -1)).toBe(false);
    const top = createBoard({ id: 't', length: 36, width: 20, thickness: 0.75, curves: [{ ...CORNER, uFrom: 'min' }] });
    const pts = boardSnapPoints(top);
    expect(has(pts, [2, 0.75, 2], 'face-center')).toBe(true);
    expect(has(pts, [0, 0.75, 0])).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement**
- `cuts.ts` `stockProbe`: `import { isAir, uvDims } from './curves';`, and after the holes line inside the returned
  function: `if (board.curves.some((c) => { const [u, v] = uvDims(c.through); return isAir(board, c, [p[u], p[v]]); })) return false;`
  with a comment "The waste is air, its kept surface is not (curves spec §3.5, P3)".
- `snapPoints.ts`: the early return adds `&& board.curves.length === 0`; after the hole centres and BEFORE
  `if (board.angleCuts.length === 0) return lattice;`:

```ts
  // Curve points (curves spec §3.5, P5): each arc's ends ('corner'), crown ('edge-mid') and centre ('face-center', which
  // may sit in air — the hole-centre exception to invariant 16: it is the centre of a drawn arc), on both faces square to
  // `through`; a point outside the face rectangle is not offered. Deduped by distance against the lattice.
  for (const c of board.curves) {
    const [u, v] = uvDims(c.through);
    const inFace = (q: P2) => q[0] >= -1e-9 && q[0] <= board[u] + 1e-9 && q[1] >= -1e-9 && q[1] <= board[v] + 1e-9;
    for (const s of localSegments(board, c)) {
      if (s.kind !== 'arc') continue;
      const marks: [P2, SnapKind][] = [[s.a, 'corner'], [s.b, 'corner'], [s.crown, 'edge-mid'], [s.centre, 'face-center']];
      for (const [q, kind] of marks) {
        if (!inFace(q)) continue;
        for (const t of [0, board[c.through]]) {
          const at = toWorld(board, { [u]: q[0], [v]: q[1], [c.through]: t } as Point);
          if (!lattice.some((x) => close(x.at, at))) lattice.push({ kind, at, owner });
        }
      }
    }
  }
```

  (Import `localSegments`, `uvDims`, `P2`.)

- [ ] **Step 4: Full suite and build** — PASS; existing snap counts unchanged.
- [ ] **Step 5: Mutate** — drop the `isAir` line (the arched edge's middle comes back); drop `inFace` (a centre at
  z = −47 appears); drop the early-return clause (no curve points on a plain-otherwise part). Restore each.
- [ ] **Step 6: Commit** — `curves: snap points; the waste is air`.

---

### Task 10: Holes meet curves

**Files:**
- Modify: `src/document/holeFaults.ts`, `src/document/holeText.ts`
- Test: `src/document/holeFaults.test.ts`, `src/document/holeText.test.ts`

**Interfaces:**
- Produces: `HoleFault.curve?: { id: string; kind: CurveKind | null }` on a `breaks-out` fault; `intoCurve(board, h): HoleFault['curve'] | null`.

- [ ] **Step 1: Write the failing tests**

`holeFaults.test.ts`:

```ts
describe('a hole into a curve\'s waste is breaks-out (curves spec §6.3)', () => {
  const apron = (row: HoleRow) => createBoard({ length: 30, width: 5, thickness: 0.75, holes: [row], curves: [ARCH] });
  const down = { id: 'h', face: 'thickness' as const, from: 'max' as const, diameter: 0.5, depth: 'through' as const, along: 'length' as const, alongFrom: 'min' as const, station: 15, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 2 };
  it('a bore along through: touching the crown meets; just clear does not', () => {
    expect(holeFaults(apron(down), down)).toEqual([{ index: 0, kind: 'breaks-out', curve: { id: 'c1', kind: 'arch' } }]);   // 2 − 0.25 = 1.75 > 1.5: clear?
  });
});
```

STOP and derive before writing the expectation: the bore's disc is centred 2" from the width min side with radius ¼, so
its nearest point is at v = 1.75, above the crown at 1.5 — it is CLEAR. Write two cases instead: `inset: 1.75` (nearest
point 1.5: touches → the fault) and `inset: 1.75 + 1e-6` (clear → `[]`). Then a third: a ⅜" dowel hole drilled into
the arched EDGE (`face: 'width', from: 'min', depth: 1, along: 'length', station: 15, acrossFrom: 'min', inset: 0.375`)
— its projection on (length, width) is the rectangle [14.8125, 15.1875] × [0, 1], inside the arch's waste → the fault;
the same hole at `station: 1.5` (beside the arch) → `[]`.

`holeText.test.ts`:

```ts
  it('a hole into a curve reads by the curve\'s kind (P4)', () => {
    expect(holeFaultText({ index: 2, kind: 'breaks-out', curve: { id: 'c1', kind: 'arch' } }, pins)).toBe('hole 3 runs into the arch');
    expect(holeFaultText({ index: 0, kind: 'breaks-out', curve: { id: 'c1', kind: null } }, pins)).toBe('hole 1 runs into a curve cut');
  });
```

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement**
- `holeFaults.ts`: `HoleFault` gains `curve?: { id: string; kind: CurveKind | null }` ("breaks-out into a curve's waste:
  the curve"). Add:

```ts
/** A hole meeting a curve's waste (curves spec §6.3; touching is meeting): along `through` its disc, square to it the
 *  rectangle it projects to on (u, v). The first such curve, or null. */
export function intoCurve(board: Board, h: Hole): { id: string; kind: CurveKind | null } | null {
  for (const c of board.curves) {
    const [u, v] = uvDims(c.through);
    const iu = idx(u);
    const iv = idx(v);
    const segs = localSegments(board, c);
    let hit: boolean;
    if (h.axis === c.through) hit = circleMeetsWaste(segs, [h.centre[iu]!, h.centre[iv]!], h.radius);
    else {
      const [lo, hi] = span(h);
      const ax = idx(h.axis);
      const other = ax === iu ? iv : iu;
      const box = (k: number) => (k === ax ? [lo, hi] : [h.centre[other]! - h.radius, h.centre[other]! + h.radius]);
      const bu = box(iu);
      const bv = box(iv);
      hit = rectMeetsWaste(segs, [bu[0]!, bv[0]!], [bu[1]!, bv[1]!]);
    }
    if (hit) return { id: c.id, kind: deriveCurveKind(c) };
  }
  return null;
}
```

  In `holeFaults`, after the edge check: `const curve = intoCurve(board, h); if (curve) out.push({ index: h.index, kind: 'breaks-out', curve });`
  In `holeInStock`: `&& !intoCurve(board, h)` (its wall is then clipped to the bodies, invariant 50).
  The doc comments of `holeFaults` and `breaksOut` mention it.
- `holeText.ts` `holeFaultText`: the `breaks-out` case becomes
  `return f.curve ? \`hole ${n} runs into ${curveKindWord(f.curve.kind)}\` : \`hole ${n} runs past ${edgeName(f.edge!)}\`;`
  with `curveKindWord` from `curveText.ts` (Task 11 creates it; create the file now with just this function:
  `export const curveKindWord = (k: CurveKind | null) => (k === 'arch' ? 'the arch' : k === 'bow' ? 'the bow' : k === 'corner' ? 'the rounded corner' : 'a curve cut');`).
- `faultKey` is unchanged (`index:breaks-out`); `distinctFaults` therefore reports one breaks-out per hole even when a
  hole both passes an edge and meets a curve — say so in its doc comment.

- [ ] **Step 4: Full suite and build** — PASS.
- [ ] **Step 5: Mutate** — swap the touching rule to `< r` (the touching case passes); drop the rectangle branch (the
  edge dowel is missed); drop `intoCurve` from `holeInStock` (no test fails? then add one in `grainTiling.test.ts`: a
  hole into the arch is drawn clipped — the wall triangle count differs from the clean path's 96 — and re-run). Restore.
- [ ] **Step 6: Commit** — `curves: a hole into a curve's waste breaks out`.

---

### Task 11: Bench text and the cut list

**Files:**
- Modify: `src/document/curveText.ts`, `src/document/cutlist.ts`
- Test: `src/document/curveText.test.ts` (create), `src/document/cutlist.test.ts`

**Interfaces:**
- Produces: `curveFaultText(f: CurveFault): string`; `curveLine(board: Board, c: CurveCut, units: Units): string`;
  `curveLines(board: Board, units: Units): string[]` (stored order, four equal corners collapsed to one line at the
  first one's place).

- [ ] **Step 1: Write the failing tests** (`curveText.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { archCurve, bowCurve, cornerCurve, createBoard } from './document';
import { curveLine, curveLines } from './curveText';
import { IMPERIAL } from '../units/length';
import { ARCH, CORNER } from './curves.test';

const MM = { display: 'metric-mm' as const, precision: 16 };
const apron = createBoard({ length: 30, width: 5, thickness: 0.75 });
const top = createBoard({ length: 36, width: 20, thickness: 0.75 });

describe('curveLine (spec §4.1)', () => {
  it('an arch, centred', () => {
    expect(curveLine(apron, ARCH, IMPERIAL)).toBe('Arch on the width min side, 3" in from each length end: 24" span, 1-1/2" rise (radius 48-3/4")');
  });
  it('an arch, off-centre', () => {
    const c = { id: 'x', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 18, rise: 1.5 }) };
    expect(curveLine(apron, c, IMPERIAL)).toMatch(/^Arch on the width min side, from 3" to 21" from the length min end: 1-1\/2" rise \(radius /);
  });
  it('a half-round notch', () => {
    const c = { id: 'n', ...archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 }) };
    expect(curveLine(apron, c, IMPERIAL)).toBe('Half-round notch on the width min side, 2" wide, centred 15" from the length min end (radius 1")');
  });
  it('a bow of an 18" rail, through the width (P7)', () => {
    const rail = createBoard({ length: 18, width: 3, thickness: 0.75 });
    const c = { id: 'b', ...bowCurve({ through: 'width', along: 'length', side: 'min', span: 18, rise: 0.5 }) };
    expect(curveLine(rail, c, IMPERIAL)).toBe('Bow the thickness min side 1/2" (radius 81-1/4"), cut through the width');
  });
  it('a bow shorter than its edge says so (P2)', () => {
    const c = { id: 'b', ...bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 18, rise: 0.5 }) };
    expect(curveLine(apron, c, IMPERIAL)).toBe('Bow the width min side 1/2" over 18" from the length min end (radius 81-1/4")');
  });
  it('a rounded corner', () => {
    expect(curveLine(top, CORNER, IMPERIAL)).toBe('Round the corner of the length max end and the width min side to a 2" radius');
  });
  it('metric', () => {
    expect(curveLine(apron, ARCH, MM)).toBe('Arch on the width min side, 76 mm in from each length end: 610 mm span, 38 mm rise (radius 1238 mm)');
  });
  it('a faulted curve ends with its fault (Review Focus 1)', () => {
    expect(curveLine({ ...apron, length: 26 }, ARCH, IMPERIAL)).toMatch(/ — check: runs past the length max end$/);
  });
  it('no canonical form', () => {
    const odd = { ...ARCH, segments: [{ type: 'arc' as const, to: [27, 0] as [number, number], side: 'left' as const, radius: 50 }, { type: 'line' as const, to: [3, 0] as [number, number] }] };
    expect(curveLine(apron, odd, IMPERIAL)).toBe('Curve cut through the thickness: 1 arc and 1 line');
  });
});

describe('curveLines', () => {
  it('four equal corners on one face are one line, at the first one\'s place', () => {
    const four = (['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => ({ id: `${uf}${vf}`, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: vf, radius: 2 }) })));
    expect(curveLines({ ...top, curves: [ARCH, ...four] }, IMPERIAL)).toEqual([curveLine(top, ARCH, IMPERIAL), 'Round all four corners to a 2" radius']);
  });
  it('three corners print three lines', () => {
    const three = (['min', 'max'] as const).map((uf) => ({ id: uf, ...cornerCurve({ through: 'thickness', uFrom: uf, vFrom: 'min', radius: 2 }) }));
    expect(curveLines({ ...top, curves: three }, IMPERIAL)).toHaveLength(2);
  });
});
```

(Derivations: 3" = 76.2 mm → 76; 24" = 609.6 → 610; 1.5" = 38.1 → 38; radius 48.75" = 1238.25 → 1238. A bow over 18"
with ½" rise: R = (81 + 0.25) / 1 = 81.25. The notch's radius is span/2 = 1. Confirm `formatLength(3, MM)` reads
`76 mm` in `length.test.ts` before trusting the metric string.)

`cutlist.test.ts`:

```ts
describe('curves on the cut list (spec §4)', () => {
  const aprons = (extra: Partial<Board>[]) => ({ ...createDocument('T'), boards: extra.map((x, i) => createBoard({ id: `a${i}`, name: `Apron ${i}`, length: 30, width: 5, thickness: 0.75, material: 'oak', ...x })) });
  const corner = { id: 'k', ...cornerCurve({ through: 'thickness', uFrom: 'max', vFrom: 'max', radius: 1 }) };
  it('an arched apron and a plain one are two rows', () => {
    expect(buildCutList(aprons([{ curves: [ARCH] }, {}]) as FlatDocument).groups[0]!.rows).toHaveLength(2);
  });
  it('the same curves in another order, other ids, are one row (Review Focus 5)', () => {
    const rows = buildCutList(aprons([{ curves: [ARCH, corner] }, { curves: [{ ...corner, id: 'x' }, { ...ARCH, id: 'y' }] }]) as FlatDocument).groups[0]!.rows;
    expect(rows).toHaveLength(1);
  });
  it('curve lines print after the hole lines, and the stock is the box (inv 18)', () => {
    const pin = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 1, count: 1, pitch: 0, acrossFrom: 'max' as const, inset: 1 };
    const row = buildCutList(aprons([{ holes: [pin], curves: [ARCH] }]) as FlatDocument).groups[0]!.rows[0]!;
    expect(row.setup.findIndex((l) => l.startsWith('Arch'))).toBeGreaterThan(row.setup.findIndex((l) => l.startsWith('Hole')));
    expect(row.length).toBe(30);
    expect(row.width).toBe(5);
  });
});
```

(Check `CutListRow`'s field names for the stock dimensions — `grep -n "interface CutListRow" -A20 src/document/cutlist.ts`
— and use them.)

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement** — `curveText.ts`:

```ts
import type { Board, CurveCut, Dimension } from './types';
import { formatLength, type Units } from '../units/length';
import { edgeName, endWord } from './holeText';
import {
  archFields, bowFields, cornerFields, curveFaults, localSegments, uvDims, type CurveFault, type CurveKind, type LocalArc,
} from './curves';

export const curveKindWord = (k: CurveKind | null) => (k === 'arch' ? 'the arch' : k === 'bow' ? 'the bow' : k === 'corner' ? 'the rounded corner' : 'a curve cut');

/** A fault in words (spec §2.5, P4): THE one home (invariant 19), read by the bench line and the Properties note.
 *  Lower-case, no full stop. */
export function curveFaultText(f: CurveFault): string {
  return f.kind === 'runs-off' ? `runs past ${edgeName(f.edge!)}` : 'cuts right through the part';
}

const other = (through: Dimension, d: Dimension): Dimension => uvDims(through).find((x) => x !== d)!;
const radiusOf = (span: number, rise: number) => (span * span / 4 + rise * rise) / (2 * rise);

/**
 * One curve as a bench line (spec §4.1, P2, P7): THE ONE home of these strings (invariant 19). The derived radius in
 * brackets is for the trammel. A faulted curve ends with its first fault.
 */
export function curveLine(board: Board, c: CurveCut, units: Units): string {
  const base = curveLineBase(board, c, units);
  const faults = curveFaults(board, c);
  return faults.length === 0 ? base : `${base} — check: ${curveFaultText(faults[0]!)}${faults.length > 1 ? ` (and ${faults.length - 1} more)` : ''}`;
}

function curveLineBase(board: Board, c: CurveCut, units: Units): string {
  const f = (n: number) => formatLength(n, units);
  const through = c.through === 'thickness' ? '' : `, cut through the ${c.through}`;
  const arch = archFields(c);
  if (arch) {
    const edge = edgeName({ dim: other(c.through, arch.along), side: arch.side });
    const end = endWord(arch.along);
    if (arch.rise === arch.span / 2) {
      return `Half-round notch on ${edge}, ${f(arch.span)} wide, centred ${f(arch.start + arch.span / 2)} from the ${arch.along} ${arch.from} ${end} (radius ${f(arch.span / 2)})${through}`;
    }
    const r = f(radiusOf(arch.span, arch.rise));
    if (Math.abs(board[arch.along] - (arch.start + arch.span) - arch.start) <= 1e-9) {
      return `Arch on ${edge}, ${f(arch.start)} in from each ${arch.along} ${end}: ${f(arch.span)} span, ${f(arch.rise)} rise (radius ${r})${through}`;
    }
    return `Arch on ${edge}, from ${f(arch.start)} to ${f(arch.start + arch.span)} from the ${arch.along} ${arch.from} ${end}: ${f(arch.rise)} rise (radius ${r})${through}`;
  }
  const bow = bowFields(c);
  if (bow) {
    const edge = edgeName({ dim: other(c.through, bow.along), side: bow.side });
    const over = Math.abs(bow.span - board[bow.along]) <= 1e-9 ? '' : ` over ${f(bow.span)} from the ${bow.along} min ${endWord(bow.along)}`;
    return `Bow ${edge} ${f(bow.rise)}${over} (radius ${f(radiusOf(bow.span, bow.rise))})${through}`;
  }
  const corner = cornerFields(c);
  if (corner) {
    const [u, v] = uvDims(c.through);
    return `Round the corner of ${edgeName({ dim: u, side: corner.uFrom })} and ${edgeName({ dim: v, side: corner.vFrom })} to a ${f(corner.radius)} radius${through}`;
  }
  const segs = localSegments(board, c);
  const arcs = segs.filter((s): s is LocalArc => s.kind === 'arc').length;
  const lines = segs.length - arcs;
  return `Curve cut through the ${c.through}: ${arcs} arc${arcs === 1 ? '' : 's'} and ${lines} line${lines === 1 ? '' : 's'}`;
}

/** Every curve's line, stored order; four corner curves on one face with one radius and no fault collapse to one line,
 *  printed where the first of them stands (spec §4.2). */
export function curveLines(board: Board, units: Units): string[] {
  const corners = board.curves.map((c) => ({ c, f: cornerFields(c) })).filter((x) => x.f && curveFaults(board, x.c).length === 0);
  const groups = new Map<string, CurveCut[]>();
  for (const { c, f } of corners) {
    const key = `${f!.through}|${f!.radius}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }
  const collapsed = new Map<CurveCut, string>();
  const skip = new Set<CurveCut>();
  for (const [, cs] of groups) {
    const seen = new Set(cs.map((c) => `${c.uFrom}${c.vFrom}`));
    if (seen.size !== 4) continue;
    const firstFour = cs.slice(0, 4);
    const f = cornerFields(firstFour[0]!)!;
    const through = f.through === 'thickness' ? '' : `, cut through the ${f.through}`;
    collapsed.set(firstFour[0]!, `Round all four corners to a ${formatLength(f.radius, units)} radius${through}`);
    for (const c of firstFour.slice(1)) skip.add(c);
  }
  return board.curves.flatMap((c) => (skip.has(c) ? [] : [collapsed.get(c) ?? curveLine(board, c, units)]));
}
```

(Five identical-radius corner curves with one duplicate corner: `seen.size === 4` but five curves — the first four are
not necessarily the four distinct corners. Take one curve per distinct `uFrom`+`vFrom` instead of `slice(0, 4)` — fix
this when writing it, and add a test with a duplicate corner.)

`cutlist.ts`:
- `import { curveLines } from './curveText';` and `import { curveValues } from './curves';`
- `setupLines`, after the hole lines: `lines.push(...curveLines(board, units));`
- A signature beside `holeSignature`:

```ts
/** The curve half of a row's identity: EXACT and order-independent, ids ignored (curves spec §4.2). */
function curveSignature(board: Board): string {
  return board.curves.map(curveValues).sort().join(';');
}
```

  and `curveSignature(board),` as the last element of `rowKey`'s array.

- [ ] **Step 4: Full suite and build** — PASS.
- [ ] **Step 5: Mutate** — drop `.sort()` from `curveSignature` (Review Focus 5 fails); drop `curveSignature` from
  `rowKey` (two rows test fails); make the notch test `>=` instead of `===` (a deep arch reads as a notch — add the case
  if no test fails); drop the collapse (the four-corners test fails). Restore.
- [ ] **Step 6: Commit** — `curves: bench lines and cut-list grouping`.

---

### Task 12: Joinery, Refine and Repair joints stay away

**Files:**
- Create: `src/document/curvedRefusal.ts`
- Modify: `src/generate/joints/tapers.ts` (`joineryRefusal`), `src/generate/refine.ts` (`plainForRefine`),
  `src/document/refineDesign.ts` (`RefusalReason`, `documentToDesign`), `src/generate/joints/repair.ts` (`repairDocument`)
- Test: `src/document/curvedRefusal.test.ts` (create), `src/generate/joints/runJoinery.test.ts`, `src/generate/refineBase.test.ts`,
  `src/document/refineDesign.test.ts`, `src/generate/joints/repair.test.ts`

**Interfaces:**
- Produces: `curvedParts(flat: FlatDocument): string[]`; `curvedRefusal(flat: FlatDocument, action: 'joinery' | 'refine'): string | null`;
  `RefusalReason` gains `'curves'`.

- [ ] **Step 1: Write the failing tests** — the holes chunk 1 plan's Task 8 tests, one for one, with `curves: [ARCH]` for
  `holes: [pin]`, `'curves'` for `'holes'`, and `curvedParts`/`curvedRefusal`. The message test: `curvedRefusal(flat, 'joinery')`
  contains `(Apron 1, Apron 2, Apron 3…)` for four curved parts; `'refine'` starts `Refine `. And one ordering test in
  `curvedRefusal.test.ts`: a part with BOTH holes and curves gets the holes refusal first (the existing check runs first —
  either is right; pin what the code does so a reorder is deliberate).

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement**

```ts
import type { FlatDocument } from './types';

/** Flat (display) names of the placed parts carrying any curve. */
export function curvedParts(flat: FlatDocument): string[] {
  return flat.boards.filter((b) => b.curves.length > 0).map((b) => b.name);
}

const list = (names: string[]) => `${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;

/**
 * The refusal for a document with curves (curves spec §7), or null. Decided at entry, before any mutation or paid call.
 * Joinery is box-based and would cut a pocket through a curve's waste; Refine cannot describe a curve.
 */
export function curvedRefusal(flat: FlatDocument, action: 'joinery' | 'refine'): string | null {
  const names = curvedParts(flat);
  if (names.length === 0) return null;
  return action === 'joinery'
    ? `Add joinery doesn't handle parts with curves yet (${list(names)}). Add joinery before cutting the curves, or remove them first.`
    : `Refine doesn't handle parts with curves yet (${list(names)}). Refine before cutting the curves, or remove them first.`;
}
```

- `tapers.ts` `joineryRefusal`: after the holes check, `const curved = curvedRefusal(flat, 'joinery'); if (curved) return curved;`
- `refine.ts` `plainForRefine`, after the holes check: `const curved = curvedRefusal(flat, 'refine'); if (curved) return { refused: { reason: 'curves', message: curved } };`
- `refineDesign.ts`: `RefusalReason` gains `| 'curves'`; in `documentToDesign` after the holes refusal:
  `const curved = curvedRefusal(flatDocument(doc), 'refine'); if (curved) return refuse('curves', curved);`
- `repair.ts` `repairDocument`, after the holes line: `if (curvedParts(flat).length > 0) return null; // withheld (curves spec §7)`
- Read `refineDialogInfo` (or wherever `reason` is switched on) for an exhaustive switch the new reason must join; the
  build will say so.

- [ ] **Step 4: Full suite and build** — PASS. **Step 5: Mutate** — remove each of the four entry checks; its test
  fails (the runJoinery one by `complete` being called). **Step 6: Commit** — `curves: joinery, Refine and Repair refuse curved documents`.

---

### Task 13: Store actions

**Files:**
- Modify: `src/store/store.ts`
- Test: `src/store/store.test.ts`

**Interfaces:**
- Produces: `addCurves(boardId: string, curves: Omit<CurveCut, 'id'>[]): void`,
  `updateCurve(boardId: string, curveId: string, next: Omit<CurveCut, 'id'>): void`,
  `removeCurve(boardId: string, curveId: string): void`.

- [ ] **Step 1: Write the failing tests** — a `describe('curve actions (spec §8)')` mirroring the holes chunk 1 plan's
  Task 9 list exactly, on `createBoard({ id: 'apron', name: 'Apron', length: 30, width: 5, thickness: 0.75 })` with
  `const { id: _, ...arch } = ARCH`:
  1. add / update (a rise of 1) / remove are one undo entry each; three undos restore `[]` and `past.length === 0`;
  2. an unchanged update pushes no undo entry (inv 4);
  3. refused while exploded (inv 47);
  4. **held points** (inv 24): grab the part's edge-mid snap point on the width min side at the length's middle (world
     (15, 0, 0) for a flat part at the origin — the lattice point P3 makes air), then add the arch: `grabbed` is dropped;
  5. adding four corners in ONE call is one undo entry (the Rounded corners preset);
  6. a curve added to a part inside an assembly is written to the definition (`mapWorld`), visible through every placement.

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement** — beside the hole actions, the same three bodies with `curves`, `copyCurve` and `sameCurve`
  for `holes`, `copyHoleRow` and `sameHoleRow` (holes chunk 1 plan, Task 9, Step 3, verbatim but for those names), and
  the State interface entries with the doc comment "Curve cuts (curves spec §8): several in one call are one undo entry."

- [ ] **Step 4: Full suite and build** — PASS. **Step 5: Mutate** — remove `judgeHeld()` from `addCurves`; remove the
  `sameCurve` early return; remove `readOnly()` from `updateCurve`. Each fails a test. **Step 6: Commit** — `curves: store actions`.

---

### Task 14: The Curves section

**Files:**
- Modify: `src/document/curves.ts` (presets), `src/panels/Properties.tsx`
- Create: `src/panels/Curves.tsx`
- Test: `src/document/curves.test.ts`, `src/panels/Curves.test.tsx` (create)

**Interfaces:**
- Produces: `defaultArch(board): Omit<CurveCut,'id'> | null`, `defaultNotch(board)`, `defaultBow(board)`,
  `defaultCorner(board)`, `defaultCorners(board): Omit<CurveCut,'id'>[] | null` (curves.ts, barrel-exported); `Curves` component.

- [ ] **Step 1: Write the failing preset tests** (`curves.test.ts`)

```ts
import { defaultArch, defaultBow, defaultCorner, defaultCorners, defaultNotch } from './curves';
describe('presets (spec §8)', () => {
  it('arch: through the thickness on the width min side, 3" in from each length end, rise min(1-1/2, width/4)', () => {
    expect(defaultArch(apron)).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 3, span: 24, rise: 1.25 }));
    expect(defaultArch(createBoard({ length: 6, width: 5, thickness: 0.75 }))).toBeNull();     // no span left
  });
  it('notch: 2" wide, centred, rise 1', () => {
    expect(defaultNotch(apron)).toEqual(archCurve({ through: 'thickness', along: 'length', side: 'min', from: 'min', start: 14, span: 2, rise: 1 }));
  });
  it('bow: the whole width min side, rise min(1/2, width/4)', () => {
    expect(defaultBow(apron)).toEqual(bowCurve({ through: 'thickness', along: 'length', side: 'min', span: 30, rise: 0.5 }));
  });
  it('corner and corners: radius min(1, smaller face dimension / 4)', () => {
    expect(defaultCorner(top)).toEqual(cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: 1 }));
    expect(defaultCorners(createBoard({ length: 3, width: 2, thickness: 0.75 }))).toHaveLength(4);
    expect(defaultCorners(createBoard({ length: 3, width: 2, thickness: 0.75 }))![0]).toMatchObject({ segments: [{ to: [0.5, 0] }, {}, {}] });
  });
});
```

(Derivations: the apron's width is 5, so rise = min(1.5, 1.25) = 1.25; the notch on a 30" length starts at 15 − 1 = 14.)

- [ ] **Step 2: Implement the presets** (`curves.ts`)

```ts
/** "Arch" (spec §8): through the thickness, on the min side of the in-face dimension that is not the length, 3" in from
 *  each length end, rise min(1-1/2", ¼ of that dimension). Null when no span is left. */
export function defaultArch(b: Pick<Board, Dimension>): Omit<CurveCut, 'id'> | null {
  const [u, v] = uvDims('thickness');
  const span = b[u] - 6;
  if (span <= 0) return null;
  return archCurve({ through: 'thickness', along: u, side: 'min', from: 'min', start: 3, span, rise: Math.min(1.5, b[v] / 4) });
}
/** "Half-round notch": 2" wide (rise 1), centred along the length. Null on a part under 2" long. */
export function defaultNotch(b: Pick<Board, Dimension>): Omit<CurveCut, 'id'> | null {
  const [u] = uvDims('thickness');
  if (b[u] < 2) return null;
  return archCurve({ through: 'thickness', along: u, side: 'min', from: 'min', start: b[u] / 2 - 1, span: 2, rise: 1 });
}
/** "Bow": the whole width min side, rise min(1/2", ¼ of the width) (P2: written at the edge's length). */
export function defaultBow(b: Pick<Board, Dimension>): Omit<CurveCut, 'id'> {
  const [u, v] = uvDims('thickness');
  return bowCurve({ through: 'thickness', along: u, side: 'min', span: b[u], rise: Math.min(0.5, b[v] / 4) });
}
const cornerRadius = (b: Pick<Board, Dimension>) => { const [u, v] = uvDims('thickness'); return Math.min(1, Math.min(b[u], b[v]) / 4); };
/** "Rounded corner": the length-min / width-min corner. */
export function defaultCorner(b: Pick<Board, Dimension>): Omit<CurveCut, 'id'> {
  return cornerCurve({ through: 'thickness', uFrom: 'min', vFrom: 'min', radius: cornerRadius(b) });
}
/** "Rounded corners": all four, one undo entry (the store's addCurves takes them together). */
export function defaultCorners(b: Pick<Board, Dimension>): Omit<CurveCut, 'id'>[] {
  const r = cornerRadius(b);
  return (['min', 'max'] as const).flatMap((uf) => (['min', 'max'] as const).map((vf) => cornerCurve({ through: 'thickness', uFrom: uf, vFrom: vf, radius: r })));
}
```

  (`defaultCorners`' test expects a non-null array: its type is the array. Fix the test's `!` if the type says so.)

- [ ] **Step 3: Write the failing panel tests** (`src/panels/Curves.test.tsx`, modelled on `Holes.test.tsx` — copy its
  `open`/`add` helpers with the menu button `'+ Add curve'`):
  1. adds an Arch and shows its bench line (`/^Arch on the width min side, 3" in from each length end/`);
  2. "Rounded corners" adds four curves in one undo entry and the section shows four rows;
  3. a Rise over half the span is refused by the field (`An arc is at most a half circle — reduce the Rise first.`),
     the stored rise unchanged, focus kept;
  4. a Rise that cuts through (rise = width, on a 1-1/2" wide part with Start/Span leaving room) is refused
     (`Removes more than the width — reduce the Rise first.`);
  5. **Review Focus 1**: add the Arch, `updateBoard('apron', { length: 26 })` — the curve is kept, the row shows
     `Runs past the length max end at this size.`; then set Span to 20: accepted (still faulted? at 26 the arch from 3 to
     23 fits: the fault clears — assert no note);
  6. a curve whose edit would put a hole into its waste is refused with the hole's words
     (`Puts hole 1 into the arch — move it first.`): a part with a ¼" through bore at (15, 2) and an Arch; set Rise 1.9;
  7. Through: switching an Arch to Width re-seats it (the row's Side select now lists thickness sides) and the stored
     curve has `through: 'width'`;
  8. a preset whose default faults is withheld (a 5" long part: no Arch in the menu; Rounded corner present);
  9. Remove;
  10. a curve with no canonical form shows only its bench line and Remove (no fields).

- [ ] **Step 4: Implement `Curves.tsx`** — structure as `Holes.tsx` (one `CurveRowView` per stored curve, a `field`/`set`
  pair over `attempt`, the Popover menu with withheld presets). The row by `deriveCurveKind(curve)`:

```tsx
import { useState } from 'react';
import { useStore } from '../store/store';
import {
  archCurve, archFields, bowCurve, bowFields, cornerCurve, cornerFields, curveFaults, defaultArch, defaultBow,
  defaultCorner, defaultCorners, defaultNotch, deriveCurveKind, holeFaults, uvDims,
} from '../document/document';
import type { Board, CurveCut, CutFrom, Dimension } from '../document/document';
import { curveFaultText, curveLine } from '../document/curveText';
import { distinctFaults, edgeName, endWord, faultKey } from '../document/holeText';
import { DimensionField } from './DimensionField';
import { Popover } from './Popover';

const DIMS: Dimension[] = ['length', 'width', 'thickness'];
const cap = (d: string) => d[0]!.toUpperCase() + d.slice(1);
type Draft = Omit<CurveCut, 'id'>;

/** The refusal for an edit that ADDS a curve fault, or a hole fault, the stored state lacks (spec §8). */
function refusalFor(board: Board, curve: CurveCut, next: Draft, control: 'Rise' | 'Span' | 'Radius' | 'Start' | null): string | null {
  const had = new Set(curveFaults(board, curve).map((f) => f.kind));
  const added = curveFaults(board, next).find((f) => !had.has(f.kind));
  if (added) {
    if (added.kind === 'cuts-through') return `Removes more than the ${uvDims(next.through).find((d) => d !== (archFields(next)?.along ?? bowFields(next)?.along))} — reduce the ${control ?? 'Rise'} first.`;
    return control === 'Radius' ? `A radius can't run past ${edgeName(added.edge!)} — reduce it first.` : `Runs past ${edgeName(added.edge!)} — reduce the ${control ?? 'Span'} first.`;
  }
  const after: Board = { ...board, curves: board.curves.map((c) => (c.id === curve.id ? { ...next, id: curve.id } : c)) };
  for (const row of board.holes) {
    const was = new Set(distinctFaults(holeFaults(board, row)).map(faultKey));
    const hit = distinctFaults(holeFaults(after, row)).find((f) => !was.has(faultKey(f)) && f.curve);
    if (hit) return `Puts hole ${hit.index + 1} into ${hit.curve!.kind === 'arch' ? 'the arch' : hit.curve!.kind === 'bow' ? 'the bow' : hit.curve!.kind === 'corner' ? 'the rounded corner' : 'a curve cut'} — move it first.`;
  }
  return null;
}
```

  (Use `curveKindWord` from `curveText.ts` in place of the inline chain above when writing it. The cuts-through
  dimension word: for an Arch or Bow, the in-face dimension that is not `along`; for a corner, the smaller of u and v.)

  Rows:
  - **Arch** — Through (select of the three dimensions; a change re-seats: keep `along` unless it equals the new
    through, then use the old through; the side stays), Side (select: `edgeName` of the edge dimension's min/max —
    labels `cap()`'d, e.g. "Width min side"), From (select of `along`'s min/max end, `endWord`), Start
    (`DimensionField`, min 0), Span (min > 0), Rise (`max = span / 2`, its own message "An arc is at most a half circle —
    reduce the Rise first." through the field's `invalid`/max path — read DimensionField's props for how a max message
    is worded; if it cannot carry a custom one, return the text from `onCommit`, the holes chunk 1 R7 path). An edit of
    Start keeps the span: write `archCurve({ ...fields, start })`.
  - **Bow** — Through, Side, Rise. Every edit writes `bowCurve({ ...fields, span: board[along] })` (P2: refits). When
    `fields.span !== board[along]` the row shows the note `Spans ${f(span)} of this ${f(board[along])} ${along} — change the Rise to refit it.`
  - **Rounded corner** — Through, Corner (select of the four `uFrom|vFrom` pairs, labelled
    `${cap(u)} ${uFrom} ${endWord(u)} / ${v} ${vFrom} ${endWord(v)}`), Radius.
  - **No canonical form** — the bench line and Remove only.
  - Every row: the bench line (`curveLine(board, curve, units)`) as a `field-note`; a stored fault's note
    (`${cap(curveFaultText(f))} at this size.`) with `role="status"`; the Remove button
    (`aria-label={\`Remove curve (${line})\`}`). Fields take `units={units}` (`useStore((s) => s.doc.units)`), as
    Holes.tsx does.
  - Menu: `+ Add curve ▾` with items Arch, Half-round notch, Bow, Rounded corner, Rounded corners (detail lines:
    "An arch along the width min side", "A half circle 2" wide, centred", "The whole width min side bowed", "One corner",
    "All four corners"), each withheld when its default is null or faults on this part (`curveFaults` non-empty, or a
    hole fault it would add); "No curve preset fits this part." when none fits.

- [ ] **Step 5: Mount it** — `Properties.tsx`: `import { Curves } from './Curves';` and `<Curves board={board} />`
  directly after `<Holes board={board} />`.

- [ ] **Step 6: Run, full suite and build** — PASS; `Holes.test.tsx` and `AngleCuts.test.tsx` still pass unchanged.

- [ ] **Step 7: Mutate** — refuse on ANY fault rather than an ADDED one (Review Focus 1's edit test fails); drop the
  hole check from `refusalFor` (test 6 fails); drop the withholding (test 8 fails); write the Bow at its stored span
  instead of the edge (a P2 test — add one if none fails: lengthen the part, edit Rise, the stored span equals the new
  length). Restore.

- [ ] **Step 8: Commit** — `curves: the Curves section (Arch, Half-round notch, Bow, Rounded corner(s))`.

---

### Task 15: Live check on the dev server

**Files:**
- Create: `docs/browser-verification-curves.md`, screenshots in `docs/img/curves-*.png`

- [ ] **Step 1:** `npm run dev -- --port 5181 --strictPort` in the background. Open it in the **Playwright MCP**
  browser (the user can watch). **The dev origin :5181 is the user's profile** (six keys, three projects, "Shaker Side
  Table — joined" active): **never `localStorage.clear()`**; create one temporary project named
  `curves check — delete me`, and delete only it afterwards, by id.
- [ ] **Step 2: Drive and record, DOM readouts first:**
  1. Add a part 30 × 5 × ¾; add an **Arch**: the Properties line and the cut-list line read as Task 11's string. Turn the
     part on edge. Screenshot from the front: a smooth arch, no facet lines, the edge lines at its ends.
     `docs/img/curves-arch.png`.
  2. A 36 × 20 × ¾ top with **Rounded corners**: one undo entry; four smooth corners; the cut list reads `Round all four
     corners to a 1" radius`.
  3. **Bow** a rail through the width (Through → Width); look from above.
  4. Snap the Tape tool from an arch end to the other: the readout is the span (24").
  5. Section cut (Side) through the arch: the cap follows the arch.
  6. Shorten the apron to 26": the note shows; Span 20: accepted, the note clears.
  7. Drill a ¼" Hole and try to raise the arch into it: refused with the hole's words.
  8. Group the apron, Copy mirrored: the copy's arch mirrors. Edit the original's Rise: both update.
  9. Fade (select another part with the apron behind): no internal walls visible in the faded arch.
  10. Open Add joinery and Refine: both show the curves refusal.
  11. Open the Plans sheet: the arch is drawn, hidden lines dashed where another part hides it.
  12. **Time a drag**: gizmo-resize the arched apron's length for about 2 s and read the frame time with a
      `requestAnimationFrame` probe via `browser_evaluate`. Over about 16 ms per frame: report the number to the user, do
      not optimise unmeasured.
  13. Undo back; every step one entry.
- [ ] **Step 3:** Record each step in `docs/browser-verification-curves.md`: what was checked, what was seen, and what
  software GL cannot confirm — smooth shading and the grain seam on a curved face → **the user, on real hardware** (fu
  26a; the grain seam is accepted this round, spec §3.4).
- [ ] **Step 4:** Delete the temporary project by id; confirm by reading `sloyd.library.v1`'s index that only it went
  and that the six keys and three projects are as before. Stop the dev server with `fuser -k 5181/tcp`.
- [ ] **Step 5: Commit** — `docs: curves chunk 1 — browser verification`.

---

### Task 16: Record and merge

- [ ] **Step 1: Final review.** A whole-branch review against the spec and this plan. A finding that conflicts with the
  spec or a planning ruling is the user's decision (CLAUDE.md working agreements).
- [ ] **Step 2: Records.**
  - The spec: mark P1–P7 as *Amended (planning chunk 1)* in the sections they touch (§2.3 closure, §8 Bow, §3.5 air and
    snap kinds, §2.5/§4.1 fault words, §3.2 decider, §4.1 suffix) — only after the user approved them with the plan.
  - `CLAUDE.md`: Status (chunk 1 merged, schema 17; rolling back below 17 strands every project saved since — export
    first); one row in "Rounds shipped"; the Versioning table's `16→17` row and `CURRENT_VERSION` 17; the file index
    (`curves.ts`, `curveText.ts`, `curvedRefusal.ts`, `outline.ts`, `Curves.tsx`, `curvesPerf.test.ts`); the invariants
    amended per spec §11 (2, 15, 16, 33, 35, 40, 44, 45, 48, 50, and new **53**), condensed; the test count under Commands.
  - `docs/history.md`: the round's narrative (what shipped, the planning rulings, what the browser pass could and could
    not confirm, the spike's numbers).
  - `docs/follow-ups.md`: new entries for chunk 2 (Plans-sheet arcs at the drawing tolerance, part diagrams), spec §12's
    list (the grain seam with fu 336), and anything the reviews or the live check deferred.
  - `docs/feature-gaps.md` §1 Curves: "chunk 1 merged <date> (schema 17)".
- [ ] **Step 3: Merge — on the user's word.** `git checkout master && git merge --no-ff curves`, run
  `npm test && npm run build` on the merged tree, `git branch -d curves`.
- [ ] **Step 4: Deploy is a separate decision.** Ask the user before `docker compose up -d --build`; follow
  `DEPLOYMENT.local.md` and the deployment rule (bundle hash in-network and at the edge, old bundle 404, CSP header,
  a real-browser load with 0 errors, production localStorage cleared from a plain asset page afterwards).
