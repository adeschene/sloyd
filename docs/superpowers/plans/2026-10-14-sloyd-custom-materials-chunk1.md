# Custom materials — chunk 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users define their own solid and sheet materials in a browser library, pick them in any project, price them, and every project file carries the custom materials it uses (schema 15); Refine keeps them.

**Architecture:** A custom material is document data (`doc.materials`, pruned to what parts and shapes use) and library data (`sloyd.materials.v1`). Its KIND is encoded in its id (`m-s-…`, `m-v-…`, `m-p-…`), so every kind-only reader (`isSheetGood`, grain family, `hasGrain`, shop validation) stays a pure function of the id; only label, colour and sheet size need a `MaterialCatalog` (built-ins + `doc.materials`, memoised on the array's identity). The Lumber & prices dialog becomes Materials & prices, driven by a pure draft/plan module; one Save = one undo entry + a library write + a prices write.

**Tech Stack:** TypeScript, React, Zustand, Vitest + Testing Library, react-three-fiber (viewport: no unit tests by design).

**Spec:** `docs/superpowers/specs/2026-10-14-sloyd-custom-materials-design.md` (chunk 1 = §8 item 1). Task 1 records three amendments in it, marked.

## Global Constraints

- `CURRENT_VERSION` becomes **15**. `doc.materials` is required on `SloydDocument`; absent on load → `[]`.
- Custom id: **`/^m-([svp])-[a-z0-9]{4,32}$/`** — `s` solid, `v` sheet-veneered, `p` sheet-plain. Never a built-in key, never contains `/`.
- Colour stored as lowercase `#rrggbb`. Labels trimmed; compared **trimmed, case-insensitive**.
- Library key **`sloyd.materials.v1`**, value `{ layout: 1, materials: CustomMaterial[] }`. Reading never writes.
- Built-in `MATERIALS` keys and order unchanged. **Generate's schema is byte-identical** to today's `DESIGN_SCHEMA`.
- Invariant 47: nothing that writes a definition runs while exploded; Properties is already inside the `edit-lock` fieldset.
- Every refusal is decided before any write ("refuses, never clamps").
- `npm run build` is the typecheck gate (`npm test` does not typecheck). Run both before every commit that touches types.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch `custom-materials-1`; no pull requests.
- Mutation-test every refusal, ordering and "exact" test (break the code, see red, restore) — record it in the commit body.

## Review Focus

1. **An imported file's "Ash" beside a library "Ash" (different ids)** — the picker shows one "Ash" (the project's), and "Add to library" on it is refused until one is renamed. Pinned in Task 6 and Task 8.
2. **Undo after "New material…" assigned a new material to the selection** — ONE undo restores the old material on the parts AND drops the copy from `doc.materials`. Pinned in Task 5.
3. **Dialog opened over the cut list, then the view is exploded** (or opened while exploded) — definition controls disabled, Save writes prices only, no half-applied Save. Pinned in Task 7.
4. **A linked (shaped) part set to a library-only material** — the Shape takes the id and `doc.materials` keeps the copy (uses are read from shapes too). Pinned in Task 1 and Task 5.
5. **The library write fails after the project edit** — the dialog reports it and stays open; the project change stands; a second Save adds no undo entry. Pinned in Task 7.

---

### Task 1: The material model — kinds by id, validation, catalog, pruning

**Files:**
- Modify: `src/document/types.ts:125` (Board.material comment), `:256-284` (`MATERIALS`, `isSheetGood`; `sheetStockOf` stays until Task 3)
- Create: `src/document/materials.ts`
- Test: `src/document/materials.test.ts`
- Modify: `src/document/document.ts:16-29` (barrel: `export * from './materials'`)
- Modify: `docs/superpowers/specs/2026-10-14-sloyd-custom-materials-design.md` (amendments)

**Interfaces:**
- Produces (types.ts): `type MaterialKind = 'solid' | 'sheet-veneered' | 'sheet-plain'`; `interface CustomMaterial { id: string; label: string; color: string; kind: MaterialKind; nominal?: true; sheet?: { length: number; width: number } }`; `CUSTOM_MATERIAL_ID: RegExp`; `isCustomMaterialId(id: string): boolean`; `materialKind(id: string): MaterialKind`; `isSheetGood(id: string): boolean` (now `materialKind(id) !== 'solid'`). `SloydDocument` is NOT changed here (Task 2 adds `materials`), so this task builds green on its own.
- Produces (materials.ts): `mintMaterialId(kind, taken?, random?) : string`; `validateCustomMaterial(raw: unknown): CustomMaterial | null`; `validateCustomMaterials(raw: unknown): CustomMaterial[]`; `sameMaterial(a, b): boolean`; `interface MaterialInfo { id; label; color; kind; nominal: boolean; sheet?: SheetStock; builtIn: boolean }`; `interface MaterialCatalog { get(id): MaterialInfo | undefined; ids: readonly string[]; label(id): string; color(id): string }`; `builtInCatalog(): MaterialCatalog`; `catalogOf(doc: { materials: readonly CustomMaterial[] }): MaterialCatalog`; `type MaterialDoc = Pick<SloydDocument, 'boards' | 'definitions' | 'shapes'> & { materials: CustomMaterial[] }`; `materialUses(doc: Pick<SloydDocument, 'boards' | 'definitions' | 'shapes'>): Set<string>`; `pruneMaterials<T extends MaterialDoc>(doc: T): T`; `upsertMaterials<T extends MaterialDoc>(doc: T, ms: readonly CustomMaterial[]): T`; `BUILT_IN_MATERIAL_IDS: ReadonlySet<string>`; `labelKey(label: string): string` (trim + lower-case).

- [ ] **Step 1: Branch and record the spec amendments**

```bash
git checkout -b custom-materials-1
```

In the spec, add under the Status line: `**Amended while planning (2026-10-14), marked "(amended)":** §2.2 the id encodes the kind; §2.5 shop validation by id; §4.1 entry points; §6 joinery prompt names.` Then:
- §2.2, replace the `id` comment and bullets with: `id: string; // 'm-' + kind letter (s solid, v sheet-veneered, p sheet-plain) + '-' + 4–32 [a-z0-9]` and add a bullet: **(amended)** *The kind is part of the identity (it is fixed at creation), so every reader that needs only the kind — sheet or not, grain family, whether a groove follows grain, shop validation — reads it off the id and needs no catalog. A stored `kind` that disagrees with its id drops the entry.*
- §2.5: replace "`validateShop` takes the catalog … carried untouched in `extra`" and the three rules with: **(amended)** *`validateShop` knows an id when it is built-in or has the custom-id shape, and validates its entry by the id's kind; anything else is carried untouched in `extra`. The known set no longer depends on the open project, so an id never moves between `materials` and `extra`.*
- §3: after "Every reader of a material takes a catalog", add **(amended)** *— every reader of a label, colour or sheet size. Kind-only readers keep their `(id)` signatures (§2.2).*
- §4.1: replace "More ▾ → "Materials & prices…"" with **(amended)** *reached where Lumber & prices is today — the Settings dialog's link and the cut list's button, both renamed "Materials & prices…"*.
- §6, joinery bullet: **(amended)** *prints a custom material's label; a built-in keeps its key, so existing joinery prompts are byte-identical.*

- [ ] **Step 2: Write the failing tests** — `src/document/materials.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_MATERIAL_IDS, builtInCatalog, catalogOf, materialUses, mintMaterialId, pruneMaterials,
  sameMaterial, upsertMaterials, validateCustomMaterial, validateCustomMaterials,
} from './materials';
import { MATERIALS, isSheetGood, materialKind, isCustomMaterialId, type CustomMaterial } from './types';
import { createBoard, createDocument } from './document';

const ash: CustomMaterial = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' };
const birch: CustomMaterial = { id: 'm-v-bb55', label: 'Baltic birch 5×5', color: '#e8d8b8', kind: 'sheet-veneered', sheet: { length: 60, width: 60 } };
const hardboard: CustomMaterial = { id: 'm-p-hb48', label: 'Hardboard', color: '#7a5a3a', kind: 'sheet-plain', sheet: { length: 96, width: 48 } };

describe('material kinds come from the id', () => {
  it('reads built-ins off MATERIALS and customs off the id letter', () => {
    expect(materialKind('pine')).toBe('solid');
    expect(materialKind('plywood')).toBe('sheet-veneered');
    expect(materialKind('mdf')).toBe('sheet-plain');
    expect(materialKind('m-s-ash1')).toBe('solid');
    expect(materialKind('m-v-bb55')).toBe('sheet-veneered');
    expect(materialKind('m-p-hb48')).toBe('sheet-plain');
    expect(materialKind('nonsense')).toBe('solid');
    expect(isSheetGood('m-v-bb55')).toBe(true);
    expect(isSheetGood('m-s-ash1')).toBe(false);
  });
  it('rejects ids that are not the custom shape', () => {
    for (const id of ['pine', 'm-x-abcd', 'm-s-ab', 'm-s-ABCD', 'm-s-ab/cd', `m-s-${'a'.repeat(33)}`]) {
      expect(isCustomMaterialId(id)).toBe(false);
    }
  });
  it('mints the kind letter and never a taken id', () => {
    const seq = [0.123456789, 0.123456789, 0.987654321];
    const id = mintMaterialId('sheet-plain', new Set([mintMaterialId('sheet-plain', new Set(), () => 0.123456789)]), () => seq.shift()!);
    expect(id).toMatch(/^m-p-[a-z0-9]{4,32}$/);
    expect(id).not.toBe(mintMaterialId('sheet-plain', new Set(), () => 0.123456789));
  });
});

describe('validateCustomMaterial', () => {
  it('keeps a good entry, trimming the label and lower-casing the colour', () => {
    expect(validateCustomMaterial({ ...ash, label: '  Ash ', color: '#D8C8A8' })).toEqual(ash);
    expect(validateCustomMaterial(birch)).toEqual(birch);
  });
  it.each([
    ['not an object', 'ash'],
    ['no id', { ...ash, id: undefined }],
    ['a built-in key as id', { ...ash, id: 'pine' }],
    ['a slash in the id', { ...ash, id: 'm-s-a/b1' }],
    ['kind disagrees with the id', { ...ash, kind: 'sheet-plain' }],
    ['empty label', { ...ash, label: '   ' }],
    ['bad colour', { ...ash, color: 'red' }],
    ['sheet kind without a size', { ...birch, sheet: undefined }],
    ['sheet size not positive', { ...birch, sheet: { length: 0, width: 60 } }],
  ])('drops %s', (_, raw) => {
    expect(validateCustomMaterial(raw)).toBeNull();
  });
  it('normalises fields that do not belong to the kind, keeping the entry', () => {
    expect(validateCustomMaterial({ ...birch, nominal: true })).toEqual(birch);
    expect(validateCustomMaterial({ ...ash, sheet: { length: 96, width: 48 } })).toEqual(ash);
    expect(validateCustomMaterial({ ...ash, nominal: true })).toEqual({ ...ash, nominal: true });
    expect(validateCustomMaterial({ ...ash, nominal: 'yes' })).toEqual(ash);
  });
  it('keeps the FIRST of a duplicate id and drops a non-array', () => {
    expect(validateCustomMaterials([ash, { ...ash, label: 'Other' }, birch])).toEqual([ash, birch]);
    expect(validateCustomMaterials('nope')).toEqual([]);
  });
});

describe('the catalog', () => {
  it('lists the built-ins in MATERIALS order, then the document materials', () => {
    expect(builtInCatalog().ids).toEqual(Object.keys(MATERIALS));
    expect(catalogOf({ materials: [ash, birch] }).ids).toEqual([...Object.keys(MATERIALS), 'm-s-ash1', 'm-v-bb55']);
  });
  it('gives a custom sheet its rotate rule from its kind', () => {
    const c = catalogOf({ materials: [birch, hardboard] });
    expect(c.get('m-v-bb55')!.sheet).toEqual({ length: 60, width: 60, rotate: 'grain' });
    expect(c.get('m-p-hb48')!.sheet).toEqual({ length: 96, width: 48, rotate: 'free' });
    expect(c.get('plywood')!.builtIn).toBe(true);
    expect(c.get('m-v-bb55')!.builtIn).toBe(false);
  });
  it('labels an unknown id with the raw id and colours it as pine', () => {
    const c = builtInCatalog();
    expect(c.label('m-s-gone')).toBe('m-s-gone');
    expect(c.color('m-s-gone')).toBe(MATERIALS.pine!.color);
  });
  it('is memoised on the materials array identity', () => {
    const materials = [ash];
    expect(catalogOf({ materials })).toBe(catalogOf({ materials }));
    expect(catalogOf({ materials: [ash] })).not.toBe(catalogOf({ materials }));
  });
  it('never lets a custom entry shadow a built-in', () => {
    expect(BUILT_IN_MATERIAL_IDS.has('pine')).toBe(true);
    expect(catalogOf({ materials: [{ ...ash, id: 'pine' } as CustomMaterial] }).label('pine')).toBe('Pine');
  });
});

describe('uses, pruning and upserts', () => {
  const docWith = (boardMaterials: string[], materials: CustomMaterial[]) => ({
    ...createDocument(),
    boards: boardMaterials.map((m, i) => createBoard({ id: `b${i}`, name: `P${i}`, material: m })),
    materials,
  });
  it('reads uses from plain parts, definition parts and shapes', () => {
    const d = docWith(['m-s-ash1'], [ash, birch, hardboard]);
    const withDef = { ...d, definitions: [{ id: 'd1', boards: [createBoard({ id: 'q', material: 'm-v-bb55' })], instances: [] }] };
    const shape = { id: 's1', ...createBoard({ material: 'm-p-hb48' }) };
    const { id: _i, name: _n, position: _p, rotation: _r, ...shared } = shape;
    const withShape = { ...withDef, shapes: [{ ...shared, id: 's1' }] };
    expect(materialUses(withShape)).toEqual(new Set(['m-s-ash1', 'm-v-bb55', 'm-p-hb48']));
  });
  it('prunes unused materials and returns the SAME object when nothing is unused', () => {
    const d = docWith(['m-s-ash1'], [ash, birch]);
    expect(pruneMaterials(d).materials).toEqual([ash]);
    const kept = docWith(['m-s-ash1'], [ash]);
    expect(pruneMaterials(kept)).toBe(kept);
  });
  it('upserts by id, appending new ones and returning the SAME object when nothing changes', () => {
    const d = docWith([], [ash]);
    expect(upsertMaterials(d, [ash])).toBe(d);
    expect(upsertMaterials(d, [{ ...ash, color: '#000000' }]).materials).toEqual([{ ...ash, color: '#000000' }]);
    expect(upsertMaterials(d, [birch]).materials).toEqual([ash, birch]);
  });
  it('compares materials field by field', () => {
    expect(sameMaterial(ash, { ...ash })).toBe(true);
    expect(sameMaterial(birch, { ...birch, sheet: { length: 60, width: 61 } })).toBe(false);
    expect(sameMaterial(ash, { ...ash, nominal: true })).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run src/document/materials.test.ts`
Expected: FAIL — `Cannot find module './materials'`.

- [ ] **Step 4: Implement** — in `src/document/types.ts`, replace the `MATERIALS` doc and below (`:256-288`) with:

```ts
export const MATERIALS: Record<string, { label: string; color: string; sheet?: SheetStock }> = {
  // (the seven entries, unchanged)
};

export const DEFAULT_MATERIAL = 'pine';

/** Inches. A standard table-saw blade. */
export const DEFAULT_KERF = 0.125;

/** How a material is made, fixed at creation (custom materials spec §2.2). */
export type MaterialKind = 'solid' | 'sheet-veneered' | 'sheet-plain';

/**
 * A user-defined material (custom materials spec §2.2). Stored in the document (`materials`) and in the
 * browser library. The KIND is encoded in the id (amended §2.2), so a kind-only reader never needs a catalog.
 */
export interface CustomMaterial {
  id: string;
  label: string;
  /** Lower-case `#rrggbb`. */
  color: string;
  kind: MaterialKind;
  /** Sold in nominal sizes (chunk 2 reads it). Solid only; stored only when true. */
  nominal?: true;
  /** Inches. Present exactly when `kind` is a sheet kind. */
  sheet?: { length: number; width: number };
}

/** `m-` + kind letter + `-` + 4–32 of [a-z0-9]: never a built-in key, never a `/`. */
export const CUSTOM_MATERIAL_ID = /^m-([svp])-[a-z0-9]{4,32}$/;
const LETTER_KIND: Record<string, MaterialKind> = { s: 'solid', v: 'sheet-veneered', p: 'sheet-plain' };

export function isCustomMaterialId(id: string): boolean {
  return CUSTOM_MATERIAL_ID.test(id);
}

/**
 * The kind of any material id: a custom one by its letter, a built-in by its `sheet` (MDF's free rotation is
 * the plain kind). Anything else reads as solid — the pine fallback (a part cannot carry one after load).
 */
export function materialKind(id: string): MaterialKind {
  const m = CUSTOM_MATERIAL_ID.exec(id);
  if (m) return LETTER_KIND[m[1]!]!;
  const sheet = Object.hasOwn(MATERIALS, id) ? MATERIALS[id]!.sheet : undefined;
  if (sheet === undefined) return 'solid';
  return sheet.rotate === 'free' ? 'sheet-plain' : 'sheet-veneered';
}

/**
 * Sheet goods are a different domain thing from solid stock: their "grain" is a face-veneer direction that
 * always lies in the sheet plane, so 'Through thickness' is not a meaningful value for one — see grainFamily
 * in viewport/grainFaces.ts. A fact about the material's KIND, read off its id.
 */
export function isSheetGood(material: string): boolean {
  return materialKind(material) !== 'solid';
}
```

Keep `sheetStockOf` as it is (Task 3 replaces its callers and deletes it). Change `Board.material`'s comment to `/** A built-in MATERIALS key or a custom material id (custom materials spec §2.2). */`. Do NOT touch `SloydDocument` here.

Create `src/document/materials.ts`:

```ts
import {
  DEFAULT_MATERIAL, MATERIALS, isCustomMaterialId, materialKind,
  type Board, type CustomMaterial, type MaterialKind, type SheetStock, type SloydDocument, type StoredBoard,
} from './types';

/** What pruning and upserting need. Structural, so this module builds before `SloydDocument` has `materials`. */
export type MaterialDoc = Pick<SloydDocument, 'boards' | 'definitions' | 'shapes'> & { materials: CustomMaterial[] };

/** Everything a page shows about one material (custom materials spec §3). */
export interface MaterialInfo {
  id: string;
  label: string;
  color: string;
  kind: MaterialKind;
  nominal: boolean;
  sheet?: SheetStock;
  builtIn: boolean;
}

/** Built-ins + one document's custom materials. Labels, colours and sheet sizes come only from here. */
export interface MaterialCatalog {
  get(id: string): MaterialInfo | undefined;
  /** Built-ins in MATERIALS order, then the document's, in stored order. */
  ids: readonly string[];
  /** The raw id for an unknown one (a code-built part), never `undefined` on a page. */
  label(id: string): string;
  /** Pine's colour for an unknown one, as BoardMesh always fell back. */
  color(id: string): string;
}

export const BUILT_IN_MATERIAL_IDS: ReadonlySet<string> = new Set(Object.keys(MATERIALS));

const KIND_LETTER: Record<MaterialKind, string> = { solid: 's', 'sheet-veneered': 'v', 'sheet-plain': 'p' };
const COLOR = /^#[0-9a-fA-F]{6}$/;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Trimmed and lower-cased: the one way two labels are compared (spec §4.1). */
export const labelKey = (label: string) => label.trim().toLowerCase();

/** A fresh custom id of this kind, not in `taken`. Random so two browsers cannot collide by accident (§2.2). */
export function mintMaterialId(kind: MaterialKind, taken: ReadonlySet<string> = new Set(), random: () => number = Math.random): string {
  for (;;) {
    const body = random().toString(36).slice(2, 12).replace(/[^a-z0-9]/g, '').padEnd(8, '0');
    const id = `m-${KIND_LETTER[kind]}-${body}`;
    if (!taken.has(id)) return id;
  }
}

/** One stored entry, or null to drop it (spec §2.3). Fields foreign to the kind are dropped, the entry kept. */
export function validateCustomMaterial(raw: unknown): CustomMaterial | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || !isCustomMaterialId(m.id)) return null;
  const kind = materialKind(m.id);
  if (m.kind !== kind) return null;
  const label = typeof m.label === 'string' ? m.label.trim() : '';
  if (!label) return null;
  if (typeof m.color !== 'string' || !COLOR.test(m.color)) return null;
  const out: CustomMaterial = { id: m.id, label, color: m.color.toLowerCase(), kind };
  if (kind === 'solid') {
    if (m.nominal === true) out.nominal = true;
    return out;
  }
  const s = m.sheet;
  if (typeof s !== 'object' || s === null) return null;
  const { length, width } = s as Record<string, unknown>;
  if (!positive(length) || !positive(width)) return null;
  out.sheet = { length, width };
  return out;
}

/** A list: malformed entries dropped, a duplicate id keeps the FIRST (invariant 33's scope: per list). */
export function validateCustomMaterials(raw: unknown): CustomMaterial[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomMaterial[] = [];
  for (const item of raw) {
    const m = validateCustomMaterial(item);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

export function sameMaterial(a: CustomMaterial, b: CustomMaterial): boolean {
  return a.id === b.id && a.label === b.label && a.color === b.color && a.kind === b.kind &&
    (a.nominal === true) === (b.nominal === true) &&
    a.sheet?.length === b.sheet?.length && a.sheet?.width === b.sheet?.width;
}

const builtInInfo = (id: string): MaterialInfo => {
  const m = MATERIALS[id]!;
  return { id, label: m.label, color: m.color, kind: materialKind(id), nominal: false, ...(m.sheet ? { sheet: m.sheet } : {}), builtIn: true };
};
const customInfo = (m: CustomMaterial): MaterialInfo => ({
  id: m.id, label: m.label, color: m.color, kind: m.kind, nominal: m.nominal === true, builtIn: false,
  ...(m.sheet ? { sheet: { length: m.sheet.length, width: m.sheet.width, rotate: m.kind === 'sheet-plain' ? 'free' : 'grain' } } : {}),
});

function makeCatalog(customs: readonly CustomMaterial[]): MaterialCatalog {
  const map = new Map<string, MaterialInfo>([...BUILT_IN_MATERIAL_IDS].map((id) => [id, builtInInfo(id)]));
  for (const c of customs) if (!map.has(c.id)) map.set(c.id, customInfo(c));
  const ids = [...map.keys()];
  const fallback = map.get(DEFAULT_MATERIAL)!;
  return {
    get: (id) => map.get(id),
    ids,
    label: (id) => map.get(id)?.label ?? id,
    color: (id) => (map.get(id) ?? fallback).color,
  };
}

const BUILT_IN = makeCatalog([]);
const memo = new WeakMap<readonly CustomMaterial[], MaterialCatalog>();

export const builtInCatalog = (): MaterialCatalog => BUILT_IN;

/** Built-ins + `doc.materials`, memoised on the array's identity (every render shares one per document state). */
export function catalogOf(doc: { materials: readonly CustomMaterial[] }): MaterialCatalog {
  let c = memo.get(doc.materials);
  if (!c) {
    c = makeCatalog(doc.materials);
    memo.set(doc.materials, c);
  }
  return c;
}

const plainMaterial = (b: StoredBoard): string | undefined => ('material' in b ? (b as Board).material : undefined);

/** Every material id a stored part (root or definition) or a shape names. */
export function materialUses(doc: Pick<SloydDocument, 'boards' | 'definitions' | 'shapes'>): Set<string> {
  const out = new Set<string>();
  for (const b of [...doc.boards, ...doc.definitions.flatMap((d) => d.boards)]) {
    const m = plainMaterial(b);
    if (m !== undefined) out.add(m);
  }
  for (const s of doc.shapes) out.add(s.material);
  return out;
}

/** Drop custom materials nothing uses (spec §2.3). The SAME object when nothing goes (edit()'s no-op test). */
export function pruneMaterials<T extends MaterialDoc>(doc: T): T {
  const used = materialUses(doc);
  const kept = doc.materials.filter((m) => used.has(m.id));
  return kept.length === doc.materials.length ? doc : { ...doc, materials: kept };
}

/** Replace by id, append new; the SAME object when nothing changes. Unused entries are pruned by edit(). */
export function upsertMaterials<T extends MaterialDoc>(doc: T, ms: readonly CustomMaterial[]): T {
  let materials = doc.materials;
  for (const m of ms) {
    const i = materials.findIndex((x) => x.id === m.id);
    if (i >= 0 && sameMaterial(materials[i]!, m)) continue;
    materials = i >= 0 ? materials.map((x, j) => (j === i ? m : x)) : [...materials, m];
  }
  return materials === doc.materials ? doc : { ...doc, materials };
}
```

Add `export * from './materials';` to the barrel block at the top of `src/document/document.ts`.

- [ ] **Step 5: Run the test, then the build**

Run: `npx vitest run src/document/materials.test.ts` — Expected: PASS.
Run: `npm run build && npx vitest run` — Expected: clean build, every test PASS (nothing outside `materials.ts` reads the new code yet except `isSheetGood`, whose built-in answers are unchanged).

- [ ] **Step 6: Mutate** — change `kept.length === doc.materials.length ? doc` to always return a copy; the "SAME object" test must go red. Drop `if (m.kind !== kind) return null;`; the "kind disagrees" case must go red. Restore both.

- [ ] **Step 7: Commit**

```bash
git add src/document/types.ts src/document/materials.ts src/document/materials.test.ts src/document/document.ts docs/superpowers/specs/2026-10-14-sloyd-custom-materials-design.md
git commit -m "feat(materials): the custom material model — kind by id, validation, catalog, pruning

Mutated: prune identity, kind/id agreement.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Schema 15 — load, create, edit() prunes

**Files:**
- Modify: `src/document/types.ts:195-224` (`SloydDocument` gains `materials`)
- Modify: `src/document/document.ts` (`CURRENT_VERSION` `:130`, `createDocument` `:224-236`, `validateSharedFields` `:415-421`, `validateBoard` `:458`, `validateShapes` `:493`, `validateDefinitions` `:543-553`, `migrateDocument` `:669-771`)
- Modify: `src/store/store.ts:414-421` (`edit`)
- Modify: every `SloydDocument` object literal the build names (tests included): add `materials: []`
- Test: `src/document/document.test.ts` (new `describe('schema 15: custom materials')`), `src/store/store.test.ts`

**Interfaces:**
- Consumes: Task 1's `validateCustomMaterials`, `pruneMaterials`, `BUILT_IN_MATERIAL_IDS`.
- Produces: `CURRENT_VERSION === 15`; `createDocument()` has `materials: []`; `migrateDocument` output always pruned; `validateShapes(raw, known?: ReadonlySet<string>)`; store `edit()` output always pruned.

- [ ] **Step 1: Write the failing tests** — append to `src/document/document.test.ts`:

```ts
describe('schema 15: custom materials (custom materials spec §2.3)', () => {
  const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' };
  const v14 = (over: Record<string, unknown> = {}) => ({
    version: 14, name: 'T', units: { display: 'imperial-fractional', precision: 16 }, stock: { kerf: 0.125 },
    guides: [], instances: [], definitions: [], shapes: [],
    boards: [{ id: 'a', name: 'A', length: 10, width: 4, thickness: 0.75, position: [0, 0, 0], rotation: 0,
      posture: 'flat', grain: 'length', material: 'oak', cuts: [], angleCuts: [] }],
    ...over,
  });
  const part = (material: string) => ({ ...(v14().boards as Record<string, unknown>[])[0]!, material });

  it('is version 15 and a v14 file loads with no materials', () => {
    expect(CURRENT_VERSION).toBe(15);
    const d = migrateDocument(v14());
    expect(d.version).toBe(15);
    expect(d.materials).toEqual([]);
    expect(createDocument().materials).toEqual([]);
  });
  it('keeps a used custom material and the part that names it', () => {
    const d = migrateDocument(v14({ version: 15, materials: [ash], boards: [part('m-s-ash1')] }));
    expect(d.materials).toEqual([ash]);
    expect((d.boards[0] as Board).material).toBe('m-s-ash1');
  });
  it('a part naming a material the file does not carry falls back to pine', () => {
    const d = migrateDocument(v14({ version: 15, materials: [], boards: [part('m-s-ash1')] }));
    expect((d.boards[0] as Board).material).toBe('pine');
  });
  it('a part naming a DROPPED (malformed) material falls back to pine', () => {
    const d = migrateDocument(v14({ version: 15, materials: [{ ...ash, color: 'red' }], boards: [part('m-s-ash1')] }));
    expect((d.boards[0] as Board).material).toBe('pine');
    expect(d.materials).toEqual([]);
  });
  it('validates materials BEFORE parts: a shape and a definition part see them too', () => {
    const shape = { id: 's1', length: 10, width: 4, thickness: 0.75, posture: 'flat', grain: 'length', material: 'm-s-ash1', cuts: [], angleCuts: [] };
    const d = migrateDocument(v14({
      version: 15, materials: [ash],
      boards: [{ id: 'a', name: 'A', position: [0, 0, 0], rotation: 0, shape: 's1' }, { id: 'b', name: 'B', position: [20, 0, 0], rotation: 0, shape: 's1' }],
      shapes: [shape],
    }));
    expect(d.shapes[0]!.material).toBe('m-s-ash1');
    expect(d.materials).toEqual([ash]);
  });
  it('prunes unused entries on load', () => {
    const d = migrateDocument(v14({ version: 15, materials: [ash, { ...ash, id: 'm-s-unused', label: 'Unused' }], boards: [part('m-s-ash1')] }));
    expect(d.materials.map((m) => m.id)).toEqual(['m-s-ash1']);
  });
  it('a duplicate id keeps the first', () => {
    const d = migrateDocument(v14({ version: 15, materials: [ash, { ...ash, label: 'Second' }], boards: [part('m-s-ash1')] }));
    expect(d.materials).toEqual([ash]);
  });
});
```

Append to `src/store/store.test.ts` (use the file's existing reset helper and imports):

```ts
describe('edit() prunes custom materials (custom materials spec §2.3)', () => {
  it('drops a material when its last part changes material, in the same undo entry', () => {
    const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
    const start = { ...createDocument(), boards: [createBoard({ id: 'a', name: 'A', material: 'm-s-ash1' })], materials: [ash] };
    useStore.getState().replaceDocument(start);
    useStore.getState().updateBoard('a', { material: 'oak' });
    expect(useStore.getState().doc.materials).toEqual([]);
    useStore.getState().undo();
    expect(useStore.getState().doc.materials).toEqual([ash]);
    expect((useStore.getState().doc.boards[0] as Board).material).toBe('m-s-ash1');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/document.test.ts -t "schema 15" src/store/store.test.ts -t "prunes custom"`
Expected: FAIL (`CURRENT_VERSION` is 14; `materials` undefined).

- [ ] **Step 3: Implement**

In `types.ts`, add to `SloydDocument` after `shapes`:

```ts
  /** Exactly the custom materials this document's parts and shapes use (custom materials spec §2.3). */
  materials: CustomMaterial[];
```

In `document.ts`: import `validateCustomMaterials, pruneMaterials, BUILT_IN_MATERIAL_IDS` from `./materials` (not via the barrel). Set `export const CURRENT_VERSION = 15;`. In `createDocument` add `materials: [],` after `shapes: []`.

Thread a `known` set (built-in ids + this file's custom ids):

```ts
function validateSharedFields(b: Record<string, unknown>, known: ReadonlySet<string>): { fields: Pick<Board, SharedField> } | { bad: Dimension } {
  // …
  const material =
    typeof b.material === 'string' && known.has(b.material)
      ? b.material
      : DEFAULT_MATERIAL;
```

`validateBoard(raw, index, seen, known: ReadonlySet<string>, legacy?)` passes `known` to `validateSharedFields`; `validateShapes(raw: unknown, known: ReadonlySet<string> = BUILT_IN_MATERIAL_IDS)`; `validateDefinitions(raw, known, legacy?)` passes it to `validateBoard`.

In `migrateDocument`, after `const guides = validateGuides(d.guides);`:

```ts
  // Schema 15 (custom materials spec §2.3): document-level, no step. Validated BEFORE the parts, so a part,
  // a definition part or a shape naming a custom material this file carries keeps it; any other unknown
  // material falls back to pine, as before.
  const materials = validateCustomMaterials(d.materials);
  const known = new Set([...BUILT_IN_MATERIAL_IDS, ...materials.map((m) => m.id)]);
```

Pass `known` at `rawBoards.map((b, i) => validateBoard(b, i, boardIds, known, legacy))`, `validateDefinitions(d.definitions, known, legacy)`, `validateShapes(d.shapes, known)`; add `materials,` to the `doc` literal after `shapes`; end with:

```ts
  return pruneMaterials(dissolveShapes(pruneShapes(dropUnresolved(doc))));
```

Add a Versioning comment line above `CURRENT_VERSION` in the file's existing history list: `14 -> 15: \`materials\` (custom materials spec §2.3); document-level, no step. Harm a v14 build would do: a custom material silently becomes pine.`

In `store.ts` `edit`: import `pruneMaterials` with the other document imports, and change `const next = fn(doc);` to:

```ts
    // Custom materials (spec §2.3): a document carries exactly what it uses. The SAME object when nothing
    // was unused, so the no-op test below still sees an unchanged document.
    const next = pruneMaterials(fn(doc));
```

- [ ] **Step 4: Fix every literal the build names**

Run: `npm run build 2>&1 | grep -E "error TS"`
For each `Property 'materials' is missing` site, add `materials: []` beside its `shapes:` key (or `materials: doc.materials` where the literal copies another document's fields — read each site; a literal built from `...doc` already carries it). Repeat until the build is clean.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run` — Expected: PASS except any test asserting `version: 14` / `CURRENT_VERSION` 14 literally: update those to 15 (they assert the current version, not v14 behaviour — read each before changing; a test of a v14 FILE keeps its input version).

- [ ] **Step 6: Mutate** — revert `known.has` to `Object.hasOwn(MATERIALS, …)`: "keeps a used custom material" must go red. Remove `pruneMaterials` from `edit`: the store test must go red. Restore.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat(materials): schema 15 — doc.materials validated before parts, pruned on load and in edit()

Mutated: known-set lookup, edit() prune.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Readers — cut list, Buying, shop validation, diff, grain, viewport colour

**Files:**
- Modify: `src/document/cutlist.ts:76-133, :285-385`; `src/panels/CutList.tsx:157`
- Modify: `src/document/purchase.ts:40-110, :228-236`
- Modify: `src/document/designDiff.ts:46, :95`
- Modify: `src/document/cuts.ts:592-599` (`hasGrain`)
- Modify: `src/viewport/grainFaces.ts:53-56` (`grainFamily`)
- Modify: `src/viewport/BoardMesh.tsx:6, :85-91` (a `color` prop); `src/viewport/Viewport.tsx:79, :488-499`
- Modify: `src/generate/joints/choose.ts:60-63`
- Test: `src/document/cutlist.test.ts`, `src/document/purchase.test.ts`, `src/document/designDiff.test.ts`, `src/viewport/grainFaces.test.ts` (create if absent), `src/generate/joints/choose.test.ts`

**Interfaces:**
- Consumes: `catalogOf`, `materialKind`, `isCustomMaterialId`, `CustomMaterial`.
- Produces: `CutListGroup.sheet?: SheetStock` (present exactly when `nesting` is); `validateShop` knows built-in AND custom-shaped ids; `defaultBuying(id)` by kind; BoardMesh prop `color: string`.

- [ ] **Step 1: Write the failing tests**

`cutlist.test.ts`:

```ts
describe('custom materials (custom materials spec §3)', () => {
  const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
  const birch = { id: 'm-v-bb55', label: 'Baltic birch 5×5', color: '#e8d8b8', kind: 'sheet-veneered' as const, sheet: { length: 60, width: 60 } };
  const doc = (boards: Board[], materials = [ash, birch]) => ({ ...createDocument(), boards, materials }) as FlatDocument;

  it('labels a custom group and counts it in board feet', () => {
    const list = buildCutList(doc([createBoard({ id: 'a', name: 'A', material: 'm-s-ash1', length: 12, width: 12, thickness: 1 })]));
    expect(list.groups[0]!.label).toMatch(/^Ash — /);
    expect(list.groups[0]!.stock).toMatch(/bd ft/);
    expect(list.groups[0]!.sheet).toBeUndefined();
  });
  it('nests a custom sheet on ITS sheet size', () => {
    const list = buildCutList(doc([createBoard({ id: 'a', name: 'A', material: 'm-v-bb55', length: 50, width: 50, thickness: 0.5 })]));
    const g = list.groups[0]!;
    expect(g.sheet).toEqual({ length: 60, width: 60, rotate: 'grain' });
    expect(g.nesting!.sheets).toHaveLength(1);
    // A 50 × 50 part fits a 60 × 60 sheet; on a 96 × 48 sheet it would not.
    expect(g.nesting!.unplaceable).toHaveLength(0);
  });
  it('sorts groups by LABEL, so Ash sorts before Oak', () => {
    const list = buildCutList(doc([createBoard({ id: 'o', name: 'O', material: 'oak' }), createBoard({ id: 'a', name: 'A', material: 'm-s-ash1' })]));
    expect(list.groups.map((g) => g.material)).toEqual(['m-s-ash1', 'oak']);
  });
});
```

`purchase.test.ts`:

```ts
describe('custom materials in the shop (custom materials spec §2.5, amended)', () => {
  it('defaults a custom solid to board feet and a custom sheet to sheets', () => {
    expect(defaultBuying('m-s-ash1')).toEqual({ mode: 'board-foot', pricePerBoardFoot: null, wasteFactor: 1.3 });
    expect(defaultBuying('m-p-hb48')).toEqual({ mode: 'sheet', pricePerSheet: null });
  });
  it('validates a custom id by its kind and keeps it in materials, never in extra', () => {
    const { settings, ok } = validateShop({ layout: 1, materials: {
      'm-s-ash1': { mode: 'board-foot', pricePerBoardFoot: 9, wasteFactor: 1.4 },
      'm-p-hb48': { mode: 'sheet', pricePerSheet: 22 },
      'future-key': { anything: true },
    } });
    expect(ok).toBe(true);
    expect(settings.materials['m-s-ash1']).toEqual({ mode: 'board-foot', pricePerBoardFoot: 9, wasteFactor: 1.4 });
    expect(settings.materials['m-p-hb48']).toEqual({ mode: 'sheet', pricePerSheet: 22 });
    expect(settings.extra).toEqual({ 'future-key': { anything: true } });
  });
  it('a custom entry of the wrong mode for its kind takes its default and flags the read', () => {
    const { settings, ok } = validateShop({ layout: 1, materials: { 'm-p-hb48': { mode: 'board-foot', pricePerBoardFoot: 3, wasteFactor: 1.3 } } });
    expect(ok).toBe(false);
    expect(settings.materials['m-p-hb48']).toEqual({ mode: 'sheet', pricePerSheet: null });
  });
  it('labels a custom material in Buying by the catalog', () => {
    const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
    const d = { ...createDocument(), boards: [createBoard({ id: 'a', name: 'A', material: 'm-s-ash1' })], materials: [ash] } as FlatDocument;
    const p = buildPurchase(d, buildCutList(d), defaultShop());
    expect(p.entries[0]!.label).toBe('Ash');
    expect(p.entries[0]!.mode).toBe('board-foot');
  });
});
```

`designDiff.test.ts`: a part changed from `oak` to a custom `m-s-ash1` (carried in `after.materials`) produces the change text `': Oak → Ash'`; a custom → built-in change reads the custom label from `before.materials`.

`grainFaces.test.ts`:

```ts
it('reads the family off the kind (custom materials spec §3)', () => {
  expect(grainFamily('oak')).toBe('wood');
  expect(grainFamily('plywood')).toBe('plywood');
  expect(grainFamily('mdf')).toBe('mdf');
  expect(grainFamily('m-s-ash1')).toBe('wood');
  expect(grainFamily('m-v-bb55')).toBe('plywood');
  expect(grainFamily('m-p-hb48')).toBe('mdf');
});
```

`choose.test.ts`: `siteMessage` on a document whose part is `m-s-ash1` (with `materials: [ash]`) contains `(Ash)`; on a built-in `oak` part it still contains `(oak)` (byte-identical for existing projects).

`cuts` (`hasGrain` via `cutShape`): in `src/document/cuts.test.ts`, a channel running along the grain of a `m-p-hb48` part is a `dado`-family word, not `groove` (plain sheets have no grain), and on `m-v-bb55` it is a `groove`. Copy the existing MDF-vs-plywood groove test in that file and swap the material ids.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/document/cutlist.test.ts src/document/purchase.test.ts src/document/designDiff.test.ts src/viewport/grainFaces.test.ts src/generate/joints/choose.test.ts src/document/cuts.test.ts`
Expected: FAIL (labels print raw ids; custom sheet not nested; `m-s-…` lands in `extra`).

- [ ] **Step 3: Implement**

`cutlist.ts`: import `catalogOf` from `./materials`; replace the `materialLabel` function and its comment with nothing; at the top of `buildCutList`: `const catalog = catalogOf(doc);`. Group label: `` `${catalog.label(board.material)} — ${formatLength(board.thickness, precision)}` ``. Add to `CutListGroup`, after `nesting?`:

```ts
  /** The sheet this group nests on — present exactly when `nesting` is (custom materials spec §3). */
  sheet?: SheetStock;
```

Replace `const sheet = sheetStockOf(group.material);` with `const sheet = catalog.get(group.material)?.sheet;` and inside `if (sheet)` add `group.sheet = sheet;`. Sort by `catalog.label(a.material).localeCompare(catalog.label(b.material))`. Update the import line (`MATERIALS`, `sheetStockOf` gone; `isSheetGood` stays; import `type SheetStock`).

`CutList.tsx:157`: `<SheetLayout nesting={group.nesting} stock={group.sheet!} />`. Then delete `sheetStockOf` from `types.ts` (its two callers are gone; `npm run build` confirms no other).

`purchase.ts`: import `isCustomMaterialId` from `./types` and `catalogOf` from `./materials`. In `validateShop`:

```ts
  // Known = built-in OR custom-shaped (amended §2.5): the kind is in the id, so a custom entry validates
  // without knowing which project is open, and an id never moves between `materials` and `extra`.
  const known = (k: string) => k in MATERIALS || isCustomMaterialId(k);
  const extra = Object.fromEntries(Object.entries(stored).filter(([k]) => !known(k)));
  for (const m of Object.keys(MATERIALS)) { /* unchanged */ }
  for (const m of Object.keys(stored).filter(isCustomMaterialId)) {
    const v = validateBuying(m, stored[m]);
    if (!v) ok = false;
    materials[m] = v ?? defaultBuying(m);
  }
```

Update `ShopSettings.extra`'s comment: "Stored entries for ids this build cannot recognise as a material (neither built-in nor custom-shaped)…". In `buildPurchase`: `const catalog = catalogOf(doc);` and `const label = catalog.label(m);`. `defaultBuying` needs no change (it branches on `isSheetGood`, which now reads custom kinds; `material === 'pine'` stays the only by-the-piece default in chunk 1).

`designDiff.ts`: replace `const label = (m: string) => MATERIALS[m]?.label ?? m;` with a per-call lookup inside `diffDesigns`:

```ts
  const ca = catalogOf(after);
  const cb = catalogOf(before);
  const label = (m: string) => ca.get(m)?.label ?? cb.get(m)?.label ?? m;
```

(move the material-change line's use accordingly; drop the `MATERIALS` import).

`cuts.ts`:

```ts
/** Whether a material has a grain direction for `groove` to follow: every kind but a plain sheet (MDF, hardboard). */
function hasGrain(material: string): boolean {
  return materialKind(material) !== 'sheet-plain';
}
```

(import `materialKind` from `./types`; drop `MATERIALS` if unused).

`grainFaces.ts`:

```ts
export function grainFamily(material: string): GrainFamily {
  const kind = materialKind(material);
  return kind === 'solid' ? 'wood' : kind === 'sheet-veneered' ? 'plywood' : 'mdf';
}
```

Update its doc comment's last sentence to say the family is read off the material's kind (`materialKind`), built-in or custom.

`BoardMesh.tsx`: add to `Props`:

```ts
  /** The material's colour, from the document's catalog (custom materials spec §3) — Viewport reads it. */
  color: string;
```

destructure `color` and delete the `const color = (MATERIALS[…]` line and the now-unused imports. `Viewport.tsx`: `const catalog = useStore((s) => catalogOf(s.doc));` beside line 79 (import `catalogOf` from `../document/document`), and pass `color={catalog.color(board.material)}` on `<BoardMesh>`.

`choose.ts` `siteMessage`: `const catalog = catalogOf(doc);` and print `` `(${catalog.get(b.material)?.builtIn === false ? catalog.label(b.material) : b.material})` `` — a built-in keeps its key so existing prompts are byte-identical (amended §6).

- [ ] **Step 4: Run tests and build**

Run: `npx vitest run && npm run build` — Expected: all PASS, build clean.

- [ ] **Step 5: Mutate** — make `validateShop` treat custom ids as unknown (drop the second loop): the "never in extra" test must go red. Make `grainFamily` return `'mdf'` for every sheet: the `m-v-bb55` case must go red. Restore.

- [ ] **Step 6: Commit**

```bash
git add -A src
git commit -m "feat(materials): cut list, Buying, shop, diff, grain and viewport colour read custom materials

Mutated: shop custom-id loop, grainFamily per kind.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: The material library in storage

**Files:**
- Modify: `src/storage/types.ts:120-126` (`StorageAdapter`)
- Modify: `src/storage/browser.ts` (after `setShopSettings`, `:626-634`; key constant near `:13`)
- Modify: `src/App.test.tsx:236-275` (mock gains the two methods)
- Test: `src/storage/browser.materials.test.ts` (new; model it on `browser.shop.test.ts`)

**Interfaces:**
- Consumes: `validateCustomMaterials`, `CustomMaterial`.
- Produces: `MATERIALS_KEY = 'sloyd.materials.v1'`; `StorageAdapter.getMaterialLibrary(): Promise<{ materials: CustomMaterial[]; readFailed: boolean }>`; `StorageAdapter.setMaterialLibrary(materials: CustomMaterial[]): Promise<boolean>`.

- [ ] **Step 1: Write the failing test** — `src/storage/browser.materials.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BrowserStorageAdapter, MATERIALS_KEY } from './browser';
import { MemoryStorage } from './browser.test-helpers';

const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };

describe('the material library (custom materials spec §2.4)', () => {
  it('reads absent as empty, not failed, and writes nothing', async () => {
    const store = new MemoryStorage();
    expect(await new BrowserStorageAdapter(store).getMaterialLibrary()).toEqual({ materials: [], readFailed: false });
    expect(store.getItem(MATERIALS_KEY)).toBeNull();
  });
  it('round-trips', async () => {
    const a = new BrowserStorageAdapter(new MemoryStorage());
    expect(await a.setMaterialLibrary([ash])).toBe(true);
    expect(await a.getMaterialLibrary()).toEqual({ materials: [ash], readFailed: false });
  });
  it.each([['unparseable', '{'], ['another layout', JSON.stringify({ layout: 2, materials: [ash] })], ['not an object', '[]']])(
    '%s reads as empty and FAILED, and the stored value is left alone', async (_, raw) => {
      const store = new MemoryStorage();
      store.setItem(MATERIALS_KEY, raw);
      expect(await new BrowserStorageAdapter(store).getMaterialLibrary()).toEqual({ materials: [], readFailed: true });
      expect(store.getItem(MATERIALS_KEY)).toBe(raw);
    });
  it('drops a malformed entry without failing the read', async () => {
    const store = new MemoryStorage();
    store.setItem(MATERIALS_KEY, JSON.stringify({ layout: 1, materials: [ash, { id: 'pine' }] }));
    expect(await new BrowserStorageAdapter(store).getMaterialLibrary()).toEqual({ materials: [ash], readFailed: false });
  });
  it('reports a failed write', async () => {
    const store = new MemoryStorage();
    store.setItem = () => { throw new Error('quota'); };
    expect(await new BrowserStorageAdapter(store).setMaterialLibrary([ash])).toBe(false);
  });
});
```

Use whatever `MemoryStorage` import `browser.shop.test.ts` uses (read its first lines and copy them exactly).

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/storage/browser.materials.test.ts` → FAIL (no export).

- [ ] **Step 3: Implement** — `types.ts`, after `setShopSettings`:

```ts
  /** The browser's custom-material library (custom materials spec §2.4). Never throws; reading never writes.
   *  `readFailed`: a stored value exists but is unusable or newer — callers must not save over it. */
  getMaterialLibrary(): Promise<{ materials: CustomMaterial[]; readFailed: boolean }>;
  /** Resolves false when the write failed. */
  setMaterialLibrary(materials: CustomMaterial[]): Promise<boolean>;
```

`browser.ts`:

```ts
export const MATERIALS_KEY = 'sloyd.materials.v1';
const MATERIALS_LAYOUT = 1;

  async getMaterialLibrary(): Promise<{ materials: CustomMaterial[]; readFailed: boolean }> {
    const raw = this.store ? readRaw(this.store, MATERIALS_KEY) : null;
    if (raw === null) return { materials: [], readFailed: false };
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { materials: [], readFailed: true };
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return { materials: [], readFailed: true };
    const v = parsed as Record<string, unknown>;
    if (v.layout !== MATERIALS_LAYOUT) return { materials: [], readFailed: true };
    return { materials: validateCustomMaterials(v.materials), readFailed: false };
  }

  async setMaterialLibrary(materials: CustomMaterial[]): Promise<boolean> {
    if (!this.store) return false;
    try {
      this.store.setItem(MATERIALS_KEY, JSON.stringify({ layout: MATERIALS_LAYOUT, materials }));
      return true;
    } catch {
      return false;
    }
  }
```

In `App.test.tsx`, beside the shop mocks:

```ts
let materialLibrary: import('./document/types').CustomMaterial[] = [];
const getMaterialLibrary = vi.fn(async () => ({ materials: materialLibrary, readFailed: false }));
const setMaterialLibrary = vi.fn(async (m: import('./document/types').CustomMaterial[]) => { materialLibrary = m; return true; });
```

and in the mocked `storage` object: `getMaterialLibrary: () => getMaterialLibrary(), setMaterialLibrary: (m: import('./document/types').CustomMaterial[]) => setMaterialLibrary(m),`. Reset `materialLibrary = []` wherever that file resets `shopSettings`.

- [ ] **Step 4: Run** — `npx vitest run src/storage && npm run build` → PASS.

- [ ] **Step 5: Mutate** — make the layout check `return { materials: [], readFailed: false }`: the "another layout" case must go red. Restore.

- [ ] **Step 6: Commit** — `feat(materials): the browser material library (sloyd.materials.v1)` with the footer.

---

### Task 5: Store actions — adopt a material with a part change; apply edited copies

**Files:**
- Modify: `src/store/store.ts:228-236` (action types), `:1066-1131` (`updateBoards`), plus a new `applyMaterials` action after it
- Test: `src/store/store.test.ts`

**Interfaces:**
- Consumes: `upsertMaterials`, `materialUses`, `CustomMaterial`.
- Produces: `updateBoards(ids: string[], patch: Partial<Board>, adopt?: CustomMaterial[]): void`; `applyMaterials(upserts: CustomMaterial[], assign?: { ids: string[]; material: string }): void`. Both refuse while exploded (`readOnly()`), both are ONE `edit()`.

- [ ] **Step 1: Write the failing tests** — append to `store.test.ts`:

```ts
describe('adopting and applying custom materials (custom materials spec §4)', () => {
  const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
  const reset = (over: Partial<SloydDocument> = {}) =>
    useStore.getState().replaceDocument({ ...createDocument(), boards: [createBoard({ id: 'a', name: 'A' }), createBoard({ id: 'b', name: 'B', position: [20, 0, 0] })], ...over });

  it('a library material adopted with a part change is ONE undo entry', () => {
    reset();
    const before = useStore.getState().past.length;
    useStore.getState().updateBoards(['a'], { material: 'm-s-ash1' }, [ash]);
    const s = useStore.getState();
    expect(s.past.length).toBe(before + 1);
    expect(s.doc.materials).toEqual([ash]);
    expect((s.doc.boards[0] as Board).material).toBe('m-s-ash1');
    s.undo();
    expect(useStore.getState().doc.materials).toEqual([]);
    expect((useStore.getState().doc.boards[0] as Board).material).toBe('pine');
  });

  it('applyMaterials with an assignment (New material…) is ONE entry; undo drops the copy and the assignment', () => {
    reset();
    const before = useStore.getState().past.length;
    useStore.getState().applyMaterials([ash], { ids: ['a', 'b'], material: 'm-s-ash1' });
    expect(useStore.getState().past.length).toBe(before + 1);
    expect(useStore.getState().doc.boards.map((b) => (b as Board).material)).toEqual(['m-s-ash1', 'm-s-ash1']);
    useStore.getState().undo();
    expect(useStore.getState().doc.materials).toEqual([]);
  });

  it('applyMaterials edits a project copy; an unused upsert is pruned away; re-applying the same adds no entry', () => {
    reset({ boards: [createBoard({ id: 'a', name: 'A', material: 'm-s-ash1' })], materials: [ash] });
    const brown = { ...ash, color: '#553311' };
    const unused = { ...ash, id: 'm-s-zzzz', label: 'Zed' };
    useStore.getState().applyMaterials([brown, unused]);
    expect(useStore.getState().doc.materials).toEqual([brown]);
    const n = useStore.getState().past.length;
    useStore.getState().applyMaterials([brown]);
    expect(useStore.getState().past.length).toBe(n);
    useStore.getState().applyMaterials([unused]);
    expect(useStore.getState().past.length).toBe(n);
  });

  it('a shaped (linked) part takes the material on its Shape, and the copy is kept', () => {
    reset();
    useStore.getState().linkBoards(['a', 'b']);   // use this file's existing link helper/action name
    const shapedId = useStore.getState().doc.boards[0]!.id;
    useStore.getState().updateBoards([shapedId], { material: 'm-s-ash1' }, [ash]);
    const d = useStore.getState().doc;
    expect(d.shapes[0]!.material).toBe('m-s-ash1');
    expect(d.materials).toEqual([ash]);
  });

  it('refuses while exploded, writing nothing', () => {
    reset();
    useStore.getState().setExplode(0.5);
    const doc = useStore.getState().doc;
    useStore.getState().applyMaterials([ash], { ids: ['a'], material: 'm-s-ash1' });
    useStore.getState().updateBoards(['a'], { material: 'm-s-ash1' }, [ash]);
    expect(useStore.getState().doc).toBe(doc);
  });
});
```

(Read how the existing store tests link two parts and enter explode; use those exact action names — `linkBoards`/`setExplode` are this file's names as of 2026-10-14, confirm with `grep -n "linkBoards\|setExplode" src/store/store.ts`.)

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/store/store.test.ts -t "adopting and applying"` → FAIL (`applyMaterials` is not a function).

- [ ] **Step 3: Implement** — in the action types:

```ts
  /** `adopt`: custom materials copied into the document in the SAME edit (a library pick, spec §4.2). */
  updateBoards: (ids: string[], patch: Partial<Board>, adopt?: CustomMaterial[]) => void;
  /**
   * The Materials & prices dialog's project write (spec §4.1): its edited copies, and with `assign` the
   * selection's new material — ONE edit, one undo entry. Unused copies are pruned by edit(). Refused while exploded.
   */
  applyMaterials: (upserts: CustomMaterial[], assign?: { ids: string[]; material: string }) => void;
```

In `updateBoards: (ids, patch, adopt) => {`, change the one `edit(...)` call to:

```ts
      edit((doc) => mapWorld(adopt ? upsertMaterials(doc, adopt) : doc, (w) => w.map((b) =>
        t.has(b.id) ? patchBoard(b, patch) : o.has(b.id) ? patchBoard(b, shared) : b)));
```

New action after `updateBoards`:

```ts
    applyMaterials: (upserts, assign) => {
      if (readOnly()) return; // exploded: refuse at entry (invariant 47)
      if (assign) {
        get().updateBoards(assign.ids, { material: assign.material }, upserts);
        return;
      }
      // Only copies something uses: an unused upsert would be pruned straight back out, but as a NEW object,
      // so edit()'s same-object test would miss it and push an empty undo entry (invariant 4).
      const used = materialUses(get().doc);
      const kept = upserts.filter((m) => used.has(m.id));
      if (kept.length > 0) edit((doc) => upsertMaterials(doc, kept));
    },
```

- [ ] **Step 4: Run** — `npx vitest run src/store && npm run build` → PASS.

- [ ] **Step 5: Mutate** — in `updateBoards`, apply `upsertMaterials` in a separate `edit()` before the part edit: the "ONE undo entry" tests must go red. Restore.

- [ ] **Step 6: Commit** — `feat(materials): store — adopt a material with a part change, apply edited copies, one undo entry each`.

---

### Task 6: The dialog's draft and save plan (pure)

**Files:**
- Create: `src/panels/materialsDraft.ts`
- Test: `src/panels/materialsDraft.test.ts`
- Modify: `src/document/materials.ts` (add `pickerLibrary`), `src/document/materials.test.ts`

**Interfaces:**
- Consumes: `CustomMaterial`, `MaterialKind`, `labelKey`, `mintMaterialId`, `sameMaterial`, `validateCustomMaterial`, `MATERIALS`, `parseLength`, `formatLength`.
- Produces:
  - `pickerLibrary(project: readonly CustomMaterial[], library: readonly CustomMaterial[]): CustomMaterial[]` — library entries not in the project, whose label matches no built-in and no project label.
  - `type RowSource = 'project' | 'library' | 'new'`
  - `interface DefDraft { label: string; color: string; sheetLength: string; sheetWidth: string; nominal: boolean }`
  - `interface Row { id: string; kind: MaterialKind; source: RowSource; original: CustomMaterial | null; draft: DefDraft; addToLibrary: boolean; deleted: boolean }`
  - `labelTyped(row: Row): boolean` — new, or its label (by `labelKey`) differs from the stored one
  - `setRowKind(row: Row, kind: MaterialKind, rows: Row[], random?): Row` — a NEW row only: re-mints the id for the kind and resets the sheet defaults; any other row is returned unchanged
  - `initialRows(project, library): Row[]` (project rows in stored order, then library-only rows in library order)
  - `newRow(kind: MaterialKind, rows: Row[], random?): Row`
  - `useLibraryVersion(row: Row, library): Row`
  - `fromDraft(row: Row): CustomMaterial | undefined`
  - `rowNotes(row: Row, rows: Row[], library): { differs: boolean; notInLibrary: boolean; libraryLabelClash: boolean; sameNameAsProject: boolean }`
  - `rowRefusal(row: Row, rows: Row[]): string | null`
  - `interface SavePlan { project: CustomMaterial[]; library: CustomMaterial[] | null; assign: { ids: string[]; material: string } | null }`
  - `planSave(input: { rows: Row[]; library: CustomMaterial[]; libraryWritable: boolean; assignIds: string[] | null; locked: boolean }): SavePlan | { refused: string }`

**The rules this module owns** (spec §4.1, §4.2):
- Built-in labels are taken too: a custom label equal to `Pine` is refused.
- A clash refuses only when one side's LABEL was typed (`labelTyped`: new, or its label changed); a pre-existing clash (an imported "Ash" beside a library "Ash") is tolerated and shown, and a colour or sheet-size edit on either side still saves (edit where you are).
- `project` = project rows whose parsed draft differs from `original`, plus the assigned new row. A library-only row never goes to `project` (it would be pruned unused).
- `library` (null when `!libraryWritable` or nothing changes): start from `library`; upsert every changed project row and every `addToLibrary` row — EXCEPT a row whose label matches a DIFFERENT id already in the library (`libraryLabelClash`): it is skipped (its note says why); apply library-row edits; remove `deleted` rows; append new rows.
- `addToLibrary` on a row with `libraryLabelClash` is refused: `'Your library already has a material called "<label>" — rename one first.'`
- `locked` (exploded): `project: []`, `library: null`, `assign: null` — prices only.
- `assign` = `{ ids: assignIds, material: <the first new row's id> }` when `assignIds` is given and a new row exists.

- [ ] **Step 1: Write the failing tests** — `src/panels/materialsDraft.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { initialRows, labelTyped, newRow, planSave, rowNotes, rowRefusal, setRowKind, useLibraryVersion, type Row } from './materialsDraft';
import { pickerLibrary } from '../document/materials';
import type { CustomMaterial } from '../document/types';

const ash: CustomMaterial = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' };
const libAsh: CustomMaterial = { id: 'm-s-ash2', label: 'ash', color: '#ccbb99', kind: 'solid' };
const birch: CustomMaterial = { id: 'm-v-bb55', label: 'Baltic birch', color: '#e8d8b8', kind: 'sheet-veneered', sheet: { length: 60, width: 60 } };
const edit = (r: Row, d: Partial<Row['draft']>): Row => ({ ...r, draft: { ...r.draft, ...d } });
const plan = (rows: Row[], library: CustomMaterial[], over: Partial<Parameters<typeof planSave>[0]> = {}) =>
  planSave({ rows, library, libraryWritable: true, assignIds: null, locked: false, ...over });

describe('pickerLibrary (spec §4.1: one label per picker)', () => {
  it('leaves out library entries already in the project or named like a project or built-in material', () => {
    const pine = { ...birch, id: 'm-v-pine', label: 'PINE ' };
    expect(pickerLibrary([ash], [ash, libAsh, birch, pine])).toEqual([birch]);
  });
});

describe('refusals', () => {
  it('refuses an empty label and a label taken by a built-in', () => {
    const [r] = initialRows([ash], []);
    expect(rowRefusal(edit(r!, { label: '  ' }), [r!])).toBe('Give the material a name.');
    expect(rowRefusal(edit(r!, { label: 'oak' }), [r!])).toBe('Another material is already called "Oak".');
  });
  it('tolerates an imported clash, even with a colour edit, but refuses a TYPED label clash', () => {
    const rows = initialRows([ash], [libAsh]);
    expect(rowRefusal(rows[0]!, rows)).toBeNull();
    expect(rowRefusal(rows[1]!, rows)).toBeNull();
    const coloured = [edit(rows[0]!, { color: '#000000' }), rows[1]!];
    expect(rowRefusal(coloured[0]!, coloured)).toBeNull();
    const recased = [edit(rows[0]!, { label: ' ASH' }), rows[1]!];
    expect(labelTyped(recased[0]!)).toBe(false);
    const typed = initialRows([ash], [birch]);
    const clash = [typed[0]!, edit(typed[1]!, { label: 'ash' })];
    expect(labelTyped(clash[1]!)).toBe(true);
    expect(rowRefusal(clash[1]!, clash)).toBe('Another material is already called "Ash".');
  });
  it('a new row can change kind: a fresh id of that kind and the sheet defaults', () => {
    const r = setRowKind(newRow('solid', [], () => 0.5), 'sheet-veneered', [], () => 0.25);
    expect(r.id).toMatch(/^m-v-/);
    expect(r.kind).toBe('sheet-veneered');
    expect([r.draft.sheetLength, r.draft.sheetWidth]).toEqual(['96', '48']);
    const [stored] = initialRows([ash], []);
    expect(setRowKind(stored!, 'sheet-plain', [])).toBe(stored);
  });
  it('refuses a sheet size that is not a positive length', () => {
    const [r] = initialRows([birch], []);
    for (const v of ['0', '-3', 'abc', '']) expect(rowRefusal(edit(r!, { sheetWidth: v }), [r!])).toBe('Sheet sizes must be positive lengths.');
  });
});

describe('rowNotes', () => {
  it('flags a project copy that differs from the library, and one not in it', () => {
    const rows = initialRows([{ ...ash, color: '#111111' }, birch], [ash]);
    expect(rowNotes(rows[0]!, rows, [ash]).differs).toBe(true);
    expect(rowNotes(rows[1]!, rows, [ash]).notInLibrary).toBe(true);
  });
  it('flags a library-only row named like a project material, and the project row whose library twin has another id', () => {
    const rows = initialRows([ash], [libAsh]);
    expect(rowNotes(rows[1]!, rows, [libAsh]).sameNameAsProject).toBe(true);
    expect(rowNotes(rows[0]!, rows, [libAsh]).libraryLabelClash).toBe(true);
  });
});

describe('planSave', () => {
  it('an edited project row goes to the project AND the library', () => {
    const rows = initialRows([ash], [ash]);
    const p = plan([edit(rows[0]!, { color: '#000000' })], [ash]);
    expect(p).toEqual({ project: [{ ...ash, color: '#000000' }], library: [{ ...ash, color: '#000000' }], assign: null });
  });
  it('nothing edited writes nothing', () => {
    expect(plan(initialRows([ash], [ash]), [ash])).toEqual({ project: [], library: null, assign: null });
  });
  it('a library-only edit goes to the library only', () => {
    const rows = initialRows([], [birch]);
    const p = plan([edit(rows[0]!, { label: 'Birch ply' })], [birch]);
    expect(p).toEqual({ project: [], library: [{ ...birch, label: 'Birch ply' }], assign: null });
  });
  it('"Use library version" makes the project copy equal the library', () => {
    const rows = initialRows([{ ...ash, color: '#111111' }], [ash]);
    expect(plan([useLibraryVersion(rows[0]!, [ash])], [ash])).toEqual({ project: [ash], library: null, assign: null });
  });
  it('"Add to library" is refused while the library holds another id with that label', () => {
    const rows = initialRows([ash], [libAsh]);
    expect(plan([{ ...rows[0]!, addToLibrary: true }, rows[1]!], [libAsh])).toEqual({ refused: 'Your library already has a material called "Ash" — rename one first.' });
  });
  it('an edited project row whose library twin has another id is NOT added to the library', () => {
    const rows = initialRows([ash], [libAsh]);
    const p = plan([edit(rows[0]!, { color: '#000000' }), rows[1]!], [libAsh]);
    expect(p).toEqual({ project: [{ ...ash, color: '#000000' }], library: null, assign: null });
  });
  it('delete removes a library-only row from the library', () => {
    const rows = initialRows([], [birch]);
    expect(plan([{ ...rows[0]!, deleted: true }], [birch])).toEqual({ project: [], library: [], assign: null });
  });
  it('New material… assigns the new row to the selection and saves it to both', () => {
    const r = edit(newRow('solid', [], () => 0.5), { label: 'Sapele', color: '#8a3b22' });
    const p = plan([r], [], { assignIds: ['a', 'b'] });
    if ('refused' in p) throw new Error(p.refused);
    expect(p.project).toEqual([{ id: r.id, label: 'Sapele', color: '#8a3b22', kind: 'solid' }]);
    expect(p.library).toEqual(p.project);
    expect(p.assign).toEqual({ ids: ['a', 'b'], material: r.id });
  });
  it('an unwritable library still applies the project edit and writes no library', () => {
    const r = edit(newRow('solid', [], () => 0.5), { label: 'Sapele', color: '#8a3b22' });
    const p = plan([r], [], { assignIds: ['a'], libraryWritable: false });
    expect(p).toMatchObject({ library: null, assign: { ids: ['a'], material: r.id } });
  });
  it('locked (exploded) plans prices only', () => {
    const rows = initialRows([ash], [ash]);
    expect(plan([edit(rows[0]!, { color: '#000000' })], [ash], { locked: true })).toEqual({ project: [], library: null, assign: null });
  });
  it('a refused row refuses the whole plan', () => {
    const rows = initialRows([ash], []);
    expect(plan([edit(rows[0]!, { label: '' })], [])).toEqual({ refused: 'Give the material a name.' });
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/panels/materialsDraft.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — add to `src/document/materials.ts`:

```ts
/** Library entries the picker may list (spec §4.1–4.2): not in the project, and named like no built-in and no
 *  project material — so one label never shows twice. */
export function pickerLibrary(project: readonly CustomMaterial[], library: readonly CustomMaterial[]): CustomMaterial[] {
  const ids = new Set(project.map((m) => m.id));
  const taken = new Set([...Object.values(MATERIALS).map((m) => labelKey(m.label)), ...project.map((m) => labelKey(m.label))]);
  return library.filter((m) => !ids.has(m.id) && !taken.has(labelKey(m.label)));
}
```

Create `src/panels/materialsDraft.ts`:

```ts
import { MATERIALS, type CustomMaterial, type MaterialKind } from '../document/types';
import { labelKey, mintMaterialId, sameMaterial, validateCustomMaterial } from '../document/materials';
import { formatLength, parseLength } from '../units/length';

export type RowSource = 'project' | 'library' | 'new';
/** Text drafts: a field may hold text that does not parse yet; Save stays off until every row does. */
export interface DefDraft { label: string; color: string; sheetLength: string; sheetWidth: string; nominal: boolean }
export interface Row {
  id: string;
  kind: MaterialKind;
  source: RowSource;
  /** The stored value this row started from (project copy, or library entry); null for a new row. */
  original: CustomMaterial | null;
  draft: DefDraft;
  addToLibrary: boolean;
  deleted: boolean;
}
export interface SavePlan { project: CustomMaterial[]; library: CustomMaterial[] | null; assign: { ids: string[]; material: string } | null }

const lengthText = (v: number) => formatLength(v, 64);
const toDraft = (m: CustomMaterial): DefDraft => ({
  label: m.label, color: m.color, nominal: m.nominal === true,
  sheetLength: m.sheet ? lengthText(m.sheet.length) : '', sheetWidth: m.sheet ? lengthText(m.sheet.width) : '',
});
const row = (m: CustomMaterial, source: RowSource): Row =>
  ({ id: m.id, kind: m.kind, source, original: m, draft: toDraft(m), addToLibrary: false, deleted: false });

export function initialRows(project: readonly CustomMaterial[], library: readonly CustomMaterial[]): Row[] {
  const ids = new Set(project.map((m) => m.id));
  return [...project.map((m) => row(m, 'project')), ...library.filter((m) => !ids.has(m.id)).map((m) => row(m, 'library'))];
}

const DEFAULT_SHEET: Record<MaterialKind, [string, string]> = { solid: ['', ''], 'sheet-veneered': ['96', '48'], 'sheet-plain': ['96', '48'] };
export function newRow(kind: MaterialKind, rows: readonly Row[], random?: () => number): Row {
  const [sheetLength, sheetWidth] = DEFAULT_SHEET[kind];
  return {
    id: mintMaterialId(kind, new Set(rows.map((r) => r.id)), random), kind, source: 'new', original: null,
    draft: { label: '', color: '#c8a878', sheetLength, sheetWidth, nominal: false }, addToLibrary: false, deleted: false,
  };
}

/** Kind is fixed once stored (spec §4.1); an unsaved new row may still change it, which re-mints its id. */
export function setRowKind(r: Row, kind: MaterialKind, rows: readonly Row[], random?: () => number): Row {
  if (r.source !== 'new' || r.kind === kind) return r;
  const fresh = newRow(kind, rows, random);
  return { ...fresh, draft: { ...fresh.draft, label: r.draft.label, color: r.draft.color } };
}

/** The label was typed: a new row, or one whose label (trimmed, case-insensitive) moved off the stored one. */
export const labelTyped = (r: Row) => r.original === null || labelKey(r.draft.label) !== labelKey(r.original.label);

export function useLibraryVersion(r: Row, library: readonly CustomMaterial[]): Row {
  const lib = library.find((m) => m.id === r.id);
  return lib ? { ...r, draft: toDraft(lib) } : r;
}

const positiveLength = (t: string) => { const v = parseLength(t); return v !== null && v > 0 ? v : undefined; };

/** The material a row's draft describes, or undefined while any field is refused. */
export function fromDraft(r: Row): CustomMaterial | undefined {
  const sheet = r.kind === 'solid' ? undefined : { length: positiveLength(r.draft.sheetLength), width: positiveLength(r.draft.sheetWidth) };
  if (sheet && (sheet.length === undefined || sheet.width === undefined)) return undefined;
  return validateCustomMaterial({
    id: r.id, kind: r.kind, label: r.draft.label, color: r.draft.color,
    ...(r.kind === 'solid' && r.draft.nominal ? { nominal: true } : {}),
    ...(sheet ? { sheet } : {}),
  }) ?? undefined;
}

const BUILT_IN_LABELS = new Map(Object.values(MATERIALS).map((m) => [labelKey(m.label), m.label]));
const live = (rows: readonly Row[]) => rows.filter((r) => !r.deleted);

export function rowRefusal(r: Row, rows: readonly Row[]): string | null {
  const key = labelKey(r.draft.label);
  if (!key) return 'Give the material a name.';
  if (r.kind !== 'solid' && (positiveLength(r.draft.sheetLength) === undefined || positiveLength(r.draft.sheetWidth) === undefined)) {
    return 'Sheet sizes must be positive lengths.';
  }
  const builtIn = BUILT_IN_LABELS.get(key);
  if (builtIn !== undefined) return `Another material is already called "${builtIn}".`;
  const other = live(rows).find((o) => o.id !== r.id && labelKey(o.draft.label) === key);
  // A clash refuses only when one side's LABEL was typed; an imported pair is shown, not blocked (edit where you are).
  if (other && (labelTyped(r) || labelTyped(other))) return `Another material is already called "${other.draft.label.trim()}".`;
  if (!fromDraft(r)) return 'Choose a colour.';
  return null;
}

export function rowNotes(r: Row, rows: readonly Row[], library: readonly CustomMaterial[]) {
  const lib = library.find((m) => m.id === r.id);
  const parsed = fromDraft(r);
  const key = labelKey(r.draft.label);
  return {
    differs: r.source === 'project' && lib !== undefined && parsed !== undefined && !sameMaterial(lib, parsed),
    notInLibrary: r.source === 'project' && lib === undefined,
    libraryLabelClash: r.source !== 'library' && library.some((m) => m.id !== r.id && labelKey(m.label) === key),
    sameNameAsProject: r.source === 'library' && live(rows).some((o) => o.source === 'project' && labelKey(o.draft.label) === key),
  };
}

export function planSave(input: {
  rows: readonly Row[]; library: readonly CustomMaterial[]; libraryWritable: boolean; assignIds: string[] | null; locked: boolean;
}): SavePlan | { refused: string } {
  const { rows, library, libraryWritable, assignIds, locked } = input;
  if (locked) return { project: [], library: null, assign: null };
  for (const r of live(rows)) {
    const why = rowRefusal(r, rows);
    if (why) return { refused: why };
    if (r.addToLibrary && rowNotes(r, rows, library).libraryLabelClash) {
      return { refused: `Your library already has a material called "${r.draft.label.trim()}" — rename one first.` };
    }
  }
  const parsed = new Map(live(rows).map((r) => [r.id, fromDraft(r)!]));
  const changed = (r: Row) => r.original === null || !sameMaterial(r.original, parsed.get(r.id)!);
  const newRows = live(rows).filter((r) => r.source === 'new');
  const assigned = assignIds && newRows[0] ? newRows[0] : null;

  const project = live(rows).filter((r) => (r.source === 'project' && changed(r)) || r === assigned).map((r) => parsed.get(r.id)!);

  let lib: CustomMaterial[] | null = null;
  if (libraryWritable) {
    let next = [...library];
    const upsert = (m: CustomMaterial) => {
      const i = next.findIndex((x) => x.id === m.id);
      next = i >= 0 ? next.map((x, j) => (j === i ? m : x)) : [...next, m];
    };
    for (const r of rows) {
      if (r.deleted) { if (r.source === 'library') next = next.filter((m) => m.id !== r.id); continue; }
      const m = parsed.get(r.id)!;
      if (r.source === 'project') {
        if ((changed(r) || r.addToLibrary) && !rowNotes(r, rows, library).libraryLabelClash) upsert(m);
      } else if (changed(r)) {
        upsert(m);
      }
    }
    const same = next.length === library.length && next.every((m, i) => sameMaterial(m, library[i]!));
    lib = same ? null : next;
  }
  return { project, library: lib, assign: assigned && assignIds ? { ids: assignIds, material: assigned.id } : null };
}
```

Note `useLibraryVersion` makes the draft equal the library, so the plan's library is unchanged (`null`) and only the project copy moves — as the test expects.

- [ ] **Step 4: Run** — `npx vitest run src/panels/materialsDraft.test.ts src/document/materials.test.ts` → PASS. `npm run build` → clean.

- [ ] **Step 5: Mutate** — (a) drop `(labelTyped(r) || labelTyped(other))` so every clash refuses: "tolerates an imported clash" must go red; (a2) make `labelTyped` return true for any draft change: the colour-edit case must go red; (b) drop the `libraryLabelClash` guard from the project-row library upsert: "NOT added to the library" must go red; (c) drop `if (locked)`: the locked test must go red. Restore.

- [ ] **Step 6: Commit** — `feat(materials): the dialog's pure draft and save plan; pickerLibrary (one label per picker)`.

---

### Task 7: Materials & prices dialog and App wiring

**Files:**
- Rename: `src/panels/LumberPricesDialog.tsx` → `src/panels/MaterialsDialog.tsx`; `LumberPricesDialog.test.tsx` → `MaterialsDialog.test.tsx` (`git mv`)
- Create: `src/panels/MaterialDefinition.tsx` (one custom material's definition fields)
- Modify: `src/App.tsx` (`:16` import, `:112` state, `:170-175` load, `:1030-1045` render), `src/panels/SettingsDialog.tsx:13, :107`, `src/panels/CutList.tsx:37, :99`
- Modify: `src/styles.css` (only roles; reuse `.lumber-material` styling for custom rows)
- Test: `src/panels/MaterialsDialog.test.tsx`, `src/App.test.tsx` (`describe('Lumber & prices …')` renamed and extended), `src/panels/CutList.test.tsx:184`

**Interfaces:**
- Consumes: Task 6's `initialRows`, `newRow`, `setRowKind`, `useLibraryVersion`, `rowNotes`, `rowRefusal`, `planSave`, `SavePlan`; Task 5's `applyMaterials`; Task 4's storage methods; `defaultBuying`, `ShopSettings`.
- Produces: `MaterialsDialog` with props:

```ts
interface Props {
  shop: ShopSettings;
  readFailed: boolean;
  /** This project's custom materials (doc.materials). */
  project: CustomMaterial[];
  library: CustomMaterial[];
  /** The library could not be read: library writes are off, and the dialog says so. */
  libraryReadFailed: boolean;
  /** Exploded (invariant 47): definitions are read-only; Save writes prices only. */
  locked: boolean;
  /** "New material…" from Properties: these parts take the new material on Save; `kind` starts the new row. */
  newFor: { ids: string[]; kind: MaterialKind } | null;
  /** Resolves null on success, else the message to show (the dialog then stays open). */
  onSave: (out: { shop: ShopSettings; plan: SavePlan }) => Promise<string | null>;
  onClose: () => void;
}
```

**Behaviour** (spec §4.1):
- Heading "Materials & prices"; `aria-label="Materials and prices"`. The note: "Your materials and prices are stored in this browser; each project also keeps a copy of the materials it uses. Undo reverts a project's copy, not your library or prices."
- Order: built-ins (prices fieldset only, exactly as today), then each live row: a `<fieldset>` whose legend is the row's label (or "New material"), `<MaterialDefinition>` (Label, Colour `<input type="color">`, Sheet length/width for sheet kinds — `aria-label`s `"<label>: name"`, `"<label>: colour"`, `"<label>: sheet length"`, `"<label>: sheet width"`; kind shown as text, never editable), then that material's prices fieldset (reuse the existing price-draft code keyed by the row id; a new row's prices start from `defaultBuying(row.id)`).
- Notes per row from `rowNotes`: "Differs from your library" + button **Use library version**; "Only in this project" + button **Add to library**; "Same name as a project material — rename it to use it here" on a library-only row; "Your library has another material with this name — rename one to add it to the library" on a project row with `libraryLabelClash`. A library-only row has a trash button `aria-label="Delete <label> from your library"` (marks `deleted`; the row stays listed, struck through, with **Undo delete**).
- **Add material** appends `newRow('solid', rows)`. A NEW row shows a kind `<select>` (`aria-label="<name>: kind"`: Solid wood / Veneered sheet (plywood) / Plain sheet (MDF, hardboard)); changing it calls `setRowKind` and MOVES that row's price draft from the old id to the new one (`defaultBuying(newId)` — the old draft's mode no longer fits the kind). A stored row shows its kind as text. When `newFor` is given, the dialog opens with one new row of `newFor.kind` already added, focused on its name field.
- `locked`: every definition control, Add material, Use library version, Add to library and the trash buttons are `disabled` with `title={EXPLODED_TITLE}` (import it from where App defines it, or move it to `panels/` if it lives in App — keep one home).
- `libraryReadFailed`: a note "Your saved materials could not be read; the library will not be changed." Library-targeted controls disabled; project edits still save.
- Each row's refusal from `rowRefusal` shows under the row (`role="status"`); Save is disabled while any row or price is refused; the plan's own refusal (Add to library clash) shows above the actions.
- Save: `onSave({ shop: <prices for built-ins + every live row id + untouched stored entries for other ids>, plan })`; on `null` close; on a string show it and stay open.

App (`onSave`):

```ts
onSave={async ({ shop: s, plan }) => {
  if (plan.project.length > 0 || plan.assign) useStore.getState().applyMaterials(plan.project, plan.assign ?? undefined);
  const failed: string[] = [];
  if (plan.library) {
    if (await storage.setMaterialLibrary(plan.library)) setLibrary({ materials: plan.library, readFailed: false });
    else failed.push('your material library');
  }
  if (await storage.setShopSettings(s)) { setShop(s); setShopReadFailed(false); } else failed.push('your prices');
  return failed.length === 0 ? null
    : `Could not save ${failed.join(' or ')}: this browser is not letting Sloyd store settings. The project's changes were made.`;
}}
```

`library` state: `const [library, setLibrary] = useState<{ materials: CustomMaterial[]; readFailed: boolean }>({ materials: [], readFailed: false });` loaded in the same mount effect as the shop (`void storage.getMaterialLibrary().then(setLibrary);`). `newFor` state: `const [newMaterialFor, setNewMaterialFor] = useState<{ ids: string[]; kind: MaterialKind } | null>(null)`, cleared whenever the dialog closes. Pass `project={doc.materials}` (from the store subscription App already has), `locked={exploded}`.

Renames: Settings link text "Materials & prices…" and its comment; CutList button "Materials & prices…" and its comment.

- [ ] **Step 1: `git mv` the dialog and its test; update the import names**; run `npx vitest run src/panels/MaterialsDialog.test.tsx` — the existing price tests still pass after renaming the component and adding the new props in `setup` (`project: [], library: [], libraryReadFailed: false, locked: false, newFor: null`, `onSave` now receiving `{ shop, plan }` — change `onSave.mock.calls[0]![0].materials` to `.shop.materials`).

- [ ] **Step 2: Write the failing tests** — append to `MaterialsDialog.test.tsx`:

```ts
const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
const libAsh = { id: 'm-s-ash2', label: 'Ash', color: '#ccbb99', kind: 'solid' as const };
const open = (over: Partial<Parameters<typeof MaterialsDialog>[0]> = {}) => {
  const onSave = vi.fn(async (_: { shop: ShopSettings; plan: SavePlan }) => null as string | null);
  const onClose = vi.fn();
  render(<MaterialsDialog shop={defaultShop()} readFailed={false} project={[]} library={[]} libraryReadFailed={false}
    locked={false} newFor={null} onSave={onSave} onClose={onClose} {...over} />);
  return { onSave, onClose };
};

describe('MaterialsDialog — definitions (custom materials spec §4.1)', () => {
  it('adds a material: Save sends it to the library and its default prices', async () => {
    const { onSave } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: 'Sapele' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const { plan, shop } = onSave.mock.calls[0]![0];
    expect(plan.library).toHaveLength(1);
    expect(plan.library![0]).toMatchObject({ label: 'Sapele', kind: 'solid' });
    expect(plan.project).toEqual([]);
    expect(shop.materials[plan.library![0]!.id]).toEqual({ mode: 'board-foot', pricePerBoardFoot: null, wasteFactor: 1.3 });
  });
  it('refuses a duplicate label and disables Save', () => {
    open({ project: [ash] });
    fireEvent.click(screen.getByRole('button', { name: 'Add material' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: ' ash' } });
    expect(screen.getByText('Another material is already called "Ash".')).toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();
  });
  it('New material… opens with a new row and assigns it on Save', async () => {
    const { onSave } = open({ newFor: { ids: ['a'], kind: 'solid' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: 'Sapele' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].plan.assign).toMatchObject({ ids: ['a'] });
  });
  it('a new row can switch to a sheet kind; its prices follow it to the new id', async () => {
    const { onSave } = open({ newFor: { ids: ['a'], kind: 'sheet-veneered' } });
    expect(screen.getByRole('textbox', { name: 'New material: sheet length' })).toHaveValue('96');
    fireEvent.change(screen.getByRole('combobox', { name: 'New material: kind' }), { target: { value: 'sheet-plain' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'New material: name' }), { target: { value: 'Hardboard' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const { plan, shop } = onSave.mock.calls[0]![0];
    expect(plan.assign!.material).toMatch(/^m-p-/);
    expect(shop.materials[plan.assign!.material]).toEqual({ mode: 'sheet', pricePerSheet: null });
    expect(Object.keys(shop.materials).filter((k) => k.startsWith('m-v-'))).toEqual([]);
  });
  it('shows one "Ash" note pair for an imported clash and refuses Add to library', () => {
    open({ project: [ash], library: [libAsh] });
    expect(screen.getByText(/Same name as a project material/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add to library' }));
    expect(screen.getByText('Your library already has a material called "Ash" — rename one first.')).toBeInTheDocument();
    expect(saveBtn()).toBeDisabled();
  });
  it('locked (exploded): definitions disabled, Save sends prices only', async () => {
    const { onSave } = open({ project: [ash], locked: true });
    expect(screen.getByRole('textbox', { name: 'Ash: name' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add material' })).toBeDisabled();
    fireEvent.change(field('Oak: price per board foot'), { target: { value: '8' } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0].plan).toEqual({ project: [], library: null, assign: null });
  });
  it('stays open and shows the message when the save reports a failure', async () => {
    const { onSave, onClose } = open({ project: [ash] });
    onSave.mockResolvedValueOnce('Could not save your material library: …');
    fireEvent.change(screen.getByRole('textbox', { name: 'Ash: name' }), { target: { value: 'White ash' } });
    fireEvent.click(saveBtn());
    expect(await screen.findByText('Could not save your material library: …')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

In `App.test.tsx`, rename the describe to `'Materials & prices'`, the button names to `'Materials & prices…'`, the dialog name to `'Materials and prices'`, reset `materialLibrary = []` in its `beforeEach`, and add (Review Focus 5 and 3):

```ts
  it('a failed library write leaves the project edit standing; Save again adds no undo entry', async () => {
    const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
    const id = await mountWithOneBoard();
    act(() => { useStore.getState().updateBoards([id], { material: 'm-s-ash1' }, [ash]); });
    materialLibrary = [ash];
    setMaterialLibrary.mockResolvedValue(false);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    await user.click(screen.getByRole('button', { name: 'Materials & prices…' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Ash: name' }), { target: { value: 'White ash' } });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/Could not save your material library/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Materials and prices' })).toBeInTheDocument();
    expect(useStore.getState().doc.materials[0]!.label).toBe('White ash');
    const n = useStore.getState().past.length;
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Could not save your material library/);
    expect(useStore.getState().past.length).toBe(n);
    setMaterialLibrary.mockImplementation(async (m) => { materialLibrary = m; return true; });
  });

  it('opened over the cut list, then exploded: the definitions lock', async () => {
    await mountWithOneBoard();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Cut list' }));
    await user.click(screen.getByRole('button', { name: 'Materials & prices…' }));
    expect(screen.getByRole('button', { name: 'Add material' })).toBeEnabled();
    act(() => { useStore.getState().setExplode(0.5); });
    expect(screen.getByRole('button', { name: 'Add material' })).toBeDisabled();
    act(() => { useStore.getState().setTool('select'); });
  });
```

(If the cut list cannot be opened while exploded in this build, the second test still holds: it opens first, then explodes. If `setExplode` refuses outside the Select tool, call `setTool('select')` first — read `setExplode` at `store.ts:863`. Restore the `setMaterialLibrary` default implementation exactly as the file's top declares it.)

- [ ] **Step 3: Run to verify they fail** — `npx vitest run src/panels/MaterialsDialog.test.tsx src/App.test.tsx -t "Materials"` → FAIL.

- [ ] **Step 4: Implement** `MaterialDefinition.tsx`:

```tsx
import type { Row, DefDraft } from './materialsDraft';

const KIND_TEXT = { solid: 'Solid wood', 'sheet-veneered': 'Veneered sheet (plywood)', 'sheet-plain': 'Plain sheet (MDF, hardboard)' } as const;

/** One custom material's definition fields (custom materials spec §4.1). The kind is shown, never edited. */
export function MaterialDefinition({ row, name, disabled, disabledTitle, onChange }: {
  row: Row; name: string; disabled: boolean; disabledTitle?: string; onChange: (d: Partial<DefDraft>) => void;
}) {
  const d = row.draft;
  return (
    <div className="material-definition">
      <label>Name
        <input className="input" aria-label={`${name}: name`} value={d.label} disabled={disabled} title={disabledTitle}
          onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <label>Colour
        <input type="color" aria-label={`${name}: colour`} value={d.color} disabled={disabled} title={disabledTitle}
          onChange={(e) => onChange({ color: e.target.value })} />
      </label>
      <span className="material-kind">{KIND_TEXT[row.kind]}</span>
      {row.kind !== 'solid' && (
        <>
          <label>Sheet length
            <input className="input" aria-label={`${name}: sheet length`} value={d.sheetLength} disabled={disabled} title={disabledTitle}
              onChange={(e) => onChange({ sheetLength: e.target.value })} />
          </label>
          <label>Sheet width
            <input className="input" aria-label={`${name}: sheet width`} value={d.sheetWidth} disabled={disabled} title={disabledTitle}
              onChange={(e) => onChange({ sheetWidth: e.target.value })} />
          </label>
        </>
      )}
    </div>
  );
}
```

(`name` is the row's STORED label, or "New material" for a new row, so `aria-label`s do not change while typing. The nominal checkbox is chunk 2.)

In `MaterialsDialog.tsx`: keep the existing price-draft machinery, generalised from `keys = Object.keys(MATERIALS)` to `keys = [...builtIns, ...liveRows.map((r) => r.id)]` with `labelOf(id)` (built-in label, or the row's stored label / "New material"); `defaultBuying(id)` already handles every kind. Add `const [rows, setRows] = useState(() => { const r = initialRows(project, library); return newFor ? [...r, newRow(newFor.kind, r)] : r; })`; `const result = planSave({ rows, library, libraryWritable: !libraryReadFailed, assignIds: newFor?.ids ?? null, locked })`; Save disabled when `!valid || 'refused' in result || saving`. Save builds `shop.materials` from the parsed prices of every listed id, plus every stored `shop.materials` entry whose id is not listed (a library material deleted earlier, or one used only by another project), and `extra` unchanged. Render rows after the built-ins as described above. Escape and focus handling: unchanged.

Wire App and the two renames per the Interfaces block.

- [ ] **Step 5: Run** — `npx vitest run && npm run build` → PASS, clean.

- [ ] **Step 6: Mutate** — make `locked` not disable `Add material`: the locked test must go red. Make App's `onSave` return `null` regardless of failures: the App failure test must go red. Restore.

- [ ] **Step 7: Commit** — `feat(materials): Materials & prices — define, edit, share and price custom materials; one Save, one undo entry`.

---

### Task 8: Properties picker — project and library materials, New material…

**Files:**
- Modify: `src/panels/Properties.tsx:345-410` (multi), `:612-622` (single)
- Modify: `src/App.tsx:977` (`<Properties library={library.materials} onNewMaterial={…} />`)
- Test: `src/panels/Properties.test.tsx`

**Interfaces:**
- Consumes: `catalogOf`, `pickerLibrary`, store `updateBoards(ids, patch, adopt?)`.
- Produces: `Properties` props `{ library?: CustomMaterial[]; onNewMaterial?: (ids: string[], kind: MaterialKind) => void }` (both optional so existing tests render unchanged). `kind` is the selection's common SHEET kind when every selected part's material is that one sheet kind, else `'solid'`.

- [ ] **Step 1: Write the failing tests** — in `Properties.test.tsx`:

```ts
describe('the material picker (custom materials spec §4.2)', () => {
  const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
  const libAsh = { id: 'm-s-ash2', label: 'Ash', color: '#ccbb99', kind: 'solid' as const };
  const birch = { id: 'm-v-bb55', label: 'Baltic birch', color: '#e8d8b8', kind: 'sheet-veneered' as const, sheet: { length: 60, width: 60 } };

  it('groups built-ins, this project and the library, showing one "Ash"', () => {
    // replaceDocument: part 'a' of material m-s-ash1, materials [ash]; select 'a'
    render(<Properties library={[libAsh, birch]} onNewMaterial={() => {}} />);
    const select = screen.getByRole('combobox', { name: 'Material' });
    expect(within(select).getAllByRole('option', { name: 'Ash' })).toHaveLength(1);
    expect(within(select).getByRole('group', { name: 'This project' })).toBeInTheDocument();
    expect(within(select).getByRole('group', { name: 'Your library' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'New material…' })).toBeInTheDocument();
  });
  it('picking a library material adopts it in one undo entry', () => {
    // replaceDocument: part 'a' (pine), select 'a'
    render(<Properties library={[birch]} onNewMaterial={() => {}} />);
    const n = useStore.getState().past.length;
    fireEvent.change(screen.getByRole('combobox', { name: 'Material' }), { target: { value: 'm-v-bb55' } });
    expect(useStore.getState().doc.materials).toEqual([birch]);
    expect(useStore.getState().past.length).toBe(n + 1);
  });
  it('New material… on plywood parts starts a veneered sheet', () => {
    const onNewMaterial = vi.fn();
    // replaceDocument: parts 'a','b' both material 'plywood'; select both
    render(<Properties library={[]} onNewMaterial={onNewMaterial} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Material' }), { target: { value: '__new__' } });
    expect(onNewMaterial).toHaveBeenCalledWith(['a', 'b'], 'sheet-veneered');
  });
  it('New material… calls onNewMaterial with the selection and changes nothing', () => {
    const onNewMaterial = vi.fn();
    // replaceDocument: parts 'a','b'; select both
    render(<Properties library={[]} onNewMaterial={onNewMaterial} />);
    const doc = useStore.getState().doc;
    fireEvent.change(screen.getByRole('combobox', { name: 'Material' }), { target: { value: '__new__' } });
    expect(onNewMaterial).toHaveBeenCalledWith(['a', 'b'], 'solid');
    expect(useStore.getState().doc).toBe(doc);
  });
});
```

(Fill the arrange comments with this file's existing helpers for loading a document and selecting parts.)

- [ ] **Step 2: Run to verify they fail** — `npx vitest run src/panels/Properties.test.tsx -t "material picker"` → FAIL.

- [ ] **Step 3: Implement** — one shared component inside `Properties.tsx`, used by both forms:

```tsx
const NEW_MATERIAL = '__new__';

/** The Material select (custom materials spec §4.2): built-ins, this project's, the library's (one label each), New material…. */
function MaterialSelect({ ids, value, library, onNewMaterial }: {
  ids: string[]; value: string | null; library: CustomMaterial[]; onNewMaterial?: (ids: string[], kind: MaterialKind) => void;
}) {
  const doc = useStore((s) => s.doc);
  const catalog = catalogOf(doc);
  const fromLibrary = pickerLibrary(doc.materials, library);
  const pick = (id: string) => {
    if (id === NEW_MATERIAL) {
      // A sheet selection starts a sheet of its kind (one kind for all, else solid): the kind cannot change once saved.
      const world = worldParts(doc).filter((b) => ids.includes(b.id));
      const kinds = new Set(world.map((b) => materialKind(b.material)));
      const only = kinds.size === 1 ? [...kinds][0]! : 'solid';
      onNewMaterial?.(ids, only);
      return;
    }
    const adopt = fromLibrary.find((m) => m.id === id);
    useStore.getState().updateBoards(ids, { material: id }, adopt ? [adopt] : undefined);
  };
  return (
    <select id="material" className="input" value={value ?? ''} onChange={(e) => pick(e.target.value)}>
      {value === null && <option value="" disabled>mixed</option>}
      {catalog.ids.filter((id) => catalog.get(id)!.builtIn).map((id) => <option key={id} value={id}>{catalog.label(id)}</option>)}
      {doc.materials.length > 0 && (
        <optgroup label="This project">
          {doc.materials.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </optgroup>
      )}
      {fromLibrary.length > 0 && (
        <optgroup label="Your library">
          {fromLibrary.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </optgroup>
      )}
      {onNewMaterial && <option value={NEW_MATERIAL}>New material…</option>}
    </select>
  );
}
```

Replace both `<select id="material" …>` blocks with `<MaterialSelect ids={selectedIds} value={material} … />` (multi) and `<MaterialSelect ids={[board.id]} value={board.material} … />` (single), threading `library = []` and `onNewMaterial` from `Properties`' new props. Picking a sheet material for a part with through-thickness grain is normalised by `patchBoard` as today (`isSheetGood` reads the kind off the id). In App: `<Properties library={library.materials} onNewMaterial={(ids, kind) => { setNewMaterialFor({ ids, kind }); setDialog('prices'); }} />`.

- [ ] **Step 4: Run** — `npx vitest run && npm run build` → PASS, clean.

- [ ] **Step 5: Mutate** — drop the label filter from `pickerLibrary` (keep only the id filter): "showing one Ash" must go red. Restore.

- [ ] **Step 6: Commit** — `feat(materials): Properties picks project and library materials; New material…`.

---

### Task 9: Claude — Refine keeps custom materials; derived projects carry them

**Files:**
- Modify: `src/document/generated.ts:85-139, :156-160, :184` (`designSchema`, `parseDesign`)
- Modify: `src/generate/run.ts:132-160, :188-197, :212-240, :289-300` (evaluate opts, runGeneration, runRefine, estimate)
- Modify: `src/generate/refine.ts` (`refineMessage`)
- Modify: `src/useJoinery.ts`, `src/useRepair.ts` only if their tests show materials lost (see Step 1)
- Create (Step 1, then committed): `src/document/fixtures/design-schema-builtin.json`
- Test: `src/document/generated.test.ts`, `src/generate/run.test.ts` (or the file holding `runRefine` tests), `src/generate/refine.test.ts`, `src/generate/joints/runJoinery.test.ts`, `src/generate/joints/repair.test.ts`

**Interfaces:**
- Consumes: `MaterialCatalog`, `builtInCatalog`, `catalogOf`, `pruneMaterials`.
- Produces: `designSchema(catalog?: MaterialCatalog): Record<string, unknown>`; `DESIGN_SCHEMA = designSchema()` (unchanged bytes); `parseDesign(json, catalog?: MaterialCatalog)`; `EvaluateOpts.catalog?: MaterialCatalog`; `refineMessage(design, settings, catalog?: MaterialCatalog)`.

- [ ] **Step 1: Capture today's schema BEFORE editing** — create a throwaway test `src/document/captureSchema.test.ts`:

```ts
import { it } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { DESIGN_SCHEMA } from './generated';
it('captures', () => { mkdirSync('src/document/fixtures', { recursive: true }); writeFileSync('src/document/fixtures/design-schema-builtin.json', JSON.stringify(DESIGN_SCHEMA)); });
```

Run `npx vitest run src/document/captureSchema.test.ts`, then `rm src/document/captureSchema.test.ts`. Keep the fixture.

- [ ] **Step 2: Write the failing tests**

`generated.test.ts`:

```ts
import builtinSchema from './fixtures/design-schema-builtin.json';

describe('the design schema per catalog (custom materials spec §6)', () => {
  const ash = { id: 'm-s-ash1', label: 'Ash', color: '#d8c8a8', kind: 'solid' as const };
  it("Generate's schema is byte-identical to the pre-custom-materials schema", () => {
    expect(JSON.stringify(DESIGN_SCHEMA)).toBe(JSON.stringify(builtinSchema));
    expect(JSON.stringify(designSchema(builtInCatalog()))).toBe(JSON.stringify(builtinSchema));
  });
  it("Refine's schema adds the project's ids to the material enum, still defined once in $defs", () => {
    const s = designSchema(catalogOf({ materials: [ash] })) as { $defs: { part: { properties: { material: { enum: string[] } } } } };
    expect(s.$defs.part.properties.material.enum).toEqual([...Object.keys(MATERIALS), 'm-s-ash1']);
    expect(JSON.stringify(s).match(/"enum":\["pine"/g)).toHaveLength(1);
  });
  it('parseDesign accepts a custom id only with a catalog that knows it', () => {
    const design = { name: 'X', assemblies: [], parts: [{ name: 'A', role: 'top', material: 'm-s-ash1', at: { x: 0, y: 0, z: 0 }, size: { x: 10, y: 1, z: 10 }, tapers: [], miters: [], bevels: [], chamfers: [] }] };
    expect(parseDesign(design)).toBeNull();
    expect(parseDesign(design, catalogOf({ materials: [ash] }))?.parts[0]!.material).toBe('m-s-ash1');
  });
});
```

(`resolveJsonModule` — check `tsconfig.app.json`; if JSON imports are not enabled, read the fixture with `readFileSync` in the test instead.)

`refine.test.ts`: `refineMessage(design, settings, catalogOf({ materials: [ash] }))` contains the line `Custom materials in this design: "m-s-ash1" is Ash.`; with no custom materials (or no catalog) the message is unchanged from today (assert equality with the two-argument call).

`run.test.ts` (Refine with a fake client — copy the file's existing fake-client Refine test): the original document has a part of `m-s-ash1` and `materials: [ash]`; the fake model returns the design with that part unchanged; assert (a) the schema sent to the client has `m-s-ash1` in its material enum, (b) `outcome.doc.materials` equals `[ash]`, (c) a fake model that switches the part to `oak` yields `outcome.doc.materials` `[]` (pruned), (d) `outcome.changes` reads `': Ash → Oak'`.

`runJoinery.test.ts` and `repair.test.ts`: a document whose parts use `m-s-ash1` keeps `materials: [ash]` on the joined / repaired result. Run these FIRST in Step 3 — if they already pass (the results are built from the source by spread), keep them as pins and change nothing in `useJoinery.ts`/`useRepair.ts`.

- [ ] **Step 3: Run to verify they fail** — `npx vitest run src/document/generated.test.ts src/generate` → FAIL on the new cases (no `designSchema` export; materials dropped by Refine's `{ ...out.doc, … }`).

- [ ] **Step 4: Implement** — `generated.ts`: turn `partSchema` into `const partSchemaFor = (materials: readonly string[]) => ({ …same object…, material: { type: 'string', enum: [...materials] }, … })` keeping key order IDENTICAL (the byte test pins it), and:

```ts
/** … (keep the $defs comment) … `catalog`: Generate passes the built-ins (the schema it always had); Refine passes
 *  the project's catalog so its custom materials are choosable (custom materials spec §6). */
export function designSchema(catalog: MaterialCatalog = builtInCatalog()): Record<string, unknown> {
  return {
    $defs: { dir: { type: 'string', enum: [...DIRS] }, part: partSchemaFor(catalog.ids) },
    // …the rest of today's DESIGN_SCHEMA, unchanged…
  };
}
export const DESIGN_SCHEMA: Record<string, unknown> = designSchema();
```

`isPart` takes the catalog: `catalog.get(p.material) !== undefined` replaces `Object.hasOwn(MATERIALS, p.material)`; thread `catalog` through `isAssembly` and `parseDesign(json: unknown, catalog: MaterialCatalog = builtInCatalog())`.

`refine.ts`:

```ts
export function refineMessage(design: GeneratedDesign, s: RefineSettings, catalog?: MaterialCatalog): string {
  const customs = catalog ? catalog.ids.filter((id) => !catalog.get(id)!.builtIn) : [];
  return [
    'Here is the current design, in the same format you return:', JSON.stringify(design), '',
    ...(customs.length > 0 ? [`Custom materials in this design: ${customs.map((id) => `"${id}" is ${catalog!.label(id)}`).join('; ')}.`, ''] : []),
    `Change it as follows: ${s.instruction.trim()}`, '', KEEP_LINE, '', 'Hard limits:', ...limitLines(s),
  ].join('\n');
}
```

`run.ts`: add `catalog?: MaterialCatalog` to `EvaluateOpts`, `parseDesign(res.json, opts.catalog)`. In `runRefine`: `const catalog = catalogOf(doc);`, `schema: designSchema(catalog)`, `first: refineMessage(from.design, settings, catalog)`, `evaluate: … { …, catalog }`; and both places that rebuild `refined` become

```ts
  let refined: SloydDocument = pruneMaterials({ ...out.doc, stock: doc.stock, units: doc.units, guides: doc.guides, materials: doc.materials });
  // …
      refined = pruneMaterials({ ...jo.result.doc, stock: doc.stock, units: doc.units, guides: doc.guides, materials: doc.materials });
```

`refineEstimateUsd`: `prefixChars: SYSTEM_PROMPT.length + JSON.stringify(designSchema(catalogOf(doc))).length` and `refineMessage(from.design, settings, catalogOf(doc))`. `runGeneration` keeps `DESIGN_SCHEMA`.

- [ ] **Step 5: Run** — `npx vitest run && npm run build` → PASS, clean.

- [ ] **Step 6: Mutate** — drop `materials: doc.materials` from the first `refined`: (b) must go red. Reorder one key in `partSchemaFor`: the byte-identical test must go red. Restore.

- [ ] **Step 7: Commit** — `feat(materials): Refine keeps custom materials (schema per catalog, Generate's unchanged); derived projects carry them`.

---

### Task 10: Whole-branch gate, live checks, records

**Files:**
- Create: `docs/browser-verification-custom-materials.md`
- Modify: `docs/follow-ups.md` (266: chunk 1 closed part; new entries for residue), `docs/feature-gaps.md` (§3 rows), `CLAUDE.md` (Versioning row 14→15, `CURRENT_VERSION` 15, Where-things-live entries for `materials.ts`, `materialsDraft.ts`, `MaterialsDialog.tsx`, `MaterialDefinition.tsx`, test count; Status/Rounds rows only after deploy), `docs/history.md` (round narrative)

- [ ] **Step 1: Gate** — `npm run build && npx vitest run`. Record the test count.

- [ ] **Step 2: Whole-branch review** — dispatch the final reviewer (per the chosen execution method) against the spec and this plan; fix what it confirms.

- [ ] **Step 3: Browser pass on the dev server** (the user watching; Playwright MCP; `npm run dev -- --port <free>`). Follow the memory rule: never `localStorage.clear()` on the dev origin — delete only what this check creates (the projects it makes, `sloyd.materials.v1` entries it adds, the prices it sets). Check, recording a DOM readout for each:
  1. Materials & prices → Add material: Ash (solid), Baltic birch 5×5 (veneered, 60 × 60), Hardboard (plain). Save.
  2. Properties: set a part to Ash from "Your library"; the viewport colour changes; undo restores pine and the project's `materials` empties (read `useStore` state via the page).
  3. A 50 × 50 × ½ part in Baltic birch: the cut list nests it on a 60 × 60 sheet.
  4. "New material…" with two parts selected: create Sapele; both take it; one undo reverts both.
  5. Export the project; delete Ash from the library; import the file: Ash shows under "This project", the dialog offers "Add to library".
  6. Edit Ash's colour in project A; open project B (also Ash): "Differs from your library"; Use library version.
  7. Explode, open the dialog from the cut list: definitions disabled.
  
  Screenshot 1 and 3 into `docs/img/`.

- [ ] **Step 4: Live compile and paid Refine (fu 322)** — ASK THE USER before each: (a) a compile probe with Refine's schema carrying one custom id (max_tokens 16, ≈1¢), from inside the dev page with the stored key, never read out; (b) one paid Refine (≈4¢) on a small Ash project: "make the top cherry". Record both in the verification doc.

- [ ] **Step 5: Records** — write the verification doc; follow-ups: close 266's custom-materials half ("chunk 2 = nominal names" stays open), add residue entries for anything deferred (number from the current highest + 1); feature-gaps §3 "Custom materials" → merged; CLAUDE.md per the Files list; history narrative. Commit: `docs: custom materials chunk 1 — verification, follow-ups, records`.

- [ ] **Step 6: Merge** — `git checkout master && git merge --no-ff custom-materials-1`, run `npm run build && npx vitest run` on the merged tree, delete the branch. Deploying is the user's call (schema 15: rollback below it needs an export first) — ask.
