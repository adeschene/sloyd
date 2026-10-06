# Components (round 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copies of an assembly share one definition (Duplicate shares, Make Unique splits), and part links become shared `Shape`s, in schema 11.

**Architecture:** The round-1 tree (`frames.ts`, `tree.ts`, `treeEdit.ts`, `treeOps.ts`, `treeRepair.ts`) gains shared definitions and a document-wide `shapes` list. A stored part is a `StoredBoard`: a plain `Board`, or a `ShapedBoard` holding only own fields plus a `shape` id. `resolveBoard` is the one place a shape is read into a part; `worldParts` resolves, then places. Write-back keys on the storage target (definition + part id, and the shape). Joinery's write-back groups identical results.

**Tech Stack:** TypeScript, React, Zustand, Vitest, react-three-fiber.

**Spec:** `docs/superpowers/specs/2026-10-06-sloyd-components-design.md` (read it first; it builds on `docs/superpowers/specs/2026-10-06-sloyd-assemblies-design.md`).

## Global Constraints

- Every task ends with `npm test` green AND `npm run build` (the `tsc -b` gate) clean. `npm test` does not typecheck.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `CURRENT_VERSION` becomes **11** (Task 6). Rolling back strands v11 documents.
- Ids: part and instance ids unique per container; definition ids and shape ids unique document-wide; cut ids per board or per shape; `/` reserved in part/instance ids.
- Names unique among siblings (invariant 8); every new name goes through `uniqueName`.
- Stored values are exact (invariant 18). Nothing rounds what is already exact (invariant 25). No geometry moves on load.
- Every user action is ONE `edit()`, one undo entry; a no-op pushes nothing (invariant 4).
- No component reads `gesturing` (invariant 34). `useStore` selectors return bare fields, numbers or booleans, never fresh arrays (invariant 43's selector rule).
- **Mutate every new guard test** (CLAUDE.md, memory): break the guarded line, see red, restore.
- `LINK_FIELDS` remains the ONE shared/own table; `Shape` and `ShapedBoard` derive from it.

## Review Focus

1. **A part placed twice through a shared PARENT** (a drawer definition inside a cabinet definition placed twice): editing it from one placement must not throw "disagreeing edits". The store sends ONE edit per storage target (Task 4 test).
2. **A posture change on a linked part inside a turned assembly** re-pivots every user about its own centre, exactly (Task 5 test).
3. **Deleting one copy of a shared assembly** keeps the definition for the others; deleting the last prunes it (Task 3 test).
4. **Undo after Make Unique** restores sharing in one Ctrl+Z (Task 4 test).
5. **A v10 file whose link spans the root and an assembly** loads as ONE shape (Task 6 test).

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout -b components` from `master`. Run `npm test 2>&1 | tail -3` and record the count (2005 across 72 files expected).

---

### Task 1: Types, shapes and resolution

**Files:**
- Modify: `src/document/types.ts` (Board gains `shape?`, `Shape`, `ShapedBoard`, `StoredBoard`, `SloydDocument.shapes`, `Definition.boards: StoredBoard[]`)
- Modify: `src/document/links.ts` (`LINK_FIELDS` gains `shape: 'own'`; `OwnField`)
- Create: `src/document/shapes.ts` (`isShaped`, `resolveBoard`, `shapeMap`)
- Modify: `src/document/tree.ts` (`Container.boards: StoredBoard[]`; `partsBelow` resolves; `partAt` returns `StoredBoard | null`; new `resolvedPartAt`)
- Modify: `src/document/document.ts` (`createDocument` adds `shapes: []`; `migrateDocument` returns `shapes: []` for now; re-export `shapes.ts`)
- Modify: every file `tsc` then flags (expected: `treeOps.ts`, `treeEdit.ts`, `treeRepair.ts`, `store.ts`, `Gizmo.tsx`, tests building documents by hand)
- Test: `src/document/shapes.test.ts`, additions to `src/document/tree.test.ts`

**Interfaces:**
- Produces:
  - `interface Shape extends Pick<Board, SharedField> { id: string }`
  - `type ShapedBoard = Pick<Board, 'id' | 'name' | 'position' | 'rotation'> & { shape: string }`
  - `type StoredBoard = Board | ShapedBoard`
  - `Board.shape?: string` — set ONLY on resolved (world) parts; a stored plain Board never has it.
  - `isShaped(b: StoredBoard): b is ShapedBoard`
  - `shapeMap(doc: SloydDocument): Map<string, Shape>`
  - `resolveBoard(shapes: ReadonlyMap<string, Shape>, b: StoredBoard): Board | null` (null = missing shape)
  - `resolvedPartAt(doc, occ): Board | null`
  - `SloydDocument.shapes: Shape[]`

Keep `Board.link` and every link helper exactly as they are in this task; Task 5 retires them.

- [ ] **Step 1: Write the failing tests** (`src/document/shapes.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, isShaped, resolveBoard, shapeMap, worldParts } from './document';
import type { Shape, ShapedBoard, SloydDocument } from './document';

const leg: Shape = { id: 's1', length: 28, width: 1.75, thickness: 1.75, material: 'oak', grain: 'length', posture: 'upright',
  cuts: [{ id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 20, width: 2, depth: 0.5, stopMin: 0.25, stopMax: 0.25 }] };
const user = (id: string, x: number, rotation: 0 | 90 | 180 | 270 = 0): ShapedBoard =>
  ({ id, name: `Leg ${id}`, position: [x, 0, 0], rotation, shape: 's1' });

describe('shapes', () => {
  it('isShaped tells a shaped part from a plain one', () => {
    expect(isShaped(user('a', 0))).toBe(true);
    expect(isShaped(createBoard())).toBe(false);
  });

  it('resolveBoard fills a shaped part from its shape and keeps its own fields', () => {
    const b = resolveBoard(new Map([['s1', leg]]), user('a', 5, 90))!;
    expect(b).toMatchObject({ id: 'a', name: 'Leg a', position: [5, 0, 0], rotation: 90, shape: 's1', length: 28, posture: 'upright' });
    expect(b.cuts).toEqual(leg.cuts);
    expect(b.cuts[0]).not.toBe(leg.cuts[0]); // copies: no two parts hold one Cut object
  });

  it('resolveBoard returns a plain part as the SAME object, and null for a missing shape', () => {
    const p = createBoard();
    expect(resolveBoard(new Map(), p)).toBe(p);
    expect(resolveBoard(new Map(), user('a', 0))).toBeNull();
  });

  it('worldParts resolves root shaped parts', () => {
    const doc: SloydDocument = { ...createDocument(), boards: [user('a', 0), user('b', 10)], shapes: [leg] };
    const w = worldParts(doc);
    expect(w.map((b) => [b.id, b.length, b.shape])).toEqual([['a', 28, 's1'], ['b', 28, 's1']]);
    expect(shapeMap(doc).get('s1')).toBe(leg);
  });
});
```

Add to `src/document/tree.test.ts` (inside its top-level describe; reuse its imports, add `Shape` and `worldParts` if missing):

```ts
  it('worldParts resolves a shaped part inside a turned assembly', () => {
    const shape: Shape = { id: 's1', length: 10, width: 2, thickness: 1, material: 'pine', grain: 'length', posture: 'flat', cuts: [] };
    const doc: SloydDocument = {
      ...createDocument(),
      instances: [{ id: 'i1', name: 'A', definition: 'd1', position: [0, 0, 0], rotation: 90 }],
      definitions: [{ id: 'd1', boards: [{ id: 'b1', name: 'P', position: [0, 0, 0], rotation: 0, shape: 's1' }], instances: [] }],
      shapes: [shape],
    };
    const [p] = worldParts(doc);
    expect(p).toMatchObject({ id: 'i1/b1', length: 10, rotation: 90, shape: 's1' });
  });
```

- [ ] **Step 2: Run them and see them fail**

Run: `npx vitest run src/document/shapes.test.ts src/document/tree.test.ts`
Expected: FAIL (`isShaped` / `resolveBoard` not exported; `shapes` not a document field).

- [ ] **Step 3: Implement**

`types.ts` — in `Board`, after `link?`:

```ts
  /**
   * The Shape this part uses (components spec §2). Set ONLY on a RESOLVED part
   * (`resolveBoard`, `worldParts`); a stored plain part never has it, and a
   * stored shaped part is a `ShapedBoard`.
   */
  shape?: string;
```

After `Definition`, replace its `boards: Board[]` with `boards: StoredBoard[]`, and add:

```ts
/** A part's shared fields, stored once and used by every part naming it
 *  (components spec §2). Its cut ids are its own (invariant 33). */
export interface Shape extends Pick<Board, 'length' | 'width' | 'thickness' | 'material' | 'grain' | 'posture' | 'cuts'> {
  id: string;
}

/** A stored part that uses a Shape: its OWN fields and the shape's id, nothing else. */
export type ShapedBoard = Pick<Board, 'id' | 'name' | 'position' | 'rotation'> & { shape: string };

/** What a container stores: a plain part, or a shaped one. */
export type StoredBoard = Board | ShapedBoard;
```

In `SloydDocument`: `boards: StoredBoard[];` and, after `definitions`:

```ts
  /** Document-wide shared part fields (components spec §2). */
  shapes: Shape[];
```

`links.ts` — `LINK_FIELDS` gains `shape: 'own'` beside `link: 'own'`. Below `SHARED_KEYS` add:

```ts
export type OwnField = Exclude<keyof typeof LINK_FIELDS, SharedField>;
```

and a compile-time check that the hand-written `Shape` matches the table (invariant 40's argument):

```ts
import type { Shape } from './types';
/** Fails tsc when Shape's fields and LINK_FIELDS' shared set drift apart. */
const _shapeMatchesTable: [Exclude<keyof Shape, 'id'>] extends [SharedField] ? ([SharedField] extends [Exclude<keyof Shape, 'id'>] ? true : never) : never = true;
void _shapeMatchesTable;
```

Create `src/document/shapes.ts`:

```ts
import type { Board, Shape, ShapedBoard, SloydDocument, StoredBoard } from './types';

/** A stored part that uses a Shape. A plain part always has `length`; a shaped one never does. */
export function isShaped(b: StoredBoard): b is ShapedBoard {
  return !('length' in b);
}

export function shapeMap(doc: Pick<SloydDocument, 'shapes'>): Map<string, Shape> {
  return new Map(doc.shapes.map((s) => [s.id, s]));
}

/**
 * THE place a shape is read into a part (components spec §2.1). A plain part
 * comes back as the same object; a shaped part as a full Board carrying
 * `shape`, its cuts copied so no two parts hold one Cut object. Null when the
 * shape is missing (the load repair drops such a part).
 */
export function resolveBoard(shapes: ReadonlyMap<string, Shape>, b: StoredBoard): Board | null {
  if (!isShaped(b)) return b;
  const s = shapes.get(b.shape);
  if (!s) return null;
  return {
    id: b.id, name: b.name, position: b.position, rotation: b.rotation,
    length: s.length, width: s.width, thickness: s.thickness,
    material: s.material, grain: s.grain, posture: s.posture,
    cuts: s.cuts.map((c) => ({ ...c })),
    shape: b.shape,
  };
}
```

`tree.ts`:
- `Container` becomes `{ boards: StoredBoard[]; instances: Instance[] }`.
- `partsBelow` resolves first. Change its signature to take the shape map and skip unresolvable parts:

```ts
export function partsBelow(doc: SloydDocument, c: Container, defs = defsOf(doc), onPath = new Set<string>(), shapes = shapeMap(doc)): Board[] {
  const out: Board[] = c.boards.flatMap((b) => resolveBoard(shapes, b) ?? []);
  for (const inst of c.instances) {
    const d = defs.get(inst.definition);
    if (!d || onPath.has(d.id)) continue;
    const inner = partsBelow(doc, d, defs, new Set([...onPath, d.id]), shapes);
    for (const b of inner) out.push(placeBoard(inst, { ...b, id: joinPath(inst.id, b.id) }));
  }
  return out;
}
```

- `worldParts`: the early return `if (doc.instances.length === 0) return doc.boards;` must hold only when nothing needs resolving: `if (doc.instances.length === 0 && doc.shapes.length === 0) return doc.boards as Board[];` (with no shapes every stored part is a plain Board — validation guarantees it from Task 6; until then nothing creates a ShapedBoard outside tests).
- `partAt` returns `StoredBoard | null`. Add:

```ts
/** The stored part at `occ`, resolved (its shape read in), in its container's frame. */
export function resolvedPartAt(doc: SloydDocument, occ: string): Board | null {
  const p = partAt(doc, occ);
  return p ? resolveBoard(shapeMap(doc), p) : null;
}
```

- `flatDocument` adds `shapes: []` to its returned object (flat parts are resolved).
- `treeRows`: `b.link` reads only on plain parts. Write it as `...(!isShaped(b) && b.link ? { link: b.link } : {})` (Task 8 replaces it).

`document.ts`: `createDocument` adds `shapes: []`; `migrateDocument`'s returned object adds `shapes: []`; add `export * from './shapes';` beside the other star exports.

Then run `npx tsc -b` and fix EVERY error by resolving the stored part, never by a cast to `Board`:
- `treeOps.ts` `ungroupItem`: `placeBoard(inst, b)` needs a resolved part. Use `const r = resolveBoard(shapeMap(doc), b)`; skip a null; for a shaped `b`, keep it shaped: `isShaped(b) ? { ...b, position: placed.position, rotation: placed.rotation, id, name } : { ...placed, id, name }` (own fields from the placed result, everything else from storage).
- `treeOps.ts` `turnInstance`: `partsBelow` already resolves.
- `treeOps.ts` `copyInstanceTree`: copies `cuts` only for plain parts (`isShaped(b) ? { ...b, position: [...b.position] } : { ...b, position: [...], cuts: ... }`).
- `treeEdit.ts` `applyWorldEdits`: `const stored = partAt(...)` is a `StoredBoard`; resolve it for `placeBoard` (`resolveBoard(shapeMap(doc), stored)`, skip null). Writing back into a shaped part is Task 2; for now, if `isShaped(stored)` write only own fields (`position`, `rotation`, `name`) and skip the rest.
- `treeRepair.ts` `dedupeContainer`: types `StoredBoard`.
- `store.ts` `addBoard`: the template `last` may be shaped; resolve with `resolveBoard(shapeMap(get().doc), last)`.
- `store.ts` `duplicateBoards` / `copyInRow`: `copyBoard(part, …)` needs a Board: `const part = resolvedPartAt(doc, id)`.
- `store.ts` `renameItem`: `partAt` only reads `name` — compiles unchanged.
- Test files constructing `SloydDocument` literals: add `shapes: []`. `src/document/treeFixtures.ts` too.

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run src/document/shapes.test.ts src/document/tree.test.ts && npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -2`
Expected: all pass, build clean.

- [ ] **Step 5: Mutate.** In `resolveBoard`, return `s.cuts` instead of copies: the "not.toBe" assertion must go red. In `worldParts`, drop the `&& doc.shapes.length === 0` clause: the root-shaped test must go red. Restore both.

- [ ] **Step 6: Commit**

```bash
git add -A src && git commit -m "feat(document): Shape, ShapedBoard and resolveBoard; worldParts resolves before it places

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Write-back keys on the storage target

**Files:**
- Modify: `src/document/treeEdit.ts` (`applyWorldEdits`, new `storageKey`, `updateDefinition`)
- Test: `src/document/treeEdit.test.ts`

**Interfaces:**
- Consumes: Task 1's `isShaped`, `shapeMap`, `resolveBoard`, `partAt`, `instancesOn`.
- Produces:
  - `storageKey(doc: SloydDocument, occ: string): string | null` — `"<definitionId or ROOT>:<partId>"`, the same for every placement of one stored part.
  - `applyWorldEdits(doc, edits, opts?)` — same signature; now keyed by storage target; writes shared fields of a shaped part into its Shape; THROWS `Error('applyWorldEdits: disagreeing edits to <key>')` when two edits reach one target with different results.

- [ ] **Step 1: Write the failing tests** (append to `src/document/treeEdit.test.ts`; import `Shape`, `SloydDocument`, `createDocument`, `applyWorldEdits`, `worldParts`, `storageKey` from `./document`)

```ts
describe('applyWorldEdits with shared definitions and shapes', () => {
  const shared = (): SloydDocument => ({
    ...createDocument(),
    instances: [
      { id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 },
      { id: 'i2', name: 'Drawer (1)', definition: 'd1', position: [20, 0, 0], rotation: 90 },
    ],
    definitions: [{ id: 'd1', boards: [
      { id: 'b1', name: 'Side', length: 16, width: 6, thickness: 0.5, position: [0, 0, 0], rotation: 0, posture: 'on-edge', grain: 'length', material: 'maple', cuts: [] },
      { id: 'b2', name: 'Leg', position: [3, 0, 3], rotation: 0, shape: 's1' },
    ], instances: [] }],
    shapes: [{ id: 's1', length: 6, width: 1, thickness: 1, material: 'oak', grain: 'length', posture: 'upright', cuts: [] } satisfies Shape],
  });

  it('storageKey is the same for every placement of one stored part', () => {
    const doc = shared();
    expect(storageKey(doc, 'i1/b1')).toBe('d1:b1');
    expect(storageKey(doc, 'i2/b1')).toBe('d1:b1');
    expect(storageKey(doc, 'nope')).toBeNull();
  });

  it('an edit through one placement changes the definition, so every copy changes', () => {
    const doc = shared();
    const before = worldParts(doc).find((b) => b.id === 'i1/b1')!;
    const out = applyWorldEdits(doc, [{ before, after: { ...before, length: 18 } }]);
    expect(worldParts(out).filter((b) => b.name === 'Side').map((b) => b.length)).toEqual([18, 18]);
  });

  it('a shared field of a shaped part goes to the shape; its own fields stay on the part', () => {
    const doc = shared();
    const before = worldParts(doc).find((b) => b.id === 'i1/b2')!;
    const out = applyWorldEdits(doc, [{ before, after: { ...before, length: 7, name: 'Post' } }]);
    expect(out.shapes[0]!.length).toBe(7);
    const stored = out.definitions[0]!.boards[1]!;
    expect(stored).toEqual({ id: 'b2', name: 'Post', position: [3, 0, 3], rotation: 0, shape: 's1' });
  });

  it('identical edits through two placements merge; disagreeing ones throw', () => {
    const doc = shared();
    const w = worldParts(doc);
    const a = w.find((b) => b.id === 'i1/b1')!;
    const b = w.find((x) => x.id === 'i2/b1')!;
    const merged = applyWorldEdits(doc, [{ before: a, after: { ...a, width: 7 } }, { before: b, after: { ...b, width: 7 } }]);
    expect(merged.definitions[0]!.boards[0]).toMatchObject({ width: 7 });
    expect(() => applyWorldEdits(doc, [{ before: a, after: { ...a, width: 7 } }, { before: b, after: { ...b, width: 8 } }]))
      .toThrow(/disagreeing edits to d1:b1/);
  });

  it('two different stored parts using one shape must agree on the shape', () => {
    const doc: SloydDocument = { ...shared(), boards: [{ id: 'r1', name: 'Leg R', position: [50, 0, 0], rotation: 0, shape: 's1' }] };
    const w = worldParts(doc);
    const r = w.find((b) => b.id === 'r1')!;
    const l = w.find((b) => b.id === 'i1/b2')!;
    expect(() => applyWorldEdits(doc, [{ before: r, after: { ...r, length: 9 } }, { before: l, after: { ...l, length: 10 } }]))
      .toThrow(/disagreeing edits to shape s1/);
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `npx vitest run src/document/treeEdit.test.ts`
Expected: FAIL (`storageKey` missing; shape write not implemented).

- [ ] **Step 3: Implement**

In `treeEdit.ts` add:

```ts
const ROOT = 'ROOT';

/** The id of the definition holding `container`'s parts, or ROOT. */
function definitionIdOf(doc: SloydDocument, container: string | null): string | null {
  if (container === null) return ROOT;
  return definitionAt(doc, container)?.id ?? null;
}

/** Where an occurrence is STORED: the same key for every placement of one
 *  stored part (components spec §4.1). Null when the occurrence does not resolve. */
export function storageKey(doc: SloydDocument, occ: string): string | null {
  const def = definitionIdOf(doc, parentPath(occ));
  if (def === null || !partAt(doc, occ)) return null;
  return `${def}:${lastSegment(occ)}`;
}

/** Replace one definition's (or the root's) parts by id. */
function updateDefinition(doc: SloydDocument, defId: string, fn: (boards: StoredBoard[]) => StoredBoard[]): SloydDocument {
  if (defId === ROOT) return { ...doc, boards: fn(doc.boards) };
  return { ...doc, definitions: doc.definitions.map((d) => (d.id === defId ? { ...d, boards: fn(d.boards) } : d)) };
}

/** Deep equality for written records (plain data: numbers, strings, arrays, cut objects). */
const sameRecord = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
```

Rewrite the body of `applyWorldEdits` (keep its doc comment, add the new rules to it):

```ts
export function applyWorldEdits(doc: SloydDocument, edits: readonly WorldEdit[], opts?: { keepWorld?: boolean }): SloydDocument {
  const shapes = shapeMap(doc);
  const parts = new Map<string, { defId: string; next: StoredBoard }>();   // by storage key
  const shapeWrites = new Map<string, Shape>();                               // by shape id
  for (const { before, after } of edits) {
    const occ = before.id;
    const cPath = parentPath(occ);
    const stored = partAt(doc, occ);
    const defId = definitionIdOf(doc, cPath);
    if (!stored || defId === null) continue;
    const resolved = resolveBoard(shapes, stored);
    if (!resolved) continue;
    const chain = cPath === null ? [] : instancesOn(doc, cPath) ?? [];
    const reps: Board[] = [];
    reps[chain.length] = resolved;
    for (let j = chain.length - 1; j >= 0; j -= 1) reps[j] = placeBoard(chain[j]!, reps[j + 1]!);
    let cur = after;
    for (let j = 0; j < chain.length; j += 1) cur = lower(chain[j]!, reps[j]!, reps[j + 1]!, cur);

    const resized = opts?.keepWorld === true
      && (before.posture !== after.posture || boardExtents(before).some((e, a) => e !== boardExtents(after)[a]));
    const moved = resized || !samePosition(before.position, after.position) || before.rotation !== after.rotation;
    const rec = (b: Board) => b as unknown as Record<string, unknown>;
    const changedKeys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => {
      if (k === 'id' || k === 'shape') return false;            // never written through here
      if (k === 'position' || k === 'rotation') return moved;
      return k === 'cuts' ? before.cuts !== after.cuts : rec(before)[k] !== rec(after)[k];
    });
    const valueOf = (k: string) => (k === 'position' ? [...cur.position] : k === 'rotation' ? cur.rotation : rec(after)[k]);

    const key = `${defId}:${stored.id}`;
    const base = parts.get(key)?.next ?? stored;
    const next: Record<string, unknown> = { ...base };
    let shapeNext: Record<string, unknown> | null = null;
    for (const k of changedKeys) {
      const shared = (LINK_FIELDS as Record<string, string>)[k] === 'shared';
      if (isShaped(stored) && shared) {
        shapeNext ??= { ...(shapeWrites.get(stored.shape) ?? shapes.get(stored.shape)!) };
        shapeNext[k] = valueOf(k);
      } else if (k in after || k === 'position' || k === 'rotation') {
        next[k] = valueOf(k);
      } else {
        delete next[k];
      }
    }
    const prior = parts.get(key);
    if (prior && !sameRecord(prior.next, next)) throw new Error(`applyWorldEdits: disagreeing edits to ${key}`);
    parts.set(key, { defId, next: next as unknown as StoredBoard });
    if (shapeNext && isShaped(stored)) {
      const priorShape = shapeWrites.get(stored.shape);
      if (priorShape && !sameRecord(priorShape, shapeNext)) throw new Error(`applyWorldEdits: disagreeing edits to shape ${stored.shape}`);
      shapeWrites.set(stored.shape, shapeNext as unknown as Shape);
    }
  }
  let out = doc;
  const byDef = new Map<string, Map<string, StoredBoard>>();
  for (const { defId, next } of parts.values()) {
    if (!byDef.has(defId)) byDef.set(defId, new Map());
    byDef.get(defId)!.set(next.id, next);
  }
  for (const [defId, m] of byDef) out = updateDefinition(out, defId, (bs) => bs.map((b) => m.get(b.id) ?? b));
  if (shapeWrites.size) out = { ...out, shapes: out.shapes.map((s) => shapeWrites.get(s.id) ?? s) };
  return out;
}
```

Notes for the implementer:
- `parts.get(key)?.next ?? stored` builds the second edit on the FIRST edit's result, so identical edits produce an identical record and merge, and different ones differ and throw.
- A shape write for a shaped part never touches the stored part's shared fields (it has none).
- Imports: `LINK_FIELDS` from `./links`; `Shape`, `StoredBoard` types; `isShaped`, `resolveBoard`, `shapeMap` from `./shapes`.
- Existing tests in this file must stay green unchanged (a flat document goes through exactly round 1's arithmetic).

- [ ] **Step 4:** `npx vitest run src/document/treeEdit.test.ts && npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -2` — all green.

- [ ] **Step 5: Mutate.** (a) Delete the `throw` for parts: the disagreeing-edits test goes red. (b) Write shared fields to the stored part even when shaped: the shape test goes red. (c) Key `parts` by container PATH instead of `defId`: the "every copy changes" test still passes, but the merge test throws — confirm red. Restore.

- [ ] **Step 6: Commit** — `feat(document): write-back keys on the storage target; shared fields of a shaped part go to its shape`.

---

### Task 3: Tree operations for shared definitions and shapes

**Files:**
- Modify: `src/document/treeOps.ts` (`shareInstance`, `makeUniqueItem`, `removeItems` prunes shapes and dissolves one-user shapes; `copyInstanceTree` deleted with its tests)
- Modify: `src/document/shapes.ts` (`shapeUsers`, `pruneShapes`, `dissolveShapes`)
- Test: `src/document/treeOps.test.ts`, `src/document/shapes.test.ts`

**Interfaces:**
- Produces:
  - `shapeUsers(doc): Map<string, number>` — shape id → number of STORED parts naming it.
  - `pruneShapes(doc): SloydDocument` — drop unreferenced shapes; same object when unchanged.
  - `dissolveShapes(doc): SloydDocument` — a shape with ONE stored user: that user becomes a plain Board carrying the shape's fields (cut ids kept); the shape is dropped. Same object when unchanged.
  - `shareInstance(inst: Instance): Instance` — a copy with a fresh id naming the SAME definition (position copied).
  - `makeUniqueItem(doc, path): SloydDocument | null` — one level deep (spec §3.1); null when the instance's definition is named by fewer than two instances.
  - `instanceRefs(doc): Map<string, number>` — definition id → number of instances naming it (anywhere).

- [ ] **Step 1: Failing tests.** Append to `src/document/treeOps.test.ts`:

```ts
describe('shared definitions', () => {
  const base = (): SloydDocument => ({
    ...createDocument(),
    instances: [
      { id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 },
      { id: 'i2', name: 'Drawer (1)', definition: 'd1', position: [20, 0, 0], rotation: 0 },
    ],
    definitions: [
      { id: 'd1', boards: [createBoard({ id: 'b1', name: 'Side' }), { id: 'b2', name: 'Leg', position: [1, 0, 1], rotation: 0, shape: 's1' }],
        instances: [{ id: 'k1', name: 'Knob', definition: 'd2', position: [0, 0, 0], rotation: 0 }] },
      { id: 'd2', boards: [createBoard({ id: 'n1', name: 'Knob' })], instances: [] },
    ],
    shapes: [{ id: 's1', length: 6, width: 1, thickness: 1, material: 'oak', grain: 'length', posture: 'upright', cuts: [] }],
  });

  it('shareInstance names the same definition with a fresh id', () => {
    const inst = base().instances[0]!;
    const c = shareInstance(inst);
    expect(c.definition).toBe('d1');
    expect(c.id).not.toBe(inst.id);
    expect(c.position).not.toBe(inst.position);
  });

  it('makeUniqueItem copies ONE level: plain parts copied with their ids, shaped parts and nested instances still shared', () => {
    const doc = base();
    const out = makeUniqueItem(doc, 'i2')!;
    const i2 = out.instances.find((i) => i.id === 'i2')!;
    expect(i2.definition).not.toBe('d1');
    const copy = out.definitions.find((d) => d.id === i2.definition)!;
    expect(copy.boards.map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(copy.boards[0]).not.toBe(doc.definitions[0]!.boards[0]);
    expect(copy.boards[1]).toMatchObject({ shape: 's1' });
    expect(copy.instances[0]!.definition).toBe('d2');
    expect(out.instances.find((i) => i.id === 'i1')!.definition).toBe('d1');
    // occurrence paths are unchanged
    expect(worldParts(out).map((b) => b.id)).toEqual(worldParts(doc).map((b) => b.id));
  });

  it('makeUniqueItem refuses an instance that is not shared', () => {
    const doc = base();
    const single = { ...doc, instances: [doc.instances[0]!] };
    expect(makeUniqueItem(single, 'i1')).toBeNull();
  });

  it('ungroupItem on a shared copy leaves the other copy and the definition alone', () => {
    const doc = base();
    const out = ungroupItem(doc, 'i2')!.doc;
    expect(out.instances.map((i) => i.id)).toEqual(['i1']);
    expect(out.definitions.map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(worldParts(out).filter((b) => b.id.startsWith('i1/')).map((b) => b.id)).toEqual(['i1/b1', 'i1/b2', 'i1/k1/n1']);
    // the ungrouped leg keeps its shape; with i1's leg that is two stored users, so it is not dissolved
    expect(out.shapes).toHaveLength(1);
  });

  it('removeItems keeps a definition another copy still names, and prunes the last', () => {
    const one = removeItems(base(), ['i2']);
    expect(one.definitions.map((d) => d.id)).toEqual(['d1', 'd2']);
    const none = removeItems(one, ['i1']);
    expect(none.definitions).toEqual([]);
    expect(none.shapes).toEqual([]);
  });

  it('dissolveShapes turns a one-user shape back into a plain part', () => {
    const doc = base();
    const out = dissolveShapes(doc);
    const b2 = out.definitions[0]!.boards[1]!;
    expect(isShaped(b2)).toBe(false);
    expect(b2).toMatchObject({ id: 'b2', name: 'Leg', position: [1, 0, 1], length: 6, posture: 'upright' });
    expect(out.shapes).toEqual([]);
    const two = { ...doc, boards: [{ id: 'r1', name: 'Leg R', position: [9, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' }] };
    expect(dissolveShapes(two)).toBe(two);
  });
});
```

(One stored part inside `d1` counts once even though `d1` is placed twice: `shapeUsers` counts STORED users. That is why `base()`'s shape dissolves.)

- [ ] **Step 2:** Run `npx vitest run src/document/treeOps.test.ts` — FAIL (missing exports).

- [ ] **Step 3: Implement.**

`shapes.ts`:

```ts
/** Stored users per shape id (a part placed by several copies counts once). */
export function shapeUsers(doc: Pick<SloydDocument, 'boards' | 'definitions'>): Map<string, number> {
  const n = new Map<string, number>();
  for (const b of [...doc.boards, ...doc.definitions.flatMap((d) => d.boards)]) {
    if (isShaped(b)) n.set(b.shape, (n.get(b.shape) ?? 0) + 1);
  }
  return n;
}

export function pruneShapes(doc: SloydDocument): SloydDocument {
  const used = shapeUsers(doc);
  const kept = doc.shapes.filter((s) => used.has(s.id));
  return kept.length === doc.shapes.length ? doc : { ...doc, shapes: kept };
}

/** A shape with ONE stored user is not shared: the user becomes plain (cut ids kept). */
export function dissolveShapes(doc: SloydDocument): SloydDocument {
  const used = shapeUsers(doc);
  const lone = new Set([...used].filter(([, n]) => n === 1).map(([id]) => id));
  if (lone.size === 0) return doc;
  const shapes = shapeMap(doc);
  const fix = (bs: StoredBoard[]) => bs.map((b) => (isShaped(b) && lone.has(b.shape) ? plainOf(resolveBoard(shapes, b)!) : b));
  return pruneShapes({ ...doc, boards: fix(doc.boards), definitions: doc.definitions.map((d) => ({ ...d, boards: fix(d.boards) })) });
}

/** A resolved part as a stored plain part: no `shape` key. */
export function plainOf(b: Board): Board {
  const { shape: _shape, ...rest } = b;
  return rest;
}
```

`treeOps.ts`:

```ts
export function shareInstance(inst: Instance): Instance {
  return { ...inst, id: nextId(), position: [...inst.position] as [number, number, number] };
}

/** Definition id -> how many instances name it, anywhere in the document. */
export function instanceRefs(doc: SloydDocument): Map<string, number> {
  const n = new Map<string, number>();
  for (const i of [...doc.instances, ...doc.definitions.flatMap((d) => d.instances)]) n.set(i.definition, (n.get(i.definition) ?? 0) + 1);
  return n;
}

/**
 * Make Unique (components spec §3.1): the instance at `path` gets its own copy
 * of its definition, ONE level deep. Plain parts are copied keeping their ids
 * (ids are per container), so occurrence paths, hidden ids and held points are
 * unchanged; shaped parts keep their shape; nested instances keep their
 * definitions. Null when the definition is named by fewer than two instances.
 */
export function makeUniqueItem(doc: SloydDocument, path: string): SloydDocument | null {
  const inst = instanceAt(doc, path);
  const def = definitionAt(doc, path);
  if (!inst || !def || (instanceRefs(doc).get(def.id) ?? 0) < 2) return null;
  const copy: Definition = {
    id: nextId(),
    boards: def.boards.map((b) => (isShaped(b)
      ? { ...b, position: [...b.position] as [number, number, number] }
      : { ...b, position: [...b.position] as [number, number, number], cuts: b.cuts.map((c) => ({ ...c })) })),
    instances: def.instances.map((j) => ({ ...j, position: [...j.position] as [number, number, number] })),
  };
  const withDef = { ...doc, definitions: [...doc.definitions, copy] };
  return updateContainer(withDef, parentPath(path), (c) => ({
    ...c, instances: c.instances.map((i) => (i.id === inst.id ? { ...i, definition: copy.id } : i)),
  }));
}
```

`removeItems` ends with `return dissolveShapes(pruneShapes(pruneDefinitions(out)));`. `ungroupItem` ends the same way (an ungrouped copy's shaped parts keep the shape). Delete `copyInstanceTree` and its tests (Task 4 removes its store callers; until then keep the export and only delete it in Task 4's commit if `tsc` still needs it — the implementer decides by `tsc`, never by a cast).

Note `makeUniqueItem`'s turn: when the instance is inside a SHARED container, `updateContainer` repoints it in that container, which every placement of the container shares. That is the spec's rule (the copy's container decides), and it is why the panel offers Make Unique by instance refs, not placements (Task 8).

- [ ] **Step 4:** focused tests, `npm test`, `npm run build` — green.
- [ ] **Step 5: Mutate.** `makeUniqueItem` copying nested definitions too (deep): the `d2` assertion goes red. `shapeUsers` counting PLACEMENTS (walk `worldParts` instead): the dissolve test goes red. `removeItems` without `pruneDefinitions`: the prune test goes red. Restore.
- [ ] **Step 6: Commit** — `feat(document): shared instances, Make Unique one level deep, shape pruning and dissolving`.

---

### Task 4: Store — Duplicate shares, Make Unique, Select copies, one edit per storage target, held points across copies

**Files:**
- Modify: `src/store/store.ts`
- Test: `src/store/store.components.test.ts` (new)

**Interfaces:**
- Consumes: `shareInstance`, `makeUniqueItem`, `instanceRefs`, `storageKey`, `resolvedPartAt`.
- Produces (store actions):
  - `makeUnique(path: string): void` — one `edit()`; no-op (no entry) when `makeUniqueItem` returns null.
  - `selectCopies(path: string): void` — selects the instances at the open level naming the same definition, through `selectionPatch`.
  - private `judgeHeld()` — runs `dropHeldIfGone` for every board-owned held point (`grabbed`, `tapeAnchor`, `tapeHover`), point-precise.
  - private `oneEditPerTarget(doc, ids: Iterable<string>): Set<string>` — keeps the FIRST occurrence id per `storageKey`.

- [ ] **Step 1: Failing tests** (`src/store/store.components.test.ts`):

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { createDocument, worldParts } from '../document/document';
import type { SloydDocument } from '../document/document';

const drawerDoc = (): SloydDocument => ({
  ...createDocument(),
  instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 }],
  definitions: [{ id: 'd1', boards: [
    { id: 'b1', name: 'Side', length: 16, width: 6, thickness: 0.5, position: [0, 0, 0], rotation: 0, posture: 'on-edge', grain: 'length', material: 'maple', cuts: [] },
  ], instances: [] }],
});
const s = () => useStore.getState();
beforeEach(() => { s().replaceDocument(drawerDoc()); s().setTool('select'); });

describe('components in the store', () => {
  it('Duplicate of an assembly shares its definition', () => {
    s().duplicateBoards(['i1']);
    const doc = s().doc;
    expect(doc.instances.map((i) => i.definition)).toEqual(['d1', 'd1']);
    expect(doc.definitions).toHaveLength(1);
    expect(doc.instances[1]!.name).toBe('Drawer (1)');
  });

  it('Copy in a row of an assembly shares its definition', () => {
    s().copyInRow(['i1'], 3, 0, 1, 20);
    expect(s().doc.instances.map((i) => i.definition)).toEqual(['d1', 'd1', 'd1']);
    expect(s().doc.instances.map((i) => i.position[0])).toEqual([0, 20, 40]);
  });

  it('an edit inside one copy changes every copy, in one undo entry', () => {
    s().duplicateBoards(['i1']);
    const before = s().past.length;
    s().openAssembly('i1');
    s().updateBoards(['i1/b1'], { length: 18 });
    expect(worldParts(s().doc).filter((b) => b.name === 'Side').map((b) => b.length)).toEqual([18, 18]);
    expect(s().past.length).toBe(before + 1);
  });

  it('a part reached through a shared PARENT is edited once, without throwing', () => {
    // cabinet c placed twice; it holds the drawer instance once
    s().replaceDocument({
      ...drawerDoc(),
      instances: [
        { id: 'c1', name: 'Cabinet', definition: 'dc', position: [0, 0, 0], rotation: 0 },
        { id: 'c2', name: 'Cabinet (1)', definition: 'dc', position: [40, 0, 0], rotation: 90 },
      ],
      definitions: [...drawerDoc().definitions, { id: 'dc', boards: [], instances: [{ id: 'i1', name: 'Drawer', definition: 'd1', position: [0, 0, 0], rotation: 0 }] }],
    });
    s().openAssembly('c1'); s().openAssembly('c1/i1');
    s().selectItem('c1/i1/b1', false);
    expect(() => s().updateBoards(['c1/i1/b1', 'c2/i1/b1'], { posture: 'flat' })).not.toThrow();
    expect(worldParts(s().doc).every((b) => b.posture === 'flat')).toBe(true);
  });

  it('Make Unique splits one copy off, and one Ctrl+Z shares it again', () => {
    s().duplicateBoards(['i1']);
    const copy = s().doc.instances[1]!.id;
    s().makeUnique(copy);
    expect(new Set(s().doc.instances.map((i) => i.definition)).size).toBe(2);
    s().openAssembly('i1');
    s().updateBoards(['i1/b1'], { length: 30 });
    expect(worldParts(s().doc).filter((b) => b.name === 'Side').map((b) => b.length)).toEqual([30, 16]);
    s().undo(); s().undo();
    expect(s().doc.instances.map((i) => i.definition)).toEqual(['d1', 'd1']);
  });

  it('Make Unique on an unshared assembly pushes no entry', () => {
    const n = s().past.length;
    s().makeUnique('i1');
    expect(s().past.length).toBe(n);
  });

  it('selectCopies selects the copies at the open level', () => {
    s().duplicateBoards(['i1']);
    s().duplicateBoards(['i1']);
    s().selectCopies('i1');
    expect(s().selectedIds).toHaveLength(3);
  });

  it('a tape anchor on a part in ANOTHER copy drops when an edit inside the definition removes its point', () => {
    s().duplicateBoards(['i1']);
    const other = s().doc.instances[1]!.id;
    const part = worldParts(s().doc).find((b) => b.id === `${other}/b1`)!;
    const far = part.position.map((v, a) => v + [part.length, part.width, part.thickness][[0, 1, 2][a]!]!) as [number, number, number];
    // anchor on the copy's max corner, then shorten the side inside i1
    s().setTool('tape');
    useStore.setState({ tapeAnchor: { at: far, kind: 0, owner: { type: 'board', id: `${other}/b1` } } as never });
    s().openAssembly('i1');
    s().updateBoards(['i1/b1'], { length: 10 });
    expect(s().tapeAnchor).toBeNull();
  });
});
```

The last test's anchor point uses the part's world max corner. On-edge 0° maps x←length, y←width, z←thickness, so `far` is `position + [length, width, thickness]`. If the implementer finds `snapPointsFor` does not offer exactly that point, derive `far` from `snapPointsFor(part)` (the corner with the largest x) instead, and say so in the report; do NOT weaken the assertion.

- [ ] **Step 2:** `npx vitest run src/store/store.components.test.ts` — FAIL.

- [ ] **Step 3: Implement.**
- `duplicateBoards` and `copyInRow`: replace `copyInstanceTree(doc, inst)` with `shareInstance(inst)`; drop the `definitions` arrays (nothing new to insert). Copy in a row sets `position: at(inst.position)` on the shared copy as now.
- `oneEditPerTarget`:

```ts
  /** The FIRST occurrence per storage target (components spec §4.1): two
   *  placements of one stored part must not both send an edit. */
  const oneEditPerTarget = (doc: SloydDocument, ids: Iterable<string>): Set<string> => {
    const seen = new Set<string>();
    const out = new Set<string>();
    for (const id of ids) {
      const k = storageKey(doc, id) ?? id;
      if (seen.has(k)) continue;
      seen.add(k);
      out.add(id);
    }
    return out;
  };
```

  In `updateBoards`, after computing `targets` and `others`, run both through it: `const t = oneEditPerTarget(doc, targets); const o = new Set([...oneEditPerTarget(doc, [...t, ...others])].filter((id) => !t.has(id)));` and use `t`/`o` in the `mapWorld` call.
- `judgeHeld`:

```ts
  /** Every board-owned held point, judged point-precisely (components spec §4.2):
   *  an edit inside a definition moves parts in EVERY copy, so judging only the
   *  edited occurrence would miss held points under the other copies. */
  const judgeHeld = () => {
    const owners = new Set<string>();
    for (const h of [get().grabbed, get().tapeAnchor, get().tapeHover]) if (h && h.owner.type === 'board') owners.add(h.owner.id);
    for (const id of owners) dropHeldIfGone(id);
  };
```

  Replace each `for (const id of …) dropHeldIfGone(id);` after a part edit (`updateBoards`, `addCut`, `updateCut`, `removeCut`, `linkBoards`) with `judgeHeld();`. Keep `updateBoards`' board-precise `grabbed` clause for the targets (invariant 24's asymmetry).
- `makeUnique` and `selectCopies` (declare both in the store's interface beside `turnAssembly`):

```ts
    makeUnique: (path) => {
      const next = makeUniqueItem(get().doc, path);
      if (!next) return; // invariant 4
      edit(() => next);
    },

    selectCopies: (path) => {
      const doc = get().doc;
      const inst = instanceAt(doc, path);
      if (!inst) return;
      const container = parentPath(path);
      const c = containerAt(doc, container);
      if (!c) return;
      set(selectionPatch(c.instances.filter((i) => i.definition === inst.definition).map((i) => joinPath(container, i.id))));
    },
```

  `makeUnique` keeps paths, so no re-key and no hidden-id patch.

- [ ] **Step 4:** focused, full `npm test`, `npm run build` — green. Existing round-1 tests asserting Duplicate makes a NEW definition must be updated to the new rule (spec §3.1); change only those assertions and list each in the report.
- [ ] **Step 5: Mutate.** Remove `oneEditPerTarget` from `updateBoards`: the shared-parent test must throw (red). Replace `judgeHeld()` with the old per-target loop: the tape test goes red. Make `makeUnique` call `edit` unconditionally: the no-entry test goes red. Restore.
- [ ] **Step 6: Commit** — `feat(store): Duplicate shares; Make Unique; Select copies; one edit per storage target; held points judged across copies`.

---

### Task 5: Store — links on shapes; retire `Board.link`

**Files:**
- Modify: `src/document/types.ts` (delete `Board.link`), `src/document/links.ts` (delete `link` from `LINK_FIELDS`, delete `withoutLink`, `dissolveSingletons`, `repairLinks`; keep `sharedOf`, `SHARED_KEYS`, `sameShared`, `linkPlan` — `linkPlan` now reads `shape` instead of `link`)
- Modify: `src/store/store.ts` (`copyBoard`, `mates`, `linkBoards`, `unlinkBoards`, `selectLinked`, `addCut`/`updateCut`/`removeCut`, `deleteBoards`)
- Modify: `src/document/treeRepair.ts` (delete `repairLinksTree`; `migrateDocument` stops calling it — Task 6 adds the real migration)
- Modify: `src/document/tree.ts` (`treeRows` emits `shape` instead of `link`), `src/panels/PartsList.tsx`, `src/panels/Properties.tsx` (rename `link` reads to `shape`; behaviour unchanged)
- Test: rewrite `src/document/links.test.ts`, and the link tests in `src/store/store.test.ts`, `store.assemblies.test.ts`, `Properties.test.tsx`, `PartsList.test.tsx`, `runJoinery.test.ts` to assert `shape` equality instead of `link` labels

**Interfaces:**
- `linkPlan(boards: readonly Board[], ids): LinkPlan | null` — same rules; `LinkPlan.label` becomes `shape: string | null` (the source's or a selected member's existing shape id).
- `linkBoards(ids)`: one `edit()`: (1) `mapWorld` patches each member (deduped by `oneEditPerTarget`, source excluded) with `patchBoard(b, sharedOf(source))` so a posture change pivots it about its own centre; (2) the shape: the plan's `shape` id if any, else a new `{ id: nextId(), ...sharedOf(source) }`; its fields are set to `sharedOf(source)`; (3) every member's STORED part becomes `{ id, name, position, rotation, shape }` (own fields from the result of step 1); (4) `pruneShapes`.
- `unlinkBoards(ids)`: each selected shaped part's STORED part becomes `plainOf(resolved)` (cut ids kept); then `dissolveShapes`. No-op when none is shaped.
- `selectLinked(id)`: world parts with the same `shape`, through `selectionPatch` (unchanged rule).
- Cut actions on a shaped part need no mates: `mapWorld` writes the shape once. Delete `mates` from the cut actions. `updateBoards` keeps `mates` (renamed `shapeMates`, reading `shape`) ONLY so each other user is re-pivoted on a posture change — its patch is `sharedPatch(patch)`, and Task 2's merge makes the shape write agree.
- `copyBoard`: a SHAPED source's copy is a `ShapedBoard` with the same `shape` (own fields copied, `position` as given); a plain source's copy stays a plain Board with fresh cut ids. Duplicate/Copy in a row read `partAt` (stored) to decide.
- `deleteBoards`: `removeItems` already dissolves (Task 3); drop the `mapWorld(..., dissolveSingletons)` wrapper.

- [ ] **Step 1: Failing tests** — add to `src/store/store.components.test.ts`:

```ts
describe('links are shapes', () => {
  const legs = (): SloydDocument => ({
    ...createDocument(),
    boards: [0, 1, 2, 3].map((k) => ({ id: `l${k}`, name: `Leg ${k}`, length: 28, width: 1.75, thickness: 1.75,
      position: [k * 10, 0, 0] as [number, number, number], rotation: ([0, 90, 180, 270] as const)[k]!, posture: 'upright' as const,
      grain: 'length' as const, material: 'oak', cuts: [] })),
  });

  it('Link stores one shape and makes every member a shaped part', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1', 'l2', 'l3']);
    const doc = s().doc;
    expect(doc.shapes).toHaveLength(1);
    expect(doc.boards.every((b) => 'shape' in b && !('length' in b))).toBe(true);
    expect(worldParts(doc).map((b) => [b.position, b.rotation])).toEqual(legs().boards.map((b) => [b.position, b.rotation]));
  });

  it('a cut added on one leg appears, with one id, on every leg', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1', 'l2', 'l3']);
    s().addCut('l2');
    const ids = worldParts(s().doc).map((b) => b.cuts.map((c) => c.id).join());
    expect(new Set(ids).size).toBe(1);
    expect(s().doc.shapes[0]!.cuts).toHaveLength(1);
  });

  it('a posture change re-pivots every user about its own centre, exactly', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1', 'l2', 'l3']);
    const centre = (b: ReturnType<typeof worldParts>[number]) => {
      const e = boardExtents(b);
      return [b.position[0] + e[0] / 2, b.position[2] + e[2] / 2];
    };
    const before = worldParts(s().doc).map(centre);
    s().updateBoards(['l0'], { posture: 'flat' });
    expect(worldParts(s().doc).map(centre)).toEqual(before);
  });

  it('Unlink of one of two dissolves the shape: both are plain parts again', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1']);
    s().unlinkBoards(['l0']);
    expect(s().doc.shapes).toEqual([]);
    expect(s().doc.boards.every((b) => 'length' in b)).toBe(true);
  });

  it('Duplicate of a linked leg shares its shape; of a plain leg stays plain', () => {
    s().replaceDocument(legs());
    s().linkBoards(['l0', 'l1']);
    s().duplicateBoards(['l0', 'l2']);
    const copies = s().doc.boards.slice(4);
    expect('shape' in copies[0]!).toBe(true);
    expect('length' in copies[1]!).toBe(true);
  });
});
```

(import `boardExtents` from `../document/document`.)

- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3: Implement** per the Interfaces block. Then `npx tsc -b`: every remaining `.link` read is a compile error; convert each to `.shape` (world parts) or remove it (store/document). The tests listed under **Files** that assert link labels become shape assertions, behaviour unchanged (e.g. `expect(w[0].link).toBe(w[1].link)` → `expect(w[0].shape).toBe(w[1].shape)` and `toBeDefined()`).
- [ ] **Step 4:** focused, full suite, build — green.
- [ ] **Step 5: Mutate.** Skip the pivot (`patchBoard` → plain spread) in `linkBoards`: a Link of members differing in posture must go red — add that test if none exists (`l3` with `posture: 'flat'` before linking; its centre must not move). Keep fresh cut ids for a shaped copy: the duplicate test still passes, so instead mutate `copyBoard` to make shaped copies plain: red. Restore.
- [ ] **Step 6: Commit** — `feat(store): links are shapes; Board.link retired`.

---

### Task 6: Load — schema 11, shape validation, links migrate to shapes, repair for sharing

**Files:**
- Modify: `src/document/document.ts` (`CURRENT_VERSION = 11` with a v11 paragraph; `validateBoard` accepts a shaped part; `validateShapes`; legacy `link` read for `version < 11`; call order)
- Modify: `src/document/treeRepair.ts` (`repairTree(doc, { copyShared })`; missing-shape drop; prune; dissolve)
- Create: `src/document/linksToShapes.ts` (`linksToShapes`)
- Test: `src/document/document.test.ts`, `src/document/treeRepair.test.ts`, `src/document/linksToShapes.test.ts`

**Interfaces:**
- `validateShapes(raw: unknown): Shape[]` — not an object, no string id, a duplicate id (first wins), or an invalid size: dropped. Fields validated exactly as `validateBoard`'s shared fields (positive finite dims, material fallback, posture/grain fallback, sheet-good grain normalisation, `validateCuts` against the shape's dims with its own `seen` set).
- `validateBoard` returns `StoredBoard`: an object with a string `shape` and NO `length` key is a `ShapedBoard` (validate `id`, `name`, `position`, `rotation` exactly as now); otherwise today's rules.
- `linksToShapes(doc: SloydDocument, legacyLinks: Map<StoredBoard, string>): SloydDocument` — spec §2.4: per label, the FIRST member in `worldParts` order is the reference; members `sameShared` with it become shaped parts naming a new shape (`{ id: nextId(), ...sharedOf(first) }`, cut ids kept); a differing member stays plain. Nothing moves.
- `repairTree(doc, opts: { copyShared: boolean })` — step 4 runs only when `copyShared` (`d.version < 11`).

- [ ] **Step 1: Failing tests** (`src/document/linksToShapes.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { migrateDocument, worldParts } from './document';

const leg = (id: string, x: number, extra: Record<string, unknown> = {}) => ({
  id, name: `Leg ${id}`, length: 28, width: 1.75, thickness: 1.75, position: [x, 0.1, 0.3], rotation: 90, posture: 'upright',
  grain: 'length', material: 'oak', cuts: [{ id: 'c1', face: 'thickness', from: 'max', across: 'width', offset: 0.1, width: 0.7, depth: 0.5, stopMin: 0, stopMax: 0 }],
  link: 'L', ...extra,
});

describe('v10 -> v11: links become shapes', () => {
  it('equal members become users of one shape; nothing moves', () => {
    const v10 = { version: 10, name: 'x', boards: [leg('a', 0), leg('b', 10.1)], instances: [], definitions: [] };
    const doc = migrateDocument(v10);
    expect(doc.version).toBe(11);
    expect(doc.shapes).toHaveLength(1);
    expect(doc.boards.map((b) => 'shape' in b)).toEqual([true, true]);
    expect(worldParts(doc).map((b) => [b.position, b.rotation, b.cuts[0]!.id]))
      .toEqual([[[0, 0.1, 0.3], 90, 'c1'], [[10.1, 0.1, 0.3], 90, 'c1']]);
  });

  it('a differing member stays a plain part, unlinked', () => {
    const v10 = { version: 10, name: 'x', boards: [leg('a', 0), leg('b', 10, { length: 27 }), leg('c', 20)], instances: [], definitions: [] };
    const doc = migrateDocument(v10);
    expect(doc.boards.map((b) => 'shape' in b)).toEqual([true, false, true]);
    expect((doc.boards[1] as { length: number }).length).toBe(27);
  });

  it('a link spanning the root and an assembly becomes ONE shape', () => {
    const v10 = {
      version: 10, name: 'x', boards: [leg('a', 0)],
      instances: [{ id: 'i1', name: 'A', definition: 'd1', position: [5, 0, 0], rotation: 0 }],
      definitions: [{ id: 'd1', boards: [leg('b', 0)], instances: [] }],
    };
    const doc = migrateDocument(v10);
    expect(doc.shapes).toHaveLength(1);
    expect(doc.definitions[0]!.boards[0]).toMatchObject({ shape: doc.shapes[0]!.id });
  });

  it('a v10 file with a definition referenced twice is still copied; a v11 file keeps the sharing', () => {
    const tree = (version: number) => ({
      version, name: 'x', boards: [],
      instances: [
        { id: 'i1', name: 'A', definition: 'd1', position: [0, 0, 0], rotation: 0 },
        { id: 'i2', name: 'B', definition: 'd1', position: [9, 0, 0], rotation: 0 },
      ],
      definitions: [{ id: 'd1', boards: [{ ...leg('p', 0), link: undefined }], instances: [] }],
      shapes: [],
    });
    expect(new Set(migrateDocument(tree(10)).instances.map((i) => i.definition)).size).toBe(2);
    expect(new Set(migrateDocument(tree(11)).instances.map((i) => i.definition)).size).toBe(1);
  });

  it('v11: a shaped part naming a missing shape is dropped; a one-user shape dissolves; a `link` key is ignored', () => {
    const v11 = {
      version: 11, name: 'x', shapes: [{ id: 's1', length: 5, width: 1, thickness: 1, material: 'oak', grain: 'length', posture: 'flat', cuts: [] }],
      boards: [
        { id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' },
        { id: 'b', name: 'B', position: [0, 0, 0], rotation: 0, shape: 'gone' },
        { ...leg('c', 0), link: 'L' },
      ],
      instances: [], definitions: [],
    };
    const doc = migrateDocument(v11);
    expect(doc.boards.map((b) => b.id)).toEqual(['a', 'c']);
    expect('length' in doc.boards[0]!).toBe(true); // dissolved: one user
    expect(doc.shapes).toEqual([]);
    expect('link' in doc.boards[1]!).toBe(false);
  });
});
```

- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3: Implement.**
  - `validateBoard(raw, index, seen, legacy?: Map<StoredBoard, string>)`: when `typeof b.shape === 'string' && b.shape && !('length' in b)`, return `{ id: takeId(b.id, seen), name: name || 'Board', position, rotation, shape: b.shape }` (position/rotation validated as today). Otherwise today's plain board without the `link` spread; if `legacy` is given and `b.link` is a non-blank string, `legacy.set(result, b.link)` after building it.
  - Thread one `legacy` map through root boards and `validateDefinitions` ONLY when `d.version < 11` (pass `undefined` otherwise, so a v11 file's stray `link` is ignored).
  - `migrateDocument` order after validation:

```ts
  let doc: SloydDocument = { version: CURRENT_VERSION, name, units, stock: { kerf }, guides, boards, instances, definitions, shapes: validateShapes(d.shapes) };
  // Links first, while each stored part is still the object validateBoard
  // built (the `legacy` map is keyed by object). worldParts tolerates missing
  // definitions and cycles, so it is safe before repairTree; a v10 definition
  // placed twice is visited twice but converted once (same stored object).
  if (legacy) doc = linksToShapes(doc, legacy);
  doc = repairTree(doc, { copyShared: d.version < 11 });
  return dissolveShapes(pruneShapes(dropUnresolved(doc)));
```

    where `dropUnresolved` (in `treeRepair.ts`) drops every shaped part whose shape id is not in `doc.shapes`, then re-runs `pruneDefinitions`-free cleanup (definitions are not removed for being empty). Names were deduped inside `repairTree`; dropping parts cannot create duplicates.
  - `repairTree(doc, { copyShared })`: memoise fixed definitions by id. When an instance names a definition already fixed: if `copyShared`, mint a copy as today (step 4); otherwise point at the fixed one. Cycles and missing definitions as today.
  - `linksToShapes.ts`:

```ts
import type { SloydDocument, StoredBoard, Shape } from './types';
import { nextId } from './ids';
import { sameShared, sharedOf } from './links';
import { worldParts, partAt } from './tree';
import { updateContainer } from './treeEdit';

/**
 * v10 -> v11 (components spec §2.4): each link label becomes ONE Shape built
 * from its FIRST member in worldParts order; a member equal to it (exactly,
 * cuts by id and geometry) becomes a shaped part keeping id, name, position
 * and turn; a differing member stays plain, unlinked. Nothing moves.
 * `legacy` maps each STORED part object to its label (validateBoard filled it).
 */
export function linksToShapes(doc: SloydDocument, legacy: Map<StoredBoard, string>): SloydDocument {
  if (legacy.size === 0) return doc;
  const first = new Map<string, ReturnType<typeof worldParts>[number]>();
  const shapes: Shape[] = [];
  const shapeOf = new Map<string, string>();     // label -> shape id
  const convert = new Map<StoredBoard, string>(); // stored part -> shape id
  for (const w of worldParts(doc)) {
    const stored = partAt(doc, w.id);
    const label = stored ? legacy.get(stored) : undefined;
    if (!stored || label === undefined || convert.has(stored)) continue;
    const ref = first.get(label);
    if (!ref) {
      first.set(label, w);
      const s = { id: nextId(), ...sharedOf(w) };
      shapes.push(s);
      shapeOf.set(label, s.id);
      convert.set(stored, s.id);
    } else if (sameShared(ref, w)) {
      convert.set(stored, shapeOf.get(label)!);
    }
  }
  const fix = (bs: StoredBoard[]) => bs.map((b) => {
    const id = convert.get(b);
    return id === undefined ? b : { id: b.id, name: b.name, position: b.position, rotation: b.rotation, shape: id };
  });
  return { ...doc, shapes: [...doc.shapes, ...shapes], boards: fix(doc.boards), definitions: doc.definitions.map((d) => ({ ...d, boards: fix(d.boards) })) };
}
```

    (Drop the unused `updateContainer` import. It runs BEFORE `repairTree`, as the order above shows, because `legacy` is keyed by the stored objects `validateBoard` returned and `repairTree`'s name dedupe replaces renamed ones. The step-4 copy that `repairTree` then makes of a v10 definition placed twice carries the converted shaped parts, so both copies use one shape.)
  - `CURRENT_VERSION` doc comment gains a v11 paragraph: the argument (spec §2.4), the order, and that the step is guarded by `version < 11` and is NOT idempotent-sensitive (a v11 file carries no links).

- [ ] **Step 4:** focused, full, build — green. `repairLinks`-era load tests in `document.test.ts` asserting unlink-on-load become migration tests (v10 input).
- [ ] **Step 5: Mutate.** Always pass `copyShared: true`: the v11 sharing test goes red. Compare members by `sharedOf(first)` with cut ids ignored: the differing-member test still passes, so instead add a v10 case where member `b` differs ONLY by a cut id and assert it stays plain, then mutate to red. Skip `dissolveShapes`: the one-user test goes red. Restore.
- [ ] **Step 6: Commit** — `feat(document): schema 11 — shapes on load, links migrate to shapes, sharing kept from v11`.

---

### Task 7: Joinery shares where identical

**Files:**
- Modify: `src/document/treeEdit.ts` (`writeBackFlat` rewritten; new private helpers)
- Test: `src/document/treeEdit.test.ts`, `src/generate/joints/runJoinery.test.ts`

**Interfaces:**
- `writeBackFlat(doc, flatBefore, flatAfter): SloydDocument` — same signature; spec §5. Returns a document that `migrateDocument` then repairs (dissolve, prune).

- [ ] **Step 1: Failing tests** (append to `treeEdit.test.ts`):

```ts
describe('writeBackFlat shares where identical', () => {
  const drawers = (n: number): SloydDocument => ({
    ...createDocument(),
    instances: Array.from({ length: n }, (_, k) => ({ id: `i${k}`, name: `D${k}`, definition: 'd1', position: [k * 30, 0, 0] as [number, number, number], rotation: 0 as const })),
    definitions: [{ id: 'd1', boards: [
      { id: 'b1', name: 'Side', length: 16, width: 6, thickness: 0.5, position: [0, 0, 0], rotation: 0, posture: 'on-edge', grain: 'length', material: 'maple', cuts: [] },
    ], instances: [] }],
  });
  const cut = { face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 1, width: 0.5, depth: 0.25, stopMin: 0, stopMax: 0 };
  const flat = (doc: SloydDocument) => flatDocument(doc).boards;

  it('identical results keep one definition (cut ids from the first)', () => {
    const doc = drawers(3);
    const before = flat(doc);
    const after = before.map((b, k) => ({ ...b, cuts: [{ id: `x${k}`, ...cut }] }));
    const out = writeBackFlat(doc, before, after);
    expect(new Set(out.instances.map((i) => i.definition)).size).toBe(1);
    expect(worldParts(out).map((b) => b.cuts[0]!.id)).toEqual(['x0', 'x0', 'x0']);
  });

  it('a copy whose result differs splits off; the others stay shared', () => {
    const doc = drawers(3);
    const before = flat(doc);
    const after = before.map((b, k) => ({ ...b, cuts: [{ id: `x${k}`, ...cut, offset: k === 2 ? 3 : 1 }] }));
    const out = writeBackFlat(doc, before, after);
    expect(out.instances.map((i) => i.definition).slice(0, 2)).toEqual(['d1', 'd1']);
    expect(out.instances[2]!.definition).not.toBe('d1');
    expect(worldParts(out).map((b) => b.cuts[0]!.offset)).toEqual([1, 1, 3]);
  });

  it('four shaped legs with identical mortises stay one shape (follow-up 223)', () => {
    const shape = { id: 's1', length: 28, width: 1.75, thickness: 1.75, material: 'oak', grain: 'length' as const, posture: 'upright' as const, cuts: [] };
    const doc: SloydDocument = { ...createDocument(), shapes: [shape],
      boards: [0, 1, 2, 3].map((k) => ({ id: `l${k}`, name: `Leg ${k}`, position: [k * 10, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })) };
    const before = flat(doc);
    const after = before.map((b, k) => ({ ...b, cuts: [{ id: `m${k}`, ...cut }] }));
    const out = writeBackFlat(doc, before, after);
    expect(out.shapes).toHaveLength(1);
    expect(out.shapes[0]!.cuts.map((c) => c.id)).toEqual(['m0']);
    expect(out.boards.every((b) => 'shape' in b)).toBe(true);
  });

  it('a leg whose mortise differs gets its own shape', () => {
    const shape = { id: 's1', length: 28, width: 1.75, thickness: 1.75, material: 'oak', grain: 'length' as const, posture: 'upright' as const, cuts: [] };
    const doc: SloydDocument = { ...createDocument(), shapes: [shape],
      boards: [0, 1, 2].map((k) => ({ id: `l${k}`, name: `Leg ${k}`, position: [k * 10, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })) };
    const before = flat(doc);
    const after = before.map((b, k) => ({ ...b, cuts: [{ id: `m${k}`, ...cut, offset: k === 1 ? 5 : 1 }] }));
    const out = writeBackFlat(doc, before, after);
    expect(out.shapes).toHaveLength(2);
    expect(worldParts(out).map((b) => b.cuts[0]!.offset)).toEqual([1, 5, 1]);
  });
});
```

Add to `runJoinery.test.ts` (adapt its fixture helpers): linked legs (shapes) cut by joinery with identical mortises come back as ONE shape — replacing the round's existing "comes out unlinked" assertion, which is now the opposite (follow-up 223 closed).

- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3: Implement** `writeBackFlat`:

```ts
/**
 * Joinery's way back (components spec §5). Parts pair BY INDEX with the
 * flattened before (count mismatch throws). Each occurrence's result is
 * lowered into its own container's frame (keepWorld, as round 1). Then:
 * 1. assemblies, top-down: a definition whose placements' subtree results
 *    differ splits; the group holding the first placement keeps it, every
 *    other group gets a one-level copy (ids kept, so paths and results stay
 *    keyed by occurrence id). Repeat until every definition's placements agree.
 * 2. results are written per storage target (now unambiguous);
 * 3. shapes: users grouped by shared fields with cuts compared by GEOMETRY;
 *    the first user's group keeps the shape, others get new shapes; a group
 *    takes its first member's cut ids. migrateDocument dissolves one-user shapes.
 */
export function writeBackFlat(doc: SloydDocument, flatBefore: readonly Board[], flatAfter: readonly Board[]): SloydDocument
```

  Helpers to write (private, in `treeEdit.ts`):
  - `localResult(doc, before: Board, after: Board): Board` — the lowering loop from `applyWorldEdits` (extract it into a shared private `lowerEdit(doc, before, after, keepWorld)` returning the lowered `Board`, so both functions use ONE copy).
  - `placementsOf(doc, defId): string[]` — instance paths naming `defId`, from `itemPaths` + `instanceAt`.
  - `signature(results: Map<string, Board>, path: string): string` — `JSON.stringify` of the sorted `[relativeId, ownAndSharedFields]` of every occurrence under `path`, with each cut written WITHOUT its id (`CUT_GEOMETRY_KEYS` only, in order) — geometry, not id.
  - the split loop: `for (;;) { find the first definition, in root-first BFS order, whose placements have more than one signature; if none, break; group; for each non-first group, copy the definition one level (ids kept) and repoint each placement's instance via updateContainer(parentPath(p)) }`.
  - shapes: after writing parts (via `applyWorldEdits` with ONE edit per storage key — pick the first occurrence per key; all agree now), group each shape's stored users by `signature`-style key of their shared fields (cuts without ids); keep/new shapes; rewrite users' `shape` ids; within a group set the shape's cuts to the first member's cuts (ids included).

  Keep the docstring's rules exactly; add a test-only export nothing.

- [ ] **Step 4:** focused, full, build — green.
- [ ] **Step 5: Mutate.** Compare cuts WITH ids in `signature`: the identical-drawers test goes red (x0/x1/x2 differ). Split bottom-up (process the deepest definition first) — add a nested case (cabinet ×2 holding one drawer instance each, results differing per cabinet) and confirm red under that mutation. Restore.
- [ ] **Step 6: Commit** — `feat(joinery): write-back shares where identical (closes follow-up 223)`.

---

### Task 8: Panels — shared copies and links on shapes

**Files:**
- Modify: `src/panels/Properties.tsx` (`InstanceProperties`), `src/panels/PartsList.tsx`, `src/document/tree.ts` (`TreeRow.copies?: number`), `src/styles.css` (count badge styled like `.part-link`)
- Test: `src/panels/Properties.test.tsx`, `src/panels/PartsList.test.tsx`

**Interfaces:**
- `TreeRow` gains `copies?: number` on an assembly row whose definition has 2+ PLACEMENTS (count from `worldParts`-independent walk: number of instance paths naming the definition), and keeps `shape?: string` on part rows (Task 5).
- `InstanceProperties` shows, when the definition has 2+ placements: `<p className="link-note">Shared by {n} copies: edits inside change all of them.</p>`, a **Select copies** button when another copy is at the open level (a boolean selector), and **Make Unique** when `instanceRefs(doc).get(def) >= 2` (a number selector). Buttons call `selectCopies(path)` and `makeUnique(path)`.
- PartsList: an assembly row with `copies` renders `<span className="part-copies" role="img" aria-label={`Shared, ${copies} copies`}>×{copies}</span>` AFTER the name button, as the chain icon does.

- [ ] **Step 1: Failing tests.** `Properties.test.tsx`: load a doc with two instances of `d1`, select `i1`, expect text "Shared by 2 copies", click **Make Unique**, expect the text gone and two definitions. `PartsList.test.tsx`: same doc, expect `getAllByRole('img', { name: 'Shared, 2 copies' })` to have length 2. Write them in the files' existing style (render, `useStore.getState().replaceDocument`, RTL queries).
- [ ] **Step 2:** run — FAIL.
- [ ] **Step 3: Implement** per Interfaces. Selectors return numbers/booleans only (invariant 43).
- [ ] **Step 4:** focused, full, build — green.
- [ ] **Step 5: Mutate.** Show Make Unique by placements instead of refs — add a case (a drawer instance once inside a cabinet placed twice: 2 placements, 1 ref) asserting no Make Unique button; confirm red under the mutation. Restore.
- [ ] **Step 6: Commit** — `feat(panels): shared copies show a count, Select copies and Make Unique`.

---

### Task 9: Live check, record, merge

**Files:** Create `docs/browser-verification-components.md`; modify `CLAUDE.md`, `docs/follow-ups.md`, `docs/history.md`.

- [ ] **Step 1:** Whole-branch review against `master` with the spec in hand; fix what it confirms.
- [ ] **Step 2: Live check on the dev server, the user watching** (`npm run dev -- --port 5180`; never production):
  1. Import a v10 project with a drawer assembly and four linked legs: it opens unchanged; the legs show the chain icon.
  2. Duplicate the drawer twice: the rows show `×3`.
  3. Open one drawer, change a side's length and add a cut: all three change; one Ctrl+Z reverts all three.
  4. Make Unique on the third, edit it: only it changes.
  5. Link/Unlink legs; Select linked; add a cut to one leg; change posture on one leg (each pivots in place).
  6. Cut list: one row per part across copies.
  7. Add joinery… dialog lists sites; (paid run only with the user's approval).
  8. Reload: everything persists. Import a v9 file: unchanged.
  Record results; screenshots only where spatial.
- [ ] **Step 3: Record.**
  - `docs/follow-ups.md`: close 223 and 224 (in place, with the closing commit); add residues from 229.
  - `CLAUDE.md`: Status paragraph, table row (`components | 10-06 | 11 | …`), Versioning (11, the argument), Where things live (`shapes.ts`, `linksToShapes.ts`, changed modules), invariant 45 rewritten, 46 amended, 33 and 40 additions (spec §6), test count.
  - `docs/history.md`: the round's narrative, rulings with costs.
- [ ] **Step 4: Merge** (only after the user says so): `git checkout master && git merge --no-ff components`, re-run `npm test` and `npm run build` on master, `git branch -d components`. Deploying is a separate decision.
