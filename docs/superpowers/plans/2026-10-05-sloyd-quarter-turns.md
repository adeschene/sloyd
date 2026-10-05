# Quarter Turns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `rotation` becomes `0 | 90 | 180 | 270`, four true quarter turns about the vertical. The
3D view, snapping, the design checks, joinery and textures all agree on where every cut is. Old
files migrate so they look exactly as before.

**Architecture:**
- **One mapping.** `axisFrame(board)` in `geometry.ts` gives each world axis a dimension AND a
  direction. Small helpers convert between a part's own coordinate and a world offset from
  `position`.
- **Every site goes through the helpers.** The ten sites that cross between a part's frame and the
  world call them instead of adding coordinates directly.
- **The proof is equivariance.** Turning a part a quarter turn about its centre must rotate every
  derived world thing (solids, snap points, drawn boxes and edges, joinery results) by exactly a
  quarter turn. Turn 0 stays as today, which the existing tests pin.

**Tech Stack:** TypeScript strict, Vitest 4, React 19 (Properties only), three.js (viewport, no unit
tests).

**Spec:** `docs/superpowers/specs/2026-10-05-sloyd-quarter-turns-design.md`. Read it first; it is
the authority.

## Global Constraints

- **Branch** `repeated-parts` (off master at `6e9959f`). Commit to the branch only.
- **Gates.** `npm test` must stay green: 1749 tests across 59 files at the start. `npm run build`
  must pass, and `npm test` does NOT typecheck.
- **The turn table is exactly spec §2.** Turn 90 is counter-clockwise seen from above. Turn 0's
  mapping is unchanged for every posture.
- **`axisFrame` is the ONE home of the table.** No other file may branch on `rotation`, except:
  - the migration;
  - `generated.ts`'s `orient`, which keeps looping `[0, 90]`;
  - Properties' select.
- **Every part↔world crossing calls the geometry helpers.** No site may compute
  `board[dim] - u` by hand.
- **Schema becomes 8 in Task 5, not before.** The migration runs on RAW data, after the v3/v4 steps
  and before `validateBoard` (invariant 11).
- **Untouched:** `JOINERY_PROMPT`, `orient`'s `[0, 90]` loop, the cut list, `diagram.ts`,
  `depthField.ts`, `tenons.ts` and `nesting.ts`.
- **Invariant 35:** in `boardUVs` the direction flip happens BEFORE the swap.
- **Mutation-test every new test.** Break the code it guards, confirm red, revert BY HAND (never
  `git checkout` over uncommitted work), and name each mutation and its result in the report. A test
  that cannot fail does not count.
- **Style:** match the surrounding code. Terse comments that state WHY; no new dependencies.

**Ruling recorded here (controller, while planning).** Spec §3 lists `faceGrainKinds` as a site. It
needs no change: it returns `[kindOf(x), kindOf(x), kindOf(y), kindOf(y), kindOf(z), kindOf(z)]`,
and both faces of a pair share one kind, so swapping the ± slots on a reversed axis is a no-op. Task
4 adds a one-line comment saying so instead of code. Cost if wrong: none, because the
texture-coordinate test in Task 4 covers what is drawn.

## Review Focus

1. **Snapping onto a cut corner of a 180° part** must land on the drawn corner. Task 2's
   equivariance test covers snap points against drawn solids.
2. **Turning a part 180° while the tape is anchored.**
   - Anchored on a BOX corner: the anchor is kept, because box corners are the same world points
     after a 180° turn.
   - Anchored on a CUT corner: the anchor is dropped, because the cut corner moves.

   Task 5 store test.
3. **A v7 file with a 90° part whose cut fields are malformed** (missing `offset`, a garbage `face`).
   The migration must not throw; `validateCuts` still decides. Task 5 test.
4. **A generated design** (parts at 0° and 90° from `orient`) **then joinery.** The new 90° must join
   exactly like a world-identical 0° or 270° arrangement. Task 3's equivariance test turns every part
   by 180°.
5. **Turning a 90° part to 270° (or 0° to 180°)** keeps its footprint and position exactly; only the
   cuts swing. Task 5 Properties test.

---

### Task 1: The mapping — `axisFrame`, helpers, four turns

**Files:**
- Modify: `src/document/types.ts` (`Rotation`), `src/document/geometry.ts`,
  `src/document/document.ts` (`VALID_ROTATIONS` only).
- Create: `src/document/geometry.test.ts`.

**Interfaces:**
- **Produces**, all exported from `src/document/geometry.ts` (`document.ts` re-exports geometry, so
  check that they reach `document.ts`'s exports too):
  - `export type Rotation = 0 | 90 | 180 | 270` (in `types.ts`).
  - `export interface AxisMap { dim: Dimension; reversed: boolean }`
  - `export function horizontalOf(posture: Posture): [Dimension, Dimension]`: [h0, h1].
  - `export function axisFrame(board: Board): [AxisMap, AxisMap, AxisMap]`
  - `export function axisDimensions(board: Board): [Dimension, Dimension, Dimension]`, derived from
    `axisFrame` (same signature as today).
  - `export function toWorldOffset(board: Board, axis: number, u: number): number`: a part
    coordinate on the dimension that world `axis` carries → its distance from `position[axis]`.
  - `export function fromWorldOffset(board: Board, axis: number, w: number): number`: the inverse.
  - `export function spanToWorldOffset(board: Board, axis: number, s: Span): Span`
  - `export function spanFromWorldOffset(board: Board, axis: number, s: Span): Span`
  - `export function endFacing(board: Board, axis: number, side: -1 | 1): 'min' | 'max'`: which END
    of the part's dimension on `axis` faces the world min (-1) or max (+1) side.

- [ ] **Step 1: Write the failing tests** in `src/document/geometry.test.ts`.

```ts
import { createBoard } from './document';
import type { Board, Dimension, Posture, Rotation } from './document';
import {
  axisDimensions, axisFrame, boardExtents, endFacing, fromWorldOffset, horizontalOf,
  spanFromWorldOffset, spanToWorldOffset, toWorldOffset,
} from './geometry';

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
const part = (posture: Posture, rotation: Rotation): Board =>
  createBoard({ length: 20, width: 6, thickness: 1.5, posture, rotation });

/** A part coordinate → world point relative to the part's CENTRE. */
const rel = (b: Board, p: Record<Dimension, number>): [number, number, number] => {
  const f = axisFrame(b);
  const e = boardExtents(b);
  return [0, 1, 2].map((i) => toWorldOffset(b, i, p[f[i]!.dim]) - e[i]! / 2) as [number, number, number];
};

describe('axisFrame', () => {
  it('turn 0 is today\'s mapping, nothing reversed, for every posture', () => {
    for (const posture of POSTURES) {
      const [h0, h1] = horizontalOf(posture);
      const f = axisFrame(part(posture, 0));
      expect(f.map((a) => a.dim)).toEqual([h0, f[1]!.dim, h1]);
      expect(f.every((a) => !a.reversed)).toBe(true);
    }
  });

  it('matches the spec §2 table', () => {
    const [h0, h1] = horizontalOf('flat'); // length, width
    const f = (r: Rotation) => axisFrame(part('flat', r)).map((a) => [a.dim, a.reversed]);
    expect(f(90)).toEqual([[h1, false], ['thickness', false], [h0, true]]);
    expect(f(180)).toEqual([[h0, true], ['thickness', false], [h1, true]]);
    expect(f(270)).toEqual([[h1, true], ['thickness', false], [h0, false]]);
  });

  it('axisDimensions is axisFrame without the directions', () => {
    for (const posture of POSTURES) for (const r of TURNS) {
      const b = part(posture, r);
      expect(axisDimensions(b)).toEqual(axisFrame(b).map((a) => a.dim));
    }
  });

  // The core property: each turn is the previous one rotated a quarter turn
  // counter-clockwise from above, about the centre: (x, y, z) -> (z, y, -x).
  it('each turn is the previous one rotated 90° about the vertical', () => {
    const probes: Record<Dimension, number>[] = [
      { length: 0, width: 0, thickness: 0 },
      { length: 3, width: 1, thickness: 0.25 },
      { length: 20, width: 2, thickness: 1.5 },
    ];
    for (const posture of POSTURES) for (const r of TURNS) {
      const a = part(posture, r);
      const b = part(posture, ((r + 90) % 360) as Rotation);
      for (const p of probes) {
        const [x, y, z] = rel(a, p);
        const got = rel(b, p);
        expect(got[0]).toBeCloseTo(z, 12);
        expect(got[1]).toBeCloseTo(y, 12);
        expect(got[2]).toBeCloseTo(-x, 12);
      }
    }
  });

  it('no turn changes handedness relative to turn 0', () => {
    const det = (b: Board) => {
      const f = axisFrame(b);
      // Column for each part dimension: which world axis, with which sign.
      const col = (d: Dimension) => [0, 1, 2].map((i) => (f[i]!.dim === d ? (f[i]!.reversed ? -1 : 1) : 0));
      const [l, w, t] = [col('length'), col('width'), col('thickness')];
      return l[0]! * (w[1]! * t[2]! - w[2]! * t[1]!) - l[1]! * (w[0]! * t[2]! - w[2]! * t[0]!) + l[2]! * (w[0]! * t[1]! - w[1]! * t[0]!);
    };
    for (const posture of POSTURES) {
      const d0 = det(part(posture, 0));
      for (const r of TURNS) expect(det(part(posture, r))).toBe(d0);
    }
  });
});

describe('the offset helpers', () => {
  it('toWorldOffset and fromWorldOffset invert each other; spans keep min <= max', () => {
    for (const posture of POSTURES) for (const r of TURNS) {
      const b = part(posture, r);
      for (const axis of [0, 1, 2]) {
        expect(fromWorldOffset(b, axis, toWorldOffset(b, axis, 1.25))).toBeCloseTo(1.25, 12);
        const s = spanToWorldOffset(b, axis, [1, 2.5]);
        expect(s[0]).toBeLessThanOrEqual(s[1]);
        expect(spanFromWorldOffset(b, axis, s)).toEqual([1, 2.5]);
      }
    }
  });

  it('a reversed axis puts part coordinate 0 at the world max side', () => {
    const b = part('flat', 180); // X carries length, reversed
    expect(toWorldOffset(b, 0, 0)).toBe(20);
    expect(toWorldOffset(b, 0, 20)).toBe(0);
    expect(endFacing(b, 0, -1)).toBe('max');
    expect(endFacing(b, 0, 1)).toBe('min');
    expect(endFacing(part('flat', 0), 0, -1)).toBe('min');
  });
});
```

  Run `npx vitest run src/document/geometry.test.ts`. Expected: FAIL (missing exports).

- [ ] **Step 2: Implement** in `src/document/geometry.ts`. Replace `axisDimensions` and its doc
  comment (keep the comment's history paragraph, and update it to say the mapping now has
  directions):

```ts
/** One world axis of a part: the dimension it carries, and whether that
 *  dimension's coordinate 0 sits on the world MAX side. */
export interface AxisMap { dim: Dimension; reversed: boolean }

/** The two dimensions that lie horizontal in a posture, [h0, h1], in
 *  DIMENSION_ORDER. Turn 0 puts h0 on X and h1 on Z. */
export function horizontalOf(posture: Posture): [Dimension, Dimension] {
  const up = UP[posture];
  const [h0, h1] = DIMENSION_ORDER.filter((d) => d !== up);
  return [h0!, h1!];
}

/**
 * The ONE home of the turn table (quarter-turns spec §2): for world [X, Y, Z],
 * the part dimension each carries and its direction. Every turn is a TRUE
 * rotation counter-clockwise seen from above. Turn 0 is the pre-v8 mapping
 * for every posture. Before v8, 90 was a mirror across the X=Z diagonal (no
 * direction existed), so a part's cuts could never face (-X, +Z): one corner
 * of a frame was unreachable for identical parts.
 */
export function axisFrame(board: Board): [AxisMap, AxisMap, AxisMap] {
  const [h0, h1] = horizontalOf(board.posture);
  const y: AxisMap = { dim: UP[board.posture], reversed: false };
  switch (board.rotation) {
    case 90: return [{ dim: h1, reversed: false }, y, { dim: h0, reversed: true }];
    case 180: return [{ dim: h0, reversed: true }, y, { dim: h1, reversed: true }];
    case 270: return [{ dim: h1, reversed: true }, y, { dim: h0, reversed: false }];
    default: return [{ dim: h0, reversed: false }, y, { dim: h1, reversed: false }];
  }
}

/** Which dimension runs along each world axis, as [X, Y, Z], without direction. */
export function axisDimensions(board: Board): [Dimension, Dimension, Dimension] {
  return axisFrame(board).map((a) => a.dim) as [Dimension, Dimension, Dimension];
}

/**
 * Part coordinate u, on the dimension world `axis` carries, as a distance from
 * `position[axis]` (the world min corner, invariant 2). On a reversed axis the
 * part's 0 is at the far side. Every crossing between a part's frame and the
 * world goes through these four helpers; never write `board[dim] - u` at a
 * call site.
 */
export function toWorldOffset(board: Board, axis: number, u: number): number {
  const a = axisFrame(board)[axis]!;
  return a.reversed ? board[a.dim] - u : u;
}

/** The inverse of toWorldOffset (the same reflection). */
export function fromWorldOffset(board: Board, axis: number, w: number): number {
  return toWorldOffset(board, axis, w);
}

/** A part span → a world-offset span, still [min, max]. */
export function spanToWorldOffset(board: Board, axis: number, s: Span): Span {
  const a = axisFrame(board)[axis]!;
  return a.reversed ? [board[a.dim] - s[1], board[a.dim] - s[0]] : [s[0], s[1]];
}

/** A world-offset span → a part span, still [min, max]. */
export function spanFromWorldOffset(board: Board, axis: number, s: Span): Span {
  return spanToWorldOffset(board, axis, s);
}

/** Which end of the part's dimension on `axis` faces the world min (-1) or
 *  max (+1) side. Joinery maps a world side to a cut's `from` with this. */
export function endFacing(board: Board, axis: number, side: -1 | 1): 'min' | 'max' {
  const worldMin = side === -1;
  return worldMin !== axisFrame(board)[axis]!.reversed ? 'min' : 'max';
}
```

  Also:
  - import `Span` from `./types`;
  - in `types.ts`, set `export type Rotation = 0 | 90 | 180 | 270;` and update its doc comment;
  - in `document.ts`, set `const VALID_ROTATIONS = [0, 90, 180, 270];`.
  - **Do not change `foldRotationToV2`.** v1 had no cuts, so its fold is still right. Add one sentence
    to its comment saying so.
  - `document.ts` re-exports geometry. Check that the new names are exported through it, and add
    them if the re-export is a named list.

- [ ] **Step 3: Run.** `npx vitest run src/document/geometry.test.ts src/document/document.test.ts`,
  then `npm test` and `npm run build`. Expected: all pass.
  - The existing turn-0/90 tests still pass because dimensions are unchanged.
  - Nothing reads `reversed` yet, so geometry at 90 still renders the old way. That is expected until
    Task 2.

- [ ] **Step 4: Mutation-test.** Each red, then reverted by hand:
  - swap the `reversed` flags of turn 90 (put it on X instead of Z): the rotation test goes red;
  - make 180 reverse only X: the rotation and handedness tests go red;
  - make `endFacing` ignore `reversed`: the endFacing assertions go red.

- [ ] **Step 5: Commit.**

```bash
git add src/document/types.ts src/document/geometry.ts src/document/geometry.test.ts src/document/document.ts
git commit -m "feat(geometry): axisFrame — four true quarter turns, one mapping with direction"
```

---

### Task 2: The document sites use the mapping (solids, edges, snap points, design checks)

**Files:**
- Modify:
  - `src/document/cuts.ts` (`solidWorldBox`, `pointToLocalXYZ`);
  - `src/document/snapPoints.ts` (`boardSnapPoints`' filter, `toWorld`, and the comments at ~80 and
    ~347 that say rotation is only 0 or 90);
  - `src/document/designCheck.ts` (`worldSolids`).
- Create: `src/document/turnFixtures.ts` (shared by Tasks 2-4 tests; imported only by tests).
- Create: `src/document/turns.test.ts`.

**Interfaces:**
- **Consumes** from Task 1: `axisFrame`, `toWorldOffset`, `fromWorldOffset`, `spanToWorldOffset`.
- **Produces** in `turnFixtures.ts`:
  - `chiralPart(posture: Posture): Board`: 20 × 6 × 1.5 with two one-handed cuts.
  - `turnedAbout(board: Board, rotation: Rotation, centre: [number, number, number]): Board`: the
    same part at `rotation`, positioned so its X/Z centre is `centre` and its Y min is `centre[1]`.
  - `rotateQuarter(p: [number, number, number], centre: [number, number, number]): [number, number, number]`:
    (x, y, z) → (cx + (z − cz), y, cz − (x − cx)).
  - `sameSet(a: number[][], b: number[][]): boolean`: equality as sets of points, within 1e-9.

- [ ] **Step 1: The fixtures.** `src/document/turnFixtures.ts`:

```ts
import { createBoard } from './document';
import type { Board, Posture, Rotation } from './document';
import { boardExtents } from './geometry';

/**
 * A part whose cuts have a HAND: a stopped dado stopped at one end only, and
 * an off-centre mortise stopped unequally. A mirror of it is a different part,
 * so a reflection anywhere in the part↔world mapping shows up. Used only by
 * tests (quarter-turns plan, Tasks 2-4).
 */
export function chiralPart(posture: Posture): Board {
  return createBoard({
    name: 'Chiral', length: 20, width: 6, thickness: 1.5, posture,
    cuts: [
      { id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 4, width: 0.75, depth: 0.5, stopMin: 0, stopMax: 1.5 },
      { id: 'c2', face: 'width', from: 'min', across: 'length', offset: 0.375, width: 0.5, depth: 1, stopMin: 2, stopMax: 12 },
    ],
  });
}

export function turnedAbout(board: Board, rotation: Rotation, centre: [number, number, number]): Board {
  const b = { ...board, rotation };
  const e = boardExtents(b);
  return { ...b, position: [centre[0] - e[0] / 2, centre[1], centre[2] - e[2] / 2] };
}

export function rotateQuarter(p: [number, number, number], c: [number, number, number]): [number, number, number] {
  return [c[0] + (p[2] - c[2]), p[1], c[2] - (p[0] - c[0])];
}

const key = (p: number[]) => p.map((v) => Math.round(v * 1e9)).join(',');
export function sameSet(a: number[][], b: number[][]): boolean {
  if (a.length !== b.length) return false;
  const ka = a.map(key).sort();
  const kb = b.map(key).sort();
  return ka.every((k, i) => k === kb[i]);
}
```

  `createBoard` must accept `cuts`, `posture` and `name` in its partial. Check `createBoard`'s
  signature, and if it does not keep `cuts` as given, build the board with `{ ...createBoard(...),
  cuts: [...] }`. The stop of 1.5 on a 6-wide `across` and the stops 2 and 12 on 20 leave a real cut,
  so `cutsThatRemoveStock` keeps both.

- [ ] **Step 2: The equivariance tests (failing).** `src/document/turns.test.ts`:

```ts
import { boardCenter, boardEdges, boardSnapPoints, cutSnapPoints, solidWorldBox, boardSolids, pointToLocalXYZ } from './document';
import type { Posture, Rotation } from './document';
import { worldSolids } from './designCheck';
import { chiralPart, rotateQuarter, sameSet, turnedAbout } from './turnFixtures';

const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];
const TURNS: Rotation[] = [0, 90, 180, 270];
const C: [number, number, number] = [10, 0, -5];
const next = (r: Rotation) => ((r + 90) % 360) as Rotation;

/** World points of everything a site derives, for one part. */
const corners = (min: number[], max: number[]) => {
  const out: number[][] = [];
  for (const x of [min[0]!, max[0]!]) for (const y of [min[1]!, max[1]!]) for (const z of [min[2]!, max[2]!]) out.push([x, y, z]);
  return out;
};
const sites = {
  worldSolids: (b: ReturnType<typeof chiralPart>) => worldSolids(b).flatMap((s) => corners(s.min, s.max)),
  boardSnapPoints: (b: ReturnType<typeof chiralPart>) => boardSnapPoints(b).map((p) => [...p.at]),
  cutSnapPoints: (b: ReturnType<typeof chiralPart>) => cutSnapPoints(b).map((p) => [...p.at]),
  solidWorldBox: (b: ReturnType<typeof chiralPart>) => {
    const c = boardCenter(b);
    return boardSolids(b).flatMap((s) => {
      const { center, size } = solidWorldBox(b, s);
      const mid = [0, 1, 2].map((i) => c[i]! + center[i]!);
      return corners(mid.map((m, i) => m - size[i]! / 2), mid.map((m, i) => m + size[i]! / 2));
    });
  },
  edges: (b: ReturnType<typeof chiralPart>) => {
    const c = boardCenter(b);
    return boardEdges(b).flatMap(([p, q]) => [p, q].map((pt) => pointToLocalXYZ(b, pt).map((v, i) => c[i]! + v)));
  },
};

describe('quarter turns: every site rotates with the part (spec §7.1)', () => {
  for (const [name, derive] of Object.entries(sites)) {
    it(`${name}: turn r+90 is turn r rotated a quarter turn about the centre, in every posture`, () => {
      for (const posture of POSTURES) for (const r of TURNS) {
        const a = turnedAbout(chiralPart(posture), r, C);
        const b = turnedAbout(chiralPart(posture), next(r), C);
        const rotated = derive(a).map((p) => rotateQuarter(p as [number, number, number], C));
        expect(sameSet(rotated, derive(b))).toBe(true);
      }
    });
  }

  it('the fixture really is one-handed: its mirror is a different shape', () => {
    // Guards the fixture: if both cuts were symmetric, a reflection would
    // pass every test above.
    const a = turnedAbout(chiralPart('flat'), 0, C);
    const mirrored = sites.worldSolids(a).map(([x, y, z]) => [2 * C[0] - x!, y!, z!]);
    expect(sameSet(mirrored, sites.worldSolids(a))).toBe(false);
  });
});
```

  - **Check names and exports.** Match the real exported names and shapes of `boardEdges`
    (segments as `[Point, Point]`?) and `cutSnapPoints`, and adjust the test's readers to them
    without changing what is asserted.
  - **If a name is not re-exported** from `./document`, import it from its module.
  - **Run** `npx vitest run src/document/turns.test.ts`. Expected: FAIL for every site at turns
    whose mapping reverses an axis.

- [ ] **Step 3: Implement the four sites.**
  - **`cuts.ts` `solidWorldBox`:**

```ts
  const frame = axisFrame(board);
  const extents = boardExtents(board);
  const size = frame.map(({ dim }) => solid[dim][1] - solid[dim][0]) as [number, number, number];
  const center = frame.map(({ dim }, axis) => {
    const [lo, hi] = spanToWorldOffset(board, axis, solid[dim]);
    return (lo + hi) / 2 - extents[axis]! / 2;
  }) as [number, number, number];
```

  - **`cuts.ts` `pointToLocalXYZ`:**
    `axisFrame(board).map(({ dim }, axis) => toWorldOffset(board, axis, point[dim]) - extents[axis]! / 2)`.
  - **`snapPoints.ts` `boardSnapPoints` filter:**
    `local[frame[i].dim] = fromWorldOffset(board, i, p.at[i] - board.position[i])` for i = 0..2.
  - **`snapPoints.ts` `toWorld`:**
    `[0, 1, 2].map((i) => board.position[i] + toWorldOffset(board, i, p[frame[i].dim]))`.
  - **`designCheck.ts` `worldSolids`:** for each axis,
    `const [lo, hi] = spanToWorldOffset(b, i, s[frame[i].dim]); min = b.position[i] + lo; max = b.position[i] + hi`.
  - **Comments.** Update every touched doc comment to name the direction. The snapPoints comments
    that say rotation is only 0 or 90 now say four turns, with any axis possibly reversed.

- [ ] **Step 4: Run.** `npx vitest run src/document`, then `npm test` and `npm run build`. Expected:
  all pass. Existing turn-0 tests are untouched in meaning. If an existing test at rotation 90
  asserts a specific world coordinate of a cut, it is asserting the OLD mirror.
  - **Do not edit it on your own.** Report it as DONE_WITH_CONCERNS, with the test name and the old
    vs new value.
  - **The controller rules** whether the new value is the spec's (expected: yes, spec §2).

- [ ] **Step 5: Mutation-test.** Each red, then reverted:
  - in each of the five sites in turn, replace the helper with the old direction-free arithmetic.
    That site's equivariance test must go red;
  - make `chiralPart`'s c1 `stopMax: 0`: the fixture-guard test must still pass, and report whether
    any site test survives. This shows how much the second cut carries.

- [ ] **Step 6: Commit.**

```bash
git add src/document/cuts.ts src/document/snapPoints.ts src/document/designCheck.ts src/document/turnFixtures.ts src/document/turns.test.ts
git commit -m "feat(document): solids, edges, snap points and design checks follow the part's turn"
```

---

### Task 3: Joinery follows the turn (`pocketFor`, `resize`, `cutIntoEnd`)

**Files:**
- Modify: `src/generate/joints/pocket.ts`, `src/generate/joints/recipes.ts`.
- Test: `src/generate/joints/pocket.test.ts`, `src/generate/joints/recipes.test.ts`.

**Interfaces:**
- **Consumes:** `axisFrame`, `spanFromWorldOffset`, `endFacing` (Task 1); `worldSolids` (Task 2's
  version).
- **Produces:** no new exports.

- [ ] **Step 1: Failing tests.**
  - **`pocket.test.ts`.** Find the probe-every-pose test (invariant 41: a pose list probed against
    the box). Extend its pose list to all 3 postures × 4 turns. The assertion stays the same: the cut
    removes exactly the box ∩ board, judged by world solids. If its probe computes world coordinates
    with its own arithmetic, make it use `worldSolids` (now direction-aware) so the box comparison is
    in true world space.
  - **`recipes.test.ts`.** Add a joinery equivariance test.
    - **Fixtures:** pick at least four existing fixtures, covering:
      - a mortise-and-tenon rail between legs;
      - a dado'd shelf between sides;
      - the rabbeted cabinet back;
      - the existing "end already cut is a skip" fixture (it exercises `cutIntoEnd`).
    - **Method:** for each, run `applyJoints` with default choices on the fixture, and on a copy with
      every part's `rotation` advanced by 180 (`(r + 180) % 360`). 180 keeps every part's world box,
      so the design is world-identical.
    - **Assert:**
      - every part's `worldSolids` (sorted corner sets, `sameSet` from `src/document/turnFixtures.ts`)
        are identical between the two runs;
      - the moved, trimmed and skipped part names are equal;
      - `lowered` is equal.
    - **Use the existing test helpers** that build and join these fixtures; do not re-derive them.

  Run both files. Expected: FAIL. The 180 copy's tenons grow at the wrong end or `pocketFor` cuts
  mirrored, so the world solids differ.

- [ ] **Step 2: Implement.**
  - **`pocket.ts` `pocketFor`.** Clamp in world-offset space, then convert:

```ts
  axisFrame(board).forEach(({ dim: d }, i) => {
    const snap = (v: number) => (Math.abs(v) <= EPS ? 0 : Math.abs(v - board[d]) <= EPS ? board[d] : v);
    const lo = Math.max(0, box.min[i] - board.position[i]);
    const hi = Math.min(board[d], box.max[i] - board.position[i]);
    const [a, b] = spanFromWorldOffset(board, i, [lo, hi]);
    local[d] = [snap(a), snap(b)];
  });
```

    Everything after this in `pocketFor` is already in the part's own frame. Update its doc comment:
    "The box is mapped into the board's own frame (`axisFrame`, with direction)".
  - **`recipes.ts` `resize`.** `rebaseCuts(b, d, endFacing(b, k, side), amount, was)`. `endFacing`
    reads posture and rotation only, so calling it after `b[d]` changes is correct. The world
    position shift (`side === -1`) is unchanged.
  - **`recipes.ts` `cutIntoEnd`.** It is called with a WORLD end. Map it:

```ts
const cutIntoEnd = (b: Board, k: number, end: 'min' | 'max') => {
  const local = endFacing(b, k, end === 'min' ? -1 : 1);
  return b.cuts.some((c) => c.face === axisDimensions(b)[k] && c.from === local);
};
```

    **Read all three callers** (around lines 305, 439 and 460) and confirm each passes the world end
    of the resize it guards. If any caller already passes a PART end, stop and report
    (NEEDS_CONTEXT); do not "fix" it blind.

- [ ] **Step 3: Run.**
  - `npx vitest run src/generate`, then `npm test` and `npm run build`. Expected: pass.
  - `JOINERY_PROMPT` and every existing recipes test are unchanged: those fixtures are at turns 0/90
    with no reversed axis except 90's Z.
  - If an existing joinery test at turn 90 changes, report it as in Task 2 Step 4. Do not edit it
    silently.

- [ ] **Step 4: Mutation-test.** Each red, then reverted:
  - `pocketFor` without the span conversion: the pose test goes red;
  - `resize` with the old `side === -1 ? 'min' : 'max'`: the equivariance test goes red;
  - `cutIntoEnd` comparing `c.from === end`: the skip fixture's equivariance goes red. If it does
    not, say why in the report; the 180 copy may refuse the same site for a different reason.

- [ ] **Step 5: Commit.**

```bash
git add src/generate/joints/pocket.ts src/generate/joints/recipes.ts src/generate/joints/pocket.test.ts src/generate/joints/recipes.test.ts
git commit -m "feat(joinery): pocketFor and end trims follow the part's turn"
```

---

### Task 4: Textures follow the turn (`boardUVs`)

**Files:**
- Modify: `src/viewport/grainTiling.ts` (`boardUVs`), `src/viewport/grainFaces.ts` (a comment only).
- Test: `src/viewport/grainTiling.test.ts`.

**Interfaces:**
- **Consumes:** `axisFrame`, `spanToWorldOffset` (Task 1); `chiralPart`, `turnedAbout` (Task 2's
  `src/document/turnFixtures.ts`).

- [ ] **Step 1: Failing test.**
  - **Find the existing test** in `grainTiling.test.ts` for invariant 35's interior number. It
    checks that `uv − worldCoordinate / tileInches` is identical for every vertex of every solid of
    a board.
  - **Extend it** to `chiralPart(posture)` at every posture × turn, using `turnedAbout(..., C)`.
    Each vertex's world coordinate must come from the drawn geometry: `boardCenter` +
    `solidWorldBox` centre ± half size, in BoxGeometry's vertex order, the way the existing test
    computes it.
  - **Run.** Expected: FAIL at turns that reverse an axis.

- [ ] **Step 2: Implement.**
  - **`boardUVs`.** Replace `const spans = plan.axes.map((axis) => solid[dims[axis]])` with:

```ts
    const spans = plan.axes.map((axis) => spanToWorldOffset(board, axis, solid[frame[axis]!.dim])) as [Span, Span];
```

    - Use `const frame = axisFrame(board)` in place of `dims`.
    - **Leave the FACE_AXES sign and swap logic exactly as it is.** The spans are now world-offset
      spans, so the "fraction runs WITH its world axis" comment is now true on every turn. Add one
      line to the comment saying the span is in world-offset space for that reason.
    - `wholeBoard(board)` stays a part-frame Region. `spanToWorldOffset` of a full span is the same
      full span.
  - **`faceGrainKinds`.** Add one comment line: both faces of an axis pair share one grain kind, so a
    reversed axis needs no slot swap (the quarter-turns plan's ruling).
  - **`boardUVSignature`** already includes `board.rotation`. Confirm it; no change.

- [ ] **Step 3: Run and mutate.**
  - **Run** `npx vitest run src/viewport`, `npm test`, `npm run build`.
  - **Mutation 1:** revert `spans` to the part-frame span. The extended test must go red.
  - **Mutation 2:** apply the reversal AFTER the swap. Swap the order of `spanToWorldOffset` and the
    plan's axis swap by mapping with the swapped axis. The test must go red.
  - **Report both.**

- [ ] **Step 4: Commit.**

```bash
git add src/viewport/grainTiling.ts src/viewport/grainFaces.ts src/viewport/grainTiling.test.ts
git commit -m "feat(viewport): textures follow the part's turn (invariant 35)"
```

---

### Task 5: Schema 8 migration, and the Turn select

**Files:**
- Modify: `src/document/document.ts` (`CURRENT_VERSION`, new `trueTurnsToV8`, the migration chain),
  `src/panels/Properties.tsx` (the Turn select).
- Test: `src/document/document.test.ts`, `src/panels/Properties.test.tsx`,
  `src/store/store.test.ts`.

**Interfaces:**
- **Consumes:** `horizontalOf`, `axisDimensions`, `boardSolids` (Task 1, existing);
  `chiralPart` (Task 2).

- [ ] **Step 1: Failing tests.**
  - **In `document.test.ts`:**

```ts
describe('v7 -> v8: true quarter turns', () => {
  // The pre-v8 world mapping, written out independently: position plus the
  // part span on axisDimensions, no direction. At 90 it was a mirror.
  const oldWorld = (b: Board) => {
    const dims = axisDimensions(b);
    return boardSolids(b).map((s) => [0, 1, 2].map((i) => [b.position[i]! + s[dims[i]!][0], b.position[i]! + s[dims[i]!][1]]));
  };
  const newWorld = (b: Board) => worldSolids(b).map((s) => [0, 1, 2].map((i) => [s.min[i]!, s.max[i]!]));
  const v7 = (boards: unknown[]) => ({ version: 7, name: 'Old', units: { system: 'imperial', precision: 16 }, stock: { kerf: 0.125 }, guides: [], boards });
  const flatten = (w: number[][][]) => w.map((b) => b.flat());

  it('a 90° part with cuts keeps its exact world geometry, in every posture', () => {
    for (const posture of ['flat', 'on-edge', 'upright'] as const) {
      const before = { ...chiralPart(posture), rotation: 90 as const, position: [3, 0, 4] as [number, number, number] };
      const after = migrateDocument(v7([before])).boards[0]!;
      expect(sameSet(flatten(newWorld(after)), flatten(oldWorld(before)))).toBe(true);
    }
  });

  it('touches only 90° parts with cuts: others come through byte-identical', () => {
    const flat0 = { ...chiralPart('flat'), rotation: 0 as const };
    const uncut90 = { ...chiralPart('flat'), rotation: 90 as const, cuts: [] };
    const doc = migrateDocument(v7([flat0, uncut90]));
    expect(doc.boards[0]!.cuts).toEqual(flat0.cuts);
    expect(doc.boards[1]!.cuts).toEqual([]);
  });

  it('mirrors each cut on exactly its own field', () => {
    const base = { ...chiralPart('flat'), rotation: 90 as const }; // h0 = length (20)
    const cuts = [
      { id: 'f', face: 'length', from: 'min', across: 'width', offset: 0, width: 1, depth: 2, stopMin: 0, stopMax: 0 },
      { id: 'a', face: 'thickness', from: 'max', across: 'length', offset: 1, width: 1, depth: 0.5, stopMin: 3, stopMax: 5 },
      { id: 'p', face: 'thickness', from: 'max', across: 'width', offset: 4, width: 0.75, depth: 0.5, stopMin: 0, stopMax: 0 },
    ];
    const got = migrateDocument(v7([{ ...base, cuts }])).boards[0]!.cuts;
    expect(got.find((c) => c.id === 'f')).toMatchObject({ from: 'max', offset: 0, stopMin: 0, stopMax: 0 });
    expect(got.find((c) => c.id === 'a')).toMatchObject({ from: 'max', offset: 1, stopMin: 5, stopMax: 3 });
    expect(got.find((c) => c.id === 'p')).toMatchObject({ from: 'max', offset: 15.25, stopMin: 0, stopMax: 0 });
  });

  it('a malformed cut on a 90° part does not throw; validateCuts still decides (Review Focus 3)', () => {
    const bad = { ...chiralPart('flat'), rotation: 90, cuts: [{ id: 'x', face: 'nonsense', from: 'min' }, { id: 'y', face: 'thickness', from: 'max', across: 'width' }] };
    expect(() => migrateDocument(v7([bad]))).not.toThrow();
  });

  it('a v8 file opens; a version above CURRENT_VERSION is still refused', () => {
    expect(CURRENT_VERSION).toBe(8);
    expect(() => migrateDocument({ ...v7([]), version: 8 })).not.toThrow();
    expect(() => migrateDocument({ ...v7([]), version: 9 })).toThrow();
  });
});
```

  - **Imports.** Use the test file's existing import style. Import `worldSolids` from
    `./designCheck`, `chiralPart` and `sameSet` from `./turnFixtures`, `CURRENT_VERSION` and
    `migrateDocument` from `./document`. Adjust the v7 document literal to whatever the existing
    tests use as a minimal valid document.
  - **The `stopMin`/`stopMax` swap for cut `a`.** Its `across` is length (h0), so 3 and 5 swap.
  - **Cut `p`.** Its position axis is length: `20 − 4 − 0.75 = 15.25`.
  - **Cut `f`.** Its face is length: `from` flips to `max`.

  - **In `Properties.test.tsx`:**
    - the Turn select offers exactly `0°, 90°, 180°, 270°`;
    - selecting 180 on a part at 0 keeps `position` exactly (footprint unchanged, Review Focus 5);
    - selecting 270 on a part at 90 also keeps `position` exactly.
  - **In `store.test.ts` (Review Focus 2):**
    - a part with a cut;
    - `setTapeAnchor` on one of its BOX corners: `updateBoard(id, { rotation: 180 })` keeps the
      anchor;
    - the same with the anchor on a CUT snap point (from `cutSnapPoints`): the turn drops it;
    - use `updateBoard`, which is the path the select takes.

  - **Run.** Expected: FAIL (`CURRENT_VERSION` is 7, no migration, the select has two options).

- [ ] **Step 2: Implement.**
  - **`document.ts`:**
    - `CURRENT_VERSION = 8`, with a doc paragraph in the existing style: the bump's argument is WRONG
      GEOMETRY. A v7 build reads 180 and 270 as invalid, falls back to 0, shows a different part and
      autosaves it.
    - Add, beside the other upgrade steps:

```ts
/**
 * v7 -> v8: rotation 90 became a TRUE quarter turn (quarter-turns spec §4).
 * Before v8 it carried h0 on Z forward; now h0 runs reversed. So a 90° part's
 * cuts are mirrored along h0 and its world geometry is exactly what it was.
 * Only 90° parts WITH cuts change; everything else passes through untouched.
 * RAW data, before validateBoard (invariant 11): a malformed field is left for
 * validateCuts to judge, never thrown on here.
 */
function trueTurnsToV8(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const b = raw as Record<string, unknown>;
  if (b.rotation !== 90 || !Array.isArray(b.cuts) || b.cuts.length === 0) return raw;
  const posture = VALID_POSTURES.includes(b.posture as Posture) ? (b.posture as Posture) : 'flat';
  const [h0] = horizontalOf(posture);
  const size = b[h0];
  if (typeof size !== 'number' || !Number.isFinite(size)) return raw;
  return { ...b, cuts: b.cuts.map((c) => mirrorCutAlong(c, h0, size)) };
}

/** One cut mirrored along dimension d (u -> size - u). face, across and the
 *  position axis are three different dimensions, so exactly one case applies. */
function mirrorCutAlong(raw: unknown, d: Dimension, size: number): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const c = raw as Record<string, unknown>;
  if (c.face === d) {
    return c.from === 'min' ? { ...c, from: 'max' } : c.from === 'max' ? { ...c, from: 'min' } : raw;
  }
  if (c.across === d) return { ...c, stopMin: c.stopMax, stopMax: c.stopMin };
  const dims = DIMENSION_ORDER as string[];
  if (!dims.includes(c.face as string) || !dims.includes(c.across as string)) return raw;
  if (typeof c.offset !== 'number' || typeof c.width !== 'number') return raw;
  return { ...c, offset: size - c.offset - c.width };
}
```

    - In the chain, after the v4 step: `if (d.version < 8) rawBoards = rawBoards.map(trueTurnsToV8);`.
    - **Check `validateBoard`'s posture fallback.** Confirm it is `'flat'`, so the migration's
      fallback matches it. If it is not, use the real fallback and say so.
    - **Swapping stops when one is absent.** A v6 cut has no `stopMin`/`stopMax`, and swapping
      `undefined` with `undefined` is harmless, because `validateCuts` defaults both to 0.
  - **`Properties.tsx`:** add `<option value={180}>180°</option>` and
    `<option value={270}>270°</option>`.
  - **Update any existing test that asserts `CURRENT_VERSION === 7`** or a saved `version: 7`. That
    change is the spec's. Name each one in the report.

- [ ] **Step 3: Run and mutate.**
  - **Run** `npm test` and `npm run build`. Expected: pass.
  - **Mutations,** each red then reverted:
    - remove the `.map(trueTurnsToV8)` line (geometry test);
    - mirror along h1 instead of h0 (geometry and per-field tests);
    - drop the `from` flip (per-field test);
    - drop the stop swap (per-field test);
    - make the step also touch 0° parts (byte-identical test);
    - remove the 270 option (Properties test).

- [ ] **Step 4: Commit.**

```bash
git add src/document/document.ts src/document/document.test.ts src/panels/Properties.tsx src/panels/Properties.test.tsx src/store/store.test.ts
git commit -m "feat(document): schema 8 — 90° parts migrate to true turns; Turn offers four quarter turns"
```

---

### Task 6: Docs

**Files:** `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md`.

- [ ] **Step 1: CLAUDE.md.**
  - **A new invariant 44** (append; never renumber):
    - `axisFrame` is the ONE home of the turn table, and every part↔world crossing goes through
      its four helpers, never `board[dim] - u` by hand;
    - turns are true rotations, and turn 0 is the pre-v8 mapping;
    - the proof is equivariance (turn r+90 = turn r rotated), with `chiralPart` as the fixture,
      because a symmetric fixture passes a mirror;
    - Generate stays at 0/90;
    - point at invariant 13's history.
  - **Invariant 13:** a one-line pointer to 44.
  - **Versioning section:** v7→v8 `trueTurnsToV8`, a per-board step, and its argument (wrong
    geometry).
  - **`CURRENT_VERSION`** 8 everywhere it is stated, including Status.
  - **"Where things live":**
    - `geometry.ts` (`axisFrame`, the helpers);
    - `turnFixtures.ts`;
    - `snapPoints.ts`. Its "LOCAL→WORLD IS position[axis] + local[...]" paragraph now reads
      `position[axis] + toWorldOffset(...)`.
  - **Status:** a paragraph for this round, "on branch, not merged". Rolling back past it strands v8
    files; export first.
  - **Rounds table:** a row with schema 8.
  - **Test counts:** updated.
- [ ] **Step 2: `docs/history.md`.** The round's entry at the top of "What each round did":
  - the repeated-parts decomposition into three rounds;
  - the finding that 90° was a mirror;
  - the rulings: true rotations plus migration, and `faceGrainKinds` needing no change;
  - any test the implementers reported as asserting the old mirror.
- [ ] **Step 3: `docs/follow-ups.md`.** Add **215**:
  - **The finding:** postures differ in handedness (flat and upright one way, on-edge the other), so
    a posture change mirrors a one-handed part's cuts, and the cut sheet's handedness convention is
    not established.
  - **The question to settle:** whether postures should become proper rotations of one frame.
  - **Number any residues** from 216.
- [ ] **Step 4: Commit.**

```bash
git add CLAUDE.md docs/history.md docs/follow-ups.md
git commit -m "docs: quarter turns round — invariant 44, schema 8, follow-up 215"
```
