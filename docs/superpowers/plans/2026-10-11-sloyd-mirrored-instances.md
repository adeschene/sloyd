# Mirrored Instances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A live mirrored copy of an assembly: `Instance.mirrored`, placed through the one composition as ordinary world parts, written back as its exact inverse, with "Copy mirrored" and a "Mirrored" checkbox (schema 13).

**Architecture:** The mirror is one more step inside `placeBoard` / `placeInstance` (`src/document/frames.ts`): a part placed through a mirrored frame is first reflected in the frame's own coordinates (turn negated, cuts mirrored along the posture's turn-0 X dimension, min corner reflected), then placed as today. Every consumer reads world parts and stays unchanged. Write-back (`lower` / `lowerEdit` in `treeEdit.ts`) gains the exact inverse, and the three hand-written world→local vector calculations move onto one mirror-aware helper.

**Tech Stack:** TypeScript, React, Zustand, Vitest (+ Testing Library). `npm test` does NOT typecheck: run `npm run build` too. Always run vitest with `< /dev/null`.

**Spec:** `docs/superpowers/specs/2026-10-11-sloyd-mirrored-instances-design.md` (read it first; it is the authority, this plan argues from it). Project rules: `CLAUDE.md` (invariants 2, 4, 24, 25, 33, 40, 43, 44, 45, 46).

## Global Constraints

- `CURRENT_VERSION` becomes **13**. `Instance.mirrored?: boolean` is stored ONLY when `true` (absent otherwise; `false`, non-booleans load as absent).
- The mirror plane is the instance's own local X (x → −x), applied BEFORE its turn and translation: frame = `T(position) · R(rotation) · M^mirrored`.
- A part reflected in its container's coordinates: turn `(360 − s) % 360`; cuts `mirrorCut(c, d0, b[d0])` with `d0` = `axisFrame({ ...b, rotation: 0 })[0].dim` (length for flat/on-edge, width for upright); position `[0 - (x + ex), y, z]`, `ex = boardExtents(b)[0]`. Write `0 - v`, never `-v`, so a zero stays `+0`.
- A nested instance reflected: origin `[0 - o.x, o.y, o.z]`, turn negated, flag flipped (`mirrored: true` present, or the key absent).
- `mirrorCutAlong`'s body is moved VERBATIM (invariant 44: clip first, one sum, no snap; do not tidy it onto the frame helpers).
- Write-back is the exact inverse; positions still go down as DELTAS (an axis that did not move gains exactly zero). An untouched cut maps back to the SAME stored cut object.
- Refine refusal text, verbatim: `Refine can't describe a mirrored assembly yet — Ungroup the mirrored copy first.`
- UI strings, verbatim: checkbox label `Mirrored`; button `Copy mirrored`; parts-list badge accessible name `Mirrored`, glyph `⇋`.
- Invariant 25: nothing here rounds. Invariant 4: an action that changes nothing pushes no undo entry.
- Mutation-test every new test (the step lists the mutations); a failed compile is not a red test.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No pull requests.

## Review Focus

1. **Resizing a part inside a mirrored copy** (Properties rule, not keepWorld): the stored local position is kept, so in the mirrored copy the part grows toward local −X — the mirror of the original. Expect world geometry of the copy = reflection of the original after the edit. Pinned in Task 2.
2. **Linking a part inside a mirrored copy to an equal part outside it** (Link): neither part's world geometry may change. Pinned in Task 3 (if it fails, report it — do not change the Link code silently).
3. **A third part touching only the mirrored copy, then joinery:** the right half gets a joint the left does not, so the definition must split and every world part must equal joinery's output. Pinned in Task 4.
4. **Turning a mirrored assembly** (Turn select): the box centre and min height are kept, as for any assembly. Pinned in Task 3.
5. **Make Unique of a mirrored copy:** world parts bit-identical, flag kept. Pinned in Task 3.

---

### Task 1: The model and the composition (schema 13)

**Files:**
- Create: `src/document/mirrorCut.ts`
- Modify: `src/document/document.ts` (remove `mirrorCutAlong` and `clamp` bodies, import them; `validateInstance`; `CURRENT_VERSION`)
- Modify: `src/document/types.ts:131-138` (`Instance`)
- Modify: `src/document/frames.ts` (`Frame`, `mirrorPart`, `mirrorFrame`, `withMirror`, `placeBoard`, `placeInstance`)
- Create: `src/document/frames.mirror.test.ts`
- Modify: `src/document/document.test.ts` (version literals; load tests)

**Interfaces:**
- Produces (later tasks rely on these exact names):
  - `mirrorCut(c: Cut, d: Dimension, size: number): Cut` and `mirrorCutAlong(raw: unknown, d: Dimension, size: number): unknown`, `clamp(v, lo, hi)` — `src/document/mirrorCut.ts`.
  - `Instance.mirrored?: boolean`; `Frame { position; rotation; mirrored?: boolean }`.
  - `mirrorDim(b: Board): Dimension`, `mirrorPart(b: Board): Board`, `withMirror<T extends { mirrored?: boolean }>(x: T, m: boolean): T` — `src/document/frames.ts`.
  - `placeBoard` / `placeInstance` mirror-aware.

- [ ] **Step 1: Move `mirrorCutAlong` and `clamp` into `src/document/mirrorCut.ts`**

Cut the whole `mirrorCutAlong` function WITH its doc comment from `src/document/document.ts` (currently ~line 606–651) and the `clamp` function (~line 237) into the new file, unchanged, and add the typed wrapper:

```ts
import type { Cut, Dimension } from './types';
import { DIMENSION_ORDER } from './geometry';

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** (the existing doc comment, verbatim) */
export function mirrorCutAlong(raw: unknown, d: Dimension, size: number): unknown {
  // (the existing body, verbatim)
}

/**
 * A validated cut mirrored along part dimension `d` (u -> size - u): the
 * composition's use of the migrations' one hand reflection (mirrored-instances
 * spec §3; invariant 44). A validated cut always has a numeric offset and
 * width inside the board, so the raw paths of mirrorCutAlong are not reached.
 */
export function mirrorCut(c: Cut, d: Dimension, size: number): Cut {
  return mirrorCutAlong(c, d, size) as Cut;
}
```

In `document.ts`, add `import { clamp, mirrorCutAlong } from './mirrorCut';` and `export { mirrorCut } from './mirrorCut';` next to the other re-exports. Delete the moved definitions there. Check `geometry.ts` does not import `document.ts` (it must not; `mirrorCut.ts` imports only `types` and `geometry`).

- [ ] **Step 2: Run the suite to prove the move is behaviour-free**

Run: `npx vitest run src/document < /dev/null`
Expected: all pass (same count as before the move).

- [ ] **Step 3: Write the failing composition tests** — `src/document/frames.mirror.test.ts`

The expected solids are computed BY HAND from the bare part's own solids, never by `placeBoard`.

```ts
import { describe, expect, it } from 'vitest';
import { placeBoard, placeInstance, mirrorPart } from './frames';
import type { Frame } from './frames';
import { worldSolids } from './designCheck';
import { chiralPart, sameSet } from './turnFixtures';
import type { Board, Instance, Rotation } from './types';

const POSTURES = ['flat', 'on-edge', 'upright'] as const;
const TURNS: Rotation[] = [0, 90, 180, 270];

/** A point turned by r about the vertical, counter-clockwise from above, written out by hand: 90 -> (z, y, -x). */
const turnPoint = (r: Rotation, [x, y, z]: number[]): number[] =>
  r === 90 ? [z!, y!, -x!] : r === 180 ? [-x!, y!, -z!] : r === 270 ? [-z!, y!, x!] : [x!, y!, z!];
/** A box through one frame, by hand: reflect local X if mirrored, turn, translate, then re-box the corners. */
const boxThrough = (f: Frame, b: { min: number[]; max: number[] }) => {
  const corners: number[][] = [];
  for (const x of [b.min[0]!, b.max[0]!]) for (const y of [b.min[1]!, b.max[1]!]) for (const z of [b.min[2]!, b.max[2]!]) {
    const m = f.mirrored ? [-x, y, z] : [x, y, z];
    const t = turnPoint(f.rotation, m);
    corners.push([t[0]! + f.position[0]!, t[1]! + f.position[1]!, t[2]! + f.position[2]!]);
  }
  return { min: [0, 1, 2].map((i) => Math.min(...corners.map((c) => c[i]!))), max: [0, 1, 2].map((i) => Math.max(...corners.map((c) => c[i]!))) };
};
/** Expected world solids: the bare part's solids through the frames, INNERMOST FIRST. */
const expected = (b: Board, frames: Frame[]) =>
  worldSolids(b).map((s) => frames.reduceRight((acc, f) => boxThrough(f, acc), { min: s.min, max: s.max }));
const flat = (bs: { min: number[]; max: number[] }[]) => bs.map((s) => [...s.min, ...s.max]);
const part = (posture: (typeof POSTURES)[number], s: Rotation): Board =>
  ({ ...chiralPart(posture), rotation: s, position: [0.5, 0.25, 1.25] });

describe('placing a part through a mirrored frame (mirrored-instances spec §3)', () => {
  it('equals the hand reflection, for every posture x part turn x frame turn x mirror', () => {
    for (const posture of POSTURES) for (const s of TURNS) for (const r of TURNS) for (const mirrored of [false, true]) {
      const b = part(posture, s);
      const f: Frame = { position: [3, 0, -2], rotation: r, mirrored };
      const got = worldSolids(placeBoard(f, b));
      expect(got.length).toBe(worldSolids(b).length);
      expect(sameSet(flat(got), flat(expected(b, [f]))), `${posture} s${s} r${r} m${mirrored}`).toBe(true);
    }
  });

  it('negates the part turn, keeps posture and sizes, and mirrors along length (flat, on-edge) or width (upright)', () => {
    expect(mirrorPart(part('flat', 90)).rotation).toBe(270);
    expect(mirrorPart(part('upright', 0)).rotation).toBe(0);
    const m = mirrorPart(part('upright', 0));
    expect([m.posture, m.length, m.width, m.thickness]).toEqual(['upright', 20, 6, 1.5]);
    // chiralPart's c2 (face width, across length, offset 0.375 w 0.5) has its position on thickness: a mirror
    // along length leaves it, and so does one along width (face width flips from instead).
    const c2f = mirrorPart(part('flat', 0)).cuts.find((c) => c.id === 'c2')!;
    expect(c2f).toMatchObject({ face: 'width', from: 'min', stopMin: 12, stopMax: 2 }); // across length: stops swap
    const c2u = mirrorPart(part('upright', 0)).cuts.find((c) => c.id === 'c2')!;
    expect(c2u).toMatchObject({ face: 'width', from: 'max', stopMin: 2, stopMax: 12 }); // face width: from flips
  });

  it('writes +0, never -0, for a reflected zero', () => {
    const b = { ...part('flat', 0), position: [-20, 0, 0] as [number, number, number] }; // x + ex = 0
    expect(Object.is(mirrorPart(b).position[0], 0)).toBe(true);
    const j: Instance = { id: 'j', name: 'J', definition: 'd', position: [0, 1, 2], rotation: 0 };
    expect(Object.is(placeInstance({ position: [0, 0, 0], rotation: 0, mirrored: true }, j).position[0], 0)).toBe(true);
  });

  it('two mirrors cancel and three equal one, at every depth (nested frames, innermost first)', () => {
    const A: Frame = { position: [10, 0, 4], rotation: 90, mirrored: true };
    const B: Frame = { position: [2, 1, -3], rotation: 270, mirrored: true };
    const C: Frame = { position: [-1, 0, 5], rotation: 180, mirrored: true };
    for (const posture of POSTURES) for (const s of TURNS) {
      const b = part(posture, s);
      const two = worldSolids(placeBoard(A, placeBoard(B, b)));
      expect(sameSet(flat(two), flat(expected(b, [A, B]))), `two ${posture} ${s}`).toBe(true);
      const three = worldSolids(placeBoard(A, placeBoard(B, placeBoard(C, b))));
      expect(sameSet(flat(three), flat(expected(b, [A, B, C]))), `three ${posture} ${s}`).toBe(true);
    }
  });

  it('placeInstance reflects a nested origin, negates its turn and flips its flag, so Ungroup matches the walk', () => {
    const A: Frame = { position: [10, 0, 4], rotation: 90, mirrored: true };
    const j: Instance = { id: 'j', name: 'J', definition: 'd', position: [2, 1, -3], rotation: 270, mirrored: true };
    const lifted = placeInstance(A, j);
    expect(lifted.mirrored).toBeUndefined();
    expect('mirrored' in lifted).toBe(false);
    const plainJ: Instance = { ...j, mirrored: undefined };
    delete (plainJ as Partial<Instance>).mirrored;
    expect(placeInstance(A, plainJ).mirrored).toBe(true);
    for (const posture of POSTURES) {
      const b = part(posture, 90);
      expect(sameSet(flat(worldSolids(placeBoard(lifted, b))), flat(worldSolids(placeBoard(A, placeBoard(j, b)))))).toBe(true);
    }
  });

  it('an unmirrored frame is bit-identical to before (identity frame included)', () => {
    const b = part('on-edge', 90);
    expect(placeBoard({ position: [0, 0, 0], rotation: 0 }, b)).toEqual(b);
    expect(placeBoard({ position: [0, 0, 0], rotation: 0, mirrored: false }, b)).toEqual(b);
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/document/frames.mirror.test.ts < /dev/null`
Expected: FAIL (`mirrorPart` is not exported; then wrong geometry).

- [ ] **Step 5: Implement the model and the composition**

`src/document/types.ts`, in `Instance`, after `rotation`:

```ts
  /** Reflected across its own local X before its turn (mirrored-instances spec §2). Stored only when true. */
  mirrored?: boolean;
```

`src/document/frames.ts`: extend `Frame` and add the mirror step (keep every existing doc comment; add these):

```ts
import type { Board, Dimension, Instance, Rotation } from './types';
import { axisFrame, boardExtents } from './geometry';
import { mirrorCut } from './mirrorCut';

/** Where a frame sits in its parent: an Instance satisfies this. A mirrored
 *  frame reflects its own local X before it turns (mirrored-instances spec §2). */
export interface Frame { position: readonly number[]; rotation: Rotation; mirrored?: boolean }

/** `x` with its mirror flag set to `m`: the key present only when true (spec §2). */
export function withMirror<T extends { mirrored?: boolean }>(x: T, m: boolean): T {
  const { mirrored: _drop, ...rest } = x;
  return (m ? { ...rest, mirrored: true } : rest) as T;
}

/** The part dimension on X at turn 0 for the part's posture (v12 axisFrame):
 *  length for flat and on-edge, width for upright. A reflection of X is a
 *  reflection of this dimension, whichever way it runs (spec §3). */
export function mirrorDim(b: Board): Dimension {
  return axisFrame({ ...b, rotation: 0 })[0]!.dim;
}

/**
 * A part reflected across x = 0 of its container (spec §3): M R(s) = R(-s) M,
 * and M F = F M_d0 for the turn-0 frame F, so the turn is negated, the cuts are
 * mirrored along d0, and the box's min corner is reflected. Posture and sizes
 * are unchanged (turns s and -s put the same dimensions on the same axes).
 * `0 - v` keeps a zero +0.
 */
export function mirrorPart(b: Board): Board {
  const d = mirrorDim(b);
  const ex = boardExtents(b)[0];
  return {
    ...b,
    rotation: inverseTurn(b.rotation),
    position: [0 - (b.position[0] + ex), b.position[1], b.position[2]],
    cuts: b.cuts.map((c) => mirrorCut(c, d, b[d])),
  };
}

/** A nested instance reflected across x = 0 of its container (spec §3):
 *  M T(o) R(t) M^m = T(Mo) R(-t) M^(m+1). */
function mirrorFrame(j: Instance): Instance {
  return withMirror({ ...j, rotation: inverseTurn(j.rotation), position: [0 - j.position[0], j.position[1], j.position[2]] }, j.mirrored !== true);
}

const unmirrored = (f: Frame): Frame => ({ position: f.position, rotation: f.rotation });
```

At the top of `placeBoard`:

```ts
  if (f.mirrored) return placeBoard(unmirrored(f), mirrorPart(b));
```

At the top of `placeInstance`:

```ts
  if (f.mirrored) return placeInstance(unmirrored(f), mirrorFrame(j));
```

Add one sentence to `placeBoard`'s doc comment: "A mirrored frame first reflects the part in its own coordinates (`mirrorPart`), then places it as below."

`src/document/document.ts`: `export const CURRENT_VERSION = 13;` and in `validateInstance`'s return object add `...(i.mirrored === true ? { mirrored: true } : {}),` after `rotation`.

- [ ] **Step 6: Run the composition tests**

Run: `npx vitest run src/document/frames.mirror.test.ts < /dev/null`
Expected: PASS. If the per-cut expectations in the second test disagree, re-derive them by hand from `mirrorCutAlong`'s three cases (face = d flips `from`; across = d swaps the stops; otherwise the offset reflects) and fix the TEST only if your derivation shows it was wrong — say so in your report.

- [ ] **Step 7: Version literals and load tests** — `src/document/document.test.ts`

Every assertion that the CURRENT version is literally `12` becomes `13` (e.g. `expect(doc.version).toBe(12)`, `expect(CURRENT_VERSION).toBe(12)`, `createDocument('Test').version`), and every "a version-13 file is refused" becomes 14 (`version: 13` → `version: 14`, `doc(13, …)` → `doc(14, …)`). Find them with `grep -n "toBe(12)\|version: 13\|(13," src/document/document.test.ts` and check each by reading it (a `12` that is not a version stays). Then add:

```ts
describe('v13: mirrored instances (mirrored-instances spec §2)', () => {
  const raw = (mirrored: unknown) => ({
    ...createDocument('M'), version: 13,
    instances: [{ id: 'i1', name: 'Case', definition: 'd1', position: [0, 0, 0], rotation: 0, mirrored }],
    definitions: [{ id: 'd1', boards: [createBoard({ id: 'b1' })], instances: [] }],
  });
  it('a v13 file round-trips the flag; only true is kept', () => {
    expect(migrateDocument(JSON.parse(JSON.stringify(raw(true)))).instances[0]!.mirrored).toBe(true);
    for (const bad of [false, 'yes', 1, null]) {
      const i = migrateDocument(JSON.parse(JSON.stringify(raw(bad)))).instances[0]!;
      expect('mirrored' in i, String(bad)).toBe(false);
    }
  });
  it('a v12 file loads unmirrored; a v14 file is refused', () => {
    const v12 = { ...raw(undefined), version: 12 };
    expect('mirrored' in migrateDocument(JSON.parse(JSON.stringify(v12))).instances[0]!).toBe(false);
    expect(() => migrateDocument({ ...raw(true), version: 14 })).toThrow(DocumentError);
  });
});
```

- [ ] **Step 8: Full suite and build**

Run: `npm test < /dev/null` then `npm run build < /dev/null`
Expected: all pass; build clean. A test elsewhere that pins `version: 12` in a fixture it SAVES (not loads) may need 13 — fix only version literals.

- [ ] **Step 9: Mutation-test**

Each must turn a test red (revert after each): (a) drop the turn negation in `mirrorPart` (`rotation: b.rotation`); (b) drop the cut mirroring (`cuts: b.cuts`); (c) reflect the position without `+ ex`; (d) in `mirrorFrame`, keep the flag (`j.mirrored === true`); (e) in `mirrorDim` use `axisFrame(b)` (the current turn) instead of turn 0; (f) `-(b.position[0] + ex)` instead of `0 - (…)`; (g) `validateInstance` keeps `mirrored: false`. Record which test failed for each in your report.

- [ ] **Step 10: Commit**

```bash
git add src/document/mirrorCut.ts src/document/document.ts src/document/types.ts src/document/frames.ts src/document/frames.mirror.test.ts src/document/document.test.ts
git commit -m "feat(model): Instance.mirrored, placed through the one composition (schema 13)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Writing edits back through a mirror (the exact inverse)

**Files:**
- Modify: `src/document/frames.ts` (`Linear`, `composeLinear`, `toLocal`)
- Modify: `src/document/tree.ts:71-74` (`containerTurn` → `containerLinear`)
- Modify: `src/document/treeEdit.ts` (`lower`, `lowerEdit`, `translateItems`; a new `lowerCuts`)
- Modify: `src/store/store.ts` (`copyInRow`, ~line 1188; the import line)
- Create: `src/document/treeEdit.mirror.test.ts`
- Modify: `src/store/store.assemblies.test.ts` (copy-in-row and move cases)

**Interfaces:**
- Consumes: `mirrorPart`, `mirrorDim`, `withMirror`, `mirrorCut`, `Frame.mirrored` (Task 1).
- Produces: `Linear { rotation: Rotation; mirrored: boolean }`, `IDENTITY_LINEAR`, `composeLinear(outer: Linear, f: { rotation: Rotation; mirrored?: boolean }): Linear`, `toLocal(l: Linear, w: readonly number[]): Vec3` (frames.ts); `containerLinear(doc, path: string | null): Linear` (tree.ts). `containerTurn` is REMOVED (its two callers move to `containerLinear`).

- [ ] **Step 1: Write the failing write-back tests** — `src/document/treeEdit.mirror.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { applyWorldEdits, translateItems } from './treeEdit';
import { createDocument } from './document';
import { worldParts } from './tree';
import { worldSolids } from './designCheck';
import { chiralPart, sameSet } from './turnFixtures';
import { CUT_GEOMETRY_KEYS } from './cuts';
import type { Board, Cut, Instance, Rotation, SloydDocument } from './types';

const TURNS: Rotation[] = [0, 90, 180, 270];
const POSTURES = ['flat', 'on-edge', 'upright'] as const;

/** Root -> i1 (frame A) -> [depth 2: i2 (frame B) ->] part b1. */
const doc = (b: Board, A: Partial<Instance>, B?: Partial<Instance>): SloydDocument => {
  const inner: Instance = { id: 'i2', name: 'Inner', definition: 'd2', position: [1, 0.5, -2], rotation: 90, ...B };
  return {
    ...createDocument('Mirror'),
    instances: [{ id: 'i1', name: 'Outer', definition: 'd1', position: [6, 0, 3], rotation: 0, ...A }],
    definitions: B
      ? [{ id: 'd1', boards: [], instances: [inner] }, { id: 'd2', boards: [{ ...b, id: 'b1' }], instances: [] }]
      : [{ id: 'd1', boards: [{ ...b, id: 'b1' }], instances: [] }],
  };
};
const occ = (d: SloydDocument) => worldParts(d).find((p) => p.id.endsWith('b1'))!;
const stored = (d: SloydDocument) => d.definitions.flatMap((x) => x.boards).find((p) => p.id === 'b1') as Board;
const solids = (b: Board) => worldSolids(b).map((s) => [...s.min, ...s.max]);
const sameCutGeometry = (a: Cut, b: Cut) => CUT_GEOMETRY_KEYS.every((k) => {
  const x = a[k]; const y = b[k];
  return typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) < 1e-9 : x === y;
});
/** Place(lower(after)) returns after: same turn, posture and sizes; position and solids within 1e-9. */
const expectPlacedBack = (got: Board, after: Board, label: string) => {
  expect([got.rotation, got.posture, got.length, got.width, got.thickness], label).toEqual([after.rotation, after.posture, after.length, after.width, after.thickness]);
  got.position.forEach((v, i) => expect(Math.abs(v - after.position[i]!), label).toBeLessThan(1e-9));
  expect(sameSet(solids(got), solids(after)), label).toBe(true);
  expect(got.cuts.length, label).toBe(after.cuts.length);
  got.cuts.forEach((c, i) => expect(sameCutGeometry(c, after.cuts[i]!), `${label} cut ${i}`).toBe(true));
};
const CHAINS: Array<[string, Partial<Instance>, Partial<Instance> | undefined]> = [
  ['plain', { rotation: 90 }, undefined],
  ['mirrored', { rotation: 90, mirrored: true }, undefined],
  ['mirrored outer', { rotation: 180, mirrored: true }, { rotation: 90 }],
  ['mirrored inner', { rotation: 270 }, { rotation: 90, mirrored: true }],
  ['both mirrored', { rotation: 90, mirrored: true }, { rotation: 270, mirrored: true }],
];

describe('write-back through a mirror is the exact inverse (mirrored-instances spec §4)', () => {
  it('a move, for every chain x posture x stored turn', () => {
    for (const [name, A, B] of CHAINS) for (const posture of POSTURES) for (const s of TURNS) {
      const d = doc({ ...chiralPart(posture), rotation: s, position: [0.5, 0.25, 1.25] }, A, B);
      const before = occ(d);
      const after = { ...before, position: [before.position[0] + 1.5, before.position[1] + 0.25, before.position[2] - 0.75] as [number, number, number] };
      expectPlacedBack(occ(applyWorldEdits(d, [{ before, after }])), after, `${name} ${posture} ${s}`);
    }
  });

  it('a turn: placed back exactly; under an odd mirror the stored turn moves the other way and the stored cuts are the SAME objects', () => {
    for (const [name, A, B] of CHAINS) for (const posture of POSTURES) for (const s of TURNS) {
      const d = doc({ ...chiralPart(posture), rotation: s, position: [0.5, 0.25, 1.25] }, A, B);
      const before = occ(d);
      const after = { ...before, rotation: ((before.rotation + 90) % 360) as Rotation };
      const out = applyWorldEdits(d, [{ before, after }], { keepWorld: true });
      expectPlacedBack(occ(out), after, `${name} ${posture} ${s}`);
      expect(stored(out).cuts, `${name} ${posture} ${s}`).toBe(stored(d).cuts);
    }
    const one = doc({ ...chiralPart('flat'), rotation: 0 }, { rotation: 0, mirrored: true });
    const b0 = occ(one);
    expect(b0.rotation).toBe(0);
    expect(stored(applyWorldEdits(one, [{ before: b0, after: { ...b0, rotation: 90 } }], { keepWorld: true })).rotation).toBe(270);
  });

  it('an added cut is stored mirrored back and placed back within 1e-9; the old cuts stay the same objects', () => {
    for (const [name, A, B] of CHAINS) for (const posture of POSTURES) {
      const d = doc({ ...chiralPart(posture), rotation: 90 }, A, B);
      const before = occ(d);
      const extra: Cut = { id: 'x', face: 'thickness', from: 'max', across: 'width', offset: 3, width: 0.5, depth: 0.25, stopMin: 0.5, stopMax: 0 };
      const after = { ...before, cuts: [...before.cuts, extra] };
      const out = applyWorldEdits(d, [{ before, after }]);
      expectPlacedBack(occ(out), after, `${name} ${posture}`);
      stored(d).cuts.forEach((c, i) => expect(stored(out).cuts[i], `${name} ${posture} ${i}`).toBe(c));
    }
  });

  it('flat <-> upright under one mirror re-mirrors the stored cuts so the edited part stays as seen', () => {
    for (const [from, to] of [['flat', 'upright'], ['upright', 'flat'], ['on-edge', 'upright']] as const) {
      const d = doc({ ...chiralPart(from), rotation: 0 }, { rotation: 0, mirrored: true });
      const before = occ(d);
      const after = { ...before, posture: to };
      const out = applyWorldEdits(d, [{ before, after }], { keepWorld: true });
      expectPlacedBack(occ(out), after, `${from}->${to}`);
      expect(stored(out).cuts, `${from}->${to}`).not.toBe(stored(d).cuts);
    }
    // flat <-> on-edge keeps d0 = length: the stored cuts are untouched.
    const d = doc({ ...chiralPart('flat'), rotation: 0 }, { rotation: 0, mirrored: true });
    const before = occ(d);
    const out = applyWorldEdits(d, [{ before, after: { ...before, posture: 'on-edge' } }], { keepWorld: true });
    expect(stored(out).cuts).toBe(stored(d).cuts);
  });

  it('an untouched cut survives ten moves bit-identical (no float drift)', () => {
    let d = doc({ ...chiralPart('upright'), rotation: 90, position: [0.1, 0.2, 0.3] }, { rotation: 90, mirrored: true }, { rotation: 270, mirrored: true });
    const original = stored(d).cuts;
    for (let k = 0; k < 10; k += 1) {
      const before = occ(d);
      d = applyWorldEdits(d, [{ before, after: { ...before, position: [before.position[0] + 0.1, before.position[1], before.position[2] + 0.3] } }]);
    }
    expect(stored(d).cuts).toBe(original);
  });

  it('review focus 1: a resize (Properties rule) in a mirrored copy grows the copy as the mirror of the original', () => {
    const base = doc({ ...chiralPart('flat'), rotation: 0, position: [1, 0, 1] }, { rotation: 0 });
    const twin: SloydDocument = {
      ...base,
      instances: [...base.instances, { id: 'i9', name: 'Right', definition: 'd1', position: [40, 0, 3], rotation: 0, mirrored: true }],
    };
    const left = worldParts(twin).find((p) => p.id === 'i1/b1')!;
    const out = applyWorldEdits(twin, [{ before: left, after: { ...left, length: left.length + 2 } }]);
    const L = worldParts(out).find((p) => p.id === 'i1/b1')!;
    const R = worldParts(out).find((p) => p.id === 'i9/b1')!;
    // Left grew toward +X from its kept min corner; the right grew toward -X from its kept max corner.
    expect(L.position[0]).toBe(left.position[0]);
    const rBefore = worldParts(twin).find((p) => p.id === 'i9/b1')!;
    expect(R.position[0] + R.length).toBeCloseTo(rBefore.position[0] + rBefore.length, 9);
    expect(R.position[0]).toBeCloseTo(rBefore.position[0] - 2, 9);
  });

  it('translateItems moves a part inside a mirrored, turned chain by the world delta exactly', () => {
    for (const [name, A, B] of CHAINS) {
      const d = doc({ ...chiralPart('flat'), rotation: 90 }, A, B);
      const p = occ(d);
      const id = B ? 'i1/i2/b1' : 'i1/b1';
      const moved = occ(translateItems(d, [id], [2, 0.5, -1]));
      [2, 0.5, -1].forEach((dw, i) => expect(Math.abs(moved.position[i]! - (p.position[i]! + dw)), name).toBeLessThan(1e-9));
    }
  });
});
```

Add to `src/store/store.assemblies.test.ts` (it already has `load`, `s`):

```ts
describe('moves and copies inside a mirrored assembly (mirrored-instances spec §4)', () => {
  const mirroredDoc = () => {
    const d = assemblyDoc();
    return { ...d, instances: d.instances.map((i) => (i.id === 'i1' ? { ...i, mirrored: true } : i)) };
  };
  it('copyInRow inside a mirrored assembly lands at original + k*step along the WORLD axis', () => {
    load(mirroredDoc());
    s().openAssembly('i1');
    const orig = worldParts(s().doc).find((b) => b.id === 'i1/b1')!;
    s().copyInRow(['i1/b1'], 3, 0, 1, 2.5);
    const copies = worldParts(s().doc).filter((b) => b.id.startsWith('i1/') && b.name.startsWith('Side') && b.id !== 'i1/b1');
    expect(copies).toHaveLength(2);
    const xs = copies.map((c) => c.position[0] - orig.position[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(2.5, 9);
    expect(xs[1]).toBeCloseTo(5, 9);
    copies.forEach((c) => { expect(c.position[1]).toBeCloseTo(orig.position[1], 9); expect(c.position[2]).toBeCloseTo(orig.position[2], 9); });
  });
});
```

(Check `copyInRow`'s parameter order in `store.ts` — `(ids, count, axis, sign, step)` — and the fixture's part names in `src/document/treeFixtures.ts` before relying on `'Side'`; adjust the filter to the fixture, not the expectation.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/document/treeEdit.mirror.test.ts src/store/store.assemblies.test.ts < /dev/null`
Expected: FAIL on every mirrored chain (plain chains pass).

- [ ] **Step 3: Add the linear-part helpers** — `src/document/frames.ts`

```ts
/** A chain's linear part (spec §4): world vector = R(rotation) . M^mirrored . local vector. */
export interface Linear { rotation: Rotation; mirrored: boolean }
export const IDENTITY_LINEAR: Linear = { rotation: 0, mirrored: false };

/** outer . f: R(a) M^p R(b) M^q = R(a + (p ? -b : b)) M^(p xor q). */
export function composeLinear(outer: Linear, f: { rotation: Rotation; mirrored?: boolean }): Linear {
  return {
    rotation: addTurns(outer.rotation, outer.mirrored ? inverseTurn(f.rotation) : f.rotation),
    mirrored: outer.mirrored !== (f.mirrored === true),
  };
}

/** A world vector in the chain's local frame: M^m . R(-r) . w. Exact (quarter turns swap and negate). */
export function toLocal(l: Linear, w: readonly number[]): Vec3 {
  const v = rotateVec(inverseTurn(l.rotation), w);
  return l.mirrored ? [0 - v[0], v[1], v[2]] : v;
}
```

`src/document/tree.ts`: replace `containerTurn` with

```ts
/** The linear part of a container's frame chain from the root (spec §4): turns and mirrors, outermost first. */
export function containerLinear(doc: SloydDocument, path: string | null): Linear {
  if (path === null) return IDENTITY_LINEAR;
  return (instancesOn(doc, path) ?? []).reduce<Linear>((l, i) => composeLinear(l, i), IDENTITY_LINEAR);
}
```

(import `composeLinear`, `IDENTITY_LINEAR`, `type Linear` from `./frames`; drop `addTurns` from tree.ts's imports if now unused.)

`src/document/treeEdit.ts` `translateItems`: `const d = toLocal(containerLinear(doc, cPath), worldDelta);` (update its doc comment: "turned and, through a mirror, reflected into each item's container frame").

`src/store/store.ts` `copyInRow`: `const lin = containerLinear(doc, container);` and `const local = toLocal(lin, w);` (rename `turn`; update the import line: `containerLinear` replaces `containerTurn`, `toLocal` replaces `rotateVec, inverseTurn` if those become unused there — check with the build).

- [ ] **Step 4: The inverse in `lower` and `lowerEdit`** — `src/document/treeEdit.ts`

Replace `lower` with the delta helper, the mirrored branch, and the cut lowering:

```ts
/** One level down, as a DELTA (spec §5.2): the lowered turn, a draft carrying
 *  the after-state's fields at the before position, and the local position change. */
function lowerDelta(inst: Frame, upperBefore: Board, lowerBefore: Board, upperAfter: Board): { draft: Board; d: number[] } {
  const rotation = addTurns(upperAfter.rotation, inverseTurn(inst.rotation));
  const draft: Board = { ...upperAfter, rotation, position: lowerBefore.position };
  const dW = sub(upperAfter.position, upperBefore.position);
  const dS = sub(cornerShift(inst.rotation, draft), cornerShift(inst.rotation, lowerBefore));
  return { draft, d: rotateVec(inverseTurn(inst.rotation), sub(dW, dS)) };
}

/**
 * The cuts of a part lowered back through ONE mirror (mirrored-instances spec §4):
 * each world cut mirrored back along d0 of the lowered posture — except a cut
 * that is exactly the placed form of the stored cut with the same id, which maps
 * back to THAT object (mirrorCut twice is not bit-exact; repeated edits must not
 * drift). All reused, in order: the stored array itself.
 */
function lowerCuts(storedBefore: Board, draft: Board): Cut[] {
  const d0 = mirrorDim(draft);
  const size = draft[d0];
  const sameFrame = mirrorDim(storedBefore) === d0 && storedBefore[d0] === size;
  const byId = new Map(storedBefore.cuts.map((c) => [c.id, c]));
  const out = draft.cuts.map((c) => {
    const s = byId.get(c.id);
    if (s && sameFrame) {
      const placed = mirrorCut(s, d0, size);
      if (CUT_GEOMETRY_KEYS.every((k) => placed[k] === c[k])) return s;
    }
    return mirrorCut(c, d0, size);
  });
  return out.length === storedBefore.cuts.length && out.every((c, i) => c === storedBefore.cuts[i]) ? storedBefore.cuts : out;
}

/**
 * One level down: the part's after-state in an instance's frame, from its
 * after-state in the parent's frame. A position goes down as a DELTA (spec
 * §5.2): the stored value gains the inverse-rotated world change, less the
 * change in the turned box's corner offset. An axis that did not move gains
 * exactly zero, so nothing is round-tripped. Through a MIRRORED frame
 * (mirrored-instances spec §4) it lowers into the reflected coordinates the
 * placement used (mirrorPart of the stored before), then reflects back: the turn
 * negated, x by -dx' less the change in x extent, the cuts by lowerCuts.
 */
function lower(inst: Instance, upperBefore: Board, lowerBefore: Board, upperAfter: Board): Board {
  if (!inst.mirrored) {
    const { draft, d } = lowerDelta(inst, upperBefore, lowerBefore, upperAfter);
    return { ...draft, position: [lowerBefore.position[0] + d[0]!, lowerBefore.position[1] + d[1]!, lowerBefore.position[2] + d[2]!] };
  }
  const mBefore = mirrorPart(lowerBefore);
  const { draft, d } = lowerDelta(inst, upperBefore, mBefore, upperAfter);
  const dx = (0 - d[0]!) - (boardExtents(draft)[0] - boardExtents(mBefore)[0]);
  return {
    ...draft,
    rotation: inverseTurn(draft.rotation),
    position: [lowerBefore.position[0] + dx, lowerBefore.position[1] + d[1]!, lowerBefore.position[2] + d[2]!],
    cuts: lowerCuts(lowerBefore, draft),
  };
}
```

Imports in treeEdit.ts: `Frame`, `mirrorPart`, `mirrorDim` from `./frames`; `mirrorCut` from `./mirrorCut`; `Cut` type; `toLocal` from `./frames`; `containerLinear` from `./tree` (drop `containerTurn`).

In `lowerEdit`: the cut comparison and the written value both use the LOWERED cuts:

```ts
    return k === 'cuts' ? cur.cuts !== resolved.cuts : rec(before)[k] !== rec(after)[k];
```
```ts
  const valueOf = (k: string) => (k === 'position' ? [...cur.position] : k === 'rotation' ? cur.rotation : k === 'cuts' ? cur.cuts : rec(after)[k]);
```

(Unmirrored chains are unchanged: there `cur.cuts` is `after.cuts`, and `before.cuts === resolved.cuts` because `placeBoard` keeps the array — so `cur.cuts !== resolved.cuts` ⇔ `after.cuts !== before.cuts`. The existing treeEdit tests prove it.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/document src/store < /dev/null`
Expected: PASS, the existing treeEdit/tree/store tests included.

- [ ] **Step 6: Full suite and build**

Run: `npm test < /dev/null` and `npm run build < /dev/null`. Expected: all pass, build clean (no reference to `containerTurn` left: `grep -rn containerTurn src` prints nothing).

- [ ] **Step 7: Mutation-test**

Each must turn a test red: (a) in the mirrored `lower`, keep `draft.rotation` (no negation); (b) drop `- (extent change)` from `dx`; (c) `dx = d[0]` (no reflection); (d) `lowerCuts` always mirrors back (no reuse) — the ten-moves and same-object tests; (e) `sameFrame` ignores `mirrorDim` (the flat→upright test); (f) `lowerEdit` back to `before.cuts !== after.cuts`; (g) `toLocal` without the mirror; (h) `composeLinear` without the `inverseTurn` under a mirrored outer.

- [ ] **Step 8: Commit**

```bash
git add src/document/frames.ts src/document/tree.ts src/document/treeEdit.ts src/store/store.ts src/document/treeEdit.mirror.test.ts src/store/store.assemblies.test.ts
git commit -m "feat(write-back): edits through a mirror are the exact inverse of placing (mirrored instances)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Actions and UI — the Mirrored checkbox, Copy mirrored, the badge, Ungroup

**Files:**
- Modify: `src/document/treeOps.ts` (`setMirrored`, `mirroredCopy`, `ungroupItem`)
- Modify: `src/document/tree.ts` (`TreeRow.mirrored`, `treeRows`)
- Modify: `src/store/store.ts` (`mirrorAssembly`, `copyMirrored` in `StoreState` and the store)
- Modify: `src/panels/Properties.tsx` (`InstanceProperties`)
- Modify: `src/panels/PartsList.tsx` (badge)
- Test: `src/document/treeOps.test.ts`, `src/store/store.assemblies.test.ts`, `src/panels/Properties.test.tsx`, `src/panels/PartsList.test.tsx`

**Interfaces:**
- Consumes: `withMirror`, mirror-aware `placeBoard` / `placeInstance` (Task 1); exact write-back (Task 2).
- Produces: `setMirrored(doc, path: string, mirrored: boolean): SloydDocument`; `mirroredCopy(doc, path: string): { doc: SloydDocument; path: string } | null`; store `mirrorAssembly(path: string, mirrored: boolean): void`, `copyMirrored(path: string): void`; `TreeRow.mirrored?: true`.

- [ ] **Step 1: Write the failing document-level tests** — append to `src/document/treeOps.test.ts`

```ts
describe('mirrored instances: toggle, copy, ungroup (mirrored-instances spec §5)', () => {
  const bounds = (d: SloydDocument, prefix: string) => boardsBounds(worldParts(d).filter((b) => b.id.startsWith(prefix)))!;

  it('setMirrored flips the flag and keeps the assembly\'s world bounds; a no-op returns the same doc', () => {
    const d = assemblyDoc();
    const out = setMirrored(d, 'i1', true);
    expect(instanceAt(out, 'i1')!.mirrored).toBe(true);
    const a = bounds(d, 'i1/'); const b = bounds(out, 'i1/');
    [0, 1, 2].forEach((k) => { expect(b.min[k]).toBeCloseTo(a.min[k]!, 9); expect(b.max[k]).toBeCloseTo(a.max[k]!, 9); });
    expect(setMirrored(d, 'i1', false)).toBe(d);
    const back = setMirrored(out, 'i1', false);
    expect('mirrored' in instanceAt(back, 'i1')!).toBe(false);
  });

  it('setMirrored really mirrors: a one-handed part\'s world solids are the reflection about the box centre', () => {
    const d = assemblyDoc();
    const out = setMirrored(d, 'i1', true);
    const box = bounds(d, 'i1/');
    // i1 is turned 90: its local X runs along world Z, so the reflection is about the box's Z centre.
    const cz = (box.min[2]! + box.max[2]!) / 2;
    const reflect = (s: { min: number[]; max: number[] }) => [s.min[0]!, s.min[1]!, 2 * cz - s.max[2]!, s.max[0]!, s.max[1]!, 2 * cz - s.min[2]!];
    const before = worldParts(d).find((b) => b.id === 'i1/b1')!;
    const after = worldParts(out).find((b) => b.id === 'i1/b1')!;
    expect(sameSet(worldSolids(after).map((s) => [...s.min, ...s.max]), worldSolids(before).map(reflect))).toBe(true);
  });

  it('mirroredCopy: a shared, opposite-flag copy abutting on the original\'s local +X side, uniquely named', () => {
    const d = assemblyDoc();
    const r = mirroredCopy(d, 'i1')!;
    const copy = instanceAt(r.doc, r.path)!;
    expect(copy.definition).toBe(instanceAt(d, 'i1')!.definition);
    expect(copy.mirrored).toBe(true);
    expect(copy.name).not.toBe('Drawer');
    const a = bounds(r.doc, 'i1/'); const c = bounds(r.doc, `${r.path}/`);
    // i1 is turned 90: rotateVec(90, [1,0,0]) = [0,0,-1], so the copy sits on world -Z, touching.
    expect(c.max[2]).toBeCloseTo(a.min[2]!, 9);
    expect(c.min[0]).toBeCloseTo(a.min[0]!, 9);
    expect(c.max[0]).toBeCloseTo(a.max[0]!, 9);
    expect(c.min[1]).toBeCloseTo(a.min[1]!, 9);
    const again = mirroredCopy(r.doc, r.path)!;
    expect('mirrored' in instanceAt(again.doc, again.path)!).toBe(false);
  });

  it('Ungroup of a mirrored assembly leaves every world part bit-identical; lifted parts are plain', () => {
    const d = setMirrored(assemblyDoc(), 'i1', true);
    const before = worldParts(d).filter((b) => b.id.startsWith('i1/'));
    const r = ungroupItem(d, 'i1')!;
    const after = worldParts(r.doc);
    for (const b of before) {
      const lifted = after.find((x) => x.name === b.name && Math.abs(x.position[0] - b.position[0]) < 1e-12)!;
      expect(lifted, b.name).toBeDefined();
      expect(worldSolids(lifted)).toEqual(worldSolids(b));
    }
  });

  it('review focus 5: Make Unique of a mirrored copy keeps the flag and every world part', () => {
    const base = assemblyDoc();
    const twin = { ...base, instances: [...base.instances, { ...base.instances[0]!, id: 'i3', name: 'Drawer 2', position: [30, 0, 0] as [number, number, number], mirrored: true }] };
    const before = worldParts(twin).filter((b) => b.id.startsWith('i3/'));
    const out = makeUniqueItem(twin, 'i3')!;
    expect(instanceAt(out, 'i3')!.mirrored).toBe(true);
    expect(worldParts(out).filter((b) => b.id.startsWith('i3/'))).toEqual(before);
  });

  it('review focus 4: turning a mirrored assembly keeps its box centre and min height', () => {
    const d = setMirrored(assemblyDoc(), 'i1', true);
    const a = bounds(d, 'i1/');
    const b = bounds(turnInstance(d, 'i1', 180), 'i1/');
    expect((b.min[0]! + b.max[0]!) / 2).toBeCloseTo((a.min[0]! + a.max[0]!) / 2, 9);
    expect((b.min[2]! + b.max[2]!) / 2).toBeCloseTo((a.min[2]! + a.max[2]!) / 2, 9);
    expect(b.min[1]).toBeCloseTo(a.min[1]!, 9);
  });
});
```

Add the imports this needs (`setMirrored`, `mirroredCopy` from `./treeOps`; `boardsBounds` exists; `worldSolids`, `sameSet` exist; `SloydDocument` type exists). The `assemblyDoc` fixture: `i1` (Drawer, turned 90) holding `b1` (`chiralPart('flat')`), `b2`, and nested `i2` — read `src/document/treeFixtures.ts` and derive the bounds expectations from it if any line above disagrees (fix the derivation in the test, and say so in the report). If `ungroupItem` cannot find a lifted part by name+x, match by world solids instead.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/treeOps.test.ts < /dev/null` — Expected: FAIL (functions missing).

- [ ] **Step 3: Implement** — `src/document/treeOps.ts`

```ts
/**
 * Flip an assembly placement's mirror (mirrored-instances spec §5), keeping its
 * world box: turnInstance's rule (keep the box centre and min height), exact
 * because the mirror-aware placeBoard reflects the box onto a box of the same
 * extents. An assembly with no parts keeps its position. Same doc for a no-op.
 */
export function setMirrored(doc: SloydDocument, path: string, mirrored: boolean): SloydDocument {
  const inst = instanceAt(doc, path);
  const def = definitionAt(doc, path);
  if (!inst || !def || (inst.mirrored === true) === mirrored) return doc;
  const inner = partsBelow(doc, def);
  const box = (f: Instance) => boardsBounds(inner.map((b) => placeBoard(f, b)));
  const flipped = withMirror(inst, mirrored);
  const before = box(inst);
  const after = box(flipped);
  const position: [number, number, number] = before && after
    ? [
        inst.position[0] + ((before.min[0] + before.max[0]) - (after.min[0] + after.max[0])) / 2,
        inst.position[1],
        inst.position[2] + ((before.min[2] + before.max[2]) - (after.min[2] + after.max[2])) / 2,
      ]
    : [...inst.position];
  return updateContainer(doc, parentPath(path), (c) => ({
    ...c,
    instances: c.instances.map((i) => (i.id === inst.id ? { ...flipped, position } : i)),
  }));
}

/**
 * Copy mirrored (spec §5): a shared copy with the OPPOSITE flag whose world box
 * abuts the original's on the original's local +X side (turned with it), the
 * other two axes matching. Named among its siblings. Null when nothing resolves.
 */
export function mirroredCopy(doc: SloydDocument, path: string): { doc: SloydDocument; path: string } | null {
  const inst = instanceAt(doc, path);
  const def = definitionAt(doc, path);
  const container = parentPath(path);
  const c = containerAt(doc, container);
  if (!inst || !def || !c) return null;
  const inner = partsBelow(doc, def);
  const box = (f: Instance) => boardsBounds(inner.map((b) => placeBoard(f, b)));
  const draft = withMirror(shareInstance(inst), inst.mirrored !== true);
  const a = box(inst);
  const b = box(draft);
  const position: [number, number, number] = [...inst.position];
  if (a && b) {
    const dir = rotateVec(inst.rotation, [1, 0, 0]);
    const axis = dir[0] !== 0 ? 0 : 2;
    for (const k of [0, 1, 2]) {
      const shift = k !== axis ? a.min[k]! - b.min[k]!
        : dir[axis]! > 0 ? a.max[k]! - b.min[k]! : a.min[k]! - b.max[k]!;
      position[k] = inst.position[k]! + shift;
    }
  }
  const copy: Instance = { ...draft, position, name: uniqueName(inst.name, [...c.boards, ...c.instances]) };
  return { doc: insertItems(doc, container, { instances: [copy] }), path: joinPath(container, copy.id) };
}
```

Imports: `withMirror`, `rotateVec` from `./frames`. In `ungroupItem`, a shaped part lifted through a MIRRORED instance must come out plain (its world cuts are reflected, its Shape's are not):

```ts
    const named: StoredBoard = isShaped(b) && inst.mirrored !== true
```

(and extend that line's comment: "— except through a mirror, whose reflected cuts the Shape does not hold (mirrored-instances spec §5)").

`src/document/tree.ts`: `TreeRow` gains `mirrored?: true`; in `treeRows`' assembly row add `...(inst.mirrored ? { mirrored: true as const } : {})`.

- [ ] **Step 4: Run** — `npx vitest run src/document < /dev/null` — Expected: PASS.

- [ ] **Step 5: Store tests** — append to `src/store/store.assemblies.test.ts`

```ts
describe('Mirrored and Copy mirrored (mirrored-instances spec §5)', () => {
  it('mirrorAssembly flips in place, one undo entry; a no-op pushes none; undo restores', () => {
    const before = s().doc;
    const n = s().past.length;
    s().mirrorAssembly('i1', true);
    expect(instanceAt(s().doc, 'i1')!.mirrored).toBe(true);
    expect(s().past.length).toBe(n + 1);
    s().mirrorAssembly('i1', true);
    expect(s().past.length).toBe(n + 1);
    s().undo();
    expect(s().doc).toBe(before);
  });
  it('copyMirrored adds a shared mirrored copy, selects it, one undo entry', () => {
    const n = s().past.length;
    s().copyMirrored('i1');
    const path = s().selectedIds[0]!;
    expect(path).not.toBe('i1');
    expect(instanceAt(s().doc, path)!.mirrored).toBe(true);
    expect(instanceAt(s().doc, path)!.definition).toBe(instanceAt(s().doc, 'i1')!.definition);
    expect(s().past.length).toBe(n + 1);
  });
  it('Duplicate and Copy in a row keep the flag (spec §5)', () => {
    s().mirrorAssembly('i1', true);
    s().duplicateBoards(['i1']);
    expect(instanceAt(s().doc, s().selectedIds[0]!)!.mirrored).toBe(true);
    s().copyInRow(['i1'], 2, 0, 1, 50);
    const row = s().doc.instances.filter((i) => i.definition === instanceAt(s().doc, 'i1')!.definition);
    expect(row.every((i) => i.mirrored === true)).toBe(true);
  });
  it('a tape anchor on a part of the flipped assembly is dropped (the world moved, invariant 24)', () => {
    s().setTapeAnchor(heldOn('i1/b1'));
    s().mirrorAssembly('i1', true);
    expect(s().tapeAnchor).toBeNull();
  });
  it('review focus 2: Link a part inside a mirrored copy with its twin outside keeps both world geometries', () => {
    s().copyMirrored('i1');
    const copy = s().selectedIds[0]!;
    // Ungroup the ORIGINAL so its b1 is a loose part at the root, equal to the copy's b1 in its own frame.
    s().selectItem('i1', false);
    s().ungroupSelected();
    const loose = worldParts(s().doc).find((b) => !b.id.includes('/') && b.name === 'Side')!;
    const inCopy = worldParts(s().doc).find((b) => b.id === `${copy}/b1`)!;
    const solidsOf = (id: string) => worldSolids(worldParts(s().doc).find((b) => b.id === id)!);
    const a = solidsOf(loose.id); const b = solidsOf(inCopy.id);
    s().linkBoards([loose.id, inCopy.id]);
    expect(solidsOf(loose.id)).toEqual(a);
    expect(solidsOf(inCopy.id)).toEqual(b);
  });
});
```

(Import `worldSolids` from `../document/designCheck`. Read `treeFixtures.ts` for the part names; `linkBoards` may refuse two parts whose shared fields differ — if it refuses, the test still asserts nothing moved; if it LINKS and either geometry changes, that is a defect to REPORT, not to fix in Link silently.)

- [ ] **Step 6: Implement the store actions** — `src/store/store.ts`

In `StoreState` (beside `turnAssembly`):

```ts
  /** Flip an assembly's mirror in place, keeping its world box (mirrored-instances spec §5). */
  mirrorAssembly: (path: string, mirrored: boolean) => void;
  /** Place a shared, opposite-flag copy beside the assembly and select it (spec §5). */
  copyMirrored: (path: string) => void;
```

In the store (beside `turnAssembly`):

```ts
    mirrorAssembly: (path, mirrored) => {
      const next = setMirrored(get().doc, path, mirrored);
      if (next === get().doc) return; // invariant 4
      edit(() => next);
      // The assembly's parts moved (reflected), in every copy if it is nested in a shared definition.
      judgeHeld();
    },

    copyMirrored: (path) => {
      const r = mirroredCopy(get().doc, path);
      if (!r) return;
      edit(() => r.doc, () => [r.path]);
    },
```

(Import `setMirrored`, `mirroredCopy` through the same `../document/document` import the store uses for `turnInstance`.) If `judgeHeld` keeps a held point whose part only reflected (same id), check `dropHeldIfGone`'s rule: a point no longer on offer must drop. If the tape-anchor test fails because the reflected part still offers that exact point, the point is genuinely still there — report it instead of forcing a drop.

- [ ] **Step 7: UI** — `src/panels/Properties.tsx` `InstanceProperties`, under the Turn field (inside Orientation):

```tsx
      <div className="field">
        <label>
          <input type="checkbox" checked={inst.mirrored === true}
            onChange={(e) => useStore.getState().mirrorAssembly(path, e.target.checked)} />
          {' '}Mirrored
        </label>
      </div>
```

and in the button row, right after Duplicate:

```tsx
        <button onClick={() => useStore.getState().copyMirrored(path)}>Copy mirrored</button>
```

`src/panels/PartsList.tsx`, beside the `part-copies` badge:

```tsx
              {r.mirrored && (
                <span className="part-mirrored" role="img" aria-label="Mirrored">⇋</span>
              )}
```

Tests — `src/panels/Properties.test.tsx` (follow the file's existing render/select pattern for an assembly):

```tsx
  it('an assembly\'s Mirrored checkbox flips it, and Copy mirrored adds a mirrored copy', async () => {
    useStore.getState().replaceDocument(assemblyDoc());
    act(() => useStore.getState().selectItem('i1', false));
    render(<Properties />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mirrored' }));
    expect(instanceAt(useStore.getState().doc, 'i1')!.mirrored).toBe(true);
    expect(screen.getByRole('checkbox', { name: 'Mirrored' })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Copy mirrored' }));
    const copy = useStore.getState().selectedIds[0]!;
    expect('mirrored' in instanceAt(useStore.getState().doc, copy)!).toBe(false);
  });
```

`src/panels/PartsList.test.tsx`:

```tsx
  it('a mirrored assembly row shows the Mirrored badge; an unmirrored one does not', () => {
    const d = assemblyDoc();
    useStore.getState().replaceDocument({ ...d, instances: d.instances.map((i) => ({ ...i, mirrored: true })) });
    render(<PartsList />);
    expect(screen.getAllByRole('img', { name: 'Mirrored' })).toHaveLength(1);
  });
```

- [ ] **Step 8: Run, full suite, build** — `npm test < /dev/null`, `npm run build < /dev/null` — Expected: all pass.

- [ ] **Step 9: Mutation-test** — each must turn a test red: (a) `setMirrored` without the position adjustment; (b) `mirroredCopy` with the same flag as the original; (c) `mirroredCopy` abutting on −X instead of the turned +X; (d) `ungroupItem` keeping a shaped part shaped through a mirror (build a fixture with a shaped part in `i1` for this — add a test if none goes red: Ungroup of a mirrored assembly holding a shaped part keeps its world solids); (e) `mirrorAssembly` without `judgeHeld()`; (f) the store's no-op guard removed; (g) the badge rendered for every assembly.

- [ ] **Step 10: Commit**

```bash
git add src/document/treeOps.ts src/document/tree.ts src/store/store.ts src/panels/Properties.tsx src/panels/PartsList.tsx src/document/treeOps.test.ts src/store/store.assemblies.test.ts src/panels/Properties.test.tsx src/panels/PartsList.test.tsx
git commit -m "feat(assemblies): Mirrored checkbox, Copy mirrored, the badge; Ungroup through a mirror

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Refine, the cut list, joinery, and the record

**Files:**
- Modify: `src/document/refineDesign.ts` (`RefusalReason`, `documentToDesign`)
- Test: `src/document/refineDesign.test.ts`, `src/document/cutlist.test.ts`, `src/generate/joints/mirrored.test.ts` (create)
- Modify: `CLAUDE.md` (Versioning, invariants 44 and 46), `docs/follow-ups.md` (225)

**Interfaces:**
- Consumes: everything above. `findSites`, `applyJoints`, `defaultChoice`, `gateUnjoin`, `writeBackFlat`, `flatDocument`, `designToDocument` as used in `src/generate/joints/unjoin.test.ts` and `src/generate/run.ts`.

- [ ] **Step 1: Failing tests**

`src/document/refineDesign.test.ts`:

```ts
  it('refuses a design containing a mirrored assembly (mirrored-instances spec §6)', () => {
    const d = designToDocument({ name: 'P', parts: [], assemblies: [{ name: 'Side', parts: [{ name: 'A', role: '', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 1, z: 4 } }], placements: [{ name: 'L', at: { x: 0, y: 0, z: 0 } }, { name: 'R', at: { x: 30, y: 0, z: 0 } }] }] }).doc;
    const m = { ...d, instances: d.instances.map((i, k) => (k === 1 ? { ...i, mirrored: true } : i)) };
    expect(documentToDesign(m, { distinct: 12, placed: 48 })).toEqual({ refused: { reason: 'mirrored', message: "Refine can't describe a mirrored assembly yet — Ungroup the mirrored copy first." } });
    expect('design' in documentToDesign(d, { distinct: 12, placed: 48 })).toBe(true);
  });
```

`src/document/cutlist.test.ts` (use the file's imports; `buildCutList` takes a `FlatDocument`):

```ts
describe('mirrored copies on the cut list (mirrored-instances spec §6)', () => {
  const pair = (b: Board): SloydDocument => ({
    ...createDocument('Pair'),
    instances: [
      { id: 'l', name: 'Left', definition: 'd', position: [0, 0, 0], rotation: 0 },
      { id: 'r', name: 'Right', definition: 'd', position: [40, 0, 0], rotation: 0, mirrored: true },
    ],
    definitions: [{ id: 'd', boards: [{ ...b, id: 'p' }], instances: [] }],
  });
  it('a one-handed part and its mirror are two rows; a symmetric part is one row of 2', () => {
    expect(buildCutList(flatDocument(pair(chiralPart('flat')))).rows).toHaveLength(2);
    const plain = createBoard({ name: 'Plain', length: 20, width: 6, thickness: 0.75 });
    const rows = buildCutList(flatDocument(pair(plain))).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.qty).toBe(2);
  });
});
```

(Read `cutlist.ts`'s `CutList` / row shape for the field names — `rows`, `qty` — and use the real ones.)

`src/generate/joints/mirrored.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { designToDocument } from '../../document/generated';
import { flatDocument, writeBackFlat, worldParts } from '../../document/document';
import type { Board, SloydDocument } from '../../document/document';
import { worldSolids } from '../../document/designCheck';
import { sameSet } from '../../document/turnFixtures';
import { applyJoints } from './recipes';
import { findSites } from './sites';
import { defaultChoice } from './choose';
import { gateUnjoin } from './unjoin';

/** A leg-and-rail side frame placed twice: left plain, right a mirrored copy far enough away not to touch. */
const pairDoc = (extra = false): SloydDocument => {
  const d = designToDocument({
    name: 'Pair',
    parts: extra ? [{ name: 'Shelf', role: '', material: 'pine', at: { x: 41.75 - 18, y: 10, z: 0 }, size: { x: 18, y: 0.75, z: 1.75 } }] : [],
    assemblies: [{
      name: 'Side',
      parts: [
        { name: 'Leg', role: '', material: 'pine', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 } },
        { name: 'Rail', role: '', material: 'pine', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3.5, z: 0.75 } },
      ],
      placements: [{ name: 'Left', at: { x: 0, y: 0, z: 0 } }, { name: 'Right', at: { x: 60, y: 0, z: 0 } }],
    }],
  }, { centre: false }).doc;
  return { ...d, instances: d.instances.map((i, k) => (k === 1 ? { ...i, mirrored: true } : i)) };
};
const join = (doc: SloydDocument) => {
  const flat = flatDocument(doc);
  const sites = findSites(flat);
  const joined = applyJoints(flat, sites, sites.map((s) => defaultChoice(s, flat, sites))).doc;
  return { flat, joined, out: writeBackFlat(doc, flat.boards, joined.boards) };
};
const solids = (bs: readonly Board[]) => bs.flatMap((b) => worldSolids(b).map((s) => [...s.min, ...s.max]));

describe('joinery on a mirrored pair (mirrored-instances spec §6)', () => {
  it('a mirror-symmetric pair joins as ONE shared definition, matching joinery\'s output, and passes the gate', () => {
    const { joined, out } = join(pairDoc());
    expect(joined.boards.some((b) => b.cuts.length > 0)).toBe(true);
    expect(out.definitions).toHaveLength(1);
    expect(sameSet(solids(worldParts(out)), solids(joined.boards))).toBe(true);
    expect('refused' in gateUnjoin(flatDocument(out))).toBe(false);
  });
  it('review focus 3: a part touching only the right half splits the definition; the world still matches', () => {
    const { joined, out } = join(pairDoc(true));
    expect(out.definitions.length).toBeGreaterThan(1);
    expect(sameSet(solids(worldParts(out)), solids(joined.boards))).toBe(true);
  });
});
```

Check the fixture before trusting it: with `centre: false`, `Right` sits at x = 60 and, mirrored, its parts span x ∈ [60 − 19.75, 60] = [40.25, 60]; the extra Shelf spans x ∈ [23.75, 41.75] at y 10 — it must TOUCH the right half's leg (at x [58.25, 60]? no — recompute) and NOT the left. Derive the right half's world boxes by hand (`worldParts(pairDoc())`, print them in a scratch test, then position the Shelf so it butts one right-half part end-on and is clear of the left half), and adjust the Shelf numbers, not the assertions. If `findSites` finds no site for the Shelf, move it until it does; say in your report where it ended up and why.

- [ ] **Step 2: Run to verify** — the Refine test fails (no refusal); the cut-list and joinery tests should PASS already (Tasks 1–2 did the work). If a joinery test fails, STOP and report — do not change joinery.

- [ ] **Step 3: Implement the refusal** — `src/document/refineDesign.ts`

```ts
export type RefusalReason = 'empty' | 'cuts' | 'turned' | 'nested' | 'too-large' | 'joints' | 'mirrored';
```

In `documentToDesign`, right after the `cuts` refusal and BEFORE the `turned` one:

```ts
  if (doc.instances.some((i) => i.mirrored === true) || doc.definitions.some((d) => d.instances.some((i) => i.mirrored === true))) {
    return refuse('mirrored', "Refine can't describe a mirrored assembly yet — Ungroup the mirrored copy first.");
  }
```

Check every `switch`/map over `RefusalReason` (`grep -rn "RefusalReason\|reason ===" src`) compiles and handles the new value.

- [ ] **Step 4: Run, full suite, build** — `npm test < /dev/null`, `npm run build < /dev/null`.

- [ ] **Step 5: Mutation-test** — (a) remove the refusal; (b) in the cut-list test use `mirrored: false` for `r` (the chiral case must merge to one row — proves the test sees the mirror); (c) in `lowerCuts`, always mirror back (the joinery shared-definition test should still pass — geometry-equal — but the gate or the shared count may change: record what happens); (d) drop `mirrored` from the right placement in `pairDoc` (the shared-definition test must still pass — an unmirrored pair is shared too — so instead mutate `mirrorPart`'s cut reflection off and confirm the joinery world-match test goes red).

- [ ] **Step 6: The record**

`CLAUDE.md`:
- Versioning: `CURRENT_VERSION` is **13**; add the row
  `| 12→13 | \`Instance.mirrored\` (only \`true\` stored) | document-level, no step | wrong geometry (a mirrored copy drawn unmirrored) |`
  and in "The deployment rule"'s rollback paragraph change `version: 12` to `version: 13`.
- Invariant 44: append "The composition is the second caller of `mirrorCutAlong` (`mirrorCut`, moved verbatim to `mirrorCut.ts`): a mirrored frame reflects a part (`mirrorPart`: turn negated, cuts along the posture's turn-0 X dimension, min corner reflected)."
- Invariant 46: append a bullet: "**A mirrored instance (schema 13) is a step inside the ONE composition** (`placeBoard`/`placeInstance` reflect first); write-back is its exact inverse (`lower`: positions as deltas, turn negated, `lowerCuts` reuses an untouched stored cut object). World→local vectors go through `toLocal(containerLinear(…))`, never a hand-written turn. Refine refuses a mirrored assembly."
- `src/` tree: `frames.ts` line mentions the mirror; add `mirrorCut.ts`.

`docs/follow-ups.md`, entry 225: under its "Mirrored instances" bullet add "— DONE 2026-10-11 by the mirrored-instances round (schema 13); the rest of 225 stays out of scope by decision."

- [ ] **Step 7: Commit**

```bash
git add src/document/refineDesign.ts src/document/refineDesign.test.ts src/document/cutlist.test.ts src/generate/joints/mirrored.test.ts CLAUDE.md docs/follow-ups.md
git commit -m "feat(mirrored): Refine refuses a mirrored assembly; cut list and joinery pinned; record schema 13

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

The live browser check (spec §7) is the controller's, after the final review: a cabinet with a one-handed dado, Copy mirrored, the dado mirrored in 3D; a cut edited on the right half appears mirrored on the left; the cut list's rows — recorded in `docs/browser-verification-mirrored-instances.md`.
