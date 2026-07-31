# Sloyd Joinery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a board a list of rectangular through-cuts, so dados and rabbets can be modelled, rendered as real stock removal, and edited numerically.

**Architecture:** `Cut` is a part-local record on `Board` (named in `length`/`width`/`thickness`, never world axes). A new pure leaf module `src/document/cuts.ts` splits a board into a grid of cells, drops the cells inside any cut, and merges the survivors into axis-aligned sub-boxes; a second pure function derives edge segments from the same grid. `BoardMesh` draws one `BoxGeometry` per sub-box with parent-relative UVs, which is what keeps v3's grain layer intact — CSG would not.

**Tech Stack:** TypeScript, React 18, react-three-fiber / three, Zustand, Vitest + Testing Library, Vite.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-07-31-sloyd-joinery-design.md`. Where this plan and the spec disagree, that is a bug in the plan — stop and raise it, do not silently pick one (working agreement).
- **`CURRENT_VERSION` becomes 4.** Migration steps run on **raw board data, before `validateBoard`, one version at a time, in version order** (invariant 11).
- **`position` is the min-corner** of a board's world AABB, not its centre (invariant 2).
- **Cuts are part-local.** No function may express a cut in world axes. The only board→world mapping is `axisDimensions` in `src/document/geometry.ts`; do not write a second copy in the viewport (retired invariant 13).
- **`cuts` must NOT be added to `store.updateBoard`'s reorient predicate**, and **must** be covered by `boardUVSignature` (invariants 2 and 15). These pull in opposite directions and both are deliberate.
- **Every new numeric input in the panel is a `DimensionField`.** Do not write a bare `<input>` for a measurement — the dirty-guard and blur-resync of invariant 5 come from that component.
- **`npm test` does not typecheck.** `npm run build` is the typecheck gate and must pass before any task is called done.
- **No new dependencies.** No CSG library, no geometry library.
- **Commit style:** conventional prefix, imperative, and end the message with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Commit to a branch off `master`; **never open a pull request** (working agreement).
- **Existing suite is 334 tests, all passing.** A task that reduces the passing count without deleting a test on purpose has broken something.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/document/types.ts` | **Modify.** Add `Cut`, `CutFrom`, `Span`, `Region`; add `cuts` to `Board`. | 1 |
| `src/document/document.ts` | **Modify.** `CURRENT_VERSION` 4, `addCutsToV4`, `createBoard` default, cut validation. | 1, 2 |
| `src/document/cuts.ts` | **Create.** Pure: `cutRegion`, `positionAxis`, `wholeBoard`, `boardSolids`. | 3 |
| `src/document/cuts.test.ts` | **Create.** The weight of the testing. | 3, 4, 5 |
| `src/document/cuts.ts` (edges) | **Modify.** `boardEdges` from the same cell grid. | 4 |
| `src/document/cuts.ts` (world) | **Modify.** `solidWorldBox`, `cutLabel`. | 5 |
| `src/viewport/grainTiling.ts` | **Modify.** `FacePlan.tileInches`/`axes` replace `repeat`; `boardUVs(board, solid)`; `boardUVSignature` covers cuts. | 6 |
| `src/viewport/BoardMesh.tsx` | **Modify.** N solids, per-solid disposal/picking/highlight, edges from `boardEdges`. | 7 |
| `src/store/store.ts` | **Modify.** `addCut` / `updateCut` / `removeCut`. | 8 |
| `src/panels/Properties.tsx` | **Modify.** The Cuts section. | 9 |
| `CLAUDE.md`, `docs/follow-ups.md` | **Modify.** Invariants, status, follow-ups. | 10 |

---

## Task 1: The `Cut` type and schema 4

**Files:**
- Modify: `src/document/types.ts`
- Modify: `src/document/document.ts`
- Test: `src/document/document.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Cut`, `CutFrom`, `Span`, `Region` types; `Board.cuts: Cut[]`; `CURRENT_VERSION = 4`.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/document.test.ts`:

```ts
describe('schema 4 — cuts', () => {
  it('defaults cuts to [] on a new board', () => {
    expect(createBoard().cuts).toEqual([]);
  });

  it('gives a v3 file an empty cuts list', () => {
    const doc = migrateDocument({
      version: 3,
      name: 'Old',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [{
        id: 'a', name: 'Shelf', length: 24, width: 5.5, thickness: 0.75,
        position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length',
        material: 'pine',
      }],
    });
    expect(doc.version).toBe(4);
    expect(doc.boards[0].cuts).toEqual([]);
  });

  // The chain is the point: a v1 file must walk 1 -> 2 -> 3 -> 4, folding
  // 270 to 90 BEFORE it gains a posture, and gaining cuts last.
  it('walks a v1 file all the way to 4', () => {
    const doc = migrateDocument({
      version: 1,
      name: 'Ancient',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [{
        id: 'a', name: 'Leg', length: 30, width: 3, thickness: 3,
        position: [0, 0, 0], rotation: 270, standing: true, material: 'oak',
      }],
    });
    expect(doc.version).toBe(4);
    expect(doc.boards[0].rotation).toBe(90);
    expect(doc.boards[0].posture).toBe('on-edge');
    expect(doc.boards[0].grain).toBe('length');
    expect(doc.boards[0].cuts).toEqual([]);
  });

  it('preserves cuts already present in a v4 file', () => {
    const doc = migrateDocument({
      version: 4,
      name: 'New',
      units: { display: 'imperial-fractional', precision: 16 },
      boards: [{
        id: 'a', name: 'Side', length: 24, width: 5.5, thickness: 0.75,
        position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length',
        material: 'pine',
        cuts: [{ id: 'c1', face: 'thickness', from: 'max', across: 'width',
                 offset: 6, width: 0.75, depth: 0.25 }],
      }],
    });
    expect(doc.boards[0].cuts).toHaveLength(1);
    expect(doc.boards[0].cuts[0]).toMatchObject({ offset: 6, width: 0.75, depth: 0.25 });
  });

  it('rejects a file from a newer schema', () => {
    expect(() => migrateDocument({ version: 5, name: 'x', boards: [] }))
      .toThrow(/newer version/);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/document/document.test.ts`
Expected: FAIL — `cuts` is `undefined`, and `doc.version` is 3.

- [ ] **Step 3: Add the types**

In `src/document/types.ts`, after the `Grain` type:

```ts
/** Which end of a cut's `face` dimension the cut enters from. */
export type CutFrom = 'min' | 'max';

/**
 * A rectangular through-cut: stock removed from a board, running fully across
 * one of its dimensions. A dado is this cut taken in the middle of a face; a
 * rabbet is the same cut taken at an edge, so the distinction is derived from
 * the geometry (see cutLabel) rather than stored.
 *
 * Every field is part-local — named in length/width/thickness, never in world
 * axes — so a cut survives posture and rotation exactly the way `grain` does,
 * and so the numbers are already the ones you take to the bench.
 *
 * `face` and `across` name two of the three dimensions. The third — the
 * POSITION AXIS, which `offset` and `width` are measured along — is implied
 * rather than stored, so a cut cannot name the same dimension twice.
 */
export interface Cut {
  /** Unique within its board. */
  id: string;
  /** The dimension the cut goes into. 'thickness' is a dado in the broad face. */
  face: Dimension;
  /** Which end of `face` it enters from. */
  from: CutFrom;
  /** The dimension it runs fully across. Always differs from `face`. */
  across: Dimension;
  /** Where the cut starts along the implied position axis, in inches. */
  offset: number;
  /** How wide the cut is along that axis, in inches. */
  width: number;
  /** How far into `face` it goes, in inches. */
  depth: number;
}

/** An inclusive [min, max] interval, in inches. */
export type Span = [number, number];

/**
 * An axis-aligned box in a board's own coordinate space, keyed by dimension
 * rather than by axis index — there is no world here, and keying by dimension
 * is what stops the two from being confused.
 */
export type Region = Record<Dimension, Span>;
```

Add `cuts` to `Board`, after `material`:

```ts
  /** Stock removed from this board. Empty for a board with no joinery. */
  cuts: Cut[];
```

- [ ] **Step 4: Bump the version, default the field, add the migration step**

In `src/document/document.ts`:

```ts
export const CURRENT_VERSION = 4;
```

In `createBoard`, after `material: DEFAULT_MATERIAL,`:

```ts
    cuts: [],
```

Add the migration step next to `addPostureToV3`:

```ts
/**
 * v3 -> v4: boards gained a list of cuts.
 *
 * The mildest step in the chain — the default is empty and validateBoard's
 * fallback would be the same empty array — but it runs in the same place as
 * the other two on purpose. The chain's value is that every step has one
 * shape, so the next step that DOES have a divergent fallback inherits the
 * correct structure instead of relying on its author noticing. See invariant 11.
 */
function addCutsToV4(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const b = raw as Record<string, unknown>;
  return Array.isArray(b.cuts) ? raw : { ...b, cuts: [] };
}
```

Extend the chain in `migrateDocument`:

```ts
  if (d.version < 4) rawBoards = rawBoards.map(addCutsToV4);
```

In `validateBoard`, add to the returned object (full validation lands in Task 2):

```ts
    cuts: Array.isArray(b.cuts) ? (b.cuts as Cut[]) : [],
```

and import the `Cut` type at the top of the file:

```ts
import type { Board, Cut, Rotation, Posture, Grain, SloydDocument } from './types';
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/document/document.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the whole suite and the typecheck gate**

Run: `npm test && npm run build`
Expected: all tests pass, `tsc -b` clean. Fixture boards in other test files may now be missing `cuts` — add `cuts: []` to any that `tsc` flags, and do not reach for a type assertion instead.

- [ ] **Step 7: Commit**

```bash
git add src/document/types.ts src/document/document.ts src/document/document.test.ts
git commit -m "feat: add the Cut type and schema 4

Cuts are part-local — face/from/across/offset/width/depth, named in
length/width/thickness — so they survive posture and rotation the way
grain does. The position axis is implied rather than stored, so a cut
cannot name the same dimension twice.

addCutsToV4 runs on raw board data before validateBoard, extending the
chain to 1->2->3->4 (invariant 11).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Cut validation — clamp on load, drop what cannot be clamped

**Files:**
- Modify: `src/document/document.ts`
- Test: `src/document/document.test.ts`

**Interfaces:**
- Consumes: `Cut`, `Region`, `Board.cuts` from Task 1.
- Produces: `validateBoard` now returns only cuts that fit the board, with unique ids. `positionAxisOf(face: Dimension, across: Dimension): Dimension` is added to **`src/document/geometry.ts`**, not to `document.ts`.

**Why `positionAxisOf` goes in `geometry.ts`:** `document.ts` re-exports from `cuts.ts`, and `cuts.ts` needs `positionAxisOf`. Defining it in `document.ts` would make the two import each other. `geometry.ts` is already the leaf both sit above, and already owns `DIMENSION_ORDER`, which this is derived from.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/document.test.ts`:

```ts
describe('cut validation', () => {
  const load = (cuts: unknown[]) => migrateDocument({
    version: 4,
    name: 'x',
    units: { display: 'imperial-fractional', precision: 16 },
    boards: [{
      id: 'a', name: 'Side', length: 24, width: 5.5, thickness: 0.75,
      position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length',
      material: 'pine', cuts,
    }],
  }).boards[0].cuts;

  const dado = (over: Partial<Cut> = {}): Cut => ({
    id: 'c1', face: 'thickness', from: 'max', across: 'width',
    offset: 6, width: 0.75, depth: 0.25, ...over,
  });

  it('keeps a cut that fits', () => {
    expect(load([dado()])).toEqual([dado()]);
  });

  // Clamp order is stated in the spec because the two orders disagree:
  // offset first into [0, dim], then width into [0, dim - offset].
  it('clamps offset, then width, in that order', () => {
    // Position axis is length (24). offset 30 clamps to 24, leaving no room,
    // so width clamps to 0 and the cut is dropped.
    expect(load([dado({ offset: 30, width: 4 })])).toEqual([]);
    // offset 22 clamps to itself; width 4 clamps to 2.
    expect(load([dado({ offset: 22, width: 4 })])[0]).toMatchObject({ offset: 22, width: 2 });
  });

  it('clamps depth to the face dimension', () => {
    expect(load([dado({ depth: 3 })])[0].depth).toBe(0.75);
  });

  it('drops a cut with a non-positive width or depth', () => {
    expect(load([dado({ width: 0 })])).toEqual([]);
    expect(load([dado({ depth: -1 })])).toEqual([]);
  });

  it('drops a cut whose across equals its face', () => {
    expect(load([dado({ across: 'thickness' })])).toEqual([]);
  });

  // A cut at full depth, full width, spanning its across axis leaves
  // boardSolids with nothing to return: a board that renders nothing, cannot
  // be clicked, and still sits in the parts list. There is no nearest legal
  // cut to clamp to, so this is the one case a drop beats a clamp.
  it('drops a cut that would remove all the stock', () => {
    expect(load([dado({ offset: 0, width: 24, depth: 0.75 })])).toEqual([]);
  });

  it('keeps a cut that severs the board but leaves stock', () => {
    const kept = load([dado({ offset: 6, width: 0.75, depth: 0.75 })]);
    expect(kept).toHaveLength(1);
    expect(kept[0].depth).toBe(0.75);
  });

  it('drops malformed cuts without throwing', () => {
    expect(load([null, 'nope', {}, dado({ face: 'sideways' as never })])).toEqual([]);
  });

  it('re-mints duplicate and missing ids', () => {
    const kept = load([dado({ id: 'same' }), dado({ id: 'same', offset: 10 })]);
    expect(kept).toHaveLength(2);
    expect(kept[0].id).not.toBe(kept[1].id);
  });
});
```

Add `Cut` to the file's imports from `./document`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/document/document.test.ts -t "cut validation"`
Expected: FAIL — cuts currently pass through unvalidated.

- [ ] **Step 3: Implement the validation**

First, in `src/document/geometry.ts`, next to `DIMENSION_ORDER`:

```ts
/**
 * The dimension a cut's offset and width are measured along: the one that is
 * neither cut into nor run across. Implied rather than stored — see the Cut
 * doc comment — so this is the single place it is worked out.
 *
 * It lives here rather than in document.ts because cuts.ts needs it and
 * document.ts re-exports cuts.ts; geometry.ts is the leaf both sit above.
 */
export function positionAxisOf(face: Dimension, across: Dimension): Dimension {
  return DIMENSION_ORDER.find((d) => d !== face && d !== across)!;
}
```

and add `positionAxisOf` to the `./geometry` re-export line in `document.ts`.

Then in `src/document/document.ts`, add above `validateBoard` (importing `positionAxisOf` from `./geometry`):

```ts
const VALID_DIMENSIONS: Dimension[] = ['length', 'width', 'thickness'];
const VALID_FROMS: CutFrom[] = ['min', 'max'];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Cuts that fit the board, with unique ids.
 *
 * Clamps rather than rejects, because a saved document must always open and a
 * board whose length was later shrunk below an existing cut is a real case,
 * not a corrupt file. The panel is the half that refuses bad entry (see
 * Properties.tsx); this half brings an existing cut back inside the board.
 *
 * The clamp ORDER is load-bearing: offset into [0, dim] first, then width into
 * [0, dim - offset]. The other order gives different results for a cut that
 * starts past the end.
 *
 * Three things are dropped rather than clamped: a cut with nothing left after
 * clamping, a cut whose `across` is its own `face` (unrepresentable through
 * the panel, reachable in a hand-edited file), and a cut that would remove ALL
 * the stock — there is no nearest legal cut for that one, and a board coming
 * back whole is unmistakable where a board coming back invisible is not.
 */
function validateCuts(raw: unknown, board: Omit<Board, 'cuts'>): Cut[] {
  if (!Array.isArray(raw)) return [];
  const out: Cut[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const c = item as Record<string, unknown>;

    const face = c.face as Dimension;
    const across = c.across as Dimension;
    if (!VALID_DIMENSIONS.includes(face) || !VALID_DIMENSIONS.includes(across)) continue;
    if (face === across) continue;
    if (!VALID_FROMS.includes(c.from as CutFrom)) continue;
    if (!['offset', 'width', 'depth'].every(
      (k) => typeof c[k] === 'number' && Number.isFinite(c[k]),
    )) continue;

    const posDim = board[positionAxisOf(face, across)];
    const faceDim = board[face];

    const offset = clamp(c.offset as number, 0, posDim);
    const width = clamp(c.width as number, 0, posDim - offset);
    const depth = clamp(c.depth as number, 0, faceDim);
    if (width <= 0 || depth <= 0) continue;

    // Full depth AND the full position axis, with `across` always spanning
    // fully, means nothing survives.
    if (depth === faceDim && offset === 0 && width === posDim) continue;

    const id = typeof c.id === 'string' && c.id && !seen.has(c.id) ? c.id : nextId();
    seen.add(id);
    out.push({ id, face, from: c.from as CutFrom, across, offset, width, depth });
  }
  return out;
}
```

Import `CutFrom` and `Dimension` alongside `Cut` at the top of the file.

In `validateBoard`, replace the pass-through `cuts:` line. The cut clamps need the board's dimensions, so build the board first and attach cuts to it:

```ts
  const board: Omit<Board, 'cuts'> = {
    id: typeof b.id === 'string' && b.id ? b.id : nextId(),
    name: name || 'Board',
    length: b.length as number,
    width: b.width as number,
    thickness: b.thickness as number,
    position: [pos[0], pos[1], pos[2]] as [number, number, number],
    rotation,
    posture: VALID_POSTURES.includes(b.posture as Posture)
      ? (b.posture as Posture)
      : 'flat',
    grain: normalizedGrain,
    material,
  };
  return { ...board, cuts: validateCuts(b.cuts, board) };
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/document/document.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the whole suite and the typecheck gate**

Run: `npm test && npm run build`
Expected: green, `tsc -b` clean.

- [ ] **Step 6: Commit**

```bash
git add src/document/document.ts src/document/document.test.ts
git commit -m "feat: validate cuts on load — clamp what fits, drop what cannot

Clamps offset then width (the order matters), and depth to the face
dimension, so a board shrunk below an existing cut still opens. Drops
only what has no nearest legal value: an empty cut, across == face, and
a cut that would remove all the stock and leave an invisible unclickable
board in the parts list.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `boardSolids` — split, drop, merge

**Files:**
- Create: `src/document/cuts.ts`
- Create: `src/document/cuts.test.ts`
- Modify: `src/document/document.ts` (re-export)

**Interfaces:**
- Consumes: `Cut`, `Region`, `Span`, `Dimension` (Task 1); `positionAxisOf` (Task 2); `DIMENSION_ORDER` from `./geometry`.
- Produces:
  - `wholeBoard(board: Board): Region`
  - `cutRegion(board: Board, cut: Cut): Region`
  - `boardSolids(board: Board): Region[]`
  - internal `grid(board)` → `{ coords: Record<Dimension, number[]>, filled: boolean[][][] }`, consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Create `src/document/cuts.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { boardSolids, cutRegion, wholeBoard } from './cuts';
import type { Board, Cut, Region } from './types';

/** A 24 x 5-1/2 x 3/4 flat board with whatever cuts are given. */
const withCuts = (cuts: Cut[]): Board => createBoard({ cuts });

/** The canonical case: a 3/4in dado, 1/4in deep, 6in along, across the width. */
const DADO: Cut = {
  id: 'c1', face: 'thickness', from: 'max', across: 'width',
  offset: 6, width: 0.75, depth: 0.25,
};

const volume = (r: Region) =>
  (r.length[1] - r.length[0]) * (r.width[1] - r.width[0]) * (r.thickness[1] - r.thickness[0]);

const totalVolume = (solids: Region[]) => solids.reduce((sum, r) => sum + volume(r), 0);

describe('cutRegion', () => {
  it('spans the across axis fully and sits where offset/width say', () => {
    const board = withCuts([DADO]);
    expect(cutRegion(board, DADO)).toEqual({
      length: [6, 6.75],
      width: [0, 5.5],
      thickness: [0.5, 0.75],
    });
  });

  it('enters from the min end when from is min', () => {
    const cut = { ...DADO, from: 'min' as const };
    expect(cutRegion(withCuts([cut]), cut).thickness).toEqual([0, 0.25]);
  });
});

describe('boardSolids', () => {
  // The guarantee that joinery costs nothing for boards that do not use it.
  it('returns exactly one solid, the whole board, when there are no cuts', () => {
    const board = createBoard();
    expect(boardSolids(board)).toEqual([wholeBoard(board)]);
  });

  it('leaves three solids for a dado in the middle of a face', () => {
    const solids = boardSolids(withCuts([DADO]));
    expect(solids).toHaveLength(3);
    expect(totalVolume(solids)).toBeCloseTo(24 * 5.5 * 0.75 - 0.75 * 5.5 * 0.25, 10);
  });

  it('leaves two solids for a rabbet at the end', () => {
    const rabbet: Cut = { ...DADO, offset: 0, width: 0.75 };
    expect(boardSolids(withCuts([rabbet]))).toHaveLength(2);
  });

  // The test that would catch double-removal: the union is subtracted, so
  // overlapped stock goes once. Sum-of-volumes would remove 2 x 0.75 x 5.5 x
  // 0.25 here; the union removes 1.25 x 5.5 x 0.25.
  it('subtracts overlapping cuts as a union, not as a sum', () => {
    const a: Cut = { ...DADO, id: 'a', offset: 6, width: 0.75 };
    const b: Cut = { ...DADO, id: 'b', offset: 6.5, width: 0.75 };
    const solids = boardSolids(withCuts([a, b]));
    expect(totalVolume(solids)).toBeCloseTo(24 * 5.5 * 0.75 - 1.25 * 5.5 * 0.25, 10);
  });

  it('leaves two disconnected solids for a cut at full depth', () => {
    const rip: Cut = { ...DADO, depth: 0.75 };
    const solids = boardSolids(withCuts([rip]));
    expect(solids).toHaveLength(2);
    expect(totalVolume(solids)).toBeCloseTo(24 * 5.5 * 0.75 - 0.75 * 5.5 * 0.75, 10);
  });

  it('is deterministic — the same board yields the same solids in the same order', () => {
    const board = withCuts([DADO, { ...DADO, id: 'c2', offset: 18 }]);
    expect(boardSolids(board)).toEqual(boardSolids(board));
  });

  it('handles cuts on different faces at once', () => {
    const across: Cut = {
      id: 'c2', face: 'width', from: 'min', across: 'thickness',
      offset: 2, width: 0.5, depth: 1,
    };
    const solids = boardSolids(withCuts([DADO, across]));
    expect(solids.length).toBeGreaterThan(3);
    // No solid may overlap either cut.
    for (const s of solids) {
      expect(s.thickness[0]).toBeGreaterThanOrEqual(0);
      expect(volume(s)).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: FAIL — `Cannot find module './cuts'`.

- [ ] **Step 3: Write `cuts.ts`**

Create `src/document/cuts.ts`:

```ts
import type { Board, Cut, Dimension, Region, Span } from './types';
import { DIMENSION_ORDER, positionAxisOf } from './geometry';

/** The board itself, uncut. */
export function wholeBoard(board: Board): Region {
  return {
    length: [0, board.length],
    width: [0, board.width],
    thickness: [0, board.thickness],
  };
}

/**
 * The box a cut removes, in the board's own coordinate space.
 *
 * A cut spans its `across` axis fully (that is what makes it a through-cut),
 * sits at [offset, offset + width] on the implied position axis, and reaches
 * `depth` into `face` from whichever end `from` names. This is the only place
 * `from` is consumed — everything downstream reads the region, not the cut.
 */
export function cutRegion(board: Board, cut: Cut): Region {
  const pos = positionAxisOf(cut.face, cut.across);
  const faceDim = board[cut.face];
  const region = {} as Region;
  region[cut.across] = [0, board[cut.across]];
  region[pos] = [cut.offset, cut.offset + cut.width];
  region[cut.face] = cut.from === 'min'
    ? [0, cut.depth]
    : [faceDim - cut.depth, faceDim];
  return region;
}

interface Grid {
  /** Sorted, deduplicated split planes per dimension, always including 0 and the dimension. */
  coords: Record<Dimension, number[]>;
  /** filled[i][j][k] for the cell between coords along length, width, thickness. */
  filled: boolean[][][];
}

/**
 * The board divided at every cut boundary, with the cells inside any cut
 * removed.
 *
 * Exact, because every cut and every board is axis-aligned. Splitting at every
 * boundary first is what makes the centre test in step two sound: no cell can
 * straddle a cut edge, so a cell is either wholly in or wholly out.
 *
 * Subtracting the UNION is the whole of overlap handling — stock covered by
 * two cuts is removed once, never twice, and there is no pairwise intersection
 * case to get wrong.
 *
 * Shared by boardSolids and boardEdges, which is why it is computed here once
 * rather than in each.
 */
function grid(board: Board): Grid {
  const regions = board.cuts.map((c) => cutRegion(board, c));

  const coords = {} as Record<Dimension, number[]>;
  for (const d of DIMENSION_ORDER) {
    const set = new Set<number>([0, board[d]]);
    for (const r of regions) {
      for (const v of r[d]) {
        if (v > 0 && v < board[d]) set.add(v);
      }
    }
    coords[d] = [...set].sort((a, b) => a - b);
  }

  const inside = (r: Region, p: Record<Dimension, number>) =>
    DIMENSION_ORDER.every((d) => p[d] > r[d][0] && p[d] < r[d][1]);

  const mid = (d: Dimension, i: number) => (coords[d][i] + coords[d][i + 1]) / 2;

  const filled: boolean[][][] = [];
  for (let i = 0; i < coords.length.length - 1; i += 1) {
    const plane: boolean[][] = [];
    for (let j = 0; j < coords.width.length - 1; j += 1) {
      const row: boolean[] = [];
      for (let k = 0; k < coords.thickness.length - 1; k += 1) {
        const centre = { length: mid('length', i), width: mid('width', j), thickness: mid('thickness', k) };
        row.push(!regions.some((r) => inside(r, centre)));
      }
      plane.push(row);
    }
    filled.push(plane);
  }
  return { coords, filled };
}

/** The cell at (i, j, k) as a Region. */
function cellRegion(coords: Grid['coords'], i: number, j: number, k: number): Region {
  return {
    length: [coords.length[i], coords.length[i + 1]] as Span,
    width: [coords.width[j], coords.width[j + 1]] as Span,
    thickness: [coords.thickness[k], coords.thickness[k + 1]] as Span,
  };
}

/**
 * Merge every pair of solids that touch along `axis` and match exactly on the
 * other two dimensions.
 *
 * Sorting by the other two spans first, then by the axis min, puts every
 * mergeable pair next to each other, so one sweep reaches the fixpoint. That
 * is also what makes the output deterministic, which matters because the
 * viewport builds one geometry per solid and React keys them by index.
 */
function mergeAlong(solids: Region[], axis: Dimension): Region[] {
  const others = DIMENSION_ORDER.filter((d) => d !== axis);
  const key = (r: Region) => others.map((d) => `${r[d][0]}:${r[d][1]}`).join('|');
  const sorted = [...solids].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a[axis][0] - b[axis][0];
  });

  const out: Region[] = [];
  for (const solid of sorted) {
    const last = out[out.length - 1];
    if (last && key(last) === key(solid) && last[axis][1] === solid[axis][0]) {
      out[out.length - 1] = { ...last, [axis]: [last[axis][0], solid[axis][1]] as Span };
    } else {
      out.push(solid);
    }
  }
  return out;
}

/**
 * A board as a small set of axis-aligned boxes with its cuts removed.
 *
 * A board with no cuts comes out as exactly one solid whose extents are the
 * board's own — that is what guarantees joinery costs nothing at all for the
 * boards that do not use it.
 *
 * Merging is a solid-count and draw-call reduction only. It does NOT make the
 * result seam-free: the remainder around a dado is L-shaped in section and an
 * L is not a box. Edge lines therefore come from boardEdges, not from these
 * solids.
 */
export function boardSolids(board: Board): Region[] {
  if (board.cuts.length === 0) return [wholeBoard(board)];

  const { coords, filled } = grid(board);
  let solids: Region[] = [];
  for (let i = 0; i < filled.length; i += 1) {
    for (let j = 0; j < filled[i].length; j += 1) {
      for (let k = 0; k < filled[i][j].length; k += 1) {
        if (filled[i][j][k]) solids.push(cellRegion(coords, i, j, k));
      }
    }
  }
  for (const axis of DIMENSION_ORDER) solids = mergeAlong(solids, axis);
  return solids;
}
```

Note the awkward-looking `coords.length.length` — `coords` is keyed by dimension, and one of the dimensions is called `length`, so that reads "the number of split planes along the board's length". It is correct; do not rename it to something that hides the collision.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: PASS. If the three-solid test fails with a different count, print the solids — the likely cause is a merge order other than `DIMENSION_ORDER`.

- [ ] **Step 5: Re-export from the document barrel**

In `src/document/document.ts`, next to the other re-exports:

```ts
export { boardSolids, cutRegion, wholeBoard } from './cuts';
```

- [ ] **Step 6: Run the whole suite and the typecheck gate**

Run: `npm test && npm run build`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add src/document/cuts.ts src/document/cuts.test.ts src/document/document.ts
git commit -m "feat: decompose a cut board into axis-aligned solids

Split at every cut boundary, drop cells whose centre is inside any cut,
merge the survivors. Splitting first is what makes the centre test
sound, and dropping against the union is the whole of overlap handling
— overlapped stock is removed once, with no pairwise intersection case.

A board with no cuts comes out as exactly one solid matching its own
extents, which is what makes joinery free for boards that do not use it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `boardEdges` — edges from the grid, not from the solids

**Files:**
- Modify: `src/document/cuts.ts`
- Test: `src/document/cuts.test.ts`

**Interfaces:**
- Consumes: internal `grid(board)` from Task 3.
- Produces: `boardEdges(board: Board): Segment[]`, where
  `type Point = Record<Dimension, number>` and `type Segment = [Point, Point]`.

**Why this task exists:** per-solid `EdgesGeometry` draws lines that correspond to nothing. The canonical dado leaves three solids covering a *continuous* bottom face, so lines appear across it at 6 and 6.75. Merging cannot fix that — the remainder is L-shaped and an L is not a box.

- [ ] **Step 1: Write the failing tests**

Append to `src/document/cuts.test.ts`:

```ts
describe('boardEdges', () => {
  it('gives an uncut board exactly the twelve edges of its box', () => {
    expect(boardEdges(createBoard())).toHaveLength(12);
  });

  /** Segments that lie in the plane `d === value`, ignoring direction. */
  const inPlane = (segs: ReturnType<typeof boardEdges>, d: Dimension, value: number) =>
    segs.filter(([a, b]) => a[d] === value && b[d] === value);

  // The whole reason this function exists. The bottom face (thickness 0) is
  // continuous stock under the dado, but it is covered by three abutting
  // solids — per-solid edges would draw lines across it at length 6 and 6.75.
  it('draws no line across the uncut face beneath a dado', () => {
    const segs = inPlane(boardEdges(withCuts([DADO])), 'thickness', 0);
    // Only the four edges of the bottom face itself.
    expect(segs).toHaveLength(4);
    expect(segs.some(([a, b]) => a.length === 6 && b.length === 6)).toBe(false);
    expect(segs.some(([a, b]) => a.length === 6.75 && b.length === 6.75)).toBe(false);
  });

  it('draws the shoulders and floor of a dado', () => {
    const segs = boardEdges(withCuts([DADO]));
    // Both shoulders: a concave edge at the dado floor, running across width.
    const shoulders = segs.filter(
      ([a, b]) => a.thickness === 0.5 && b.thickness === 0.5 &&
                  a.length === b.length && (a.length === 6 || a.length === 6.75),
    );
    expect(shoulders).toHaveLength(2);
    // And the top face is now interrupted: it has more than its own four edges.
    expect(inPlane(segs, 'thickness', 0.75).length).toBeGreaterThan(4);
  });

  it('is deterministic', () => {
    const board = withCuts([DADO]);
    expect(boardEdges(board)).toEqual(boardEdges(board));
  });
});
```

Add `boardEdges` to the import from `./cuts` and `Dimension` to the type import.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/document/cuts.test.ts -t boardEdges`
Expected: FAIL — `boardEdges is not a function`.

- [ ] **Step 3: Implement `boardEdges`**

Append to `src/document/cuts.ts`:

```ts
/** A point in a board's own coordinate space. */
export type Point = Record<Dimension, number>;
/** A straight edge between two such points. */
export type Segment = [Point, Point];

/**
 * The edges of a cut board, derived from the cell grid rather than from the
 * solids.
 *
 * Per-solid EdgesGeometry is wrong, not merely wasteful: the remainder around
 * a dado is L-shaped in section, an L is not a box, and so the board's uncut
 * bottom face ends up covered by three abutting solids with seams drawn across
 * it. BoardMesh's own comment calls edge lines "the single biggest readability
 * win", so those phantom lines are a legibility bug.
 *
 * For every candidate segment — one cell long, on a grid line — look at the up
 * to four cells around it and draw it unless the local configuration is flat:
 *
 *   all four filled      no  (interior stock)
 *   none filled          no  (empty)
 *   two, sharing a face  no  (a flat face continuing through)
 *   two, diagonal        yes
 *   one, or three        yes
 *
 * Cells outside the board count as empty, which is what makes the board's own
 * silhouette fall out of the same rule instead of needing its own pass. Three
 * filled is the concave shoulder of a dado; one filled is a convex corner.
 */
export function boardEdges(board: Board): Segment[] {
  const { coords, filled } = grid(board);
  const counts: Record<Dimension, number> = {
    length: coords.length.length - 1,
    width: coords.width.length - 1,
    thickness: coords.thickness.length - 1,
  };

  const at = (cell: Record<Dimension, number>): boolean => {
    for (const d of DIMENSION_ORDER) {
      if (cell[d] < 0 || cell[d] >= counts[d]) return false;
    }
    return filled[cell.length][cell.width][cell.thickness];
  };

  const out: Segment[] = [];
  for (const along of DIMENSION_ORDER) {
    const [p, q] = DIMENSION_ORDER.filter((d) => d !== along);
    for (let i = 0; i < counts[along]; i += 1) {
      for (let bp = 0; bp < coords[p].length; bp += 1) {
        for (let bq = 0; bq < coords[q].length; bq += 1) {
          // The four cells sharing this grid line, indexed by which side of
          // bp and bq they sit on.
          const quad = [[bp - 1, bq - 1], [bp - 1, bq], [bp, bq - 1], [bp, bq]];
          const on = quad.filter(([cp, cq]) =>
            at({ [along]: i, [p]: cp, [q]: cq } as unknown as Record<Dimension, number>),
          );
          if (on.length === 0 || on.length === 4) continue;
          // Two cells that differ on only one axis share a face, so the
          // surface runs straight through and there is no edge here.
          if (on.length === 2 && (on[0][0] === on[1][0] || on[0][1] === on[1][1])) continue;

          const base = { [p]: coords[p][bp], [q]: coords[q][bq] } as unknown as Point;
          out.push([
            { ...base, [along]: coords[along][i] } as Point,
            { ...base, [along]: coords[along][i + 1] } as Point,
          ]);
        }
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: PASS, including the twelve-edge case for an uncut board.

- [ ] **Step 5: Re-export and run the gates**

Add `boardEdges` (and the `Point`/`Segment` types) to the `./cuts` re-export line in `document.ts`, then:

Run: `npm test && npm run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/document/cuts.ts src/document/cuts.test.ts src/document/document.ts
git commit -m "feat: derive edge lines from the cell grid

Per-solid EdgesGeometry draws seams across faces that are continuous
stock — the remainder around a dado is L-shaped, and an L is not a box,
so three abutting solids cover an uncut bottom face. A local
flat-configuration test on the four cells around each candidate segment
gets the silhouette, the convex corners and the concave shoulders from
one rule, with cells outside the board counting as empty.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: World mapping and the dado/rabbet label

**Files:**
- Modify: `src/document/cuts.ts`
- Test: `src/document/cuts.test.ts`

**Interfaces:**
- Consumes: `axisDimensions`, `boardExtents` from `./geometry`; `Region`, `Point` from Tasks 1 and 4.
- Produces:
  - `solidWorldBox(board, solid): { center: [number, number, number]; size: [number, number, number] }` — **centre relative to the board's own centre**, which is what the viewport's `<group position={boardCenter(board)}>` wants.
  - `pointToLocalXYZ(board, point): [number, number, number]` — same frame, for edge segments.
  - `cutLabel(board, cut): 'dado' | 'rabbet'`

- [ ] **Step 1: Write the failing tests**

Append to `src/document/cuts.test.ts`:

```ts
describe('solidWorldBox', () => {
  it('places an uncut board at its own centre', () => {
    const board = createBoard();
    const box = solidWorldBox(board, wholeBoard(board));
    expect(box.center).toEqual([0, 0, 0]);
    // Flat, 0 degrees: X = length, Y = thickness, Z = width.
    expect(box.size).toEqual([24, 0.75, 5.5]);
  });

  it('offsets a sub-box from the board centre', () => {
    const board = withCuts([DADO]);
    const half = solidWorldBox(board, {
      length: [0, 12], width: [0, 5.5], thickness: [0, 0.75],
    });
    expect(half.size).toEqual([12, 0.75, 5.5]);
    expect(half.center).toEqual([-6, 0, 0]);
  });

  it('follows posture — an upright board puts length on Y', () => {
    const board = createBoard({ posture: 'upright' });
    expect(solidWorldBox(board, wholeBoard(board)).size).toEqual([5.5, 24, 0.75]);
  });
});

describe('cutLabel', () => {
  it('calls a cut in the middle of a face a dado', () => {
    expect(cutLabel(withCuts([DADO]), DADO)).toBe('dado');
  });

  it('calls a cut flush with either end a rabbet', () => {
    const atStart = { ...DADO, offset: 0 };
    const atEnd = { ...DADO, offset: 24 - 0.75 };
    expect(cutLabel(withCuts([atStart]), atStart)).toBe('rabbet');
    expect(cutLabel(withCuts([atEnd]), atEnd)).toBe('rabbet');
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/document/cuts.test.ts -t solidWorldBox`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement**

Append to `src/document/cuts.ts` (add `axisDimensions, boardExtents` to the `./geometry` import):

```ts
/**
 * A solid as the viewport wants it: size along [X, Y, Z], and a centre
 * expressed RELATIVE TO THE BOARD'S OWN CENTRE, because BoardMesh puts a
 * <group> at boardCenter(board) and hangs every solid inside it.
 *
 * The board→world mapping is axisDimensions and nothing else. A board's own
 * coordinate space runs from 0 to its dimension on each axis, and `position`
 * is the min-corner, so a local coordinate maps to the world by adding the
 * corner — which relative to the centre is just "minus half the extent".
 */
export function solidWorldBox(
  board: Board,
  solid: Region,
): { center: [number, number, number]; size: [number, number, number] } {
  const dims = axisDimensions(board);
  const extents = boardExtents(board);
  const size = dims.map((d) => solid[d][1] - solid[d][0]) as [number, number, number];
  const center = dims.map(
    (d, axis) => (solid[d][0] + solid[d][1]) / 2 - extents[axis] / 2,
  ) as [number, number, number];
  return { center, size };
}

/** A point in the board's space, in the same board-centred frame. */
export function pointToLocalXYZ(board: Board, point: Point): [number, number, number] {
  const dims = axisDimensions(board);
  const extents = boardExtents(board);
  return dims.map((d, axis) => point[d] - extents[axis] / 2) as [number, number, number];
}

/**
 * What a cut is called. Derived from the geometry rather than stored, so the
 * label can never disagree with the cut: a rabbet is the same removal as a
 * dado, taken flush with one end of the position axis.
 */
export function cutLabel(board: Board, cut: Cut): 'dado' | 'rabbet' {
  const pos = positionAxisOf(cut.face, cut.across);
  const flush = cut.offset === 0 || cut.offset + cut.width === board[pos];
  return flush ? 'rabbet' : 'dado';
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/document/cuts.test.ts`
Expected: PASS.

- [ ] **Step 5: Re-export and run the gates**

Add `solidWorldBox, pointToLocalXYZ, cutLabel` to the `./cuts` re-export in `document.ts`, then run `npm test && npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/document/cuts.ts src/document/cuts.test.ts src/document/document.ts
git commit -m "feat: map solids and cut points into the board-centred frame

Mapping goes through axisDimensions and nowhere else, so there is still
one source for board-to-world and no viewport copy to drift (the reason
invariant 13 was retired). Centres come out relative to boardCenter,
which is where BoardMesh's group already sits.

cutLabel derives dado-vs-rabbet from the geometry so the label cannot
disagree with the cut.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: UVs for a sub-box, and the signature that covers cuts

**Files:**
- Modify: `src/viewport/grainTiling.ts`
- Test: `src/viewport/grainTiling.test.ts`

**Interfaces:**
- Consumes: `Region`, `wholeBoard` (Tasks 1, 3).
- Produces: `boardUVs(board: Board, solid?: Region): Float32Array` (default = the whole board, so every existing call site is unchanged); `FacePlan` gains `axes: [Axis, Axis]` and `tileInches: [number, number]`, **replacing** `repeat`; `boardUVSignature` covers `cuts`.

**The rule this task exists to get right:** `FIT` means *show the whole tile on this axis*, and **the tile belongs to the board, not to the solid.** Fitting plywood's ply stack into the floor block under a ¼" dado would squeeze all five plies into the stock that survived the cut, when the correct picture is the plies the cut left behind. Resolve `FIT` against the board's dimension first; take the solid's sub-range out of that mapping.

- [ ] **Step 1: Write the failing tests**

Append to `src/viewport/grainTiling.test.ts`:

```ts
describe('boardUVs for a sub-box', () => {
  const board = createBoard({ cuts: [] });

  it('is unchanged for the whole board', () => {
    expect(boardUVs(board, wholeBoard(board))).toEqual(boardUVs(board));
  });

  // Parent-relative is the whole point: the figure runs continuously across a
  // dado instead of restarting at it, which is what makes the cut read as
  // stock removed from one board rather than two boards pushed together.
  it('maps a sub-box into the parent UV range, not into its own', () => {
    const half: Region = { length: [12, 24], width: [0, 5.5], thickness: [0, 0.75] };
    const whole = boardUVs(board);
    const sub = boardUVs(board, half);
    // Some u in the far half must land beyond the midpoint of the board's
    // whole-face u range — a self-relative mapping would restart at the offset.
    const maxWhole = Math.max(...whole);
    const maxSub = Math.max(...sub);
    expect(maxSub).toBeCloseTo(maxWhole, 6);
    expect(Math.min(...sub)).toBeGreaterThan(Math.min(...whole));
  });

  // FIT resolves against the BOARD's dimension, then the sub-range is taken
  // from that mapping. Fitting to the solid would squeeze the whole ply stack
  // into what survived the cut.
  it('resolves FIT against the board, so a dado floor shows the surviving plies', () => {
    const ply = createBoard({ material: 'plywood', cuts: [] });
    const floor: Region = { length: [0, 24], width: [0, 5.5], thickness: [0, 0.5] };
    const uvs = boardUVs(ply, floor);
    const wholeUvs = boardUVs(ply);
    // On the FIT axis the whole board spans 0..1; two thirds of the stock
    // spans 0..2/3, not 0..1.
    expect(Math.max(...uvs)).toBeLessThan(Math.max(...wholeUvs) + 1e-9);
    expect(uvs).not.toEqual(wholeUvs);
  });
});

describe('boardUVSignature', () => {
  it('changes when a cut is added', () => {
    const plain = createBoard();
    const cut = { ...plain, cuts: [{
      id: 'c1', face: 'thickness' as const, from: 'max' as const,
      across: 'width' as const, offset: 6, width: 0.75, depth: 0.25,
    }] };
    expect(boardUVSignature(cut)).not.toBe(boardUVSignature(plain));
  });

  it('changes when a cut moves', () => {
    const a = createBoard({ cuts: [{
      id: 'c1', face: 'thickness', from: 'max', across: 'width',
      offset: 6, width: 0.75, depth: 0.25,
    }] });
    const b = { ...a, cuts: [{ ...a.cuts[0], offset: 12 }] };
    expect(boardUVSignature(b)).not.toBe(boardUVSignature(a));
  });

  // Deliberately excluded: a board being dragged must not rebuild its
  // geometry every frame.
  it('ignores position and name', () => {
    const a = createBoard();
    expect(boardUVSignature({ ...a, position: [9, 9, 9], name: 'Other' }))
      .toBe(boardUVSignature(a));
  });
});
```

Import `wholeBoard` and the `Region` type from `../document/document`.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/viewport/grainTiling.test.ts`
Expected: FAIL — `boardUVs` takes one argument; the signature ignores cuts.

- [ ] **Step 3: Change `FacePlan` to carry tile size and axes**

In `src/viewport/grainTiling.ts`, replace `repeat` in the `FacePlan` interface:

```ts
export interface FacePlan {
  kind: GrainKind;
  /** True when the drawn texture must be turned a quarter turn to follow the grain. */
  swap: boolean;
  /** The world axes carrying the drawn texture's u and v, after any swap. */
  axes: [Axis, Axis];
  /**
   * Inches per tile along the drawn u and v.
   *
   * A FIT axis resolves to the BOARD's extent on that axis, which is what
   * makes "show the whole tile" and "tile every N inches" one formula:
   * u = coordinate / tileInches. It is also why a sub-box of a board shows
   * the fraction of the tile it actually occupies — fitting the tile to the
   * sub-box instead would squeeze plywood's whole ply stack into the stock
   * that survived a dado.
   */
  tileInches: [number, number];
  /** Whether each axis (u, v) is FIT — the per-board offset is zeroed there. */
  fit: [boolean, boolean];
}
```

and in `facePlans`, replace the returned `repeat` with:

```ts
    return {
      kind,
      swap,
      axes: [du, dv] as [Axis, Axis],
      tileInches: [
        tu === FIT ? extents[du] : tu,
        tv === FIT ? extents[dv] : tv,
      ],
      fit: [tu === FIT, tv === FIT],
    };
```

Delete the now-unused `tileCount` helper.

- [ ] **Step 4: Generalise `boardUVs` to a sub-box**

```ts
/**
 * The `uv` attribute for one solid of a board: 48 floats, four (u, v) pairs per
 * face in BoxGeometry's own vertex order.
 *
 * UVs are PARENT-RELATIVE. A solid's coordinates are looked up in the board's
 * tiling, not in its own, so the figure runs continuously across a dado instead
 * of restarting at it — which is what makes a cut read as stock removed from
 * one board rather than two boards pushed together. Passing no solid gives the
 * whole board, identical to what this returned before joinery existed.
 *
 * The per-board offset stays the BOARD's (invariant 12) for the same reason. A
 * per-solid offset would break exactly the continuity this exists to get.
 */
export function boardUVs(board: Board, solid: Region = wholeBoard(board)): Float32Array {
  const plans = facePlans(board);
  const dims = axisDimensions(board);
  const [ou, ov] = boardUVOffset(board.id);
  const uv = new Float32Array(48);
  let i = 0;
  for (const plan of plans) {
    const spans = plan.axes.map((axis) => solid[dims[axis]]) as [Span, Span];
    for (const [cu, cv] of CORNERS) {
      const [fu, fv] = plan.swap ? [cv, cu] : [cu, cv];
      const at = (f: number, s: Span, tile: number, off: number, isFit: boolean) =>
        (s[0] + f * (s[1] - s[0])) / tile + (isFit ? 0 : off);
      uv[i++] = at(fu, spans[0], plan.tileInches[0], ou, plan.fit[0]);
      uv[i++] = at(fv, spans[1], plan.tileInches[1], ov, plan.fit[1]);
    }
  }
  return uv;
}
```

Import at the top of the file:

```ts
import { boardExtents, DIMENSION_ORDER, isSheetGood, wholeBoard } from '../document/document';
import type { Board, Region, Span } from '../document/document';
```

- [ ] **Step 5: Cover cuts in the signature**

```ts
export function boardUVSignature(board: Board): string {
  return [
    board.id,
    board.rotation,
    board.posture,
    board.material,
    board.grain,
    board.length,
    board.width,
    board.thickness,
    // Cuts change which solids exist and therefore which sub-ranges are
    // asked for. v3 shipped a bug of exactly this shape — `grain` was added
    // to what boardUVs reads without updating BoardMesh's memo, so grain
    // silently stopped turning on screen while the document stayed correct.
    board.cuts
      .map((c) => [c.face, c.from, c.across, c.offset, c.width, c.depth].join(','))
      .join(';'),
  ].join('|');
}
```

Extend the doc comment's "walked from boardUVs itself" list with `board.cuts` (via the `solid` argument BoardMesh derives from them).

- [ ] **Step 6: Update the existing `repeat` assertions**

The existing tests in `grainTiling.test.ts` assert on `plan.repeat`. The conversion is mechanical: `repeat[n] === extents[plan.axes[n]] / plan.tileInches[n]`. Rewrite each assertion in terms of `tileInches` — e.g. an assertion that a 24" face at a 16"-tile repeats 1.5 times becomes `expect(plan.tileInches[0]).toBe(16)`. Do **not** add a `repeat` getter to keep the old tests compiling; the point of the change is that tile size, not tile count, is the primitive.

- [ ] **Step 7: Run the tests and the typecheck gate**

Run: `npm test && npm run build`
Expected: green. `BoardMesh.tsx` still compiles — `boardUVs(board)` keeps working via the default argument.

- [ ] **Step 8: Commit**

```bash
git add src/viewport/grainTiling.ts src/viewport/grainTiling.test.ts
git commit -m "feat: UVs for a sub-box, resolved against the parent board

boardUVs takes an optional solid and looks its coordinates up in the
board's tiling rather than its own, so the figure runs continuously
across a dado. FacePlan now carries tile size instead of tile count,
which makes FIT and fixed tiling one formula and — the part that would
be easy to get backwards — resolves FIT against the BOARD's dimension.
Fitting it to the solid would squeeze plywood's whole ply stack into the
stock surviving a cut.

boardUVSignature covers cuts, per invariant 15.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: `BoardMesh` draws N solids

**Files:**
- Modify: `src/viewport/BoardMesh.tsx`

**Interfaces:**
- Consumes: `boardSolids`, `boardEdges`, `solidWorldBox`, `pointToLocalXYZ` (Tasks 3–5); `boardUVs(board, solid)`, `boardUVSignature` (Task 6).
- Produces: nothing new. This is the render.

**Three things in this file are written once because there was once one box, and each must become per-solid:** geometry **disposal** (disposing only the first leaks GPU memory every render), **picking** (`onClick` with its `CLICK_DRAG_SLOP_PX` guard, so clicking any surviving part selects the board), and the **selection highlight**. Edge lines are the exception — they come from `boardEdges(board)` for the board as a whole.

- [ ] **Step 1: Replace the geometry memo with one per solid**

```tsx
  // One geometry per solid. Keyed on boardUVSignature — see its doc comment —
  // which now covers cuts, so adding a dado rebuilds these. extents stay in
  // the array for the same reason as before: the box's own size belongs on
  // the memo that builds the box.
  const geometries = useMemo(() => {
    return boardSolids(board).map((solid) => {
      const { center, size } = solidWorldBox(board, solid);
      const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
      geo.setAttribute('uv', new THREE.BufferAttribute(boardUVs(board, solid), 2));
      return { geo, center };
    });
  }, [
    extents[0], extents[1], extents[2],
    boardUVSignature(board),
  ]);

  // Every geometry, not just the first — disposing one of N leaks the rest
  // on every rebuild.
  useEffect(() => () => geometries.forEach(({ geo }) => geo.dispose()), [geometries]);
```

- [ ] **Step 2: Build the edge geometry from `boardEdges`**

Replace the `EdgesGeometry` memo:

```tsx
  // Edges come from the cell grid, not from the solids: the remainder around
  // a dado is L-shaped in section, so per-solid EdgesGeometry would draw
  // seams across the board's own uncut faces. See boardEdges.
  const edges = useMemo(() => {
    const points = boardEdges(board).flatMap(([a, b]) => [
      ...pointToLocalXYZ(board, a),
      ...pointToLocalXYZ(board, b),
    ]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geo;
  }, [extents[0], extents[1], extents[2], boardUVSignature(board)]);

  useEffect(() => () => edges.dispose(), [edges]);
```

`boardUVSignature` over-covers here (edges do not depend on grain, material or id), which is safe and keeps one key for the whole component rather than two that could disagree.

- [ ] **Step 3: Render one mesh per solid**

Replace the single `<mesh>` with a map. The `onClick` handler — including the `CLICK_DRAG_SLOP_PX` guard and its comment block, which must be kept verbatim — and the six materials go on every solid:

```tsx
      {geometries.map(({ geo, center: offset }, index) => (
        <mesh
          key={index}
          geometry={geo}
          position={offset}
          castShadow
          receiveShadow
          onClick={(e) => {
            // [keep the existing comment block here unchanged]
            if (e.delta > CLICK_DRAG_SLOP_PX) return;
            e.stopPropagation();
            onSelect(board.id);
          }}
        >
          {kinds.map((kind, i) => (
            <meshStandardMaterial
              key={`${i}-${kind}`}
              attach={`material-${i}`}
              map={grainTexture(family, kind)}
              color={color}
              roughness={0.72}
              metalness={0}
              emissive={selected ? SELECTED : '#000000'}
              emissiveIntensity={selected ? 0.16 : 0}
              polygonOffset
              polygonOffsetFactor={1}
              polygonOffsetUnits={1}
            />
          ))}
        </mesh>
      ))}
```

Keying by index is safe because `boardSolids` is deterministic (see `mergeAlong`).

- [ ] **Step 4: Update the imports**

```tsx
import {
  boardCenter, boardEdges, boardExtents, boardSolids, pointToLocalXYZ,
  solidWorldBox, MATERIALS, DEFAULT_MATERIAL,
} from '../document/document';
```

- [ ] **Step 5: Typecheck and run the suite**

Run: `npm test && npm run build`
Expected: green. The viewport has no unit tests by design — the real check is Task 10's browser gate.

- [ ] **Step 6: Commit**

```bash
git add src/viewport/BoardMesh.tsx
git commit -m "feat: render a board as one box per solid

Geometry, picking and the selection highlight all become per-solid;
disposal in particular, since disposing one of N geometries leaks the
rest on every rebuild. Edge lines are the exception and come from
boardEdges for the board as a whole, because per-solid edges would draw
seams across the uncut face beneath a dado.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Store actions for cuts

**Files:**
- Modify: `src/store/store.ts`
- Test: `src/store/store.test.ts`

**Interfaces:**
- Consumes: `Cut` (Task 1).
- Produces: `addCut(boardId)`, `updateCut(boardId, cutId, patch: Partial<Cut>)`, `removeCut(boardId, cutId)` on the store.

- [ ] **Step 1: Write the failing tests**

Append to `src/store/store.test.ts`:

```ts
describe('cuts', () => {
  const boardId = () => useStore.getState().doc.boards[0].id;
  const cuts = () => useStore.getState().doc.boards[0].cuts;

  beforeEach(() => {
    useStore.setState({ doc: createDocument(), selectedId: null, past: [], future: [] });
    useStore.getState().addBoard();
  });

  it('adds a cut with a default that fits the board', () => {
    useStore.getState().addCut(boardId());
    expect(cuts()).toHaveLength(1);
    const c = cuts()[0];
    expect(c.depth).toBeGreaterThan(0);
    expect(c.face).not.toBe(c.across);
  });

  it('gives each cut a distinct id', () => {
    useStore.getState().addCut(boardId());
    useStore.getState().addCut(boardId());
    expect(cuts()[0].id).not.toBe(cuts()[1].id);
  });

  it('patches one cut and leaves the others alone', () => {
    useStore.getState().addCut(boardId());
    useStore.getState().addCut(boardId());
    const [first, second] = cuts();
    useStore.getState().updateCut(boardId(), second.id, { offset: 9 });
    expect(cuts()[1].offset).toBe(9);
    expect(cuts()[0]).toEqual(first);
  });

  it('removes a cut', () => {
    useStore.getState().addCut(boardId());
    useStore.getState().removeCut(boardId(), cuts()[0].id);
    expect(cuts()).toEqual([]);
  });

  it('is undoable', () => {
    useStore.getState().addCut(boardId());
    useStore.getState().undo();
    expect(cuts()).toEqual([]);
  });

  // A cut removes stock from inside the board's AABB: it never changes the
  // extents and never moves the board, so reorienting on a cut change would
  // be a no-op pivot. Same reasoning that keeps `grain` out of the predicate.
  it('never moves the board', () => {
    const before = useStore.getState().doc.boards[0].position;
    useStore.getState().addCut(boardId());
    useStore.getState().updateCut(boardId(), cuts()[0].id, { depth: 0.5 });
    expect(useStore.getState().doc.boards[0].position).toEqual(before);
  });

  it('ignores an unknown board or cut', () => {
    expect(() => useStore.getState().addCut('nope')).not.toThrow();
    expect(() => useStore.getState().removeCut(boardId(), 'nope')).not.toThrow();
    expect(cuts()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/store/store.test.ts -t cuts`
Expected: FAIL — `addCut is not a function`.

- [ ] **Step 3: Implement the actions**

Add to `StoreState`:

```ts
  addCut: (boardId: string) => void;
  updateCut: (boardId: string, cutId: string, patch: Partial<Cut>) => void;
  removeCut: (boardId: string, cutId: string) => void;
```

and to the returned object:

```ts
    /**
     * A quarter-thickness dado in the broad face, a quarter of the way along.
     * Chosen to be visible and legal on any board rather than to be a common
     * joint: it is a starting point to edit, and every number in it is a
     * fraction of the board's own dimensions, so it fits whatever it lands on.
     */
    addCut: (boardId) => {
      const board = get().doc.boards.find((b) => b.id === boardId);
      if (!board) return;
      const cut: Cut = {
        id: `c_${Date.now().toString(36)}_${board.cuts.length.toString(36)}`,
        face: 'thickness',
        from: 'max',
        across: 'width',
        offset: board.length / 4,
        width: Math.min(0.75, board.length / 4),
        depth: board.thickness / 2,
      };
      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) =>
          b.id === boardId ? { ...b, cuts: [...b.cuts, cut] } : b,
        ),
      }));
    },

    // Cuts are patched here rather than through updateBoard on purpose:
    // updateBoard reorients when a patch changes rotation or posture, and
    // `cuts` is deliberately absent from that predicate (invariant 2). A cut
    // removes stock from inside the board's AABB — it changes no extent and
    // moves nothing — so a reorient on a cut change would be a no-op pivot.
    updateCut: (boardId, cutId, patch) => {
      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) =>
          b.id === boardId
            ? { ...b, cuts: b.cuts.map((c) => (c.id === cutId ? { ...c, ...patch } : c)) }
            : b,
        ),
      }));
    },

    removeCut: (boardId, cutId) => {
      edit((doc) => ({
        ...doc,
        boards: doc.boards.map((b) =>
          b.id === boardId ? { ...b, cuts: b.cuts.filter((c) => c.id !== cutId) } : b,
        ),
      }));
    },
```

Import the `Cut` type at the top of `store.ts`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/store/store.test.ts`
Expected: PASS.

- [ ] **Step 5: Gates**

Run: `npm test && npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/store/store.ts src/store/store.test.ts
git commit -m "feat: add, patch and remove cuts through the store

Cut edits go through their own actions rather than updateBoard, because
updateBoard reorients on rotation and posture and `cuts` is deliberately
absent from that predicate — a cut changes no extent and moves nothing,
so a reorient there would be a no-op pivot (invariant 2).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: The Cuts section in the Properties panel

**Files:**
- Modify: `src/panels/Properties.tsx`
- Test: `src/panels/Properties.test.tsx`

**Interfaces:**
- Consumes: `addCut`/`updateCut`/`removeCut` (Task 8); `positionAxisOf` (Task 2); `cutLabel` (Task 5); `DimensionField`.
- Produces: nothing downstream.

**Two rules from the spec, both of which are about never rendering an impossible state:** the `across` select offers only the two dimensions that are not the current `face`, and changing `face` to whatever `across` currently holds moves `across` to a legal value **in the same edit** — the panel is never asked to render a `<select>` holding a value with no matching `<option>`, which is the rule follow-up 46 arrived at for `grain` on sheet goods.

- [ ] **Step 1: Write the failing tests**

Append to `src/panels/Properties.test.tsx`, following the existing render helpers in that file:

```ts
describe('cuts', () => {
  it('adds a cut and shows its controls', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    expect(screen.getByLabelText(/from the end/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/cut width/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/depth/i)).toBeInTheDocument();
  });

  it('never offers the face dimension as the across dimension', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    const across = screen.getByLabelText(/runs across/i) as HTMLSelectElement;
    const face = screen.getByLabelText(/cut into/i) as HTMLSelectElement;
    const offered = [...across.options].map((o) => o.value);
    expect(offered).not.toContain(face.value);
    expect(offered).toHaveLength(2);
  });

  it('moves across to a legal value when face takes its dimension', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    const across = screen.getByLabelText(/runs across/i) as HTMLSelectElement;
    await userEvent.selectOptions(screen.getByLabelText(/cut into/i), across.value);
    const after = screen.getByLabelText(/runs across/i) as HTMLSelectElement;
    expect(after.value).not.toBe((screen.getByLabelText(/cut into/i) as HTMLSelectElement).value);
    expect([...after.options].map((o) => o.value)).toContain(after.value);
  });

  it('refuses a depth past the board and does not commit it', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    const depth = screen.getByLabelText(/depth/i);
    await userEvent.clear(depth);
    await userEvent.type(depth, '4');
    await userEvent.tab();
    expect(screen.getByText(/must be at most/i)).toBeInTheDocument();
  });

  it('refuses a cut that would remove all the stock', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    // Full width of the position axis at full depth.
    await userEvent.clear(screen.getByLabelText(/from the end/i));
    await userEvent.type(screen.getByLabelText(/from the end/i), '0');
    await userEvent.tab();
    await userEvent.clear(screen.getByLabelText(/cut width/i));
    await userEvent.type(screen.getByLabelText(/cut width/i), '24');
    await userEvent.tab();
    await userEvent.clear(screen.getByLabelText(/depth/i));
    await userEvent.type(screen.getByLabelText(/depth/i), '3/4');
    await userEvent.tab();
    expect(screen.getByText(/would remove the whole board/i)).toBeInTheDocument();
  });

  it('labels a cut flush with the end a rabbet', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await userEvent.clear(screen.getByLabelText(/from the end/i));
    await userEvent.type(screen.getByLabelText(/from the end/i), '0');
    await userEvent.tab();
    expect(screen.getByText(/rabbet/i)).toBeInTheDocument();
  });

  it('removes a cut', async () => {
    renderWithBoard();
    await userEvent.click(screen.getByRole('button', { name: /add cut/i }));
    await userEvent.click(screen.getByRole('button', { name: /remove cut/i }));
    expect(screen.queryByLabelText(/depth/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run src/panels/Properties.test.tsx -t cuts`
Expected: FAIL — no *Add cut* button.

- [ ] **Step 3: Add the section**

In `Properties.tsx`, add imports:

```tsx
import { cutLabel, positionAxisOf } from '../document/document';
import type { Cut, Dimension } from '../document/document';
```

pull the actions from the store next to the existing ones:

```tsx
  const addCut = useStore((s) => s.addCut);
  const updateCut = useStore((s) => s.updateCut);
  const removeCut = useStore((s) => s.removeCut);
```

and add the section before the Duplicate/Delete row:

```tsx
      {/* Joinery. One primitive — a rectangular through-cut — so a dado and a
          rabbet are the same control with different numbers, and the label
          below is derived from the geometry rather than chosen by the user. */}
      <h3>Cuts</h3>
      {board.cuts.map((cut) => {
        const pos = positionAxisOf(cut.face, cut.across);
        const posDim = board[pos];
        const faceDim = board[cut.face];
        const set = (patch: Partial<Cut>) => updateCut(board.id, cut.id, patch);

        // Changing `face` to whatever `across` currently holds would leave
        // `across` naming the same dimension twice, so it moves in the same
        // edit — the select is never rendered holding a value it has no
        // option for.
        const setFace = (face: Dimension) => set(
          face === cut.across
            ? { face, across: positionAxisOf(face, cut.face) }
            : { face },
        );

        return (
          <div className="cut" key={cut.id}>
            <div className="row cut-head">
              <span className="cut-label">{cutLabel(board, cut)}</span>
              <button aria-label={`Remove cut`} onClick={() => removeCut(board.id, cut.id)}>
                Remove
              </button>
            </div>

            <div className="field">
              <label htmlFor={`face-${cut.id}`}>Cut into</label>
              <select id={`face-${cut.id}`} className="input" value={cut.face}
                onChange={(e) => setFace(e.target.value as Dimension)}>
                <option value="thickness">Face</option>
                <option value="width">Edge</option>
                <option value="length">End</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor={`from-${cut.id}`}>From</label>
              <select id={`from-${cut.id}`} className="input" value={cut.from}
                onChange={(e) => set({ from: e.target.value as Cut['from'] })}>
                <option value="min">Near side</option>
                <option value="max">Far side</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor={`across-${cut.id}`}>Runs across</label>
              <select id={`across-${cut.id}`} className="input" value={cut.across}
                onChange={(e) => set({ across: e.target.value as Dimension })}>
                {(['length', 'width', 'thickness'] as Dimension[])
                  .filter((d) => d !== cut.face)
                  .map((d) => (
                    <option key={d} value={d}>
                      {d === 'length' ? 'Length' : d === 'width' ? 'Width' : 'Thickness'}
                    </option>
                  ))}
              </select>
            </div>

            <DimensionField label="From the end" precision={precision} value={cut.offset}
              max={posDim} onCommit={(v) => set({ offset: v })} />
            <DimensionField label="Cut width" precision={precision} value={cut.width}
              max={posDim - cut.offset} onCommit={(v) => set({ width: v })} />
            <DimensionField label="Depth" precision={precision} value={cut.depth}
              max={faceDim} onCommit={(v) => set({ depth: v })} />
          </div>
        );
      })}
      <button onClick={() => addCut(board.id)}>Add cut</button>
```

- [ ] **Step 4: Add `max` to `DimensionField`**

The panel needs to *refuse* an out-of-range measurement, not clamp it. `DimensionField` already refuses unparseable and non-positive values, so this is one more rejection in the same place — not a new mechanism:

In `src/panels/DimensionField.tsx`, add to `Props`:

```ts
  /** Largest legal value, inclusive. Refused rather than clamped: silently
   *  correcting a number the user just typed loses a measurement without
   *  saying so. */
  max?: number;
```

destructure it, and in `commit()` after the `allowNegative` check:

```ts
    if (max !== undefined && parsed > max) {
      setError(`Must be at most ${formatLength(max, precision)}`);
      return;
    }
```

- [ ] **Step 5: Refuse a cut that removes the whole board**

The "removes all the stock" rule spans three fields, so it cannot live on one `max`. Add it as a guard in the panel, computed from the *post-patch* cut — this **replaces** the one-line `set` from Step 3, it is not a second definition:

```tsx
        const wouldRemoveAll = (patch: Partial<Cut>) => {
          const next = { ...cut, ...patch };
          const p = positionAxisOf(next.face, next.across);
          return next.depth >= board[next.face] &&
                 next.offset <= 0 &&
                 next.width >= board[p];
        };
        const set = (patch: Partial<Cut>) => {
          if (wouldRemoveAll(patch)) { setCutError(cut.id, 'That would remove the whole board.'); return; }
          setCutError(cut.id, null);
          updateCut(board.id, cut.id, patch);
        };
```

with `const [cutErrors, setCutErrors] = useState<Record<string, string | null>>({})` at the top of the component and a `setCutError` helper that writes into it, and the message rendered under the row:

```tsx
            {cutErrors[cut.id] && <p className="error" role="alert">{cutErrors[cut.id]}</p>}
```

- [ ] **Step 6: Style the section**

Add to the stylesheet next to the existing `.field` rules — keep it plain, matching the panel's current density:

```css
.cut { border-top: 1px solid var(--rule); padding-top: 0.5rem; margin-top: 0.5rem; }
.cut-head { align-items: baseline; justify-content: space-between; }
.cut-label { text-transform: capitalize; opacity: 0.75; font-size: 0.85em; }
```

Use whatever the existing rule/`--rule` equivalent is in the project's CSS; do not introduce a new colour token if one already exists.

- [ ] **Step 7: Run the tests and the gates**

Run: `npm test && npm run build`
Expected: green. If `renderWithBoard` does not already exist in `Properties.test.tsx`, use whatever helper that file uses to mount the panel with a selected board.

- [ ] **Step 8: Commit**

```bash
git add src/panels/Properties.tsx src/panels/DimensionField.tsx src/panels/Properties.test.tsx src/index.css
git commit -m "feat: edit cuts from the properties panel

One row per cut: which dimension it is cut into, which end it enters
from, which dimension it runs across, and three DimensionFields — so the
new numeric inputs inherit invariant 5's dirty guard and blur resync
rather than reimplementing them three more times.

The across select offers only the two dimensions that are not the face,
and changing the face moves across in the same edit, so the panel is
never asked to render a select holding a value with no option — the rule
follow-up 46 arrived at for grain on sheet goods.

DimensionField gains max, refusing rather than clamping: silently
correcting a number the user just typed loses a measurement.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Browser gate, then documentation

**Files:**
- Screenshots: `.superpowers/sdd/2026-07-29-sloyd-v1/screenshots/`
- Modify: `CLAUDE.md`
- Modify: `docs/follow-ups.md`

**This is not a formality.** v3's `boardUVSignature` bug was invisible to every unit test and to every per-task review — the field was added in one task and consumed by a stale memo in another — and only a pixel diff caught it. This task is the equivalent check for cuts.

**Use the Playwright MCP**, not the Chrome extension (see the host memory on browser verification). Remember that GL here is software (llvmpipe): it returns `1.0` for `pow(0.0, 0.0)` where real hardware returns `NaN`, so anything resting on undefined shader behaviour cannot be verified on this host (follow-up 26a). None of this feature does — it is all CPU-side geometry — which is exactly why a screenshot is trustworthy for it.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev -- --port 5199`
Leave it running in the background.

- [ ] **Step 2: Capture the before state**

Navigate to `http://localhost:5199`, add a board, select it, and screenshot the viewport. Save as `joinery-before.png`.

- [ ] **Step 3: Add a dado and capture the after state**

Click *Add cut*, set *Depth* to `1/4`, and screenshot again as `joinery-after-dado.png`.

Verify by looking at the two images:
- The dado is **visible** as a channel in the board's broad face. If the board looks unchanged, the memo key is stale — check that `boardUVSignature` covers cuts and that `BoardMesh`'s memo uses it.
- Grain **runs across** the dado continuously rather than restarting at its edges.
- There is **no line** drawn across the board's uncut bottom face at the dado's boundaries.

- [ ] **Step 4: Check the rest of the interaction**

- Click the board on the far side of the dado — it selects. Click the near side — it selects.
- Set *From the end* to `0` — the cut becomes a rabbet at the end, and the label reads "rabbet".
- Add a second cut overlapping the first — the overlapped stock is removed once, with no z-fighting where they meet.
- Change *Posture* to *On edge* — the cut turns with the board and stays in the same place on the part.
- `Ctrl+Z` — the last cut change undoes.

Screenshot the overlapping-cuts case as `joinery-overlap.png`.

- [ ] **Step 5: Report before documenting**

Stop and report what the screenshots show, including anything that looks wrong. Do not write the documentation for behaviour that has not been seen working — that is the failure mode this task exists to prevent.

- [ ] **Step 6: Update `CLAUDE.md`**

- **Status:** joinery shipped; state what it does (one through-cut primitive, dado/rabbet derived, sub-box decomposition, grid-derived edges) and that **the cut list is now next**.
- **Where things live:** add `src/document/cuts.ts` to the tree with a one-line description.
- **Versioning:** `CURRENT_VERSION` is 4; the chain is `1→2→3→4`.
- **New invariant — edges come from the grid, not from the solids.** The remainder around a dado is L-shaped, an L is not a box, so per-solid `EdgesGeometry` draws seams across continuous stock. Include the canonical case with its numbers.
- **New invariant — `FIT` resolves against the board, then the sub-range is taken from it.** Include the plywood ply-stack consequence, because that is what makes it memorable.
- **Extend invariant 2** to note that `cuts` is absent from the reorient predicate for the same reason `grain` is.
- **Extend invariant 15** to note that `boardUVSignature` now covers cuts as well as grain.
- Update the test count in **Commands** to whatever `npm test` actually reports.

- [ ] **Step 7: Update `docs/follow-ups.md`**

Add a joinery section for anything found and consciously deferred during implementation. If nothing was deferred, say so explicitly rather than leaving the section out — "nothing deferred" is information.

- [ ] **Step 8: Commit and merge**

```bash
git add CLAUDE.md docs/follow-ups.md
git commit -m "docs: close out joinery

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

Then finish the branch per the working agreement — `git merge --no-ff` into `master`, verify the merged tree with `npm test && npm run build`, and delete the branch. **No pull request.**

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1. One primitive, dado/rabbet derived | 1, 5 |
| 2. `Cut` type, part-local, implied position axis, id uniqueness | 1, 2 |
| 3. Schema 4, chain 1→2→3→4 | 1 |
| 4. Split / drop / merge; cut region and `from` | 3 |
| 4. Edges from the grid | 4 |
| 5. Sub-box rendering, parent-relative UVs, `FIT` rule | 6 |
| 5. Face grain kinds unchanged | 7 (uses existing `faceGrainKinds`) |
| 5. `boardUVSignature` covers cuts | 6 |
| 5. Per-solid disposal, picking, highlight | 7 |
| 6. Store actions; `cuts` out of the reorient predicate | 8 |
| 6. Panel, `DimensionField` reuse, `across` filtering, face/across coupling | 9 |
| 7. Clamp on load, reject in panel, clamp order, remove-all rejection, full-depth rip | 2, 9 |
| 8. Testing, browser gate | 3, 4, 5, 6, 9, 10 |
| 9. Non-goals | nothing implements them, by design |

**Type consistency:** `Region`, `Span`, `Point`, `Segment`, `Cut`, `CutFrom` are defined in Task 1 (except `Point`/`Segment`, defined in Task 4) and used with those exact names throughout. `positionAxisOf` is defined once in Task 2 and reused in Tasks 3, 5 and 9. `boardUVs(board, solid?)` keeps its one-argument form working, which is why Task 6 does not break Task 7 before Task 7 runs.

**One thing left to the implementer's judgement, flagged rather than hidden:** the exact label wording in the panel (`Cut into` / `From` / `Runs across` / `From the end` / `Cut width` / `Depth`) and the `Face`/`Edge`/`End` option names. The tests match on these strings, so if you change the wording, change the tests with it — but keep the *shape*: the labels must name the board's own dimensions, not world axes.
