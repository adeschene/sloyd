# Angle cuts, chunk 1 (primitive + Taper) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A part can carry single-angle plane cuts (`Board.angleCuts`, schema 14) that the 3D view, edges, snap points,
Plans-sheet drawings, cut list and part diagrams all show truly; the user can add and edit a **Taper** by hand; Add
joinery, Refine and Repair joints stay away from angled documents.

**Architecture:** One new primitive (`AngleCut`, a half-space) beside `cuts`. `boardSolids` is renamed `pocketCells`
(stock minus rectangular cuts, unchanged); the new `boardBodies` clips each pocket cell by every angle cut's kept
half-space into a convex polyhedron — the ONE place angle cuts become geometry. Every consumer that must see angle cuts
reads bodies; anything that only needs rectangles stays on `pocketCells`. A body no angle cut clips keeps today's code
path byte-for-byte (render, drawing occluders), so existing behaviour cannot drift.

**Tech Stack:** TypeScript, React, Zustand, react-three-fiber/three.js, Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-10-12-sloyd-angle-cuts-design.md` (approved 2026-10-12). Read it, and
`CLAUDE.md`'s invariants 2, 15, 16, 17, 19, 24, 33, 35, 38, 40, 41, 44, 45, 46, 47, before Task 1.

## Global Constraints

- Work on a local branch `angle-cuts`; merge with `git merge --no-ff` into `master`, verify the merged tree, delete the
  branch. **No pull requests.**
- `CURRENT_VERSION` becomes **14**. Versioning row: `13→14 · angleCuts (default [], malformed entry dropped) ·
  document-level · silent loss on round trip`.
- Stored values are exact; display rounds. **45° is stored as depth = run, never via `Math.tan`** (spec §2.3).
- Angles display to **0.1°** (`toFixed(1)`), always. Lengths through `formatLength` at the document precision.
- Wording uses the existing vocabulary: "the width face (min side)", "the length min end". No posture words.
- `kind` is the preset's word; it never decides geometry; it IS compared wherever "same angle cut" is asked.
- Every field of `AngleCut` but `id` is in `ANGLE_CUT_FIELDS` (`satisfies`), the one "same angle cut" table.
- Rules from CLAUDE.md that bind every task: invariants 1, 4 (no no-op undo entries), 5 (DimensionField refuses,
  never clamps), 8, 11, 15, 16, 19, 24, 27, 33, 36, 41, 44, 45, 46, 47.
- `npm test` does not typecheck. **Run `npm run build` before claiming any task compiles.**
- **Mutate every test this plan supplies** (break the code it pins, see it fail, restore) before trusting it — the
  plan's own tests are hypotheses (CLAUDE.md working agreements). Each task lists its mutations.
- Chunk 1 ships only the **Taper** preset. Miter, Bevel and Chamfer exist as data (hand-edited files, `angleShape`)
  but have no add controls until chunks 2 and 3.

## Review Focus

1. **A taper on a part inside a mirrored assembly**: the copy must show a mirror-image taper and editing either side
   must write the stored cut back exactly (no drift after repeated edits). Pinned in Task 4.
2. **A tapered leg that is also mortised**: the mortise and the taper must both render, edge-draw and print; the
   cut list must show both lines. Pinned in Tasks 3, 5 and 9.
3. **Shortening a part until its taper removes nothing**: the cut stays, the row says "removes nothing at this size",
   the cut list stops printing it and two otherwise identical parts group together. Pinned in Tasks 9 and 12.
4. **Linking a tapered part to a plain one / duplicating a tapered part**: link must see them as different (sameShared),
   duplicates must carry fresh angle-cut ids and independent `points` arrays. Pinned in Task 2.
5. **A hand-edited file with a miter/chamfer, a bad `kind`, or a malformed angle cut**: it must open, drop only the
   malformed entry, derive the missing `kind`, and print a line for each. Pinned in Tasks 1 and 9.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/document/types.ts` (modify) | `AngleKind`, `AngleCut`, `Board.angleCuts` |
| `src/document/angleCuts.ts` (create) | the model: `ANGLE_CUT_FIELDS`, values/equality/copy, `depthAt`, `zeroStation`, `keptHalfSpace`, `angleCutRemovesNothing`, `deriveKind`, `mirrorAngleCut`, taper field conversions. Imports only `types` and `geometry`. |
| `src/document/bodies.ts` (create) | `boardBodies`, `bodyVolume`, `bodyEdges`, `boardEdges` (dispatch), `angleCornerPoints` |
| `src/document/angleText.ts` (create) | `angleLine`, `shortPointLine`, `angleDegrees` — every angle string (→ `units`) |
| `src/document/angledRefusal.ts` (create) | `angledParts`, `angledRefusal` — the joinery/refine refusal text |
| `src/document/cuts.ts` (modify) | rename `boardSolids`→`pocketCells`, `boardEdges`→`pocketEdges`; `stockProbe` reads angle cuts |
| `src/document/document.ts` (modify) | schema 14, `validateAngleCuts`, `createBoard` default, barrel exports |
| `src/document/links.ts`, `shapes.ts`, `treeEdit.ts`, `treeOps.ts`, `frames.ts`, `generated.ts`, `refineDesign.ts` (modify) | carry / compare / mirror / refuse `angleCuts` |
| `src/document/designCheck.ts` (modify) | `worldBox` helper (exact `worldSolids` mapping, reused) |
| `src/document/drawing.ts` (modify) | `worldBodies`, `hiddenSpanPlanes`; occluders from bodies |
| `src/document/snapPoints.ts` (modify) | withholds via bodies, adds sloped-face corners |
| `src/document/cutlist.ts`, `diagram.ts` (modify) | angle rows, short point, grouping; `DiagramView.angles` |
| `src/viewport/grainTiling.ts` (modify) | `boardUVSignature` + `bodyMesh` (pure; unit-tested) |
| `src/viewport/BoardMesh.tsx` (modify) | renders bodies; clipped ones through `bodyMesh` |
| `src/panels/PartDiagram.tsx` (modify) | draws angle polygons + notes |
| `src/panels/AngleCuts.tsx` (create) | the Angles section: rows, Taper controls, + Add taper |
| `src/panels/Properties.tsx`, `JoineryDialog.tsx`, `src/App.tsx` (modify) | wire the section and the refusal |
| `src/store/store.ts` (modify) | `copyBoard`; `addAngleCuts` / `updateAngleCut` / `removeAngleCut` |
| `src/generate/run.ts`, `refine.ts`, `joints/repair.ts`, `src/useJoinery.ts` (modify) | the refusals |
| `src/document/turnFixtures.ts` (modify) | `chiralAngled(posture)` test fixture |
| `docs/browser-verification-angle-cuts.md` (create) | the live pass |

---

### Task 1: The primitive, schema 14, validation

**Files:**
- Modify: `src/document/types.ts` (beside `Cut`, and `Board` at line ~100)
- Create: `src/document/angleCuts.ts`, `src/document/angleCuts.test.ts`
- Modify: `src/document/document.ts` (`CURRENT_VERSION` line 119, `createBoard` line ~207, `validateSharedFields` line ~357-394, barrel exports lines 30-31)
- Modify: `src/document/links.ts` (LINK_FIELDS line 10-14, `_sharedPrimitives` 35, `sharedOf` 40-46, `sharedPatch` 49-55, `sameShared` 58-72), `src/document/shapes.ts:31` (`resolveBoard`), `src/document/generated.ts:206`
  — all of `links.ts` lands here: classifying `angleCuts` shared without its comparison breaks `sameShared` for every pair (`[] !== []`) and `_sharedPrimitives` fails `tsc`.
- Modify: every test literal `tsc` flags (Step 7)
- Test: `src/document/document.test.ts`, `src/document/links.test.ts`, `src/document/shapes.test.ts` (append)

**Interfaces:**
- Produces (types.ts): `type AngleKind = 'taper' | 'miter' | 'bevel' | 'chamfer'`; `interface AngleCut { id: string; kind: AngleKind; face: Dimension; from: CutFrom; along: Dimension; alongFrom: CutFrom; points: [[number, number], [number, number]] }`; `Board.angleCuts: AngleCut[]` (required).
- Produces (angleCuts.ts): `type V3 = [number, number, number]` (components in `DIMENSION_ORDER`: length, width, thickness); `ANGLE_KINDS: AngleKind[]`; `ANGLE_CUT_FIELDS`; `ANGLE_CUT_KEYS`; `angleCutValues(c): (string|number)[]`; `sameAngleCut(a, b): boolean`; `copyAngleCut(c): AngleCut`; `throughOf(c): Dimension`; `depthAt(c, s): number`; `zeroStation(c): number` (NaN when the depths are equal); `keptHalfSpace(board, c): { n: V3; d: number } | null`; `angleCutRemovesNothing(board, c): boolean`; `angleCutsThatRemoveStock(board): AngleCut[]`; `deriveKind(c, board): AngleKind`.

- [ ] **Step 0: Branch**

```bash
git checkout -b angle-cuts
```

- [ ] **Step 1: Add the types**

In `src/document/types.ts`, after the `Cut` interface:

```ts
/** The word an angle cut's preset chose (angle-cuts spec §2.4). Names the cut and picks
 *  its row's controls; never decides geometry. */
export type AngleKind = 'taper' | 'miter' | 'bevel' | 'chamfer';

/**
 * A single-angle plane cut (angle-cuts spec §2): a straight line in the
 * `face` × `along` plane, running straight through the third dimension; the
 * stock on the `from` side of the line is removed. One half-space, unbounded:
 * a line that runs negative removes nothing there by construction.
 *
 * Board-local like `Cut`, so turns and postures cost nothing.
 */
export interface AngleCut {
  /** Unique within its board (per shape for a shape) — invariant 33's scopes. */
  id: string;
  kind: AngleKind;
  /** The dimension the cut goes into … */
  face: Dimension;
  /** … entering from its min or max face. Depths are measured from that face. */
  from: CutFrom;
  /** The second dimension of the sloped line's plane. Always differs from `face`. */
  along: Dimension;
  /** Which end of `along` stations are measured from. */
  alongFrom: CutFrom;
  /** Two points on the line: [station along `along`, depth into `face`], inches. Stations differ. */
  points: [[number, number], [number, number]];
}
```

In `Board`, after `cuts: Cut[];`:

```ts
  /** Single-angle plane cuts (tapers, miters, bevels, chamfers). Empty for most parts. */
  angleCuts: AngleCut[];
```

- [ ] **Step 2: Write the failing tests for the model**

Create `src/document/angleCuts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut, Board } from './types';
import {
  ANGLE_CUT_KEYS, angleCutRemovesNothing, angleCutValues, copyAngleCut, deriveKind, depthAt,
  keptHalfSpace, sameAngleCut, throughOf, zeroStation,
} from './angleCuts';

const leg = (over: Partial<Board> = {}): Board =>
  createBoard({ name: 'Leg', length: 29, width: 1.75, thickness: 1.75, ...over });

// The spec's worked taper: 5/8 off the width face (min side), starting 24 from the length min end.
const taper: AngleCut = {
  id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min',
  points: [[0, 0.625], [24, 0]],
};

/** g(x) = n·x + d at a board-local point [length, width, thickness]. */
const g = (b: Board, c: AngleCut, p: [number, number, number]) => {
  const h = keptHalfSpace(b, c)!;
  return h.n[0] * p[0] + h.n[1] * p[1] + h.n[2] * p[2] + h.d;
};

describe('the angle-cut model', () => {
  it('lists every field but id, kind included', () => {
    expect([...ANGLE_CUT_KEYS].sort()).toEqual(['along', 'alongFrom', 'face', 'from', 'kind', 'points']);
  });

  it('reads depth along the line and finds where it reaches zero', () => {
    expect(depthAt(taper, 0)).toBe(0.625);
    expect(depthAt(taper, 24)).toBe(0);
    expect(depthAt(taper, 12)).toBeCloseTo(0.3125, 12);
    expect(zeroStation(taper)).toBe(24);
    expect(zeroStation({ ...taper, points: [[0, 0.5], [10, 0.5]] })).toBeNaN();
  });

  it('names the through dimension', () => {
    expect(throughOf(taper)).toBe('thickness');
  });

  it('keeps the side away from the from face (min side, stations from the min end)', () => {
    const b = leg();
    expect(g(b, taper, [0, 0.625, 1])).toBeCloseTo(0, 12);    // on the line at the foot
    expect(g(b, taper, [0, 0.3, 1])).toBeLessThan(0);         // removed: inside the wedge at the foot
    expect(g(b, taper, [0, 1, 1])).toBeGreaterThan(0);        // kept
    expect(g(b, taper, [26, 0, 1])).toBeGreaterThan(0);       // above the taper's start: the face itself is kept
    const h = keptHalfSpace(b, taper)!;
    expect(Math.hypot(...h.n)).toBeCloseTo(1, 12);
    expect(h.n[2]).toBe(0);                                   // straight through thickness
  });

  it('measures from the max face and the max end when told to', () => {
    const b = leg();
    const c: AngleCut = { ...taper, from: 'max', alongFrom: 'max' };
    expect(g(b, c, [29, 1.75 - 0.625, 1])).toBeCloseTo(0, 12); // on the line at the max end
    expect(g(b, c, [29, 1.5, 1])).toBeLessThan(0);
    expect(g(b, c, [0, 1.75, 1])).toBeGreaterThan(0);
  });

  it('returns null for equal stations', () => {
    expect(keptHalfSpace(leg(), { ...taper, points: [[3, 0], [3, 1]] })).toBeNull();
  });

  it('removes nothing when the line is at or below zero across the whole part', () => {
    const b = leg();
    expect(angleCutRemovesNothing(b, taper)).toBe(false);
    expect(angleCutRemovesNothing(b, { ...taper, points: [[0, 0], [24, -1]] })).toBe(true);
    expect(angleCutRemovesNothing(b, { ...taper, points: [[30, 0], [40, 1]] })).toBe(true); // starts past the end
  });

  it('compares by every field but id, and copies the points', () => {
    expect(sameAngleCut(taper, { ...taper, id: 'other' })).toBe(true);
    expect(sameAngleCut(taper, { ...taper, kind: 'bevel' })).toBe(false);
    expect(sameAngleCut(taper, { ...taper, points: [[0, 0.625], [24, 1e-12]] })).toBe(false);
    const c = copyAngleCut(taper);
    expect(c).toEqual(taper);
    expect(c.points).not.toBe(taper.points);
    expect(c.points[0]).not.toBe(taper.points[0]);
    expect(angleCutValues(taper)).toEqual(['taper', 'width', 'min', 'length', 'min', 0, 0.625, 24, 0]);
  });

  it('derives a kind for a file without one (spec §2.4)', () => {
    const b = leg({ width: 2.5, thickness: 0.75 });
    const base = { id: 'x', kind: 'taper' as const, from: 'min' as const, alongFrom: 'min' as const };
    expect(deriveKind({ ...base, face: 'length', along: 'width', points: [[0, 0], [2.5, 2.5]] }, b)).toBe('miter');
    expect(deriveKind({ ...base, face: 'width', along: 'length', points: [[0, 0.5], [20, 0]] }, b)).toBe('taper');
    expect(deriveKind({ ...base, face: 'thickness', along: 'width', points: [[0, 0.125], [0.125, 0]] }, b)).toBe('chamfer');
    expect(deriveKind({ ...base, face: 'width', along: 'thickness', points: [[0, 0], [0.75, 0.2]] }, b)).toBe('bevel');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/document/angleCuts.test.ts`
Expected: FAIL — cannot resolve `./angleCuts`.

- [ ] **Step 4: Write `src/document/angleCuts.ts`**

```ts
import type { AngleCut, AngleKind, Board, CutFrom, Dimension } from './types';
import { DIMENSION_ORDER } from './geometry';

/**
 * A board-local vector or point with components in DIMENSION_ORDER
 * (length, width, thickness). Never world axes.
 */
export type V3 = [number, number, number];

export const ANGLE_KINDS: AngleKind[] = ['taper', 'miter', 'bevel', 'chamfer'];

/**
 * Every field of `AngleCut` that decides "same angle cut": all but `id`, `kind`
 * INCLUDED (angle-cuts spec §2.4, §4.2) — two cuts that would print different
 * words cannot share a cut-list line or a Shape. A TABLE CHECKED AGAINST THE
 * TYPE (invariant 40's pattern, one type over): a new `AngleCut` field fails
 * `tsc` here until it is listed.
 */
export const ANGLE_CUT_FIELDS = {
  kind: true, face: true, from: true, along: true, alongFrom: true, points: true,
} as const satisfies Record<Exclude<keyof AngleCut, 'id'>, true>;

export const ANGLE_CUT_KEYS = Object.keys(ANGLE_CUT_FIELDS) as (keyof typeof ANGLE_CUT_FIELDS)[];

/** One angle cut's comparable values, in ANGLE_CUT_KEYS order, `points` flattened. */
export function angleCutValues(c: AngleCut): (string | number)[] {
  return ANGLE_CUT_KEYS.flatMap((k) =>
    k === 'points' ? [c.points[0][0], c.points[0][1], c.points[1][0], c.points[1][1]] : [c[k]]);
}

/** Exact equality on every ANGLE_CUT_FIELDS field (stored values, invariant 18). */
export function sameAngleCut(a: AngleCut, b: AngleCut): boolean {
  const x = angleCutValues(a);
  const y = angleCutValues(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** A copy sharing no array with the original, so no two parts ever hold one cut's points. */
export function copyAngleCut(c: AngleCut): AngleCut {
  return { ...c, points: [[c.points[0][0], c.points[0][1]], [c.points[1][0], c.points[1][1]]] };
}

/** The dimension the cut runs straight through. */
export function throughOf(c: Pick<AngleCut, 'face' | 'along'>): Dimension {
  return DIMENSION_ORDER.find((d) => d !== c.face && d !== c.along)!;
}

/** Depth into `face` of the line at station `s` (measured from `alongFrom`'s end). */
export function depthAt(c: Pick<AngleCut, 'points'>, s: number): number {
  const [[s1, q1], [s2, q2]] = c.points;
  return q1 + ((q2 - q1) * (s - s1)) / (s2 - s1);
}

/** The station where the line reaches depth 0; NaN when the depths are equal (the line never does). */
export function zeroStation(c: Pick<AngleCut, 'points'>): number {
  const [[s1, q1], [s2, q2]] = c.points;
  if (q1 === q2) return NaN;
  return s1 - (q1 * (s2 - s1)) / (q2 - q1);
}

const sign = (f: CutFrom) => (f === 'min' ? 1 : -1);

/**
 * The cut's KEPT side as a half-space n·x + d >= 0 in board-local inches,
 * |n| = 1 (angle-cuts spec §2.2). With q(x) the depth from the `from` face and
 * s(x) the station from `alongFrom`'s end, the kept side is
 * q(x) − depthAt(s(x)) >= 0. Null for equal stations (validation drops such a
 * cut; a Board built in code is answered, not thrown at).
 */
export function keptHalfSpace(board: Pick<Board, Dimension>, c: AngleCut): { n: V3; d: number } | null {
  const [[s1, q1], [s2, q2]] = c.points;
  if (s1 === s2) return null;
  const k = (q2 - q1) / (s2 - s1);
  const sf = sign(c.from);
  const cf = c.from === 'min' ? 0 : board[c.face];
  const sa = sign(c.alongFrom);
  const ca = c.alongFrom === 'min' ? 0 : board[c.along];
  const n: V3 = [0, 0, 0];
  n[DIMENSION_ORDER.indexOf(c.face)] = sf;
  n[DIMENSION_ORDER.indexOf(c.along)] = -k * sa;
  const d = cf - q1 - k * (ca - s1);
  const len = Math.hypot(1, k);
  return { n: [n[0] / len, n[1] / len, n[2] / len], d: d / len };
}

/**
 * True when the cut takes no stock out of this part: its line is at or below
 * depth 0 at both ends of `along` (linear, so nowhere in between is deeper).
 * Kept in the document and noted in Properties (spec §2.3); never dropped on load.
 * `!(x > 0)` so a NaN counts as nothing removed.
 */
export function angleCutRemovesNothing(board: Pick<Board, Dimension>, c: AngleCut): boolean {
  return !(Math.max(depthAt(c, 0), depthAt(c, board[c.along])) > 0);
}

/** The angle cuts that actually remove stock — what the cut list prints and groups by. */
export function angleCutsThatRemoveStock(board: Board): AngleCut[] {
  return board.angleCuts.filter((c) => !angleCutRemovesNothing(board, c));
}

/**
 * The fallback word for a file without a valid `kind` (spec §2.4): an end cut
 * is a miter; a slope along the length is a taper; a slope whose line meets
 * depth 0 inside the part and never reaches the far face is a chamfer;
 * anything else is a bevel.
 */
export function deriveKind(c: Omit<AngleCut, 'id' | 'kind'> & { id?: string; kind?: AngleKind }, board: Pick<Board, Dimension>): AngleKind {
  if (c.face === 'length') return 'miter';
  if (c.along === 'length') return 'taper';
  const z = zeroStation(c);
  const deepest = Math.max(depthAt(c, 0), depthAt(c, board[c.along]));
  return z > 0 && z < board[c.along] && deepest < board[c.face] ? 'chamfer' : 'bevel';
}
```

- [ ] **Step 5: Run the model tests**

Run: `npx vitest run src/document/angleCuts.test.ts`
Expected: PASS.

- [ ] **Step 6: Schema 14 — failing tests first**

Append to `src/document/document.test.ts` (it already imports `migrateDocument`, `createDocument`, `CURRENT_VERSION`
or reach them from `./document`):

```ts
describe('schema 14: angleCuts (angle-cuts spec §5.1)', () => {
  const v13 = (boards: unknown[]) => ({ ...createDocument('A'), version: 13, boards });
  const plain = { id: 'b1', name: 'Leg', length: 29, width: 1.75, thickness: 1.75, position: [0, 0, 0], rotation: 0, posture: 'upright', grain: 'length', material: 'oak', cuts: [] };
  const good = { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] };

  it('is version 14', () => {
    expect(CURRENT_VERSION).toBe(14);
  });

  it('defaults a v13 part to no angle cuts', () => {
    const doc = migrateDocument(v13([plain]));
    expect((doc.boards[0] as Board).angleCuts).toEqual([]);
  });

  it('keeps a well-formed angle cut exactly', () => {
    const doc = migrateDocument({ ...v13([{ ...plain, angleCuts: [good] }]), version: 14 });
    expect((doc.boards[0] as Board).angleCuts).toEqual([good]);
  });

  it('drops malformed entries and keeps the rest', () => {
    const bad = [
      { ...good, id: 'e1', points: [[3, 0], [3, 1]] },              // equal stations
      { ...good, id: 'e2', points: [[0, NaN], [24, 0]] },           // non-finite
      { ...good, id: 'e3', along: 'width' },                        // along === face
      { ...good, id: 'e4', from: 'top' },                           // unknown from
      { ...good, id: 'e5', points: [[0, 1]] },                      // one point
      'nonsense',
    ];
    const doc = migrateDocument({ ...v13([{ ...plain, angleCuts: [...bad, good] }]), version: 14 });
    expect((doc.boards[0] as Board).angleCuts.map((c) => c.id)).toEqual(['a1']);
  });

  it('derives a missing or unknown kind instead of dropping the cut', () => {
    const miter = { id: 'm1', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [1.75, 1.75]] };
    const doc = migrateDocument({ ...v13([{ ...plain, angleCuts: [miter, { ...good, kind: 'scarf' }] }]), version: 14 });
    expect((doc.boards[0] as Board).angleCuts.map((c) => c.kind)).toEqual(['miter', 'taper']);
  });

  it('repairs a duplicate id per board, the first keeping it (invariant 33)', () => {
    const doc = migrateDocument({ ...v13([{ ...plain, angleCuts: [good, { ...good, points: [[0, 0.5], [20, 0]] }] }]), version: 14 });
    const ids = (doc.boards[0] as Board).angleCuts.map((c) => c.id);
    expect(ids[0]).toBe('a1');
    expect(ids[1]).not.toBe('a1');
  });

  it('gives a Shape its own angle cuts', () => {
    const shaped = { id: 'b2', name: 'Leg 2', shape: 's1', position: [5, 0, 0], rotation: 0 };
    const doc = migrateDocument({
      ...v13([{ ...plain, shape: undefined }, shaped]), version: 14,
      shapes: [{ id: 's1', length: 29, width: 1.75, thickness: 1.75, posture: 'upright', grain: 'length', material: 'oak', cuts: [], angleCuts: [good] }],
    });
    // A one-user shape dissolves on load (inv 45); either way the part keeps its taper.
    const all = [...doc.boards, ...doc.shapes];
    expect(JSON.stringify(all)).toContain('"points":[[0,0.625],[24,0]]');
  });

  it('refuses a file from a newer build', () => {
    expect(() => migrateDocument({ ...v13([plain]), version: 15 })).toThrow(/newer version/);
  });
});
```

Run: `npx vitest run src/document/document.test.ts -t "schema 14"`
Expected: FAIL (`CURRENT_VERSION` is 13; `angleCuts` undefined).

- [ ] **Step 7: Implement schema 14**

In `src/document/document.ts`:

1. Imports: add `AngleCut, AngleKind` to the `import type { … } from './types'`, and
   `import { ANGLE_KINDS, deriveKind } from './angleCuts';`.
2. `export const CURRENT_VERSION = 14;` and add to the doc comment above it, in the same style as the others:
   ` * v14 added `Board.angleCuts` (angle-cuts spec §5.1): document-level, no step — an absent field defaults to [].`
3. `createBoard`: add `angleCuts: [],` after `cuts: [],`.
4. After `validateCuts`, add:

```ts
/**
 * The well-formed angle cuts out of raw data, in order (angle-cuts spec §2.3).
 * Dropped, never clamped: equal stations, a non-finite number, `along === face`,
 * an unknown dimension or side. A missing or unknown `kind` is DERIVED
 * (`deriveKind`), not dropped — the geometry is good and only the word is
 * missing. A cut that removes nothing is KEPT (unlike fu 178): keeping it loses
 * nothing and restores the cut if the part grows back. Ids are scoped to this
 * board, or this shape (invariant 33).
 */
function validateAngleCuts(raw: unknown, board: Pick<Board, Dimension>): AngleCut[] {
  if (!Array.isArray(raw)) return [];
  const out: AngleCut[] = [];
  const seen = new Set<string>();
  const finitePair = (q: unknown): q is [number, number] =>
    Array.isArray(q) && q.length === 2 && q.every((v) => typeof v === 'number' && Number.isFinite(v));
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Record<string, unknown>;
    const face = c.face as Dimension;
    const along = c.along as Dimension;
    if (!VALID_DIMENSIONS.includes(face) || !VALID_DIMENSIONS.includes(along) || face === along) continue;
    if (!VALID_FROMS.includes(c.from as CutFrom) || !VALID_FROMS.includes(c.alongFrom as CutFrom)) continue;
    const p = c.points;
    if (!Array.isArray(p) || p.length !== 2 || !finitePair(p[0]) || !finitePair(p[1])) continue;
    const points: AngleCut['points'] = [[p[0][0], p[0][1]], [p[1][0], p[1][1]]];
    if (points[0][0] === points[1][0]) continue;
    const base = { face, from: c.from as CutFrom, along, alongFrom: c.alongFrom as CutFrom, points };
    const kind = ANGLE_KINDS.includes(c.kind as AngleKind) ? (c.kind as AngleKind) : deriveKind(base, board);
    out.push({ id: takeId(c.id, seen), kind, ...base });
  }
  return out;
}
```

5. In `validateSharedFields`, change the return to:
   `return { fields: { ...fields, cuts: validateCuts(b.cuts, fields), angleCuts: validateAngleCuts(b.angleCuts, fields) } };`
6. Barrel (line ~30): add
   `export { ANGLE_CUT_FIELDS, ANGLE_CUT_KEYS, angleCutRemovesNothing, angleCutsThatRemoveStock, copyAngleCut, depthAt, keptHalfSpace, sameAngleCut, throughOf, zeroStation } from './angleCuts';`
   and `export type { V3 } from './angleCuts';`, and add `AngleCut, AngleKind` wherever `./types` types are re-exported.

In `src/document/generated.ts:206`, add `angleCuts: [],` after `cuts: [],`.

- [ ] **Step 7b: Shared like cuts — tests, then `links.ts` and `resolveBoard`**

Append to `src/document/links.test.ts`:

```ts
import type { AngleCut } from './types';

describe('angle cuts are a shared field (angle-cuts spec §5.2)', () => {
  const taper: AngleCut = { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] };
  const a = createBoard({ id: 'p', length: 29, width: 1.75, thickness: 1.75, angleCuts: [taper] });
  const b = createBoard({ id: 'q', length: 29, width: 1.75, thickness: 1.75, angleCuts: [{ ...taper }] });

  it('is classified shared', () => {
    expect(LINK_FIELDS.angleCuts).toBe('shared');
  });
  it('makes a tapered part and a plain one differ', () => {
    expect(sameShared(a, { ...b, angleCuts: [] })).toBe(false);
    expect(sameShared(a, b)).toBe(true);
    expect(sameShared(a, { ...b, angleCuts: [{ ...taper, kind: 'bevel' }] })).toBe(false);
    expect(sameShared(a, { ...b, angleCuts: [{ ...taper, id: 'other' }] })).toBe(false); // by id, like cuts
  });
  it('copies the cuts and their points in sharedOf and sharedPatch', () => {
    const s = sharedOf(a);
    expect(s.angleCuts).toEqual(a.angleCuts);
    expect(s.angleCuts[0]).not.toBe(a.angleCuts[0]);
    expect(s.angleCuts[0]!.points).not.toBe(a.angleCuts[0]!.points);
    const p = sharedPatch({ angleCuts: a.angleCuts });
    expect(p.angleCuts![0]!.points).not.toBe(a.angleCuts[0]!.points);
  });
});
```

(If `LINK_FIELDS`, `sharedOf`, `sharedPatch`, `sameShared`, `createBoard` are not already imported in that file, add
them to its import lines.)

Append to `src/document/shapes.test.ts`:

```ts
describe('resolveBoard copies angle cuts', () => {
  it('gives each user its own copy', () => {
    const shape = { id: 's1', length: 29, width: 1.75, thickness: 1.75, posture: 'upright' as const, grain: 'length' as const, material: 'oak', cuts: [],
      angleCuts: [{ id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.625], [24, 0]] as [[number, number], [number, number]] }] };
    const shapes = new Map([['s1', shape]]);
    const one = resolveBoard(shapes, { id: 'x', name: 'L1', position: [0, 0, 0], rotation: 0, shape: 's1' })!;
    const two = resolveBoard(shapes, { id: 'y', name: 'L2', position: [3, 0, 0], rotation: 0, shape: 's1' })!;
    expect(one.angleCuts).toEqual(shape.angleCuts);
    expect(one.angleCuts[0]).not.toBe(two.angleCuts[0]);
    expect(one.angleCuts[0]!.points).not.toBe(shape.angleCuts[0]!.points);
  });
});
```

Run: `npx vitest run src/document/links.test.ts src/document/shapes.test.ts -t "angle"` — Expected: FAIL.

In `src/document/links.ts`, LINK_FIELDS: add `angleCuts: 'shared',` after `cuts: 'shared',`. Then:

Implement `links.ts`:

```ts
import { copyAngleCut, sameAngleCut } from './angleCuts';
```

- `_sharedPrimitives`: `Board[Exclude<SharedField, 'cuts' | 'angleCuts'>]` and update its comment to say "every
  shared field except `cuts` and `angleCuts`".
- `sharedOf`: add `angleCuts: b.angleCuts.map(copyAngleCut),`.
- `sharedPatch`: after the cuts line add `if (patch.angleCuts) out.angleCuts = patch.angleCuts.map(copyAngleCut);`.
- `sameShared`: add a branch before the `else if`:

```ts
    } else if (k === 'angleCuts') {
      if (a.angleCuts.length !== b.angleCuts.length) return false;
      for (let i = 0; i < a.angleCuts.length; i += 1) {
        const ca = a.angleCuts[i]!;
        const cb = b.angleCuts[i]!;
        if (ca.id !== cb.id || !sameAngleCut(ca, cb)) return false;
      }
```

Update `sameShared`'s doc comment: "Cuts and angle cuts in order, by id and every geometry field (CUT_GEOMETRY /
ANGLE_CUT_FIELDS)."

`shapes.ts:31`: `shared[k] = k === 'cuts' ? s.cuts.map((c) => ({ ...c })) : k === 'angleCuts' ? s.angleCuts.map(copyAngleCut) : s[k];` (import `copyAngleCut` from `./angleCuts`).


- [ ] **Step 8: Make it compile**

Run: `npm run build`
Expected: errors of one kind only — Board/Shape object literals missing `angleCuts` (tests and fixtures: add
`angleCuts: [],` beside their `cuts:`). Repeat until `npm run build` is clean. Do NOT add
`angleCuts` to `createBoard({...})` partials — the default covers them.

- [ ] **Step 9: Run the whole suite**

Run: `npm test`
Expected: all pass (3045 existing + the new ones). If a test fails only because it snapshots a Board's keys, add
`angleCuts: []` to its expectation; any other failure is a real regression — stop and investigate.

- [ ] **Step 10: Mutate**

- Change `ANGLE_CUT_FIELDS` to drop `kind` → `tsc` fails (`satisfies`). Restore.
- In `keptHalfSpace`, use `sa` where `sf` belongs → the "max face and max end" test fails. Restore.
- In `validateAngleCuts`, drop the equal-stations `continue` → "drops malformed entries" fails. Restore.
- In `validateAngleCuts`, `continue` on an unknown kind instead of deriving → "derives a missing … kind" fails. Restore.
- Remove the `angleCuts` branch from `sameShared` → `tsc` (`_sharedPrimitives`) or "makes a tapered part and a plain one
  differ" fails — and `npm test` shows the linksToShapes/linkPlan suites going red, which is why this lives in Task 1. Restore.
- In `resolveBoard`, use `s[k]` for angleCuts → the shapes test fails. Restore.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(angle cuts): AngleCut primitive, schema 14, validation; shared like cuts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Copies carry angle cuts

**Files:**
- Modify: `src/document/treeEdit.ts:400` (`sharedSignature`), `:440` (`copyDefinition`)
- Modify: `src/document/treeOps.ts:201` and `:327`
- Modify: `src/store/store.ts:806-831` (`copyBoard`)
- Test: `src/store/store.test.ts`, `src/document/treeOps.test.ts` (append; use the existing import blocks)

**Interfaces:**
- Consumes: `copyAngleCut`, `angleCutValues` (Task 1; `sameShared`/`sharedOf`/`resolveBoard` already carry angle cuts).
- Produces: no new names; `copyBoard`, Make Unique, Ungroup and `writeBackFlat`'s regrouping now carry `angleCuts`.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/treeOps.test.ts` (Make Unique copies one level and keeps ids — inv 46): a test that Make Unique on
an instance whose definition holds a tapered part gives the new definition a part whose `angleCuts` equal the original's
(ids kept) and share no `points` array. Copy the file's nearest Make Unique test for setup.

Append to `src/store/store.test.ts` (follow the file's existing pattern for resetting the store and adding a board;
`useStore.getState()` is the store):

```ts
describe('duplicating a tapered part (angle-cuts spec §5.2)', () => {
  it('mints fresh angle-cut ids and shares no points array', () => {
    const s = useStore.getState();
    s.replaceDocument({ ...createDocument('T'), boards: [createBoard({ id: 'leg', name: 'Leg', angleCuts: [
      { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.5], [18, 0]] },
    ] })] });
    useStore.getState().setSelection?.(['leg']);
    useStore.getState().duplicateBoard('leg');
    const boards = useStore.getState().doc.boards as Board[];
    expect(boards).toHaveLength(2);
    const [src, dup] = boards;
    expect(dup!.angleCuts).toHaveLength(1);
    expect(dup!.angleCuts[0]!.id).not.toBe(src!.angleCuts[0]!.id);
    expect(dup!.angleCuts[0]!.points).toEqual(src!.angleCuts[0]!.points);
    expect(dup!.angleCuts[0]!.points).not.toBe(src!.angleCuts[0]!.points);
  });
});
```

Use whatever this file already uses to select and duplicate (read the nearest existing duplicate test and copy its
setup verbatim; the assertions above are the point).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/treeOps.test.ts src/store/store.test.ts -t "angle"`
Expected: FAIL (copies share objects; duplicate keeps ids).

- [ ] **Step 3: Implement the copies**

- `treeEdit.ts:400` (`sharedSignature`): `k === 'cuts' ? … : k === 'angleCuts' ? b.angleCuts.map(angleCutValues) : b[k]` (import `angleCutValues`). Update its doc comment: "angle cuts by ANGLE_CUT_FIELDS, not id".
- `treeEdit.ts:440` (`copyDefinition`) and `treeOps.ts:201`, `treeOps.ts:327`: wherever `cuts: X.cuts.map((c) => ({ ...c }))` appears, add `angleCuts: X.angleCuts.map(copyAngleCut)` beside it.
- `store.ts` `copyBoard`: in the `createBoard({...})` call add
  `angleCuts: source.angleCuts.map((c) => ({ ...copyAngleCut(c), id: nextId() })),` and extend the comment above
  ("`cuts` and `angleCuts` need the same treatment").

- [ ] **Step 4: Run the tests and the suite**

Run: `npx vitest run src/document/treeOps.test.ts src/store/store.test.ts` then `npm test` and `npm run build`
Expected: PASS, clean build.

- [ ] **Step 5: Mutate**

- In `copyBoard`, drop the `id: nextId()` → duplicate test fails. Restore.
- In `copyBoard`, copy without `copyAngleCut` (`...c`) → the shared-points assertion fails. Restore.
- In the Make Unique copy, drop the `angleCuts` line → the treeOps test fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(angle cuts): duplicates, Make Unique and regrouping copy angle cuts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Bodies — `pocketCells` and `boardBodies`

**Files:**
- Modify: `src/document/cuts.ts:232` (rename `boardSolids` → `pocketCells`), and every caller `tsc` reports:
  `designCheck.ts:3,244`, `diagram.ts:3,134`, `snapPoints.ts:1,140`, `cutlist.ts:3,209`, `Properties.tsx:3,522`,
  `generate/joints/recipes.ts:3,156`, `BoardMesh.tsx:5,128`, `document.ts:30` (barrel), and tests that import it.
- Create: `src/document/bodies.ts`, `src/document/bodies.test.ts`

**Interfaces:**
- Consumes: `keptHalfSpace`, `V3` (Task 1); `pocketCells` (renamed here).
- Produces: `pocketCells(board): Region[]` (was `boardSolids`, unchanged); `BODY_EPS = 1e-9`;
  `interface BodyFace { n: V3; verts: V3[]; cut?: string }` (outward unit normal, convex polygon, board-local; winding
  NOT meaningful; `cut` = the angle cut id whose plane the face lies on); `interface Body { box: Region | null; faces: BodyFace[] }`
  (`box` set exactly when no angle cut clipped the cell); `boardBodies(board): Body[]`; `bodyVolume(body): number`;
  `bodyVerts(body): V3[]` (distinct vertices).

- [ ] **Step 1: Rename**

In `cuts.ts`, rename `export function boardSolids` to `export function pocketCells` and replace its first doc
sentence with: "Stock minus RECTANGULAR cuts: a small set of axis-aligned boxes. Angle cuts are not here — they
become geometry only in `bodies.ts`'s `boardBodies` (angle-cuts spec §3.1); a caller that draws, edges, occludes or
probes stock reads bodies." Also update the internal call at the old `boardSolids` default parameters
(`openSides`, `cutShape`, `cutLabel`, `storedAsShape` — `solids: Region[] = boardSolids(board)` → `pocketCells(board)`).
Run `npm run build`; fix every reported caller by renaming the import and call (`pocketCells`), and update the barrel.
**Do not change any caller's behaviour in this step** — `BoardMesh`, `drawing`, `snapPoints` switch to bodies in
Tasks 5–8. Run `npm test`: all pass. Commit:

```bash
git add -A && git commit -m "refactor(cuts): boardSolids is pocketCells — stock minus rectangular cuts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the failing tests for bodies**

Create `src/document/bodies.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut, Board, Cut } from './types';
import { boardBodies, bodyVerts, bodyVolume } from './bodies';
import { pocketCells } from './cuts';

const taper: AngleCut = { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] };
const leg = (over: Partial<Board> = {}) => createBoard({ length: 29, width: 1.75, thickness: 1.75, ...over });
const total = (b: Board) => boardBodies(b).reduce((v, body) => v + bodyVolume(body), 0);
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe('boardBodies (angle-cuts spec §3.1)', () => {
  it('is the pocket cells, as boxes, when there are no angle cuts', () => {
    const b = leg();
    const bodies = boardBodies(b);
    expect(bodies.map((x) => x.box)).toEqual(pocketCells(b));
    expect(bodies[0]!.faces).toHaveLength(6);
    near(total(b), 29 * 1.75 * 1.75);
  });

  it('removes the taper wedge: ½ · depth · run · through', () => {
    const b = leg({ angleCuts: [taper] });
    near(total(b), 29 * 1.75 * 1.75 - 0.5 * 0.625 * 24 * 1.75);
    expect(boardBodies(b).every((x) => x.box === null)).toBe(true);
  });

  it('labels the sloped face with its cut and tilts its normal away from the from face', () => {
    const b = leg({ angleCuts: [taper] });
    const slope = boardBodies(b).flatMap((x) => x.faces).filter((f) => f.cut === 'a1');
    expect(slope.length).toBeGreaterThan(0);
    for (const f of slope) {
      expect(f.n[1]).toBeLessThan(0);       // outward points back toward the width min face
      expect(f.n[2]).toBe(0);               // straight through thickness (-0 or 0)
      expect(Math.hypot(...f.n)).toBeCloseTo(1, 12);
    }
  });

  it('keeps a mortise and a taper together', () => {
    const mortise: Cut = { id: 'c1', face: 'width', from: 'max', across: 'thickness', offset: 24, width: 3, depth: 1, stopMin: 0.5, stopMax: 0.5 };
    const b = leg({ cuts: [mortise], angleCuts: [taper] });
    near(total(b), 29 * 1.75 * 1.75 - 0.5 * 0.625 * 24 * 1.75 - 3 * 1 * 0.75);
  });

  it('leaves a cell the slope does not reach as its box', () => {
    const mortise: Cut = { id: 'c1', face: 'width', from: 'max', across: 'thickness', offset: 25, width: 3, depth: 1, stopMin: 0.5, stopMax: 0.5 };
    const b = leg({ cuts: [mortise], angleCuts: [taper] });
    // Cells wholly above station 24 are untouched by the taper.
    expect(boardBodies(b).some((x) => x.box !== null && x.box.length[0] >= 24)).toBe(true);
  });

  it('a cut that removes nothing leaves the board whole and boxed', () => {
    const b = leg({ angleCuts: [{ ...taper, points: [[30, 0], [40, 1]] }] });
    near(total(b), 29 * 1.75 * 1.75);
    expect(boardBodies(b).every((x) => x.box !== null)).toBe(true);
  });

  it('is empty when the angle cuts take everything (invariant 21 placeholder)', () => {
    const b = leg({ angleCuts: [{ ...taper, points: [[0, 5], [29, 5]] }] });
    expect(boardBodies(b)).toEqual([]);
  });

  it('a 45° miter removes a right triangle prism (spec §2.2 table)', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [
      { id: 'm', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [2.5, 2.5]] },
    ] });
    near(total(rail), 24 * 2.5 * 0.75 - 0.5 * 2.5 * 2.5 * 0.75);
    const xs = boardBodies(rail).flatMap(bodyVerts).map((p) => p[0]);
    near(Math.max(...xs), 24);
  });

  it('a chamfer removes ½ · a · b along the full length', () => {
    const b = createBoard({ length: 20, width: 3, thickness: 0.75, angleCuts: [
      { id: 'ch', kind: 'chamfer', face: 'thickness', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0.125], [0.125, 0]] },
    ] });
    near(total(b), 20 * 3 * 0.75 - 0.5 * 0.125 * 0.125 * 20);
  });
});
```

Run: `npx vitest run src/document/bodies.test.ts`
Expected: FAIL — cannot resolve `./bodies`.

- [ ] **Step 3: Write `src/document/bodies.ts`**

```ts
import type { Board, Region } from './types';
import { pocketCells } from './cuts';
import { keptHalfSpace, type V3 } from './angleCuts';

/** Inches. Below any bench precision, above float drift on part-sized numbers. */
export const BODY_EPS = 1e-9;

/** One face of a body: outward unit normal and a convex polygon, board-local. Winding is NOT meaningful —
 *  a consumer that needs it orients against `n` (BoardMesh does). `cut` names the angle cut whose plane
 *  the face lies on. */
export interface BodyFace { n: V3; verts: V3[]; cut?: string }

/**
 * A convex piece of a part's remaining stock (angle-cuts spec §3.1): one pocket
 * cell clipped by every angle cut's kept half-space. `box` is the cell itself
 * exactly when no angle cut clipped it — the signal every consumer uses to keep
 * today's box path byte-for-byte.
 */
export interface Body { box: Region | null; faces: BodyFace[] }

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };

function boxFaces(r: Region): BodyFace[] {
  const [l0, l1] = r.length;
  const [w0, w1] = r.width;
  const [t0, t1] = r.thickness;
  return [
    { n: [-1, 0, 0], verts: [[l0, w0, t0], [l0, w0, t1], [l0, w1, t1], [l0, w1, t0]] },
    { n: [1, 0, 0], verts: [[l1, w0, t0], [l1, w1, t0], [l1, w1, t1], [l1, w0, t1]] },
    { n: [0, -1, 0], verts: [[l0, w0, t0], [l1, w0, t0], [l1, w0, t1], [l0, w0, t1]] },
    { n: [0, 1, 0], verts: [[l0, w1, t0], [l0, w1, t1], [l1, w1, t1], [l1, w1, t0]] },
    { n: [0, 0, -1], verts: [[l0, w0, t0], [l0, w1, t0], [l1, w1, t0], [l1, w0, t0]] },
    { n: [0, 0, 1], verts: [[l0, w0, t1], [l1, w0, t1], [l1, w1, t1], [l0, w1, t1]] },
  ];
}

/** Points on one plane, de-duplicated and ordered around their centroid: a convex ring. */
function ring(points: V3[], n: V3): V3[] {
  const pts: V3[] = [];
  for (const p of points) if (!pts.some((q) => Math.hypot(...sub(p, q)) <= BODY_EPS)) pts.push(p);
  if (pts.length < 3) return [];
  const c: V3 = [0, 1, 2].map((i) => pts.reduce((s, p) => s + p[i]!, 0) / pts.length) as V3;
  const helper: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit(cross(n, helper));
  const w = cross(n, u);
  return pts
    .map((p) => ({ p, a: Math.atan2(dot(sub(p, c), w), dot(sub(p, c), u)) }))
    .sort((x, y) => x.a - y.a)
    .map((x) => x.p);
}

/**
 * Keep the part of a convex body on the side n·x + d >= 0 (one saw pass).
 * Returns the SAME array when nothing is removed, so the caller can tell a
 * clipped body from an untouched one. A face lying on the plane is kept as is
 * and no cap is added (the plane is already a face).
 */
function clip(faces: BodyFace[], h: { n: V3; d: number }, cut: string): BodyFace[] {
  const g = (p: V3) => dot(h.n, p) + h.d;
  const side = (p: V3) => { const v = g(p); return v > BODY_EPS ? 1 : v < -BODY_EPS ? -1 : 0; };
  if (!faces.some((f) => f.verts.some((p) => side(p) < 0))) return faces;
  const out: BodyFace[] = [];
  const cap: V3[] = [];
  let onPlane = false;
  for (const f of faces) {
    if (f.verts.every((p) => side(p) === 0)) onPlane = true;
    const kept: V3[] = [];
    for (let i = 0; i < f.verts.length; i += 1) {
      const a = f.verts[i]!;
      const b = f.verts[(i + 1) % f.verts.length]!;
      const sa = side(a);
      const sb = side(b);
      if (sa >= 0) kept.push(a);
      if (sa === 0) cap.push(a);
      if (sa * sb < 0) {
        const t = g(a) / (g(a) - g(b));
        const p: V3 = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
        kept.push(p);
        cap.push(p);
      }
    }
    if (kept.length >= 3) out.push({ ...f, verts: kept });
  }
  if (!onPlane) {
    const r = ring(cap, h.n);
    if (r.length >= 3) out.push({ n: [-h.n[0], -h.n[1], -h.n[2]], verts: r, cut });
  }
  return out;
}

/**
 * THE place angle cuts become geometry (angle-cuts spec §3.1): each pocket cell
 * clipped by every angle cut's kept half-space. With no angle cuts this is the
 * pocket cells as boxes, so a part without angle cuts costs nothing. Can return
 * `[]` (a part its cuts consumed) — BoardMesh draws invariant 21's ghost then.
 */
export function boardBodies(board: Board): Body[] {
  const cells = pocketCells(board);
  const planes = board.angleCuts.flatMap((c) => {
    const h = keptHalfSpace(board, c);
    return h ? [{ h, id: c.id }] : [];
  });
  const out: Body[] = [];
  for (const r of cells) {
    const start = boxFaces(r);
    let faces = start;
    for (const { h, id } of planes) {
      faces = clip(faces, h, id);
      if (faces.length === 0) break;
    }
    if (faces.length >= 4) out.push({ box: faces === start ? r : null, faces });
  }
  return out;
}

/** Distinct vertices of a body. */
export function bodyVerts(body: Body): V3[] {
  const out: V3[] = [];
  for (const f of body.faces) for (const p of f.verts) if (!out.some((q) => Math.hypot(...sub(p, q)) <= BODY_EPS)) out.push(p);
  return out;
}

/** Volume by the divergence theorem: ⅓ Σ (n·v₀)·area. */
export function bodyVolume(body: Body): number {
  let v = 0;
  for (const f of body.faces) {
    const p0 = f.verts[0]!;
    let area: V3 = [0, 0, 0];
    for (let i = 1; i + 1 < f.verts.length; i += 1) {
      const c = cross(sub(f.verts[i]!, p0), sub(f.verts[i + 1]!, p0));
      area = [area[0] + c[0], area[1] + c[1], area[2] + c[2]];
    }
    v += (dot(f.n, p0) * Math.abs(dot(area, f.n))) / 2;
  }
  return v / 3;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/document/bodies.test.ts` then `npm run build`
Expected: PASS, clean.

- [ ] **Step 5: Mutate**

- In `clip`, return `out` without the cap → every volume test with a slope fails (open body). Restore.
- In `boardBodies`, always set `box: r` → "labels … taper" passes but the `every(box === null)` assertion fails. Restore.
- Remove `if (!faces.some(... side(p) < 0)) return faces;` → "a cut that removes nothing leaves the board … boxed" fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(angle cuts): boardBodies — pocket cells clipped by angle cuts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mirroring and write-back

**Files:**
- Modify: `src/document/angleCuts.ts` (add `mirrorAngleCut`)
- Modify: `src/document/frames.ts:64-73` (`mirrorPart`)
- Modify: `src/document/treeEdit.ts` (`lower` line ~92-104, new `lowerAngleCuts` beside `lowerCuts`, `changedKeys`/`valueOf` lines 249-251)
- Modify: `src/document/turnFixtures.ts` (add `chiralAngled`)
- Test: `src/document/angleCuts.test.ts`, `src/document/frames.mirror.test.ts`, `src/document/treeEdit.mirror.test.ts` (append)

**Interfaces:**
- Consumes: `boardBodies`, `bodyVerts` (Task 3); `toWorld` (`snapPoints.ts`, existing); `sameAngleCut`, `copyAngleCut`.
- Produces: `mirrorAngleCut(c: AngleCut, d: Dimension): AngleCut`; `chiralAngled(posture): Board`.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/angleCuts.test.ts`:

```ts
import { mirrorAngleCut } from './angleCuts';

describe('mirrorAngleCut (spec §5.2: a flag flip, no arithmetic)', () => {
  it('flips from when the face is mirrored', () => {
    expect(mirrorAngleCut(taper, 'width')).toEqual({ ...taper, from: 'max' });
  });
  it('flips alongFrom when along is mirrored', () => {
    expect(mirrorAngleCut(taper, 'length')).toEqual({ ...taper, alongFrom: 'max' });
  });
  it('changes nothing through the third dimension, and never shares points', () => {
    const m = mirrorAngleCut(taper, 'thickness');
    expect(m).toEqual(taper);
    expect(m.points).not.toBe(taper.points);
  });
  it('is an exact involution', () => {
    for (const d of ['length', 'width', 'thickness'] as const) expect(mirrorAngleCut(mirrorAngleCut(taper, d), d)).toEqual(taper);
  });
});
```

Add to `src/document/turnFixtures.ts`:

```ts
/**
 * chiralPart plus angle cuts with a HAND (angle-cuts spec §8): a taper that
 * starts off-centre on one face and a miter at one end only. A reflection
 * anywhere in the angle-cut mapping shows up as different world vertices.
 */
export function chiralAngled(posture: Posture): Board {
  return {
    ...chiralPart(posture),
    angleCuts: [
      { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 1.25], [14, 0]] },
      { id: 'a2', kind: 'miter', face: 'length', from: 'max', along: 'thickness', alongFrom: 'min', points: [[0, 0], [1.5, 1.5]] },
    ],
  };
}
```

Append to `src/document/frames.mirror.test.ts`:

```ts
import { chiralAngled, sameSet } from './turnFixtures';
import { boardBodies, bodyVerts } from './bodies';
import { toWorld } from './snapPoints';
import { mirrorPart, placeBoard } from './frames';

const worldVerts = (b: Board) => boardBodies(b).flatMap(bodyVerts).map(([l, w, t]) => toWorld(b, { length: l, width: w, thickness: t }));

describe('a mirrored frame reflects angle cuts (inv 44, spec §5.2)', () => {
  for (const posture of ['flat', 'on-edge', 'upright'] as const) {
    for (const rotation of [0, 90, 180, 270] as const) {
      it(`${posture} at ${rotation}°: mirrorPart's vertices are the reflection across x = 0`, () => {
        const b = { ...chiralAngled(posture), rotation, position: [2, 1, -3] as [number, number, number] };
        const reflected = worldVerts(b).map(([x, y, z]) => [0 - x, y, z]);
        expect(sameSet(worldVerts(mirrorPart(b)), reflected)).toBe(true);
      });
    }
  }
  it('the fixture is chiral: an unmirrored-cut reflection would differ', () => {
    const b = chiralAngled('flat');
    const wrong = { ...mirrorPart(b), angleCuts: b.angleCuts };
    const reflected = worldVerts(b).map(([x, y, z]) => [0 - x, y, z]);
    expect(sameSet(worldVerts(wrong), reflected)).toBe(false);
  });
});
```

(Keep the file's existing imports; add only what is missing. `placeBoard` import is only needed if you add a
`placeBoard({ position:[0,0,0], rotation:0, mirrored:true }, b)` variant of the same assertion — do add it: it must
equal `mirrorPart`'s result.)

Append to `src/document/treeEdit.mirror.test.ts` (it already has `doc`, `occ`, `stored`, `CHAINS`; reuse them):

```ts
import { chiralAngled } from './turnFixtures';
import { sameAngleCut } from './angleCuts';

describe('angle cuts through a mirrored instance (Review Focus 1)', () => {
  it('an untouched edit keeps the stored angle cuts object', () => {
    const d0 = doc(chiralAngled('flat'), { mirrored: true });
    const before = occ(d0);
    const after = { ...before, name: before.name };
    const d1 = applyWorldEdits(d0, [{ before, after: { ...after, length: before.length + 1 } }]);
    expect(stored(d1).angleCuts).toBe(stored(d0).angleCuts);
  });

  it('an edit to a world taper writes back the mirror of it, and placing it again shows the edit', () => {
    const d0 = doc(chiralAngled('upright'), { mirrored: true, rotation: 90 });
    const before = occ(d0);
    const edited = before.angleCuts.map((c) => (c.id === 'a1' ? { ...c, points: [[0, 1], [10, 0]] as [[number, number], [number, number]] } : c));
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, angleCuts: edited } }]);
    const shown = occ(d1).angleCuts.find((c) => c.id === 'a1')!;
    expect(sameAngleCut(shown, edited.find((c) => c.id === 'a1')!)).toBe(true);
    // Repeated identical edits do not drift.
    const d2 = applyWorldEdits(d1, [{ before: occ(d1), after: { ...occ(d1), angleCuts: occ(d1).angleCuts.map((c) => ({ ...c })) } }]);
    expect(stored(d2).angleCuts).toEqual(stored(d1).angleCuts);
  });
});
```

Run: `npx vitest run src/document/angleCuts.test.ts src/document/frames.mirror.test.ts src/document/treeEdit.mirror.test.ts`
Expected: FAIL (`mirrorAngleCut` missing; mirrorPart leaves angle cuts unmirrored; write-back writes world cuts).

- [ ] **Step 2: Implement**

`angleCuts.ts`:

```ts
const flip = (f: CutFrom): CutFrom => (f === 'min' ? 'max' : 'min');

/**
 * One angle cut reflected along part dimension `d` (u -> size − u): stations
 * are measured from `alongFrom` and depths from `from`, so a reflection is a
 * flag flip and NO arithmetic (angle-cuts spec §5.2; invariant 44's one hand
 * reflection stays `mirrorCutAlong`, for rectangular cuts). Exact, and an
 * involution. Always a fresh object with fresh points.
 */
export function mirrorAngleCut(c: AngleCut, d: Dimension): AngleCut {
  const out = copyAngleCut(c);
  if (c.face === d) out.from = flip(c.from);
  else if (c.along === d) out.alongFrom = flip(c.alongFrom);
  return out;
}
```

`frames.ts` `mirrorPart`: add `angleCuts: b.angleCuts.map((c) => mirrorAngleCut(c, d)),` after `cuts:`; extend its
doc comment: "the cuts and angle cuts are mirrored along d0".

`treeEdit.ts`: add beside `lowerCuts`:

```ts
/**
 * The angle cuts of a part lowered back through ONE mirror (angle-cuts spec
 * §5.2). The reflection is a flag flip, exact and size-free, so unlike
 * `lowerCuts` there is no before/after frame to choose: each world cut is
 * reflected along the lowered (after) posture's d0, and one equal to the stored
 * cut with the same id maps back to THAT object. All reused: the stored array.
 */
function lowerAngleCuts(storedBefore: Board, draft: Board): AngleCut[] {
  const d0 = mirrorDim(draft);
  const byId = new Map(storedBefore.angleCuts.map((c) => [c.id, c]));
  const out = draft.angleCuts.map((c) => {
    const back = mirrorAngleCut(c, d0);
    const s = byId.get(c.id);
    return s && sameAngleCut(s, back) ? s : back;
  });
  return out.length === storedBefore.angleCuts.length && out.every((c, i) => c === storedBefore.angleCuts[i])
    ? storedBefore.angleCuts : out;
}
```

In `lower`'s mirrored branch add `angleCuts: lowerAngleCuts(lowerBefore, draft),` after `cuts:`.
In the `changedKeys` filter: `return k === 'cuts' ? cur.cuts !== resolved.cuts : k === 'angleCuts' ? cur.angleCuts !== resolved.angleCuts : rec(before)[k] !== rec(after)[k];`
In `valueOf`: add `: k === 'angleCuts' ? cur.angleCuts` before the final `: rec(after)[k]`.
Update the `applyWorldEdits` doc comment: "`cuts` and `angleCuts` by reference … `position`, `rotation`, `cuts` and
`angleCuts` go down level by level through `lower`".
Imports: `AngleCut` type; `mirrorAngleCut`, `sameAngleCut` from `./angleCuts`.

- [ ] **Step 3: Run tests, suite, build**

Run: the three files, then `npm test`, `npm run build`. Expected: PASS, clean.

- [ ] **Step 4: Mutate**

- `mirrorAngleCut`: flip `alongFrom` in the `face === d` branch too → the mirrorPart equivariance fails for some pose. Restore.
- `mirrorPart`: drop the `angleCuts` line → equivariance fails; "fixture is chiral" still passes (that is its point). Restore.
- `valueOf`: drop the `angleCuts` branch → "writes back the mirror" fails (world cut written raw). Restore.
- `lowerAngleCuts`: return `back` always → "untouched edit keeps the stored … object" fails. Restore.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(angle cuts): mirrored instances reflect angle cuts; exact write-back

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Edges (invariant 16 generalised)

**Files:**
- Modify: `src/document/cuts.ts` (rename `boardEdges` → `pocketEdges`; doc comment points to bodies.ts)
- Modify: `src/document/bodies.ts` (add `bodyEdges`, `boardEdges`)
- Modify: `src/document/document.ts` barrel (export `boardEdges` from `./bodies`, `pocketEdges` from `./cuts`)
- Modify: callers `tsc` reports (`drawing.ts:3`, `BoardMesh.tsx` via barrel) — import `boardEdges` from bodies
- Test: `src/document/bodies.test.ts` (append)

**Interfaces:**
- Produces: `pocketEdges(board): Segment[]` (old `boardEdges`, unchanged); `bodyEdges(bodies: Body[]): [V3, V3][]`;
  `boardEdges(board): Segment[]` — `pocketEdges` when `angleCuts` is empty, else `bodyEdges(boardBodies(board))`
  converted to `Point`s. **`boardEdges` is the one name every drawer uses.**

- [ ] **Step 1: Write the failing tests**

Append to `src/document/bodies.test.ts`:

```ts
import { bodyEdges, boardEdges } from './bodies';
import { pocketEdges } from './cuts';
import { chiralPart } from './turnFixtures';
import type { Segment } from './cuts';

const segKey = ([a, b]: Segment) => {
  const p = [a.length, a.width, a.thickness].map((v) => Math.round(v * 1e6));
  const q = [b.length, b.width, b.thickness].map((v) => Math.round(v * 1e6));
  return (p.join(',') < q.join(',') ? [p, q] : [q, p]).map((x) => x.join(',')).join('|');
};
const asSegments = (b: Board): Segment[] => bodyEdges(boardBodies(b)).map(([p, q]) =>
  [{ length: p[0], width: p[1], thickness: p[2] }, { length: q[0], width: q[1], thickness: q[2] }]);

describe('bodyEdges agrees with pocketEdges on every rectangular fixture (inv 16 generalised)', () => {
  const fixtures: [string, Board][] = [
    ['plain', createBoard({})],
    ['chiral', chiralPart('flat')],
    ['dado', createBoard({ cuts: [{ id: 'c', face: 'thickness', from: 'max', across: 'width', offset: 6, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 }] })],
    ['rabbet', createBoard({ cuts: [{ id: 'c', face: 'thickness', from: 'max', across: 'length', offset: 0, width: 0.5, depth: 0.375, stopMin: 0, stopMax: 0 }] })],
    ['mortise', createBoard({ cuts: [{ id: 'c', face: 'width', from: 'min', across: 'thickness', offset: 3, width: 2, depth: 1, stopMin: 0.25, stopMax: 0.25 }] })],
    ['diagonal', createBoard({ cuts: [
      { id: 'c', face: 'thickness', from: 'max', across: 'width', offset: 0, width: 12, depth: 0.375, stopMin: 0, stopMax: 0 },
      { id: 'd', face: 'thickness', from: 'min', across: 'width', offset: 12, width: 12, depth: 0.375, stopMin: 0, stopMax: 0 },
    ] })],
  ];
  for (const [name, b] of fixtures) {
    it(name, () => {
      expect(asSegments(b).map(segKey).sort()).toEqual(pocketEdges(b).map(segKey).sort());
    });
  }
});

describe('boardEdges with angle cuts', () => {
  it('a 45° miter: the removed corner draws nothing, the slope draws its outline', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [
      { id: 'm', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [2.5, 2.5]] },
    ] });
    const keys = boardEdges(rail).map(segKey);
    // The square end's edge at length 24 across the width is gone…
    expect(keys).not.toContain(segKey([{ length: 24, width: 0, thickness: 0 }, { length: 24, width: 2.5, thickness: 0 }]));
    // …and the miter's long edges run from the long point (width 0) to the short point (width 2.5).
    expect(keys).toContain(segKey([{ length: 24, width: 0, thickness: 0 }, { length: 21.5, width: 2.5, thickness: 0 }]));
    expect(keys).toContain(segKey([{ length: 24, width: 0, thickness: 0.75 }, { length: 21.5, width: 2.5, thickness: 0.75 }]));
    // A box has 12 edges; a mitered end still has 12 (two replaced by two, one end edge shorter): count them.
    expect(boardEdges(rail)).toHaveLength(12);
  });

  it('a taper crossing several pocket cells draws no seams across its slope', () => {
    const mortise: Cut = { id: 'c1', face: 'width', from: 'max', across: 'thickness', offset: 2, width: 3, depth: 1, stopMin: 0.5, stopMax: 0.5 };
    const b = leg({ cuts: [mortise], angleCuts: [taper] });
    // Every edge lying in the slope's plane must be one of its four outline edges: the two long edges, the
    // foot edge across the thickness, and the crease where the slope meets the width face at station 24.
    // The pocket grid splits at length 2 and 5 and thickness 0.5 and 1.25 cross the slope: no seam may appear.
    const onSlope = boardEdges(b).filter(([p, q]) => [p, q].every((x) => Math.abs(x.width - 0.625 * (1 - x.length / 24)) < 1e-9 && x.length <= 24));
    expect(onSlope.map(segKey).sort()).toEqual([
      segKey([{ length: 0, width: 0.625, thickness: 0 }, { length: 24, width: 0, thickness: 0 }]),
      segKey([{ length: 0, width: 0.625, thickness: 1.75 }, { length: 24, width: 0, thickness: 1.75 }]),
      segKey([{ length: 0, width: 0.625, thickness: 0 }, { length: 0, width: 0.625, thickness: 1.75 }]),
      segKey([{ length: 24, width: 0, thickness: 0 }, { length: 24, width: 0, thickness: 1.75 }]),
    ].sort());
  });
});
```

Run: `npx vitest run src/document/bodies.test.ts`
Expected: FAIL (`bodyEdges` missing).

- [ ] **Step 2: Rename and implement**

In `cuts.ts` rename `boardEdges` to `pocketEdges`; append to its doc comment: "Rectangular cuts only. With angle cuts
the rule generalises to `bodies.ts`'s `boardEdges` (angle-cuts spec §3.4); this stays as the exact path for a part
without them, and its agreement with `bodyEdges` is pinned in bodies.test.ts."

In `bodies.ts` add:

```ts
import { pocketEdges, type Point, type Segment } from './cuts';

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const near = (a: number, b: number) => Math.abs(a - b) <= BODY_EPS;

interface Wing { n: V3; w: V3 }

/**
 * The edges of a union of convex bodies (angle-cuts spec §3.4, invariant 16
 * generalised): a segment is drawn where faces of the remaining stock meet and
 * are NOT coplanar, and nowhere else.
 *
 * Candidate lines are every face polygon's edges, grouped by the line they lie
 * on and split at every endpoint and every crossing with a coplanar face's
 * boundary, so a face either contains a whole interval or none of it. At each
 * interval's midpoint, every face containing it contributes WINGS — the
 * in-plane direction from the line into the face (two for a face the line
 * crosses the interior of, one for a face it bounds). A wing pair with the
 * same direction and opposite normals is an internal wall between two bodies
 * and cancels. What is left is no edge when it is empty or one flat surface
 * continuing through (two wings, same normal, opposite directions); anything
 * else is an edge. That is boardEdges' four-cell rule restated without a grid.
 */
export function bodyEdges(bodies: Body[]): [V3, V3][] {
  const faces = bodies.flatMap((b) => b.faces);
  const centroid = (f: BodyFace): V3 => scale(f.verts.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / f.verts.length);
  const cents = faces.map(centroid);

  // 1. Lines.
  interface Line { o: V3; u: V3; ts: number[]; spans: [number, number][] }
  const lines: Line[] = [];
  for (const f of faces) {
    for (let i = 0; i < f.verts.length; i += 1) {
      const a = f.verts[i]!;
      const b = f.verts[(i + 1) % f.verts.length]!;
      const len = Math.hypot(...sub(b, a));
      if (len <= BODY_EPS) continue;
      let u = unit(sub(b, a));
      const lead = Math.abs(u[0]) > BODY_EPS ? u[0] : Math.abs(u[1]) > BODY_EPS ? u[1] : u[2];
      if (lead < 0) u = scale(u, -1);
      let line = lines.find((l) => Math.hypot(...cross(l.u, u)) <= BODY_EPS && Math.hypot(...cross(sub(a, l.o), l.u)) <= BODY_EPS);
      if (!line) { line = { o: a, u, ts: [], spans: [] }; lines.push(line); }
      const ta = dot(sub(a, line.o), line.u);
      const tb = dot(sub(b, line.o), line.u);
      line.ts.push(ta, tb);
      line.spans.push([Math.min(ta, tb), Math.max(ta, tb)]);
    }
  }

  const out: [V3, V3][] = [];
  for (const line of lines) {
    // 2. Faces whose plane holds the line, and their boundary crossings.
    const coplanar = faces.map((f, i) => ({ f, i })).filter(({ f }) =>
      Math.abs(dot(f.n, line.u)) <= BODY_EPS && Math.abs(dot(f.n, sub(line.o, f.verts[0]!))) <= BODY_EPS);
    const ts = [...line.ts];
    for (const { f } of coplanar) {
      for (let i = 0; i < f.verts.length; i += 1) {
        const a = f.verts[i]!;
        const b = f.verts[(i + 1) % f.verts.length]!;
        const e = sub(b, a);
        // Solve o + t·u = a + s·e in the face's plane (least squares via the cross product with n).
        const m = cross(f.n, e);
        const den = dot(line.u, m);
        if (Math.abs(den) <= BODY_EPS) continue; // parallel
        const t = dot(sub(a, line.o), m) / den;
        const p = add(line.o, scale(line.u, t));
        const s = dot(sub(p, a), e) / dot(e, e);
        if (s >= -BODY_EPS && s <= 1 + BODY_EPS) ts.push(t);
      }
    }
    ts.sort((x, y) => x - y);
    const cuts: number[] = [];
    for (const t of ts) if (!cuts.length || t - cuts[cuts.length - 1]! > BODY_EPS) cuts.push(t);

    // 3. Judge each interval.
    let run: number | null = null;
    const flush = (end: number) => {
      if (run !== null) out.push([add(line.o, scale(line.u, run)), add(line.o, scale(line.u, end))]);
      run = null;
    };
    for (let k = 0; k + 1 < cuts.length; k += 1) {
      const t0 = cuts[k]!;
      const t1 = cuts[k + 1]!;
      const tm = (t0 + t1) / 2;
      const covered = line.spans.some(([lo, hi]) => lo <= tm && tm <= hi);
      let drawn = false;
      if (covered) {
        const m = add(line.o, scale(line.u, tm));
        const wings: Wing[] = [];
        for (const { f, i } of coplanar) {
          const c = cents[i]!;
          let inside = true;
          let onEdge = false;
          for (let j = 0; j < f.verts.length && inside; j += 1) {
            const a = f.verts[j]!;
            const b = f.verts[(j + 1) % f.verts.length]!;
            let e = unit(cross(f.n, sub(b, a)));
            if (dot(e, sub(c, a)) < 0) e = scale(e, -1); // inward
            const dist = dot(e, sub(m, a));
            if (dist < -BODY_EPS) inside = false;
            else if (dist <= BODY_EPS) onEdge = true;
          }
          if (!inside) continue;
          const w = unit(cross(f.n, line.u));
          if (!onEdge) { wings.push({ n: f.n, w }, { n: f.n, w: scale(w, -1) }); continue; }
          wings.push({ n: f.n, w: dot(w, sub(c, m)) >= 0 ? w : scale(w, -1) });
        }
        // Cancel internal walls.
        for (let a = 0; a < wings.length; a += 1) {
          for (let b = a + 1; b < wings.length; b += 1) {
            if (dot(wings[a]!.w, wings[b]!.w) > 1 - BODY_EPS && dot(wings[a]!.n, wings[b]!.n) < -1 + BODY_EPS) {
              wings.splice(b, 1);
              wings.splice(a, 1);
              a -= 1;
              break;
            }
          }
        }
        const flat = wings.length === 2
          && dot(wings[0]!.n, wings[1]!.n) > 1 - BODY_EPS && dot(wings[0]!.w, wings[1]!.w) < -1 + BODY_EPS;
        drawn = wings.length > 0 && !flat;
      }
      if (drawn && run === null) run = t0;
      if (!drawn) flush(t0);
    }
    flush(cuts[cuts.length - 1] ?? 0);
  }
  return out;
}

const toPoint = (p: V3): Point => ({ length: p[0], width: p[1], thickness: p[2] });

/**
 * A part's edge lines (invariant 16): `pocketEdges`' exact grid rule for a part
 * without angle cuts, `bodyEdges` otherwise. The ONE name BoardMesh, the
 * drawings and the snap points read.
 */
export function boardEdges(board: Board): Segment[] {
  if (board.angleCuts.length === 0) return pocketEdges(board);
  return bodyEdges(boardBodies(board)).map(([a, b]) => [toPoint(a), toPoint(b)] as Segment);
}
```

Barrel: export `boardEdges`, `boardBodies`, `bodyEdges`, `bodyVerts`, `bodyVolume`, `BODY_EPS` and the `Body`,
`BodyFace` types from `./bodies`; export `pocketEdges` from `./cuts`. Run `npm run build` and point every former
`boardEdges` import at the barrel/`./bodies` (in `drawing.ts`: `import { boardEdges } from './bodies';`).

- [ ] **Step 3: Run tests, suite, build**

Expected: PASS. If an agreement fixture fails, the bug is in `bodyEdges`, never in the fixture or `pocketEdges` —
print both segment lists and compare.

- [ ] **Step 4: Mutate**

- Skip the wall cancellation → agreement fails (seams on every split). Restore.
- Treat `flat` as drawn → agreement fails on every multi-cell fixture. Restore.
- Drop the coplanar-boundary crossings from `ts` → the "no seams across its slope" test or an agreement fixture fails; if
  neither fails, add the diagonal fixture variant that does and keep it. Restore.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(angle cuts): edges from bodies — an edge where faces meet and are not coplanar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Snap points and the stock probe

**Files:**
- Modify: `src/document/cuts.ts` (`stockProbe` line ~267)
- Modify: `src/document/snapPoints.ts` (`boardSnapPoints` lines 117-154)
- Test: `src/document/snapPoints.test.ts` (append)

**Interfaces:**
- Consumes: `keptHalfSpace` (Task 1), `boardBodies`, `boardEdges`, `BODY_EPS` (Tasks 3, 5).
- Produces: `stockProbe` answers "touches stock" with angle cuts honoured; `boardSnapPoints` adds sloped-face corners
  (`kind: 'corner'`, owner the board).

- [ ] **Step 1: Write the failing tests**

```ts
import { boardSnapPoints } from './snapPoints';
import { createBoard } from './document';

describe('snap points on angle cuts (spec §3.6)', () => {
  const rail = () => createBoard({ length: 24, width: 2.5, thickness: 0.75, position: [0, 0, 0], angleCuts: [
    { id: 'm', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [2.5, 2.5]] },
  ] });
  const at = (b: ReturnType<typeof rail>) => boardSnapPoints(b).map((p) => p.at.map((v) => Math.round(v * 1e6) / 1e6).join(','));

  it('withholds the lattice points the miter removed', () => {
    // flat, turn 0: length on X, thickness on Y, width on Z (read axisFrame if this fixture's mapping differs).
    const pts = at(rail());
    const removedCorner = boardSnapPoints({ ...rail(), angleCuts: [] }).filter((p) => !pts.includes(p.at.map((v) => Math.round(v * 1e6) / 1e6).join(',')));
    expect(removedCorner.length).toBeGreaterThan(0);
    expect(removedCorner.every((p) => p.at[0] > 21.5 - 1e-9)).toBe(true); // only near the mitered end
  });

  it('offers the short point corners', () => {
    const pts = boardSnapPoints(rail());
    const short = pts.filter((p) => Math.abs(p.at[0] - 21.5) < 1e-9 && p.kind === 'corner');
    expect(short).toHaveLength(2); // top and bottom of the short point
    expect(pts.every((p) => p.owner.type === 'board')).toBe(true);
  });

  it('a part with no angle cuts is unchanged', () => {
    const b = createBoard({});
    expect(boardSnapPoints(b)).toHaveLength(26);
  });
});
```

Before running, confirm the flat turn-0 mapping in `geometry.ts`'s `axisFrame` and fix the "length on X" assumption in
the test if it differs (the test, not the code — but only where it misstates the existing mapping).

Run: `npx vitest run src/document/snapPoints.test.ts -t "angle cuts"`
Expected: FAIL.

- [ ] **Step 2: Implement**

`cuts.ts` `stockProbe`: after building the grid,

```ts
  // Angle cuts (angle-cuts spec §3.6): a point is stock only on every cut's kept side, closed.
  const planes = board.angleCuts.flatMap((c) => { const h = keptHalfSpace(board, c); return h ? [h] : []; });
  const kept = (p: Point) => planes.every((h) => h.n[0] * p.length + h.n[1] * p.width + h.n[2] * p.thickness + h.d >= -1e-9);
```

and return `(p) => kept(p) && (existing cell loop)`. Import `keptHalfSpace` from `./angleCuts`.

`snapPoints.ts` `boardSnapPoints`:
- Early return becomes `if (board.cuts.length === 0 && board.angleCuts.length === 0) return points;`
- The ghost check becomes `if (boardBodies(board).length === 0) return points;` (import from `./bodies`; update the
  doc comment's `boardSolids` references to `boardBodies`).
- After filtering, append the sloped corners:

```ts
  const lattice = points.filter(/* existing filter */);
  if (board.angleCuts.length === 0) return lattice;
  const planes = board.angleCuts.flatMap((c) => { const h = keptHalfSpace(board, c); return h ? [h] : []; });
  const onSlope = (p: Point) => planes.some((h) => Math.abs(h.n[0] * p.length + h.n[1] * p.width + h.n[2] * p.thickness + h.d) <= 1e-9);
  const seen = new Set(lattice.map((p) => p.at.join(',')));
  for (const [a, b] of boardEdges(board)) {
    for (const p of [a, b]) {
      if (!onSlope(p)) continue;
      const at = toWorld(board, p);
      const key = at.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      lattice.push({ kind: 'corner', at, owner });
    }
  }
  return lattice;
```

Document it: "A sloped face's corners (angle-cuts spec §3.6) are the endpoints of drawn edges lying on an angle cut's
plane — a marker on a drawn feature (invariant 16's general rule)." Note `toWorld` is defined lower in the same file
(a function declaration, so it is hoisted).

- [ ] **Step 3: Run tests, suite, build.** Expected: PASS.

- [ ] **Step 4: Mutate**

- `kept` returns true always → "withholds the lattice points" fails. Restore.
- Skip the append → "offers the short point corners" fails. Restore.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(angle cuts): snap points withhold removed stock and offer sloped corners

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Plans-sheet drawings read bodies

**Files:**
- Modify: `src/document/designCheck.ts:242-252` (extract `worldBox`)
- Modify: `src/document/drawing.ts` (`hiddenSpanPlanes`, `worldBodies`, `drawView` occluders)
- Test: `src/document/drawing.test.ts` (append)

**Interfaces:**
- Produces: `worldBox(b: Board, r: Region): Box` (designCheck — the exact `worldSolids` mapping, which now calls it);
  `interface WorldBody { box: { min: Vec3; max: Vec3 } | null; verts: Vec3[]; planes: { m: Vec3; c: number }[] }`
  (inside: `m·x + c >= 0`, `|m| = 1`); `worldBodies(b: Board): WorldBody[]`;
  `hiddenSpanPlanes(a, e, planes, toward, sMax): [number, number] | null`.

- [ ] **Step 1: Write the failing tests**

```ts
import { drawView, FRONT, hiddenSpan, hiddenSpanPlanes, worldBodies } from './drawing';
import { createBoard } from './document';

describe('drawings with angle cuts (spec §3.5)', () => {
  it('hiddenSpanPlanes over a box\'s six planes equals hiddenSpan', () => {
    const box = { min: [0, 0, 0], max: [2, 3, 4] };
    const planes = [0, 1, 2].flatMap((i) => [
      { m: [0, 1, 2].map((j) => (j === i ? 1 : 0)) as [number, number, number], c: -box.min[i]! },
      { m: [0, 1, 2].map((j) => (j === i ? -1 : 0)) as [number, number, number], c: box.max[i]! },
    ]);
    const a: [number, number, number] = [-1, 1, 5];
    const e: [number, number, number] = [3, 2, 5];
    const toward: [number, number, number] = [0, 0, 1];
    const x = hiddenSpan(a, e, box, toward, 50)!;
    const y = hiddenSpanPlanes(a, e, planes, toward, 50)!;
    expect(Math.abs(x[0] - y[0])).toBeLessThan(1e-12);
    expect(Math.abs(x[1] - y[1])).toBeLessThan(1e-12);
  });

  it('a part with no angle cuts draws exactly as before (box bodies keep the box path)', () => {
    const b = createBoard({ position: [1, 0, 2] });
    expect(worldBodies(b).every((w) => w.box !== null)).toBe(true);
  });

  it('a mitered rail seen from above shows the miter line, not the square end', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [
      { id: 'm', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [2.5, 2.5]] },
    ] });
    // Read the flat turn-0 frame (axisFrame) to name which world axes length and width map to,
    // then use the view that looks down thickness (TOP for a flat part).
    const d = drawView([rail], TOP);
    const diag = d.visible.filter((s) => Math.abs(s.a[0] - s.b[0]) > 1e-6 && Math.abs(s.a[1] - s.b[1]) > 1e-6);
    expect(diag).toHaveLength(1);               // the miter, seen as a diagonal
    expect(Math.hypot(diag[0]!.a[0] - diag[0]!.b[0], diag[0]!.a[1] - diag[0]!.b[1])).toBeCloseTo(2.5 * Math.SQRT2, 9);
  });

  it('a slope hides what is behind it only where it is', () => {
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, posture: 'upright', position: [0, 0, 0], angleCuts: [
      { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] },
    ] });
    // A small block directly behind the leg's foot, inside the leg's silhouette as seen from FRONT, within the
    // strip the taper removes (the first 5/8 of the width at the foot, from the width-min side). Place it from
    // axisFrame for an upright turn-0 part: which world axis carries width, and on which side min sits.
    const behind = createBoard({ length: 0.25, width: 0.25, thickness: 0.25, position: [0.1, 1, -3] });
    const visibleOf = (parts: Board[]) => drawView(parts, FRONT).visible.filter((s) => s.part === behind.id);
    // CONTROL: without the taper the leg hides the block completely. If this fails, the block is misplaced — fix the
    // placement, never the expectation.
    expect(visibleOf([{ ...leg, angleCuts: [] }, behind])).toHaveLength(0);
    // With the taper the block shows through where the wedge was removed.
    expect(visibleOf([leg, behind]).length).toBeGreaterThan(0);
  });
});
```

Import `TOP` too. The last two tests depend on the world mapping of the fixtures — before running, place the parts
using `axisFrame` so the assertions hold for the code as it stands; if after placing them correctly they still fail
after Step 2, the code is wrong.

Run: `npx vitest run src/document/drawing.test.ts -t "angle cuts"` — Expected: FAIL.

- [ ] **Step 2: Implement**

`designCheck.ts`:

```ts
/** One local box in world space: invariant 2's mapping, the ONE home (worldSolids and worldBodies use it). */
export function worldBox(b: Board, s: Region): Box {
  const frame = axisFrame(b);
  const spans = [0, 1, 2].map((i) => spanToWorldOffset(b, i, s[frame[i]!.dim]));
  return { name: b.name, min: spans.map(([lo], i) => b.position[i]! + lo), max: spans.map(([, hi], i) => b.position[i]! + hi) };
}
export function worldSolids(b: Board): Box[] {
  return pocketCells(b).map((s) => worldBox(b, s));
}
```

(keep `worldSolids`' doc comment; add "Boxes: rectangular cuts only — `drawing.ts`'s `worldBodies` adds angle cuts
for the drawings (spec §3.5); overlap, held and joinery stay on boxes, and joinery refuses angle cuts.")

`drawing.ts`:

```ts
import { boardBodies } from './bodies';
import { axisFrame } from './geometry';
import { worldBox, worldSolids } from './designCheck';

const DIM_INDEX = { length: 0, width: 1, thickness: 2 } as const;

/** A body in world space for the drawings (spec §3.5): its box when no angle cut clipped it (today's exact
 *  path), else its world vertices and its faces as inside-half-spaces m·x + c >= 0. */
export interface WorldBody { box: { min: Vec3; max: Vec3 } | null; verts: Vec3[]; planes: { m: Vec3; c: number }[] }

export function worldBodies(b: Board): WorldBody[] {
  const frame = axisFrame(b);
  return boardBodies(b).map((body) => {
    if (body.box) {
      const w = worldBox(b, body.box);
      return { box: { min: w.min as Vec3, max: w.max as Vec3 }, verts: [], planes: [] };
    }
    const toW = ([l, w, t]: [number, number, number]) => toWorld(b, { length: l, width: w, thickness: t });
    const verts = body.faces.flatMap((f) => f.verts.map(toW));
    const planes = body.faces.map((f) => {
      const n = [0, 1, 2].map((i) => f.n[DIM_INDEX[frame[i]!.dim]]! * (frame[i]!.reversed ? -1 : 1)) as Vec3;
      const v0 = toW(f.verts[0]!);
      return { m: [0 - n[0], 0 - n[1], 0 - n[2]] as Vec3, c: dot(n, v0) };
    });
    return { box: null, verts, planes };
  });
}

/** hiddenSpan against any convex solid given as inside half-spaces m·x + c >= 0, |m| = 1. Same clip, same grow. */
export function hiddenSpanPlanes(
  a: Vec3, e: Vec3, planes: readonly { m: readonly number[]; c: number }[], toward: Vec3, sMax: number,
): [number, number] | null {
  const d = [e[0] - a[0], e[1] - a[1], e[2] - a[2]];
  const grow = DRAW_EPS / 2;
  let poly: P2[] = [[0, DRAW_EPS], [1, DRAW_EPS], [1, sMax], [0, sMax]];
  for (const { m, c } of planes) {
    const md = dot(m, d);
    const mv = dot(m, toward);
    const ma = dot(m, a);
    for (const sigma of [0, DRAW_EPS]) {
      poly = clip(poly, md, mv, ma + sigma * mv + c + grow);
      if (poly.length === 0) return null;
    }
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const [t] of poly) { lo = Math.min(lo, t); hi = Math.max(hi, t); }
  return hi > lo ? [lo, hi] : null;
}
```

In `drawView`, replace the `solids` construction with one over `worldBodies`:

```ts
  const solids = parts.flatMap((b) => {
    const off = offsets?.get(b.id);
    return worldBodies(b).map((w) => {
      if (w.box) {
        const bx = { min: plus(w.box.min, off), max: plus(w.box.max, off) };
        const pts = corners(bx);
        const sp = pts.map(proj);
        return { bx, planes: null, rmin: [Math.min(...sp.map((p) => p[0])), Math.min(...sp.map((p) => p[1]))], rmax: [Math.max(...sp.map((p) => p[0])), Math.max(...sp.map((p) => p[1]))], depthMax: Math.max(...pts.map((p) => dot(p, view.toward))) };
      }
      const pts = w.verts.map((p) => plus(p, off));
      const planes = w.planes.map(({ m, c }) => ({ m, c: c - dot(m, off ?? [0, 0, 0]) }));
      const sp = pts.map(proj);
      return { bx: null, planes, rmin: [Math.min(...sp.map((p) => p[0])), Math.min(...sp.map((p) => p[1]))], rmax: [Math.max(...sp.map((p) => p[0])), Math.max(...sp.map((p) => p[1]))], depthMax: Math.max(...pts.map((p) => dot(p, view.toward))) };
    });
  });
```

and in the loop: `const span = s.bx ? hiddenSpan(A, E, s.bx, view.toward, sMax) : hiddenSpanPlanes(A, E, s.planes!, view.toward, sMax);`.
Drop the now-unused `worldSolids` import from drawing.ts if `tsc` says so. Update `drawView`'s doc comment: "occluders
from `worldBodies` (invariant 38 as amended by angle-cuts spec §10)".

- [ ] **Step 3: Run tests, suite (the existing drawing and plans tests must pass unchanged), build.**

- [ ] **Step 4: Mutate**

- Make `drawView` occlude with `worldSolids` boxes again (ignore bodies) → the taper occlusion test fails while its
  control still passes. Restore.
- In `worldBodies`, drop the `reversed` sign → the taper occlusion test fails in at least one pose; if it does not,
  add a turned (rotation 180) copy of that test that does. Restore.
- In `hiddenSpanPlanes`, skip the `sigma = DRAW_EPS` pass → the equality test fails. Restore.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(angle cuts): Plans-sheet drawings occlude with bodies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The 3D view renders bodies

**Files:**
- Modify: `src/viewport/grainTiling.ts` (`boardUVSignature`, add `bodyMesh`)
- Modify: `src/viewport/BoardMesh.tsx` (geometries memo, edges)
- Test: `src/viewport/grainTiling.test.ts` (append; this file already tests pure viewport code against `BoxGeometry`)

**Interfaces:**
- Consumes: `Body`, `BodyFace` (Task 3); `facePlans`, `boardUVOffset` (existing); `ANGLE_CUT_KEYS`/`angleCutValues`.
- Produces: `bodyMesh(board, body): { positions: Float32Array; uvs: Float32Array; groups: { start: number; count: number; materialIndex: number }[] }` —
  non-indexed triangles, positions relative to the board's centre (BoardMesh's group), groups in material order 0..5.

- [ ] **Step 1: Write the failing tests**

```ts
import * as THREE from 'three';
import { boardBodies } from '../document/document';
import { bodyMesh, boardUVs, boardUVSignature } from './grainTiling';

describe('bodyMesh agrees with the box path (invariant 35, spec §3.3)', () => {
  const poses = [
    createBoard({ length: 24, width: 5.5, thickness: 0.75, material: 'oak' }),
    createBoard({ length: 24, width: 5.5, thickness: 0.75, material: 'plywood', rotation: 90, posture: 'on-edge', grain: 'width' }),
    createBoard({ length: 30, width: 2, thickness: 1.5, material: 'walnut', rotation: 270, posture: 'upright' }),
  ];
  for (const b of poses) {
    it(`${b.material} ${b.posture} ${b.rotation}°`, () => {
      const body = boardBodies(b)[0]!;
      const mine = bodyMesh(b, body);
      // Every (position, uv) pair bodyMesh emits must occur in the BoxGeometry + boardUVs pairs.
      const ref = new THREE.BoxGeometry(...boardExtents(b));
      ref.setAttribute('uv', new THREE.BufferAttribute(boardUVs(b), 2));
      const key = (x: number, y: number, z: number, u: number, v: number) => [x, y, z, u, v].map((n) => Math.round(n * 1e5)).join(',');
      const want = new Set<string>();
      const p = ref.getAttribute('position');
      const uv = ref.getAttribute('uv');
      for (let i = 0; i < p.count; i += 1) want.add(key(p.getX(i), p.getY(i), p.getZ(i), uv.getX(i), uv.getY(i)));
      for (let i = 0; i < mine.positions.length / 3; i += 1) {
        expect(want.has(key(mine.positions[3 * i]!, mine.positions[3 * i + 1]!, mine.positions[3 * i + 2]!, mine.uvs[2 * i]!, mine.uvs[2 * i + 1]!))).toBe(true);
      }
    });
  }

  it('puts each axis face in its BoxGeometry material group', () => {
    const b = poses[0]!;
    const groups = bodyMesh(b, boardBodies(b)[0]!).groups;
    expect(groups.map((g) => g.materialIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(groups.every((g) => g.count === 6)).toBe(true);
  });

  it('a miter face reads as end grain, a taper face as long grain (tie to face)', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, material: 'oak', angleCuts: [
      { id: 'm', kind: 'miter', face: 'length', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0], [2.5, 2.5]] },
    ] });
    const body = boardBodies(rail)[0]!;
    const slopeIndex = body.faces.findIndex((f) => f.cut === 'm');
    const mesh = bodyMesh(rail, { ...body, faces: [body.faces[slopeIndex]!] });
    // Flat turn 0: length on world X (check axisFrame) — the miter's material is the +X face's.
    expect(mesh.groups.map((g) => g.materialIndex)).toEqual([0]);
  });

  it('the UV signature changes with an angle cut', () => {
    const b = poses[0]!;
    expect(boardUVSignature({ ...b, angleCuts: [{ id: 'a', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 1], [10, 0]] }] }))
      .not.toBe(boardUVSignature(b));
  });
});
```

(Import `boardExtents` and `createBoard` if the file does not already. `bodyMesh` is called here on a BOX body on
purpose: BoardMesh never does, but agreement on a box is what proves the custom path computes the same UVs as the
`FACE_AXES` table — invariant 35.)

Run: `npx vitest run src/viewport/grainTiling.test.ts` — Expected: FAIL (`bodyMesh` missing).

- [ ] **Step 2: Implement `bodyMesh` and the signature**

`boardUVSignature`: append to the array `board.angleCuts.map((c) => angleCutValues(c).join(',')).join(';'),` with the
comment "Angle cuts change which bodies exist and which faces are sloped (angle-cuts spec §3.2; invariant 15)."

```ts
import type { Body } from '../document/document';
import { angleCutValues, boardExtents, toWorldOffset } from '../document/document';

/**
 * Triangles for one CLIPPED body (angle-cuts spec §3.3): positions relative
 * to the board's centre, UVs from the SAME face plans as boardUVs (invariant
 * 17: board-relative, FIT against the board), grouped by BoxGeometry's
 * material order so the six grain materials apply unchanged.
 *
 * An axis-aligned face takes its own material and plan. A sloped face takes
 * the plan of the world axis its normal is closest to; a tie goes to the axis
 * carrying the cut's `face` dimension, so a 45° miter reads as end grain and a
 * taper as long grain. UVs are read straight off each vertex's world offset
 * along the plan's axes — which is what boardUVs' CORNERS-and-sign dance
 * computes for a box, so the two agree (pinned by test).
 */
export function bodyMesh(board: Board, body: Body): { positions: Float32Array; uvs: Float32Array; groups: { start: number; count: number; materialIndex: number }[] } {
  const plans = facePlans(board);
  const frame = axisFrame(board);
  const extents = boardExtents(board);
  const [ou, ov] = boardUVOffset(board.id);
  const dimIndex = (d: Dimension) => DIMENSION_ORDER.indexOf(d);
  const offsetOf = (p: [number, number, number]) => [0, 1, 2].map((i) => toWorldOffset(board, i, p[dimIndex(frame[i]!.dim)]!)) as [number, number, number];
  const byMaterial: { pos: number[]; uv: number[] }[] = Array.from({ length: 6 }, () => ({ pos: [], uv: [] }));
  for (const f of body.faces) {
    const n = [0, 1, 2].map((i) => f.n[dimIndex(frame[i]!.dim)]! * (frame[i]!.reversed ? -1 : 1));
    let axis = 0;
    for (let i = 1; i < 3; i += 1) if (Math.abs(n[i]!) > Math.abs(n[axis]!) + 1e-9) axis = i;
    const cut = f.cut ? board.angleCuts.find((c) => c.id === f.cut) : undefined;
    if (cut) {
      const pref = frame.findIndex((a) => a.dim === cut.face);
      if (Math.abs(Math.abs(n[pref]!) - Math.abs(n[axis]!)) <= 1e-9) axis = pref;
    }
    const material = axis * 2 + (n[axis]! > 0 ? 0 : 1);
    const plan = plans[material]!;
    const pts = f.verts.map(offsetOf);
    const out = byMaterial[material]!;
    for (let i = 1; i + 1 < pts.length; i += 1) {
      let tri = [pts[0]!, pts[i]!, pts[i + 1]!];
      const e1 = [0, 1, 2].map((k) => tri[1]![k]! - tri[0]![k]!);
      const e2 = [0, 1, 2].map((k) => tri[2]![k]! - tri[0]![k]!);
      const cr = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      if (cr[0]! * n[0]! + cr[1]! * n[1]! + cr[2]! * n[2]! < 0) tri = [tri[0]!, tri[2]!, tri[1]!];
      for (const p of tri) {
        out.pos.push(p[0] - extents[0] / 2, p[1] - extents[1] / 2, p[2] - extents[2] / 2);
        out.uv.push(
          p[plan.axes[0]]! / plan.tileInches[0] + (plan.fit[0] ? 0 : ou),
          p[plan.axes[1]]! / plan.tileInches[1] + (plan.fit[1] ? 0 : ov),
        );
      }
    }
  }
  const positions: number[] = [];
  const uvs: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  byMaterial.forEach((m, materialIndex) => {
    if (m.pos.length === 0) return;
    groups.push({ start: positions.length / 3, count: m.pos.length / 3, materialIndex });
    positions.push(...m.pos);
    uvs.push(...m.uv);
  });
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs), groups };
}
```

- [ ] **Step 3: BoardMesh**

In the `geometries` memo replace `boardSolids(board)` (now `pocketCells`) with `boardBodies(board)`:

```ts
    const bodies = boardBodies(board);
    if (bodies.length === 0) { /* unchanged placeholder */ }
    return {
      placeholder: false,
      items: bodies.map((body) => {
        if (body.box) {
          // Today's path, byte-for-byte (angle-cuts spec §3.3).
          const { center, size } = solidWorldBox(board, body.box);
          const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
          geo.setAttribute('uv', new THREE.BufferAttribute(boardUVs(board, body.box), 2));
          return { geo, center };
        }
        const m = bodyMesh(board, body);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
        for (const g of m.groups) geo.addGroup(g.start, g.count, g.materialIndex);
        geo.computeVertexNormals();
        return { geo, center: [0, 0, 0] as [number, number, number] };
      }),
    };
```

The memo's dependency list stays `[extents…, boardUVSignature(board)]` — the signature now covers angle cuts.
`edges` keeps calling `boardEdges(board)` (now the dispatch from `bodies.ts`, imported through the barrel). Update the
memo's comment: "`boardBodies` can legitimately return `[]`…" (the old `boardSolids` wording).

- [ ] **Step 4: Run tests, suite, build.** Expected: PASS. (No browser yet — Task 13 checks the viewport.)

- [ ] **Step 5: Mutate**

- In `bodyMesh`, apply `plan.fit` inverted → the agreement test fails. Restore.
- Remove the tie-break → the miter end-grain test fails. Restore.
- Remove angleCuts from `boardUVSignature` → its test fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(angle cuts): the 3D view renders clipped bodies; grain on sloped faces

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Bench text and cut-list rows

**Files:**
- Create: `src/document/angleText.ts`, `src/document/angleText.test.ts`
- Modify: `src/document/cutlist.ts` (`rowKey` line ~240, `setupLines` line ~203)
- Test: `src/document/cutlist.test.ts` (append)

**Interfaces:**
- Produces: `angleDegrees(c): number`; `angleLine(board, c, precision): string`; `shortPointLine(board, precision): string | null`.

- [ ] **Step 1: Write the failing tests**

`src/document/angleText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import type { AngleCut } from './types';
import { angleDegrees, angleLine, shortPointLine } from './angleText';

const taper: AngleCut = { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] };
const miter = (from: 'min' | 'max', run = 2.5): AngleCut => ({ id: `m${from}`, kind: 'miter', face: 'length', from, along: 'width', alongFrom: 'min', points: [[0, 0], [run, run]] });

describe('angle text (spec §4.2)', () => {
  it('prints a taper in the existing vocabulary', () => {
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [taper] });
    expect(angleLine(leg, taper, 16)).toBe('Taper 5/8" off the width face (min side), from 24" from the length min end to that end');
  });
  it('falls back to both end depths when the line does not reach zero inside the part', () => {
    const c: AngleCut = { ...taper, points: [[0, 0.5], [58, 0]] };
    const leg = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [c] });
    expect(angleLine(leg, c, 16)).toBe('Taper off the width face (min side): 1/2" at the length min end, 1/4" at the length max end');
  });
  it('prints a miter to 0.1°', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [miter('max')] });
    expect(angleLine(rail, miter('max'), 16)).toBe('Miter 45.0° across the width at the length max end');
    expect(angleDegrees({ ...miter('max'), points: [[0, 0], [2.5, 2.5 * Math.tan(Math.PI / 8)]] })).toBeCloseTo(22.5, 9);
  });
  it('prints the short point once, both ends subtracted', () => {
    const rail = createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [miter('max'), miter('min')] });
    expect(shortPointLine(rail, 16)).toBe('Short point 19"');
    expect(shortPointLine(createBoard({ length: 24, width: 2.5, thickness: 0.75, angleCuts: [taper] }), 16)).toBeNull();
  });
  it('prints bevels and chamfers', () => {
    const b = createBoard({ length: 20, width: 3, thickness: 0.75 });
    const bevel: AngleCut = { id: 'b', kind: 'bevel', face: 'width', from: 'max', along: 'thickness', alongFrom: 'min', points: [[0, 0], [0.75, 0.75 * Math.tan(15 * Math.PI / 180)]] };
    const chamfer: AngleCut = { id: 'c', kind: 'chamfer', face: 'thickness', from: 'max', along: 'width', alongFrom: 'min', points: [[0, 0.125], [0.125, 0]] };
    expect(angleLine(b, bevel, 16)).toBe('Bevel 15.0° off the width face (max side), across the thickness');
    expect(angleLine(b, chamfer, 16)).toBe('Chamfer 1/8" × 1/8" off the thickness face (max side), at the width min edge');
  });
});
```

Check `formatLength`'s actual output for these values first (e.g. `formatLength(24, 16)`); if it prints `24"` keep the
expectations, if it prints another form, use that form — the test pins this module's assembly, not formatLength's.

Append to `src/document/cutlist.test.ts`:

```ts
describe('angle cuts on the cut list (spec §4)', () => {
  const taper = { id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.625], [24, 0]] as [[number, number], [number, number]] };
  const legs = (extra: Partial<Board>[]) => ({ ...createDocument('T'), boards: extra.map((x, i) => createBoard({ id: `l${i}`, name: `Leg ${i}`, length: 29, width: 1.75, thickness: 1.75, material: 'oak', ...x })) });

  it('a tapered leg and a straight one are two rows', () => {
    expect(buildCutList(legs([{ angleCuts: [taper] }, {}]) as FlatDocument).groups[0]!.rows).toHaveLength(2);
  });
  it('two identical tapers are one row, whatever their ids', () => {
    const rows = buildCutList(legs([{ angleCuts: [taper] }, { angleCuts: [{ ...taper, id: 'zz' }] }]) as FlatDocument).groups[0]!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.setup).toContain('Taper 5/8" off the width face (min side), from 24" from the length min end to that end');
  });
  it('a taper that removes nothing neither prints nor splits the row (Review Focus 3)', () => {
    const none = { ...taper, points: [[40, 0], [50, 1]] as [[number, number], [number, number]] };
    const rows = buildCutList(legs([{ angleCuts: [none] }, {}]) as FlatDocument).groups[0]!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.setup).toEqual([]);
  });
  it('a mortised, tapered leg prints both, the angle after the pocket', () => {
    const mortise = { id: 'c1', face: 'width' as const, from: 'max' as const, across: 'thickness' as const, offset: 24, width: 3, depth: 1, stopMin: 0.5, stopMax: 0.5 };
    const setup = buildCutList(legs([{ cuts: [mortise], angleCuts: [taper] }]) as FlatDocument).groups[0]!.rows[0]!.setup;
    expect(setup).toHaveLength(2);
    expect(setup[1]).toMatch(/^Taper /);
  });
  it('stock is unchanged by an angle cut (inv 18)', () => {
    const a = buildCutList(legs([{ angleCuts: [taper] }]) as FlatDocument).groups[0]!.stockInches;
    const b = buildCutList(legs([{}]) as FlatDocument).groups[0]!.stockInches;
    expect(a).toBe(b);
  });
});
```

Run both — Expected: FAIL.

- [ ] **Step 2: Implement `angleText.ts`**

```ts
import type { AngleCut, Board } from './types';
import { angleCutsThatRemoveStock, depthAt, zeroStation } from './angleCuts';
import { formatLength } from '../units/length';

/** The cut's angle from square, degrees: atan(Δdepth / Δstation). A 45° miter stores depth = run (spec §2.3). */
export function angleDegrees(c: Pick<AngleCut, 'points'>): number {
  const [[s1, q1], [s2, q2]] = c.points;
  return (Math.atan(Math.abs(q2 - q1) / Math.abs(s2 - s1)) * 180) / Math.PI;
}

const other = (f: 'min' | 'max') => (f === 'min' ? 'max' : 'min');

/**
 * One angle cut as a bench line (angle-cuts spec §4.2), worded from its `kind`
 * in the cut list's existing vocabulary. THE ONE home of these strings: the cut
 * list and the part diagrams both print what this returns (invariant 19). The
 * degree sign is HTML text, never a measured SVG label.
 */
export function angleLine(board: Board, c: AngleCut, precision: number): string {
  const f = (n: number) => formatLength(n, precision);
  const deg = `${angleDegrees(c).toFixed(1)}°`;
  const side = `the ${c.face} face (${c.from} side)`;
  const A = board[c.along];
  const z = zeroStation(c);
  const near = depthAt(c, 0);
  switch (c.kind) {
    case 'taper':
      if (near > 0 && Number.isFinite(z) && z > 0 && z <= A) {
        return `Taper ${f(near)} off ${side}, from ${f(z)} from the ${c.along} ${c.alongFrom} end to that end`;
      }
      return `Taper off ${side}: ${f(Math.max(0, near))} at the ${c.along} ${c.alongFrom} end, ${f(Math.max(0, depthAt(c, A)))} at the ${c.along} ${other(c.alongFrom)} end`;
    case 'miter':
      return `Miter ${deg} across the ${c.along} at the ${c.face} ${c.from} end`;
    case 'bevel':
      return `Bevel ${deg} off ${side}, across the ${c.along}`;
    case 'chamfer':
      if (near > 0 && Number.isFinite(z) && z > 0) return `Chamfer ${f(near)} × ${f(z)} off ${side}, at the ${c.along} ${c.alongFrom} edge`;
      return `Chamfer ${deg} off ${side}, across the ${c.along}`;
  }
}

/**
 * The short point of a part mitered at one or both ends (spec §4.2): the stock
 * length less the greatest depth, within the part, of each end miter. Null
 * when the part has no miter that removes stock.
 */
export function shortPointLine(board: Board, precision: number): string | null {
  const miters = angleCutsThatRemoveStock(board).filter((c) => c.kind === 'miter' && c.face === 'length');
  if (miters.length === 0) return null;
  const deepest = (end: 'min' | 'max') => Math.max(0, ...miters.filter((c) => c.from === end).map((c) =>
    Math.min(board.length, Math.max(depthAt(c, 0), depthAt(c, board[c.along])))));
  return `Short point ${formatLength(Math.max(0, board.length - deepest('min') - deepest('max')), precision)}`;
}
```

- [ ] **Step 3: Implement the cut list**

`cutlist.ts`:

```ts
import { angleCutValues, angleCutsThatRemoveStock } from './angleCuts';
import { angleLine, shortPointLine } from './angleText';

/** The angle-cut half of a row's identity: EXACT and order-independent, like cutSignature, `kind` included (spec §4.2). */
function angleSignature(board: Board): string {
  return angleCutsThatRemoveStock(board).map((c) => angleCutValues(c).join(':')).sort().join(';');
}
```

In `rowKey`'s array, after `cutSignature(...)`, add `angleSignature(board),` with the comment "An angle cut that
removes nothing must not split a row either (spec §2.3)."

In `setupLines`, after the pocket loop:

```ts
  for (const c of angleCutsThatRemoveStock(board)) lines.push(angleLine(board, c, precision));
  const short = shortPointLine(board, precision);
  if (short) lines.push(short);
```

Update `CutListRow.setup`'s doc: "One line per cut and per angle cut, then the short point when mitered."

- [ ] **Step 4: Run tests, suite, build.** Expected: PASS.

- [ ] **Step 5: Mutate**

- Drop `angleSignature` from `rowKey` → "a tapered leg and a straight one are two rows" fails. Restore.
- Use `board.angleCuts` instead of `angleCutsThatRemoveStock` in `angleSignature` → the Review Focus 3 test fails. Restore.
- Subtract only the max end in `shortPointLine` → "both ends subtracted" fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(angle cuts): bench lines, short point, exact cut-list grouping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Part diagrams

**Files:**
- Modify: `src/document/diagram.ts` (`DiagramAngle`, `DiagramView.angles`, `buildDiagrams`)
- Modify: `src/panels/PartDiagram.tsx` (polygons after the cells; notes under the figure)
- Modify: `src/styles.css` (`.cutlist-diagram-angle`, `.cutlist-diagram-angle-note` beside `.cutlist-diagram-cell` /
  `.cutlist-diagram-crossings`, roles only — invariant/`styles.css` rule)
- Test: `src/document/diagram.test.ts`, `src/panels/PartDiagram.test.tsx` (append; mirror the existing render tests)

**Interfaces:**
- Produces: `interface DiagramAngle { id: string; poly: [number, number][]; label: string }` (poly in the view's
  (h, v) board inches, v from the min end — the vUp flip is the panel's, as for cuts); `DiagramView.angles: DiagramAngle[]`.

- [ ] **Step 1: Write the failing tests**

`diagram.test.ts`:

```ts
describe('angle cuts in part diagrams (spec §4.3)', () => {
  const taper = { id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.625], [24, 0]] as [[number, number], [number, number]] };
  const leg = () => createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [taper] });

  it('draws the wedge in the view looking along the through dimension', () => {
    const views = buildDiagrams(leg(), 16);
    const v = views.find((x) => x.face === 'thickness' && x.from === 'min')!;
    expect(v.angles).toHaveLength(1);
    // h = length, v = width (DIMENSION_ORDER): a triangle (0,0) (0,0.625) (24,0).
    const pts = v.angles[0]!.poly.map(([h, w]) => `${Math.round(h * 1e9) / 1e9},${Math.round(w * 1e9) / 1e9}`).sort();
    expect(pts).toEqual(['0,0', '0,0.625', '24,0'].sort());
    expect(v.angles[0]!.label).toMatch(/^Taper 5\/8"/);
  });
  it('a cut-free board has no angles and still one view', () => {
    const views = buildDiagrams(createBoard({}), 16);
    expect(views).toHaveLength(1);
    expect(views[0]!.angles).toEqual([]);
  });
  it('an angle cut that removes nothing is not drawn', () => {
    const b = createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [{ ...taper, points: [[40, 0], [50, 1]] }] });
    expect(buildDiagrams(b, 16).flatMap((v) => v.angles)).toEqual([]);
  });
});
```

`PartDiagram.test.tsx` (follow the file's existing render helper):

```tsx
it('draws an angle cut as a hatched polygon and prints its line', () => {
  const view = buildDiagrams(createBoard({ length: 29, width: 1.75, thickness: 1.75, angleCuts: [
    { id: 'a1', kind: 'taper', face: 'width', from: 'min', along: 'length', alongFrom: 'min', points: [[0, 0.625], [24, 0]] },
  ] }), 16)[0]!;
  const { container, getByText } = render(<PartDiagram view={view} />);
  const poly = container.querySelector('polygon.cutlist-diagram-angle')!;
  expect(poly.getAttribute('fill')).toMatch(/^url\(#hatch[a-zA-Z0-9]+\)$/);
  expect(poly.getAttribute('points')!.split(' ')).toHaveLength(3);
  expect(getByText(/^Taper 5\/8"/)).toBeInTheDocument();
});
```

Run both — Expected: FAIL.

- [ ] **Step 2: Implement `diagram.ts`**

```ts
import { angleCutsThatRemoveStock, keptHalfSpace, throughOf } from './angleCuts';
import { angleLine } from './angleText';

/** One angle cut in a view (spec §4.3): the wedge it removes, in (h, v) board inches, and its bench line. */
export interface DiagramAngle { id: string; poly: [number, number][]; label: string }
```

Add `angles: DiagramAngle[]` to `DiagramView` (doc: "Angle cuts seen edge-on as a line: drawn in the view looking along
their through dimension, min side. Empty for most views.") and `angles: []` in `ensure`. Before the cut-free fallback:

```ts
  for (const c of angleCutsThatRemoveStock(board)) {
    const h = keptHalfSpace(board, c);
    if (!h) continue;
    const view = ensure(throughOf(c), 'min');
    const hi = DIMENSION_ORDER.indexOf(view.horizontal);
    const vi = DIMENSION_ORDER.indexOf(view.vertical);
    // The view's rectangle, clipped to the REMOVED side (n·x + d < 0): Sutherland–Hodgman, one edge.
    const rect: [number, number][] = [[0, 0], [view.h, 0], [view.h, view.v], [0, view.v]];
    const g = ([x, y]: [number, number]) => -(h.n[hi]! * x + h.n[vi]! * y + h.d);
    const poly: [number, number][] = [];
    for (let i = 0; i < rect.length; i += 1) {
      const p = rect[i]!;
      const q = rect[(i + 1) % rect.length]!;
      if (g(p) >= 0) poly.push(p);
      if ((g(p) >= 0) !== (g(q) >= 0)) {
        const t = g(p) / (g(p) - g(q));
        poly.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    if (poly.length >= 3) view.angles.push({ id: c.id, poly, label: angleLine(board, c, precision) });
  }
```

(The through coordinate drops out: `n[through]` is 0 by construction.)

- [ ] **Step 3: Implement `PartDiagram.tsx`**

After the `view.cells.map(...)` block:

```tsx
        {view.angles.map((a) => (
          <polygon
            key={a.id}
            className="cutlist-diagram-angle"
            points={a.poly.map(([h, v]) => {
              const x = left + fit.offsetX + h * fit.sx;
              const y = top + (view.vUp ? view.v - v : v) * fit.sy;
              return `${x},${y}`;
            }).join(' ')}
            fill={`url(#${hatch})`}
          />
        ))}
```

After the crossings `<p>`s:

```tsx
      {view.angles.map((a) => (
        <p className="cutlist-diagram-angle-note" key={a.id}>{a.label}</p>
      ))}
```

`styles.css`: `.cutlist-diagram-angle { stroke: var(--ink); stroke-width: 1; }` and give
`.cutlist-diagram-angle-note` the same rule set as `.cutlist-diagram-crossings` (copy its declarations, including the
print-media block at line ~1296 where `.cutlist-diagram-crossings` is listed — add the new class to that selector list).
Read the existing `.cutlist-diagram-cell` rule first and match its role variables.

- [ ] **Step 4: Run tests, suite, build.** Expected: PASS.

- [ ] **Step 5: Mutate**

- Clip to the KEPT side (drop the leading minus in `g`) → the triangle test fails (pentagon). Restore.
- Remove the `angleCutsThatRemoveStock` filter → "removes nothing is not drawn" fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(angle cuts): part diagrams draw the wedge and its bench line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Joinery, Refine and Repair joints stay away

**Files:**
- Create: `src/document/angledRefusal.ts`, `src/document/angledRefusal.test.ts`
- Modify: `src/document/refineDesign.ts:15,50` (reason `'angled'`), `src/generate/refine.ts:48-60` (`plainForRefine`)
- Modify: `src/generate/run.ts:317-328` (`runJoinery`), `:251-252` (`runRefine`'s use)
- Modify: `src/useJoinery.ts:45-46`
- Modify: `src/generate/joints/repair.ts:97-110` (`repairDocument`)
- Modify: `src/panels/JoineryDialog.tsx` (prop `refusal`), `src/App.tsx:85-91, 1054-1059`
- Test: `src/generate/run.test.ts`, `src/generate/refine.test.ts`, `src/generate/joints/repair.test.ts`, `src/panels/JoineryDialog.test.tsx` (append; use their existing fakes/LlmClient doubles)

**Interfaces:**
- Produces: `angledParts(doc: SloydDocument): string[]` (flat display names of parts with any angle cut, document
  order); `angledRefusal(doc, action: 'joinery' | 'refine'): string | null`; `runJoinery` may return `{ refused: string }`;
  `RefusalReason` gains `'angled'`; `JoineryDialog` prop `refusal: string | null`.

**Spec reading (record in the commit message):** spec §6 says Repair joints refuses. Repair is reachable only through
the notice that `repairDocument` returning non-null shows inside the Refine/Joinery dialogs, and both of those already
refuse an angled document; a refusal from `repairDocument` would print a second, duplicate message. So `repairDocument`
returns `null` (nothing offered) for an angled document — the refusal is "not offered". `useRepair`'s direct call then
says "Nothing to repair." which is true.

- [ ] **Step 1: Write the failing tests**

`src/document/angledRefusal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard, createDocument } from './document';
import { angledParts, angledRefusal } from './angledRefusal';

const taper = { id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.5], [20, 0]] as [[number, number], [number, number]] };

describe('angledRefusal (spec §6)', () => {
  const doc = (n: number) => ({ ...createDocument('T'), boards: [
    createBoard({ id: 'apron', name: 'Apron' }),
    ...Array.from({ length: n }, (_, i) => createBoard({ id: `l${i}`, name: `Leg ${i + 1}`, angleCuts: [taper] })),
  ] });
  it('is null without angle cuts', () => {
    expect(angledRefusal(doc(0), 'joinery')).toBeNull();
  });
  it('names the angled parts, three at most', () => {
    expect(angledParts(doc(4))).toEqual(['Leg 1', 'Leg 2', 'Leg 3', 'Leg 4']);
    expect(angledRefusal(doc(4), 'joinery')).toBe("Add joinery doesn't handle angled parts yet (Leg 1, Leg 2, Leg 3…). Add joinery before tapering, or remove the angles first.");
    expect(angledRefusal(doc(1), 'refine')).toBe("Refine doesn't handle angled parts yet (Leg 1). Refine before tapering, or remove the angles first.");
  });
});
```

In `run.test.ts` (reuse the file's fake client that counts calls):

```ts
it('runJoinery refuses an angled document before any call (spec §6)', async () => {
  const client = /* the file's counting fake */;
  const doc = { ...createDocument('T'), boards: [createBoard({ name: 'Leg', angleCuts: [/* taper as above */] }), createBoard({ name: 'Apron', position: [1.75, 20, 0] })] };
  const out = await runJoinery(client, doc, new AbortController().signal, () => {});
  expect('refused' in out).toBe(true);
  expect(/* the fake's call count */).toBe(0);
});
```

In `refine.test.ts`: `plainForRefine` of an angled document returns `{ refused: { reason: 'angled', … } }`; and
`documentToDesign` of an angled plain document refuses with reason `'angled'`.
In `repair.test.ts`: `repairDocument(angledDoc)` is `null`.
In `JoineryDialog.test.tsx`: with `refusal="…"` the text shows, the site list does not, and the Add joinery button is
disabled (copy the existing `noSites` test and change the prop).

Run them — Expected: FAIL.

- [ ] **Step 2: Implement**

`src/document/angledRefusal.ts`:

```ts
import type { SloydDocument } from './types';
import { flatDocument } from './tree';

/** Flat display names of every placed part carrying an angle cut, in document order. */
export function angledParts(doc: SloydDocument): string[] {
  return flatDocument(doc).boards.filter((b) => b.angleCuts.length > 0).map((b) => b.name);
}

const WHAT = { joinery: 'Add joinery', refine: 'Refine' } as const;

/**
 * Why Add joinery or Refine will not run on this document, or null (angle-cuts
 * spec §6). Their checks and joints are box-based throughout (invariants 38,
 * 41): a mitered frame's stock boxes overlap at its corners, so a run would
 * report a false overlap or cut into air. Decided before any mutation or call.
 */
export function angledRefusal(doc: SloydDocument, action: 'joinery' | 'refine'): string | null {
  const names = angledParts(doc);
  if (names.length === 0) return null;
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')}…` : names.join(', ');
  return `${WHAT[action]} doesn't handle angled parts yet (${shown}). ${WHAT[action]} before tapering, or remove the angles first.`;
}
```

Export both from the barrel.

- `refineDesign.ts`: `RefusalReason` gains `'angled'`; in `documentToDesign` after the cuts check:
  `if (stored.some((b) => (resolveBoard(shapes, b)?.angleCuts.length ?? 0) > 0)) return refuse('angled', angledRefusal(doc, 'refine') ?? 'Refine doesn\'t handle angled parts yet.');`
  (if `stored` covers only some containers, use `angledParts(doc).length > 0` as the test instead — read the function).
- `refine.ts` `plainForRefine`: first line inside `try`:
  `const angled = angledRefusal(doc, 'refine'); if (angled) return { refused: { reason: 'angled', message: angled } };`
- `run.ts` `runJoinery`: return type `Promise<JoineryOutcome | { noSites: true } | { refused: string }>`; first line:
  `const angled = angledRefusal(doc, 'joinery'); if (angled) return { refused: angled };`. In `runRefine` after
  `const jo = await runJoinery(...)`: `if ('refused' in jo) throw new Error(jo.refused); // unreachable: a refined design has no angle cuts`.
- `useJoinery.ts`: after the `noSites` line, `if ('refused' in out) { setRun({ status: 'failed', error: out.refused, costUsd: null }); return; }`.
- `repair.ts` `repairDocument`: first line inside `try`: `if (angledParts(doc).length > 0) return null; // not offered: angle-cuts spec §6 (see plan Task 11)`.
- `JoineryDialog.tsx`: add `/** Why Add joinery will not run (angle-cuts spec §6), or null. */ refusal: string | null;`
  to Props; `const blocked = p.refusal !== null;` `const canRun = !blocked && !noSites && !p.live && p.libraryAvailable;`
  render `{blocked ? <p className="field-error" role="status">{p.refusal}</p> : noSites ? … : …}` and hide the
  model/estimate line when `blocked`.
- `App.tsx`: `const joineryRefusal = useMemo(() => (dialog === 'joinery' ? angledRefusal(doc, 'joinery') : null), [dialog, doc]);`
  and pass `refusal={joineryRefusal}`; pass `estimate={llmSettings && !joineryRefusal ? … : null}`.

- [ ] **Step 3: Run tests, suite, build.** Expected: PASS.

- [ ] **Step 4: Mutate**

- Move `runJoinery`'s refusal below `findSites`/`checkDesign` → still passes call count? It must still refuse before the
  client call; move it below the first client call instead → the call-count test fails. Restore.
- Remove the `plainForRefine` check → the refine test fails (documentToDesign's defence may still catch it — confirm the
  test asserts `plainForRefine` directly). Restore.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(angle cuts): joinery and refine refuse angled documents; repair is not offered

Spec §6 reading: Repair joints is reachable only through the notice the
Refine/Joinery dialogs show, both of which refuse an angled document first,
so repairDocument offers nothing rather than printing a duplicate refusal.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Store actions, taper fields, the Angles section

**Files:**
- Modify: `src/document/angleCuts.ts` (`TaperFields`, `taperCut`, `taperFields`, `defaultTaper`)
- Modify: `src/store/store.ts` (interface ~line 346; actions beside `addCut` ~1508)
- Create: `src/panels/AngleCuts.tsx`
- Modify: `src/panels/Properties.tsx` (render `<AngleCuts …/>` after the Cuts section, line ~632)
- Modify: `src/styles.css` (reuse `.cut`, `.cut-head`, `.cut-remove`, `.add-cut` — no new rules unless needed)
- Test: `src/document/angleCuts.test.ts`, `src/store/store.test.ts`, `src/panels/AngleCuts.test.tsx` (create; follow
  `Properties.test.tsx`'s render-with-store setup)

**Interfaces:**
- Produces (angleCuts.ts): `interface TaperFields { face: 'width' | 'thickness'; from: CutFrom; end: CutFrom; start: number; amount: number }`;
  `taperCut(f): Omit<AngleCut, 'id'>` (`kind: 'taper', along: 'length', alongFrom: f.end, points: [[0, f.amount], [f.start, 0]]`);
  `taperFields(c): TaperFields` (start = `zeroStation(c)`, amount = `depthAt(c, 0)`; non-finite values pass through);
  `defaultTaper(board): Omit<AngleCut, 'id'>` (width face, min side, from the length min end, start = ¾ of the length,
  amount = ¼ of the width).
- Produces (store): `addAngleCuts(boardId: string, cuts: Omit<AngleCut, 'id'>[]): void`;
  `updateAngleCut(boardId: string, cutId: string, next: Omit<AngleCut, 'id'>): void`;
  `removeAngleCut(boardId: string, cutId: string): void`.

- [ ] **Step 1: Write the failing tests**

`angleCuts.test.ts`:

```ts
import { defaultTaper, taperCut, taperFields } from './angleCuts';

describe('taper fields (spec §7)', () => {
  it('round-trips exactly', () => {
    const f = { face: 'thickness' as const, from: 'max' as const, end: 'max' as const, start: 22.25, amount: 0.4375 };
    const c = { id: 'x', ...taperCut(f) };
    expect(c).toMatchObject({ kind: 'taper', face: 'thickness', from: 'max', along: 'length', alongFrom: 'max', points: [[0, 0.4375], [22.25, 0]] });
    expect(taperFields(c)).toEqual(f);
  });
  it('defaults to a quarter of the width over three quarters of the length', () => {
    const b = createBoard({ length: 28, width: 2, thickness: 2 });
    expect(defaultTaper(b)).toEqual(taperCut({ face: 'width', from: 'min', end: 'min', start: 21, amount: 0.5 }));
  });
});
```

`store.test.ts`:

```ts
describe('angle-cut actions (spec §7)', () => {
  const setup = () => {
    useStore.getState().replaceDocument({ ...createDocument('T'), boards: [createBoard({ id: 'leg', name: 'Leg', length: 28, width: 2, thickness: 2 })] });
  };
  it('adds, updates and removes, one undo entry each', () => {
    setup();
    const s = () => useStore.getState();
    s().addAngleCuts('leg', [taperCut({ face: 'width', from: 'min', end: 'min', start: 21, amount: 0.5 })]);
    const id = (s().doc.boards[0] as Board).angleCuts[0]!.id;
    s().updateAngleCut('leg', id, taperCut({ face: 'width', from: 'min', end: 'min', start: 20, amount: 0.5 }));
    expect((s().doc.boards[0] as Board).angleCuts[0]!.points).toEqual([[0, 0.5], [20, 0]]);
    s().removeAngleCut('leg', id);
    expect((s().doc.boards[0] as Board).angleCuts).toEqual([]);
    s().undo(); s().undo(); s().undo();
    expect((s().doc.boards[0] as Board).angleCuts).toEqual([]);
    expect(s().past.length).toBe(0); // three entries, all undone — use the file's own way of counting entries
  });
  it('an unchanged update pushes no undo entry (inv 4)', () => {
    setup();
    const s = () => useStore.getState();
    const t = taperCut({ face: 'width', from: 'min', end: 'min', start: 21, amount: 0.5 });
    s().addAngleCuts('leg', [t]);
    const before = s().past.length;
    s().updateAngleCut('leg', (s().doc.boards[0] as Board).angleCuts[0]!.id, t);
    expect(s().past.length).toBe(before);
  });
  it('is refused while exploded (inv 47)', () => {
    setup();
    const s = () => useStore.getState();
    s().setExplode(0.5);
    s().addAngleCuts('leg', [taperCut({ face: 'width', from: 'min', end: 'min', start: 21, amount: 0.5 })]);
    expect((s().doc.boards[0] as Board).angleCuts).toEqual([]);
  });
});
```

(Use the store test file's existing names for the undo stack and explode setter; the assertions are the point.)

`src/panels/AngleCuts.test.tsx`:

```tsx
describe('the Angles section', () => {
  it('adds a taper and edits it in shop numbers', async () => {
    // render Properties (or AngleCuts) with a selected 28 × 2 × 2 leg, as Properties.test.tsx does
    await user.click(screen.getByRole('button', { name: '+ Add taper' }));
    expect(screen.getByText(/^Taper 1\/2" off the width face \(min side\)/)).toBeInTheDocument();
    const start = screen.getByLabelText('Starts');
    await user.clear(start); await user.type(start, '20{Enter}');
    expect((useStore.getState().doc.boards[0] as Board).angleCuts[0]!.points).toEqual([[0, 0.5], [20, 0]]);
  });
  it('refuses a removal larger than the face, and keeps the stored value', async () => {
    // … after adding a taper:
    const amount = screen.getByLabelText('Removes at that end');
    await user.clear(amount); await user.type(amount, '3{Enter}');
    expect((useStore.getState().doc.boards[0] as Board).angleCuts[0]!.points[0]![1]).toBe(0.5);
  });
  it('notes a taper that removes nothing at this size', () => {
    // a leg whose taper starts past its end
    expect(screen.getByText('This taper removes nothing at this size.')).toBeInTheDocument();
  });
  it('shows a hand-edited miter as its line with a remove button and no controls', () => {
    expect(screen.getByText(/^Miter 45\.0°/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Remove angle cut/ })).toBeInTheDocument();
  });
});
```

Fill in the render setup from `Properties.test.tsx` (store reset, `replaceDocument`, select the part, `render(<Properties />)`,
`userEvent.setup()`); keep every assertion.

Run them — Expected: FAIL.

- [ ] **Step 2: Implement the field conversions** (in `angleCuts.ts`)

```ts
/** A taper as the shop reads it (spec §7): which face, from which end, where it starts, how much it removes there. */
export interface TaperFields { face: 'width' | 'thickness'; from: CutFrom; end: CutFrom; start: number; amount: number }

/** Exact: the stored points are the typed numbers (invariant 25). */
export function taperCut(f: TaperFields): Omit<AngleCut, 'id'> {
  return { kind: 'taper', face: f.face, from: f.from, along: 'length', alongFrom: f.end, points: [[0, f.amount], [f.start, 0]] };
}

/** The shop numbers of a stored taper; a hand-edited line that never reaches zero gives a non-finite start. */
export function taperFields(c: AngleCut): TaperFields {
  return { face: c.face === 'thickness' ? 'thickness' : 'width', from: c.from, end: c.alongFrom, start: zeroStation(c), amount: depthAt(c, 0) };
}

/** A visible, legal starting point on any part: ¼ of the width off over ¾ of the length, from the min end. */
export function defaultTaper(board: Pick<Board, Dimension>): Omit<AngleCut, 'id'> {
  return taperCut({ face: 'width', from: 'min', end: 'min', start: board.length * 0.75, amount: board.width / 4 });
}
```

- [ ] **Step 3: Implement the store actions**

Interface (beside `addCut`):

```ts
  addAngleCuts: (boardId: string, cuts: Omit<AngleCut, 'id'>[]) => void;
  updateAngleCut: (boardId: string, cutId: string, next: Omit<AngleCut, 'id'>) => void;
  removeAngleCut: (boardId: string, cutId: string) => void;
```

Actions (beside `addCut`, same shape — read `addCut`/`updateCut`/`removeCut` and follow them exactly):

```ts
    // Angle cuts (angle-cuts spec §7): through mapWorld like cuts, so a shaped part's angle cuts are its
    // shape's and every user sees the edit (invariant 45); several in one call are one undo entry
    // (Miter's "both ends", chunk 2). Held points are re-judged after, as for cuts (invariant 24).
    addAngleCuts: (boardId, cuts) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || cuts.length === 0) return;
      const added = cuts.map((c) => ({ ...c, id: nextId() }) as AngleCut);
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (b.id === boardId ? { ...b, angleCuts: [...b.angleCuts, ...added] } : b))));
      judgeHeld();
    },
    updateAngleCut: (boardId, cutId, next) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      const cur = board?.angleCuts.find((c) => c.id === cutId);
      if (!board || !cur) return;
      const after: AngleCut = { ...copyAngleCut(next as AngleCut), id: cutId };
      if (sameAngleCut(cur, after)) return; // a no-op edit pushes no undo entry (invariant 4)
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, angleCuts: b.angleCuts.map((c) => (c.id === cutId ? after : c)) } : b)));
      judgeHeld();
    },
    removeAngleCut: (boardId, cutId) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || !board.angleCuts.some((c) => c.id === cutId)) return;
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, angleCuts: b.angleCuts.filter((c) => c.id !== cutId) } : b)));
      judgeHeld();
    },
```

- [ ] **Step 4: Implement the panel**

`src/panels/AngleCuts.tsx`:

```tsx
import { useStore } from '../store/store';
import { angleCutRemovesNothing, defaultTaper, taperCut, taperFields } from '../document/document';
import { angleLine } from '../document/angleText';
import type { AngleCut, Board, CutFrom } from '../document/document';
import { DimensionField } from './DimensionField';

const FACES: { value: string; label: string; face: 'width' | 'thickness'; from: CutFrom }[] = [
  { value: 'width|min', label: 'Width face — min side', face: 'width', from: 'min' },
  { value: 'width|max', label: 'Width face — max side', face: 'width', from: 'max' },
  { value: 'thickness|min', label: 'Thickness face — min side', face: 'thickness', from: 'min' },
  { value: 'thickness|max', label: 'Thickness face — max side', face: 'thickness', from: 'max' },
];

/**
 * One angle cut (angle-cuts spec §7). Its `kind` picks the controls, so an
 * edit never swaps them under the user. Chunk 1 edits tapers; any other kind
 * (a hand-edited file) shows its bench line and a remove button only.
 */
function AngleRow({ board, cut, precision }: { board: Board; cut: AngleCut; precision: number }) {
  const updateAngleCut = useStore((s) => s.updateAngleCut);
  const removeAngleCut = useStore((s) => s.removeAngleCut);
  const line = angleLine(board, cut, precision);
  const head = (
    <div className="cut-head">
      <span className="cut-label">{cut.kind[0]!.toUpperCase() + cut.kind.slice(1)}</span>
      <button className="cut-remove" aria-label={`Remove angle cut (${line})`} onClick={() => removeAngleCut(board.id, cut.id)}>✕</button>
    </div>
  );
  const none = angleCutRemovesNothing(board, cut) && (
    <p className="field-note" role="status">{`This ${cut.kind} removes nothing at this size.`}</p>
  );
  if (cut.kind !== 'taper') {
    return <div className="cut">{head}<p className="field-note">{line}</p>{none}</div>;
  }
  const f = taperFields(cut);
  const set = (patch: Partial<typeof f>) => updateAngleCut(board.id, cut.id, taperCut({ ...f, ...patch }));
  return (
    <div className="cut">
      {head}
      <p className="field-note">{line}</p>
      {none}
      <label className="field">
        <span>Face</span>
        <select value={`${f.face}|${f.from}`} onChange={(e) => {
          const o = FACES.find((x) => x.value === e.target.value)!;
          set({ face: o.face, from: o.from });
        }}>
          {FACES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>From</span>
        <select value={f.end} onChange={(e) => set({ end: e.target.value as CutFrom })}>
          <option value="min">Length min end</option>
          <option value="max">Length max end</option>
        </select>
      </label>
      <DimensionField label="Starts" precision={precision}
        value={Number.isFinite(f.start) ? f.start : null} max={board.length}
        onCommit={(v) => set({ start: v })} />
      <DimensionField label="Removes at that end" precision={precision}
        value={Number.isFinite(f.amount) ? f.amount : null} max={board[f.face]}
        onCommit={(v) => set({ amount: v })} />
    </div>
  );
}

/** The Angles section (spec §7): a single part's angle cuts. Chunk 1 adds tapers only. */
export function AngleCuts({ board, precision }: { board: Board; precision: number }) {
  const addAngleCuts = useStore((s) => s.addAngleCuts);
  return (
    <>
      <h3>Angles{board.angleCuts.length > 0 && <span className="h3-count"> · {board.angleCuts.length}</span>}</h3>
      {board.angleCuts.map((cut) => <AngleRow key={cut.id} board={board} cut={cut} precision={precision} />)}
      <button className="add-cut" onClick={() => addAngleCuts(board.id, [defaultTaper(board)])}>+ Add taper</button>
    </>
  );
}
```

Read the existing Cuts section's markup for the select/label pattern (`CutRow` uses one) and match its class names
(`field`, labels) exactly — replace the `<label className="field">` blocks above with whatever CutRow uses. Labels
"Starts" and "Removes at that end" must reach `getByLabelText` (DimensionField's `label` prop does that already).
Export `defaultTaper`, `taperCut`, `taperFields`, `TaperFields` through the barrel. Note: DimensionField's default
rule refuses ≤ 0 for both fields without a `min`, which is the spec's "start > 0, amount > 0"; `max` refuses past the
part / past the face (inclusive).

In `Properties.tsx`, after `<button className="add-cut" …>+ Add cut</button>`:
`<AngleCuts board={board} precision={precision} />` (import it).

- [ ] **Step 5: Run tests, suite, build.** Expected: PASS.

- [ ] **Step 6: Mutate**

- Remove the `sameAngleCut` guard in `updateAngleCut` → the no-op test fails. Restore.
- Remove `readOnly()` from `addAngleCuts` → the exploded test fails. Restore.
- Drop `max={board[f.face]}` → "refuses a removal larger than the face" fails. Restore.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(angle cuts): Angles section with the Taper preset

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Live check on the dev server

**Files:**
- Create: `docs/browser-verification-angle-cuts.md`; screenshots in `docs/img/` (`angle-cuts-*.png`) only for spatial findings

Rules (CLAUDE.md "The deployment rule", memory): the **dev server only**, driven through the Playwright MCP while the
user can watch; **never `localStorage.clear()`** on the dev origin — delete only the projects this check created;
software GL hides shader behaviour (26a), so shading and grain on sloped faces go to the user on real hardware.

- [ ] **Step 1:** `npm run dev -- --port 5180` (background). Open `http://localhost:5180` in the Playwright browser.
  Create a new project named `angle-cuts check` through the project menu.
- [ ] **Step 2:** Add a part, set 28 × 1-3/4 × 1-3/4, posture upright. Click **+ Add taper**. Record (DOM readout): the
  Angles row's line, the field values (Starts 21, Removes 7/16). Screenshot the viewport: the taper's slope on one face,
  edge lines on the slope's outline only, no seams.
- [ ] **Step 3:** Change Face to "Thickness face — max side", From to "Length max end", Starts 22, Removes 5/8. Record
  the line. Undo four times and confirm each step reverts one field (one entry each).
- [ ] **Step 4:** Add a mortise (+ Add cut) near the untapered end. Open the cut list: two setup lines, the Taper line
  after the pocket line; the part diagram shows the hatched wedge and the note. Screenshot the diagram.
- [ ] **Step 5:** Duplicate the leg; Group the two; set the group Mirrored. Confirm the copy's taper is the mirror
  image (screenshot), edit the original's Removes, confirm the copy follows. Open Plans: the elevations show the
  tapers with hidden lines where the mortise is behind the slope.
- [ ] **Step 6:** Explode the view: the Angles controls are disabled. Return to Select.
- [ ] **Step 7:** Open Claude ▾ → Add joinery: the refusal text names the legs; Add joinery is disabled; no estimate.
  Refine: the refusal shows.
- [ ] **Step 8:** Tape tool: hover the taper's corners at the foot — snap markers sit on the drawn corners.
- [ ] **Step 9:** Shorten the leg to 4": the row says "This taper removes nothing at this size." and the cut list
  prints no taper line. Undo.
- [ ] **Step 10:** Delete the `angle-cuts check` project (and any derived ones) through the project menu; confirm in
  `localStorage` that only this check's keys are gone (read the index, do not clear). Stop the dev server.
- [ ] **Step 11:** Write `docs/browser-verification-angle-cuts.md` (what was checked, DOM readouts, screenshots, what
  software GL could not confirm: sloped-face shading and grain — **ask the user to check on real hardware**). Commit:

```bash
git add docs/browser-verification-angle-cuts.md docs/img/angle-cuts-*.png
git commit -m "docs(angle cuts): live check on the dev server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Record and merge

**Files:**
- Modify: `docs/superpowers/specs/2026-10-12-sloyd-angle-cuts-design.md` (Status: chunk 1 implemented; the Task 11
  reading of §6 marked as an amendment)
- Modify: `docs/follow-ups.md` (new entries, next free numbers after 274): stopped angle cuts; angle-aware joinery;
  Generate emitting tapers/miters; "taper all four faces"; angle callouts on the Plans sheet (link fu 252); compound
  angles; sloped-face shading/grain awaiting real hardware (26a); and anything Task 13 found
- Modify: `docs/feature-gaps.md` (Tapered legs: "chunk 1 shipped …" once deployed)

- [ ] **Step 1:** Write the entries above; `npm test` and `npm run build` one last time; record the test count.
- [ ] **Step 2:** Commit the docs. Then `git checkout master && git merge --no-ff angle-cuts`, run `npm test` and
  `npm run build` on the merged tree, `git branch -d angle-cuts`.
- [ ] **Step 3:** Stop. Deploying (schema 14 — rollback past it strands projects saved since; export first) is the
  user's call per `DEPLOYMENT.local.md`. After a deploy: CLAUDE.md Status, the Rounds table row, the Versioning table
  row and the invariant amendments in spec §10 are updated then, not before.
