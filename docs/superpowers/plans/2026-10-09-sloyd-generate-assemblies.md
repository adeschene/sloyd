# Generated assemblies and components — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate can describe a multi-part unit once and place it several times; Sloyd builds shared assemblies from it and links same-role identical parts into components.

**Architecture:** The model's schema gains `role` per part and an `assemblies` list (parts in a local frame, placed by translation). `designToDocument` builds a schema-11 tree (one definition per assembly, one instance per placement), runs it through `migrateDocument`, then links parts by role and exact equality through the existing `linksToShapes`. Checks still run on the flattened world (`flatDocument`); generation adds a distinct-part cap and collapses violations repeated across placements.

**Tech Stack:** TypeScript, Vitest, React (one label), Vite build (`npm run build` is the typecheck gate).

**Spec:** `docs/superpowers/specs/2026-10-09-sloyd-generate-assemblies-design.md` — read it first. Also read `CLAUDE.md` invariants 8, 25, 33, 36, 38, 39, 45, 46.

## Global Constraints

- No schema bump: documents stay `version: 11` (`CURRENT_VERSION`). Do not touch `migrateDocument`'s steps.
- `role` is conversion input only: it must never appear in a stored part, shape, definition or the document.
- Snap every model number to `SNAP_INCHES` (1/16) before use (invariant 25). Centring shifts loose parts and instance origins only, by multiples of `SNAP_INCHES` on X and Z.
- Assemblies: parts only, one level, `rotation: 0` placements.
- `checkDesign` does not change. Its `maxParts` keeps meaning PLACED parts; generation passes `4 × DETAIL_CAPS[detail]` (Simple 48, Moderate 120, Detailed 240).
- Distinct-part message, verbatim shape: `` `${n} distinct parts; the limit is ${cap} (an assembly's parts count once).` ``
- `userMessage` hard-limit line, verbatim shape: `` `- At most ${cap} different parts (an assembly's parts count once) and ${ceiling} placed parts (${detail} detail).` ``
- Collapse suffixes, verbatim shape: `` ` (in every placement of ${assembly} — fix the assembly)` `` and `` ` (in ${placements.join(', ')})` ``.
- `SYSTEM_PROMPT` stays fixed text (nothing per-run).
- Joinery code (`src/generate/joints/`, `runJoinery`) does not change.
- Generation never adopts a project (invariant 36): `useGenerations.ts` is not edited.
- Commit to the feature branch `generate-assemblies`; merge to `master` locally with `--no-ff` at the end. No pull requests.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Mutate every equality, boundary and ordering test once (break the code, see red, restore) and say so in the task report.

## Review Focus

1. **The model puts an assembly's local min corner somewhere other than the origin** (e.g. local parts start at (5, 0, 5)). Expected: world = origin + local still holds and centring still lands the piece on the floor, centred. Pinned in Task 2.
2. **A placement is named like a loose part, or two assemblies share a name.** Expected: names are deduped (invariant 8), and the authored index still agrees with `flatDocument`'s display names; two same-named assemblies never merge in collapse. Pinned in Tasks 2 and 4.
3. **Role spelling drift** ("Leg", " leg"). Expected: treated as the same role. Pinned in Task 3.
4. **Adjacent placements overlapping each other** (drawers stacked too tight). Expected: one merged report naming the placements, NOT "fix the assembly" (the fix is placement spacing). Pinned in Task 4.
5. **An assembly placed once with a defect.** Expected: the report names the placement, not "every placement … fix the assembly". Pinned in Task 4.

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/document/generated.ts` | modify | schema, `parseDesign`, `designToDocument` (tree building, centring, authored index) |
| `src/document/roleLinks.ts` | create | `linkByRole`: role + `sameShared` classes → `linksToShapes` |
| `src/document/linksToShapes.ts` | modify (comment only) | doc comment names its second caller |
| `src/document/assemblyChecks.ts` | create | `distinctParts`, `distinctPartsViolation`, `collapseViolations` |
| `src/document/designCheck.ts` | modify | `rejectedViolations` learns `'unplaced'` / `'empty'` |
| `src/generate/prompt.ts` | modify | `PLACED_CEILING`, `placedCeiling`, `limitsOf`, `userMessage`, `SYSTEM_PROMPT` |
| `src/generate/run.ts` | modify | `runGeneration` wiring |
| `src/panels/GenerateDialog.tsx` | modify | detail option label |
| tests beside each | modify/create | |
| `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md` | modify | Task 6 |

---

### Task 0: Branch

- [ ] **Step 1:** `cd /home/alec/docker/sloyd && git checkout -b generate-assemblies && npm test 2>&1 | tail -3` — expect all tests passing (2080 across 75 files per CLAUDE.md; record the actual number).

---

### Task 1: Schema and `parseDesign` accept roles and assemblies

**Files:**
- Modify: `src/document/generated.ts` (types, `DESIGN_SCHEMA`, `parseDesign`)
- Modify: `src/document/designCheck.ts` (`rejectedViolations`)
- Test: `src/document/generated.test.ts`, `src/document/designCheck.test.ts`
- Fixture updates: `src/generate/run.test.ts`, `src/useGenerations.test.tsx`, `src/App.test.tsx` (designs that go through `parseDesign`)

**Interfaces:**
- Produces:
  ```ts
  export interface GeneratedPart { name: string; role?: string; material: MaterialKey; at: Vec3; size: Vec3 }
  export interface GeneratedPlacement { name: string; at: Vec3 }
  export interface GeneratedAssembly { name: string; parts: GeneratedPart[]; placements: GeneratedPlacement[] }
  export interface GeneratedDesign { name: string; parts: GeneratedPart[]; assemblies?: GeneratedAssembly[] }
  export interface RejectedPart { name: string; reason: 'not-finite' | 'too-small' | 'unplaced' | 'empty' }
  export function parseDesign(json: unknown): GeneratedDesign | null
  ```
  `role` and `assemblies` are OPTIONAL in the TypeScript type so hand-built test fixtures (about ten files call `designToDocument` with flat literals) stay terse. `parseDesign` is the gate for model output and REQUIRES both; a value it returns always has them.

- [ ] **Step 1: Write failing tests** in `src/document/generated.test.ts`. Change the `part` helper to take an optional role, and the `design` helper to emit `assemblies: []`:

```ts
const part = (name: string, at: [number, number, number], size: [number, number, number], material = 'pine', role = ''): GeneratedPart => ({
  name, role, material,
  at: { x: at[0], y: at[1], z: at[2] },
  size: { x: size[0], y: size[1], z: size[2] },
});
const design = (...parts: GeneratedPart[]): GeneratedDesign => ({ name: 'Test', parts, assemblies: [] });
const v = (x: number, y: number, z: number) => ({ x, y, z });
```

Replace the `parseDesign` describe with:

```ts
describe('parseDesign', () => {
  const asm = (over: Record<string, unknown> = {}) => ({
    name: 'Drawer', parts: [part('Front', [0, 0, 0], [10, 4, 0.75])], placements: [{ name: 'Drawer 1', at: v(0, 0, 0) }], ...over,
  });
  it('accepts a well-formed design', () => {
    const d = design(part('A', [0, 0, 0], [1, 2, 3]));
    expect(parseDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it('accepts a design with assemblies', () => {
    const d = { ...design(part('A', [0, 0, 0], [1, 2, 3])), assemblies: [asm()] };
    expect(parseDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it('accepts a design whose only parts are in assemblies', () => {
    const d = { name: 'x', parts: [], assemblies: [asm()] };
    expect(parseDesign(d)).toEqual(d);
  });
  const okPart = { name: 'A', role: '', material: 'pine', at: v(0, 0, 0), size: v(1, 1, 1) };
  it.each([
    null, 42, {}, { name: 'x' },
    { name: 'x', parts: [], assemblies: [] },                                   // no parts at all
    { name: 'x', parts: [okPart] },                                             // assemblies missing
    { name: 'x', parts: [{ ...okPart, role: undefined }], assemblies: [] },     // role missing
    { name: 'x', parts: [{ ...okPart, at: { x: 0, y: 0 } }], assemblies: [] },
    { name: 'x', parts: [{ ...okPart, material: 'constructor' }], assemblies: [] },
    { name: 'x', parts: [{ ...okPart, material: 'unobtanium' }], assemblies: [] },
    { name: 'x', parts: [okPart], assemblies: [{ name: 'D', parts: [{ ...okPart, material: 'unobtanium' }], placements: [] }] },
    { name: 'x', parts: [okPart], assemblies: [{ name: 'D', parts: [okPart], placements: [{ name: 'P', at: { x: 0, y: 0 } }] }] },
    { name: 'x', parts: [okPart], assemblies: [{ name: 'D', parts: [okPart] }] },  // placements missing
    { name: 'x', parts: [okPart], assemblies: [{ parts: [okPart], placements: [] }] }, // name missing
  ])('rejects %j', (bad) => {
    expect(parseDesign(bad)).toBeNull();
  });
});
```

Extend the `DESIGN_SCHEMA` describe:

```ts
  it('requires role, assemblies and placements', () => {
    const s = DESIGN_SCHEMA as any;
    expect(s.required).toEqual(['name', 'parts', 'assemblies']);
    expect(s.properties.parts.items.required).toEqual(['name', 'role', 'material', 'at', 'size']);
    const a = s.properties.assemblies.items;
    expect(a.required).toEqual(['name', 'parts', 'placements']);
    expect(a.properties.parts.items).toBe(s.properties.parts.items);
    expect(a.properties.placements.items.required).toEqual(['name', 'at']);
  });
```

and change the `additionalProperties` walk so it also descends into arrays:

```ts
  it('sets additionalProperties: false on every object', () => {
    const walk = (s: any): boolean =>
      s.type === 'array' ? walk(s.items)
        : s.type !== 'object' || (s.additionalProperties === false && Object.values(s.properties).every(walk));
    expect(walk(DESIGN_SCHEMA)).toBe(true);
  });
```

In `src/document/designCheck.test.ts` add (next to any existing `rejectedViolations` test; import it if not imported):

```ts
describe('rejectedViolations — assemblies', () => {
  it('reports an unplaced and an empty assembly by name', () => {
    const out = rejectedViolations([{ name: 'Drawer', reason: 'unplaced' }, { name: 'Door', reason: 'empty' }]);
    expect(out.map((x) => x.parts)).toEqual([['Drawer'], ['Door']]);
    expect(out[0].message).toBe('Drawer is an assembly with no usable placement, so none of its parts were built.');
    expect(out[1].message).toBe('Door is an assembly with no usable parts.');
  });
});
```

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/document/generated.test.ts src/document/designCheck.test.ts`

- [ ] **Step 3: Implement** in `src/document/generated.ts`. Replace the types and schema block:

```ts
export interface Vec3 { x: number; y: number; z: number }
export type MaterialKey = string;
/** `role` is REQUIRED from the model (parseDesign checks it); optional here so
 *  hand-built fixtures stay terse. Conversion input only — never stored. */
export interface GeneratedPart { name: string; role?: string; material: MaterialKey; at: Vec3; size: Vec3 }
/** Where an assembly's local origin goes in the world. No turn (spec §2). */
export interface GeneratedPlacement { name: string; at: Vec3 }
/** Parts in the assembly's OWN frame, placed by translation; one level, parts only. */
export interface GeneratedAssembly { name: string; parts: GeneratedPart[]; placements: GeneratedPlacement[] }
/** `assemblies` is REQUIRED from the model; optional here for the same reason as `role`. */
export interface GeneratedDesign { name: string; parts: GeneratedPart[]; assemblies?: GeneratedAssembly[] }
export interface RejectedPart { name: string; reason: 'not-finite' | 'too-small' | 'unplaced' | 'empty' }

const vec3Schema = {
  type: 'object',
  properties: { x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' } },
  required: ['x', 'y', 'z'],
  additionalProperties: false,
};

/** Built from MATERIALS at load, so a new material reaches the model with no second edit. */
const partSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    role: { type: 'string' },
    material: { type: 'string', enum: Object.keys(MATERIALS) },
    at: vec3Schema,
    size: vec3Schema,
  },
  required: ['name', 'role', 'material', 'at', 'size'],
  additionalProperties: false,
};

export const DESIGN_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    parts: { type: 'array', items: partSchema },
    assemblies: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          parts: { type: 'array', items: partSchema },
          placements: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, at: vec3Schema },
              required: ['name', 'at'],
              additionalProperties: false,
            },
          },
        },
        required: ['name', 'parts', 'placements'],
        additionalProperties: false,
      },
    },
  },
  required: ['name', 'parts', 'assemblies'],
  additionalProperties: false,
};
```

Replace `parseDesign`:

```ts
const isPart = (p: unknown): boolean =>
  isObj(p) && typeof p.name === 'string' && typeof p.role === 'string' && typeof p.material === 'string' &&
  Object.hasOwn(MATERIALS, p.material) && isVec3(p.at) && isVec3(p.size);
const isPlacement = (p: unknown): boolean => isObj(p) && typeof p.name === 'string' && isVec3(p.at);
const isAssembly = (a: unknown): boolean =>
  isObj(a) && typeof a.name === 'string' && Array.isArray(a.parts) && a.parts.every(isPart) &&
  Array.isArray(a.placements) && a.placements.every(isPlacement);

/**
 * Shape check on the parsed output. The API enforces the schema, but this is
 * the client's own gate — a provider without structured outputs, or a
 * truncated stream, must not reach the converter. Numbers are only checked
 * for TYPE here; non-finite values are the converter's to reject per part.
 * A design with no parts anywhere (loose or in an assembly) is unusable.
 */
export function parseDesign(json: unknown): GeneratedDesign | null {
  if (!isObj(json) || typeof json.name !== 'string' || !Array.isArray(json.parts) || !Array.isArray(json.assemblies)) return null;
  if (!json.parts.every(isPart) || !json.assemblies.every(isAssembly)) return null;
  const total = json.parts.length + (json.assemblies as { parts: unknown[] }[]).reduce((n, a) => n + a.parts.length, 0);
  if (total === 0) return null;
  return json as unknown as GeneratedDesign;
}
```

In `src/document/designCheck.ts` replace `rejectedViolations`:

```ts
/** Parts (and assemblies) the converter could not build, reported in the same voice. */
export function rejectedViolations(rejected: RejectedPart[]): Violation[] {
  const say: Record<RejectedPart['reason'], (n: string) => string> = {
    'not-finite': (n) => `${n} has a position or size that is not a finite number.`,
    'too-small': (n) => `${n} has a size of zero or less after rounding to 1/16in.`,
    unplaced: (n) => `${n} is an assembly with no usable placement, so none of its parts were built.`,
    empty: (n) => `${n} is an assembly with no usable parts.`,
  };
  return rejected.map((r) => ({ kind: 'too-small' as const, message: say[r.reason](r.name), parts: [r.name] }));
}
```

- [ ] **Step 4: Update the fixtures that go through `parseDesign`** (they now lack `role`/`assemblies` and would be refused):
  - `src/generate/run.test.ts`: in the `p` helper add `role: ''`; add `assemblies: []` to every design literal (`GOOD`, `ONE_ISSUE`, `TWO_ISSUES`, `ALL_REJECTED`, `dup`, and any other `{ name: …, parts: [...] }` in the file — `grep -n "parts: \[" src/generate/run.test.ts`).
  - `src/useGenerations.test.tsx` `GOOD` (line ~20): add `role: ''` to the part and `assemblies: []`.
  - `src/App.test.tsx` `GOOD` inside `describe('Generate'` (line ~1515): same.

- [ ] **Step 5: Run, expect PASS:** `npx vitest run src/document src/generate src/useGenerations.test.tsx src/App.test.tsx` then `npm run build`.

- [ ] **Step 6: Mutate:** drop `typeof p.role === 'string' &&` from `isPart` → the "role missing" case goes red; restore. Drop the `total === 0` check → `{ parts: [], assemblies: [] }` goes red; restore.

- [ ] **Step 7: Commit**

```bash
git add -A src && git commit -m "feat(generate): schema and parseDesign accept roles and assemblies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `designToDocument` builds the tree

**Files:**
- Modify: `src/document/generated.ts` (`designToDocument`, new `Authored` types)
- Modify: `src/generate/run.ts` (`runGeneration` checks the flattened tree)
- Test: `src/document/generated.test.ts`, `src/generate/run.test.ts`
- Fixture updates (typing only): `src/generate/joints/{choose,cutlines.recipe,sites,runJoinery,recipes,tenons.recipe}.test.ts`, `src/useJoinery.test.tsx`, `src/App.test.tsx` (~line 1691)

**Interfaces:**
- Consumes: Task 1's types.
- Produces:
  ```ts
  export interface AuthoredPart { label: string; assembly: string | null; placement: string | null }
  export interface Authored {
    /** Flat display name (as flatDocument names it) → what the model wrote. */
    parts: Map<string, AuthoredPart>;
    /** Assembly label → its placements' STORED (deduped) names, in order. */
    placements: Map<string, string[]>;
  }
  export function designToDocument(design: GeneratedDesign): { doc: SloydDocument; rejected: RejectedPart[]; authored: Authored; roles: Map<string, string> }
  ```
  `roles` maps a STORED part id to its normalised role (`trim().toLowerCase()`, empty roles omitted). Task 3 consumes it; Task 3 then removes it from the return value (it is conversion input only).

- [ ] **Step 1: Write failing tests** — add to `src/document/generated.test.ts` (imports: `flatDocument`, `migrateDocument` from `./document`; `NAME_SEPARATOR` from `./tree`; `GeneratedAssembly` type):

```ts
const asm = (name: string, parts: GeneratedPart[], ...placements: [string, [number, number, number]][]): GeneratedAssembly => ({
  name, parts, placements: placements.map(([n, at]) => ({ name: n, at: v(...at) })),
});
const withAsm = (parts: GeneratedPart[], ...assemblies: GeneratedAssembly[]): GeneratedDesign => ({ name: 'Test', parts, assemblies });
const FRONT = part('Front', [0, 0, 0], [10, 4, 0.75]);

describe('designToDocument — assemblies', () => {
  it('places every copy at origin + local, after snap and centre', () => {
    const { doc } = designToDocument(withAsm([], asm('Drawer', [FRONT], ['Drawer 1', [0, 0, 0]], ['Drawer 2', [0, 5.01, 0]])));
    // x 0..10 → shift -5; z 0..0.75 → shift -0.375 (6/16, on the grid); y min 0.
    expect(worldParts(doc).map((b) => b.position)).toEqual([[-5, 0, -0.375], [-5, 5, -0.375]]);
  });

  it('never shifts definition-local coordinates', () => {
    const { doc } = designToDocument(withAsm([part('Base', [40, 0, 40], [4, 1, 4])], asm('Drawer', [FRONT], ['D', [0, 3, 0]])));
    expect(doc.definitions[0].boards[0].position).toEqual([0, 0, 0]);
  });

  it('works when the local min corner is not at the origin (review focus 1)', () => {
    const local = part('Front', [5, 0, 5], [10, 4, 0.75]);
    const { doc } = designToDocument(withAsm([], asm('Drawer', [local], ['A', [0, 0, 0]], ['B', [20, 0, 0]])));
    const xs = worldParts(doc).map((b) => b.position[0]);
    // world x spans 5..35 → centred → -15..15
    expect(xs).toEqual([-15, 5]);
    expect(Math.min(...worldParts(doc).map((b) => b.position[1]))).toBe(0);
  });

  it('shares one definition across placements, unturned', () => {
    const { doc } = designToDocument(withAsm([], asm('Drawer', [FRONT], ['A', [0, 0, 0]], ['B', [0, 5, 0]], ['C', [0, 10, 0]])));
    expect(doc.definitions).toHaveLength(1);
    expect(doc.instances.map((i) => i.definition)).toEqual(Array(3).fill(doc.definitions[0].id));
    expect(doc.instances.every((i) => i.rotation === 0)).toBe(true);
  });

  it('dedupes a placement name against a loose part (review focus 2)', () => {
    const { doc, authored } = designToDocument(withAsm([part('Drawer', [30, 0, 0], [4, 1, 4])], asm('Drawer', [FRONT], ['Drawer', [0, 0, 0]])));
    const flatNames = flatDocument(doc).boards.map((b) => b.name);
    expect(new Set(flatNames).size).toBe(flatNames.length);
    for (const n of flatNames) expect(authored.parts.has(n)).toBe(true);
  });

  it('dedupes three placements all named "Drawer", and the index follows (review focus 2)', () => {
    const { doc, authored } = designToDocument(withAsm([], asm('Drawer', [FRONT], ['Drawer', [0, 0, 0]], ['Drawer', [0, 5, 0]], ['Drawer', [0, 10, 0]])));
    const stored = doc.instances.map((i) => i.name);
    expect(new Set(stored).size).toBe(3);
    expect(authored.placements.get('Drawer')).toEqual(stored);
    expect([...authored.parts.keys()].sort()).toEqual(flatDocument(doc).boards.map((b) => b.name).sort());
  });

  it('indexes every flat display name back to what the model wrote', () => {
    const { doc, authored } = designToDocument(withAsm(
      [part('Top', [0, 10, 0], [20, 1, 20])],
      asm('Drawer', [FRONT, part('Side', [0, 0, 0.75], [0.75, 4, 10])], ['Upper', [0, 5, 0]], ['Lower', [0, 0, 0]]),
    ));
    const flat = flatDocument(doc).boards.map((b) => b.name).sort();
    expect([...authored.parts.keys()].sort()).toEqual(flat);
    expect(authored.parts.get(`Upper${NAME_SEPARATOR}Side`)).toEqual({ label: `Drawer${NAME_SEPARATOR}Side`, assembly: 'Drawer', placement: 'Upper' });
    expect(authored.parts.get('Top')).toEqual({ label: 'Top', assembly: null, placement: null });
    expect(authored.placements.get('Drawer')).toEqual(['Upper', 'Lower']);
  });

  it('keeps two same-named assemblies apart in the index (review focus 2)', () => {
    const { authored } = designToDocument(withAsm([], asm('Box', [FRONT], ['A', [0, 0, 0]]), asm('Box', [FRONT], ['B', [20, 0, 0]])));
    expect([...authored.placements.keys()]).toHaveLength(2);
  });

  it('drops an unplaced assembly and an all-rejected one, and says so', () => {
    const { doc, rejected } = designToDocument(withAsm(
      [part('Top', [0, 0, 0], [20, 1, 20])],
      asm('Ghost', [FRONT]),
      asm('Thin', [part('Sliver', [0, 0, 0], [10, 0.01, 1])], ['T', [0, 0, 0]]),
    ));
    expect(rejected).toEqual([
      { name: 'Ghost', reason: 'unplaced' },
      { name: `Sliver (in assembly Thin)`, reason: 'too-small' },
      { name: 'Thin', reason: 'empty' },
    ]);
    expect(doc.definitions).toHaveLength(0);
    expect(doc.instances).toHaveLength(0);
  });

  it('rejects a placement with a non-finite origin and keeps the others', () => {
    const { doc, rejected } = designToDocument(withAsm([], asm('Drawer', [FRONT], ['Bad', [Number.NaN, 0, 0]], ['Good', [0, 0, 0]])));
    expect(rejected).toEqual([{ name: 'Bad (placement of Drawer)', reason: 'not-finite' }]);
    expect(doc.instances.map((i) => i.name)).toEqual(['Good']);
  });

  it('survives another migrateDocument unchanged', () => {
    const { doc } = designToDocument(withAsm([part('Top', [0, 10, 0], [20, 1, 20])], asm('Drawer', [FRONT], ['A', [0, 0, 0]], ['B', [0, 5, 0]])));
    expect(migrateDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
});
```

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/document/generated.test.ts`

- [ ] **Step 3: Implement.** In `src/document/generated.ts`, update imports:

```ts
import { createDocument, migrateDocument } from './document';
import type { SloydDocument } from './document';
import { DIMENSION_ORDER, SNAP_INCHES, axisDimensions } from './geometry';
import { nextId } from './ids';
import { uniqueName } from './names';
import { NAME_SEPARATOR } from './tree';
import { MATERIALS } from './types';
import type { Board, Definition, Dimension, Instance, Posture, Rotation } from './types';
```

Replace `designToDocument` (keep `orient`, `snap`, `POSTURE_FOR_UP`, `extentsOf`):

```ts
export interface AuthoredPart { label: string; assembly: string | null; placement: string | null }
/** What the model wrote, for naming violations back to it (spec §5.3). */
export interface Authored {
  /** Flat display name (as flatDocument names it) → what the model wrote. */
  parts: Map<string, AuthoredPart>;
  /** Assembly label → its placements' STORED (deduped) names, in order. */
  placements: Map<string, string[]>;
}

type Vec = [number, number, number];

/** Snap, check, encode one part; null (and a rejection) when unusable. */
function convertPart(p: GeneratedPart, label: string, rejected: RejectedPart[]): Omit<Board, 'id'> | null {
  // Checked AFTER the snap: a finite value near Number.MAX_VALUE overflows
  // to Infinity on the division by SNAP_INCHES. Covers NaN/±Infinity too.
  const snapped = [p.at.x, p.at.y, p.at.z, p.size.x, p.size.y, p.size.z].map(snap);
  if (!snapped.every(Number.isFinite)) {
    rejected.push({ name: label, reason: 'not-finite' });
    return null;
  }
  const [ax, ay, az, sx, sy, sz] = snapped;
  if (sx <= 0 || sy <= 0 || sz <= 0) {
    rejected.push({ name: label, reason: 'too-small' });
    return null;
  }
  return { name: p.name, material: p.material, grain: 'length', cuts: [], position: [ax, ay, az], ...orient([sx, sy, sz]) };
}

/**
 * Model output → a trusted TREE document (spec §3). Round first (invariant 25:
 * model output is a FREE value, like a drag), then encode, then build one
 * Definition per assembly and one unturned Instance per placement, then
 * translate the whole design onto the floor with its footprint centred — by a
 * multiple of SNAP_INCHES, shifting loose parts and instance ORIGINS only,
 * never definition-local coordinates — then migrateDocument, the same gate an
 * imported file passes, which dedupes names (inv 8) and checks ids (inv 33).
 *
 * Every id is minted here with nextId so `roles` (stored part id → role) and
 * the definition → assembly label map survive the load gate.
 */
export function designToDocument(design: GeneratedDesign): {
  doc: SloydDocument; rejected: RejectedPart[]; authored: Authored; roles: Map<string, string>;
} {
  const rejected: RejectedPart[] = [];
  const roles = new Map<string, string>();
  const mint = (p: GeneratedPart, board: Omit<Board, 'id'>): Board => {
    const b: Board = { id: nextId(), ...board };
    const role = (p.role ?? '').trim().toLowerCase();
    if (role) roles.set(b.id, role);
    return b;
  };

  const loose: Board[] = design.parts.flatMap((p) => {
    const b = convertPart(p, p.name, rejected);
    return b ? [mint(p, b)] : [];
  });

  const definitions: Definition[] = [];
  const instances: Instance[] = [];
  const labelOf = new Map<string, string>(); // definition id → assembly label
  const taken: { id: string; name: string }[] = [];
  for (const a of design.assemblies ?? []) {
    // Assembly names are the model's handle in feedback, so they are unique
    // among themselves (they are not stored: a Definition has no name).
    const label = uniqueName(a.name.trim() || 'Assembly', taken);
    taken.push({ id: label, name: label });
    const parts = a.parts.flatMap((p) => {
      const b = convertPart(p, `${p.name} (in assembly ${label})`, rejected);
      return b ? [mint(p, b)] : [];
    });
    const origins = a.placements.flatMap((pl) => {
      const at = [pl.at.x, pl.at.y, pl.at.z].map(snap) as Vec;
      if (at.every(Number.isFinite)) return [{ name: pl.name, at }];
      rejected.push({ name: `${pl.name} (placement of ${label})`, reason: 'not-finite' });
      return [];
    });
    if (parts.length === 0) { rejected.push({ name: label, reason: 'empty' }); continue; }
    if (origins.length === 0) { rejected.push({ name: label, reason: 'unplaced' }); continue; }
    const def: Definition = { id: nextId(), boards: parts, instances: [] };
    definitions.push(def);
    labelOf.set(def.id, label);
    for (const o of origins) instances.push({ id: nextId(), name: o.name, definition: def.id, position: o.at, rotation: 0 });
  }

  // Bounds over the PLACED world parts. Unturned, so world = origin + local.
  const placed: [Vec, Vec][] = [
    ...loose.map((b) => [b.position, extentsOf(b)] as [Vec, Vec]),
    ...instances.flatMap((i) => definitions.find((d) => d.id === i.definition)!.boards.map((b) => {
      const p = (b as Board).position;
      return [[i.position[0] + p[0], i.position[1] + p[1], i.position[2] + p[2]], extentsOf(b as Board)] as [Vec, Vec];
    })),
  ];
  if (placed.length > 0) {
    const min = [0, 1, 2].map((k) => Math.min(...placed.map(([p]) => p[k])));
    const max = [0, 1, 2].map((k) => Math.max(...placed.map(([p, e]) => p[k] + e[k])));
    const shift = [snap(-(min[0] + max[0]) / 2), -min[1], snap(-(min[2] + max[2]) / 2)];
    const move = (p: Vec): Vec => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
    for (const b of loose) b.position = move(b.position);
    for (const i of instances) i.position = move(i.position);
  }

  const name = design.name.trim() || 'Generated design';
  const doc = migrateDocument({ ...createDocument(name), boards: loose, instances, definitions });
  return { doc, rejected, authored: authoredIndex(doc, labelOf), roles };
}

/**
 * Flat display name → authored label. Built from the MIGRATED document's stored
 * (deduped) names with flatDocument's naming rule (`Instance › Part`, one level),
 * so it agrees with displayNames — a test pins the agreement.
 */
function authoredIndex(doc: SloydDocument, labelOf: ReadonlyMap<string, string>): Authored {
  const parts = new Map<string, AuthoredPart>();
  const placements = new Map<string, string[]>();
  for (const b of doc.boards) parts.set(b.name, { label: b.name, assembly: null, placement: null });
  const defs = new Map(doc.definitions.map((d) => [d.id, d]));
  for (const inst of doc.instances) {
    const d = defs.get(inst.definition);
    const label = labelOf.get(inst.definition);
    if (!d || label === undefined) continue;
    placements.set(label, [...(placements.get(label) ?? []), inst.name]);
    for (const b of d.boards) {
      parts.set(`${inst.name}${NAME_SEPARATOR}${b.name}`, { label: `${label}${NAME_SEPARATOR}${b.name}`, assembly: label, placement: inst.name });
    }
  }
  return { parts, placements };
}
```

Remove the now-unused `flatDocument`/`FlatDocument` imports. If `migrateDocument`'s `repairTree` reorders or renames anything the "survives another migrateDocument" test catches it — investigate, do not loosen the test.

- [ ] **Step 4: Fix fixture typing.** `doc` is now `SloydDocument`; joinery takes `FlatDocument`. In each joinery test helper that returns `designToDocument(...).doc`, wrap it: `flatDocument(designToDocument({...}).doc)` (import `flatDocument` from the document module the file already imports from, e.g. `'../../document/document'`). Files: `src/generate/joints/choose.test.ts`, `cutlines.recipe.test.ts`, `sites.test.ts`, `runJoinery.test.ts`, `recipes.test.ts`, `tenons.recipe.test.ts`, `src/useJoinery.test.tsx`, and `src/App.test.tsx` ~1691 only if `tsc` complains. These fixtures have no roles and no assemblies, so `flatDocument` is an identity on them — behaviour is unchanged. Let `npm run build` find any site this list missed.

- [ ] **Step 5: `runGeneration` checks the flattened tree.** `checkDesign` takes a `FlatDocument` and `doc` is now a tree, so `run.ts` must flatten. Add a failing test to `src/generate/run.test.ts`:

```ts
it('accepts a design whose only parts are in an assembly', async () => {
  const { client } = fakeClient([{ name: 'Only', parts: [], assemblies: [{
    name: 'Shelf', parts: [{ ...p('Board', 0), role: '' }], placements: [{ name: 'S1', at: { x: 0, y: 0, z: 0 } }],
  }] }]);
  const out = await run(client);
  expect(out.doc.name).toBe('Only');
  expect(out.doc.instances).toHaveLength(1);
});
```

Then in `src/generate/run.ts` add `flatDocument` to the `../document/document` import and change `evaluate`'s tail to:

```ts
      // Checks read the placed world (generate-assemblies spec §5.1); the TREE is what is kept.
      const flat = flatDocument(converted.doc);
      // Every part rejected: unusable, and never a `best` — a zero-board
      // document is not a prototype.
      if (flat.boards.length === 0) return { value: null, feedback: repairMessage(rejectedViolations(converted.rejected)) };
      const violations = [...rejectedViolations(converted.rejected), ...checkDesign(flat, limits)];
      return { value: { doc: converted.doc, violations }, feedback: repairMessage(violations) };
```

(Mutation: guard on `converted.doc.boards.length` instead → the new test goes red; restore.)

- [ ] **Step 6: Run, expect PASS:** `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -5`

- [ ] **Step 7: Mutate:** apply `move` to definition-local positions too → "never shifts definition-local coordinates" goes red; restore. Change `authoredIndex`'s key to use the placement's raw model name instead of `inst.name` → the dedupe test goes red; restore.

- [ ] **Step 8: Commit** — `git add -A src && git commit -m "feat(generate): designToDocument builds shared assemblies from placements"` (with the Co-Authored-By trailer).

---

### Task 3: Link parts by role and exact equality

**Files:**
- Create: `src/document/roleLinks.ts`, `src/document/roleLinks.test.ts`
- Modify: `src/document/generated.ts` (call `linkByRole`; drop `roles` from the return value)
- Modify: `src/document/linksToShapes.ts` (doc comment only)

**Interfaces:**
- Consumes: `designToDocument(...).roles` (Task 2); `linksToShapes(doc, legacy: Map<StoredBoard, string>)` from `./linksToShapes`; `sameShared` from `./links`; `isShaped`, `pruneShapes`, `dissolveShapes` from `./shapes`.
- Produces: `export function linkByRole(doc: SloydDocument, roles: ReadonlyMap<string, string>): SloydDocument`. After this task `designToDocument` returns `{ doc, rejected, authored }`.

- [ ] **Step 1: Write failing tests** `src/document/roleLinks.test.ts` — through `designToDocument`, because that is the only caller and it owns the role map:

```ts
import { describe, expect, it } from 'vitest';
import { designToDocument } from './generated';
import type { GeneratedAssembly, GeneratedDesign, GeneratedPart } from './generated';
import { isShaped } from './shapes';
import { worldParts } from './tree';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const part = (name: string, role: string, at: [number, number, number], size: [number, number, number]): GeneratedPart =>
  ({ name, role, material: 'oak', at: v(...at), size: v(...size) });
const d = (parts: GeneratedPart[], assemblies: GeneratedAssembly[] = []): GeneratedDesign => ({ name: 'T', parts, assemblies });
const LEG: [number, number, number] = [1.75, 28, 1.75];
const legs = (role = 'leg') => [
  part('Leg 1', role, [0, 0, 0], LEG), part('Leg 2', role, [20, 0, 0], LEG),
  part('Leg 3', role, [0, 0, 20], LEG), part('Leg 4', role, [20, 0, 20], LEG),
];
const shapedNames = (doc: ReturnType<typeof designToDocument>['doc']) =>
  [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)].filter(isShaped).map((b) => b.name).sort();

describe('linkByRole (through designToDocument)', () => {
  it('links equal parts of one role', () => {
    const { doc } = designToDocument(d(legs()));
    expect(doc.shapes).toHaveLength(1);
    expect(shapedNames(doc)).toEqual(['Leg 1', 'Leg 2', 'Leg 3', 'Leg 4']);
  });

  it('leaves a differing part of the role plain', () => {
    const ps = legs();
    ps[3] = part('Leg 4', 'leg', [20, 0, 20], [1.75, 27, 1.75]);
    const { doc } = designToDocument(d(ps));
    expect(shapedNames(doc)).toEqual(['Leg 1', 'Leg 2', 'Leg 3']);
  });

  it('links each class of equal parts within one role separately', () => {
    const { doc } = designToDocument(d([
      part('Case L', 'side', [0, 0, 0], [0.75, 30, 12]), part('Case R', 'side', [20, 0, 0], [0.75, 30, 12]),
      part('Drawer L', 'side', [2, 0, 0], [0.5, 4, 10]), part('Drawer R', 'side', [10, 0, 0], [0.5, 4, 10]),
    ]));
    expect(doc.shapes).toHaveLength(2);
    expect(shapedNames(doc)).toHaveLength(4);
  });

  it('does not link equal parts with different roles', () => {
    const { doc } = designToDocument(d([
      part('Top', 'top', [0, 30, 0], [30, 0.75, 11]), part('Shelf', 'shelf', [0, 10, 0], [30, 0.75, 11]),
    ]));
    expect(doc.shapes).toHaveLength(0);
  });

  it('does not link parts with no role', () => {
    const { doc } = designToDocument(d(legs('')));
    expect(doc.shapes).toHaveLength(0);
  });

  it("treats role spelling drift as one role (review focus 3)", () => {
    const ps = legs();
    ps[0] = { ...ps[0], role: 'Leg' };
    ps[1] = { ...ps[1], role: ' leg ' };
    const { doc } = designToDocument(d(ps));
    expect(shapedNames(doc)).toHaveLength(4);
  });

  it('counts a part in a definition placed 3× as ONE user, so alone it stays plain', () => {
    const { doc } = designToDocument(d([], [{
      name: 'Drawer', parts: [part('Side', 'side', [0, 0, 0], [0.5, 4, 10])],
      placements: [{ name: 'A', at: v(0, 0, 0) }, { name: 'B', at: v(0, 5, 0) }, { name: 'C', at: v(0, 10, 0) }],
    }]));
    expect(doc.shapes).toHaveLength(0);
  });

  it('links a loose part with an equal assembly part of the same role', () => {
    const { doc } = designToDocument(d([part('Leg', 'leg', [30, 0, 0], LEG)], [{
      name: 'Frame', parts: [part('Leg', 'leg', [0, 0, 0], LEG)], placements: [{ name: 'F', at: v(0, 0, 0) }],
    }]));
    expect(doc.shapes).toHaveLength(1);
    expect(isShaped(doc.boards[0])).toBe(true);
    expect(isShaped(doc.definitions[0].boards[0])).toBe(true);
  });

  it('links equal shelves running along X and along Z (rotation is own)', () => {
    const { doc } = designToDocument(d([
      part('Shelf A', 'shelf', [0, 0, 0], [30, 0.75, 11]), part('Shelf B', 'shelf', [0, 5, 0], [11, 0.75, 30]),
    ]));
    expect(doc.shapes).toHaveLength(1);
    const [a, b] = worldParts(doc);
    expect([a.length, a.width, a.thickness, a.posture]).toEqual([b.length, b.width, b.thickness, b.posture]);
  });

  it('never stores a role', () => {
    const { doc } = designToDocument(d(legs(), [{
      name: 'Drawer', parts: [part('Side', 'side', [0, 0, 0], [0.5, 4, 10]), part('Side 2', 'side', [5, 0, 0], [0.5, 4, 10])],
      placements: [{ name: 'A', at: v(0, 30, 0) }],
    }]));
    const keys = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (typeof x === 'object' && x !== null) for (const [k, val] of Object.entries(x)) { keys.add(k); walk(val); }
    };
    walk(doc);
    expect(keys.has('role')).toBe(false);
    expect(JSON.stringify(doc)).not.toMatch(/#\d/); // no class label leaked into a name or id
  });
});
```

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/document/roleLinks.test.ts`

- [ ] **Step 3: Implement** `src/document/roleLinks.ts`:

```ts
import type { Board, SloydDocument, StoredBoard } from './types';
import { sameShared } from './links';
import { linksToShapes } from './linksToShapes';
import { dissolveShapes, isShaped, pruneShapes } from './shapes';

/**
 * Generation's components (generate-assemblies spec §4): parts the model gave
 * the same ROLE whose shared fields are EXACTLY equal (`sameShared`, invariant
 * 18) become users of one Shape. Each role is split into classes of equal
 * parts, labelled `role#k`, and the labels go to `linksToShapes` — the ONE
 * label→shape builder (invariant 45) — so nothing here decides equality but
 * `sameShared`. Users are STORED parts: a part inside a definition counts once
 * however often it is placed, and a one-user shape dissolves.
 *
 * `roles` maps a stored part id to its normalised role. Runs on a migrated
 * document; nothing in it is stored, so the role never reaches the file.
 */
export function linkByRole(doc: SloydDocument, roles: ReadonlyMap<string, string>): SloydDocument {
  if (roles.size === 0) return doc;
  const stored: StoredBoard[] = [...doc.boards, ...doc.definitions.flatMap((x) => x.boards)];
  const classes = new Map<string, Board[]>(); // role → one representative per class
  const labels = new Map<StoredBoard, string>();
  for (const b of stored) {
    if (isShaped(b)) continue;
    const role = roles.get(b.id);
    if (!role) continue;
    const reps = classes.get(role) ?? [];
    classes.set(role, reps);
    let k = reps.findIndex((r) => sameShared(r, b));
    if (k < 0) { k = reps.length; reps.push(b); }
    labels.set(b, `${role}#${k}`);
  }
  return dissolveShapes(pruneShapes(linksToShapes(doc, labels)));
}
```

In `src/document/generated.ts`: import `linkByRole` from `./roleLinks`; change the tail of `designToDocument` to

```ts
  const name = design.name.trim() || 'Generated design';
  const doc = linkByRole(migrateDocument({ ...createDocument(name), boards: loose, instances, definitions }), roles);
  return { doc, rejected, authored: authoredIndex(doc, labelOf) };
```

and drop `roles` from the declared return type. (Linking changes no names, so `authoredIndex` gives the same answer before or after; computing it after keeps it on the returned document.)

In `src/document/linksToShapes.ts`, change the first line of the doc comment from `v10 -> v11 (components spec §2.4): each link label becomes…` to:

```
 * The ONE label→shape builder (invariant 45), with two callers: the v10 -> v11
 * step (components spec §2.4), whose labels are `link` values, and generation's
 * `linkByRole` (generate-assemblies spec §4), whose labels are role classes.
 * Each label becomes…
```

(keep the rest of the comment as is).

- [ ] **Step 4: Run, expect PASS:** `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`. The Task 2 test "survives another migrateDocument unchanged" must still pass with shapes present.

- [ ] **Step 5: Add a round-trip test with shapes** to `roleLinks.test.ts`:

```ts
import { migrateDocument } from './document';
it('a linked generated document survives migrateDocument unchanged', () => {
  const { doc } = designToDocument(d(legs()));
  expect(migrateDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
});
```

- [ ] **Step 6: Mutate:** replace `sameShared(r, b)` with `true` → "leaves a differing part plain" and "each class separately" go red; restore. Remove `.toLowerCase()` in Task 2's `mint` → review-focus-3 test goes red; restore. Remove `dissolveShapes(` → "placed 3× as ONE user" goes red; restore.

- [ ] **Step 7: Commit** — `git add -A src && git commit -m "feat(generate): link same-role identical parts into shared components"` (trailer).

---

### Task 4: Distinct-part cap and collapsing repeated violations

**Files:**
- Create: `src/document/assemblyChecks.ts`, `src/document/assemblyChecks.test.ts`

**Interfaces:**
- Consumes: `Authored` (Task 2), `Violation` from `./designCheck`.
- Produces:
  ```ts
  export function distinctParts(doc: SloydDocument): number
  export function distinctPartsViolation(doc: SloydDocument, cap: number): Violation | null
  export function collapseViolations(violations: readonly Violation[], authored: Authored): Violation[]
  ```

- [ ] **Step 1: Write failing tests** `src/document/assemblyChecks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { collapseViolations, distinctParts, distinctPartsViolation } from './assemblyChecks';
import type { Violation } from './designCheck';
import { designToDocument } from './generated';
import type { Authored, AuthoredPart } from './generated';

const S = ' › ';
const v3 = (x: number, y: number, z: number) => ({ x, y, z });
const P = (name: string) => ({ name, role: '', material: 'pine', at: v3(0, 0, 0), size: v3(4, 4, 4) });

/** Drawer placed as D1..Dn (each with Front, Side), plus loose parts. */
function index(placements: string[], loose: string[] = [], extra: [string, string[]][] = []): Authored {
  const parts = new Map<string, AuthoredPart>();
  for (const l of loose) parts.set(l, { label: l, assembly: null, placement: null });
  const add = (asm: string, pls: string[]) => {
    for (const pl of pls) for (const pt of ['Front', 'Side']) parts.set(`${pl}${S}${pt}`, { label: `${asm}${S}${pt}`, assembly: asm, placement: pl });
  };
  add('Drawer', placements);
  for (const [asm, pls] of extra) add(asm, pls);
  return { parts, placements: new Map([['Drawer', placements], ...extra]) };
}
const overlap = (a: string, b: string): Violation => ({ kind: 'overlap', message: `${a} passes 0.5in into ${b} along X.`, parts: [a, b] });

describe('distinctParts', () => {
  it('counts loose parts plus each definition once', () => {
    const { doc } = designToDocument({ name: 'T', parts: [P('Top')], assemblies: [
      { name: 'Drawer', parts: [P('Front'), P('Side')], placements: [{ name: 'A', at: v3(0, 0, 0) }, { name: 'B', at: v3(10, 0, 0) }, { name: 'C', at: v3(20, 0, 0) }] },
    ] });
    expect(distinctParts(doc)).toBe(3);
  });
  it('reports at cap + 1 and not at cap', () => {
    const parts = Array.from({ length: 12 }, (_, i) => P(`P${i}`));
    const at = designToDocument({ name: 'T', parts, assemblies: [] }).doc;
    const over = designToDocument({ name: 'T', parts: [...parts, P('P12')], assemblies: [] }).doc;
    expect(distinctPartsViolation(at, 12)).toBeNull();
    expect(distinctPartsViolation(over, 12)).toEqual({
      kind: 'too-many-parts', message: "13 distinct parts; the limit is 12 (an assembly's parts count once).", parts: [],
    });
  });
});

describe('collapseViolations', () => {
  it('merges one definition defect in every placement into one "fix the assembly" report', () => {
    const pls = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
    const out = collapseViolations(pls.map((p) => overlap(`${p}${S}Front`, `${p}${S}Side`)), index(pls));
    expect(out).toEqual([{
      kind: 'overlap',
      message: `D1${S}Front passes 0.5in into D1${S}Side along X. (in every placement of Drawer — fix the assembly)`,
      parts: [`Drawer${S}Front`, `Drawer${S}Side`],
    }]);
  });

  it('names the placements when only some have the defect', () => {
    const out = collapseViolations(['D1', 'D3'].map((p) => overlap(`${p}${S}Front`, `${p}${S}Side`)), index(['D1', 'D2', 'D3']));
    expect(out).toHaveLength(1);
    expect(out[0].message.endsWith(' (in D1, D3)')).toBe(true);
  });

  it('never says "fix the assembly" when placements overlap EACH OTHER (review focus 4)', () => {
    const pls = ['D1', 'D2', 'D3'];
    const out = collapseViolations([overlap(`D1${S}Front`, `D2${S}Front`), overlap(`D2${S}Front`, `D3${S}Front`)], index(pls));
    expect(out).toHaveLength(1);
    expect(out[0].message).not.toContain('fix the assembly');
    expect(out[0].message.endsWith(' (in D1, D2, D3)')).toBe(true);
  });

  it('names the one placement of an assembly placed once (review focus 5)', () => {
    const out = collapseViolations([overlap(`D1${S}Front`, `D1${S}Side`)], index(['D1']));
    expect(out[0].message.endsWith(' (in D1)')).toBe(true);
  });

  it('keeps two different defects apart', () => {
    const pls = ['D1', 'D2'];
    const hang = (p: string): Violation => ({ kind: 'hangs', message: `${p}${S}Side is not held.`, parts: [`${p}${S}Side`] });
    const out = collapseViolations([...pls.map((p) => overlap(`${p}${S}Front`, `${p}${S}Side`)), ...pls.map(hang)], index(pls));
    expect(out.map((x) => x.kind)).toEqual(['overlap', 'hangs']);
  });

  it('keeps same-named assemblies apart (review focus 2)', () => {
    const idx = index(['D1'], [], [['Drawer 2', ['E1']]]);
    const out = collapseViolations([overlap(`D1${S}Front`, `D1${S}Side`), overlap(`E1${S}Front`, `E1${S}Side`)], idx);
    expect(out).toHaveLength(2);
  });

  it('passes loose-only and part-less violations through untouched', () => {
    const loose = overlap('Top', 'Shelf');
    const cap: Violation = { kind: 'too-many-parts', message: '49 parts; the limit is 48.', parts: [] };
    const out = collapseViolations([loose, cap], index(['D1'], ['Top', 'Shelf']));
    expect(out[0]).toBe(loose);
    expect(out[1]).toBe(cap);
  });

  it('keeps the original order of first appearance', () => {
    const loose = overlap('Top', 'Shelf');
    const out = collapseViolations([overlap(`D1${S}Front`, `D1${S}Side`), loose, overlap(`D2${S}Front`, `D2${S}Side`)], index(['D1', 'D2'], ['Top', 'Shelf']));
    expect(out.map((x) => x.parts[0])).toEqual([`Drawer${S}Front`, 'Top']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/document/assemblyChecks.test.ts`

- [ ] **Step 3: Implement** `src/document/assemblyChecks.ts`:

```ts
import type { SloydDocument } from './types';
import type { Violation } from './designCheck';
import type { Authored } from './generated';

/**
 * Generation's assembly-aware checks (generate-assemblies spec §5). Written for
 * the model, like designCheck's messages; not a person-facing string, so no
 * `→ units` edge. checkDesign itself is untouched: its maxParts stays PLACED
 * parts, which joinery relies on.
 */

/** Parts the model had to describe: loose parts plus each definition's parts once. */
export function distinctParts(doc: SloydDocument): number {
  return doc.boards.length + doc.definitions.reduce((n, d) => n + d.boards.length, 0);
}

export function distinctPartsViolation(doc: SloydDocument, cap: number): Violation | null {
  const n = distinctParts(doc);
  return n > cap
    ? { kind: 'too-many-parts', message: `${n} distinct parts; the limit is ${cap} (an assembly's parts count once).`, parts: [] }
    : null;
}

/**
 * One fault, one report (invariant 39's rule, across placements): violations
 * whose parts map to the same AUTHORED parts (`Drawer › Front`, not
 * `Drawer 3 › Front`) and share a kind merge into one, keeping the first
 * message and the first-appearance order. The suffix says where:
 * "every placement … fix the assembly" only when EVERY merged violation lies
 * inside a single placement (no loose part, no second placement) and the group
 * covers all of the assembly's placements, of which there are at least two;
 * otherwise the placements involved are listed. A violation with no assembly
 * part, or no parts, passes through as the same object.
 */
export function collapseViolations(violations: readonly Violation[], authored: Authored): Violation[] {
  interface Group { first: Violation; labels: string[]; placements: Set<string>; assemblies: Set<string>; internal: boolean }
  const out: (Violation | Group)[] = [];
  const groups = new Map<string, Group>();
  for (const v of violations) {
    const who = v.parts.map((n) => authored.parts.get(n));
    if (!who.some((a) => a?.assembly)) { out.push(v); continue; }
    const labels = v.parts.map((n, i) => who[i]?.label ?? n);
    const key = JSON.stringify([v.kind, [...labels].sort()]);
    let g = groups.get(key);
    if (!g) {
      g = { first: v, labels, placements: new Set(), assemblies: new Set(), internal: true };
      groups.set(key, g);
      out.push(g);
    }
    const pls = new Set(who.map((a) => a?.placement ?? null));
    if (pls.size !== 1 || pls.has(null)) g.internal = false;
    for (const a of who) if (a?.placement && a.assembly) { g.placements.add(a.placement); g.assemblies.add(a.assembly); }
  }
  return out.map((x) => {
    if (!('first' in x)) return x;
    const [asm] = x.assemblies;
    const all = x.assemblies.size === 1 ? authored.placements.get(asm!) ?? [] : [];
    const every = x.internal && all.length > 1 && all.every((p) => x.placements.has(p));
    const where = every ? ` (in every placement of ${asm} — fix the assembly)` : ` (in ${[...x.placements].join(', ')})`;
    return { kind: x.first.kind, message: `${x.first.message}${where}`, parts: x.labels };
  });
}
```

- [ ] **Step 4: Run, expect PASS:** `npx vitest run src/document/assemblyChecks.test.ts && npm run build 2>&1 | tail -3`

- [ ] **Step 5: Mutate:** drop `x.internal &&` → review-focus-4 goes red; drop `all.length > 1 &&` → review-focus-5 goes red; change `n > cap` to `n >= cap` → "not at cap" goes red; restore each.

- [ ] **Step 6: Commit** — `git add -A src && git commit -m "feat(generate): distinct-part cap and one report per authored fault"` (trailer).

---

### Task 5: Wire into the run, the prompt and the dialog; joinery round trip

**Files:**
- Modify: `src/generate/prompt.ts`, `src/generate/run.ts`, `src/panels/GenerateDialog.tsx`
- Test: `src/generate/prompt.test.ts`, `src/generate/run.test.ts`, `src/generate/joints/runJoinery.test.ts`, `src/panels/GenerateDialog.test.tsx`

**Interfaces:**
- Consumes: `designToDocument` → `{ doc, rejected, authored }` (Task 3); `distinctPartsViolation`, `collapseViolations` (Task 4).
- Produces: `export const PLACED_CEILING = 4; export function placedCeiling(d: Detail): number` in `prompt.ts`; `limitsOf(s).maxParts === placedCeiling(s.detail)`.

- [ ] **Step 1: Write failing tests.**

`src/generate/prompt.test.ts` — update the literal test's middle line to:

```ts
      '- Overall height (Y) at most 72in.\n- At most 30 different parts (an assembly\'s parts count once) and 120 placed parts (moderate detail).\n\nPreferences:\n' +
```

rename that test to `'without a concept, the message matches its pinned literal'`; change `toMatch(/at most 30 parts/i)` to `toMatch(/at most 30 different parts/i)`; change the `limitsOf` expectation to `maxParts: 120`; and add:

```ts
  it('caps placed parts at four times the detail cap', () => {
    expect([placedCeiling('simple'), placedCeiling('moderate'), placedCeiling('detailed')]).toEqual([48, 120, 240]);
  });
  it('teaches assemblies and roles in the fixed system prompt', () => {
    expect(SYSTEM_PROMPT).toContain('"assemblies"');
    expect(SYSTEM_PROMPT).toContain('"role"');
    expect(SYSTEM_PROMPT).toContain('fix the assembly');
  });
```

(import `placedCeiling`).

`src/generate/run.test.ts` — add:

```ts
const v3 = (x: number, y: number, z: number) => ({ x, y, z });
const bp = (name: string, at: [number, number, number], size: [number, number, number]) =>
  ({ name, role: '', material: 'pine', at: v3(...at), size: v3(...size) });
/** A drawer whose Front and Side overlap, placed three times on the floor: one fault, three raw reports. */
const BAD_DRAWERS = {
  name: 'Drawers', parts: [],
  assemblies: [{
    name: 'Drawer',
    parts: [bp('Front', [0, 0, 0], [10, 4, 0.75]), bp('Side', [0, 0, 0], [0.75, 4, 10])],
    placements: [{ name: 'D1', at: v3(0, 0, 0) }, { name: 'D2', at: v3(20, 0, 0) }, { name: 'D3', at: v3(40, 0, 0) }],
  }],
};

describe('runGeneration — assemblies', () => {
  it('returns the tree, with the assembly shared', async () => {
    const { client } = fakeClient([{ ...GOOD, assemblies: BAD_DRAWERS.assemblies }]);
    const out = await run(client);
    expect(out.doc.definitions).toHaveLength(1);
    expect(out.doc.instances).toHaveLength(3);
  });

  it('reports a definition fault once, telling the model to fix the assembly', async () => {
    const { client } = fakeClient([BAD_DRAWERS]);
    const out = await run(client);
    const overlaps = out.violations.filter((x) => x.kind === 'overlap');
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].message).toContain('fix the assembly');
  });

  it('scores "fewest" on merged violations', async () => {
    // BAD_DRAWERS: 1 merged (3 raw). TWO_ISSUES: 2. Merged counting keeps BAD_DRAWERS.
    const { client } = fakeClient([BAD_DRAWERS, TWO_ISSUES]);
    const out = await run(client);
    expect(out.doc.name).toBe('Drawers');
  });

  it('counts an assembly once against the detail cap, and placed parts against the ceiling', async () => {
    const parts = Array.from({ length: 12 }, (_, i) => bp(`P${i}`, [0, i, 0], [10, 1, 10]));
    const placements = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `C${i}`, at: v3(i * 20, 0, 0) }));
    const kinds = async (design: unknown) => (await run(fakeClient([design]).client)).violations.filter((x) => x.kind === 'too-many-parts').map((x) => x.message);
    // 12 distinct × 4 placements = 48 placed: inside both limits (simple: 12 / 48).
    expect(await kinds({ name: 'A', parts: [], assemblies: [{ name: 'Stack', parts, placements: placements(4) }] })).toEqual([]);
    // 12 distinct × 5 = 60 placed: over the ceiling only.
    expect(await kinds({ name: 'B', parts: [], assemblies: [{ name: 'Stack', parts, placements: placements(5) }] })).toEqual(['60 parts; the limit is 48.']);
    // 13 distinct × 1: over the distinct cap only.
    expect(await kinds({ name: 'C', parts: [bp('Extra', [0, 20, 0], [10, 1, 10])], assemblies: [{ name: 'Stack', parts, placements: placements(1) }] }))
      .toEqual(["13 distinct parts; the limit is 12 (an assembly's parts count once)."]);
  });
});
```

`src/generate/joints/runJoinery.test.ts` — add (imports: `designToDocument` already imported; `LlmError` already imported per the existing fallback test):

```ts
describe('runJoinery on a generated assembly', () => {
  it('keeps the definition shared when every copy gets identical joints', async () => {
    const tree = designToDocument({ name: 'Frames', parts: [], assemblies: [{
      name: 'Frame',
      parts: [
        { name: 'Leg', role: '', material: 'oak', at: { x: 0, y: 0, z: 0 }, size: { x: 1.75, y: 28, z: 1.75 } },
        { name: 'Rail', role: '', material: 'oak', at: { x: 1.75, y: 23.5, z: 0.5 }, size: { x: 18, y: 3, z: 0.75 } },
      ],
      placements: [{ name: 'Front', at: { x: 0, y: 0, z: 0 } }, { name: 'Back', at: { x: 0, y: 0, z: 30 } }],
    }] }).doc;
    const out = await run(client(new LlmError('overloaded', 'Overloaded.')), tree);
    if ('noSites' in out) throw new Error('expected sites');
    const doc = out.result.doc;
    expect(doc.definitions).toHaveLength(1);
    expect(doc.instances.map((i) => i.definition)).toEqual([doc.definitions[0].id, doc.definitions[0].id]);
    expect(worldParts(doc).some((b) => b.cuts.length > 0)).toBe(true);
  });
});
```

(If `worldParts` is not imported in that file, import it from `'../../document/tree'`.) If this test fails because the two copies' joints differ, STOP and report — that is a joinery finding, not something to fix in this round (joinery is out of scope).

`src/panels/GenerateDialog.test.tsx` — add:

```ts
it('labels detail caps as different parts', () => {
  // render the dialog the way the file's other tests do, then:
  expect(screen.getByRole('option', { name: 'Simple (up to 12 different parts)' })).toBeTruthy();
});
```

using the file's existing render helper (read the top of the file for it).

- [ ] **Step 2: Run, expect FAIL:** `npx vitest run src/generate src/panels/GenerateDialog.test.tsx`

- [ ] **Step 3: Implement.**

`src/generate/prompt.ts`:

```ts
/** Placed parts may reach this many times the detail cap (spec §5.2); an assembly's parts count once toward the cap itself. */
export const PLACED_CEILING = 4;
export const placedCeiling = (d: Detail) => PLACED_CEILING * DETAIL_CAPS[d];

export function limitsOf(s: GenerateSettings): DesignLimits {
  return { width: s.width, depth: s.depth, height: s.height, maxParts: placedCeiling(s.detail) };
}
```

In `userMessage` replace the cap line with:

```ts
  lines.push(`- At most ${DETAIL_CAPS[s.detail]} different parts (an assembly's parts count once) and ${placedCeiling(s.detail)} placed parts (${s.detail} detail).`);
```

In `SYSTEM_PROMPT`, change the coordinates bullet "Each part is an axis-aligned box…" to stay as is, and insert this block after the `- Give every part a short, distinct, human name …` bullet and before `- Stay within any limits given…`:

```
- Give every part a "role": one short lowercase word for what it is ("leg", "side", "shelf"). Give the same role only to parts that are the same part, such as four identical legs. Use "" for a part with no twin.

Assemblies:
- When a unit of several parts repeats (drawers, doors, identical frames) or forms a natural unit (a base), describe it ONCE under "assemblies" and place it with "placements". Everything else goes under "parts".
- An assembly's parts use the assembly's own coordinates, with its minimum corner at (0, 0, 0). A placement's "at" is where that corner goes. Placements are never turned or mirrored, and an assembly never contains another assembly.
- Give each placement its own name (e.g. "Top drawer", "Drawer 2"). Part names need only be distinct within their assembly.
- An assembly's parts count once toward the part limit, however many times it is placed.
- In feedback, a part inside a placement is named "Placement › Part". A report ending "fix the assembly" means change the assembly's parts, which changes every placement.
```

`src/generate/run.ts` — imports: add `import { collapseViolations, distinctPartsViolation } from '../document/assemblyChecks';`; add `DETAIL_CAPS` to the `./prompt` import (`flatDocument` was imported in Task 2). Replace `runGeneration`'s `evaluate` — this adds the distinct check and the collapse to Task 2's version:

```ts
    evaluate: (res) => {
      const design = res.json === null ? null : parseDesign(res.json);
      const converted = design && designToDocument(design);
      if (!converted) return { value: null, feedback: unusableMessage(res.unusable ?? 'unparseable') };
      // Checks read the placed world (spec §5.1); the TREE is what is kept.
      const flat = flatDocument(converted.doc);
      // Every part rejected: unusable, and never a `best` — a zero-board
      // document is not a prototype.
      if (flat.boards.length === 0) return { value: null, feedback: repairMessage(rejectedViolations(converted.rejected)) };
      const distinct = distinctPartsViolation(converted.doc, DETAIL_CAPS[settings.detail]);
      // Merged per authored part, so "fewest" is not biased by placement count (spec §5.3).
      const violations = [
        ...rejectedViolations(converted.rejected),
        ...(distinct ? [distinct] : []),
        ...collapseViolations(checkDesign(flat, limits), converted.authored),
      ];
      return { value: { doc: converted.doc, violations }, feedback: repairMessage(violations) };
    },
```

Update the `runGeneration` doc comment to: `/** One generation: design → tree → check the placed world → feedback, via the shared loop (spec §4.5; generate-assemblies spec §5). */`

`src/panels/GenerateDialog.tsx` line ~136: `` `${d[0].toUpperCase()}${d.slice(1)} (up to ${DETAIL_CAPS[d]} different parts)` ``.

- [ ] **Step 4: Run, expect PASS:** `npm test 2>&1 | tail -5 && npm run build 2>&1 | tail -3`. Existing `run.test.ts` tests that read `out.doc.boards` still pass (flat designs keep root boards). Fix any other test that pinned the old label or the old cap line — and list each one in the report.

- [ ] **Step 5: Mutate:** in `evaluate`, replace `collapseViolations(checkDesign(flat, limits), converted.authored)` with `checkDesign(flat, limits)` → "fewest on merged" and "reports once" go red; restore. Change `PLACED_CEILING` to 5 → ceiling test and literal go red; restore.

- [ ] **Step 6: Commit** — `git add -A src && git commit -m "feat(generate): assemblies reach the run, the prompt and the dialog"` (trailer).

---

### Task 6: Live check, docs, merge

**Files:** `docs/browser-verification-generate-assemblies.md` (create), `CLAUDE.md`, `docs/history.md`, `docs/follow-ups.md`.

- [ ] **Step 1: Whole-suite gate:** `npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3` — record the test count.

- [ ] **Step 2: Live check on the dev server** (Playwright MCP; the user watches; see memory "Browser verification on this VPS"). `npm run dev -- --port 5199` in the background. **Ask the user before the paid run** and have them enter the key themselves if none is set; the key never goes into chat. Generate one design, description "A three-drawer chest", detail Moderate, 1 generation. Confirm by DOM readout, not by eye:
  - the parts list shows an assembly row with three placements of one definition;
  - an edit inside one drawer (e.g. a part's length in Properties) changes the same part in the other two (read each placement's part dimension);
  - same-role parts (legs/sides) show as linked;
  - the run's issue count.
  Optionally, with a second approval, one joinery run on the result: the definition stays shared where copies are identical. Then clear `localStorage` in the verifying browser and confirm it is empty. Record everything (including what could not be confirmed) in `docs/browser-verification-generate-assemblies.md`; add a screenshot under `docs/img/` only for the parts-list structure.

- [ ] **Step 3: CLAUDE.md** — in invariant 45, after "`linkPlan` is the ONE Link decider.", add: "`linksToShapes` is the ONE label→shape builder, with two callers: the v10→v11 step and generation's `linkByRole`; both judge equality by `sameShared` only." Add `roleLinks.ts` and `assemblyChecks.ts` to "Where things live" under `document/`, and to `generated.ts`'s line add "assemblies → tree, `Authored`". Update the Commands test count. Status and the Rounds row wait for the deploy.

- [ ] **Step 4: `docs/history.md`** — a round entry: what shipped, the user's rulings (spec §1), the live pass's results and limits. **`docs/follow-ups.md`** — add next-numbered entries for anything left open (at least: nested assemblies and turned placements out of scope by decision; generation still emits only 0°/90° parts).

- [ ] **Step 5: Commit docs**, then merge locally:

```bash
git add -A docs CLAUDE.md && git commit -m "docs: generate assemblies — live check, invariant 45 amendment, history" # + trailer
git checkout master && git merge --no-ff generate-assemblies -m "Merge branch 'generate-assemblies': assemblies and components in generated prototypes" # + trailer
npm test 2>&1 | tail -3 && npm run build 2>&1 | tail -3
git branch -d generate-assemblies
```

- [ ] **Step 6: Deploy is a separate decision.** Report to the user and ask before `docker compose up -d --build` (read `DEPLOYMENT.local.md` first; verify per CLAUDE.md's deployment rule; then update Status and the Rounds table, no schema bump to note).
