# Holes, chunk 1 (primitive through bench) — Implementation Plan

**Status:** implemented on branch `holes` (Task 11b inserted for rebuild performance), merged 2026-10-14 as `2ded5cc`,
deployed 2026-10-14 as `index-CTpNZw9F.js` (schema 16). The record is `docs/history.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A part can carry rows of round holes (`Board.holes`, schema 16) that the 3D view, edges, snap points and cut
list show truly; the user can add and edit a **Hole** or a **Shelf-pin row** by hand; Add joinery, Refine and Repair joints
stay away from holed documents.

**Architecture:** One new primitive (`HoleRow`: a stored row of flat-bottomed cylinders) beside `cuts` and `angleCuts`.
`holes.ts` is the ONE place holes become geometry (instances, rings, prisms, polygon clipping); `holeFaults.ts` is the ONE
strict-rule decider. **`boardBodies` is unchanged** — bodies stay hole-free and convex. Rendering cuts holes out of the body
faces they cross (a face triangulated with its rings as holes when they sit strictly inside it, else a convex clip split)
and adds a wall and bottom per hole as separate geometry with explicit normals. A part with no holes keeps every existing
code path byte-for-byte.

**Tech Stack:** TypeScript, React, Zustand, react-three-fiber/three.js (`ShapeUtils.triangulateShape`), Vitest, Vite.

**Spec:** `docs/superpowers/specs/2026-10-14-sloyd-holes-design.md` (approved 2026-10-14; five *Amended (planning chunk 1)*
notes added while writing this plan — §3.2 triangulation, §3.3 bottom rim, §3.5 mouth-as-air, §4.1 pitch precision and mm,
§7 menu name / refusal rule / count field). Read it, and `CLAUDE.md`'s invariants 4, 5, 15, 16, 17, 19, 21, 24, 27, 33,
35, 40, 41, 44, 45, 46, 47, 48, before Task 1. The angle-cuts chunk 1 plan
(`docs/superpowers/plans/2026-10-12-sloyd-angle-cuts-chunk1.md`) is the precedent for nearly every site below.

## Global Constraints

- Work on a local branch `holes`; merge with `git merge --no-ff` into `master`, verify the merged tree, delete the branch.
  **No pull requests.**
- `CURRENT_VERSION` becomes **16**. Versioning row: `15→16 · holes (default [], malformed entry dropped) · document-level,
  no step · silent loss on round trip (every hole dropped)`.
- Stored values are exact; display rounds. `32mm` typed stores `32 / 25.4`, unrounded.
- Wording uses the existing vocabulary: `faceName` from `angleText.ts` ("the thickness face (max side)", "the length max
  end"). Lengths through `formatLength`, which writes `1-1/2"` (hyphen).
- `HOLE_FIELDS` (every field of `HoleRow` but `id`, `satisfies`) is the one "same hole row" table (invariant 40's pattern).
- `HOLE_SEGMENTS = 48` everywhere in the viewport (mesh, rims). `HOLE_COUNT_MAX = 500` holes per row (load drops more; the
  Count field refuses more).
- Rules from CLAUDE.md that bind every task: invariants 1, 4 (no no-op undo entries), 5 (DimensionField refuses, never
  clamps), 15, 16, 19, 24, 27, 33, 36, 41, 44, 45, 46, 47.
- `npm test` does not typecheck. **Run `npm run build` before claiming any task compiles, and the FULL `npm test` after
  any task that changes a type or a reader** — `as Board` casts and hand-written fixtures get past the compiler and crash
  at runtime when a reader starts reading `board.holes`.
- **Mutate every test this plan supplies** (break the code it pins, see it fail, restore) before trusting it. Each task
  lists its mutations. Plan-supplied code and justifications have been wrong more than ten times in this repo: fix the
  code, not the expectation; escalate when an expectation itself looks wrong.
- Chunk 1 ships the **Hole** and **Shelf-pin row** presets only. No drawings (Plans sheet, part diagrams) — chunk 2.

## Review Focus

1. **A shelf-pin row on a cabinet side that also has a fixed-shelf dado on the same face** (a ¼"-deep dado and ⅜"-deep
   pins): the pocket grid puts an internal seam at the dado's floor plane inside every hole. An unpunched seam leaves a
   membrane inside each hole. Pinned in Task 6 (no triangle of any body face lies inside a hole's radius between its caps).
2. **Shortening a part until a row's last holes run off it**: the row is kept unchanged, the Properties row shows a note,
   edits that do not ADD a fault are still accepted (one fewer hole, a smaller pitch). The cut-list line carries the
   fault (*the user's ruling, 2026-10-14*): `… — check: hole 20 runs past the length max end (and 1 more)`. Pinned in
   Tasks 3, 7 and 10.
3. **A holed part inside a mirrored assembly**: the copy shows mirror-image holes; editing either side writes the stored
   row back exactly; repeated identical edits do not drift or rewrite the stored array. Pinned in Task 4.
4. **A hand-edited file with a malformed row or an absurd count** (`count: 1e6`, `depth: 0`, `along === face`): the file
   opens, only that row is dropped, nothing freezes expanding a million cylinders. Pinned in Task 1.
5. **Duplicating, linking and listing holed parts**: duplicates carry fresh row ids; Link sees a holed part and a plain one
   as different; two parts with the same holes in a different order are one cut-list row. Pinned in Tasks 2 and 7.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/document/types.ts` (modify) | `HoleRow`, `Board.holes` |
| `src/document/holes.ts` (create) | the model and geometry: `HOLE_FIELDS`, values/equality/copy, `acrossOf`, `mirrorHoleRow`, `Hole`, `holeInstances`, `boardHoles`, `holeRing`, `holePrism`, `clipPolygon`, `minusPrism`, `holeTouches`, `axialOffset`, `ringInside`, `bodyPlanes`, `holeRims`, `holeTouchesBox`, `insideHole`, presets. Runtime imports: `geometry` only. |
| `src/document/holeFaults.ts` (create) | `holeFaults` — the ONE strict-rule decider (imports `cuts`, `angleCuts`, `holes`) |
| `src/document/holeText.ts` (create) | `holeLine` — every hole string (→ `units`) |
| `src/document/holedRefusal.ts` (create) | `holedParts`, `holedRefusal` — joinery/refine refusal text |
| `src/document/document.ts` (modify) | schema 16, `validateHoleRows`, `createBoard` default, barrel exports |
| `src/document/links.ts`, `shapes.ts`, `treeOps.ts`, `treeEdit.ts`, `frames.ts`, `roleLinks.ts`, `generated.ts` (modify) | carry / compare / mirror `holes` |
| `src/document/refineDesign.ts`, `src/generate/refine.ts`, `src/generate/joints/tapers.ts`, `src/generate/joints/repair.ts` (modify) | the refusals |
| `src/document/bodies.ts` (modify) | `geometryKey` and `partGeometry.holes` |
| `src/document/cuts.ts` (modify) | `stockProbe`: the mouth is air |
| `src/document/snapPoints.ts` (modify) | hole centres |
| `src/document/cutlist.ts` (modify) | hole lines and grouping |
| `src/document/turnFixtures.ts` (modify) | `chiralHoled(posture)` test fixture |
| `src/viewport/grainTiling.ts` (modify) | `boardUVSignature`; `faceTriangles`; `bodyMesh(board, body, holes)`; `holeMesh` (pure; unit-tested) |
| `src/viewport/BoardMesh.tsx` (modify) | renders holed bodies, walls, rims |
| `src/store/store.ts` (modify) | `copyBoard`; `addHoleRows` / `updateHoleRow` / `removeHoleRow` |
| `src/panels/CountField.tsx` (create) | DimensionField with a whole-number parse |
| `src/panels/Holes.tsx` (create) | the Holes section |
| `src/panels/Properties.tsx` (modify) | mounts the Holes section |
| `docs/browser-verification-holes.md` (create) | the live pass |

---

### Task 1: The primitive, schema 16, validation, links

**Files:**
- Modify: `src/document/types.ts`, `src/document/document.ts`, `src/document/links.ts`, `src/document/generated.ts`
- Create: `src/document/holes.ts`
- Test: `src/document/document.test.ts`, `src/document/holes.test.ts` (create), `src/document/links.test.ts`

**Interfaces:**
- Produces: `HoleRow` (types.ts); `Board.holes: HoleRow[]` (and `Shape.holes`, via `LINK_FIELDS`);
  `HOLE_FIELDS`, `HOLE_KEYS`, `HOLE_COUNT_MAX`, `holeRowValues(r: Omit<HoleRow,'id'>): (string|number)[]`,
  `sameHoleRow(a, b): boolean`, `copyHoleRow(r: HoleRow): HoleRow`, `acrossOf(r: Pick<HoleRow,'face'|'along'>): Dimension`
  (holes.ts, re-exported from document.ts); `CURRENT_VERSION === 16`.

- [ ] **Step 0: Branch**

```bash
cd /home/alec/docker/sloyd && git checkout -b holes
```

- [ ] **Step 1: Write the failing tests**

`src/document/holes.test.ts` (new):

```ts
import { describe, expect, it } from 'vitest';
import { HOLE_KEYS, acrossOf, copyHoleRow, sameHoleRow } from './holes';
import type { HoleRow } from './types';

export const PIN: HoleRow = {
  id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min',
  station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5,
};

describe('hole rows (holes spec §2)', () => {
  it('sameHoleRow ignores the id and sees every other field', () => {
    expect(sameHoleRow(PIN, { ...PIN, id: 'other' })).toBe(true);
    const changed: Record<string, unknown> = {
      face: 'width', from: 'min', diameter: 0.3, depth: 'through', along: 'width', alongFrom: 'max',
      station: 2.5, count: 20, pitch: 1.25, acrossFrom: 'max', inset: 1,
    };
    for (const k of HOLE_KEYS) expect(sameHoleRow(PIN, { ...PIN, [k]: changed[k] } as HoleRow), k).toBe(false);
  });
  it('copyHoleRow is equal and not the same object', () => {
    const c = copyHoleRow(PIN);
    expect(c).toEqual(PIN);
    expect(c).not.toBe(PIN);
  });
  it('acrossOf names the third dimension', () => {
    expect(acrossOf(PIN)).toBe('width');
    expect(acrossOf({ face: 'length', along: 'thickness' })).toBe('width');
    expect(acrossOf({ face: 'width', along: 'length' })).toBe('thickness');
  });
});
```

Append to `src/document/document.test.ts` (it already imports `migrateDocument`, `createDocument`, `CURRENT_VERSION`,
`Board`):

```ts
describe('schema 16: holes (holes spec §5.1)', () => {
  const v15 = (boards: unknown[], extra: Record<string, unknown> = {}) => ({ ...createDocument('H'), version: 15, boards, ...extra });
  const side = { id: 'b1', name: 'Side', length: 30, width: 11.25, thickness: 0.75, position: [0, 0, 0], rotation: 0, posture: 'flat', grain: 'length', material: 'oak', cuts: [], angleCuts: [] };
  const good = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5 };
  const holesOf = (doc: { boards: unknown[] }) => (doc.boards[0] as Board).holes;

  it('is version 16', () => {
    expect(CURRENT_VERSION).toBe(16);
  });
  it('defaults a v15 part to no holes', () => {
    expect(holesOf(migrateDocument(v15([side])))).toEqual([]);
  });
  it('keeps a well-formed row exactly, a through row included', () => {
    const through = { ...good, id: 'h2', depth: 'through', count: 1, pitch: 0 };
    expect(holesOf(migrateDocument({ ...v15([{ ...side, holes: [good, through] }]), version: 16 }))).toEqual([good, through]);
  });
  it('drops malformed rows and keeps the rest (Review Focus 4)', () => {
    const bad = [
      { ...good, id: 'e1', diameter: 0 },
      { ...good, id: 'e2', depth: 0 },
      { ...good, id: 'e3', depth: 'deep' },
      { ...good, id: 'e4', count: 2.5 },
      { ...good, id: 'e5', count: 0 },
      { ...good, id: 'e6', count: 1e6 },                 // over HOLE_COUNT_MAX: would freeze the view expanding it
      { ...good, id: 'e7', pitch: -1 },
      { ...good, id: 'e8', station: NaN },
      { ...good, id: 'e9', inset: Infinity },
      { ...good, id: 'e10', along: 'thickness' },        // along === face
      { ...good, id: 'e11', acrossFrom: 'top' },
      { ...good, id: 'e12', face: 'depth' },
      'nonsense',
    ];
    const kept = holesOf(migrateDocument({ ...v15([{ ...side, holes: [...bad, good] }]), version: 16 }));
    expect(kept.map((r) => r.id)).toEqual(['h1']);
  });
  it('keeps a faulted but well-formed row (a station past the end)', () => {
    const off = { ...good, station: 40, count: 1 };
    expect(holesOf(migrateDocument({ ...v15([{ ...side, holes: [off] }]), version: 16 }))).toEqual([off]);
  });
  it('repairs a duplicate id per board, the first keeping it (invariant 33)', () => {
    const ids = holesOf(migrateDocument({ ...v15([{ ...side, holes: [good, { ...good, inset: 9.75 }] }]), version: 16 })).map((r) => r.id);
    expect(ids[0]).toBe('h1');
    expect(ids[1]).not.toBe('h1');
  });
  it('gives a Shape its own holes', () => {
    const shaped = { id: 'b2', name: 'Side 2', shape: 's1', position: [12, 0, 0], rotation: 0 };
    const doc = migrateDocument({
      ...v15([shaped]), version: 16,
      shapes: [{ id: 's1', length: 30, width: 11.25, thickness: 0.75, posture: 'flat', grain: 'length', material: 'oak', cuts: [], angleCuts: [], holes: [good] }],
    });
    expect(doc.shapes[0]!.holes).toEqual([good]);
  });
});
```

Append to `src/document/links.test.ts` (import `createBoard` from `./document` and `sameShared`, `sharedOf` from
`./links` if not already imported; import `PIN` from `./holes.test`):

```ts
describe('links see holes (holes spec §5.2)', () => {
  const a = createBoard({ id: 'a', holes: [PIN] });
  it('a holed part and a plain one are not the same shared part', () => {
    expect(sameShared(a, { ...a, id: 'b', holes: [] })).toBe(false);
  });
  it('equal rows with equal ids are the same; a changed field is not', () => {
    expect(sameShared(a, { ...a, id: 'b', holes: [{ ...PIN }] })).toBe(true);
    expect(sameShared(a, { ...a, id: 'b', holes: [{ ...PIN, inset: 2 }] })).toBe(false);
  });
  it('sharedOf copies the rows', () => {
    expect(sharedOf(a).holes).toEqual([PIN]);
    expect(sharedOf(a).holes[0]).not.toBe(PIN);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/document/holes.test.ts src/document/document.test.ts src/document/links.test.ts`
Expected: FAIL — `./holes` does not exist; `CURRENT_VERSION` is 15.

- [ ] **Step 3: Implement**

`src/document/types.ts` — after `AngleCut`:

```ts
/**
 * A row of round holes drilled square to one face (holes spec §2): `count` flat-bottomed cylinders `pitch` apart along
 * `along`, the first `station` from `alongFrom`'s end and all `inset` from `acrossFrom`'s side of the third dimension.
 * A single bore is a row of one. Board-local like `Cut`, so turns and postures cost nothing. No `kind`: the stored
 * geometry fully names what the drill does; presets only choose defaults.
 */
export interface HoleRow {
  /** Unique within its board (per shape for a shape) — invariant 33's scopes. */
  id: string;
  /** The dimension the holes go into (the drill axis) … */
  face: Dimension;
  /** … entering from its min or max face. Depth is measured from that face. */
  from: CutFrom;
  /** Inches, exact (a metric entry stores mm / 25.4 unrounded). */
  diameter: number;
  /** Inches from the `from` face, or right through the `face` dimension. */
  depth: number | 'through';
  /** The row's direction: one of the two dimensions that are not `face`. */
  along: Dimension;
  /** Which end of `along` stations are measured from. */
  alongFrom: CutFrom;
  /** The first hole's centre, from that end. */
  station: number;
  /** Integer, 1 to HOLE_COUNT_MAX. */
  count: number;
  /** Centre to centre, toward the far end. Stored, and ignored, when count is 1. */
  pitch: number;
  /** The third dimension's side the centres are measured from … */
  acrossFrom: CutFrom;
  /** … and how far. */
  inset: number;
}
```

and in `Board`, after `angleCuts`:

```ts
  /** Rows of round holes (holes spec §2). Empty for most parts. */
  holes: HoleRow[];
```

`src/document/holes.ts` (new; Task 3 adds the geometry):

```ts
import type { Dimension, HoleRow } from './types';
import { DIMENSION_ORDER } from './geometry';

/**
 * Every field of `HoleRow` that decides "same hole row": all but `id` (holes spec §4.2). A TABLE CHECKED AGAINST THE
 * TYPE (invariant 40's pattern): a new `HoleRow` field fails `tsc` here until it is listed.
 */
export const HOLE_FIELDS = {
  face: true, from: true, diameter: true, depth: true, along: true, alongFrom: true,
  station: true, count: true, pitch: true, acrossFrom: true, inset: true,
} as const satisfies Record<Exclude<keyof HoleRow, 'id'>, true>;

export const HOLE_KEYS = Object.keys(HOLE_FIELDS) as (keyof typeof HOLE_FIELDS)[];

/** Holes per row, at most. A hand-edited count above it is dropped on load (expanding it would freeze the view). */
export const HOLE_COUNT_MAX = 500;

/** One row's comparable values, in HOLE_KEYS order. */
export function holeRowValues(r: Omit<HoleRow, 'id'>): (string | number)[] {
  return HOLE_KEYS.map((k) => r[k]);
}

/** Exact equality on every HOLE_FIELDS field (stored values, invariant 18). */
export function sameHoleRow(a: Omit<HoleRow, 'id'>, b: Omit<HoleRow, 'id'>): boolean {
  const x = holeRowValues(a);
  const y = holeRowValues(b);
  return x.every((v, i) => v === y[i]);
}

/** A copy that is not the same object, so no two parts ever hold one row. */
export function copyHoleRow(r: HoleRow): HoleRow {
  return { ...r };
}

/** The third dimension: neither the drill axis nor the row's direction. */
export function acrossOf(r: Pick<HoleRow, 'face' | 'along'>): Dimension {
  return DIMENSION_ORDER.find((d) => d !== r.face && d !== r.along)!;
}
```

`src/document/document.ts`:
1. Import `HoleRow` with the other types; import `HOLE_COUNT_MAX` from `./holes`.
2. Add `HoleRow` to the existing `export type { … } from './types'` list, and
   `export { HOLE_COUNT_MAX, HOLE_FIELDS, HOLE_KEYS, acrossOf, copyHoleRow, holeRowValues, sameHoleRow } from './holes';`
   beside the angle-cut barrel line.
3. `createBoard`: `holes: [],` after `angleCuts: [],`.
4. Versioning comment, after the v15 paragraph:

```ts
 * v16 (holes spec §5.1): `Board.holes` (and `Shape.holes`), document-level, no step — an absent field defaults to [].
 * Harm a v15 build would do: silent loss on round trip — it drops every hole row and autosaves.
```

   and `export const CURRENT_VERSION = 16;`
5. After `validateAngleCuts`:

```ts
/**
 * Hole rows (holes spec §2.3), in order. Dropped, never clamped: a non-finite number; diameter ≤ 0; a numeric depth ≤ 0
 * or a depth that is neither a number nor 'through'; a count that is not an integer from 1 to HOLE_COUNT_MAX; a negative
 * station, pitch or inset; along === face; an unknown dimension or side. A FAULTED but well-formed row (holeFaults) is
 * KEPT: no stored value changes on load. Ids are scoped to this board, or this shape (invariant 33).
 */
function validateHoleRows(raw: unknown): HoleRow[] {
  if (!Array.isArray(raw)) return [];
  const out: HoleRow[] = [];
  const seen = new Set<string>();
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const r = item as Record<string, unknown>;
    const face = r.face as Dimension;
    const along = r.along as Dimension;
    if (!VALID_DIMENSIONS.includes(face) || !VALID_DIMENSIONS.includes(along) || face === along) continue;
    if (![r.from, r.alongFrom, r.acrossFrom].every((f) => VALID_FROMS.includes(f as CutFrom))) continue;
    if (!finite(r.diameter) || r.diameter <= 0) continue;
    if (r.depth !== 'through' && !(finite(r.depth) && r.depth > 0)) continue;
    if (!Number.isInteger(r.count) || (r.count as number) < 1 || (r.count as number) > HOLE_COUNT_MAX) continue;
    if (![r.station, r.pitch, r.inset].every((v) => finite(v) && v >= 0)) continue;
    out.push({
      id: takeId(r.id, seen), face, from: r.from as CutFrom, diameter: r.diameter, depth: r.depth as number | 'through',
      along, alongFrom: r.alongFrom as CutFrom, station: r.station as number, count: r.count as number,
      pitch: r.pitch as number, acrossFrom: r.acrossFrom as CutFrom, inset: r.inset as number,
    });
  }
  return out;
}
```

6. `validateSharedFields`' return gains `holes: validateHoleRows(b.holes)`.

`src/document/links.ts`:
- `import { copyHoleRow, sameHoleRow } from './holes';`
- `LINK_FIELDS`: `… cuts: 'shared', angleCuts: 'shared', holes: 'shared',`
- `_sharedPrimitives`: `Exclude<SharedField, 'cuts' | 'angleCuts' | 'holes'>`, and its comment names holes.
- `sharedOf`: `holes: b.holes.map(copyHoleRow),`
- `sharedPatch`: `if (patch.holes) out.holes = patch.holes.map(copyHoleRow);`
- `sameShared`, a branch beside `angleCuts`:

```ts
    } else if (k === 'holes') {
      if (a.holes.length !== b.holes.length) return false;
      for (let i = 0; i < a.holes.length; i += 1) {
        const ra = a.holes[i]!;
        const rb = b.holes[i]!;
        if (ra.id !== rb.id || !sameHoleRow(ra, rb)) return false;
      }
```

`src/document/generated.ts`: both `{ id: '', angleCuts: [], ...fields } as Board` casts become
`{ id: '', angleCuts: [], holes: [], ...fields } as Board`, and the part's return becomes `return { ...fields, angleCuts, holes: [] };`
(Generate emits no holes, spec §6; its `DESIGN_SCHEMA` is untouched).

- [ ] **Step 4: Update the version pins**

Every `expect(...version).toBe(15)` and `expect(CURRENT_VERSION).toBe(15)` in `src/document/document.test.ts` and
`src/document/linksToShapes.test.ts` becomes 16 (17 sites in document.test.ts, 1 in linksToShapes.test.ts — list them
with `grep -n "toBe(15)" src/document/document.test.ts src/document/linksToShapes.test.ts`). **Do not touch**
`src/document/snapPoints.test.ts`' three `toBe(15)` — those count snap points.

- [ ] **Step 5: Typecheck and fix fixtures**

Run: `npm run build`
Every hand-written `Board`/`Shape` literal the compiler now rejects for a missing `holes` gets `holes: []` beside its
`angleCuts`. Then `grep -rn "as Board\b\|as StoredBoard\b\|as Shape\b" src` and read each cast that builds a part from a
literal: one without `holes` gets `holes: []` (the compiler cannot see these).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (count = previous + the new tests).

- [ ] **Step 7: Mutate**
- Remove `face === along` from the validation guard → the `e10` row survives → "drops malformed" fails. Restore.
- Change `> HOLE_COUNT_MAX` to `> 1e9` → `e6` survives → fails. Restore.
- Drop the `holes` branch from `sameShared` (fall through to `!==`) → the "equal rows" case fails (different array objects). Restore.
- Remove `inset: true` from `HOLE_FIELDS` → `tsc` fails (`satisfies`). Restore.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "holes: the HoleRow primitive, schema 16, validation, links

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Copies carry holes

**Files:**
- Modify: `src/document/shapes.ts`, `src/document/treeOps.ts` (two sites), `src/document/treeEdit.ts` (`copyDefinition`),
  `src/store/store.ts` (`copyBoard`), `src/document/roleLinks.ts` (`turnCandidates`)
- Test: `src/document/shapes.test.ts`, `src/document/treeOps.test.ts`, `src/store/store.test.ts`, `src/document/roleLinks.test.ts`

**Interfaces:**
- Consumes: `copyHoleRow` (Task 1).

- [ ] **Step 1: Write the failing tests**

`src/document/shapes.test.ts`:

```ts
describe('resolveBoard copies holes', () => {
  it('gives each user its own rows', () => {
    const row = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
    const shape = { id: 's1', length: 30, width: 11.25, thickness: 0.75, posture: 'flat' as const, grain: 'length' as const, material: 'oak', cuts: [], angleCuts: [], holes: [row] };
    const shapes = new Map([['s1', shape]]);
    const one = resolveBoard(shapes, { id: 'x', name: 'S1', position: [0, 0, 0], rotation: 0, shape: 's1' })!;
    const two = resolveBoard(shapes, { id: 'y', name: 'S2', position: [12, 0, 0], rotation: 0, shape: 's1' })!;
    expect(one.holes).toEqual([row]);
    expect(one.holes).not.toBe(shape.holes);
    expect(one.holes[0]).not.toBe(two.holes[0]);
  });
});
```

`src/document/treeOps.test.ts` (beside the two angle-cut tests, same `base()`):

```ts
  const pinRow = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };

  it('makeUniqueItem copies hole rows with their ids, sharing no row object', () => {
    const doc = base();
    doc.definitions[0]!.boards[0] = createBoard({ id: 'b1', name: 'Side', holes: [pinRow] });
    const out = makeUniqueItem(doc, 'i2')!;
    const i2 = out.instances.find((i) => i.id === 'i2')!;
    const copy = out.definitions.find((d) => d.id === i2.definition)!.boards[0] as Board;
    expect(copy.holes).toEqual([pinRow]);
    expect(copy.holes[0]).not.toBe(pinRow);
  });

  it('ungroupItem lifts a plain part with its hole rows, sharing no row with the surviving definition', () => {
    const doc = base();
    doc.definitions[0]!.boards[0] = createBoard({ id: 'b1', name: 'Side', holes: [pinRow] });
    const r = ungroupItem(doc, 'i1')!;
    const lifted = partAt(r.doc, r.rekey('i1/b1')) as Board;
    expect(lifted.holes).toEqual([pinRow]);
    expect((r.doc.definitions[0]!.boards[0] as Board).holes[0]).not.toBe(lifted.holes[0]);
  });
```

`src/store/store.test.ts` (Review Focus 5):

```ts
describe('duplicating a holed part (holes spec §5.2)', () => {
  it('gives the copy fresh row ids and its own rows', () => {
    const row = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
    useStore.getState().replaceDocument({ ...createDocument('T'), boards: [createBoard({ id: 'side', name: 'Side', holes: [row] })] });
    useStore.getState().duplicateBoards(['side']);
    const [a, b] = useStore.getState().doc.boards as Board[];
    expect(b!.holes).toHaveLength(1);
    expect(b!.holes[0]!.id).not.toBe(a!.holes[0]!.id);
    const { id: _a, ...ra } = a!.holes[0]!;
    const { id: _b, ...rb } = b!.holes[0]!;
    expect(rb).toEqual(ra);
  });
});
```

`src/document/roleLinks.test.ts` (import `turnCandidates` if not imported):

```ts
  it('offers no turned candidates for a holed part (holes spec §5.2)', () => {
    const leg: Board = { ...createBoard({ length: 28, width: 1.75, thickness: 1.75, posture: 'upright' }),
      holes: [{ id: 'h1', face: 'width', from: 'max', diameter: 0.375, depth: 1, along: 'length', alongFrom: 'max', station: 2, count: 1, pitch: 0, acrossFrom: 'min', inset: 0.875 }] };
    expect(turnCandidates({ ...leg, holes: [] }).length).toBeGreaterThan(0);   // the guard is what refuses, not the box
    expect(turnCandidates(leg)).toEqual([]);
  });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/document/shapes.test.ts src/document/treeOps.test.ts src/store/store.test.ts src/document/roleLinks.test.ts`
Expected: FAIL — shared row objects (`not.toBe`), duplicate keeps the source's id, a turned candidate offered.

- [ ] **Step 3: Implement**

- `shapes.ts` `resolveBoard`: `shared[k] = k === 'cuts' ? … : k === 'angleCuts' ? s.angleCuts.map(copyAngleCut) : k === 'holes' ? s.holes.map(copyHoleRow) : s[k];` (import `copyHoleRow` from `./holes`).
- `treeOps.ts`, both plain-part copies: append `, holes: placed.holes.map(copyHoleRow)` / `, holes: b.holes.map(copyHoleRow)`.
- `treeEdit.ts` `copyDefinition`: append `, holes: b.holes.map(copyHoleRow)` to the plain branch.
- `store.ts` `copyBoard`, plain branch, after the `angleCuts` line, and extend the comment above it ("`holes` likewise: fresh ids"):

```ts
      holes: source.holes.map((r) => ({ ...copyHoleRow(r), id: nextId() })),
```

- `roleLinks.ts` `turnCandidates`: `if (b.cuts.length > 0 || b.holes.length > 0) return [];` and the doc comment's last
  sentence becomes "None for a part with rectangular cuts or holes, or a cut either cannot describe."

- [ ] **Step 4: Run the full suite and typecheck**

Run: `npm test && npm run build` — Expected: PASS.

- [ ] **Step 5: Mutate** — remove each of the six lines in turn; the matching test fails; restore.

- [ ] **Step 6: Commit** — `holes: copies carry hole rows` (with the Co-Authored-By trailer).

---

### Task 3: Hole instances, geometry helpers and the strict rule

**Files:**
- Modify: `src/document/holes.ts`, `src/document/document.ts` (barrel)
- Create: `src/document/holeFaults.ts`
- Test: `src/document/holes.test.ts`, `src/document/holeFaults.test.ts` (create)

**Interfaces:**
- Produces (holes.ts):
  - `type V3 = [number, number, number]` (board-local `[length, width, thickness]`, as `angleCuts.ts`' V3 — import that type)
  - `interface Plane { n: V3; d: number }` — kept side is `n·x + d ≥ 0`
  - `interface Hole { row: string; index: number; axis: Dimension; dir: 1 | -1; centre: V3; radius: number; depth: number; through: boolean }`
    — `centre` is on the entry plane; `dir` is +1 when the hole runs toward +axis (entered from min).
  - `holeInstances(board: Pick<Board, Dimension>, row: HoleRow): Hole[]`, `boardHoles(board: Pick<Board, Dimension | 'holes'>): Hole[]`
  - `HOLE_SEGMENTS = 48`, `PRISM_EPS = 1e-7`, `HOLE_EPS = 1e-9`
  - `holeRing(h: Hole, t: number, n = HOLE_SEGMENTS): V3[]` — the ring at axial distance `t` from the entry plane
  - `holePrism(h: Hole, n = HOLE_SEGMENTS): Plane[]` — inside half-spaces: the n sides, then the two caps pushed out by PRISM_EPS
  - `clipPolygon(verts: V3[], h: Plane): V3[]`, `minusPrism(poly: V3[], prism: Plane[]): V3[][]`
  - `holeTouches(h: Hole, poly: V3[]): boolean`, `axialOffset(h: Hole, face: { n: V3; verts: V3[] }): number | null`,
    `ringInside(poly: V3[], n: V3, ring: V3[]): boolean`, `bodyPlanes(faces: { n: V3; verts: V3[] }[]): Plane[]`
  - `holeRims(h: Hole): [V3, V3][]`, `holeTouchesBox(h: Hole, r: Region): boolean`, `insideHole(h: Hole, p: V3): boolean`
- Produces (holeFaults.ts): `type HoleFaultKind = 'breaks-out' | 'off-flat' | 'meets-hole' | 'too-deep'`;
  `interface HoleFault { index: number; kind: HoleFaultKind; edge?: { dim: Dimension; side: CutFrom }; other?: { row: string; index: number } }`;
  `holeFaults(board: Board, row: HoleRow): HoleFault[]` — `board.holes` may or may not contain `row` (matched by id).

- [ ] **Step 1: Write the failing tests**

Append to `src/document/holes.test.ts`:

```ts
import { createBoard } from './document';
import { HOLE_SEGMENTS, PRISM_EPS, boardHoles, clipPolygon, holeInstances, holePrism, holeRing, holeRims, insideHole, minusPrism, ringInside } from './holes';
import type { V3 } from './angleCuts';

const side = createBoard({ id: 's', length: 30, width: 11.25, thickness: 0.75, holes: [PIN] });
const area = (p: V3[], n: V3) => {
  let a: V3 = [0, 0, 0];
  for (let i = 1; i + 1 < p.length; i += 1) {
    const u = p[i]!.map((v, k) => v - p[0]![k]!); const w = p[i + 1]!.map((v, k) => v - p[0]![k]!);
    a = [a[0] + u[1]! * w[2]! - u[2]! * w[1]!, a[1] + u[2]! * w[0]! - u[0]! * w[2]!, a[2] + u[0]! * w[1]! - u[1]! * w[0]!];
  }
  return Math.abs(a[0] * n[0] + a[1] * n[1] + a[2] * n[2]) / 2;
};

describe('hole instances (spec §2.2)', () => {
  it('places a row from its named ends, exactly', () => {
    const hs = holeInstances(side, PIN);
    expect(hs).toHaveLength(21);
    expect(hs[0]).toEqual({ row: 'h1', index: 0, axis: 'thickness', dir: -1, centre: [2, 1.5, 0.75], radius: 0.125, depth: 0.375, through: false });
    expect(hs[20]!.centre[0]).toBe(2 + 20 * (32 / 25.4));
  });
  it('measures from the max end and side, and enters from min', () => {
    const r = { ...PIN, from: 'min' as const, alongFrom: 'max' as const, acrossFrom: 'max' as const, count: 1 };
    expect(holeInstances(side, r)[0]).toMatchObject({ dir: 1, centre: [28, 9.75, 0] });
  });
  it('a through row runs the whole face dimension and follows it', () => {
    const r = { ...PIN, depth: 'through' as const, count: 1 };
    expect(holeInstances(side, r)[0]).toMatchObject({ depth: 0.75, through: true });
    expect(holeInstances({ ...side, thickness: 1 }, r)[0]).toMatchObject({ depth: 1, centre: [2, 1.5, 1] });
  });
  it('count 1 ignores the pitch', () => {
    expect(holeInstances(side, { ...PIN, count: 1, pitch: 99 })).toHaveLength(1);
  });
  it('boardHoles is every row in stored order', () => {
    const b = { ...side, holes: [PIN, { ...PIN, id: 'h2', inset: 9.75 }] };
    expect(boardHoles(b).map((h) => `${h.row}:${h.index}`).slice(20, 22)).toEqual(['h1:20', 'h2:0']);
  });
});

describe('rings, prisms and clipping (spec §3.2)', () => {
  const h = holeInstances(side, { ...PIN, count: 1 })[0]!;
  it('the ring is HOLE_SEGMENTS points on the true circle at depth t', () => {
    const r = holeRing(h, 0.375);
    expect(r).toHaveLength(HOLE_SEGMENTS);
    for (const p of r) {
      expect(Math.hypot(p[0] - 2, p[1] - 1.5)).toBeCloseTo(0.125, 12);
      expect(p[2]).toBe(0.375);
    }
  });
  it('the prism holds the ring, and the caps are pushed out by PRISM_EPS', () => {
    const prism = holePrism(h);
    expect(prism).toHaveLength(HOLE_SEGMENTS + 2);
    for (const p of holeRing(h, 0.2)) for (const q of prism) expect(q.n[0] * p[0] + q.n[1] * p[1] + q.n[2] * p[2] + q.d).toBeGreaterThanOrEqual(-1e-12);
    const top = prism[HOLE_SEGMENTS]!;
    expect(top.n[2] * 0.75 + top.d).toBeCloseTo(PRISM_EPS, 15);
  });
  it('clipPolygon keeps the n·x + d ≥ 0 side', () => {
    const sq: V3[] = [[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]];
    expect(area(clipPolygon(sq, { n: [-1, 0, 0], d: 1 }), [0, 0, 1])).toBeCloseTo(2, 12);
    expect(clipPolygon(sq, { n: [-1, 0, 0], d: -5 })).toEqual([]);
  });
  it('a face minus a hole is its area less the 48-gon, in disjoint pieces', () => {
    const face: V3[] = [[0, 0, 0.75], [30, 0, 0.75], [30, 11.25, 0.75], [0, 11.25, 0.75]];
    const pieces = minusPrism(face, holePrism(h));
    const ngon = (HOLE_SEGMENTS / 2) * 0.125 ** 2 * Math.sin((2 * Math.PI) / HOLE_SEGMENTS);
    expect(pieces.reduce((s, p) => s + area(p, [0, 0, 1]), 0)).toBeCloseTo(30 * 11.25 - ngon, 9);
  });
  it('a face the prism misses comes back whole, the same array', () => {
    const far: V3[] = [[20, 0, 0.75], [30, 0, 0.75], [30, 5, 0.75], [20, 5, 0.75]];
    const pieces = minusPrism(far, holePrism(h));
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toBe(far);
  });
  it('ringInside: strictly inside only', () => {
    const face: V3[] = [[0, 0, 0.75], [30, 0, 0.75], [30, 11.25, 0.75], [0, 11.25, 0.75]];
    expect(ringInside(face, [0, 0, 1], holeRing(h, 0))).toBe(true);
    const tangent = holeInstances(side, { ...PIN, count: 1, inset: 0.125 })[0]!;
    expect(ringInside(face, [0, 0, 1], holeRing(tangent, 0))).toBe(false);
  });
  it('rims: the entry ring and the bottom ring, closed', () => {
    expect(holeRims(h)).toHaveLength(2 * HOLE_SEGMENTS);
  });
  it('the mouth is air: inside within the radius between the caps, the rim is stock', () => {
    expect(insideHole(h, [2, 1.5, 0.75])).toBe(true);         // the face-centre lattice point over a centred hole
    expect(insideHole(h, [2, 1.5, 0.375])).toBe(true);        // the bottom centre (closed)
    expect(insideHole(h, [2, 1.5, 0.3])).toBe(false);         // below the bottom
    expect(insideHole(h, [2.125, 1.5, 0.75])).toBe(false);    // on the rim
  });
});
```

`src/document/holeFaults.test.ts` (new):

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { holeFaults } from './holeFaults';
import type { Board, HoleRow } from './types';

const one = (over: Partial<HoleRow> = {}): HoleRow => ({
  id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min',
  station: 5, count: 1, pitch: 0, acrossFrom: 'min', inset: 2, ...over,
});
const part = (over: Partial<Board> = {}) => createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.75, ...over });
const kinds = (b: Board, r: HoleRow) => holeFaults({ ...b, holes: [...b.holes.filter((x) => x.id !== r.id), r] }, r).map((f) => `${f.index}:${f.kind}`);

describe('holeFaults (spec §2.4)', () => {
  it('a hole on clean stock has no fault', () => {
    expect(kinds(part(), one())).toEqual([]);
  });
  it('tangent to an edge is allowed; 1e-6 past it breaks out, naming the edge', () => {
    expect(kinds(part(), one({ inset: 0.125 }))).toEqual([]);
    const r = one({ inset: 0.125 - 1e-6 });
    expect(holeFaults({ ...part(), holes: [r] }, r)).toEqual([{ index: 0, kind: 'breaks-out', edge: { dim: 'width', side: 'min' } }]);
  });
  it('a row whose last hole runs past the far end faults only that hole', () => {
    const r = one({ station: 2, count: 24, pitch: 32 / 25.4 });      // hole 24's centre at 30.976
    expect(kinds(part(), r)).toEqual(['23:breaks-out']);
    expect(kinds(part(), { ...r, count: 23 })).toEqual([]);
  });
  it('too deep: a blind depth equal to the face dimension', () => {
    expect(kinds(part(), one({ depth: 0.75 }))).toEqual(['0:too-deep']);
    expect(kinds(part(), one({ depth: 'through' }))).toEqual([]);
  });
  it('off flat: a hole whose cylinder meets a dado; one clear of it does not', () => {
    // A 3/4 dado across the width, 1/4 deep from the max face, at length 10 to 10.75.
    const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    expect(kinds(part({ cuts: [dado] }), one({ station: 10.875 - 1e-6 }))).toEqual(['0:off-flat']);
    expect(kinds(part({ cuts: [dado] }), one({ station: 10.875 }))).toEqual([]);           // tangent to the dado wall
    // Review Focus 1's layout: a shelf-pin row on the same face, clear of the dado, is fine.
    expect(kinds(part({ cuts: [dado] }), one({ station: 2, count: 6, pitch: 32 / 25.4 }))).toEqual([]);
  });
  it('a cut that a shrink left removing nothing never faults', () => {
    const gone = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 40, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
    expect(kinds(part({ cuts: [gone] }), one())).toEqual([]);
  });
  it('off flat: a chamfer whose plane passes within the radius', () => {
    // 1/2 x 1/2 chamfer on the thickness-max / width-min edge, along the length.
    const ch = { id: 'a1', kind: 'chamfer' as const, face: 'thickness' as const, from: 'max' as const, along: 'width' as const, alongFrom: 'min' as const, points: [[0, 0.5], [0.5, 0]] as [[number, number], [number, number]] };
    expect(kinds(part({ angleCuts: [ch] }), one({ inset: 0.5 }))).toEqual(['0:off-flat']);
    expect(kinds(part({ angleCuts: [ch] }), one({ inset: 0.625 }))).toEqual([]);           // the chamfer ends at width 0.5
  });
  it('meets another hole: parallel, touching is meeting', () => {
    const a = one();
    expect(kinds(part({ holes: [a] }), one({ id: 'h2', station: 5.25 }))).toEqual(['0:meets-hole']);
    expect(kinds(part({ holes: [a] }), one({ id: 'h2', station: 5.25 + 1e-6 }))).toEqual([]);
    expect(holeFaults({ ...part(), holes: [a, one({ id: 'h2', station: 5.1 })] }, one({ id: 'h2', station: 5.1 }))[0]!.other).toEqual({ row: 'h1', index: 0 });
  });
  it('meets another hole within its own row (pitch below the diameter)', () => {
    expect(kinds(part(), one({ count: 3, pitch: 0.2 }))).toEqual(['0:meets-hole', '1:meets-hole', '2:meets-hole']);
  });
  it('meets another hole: perpendicular, the closed form', () => {
    // A 3/8 dowel hole 1" into the length min end, centred in the thickness, 2" from the width min side;
    // a 1/4 pin from the broad face at length 0.875: its cylinder spans thickness 0.375..0.75, the dowel's 0.1875..0.5625.
    const end = one({ id: 'e', face: 'length', from: 'min', diameter: 0.375, depth: 1, along: 'width', station: 2, acrossFrom: 'min', inset: 0.375 });
    const pin = (station: number) => one({ id: 'p', station, inset: 2 });
    expect(kinds(part({ holes: [end] }), pin(0.875))).toEqual(['0:meets-hole']);
    expect(kinds(part({ holes: [end] }), pin(1.125 + 1e-6))).toEqual([]);     // just past the dowel's bottom
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/document/holes.test.ts src/document/holeFaults.test.ts` — Expected: FAIL (missing exports).

- [ ] **Step 3: Implement the geometry in `holes.ts`**

```ts
import type { Board, CutFrom, Dimension, HoleRow, Region } from './types';
import type { V3 } from './angleCuts';

/** Board-local half-space; the kept side is n·x + d ≥ 0. */
export interface Plane { n: V3; d: number }

/** One flat-bottomed cylinder, board-local `[length, width, thickness]` inches. `centre` lies on the entry plane;
 *  `dir` is +1 when the hole runs toward +axis (entered from the min face). */
export interface Hole {
  row: string; index: number; axis: Dimension; dir: 1 | -1;
  centre: V3; radius: number; depth: number; through: boolean;
}

/** The polygon a hole is rendered as, vertices on the true circle (spec §3.2). */
export const HOLE_SEGMENTS = 48;
/** Inches: comparisons, as BODY_EPS (holes.ts cannot import bodies.ts — bodies → cuts → holes). */
export const HOLE_EPS = 1e-9;
/** Inches the prism's caps are pushed out, so a face ON the entry plane (or a seam inside the depth) is strictly inside
 *  and is punched. Well above HOLE_EPS (clipPolygon's on-plane band), far below anything visible. */
export const PRISM_EPS = 1e-7;

const idx = (d: Dimension) => DIMENSION_ORDER.indexOf(d);
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The axis index and the two in-plane indices, in DIMENSION_ORDER. */
function frameOf(h: Pick<Hole, 'axis'>): { a: number; u: number; v: number } {
  const a = idx(h.axis);
  const [u, v] = [0, 1, 2].filter((i) => i !== a) as [number, number];
  return { a, u, v };
}

export function holeInstances(board: Pick<Board, Dimension>, row: HoleRow): Hole[] {
  const across = acrossOf(row);
  const through = row.depth === 'through';
  const depth = row.depth === 'through' ? board[row.face] : row.depth;
  const out: Hole[] = [];
  for (let k = 0; k < row.count; k += 1) {
    const s = row.station + k * row.pitch;
    const c: V3 = [0, 0, 0];
    c[idx(row.face)] = row.from === 'min' ? 0 : board[row.face];
    c[idx(row.along)] = row.alongFrom === 'min' ? s : board[row.along] - s;
    c[idx(across)] = row.acrossFrom === 'min' ? row.inset : board[across] - row.inset;
    out.push({ row: row.id, index: k, axis: row.face, dir: row.from === 'min' ? 1 : -1, centre: c, radius: row.diameter / 2, depth, through });
  }
  return out;
}

/** Every row's holes, rows in stored order. */
export function boardHoles(board: Pick<Board, Dimension | 'holes'>): Hole[] {
  return board.holes.flatMap((r) => holeInstances(board, r));
}

/** The ring at axial distance `t` from the entry plane: `n` points on the true circle, θ_k = 2πk/n from +u toward +v. */
export function holeRing(h: Hole, t: number, n = HOLE_SEGMENTS): V3[] {
  const { a, u, v } = frameOf(h);
  return Array.from({ length: n }, (_, k) => {
    const th = (2 * Math.PI * k) / n;
    const p: V3 = [h.centre[0], h.centre[1], h.centre[2]];
    p[a] += h.dir * t;
    p[u] += h.radius * Math.cos(th);
    p[v] += h.radius * Math.sin(th);
    return p;
  });
}

/**
 * The rendered cylinder as half-spaces whose kept sides are its inside: one per side facet (facet k between ring vertices
 * k and k+1, at distance r·cos(π/n) from the axis), then the entry cap, then the bottom cap — each cap pushed OUT by
 * PRISM_EPS (see there).
 */
export function holePrism(h: Hole, n = HOLE_SEGMENTS): Plane[] {
  const { a, u, v } = frameOf(h);
  const out: Plane[] = [];
  const inner = h.radius * Math.cos(Math.PI / n);
  for (let k = 0; k < n; k += 1) {
    const phi = (2 * Math.PI * (k + 0.5)) / n;
    const radial: V3 = [0, 0, 0];
    radial[u] = Math.cos(phi);
    radial[v] = Math.sin(phi);
    out.push({ n: [-radial[0], -radial[1], -radial[2]], d: inner + dot(radial, h.centre) });
  }
  const ax: V3 = [0, 0, 0];
  ax[a] = h.dir;
  out.push({ n: ax, d: -h.dir * h.centre[a] + PRISM_EPS });                                         // t ≥ -ε
  out.push({ n: [-ax[0], -ax[1], -ax[2]], d: h.dir * h.centre[a] + h.depth + PRISM_EPS });          // t ≤ depth + ε
  return out;
}

/** Keep the part of a convex planar polygon where n·x + d ≥ 0 (Sutherland–Hodgman). A vertex within HOLE_EPS of the
 *  plane is ON it and kept. Fewer than three points: []. Returns the SAME array when nothing is cut away. */
export function clipPolygon(verts: V3[], h: Plane): V3[] {
  const g = (p: V3) => dot(h.n, p) + h.d;
  if (verts.every((p) => g(p) >= -HOLE_EPS)) return verts;
  const out: V3[] = [];
  for (let i = 0; i < verts.length; i += 1) {
    const a = verts[i]!;
    const b = verts[(i + 1) % verts.length]!;
    const ga = g(a);
    const gb = g(b);
    if (ga >= -HOLE_EPS) out.push(a);
    if ((ga > HOLE_EPS && gb < -HOLE_EPS) || (ga < -HOLE_EPS && gb > HOLE_EPS)) {
      const t = ga / (ga - gb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])]);
    }
  }
  return out.length >= 3 ? out : [];
}

const flipPlane = (h: Plane): Plane => ({ n: [-h.n[0], -h.n[1], -h.n[2]], d: -h.d });

/** Twice-area > this: a piece thinner than a sliver is no piece (bodies.ts' SLIVER, squared). */
const MIN_AREA = 1e-12;
function twiceArea(p: V3[]): number {
  let x = 0; let y = 0; let z = 0;
  for (let i = 1; i + 1 < p.length; i += 1) {
    const e: V3 = [p[i]![0] - p[0]![0], p[i]![1] - p[0]![1], p[i]![2] - p[0]![2]];
    const f: V3 = [p[i + 1]![0] - p[0]![0], p[i + 1]![1] - p[0]![1], p[i + 1]![2] - p[0]![2]];
    x += e[1] * f[2] - e[2] * f[1]; y += e[2] * f[0] - e[0] * f[2]; z += e[0] * f[1] - e[1] * f[0];
  }
  return Math.hypot(x, y, z);
}

/** True when the polygon is not wholly on or outside some plane of the prism: the hole reaches into it. */
export function holeTouches(h: Hole, poly: V3[]): boolean {
  return touchesPrism(holePrism(h), poly);
}
function touchesPrism(prism: Plane[], poly: V3[]): boolean {
  return !prism.some((q) => poly.every((p) => dot(q.n, p) + q.d <= HOLE_EPS));
}

/**
 * A convex planar polygon minus a convex prism, as DISJOINT convex pieces: piece i is the polygon outside plane i and
 * inside planes 0…i-1. A polygon the prism misses comes back whole (the same array). The fallback split (spec §3.2,
 * amended): it leaves T-junctions where a piece's edge passes ring vertices, so a face whose rings sit strictly inside
 * it is triangulated with them as holes instead (grainTiling's faceTriangles).
 */
export function minusPrism(poly: V3[], prism: Plane[]): V3[][] {
  if (!touchesPrism(prism, poly)) return [poly];
  const out: V3[][] = [];
  let rest = poly;
  for (const q of prism) {
    const outside = clipPolygon(rest, flipPlane(q));
    if (outside.length && twiceArea(outside) > MIN_AREA) out.push(outside);
    rest = clipPolygon(rest, q);
    if (!rest.length) break;
  }
  return out;
}

/** The face's axial distance from the hole's entry plane when the face is perpendicular to the axis, else null. */
export function axialOffset(h: Hole, face: { n: V3; verts: V3[] }): number | null {
  const { a } = frameOf(h);
  if (Math.abs(Math.abs(face.n[a]) - 1) > HOLE_EPS) return null;
  return h.dir * (face.verts[0]![a] - h.centre[a]);
}

/** Every ring vertex strictly inside the convex polygon (by more than HOLE_EPS from each edge). */
export function ringInside(poly: V3[], n: V3, ring: V3[]): boolean {
  const c: V3 = [0, 1, 2].map((k) => poly.reduce((s, p) => s + p[k]!, 0) / poly.length) as V3;
  return poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const e: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let m: V3 = [n[1] * e[2] - n[2] * e[1], n[2] * e[0] - n[0] * e[2], n[0] * e[1] - n[1] * e[0]];
    const l = Math.hypot(...m);
    m = [m[0] / l, m[1] / l, m[2] / l];
    if (dot(m, [c[0] - a[0], c[1] - a[1], c[2] - a[2]]) < 0) m = [-m[0], -m[1], -m[2]];
    return ring.every((p) => dot(m, [p[0] - a[0], p[1] - a[1], p[2] - a[2]]) > HOLE_EPS);
  });
}

/** A convex body's faces as inside half-spaces (closed): the wall and bottom are clipped to the stock with these. */
export function bodyPlanes(faces: readonly { n: V3; verts: V3[] }[]): Plane[] {
  return faces.map((f) => ({ n: [-f.n[0], -f.n[1], -f.n[2]], d: dot(f.n, f.verts[0]!) }));
}

/** Rim segments (spec §3.3, amended): the entry ring, and the ring at the far end — the exit rim of a through hole, the
 *  bottom crease of a blind one. Closed loops. */
export function holeRims(h: Hole): [V3, V3][] {
  return [holeRing(h, 0), holeRing(h, h.depth)].flatMap((r) => r.map((p, i) => [p, r[(i + 1) % r.length]!] as [V3, V3]));
}

/** The hole's bounding box overlaps the region (closed). Conservative: it decides only whether a body leaves the box path. */
export function holeTouchesBox(h: Hole, r: Region): boolean {
  const { a } = frameOf(h);
  return DIMENSION_ORDER.every((d, i) => {
    const [lo, hi] = i === a
      ? [Math.min(h.centre[a], h.centre[a] + h.dir * h.depth), Math.max(h.centre[a], h.centre[a] + h.dir * h.depth)]
      : [h.centre[i]! - h.radius, h.centre[i]! + h.radius];
    return lo <= r[d][1] + HOLE_EPS && hi >= r[d][0] - HOLE_EPS;
  });
}

/** The mouth is air (spec §3.5, amended): within the radius (open: the rim is stock) and between the caps (closed). */
export function insideHole(h: Hole, p: V3): boolean {
  const { a, u, v } = frameOf(h);
  const t = h.dir * (p[a] - h.centre[a]);
  return t >= -HOLE_EPS && t <= h.depth + HOLE_EPS && Math.hypot(p[u] - h.centre[u], p[v] - h.centre[v]) < h.radius - HOLE_EPS;
}
```

(Keep the Task 1 exports; `DIMENSION_ORDER` is already imported. `Region` comes from `./types`.)

- [ ] **Step 4: Implement `holeFaults.ts`**

```ts
import type { Board, CutFrom, Dimension, HoleRow } from './types';
import { DIMENSION_ORDER } from './geometry';
import { clippedRegion } from './cuts';
import { keptHalfSpace } from './angleCuts';
import { HOLE_EPS, holeInstances, type Hole } from './holes';

export type HoleFaultKind = 'breaks-out' | 'off-flat' | 'meets-hole' | 'too-deep';
export interface HoleFault {
  index: number;
  kind: HoleFaultKind;
  /** breaks-out: the face edge it runs past. */
  edge?: { dim: Dimension; side: CutFrom };
  /** meets-hole: the hole it meets. */
  other?: { row: string; index: number };
}

const idx = (d: Dimension) => DIMENSION_ORDER.indexOf(d);
const inPlane = (h: Hole) => [0, 1, 2].filter((i) => i !== idx(h.axis)) as [number, number];
const span = (h: Hole): [number, number] => {
  const a = h.centre[idx(h.axis)];
  const b = a + h.dir * h.depth;
  return [Math.min(a, b), Math.max(a, b)];
};

/** Two cylinders meet (touching is meeting, spec §2.4). Parallel: discs within r1 + r2 and the axial spans overlapping.
 *  Perpendicular (A along a, B along b, c the third): x_a and x_b are independent, so each is taken nearest the other
 *  hole's centre within the spans; the two half-chords on c then must reach. */
function meets(A: Hole, B: Hole): boolean {
  const ia = span(A);
  const ib = span(B);
  if (A.axis === B.axis) {
    const [u, v] = inPlane(A);
    return Math.min(ia[1], ib[1]) - Math.max(ia[0], ib[0]) >= -HOLE_EPS
      && Math.hypot(A.centre[u] - B.centre[u], A.centre[v] - B.centre[v]) <= A.radius + B.radius + HOLE_EPS;
  }
  const a = idx(A.axis);
  const b = idx(B.axis);
  const c = 3 - a - b;
  const ja = [Math.max(ia[0], B.centre[a] - B.radius), Math.min(ia[1], B.centre[a] + B.radius)] as const;
  const jb = [Math.max(ib[0], A.centre[b] - A.radius), Math.min(ib[1], A.centre[b] + A.radius)] as const;
  if (ja[0] > ja[1] + HOLE_EPS || jb[0] > jb[1] + HOLE_EPS) return false;
  const da = Math.max(0, ja[0] - B.centre[a], B.centre[a] - ja[1]);
  const db = Math.max(0, jb[0] - A.centre[b], A.centre[b] - jb[1]);
  const hA = Math.sqrt(Math.max(0, A.radius ** 2 - db ** 2));
  const hB = Math.sqrt(Math.max(0, B.radius ** 2 - da ** 2));
  return Math.abs(A.centre[c] - B.centre[c]) <= hA + hB + HOLE_EPS;
}

/**
 * THE strict-rule decider (holes spec §2.4): every fault of every hole of `row` on `board`, hole by hole, each hole's
 * faults in the order breaks-out, off-flat, meets-hole, too-deep. `board.holes` may hold `row` (matched by id) or not;
 * the other rows are `board.holes` without it. Exact against the cylinder (closed forms within HOLE_EPS), never sampled:
 * tangent to an edge or a cut passes, touching another hole meets it.
 */
export function holeFaults(board: Board, row: HoleRow): HoleFault[] {
  const mine = holeInstances(board, row);
  const others = board.holes.filter((r) => r.id !== row.id).flatMap((r) => holeInstances(board, r));
  const regions = board.cuts.map((c) => clippedRegion(board, c))
    .filter((r) => DIMENSION_ORDER.every((d) => r[d][1] - r[d][0] > HOLE_EPS));
  const planes = board.angleCuts.flatMap((c) => { const h = keptHalfSpace(board, c); return h ? [h] : []; });
  const out: HoleFault[] = [];
  for (const h of mine) {
    const [u, v] = inPlane(h);
    const ax = idx(h.axis);
    const s = span(h);
    // breaks-out: the circle leaves the face rectangle (tangent allowed).
    for (const i of [u, v]) {
      const d = DIMENSION_ORDER[i]!;
      if (h.centre[i]! - h.radius < -HOLE_EPS) { out.push({ index: h.index, kind: 'breaks-out', edge: { dim: d, side: 'min' } }); break; }
      if (h.centre[i]! + h.radius > board[d] + HOLE_EPS) { out.push({ index: h.index, kind: 'breaks-out', edge: { dim: d, side: 'max' } }); break; }
    }
    // off-flat: a rectangular cut's region overlaps the cylinder (positive axial overlap, the disc reaching inside it),
    // or a point of the cylinder lies on an angle cut's removed side (the linear minimum over each end disc).
    const inCut = regions.some((r) => {
      const R = [r.length, r.width, r.thickness];
      if (Math.min(s[1], R[ax]![1]) - Math.max(s[0], R[ax]![0]) <= HOLE_EPS) return false;
      const dx = Math.max(R[u]![0] - h.centre[u]!, 0, h.centre[u]! - R[u]![1]);
      const dy = Math.max(R[v]![0] - h.centre[v]!, 0, h.centre[v]! - R[v]![1]);
      return Math.hypot(dx, dy) < h.radius - HOLE_EPS;
    });
    const onSlope = planes.some((p) => {
      const perp = Math.hypot(p.n[u]!, p.n[v]!);
      return s.some((x) => {
        const c = [...h.centre];
        c[ax] = x;
        return p.n[0] * c[0]! + p.n[1] * c[1]! + p.n[2] * c[2]! + p.d - h.radius * perp < -HOLE_EPS;
      });
    });
    if (inCut || onSlope) out.push({ index: h.index, kind: 'off-flat' });
    const hit = [...mine.filter((o) => o.index !== h.index), ...others].find((o) => meets(h, o));
    if (hit) out.push({ index: h.index, kind: 'meets-hole', other: { row: hit.row, index: hit.index } });
    if (row.depth !== 'through' && row.depth > board[row.face] - HOLE_EPS) out.push({ index: h.index, kind: 'too-deep' });
  }
  return out;
}
```

`document.ts` barrel: export the new `holes.ts` names (`HOLE_SEGMENTS`, `PRISM_EPS`, `HOLE_EPS`, `boardHoles`,
`holeInstances`, `holeRing`, `holePrism`, `clipPolygon`, `minusPrism`, `holeTouches`, `axialOffset`, `ringInside`,
`bodyPlanes`, `holeRims`, `holeTouchesBox`, `insideHole`; types `Hole`, `Plane`) and `holeFaults` with its types.

- [ ] **Step 5: Run, then the full suite and build** — `npx vitest run src/document/holes.test.ts src/document/holeFaults.test.ts && npm test && npm run build` — Expected: PASS.

If an expected value in a plan-supplied test looks wrong, derive it by hand before changing anything; report it.

- [ ] **Step 6: Mutate**
- `HOLE_EPS` tolerance in breaks-out → `0` on the max side only: the tangent case still passes but write a scratch tangent-at-max case to see it flip; then restore. (Confirms the tolerance is load-bearing.)
- Swap `hA + hB` for `A.radius + B.radius` in `meets` → the perpendicular "just past" case faults. Restore.
- Drop the empty-region filter → "a cut that a shrink left removing nothing" faults? (Only if `clippedRegion` of an off-part cut is inverted; if the test still passes, write the region down and confirm the filter is what excludes it, or note it as redundant.) Restore.
- Remove `PRISM_EPS` from the entry cap → "the prism holds the ring … pushed out" fails. Restore.
- `minusPrism` without the early return → "comes back whole, the same array" fails. Restore.

- [ ] **Step 7: Commit** — `holes: instances, geometry helpers, and the strict rule (holeFaults)`.

---

### Task 4: Mirroring and write-back

**Files:**
- Modify: `src/document/holes.ts` (`mirrorHoleRow`), `src/document/frames.ts` (`mirrorPart`), `src/document/treeEdit.ts`
  (`lowerHoles`, `lower`, `changedKeys`, `valueOf`, `sharedSignature`, `groupSignature`), `src/document/turnFixtures.ts`
- Test: `src/document/frames.mirror.test.ts`, `src/document/treeEdit.mirror.test.ts`, `src/document/holes.test.ts`, `src/document/treeEdit.test.ts`

**Interfaces:**
- Produces: `mirrorHoleRow(r: HoleRow, d: Dimension): HoleRow` (holes.ts, barrel-exported); `chiralHoled(posture: Posture): Board` (turnFixtures.ts).

- [ ] **Step 1: The fixture**

`turnFixtures.ts`:

```ts
/**
 * chiralPart plus hole rows with a HAND (holes spec §8): a row off-centre on one face measured from the min end, and a
 * single bore into one end, off-centre across. A reflection anywhere in the hole mapping shows up as different world
 * centres.
 */
export function chiralHoled(posture: Posture): Board {
  return {
    ...chiralPart(posture),
    holes: [
      { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 7, count: 3, pitch: 1.5, acrossFrom: 'min', inset: 4.5 },
      { id: 'h2', face: 'length', from: 'max', diameter: 0.375, depth: 1, along: 'width', alongFrom: 'min', station: 4.25, count: 1, pitch: 0, acrossFrom: 'max', inset: 0.5 },
    ],
  };
}
```

- [ ] **Step 2: Write the failing tests**

`holes.test.ts`:

```ts
import { mirrorHoleRow } from './holes';
describe('mirrorHoleRow (inv 44: a flag flip, no arithmetic)', () => {
  it('flips exactly the flag on the mirrored dimension', () => {
    expect(mirrorHoleRow(PIN, 'thickness')).toEqual({ ...PIN, from: 'min' });
    expect(mirrorHoleRow(PIN, 'length')).toEqual({ ...PIN, alongFrom: 'max' });
    expect(mirrorHoleRow(PIN, 'width')).toEqual({ ...PIN, acrossFrom: 'max' });
    expect(mirrorHoleRow(mirrorHoleRow(PIN, 'width'), 'width')).toEqual(PIN);
  });
});
```

`frames.mirror.test.ts` (imports `chiralHoled`, `boardHoles`, `toWorld`):

```ts
const worldCentres = (b: Board) => boardHoles(b).map((h) => toWorld(b, { length: h.centre[0], width: h.centre[1], thickness: h.centre[2] }));

describe('a mirrored frame reflects holes (inv 44, holes spec §5.2)', () => {
  for (const posture of POSTURES) {
    for (const rotation of TURNS) {
      it(`${posture} at ${rotation} deg: mirrorPart's hole centres are the reflection across x = 0`, () => {
        const b = { ...chiralHoled(posture), rotation, position: [2, 1, -3] as [number, number, number] };
        const reflected = worldCentres(b).map(([x, y, z]) => [0 - x!, y!, z!]);
        expect(sameSet(worldCentres(mirrorPart(b)), reflected)).toBe(true);
        const placed = placeBoard({ position: [0, 0, 0], rotation: 0, mirrored: true }, b);
        expect(placed.holes).toEqual(mirrorPart(b).holes);
      });
    }
  }
  it('the fixture is chiral: unmirrored rows would differ', () => {
    const b = chiralHoled('flat');
    const reflected = worldCentres(b).map(([x, y, z]) => [0 - x!, y!, z!]);
    expect(sameSet(worldCentres({ ...mirrorPart(b), holes: b.holes }), reflected)).toBe(false);
  });
});
```

`treeEdit.mirror.test.ts` (same `doc`, `occ`, `stored` helpers as the angle-cut tests; import `chiralHoled`, `sameHoleRow`):

```ts
describe('holes through a mirror (Review Focus 3)', () => {
  it('an edit elsewhere keeps the stored rows (the same array)', () => {
    const d0 = doc(chiralHoled('flat'), { mirrored: true });
    const before = occ(d0);
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, name: 'Renamed' } }]);
    expect(stored(d1).holes).toBe(stored(d0).holes);
  });
  it('a resize keeps the stored rows (the same array)', () => {
    const d0 = doc(chiralHoled('flat'), { mirrored: true });
    const before = occ(d0);
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, length: before.length + 1 } }]);
    expect(stored(d1).holes).toBe(stored(d0).holes);
  });
  it('an edit to a world row writes back its mirror; placing again shows the edit; repeats do not drift', () => {
    const d0 = doc(chiralHoled('upright'), { mirrored: true, rotation: 90 });
    const before = occ(d0);
    const edited = before.holes.map((r) => (r.id === 'h1' ? { ...r, station: 6 } : r));
    const d1 = applyWorldEdits(d0, [{ before, after: { ...before, holes: edited } }]);
    expect(sameHoleRow(occ(d1).holes.find((r) => r.id === 'h1')!, edited.find((r) => r.id === 'h1')!)).toBe(true);
    expect(stored(d1).holes.find((r) => r.id === 'h1')).not.toEqual(edited.find((r) => r.id === 'h1'));   // stored is the mirror
    const d2 = applyWorldEdits(d1, [{ before: occ(d1), after: { ...occ(d1), holes: occ(d1).holes.map((r) => ({ ...r })) } }]);
    stored(d1).holes.forEach((r, i) => expect(stored(d2).holes[i]).toBe(r));
  });
  it('a posture change moving d0 keeps the world rows as seen (stored ones re-reflected); one keeping d0 leaves them', () => {
    // The ONLY path to changedKeys' second clause (cur.holes !== after.holes && cur.holes !== resolved.holes): the
    // rows are not edited, but the lowering re-reflects them along the NEW d0.
    for (const A of [{ mirrored: true }, { mirrored: true, rotation: 90 as const }]) {
      for (const [from, to] of [['flat', 'upright'], ['upright', 'on-edge']] as const) {
        const d = doc(chiralHoled(from), A);
        const before = occ(d);
        const out = applyWorldEdits(d, [{ before, after: { ...before, posture: to } }]);
        expect(stored(out).holes, `${from}->${to}`).not.toBe(stored(d).holes);
        const now = occ(out);
        expect(now.holes.length).toBe(before.holes.length);
        now.holes.forEach((r, i) => expect(sameHoleRow(r, before.holes[i]!), `${from}->${to} ${i}`).toBe(true));
      }
      const d = doc(chiralHoled('flat'), A);
      const before = occ(d);
      const out = applyWorldEdits(d, [{ before, after: { ...before, posture: 'on-edge' } }]);
      expect(stored(out).holes).toBe(stored(d).holes);
    }
  });
});
```

`treeEdit.test.ts` — inside the describe that holds `'a leg whose mortise differs gets its own shape'` (it has the
`flat` and `shapeOfAt` helpers):

```ts
  it('users whose hole rows differ only in order and ids stay one Shape; a differing row splits (groupSignature)', () => {
    const shape = { id: 's1', length: 28, width: 1.75, thickness: 1.75, material: 'oak', grain: 'length' as const, posture: 'upright' as const, cuts: [], angleCuts: [], holes: [] };
    const doc: SloydDocument = { ...createDocument(), shapes: [shape],
      boards: [0, 1, 2].map((k) => ({ id: `l${k}`, name: `Leg ${k}`, position: [k * 10, 0, 0] as [number, number, number], rotation: 0 as const, shape: 's1' })) };
    const r1 = { id: 'x', face: 'width' as const, from: 'max' as const, diameter: 0.375, depth: 1, along: 'length' as const, alongFrom: 'max' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 0.875 };
    const r2 = { ...r1, station: 5 };
    const before = flat(doc);
    const rows = [[{ ...r1, id: 'a' }, { ...r2, id: 'b' }], [{ ...r2, id: 'c' }, { ...r1, id: 'd' }], [{ ...r1, id: 'e', station: 3 }]];
    const out = writeBackFlat(doc, before, before.map((b, k) => ({ ...b, holes: rows[k]! })));
    expect(out.shapes).toHaveLength(2);
    expect(shapeOfAt(out, 'l0')).toBe(shapeOfAt(out, 'l1'));
    expect(shapeOfAt(out, 'l2')).not.toBe(shapeOfAt(out, 'l0'));
  });
```


- [ ] **Step 3: Run them to see them fail** — `npx vitest run src/document/holes.test.ts src/document/frames.mirror.test.ts src/document/treeEdit.mirror.test.ts src/document/treeEdit.test.ts`

- [ ] **Step 4: Implement**

`holes.ts`:

```ts
const flip = (f: CutFrom): CutFrom => (f === 'min' ? 'max' : 'min');

/** A row reflected along dimension `d` (inv 44): a FLAG FLIP, never arithmetic on positions — the flag on whichever of
 *  face / along / across is `d`. Its own inverse. */
export function mirrorHoleRow(r: HoleRow, d: Dimension): HoleRow {
  if (r.face === d) return { ...r, from: flip(r.from) };
  if (r.along === d) return { ...r, alongFrom: flip(r.alongFrom) };
  return { ...r, acrossFrom: flip(r.acrossFrom) };
}
```

`frames.ts` `mirrorPart`: `holes: b.holes.map((r) => mirrorHoleRow(r, d)),` and its doc comment says "the cuts, angle
cuts and hole rows are mirrored along d0".

`treeEdit.ts`:

```ts
/**
 * The hole rows of a part lowered back through ONE mirror (holes spec §5.2): like lowerAngleCuts, a flag flip, exact and
 * size-free; a row equal to the stored one with the same id maps back to THAT object; all reused: the stored array.
 */
function lowerHoles(storedBefore: Board, draft: Board): HoleRow[] {
  const d0 = mirrorDim(draft);
  const byId = new Map(storedBefore.holes.map((r) => [r.id, r]));
  const out = draft.holes.map((r) => {
    const back = mirrorHoleRow(r, d0);
    const s = byId.get(r.id);
    return s && sameHoleRow(s, back) ? s : back;
  });
  return out.length === storedBefore.holes.length && out.every((r, i) => r === storedBefore.holes[i]) ? storedBefore.holes : out;
}
```

- `lower()`'s mirrored branch: `holes: lowerHoles(lowerBefore, draft),`
- `changedKeys` — beside the `angleCuts` clause, the same rule:

```ts
    if (k === 'holes') {
      // As angleCuts: written when edited, or when a mirror lowering produced a fresh array that is not the stored one.
      return rec(before)[k] !== rec(after)[k] || (cur.holes !== after.holes && cur.holes !== resolved.holes);
    }
```

- `valueOf`: `… : k === 'angleCuts' ? cur.angleCuts : k === 'holes' ? cur.holes : rec(after)[k]` — **without this the
  WORLD rows are written back through a mirror**.
- `sharedSignature`: `… : k === 'holes' ? b.holes.map(holeRowValues) : b[k]` (no ids).
- `groupSignature`: `… : k === 'holes' ? sorted(b.holes.map(holeRowValues)) : b[k]`.
- The doc comment on `applyWorldEdits` names `holes` beside `angleCuts`.
- Imports: `HoleRow` type; `holeRowValues`, `mirrorHoleRow`, `sameHoleRow` from `./holes`.

- [ ] **Step 5: Run the full suite and build** — PASS.

- [ ] **Step 6: Mutate** — each of: `mirrorPart`'s holes line; `lower`'s holes line; the `valueOf` clause; the
  `changedKeys` clause (make it `rec(before)[k] !== rec(after)[k]` only); `lowerHoles`' `s && sameHoleRow ? s` reuse;
  `groupSignature`'s `sorted`. Each fails a test; restore.

- [ ] **Step 7: Commit** — `holes: mirroring and write-back (flag flips, lowerHoles)`.

---

### Task 5: Part geometry, the stock probe and snap points

**Files:**
- Modify: `src/document/bodies.ts` (`geometryKey`, `PartGeometry`, `partGeometry`), `src/document/cuts.ts` (`stockProbe`),
  `src/document/snapPoints.ts` (`boardSnapPoints`)
- Test: `src/document/bodies.test.ts`, `src/document/snapPoints.test.ts`

**Interfaces:**
- Produces: `PartGeometry.holes: readonly Hole[]` (frozen; every row's instances).

- [ ] **Step 1: Write the failing tests**

`bodies.test.ts`:

```ts
describe('partGeometry and holes (holes spec §3.1)', () => {
  const row = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
  it('a row changes the key; its id is in it', () => {
    const b = createBoard({ length: 30, width: 11.25, thickness: 0.75 });
    expect(geometryKey({ ...b, holes: [row] })).not.toBe(geometryKey(b));
    expect(geometryKey({ ...b, holes: [{ ...row, id: 'h2' }] })).not.toBe(geometryKey({ ...b, holes: [row] }));
    expect(geometryKey({ ...b, holes: [{ ...row, pitch: 1.3 }] })).not.toBe(geometryKey({ ...b, holes: [row] }));
  });
  it('carries the instances; bodies are unchanged (hole-free, inv 50)', () => {
    const b = createBoard({ length: 30, width: 11.25, thickness: 0.75 });
    const g = partGeometry({ ...b, holes: [row] });
    expect(g.holes).toHaveLength(3);
    expect(g.bodies).toEqual(boardBodies(b));
  });
});
```

`snapPoints.test.ts`:

```ts
describe('hole centres (holes spec §3.5)', () => {
  const centred = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 12, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 2.75 };
  const b = createBoard({ id: 'p', length: 24, width: 5.5, thickness: 0.75, holes: [centred] });
  it('adds the centre on the entry face, once, and withholds nothing else on a plain part', () => {
    const pts = boardSnapPoints(b);
    const at = pts.filter((p) => p.at.every((v, i) => Math.abs(v - [12, 0.75, 2.75][i]!) < 1e-9));
    expect(at).toHaveLength(1);
    expect(at[0]!.owner).toEqual({ type: 'board', id: 'p' });
    expect(pts).toHaveLength(26);   // the face-centre lattice point is in the mouth: withheld, replaced by the centre
  });
  it('a through hole adds its exit centre too', () => {
    const pts = boardSnapPoints({ ...b, holes: [{ ...centred, depth: 'through' as const }] });
    expect(pts.some((p) => p.at.every((v, i) => Math.abs(v - [12, 0, 2.75][i]!) < 1e-9))).toBe(true);
    expect(pts).toHaveLength(26);
  });
  it('an off-centre hole adds its centre and withholds nothing', () => {
    const pts = boardSnapPoints({ ...b, holes: [{ ...centred, station: 5 }] });
    expect(pts).toHaveLength(27);
  });
});
```

(The world coordinates assume a flat part at the origin: length → X, thickness → Y, width → Z. Confirm against an
existing flat-part test in this file; if the mapping differs, derive the point by hand with `toWorld`, not by running
the code.)

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement**

`bodies.ts`:
- `import { boardHoles, holeRowValues, type Hole } from './holes';`
- `geometryKey`: after `angles`,
  `const holes = board.holes.map((r) => \`${JSON.stringify(r.id)}:${holeRowValues(r).map(val).join(',')}\`).join(';');`
  and return `…|${angles}|${holes}`. The doc comment gains: "and every hole row's id and HOLE_KEYS values (a hole carries
  its row id, Hole.row)".
- `PartGeometry`: `readonly holes: readonly Hole[];` with doc "every row's instances (holes spec §3.1); bodies stay
  hole-free".
- `partGeometry`: `const holes = deepFreeze(boardHoles(board));` and `holes,` in the entry.

`cuts.ts` `stockProbe`: import `boardHoles`, `insideHole` from `./holes`;
`const holes = boardHoles(board);` beside `planes`, and as the first line of the returned function after `kept`:
`if (holes.some((h) => insideHole(h, [p.length, p.width, p.thickness]))) return false;` with a comment "The mouth is air
(holes spec §3.5, amended)".

`snapPoints.ts` `boardSnapPoints`:
- The first early return: `if (board.cuts.length === 0 && board.angleCuts.length === 0 && board.holes.length === 0) return points;`
- After `lattice` is computed and BEFORE `if (board.angleCuts.length === 0) return lattice;`:

```ts
  // Hole centres (holes spec §3.5, amended): on the entry face, and the exit face when through, kind 'face-center',
  // owned by the board. A centre sits in AIR — a deliberate exception to invariant 16's marker rule: it is the centre
  // of a drawn rim, and the Tape tool measures centre to centre from it. Deduped by distance against the lattice.
  const close = (a: readonly number[], b: readonly number[]) => a.every((v, i) => Math.abs(v - b[i]!) <= 1e-9);
  for (const h of geometry.holes) {
    const ends = h.through ? [0, h.depth] : [0];
    for (const t of ends) {
      const c = [...h.centre];
      c[DIMENSION_ORDER.indexOf(h.axis)] += h.dir * t;
      const at = toWorld(board, { length: c[0]!, width: c[1]!, thickness: c[2]! });
      if (!lattice.some((q) => close(q.at, at))) lattice.push({ kind: 'face-center', at, owner });
    }
  }
```

  (Import `DIMENSION_ORDER` if not already. The doc comment above `boardSnapPoints` gains a sentence: holes add their
  centres and the mouth withholds lattice points through `stockProbe`.)

- [ ] **Step 4: Full suite and build** — PASS. (The three `toBe(15)` snap counts must still pass unchanged.)

- [ ] **Step 5: Mutate** — remove `holes` from `geometryKey` (key test fails); remove the `insideHole` line (count 26 → 27
  fails); remove `&& board.holes.length === 0` (centre never appears on a plain part); drop the exit `t` (through test
  fails). Restore each.

- [ ] **Step 6: Commit** — `holes: part geometry, the mouth is air, centre snap points`.

---

### Task 6: The 3D view draws holes

**Files:**
- Modify: `src/viewport/grainTiling.ts` (`boardUVSignature`, `faceTriangles`, `bodyMesh`, `holeMesh`),
  `src/viewport/BoardMesh.tsx`
- Test: `src/viewport/grainTiling.test.ts`

**Interfaces:**
- Consumes: `Hole`, `holeRing`, `holePrism`, `minusPrism`, `holeTouches`, `axialOffset`, `ringInside`, `bodyPlanes`,
  `clipPolygon`, `holeRims`, `holeTouchesBox`, `HOLE_SEGMENTS` (Task 3); `partGeometry(board).holes` (Task 5).
- Produces: `faceTriangles(f: BodyFace, holes: readonly Hole[]): V3[][]`;
  `bodyMesh(board, body, holes: readonly Hole[] = [])` (same return shape as today);
  `holeMesh(board, hole, bodies): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; groups: {start;count;materialIndex}[] }`.

- [ ] **Step 1: Write the failing tests** (`grainTiling.test.ts`)

```ts
import { boardHoles, boardBodies, holeRing, holeTouchesBox, HOLE_SEGMENTS, createBoard } from '../document/document';
import { boardUVSignature, faceTriangles, holeMesh } from './grainTiling';

const pinRow = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 32 / 25.4, acrossFrom: 'min' as const, inset: 1.5 };
const dado = { id: 'c1', face: 'thickness' as const, from: 'max' as const, across: 'width' as const, offset: 10, width: 0.75, depth: 0.25, stopMin: 0, stopMax: 0 };
const cabinetSide = createBoard({ id: 'side', length: 30, width: 11.25, thickness: 0.75, cuts: [dado], holes: [pinRow] });

describe('holes in the mesh (holes spec §3.2)', () => {
  it('boardUVSignature changes with a row (inv 15)', () => {
    expect(boardUVSignature(cabinetSide)).not.toBe(boardUVSignature({ ...cabinetSide, holes: [] }));
    expect(boardUVSignature(cabinetSide)).not.toBe(boardUVSignature({ ...cabinetSide, holes: [{ ...pinRow, inset: 2 }] }));
  });
  it('holeTouchesBox decides the box path: false for a cell no hole reaches, true for one it does', () => {
    const holes = boardHoles(cabinetSide);
    const cells = boardBodies(cabinetSide).map((b) => b.box!);
    const far = cells.find((r) => r.length[0] >= 10.75)!;                 // the cell beyond the dado
    const near = cells.find((r) => r.length[1] <= 10 && r.thickness[0] >= 0.5)!;   // under the pins, above the seam
    expect(holes.some((h) => holeTouchesBox(h, far))).toBe(false);
    expect(holes.some((h) => holeTouchesBox(h, near))).toBe(true);
  });
  it('the face is watertight against the wall: every top-ring vertex is a face-mesh vertex', () => {
    const holes = boardHoles(cabinetSide);
    const faces = boardBodies(cabinetSide).flatMap((body) => body.faces);
    const verts = faces.flatMap((f) => faceTriangles(f, holes)).flat();
    for (const h of holes) {
      for (const p of holeRing(h, 0)) expect(verts.some((q) => q.every((v, i) => v === p[i]))).toBe(true);
    }
  });
  it('no face triangle lies inside a hole between its caps — no membrane at the dado-floor seam (Review Focus 1)', () => {
    const holes = boardHoles(cabinetSide);
    const tris = boardBodies(cabinetSide).flatMap((body) => body.faces).flatMap((f) => faceTriangles(f, holes));
    for (const t of tris) {
      const c = [0, 1, 2].map((k) => (t[0]![k]! + t[1]![k]! + t[2]![k]!) / 3);
      for (const h of holes) {
        const tt = h.dir * (c[2]! - h.centre[2]);
        const r = Math.hypot(c[0]! - h.centre[0], c[1]! - h.centre[1]);
        expect(tt > 1e-6 && tt < h.depth - 1e-6 && r < h.radius * 0.9).toBe(false);
      }
    }
  });
  it('face area is the body face area less each hole polygon', () => {
    const b = createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.75, holes: [pinRow] });
    const holes = boardHoles(b);
    const top = boardBodies(b)[0]!.faces.find((f) => f.n[2] === 1)!;
    const triArea = (t: number[][]) => Math.abs((t[1]![0]! - t[0]![0]!) * (t[2]![1]! - t[0]![1]!) - (t[2]![0]! - t[0]![0]!) * (t[1]![1]! - t[0]![1]!)) / 2;
    const ngon = (HOLE_SEGMENTS / 2) * 0.125 ** 2 * Math.sin((2 * Math.PI) / HOLE_SEGMENTS);
    expect(faceTriangles(top, holes).reduce((s, t) => s + triArea(t), 0)).toBeCloseTo(30 * 11.25 - 3 * ngon, 9);
  });
  it('holeMesh: a wall facing the axis with radial normals, and a bottom facing the mouth', () => {
    const b = createBoard({ id: 'p', length: 30, width: 11.25, thickness: 0.75, holes: [{ ...pinRow, count: 1 }] });
    const [h] = boardHoles(b);
    const m = holeMesh(b, h!, boardBodies(b));
    expect(m.positions.length).toBe(m.normals.length);
    expect(m.uvs.length / 2).toBe(m.positions.length / 3);
    // Every triangle is wound so its geometric normal agrees with its vertex normals (FrontSide materials).
    for (let i = 0; i < m.positions.length; i += 9) {
      const p = [0, 1, 2].map((k) => [m.positions[i + 3 * k]!, m.positions[i + 3 * k + 1]!, m.positions[i + 3 * k + 2]!]);
      const e1 = [0, 1, 2].map((k) => p[1]![k]! - p[0]![k]!); const e2 = [0, 1, 2].map((k) => p[2]![k]! - p[0]![k]!);
      const cr = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      const n = [m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!];
      expect(cr[0]! * n[0]! + cr[1]! * n[1]! + cr[2]! * n[2]!).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement in `grainTiling.ts`**

- `import { ShapeUtils, Vector2 } from 'three';` and the hole helpers/types from `../document/document`.
- `boardUVSignature`: append `board.holes.map((r) => holeRowValues(r).join(',')).join(';'),` with the comment "Holes change
  which faces are opened and add walls (holes spec §3.2; invariant 15)."
- `faceTriangles`:

```ts
/**
 * One body face as triangles (board-local), with every hole that reaches into it cut out (holes spec §3.2, amended).
 * No hole: the fan bodyMesh always drew, vertex for vertex. Every reaching hole perpendicular to the face with its ring
 * STRICTLY inside it: triangulated with the rings as holes, from the SAME ring vertices the wall uses, so face and wall
 * share every rim vertex (no T-junctions). Otherwise (a tangent hole, a seam parallel to the axis, a faulted hole): the
 * disjoint convex split, fanned — T-junctions accepted there.
 */
export function faceTriangles(f: BodyFace, holes: readonly Hole[]): V3[][] {
  const fan = (p: V3[]): V3[][] => p.slice(1, -1).map((_, i) => [p[0]!, p[i + 1]!, p[i + 2]!]);
  const reaching = holes.filter((h) => holeTouches(h, f.verts));
  if (reaching.length === 0) return fan(f.verts);
  const rings = reaching.map((h) => { const t = axialOffset(h, f); return t === null ? null : holeRing(h, t); });
  if (rings.every((r): r is V3[] => r !== null && ringInside(f.verts, f.n, r))) {
    const a = [0, 1, 2].reduce((m, k) => (Math.abs(f.n[k]!) > Math.abs(f.n[m]!) ? k : m), 0);
    const [u, v] = [0, 1, 2].filter((k) => k !== a) as [number, number];
    const flat = (p: V3) => new Vector2(p[u], p[v]);
    const all = [...f.verts, ...rings.flat()];
    return ShapeUtils.triangulateShape(f.verts.map(flat), rings.map((r) => r.map(flat)))
      .map(([i, j, k]) => [all[i!]!, all[j!]!, all[k!]!]);
  }
  let pieces: V3[][] = [f.verts];
  for (const h of reaching) pieces = pieces.flatMap((p) => minusPrism(p, holePrism(h)));
  return pieces.flatMap(fan);
}
```

- `bodyMesh(board, body, holes: readonly Hole[] = [])`: replace the inner fan loop
  `for (let i = 1; i + 1 < pts.length; i += 1) { let tri = [pts[0]!, pts[i]!, pts[i + 1]!]; …`
  with `for (const t of faceTriangles(f, holes)) { let tri = t.map(offsetOf); …` keeping the zero-area skip, the winding
  fix against `n` and the push loop exactly as they are. (`pts` is no longer needed.) The doc comment gains: "Holes are
  cut out of the faces they reach (faceTriangles); a part without holes draws exactly what it drew before."
- `holeMesh`:

```ts
/**
 * One hole's wall and (blind) bottom (holes spec §3.2): the wall's HOLE_SEGMENTS quads between the entry ring and the
 * far ring, each clipped to every body (so a seam splits it and a faulted hole's wall stops at the stock); the bottom
 * ring clipped likewise. Explicit normals — radial toward the axis on the wall (smooth), back toward the mouth on the
 * bottom — because BoardMesh's computeVertexNormals would facet them. Triangles wound to face along their normals
 * (the materials are FrontSide). UVs and materials as bodyMesh's sloped faces: each facet takes the plan of the world
 * axis its normal is nearest.
 */
export function holeMesh(board: Board, h: Hole, bodies: readonly Body[]): { positions: Float32Array; normals: Float32Array; uvs: Float32Array; groups: { start: number; count: number; materialIndex: number }[] } {
  const plans = facePlans(board);
  const frame = axisFrame(board);
  const extents = boardExtents(board);
  const [ou, ov] = boardUVOffset(board.id);
  const dimIndex = (d: Dimension) => DIMENSION_ORDER.indexOf(d);
  const offsetOf = (p: V3) => [0, 1, 2].map((i) => toWorldOffset(board, i, p[dimIndex(frame[i]!.dim)]!)) as V3;
  const vecOf = (n: V3) => [0, 1, 2].map((i) => n[dimIndex(frame[i]!.dim)]! * (frame[i]!.reversed ? -1 : 1)) as V3;
  const planes = bodies.map((b) => bodyPlanes(b.faces));
  const a = dimIndex(h.axis);
  const inward = (p: V3): V3 => {
    const r: V3 = [h.centre[0] - p[0], h.centre[1] - p[1], h.centre[2] - p[2]];
    r[a] = 0;
    const l = Math.hypot(...r);
    return [r[0] / l, r[1] / l, r[2] / l];
  };
  const byMaterial = Array.from({ length: 6 }, () => ({ pos: [] as number[], nor: [] as number[], uv: [] as number[] }));
  const emit = (poly: V3[], facet: V3, normalAt: (p: V3) => V3) => {
    const fw = vecOf(facet);
    let axis = 0;
    for (let i = 1; i < 3; i += 1) if (Math.abs(fw[i]!) > Math.abs(fw[axis]!) + 1e-9) axis = i;
    const material = axis * 2 + (fw[axis]! > 0 ? 0 : 1);
    const plan = plans[material]!;
    const out = byMaterial[material]!;
    for (let i = 1; i + 1 < poly.length; i += 1) {
      let tri = [poly[0]!, poly[i]!, poly[i + 1]!];
      let w = tri.map(offsetOf);
      const e1 = [0, 1, 2].map((k) => w[1]![k]! - w[0]![k]!);
      const e2 = [0, 1, 2].map((k) => w[2]![k]! - w[0]![k]!);
      const cr = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
      if (Math.hypot(cr[0]!, cr[1]!, cr[2]!) / 2 < 1e-12) continue;
      if (cr[0]! * fw[0]! + cr[1]! * fw[1]! + cr[2]! * fw[2]! < 0) { tri = [tri[0]!, tri[2]!, tri[1]!]; w = [w[0]!, w[2]!, w[1]!]; }
      tri.forEach((p, k) => {
        const q = w[k]!;
        const nw = vecOf(normalAt(p));
        out.pos.push(q[0] - extents[0] / 2, q[1] - extents[1] / 2, q[2] - extents[2] / 2);
        out.nor.push(nw[0], nw[1], nw[2]);
        out.uv.push(q[plan.axes[0]]! / plan.tileInches[0] + (plan.fit[0] ? 0 : ou), q[plan.axes[1]]! / plan.tileInches[1] + (plan.fit[1] ? 0 : ov));
      });
    }
  };
  const clipTo = (poly: V3[]) => planes.flatMap((ps) => { let p = poly; for (const q of ps) { p = clipPolygon(p, q); if (!p.length) break; } return p.length ? [p] : []; });
  const top = holeRing(h, 0);
  const far = holeRing(h, h.depth);
  for (let k = 0; k < top.length; k += 1) {
    const k1 = (k + 1) % top.length;
    const quad = [top[k]!, top[k1]!, far[k1]!, far[k]!];
    const mid: V3 = [0, 1, 2].map((i) => (top[k]![i]! + top[k1]![i]!) / 2) as V3;
    for (const piece of clipTo(quad)) emit(piece, inward(mid), inward);
  }
  if (!h.through) {
    const back: V3 = [0, 0, 0];
    back[a] = -h.dir;
    for (const piece of clipTo(far)) emit(piece, back, () => back);
  }
  const positions: number[] = []; const normals: number[] = []; const uvs: number[] = [];
  const groups: { start: number; count: number; materialIndex: number }[] = [];
  byMaterial.forEach((m, materialIndex) => {
    if (m.pos.length === 0) return;
    groups.push({ start: positions.length / 3, count: m.pos.length / 3, materialIndex });
    positions.push(...m.pos); normals.push(...m.nor); uvs.push(...m.uv);
  });
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), groups };
}
```

(`facePlans`, `boardUVOffset`, `V3`, `Body`, `BodyFace`, `Dimension` are already in scope in this file or importable from
`../document/document`; reuse what `bodyMesh` uses. If the winding test fails because `offsetOf` reverses an axis, the
fix is in the winding check, not the test.)

- [ ] **Step 4: Wire `BoardMesh.tsx`**

In the `geometries` memo:

```ts
    const { bodies, holes } = partGeometry(board);
    // … placeholder branch unchanged (a ghost has no holes to draw) …
    return {
      placeholder: false,
      items: [
        ...bodies.map((body) => {
          if (body.box && !holes.some((h) => holeTouchesBox(h, body.box!))) {
            // Today's path, byte-for-byte (angle-cuts spec §3.3; holes spec §3.2: a part with no holes keeps it).
            …unchanged…
          }
          const m = bodyMesh(board, body, holes);
          …unchanged…
        }),
        // Each hole's wall and bottom (holes spec §3.2): explicit normals, so NO computeVertexNormals here.
        ...holes.map((h) => {
          const m = holeMesh(board, h, bodies);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
          geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
          geo.setAttribute('uv', new THREE.BufferAttribute(m.uvs, 2));
          for (const g of m.groups) geo.addGroup(g.start, g.count, g.materialIndex);
          return { geo, center: [0, 0, 0] as [number, number, number] };
        }),
      ],
    };
```

In the `edges` memo, after `points` from `partGeometry(board).edges`, append the rims (holes spec §3.3, amended):

```ts
    const toPt = (p: V3) => ({ length: p[0], width: p[1], thickness: p[2] });
    const rims = partGeometry(board).holes.flatMap((h) => holeRims(h).flatMap(([a, b]) => [
      ...pointToLocalXYZ(board, toPt(a)), ...pointToLocalXYZ(board, toPt(b)),
    ]));
    geo.setAttribute('position', new THREE.Float32BufferAttribute([...points, ...rims], 3));
```

Both memos already key on `boardUVSignature(board)`, which now includes holes — no new dependency entries (invariant 15).
The disposal effect already disposes every item.

- [ ] **Step 5: Full suite and build** — PASS.

- [ ] **Step 6: Mutate**
- `faceTriangles`: force the fallback (replace the `rings.every` condition with `false`) → the watertight test fails.
- `holePrism`: drop `+ PRISM_EPS` from the entry cap → the membrane or area test fails (the top face is not punched).
- `holeMesh`: remove the winding swap → the FrontSide winding test fails.
- `boardUVSignature`: remove the holes line → the signature test fails.
Restore each.

- [ ] **Step 7: Commit** — `holes: the 3D view cuts holes, draws walls, bottoms and rims`.

---

### Task 7: Bench text and the cut list

**Files:**
- Create: `src/document/holeText.ts`
- Modify: `src/document/cutlist.ts`
- Test: `src/document/holeText.test.ts` (create), `src/document/cutlist.test.ts`

**Interfaces:**
- Consumes: `holeFaults`, `HoleFault` (Task 3).
- Produces: `holeLine(board: Board, r: HoleRow, precision: number): string`;
  `holeFaultText(f: HoleFault, r: HoleRow): string` — THE words for a fault (lower-case, no full stop), read by the
  cut-list line and by Task 10's Properties note.

- [ ] **Step 1: Write the failing tests**

`holeText.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard } from './document';
import { holeFaultText, holeLine } from './holeText';
import type { HoleRow } from './types';

const side = createBoard({ length: 30, width: 11.25, thickness: 0.75 });
const pins: HoleRow = { id: 'h1', face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5 };
const cup: HoleRow = { id: 'h2', face: 'thickness', from: 'max', diameter: 35 / 25.4, depth: 0.5, along: 'length', alongFrom: 'min', station: 3, count: 1, pitch: 0, acrossFrom: 'min', inset: 22.5 / 25.4 };

describe('holeLine (spec §4.1, as amended)', () => {
  it('a row: pitch at 1/64 with its mm, last centre exact at the document precision', () => {
    expect(holeLine(side, pins, 16)).toBe('Row of 21 holes 1/4" dia × 3/8" deep in the thickness face (max side), along the length: first 2" from the min end, every 1-17/64" (32 mm), last at 27-3/16"; 1-1/2" in from the width min side');
  });
  it('a single hole: a whole-mm diameter prints its mm', () => {
    expect(holeLine(side, cup, 16)).toBe('Hole 1-3/8" (35 mm) dia × 1/2" deep in the thickness face (max side), 3" from the length min end, 7/8" in from the width min side');
  });
  it('through, and an end face reads as an end', () => {
    const dowel: HoleRow = { ...cup, face: 'length', from: 'max', diameter: 0.375, depth: 'through', along: 'width', station: 2, inset: 0.375, acrossFrom: 'min' };
    expect(holeLine(side, dowel, 16)).toBe('Hole 3/8" dia × through in the length max end, 2" from the width min side, 3/8" in from the thickness min side');
  });
  it('a faulted row carries its first fault and a count (the user\'s ruling, Review Focus 2)', () => {
    const short = { ...side, length: 26, holes: [pins] };
    expect(holeLine(short, pins, 16)).toMatch(/ — check: hole 20 runs past the length max end \(and 1 more\)$/);
    expect(holeLine({ ...side, holes: [pins] }, pins, 16)).not.toContain('check:');
  });
  it('holeFaultText words each kind', () => {
    expect(holeFaultText({ index: 0, kind: 'off-flat' }, pins)).toBe('hole 1 sits where a cut has removed the wood');
    expect(holeFaultText({ index: 2, kind: 'meets-hole', other: { row: 'h1', index: 1 } }, pins)).toBe('hole 3 meets hole 2');
    expect(holeFaultText({ index: 0, kind: 'meets-hole', other: { row: 'zz', index: 0 } }, pins)).toBe('hole 1 meets a hole of another row');
    expect(holeFaultText({ index: 0, kind: 'too-deep' }, pins)).toBe('the holes are deeper than the thickness');
  });
  it('an exact-1/64 whole-mm value does not print its mm (5" is 127 mm)', () => {
    expect(holeLine(side, { ...pins, pitch: 5, count: 2 }, 16)).toContain('every 5", last at 7"');
  });
});
```

`cutlist.test.ts` (in a new describe, using the same `legs` style builder as the angle tests):

```ts
describe('holes on the cut list (spec §4)', () => {
  const r1 = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 3, pitch: 1.25, acrossFrom: 'min' as const, inset: 1.5 };
  const r2 = { ...r1, id: 'h2', acrossFrom: 'max' as const };
  const sides = (extra: Partial<Board>[]) => ({ ...createDocument('T'), boards: extra.map((x, i) => createBoard({ id: `s${i}`, name: `Side ${i}`, length: 30, width: 11.25, thickness: 0.75, material: 'oak', ...x })) });
  it('a drilled side and a plain one are two rows', () => {
    expect(buildCutList(sides([{ holes: [r1] }, {}]) as FlatDocument).groups[0]!.rows).toHaveLength(2);
  });
  it('the same rows in another order, other ids, are one row (Review Focus 5)', () => {
    const rows = buildCutList(sides([{ holes: [r1, r2] }, { holes: [{ ...r2, id: 'x' }, { ...r1, id: 'y' }] }]) as FlatDocument).groups[0]!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.setup.filter((l) => l.startsWith('Row of 3 holes'))).toHaveLength(2);
  });
  it('hole lines print after the angle lines', () => {
    const taper = { id: 'a1', kind: 'taper' as const, face: 'width' as const, from: 'min' as const, along: 'length' as const, alongFrom: 'min' as const, points: [[0, 0.625], [24, 0]] as [[number, number], [number, number]] };
    const setup = buildCutList(sides([{ angleCuts: [taper], holes: [r1] }]) as FlatDocument).groups[0]!.rows[0]!.setup;
    expect(setup.findIndex((l) => l.startsWith('Row of'))).toBeGreaterThan(setup.findIndex((l) => l.startsWith('Taper')));
  });
  it('a faulted row prints as stored, with its fault (Review Focus 2)', () => {
    const off = { ...r1, station: 29, count: 3 };
    const line = buildCutList(sides([{ holes: [off] }]) as FlatDocument).groups[0]!.rows[0]!.setup.find((l) => l.startsWith('Row of'))!;
    expect(line).toContain('last at 31-1/2"');
    expect(line).toMatch(/ — check: hole 2 runs past the length max end \(and 1 more\)$/);
  });
});
```

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement `holeText.ts`**

```ts
import type { Board, Dimension, HoleRow } from './types';
import { formatLength } from '../units/length';
import { faceName } from './angleText';
import { acrossOf } from './holes';
import { holeFaults, type HoleFault } from './holeFaults';

const end = (d: Dimension) => (d === 'length' ? 'end' : 'side');

/** A fault in words (holes spec §2.4): THE one home (invariant 19), read by the cut-list line and the Properties note.
 *  Lower-case, no full stop: each reader frames it. */
export function holeFaultText(f: HoleFault, r: HoleRow): string {
  const n = f.index + 1;
  switch (f.kind) {
    case 'breaks-out': return `hole ${n} runs past the ${f.edge!.dim} ${f.edge!.side} ${end(f.edge!.dim)}`;
    case 'off-flat': return `hole ${n} sits where a cut has removed the wood`;
    case 'meets-hole': return `hole ${n} meets ${f.other!.row === r.id ? `hole ${f.other!.index + 1}` : 'a hole of another row'}`;
    case 'too-deep': return `the holes are deeper than the ${r.face}`;
  }
}

/** A diameter or pitch that is a whole number of millimetres AND not an exact 1/64 also prints its mm (spec §4.1,
 *  amended): the 32 mm system and 35 mm cups read as what the jig and the bit say. 5" (127 mm) does not. */
function mm(v: number): string {
  const m = v * 25.4;
  const whole = Math.round(m);
  const on64 = Math.abs(v * 64 - Math.round(v * 64)) <= 1e-9;
  return whole > 0 && Math.abs(m - whole) <= 1e-9 && !on64 ? ` (${whole} mm)` : '';
}

/**
 * One hole row as a bench line (holes spec §4.1, as amended): THE ONE home of these strings (invariant 19). Lengths at
 * the document precision except the pitch, at 1/64 at least (a jig set to a rounded pitch drifts along the row). "last
 * at" is computed from the exact stored values, then rounded. A faulted row (a later edit ran it off the part, spec §2.4)
 * ends with its first fault and how many more — the user's ruling: the bench must not read a wrong row silently.
 */
export function holeLine(board: Board, r: HoleRow, precision: number): string {
  const base = holeLineBase(board, r, precision);
  const faults = holeFaults(board, r);
  if (faults.length === 0) return base;
  return `${base} — check: ${holeFaultText(faults[0]!, r)}${faults.length > 1 ? ` (and ${faults.length - 1} more)` : ''}`;
}

function holeLineBase(board: Board, r: HoleRow, precision: number): string {
  const f = (n: number) => formatLength(n, precision);
  const size = `${f(r.diameter)}${mm(r.diameter)} dia × ${r.depth === 'through' ? 'through' : `${f(r.depth)} deep`}`;
  const where = `in ${faceName(r.face, r.from)}`;
  const across = acrossOf(r);
  const inset = `${f(r.inset)} in from the ${across} ${r.acrossFrom} ${end(across)}`;
  if (r.count === 1) return `Hole ${size} ${where}, ${f(r.station)} from the ${r.along} ${r.alongFrom} ${end(r.along)}, ${inset}`;
  const pitch = `${formatLength(r.pitch, Math.max(precision, 64))}${mm(r.pitch)}`;
  const last = r.station + (r.count - 1) * r.pitch;
  return `Row of ${r.count} holes ${size} ${where}, along the ${r.along}: first ${f(r.station)} from the ${r.alongFrom} ${end(r.along)}, every ${pitch}, last at ${f(last)}; ${inset}`;
}
```

`cutlist.ts`:
- `import { holeLine } from './holeText';` and `import { holeRowValues } from './holes';`
- `setupLines`, after the short-point line: `for (const r of board.holes) lines.push(holeLine(board, r, precision));`
- A signature beside `angleSignature`:

```ts
/** The hole half of a row's identity: EXACT and order-independent, ids ignored (holes spec §4.2). */
function holeSignature(board: Board): string {
  return board.holes.map((r) => holeRowValues(r).join(':')).sort().join(';');
}
```

  and `holeSignature(board),` as the last element of `rowKey`'s array.

- [ ] **Step 4: Full suite and build** — PASS.

- [ ] **Step 5: Mutate** — `Math.max(precision, 64)` → `precision` (row string fails: `1-1/4"`); drop `!on64` (the 5"
  case fails); drop `.sort()` from `holeSignature` (Review Focus 5 fails); drop `holeSignature` from `rowKey` (two rows
  test fails). Restore.

- [ ] **Step 6: Commit** — `holes: bench lines and cut-list grouping`.

---

### Task 8: Joinery, Refine and Repair joints stay away

**Files:**
- Create: `src/document/holedRefusal.ts`
- Modify: `src/generate/joints/tapers.ts` (`joineryRefusal`), `src/generate/refine.ts` (`plainForRefine`),
  `src/document/refineDesign.ts` (`RefusalReason`, `documentToDesign`), `src/generate/joints/repair.ts` (`repairDocument`)
- Test: `src/document/holedRefusal.test.ts` (create), `src/generate/joints/runJoinery.test.ts`, `src/generate/refineBase.test.ts`,
  `src/document/refineDesign.test.ts`, `src/generate/joints/repair.test.ts`

**Interfaces:**
- Produces: `holedParts(flat: FlatDocument): string[]`; `holedRefusal(flat: FlatDocument, action: 'joinery' | 'refine'): string | null`;
  `RefusalReason` gains `'holes'`.

- [ ] **Step 1: Write the failing tests**

`holedRefusal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createBoard, createDocument, flatDocument } from './document';
import { holedParts, holedRefusal } from './holedRefusal';

const pin = { id: 'h1', face: 'thickness' as const, from: 'max' as const, diameter: 0.25, depth: 0.375, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 1.5 };
const doc = (n: number) => ({ ...createDocument('T'), boards: Array.from({ length: 5 }, (_, i) => createBoard({ id: `b${i}`, name: `Side ${i + 1}`, holes: i < n ? [pin] : [] })) });

describe('holedRefusal (spec §6)', () => {
  it('null without holes', () => {
    expect(holedRefusal(flatDocument(doc(0)), 'joinery')).toBeNull();
  });
  it('names the holed parts, three and an ellipsis at most', () => {
    expect(holedParts(flatDocument(doc(2)))).toEqual(['Side 1', 'Side 2']);
    expect(holedRefusal(flatDocument(doc(4)), 'joinery')).toContain('(Side 1, Side 2, Side 3…)');
    expect(holedRefusal(flatDocument(doc(1)), 'refine')).toMatch(/^Refine /);
  });
});
```

`runJoinery.test.ts`:

```ts
  it('refuses a document with holes before any call (holes spec §6)', async () => {
    const c = client({ joints: [] });
    const holed = { ...CORNER, boards: CORNER.boards.map((b, i) => (i === 0 ? { ...b, holes: [{ id: 'h1', face: 'width' as const, from: 'max' as const, diameter: 0.375, depth: 1, along: 'length' as const, alongFrom: 'min' as const, station: 2, count: 1, pitch: 0, acrossFrom: 'min' as const, inset: 0.875 }] } : b)) };
    const out = await run(c, holed);
    expect('refused' in out).toBe(true);
    expect(c.complete).not.toHaveBeenCalled();
  });
```

`refineBase.test.ts` (import `plainForRefine` as the file already does): a holed plain document → `'refused' in base`
and `base.refused.reason === 'holes'`; a holed **joined** document (take any joined fixture the file already uses and add
a row to one part) → also `'holes'`, decided before the gate.

`refineDesign.test.ts`: `documentToDesign(holedDoc, REFINE_MAX)` → `{ refused: { reason: 'holes' } }` (defence in depth).

`repair.test.ts`: a document `repairDocument` would otherwise repair (take the file's damaged fixture) with a row added to
one part → `repairDocument(doc)` is `null` (withheld, spec §6).

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement**

`holedRefusal.ts`:

```ts
import type { FlatDocument } from './types';

/** Flat (display) names of the placed parts carrying any hole row. */
export function holedParts(flat: FlatDocument): string[] {
  return flat.boards.filter((b) => b.holes.length > 0).map((b) => b.name);
}

const list = (names: string[]) => `${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}`;

/**
 * The refusal for a document with holes (holes spec §6), or null. Decided at entry, before any mutation or paid call.
 * Joinery is box-based and would cut a pocket through a hole; Refine cannot describe one.
 */
export function holedRefusal(flat: FlatDocument, action: 'joinery' | 'refine'): string | null {
  const names = holedParts(flat);
  if (names.length === 0) return null;
  return action === 'joinery'
    ? `Add joinery doesn't handle parts with holes yet (${list(names)}). Add joinery before drilling, or remove the holes first.`
    : `Refine doesn't handle parts with holes yet (${list(names)}). Refine before drilling, or remove the holes first.`;
}
```

- `tapers.ts` `joineryRefusal`: first line `const holed = holedRefusal(flat, 'joinery'); if (holed) return holed;` — the
  dialog, `runJoinery` and the joined Refine path all call it. Doc comment: "Holes first (holes spec §6)."
- `refine.ts` `plainForRefine`, inside the `try`, after `const flat = flatDocument(doc);`:

```ts
    // Holes (holes spec §6): refused before the joint gate, so a holed joined design never reaches unjoin.
    const holed = holedRefusal(flat, 'refine');
    if (holed) return { refused: { reason: 'holes', message: holed } };
```

- `refineDesign.ts`: `RefusalReason` gains `| 'holes'`; in `documentToDesign` after the `'empty'` refusal:
  `const holed = holedRefusal(flatDocument(doc), 'refine'); if (holed) return refuse('holes', holed);`
- `repair.ts` `repairDocument`, after `const flat = flatDocument(doc);`:
  `if (holedParts(flat).length > 0) return null; // withheld, not refused (holes spec §6): the dialog has already refused`

- [ ] **Step 4: Full suite and build** — PASS. Check that `refineDialogInfo`'s `joined` flag and `repair` stay sensible
  for reason `'holes'` (both false/null — read the code; no change expected).

- [ ] **Step 5: Mutate** — remove each of the four entry checks in turn; its test fails (the runJoinery one by
  `complete` being called). Restore.

- [ ] **Step 6: Commit** — `holes: joinery, Refine and Repair refuse holed documents`.

---

### Task 9: Store actions

**Files:**
- Modify: `src/store/store.ts`
- Test: `src/store/store.test.ts`

**Interfaces:**
- Produces: `addHoleRows(boardId: string, rows: Omit<HoleRow, 'id'>[]): void`,
  `updateHoleRow(boardId: string, rowId: string, next: Omit<HoleRow, 'id'>): void`,
  `removeHoleRow(boardId: string, rowId: string): void`.

- [ ] **Step 1: Write the failing tests** — a `describe('hole-row actions (spec §7)')` mirroring `angle-cut actions`
  exactly, on `createBoard({ id: 'side', name: 'Side', length: 30, width: 11.25, thickness: 0.75 })` with
  `row = { face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 2, count: 3, pitch: 1.25, acrossFrom: 'min', inset: 1.5 }`:
  1. add / update (`station: 3`) / remove are one undo entry each; three undos restore `[]` and `past.length === 0`;
  2. an unchanged update pushes no undo entry (inv 4);
  3. refused while exploded (inv 47): add does nothing at explode 0.5; update and remove at 0.5 leave the row and `past`;
  4. **held points** (inv 24): grab the part's top face-centre snap point (as the existing held-point tests in this file
     do — `grep -n "judgeHeld\|grabbed" src/store/store.test.ts`), then:
     - add a hole at `station: 12.05` (r = ⅛, its mouth covers the face centre at 12, but its own centre is elsewhere):
       `grabbed` is dropped — the face-centre point is withheld and nothing replaces it at that position;
     - from a fresh grab, add a hole CENTRED there: `grabbed` is **kept** — the hole-centre point has the same kind
       (`'face-center'`), owner and exact position, so `sameSnapPoint` still finds it. This is correct, not a bug: do
       not give hole centres a new kind to "fix" it.
  5. a row added to a part inside an assembly is written to the definition (`mapWorld`), visible through every placement.

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement** — in the State interface beside the angle actions:

```ts
  /** Hole rows (holes spec §7): several in one call are one undo entry. */
  addHoleRows: (boardId: string, rows: Omit<HoleRow, 'id'>[]) => void;
  updateHoleRow: (boardId: string, rowId: string, next: Omit<HoleRow, 'id'>) => void;
  removeHoleRow: (boardId: string, rowId: string) => void;
```

and the implementations after `removeAngleCut`:

```ts
    // Hole rows (holes spec §7): through mapWorld like angle cuts, so a shaped part's rows are its shape's and every
    // user sees the edit (invariant 45). Held points are re-judged after (invariant 24): a hole can swallow a grabbed
    // lattice point (the mouth is air).
    addHoleRows: (boardId, rows) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || rows.length === 0) return;
      const added = rows.map((r) => ({ ...copyHoleRow(r as HoleRow), id: nextId() }));
      edit((doc) => mapWorld(doc, (w) => w.map((b) => (b.id === boardId ? { ...b, holes: [...b.holes, ...added] } : b))));
      judgeHeld();
    },
    updateHoleRow: (boardId, rowId, next) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      const cur = board?.holes.find((r) => r.id === rowId);
      if (!board || !cur) return;
      const after: HoleRow = { ...copyHoleRow(next as HoleRow), id: rowId };
      if (sameHoleRow(cur, after)) return; // a no-op edit pushes no undo entry (invariant 4)
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, holes: b.holes.map((r) => (r.id === rowId ? after : r)) } : b)));
      judgeHeld();
    },
    removeHoleRow: (boardId, rowId) => {
      if (readOnly()) return;
      const board = worldParts(get().doc).find((b) => b.id === boardId);
      if (!board || !board.holes.some((r) => r.id === rowId)) return;
      edit((doc) => mapWorld(doc, (w) => w.map((b) =>
        b.id === boardId ? { ...b, holes: b.holes.filter((r) => r.id !== rowId) } : b)));
      judgeHeld();
    },
```

(Import `HoleRow` type and `copyHoleRow`, `sameHoleRow`.)

- [ ] **Step 4: Full suite and build** — PASS.
- [ ] **Step 5: Mutate** — remove `judgeHeld()` from `addHoleRows` (held test fails); remove the `sameHoleRow` early
  return (no-op test fails); remove `readOnly()` from `updateHoleRow` (exploded test fails). Restore.
- [ ] **Step 6: Commit** — `holes: store actions`.

---

### Task 10: The Holes section

**Files:**
- Modify: `src/document/holes.ts` (presets), `src/panels/Properties.tsx`
- Create: `src/panels/CountField.tsx`, `src/panels/Holes.tsx`
- Test: `src/document/holes.test.ts`, `src/panels/Holes.test.tsx` (create)

**Interfaces:**
- Produces: `defaultHole(board: Board): Omit<HoleRow, 'id'>`, `defaultShelfPinRow(board: Board): Omit<HoleRow, 'id'> | null`,
  `MM = 1 / 25.4` (holes.ts); `CountField`, `Holes` components.

- [ ] **Step 1: Write the failing preset tests** (`holes.test.ts`)

```ts
import { defaultHole, defaultShelfPinRow } from './holes';
describe('presets (spec §7)', () => {
  const sideB = createBoard({ length: 30, width: 11.25, thickness: 0.75 });
  it('shelf-pin row: broad face, along the length, every 32 mm from 2", as many as leave 2" at the far end', () => {
    expect(defaultShelfPinRow(sideB)).toEqual({ face: 'thickness', from: 'max', diameter: 0.25, depth: 0.375, along: 'length', alongFrom: 'min', station: 2, count: 21, pitch: 32 / 25.4, acrossFrom: 'min', inset: 1.5 });
  });
  it('shelf-pin row: null on a part too short for one hole', () => {
    expect(defaultShelfPinRow(createBoard({ length: 3, width: 3, thickness: 0.75 }))).toBeNull();
  });
  it('hole: centred on the broad face, through stock 1/2" or thinner', () => {
    expect(defaultHole(sideB)).toMatchObject({ face: 'thickness', diameter: 0.25, depth: 0.5, station: 15, inset: 5.625, count: 1 });
    expect(defaultHole(createBoard({ length: 12, width: 6, thickness: 0.5 })).depth).toBe('through');
  });
});
```

- [ ] **Step 2: Implement the presets** (`holes.ts`)

```ts
/** Inches per millimetre. 32 mm stores 32 * MM — not rounded. */
export const MM = 1 / 25.4;

/** The broad face: the smallest dimension (a tie goes to the later of DIMENSION_ORDER: thickness, then width). */
function broadFace(b: Pick<Board, Dimension>): Dimension {
  return DIMENSION_ORDER.reduce((best, d) => (b[d] <= b[best] ? d : best), 'length' as Dimension);
}
/** The two others, the longer first (a row runs along the longer). */
function othersOf(b: Pick<Board, Dimension>, face: Dimension): [Dimension, Dimension] {
  const [x, y] = DIMENSION_ORDER.filter((d) => d !== face) as [Dimension, Dimension];
  return b[y] > b[x] ? [y, x] : [x, y];
}

/** "Hole" (spec §7): ¼" dia, ½" deep (through when the face dimension is ½" or less), centred on the broad face. */
export function defaultHole(b: Board): Omit<HoleRow, 'id'> {
  const face = broadFace(b);
  const [along, across] = othersOf(b, face);
  return {
    face, from: 'max', diameter: 0.25, depth: b[face] <= 0.5 ? 'through' : 0.5,
    along, alongFrom: 'min', station: b[along] / 2, count: 1, pitch: 0, acrossFrom: 'min', inset: b[across] / 2,
  };
}

/** "Shelf-pin row" (spec §7): ¼" × ⅜" deep in the broad face, along the longer side from its min end, first at 2",
 *  every 32 mm, as many as leave the last at least 2" from the far end; 1½" in (or centred, on stock under 3" wide).
 *  Null when not even one hole fits. */
export function defaultShelfPinRow(b: Board): Omit<HoleRow, 'id'> | null {
  const face = broadFace(b);
  const [along, across] = othersOf(b, face);
  const pitch = 32 * MM;
  const room = b[along] - 4;
  if (room < 0) return null;
  const count = Math.min(HOLE_COUNT_MAX, Math.floor(room / pitch + 1e-9) + 1);
  return {
    face, from: 'max', diameter: 0.25, depth: 0.375, along, alongFrom: 'min', station: 2, count, pitch,
    acrossFrom: 'min', inset: b[across] >= 3 ? 1.5 : b[across] / 2,
  };
}
```

(`HOLE_COUNT_MAX` and `DIMENSION_ORDER` are in scope. Add `Board` to the type import.) Run the preset tests: PASS.

- [ ] **Step 3: Write the failing panel tests** (`src/panels/Holes.test.tsx`, modelled on `AngleCuts.test.tsx`)

```tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useStore } from '../store/store';
import { createBoard, createDocument } from '../document/document';
import type { Board } from '../document/document';
import { Properties } from './Properties';

const side = (over: Partial<Board> = {}) => createBoard({ id: 'side', name: 'Side', length: 30, width: 11.25, thickness: 0.75, ...over });
const open = (b: Board) => {
  useStore.getState().replaceDocument({ ...createDocument('T'), boards: [b] });
  useStore.getState().selectBoard('side');
  render(<Properties />);
};
const add = async (user: ReturnType<typeof userEvent.setup>, item: string) => {
  await user.click(screen.getByRole('button', { name: '+ Add hole' }));
  await user.click(screen.getByRole('button', { name: item }));
};
const rows = () => (useStore.getState().doc.boards[0] as Board).holes;

describe('the Holes section', () => {
  it('adds a shelf-pin row and shows its bench line', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    expect(rows()[0]).toMatchObject({ count: 21, station: 2 });
    expect(screen.getByText(/^Row of 21 holes 1\/4" dia × 3\/8" deep/)).toBeInTheDocument();
  });
  it('the Angles menu is still "+ Add" (two popovers do not collide)', () => {
    open(side());
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add hole' })).toBeInTheDocument();
  });
  it('refuses a count that runs off the part, keeping the stored count and focus', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    const count = screen.getByLabelText('Count');
    await user.clear(count); await user.type(count, '24{Enter}');
    expect(rows()[0]!.count).toBe(21);
    expect(screen.getByRole('alert')).toHaveTextContent('Puts hole 24 past the length max end');
  });
  it('accepts 23, the most that fit', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    const count = screen.getByLabelText('Count');
    await user.clear(count); await user.type(count, '23{Enter}');
    expect(rows()[0]!.count).toBe(23);
  });
  it('a row a resize faulted shows a note, and an edit that removes the fault is accepted (Review Focus 2)', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    act(() => useStore.getState().updateBoard('side', { length: 26 }));
    expect(rows()[0]!.count).toBe(21);                                     // kept, never trimmed
    // At length 26 hole k (1-based) breaks out when 2 + (k-1)·32mm + 1/8 > 26: k = 20 and 21. The note names the first.
    expect(screen.getByText(/^Hole 20 runs past the length max end at this size\. \(1 more\)$/)).toBeInTheDocument();
    const count = screen.getByLabelText('Count');
    await user.clear(count); await user.type(count, '20{Enter}');      // still faulted (hole 20) but ADDS nothing
    expect(rows()[0]!.count).toBe(20);
  });
  it('Through hides Depth and stores through; unchecking restores a depth', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Hole');
    await user.click(screen.getByLabelText('Through'));
    expect(rows()[0]!.depth).toBe('through');
    expect(screen.queryByLabelText('Depth')).toBeNull();
    await user.click(screen.getByLabelText('Through'));
    expect(rows()[0]!.depth).toBe(0.375);
  });
  it('accepts a metric pitch exactly', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Shelf-pin row');
    const every = screen.getByLabelText('Every');
    await user.clear(every); await user.type(every, '30mm{Enter}');     // 21 holes at 30 mm: last centre 25.6" on 30"
    expect(rows()[0]!.pitch).toBe(30 / 25.4);
  });
  it('withholds a preset that would fault on this part', async () => {
    const user = userEvent.setup();
    open(side({ length: 3, width: 3 }));
    await user.click(screen.getByRole('button', { name: '+ Add hole' }));
    expect(screen.queryByRole('button', { name: 'Shelf-pin row' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hole' })).toBeInTheDocument();
  });
  it('removes a row', async () => {
    const user = userEvent.setup();
    open(side());
    await add(user, 'Hole');
    await user.click(screen.getByRole('button', { name: /Remove hole row/ }));
    expect(rows()).toEqual([]);
  });
});
```

(The numbers above were derived by hand: hole k's centre is `2 + (k-1)·32/25.4`; it breaks out of a 26" part when that
plus the 1/8" radius passes 26, first at k = 20. "Unchecking restores a depth" is Step 5's rule, `board[face] / 2` =
0.375. Re-derive any number that fails before changing it — this plan's numbers are hypotheses.)

- [ ] **Step 4: Implement `CountField.tsx`**

```tsx
import { DimensionField } from './DimensionField';
import { HOLE_COUNT_MAX } from '../document/document';

const parseCount = (text: string): number | null => (/^\s*\d+\s*$/.test(text) ? Number(text.trim()) : null);

/** A whole number of holes, 1 to HOLE_COUNT_MAX (holes spec §7, amended): DimensionField with a whole-number
 *  parse/format, AngleField's pattern — one set of edit rules (invariant 5: refuses, never clamps). */
export function CountField({ label, value, onCommit }: { label: string; value: number; onCommit: (n: number) => void }) {
  return (
    <DimensionField label={label} value={value} onCommit={onCommit} min={1} max={HOLE_COUNT_MAX}
      parse={parseCount} format={String} invalid="Enter a whole number of holes, e.g. 12" />
  );
}
```

- [ ] **Step 5: Implement `Holes.tsx`**

```tsx
import { useState } from 'react';
import { useStore } from '../store/store';
import { acrossOf, defaultHole, defaultShelfPinRow, holeFaults } from '../document/document';
import type { Board, CutFrom, Dimension, HoleFault, HoleRow } from '../document/document';
import { holeFaultText, holeLine } from '../document/holeText';
import { DimensionField } from './DimensionField';
import { CountField } from './CountField';
import { Popover } from './Popover';

const DIMS: Dimension[] = ['length', 'width', 'thickness'];
const cap = (d: string) => d[0]!.toUpperCase() + d.slice(1);
const end = (d: Dimension) => (d === 'length' ? 'end' : 'side');
const edgeName = (e: NonNullable<HoleFault['edge']>) => `the ${e.dim} ${e.side} ${end(e.dim)}`;

/** The refusal for an edit that ADDS a fault (spec §7, amended), worded per kind. */
function refusal(f: HoleFault, r: Omit<HoleRow, 'id'>, rowId: string): string {
  const n = f.index + 1;
  switch (f.kind) {
    case 'breaks-out': return `Puts hole ${n} past ${edgeName(f.edge!)} — move it in, or reduce the count or the spacing first.`;
    case 'off-flat': return `Puts hole ${n} where a cut has removed the wood — move it first.`;
    case 'meets-hole': return `Puts hole ${n} into ${f.other!.row === rowId ? `hole ${f.other!.index + 1}` : `hole ${f.other!.index + 1} of another row`} — move it or widen the spacing first.`;
    case 'too-deep': return `Deeper than the ${r.face} — use Through.`;
  }
}
/** The note for a fault the stored row already has (a later edit caused it), from THE fault words (holeText.ts). */
const note = (f: HoleFault, r: HoleRow) => { const t = holeFaultText(f, r); return `${t[0]!.toUpperCase()}${t.slice(1)} at this size.`; };
const key = (f: HoleFault) => `${f.index}:${f.kind}`;

function HoleRowView({ board, row, precision }: { board: Board; row: HoleRow; precision: number }) {
  const updateHoleRow = useStore((s) => s.updateHoleRow);
  const removeHoleRow = useStore((s) => s.removeHoleRow);
  const [error, setError] = useState<string | null>(null);
  const line = holeLine(board, row, precision);
  const stored = holeFaults(board, row);
  const across = acrossOf(row);
  const set = (patch: Partial<Omit<HoleRow, 'id'>>) => {
    let next: HoleRow = { ...row, ...patch };
    // A face change onto the row's direction swaps the two: the row keeps running along the old face dimension.
    if (next.along === next.face) next = { ...next, along: row.face };
    const had = new Set(stored.map(key));
    const added = holeFaults({ ...board, holes: board.holes.map((r) => (r.id === row.id ? next : r)) }, next).find((f) => !had.has(key(f)));
    if (added) { setError(refusal(added, next, row.id)); return; }
    setError(null);
    const { id: _id, ...rest } = next;
    updateHoleRow(board.id, row.id, rest);
  };
  return (
    <div className="cut">
      <div className="cut-head">
        <span className="cut-label">{row.count === 1 ? 'Hole' : `Row of ${row.count}`}</span>
        <button className="cut-remove" aria-label={`Remove hole row (${line})`} onClick={() => removeHoleRow(board.id, row.id)}>✕</button>
      </div>
      <p className="field-note">{line}</p>
      {stored.length > 0 && <p className="field-note" role="status">{note(stored[0]!, row)}{stored.length > 1 ? ` (${stored.length - 1} more)` : ''}</p>}
      <div className="field-grid field-grid-2">
        <div className="field field-wide">
          <label htmlFor={`hole-face-${row.id}`}>Face</label>
          <select id={`hole-face-${row.id}`} className="input" value={`${row.face}|${row.from}`} onChange={(e) => {
            const [face, from] = e.target.value.split('|') as [Dimension, CutFrom];
            set({ face, from });
          }}>
            {DIMS.flatMap((d) => (['min', 'max'] as const).map((s) => (
              <option key={`${d}|${s}`} value={`${d}|${s}`}>{d === 'length' ? `Length — ${s} end` : `${cap(d)} face — ${s} side`}</option>
            )))}
          </select>
        </div>
        <DimensionField label="Diameter" value={row.diameter} precision={precision} onCommit={(diameter) => set({ diameter })} />
        <div className="field">
          <label htmlFor={`hole-through-${row.id}`}>Through</label>
          <input id={`hole-through-${row.id}`} type="checkbox" checked={row.depth === 'through'}
            onChange={(e) => set({ depth: e.target.checked ? 'through' : board[row.face] / 2 })} />
        </div>
        {row.depth !== 'through' && (
          <DimensionField label="Depth" value={row.depth} precision={precision} onCommit={(depth) => set({ depth })} />
        )}
        <div className="field">
          <label htmlFor={`hole-along-${row.id}`}>Along</label>
          <select id={`hole-along-${row.id}`} className="input" value={row.along} onChange={(e) => set({ along: e.target.value as Dimension })}>
            {DIMS.filter((d) => d !== row.face).map((d) => <option key={d} value={d}>{cap(d)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`hole-from-${row.id}`}>From</label>
          <select id={`hole-from-${row.id}`} className="input" value={row.alongFrom} onChange={(e) => set({ alongFrom: e.target.value as CutFrom })}>
            <option value="min">{`${cap(row.along)} min ${end(row.along)}`}</option>
            <option value="max">{`${cap(row.along)} max ${end(row.along)}`}</option>
          </select>
        </div>
        <DimensionField label="First at" value={row.station} min={0} precision={precision} onCommit={(station) => set({ station })} />
        <CountField label="Count" value={row.count} onCommit={(count) => set({ count })} />
        {row.count > 1 && (
          <DimensionField label="Every" value={row.pitch} precision={Math.max(precision, 64)} onCommit={(pitch) => set({ pitch })} />
        )}
        <DimensionField label="In from" value={row.inset} min={0} precision={precision} onCommit={(inset) => set({ inset })} />
        <div className="field">
          <label htmlFor={`hole-side-${row.id}`}>Side</label>
          <select id={`hole-side-${row.id}`} className="input" value={row.acrossFrom} onChange={(e) => set({ acrossFrom: e.target.value as CutFrom })}>
            <option value="min">{`${cap(across)} min ${end(across)}`}</option>
            <option value="max">{`${cap(across)} max ${end(across)}`}</option>
          </select>
        </div>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/** The Holes section (holes spec §7, as amended): one row per stored HoleRow, and + Add hole ▾. */
export function Holes({ board, precision }: { board: Board; precision: number }) {
  const addHoleRows = useStore((s) => s.addHoleRows);
  // A preset whose default would fault on this part is withheld, not added and refused (AngleCuts' precedent).
  const fits = (r: Omit<HoleRow, 'id'> | null): r is Omit<HoleRow, 'id'> => {
    if (!r) return false;
    const probe = { ...r, id: '__preset' };
    return holeFaults({ ...board, holes: [...board.holes, probe] }, probe).length === 0;
  };
  const hole = defaultHole(board);
  const pins = defaultShelfPinRow(board);
  return (
    <>
      <h3>Holes{board.holes.length > 0 && <span className="h3-count"> · {board.holes.length}</span>}</h3>
      {board.holes.map((row) => <HoleRowView key={row.id} board={board} row={row} precision={precision} />)}
      <Popover className="add-hole" label={<>+ Add hole<span aria-hidden="true"> ▾</span></>} title="Add a hole"
        items={[
          ...(fits(hole) ? [{ label: 'Hole', detail: 'One bore, centred on the broad face', run: () => addHoleRows(board.id, [hole]) }] : []),
          ...(fits(pins) ? [{ label: 'Shelf-pin row', detail: '¼" pins every 32 mm along the length', run: () => addHoleRows(board.id, [pins]) }] : []),
        ]} />
    </>
  );
}
```

> Two checks for the implementer: (1) whether `Popover` renders with an empty `items` list — if it cannot, render
> nothing for the menu when neither preset fits; (2) whether DimensionField takes a `precision` prop under that name
> (`grep -n "precision" src/panels/DimensionField.tsx`). The `Every` field's display at `max(precision, 64)` matches the
> bench line (spec §4.1, amended). Barrel-export `defaultHole`, `defaultShelfPinRow`, `MM`, `holeFaults`, `HoleFault`
> from `document.ts` if Task 3 did not.

- [ ] **Step 6: Mount it** — `Properties.tsx`: `import { Holes } from './Holes';` and
  `<Holes board={board} precision={precision} />` directly after `<AngleCuts … />`.

- [ ] **Step 7: Run, full suite and build** — PASS. Then the existing `AngleCuts.test.tsx` must still pass unchanged
  (the "+ Add" name).

- [ ] **Step 8: Mutate** — remove the `had`/added-fault rule (refuse on ANY fault) → the Review Focus 2 test fails;
  remove `fits()` from the shelf-pin item → the withheld test fails; render `Every` at `precision` → no test fails? (if
  none, add an assertion that the Every field shows `1-17/64"` and re-run). Restore.

- [ ] **Step 9: Commit** — `holes: the Holes section (Hole, Shelf-pin row), Count field`.

---

### Task 11: Live check on the dev server

**Files:**
- Create: `docs/browser-verification-holes.md`, screenshots in `docs/img/holes-*.png`

The viewport has no unit tests by design (CLAUDE.md); the mesh builders are tested in Task 6, the scene here.

- [ ] **Step 1:** `npm run dev -- --port 5180` in the background. Open it in the Playwright browser (the user can
  watch). **Do not clear localStorage on this origin** — delete only what this check creates, by key, afterwards.
- [ ] **Step 2: Drive and record, DOM readouts first:**
  1. New project; add a part 30 × 11¼ × ¾; add a 3/4 × 1/4 dado at 10 (Cuts); add a **Shelf-pin row**: the Properties
     line reads as Task 7's string; the cut list shows the hole line after any angle line.
  2. Screenshot the part from above and at a low angle into the holes: holes are open, walls visible, **no membrane**
     at the dado-floor seam, rims drawn (top and bottom). `docs/img/holes-pins.png`.
  3. Add a **Hole** with Through; look through it from below: the exit rim and an opening.
  4. Tape tool: snap to two hole centres; the readout is the pitch (`1-17/64"`).
  5. Shorten the part to 26: the row is kept, the note shows; set Count 20: accepted.
  6. Group the part, Copy mirrored (More ▾): the copy's row is on the mirrored side. Edit the original's inset: both
     update.
  7. Open Add joinery and Refine: both show the holes refusal; no Repair notice.
  8. **Time a drag.** Add a second shelf-pin row (42 holes on the part). Gizmo-resize the part's length for ~2 s and read
     the frame time with the Performance panel or a `requestAnimationFrame` probe via `browser_evaluate`. `partGeometry`
     caches bodies but NOT the mesh, so every frame re-runs `faceTriangles`, earcut and `holeMesh` (and `holeTouches`
     rebuilds a 50-plane prism per face × hole). The angle-cuts round measured ~17 ms/frame before it added its cache.
     Over ~16 ms: stop, report the number, and propose a cache (e.g. `holePrism` per hole in `partGeometry`, the mesh
     keyed on `geometryKey`) as a follow-up task for the user's decision — do not optimise unmeasured.
  9. Undo back to the empty project; every step one entry.
- [ ] **Step 3:** Record each step's result in `docs/browser-verification-holes.md` (what was checked, what was seen,
  what software GL cannot confirm: shading and grain inside a hole → **the user, on real hardware**, as 26a).
- [ ] **Step 4:** Remove the projects this check created (by id), confirm by reading `sloyd.library.v1`'s index that
  only they went. Stop the dev server.
- [ ] **Step 5: Commit** — `docs: holes chunk 1 — browser verification`.

---

### Task 11b: Rebuild performance (added after the live check)

Inserted 2026-10-14 by the user's decision ("fix before merge") after Task 11 measured 107–580 ms rebuilds of a holed
part. Executed under rulings R10–R16 (the SDD ledger); guarded by `src/viewport/holesPerf.test.ts`.

### Task 12: Record and merge

- [ ] **Step 1: Final review.** Dispatch a whole-branch review (superpowers:requesting-code-review) against the spec and
  this plan. Findings that conflict with the spec are the user's decision (CLAUDE.md working agreements).
- [ ] **Step 2: Records.**
  - `CLAUDE.md`: Status (chunk 1 merged, schema 16, rollback note: rolling back below 16 strands every project saved
    since — export first); one row in "Rounds shipped"; the Versioning table's `15→16` row and `CURRENT_VERSION` 16; the
    file index (`holes.ts`, `holeFaults.ts`, `holeText.ts`, `holedRefusal.ts`, `Holes.tsx`, `CountField.tsx`); the
    invariants amended per spec §10 (2, 15, 16, 38, 40, 44, 47, and new **50**), condensed; the test count under Commands.
  - `docs/history.md`: the round's narrative (what shipped, the planning amendments, what the browser pass could and could
    not confirm).
  - `docs/follow-ups.md`: new entries for chunk 2 (drawings, Hinge cup), spec §11's list, and anything the reviews or
    the live check deferred.
  - `docs/feature-gaps.md` §1 Holes: "chunk 1 merged 2026-10-14 (schema 16)".
- [ ] **Step 3: Merge.** `git checkout master && git merge --no-ff holes`, run `npm test && npm run build` on the merged
  tree, `git branch -d holes`.
- [ ] **Step 4: Deploy is a separate decision.** Ask the user before `docker compose up -d --build`; follow
  `DEPLOYMENT.local.md` and the deployment rule (bundle hash at the edge and in-network, CSP header, page load only).
