# Assemblies (round 1 of components) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parts can be grouped into nested assemblies (a real definition/instance tree, every definition used once) that are selected, moved, turned, duplicated and hidden as one thing, and edited by opening them, as in SketchUp.

**Architecture:** The document gains `instances` (the root's assemblies) and `definitions` (document-wide, referenced by id). Four pure document-layer modules carry the tree:
- `frames.ts`: one composition step;
- `tree.ts`: reading, including `worldParts`;
- `treeEdit.ts`: writing world edits back;
- `treeOps.ts`: group, ungroup, copy, remove, turn.

`treeRepair.ts` handles loading. Every reader of placed parts reads `worldParts(doc)` or `flatDocument(doc)`, and every store edit of a part goes through `mapWorld`. Moves are world deltas rotated into each item's container frame.

**Tech Stack:** TypeScript, React 18, Zustand, react-three-fiber, Vitest + RTL. `npm test` (Vitest), `npm run build` (tsc gate).

**Spec:** `docs/superpowers/specs/2026-10-06-sloyd-assemblies-design.md`. Read it in full, including §10 (amendments), before Task 1.

## Global Constraints

- `CURRENT_VERSION` becomes **10**. A v9 file loads with `instances: []` and `definitions: []`; a version above 10 is refused.
- Occurrence id = instance ids then part id, joined by `/` (`i1/i2/b3`); a root part's id is its plain id. `/` may never appear inside a stored id.
- Part and instance ids are unique **within their container**, in one `seen` set; definition ids are unique document-wide; cut ids stay per board.
- Names are unique **among siblings**: the parts and instances of one container, checked together. Display path separator is ` › ` (space, U+203A, space).
- A new instance: origin `[0, 0, 0]`, rotation `0`, name `Assembly N` (first free N from 1 among siblings).
- `worldParts` order: a container's parts in document order, then each of its instances in order, depth first. `worldParts` returns the **same array** for the same document object, and `doc.boards` itself when `doc.instances` is empty.
- `worldParts` carries each part's **own** name. Only `flatDocument` carries display paths.
- Every move is a world delta rotated into the item's container frame with `rotateVec(inverseTurn(containerTurn))`, then added to the stored `position` (a part) or origin (an instance). Never route an absolute position through world space and back.
- Write-back compares `position` **element by element**, `cuts` by reference, other fields by `!==`; only changed fields are written.
- No component may subscribe to `gesturing` (invariant 34). Selectors over `worldParts(s.doc)` are allowed only because it is cached by document identity.
- **Every task ends with BOTH `npm test` AND `npm run build` green.** `npm test` does not typecheck.
- Mutation-test every new test that guards an ordering, a refusal, an exactness or a "cannot exceed" property: break the code it guards, see it red, restore it (CLAUDE.md, follow-up 155).
- Commit to a branch `assemblies`; merge to `master` with `--no-ff` at the end. No pull requests.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A part inside a turned, translated assembly edited through any Properties field** (length, material, a cut) must keep its stored local `position` bit-identical. Pinned in Task 4 and Task 8.
2. **An id that is an instance path or a nested occurrence**, passed to any store action that used to look up `doc.boards`, must act, not silently do nothing. Pinned in Tasks 7–10: every new store test uses `assemblyDoc()`, never root parts alone.
3. **Ancestor membership:** `i3` covers `i3/b1` and NOT `i30/b1`. Pinned in Task 3 (`isCovered`) and reused by every caller.
4. **Clicking a faded part outside the open assembly** must close the assembly and select it. That fails if BoardMesh treats faded parts as unselectable. Pinned in the Task 12 browser step and the Task 7 `clickPart` tests.
5. **Joinery on an assembled design** must give the same cut list as joinery on its flat twin, and come back tree-shaped. Pinned in Task 11.

---

## File structure

| File | Status | Responsibility |
|---|---|---|
| `src/document/ids.ts` | create | `nextId` (moved out of `document.ts` so the tree modules can mint ids without an import cycle) |
| `src/document/types.ts` | modify | `Instance`, `Definition`, two new `SloydDocument` fields |
| `src/document/names.ts` | modify | `Named`; `uniqueName` / `dedupeNames` over `{ id, name }` |
| `src/document/frames.ts` | create | `rotateVec`, `inverseTurn`, `addTurns`, `cornerShift`, `placeBoard`, `placeInstance`; the ONE composition step |
| `src/document/tree.ts` | create | paths, `isCovered`, container lookups, `partsBelow`, `worldParts`, `childrenOf`, `itemPaths`, `containerTurn`, `displayNames`, `flatDocument` |
| `src/document/treeEdit.ts` | create | `updateContainer`, `applyWorldEdits`, `mapWorld`, `translateItems`, `writeBackFlat` |
| `src/document/treeOps.ts` | create | `siblingsOf`, `nextAssemblyName`, `insertItems`, `pruneDefinitions`, `removeItems`, `groupItems`, `ungroupItem`, `copyInstanceTree`, `turnInstance` |
| `src/document/treeRepair.ts` | create | `repairTree`, `repairLinksTree` (load steps 2–7) |
| `src/document/treeFixtures.ts` | create | TEST-ONLY `assemblyDoc()` |
| `src/document/document.ts` | modify | version 10, `createDocument`, `takeId` rejects `/`, `validateInstance`, `validateDefinitions`, `migrateDocument` pipeline, re-exports |
| `src/store/assemblyPick.ts` | create | `clickTarget` (pure) |
| `src/store/visibility.ts` | modify | ancestor-aware `visibleBoards` |
| `src/store/selectionGesture.ts` | modify | `selectByClick` → `clickPart`; `selectRowByClick` |
| `src/store/store.ts` | modify | `openPath`, tree-aware selection/hidden/restore, world-routed edits, structural actions, group/ungroup/turn/rename |
| `src/viewport/*` | modify | read `worldParts`; fade, double-click, ancestor highlight, item-aware gizmo |
| `src/panels/PartsList.tsx`, `Properties.tsx`, `CopyInRow.tsx`, `CutList.tsx` | modify | tree list; instance panel; Group/Ungroup; flat cut list |
| `src/generate/run.ts` | modify | joinery on `flatDocument`, written back by index |
| `src/App.tsx` | modify | Ctrl/Cmd+G, Ctrl/Cmd+Shift+G, Escape's last rung |
| `CLAUDE.md`, `docs/follow-ups.md`, `docs/history.md`, `docs/browser-verification-assemblies.md` | modify/create | the round's record |

---

### Task 0: Branch

- [ ] **Step 1:** `cd /home/alec/docker/sloyd && git checkout -b assemblies && npm test 2>&1 | tail -3`
  Expected: 1883 tests pass.

---

### Task 1: Schema 10, the types, ids and sibling names

**Files:**
- Create: `src/document/ids.ts`
- Modify: `src/document/types.ts` (after `GuidePoint`, and in `SloydDocument`)
- Modify: `src/document/names.ts`
- Modify: `src/document/document.ts:71` (`CURRENT_VERSION`), `:89-101` (`nextId`), `:167-180` (`createDocument`), `:499-580` (`migrateDocument` return)
- Test: `src/document/document.test.ts`, `src/document/names.test.ts` (create it if it does not exist; check with `ls src/document/names.test.ts`)

**Interfaces:**
- Produces:
  - `interface Instance { id: string; name: string; definition: string; position: [number, number, number]; rotation: Rotation }`
  - `interface Definition { id: string; boards: Board[]; instances: Instance[] }`
  - `SloydDocument.instances: Instance[]` and `SloydDocument.definitions: Definition[]` (REQUIRED)
  - `nextId(): string` from `./ids`, still re-exported from `document.ts`
  - `interface Named { id: string; name: string }`
  - `uniqueName(base: string, items: readonly Named[], excludeId?: string): string`
  - `dedupeNames<T extends Named>(items: readonly T[]): T[]`

- [ ] **Step 1: Write the failing tests**

In `document.test.ts`, find the existing assertion that `CURRENT_VERSION` is 9 (`grep -n "CURRENT_VERSION" src/document/document.test.ts`) and change it to 10. Add:

```ts
describe('schema 10 (assemblies spec §2.5)', () => {
  it('createDocument has no assemblies', () => {
    const d = createDocument('X');
    expect(d.instances).toEqual([]);
    expect(d.definitions).toEqual([]);
  });

  it('a v9 file loads with empty instance and definition lists', () => {
    const v9 = { version: 9, name: 'Old', units: { display: 'imperial-fractional', precision: 16 }, stock: { kerf: 0.125 }, guides: [], boards: [] };
    const d = migrateDocument(v9);
    expect(d.version).toBe(10);
    expect(d.instances).toEqual([]);
    expect(d.definitions).toEqual([]);
  });

  it('refuses a version above 10', () => {
    expect(() => migrateDocument({ version: 11, boards: [] })).toThrow(/newer version/);
  });
});
```

In `names.test.ts`, add:

```ts
import { dedupeNames, uniqueName } from './names';

describe('names over any { id, name } (assemblies spec §2.3)', () => {
  it('uniqueName counts instances as siblings', () => {
    expect(uniqueName('Drawer', [{ id: 'i1', name: 'Drawer' }])).toBe('Drawer (1)');
  });
  it('dedupeNames keeps the item type', () => {
    const out = dedupeNames([{ id: 'a', name: 'X', extra: 1 }, { id: 'b', name: 'X', extra: 2 }]);
    expect(out.map((o) => [o.name, o.extra])).toEqual([['X', 1], ['X (1)', 2]]);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/document/document.test.ts src/document/names.test.ts`
Expected: FAIL. `instances` is undefined, the version is 9, and `extra` is a type error at build time.

- [ ] **Step 3: Implement**

`src/document/ids.ts`:

```ts
let idCounter = 0;

/**
 * A fresh id: a monotonic counter, so two ids minted in one millisecond still
 * differ. Its own module (assemblies plan, Task 1) so the tree modules can mint
 * ids without importing document.ts, which imports them. Board, guide, cut,
 * instance and definition ids all come from here. Never contains '/', the
 * occurrence-path separator (assemblies spec §2.2).
 */
export function nextId(): string {
  idCounter += 1;
  return `b_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}
```

In `document.ts`, delete the local `let idCounter` and `function nextId()`, and add `import { nextId } from './ids';` at the top. The existing `export { nextId };` line stays.

`types.ts`, after `GuidePoint`:

```ts
/**
 * An assembly placed in its parent (assemblies spec §2). `position` is the
 * frame's ORIGIN in the parent's frame, NOT a min corner: invariant 2 is a
 * rule about parts. The frame is turned about the vertical through the
 * origin, then translated. Never constructed by hand outside treeOps.ts and
 * document.ts.
 */
export interface Instance {
  id: string;
  name: string;
  /** A Definition id. */
  definition: string;
  position: [number, number, number];
  rotation: Rotation;
}

/**
 * The parts and nested assemblies of one assembly, in its own frame. Referenced
 * by id; in round 1 every definition has exactly one instance.
 */
export interface Definition {
  id: string;
  boards: Board[];
  instances: Instance[];
}
```

In `SloydDocument`, after `boards: Board[];`:

```ts
  /** The root's assemblies. The root is an implicit definition (spec §2). */
  instances: Instance[];
  /** Document-wide, referenced by Instance.definition. */
  definitions: Definition[];
```

`names.ts`: replace the `import type { Board }` line and the two signatures. The bodies are unchanged apart from the types:

```ts
/** Anything that carries a sibling-unique name: a part or an assembly. */
export interface Named { id: string; name: string }

export function uniqueName(base: string, items: readonly Named[], excludeId?: string): string {
  const wanted = base.trim();
  const taken = new Set(items.filter((b) => b.id !== excludeId).map((b) => b.name));
  if (!taken.has(wanted)) return wanted;
  const stem = SUFFIX_RE.exec(wanted)?.[1] ?? wanted;
  let n = 1;
  while (taken.has(`${stem} (${n})`)) n += 1;
  return `${stem} (${n})`;
}

export function dedupeNames<T extends Named>(items: readonly T[]): T[] {
  const out: T[] = [];
  for (const item of items) out.push({ ...item, name: uniqueName(item.name, out) });
  return out;
}
```

Keep the existing doc comments, and add one sentence to `uniqueName`'s: "Since the assemblies round, the items are one container's parts AND assemblies together (invariant 8, restated: unique among siblings)." Add `export type { Named } from './names';` beside the existing `uniqueName` re-export in `document.ts`.

`document.ts`: set `CURRENT_VERSION = 10`. In `createDocument` add `instances: [], definitions: [],` after `guides: [],`. In `migrateDocument`'s returned object add `instances: [], definitions: [],` after `guides,` (Task 6 replaces this).

- [ ] **Step 4: Fix every document literal tsc names**

Run: `npm run build 2>&1 | grep error | head -40`
Every `SloydDocument` literal missing the two fields needs `instances: [], definitions: []`. Spreads of `createDocument()` already have them. Add the fields; do not make them optional.

- [ ] **Step 5: Run everything**

Run: `npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Expected: all pass; build OK.

- [ ] **Step 6: Commit**

```bash
git add -A src && git commit -m "feat(document): schema 10 types for assemblies; ids module; sibling names

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `frames.ts`, the one composition step

**Files:**
- Create: `src/document/frames.ts`
- Test: `src/document/frames.test.ts`

**Interfaces:**
- Consumes: `Board`, `Rotation`, `Instance` (Task 1); `boardExtents` from `./geometry`
- Produces:
  - `type Vec3 = [number, number, number]`
  - `interface Frame { position: readonly number[]; rotation: Rotation }` (an `Instance` satisfies it)
  - `rotateVec(r: Rotation, v: readonly number[]): Vec3`: R(90)(x,y,z) = (z, y, −x); R(180) = (−x, y, −z); R(270) = (−z, y, x); R(0) copies
  - `inverseTurn(r: Rotation): Rotation`
  - `addTurns(a: Rotation, b: Rotation): Rotation`
  - `cornerShift(r: Rotation, b: Board): Vec3`
  - `placeBoard(f: Frame, b: Board): Board`
  - `placeInstance(f: Frame, j: Instance): Instance`

- [ ] **Step 1: Write the failing tests**

```ts
import { addTurns, inverseTurn, placeBoard, placeInstance, rotateVec } from './frames';
import { chiralPart, rotateQuarter, sameSet } from './turnFixtures';
import { worldSolids } from './designCheck';
import { createBoard } from './document';
import type { Instance, Posture, Rotation } from './types';

const TURNS: Rotation[] = [0, 90, 180, 270];
const POSTURES: Posture[] = ['flat', 'on-edge', 'upright'];

describe('rotateVec', () => {
  it('a quarter turn is turnFixtures.rotateQuarter about the origin, the turn axisFrame uses', () => {
    const p: [number, number, number] = [1.3, 2.7, -0.9];
    expect(rotateVec(90, p)).toEqual(rotateQuarter(p, [0, 0, 0]));
  });
  it('composes by addition', () => {
    const p = [1.3, 2.7, -0.9];
    for (const a of TURNS) for (const b of TURNS) {
      expect(rotateVec(a, rotateVec(b, p))).toEqual(rotateVec(addTurns(a, b), p));
    }
  });
  it('inverseTurn undoes a turn', () => {
    for (const r of TURNS) expect(addTurns(r, inverseTurn(r))).toBe(0);
  });
});

describe('placeBoard (assemblies spec §2.1)', () => {
  it('the identity frame moves nothing, bit for bit, on decimal and millimetre values', () => {
    const b = createBoard({ position: [0.1, 0.2, 300 / 25.4], length: 7.3, rotation: 270, posture: 'on-edge' });
    const out = placeBoard({ position: [0, 0, 0], rotation: 0 }, b);
    expect(out.position).toEqual(b.position);
    expect(out.rotation).toBe(b.rotation);
  });

  // The proof that a placed part is the same part turned: every solid of the
  // placed part is the corresponding solid rotated by R and translated by the
  // origin. chiralPart, because a symmetric fixture passes a mirror (inv 44).
  it('is a true rotation for every posture, part turn and frame turn', () => {
    const origin = [3.3, 1.7, -2.9];
    for (const posture of POSTURES) for (const rb of TURNS) for (const rf of TURNS) {
      const b = { ...chiralPart(posture), rotation: rb, position: [0.4, 0.6, -1.2] as [number, number, number] };
      const placed = placeBoard({ position: origin, rotation: rf }, b);
      const expected = worldSolids(b).map((s) => {
        const a = rotateVec(rf, s.min), c = rotateVec(rf, s.max);
        return [0, 1, 2].flatMap((i) => [Math.min(a[i]!, c[i]!) + origin[i]!, Math.max(a[i]!, c[i]!) + origin[i]!]);
      });
      const got = worldSolids(placed).map((s) => [0, 1, 2].flatMap((i) => [s.min[i]!, s.max[i]!]));
      expect(sameSet(got, expected), `${posture} rb=${rb} rf=${rf}`).toBe(true);
    }
  });
});

describe('placeInstance', () => {
  it('placing through a composed frame agrees with placing twice, within rounding', () => {
    const outer: Instance = { id: 'o', name: 'O', definition: 'd', position: [10.1, 0.3, 3.3], rotation: 90 };
    const inner: Instance = { id: 'i', name: 'I', definition: 'e', position: [0.7, 1.1, 2.3], rotation: 270 };
    const b = { ...chiralPart('upright'), rotation: 180 as Rotation, position: [0.2, 0.1, 0.05] as [number, number, number] };
    const twice = placeBoard(outer, placeBoard(inner, b));
    const once = placeBoard(placeInstance(outer, inner), b);
    expect(once.rotation).toBe(twice.rotation);
    once.position.forEach((v, i) => expect(v).toBeCloseTo(twice.position[i]!, 9));
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/document/frames.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement `frames.ts`**

```ts
import type { Board, Instance, Rotation } from './types';
import { boardExtents } from './geometry';

export type Vec3 = [number, number, number];

/** Where a frame sits in its parent: an Instance satisfies this. */
export interface Frame { position: readonly number[]; rotation: Rotation }

/**
 * A vector turned by r about the vertical, counter-clockwise from above: the
 * SAME turn axisFrame's table makes for a part (invariant 44), so a part's turn
 * and its assemblies' turns compose by addition. Quarter turns only swap and
 * negate, so this is exact.
 */
export function rotateVec(r: Rotation, v: readonly number[]): Vec3 {
  switch (r) {
    case 90: return [v[2]!, v[1]!, -v[0]!];
    case 180: return [-v[0]!, v[1]!, -v[2]!];
    case 270: return [-v[2]!, v[1]!, v[0]!];
    default: return [v[0]!, v[1]!, v[2]!];
  }
}

export function inverseTurn(r: Rotation): Rotation { return ((360 - r) % 360) as Rotation; }
export function addTurns(a: Rotation, b: Rotation): Rotation { return ((a + b) % 360) as Rotation; }

/**
 * Where the min corner of `b`'s box lands, relative to the turned position,
 * when the box is turned by r: turning [p, p+e] puts the new min at R(p) plus
 * this. Depends only on the extents, so it is exact.
 */
export function cornerShift(r: Rotation, b: Board): Vec3 {
  const [ex, , ez] = boardExtents(b);
  switch (r) {
    case 90: return [0, 0, -ex];
    case 180: return [-ex, 0, -ez];
    case 270: return [-ez, 0, 0];
    default: return [0, 0, 0];
  }
}

const isIdentity = (f: Frame) =>
  f.rotation === 0 && f.position[0] === 0 && f.position[1] === 0 && f.position[2] === 0;

/**
 * A part in a child frame, expressed in its parent's frame: THE composition
 * step for parts (assemblies spec §2.1). worldParts applies it once per level,
 * innermost first, and Ungroup applies the same one step, which is why Ungroup
 * leaves direct children bit-identical. The identity frame returns the part's
 * own coordinates untouched, which is why Group moves nothing, bit for bit.
 * Evaluated as (origin + R(p)) + shift, in that order, everywhere.
 */
export function placeBoard(f: Frame, b: Board): Board {
  if (isIdentity(f)) return { ...b, position: [b.position[0], b.position[1], b.position[2]] };
  const rp = rotateVec(f.rotation, b.position);
  const s = cornerShift(f.rotation, b);
  return {
    ...b,
    rotation: addTurns(f.rotation, b.rotation),
    position: [
      f.position[0]! + rp[0] + s[0],
      f.position[1]! + rp[1] + s[1],
      f.position[2]! + rp[2] + s[2],
    ],
  };
}

/** A nested instance's frame, expressed in its parent's frame. An origin is a
 *  point, so it has no corner shift. Ungroup's step for nested assemblies. */
export function placeInstance(f: Frame, j: Instance): Instance {
  const rp = rotateVec(f.rotation, j.position);
  return {
    ...j,
    rotation: addTurns(f.rotation, j.rotation),
    position: [f.position[0]! + rp[0], f.position[1]! + rp[1], f.position[2]! + rp[2]],
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/document/frames.test.ts`
Expected: PASS.

- [ ] **Step 5: Mutate**

Change `case 90: return [v[2]!, v[1]!, -v[0]!];` to `[-v[2]!, v[1]!, v[0]!]`. The rotation and the equivariance tests must go red. Then change `cornerShift`'s 90 case to `[0, 0, 0]`; equivariance must go red. Restore both.

- [ ] **Step 6: Full gate, then commit**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git add src/document/frames.ts src/document/frames.test.ts && git commit -m "feat(document): frames.ts — the one composition step for assemblies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `tree.ts`, reading the tree

**Files:**
- Create: `src/document/tree.ts`, `src/document/treeFixtures.ts` (TEST-ONLY)
- Modify: `src/document/document.ts` (re-export `tree.ts` and `frames.ts`)
- Test: `src/document/tree.test.ts`

**Interfaces:**
- Consumes: `placeBoard`, `addTurns` (Task 2)
- Produces:
  - **Paths:** `joinPath(parent: string | null, id: string): string`, `parentPath(path: string): string | null`, `lastSegment(path: string): string`, `isCovered(path: string, ids: ReadonlySet<string>): boolean`
  - **Lookups:** `interface Container { boards: Board[]; instances: Instance[] }`, `instancesOn(doc, path: string): Instance[] | null`, `instanceAt(doc, path: string): Instance | null`, `definitionAt(doc, path: string): Definition | null`, `containerAt(doc, path: string | null): Container | null`, `partAt(doc, occ: string): Board | null`, `containerTurn(doc, path: string | null): Rotation`
  - **Flattening:** `partsBelow(doc, c: Container): Board[]` (ids relative to `c`), `worldParts(doc): Board[]`
  - **Item sets:** `childrenOf(doc, path: string | null): string[]`, `itemPaths(doc): Set<string>`
  - **Names:** `displayNames(doc): Map<string, string>`, `flatDocument(doc): SloydDocument`
  - **Test fixture:** `assemblyDoc(): SloydDocument`

- [ ] **Step 1: Write the fixture**

`treeFixtures.ts`:

```ts
import { createBoard, createDocument } from './document';
import type { Definition, Instance, SloydDocument } from './types';
import { chiralPart } from './turnFixtures';

/**
 * TEST-ONLY (assemblies plan). A root part, a drawer turned 90° and moved off
 * the grid, holding a chiral side, a millimetre front and a nested peg turned
 * 270°. Decimal and millimetre values everywhere, so a round trip through
 * world space shows up in a bit-exact assertion. Occurrences: r1, i1/b1,
 * i1/b2, i1/i2/b3. Instance paths: i1, i1/i2.
 */
export function assemblyDoc(): SloydDocument {
  const b3 = createBoard({ id: 'b3', name: 'Pin', length: 3.7, width: 1.3, thickness: 0.6, position: [0.35, 0.1, 0.2], rotation: 90 });
  const d2: Definition = { id: 'd2', boards: [b3], instances: [] };
  const b1 = { ...chiralPart('flat'), id: 'b1', name: 'Side', position: [0.1, 0.2, 0.3] as [number, number, number], rotation: 180 as const };
  const b2 = createBoard({ id: 'b2', name: 'Front', length: 300 / 25.4, width: 4.1, thickness: 0.7, position: [1.1, 0, 2.7], posture: 'on-edge' });
  const i2: Instance = { id: 'i2', name: 'Peg', definition: 'd2', position: [0.7, 1.1, 2.3], rotation: 270 };
  const d1: Definition = { id: 'd1', boards: [b1, b2], instances: [i2] };
  const r1 = createBoard({ id: 'r1', name: 'Top', position: [-5.3, 0, 0.1] });
  const i1: Instance = { id: 'i1', name: 'Drawer', definition: 'd1', position: [10.1, 0.3, 3.3], rotation: 90 };
  return { ...createDocument('Fixture'), boards: [r1], instances: [i1], definitions: [d1, d2] };
}
```

- [ ] **Step 2: Write the failing tests**

```ts
import {
  childrenOf, containerTurn, displayNames, flatDocument, instanceAt, isCovered, itemPaths,
  parentPath, partAt, worldParts,
} from './tree';
import { placeBoard } from './frames';
import { assemblyDoc } from './treeFixtures';
import { createDocument, createBoard } from './document';

describe('paths', () => {
  it('isCovered matches an ancestor, never a prefix of an id', () => {
    const set = new Set(['i3']);
    expect(isCovered('i3', set)).toBe(true);
    expect(isCovered('i3/b1', set)).toBe(true);
    expect(isCovered('i3/i7/b1', set)).toBe(true);
    expect(isCovered('i30/b1', set)).toBe(false);
    expect(isCovered('b1', set)).toBe(false);
  });
  it('parentPath', () => {
    expect(parentPath('b1')).toBeNull();
    expect(parentPath('i1/i2/b3')).toBe('i1/i2');
  });
});

describe('worldParts (assemblies spec §2.1)', () => {
  it('orders root parts, then each instance depth first, parts before nested instances', () => {
    expect(worldParts(assemblyDoc()).map((b) => b.id)).toEqual(['r1', 'i1/b1', 'i1/b2', 'i1/i2/b3']);
  });
  it('places innermost first, one step per level', () => {
    const doc = assemblyDoc();
    const [i1] = doc.instances;
    const i2 = instanceAt(doc, 'i1/i2')!;
    const b3 = partAt(doc, 'i1/i2/b3')!;
    const world = worldParts(doc).find((b) => b.id === 'i1/i2/b3')!;
    const expected = placeBoard(i1!, placeBoard(i2, b3));
    expect(world.position).toEqual(expected.position);
    expect(world.rotation).toBe(expected.rotation);
  });
  it('carries own names, never paths', () => {
    expect(worldParts(assemblyDoc()).map((b) => b.name)).toEqual(['Top', 'Side', 'Front', 'Pin']);
  });
  it('returns the same array for the same document', () => {
    const doc = assemblyDoc();
    expect(worldParts(doc)).toBe(worldParts(doc));
  });
  it("returns the document's own boards when there are no instances", () => {
    const doc = { ...createDocument(), boards: [createBoard()] };
    expect(worldParts(doc)).toBe(doc.boards);
  });
  it('does not loop on a definition that contains itself', () => {
    const doc = assemblyDoc();
    const looped = { ...doc, definitions: doc.definitions.map((d) => d.id === 'd2'
      ? { ...d, instances: [{ id: 'ix', name: 'Loop', definition: 'd2', position: [0, 0, 0] as [number, number, number], rotation: 0 as const }] }
      : d) };
    expect(worldParts(looped).map((b) => b.id)).toEqual(['r1', 'i1/b1', 'i1/b2', 'i1/i2/b3']);
  });
});

describe('item sets', () => {
  it('childrenOf lists parts then instances of one container', () => {
    const doc = assemblyDoc();
    expect(childrenOf(doc, null)).toEqual(['r1', 'i1']);
    expect(childrenOf(doc, 'i1')).toEqual(['i1/b1', 'i1/b2', 'i1/i2']);
    expect(childrenOf(doc, 'nope')).toEqual([]);
  });
  it('itemPaths holds every instance path and every occurrence', () => {
    expect([...itemPaths(assemblyDoc())].sort()).toEqual(['i1', 'i1/b1', 'i1/b2', 'i1/i2', 'i1/i2/b3', 'r1']);
  });
  it('containerTurn sums the turns on the path', () => {
    const doc = assemblyDoc();
    expect(containerTurn(doc, null)).toBe(0);
    expect(containerTurn(doc, 'i1')).toBe(90);
    expect(containerTurn(doc, 'i1/i2')).toBe(0);
  });
});

describe('flatDocument', () => {
  it('names each part by its display path and has no tree', () => {
    const flat = flatDocument(assemblyDoc());
    expect(flat.boards.map((b) => b.name)).toEqual(['Top', 'Drawer › Side', 'Drawer › Front', 'Drawer › Peg › Pin']);
    expect(flat.instances).toEqual([]);
    expect(flat.definitions).toEqual([]);
    expect(displayNames(assemblyDoc()).get('i1/i2/b3')).toBe('Drawer › Peg › Pin');
  });
  it('places parts exactly as worldParts does', () => {
    const doc = assemblyDoc();
    expect(flatDocument(doc).boards.map((b) => b.position)).toEqual(worldParts(doc).map((b) => b.position));
  });
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run src/document/tree.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 4: Implement `tree.ts`**

```ts
import type { Board, Definition, Instance, Rotation, SloydDocument } from './types';
import { addTurns, placeBoard } from './frames';

/** A container's contents: the root (the document itself) or a definition. */
export interface Container { boards: Board[]; instances: Instance[] }

export const PATH_SEPARATOR = '/';
export const NAME_SEPARATOR = ' › ';

export function joinPath(parent: string | null, id: string): string {
  return parent === null ? id : `${parent}${PATH_SEPARATOR}${id}`;
}
export function parentPath(path: string): string | null {
  const i = path.lastIndexOf(PATH_SEPARATOR);
  return i < 0 ? null : path.slice(0, i);
}
export function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf(PATH_SEPARATOR) + 1);
}

/**
 * True when `path` or one of its ancestor paths is in `ids`: THE membership
 * test for "selected", "hidden" and "grabbed under the selection" since
 * assemblies (spec §3). Walks whole segments, so `i3` covers `i3/b1` and never
 * `i30/b1`. A bare startsWith is the plausible wrong version.
 */
export function isCovered(path: string, ids: ReadonlySet<string>): boolean {
  for (let p: string | null = path; p !== null; p = parentPath(p)) if (ids.has(p)) return true;
  return false;
}

const defsOf = (doc: SloydDocument) => new Map(doc.definitions.map((d) => [d.id, d]));

/** The instances from the root down to the one `path` names, or null. */
export function instancesOn(doc: SloydDocument, path: string): Instance[] | null {
  const defs = defsOf(doc);
  const out: Instance[] = [];
  let c: Container = doc;
  for (const seg of path.split(PATH_SEPARATOR)) {
    const inst = c.instances.find((i) => i.id === seg);
    if (!inst) return null;
    out.push(inst);
    const d = defs.get(inst.definition);
    if (!d) return null;
    c = d;
  }
  return out;
}

export function instanceAt(doc: SloydDocument, path: string): Instance | null {
  return instancesOn(doc, path)?.at(-1) ?? null;
}
export function definitionAt(doc: SloydDocument, path: string): Definition | null {
  const inst = instanceAt(doc, path);
  return inst ? doc.definitions.find((d) => d.id === inst.definition) ?? null : null;
}
export function containerAt(doc: SloydDocument, path: string | null): Container | null {
  return path === null ? doc : definitionAt(doc, path);
}
export function partAt(doc: SloydDocument, occ: string): Board | null {
  return containerAt(doc, parentPath(occ))?.boards.find((b) => b.id === lastSegment(occ)) ?? null;
}
/** The sum of the turns of the instances on `path`: how the container's frame is turned in the world. */
export function containerTurn(doc: SloydDocument, path: string | null): Rotation {
  if (path === null) return 0;
  return (instancesOn(doc, path) ?? []).reduce<Rotation>((r, i) => addTurns(r, i.rotation), 0);
}

/**
 * Every part below `c`, in `c`'s frame, ids relative to `c`: c's parts in
 * order, then each instance depth first, placed innermost first, one
 * placeBoard per level (spec §2.1). A definition already on the current path is
 * skipped, so a cycle the load repair missed cannot hang the app.
 */
export function partsBelow(doc: SloydDocument, c: Container, defs = defsOf(doc), onPath = new Set<string>()): Board[] {
  const out: Board[] = [...c.boards];
  for (const inst of c.instances) {
    const d = defs.get(inst.definition);
    if (!d || onPath.has(d.id)) continue;
    const inner = partsBelow(doc, d, defs, new Set([...onPath, d.id]));
    for (const b of inner) out.push(placeBoard(inst, { ...b, id: joinPath(inst.id, b.id) }));
  }
  return out;
}

const worldCache = new WeakMap<SloydDocument, Board[]>();

/**
 * The placed parts, each a self-contained world Board with its occurrence id
 * and its OWN name (spec §2.1, §10). THE flattening: every reader of placed
 * parts reads this or flatDocument, never the tree. Cached per document
 * object, so a useStore selector over it is stable (invariant 43's selector
 * rule), and the document's own `boards` when it has no instances.
 */
export function worldParts(doc: SloydDocument): Board[] {
  if (doc.instances.length === 0) return doc.boards;
  const hit = worldCache.get(doc);
  if (hit) return hit;
  const out = partsBelow(doc, doc);
  worldCache.set(doc, out);
  return out;
}

/** The item paths directly in a container: its parts, then its instances. */
export function childrenOf(doc: SloydDocument, path: string | null): string[] {
  const c = containerAt(doc, path);
  if (!c) return [];
  return [...c.boards.map((b) => joinPath(path, b.id)), ...c.instances.map((i) => joinPath(path, i.id))];
}

/** Every instance path and every part occurrence id. */
export function itemPaths(doc: SloydDocument): Set<string> {
  const out = new Set<string>();
  const defs = defsOf(doc);
  const walk = (c: Container, path: string | null, onPath: Set<string>) => {
    for (const b of c.boards) out.add(joinPath(path, b.id));
    for (const inst of c.instances) {
      const p = joinPath(path, inst.id);
      out.add(p);
      const d = defs.get(inst.definition);
      if (d && !onPath.has(d.id)) walk(d, p, new Set([...onPath, d.id]));
    }
  };
  walk(doc, null, new Set());
  return out;
}

/** Occurrence id -> display path (`Drawer 2 › Side`). */
export function displayNames(doc: SloydDocument): Map<string, string> {
  const out = new Map<string, string>();
  const defs = defsOf(doc);
  const walk = (c: Container, path: string | null, prefix: string, onPath: Set<string>) => {
    for (const b of c.boards) out.set(joinPath(path, b.id), prefix + b.name);
    for (const inst of c.instances) {
      const d = defs.get(inst.definition);
      if (d && !onPath.has(d.id)) walk(d, joinPath(path, inst.id), `${prefix}${inst.name}${NAME_SEPARATOR}`, new Set([...onPath, d.id]));
    }
  };
  walk(doc, null, '', new Set());
  return out;
}

/**
 * The document as flat parts named by their display paths, with no tree
 * (spec §2.1). What the cut list and joinery read. The names are built HERE so
 * the string the cut list measures is the string it draws (invariant 19).
 */
export function flatDocument(doc: SloydDocument): SloydDocument {
  if (doc.instances.length === 0) return doc;
  const names = displayNames(doc);
  return {
    ...doc,
    boards: worldParts(doc).map((b) => ({ ...b, name: names.get(b.id) ?? b.name })),
    instances: [],
    definitions: [],
  };
}
```

In `document.ts`, add beside the other re-exports:

```ts
export * from './frames';
export * from './tree';
```

- [ ] **Step 5: Run the tests, then mutate**

Run: `npx vitest run src/document/tree.test.ts`
Expected: PASS.

Mutate:
- Replace `isCovered`'s body with `return [...ids].some((a) => path.startsWith(a));`. The first test must go red. Restore.
- Remove `worldCache.set(doc, out);`. The "same array" test must go red. Restore.

- [ ] **Step 6: Full gate, then commit**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git add src/document && git commit -m "feat(document): tree.ts — worldParts, paths, flatDocument

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `treeEdit.ts`, writing world edits back

**Files:**
- Create: `src/document/treeEdit.ts`
- Modify: `src/document/document.ts` (re-export)
- Test: `src/document/treeEdit.test.ts`

**Interfaces:**
- Consumes: Tasks 2–3; `boardExtents` from `./geometry`
- Produces:
  - `updateContainer(doc, path: string | null, fn: (c: Container) => Container): SloydDocument`
  - `interface WorldEdit { before: Board; after: Board }`: `before.id` is the occurrence id
  - `applyWorldEdits(doc, edits: readonly WorldEdit[]): SloydDocument`
  - `mapWorld(doc, fn: (world: Board[]) => Board[]): SloydDocument`: `fn` may change entries but NOT the length; it throws `Error('mapWorld: ...')` on a length change, and returns `doc` itself when `fn` returns the same array
  - `translateItems(doc, ids: readonly string[], worldDelta: readonly number[]): SloydDocument`
  - `writeBackFlat(doc, flatBefore: readonly Board[], flatAfter: readonly Board[]): SloydDocument`: pairs by index, throws on a length mismatch

- [ ] **Step 1: Write the failing tests**

```ts
import { applyWorldEdits, mapWorld, translateItems, writeBackFlat } from './treeEdit';
import { flatDocument, instanceAt, partAt, worldParts } from './tree';
import { assemblyDoc } from './treeFixtures';
import { boardCenter, reorientedPosition } from './geometry';
import type { Board } from './types';

const edit = (doc: ReturnType<typeof assemblyDoc>, id: string, f: (b: Board) => Board) =>
  mapWorld(doc, (w) => w.map((b) => (b.id === id ? f(b) : b)));

describe('mapWorld write-back (assemblies spec §5.2)', () => {
  it('a Length edit inside a turned, translated assembly leaves the stored position bit-identical', () => {
    const doc = assemblyDoc();
    const before = partAt(doc, 'i1/b2')!;
    const out = edit(doc, 'i1/b2', (b) => ({ ...b, length: 13 }));
    const after = partAt(out, 'i1/b2')!;
    expect(after.length).toBe(13);
    after.position.forEach((v, i) => expect(v).toBe(before.position[i]));
    expect(after.rotation).toBe(before.rotation);
  });

  it('a cut edit, a material edit and a rename write only themselves', () => {
    const doc = assemblyDoc();
    const before = partAt(doc, 'i1/i2/b3')!;
    const out = edit(doc, 'i1/i2/b3', (b) => ({ ...b, name: 'Dowel', material: 'oak', cuts: [] }));
    const after = partAt(out, 'i1/i2/b3')!;
    expect([after.name, after.material, after.cuts]).toEqual(['Dowel', 'oak', []]);
    after.position.forEach((v, i) => expect(v).toBe(before.position[i]));
  });

  it('a fresh but equal position array is not a change', () => {
    const doc = assemblyDoc();
    const before = partAt(doc, 'i1/b2')!;
    const out = edit(doc, 'i1/b2', (b) => ({ ...b, position: [...b.position] as [number, number, number] }));
    partAt(out, 'i1/b2')!.position.forEach((v, i) => expect(v).toBe(before.position[i]));
  });

  it('a removed key is removed from the stored part', () => {
    const doc = assemblyDoc();
    const linked = edit(doc, 'i1/b2', (b) => ({ ...b, link: 'L1' }));
    expect(partAt(linked, 'i1/b2')!.link).toBe('L1');
    const unlinked = edit(linked, 'i1/b2', ({ link: _l, ...rest }) => rest);
    expect('link' in partAt(unlinked, 'i1/b2')!).toBe(false);
  });

  it('a world move lands where it was asked, and an axis that did not move gains exactly zero', () => {
    const doc = assemblyDoc();
    const before = partAt(doc, 'i1/b2')!;
    const w = worldParts(doc).find((b) => b.id === 'i1/b2')!;
    const out = edit(doc, 'i1/b2', (b) => ({ ...b, position: [b.position[0] + 1.3, b.position[1], b.position[2]] }));
    const moved = worldParts(out).find((b) => b.id === 'i1/b2')!;
    expect(moved.position[0]).toBeCloseTo(w.position[0] + 1.3, 9);
    expect(moved.position[2]).toBeCloseTo(w.position[2], 9);
    // i1 is turned 90°: world X is the part frame's Z, so its X and Y are untouched, bit for bit.
    const after = partAt(out, 'i1/b2')!;
    expect(after.position[0]).toBe(before.position[0]);
    expect(after.position[1]).toBe(before.position[1]);
  });

  it('a reorient pivoted in world space lands centred where the pivot put it', () => {
    const doc = assemblyDoc();
    const w = worldParts(doc).find((b) => b.id === 'i1/i2/b3')!;
    const patch = { posture: 'upright' as const };
    const out = edit(doc, 'i1/i2/b3', (b) => ({ ...b, ...patch, position: reorientedPosition(b, patch) }));
    const got = worldParts(out).find((b) => b.id === 'i1/i2/b3')!;
    const want = { ...w, ...patch, position: reorientedPosition(w, patch) };
    boardCenter(got).forEach((v, i) => expect(v).toBeCloseTo(boardCenter(want)[i]!, 9));
  });

  it('returns the same document when nothing changes, and throws on a length change', () => {
    const doc = assemblyDoc();
    expect(mapWorld(doc, (w) => w)).toBe(doc);
    expect(() => mapWorld(doc, (w) => w.slice(1))).toThrow(/mapWorld/);
  });

  it('a root part edit is plain assignment, as before assemblies', () => {
    const doc = assemblyDoc();
    const out = edit(doc, 'r1', (b) => ({ ...b, position: [b.position[0] + 0.1, b.position[1], b.position[2]] }));
    expect(out.boards[0]!.position[0]).toBe(doc.boards[0]!.position[0] + 0.1);
  });
});

describe('translateItems (assemblies spec §4.2)', () => {
  it('a root item gains the delta exactly, as translateBoards did', () => {
    const doc = assemblyDoc();
    const out = translateItems(doc, ['r1', 'i1'], [0.1, 0, 0.3]);
    expect(out.boards[0]!.position).toEqual([-5.3 + 0.1, 0 + 0, 0.1 + 0.3]);
    expect(instanceAt(out, 'i1')!.position).toEqual([10.1 + 0.1, 0.3 + 0, 3.3 + 0.3]);
  });
  it('an item in a turned container gains the delta rotated into that frame', () => {
    const doc = assemblyDoc();
    const out = translateItems(doc, ['i1/i2', 'i1/b2'], [1, 0, 0]);
    // i1 is turned 90°: world +X is the frame's +Z; the frame's X gains exactly -0.
    expect(instanceAt(out, 'i1/i2')!.position).toEqual([0.7, 1.1, 2.3 + 1]);
    const w0 = worldParts(doc).find((b) => b.id === 'i1/b2')!;
    const w1 = worldParts(out).find((b) => b.id === 'i1/b2')!;
    expect(w1.position[0]).toBeCloseTo(w0.position[0] + 1, 9);
  });
});

describe('writeBackFlat (assemblies spec §6.1)', () => {
  it('maps flat parts back by index, path names never written as renames', () => {
    const doc = assemblyDoc();
    const flat = flatDocument(doc).boards;
    const joined = flat.map((b, i) => (i === 1 ? { ...b, id: 'reminted', cuts: [] } : { ...b, id: `x${i}` }));
    const out = writeBackFlat(doc, flat, joined);
    expect(partAt(out, 'i1/b1')!.cuts).toEqual([]);
    expect(partAt(out, 'i1/b1')!.name).toBe('Side');
    expect(partAt(out, 'i1/b2')).toEqual(partAt(doc, 'i1/b2'));
  });
  it('throws when the count changed', () => {
    const doc = assemblyDoc();
    const flat = flatDocument(doc).boards;
    expect(() => writeBackFlat(doc, flat, flat.slice(1))).toThrow(/count/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/document/treeEdit.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement `treeEdit.ts`**

```ts
import type { Board, Instance, SloydDocument } from './types';
import { boardExtents } from './geometry';
import { addTurns, cornerShift, inverseTurn, placeBoard, rotateVec } from './frames';
import type { Container } from './tree';
import { containerTurn, definitionAt, instancesOn, joinPath, lastSegment, parentPath, partAt, worldParts } from './tree';

/** Replace one container's contents: the root's, or a definition's. */
export function updateContainer(doc: SloydDocument, path: string | null, fn: (c: Container) => Container): SloydDocument {
  if (path === null) {
    const c = fn({ boards: doc.boards, instances: doc.instances });
    return { ...doc, boards: c.boards, instances: c.instances };
  }
  const d = definitionAt(doc, path);
  if (!d) return doc;
  const c = fn({ boards: d.boards, instances: d.instances });
  return { ...doc, definitions: doc.definitions.map((x) => (x.id === d.id ? { ...x, boards: c.boards, instances: c.instances } : x)) };
}

export interface WorldEdit { before: Board; after: Board }

const samePosition = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const sub = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];

/**
 * One level down: the part's after-state in an instance's frame, from its
 * after-state in the parent's frame. A position goes down as a DELTA (spec
 * §5.2): the stored value gains the inverse-rotated world change, less the
 * change in the turned box's corner offset. An axis that did not move gains
 * exactly zero, so nothing is round-tripped.
 */
function lower(inst: Instance, upperBefore: Board, lowerBefore: Board, upperAfter: Board): Board {
  const rotation = addTurns(upperAfter.rotation, inverseTurn(inst.rotation));
  const draft: Board = { ...upperAfter, rotation, position: lowerBefore.position };
  if (samePosition(upperAfter.position, upperBefore.position) && upperAfter.rotation === upperBefore.rotation) return draft;
  const dW = sub(upperAfter.position, upperBefore.position);
  const dS = sub(cornerShift(inst.rotation, draft), cornerShift(inst.rotation, lowerBefore));
  const d = rotateVec(inverseTurn(inst.rotation), sub(dW, dS));
  return { ...draft, position: [lowerBefore.position[0] + d[0], lowerBefore.position[1] + d[1], lowerBefore.position[2] + d[2]] };
}

/**
 * Write world-space edits back into the tree (spec §5.1, §5.2). Only changed
 * fields are written: `position` compared element by element, `cuts` by
 * reference, everything else by `!==`. `position` and `rotation` go down
 * level by level through `lower`; every other field is part-local and goes
 * back as it is. A key present before and absent after is deleted (an unlink).
 * A root part's write is plain assignment, exactly as before assemblies.
 */
export function applyWorldEdits(doc: SloydDocument, edits: readonly WorldEdit[]): SloydDocument {
  const byContainer = new Map<string | null, Map<string, Board>>();
  for (const { before, after } of edits) {
    const occ = before.id;
    const cPath = parentPath(occ);
    const stored = partAt(doc, occ);
    if (!stored) continue;
    const chain = cPath === null ? [] : instancesOn(doc, cPath) ?? [];
    const reps: Board[] = [];
    reps[chain.length] = stored;
    for (let j = chain.length - 1; j >= 0; j -= 1) reps[j] = placeBoard(chain[j]!, reps[j + 1]!);
    let cur = after;
    for (let j = 0; j < chain.length; j += 1) cur = lower(chain[j]!, reps[j]!, reps[j + 1]!, cur);

    const moved = !samePosition(before.position, after.position) || before.rotation !== after.rotation;
    const next: Record<string, unknown> = { ...stored };
    const rec = (b: Board) => b as unknown as Record<string, unknown>;
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (k === 'id') continue;
      if (k === 'position' || k === 'rotation') {
        if (moved) next[k] = k === 'position' ? [...cur.position] : cur.rotation;
        continue;
      }
      const changed = k === 'cuts' ? before.cuts !== after.cuts : rec(before)[k] !== rec(after)[k];
      if (!changed) continue;
      if (k in after) next[k] = rec(after)[k];
      else delete next[k];
    }
    if (!byContainer.has(cPath)) byContainer.set(cPath, new Map());
    byContainer.get(cPath)!.set(stored.id, next as unknown as Board);
  }
  let out = doc;
  for (const [cPath, parts] of byContainer) {
    out = updateContainer(out, cPath, (c) => ({ ...c, boards: c.boards.map((b) => parts.get(b.id) ?? b) }));
  }
  return out;
}

/**
 * Run a per-part function over the world parts and write what it changed back
 * (spec §5.1): the ONE way the store edits a part. `fn` may replace entries,
 * never add or remove them.
 */
export function mapWorld(doc: SloydDocument, fn: (world: Board[]) => Board[]): SloydDocument {
  const world = worldParts(doc);
  const next = fn(world);
  if (next === world) return doc;
  if (next.length !== world.length) throw new Error(`mapWorld: ${world.length} parts in, ${next.length} out`);
  const edits = world.flatMap((b, i) => (next[i] !== b ? [{ before: b, after: next[i]! }] : []));
  return edits.length === 0 ? doc : applyWorldEdits(doc, edits);
}

/**
 * Move items (parts or instances) by one WORLD delta (spec §4.2): rotated into
 * each item's container frame (exact, a quarter turn only swaps and negates)
 * and added to its stored position or origin. A root item gains the delta
 * exactly, as translateBoards did. Nothing rounds (invariant 25).
 */
export function translateItems(doc: SloydDocument, ids: readonly string[], worldDelta: readonly number[]): SloydDocument {
  const byContainer = new Map<string | null, Set<string>>();
  for (const id of ids) {
    const c = parentPath(id);
    if (!byContainer.has(c)) byContainer.set(c, new Set());
    byContainer.get(c)!.add(lastSegment(id));
  }
  let out = doc;
  for (const [cPath, members] of byContainer) {
    const d = rotateVec(inverseTurn(containerTurn(doc, cPath)), worldDelta);
    const shift = (p: readonly number[]): [number, number, number] => [p[0]! + d[0], p[1]! + d[1], p[2]! + d[2]];
    out = updateContainer(out, cPath, (c) => ({
      boards: c.boards.map((b) => (members.has(b.id) ? { ...b, position: shift(b.position) } : b)),
      instances: c.instances.map((i) => (members.has(i.id) ? { ...i, position: shift(i.position) } : i)),
    }));
  }
  return out;
}

/**
 * Joinery's way back (spec §6.1): `applyJoints` re-mints occurrence ids (they
 * contain '/'), so its parts are paired with the flattened "before" BY INDEX.
 * Every recipe keeps the count and order of parts; a mismatch is our bug, so
 * it throws. Compared against the same flattened before, the path names are
 * equal and never written back as renames.
 */
export function writeBackFlat(doc: SloydDocument, flatBefore: readonly Board[], flatAfter: readonly Board[]): SloydDocument {
  if (flatBefore.length !== flatAfter.length) {
    throw new Error(`writeBackFlat: part count changed (${flatBefore.length} -> ${flatAfter.length})`);
  }
  const edits = flatBefore.map((before, i) => ({ before, after: { ...flatAfter[i]!, id: before.id } }));
  return applyWorldEdits(doc, edits);
}
```

Do NOT re-export `joinPath` from this file: `document.ts` star-exports both `tree.ts` and `treeEdit.ts`, and a name exported by both is a tsc ambiguity error (TS2308). Add `export * from './treeEdit';` to `document.ts`.

`boardExtents` is not needed in this file if the build flags it unused; delete the import.

- [ ] **Step 4: Run the tests, then mutate**

Run: `npx vitest run src/document/treeEdit.test.ts`
Expected: PASS.

Mutate:
1. In `applyWorldEdits`, change `if (moved) next[k] = ...` to always assign. The Length-edit test must go red: it is THE exactness guard, so confirm it, don't assume it. Restore.
2. Replace `samePosition(before.position, after.position)` with `before.position === after.position`. The "fresh equal array" test must go red. Restore.
3. In `lower`, drop `- dS` (use `sub(dW, [0, 0, 0])`). The reorient test must go red. Restore.

- [ ] **Step 5: Full gate, then commit**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git add src/document && git commit -m "feat(document): treeEdit.ts — write world edits back by delta, only changed fields

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `treeOps.ts`, the structural operations

**Files:**
- Create: `src/document/treeOps.ts`
- Modify: `src/document/document.ts` (re-export)
- Test: `src/document/treeOps.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4; `uniqueName`, `Named`; `nextId` from `./ids`; `boardsBounds` from `./geometry`
- Produces:
  - `siblingsOf(doc, path: string | null): Named[]`: the container's parts and instances
  - `nextAssemblyName(siblings: readonly Named[]): string`: `Assembly 1`, `Assembly 2`, …
  - `insertItems(doc, path: string | null, add: { boards?: Board[]; instances?: Instance[]; definitions?: Definition[] }): SloydDocument`
  - `pruneDefinitions(doc): SloydDocument`: keeps definitions reachable from the root, in their existing order
  - `removeItems(doc, paths: readonly string[]): SloydDocument`: removes items, then prunes
  - `type Rekey = (path: string) => string`
  - `groupItems(doc, container: string | null, paths: readonly string[]): { doc: SloydDocument; path: string; rekey: Rekey } | null`
  - `ungroupItem(doc, path: string): { doc: SloydDocument; children: string[]; rekey: Rekey } | null`
  - `copyInstanceTree(doc, inst: Instance): { instance: Instance; definitions: Definition[] }`
  - `turnInstance(doc, path: string, rotation: Rotation): SloydDocument`

- [ ] **Step 1: Write the failing tests**

```ts
import { copyInstanceTree, groupItems, nextAssemblyName, pruneDefinitions, removeItems, turnInstance, ungroupItem } from './treeOps';
import { childrenOf, instanceAt, partAt, worldParts } from './tree';
import { assemblyDoc } from './treeFixtures';
import { boardsBounds } from './geometry';
import { worldSolids } from './designCheck';
import { rotateQuarter, sameSet } from './turnFixtures';
import { createBoard } from './document';

const strip = (b: { id: string }) => ({ ...b, id: '' });

describe('groupItems (assemblies spec §4.1)', () => {
  it('moves nothing, bit for bit, at the root', () => {
    const doc = assemblyDoc();
    const before = worldParts(doc);
    const r = groupItems(doc, null, ['r1', 'i1'])!;
    const after = new Map(worldParts(r.doc).map((b) => [b.id, b]));
    for (const b of before) expect(strip(after.get(r.rekey(b.id))!)).toEqual(strip(b));
    expect(r.path).toBe(childrenOf(r.doc, null)[0]);
  });

  it('moves nothing, bit for bit, inside a turned assembly', () => {
    const doc = assemblyDoc();
    const before = worldParts(doc);
    const r = groupItems(doc, 'i1', ['i1/b1', 'i1/i2'])!;
    const after = new Map(worldParts(r.doc).map((b) => [b.id, b]));
    for (const b of before) expect(strip(after.get(r.rekey(b.id))!)).toEqual(strip(b));
    expect(r.rekey('i1/i2/b3')).toBe(`${r.path}/i2/b3`);
    expect(r.rekey('i1/b2')).toBe('i1/b2');
  });

  it('names the new assembly Assembly N among its siblings', () => {
    const doc = assemblyDoc();
    const a = groupItems(doc, null, ['r1'])!;
    expect(instanceAt(a.doc, a.path)!.name).toBe('Assembly 1');
    const b = groupItems(a.doc, null, ['i1'])!;
    expect(instanceAt(b.doc, b.path)!.name).toBe('Assembly 2');
    expect(nextAssemblyName([{ id: 'x', name: 'Assembly 1' }])).toBe('Assembly 2');
  });

  it('refuses nothing to group and ids that are not direct children', () => {
    const doc = assemblyDoc();
    expect(groupItems(doc, null, [])).toBeNull();
    expect(groupItems(doc, null, ['i1/b1'])).toBeNull();
  });
});

describe('ungroupItem (assemblies spec §4.1, §10)', () => {
  it('leaves direct child parts bit-identical and deeper parts within rounding', () => {
    const doc = assemblyDoc();
    const before = worldParts(doc);
    const r = ungroupItem(doc, 'i1')!;
    const after = new Map(worldParts(r.doc).map((b) => [b.id, b]));
    for (const id of ['i1/b1', 'i1/b2']) {
      expect(strip(after.get(r.rekey(id))!)).toEqual(strip(before.find((b) => b.id === id)!));
    }
    const deep = after.get(r.rekey('i1/i2/b3'))!;
    const was = before.find((b) => b.id === 'i1/i2/b3')!;
    deep.position.forEach((v, i) => expect(v).toBeCloseTo(was.position[i]!, 9));
    expect(deep.rotation).toBe(was.rotation);
  });

  it('re-mints a colliding id and dedupes a colliding name, then prunes the definition', () => {
    const doc = assemblyDoc();
    const clash = { ...doc, boards: [...doc.boards, createBoard({ id: 'b1', name: 'Side' })] };
    const r = ungroupItem(clash, 'i1')!;
    const ids = childrenOf(r.doc, null);
    expect(new Set(ids).size).toBe(ids.length);
    const names = r.children.map((p) => partAt(r.doc, p)?.name ?? instanceAt(r.doc, p)!.name);
    expect(names).toContain('Side (1)');
    expect(r.doc.definitions.map((d) => d.id)).toEqual(['d2']);
  });
});

describe('copies, removal, pruning', () => {
  it('copyInstanceTree copies every definition below with fresh ids', () => {
    const doc = assemblyDoc();
    const { instance, definitions } = copyInstanceTree(doc, doc.instances[0]!);
    expect(instance.id).not.toBe('i1');
    expect(definitions).toHaveLength(2);
    for (const d of definitions) expect(['d1', 'd2']).not.toContain(d.id);
  });
  it('removeItems prunes everything below', () => {
    const out = removeItems(assemblyDoc(), ['i1']);
    expect(out.instances).toEqual([]);
    expect(out.definitions).toEqual([]);
  });
  it('pruneDefinitions drops an unreferenced definition', () => {
    const doc = assemblyDoc();
    const out = pruneDefinitions({ ...doc, definitions: [...doc.definitions, { id: 'dz', boards: [], instances: [] }] });
    expect(out.definitions.map((d) => d.id)).toEqual(['d1', 'd2']);
  });
});

describe('turnInstance (assemblies spec §4.2)', () => {
  it('turns about the world box centre: every solid is the old solid turned a quarter', () => {
    const doc = assemblyDoc();
    const parts = (d: typeof doc) => worldParts(d).filter((b) => b.id.startsWith('i1/'));
    const box = boardsBounds(parts(doc))!;
    const c: [number, number, number] = [(box.min[0] + box.max[0]) / 2, box.min[1], (box.min[2] + box.max[2]) / 2];
    const out = turnInstance(doc, 'i1', 180);
    const corners = (bs: ReturnType<typeof parts>) => bs.flatMap(worldSolids).flatMap((s) => [s.min, s.max]);
    const want = corners(parts(doc)).map((p) => rotateQuarter(p as [number, number, number], c));
    // a box turned a quarter keeps its corner SET, so compare corner sets
    expect(sameSet(corners(parts(out)) as number[][], want)).toBe(true);
  });
});
```

`rotateQuarter` turns by +90 and `turnInstance(doc, 'i1', 180)` turns i1 from 90 to 180, which is +90. Box corner sets are what is compared, because min/max swap under a turn.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/document/treeOps.test.ts`
Expected: FAIL. Module not found.

- [ ] **Step 3: Implement `treeOps.ts`**

```ts
import type { Board, Definition, Instance, Rotation, SloydDocument } from './types';
import { nextId } from './ids';
import { uniqueName } from './names';
import type { Named } from './names';
import { boardsBounds } from './geometry';
import { placeBoard, placeInstance } from './frames';
import type { Container } from './tree';
import { containerAt, definitionAt, instanceAt, joinPath, lastSegment, parentPath, partsBelow } from './tree';
import { updateContainer } from './treeEdit';

export type Rekey = (path: string) => string;

export function siblingsOf(doc: SloydDocument, path: string | null): Named[] {
  const c = containerAt(doc, path);
  return c ? [...c.boards, ...c.instances] : [];
}

/** `Assembly N`, the first N from 1 free among the siblings (spec §2.3). */
export function nextAssemblyName(siblings: readonly Named[]): string {
  const taken = new Set(siblings.map((s) => s.name));
  let n = 1;
  while (taken.has(`Assembly ${n}`)) n += 1;
  return `Assembly ${n}`;
}

export function insertItems(
  doc: SloydDocument, path: string | null,
  add: { boards?: Board[]; instances?: Instance[]; definitions?: Definition[] },
): SloydDocument {
  const withDefs = add.definitions?.length ? { ...doc, definitions: [...doc.definitions, ...add.definitions] } : doc;
  return updateContainer(withDefs, path, (c) => ({
    boards: [...c.boards, ...(add.boards ?? [])],
    instances: [...c.instances, ...(add.instances ?? [])],
  }));
}

/** Keep only definitions reachable from the root, in their existing order. */
export function pruneDefinitions(doc: SloydDocument): SloydDocument {
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const reached = new Set<string>();
  const walk = (c: Container) => {
    for (const i of c.instances) {
      if (reached.has(i.definition)) continue;
      const d = defs.get(i.definition);
      if (!d) continue;
      reached.add(d.id);
      walk(d);
    }
  };
  walk(doc);
  if (reached.size === doc.definitions.length) return doc;
  return { ...doc, definitions: doc.definitions.filter((d) => reached.has(d.id)) };
}

export function removeItems(doc: SloydDocument, paths: readonly string[]): SloydDocument {
  const byContainer = new Map<string | null, Set<string>>();
  for (const p of paths) {
    const c = parentPath(p);
    if (!byContainer.has(c)) byContainer.set(c, new Set());
    byContainer.get(c)!.add(lastSegment(p));
  }
  let out = doc;
  for (const [c, ids] of byContainer) {
    out = updateContainer(out, c, (k) => ({
      boards: k.boards.filter((b) => !ids.has(b.id)),
      instances: k.instances.filter((i) => !ids.has(i.id)),
    }));
  }
  return pruneDefinitions(out);
}

const rekeyer = (pairs: ReadonlyArray<readonly [string, string]>): Rekey => (p) => {
  for (const [from, to] of pairs) {
    if (p === from) return to;
    if (p.startsWith(`${from}/`)) return to + p.slice(from.length);
  }
  return p;
};

/**
 * Group direct children of `container` into a new assembly (spec §4.1). The
 * new frame is the identity, so every stored value is untouched and nothing
 * moves, bit for bit. Null for nothing to group, or a path that is not a
 * direct child.
 */
export function groupItems(doc: SloydDocument, container: string | null, paths: readonly string[]):
  { doc: SloydDocument; path: string; rekey: Rekey } | null {
  const c = containerAt(doc, container);
  if (!c || paths.length === 0 || paths.some((p) => parentPath(p) !== container)) return null;
  const ids = new Set(paths.map(lastSegment));
  const boards = c.boards.filter((b) => ids.has(b.id));
  const instances = c.instances.filter((i) => ids.has(i.id));
  if (boards.length + instances.length !== ids.size) return null;
  const def: Definition = { id: nextId(), boards, instances };
  const keptBoards = c.boards.filter((b) => !ids.has(b.id));
  const keptInstances = c.instances.filter((i) => !ids.has(i.id));
  const inst: Instance = {
    id: nextId(), name: nextAssemblyName([...keptBoards, ...keptInstances]),
    definition: def.id, position: [0, 0, 0], rotation: 0,
  };
  const withDef = { ...doc, definitions: [...doc.definitions, def] };
  const out = updateContainer(withDef, container, () => ({ boards: keptBoards, instances: [...keptInstances, inst] }));
  const path = joinPath(container, inst.id);
  return { doc: out, path, rekey: rekeyer(paths.map((p) => [p, joinPath(path, lastSegment(p))] as const)) };
}

/**
 * Move an instance's children up into its parent (spec §4.1, §10). Parts go
 * through placeBoard, the same one step worldParts takes, so they come out
 * bit-identical; a nested instance's frame is folded with placeInstance. A
 * child id taken in the parent is re-minted, a taken name deduped; the
 * definition is pruned.
 */
export function ungroupItem(doc: SloydDocument, path: string):
  { doc: SloydDocument; children: string[]; rekey: Rekey } | null {
  const inst = instanceAt(doc, path);
  const def = definitionAt(doc, path);
  const container = parentPath(path);
  const c = containerAt(doc, container);
  if (!inst || !def || !c) return null;
  const keptInstances = c.instances.filter((i) => i.id !== inst.id);
  const taken: Named[] = [...c.boards, ...keptInstances];
  const seen = new Set(taken.map((t) => t.id));
  const pairs: Array<readonly [string, string]> = [];
  const fresh = (id: string) => {
    const out = seen.has(id) ? nextId() : id;
    seen.add(out);
    pairs.push([joinPath(path, id), joinPath(container, out)]);
    return out;
  };
  const boards = def.boards.map((b) => {
    const placed = { ...placeBoard(inst, b), id: fresh(b.id) };
    const named = { ...placed, name: uniqueName(b.name, taken) };
    taken.push(named);
    return named;
  });
  const instances = def.instances.map((j) => {
    const placed = { ...placeInstance(inst, j), id: fresh(j.id) };
    const named = { ...placed, name: uniqueName(j.name, taken) };
    taken.push(named);
    return named;
  });
  const out = pruneDefinitions(updateContainer(doc, container, (k) => ({
    boards: [...k.boards, ...boards],
    instances: [...keptInstances, ...instances],
  })));
  return { doc: out, children: pairs.map(([, to]) => to), rekey: rekeyer(pairs) };
}

/** An independent copy of an instance and every definition below it (spec §4.2). Part ids
 *  are per definition, so they are kept; cut ids too (invariant 45's "copies join"). */
export function copyInstanceTree(doc: SloydDocument, inst: Instance): { instance: Instance; definitions: Definition[] } {
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const out: Definition[] = [];
  const copyDef = (id: string): string => {
    const d = defs.get(id);
    const nid = nextId();
    if (!d) return nid;
    const instances = d.instances.map((j) => ({ ...j, position: [...j.position] as [number, number, number], definition: copyDef(j.definition) }));
    out.push({
      id: nid,
      boards: d.boards.map((b) => ({ ...b, position: [...b.position] as [number, number, number], cuts: b.cuts.map((k) => ({ ...k })) })),
      instances,
    });
    return nid;
  };
  const definition = copyDef(inst.definition);
  return { instance: { ...inst, id: nextId(), position: [...inst.position] as [number, number, number], definition }, definitions: out };
}

/**
 * Turn an instance to `rotation` about its box centre in the parent's frame,
 * keeping the box's min height: reorientedPosition's rule for a part
 * (invariant 2), for an assembly.
 */
export function turnInstance(doc: SloydDocument, path: string, rotation: Rotation): SloydDocument {
  const inst = instanceAt(doc, path);
  const def = definitionAt(doc, path);
  if (!inst || !def || inst.rotation === rotation) return doc;
  const inner = partsBelow(doc, def);
  const box = (f: Instance) => boardsBounds(inner.map((b) => placeBoard(f, b)));
  const before = box(inst);
  const after = box({ ...inst, rotation });
  const position: [number, number, number] = before && after
    ? [
        inst.position[0] + ((before.min[0] + before.max[0]) - (after.min[0] + after.max[0])) / 2,
        inst.position[1],
        inst.position[2] + ((before.min[2] + before.max[2]) - (after.min[2] + after.max[2])) / 2,
      ]
    : [...inst.position];
  return updateContainer(doc, parentPath(path), (c) => ({
    ...c,
    instances: c.instances.map((i) => (i.id === inst.id ? { ...i, rotation, position } : i)),
  }));
}
```

Add `export * from './treeOps';` to `document.ts`.

- [ ] **Step 4: Run the tests, then mutate**

Run: `npx vitest run src/document/treeOps.test.ts`
Expected: PASS.

Mutate:
1. In `groupItems`, set the new instance's `position: [0.1, 0, 0]`. Both "moves nothing" tests must go red. Restore.
2. In `ungroupItem`, replace `placeBoard(inst, b)` with `{ ...b }`. The ungroup test must go red. Restore.
3. In `turnInstance`, drop the centre correction (`position: [...inst.position]`). The turn test must go red. Restore.

- [ ] **Step 5: Full gate, then commit**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git add src/document && git commit -m "feat(document): treeOps.ts — group, ungroup, copy, remove, turn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Loading the tree

**Files:**
- Create: `src/document/treeRepair.ts`
- Modify: `src/document/document.ts` (`takeId`, add `validateInstance` + `validateDefinitions`, `migrateDocument` tail)
- Test: `src/document/treeRepair.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5; `repairLinks` from `./links`
- Produces:
  - `repairTree(doc: SloydDocument): SloydDocument`: spec §2.4 steps 2–6, given validated definitions
  - `repairLinksTree(doc: SloydDocument): SloydDocument`: step 7
  - `migrateDocument` runs: root boards, then root instances (one `seen` set), then `validateDefinitions` (step 1), then `repairTree`, then `repairLinksTree`

- [ ] **Step 1: Write the failing tests**

```ts
import { migrateDocument } from './document';
import { worldParts, partAt, childrenOf, instanceAt } from './tree';
import { assemblyDoc } from './treeFixtures';

const raw = (patch: Record<string, unknown> = {}) => ({ ...JSON.parse(JSON.stringify(assemblyDoc())), ...patch });
const defs = () => JSON.parse(JSON.stringify(assemblyDoc().definitions));

describe('loading assemblies (assemblies spec §2.4)', () => {
  it('a clean file round-trips unchanged', () => {
    expect(migrateDocument(raw())).toEqual(assemblyDoc());
  });

  it('step 1: a duplicate definition id keeps the FIRST definition', () => {
    const d = defs();
    const doc = migrateDocument(raw({ definitions: [...d, { id: 'd2', boards: [], instances: [] }] }));
    expect(partAt(doc, 'i1/i2/b3')!.name).toBe('Pin');
    expect(doc.definitions.filter((x) => x.id === 'd2')).toHaveLength(1);
  });

  it('step 2: an instance naming a missing definition is dropped', () => {
    const r = raw();
    r.instances.push({ id: 'i9', name: 'Ghost', definition: 'nope', position: [0, 0, 0], rotation: 0 });
    expect(childrenOf(migrateDocument(r), null)).toEqual(['r1', 'i1']);
  });

  it('step 3: an instance that would contain its own definition is dropped', () => {
    const d = defs();
    d[1].instances.push({ id: 'loop', name: 'Loop', definition: 'd2', position: [0, 0, 0], rotation: 0 });
    const doc = migrateDocument(raw({ definitions: d }));
    expect(childrenOf(doc, 'i1/i2')).toEqual(['i1/i2/b3']);
  });

  it('step 4: a second reference to one definition gets its own copy', () => {
    const r = raw();
    r.instances.push({ id: 'i7', name: 'Drawer 2', definition: 'd1', position: [30, 0, 0], rotation: 0 });
    const doc = migrateDocument(r);
    expect(instanceAt(doc, 'i1')!.definition).toBe('d1');
    expect(instanceAt(doc, 'i7')!.definition).not.toBe('d1');
    expect(worldParts(doc)).toHaveLength(7);
    expect(new Set(doc.definitions.map((x) => x.id)).size).toBe(doc.definitions.length);
  });

  it('step 5: an unreferenced definition is dropped', () => {
    const doc = migrateDocument(raw({ definitions: [...defs(), { id: 'dz', boards: [], instances: [] }] }));
    expect(doc.definitions.map((x) => x.id)).toEqual(['d1', 'd2']);
  });

  it('step 6: an id containing / is re-minted; sibling names are deduped across parts and assemblies', () => {
    const r = raw();
    r.boards[0].id = 'r/1';
    r.boards[0].name = 'Drawer';
    const doc = migrateDocument(r);
    expect(doc.boards[0]!.id.includes('/')).toBe(false);
    expect(doc.boards[0]!.name).toBe('Drawer');
    expect(doc.instances[0]!.name).toBe('Drawer (1)');
  });

  it('step 6: a duplicate id within one container keeps the first', () => {
    const d = defs();
    d[0].boards[1].id = 'b1';
    const doc = migrateDocument(raw({ definitions: d }));
    expect(partAt(doc, 'i1/b1')!.name).toBe('Side');
    expect(childrenOf(doc, 'i1')).toHaveLength(3);
  });

  it('step 7: a linked pair across containers that differs is unlinked', () => {
    const r = raw();
    r.boards[0].link = 'L1';
    const d = defs();
    d[0].boards[1].link = 'L1';
    const doc = migrateDocument({ ...r, definitions: d });
    expect('link' in doc.boards[0]!).toBe(false);
    expect('link' in partAt(doc, 'i1/b2')!).toBe(false);
  });

  it('drops a malformed instance instead of refusing the file', () => {
    const r = raw();
    r.instances.push({ id: 'bad', definition: 'd1', position: [0, 'x', 0] });
    r.instances.push({ name: 'no id', definition: 'd1', position: [0, 0, 0] });
    expect(childrenOf(migrateDocument(r), null)).toEqual(['r1', 'i1']);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/document/treeRepair.test.ts`
Expected: FAIL. `migrateDocument` still returns empty lists.

- [ ] **Step 3: Implement `treeRepair.ts`**

```ts
import type { Board, Definition, Instance, SloydDocument } from './types';
import { nextId } from './ids';
import { dedupeNames } from './names';
import { repairLinks } from './links';
import type { Container } from './tree';
import { mapWorld } from './treeEdit';

/** One container's names deduped across its parts AND assemblies (invariant 8, restated). */
function dedupeContainer(c: Container): Container {
  const items = dedupeNames<Board | Instance>([...c.boards, ...c.instances]);
  return { boards: items.slice(0, c.boards.length) as Board[], instances: items.slice(c.boards.length) as Instance[] };
}

/**
 * Load steps 2–6 (spec §2.4), on validated definitions whose ids are already
 * unique (step 1 is validateDefinitions'). Walks from the root:
 * - an instance naming a missing definition is dropped (2);
 * - one whose definition is already on the current path is dropped (3);
 * - a second reference gets a copy under a fresh id, its nested definitions
 *   copied in turn (4);
 * - only reached definitions survive (5);
 * - names are deduped per container (6).
 * References point only at definition ids and a duplicate definition id is
 * dropped, never re-minted, so no reference is ever rewritten (invariant 33's
 * two-pass rewrite is not needed).
 */
export function repairTree(doc: SloydDocument): SloydDocument {
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  const used = new Set<string>();
  const fixed = new Map<string, Definition>();
  const fix = (c: Container, onPath: ReadonlySet<string>): Container => {
    const instances: Instance[] = [];
    for (const inst of c.instances) {
      const d = defs.get(inst.definition);
      if (!d || onPath.has(d.id)) continue;
      const id = used.has(d.id) ? nextId() : d.id;
      used.add(id);
      const inner = dedupeContainer(fix(d, new Set([...onPath, d.id])));
      fixed.set(id, { id, boards: inner.boards, instances: inner.instances });
      instances.push(inst.definition === id ? inst : { ...inst, definition: id });
    }
    return { boards: c.boards, instances };
  };
  const root = dedupeContainer(fix(doc, new Set()));
  const kept = doc.definitions.filter((d) => fixed.has(d.id)).map((d) => fixed.get(d.id)!);
  const copies = [...fixed.values()].filter((d) => !defs.has(d.id));
  return { ...doc, boards: root.boards, instances: root.instances, definitions: [...kept, ...copies] };
}

/** Load step 7: repairLinks decides on the world parts; its unlinks are written back. */
export function repairLinksTree(doc: SloydDocument): SloydDocument {
  return mapWorld(doc, repairLinks);
}
```

In `document.ts`:

1. `takeId`: change the condition to `typeof raw === 'string' && raw && !raw.includes('/') && !seen.has(raw)`. Add one sentence to its doc comment: "An id containing '/', the occurrence-path separator, is treated as taken (assemblies spec §2.2)."
2. Add, after `validateBoard`:

```ts
/** An assembly placement, or null for one that cannot be placed (spec §2.5).
 *  Shares the container's `seen` set with its parts (ids unique per container). */
function validateInstance(raw: unknown, seen: Set<string>): Instance | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const i = raw as Record<string, unknown>;
  if (typeof i.id !== 'string' || !i.id) return null;
  if (typeof i.definition !== 'string' || !i.definition) return null;
  const pos = i.position;
  if (!Array.isArray(pos) || pos.length !== 3 || !pos.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const name = typeof i.name === 'string' && i.name.trim() ? i.name.trim() : 'Assembly';
  return {
    id: takeId(i.id, seen), name, definition: i.definition,
    position: [pos[0], pos[1], pos[2]] as [number, number, number],
    rotation: VALID_ROTATIONS.includes(i.rotation as number) ? (i.rotation as Rotation) : 0,
  };
}

const validateInstances = (raw: unknown, seen: Set<string>): Instance[] =>
  Array.isArray(raw) ? raw.flatMap((x) => validateInstance(x, seen) ?? []) : [];

/**
 * Definitions (spec §2.4 step 1): not an object, no string id, or no boards
 * list is dropped; a duplicate id keeps the FIRST. A board inside goes through
 * validateBoard, which refuses the file on a bad board exactly as it does at
 * the root.
 */
function validateDefinitions(raw: unknown): Definition[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  const out: Definition[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const d = item as Record<string, unknown>;
    if (typeof d.id !== 'string' || !d.id || ids.has(d.id) || !Array.isArray(d.boards)) continue;
    ids.add(d.id);
    const seen = new Set<string>();
    const boards = d.boards.map((b, i) => validateBoard(b, i, seen));
    out.push({ id: d.id, boards, instances: validateInstances(d.instances, seen) });
  }
  return out;
}
```

3. In `migrateDocument`, replace the returned object's `boards: repairLinks(dedupeNames(...))` and the Task 1 `instances: [], definitions: []` with:

```ts
  const boards = rawBoards.map((b, i) => validateBoard(b, i, boardIds));
  const instances = validateInstances(d.instances, boardIds);
  const definitions = validateDefinitions(d.definitions);
  // Steps 2–7 of the load repair (assemblies spec §2.4): the tree, the names
  // per container (invariant 8, restated), then the links over the world parts.
  return repairLinksTree(repairTree({
    version: CURRENT_VERSION,
    name: typeof d.name === 'string' && d.name ? d.name : 'Untitled',
    units: { display: 'imperial-fractional', precision },
    stock: { kerf },
    guides,
    boards,
    instances,
    definitions,
  }));
```

Keep the existing comment about the ONE `seen` set, moved above the `boards` line. Import `repairTree, repairLinksTree` from `./treeRepair`, and `Instance, Definition, Rotation` types. Drop the now-unused `repairLinks` / `dedupeNames` imports if the build flags them.

- [ ] **Step 4: Run the tests and the whole document suite**

Run: `npx vitest run src/document`
Expected: PASS. The existing name-dedupe and link-repair tests in `document.test.ts` must still pass: a flat document goes through `repairTree` (dedupe on the root) and `repairLinksTree` (`mapWorld` over `doc.boards`).

- [ ] **Step 5: Mutate**

1. In `repairTree`, remove `|| onPath.has(d.id)`. The cycle test must go red, or hang: run with `--testTimeout=5000`. Restore.
2. Replace `used.has(d.id) ? nextId() : d.id` with `d.id`. Step 4's test must go red. Restore.
3. Revert `takeId`'s `/` clause. Step 6's first test must go red. Restore.

- [ ] **Step 6: Full gate, then commit**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git add src/document && git commit -m "feat(document): load and repair the assembly tree (schema 10)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Store: the open assembly, selection, hiding, undo

**Files:**
- Create: `src/store/assemblyPick.ts`, `src/store/assemblyPick.test.ts`
- Modify: `src/store/visibility.ts`, `src/store/selectionGesture.ts`, `src/store/store.ts` (state type, `selectionPatch`, `applyHidden`, `restore`, `selectAll`, `hideUnselected`, `replaceDocument`, new actions)
- Test: `src/store/store.assemblies.test.ts` (create; keeps the 2,615-line `store.test.ts` untouched)

**Interfaces:**
- Consumes: Tasks 3, 5 (`isCovered`, `parentPath`, `childrenOf`, `itemPaths`, `instanceAt`, `worldParts`)
- Produces:
  - `clickTarget(occ: string, openPath: string | null): { open: string | null; target: string }`
  - Store state `openPath: string | null`
  - Store actions:
    - `openAssembly(path: string): void`
    - `closeAssembly(): void`: one level; selects the assembly just closed
    - `selectItem(path: string, toggle: boolean): void`: the parts list
    - `clickPart(occ: string, toggle: boolean): void`: the viewport
    - `openPart(occ: string): void`: double-click
  - `selectByClick(id, e)` now calls `clickPart`; a new `selectRowByClick(path, e)` calls `selectItem`
  - `visibleBoards(boards, hiddenIds)` hides a part covered by any hidden path

- [ ] **Step 1: Write the failing tests**

`assemblyPick.test.ts`:

```ts
import { clickTarget } from './assemblyPick';

describe('clickTarget (assemblies spec §3.2–3.3)', () => {
  it('at the top level selects the outermost assembly', () => {
    expect(clickTarget('i1/i2/b3', null)).toEqual({ open: null, target: 'i1' });
    expect(clickTarget('r1', null)).toEqual({ open: null, target: 'r1' });
  });
  it('inside, selects one level below the open assembly', () => {
    expect(clickTarget('i1/i2/b3', 'i1')).toEqual({ open: 'i1', target: 'i1/i2' });
    expect(clickTarget('i1/b1', 'i1')).toEqual({ open: 'i1', target: 'i1/b1' });
    expect(clickTarget('i1/i2/b3', 'i1/i2')).toEqual({ open: 'i1/i2', target: 'i1/i2/b3' });
  });
  it('outside, closes to the shared level and selects there', () => {
    expect(clickTarget('r1', 'i1/i2')).toEqual({ open: null, target: 'r1' });
    expect(clickTarget('i1/b1', 'i1/i2')).toEqual({ open: 'i1', target: 'i1/b1' });
  });
});
```

`store.assemblies.test.ts`. Tasks 8–10 append tests to this file; merge each task's imports into these import lines rather than repeating them (a repeated import is a tsc error):

```ts
import { useStore } from './store';
import { assemblyDoc } from '../document/treeFixtures';
import { worldParts } from '../document/tree';
import { visibleBoards } from './visibility';
import type { BoardSnapPoint, SloydDocument } from '../document/document';
import { removeItems, snapPointsFor } from '../document/document';

const load = (doc: SloydDocument = assemblyDoc()) => useStore.getState().replaceDocument(doc);
const s = () => useStore.getState();
const point = (owner: string, at: [number, number, number] = [0, 0, 0]): BoardSnapPoint =>
  ({ at, kind: 'corner', owner: { type: 'board', id: owner } } as BoardSnapPoint);
/** A REAL snap point of a world part, so dropHeldIfGone's survival test can keep it. */
const heldOn = (id: string): BoardSnapPoint =>
  snapPointsFor(worldParts(s().doc).find((b) => b.id === id)!)[0] as BoardSnapPoint;

beforeEach(() => load());

describe('the open assembly (assemblies spec §3)', () => {
  it('a click selects the outermost assembly, then one level down once opened', () => {
    s().clickPart('i1/i2/b3', false);
    expect(s().selectedIds).toEqual(['i1']);
    s().openAssembly('i1');
    expect(s().selectedIds).toEqual([]);
    s().clickPart('i1/i2/b3', false);
    expect(s().selectedIds).toEqual(['i1/i2']);
  });

  it('a click outside closes to its level and selects there', () => {
    s().openAssembly('i1');
    s().openAssembly('i1/i2');
    s().clickPart('r1', false);
    expect([s().openPath, s().selectedIds]).toEqual([null, ['r1']]);
  });

  it('closeAssembly closes one level and selects what it closed', () => {
    s().openAssembly('i1');
    s().openAssembly('i1/i2');
    s().closeAssembly();
    expect([s().openPath, s().selectedIds]).toEqual(['i1', ['i1/i2']]);
  });

  it('openPart opens the assembly a double-click lands on', () => {
    s().openPart('i1/b1');
    expect(s().openPath).toBe('i1');
  });

  it('opening and closing push no history and keep the tape', () => {
    s().setTapeAnchor(point('i1/b2'));
    const past = s().past.length;
    s().openAssembly('i1');
    s().closeAssembly();
    expect(s().past.length).toBe(past);
    expect(s().tapeAnchor?.owner.id).toBe('i1/b2');
  });

  it('selectionPatch drops anything that is not a child of the open level', () => {
    s().selectBoard('i1/b1');
    expect(s().selectedIds).toEqual([]);
    s().openAssembly('i1');
    s().selectBoard('r1');
    expect(s().selectedIds).toEqual([]);
  });

  it('selectAll selects the open level', () => {
    s().selectAll();
    expect(s().selectedIds).toEqual(['r1', 'i1']);
    s().openAssembly('i1');
    s().selectAll();
    expect(s().selectedIds).toEqual(['i1/b1', 'i1/b2', 'i1/i2']);
  });

  it('selectItem from the parts list opens the row’s parent', () => {
    s().selectItem('i1/i2/b3', false);
    expect([s().openPath, s().selectedIds]).toEqual(['i1/i2', ['i1/i2/b3']]);
  });

  it('a grab owned by a part under a selected assembly survives', () => {
    s().selectBoard('i1');
    s().grabSnapPoint(point('i1/b1'));
    s().selectAll();
    expect(s().grabbed?.owner.id).toBe('i1/b1');
    s().selectBoard('r1');
    expect(s().grabbed).toBeNull();
  });
});

describe('hiding assemblies (assemblies spec §3.4)', () => {
  it('hiding an assembly hides every part under it, and none of them can be selected', () => {
    s().setHidden('i1', true);
    expect(s().hiddenIds).toEqual(['i1']);
    expect(visibleBoards(worldParts(s().doc), s().hiddenIds).map((b) => b.id)).toEqual(['r1']);
    s().openAssembly('i1');
    s().selectAll();
    expect(s().selectedIds).toEqual([]);
  });
  it('accepts a nested part id and drops an unknown one', () => {
    s().setHidden('i1/i2/b3', true);
    s().setHidden('nope', true);
    expect(s().hiddenIds).toEqual(['i1/i2/b3']);
  });
  it('Hide others hides the open level’s other items', () => {
    s().openAssembly('i1');
    s().selectItem('i1/b1', false);
    s().hideUnselected();
    expect(s().hiddenIds).toEqual(['i1/b2', 'i1/i2']);
  });
});

describe('undo reconciles the open assembly (assemblies spec §3.1)', () => {
  it('an undo to a document without the open assembly closes to what remains', () => {
    s().openAssembly('i1');
    s().openAssembly('i1/i2');
    const without = removeItems(s().doc, ['i1/i2']);
    useStore.setState({ past: [{ doc: without, hiddenIds: [] }] });
    s().undo();
    expect(s().openPath).toBe('i1');
  });
  it('replaceDocument closes everything', () => {
    s().openAssembly('i1');
    load();
    expect(s().openPath).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/store/assemblyPick.test.ts src/store/store.assemblies.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`assemblyPick.ts`:

```ts
/**
 * What a click on a part selects (assemblies spec §3.2–3.3): its ancestor one
 * level below the open assembly. A part outside the open assembly closes it to
 * the deepest level both share, and is picked at that level. Pure; the
 * viewport (clickPart) and the double-click (openPart) both use it.
 */
export function clickTarget(occ: string, openPath: string | null): { open: string | null; target: string } {
  const segs = occ.split('/');
  const open = openPath === null ? [] : openPath.split('/');
  let k = 0;
  while (k < open.length && k < segs.length - 1 && segs[k] === open[k]) k += 1;
  return { open: k === 0 ? null : open.slice(0, k).join('/'), target: segs.slice(0, k + 1).join('/') };
}
```

`visibility.ts`: replace the filter with `return boards.filter((b) => !isCovered(b.id, hidden));`, importing `isCovered` from `../document/document`. Add to the comment: "A part is hidden when it or any assembly above it is (assemblies spec §3.4)."

`store.ts`:

- In `StoreState`, add:

```ts
  /**
   * The instance path being edited inside, or null at the top level
   * (assemblies spec §3.1). View state: not saved and NOT undoable. Selection
   * is limited to its direct children (selectionPatch). restore and
   * replaceDocument reconcile it.
   */
  openPath: string | null;
  openAssembly: (path: string) => void;
  closeAssembly: () => void;
  selectItem: (path: string, toggle: boolean) => void;
  clickPart: (occ: string, toggle: boolean) => void;
  openPart: (occ: string) => void;
```

- Replace `selectionPatch` with:

```ts
  const selectionPatch = (
    ids: string[],
    hidden: readonly string[] = get().hiddenIds,
    open: string | null = get().openPath,
  ): { selectedIds: string[]; grabbed?: null } => {
    const held = get().grabbed;
    // Filtered HERE, in the one writer (invariants 42, 43): only direct
    // children of the open assembly (assemblies spec §3.2), never anything
    // hidden or under a hidden assembly. Same array when nothing is dropped.
    const hiddenSet = new Set(hidden);
    const kept = ids.filter((id) => parentPath(id) === open && !isCovered(id, hiddenSet));
    const selectedIds = kept.length === ids.length ? ids : kept;
    // A grab survives while its owner is selected OR under a selected assembly.
    return {
      selectedIds,
      ...(held && !isCovered(held.owner.id, new Set(selectedIds)) ? { grabbed: null } : {}),
    };
  };
```

- `applyHidden`: replace `const exists = new Set(doc.boards.map((b) => b.id));` with `const exists = itemPaths(doc);`.

- `restore`: replace its first lines with:

```ts
    const exists = itemPaths(entry.doc);
    const hidden = entry.hiddenIds.filter((id) => exists.has(id));
    const surviving = selectedIds.filter((id) => exists.has(id));
    // The deepest open level that still exists (assemblies spec §3.1).
    let open = get().openPath;
    while (open !== null && !instanceAt(entry.doc, open)) open = parentPath(open);
    return {
      doc: entry.doc,
      hiddenIds: hidden,
      openPath: open,
      ...selectionPatch(surviving.length === selectedIds.length ? selectedIds : surviving, hidden, open),
```

  The `...(entry.doc === current ? ...)` line stays.

- `replaceDocument`: add `openPath: null,`.
- `selectAll`: `selectAll: () => set(selectionPatch(childrenOf(get().doc, get().openPath))),`
- `hideUnselected`: replace `doc.boards.map((b) => b.id)` with `childrenOf(doc, get().openPath)`.
- In the returned object, add `openPath: null,` beside `hiddenIds: [],` and these actions:

```ts
    openAssembly: (path) => {
      if (!instanceAt(get().doc, path)) return;
      set({ openPath: path, ...selectionPatch([], get().hiddenIds, path) });
    },

    closeAssembly: () => {
      const open = get().openPath;
      if (open === null) return;
      const up = parentPath(open);
      set({ openPath: up, ...selectionPatch([open], get().hiddenIds, up) });
    },

    selectItem: (path, toggle) => {
      const open = parentPath(path);
      if (open !== get().openPath) {
        set({ openPath: open, ...selectionPatch([path], get().hiddenIds, open) });
        return;
      }
      if (toggle) get().toggleSelected(path);
      else get().selectBoard(path);
    },

    clickPart: (occ, toggle) => {
      const { open, target } = clickTarget(occ, get().openPath);
      if (open !== get().openPath) {
        set({ openPath: open, ...selectionPatch([target], get().hiddenIds, open) });
        return;
      }
      if (toggle) get().toggleSelected(target);
      else get().selectBoard(target);
    },

    openPart: (occ) => {
      const { target } = clickTarget(occ, get().openPath);
      if (instanceAt(get().doc, target)) get().openAssembly(target);
    },
```

  Import `childrenOf, instanceAt, isCovered, itemPaths, parentPath` from `../document/document`, and `clickTarget` from `./assemblyPick`.

`selectionGesture.ts`:

```ts
/** A click on a part in the viewport: what it selects depends on the open assembly (assemblies spec §3.2). */
export function selectByClick(id: string, e: ToggleModifiers): void {
  useStore.getState().clickPart(id, isToggleModifier(e));
}

/** A click on a parts-list row: the row's own item, opening its parent if needed. */
export function selectRowByClick(path: string, e: ToggleModifiers): void {
  useStore.getState().selectItem(path, isToggleModifier(e));
}
```

`PartsList.tsx` currently calls `selectByClick(b.id, e)`. Change it to `selectRowByClick(b.id, e)` now; the tree arrives in Task 13.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/store src/panels/PartsList.test.tsx`
Expected: PASS, including every existing store test. Root parts have no parent, so `parentPath(id) === null === openPath` keeps today's behaviour.

- [ ] **Step 5: Mutate**

1. In `selectionPatch`, drop `parentPath(id) === open &&`. "selectionPatch drops anything…" must go red. Restore.
2. In `restore`, skip the `while` loop. The undo-reconcile test must go red. Restore.

- [ ] **Step 6: Full gate, then commit**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git add src && git commit -m "feat(store): the open assembly — selection, hiding and undo over the tree

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Store: part edits through the world

**Files:**
- Modify: `src/store/store.ts` (`mates`, `dropHeldIfGone`, `updateBoards`, `addCut`, `updateCut`, `removeCut`, `linkBoards`, `unlinkBoards`, `selectLinked`)
- Test: `src/store/store.assemblies.test.ts`

**Interfaces:**
- Consumes: `worldParts`, `mapWorld`, `dissolveSingletons`, `linkPlan`
- Produces: every listed action accepts an occurrence id (`i1/b2`) and edits the stored definition part; signatures are unchanged.

**The `doc.boards` reads this task replaces** (`grep -n "doc.boards" src/store/store.ts`, and check each one):

| Where | Replacement |
|---|---|
| `dropHeldIfGone`: `get().doc.boards.find` | `worldParts(get().doc).find` |
| `updateBoards`: target filter, `mates(get().doc.boards, …)`, the `edit` map | `const world = worldParts(get().doc)`; filter on `world`; `mates(world, …)`; `edit((doc) => mapWorld(doc, (w) => w.map(…)))` |
| `addCut` / `updateCut` / `removeCut`: `find`, `mates`, the `edit` map | the same three replacements |
| `linkBoards`: `linkPlan(get().doc.boards, …)`, the `edit` map | `linkPlan(worldParts(get().doc), …)`; `mapWorld` |
| `unlinkBoards`: filter, `dissolveSingletons(doc.boards.map(…))` | world filter; `mapWorld(doc, (w) => dissolveSingletons(w.map(…)))` |
| `selectLinked`: both reads | `worldParts(get().doc)` |

Task 9 replaces the rest: `translateBoards`, `commitSnapMove`, `moveGroupTo`, `addBoard`, `deleteBoards`, `duplicateBoards`, `copyInRow`. Task 7 already replaced `applyHidden`, `restore`, `selectAll` and `hideUnselected`.

- [ ] **Step 1: Write the failing tests** (append to `store.assemblies.test.ts`)

```ts
import { partAt, worldParts } from '../document/tree';

describe('part edits inside assemblies (assemblies spec §5)', () => {
  it('a Length edit on a part inside a turned assembly keeps its stored position bit for bit', () => {
    const before = partAt(s().doc, 'i1/b2')!;
    s().updateBoard('i1/b2', { length: 13 });
    const after = partAt(s().doc, 'i1/b2')!;
    expect(after.length).toBe(13);
    after.position.forEach((v, i) => expect(v).toBe(before.position[i]));
    expect(s().past).toHaveLength(1);
  });

  it('a cut added, edited and removed on a nested part lands on the stored part', () => {
    s().addCut('i1/i2/b3');
    const cut = partAt(s().doc, 'i1/i2/b3')!.cuts[0]!;
    s().updateCut('i1/i2/b3', cut.id, { depth: 0.1 });
    expect(partAt(s().doc, 'i1/i2/b3')!.cuts[0]!.depth).toBe(0.1);
    s().removeCut('i1/i2/b3', cut.id);
    expect(partAt(s().doc, 'i1/i2/b3')!.cuts).toEqual([]);
  });

  it('a link across containers propagates in one undo entry', () => {
    s().linkBoards(['r1', 'i1/b2']);
    expect(partAt(s().doc, 'i1/b2')!.length).toBe(s().doc.boards[0]!.length);
    const past = s().past.length;
    s().updateBoard('r1', { thickness: 1.25 });
    expect(partAt(s().doc, 'i1/b2')!.thickness).toBe(1.25);
    expect(s().past.length).toBe(past + 1);
    s().unlinkBoards(['r1']);
    expect('link' in partAt(s().doc, 'i1/b2')!).toBe(false);
  });

  it('a tape anchor on a nested part drops when that part moves and is kept otherwise', () => {
    const w = worldParts(s().doc).find((b) => b.id === 'i1/b2')!;
    s().setTapeAnchor(heldOn('i1/b2'));
    s().updateBoard('i1/b2', { name: 'Renamed' });
    expect(s().tapeAnchor).not.toBeNull();
    s().updateBoard('i1/b2', { position: [w.position[0] + 1, w.position[1], w.position[2]] });
    expect(s().tapeAnchor).toBeNull();
  });
});
```

The rename half is what makes the drop half meaningful: an anchor that was never a real snap point would "drop" on any edit.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/store/store.assemblies.test.ts`
Expected: the new tests FAIL (silently, as no-ops).

- [ ] **Step 3: Implement the table above**

For example, `updateBoards` becomes:

```ts
    updateBoards: (ids, patch) => {
      const world = worldParts(get().doc);
      const targets = new Set(ids.filter((id) => world.some((b) => b.id === id)));
      if (targets.size === 0) return;
      const grabbed = get().grabbed;
      if (grabbed && targets.has(grabbed.owner.id)) set({ grabbed: null });
      const shared = sharedPatch(patch);
      const others = Object.keys(shared).length === 0 ? new Set<string>() : mates(world, targets);
      // Through mapWorld (assemblies spec §5.1): patchBoard runs on WORLD parts,
      // and only what it changed is written back, position as a delta.
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        targets.has(b.id) ? patchBoard(b, patch) : others.has(b.id) ? patchBoard(b, shared) : b)));
      for (const id of [...targets, ...others]) dropHeldIfGone(id);
    },
```

Keep every existing comment in these actions. Add one line where the `edit` call changed: "Through mapWorld (assemblies spec §5.1)". Apply the same pattern to the cut actions and links. For `addCut`, the `edit` becomes:

```ts
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (all.has(b.id) ? { ...b, cuts: [...b.cuts, { ...cut }] } : b))));
```

- [ ] **Step 4: Run all store tests, then mutate**

Run: `npx vitest run src/store`
Expected: PASS, the old suite included.

Mutate: in `updateBoards`, go back to `world.some` → `get().doc.boards.some`. The Length test must go red. Restore.

- [ ] **Step 5: Full gate, then commit**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git add src/store && git commit -m "feat(store): part edits, cuts and links reach parts inside assemblies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Store: structure and moves

**Files:**
- Modify: `src/store/store.ts` (`translateBoards`, `commitSnapMove`, `moveGroupTo`, `addBoard`, `deleteBoards`, `duplicateBoards`, `copyInRow`, `copyBoard`'s `taken` type)
- Test: `src/store/store.assemblies.test.ts`

**Interfaces:**
- Consumes: `translateItems`, `insertItems`, `removeItems`, `copyInstanceTree`, `siblingsOf`, `containerAt`, `containerTurn`, `instanceAt`, `partAt`, `itemPaths`, `joinPath`, `parentPath`, `lastSegment`, `rotateVec`, `inverseTurn`, `isCovered`
- Produces: the same action signatures, now accepting instance paths and nested occurrences. `copyBoard(source, position, taken: Named[])`.

| Where | Replacement |
|---|---|
| `translateBoards(ids, delta)` | `edit((doc) => translateItems(doc, [...ids], delta))`; then `dropHeldIfGone` for every world part `isCovered` by `ids` |
| `commitSnapMove` | `isCovered(grabbed.owner.id, selected)`; target self-check `isCovered(target.owner.id, selected)`; `moving` = selected ids in `itemPaths(doc)`; the owner must be in `worldParts` |
| `moveGroupTo(ids, min)` | bounds over world parts `isCovered` by `ids`; `translateBoards(new Set(ids existing in itemPaths), delta)` |
| `addBoard` | container = `openPath`; template = the container's last board, else the root's last; name against `siblingsOf`; `insertItems`; select `joinPath(open, id)` |
| `deleteBoards` | `doomed` = ids in `itemPaths`; held cleared when `isCovered(owner.id, doomed)`; `edit((doc) => mapWorld(removeItems(doc, [...doomed]), dissolveSingletons))`; hidden drops ids `isCovered` by `doomed` |
| `duplicateBoards` | per id: a part → `copyBoard(partAt(...), stored.position, taken)`; an instance → `copyInstanceTree` named `uniqueName(inst.name, taken)`; all into the source's container via `insertItems`; select the new paths |
| `copyInRow` | the world shift `w` (zero except `w[axis] = k·step·sign`) → `local = rotateVec(inverseTurn(containerTurn(doc, container)), w)`; a part's copy at `stored.position` with each axis `local[a] === 0 ? v : v + local[a]`; an instance copy's origin the same way; one `edit()` |

- [ ] **Step 1: Write the failing tests** (append)

```ts
import { childrenOf, instanceAt, isCovered } from '../document/tree';

describe('moving and copying assemblies (assemblies spec §4.2)', () => {
  it('a snap move with an assembly selected moves its origin by the exact delta', () => {
    s().selectBoard('i1');
    const w = worldParts(s().doc).find((b) => b.id === 'i1/b1')!;
    s().setTool('move');
    s().grabSnapPoint(point('i1/b1', [w.position[0], w.position[1], w.position[2]]));
    s().commitSnapMove({ at: [w.position[0] + 0.3, w.position[1], w.position[2]], kind: 'corner', owner: { type: 'board', id: 'r1' } } as never);
    expect(instanceAt(s().doc, 'i1')!.position).toEqual([10.1 + 0.3, 0.3 + 0, 3.3 + 0]);
  });

  it('moveGroupTo rounds the selection box min once, for an assembly', () => {
    s().selectBoard('i1');
    s().moveGroupTo(['i1'], [20.01, 0, 5]);
    const parts = worldParts(s().doc).filter((b) => isCovered(b.id, new Set(['i1'])));
    const minX = Math.min(...parts.map((b) => b.position[0]));
    expect(minX).toBeCloseTo(20, 9);
  });

  it('a snap move inside a turned assembly goes into the frame; the axes it does not reach stay bit-identical', () => {
    s().openAssembly('i1');
    const before = partAt(s().doc, 'i1/b2')!;
    const w = worldParts(s().doc).find((b) => b.id === 'i1/b2')!;
    s().setTool('move');
    s().selectItem('i1/b2', false);
    s().grabSnapPoint(point('i1/b2', [w.position[0], w.position[1], w.position[2]]));
    s().commitSnapMove({ at: [w.position[0] + 1, w.position[1], w.position[2]], kind: 'corner', owner: { type: 'board', id: 'r1' } } as never);
    const after = partAt(s().doc, 'i1/b2')!;
    // world +X is the frame's +Z under i1's 90° turn
    expect(after.position[0]).toBe(before.position[0]);
    expect(after.position[1]).toBe(before.position[1]);
    expect(after.position[2]).toBe(before.position[2] + 1);
  });

  it('Duplicate of an assembly makes an independent copy with its own definitions', () => {
    s().duplicateBoards(['i1']);
    const roots = childrenOf(s().doc, null);
    expect(roots).toHaveLength(3);
    const copy = instanceAt(s().doc, roots[2]!)!;
    expect(copy.name).toBe('Drawer (1)');
    expect(copy.definition).not.toBe('d1');
    expect(worldParts(s().doc)).toHaveLength(7);
    expect(s().selectedIds).toEqual([roots[2]]);
  });

  it('Copy in a row of an assembly shifts each copy from the ORIGINAL', () => {
    s().copyInRow(['i1'], 3, 0, 1, 10);
    const roots = childrenOf(s().doc, null);
    expect(roots).toHaveLength(4);
    expect(instanceAt(s().doc, roots[3]!)!.position).toEqual([10.1 + 2 * 10, 0.3, 3.3]);
  });

  it('Copy in a row inside a turned assembly steps along the WORLD axis', () => {
    s().openAssembly('i1');
    s().copyInRow(['i1/b2'], 2, 0, 1, 5);
    const parts = worldParts(s().doc).filter((b) => b.id.startsWith('i1/') && b.name.startsWith('Front'));
    expect(parts).toHaveLength(2);
    expect(parts[1]!.position[0] - parts[0]!.position[0]).toBeCloseTo(5, 9);
    expect(parts[1]!.position[2]).toBeCloseTo(parts[0]!.position[2], 9);
  });

  it('Delete of an assembly prunes its definitions and drops what it held', () => {
    s().setHidden('i1/b1', true);
    s().setTapeAnchor(point('i1/b2'));
    s().deleteBoards(['i1']);
    expect(s().doc.definitions).toEqual([]);
    expect(s().hiddenIds).toEqual([]);
    expect(s().tapeAnchor).toBeNull();
  });

  it('Add board while an assembly is open adds inside it', () => {
    s().openAssembly('i1');
    s().addBoard();
    const kids = childrenOf(s().doc, 'i1');
    expect(kids).toHaveLength(4);
    expect(s().selectedIds).toEqual([kids[2]]);
  });
});
```

`setTool('move')` drops held points, so the grab comes after it. `kids[2]` is the new board: `childrenOf` lists parts before instances, and d1 has two parts, so the new third part is at index 2.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/store/store.assemblies.test.ts`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement the table above**

`translateBoards`:

```ts
  const translateBoards = (ids: ReadonlySet<string>, delta: readonly [number, number, number]) => {
    // A world delta, rotated into each item's container frame and added
    // (assemblies spec §4.2). A root item gains it exactly, as before.
    edit((doc) => translateItems(doc, [...ids], delta));
    for (const b of worldParts(get().doc)) if (isCovered(b.id, ids)) dropHeldIfGone(b.id);
  };
```

`copyInRow`:

```ts
    copyInRow: (ids, count, axis, sign, step) => {
      if (!Number.isInteger(count) || count < 2 || count > MAX_ROW) return;
      if (!Number.isFinite(step) || step <= 0) return;
      const doc = get().doc;
      const sources = [...new Set(ids)].filter((id) => itemPaths(doc).has(id));
      if (sources.length === 0) return;
      const container = parentPath(sources[0]!);
      const taken: Named[] = [...siblingsOf(doc, container)];
      const boards: Board[] = [];
      const instances: Instance[] = [];
      const definitions: Definition[] = [];
      const turn = containerTurn(doc, container);
      for (let k = 1; k < count; k += 1) {
        // From the ORIGINAL every time (invariant 25); the WORLD step turned
        // into the container's frame, exactly (assemblies spec §4.2).
        const w: [number, number, number] = [0, 0, 0];
        w[axis] = k * step * sign;
        const local = rotateVec(inverseTurn(turn), w);
        const at = (p: readonly number[]) => p.map((v, a) => (local[a] === 0 ? v : v + local[a]!)) as [number, number, number];
        for (const id of sources) {
          const part = partAt(doc, id);
          if (part) { const c = copyBoard(part, at(part.position), taken); taken.push(c); boards.push(c); continue; }
          const inst = instanceAt(doc, id);
          if (!inst) continue;
          const copy = copyInstanceTree(doc, inst);
          const named = { ...copy.instance, position: at(inst.position), name: uniqueName(inst.name, taken) };
          taken.push(named); instances.push(named); definitions.push(...copy.definitions);
        }
      }
      edit(
        (d) => insertItems(d, container, { boards, instances, definitions }),
        () => [...sources, ...boards.map((b) => joinPath(container, b.id)), ...instances.map((i) => joinPath(container, i.id))],
      );
    },
```

At the root, `local` is exactly `w` and only `axis` is non-zero, so a root part's copy is `position[axis] = source.position[axis] + shift`: today's arithmetic. The existing `copyInRow` tests pin it.

`duplicateBoards` follows the same shape with `at = (p) => [...p]` and `count = 2`. `deleteBoards`:

```ts
    deleteBoards: (ids) => {
      const paths = itemPaths(get().doc);
      const doomed = new Set(ids.filter((id) => paths.has(id)));
      if (doomed.size === 0) return;
      const { grabbed, tapeAnchor, tapeHover } = get();
      if (grabbed && isCovered(grabbed.owner.id, doomed)) set({ grabbed: null });
      if (tapeAnchor?.owner.type === 'board' && isCovered(tapeAnchor.owner.id, doomed)) set({ tapeAnchor: null, tapeAxis: null });
      if (tapeHover?.owner.type === 'board' && isCovered(tapeHover.owner.id, doomed)) set({ tapeHover: null });
      edit(
        (doc) => mapWorld(removeItems(doc, [...doomed]), dissolveSingletons),
        () => get().selectedIds.filter((id) => !isCovered(id, doomed)),
      );
      const hiddenAfter = get().hiddenIds.filter((id) => !isCovered(id, doomed));
      if (hiddenAfter.length !== get().hiddenIds.length) set({ hiddenIds: hiddenAfter });
    },
```

`addBoard`:

```ts
    addBoard: () => {
      const open = get().openPath;
      const c = containerAt(get().doc, open) ?? get().doc;
      const last = c.boards[c.boards.length - 1] ?? get().doc.boards[get().doc.boards.length - 1];
      const fresh = createBoard(last
        ? { length: last.length, width: last.width, thickness: last.thickness, material: last.material }
        : {});
      const board = { ...fresh, name: uniqueName(fresh.name, siblingsOf(get().doc, open)) };
      edit((doc) => insertItems(doc, open, { boards: [board] }), () => [joinPath(open, board.id)]);
      set({ pendingLengthFocus: true });
    },
```

Keep every existing comment in each action; add a one-line "assemblies spec §x" note where behaviour changed.

- [ ] **Step 4: Run all store tests, then mutate**

Run: `npx vitest run src/store`
Expected: PASS.

Mutate: in `translateItems` (Task 4), replace `rotateVec(inverseTurn(...), worldDelta)` with `[...worldDelta]`. The "snap move inside a turned assembly" test and the turned Copy-in-a-row test must go red. Restore.

- [ ] **Step 5: Full gate, then commit**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git add src/store && git commit -m "feat(store): move, copy, delete and add over the assembly tree

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Store: Group, Ungroup, Turn and Rename

**Files:**
- Modify: `src/store/store.ts`
- Test: `src/store/store.assemblies.test.ts`

**Interfaces:**
- Consumes: `groupItems`, `ungroupItem`, `turnInstance` (as `turnInstanceOp`), `siblingsOf`, `uniqueName`, `Rekey`
- Produces:
  - `groupSelected(): void`
  - `ungroupSelected(): void`
  - `turnAssembly(path: string, rotation: Rotation): void`
  - `renameItem(path: string, typed: string): string`: returns the stored name

- [ ] **Step 1: Write the failing tests** (append)

```ts
describe('Group and Ungroup (assemblies spec §4.1)', () => {
  it('Group moves nothing, selects the new assembly, and re-keys hidden ids and the tape', () => {
    const before = worldParts(s().doc);
    s().setHidden('i1/b1', true);
    s().setTapeAnchor(point('i1/b2'));
    s().selectAll();
    s().groupSelected();
    const [path] = s().selectedIds;
    expect(childrenOf(s().doc, null)).toEqual([path]);
    const after = new Map(worldParts(s().doc).map((b) => [b.id, b]));
    for (const b of before) expect({ ...after.get(`${path}/${b.id}`)!, id: '' }).toEqual({ ...b, id: '' });
    expect(s().hiddenIds).toEqual([`${path}/i1/b1`]);
    expect(s().tapeAnchor?.owner.id).toBe(`${path}/i1/b2`);
  });

  it('one undo entry, and undo restores the parts', () => {
    s().selectAll();
    const past = s().past.length;
    s().groupSelected();
    expect(s().past.length).toBe(past + 1);
    s().undo();
    expect(childrenOf(s().doc, null)).toEqual(['r1', 'i1']);
  });

  it('Ungroup selects the children and re-keys hidden ids', () => {
    s().setHidden('i1/b2', true);
    s().selectBoard('i1');
    s().ungroupSelected();
    expect(s().doc.instances.map((i) => i.id)).toEqual(['i2']);
    expect(s().selectedIds).toEqual(['b1', 'i2']);
    expect(s().hiddenIds).toEqual(['b2']);
  });

  it('Group inside an open assembly groups at that level', () => {
    s().openAssembly('i1');
    s().selectItem('i1/b1', false);
    s().groupSelected();
    expect(s().selectedIds[0]!.startsWith('i1/')).toBe(true);
  });
});

describe('Turn and Rename an assembly', () => {
  it('turnAssembly drops a tape anchor under the assembly', () => {
    s().setTapeAnchor(heldOn('i1/b2'));
    s().turnAssembly('i1', 180);
    expect(instanceAt(s().doc, 'i1')!.rotation).toBe(180);
    expect(s().tapeAnchor).toBeNull();
  });
  it('turnAssembly keeps a tape anchor elsewhere', () => {
    s().setTapeAnchor(heldOn('r1'));
    s().turnAssembly('i1', 180);
    expect(s().tapeAnchor?.owner.id).toBe('r1');
  });
  it('renameItem dedupes across parts and assemblies of one level', () => {
    expect(s().renameItem('i1', 'Top')).toBe('Top (1)');
    expect(instanceAt(s().doc, 'i1')!.name).toBe('Top (1)');
    expect(s().renameItem('i1/b1', 'Front')).toBe('Front (1)');
    expect(s().renameItem('i1/b1', 'Front (1)')).toBe('Front (1)');
  });
});
```

Ungroup test arithmetic: the root holds `r1` and `i1`; ungrouping `i1` puts `b1` and `b2` beside `r1` (no id clash), and `i2` among the root's instances. Selection: `children` in order b1, b2, i2, but `b2` is hidden, so `selectionPatch` drops it, giving `['b1', 'i2']`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/store/store.assemblies.test.ts`
Expected: FAIL. The actions don't exist.

- [ ] **Step 3: Implement**

Add to `StoreState`, with a doc comment each:

```ts
  /** Group the selection into a new assembly at the open level (spec §4.1). One undo entry. */
  groupSelected: () => void;
  /** Move each selected assembly's children up a level (spec §4.1). One undo entry. */
  ungroupSelected: () => void;
  /** Turn an assembly about its box centre (spec §4.2). */
  turnAssembly: (path: string, rotation: Rotation) => void;
  /** Rename a part or an assembly, unique among its siblings; returns the stored name. */
  renameItem: (path: string, typed: string) => string;
```

Implementation:

```ts
  /**
   * Group and Ungroup change ids but move nothing, so the hidden set and the
   * tape's held points are RE-KEYED, never dropped (assemblies spec §5.4,
   * invariant 43's argument). `grabbed` is not re-keyed: the selection changes,
   * and selectionPatch drops it by the retargeting rule.
   */
  const rekeyHeld = (rekey: Rekey) => {
    const { hiddenIds, tapeAnchor, tapeHover } = get();
    const move = (p: SnapPoint | null) =>
      p && p.owner.type === 'board' ? { ...p, owner: { ...p.owner, id: rekey(p.owner.id) } } : p;
    set({ hiddenIds: hiddenIds.map(rekey), tapeAnchor: move(tapeAnchor), tapeHover: move(tapeHover) });
  };
```

```ts
    groupSelected: () => {
      const { doc, selectedIds, openPath } = get();
      const r = groupItems(doc, openPath, selectedIds);
      if (!r) return;
      rekeyHeld(r.rekey);
      edit(() => r.doc, () => [r.path]);
    },

    ungroupSelected: () => {
      const { selectedIds } = get();
      let doc = get().doc;
      const children: string[] = [];
      const rekeys: Rekey[] = [];
      for (const id of selectedIds) {
        const r = ungroupItem(doc, id);
        if (!r) continue;
        doc = r.doc;
        children.push(...r.children);
        rekeys.push(r.rekey);
      }
      if (rekeys.length === 0) return;
      rekeyHeld((p) => rekeys.reduce((q, f) => f(q), p));
      edit(() => doc, () => children);
    },

    turnAssembly: (path, rotation) => {
      const inst = instanceAt(get().doc, path);
      if (!inst || inst.rotation === rotation) return;
      edit((doc) => turnInstanceOp(doc, path, rotation));
      const under = new Set([path]);
      for (const b of worldParts(get().doc)) if (isCovered(b.id, under)) dropHeldIfGone(b.id);
    },

    renameItem: (path, typed) => {
      const doc = get().doc;
      const name = uniqueName(typed, siblingsOf(doc, parentPath(path)), lastSegment(path));
      const inst = instanceAt(doc, path);
      if (inst) {
        if (name !== inst.name) {
          edit((d) => updateContainer(d, parentPath(path), (c) => ({
            ...c, instances: c.instances.map((i) => (i.id === inst.id ? { ...i, name } : i)),
          })));
        }
        return name;
      }
      const part = partAt(doc, path);
      if (part && name !== part.name) get().updateBoards([path], { name });
      return name;
    },
```

`rekeyHeld` runs BEFORE `edit()`, so the new hidden set is in place when `edit()`'s selection callback runs `selectionPatch`. `edit()` pushes `{ doc, hiddenIds }` read inside it, so the history entry would hold the RE-KEYED hidden set. To keep the pre-group set in the entry, capture `const hiddenBefore = get().hiddenIds` first, call `edit()`, then patch the entry:

```ts
      const hiddenBefore = get().hiddenIds;
      rekeyHeld(r.rekey);
      edit(() => r.doc, () => [r.path]);
      const past = get().past;
      set({ past: [...past.slice(0, -1), { ...past[past.length - 1]!, hiddenIds: hiddenBefore }] });
```

Apply the same three lines in `ungroupSelected`. Add a test that undo of a Group restores `hiddenIds` to `['i1/b1']`:

```ts
  it('undo of a Group restores the old hidden ids', () => {
    s().setHidden('i1/b1', true);
    s().selectAll();
    s().groupSelected();
    s().undo();
    expect(s().hiddenIds).toEqual(['i1/b1']);
  });
```

Import `groupItems, ungroupItem, turnInstance as turnInstanceOp, siblingsOf, updateContainer, partAt, lastSegment` and `type Rekey`.

- [ ] **Step 4: Run all store tests, then mutate**

Run: `npx vitest run src/store`
Expected: PASS.

Mutate: delete the `rekeyHeld(r.rekey);` line in `groupSelected`. The Group re-key test must go red. Restore.

- [ ] **Step 5: Full gate, then commit**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git add src/store && git commit -m "feat(store): Group, Ungroup, turn and rename assemblies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Readers: the cut list and joinery

**Files:**
- Modify: `src/panels/CutList.tsx:32`, `src/generate/run.ts` (`runJoinery`, `joineryEstimateUsd`)
- Test: `src/document/treeReaders.test.ts`, `src/generate/joints/recipes.test.ts` (append)

**Interfaces:**
- Consumes: `flatDocument`, `writeBackFlat`, `groupItems`, `migrateDocument`
- Produces: `runJoinery` returns `result.doc` TREE-shaped. Its checks run on the flat document.

- [ ] **Step 1: Write the failing tests**

`src/document/treeReaders.test.ts`:

```ts
import { buildCutList, flatDocument, groupItems } from './document';
import { assemblyDoc } from './treeFixtures';
import { ungroupItem } from './treeOps';

describe('the cut list reads the flat document (assemblies spec §6)', () => {
  it('a grouped document lists the same rows as its flat twin, apart from names', () => {
    const doc = assemblyDoc();
    const flatTwin = ungroupItem(ungroupItem(doc, 'i1')!.doc, 'i2')!.doc;
    // What the sheet PRINTS (formatted strings), so Ungroup's rounding below one
    // level cannot split a row that prints the same.
    const rows = (d: typeof doc) => buildCutList(flatDocument(d)).groups
      .flatMap((g) => g.rows.map((r) => ({ key: r.key, qty: r.qty, dims: r.dims, setup: r.setup })));
    expect(rows(groupItems(doc, null, ['r1'])!.doc)).toEqual(rows(flatTwin));
  });
  it('rows name parts by their display path', () => {
    const names = buildCutList(flatDocument(assemblyDoc())).groups.flatMap((g) => g.rows.flatMap((r) => r.names));
    expect(names).toContain('Drawer › Peg › Pin');
  });
});
```

`CutList` is `{ groups: CutListGroup[] }`, each group carrying `rows: CutListRow[]` (`src/document/cutlist.ts:24-110`). If a row's `key` embeds names, drop `key` from the comparison and keep `qty`, `dims` and `setup`.

Append to `recipes.test.ts`:

```ts
import { flatDocument, groupItems, writeBackFlat } from '../../document/document';

describe('joinery on assemblies (assemblies spec §6.1)', () => {
  it('joins a grouped design exactly as its flat twin, and returns the tree', () => {
    const flat = LEG_RAIL();
    const ids = flat.boards.map((b) => b.id);
    const grouped = groupItems(flat, null, ids)!.doc;
    const plainJoin = applyJoints(flat, findSites(flat), findSites(flat).map((s) => defaultChoice(s, flat, findSites(flat))));
    const f = flatDocument(grouped);
    const sites = findSites(f);
    const joined = applyJoints(f, sites, sites.map((s) => defaultChoice(s, f, sites)));
    const tree = writeBackFlat(grouped, f.boards, joined.doc.boards);
    expect(tree.instances).toHaveLength(1);
    const cuts = (d: SloydDocument) => flatDocument(d).boards.map((b) => b.cuts.map(({ id: _i, ...c }) => c));
    expect(cuts(tree)).toEqual(cuts(plainJoin.doc));
  });
});
```

- [ ] **Step 1b: Measure the separator before trusting it (invariant 19)**

Display paths reach measured sheet labels: `SheetLayout.tsx:71` passes `p.name` to `fitLabel`, whose arithmetic assumes every glyph advances `CHAR_W` (12.4) in the `--font-num` monospace stack. ` › ` (U+203A) is not ASCII, and invariant 19 says a non-ASCII mark must be measured in a browser first. Follow-up 92 rejected a symbol for exactly this.
1. On the dev server, measure the advance of `›` at the applied 20px in `--font-num`, the way `docs/browser-verification-turned-label.md` measured `×`.
2. If it is at or below 12.4 and renders from the monospace face (not a fallback), record the number in the verification doc and continue.
3. If not, STOP and ask the user: the approved spec shows `›`. ` > ` and ` / ` are the ASCII alternatives, and the change is one constant, `NAME_SEPARATOR` in `tree.ts`, plus the test strings.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/document/treeReaders.test.ts src/generate/joints/recipes.test.ts`
Expected: the cut-list name test fails, or passes already if `flatDocument` works; the joinery test should pass at the document level. Either way, the next step wires the callers.

- [ ] **Step 3: Implement**

`CutList.tsx`: `const list = buildCutList(flatDocument(doc));`. Add a comment: "The flat document: placed parts named by their display paths (assemblies spec §6)." Import `flatDocument`. Check the same file for any other `doc.boards` or `buildNesting` / `buildDiagrams` read of `doc`, and point each one at the same flattened document (compute it once in a variable).

`run.ts`, `runJoinery`:

```ts
  // Joinery reads the FLAT document (assemblies spec §6.1): placed parts named by
  // their display paths. Its result is written back into the tree by index.
  const flat = flatDocument(doc);
  const sites = findSites(flat);
  if (sites.length === 0) return { noSites: true };
  const limits = { width: null, depth: null, height: null, maxParts: flat.boards.length };
  const preexisting = checkDesign(flat, limits);
  const old = new Set(preexisting.map(problemKey));
  const build = (choices: JointChoice[], notes: string[]) => {
    const joined = applyJoints(flat, sites, choices);
    const violations = checkDesign(joined.doc, limits).filter((v) => !old.has(problemKey(v)));
    // The tree-shaped document is what useJoinery saves (out.result.doc).
    const tree = migrateDocument(writeBackFlat(doc, flat.boards, joined.doc.boards));
    const result = { ...joined, doc: tree };
    return { doc: tree, violations, result, notes, preexisting };
  };
```

Replace every remaining `doc` in `runJoinery`'s body with `flat` (in `siteMessage(flat, sites)`, `parseChoices(res.json, sites, flat)` and `defaultChoice(s, flat, sites)`). In `joineryEstimateUsd`, use `const flat = flatDocument(doc);` for `findSites` and `siteMessage`.

A flat document passes through unchanged: `flatDocument` returns `doc` itself when there are no instances. For it, `writeBackFlat` applies every changed field, which equals `joined.doc` apart from ids. Check that the existing `run.test.ts` joinery tests still pass. If one asserts board ids in `result.doc`, those ids now come from the original, which is the intent.

- [ ] **Step 4: Run, then mutate**

Run: `npx vitest run src/generate src/document src/panels/CutList.test.tsx`
Expected: PASS.

Mutate: in `run.ts`, return `result: joined` (the flat one). Add this test to `run.test.ts` if no existing one fails: call `runJoinery` with a mocked client on a grouped `LEG_RAIL` (copy the existing mock-client setup in `run.test.ts`; `grep -n "runJoinery" src/generate/run.test.ts`) and assert `out.result.doc.instances.length === 1`. It must be red under the mutation. Restore.

- [ ] **Step 5: Full gate, then commit**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git add src && git commit -m "feat: the cut list and joinery read the flat document; joinery keeps the tree

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The viewport

**Files:**
- Modify:
  - `src/viewport/Viewport.tsx` (`CameraKeys`, `Viewport`)
  - `src/viewport/BoardMesh.tsx` (props `faded`, `onOpen`; double-click; fade material)
  - `src/viewport/Gizmo.tsx:234-250`
  - `src/viewport/MoveTool.tsx:46`, `src/viewport/TapeTool.tsx:49`, `src/viewport/moveCandidates.ts`
- Test: `src/viewport/moveCandidates.test.ts` (append; the only viewport unit under test, by design)

**Interfaces:**
- Consumes: `worldParts`, `isCovered`, `parentPath`, `partAt`; store `openPath`, `openPart`
- Produces: the viewport reads world parts everywhere; no new exports.

**The rule for every viewport file:** replace `useStore((s) => s.doc.boards)` with `useStore((s) => worldParts(s.doc))`. It is cached per document object, so the selector returns a stable array (invariant 43). "Selected" for a part means `isCovered(board.id, new Set(selectedIds))`, computed in a `useMemo`.

- [ ] **Step 1: Write the failing test for `moveCandidates`**

```ts
import { assemblyDoc } from '../document/treeFixtures';
import { worldParts } from '../document/tree';

describe('moveCandidates with assemblies', () => {
  it('a selected assembly offers its parts’ points before a grab and none after', () => {
    const doc = assemblyDoc();
    const world = worldParts(doc);
    const pre = moveCandidates(world, [], ['i1'], [], false, false);
    expect(new Set(pre.map((p) => p.owner.id))).toEqual(new Set(['i1/b1', 'i1/b2', 'i1/i2/b3']));
    const post = moveCandidates(world, [], ['i1'], [], true, false);
    expect(new Set(post.map((p) => p.owner.id))).toEqual(new Set(['r1']));
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/viewport/moveCandidates.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `moveCandidates`**

Use `const covered = (b: Board) => isCovered(b.id, selected);` in place of `selected.has(b.id)` in both branches.

- [ ] **Step 4: The viewport components**

`Viewport.tsx`, in `Viewport`:

```tsx
  const boards = useStore((s) => worldParts(s.doc));
  const openPath = useStore((s) => s.openPath);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  ...
      {shown.map((board) => (
        <BoardMesh
          key={board.id}
          board={board}
          selected={isCovered(board.id, selectedSet)}
          // Faded, but still clickable: a click outside the open assembly
          // closes it (assemblies spec §3.3). Never pass selectable={false} for this.
          faded={openPath !== null && !board.id.startsWith(`${openPath}/`)}
          onOpen={(id) => useStore.getState().openPart(id)}
          ...existing props unchanged
        />
      ))}
```

`board.id.startsWith(`${openPath}/`)` is correct here because the trailing `/` makes it a whole-segment test. In `CameraKeys`, swap `s.doc.boards` for `worldParts(s.doc)` (both the selector and the imperative read). The `f` subset becomes the world parts `isCovered` by `selectedIds`.

`BoardMesh.tsx`:
- Add the props `faded: boolean;` and `onOpen: (id: string) => void;`.
- On each `<mesh>`, add:

```tsx
          onDoubleClick={(e) => {
            if (!selectable) return;
            e.stopPropagation();
            onOpen(board.id);
          }}
```

- For the fade, set `transparent` and `opacity={faded ? 0.35 : 1}` on the grain materials, and pass `depthWrite={!faded}`. The edge line's opacity is `faded ? 0.3 : (selected ? 1 : 0.8)`.
- Do NOT gate `onClick` on `faded`.
- Add a one-line comment above `faded` in `Props`: "outside the open assembly: drawn faded, still clickable (a click closes the assembly), still a snap target".

`Gizmo.tsx`:

```tsx
  const boards = useStore((s) => worldParts(s.doc));
  const selectedIds = useStore((s) => s.selectedIds);
  const doc = useStore((s) => s.doc);
  const selected = useMemo(() => {
    const set = new Set(selectedIds);
    return boards.filter((b) => isCovered(b.id, set));
  }, [boards, selectedIds]);
  // The single-part path ONLY when exactly one selected id is a PART (assemblies
  // plan, Review Focus): an assembly holding one part must move its origin,
  // through moveGroupTo, never the part.
  const singlePart = selectedIds.length === 1 && partAt(doc, selectedIds[0]!) !== null;
  const board = singlePart ? selected[0] : undefined;
  const bounds = !singlePart && selected.length >= 1 ? boardsBounds(selected) : null;
```

The commit's group branch must call `moveGroupTo(selectedIds, min)`, not `moveGroupTo(selected.map((b) => b.id), …)`. Read the commit code (`grep -n "moveGroupTo" src/viewport/Gizmo.tsx`) and pass `selectedIds`. `selectionKey` becomes `selectedIds.join('|')`.

`MoveTool.tsx` and `TapeTool.tsx`: change the `boards` selector to `worldParts(s.doc)`.

- [ ] **Step 5: Unit gate**

Run: `npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Expected: PASS.

- [ ] **Step 6: Browser check of the viewport alone (dev server, the user watching)**

Follow `DEPLOYMENT.local.md` and the memory note *Browser verification on this VPS*: Playwright MCP, `npm run dev -- --port 5180`. Do NOT touch production. To get a tree into the dev browser, import a `.sloyd` file. Write one to the scratchpad by running in a vitest one-off or node: `JSON.stringify(assemblyDoc())` with `version: 10`. Then confirm:
1. A click on the drawer selects the whole drawer (all its parts highlight).
2. A double-click opens it: everything else fades.
3. A click on the faded top closes the drawer and selects the top.
4. Dragging the gizmo with the drawer selected moves all its parts together.
5. Escape is not wired yet (Task 14).

Record the results for `docs/browser-verification-assemblies.md` (Task 15).

- [ ] **Step 7: Commit**

```bash
git add src/viewport && git commit -m "feat(viewport): draw world parts; fade, double-click and item-aware gizmo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The panels

**Files:**
- Modify: `src/panels/PartsList.tsx` (tree), `src/panels/Properties.tsx` (instance panel, Group/Ungroup, mixed selection, names through `renameItem`, world parts), `src/panels/CopyInRow.tsx` (world parts)
- Modify: `src/document/tree.ts` (add `treeRows`)
- Test: `src/panels/PartsList.test.tsx`, `src/panels/Properties.test.tsx`, `src/document/tree.test.ts` (append)

**Interfaces:**
- Produces: `treeRows(doc): Array<{ path: string; name: string; kind: 'part' | 'assembly'; depth: number; link?: string }>` in `tree.ts`, depth first, a container's parts before its assemblies.

- [ ] **Step 1: Write the failing tests**

Append to `tree.test.ts`:

```ts
import { treeRows } from './tree';
it('treeRows lists the tree depth first', () => {
  expect(treeRows(assemblyDoc()).map((r) => [r.path, r.kind, r.depth])).toEqual([
    ['r1', 'part', 0], ['i1', 'assembly', 0], ['i1/b1', 'part', 1], ['i1/b2', 'part', 1],
    ['i1/i2', 'assembly', 1], ['i1/i2/b3', 'part', 2],
  ]);
});
```

`PartsList.test.tsx`, beside the existing tests (copy their render/reset setup):

```tsx
it('shows assemblies as collapsible rows and opens the parent of a nested row', async () => {
  useStore.getState().replaceDocument(assemblyDoc());
  render(<PartsList />);
  expect(screen.getByRole('button', { name: 'Drawer' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Collapse Drawer' }));
  expect(screen.queryByRole('button', { name: 'Side' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Expand Drawer' }));
  await userEvent.click(screen.getByRole('button', { name: 'Pin' }));
  expect(useStore.getState().openPath).toBe('i1/i2');
  expect(useStore.getState().selectedIds).toEqual(['i1/i2/b3']);
});
```

`Properties.test.tsx`:

```tsx
it('an assembly gets its own panel: name, turn, Ungroup', async () => {
  useStore.getState().replaceDocument(assemblyDoc());
  useStore.getState().selectBoard('i1');
  render(<Properties />);
  expect(screen.getByDisplayValue('Drawer')).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Turn'), '180');
  expect(instanceAt(useStore.getState().doc, 'i1')!.rotation).toBe(180);
  await userEvent.click(screen.getByRole('button', { name: 'Ungroup' }));
  expect(useStore.getState().doc.instances.map((i) => i.id)).toEqual(['i2']);
});

it('a mixed selection hides the size fields and Link, and offers Group', async () => {
  useStore.getState().replaceDocument(assemblyDoc());
  useStore.getState().selectAll();
  render(<Properties />);
  expect(screen.queryByLabelText('Length')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Link' })).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Group' }));
  expect(useStore.getState().doc.instances).toHaveLength(1);
  expect(useStore.getState().doc.boards).toHaveLength(0);
});

it('a part inside an assembly is renamed among its siblings', async () => {
  useStore.getState().replaceDocument(assemblyDoc());
  useStore.getState().selectItem('i1/b1', false);
  render(<Properties />);
  const field = screen.getByDisplayValue('Side');
  await userEvent.clear(field);
  await userEvent.type(field, 'Front{Enter}');
  expect(partAt(useStore.getState().doc, 'i1/b1')!.name).toBe('Front (1)');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/panels src/document/tree.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `treeRows`** (in `tree.ts`)

```ts
export interface TreeRow { path: string; name: string; kind: 'part' | 'assembly'; depth: number; link?: string }

/** The parts list's rows: depth first, a container's parts before its assemblies. */
export function treeRows(doc: SloydDocument): TreeRow[] {
  const out: TreeRow[] = [];
  const defs = defsOf(doc);
  const walk = (c: Container, path: string | null, depth: number, onPath: Set<string>) => {
    for (const b of c.boards) out.push({ path: joinPath(path, b.id), name: b.name, kind: 'part', depth, ...(b.link ? { link: b.link } : {}) });
    for (const inst of c.instances) {
      const p = joinPath(path, inst.id);
      out.push({ path: p, name: inst.name, kind: 'assembly', depth });
      const d = defs.get(inst.definition);
      if (d && !onPath.has(d.id)) walk(d, p, depth + 1, new Set([...onPath, d.id]));
    }
  };
  walk(doc, null, 0, new Set());
  return out;
}
```

- [ ] **Step 4: `PartsList.tsx`**

Rows come from `useMemo(() => treeRows(doc), [doc])` (select `doc` as a bare field). Local `collapsed: Set<string>` state. A row is skipped when any ancestor path is in `collapsed`. Each row:

```tsx
            <li key={r.path} className={hiddenRow ? 'part-row hidden' : 'part-row'} style={{ paddingLeft: `${r.depth * 14}px` }}>
              <button className="part-eye" aria-label={`${hiddenSelf ? 'Show' : 'Hide'} ${r.name}`}
                onClick={() => setHidden(r.path, !hiddenSelf)}>
                <EyeIcon hidden={hiddenRow} />
              </button>
              {r.kind === 'assembly' && (
                <button className="part-caret" aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${r.name}`}
                  aria-expanded={!isCollapsed} onClick={() => toggleCollapsed(r.path)}>
                  {isCollapsed ? '▸' : '▾'}
                </button>
              )}
              <button className={selected ? 'part selected' : 'part'} aria-pressed={selected}
                aria-current={r.path === openPath ? 'true' : undefined}
                disabled={hiddenRow} onClick={(e) => selectRowByClick(r.path, e)}>
                {r.name}
              </button>
              {/* the existing chain icon, when r.link */}
            </li>
```

Here `hiddenSelf = hiddenIds.includes(r.path)` and `hiddenRow = isCovered(r.path, hiddenSet)`. Keep the empty state on `doc.boards.length === 0 && doc.instances.length === 0`. `linkCount` counts over `worldParts(doc)`. Add CSS for `.part-caret` next to `.part-eye` in `styles.css`: same size and reset as `.part-eye`.

- [ ] **Step 5: `Properties.tsx`**

- The `board` selector: `s.selectedIds.length === 1 ? worldParts(s.doc).find((b) => b.id === s.selectedIds[0]) : undefined`.
- `linkedCount` uses `worldParts(s.doc)`.
- A new selector `const instPath = useStore((s) => (s.selectedIds.length === 1 && instanceAt(s.doc, s.selectedIds[0]!) ? s.selectedIds[0]! : null));`. When `instPath` is non-null, render `<InstanceProperties path={instPath} />`.
- `commitName` becomes `(typed) => useStore.getState().renameItem(board.id, typed)`.
- Add a `Group` button to the single-part row of buttons: `<button onClick={() => useStore.getState().groupSelected()}>Group</button>`.

`InstanceProperties`:

```tsx
function InstanceProperties({ path }: { path: string }) {
  const inst = useStore((s) => instanceAt(s.doc, path));
  const duplicateBoards = useStore((s) => s.duplicateBoards);
  const deleteBoards = useStore((s) => s.deleteBoards);
  const hideUnselected = useStore((s) => s.hideUnselected);
  const turnAssembly = useStore((s) => s.turnAssembly);
  if (!inst) return null;
  return (
    <div className="properties" key={path}>
      <NameField value={inst.name} onCommit={(typed) => useStore.getState().renameItem(path, typed)} />
      <p className="assembly-note">Assembly — double-click it in the view to edit its parts.</p>
      <h3>Orientation</h3>
      <div className="field">
        <label htmlFor="turn">Turn</label>
        <select id="turn" className="input" value={inst.rotation}
          onChange={(e) => turnAssembly(path, Number(e.target.value) as Rotation)}>
          <option value={0}>0°</option>
          <option value={90}>90°</option>
          <option value={180}>180°</option>
          <option value={270}>270°</option>
        </select>
      </div>
      <div className="row">
        <button onClick={() => duplicateBoards([path])}>Duplicate</button>
        <button onClick={() => useStore.getState().ungroupSelected()}>Ungroup</button>
        <button onClick={() => useStore.getState().groupSelected()}>Group</button>
        <button onClick={hideUnselected}>Hide others</button>
        <button className="danger" onClick={() => deleteBoards([path])}>Delete</button>
      </div>
      <CopyInRow />
    </div>
  );
}
```

`instanceAt(s.doc, path)` returns the stored instance object, which is stable per document, so it is a legal selector.

`GroupProperties`:
- `allBoards = useStore((s) => worldParts(s.doc))`.
- `boards` = the selected ids that are world parts.
- `const allParts = boards.length === selectedIds.length;`.
- Render the Dimensions, Grain and Material sections and the Link/Unlink row only when `allParts`.
- The heading reads `{selectedIds.length} items selected` when `!allParts`.
- Add `Group` and `Ungroup` buttons beside Duplicate. Ungroup is shown when any selected id is an assembly.
- Change the existing early `if (boards.length === 0) return null;` to `if (selectedIds.length === 0) return null;`.
- `plan` = `useMemo(() => (allParts ? linkPlan(allBoards, selectedIds) : null), …)`.

- [ ] **Step 6: `CopyInRow.tsx`**

`allBoards = useStore((s) => worldParts(s.doc))`. `selected` = world parts `isCovered` by the selected ids, so the bounds cover whole assemblies.

- [ ] **Step 7: Run, then full gate**

Run: `npx vitest run src/panels && npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3`
Expected: PASS. Existing Properties tests that look for a heading `N parts selected` still pass, because all-part selections keep that text.

- [ ] **Step 8: Commit**

```bash
git add src && git commit -m "feat(panels): parts-list tree, assembly panel, Group/Ungroup, mixed selection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: App keys

**Files:**
- Modify: `src/App.tsx` (the one keydown effect, invariant 27)
- Test: `src/App.test.tsx` (append)

- [ ] **Step 1: Write the failing tests**

Copy the existing App test setup (`grep -n "fireEvent.keyDown\|userEvent.keyboard" src/App.test.tsx | head`):

```tsx
it('Ctrl+G groups the selection, Ctrl+Shift+G ungroups it, Escape closes an open assembly last', async () => {
  // render <App /> as the other App tests do, then:
  act(() => { useStore.getState().replaceDocument(assemblyDoc()); useStore.getState().selectAll(); });
  fireEvent.keyDown(window, { key: 'g', ctrlKey: true });
  expect(useStore.getState().doc.instances).toHaveLength(1);
  fireEvent.keyDown(window, { key: 'G', ctrlKey: true, shiftKey: true });
  expect(useStore.getState().doc.instances.map((i) => i.id)).toEqual(['i1']);
  act(() => useStore.getState().openAssembly('i1'));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(useStore.getState().openPath).toBeNull();
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/App.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

In the keydown effect:
- **Escape ladder:** add a last rung after `tool !== 'select'`:

```ts
        } else if (useStore.getState().openPath !== null) {
          // The last rung (assemblies spec §3.3): close one assembly level.
          e.preventDefault();
          useStore.getState().closeAssembly();
        }
```

- **Group keys:** beside Ctrl/Cmd+A:

```ts
      // Ctrl/Cmd+G groups, Ctrl/Cmd+Shift+G ungroups (assemblies spec §4.1).
      // preventDefault: Ctrl+G is the browser's find-next.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        if (e.shiftKey) useStore.getState().ungroupSelected();
        else useStore.getState().groupSelected();
        return;
      }
```

- [ ] **Step 4: Full gate, then commit**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git add src/App.tsx src/App.test.tsx && git commit -m "feat(app): Ctrl/Cmd+G, Ctrl/Cmd+Shift+G, Escape closes an assembly

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Live check, record, merge

**Files:**
- Create: `docs/browser-verification-assemblies.md`
- Modify: `CLAUDE.md`, `docs/follow-ups.md`, `docs/history.md`

- [ ] **Step 1: Whole-branch review**

Dispatch a fresh reviewer on the branch diff against `master` with the spec in hand (superpowers:requesting-code-review). Fix what it confirms.

- [ ] **Step 2: Live check on the dev server, the user watching** (spec §8 "Browser")

Run `npm run dev -- --port 5180` and drive the Playwright browser:
1. Add five boards and arrange a drawer; select them and press Ctrl+G.
2. Duplicate it twice. Move one and turn one 90°.
3. Double-click one, edit a side's length, press Escape.
4. Select the three drawers and group them as "Cabinet" (rename in Properties).
5. Hide one drawer from the parts list.
6. Open the cut list: sides are one row with path names.
7. Reload: the tree persists.
8. Import a v9 project: unchanged.
9. Click a faded part while a drawer is open: the drawer closes and that part is selected.

Take screenshots only where the finding is spatial (`docs/img/`). Write `docs/browser-verification-assemblies.md` in the shape of the earlier ones (`ls docs/browser-verification-*.md`). Note the software-GL caveat (26a) for the fade.

- [ ] **Step 3: Record**

- **`docs/follow-ups.md`:** add entries numbered from 224:
  - round 2's open question (a joint cut into one instance of a shared definition: make it unique, or cut every instance);
  - mirrored instances (needs 215);
  - a cut list grouped by assembly;
  - anything the review or live check left open.
- **`CLAUDE.md`:**
  - Status paragraph for the round; table row (`assemblies | 10-06 | 10 | …`);
  - the `Where things live` entries for `ids.ts`, `frames.ts`, `tree.ts`, `treeEdit.ts`, `treeOps.ts`, `treeRepair.ts`, `treeFixtures.ts`, `assemblyPick.ts`;
  - the `CURRENT_VERSION` mentions changed to 10 and the v10 argument in Versioning;
  - **invariant 8 restated** (unique among siblings);
  - **invariant 33 restated** (ids per container, definition ids document-wide, the drop-not-re-mint rule, `/` reserved);
  - **invariant 46 added** (spec §9);
  - the test count updated.
- **`docs/history.md`:** the round's narrative.

- [ ] **Step 4: Merge**

```bash
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git add -A && git commit -m "docs: assemblies round — live check, invariants 8/33 restated, 46 added

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git checkout master && git merge --no-ff assemblies -m "Merge branch 'assemblies': nested assemblies (schema 10)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git branch -d assemblies
```

Deploying is a separate decision for the user (`DEPLOYMENT.local.md`). Do not deploy as part of this plan.
